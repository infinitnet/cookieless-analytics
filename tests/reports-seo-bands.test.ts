/** Position bands, the series, movement between periods and striking distance. */
import { describe, expect, it } from "vitest";
import { addDays } from "../src/core/time.js";
import type { Row } from "../src/query/reports/base.js";
import { bandCase, brandPredicate, notableExpr, periods, seoRange } from "../src/query/reports/seo.js";
import { periodLine } from "../src/query/reports/seo-copy.js";
import { weekStart } from "../src/query/reports/timeseries.js";
import { insertSearch, runner, type SearchFixtureRow, seoCtx } from "./fixtures/seo.js";
import { schemaDb } from "./helpers.js";

describe("bands", () => {
	it("boundary positions land in the right band; counts, impressions, clicks and CTR equal hand sums", async () => {
		const env = await schemaDb();
		const pos = [399, 400, 1099, 1100, 2099, 2100, 5099, 5100];
		insertSearch(
			env.raw,
			"default",
			pos.map((p, i) => ({ day: "2026-03-10", query: `q${p}`, impressions: 100, clicks: 10 - i, pos_sum: p })),
		);
		// A page row too: the page grain is separate.
		insertSearch(env.raw, "default", [{ day: "2026-03-10", page: "/a", impressions: 50, clicks: 5, position: 12 }]);
		const run = runner(() => seoCtx(env.db, "default"));
		const r = await run("search_position_bands", {});
		expect((r.data.rows as Row[]).map((x) => [x.key, x.queries, x.impressions, x.clicks, x.ctr])).toEqual([
			["1-3", 1, 100, 10, 0.1],
			["4-10", 2, 200, 17, 0.085],
			["11-20", 2, 200, 13, 0.065],
			["21-50", 2, 200, 9, 0.045],
			["51+", 1, 100, 3, 0.03],
		]);
		expect(r.data.totals).toMatchObject({ queries: 8, queries_1_3: 1, queries_51_plus: 1, impressions_1_3: 100, share_1_3: 0.125, ctr_1_3: 0.1 });
		const pages = await run("search_position_bands", {}, { dim: "page" });
		expect((pages.data.rows as Row[]).map((x) => x.pages)).toEqual([0, 0, 1, 0, 0]);
	});

	it("the series buckets by day up to 31 days and by ISO week beyond", async () => {
		const env = await schemaDb();
		const rows: SearchFixtureRow[] = [];
		for (let i = 0; i < 40; i++) rows.push({ day: addDays("2026-02-01", i), query: "a", impressions: 10, clicks: 1, position: 2 }, { day: addDays("2026-02-01", i), query: "b", impressions: 10, clicks: 1, position: 15 });
		insertSearch(env.raw, "default", rows);
		const run = runner(() => seoCtx(env.db, "default"));
		const daily = await run("search_position_bands_series", { from: "2026-02-01", to: "2026-03-03" });
		expect(daily.data.granularity).toBe("day");
		const series = daily.data.series as Array<Record<string, unknown>>;
		expect(series).toHaveLength(31);
		expect(series[0]).toEqual({ t: "2026-02-01", band_1_3: 1, band_4_10: 0, band_11_20: 1, band_21_50: 0, band_51_plus: 0 });
		const weekly = await run("search_position_bands_series", { from: "2026-02-01", to: "2026-03-12" }, { metric: "impressions" });
		expect(weekly.data.granularity).toBe("week");
		const w = weekly.data.series as Array<Record<string, unknown>>;
		expect(w.map((p) => p.t)).toEqual(["2026-01-26", "2026-02-02", "2026-02-09", "2026-02-16", "2026-02-23", "2026-03-02", "2026-03-09"]);
		expect(w.map((p) => p.t)).toEqual([...new Set(w.map((p) => weekStart(String(p.t))))]);
		// 2026-02-01 is a Sunday: one day in the first week; a full week holds 7 days of 10 impressions.
		expect(w[0]).toMatchObject({ band_1_3: 10, band_11_20: 10 });
		expect(w[1]).toMatchObject({ band_1_3: 70, band_11_20: 70 });
	});
});

