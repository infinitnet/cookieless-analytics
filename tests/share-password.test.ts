/** Share password verifier, credential cache and lock. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base64url } from "../src/core/crypto.js";
import {
	CACHE_MAX,
	checkPassword,
	clearCredentialCache,
	credentialCacheSize,
	derive,
	fromBase64url,
	lockedFor,
	makeVerifier,
	recordFailure,
	resetFailures,
	SHARE_PBKDF2_ITERATIONS,
	verify,
} from "../src/dashboards/password.js";
import { generateToken } from "../src/keys/token.js";
import { MemoryKv } from "./helpers.js";

beforeEach(() => clearCredentialCache());
afterEach(() => vi.restoreAllMocks());

describe("share password verifier", () => {
	it("stores salt, iter and a 32 byte hex verifier and verifies only the right password", async () => {
		const { secret } = generateToken();
		const pw = await makeVerifier("correct horse", secret);
		expect(pw.iter).toBe(SHARE_PBKDF2_ITERATIONS);
		expect(SHARE_PBKDF2_ITERATIONS).toBe(10000);
		expect(fromBase64url(pw.salt)).toHaveLength(16);
		expect(pw.verifier).toMatch(/^[0-9a-f]{64}$/);
		expect(await verify(pw, "correct horse", secret)).toBe(true);
		expect(await verify(pw, "correct horsE", secret)).toBe(false);
		// The link secret is part of the salt: the verifier is useless without the link.
		expect(await verify(pw, "correct horse", generateToken().secret)).toBe(false);
	});

	it("gives a different verifier for the same password under two links", async () => {
		const a = await makeVerifier("same password", generateToken().secret);
		const b = await makeVerifier("same password", generateToken().secret);
		expect(a.verifier).not.toBe(b.verifier);
	});

	it("matches PBKDF2 over salt16 || secretBytes", async () => {
		const salt = new Uint8Array(16).fill(1);
		const secret = new Uint8Array(32).fill(2);
		const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("pässwörd"), "PBKDF2", false, ["deriveBits"]);
		const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array([...salt, ...secret]), iterations: 1000 }, key, 256);
		const want = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
		expect(await derive("pässwörd", salt, secret, 1000)).toBe(want);
	});

	it("honors the stored iter after the constant changes", async () => {
		const { secret } = generateToken();
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const pw = { salt: base64url(salt), iter: 5000, verifier: await derive("old record pw", salt, fromBase64url(secret), 5000) };
		const spy = vi.spyOn(crypto.subtle, "deriveBits");
		expect(await verify(pw, "old record pw", secret)).toBe(true);
		expect((spy.mock.calls[0]?.[0] as { iterations: number }).iterations).toBe(5000);
	});
});

describe("credential cache", () => {
	it("skips the derivation on the second success and never caches a failure", async () => {
		const { secret } = generateToken();
		const pw = await makeVerifier("letmein123", secret);
		const spy = vi.spyOn(crypto.subtle, "deriveBits");
		expect(await checkPassword("s1", pw, "wrong pass", secret)).toBe(false);
		expect(await checkPassword("s1", pw, "wrong pass", secret)).toBe(false);
		expect(spy).toHaveBeenCalledTimes(2);
		expect(await checkPassword("s1", pw, "letmein123", secret)).toBe(true);
		expect(spy).toHaveBeenCalledTimes(3);
		expect(await checkPassword("s1", pw, "letmein123", secret)).toBe(true);
		expect(spy).toHaveBeenCalledTimes(3);
		// A wrong password after a cached success still derives and fails.
		expect(await checkPassword("s1", pw, "wrong pass", secret)).toBe(false);
		expect(spy).toHaveBeenCalledTimes(4);
	});

	it("expires after 10 minutes and is bounded", async () => {
		const { secret } = generateToken();
		const pw = { ...(await makeVerifier("letmein123", secret)), iter: 1 };
		pw.verifier = await derive("letmein123", fromBase64url(pw.salt), fromBase64url(secret), 1);
		const spy = vi.spyOn(crypto.subtle, "deriveBits");
		await checkPassword("s1", pw, "letmein123", secret, 0);
		await checkPassword("s1", pw, "letmein123", secret, 9 * 60_000);
		expect(spy).toHaveBeenCalledTimes(1);
		await checkPassword("s1", pw, "letmein123", secret, 11 * 60_000);
		expect(spy).toHaveBeenCalledTimes(2);
		for (let i = 0; i < CACHE_MAX + 20; i++) await checkPassword(`x${i}`, pw, "letmein123", secret, 0);
		expect(credentialCacheSize()).toBe(CACHE_MAX);
	});
});

describe("share lock", () => {
	it("locks on the tenth failure within 15 minutes, per share, and expires", async () => {
		const kv = new MemoryKv();
		for (let i = 1; i < 10; i++) expect(await recordFailure(kv, "a", 1000 + i)).toBe(0);
		expect(await lockedFor(kv, "a", 1010)).toBe(0);
		expect(await recordFailure(kv, "a", 1010)).toBe(900);
		expect(await lockedFor(kv, "a", 1011)).toBe(899);
		expect(await lockedFor(kv, "b", 1011)).toBe(0);
		expect(await lockedFor(kv, "a", 1010 + 900)).toBe(0);
		// After the lock a new window starts.
		expect(await recordFailure(kv, "a", 1010 + 901)).toBe(0);
		expect(await kv.get("share:lock:a")).toEqual({ fails: 1, since: 1911 });
	});

	it("starts a new window after 15 minutes and resets on success", async () => {
		const kv = new MemoryKv();
		for (let i = 0; i < 9; i++) await recordFailure(kv, "a", 0);
		expect(await recordFailure(kv, "a", 900)).toBe(0);
		await resetFailures(kv, "a");
		expect(await kv.get("share:lock:a")).toBeNull();
	});
});
