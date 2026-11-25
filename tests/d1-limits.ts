/**
 * The D1 limits the test databases enforce besides the parameter count (`assertParams`): at most 5 terms in one
 * compound SELECT, at most 50 bytes in one LIKE or GLOB pattern, at most 100,000 bytes of SQL in one statement and at
 * most 100 result columns, each refused with D1's own error text.
 */
import { assertCompound } from "../src/db/compound.js";
import { MAX_LIKE_BYTES } from "../src/db/dialect.js";

export const LIKE_ERROR = "D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR";
/** Bytes of SQL D1 allows in one statement. */
export const MAX_SQL_BYTES = 100_000;
/** Columns D1 allows in a table or a result. */
export const MAX_COLUMNS = 100;

const utf8 = new TextEncoder();
const tooLong = (v: unknown) => typeof v === "string" && utf8.encode(v).length > MAX_LIKE_BYTES;

/** Throws D1's error for a bound (`LIKE ?`, `LIKE lower(?)`) or literal LIKE or GLOB pattern over 50 bytes. */
export function assertLikePatterns(sql: string, params: readonly unknown[] = []): void {
	let n = 0;
	let quoted = false;
	for (let i = 0; i < sql.length; i++) {
		const c = sql[i];
		if (c === "'") quoted = !quoted;
		else if (c === "?" && !quoted) {
			if (/\b(LIKE|GLOB)\s+(lower\s*\(\s*)?$/i.test(sql.slice(Math.max(0, i - 32), i)) && tooLong(params[n])) throw new Error(LIKE_ERROR);
			n++;
		}
	}
	for (const m of sql.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)) if (tooLong((m[1] as string).replace(/''/g, "'"))) throw new Error(LIKE_ERROR);
}

export interface D1LimitOptions {
	/**
	 * Refuse a compound SELECT of more than 5 terms with D1's own error (`too many terms in compound SELECT`), as D1
	 * does; better-sqlite3 has no such limit. On by default; off only for a baseline that runs the unchunked statement.
	 */
	compoundLimit?: boolean;
}

/** The compound, LIKE pattern and statement length limits of D1 on one statement. */
export function assertD1Limits(sql: string, params: readonly unknown[] = [], o: D1LimitOptions = {}): void {
	if (utf8.encode(sql).length > MAX_SQL_BYTES) throw new Error("D1_ERROR: statement too long: SQLITE_TOOBIG");
	if (o.compoundLimit !== false) assertCompound(sql);
	assertLikePatterns(sql, params);
}

/** Rows of a result with more columns than D1 allows are refused (D1 fails the statement). */
export function assertColumns<T>(rows: T[]): T[] {
	const first = rows[0];
	if (first && typeof first === "object" && Object.keys(first).length > MAX_COLUMNS) throw new Error("D1_ERROR: too many columns in result set: SQLITE_ERROR");
	return rows;
}
