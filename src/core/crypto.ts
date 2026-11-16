/** Web Crypto helpers: ids, HMAC, IP truncation, visitor key, daily salts. */

/** Structural subset of the host `ctx.kv` (KVAccess) used by this plugin. */
export interface KvLike {
	get<T>(key: string): Promise<T | null>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<boolean>;
	list(prefix?: string): Promise<Array<{ key: string; value: unknown }>>;
	compareAndSet(key: string, expectedRevision: string | null, value: unknown): Promise<{ applied: boolean }>;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random `[a-z0-9]{n}` from `crypto.getRandomValues` (rejection sampling, no modulo bias). */
export function randomId(n: number): string {
	let out = "";
	while (out.length < n) {
		const bytes = crypto.getRandomValues(new Uint8Array(n * 2));
		for (const b of bytes) {
			if (b < 252 && out.length < n) out += ALPHABET[b % 36];
		}
	}
	return out;
}

const enc = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hmacSha256(key: string | Uint8Array, message: string): Promise<Uint8Array> {
	const raw = typeof key === "string" ? enc.encode(key) : key;
	const k = await crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

export async function sha256(message: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(message)));
}

/** Constant-time string compare (length leak only). */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

function expandIpv6(ip: string): number[] | null {
	const parts = ip.split("::");
	if (parts.length > 2) return null;
	const head = parts[0] ? parts[0].split(":") : [];
	const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
	const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
	if (fill < 0 || (parts.length === 1 && head.length !== 8)) return null;
	const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
	if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
	return groups.map((g) => Number.parseInt(g, 16));
}

/**
 * Truncate an IP to its network prefix: IPv4 /24 (strict /16), IPv6 /48 (strict /32).
 * Unparseable input returns "" so it still hashes but never leaks.
 */
export function truncateIp(ip: string | null | undefined, mode: "standard" | "strict" = "standard"): string {
	if (!ip) return "";
	let v = ip.trim().toLowerCase();
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
	if (mapped?.[1]) v = mapped[1];
	const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
	if (v4) {
		const o = v4.slice(1, 5).map(Number);
		if (o.some((n) => n > 255)) return "";
		return mode === "strict" ? `${o[0]}.${o[1]}.0.0` : `${o[0]}.${o[1]}.${o[2]}.0`;
	}
	const g = expandIpv6(v.replace(/%.*$/, ""));
	if (!g) return "";
	const keep = mode === "strict" ? 2 : 3;
	return `${g.slice(0, keep).map((n) => n.toString(16)).join(":")}::`;
}

/** True when `ip` lies inside `cidr` (IPv4 or IPv6, already validated by settings). */
export function ipInCidr(ip: string, cidr: string): boolean {
	const [net = "", bitsRaw = ""] = cidr.split("/");
	const bits = Number(bitsRaw);
	const words = (v: string): number[] | null => {
		const m = v.trim().toLowerCase().replace(/^::ffff:(?=\d+\.)/, "");
		const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(m);
		if (v4) return v4.slice(1, 5).map(Number);
		const g = expandIpv6(m.replace(/%.*$/, ""));
		return g ? g.flatMap((n) => [n >> 8, n & 255]) : null;
	};
	const a = words(ip);
	const b = words(net);
	if (!a || !b || a.length !== b.length || !(bits >= 0 && bits <= a.length * 8)) return false;
	for (let i = 0; i < a.length; i++) {
		const keep = Math.max(0, Math.min(8, bits - i * 8));
		const mask = keep === 0 ? 0 : (0xff << (8 - keep)) & 0xff;
		if (((a[i] as number) & mask) !== ((b[i] as number) & mask)) return false;
	}
	return true;
}

/** Daily visitor key: base64url(HMAC-SHA256(salt, site|ipTrunc|uaNorm)) truncated to 22 chars. */
export async function vkey(salt: string, site: string, ipTrunc: string, uaNorm: string): Promise<string> {
	return base64url(await hmacSha256(salt, `${site}|${ipTrunc}|${uaNorm}`)).slice(0, 22);
}

const SALT_PREFIX = "salt:";
const saltCache = new Map<string, string>();

/** Salt for a salt day, created lazily with compare-and-set so concurrent isolates agree. */
export async function getOrCreateSalt(kv: KvLike, day: string): Promise<string> {
	const cached = saltCache.get(day);
	if (cached) return cached;
	const key = SALT_PREFIX + day;
	let salt = await kv.get<string>(key);
	if (!salt) {
		const fresh = base64url(crypto.getRandomValues(new Uint8Array(32)));
		const res = await kv.compareAndSet(key, null, fresh);
		salt = res.applied ? fresh : await kv.get<string>(key);
		if (!salt) throw new Error("salt unavailable");
	}
	if (saltCache.size > 8) saltCache.clear();
	saltCache.set(day, salt);
	return salt;
}

/** Delete salts of days strictly before `cutoffDay`. Returns the number deleted. */
export async function deleteSaltsOlderThan(kv: KvLike, cutoffDay: string): Promise<number> {
	let n = 0;
	for (const { key } of await kv.list(SALT_PREFIX)) {
		const day = key.slice(key.lastIndexOf(SALT_PREFIX) + SALT_PREFIX.length);
		if (day < cutoffDay) {
			await kv.delete(key);
			saltCache.delete(day);
			n++;
		}
	}
	return n;
}
