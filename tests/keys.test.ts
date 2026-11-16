import { PluginRouteError } from "emdash";
import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "../src/keys/ratelimit.js";
import { SCOPES } from "../src/keys/scopes.js";
import { type ApiKey, createKey, listKeys, MAX_KEYS, revokeKey, TOUCH_SECONDS, verifyKey } from "../src/keys/store.js";
import { generateToken, hashSecret, parseToken } from "../src/keys/token.js";
import { createPlugin } from "../src/index.js";
import { KeyCreateBody, type KeysCtx, keyRoutes } from "../src/routes/keys.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { sitesColl } from "./helpers.js";
import { memColl, T0 } from "./agent.helpers.js";

describe("tokens", () => {
	it("are an 8 char prefix and a 32 byte base64url secret", () => {
		const t = generateToken();
		expect(t.token).toMatch(/^[a-z0-9]{8}\.[A-Za-z0-9_-]{43}$/);
		expect(parseToken(t.token)).toEqual({ prefix: t.prefix, secret: t.secret });
		expect(generateToken().token).not.toBe(t.token);
	});

	it("parse rejects malformed values", () => {
		for (const bad of [null, "", "abc", "ABCDEFGH.x", `${"a".repeat(8)}.${"b".repeat(42)}`, `${"a".repeat(8)}:${"b".repeat(43)}`, `Bearer ${"a".repeat(8)}.${"b".repeat(43)}`])
			expect(parseToken(bad)).toBeNull();
	});

	it("hash is hex SHA-256", async () => {
		expect(await hashSecret("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
	});
});

describe("key store", () => {
	it("stores the prefix and the hash, never the token or the secret", async () => {
		const c = memColl();
		const { token, key } = await createKey(c, { label: "deploy", scopes: ["write:annotations", "write:annotations"] }, T0);
		const stored = [...c.items.values()][0] as ApiKey;
		const secret = token.split(".")[1] as string;
		expect(JSON.stringify(stored)).not.toContain(secret);
		expect(stored.hash).toBe(await hashSecret(secret));
		expect(stored).toMatchObject({ prefix: token.slice(0, 8), scopes: ["write:annotations"], created: T0, expires: null, last_used: null, revoked: false });
		expect(key).not.toHaveProperty("hash");
		const list = await listKeys(c);
		expect(JSON.stringify(list)).not.toContain(secret);
		expect(list[0]).not.toHaveProperty("hash");
	});

	it("verifies the right token and rejects wrong, revoked and expired ones alike", async () => {
		const c = memColl();
		const { token, key } = await createKey(c, { label: "a", scopes: ["read:analytics"], expires: T0 + 100 }, T0);
		expect(await verifyKey(c, token, T0)).toEqual({ id: key.id, scopes: ["read:analytics"], sites: [] });
		const wrong = `${token.slice(0, 9)}${token[9] === "A" ? "B" : "A"}${token.slice(10)}`;
		expect(await verifyKey(c, wrong, T0)).toBeNull();
		expect(await verifyKey(c, `zzzzzzzz${token.slice(8)}`, T0)).toBeNull();
		expect(await verifyKey(c, token, T0 + 100)).toBeNull();
		const live = await createKey(c, { label: "b", scopes: ["read:analytics"] }, T0);
		await revokeKey(c, live.key.id);
		expect(await verifyKey(c, live.token, T0)).toBeNull();
		expect(await revokeKey(c, "unknown")).toBeNull();
	});

	it("a last_used write cannot undo a revoke that lands between read and write", async () => {
		const c = memColl();
		const { token, key } = await createKey(c, { label: "a", scopes: ["read:analytics"] }, T0);
		const query = c.query.bind(c);
		// The admin revokes right after verifyKey has read the key.
		c.query = async (o) => {
			const r = await query(o);
			await revokeKey(c, key.id);
			return r;
		};
		await verifyKey(c, token, T0);
		c.query = query;
		expect(c.items.get(key.id)).toMatchObject({ revoked: true, last_used: T0 });
		expect(await verifyKey(c, token, T0 + 1)).toBeNull();
	});

	it("writes last_used at most once per 10 minutes", async () => {
		const c = memColl();
		const { token, key } = await createKey(c, { label: "a", scopes: ["read:analytics"] }, T0);
		const before = c.puts;
		await verifyKey(c, token, T0);
		expect(c.puts).toBe(before + 1);
		await verifyKey(c, token, T0 + 60);
		await verifyKey(c, token, T0 + TOUCH_SECONDS - 1);
		expect(c.puts).toBe(before + 1);
		expect((c.items.get(key.id) as ApiKey).last_used).toBe(T0);
		await verifyKey(c, token, T0 + TOUCH_SECONDS);
		expect(c.puts).toBe(before + 2);
	});
});

describe("rate limiter", () => {
	it("allows the limit per minute per key, then reports the wait", () => {
		const hit = createRateLimiter();
		for (let i = 0; i < 3; i++) expect(hit("k", 3, 1000 + i)).toBe(0);
		expect(hit("k", 3, 2000)).toBe(59);
		expect(hit("other", 3, 2000)).toBe(0);
		expect(hit("k", 3, 61_001)).toBe(0);
	});
});

describe("keys routes", () => {
	const ctx = (input: unknown, api_keys = memColl()): KeysCtx => ({ input, storage: { api_keys } });

	it("are plugins:manage and registered on the plugin", () => {
		const plugin = createPlugin() as unknown as { routes: Record<string, { permission?: string; public?: boolean }> };
		for (const n of ["keys/list", "keys/create", "keys/revoke", "keys/delete"]) {
			expect(plugin.routes[n]?.permission).toBe("plugins:manage");
			expect(plugin.routes[n]?.public).toBeUndefined();
		}
	});

	it("create returns the token once; list and revoke never return it", async () => {
		const c = memColl();
		const r = keyRoutes({ now: () => T0 });
		const log = vi.spyOn(console, "log");
		const created = await r["keys/create"].handler(ctx(KeyCreateBody.parse({ label: " CI ", scopes: ["read:analytics", "read:search"] }), c));
		expect(created.token).toMatch(/^[a-z0-9]{8}\./);
		expect(created.key).toMatchObject({ label: "CI", scopes: ["read:analytics", "read:search"] });
		const listed = await r["keys/list"].handler(ctx({}, c));
		const revoked = await r["keys/revoke"].handler(ctx({ id: created.key.id }, c));
		for (const out of [listed, revoked]) expect(JSON.stringify(out)).not.toContain(created.token.slice(9));
		expect(listed.items[0]).not.toHaveProperty("hash");
		expect(revoked.key.revoked).toBe(true);
		expect(JSON.stringify(log.mock.calls)).not.toContain(created.token.slice(9));
		log.mockRestore();
	});

	it("deletes a revoked key only, which frees its place under the cap", async () => {
		const c = memColl();
		const r = keyRoutes({ now: () => T0 });
		for (let i = 0; i < MAX_KEYS; i++) await r["keys/create"].handler(ctx({ label: `k${i}`, scopes: ["read:analytics"] }, c));
		await expect(r["keys/create"].handler(ctx({ label: "one more", scopes: ["read:analytics"] }, c))).rejects.toMatchObject({ code: "too_many_keys", message: expect.stringContaining("per install") });
		const [first] = (await r["keys/list"].handler(ctx({}, c))).items;
		const id = first?.id as string;
		await expect(r["keys/delete"].handler(ctx({ id }, c))).rejects.toMatchObject({ code: "not_revoked", status: 400 });
		await r["keys/revoke"].handler(ctx({ id }, c));
		expect(await r["keys/delete"].handler(ctx({ id }, c))).toEqual({ id, deleted: true });
		await expect(r["keys/delete"].handler(ctx({ id }, c))).rejects.toMatchObject({ code: "not_found", status: 404 });
		expect((await r["keys/create"].handler(ctx({ label: "one more", scopes: ["read:analytics"] }, c))).key.label).toBe("one more");
	});

	it("validates label, scopes and expiry", async () => {
		expect(KeyCreateBody.safeParse({ label: "", scopes: ["read:analytics"] }).success).toBe(false);
		expect(KeyCreateBody.safeParse({ label: "a", scopes: [] }).success).toBe(false);
		expect(KeyCreateBody.safeParse({ label: "a", scopes: ["admin"] }).success).toBe(false);
		expect(KeyCreateBody.safeParse({ label: "a", scopes: [...SCOPES], extra: 1 }).success).toBe(false);
		const r = keyRoutes({ now: () => T0 });
		const err = await r["keys/create"].handler(ctx({ label: "a", scopes: ["read:analytics"], expires: T0 })).catch((e) => e);
		expect(err).toBeInstanceOf(PluginRouteError);
		expect(err).toMatchObject({ code: "invalid_expiry" });
		const missing = await r["keys/revoke"].handler(ctx({ id: "nope" })).catch((e) => e);
		expect(missing).toMatchObject({ code: "not_found", status: 404 });
	});

	it("restricts a key to local-database sites validated at creation", async () => {
		invalidateRegistry();
		const c = memColl();
		const r = keyRoutes({ now: () => T0, settings: async () => ({ siteId: "default" }) });
		const sites = sitesColl([{ id: "blog" }]);
		const make = (input: unknown) => r["keys/create"].handler({ input: KeyCreateBody.parse(input), storage: { api_keys: c, sites } });
		const created = await make({ label: "Blog", scopes: ["read:analytics"], sites: ["blog", "default"] });
		expect(created.key.sites).toEqual(["blog", "default"]);
		expect((await make({ label: "All", scopes: ["read:analytics"] })).key.sites).toEqual([]);
		await expect(make({ label: "Bad", scopes: ["read:analytics"], sites: ["shop"] })).rejects.toMatchObject({ code: "unknown_site", status: 400 });
		expect(KeyCreateBody.safeParse({ label: "a", scopes: ["read:analytics"], sites: ["Not An Id"] }).success).toBe(false);
		expect(await verifyKey(c, created.token, T0)).toMatchObject({ sites: ["blog", "default"] });
	});
});
