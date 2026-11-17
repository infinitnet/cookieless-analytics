/** The data move job: cron driven ticks, resume, lease, conflicts with rows written since the switch, state keys, skipped tasks, verification, both engines. */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const workerEnv = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../src/core/worker-env.js", () => ({ workerEnv: async () => workerEnv.value }));

import type { KvLike } from "../src/core/crypto.js";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { prefixedKv, statePrefix } from "../src/db/facts.js";
import { fromPg, pgScope } from "../src/db/pg.js";
import { ensureSchema } from "../src/db/schema.js";
import { dayTotals, SPLIT_SUFFIX } from "../src/move/chunks.js";
import { COPY_DAY_ROWS, KV_COPY_ROWS, nextUtcMidnight } from "../src/move/day-budget.js";
import { definiteSqlError, KV_MOVE_JOB, KV_MOVE_STOP, MOVE_CRON, MOVE_LEASE_S, MOVE_MAX_FAILS, MOVE_ORDER, type MoveEnv, type MoveJob, moveView, newMoveJob, resumeCancelled, runMoveJob, sourceState, sourceTotals, STATE_KEYS, verifyTable } from "../src/move/job.js";
import { createPlugin, resetCronTurns } from "../src/index.js";
import { KV_CURSOR } from "../src/query/retention.js";
import { KV_REVENUE_CURSOR, KV_ROLLUP_CURSOR, KV_WATERMARK, runRollup } from "../src/query/rollup.js";
import { moveRoutes } from "../src/routes/move.js";
import { KV_WRITE_BUDGET, type WriteBudget, writeBudget } from "../src/query/storage.js";
import { normalizeSettings } from "../src/settings.js";
import { replaceDays } from "../src/sources/store.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { fakeD1 } from "./d1.helpers.js";
import { MemoryKv, memoryDb } from "./helpers.js";
import { hyperdrive, pglite } from "./pg.helpers.js";

const START = zonedToEpoch("2026-06-01", 0, "UTC");
const NOW = zonedToEpoch("2026-06-09", 3, "UTC");
const S = normalizeSettings({});

/** A source with rows in all nine tables. */
async function seeded() {
	const m = memoryDb();
	await ensureSchema(m.db, new MemoryKv());
	const kv = new MemoryKv();
	await recordTraffic(m.db, generateTraffic({ pageviews: 300, seed: 9, rich: true, start: START, spanSeconds: 6 * 86_400 - 1 }));
	await recordAgentEvents({ db: m.db, kv, settings: S, now: START + 5 * 86_400 }, "default", [{ name: "purchase", val: 49.9, cur: "EUR", oid: "o-1", ts: START + 4 * 86_400 }]);
	const rc = { db: m.db, settings: S, goals: async () => [] };
	let t = await runRollup(rc, kv, NOW);
	for (let i = 0; i < 80 && !t.done; i++) t = await runRollup(rc, kv, NOW);
	await replaceDays(m.db, "default", "google", new Map([["2026-06-02", [{ page_key: "/blog/a", query: "q", country: "de", device: "MOBILE", clicks: 4, impressions: 100, pos_sum: 42.5 }]]]), () => false);
	await m.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 3, 1)");
	await m.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 2)");
	await m.db.run("INSERT INTO ca_aliases (site, sid, canon, expires) VALUES ('default', 'a1', 'c1', 1)");
	return m;
}

async function fresh() {
	const m = memoryDb();
	await ensureSchema(m.db, new MemoryKv());
	return m;
}

/** `db` with every statement counted into `n` (a batch counts each). */
function counting(db: Db, n: { v: number }): Db {
	return { dialect: db.dialect, run: (q, p) => (n.v++, db.run(q, p)), all: (q, p) => (n.v++, db.all(q, p)), batch: (st) => ((n.v += st.length), db.batch(st)) };
}
function countingKv(kv: KvLike, n: { v: number }): KvLike {
	return {
		get: (k) => (n.v++, kv.get(k)),
		set: (k, v) => (n.v++, kv.set(k, v)),
		delete: (k) => (n.v++, kv.delete(k)),
		list: (p) => (n.v++, kv.list(p)),
		compareAndSet: (k, r, v) => (n.v++, kv.compareAndSet(k, r, v)),
	};
}

function env(kv: KvLike, src: Db, dst: Db, o: Partial<MoveEnv> = {}): MoveEnv {
	return { kv, source: async () => src, dest: async () => dst, destKv: (k) => k, profile: "small", now: NOW, ...o };
}

async function start(kv: KvLike, src: Db, o: { source?: string | null; dest?: string | null; site?: string } = {}) {
	const source = o.source === undefined ? "CA_OLD" : o.source;
	const job = newMoveJob({ source, dest: o.dest ?? null, site: o.site, by: null, now: NOW, total: await sourceTotals(src, o.site), state: await sourceState(kv, source) });
	await kv.set(KV_MOVE_JOB, job);
	return job;
}

/** Ticks of `requests` each until the job is done; returns the ticks. */
async function drive(e: MoveEnv, requests: number, max = 500) {
	for (let i = 1; i <= max; i++) {
		const j = await runMoveJob(e, requests);
		if (j?.status === "done") return i;
	}
	throw new Error("the move did not finish");
}

async function totals(db: Db) {
	return Object.fromEntries(await Promise.all(MOVE_ORDER.map(async (t) => [t, await dayTotals(db, t)] as const)));
}

