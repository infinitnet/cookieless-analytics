/** Bing Webmaster source: fixture mapping, window sync per site, backfill, GetUserSites, page queries cache, connect route. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { answer } from "../src/routes/data.js";
import { type SearchCtx, searchRoutes } from "../src/routes/search.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { startBackfill } from "../src/sources/backfill.js";
import { BING_API, bing, listBingSites, pageQueries, queryPages, wcfDay, windowRows } from "../src/sources/bing.js";
import { suggestProperty } from "../src/sources/gsc-auth.js";
import { pageKeyFor } from "../src/sources/page-key.js";
import { backfillKey, mappedPairs, type PairState, runSearchTick, stateKey, type SyncCtx } from "../src/sources/sync.js";
import { schemaDb, sitesColl } from "./helpers.js";

const T0 = 1_773_360_000_000; // 2026-03-13T00:00:00Z
const KEY = "FixtureBingApiKeyPlaceholder0001";
const fx = (m: string) => JSON.parse(readFileSync(new URL(`./fixtures/bing/${m}.json`, import.meta.url), "utf8")) as { d: Array<Record<string, unknown>> };

function fakeBing(o: { status?: number } = {}) {
	const calls: Array<{ method: string; params: Record<string, string> }> = [];
	const http = {
		async fetch(url: string) {
			expect(url.startsWith(BING_API)).toBe(true);
			const u = new URL(url);
			const method = u.pathname.split("/").pop() as string;
			calls.push({ method, params: Object.fromEntries(u.searchParams) });
			if (o.status) return new Response(JSON.stringify({ ErrorCode: 14, Message: `denied ${KEY}` }), { status: o.status });
			return new Response(JSON.stringify(fx(method)), { status: 200, headers: { "content-type": "application/json" } });
		},
	};
	return { http, calls };
}

const bingSettings = (over: Record<string, unknown> = {}): Settings =>
	normalizeSettings({ bingEnabled: true, bingApiKey: KEY, bingSiteUrl: "https://www.example.com/", siteOrigin: "https://example.com", siteTimezone: "UTC", ...over });

async function harness(o: { status?: number; settings?: Settings; clients?: SyncCtx["clients"] } = {}) {
	const env = await schemaDb();
	const b = fakeBing(o);
	let now = T0;
	const ctx: SyncCtx = { http: b.http, kv: env.kv, db: env.db, settings: o.settings ?? bingSettings(), clients: o.clients ?? [], cron: { schedule: async () => undefined }, now: () => now };
	const rows = (where = "1 = 1") =>
		env.raw.prepare(`SELECT site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional FROM ca_search_daily WHERE ${where} ORDER BY site, day, page_key, query`).all() as Array<Record<string, unknown>>;
	return { env, b, ctx, rows, advance: (ms: number) => void (now += ms) };
}

describe("Bing response mapping", () => {
	it("parses WCF dates at UTC midnight and rejects anything else", () => {
		expect(wcfDay("/Date(1772755200000)/")).toBe("2026-03-06");
		expect(wcfDay("/Date(1772755200000+0000)/")).toBe("2026-03-06");
		expect(wcfDay("2026-03-06")).toBeNull();
		expect(wcfDay(1772755200000)).toBeNull();
	});

	it("maps totals, query rows and page rows of the fixture by day, with no country or device", () => {
		const days = windowRows(fx("GetRankAndTrafficStats").d, fx("GetQueryStats").d, fx("GetPageStats").d, { pageKey: pageKeyFor("https://example.com") });
		const d6 = days.get("2026-03-06") ?? [];
		expect(d6).toContainEqual({ page_key: "", query: "", country: "", device: "", clicks: 2, impressions: 30, pos_sum: 0 });
		// Position from AvgImpressionPosition; AvgClickPosition -1 (no clicks) is ignored.
		expect(d6).toContainEqual({ page_key: "", query: "blue widgets", country: "", device: "", clicks: 4, impressions: 40, pos_sum: 120 });
		expect(d6).toContainEqual({ page_key: "", query: "red widgets", country: "", device: "", clicks: 0, impressions: 10, pos_sum: 120 });
		// The page URL sits in `Query`; www and the trailing slash normalize, another host is dropped.
		expect(d6).toContainEqual({ page_key: "/widgets", query: "", country: "", device: "", clicks: 3, impressions: 30, pos_sum: 120 });
		expect(d6).toContainEqual({ page_key: "/", query: "", country: "", device: "", clicks: 1, impressions: 20, pos_sum: 120 });
		expect(d6.some((r) => r.clicks === 5)).toBe(false);
		expect((days.get("2026-02-27") ?? []).map((r) => r.page_key || r.query)).toEqual(["blue widgets", "/widgets"]);
	});
});

describe("Bing sync", () => {
	beforeEach(() => invalidateRegistry());

	it("stores the returned days of the sync window under the local site in one pull of three calls, before today", async () => {
		const h = await harness();
		const r = await runSearchTick(h.ctx);
		expect(r).toMatchObject({ calls: 3, done: true, pairs: ["default:bing"] });
		expect(h.b.calls.map((c) => c.method)).toEqual(["GetRankAndTrafficStats", "GetQueryStats", "GetPageStats"]);
		expect(h.b.calls.every((c) => c.params.apikey === KEY && c.params.siteUrl === "https://www.example.com/")).toBe(true);
		const rows = h.rows();
		expect(rows.every((x) => x.site === "default" && x.source === "bing" && x.country === "" && x.device === "")).toBe(true);
		// Without a backfill only the sync window (7 days) is stored: 2026-02-27 and 2023-01-02 wait for a backfill.
		expect([...new Set(rows.map((x) => x.day))]).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12"]);
		expect(h.rows("day >= '2026-03-10'").every((x) => x.provisional === 1)).toBe(true);
		expect(h.rows("day < '2026-03-10'").every((x) => x.provisional === 0)).toBe(true);
		// Positions: SUM(pos_sum) / SUM(impressions) of the query grain.
		expect(h.rows("query = 'blue widgets' AND day = '2026-03-06'")[0]).toMatchObject({ clicks: 4, impressions: 40, pos_sum: 120 });
		const st = await h.env.kv.get<PairState>(stateKey("default", "bing"));
		expect(st).toMatchObject({ status: "ok", cursorDay: null });
		expect(JSON.stringify(st)).not.toContain(KEY);

		// Throttled by searchSyncHours; a re-pull replaces rows instead of adding.
		h.advance(3_600_000);
		await runSearchTick(h.ctx);
		expect(h.b.calls).toHaveLength(3);
		const before = h.rows().length;
		await runSearchTick(h.ctx, { only: { site: "default", source: "bing" } });
		expect(h.b.calls).toHaveLength(6);
		expect(h.rows()).toHaveLength(before);
	});

	it("stores a client site's rows under its id with its own host", async () => {
		const client = { id: "shop", label: "Shop", key: "shopkkkkkkkkkkkkkkkk", hosts: ["example.org"], gscProperty: "", bingSiteUrl: "https://example.org/", paused: false, created: 0 };
		const h = await harness({ settings: bingSettings({ bingSiteUrl: "" }), clients: [client] });
		expect(mappedPairs(h.ctx.settings, h.ctx.clients).map((p) => p.id)).toEqual(["shop:bing"]);
		await runSearchTick(h.ctx);
		expect(h.b.calls[0]?.params.siteUrl).toBe("https://example.org/");
		const rows = h.rows();
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((x) => x.site === "shop")).toBe(true);
		// Page URLs of example.com are not this site's: only totals and queries land.
		expect(rows.some((x) => x.page_key !== "")).toBe(false);
	});

	it("records a 401 in the pair state without retrying before the next due time, never echoing the key", async () => {
		const h = await harness({ status: 401 });
		await runSearchTick(h.ctx);
		const st = await h.env.kv.get<PairState>(stateKey("default", "bing"));
		expect(st).toMatchObject({ status: "error", lastError: "Bing Webmaster answered 401.", cursorDay: null });
		expect(JSON.stringify(st)).not.toContain(KEY);
		h.advance(60_000);
		await runSearchTick(h.ctx);
		expect(h.b.calls).toHaveLength(1);
	});

	it("a backfill makes the pair due and is done once the window is stored", async () => {
		const h = await harness();
		await runSearchTick(h.ctx);
		h.advance(60_000);
		await startBackfill(h.env.kv, "default", "bing", "2025-12-01", "2026-03-12", "2026-03-13");
		await runSearchTick(h.ctx);
		expect(h.b.calls).toHaveLength(6);
		expect(await h.env.kv.get(backfillKey("default", "bing"))).toMatchObject({ done: true, error: null });
	});

	it("is not configured without the switch or the key", () => {
		expect(bing.configured(bingSettings())).toBe(true);
		expect(bing.configured(bingSettings({ bingEnabled: false }))).toBe(false);
		expect(bing.configured(bingSettings({ bingApiKey: "" }))).toBe(false);
	});
});

describe("GetUserSites and the picker", () => {
	it("lists verified sites only and suggests the site whose hostname matches", async () => {
		const b = fakeBing();
		const sites = await listBingSites({ http: b.http, settings: bingSettings() });
		expect(sites.map((s) => s.siteUrl)).toEqual(["https://www.example.com/", "https://example.org/"]);
		expect(suggestProperty(sites.map((s) => s.siteUrl), "example.org")).toBe("https://example.org/");
		expect(suggestProperty(sites.map((s) => s.siteUrl), "www.example.com")).toBe("https://www.example.com/");
		expect(suggestProperty(sites.map((s) => s.siteUrl), "shop.example.com")).toBeNull();
	});

	it("search/properties for Bing proposes the client site's match; search/connect stores keys and returns none", async () => {
		const env = await schemaDb();
		const b = fakeBing();
		const stored: Record<string, unknown> = {};
		const deleted: string[] = [];
		const sites = sitesColl([{ id: "shop", hosts: ["example.org"] }]);
		invalidateRegistry();
		const routes = searchRoutes({ db: async () => env.db, settings: async () => bingSettings(stored), now: () => T0 });
		const call = async (name: keyof typeof routes, input: unknown) => {
			const ctx: SearchCtx = {
				input,
				request: new Request("https://www.example.com/_emdash/api/plugins/cookieless-analytics/x", { method: "POST" }),
				kv: env.kv,
				http: b.http,
				settings: { set: async (k, v) => void (stored[k] = v), delete: async (k) => (deleted.push(k), true) },
				storage: { sites },
			};
			return (await routes[name].handler(ctx)) as Record<string, any>;
		};
		const shop = await call("search/properties", { site: "shop", source: "bing" });
		expect(shop).toMatchObject({ site: "shop", source: "bing", current: "", suggested: "https://example.org/" });
		expect(shop.items.map((i: { siteUrl: string }) => i.siteUrl)).not.toContain("https://unverified.example.net/");
		// The local origin is https://example.com: a Bing URL matches its exact hostname only.
		expect((await call("search/properties", { source: "bing" })).suggested).toBeNull();

		const out = await call("search/connect", { bingEnabled: true, bingApiKey: "AnotherFixtureBingKeyPlaceholder", gscClientSecret: "" });
		expect(out).toEqual({ google: false, bing: true });
		expect(stored).toMatchObject({ bingEnabled: true, bingApiKey: "AnotherFixtureBingKeyPlaceholder" });
		expect(deleted).toEqual(["gscClientSecret"]);
		await expect(call("search/connect", { gscServiceAccount: "{\"client_email\":\"x\"}" })).rejects.toMatchObject({ code: "invalid_service_account" });
		await expect(call("search/connect", { bingApiKey: "not a key!" })).rejects.toMatchObject({ code: "invalid_api_key" });
		await expect(call("search/connect", { bingApiKey: "x", extra: 1 })).rejects.toThrow();
	});
});

describe("page queries on demand", () => {
	beforeEach(() => clearReportCache());

	it("calls GetPageQueryStats once per page and hour", async () => {
		const env = await schemaDb();
		const b = fakeBing();
		let now = T0;
		const ctx = { http: b.http, kv: env.kv, settings: bingSettings(), now: () => now };
		const first = await pageQueries(ctx, "https://www.example.com/", "https://www.example.com/widgets");
		expect(first).toContainEqual({ query: "widget shop", day: "2026-03-06", clicks: 1, impressions: 10, pos_sum: 70 });
		await pageQueries(ctx, "https://www.example.com/", "https://www.example.com/widgets");
		expect(b.calls).toHaveLength(1);
		expect(b.calls[0]?.params.page).toBe("https://www.example.com/widgets");
		now += 3_600_001;
		await pageQueries(ctx, "https://www.example.com/", "https://www.example.com/widgets");
		expect(b.calls).toHaveLength(2);
	});

	it("search_page_queries serves Bing on demand and merges it with stored Google rows for All", async () => {
		const env = await schemaDb();
		const b = fakeBing();
		const s = bingSettings();
		env.raw.exec(
			"INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional) VALUES ('default', 'google', '2026-03-06', '/widgets', 'blue widgets', '', '', 3, 30, 60, 0)",
		);
		const run = (source: "all" | "google" | "bing") =>
			answer(
				{ db: async () => env.db, settings: async () => s, now: () => T0 / 1000 },
				{ input: {}, storage: {}, kv: env.kv, http: b.http },
				{ report: "search_page_queries", query: { from: "2026-03-01", to: "2026-03-12", filters: [], compare: "none", granularity: "auto" }, params: { page: "/widgets", source } },
			);
		const onlyBing = await run("bing");
		// 2026-02-27 is outside the range.
		expect(onlyBing.data.rows).toEqual([
			{ key: "blue widgets", clicks: 2, impressions: 20, ctr: 0.1, position: 3 },
			{ key: "widget shop", clicks: 1, impressions: 10, ctr: 0.1, position: 7 },
		]);
		expect(b.calls[0]?.params.page).toBe("https://www.example.com/widgets");
		const all = await run("all");
		expect(all.data.rows?.[0]).toEqual({ key: "blue widgets", clicks: 5, impressions: 50, ctr: 0.1, position: 2.4 });
		expect((await run("google")).data.rows).toEqual([{ key: "blue widgets", clicks: 3, impressions: 30, ctr: 0.1, position: 2 }]);
		// Served from the one hour cache.
		expect(b.calls).toHaveLength(1);
	});

	it("GetQueryPageStats once per query and hour; the cannibalization query drill-down maps URLs to page keys", async () => {
		const env = await schemaDb();
		const b = fakeBing();
		const s = bingSettings();
		let now = T0;
		const ctx = { http: b.http, kv: env.kv, settings: s, now: () => now };
		const rows = await queryPages(ctx, "https://www.example.com/", "blue widgets");
		expect(rows[0]).toEqual({ url: "https://www.example.com/widgets", day: "2026-03-06", clicks: 2, impressions: 40, pos_sum: 160 });
		await queryPages(ctx, "https://www.example.com/", "blue widgets");
		expect(b.calls).toHaveLength(1);
		expect(b.calls[0]).toMatchObject({ method: "GetQueryPageStats", params: { siteUrl: "https://www.example.com/", query: "blue widgets" } });
		expect([...env.kv.data.keys()].some((k) => k.startsWith("search:querypages:"))).toBe(true);
		now += 3_600_001;
		await queryPages(ctx, "https://www.example.com/", "blue widgets");
		expect(b.calls).toHaveLength(2);

		const env2 = await schemaDb();
		const b2 = fakeBing();
		env2.raw.exec(
			"INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional) VALUES ('default', 'google', '2026-03-06', '/widgets', 'blue widgets', '', '', 3, 60, 120, 0)",
		);
		const run = (source: "all" | "google" | "bing") =>
			answer(
				{ db: async () => env2.db, settings: async () => s, now: () => T0 / 1000 },
				{ input: {}, storage: {}, kv: env2.kv, http: b2.http },
				{ report: "search_cannibalization_query", query: { from: "2026-03-01", to: "2026-03-12", filters: [], compare: "none", granularity: "auto" }, params: { query: "blue widgets", source } },
			);
		const onlyBing = await run("bing");
		// Another host is dropped; the trailing slash is normalized like every page key.
		expect(onlyBing.data.page_list).toEqual([
			{ page: "/widgets", impressions: 40, impressions_share: 0.8, clicks: 2, clicks_share: 1, position: 4 },
			{ page: "/widgets/blue", impressions: 10, impressions_share: 0.2, clicks: 0, clicks_share: 0, position: 9 },
		]);
		const all = await run("all");
		expect((all.data.page_list as Array<Record<string, unknown>>)[0]).toMatchObject({ page: "/widgets", impressions: 100, clicks: 5, position: 2.8 });
		expect((await run("google")).data.page_list).toEqual([{ page: "/widgets", impressions: 60, impressions_share: 1, clicks: 3, clicks_share: 1, position: 2 }]);
		expect(b2.calls).toHaveLength(1);
	});
});
