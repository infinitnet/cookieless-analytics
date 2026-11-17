/** Rows-written budget of the Search syncs: measured rows per row, paced backfill on `small`, ingest priority, ranges. */
import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "../src/core/time.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { budgetState, FIXED_ROWS, FREE_ROWS_PER_DAY, GUARD_SHARE, KV_WRITE_BUDGET, ROWS_PER_PV, ROWS_PER_VISIT } from "../src/query/storage.js";
import { type SearchCtx, searchRoutes } from "../src/routes/search.js";
import { backfillStatus, startBackfill } from "../src/sources/backfill.js";
import { BACKFILL_OPTIONS, backfillEstimate, backfillRange, GUARD_ROWS, KV_SYNC_ROWS, nextUtcDay, PROVIDER_DAYS, ROWS_PER_DELETE, ROWS_PER_INSERT, SYNC_BUDGET, utcDay } from "../src/sources/budget.js";
import { clearTokenCache } from "../src/sources/gsc-auth.js";
import { replaceDays, replaceStatements, writeReplace } from "../src/sources/store.js";
import { type BackfillState, backfillKey, runSearchTick, type SyncCtx, stateKey, syncRows } from "../src/sources/sync.js";
import type { SearchRow } from "../src/sources/types.js";
import { googleSettings, syntheticDay, syntheticGoogle } from "./gsc.helpers.js";
import { meteredDb, schemaDb } from "./helpers.js";

const T0 = Date.parse("2026-03-13T00:30:00Z");
const SHARE = SYNC_BUDGET.small.daily;
const row = (i: number): SearchRow => ({ page_key: `/p${i}`, query: `q ${i}`, country: "DEU", device: "MOBILE", clicks: i % 7, impressions: 10 + i, pos_sum: 3 * (10 + i) });

/** A metered schema Db, the synthetic Google and a fake clock; `ctx()` builds a fresh context (a restarted Worker) each call. */
async function harness(over: Record<string, unknown> = {}) {
	const env = await schemaDb();
	const meter = meteredDb(env);
	const g = syntheticGoogle();
	const clock = { now: T0, scheduled: null as number | null };
	const settings = googleSettings({ capacityProfile: "small", ...over });
	const ctx = (): SyncCtx => ({
		http: g.http,
		kv: env.kv,
		db: meter.db,
		settings,
		clients: [],
		now: () => clock.now,
		cron: { schedule: async (_n, o) => void (clock.scheduled = Date.parse(o.schedule)) },
	});
	// The sync window is fresh, so ticks run the backfill alone until it is due again.
	await env.kv.set(stateKey("default", "google"), { lastRun: new Date(T0).toISOString() });
	const days = () => env.raw.prepare("SELECT COUNT(DISTINCT day) AS n FROM ca_search_daily").get() as { n: number };
	const visits = (pageviews: number) =>
		env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews) VALUES ('default', ?, 'v', ?, 0, ?, ?, 1800, ?)").run(`s${clock.now}`, utcDay(clock.now), Math.floor(clock.now / 1000), Math.floor(clock.now / 1000), pageviews);
	return { env, meter, g, clock, settings, ctx, days, visits };
}

/** Rows of one synthetic day as the store keeps them (one row per key of every grain). */
const syntheticRows = (day: string) => [[], ["page"], ["query"], ["page", "query"], ["country"], ["device"]].reduce((n, dims) => n + syntheticDay(day, ["date", ...dims]).length, 0);

