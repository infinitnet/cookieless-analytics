/** Batched Google backfill: cost on synthetic data under the platform request limit, and equality with the per-day pull. */
import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "../src/core/time.js";
import { startBackfill } from "../src/sources/backfill.js";
import { google } from "../src/sources/gsc.js";
import { clearTokenCache } from "../src/sources/gsc-auth.js";
import { replaceDay } from "../src/sources/store.js";
import { type BackfillState, backfillKey, makeBudget, RETRY_BASE_MS, runSearchTick, stateKey, type SyncCtx, targetOf } from "../src/sources/sync.js";
import { googleSettings, platformLimit, type SyntheticSize, syntheticGoogle } from "./gsc.helpers.js";
import { schemaDb } from "./helpers.js";

const T0 = 1_773_360_000_000; // 2026-03-13T00:00:00Z
const TODAY = "2026-03-13";

/** Run backfill ticks under a request limit until done; totals of the whole run. */
export async function measure(days: number, limit: number, over: Record<string, unknown> = {}, size?: SyntheticSize) {
	const env = await schemaDb();
	const g = syntheticGoogle(size);
	const p = platformLimit(limit);
	let now = T0;
	const ctx: SyncCtx = { http: p.http(g.http), kv: p.kv(env.kv), db: p.db(env.db), settings: googleSettings(over), clients: [], cron: { schedule: async () => undefined }, now: () => now };
	await env.kv.set(stateKey("default", "google"), { lastRun: new Date(T0).toISOString() });
	const to = "2026-03-01";
	const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
	await startBackfill(env.kv, "default", "google", from, to, TODAY);
	let ticks = 0;
	for (; ticks < 5000; ticks++) {
		const b = await env.kv.get<BackfillState>(backfillKey("default", "google"));
		if (b?.done) break;
		p.reset();
		now += 60_000;
		// The runtime fails the whole invocation when a write after the limit is refused; the next tick goes on.
		await runSearchTick(ctx).catch(() => undefined);
	}
	const rows = env.raw.prepare("SELECT SUM(day <= ?) AS n, COUNT(DISTINCT day) AS d FROM ca_search_daily WHERE day <= ?").get(to, to) as { n: number; d: number };
	return { ticks, calls: g.queries().length, ...p.totals, rows: rows.n, days: rows.d, env, g, from, to };
}

describe("batched backfill cost", () => {
	beforeEach(() => clearTokenCache());

	it("reports provider calls and statements per 100 days and ticks for 476 days at a limit of 50", async () => {
		const hundred = await measure(100, 50);
		expect(hundred.days).toBe(100);
		const full = await measure(476, 50);
		expect(full.days).toBe(476);
		console.log(JSON.stringify({ per100: { ticks: hundred.ticks, providerCalls: hundred.calls, fetches: hundred.fetches, statements: hundred.statements, kv: hundred.kv, rows: hundred.rows }, days476: { ticks: full.ticks, providerCalls: full.calls, statements: full.statements, kv: full.kv } }));
	}, 120_000);
});

const ALL = "SELECT site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional FROM ca_search_daily WHERE day <= ? ORDER BY day, page_key, query, country, device";

/** The rows the per-day pull stores for `from`..`to`: one `fetchDay` and one `replaceDay` per day, the behavior before batching. */
async function perDay(from: string, to: string, over: Record<string, unknown>, size: SyntheticSize) {
	const env = await schemaDb();
	const g = syntheticGoogle(size);
	const s = googleSettings(over);
	const target = targetOf(s, "default", undefined, "google");
	for (let d = from; d <= to; d = addDays(d, 1)) await replaceDay(env.db, "default", "google", d, await google.fetchDay({ http: g.http, kv: env.kv, settings: s, budget: makeBudget(() => 0, 1000) }, target, d), false);
	return env.raw.prepare(ALL).all(to);
}

describe("batched backfill equals the per-day pull", () => {
	beforeEach(() => clearTokenCache());

	it("stores exactly the rows of the per-day pull, including days cut at searchMaxRowsPerDay", async () => {
		// Two days carry more page with query rows than the cap of 1000: the batch must cut them per day by clicks like Google does for one day.
		const size: SyntheticSize = { page: 30, query: 60, pageQuery: 80, heavy: { "2026-02-10": 1500, "2026-02-11": 1200 } };
		const over = { searchMaxRowsPerDay: 1000 };
		const batched = await measure(60, 50, over, size);
		expect(batched.g.queries().some((q) => q.body.startDate !== q.body.endDate)).toBe(true);
		const want = await perDay(batched.from, batched.to, over, size);
		expect(want.length).toBeGreaterThan(10_000);
		expect(batched.env.raw.prepare(ALL).all(batched.to)).toEqual(want);
	}, 60_000);

	it("halves the window when a grain fills a page, and the rows still match", async () => {
		// 4,000 page with query rows a day: 8 days are 32,000 rows, more than one page of 25,000.
		const size: SyntheticSize = { page: 30, query: 60, pageQuery: 4000 };
		const r = await measure(12, 1000, { syncSubrequestBudget: 950 }, size);
		const pq = r.g.queries().filter((q) => (q.body.dimensions as string[]).join() === "date,page,query");
		expect(pq.some((q) => q.body.startRow === 25_000)).toBe(true);
		expect((await r.env.kv.get<BackfillState>(backfillKey("default", "google")))?.window).toBe(4);
		expect(r.env.raw.prepare(ALL).all(r.to)).toEqual(await perDay(r.from, r.to, {}, size));
	}, 60_000);

	it("a load error halves the window, keeps the cursor and retries after a pause", async () => {
		const env = await schemaDb();
		let fail = true;
		const g = syntheticGoogle(undefined, { fail: (b) => (fail && b.startDate !== b.endDate ? 503 : undefined) });
		const scheduled: string[] = [];
		let now = T0;
		const ctx: SyncCtx = { http: g.http, kv: env.kv, db: env.db, settings: googleSettings(), clients: [], cron: { schedule: async (_n, o) => void scheduled.push(o.schedule) }, now: () => now };
		await env.kv.set(stateKey("default", "google"), { lastRun: new Date(T0).toISOString() });
		await startBackfill(env.kv, "default", "google", "2026-01-01", "2026-01-31", TODAY);
		const r = await runSearchTick(ctx);
		expect(r).toMatchObject({ done: true, continued: true });
		const b = await env.kv.get<BackfillState>(backfillKey("default", "google"));
		expect(b).toMatchObject({ cursor: "2026-01-01", window: 4, error: "Search Console answered 503 (PERMISSION_DENIED).", retryAt: T0 + RETRY_BASE_MS });
		expect(scheduled).toEqual([new Date(T0 + RETRY_BASE_MS).toISOString()]);
		// Before the pause ends nothing is pulled.
		now += 60_000;
		const calls = g.queries().length;
		await runSearchTick(ctx);
		expect(g.queries()).toHaveLength(calls);
		fail = false;
		now = T0 + RETRY_BASE_MS;
		await runSearchTick(ctx);
		const after = await env.kv.get<BackfillState>(backfillKey("default", "google"));
		expect(after).toMatchObject({ error: null, retryAt: 0 });
		expect(after?.cursor && after.cursor > "2026-01-08").toBe(true);
	});
});
