/** Dashboard record and the per-site store: kind map, limits, typed errors. */
import { describe, expect, it } from "vitest";
import { DashboardError, DashboardInput, dropIndex, reorder, slotTarget, MAX_DASHBOARDS_PER_SITE, MAX_RECORD_BYTES, MAX_TILES, readDashboard, TILE_KIND_NAMES, TILE_KINDS, TILE_METRICS, TILE_REPORTS, TileSchema, type TileReport } from "../src/dashboards/schema.js";
import { deleteDashboard, getDashboard, listDashboards, saveDashboard } from "../src/dashboards/store.js";
import { REPORT_NAMES } from "../src/query/reports/index.js";
import { memColl } from "./agent.helpers.js";
import { dashInput, kpi, tileId } from "./fixtures/dashboards.js";

/** A tile of `report` and `kind` with whatever params and metric its report needs. */
function tileFor(report: TileReport, kind: string) {
	const params =
		report === "goals"
			? { goal: "g1" }
			: report === "funnels"
				? { funnel: "f1" }
				: report === "event_props"
					? { event: "signup" }
					: report === "impact"
						? { annotation: "latest", report: "overview" as const }
						: report === "revenue_breakdown"
							? { dim: "channel" as const }
							: undefined;
	const metric = report === "impact" ? "sessions" : TILE_METRICS[report]?.[0];
	return { id: tileId(), report, kind, w: 1, ...(params ? { params } : {}), ...(metric && kind === "kpi" ? { metric } : {}), ...(metric && (kind === "line" || kind === "area") ? { metrics: [metric] } : {}) };
}

const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof DashboardError ? e.code : String(e)));

describe("dashboard schema", () => {
	it("covers every report but dimension_values and the drill-downs", () => {
		const drill = ["dimension_values", "search_page_queries", "search_cannibalization_page", "search_cannibalization_query", "journey_next", "journey_prev", "sites_summary", "revenue_orders", "annotation_impacts"];
		expect([...TILE_REPORTS].sort()).toEqual(REPORT_NAMES.filter((r) => !drill.includes(r)).sort());
	});

	it("accepts every TILE_KINDS pair and rejects every other pair", () => {
		for (const report of TILE_REPORTS)
			for (const kind of TILE_KIND_NAMES) {
				const ok = (TILE_KINDS[report] as readonly string[]).includes(kind);
				expect(TileSchema.safeParse(tileFor(report, kind)).success, `${report} ${kind}`).toBe(ok);
			}
	});

	it("needs a metric on kpi, line and area tiles, and a known one", () => {
		expect(TileSchema.safeParse({ id: "abc123", report: "overview", kind: "kpi", w: 1 }).success).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "overview", kind: "kpi", metric: "clicks", w: 1 }).success).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "timeseries", kind: "line", w: 3 }).success).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "goals", kind: "kpi", metric: "converting", w: 1 }).success).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "channels", kind: "bars", w: 4 }).success).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "channels", kind: "bars", w: 1, params: { source: "google" } }).success).toBe(false);
	});

	it("rejects dimension_values as a tile report, a range outside the viewer ranges and duplicate tile ids", () => {
		expect(DashboardInput.safeParse(dashInput({ tiles: [{ id: "abc123", report: "dimension_values", kind: "table", w: 1 }] })).success).toBe(false);
		expect(DashboardInput.safeParse(dashInput({ defaults: { range: "90d", compare: "none", filters: [] } })).success).toBe(false);
		expect(DashboardInput.safeParse(dashInput({ tiles: [kpi("visitors", { id: "aaaaaa" }), kpi("sessions", { id: "aaaaaa" })] })).success).toBe(false);
		expect(DashboardInput.safeParse(dashInput()).success).toBe(true);
	});

	it("journey_paths is a table tile with params.entry; the drill-downs are not tiles", () => {
		const t = (x: Record<string, unknown>) => TileSchema.safeParse({ id: "abc123", report: "journey_paths", kind: "table", w: 2, ...x }).success;
		expect(t({})).toBe(true);
		expect(t({ params: { entry: "/blog" } })).toBe(true);
		expect(t({ params: { entry: "blog" } })).toBe(false);
		expect(t({ kind: "bars" })).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "overview", kind: "kpi", metric: "visitors", w: 1, params: { entry: "/" } }).success).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "journey_next", kind: "table", w: 1 }).success).toBe(false);
	});

	it("collections is a bars, donut or table tile; site_search a table tile", () => {
		const t = (report: string, kind: string) => TileSchema.safeParse({ id: "abc123", report, kind, w: 2 }).success;
		for (const kind of ["bars", "donut", "table"]) expect(t("collections", kind), kind).toBe(true);
		expect(t("collections", "kpi")).toBe(false);
		expect(t("site_search", "table")).toBe(true);
		for (const kind of ["bars", "donut", "kpi", "line"]) expect(t("site_search", kind), kind).toBe(false);
	});

	it("accepts defaults.compare segment with defaults.compareSegment only together", () => {
		const d = (defaults: Record<string, unknown>) => DashboardInput.safeParse(dashInput({ defaults: { range: "30d", filters: [], ...defaults } })).success;
		expect(d({ compare: "segment", compareSegment: "seg1" })).toBe(true);
		expect(d({ compare: "segment" })).toBe(false);
		expect(d({ compare: "previous", compareSegment: "seg1" })).toBe(false);
		expect(d({ compare: "none" })).toBe(true);
	});

	it("accepts viewer.annotations as an optional boolean; a record without it reads unchanged (off)", () => {
		const base = dashInput();
		expect(DashboardInput.safeParse({ ...base, viewer: { ...base.viewer, annotations: true } }).success).toBe(true);
		expect(DashboardInput.safeParse({ ...base, viewer: { ...base.viewer, annotations: "yes" } }).success).toBe(false);
		const old = { id: "abcdefabcdef", site: "default", v: 1, ...base, created: 1, updated: 1 };
		const read = readDashboard(old);
		expect(read.viewer).toEqual(base.viewer);
		expect(read.viewer.annotations).toBeUndefined();
	});

	it("reads only format version 1", () => {
		expect(() => readDashboard({ id: "abcdefabcdef", site: "default", v: 2 })).toThrow(expect.objectContaining({ code: "unknown_version" }));
	});
});

