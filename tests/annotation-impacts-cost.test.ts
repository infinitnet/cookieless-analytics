/** D1 statements of one full Annotations page (`annotation_impacts`): the page must stay inside 50 queries per invocation. */
import { describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { QuerySchema } from "../src/query/filters.js";
import { MAX_IMPACT_ROWS, MAX_IMPACT_ROWS_SMALL } from "../src/query/reports/impact.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { annotationStore } from "../src/routes/data.js";
import { memColl } from "./agent.helpers.js";
import { seoCtx } from "./fixtures/seo.js";

const at = (day: string) => zonedToEpoch(day, 12, "UTC");
/** Statement ceiling of one full page: the newest Search day plus 6 per row (a page target), so the route's own reads, settings and the host keep the rest of the 50. */
const CEILING = { small: 1 + 6 * MAX_IMPACT_ROWS_SMALL, standard: 37 };

describe("annotation_impacts statement cost", () => {
	// Default target (overview, 2 statements per row), and the costliest targets: pages (3 per run), events and revenue.
	const TARGETS = [undefined, { report: "pages", metric: "avg_time", params: { key: "/pricing/" } }, { report: "events", metric: "events", params: { key: "signup", prop: "plan" } }, { report: "revenue", metric: "revenue", params: { currency: "EUR" } }];
	for (const target of TARGETS)
	for (const profile of ["small", "standard"] as const)
		for (const rawFrom of ["2026-01-01", "2026-04-01", undefined])
			for (const empty of [false, true])
				it(`a full page stays within ${CEILING[profile]} statements (${target?.report ?? "default"}, ${profile}, rawFrom ${rawFrom ?? "none"}, ${empty ? "empty" : "busy"} windows)`, async () => {
					const ANN: Record<string, unknown> = {};
					for (let i = 0; i < 60; i++) ANN[`a${i}`] = { site: "default", ts: at(`2026-03-${String(1 + (i % 28)).padStart(2, "0")}`) + i, kind: "manual", text: `n${i}`, scope: { v: 1, path: [{ op: "is", value: `/p${i}/` }] }, ...(target ? { target } : {}) };
					const sqls: string[] = [];
					const all = async (sql: string) => {
						sqls.push(sql);
						return /FROM ca_search_daily/.test(sql) || empty ? [] : [{ sessions: 100, visitors: 80, pageviews: 150, n: 1, day: 20260301 }];
					};
					const rc = {
						...seoCtx({ dialect: "sqlite", run: all as never, all: all as never, batch: (async (s: unknown[]) => (sqls.push(`BATCH ${s.length}`), [])) as never }, "default", { capacityProfile: profile }, at("2026-04-25")),
						annotationStore: annotationStore(memColl(ANN), "default", "UTC"),
						...(rawFrom ? { rawFrom } : {}),
					};
					clearReportCache();
					const r = await runReport(rc, { report: "annotation_impacts", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-04-30" }), params: { window: 14, withSearch: true }, limit: 100 });
					expect((r.data.rows as unknown[]).length).toBe(profile === "small" ? MAX_IMPACT_ROWS_SMALL : MAX_IMPACT_ROWS);
					expect(sqls.length).toBeLessThanOrEqual(CEILING[profile]);
					// No realtime count, first-run lookup or routing estimate per run.
					expect(sqls.filter((s) => /last_seen >|FROM ca_rollup WHERE site = \? LIMIT 1/.test(s))).toEqual([]);
				});
});
