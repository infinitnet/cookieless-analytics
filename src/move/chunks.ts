/**
 * Moving the analytics tables between databases of either engine, one chunk at a time. A chunk is read by keyset
 * on the full primary key, cut by bytes, and written with one statement from one JSON parameter,
 * `ON CONFLICT DO NOTHING`, so a replayed chunk inserts nothing. Rows travel as plain objects: integers as numbers or digit strings (Postgres
 * returns BIGINT as text), the document as JSON text.
 */
import type { Db, Dialect } from "../db/adapter.js";
import { docRead, paramRows, upsertChanged } from "../db/dialect.js";
import type { Param } from "../db/sql.js";
import { type Column, TABLE_SPECS, type TableName } from "../db/tables.js";

export type MoveRow = Record<string, unknown>;
export interface Chunk {
	rows: MoveRow[];
	/** Primary key of the last row, the `after` of the next read; null when the table is done. */
	next: Param[] | null;
}

/** Read in descending key order, site first: within each site the newest day comes first, so reports fill in from recent to old while a move runs. */
const NEWEST_FIRST: ReadonlySet<TableName> = new Set(["ca_sessions"]);
/** Counters per day: a key already in the destination gets the source value added on the first load (or the larger value kept). */
const COUNTERS: Partial<Record<TableName, readonly string[]>> = { ca_srv: ["n"], ca_drops: ["n"] };
/** How a counter row whose key exists in the destination is loaded: the source count added, the larger count kept, or left alone (null). */
export type CounterMode = "add" | "max" | null;
const enc = new TextEncoder();
/** Stored sid of the source half of a visit that went on in the destination after the switch. */
export const SPLIT_SUFFIX = "~m";

function spec(table: string) {
	const s = TABLE_SPECS[table as TableName];
	if (!s) throw new Error(`not an analytics table: ${table}`);
	return s;
}

const intType = (d: Dialect) => (d === "postgres" ? "BIGINT" : "INTEGER");

/** `(key) > (after)` (or `<` for a descending table), with integer keys cast on both engines. */
function keyAfter(db: Db, table: TableName, after: readonly Param[], desc = false): { sql: string; params: Param[] } {
	const { columns, key } = spec(table);
	if (after.length !== key.length) throw new Error(`cursor of ${table} needs ${key.length} values`);
	const kinds = new Map(columns.map((c) => [c.name, c.kind]));
	return { sql: `(${key.join(", ")}) ${desc ? "<" : ">"} (${key.map((k) => (kinds.get(k) === "int" ? `CAST(? AS ${intType(db.dialect)})` : "?")).join(", ")})`, params: [...after] };
}

/**
 * Up to `limit` rows after the key `after` (null: from the start), optionally of one site, and at most `maxBytes`
 * of row JSON (the chunk travels as one bound parameter); a first row larger than that still comes alone.
 */
export async function readChunk(db: Db, table: TableName, after: readonly Param[] | null, limit: number, site?: string, maxBytes = Number.POSITIVE_INFINITY): Promise<Chunk> {
	const { columns, key } = spec(table);
	const desc = NEWEST_FIRST.has(table);
	const where: string[] = [];
	const params: Param[] = [];
	if (site !== undefined) {
		where.push("site = ?");
		params.push(site);
	}
	if (after) {
		const k = keyAfter(db, table, after, desc);
		where.push(k.sql);
		params.push(...k.params);
	}
	const select = columns.map((c) => (c.kind === "doc" ? `${docRead(db.dialect, c.name).sql} AS ${c.name}` : c.name)).join(", ");
	const order = key.map((k) => (desc ? `${k} DESC` : k)).join(", ");
	const rows = await db.all<MoveRow>(
		`SELECT ${select} FROM ${table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ${Math.max(1, Math.floor(limit))}`,
		params,
	);
	let bytes = 0;
	const keep = rows.findIndex((r, i) => (bytes += enc.encode(JSON.stringify(r)).length + 1) > maxBytes && i > 0);
	const cut = keep > 0 ? rows.slice(0, keep) : rows;
	const last = cut.at(-1);
	return { rows: cut, next: last && (keep > 0 || rows.length >= limit) ? key.map((k) => last[k] as Param) : null };
}

/** The value of one column of a row of `paramRows` (alias `v`), typed for the destination. */
function value(d: Dialect, c: Column): string {
	const e = `(v.value ->> '${c.name}')`;
	switch (c.kind) {
		case "int":
			return `CAST(${e} AS ${intType(d)})`;
		case "real":
			return `CAST(${e} AS ${d === "postgres" ? "DOUBLE PRECISION" : "REAL"})`;
		case "doc":
			return d === "postgres" ? `CAST(${e} AS JSONB)` : `jsonb(${e})`;
		default:
			return e;
	}
}

/**
 * Insert one chunk, idempotent: a key already present keeps the destination row (written since the switch, so
 * newer). Two exceptions:
 * - `ca_sessions`: a source visit whose key holds a visit with another start (the visitor went on after the
 *   switch and started a new visit under the same sid) is stored under sid plus `SPLIT_SUFFIX`, so both halves stay.
 * - `ca_srv`, `ca_drops` with `counters`: "add" adds the source count to an existing key (not idempotent: the
 *   caller passes it on the first load of a chunk only); "max" keeps the row with the larger count (idempotent; a
 *   move back, where the destination's count is already part of the source's).
 * Returns the rows inserted or changed.
 */