describe("rows written per stored search row (counting Db)", () => {
	it("measures 2 per new row (WITHOUT ROWID table plus the page index) and 1 more per row written again", async () => {
		const env = await schemaDb();
		const m = meteredDb(env);
		const days = new Map([
			["2026-03-01", Array.from({ length: 40 }, (_, i) => row(i))],
			["2026-03-02", Array.from({ length: 25 }, (_, i) => row(i))],
		]);
		const first = replaceStatements(m.db.dialect, "default", "google", days, () => false);
		m.reset();
		expect(await writeReplace(m.db, first.stmts, first.rows)).toBe(m.stats.rowsWritten);
		expect(m.stats.rowsWritten).toBe(65 * ROWS_PER_INSERT);
		expect(ROWS_PER_INSERT).toBe(2);
		m.reset();
		const again = replaceStatements(m.db.dialect, "default", "google", days, () => false);
		expect(await writeReplace(m.db, again.stmts, again.rows)).toBe(m.stats.rowsWritten);
		expect(m.stats.rowsWritten).toBe(65 * (ROWS_PER_DELETE + ROWS_PER_INSERT));
		// The D1 meta wins when the Db reports it.
		const meta = { ...m.db, meta: { rows_written: 7 } };
		expect(await writeReplace(meta, again.stmts, again.rows)).toBe(14);
		expect(await replaceDays(m.db, "default", "google", new Map(), () => false)).toBe(0);
	});

	it("states one budget table: small is a quarter of the 85,000 guard and pauses at 60 percent of it", () => {
		expect(GUARD_ROWS).toBe(FREE_ROWS_PER_DAY * GUARD_SHARE);
		expect(SYNC_BUDGET).toEqual({ small: { daily: 21_250, pauseAt: 51_000 }, standard: { daily: 500_000, pauseAt: null }, dedicated: { daily: 1_000_000, pauseAt: null } });
		expect(backfillEstimate(476, 186, "small")).toEqual({ days: 476, rows: 177_072, budgets: 9 });
		expect(backfillEstimate(476, 186, "standard").budgets).toBe(1);
		expect(backfillEstimate(0, 186, "small")).toEqual({ days: 0, rows: 0, budgets: 0 });
	});
});

describe("paced backfill on the small profile", () => {
	beforeEach(() => clearTokenCache());

	it("stores 476 days across the right number of UTC days, never above the daily share, counting the rows it writes", async () => {
		const h = await harness();
		const to = "2026-03-01";
		const from = addDays(to, -475);
		await startBackfill(h.env.kv, "default", "google", from, to, "2026-03-13", T0);
		const perDay = new Map<string, number>();
		let ticks = 0;
		let resumed = 0;
		for (; ticks < 2000; ticks++) {
			const b = await h.env.kv.get<BackfillState>(backfillKey("default", "google"));
			if (b?.done) break;
			h.clock.scheduled = null;
			const before = h.meter.stats.rowsWritten;
			const day = utcDay(h.clock.now);
			// A fresh context per tick: every tick is a restarted Worker that reads its state from KV.
			const r = await runSearchTick(h.ctx());
			const written = h.meter.stats.rowsWritten - before;
			expect(r.rows).toBe(written);
			perDay.set(day, (perDay.get(day) ?? 0) + written);
			expect(((await h.env.kv.get<{ day: string; rows: number }>(KV_SYNC_ROWS)) as { rows: number }).rows).toBe(perDay.get(day));
			if (r.pausedUntil) {
				expect(r.pausedUntil).toBe(nextUtcDay(h.clock.now));
				expect((await backfillStatus(h.env.kv, "default", "google", h.clock.now))?.nextAt).toBe(r.pausedUntil);
				resumed++;
			}
			h.clock.now = Math.max(h.clock.now + 60_000, h.clock.scheduled ?? 0);
		}
		expect(h.days().n).toBeGreaterThanOrEqual(476);
		const backfillRows = Array.from({ length: 476 }, (_, i) => syntheticRows(addDays(from, i))).reduce((a, n) => a + n, 0);
		const total = [...perDay.values()].reduce((a, n) => a + n, 0);
		expect(total).toBeGreaterThanOrEqual(backfillRows * ROWS_PER_INSERT);
		for (const [day, n] of perDay) expect(n, day).toBeLessThanOrEqual(SHARE);
		// Each UTC day fills its share up to the next day's cost (at most about 560 rows here): the fewest days possible, or one more.
		const least = Math.ceil(total / SHARE);
		expect(perDay.size).toBeGreaterThanOrEqual(least);
		expect(perDay.size).toBeLessThanOrEqual(Math.ceil(total / (SHARE - 600)));
		expect(resumed).toBe(perDay.size - 1);
		console.log(JSON.stringify({ days: 476, rowsPerDay: Math.round(backfillRows / 476), backfillRows: backfillRows * ROWS_PER_INSERT, totalWritten: total, utcDays: perDay.size, ticks, maxPerDay: Math.max(...perDay.values()) }));

		// Done: an idle tick writes nothing.
		const idle = h.meter.stats.rowsWritten;
		expect((await runSearchTick(h.ctx())).rows).toBe(0);
		expect(h.meter.stats.rowsWritten).toBe(idle);
	}, 120_000);

	it("pauses at 00:00 UTC once the share is used, and continues after the day boundary with a fresh share", async () => {
		const h = await harness();
		await startBackfill(h.env.kv, "default", "google", "2025-11-01", "2026-03-01", "2026-03-13", T0);
		h.clock.now = Date.parse("2026-03-13T23:50:00Z");
		let r = await runSearchTick(h.ctx());
		while (!r.pausedUntil) {
			h.clock.now += 60_000;
			r = await runSearchTick(h.ctx());
		}
		expect(r.pausedUntil).toBe(Date.parse("2026-03-14T00:00:00Z"));
		expect(h.clock.now).toBeLessThan(r.pausedUntil);
		// Before midnight: paused, nothing written.
		h.clock.now = r.pausedUntil - 1_000;
		expect((await runSearchTick(h.ctx())).rows).toBe(0);
		h.clock.now = r.pausedUntil;
		expect((await runSearchTick(h.ctx())).rows).toBeGreaterThan(0);
		expect(await h.env.kv.get(KV_SYNC_ROWS)).toMatchObject({ day: "2026-03-14" });
	});

	it("resumes after a restart with the day's rows already used, and cancel stops the writes", async () => {
		const h = await harness();
		await startBackfill(h.env.kv, "default", "google", "2025-11-01", "2026-03-01", "2026-03-13", T0);
		const first = await runSearchTick(h.ctx());
		expect(first.rows).toBeGreaterThan(0);
		// A new Worker: the day's rows come from KV, not from zero.
		const a = await syncRows(h.ctx()).allowance();
		expect(a.used).toBe(first.rows);
		const cursor = (await h.env.kv.get<BackfillState>(backfillKey("default", "google")))?.cursor as string;
		h.clock.now += 60_000;
		await runSearchTick(h.ctx());
		const after = (await h.env.kv.get<BackfillState>(backfillKey("default", "google")))?.cursor as string;
		expect(after > cursor).toBe(true);
		// Days before the cursor are never written again.
		expect(h.meter.log.filter((e) => e.sql.startsWith("DELETE") && e.written > 0)).toEqual([]);
		await h.env.kv.delete(backfillKey("default", "google"));
		h.clock.now += 60_000;
		const before = h.meter.stats.rowsWritten;
		expect((await runSearchTick(h.ctx())).rows).toBe(0);
		expect(h.meter.stats.rowsWritten).toBe(before);
	});
});

