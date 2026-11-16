/**
 * Summary readers and routing: which engine answers a report for a range (detailed or summaries), the notices of
 * every combination of report and filters, the numbers of pair reads, the scan budget and `narrow_range`,
 * compare ranges, and the open-day merge: a range that ends today answers from the summaries exactly like the
 * detailed reports, and today's Sites figures are current. SQL text for both dialects, query plans on SQLite.
 */
import { noticeCopy } from "../src/charts/caveats.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, zonedToEpoch } from "../src/core/time.js";
import { type Filter, type Goal, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { REVENUE_BREAKDOWN_DIMS } from "../src/query/reports/revenue.js";
import { summarySql } from "../src/query/reports/summary.js";
import { KV_WATERMARK, runRollup } from "../src/query/rollup.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { schemaDb } from "./helpers.js";
import { agentHarness } from "./agent.helpers.js";
import { DAYS, RANGE, seed } from "./fixtures/seed.js";
import { KV_CURSOR } from "../src/query/retention.js";
import { rollupDay } from "../src/query/rollup.js";

type Env = Awaited<ReturnType<typeof schemaDb>>;
const f = (dim: Filter["dim"], ...values: string[]): Filter => ({ dim, op: "is", values });
const fo = (dim: Filter["dim"], op: Filter["op"], ...values: string[]): Filter => ({ dim, op, values });
const run = (rc: ReportCtx, report: ReportName, from: string, to: string, filters: Filter[] = [], params: Params = {}, compare: "none" | "previous" = "none") =>
	runReport(rc, { report, query: QuerySchema.parse({ from, to, filters, compare }), params, limit: 1000 });

// ── hand-written summary rows ─────────────────────────────────────────────────

const DAY = "2026-03-01";
const UTC: Settings = normalizeSettings({ siteTimezone: "UTC" });

/** One stored day: single dimension rows, page x country and event x device pairs, revenue rows. */
function seedSummaries(env: Env, day = DAY): void {
	const r = env.raw.prepare(
		"INSERT INTO ca_rollup (site, day, dim, key, seg, segkey, pageviews, sessions, visitors, bounces, engaged, engaged_ms, events, hits) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0)",
	);
	// [dim, key, seg, segkey, pageviews, sessions, visitors, events]
	const rows: Array<[string, string, string, string, number, number, number, number]> = [
		["all", "", "", "", 25, 10, 9, 3],
		["country", "DE", "", "", 15, 6, 5, 2],
		["country", "FR", "", "", 10, 4, 4, 1],
		["channel", "Direct", "", "", 17, 7, 6, 2],
		["channel", "Search", "", "", 8, 3, 3, 1],
		["device", "desktop", "", "", 20, 8, 7, 1],
		["device", "mobile", "", "", 5, 2, 2, 2],
		["page", "/a", "", "", 20, 9, 8, 0],
		["page", "/b", "", "", 5, 3, 3, 0],
		["exit", "/a", "", "", 0, 4, 4, 0],
		["page", "/a", "country", "DE", 12, 5, 4, 0],
		["page", "/a", "country", "FR", 8, 4, 4, 0],
		["page", "/b", "country", "DE", 5, 3, 3, 0],
		["event", "signup", "", "", 0, 2, 2, 3],
		["event", "signup", "device", "mobile", 0, 1, 1, 2],
		// Links: sessions are clicking sessions, events clicks (impressions in hits stay 0 here).
		["link", "alpha", "", "", 0, 3, 0, 4],
		["link", "beta", "", "", 0, 1, 0, 1],
		["link", "alpha", "country", "DE", 0, 2, 0, 3],
		["link_place", "hero", "", "", 0, 4, 0, 5],
		// Journeys: next rows (segkey '' holds the page's visits) and one path.
		["next", "/a", "", "", 0, 9, 0, 0],
		["next", "/a", "", "/b", 0, 3, 0, 0],
		["next", "/a", "", "(exit)", 0, 6, 0, 0],
		["next", "(entry)", "", "/a", 0, 7, 0, 0],
		["path3", "/a", "", "/b\u001f/a", 0, 2, 0, 0],
	];
	for (const x of rows) r.run(day, ...x);
	const v = env.raw.prepare("INSERT INTO ca_revenue_daily (site, day, dim, key, cur, seg, segkey, orders, revenue, sessions) VALUES ('default', ?, ?, ?, 'USD', ?, ?, ?, ?, ?)");
	for (const x of [
		["all", "", "", "", 3, 30, 3],
		["country", "DE", "", "", 2, 20, 2],
		["country", "FR", "", "", 1, 10, 1],
		["page", "/a", "", "", 3, 30, 3],
		["page", "/a", "country", "DE", 2, 20, 2],
		// Orders per cube cell (dim `all`, seg `cube`).
		["all", "", "cube", "Direct\u001fDE\u001fdesktop", 2, 20, 2],
		["all", "", "cube", "Direct\u001fFR\u001fmobile", 1, 10, 1],
	] as const)
		v.run(day, ...x);
	// Cube cells, consistent with the single dimension rows above: [channel, country, device, pageviews, sessions, visitors, events].
	const c = env.raw.prepare("INSERT INTO ca_cube (site, day, channel, country, device, pageviews, sessions, visitors, events) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)");
	for (const x of [
		["Direct", "DE", "desktop", 7, 3, 2, 1],
		["Direct", "FR", "mobile", 2, 1, 1, 1],
		["Direct", "FR", "desktop", 8, 3, 3, 0],
		["Search", "DE", "desktop", 5, 2, 2, 0],
		["Search", "DE", "mobile", 3, 1, 1, 1],
	] as const)
		c.run(Number(day.replaceAll("-", "")), ...x);
}

describe("the engine and notices per report and filter set (summaries before the detailed window)", () => {
	let env: Env;
	let rc: ReportCtx;
	beforeAll(async () => {
		env = await schemaDb();
		seedSummaries(env);
		rc = { db: env.db, site: "default", settings: UTC, now: zonedToEpoch("2026-03-20", 12, "UTC"), goals: [], funnels: {}, annotations: [], defaultCurrency: "USD", rawFrom: "2026-03-02", summaryThrough: "2026-03-17" };
	});
	beforeEach(() => clearReportCache());

	const SUMMARY = ["summary", "detail_from:2026-03-02"];
	const MATRIX: Array<[ReportName, Filter[], Params, string[]]> = [
		["overview", [], {}, []],
		["overview", [f("country", "DE")], {}, []],
		// Segments combine through the cube: totals, series and the segment breakdowns.
		["overview", [f("country", "DE"), f("channel", "Direct")], {}, []],
		["overview", [f("country", "DE"), f("channel", "Direct"), f("device", "mobile")], {}, []],
		// A non-segment session dim takes the totals: the segments do not combine with it.
		["overview", [f("browser", "Chrome"), f("country", "DE"), f("channel", "Direct")], {}, ["filter_unavailable:country:combination", "filter_unavailable:channel:combination"]],
		["overview", [f("entry", "/a"), f("country", "DE")], {}, []],
		["overview", [f("page", "/a")], {}, ["filter_unavailable:page:combination"]],
		["overview", [f("region", "BE")], {}, ["filter_unavailable:region:not_kept"]],
		// One day asks for hours, which the summaries do not keep.
		["timeseries", [f("device", "mobile"), f("country", "FR")], {}, ["granularity_day"]],
		["pages", [f("country", "DE")], {}, []],
		["pages", [f("page", "/a"), f("country", "DE"), f("device", "mobile")], {}, ["filter_unavailable:device:combination"]],
		["pages", [f("browser", "Chrome")], {}, ["filter_unavailable:browser:combination"]],
		["entry_pages", [f("channel", "Direct")], {}, []],
		["exit_pages", [f("channel", "Direct")], {}, ["filter_unavailable:channel:combination"]],
		["channels", [f("country", "DE")], {}, []],
		["devices", [f("country", "DE"), f("channel", "Direct")], {}, []],
		["countries", [f("browser", "Chrome")], {}, ["filter_unavailable:browser:combination"]],
		["browsers", [f("country", "DE")], {}, ["filter_unavailable:country:combination"]],
		["events", [f("device", "mobile")], {}, []],
		// A page-like breakdown takes one segment through its pair rows; a second one has no rows.
		["events", [f("device", "mobile"), f("country", "DE")], {}, ["filter_unavailable:country:combination"]],
		["entry_pages", [f("channel", "Direct"), f("country", "DE")], {}, ["filter_unavailable:country:combination"]],
		["goals", [f("channel", "Direct")], {}, []],
		["revenue", [f("country", "DE")], {}, []],
		["revenue", [f("country", "DE"), f("device", "mobile")], {}, []],
		["revenue_breakdown", [f("country", "DE")], { dim: "page" }, []],
		["revenue_breakdown", [f("country", "DE"), f("device", "mobile")], { dim: "page" }, ["filter_unavailable:device:combination"]],
		["revenue_breakdown", [f("country", "DE")], { dim: "channel" }, []],
		["links", [], {}, []],
		["links", [f("country", "DE")], {}, []],
		["links", [f("country", "DE"), f("device", "mobile")], {}, ["filter_unavailable:device:combination"]],
		["links", [f("page", "/a")], {}, ["filter_unavailable:page:not_kept"]],
		["links", [], { by: "place" }, []],
		["links", [f("country", "DE")], { by: "place" }, ["filter_unavailable:country:not_kept"]],
		["journey_next", [], { path: "/a" }, ["top_paths_per_day"]],
		["journey_prev", [], { path: "/a" }, ["top_paths_per_day"]],
		["journey_paths", [f("country", "DE")], {}, ["top_paths_per_day", "filter_unavailable:country:not_kept"]],
		// What the rows cannot answer: revenue under dims ca_revenue_daily does not keep, negated operators
		// on revenue reads and on page, event, goal and utm_campaign, and a filter on the report's own dimension.
		["revenue", [f("browser", "Chrome")], {}, ["filter_unavailable:browser:not_kept"]],
		["revenue_series", [f("exit", "/a")], {}, ["filter_unavailable:exit:not_kept"]],
		["revenue", [fo("country", "is_not", "DE")], {}, ["filter_unavailable:country:negated"]],
		["revenue_breakdown", [fo("channel", "not_contains", "Dir")], { dim: "channel" }, ["filter_unavailable:channel:negated"]],
		["overview", [fo("utm_campaign", "is_not", "spring")], {}, ["filter_unavailable:utm_campaign:negated"]],
		["overview", [fo("country", "is_not", "DE")], {}, []],
		// On the campaigns report a visit has one campaign: dropping its row drops its visits.
		["campaigns", [fo("utm_campaign", "is_not", "spring")], {}, []],
		["pages", [fo("page", "is_not", "/b")], {}, ["filter_unavailable:page:negated"]],
		["events", [fo("event", "not_prefix", "sign")], {}, ["filter_unavailable:event:negated"]],
		["events", [f("event", "signup")], {}, ["filter_unavailable:event:own"]],
		["goals", [f("goal", "Signup")], {}, ["filter_unavailable:goal:own"]],
		["exit_pages", [f("exit", "/a")], {}, ["filter_unavailable:exit:own"]],
		["revenue_breakdown", [f("page", "/a")], { dim: "page" }, ["filter_unavailable:page:own"]],
		["revenue_breakdown", [f("event", "signup")], { dim: "event" }, ["filter_unavailable:event:own"]],
	];
	it.each(MATRIX)("%s with %j", async (report, filters, params, unavailable) => {
		const r = await run(rc, report, DAY, DAY, filters, params);
		expect([...r.notices].sort()).toEqual([...SUMMARY, ...unavailable].sort());
	});

	it("names the days a summary answer leaves out while the writer is more than MAX_OPEN_DAYS behind", async () => {
		const behind = { ...rc, summaryThrough: "2026-03-05" };
		const r = await run(behind, "overview", DAY, "2026-03-20", [], {});
		// Open days after the 5th: the newest four (17th to 20th) are computed, the 6th to the 16th are named.
		expect(r.notices).toContain("summary_behind:2026-03-06:2026-03-16");
		expect(noticeCopy("summary_behind:2026-03-06:2026-03-16")).toBe("The daily summaries are not stored yet for 2026-03-06 to 2026-03-16, so those days are missing from these totals until the background runs catch up.");
		// Within reach: no notice.
		expect((await run(rc, "overview", DAY, "2026-03-20", [], {})).notices.some((n) => n.startsWith("summary_behind"))).toBe(false);
	});

	it("keeps raw_only for the reports that need detailed rows, naming the first detailed day", async () => {
		for (const [report, params] of [
			["satisfaction", {}],
			["links", { by: "page" }],
			["links", { by: "place", slug: "alpha" }],
			["funnels", { steps: [{ type: "page", match: "is", value: "/a" }, { type: "page", match: "is", value: "/b" }] }],
			["regions", {}],
		] as Array<[ReportName, Params]>)
			await expect(run(rc, report, DAY, DAY, [], params), report).rejects.toMatchObject({ code: "raw_only", message: expect.stringContaining("2026-03-02") });
	});

	it("links and journeys answer from their summary rows", async () => {
		expect((await run(rc, "links", DAY, DAY)).data.rows?.map((r) => [r.key, r.clicks, r.sessions])).toEqual([
			["alpha", 4, 3],
			["beta", 1, 1],
		]);
		expect((await run(rc, "links", DAY, DAY, [f("country", "DE")])).data.rows?.map((r) => [r.key, r.clicks])).toEqual([["alpha", 3]]);
		const next = await run(rc, "journey_next", DAY, DAY, [], { path: "/a" });
		expect([next.data.rows?.map((r) => [r.key, r.sessions]), next.data.page_sessions]).toEqual([
			[
				["(exit)", 6],
				["/b", 3],
			],
			9,
		]);
		expect((await run(rc, "journey_prev", DAY, DAY, [], { path: "/a" })).data.rows?.map((r) => [r.key, r.sessions])).toEqual([["(entry)", 7]]);
		expect((await run(rc, "journey_paths", DAY, DAY)).data.rows?.map((r) => r.key)).toEqual(["/a > /b > /a"]);
		// The 31 day rule holds for the summaries too.
		await expect(run(rc, "journey_paths", "2026-01-01", DAY)).rejects.toMatchObject({ code: "journey_range" });
	});

	it("pair rows answer a page-like breakdown under one segment filter; the exit rate needs unsegmented rows", async () => {
		const p = await run(rc, "pages", DAY, DAY, [f("country", "DE")]);
		expect(p.data.rows?.map((r) => [r.key, r.pageviews, r.visitors, r.exit_rate])).toEqual([
			["/a", 12, 4, null],
			["/b", 5, 3, null],
		]);
		const plain = await run(rc, "pages", DAY, DAY);
		expect(plain.data.rows?.map((r) => [r.key, r.pageviews, r.exit_rate])).toEqual([
			["/a", 20, 0.2],
			["/b", 5, 0],
		]);
		const ev = await run(rc, "events", DAY, DAY, [f("device", "mobile")]);
		// The rate's denominator is every visit under the same segment filter: 1 of the 2 mobile visits.
		expect(ev.data.rows).toEqual([{ key: "signup", events: 2, sessions: 1, rate: 0.5 }]);
		expect(ev.data.total_sessions).toBe(2);
	});

	it("one segment filter on totals reads its exact single dimension rows; two and three segments read the cube", async () => {
		const one = await run(rc, "overview", DAY, DAY, [f("country", "DE")]);
		expect(one.data.totals).toMatchObject({ sessions: 6, pageviews: 15 });
		const two = await run(rc, "overview", DAY, DAY, [f("country", "DE"), f("channel", "Direct")]);
		expect(two.data.totals).toMatchObject({ sessions: 3, pageviews: 7, visitors: 2 });
		const search = await run(rc, "overview", DAY, DAY, [f("country", "DE"), f("channel", "Search")]);
		expect(search.data.totals).toMatchObject({ sessions: 3, pageviews: 8, visitors: 3 });
		const three = await run(rc, "overview", DAY, DAY, [f("country", "DE"), f("channel", "Search"), { dim: "device", op: "is_not", values: ["mobile"] }]);
		expect(three.data.totals).toMatchObject({ sessions: 2, pageviews: 5 });
		const ch = await run(rc, "channels", DAY, DAY, [f("country", "DE")]);
		expect(ch.data.rows?.map((r) => [r.key, r.sessions])).toEqual([
			["Direct", 3],
			["Search", 3],
		]);
		const cell = await run(rc, "timeseries", DAY, DAY, [f("device", "mobile"), f("country", "FR")]);
		expect(cell.data.series?.map((p) => [p.t, p.sessions, p.pageviews])).toEqual([[DAY, 1, 2]]);
		const ts = await run(rc, "timeseries", DAY, DAY, [{ dim: "channel", op: "is_not", values: ["Direct"] }]);
		expect(ts.data.series?.map((p) => [p.t, p.sessions])).toEqual([[DAY, 3]]);
	});

	it("revenue columns of a breakdown are left out when the summaries cannot apply the filters", async () => {
		const ch = await run(rc, "channels", DAY, DAY, [f("browser", "Chrome")], { withRevenue: true });
		expect(ch.data.notices).toEqual(["revenue_not_available"]);
		expect(ch.data.rows?.every((r) => r.revenue === undefined)).toBe(true);
	});

	it("revenue under segments combined reads the orders per cube cell", async () => {
		const t = await run(rc, "revenue", DAY, DAY, [f("country", "DE"), f("channel", "Direct")]);
		expect(t.data.totals).toMatchObject({ revenue: 20, orders: 2, visitors: 2, sessions: 3 });
		const none = await run(rc, "revenue", DAY, DAY, [f("country", "DE"), f("device", "mobile")]);
		expect(none.data.totals).toMatchObject({ orders: 0, sessions: 1 });
		const b = await run(rc, "revenue_breakdown", DAY, DAY, [f("channel", "Direct")], { dim: "country" });
		expect(b.data.rows?.map((r) => [r.key, r.revenue, r.orders])).toEqual([
			["DE", 20, 2],
			["FR", 10, 1],
		]);
		const ch = await run(rc, "channels", DAY, DAY, [f("country", "DE")], { withRevenue: true });
		expect(ch.data.notices).toBeUndefined();
		expect(ch.data.rows?.map((r) => [r.key, r.revenue])).toEqual([
			["Direct", 20],
			["Search", 0],
		]);
	});

	it("revenue reports honour one segment filter: totals, and a pair dimension's breakdown", async () => {
		const t = await run(rc, "revenue", DAY, DAY, [f("country", "DE")]);
		expect(t.data.totals).toMatchObject({ revenue: 20, orders: 2, visitors: 5, sessions: 6 });
		const b = await run(rc, "revenue_breakdown", DAY, DAY, [f("country", "DE")], { dim: "page" });
		expect(b.data.rows?.map((r) => [r.key, r.revenue, r.orders, r.visitors])).toEqual([
			["/a", 20, 2, 4],
			["/b", 0, 0, 3],
		]);
		// A filter on the breakdown's own dimension: the detailed rows list every order of the matching visits, the summaries cannot.
		const own = await run(rc, "revenue_breakdown", DAY, DAY, [f("page", "/b")], { dim: "page" });
		expect(own.notices.filter((n) => n.startsWith("filter_"))).toEqual(["filter_unavailable:page:own"]);
		const s = await run(rc, "revenue_series", DAY, DAY, [f("country", "FR")]);
		expect(s.data.series?.map((p) => [p.t, p.revenue])).toEqual([[DAY, 10]]);
	});

	it("a compare range before the window reads the summaries, the current one the detailed rows", async () => {
		const r = await run(rc, "overview", "2026-03-02", "2026-03-02", [f("country", "DE")], {}, "previous");
		expect(r.compareRange).toEqual({ from: DAY, to: DAY });
		expect([...r.notices].sort()).toEqual(["compare_summary"]);
		expect(r.data.compareTotals).toMatchObject({ sessions: 6 });
		const l = await run(rc, "links", "2026-03-02", "2026-03-02", [], {}, "previous");
		expect([l.notices, l.data.compareTotals]).toEqual([["compare_summary"], expect.objectContaining({ clicks: 5 })]);
	});
});

describe("summary exit rate: page views and exits over the same days", () => {
	let env: Env;
	let rc: ReportCtx;
	beforeAll(async () => {
		env = await schemaDb();
		const r = env.raw.prepare(
			"INSERT INTO ca_rollup (site, day, dim, key, seg, segkey, pageviews, sessions, visitors, bounces, engaged, engaged_ms, events, hits) VALUES ('default', ?, ?, ?, '', '', ?, ?, 1, 0, 0, 0, 0, 0)",
		);
		// [day, dim, key, pageviews, sessions]
		for (const x of [
			// The gate's case: each family folds /x into (other) on the day the other keeps it (old answer 5 / 2 = 2.5).
			["2026-03-03", "page", "/x", 2, 2],
			["2026-03-03", "page", "/w", 9, 6],
			["2026-03-03", "exit", "/w", 0, 4],
			["2026-03-03", "exit", "(other)", 0, 3],
			["2026-03-04", "page", "(other)", 6, 4],
			["2026-03-04", "exit", "/x", 0, 5],
			// No fold: a day with a page row and no exit row has 0 exits.
			["2026-03-05", "page", "/y", 4, 4],
			["2026-03-05", "exit", "/y", 0, 3],
			["2026-03-06", "page", "/y", 6, 5],
			// A visit opened by an event exits on a page it never viewed: capped at 1.
			["2026-03-07", "page", "/z", 1, 1],
			["2026-03-07", "exit", "/z", 0, 2],
		] as const)
			r.run(...x);
		rc = { db: env.db, site: "default", settings: UTC, now: zonedToEpoch("2026-03-20", 12, "UTC"), goals: [], funnels: {}, annotations: [], defaultCurrency: "USD", rawFrom: "2026-03-15", summaryThrough: "2026-03-17" };
	});
	beforeEach(() => clearReportCache());

	it("a page filter over a range whose page rows hold (other) names it (summary_other); without (other) no notice", async () => {
		const page = { dim: "page", op: "is", values: ["/x"] } as Filter;
		const p = await run(rc, "pages", "2026-03-03", "2026-03-04", [page]);
		expect(p.notices).toContain("summary_other:page");
		expect(noticeCopy("summary_other:page")).toMatch(/summed into \(other\).*may be low/);
		const q = await run(rc, "pages", "2026-03-05", "2026-03-06", [{ dim: "page", op: "is", values: ["/y"] } as Filter]);
		expect(q.notices.some((n) => n.startsWith("summary_other"))).toBe(false);
	});

	it("a key folded on some day of the range has no rate and the notice", async () => {
		const p = await run(rc, "pages", "2026-03-03", "2026-03-04");
		expect(p.data.rows?.map((r) => [r.key, r.pageviews, r.exit_rate])).toEqual([
			["/w", 9, 0.4444],
			["(other)", 6, null],
			["/x", 2, null],
		]);
		expect(p.notices).toContain("exit_rate_partial");
		const e = await run(rc, "exit_pages", "2026-03-03", "2026-03-04");
		expect(e.data.rows?.map((r) => [r.key, r.exits, r.exit_rate])).toEqual([
			["/x", 5, null],
			["/w", 4, 0.4444],
			["(other)", 3, null],
		]);
		expect(e.notices).toContain("exit_rate_partial");
	});

	it("without a fold the rate sums both sides over the same days, never above 1", async () => {
		const p = await run(rc, "pages", "2026-03-05", "2026-03-07");
		expect(p.data.rows?.map((r) => [r.key, r.exit_rate])).toEqual([
			["/y", 0.3],
			["/z", 1],
		]);
		expect(p.notices).not.toContain("exit_rate_partial");
		const e = await run(rc, "exit_pages", "2026-03-05", "2026-03-07");
		expect(e.data.rows?.map((r) => [r.key, r.exit_rate])).toEqual([
			["/y", 0.3],
			["/z", 1],
		]);
	});
});

describe("the scan budget inside the detailed window", () => {
	let env: Env;
	let rc: ReportCtx;
	beforeAll(async () => {
		env = await schemaDb();
		const ins = env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, sessions, pageviews) VALUES ('default', ?, 'all', '', 20000, 30000)");
		for (let d = 5; d <= 19; d++) ins.run(`2026-03-${String(d).padStart(2, "0")}`);
		rc = {
			db: env.db,
			site: "default",
			settings: { ...UTC, capacityProfile: "small" },
			now: zonedToEpoch("2026-03-25", 12, "UTC"),
			goals: [],
			funnels: {},
			annotations: [],
			rawFrom: "2026-03-01",
			summaryThrough: "2026-03-22",
		};
	});
	beforeEach(() => clearReportCache());

	it("under the budget: detailed rows", async () => {
		const r = await run(rc, "overview", "2026-03-18", "2026-03-19");
		expect(r.notices).toEqual([]);
		expect(r.data.totals?.sessions).toBe(0);
	});

	it("over the budget with filters the summaries honour: the summaries, without a range fix", async () => {
		const r = await run(rc, "overview", "2026-03-10", "2026-03-19");
		expect(r.notices).toEqual(["summary"]);
		expect(r.data.totals?.sessions).toBe(200_000);
	});

	it("over the budget with other filters: detailed up to four times the budget, then narrow_range with the longest range", async () => {
		const ok = await run(rc, "overview", "2026-03-10", "2026-03-19", [f("region", "BE")]);
		expect(ok.notices).toEqual([]);
		await expect(run(rc, "overview", "2026-03-05", "2026-03-19", [f("region", "BE")])).rejects.toMatchObject({
			code: "narrow_range",
			message: expect.stringContaining("Choose 2026-03-10 to 2026-03-19"),
		});
		// A report without summaries is held to the same bound.
		await expect(run(rc, "regions", "2026-03-05", "2026-03-19")).rejects.toMatchObject({ code: "narrow_range" });
	});

	it("links and journeys: summaries over the budget when they honour every filter, else detailed, then narrow_range", async () => {
		const m = (r: { notices: string[] }) => [...r.notices].sort();
		expect(m(await run(rc, "links", "2026-03-10", "2026-03-19"))).toEqual(["summary"]);
		expect(m(await run(rc, "links", "2026-03-10", "2026-03-19", [f("device", "mobile")]))).toEqual(["summary"]);
		expect(m(await run(rc, "links", "2026-03-10", "2026-03-19", [f("page", "/a")]))).toEqual([]);
		// By page has no summary form: detailed up to the bound.
		expect(m(await run(rc, "links", "2026-03-10", "2026-03-19", [], { by: "page" }))).toEqual([]);
		await expect(run(rc, "links", "2026-03-05", "2026-03-19", [f("page", "/a")])).rejects.toMatchObject({ code: "narrow_range" });
		expect(m(await run(rc, "journey_paths", "2026-03-10", "2026-03-19"))).toEqual(["summary", "top_paths_per_day"]);
		expect(m(await run(rc, "journey_next", "2026-03-10", "2026-03-19", [], { path: "/a" }))).toEqual(["summary", "top_paths_per_day"]);
		expect(m(await run(rc, "journey_paths", "2026-03-10", "2026-03-19", [f("country", "DE")]))).toEqual([]);
		await expect(run(rc, "journey_paths", "2026-03-05", "2026-03-19", [f("country", "DE")])).rejects.toMatchObject({ code: "narrow_range" });
	});
});

