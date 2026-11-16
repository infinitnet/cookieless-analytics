/**
 * Retention: per-table cutoffs, key-range deletes, request budget and resume cursor, the window the
 * storage estimate allows, rows read per row deleted, search and salts. Synthetic data only.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, dayInZone, zonedToEpoch } from "../src/core/time.js";
import { dayInt } from "../src/db/dialect.js";
import { KV_WATERMARK } from "../src/query/rollup.js";
import { addMonths, cleanSalts, effectiveRawDays, KV_CURSOR, rawFromDay, type RetentionCursor, runRetention, SMALL_DAY_ROWS, SMALL_TICK_ROWS, sitesInTables, deletedToday } from "../src/query/retention.js";
import { budgetState, dayBytes, FIXED_ROWS } from "../src/query/storage.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { meteredDb, schemaDb } from "./helpers.js";

const TODAY = "2026-06-15";
const NOW = zonedToEpoch(TODAY, 12, "UTC");
const S = { siteTimezone: "UTC", rawRetentionDays: 90, rollupRetentionMonths: 25, searchRetentionDays: 800, capacityProfile: "standard" as const };
const ago = (n: number) => addDays(TODAY, -n);

type Env = Awaited<ReturnType<typeof schemaDb>>;
let seq = 0;

function session(env: Env, day: string, site = "default", sid = `s${String(++seq).padStart(4, "0")}`) {
	env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s) VALUES (?, ?, 'v', ?, 0, 0, 0, 1800)").run(site, sid, day);
}
const count = (env: Env, sql: string, ...p: unknown[]) => (env.raw.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...p) as { n: number }).n;

/** Rows on both sides of every cutoff, plus another site's rows that get the same cutoffs. */
function fill(env: Env) {
	for (const d of [ago(100), ago(91), ago(90), ago(1)]) for (let i = 0; i < 2; i++) session(env, d);
	session(env, ago(300), "other");
	session(env, ago(1), "other");
	const ev = env.raw.prepare("INSERT INTO ca_events (site, id, day, ts, name) VALUES (?, ?, ?, 0, 'order')");
	for (const d of [ago(120), ago(91), ago(5)]) ev.run("default", `e${++seq}`, dayInt(d));
	const srv = env.raw.prepare("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', ?, 404, ?, '', 1, 0)");
	for (const d of [ago(120), ago(5)]) for (const p of ["/a", "/b"]) srv.run(dayInt(d), p);
	const drops = env.raw.prepare("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', ?, 'bot', 3)");
	for (const d of [ago(95), ago(2)]) drops.run(dayInt(d));
	const alias = env.raw.prepare("INSERT INTO ca_aliases (site, sid, canon, expires) VALUES ('default', ?, 'c', ?)");
	alias.run("a1", NOW - 10);
	alias.run("a2", NOW + 10);
	const roll = env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key) VALUES ('default', ?, ?, ?)");
	for (const d of [addMonths(TODAY, -26), addMonths(TODAY, -25), ago(10)]) for (const k of ["a", "b"]) for (const dim of ["page", "country"]) roll.run(d, dim, k);
	const cube = env.raw.prepare("INSERT INTO ca_cube (site, day, channel, country, device) VALUES ('default', ?, 'direct', ?, 'desktop')");
	for (const d of [addMonths(TODAY, -26), ago(10)]) for (const c of ["DE", "FR"]) cube.run(dayInt(d), c);
	const search = env.raw.prepare("INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device) VALUES ('default', ?, ?, ?, '', '', '')");
	for (const src of ["google", "bing"]) for (const d of [ago(802), ago(801), ago(800), ago(3)]) for (const k of ["", "/a"]) search.run(src, d, k);
	const rev = env.raw.prepare("INSERT INTO ca_revenue_daily (site, day, dim, key, cur) VALUES ('default', ?, 'all', '', ?)");
	for (const d of [addMonths(TODAY, -26), addMonths(TODAY, -25), ago(10)]) for (const c of ["USD", "EUR"]) rev.run(d, c);
}

const runAll = async (env: Env, s = S, o = {}) => {
	let r = await runRetention(env.db, env.kv, s, NOW, o);
	for (let i = 0; i < 200 && !r.done; i++) r = await runRetention(env.db, env.kv, s, NOW, o);
	return r;
};

