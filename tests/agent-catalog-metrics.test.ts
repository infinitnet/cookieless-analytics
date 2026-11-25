/**
 * The agent catalog defines every figure the reports return: each key of `totals`, `rows` and `series` of every
 * report, run over the synthetic fixtures, has an entry in `METRICS` or is listed below as self-describing (a name,
 * a dimension value, a date or a nested object). The catalog's fixed numbers follow the constants. Synthetic data only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildCatalog, CONTENT_CATALOG, LINKS_CATALOG, METRICS, SEO_CATALOG } from "../src/agent/schemas.js";
import { zonedToEpoch } from "../src/core/time.js";
import { type Goal, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { MAX_IMPACT_ROWS, MAX_IMPACT_ROWS_SMALL } from "../src/query/reports/impact.js";
import { clearReportCache, type Params, REPORT_NAMES, type ReportName, runReport } from "../src/query/reports/index.js";
import { SEO_MAX_RANGE_DAYS } from "../src/query/reports/seo-copy.js";
import { seedLinks } from "./fixtures/links.js";
import { REV_GOALS, seedRevenue } from "./fixtures/revenue.js";
import { RANGE, seed, seedSearch } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";

/**
 * Keys that name a row or carry a value of a dimension, a period or a nested object, not a figure: they need no
 * definition. Every other key a report returns is a figure and must have a catalog entry.
 */
export const SELF_DESCRIBING: ReadonlySet<string> = new Set([
	// Row names and dimension values.
	"key", "label", "type", "query", "page", "path1", "path2", "path3", "prop", "value", "ref", "channel", "entry", "country", "day", "t", "from", "to", "currency", "revenue_currency",
	// Nested objects, lists and flags.
	"previous", "delta", "landing", "low_sample", "refund",
	// Event property rows: how often the value was sent.
	"count",
	// The time of a Not found row's last request, not a figure.
	"last_seen",
]);

const GOALS: Goal[] = [
	{ name: "Pricing", type: "page", match: "is", value: "/pricing" },
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	...REV_GOALS,
];

/** Inputs the reports need to answer at all. */
const PARAMS: Partial<Record<ReportName, Params>> = {
	event_props: { event: "signup" },
	funnels: { steps: [{ type: "page", match: "is", value: "/" }, { type: "page", match: "is", value: "/pricing" }] },
	journey_next: { path: "/" },
	journey_prev: { path: "/pricing" },
	search_page_queries: { page: "/" },
	search_cannibalization_page: { page: "/" },
	search_cannibalization_query: { query: "blue widgets" },
	dimension_values: { dim: "page" },
	impact: { at: "2026-03-11", report: "overview", metric: "bounce_rate", window: 7 },
	revenue_breakdown: { dim: "channel" },
	satisfaction: { by: "entry" },
};

describe("agent catalog", () => {
	let rc: ReportCtx;
	const keys = new Map<string, Set<string>>();
	const answered = new Set<string>();

	beforeAll(async () => {
		const env = await schemaDb();
		const settings = await seed(env, "UTC");
		await seedSearch(env);
		seedLinks(env.raw);
		seedRevenue(env.raw);
		rc = { db: env.db, site: "default", settings, now: zonedToEpoch("2026-03-13", 0, "UTC") + 360, goals: GOALS, funnels: {}, annotations: [], defaultCurrency: "USD" };
		const collect = (report: string, o: unknown) => {
			if (!o || typeof o !== "object") return;
			for (const k of Object.keys(o as object)) {
				const at = keys.get(k) ?? new Set<string>();
				at.add(report);
				keys.set(k, at);
			}
		};
		for (const report of REPORT_NAMES) {
			if (report === "sites_summary") continue;
			clearReportCache();
			// The widest range first (revenue and links fixtures start earlier), then the fixture's three days (journeys, SEO views).
			const run = (from: string) => runReport(rc, { report, query: QuerySchema.parse({ from, to: RANGE.to, compare: "previous" }), params: { withRevenue: true, ...PARAMS[report] }, limit: 50 });
			try {
				const r = await run("2026-02-01").catch(() => run(RANGE.from));
				answered.add(report);
				const d = r.data;
				collect(report, d.totals);
				for (const row of d.rows ?? []) collect(report, row);
				for (const p of d.series ?? []) collect(report, p);
			} catch {
				// A report the fixtures cannot serve (for example a range rule) is covered by its own tests.
			}
		}
	});

	it("runs most reports over the fixtures", () => {
		expect(answered.size).toBeGreaterThanOrEqual(40);
	});

	it("every metric key returned by every report has a catalog entry or is self-describing", () => {
		// A report with its own catalog block may define a key there (links, collections, site search).
		const own: Record<string, Readonly<Record<string, string>>> = { links: LINKS_CATALOG.metrics, collections: CONTENT_CATALOG.collections.metrics, site_search: CONTENT_CATALOG.site_search.metrics };
		const defined = (k: string, reports: Set<string>) => k in METRICS || SELF_DESCRIBING.has(k) || [...reports].every((r) => !!own[r]?.[k]);
		const missing = [...keys.entries()].filter(([k, reports]) => !defined(k, reports)).map(([k, reports]) => `${k} (${[...reports].sort().join(", ")})`);
		expect(missing).toEqual([]);
		// The list holds no key that no report returns.
		expect([...SELF_DESCRIBING].filter((k) => !keys.has(k))).toEqual([]);
	});

	it("defines the keys the audit found without an entry", () => {
		for (const k of ["exit_rate", "entries", "exits", "events", "rate", "scroll_median", "drop_off", "conversion", "unchanged", "new", "lost", "converting", "completions"]) expect(METRICS[k], k).toBeTruthy();
		// `conversions` exists on links only (sale events), and the catalog says so there.
		expect(METRICS.conversions).toBeUndefined();
		expect(METRICS.conversion_rate).toBe("converting / total_sessions, the sessions of the range under the same filters.");
		expect(buildCatalog().metrics.exit_rate).toMatchObject({ estimate: false });
	});

	it("cf4: the annotation impact row caps are the code's constants", () => {
		expect(SEO_CATALOG.annotationImpacts.maxRows).toBe(MAX_IMPACT_ROWS);
		expect(SEO_CATALOG.annotationImpacts.maxRowsSmallProfile).toBe(MAX_IMPACT_ROWS_SMALL);
		expect([MAX_IMPACT_ROWS, MAX_IMPACT_ROWS_SMALL]).toEqual([6, 5]);
	});

	it("states the period rule as the code applies it: no clamp, range_too_long above the cap", () => {
		expect(SEO_CATALOG.periodRule).toContain(`n = to - from + 1, at most ${SEO_MAX_RANGE_DAYS} (range_too_long above)`);
		expect(SEO_CATALOG.periodRule).not.toContain("min(");
	});
});