describe("dashboard store", () => {
	it("saves, lists by site, reads, updates and deletes", async () => {
		const coll = memColl();
		const d = await saveDashboard(coll, "default", dashInput(), 100);
		expect(d).toMatchObject({ site: "default", v: 1, created: 100, updated: 100 });
		expect(d.id).toMatch(/^[a-z0-9]{12}$/);
		await saveDashboard(coll, "blog", dashInput({ name: "Blog" }), 101);
		expect((await listDashboards(coll, "default")).map((x) => x.name)).toEqual(["Weekly"]);
		const u = await saveDashboard(coll, "default", { ...dashInput({ name: "Renamed" }), id: d.id }, 200);
		expect(u).toMatchObject({ id: d.id, created: 100, updated: 200, name: "Renamed" });
		expect(await getDashboard(coll, "blog", d.id)).toBeNull();
		expect(await deleteDashboard(coll, "blog", d.id)).toBe(false);
		expect(await deleteDashboard(coll, "default", d.id)).toBe(true);
		expect(await listDashboards(coll, "default")).toEqual([]);
	});

	it("enforces the limits with typed errors", async () => {
		const coll = memColl();
		const tiles = Array.from({ length: MAX_TILES + 1 }, () => kpi("visitors"));
		expect(await code(saveDashboard(coll, "default", dashInput({ tiles }), 1))).toBe("too_many_tiles");
		for (let i = 0; i < MAX_DASHBOARDS_PER_SITE; i++) await saveDashboard(coll, "default", dashInput(), i);
		expect(await code(saveDashboard(coll, "default", dashInput(), 99))).toBe("too_many_dashboards");
		expect(await code(saveDashboard(coll, "other", dashInput(), 99))).toBe("ok");
		const big = Array.from({ length: 10 }, () => ({ dim: "page", op: "is", values: Array.from({ length: 4 }, (_, i) => `/${"x".repeat(500)}${i}`) }));
		expect(JSON.stringify(big).length).toBeGreaterThan(MAX_RECORD_BYTES);
		expect(await code(saveDashboard(memColl(), "default", dashInput({ defaults: { range: "30d", compare: "none", filters: big } }), 1))).toBe("record_too_large");
		const err = await saveDashboard(memColl(), "default", dashInput({ tiles: [kpi("visitors"), { id: "zzzzzz", report: "dimension_values", kind: "table", w: 1 }] }), 1).catch((e: DashboardError) => e);
		expect(err).toMatchObject({ code: "invalid_dashboard", tiles: ["zzzzzz"] });
		coll.items.set("old000000000", { id: "old000000000", site: "default", v: 7 });
		expect(await code(getDashboard(coll, "default", "old000000000"))).toBe("unknown_version");
	});
});

