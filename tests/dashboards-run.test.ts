/** Dashboard runner against a spy dispatcher. */
import { describe, expect, it, vi } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { type RunnerCtx, runDashboard } from "../src/dashboards/run.js";
import { type Dashboard, DashboardSchema } from "../src/dashboards/schema.js";
import type { Filter } from "../src/query/filters.js";
import type { Body } from "../src/routes/data.js";
import type { ReportResult } from "../src/query/reports/index.js";
import { kpi, tileId } from "./fixtures/dashboards.js";
import * as scope from "../src/annotations/scope.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { answer, type DataCtx, loadAnnotations } from "../src/routes/data.js";
import { seed, seedSearch } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";

vi.mock("../src/annotations/scope.js", async (orig) => {
	const real = await orig<typeof import("../src/annotations/scope.js")>();
	return { ...real, matchAnnotations: vi.fn(real.matchAnnotations) };
});

const NOW = zonedToEpoch("2026-03-15", 12, "UTC");

function dash(tiles: Dashboard["tiles"], defaults: Partial<Dashboard["defaults"]> = {}): Dashboard {
	return DashboardSchema.parse({
		id: "abcdefabcdef",
		site: "default",
		v: 1,
		name: "D",
		tiles,
		defaults: { range: "7d", compare: "none", filters: [], ...defaults },
		viewer: { ranges: ["7d", "30d"], compare: true },
		created: 1,
		updated: 1,
	});
}

function ctx(over: Partial<RunnerCtx> = {}) {
	let active = 0;
	let peak = 0;
	const dispatch = vi.fn(async (body: Body): Promise<ReportResult> => {
		active++;
		peak = Math.max(peak, active);
		await new Promise((r) => setTimeout(r, 2));
		active--;
		if (body.report === "funnels") throw Object.assign(new Error("Unknown funnel."), { code: "unknown_funnel" });
		return { report: body.report, range: body.query, compare: body.query.compare, compareRange: null, data: { totals: { visitors: 1 } }, notices: [] } as ReportResult;
	});
	const rc: RunnerCtx = { site: "default", tz: "UTC", now: NOW, dispatch, segmentExists: async (id) => id === "seg1", ...over };
	return { rc, dispatch, peak: () => peak };
}

