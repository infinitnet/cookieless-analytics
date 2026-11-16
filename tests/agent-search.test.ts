/** Agent API and Search: sync:search routes with `site`, read:search reports per site, pages withSearch per site. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentCtx } from "../src/agent/routes.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { type SearchCtx, searchService } from "../src/routes/search.js";
import type { Settings } from "../src/settings.js";
import { clearTokenCache } from "../src/sources/gsc-auth.js";
import { agentHarness } from "./agent.helpers.js";
import { RANGE, seed, seedSearch } from "./fixtures/seed.js";
import { fakeGoogle, googleSettings } from "./gsc.helpers.js";
import { cloneSite, schemaDb } from "./helpers.js";

const T0 = 1_773_360_000; // 2026-03-13T00:00:00Z

describe("agent API and Search", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	let h: Awaited<ReturnType<typeof agentHarness>>;
	beforeAll(async () => {
		env = await schemaDb();
		const base = await seed(env, "UTC");
		settings = { ...base, ...googleSettings({ siteTimezone: "UTC" }), siteId: base.siteId };
		// The client site "shop" has the same traffic and its own, smaller search rows.
		cloneSite(env.raw, "shop");
		await seedSearch(env);
		env.raw.exec("INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional) VALUES ('shop', 'google', '2026-03-11', '/', '', '', '', 2, 20, 40, 0), ('shop', 'google', '2026-03-11', '', '', '', '', 2, 20, 40, 0)");
		const g = fakeGoogle();
		const svc = searchService({ db: async () => env.db, settings: async () => settings, now: () => T0 * 1000 });
		const withHttp = (ctx: AgentCtx) => ({ ...ctx, http: g.http }) as unknown as SearchCtx;
		h = await agentHarness(env, settings, { limiter: () => 0, search: { sync: (c, b) => svc.sync(withHttp(c), b), backfill: (c, b) => svc.backfill(withHttp(c), b) } });
		await h.storage.sites.put("shop", { id: "shop", label: "Shop", key: "shopkkkkkkkkkkkkkkkk", hosts: ["shop.example.org"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 });
		invalidateRegistry();
	});
	beforeEach(() => {
		clearReportCache();
		clearTokenCache();
	});

	it("search/sync runs one tick for the requested site under sync:search", async () => {
		const k = await h.key(["sync:search"]);
		const r = await h.call("agent/v1/search/sync", { token: k, input: { source: "google" } });
		expect(r.status).toBe(200);
		expect(r.json.meta.site).toBe("default");
		expect(r.json.data).toMatchObject({ calls: 6, pairs: ["default:google"], done: true, continued: false });
		expect((await h.call("agent/v1/search/sync", { token: k, input: { site: "shop", source: "google" } })).json).toMatchObject({ ok: false, error: "not_mapped" });
		// Wrong scope, or a key restricted to another site: the same 404.
		expect((await h.call("agent/v1/search/sync", { token: await h.key(["read:search"]), input: {} })).status).toBe(404);
		expect((await h.call("agent/v1/search/sync", { token: await h.key(["sync:search"], undefined, ["shop"]), input: {} })).status).toBe(404);
	});

	it("search/backfill start, status and cancel with site", async () => {
		const k = await h.key(["sync:search"]);
		const start = await h.call("agent/v1/search/backfill", { token: k, input: { action: "start", source: "google", from: "2026-02-01", to: "2026-02-10" } });
		expect(start.json.data).toMatchObject({ site: "default", backfill: { days: 10, completed: 0 } });
		expect((await h.call("agent/v1/search/backfill", { token: k, input: { action: "status" } })).json.data.backfill).toMatchObject({ from: "2026-02-01" });
		expect((await h.call("agent/v1/search/backfill", { token: k, input: { action: "status", site: "shop" } })).json.data).toEqual({ site: "shop", source: "google", backfill: null });
		expect((await h.call("agent/v1/search/backfill", { token: k, input: { action: "cancel" } })).json.data).toEqual({ cancelled: true });
		expect((await h.call("agent/v1/search/backfill", { token: k, input: { action: "start", site: "shop", from: "2026-02-01", to: "2026-02-02" } })).json.error).toBe("not_mapped");
		// A range in days back from yesterday, clamped to what Google keeps; it ends before the oldest stored day.
		const days = (await h.call("agent/v1/search/backfill", { token: k, input: { action: "start", days: 1000 } })).json.data;
		expect(days).toMatchObject({ site: "default", source: "google", from: "2024-11-08", clamped: true, backfill: { from: "2024-11-08" } });
		const oldest = (env.raw.prepare("SELECT MIN(day) AS d FROM ca_search_daily WHERE site = 'default' AND source = 'google'").get() as { d: string }).d;
		expect(new Date(Date.parse(`${days.backfill.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)).toBe(oldest);
		expect((await h.call("agent/v1/search/backfill", { token: k, input: { action: "start", days: 30, from: "2026-01-01" } })).json.error).toBe("invalid_range");
		await h.call("agent/v1/search/backfill", { token: k, input: { action: "cancel" } });
	});

	it("read:search serves the search reports per site; read:analytics alone does not", async () => {
		const k = await h.key(["read:search"]);
		const shop = await h.call("agent/v1/query", { token: k, input: { report: "search_overview", query: { ...RANGE, site: "shop" } } });
		expect(shop.status).toBe(200);
		expect(shop.json.meta.site).toBe("shop");
		expect(shop.json.data.data.totals).toMatchObject({ clicks: 2, impressions: 20 });
		const local = await h.call("agent/v1/query", { token: k, input: { report: "search_overview", query: { ...RANGE } } });
		expect(local.json.data.data.totals.impressions).toBeGreaterThan(20);
		expect((await h.call("agent/v1/query", { token: await h.key(["read:analytics"]), input: { report: "search_overview", query: { ...RANGE } } })).status).toBe(404);
	});

	it("read:search serves Bing rows with source bing, per site", async () => {
		env.raw.exec(
			"INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional) VALUES ('shop', 'bing', '2026-03-11', '', 'blue widgets', '', '', 1, 10, 30, 0), ('shop', 'bing', '2026-03-11', '', '', '', '', 1, 10, 30, 0)",
		);
		const k = await h.key(["read:search"]);
		const q = await h.call("agent/v1/query", { token: k, input: { report: "search_queries", query: { ...RANGE, site: "shop" }, params: { source: "bing" } } });
		expect(q.status).toBe(200);
		expect(q.json.data.data.rows).toEqual([{ key: "blue widgets", clicks: 1, impressions: 10, ctr: 0.1, position: 3 }]);
		const local = await h.call("agent/v1/query", { token: k, input: { report: "search_overview", query: { ...RANGE }, params: { source: "bing" } } });
		const own = env.raw.prepare("SELECT SUM(impressions) AS n FROM ca_search_daily WHERE site = 'default' AND source = 'bing' AND page_key = '' AND query = '' AND country = '' AND device = '' AND day BETWEEN ? AND ?").get(RANGE.from, RANGE.to) as { n: number };
		expect(local.json.data.data.totals.impressions).toBe(own.n);
	});

	it("pages withSearch for a client site joins its own rows only", async () => {
		const k = await h.key(["read:analytics", "read:search"]);
		const r = await h.call("agent/v1/query", { token: k, input: { report: "pages", query: { ...RANGE, site: "shop" }, params: { withSearch: true } } });
		expect(r.status).toBe(200);
		const rows = r.json.data.data.rows as Array<Record<string, unknown>>;
		expect(rows.find((x) => x.key === "/")).toMatchObject({ impressions: 20, clicks: 2 });
		expect(rows.find((x) => x.key === "/pricing")).toMatchObject({ impressions: null });
	});
});
