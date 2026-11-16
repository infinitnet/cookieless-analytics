/** `links` report (Links convention) over the synthetic fixture in tests/fixtures/links.ts; hand sums in comments. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/adapter.js";
import { type Filter, type QueryInput, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { clearReportCache, type Params, runReport } from "../src/query/reports/index.js";
import { LINK_BY } from "../src/query/reports/links.js";
import { rollupDay } from "../src/query/rollup.js";
import type { Settings } from "../src/settings.js";
import { LINKS_RANGE, seedLinks } from "./fixtures/links.js";
import { schemaDb } from "./helpers.js";

const SETTINGS = { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 } as Settings;
const pick = (rows: Row[] | undefined, ...f: string[]) => (rows ?? []).map((r) => [r.key, ...f.map((x) => r[x])]);

describe("links report", () => {
	let rc: ReportCtx;
	beforeAll(async () => {
		const env = await schemaDb();
		seedLinks(env.raw);
		rc = { db: env.db, site: "default", settings: SETTINGS, now: Date.UTC(2026, 2, 12, 12) / 1000, goals: [], funnels: {}, annotations: [], defaultCurrency: "USD" };
	});
	beforeEach(() => clearReportCache());
	const run = (params: Params = {}, q: Partial<QueryInput> = {}, over: Partial<ReportCtx> = {}) =>
		runReport({ ...rc, ...over }, { report: "links", query: QuerySchema.parse({ ...LINKS_RANGE, ...q }), params });
	const is = (dim: Filter["dim"], v: string): Filter => ({ dim, op: "is", values: [v] });

	it("by link: impressions, clicks and CTR equal hand sums; clicked but never seen has CTR 0; seen but never clicked is listed", async () => {
		const r = await run();
		// alpha: seen 5 (v1) + 1 (v2), clicks o1 o3 o4 from A B D, conv c1 c3. beta: seen 4 + 1 + 1, click o2, conv c2.
		// gamma: seen 1 + 1, no click. delta: click o5 without a session, never seen.
		expect(pick(r.data.rows, "impressions", "clicks", "ctr", "sessions", "conversions")).toEqual([
			["alpha-offer", 6, 3, 0.5, 3, 2],
			["beta-offer", 6, 1, 0.1667, 1, 1],
			["delta-offer", 0, 1, 0, 0, 0],
			["gamma-offer", 2, 0, 0, 0, 0],
		]);
		expect(r.data.totals).toEqual({ impressions: 14, clicks: 5, ctr: 0.3571, conversions: 3 });
		expect(r.data.rows?.[0]).not.toHaveProperty("revenue");
	});

	it("by place: `<slug>@<place>` splits, a key without `@` and a click without place count under (none)", async () => {
		const all = await run({ by: "place" });
		expect(pick(all.data.rows, "impressions", "clicks", "conversions")).toEqual([
			["offers-table", 7, 3, 1],
			["sidebar", 4, 1, 1],
			["(none)", 3, 1, 1],
		]);
		// Drill-down: the placements of one link.
		const beta = await run({ by: "place", slug: "beta-offer" });
		expect(pick(beta.data.rows, "impressions", "clicks", "conversions")).toEqual([
			["sidebar", 2, 1, 1],
			["offers-table", 3, 0, 0],
			["(none)", 1, 0, 0],
		]);
		expect(pick((await run({ slug: "beta-offer" })).data.rows, "impressions", "clicks")).toEqual([["beta-offer", 6, 1]]);
	});

	it("by channel: a click follows its session; a click without a counted session is (not set)", async () => {
		const r = await run({ by: "channel" });
		expect(pick(r.data.rows, "impressions", "clicks", "conversions")).toEqual([
			["Search", 11, 2, 1],
			["(not set)", 0, 2, 1],
			["Direct", 3, 1, 1],
		]);
		expect(pick((await run({ by: "page" })).data.rows, "impressions", "clicks")).toEqual([
			["/reviews", 13, 3],
			["/", 1, 1],
			["/x", 0, 1],
		]);
		for (const by of LINK_BY) expect((await run({ by })).data.by).toBe(by);
	});

	it("revenue: one currency per result, the others listed under data.currencies", async () => {
		const usd = await run({ withRevenue: true });
		expect(usd.data.currency).toBe("USD");
		expect(pick(usd.data.rows, "revenue", "revenue_currency", "conversions").slice(0, 2)).toEqual([
			["alpha-offer", 4, "USD", 2],
			["beta-offer", 0, "USD", 1],
		]);
		expect(usd.data.currencies).toEqual([
			{ currency: "USD", revenue: 4, orders: 1 },
			{ currency: "EUR", revenue: 19.75, orders: 2 },
		]);
		const eur = await run({ withRevenue: true, currency: "EUR" });
		expect(pick(eur.data.rows, "revenue").slice(0, 2)).toEqual([
			["alpha-offer", 12.5],
			["beta-offer", 7.25],
		]);
		expect(eur.data.totals).toMatchObject({ revenue: 19.75, conversions: 3 });
		expect(eur.data.other_currencies).toEqual(["USD"]);
	});

	it("filters page, channel, country and a segment's filters narrow to the hits of matching sessions", async () => {
		const rows = async (f: Filter) => pick((await run({}, { filters: [f] })).data.rows, "impressions", "clicks", "conversions");
		// Sessions A and C.
		expect(await rows(is("channel", "Search"))).toEqual([
			["alpha-offer", 5, 1, 1],
			["beta-offer", 5, 1, 0],
			["gamma-offer", 1, 0, 0],
		]);
		// Session B.
		expect(await rows(is("country", "US"))).toEqual([
			["alpha-offer", 1, 1, 0],
			["beta-offer", 1, 0, 1],
			["gamma-offer", 1, 0, 0],
		]);
		// Sessions that viewed /reviews: A and B.
		expect(await rows(is("page", "/reviews"))).toEqual([
			["alpha-offer", 6, 2, 1],
			["beta-offer", 5, 1, 1],
			["gamma-offer", 2, 0, 0],
		]);
		// A segment is a list of filters resolved by the route: device mobile, sessions B and C.
		expect(await rows(is("device", "mobile"))).toEqual([
			["alpha-offer", 1, 1, 0],
			["beta-offer", 2, 0, 1],
			["gamma-offer", 1, 0, 0],
		]);
	});

	it("compare previous merges the previous rows by key", async () => {
		const r = await run({}, { from: "2026-03-11", to: "2026-03-11", compare: "previous" });
		expect(r.compareRange).toEqual({ from: "2026-03-10", to: "2026-03-10" });
		const alpha = r.data.rows?.find((x) => x.key === "alpha-offer");
		// 03-11: o4; 03-10: o1, o3.
		expect(alpha).toMatchObject({ clicks: 1, previous: { clicks: 2 }, delta: { clicks: -0.5 } });
		expect(r.data.compareTotals).toMatchObject({ clicks: 3 });
	});

	it("a range before the raw window reads the daily link rows (03-10 stored, 03-11 and 03-12 open) and names the first detailed day", async () => {
		await rollupDay({ db: rc.db, site: "default", settings: SETTINGS, goals: [] }, "2026-03-10");
		for (const params of [{}, { by: "place" }, { withRevenue: true, currency: "EUR" }] as Params[]) {
			const r = await run(params, {}, { rawFrom: "2026-03-05" });
			expect(r.notices).toEqual(expect.arrayContaining(["summary", "detail_from:2026-03-05"]));
			expect(r.data, JSON.stringify(params)).toEqual((await run(params)).data);
		}
		expect((await run({}, {}, { rawFrom: "2026-03-05" })).data.totals).toMatchObject({ impressions: 14, clicks: 5 });
		// Session D (no page view) and the click without a session fail a segment filter, as in the detailed report.
		const de = await run({}, { filters: [is("country", "DE")] }, { rawFrom: "2026-03-05" });
		expect(de.data.rows).toEqual((await run({}, { filters: [is("country", "DE")] })).data.rows);
		await expect(run({ by: "page" }, {}, { rawFrom: "2026-03-05" })).rejects.toMatchObject({ code: "raw_only" });
		await expect(run({ by: "nope" as never })).rejects.toBeTruthy();
	});
});

describe.each(["sqlite", "postgres"] as const)("links statement snapshot (%s)", (dialect) => {
	it("binds every value and reads the visits of the range by key, plus the visitless rows of ca_events without a session filter", async () => {
		const seen: Array<{ sql: string; params: unknown[] }> = [];
		const fake: Db = {
			dialect,
			run: async () => ({ changes: 0 }),
			all: async (sql, p) => (seen.push({ sql, params: p ?? [] }), [] as never[]),
			batch: async () => undefined,
		};
		const rc: ReportCtx = { db: fake, site: "default", settings: SETTINGS, now: 0, goals: [], funnels: {}, annotations: [], defaultCurrency: "USD" };
		const out: Record<string, typeof seen> = {};
		for (const params of [{}, { by: "place", slug: "alpha-offer" }, { by: "channel", withRevenue: true, currency: "EUR" }] as Params[]) {
			seen.length = 0;
			clearReportCache();
			await runReport(rc, { report: "links", query: QuerySchema.parse({ ...LINKS_RANGE, filters: [{ dim: "country", op: "is", values: ["DE"] }] }), params });
			out[JSON.stringify(params)] = [...seen];
		}
		expect(out).toMatchSnapshot();
		for (const [name, stmts] of Object.entries(out))
			for (const s of stmts) {
				expect(s.sql, name).not.toMatch(/'out'|'seen'|'conv'|alpha|EUR|2026-|'DE'/);
				expect((s.sql.match(/\?/g) ?? []).length, `${name}: ${s.sql}`).toBe(s.params.length);
				expect(s.sql, name).toMatch(/FROM ca_sessions s CROSS JOIN json_?b?_?each\(s\.hits\) AS h/);
				expect(s.sql, name).toContain("s.site = ? AND s.day BETWEEN ? AND ?");
				// The country filter is a session filter: rows without a visit cannot match it.
				expect(s.sql, name).not.toContain("FROM ca_events h");
			}
	});
});
