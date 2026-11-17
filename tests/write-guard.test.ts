/** The write guard of the `small` profile: stops ingest at the configured figure until the next UTC day. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetWriteGuard, writesBlocked } from "../src/core/apply.js";
import { drops } from "../src/core/drops.js";
import { resetCounters } from "../src/core/recorder.js";
import { zonedToEpoch } from "../src/core/time.js";
import { budgetState, CHECK_FAST_S, FIXED_ROWS, FREE_ROWS_PER_DAY, GUARD_SHARE, KV_WRITE_BUDGET, ROWS_PER_EVENT, ROWS_PER_PV, ROWS_PER_VISIT, type WriteBudget } from "../src/query/storage.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { inRoute } from "../src/routes/in.js";
import { normalizeSettings } from "../src/settings.js";
import { dropsOf } from "./drops.helpers.js";
import { eventRequest, meteredDb, schemaDb } from "./helpers.js";
import { ctx, fakeEnv } from "./routes.helpers.js";

const T = zonedToEpoch("2026-06-10", 12, "UTC");
/** The largest page view count of one visit (no events) below the guard: 85,000 rows less 2,500 fixed and the visit's 2. */
const LAST_OPEN = Math.ceil((FREE_ROWS_PER_DAY * GUARD_SHARE - FIXED_ROWS - ROWS_PER_VISIT - 0.5) / ROWS_PER_PV) - 1;
/** Estimated rows of `v` visits, `pv` page views and `ev` events. */
const rowsOf = (v: number, pv: number, ev = 0) => Math.round(v * ROWS_PER_VISIT + pv * ROWS_PER_PV + ev * ROWS_PER_EVENT + FIXED_ROWS);

let env: Awaited<ReturnType<typeof schemaDb>>;
beforeEach(async () => {
	resetCounters();
	resetWriteGuard();
	drops.windowMs = 0;
	env = await schemaDb();
});

/** One earlier visit today holding `pv` page views. */
function seedPageviews(pv: number) {
	env.raw
		.prepare("INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, pageviews) VALUES ('default', '2026-06-10', 'zzzzzzzzzzzzzzzzzzzz', 'k', 11, ?, ?, 1800, ?)")
		.run(T - 3600, T - 3600, pv);
}

let n = 0;
async function post(now: number) {
	const f = fakeEnv(env, { capacityProfile: "small" }, now);
	const h = `h${String(++n).padStart(11, "0")}`;
	const req = eventRequest({ v: 1, t: "pv", sid: `s${String(n).padStart(19, "0")}`, n: 1, h, u: "/a", r: "", w: 1440 });
	const res = await inRoute(f.env).handler(ctx(req, await req.clone().text(), env.kv));
	return { res, f, retryAfter: res.headers.find(([k]: [string, string]) => k === "retry-after")?.[1] };
}
const pageviews = () => (env.raw.prepare("SELECT SUM(pageviews) AS n FROM ca_sessions").get() as { n: number }).n;

