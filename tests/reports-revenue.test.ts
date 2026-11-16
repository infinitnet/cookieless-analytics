/** Revenue reports over the synthetic fixture in tests/fixtures/revenue.ts; hand sums in comments. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/adapter.js";
import { QuerySchema, type Filter, type QueryInput } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { REVENUE_BREAKDOWN_DIMS, WITH_REVENUE } from "../src/query/reports/revenue.js";
import type { Settings } from "../src/settings.js";
import { REV_GOALS, REV_RANGE, SID, seedRevenue } from "./fixtures/revenue.js";
import { putHits, schemaDb } from "./helpers.js";

const SETTINGS = { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 } as Settings;

/** Counts statements; batches count each statement. */
function counting(db: Db) {
	const c = { n: 0, sql: [] as string[] };
	const wrapped: Db = {
		dialect: db.dialect,
		run: (sql, p) => (c.n++, c.sql.push(sql), db.run(sql, p)),
		all: (sql, p) => (c.n++, c.sql.push(sql), db.all(sql, p)),
		batch: (stmts) => ((c.n += stmts.length), db.batch(stmts)),
	};
	return { db: wrapped, c };
}

const keyed = (rows: Row[] | undefined, ...f: string[]) => (rows ?? []).map((r) => [r.key, ...f.map((x) => r[x])]);

