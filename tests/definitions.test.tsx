// @vitest-environment jsdom
/**
 * Every KPI card, summary tile and report panel of the admin has one short definition behind its info mark
 * (src/admin/definitions.ts), and the copy follows one style.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KpiCard } from "../src/admin/components/KpiCard.js";
import { METRICS } from "../src/admin/components/format.js";
import { COLUMN_DEFINITIONS, LINK_DEFINITIONS, METRIC_DEFINITIONS, metricDefinition, PANEL_DEFINITIONS, SATISFACTION_DEFINITIONS, satisfactionDefinition, tileDefinition } from "../src/charts/definitions.js";
import { CAVEATS } from "../src/charts/caveats.js";
import { RECENT_ORDERS_CAP } from "../src/query/reports/revenue.js";
import { TILE_METRICS, TILE_REPORTS } from "../src/dashboards/schema.js";
import { REPORT_NAMES } from "../src/query/reports/index.js";
import { IMPACT_METRICS, POSITION_BANDS, bandSuffix } from "../src/query/reports/seo-copy.js";

afterEach(cleanup);

/** Every metric a card or tile can show: the shared labels, the tile metrics, the impact targets and the band keys. */
const CARD_METRICS = [
	...Object.keys(METRICS),
	...Object.values(TILE_METRICS).flat(),
	...Object.values(IMPACT_METRICS).flat(),
	...POSITION_BANDS.flatMap((b) => ["queries", "impressions", "share", "ctr", "band"].map((m) => `${m}_${bandSuffix(b)}`)),
	"realtime",
];

const ALL_TEXTS = [
	...new Set([
		...CARD_METRICS.map((k) => metricDefinition(k) ?? ""),
		...Object.values(METRIC_DEFINITIONS),
		...Object.values(PANEL_DEFINITIONS),
		...Object.values(SATISFACTION_DEFINITIONS),
		...Object.values(LINK_DEFINITIONS),
		...Object.values(COLUMN_DEFINITIONS),
	]),
];

