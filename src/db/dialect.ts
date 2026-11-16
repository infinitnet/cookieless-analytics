import type { Dialect } from "./adapter.js";
import { ident, type Param } from "./sql.js";

/**
 * Portable DDL. `{INT}` and `{REAL}` resolve per dialect (epoch seconds need BIGINT on Postgres), `{NOROWID}`
 * makes a clustered table on SQLite (Postgres has no equivalent; its primary key index serves the same reads),
 * `{DOC}` is the document column: a JSONB blob on SQLite, `JSONB` on Postgres.
 */
export function ddl(dialect: Dialect, sql: string): string {
	return dialect === "postgres"
		? sql
				.replace(/\{INT\}/g, "BIGINT")
				.replace(/\{REAL\}/g, "DOUBLE PRECISION")
				.replace(/\{NOROWID\}/g, "")
				.replace(/\{DOC\}/g, "JSONB NOT NULL DEFAULT '{}'::jsonb")
		: sql
				.replace(/\{INT\}/g, "INTEGER")
				.replace(/\{REAL\}/g, "REAL")
				.replace(/\{NOROWID\}/g, " WITHOUT ROWID")
				.replace(/\{DOC\}/g, "BLOB NOT NULL DEFAULT (jsonb('{}'))");
}

const JSON_KEY_RE = /^[A-Za-z0-9_]{1,32}$/;

/** Text value of a top-level JSON key. The key is validated and inlined, never user SQL. */
export function jsonExtract(dialect: Dialect, column: string, key: string): string {
	if (!JSON_KEY_RE.test(key)) throw new Error(`invalid JSON key: ${key}`);
	const col = ident(column);
	return dialect === "postgres" ? `(${col}::jsonb ->> '${key}')` : `json_extract(${col}, '$.${key}')`;
}

