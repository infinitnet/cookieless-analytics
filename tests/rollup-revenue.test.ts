/** `ca_revenue_daily`: rollup equality with the raw reports, folding, the `revenue` task, its reconcile, cursor and budget. */
import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { dayInt } from "../src/db/dialect.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { REVENUE_BREAKDOWN_DIMS } from "../src/query/reports/revenue.js";
import { foldRevenue, KV_REVENUE_CURSOR, KV_WATERMARK, REVENUE_STATEMENTS_PER_SITE, type RevenueRow, rollupDay, rollupRevenue, runRevenue, runRollup } from "../src/query/rollup.js";
import type { Settings } from "../src/settings.js";
import { REV_GOALS, REV_RANGE, seedRevenue } from "./fixtures/revenue.js";
import { schemaDb } from "./helpers.js";

const SETTINGS = { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 } as Settings;
const NOW = Date.UTC(2026, 2, 12, 12) / 1000;
const TODAY = "2026-03-12";

function counting(db: Db) {
	const c = { n: 0 };
	const wrapped: Db = { dialect: db.dialect, run: (s, p) => (c.n++, db.run(s, p)), all: (s, p) => (c.n++, db.all(s, p)), batch: (st) => ((c.n += st.length), db.batch(st)) };
	return { db: wrapped, c };
}

beforeEach(() => clearReportCache());

describe("rollupRevenue", () => {
	it("rows equal the raw breakdown per dim, key and currency; the recompute is idempotent", async () => {
		const env = await schemaDb();
		seedRevenue(env.raw);
		const rc = { db: env.db, site: "default", settings: SETTINGS, goals: REV_GOALS };
		const days = ["2026-02-05", "2026-03-10", "2026-03-11"];
		for (const d of days) await rollupRevenue(rc, d);
		const dump = () => env.raw.prepare("SELECT * FROM ca_revenue_daily ORDER BY day, dim, key, cur").all();
		const first = dump();
		for (const d of days) await rollupRevenue(rc, d);
		expect(dump()).toEqual(first);
		const ctx: ReportCtx = { db: env.db, site: "default", settings: SETTINGS, now: NOW, goals: REV_GOALS, funnels: {}, annotations: [], defaultCurrency: "USD" };
		const roll = { ...ctx, rawFrom: "2026-03-12" };
		for (const cur of ["USD", "EUR", "JPY"])
			for (const dim of REVENUE_BREAKDOWN_DIMS) {
				const q = { report: "revenue_breakdown" as const, query: QuerySchema.parse(REV_RANGE), params: { dim, currency: cur } };
				const pick = (rows: Array<Record<string, unknown>> | undefined) =>
					(rows ?? []).filter((r) => (r.orders as number) > 0).map((r) => [r.key, r.revenue, r.orders]);
				const raw = await runReport(ctx, q);
				const rolled = await runReport(roll, q);
				expect(pick(rolled.data.rows), `${dim} ${cur}`).toEqual(pick(raw.data.rows));
				expect(rolled.notices).toContain("summary");
			}
	});

	it("beyond the raw window revenue_per_visitor divides by the ca_rollup visitors; goal and event have none; (other) gets null", async () => {
		const env = await schemaDb();
		seedRevenue(env.raw);
		const rc = { db: env.db, site: "default", settings: SETTINGS, goals: REV_GOALS };
		for (const d of ["2026-02-05", "2026-03-10", "2026-03-11"]) {
			await rollupDay(rc, d);
			await rollupRevenue(rc, d);
		}
		// Fold a key on the revenue table only.
		env.raw.prepare("UPDATE ca_revenue_daily SET key = '(other)' WHERE dim = 'channel' AND key = 'Search'").run();
		const ctx: ReportCtx = { db: env.db, site: "default", settings: SETTINGS, now: NOW, goals: REV_GOALS, funnels: {}, annotations: [], defaultCurrency: "USD", rawFrom: TODAY };
		const run = (params: Record<string, unknown>, report: "revenue" | "revenue_breakdown" = "revenue_breakdown") =>
			runReport(ctx, { report, query: QuerySchema.parse(REV_RANGE), params });
		const tot = await run({}, "revenue");
		// 94.90 over the 4 visitors of the `all` rollup rows.
		expect(tot.data.totals).toMatchObject({ revenue: 94.9, orders: 5, revenue_per_visitor: 23.725, visitors: 4 });
		const ch = (await run({ dim: "channel" })).data.rows ?? [];
		expect(ch.find((r) => r.key === "(other)")).toMatchObject({ revenue: 59.9, visitors: null, sessions: null, revenue_per_visitor: null });
		expect(ch.find((r) => r.key === "Search")).toMatchObject({ revenue: 0, visitors: 2 });
		for (const dim of ["goal", "event"]) for (const r of (await run({ dim })).data.rows ?? []) expect(r.revenue_per_visitor, dim).toBeNull();
		const f = await runReport(ctx, { report: "revenue", query: QuerySchema.parse({ ...REV_RANGE, filters: [{ dim: "channel", op: "is", values: ["Search"] }] }) });
		// A segment filter applies to summary revenue (the Search key was folded above, so it holds no revenue, and the answer says so).
		expect(f.notices).toEqual(["summary", `detail_from:${TODAY}`, "summary_other:channel"]);
		expect(f.data.totals).toMatchObject({ revenue: 0, orders: 0, visitors: 2 });
	});

	it("folds keys beyond the top N into (other) by orders", () => {
		const rows: RevenueRow[] = Array.from({ length: 205 }, (_, i) => ({ day: TODAY, dim: "source", key: `s${String(i).padStart(3, "0")}`, cur: "USD", orders: 300 - i, revenue: 1, sessions: 1 }));
		rows.push({ day: TODAY, dim: "source", key: "e", cur: "EUR", orders: 1, revenue: 5, sessions: 1 });
		const out = foldRevenue(rows);
		const usd = out.filter((r) => r.cur === "USD");
		expect(usd).toHaveLength(200);
		expect(usd.find((r) => r.key === "(other)")).toMatchObject({ orders: [199, 200, 201, 202, 203, 204].reduce((a, i) => a + 300 - i, 0), revenue: 6 });
		expect(out.filter((r) => r.cur === "EUR")).toHaveLength(1);
	});

	it("a site without revenue costs nothing beyond the probe", async () => {
		const env = await schemaDb();
		const spy = counting(env.db);
		const r = await runRevenue({ db: spy.db, settings: SETTINGS, goals: async () => [] }, env.kv, NOW, addDays(TODAY, -30));
		expect(r.sites).toEqual([]);
		expect(spy.c.n).toBe(1);
	});
});