// ── generated traffic, a range that ends today ────────────────────────────────

const TZ = "America/New_York";
const TODAY = "2026-06-12";
const D0 = addDays(TODAY, -2);
/** 18:00 today: D0 is closed, yesterday and today are open. */
const NOW = zonedToEpoch(TODAY, 18, TZ);
const SETTINGS: Settings = normalizeSettings({ siteTimezone: TZ });
const LINK_SLUGS = ["offer-a", "offer-b", "offer-c", "offer-d", "offer-e"];
const GOALS: Goal[] = [
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Guides", type: "page", match: "prefix", value: "/guides/" },
	{ name: "Buy", type: "event", match: "is", value: "purchase" },
];

describe("open days merged from computeDay", () => {
	let env: Env;
	let raw: ReportCtx;
	let sum: ReportCtx;
	beforeAll(async () => {
		env = await schemaDb();
		const traffic = generateTraffic({ pageviews: 900, seed: 5, rich: true, start: zonedToEpoch(D0, 0, TZ), spanSeconds: 2 * 86_400 + 17 * 3600 });
		let n = 0;
		for (const a of traffic.actions.filter((x) => x.body.t === "pv" && !x.body.n)) {
			if (n++ % 30) continue;
			traffic.actions.push({ ...a, at: a.at + 4, body: { v: 1, t: "ev", sid: a.body.sid, name: "purchase", u: a.body.u, val: 10 + (n % 5), cur: n % 3 ? "USD" : "EUR" } });
		}
		// Link impressions on every first view, a click on every 4th, a conversion on every 12th (Links convention).
		let k = 0;
		for (const a of traffic.actions.filter((x) => x.body.t === "pv" && !x.body.n)) {
			const slug = LINK_SLUGS[k % LINK_SLUGS.length] as string;
			const place = k % 2 ? { place: k % 4 === 1 ? "hero" : "footer" } : {};
			traffic.actions.push({ ...a, at: a.at + 1, body: { v: 1, t: "ev", sid: a.body.sid, name: "seen", u: a.body.u, p: { s0: `${slug}@hero`, s1: LINK_SLUGS[(k + 1) % LINK_SLUGS.length] as string } } });
			if (k % 4 === 0) traffic.actions.push({ ...a, at: a.at + 2, body: { v: 1, t: "ev", sid: a.body.sid, name: "out", u: a.body.u, p: { slug, ...place } } });
			if (k % 12 === 0) traffic.actions.push({ ...a, at: a.at + 3, body: { v: 1, t: "ev", sid: a.body.sid, name: "conv", u: a.body.u, p: { slug, ...place }, val: 5 + (k % 7), cur: k % 24 ? "USD" : "EUR" } });
			k++;
		}
		traffic.actions.sort((a, b) => a.at - b.at);
		await recordTraffic(env.db, traffic, SETTINGS);
		const t = await runRollup({ db: env.db, settings: SETTINGS, goals: async () => GOALS }, env.kv, NOW);
		expect(t).toMatchObject({ days: [D0], watermark: D0 });
		raw = { db: env.db, site: "default", settings: SETTINGS, now: NOW, goals: GOALS, funnels: {}, annotations: [], defaultCurrency: "USD" };
		// Every range starts before this window: the summary engine answers.
		sum = { ...raw, rawFrom: "2030-01-01", summaryThrough: (await env.kv.get<string>(KV_WATERMARK)) as string };
	});
	beforeEach(() => clearReportCache());

	it("stores the closed day only", () => {
		expect(env.raw.prepare("SELECT DISTINCT day FROM ca_rollup").all()).toEqual([{ day: D0 }]);
	});

	it("a range ending today equals the detailed answer on every family", async () => {
		const REPORTS: ReportName[] = ["overview", "channels", "sources", "countries", "devices", "browsers", "os", "languages", "entry_pages", "exit_pages", "events", "goals"];
		for (const report of REPORTS) {
			const a = await run(raw, report, D0, TODAY);
			const b = await run(sum, report, D0, TODAY);
			expect(b.notices, report).toContain("summary");
			expect(b.data.rows, report).toEqual(a.data.rows);
			expect(b.data.totals, report).toEqual(a.data.totals);
		}
		const noScroll = (rows: Row[] | undefined) => (rows ?? []).map(({ scroll_median: _s, ...r }) => r);
		expect(noScroll((await run(sum, "pages", D0, TODAY)).data.rows)).toEqual(noScroll((await run(raw, "pages", D0, TODAY)).data.rows));
		expect((await run(sum, "timeseries", D0, TODAY)).data.series).toEqual((await run(raw, "timeseries", D0, TODAY)).data.series);
		expect((await run(sum, "overview", TODAY, TODAY)).data.totals).toEqual((await run(raw, "overview", TODAY, TODAY)).data.totals);
	});

	it("revenue ending today equals the detailed answer, in every currency and breakdown", async () => {
		for (const cur of ["USD", "EUR"]) {
			const a = await run(raw, "revenue", D0, TODAY, [], { currency: cur });
			const b = await run(sum, "revenue", D0, TODAY, [], { currency: cur });
			expect(b.data.totals, cur).toEqual(a.data.totals);
			for (const dim of REVENUE_BREAKDOWN_DIMS) {
				const pick = (rows: Row[] | undefined) => (rows ?? []).filter((r) => Number(r.orders) > 0).map((r) => [r.key, r.revenue, r.orders]);
				const q = (rc: ReportCtx) => run(rc, "revenue_breakdown", D0, TODAY, [], { dim, currency: cur });
				expect(pick((await q(sum)).data.rows), `${dim} ${cur}`).toEqual(pick((await q(raw)).data.rows));
			}
		}
	});

	it("a pair breakdown under one segment filter ending today equals the detailed answer (stored and open pair rows)", async () => {
		expect((env.raw.prepare("SELECT COUNT(*) AS n FROM ca_rollup WHERE seg <> ''").get() as { n: number }).n).toBeGreaterThan(0);
		const pick = (rows: Row[] | undefined, cols: string[]) => (rows ?? []).map((r) => cols.map((c) => r[c]));
		// The most frequent value of each segment in the detailed rows.
		const top = async (report: ReportName) => String((await run(raw, report, D0, TODAY)).data.rows?.[0]?.key);
		const [device, channel] = [await top("devices"), await top("channels")];
		for (const [report, filter, cols] of [
			["pages", f("device", device), ["key", "pageviews", "visitors"]],
			["sources", f("channel", channel), ["key", "sessions", "visitors", "pageviews"]],
			["entry_pages", f("device", device), ["key", "sessions", "visitors"]],
			["events", f("device", device), ["key", "events", "sessions"]],
		] as Array<[ReportName, Filter, string[]]>) {
			const a = await run(raw, report, D0, TODAY, [filter]);
			const b = await run(sum, report, D0, TODAY, [filter]);
			expect(b.notices, report).toContain("summary");
			expect(b.notices.some((n) => n.startsWith("filter_unavailable")), report).toBe(false);
			expect(pick(a.data.rows, cols).length, report).toBeGreaterThan(0);
			expect(pick(b.data.rows, cols), report).toEqual(pick(a.data.rows, cols));
		}
		for (const cur of ["USD", "EUR"]) {
			const pick2 = (rows: Row[] | undefined) => (rows ?? []).filter((r) => Number(r.orders) > 0).map((r) => [r.key, r.revenue, r.orders]);
			const q = (rc: ReportCtx) => run(rc, "revenue_breakdown", D0, TODAY, [f("device", device)], { dim: "page", currency: cur });
			expect(pick2((await q(sum)).data.rows), cur).toEqual(pick2((await q(raw)).data.rows));
		}
	});

	it("links and journeys ending today equal the detailed answer (stored and open family rows)", async () => {
		expect((env.raw.prepare("SELECT COUNT(*) AS n FROM ca_rollup WHERE dim IN ('link', 'link_place', 'next', 'path3')").get() as { n: number }).n).toBeGreaterThan(0);
		const device = String((await run(raw, "devices", D0, TODAY)).data.rows?.[0]?.key);
		for (const [params, filters] of [
			[{}, []],
			[{ by: "place" }, []],
			[{ withRevenue: true, currency: "USD" }, []],
			[{ withRevenue: true, currency: "EUR" }, []],
			[{}, [f("device", device)]],
		] as Array<[Params, Filter[]]>) {
			const a = await run(raw, "links", D0, TODAY, filters, params);
			const b = await run(sum, "links", D0, TODAY, filters, params);
			const label = JSON.stringify([params, filters]);
			expect(b.notices, label).toContain("summary");
			expect(b.notices.some((n) => n.startsWith("filter_unavailable")), label).toBe(false);
			expect(a.data.rows?.length, label).toBeGreaterThan(0);
			expect(b.data, label).toEqual(a.data);
		}
		const paths = await run(sum, "journey_paths", D0, TODAY);
		expect([...paths.notices].sort()).toEqual(["detail_from:2030-01-01", "summary", "top_paths_per_day"]);
		expect(paths.data).toEqual((await run(raw, "journey_paths", D0, TODAY)).data);
		const pages = ((await run(raw, "pages", D0, TODAY)).data.rows ?? []).slice(0, 4).map((r) => r.key);
		for (const report of ["journey_next", "journey_prev"] as const)
			for (const path of pages) {
				const a = await run(raw, report, D0, TODAY, [], { path });
				expect((await run(sum, report, D0, TODAY, [], { path })).data, `${report} ${path}`).toEqual(a.data);
			}
	});

	it("links and journeys follow the watermark: a closed day the writer has not stored yet is computed, not read empty", async () => {
		const lag = { ...sum, summaryThrough: addDays(D0, -1) };
		const FAMILY = "dim IN ('link', 'link_place', 'next', 'path3')";
		// The writer lags: D0's family rows are not stored yet (moved away, then restored).
		env.raw.exec(`UPDATE ca_rollup SET day = '2000-01-01' WHERE day = '${D0}' AND ${FAMILY}`);
		try {
			expect((await run(lag, "links", D0, TODAY)).data).toEqual((await run(raw, "links", D0, TODAY)).data);
			expect((await run(lag, "journey_paths", D0, TODAY)).data).toEqual((await run(raw, "journey_paths", D0, TODAY)).data);
		} finally {
			env.raw.exec(`UPDATE ca_rollup SET day = '${D0}' WHERE day = '2000-01-01' AND ${FAMILY}`);
		}
	});

	it("link revenue is left out when the summaries cannot apply every filter", async () => {
		const r = await run(sum, "links", D0, TODAY, [f("page", "/")], { withRevenue: true });
		expect(r.notices).toEqual(expect.arrayContaining(["filter_unavailable:page:not_kept", "revenue_not_available"]));
		expect(r.data.rows?.every((x) => x.revenue === undefined)).toBe(true);
	});

	it("today's Sites figures are current: equal to the detailed totals of today", async () => {
		const s = await run({ ...sum, sites: ["default", "empty"] }, "sites_summary", TODAY, TODAY);
		const ov = await run(raw, "overview", TODAY, TODAY);
		const rev = await run(raw, "revenue", TODAY, TODAY, [], { currency: "USD" });
		const row = s.data.rows?.find((r) => r.key === "default");
		expect(ov.data.totals?.sessions).toBeGreaterThan(0);
		expect(row).toMatchObject({ sessions: ov.data.totals?.sessions, pageviews: ov.data.totals?.pageviews, visitors: ov.data.totals?.visitors });
		expect((row?.revenue as Array<{ currency: string; revenue: number }>).find((e) => e.currency === "USD")?.revenue).toBe(rev.data.totals?.revenue);
		expect(s.data.rows?.find((r) => r.key === "empty")).toMatchObject({ sessions: 0, pageviews: 0 });
		// Over the stored and the open days together.
		const all = await run({ ...sum, sites: ["default"] }, "sites_summary", D0, TODAY);
		expect(all.data.rows?.[0]?.sessions).toBe((await run(raw, "overview", D0, TODAY)).data.totals?.sessions);
	});
});