describe("move job", () => {
	it("a job driven only by cron ticks of 40 requests finishes; no tick spends more; both sides then hold the same rows", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		await start(kv, src.db);
		const n = { v: 0 };
		const cancelled: string[] = [];
		const e = env(countingKv(kv, n), counting(src.db, n), counting(dst.db, n), { cron: { schedule: async () => undefined, cancel: async (name) => void cancelled.push(name) } });
		let ticks = 0;
		let job: MoveJob | null = null;
		while (job?.status !== "done") {
			n.v = 0;
			job = await runMoveJob(e, 40);
			expect(n.v).toBeLessThanOrEqual(40);
			if (++ticks > 500) throw new Error("the move did not finish");
		}
		expect(ticks).toBeGreaterThan(3);
		expect(await totals(dst.db)).toEqual(await totals(src.db));
		for (const t of MOVE_ORDER) expect(job.verify[t]?.short, t).toBe(0);
		expect(job.read).toEqual(job.total);
		expect(cancelled).toEqual([MOVE_CRON]);
		// A finished job does nothing more.
		n.v = 0;
		await runMoveJob(e, 40);
		expect(n.v).toBe(1);
	});

	it("resumes after a failed chunk: the error is saved, the next tick repeats the chunk from the saved position", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		await start(kv, src.db);
		let writes = 0;
		const flaky: Db = {
			...dst.db,
			run: async (q, p) => {
				if (q.startsWith("INSERT") && ++writes === 3) throw new Error("D1_ERROR: network connection lost");
				return dst.db.run(q, p);
			},
		};
		const e = env(kv, src.db, flaky);
		await expect(runMoveJob(e, 40)).rejects.toThrow("network connection lost");
		const saved = await kv.get<MoveJob>(KV_MOVE_JOB);
		expect(saved?.error).toContain("network connection lost");
		expect(saved?.lease).toBeUndefined();
		expect(saved?.status).toBe("running");
		await drive(e, 40);
		expect(await totals(dst.db)).toEqual(await totals(src.db));
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.error).toBeNull();
	});

	it("a lease held by another run: the tick returns without a statement", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const job = await start(kv, src.db);
		await kv.set(KV_MOVE_JOB, { ...job, lease: NOW + 30 });
		const n = { v: 0 };
		const j = await runMoveJob(env(kv, counting(src.db, n), counting(dst.db, n)), 40);
		expect(n.v).toBe(0);
		expect(j?.t).toBe(0);
		// Once the lease ran out the next tick works.
		await runMoveJob(env(kv, src.db, dst.db, { now: NOW + 61 }), 40);
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.read.ca_rollup).toBeGreaterThan(0);
	});

	it("rows written to the destination since the switch are kept; counters are added once; a visit across the switch keeps both halves", async () => {
		const src = await seeded();
		const dst = await fresh();
		const visit = (await src.db.all<Record<string, unknown>>("SELECT site, day, sid, started FROM ca_sessions ORDER BY day DESC, sid LIMIT 1"))[0]!;
		const rollup = (await src.db.all<Record<string, unknown>>("SELECT site, day, dim, key, seg, segkey FROM ca_rollup LIMIT 1"))[0]!;
		// Since the switch: the visitor went on (same sid, a new start), a server hit counter of the same day, a summary row and a new visit.
		await dst.db.run(
			"INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, pageviews, events, engaged_ms, visible_ms, reentries, max_scroll, interacted, hits) VALUES (?, ?, ?, 'v', 1, ?, ?, 0, 1, 0, 0, 0, 0, 0, 0, jsonb('[]'))",
			[visit.site as string, visit.day as string, visit.sid as string, Number(visit.started) + 7, Number(visit.started) + 9],
		);
		await dst.db.run(
			"INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, pageviews, events, engaged_ms, visible_ms, reentries, max_scroll, interacted, hits) VALUES ('default', '2026-06-09', 'new-visit', 'v', 1, ?, ?, 0, 1, 0, 0, 0, 0, 0, 0, jsonb('[]'))",
			[NOW, NOW],
		);
		await dst.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 5, 9)");
		await dst.db.run("INSERT INTO ca_rollup (site, day, dim, key, seg, segkey, pageviews, sessions, visitors, bounces, engaged, engaged_ms, events, hits) VALUES (?, ?, ?, ?, ?, ?, 999, 0, 0, 0, 0, 0, 0, 0)", [
			rollup.site as string,
			rollup.day as string,
			rollup.dim as string,
			rollup.key as string,
			rollup.seg as string,
			rollup.segkey as string,
		]);
		const kv = new MemoryKv();
		await start(kv, src.db);
		const job = (await runMoveJob(env(kv, src.db, dst.db), 40)) && (await drive(env(kv, src.db, dst.db), 40), await kv.get<MoveJob>(KV_MOVE_JOB));
		const halves = await dst.db.all<{ sid: string; started: number }>("SELECT sid, started FROM ca_sessions WHERE site = ? AND day = ? AND sid IN (?, ?) ORDER BY sid", [visit.site as string, visit.day as string, visit.sid as string, `${visit.sid}${SPLIT_SUFFIX}`]);
		expect(halves.map((h) => [h.sid, Number(h.started)])).toEqual([
			[visit.sid, Number(visit.started) + 7],
			[`${visit.sid}${SPLIT_SUFFIX}`, Number(visit.started)],
		]);
		expect(await dst.db.all("SELECT sid FROM ca_sessions WHERE sid = 'new-visit'")).toHaveLength(1);
		const [srv] = await dst.db.all<{ n: number; last_ts: number }>("SELECT n, last_ts FROM ca_srv WHERE day = 20260605 AND path = '/x'");
		expect([Number(srv?.n), Number(srv?.last_ts)]).toEqual([8, 9]);
		const [r] = await dst.db.all<{ pageviews: number }>("SELECT pageviews FROM ca_rollup WHERE site = ? AND day = ? AND dim = ? AND key = ? AND seg = ? AND segkey = ?", [
			rollup.site as string,
			rollup.day as string,
			rollup.dim as string,
			rollup.key as string,
			rollup.seg as string,
			rollup.segkey as string,
		]);
		expect(Number(r?.pageviews)).toBe(999);
		// The destination holds more, never less: nothing short in the sessions and server hits.
		expect(job?.verify.ca_sessions?.short).toBe(0);
		expect(job?.verify.ca_sessions?.more).toBeGreaterThan(0);
		expect(job?.verify.ca_srv?.short).toBe(0);
	});

	it("a pending counter chunk found on resume counts as applied: its counts are not added twice", async () => {
		const src = await seeded();
		const dst = await fresh();
		await dst.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 10)");
		const kv = new MemoryKv();
		await start(kv, src.db);
		// The write of the drops chunk is applied, then the call is lost before its position is saved.
		let lost = false;
		const lossy: Db = {
			...dst.db,
			run: async (q, p) => {
				const r = await dst.db.run(q, p);
				if (q.startsWith("INSERT INTO ca_drops") && !lost) {
					lost = true;
					throw new Error("lost after the write");
				}
				return r;
			},
		};
		await expect(drive(env(kv, src.db, lossy), 40)).rejects.toThrow("lost after the write");
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.pending).toMatchObject({ t: MOVE_ORDER.indexOf("ca_drops") });
		await drive(env(kv, src.db, dst.db), 40);
		const [d] = await dst.db.all<{ n: number }>("SELECT n FROM ca_drops WHERE day = 20260605 AND reason = 'invalid'");
		expect(Number(d?.n)).toBe(12);
	});

	it("copies the source's watermark, taken at start, under the destination's prefix and deletes the in-run cursors there", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const state = { [KV_WATERMARK]: "2026-06-07", [KV_ROLLUP_CURSOR]: { day: "2026-06-08", site: "default" }, [KV_REVENUE_CURSOR]: { day: "2026-06-07" }, [KV_CURSOR]: { day: "2026-06-09", bytes: 1 } };
		// The source was a routed database: its state is under its prefix.
		for (const [k, v] of Object.entries(state)) await kv.set(statePrefix("CA_OLD") + k, v);
		await start(kv, src.db, { site: "default" });
		// The destination's tasks moved its own state on since the switch: the copy replaces it.
		const destKv = prefixedKv(kv, statePrefix("CA_NEW"));
		await destKv.set(KV_WATERMARK, "2026-06-09");
		await destKv.set(KV_ROLLUP_CURSOR, { day: "2026-06-09", site: "default" });
		await drive(env(kv, src.db, dst.db, { destKv: (k) => prefixedKv(k, statePrefix("CA_NEW")) }), 40);
		// The watermark only moves back: here to the source's last summary day, before both watermarks.
		const [last] = await src.db.all<{ d: string }>("SELECT MAX(day) AS d FROM ca_rollup WHERE site = 'default'");
		expect(last!.d < "2026-06-07").toBe(true);
		expect(await destKv.get(KV_WATERMARK)).toBe(last!.d);
		// Only the watermark carries progress: the destination's in-run cursors are deleted, the source's not copied.
		for (const k of STATE_KEYS.filter((k) => k !== KV_WATERMARK)) expect(await destKv.get(k), k).toBeNull();
		// A plain source (the EmDash database) is read from the plain keys; a key it lacks is deleted at the destination.
		await kv.set(KV_WATERMARK, "2026-06-01");
		expect(await sourceState(kv, null)).toEqual({ [KV_WATERMARK]: "2026-06-01", [KV_ROLLUP_CURSOR]: null, [KV_REVENUE_CURSOR]: null, [KV_CURSOR]: null });
	});

	it("a pause sent while a call runs wins over the status that call read; no watermark on one side gives none", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const job = await start(kv, src.db);
		let paused = false;
		const pausing: Db = {
			...dst.db,
			run: async (q, p) => {
				if (!paused) {
					paused = true;
					await kv.set(KV_MOVE_STOP, { id: job.id, status: "paused" });
				}
				return dst.db.run(q, p);
			},
		};
		expect((await runMoveJob(env(kv, src.db, pausing), 40))?.status).toBe("paused");
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.status).toBe("paused");
		// The destination has no watermark: none is set, so the rollup starts at the first detailed day.
		await kv.delete(KV_MOVE_STOP);
		await kv.set(KV_MOVE_JOB, { ...(await kv.get<MoveJob>(KV_MOVE_JOB)), status: "running" });
		await kv.set(statePrefix("CA_OLD") + KV_WATERMARK, "2026-06-07");
		await drive(env(kv, src.db, dst.db), 40);
		expect(await kv.get(KV_WATERMARK)).toBeNull();
	});

	it("a lease taken by another call between the read and the write: this call backs off", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		await start(kv, src.db);
		const racing: KvLike = Object.assign(Object.create(kv) as KvLike, {
			set: async (k: string, v: unknown) => {
				await kv.set(k, v);
				if (k === KV_MOVE_JOB && (v as MoveJob).holder) await kv.set(k, { ...(v as MoveJob), holder: "other" });
			},
		});
		const n = { v: 0 };
		await runMoveJob(env(racing, counting(src.db, n), counting(dst.db, n)), 40);
		expect(n.v).toBe(0);
	});

	it("verification catches a row deleted in the destination", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		await start(kv, src.db);
		await drive(env(kv, src.db, dst.db), 400);
		expect((await verifyTable(src.db, dst.db, "ca_events")).short).toBe(0);
		await dst.db.run("DELETE FROM ca_events WHERE id = (SELECT MIN(id) FROM ca_events)");
		const v = await verifyTable(src.db, dst.db, "ca_events");
		expect(v.short).toBe(1);
		expect(v.sample).toHaveLength(1);
	});
});

