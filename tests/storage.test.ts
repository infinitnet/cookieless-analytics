/**
 * Storage estimate (`src/query/storage.ts`) against the file growth of the seeded generator and the production
 * D1 figure, the window it allows, and the daily write budget of the `small` profile. Synthetic data only.
 */
import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { budgetState, CHECK_FAST_S, CHECK_SLOW_S, dayBytes, ENTRY_BYTES, estimateStorage, FIXED_ROWS, KV_WRITE_BUDGET, ROWS_PER_EVENT, ROWS_PER_PV, ROWS_PER_VISIT, STORAGE_SAFETY, SUMMARY_ROW_BYTES, VISIT_BYTES, type WriteBudget, writeBudget } from "../src/query/storage.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { meteredDb, schemaDb } from "./helpers.js";

const fileBytes = (raw: Database.Database) => (raw.pragma("page_count", { simple: true }) as number) * (raw.pragma("page_size", { simple: true }) as number);
const S = { rawRetentionDays: 760, rollupRetentionMonths: 25, capacityProfile: "standard" as const };

describe("storage estimate", () => {
	it("lands within 15 percent of the file growth of a generator run with real-site content", async () => {
		const g = await schemaDb();
		const before = fileBytes(g.raw);
		const t = generateTraffic({ pageviews: 3000, seed: 11, spanSeconds: 4 * 86_400, rich: true });
		await recordTraffic(g.db, t);
		const growth = fileBytes(g.raw) - before;
		const v = g.raw.prepare("SELECT COUNT(*) AS visits, SUM(pageviews) + SUM(events) AS entries FROM ca_sessions").get() as { visits: number; entries: number };
		const est = dayBytes(v.visits, v.entries);
		console.info(`[capacity] generator with article paths: ${growth} bytes grown for ${v.visits} visits and ${v.entries} entries (${(growth / 3000).toFixed(0)} per page view), estimate ${est}, ratio ${(est / growth).toFixed(3)}`);
		expect(est / growth).toBeGreaterThan(0.85);
		expect(est / growth).toBeLessThan(1.15);
	}, 120_000);

	it("lands within 15 percent of the production D1 measurement in JSONB (5,000 page views, 1,158 events, 2,124 visits: 1,912,832 bytes as text)", () => {
		// Measured on production D1: JSONB took 17.2 percent less than text documents on the same table.
		const jsonb = 1_912_832 * (1 - 0.172);
		const est = dayBytes(2124, 5000 + 1158);
		expect(est / jsonb).toBeGreaterThan(0.85);
		expect(est / jsonb).toBeLessThan(1.15);
	});

	it("overestimates the small default generator entries (paths like /p/12), which a real site does not have", async () => {
		const g = await schemaDb();
		const before = fileBytes(g.raw);
		await recordTraffic(g.db, generateTraffic({ pageviews: 1500, seed: 11, spanSeconds: 4 * 86_400 }));
		const growth = fileBytes(g.raw) - before;
		const v = g.raw.prepare("SELECT COUNT(*) AS visits, SUM(pageviews) + SUM(events) AS entries FROM ca_sessions").get() as { visits: number; entries: number };
		const ratio = dayBytes(v.visits, v.entries) / growth;
		console.info(`[capacity] default generator: ${growth} bytes grown, estimate ratio ${ratio.toFixed(3)}`);
		// Errs on the safe side: the window shortens early rather than late.
		expect(ratio).toBeGreaterThan(1);
		expect(ratio).toBeLessThan(2);
	}, 120_000);

	it("reads the daily all rows and one day of summary rows, by key, never by scan", async () => {
		const env = await schemaDb();
		const all = env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, sessions, pageviews, events) VALUES (?, ?, 'all', '', ?, ?, ?)");
		all.run("default", "2026-06-13", 100, 200, 30);
		all.run("default", "2026-06-14", 120, 250, 40);
		all.run("client-a", "2026-06-14", 10, 20, 0);
		all.run("default", "2026-06-15", 5, 9, 1);
		const page = env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key) VALUES (?, '2026-06-14', 'page', ?)");
		for (const k of ["/a", "/b", "/c"]) page.run("default", k);
		page.run("client-a", "/x");
		env.raw.prepare("INSERT INTO ca_cube (site, day, channel, country, device) VALUES ('default', 20260614, 'direct', 'DE', 'desktop')").run();
		env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, seg, segkey) VALUES ('default', '2026-06-14', 'page', '/a', 'country', 'DE')").run();
		env.raw.prepare("INSERT INTO ca_revenue_daily (site, day, dim, key, cur, seg, segkey) VALUES ('default', '2026-06-14', 'page', '/a', 'USD', 'device', 'desktop')").run();
		// Link and journey rows: a link x channel pair, a journey step and a link conversion value.
		env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, seg, segkey) VALUES ('default', '2026-06-14', 'link', 'offer', 'channel', 'Direct'), ('default', '2026-06-14', 'next', '/a', '', '/b')").run();
		env.raw.prepare("INSERT INTO ca_revenue_daily (site, day, dim, key, cur) VALUES ('default', '2026-06-14', 'link', 'offer', 'USD')").run();
		// Orders of one cube cell.
		env.raw.prepare("INSERT INTO ca_revenue_daily (site, day, dim, key, cur, seg, segkey) VALUES ('default', '2026-06-14', 'all', '', 'USD', 'cube', 'Direct\u001fDE\u001fdesktop')").run();
		const m = meteredDb(env);
		m.reset();
		const e = await estimateStorage(m.db, S, "2026-06-15");
		const detail = dayBytes(100, 230) + dayBytes(130, 310) + dayBytes(5, 10);
		// Sample day 2026-06-14: 2 all, 4 page, 1 page x country, 1 revenue page x device, 1 cube row, 1 revenue cube row and 3 link and journey rows = 13 summary rows, times 3 days with summaries.
		const summary = Math.round(13 * 3 * SUMMARY_ROW_BYTES * STORAGE_SAFETY);
		expect(e).toMatchObject({ profile: "standard", budget: 6e9, detail: Math.round(detail), summary, bytes: Math.round(detail) + summary, rawDays: 760, capped: false });
		expect(m.stats.statements).toBe(2);
		for (const { sql } of m.log) {
			const params = Array.from({ length: (sql.match(/\?/g) ?? []).length }, () => null);
			const plan = (env.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>).map((p) => p.detail);
			expect(plan.filter((d) => /^SCAN ca_/.test(d))).toEqual([]);
		}
	});

	it("an empty database estimates 0 bytes", async () => {
		const env = await schemaDb();
		expect(await estimateStorage(env.db, S, "2026-06-15")).toMatchObject({ bytes: 0, detail: 0, summary: 0, capped: false });
	});

	it("uses the constants of the formula", () => {
		expect(dayBytes(1, 0)).toBe(VISIT_BYTES * STORAGE_SAFETY);
		expect(dayBytes(0, 1)).toBe(ENTRY_BYTES * STORAGE_SAFETY);
	});
});