describe("SEO and impact tiles", () => {
	const t = (o: Record<string, unknown>) => TileSchema.safeParse({ id: "abc123", w: 1, ...o }).success;
	it("stacked only for the bands series; params validated per report by TILE_PARAMS", () => {
		expect(t({ report: "search_position_bands_series", kind: "stacked", metric: "impressions" })).toBe(true);
		expect(t({ report: "search_position_bands_series", kind: "stacked", metric: "band_1_3" })).toBe(false);
		expect(t({ report: "search_position_bands_series", kind: "line", metrics: ["band_1_3"], params: { metric: "impressions", dim: "page" } })).toBe(true);
		for (const report of TILE_REPORTS) if (report !== "search_position_bands_series") expect(t({ report, kind: "stacked" }), report).toBe(false);
		expect(t({ report: "search_movers", kind: "table", params: { direction: "up", dim: "query", metric: "impressions", minImpressions: 10, source: "google" } })).toBe(true);
		expect(t({ report: "search_movers", kind: "table", params: { minShare: 10 } })).toBe(false);
		expect(t({ report: "traffic_movers", kind: "table", params: { direction: "down" } })).toBe(true);
		expect(t({ report: "traffic_movers", kind: "table", params: { source: "google" } })).toBe(false);
		expect(t({ report: "search_cannibalization", kind: "kpi", metric: "visible_share", params: { minShare: 20, includeBrand: true } })).toBe(true);
		expect(t({ report: "search_cannibalization", kind: "table", params: { direction: "up" } })).toBe(false);
		expect(t({ report: "pages", kind: "table", params: { dim: "page" } })).toBe(false);
		expect(t({ report: "search_position_bands", kind: "kpi", metric: "queries_51_plus" })).toBe(true);
		expect(t({ report: "search_position_moves", kind: "kpi", metric: "moved_up" })).toBe(true);
	});

	it("impact tiles: kpi and line, a target report, a metric of that report, an annotation or a date", () => {
		expect(t({ report: "impact", kind: "kpi", metric: "sessions", params: { annotation: "latest", report: "overview", window: 28 } })).toBe(true);
		expect(t({ report: "impact", kind: "line", metrics: ["clicks"], params: { at: "2026-03-10", report: "search_overview", source: "google" } })).toBe(true);
		expect(t({ report: "impact", kind: "kpi", metric: "sessions", params: { annotation: "latest", report: "channels", key: "Organic Search", scope: "none", path: "/a" } })).toBe(true);
		expect(t({ report: "impact", kind: "kpi", metric: "completions", params: { annotation: "latest", report: "goals", goal: "Signup" } })).toBe(true);
		expect(t({ report: "impact", kind: "kpi", metric: "clicks", params: { annotation: "latest", report: "overview" } })).toBe(false);
		expect(t({ report: "impact", kind: "kpi", metric: "sessions", params: { report: "overview" } })).toBe(false);
		expect(t({ report: "impact", kind: "kpi", metric: "sessions", params: { annotation: "latest", report: "overview", window: 30 } })).toBe(false);
		expect(t({ report: "impact", kind: "table", metric: "sessions", params: { annotation: "latest", report: "overview" } })).toBe(false);
	});

	it("a dashboard saved before the SEO views still validates (v 1, optional params)", () => {
		expect(readDashboard({ id: "abcdefabcdef", site: "default", v: 1, created: 1, updated: 1, ...dashInput() }).v).toBe(1);
	});
});

describe("reorder and dropIndex", () => {
	const L = ["a", "b", "c", "d"];
	it.each([
		["empty", [], 0, 0, []],
		["one item", ["a"], 0, 0, ["a"]],
		["first to last", L, 0, 3, ["b", "c", "d", "a"]],
		["last to first", L, 3, 0, ["d", "a", "b", "c"]],
		["middle down one", L, 1, 2, ["a", "c", "b", "d"]],
		["to beyond the end is clamped", L, 0, 99, ["b", "c", "d", "a"]],
		["to below zero is clamped", L, 2, -5, ["c", "a", "b", "d"]],
		["from out of range", L, 7, 0, L],
		["from negative", L, -1, 0, L],
	] as const)("reorder %s", (_n, list, from, to, want) => {
		const before = [...list];
		expect(reorder(list, from, to)).toEqual(want);
		expect(list).toEqual(before);
	});

	// Four rows of 40 px from y = 100: middles at 120, 160, 200, 240.
	const rects = [0, 1, 2, 3].map((i) => ({ top: 100 + i * 40, height: 40 }));
	it.each([
		["empty", [], 500, 0],
		["one item, above its middle", [{ top: 0, height: 40 }], 10, 0],
		["one item, below its middle", [{ top: 0, height: 40 }], 30, 1],
		["above the list", rects, 0, 0],
		["inside the first row, upper half", rects, 110, 0],
		["between rows two and three", rects, 181, 2],
		["below the list", rects, 999, 4],
	] as const)("dropIndex %s", (_n, r, y, want) => {
		expect(dropIndex(r, y)).toBe(want);
	});

	it("drag first to last and last to first through the slot", () => {
		expect(reorder(L, 0, slotTarget(0, dropIndex(rects, 999)))).toEqual(["b", "c", "d", "a"]);
		expect(reorder(L, 3, slotTarget(3, dropIndex(rects, 0)))).toEqual(["d", "a", "b", "c"]);
		expect(reorder(L, 1, slotTarget(1, dropIndex(rects, 150)))).toEqual(L);
	});
});
