/** Site routes: list with kinds, save, key regeneration, delete with data. */
import { beforeEach, describe, expect, it } from "vitest";
import { invalidateRegistry, registry } from "../src/multisite/registry.js";
import { purgeKey, purgeSite } from "../src/query/purge.js";
import { MW_SEEN_KEY } from "../src/middleware-core.js";
import { SaveBody, siteRoutes, type SitesCtx } from "../src/routes/sites.js";
import { memColl } from "./agent.helpers.js";
import { createRemote } from "../src/multisite/proxy.js";
import { cloneSite, schemaDb, sitesColl } from "./helpers.js";
import { seed } from "./fixtures/seed.js";
import { zonedToEpoch } from "../src/core/time.js";

describe("site routes", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let sites: ReturnType<typeof sitesColl>;
	const NOW = zonedToEpoch("2026-03-12", 20, "UTC");
	type AnyRoute = { permission: string; input: { safeParse(b: unknown): { success: boolean } }; handler(ctx: SitesCtx): Promise<unknown> };
	const routes = (remoteIds: string[] = []): Record<string, AnyRoute> =>
		siteRoutes({ settings: async () => ({ siteId: "default", siteTimezone: "UTC", siteOrigin: "https://www.master.example.org" }), db: async () => env.db, remoteIds: () => remoteIds, now: () => NOW });
	const ctx = (input?: unknown): SitesCtx => ({ input, request: new Request("https://admin.master.example.org/_emdash/api/x"), kv: env.kv, storage: { sites } });
	const call = (name: string, input?: unknown, r = routes()) => (r[name] as AnyRoute).handler(ctx(input)) as Promise<Record<string, any>>;
	const blog = { create: true, id: "blog", label: "Blog", hosts: ["blog.example.net", "www.blog.example.net"] };

	beforeEach(async () => {
		invalidateRegistry();
		env = await schemaDb();
		sites = sitesColl([]);
	});

	it("declares the permissions", () => {
		const r = routes();
		expect(r["sites/list"]?.permission).toBe("plugins:read");
		for (const n of ["sites/save", "sites/delete", "sites/key"]) expect(r[n]?.permission).toBe("plugins:manage");
	});

	it("creates a site with a fresh key, lists the kinds in order local then client and refreshes the snapshot", async () => {
		expect((await registry(sites)).byId.has("blog")).toBe(false);
		const { site } = await call("sites/save", blog);
		expect(site.key).toMatch(/^[a-z0-9]{20}$/);
		expect(site).toMatchObject({ id: "blog", paused: false, created: NOW, gscProperty: "", bingSiteUrl: "" });
		expect((await registry(sites)).byKey.get(site.key)?.id).toBe("blog");
		await call("sites/save", { ...blog, id: "abc", label: "Another", hosts: ["abc.example.net"] });
		const list = await call("sites/list");
		expect(list.sites.map((s: { id: string; kind: string }) => [s.kind, s.id])).toEqual([["local", "default"], ["client", "abc"], ["client", "blog"]]);
		expect(list.sites[2].client.hosts).toEqual(blog.hosts);
		expect("middlewareSeen" in list).toBe(false);
	});

	it("edits without changing the key, lowercases hosts and pauses", async () => {
		const { site } = await call("sites/save", blog);
		const { site: edited } = await call("sites/save", { id: "blog", label: "Blog 2", hosts: [" Blog.Example.NET "], paused: true, gscProperty: "sc-domain:example.net" });
		expect(edited).toMatchObject({ key: site.key, label: "Blog 2", hosts: ["blog.example.net"], paused: true, gscProperty: "sc-domain:example.net", created: site.created });
		expect((await registry(sites)).byId.get("blog")?.paused).toBe(true);
		await expect(call("sites/save", { ...blog, create: false, id: "nope" })).rejects.toMatchObject({ code: "not_found" });
		await expect(call("sites/save", blog)).rejects.toMatchObject({ code: "invalid_site" });
	});

	it("stores per-site revenue settings and clears them with null (Inherit)", async () => {
		await call("sites/save", { ...blog, defaultCurrency: "EUR", acceptClientRevenue: false });
		expect((await registry(sites)).byId.get("blog")).toMatchObject({ defaultCurrency: "EUR", acceptClientRevenue: false });
		// A save that does not name them keeps them (the Pause button).
		await call("sites/save", { id: "blog", label: "Blog", hosts: ["blog.example.net"], paused: true });
		expect(sites.items.get("blog")).toMatchObject({ defaultCurrency: "EUR", acceptClientRevenue: false });
		const { site } = await call("sites/save", { id: "blog", label: "Blog", hosts: ["blog.example.net"], defaultCurrency: null, acceptClientRevenue: null });
		expect(site).not.toHaveProperty("defaultCurrency");
		expect(site).not.toHaveProperty("acceptClientRevenue");
		for (const c of ["eur", "XXX", "ZZZ", ""]) expect(SaveBody.safeParse({ ...blog, defaultCurrency: c }).success, c).toBe(false);
	});

	it("stores a per-site site search override, off with an empty string, Inherit with null", async () => {
		await call("sites/save", { ...blog, siteSearchParams: "Q, find" });
		expect((await registry(sites)).byId.get("blog")).toMatchObject({ siteSearchParams: ["q", "find"] });
		const edit = { id: "blog", label: "Blog", hosts: ["blog.example.net"] };
		await call("sites/save", { ...edit, siteSearchParams: "" });
		expect(sites.items.get("blog")).toMatchObject({ siteSearchParams: [] });
		const { site } = await call("sites/save", { ...edit, siteSearchParams: null });
		expect(site).not.toHaveProperty("siteSearchParams");
		await expect(call("sites/save", { ...edit, siteSearchParams: "a,b,c,d,e,f" })).rejects.toMatchObject({ code: "invalid_site", status: 400 });
		await expect(call("sites/save", { ...edit, siteSearchParams: "bad-name" })).rejects.toMatchObject({ code: "invalid_site", status: 400 });
	});

	it("rejects every invalid registration", async () => {
		await call("sites/save", blog);
		const bad = async (over: Record<string, unknown>, r = routes()) => expect(call("sites/save", { ...blog, id: "new", hosts: ["new.example.net"], ...over }, r)).rejects.toMatchObject({ code: "invalid_site", status: 400 });
		await bad({ hosts: ["blog.example.net"] });
		await bad({ hosts: ["new.example.net", "new.example.net"] });
		await bad({ hosts: ["www.master.example.org"] });
		await bad({ hosts: ["admin.master.example.org"] });
		await bad({ hosts: ["http://new.example.net"] });
		await bad({ hosts: ["new.example.net:8443"] });
		await bad({ id: "default" });
		await bad({ id: "shop" }, routes(["shop"]));
		expect((routes()["sites/save"] as AnyRoute).input.safeParse({ ...blog, hosts: Array.from({ length: 11 }, (_, i) => `h${i}.example.net`) }).success).toBe(false);
		expect((routes()["sites/save"] as AnyRoute).input.safeParse({ ...blog, hosts: [] }).success).toBe(false);
	});

	it("regenerates the key at once and validates a given key", async () => {
		const { site } = await call("sites/save", blog);
		const { site: next } = await call("sites/key", { id: "blog" });
		expect(next.key).not.toBe(site.key);
		const reg = await registry(sites);
		expect(reg.byKey.has(site.key)).toBe(false);
		expect(reg.byKey.get(next.key)?.id).toBe("blog");
		for (const key of ["short", "A".repeat(20), "a".repeat(21)]) await expect(call("sites/key", { id: "blog", key })).rejects.toMatchObject({ code: "invalid_site" });
		expect((await call("sites/key", { id: "blog", key: "z".repeat(20) })).site.key).toBe("z".repeat(20));
		await expect(call("sites/key", { id: "gone" })).rejects.toMatchObject({ code: "not_found" });
	});

	it("deletes the record, and with deleteData its rows, leaving other sites alone", async () => {
		await seed(env, "UTC");
		cloneSite(env.raw, "blog");
		await call("sites/save", blog);
		await call("sites/save", { ...blog, id: "keep", label: "Keep", hosts: ["keep.example.net"] });
		const localSessions = env.count("ca_sessions") / 2;
		const r = await call("sites/delete", { id: "blog", deleteData: true });
		expect(r).toMatchObject({ id: "blog", deleted: true, data: { site: "blog" } });
		// The page continues as tools/purge-site does until done.
		for (let i = 0; i < 20 && !(await purgeSite(env.db, env.kv, "blog", { now: NOW })).done; i++);
		expect((env.raw.prepare("SELECT COUNT(*) AS n FROM ca_sessions WHERE site = 'blog'").get() as { n: number }).n).toBe(0);
		expect(env.count("ca_sessions")).toBe(localSessions);
		expect(await env.kv.get(purgeKey("blog"))).toBeNull();
		expect((await registry(sites)).byId.has("blog")).toBe(false);
		// Every site-scoped record of the deleted site goes, a scheduled dashboard included; other sites and the install's user agent rules stay.
		const shares = memColl({ s1: { site: "keep", dashboard: "d00000000001" }, s2: { site: "default", dashboard: "d00000000002" } });
		const of = (prefix: string) => memColl({ [`${prefix}1`]: { site: "keep", name: "x" }, [`${prefix}2`]: { site: "default", name: "y" } });
		const dashboards = memColl({ d1: { site: "keep", name: "Mail", emailNext: 1 }, d2: { site: "default", name: "Local", emailNext: 1 } });
		const rest = { goals: of("g"), funnels: of("f"), segments: of("s"), channel_rules: of("c"), annotations: of("a") };
		const agentRules = memColl({ r1: { site: "keep", pattern: "examplebot", mode: "contains", action: "robot" } });
		const withShares = (input?: unknown): SitesCtx => ({ ...ctx(input), storage: { sites, shares, dashboards, ...rest, agent_rules: agentRules } as SitesCtx["storage"] });
		expect(await (routes()["sites/delete"] as AnyRoute).handler(withShares({ id: "keep", deleteData: false }))).toMatchObject({ deleted: true, data: null });
		expect([...shares.items.keys()]).toEqual(["s2"]);
		expect([...dashboards.items.keys()]).toEqual(["d2"]);
		for (const [name, c] of Object.entries(rest)) expect([name, [...c.items.keys()]]).toEqual([name, [`${name[0]}2`]]);
		expect([...agentRules.items.keys()]).toEqual(["r1"]);
		await expect(call("sites/delete", { id: "keep", deleteData: false })).rejects.toMatchObject({ code: "not_found" });
	});

	it("deletes a site with 30 days of data in at most 40 round trips, leaving the rest to tools/purge-site", async () => {
		await seed(env, "UTC");
		cloneSite(env.raw, "blog");
		for (let d = 1; d <= 30; d++) env.raw.prepare("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('blog', ?, 404, '/x', '', 1, 1)").run(20260100 + d);
		let n = 0;
		const count = <T extends object>(o: T): T =>
			new Proxy(o, { get: (t, p) => { const v = Reflect.get(t, p); return typeof v === "function" ? (...a: unknown[]) => (n++, v.apply(t, a)) : v; } });
		const empty = () => count(memColl({}));
		const storage = { sites: count(sites), shares: empty(), dashboards: empty(), goals: empty(), funnels: empty(), segments: empty(), channel_rules: empty(), annotations: empty() };
		const r = siteRoutes({ settings: async () => ({ siteId: "default", siteTimezone: "UTC", siteOrigin: "https://www.master.example.org" }), db: async () => count(env.db), remoteIds: () => [], now: () => NOW });
		const counted = (input: unknown): SitesCtx => ({ input, request: new Request("https://admin.master.example.org/_emdash/api/x"), kv: count(env.kv), storage: storage as SitesCtx["storage"] });
		await (r["sites/save"] as AnyRoute).handler(counted(blog));
		n = 0;
		const out = (await (r["sites/delete"] as AnyRoute).handler(counted({ id: "blog", deleteData: true }))) as Record<string, any>;
		expect(n).toBeLessThanOrEqual(40);
		expect(out.data.done).toBe(false);
	});

	it("lists the three kinds in order local, client, remote and flags a missing key without ever returning it", async () => {
		const secret = "abcd1234.remote-secret-value";
		const r = createRemote(
			[
				{ id: "zeta", label: "Zeta", origin: "https://zeta.example.net", keyEnv: "CA_SITE_ZETA_KEY" },
				{ id: "alpha", label: "Alpha", origin: "https://alpha.example.net", keyEnv: "CA_SITE_ALPHA_KEY" },
				// Collides with the client site below: this database wins and the remote entry is not listed.
				{ id: "blog", label: "Remote blog", origin: "https://rblog.example.net", keyEnv: "CA_SITE_RBLOG_KEY" },
			],
			{ env: () => ({ CA_SITE_ZETA_KEY: secret }) },
		);
		const withRemote = siteRoutes({
			settings: async () => ({ siteId: "default", siteTimezone: "UTC", siteOrigin: "https://www.master.example.org" }),
			db: async () => env.db,
			remoteIds: r.ids,
			remoteSites: () => r.sites.map((x) => ({ id: x.id, label: x.label, origin: x.origin, keyPresent: r.keyPresent(x.id) })),
			now: () => NOW,
		}) as unknown as Record<string, AnyRoute>;
		await call("sites/save", blog);
		const list = await call("sites/list", undefined, withRemote);
		expect(list.sites.map((s: { kind: string; id: string }) => [s.kind, s.id])).toEqual([["local", "default"], ["client", "blog"], ["remote", "zeta"], ["remote", "alpha"]]);
		expect(list.sites[2]).toMatchObject({ label: "Zeta", origin: "https://zeta.example.net", keyPresent: true, local: false });
		expect(list.sites[3]).toMatchObject({ keyPresent: false });
		const text = JSON.stringify([list, await call("sites/list", { counts: true }, withRemote)]);
		expect(text).not.toContain(secret);
		expect(text).not.toContain("CA_SITE_");
	});

	it("reports pageviews today per client site and the middleware liveness on request", async () => {
		await seed(env, "UTC");
		cloneSite(env.raw, "blog");
		await call("sites/save", blog);
		const list = await call("sites/list", { counts: true });
		expect(list.middlewareSeen).toBe(false);
		// Page views of the visits that started today.
		const today = (env.raw.prepare("SELECT SUM(pageviews) AS n FROM ca_sessions WHERE site = 'blog' AND day = '2026-03-12'").get() as { n: number }).n;
		expect(today).toBeGreaterThan(0);
		expect(list.sites[1].client.pageviewsToday).toBe(today);
		await env.kv.set(MW_SEEN_KEY, NOW * 1000 - 60_000);
		expect((await call("sites/list", { counts: true })).middlewareSeen).toBe(true);
	});

	it("counts every client site of a database in one statement", async () => {
		await seed(env, "UTC");
		cloneSite(env.raw, "blog");
		await call("sites/save", blog);
		for (let i = 0; i < 50; i++) await call("sites/save", { create: true, id: `c${i}`, label: `Client ${i}`, hosts: [`c${i}.example.net`] });
		const sql: string[] = [];
		const counting = { ...env.db, all: (q: string, p?: readonly unknown[]) => (sql.push(q), env.db.all(q, p as never)) } as typeof env.db;
		const r = siteRoutes({ settings: async () => ({ siteId: "default", siteTimezone: "UTC", siteOrigin: "" }), db: async () => counting, now: () => NOW });
		const list = (await (r["sites/list"] as unknown as AnyRoute).handler(ctx({ counts: true }))) as Record<string, any>;
		expect(sql.filter((q) => q.includes("ca_sessions"))).toHaveLength(1);
		const today = (env.raw.prepare("SELECT SUM(pageviews) AS n FROM ca_sessions WHERE site = 'blog' AND day = '2026-03-12'").get() as { n: number }).n;
		const byId = new Map(list.sites.map((x: { id: string; client?: { pageviewsToday?: number } }) => [x.id, x.client?.pageviewsToday]));
		expect(byId.get("blog")).toBe(today);
		expect(byId.get("c49")).toBe(0);
	});
});
