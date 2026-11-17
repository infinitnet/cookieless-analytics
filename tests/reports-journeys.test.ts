/** Journeys over hand-built sessions; hand counts in comments. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/adapter.js";
import { type Filter, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { JOURNEY_SESSION_CAP } from "../src/query/reports/journeys.js";
import { putHits, schemaDb } from "./helpers.js";

const SETTINGS = { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 };
const DAY = { from: "2026-03-10", to: "2026-03-10" };

/** Sessions as page lists, one second apart, each `count` times; `ch` is the channel. */
const SESSIONS: Array<{ pages: string[]; count: number; ch?: string }> = [
	{ pages: ["/", "/pricing", "/signup"], count: 3 },
	// A reload of /pricing is not a step.
	{ pages: ["/", "/pricing", "/pricing", "/docs"], count: 2 },
	{ pages: ["/", "/"], count: 2, ch: "Organic Search" },
	{ pages: ["/blog", "/pricing"], count: 2 },
	// One session: below the floor wherever it is alone.
	{ pages: ["/blog", "/pricing", "/"], count: 1 },
];

function counting(db: Db) {
	const c = { n: 0 };
	return { db: { ...db, all: (sql: string, p?: readonly unknown[]) => (c.n++, db.all(sql, p as never)) } as Db, c };
}