describe("move routes", () => {
	// `small`: a call moves a few chunks, so the steps between calls can be seen.
	const settings = async () => normalizeSettings({ capacityProfile: "small" });
	it("start, pause, resume, run to done, check, refuse a drop after a lost row, drop the old tables", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const scheduled: string[] = [];
		const cron = { schedule: async (n: string) => void scheduled.push(n), cancel: async (n: string) => void scheduled.push(`-${n}`) };
		let targets: Array<string | null> = ["CA_NEW"];
		const r = moveRoutes({ settings, source: async (b) => (b === "CA_OLD" ? src.db : null), dest: async () => dst.db, destKv: (k) => k, destBinding: () => "CA_NEW", targets: () => targets, now: () => NOW });
		const call = (name: keyof typeof r, input: unknown = {}) => r[name].handler({ input, kv, cron } as never) as Promise<{ job: (MoveJob & { percent: number }) | null; dest: string | null }>;
		await expect(call("move/start", { source: "CA_NEW" })).rejects.toThrow("already writes to CA_NEW");
		await expect(call("move/start", { source: "CA_MISSING" })).rejects.toThrow("not a D1 or Hyperdrive binding");
		await expect(call("move/start", { source: "bad name" })).rejects.toThrow();
		targets = ["CA_NEW", "CA_OLD"];
		await expect(call("move/start", { source: "CA_OLD" })).rejects.toThrow("Choose the site");
		targets = ["CA_NEW"];
		const started = await call("move/start", { source: "CA_OLD" });
		expect(started.job?.status).toBe("running");
		expect(started.dest).toBe("CA_NEW");
		expect(scheduled).toEqual([MOVE_CRON]);
		// On `small` into D1 the start's own call may only take the lease; the next call copies.
		expect((await call("move/run")).job?.percent).toBeGreaterThan(0);
		await expect(call("move/start", { source: "CA_OLD" })).rejects.toThrow("already running");
		const paused = await call("move/pause");
		expect(paused.job?.status).toBe("paused");
		expect((await call("move/run")).job?.read).toEqual(paused.job?.read);
		expect((await call("move/pause", { resume: true })).job?.status).toBe("running");
		let s = await call("move/run");
		for (let i = 0; i < 200 && s.job?.status !== "done"; i++) s = await call("move/run");
		expect(s.job?.status).toBe("done");
		expect(s.job?.percent).toBe(100);
		expect(s.job && "state" in s.job).toBe(false);
		await dst.db.run("DELETE FROM ca_drops");
		const checked = await call("move/verify");
		expect(checked.job?.verify.ca_drops?.short).toBe(1);
		await expect(call("move/drop-old-tables", { confirm: "DELETE" })).rejects.toThrow("missing in ca_drops");
		await expect(call("move/drop-old-tables", { confirm: "yes" })).rejects.toThrow("confirm");
		await dst.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 2)");
		await call("move/verify");
		const dropped = await call("move/drop-old-tables", { confirm: "DELETE" });
		expect(dropped.job?.dropped).toBe(NOW);
		expect(src.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ca_%'").all()).toEqual([]);
	});

	it("cancel stops the move and its cron task; a delete job blocks the start", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const cancelled: string[] = [];
		const cron = { schedule: async () => undefined, cancel: async (n: string) => void cancelled.push(n) };
		const r = moveRoutes({ settings, source: async () => src.db, dest: async () => dst.db, destKv: (k) => k, destBinding: () => null, targets: () => [null], now: () => NOW });
		const call = (name: keyof typeof r, input: unknown = {}) => r[name].handler({ input, kv, cron } as never) as Promise<{ job: MoveJob | null }>;
		await kv.set("delete:job", { status: "running" });
		await expect(call("move/start", { source: "CA_OLD" })).rejects.toThrow("delete is still running");
		await kv.delete("delete:job");
		await call("move/start", { source: "CA_OLD" });
		expect((await call("move/cancel")).job?.status).toBe("cancelled");
		expect(cancelled).toEqual([MOVE_CRON]);
		await expect(call("move/drop-old-tables", { confirm: "DELETE" })).rejects.toThrow("finished move");
	});

	it("after a move of one site the old tables stay: they hold the other sites' rows", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const r = moveRoutes({ settings: async () => S, source: async () => src.db, dest: async () => dst.db, destKv: (k) => k, destBinding: () => "CA_NEW", targets: () => ["CA_NEW"], now: () => NOW });
		const call = (name: keyof typeof r, input: unknown = {}) => r[name].handler({ input, kv } as never) as Promise<{ job: MoveJob | null }>;
		const s = await call("move/start", { source: "CA_OLD", site: "default" });
		expect(s.job?.status).toBe("done");
		await expect(call("move/drop-old-tables", { confirm: "DELETE" })).rejects.toThrow("other sites");
	});
});