describe("write budget of the small profile", () => {
	const NOW = zonedToEpoch("2026-06-15", 14, "UTC");
	const visit = (env: Awaited<ReturnType<typeof schemaDb>>, day: string, started: number, pageviews: number, site = "default", events = 0) =>
		env.raw
			.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, events) VALUES (?, ?, 'v', ?, 0, ?, ?, 1800, ?, ?)")
			.run(site, `s${started}${site}`, day, started, started, pageviews, events);

	it("is off for the other profiles", async () => {
		const env = await schemaDb();
		expect(await budgetState(env.db, env.kv, NOW, "standard")).toBeNull();
		expect(await budgetState(env.db, env.kv, NOW, "dedicated")).toBeNull();
		expect(await env.kv.get(KV_WRITE_BUDGET)).toBeNull();
	});

	it("estimates the UTC day's rows from the page views of visits started since 00:00 UTC, all sites", async () => {
		const env = await schemaDb();
		const midnight = zonedToEpoch("2026-06-15", 0, "UTC");
		visit(env, "2026-06-15", midnight + 60, 1000);
		visit(env, "2026-06-15", midnight + 120, 500, "client-a", 40);
		visit(env, "2026-06-14", midnight - 60, 9999, "default", 9999);
		const b = (await budgetState(env.db, env.kv, NOW, "small")) as WriteBudget;
		expect(b).toEqual({ day: "2026-06-15", at: NOW, visits: 2, pageviews: 1500, events: 40, rows: Math.round(2 * ROWS_PER_VISIT + 1500 * ROWS_PER_PV + 40 * ROWS_PER_EVENT + FIXED_ROWS), limit: 85_000, blocked: false });
		expect(await env.kv.get(KV_WRITE_BUDGET)).toEqual(b);
	});

	it("reads the visits of the local days that overlap the UTC day in the site time zone", async () => {
		const env = await schemaDb();
		const midnight = zonedToEpoch("2026-06-15", 0, "UTC");
		// 01:00 UTC is still 2026-06-14 in New York.
		visit(env, "2026-06-14", midnight + 3600, 700);
		expect((await budgetState(env.db, env.kv, NOW, "small", "UTC"))?.pageviews).toBe(0);
		await env.kv.delete(KV_WRITE_BUDGET);
		expect((await budgetState(env.db, env.kv, NOW, "small", "America/New_York"))?.pageviews).toBe(700);
	});

	it("blocks at 85 percent of the daily rows until the UTC day ends", async () => {
		const one = (pageviews: number) => writeBudget({ visits: 1, pageviews, events: 0 }, "d", 0);
		const limit = one(0).limit;
		const atLimit = Math.ceil((limit - FIXED_ROWS - ROWS_PER_VISIT - 0.5) / ROWS_PER_PV);
		expect(one(atLimit - 1).blocked).toBe(false);
		expect(one(atLimit).blocked).toBe(true);
		// Events count too: the same page views with 3,000 events instead of 1,000 page views cross the limit.
		expect(writeBudget({ visits: 1, pageviews: atLimit - 1000, events: 3000 }, "d", 0).blocked).toBe(true);

		const env = await schemaDb();
		const midnight = zonedToEpoch("2026-06-15", 0, "UTC");
		visit(env, "2026-06-15", midnight + 60, atLimit);
		expect((await budgetState(env.db, env.kv, NOW, "small"))?.blocked).toBe(true);
		// Deleting the visits does not unblock the day; the next UTC day starts over.
		env.raw.exec("DELETE FROM ca_sessions");
		expect((await budgetState(env.db, env.kv, NOW + CHECK_SLOW_S * 5, "small"))?.blocked).toBe(true);
		const next = zonedToEpoch("2026-06-16", 0, "UTC") + 1;
		expect(await budgetState(env.db, env.kv, next, "small")).toMatchObject({ day: "2026-06-16", blocked: false, pageviews: 0 });
	});

	it("answers from the state key while fresh: hourly below a quarter of the limit, every 10 minutes above", async () => {
		const env = await schemaDb();
		const midnight = zonedToEpoch("2026-06-15", 0, "UTC");
		visit(env, "2026-06-15", midnight + 60, 100);
		const m = meteredDb(env);
		m.reset();
		await budgetState(m.db, env.kv, NOW, "small");
		visit(env, "2026-06-15", midnight + 120, 7_500);
		expect((await budgetState(m.db, env.kv, NOW + CHECK_SLOW_S - 1, "small"))?.pageviews).toBe(100);
		expect(m.stats.statements).toBe(1);
		const fresh = (await budgetState(m.db, env.kv, NOW + CHECK_SLOW_S, "small")) as WriteBudget;
		expect(fresh.pageviews).toBe(7_600);
		expect(fresh.rows).toBeGreaterThan(fresh.limit / 4);
		expect(fresh.rows).toBeLessThan(fresh.limit / 2);
		expect((await budgetState(m.db, env.kv, NOW + CHECK_SLOW_S + CHECK_FAST_S - 1, "small"))?.at).toBe(fresh.at);
		expect((await budgetState(m.db, env.kv, NOW + CHECK_SLOW_S + CHECK_FAST_S, "small"))?.at).toBe(NOW + CHECK_SLOW_S + CHECK_FAST_S);
		expect(m.stats.statements).toBe(3);
	});
});