describe("revenue reports", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let rc: ReportCtx;
	let spy: ReturnType<typeof counting>;
	beforeAll(async () => {
		env = await schemaDb();
		seedRevenue(env.raw);
		// The twin: the same USD rows without the EUR and JPY hits.
		seedRevenue(env.raw, "twin", "USD");
		spy = counting(env.db);
		rc = { db: spy.db, site: "default", settings: SETTINGS, now: Date.UTC(2026, 2, 12, 12) / 1000, goals: REV_GOALS, funnels: {}, annotations: [], defaultCurrency: "USD" };
	});
	beforeEach(() => clearReportCache());

	const run = (report: ReportName, q: Partial<QueryInput> = {}, params?: Params, over: Partial<ReportCtx> = {}) =>
		runReport({ ...rc, ...over }, { report, query: QuerySchema.parse({ ...REV_RANGE, ...q }), ...(params ? { params } : {}) });

	it("revenue: totals per currency equal hand sums, the selected currency first", async () => {
		spy.c.n = 0;
		const r = await run("revenue");
		expect(spy.c.n).toBeLessThanOrEqual(3);
		// USD: 49.90 + 10 + 0 + 30 + 5 = 94.90 in 5 orders; visitors 4 (v1, v2 on 03-10, v3, v4); paying sessions S1, S2, S4.
		expect(r.data.totals).toEqual({ revenue: 94.9, refunds: 0, net_revenue: 94.9, orders: 5, aov: 18.98, revenue_per_visitor: 23.725, revenue_per_session: 23.725, paying_sessions: 3, visitors: 4, sessions: 4 });
		expect(r.data.currency).toBe("USD");
		expect((r.data.currencies as Array<{ currency: string }>).map((c) => c.currency)).toEqual(["USD", "EUR", "JPY"]);
		expect(r.data.currencies).toContainEqual({ currency: "JPY", revenue: 1000, refunds: 0, net_revenue: 1000, orders: 1, aov: 1000, revenue_per_visitor: 250, paying_sessions: 1 });
		expect(r.data.hasRevenue).toBe(true);
		expect(keyed(r.data.rows, "currency", "revenue")).toEqual([
			["USD", "USD", 94.9],
			["EUR", "EUR", 120],
			["JPY", "JPY", 1000],
		]);
	});

	it("selecting EUR changes every figure and never adds currencies", async () => {
		const r = await run("revenue", {}, { currency: "eur" });
		expect(r.data.totals).toMatchObject({ revenue: 120, orders: 1, aov: 120, revenue_per_visitor: 30, paying_sessions: 1 });
		expect((r.data.currencies as Array<{ currency: string }>)[0]?.currency).toBe("EUR");
		await expect(run("revenue", {}, { currency: "ZZZ" })).rejects.toMatchObject({ code: "invalid_currency" });
		// The site default decides the currency when none is chosen.
		expect((await run("revenue", {}, undefined, { defaultCurrency: "JPY" })).data.totals).toMatchObject({ revenue: 1000, orders: 1 });
	});

	it("revenue_series zero fills and sums to the totals", async () => {
		const r = await run("revenue_series", { granularity: "day" });
		const s = r.data.series ?? [];
		expect(s).toHaveLength(40);
		expect(s.find((p) => p.t === "2026-03-10")).toEqual({ t: "2026-03-10", revenue: 59.9, refunds: 0, net_revenue: 59.9, orders: 2, aov: 29.95 });
		expect(s.find((p) => p.t === "2026-03-01")).toEqual({ t: "2026-03-01", revenue: 0, refunds: 0, net_revenue: 0, orders: 0, aov: null });
		expect(Math.round(s.reduce((a, p) => a + (p.revenue as number), 0) * 100) / 100).toBe(94.9);
		expect(s.reduce((a, p) => a + (p.orders as number), 0)).toBe(5);
		expect(r.data.currencies).toHaveLength(3);
	});

	it("revenue_breakdown by channel: ranked within the currency, zero for keys with visitors, (not set) for hits without a counted session", async () => {
		spy.c.n = 0;
		const r = await run("revenue_breakdown", {}, { dim: "channel" });
		expect(spy.c.n).toBeLessThanOrEqual(4);
		expect(keyed(r.data.rows, "revenue", "orders", "visitors", "sessions", "revenue_per_visitor", "currency")).toEqual([
			["Search", 59.9, 2, 2, 2, 29.95, "USD"],
			// h6 has no session and h7 a session with zero pageviews: 30 + 5.
			["(not set)", 35, 2, null, null, null, "USD"],
			["Direct", 0, 1, 2, 2, 0, "USD"],
		]);
		expect(r.data.other_currencies).toEqual(["EUR", "JPY"]);
		const eur = await run("revenue_breakdown", {}, { dim: "channel", currency: "EUR" });
		expect(keyed(eur.data.rows, "revenue", "orders")).toEqual([
			["Direct", 120, 1],
			["Search", 0, 0],
		]);
		// A session filter drops the unattributed hits.
		const f = await run("revenue_breakdown", { filters: [{ dim: "channel", op: "is_not", values: ["Direct"] }] }, { dim: "channel" });
		expect(keyed(f.data.rows, "revenue")).toEqual([["Search", 59.9]]);
		await expect(run("revenue_breakdown", {}, { dim: "browser" })).rejects.toMatchObject({ code: "invalid_params" });
	});

	it("revenue_breakdown by page, goal and event", async () => {
		const page = await run("revenue_breakdown", {}, { dim: "page" });
		expect(keyed(page.data.rows, "revenue", "orders", "visitors").slice(0, 5)).toEqual([
			["/checkout", 59.9, 2, 1],
			["/api", 30, 1, null],
			["/x", 5, 1, null],
			["/thanks", 0, 1, null],
			["/", 0, 0, 2],
		]);
		// Bought matches every purchase, Pro only plan=pro; a purchase matching both counts in both.
		const goal = await run("revenue_breakdown", {}, { dim: "goal" });
		expect(keyed(goal.data.rows, "revenue", "orders")).toEqual([
			["Bought", 94.9, 5],
			["Pro", 49.9, 1],
		]);
		const ev = await run("revenue_breakdown", {}, { dim: "event" });
		// Visitors per day, summed: S2's second purchase belongs to the day its visit started, so v2 counts once (docs/limits.md).
		expect(keyed(ev.data.rows, "revenue", "orders", "visitors")).toEqual([
			["purchase", 94.9, 5, 3],
			["signup", 0, 0, 1],
		]);
	});

	it("revenue_orders lists the newest orders of the currency with their first touch and no visitor or session key", async () => {
		spy.c.n = 0;
		const r = await run("revenue_orders", { compare: "none" });
		expect(spy.c.n).toBe(1);
		const rows = r.data.rows ?? [];
		// USD orders h1, h2, h5, h6, h7, newest day first; h6 has no visit and h7 a visit without a pageview: (not set).
		expect(rows.map((x) => x.key).sort()).toEqual(["h1", "h2", "h5", "h6", "h7"]);
		expect(rows.map((x) => x.day)).toEqual([...rows.map((x) => String(x.day))].sort().reverse());
		expect(rows.find((x) => x.key === "h1")).toEqual({ key: "h1", day: "2026-03-10", amount: 49.9, refund: false, channel: "Search", entry: "/", country: "DE" });
		expect(rows.find((x) => x.key === "h6")).toMatchObject({ channel: "(not set)", entry: "(not set)", country: "(not set)" });
		for (const x of rows) expect(Object.keys(x).sort()).toEqual(["amount", "channel", "country", "day", "entry", "key", "refund"]);
		expect(r.data.currency).toBe("USD");
		expect(r.data.truncated).toBe(false);
		const eur = await run("revenue_orders", { compare: "none" }, { currency: "EUR" });
		expect(eur.data.rows).toEqual([{ key: "h3", day: "2026-03-10", amount: 120, refund: false, channel: "Direct", entry: "/pricing", country: "US" }]);
		// A session filter keeps the orders of counted visits only.
		const f = await run("revenue_orders", { compare: "none", filters: [{ dim: "channel", op: "is", values: ["Search"] }] });
		expect((f.data.rows ?? []).map((x) => x.key).sort()).toEqual(["h1", "h2"]);
		// Capped, with truncated set.
		const capped = await runReport(rc, { report: "revenue_orders", query: QuerySchema.parse({ ...REV_RANGE, compare: "none" }), limit: 2 });
		expect(capped.data.rows).toHaveLength(2);
		expect(capped.data.truncated).toBe(true);
		// A comparison is ignored: same rows, no previous or delta per row.
		const cmp = await run("revenue_orders", { compare: "previous" });
		expect(cmp.compareRange).toBeNull();
		expect(cmp.data.rows).toEqual(rows);
		// Before the detailed window: raw_only with the first detailed day.
		await expect(run("revenue_orders", { compare: "none" }, undefined, { rawFrom: "2026-03-01" })).rejects.toMatchObject({ code: "raw_only", message: expect.stringContaining("Detailed data starts on 2026-03-01.") });
	});

	it("revenue_orders lists a refund as a negative amount with its order's first touch", async () => {
		seedRevenue(env.raw, "rf");
		// A refund of h1 booked on 03-12, stored with the order's visit as the agent events route does.
		putHits(env.raw, [{ site: "rf", id: "h1.r1", sid: SID.S1, ts: 100, day: "2026-03-12", kind: "ev", path: "/checkout", name: "purchase", props: null, val: -9.9, cur: "USD" }]);
		const r = await run("revenue_orders", { compare: "none" }, undefined, { site: "rf" });
		expect(r.data.rows?.[0]).toEqual({ key: "h1.r1", day: "2026-03-12", amount: -9.9, refund: true, channel: "Search", entry: "/", country: "DE" });
		expect((r.data.rows ?? []).filter((x) => x.refund)).toHaveLength(1);
	});

	it("every session dim puts the hit without a session and the zero pageview session under (not set)", async () => {
		for (const dim of ["channel", "source", "campaign", "entry", "country", "device"]) {
			const r = await run("revenue_breakdown", {}, { dim });
			const ns = r.data.rows?.find((x) => x.key === "(not set)");
			expect(ns?.revenue, dim).toBeGreaterThanOrEqual(35);
			expect((r.data.rows ?? []).reduce((a, x) => a + (x.revenue as number), 0), dim).toBeCloseTo(94.9, 6);
		}
	});

	it("withRevenue merges onto the nine reports and keeps revenue-only keys with null visitors", async () => {
		const ch = await run("channels", {}, { withRevenue: true });
		expect(keyed(ch.data.rows, "revenue", "orders", "revenue_currency", "visitors")).toEqual([
			["Direct", 0, 1, "USD", 2],
			["Search", 59.9, 2, "USD", 2],
			["(not set)", 35, 2, "USD", null],
		]);
		const goals = await run("goals", {}, { withRevenue: true });
		expect(Object.fromEntries((goals.data.rows ?? []).map((r) => [r.key, r.revenue]))).toEqual({ Bought: 94.9, Pro: 49.9, Pricing: null, Leave: null });
		for (const report of Object.keys(WITH_REVENUE) as ReportName[]) {
			const r = await run(report, {}, { withRevenue: true });
			for (const row of r.data.rows ?? []) expect(row, report).toHaveProperty("revenue_currency", "USD");
		}
		const utm = await run("campaigns", {}, { withRevenue: true, field: "utm_source" });
		expect(utm.data.notices).toContain("revenue_not_available");
	});

	it("compare previous and year", async () => {
		for (const compare of ["previous", "year"] as const) {
			const r = await run("revenue", { compare });
			expect(r.data.delta, compare).toBeTypeOf("object");
			const b = await run("revenue_breakdown", { compare }, { dim: "channel" });
			for (const row of b.data.rows ?? []) expect(row).toHaveProperty("delta");
			expect(Array.isArray((await run("revenue_series", { compare })).data.compareSeries)).toBe(true);
		}
	});

	it("no figure adds two currencies: USD results equal those of a twin site without the EUR and JPY rows", async () => {
		const strip = (d: Record<string, unknown>) => {
			const { currencies: _c, other_currencies: _o, rows, hasRevenue: _h, ...rest } = d;
			return { ...rest, rows: (rows as Row[] | undefined)?.filter((r) => r.currency !== "EUR" && r.currency !== "JPY") };
		};
		const cases: Array<[ReportName, Params | undefined]> = [
			["revenue", undefined],
			["revenue_series", undefined],
			...REVENUE_BREAKDOWN_DIMS.map((dim) => ["revenue_breakdown", { dim }] as [ReportName, Params]),
			...Object.keys(WITH_REVENUE).map((r) => [r, { withRevenue: true }] as [ReportName, Params]),
		];
		for (const [report, params] of cases) {
			const a = await run(report, {}, params);
			const b = await run(report, {}, params, { site: "twin" });
			expect(strip(a.data), `${report} ${JSON.stringify(params)}`).toEqual(strip(b.data));
		}
	});

	it("1,000 events of 0.10 sum to exactly 100.00", async () => {
		const e = await schemaDb();
		const ins = e.raw.prepare("INSERT INTO ca_events (site, id, day, ts, sday, sid, name, path, val, cur) VALUES ('default', ?, 20260310, 0, NULL, NULL, 'purchase', '/', 0.1, 'USD')");
		for (let i = 0; i < 1000; i++) ins.run(`o${i}`);
		const r = await runReport({ ...rc, db: e.db }, { report: "revenue", query: QuerySchema.parse(REV_RANGE) });
		expect(r.data.totals?.revenue).toBe(100);
		expect(r.data.totals?.aov).toBe(0.1);
	});

	it("a site without revenue: hasRevenue false and empty currencies", async () => {
		const e = await schemaDb();
		const r = await runReport({ ...rc, db: e.db }, { report: "revenue", query: QuerySchema.parse(REV_RANGE) });
		expect(r.data.hasRevenue).toBe(false);
		expect(r.data.currencies).toEqual([]);
		expect(r.data.totals).toMatchObject({ revenue: 0, orders: 0, aov: null });
	});

	it("revenue filters inside reports: currency and revenue gte", async () => {
		const f: Filter[] = [{ dim: "revenue", op: "gte", values: ["50"] }];
		expect((await run("revenue", { filters: f })).data.totals).toMatchObject({ revenue: 59.9, orders: 2, sessions: 1 });
		expect((await run("overview", { filters: [{ dim: "currency", op: "is", values: ["EUR"] }] })).data.totals?.sessions).toBe(1);
		await expect(run("overview", { filters: [{ dim: "channel", op: "gt", values: ["5"] }] })).rejects.toMatchObject({ code: "invalid_filter" });
	});

	it("the raw revenue statement reads the orders of the range by the day index and each visit by its key", async () => {
		await run("revenue");
		const sql = spy.c.sql.find((s) => s.includes("h.val >= 0") && s.includes("GROUP BY h.cur")) as string;
		const plan = (env.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all("default", 20260201, 20260312) as Array<{ detail: string }>).map((p) => p.detail).join("\n");
		expect(plan).toContain("SEARCH h USING INDEX ca_events_day (site=? AND day>? AND day<?)");
		expect(plan).toMatch(/SEARCH s USING PRIMARY KEY \(site=\? AND day=\? AND sid=\?\)/);
		expect(plan).not.toMatch(/\bSCAN\b/);
	});
});

