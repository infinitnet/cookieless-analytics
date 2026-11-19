import { describe, expect, it } from "vitest";
import { changeText, describeChange, LOWER_IS_BETTER, MISSING_NOTE, NO_JUDGEMENT, rateBase, SMALL_NOTE } from "../src/charts/change.js";
import { tableColumnKeys, tileChange, tileData } from "../src/dashboards/tiles.js";
import type { ReportResult } from "../src/query/reports/index.js";

describe("describeChange", () => {
	it("count: relative change, then the absolute change and the previous value", () => {
		const c = describeChange("visitors", 2156, 1925, { format: "number" });
		expect(c).toMatchObject({ kind: "change", direction: "up", judgement: "better", abs: 231, unit: "count", label: "+12.0%", detail: "+231, from 1,925", muted: false, note: null });
		expect(c.rel).toBeCloseTo(0.12, 3);
		expect(c.words).toBe("up 12.0 percent, better");
		expect(changeText(c)).toBe("↑ +12.0% better, +231, from 1,925");
		expect(changeText(c, true)).toBe("↑ +12.0% better");
		expect(describeChange("pageviews", 900, 1000, { format: "number" })).toMatchObject({ direction: "down", judgement: "worse", label: "-10.0%", detail: "-100, from 1,000" });
	});

	it("rate: percentage points with the previous rate, never a relative percent", () => {
		const c = describeChange("engaged_rate", 0.422, 0.41, { format: "percent", base: 500 });
		expect(c).toMatchObject({ unit: "pp", rel: null, label: "+1.2 pp", detail: "from 41.0%", judgement: "better", muted: false });
		expect(c.words).toBe("up 1.2 percentage points, better");
		// Lower is better: a falling bounce rate improves, the arrow still points down.
		const b = describeChange("bounce_rate", 0.38, 0.41, { format: "percent", base: 500 });
		expect(b).toMatchObject({ direction: "down", judgement: "better", label: "-3.0 pp" });
		// From a zero rate the points still work: no "New".
		expect(describeChange("ctr", 0.05, 0, { format: "percent", base: 1000 })).toMatchObject({ kind: "change", label: "+5.0 pp" });
	});

	it("duration and decimal: relative change, then the difference in the metric's unit", () => {
		expect(describeChange("avg_duration", 75, 60, { format: "duration", base: 400 })).toMatchObject({ label: "+25.0%", detail: "+15s, from 1m 0s", unit: "duration" });
		expect(describeChange("avg_duration", 60, 135, { format: "duration", base: 400 })).toMatchObject({ direction: "down", detail: "-1m 15s, from 2m 15s" });
		expect(describeChange("views_per_session", 2.5, 2, { format: "decimal", base: 400 })).toMatchObject({ label: "+25.0%", detail: "+0.50, from 2.00", judgement: "better" });
	});

	it("position: positions better or worse, no percent", () => {
		const c = describeChange("position", 7.8, 8.2, { format: "decimal", base: 5000 });
		expect(c).toMatchObject({ unit: "positions", direction: "down", judgement: "better", rel: null, label: "0.4 better", detail: "from 8.20" });
		expect(c.words).toBe("0.4 positions better");
		expect(changeText(c, true)).toBe("↓ 0.4 better");
		expect(describeChange("position", 9, 8.2, { format: "decimal" })).toMatchObject({ direction: "up", judgement: "worse", label: "0.8 worse" });
		// Position 0 means no impressions: no comparison, not a jump to first place.
		expect(describeChange("position", 4, 0, { format: "decimal" }).kind).toBe("none");
	});

	it("money: amount in the report currency and percent, never another currency", () => {
		const c = describeChange("revenue", 2520, 2400, { format: "money:EUR", base: 900 });
		expect(c).toMatchObject({ unit: "money:EUR", label: "+5.0%", detail: "+120.00 EUR, from 2,400.00 EUR" });
		expect(c.detail).not.toMatch(/USD|\$/);
		expect(describeChange("revenue", 1000, 1200, { format: "money:JPY" }).detail).toBe("-200 JPY, from 1,200 JPY");
		// Refunds rising is bad news.
		expect(describeChange("refunds", 50, 20, { format: "money:EUR" }).judgement).toBe("worse");
	});

	it("negative values: the change is measured against the size of the base", () => {
		const c = describeChange("net_revenue", -50, -100, { format: "money:EUR", base: 500 });
		expect(c).toMatchObject({ direction: "up", judgement: "better", label: "+50.0%", detail: "+50.00 EUR, from -100.00 EUR" });
		expect(describeChange("net_revenue", -150, -100, { format: "money:EUR", base: 500 })).toMatchObject({ direction: "down", label: "-50.0%" });
	});

	it("zero: New from a zero base, No change between equal values, no infinity", () => {
		const n = describeChange("orders", 5, 0, { format: "number" });
		expect(n).toMatchObject({ kind: "new", label: "New", rel: null, detail: "+5, from 0", direction: "up", muted: true, words: "new, previously 0" });
		expect(changeText(n)).toBe("↑ New, +5, from 0");
		expect(describeChange("visitors", 0, 0, { format: "number" })).toMatchObject({ kind: "change", direction: "flat", judgement: "neutral", label: "No change", muted: false });
		expect(describeChange("visitors", 500, 500, { format: "number" })).toMatchObject({ label: "No change", detail: "from 500", muted: false });
		expect(describeChange("visitors", 0, 300, { format: "number" })).toMatchObject({ label: "-100.0%", judgement: "worse" });
		// A change that rounds to 0.0 is no change: no arrow up, no "better".
		expect(describeChange("visitors", 20_001, 20_000, { format: "number" })).toMatchObject({ direction: "flat", judgement: "neutral", label: "No change" });
		expect(describeChange("ctr", 0.0301, 0.03, { format: "percent", base: 9000 })).toMatchObject({ direction: "flat", label: "No change" });
		expect(describeChange("position", 8.21, 8.2, { format: "decimal" })).toMatchObject({ direction: "flat", label: "No change" });
		expect(describeChange("visitors", 20_020, 20_000, { format: "number" }).label).toBe("+0.1%");
	});

	it("missing: either side null or absent is No comparison with the reason", () => {
		for (const [cur, prev] of [
			[10, null],
			[10, undefined],
			[null, 10],
			[Number.NaN, 10],
		] as const) {
			const c = describeChange("visitors", cur, prev, { format: "number" });
			expect(c).toMatchObject({ kind: "none", label: "No comparison", note: MISSING_NOTE, direction: null, judgement: null });
		}
		expect(describeChange("clicks", 10, null, { format: "number", reason: "Bing is not connected." }).note).toBe("Bing is not connected.");
		expect(changeText(describeChange("clicks", 10, null, { format: "number" }), true)).toBe("No comparison");
	});

	it("small numbers: a count under 30 before, or a rate on under 100 sessions, is muted and shows the plain difference", () => {
		const c = describeChange("visitors", 20, 4, { format: "number" });
		expect(c).toMatchObject({ label: "+16", detail: "from 4", rel: 4, muted: true, note: SMALL_NOTE, judgement: "better" });
		expect(c.words).toBe("up 16, better, small numbers");
		expect(changeText(c, true)).toBe("↑ +16 better (small numbers)");
		expect(describeChange("avg_duration", 90, 30, { format: "duration", base: 5 })).toMatchObject({ label: "+1m 0s", detail: "from 30s", muted: true });
		// Large changes on a solid base keep thousands separators.
		expect(describeChange("visitors", 12_000, 40, { format: "number" }).label).toBe("+29,900.0%");
		expect(describeChange("visitors", 40, 30, { format: "number" }).muted).toBe(false);
		expect(describeChange("bounce_rate", 0.6, 0.2, { format: "percent", base: 12 }).muted).toBe(true);
		expect(describeChange("bounce_rate", 0.6, 0.2, { format: "percent", base: 100 }).muted).toBe(false);
		// No known base: not muted.
		expect(describeChange("bounce_rate", 0.6, 0.2, { format: "percent" }).muted).toBe(false);
	});

	it("judgement table: lower is better, neutral, and an explicit override", () => {
		for (const k of ["position", "bounce_rate", "exit_rate", "pct_bad", "pct_short", "pogo_stick_rate", "refunds"]) expect(LOWER_IS_BETTER.has(k)).toBe(true);
		expect(NO_JUDGEMENT.has("realtime")).toBe(true);
		expect(describeChange("realtime", 9, 4, { format: "number" })).toMatchObject({ direction: "up", judgement: "neutral" });
		expect(describeChange("measured_rate", 0.5, 0.6, { format: "percent" }).words).toBe("down 10.0 percentage points");
		expect(describeChange("custom", 9, 40, { format: "number", lowerIsBetter: true }).judgement).toBe("better");
	});

	it("rateBase: sessions, else impressions, else orders", () => {
		expect(rateBase({ sessions: 80, impressions: 9000 })).toBe(80);
		expect(rateBase({ impressions: 9000 })).toBe(9000);
		expect(rateBase({ orders: 3 })).toBe(3);
		expect(rateBase(null)).toBeUndefined();
	});
});