describe("agent API", () => {
	it("answers a range before the detailed window from the summaries, with the notices and the catalog rule", async () => {
		const env = await schemaDb();
		const settings = await seed(env, "UTC");
		for (const d of DAYS) await rollupDay({ db: env.db, site: "default", settings, goals: [] }, d);
		await env.kv.set(KV_WATERMARK, DAYS[2]);
		// A capped cursor puts the detailed window start at 2026-03-12.
		await env.kv.set(KV_CURSOR, { day: "2026-03-13", step: 6, rawDays: 1, capped: true, deleted: {} });
		clearReportCache();
		const h = await agentHarness(env, settings, { limiter: () => 0 });
		const token = await h.key(["read:analytics"]);
		const q = (input: unknown) => h.call("agent/v1/query", { token, input });
		const r = await q({ report: "overview", query: { ...RANGE, filters: [f("country", "DE"), f("region", "BE")] } });
		expect({ status: r.status, notices: r.json.data.notices, totals: r.json.data.data.totals }).toMatchSnapshot();
		const pages = await q({ report: "pages", query: { ...RANGE, filters: [f("channel", "Direct"), f("browser", "Chrome")] } });
		expect({ status: pages.status, notices: pages.json.data.notices }).toMatchSnapshot();
		const raw = await q({ report: "funnels", query: { ...RANGE }, params: { steps: [{ type: "page", match: "is", value: "/" }, { type: "page", match: "is", value: "/pricing" }] } });
		expect({ status: raw.status, body: raw.json }).toMatchSnapshot();
		const cat = await h.call("agent/v1/reports", { token });
		expect(cat.json.data.summaries).toMatchSnapshot();
	});
});

