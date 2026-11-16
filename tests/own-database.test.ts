/**
 * Own database for the analytics tables (plugin option `database`): generator traffic through the recorder, the
 * summaries, the reports and retention on a fake D1 binding, while the plugin's KV stays on the host database.
 * Also: real `batch()` round trips, the schema created once, the queue consumer, and a missing binding.
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());
import { PLUGIN_ID } from "../src/contract.js";
import { drops } from "../src/core/drops.js";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { D1Sink, type IngestSink } from "../src/core/apply.js";
import { QueueSink, type QueueLike } from "../src/core/queue-sink.js";
import { dayInZone, zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { fromD1 } from "../src/db/d1.js";
import { factsDb, missingDb } from "../src/db/facts.js";
import { optionsKv } from "../src/db/options-kv.js";
import { ensureSchema, ownDatabase, SCHEMA_VERSION, SCHEMA_VERSION_KEY, TABLES } from "../src/db/schema.js";
import cookielessAnalytics from "../src/index.js";
import { parseOptions } from "../src/multisite/config.js";
import { QuerySchema } from "../src/query/filters.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { KV_CURSOR, type RetentionCursor, runRetention } from "../src/query/retention.js";
import { runRollup } from "../src/query/rollup.js";
import { estimateStorage, MAX_SCALE } from "../src/query/storage.js";
import { handleQueue, type QueuedMessage } from "../src/queue.js";
import { inRoute, isOverload } from "../src/routes/in.js";
import { normalizeSettings } from "../src/settings.js";
import { generateTraffic, type Traffic } from "./capacity.helpers.js";
import { fakeD1, tableNames } from "./d1.helpers.js";
import { eventRequest, MemoryKv, memoryDb, meteredDb } from "./helpers.js";
import { ctx, fakeEnv } from "./routes.helpers.js";

const START = zonedToEpoch("2026-06-01", 0, "UTC");
/** Ten days of traffic; NOW is two days after the last one, so every day is closed. */
const NOW = zonedToEpoch("2026-06-13", 3, "UTC");
const S = normalizeSettings({});

/** The host database: only the host's `options` table, as EmDash keeps it, and the plugin KV over it. */
function hostDb() {
	const m = memoryDb();
	m.raw.exec("CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT)");
	return { ...m, kv: optionsKv(m.db, PLUGIN_ID) };
}

async function drive(db: Db, kv: ReturnType<typeof optionsKv>, traffic: Traffic, sink: IngestSink = new D1Sink(db)) {
	resetCounters();
	for (const a of traffic.actions) {
		const body = validateIngest(a.body);
		if (!body) throw new Error("invalid generated body");
		await recordClientEvent({ db, kv, settings: S, now: a.at, sink }, body, requestInfo(eventRequest(a.body, { "cf-connecting-ip": a.ip }, a.url)));
	}
}

const sum = (raw: Database.Database, sql: string) => Number((raw.prepare(sql).get() as { n: number | null }).n ?? 0);

beforeEach(() => {
	resetCounters();
	drops.clear();
	clearReportCache();
});

