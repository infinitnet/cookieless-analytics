/**
 * Own database on Postgres (plugin option `database: { binding, engine: "postgres" }`): the own database scenario
 * on a fake Hyperdrive binding backed by PGlite, one client per request scope, the message without the driver, and
 * the query cache probe against a binding that serves stale reads and one that does not.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workerEnv = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../src/core/worker-env.js", () => ({ workerEnv: async () => workerEnv.value }));

import { PLUGIN_ID } from "../src/contract.js";
import { D1Sink } from "../src/core/apply.js";
import { drops } from "../src/core/drops.js";
import { validateIngest } from "../src/core/ids.js";
import { routedSink } from "../src/core/queue-sink.js";
import { recordClientEvent, type RecorderDeps, requestInfo, resetCounters } from "../src/core/recorder.js";
import { zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { factsDb } from "../src/db/facts.js";
import { optionsKv } from "../src/db/options-kv.js";
import { type PgClient, pgOwnScope, pgScope, usePgDriver } from "../src/db/pg.js";
import { CACHE_ON_MESSAGE, probeQueryCache, queryCacheOn, queryCacheResults, resetQueryCache } from "../src/db/query-cache.js";
import { TABLES } from "../src/db/schema.js";
import { createPlugin } from "../src/index.js";
import { QuerySchema } from "../src/query/filters.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { KV_CURSOR, type RetentionCursor, runRetention } from "../src/query/retention.js";
import { runRollup } from "../src/query/rollup.js";
import { inRoute } from "../src/routes/in.js";
import type { RouteEnv } from "../src/routes/env.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { generateTraffic } from "./capacity.helpers.js";
import { eventRequest, MemoryKv, memoryDb } from "./helpers.js";
import { dropPgDriver, fakeDriver, hyperdrive, PG_SECRETS, PG_URL, type PgStats, pglite, resetPg } from "./pg.helpers.js";
import { ctx } from "./routes.helpers.js";

const START = zonedToEpoch("2026-06-01", 0, "UTC");
const NOW = zonedToEpoch("2026-06-13", 3, "UTC");
const OPTION = { binding: "CA_PG", engine: "postgres" as const };

const pg = pglite();
afterAll(() => pg.close());

function hostDb() {
	const m = memoryDb();
	m.raw.exec("CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT)");
	return { ...m, kv: optionsKv(m.db, PLUGIN_ID) };
}

const count = async (sql: string) => Number((await pg.query<{ n: unknown }>(sql)).rows[0]?.n ?? 0);

/** The collect route over `dbFor`, as `createPlugin` wires it: each event through the routed sink. */
function collect(dbFor: ReturnType<typeof factsDb>, s: Settings, kv: MemoryKv | ReturnType<typeof optionsKv>) {
	const tasks: Array<() => Promise<unknown>> = [];
	const env: RouteEnv = {
		async deps(): Promise<RecorderDeps> {
			return { db: await dbFor(s.siteId), kv, settings: s, sink: routedSink(dbFor, s, kv as never), now: NOW };
		},
		after: (fn) => void tasks.push(fn),
	};
	let n = 0;
	return async () => {
		n++;
		const req = eventRequest({ v: 1, t: "pv", sid: `s${String(n).padStart(19, "0")}`, n: 1, h: `h${String(n).padStart(11, "0")}`, u: "/a", r: "", w: 1440 });
		const text = await req.clone().text();
		return pgScope(() => inRoute(env).handler(ctx(req, text, kv as never)));
	};
}

beforeEach(async () => {
	await resetPg(pg);
	resetCounters();
	resetQueryCache();
	drops.clear();
	clearReportCache();
});
afterEach(() => {
	dropPgDriver();
	vi.restoreAllMocks();
});

