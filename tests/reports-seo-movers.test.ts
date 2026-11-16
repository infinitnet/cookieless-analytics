/** Rising and declining pages and queries, content decay. */
import { beforeAll, describe, expect, it } from "vitest";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { decayDiagnosis } from "../src/query/reports/seo.js";
import { insertRollupPages, insertSearch, runner, type SearchFixtureRow, seoCtx } from "./fixtures/seo.js";
import { schemaDb } from "./helpers.js";

const PREV = "2026-02-20";
const CUR = "2026-03-05";
const RANGE = { from: "2026-03-01", to: "2026-03-14" };

describe("search_movers", () => {
	let rc: ReportCtx;
	const run = runner(() => rc);
	beforeAll(async () => {
		const env = await schemaDb();
		const page = (day: string, p: string, clicks: number, impressions: number, position = 5): SearchFixtureRow => ({ day, page: p, clicks, impressions, position });
		insertSearch(env.raw, "default", [
			page(PREV, "/a", 100, 1000, 3),
			page(CUR, "/a", 40, 900, 4.5),
			page(PREV, "/b", 10, 200),
			page(CUR, "/b", 5, 200),
			page(CUR, "/c", 30, 300),
			page(PREV, "/c", 0, 100),
			page(PREV, "/d", 3, 10),
			page(CUR, "/d", 1, 10),
			{ day: CUR, query: "blue widgets", clicks: 9, impressions: 90, position: 3 },
			{ day: PREV, query: "blue widgets", clicks: 1, impressions: 60, position: 3 },
			// A final totals row at the end of the range: nothing is provisional.
			{ day: "2026-03-14", clicks: 0, impressions: 1 },
		]);
		rc = seoCtx(env.db, "default");
	});

	it("declining pages sorted by absolute delta, with notable, delta_pct and the floor", async () => {
		const r = await run("search_movers", RANGE);
		expect(r.data.periods).toMatchObject({ current: { from: "2026-03-01", to: "2026-03-14" }, previous: { from: "2026-02-15", to: "2026-02-28" } });
		expect((r.data.rows as Row[]).map((x) => [x.key, x.current, x.previous, x.delta, x.delta_pct, x.notable])).toEqual([
			["/a", 40, 100, -60, -0.6, true],
			["/b", 5, 10, -5, -0.5, false],
		]);
		expect((r.data.rows as Row[])[0]).toMatchObject({ impressions_current: 900, impressions_previous: 1000, position_current: 4.5, position_previous: 3, ctr_current: 0.0444, ctr_previous: 0.1, position_moved: true });
		const up = await run("search_movers", RANGE, { direction: "up" });
		expect((up.data.rows as Row[]).map((x) => [x.key, x.delta, x.delta_pct])).toEqual([["/c", 30, null]]);
		const imp = await run("search_movers", RANGE, { metric: "impressions", direction: "up" });
		expect((imp.data.rows as Row[]).map((x) => [x.key, x.delta])).toEqual([["/c", 200]]);
		const q = await run("search_movers", RANGE, { dim: "query", direction: "up" });
		expect((q.data.rows as Row[]).map((x) => [x.key, x.delta, x.notable])).toEqual([["blue widgets", 8, true]]);
	});
});

describe("traffic_movers and traffic_decay", () => {
	it("read summary page rows, ignore session filters with the notice and end at the last stored day", async () => {
		const env = await schemaDb();
		insertRollupPages(env.raw, "default", [
			{ day: PREV, page: "/x", pageviews: 200 },
			{ day: CUR, page: "/x", pageviews: 100 },
			{ day: PREV, page: "/y", pageviews: 50 },
			{ day: CUR, page: "/y", pageviews: 80 },
			{ day: PREV, page: "(other)", pageviews: 900 },
			{ day: "2026-03-15", page: "/x", pageviews: 500 },
		]);
		// The writer's watermark: 03-14 is stored, 03-15 is open.
		const run = runner(() => ({ ...seoCtx(env.db, "default"), summaryThrough: "2026-03-14" }));
		const r = await run("traffic_movers", { ...RANGE, to: "2026-03-15", filters: [{ dim: "channel", op: "is", values: ["Direct"] }] });
		expect((r.data.rows as Row[]).map((x) => [x.key, x.current, x.previous, x.delta])).toEqual([["/x", 100, 200, -100]]);
		expect(r.data.notices).toEqual(["provisional_excluded", "filters_not_applied"]);
		expect(r.data.periods).toMatchObject({ current: { to: "2026-03-14" }, excluded: 1, reason: "incomplete" });
		const up = await run("traffic_movers", RANGE, { direction: "up" });
		expect((up.data.rows as Row[]).map((x) => [x.key, x.delta])).toEqual([["/y", 30]]);
	});
});

