/**
 * Postgres without a server: PGlite (Postgres in WASM, one connection). `pglite()` is a fresh database that
 * returns int8 and numeric as strings, as node-postgres does; `kyselyPg()` wraps it the way a host on Postgres
 * reaches the plugin (`fromKysely`); `hyperdrive()` is a fake Hyperdrive binding plus a fake `pg` driver over it
 * for `fromPg`, counting clients opened and ended and every statement sent.
 */
import { PGlite } from "@electric-sql/pglite";
import { Kysely, PGliteDialect } from "kysely";
import { fromKysely } from "../src/db/adapter.js";
import { type HyperdriveLike, type PgClient, type PgDriver, resetPgFailFast, usePgDriver } from "../src/db/pg.js";

/** A connection string with a password and a host, so tests can check that neither leaks. */
export const PG_URL = "postgres://ca_user:s3cret-pass@db.example.com:5432/analytics?sslmode=require";
export const PG_SECRETS = ["s3cret-pass", "db.example.com", "ca_user"] as const;

export function pglite(): PGlite {
	return new PGlite({ parsers: { 20: (v: string) => v, 1700: (v: string) => v } });
}

/** One PGlite per test file (start up takes seconds); call between tests to drop every table. */
export async function resetPg(pg: PGlite): Promise<void> {
	await pg.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
}

export function kyselyPg(pg: PGlite = pglite()) {
	const k = new Kysely<any>({ dialect: new PGliteDialect({ pglite: pg }) });
	return { pg, kysely: k, db: fromKysely(k) };
}

export interface PgStats {
	opened: number;
	ended: number;
	connects: number;
	statements: string[];
}

/** One `pg.Client` look-alike over a PGlite database. `fail` may throw before a statement or a connect. */
export interface PgFaults {
	connect?: () => void;
	/** May throw, or return a promise to delay the statement. */
	query?: (sql: string) => void | Promise<unknown>;
}

/** One `pg.Client` look-alike over a PGlite database. `end()` cuts a statement in flight, as a closed socket does. */
export function fakeDriver(pg: PGlite, stats: PgStats, fail?: PgFaults): PgDriver {
	return (connectionString) => {
		if (connectionString !== PG_URL) throw new Error("unexpected connection string");
		stats.opened++;
		let state: "new" | "open" | "ended" = "new";
		const client: PgClient = {
			async connect() {
				stats.connects++;
				fail?.connect?.();
				state = "open";
			},
			async query(text, values) {
				if (state !== "open") throw new Error("Client was closed and is not queryable");
				stats.statements.push(text);
				await fail?.query?.(text);
				if (state !== "open") throw new Error("Connection terminated");
				const r = await pg.query<Record<string, unknown>>(text, values as unknown[]);
				return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
			},
			async end() {
				if (state !== "ended") stats.ended++;
				state = "ended";
			},
			on: () => undefined,
		};
		return client;
	};
}

/** A fake Hyperdrive binding over `pg`, with the fake driver registered. */
export function hyperdrive(pg: PGlite = pglite(), fail?: PgFaults) {
	const stats: PgStats = { opened: 0, ended: 0, connects: 0, statements: [] };
	usePgDriver(fakeDriver(pg, stats, fail));
	const binding: HyperdriveLike = { connectionString: PG_URL };
	return { pg, binding, stats };
}

/** Unregisters the driver, as in the default entry, and closes the isolate's fail-fast windows. */
export function dropPgDriver(): void {
	(globalThis as Record<symbol, unknown>)[Symbol.for("cookieless-analytics:pg-driver")] = undefined;
	resetPgFailFast();
}
