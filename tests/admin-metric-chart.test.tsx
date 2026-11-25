// @vitest-environment jsdom
/** Metric cards that toggle chart series: slots, refusals, axes, the component. */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { View } from "../src/admin/components/Header.js";
import { assignAxes, HINTS, type MetricDef, MetricChart, nextSlots, seriesLimit, seriesTotals, toggleMetric } from "../src/admin/components/MetricChart.js";
import type { ReportState } from "../src/admin/api.js";
import type { QueryState } from "../src/admin/state.js";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
// This jsdom has no Web Storage: a small in-memory one.
beforeEach(() => {
	const m = new Map<string, string>();
	vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

const M: MetricDef[] = [
	{ key: "visitors", label: "Visitors", format: "number" },
	{ key: "sessions", label: "Sessions", format: "number" },
	{ key: "pageviews", label: "Pageviews", format: "number" },
	{ key: "views_per_session", label: "Views per session", format: "decimal" },
	{ key: "bounce_rate", label: "Bounce rate", format: "percent" },
	{ key: "engaged_rate", label: "Engaged rate", format: "percent" },
	{ key: "avg_duration", label: "Avg. session duration", format: "duration" },
];
const free = { compare: false, narrow: false };

describe("slots", () => {
	it("a kept metric keeps its slot; a new one takes the lowest free slot", () => {
		expect(nextSlots({}, ["a", "b", "c"])).toEqual({ a: 0, b: 1, c: 2 });
		// b off: c stays in slot 2, so its color does not change.
		expect(nextSlots({ a: 0, b: 1, c: 2 }, ["a", "c"])).toEqual({ a: 0, c: 2 });
		// d on: slot 1 is free.
		expect(nextSlots({ a: 0, c: 2 }, ["a", "c", "d"])).toEqual({ a: 0, c: 2, d: 1 });
	});
});

describe("refusal rules", () => {
	it("toggles on and off; the last metric stays on", () => {
		expect(toggleMetric(["visitors"], "sessions", M, free)).toEqual({ selected: ["visitors", "sessions"] });
		expect(toggleMetric(["visitors", "sessions"], "visitors", M, free)).toEqual({ selected: ["sessions"] });
		expect(toggleMetric(["visitors"], "visitors", M, free)).toEqual({ refused: HINTS.last });
	});

	it("at most 4, at most 2 with a comparison or on a small screen", () => {
		expect(seriesLimit(false, false)).toBe(4);
		expect(seriesLimit(true, false)).toBe(2);
		expect(seriesLimit(false, true)).toBe(2);
		expect(toggleMetric(["visitors", "sessions", "pageviews", "bounce_rate"], "engaged_rate", M, free)).toEqual({ refused: HINTS.max });
		expect(toggleMetric(["visitors", "sessions"], "pageviews", M, { compare: true, narrow: false })).toEqual({ refused: HINTS.compare });
		expect(toggleMetric(["visitors", "sessions"], "pageviews", M, { compare: false, narrow: true })).toEqual({ refused: HINTS.narrow });
	});

	it("a third scale is refused, not drawn", () => {
		expect(toggleMetric(["visitors", "bounce_rate"], "avg_duration", M, free)).toEqual({ refused: HINTS.scales });
		expect(toggleMetric(["visitors", "bounce_rate"], "engaged_rate", M, free)).toEqual({ selected: ["visitors", "bounce_rate", "engaged_rate"] });
	});

	it("Shift or Alt click selects only that card", () => {
		expect(toggleMetric(["visitors", "bounce_rate"], "avg_duration", M, { ...free, only: true })).toEqual({ selected: ["avg_duration"] });
	});
});

describe("axis assignment", () => {
	const max = (m: Record<string, number>) => (k: string) => m[k] ?? 0;
	const def = (k: string) => M.find((m) => m.key === k) as MetricDef;
	it("one family: one left axis", () => {
		expect(assignAxes([def("visitors"), def("sessions")], max({ visitors: 100, sessions: 140 }))).toEqual({ axis: { visitors: "left", sessions: "left" } });
	});
	it("one family more than 20 times apart: the larger group moves to the right axis", () => {
		const clicks = { key: "clicks", label: "Clicks", format: "number" as const };
		const impressions = { key: "impressions", label: "Impressions", format: "number" as const };
		expect(assignAxes([clicks, impressions], max({ clicks: 312, impressions: 9200 }))).toEqual({ axis: { clicks: "left", impressions: "right" } });
	});
	it("two families: first left, second right; a small series on a shared axis gets a hint", () => {
		expect(assignAxes([def("bounce_rate"), def("visitors")], max({ bounce_rate: 0.4, visitors: 100 }))).toEqual({ axis: { bounce_rate: "left", visitors: "right" } });
		const r = assignAxes([def("visitors"), def("bounce_rate"), def("pageviews")], max({ visitors: 10, bounce_rate: 0.4, pageviews: 5000 }));
		expect(r.axis).toEqual({ visitors: "left", bounce_rate: "right", pageviews: "left" });
		expect(r.hint).toBe("Visitors is small next to Pageviews on this scale.");
	});
	it("an inverted metric is its own family", () => {
		const pos = { key: "position", label: "Position", format: "decimal" as const, invert: true };
		const vps = def("views_per_session");
		expect(toggleMetric(["visitors", "views_per_session"], "position", [...M, pos], free)).toEqual({ refused: HINTS.scales });
		expect(assignAxes([vps, pos], max({})).axis).toEqual({ views_per_session: "left", position: "right" });
	});
});

describe("seriesTotals (cards of a timeseries trend)", () => {
	const days = [
		{ t: "2026-03-01", visitors: 10, sessions: 12, pageviews: 30 },
		{ t: "2026-03-02", visitors: 5, sessions: 8, pageviews: null },
	];
	it("sums the summed counts over the buckets, and the same sums over the comparison buckets", () => {
		expect(seriesTotals(days, [{ t: "2026-02-27", visitors: 20, sessions: 0, pageviews: 15 }], "day")).toEqual({
			totals: { visitors: 15, sessions: 20, pageviews: 30 },
			compareTotals: { visitors: 20, sessions: 0, pageviews: 15 },
		});
	});
	it("leaves visitors out of hourly buckets (distinct per hour do not add up to the day), no comparison is null", () => {
		expect(seriesTotals(days, undefined, "hour")).toEqual({ totals: { sessions: 20, pageviews: 30 }, compareTotals: null });
	});
});

describe("MetricChart", () => {
	const series = ["2026-03-01", "2026-03-02", "2026-03-03"].map((t, i) => ({ t, visitors: 100 + i, sessions: 130 + i, pageviews: 300 + i, views_per_session: 2.3, bounce_rate: 0.4, engaged_rate: 0.6, avg_duration: 90 }));
	const result = (compare: boolean): ReportState => ({
		loading: false,
		error: null,
		data: {
			report: "timeseries",
			range: { from: "2026-03-01", to: "2026-03-03" },
			compare: compare ? "previous" : "none",
			compareRange: compare ? { from: "2026-02-26", to: "2026-02-28" } : null,
			notices: [],
			data: { granularity: "day", series, ...(compare ? { compareSeries: series } : {}) },
		},
	});
	const setup = (m: string[] | undefined, compare = false) => {
		const update = vi.fn();
		const state = { from: "2026-03-01", to: "2026-03-03", filters: [], compare: compare ? "previous" : "none", ...(m ? { m } : {}) } as unknown as QueryState;
		const view = { state, update, site: { id: "" }, sites: [], tz: "UTC" } as unknown as View;
		const r = render(<MetricChart id="overview" view={view} metrics={M} defaults={["visitors"]} result={result(compare)} totals={{ visitors: 820 }} compareTotals={{ visitors: 732 }} />);
		return { ...r, update };
	};
	const card = (c: HTMLElement, k: string) => c.querySelector(`[data-metric="${k}"] button`) as HTMLElement;
	const hint = (c: HTMLElement) => c.querySelector(".ca-chart-hint") as HTMLElement;

	it("cards are toggle buttons; a click adds a series through the URL and the personal default", () => {
		const { container, update } = setup(undefined);
		expect(card(container, "visitors").getAttribute("aria-pressed")).toBe("true");
		expect(card(container, "visitors").getAttribute("aria-label")).toBe("Visitors 820, up 12.0 percent, better, +88, from 732");
		expect(card(container, "sessions").getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(card(container, "sessions"));
		expect(update).toHaveBeenCalledWith({ m: ["visitors", "sessions"] });
		expect(JSON.parse(window.localStorage.getItem("ca.metrics.v1") ?? "{}")).toEqual({ overview: ["visitors", "sessions"] });
	});

	it("draws the selected series with slots, a second axis, and the heading names them", () => {
		const { container } = setup(["visitors", "bounce_rate"]);
		expect(container.querySelector("h3")?.firstChild?.textContent).toBe("Visitors and Bounce rate per day");
		expect(container.querySelector('[data-series="visitors"]')).not.toBeNull();
		expect(container.querySelector('[data-series="bounce_rate"]')).not.toBeNull();
		expect(container.querySelectorAll('[data-axis="right"]')).toHaveLength(3);
		expect(container.querySelector('[data-metric="bounce_rate"]')?.getAttribute("data-slot")).toBe("1");
		expect(container.querySelector('[data-metric="bounce_rate"] .ca-kpi-chip')?.getAttribute("title")).toBe("Right axis");
	});

	it("a refused click changes nothing and says why in the fixed hint line", () => {
		const { container, update } = setup(["visitors", "bounce_rate"]);
		expect(hint(container).getAttribute("role")).toBe("status");
		fireEvent.click(card(container, "avg_duration"));
		expect(update).not.toHaveBeenCalled();
		expect(hint(container).textContent).toContain(HINTS.scales);
		expect(container.querySelector('[data-series="avg_duration"]')).toBeNull();
	});

	it("the only metric stays on", () => {
		const { container, update } = setup(undefined);
		fireEvent.click(card(container, "visitors"));
		expect(update).not.toHaveBeenCalled();
		expect(hint(container).textContent).toBe(HINTS.last);
	});

	it("comparison on with 3 selected: the first 2 in card order, with a hint; Reset returns to the default", () => {
		const { container, update, getByRole } = setup(["pageviews", "visitors", "sessions"], true);
		expect(container.querySelectorAll("[data-series]")).toHaveLength(2);
		expect(container.querySelector('[data-series="pageviews"]')).toBeNull();
		expect(container.querySelector('[data-compare="visitors"]')).not.toBeNull();
		expect(hint(container).textContent).toContain(HINTS.trimmedCompare);
		expect(container.querySelector(".ca-legend")?.textContent).toContain("26 Feb to 28 Feb");
		fireEvent.click(getByRole("button", { name: "Reset" }));
		expect(update).toHaveBeenCalledWith({ m: undefined });
	});

	it("a click while the selection is trimmed changes this view only, not the personal default", () => {
		window.localStorage.setItem("ca.metrics.v1", JSON.stringify({ overview: ["pageviews", "visitors", "sessions", "bounce_rate"] }));
		const { container, update } = setup(undefined, true);
		expect(container.querySelectorAll("[data-series]")).toHaveLength(2);
		fireEvent.click(card(container, "visitors"));
		expect(update).toHaveBeenCalledTimes(1);
		expect(JSON.parse(window.localStorage.getItem("ca.metrics.v1") ?? "{}")).toEqual({ overview: ["pageviews", "visitors", "sessions", "bounce_rate"] });
	});

	it("Shift click on a card selects only it; the legend toggles too", () => {
		const { container, update, getByRole } = setup(["visitors", "sessions"]);
		fireEvent.click(card(container, "pageviews"), { shiftKey: true });
		expect(update).toHaveBeenLastCalledWith({ m: ["pageviews"] });
		fireEvent.click(getByRole("button", { name: "Sessions" }));
		expect(update).toHaveBeenLastCalledWith({ m: undefined });
	});
});
