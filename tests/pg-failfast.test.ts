/**
 * A cold, slow or down Postgres never holds up ingest: probes and schema checks are never shared between requests,
 * a connect or statement timeout opens a fail-fast window, the ingest path has a short statement timeout, the cache
 * probe stops at its deadline and cleans up after a failure, and the health message is redacted.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLUGIN_ID } from "../src/contract.js";
import { drops } from "../src/core/drops.js";
import { routedSink } from "../src/core/queue-sink.js";
import { type RecorderDeps, resetCounters } from "../src/core/recorder.js";
import type { Db } from "../src/db/adapter.js";
import { factsDb } from "../src/db/facts.js";
import { optionsKv } from "../src/db/options-kv.js";
import { FAIL_FAST_MS, fromPg, INGEST_STATEMENT_MS, pgScope } from "../src/db/pg.js";
import { PROBE_MS, probeQueryCache, queryCacheOn, queryCacheResults, resetQueryCache } from "../src/db/query-cache.js";
import type { RouteEnv } from "../src/routes/env.js";
import { inRoute, isOverload } from "../src/routes/in.js";
import { healthOf } from "../src/routes/privacy.js";
import { normalizeSettings } from "../src/settings.js";
import { eventRequest, MemoryKv, memoryDb } from "./helpers.js";
import { dropPgDriver, hyperdrive, PG_SECRETS, PG_URL, type PgFaults, pglite, resetPg } from "./pg.helpers.js";
import { ctx } from "./routes.helpers.js";

const OPTION = { binding: "CA_PG", engine: "postgres" as const };
const pg = pglite();
afterAll(() => pg.close());
// The first reset starts PGlite (a WASM build): under a full parallel run it can take longer than the default hook timeout.
beforeEach(async () => {
	await resetPg(pg);
	resetQueryCache();
	resetCounters();
	drops.clear();
}, 120_000);
afterEach(() => {
	vi.useRealTimers();
	dropPgDriver();
});

const never = () => new Promise<never>(() => undefined);
const err = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});
const count = async (sql: string) => Number((await pg.query<{ n: unknown }>(sql)).rows[0]?.n ?? 0);

/** The analytics database on the fake binding, its tables created, plus the driver's counters. */
async function setup(fail?: PgFaults) {
	const h = hyperdrive(pg, fail);
	const dbFor = factsDb(OPTION, async () => memoryDb().db, async () => ({ CA_PG: h.binding }));
	return { ...h, dbFor, db: await dbFor() };
}

describe("nothing in flight is shared between requests", () => {
	it("a first request stuck mid-probe does not stall the next: it runs a probe of its own", async () => {
		let armed = false;
		let stuck = false;
		const { db } = await setup({ query: (sql) => {
			if (!armed || stuck || !sql.startsWith("INSERT INTO ca_meta")) return undefined;
			stuck = true;
			return never();
		} });
		armed = true;
		// The first request's probe never answers (its request was cancelled; its timer may never fire).
		void queryCacheOn(db).catch(() => undefined);
		await vi.waitFor(() => expect(stuck).toBe(true));
		expect(await queryCacheOn(db)).toBe(false);
		expect(queryCacheResults().get("CA_PG")).toBe(false);
	});

	it("a first request stuck in the schema check does not stall the next", async () => {
		let hang = true;
		const h = hyperdrive(pg, { query: () => (hang ? never() : undefined) });
		const dbFor = factsDb(OPTION, async () => memoryDb().db, async () => ({ CA_PG: h.binding }));
		void dbFor();
		await new Promise((r) => setTimeout(r, 5));
		hang = false;
		const db = await dbFor();
		expect(db.dialect).toBe("postgres");
		expect(await count("SELECT COUNT(*) AS n FROM pg_tables WHERE tablename = 'ca_sessions'")).toBe(1);
	});
});