describe("the revenue task", () => {
	const RAW_FROM = addDays(TODAY, -7);
	async function setup(sites = ["default"]) {
		const env = await schemaDb();
		const stmt = env.raw.prepare("INSERT INTO ca_events (site, id, day, ts, name, path, val, cur) VALUES (?, ?, ?, 0, 'purchase', '/', ?, 'USD')");
		const ins = { run: (site: string, id: string, day: string, val: number) => stmt.run(site, id, dayInt(day), val) };
		for (const site of sites) ins.run(site, "t1", TODAY, 10);
		// The reconcile covers closed days: up to the watermark the closed-day writer leaves.
		await env.kv.set(KV_WATERMARK, addDays(TODAY, -2));
		const run = (goals = REV_GOALS) => runRevenue({ db: env.db, settings: SETTINGS, goals: async () => goals }, env.kv, NOW, RAW_FROM);
		const all = (site = "default", day?: string) =>
			env.raw.prepare(`SELECT day, revenue, orders FROM ca_revenue_daily WHERE site = ? AND dim = 'all' AND seg = ''${day ? " AND day = ?" : ""} ORDER BY day`).all(...(day ? [site, day] : [site]));
		return { env, ins, run, all };
	}

	it("an agent event dated five days back appears after one tick; a correction and a void of older orders follow", async () => {
		const { env, ins, run: runWith, all } = await setup();
		// No goals: two recomputes fit in the statements per site (with the four fixture goals one does, tested below).
		const run = () => runWith([]);
		await run();
		ins.run("default", "o.late", addDays(TODAY, -5), 42);
		ins.run("default", "o.fix", addDays(TODAY, -4), 10);
		ins.run("default", "o.void", addDays(TODAY, -3), 7);
		let r = await run();
		// Two differing days per run: the oldest two first, the third on the next run.
		expect(r.sites[0]?.recomputed).toEqual([addDays(TODAY, -5), addDays(TODAY, -4)]);
		expect(all("default", addDays(TODAY, -5))).toEqual([{ day: addDays(TODAY, -5), revenue: 42, orders: 1 }]);
		r = await run();
		expect(r.sites[0]?.recomputed).toEqual([addDays(TODAY, -3)]);
		// Correction (the agent's DO UPDATE) and void (val and cur NULL).
		env.raw.prepare("UPDATE ca_events SET val = 25 WHERE id = 'o.fix'").run();
		env.raw.prepare("UPDATE ca_events SET val = NULL, cur = NULL WHERE id = 'o.void'").run();
		r = await run();
		expect(r.sites[0]?.recomputed).toEqual([addDays(TODAY, -4), addDays(TODAY, -3)]);
		expect(all("default", addDays(TODAY, -4))).toEqual([{ day: addDays(TODAY, -4), revenue: 25, orders: 1 }]);
		expect(all("default", addDays(TODAY, -3))).toEqual([]);
		// The event and goal rows of ca_rollup follow the recompute.
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_rollup WHERE day = ?").get(addDays(TODAY, -3))).toBeDefined();
		expect((await run()).sites[0]?.recomputed).toEqual([]);
	});

	it("a day at the raw window edge is never recomputed", async () => {
		const { ins, run, all } = await setup();
		ins.run("default", "o.edge", RAW_FROM, 9);
		const r = await run();
		expect(r.sites[0]?.recomputed).toEqual([]);
		expect(all("default", RAW_FROM)).toEqual([]);
	});

	it("handles at most three sites per run; a fourth waits for the next run through the cursor", async () => {
		const { env, ins, run, all } = await setup(["a", "b", "c", "d"]);
		for (const site of ["a", "b", "c", "d"]) ins.run(site, "t3", addDays(TODAY, -3), 5);
		const first = await run();
		expect(first.sites.map((s) => s.site)).toEqual(["a", "b", "c"]);
		expect(await env.kv.get(KV_REVENUE_CURSOR)).toBe("c");
		expect(all("d")).toEqual([]);
		const second = await run();
		expect(second.sites.map((s) => s.site)).toEqual(["d"]);
		expect(all("d")).toHaveLength(1);
		expect(await env.kv.get(KV_REVENUE_CURSOR)).toBeNull();
		expect((await run()).sites.map((s) => s.site)).toEqual(["a", "b", "c"]);
	});

	it("never issues more than the statements per site, with and without goals and drift", async () => {
		const { env, ins, run } = await setup();
		for (let i = 2; i <= 6; i++) ins.run("default", `d${i}`, addDays(TODAY, -i), i);
		for (const goals of [[], REV_GOALS, Array.from({ length: 12 }, (_, i) => ({ name: `G${i}`, type: "event" as const, match: "is" as const, value: "purchase" }))]) {
			env.raw.prepare("DELETE FROM ca_revenue_daily").run();
			const r = await run(goals);
			for (const s of r.sites) expect(s.statements, `${goals.length} goals`).toBeLessThanOrEqual(REVENUE_STATEMENTS_PER_SITE);
		}
		// Measured, no goals and no session rows: drift 1 + 2 x rollupDay (3 selects and the two rollup deletes, no rollup rows; revenue select, upsert, two deletes;
		// link and journey selects and their two deletes, no link or journey rows; the cube delete and the delete of its orders, no cube rows) = 31.
		env.raw.prepare("DELETE FROM ca_revenue_daily").run();
		const r = await run([]);
		expect(r.sites[0]).toMatchObject({ statements: 31, recomputed: [addDays(TODAY, -6), addDays(TODAY, -5)], pending: 0 });
		// The four fixture goals cost one statement (goals are read ten per statement), so both days still fit.
		env.raw.prepare("DELETE FROM ca_revenue_daily").run();
		const g = await run();
		expect(g.sites[0]).toMatchObject({ recomputed: [addDays(TODAY, -6), addDays(TODAY, -5)], pending: 0 });
		expect(g.sites[0]?.statements).toBeLessThanOrEqual(REVENUE_STATEMENTS_PER_SITE);
	});

	it("stays within the share of requests its database gets (the databases of one invocation split them)", async () => {
		const { env, ins } = await setup(["a", "b", "c"]);
		for (const site of ["a", "b", "c"]) for (let i = 2; i <= 6; i++) ins.run(site, `${site}${i}`, addDays(TODAY, -i), i);
		const share = 20;
		const r = await runRevenue({ db: env.db, settings: SETTINGS, goals: async () => [] }, env.kv, NOW, RAW_FROM, { requests: share });
		// The probe, the watermark and cursor reads and the cursor write, plus each site's statements and goal load.
		expect(4 + r.sites.reduce((n, x) => n + x.statements + 1, 0)).toBeLessThanOrEqual(share);
		expect(r.sites.length).toBeGreaterThan(0);
	});

	it("runRollup closes the days after the watermark with their revenue rows, never an open day", async () => {
		const env = await schemaDb();
		seedRevenue(env.raw);
		const spy = counting(env.db);
		await env.kv.set(KV_WATERMARK, "2026-03-09");
		const t = await runRollup({ db: spy.db, settings: SETTINGS, goals: async () => REV_GOALS }, env.kv, NOW);
		// 12:00 on 03-12: 03-10 is the last closed day (03-11 and 03-12 can still change).
		expect(t).toMatchObject({ days: ["2026-03-10"], sites: ["default@2026-03-10"], watermark: "2026-03-10", done: true });
		// Sites of the day, then the day: session union, pages, events, the 4 goals in one statement, revenue (1 + 1 for the event goals), links, journeys; rollup upsert and the
		// single and pair deletes, revenue likewise; the link and journey upsert and delete, and the link value delete (no conversions, so no upsert);
		// the cube upsert and delete, and the delete of the orders per cell (stored in the revenue upsert).
		expect(spy.c.n).toBe(1 + (3 + 1 + 2 + 2) + 6 + 3 + 3);
		const days = env.raw.prepare("SELECT DISTINCT day FROM ca_revenue_daily UNION SELECT DISTINCT day FROM ca_rollup ORDER BY day").all();
		expect(days).toEqual([{ day: "2026-03-10" }]);
	});
});
