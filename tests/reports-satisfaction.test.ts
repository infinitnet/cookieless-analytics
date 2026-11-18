/**
 * Satisfaction reports over a hand-built fixture. Defaults: long click above 60 s, bad experience below 10 s.
 * The reports cover organic search sessions only: I (Direct), X (Organic Social) and Z (Paid Search) are outside
 * every number, although X is a long click and Z a re-entered pogo-stick.
 *
 *   sid entry channel          browser  pv ev inter wall vis(s) re  pv hits (path nav exit)    class at L=60, B'=10
 *   A   /a    Organic Search   Chrome   1  0  1     0    90     0   /a 0                     long
 *   B   /a    Organic Search   Firefox  1  0  0     0    30     0   /a 1                     short (bad only when B' > 30)
 *   C   /a    Organic Search   Chrome   1  0  0     0    5      0   /a 2                     short, bad
 *   D   /a    Organic Search   Chrome   1  0  0     0    0      0   /a 0                     unmeasured
 *   E   /b    Organic Search   Chrome   1  0  0     0    8      0   /b 0 exit 2              short, bad, pogo-stick
 *   F   /b    Organic Search   Firefox  1  0  1     0    20     0   /b 0 exit 0              short
 *   G   /b    Organic Search   Chrome   2  0  1     120  15     0   /b 0, /c NULL            long (wall clock)
 *   H   /b    Organic Search   Chrome   2  0  1     50   50     1   /b 0 exit 2, /d NULL     short, re-entered, returned from search
 *   J   /c    Organic Search   Chrome   1  0  1     0    70     0   /c 2                     long
 *   K   /c    Organic Search   Chrome   1  0  0     0    0      0   /c 0                     unmeasured
 *   I   /a    Direct           Chrome   1  0  0     0    7      0   /a 0 exit 2              outside the scope
 *   X   /a    Organic Social   Chrome   1  0  1     0    90     0   /a 0                     outside the scope
 *   Z   /b    Paid Search      Chrome   1  0  0     0    6      1   /b 0 exit 2              outside the scope
 * Previous day: P /a Organic Search Chrome, 90 s visible: long.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QueryError } from "../src/query/compile.js";
import { type QueryInput, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { SATISFACTION_RAW_ONLY } from "../src/query/reports/satisfaction.js";
import { putHits, schemaDb } from "./helpers.js";

const DAY = "2026-05-10";
const T = Date.parse(`${DAY}T10:00:00Z`) / 1000;

type S = [sid: string, entry: string, channel: string, browser: string, pv: number, inter: number, wall: number, vis: number, re: number, hits: [string, number | null, number | null][]];
const SESSIONS: S[] = [
	["A", "/a", "Organic Search", "Chrome", 1, 1, 0, 90, 0, [["/a", 0, null]]],
	["B", "/a", "Organic Search", "Firefox", 1, 0, 0, 30, 0, [["/a", 1, null]]],
	["C", "/a", "Organic Search", "Chrome", 1, 0, 0, 5, 0, [["/a", 2, null]]],
	["D", "/a", "Organic Search", "Chrome", 1, 0, 0, 0, 0, [["/a", 0, null]]],
	["E", "/b", "Organic Search", "Chrome", 1, 0, 0, 8, 0, [["/b", 0, 2]]],
	["F", "/b", "Organic Search", "Firefox", 1, 1, 0, 20, 0, [["/b", 0, 0]]],
	["G", "/b", "Organic Search", "Chrome", 2, 1, 120, 15, 0, [["/b", 0, 2], ["/c", null, null]]],
	["H", "/b", "Organic Search", "Chrome", 2, 1, 50, 50, 1, [["/b", 0, 2], ["/d", null, null]]],
	["J", "/c", "Organic Search", "Chrome", 1, 1, 0, 70, 0, [["/c", 2, null]]],
	["K", "/c", "Organic Search", "Chrome", 1, 0, 0, 0, 0, [["/c", 0, null]]],
	["I", "/a", "Direct", "Chrome", 1, 0, 0, 7, 0, [["/a", 0, 2]]],
	["X", "/a", "Organic Social", "Chrome", 1, 1, 0, 90, 0, [["/a", 0, null]]],
	["Z", "/b", "Paid Search", "Chrome", 1, 0, 0, 6, 1, [["/b", 0, 2]]],
];

let env: Awaited<ReturnType<typeof schemaDb>>;
const ctx = (over: Partial<ReportCtx["settings"]> = {}, rawFrom?: string): ReportCtx => ({
	db: env.db,
	site: "default",
	settings: { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5, longClickSeconds: 60, badExperienceSeconds: 10, ...over },
	now: T + 86_400,
	goals: [],
	funnels: {},
	annotations: [{ ts: T, kind: "manual", text: "Deploy" }],
	...(rawFrom ? { rawFrom } : {}),
});
const run = (report: "satisfaction" | "satisfaction_series" | "entry_pages" | "overview", q: Partial<QueryInput> = {}, rc = ctx()) =>
	runReport(rc, { report, query: QuerySchema.parse({ from: DAY, to: DAY, ...q }) });
const pick = (rows: Row[] | undefined, ...f: string[]) => (rows ?? []).map((r) => Object.fromEntries(["key", ...f].map((k) => [k, r[k]])));

beforeAll(async () => {
	env = await schemaDb();
	const sess = env.raw.prepare(
		"INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, interacted, visible_ms, reentries, channel, source, browser) VALUES ('default', ?, ?, ?, 10, ?, ?, 1800, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)",
	);
	const add = ([sid, entry, channel, browser, pv, inter, wall, vis, re, hits]: S, day = DAY, t = T) => {
		const source = channel === "Direct" ? "(direct)" : channel === "Organic Social" ? "social.example.com" : sid === "H" ? "bing.com" : "google.com";
		sess.run(sid, `v${sid}`, day, t, t + wall, entry, hits.at(-1)?.[0], pv, inter, vis * 1000, re, channel, source, browser);
		putHits(env.raw, hits.map(([path, nav, exit], i) => ({ id: `${sid}.${i}`, sid, ts: t + i, kind: "pv" as const, path, nav, exit })));
	};
	for (const s of SESSIONS) add(s);
	add(["P", "/a", "Organic Search", "Chrome", 1, 1, 0, 90, 0, [["/a", 0, null]]], "2026-05-09", T - 86_400);
});
beforeEach(() => clearReportCache());

describe("satisfaction", () => {
	it("matches the hand computation per landing page and in total, over organic search sessions only", async () => {
		const r = await run("satisfaction");
		// Unmeasured D and K count as sessions only; every rate divides by measured sessions. I, X and Z are outside the scope.
		expect(pick(r.data.rows, "sessions", "measured", "search_sessions", "avg_duration", "long_clicks", "short_clicks", "bad_experiences", "pct_long", "pct_short", "pct_bad", "pogo_stick_rate", "search_reentry_rate", "back_nav_rate")).toEqual([
			// 125 s / 4; C is no pogo-stick (no exit 2); back/forward: C of 4 loads with a known type.
			{ key: "/a", sessions: 4, measured: 3, search_sessions: 4, avg_duration: 31.3, long_clicks: 1, short_clicks: 2, bad_experiences: 1, pct_long: 0.3333, pct_short: 0.6667, pct_bad: 0.3333, pogo_stick_rate: 0, search_reentry_rate: 0, back_nav_rate: 0.25 },
			// 198 s / 4; E is the only pogo-stick (G has exit 2 but two pages); H re-entered after leaving /b for the back and forward cache.
			{ key: "/b", sessions: 4, measured: 4, search_sessions: 4, avg_duration: 49.5, long_clicks: 1, short_clicks: 3, bad_experiences: 1, pct_long: 0.25, pct_short: 0.75, pct_bad: 0.25, pogo_stick_rate: 0.25, search_reentry_rate: 0.25, back_nav_rate: 0 },
			// 70 s / 2; /c loads: G route change (NULL, outside), J 2, K 0.
			{ key: "/c", sessions: 2, measured: 1, search_sessions: 2, avg_duration: 35, long_clicks: 1, short_clicks: 0, bad_experiences: 0, pct_long: 1, pct_short: 0, pct_bad: 0, pogo_stick_rate: 0, search_reentry_rate: 0, back_nav_rate: 0.5 },
		]);
		expect(r.data.totals).toMatchObject({
			sessions: 10,
			measured: 8,
			search_sessions: 10,
			avg_duration: 39.3, // 393 s / 10
			long_clicks: 3,
			short_clicks: 5,
			bad_experiences: 2,
			pogo_sticks: 1,
			reentered: 1,
			// H only: G left its landing page the same way but no search arrival joined it.
			returned_from_search: 1,
			returned_from_search_rate: 0.1,
			search_measured: 8,
			measured_rate: 0.8,
			// (3 - 2) / 8 - 1 / 8
			score: 0,
			pct_long: 0.375,
			pct_short: 0.625,
			pct_bad: 0.25,
			pogo_stick_rate: 0.125,
			search_reentry_rate: 0.1,
			back_nav_rate: 0.2, // C and J of 10 loads
		});
		expect(r.data.thresholds).toEqual({ long_click_seconds: 60, bad_experience_seconds: 10 });
		expect(r.notices).toEqual([]);
	});

	it("equals the overview of the same sessions with the channel filter Organic Search", async () => {
		const organic = [{ dim: "channel", op: "is", values: ["Organic Search"] }] as QueryInput["filters"];
		expect((await run("overview", { filters: organic })).data.totals).toMatchObject({ sessions: 10, avg_duration: 39.3 });
		// All 13 sessions of the day: the scope is what leaves I, X and Z out.
		expect((await run("overview")).data.totals?.sessions).toBe(13);
	});

	it("a channel filter equal to the scope is no conflict: no notice", async () => {
		const same = [{ dim: "channel", op: "is", values: ["Organic Search"] }] as QueryInput["filters"];
		const base = (await run("satisfaction")).data.totals;
		clearReportCache();
		const r = await run("satisfaction", { filters: same });
		expect(r.data.totals).toEqual(base);
		expect(r.notices).toEqual([]);
	});

	it.each([
		["a channel outside the scope", [{ dim: "channel", op: "is", values: ["Direct"] }]],
		["an excluded Organic Search", [{ dim: "channel", op: "is_not", values: ["Organic Search"] }]],
		["a wider channel list", [{ dim: "channel", op: "is", values: ["Organic Search", "Paid Search", "Organic Social"] }]],
	] as const)("a caller's channel filter does not apply (%s): the same organic numbers and the notice ignored_dim:channel", async (_, filters) => {
		const base = (await run("satisfaction")).data.totals;
		clearReportCache();
		const r = await run("satisfaction", { filters: filters as unknown as QueryInput["filters"] });
		expect(r.data.totals).toEqual(base);
		expect(r.notices).toEqual(["ignored_dim:channel"]);
		clearReportCache();
		const s = await run("satisfaction_series", { filters: filters as unknown as QueryInput["filters"] });
		expect(s.notices).toEqual(["ignored_dim:channel"]);
		expect(s.data.series?.at(-1)?.sessions).toBe(10);
	});

	it("other filters narrow inside the scope: source and browser", async () => {
		const google = await run("satisfaction", { filters: [{ dim: "source", op: "prefix", values: ["google."] }] });
		// H came from bing.com; Z (Paid Search, google.com) stays outside.
		expect(google.data.totals).toMatchObject({ sessions: 9, reentered: 0 });
		clearReportCache();
		const chrome = await run("satisfaction", { filters: [{ dim: "browser", op: "is", values: ["Chrome"] }] });
		// B and F are Firefox; I, X and Z are Chrome but not organic search.
		expect(chrome.data.totals).toMatchObject({ sessions: 8 });
	});

	it.each([
		// L = 30: B (30 s) stays short, H (50 s) becomes long.
		[30, { long_clicks: 4, short_clicks: 4 }],
		// L = 120: G (120 s) is at the boundary, so short; nothing is long.
		[120, { long_clicks: 0, short_clicks: 8 }],
	])("longClickSeconds %i changes only the long and short counts (and the score)", async (long, expected) => {
		const base = (await run("satisfaction")).data.totals ?? {};
		clearReportCache();
		const t = (await run("satisfaction", {}, ctx({ longClickSeconds: long }))).data.totals ?? {};
		expect(t).toMatchObject(expected);
		const same = (o: Record<string, unknown>) => {
			const { long_clicks: _l, short_clicks: _s, pct_long: _pl, pct_short: _ps, score: _sc, ...rest } = o;
			return rest;
		};
		expect(same(t)).toEqual(same(base));
	});

	it("caps the bad experience threshold at the long click threshold", async () => {
		const at = async (bad: number, long = 60) => {
			clearReportCache();
			const r = await run("satisfaction", {}, ctx({ badExperienceSeconds: bad, longClickSeconds: long }));
			return [r.data.totals?.bad_experiences, (r.data.thresholds as { bad_experience_seconds: number }).bad_experience_seconds];
		};
		// B (30 s, no interaction) joins C and E once B' exceeds 30.
		expect(await at(60)).toEqual([3, 60]);
		expect(await at(90)).toEqual([3, 60]);
		expect(await at(10)).toEqual([2, 10]);
		// B' = min(30, 20) = 20: C and E (B at 30 s is not below 20).
		expect(await at(30, 20)).toEqual([2, 20]);
	});

	it("restricts the session set exactly like entry_pages with the channel filter Organic Search", async () => {
		const organic = { dim: "channel", op: "is", values: ["Organic Search"] } as const;
		for (const filters of [
			[{ dim: "browser", op: "is", values: ["Chrome"] }],
			[{ dim: "page", op: "is", values: ["/c"] }],
		] as QueryInput["filters"][]) {
			clearReportCache();
			const sat = (await run("satisfaction", { filters })).data.rows ?? [];
			const entry = (await run("entry_pages", { filters: [organic, ...(filters ?? [])] as QueryInput["filters"] })).data.rows ?? [];
			expect(Object.fromEntries(sat.map((r) => [r.key, r.sessions]))).toEqual(Object.fromEntries(entry.map((r) => [r.key, r.entries])));
		}
		clearReportCache();
		expect(pick((await run("satisfaction", { filters: [{ dim: "page", op: "is", values: ["/c"] }] })).data.rows, "sessions")).toEqual([
			{ key: "/c", sessions: 2 },
			{ key: "/b", sessions: 1 },
		]);
	});

	it("carries compare rows and deltas", async () => {
		const r = await run("satisfaction", { compare: "previous" });
		expect(r.data.compareTotals).toMatchObject({ sessions: 1, measured: 1, pct_long: 1 });
		expect((r.data.delta as Record<string, number>).pct_long).toBe(-0.625);
		const a = r.data.rows?.find((x) => x.key === "/a");
		expect(a?.previous).toMatchObject({ sessions: 1, pct_long: 1 });
		expect((a?.delta as Record<string, number>).pct_long).toBe(-0.6667);
		expect(r.data.rows?.find((x) => x.key === "/b")?.previous).toBeNull();
	});

	it.each(["satisfaction", "satisfaction_series"] as const)("%s beyond the raw window is raw_only with the Satisfaction text", async (report) => {
		const err = await runReport(ctx({}, "2026-05-05"), { report, query: QuerySchema.parse({ from: "2026-05-01", to: DAY }) }).catch((e) => e);
		expect(err).toBeInstanceOf(QueryError);
		expect(err).toMatchObject({ code: "raw_only", message: `${SATISFACTION_RAW_ONLY} Detailed data starts on 2026-05-05.` });
	});
});

describe("satisfaction_series", () => {
	it("gives zero-filled daily rates with counts, annotations and compare", async () => {
		const r = await run("satisfaction_series", { from: "2026-05-08", to: DAY, granularity: "day", compare: "previous" });
		expect(r.data.series?.map((p) => [p.t, p.sessions, p.measured, p.pct_long, p.pct_short, p.pct_bad, p.pogo_stick_rate])).toEqual([
			["2026-05-08", 0, 0, null, null, null, null],
			["2026-05-09", 1, 1, 1, 0, 0, 0],
			[DAY, 10, 8, 0.375, 0.625, 0.25, 0.125],
		]);
		// Engaged time per session per bucket: the Satisfaction chart's duration series (right axis).
		expect(r.data.series?.[0]?.avg_engaged).toBeNull();
		expect(r.data.series?.slice(1).every((p) => typeof p.avg_engaged === "number")).toBe(true);
		expect(r.data.annotations).toHaveLength(1);
		expect(r.data.compareSeries).toHaveLength(3);
	});

	it("answers hour as day with a notice", async () => {
		const r = await run("satisfaction_series", { granularity: "hour" });
		expect(r.data.granularity).toBe("day");
		expect(r.data.notices).toEqual(["granularity_day"]);
		expect(r.data.series).toHaveLength(1);
	});

	it("answers week granularity per ISO week", async () => {
		const r = await run("satisfaction_series", { from: "2026-05-01", to: DAY, granularity: "week" });
		// 2026-05-10 is a Sunday: its week starts on Monday 2026-05-04.
		expect(r.data.series?.map((p) => [p.t, p.sessions])).toEqual([
			["2026-04-27", 0],
			["2026-05-04", 11],
		]);
	});
});

/**
 * Ranking and groupings over a generated site `rank` (one day, defaults L = 60, B' = 10), organic search from
 * google.com unless stated. Per landing page:
 *   /good    40 Chrome: 30 long (90 s), 10 short with interaction (20 s)               score 30/40 - 0 - 0 = 0.75
 *   /mid     32 Firefox: 16 long, 16 short with interaction                            score 16/32 = 0.5
 *   /bad     35 Chrome: 5 long, 30 bad pogo-sticks (5 s, exit 2)                       score (5 - 30)/35 - 30/35 = -1.5714
 *   /edge    31 Chrome, 29 measured long, 2 unmeasured                                 29 measured: below 30, not ranked
 *   /tiny    5 Chrome, all long                                                        not ranked
 *   /direct  40 Direct Chrome, all long                                                outside the scope, never ranked
 * Previous day: /good 30 sessions, 15 long, 15 short with interaction (pct_long 0.5).
 */
