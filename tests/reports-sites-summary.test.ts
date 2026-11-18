/** All-sites summary: the `sites/summary` route and the agent report `sites_summary`. */
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/adapter.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { KV_WATERMARK } from "../src/query/rollup.js";
import { siteRoutes, type SitesCtx, type SummaryRow } from "../src/routes/sites.js";
import { normalizeSettings } from "../src/settings.js";
import { agentHarness } from "./agent.helpers.js";
import { schemaDb, sitesColl } from "./helpers.js";

type Env = Awaited<ReturnType<typeof schemaDb>>;

/** Rollup `all` rows: [site, day, pageviews, sessions, visitors, bounces, engaged]. */
function rollup(env: Env, rows: Array<[string, string, number, number, number, number, number]>) {
	const st = env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, pageviews, sessions, visitors, bounces, engaged) VALUES (?, ?, 'all', '', ?, ?, ?, ?, ?)");
	for (const r of rows) st.run(...r);
}
/** Revenue `all` rows: [site, day, cur, orders, revenue]. */
function revenue(env: Env, rows: Array<[string, string, string, number, number]>) {
	const st = env.raw.prepare("INSERT INTO ca_revenue_daily (site, day, dim, key, cur, orders, revenue, sessions) VALUES (?, ?, 'all', '', ?, ?, ?, 0)");
	for (const r of rows) st.run(...r);
}

/** A database wrapper that records every statement and its parameters. */
function spy(db: Db) {
	const log: Array<{ sql: string; params: readonly unknown[] }> = [];
	const wrapped: Db = {
		dialect: db.dialect,
		run: (sql, params = []) => (log.push({ sql, params }), db.run(sql, params)),
		all: (sql, params = []) => (log.push({ sql, params }), db.all(sql, params)),
		batch: (stmts) => (stmts.forEach((s) => log.push({ sql: s.sql, params: s.params ?? [] })), db.batch(stmts)),
	};
	return { db: wrapped, log };
}