describe("while a move is active", () => {
	beforeEach(() => resetCronTurns());
	afterAll(() => {
		workerEnv.value = {};
	});

	it("the rollup and retention tasks skip its database and the delete tools refuse; after it they run again", async () => {
		const m = await seeded();
		await m.db.run("DELETE FROM ca_rollup");
		await m.db.run("DELETE FROM ca_cube");
		workerEnv.value = { CA_DB: fakeD1(m.raw) };
		const p = createPlugin({ database: { binding: "CA_DB" } }) as unknown as {
			hooks: { cron: { handler: (e: unknown, c: unknown) => Promise<void> } };
			routes: Record<string, { handler: (c: unknown) => Promise<unknown> }>;
		};
		const kv = new MemoryKv();
		const job = newMoveJob({ source: "CA_OLD", dest: "CA_DB", by: null, now: NOW, total: {}, state: {} });
		await kv.set(KV_MOVE_JOB, job);
		const ctx = { log: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }, kv, storage: {} };
		const rollups = async () => Number((await m.db.all<{ n: number }>("SELECT COUNT(*) AS n FROM ca_rollup"))[0]?.n);
		await p.hooks.cron.handler({ name: "rollup", scheduledAt: "" }, ctx);
		resetCronTurns();
		await p.hooks.cron.handler({ name: "retention", scheduledAt: "" }, ctx);
		expect(await rollups()).toBe(0);
		expect(await kv.get(KV_WATERMARK)).toBeNull();
		expect(await kv.get(KV_CURSOR)).toBeNull();
		for (const name of ["tools/delete-all", "tools/delete-start", "tools/purge", "tools/rollup-now", "sites/delete"])
			await expect(p.routes[name]!.handler({ input: { confirm: "DELETE" }, kv }), name).rejects.toThrow("Data is being moved");
		// Paused is still active.
		await kv.set(KV_MOVE_JOB, { ...job, status: "paused" });
		resetCronTurns();
		await p.hooks.cron.handler({ name: "rollup", scheduledAt: "" }, ctx);
		expect(await rollups()).toBe(0);
		await kv.set(KV_MOVE_JOB, { ...job, status: "done" });
		resetCronTurns();
		await p.hooks.cron.handler({ name: "rollup", scheduledAt: "" }, ctx);
		expect(await rollups()).toBeGreaterThan(0);
	});

	it("the move cron task continues the job through the plugin and cancels itself when none is active", async () => {
		const old = await seeded();
		const m = await fresh();
		workerEnv.value = { CA_DB: fakeD1(m.raw), CA_OLD: fakeD1(old.raw) };
		const p = createPlugin({ database: { binding: "CA_DB" } }) as unknown as { hooks: { cron: { handler: (e: unknown, c: unknown) => Promise<void> } } };
		const kv = new MemoryKv();
		await start(kv, old.db, { dest: "CA_DB" });
		const cancelled: string[] = [];
		const ctx = { log: { warn: vi.fn() }, kv, storage: {}, cron: { schedule: async () => undefined, cancel: async (n: string) => void cancelled.push(n), list: async () => [] } };
		for (let i = 0; i < 100 && (await kv.get<MoveJob>(KV_MOVE_JOB))?.status !== "done"; i++) {
			resetCronTurns();
			await p.hooks.cron.handler({ name: MOVE_CRON, scheduledAt: "" }, ctx);
		}
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.status).toBe("done");
		expect(await totals(m.db)).toEqual(await totals(old.db));
		expect(cancelled).toEqual([MOVE_CRON]);
	});
});