/** Escape `\`, `%` and `_` for `LIKE ? ESCAPE '\'`. */
export function likeEscape(value: string): string {
	return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const LIKE_ESCAPE = "ESCAPE '\\'";

/**
 * `ON CONFLICT (...) DO UPDATE SET` fragment, identical on SQLite and Postgres.
 * `set` columns take the new value; `add` columns accumulate.
 */
export function upsertClause(table: string, conflict: readonly string[], set: readonly string[] = [], add: readonly string[] = []): string {
	const t = ident(table);
	const parts = [...set.map((c) => `${ident(c)} = excluded.${c}`), ...add.map((c) => `${ident(c)} = ${t}.${c} + excluded.${c}`)];
	const target = conflict.map(ident).join(", ");
	return parts.length ? `ON CONFLICT (${target}) DO UPDATE SET ${parts.join(", ")}` : `ON CONFLICT (${target}) DO NOTHING`;
}

// ── bound fragments: integers always go through CAST ─────────────────────────

/** A SQL fragment and its parameters in placeholder order (assignable to `Stmt`). */
export interface Frag {
	sql: string;
	params: Param[];
}

const isFrag = (v: unknown): v is Frag => typeof v === "object" && v !== null && !(v instanceof Uint8Array) && "sql" in v;

/** Fixed SQL text (identifiers, literals of the code) as a fragment. Never pass user input. */
export const raw = (sql: string): Frag => ({ sql, params: [] });

/**
 * `CAST(? AS INTEGER)` for an integer bind. D1 binds every JavaScript number as REAL, on the Worker binding
 * and the REST API alike (measured: `typeof(?)` is 'real', `json_object('t', ?)` gives `{"t":30.0}`).
 */
export function int(dialect: Dialect, v: number | bigint): Frag {
	if (typeof v === "number" && !Number.isSafeInteger(v)) throw new Error(`not an integer: ${v}`);
	return { sql: `CAST(? AS ${dialect === "postgres" ? "BIGINT" : "INTEGER"})`, params: [v] };
}

/**
 * One bound value. Integers go through `int`. On Postgres every other value is typed too, because
 * `jsonb_build_object` and other variadic functions cannot infer the type of a bare parameter.
 */
export function bind(dialect: Dialect, v: Param | Frag): Frag {
	if (isFrag(v)) return v;
	if (typeof v === "bigint" || (typeof v === "number" && Number.isInteger(v))) return int(dialect, v);
	if (dialect === "sqlite") return { sql: "?", params: [v] };
	const type = typeof v === "number" ? "DOUBLE PRECISION" : typeof v === "boolean" ? "BOOLEAN" : v instanceof Uint8Array ? "BYTEA" : "TEXT";
	return { sql: `CAST(? AS ${type})`, params: [v] };
}

/**
 * Tagged template that binds every interpolated value through `bind` and inlines fragments:
 * `q(db.dialect)\`UPDATE t SET n = ${n} WHERE site = ${site}\``. Writing numbers this way, an integer
 * cannot go in as a bare `?`.
 */
export function q(dialect: Dialect) {
	return (strings: TemplateStringsArray, ...values: Array<Param | Frag>): Frag => {
		let sql = strings[0] ?? "";
		const params: Param[] = [];
		values.forEach((v, i) => {
			const f = bind(dialect, v);
			sql += f.sql + (strings[i + 1] ?? "");
			params.push(...f.params);
		});
		return { sql, params };
	};
}

/** Fragments joined by `sep`. */
export function join(parts: readonly Frag[], sep = ", "): Frag {
	return { sql: parts.map((p) => p.sql).join(sep), params: parts.flatMap((p) => p.params) };
}

// ── the visit key `(site, day, sid)` ───────────────────────────────────────────

/**
 * Encoding of `ca_sessions.day` and `ca_events.sday`. The other raw day columns are `{INT}` yyyymmdd.
 * shortcut: the visit day stays TEXT 'YYYY-MM-DD'. Every reader in `src` binds it through `visitDayKey` and
 * reads it back through `isoDay`, so flipping this constant changes the schema and every statement; what is
 * left is the test fixtures that insert visits with ISO days directly. Flip together with the summary days
 * (`ca_rollup`, `ca_revenue_daily`), which move to `{INT}` with the summaries.
 */
export const VISIT_DAY_INT = false;
/** SQL type of the visit day columns. */
export const VISIT_DAY_TYPE = VISIT_DAY_INT ? "{INT}" : "TEXT";
/** yyyymmdd of an ISO day, the encoding of the `{INT}` day columns. */
export const dayInt = (iso: string): number => Number(iso.replaceAll("-", ""));
/** ISO day of a stored day value, either encoding (yyyymmdd integers come back as numbers, Postgres BIGINT as strings). */
export const isoDay = (v: unknown): string => {
	const s = String(v);
	return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s;
};
/** The visit day of an ISO day, in the encoding of `ca_sessions.day`. */
export const visitDayKey = (iso: string): string | number => (VISIT_DAY_INT ? dayInt(iso) : iso);

// ── the visit document (`ca_sessions.hits`) ───────────────────────────────────
//
// SQLite stores the document as a JSONB blob. Only the `jsonb_*` writers keep it binary: `json_set`,
// `json_patch` and the other `json_*` writers return TEXT even on a JSONB input (measured on D1), and one of
// them in a write silently turns the column back into text. Read it through `docRead` (`json(hits)`).
// Entry keys are bound, never inlined; field names are fixed identifiers of the code.

const DOC_KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const DOC_FIELD_RE = /^[a-z]{1,8}$/;

type DocValue = Param | Frag | undefined;

function docKey(key: string): string {
	if (!DOC_KEY_RE.test(key)) throw new Error(`invalid document key: ${key}`);
	return key;
}

function docField(name: string): string {
	if (!DOC_FIELD_RE.test(name)) throw new Error(`invalid document field: ${name}`);
	return name;
}

/** Null and undefined fields are omitted from the document. */
function present(fields: Record<string, DocValue>): Array<[string, Param | Frag]> {
	return Object.entries(fields).filter((e): e is [string, Param | Frag] => e[1] !== null && e[1] !== undefined);
}

/** SQLite JSON path of an entry, or of one field of it: `'$."' || ? || '".d'`. */
function sqlitePath(key: string, field?: string): Frag {
	return { sql: `('$."' || ? || '"${field ? `.${docField(field)}` : ""}')`, params: [docKey(key)] };
}

/** JSON object of the given fields (nulls omitted). */
export function docObject(dialect: Dialect, fields: Record<string, DocValue>): Frag {
	const body = join(present(fields).map(([k, v]) => join([raw(`'${docField(k)}'`), bind(dialect, v)])));
	return { sql: `${dialect === "postgres" ? "jsonb_build_object" : "jsonb_object"}(${body.sql})`, params: body.params };
}

/** A JSON value from a JavaScript value (props objects, the initial document of an insert). */
export function docJson(dialect: Dialect, value: unknown): Frag {
	return { sql: dialect === "postgres" ? "CAST(? AS JSONB)" : "jsonb(?)", params: [JSON.stringify(value)] };
}

/** The document as JSON text, for exports and display. Never select the raw SQLite column. */
export function docRead(dialect: Dialect, column: string): Frag {
	return raw(dialect === "postgres" ? `CAST(${ident(column)} AS TEXT)` : `json(${ident(column)})`);
}

/** Set fields of entry `key`, keeping its other fields; the entry is created when missing (`jsonb_set`). */
export function docSet(dialect: Dialect, column: string, key: string, fields: Record<string, DocValue>): Frag {
	const col = ident(column);
	const list = present(fields);
	if (!list.length) return raw(col);
	if (dialect === "postgres") {
		const k = bind(dialect, docKey(key));
		return q(dialect)`(${raw(col)} || jsonb_build_object(${k}, COALESCE(${raw(col)} -> ${k}, '{}'::jsonb) || ${docObject(dialect, fields)}))`;
	}
	const pairs = join(list.map(([f, v]) => join([sqlitePath(key, f), bind(dialect, v)])));
	return { sql: `jsonb_set(${col}, ${pairs.sql})`, params: pairs.params };
}

/**
 * Add fields to entry `key` where they are absent: existing fields win, so a replayed page view changes
 * nothing and an engagement update stored first is kept (`jsonb_patch` with the stored document as the patch).
 */
export function docMerge(dialect: Dialect, column: string, key: string, fields: Record<string, DocValue>): Frag {
	const col = ident(column);
	const k = bind(dialect, docKey(key));
	const obj = docObject(dialect, fields);
	return dialect === "postgres"
		? q(dialect)`(${raw(col)} || jsonb_build_object(${k}, ${obj} || COALESCE(${raw(col)} -> ${k}, '{}'::jsonb)))`
		: q(dialect)`jsonb_patch(jsonb_object(${k}, ${obj}), ${raw(col)})`;
}

/** Put whole entries (key, JSON object) into the document, replacing an entry of the same key. */
export function docPut(dialect: Dialect, column: string, entries: ReadonlyArray<readonly [string, Frag]>): Frag {
	const col = ident(column);
	if (!entries.length) return raw(col);
	if (dialect === "postgres") {
		const obj = join(entries.map(([k, v]) => join([bind(dialect, docKey(k)), v])));
		return { sql: `(${col} || jsonb_build_object(${obj.sql}))`, params: obj.params };
	}
	const pairs = join(entries.map(([k, v]) => join([sqlitePath(k), v])));
	return { sql: `jsonb_set(${col}, ${pairs.sql})`, params: pairs.params };
}

/** Add entry `key` with `value` only when the document has no such entry (`jsonb_insert`). */
export function docInsert(dialect: Dialect, column: string, key: string, value: Frag): Frag {
	const col = ident(column);
	return dialect === "postgres"
		? q(dialect)`(jsonb_build_object(${bind(dialect, docKey(key))}, ${value}) || ${raw(col)})`
		: q(dialect)`jsonb_insert(${raw(col)}, ${sqlitePath(key)}, ${value})`;
}

/** Value of a field of entry `key` (`->>`); `int` casts on Postgres, where `->>` returns text. */
export function docGet(dialect: Dialect, column: string, key: string, field: string, as?: "int"): Frag {
	const col = ident(column);
	if (dialect === "sqlite") return q(dialect)`(${raw(col)} ->> ${sqlitePath(key, field)})`;
	const e = q(dialect)`(${raw(col)} -> ${bind(dialect, docKey(key))} ->> '${raw(docField(field))}')`;
	return as === "int" ? { ...e, sql: `CAST(${e.sql} AS BIGINT)` } : e;
}

/** Table source over the entries of a document: rows `alias.key`, `alias.value`. */
export function docEach(dialect: Dialect, column: string, alias: string): string {
	return dialect === "postgres" ? `jsonb_each(${ident(column)}) AS ${ident(alias)}(key, value)` : `json_each(${ident(column)}) AS ${ident(alias)}`;
}

/** Field of an entry row of `docEach` or a row of `paramRows`: `alias.value ->> 'f'`. */
export function field(dialect: Dialect, alias: string, name: string, as?: "int"): string {
	const e = `(${ident(alias)}.value ->> '${docField(name)}')`;
	return dialect === "postgres" && as === "int" ? `CAST(${e} AS BIGINT)` : e;
}

// ── JSON parameters: one bound value instead of one per item (D1 allows 100; `inList` in compile.ts for IN lists) ──

/** Table source over an array of objects bound as one parameter; read fields with `field(dialect, alias, name)`. */
export function paramRows(dialect: Dialect, rows: readonly Record<string, unknown>[], alias: string): Frag {
	return {
		sql: dialect === "postgres" ? `jsonb_array_elements(CAST(? AS JSONB)) AS ${ident(alias)}(value)` : `json_each(?) AS ${ident(alias)}`,
		params: [JSON.stringify(rows)],
	};
}

// ── summary upserts and retention ─────────────────────────────────────────────

/**
 * `ON CONFLICT ... DO UPDATE ... WHERE` a value differs. Without the `WHERE` an unchanged row still costs
 * 1 row written on D1 (measured: 150 for 150 unchanged rows); with it, 0. `add` columns accumulate, so they
 * change the row only when the increment is not 0.
 */
export function upsertChanged(dialect: Dialect, table: string, conflict: readonly string[], set: readonly string[] = [], add: readonly string[] = []): string {
	const t = ident(table);
	const target = conflict.map(ident).join(", ");
	if (!set.length && !add.length) return `ON CONFLICT (${target}) DO NOTHING`;
	const differs = dialect === "postgres" ? "IS DISTINCT FROM" : "IS NOT";
	const parts = [...set.map((c) => `${ident(c)} = excluded.${c}`), ...add.map((c) => `${ident(c)} = ${t}.${c} + excluded.${c}`)];
	const when = [...set.map((c) => `${t}.${c} ${differs} excluded.${c}`), ...add.map((c) => `excluded.${ident(c)} <> 0`)];
	return `ON CONFLICT (${target}) DO UPDATE SET ${parts.join(", ")} WHERE ${when.join(" OR ")}`;
}

const SID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Key ranges `[lo, hi)` that split one day of visits by the first character of the sid, 36 slices that
 * together cover every key (the first has no lower bound, the last no upper bound).
 */
export const SID_SLICES: ReadonlyArray<readonly [string | null, string | null]> = [...SID_ALPHABET].map((c, i) => [i === 0 ? null : c, SID_ALPHABET[i + 1] ?? null]);

/**
 * Retention delete of one slice of one day by key range: `site = ? AND day = ? AND sid >= ? AND sid < ?`.
 * Measured on D1: 1 row read and 1 written per row, against 4 reads per row for a delete by id list.
 */
export function deleteDaySlice(dialect: Dialect, table: string, site: string, day: string | number, slice: readonly [string | null, string | null], key = "sid"): Frag {
	const s = q(dialect);
	const k = raw(ident(key));
	const [lo, hi] = slice;
	return join(
		[s`DELETE FROM ${raw(ident(table))} WHERE site = ${site} AND day = ${day}`, ...(lo === null ? [] : [s`${k} >= ${lo}`]), ...(hi === null ? [] : [s`${k} < ${hi}`])],
		" AND ",
	);
}