describe("sites/summary", () => {
	let env: Env;
	let sites: ReturnType<typeof sitesColl>;
	let s: ReturnType<typeof spy>;
	const settings = async () => ({ siteId: "default", siteTimezone: "UTC", siteOrigin: "" });
	const summary = (input: unknown, over: Parameters<typeof siteRoutes>[0] extends infer E ? Partial<E> : never = {}) =>
		siteRoutes({ settings, db: async () => s.db, ...over })["sites/summary"].handler({ input, kv: env.kv, storage: { sites } } as SitesCtx) as Promise<Record<string, any>>;
	const RANGE = { from: "2026-03-08", to: "2026-03-14" };

	beforeEach(async () => {
		invalidateRegistry();
		clearReportCache();
		env = await schemaDb();
		s = spy(env.db);
		sites = sitesColl([
			{ id: "blog", label: "Blog" },
			{ id: "shop", label: "Shop" },
		]);
		rollup(env, [
			["default", "2026-03-10", 100, 40, 30, 10, 20],
			["default", "2026-03-11", 50, 20, 15, 10, 10],
			["blog", "2026-03-12", 30, 10, 9, 5, 4],
			["shop", "2026-03-13", 300, 100, 80, 20, 60],
			// Previous period (2026-03-01 to 2026-03-07).
			["default", "2026-03-03", 75, 30, 20, 6, 15],
			["shop", "2026-03-05", 150, 50, 40, 10, 25],
			// A fourth site that is not in the registry: never read.
			["ghost", "2026-03-10", 9999, 999, 999, 0, 0],
		]);
		revenue(env, [
			["shop", "2026-03-13", "USD", 3, 120.5],
			["shop", "2026-03-14", "EUR", 2, 80],
			["default", "2026-03-10", "USD", 1, 10.25],
			["shop", "2026-03-04", "USD", 1, 60],
			["ghost", "2026-03-10", "USD", 50, 5000],
		]);
	});

	it("lists every registry site with rollup figures, sorted by pageviews, and never reads a site outside the registry", async () => {
		const r = await summary(RANGE);
		expect(r.rows.map((x: SummaryRow) => [x.id, x.label, x.kind])).toEqual([
			["shop", "Shop", "client"],
			["default", "This site", "local"],
			["blog", "Blog", "client"],
		]);
		// The stored bounces (20 of 60) follow the older rule and are ignored: bounce rate is 1 minus engaged rate.
		expect(r.rows[1]).toMatchObject({ sessions: 60, pageviews: 150, visitors: 45, bounce_rate: 0.5, engaged_rate: 0.5, revenue: [{ currency: "USD", revenue: 10.25, orders: 1 }] });
		expect(r.rows.some((x: SummaryRow) => x.id === "ghost")).toBe(false);
		// The bound site list holds the three registry ids, as one JSON parameter.
		const ids = s.log.map((l) => l.params[0]);
		expect(ids.every((p) => typeof p === "string" && JSON.parse(p as string).sort().join() === "blog,default,shop")).toBe(true);
		expect(r).toMatchObject({ compare: "none", compareRange: null, watermark: null });
	});

	it("lists two currencies for a site with revenue in two and in the totals; visitors are not summed", async () => {
		const r = await summary(RANGE);
		const shop = r.rows.find((x: SummaryRow) => x.id === "shop");
		expect(shop.revenue).toEqual([
			{ currency: "USD", revenue: 120.5, orders: 3 },
			{ currency: "EUR", revenue: 80, orders: 2 },
		]);
		expect(r.totals).toEqual({
			sessions: 170,
			pageviews: 480,
			visitors: null,
			revenue: [
				{ currency: "USD", revenue: 130.75, orders: 4 },
				{ currency: "EUR", revenue: 80, orders: 2 },
			],
		});
	});

	it("costs at most 5 statements for three sites with compare and adds the deltas", async () => {
		await env.kv.set(KV_WATERMARK, "2026-03-13");
		const r = await summary({ ...RANGE, compare: "previous" });
		expect(s.log.length).toBeLessThanOrEqual(5);
		expect(s.log.every((l) => /site IN \(SELECT value FROM json_each\(\?\)\) AND dim = 'all' AND seg = '' AND day BETWEEN \? AND \?/.test(l.sql))).toBe(true);
		expect(r.compareRange).toEqual({ from: "2026-03-01", to: "2026-03-07" });
		expect(r.watermark).toBe("2026-03-13");
		const shop = r.rows.find((x: SummaryRow) => x.id === "shop");
		expect(shop.delta).toMatchObject({ pageviews: 1, sessions: 1 });
		expect(shop.previous.revenue).toEqual([{ currency: "USD", revenue: 60, orders: 1 }]);
		expect(r.rows.find((x: SummaryRow) => x.id === "blog").delta.pageviews).toBeNull();
		expect(r.totals.previous).toMatchObject({ sessions: 80, pageviews: 225, visitors: null });
		expect(r.totals.delta).toEqual({ sessions: 1.125, pageviews: 1.1333 });
	});

	it("uses the site, dim, day key and no table scan (SQLite plan)", async () => {
		await summary(RANGE);
		const [traffic, money] = s.log;
		const plan = (sql: string, params: readonly unknown[]) => (env.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as unknown[])) as Array<{ detail: string }>).map((p) => p.detail).join("\n");
		const p1 = plan(traffic!.sql, traffic!.params);
		const p2 = plan(money!.sql, money!.params);
		// The summary tables are clustered by (site, dim, seg, day): a key range, no secondary index.
		expect(p1).toContain("SEARCH ca_rollup USING PRIMARY KEY (site=? AND dim=? AND seg=? AND day>? AND day<?)");
		expect(p1).not.toMatch(/SCAN ca_rollup\b(?! USING)/);
		expect(p2).toContain("SEARCH ca_revenue_daily USING PRIMARY KEY (site=? AND dim=? AND seg=? AND day>? AND day<?)");
		expect(p2).not.toMatch(/SCAN ca_revenue_daily\b(?! USING)/);
	});

	it("appends the remote rows of the connected sites hook and keeps a row error", async () => {
		const remote: SummaryRow = { id: "far", label: "Far", kind: "remote", sessions: null, pageviews: null, visitors: null, bounce_rate: null, engaged_rate: null, revenue: [], error: "timeout" };
		const r = await summary(RANGE, { remoteRows: async () => [remote] });
		expect(r.rows.at(-1)).toEqual(remote);
		expect(r.totals.pageviews).toBe(480);
	});

	it("declares plugins:read and validates the body", async () => {
		const route = siteRoutes({ settings, db: async () => s.db })["sites/summary"];
		expect(route.permission).toBe("plugins:read");
		expect(route.input.safeParse({ from: "2026-03-09", to: "2026-03-08" }).success).toBe(false);
		expect(route.input.safeParse({ ...RANGE, compare: "segment" }).success).toBe(false);
		expect(route.input.safeParse({ ...RANGE, site: "x" }).success).toBe(false);
	});

	it("reserves the site id all for the All sites view", async () => {
		const save = siteRoutes({ settings, db: async () => s.db })["sites/save"];
		await expect(save.handler({ input: { create: true, id: "all", label: "All", hosts: ["all.example.net"] }, storage: { sites } } as SitesCtx)).rejects.toMatchObject({ code: "invalid_site" });
	});
});