describe("period rule", () => {
	it("shifts both periods back by the provisional tail and reports periods and provisional_excluded", async () => {
		const env = await schemaDb();
		insertSearch(env.raw, "default", [
			{ day: "2026-03-12", impressions: 1, clicks: 0 },
			{ day: "2026-03-13", impressions: 1, clicks: 0, provisional: true },
			{ day: "2026-03-14", impressions: 1, clicks: 0, provisional: true },
			{ source: "bing", day: "2026-03-10", impressions: 1, clicks: 0 },
		]);
		const rc = seoCtx(env.db, "default");
		const input = { from: "2026-03-01", to: "2026-03-14", filters: [], granularity: "auto" as const, params: { source: "google" as const }, limit: 10, offset: 0, isCompare: false };
		const g = await periods(rc, input, "google", 2);
		expect(g.periods).toEqual({ current: { from: "2026-02-27", to: "2026-03-12" }, previous: { from: "2026-02-13", to: "2026-02-26" }, days: 14, excluded: 2, reason: "provisional" });
		expect(g.notices).toEqual(["provisional_excluded"]);
		expect(periodLine(g.periods)).toBe("Comparing 2026-02-27 to 2026-03-12 with the 14 days before; the newest 2 days are excluded as provisional");
		// All sources: the older final day of the two.
		expect((await periods(rc, input, "all", 3)).periods).toMatchObject({ current: { from: "2026-02-25", to: "2026-03-10" }, oldest: { from: "2026-01-28", to: "2026-02-10" } });
		// Nothing provisional inside the range: unchanged, no notice.
		expect(await periods(rc, { ...input, to: "2026-03-11" }, "google", 2)).toMatchObject({ periods: { current: { to: "2026-03-11" }, excluded: 0 }, notices: [] });
		// Traffic ends at the last stored summary day: the watermark, else the last closed day (the clock is 2026-03-15).
		expect((await periods({ ...rc, summaryThrough: "2026-03-14" }, input, "traffic", 2)).periods).toMatchObject({ current: { from: "2026-03-01", to: "2026-03-14" }, reason: "incomplete" });
		expect((await periods(rc, input, "traffic", 2)).periods).toMatchObject({ current: { to: "2026-03-13" }, excluded: 1, reason: "incomplete" });
		expect(() => seoRange({ from: "2026-01-01", to: "2026-04-04" })).toThrow(/93 days/);
	});

	it("helpers: band CASE, noise guard, brand LIKE", () => {
		expect(bandCase("x")).toBe("CASE WHEN x < 4 THEN 0 WHEN x < 11 THEN 1 WHEN x < 21 THEN 2 WHEN x < 51 THEN 3 ELSE 4 END");
		expect(notableExpr("a", "b")).toBe("CASE WHEN (a - b) * (a - b) > 4 * (a + b) THEN 1 ELSE 0 END");
		expect(brandPredicate(["acme", "a_b"])).toEqual({ sql: "lower(d.query) NOT LIKE ? ESCAPE '\\' AND lower(d.query) NOT LIKE ? ESCAPE '\\'", params: ["%acme%", "%a\\_b%"] });
		expect(brandPredicate([]).sql).toBe("1 = 1");
	});
});

