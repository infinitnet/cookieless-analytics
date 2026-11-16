/**
 * Reports over the seeded fixture (tests/fixtures/seed.ts). Every expected number is computed by hand
 * from the schedule in that file; the comments show the arithmetic.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { QueryError } from "../src/query/compile.js";
import type { Filter, Goal, QueryInput } from "../src/query/filters.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { FUNNEL_SESSION_CAP } from "../src/query/reports/behaviour.js";
import { clearReportCache, guardDb, NO_COMPARE, type Params, REPORT_NAMES, type ReportName, runReport, SELF_COMPARED } from "../src/query/reports/index.js";
import { resolveGranularity, weekStart } from "../src/query/reports/timeseries.js";
import type { Settings } from "../src/settings.js";
import { RANGE, seed, seedSearch } from "./fixtures/seed.js";
import { putHits, schemaDb } from "./helpers.js";

export const GOALS: Goal[] = [
	{ name: "Pricing", type: "page", match: "is", value: "/pricing" },
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Pro signup", type: "event", match: "is", value: "signup", props: { plan: "pro" } },
	{ name: "Leave", type: "outbound", match: "is", value: "example.net" },
	{ name: "Off", type: "page", match: "is", value: "/", active: false },
];
const FUNNEL = {
	name: "Signup flow",
	steps: [
		{ type: "page" as const, match: "is" as const, value: "/" },
		{ type: "page" as const, match: "is" as const, value: "/pricing" },
		{ type: "event" as const, match: "is" as const, value: "signup" },
	],
};

const num = (v: unknown) => Number(v ?? 0);
const pick = (rows: Row[] | undefined, ...fields: string[]) => (rows ?? []).map((r) => Object.fromEntries(["key", ...fields].map((f) => [f, r[f]])));

describe.each(["Europe/Berlin", "America/New_York"])("reports in %s", (tz) => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	let rc: ReportCtx;

	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, tz);
		await seedSearch(env);
		rc = {
			db: env.db,
			site: "default",
			settings,
			// One minute after the boundary session B2 (2026-03-13 00:05 local).
			now: zonedToEpoch("2026-03-13", 0, tz) + 6 * 60,
			goals: GOALS,
			funnels: { f1: FUNNEL },
			annotations: [
				{ ts: zonedToEpoch("2026-03-11", 12, tz), kind: "publish", text: "Launch post" },
				{ ts: zonedToEpoch("2026-03-13", 0, tz) + 60, kind: "manual", text: "Outside" },
			],
		};
	});
	beforeEach(() => clearReportCache());

	const run = (report: ReportName, q: Partial<QueryInput> = {}, params?: Params, extra: { limit?: number } = {}) =>
		runReport(rc, { report, query: QuerySchema.parse({ ...RANGE, ...q }), ...(params ? { params } : {}), ...extra });
	const sessionsWith = async (filters: Filter[]) => (await run("overview", { filters })).data.totals?.sessions;

	it("stores days in the site timezone, including the midnight boundary sessions", () => {
		const days = env.raw.prepare("SELECT day, COUNT(*) AS n FROM ca_sessions GROUP BY day ORDER BY day").all();
		expect(days).toEqual([
			{ day: "2025-03-11", n: 1 },
			{ day: "2025-03-12", n: 1 },
			{ day: "2026-03-08", n: 1 },
			{ day: "2026-03-09", n: 2 },
			{ day: "2026-03-10", n: 12 },
			{ day: "2026-03-11", n: 12 },
			{ day: "2026-03-12", n: 13 },
			{ day: "2026-03-13", n: 1 },
		]);
	});

	it("overview with previous-period compare", async () => {
		const r = await run("overview", { compare: "previous" });
		expect(r.compareRange).toEqual({ from: "2026-03-07", to: "2026-03-09" });
		// 36 + B1 sessions; 3 x 18 + 1 pageviews; 3 x 11 + 1 visitors (visitor X twice a day);
		// bounces 3 x 5 + 1 = 16; engaged 3 x 8 = 24; duration 3 x 495 s = 1485 s.
		expect(r.data.totals).toEqual({ visitors: 34, sessions: 37, pageviews: 55, views_per_session: 1.4865, bounce_rate: 0.4324, engaged_rate: 0.6486, avg_duration: 40.1 });
		// P1, B3, P2: 4 pageviews, 2 bounces, 1 engaged, 60 s.
		expect(r.data.compareTotals).toEqual({ visitors: 3, sessions: 3, pageviews: 4, views_per_session: 1.3333, bounce_rate: 0.6667, engaged_rate: 0.3333, avg_duration: 20 });
		expect(r.data.delta).toMatchObject({ sessions: 11.3333, pageviews: 12.75, visitors: 10.3333 });
		// Realtime: B2 only (last seen one minute before now).
		expect(r.data.realtime).toBe(1);
	});

	it("overview says whether the site holds any visit, only when the range has none (first run)", async () => {
		expect((await run("overview")).data.stored).toBeUndefined();
		// A range with no visit on a site with visits: stored.
		expect((await run("overview", { from: "2024-01-01", to: "2024-01-07" })).data).toMatchObject({ totals: { sessions: 0 }, stored: true });
		// Another site of the same database with nothing at all: a first run.
		const other = await runReport({ ...rc, site: "nobody" }, { report: "overview", query: QuerySchema.parse(RANGE) });
		expect(other.data).toMatchObject({ totals: { sessions: 0 }, stored: false });
	});

	it("overview with same-period-last-year compare", async () => {
		const r = await run("overview", { compare: "year" });
		expect(r.compareRange).toEqual({ from: "2025-03-10", to: "2025-03-12" });
		expect(r.data.compareTotals).toMatchObject({ sessions: 2, pageviews: 3, visitors: 2, bounce_rate: 0.5 });
		expect(r.data.delta).toMatchObject({ sessions: 17.5, pageviews: 17.3333, visitors: 16 });
	});

	it("timeseries by day with compare and annotations, and by hour", async () => {
		const r = await run("timeseries", { compare: "previous", granularity: "day" });
		expect(pick(r.data.series as unknown as Row[], "sessions", "pageviews", "visitors").map(({ key: _k, ...m }) => m)).toEqual([
			{ sessions: 12, pageviews: 18, visitors: 11 },
			{ sessions: 12, pageviews: 18, visitors: 11 },
			{ sessions: 13, pageviews: 19, visitors: 12 },
		]);
		expect((r.data.series ?? []).map((p) => p.t)).toEqual(["2026-03-10", "2026-03-11", "2026-03-12"]);
		expect((r.data.compareSeries as Array<{ t: string; sessions: number }>).map((p) => [p.t, p.sessions])).toEqual([
			["2026-03-07", 0],
			["2026-03-08", 1],
			["2026-03-09", 2],
		]);
		expect((r.data.annotations as Array<{ text: string }>).map((a) => a.text)).toEqual(["Launch post"]);

		const h = await run("timeseries", { from: "2026-03-10", to: "2026-03-10" });
		expect(h.data.granularity).toBe("hour");
		const series = h.data.series as Array<{ t: string; sessions: number }>;
		expect(series).toHaveLength(24);
		expect(series.find((p) => p.t === "2026-03-10 08:00")?.sessions).toBe(1);
		expect(series.find((p) => p.t === "2026-03-10 00:00")?.sessions).toBe(0);
		expect(series.reduce((a, p) => a + p.sessions, 0)).toBe(12);
	});

	it("pages with exit rate, time on page, scroll median and previous deltas", async () => {
		const r = await run("pages", { compare: "previous" });
		expect(pick(r.data.rows, "pageviews", "visitors", "avg_time", "exit_rate", "scroll_median")).toEqual([
			// "/": 36 views, 33 visitors; dur 3 x (2000 + 15000) / 6 = 8.5 s; 18 exits / 36; scroll 25,25,25,80,80,80
			{ key: "/", pageviews: 36, visitors: 33, avg_time: 8.5, exit_rate: 0.5, scroll_median: 25 },
			{ key: "/pricing", pageviews: 18, visitors: 15, avg_time: 5, exit_rate: 1, scroll_median: 50 },
			{ key: "/late", pageviews: 1, visitors: 1, avg_time: null, exit_rate: 1, scroll_median: null },
		]);
		expect(r.data.rows?.map((x) => (x.delta as Record<string, number | null>).pageviews)).toEqual([17, 17, 0]);
	});

	it("pages with search columns: values where search rows exist, nulls elsewhere", async () => {
		const r = await run("pages", {}, { withSearch: true });
		expect(pick(r.data.rows, "impressions", "clicks", "ctr", "position")).toEqual([
			{ key: "/", impressions: 600, clicks: 60, ctr: 0.1, position: 1 },
			// Google 3 x 100 + Bing 3 x 50 impressions; pos_sum 3 x (300 + 250) = 1650; 1650 / 450 = 3.67
			{ key: "/pricing", impressions: 450, clicks: 45, ctr: 0.1, position: 3.67 },
			{ key: "/late", impressions: null, clicks: null, ctr: null, position: null },
		]);
		const g = await run("pages", {}, { withSearch: true, source: "google" });
		expect(g.data.rows?.[1]).toMatchObject({ key: "/pricing", impressions: 300, position: 3 });
		expect(r.data.rows?.some((x) => x.key === "/old-page")).toBe(false);
	});

	it("entry pages, exit pages and not found", async () => {
		expect(pick((await run("entry_pages")).data.rows, "entries", "bounce_rate", "visitors")).toEqual([
			{ key: "/", entries: 36, bounce_rate: 0.4167, visitors: 33 },
			{ key: "/late", entries: 1, bounce_rate: 1, visitors: 1 },
		]);
		expect(pick((await run("exit_pages")).data.rows, "exits", "exit_rate")).toEqual([
			{ key: "/", exits: 18, exit_rate: 0.5 },
			{ key: "/pricing", exits: 18, exit_rate: 1 },
			{ key: "/late", exits: 1, exit_rate: 1 },
		]);
		expect(pick((await run("not_found")).data.rows, "ref", "hits")).toEqual([
			{ key: "/missing", ref: "news.example.com/post", hits: 2 },
			{ key: "/gone", ref: null, hits: 1 },
		]);
	});

	it("channels, sources, campaigns and AI referrals", async () => {
		expect(pick((await run("channels")).data.rows, "sessions", "visitors", "bounce_rate")).toEqual([
			{ key: "Direct", sessions: 13, visitors: 10, bounce_rate: 0.3077 },
			{ key: "Organic Search", sessions: 9, visitors: 9, bounce_rate: 0.6667 },
			{ key: "Organic Social", sessions: 6, visitors: 6, bounce_rate: 0.5 },
			{ key: "Paid Search", sessions: 6, visitors: 6, bounce_rate: 0.5 },
			{ key: "AI Assistants", sessions: 3, visitors: 3, bounce_rate: 0 },
		]);
		expect(pick((await run("sources")).data.rows, "sessions")).toEqual([
			{ key: "google.com", sessions: 15 },
			{ key: "(direct)", sessions: 13 },
			{ key: "facebook.com", sessions: 6 },
			{ key: "chatgpt.com", sessions: 3 },
		]);
		expect(pick((await run("campaigns")).data.rows, "sessions")).toEqual([{ key: "spring", sessions: 6 }]);
		expect(pick((await run("campaigns", {}, { field: "utm_medium" })).data.rows, "sessions")).toEqual([{ key: "cpc", sessions: 6 }]);
		expect(pick((await run("ai_referrals")).data.rows, "sessions", "landing")).toEqual([{ key: "chatgpt.com", sessions: 3, landing: [{ path: "/", sessions: 3 }] }]);
		const c = await run("channels", { compare: "year" });
		expect(c.data.rows?.find((x) => x.key === "Paid Search")?.previous).toMatchObject({ sessions: 1 });
		expect(c.data.rows?.find((x) => x.key === "Direct")?.previous).toBeNull();
	});

	it("audience breakdowns", async () => {
		expect(pick((await run("countries")).data.rows, "sessions", "visitors")).toEqual([
			{ key: "DE", sessions: 12, visitors: 12 },
			{ key: "FR", sessions: 12, visitors: 12 },
			{ key: "US", sessions: 12, visitors: 12 },
			{ key: "(not set)", sessions: 1, visitors: 1 },
		]);
		expect(pick((await run("devices")).data.rows, "sessions")).toEqual([
			{ key: "desktop", sessions: 28 },
			{ key: "mobile", sessions: 9 },
		]);
		expect(pick((await run("browsers")).data.rows, "sessions")).toEqual([
			{ key: "Chrome", sessions: 28 },
			{ key: "Safari", sessions: 9 },
		]);
		expect(pick((await run("os")).data.rows, "sessions")).toEqual([
			{ key: "Windows", sessions: 28 },
			{ key: "iOS", sessions: 9 },
		]);
		expect(pick((await run("languages")).data.rows, "sessions")).toEqual([{ key: "de-de", sessions: 37 }]);
		expect(pick((await run("regions")).data.rows, "sessions")).toEqual([{ key: "(not set)", sessions: 37 }]);
	});

	it("events, event properties, outbound, downloads, forms and scroll", async () => {
		const e = await run("events");
		expect(pick(e.data.rows, "events", "sessions", "rate")).toEqual([{ key: "signup", events: 9, sessions: 9, rate: 0.2432 }]);
		expect(pick((await run("event_props", {}, { event: "signup" })).data.rows, "prop", "value", "count")).toEqual([
			{ key: "plan=pro", prop: "plan", value: "pro", count: 6 },
			{ key: "plan=free", prop: "plan", value: "free", count: 3 },
		]);
		expect(pick((await run("outbound")).data.rows, "events", "sessions")).toEqual([{ key: "example.net/x", events: 3, sessions: 3 }]);
		expect((await run("downloads")).data.rows).toEqual([]);
		expect((await run("forms")).data.rows).toEqual([]);
		expect(pick((await run("scroll")).data.rows, "pageviews", "share")).toEqual([
			{ key: "0", pageviews: 0, share: 0 },
			{ key: "25", pageviews: 3, share: 0.125 },
			{ key: "50", pageviews: 18, share: 0.75 },
			{ key: "75", pageviews: 3, share: 0.125 },
			{ key: "100", pageviews: 0, share: 0 },
		]);
		await expect(run("event_props")).rejects.toMatchObject({ code: "invalid_params" });
	});

	it("goals convert over the filtered session count", async () => {
		const r = await run("goals");
		expect(pick(r.data.rows, "completions", "converting", "conversion_rate")).toEqual([
			{ key: "Pricing", completions: 18, converting: 18, conversion_rate: 0.4865 },
			{ key: "Signup", completions: 9, converting: 9, conversion_rate: 0.2432 },
			{ key: "Pro signup", completions: 6, converting: 6, conversion_rate: 0.1622 },
			{ key: "Leave", completions: 3, converting: 3, conversion_rate: 0.0811 },
		]);
		// Direct only: 13 sessions; Pricing reached by i = 1 and 3 on each day.
		const d = await run("goals", { filters: [{ dim: "channel", op: "is", values: ["Direct"] }] });
		expect(d.data.total_sessions).toBe(13);
		expect(pick(d.data.rows, "converting", "conversion_rate")[0]).toEqual({ key: "Pricing", converting: 6, conversion_rate: 0.4615 });
	});

	it("goals run ten per statement with the same rows as one statement per goal", async () => {
		const goals = [1, 2, 3].flatMap((k) => GOALS.map((g) => ({ ...g, name: `${g.name} ${k}` })));
		const goalStatements: string[] = [];
		const db = { ...env.db, dialect: env.db.dialect, all: (q: string, p?: never) => (/AS completions/.test(q) && goalStatements.push(q), env.db.all(q, p)) } as typeof env.db;
		const r = await runReport({ ...rc, db, goals }, { report: "goals", query: QuerySchema.parse(RANGE) });
		// 12 active goals: two statements, the first with ten goals.
		expect(goalStatements.map((q) => q.split(" UNION ALL ").length)).toEqual([10, 2]);
		const one = await run("goals");
		const expected = [1, 2, 3].flatMap((k) => (one.data.rows ?? []).map((x) => ({ ...x, key: `${x.key} ${k}` })));
		const order = (rows: Row[]) => [...rows].sort((a, b) => num(b.converting) - num(a.converting) || (String(a.key) < String(b.key) ? -1 : 1));
		expect(r.data.rows).toEqual(order(expected));
	});

	it("funnels count sequential steps and only ever drop", async () => {
		const r = await run("funnels", {}, { funnel: "f1" });
		expect(pick(r.data.rows, "sessions", "drop_off", "conversion")).toEqual([
			{ key: "1", sessions: 36, drop_off: null, conversion: 1 },
			{ key: "2", sessions: 18, drop_off: 0.5, conversion: 0.5 },
			{ key: "3", sessions: 9, drop_off: 0.5, conversion: 0.25 },
		]);
		const counts = (r.data.rows ?? []).map((x) => x.sessions as number);
		expect(counts.every((n, i) => i === 0 || n <= (counts[i - 1] as number))).toBe(true);
		// Order matters: nobody views "/" after "/pricing".
		const rev = await run("funnels", {}, { steps: [{ type: "page", match: "is", value: "/pricing" }, { type: "page", match: "is", value: "/" }] });
		expect(pick(rev.data.rows, "sessions")).toEqual([
			{ key: "1", sessions: 18 },
			{ key: "2", sessions: 0 },
		]);
		const rx = await run("funnels", {}, { steps: [{ type: "page", match: "regex", value: "^/$" }, { type: "page", match: "prefix", value: "/pri" }] });
		expect(pick(rx.data.rows, "sessions")).toEqual([
			{ key: "1", sessions: 36 },
			{ key: "2", sessions: 18 },
		]);
		await expect(run("funnels", {}, { funnel: "missing" })).rejects.toMatchObject({ code: "unknown_funnel" });
	});

	it("compares two segments on the same range: totals, rows and series of side B", async () => {
		const A: Filter[] = [{ dim: "channel", op: "is", values: ["Direct"] }];
		const B: Filter[] = [{ dim: "channel", op: "is", values: ["Organic Search"] }];
		const seg = (report: ReportName, filters: Filter[], extra: Partial<QueryInput> = {}) => runReport(rc, { report, query: QuerySchema.parse({ ...RANGE, filters, ...extra }) });
		const cmp = (report: ReportName) =>
			runReport(rc, { report, query: QuerySchema.parse({ ...RANGE, filters: A, compare: "segment", compareSegment: "b" }), compareFilters: B, compareSegment: { id: "b", name: "Organic" } });
		for (const report of ["overview", "channels", "timeseries", "satisfaction"] as const) {
			const r = await cmp(report);
			const a = await seg(report, A);
			const b = await seg(report, B);
			expect(r.compareRange, report).toEqual(RANGE);
			expect(r.compareSegment, report).toEqual({ id: "b", name: "Organic" });
			if (a.data.totals) {
				expect(r.data.totals, report).toEqual(a.data.totals);
				expect(r.data.compareTotals, report).toEqual(b.data.totals);
			}
			if (a.data.series) {
				expect(r.data.series, report).toEqual(a.data.series);
				expect(r.data.compareSeries, report).toEqual(b.data.series);
			}
			for (const row of r.data.rows ?? []) {
				const other = (b.data.rows ?? []).find((x) => x.key === row.key);
				if (!other) expect(row.previous, `${report} ${row.key}`).toBeNull();
				else expect(row.previous, `${report} ${row.key}`).toEqual(Object.fromEntries(Object.entries(other).filter(([k]) => k !== "key")));
			}
		}
		expect(((await cmp("overview")).data.compareTotals as { sessions?: number } | undefined)?.sessions).toBe(await sessionsWith(B));
		// Search reports, SEO views and impact refuse it.
		for (const report of ["search_overview", "search_queries", "traffic_movers", "impact", "search_cannibalization"] as const)
			await expect(cmp(report), report).rejects.toMatchObject({ code: "compare_not_supported" });
		await expect(runReport(rc, { report: "overview", query: QuerySchema.parse({ ...RANGE, compare: "segment", compareSegment: "b" }) })).rejects.toMatchObject({ code: "invalid_params" });
		expect(QuerySchema.safeParse({ ...RANGE, compare: "segment" }).success).toBe(false);
		expect(QuerySchema.safeParse({ ...RANGE, compare: "previous", compareSegment: "b" }).success).toBe(false);
	});

	it("dimension values for autocompletion", async () => {
		expect((await run("dimension_values", {}, { dim: "page", prefix: "/p" })).data.rows).toEqual([{ key: "/pricing", count: 18 }]);
		expect(pick((await run("dimension_values", {}, { dim: "channel" })).data.rows, "count")).toEqual([
			{ key: "Direct", count: 13 },
			{ key: "Organic Search", count: 9 },
			{ key: "Organic Social", count: 6 },
			{ key: "Paid Search", count: 6 },
			{ key: "AI Assistants", count: 3 },
		]);
		expect((await run("dimension_values", {}, { dim: "event_prop", prop: "plan" })).data.rows).toEqual([
			{ key: "pro", count: 6 },
			{ key: "free", count: 3 },
		]);
		expect((await run("dimension_values", {}, { dim: "goal", prefix: "s" })).data.rows?.map((x) => x.key)).toEqual(["Signup"]);
		expect((await run("dimension_values", {}, { dim: "query", scope: "search" })).data.rows?.map((x) => x.key)).toEqual(["cookieless", "emdash analytics"]);
		await expect(run("dimension_values", {}, { dim: "status" })).rejects.toMatchObject({ code: "invalid_params" });
	});

	it("robots leave no rows and crawler dims are unknown", async () => {
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_srv WHERE status = 200").get()).toEqual({ n: 0 });
		// Three human error pages: two of /missing from one referrer (one counter) and /gone.
		expect(env.raw.prepare("SELECT SUM(n) AS n, COUNT(*) AS c FROM ca_srv").get()).toEqual({ n: 3, c: 2 });
		await expect(async () => run("overview", { filters: [{ dim: "bot" as never, op: "is", values: ["gptbot"] }] })).rejects.toThrow(/Invalid option/);
	});

	it("filters restrict sessions on every operator and scope", async () => {
		const o = await run("overview", { filters: [{ dim: "channel", op: "is", values: ["Organic Search"] }] });
		expect(o.data.totals).toMatchObject({ sessions: 9, pageviews: 12 });
		expect(await sessionsWith([{ dim: "page", op: "is", values: ["/pricing"] }])).toBe(18);
		expect(await sessionsWith([{ dim: "page", op: "is_not", values: ["/pricing"] }])).toBe(19);
		expect(await sessionsWith([{ dim: "page", op: "not_contains", values: ["PRIC"] }])).toBe(19);
		expect(await sessionsWith([{ dim: "event", op: "is", values: ["signup"] }])).toBe(9);
		expect(await sessionsWith([{ dim: "country", op: "regex", values: ["^(de|fr)$"] }])).toBe(24);
		expect(await sessionsWith([{ dim: "country", op: "not_regex", values: ["^de$"] }])).toBe(25);
		expect(await sessionsWith([{ dim: "country", op: "is", values: ["DE", "US"] }])).toBe(24);
		expect(await sessionsWith([{ dim: "country", op: "is_not", values: ["DE"] }])).toBe(25);
		expect(await sessionsWith([{ dim: "goal", op: "is", values: ["Signup"] }])).toBe(9);
		expect(await sessionsWith([{ dim: "event_prop", prop: "plan", op: "is", values: ["pro"] }])).toBe(6);
		expect(await sessionsWith([{ dim: "entry", op: "prefix", values: ["/la"] }])).toBe(1);
		expect(await sessionsWith([{ dim: "exit", op: "not_prefix", values: ["/p"] }])).toBe(19);
		expect(await sessionsWith([{ dim: "host", op: "is", values: ["example.org"] }])).toBe(37);
		expect(await sessionsWith([{ dim: "page", op: "regex", values: ["^/pri"] }, { dim: "channel", op: "is", values: ["Direct"] }])).toBe(6);
		await expect(sessionsWith([{ dim: "goal", op: "is", values: ["Nope"] }])).rejects.toMatchObject({ code: "unknown_goal" });
		await expect(sessionsWith([{ dim: "page", op: "regex", values: ["(a+)+"] }])).rejects.toMatchObject({ code: "invalid_regex" });
	});

	it("hit-level reports also restrict their own rows", async () => {
		expect(pick((await run("pages", { filters: [{ dim: "page", op: "is", values: ["/pricing"] }] })).data.rows, "pageviews")).toEqual([{ key: "/pricing", pageviews: 18 }]);
		expect(pick((await run("pages", { filters: [{ dim: "page", op: "is_not", values: ["/pricing"] }] })).data.rows, "pageviews")).toEqual([
			{ key: "/", pageviews: 18 },
			{ key: "/late", pageviews: 1 },
		]);
		// An event filter restricts sessions, not pageview rows.
		expect(pick((await run("pages", { filters: [{ dim: "event", op: "is", values: ["signup"] }] })).data.rows, "pageviews")).toEqual([
			{ key: "/", pageviews: 9 },
			{ key: "/pricing", pageviews: 9 },
		]);
	});

	it("expands a page regex over server rows too (not found)", async () => {
		const n = await run("not_found", { filters: [{ dim: "page", op: "regex", values: ["^/miss"] }] });
		expect(n.data.rows?.map((x) => x.key)).toEqual(["/missing"]);
	});

	it("keeps every statement inside the D1 parameter limit", async () => {
		const many = Array.from({ length: 50 }, (_, i) => `/nope${i}`);
		await expect(run("pages", { filters: [{ dim: "page", op: "contains", values: many }] })).rejects.toMatchObject({ code: "too_many_values" });
		// `is` lists bind one JSON array per 90 values, so 500 values are fine everywhere.
		const big = Array.from({ length: 500 }, (_, i) => (i === 0 ? "/pricing" : `/p${i}`));
		expect((await run("pages", { filters: [{ dim: "page", op: "is", values: big }] })).data.rows?.map((x) => x.key)).toEqual(["/pricing"]);
	});

	it("every report answers previous and year compares with deltas", async () => {
		const PARAMS: Partial<Record<ReportName, Params>> = { journey_next: { path: "/" }, journey_prev: { path: "/pricing" }, event_props: { event: "signup" }, funnels: { funnel: "f1" }, search_page_queries: { page: "/pricing" }, revenue_breakdown: { dim: "channel" } };
		// The cannibalization views refuse compare and the period views compare on their own; tested in reports-seo-*.
		for (const report of REPORT_NAMES.filter((n) => n !== "dimension_values" && !NO_COMPARE.has(n) && !SELF_COMPARED.has(n)))
			for (const compare of ["previous", "year"] as const) {
				const r = await run(report, { compare }, PARAMS[report]);
				expect(r.compareRange, report).not.toBeNull();
				if (r.data.totals) expect(r.data.delta, report).toBeTypeOf("object");
				if (r.data.series) expect(Array.isArray(r.data.compareSeries), report).toBe(true);
				for (const row of r.data.rows ?? []) expect(row, `${report} ${compare}`).toHaveProperty("delta");
			}
		const d = (rows: Row[] | undefined, key: string, f: string) => (rows?.find((x) => x.key === key)?.delta as Record<string, number | null>)[f];
		// Previous range: P1 and P2 enter on "/", B3 on "/late"; P2 converts on Pricing; all three have no country.
		const entry = (await run("entry_pages", { compare: "previous" })).data.rows;
		expect([d(entry, "/", "entries"), d(entry, "/late", "entries")]).toEqual([17, 0]);
		expect(d((await run("countries", { compare: "previous" })).data.rows, "(not set)", "sessions")).toBe(-0.6667);
		const g = (await run("goals", { compare: "previous" })).data.rows;
		expect([d(g, "Pricing", "converting"), d(g, "Signup", "converting")]).toEqual([17, null]);
		expect((await run("funnels", { compare: "previous" }, { funnel: "f1" })).data.rows?.map((x) => (x.previous as { sessions: number }).sessions)).toEqual([2, 1, 0]);
		expect((await run("events", { compare: "previous" })).data.rows?.[0]?.previous).toBeNull();
		// Year range: Y1 exits on /pricing, Y2 on "/".
		const exits = (await run("exit_pages", { compare: "year" })).data.rows;
		expect([d(exits, "/", "exits"), d(exits, "/pricing", "exits")]).toEqual([17, 17]);
		expect(((await run("search_overview", { compare: "year" })).data.delta as Record<string, unknown>).clicks).toBeNull();
	});

	it("caches identical requests for 30 s per isolate", async () => {
		const a = await runReport(rc, { report: "overview", query: QuerySchema.parse(RANGE) }, 1_000);
		env.raw.prepare("UPDATE ca_sessions SET pageviews = pageviews + 100 WHERE sid = (SELECT sid FROM ca_sessions WHERE day = '2026-03-10' LIMIT 1)").run();
		const b = await runReport(rc, { report: "overview", query: QuerySchema.parse(RANGE) }, 20_000);
		expect(b).toBe(a);
		const c = await runReport(rc, { report: "overview", query: QuerySchema.parse(RANGE) }, 40_000);
		expect(c.data.totals?.pageviews).toBe(155);
		env.raw.prepare("UPDATE ca_sessions SET pageviews = pageviews - 100 WHERE pageviews > 100").run();
	});
});

describe("report helpers", () => {
	it("picks granularity and week starts", () => {
		expect(resolveGranularity("auto", "2026-03-10", "2026-03-11")).toBe("hour");
		expect(resolveGranularity("auto", "2026-03-10", "2026-03-12")).toBe("day");
		expect(resolveGranularity("auto", "2026-01-01", "2026-04-30")).toBe("day");
		expect(resolveGranularity("auto", "2026-01-01", "2026-05-01")).toBe("week");
		expect(resolveGranularity("week", "2026-01-01", "2026-01-02")).toBe("week");
		expect(weekStart("2026-03-12")).toBe("2026-03-09");
		expect(weekStart("2026-03-09")).toBe("2026-03-09");
		expect(weekStart("2026-03-15")).toBe("2026-03-09");
	});

	it("lets hits in the same second satisfy funnel steps in either order", async () => {
		const env = await schemaDb();
		env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, events) VALUES ('default', 's1', 'v', '2026-03-10', 0, 100, 100, 1800, 1, 1)").run();
		const hit = (id: string, kind: "pv" | "ev", name: string | null) => putHits(env.raw, [{ id, sid: "s1", ts: 100, kind, path: "/pricing", name }]);
		// The event key sorts before the pageview key although the pageview came first.
		hit("a-event", "ev", "signup");
		hit("z-view", "pv", null);
		const rc: ReportCtx = { db: env.db, site: "default", settings: { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 }, now: 0, goals: [], funnels: {}, annotations: [] };
		clearReportCache();
		const r = await runReport(rc, {
			report: "funnels",
			query: QuerySchema.parse({ from: "2026-03-10", to: "2026-03-10" }),
			params: { steps: [{ type: "page", match: "is", value: "/pricing" }, { type: "event", match: "is", value: "signup" }] },
		});
		expect(r.data.rows?.map((x) => x.sessions)).toEqual([1, 1]);
	});

	it("guards statements above 100 parameters with a typed error", async () => {
		const db = guardDb({ dialect: "sqlite", run: async () => ({ changes: 0 }), all: async () => [], batch: async () => {} });
		await expect(Promise.resolve().then(() => db.all("x", Array(101).fill(1)))).rejects.toMatchObject({ code: "too_many_values" });
		await expect(db.all("x", Array(100).fill(1))).resolves.toEqual([]);
	});

	it("returns the typed cap error for funnels over more than 50k sessions", async () => {
		const env = await schemaDb();
		env.raw
			.prepare(
				`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i <= ${FUNNEL_SESSION_CAP})
INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews) SELECT 'default', 's' || i, 'v' || i, '2026-03-10', 0, 0, 0, 1800, 1 FROM n`,
			)
			.run();
		const rc: ReportCtx = { db: env.db, site: "default", settings: { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 }, now: 0, goals: [], funnels: {}, annotations: [] };
		clearReportCache();
		const err = await runReport(rc, {
			report: "funnels",
			query: QuerySchema.parse({ from: "2026-03-10", to: "2026-03-10" }),
			params: { steps: [{ type: "page", match: "is", value: "/" }, { type: "page", match: "is", value: "/b" }] },
		}).catch((e) => e);
		expect(err).toBeInstanceOf(QueryError);
		expect(err.code).toBe("funnel_cap");
	});
});

describe("exit rate", () => {
	it("is at most 1 on detailed rows too: a visit can exit on a path it holds no page view of", async () => {
		const { normalizeSettings } = await import("../src/settings.js");
		const env = await schemaDb();
		const settings = normalizeSettings({ siteTimezone: "UTC" });
		const now = zonedToEpoch("2026-03-11", 12, "UTC");
		// The second visit's exit path is /a with no page view there (opened by an event on /a, its page view on /b).
		const ins = env.raw.prepare("INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, hits) VALUES ('default', '2026-03-11', ?, ?, 12, ?, ?, 1800, ?, '/a', 1, ?, jsonb(?))");
		ins.run("a".repeat(20), "k1", now, now, "/a", 0, JSON.stringify({ hhhhhhhhhhh1: { t: 0, p: "/a" } }));
		ins.run("b".repeat(20), "k2", now, now + 60, "/a", 1, JSON.stringify({ eeeeeeeeeeeee: { t: 0, n: "signup", p: "/a" }, hhhhhhhhhhh2: { t: 60, p: "/b" } }));
		const rc: ReportCtx = { db: env.db, site: "default", settings, now: now + 3600, goals: [], funnels: {}, annotations: [] };
		const query = QuerySchema.parse({ from: "2026-03-11", to: "2026-03-11" });
		const exits = await runReport(rc, { report: "exit_pages", query, params: {} });
		expect(pick(exits.data.rows, "exits", "exit_rate")).toEqual([{ key: "/a", exits: 2, exit_rate: 1 }]);
		const pages = await runReport(rc, { report: "pages", query, params: {} });
		expect(pages.data.rows?.find((r) => r.key === "/a")?.exit_rate).toBe(1);
	});
});