describe("own database: every fact on the D1 binding, every option on the host", () => {
	it("recorder, summaries, reports and retention run on the own database; the host keeps only options", async () => {
		const host = hostDb();
		const d1 = fakeD1();
		const dbFor = factsDb({ binding: "CA_DB" }, async () => host.db, async () => ({ CA_DB: d1 }));
		const db = await dbFor("default");
		expect(await dbFor("other-site")).toBe(db); // one database for every site until site routing

		const traffic = generateTraffic({ pageviews: 800, seed: 21, rich: true, start: START, spanSeconds: 10 * 86_400 - 1 });
		await drive(db, host.kv, traffic);
		expect(sum(d1.raw, "SELECT SUM(pageviews) AS n FROM ca_sessions")).toBe(traffic.counts.pageviews);
		expect(sum(d1.raw, "SELECT COUNT(*) AS n FROM ca_sessions")).toBe(traffic.counts.sessions);

		// Summaries: every closed day, through the real batch.
		const rc = { db, settings: S, goals: async () => [] };
		let tick = await runRollup(rc, host.kv, NOW);
		for (let i = 0; i < 50 && !tick.done; i++) tick = await runRollup(rc, host.kv, NOW);
		expect(sum(d1.raw, "SELECT COUNT(*) AS n FROM ca_rollup")).toBeGreaterThan(100);

		// Reports: the detailed answer and the summary answer agree on the own database.
		const report = { db, site: "default", settings: S, now: NOW, goals: [], funnels: {}, annotations: [], defaultCurrency: "USD" };
		const q = { report: "overview" as const, query: QuerySchema.parse({ from: "2026-06-01", to: "2026-06-10" }), limit: 100 };
		const detailed = await runReport(report, q);
		clearReportCache();
		const summary = await runReport({ ...report, rawFrom: "2030-01-01" }, q);
		expect(detailed.data.totals?.pageviews).toBe(traffic.counts.pageviews);
		expect(summary.data.totals).toEqual(detailed.data.totals);

		// Drop counters flush to the own database.
		drops.add("default", "2026-06-12", "invalid", 2);
		await drops.flush(db);
		expect(sum(d1.raw, "SELECT SUM(n) AS n FROM ca_drops")).toBe(2);

		// Retention: a 7 day window deletes the first days; the storage estimate reads size_after of the binding.
		const before = sum(d1.raw, "SELECT COUNT(*) AS n FROM ca_sessions");
		const rs = { ...S, rawRetentionDays: 7 };
		let r = await runRetention(db, host.kv, rs, NOW);
		for (let i = 0; i < 100 && !r.done; i++) r = await runRetention(db, host.kv, rs, NOW);
		expect(r.done).toBe(true);
		expect(sum(d1.raw, "SELECT COUNT(*) AS n FROM ca_sessions")).toBeLessThan(before);
		expect(String((d1.raw.prepare("SELECT MIN(day) AS d FROM ca_sessions").get() as { d: string }).d) >= "2026-06-06").toBe(true);
		const cursor = await host.kv.get<RetentionCursor>(KV_CURSOR);
		expect(cursor?.storage?.measured).toBe(true);

		// Placement: no analytics table on the host, no option row (nor an options table) on the own database.
		expect(tableNames(host.raw)).toEqual(["options"]);
		expect(tableNames(d1.raw).sort()).toEqual([...TABLES, "ca_meta"].sort());
		const names = (host.raw.prepare("SELECT name FROM options ORDER BY name").all() as Array<{ name: string }>).map((o) => o.name.replace(`plugin:${PLUGIN_ID}:`, ""));
		expect(names).toEqual(expect.arrayContaining([KV_CURSOR]));
		expect(names.some((n) => n.startsWith("salt"))).toBe(true);
		// The host KV never records the own database's schema, so removing the option later creates the host tables.
		expect(names).not.toContain(SCHEMA_VERSION_KEY);
		console.log(`[own-db] ${traffic.counts.pageviews} pv, ${traffic.counts.sessions} visits; D1 binding: ${d1.stats.statements} statements in ${d1.stats.roundTrips} round trips; host: ${names.length} option rows`);
	});

	it("the storage estimate takes size_after into account, only to tighten it and by at most MAX_SCALE", async () => {
		const d1 = fakeD1();
		const db = ownDatabase(fromD1(d1));
		await ensureSchema(db, new MemoryKv());
		const kv = new MemoryKv();
		await drive(db, optionsKv(hostDb().db, PLUGIN_ID), generateTraffic({ pageviews: 300, seed: 3, start: START, spanSeconds: 5 * 86_400 }));
		let t = await runRollup({ db, settings: S, goals: async () => [] }, kv, NOW);
		for (let i = 0; i < 30 && !t.done; i++) t = await runRollup({ db, settings: S, goals: async () => [] }, kv, NOW);
		// The same database reporting a chosen size.
		const sized = (size_after: number | undefined): Db => ({ dialect: db.dialect, run: db.run, all: db.all, batch: db.batch, meta: size_after === undefined ? undefined : { size_after } });
		const at = (size?: number) => estimateStorage(sized(size), S, "2026-06-13");
		const plain = await at(undefined);
		expect(plain.measured).toBeUndefined();
		// A file 1.2 times the estimate: the detailed bytes follow the file.
		const near = await at(plain.detail * 1.2 + plain.summary);
		expect(near.measured).toBe(true);
		expect(near.detail).toBeCloseTo(plain.detail * 1.2, -1);
		// Far above (Search rows, free pages): capped at MAX_SCALE, so the window cannot collapse to a day.
		expect((await at(plain.bytes * 100)).detail).toBeCloseTo(plain.detail * MAX_SCALE, -1);
		// Smaller than the estimate: the estimate stays.
		expect((await at(1)).detail).toBe(plain.detail);
		// The real binding reports its own size after the estimate's statements.
		expect((await estimateStorage(db, S, "2026-06-13")).measured).toBe(true);
	});
});

