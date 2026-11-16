/** Drop counters: per isolate, flushed in one statement, never above the truth. */
import { describe, expect, it } from "vitest";
import { DropCounters, type DropKind, dropsFlushSql } from "../src/core/drops.js";
import type { Db } from "../src/db/adapter.js";
import { ensureSchema } from "../src/db/schema.js";
import { rng } from "./capacity.helpers.js";
import { MemoryKv, meteredDb, schemaDb } from "./helpers.js";

const DAY = "2026-06-10";
const REASONS: DropKind[] = ["bot", "privacy_signal", "overload", "write_error", "orphan_update", "duplicate_order", "budget_blocked"];

/** A Db whose writes wait for `open()` and fail while `failing` is set. */
function gated(db: Db) {
	const waiting: Array<() => void> = [];
	const g = {
		failing: false,
		db: {
			dialect: db.dialect,
			all: db.all.bind(db),
			batch: db.batch.bind(db),
			async run(sql: string, params?: unknown[]) {
				await new Promise<void>((r) => waiting.push(r));
				if (g.failing) throw new Error("D1 DB is overloaded. Requests queued for too long.");
				return db.run(sql, params as never);
			},
		} as Db,
		/** Let the oldest waiting write go on. */
		async open() {
			waiting.shift()?.();
			await new Promise((r) => setTimeout(r, 0));
		},
		get waiting() {
			return waiting.length;
		},
	};
	return g;
}

type Env = Awaited<ReturnType<typeof schemaDb>>;
const stored = (env: Env) =>
	Object.fromEntries((env.raw.prepare("SELECT site || '/' || reason AS k, n FROM ca_drops").all() as Array<{ k: string; n: number }>).map((r) => [r.k, r.n]));

