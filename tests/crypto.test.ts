import { describe, expect, it } from "vitest";
import { base64url, deleteSaltsOlderThan, getOrCreateSalt, hmacSha256, randomId, timingSafeEqual, truncateIp, vkey } from "../src/core/crypto.js";
import { MemoryKv } from "./helpers.js";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

describe("ids and hashes", () => {
	it("generates [a-z0-9] ids of the requested length", () => {
		const ids = new Set(Array.from({ length: 200 }, () => randomId(20)));
		expect(ids.size).toBe(200);
		for (const id of ids) expect(id).toMatch(/^[a-z0-9]{20}$/);
		expect(randomId(12)).toMatch(/^[a-z0-9]{12}$/);
	});

	it("computes HMAC-SHA256 (RFC 4231 case 2)", async () => {
		expect(hex(await hmacSha256("Jefe", "what do ya want for nothing?"))).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
	});

	it("encodes base64url without padding", () => {
		expect(base64url(new Uint8Array([251, 255, 191]))).toBe("-_-_");
		expect(base64url(new Uint8Array([1]))).toBe("AQ");
	});

	it("derives a stable 22 char vkey that changes with salt, site, ip prefix and ua", async () => {
		const a = await vkey("salt-1", "default", "203.0.113.0", "Chrome/142|Windows|desktop");
		expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(await vkey("salt-1", "default", "203.0.113.0", "Chrome/142|Windows|desktop")).toBe(a);
		expect(await vkey("salt-2", "default", "203.0.113.0", "Chrome/142|Windows|desktop")).not.toBe(a);
		expect(await vkey("salt-1", "blog", "203.0.113.0", "Chrome/142|Windows|desktop")).not.toBe(a);
		expect(await vkey("salt-1", "default", "203.0.114.0", "Chrome/142|Windows|desktop")).not.toBe(a);
		expect(await vkey("salt-1", "default", "203.0.113.0", "Firefox/145|Windows|desktop")).not.toBe(a);
	});

	it("compares in constant time", async () => {
		expect(timingSafeEqual("abc", "abc")).toBe(true);
		expect(timingSafeEqual("abc", "abd")).toBe(false);
		expect(timingSafeEqual("abc", "ab")).toBe(false);
	});
});

describe("truncateIp", () => {
	it.each([
		["203.0.113.77", "standard", "203.0.113.0"],
		["203.0.113.77", "strict", "203.0.0.0"],
		["::ffff:198.51.100.9", "standard", "198.51.100.0"],
		// The hex notation of an IPv4-mapped address (the WHATWG URL serializer prints it) is the same IPv4 address.
		["::ffff:c633:6409", "standard", "198.51.100.0"],
		["::FFFF:C633:6409", "strict", "198.51.0.0"],
		["0:0:0:0:0:ffff:c633:6409", "standard", "198.51.100.0"],
		["0000:0000:0000:0000:0000:ffff:198.051.100.009", "standard", "198.51.100.0"],
		["::ffff:7f00:1", "standard", "127.0.0.0"],
		["::ffff:999.1.1.1", "standard", ""],
		// Only the mapped prefix carries a dotted tail.
		["::198.51.100.9", "standard", ""],
		["64:ff9b::198.51.100.9", "standard", ""],
		["::fffe:c633:6409", "standard", "0:0:0::"],
		["2001:db8:abcd:12:1:2:3:4", "standard", "2001:db8:abcd::"],
		["2001:db8:abcd:12:1:2:3:4", "strict", "2001:db8::"],
		["2001:DB8::1", "standard", "2001:db8:0::"],
		["fe80::1%eth0", "standard", "fe80:0:0::"],
		["::1", "standard", "0:0:0::"],
		["999.1.1.1", "standard", ""],
		["not an ip", "standard", ""],
		["", "standard", ""],
	] as const)("%s (%s) -> %s", (ip, mode, out) => {
		expect(truncateIp(ip, mode)).toBe(out);
	});
});

describe("salts", () => {
	it("creates a salt once and agrees under concurrency", async () => {
		const kv = new MemoryKv();
		const [a, b] = await Promise.all([getOrCreateSalt(kv, "2026-01-01"), getOrCreateSalt(kv, "2026-01-01")]);
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(b).toBe(a);
		expect(await kv.get("salt:2026-01-01")).toBe(a);
		expect(await getOrCreateSalt(kv, "2026-01-02")).not.toBe(a);
	});

	it("takes the stored value when another isolate won the race", async () => {
		const kv = new MemoryKv();
		await kv.set("salt:2026-02-01", "winner");
		expect(await getOrCreateSalt(kv, "2026-02-01")).toBe("winner");
	});

	it("deletes salts older than the cutoff day", async () => {
		const kv = new MemoryKv();
		for (const d of ["2026-03-01", "2026-03-02", "2026-03-03"]) await getOrCreateSalt(kv, d);
		await kv.set("other", 1);
		expect(await deleteSaltsOlderThan(kv, "2026-03-02")).toBe(1);
		expect([...kv.data.keys()].sort()).toEqual(["other", "salt:2026-03-02", "salt:2026-03-03"]);
		// A deleted salt is gone for good: the next request creates a fresh one.
		const fresh = await getOrCreateSalt(kv, "2026-03-01");
		expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});
});