describe("impact over revenue", () => {
	it("accepts report revenue with its metrics and params.currency; notable for orders only", async () => {
		const env = await schemaDb();
		seedRevenue(env.raw);
		const rc: ReportCtx = { db: env.db, site: "default", settings: SETTINGS, now: Date.UTC(2026, 2, 12, 12) / 1000, goals: REV_GOALS, funnels: {}, annotations: [], defaultCurrency: "USD" };
		const imp = (params: Params) => runReport(rc, { report: "impact", query: QuerySchema.parse(REV_RANGE), params: { at: "2026-03-10", window: 7, report: "revenue", ...params } });
		// After: 03-11 only (yesterday); before: 03-09. USD orders 3 (h5, h6, h7) against 0.
		const o = await imp({ metric: "orders" });
		expect(o.data).toMatchObject({ before: 0, after: 3, currency: "USD" });
		expect(o.data).toHaveProperty("notable");
		const r = await imp({ metric: "revenue", currency: "USD" });
		expect(r.data).toMatchObject({ before: 0, after: 35, measured: { before: 0, after: 3 } });
		expect(r.data).not.toHaveProperty("notable");
		await expect(imp({ metric: "paying_sessions" })).rejects.toMatchObject({ code: "invalid_params" });
		await expect(imp({ metric: "revenue", currency: "XYZ" })).rejects.toMatchObject({ code: "invalid_currency" });
	});
});