describe("runDashboard", () => {
	it("runs four KPI tiles of overview as one request", async () => {
		const { rc, dispatch } = ctx();
		const r = await runDashboard(rc, dash(["visitors", "sessions", "pageviews", "bounce_rate"].map((m) => kpi(m))));
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(r.requests).toBe(1);
		expect(r.tiles).toHaveLength(4);
		expect(r.range).toEqual({ from: "2026-03-09", to: "2026-03-15" });
		expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ report: "overview", query: { from: "2026-03-09", to: "2026-03-15", compare: "none", site: "default", filters: [] } });
	});

	it("runs tiles with different filters as separate requests, defaults first", async () => {
		const { rc, dispatch } = ctx();
		const f: Filter = { dim: "country", op: "is", values: ["DE"] };
		const d: Filter = { dim: "channel", op: "is", values: ["Direct"] };
		const r = await runDashboard(rc, dash([kpi("visitors"), kpi("visitors", { filters: [f] })], { filters: [d] }), { range: "30d", compare: "previous" });
		expect(dispatch).toHaveBeenCalledTimes(2);
		expect(r.requests).toBe(2);
		expect(dispatch.mock.calls[1]?.[0].query).toMatchObject({ from: "2026-02-14", compare: "previous", filters: [d, f] });
	});

	it("never runs more than two requests at once and the count equals the dispatcher calls", async () => {
		const { rc, dispatch, peak } = ctx();
		const reports = ["pages", "channels", "sources", "countries", "devices", "browsers"] as const;
		const r = await runDashboard(rc, dash(reports.map((report) => ({ id: tileId(), report, kind: "table", w: 1 }))));
		expect(peak()).toBe(2);
		expect(r.requests).toBe(dispatch.mock.calls.length);
		expect(r.requests).toBe(6);
		expect(dispatch.mock.calls[0]?.[0].limit).toBe(10);
	});

	it("a deleted segment gives segment_missing and the tile still runs without it", async () => {
		const { rc, dispatch } = ctx();
		const r = await runDashboard(rc, dash([kpi("visitors")], { segment: "gone" }));
		expect(r.tiles[0]).toMatchObject({ notices: ["segment_missing"], result: { report: "overview" } });
		expect(dispatch.mock.calls[0]?.[0].query).not.toHaveProperty("segment");
		const ok = await runDashboard(ctx().rc, dash([kpi("visitors")], { segment: "seg1" }));
		expect(ok.tiles[0]?.notices).toEqual([]);
	});

	it("defaults.compareSegment compares segments on the same range; a deleted one runs without comparison and says so", async () => {
		const { rc, dispatch } = ctx();
		const tiles = [kpi("visitors"), { id: tileId(), report: "search_queries" as const, kind: "table" as const, w: 1 as const }, { id: tileId(), report: "traffic_movers" as const, kind: "table" as const, w: 1 as const }];
		const r = await runDashboard(rc, dash(tiles, { compare: "segment", compareSegment: "seg1" }));
		expect(r.compare).toBe("segment");
		expect(dispatch.mock.calls.map((c) => [c[0].report, c[0].query.compare, c[0].query.compareSegment])).toEqual([
			["overview", "segment", "seg1"],
			["search_queries", "none", undefined],
			["traffic_movers", "none", undefined],
		]);
		expect(r.tiles[0]?.notices).toEqual([]);
		const gone = ctx();
		const g = await runDashboard(gone.rc, dash([kpi("visitors")], { compare: "segment", compareSegment: "gone" }));
		expect(g.tiles[0]).toMatchObject({ notices: ["compare_segment_missing"], result: { report: "overview" } });
		expect(gone.dispatch.mock.calls[0]?.[0].query).toMatchObject({ compare: "none" });
		expect(gone.dispatch.mock.calls[0]?.[0].query).not.toHaveProperty("compareSegment");
		// A share link without ?c=1 runs without comparison and never checks the compare segment.
		const off = ctx();
		await runDashboard(off.rc, dash([kpi("visitors")], { compare: "segment", compareSegment: "gone" }), { compare: "none" });
		expect(off.dispatch.mock.calls[0]?.[0].query.compare).toBe("none");
	});

	it("reports a failing tile as an error and keeps the others", async () => {
		const { rc } = ctx();
		const r = await runDashboard(rc, dash([kpi("visitors"), { id: tileId(), report: "funnels", kind: "table", w: 1, params: { funnel: "f1" } }]));
		expect(r.tiles[0]?.result).toBeTruthy();
		expect(r.tiles[1]).toMatchObject({ error: { code: "unknown_funnel" } });
	});
});

