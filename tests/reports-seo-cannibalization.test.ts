/** Cannibalization views: constructed cases, caps, notices and SQL snapshots per dialect. */
import { beforeAll, describe, expect, it } from "vitest";
import type { Db, Dialect } from "../src/db/adapter.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { clearReportCache, type ReportName, runReport } from "../src/query/reports/index.js";
import { overlapPattern, OVERLAP_MAX_PAGES_PER_QUERY, OVERLAP_MAX_QUERIES } from "../src/query/reports/seo.js";
import { insertSearch, runner, type SearchFixtureRow, seoCtx } from "./fixtures/seo.js";
import { schemaDb } from "./helpers.js";

const DAY = "2026-03-10";
const pair = (query: string, page: string, impressions: number, clicks: number, position: number): SearchFixtureRow => ({ day: DAY, query, page, impressions, clicks, position });

/** Every pattern on a constructed query, a brand query, a single page query, a query under the floor. */
const ROWS: SearchFixtureRow[] = [
	// shared: /a 66.7 percent, best page /a, best position /a
	pair("blue widgets", "/a", 600, 60, 2),
	pair("blue widgets", "/b", 300, 10, 5),
	pair("blue widgets", "/c", 20, 0, 9), // 2.2 percent: under the share floor
	// dominant: /a 88.9 percent with the best position
	pair("red widgets", "/a", 800, 80, 1),
	pair("red widgets", "/b", 100, 2, 6),
	// split: no page holds 50 percent; clicks tie, /a wins on position
	pair("green widgets", "/a", 100, 5, 3),
	pair("green widgets", "/b", 100, 5, 4),
	pair("green widgets", "/c", 100, 5, 5),
	// inverted: /a has most impressions and a worse position than /b
	pair("cheap widgets", "/a", 300, 3, 8),
	pair("cheap widgets", "/b", 200, 10, 3),
	// brand term
	pair("acme widgets", "/a", 200, 20, 2),
	pair("acme widgets", "/b", 200, 20, 3),
	// one page only, and a query under the impressions floor
	pair("single page", "/d", 500, 50, 2),
	pair("tiny", "/a", 20, 0, 4),
	pair("tiny", "/b", 20, 0, 5),
	// totals grain for the visible share, and Bing totals (Bing stores no pairs)
	{ day: DAY, impressions: 5000, clicks: 400, position: 5 },
	{ day: DAY, source: "bing", impressions: 900, clicks: 50, position: 5 },
];