describe("own database: batch is one round trip", () => {
	it("the summary writer sends a day in one batch where the Kysely adapter loops", async () => {
		// The same visits in two copies of one database: one written through the real batch, one through a loop.
		const seed = fakeD1();
		const seedDb = ownDatabase(fromD1(seed));
		await ensureSchema(seedDb, new MemoryKv());
		await drive(seedDb, optionsKv(hostDb().db, PLUGIN_ID), generateTraffic({ pageviews: 600, seed: 8, start: START, spanSeconds: 6 * 86_400 }));
		const a = fakeD1(new Database(seed.raw.serialize()));
		const b = fakeD1(new Database(seed.raw.serialize()));
		const real = fromD1(a);
		const viaB = fromD1(b);
		// The Kysely adapter's batch: one round trip per statement.
		const looped: Db = {
			dialect: "sqlite",
			run: viaB.run,
			all: viaB.all,
			async batch(stmts) {
				for (const s of stmts) await viaB.run(s.sql, s.params);
			},
		};
		const roll = async (db: Db) => {
			const kv = new MemoryKv();
			let t = await runRollup({ db, settings: S, goals: async () => [] }, kv, NOW);
			for (let i = 0; i < 30 && !t.done; i++) t = await runRollup({ db, settings: S, goals: async () => [] }, kv, NOW);
		};
		await roll(real);
		await roll(looped);
		const rows = (raw: Database.Database) => raw.prepare("SELECT * FROM ca_rollup ORDER BY site, dim, seg, day, key, segkey").all();
		expect(rows(a.raw)).toEqual(rows(b.raw));
		expect(a.stats.statements).toBe(b.stats.statements);
		// Every summary write statement went in a batch; the loop pays one round trip for each of them.
		expect(a.stats.batched).toBeGreaterThan(a.stats.batches);
		expect(b.stats.roundTrips - a.stats.roundTrips).toBe(a.stats.batched - a.stats.batches);
		// Drop counters were already one statement per flush: one round trip either way.
		const before = a.stats.roundTrips;
		drops.add("default", "2026-06-12", "invalid", 1);
		drops.add("default", "2026-06-12", "bot", 4);
		await drops.flush(real);
		expect(a.stats.roundTrips - before).toBe(1);
		console.log(`[own-db] summaries of ${rows(a.raw).length} rows: ${a.stats.statements} statements, of them ${a.stats.batched} writes in ${a.stats.batches} batches; round trips ${b.stats.roundTrips} with a loop, ${a.stats.roundTrips - 1} with batch()`);
	});

	it("maps bind values, exposes the last meta and names D1 overload code 7429", async () => {
		const d1 = fakeD1();
		const db = fromD1(d1);
		await db.run("CREATE TABLE t (a, b, c)");
		await db.run("INSERT INTO t VALUES (?, ?, ?)", [true, null, 7n]);
		expect(db.meta?.changes).toBe(1);
		expect(db.meta?.rows_written).toBe(1);
		expect(db.meta?.size_after).toBeGreaterThan(0);
		expect(await db.all("SELECT a, b, c FROM t")).toEqual([{ a: 1, b: null, c: 7 }]);
		await db.batch([{ sql: "INSERT INTO t VALUES (2, 2, 2)" }, { sql: "INSERT INTO t VALUES (3, 3, 3)" }]);
		expect(await db.all("SELECT COUNT(*) AS n FROM t")).toEqual([{ n: 3 }]);
		// A batch is one transaction: a failing statement leaves nothing behind.
		await expect(db.batch([{ sql: "INSERT INTO t VALUES (4, 4, 4)" }, { sql: "INSERT INTO nope VALUES (1)" }])).rejects.toThrow();
		expect(await db.all("SELECT COUNT(*) AS n FROM t")).toEqual([{ n: 3 }]);

		const failing = (message: string) => fromD1({ prepare: () => ({ bind: () => ({ run: () => Promise.reject(new Error(message)), all: () => Promise.reject(new Error(message)) }) }), batch: () => Promise.reject(new Error(message)) });
		const coded = await failing("D1_ERROR: 7429: too many concurrent requests").run("SELECT 1").catch((e: unknown) => e);
		expect(isOverload(coded)).toBe(true);
		const text = await failing("D1 DB is overloaded. Too many requests queued.").all("SELECT 1").catch((e: unknown) => e);
		expect(isOverload(text)).toBe(true);
		const quota = await failing("Your account has exceeded D1's free tier daily row write limit.").batch([{ sql: "SELECT 1" }]).catch((e: unknown) => e);
		expect(isOverload(quota)).toBe(false);
	});
});