describe("runDashboard annotations", () => {
	const TS = Date.UTC(2026, 2, 11, 12) / 1000;
	const items = {
		w: { site: "default", ts: TS, kind: "manual", text: "Wide" },
		p: { site: "default", ts: TS + 1, kind: "manual", text: "Pricing", scope: { v: 1, path: [{ op: "is", value: "/pricing" }] } },
		q: { site: "default", ts: TS + 2, kind: "manual", text: "Query", scope: { v: 1, query: [{ op: "is", value: "cookieless" }] } },
	};
	async function setup() {
		const env = await schemaDb();
		const settings = await seed(env, "UTC");
		await seedSearch(env);
		const reads: unknown[] = [];
		const storage = {
			segments: { query: async () => ({ items: [], hasMore: false }), get: async (id: string) => (id === "seg1" ? { site: "default", filters: [{ dim: "country", op: "is", values: ["DE"] }] } : null) },
			annotations: {
				query: async (o: unknown) => (reads.push(o), { items: Object.entries(items).map(([id, data]) => ({ id, data })), hasMore: false }),
				get: async () => null,
			},
		};
		const dctx = { input: null, storage } as unknown as DataCtx;
		const denv = { db: async () => env.db, settings: async () => settings, now: () => NOW };
		const rc: RunnerCtx = {
			site: "default",
			tz: "UTC",
			now: NOW,
			dispatch: (b, a) => answer(denv, dctx, b, a),
			loadAnnotations: (r) => loadAnnotations(storage.annotations, "default", r.from, r.to, "UTC"),
			segmentExists: async (id) => id === "seg1",
		};
		return { rc, reads };
	}
	const line = (report: "timeseries" | "search_overview", filters: Filter[] = []) => ({ id: tileId(), report, kind: "line" as const, metrics: [report === "timeseries" ? "sessions" : "clicks"], w: 1 as const, filters });
	const texts = (r: ReportResult | undefined) => ((r?.data.annotations ?? []) as Array<{ text: string }>).map((a) => a.text);

	it("reads once per run and matches with defaults, segment and tile filters and the tile's target", async () => {
		clearReportCache();
		const { rc, reads } = await setup();
		const spy = vi.mocked(scope.matchAnnotations);
		spy.mockClear();
		const pageFilter: Filter = { dim: "page", op: "is", values: ["/pricing"] };
		const d = dash([line("timeseries", [pageFilter]), line("search_overview"), kpi("visitors")], { segment: "seg1", filters: [{ dim: "channel", op: "is", values: ["Direct"] }] });
		const run = await runDashboard(rc, d, { annotations: true });
		expect(reads).toHaveLength(1);
		expect(texts(run.tiles[0]?.result)).toEqual(["Wide", "Pricing"]);
		expect(texts(run.tiles[1]?.result)).toEqual(["Wide", "Pricing", "Query"]);
		expect(run.tiles[2]?.result?.data.annotations).toBeUndefined();
		const contexts = spy.mock.calls.map((c) => c[1]);
		const traffic = contexts.find((c) => c.target === "traffic");
		expect(traffic?.filters).toEqual(expect.arrayContaining([{ dim: "country", op: "is", values: ["DE"] }, { dim: "channel", op: "is", values: ["Direct"] }, pageFilter]));
		expect(traffic?.filters).toHaveLength(3);
		expect(contexts.some((c) => c.target === "search")).toBe(true);
	});

	it("attaches nothing and reads nothing when annotations are off", async () => {
		clearReportCache();
		const { rc, reads } = await setup();
		const run = await runDashboard(rc, dash([line("timeseries")]));
		expect(reads).toHaveLength(0);
		expect(texts(run.tiles[0]?.result)).toEqual([]);
	});
});

describe("Free plan budget of the SEO templates", () => {
	it("SEO overview and Impact of last changes stay under 40 statements with compare off", async () => {
		const { readTemplate, fromTemplate } = await import("../src/dashboards/templates.js");
		const env = await schemaDb();
		const settings = await seed(env, "UTC");
		await seedSearch(env);
		let statements = 0;
		const db: typeof env.db = { ...env.db, all: (sql, p) => (statements++, env.db.all(sql, p)), run: (sql, p) => (statements++, env.db.run(sql, p)) };
		const annotations = { query: async () => ({ items: [{ id: "a1", data: { site: "default", ts: Date.UTC(2026, 2, 11, 12) / 1000, kind: "manual", text: "Change" } }], hasMore: false }), get: async () => null };
		const dctx = { input: null, storage: { annotations } } as unknown as DataCtx;
		const denv = { db: async () => db, settings: async () => settings, now: () => NOW };
		const rc: RunnerCtx = { site: "default", tz: "UTC", now: NOW, dispatch: (b, a) => answer(denv, dctx, b, a), segmentExists: async () => false };
		for (const name of ["seo-overview", "impact-last-changes"]) {
			clearReportCache();
			statements = 0;
			const { dashboard } = await fromTemplate(readTemplate({ builtin: name }), { segments: [], goals: [], funnels: [] }, { createDependencies: false });
			const run = await runDashboard(rc, DashboardSchema.parse({ ...dashboard, id: "abcdefabcdef", site: "default", v: 1, created: 1, updated: 1 }), { compare: "none" });
			expect(run.tiles.filter((t) => t.error).map((t) => t.error), name).toEqual([]);
			expect(statements, name).toBeLessThan(40);
		}
	});
});

