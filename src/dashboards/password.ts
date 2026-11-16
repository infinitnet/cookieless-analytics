/** Share passwords: PBKDF2 verifier peppered with the link secret, a per-isolate credential cache, and the KV lock. */
import { base64url, type KvLike, sha256, timingSafeEqual } from "../core/crypto.js";
import { SHARE_LOCK_FAILURES, SHARE_LOCK_MINUTES } from "./schema.js";

/**
 * Workers rejects more than 100,000 and the Free plan has 10 ms CPU; the token pepper makes this count
 * a reused-password guard only.
 */
export const SHARE_PBKDF2_ITERATIONS = 10000;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

export interface PasswordRecord {
	/** base64url of 16 random bytes. */
	salt: string;
	iter: number;
	/** hex of 32 bytes. */
	verifier: string;
}

const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export function fromBase64url(s: string): Uint8Array {
	const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** PBKDF2-SHA-256(password, salt16 || secretBytes, iter, 256 bits) as hex. */
export async function derive(password: string, salt16: Uint8Array, secretBytes: Uint8Array, iter: number): Promise<string> {
	const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
	const salt = new Uint8Array(salt16.length + secretBytes.length);
	salt.set(salt16);
	salt.set(secretBytes, salt16.length);
	return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256)));
}

/** Password length in characters (code points), 8 to 128. */
export const passwordOk = (p: string) => [...p].length >= MIN_PASSWORD && [...p].length <= MAX_PASSWORD;

export async function makeVerifier(password: string, secret: string): Promise<PasswordRecord> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return { salt: base64url(salt), iter: SHARE_PBKDF2_ITERATIONS, verifier: await derive(password, salt, fromBase64url(secret), SHARE_PBKDF2_ITERATIONS) };
}

/** Constant-time check; the stored `iter` is used, so the constant can change without a migration. */
export async function verify(pw: PasswordRecord, password: string, secret: string): Promise<boolean> {
	return timingSafeEqual(await derive(password, fromBase64url(pw.salt), fromBase64url(secret), pw.iter), pw.verifier);
}

const CACHE_MS = 10 * 60_000;
export const CACHE_MAX = 200;
/** Share id to `SHA-256(secret || password)` of the last success; insertion order is age order. */
const cache = new Map<string, { key: string; at: number }>();

/** Verify through the credential cache: a repeated success within 10 minutes skips the derivation. A failure is never cached. */
export async function checkPassword(shareId: string, pw: PasswordRecord, password: string, secret: string, nowMs = Date.now()): Promise<boolean> {
	const key = hex(await sha256(secret + password));
	const hit = cache.get(shareId);
	if (hit && nowMs - hit.at < CACHE_MS && timingSafeEqual(hit.key, key)) return true;
	if (!(await verify(pw, password, secret))) return false;
	cache.delete(shareId);
	cache.set(shareId, { key, at: nowMs });
	while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
	return true;
}

export const credentialCacheSize = () => cache.size;
export const clearCredentialCache = () => cache.clear();

/** `share:lock:<id>`; times in epoch seconds. No IP or user agent is stored. */
interface Lock {
	fails: number;
	since: number;
	until?: number;
}
const lockKey = (id: string) => `share:lock:${id}`;
const WINDOW = SHARE_LOCK_MINUTES * 60;

/** Seconds until the lock ends, or 0 when the share is not locked. */
export async function lockedFor(kv: KvLike, id: string, now: number): Promise<number> {
	const l = await kv.get<Lock>(lockKey(id));
	return l?.until && l.until > now ? l.until - now : 0;
}

/**
 * Count a failed attempt in the 15 minute window; the tenth locks for 15 minutes. Returns the lock seconds, or 0.
 * shortcut: read-modify-write in KV (no atomic increment), so parallel guesses can exceed 10 per window; the
 * Cloudflare rate limiting rule on `sharePath` is the real bound (docs/dashboards.md).
 */
export async function recordFailure(kv: KvLike, id: string, now: number): Promise<number> {
	const l = await kv.get<Lock>(lockKey(id));
	const fresh = !l || now - l.since >= WINDOW || (l.until !== undefined && l.until <= now);
	const next: Lock = fresh ? { fails: 1, since: now } : { fails: l.fails + 1, since: l.since };
	if (next.fails >= SHARE_LOCK_FAILURES) next.until = now + WINDOW;
	await kv.set(lockKey(id), next);
	return next.until ? WINDOW : 0;
}

/** A success with earlier failures clears the record. */
export async function resetFailures(kv: KvLike, id: string): Promise<void> {
	const l = await kv.get<Lock>(lockKey(id));
	if (l && l.fails > 0) await kv.delete(lockKey(id));
}
