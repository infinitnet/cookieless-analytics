/**
 * Search row store: the provider days of one site replace the stored rows of those
 * `(site, source, day)`, so a re-pull leaves exactly one row set. One window costs one DELETE over a
 * JSON list of its days plus one `INSERT ... SELECT` over a JSON array per 400,000 characters of rows
 * (the `json_each` pattern of the rollup; about 3,000 rows of real keys), so a statement binds three
 * parameters whatever the row count. Rows
 * sharing a key after normalization (http and https of one path) are summed first so the primary key holds.
 */
import type { Db } from "../db/adapter.js";
import type { Param, Stmt } from "../db/sql.js";
import { ROWS_PER_DELETE, ROWS_PER_INSERT } from "./budget.js";
import type { SearchRow, SourceId } from "./types.js";

const COLS = "site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional";
/** Characters of the JSON parameter of one insert: at most 3 UTF-8 bytes each, so 1.2 MB, under D1's 2 MB limit for a value. */
export const INSERT_JSON_CHARS = 400_000;

/**
 * Which stored rows of a day a write replaces: all of them (a provider pull), or one table of a file
 * import (`query` rows, `page` rows, or the daily `totals`), so importing the query table keeps the page table.
 */
export type ReplaceKind = "all" | "query" | "page" | "totals";
const KIND_SQL: Record<ReplaceKind, string> = {
	all: "",
	query: " AND query <> '' AND page_key = ''",
	page: " AND page_key <> '' AND query = ''",
	totals: " AND page_key = '' AND query = ''",
};

/** Rows summed by `(page_key, query, country, device)`. */
export function mergeRows(rows: readonly SearchRow[]): SearchRow[] {
	const out = new Map<string, SearchRow>();
	for (const r of rows) {
		const k = JSON.stringify([r.page_key, r.query, r.country, r.device]);
		const cur = out.get(k);
		if (cur) {
			cur.clicks += r.clicks;
			cur.impressions += r.impressions;
			cur.pos_sum += r.pos_sum;
		} else out.set(k, { ...r });
	}
	return [...out.values()];
}

function insertSql(dialect: Db["dialect"]): string {
	// JSON row: [day, page_key, query, country, device, clicks, impressions, pos_sum, provisional].
	const types = ["", "", "", "", "", "BIGINT", "BIGINT", "DOUBLE PRECISION", "BIGINT"];
	const cols = types.map((t, i) => (dialect === "postgres" ? (t ? `CAST(value->>${i} AS ${t})` : `value->>${i}`) : `json_extract(value, '$[${i}]')`));
	const from = dialect === "postgres" ? "jsonb_array_elements(CAST(? AS jsonb))" : "json_each(?)";
	return `INSERT INTO ca_search_daily (${COLS}) SELECT ?, ?, ${cols.join(", ")} FROM ${from}`;
}

const daysIn = (dialect: Db["dialect"]) => (dialect === "postgres" ? "day IN (SELECT jsonb_array_elements_text(CAST(? AS jsonb)))" : "day IN (SELECT value FROM json_each(?))");

/**
 * The statements replacing the rows of every day in `days` (a day with an empty list is cleared): the
 * DELETE, then the inserts. Built before running, so the sync can reserve their count in its budget.
 */
export function replaceStatements(dialect: Db["dialect"], site: string, source: SourceId, days: ReadonlyMap<string, readonly SearchRow[]>, provisional: (day: string) => boolean, kind: ReplaceKind = "all"): { stmts: Stmt[]; rows: number } {
	if (!days.size) return { stmts: [], rows: 0 };
	const stmts: Stmt[] = [{ sql: `DELETE FROM ca_search_daily WHERE site = ? AND source = ? AND ${daysIn(dialect)}${KIND_SQL[kind]}`, params: [site, source, JSON.stringify([...days.keys()])] }];
	let part: string[] = [];
	let size = 0;
	let rows = 0;
	const flush = () => {
		if (part.length) stmts.push({ sql: insertSql(dialect), params: [site, source, `[${part.join(",")}]`] as Param[] });
		part = [];
		size = 0;
	};
	for (const [day, list] of days)
		for (const r of mergeRows(list)) {
			rows++;
			const json = JSON.stringify([day, r.page_key, r.query, r.country, r.device, r.clicks, r.impressions, r.pos_sum, provisional(day) ? 1 : 0]);
			if (size + json.length + 1 > INSERT_JSON_CHARS) flush();
			part.push(json);
			size += json.length + 1;
		}
	flush();
	return { stmts, rows };
}

/**
 * Run the statements of `replaceStatements` (`inserted` rows) and return the rows written: D1's own
 * `rows_written` when the Db reports it, else rows deleted plus `ROWS_PER_INSERT` per row inserted (the
 * figures of the counting Db). The DELETE runs alone so its row count is known on every Db.
 */
export async function writeReplace(db: Db, stmts: readonly Stmt[], inserted: number): Promise<number> {
	const [del, ...ins] = stmts;
	if (!del) return 0;
	const { changes } = await db.run(del.sql, del.params);
	const dw = db.meta?.rows_written;
	if (ins.length) await db.batch(ins);
	const iw = ins.length ? db.meta?.rows_written : 0;
	return typeof dw === "number" && typeof iw === "number" ? dw + iw : changes * ROWS_PER_DELETE + inserted * ROWS_PER_INSERT;
}

/**
 * Replace the rows of every day in `days`. Returns the stored row count. Not atomic (D1 through Kysely
 * has no transactions): a crash between the DELETE and the inserts leaves the days empty, and the
 * caller's cursor, which moves only after this returns, pulls them again.
 */
export async function replaceDays(db: Db, site: string, source: SourceId, days: ReadonlyMap<string, readonly SearchRow[]>, provisional: (day: string) => boolean, kind: ReplaceKind = "all"): Promise<number> {
	const { stmts, rows } = replaceStatements(db.dialect, site, source, days, provisional, kind);
	await writeReplace(db, stmts, rows);
	return rows;
}

/** One day: `replaceDays` over a single day. */
export async function replaceDay(db: Db, site: string, source: SourceId, day: string, rows: readonly SearchRow[], provisional: boolean): Promise<number> {
	return replaceDays(db, site, source, new Map([[day, rows]]), () => provisional);
}
