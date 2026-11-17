/** Data move routes: one database under two names, the schema version after a drop, resume of a cancelled move, pause and cancel through the stop key. */
import { describe, expect, it } from "vitest";
import type { Db } from "../src/db/adapter.js";
import { ensureSchema, SCHEMA_VERSION_KEY } from "../src/db/schema.js";
import { KV_MOVE_JOB, KV_MOVE_STOP, MOVE_ORDER, type MoveJob, newMoveJob, type VerifyTable } from "../src/move/job.js";
import { moveRoutes, type MoveRoutesEnv, sameDatabase } from "../src/routes/move.js";
import { normalizeSettings } from "../src/settings.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { MemoryKv, memoryDb } from "./helpers.js";

const NOW = 1_780_974_000;
const START = NOW - 8 * 86_400;
type State = { job: (MoveJob & { percent: number }) | null };

async function fresh() {
	const m = memoryDb();
	await ensureSchema(m.db, new MemoryKv());
	return m;
}
async function seeded() {
	const m = await fresh();
	await recordTraffic(m.db, generateTraffic({ pageviews: 200, seed: 4, start: START, spanSeconds: 6 * 86_400 - 1 }));
	await m.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 3, 1)");
	await m.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 2)");
	return m;
}
/** Another `Db` object over the same database, as a second binding of it would give. */
const alias = (db: Db): Db => ({ dialect: db.dialect, run: (q, p) => db.run(q, p), all: (q, p) => db.all(q, p), batch: (s) => db.batch(s) });
const tablesOf = (m: ReturnType<typeof memoryDb>) => m.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ca_%' ORDER BY name").all();
const n = (m: ReturnType<typeof memoryDb>, t: string) => (m.raw.prepare(`SELECT SUM(n) AS n FROM ${t}`).get() as { n: number }).n;

function routes(kv: MemoryKv, env: Partial<MoveRoutesEnv> & Pick<MoveRoutesEnv, "source" | "dest">, profile: "small" | "standard" = "standard") {
	const r = moveRoutes({ settings: async () => normalizeSettings({ capacityProfile: profile }), destKv: (k) => k, destBinding: () => "CA_NEW", targets: () => ["CA_NEW"], now: () => NOW, ...env });
	return (name: keyof typeof r, input: unknown = {}) => r[name].handler({ input, kv } as never) as Promise<State>;
}
/** A finished move whose check found nothing missing. */
function doneJob(source: string | null): MoveJob {
	const clean: VerifyTable = { keys: 1, short: 0, more: 0, sample: [] };
	return { ...newMoveJob({ source, dest: "CA_NEW", by: null, now: NOW, total: {}, state: {} }), status: "done", t: MOVE_ORDER.length, v: MOVE_ORDER.length, verify: Object.fromEntries(MOVE_ORDER.map((t) => [t, clean])) };
}

describe("one database under two names", () => {
	it("sameDatabase sees the marker through a second binding only, and leaves no marker", async () => {
		const a = await fresh();
		const b = await fresh();
		expect(await sameDatabase(a.db, alias(a.db))).toBe(true);
		expect(await sameDatabase(a.db, b.db)).toBe(false);
		expect(tablesOf(a).map((r) => (r as { name: string }).name).filter((x) => x.startsWith("ca_same_"))).toEqual([]);
	});

	it("the EmDash database typed by its binding name is refused at start and at drop", async () => {
		const live = await seeded();
		const kv = new MemoryKv();
		// No database option: every site writes to the EmDash database; the admin types its binding name.
		const call = routes(kv, { source: async (b) => (b === "DB" || b === null ? alias(live.db) : null), dest: async () => alias(live.db), destBinding: () => null, targets: () => [null] });
		await expect(call("move/start", { source: null })).rejects.toThrow("already writes");
		await expect(call("move/start", { source: "DB" })).rejects.toThrow("under another name");
		expect(await kv.get(KV_MOVE_JOB)).toBeNull();
		expect(n(live, "ca_srv")).toBe(3);
		await kv.set(KV_MOVE_JOB, doneJob("DB"));
		await expect(call("move/drop-old-tables", { confirm: "DELETE" })).rejects.toThrow("under another name");
		expect(tablesOf(live).length).toBe(MOVE_ORDER.length);
	});

	it("a second binding of a routed database is refused without a site", async () => {
		const routed = await seeded();
		const dst = await fresh();
		const call = routes(new MemoryKv(), { source: async (b) => (b === "CA_OLD" || b === "CA_OTHER" ? alias(routed.db) : null), dest: async () => dst.db, targets: () => ["CA_NEW", "CA_OTHER"] });
		await expect(call("move/start", { source: "CA_OLD" })).rejects.toThrow("Choose the site");
	});
});

describe("drop from the EmDash database", () => {
	it("deletes the schema version, so ensureSchema creates the tables again", async () => {
		const host = await seeded();
		const kv = new MemoryKv();
		await ensureSchema(host.db, kv);
		expect(await kv.get(SCHEMA_VERSION_KEY)).toBe(1);
		const call = routes(kv, { source: async (b) => (b === null ? host.db : null), dest: async () => (await fresh()).db });
		await kv.set(KV_MOVE_JOB, doneJob(null));
		expect((await call("move/drop-old-tables", { confirm: "DELETE" })).job?.dropped).toBe(NOW);
		expect(tablesOf(host)).toEqual([]);
		expect(await kv.get(SCHEMA_VERSION_KEY)).toBeNull();
		await ensureSchema(host.db, kv);
		expect(tablesOf(host).length).toBe(MOVE_ORDER.length);
		await host.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 1, 'x', 1)");
	});

	it("also when the EmDash database was typed by its binding name; another database keeps the host's version", async () => {
		const host = await seeded();
		const other = await seeded();
		const kv = new MemoryKv();
		await kv.set(SCHEMA_VERSION_KEY, 1);
		const call = routes(kv, { source: async (b) => (b === null || b === "DB" ? alias(host.db) : b === "CA_OLD" ? other.db : null), dest: async () => (await fresh()).db });
		await kv.set(KV_MOVE_JOB, doneJob("CA_OLD"));
		await call("move/drop-old-tables", { confirm: "DELETE" });
		expect(tablesOf(other)).toEqual([]);
		expect(await kv.get(SCHEMA_VERSION_KEY)).toBe(1);
		await kv.set(KV_MOVE_JOB, doneJob("DB"));
		await call("move/drop-old-tables", { confirm: "DELETE" });
		expect(tablesOf(host)).toEqual([]);
		expect(await kv.get(SCHEMA_VERSION_KEY)).toBeNull();
	});
});