describe("definitions", () => {
	it("every card metric has a definition", () => {
		expect([...new Set(CARD_METRICS)].filter((k) => !metricDefinition(k))).toEqual([]);
	});

	it("every report and every tile report has a panel definition", () => {
		const panels: Record<string, string> = PANEL_DEFINITIONS;
		expect([...REPORT_NAMES, ...TILE_REPORTS].filter((r) => !panels[r])).toEqual([]);
	});

	it("each definition is short, plain and free of caveats about what is not done", () => {
		const bad = ALL_TEXTS.filter((t) => t.length > 180 || /[\u2013\u2014]/.test(t) || /\bnever\b|does not|script reads|history|privacy|cookie/i.test(t) || !/^[A-Z0-9]/.test(t) || !t.endsWith("."));
		expect(bad).toEqual([]);
	});

	it("bounce rate is defined as the share of sessions that were not engaged", () => {
		expect(metricDefinition("bounce_rate")).toMatch(/not engaged.*1 minus engaged rate/);
		expect(PANEL_DEFINITIONS.sites_summary).toBe("One row per site with sessions, page views, visitors, bounce rate and revenue before refunds.");
		// Engagement counts every event a visitor causes, custom or automatic.
		expect(metricDefinition("bounce_rate")).toContain("no event, custom or automatic");
		expect(metricDefinition("engaged_rate")).toContain("any event, custom or automatic");
	});

	it("every Search Satisfaction figure states its own base: measured organic search sessions for every rate", () => {
		expect(Object.fromEntries(["sessions", "measured", "measured_rate", "avg_duration", "avg_engaged", "pct_long", "pct_short", "pct_bad", "pogo_stick_rate", "pogo_sticks", "returned_from_search_rate", "returned_from_search", "search_reentry_rate", "reentered", "back_nav_rate", "score"].map((k) => [k, satisfactionDefinition(k)]))).toEqual({
			sessions: "Organic search sessions in the range. The line below counts those with a measurable end.",
			measured: "Organic search sessions with a measurable end, where at least one engagement update arrived.",
			measured_rate: "Share of organic search sessions with a measurable end, where an engagement update arrived. Every rate and the score count only these sessions.",
			avg_duration: "Average duration per organic search session, measured or not: the longer of the visit span and the visible time. Not interaction time.",
			avg_engaged: "Average active time per measured organic search session: time with interaction, not the time the page was open.",
			pct_long: "Share of measured organic search sessions that lasted longer than the long click time (60 seconds by default).",
			pct_short: "Share of measured organic search sessions that lasted at most the long click time (60 seconds by default).",
			pct_bad: "Share of measured organic search sessions with one page view, no event, no interaction and under the bad experience time (10 seconds by default).",
			pogo_stick_rate: "Share of measured organic search sessions with one page view and no event, at or under the long click time, whose page was left with Back or Forward. An estimate.",
			pogo_sticks: "Measured organic search sessions with one page view and no event, at or under the long click time, whose page was left with Back or Forward. An estimate.",
			returned_from_search_rate: "Share of measured organic search sessions that left the landing page with Back or Forward and then came again from a search engine. A part of Search re-entry. An estimate.",
			returned_from_search: "Measured organic search sessions that left the landing page with Back or Forward and then came again from a search engine. A part of the search re-entry sessions. An estimate.",
			search_reentry_rate: "Share of measured organic search sessions that came again from a search engine. Returned from search is the part that left the landing page with Back or Forward first. An estimate.",
			reentered: "Measured organic search sessions that came again from a search engine, whichever way the landing page was left. An estimate.",
			back_nav_rate: "Share of this page's full loads in organic search sessions that came from Back or Forward. A page restored without a reload is not a load, so a lower bound. An estimate.",
			score: "Long click rate minus bad experience rate minus pogo-sticking rate, in points. Marked low sample under the minimum of measured sessions (30 by default).",
		});
		// Each stays within the cap of an info text.
		expect(metricDefinition("search_reentry_rate")?.length).toBeLessThanOrEqual(180);
		// Other reports keep their own sessions and duration texts.
		expect(metricDefinition("sessions")).not.toBe(satisfactionDefinition("sessions"));
		expect(PANEL_DEFINITIONS.best_pages).toBe("Landing pages with the highest score, among pages with at least the minimum of measured sessions (30 by default). Score: long clicks minus bad experience minus pogo-sticking.");
		expect(PANEL_DEFINITIONS.worst_pages).toBe("Landing pages with the lowest score, among pages with at least the minimum of measured sessions (30 by default). Score: long clicks minus bad experience minus pogo-sticking.");
		expect(PANEL_DEFINITIONS.satisfaction).toBe("Search Satisfaction figures of organic search sessions, grouped by the chosen dimension; every rate is a share of the measured sessions.");
		expect(PANEL_DEFINITIONS.pogo_engines).toBe("Pogo-sticking and returned from search rates of the measured organic search sessions that landed on this page, by search engine. Both are estimates.");
		expect(SATISFACTION_DEFINITIONS.engine_measured).toBe("Organic search sessions from this search engine with a measurable end: the base of both rates in this table.");
	});

	it("states the figures the audit found vague: bands, duration, active time, revenue, visitors", () => {
		expect(metricDefinition("impressions_1_3")).toBe("Impressions of the queries or pages whose average position in the range falls in the band below 4.");
		expect(metricDefinition("share_4_10")).toBe("Share of impressions that belong to queries or pages whose average position falls in the band 4 to below 11.");
		expect(metricDefinition("queries_51_plus")).toBe("Queries whose average position in the range falls in the band 51 and beyond.");
		expect(metricDefinition("avg_duration")).toBe(CAVEATS.duration);
		expect(metricDefinition("avg_duration")).toMatch(/^Average session length: .*last page view or event/);
		expect(metricDefinition("avg_time")).toMatch(/^Average active time per page view with a measurement/);
		expect(metricDefinition("visitors")).toContain("People behind one network address with the same browser can count as one.");
		expect(metricDefinition("orders")).toContain("zero included");
		expect(metricDefinition("share")).toBeUndefined();
		expect(PANEL_DEFINITIONS.revenue_orders).toContain(`${RECENT_ORDERS_CAP} at most`);
		expect(Object.values(PANEL_DEFINITIONS).join(" ")).not.toMatch(/positions 1 to 3|4 to 20|landing page/);
	});

	it("cf9: a card or tile with a narrower meaning shows its own definition", () => {
		const { container } = render(<KpiCard metric="sessions" label="Sessions with a click" value={4} format="number" info={LINK_DEFINITIONS.sessions} />);
		expect(container.querySelector(".ca-info-btn")?.getAttribute("title")).toBe("Sessions with at least one page view and a short link click.");
		cleanup();
		expect(tileDefinition("satisfaction", "sessions")).toBe("Organic search sessions with at least one page view.");
		expect(tileDefinition("satisfaction_series", "pct_long")).toBe(satisfactionDefinition("pct_long"));
		expect(tileDefinition("satisfaction", "avg_duration")).toBe(SATISFACTION_DEFINITIONS.avg_duration);
		expect(tileDefinition("overview", "sessions")).toBe(metricDefinition("sessions"));
	});

	it("a KPI card shows its definition in the info mark, keyboard reachable", () => {
		const { container, getByRole } = render(<KpiCard metric="bounce_rate" label="Bounce rate" value={0.4} format="percent" />);
		const info = container.querySelector(".ca-info-btn") as HTMLButtonElement;
		expect(info.tagName).toBe("BUTTON");
		expect(info.getAttribute("title")).toBe(metricDefinition("bounce_rate"));
		fireEvent.click(info);
		expect(getByRole("note").textContent).toBe(metricDefinition("bounce_rate"));
	});
});