describe("satisfaction ranking and groupings", () => {
	const DAY2 = "2026-06-10";
	const T2 = Date.parse(`${DAY2}T10:00:00Z`) / 1000;
	const rctx = (): ReportCtx => ({ ...ctx(), site: "rank", now: T2 + 86_400 });
	const runR = (q: Partial<QueryInput>, params: Record<string, unknown>) => runReport(rctx(), { report: "satisfaction", query: QuerySchema.parse({ from: DAY2, to: DAY2, ...q }), params, limit: 10 });

	beforeAll(() => {
		const sess = env.raw.prepare(
			"INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, interacted, visible_ms, engaged_ms, reentries, channel, source, browser, device, country) VALUES ('rank', ?, ?, ?, 10, ?, ?, 1800, ?, ?, 1, 0, ?, ?, ?, 0, ?, ?, ?, 'desktop', 'DE')",
		);
		let n = 0;
		const gen = (page: string, count: number, o: { vis: number; inter: number; exit?: number; direct?: boolean; browser?: string }, day = DAY2, t = T2) => {
			for (let i = 0; i < count; i++) {
				const sid = `r${n++}`;
				sess.run(sid, `v${sid}`, day, t, t, page, page, o.inter, o.vis * 1000, o.vis * 500, o.direct ? "Direct" : "Organic Search", o.direct ? "(direct)" : "google.com", o.browser ?? "Chrome");
				putHits(env.raw, [{ site: "rank", id: `${sid}.0`, sid, ts: t, kind: "pv", path: page, nav: 0, exit: o.exit ?? null }]);
			}
		};
		gen("/good", 30, { vis: 90, inter: 1 });
		gen("/good", 10, { vis: 20, inter: 1 });
		gen("/mid", 16, { vis: 90, inter: 1, browser: "Firefox" });
		gen("/mid", 16, { vis: 20, inter: 1, browser: "Firefox" });
		gen("/bad", 5, { vis: 90, inter: 1 });
		gen("/bad", 30, { vis: 5, inter: 0, exit: 2 });
		gen("/edge", 29, { vis: 90, inter: 1 });
		gen("/edge", 2, { vis: 0, inter: 0 });
		gen("/tiny", 5, { vis: 90, inter: 1 });
		gen("/direct", 40, { vis: 90, inter: 1, direct: true });
		gen("/good", 15, { vis: 90, inter: 1 }, "2026-06-09", T2 - 86_400);
		gen("/good", 15, { vis: 20, inter: 1 }, "2026-06-09", T2 - 86_400);
	});

	it("ranks landing pages with at least 30 measured sessions by score", async () => {
		const best = await runR({}, { rank: "best" });
		expect(pick(best.data.rows, "measured", "pct_long", "pct_bad", "pogo_stick_rate", "score")).toEqual([
			{ key: "/good", measured: 40, pct_long: 0.75, pct_bad: 0, pogo_stick_rate: 0, score: 0.75 },
			{ key: "/mid", measured: 32, pct_long: 0.5, pct_bad: 0, pogo_stick_rate: 0, score: 0.5 },
			{ key: "/bad", measured: 35, pct_long: 0.1429, pct_bad: 0.8571, pogo_stick_rate: 0.8571, score: -1.5714 },
		]);
		expect(best.data.min_measured).toBe(30);
		clearReportCache();
		expect((await runR({}, { rank: "worst" })).data.rows?.map((r) => r.key)).toEqual(["/bad", "/mid", "/good"]);
	});

	it("finds the previous row of a ranked page", async () => {
		const r = await runR({ compare: "previous" }, { rank: "best" });
		const good = r.data.rows?.find((x) => x.key === "/good");
		expect(good?.previous).toMatchObject({ sessions: 30, pct_long: 0.5 });
		expect((good?.delta as Record<string, number>).pct_long).toBe(0.5);
	});

	it("groups by a session dimension", async () => {
		const r = await runR({}, { by: "browser" });
		expect(pick(r.data.rows, "sessions", "measured", "pct_long", "back_nav_rate")).toEqual([
			// 40 + 35 + 31 + 5 sessions (the Direct /direct sessions are outside the scope); 69 long of 109 measured.
			{ key: "Chrome", sessions: 111, measured: 109, pct_long: 0.633, back_nav_rate: null },
			{ key: "Firefox", sessions: 32, measured: 32, pct_long: 0.5, back_nav_rate: null },
		]);
		clearReportCache();
		const src = await runR({ filters: [{ dim: "entry", op: "is", values: ["/bad"] }] }, { by: "source" });
		expect(pick(src.data.rows, "sessions", "pogo_stick_rate", "avg_engaged")).toEqual([{ key: "google.com", sessions: 35, pogo_stick_rate: 0.8571, avg_engaged: 8.6 }]);
	});

	it.each([[{ by: "os" }], [{ by: "channel" }], [{ by: "browser", rank: "best" }]])("rejects %j", async (params) => {
		await expect(runR({}, params)).rejects.toMatchObject({ code: "invalid_params" });
	});
});