describe("own database: schema", () => {
	it("ensureSchema creates the tables once, records the version in the own database and costs nothing after", async () => {
		const m = meteredDb();
		const db = ownDatabase(m.db);
		const hostKv = new MemoryKv();
		expect(await ensureSchema(db, hostKv)).toBe(SCHEMA_VERSION);
		const first = { ...m.stats };
		m.reset();
		expect(await ensureSchema(db, hostKv)).toBe(SCHEMA_VERSION);
		expect(m.stats.rowsWritten).toBe(0);
		expect(m.stats.statements).toBe(1); // the version read
		expect(await hostKv.get(SCHEMA_VERSION_KEY)).toBeNull();
		expect(m.raw.prepare("SELECT value FROM ca_meta WHERE name = ?").get(SCHEMA_VERSION_KEY)).toEqual({ value: String(SCHEMA_VERSION) });
		expect(tableNames(m.raw).sort()).toEqual([...TABLES, "ca_meta"].sort());
		console.log(`[own-db] schema on a new database: ${first.statements} statements, ${first.rowsWritten} rows written, once`);
	});

	it("the resolver creates the schema on first use; a second resolver over the same database adds nothing", async () => {
		const d1 = fakeD1();
		const env = async () => ({ CA_DB: d1 });
		await factsDb({ binding: "CA_DB" }, async () => memoryDb().db, env)();
		const tables = tableNames(d1.raw);
		const before = d1.stats.statements;
		await factsDb({ binding: "CA_DB" }, async () => memoryDb().db, env)();
		expect(tableNames(d1.raw)).toEqual(tables);
		expect(d1.stats.statements - before).toBe(1);
	});

	it("without the option the resolver returns the host database", async () => {
		const host = memoryDb().db;
		expect(await factsDb(undefined, async () => host, async () => ({ CA_DB: fakeD1() }))("default")).toBe(host);
	});
});

