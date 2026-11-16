/**
 * A `Db` over a raw Cloudflare D1 binding: the own analytics database (plugin option `database`) and the queue
 * consumer Worker. The host database is reached through the host's Kysely instance instead (`adapter.ts`).
 *
 * - `batch()` is the binding's own `batch()`: one round trip for the whole list, run as one transaction.
 * - `meta` holds the D1 meta of the last statement (`rows_written`, `rows_read`, `size_after`, ...); the
 *   storage estimate reads `size_after`, the database file size, which is exact where the estimate is not.
 * - Numbers bind as REAL on D1 (measured), so statements cast integers in SQL (`CAST(? AS INTEGER)`, `dialect.ts`);
 *   values D1 refuses (`undefined`, `bigint`, `boolean`) are mapped here.
 * - The D1 overload error code 7429 is reported with the word "overloaded", which `isOverload` matches.
 */
import type { Db, DbMeta } from "./adapter.js";
import type { Param, Stmt } from "./sql.js";

interface D1Result<T = unknown> {
	results?: T[];
	meta?: DbMeta;
}

interface D1Bound {
	run(): Promise<D1Result>;
	all<T>(): Promise<D1Result<T>>;
}

/** The part of a D1 binding this package uses. */
export interface D1Like {
	prepare(sql: string): { bind(...values: unknown[]): D1Bound };
	batch(statements: D1Bound[]): Promise<unknown>;
}

/** A binding value is a D1 database when it can prepare and batch. */
export const isD1 = (v: unknown): v is D1Like => typeof (v as D1Like | null)?.prepare === "function" && typeof (v as D1Like).batch === "function";

const bindable = (p: Param | undefined): unknown => {
	if (p === undefined) return null;
	if (typeof p === "boolean") return p ? 1 : 0;
	if (typeof p === "bigint") return Number.isSafeInteger(Number(p)) ? Number(p) : String(p);
	return p;
};

/** D1 code 7429 ("DB overloaded") with a text that does not say so gets the word, so the 503 path retries it. */
function mapError(err: unknown): unknown {
	const msg = String((err as { message?: unknown } | null)?.message ?? err);
	if (/\b7429\b/.test(msg) && !/\boverloaded\b/i.test(msg)) return new Error(`D1 DB is overloaded (7429): ${msg}`, { cause: err });
	return err;
}

export function fromD1(d1: D1Like): Db {
	let meta: DbMeta | undefined;
	const stmt = (sql: string, params: readonly Param[] = []) => d1.prepare(sql).bind(...params.map(bindable));
	async function call<R>(f: () => Promise<R>): Promise<R> {
		try {
			const r = await f();
			// `batch()` answers one result per statement: keep the last one's meta, with the rows written of the whole batch (the Search sync budget counts them).
			meta = (Array.isArray(r) ? (r[r.length - 1] as D1Result | undefined) : (r as D1Result | undefined))?.meta ?? meta;
			if (Array.isArray(r) && meta) meta = { ...meta, rows_written: (r as D1Result[]).reduce((a, x) => a + (x.meta?.rows_written ?? 0), 0) };
			return r;
		} catch (err) {
			throw mapError(err);
		}
	}
	return {
		dialect: "sqlite",
		get meta() {
			return meta;
		},
		async run(sql, params) {
			return { changes: (await call(() => stmt(sql, params).run())).meta?.changes ?? 0 };
		},
		async all<T>(sql: string, params?: Param[]) {
			return ((await call(() => stmt(sql, params).all<T>())).results ?? []) as T[];
		},
		async batch(stmts: readonly Stmt[]) {
			if (stmts.length) await call(() => d1.batch(stmts.map((s) => stmt(s.sql, s.params))));
		},
	};
}