describe("fail-fast window", () => {
	it("after a connect timeout the binding is refused without connecting, with the redacted reason, until the window closes", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const t0 = Date.parse("2026-06-01T00:00:00Z");
		vi.setSystemTime(t0);
		let down = true;
		const { binding, stats } = hyperdrive(pg, { connect: () => {
			if (down) throw err(`timeout expired connecting to ${PG_URL}`);
		} });
		const db = fromPg(binding, "CA_PG");
		await expect(db.all("SELECT 1")).rejects.toThrow(/overloaded or unreachable: timeout expired/);
		expect(stats.connects).toBe(1);

		const refused = (await db.all("SELECT 1").catch((e: unknown) => e)) as Error;
		expect(refused.message).toMatch(/timeout expired .*\(not connecting again for 20 s\)$/);
		expect(isOverload(refused)).toBe(true);
		for (const secret of [PG_URL, ...PG_SECRETS]) expect(refused.message).not.toContain(secret);
		vi.setSystemTime(t0 + FAIL_FAST_MS - 1);
		await expect(db.run("SELECT 1")).rejects.toThrow(/not connecting again for 1 s/);
		expect(stats.connects).toBe(1);

		down = false;
		vi.setSystemTime(t0 + FAIL_FAST_MS);
		expect(await db.all("SELECT 1 AS one")).toEqual([{ one: 1 }]);
		expect(stats.connects).toBe(2);
	});

	it("a down database costs one timeout, not one per page view: the next request connects to nothing and counts an overload", async () => {
		const { binding, stats } = hyperdrive(pg, { connect: () => {
			throw err("timeout expired");
		} });
		const s = normalizeSettings({});
		const m = memoryDb();
		m.raw.exec("CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT)");
		const kv = optionsKv(m.db, PLUGIN_ID);
		const dbFor = factsDb(OPTION, async () => m.db, async () => ({ CA_PG: binding }));
		const env: RouteEnv = {
			async deps(): Promise<RecorderDeps> {
				return { db: await dbFor(s.siteId), kv, settings: s, sink: routedSink(dbFor, s, kv, async () => null) };
			},
			after: () => undefined,
		};
		const post = async (n: number) => {
			const req = eventRequest({ v: 1, t: "pv", sid: `s${String(n).padStart(19, "0")}`, n: 1, h: `h${String(n).padStart(11, "0")}`, u: "/a", r: "", w: 1440 });
			const text = await req.clone().text();
			return pgScope(() => inRoute(env).handler(ctx(req, text, kv as never)));
		};
		for (let i = 1; i <= 3; i++) {
			const res = await post(i);
			expect(res.status).toBe(503);
			expect(new Headers(res.headers as HeadersInit).get("retry-after")).toBe("5");
		}
		expect(stats.connects).toBe(1);
		expect(drops.rows().find((r) => r.reason === "overload")?.n).toBe(3);
	});

	it("the ingest path limits a statement to INGEST_STATEMENT_MS; the timeout opens the window", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		const { binding, stats } = hyperdrive(pg, { query: never });
		const dbFor = factsDb(OPTION, async () => memoryDb().db, async () => ({ CA_PG: binding }));
		let out: unknown = "pending";
		const sink = routedSink(dbFor, normalizeSettings({}), new MemoryKv(), async () => null);
		const done = pgScope(() => sink.ingest({ t: "srv", site: "default" } as never)).then(
			() => (out = "stored"),
			(e: Error) => (out = e),
		);
		await vi.advanceTimersByTimeAsync(INGEST_STATEMENT_MS - 1);
		expect(out).toBe("pending");
		await vi.advanceTimersByTimeAsync(2);
		await done;
		expect((out as Error).message).toMatch(/statement timeout: no answer within 5000 ms .*\(not connecting again for 20 s\)/);
		// The schema check timed out; the probe after it was refused without a statement.
		expect(stats.statements).toHaveLength(1);
		expect(stats.ended).toBe(stats.opened);
	});
});

describe("query cache probe", () => {
	it("stops at its deadline: no statement runs after it", async () => {
		let release: () => void = () => undefined;
		let hang = false;
		const { db, stats } = await setup({ query: (sql) => (hang && sql.startsWith("INSERT INTO ca_meta") ? new Promise<void>((r) => (release = r)) : undefined) });
		hang = true;
		const before = stats.statements.length;
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const probe = queryCacheOn(db).catch((e: Error) => e);
		await vi.advanceTimersByTimeAsync(PROBE_MS);
		expect(((await probe) as Error).message).toMatch(/took longer than 10000 ms/);
		vi.useRealTimers();
		release();
		await new Promise((r) => setTimeout(r, 20));
		expect(stats.statements.slice(before)).toEqual([expect.stringMatching(/^INSERT INTO ca_meta/)]);
		expect(queryCacheResults().has("CA_PG")).toBe(false);
	});

	it("a probe that fails deletes its row", async () => {
		let reads = 0;
		const { db } = await setup({ query: (sql) => {
			if (sql.startsWith("SELECT value FROM ca_meta") && ++reads === 2) throw err("read failed", "XX000");
		} });
		await expect(pgScope(() => probeQueryCache(db))).rejects.toThrow(/read failed/);
		expect(await count("SELECT COUNT(*) AS n FROM ca_meta WHERE name LIKE 'cache_probe%'")).toBe(0);
	});
});

describe("health message", () => {
	it("redacts the self-check error of a database the adapter does not redact (a host on Postgres through Kysely)", async () => {
		const fail = async (): Promise<never> => {
			throw new Error("could not connect to server at 2001:db8::5 as user=ca_user password=s3cret-pass");
		};
		const db: Db = { dialect: "postgres", run: fail, all: fail, batch: fail };
		const h = await healthOf(db);
		expect(h.status).toBe("unreachable");
		expect(h.error).toBe("could not connect to server at [redacted] as user=[redacted] password=[redacted]");
	});
});