describe("ingest keeps priority on the small profile", () => {
	beforeEach(() => clearTokenCache());

	it("syncs write only up to 60 percent of the guard with today's ingest, pause above it, and the write guard sees their rows", async () => {
		const h = await harness();
		await startBackfill(h.env.kv, "default", "google", "2025-01-01", "2026-03-01", "2026-03-13", T0);
		// One visit of 14,422 page views: about 40,000 rows of ingest today, so the syncs have 11,000 left (51,000 minus 40,000).
		h.visits(14_422);
		const a = await syncRows(h.ctx()).allowance();
		expect(a.ingest).toBe(Math.round(ROWS_PER_VISIT + 14_422 * ROWS_PER_PV + FIXED_ROWS));
		expect(a.left).toBe(51_000 - (a.ingest as number));
		let used = 0;
		for (let i = 0; i < 200; i++) {
			const r = await runSearchTick(h.ctx());
			used += r.rows;
			if (r.pausedUntil) break;
			h.clock.now += 60_000;
		}
		expect(used).toBeGreaterThan(0);
		expect(used).toBeLessThanOrEqual(51_000 - (a.ingest as number));
		// The write guard counts the sync rows and is still far from blocking ingest.
		await h.env.kv.delete(KV_WRITE_BUDGET);
		const w = await budgetState(h.meter.db, h.env.kv, Math.floor(h.clock.now / 1000), "small", "UTC");
		expect(w).toMatchObject({ sync: used, blocked: false });
		expect(w?.rows).toBe((a.ingest as number) + used);
		expect(w?.rows).toBeLessThanOrEqual(51_000);
	});

	it("a busy ingest day pauses the syncs at once: 0 rows, next try at 00:00 UTC", async () => {
		const h = await harness();
		await startBackfill(h.env.kv, "default", "google", "2025-11-01", "2026-03-01", "2026-03-13", T0);
		// 18,700 page views: about 51,100 rows of ingest, past the 51,000 pause line.
		h.visits(18_700);
		const before = h.meter.stats.rowsWritten;
		const r = await runSearchTick(h.ctx());
		expect(r).toMatchObject({ rows: 0, pausedUntil: Date.parse("2026-03-14T00:00:00Z"), done: false });
		expect(h.meter.stats.rowsWritten).toBe(before);
		expect(h.g.queries()).toHaveLength(0);
	});

	it("standard has no pause line and ignores ingest", async () => {
		const h = await harness({ capacityProfile: "standard" });
		h.visits(50_000);
		expect(await syncRows(h.ctx()).allowance()).toMatchObject({ budget: 500_000, left: 500_000, paused: false, ingest: null });
	});
});