describe("move job across engines", () => {
	it("SQLite to Postgres (a Hyperdrive binding over PGlite, one connection per tick) and back to a fresh SQLite", async () => {
		const src = await seeded();
		const { binding, stats } = hyperdrive(pglite());
		const pg = fromPg(binding, "CA_PG");
		await pgScope(() => ensureSchema(pg, new MemoryKv()));
		const kv = new MemoryKv();
		await start(kv, src.db, { source: "CA_OLD", dest: "CA_PG" });
		let ticks = 0;
		for (; (await kv.get<MoveJob>(KV_MOVE_JOB))?.status !== "done"; ticks++) {
			if (ticks > 500) throw new Error("the move did not finish");
			const opened = stats.opened;
			await pgScope(() => runMoveJob(env(kv, src.db, pg), 40));
			expect(stats.opened - opened).toBe(1);
		}
		expect(stats.ended).toBe(stats.opened);
		const there = await pgScope(() => totals(pg));
		expect(there).toEqual(await totals(src.db));

		const back = await fresh();
		const kv2 = new MemoryKv();
		await pgScope(() => start(kv2, pg, { source: "CA_PG", dest: null }));
		while ((await kv2.get<MoveJob>(KV_MOVE_JOB))?.status !== "done") await pgScope(() => runMoveJob(env(kv2, pg, back.db, { profile: "standard" }), 400));
		expect(await totals(back.db)).toEqual(await totals(src.db));
		expect(back.raw.prepare("SELECT typeof(hits) AS t FROM ca_sessions LIMIT 1").get()).toEqual({ t: "blob" });
		const job = await kv2.get<MoveJob>(KV_MOVE_JOB);
		for (const t of MOVE_ORDER) expect(job?.verify[t]?.short, t).toBe(0);
	}, 30_000);
});

const counterN = async (db: Db, t: "ca_srv" | "ca_drops") => Number((await db.all<{ n: number }>(`SELECT n FROM ${t} WHERE site = 'default' AND day = 20260605`))[0]?.n);