describe("journeys", () => {
	let rc: ReportCtx;
	let spy: ReturnType<typeof counting>;
	beforeAll(async () => {
		const env = await schemaDb();
		const ses = env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, channel) VALUES ('default', ?, ?, '2026-03-10', 0, 1000, 1010, 1800, ?, ?)");
		let k = 0;
		for (const s of SESSIONS)
			for (let i = 0; i < s.count; i++) {
				const sid = `s${k++}`;
				ses.run(sid, `v${sid}`, s.pages.length, s.ch ?? "Direct");
				putHits(env.raw, s.pages.map((p, j) => ({ id: `${sid}-${j}`, sid, ts: 1000 + j, kind: "pv" as const, path: p })));
			}
		spy = counting(env.db);
		rc = { db: spy.db, site: "default", settings: SETTINGS, now: 0, goals: [], funnels: {}, annotations: [] };
	});
	beforeEach(() => {
		clearReportCache();
		spy.c.n = 0;
	});
	const run = (report: ReportName, params: Params = {}, filters: Filter[] = []) => runReport(rc, { report, query: QuerySchema.parse({ ...DAY, filters }), params });
	const pick = (r: Awaited<ReturnType<typeof run>>) => r.data.rows?.map((x) => [x.key, x.sessions]);

	it("journey_next: what followed the page, (exit) included, reloads collapsed, the floor of two sessions", async () => {
		const r = await run("journey_next", { path: "/pricing" });
		// After /pricing: /signup 3, /docs 2 (the reload is one step), (exit) 2; "/" once (hidden).
		expect(pick(r)).toEqual([
			["/signup", 3],
			["(exit)", 2],
			["/docs", 2],
		]);
		expect(r.data.hidden_sessions).toBe(1);
		expect(r.data.page_sessions).toBe(8);
		expect(r.data.rows?.find((x) => x.key === "/signup")?.share).toBe(0.375);
		// One count statement for the cap plus one report statement.
		expect(spy.c.n).toBe(2);
	});

	it("journey_prev: what preceded the page, (entry) included", async () => {
		const r = await run("journey_prev", { path: "/pricing" });
		// Before /pricing: / 3 + 2, /blog 2 + 1.
		expect(pick(r)).toEqual([
			["/", 5],
			["/blog", 3],
		]);
		const home = await run("journey_prev", { path: "/" });
		// "/" is entered by 3 + 2 + 2 sessions (the repeat is one step); /pricing precedes it once (hidden).
		expect(pick(home)).toEqual([["(entry)", 7]]);
		expect(home.data.hidden_sessions).toBe(1);
	});

	it("journey_paths: three steps from the landing page, params.entry, session filters", async () => {
		const r = await run("journey_paths");
		expect(r.data.rows?.map((x) => [x.path1, x.path2, x.path3, x.sessions])).toEqual([
			["/", "/pricing", "/signup", 3],
			["/", "(exit)", null, 2],
			["/", "/pricing", "/docs", 2],
			["/blog", "/pricing", "(exit)", 2],
		]);
		expect(r.data.rows?.[0]?.key).toBe("/ > /pricing > /signup");
		expect(r.data.hidden_sessions).toBe(1);
		expect(pick(await run("journey_paths", { entry: "/blog" }))).toEqual([["/blog > /pricing > (exit)", 2]]);
		expect(pick(await run("journey_paths", {}, [{ dim: "channel", op: "is", values: ["Organic Search"] }]))).toEqual([["/ > (exit)", 2]]);
		expect(spy.c.n).toBe(2 * 3);
	});

	it("rejects a 32 day range, missing params and more than 50,000 sessions with typed errors", async () => {
		await expect(runReport(rc, { report: "journey_paths", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-04-01" }) })).rejects.toMatchObject({ code: "journey_range" });
		await expect(runReport(rc, { report: "journey_paths", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-03-31" }) })).resolves.toBeTruthy();
		await expect(run("journey_next")).rejects.toMatchObject({ code: "invalid_params" });
		// Before the detailed window the daily summaries answer (tests/rollup-families.test.ts), with the range rule kept.
		await expect(runReport({ ...rc, rawFrom: "2026-03-11" }, { report: "journey_paths", query: QuerySchema.parse(DAY) })).resolves.toMatchObject({ notices: expect.arrayContaining(["top_paths_per_day"]) });
		await expect(runReport({ ...rc, rawFrom: "2026-04-02" }, { report: "journey_paths", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-04-01" }) })).rejects.toMatchObject({ code: "journey_range" });
		const env = await schemaDb();
		env.raw
			.prepare(
				`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i <= ${JOURNEY_SESSION_CAP})
INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews) SELECT 'default', 's' || i, 'v' || i, '2026-03-10', 0, 0, 0, 1800, 1 FROM n`,
			)
			.run();
		const err = await runReport({ ...rc, db: env.db }, { report: "journey_paths", query: QuerySchema.parse(DAY) }).catch((e) => e);
		expect(err.code).toBe("journey_cap");
		expect(err.message).toContain(String(JOURNEY_SESSION_CAP));
	});
});

describe.each(["sqlite", "postgres"] as const)("journey statement snapshots (%s)", (dialect) => {
	it("use LEAD or LAG and bind every value", async () => {
		const seen: Array<{ sql: string; params: unknown[] }> = [];
		const fake: Db = {
			dialect,
			run: async (sql, p) => (seen.push({ sql, params: p ?? [] }), { changes: 0 }),
			all: async (sql, p) => (seen.push({ sql, params: p ?? [] }), [] as never[]),
			batch: async () => {},
		};
		const rc: ReportCtx = { db: fake, site: "default", settings: SETTINGS, now: 0, goals: [], funnels: {}, annotations: [] };
		const f: Filter[] = [{ dim: "channel", op: "is", values: ["Search"] }];
		const out: Record<string, Array<{ sql: string; params: unknown[] }>> = {};
		for (const [report, params] of [["journey_next", { path: "/pricing" }], ["journey_prev", { path: "/pricing" }], ["journey_paths", {}], ["journey_paths", { entry: "/blog" }]] as Array<[ReportName, Params]>) {
			seen.length = 0;
			clearReportCache();
			await runReport(rc, { report, query: QuerySchema.parse({ ...DAY, filters: f }), params });
			out[`${report} ${JSON.stringify(params)}`] = [...seen];
		}
		expect(out).toMatchSnapshot();
		for (const [name, stmts] of Object.entries(out)) {
			expect(stmts, name).toHaveLength(2);
			expect(stmts[1]?.sql, name).toMatch(/\b(LEAD|LAG)\(/);
			for (const s of stmts) {
				expect(s.sql, name).not.toMatch(/2026-|Search'|\/pricing|\/blog|'default'/);
				expect((s.sql.match(/\?/g) ?? []).length, `${name}: ${s.sql}`).toBe(s.params.length);
			}
		}
	});
});