describe("write guard", () => {
	it("figures: one visit of 31,730 page views stays open; the production mix stops at about 25,000 page views, about 21,380 with the day's retention deletes", () => {
		expect(LAST_OPEN).toBe(31_730);
		expect(rowsOf(1, LAST_OPEN)).toBeLessThan(85_000);
		expect(rowsOf(1, LAST_OPEN + 1)).toBeGreaterThanOrEqual(85_000);
		// Production mix (0.464 visits and 0.231 events per page view), docs/limits.md.
		const mix = (pv: number, deletes = 0) => rowsOf(Math.round(pv * 0.464), pv, Math.round(pv * 0.231)) + deletes;
		expect([mix(25_037), mix(25_038)]).toEqual([84_997, 85_001]);
		// Steady state: retention deletes about 0.564 rows per page view of an earlier day (a visit and 0.1 aliases).
		expect([mix(21_378, Math.round(21_378 * 0.564)), mix(21_379, Math.round(21_379 * 0.564))]).toEqual([84_997, 85_002]);
		// An event-heavy site: 10 events per page view stops near 6,300 page views.
		const heavy = (pv: number) => rowsOf(Math.round(pv * 0.464), pv, pv * 10);
		expect(heavy(6_300)).toBeLessThan(85_000);
		expect(heavy(6_400)).toBeGreaterThanOrEqual(85_000);
	});

	it("the estimate follows the rows meter on generated traffic, events included", async () => {
		for (const eventsPerPv of [0.231, 3]) {
			const e = await schemaDb();
			const m = meteredDb(e);
			m.reset();
			const traffic = generateTraffic({ pageviews: 600, seed: 11, eventsPerPv, start: T - 6 * 3600, spanSeconds: 4 * 3600 });
			await recordTraffic(m.db, traffic, normalizeSettings({ maxEventsPerSession: 10_000 }));
			const metered = m.stats.rowsWritten;
			const b = (await budgetState(m.db, e.kv, T, "small")) as WriteBudget;
			expect([b.visits, b.pageviews, b.events]).toEqual([traffic.counts.sessions, 600, traffic.counts.events]);
			const estimate = b.rows - FIXED_ROWS;
			process.stdout.write(`[guard] events per pv ${eventsPerPv}: metered ${metered}, estimate ${estimate}, ratio ${(estimate / metered).toFixed(3)}\n`);
			expect(estimate / metered).toBeGreaterThan(0.97);
			expect(estimate / metered).toBeLessThan(1.03);
		}
	});

	it("accepts below the figure, stops at it with a 503 without Retry-After counted as budget_blocked, and resumes the next UTC day", async () => {
		seedPageviews(LAST_OPEN);
		const open = await post(T);
		expect(open.res.status).toBe(204);
		expect(pageviews()).toBe(LAST_OPEN + 1);
		// The isolate keeps the open state until the next check (10 minutes above a quarter of the limit).
		expect((await post(T + CHECK_FAST_S - 1)).res.status).toBe(204);
		const stop = await post(T + CHECK_FAST_S);
		expect([stop.res.status, stop.retryAfter]).toEqual([503, undefined]);
		expect(pageviews()).toBe(LAST_OPEN + 2);
		expect(await env.kv.get<WriteBudget>(KV_WRITE_BUDGET)).toMatchObject({ day: "2026-06-10", blocked: true, rows: rowsOf(2, LAST_OPEN + 2) });
		// Blocked until 00:00 UTC, whatever the time of the check.
		expect((await post(T + 11 * 3600 + 3599)).res.status).toBe(503);
		const next = await post(zonedToEpoch("2026-06-11", 0, "UTC") + 1);
		expect(next.res.status).toBe(204);
		expect(await env.kv.get<WriteBudget>(KV_WRITE_BUDGET)).toMatchObject({ day: "2026-06-11", blocked: false, pageviews: 0 });
		expect(await dropsOf(env)).toEqual({ budget_blocked: 2 });
	});

	it("a blocked event costs 0 statements and 0 state reads after the first state read", async () => {
		seedPageviews(LAST_OPEN + 1);
		expect((await post(T)).res.status).toBe(503);
		const calls = [vi.spyOn(env.db, "run"), vi.spyOn(env.db, "all"), vi.spyOn(env.db, "batch"), vi.spyOn(env.kv, "get"), vi.spyOn(env.kv, "set")];
		for (let i = 0; i < 5; i++) {
			const r = await post(T + 60 * i);
			expect([r.res.status, r.retryAfter]).toEqual([503, undefined]);
		}
		for (const c of calls) expect(c).not.toHaveBeenCalled();
		// Six refusals, one flush statement.
		await dropsOf(env);
		expect(calls[0]).toHaveBeenCalledOnce();
		expect(await dropsOf(env)).toEqual({ budget_blocked: 6 });
		expect(pageviews()).toBe(LAST_OPEN + 1);
	});

	it("only the small profile is guarded; the others never read the state", async () => {
		const get = vi.spyOn(env.kv, "get");
		for (const profile of ["standard", "dedicated"] as const) expect(await writesBlocked(env.db, { kv: env.kv, profile, tz: "UTC" }, T)).toBe(false);
		expect(get).not.toHaveBeenCalled();
	});

	it("small on Postgres never blocks writes: the D1 Free plan's daily rows do not apply there", async () => {
		seedPageviews(LAST_OPEN + 1);
		const pg = { ...env.db, dialect: "postgres" as const };
		const get = vi.spyOn(env.kv, "get");
		expect(await writesBlocked(pg, { kv: env.kv, profile: "small", tz: "UTC" }, T)).toBe(false);
		expect(await budgetState(pg, env.kv, T, "small")).toBeNull();
		expect(get).not.toHaveBeenCalled();
		// The same rows on D1 block.
		expect(await writesBlocked(env.db, { kv: env.kv, profile: "small", tz: "UTC" }, T)).toBe(true);
	});
});

describe("write guard failures", () => {
	it("a failed check lets writes through for a minute instead of stopping ingest", async () => {
		seedPageviews(LAST_OPEN + 1);
		const get = vi.spyOn(env.kv, "get").mockRejectedValueOnce(new Error("D1 DB is overloaded. Too many requests queued."));
		expect((await post(T)).res.status).toBe(204);
		expect((await post(T + 59)).res.status).toBe(204);
		expect(get.mock.calls.filter(([k]) => k === KV_WRITE_BUDGET)).toHaveLength(1); // no second check inside the minute
		expect((await post(T + 60)).res.status).toBe(503);
	});
});
