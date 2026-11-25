/**
 * A fake D1 binding over better-sqlite3: `prepare().bind()` with `all`, `run`, `first`, plus `batch` (one
 * transaction) and `exec`, each answering D1's result shape with `meta` (`changes`, `rows_written` as the changed
 * rows, `size_after` as the database file size). Counts round trips (one per `all`, `run`, `first`, `batch`,
 * `exec`) and statements, so tests can compare a real batch with a loop of single statements. A compound SELECT of
 * more than 5 terms and a LIKE pattern over 50 bytes fail with D1's own error, as on D1 (`d1-limits.ts`).
 */
import Database from "better-sqlite3";
import { assertD1Limits } from "./d1-limits.js";

export interface FakeD1 {
	raw: Database.Database;
	/** Round trips, statements, and of them the `batch()` calls and the statements they carried. */
	stats: { roundTrips: number; statements: number; batches: number; batched: number };
	prepare(sql: string): FakeStmt;
	batch(stmts: FakeStmt[]): Promise<Array<{ results: unknown[]; meta: Meta }>>;
	exec(sql: string): Promise<{ count: number; duration: number }>;
}
interface FakeStmt {
	bind(...values: unknown[]): FakeStmt;
	all<T>(): Promise<{ results: T[]; meta: Meta }>;
	run(): Promise<{ results: unknown[]; meta: Meta }>;
	first<T>(): Promise<T | null>;
}
interface Meta {
	changes: number;
	rows_written: number;
	rows_read: number;
	size_after: number;
	last_row_id: number;
	duration: number;
}

export function fakeD1(raw: Database.Database = new Database(":memory:")): FakeD1 {
	const stats = { roundTrips: 0, statements: 0, batches: 0, batched: 0 };
	const size = () => Number(raw.pragma("page_count", { simple: true })) * Number(raw.pragma("page_size", { simple: true }));
	/** One statement, as D1 runs it: rows for any statement that returns some, `changes` for writes. */
	const exec = (sql: string, values: unknown[]) => {
		stats.statements++;
		// D1 refuses undefined; better-sqlite3 has no booleans: both would hide a mapping bug of the Db.
		for (const v of values) if (v === undefined || typeof v === "boolean") throw new Error(`D1_TYPE_ERROR: Type '${typeof v}' not supported for value '${v}'`);
		assertD1Limits(sql, values);
		const st = raw.prepare(sql);
		if (st.reader) {
			const results = st.all(...values);
			const changes = /^\s*(insert|update|delete)\b/i.test(sql) ? results.length : 0;
			return { results, meta: { changes, rows_written: changes, rows_read: results.length, size_after: size(), last_row_id: 0, duration: 0 } };
		}
		const r = st.run(...values);
		return { results: [] as unknown[], meta: { changes: r.changes, rows_written: r.changes, rows_read: 0, size_after: size(), last_row_id: Number(r.lastInsertRowid), duration: 0 } };
	};
	const stmt = (sql: string, values: unknown[] = []): FakeStmt & { sql: string; values: unknown[] } => ({
		sql,
		values,
		bind: (...v: unknown[]) => stmt(sql, v),
		async all<T>() {
			stats.roundTrips++;
			return exec(sql, values) as { results: T[]; meta: Meta };
		},
		async run() {
			stats.roundTrips++;
			return exec(sql, values);
		},
		async first<T>() {
			stats.roundTrips++;
			return (exec(sql, values).results[0] as T | undefined) ?? null;
		},
	});
	return {
		raw,
		stats,
		prepare: (sql) => stmt(sql),
		async batch(stmts) {
			stats.roundTrips++;
			stats.batches++;
			stats.batched += stmts.length;
			return raw.transaction(() => stmts.map((s) => exec((s as ReturnType<typeof stmt>).sql, (s as ReturnType<typeof stmt>).values)))();
		},
		async exec(sql) {
			stats.roundTrips++;
			raw.exec(sql);
			return { count: 1, duration: 0 };
		},
	};
}

/** Names of the tables of a database. */
export const tableNames = (raw: Database.Database) => (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