describe("search_cannibalization", () => {
	let rc: ReportCtx;
	const run = runner(() => rc);
	beforeAll(async () => {
		const env = await schemaDb();
		insertSearch(env.raw, "default", ROWS);
		rc = seoCtx(env.db, "default");
	});

	it("lists queries with two or more counted pages over the floors, sorted by impressions, with patterns and best pages", async () => {
		const r = await run("search_cannibalization", {});
		const rows = r.data.rows as Row[];
		expect(rows.map((x) => [x.query, x.pages, x.impressions, x.clicks, x.pattern, x.best_page])).toEqual([
			["blue widgets", 2, 900, 70, "shared", "/a"],
			["red widgets", 2, 900, 82, "dominant", "/a"],
			["cheap widgets", 2, 500, 13, "inverted", "/b"],
			["green widgets", 3, 300, 15, "split", "/a"],
		]);
		const blue = rows[0]?.page_list as Array<Record<string, number>>;
		expect(blue).toEqual([
			{ page: "/a", impressions: 600, impressions_share: 0.6667, clicks: 60, clicks_share: 0.8571, position: 2 },
			{ page: "/b", impressions: 300, impressions_share: 0.3333, clicks: 10, clicks_share: 0.1429, position: 5 },
		]);
		for (const row of rows) {
			const pages = row.page_list as Array<Record<string, number>>;
			expect(pages.reduce((a, p) => a + (p.impressions_share ?? 0), 0)).toBeCloseTo(1, 3);
			expect(pages.reduce((a, p) => a + (p.clicks_share ?? 0), 0)).toBeCloseTo(1, 3);
		}
		// 900 + 900 + 500 + 300; pairs 3560 of 5000 totals impressions are visible.
		expect(r.data.totals).toEqual({ cannibalized_queries: 4, cannibalized_impressions: 2600, visible_share: 0.712 });
		expect(r.data.notices).toEqual(["bing_no_pairs", "coverage"]);
	});

	it("brand terms exclude a query unless includeBrand; floors are overridable", async () => {
		const withBrand = await run("search_cannibalization", {}, { includeBrand: true, source: "google" });
		expect((withBrand.data.rows as Row[]).map((x) => x.query)).toContain("acme widgets");
		expect(withBrand.data.notices).toEqual(["coverage"]);
		const low = await run("search_cannibalization", {}, { minImpressions: 40, minShare: 2 });
		const q = (low.data.rows as Row[]).map((x) => [x.query, x.pages]);
		expect(q).toContainEqual(["tiny", 2]);
		expect(q).toContainEqual(["blue widgets", 3]);
		expect(q.some((x) => x[0] === "single page")).toBe(false);
	});

	it("pages view equals hand computation", async () => {
		const r = await run("search_cannibalization_pages", {});
		expect(r.data.rows).toEqual([
			{ key: "/a", queries: 5, overlapping_queries: 4, overlapping_queries_pct: 0.8, impressions: 1820, overlapping_impressions: 1800, overlapping_impressions_pct: 0.989, clicks: 148, overlapping_clicks: 148 },
			{ key: "/b", queries: 5, overlapping_queries: 4, overlapping_queries_pct: 0.8, impressions: 720, overlapping_impressions: 700, overlapping_impressions_pct: 0.9722, clicks: 27, overlapping_clicks: 27 },
			{ key: "/c", queries: 2, overlapping_queries: 1, overlapping_queries_pct: 0.5, impressions: 120, overlapping_impressions: 100, overlapping_impressions_pct: 0.8333, clicks: 5, overlapping_clicks: 5 },
		]);
	});

	it("the page drill-down lists exactly the pairs and shared queries", async () => {
		const r = await run("search_cannibalization_page", {}, { page: "/b" });
		expect(r.data.pairs).toEqual([
			{ other_page: "/a", shared_queries: 4, shared_impressions_this: 700, shared_impressions_other: 1800 },
			{ other_page: "/c", shared_queries: 1, shared_impressions_this: 100, shared_impressions_other: 100 },
		]);
		expect((r.data.queries as Array<Record<string, unknown>>).map((q) => [q.query, q.other_page, q.position_this, q.position_other])).toEqual([
			["blue widgets", "/a", 5, 2],
			["cheap widgets", "/a", 3, 8],
			["green widgets", "/a", 4, 3],
			["green widgets", "/c", 4, 5],
			["red widgets", "/a", 6, 1],
		]);
	});

	it("the query drill-down reads stored Google rows", async () => {
		const r = await run("search_cannibalization_query", {}, { query: "blue widgets", source: "google" });
		expect((r.data.page_list as Array<Record<string, unknown>>).map((p) => p.page)).toEqual(["/a", "/b", "/c"]);
		expect(r.data.best_page).toBe("/a");
	});

	it("country filter: filters_not_applied; compare: compare_not_supported; 94 days: range_too_long", async () => {
		const f = await run("search_cannibalization", { filters: [{ dim: "country", op: "is", values: ["DE"] }] });
		expect(f.data.notices).toContain("filters_not_applied");
		expect((f.data.rows as Row[]).length).toBe(4);
		for (const report of ["search_cannibalization", "search_cannibalization_pages", "search_cannibalization_page", "search_cannibalization_query"] as const)
			await expect(run(report, { compare: "previous" }, { page: "/a", query: "x" })).rejects.toMatchObject({ code: "compare_not_supported" });
		await expect(run("search_cannibalization", { from: "2026-01-01", to: "2026-04-04" })).rejects.toMatchObject({ code: "range_too_long" });
		expect((await run("search_cannibalization", { from: "2026-01-02", to: "2026-04-04" })).data.rows).toHaveLength(4);
	});

	it("caps at 200 queries and 10 pages per query", async () => {
		const env = await schemaDb();
		const rows: SearchFixtureRow[] = [];
		for (let i = 0; i < OVERLAP_MAX_QUERIES + 5; i++) rows.push(pair(`query ${String(i).padStart(3, "0")}`, "/x", 100, 1, 3), pair(`query ${String(i).padStart(3, "0")}`, "/y", 100, 1, 4));
		for (let i = 0; i < 12; i++) rows.push(pair("wide", `/p${String(i).padStart(2, "0")}`, 1000 - i, 1, 3));
		insertSearch(env.raw, "caps", rows);
		const caps = seoCtx(env.db, "caps", { searchOverlapMinShare: 1 });
		const r = await runner(() => caps)("search_cannibalization", {}, undefined, 1000);
		const list = r.data.rows as Row[];
		expect(list).toHaveLength(OVERLAP_MAX_QUERIES);
		expect(list[0]?.query).toBe("wide");
		expect(list[0]?.pages).toBe(12);
		expect(list[0]?.page_list).toHaveLength(OVERLAP_MAX_PAGES_PER_QUERY);
	});
});