describe("start again", () => {
	it("after a cancel continues the cancelled job from its position, and the counters are loaded once", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const call = routes(kv, { source: async (b) => (b === "CA_OLD" ? src.db : null), dest: async () => dst.db }, "small");
		const first = await call("move/start", { source: "CA_OLD" });
		// The first tables are empty here: run until rows were copied.
		for (let i = 0; i < 20 && !Object.values((await call("move/run")).job?.read ?? {}).some((x) => x > 0); i++);
		const cancelled = await call("move/cancel");
		expect(cancelled.job?.status).toBe("cancelled");
		const read = cancelled.job?.read ?? {};
		expect(Object.values(read).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
		const again = await call("move/start", { source: "CA_OLD" });
		expect(again.job?.id).toBe(first.job?.id);
		expect(again.job?.status).toBe("running");
		for (const t of MOVE_ORDER) expect(again.job?.read[t]).toBeGreaterThanOrEqual(read[t] ?? 0);
		let s = again;
		for (let i = 0; i < 300 && s.job?.status !== "done"; i++) s = await call("move/run");
		expect(s.job?.status).toBe("done");
		expect(n(dst, "ca_srv")).toBe(3);
		expect(n(dst, "ca_drops")).toBe(2);
	});

	it("after a finished move adds no counter twice", async () => {
		const src = await seeded();
		const dst = await fresh();
		const kv = new MemoryKv();
		const call = routes(kv, { source: async (b) => (b === "CA_OLD" ? src.db : null), dest: async () => dst.db });
		expect((await call("move/start", { source: "CA_OLD" })).job?.status).toBe("done");
		const again = await call("move/start", { source: "CA_OLD" });
		expect(again.job?.status).toBe("done");
		expect(n(dst, "ca_srv")).toBe(3);
		expect(n(dst, "ca_drops")).toBe(2);
		expect(again.job?.verify.ca_srv?.short).toBe(0);
	});
});

/** A host KV where the next read of the job is followed by `then` (a call in flight saving between two steps of a route). */
class RacingKv extends MemoryKv {
	then: (() => Promise<void>) | undefined;
	override async get<T>(key: string) {
		const v = await super.get<T>(key);
		const f = key === KV_MOVE_JOB ? this.then : undefined;
		if (f) {
			this.then = undefined;
			await f();
		}
		return v;
	}
}

describe("pause and cancel write only the stop key", () => {
	for (const [route, status] of [["move/pause", "paused"], ["move/cancel", "cancelled"]] as const)
		it(`${route}: a chunk saved while the route runs keeps its position`, async () => {
			const src = await seeded();
			const dst = await fresh();
			const kv = new RacingKv();
			const call = routes(kv, { source: async () => src.db, dest: async () => dst.db });
			// A call in flight holds the lease at position 0.
			const job = { ...newMoveJob({ source: "CA_OLD", dest: "CA_NEW", by: null, now: NOW, total: { ca_rollup: 100 }, state: {} }), lease: NOW + 60, holder: "other" };
			await kv.set(KV_MOVE_JOB, job);
			// It saves a chunk and ends right after the route read the job.
			const later = { ...job, after: ["k"], read: { ...job.read, ca_rollup: 50 } } as MoveJob;
			delete later.lease;
			delete later.holder;
			kv.then = () => kv.set(KV_MOVE_JOB, later);
			const r = await call(route);
			const stored = (await kv.get<MoveJob>(KV_MOVE_JOB)) as MoveJob;
			expect(stored.read.ca_rollup).toBe(50);
			expect(stored.after).toEqual(["k"]);
			expect(stored.status).toBe(status);
			expect(r.job?.status).toBe(status);
		});

	it("while a call holds the lease the job is not written; the stop key waits for that call", async () => {
		const kv = new MemoryKv();
		const db = (await fresh()).db;
		const call = routes(kv, { source: async () => db, dest: async () => db });
		const job = { ...newMoveJob({ source: "CA_OLD", dest: "CA_NEW", by: null, now: NOW, total: {}, state: {} }), lease: NOW + 60, holder: "other" };
		await kv.set(KV_MOVE_JOB, job);
		await call("move/pause");
		expect(await kv.get(KV_MOVE_JOB)).toEqual(job);
		expect(await kv.get(KV_MOVE_STOP)).toEqual({ id: job.id, status: "paused" });
		// A cancel sent before the pause was applied is not turned into a pause.
		await call("move/cancel");
		await call("move/pause");
		expect(await kv.get(KV_MOVE_STOP)).toEqual({ id: job.id, status: "cancelled" });
		// Resume withdraws a stop no call has applied yet and leaves the job to its call.
		await call("move/pause", { resume: true });
		expect(await kv.get(KV_MOVE_STOP)).toBeNull();
		expect(await kv.get(KV_MOVE_JOB)).toEqual(job);
	});
});