describe("table tile columns", () => {
	const res = (rows: Array<Record<string, unknown>>): ReportResult => ({ report: "channels", range: { from: "2026-03-01", to: "2026-03-07" }, compare: "none", compareRange: null, notices: [], data: { rows } }) as unknown as ReportResult;
	const rows = [{ key: "Organic", visitors: 10, sessions: 12, bounce_rate: 0.4, avg_duration: 30, pageviews: 20, previous: null, nested: { a: 1 } }];
	const tile = (columns?: string[]) => ({ id: "t00001", report: "channels", kind: "table", w: 2, ...(columns ? { columns } : {}) }) as never;

	it("shows the name and the first three figures unless the tile names columns", () => {
		expect(tileData(tile(), res(rows)).columns).toEqual(["key", "visitors", "sessions", "bounce_rate"]);
	});
	it("shows the named columns in the tile's order, leaving out those the report does not return", () => {
		expect(tileData(tile(["avg_duration", "pageviews", "nope"]), res(rows)).columns).toEqual(["key", "avg_duration", "pageviews"]);
		expect(tileData(tile(["nope"]), res(rows)).columns).toEqual(["key", "visitors", "sessions", "bounce_rate"]);
		expect(tableColumnKeys(rows)).toEqual(["key", "visitors", "sessions", "bounce_rate", "avg_duration", "pageviews"]);
	});
});