describe("pattern labels", () => {
	const p = (page: string, impressions: number, clicks: number, position: number, total: number) => ({ page, impressions, impressions_share: impressions / total, clicks, clicks_share: null, position });
	it("dominant, split, inverted and shared on constructed cases", () => {
		expect(overlapPattern([p("/a", 70, 9, 1, 100), p("/b", 30, 1, 2, 100)])).toBe("dominant");
		// 70 percent but not the best position: not dominant; /a has most impressions and a worse position: inverted.
		expect(overlapPattern([p("/a", 70, 9, 3, 100), p("/b", 30, 1, 2, 100)])).toBe("inverted");
		expect(overlapPattern([p("/a", 49, 1, 2, 100), p("/b", 51, 1, 1, 100)])).toBe("shared");
		expect(overlapPattern([p("/a", 40, 1, 3, 100), p("/b", 35, 1, 2, 100), p("/c", 25, 1, 1, 100)])).toBe("split");
	});
});

/** Db stub: records every statement; answers nothing. */
function recordingDb(dialect: Dialect): Db & { seen: Array<{ sql: string; params: unknown[] }> } {
	const seen: Array<{ sql: string; params: unknown[] }> = [];
	return { dialect, seen, run: async () => ({ changes: 0 }), all: async <T,>(sql: string, params: unknown[] = []) => (seen.push({ sql, params }), [] as T[]), batch: async () => {} };
}

const SEO_REPORTS: Array<[ReportName, Record<string, unknown>, string?]> = [
	["search_cannibalization", {}],
	["search_cannibalization_pages", {}],
	["search_cannibalization_page", { page: "/user-page" }],
	["search_cannibalization_query", { query: "user query", source: "google" }],
	["search_position_bands", {}],
	["search_position_bands_series", {}],
	["search_position_bands_series", { metric: "impressions" }, "2026-01-01"],
	["search_position_moves", {}],
	["search_striking_distance", {}],
	["search_movers", {}],
	["search_decay", {}],
	["traffic_movers", {}],
	["traffic_decay", {}],
];

describe.each(["sqlite", "postgres"] as const)("SEO statements (%s)", (dialect) => {
	it("snapshot per statement: window functions present, every value bound, LIKE patterns under 50 bytes", async () => {
		const out: Record<string, Array<{ sql: string; params: number }>> = {};
		for (const [report, params, from] of SEO_REPORTS) {
			const db = recordingDb(dialect);
			clearReportCache();
			const rc = { ...seoCtx(db, "user-site", { searchBrandTerms: "acme\nwidget_co" }) };
			await runReport(rc, { report, query: QuerySchema.parse({ from: from ?? "2026-03-01", to: "2026-03-28", filters: [{ dim: "page", op: "is", values: ["/user-filter"] }] }), params: params as never });
			for (const s of db.seen) {
				for (const v of ["user-site", from ?? "2026-03-01", "2026-03-28", "/user-filter", "/user-page", "user query", "acme"]) expect(s.sql).not.toContain(v);
				expect(s.sql.split("?").length - 1).toBe(s.params.length);
				for (const p of s.params) if (typeof p === "string" && p.startsWith("%")) expect(new TextEncoder().encode(p).length).toBeLessThan(50);
			}
			out[from ? `${report} weekly` : report] = db.seen.map((s) => ({ sql: s.sql, params: s.params.length }));
		}
		expect(out.search_cannibalization?.[0]?.sql).toContain("ROW_NUMBER() OVER (PARTITION BY pqf.query");
		expect(out.search_position_moves?.some((s) => s.sql.includes("ROW_NUMBER() OVER (PARTITION BY v.mv"))).toBe(true);
		expect(out).toMatchSnapshot();
	});
});

describe("cannibalization edge cases", () => {
	it("dominant uses the query's impressions over all pages, pages under the floor included", async () => {
		const env = await schemaDb();
		insertSearch(env.raw, "default", [pair("q", "/a", 64, 9, 1), pair("q", "/b", 26, 1, 2), pair("q", "/c", 5, 0, 3), pair("q", "/d", 5, 0, 4)]);
		const r = await runner(() => seoCtx(env.db, "default"))("search_cannibalization", {});
		const row = (r.data.rows as Row[])[0];
		// 64 of 100 is not 70 percent, although 64 of the 90 counted impressions would be.
		expect(row?.pattern).toBe("shared");
		expect((row?.page_list as Array<Record<string, number>>).reduce((a, p) => a + (p.impressions_share ?? 0), 0)).toBeCloseTo(1, 3);
	});

	it("totals count every cannibalized query beyond the 200 listed, with the capped notice", async () => {
		const env = await schemaDb();
		const rows: SearchFixtureRow[] = [];
		for (let i = 0; i < 205; i++) rows.push(pair(`q${i}`, "/x", 100, 1, 3), pair(`q${i}`, "/y", 100, 1, 4));
		insertSearch(env.raw, "default", rows);
		const r = await runner(() => seoCtx(env.db, "default"))("search_cannibalization", {}, undefined, 1000);
		expect(r.data.totals).toMatchObject({ cannibalized_queries: 205, cannibalized_impressions: 41000 });
		expect(r.data.notices).toContain("capped");
	});
});
