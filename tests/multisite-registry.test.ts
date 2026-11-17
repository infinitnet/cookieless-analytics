/** Client sites registry: record schema, cross-site rules, snapshot and site binding. */
import { beforeEach, describe, expect, it } from "vitest";
import { bindSite, type ClientSite, ClientSiteSchema, invalidateRegistry, newSiteKey, registry, siteProblem, SITE_KEY_RE } from "../src/multisite/registry.js";
import { sitesColl } from "./helpers.js";

const site = (over: Partial<ClientSite> = {}): ClientSite => ({ id: "blog", label: "Blog", key: "a".repeat(20), hosts: ["blog.example.net"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0, ...over });
const rules = { siteId: "default", remoteIds: ["shop"], masterHosts: ["master.example.org"], others: [site({ id: "news", key: "b".repeat(20), hosts: ["news.example.net"] })] };

describe("client site record", () => {
	it("accepts 1 to 10 lowercase host names without scheme or port", () => {
		expect(ClientSiteSchema.safeParse(site()).success).toBe(true);
		for (const hosts of [[], ["http://blog.example.net"], ["https://blog.example.net"], ["Blog.Example.net"], ["blog.example.net:8080"], ["blog.example.net/x"], ["localhost"], Array.from({ length: 11 }, (_, i) => `h${i}.example.net`)])
			expect(ClientSiteSchema.safeParse(site({ hosts })).success, JSON.stringify(hosts)).toBe(false);
		expect(ClientSiteSchema.safeParse(site({ hosts: Array.from({ length: 10 }, (_, i) => `h${i}.example.net`) })).success).toBe(true);
		for (const id of ["Blog", "a_b", "", "x".repeat(33)]) expect(ClientSiteSchema.safeParse(site({ id })).success, id).toBe(false);
	});

	it("generates 20 character keys", () => {
		const k = newSiteKey();
		expect(k).toMatch(SITE_KEY_RE);
		expect(newSiteKey()).not.toBe(k);
		for (const bad of ["A".repeat(20), "a".repeat(19), "a".repeat(21), "a-".repeat(10)]) expect(SITE_KEY_RE.test(bad), bad).toBe(false);
	});

	it("rejects collisions with the local id, remote ids, other sites, master hosts and duplicates", () => {
		expect(siteProblem(site(), rules)).toBeNull();
		expect(siteProblem(site({ id: "default" }), rules)).toMatch(/this site/);
		expect(siteProblem(site({ id: "shop" }), rules)).toMatch(/connected site/);
		expect(siteProblem(site({ id: "news" }), rules)).toMatch(/already registered/);
		expect(siteProblem(site({ hosts: ["master.example.org"] }), rules)).toMatch(/served by this install/);
		expect(siteProblem(site({ hosts: ["news.example.net"] }), rules)).toMatch(/already registered for Blog/);
		expect(siteProblem(site({ hosts: ["a.example.net", "a.example.net"] }), rules)).toMatch(/twice/);
		expect(siteProblem(site({ key: "b".repeat(20) }), rules)).toMatch(/key/);
	});
});

describe("registry snapshot and binding", () => {
	beforeEach(() => invalidateRegistry());

	it("is keyed by key and id, cached for 60 s and refreshed after invalidation", async () => {
		const coll = sitesColl([{ id: "blog", key: "k".repeat(20), hosts: ["blog.example.net"] }]);
		const r1 = await registry(coll, 1_000);
		expect(r1.byKey.get("k".repeat(20))?.id).toBe("blog");
		expect(r1.byId.get("blog")?.hosts).toEqual(["blog.example.net"]);
		await coll.put("news", { ...site({ id: "news", key: "n".repeat(20) }) });
		expect((await registry(coll, 30_000)).byId.has("news")).toBe(false);
		expect((await registry(coll, 61_001)).byId.has("news")).toBe(true);
		await coll.delete("news");
		invalidateRegistry();
		expect((await registry(coll, 61_002)).byId.has("news")).toBe(false);
	});

	it("skips invalid records and keeps the last good snapshot on a read error", async () => {
		const coll = sitesColl([{ id: "blog" }]);
		await coll.put("broken", { id: "broken" });
		expect((await registry(coll, 0)).sites.map((s) => s.id)).toEqual(["blog"]);
		const failing = { query: async () => Promise.reject(new Error("down")) };
		expect((await registry(failing, 120_000)).sites.map((s) => s.id)).toEqual(["blog"]);
	});

	it("binds the local site by default and a registered client site by id", async () => {
		const coll = sitesColl([{ id: "blog" }]);
		expect(await bindSite(undefined, "default", coll)).toEqual({ id: "default", kind: "local" });
		expect(await bindSite("default", "default", coll)).toEqual({ id: "default", kind: "local" });
		expect(await bindSite("blog", "default", coll)).toMatchObject({ id: "blog", kind: "client" });
		await expect(bindSite("shop", "default", coll)).rejects.toMatchObject({ code: "unknown_site", status: 400 });
	});
});
