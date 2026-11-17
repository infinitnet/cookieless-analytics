// @vitest-environment jsdom
/**
 * Every KPI card, summary tile and report panel of the admin has one short definition behind its info mark
 * (src/admin/definitions.ts), and the copy follows one style.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KpiCard } from "../src/admin/components/KpiCard.js";
import { METRICS } from "../src/admin/components/format.js";
import { METRIC_DEFINITIONS, metricDefinition, PANEL_DEFINITIONS } from "../src/charts/definitions.js";
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

const ALL_TEXTS = [...new Set([...CARD_METRICS.map((k) => metricDefinition(k) ?? ""), ...Object.values(METRIC_DEFINITIONS), ...Object.values(PANEL_DEFINITIONS)])];

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
