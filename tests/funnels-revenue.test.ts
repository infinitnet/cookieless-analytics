/** Funnel revenue (`withRevenue` on `funnels`): per step, the revenue of the sessions that reached it, in one currency. */
import { describe, expect, it } from "vitest";
import type { Db } from "../src/db/adapter.js";
import { MAX_PARAMS } from "../src/db/sql.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { FUNNEL_SIDS_PER_PARAM, funnelSidStatements } from "../src/query/reports/behaviour.js";
import { clearReportCache, type Params, runReport } from "../src/query/reports/index.js";
import { putHits, schemaDb } from "./helpers.js";

const spyDb = (db: Db, log: string[]): Db => ({ ...db, all: (sql, params) => (log.push(sql), db.all(sql, params)), run: (sql, params) => (log.push(sql), db.run(sql, params)) });

type Hit = [ts: number, kind: "pv" | "ev", value: string, val?: number, cur?: string];
const DAY = "2026-03-10";

/** Hand-built sessions on one day; an `ev` hit with a value is an order. `refunds` are stored like the refund route does: a negative row on the order's visit, no visit entry. */
async function build(sessions: Record<string, Hit[]>, refunds: Array<[sid: string, amount: number, cur: string]> = []) {
	const env = await schemaDb();
	const ses = env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, events) VALUES ('default', ?, ?, ?, 0, ?, ?, 1800, ?, ?)");
	for (const [sid, hits] of Object.entries(sessions)) {
		ses.run(sid, `v-${sid}`, DAY, hits[0]?.[0] ?? 0, hits.at(-1)?.[0] ?? 0, hits.filter((h) => h[1] === "pv").length, hits.filter((h) => h[1] === "ev").length);
		putHits(
			env.raw,
			hits.map(([ts, kind, v, val, cur], i) => ({ id: `${sid}-${String(i).padStart(2, "0")}`, sid, ts, day: DAY, kind, path: kind === "pv" ? v : "/", name: kind === "ev" ? v : null, val: val ?? null, cur: cur ?? null })),
		);
	}
	const ref = env.raw.prepare("INSERT INTO ca_events (site, id, day, ts, sday, sid, name, path, props, val, cur) VALUES ('default', ?, 20260310, 500, ?, ?, 'purchase', '/', NULL, ?, ?)");
	refunds.forEach(([sid, amount, cur], i) => ref.run(`refund-${i}`, DAY, sid, -amount, cur));
	const log: string[] = [];
	const rc: ReportCtx = {
		db: spyDb(env.db, log),
		site: "default",
		settings: { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 },
		now: 0,
		goals: [],
		funnels: {},
		annotations: [],
		defaultCurrency: "USD",
	};
	const run = (params: Params) => {
		clearReportCache();
		log.length = 0;
		return runReport(rc, { report: "funnels", query: QuerySchema.parse({ from: DAY, to: DAY }), params });
	};
	return { run, log };
}

const page = (value: string) => ({ type: "page" as const, match: "is" as const, value });
const event = (value: string) => ({ type: "event" as const, match: "is" as const, value });
const STEPS = [page("/"), page("/pricing"), event("signup")];

/**
 * A buys before reaching /pricing (its order still counts at every step it reached) and has 10 USD refunded; B leaves
 * after /pricing; C pays in EUR and USD; D sees /pricing before / (step 2 in flexible mode only); E completes after a
 * detour (no strict chain); F reaches no step, so its 100 USD never counts.
 */
const SHOP: Record<string, Hit[]> = {
	A: [[100, "pv", "/"], [105, "ev", "purchase", 40, "USD"], [110, "pv", "/pricing"], [120, "ev", "signup"]],
	B: [[100, "pv", "/"], [110, "pv", "/pricing"], [115, "ev", "purchase", 25, "USD"]],
	C: [[100, "pv", "/"], [105, "ev", "purchase", 10, "EUR"], [106, "ev", "purchase", 5, "USD"]],
	D: [[100, "pv", "/pricing"], [110, "pv", "/"], [120, "ev", "purchase", 7, "USD"]],
	E: [[100, "pv", "/"], [105, "pv", "/other"], [110, "pv", "/pricing"], [115, "ev", "signup"], [120, "ev", "purchase", 60, "USD"]],
	F: [[100, "pv", "/other"], [105, "ev", "purchase", 100, "USD"]],
};
const pick = (rows: Array<Record<string, unknown>> | undefined, keys: string[]) => rows?.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
const COLS = ["sessions", "revenue", "refunds", "net_revenue", "orders", "aov", "paying_sessions", "revenue_per_session", "est_lost_revenue"];