describe("counters when moving again", () => {
	it("a second move of the same source and destination after the first finished leaves ca_srv and ca_drops as they are", async () => {
		const src = await seeded();
		const dst = await fresh();
		await dst.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 5, 9)");
		const kv = new MemoryKv();
		await start(kv, src.db);
		await drive(env(kv, src.db, dst.db), 40);
		expect([await counterN(dst.db, "ca_srv"), await counterN(dst.db, "ca_drops")]).toEqual([8, 2]);
		await start(kv, src.db);
		await drive(env(kv, src.db, dst.db), 40);
		expect([await counterN(dst.db, "ca_srv"), await counterN(dst.db, "ca_drops")]).toEqual([8, 2]);
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.verify.ca_srv?.short).toBe(0);
	});

	it("a cancelled move is resumed from its position and adds each count once", async () => {
		const src = await seeded();
		const dst = await fresh();
		await dst.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 5, 9)");
		await dst.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 10)");
		const kv = new MemoryKv();
		const job = await start(kv, src.db);
		// The call that copies the server hits runs out of time before the drops.
		let ms = 0;
		const timed: Db = { ...dst.db, run: async (q, p) => ((ms += q.startsWith("INSERT INTO ca_srv") ? 60_000 : 0), dst.db.run(q, p)) };
		const e = env(kv, src.db, dst.db);
		for (let i = 0; i < 200 && ((await kv.get<MoveJob>(KV_MOVE_JOB))?.t ?? 0) <= MOVE_ORDER.indexOf("ca_srv"); i++) await runMoveJob(env(kv, src.db, timed, { clock: () => ms }), 40);
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.t).toBe(MOVE_ORDER.indexOf("ca_drops"));
		await kv.set(KV_MOVE_STOP, { id: job.id, status: "cancelled" });
		expect((await runMoveJob(e, 40))?.status).toBe("cancelled");
		const at = (await kv.get<MoveJob>(KV_MOVE_JOB))!;
		expect(await resumeCancelled(kv, { source: "CA_OTHER", dest: null })).toBeNull();
		const resumed = await resumeCancelled(kv, { source: "CA_OLD", dest: null });
		expect([resumed?.id, resumed?.status, resumed?.t, resumed?.after]).toEqual([job.id, "running", at.t, at.after]);
		expect(await kv.get(KV_MOVE_STOP)).toBeNull();
		await drive(e, 40);
		expect([await counterN(dst.db, "ca_srv"), await counterN(dst.db, "ca_drops")]).toEqual([8, 12]);
	});

	it("moving back keeps the larger count instead of adding the two", async () => {
		const a = await seeded();
		const b = await fresh();
		await b.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 5, 9)");
		const kv = new MemoryKv();
		await start(kv, a.db, { source: "CA_OLD", dest: null });
		await drive(env(kv, a.db, b.db), 40);
		expect(await counterN(b.db, "ca_srv")).toBe(8);
		// The way back: the old database already holds its own counts, the new one holds those plus its own.
		await start(kv, b.db, { source: null, dest: "CA_OLD" });
		const job = (await drive(env(kv, b.db, a.db), 40), await kv.get<MoveJob>(KV_MOVE_JOB));
		expect([await counterN(a.db, "ca_srv"), await counterN(a.db, "ca_drops")]).toEqual([8, 2]);
		expect(job?.counters).toBe("max");
		expect(job?.verify.ca_srv?.short).toBe(0);
	});
});

describe("lease", () => {
	it("every save renews the lease: a second call while the first runs past its first lease does nothing", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		await start(kv, src.db);
		let ms = 0;
		let writes = 0;
		const n2 = { v: 0 };
		let second: MoveJob | null = null;
		const slow: Db = {
			...dst.db,
			run: async (q, p) => {
				const r = await dst.db.run(q, p);
				if (q.startsWith("INSERT") && ++writes === 1) ms += 30_000;
				// Ten seconds after the lease taken at the start would have run out.
				if (q.startsWith("INSERT") && writes === 2) second = await runMoveJob(env(kv, counting(src.db, n2), counting(dst.db, n2), { now: NOW + MOVE_LEASE_S + 10 }), 40);
				return r;
			},
		};
		await runMoveJob(env(kv, src.db, slow, { clock: () => ms }), 40);
		expect(writes).toBeGreaterThan(1);
		expect(n2.v).toBe(0);
		expect(second!.lease).toBeGreaterThan(NOW + MOVE_LEASE_S + 10);
	});

	it("a call whose lease another call took stops at its next save without writing the job", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		await start(kv, src.db);
		let taken: MoveJob | null = null;
		const lost: Db = {
			...dst.db,
			run: async (q, p) => {
				const r = await dst.db.run(q, p);
				if (q.startsWith("INSERT") && !taken) {
					taken = { ...(await kv.get<MoveJob>(KV_MOVE_JOB))!, holder: "other", lease: NOW + 999 };
					await kv.set(KV_MOVE_JOB, taken);
				}
				return r;
			},
		};
		const j = await runMoveJob(env(kv, src.db, lost), 40);
		expect(j).toEqual(taken);
		expect(await kv.get(KV_MOVE_JOB)).toEqual(taken);
	});
});

describe("stop key", () => {
	it("a pause or cancel found with no call in flight is applied before any work: no statement, the position kept", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const job = await start(kv, src.db);
		await runMoveJob(env(kv, src.db, dst.db), 40);
		const before = (await kv.get<MoveJob>(KV_MOVE_JOB))!;
		expect(before.read.ca_rollup).toBeGreaterThan(0);
		await kv.set(KV_MOVE_STOP, { id: job.id, status: "paused" });
		const n = { v: 0 };
		const paused = await runMoveJob(env(kv, counting(src.db, n), counting(dst.db, n)), 40);
		expect(n.v).toBe(0);
		expect([paused?.status, paused?.t, paused?.after, paused?.read]).toEqual(["paused", before.t, before.after, before.read]);
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.status).toBe("paused");
		await kv.delete(KV_MOVE_STOP);
		await kv.set(KV_MOVE_JOB, { ...(await kv.get<MoveJob>(KV_MOVE_JOB))!, status: "running" });
		await kv.set(KV_MOVE_STOP, { id: job.id, status: "cancelled" });
		const cancelled: string[] = [];
		const c = await runMoveJob(env(kv, counting(src.db, n), counting(dst.db, n), { cron: { schedule: async () => undefined, cancel: async (x) => void cancelled.push(x) } }), 40);
		expect([n.v, c?.status, c?.finished, c?.read]).toEqual([0, "cancelled", NOW, before.read]);
		expect(cancelled).toEqual([MOVE_CRON]);
	});

	it("a pause sent while a chunk is saved: the call keeps the position it reached", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const job = await start(kv, src.db);
		let writes = 0;
		const pausing: Db = {
			...dst.db,
			run: async (q, p) => {
				if (++writes === 2) await kv.set(KV_MOVE_STOP, { id: job.id, status: "paused" });
				return dst.db.run(q, p);
			},
		};
		const j = await runMoveJob(env(kv, src.db, pausing), 40);
		const saved = (await kv.get<MoveJob>(KV_MOVE_JOB))!;
		expect(saved.status).toBe("paused");
		expect(writes).toBeGreaterThan(2);
		expect([saved.t, saved.after, saved.read]).toEqual([j?.t, j?.after, j?.read]);
		expect(Object.values(saved.read).reduce((a, b) => a + b, 0)).toBe(writes * 50);
	});
});

