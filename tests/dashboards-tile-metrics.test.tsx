// @vitest-environment jsdom
/** Line and area tiles with several metrics: schema rules, axes as on the report pages, labels, shared page and email. */
import { describe, expect, it } from "vitest";
import { assignAxes, type MetricDef } from "../src/admin/components/MetricChart.js";
import { METRICS } from "../src/admin/components/format.js";
import { renderEmail } from "../src/dashboards/email.js";
import { renderShared } from "../src/dashboards/render.js";
import { type Dashboard, metricFamily, readDashboard, TileSchema, tileMetricsProblem } from "../src/dashboards/schema.js";
import { lineAxes, metricLabel, TABLE_TILE_COLUMNS, type TileData, tileData, tileTitle, TRIMMED_COMPARE } from "../src/dashboards/tiles.js";

const line = (metrics: unknown, o: Record<string, unknown> = {}) => TileSchema.safeParse({ id: "abc123", report: "search_overview", kind: "line", w: 3, metrics, ...o });
const result = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ report: "timeseries", range: { from: "2026-03-01", to: "2026-03-14" }, compare: "none", compareRange: null, notices: [], data, ...extra }) as never;

describe("tile metrics schema", () => {
	it("takes 1 to 4 known metrics on at most two scales, and refuses metric on a line", () => {
		expect(line(["clicks", "impressions"]).success).toBe(true);
		expect(line(["clicks", "position"]).success).toBe(true);
		expect(line(["clicks", "impressions", "ctr"]).success).toBe(true);
		// Count, percent and rank: three scales.
		expect(line(["clicks", "ctr", "position"]).success).toBe(false);
		expect(line([]).success).toBe(false);
		expect(line(["clicks", "clicks"]).success).toBe(false);
		expect(line(["visitors"]).success).toBe(false);
		expect(line(undefined, { metric: "clicks" }).success).toBe(false);
		expect(line(["clicks"], { metric: "clicks" }).success).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "timeseries", kind: "line", w: 3, metrics: ["visitors", "sessions", "pageviews", "views_per_session", "bounce_rate"] }).success).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "overview", kind: "kpi", w: 1, metric: "visitors", metrics: ["visitors"] }).success).toBe(false);
		expect(TileSchema.safeParse({ id: "abc123", report: "impact", kind: "line", w: 2, metrics: ["sessions", "visitors"], params: { annotation: "latest", report: "overview" } }).success).toBe(false);
	});

	it("names the refusal and the scale family", () => {
		expect(tileMetricsProblem(["clicks"])).toBeNull();
		expect(tileMetricsProblem([])).toBe("Choose at least one metric.");
		expect(tileMetricsProblem(["a", "b", "c", "d", "e"])).toBe("Up to 4 metrics at once.");
		expect(tileMetricsProblem(["clicks", "ctr", "position"])).toBe("These metrics need more than two scales.");
		expect(["clicks", "ctr", "position", "avg_duration", "revenue", "views_per_session"].map(metricFamily)).toEqual(["count", "percent", "rank", "duration", "money", "decimal"]);
	});
});

describe("tile lines", () => {
	it("reads every metric per bucket with the comparison and its dates, and titles the tile by its metrics", () => {
		const tile = TileSchema.parse({ id: "abc123", report: "timeseries", kind: "line", w: 3, metrics: ["visitors", "sessions"] });
		const series = [
			{ t: "2026-03-01", visitors: 10, sessions: 12 },
			{ t: "2026-03-02", visitors: null, sessions: 14 },
		];
		const d = tileData(tile, result({ series, compareSeries: series.map(() => ({ visitors: 8, sessions: 9 })) }, { compare: "previous", compareRange: { from: "2026-02-15", to: "2026-02-16" } }));
		expect(d.buckets).toEqual(["2026-03-01", "2026-03-02"]);
		expect(d.lines).toEqual([
			{ key: "visitors", values: [10, null], compare: [8, 8] },
			{ key: "sessions", values: [12, 14], compare: [9, 9] },
		]);
		expect(d.compareLabel).toBe("15 Feb to 16 Feb");
		expect(tileTitle(tile)).toBe("Visitors and Sessions over time");
	});

	it("puts the axes where the report pages put them", () => {
		const def = (key: string): MetricDef => ({ key, label: key, format: key === "ctr" ? "percent" : "number", ...(key === "position" ? { invert: true } : {}) });
		const cases: Array<Record<string, number>> = [{ visitors: 100, sessions: 140 }, { clicks: 312, impressions: 9200 }, { clicks: 300, position: 8 }, { clicks: 30, ctr: 0.04 }, { clicks: 5, impressions: 200, ctr: 0.02 }];
		for (const c of cases) {
			const keys = Object.keys(c);
			const tiles = lineAxes(keys.map((k) => ({ key: k, values: [c[k] ?? 0], compare: null })));
			expect(tiles, keys.join()).toEqual(assignAxes(keys.map(def), (k) => c[k] ?? 0).axis);
		}
	});

	it("labels every admin card metric as the cards do, and CTR in capitals", () => {
		for (const [k, m] of Object.entries(METRICS)) expect(metricLabel(k), k).toBe(m.label);
		expect(metricLabel("ctr")).toBe("CTR");
		expect(metricLabel("converting")).toBe("Conversions");
	});

	it("keeps the name and the first three figures of a table tile", () => {
		const tile = TileSchema.parse({ id: "abc123", report: "channels", kind: "table", w: 3 });
		const d = tileData(tile, result({ rows: [{ key: "Direct", visitors: 1, sessions: 2, pageviews: 3, bounce_rate: 0.2, ctr: 0.1 }] }));
		expect(d.columns).toHaveLength(TABLE_TILE_COLUMNS);
		expect(d.columns).toEqual(["key", "visitors", "sessions", "pageviews"]);
	});
});

