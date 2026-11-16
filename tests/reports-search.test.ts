/** Search reports over seeded `ca_search_daily` rows (filled by the Search sources). */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { type QueryInput, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { normalizeSettings } from "../src/settings.js";
import { RANGE, seedSearch } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";

const pick = (rows: Row[] | undefined, ...fields: string[]) => (rows ?? []).map((r) => Object.fromEntries(["key", ...fields].map((f) => [f, r[f]])));

describe("search reports", () => {
	let rc: ReportCtx;
	beforeAll(async () => {
		const env = await schemaDb();
		await seedSearch(env);
		rc = {
			db: env.db,
			site: "default",
			settings: normalizeSettings({}),
			now: 0,
			goals: [],
			funnels: {},
			annotations: [{ ts: zonedToEpoch("2026-03-11", 12, "UTC"), kind: "release", text: "v2" }],
		};
	});
	beforeEach(() => clearReportCache());
	const run = (report: ReportName, q: Partial<QueryInput> = {}, params?: Params) =>
		runReport(rc, { report, query: QuerySchema.parse({ ...RANGE, ...q }), ...(params ? { params } : {}) });

	it("search overview, breakdowns, source switch and grain selection", async () => {
		const o = await run("search_overview", { compare: "previous" });
		// clicks 3 x (40 + 8), impressions 3 x 600, pos_sum 3 x 1900 = 5700; 5700 / 1800 = 3.17
		expect(o.data.totals).toEqual({ clicks: 144, impressions: 1800, ctr: 0.08, position: 3.17 });
		expect(o.data.compareTotals).toEqual({ clicks: 20, impressions: 250, ctr: 0.08, position: 4 });
		expect((o.data.delta as Record<string, number>).clicks).toBe(6.2);
		expect((o.data.series as Array<Record<string, unknown>>).map((p) => [p.t, p.clicks, p.position])).toEqual([
			["2026-03-10", 48, 3.17],
			["2026-03-11", 48, 3.17],
			["2026-03-12", 48, 3.17],
		]);
		expect((o.data.annotations as unknown[]).length).toBe(1);
		expect((await run("search_overview", {}, { source: "google" })).data.totals).toEqual({ clicks: 120, impressions: 1500, ctr: 0.08, position: 3 });
		expect((await run("search_overview", {}, { source: "bing" })).data.totals).toEqual({ clicks: 24, impressions: 300, ctr: 0.08, position: 4 });

		expect(pick((await run("search_queries")).data.rows, "clicks", "impressions", "position")).toEqual([
			{ key: "cookieless", clicks: 18, impressions: 360, position: 5 },
			{ key: "emdash analytics", clicks: 18, impressions: 180, position: 2 },
		]);
		expect(pick((await run("search_pages", {}, { source: "google" })).data.rows, "clicks", "impressions", "position")).toEqual([
			{ key: "/", clicks: 60, impressions: 600, position: 1 },
			{ key: "/pricing", clicks: 30, impressions: 300, position: 3 },
			{ key: "/old-page", clicks: 3, impressions: 30, position: 8 },
		]);
		expect(pick((await run("search_countries")).data.rows, "clicks")).toEqual([
			{ key: "DE", clicks: 90 },
			{ key: "US", clicks: 30 },
		]);
		expect(pick((await run("search_devices")).data.rows, "clicks", "position")).toEqual([
			{ key: "DESKTOP", clicks: 75, position: 2 },
			{ key: "MOBILE", clicks: 45, position: 4.5 },
		]);
		expect(pick((await run("search_page_queries", {}, { page: "/pricing" })).data.rows, "clicks", "impressions", "position")).toEqual([
			{ key: "cookieless", clicks: 9, impressions: 150, position: 5 },
		]);
		// A query filter on pages reads the page with query grain; a page filter on totals reads the page grain.
		expect(pick((await run("search_pages", { filters: [{ dim: "query", op: "is", values: ["cookieless"] }] })).data.rows, "clicks")).toEqual([{ key: "/pricing", clicks: 9 }]);
		expect((await run("search_overview", { filters: [{ dim: "page", op: "is", values: ["/"] }] })).data.totals?.clicks).toBe(60);
		expect((await run("search_overview", { filters: [{ dim: "source", op: "is", values: ["bing"] }] })).data.totals?.clicks).toBe(24);
		const ignored = await run("search_overview", { filters: [{ dim: "channel", op: "is", values: ["Direct"] }] });
		expect(ignored.notices).toEqual(["ignored_dim:channel"]);
		expect(ignored.data.totals?.clicks).toBe(144);
		await expect(
			run("search_overview", {
				filters: [
					{ dim: "page", op: "is", values: ["/"] },
					{ dim: "country", op: "is", values: ["DE"] },
				],
			}),
		).rejects.toMatchObject({ code: "unsupported_filter" });
	});
});