describe("cannibalization tiles with compare on", () => {
	it("run without compare, the other tiles keep it", async () => {
		const { rc, dispatch } = ctx();
		await runDashboard(rc, dash([{ id: tileId(), report: "search_cannibalization", kind: "table", w: 3 }, kpi("visitors")], { compare: "previous" }));
		const sent = dispatch.mock.calls.map((c) => [c[0].report, c[0].query.compare]);
		expect(sent).toEqual(expect.arrayContaining([["search_cannibalization", "none"], ["overview", "previous"]]));
	});
});

describe("the Revenue template", () => {
	it("runs under 25 statements with compare off, resolves the currency per site, and keeps the tile and record caps", async () => {
		const { readTemplate, fromTemplate } = await import("../src/dashboards/templates.js");
		const { tileData } = await import("../src/dashboards/tiles.js");
		const { MAX_RECORD_BYTES, MAX_TILES } = await import("../src/dashboards/schema.js");
		const { seedRevenue, REV_GOALS } = await import("./fixtures/revenue.js");
		const { sitesColl } = await import("./helpers.js");
		const env = await schemaDb();
		seedRevenue(env.raw);
		seedRevenue(env.raw, "shop");
		const settings = { ...(await seed(await schemaDb(), "UTC")), defaultCurrency: "USD" };
		let statements = 0;
		const db: typeof env.db = { ...env.db, all: (sql, p) => (statements++, env.db.all(sql, p)), run: (sql, p) => (statements++, env.db.run(sql, p)) };
		const sites = sitesColl([{ id: "shop", hosts: ["shop.example.com"] }]);
		(sites.items.get("shop") as Record<string, unknown>).defaultCurrency = "EUR";
		const goals = { query: async (o?: { where?: { site?: string } }) => ({ items: REV_GOALS.map((g, i) => ({ id: `g${i}`, data: { ...g, site: o?.where?.site ?? "default" } })), hasMore: false }), get: async () => null };
		const dctx = { input: null, storage: { sites, goals } } as unknown as DataCtx;
		const denv = { db: async () => db, settings: async () => settings, now: () => Date.UTC(2026, 2, 12, 12) / 1000 };
		const { dashboard } = await fromTemplate(readTemplate({ builtin: "revenue" }), { segments: [], goals: [], funnels: [] }, { createDependencies: false });
		const record = DashboardSchema.parse({ ...dashboard, id: "abcdefabcdef", site: "default", v: 1, created: 1, updated: 1 });
		expect(record.tiles.length).toBeLessThanOrEqual(MAX_TILES);
		expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThan(MAX_RECORD_BYTES);
		for (const [site, cur] of [["default", "USD"], ["shop", "EUR"]] as const) {
			clearReportCache();
			statements = 0;
			const rc: RunnerCtx = { site, tz: "UTC", now: Date.UTC(2026, 2, 12, 12) / 1000, dispatch: (b, a) => answer(denv, dctx, b, a), segmentExists: async () => false };
			const run = await runDashboard(rc, record, { compare: "none" });
			expect(run.tiles.filter((t) => t.error).map((t) => t.error), site).toEqual([]);
			expect(statements, site).toBeLessThanOrEqual(25);
			// Measured: revenue 2, revenue_series 3, four breakdowns of 4.
			expect(statements, site).toBe(21);
			const kpi = tileData(record.tiles[0] as Dashboard["tiles"][number], run.tiles[0]?.result as ReportResult);
			expect(kpi.currency, site).toBe(cur);
			expect(kpi.value, site).toBe(cur === "USD" ? 94.9 : 120);
		}
	});
});