const dash = (tiles: unknown[]): Dashboard =>
	readDashboard({ id: "abcdefabcdef", site: "default", v: 1, name: "Search", tiles, defaults: { range: "30d", compare: "none", filters: [] }, viewer: { ranges: ["30d"], compare: true }, created: 1, updated: 1 });
const lines = (keys: string[], compare: boolean): TileData => ({
	kind: "line",
	metric: keys[0] ?? null,
	value: null,
	buckets: ["2026-03-01", "2026-03-02", "2026-03-03"],
	lines: keys.map((k, i) => ({ key: k, values: [10 * (i + 1), 12 * (i + 1), 9 * (i + 1)], compare: compare ? [8, 9, 7] : null })),
	rows: [],
	columns: [],
	notices: [],
	...(compare ? { compareLabel: "1 Feb to 3 Feb" } : {}),
});
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("shared page and email with several lines", () => {
	it("draws one path per metric in its own colour, a right axis for a second scale, a legend and no script", () => {
		const d = dash([{ id: "l00001", report: "search_overview", kind: "line", metrics: ["clicks", "position"], w: 3 }]);
		const tile = { ...lines(["clicks", "position"], false) };
		const html = renderShared({ dashboard: d, tiles: [tile], range: "30d", compare: false, ranges: ["30d"], allowCompare: true, generatedAt: 1_773_000_000 });
		const doc = parse(html);
		const paths = [...doc.querySelectorAll("path[data-series]")];
		expect(paths.map((p) => p.getAttribute("data-series"))).toEqual(["clicks", "position"]);
		expect(new Set(paths.map((p) => p.getAttribute("stroke"))).size).toBe(2);
		expect(doc.querySelectorAll('text[text-anchor="end"]').length).toBeGreaterThan(3);
		expect(doc.querySelector(".lg")?.textContent).toContain("Position");
		expect(doc.querySelector(".caps")?.textContent).toBe("ClicksPosition");
		expect(html).not.toContain("<script");
	});

	it("shows the first two lines with a comparison and says so; the email lists every metric", () => {
		const d = dash([{ id: "l00001", report: "search_overview", kind: "line", metrics: ["clicks", "impressions", "ctr"], w: 3 }]);
		const tile = lines(["clicks", "impressions", "ctr"], true);
		const doc = parse(renderShared({ dashboard: d, tiles: [tile], range: "30d", compare: true, ranges: ["30d"], allowCompare: true, generatedAt: 1_773_000_000 }));
		expect(doc.querySelectorAll("path[data-series]")).toHaveLength(2);
		expect(doc.querySelectorAll("path[data-compare]")).toHaveLength(2);
		expect(doc.body.textContent).toContain(TRIMMED_COMPARE);
		expect(doc.querySelector(".lg")?.textContent).toContain("Dashed: 1 Feb to 3 Feb");
		const mail = renderEmail({ dashboard: d, tiles: [{ data: tile }], range: "30d", compare: true, adminUrl: "https://example.com/_emdash/admin", generatedAt: 1_773_000_000 });
		expect(mail.text).toContain("Clicks, latest: 9, previous: 7");
		expect(mail.text).toContain("Impressions, latest: 18, previous: 7");
		expect(mail.text).toContain("CTR, latest:");
	});
});