describe("agent sites_summary", () => {
	it("lists the key's allowed local-database sites only, under read:analytics", async () => {
		invalidateRegistry();
		clearReportCache();
		const env = await schemaDb();
		rollup(env, [
			["default", "2026-03-10", 10, 5, 5, 1, 1],
			["blog", "2026-03-10", 20, 6, 6, 1, 1],
			["shop", "2026-03-10", 30, 7, 7, 1, 1],
		]);
		const h = await agentHarness(env, normalizeSettings({ siteId: "default", siteTimezone: "UTC" }), { limiter: () => 0, remoteIds: () => ["far"] });
		(h.storage as Record<string, unknown>).sites = sitesColl([{ id: "blog" }, { id: "shop" }]);
		const query = { from: "2026-03-08", to: "2026-03-12" };
		const all = await h.call("agent/v1/query", { token: await h.key(["read:analytics"]), input: { report: "sites_summary", query } });
		expect(all.status, all.text).toBe(200);
		expect(all.json.data.data.rows.map((r: { key: string }) => r.key)).toEqual(["shop", "blog", "default"]);
		const one = await h.key(["read:analytics"], undefined, ["blog"]);
		const r = await h.call("agent/v1/query", { token: one, input: { report: "sites_summary", query: { ...query, site: "blog" } } });
		expect(r.json.data.data.rows).toHaveLength(1);
		expect(r.json.data.data.rows[0]).toMatchObject({ key: "blog", pageviews: 20 });
		// The same body with another key's restriction is not served from the cache of the first.
		expect((await h.call("agent/v1/query", { token: await h.key(["read:analytics"], undefined, ["blog", "shop"]), input: { report: "sites_summary", query: { ...query, site: "blog" } } })).json.data.data.rows).toHaveLength(2);
		// Remote ids are never queried by the agent route.
		expect((await h.call("agent/v1/query", { token: await h.key(["read:analytics"]), input: { report: "sites_summary", query: { ...query, site: "far" } } })).json).toMatchObject({ error: "site_not_allowed" });
		expect((await h.call("agent/v1/query", { token: await h.key(["read:search"]), input: { report: "sites_summary", query } })).status).toBe(404);
		expect((await h.call("agent/v1/query", { token: await h.key(["read:analytics"]), input: { report: "sites_summary", query: { ...query, filters: [{ dim: "page", op: "is", values: ["/"] }] } } })).json).toMatchObject({ error: "invalid_params" });
	});
});