describe("tile change", () => {
	const res = (data: Record<string, unknown>): ReportResult => ({ report: "overview", range: { from: "2026-03-01", to: "2026-03-07" }, compare: "previous", compareRange: null, notices: [], data }) as unknown as ReportResult;
	const kpi = { id: "k00001", report: "overview", kind: "kpi", metric: "bounce_rate", w: 1 } as never;

	it("a KPI tile carries the comparison's figures; none without a comparison", () => {
		const d = tileData(kpi, res({ totals: { bounce_rate: 0.4 }, compareTotals: { bounce_rate: 0.45, sessions: 300 } }));
		expect(tileChange(d)).toMatchObject({ label: "-5.0 pp", judgement: "better", muted: false });
		expect(tileChange(tileData(kpi, res({ totals: { bounce_rate: 0.4 } })))).toBeNull();
		expect(tileChange(tileData(kpi, res({ totals: { bounce_rate: 0.4 }, compareTotals: null })))?.kind).toBe("none");
	});

	it("a goal tile reads its row's previous values", () => {
		const tile = { id: "g00001", report: "goals", kind: "kpi", metric: "converting", params: { goal: "g1" }, w: 1 } as never;
		const d = tileData(tile, res({ rows: [{ key: "Signup", converting: 60, previous: { converting: 40 } }] }), { goalName: "Signup" });
		expect(tileChange(d)).toMatchObject({ label: "+50.0%", detail: "+20, from 40" });
	});
});