describe("a failed counter write", () => {
	it("refused by the database (a definite SQL error) clears the marker: the retry adds the counts once", async () => {
		const src = await seeded();
		const dst = await fresh();
		await dst.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 10)");
		const kv = new MemoryKv();
		await start(kv, src.db);
		let failed = false;
		const refusing: Db = {
			...dst.db,
			run: async (q, p) => {
				if (q.startsWith("INSERT INTO ca_drops") && !failed) {
					failed = true;
					throw Object.assign(new Error("D1_ERROR: database is locked: SQLITE_BUSY"), {});
				}
				return dst.db.run(q, p);
			},
		};
		await expect(drive(env(kv, src.db, refusing), 40)).rejects.toThrow("SQLITE_BUSY");
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.pending).toBeNull();
		await drive(env(kv, src.db, dst.db), 40);
		expect(await counterN(dst.db, "ca_drops")).toBe(12);
	});

	it("lost after it applied, the retry loads the same rows without adding, though failures halve the chunk", async () => {
		const src = await fresh();
		const dst = await fresh();
		for (let i = 0; i < 60; i++) {
			await src.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, ?, 1)", [`r${String(i).padStart(2, "0")}`]);
			await dst.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, ?, 10)", [`r${String(i).padStart(2, "0")}`]);
		}
		const kv = new MemoryKv();
		await start(kv, src.db);
		let lost = false;
		const lossy: Db = {
			...dst.db,
			run: async (q, p) => {
				const r = await dst.db.run(q, p);
				if (q.startsWith("INSERT INTO ca_drops") && !lost) {
					lost = true;
					throw new Error("D1_ERROR: Network connection lost.");
				}
				return r;
			},
		};
		await expect(drive(env(kv, src.db, lossy), 40)).rejects.toThrow("Network connection lost");
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))).toMatchObject({ pending: { n: 50 }, chunkRows: 25 });
		await drive(env(kv, src.db, dst.db), 40);
		expect(await dst.db.all("SELECT DISTINCT n FROM ca_drops")).toEqual([{ n: 11 }]);
	});

	it("tells a definite SQL error from an unknown outcome", () => {
		const err = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});
		expect(definiteSqlError(err("Postgres error (23505): duplicate key", "23505"))).toBe(true);
		expect(definiteSqlError(err("Postgres error (57014): canceling statement", "57014"))).toBe(true);
		expect(definiteSqlError(err("D1_ERROR: string or blob too big: SQLITE_TOOBIG"))).toBe(true);
		expect(definiteSqlError(err("too big", "SQLITE_TOOBIG"))).toBe(true);
		expect(definiteSqlError(err("Postgres is overloaded or unreachable (08006): connection failure", "08006"))).toBe(false);
		expect(definiteSqlError(err("Postgres is overloaded or unreachable (57P01): terminating", "57P01"))).toBe(false);
		expect(definiteSqlError(err("write EPIPE", "EPIPE"))).toBe(false);
		expect(definiteSqlError(err("Query read timeout"))).toBe(false);
		expect(definiteSqlError(err("D1_ERROR: Network connection lost."))).toBe(false);
	});
});

describe("the check", () => {
	it("finds a source row missing on a day where the destination holds more rows, and compares real columns", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		await start(kv, src.db);
		await drive(env(kv, src.db, dst.db), 400);
		// The destination lost the source's row of the day but holds two rows of its own: more rows, a higher sum.
		await dst.db.run("DELETE FROM ca_srv WHERE path = '/x'");
		await dst.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/y', '', 3, 1), ('default', 20260605, 404, '/z', '', 3, 1)");
		const srv = await verifyTable(src.db, dst.db, "ca_srv");
		expect([srv.short, srv.more, srv.byKey]).toEqual([1, 0, 1]);
		expect(srv.sample).toEqual([{ key: "default 20260605", source: { site: "default", day: "20260605", status: "404", path: "/x", ref: "" }, dest: null }]);
		// Only a real column differs.
		await dst.db.run("UPDATE ca_search_daily SET pos_sum = pos_sum - 1");
		expect((await verifyTable(src.db, dst.db, "ca_search_daily")).short).toBe(1);
		// Days before the destination's detailed window are not compared, and the result says from which day it compared.
		const late = await verifyTable(src.db, dst.db, "ca_srv", undefined, "2026-06-06");
		expect([late.from, late.keys, late.skipped, late.short]).toEqual(["2026-06-06", 0, 1, 0]);
	});

	it("the job checks those days key by key across calls and only inside the detailed window", async () => {
		const src = await seeded();
		const dst = await fresh();
		await dst.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/y', '', 3, 1), ('default', 20260605, 404, '/z', '', 3, 1)");
		// The server hits chunk is lost on its way: the write reports success and stores nothing.
		const losing: Db = { ...dst.db, run: async (q, p) => (q.startsWith("INSERT INTO ca_srv") ? { changes: 0 } : dst.db.run(q, p)) };
		const kv = new MemoryKv();
		await start(kv, src.db);
		await drive(env(kv, src.db, losing, { settings: { rawRetentionDays: 7, siteTimezone: "UTC" } }), 40);
		const job = (await kv.get<MoveJob>(KV_MOVE_JOB))!;
		expect([job.verify.ca_srv?.short, job.verify.ca_srv?.byKey]).toEqual([1, 1]);
		expect(job.verify.ca_sessions?.from).toBe("2026-06-02");
		expect(job.verify.ca_sessions?.skipped).toBeGreaterThan(0);
		expect(job.vk).toBeUndefined();
	});
});