const EXPECTED = { sessions: 5, events: 2, srv: 2, drops: 1, aliases: 1, cube: 2, rollup: 4, revenue: 2, search: 8 };

describe("retention", () => {
	let env: Env;
	beforeEach(async () => {
		env = await schemaDb();
		fill(env);
		await env.kv.set(KV_WATERMARK, ago(2));
	});

	it("deletes only rows older than each table's cutoff", async () => {
		const r = await runAll(env);
		expect(r.done).toBe(true);
		expect(count(env, "ca_sessions WHERE site = 'default'")).toBe(4);
		expect(count(env, "ca_sessions WHERE site = 'default' AND day < ?", ago(90))).toBe(0);
		expect(count(env, "ca_events")).toBe(1);
		expect(count(env, "ca_srv")).toBe(2);
		expect(count(env, "ca_drops")).toBe(1);
		expect(count(env, "ca_aliases")).toBe(1);
		expect(count(env, "ca_rollup WHERE day < ?", addMonths(TODAY, -25))).toBe(0);
		expect(count(env, "ca_rollup")).toBe(8);
		expect(count(env, "ca_cube")).toBe(2);
		expect(count(env, "ca_search_daily WHERE day < ?", ago(800))).toBe(0);
		expect(count(env, "ca_search_daily")).toBe(8);
		expect(count(env, "ca_revenue_daily")).toBe(4);
		// Another site gets the same cutoffs: only its old rows go.
		expect(count(env, "ca_sessions WHERE site = 'other'")).toBe(1);
		expect(r.deleted).toEqual(EXPECTED);
	});

	it("stays within the request budget, resumes from the cursor and ends equal to an unbounded run", async () => {
		const first = await runRetention(env.db, env.kv, S, NOW, { requests: 8 });
		expect(first.done).toBe(false);
		expect(first.requests).toBeLessThanOrEqual(8);
		expect(await env.kv.get<RetentionCursor>(KV_CURSOR)).toMatchObject({ day: TODAY, step: first.step });
		let ticks = 1;
		let r = first;
		while (!r.done && ticks < 200) {
			r = await runRetention(env.db, env.kv, S, NOW, { requests: 8 });
			expect(r.requests).toBeLessThanOrEqual(8);
			ticks++;
		}
		expect(ticks).toBeGreaterThan(3);
		expect(r.deleted).toEqual(EXPECTED);
		// A finished cycle does nothing until the next local day.
		const again = await runRetention(env.db, env.kv, S, NOW, { requests: 8 });
		expect(again.done).toBe(true);
		expect(again.deleted).toEqual(r.deleted);
	});

	it("a run stopped by a platform error keeps its progress in the cursor", async () => {
		// The database fails at its 20th statement, like an overloaded D1 in the middle of a cycle.
		let n = 0;
		const fail = () => ++n >= 20;
		const failing = { ...env.db, dialect: env.db.dialect, run: (q: string, p?: never) => (fail() ? Promise.reject(new Error("D1_ERROR: overloaded")) : env.db.run(q, p)), all: (q: string, p?: never) => (fail() ? Promise.reject(new Error("D1_ERROR: overloaded")) : env.db.all(q, p)) } as typeof env.db;
		await expect(runRetention(failing, env.kv, S, NOW)).rejects.toThrow("overloaded");
		const c = await env.kv.get<RetentionCursor>(KV_CURSOR);
		expect(c).toMatchObject({ day: TODAY });
		expect(c?.step).toBeGreaterThan(0);
		expect(Object.keys(c?.deleted ?? {}).length).toBeGreaterThan(0);
	});

	it("a run stopped by the platform's request limit resumes from its last finished step", async () => {
		// Every request after the 25th fails, the database and the state store alike (Workers Free, standard profile).
		let n = 0;
		const stop = <T>(f: () => T): T => {
			if (++n > 25) throw new Error("Too many API requests by single worker invocation.");
			return f();
		};
		const db = { ...env.db, dialect: env.db.dialect, run: (q: string, p?: never) => stop(() => env.db.run(q, p)), all: (q: string, p?: never) => stop(() => env.db.all(q, p)) } as typeof env.db;
		const kv = { ...env.kv, get: <T>(k: string) => stop(() => env.kv.get<T>(k)), set: (k: string, v: unknown) => stop(() => env.kv.set(k, v)) } as typeof env.kv;
		await expect(runRetention(db, kv, S, NOW)).rejects.toThrow("Too many API requests");
		const c = await env.kv.get<RetentionCursor>(KV_CURSOR);
		expect(c?.step).toBeGreaterThan(0);
		// The next tick goes on from there and the cycle ends with the same deletions as an unbounded run.
		const r = await runAll(env);
		expect(r.deleted).toEqual(EXPECTED);
	});

	it("is idempotent: a lost cursor repeats the cycle and deletes nothing more", async () => {
		await runAll(env);
		await env.kv.delete(KV_CURSOR);
		const r = await runAll(env);
		expect(Object.values(r.deleted).reduce((a, b) => a + b, 0)).toBe(0);
	});

	it("the profile sets the request budget: 40 on small", async () => {
		const r = await runRetention(env.db, env.kv, { ...S, capacityProfile: "small" }, NOW);
		expect(r.requests).toBeLessThanOrEqual(40);
	});

	it("never deletes human days the rollup does not hold yet", async () => {
		await env.kv.delete(KV_WATERMARK);
		await runAll(env);
		expect(count(env, "ca_sessions WHERE site = 'default'")).toBe(8);
		expect(count(env, "ca_events")).toBe(3);

		await env.kv.delete(KV_CURSOR);
		await env.kv.set(KV_WATERMARK, ago(100));
		await runAll(env);
		// Only days up to the watermark (ago 100 and older) are deleted.
		expect(count(env, "ca_sessions WHERE site = 'default'")).toBe(6);
		expect(count(env, "ca_events")).toBe(2);
	});

	it("deletes a large day of visits in slices of the sid key range", async () => {
		const big = await schemaDb();
		const sids = Array.from({ length: 3000 }, (_, i) => `${"0123456789abcdefghijklmnopqrstuvwxyz"[i % 36]}${String(i).padStart(19, "x")}`);
		big.raw.transaction(() => {
			for (const sid of sids) session(big, ago(200), "default", sid);
			for (const sid of sids.slice(0, 50)) session(big, ago(1), "default", sid);
		})();
		await big.kv.set(KV_WATERMARK, ago(2));
		const m = meteredDb(big);
		m.reset();
		const r = await runAll({ ...big, db: m.db });
		expect(r.deleted.sessions).toBe(3000);
		expect(count(big, "ca_sessions")).toBe(50);
		const deletes = m.log.filter((e) => e.sql.startsWith("DELETE FROM ca_sessions"));
		// The first slice measures the day; the rest go in statements near 2,000 rows.
		expect(deletes.length).toBeGreaterThan(2);
		expect(Math.max(...deletes.map((e) => e.written))).toBeLessThanOrEqual(2_100);
	});

	it("every retention statement reads by key, never by a table scan", async () => {
		const m = meteredDb(env);
		m.reset();
		await runAll({ ...env, db: m.db });
		const scans: string[] = [];
		for (const { sql } of m.log) {
			const params = Array.from({ length: (sql.match(/\?/g) ?? []).length }, () => null);
			const plan = (env.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>).map((p) => p.detail);
			// The skip scan's recursive CTE is `SCAN s`; a table scan names the table.
			for (const d of plan) if (/^SCAN (ca_\w+)(?! USING)/.test(d)) scans.push(`${d} :: ${sql}`);
		}
		expect(scans).toEqual([]);
	});

	it("a retention tick reads at most 1.2 rows per row deleted (generator traffic over 20 days)", async () => {
		const g = await schemaDb();
		const start = zonedToEpoch(ago(40), 0, "UTC");
		const traffic = generateTraffic({ pageviews: 2000, seed: 21, start, spanSeconds: 20 * 86_400 });
		await recordTraffic(g.db, traffic);
		await g.kv.set(KV_WATERMARK, ago(2));
		const visits = count(g, "ca_sessions");
		const m = meteredDb(g);
		m.reset();
		const r = await runAll({ ...g, db: m.db }, { ...S, rawRetentionDays: 30 });
		const deleted = Object.values(r.deleted).reduce((a, b) => a + b, 0);
		const old = count(g, "ca_sessions WHERE day < ?", ago(30));
		expect(old).toBe(0);
		expect(deleted).toBeGreaterThan(visits / 3);
		// The meter's reads are a lower bound: rows returned, 1 per row deleted, 1 probe for a statement that finds none.
		console.info(`[capacity] retention: ${deleted} rows deleted, ${m.stats.rowsRead} rows read (lower bound), ${m.stats.rowsWritten} written, ${m.stats.statements} statements`);
		expect(m.stats.rowsRead / deleted).toBeLessThanOrEqual(1.2);
		expect(m.stats.rowsWritten).toBe(deleted);
	});

	it("shortens the detailed window when the storage estimate exceeds the profile's share", async () => {
		// `all` rows: 200,000 visits and 600,000 entries a day are about 140 MB; the small profile's detail share is 225 MB.
		const all = env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, sessions, pageviews, events) VALUES ('default', ?, 'all', '', 200000, 500000, 100000)");
		for (const d of [ago(3), ago(2), ago(1)]) all.run(d);
		await env.kv.set(KV_WATERMARK, ago(1));
		const small = { ...S, capacityProfile: "small" as const };
		const r = await runRetention(env.db, env.kv, small, NOW, { requests: 6 });
		// Only the kept day counts as stored detail once the window is shortened.
		expect(r.storage).toMatchObject({ profile: "small", budget: 300e6, detail: Math.round(dayBytes(200_000, 600_000)), capped: true, rawDays: 1 });
		expect(r).toMatchObject({ capped: true, rawDays: 1 });
		expect(await effectiveRawDays(env.kv, small)).toBe(1);
		expect(await rawFromDay(env.kv, small, NOW)).toBe(ago(1));
		const standard = await runRetention(env.db, env.kv, S, NOW + 86_400, { requests: 6 });
		expect(standard).toMatchObject({ capped: false, rawDays: 90 });
	});

	it("an unfinished cycle goes on where it stopped on the next local day, so later steps are reached", async () => {
		const first = await runRetention(env.db, env.kv, S, NOW, { requests: 8 });
		expect(first.done).toBe(false);
		const next = await runRetention(env.db, env.kv, S, NOW + 86_400, { requests: 8 });
		expect(next.day).toBe(addDays(TODAY, 1));
		expect(next.step).toBeGreaterThanOrEqual(first.step);
	});

	it("deletes at most SMALL_TICK_ROWS rows per tick on the small profile", async () => {
		const big = await schemaDb();
		big.raw.transaction(() => {
			for (let i = 0; i < 5000; i++) session(big, ago(200), "default", `${"0123456789abcdefghijklmnopqrstuvwxyz"[i % 36]}${String(i).padStart(19, "y")}`);
		})();
		await big.kv.set(KV_WATERMARK, ago(2));
		const small = { ...S, capacityProfile: "small" as const };
		const r = await runRetention(big.db, big.kv, small, NOW);
		expect(r.done).toBe(false);
		expect(r.deleted.sessions).toBeLessThanOrEqual(SMALL_TICK_ROWS + 2_100);
		expect(count(big, "ca_sessions")).toBeGreaterThan(0);
	});

	it("small: the rows deleted in a UTC day are kept in the cursor, added to the write guard and capped at SMALL_DAY_ROWS", async () => {
		const big = await schemaDb();
		big.raw.transaction(() => {
			for (let i = 0; i < 20_000; i++) session(big, ago(200), "default", `${"0123456789abcdefghijklmnopqrstuvwxyz"[i % 36]}${String(i).padStart(19, "y")}`);
		})();
		await big.kv.set(KV_WATERMARK, ago(2));
		const small = { ...S, capacityProfile: "small" as const };
		let total = 0;
		for (let tick = 0; tick < 12; tick++) {
			const before = count(big, "ca_sessions");
			await runRetention(big.db, big.kv, small, NOW + tick * 3600);
			total += before - count(big, "ca_sessions");
		}
		// Twelve hourly ticks of 2,000 would delete 24,000; the day stops at the cap (the last statement may pass it, as a tick's does).
		expect(total).toBeLessThanOrEqual(SMALL_DAY_ROWS + 2_100);
		expect(total).toBeGreaterThan(SMALL_DAY_ROWS - 2_100);
		expect(await deletedToday(big.kv, NOW + 11 * 3600)).toBe(total);
		const b = await budgetState(big.db, big.kv, NOW + 11 * 3600, "small");
		expect(b).toMatchObject({ deletes: total, rows: FIXED_ROWS + total });
		// The next UTC day starts a new count.
		const next = zonedToEpoch(addDays(dayInZone(NOW, "UTC"), 1), 0, "UTC") + 60;
		const r = await runRetention(big.db, big.kv, small, next);
		expect(r.utc?.day).toBe(dayInZone(next, "UTC"));
		expect(r.utc?.rows).toBeGreaterThan(0);
		expect(r.utc?.rows).toBeLessThanOrEqual(SMALL_TICK_ROWS + 2_100);
	});

	it("stores the cursor with a new cutoff before its first delete", async () => {
		const e = await schemaDb();
		for (let i = 0; i < 50; i++) session(e, ago(200), "default", `${"0123456789abcdefghijklmnopqrstuvwxyz"[i % 36]}${String(i).padStart(19, "x")}`);
		await e.kv.set(KV_WATERMARK, ago(2));
		const order: string[] = [];
		const db = { ...e.db, run: (sql: string, p?: never) => (sql.startsWith("DELETE") && order.push("delete"), e.db.run(sql, p)) };
		const kv = Object.assign(Object.create(e.kv), { set: async (k: string, v: unknown) => (k === KV_CURSOR && order.push(`cursor:${(v as RetentionCursor).cutoff}`), e.kv.set(k, v)) });
		await runRetention(db as never, kv, S, NOW);
		expect(order[0]).toMatch(/^cursor:\d{4}-\d{2}-\d{2}$/);
		expect(order.indexOf("delete")).toBeGreaterThan(0);
	});

	it("sizes the first statement of a site afresh: a small site's rate does not make a large site's day one statement", async () => {
		const two = await schemaDb();
		two.raw.transaction(() => {
			for (let i = 0; i < 20; i++) session(two, ago(200), "a-small", `${"0123456789abcdefghijklmnopqrstuvwxyz"[i % 36]}${String(i).padStart(19, "z")}`);
			for (let i = 0; i < 6000; i++) session(two, ago(200), "b-large", `${"0123456789abcdefghijklmnopqrstuvwxyz"[i % 36]}${String(i).padStart(19, "z")}`);
		})();
		await two.kv.set(KV_WATERMARK, ago(2));
		const m = meteredDb(two);
		m.reset();
		await runAll({ ...two, db: m.db });
		expect(count(two, "ca_sessions")).toBe(0);
		expect(Math.max(...m.log.filter((e) => e.sql.startsWith("DELETE FROM ca_sessions")).map((e) => e.written))).toBeLessThanOrEqual(2_100);
	});

	it("never starts the detailed window before the last applied cutoff when the setting is raised", async () => {
		await runAll(env);
		expect(await rawFromDay(env.kv, S, NOW)).toBe(ago(90));
		expect(await rawFromDay(env.kv, { ...S, rawRetentionDays: 200 }, NOW)).toBe(ago(90));
	});

	it("lists the sites of every table by skip scan", async () => {
		expect(await sitesInTables(env.db)).toEqual(["default", "other"]);
		expect(dayInZone(NOW, "UTC")).toBe(TODAY);
	});

	it("subtracts months with clamping", () => {
		expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
		expect(addMonths("2026-06-15", -25)).toBe("2024-05-15");
		expect(addMonths("2026-01-10", -1)).toBe("2025-12-10");
	});

	it("deletes salts older than two days before the current salt day", async () => {
		for (const d of [ago(4), ago(3), ago(2), ago(1), TODAY]) await env.kv.set(`salt:${d}`, "x");
		await env.kv.set("drops:2020-01-01", {});
		const gone = await cleanSalts(env.kv, { saltTimezone: "UTC", saltRotationHour: 0 }, NOW);
		expect(gone.sort()).toEqual([`salt:${ago(4)}`, `salt:${ago(3)}`]);
		expect((await env.kv.list("salt:")).map((e) => e.key).sort()).toEqual([`salt:${ago(2)}`, `salt:${ago(1)}`, `salt:${TODAY}`]);
		expect(await env.kv.get("drops:2020-01-01")).not.toBeNull();
	});
});