describe("funnel revenue", () => {
	it("sequential: each step sums the revenue of the sessions that reached it, refunds netted, completers valued for the estimate", async () => {
		const { run } = await build(SHOP, [["A", 10, "USD"]]);
		const r = await run({ steps: STEPS, withRevenue: true });
		// Depths: A 3, B 2, C 1, D 1, E 3. Step 1: 40 + 25 + 5 + 7 + 60; step 2: A, B, E; step 3: A, E (100 over 2 completers).
		expect(pick(r.data.rows, COLS)).toEqual([
			{ sessions: 5, revenue: 137, refunds: 10, net_revenue: 127, orders: 5, aov: 27.4, paying_sessions: 5, revenue_per_session: 27.4, est_lost_revenue: null },
			{ sessions: 3, revenue: 125, refunds: 10, net_revenue: 115, orders: 3, aov: 41.67, paying_sessions: 3, revenue_per_session: 41.6667, est_lost_revenue: 100 },
			{ sessions: 2, revenue: 100, refunds: 10, net_revenue: 90, orders: 2, aov: 50, paying_sessions: 2, revenue_per_session: 50, est_lost_revenue: 50 },
		]);
		expect(r.data.currency).toBe("USD");
		expect(r.data.other_currencies).toEqual(["EUR"]);
		expect(r.data.rows?.[0]?.revenue_currency).toBe("USD");
	});

	it("strict: a purchase event between two steps breaks the chain, so A stops at step 1; no completer, no estimate", async () => {
		const { run } = await build(SHOP);
		const r = await run({ steps: STEPS, mode: "strict", withRevenue: true });
		// Depths: A 1, B 2, C 1, D 1, E 1.
		expect(pick(r.data.rows, ["sessions", "revenue", "orders", "revenue_per_session", "est_lost_revenue"])).toEqual([
			{ sessions: 5, revenue: 137, orders: 5, revenue_per_session: 27.4, est_lost_revenue: null },
			{ sessions: 1, revenue: 25, orders: 1, revenue_per_session: 25, est_lost_revenue: null },
			{ sessions: 0, revenue: 0, orders: 0, revenue_per_session: null, est_lost_revenue: null },
		]);
		expect(r.data.rows?.[0]).not.toHaveProperty("refunds");
	});

	it("flexible: steps in any order, D reaches step 2", async () => {
		const { run } = await build(SHOP);
		const r = await run({ steps: STEPS, mode: "flexible", withRevenue: true });
		// Depths: A 3, B 2, C 1, D 2, E 3. Completers 100 over 2: 1 lost at step 2, 2 at step 3.
		expect(pick(r.data.rows, ["sessions", "revenue", "orders", "est_lost_revenue"])).toEqual([
			{ sessions: 5, revenue: 137, orders: 5, est_lost_revenue: null },
			{ sessions: 4, revenue: 132, orders: 4, est_lost_revenue: 50 },
			{ sessions: 2, revenue: 100, orders: 2, est_lost_revenue: 100 },
		]);
		// The per visit form counts what the summed statement counts.
		const plain = await run({ steps: STEPS, mode: "flexible" });
		expect(plain.data.rows?.map((x) => x.sessions)).toEqual([5, 4, 2]);
	});

	it("never mixes currencies: EUR answers the EUR order only and lists USD as the other currency", async () => {
		const { run } = await build(SHOP);
		const r = await run({ steps: STEPS, withRevenue: true, currency: "eur" });
		expect(pick(r.data.rows, ["revenue", "orders", "est_lost_revenue"])).toEqual([
			{ revenue: 10, orders: 1, est_lost_revenue: null },
			{ revenue: 0, orders: 0, est_lost_revenue: 0 },
			{ revenue: 0, orders: 0, est_lost_revenue: 0 },
		]);
		expect(r.data.currency).toBe("EUR");
		expect(r.data.other_currencies).toEqual(["USD"]);
	});

	it("adds no revenue keys and no lookup without orders in the range, and nothing without withRevenue", async () => {
		const { run, log } = await build({ A: [[100, "pv", "/"], [110, "pv", "/pricing"]] });
		const off = await run({ steps: STEPS });
		const offStatements = log.length;
		const on = await run({ steps: STEPS, withRevenue: true });
		expect(on.data.rows).toEqual(off.data.rows);
		expect(on.data).not.toHaveProperty("currency");
		expect(log.length).toBe(offStatements + 1);
	});

	it("costs one probe and one bounded lookup per request, whatever the mode", async () => {
		const { run, log } = await build(SHOP);
		for (const mode of ["sequential", "strict", "flexible"] as const) {
			await run({ steps: STEPS, mode });
			const base = log.length;
			await run({ steps: STEPS, mode, withRevenue: true });
			expect(log.length).toBe(base + 2);
			expect(log.filter((s) => s.includes("GROUP BY h.sday, h.sid, h.cur"))).toHaveLength(1);
		}
	});

	it("chunks visit keys so no statement binds more than the D1 limit", () => {
		const keys = Array.from({ length: 2500 }, (_, i) => `20260310|s${i}`);
		const parts = funnelSidStatements(keys, 10);
		expect(parts.map((p) => p.length)).toEqual([970, 970, 560]);
		// Three fixed parameters plus one JSON list per `perParam` keys.
		expect(Math.max(...parts.map((p) => 3 + Math.ceil(p.length / 10)))).toBeLessThanOrEqual(MAX_PARAMS);
		// With the default list size the session cap fits one statement.
		expect(funnelSidStatements(Array.from({ length: 50_000 }, (_, i) => String(i)))).toHaveLength(1);
		expect(FUNNEL_SIDS_PER_PARAM * (MAX_PARAMS - 3)).toBeGreaterThan(50_000);
	});
});
