import type { Kysely } from "kysely";
import type { Param, Stmt } from "./sql.js";

export type Dialect = "sqlite" | "postgres";

/** The about 15 statement shapes this plugin needs, over any EmDash database. */
export interface Db {
	readonly dialect: Dialect;
	run(sql: string, params?: Param[]): Promise<{ changes: number }>;
	all<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
	/** Runs statements in order. Not atomic through Kysely (a sequential loop); one atomic round trip over a raw D1 binding (`d1.ts`). */
	batch(stmts: readonly Stmt[]): Promise<void>;
	/** D1 meta of the last statement; only a `Db` over a raw D1 binding has it (`d1.ts`). */
	readonly meta?: DbMeta;
}

/** The D1 result meta fields this package reads. */
export interface DbMeta {
	changes?: number;
	rows_read?: number;
	rows_written?: number;
	/** Size of the whole database file in bytes after the statement. */
	size_after?: number;
}

type AnyKysely = Kysely<any>;

/** Detect the SQL flavour the same way EmDash core does (adapter class), with a capability fallback. */
export function detectDialect(db: AnyKysely): Dialect {
	const adapter = db.getExecutor().adapter as { constructor?: { name?: string }; supportsTransactionalDdl?: boolean };
	if (adapter.constructor?.name?.includes("Postgres")) return "postgres";
	// SQLite adapters (D1, libSQL, better-sqlite3) report no transactional DDL; the Postgres adapter does.
	return adapter.supportsTransactionalDdl === true ? "postgres" : "sqlite";
}

/** `?` placeholders to `$1..$n`, outside single-quoted strings. */
export function toPostgresPlaceholders(sql: string): string {
	let n = 0;
	let quoted = false;
	let out = "";
	for (const c of sql) {
		if (c === "'") quoted = !quoted;
		out += c === "?" && !quoted ? `$${++n}` : c;
	}
	return out;
}

/**
 * Wrap a Kysely instance (from `getDb()` in `emdash/runtime`). The compiled query is built
 * structurally so this package needs no runtime `kysely` import.
 */
export function fromKysely(k: AnyKysely, dialect: Dialect = detectDialect(k)): Db {
	async function exec(sql: string, params: Param[] = []) {
		const text = dialect === "postgres" ? toPostgresPlaceholders(sql) : sql;
		const query = Object.freeze({
			sql: text,
			parameters: Object.freeze([...params]),
			query: Object.freeze({ kind: "RawNode", sqlFragments: Object.freeze([text]), parameters: Object.freeze([]) }),
			queryId: { queryId: Math.random().toString(36).slice(2) },
		});
		return k.executeQuery(query as any);
	}
	return {
		dialect,
		async run(sql, params) {
			const r = await exec(sql, params);
			const n = r.numAffectedRows ?? (r as { numUpdatedOrDeletedRows?: bigint }).numUpdatedOrDeletedRows ?? 0n;
			return { changes: Number(n) };
		},
		async all<T>(sql: string, params?: Param[]) {
			return (await exec(sql, params)).rows as T[];
		},
		async batch(stmts) {
			for (const s of stmts) await exec(s.sql, s.params);
		},
	};
}

export type SelfCheck = { ok: true; dialect: Dialect } | { ok: false; error: string };

/** Startup self-check: one trivial read. On failure the caller disables writes and shows a banner. */
export async function selfCheck(db: Db): Promise<SelfCheck> {
	try {
		const rows = await db.all<{ ok: number }>("SELECT 1 AS ok");
		if (Number(rows[0]?.ok) !== 1) return { ok: false, error: "unexpected self-check result" };
		return { ok: true, dialect: db.dialect };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}