describe("own database on Postgres: the own database scenario on a Hyperdrive binding", () => {
	it("recorder, summaries, reports, drops and retention run on Postgres in one client per scope; the host keeps only options", async () => {
		const { binding, stats } = hyperdrive(pg);
		const host = hostDb();
		const dbFor = factsDb(OPTION, async () => host.db, async () => ({ CA_PG: binding }));
		// `small` on Postgres: no D1 daily rows, so the write guard never blocks and retention deletes without a row cap.
		const S = normalizeSettings({ capacityProfile: "small", storageBudgetMb: 50_000 });
		const traffic = generateTraffic({ pageviews: 300, seed: 21, rich: true, start: START, spanSeconds: 10 * 86_400 - 1 });

		await pgScope(async () => {
			const db = await dbFor("default");
			expect(db.dialect).toBe("postgres");
			expect(await dbFor("other-site")).toBe(db);
			const sink = routedSink(dbFor, S, host.kv);
			for (const a of traffic.actions) {
				const body = validateIngest(a.body);
				if (!body) throw new Error("invalid generated body");
				await recordClientEvent({ db, kv: host.kv, settings: S, now: a.at, sink }, body, requestInfo(eventRequest(a.body, { "cf-connecting-ip": a.ip }, a.url)));
			}
		});
		// One request scope: one client, ended at its end, however many statements ran.
		expect(stats).toMatchObject({ opened: 1, ended: 1 });
		expect(stats.statements.length).toBeGreaterThan(300);
		expect(await count("SELECT SUM(pageviews) AS n FROM ca_sessions")).toBe(traffic.counts.pageviews);
		expect(await count("SELECT COUNT(*) AS n FROM ca_sessions")).toBe(traffic.counts.sessions);
		// The probe ran once (four statements) and found no cache.
		expect(queryCacheResults().get("CA_PG")).toBe(false);

		await pgScope(async () => {
			const db = await dbFor();
			const rc = { db, settings: S, goals: async () => [] };
			let tick = await runRollup(rc, host.kv, NOW);
			for (let i = 0; i < 50 && !tick.done; i++) tick = await runRollup(rc, host.kv, NOW);
			const report = { db, site: "default", settings: S, now: NOW, goals: [], funnels: {}, annotations: [], defaultCurrency: "USD" };
			const q = { report: "overview" as const, query: QuerySchema.parse({ from: "2026-06-01", to: "2026-06-10" }), limit: 100 };
			const detailed = await runReport(report, q);
			clearReportCache();
			const summary = await runReport({ ...report, rawFrom: "2030-01-01" }, q);
			expect(detailed.data.totals?.pageviews).toBe(traffic.counts.pageviews);
			expect(summary.data.totals).toEqual(detailed.data.totals);

			drops.add("default", "2026-06-12", "invalid", 2);
			await drops.flush(db);

			const before = await count("SELECT COUNT(*) AS n FROM ca_sessions");
			const rs = { ...S, rawRetentionDays: 7 };
			let r = await runRetention(db, host.kv, rs, NOW);
			for (let i = 0; i < 100 && !r.done; i++) r = await runRetention(db, host.kv, rs, NOW);
			expect(r.done).toBe(true);
			expect(await count("SELECT COUNT(*) AS n FROM ca_sessions")).toBeLessThan(before);
		});
		expect(stats).toMatchObject({ opened: 2, ended: 2 });
		expect(await count("SELECT COUNT(*) AS n FROM ca_rollup")).toBeGreaterThan(50);
		expect(await count("SELECT SUM(n) AS n FROM ca_drops WHERE reason = 'invalid'")).toBe(2);
		// The budget row of Postgres: 50,000 MB is kept, where a D1 database would clamp it to 9,500 at most.
		expect((await host.kv.get<RetentionCursor>(KV_CURSOR))?.storage?.budget).toBe(50e9);

		const tables = (await pg.query<{ t: string }>("SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")).rows.map((r) => r.t);
		expect(tables).toEqual([...TABLES, "ca_meta"].sort());
		expect((host.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name)).toEqual(["options"]);
	});

	it("work after the response runs in a scope of its own, never on the route's clients", async () => {
		const { binding, stats } = hyperdrive(pg);
		const db = await factsDb(OPTION, async () => memoryDb().db, async () => ({ CA_PG: binding }))();
		const opened = stats.opened;
		let later: Promise<unknown> | undefined;
		await pgScope(async () => {
			await db.all("SELECT 1 AS one");
			// As `after()` does: a task started inside the route's context.
			later = Promise.resolve().then(() => pgOwnScope(async () => {
				await db.all("SELECT 2 AS two");
				await db.all("SELECT 3 AS three");
				await db.all("SELECT 4 AS four");
			}));
		});
		await later;
		// Joined to the route's scope instead, the task's statements after the route ended would each open a client.
		expect(stats.opened - opened).toBe(2);
		expect(stats.ended).toBe(stats.opened);
	});

	it("a statement outside any scope opens and ends a client of its own", async () => {
		const { binding, stats } = hyperdrive(pg);
		const db = await factsDb(OPTION, async () => memoryDb().db, async () => ({ CA_PG: binding }))();
		const opened = stats.opened;
		await db.all("SELECT 1 AS one");
		await db.all("SELECT 1 AS one");
		expect(stats.opened - opened).toBe(2);
		expect(stats.ended).toBe(stats.opened);
	});

	it("every hook of the plugin runs in one scope: plugin:activate creates the tables through one client and ends it", async () => {
		const { binding, stats } = hyperdrive(pg);
		workerEnv.value = { CA_PG: binding };
		const p = createPlugin({ database: OPTION }) as unknown as { hooks: Record<string, { handler: (e: unknown, c: unknown) => Promise<unknown> }> };
		await p.hooks["plugin:activate"]!.handler({}, { kv: new MemoryKv(), log: { warn: () => undefined } });
		expect(stats).toMatchObject({ opened: 1, ended: 1 });
		expect(await count("SELECT COUNT(*) AS n FROM pg_tables WHERE tablename = 'ca_sessions'")).toBe(1);
		workerEnv.value = {};
	});
});

