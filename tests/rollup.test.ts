/** Rollups: rollup equals raw per dim, idempotent rerun, top-N fold, fallback for old ranges. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { QueryError } from "../src/query/compile.js";
import { type Filter, type Goal, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { matchKey, planFilters, ROLLUP_REPORTS } from "../src/query/reports/rollup.js";
import { foldTop, KV_WATERMARK, OTHER, type RollupRow, rollupDay, runRollup } from "../src/query/rollup.js";
import type { Settings } from "../src/settings.js";
import { DAYS, RANGE, seed, seedSearch } from "./fixtures/seed.js";
import { cloneSite, schemaDb } from "./helpers.js";

const GOALS: Goal[] = [
	{ name: "Pricing", type: "page", match: "is", value: "/pricing" },
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Pro signup", type: "event", match: "is", value: "signup", props: { plan: "pro" } },
	{ name: "Leave", type: "outbound", match: "is", value: "example.net" },
	{ name: "Off", type: "page", match: "is", value: "/", active: false },
];

describe.each(["UTC", "America/New_York"])("rollup in %s", (tz) => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	let raw: ReportCtx;
	let rolled: ReportCtx;

	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, tz);
		await seedSearch(env);
		raw = { db: env.db, site: "default", settings, now: zonedToEpoch("2026-03-13", 0, tz) + 360, goals: GOALS, funnels: {}, annotations: [] };
		// Every range starts before this raw window, so every traffic report reads the rollup.
		rolled = { ...raw, rawFrom: "2030-01-01" };
		for (const d of ["2025-03-11", "2025-03-12", "2026-03-08", "2026-03-09", ...DAYS, "2026-03-13"]) await rollupDay(raw, d);
	});
	beforeEach(() => clearReportCache());

	const run = async (rc: ReportCtx, report: ReportName, from: string, to: string, filters: Filter[] = [], params: Params = {}, compare: "none" | "previous" = "none") =>
		runReport(rc, { report, query: QuerySchema.parse({ from, to, filters, compare }), params, limit: 1000 });

	const SESSION_REPORTS: ReportName[] = ["channels", "sources", "campaigns", "countries", "devices", "browsers", "os", "languages", "entry_pages", "exit_pages", "events", "goals"];

	it.each([...DAYS.map((d) => [d, d]), [RANGE.from, RANGE.to]])("equals the raw reports for %s..%s on every rollup dim", async (from, to) => {
		for (const report of SESSION_REPORTS) {
			const a = await run(raw, report, from as string, to as string);
			const b = await run(rolled, report, from as string, to as string);
			expect(b.notices, report).toContain("summary");
			expect(b.data.rows, report).toEqual(a.data.rows);
		}
		const ov = [await run(raw, "overview", from as string, to as string), await run(rolled, "overview", from as string, to as string)];
		expect(ov[1]?.data.totals).toEqual(ov[0]?.data.totals);
		expect(ov[1]?.data.realtime).toBe(ov[0]?.data.realtime);
		const ts = [await run(raw, "timeseries", from as string, to as string, [], {}), await run(rolled, "timeseries", from as string, to as string)];
		const days = (s: unknown) => (s as Array<Record<string, unknown>>).filter((p) => !String(p.t).includes(" "));
		if (from !== to) expect(ts[1]?.data.series).toEqual(ts[0]?.data.series);
		else expect(ts[1]?.notices).toContain("granularity_day");
		expect(days(ts[1]?.data.series).length).toBeGreaterThan(0);
		const pages = [await run(raw, "pages", from as string, to as string, [], { withSearch: true }), await run(rolled, "pages", from as string, to as string, [], { withSearch: true })];
		const noScroll = (rows: Row[] | undefined) => (rows ?? []).map(({ scroll_median: _s, avg_visible: _v, ...r }) => r);
		expect(noScroll(pages[1]?.data.rows)).toEqual(noScroll(pages[0]?.data.rows));
		expect(pages[1]?.data.rows?.every((r) => r.scroll_median === null)).toBe(true);
	});

	it("matches the hand-computed fixture numbers", async () => {
		const ov = await run(rolled, "overview", RANGE.from, RANGE.to);
		expect(ov.data.totals?.sessions).toBe(37);
		const ch = await run(rolled, "channels", RANGE.from, RANGE.to);
		expect(ch.data.rows?.find((r) => r.key === "Direct")?.sessions).toBe(13);
	});

	it("answers compares from the rollup and reports it", async () => {
		const r = await run(rolled, "overview", RANGE.from, RANGE.to, [], {}, "previous");
		const plain = await run(raw, "overview", RANGE.from, RANGE.to, [], {}, "previous");
		expect(r.data.compareTotals).toEqual(plain.data.compareTotals);
		expect(r.notices).toEqual(expect.arrayContaining(["summary", "compare_summary"]));
	});

	it("uses no constant GROUP BY (Postgres rejects it) and few statements per day", async () => {
		const seen: string[] = [];
		const spy = { ...raw.db, all: (sql: string, p?: unknown[]) => (seen.push(sql), raw.db.all(sql, p as never)), run: (sql: string, p?: unknown[]) => (seen.push(sql), raw.db.run(sql, p as never)), batch: async (st: Array<{ sql: string; params?: unknown[] }>) => (st.forEach((x) => seen.push(x.sql)), raw.db.batch(st as never)) };
		await rollupDay({ ...raw, db: spy as never }, DAYS[0]);
		expect(seen.filter((q) => /GROUP BY\s*'/.test(q))).toEqual([]);
		// One session union, pages, events, the active goals in one statement (4 goals), revenue (1 + one per ten event goals); then the
		// rollup upsert and its two vanished-keys deletes (single and pair rows), and the two revenue deletes (no orders,
		// so no revenue upsert). The pairs add no read statement. Links and journeys: one read each, their upsert and
		// delete, and the delete of the link conversion values (none, so no upsert). The cube: its upsert and delete,
		// and the delete of the orders per cell (its cells come from the session union, no read of their own).
		expect(seen.length).toBe(3 + 1 + 2 + 5 + 2 + 3 + 3);
	});

	it("rerun is idempotent", async () => {
		const dump = () => env.raw.prepare("SELECT * FROM ca_rollup ORDER BY day, dim, key").all();
		const before = dump();
		for (const d of DAYS) await rollupDay(raw, d);
		expect(dump()).toEqual(before);
	});

	it("applies filters on the report dim and on one session dim, and reports the rest as unavailable", async () => {
		const direct: Filter = { dim: "channel", op: "is", values: ["Direct"] };
		const page: Filter = { dim: "page", op: "is", values: ["/"] };
		const region: Filter = { dim: "region", op: "is", values: ["BE"] };
		const ch = await run(rolled, "channels", RANGE.from, RANGE.to, [direct, page, region]);
		expect(ch.data.rows?.map((r) => r.key)).toEqual(["Direct"]);
		expect(ch.notices).toEqual(expect.arrayContaining(["summary", "filter_unavailable:page:combination", "filter_unavailable:region:not_kept"]));

		// Totals honor one session dim: equal to the raw totals for the same filter.
		const a = await run(raw, "overview", RANGE.from, RANGE.to, [direct]);
		const b = await run(rolled, "overview", RANGE.from, RANGE.to, [direct, { dim: "page", op: "is", values: ["/pricing"] }]);
		expect(b.data.totals).toEqual(a.data.totals);
		expect(b.notices).toContain("filter_unavailable:page:combination");
		// Active now reads the live visits, which are detailed, under the same filters as a detailed range.
		expect(b.data.realtime).toBe((await run(raw, "overview", RANGE.from, RANGE.to, [direct, { dim: "page", op: "is", values: ["/pricing"] }])).data.realtime);

		// A country filter restricts a channel breakdown through the cube; a browser filter cannot.
		const de: Filter = { dim: "country", op: "is_not", values: ["DE"] };
		const c = await run(rolled, "channels", RANGE.from, RANGE.to, [de]);
		expect(c.notices).toEqual(["summary", "detail_from:2030-01-01"]);
		expect(c.data.rows).toEqual((await run(raw, "channels", RANGE.from, RANGE.to, [de])).data.rows);
		const br = await run(rolled, "channels", RANGE.from, RANGE.to, [{ dim: "browser", op: "is", values: ["Chrome"] }]);
		expect(br.notices).toContain("filter_unavailable:browser:combination");
		expect(br.data.rows?.reduce((n, r) => n + Number(r.sessions), 0)).toBe(37);

		// Page filters on the pages report: a regex applies; a negation drops whole visits in the detailed rows, which the summaries cannot.
		const p = await run(rolled, "pages", RANGE.from, RANGE.to, [{ dim: "page", op: "regex", values: ["^/(late)?$"] }]);
		expect(p.data.rows?.map((r) => r.key).sort()).toEqual(["/", "/late"]);
		const np = await run(rolled, "pages", RANGE.from, RANGE.to, [{ dim: "page", op: "not_regex", values: ["^/pri"] }]);
		expect(np.notices).toContain("filter_unavailable:page:negated");
	});

	it("rejects raw-only reports beyond the raw window with a typed error", async () => {
		for (const report of ["funnels", "regions", "event_props", "outbound", "scroll", "not_found", "ai_referrals"] as ReportName[])
			await expect(run(rolled, report, RANGE.from, RANGE.to, [], { event: "signup", funnel: "x" }), report).rejects.toMatchObject({ code: "raw_only" });
		await expect(run(rolled, "campaigns", RANGE.from, RANGE.to, [], { field: "utm_source" })).rejects.toBeInstanceOf(QueryError);
	});

	it("leaves search reports and ranges inside the raw window on raw data", async () => {
		const s = await run(rolled, "search_overview", RANGE.from, RANGE.to);
		expect(s.notices).not.toContain("summary");
		const inside = await run({ ...raw, rawFrom: RANGE.from }, "overview", RANGE.from, RANGE.to);
		expect(inside.notices).not.toContain("summary");
	});

	it("cron tick closes every day from the first raw day up to the last closed day, resumes within its budget and never stores an open day", async () => {
		const env2 = await schemaDb();
		const s2 = await seed(env2, tz);
		const rc = { db: env2.db, settings: s2, goals: async () => GOALS };
		const now = zonedToEpoch("2026-03-13", 12, tz);
		const t1 = await runRollup(rc, env2.kv, now, { requests: 40 });
		expect(t1.days[0]).toBe("2025-03-11");
		expect(t1.done).toBe(false);
		expect(t1.statements).toBeLessThanOrEqual(40);
		let t = t1;
		for (let i = 0; i < 100 && !t.done; i++) t = await runRollup(rc, env2.kv, now, { requests: 40 });
		expect(t.watermark).toBe("2026-03-11");
		expect(await env2.kv.get(KV_WATERMARK)).toBe("2026-03-11");
		const sessions = (day: string) => env2.raw.prepare("SELECT sessions FROM ca_rollup WHERE dim = 'all' AND day = ?").get(day) as { sessions: number } | undefined;
		expect(sessions("2026-03-10")?.sessions).toBe(12);
		expect(sessions("2026-03-12")).toBeUndefined();
		expect(sessions("2026-03-13")).toBeUndefined();
		// Idle: nothing to close, no statement.
		const idle = await runRollup(rc, env2.kv, now);
		expect(idle).toMatchObject({ days: [], statements: 0, done: true, watermark: "2026-03-11" });
	});

	it("rolls up every site with sessions, each from its own rows and goals", async () => {
		const env2 = await schemaDb();
		const s2 = await seed(env2, tz);
		cloneSite(env2.raw, "blog", "day = '2026-03-11'");
		const asked: string[] = [];
		const rc = { db: env2.db, settings: s2, goals: async (site: string) => (asked.push(site), site === "blog" ? [] : GOALS) };
		const done: string[] = [];
		for (let i = 0, end = false; i < 10 && !end; i++) {
			const t = await runRollup(rc, env2.kv, zonedToEpoch("2026-03-13", 12, tz));
			done.push(...t.sites);
			end = t.done;
		}
		expect(done.filter((x) => x.startsWith("blog@"))).toEqual(["blog@2026-03-11"]);
		expect([...new Set(asked)].sort()).toEqual(["blog", "default"]);
		const all = (site: string, day: string) =>
			(env2.raw.prepare("SELECT sessions FROM ca_rollup WHERE site = ? AND dim = 'all' AND day = ?").get(site, day) as { sessions: number } | undefined)?.sessions;
		expect(all("blog", "2026-03-11")).toBe(all("default", "2026-03-11"));
		expect(all("default", "2026-03-11")).toBeGreaterThan(0);
		expect(all("default", "2026-03-12")).toBeUndefined();
		// Goals are per site: the client site has none, so it has no goal rows.
		expect((env2.raw.prepare("SELECT COUNT(*) AS n FROM ca_rollup WHERE site = 'blog' AND dim = 'goal'").get() as { n: number }).n).toBe(0);
		expect((env2.raw.prepare("SELECT COUNT(*) AS n FROM ca_rollup WHERE site = 'default' AND dim = 'goal'").get() as { n: number }).n).toBeGreaterThan(0);
	});
});

describe("rollup helpers", () => {
	const r = (key: string, sessions: number): RollupRow => ({ dim: "source", key, pageviews: sessions, sessions, visitors: sessions, bounces: 0, engaged: 0, engaged_ms: 0, events: 0, hits: 0 });

	it("folds rows beyond the top N into (other)", () => {
		const out = foldTop([r("a", 5), r("b", 4), r("c", 3), r("d", 2), r("e", 1)], 3, "sessions");
		expect(out.map((x) => x.key)).toEqual(["a", "b", OTHER]);
		expect(out[2]?.sessions).toBe(6);
		expect(foldTop([r("a", 1)], 3, "sessions")).toHaveLength(1);
	});

	it("matches keys like the SQL compiler", () => {
		expect(matchKey({ dim: "page", op: "is", values: ["/a", "/b"] }, "/b")).toBe(true);
		expect(matchKey({ dim: "page", op: "contains", values: ["PRIC"] }, "/pricing")).toBe(true);
		expect(matchKey({ dim: "page", op: "not_prefix", values: ["/blog"] }, "/blog/x")).toBe(false);
		expect(matchKey({ dim: "page", op: "regex", values: ["^/blog/\\d{1,3}$"] }, "/blog/12")).toBe(true);
		expect(() => matchKey({ dim: "page", op: "regex", values: ["(a+)+"] }, "aaa")).toThrow(QueryError);
	});

	it("plans filters per report dim", () => {
		const f = (dim: Filter["dim"]): Filter => ({ dim, op: "is", values: ["x"] });
		expect(planFilters([f("country"), f("channel")], null)).toMatchObject({ src: { dim: "all", seg: "", cube: true }, unavailable: [] });
		expect(planFilters([f("country")], "channel")).toMatchObject({ src: { dim: "channel", seg: "", cube: true }, unavailable: [] });
		expect(planFilters([f("country"), f("country")], null)).toEqual({ src: { dim: "country", seg: "" }, applied: [f("country"), f("country")], unavailable: [] });
		expect(planFilters([f("page"), f("country"), f("channel")], "page")).toMatchObject({ src: { dim: "page", seg: "country" }, unavailable: ["channel:combination"] });
		expect(planFilters([f("browser"), f("country"), f("channel")], null)).toMatchObject({ src: { dim: "browser", seg: "" }, unavailable: ["country:combination", "channel:combination"] });
		expect(planFilters([f("page")], null)).toMatchObject({ src: { dim: "all", seg: "" }, unavailable: ["page:combination"] });
		expect(planFilters([f("page"), f("country")], "page")).toMatchObject({ src: { dim: "page", seg: "country" }, unavailable: [] });
		expect(Object.keys(ROLLUP_REPORTS)).toContain("goals");
	});
});