describe("statements", () => {
	it("SQL text of the summary reads, both dialects (Postgres UNVERIFIED: text only)", () => {
		expect(summarySql({ table: "ca_rollup" })).toBe(
			"SELECT r.key AS key, r.segkey AS segkey, SUM(r.pageviews) AS pageviews, SUM(r.sessions) AS sessions, SUM(r.visitors) AS visitors, SUM(r.bounces) AS bounces, SUM(r.engaged) AS engaged, SUM(r.engaged_ms) AS engaged_ms, SUM(r.events) AS events, SUM(r.hits) AS hits FROM ca_rollup r WHERE r.site = ? AND r.dim = ? AND r.seg = ? AND r.day BETWEEN ? AND ? GROUP BY r.key, r.segkey",
		);
		expect(summarySql({ table: "ca_revenue_daily", byDay: true, cur: "USD" })).toBe(
			"SELECT r.key AS key, r.segkey AS segkey, r.day AS day, r.cur AS cur, SUM(r.orders) AS orders, SUM(CASE WHEN r.dim LIKE 'refund.%' THEN 0 ELSE r.revenue END) AS revenue, SUM(r.sessions) AS sessions, SUM(CASE WHEN r.dim LIKE 'refund.%' THEN r.revenue ELSE 0 END) AS refunds FROM ca_revenue_daily r WHERE r.site = ? AND r.dim IN (?, ?) AND r.seg = ? AND r.day BETWEEN ? AND ? AND r.cur = ? GROUP BY r.key, r.segkey, r.day, r.cur",
		);
	});

	it("every summary read of a report is a key range of the primary key (SQLite plan)", async () => {
		const env = await schemaDb();
		seedSummaries(env);
		const seen: Array<{ sql: string; params: unknown[] }> = [];
		const db = { ...env.db, all: (sql: string, p?: unknown[]) => (seen.push({ sql, params: p ?? [] }), env.db.all(sql, p as never)) };
		const rc: ReportCtx = { db: db as never, site: "default", settings: { ...UTC, capacityProfile: "small" }, now: zonedToEpoch("2026-03-20", 12, "UTC"), goals: [], funnels: {}, annotations: [], rawFrom: "2026-03-01", summaryThrough: "2026-03-17" };
		clearReportCache();
		await run({ ...rc, rawFrom: "2026-03-02" }, "pages", DAY, DAY, [f("country", "DE")]);
		await run({ ...rc, rawFrom: "2026-03-02" }, "channels", DAY, DAY, [f("country", "DE")]);
		await run({ ...rc, rawFrom: "2026-03-02" }, "revenue", DAY, DAY, [f("country", "DE")]);
		await run(rc, "overview", DAY, DAY);
		// The link and journey families: one key range each, also with one key or one next page bound.
		const early = { ...rc, rawFrom: "2026-03-02" };
		await run(early, "links", DAY, DAY, [f("country", "DE")], { withRevenue: true });
		await run(early, "links", DAY, DAY, [], { by: "place" });
		await run(early, "journey_next", DAY, DAY, [], { path: "/a" });
		await run(early, "journey_prev", DAY, DAY, [], { path: "/a" });
		await run(early, "journey_paths", DAY, DAY, [], { entry: "/a" });
		const plan = (sql: string, params: readonly unknown[]) => (env.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as unknown[])) as Array<{ detail: string }>).map((p) => p.detail).join("\n");
		const reads = seen.filter((s) => /FROM ca_(rollup|revenue_daily) r/.test(s.sql));
		expect(reads.length).toBeGreaterThanOrEqual(11);
		expect(reads.filter((s) => /'?(link|link_place|next|path3)'?/.test(String(s.params[1]))).length).toBeGreaterThanOrEqual(6);
		for (const s of reads) {
			const p = plan(s.sql, s.params);
			expect(p, s.sql).toMatch(/SEARCH r USING PRIMARY KEY \(site=\? AND dim=\? AND seg=\? AND day>\? AND day<\?\)/);
			expect(p, s.sql).not.toMatch(/SCAN r\b(?! USING)/);
		}
	});
});