describe.each(["sqlite", "postgres"] as const)("revenue statement snapshots (%s)", (dialect) => {
	it("every raw and rollup revenue statement binds its values and joins each order to its visit by the visit key", async () => {
		const { computeRevenueDays, revenueDrift, runRevenue } = await import("../src/query/rollup.js");
		const { MemoryKv } = await import("./helpers.js");
		const seen: Array<{ sql: string; params: unknown[] }> = [];
		const fake: Db = {
			dialect,
			run: async (sql, p) => (seen.push({ sql, params: p ?? [] }), { changes: 0 }),
			all: async (sql, p) => (seen.push({ sql, params: p ?? [] }), [] as never[]),
			batch: async (st) => void st.forEach((x) => seen.push({ sql: x.sql, params: x.params ?? [] })),
		};
		const rc: ReportCtx = { db: fake, site: "default", settings: SETTINGS, now: Date.UTC(2026, 2, 12, 12) / 1000, goals: REV_GOALS, funnels: {}, annotations: [], defaultCurrency: "USD" };
		const out: Record<string, Array<{ sql: string; params: unknown[] }>> = {};
		const take = async (name: string, fn: () => Promise<unknown>) => {
			seen.length = 0;
			clearReportCache();
			await fn();
			out[name] = [...seen];
		};
		const f: Filter[] = [{ dim: "channel", op: "is", values: ["Search"] }];
		for (const [report, params] of [["revenue", {}], ["revenue_series", { currency: "EUR" }], ...REVENUE_BREAKDOWN_DIMS.map((dim) => ["revenue_breakdown", { dim }])] as Array<[ReportName, Params]>) {
			await take(`${report} ${JSON.stringify(params)}`, () => runReport(rc, { report, query: QuerySchema.parse({ ...REV_RANGE, filters: f }), params }));
			await take(`${report} ${JSON.stringify(params)} rollup`, () => runReport({ ...rc, rawFrom: "2026-03-01", summaryThrough: REV_RANGE.to }, { report, query: QuerySchema.parse(REV_RANGE), params }));
		}
		await take("channels withRevenue", () => runReport(rc, { report: "channels", query: QuerySchema.parse(REV_RANGE), params: { withRevenue: true } }));
		const rollCtx = { db: fake, site: "default", settings: SETTINGS, goals: REV_GOALS };
		await take("computeRevenueDays", () => computeRevenueDays(rollCtx, ["2026-03-10", "2026-03-11"]));
		await take("revenueDrift", () => revenueDrift(fake, "default", "2026-03-01", "2026-03-09"));
		await take("runRevenue probe", () => runRevenue({ db: fake, settings: SETTINGS, goals: async () => REV_GOALS }, new MemoryKv(), rc.now, "2026-02-11"));
		expect(out).toMatchSnapshot();
		for (const [name, stmts] of Object.entries(out))
			for (const s of stmts) {
				expect(s.sql, name).not.toMatch(/USD|EUR|2026-|Search'|purchase'|'default'/);
				expect((s.sql.match(/\?/g) ?? []).length, `${name}: ${s.sql}`).toBe(s.params.length);
				expect(s.sql, name).not.toContain("ca_hits");
				// Orders join their visit by its key, never by a range of visit days.
				if (/FROM ca_events h/.test(s.sql) && /h\.val IS NOT NULL/.test(s.sql) && /ca_sessions s/.test(s.sql)) {
					expect(s.sql, name).toContain("LEFT JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid");
					expect(s.sql, name).not.toMatch(/s\.day BETWEEN/);
				}
			}
	});
});