describe("chunk size and failures", () => {
	it("200 visits with 64 KB documents reach a database that refuses a parameter over 2 MB", async () => {
		const src = await fresh();
		const doc = JSON.stringify([{ p: `/${"x".repeat(64_000)}` }]);
		for (let i = 0; i < 200; i++)
			await src.db.run(
				"INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, pageviews, events, engaged_ms, visible_ms, reentries, max_scroll, interacted, hits) VALUES ('default', '2026-06-05', ?, 'v', 1, ?, ?, 0, 1, 0, 0, 0, 0, 0, 0, jsonb(?))",
				[`s${String(i).padStart(3, "0")}`, NOW - i, NOW - i, doc],
			);
		const dst = await fresh();
		const d1Like: Db = {
			...dst.db,
			run: async (q, p) => {
				if ((p ?? []).some((v) => typeof v === "string" && Buffer.byteLength(v) > 2_000_000)) throw new Error("D1_ERROR: string or blob too big: SQLITE_TOOBIG");
				return dst.db.run(q, p);
			},
		};
		const kv = new MemoryKv();
		await start(kv, src.db);
		await drive(env(kv, src.db, d1Like, { profile: "standard" }), 400);
		expect(await dst.db.all("SELECT COUNT(*) AS n FROM ca_sessions")).toEqual([{ n: 200 }]);
	});

	it("a chunk that keeps failing: the rows halve after each failure and the job pauses with the error after five at one position", async () => {
		const src = await seeded();
		const dst = await fresh();
		const broken: Db = { ...dst.db, run: async (q, p) => (q.startsWith("INSERT INTO ca_rollup") ? Promise.reject(new Error("D1_ERROR: Network connection lost.")) : dst.db.run(q, p)) };
		const kv = new MemoryKv();
		await start(kv, src.db);
		const rows: Array<number | undefined> = [];
		for (let i = 0; i < MOVE_MAX_FAILS; i++) {
			await expect(runMoveJob(env(kv, src.db, broken), 40)).rejects.toThrow("Network connection lost");
			rows.push((await kv.get<MoveJob>(KV_MOVE_JOB))?.chunkRows);
		}
		expect(rows).toEqual([25, 12, 6, 3, 1]);
		const j = (await kv.get<MoveJob>(KV_MOVE_JOB))!;
		expect(j.status).toBe("paused");
		expect(j.error).toContain(`stopped after ${MOVE_MAX_FAILS} failed tries`);
		expect(j.error).toContain("ca_rollup");
		// Resumed with a working database, it finishes; the smaller chunks end with the table.
		await kv.set(KV_MOVE_JOB, { ...j, status: "running" });
		await drive(env(kv, src.db, dst.db), 40);
		expect(await totals(dst.db)).toEqual(await totals(src.db));
	});
});

describe("day rows on small into D1", () => {
	it("the copy stops at the day's rows, counts them for the write guard, waits until 00:00 UTC and then goes on", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		await kv.set(KV_COPY_ROWS, { day: "2026-06-09", rows: COPY_DAY_ROWS - 30 });
		await kv.set(KV_WRITE_BUDGET, writeBudget({ visits: 0, pageviews: 0, events: 0 }, "2026-06-09", NOW));
		const guard = (await kv.get<WriteBudget>(KV_WRITE_BUDGET))!.rows;
		await start(kv, src.db);
		for (let i = 0; i < 5; i++) await runMoveJob(env(kv, src.db, dst.db), 40);
		const j = (await kv.get<MoveJob>(KV_MOVE_JOB))!;
		expect(j.status).toBe("running");
		expect(j.until).toBe(nextUtcMidnight(NOW));
		expect(await kv.get(KV_COPY_ROWS)).toEqual({ day: "2026-06-09", rows: COPY_DAY_ROWS });
		expect(Object.values(j.inserted).reduce((a, b) => a + b, 0)).toBe(30);
		expect((await kv.get<WriteBudget>(KV_WRITE_BUDGET))!.rows).toBe(guard + 30);
		expect(moveView(j)?.rowsLeftToday).toBe(0);
		// The same day: no statement.
		const n = { v: 0 };
		await runMoveJob(env(kv, counting(src.db, n), counting(dst.db, n), { now: NOW + 3600 }), 40);
		expect(n.v).toBe(0);
		// After 00:00 UTC it goes on.
		await drive(env(kv, src.db, dst.db, { now: NOW + 86_400 }), 40);
		expect(await totals(dst.db)).toEqual(await totals(src.db));
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.until).toBeUndefined();
	});

	it("on standard, or into Postgres, no day rows apply", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		await kv.set(KV_COPY_ROWS, { day: "2026-06-09", rows: COPY_DAY_ROWS });
		await start(kv, src.db);
		await drive(env(kv, src.db, dst.db, { profile: "standard" }), 400);
		expect((await kv.get<MoveJob>(KV_MOVE_JOB))?.today).toBeUndefined();
		expect(await kv.get(KV_COPY_ROWS)).toEqual({ day: "2026-06-09", rows: COPY_DAY_ROWS });
	});
});