export async function writeChunk(db: Db, table: TableName, rows: readonly MoveRow[], counters: CounterMode = null): Promise<number> {
	if (!rows.length) return 0;
	const { columns, key } = spec(table);
	const d = db.dialect;
	const exprs = columns.map((c) => value(d, c));
	if (table === "ca_sessions") {
		const at = (name: string) => exprs[columns.findIndex((c) => c.name === name)] ?? "";
		const sid = columns.findIndex((c) => c.name === "sid");
		exprs[sid] =
			`CASE WHEN EXISTS (SELECT 1 FROM ca_sessions o WHERE o.site = ${at("site")} AND o.day = ${at("day")} AND o.sid = ${at("sid")} AND o.started <> ${at("started")})` +
			` THEN ${at("sid")} || '${SPLIT_SUFFIX}' ELSE ${at("sid")} END`;
	}
	const cols = counters ? (COUNTERS[table] ?? []) : [];
	const conflict =
		counters === "max" && cols.length
			? `ON CONFLICT (${key.join(", ")}) DO UPDATE SET ${columns.filter((c) => !key.includes(c.name)).map((c) => `${c.name} = excluded.${c.name}`).join(", ")} WHERE ${cols.map((c) => `excluded.${c} > ${table}.${c}`).join(" OR ")}`
			: upsertChanged(d, table, key, [], cols);
	const src = paramRows(d, rows, "v");
	const r = await db.run(`INSERT INTO ${table} (${columns.map((c) => c.name).join(", ")}) SELECT ${exprs.join(", ")} FROM ${src.sql} WHERE 1 = 1 ${conflict}`, src.params);
	return r.changes;
}

/** Per site and day of one table: row count and the sum of every integer and real column outside the key and the day (real sums rounded to 2 decimals), as strings. */
export type DayTotals = Record<string, Record<string, string>>;

/**
 * Verification figures computed by SQL, comparable across engines. `ca_aliases` has no day and counts under day "".
 * shortcut: sums are read as JavaScript numbers on SQLite, exact up to 2^53 per site and day; enough for epoch sums of 5 million visits a day.
 */
export async function dayTotals(db: Db, table: TableName, site?: string): Promise<DayTotals> {
	const { columns, key } = spec(table);
	const hasDay = columns.some((c) => c.name === "day");
	const summed = columns.filter((c) => (c.kind === "int" || c.kind === "real") && c.name !== "day" && !key.includes(c.name));
	const real = new Set(summed.filter((c) => c.kind === "real").map((c) => c.name));
	const sums = summed.map((c) => `SUM(${c.name}) AS ${c.name}`);
	const rows = await db.all<MoveRow>(
		`SELECT site, ${hasDay ? "day" : "''"} AS day, COUNT(*) AS n${sums.map((s) => `, ${s}`).join("")} FROM ${table}${site === undefined ? "" : " WHERE site = ?"} GROUP BY site${hasDay ? ", day" : ""}`,
		site === undefined ? [] : [site],
	);
	const out: DayTotals = {};
	// Real sums differ in the last bits between engines and summation orders: compared at 2 decimals.
	const text = (k: string, v: unknown) => (real.has(k) ? String(Math.round(Number(v ?? 0) * 100) / 100) : String(v ?? 0));
	for (const { site: s, day, ...rest } of rows) out[`${String(s)} ${String(day)}`] = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, text(k, v)]));
	return out;
}

/**
 * One page of the key check of a site and day (`day` "" for a table without a day): up to `limit` source keys after
 * `after`, and those of them the destination lacks (one anti-join on the destination). A visit split at the switch
 * counts as present under sid plus `SPLIT_SUFFIX`. Two statements.
 */
export async function missingKeys(src: Db, dst: Db, table: TableName, site: string, day: string, after: readonly Param[] | null, limit: number): Promise<{ missing: MoveRow[]; next: Param[] | null }> {
	const { columns, key } = spec(table);
	const where = ["site = ?"];
	const params: Param[] = [site];
	if (day !== "") {
		where.push(columns.find((c) => c.name === "day")?.kind === "int" ? `day = CAST(? AS ${intType(src.dialect)})` : "day = ?");
		params.push(day);
	}
	if (after) {
		const k = keyAfter(src, table, after);
		where.push(k.sql);
		params.push(...k.params);
	}
	const keys = await src.all<MoveRow>(`SELECT ${key.join(", ")} FROM ${table} WHERE ${where.join(" AND ")} ORDER BY ${key.join(", ")} LIMIT ${Math.max(1, Math.floor(limit))}`, params);
	const last = keys.at(-1);
	const next = last && keys.length >= limit ? key.map((k) => last[k] as Param) : null;
	if (!keys.length) return { missing: [], next };
	const d = dst.dialect;
	const kinds = new Map(columns.map((c) => [c.name, c]));
	const match = key.map((k) => {
		const e = value(d, kinds.get(k) as Column);
		return table === "ca_sessions" && k === "sid" ? `o.sid IN (${e}, ${e} || '${SPLIT_SUFFIX}')` : `o.${k} = ${e}`;
	});
	const v = paramRows(d, keys, "v");
	const missing = await dst.all<MoveRow>(`SELECT ${key.map((k) => `${value(d, kinds.get(k) as Column)} AS ${k}`).join(", ")} FROM ${v.sql} WHERE NOT EXISTS (SELECT 1 FROM ${table} o WHERE ${match.join(" AND ")})`, v.params);
	return { missing, next };
}