describe("backfill range", () => {
	beforeEach(() => {
		clearTokenCache();
		invalidateRegistry();
	});

	it("each option computes its from-date; everything is the provider limit; a longer range clamps", () => {
		const y = "2026-03-12";
		expect(BACKFILL_OPTIONS.map((o) => [o.label, backfillRange({ days: o.days }, "google", y, 800).from])).toEqual([
			["Last 30 days", "2026-02-11"],
			["Last 90 days", "2025-12-13"],
			["Last 180 days", "2025-09-14"],
			["Last 12 months", "2025-03-13"],
			["Everything the source offers", "2024-11-08"],
		]);
		expect(backfillRange({ days: 0 }, "bing", y, 800)).toEqual({ from: addDays(y, 1 - PROVIDER_DAYS.bing), to: y, clamped: false });
		expect(backfillRange({ days: 365 }, "bing", y, 800)).toEqual({ from: "2025-09-14", to: y, clamped: true });
		expect(backfillRange({ from: "2020-01-01" }, "google", y, 800)).toEqual({ from: "2024-11-08", to: y, clamped: true });
		expect(backfillRange({ days: 400 }, "google", y, 90).from).toBe(addDays(y, -89));
		expect(googleSettings().backfillDays).toBe(90);
	});

	/** Ticks until the backfill is done, jumping to each scheduled continuation (00:00 UTC when paused). */
	async function drain(h: Awaited<ReturnType<typeof harness>>) {
		for (let i = 0; i < 200; i++) {
			if ((await h.env.kv.get<BackfillState>(backfillKey("default", "google")))?.done) return;
			h.clock.scheduled = null;
			await runSearchTick(h.ctx());
			h.clock.now = Math.max(h.clock.now + 60_000, h.clock.scheduled ?? 0);
		}
	}

	async function routes(over: Record<string, unknown> = {}) {
		const h = await harness(over);
		const stored: Record<string, unknown> = { capacityProfile: over.capacityProfile ?? "small", gscProperty: "" };
		const r = searchRoutes({ db: async () => h.meter.db, settings: async () => googleSettings(stored), now: () => h.clock.now });
		const call = async (name: keyof typeof r, input: unknown) =>
			(await r[name].handler({ input, kv: h.env.kv, http: h.g.http, settings: { set: async (k, v) => void (stored[k] = v) }, cron: { schedule: async () => undefined } } as SearchCtx)) as Record<string, any>;
		return { ...h, call, stored };
	}

	it("the route defaults to backfillDays (90), takes days or from, clamps, and extends from the oldest stored day without rewriting", async () => {
		const h = await routes();
		h.stored.gscProperty = "sc-domain:example.com";
		expect(await h.call("search/backfill", { action: "start", days: 0 })).toMatchObject({ from: "2024-11-08", clamped: false, backfill: { from: "2024-11-08", to: "2026-03-12" } });
		expect(await h.call("search/backfill", { action: "start", from: "2023-01-01" })).toMatchObject({ from: "2024-11-08", clamped: true });
		await expect(h.call("search/backfill", { action: "start", days: 30, from: "2026-01-01" })).rejects.toMatchObject({ code: "invalid_range" });
		expect(await h.call("search/backfill", { action: "start" })).toMatchObject({ from: "2025-12-13", backfill: { to: "2026-03-12", days: 90 } });
		// Store 30 days, then extend to 90: the new range ends the day before the oldest stored day.
		await h.call("search/backfill", { action: "start", days: 30 });
		await drain(h);
		expect(h.days().n).toBe(30);
		const ext = await h.call("search/backfill", { action: "start", days: 90 });
		expect(ext).toMatchObject({ stored: false, backfill: { from: "2025-12-13", to: "2026-02-10", days: 60 } });
		// Keep the regular sync window out of this count (it rewrites the newest days on its own schedule).
		await h.env.kv.set(stateKey("default", "google"), { lastRun: "2027-01-01T00:00:00.000Z" });
		h.meter.reset();
		await drain(h);
		expect(h.days().n).toBe(90);
		// 0 rows written for the stored days: no row was deleted.
		expect(h.meter.log.filter((e) => e.sql.startsWith("DELETE")).reduce((a, e) => a + e.written, 0)).toBe(0);
		// Everything already stored: nothing to start.
		expect(await h.call("search/backfill", { action: "start", days: 30 })).toMatchObject({ stored: true, backfill: null });
	});

	it("the first connect starts the default range except on small", async () => {
		const small = await routes();
		expect(await small.call("search/map", { source: "google", property: "sc-domain:example.com" })).toMatchObject({ backfill: null });
		expect(await small.env.kv.get(backfillKey("default", "google"))).toBeNull();
		const std = await routes({ capacityProfile: "standard" });
		expect(await std.call("search/map", { source: "google", property: "sc-domain:example.com" })).toMatchObject({ backfill: { from: "2025-12-13", to: "2026-03-12", days: 90 } });
		// A later mapping change does not start another one.
		await std.env.kv.delete(backfillKey("default", "google"));
		expect(await std.call("search/map", { source: "google", property: "https://example.com/" })).toMatchObject({ backfill: null });
	});

	it("a file import counts its rows, stores only the backfill range, and is refused whole when it does not fit today", async () => {
		const h = await routes({ bingEnabled: true, bingApiKey: "abcdefghijklmnop1234", bingSiteUrl: "https://example.com/" });
		Object.assign(h.stored, { bingEnabled: true, bingApiKey: "abcdefghijklmnop1234", bingSiteUrl: "https://example.com/", backfillDays: 30 });
		const csv = (n: number, day: string) => `Keyword,Clicks,Impressions,Date\n${Array.from({ length: n }, (_, i) => `query ${i},1,10,${day}`).join("\n")}\n`;
		const r = await h.call("search/import", { csv: `${csv(3, "2026-03-05")}old,1,1,2026-01-05\n` });
		// 2026-01-05 is older than the 30 day backfill range.
		expect(r).toMatchObject({ rows: 3, skipped: 1 });
		expect((await h.env.kv.get<{ rows: number }>(KV_SYNC_ROWS))?.rows).toBe(3 * ROWS_PER_INSERT);
		// 8,000 rows are up to 24,000 rows written: more than the small share of 21,250.
		await expect(h.call("search/import", { csv: csv(8_000, "2026-03-04") })).rejects.toMatchObject({ code: "write_budget" });
		expect(h.env.raw.prepare("SELECT COUNT(*) AS n FROM ca_search_daily WHERE day = '2026-03-04'").get()).toEqual({ n: 0 });
	});

	it("status reports the day's sync rows, the budget and rows per stored day", async () => {
		const h = await routes();
		h.stored.gscProperty = "sc-domain:example.com";
		await h.call("search/sync", { source: "google" });
		const s = await h.call("search/status", {});
		expect(s.budget).toMatchObject({ profile: "small", daily: 21_250, defaultDays: 90, retentionDays: 800 });
		expect(s.budget.usedToday).toBeGreaterThan(0);
		expect(s.sources[0]).toMatchObject({ limitDays: 490 });
		expect(s.sources[0].perDay).toBeGreaterThan(150);
	});
});