describe("drop counters", () => {
	it("isolates count locally and flushes add up: interleaved and failing flushes never exceed the truth, and end equal to it", async () => {
		const env = await schemaDb();
		const g = gated(env.db);
		const isolates = [new DropCounters(), new DropCounters(), new DropCounters()];
		const truth: Record<string, number> = {};
		const inflight: Array<Promise<unknown>> = [];
		const rand = rng(11);
		const check = () => {
			for (const [k, n] of Object.entries(stored(env))) expect(n, k).toBeLessThanOrEqual(truth[k] ?? 0);
		};
		for (let step = 0; step < 400; step++) {
			const r = rand();
			const iso = isolates[Math.floor(rand() * isolates.length)] as DropCounters;
			if (r < 0.6) {
				const site = rand() < 0.5 ? "default" : "blog";
				const reason = REASONS[Math.floor(rand() * REASONS.length)] as DropKind;
				iso.add(site, DAY, reason);
				truth[`${site}/${reason}`] = (truth[`${site}/${reason}`] ?? 0) + 1;
			} else if (r < 0.8) {
				inflight.push(iso.flush(g.db).catch(() => "failed"));
			} else if (g.waiting) {
				g.failing = rand() < 0.3;
				await g.open();
			}
			check();
		}
		// Drain: every pending write goes through, then every isolate flushes what it kept.
		g.failing = false;
		while (g.waiting) await g.open();
		await Promise.all(inflight);
		for (const iso of isolates) {
			const p = iso.flush(g.db);
			while (g.waiting) await g.open();
			await p;
		}
		expect(stored(env)).toEqual(truth);
	});

	it("a failed flush keeps its counts; a flush that runs meanwhile writes only the newer ones; the next flush writes the rest", async () => {
		const env = await schemaDb();
		const g = gated(env.db);
		const c = new DropCounters();
		c.add("default", DAY, "bot", 3);
		const a = c.flush(g.db);
		a.catch(() => {});
		c.add("default", DAY, "bot", 2);
		c.add("default", DAY, "overload");
		const b = c.flush(g.db);
		g.failing = true;
		await g.open(); // a fails
		await expect(a).rejects.toThrow(/overloaded/);
		expect(c.rows()).toEqual([{ site: "default", day: 20260610, reason: "bot", n: 3 }]);
		g.failing = false;
		await g.open(); // b writes 2 bots and 1 overload
		expect(await b).toBe(2);
		expect(stored(env)).toEqual({ "default/bot": 2, "default/overload": 1 });
		const next = c.flush(g.db);
		await g.open();
		expect(await next).toBe(1);
		expect(stored(env)).toEqual({ "default/bot": 5, "default/overload": 1 });
		expect(c.size).toBe(0);
	});

	it("a lost isolate is the only undercount", async () => {
		const env = await schemaDb();
		const kept = new DropCounters();
		const lost = new DropCounters();
		kept.add("default", DAY, "bot", 4);
		lost.add("default", DAY, "bot", 6);
		await kept.flush(env.db);
		// `lost` dies before its window ends: its 6 never reach the table.
		expect(stored(env)).toEqual({ "default/bot": 4 });
	});

	it("one statement per flush and one row written per site, day and reason; nothing to flush costs nothing", async () => {
		const m = meteredDb();
		await ensureSchema(m.db, new MemoryKv());
		m.reset();
		const c = new DropCounters();
		expect(await c.flush(m.db)).toBe(0);
		expect(m.stats.statements).toBe(0);
		for (let i = 0; i < 500; i++) c.add("default", DAY, REASONS[i % 3] as DropKind);
		await c.flush(m.db);
		expect(m.stats).toMatchObject({ statements: 1, rowsWritten: 3 });
		for (let i = 0; i < 9; i++) c.add("default", DAY, REASONS[i % 3] as DropKind);
		await c.flush(m.db);
		expect(m.stats).toMatchObject({ statements: 2, rowsWritten: 6 });
		expect(m.raw.prepare("SELECT reason, n FROM ca_drops ORDER BY reason").all()).toEqual([
			{ reason: "bot", n: 170 },
			{ reason: "overload", n: 169 },
			{ reason: "privacy_signal", n: 170 },
		]);
	});

	it("settle flushes due counters, otherwise one request waits out the window and the others return at once", async () => {
		const env = await schemaDb();
		let now = 1_000_000;
		const sleeps: number[] = [];
		let wake = () => {};
		const c = new DropCounters(10_000, () => now, (ms) => (sleeps.push(ms), new Promise<void>((r) => (wake = r))));
		await c.settle(env.db); // nothing pending
		c.add("default", DAY, "bot");
		now += 4_000;
		const first = c.settle(env.db);
		await c.settle(env.db); // armed by the first: returns without waiting or writing
		expect(sleeps).toEqual([6_000]);
		expect(env.count("ca_drops")).toBe(0);
		c.add("default", DAY, "bot");
		now += 6_000;
		wake();
		await first;
		expect(stored(env)).toEqual({ "default/bot": 2 });
		c.add("default", DAY, "invalid");
		now += 10_000;
		await c.settle(env.db); // due at once
		expect(sleeps).toHaveLength(1);
		expect(stored(env)).toEqual({ "default/bot": 2, "default/invalid": 1 });
	});

	it("settle never throws: a failed flush keeps its counts and starts the window again", async () => {
		const env = await schemaDb();
		let now = 0;
		const sleeps: number[] = [];
		const c = new DropCounters(10_000, () => now, async (ms) => void sleeps.push(ms));
		c.add("default", DAY, "bot");
		now = 20_000;
		const broken = { ...env.db, run: () => Promise.reject(new Error("no")) } as Db;
		await c.settle(broken);
		expect([c.size, sleeps]).toEqual([1, []]);
		// The next request does not flush at once against a failing database: it waits a whole window.
		await c.settle(broken);
		expect(sleeps).toEqual([10_000]);
	});

	it("builds one statement over a JSON parameter on both dialects (Postgres UNVERIFIED: text only)", () => {
		const rows = [{ site: "default", day: 20260610, reason: "bot" as const, n: 2 }];
		expect(dropsFlushSql("sqlite", rows)).toEqual({
			sql: "INSERT INTO ca_drops (site, day, reason, n) SELECT (x.value ->> 'site'), (x.value ->> 'day'), (x.value ->> 'reason'), (x.value ->> 'n') FROM json_each(?) AS x WHERE 1 = 1 ON CONFLICT (site, day, reason) DO UPDATE SET n = ca_drops.n + excluded.n WHERE excluded.n <> 0",
			params: ['[{"site":"default","day":20260610,"reason":"bot","n":2}]'],
		});
		expect(dropsFlushSql("postgres", rows).sql).toBe(
			"INSERT INTO ca_drops (site, day, reason, n) SELECT (x.value ->> 'site'), CAST((x.value ->> 'day') AS BIGINT), (x.value ->> 'reason'), CAST((x.value ->> 'n') AS BIGINT) FROM jsonb_array_elements(CAST(? AS JSONB)) AS x(value) WHERE 1 = 1 ON CONFLICT (site, day, reason) DO UPDATE SET n = ca_drops.n + excluded.n WHERE excluded.n <> 0",
		);
	});
});