describe("own database on Postgres: a Hyperdrive binding without the driver", () => {
	it("fails every statement with the named message; the collect route answers 503 and counts write_error", async () => {
		const host = hostDb();
		const dbFor = factsDb({ binding: "CA_PG" }, async () => host.db, async () => ({ CA_PG: { connectionString: PG_URL } }));
		const db = await dbFor();
		await expect(db.all("SELECT 1")).rejects.toThrow('binding CA_PG is a Hyperdrive binding; set engine: "postgres" in the plugin options');
		const res = await collect(dbFor, normalizeSettings({}), host.kv)();
		expect(res.status).toBe(503);
		expect(drops.rows().find((r) => r.reason === "write_error")?.n).toBe(1);
	});
});

/** A fake driver whose binding caches every read by text and values and never invalidates it, as Hyperdrive's query cache does. */
function cachingDriver(stats: PgStats) {
	const inner = fakeDriver(pg, stats);
	const cache = new Map<string, Promise<{ rows: unknown[]; rowCount: number | null }>>();
	usePgDriver((cs): PgClient => {
		const c = inner(cs);
		return {
			...c,
			query: (text, values) => {
				if (!/^\s*SELECT/i.test(text)) return c.query(text, values);
				const key = `${text}\u0000${JSON.stringify(values ?? [])}`;
				let hit = cache.get(key);
				if (!hit) cache.set(key, (hit = c.query(text, values)));
				return hit;
			},
		};
	});
}

describe("query cache probe", () => {
	const stats = (): PgStats => ({ opened: 0, ended: 0, connects: 0, statements: [] });

	it("finds a binding that serves stale reads, and not one that reads fresh", async () => {
		const { binding } = hyperdrive(pg);
		const fresh = await factsDb(OPTION, async () => memoryDb().db, async () => ({ CA_PG: binding }))();
		expect(await pgScope(() => probeQueryCache(fresh))).toBe(false);

		cachingDriver(stats());
		// The cache already holds the reads of another isolate's probes: each probe has its own row, so it still finds the cache.
		expect(await pgScope(() => probeQueryCache(fresh))).toBe(true);
		expect(await pgScope(() => probeQueryCache(fresh))).toBe(true);
		// A probe deletes its row.
		expect(await count("SELECT COUNT(*) AS n FROM ca_meta WHERE name LIKE 'cache_probe%'")).toBe(0);
	});

	it("runs once per isolate and binding, never on D1, and a failed probe is tried again", async () => {
		const { binding, stats: s } = hyperdrive(pg);
		const db = await factsDb(OPTION, async () => memoryDb().db, async () => ({ CA_PG: binding }))();
		const d1 = memoryDb().db;
		expect(await queryCacheOn(d1)).toBe(false);
		const before = s.statements.length;
		await pgScope(async () => {
			expect(await queryCacheOn(db)).toBe(false);
			expect(await queryCacheOn(db)).toBe(false);
		});
		expect(s.statements.length - before).toBe(5);

		resetQueryCache();
		dropPgDriver();
		await expect(queryCacheOn(db)).rejects.toThrow(/Hyperdrive binding/);
		hyperdrive(pg);
		expect(await queryCacheOn(db)).toBe(false);
	});

	it("with caching on, ingest refuses every write: 503 without Retry-After, a counted drop, no row written, one clear message", async () => {
		cachingDriver(stats());
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const host = hostDb();
		const dbFor = factsDb(OPTION, async () => host.db, async () => ({ CA_PG: { connectionString: PG_URL } }));
		const post = collect(dbFor, normalizeSettings({}), host.kv);
		for (let i = 0; i < 3; i++) {
			const res = await post();
			expect(res.status).toBe(503);
			// A permanent condition: the page script must not send it again.
			expect(new Headers(res.headers as HeadersInit).get("retry-after")).toBeNull();
		}
		expect(drops.rows().find((r) => r.reason === "write_error")?.n).toBe(3);
		expect(await count("SELECT COUNT(*) AS n FROM ca_sessions")).toBe(0);
		expect(queryCacheResults().get("CA_PG")).toBe(true);
		const messages = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes(CACHE_ON_MESSAGE));
		expect(messages).toEqual([`cookieless-analytics: binding CA_PG: ${CACHE_ON_MESSAGE}. Page views and events are not recorded until then.`]);
		for (const secret of [PG_URL, ...PG_SECRETS]) expect(messages.join(" ")).not.toContain(secret);
		// The sink refuses with the message, so the drop is never a silent wrong count.
		const db = await dbFor();
		await expect(pgScope(() => routedSink(dbFor, normalizeSettings({}), host.kv).ingest({ t: "srv", site: "default" } as never))).rejects.toThrow(CACHE_ON_MESSAGE);
		expect(db.dialect).toBe("postgres");
	});

	it("the direct sink on Postgres is the plain database writer", async () => {
		const { binding } = hyperdrive(pg);
		const db: Db = await factsDb(OPTION, async () => memoryDb().db, async () => ({ CA_PG: binding }))();
		const { ingestSink } = await import("../src/core/queue-sink.js");
		expect(await pgScope(() => ingestSink(db, normalizeSettings({ ingestTier: "queue" }), async () => ({ send: async () => undefined })))).toBeInstanceOf(D1Sink);
	});
});