describe("own database: the queue consumer", () => {
	it("applies batches to the binding of the database option, and never to DB when that binding is missing", async () => {
		const d1 = fakeD1();
		const hostD1 = fakeD1();
		const traffic = generateTraffic({ pageviews: 60, seed: 6, start: START });
		const sent: unknown[] = [];
		const q: QueueLike = { send: async (body) => void sent.push(JSON.parse(JSON.stringify(body))) };
		const own = ownDatabase(fromD1(d1));
		await ensureSchema(own, new MemoryKv());
		await drive(own, optionsKv(hostDb().db, PLUGIN_ID), traffic, new QueueSink(q, new D1Sink(own)));
		const deliver = () =>
			sent.map((body, i) => ({ body, timestamp: new Date(i), attempts: 1, acked: false, retried: false, ack() { this.acked = true; }, retry() { this.retried = true; } }) as QueuedMessage & { acked: boolean; retried: boolean });

		// Applied on the day of the traffic (the consumer refuses messages whose day before is closed).
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.parse("2026-06-01T01:00:00Z"));
		const missing = deliver();
		await handleQueue({ messages: missing }, { DB: hostD1 }, { database: { binding: "CA_DB" } });
		expect(missing.every((m) => m.retried && !m.acked)).toBe(true);
		expect(hostD1.stats.statements).toBe(0);

		const batch = deliver();
		await handleQueue({ messages: batch }, { DB: hostD1, CA_DB: d1 }, { database: { binding: "CA_DB" } });
		expect(batch.every((m) => m.acked)).toBe(true);
		expect(sum(d1.raw, "SELECT SUM(pageviews) AS n FROM ca_sessions")).toBe(traffic.counts.pageviews);
		expect(hostD1.stats.statements).toBe(0);
		expect(tableNames(hostD1.raw)).toEqual([]);
	});
});

describe("own database: a missing binding", () => {
	it("answers 503 and counts write_error; nothing reaches the host database", async () => {
		const host = hostDb();
		const db = await factsDb({ binding: "CA_DB" }, async () => host.db, async () => ({}))();
		await expect(db.all("SELECT 1")).rejects.toThrow(/binding CA_DB does not exist/);
		const f = fakeEnv({ db, kv: host.kv } as never);
		const req = eventRequest({ v: 1, t: "pv", sid: "aaaaaaaaaaaaaaaaaaaa", n: 1, h: "hhhhhhhhhhh1", u: "/a", r: "", w: 1440 });
		const res = await inRoute(f.env).handler(ctx(req, await req.clone().text(), host.kv));
		expect(res.status).toBe(503);
		expect(drops.rows().find((r) => r.reason === "write_error")?.n).toBeGreaterThanOrEqual(1);
		expect(tableNames(host.raw)).toEqual(["options"]);
	});

	it("a missing-binding Db is not an overload: the route does not retry it", async () => {
		await expect(missingDb("CA_DB").run("SELECT 1")).rejects.toSatisfy((e: unknown) => !isOverload(e));
	});
});

describe("middleware resolver", () => {
	it("pluginFacts refuses to guess before createPlugin, then returns the plugin's resolver", async () => {
		vi.resetModules();
		const facts = await import("../src/db/facts.js");
		expect(() => facts.pluginFacts()).toThrow(/not initialised/);
		const d1 = fakeD1();
		const dbFor = facts.setPluginFacts(facts.factsDb({ binding: "CA_DB" }, async () => memoryDb().db, async () => ({ CA_DB: d1 })));
		expect(facts.pluginFacts()).toBe(dbFor);
		await (await facts.pluginFacts()()).all("SELECT 1");
		expect(tableNames(d1.raw)).toContain("ca_srv");
	});
});

describe("database option", () => {
	it("is validated when the plugin is created and reaches createPlugin through the descriptor", () => {
		expect(parseOptions({ database: { binding: "CA_DB" } })).toEqual({ sites: [], database: { binding: "CA_DB" } });
		expect(parseOptions({})).toEqual({ sites: [] });
		for (const bad of [{ binding: "" }, { binding: "1DB" }, { binding: "CA-DB" }, {}, "CA_DB", null])
			expect(() => parseOptions({ database: bad }), JSON.stringify(bad)).toThrow(/database option: binding must name the D1 binding/);
		expect(cookielessAnalytics({ database: { binding: "CA_DB" } }).options).toEqual({ database: { binding: "CA_DB" } });
		expect(cookielessAnalytics({}).options).toBeUndefined();
	});
});