describe("decay", () => {
	// n = 7: current 03-08..03-14, middle 03-01..03-07, oldest 02-22..02-28.
	const OLD = "2026-02-25";
	const MID = "2026-03-03";
	const NOW = "2026-03-10";
	const rows = (p: string, c: [number, number, number], imp: [number, number, number], pos: [number, number, number]): SearchFixtureRow[] =>
		[OLD, MID, NOW].map((day, i) => ({ day, page: p, clicks: c[i] as number, impressions: imp[i] as number, position: pos[i] as number }));

	it("strictly falling over three periods with the oldest floor; diagnosis labels", async () => {
		const env = await schemaDb();
		insertSearch(env.raw, "default", [
			...rows("/p", [100, 60, 30], [1000, 1000, 900], [3, 4, 6]),
			...rows("/q", [100, 80, 50], [1000, 1000, 1000], [4, 4, 4.5]),
			...rows("/r", [100, 90, 80], [1000, 900, 800], [4, 4, 4]),
			...rows("/s", [100, 100, 50], [1000, 1000, 1000], [4, 4, 4]),
			...rows("/t", [30, 20, 10], [40, 40, 40], [4, 4, 4]),
			{ day: "2026-03-14", clicks: 0, impressions: 1 },
		]);
		const r = await runner(() => seoCtx(env.db, "default"))("search_decay", { from: "2026-03-08", to: "2026-03-14" });
		expect((r.data.rows as Row[]).map((x) => [x.key, x.oldest, x.middle, x.current, x.loss, x.diagnosis])).toEqual([
			["/p", 100, 60, 30, 70, "position"],
			["/q", 100, 80, 50, 50, "ctr"],
			["/r", 100, 90, 80, 20, "demand"],
		]);
		expect(r.data.periods).toMatchObject({ oldest: { from: "2026-02-22", to: "2026-02-28" }, days: 7 });
		// 3 * n is capped at 279 by the 93 day range cap.
		await expect(runner(() => seoCtx(env.db, "default"))("search_decay", { from: "2026-01-01", to: "2026-04-04" })).rejects.toMatchObject({ code: "range_too_long" });
		expect(decayDiagnosis(3, 4.9, 0.1, 0.07)).toBe("ctr");
		expect(decayDiagnosis(3, 5, 0.1, 0.07)).toBe("position");
		expect(decayDiagnosis(3, 4, 0.1, 0.08)).toBe("demand");
	});

	it("traffic_decay over rollup pageviews", async () => {
		const env = await schemaDb();
		insertRollupPages(env.raw, "default", [
			{ day: OLD, page: "/x", pageviews: 300 },
			{ day: MID, page: "/x", pageviews: 200 },
			{ day: NOW, page: "/x", pageviews: 100 },
			{ day: OLD, page: "/y", pageviews: 30 },
			{ day: MID, page: "/y", pageviews: 20 },
			{ day: NOW, page: "/y", pageviews: 10 },
		]);
		const r = await runner(() => seoCtx(env.db, "default"))("traffic_decay", { from: "2026-03-08", to: "2026-03-14" });
		expect(r.data.rows).toEqual([{ key: "/x", oldest: 300, middle: 200, current: 100, loss: 200 }]);
	});
});