describe("search_position_moves", () => {
	it("matrix rows sum to the per-period counts; new and lost are disjoint; the floor removes one-impression queries", async () => {
		const env = await schemaDb();
		const prev = "2026-02-20";
		const cur = "2026-03-05";
		insertSearch(env.raw, "default", [
			{ day: prev, query: "up q", impressions: 100, clicks: 2, position: 15 },
			{ day: cur, query: "up q", impressions: 100, clicks: 20, position: 2 },
			{ day: prev, query: "down q", impressions: 100, clicks: 20, position: 2 },
			{ day: cur, query: "down q", impressions: 100, clicks: 1, position: 30 },
			{ day: prev, query: "same q", impressions: 100, clicks: 5, position: 5 },
			{ day: cur, query: "same q", impressions: 100, clicks: 5, position: 6 },
			{ day: cur, query: "new q", impressions: 100, clicks: 5, position: 8 },
			{ day: prev, query: "lost q", impressions: 100, clicks: 5, position: 8 },
			{ day: cur, query: "tiny q", impressions: 1, clicks: 0, position: 8 },
			{ day: "2026-03-12", impressions: 1, clicks: 0 },
			{ day: "2026-03-13", query: "late q", impressions: 100, clicks: 5, position: 8, provisional: true },
		]);
		const run = runner(() => seoCtx(env.db, "default"));
		const r = await run("search_position_moves", { from: "2026-03-01", to: "2026-03-14" }, { source: "google" });
		const matrix = r.data.matrix as Array<{ from: string; to: string; queries: number; impressions: number }>;
		expect(matrix.map((m) => `${m.from}>${m.to}:${m.queries}`).sort()).toEqual(["1-3>21-50:1", "11-20>1-3:1", "4-10>4-10:1", "4-10>lost:1", "new>4-10:1"]);
		const current = matrix.filter((m) => m.to !== "lost").reduce((a, m) => a + m.queries, 0);
		const previous = matrix.filter((m) => m.from !== "new").reduce((a, m) => a + m.queries, 0);
		expect([current, previous]).toEqual([4, 4]);
		expect(r.data.totals).toEqual({ moved_up: 1, moved_down: 1, unchanged: 1, new: 1, lost: 1 });
		expect(r.data.up).toEqual([{ query: "up q", impressions: 100, clicks: 20, position_previous: 15, position_current: 2, band_previous: "11-20", band_current: "1-3" }]);
		expect((r.data.new as Array<{ query: string }>).map((x) => x.query)).toEqual(["new q"]);
		expect((r.data.lost as Array<Record<string, unknown>>)[0]).toMatchObject({ query: "lost q", position_current: null, band_current: null });
		expect(r.notices).toEqual([]);
		expect(r.data.notices).toEqual(["provisional_excluded"]);
		expect(r.data.periods).toMatchObject({ current: { from: "2026-02-27", to: "2026-03-12" }, previous: { from: "2026-02-13", to: "2026-02-26" } });
		// Compare is ignored: the view compares on its own.
		expect((await run("search_position_moves", { from: "2026-03-01", to: "2026-03-14", compare: "previous" }, { source: "google" })).compareRange).toBeNull();
	});
});

describe("search_striking_distance", () => {
	it("lists [4, 21) pairs above the floor and estimates potential clicks from the site's own top-3 CTR", async () => {
		const env = await schemaDb();
		const rows = (top3: number): SearchFixtureRow[] => [
			{ day: "2026-03-10", query: "s1", page: "/a", impressions: 200, clicks: 10, position: 4 },
			{ day: "2026-03-10", query: "s2", page: "/a", impressions: 100, clicks: 1, pos_sum: 2099 },
			{ day: "2026-03-10", query: "s3", page: "/a", impressions: 100, clicks: 1, position: 21 },
			{ day: "2026-03-10", query: "s4", page: "/a", impressions: top3, clicks: 300, pos_sum: 3.9 * top3 },
			{ day: "2026-03-10", query: "s5", page: "/b", impressions: 10, clicks: 1, position: 10 },
			{ day: "2026-03-10", query: "acme s6", page: "/b", impressions: 100, clicks: 1, position: 10 },
		];
		insertSearch(env.raw, "enough", rows(1000));
		insertSearch(env.raw, "few", rows(999));
		const enough = await runner(() => seoCtx(env.db, "enough"))("search_striking_distance", {});
		expect((enough.data.rows as Row[]).map((r) => [r.query, r.page, r.impressions, r.position, r.potential_clicks])).toEqual([
			["s1", "/a", 200, 4, 50],
			["s2", "/a", 100, 20.99, 29],
		]);
		expect(enough.data.totals).toEqual({ ctr_1_3: 0.3, impressions_1_3: 1000 });
		expect(enough.data.notices).not.toContain("top3_insufficient");
		const few = await runner(() => seoCtx(env.db, "few"))("search_striking_distance", {}, { includeBrand: true });
		expect((few.data.rows as Row[]).map((r) => [r.query, r.potential_clicks])).toEqual([
			["s1", null],
			["acme s6", null],
			["s2", null],
		]);
		expect(few.data.notices).toContain("top3_insufficient");
	});
});
