import { t as __exportAll } from "./rolldown-runtime-95iHPtFO.mjs";
import { DEFAULT_COLLECT_PATH, DEFAULT_NAMESPACE, DEFAULT_SCRIPT_PATH, DEFAULT_SHARE_PATH, FORBIDDEN_PUBLIC_WORDS, LINK_EVENTS } from "./contract.mjs";
import { z } from "zod";

//#region src/core/time.ts
/** Time helpers. Timestamps are epoch seconds; days are `YYYY-MM-DD` strings. */
const DAY_S = 86400;
const formatters = /* @__PURE__ */ new Map();
function formatter(tz) {
	let f = formatters.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23"
		});
		formatters.set(tz, f);
	}
	return f;
}
function wallTime(ts, tz) {
	const p = {};
	for (const part of formatter(tz).formatToParts(/* @__PURE__ */ new Date(ts * 1e3))) if (part.type !== "literal") p[part.type] = Number(part.value);
	return {
		y: p.year ?? 1970,
		m: p.month ?? 1,
		d: p.day ?? 1,
		h: (p.hour ?? 0) % 24,
		mi: p.minute ?? 0,
		s: p.second ?? 0
	};
}
const pad = (n) => String(n).padStart(2, "0");
const fmtDay = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function dayInZone(ts, tz) {
	const w = wallTime(ts, tz);
	return fmtDay(w.y, w.m, w.d);
}
function hourInZone(ts, tz) {
	return wallTime(ts, tz).h;
}
/** Offset of `tz` from UTC at instant `ts`, in seconds (positive east of UTC). */
function tzOffset(ts, tz) {
	const w = wallTime(ts, tz);
	return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) / 1e3 - Math.floor(ts);
}
/** Epoch seconds of a local wall time in `tz`. Times inside a DST gap resolve one offset away. */
function zonedToEpoch(day, hour, tz) {
	const [y, m, d] = day.split("-").map(Number);
	const guess = Date.UTC(y, m - 1, d, hour) / 1e3;
	return guess - tzOffset(guess - tzOffset(guess, tz), tz);
}
/** Calendar arithmetic on `YYYY-MM-DD`. */
function addDays(day, n) {
	const [y, m, d] = day.split("-").map(Number);
	const t = new Date(Date.UTC(y, m - 1, d + n));
	return fmtDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
/** Inclusive number of days between two `YYYY-MM-DD` strings. */
function daysBetween(from, to) {
	const a = Date.parse(`${from}T00:00:00Z`);
	const b = Date.parse(`${to}T00:00:00Z`);
	return Math.round((b - a) / (DAY_S * 1e3)) + 1;
}
/** Every day from `from` to `to`, inclusive. */
function eachDay(from, to) {
	const out = [];
	for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
	return out;
}
/** Salt day: the local calendar day in `tz` that starts at `rotationHour`. */
function saltDay(ts, tz, rotationHour) {
	const w = wallTime(ts, tz);
	const day = fmtDay(w.y, w.m, w.d);
	return w.h < rotationHour ? addDays(day, -1) : day;
}
/** Epoch seconds at which the current salt day began. */
function saltBoundary(ts, tz, rotationHour) {
	return zonedToEpoch(saltDay(ts, tz, rotationHour), rotationHour, tz);
}
/** Same-length range immediately before `r`. */
function previousPeriod(r) {
	const len = daysBetween(r.from, r.to);
	return {
		from: addDays(r.from, -len),
		to: addDays(r.from, -1)
	};
}
function minusYear(day) {
	const [y, m, d] = day.split("-").map(Number);
	const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
	return fmtDay(y - 1, m, Math.min(d, last));
}
/** The same calendar range one year earlier. */
function samePeriodLastYear(r) {
	return {
		from: minusYear(r.from),
		to: minusYear(r.to)
	};
}
/** Minutes after local midnight, past the write path's reach, before a day is closed (requests in flight, cron jitter). */
const CLOSE_GRACE_S = 900;
/**
* Newest closed day (its summary may be stored). The write path reaches visits started today or yesterday
* (`liveDays`, engagement updates have no time bound), so day D can change until local midnight that starts D + 2:
* midnight plus the longest session, plus `CLOSE_GRACE_S`.
*/
function lastClosedDay(now, tz) {
	const today = dayInZone(now, tz);
	return addDays(today, now >= zonedToEpoch(today, 0, tz) + CLOSE_GRACE_S ? -2 : -3);
}

//#endregion
//#region src/db/sql.ts
/** SQL statement helpers: parameter counting and chunked `IN` lists (D1 allows 100 bound parameters). */
const MAX_PARAMS = 100;
const IN_CHUNK = 90;
function chunk(items, size = IN_CHUNK) {
	if (size < 1) throw new Error("chunk size must be positive");
	const out = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}
const IDENT_RE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;
/** Accept only plain lowercase identifiers (optionally `table.column`) from fixed maps. */
function ident(name) {
	if (!IDENT_RE.test(name)) throw new Error(`invalid identifier: ${name}`);
	return name;
}

//#endregion
//#region src/db/dialect.ts
/**
* Portable DDL. `{INT}` and `{REAL}` resolve per dialect (epoch seconds need BIGINT on Postgres), `{NOROWID}`
* makes a clustered table on SQLite (Postgres has no equivalent; its primary key index serves the same reads),
* `{DOC}` is the document column: a JSONB blob on SQLite, `JSONB` on Postgres. Postgres text columns get
* `COLLATE "C"`: key ranges and keyset paging compare bytewise as on SQLite, whatever the database default.
*/
function ddl(dialect, sql) {
	return dialect === "postgres" ? sql.replace(/\bTEXT\b/g, "TEXT COLLATE \"C\"").replace(/\{INT\}/g, "BIGINT").replace(/\{REAL\}/g, "DOUBLE PRECISION").replace(/\{NOROWID\}/g, "").replace(/\{DOC\}/g, "JSONB NOT NULL DEFAULT '{}'::jsonb") : sql.replace(/\{INT\}/g, "INTEGER").replace(/\{REAL\}/g, "REAL").replace(/\{NOROWID\}/g, " WITHOUT ROWID").replace(/\{DOC\}/g, "BLOB NOT NULL DEFAULT (jsonb('{}'))");
}
const JSON_KEY_RE = /^[A-Za-z0-9_]{1,32}$/;
/** Text value of a top-level JSON key. The key is validated and inlined, never user SQL. */
function jsonExtract(dialect, column, key) {
	if (!JSON_KEY_RE.test(key)) throw new Error(`invalid JSON key: ${key}`);
	const col = ident(column);
	return dialect === "postgres" ? `(${col}::jsonb ->> '${key}')` : `json_extract(${col}, '$.${key}')`;
}
/** Escape `\`, `%` and `_` for `LIKE ? ESCAPE '\'`. */
function likeEscape(value) {
	return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
const LIKE_ESCAPE = "ESCAPE '\\'";
/**
* `ON CONFLICT (...) DO UPDATE SET` fragment, identical on SQLite and Postgres.
* `set` columns take the new value; `add` columns accumulate.
*/
function upsertClause(table, conflict, set = [], add = []) {
	const t = ident(table);
	const parts = [...set.map((c) => `${ident(c)} = excluded.${c}`), ...add.map((c) => `${ident(c)} = ${t}.${c} + excluded.${c}`)];
	const target = conflict.map(ident).join(", ");
	return parts.length ? `ON CONFLICT (${target}) DO UPDATE SET ${parts.join(", ")}` : `ON CONFLICT (${target}) DO NOTHING`;
}
const isFrag = (v) => typeof v === "object" && v !== null && !(v instanceof Uint8Array) && "sql" in v;
/** Fixed SQL text (identifiers, literals of the code) as a fragment. Never pass user input. */
const raw = (sql) => ({
	sql,
	params: []
});
/**
* `CAST(? AS INTEGER)` for an integer bind. D1 binds every JavaScript number as REAL, on the Worker binding
* and the REST API alike (measured: `typeof(?)` is 'real', `json_object('t', ?)` gives `{"t":30.0}`).
*/
function int(dialect, v) {
	if (typeof v === "number" && !Number.isSafeInteger(v)) throw new Error(`not an integer: ${v}`);
	return {
		sql: `CAST(? AS ${dialect === "postgres" ? "BIGINT" : "INTEGER"})`,
		params: [v]
	};
}
/**
* One bound value. Integers go through `int`. On Postgres every other value is typed too, because
* `jsonb_build_object` and other variadic functions cannot infer the type of a bare parameter.
*/
function bind(dialect, v) {
	if (isFrag(v)) return v;
	if (typeof v === "bigint" || typeof v === "number" && Number.isInteger(v)) return int(dialect, v);
	if (dialect === "sqlite") return {
		sql: "?",
		params: [v]
	};
	return {
		sql: `CAST(? AS ${typeof v === "number" ? "DOUBLE PRECISION" : typeof v === "boolean" ? "BOOLEAN" : v instanceof Uint8Array ? "BYTEA" : "TEXT"})`,
		params: [v]
	};
}
/**
* Tagged template that binds every interpolated value through `bind` and inlines fragments:
* `q(db.dialect)\`UPDATE t SET n = ${n} WHERE site = ${site}\``. Writing numbers this way, an integer
* cannot go in as a bare `?`.
*/
function q(dialect) {
	return (strings, ...values) => {
		let sql = strings[0] ?? "";
		const params = [];
		values.forEach((v, i) => {
			const f = bind(dialect, v);
			sql += f.sql + (strings[i + 1] ?? "");
			params.push(...f.params);
		});
		return {
			sql,
			params
		};
	};
}
/** Fragments joined by `sep`. */
function join(parts, sep = ", ") {
	return {
		sql: parts.map((p) => p.sql).join(sep),
		params: parts.flatMap((p) => p.params)
	};
}
/** SQL type of the visit day columns. */
const VISIT_DAY_TYPE = "TEXT";
/** yyyymmdd of an ISO day, the encoding of the `{INT}` day columns. */
const dayInt = (iso) => Number(iso.replaceAll("-", ""));
/** ISO day of a stored day value, either encoding (yyyymmdd integers come back as numbers, Postgres BIGINT as strings). */
const isoDay = (v) => {
	const s = String(v);
	return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s;
};
/** The visit day of an ISO day, in the encoding of `ca_sessions.day`. */
const visitDayKey = (iso) => iso;
const DOC_KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const DOC_FIELD_RE = /^[a-z]{1,8}$/;
function docKey(key) {
	if (!DOC_KEY_RE.test(key)) throw new Error(`invalid document key: ${key}`);
	return key;
}
function docField(name) {
	if (!DOC_FIELD_RE.test(name)) throw new Error(`invalid document field: ${name}`);
	return name;
}
/** Null and undefined fields are omitted from the document. */
function present(fields) {
	return Object.entries(fields).filter((e) => e[1] !== null && e[1] !== void 0);
}
/** SQLite JSON path of an entry, or of one field of it: `'$."' || ? || '".d'`. */
function sqlitePath(key, field) {
	return {
		sql: `('$."' || ? || '"${field ? `.${docField(field)}` : ""}')`,
		params: [docKey(key)]
	};
}
/** JSON object of the given fields (nulls omitted). */
function docObject(dialect, fields) {
	const body = join(present(fields).map(([k, v]) => join([raw(`'${docField(k)}'`), bind(dialect, v)])));
	return {
		sql: `${dialect === "postgres" ? "jsonb_build_object" : "jsonb_object"}(${body.sql})`,
		params: body.params
	};
}
/** A JSON value from a JavaScript value (props objects, the initial document of an insert). */
function docJson(dialect, value) {
	return {
		sql: dialect === "postgres" ? "CAST(? AS JSONB)" : "jsonb(?)",
		params: [JSON.stringify(value)]
	};
}
/** The document as JSON text, for exports and display. Never select the raw SQLite column. */
function docRead(dialect, column) {
	return raw(dialect === "postgres" ? `CAST(${ident(column)} AS TEXT)` : `json(${ident(column)})`);
}
/** Set fields of entry `key`, keeping its other fields; the entry is created when missing (`jsonb_set`). */
function docSet(dialect, column, key, fields) {
	const col = ident(column);
	const list = present(fields);
	if (!list.length) return raw(col);
	if (dialect === "postgres") {
		const k = bind(dialect, docKey(key));
		return q(dialect)`(${raw(col)} || jsonb_build_object(${k}, COALESCE(${raw(col)} -> ${k}, '{}'::jsonb) || ${docObject(dialect, fields)}))`;
	}
	const pairs = join(list.map(([f, v]) => join([sqlitePath(key, f), bind(dialect, v)])));
	return {
		sql: `jsonb_set(${col}, ${pairs.sql})`,
		params: pairs.params
	};
}
/** Put whole entries (key, JSON object) into the document, replacing an entry of the same key. */
function docPut(dialect, column, entries) {
	const col = ident(column);
	if (!entries.length) return raw(col);
	if (dialect === "postgres") {
		const obj = join(entries.map(([k, v]) => join([bind(dialect, docKey(k)), v])));
		return {
			sql: `(${col} || jsonb_build_object(${obj.sql}))`,
			params: obj.params
		};
	}
	const pairs = join(entries.map(([k, v]) => join([sqlitePath(k), v])));
	return {
		sql: `jsonb_set(${col}, ${pairs.sql})`,
		params: pairs.params
	};
}
/** Value of a field of entry `key` (`->>`); `int` casts on Postgres, where `->>` returns text. */
function docGet(dialect, column, key, field, as) {
	const col = ident(column);
	if (dialect === "sqlite") return q(dialect)`(${raw(col)} ->> ${sqlitePath(key, field)})`;
	const e = q(dialect)`(${raw(col)} -> ${bind(dialect, docKey(key))} ->> '${raw(docField(field))}')`;
	return as === "int" ? {
		...e,
		sql: `CAST(${e.sql} AS BIGINT)`
	} : e;
}
/** Table source over the entries of a document: rows `alias.key`, `alias.value`. */
function docEach(dialect, column, alias) {
	return dialect === "postgres" ? `jsonb_each(${ident(column)}) AS ${ident(alias)}(key, value)` : `json_each(${ident(column)}) AS ${ident(alias)}`;
}
/** Field of an entry row of `docEach` or a row of `paramRows`: `alias.value ->> 'f'`. */
function field(dialect, alias, name, as) {
	const e = `(${ident(alias)}.value ->> '${docField(name)}')`;
	return dialect === "postgres" && as === "int" ? `CAST(${e} AS BIGINT)` : e;
}
/** Table source over an array of objects bound as one parameter; read fields with `field(dialect, alias, name)`. */
function paramRows(dialect, rows, alias) {
	return {
		sql: dialect === "postgres" ? `jsonb_array_elements(CAST(? AS JSONB)) AS ${ident(alias)}(value)` : `json_each(?) AS ${ident(alias)}`,
		params: [JSON.stringify(rows)]
	};
}
/**
* `ON CONFLICT ... DO UPDATE ... WHERE` a value differs. Without the `WHERE` an unchanged row still costs
* 1 row written on D1 (measured: 150 for 150 unchanged rows); with it, 0. `add` columns accumulate, so they
* change the row only when the increment is not 0.
*/
function upsertChanged(dialect, table, conflict, set = [], add = []) {
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
const SID_SLICES = [...SID_ALPHABET].map((c, i) => [i === 0 ? null : c, SID_ALPHABET[i + 1] ?? null]);
/**
* Retention delete of one slice of one day by key range: `site = ? AND day = ? AND sid >= ? AND sid < ?`.
* Measured on D1: 1 row read and 1 written per row, against 4 reads per row for a delete by id list.
*/
function deleteDaySlice(dialect, table, site, day, slice, key = "sid") {
	const s = q(dialect);
	const k = raw(ident(key));
	const [lo, hi] = slice;
	return join([
		s`DELETE FROM ${raw(ident(table))} WHERE site = ${site} AND day = ${day}`,
		...lo === null ? [] : [s`${k} >= ${lo}`],
		...hi === null ? [] : [s`${k} < ${hi}`]
	], " AND ");
}

//#endregion
//#region src/data/currencies.json
var currencies_default = [
	{
		"code": "AED",
		"exp": 2,
		"name": "UAE Dirham"
	},
	{
		"code": "AFN",
		"exp": 2,
		"name": "Afghani"
	},
	{
		"code": "ALL",
		"exp": 2,
		"name": "Lek"
	},
	{
		"code": "AMD",
		"exp": 2,
		"name": "Armenian Dram"
	},
	{
		"code": "AOA",
		"exp": 2,
		"name": "Kwanza"
	},
	{
		"code": "ARS",
		"exp": 2,
		"name": "Argentine Peso"
	},
	{
		"code": "AUD",
		"exp": 2,
		"name": "Australian Dollar"
	},
	{
		"code": "AWG",
		"exp": 2,
		"name": "Aruban Florin"
	},
	{
		"code": "AZN",
		"exp": 2,
		"name": "Azerbaijan Manat"
	},
	{
		"code": "BAM",
		"exp": 2,
		"name": "Convertible Mark"
	},
	{
		"code": "BBD",
		"exp": 2,
		"name": "Barbados Dollar"
	},
	{
		"code": "BDT",
		"exp": 2,
		"name": "Taka"
	},
	{
		"code": "BHD",
		"exp": 3,
		"name": "Bahraini Dinar"
	},
	{
		"code": "BIF",
		"exp": 0,
		"name": "Burundi Franc"
	},
	{
		"code": "BMD",
		"exp": 2,
		"name": "Bermudian Dollar"
	},
	{
		"code": "BND",
		"exp": 2,
		"name": "Brunei Dollar"
	},
	{
		"code": "BOB",
		"exp": 2,
		"name": "Boliviano"
	},
	{
		"code": "BRL",
		"exp": 2,
		"name": "Brazilian Real"
	},
	{
		"code": "BSD",
		"exp": 2,
		"name": "Bahamian Dollar"
	},
	{
		"code": "BTN",
		"exp": 2,
		"name": "Ngultrum"
	},
	{
		"code": "BWP",
		"exp": 2,
		"name": "Pula"
	},
	{
		"code": "BYN",
		"exp": 2,
		"name": "Belarusian Ruble"
	},
	{
		"code": "BZD",
		"exp": 2,
		"name": "Belize Dollar"
	},
	{
		"code": "CAD",
		"exp": 2,
		"name": "Canadian Dollar"
	},
	{
		"code": "CDF",
		"exp": 2,
		"name": "Congolese Franc"
	},
	{
		"code": "CHF",
		"exp": 2,
		"name": "Swiss Franc"
	},
	{
		"code": "CLP",
		"exp": 0,
		"name": "Chilean Peso"
	},
	{
		"code": "CNY",
		"exp": 2,
		"name": "Yuan Renminbi"
	},
	{
		"code": "COP",
		"exp": 2,
		"name": "Colombian Peso"
	},
	{
		"code": "CRC",
		"exp": 2,
		"name": "Costa Rican Colon"
	},
	{
		"code": "CUP",
		"exp": 2,
		"name": "Cuban Peso"
	},
	{
		"code": "CVE",
		"exp": 2,
		"name": "Cabo Verde Escudo"
	},
	{
		"code": "CZK",
		"exp": 2,
		"name": "Czech Koruna"
	},
	{
		"code": "DJF",
		"exp": 0,
		"name": "Djibouti Franc"
	},
	{
		"code": "DKK",
		"exp": 2,
		"name": "Danish Krone"
	},
	{
		"code": "DOP",
		"exp": 2,
		"name": "Dominican Peso"
	},
	{
		"code": "DZD",
		"exp": 2,
		"name": "Algerian Dinar"
	},
	{
		"code": "EGP",
		"exp": 2,
		"name": "Egyptian Pound"
	},
	{
		"code": "ERN",
		"exp": 2,
		"name": "Nakfa"
	},
	{
		"code": "ETB",
		"exp": 2,
		"name": "Ethiopian Birr"
	},
	{
		"code": "EUR",
		"exp": 2,
		"name": "Euro"
	},
	{
		"code": "FJD",
		"exp": 2,
		"name": "Fiji Dollar"
	},
	{
		"code": "FKP",
		"exp": 2,
		"name": "Falkland Islands Pound"
	},
	{
		"code": "GBP",
		"exp": 2,
		"name": "Pound Sterling"
	},
	{
		"code": "GEL",
		"exp": 2,
		"name": "Lari"
	},
	{
		"code": "GHS",
		"exp": 2,
		"name": "Ghana Cedi"
	},
	{
		"code": "GIP",
		"exp": 2,
		"name": "Gibraltar Pound"
	},
	{
		"code": "GMD",
		"exp": 2,
		"name": "Dalasi"
	},
	{
		"code": "GNF",
		"exp": 0,
		"name": "Guinean Franc"
	},
	{
		"code": "GTQ",
		"exp": 2,
		"name": "Quetzal"
	},
	{
		"code": "GYD",
		"exp": 2,
		"name": "Guyana Dollar"
	},
	{
		"code": "HKD",
		"exp": 2,
		"name": "Hong Kong Dollar"
	},
	{
		"code": "HNL",
		"exp": 2,
		"name": "Lempira"
	},
	{
		"code": "HTG",
		"exp": 2,
		"name": "Gourde"
	},
	{
		"code": "HUF",
		"exp": 2,
		"name": "Forint"
	},
	{
		"code": "IDR",
		"exp": 2,
		"name": "Rupiah"
	},
	{
		"code": "ILS",
		"exp": 2,
		"name": "New Israeli Sheqel"
	},
	{
		"code": "INR",
		"exp": 2,
		"name": "Indian Rupee"
	},
	{
		"code": "IQD",
		"exp": 3,
		"name": "Iraqi Dinar"
	},
	{
		"code": "IRR",
		"exp": 2,
		"name": "Iranian Rial"
	},
	{
		"code": "ISK",
		"exp": 0,
		"name": "Iceland Krona"
	},
	{
		"code": "JMD",
		"exp": 2,
		"name": "Jamaican Dollar"
	},
	{
		"code": "JOD",
		"exp": 3,
		"name": "Jordanian Dinar"
	},
	{
		"code": "JPY",
		"exp": 0,
		"name": "Yen"
	},
	{
		"code": "KES",
		"exp": 2,
		"name": "Kenyan Shilling"
	},
	{
		"code": "KGS",
		"exp": 2,
		"name": "Som"
	},
	{
		"code": "KHR",
		"exp": 2,
		"name": "Riel"
	},
	{
		"code": "KMF",
		"exp": 0,
		"name": "Comorian Franc"
	},
	{
		"code": "KPW",
		"exp": 2,
		"name": "North Korean Won"
	},
	{
		"code": "KRW",
		"exp": 0,
		"name": "Won"
	},
	{
		"code": "KWD",
		"exp": 3,
		"name": "Kuwaiti Dinar"
	},
	{
		"code": "KYD",
		"exp": 2,
		"name": "Cayman Islands Dollar"
	},
	{
		"code": "KZT",
		"exp": 2,
		"name": "Tenge"
	},
	{
		"code": "LAK",
		"exp": 2,
		"name": "Lao Kip"
	},
	{
		"code": "LBP",
		"exp": 2,
		"name": "Lebanese Pound"
	},
	{
		"code": "LKR",
		"exp": 2,
		"name": "Sri Lanka Rupee"
	},
	{
		"code": "LRD",
		"exp": 2,
		"name": "Liberian Dollar"
	},
	{
		"code": "LSL",
		"exp": 2,
		"name": "Loti"
	},
	{
		"code": "LYD",
		"exp": 3,
		"name": "Libyan Dinar"
	},
	{
		"code": "MAD",
		"exp": 2,
		"name": "Moroccan Dirham"
	},
	{
		"code": "MDL",
		"exp": 2,
		"name": "Moldovan Leu"
	},
	{
		"code": "MGA",
		"exp": 2,
		"name": "Malagasy Ariary"
	},
	{
		"code": "MKD",
		"exp": 2,
		"name": "Denar"
	},
	{
		"code": "MMK",
		"exp": 2,
		"name": "Kyat"
	},
	{
		"code": "MNT",
		"exp": 2,
		"name": "Tugrik"
	},
	{
		"code": "MOP",
		"exp": 2,
		"name": "Pataca"
	},
	{
		"code": "MRU",
		"exp": 2,
		"name": "Ouguiya"
	},
	{
		"code": "MUR",
		"exp": 2,
		"name": "Mauritius Rupee"
	},
	{
		"code": "MVR",
		"exp": 2,
		"name": "Rufiyaa"
	},
	{
		"code": "MWK",
		"exp": 2,
		"name": "Malawi Kwacha"
	},
	{
		"code": "MXN",
		"exp": 2,
		"name": "Mexican Peso"
	},
	{
		"code": "MYR",
		"exp": 2,
		"name": "Malaysian Ringgit"
	},
	{
		"code": "MZN",
		"exp": 2,
		"name": "Mozambique Metical"
	},
	{
		"code": "NAD",
		"exp": 2,
		"name": "Namibia Dollar"
	},
	{
		"code": "NGN",
		"exp": 2,
		"name": "Naira"
	},
	{
		"code": "NIO",
		"exp": 2,
		"name": "Cordoba Oro"
	},
	{
		"code": "NOK",
		"exp": 2,
		"name": "Norwegian Krone"
	},
	{
		"code": "NPR",
		"exp": 2,
		"name": "Nepalese Rupee"
	},
	{
		"code": "NZD",
		"exp": 2,
		"name": "New Zealand Dollar"
	},
	{
		"code": "OMR",
		"exp": 3,
		"name": "Rial Omani"
	},
	{
		"code": "PAB",
		"exp": 2,
		"name": "Balboa"
	},
	{
		"code": "PEN",
		"exp": 2,
		"name": "Sol"
	},
	{
		"code": "PGK",
		"exp": 2,
		"name": "Kina"
	},
	{
		"code": "PHP",
		"exp": 2,
		"name": "Philippine Peso"
	},
	{
		"code": "PKR",
		"exp": 2,
		"name": "Pakistan Rupee"
	},
	{
		"code": "PLN",
		"exp": 2,
		"name": "Zloty"
	},
	{
		"code": "PYG",
		"exp": 0,
		"name": "Guarani"
	},
	{
		"code": "QAR",
		"exp": 2,
		"name": "Qatari Rial"
	},
	{
		"code": "RON",
		"exp": 2,
		"name": "Romanian Leu"
	},
	{
		"code": "RSD",
		"exp": 2,
		"name": "Serbian Dinar"
	},
	{
		"code": "RUB",
		"exp": 2,
		"name": "Russian Ruble"
	},
	{
		"code": "RWF",
		"exp": 0,
		"name": "Rwanda Franc"
	},
	{
		"code": "SAR",
		"exp": 2,
		"name": "Saudi Riyal"
	},
	{
		"code": "SBD",
		"exp": 2,
		"name": "Solomon Islands Dollar"
	},
	{
		"code": "SCR",
		"exp": 2,
		"name": "Seychelles Rupee"
	},
	{
		"code": "SDG",
		"exp": 2,
		"name": "Sudanese Pound"
	},
	{
		"code": "SEK",
		"exp": 2,
		"name": "Swedish Krona"
	},
	{
		"code": "SGD",
		"exp": 2,
		"name": "Singapore Dollar"
	},
	{
		"code": "SHP",
		"exp": 2,
		"name": "Saint Helena Pound"
	},
	{
		"code": "SLE",
		"exp": 2,
		"name": "Leone"
	},
	{
		"code": "SOS",
		"exp": 2,
		"name": "Somali Shilling"
	},
	{
		"code": "SRD",
		"exp": 2,
		"name": "Surinam Dollar"
	},
	{
		"code": "SSP",
		"exp": 2,
		"name": "South Sudanese Pound"
	},
	{
		"code": "STN",
		"exp": 2,
		"name": "Dobra"
	},
	{
		"code": "SVC",
		"exp": 2,
		"name": "El Salvador Colon"
	},
	{
		"code": "SYP",
		"exp": 2,
		"name": "Syrian Pound"
	},
	{
		"code": "SZL",
		"exp": 2,
		"name": "Lilangeni"
	},
	{
		"code": "THB",
		"exp": 2,
		"name": "Baht"
	},
	{
		"code": "TJS",
		"exp": 2,
		"name": "Somoni"
	},
	{
		"code": "TMT",
		"exp": 2,
		"name": "Turkmenistan New Manat"
	},
	{
		"code": "TND",
		"exp": 3,
		"name": "Tunisian Dinar"
	},
	{
		"code": "TOP",
		"exp": 2,
		"name": "Pa'anga"
	},
	{
		"code": "TRY",
		"exp": 2,
		"name": "Turkish Lira"
	},
	{
		"code": "TTD",
		"exp": 2,
		"name": "Trinidad and Tobago Dollar"
	},
	{
		"code": "TWD",
		"exp": 2,
		"name": "New Taiwan Dollar"
	},
	{
		"code": "TZS",
		"exp": 2,
		"name": "Tanzanian Shilling"
	},
	{
		"code": "UAH",
		"exp": 2,
		"name": "Hryvnia"
	},
	{
		"code": "UGX",
		"exp": 0,
		"name": "Uganda Shilling"
	},
	{
		"code": "USD",
		"exp": 2,
		"name": "US Dollar"
	},
	{
		"code": "UYU",
		"exp": 2,
		"name": "Peso Uruguayo"
	},
	{
		"code": "UZS",
		"exp": 2,
		"name": "Uzbekistan Sum"
	},
	{
		"code": "VED",
		"exp": 2,
		"name": "Bolivar Digital"
	},
	{
		"code": "VES",
		"exp": 2,
		"name": "Bolivar Soberano"
	},
	{
		"code": "VND",
		"exp": 0,
		"name": "Dong"
	},
	{
		"code": "VUV",
		"exp": 0,
		"name": "Vatu"
	},
	{
		"code": "WST",
		"exp": 2,
		"name": "Tala"
	},
	{
		"code": "XAF",
		"exp": 0,
		"name": "CFA Franc BEAC"
	},
	{
		"code": "XCD",
		"exp": 2,
		"name": "East Caribbean Dollar"
	},
	{
		"code": "XCG",
		"exp": 2,
		"name": "Caribbean Guilder"
	},
	{
		"code": "XOF",
		"exp": 0,
		"name": "CFA Franc BCEAO"
	},
	{
		"code": "XPF",
		"exp": 0,
		"name": "CFP Franc"
	},
	{
		"code": "YER",
		"exp": 2,
		"name": "Yemeni Rial"
	},
	{
		"code": "ZAR",
		"exp": 2,
		"name": "Rand"
	},
	{
		"code": "ZMW",
		"exp": 2,
		"name": "Zambian Kwacha"
	},
	{
		"code": "ZWG",
		"exp": 2,
		"name": "Zimbabwe Gold"
	}
];

//#endregion
//#region src/core/currency.ts
/**
* ISO 4217 currencies and money formatting. Pure: shared by the server, the admin
* bundle, the share renderer and the email renderer. No `Intl`, so every runtime prints the same text.
*/
const CURRENCIES = currencies_default;
const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));
const REVENUE_MAX_VALUE = 1e9;
const REVENUE_MAX_OID = 64;
const MAX_CURRENCIES_LISTED = 5;
/** An uppercase code on the embedded list. */
const isCurrency = (code) => typeof code === "string" && BY_CODE.has(code);
/** Trim, uppercase, three letters, listed; anything else is null (never a fallback). */
function normalizeCurrency(input) {
	if (typeof input !== "string") return null;
	const c = input.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(c) && BY_CODE.has(c) ? c : null;
}
/** Minor unit exponent of a code; 2 for an unknown code. */
const exponent = (code) => BY_CODE.get(code)?.exp ?? 2;
/** Round half away from zero to the currency's minor unit. `toPrecision(15)` absorbs binary drift (1.005 * 100). */
function roundMinor(value, code) {
	const f = 10 ** exponent(code);
	const r = Math.round(Number((Math.abs(value) * f).toPrecision(15))) / f;
	return value < 0 ? -r : r;
}
/** `1,234.50 USD`, `1,235 JPY`: grouped integer part, the minor unit digits, a space and the code. */
function formatAmount(value, code) {
	const e = exponent(code);
	const fixed = Math.abs(roundMinor(value, code)).toFixed(e);
	const [int = "0", frac] = fixed.split(".");
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return `${value < 0 && Number(fixed) !== 0 ? "-" : ""}${grouped}${frac ? `.${frac}` : ""} ${code}`;
}

//#endregion
//#region src/query/safe-regex.ts
const MAX_PATTERN_LENGTH = 200;
const MAX_GROUPS = 20;
const MAX_REPEAT = 50;
const MAX_COMBINATIONS = 1e3;
const fail = (error) => ({
	ok: false,
	error
});
/** Quantifier at `i`, or null. Returns its end index and whether it is unbounded. */
function quantifierAt(p, i) {
	const c = p[i];
	let end;
	let unbounded = false;
	let min = c === "+" ? 1 : 0;
	let max = 1;
	if (c === "*" || c === "+") {
		end = i + 1;
		unbounded = true;
		max = Number.POSITIVE_INFINITY;
	} else if (c === "?") end = i + 1;
	else if (c === "{") {
		const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i));
		if (!m) return null;
		const lo = Number(m[1]);
		min = lo;
		max = m[2] === void 0 ? lo : m[3] === "" ? Number.POSITIVE_INFINITY : Number(m[3]);
		if (lo > MAX_REPEAT || Number.isFinite(max) && max > MAX_REPEAT) return { error: `Repeats above ${MAX_REPEAT} are not allowed.` };
		unbounded = !Number.isFinite(max);
		end = i + m[0].length;
	} else return null;
	if (p[end] === "?") end++;
	return {
		end,
		unbounded,
		min,
		max
	};
}
/** Length of the escape sequence at `i` (pointing at the backslash), or an error. */
function escapeAt(p, i) {
	const n = p[i + 1];
	if (n === void 0) return { error: "Pattern does not compile." };
	if (/[1-9]/.test(n) || n === "k" && p[i + 2] === "<") return { error: "Backreferences are not allowed." };
	if (n === "p" || n === "P") return { error: "Unicode property escapes are not allowed." };
	if (n === "u") return /^[0-9a-fA-F]{4}$/.test(p.slice(i + 2, i + 6)) ? 6 : { error: "Pattern does not compile." };
	if (n === "x") return /^[0-9a-fA-F]{2}$/.test(p.slice(i + 2, i + 4)) ? 4 : { error: "Pattern does not compile." };
	if (n === "c") return /[A-Za-z]/.test(p[i + 2] ?? "") ? 3 : { error: "Pattern does not compile." };
	return 2;
}
function validateSafeRegex(pattern, flags = "") {
	if (typeof pattern !== "string" || pattern.length === 0) return fail("Pattern is empty.");
	if (pattern.length > MAX_PATTERN_LENGTH) return fail(`Pattern is longer than ${MAX_PATTERN_LENGTH} characters.`);
	if (!/^i?$/.test(flags)) return fail("Only the i flag is allowed.");
	const p = pattern;
	const stack = [{
		hasQuantifier: false,
		hasAlternation: false
	}];
	let groups = 0;
	let openEnded = 0;
	let combinations = 1;
	let last = { kind: "none" };
	let i = 0;
	while (i < p.length) {
		const c = p[i];
		const top = stack[stack.length - 1];
		if (c === "\\") {
			const len = escapeAt(p, i);
			if (typeof len !== "number") return fail(len.error);
			i += len;
			last = { kind: "atom" };
			continue;
		}
		if (c === "[") {
			let j = i + 1;
			if (p[j] === "^") j++;
			if (p[j] === "]") j++;
			while (j < p.length && p[j] !== "]") if (p[j] === "\\") {
				const len = escapeAt(p, j);
				if (typeof len !== "number") return fail(len.error);
				j += len;
			} else j++;
			if (j >= p.length) return fail("Pattern does not compile.");
			i = j + 1;
			last = { kind: "atom" };
			continue;
		}
		if (c === "(") {
			if (p[i + 1] === "?") {
				const rest = p.slice(i + 2);
				if (/^<?[=!]/.test(rest)) return fail("Lookaround is not allowed.");
				const named = /^<[A-Za-z_][A-Za-z0-9_]*>/.exec(rest);
				if (rest.startsWith(":")) i += 3;
				else if (named) i += 2 + named[0].length;
				else return fail("Pattern does not compile.");
			} else i += 1;
			if (++groups > MAX_GROUPS) return fail(`More than ${MAX_GROUPS} groups are not allowed.`);
			stack.push({
				hasQuantifier: false,
				hasAlternation: false
			});
			last = { kind: "none" };
			continue;
		}
		if (c === ")") {
			if (stack.length < 2) return fail("Pattern does not compile.");
			const frame = stack.pop();
			const parent = stack[stack.length - 1];
			if (frame.hasQuantifier) parent.hasQuantifier = true;
			i += 1;
			last = {
				kind: "group",
				frame
			};
			continue;
		}
		if (c === "|") {
			top.hasAlternation = true;
			i += 1;
			last = { kind: "none" };
			continue;
		}
		const q = quantifierAt(p, i);
		if (q && "error" in q) return fail(q.error);
		if (q) {
			if (last.kind === "none") return fail("Pattern does not compile.");
			if (last.kind === "group" && q.max > 1) {
				if (last.frame.hasQuantifier) return fail("Nested quantifiers are not allowed.");
				if (last.frame.hasAlternation) return fail("Quantified groups with alternation are not allowed.");
				if (q.unbounded && p[i] === "{") return fail("Unbounded repeats on groups are not allowed.");
			}
			top.hasQuantifier = true;
			if (q.unbounded) openEnded++;
			else combinations *= q.max - q.min + 1;
			if (combinations > MAX_COMBINATIONS) return fail("Optional and ranged repeats allow too many combinations.");
			i = q.end;
			last = { kind: "none" };
			continue;
		}
		i += 1;
		last = { kind: "atom" };
	}
	if (stack.length !== 1) return fail("Pattern does not compile.");
	const anchored = p.startsWith("^") && !stack[0].hasAlternation;
	if (openEnded > (anchored ? 2 : 1)) return fail(anchored ? "At most two open-ended repeats (*, +) are allowed." : "At most one open-ended repeat (*, +) is allowed unless the pattern starts with ^.");
	try {
		new RegExp(p, flags);
	} catch {
		return fail("Pattern does not compile.");
	}
	return { ok: true };
}
/** Compile a validated pattern, or return null. */
function compileSafeRegex(pattern, flags = "i") {
	return validateSafeRegex(pattern, flags).ok ? new RegExp(pattern, flags) : null;
}

//#endregion
//#region src/names.ts
const RESERVED_PREFIXES = [
	"/_emdash",
	"/_astro",
	"/_image"
];
const PATH_RE = /^\/[A-Za-z0-9._~\-/]{1,63}$/;
const NAMESPACE_RE = /^[A-Za-z_][A-Za-z0-9_]{1,15}$/;
/** True when the value contains none of the forbidden public words (case-insensitive). */
function isNeutral(value) {
	const v = value.toLowerCase();
	return !FORBIDDEN_PUBLIC_WORDS.some((w) => v.includes(w));
}
function normalizePublicPath(value, fallback) {
	if (typeof value !== "string") return fallback;
	const v = value.trim();
	if (!PATH_RE.test(v) || v.includes("//") || v.includes("/../") || v.endsWith("/..")) return fallback;
	const lower = v.toLowerCase();
	if (RESERVED_PREFIXES.some((p) => lower.startsWith(p))) return fallback;
	return isNeutral(v) ? v : fallback;
}
function normalizeScriptPath(value) {
	return normalizePublicPath(value, DEFAULT_SCRIPT_PATH);
}
function normalizeCollectPath(value) {
	return normalizePublicPath(value, DEFAULT_COLLECT_PATH);
}
/** Like the script path, with trailing slashes stripped first. */
function normalizeSharePath(value) {
	return normalizePublicPath(typeof value === "string" ? value.trim().replace(/\/+$/, "") : value, DEFAULT_SHARE_PATH);
}
function normalizeNamespace(value) {
	if (typeof value !== "string") return DEFAULT_NAMESPACE;
	const v = value.trim();
	return NAMESPACE_RE.test(v) && isNeutral(v) ? v : DEFAULT_NAMESPACE;
}
/** Names derived from a (normalized) namespace: `__ec` gives `data-ec-event`, `__ecq`, `__ec:ready`. */
function publicNames(namespace) {
	const ns = normalizeNamespace(namespace);
	const attrPrefix = `data-${ns.replace(/^_+/, "").toLowerCase().replace(/_/g, "-") || "ec"}-`;
	return {
		namespace: ns,
		queue: `${ns}q`,
		readyEvent: `${ns}:ready`,
		attrPrefix,
		attrEvent: `${attrPrefix}event`,
		attrPropPrefix: `${attrPrefix}prop-`,
		attrIgnore: `${attrPrefix}ignore`
	};
}

//#endregion
//#region src/link-rules.ts
/**
* Link rules (`linkRules` setting): one rule per line, `<pattern> <event> [label]`. Parsed here for the
* server and the admin page; the page script (`src/client/boot.ts`) runs the same match at click time.
* A leaf module: the admin Settings page imports it, so it imports nothing else.
*/
const MAX_LINK_RULES = 20;
const MAX_LINK_RULES_TEXT = 2048;
const HOST_RE = /^([a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{1,5})?)\//i;
const EVENT_RE = /^[A-Za-z0-9.:-][A-Za-z0-9_.:-]{0,63}$/;
const LABEL_RE = /^[^\s\u0000-\u001f\u007f]{1,64}$/;
/** Valid rules (the first 20) and the message of the first bad line, if any. Bad lines are left out. */
function parseLinkRules(text, ignored = []) {
	const rules = [];
	let error = text.length > MAX_LINK_RULES_TEXT ? "All rules together are longer than 2,048 characters." : void 0;
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim() ?? "";
		if (!line) continue;
		const bad = lineError(line, ignored, rules);
		if (bad) error ??= `Line ${i + 1}: ${bad}`;
		else if (rules.length < MAX_LINK_RULES) rules.push(ruleOf(line));
		else error ??= `At most ${MAX_LINK_RULES} rules.`;
	}
	return error ? {
		rules,
		error
	} : { rules };
}
/** The rule of a valid line; a host is lowercased, as the browser gives it. */
function ruleOf(line) {
	const [p = "", n = "", l] = line.split(/\s+/);
	const pattern = p.replace(HOST_RE, (h) => h.toLowerCase());
	return l ? [
		pattern,
		n,
		l
	] : [pattern, n];
}
function lineError(line, ignored, rules) {
	const parts = line.split(/\s+/);
	if (parts.length < 2 || parts.length > 3) return "use \"pattern event\" or \"pattern event label\".";
	const [p = "", n = "", l] = parts;
	const regex = p[0] === "~" && p.length > 1;
	if (!regex && !(p[0] === "/" || p.startsWith("mailto:") || p.startsWith("tel:") || HOST_RE.test(p))) return "the pattern starts with /, a host name, mailto:, tel: or ~ for a regular expression.";
	if (regex) {
		const r = validateSafeRegex(p.slice(1), "i");
		if (!r.ok) return r.error;
	} else if (p.length > 200) return "the pattern is longer than 200 characters.";
	if (n !== "-" && !EVENT_RE.test(n)) return "the event name uses letters, digits, _ . : and -, up to 64 characters, and does not start with _.";
	if (n === "seen" || n === "conv") return "seen and conv are not click events.";
	if (l !== void 0 && !LABEL_RE.test(l)) return "the label is 1 to 64 characters with no spaces.";
	if (!isNeutral(line)) return "contains a word that is not served to visitors.";
	const under = p[0] === "/" ? ignored.find((x) => p.startsWith(x)) : void 0;
	if (under) return `${under} is a short link path prefix, whose redirect already reports the click. Remove it there or here.`;
	const pattern = ruleOf(line)[0];
	if (rules.some((r) => r[0] === pattern)) return "the same pattern is used twice.";
}

//#endregion
//#region src/settings.ts
const SCRIPT_FOR_BOTS_CAVEAT = "Page fragments land in the route cache, which is keyed without the user agent and sends no Vary: User-Agent header, so a page first cached for a bot would be served to humans without the script. Enable only with route caching off.";
const opts = (list) => list.map(([value, label]) => ({
	value,
	label
}));
/** Leads the first description of the host settings form, which lists the keys in declaration order. */
const HOST_FORM_POINTER = "Edit these on the plugin's own Settings page, which groups them and checks each value.";
/**
* Descriptor `settingsSchema`: every setting key with label, description and default. The key order is
* the order of the sections of the admin Settings page (`SETTINGS_SECTIONS` in `src/routes/settings.ts`).
*/
const settingsSchema = {
	siteTimezone: {
		type: "string",
		label: "Site timezone",
		description: `${HOST_FORM_POINTER} IANA timezone used for days and hours in reports, for example Europe/Berlin.`,
		default: "UTC"
	},
	siteOrigin: {
		type: "url",
		label: "Site origin",
		description: "Canonical origin such as https://example.com, used to match Search pages and as the Google sign-in return address. Empty uses the request origin.",
		default: ""
	},
	defaultCurrency: {
		type: "select",
		label: "Default currency",
		description: "Currency stored with event values that name none, and shown on the Revenue page and in revenue reports when none is chosen. Changing it never relabels recorded values and converts nothing.",
		options: CURRENCIES.map((c) => ({
			value: c.code,
			label: `${c.code} ${c.name}`
		})),
		default: "USD"
	},
	excludeEditors: {
		type: "boolean",
		label: "Exclude editors",
		description: "Do not record visits of logged-in editors and administrators.",
		default: true
	},
	siteId: {
		type: "string",
		label: "Site id",
		description: "Identifier stored with every row. Lowercase letters, digits and dashes, up to 32 characters.",
		default: "default"
	},
	injectScript: {
		type: "boolean",
		label: "Inject script tag",
		description: "Turn off when the theme adds the script tag itself.",
		default: true
	},
	scriptDelivery: {
		type: "select",
		label: "Script delivery",
		description: "External file (cacheable) or one inline script tag.",
		options: opts([["external", "External file"], ["inline", "Inline"]]),
		default: "external"
	},
	autoOutbound: {
		type: "boolean",
		label: "Outbound link events",
		description: "Record clicks to other hosts.",
		default: true
	},
	autoDownloads: {
		type: "boolean",
		label: "Download events",
		description: "Record clicks on download links.",
		default: true
	},
	downloadExtensions: {
		type: "string",
		label: "Download extensions",
		description: "Comma separated file extensions treated as downloads.",
		default: "pdf,zip,docx,xlsx,pptx,csv,mp3,mp4,dmg,exe"
	},
	autoForms: {
		type: "boolean",
		label: "Form events",
		description: "Record form submissions.",
		default: true
	},
	ignorePathPrefixes: {
		type: "string",
		label: "Short link path prefixes",
		description: "Path prefixes of short link redirects on this site, one per line or comma separated, for example /go/. Links and form buttons pointing under them get no download, form or link rule event; the redirect reports its own outbound link event.",
		default: "",
		multiline: true
	},
	linkRules: {
		type: "string",
		label: "Link rules",
		description: "Link clicks to record, one rule per line: a pattern, an event name and an optional label, for example /go/ out. A pattern is the start of a path, of a host and path, mailto: or tel:, or ~ followed by a regular expression. The label is sent as the slug property; without one, the rest of the link after the prefix (or the first group of the regular expression) is. The first rule that matches sends its one event and stops: that click gets no automatic outbound or download event. The event name - records nothing. Links under a short link path prefix and elements with a markup event are left to those. At most 20 rules.",
		default: "",
		multiline: true
	},
	siteSearchParams: {
		type: "string",
		label: "Site search parameters",
		description: "Query parameter names of your site search, comma separated, at most 5 (for example q or s). Empty is off. The words searched for are kept on page views, lowercased, with emails and long numbers removed.",
		default: ""
	},
	logErrorPages: {
		type: "boolean",
		label: "Log error pages",
		description: "Record human requests that end with status 400 or above.",
		default: true
	},
	scriptPath: {
		type: "string",
		label: "Script path",
		description: "Neutral public path that serves the page script.",
		default: DEFAULT_SCRIPT_PATH
	},
	collectPath: {
		type: "string",
		label: "Event path",
		description: "Neutral public path that receives page events.",
		default: DEFAULT_COLLECT_PATH
	},
	sharePath: {
		type: "string",
		label: "Share path",
		description: "Neutral public path under which shared dashboard links are served.",
		default: DEFAULT_SHARE_PATH
	},
	namespace: {
		type: "string",
		label: "Window namespace",
		description: "Global name of the page script API. Also derives the data attribute prefix.",
		default: DEFAULT_NAMESPACE
	},
	scriptForBots: {
		type: "select",
		label: "Script for known bots",
		description: `Always emit the same tag for every visitor (default), or skip it for known bot user agents. ${SCRIPT_FOR_BOTS_CAVEAT}`,
		options: opts([["always", "Always (identical HTML)"], ["skip_known_bots", "Skip for known bots"]]),
		default: "always"
	},
	signals: {
		type: "select",
		label: "Privacy signals",
		description: "Browser privacy signals that drop a visit.",
		options: opts([
			["none", "None"],
			["gpc", "Global Privacy Control"],
			["dnt_and_gpc", "Do Not Track and Global Privacy Control"]
		]),
		default: "gpc"
	},
	ipTruncation: {
		type: "select",
		label: "IP truncation",
		description: "Prefix kept for the daily visitor key. The address itself is never stored.",
		options: opts([["standard", "Standard (/24 and /48)"], ["strict", "Strict (/16 and /32)"]]),
		default: "standard"
	},
	captureLanguage: {
		type: "boolean",
		label: "Capture language",
		description: "Store the primary browser language tag.",
		default: true
	},
	captureRegion: {
		type: "boolean",
		label: "Capture region",
		description: "Store the edge region in addition to the country.",
		default: false
	},
	excludePaths: {
		type: "string",
		label: "Excluded path prefixes",
		description: "One prefix per line or comma separated.",
		default: "/_emdash/",
		multiline: true
	},
	excludeIpPrefixes: {
		type: "string",
		label: "Excluded IP ranges",
		description: "CIDR list, comma or newline separated.",
		default: "",
		multiline: true
	},
	ignoreReferrerHosts: {
		type: "string",
		label: "Ignored referrer hosts",
		description: "Extra payment or login hosts that never start a source.",
		default: ""
	},
	queryAllowlist: {
		type: "string",
		label: "Query parameter allowlist",
		description: "Query parameters kept on stored paths. A trailing * matches a prefix.",
		default: "utm_*,gclid,msclkid,fbclid"
	},
	saltTimezone: {
		type: "string",
		label: "Salt timezone",
		description: "IANA timezone of the daily salt rotation.",
		default: "UTC"
	},
	saltRotationHour: {
		type: "number",
		label: "Salt rotation hour",
		description: "Local hour at which the daily salt rotates.",
		default: 0,
		min: 0,
		max: 23
	},
	sessionWindowMinutes: {
		type: "number",
		label: "Session window (minutes)",
		description: "Inactivity gap that ends a session. Applies to new sessions; existing sessions keep their own window.",
		default: 30,
		min: 1,
		max: 240
	},
	engagedThresholdSeconds: {
		type: "number",
		label: "Engaged threshold (seconds)",
		description: "Active time that makes a session engaged.",
		default: 10,
		min: 1,
		max: 300
	},
	longClickSeconds: {
		type: "number",
		label: "Long click (seconds)",
		description: "A session lasting longer than this is a long click, at or below it a short click. Applied when reports run, so every stored session is reclassified at once.",
		default: 60,
		min: 10,
		max: 600
	},
	badExperienceSeconds: {
		type: "number",
		label: "Bad experience (seconds)",
		description: "A single page session without interaction that lasts less than this is a bad experience. Never above the long click threshold.",
		default: 10,
		min: 1,
		max: 60
	},
	realtimeWindowMinutes: {
		type: "number",
		label: "Realtime window (minutes)",
		description: "Sessions seen within this time count as active now.",
		default: 5,
		min: 1,
		max: 60
	},
	maxSessionMinutes: {
		type: "number",
		label: "Maximum session length (minutes)",
		description: "A session older than this is closed and a new one starts. At most one day: a visit is looked up among visits started today or yesterday.",
		default: 1440,
		min: 10,
		max: 1440
	},
	reloadDedupeSeconds: {
		type: "number",
		label: "Reload dedupe (seconds)",
		description: "A reload of the same path within this time is not counted again.",
		default: 2,
		min: 0,
		max: 60
	},
	maxEngagedMsPerPage: {
		type: "number",
		label: "Maximum engaged time per page (ms)",
		description: "Cap for the active time reported for one page.",
		default: 18e5,
		min: 6e4,
		max: 72e5
	},
	acceptClientRevenue: {
		type: "boolean",
		label: "Accept revenue from browsers",
		description: "When off, values, currencies and order ids are dropped from every browser request. Server calls and the agent events route still record them. A guard against casual spoofing, not authentication.",
		default: true
	},
	autoAnnotations: {
		type: "boolean",
		label: "Automatic annotations",
		description: "Add an annotation when content is published or updated. Off, the content hooks write nothing; annotations added by hand are unaffected.",
		default: true
	},
	annotatePublish: {
		type: "boolean",
		label: "Annotate publishing",
		description: "Add an annotation when an item is published.",
		default: true
	},
	annotateUpdate: {
		type: "boolean",
		label: "Annotate updates",
		description: "Add an annotation when a published item is saved again. Off by default: every save of a published item would mark the charts.",
		default: false
	},
	annotateCollections: {
		type: "string",
		label: "Annotated collections",
		description: "Collection slugs that add automatic annotations, one per line or comma separated, for example posts. Empty is every collection.",
		default: "",
		multiline: true
	},
	autoAnnotationsPerDay: {
		type: "number",
		label: "Automatic annotations per day",
		description: "At most this many automatic annotations per site and day in the site timezone; further publishes and updates that day add none, so a bulk import cannot fill the charts with markers. Saving the same item again the same day replaces its annotation and does not count again.",
		default: 10,
		min: 1,
		max: 200
	},
	searchBrandTerms: {
		type: "string",
		label: "Brand terms",
		description: "One term per line, at most 20 terms of 2 to 40 characters. Queries containing a term are left out of cannibalization and striking distance unless brand queries are included.",
		default: "",
		multiline: true
	},
	searchMinImpressions: {
		type: "number",
		label: "SEO views impression floor",
		description: "A query or page counts in cannibalization, position movement, rising and declining and decay only with at least this many impressions in a period (page views for the traffic views).",
		default: 50,
		min: 1,
		max: 1e5
	},
	searchOverlapMinShare: {
		type: "number",
		label: "Cannibalization share floor (percent)",
		description: "Percent of a query's impressions a page needs to count as competing for it.",
		default: 10,
		min: 1,
		max: 50
	},
	backfillDays: {
		type: "number",
		label: "Older Search days to load (days)",
		description: "Days that Load older days on the Search page reaches back by default: the first connect of a source uses it (not on the small profile, where older days load only from Start loading), and so do the agent API and the file import, which skips older days. Google keeps about 16 months, Bing about 6 months; a longer range stops there.",
		default: 90,
		min: 1,
		max: 490
	},
	searchRetentionDays: {
		type: "number",
		label: "Search retention (days)",
		description: "Days of search rows kept.",
		default: 800,
		min: 90,
		max: 1e3
	},
	searchSyncHours: {
		type: "number",
		label: "Search sync interval (hours)",
		description: "Minimum hours between provider pulls per source.",
		default: 6,
		min: 1,
		max: 24
	},
	syncSubrequestBudget: {
		type: "number",
		label: "Sync request budget",
		description: "Requests (provider calls, database statements, storage calls) one Search sync run may make. The Workers Free plan allows 50 per invocation, so keep 40 there; on a Paid plan (1,000) raise it, for example to 900.",
		default: 40,
		min: 20,
		max: 950
	},
	searchMaxRowsPerDay: {
		type: "number",
		label: "Search rows per day",
		description: "Row cap per day for the page with query breakdown. Also bounds what the SEO views can see.",
		default: 5e3,
		min: 1e3,
		max: 25e3
	},
	gscAuth: {
		type: "select",
		label: "Google Search Console",
		description: "How the plugin signs in to Google Search Console.",
		options: opts([
			["off", "Off"],
			["oauth", "OAuth client"],
			["service_account", "Service account"]
		]),
		default: "off"
	},
	gscProperty: {
		type: "string",
		label: "Search Console property",
		description: "Property such as sc-domain:example.com or https://example.com/. Filled by the property picker after sign-in.",
		default: ""
	},
	gscClientId: {
		type: "string",
		label: "Google OAuth client id",
		description: "Client id of your own Google Cloud OAuth web client.",
		default: ""
	},
	gscClientSecret: {
		type: "secret",
		label: "Google OAuth client secret",
		description: "Client secret of the OAuth web client. Encrypted by the host; needs EMDASH_ENCRYPTION_KEY."
	},
	gscRefreshToken: {
		type: "secret",
		label: "Google refresh token",
		description: "Written by the Google sign-in on the Search page; may also be pasted. Encrypted by the host."
	},
	gscServiceAccount: {
		type: "secret",
		label: "Google service account key",
		description: "Service account JSON key. Add the service account email to the property as a user. Encrypted by the host."
	},
	bingEnabled: {
		type: "boolean",
		label: "Bing Webmaster",
		description: "Pull search data from Bing Webmaster Tools.",
		default: false
	},
	bingAuth: {
		type: "select",
		label: "Bing sign-in",
		description: "API key (default) or OAuth client. OAuth needs a client created in Bing Webmaster Tools under Settings, API access, OAuth client.",
		options: opts([["apikey", "API key"], ["oauth", "OAuth client"]]),
		default: "apikey"
	},
	bingApiKey: {
		type: "secret",
		label: "Bing Webmaster API key",
		description: "API key from Bing Webmaster Tools. Encrypted by the host."
	},
	bingClientId: {
		type: "string",
		label: "Bing OAuth client id",
		description: "Client id of the OAuth client created in Bing Webmaster Tools.",
		default: ""
	},
	bingClientSecret: {
		type: "secret",
		label: "Bing OAuth client secret",
		description: "Client secret of the Bing OAuth client. Encrypted by the host; needs EMDASH_ENCRYPTION_KEY."
	},
	bingRefreshToken: {
		type: "secret",
		label: "Bing refresh token",
		description: "Written by Connect Bing on the Search page. Encrypted by the host."
	},
	bingSiteUrl: {
		type: "url",
		label: "Bing site url",
		description: "The site url exactly as registered in Bing Webmaster Tools.",
		default: ""
	},
	capacityProfile: {
		type: "select",
		label: "Capacity profile",
		description: "How much analytics data is kept and how much background work one run may do. Standard: for Workers Paid, up to 6 GB of analytics data. Small: for the Workers Free plan, up to 300 MB and lighter background work (40 requests per run instead of 400); it also pauses recording for the rest of the UTC day when the day's writes near the Free plan's limit, so the CMS can still save content. Dedicated: when analytics has its own database, up to 9 GB. The storage budget below can change these sizes. When the budget is reached, the oldest detailed days are replaced by daily summaries; nothing is sampled. A quarter of the budget is reserved for summaries.",
		options: opts([
			["small", "Small (Workers Free)"],
			["standard", "Standard"],
			["dedicated", "Dedicated database"]
		]),
		default: "standard"
	},
	storageBudgetMb: {
		type: "number",
		label: "Storage budget (MB)",
		description: "Space the analytics tables may use, in megabytes. 0 uses the capacity profile's default (Small 300, Standard 6000, Dedicated 9000). When the detailed data would not fit, the detailed window shortens and older days are kept as daily summaries. A D1 database holds 10 GB in total and refuses writes when full; in the EmDash database that space is shared with the site's content. Allowed: 50 to 450 with Small, 100 to 9000 in the EmDash database, 100 to 9500 in an own D1 database, 100 to 2000000 on Postgres. The Settings and Data pages warn above 300 with Small (strongly above 400), above 6000 in the EmDash database (strongly above 8000, or when budget and content together pass 9500) and above 9000 in an own D1 database.",
		default: 0,
		min: 0,
		max: 2e6
	},
	rawRetentionDays: {
		type: "number",
		label: "Detailed data (days)",
		description: "Days of detailed rows kept. All filters and views work on detailed data. Older days are kept as daily summaries for the summary retention. The window shortens by itself when the detailed data would not fit the storage budget.",
		default: 760,
		min: 7,
		max: 760
	},
	rollupRetentionMonths: {
		type: "number",
		label: "Summary retention (months)",
		description: "Months of daily summaries kept.",
		default: 25,
		min: 1,
		max: 120
	},
	ingestTier: {
		type: "select",
		label: "Ingest tier",
		description: "Where page views, events and engagement updates are written. Direct writes them to the database. Queue sends them to a Cloudflare Queue for the consumer Worker to write; it is used only while the CA_QUEUE binding exists, and a failed send is written directly. See Limits.",
		options: opts([["direct", "Direct to the database"], ["queue", "Queue (needs the CA_QUEUE binding and the consumer Worker)"]]),
		default: "direct"
	},
	agentRateLimitPerMinute: {
		type: "number",
		label: "Agent API requests per minute",
		description: "Rate limit per API key and isolate, so approximate across isolates.",
		default: 60,
		min: 5,
		max: 1200
	},
	maxPageviewsPerSession: {
		type: "number",
		label: "Maximum pageviews per session",
		description: "Further pageviews in the same session are dropped.",
		default: 500,
		min: 10,
		max: 1e4
	},
	maxEventsPerSession: {
		type: "number",
		label: "Maximum events per session",
		description: "Further events in the same session are dropped.",
		default: 200,
		min: 10,
		max: 1e4
	},
	maxEventsPerSidPerMinute: {
		type: "number",
		label: "Events per session per minute",
		description: "Rate cap per session id.",
		default: 60,
		min: 10,
		max: 600
	},
	maxEventsPerVkeyPerMinute: {
		type: "number",
		label: "Events per visitor per minute",
		description: "Rate cap per daily visitor key.",
		default: 300,
		min: 10,
		max: 3e3
	}
};
/**
* Limits per capacity profile: `bytes` is the storage budget of the analytics tables (summaries may use up to
* `SUMMARY_SHARE` of it, detailed visits the rest), `requests` the database and storage calls one background
* run may make (the Workers Free plan allows 50 per invocation, a paid plan 1,000).
*/
const PROFILES = {
	small: {
		bytes: 3e8,
		requests: 40
	},
	standard: {
		bytes: 6e9,
		requests: 400
	},
	dedicated: {
		bytes: 9e9,
		requests: 400
	}
};
const SUMMARY_SHARE = .25;
/** A D1 database holds 10 GB; the EmDash database shares it with the site's content, so its budget stops at 9 GB. */
const HOST_MAX_MB = 9e3;
/** An own D1 database leaves 500 MB for what the estimate does not count (Search rows, aliases, space freed by deletes). */
const OWN_MAX_MB = 9500;
/** The most a D1 database holds, in MB: 500 on the Workers Free plan (`small`), else 10 GB. */
const d1CapMb = (profile) => profile === "small" ? 500 : 1e4;
/** Content plus analytics in the EmDash database above this share of `d1CapMb` is the strong warning at any budget. */
const HOST_FULL_SHARE = .95;
/** Postgres has no hard cap to protect; the budget only keeps a small hosted plan from filling up. */
const PG_MAX_MB = 2e6;
/** The budget table row of a profile in a target. `small` on D1 is the Workers Free plan's 500 MB database, wherever it is. */
function budgetRange(profile, target) {
	const def = PROFILES[profile].bytes / 1e6;
	if (target === "postgres") return {
		def,
		min: 100,
		max: PG_MAX_MB,
		caution: null,
		strong: null
	};
	if (profile === "small") return {
		def,
		min: 50,
		max: 450,
		caution: 300,
		strong: 400
	};
	if (target === "own") return {
		def,
		min: 100,
		max: OWN_MAX_MB,
		caution: 9e3,
		strong: null
	};
	return {
		def: Math.min(def, HOST_MAX_MB),
		min: 100,
		max: HOST_MAX_MB,
		caution: 6e3,
		strong: 8e3
	};
}
/** Budget in MB the setting gives in `target`: the profile default for 0, else the value clamped to the row's range (a value saved for another target never exceeds this one's maximum). */
function budgetMb(s, target) {
	const r = budgetRange(s.capacityProfile, target);
	return s.storageBudgetMb ? Math.min(r.max, Math.max(r.min, Math.round(s.storageBudgetMb))) : r.def;
}
/** The storage budget of the analytics tables in `target`: bytes, and the row's maximum in MB. The only reader of a profile's bytes. */
function storageBudget(s, target) {
	return {
		bytes: budgetMb(s, target) * 1e6,
		max: budgetRange(s.capacityProfile, target).max
	};
}
/**
* Warning level of the budget the setting gives in `target`. `otherMb`, when known, is the rest of the EmDash database
* (content and everything else besides the analytics estimate): with it, budget plus that rest above `HOST_FULL_SHARE`
* of the profile's database (`d1CapMb`) is strong at any value.
*/
function budgetWarning(s, target, otherMb) {
	const mb = budgetMb(s, target);
	const r = budgetRange(s.capacityProfile, target);
	if (r.strong !== null && mb > r.strong || target === "host" && otherMb !== void 0 && mb + otherMb > HOST_FULL_SHARE * d1CapMb(s.capacityProfile)) return "strong";
	return r.caution !== null && mb > r.caution ? "caution" : "none";
}
/** `https://host[:port]` from a url with no path, query or credentials; anything else is empty. */
function normalizeOrigin(v) {
	try {
		const u = new URL(v);
		if (u.protocol !== "https:" && u.protocol !== "http:" || u.username || u.password || u.search || u.hash || u.pathname !== "/" && u.pathname !== "") return "";
		return u.origin;
	} catch {
		return "";
	}
}
function normalizeHttpUrl(v) {
	try {
		const u = new URL(v);
		return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password && v.length <= 2048 ? u.href : "";
	} catch {
		return "";
	}
}
function isValidTimezone(tz) {
	if (typeof tz !== "string" || tz === "") return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}
function splitList(v) {
	return v.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}
const IPV4_CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
const IPV6_CIDR = /^[0-9a-f:]{2,39}\/(\d{1,3})$/;
function isCidr(s) {
	const m4 = IPV4_CIDR.exec(s);
	if (m4) return m4.slice(1, 5).every((o) => Number(o) <= 255) && Number(m4[5]) <= 32;
	const m6 = IPV6_CIDR.exec(s);
	return !!m6 && s.includes(":") && Number(m6[1]) <= 128;
}
const MAX_BRAND_TERMS = 20;
/** D1 refuses LIKE patterns of 50 bytes or more; a term is used as `%term%` with backslash, `%` and `_` escaped. */
const likeBytes = (t) => new TextEncoder().encode(`%${t.replace(/[\\%_]/g, "\\$&")}%`).length;
/** Brand terms: one per line, trimmed and lowercased, 2 to 40 characters, LIKE pattern under 50 bytes, unique, at most 20. */
function parseBrandTerms(v) {
	const terms = v.split(/\r?\n/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2 && t.length <= 40 && likeBytes(t) < 50);
	return [...new Set(terms)].slice(0, MAX_BRAND_TERMS);
}
const listNormalizers = {
	excludePaths: (s) => s.startsWith("/") && s.length <= 256,
	ignorePathPrefixes: (s) => s.startsWith("/") && s.length <= 256 && isNeutral(s),
	excludeIpPrefixes: isCidr,
	ignoreReferrerHosts: (s) => /^[a-z0-9.-]{1,253}$/.test(s),
	queryAllowlist: (s) => /^[a-z0-9_.-]{1,64}\*?$/.test(s),
	downloadExtensions: (s) => /^[a-z0-9]{1,8}$/.test(s),
	siteSearchParams: (s) => SITE_SEARCH_PARAM_RE.test(s),
	annotateCollections: (s) => /^[a-z][a-z0-9_]{0,63}$/.test(s)
};
const LOWERCASE_LISTS = new Set([
	"excludeIpPrefixes",
	"ignoreReferrerHosts",
	"queryAllowlist",
	"downloadExtensions",
	"siteSearchParams",
	"annotateCollections"
]);
const SITE_SEARCH_MAX_PARAMS = 5;
/** A site search parameter name; lowercase because stored query keys are lowercased (`normalizeUrl`). */
const SITE_SEARCH_PARAM_RE = /^[a-z0-9_]{1,16}$/;
/** Site search parameter names of a comma or space separated string: lowercased, unique, at most 5, and the invalid ones. */
function parseSiteSearchParams(v) {
	const items = [...new Set(splitList(v.toLowerCase()))];
	const invalid = items.filter((n) => !SITE_SEARCH_PARAM_RE.test(n));
	if (items.length - invalid.length > SITE_SEARCH_MAX_PARAMS) invalid.push(...items.filter((n) => SITE_SEARCH_PARAM_RE.test(n)).slice(SITE_SEARCH_MAX_PARAMS));
	return {
		names: items.filter((n) => !invalid.includes(n)),
		invalid
	};
}
function toNumber(v) {
	const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
	return Number.isFinite(n) ? n : void 0;
}
function toBoolean(v) {
	if (typeof v === "boolean") return v;
	if (v === "true" || v === 1) return true;
	if (v === "false" || v === 0) return false;
}
/** Apply defaults, range clamps and neutral fallbacks to raw stored settings. Never throws. */
function normalizeSettings(raw) {
	const src = raw ?? {};
	const out = {};
	for (const [key, field] of Object.entries(settingsSchema)) {
		const v = src[key];
		switch (field.type) {
			case "number": {
				const n = toNumber(v);
				const def = field.default ?? 0;
				out[key] = n === void 0 ? def : Math.min(field.max ?? n, Math.max(field.min ?? n, Math.round(n)));
				break;
			}
			case "boolean":
				out[key] = toBoolean(v) ?? field.default ?? false;
				break;
			case "select":
				out[key] = typeof v === "string" && field.options.some((o) => o.value === v) ? v : field.default;
				break;
			case "secret":
				out[key] = typeof v === "string" ? v : "";
				break;
			default: {
				const def = "default" in field ? field.default ?? "" : "";
				const s = typeof v === "string" ? v : def;
				const check = listNormalizers[key];
				if (check) {
					const items = splitList(LOWERCASE_LISTS.has(key) ? s.toLowerCase() : s).filter(check);
					out[key] = [...new Set(items)];
				} else out[key] = s.trim();
			}
		}
	}
	const s = out;
	if (!/^[a-z0-9-]{1,32}$/.test(s.siteId)) s.siteId = "default";
	if (!isValidTimezone(s.siteTimezone)) s.siteTimezone = "UTC";
	if (!isValidTimezone(s.saltTimezone)) s.saltTimezone = "UTC";
	s.scriptPath = normalizeScriptPath(s.scriptPath);
	s.collectPath = normalizeCollectPath(s.collectPath);
	s.namespace = normalizeNamespace(s.namespace);
	s.siteOrigin = s.siteOrigin ? normalizeOrigin(s.siteOrigin) : "";
	s.bingSiteUrl = s.bingSiteUrl ? normalizeHttpUrl(s.bingSiteUrl) : "";
	if (s.scriptPath === s.collectPath) {
		s.scriptPath = DEFAULT_SCRIPT_PATH;
		s.collectPath = DEFAULT_COLLECT_PATH;
	}
	s.searchBrandTerms = parseBrandTerms(String(out.searchBrandTerms ?? ""));
	s.siteSearchParams = s.siteSearchParams.slice(0, SITE_SEARCH_MAX_PARAMS);
	s.linkRules = parseLinkRules(String(out.linkRules ?? ""), s.ignorePathPrefixes).rules;
	s.sharePath = normalizeSharePath(s.sharePath);
	if (s.sharePath === s.scriptPath || s.sharePath === s.collectPath) s.sharePath = DEFAULT_SHARE_PATH;
	if (s.sharePath === s.scriptPath || s.sharePath === s.collectPath) {
		s.scriptPath = DEFAULT_SCRIPT_PATH;
		s.collectPath = DEFAULT_COLLECT_PATH;
	}
	return s;
}
const DEFAULT_SETTINGS = Object.freeze(normalizeSettings({}));
/** How long a failed settings read is cached before the next request retries. */
const SETTINGS_FAILURE_TTL_MS = 5e3;
/**
* Isolate cache around a raw settings loader. Concurrent calls share one load.
* A failing loader serves the last good snapshot, or defaults when none was ever
* loaded, and is retried after at most SETTINGS_FAILURE_TTL_MS (never a full ttl of defaults).
*/
function cachedSettings(loader, ttlMs = 6e4, now = Date.now) {
	let good;
	let value;
	let at = Number.NEGATIVE_INFINITY;
	let ttl = ttlMs;
	let inflight;
	const get = () => {
		if (value && now() - at < ttl) return Promise.resolve(value);
		inflight ??= loader().then((raw) => {
			good = normalizeSettings(raw);
			ttl = ttlMs;
			return good;
		}).catch(() => {
			ttl = Math.min(ttlMs, SETTINGS_FAILURE_TTL_MS);
			return good ?? normalizeSettings({});
		}).then((s) => {
			value = s;
			at = now();
			inflight = void 0;
			return s;
		});
		return inflight;
	};
	/** The next read reloads (after the plugin itself wrote a setting). */
	const clear = () => {
		at = Number.NEGATIVE_INFINITY;
	};
	return Object.assign(get, { clear });
}

//#endregion
//#region src/query/filters.ts
/** Filter and query model. Every identifier reaching SQL comes from the fixed maps here. */
const OPS = [
	"is",
	"is_not",
	"contains",
	"not_contains",
	"prefix",
	"not_prefix",
	"regex",
	"not_regex"
];
/** Numeric comparison ops: valid on the `revenue` dim only. */
const NUM_OPS = [
	"gt",
	"gte",
	"lt",
	"lte"
];
const NEGATED = new Set([
	"is_not",
	"not_contains",
	"not_prefix",
	"not_regex"
]);
/** Traffic dimensions. `goal` and `event_prop` are expanded by the compiler. */
const TRAFFIC_DIMS = {
	page: {
		scope: "hit",
		column: "path",
		kind: "pv"
	},
	entry: {
		scope: "session",
		column: "entry_path"
	},
	exit: {
		scope: "session",
		column: "exit_path"
	},
	channel: {
		scope: "session",
		column: "channel"
	},
	source: {
		scope: "session",
		column: "source"
	},
	ref_host: {
		scope: "session",
		column: "ref_host"
	},
	utm_source: {
		scope: "session",
		column: "utm_source"
	},
	utm_medium: {
		scope: "session",
		column: "utm_medium"
	},
	utm_campaign: {
		scope: "session",
		column: "utm_campaign"
	},
	utm_term: {
		scope: "session",
		column: "utm_term"
	},
	utm_content: {
		scope: "session",
		column: "utm_content"
	},
	host: {
		scope: "session",
		column: "host"
	},
	country: {
		scope: "session",
		column: "country"
	},
	region: {
		scope: "session",
		column: "region"
	},
	device: {
		scope: "session",
		column: "device"
	},
	browser: {
		scope: "session",
		column: "browser"
	},
	os: {
		scope: "session",
		column: "os"
	},
	lang: {
		scope: "session",
		column: "lang"
	},
	event: {
		scope: "hit",
		column: "name",
		kind: "ev"
	},
	event_prop: {
		scope: "hit",
		column: "props",
		kind: "ev"
	},
	goal: {
		scope: "hit",
		column: "path"
	}
};
/** Dimensions of the search reports: `page` is the normalized page key. */
const SEARCH_DIMS = {
	page: {
		scope: "search",
		column: "page_key"
	},
	query: {
		scope: "search",
		column: "query"
	},
	country: {
		scope: "search",
		column: "country"
	},
	device: {
		scope: "search",
		column: "device"
	},
	source: {
		scope: "search",
		column: "source"
	}
};
/**
* Revenue dimensions: `currency` (is, is_not) and `revenue` (gt, gte, lt, lte, `prop` the
* currency). Both are session semi-joins over revenue hits, compiled apart from the maps above.
*/
const REVENUE_DIMS$1 = ["currency", "revenue"];
/** `params.dim` of `revenue_breakdown`; `campaign` is the `utm_campaign` field. */
const REVENUE_BREAKDOWN_DIMS = [
	"channel",
	"source",
	"campaign",
	"entry",
	"page",
	"country",
	"device",
	"goal",
	"event"
];
/** `params.by` of the `links` report (Links convention). */
const LINK_BY = [
	"link",
	"place",
	"page",
	"channel",
	"source",
	"campaign",
	"entry",
	"country",
	"device"
];
const REVENUE_VALUE_RE = /^\d{1,10}(\.\d{1,3})?$/;
const DIM_NAMES = [...new Set([
	...Object.keys(TRAFFIC_DIMS),
	...REVENUE_DIMS$1,
	...Object.keys(SEARCH_DIMS)
])];
const PROP_KEY_RE = /^[A-Za-z0-9_]{1,32}$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** Range cap for the admin route (raw and rollup windows are bounded separately). */
const MAX_RANGE_DAYS = 1e3;
const MAX_FILTERS = 20;
const MAX_VALUES = 500;
const FilterSchema = z.object({
	dim: z.enum(DIM_NAMES),
	op: z.enum([...OPS, ...NUM_OPS]),
	values: z.array(z.string().min(1).max(512)).min(1).max(MAX_VALUES),
	prop: z.string().regex(PROP_KEY_RE).optional()
}).strict().refine((f) => f.dim === "revenue" || f.dim === "event_prop" === (f.prop !== void 0), {
	message: "prop is required for event_prop and only allowed there",
	path: ["prop"]
});
const Day = z.string().regex(DAY_RE);
const QuerySchema = z.object({
	from: Day,
	to: Day,
	filters: z.array(FilterSchema).max(MAX_FILTERS).default([]),
	segment: z.string().min(1).max(128).optional(),
	compare: z.enum([
		"previous",
		"year",
		"none",
		"segment"
	]).default("none"),
	compareSegment: z.string().min(1).max(128).optional(),
	granularity: z.enum([
		"auto",
		"hour",
		"day",
		"week"
	]).default("auto"),
	site: z.string().regex(/^[a-z0-9-]{1,32}$/).optional()
}).strict().refine((q) => q.compare === "segment" === (q.compareSegment !== void 0), {
	message: "compareSegment is required for compare segment and only allowed there",
	path: ["compareSegment"]
}).refine((q) => q.from <= q.to, {
	message: "from must not be after to",
	path: ["from"]
}).refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 864e5 < MAX_RANGE_DAYS, {
	message: `range is longer than ${MAX_RANGE_DAYS} days`,
	path: ["to"]
});
/** Goal definition from the `goals` collection. */
const GoalSchema = z.object({
	name: z.string().min(1).max(64),
	type: z.enum([
		"page",
		"event",
		"outbound"
	]),
	match: z.enum([
		"is",
		"prefix",
		"regex",
		"contains"
	]),
	value: z.string().min(1).max(512),
	props: z.record(z.string().regex(PROP_KEY_RE), z.string().max(128)).optional(),
	active: z.boolean().optional()
});
/** One funnel step: a page or an event, matched like a goal. */
const FunnelStepSchema = z.object({
	type: z.enum(["page", "event"]),
	match: z.enum([
		"is",
		"prefix",
		"regex"
	]).default("is"),
	value: z.string().min(1).max(512),
	label: z.string().max(64).optional()
});
const FunnelStepsSchema = z.array(FunnelStepSchema).min(2).max(6);
/** How steps chain within a session; a record without `mode` is sequential. */
const FUNNEL_MODES = [
	"sequential",
	"strict",
	"flexible"
];

//#endregion
//#region src/query/compile.ts
/** Typed query error; the route maps it to a host `PluginRouteError` with the same code. */
var QueryError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "QueryError";
	}
};
const TRUE = {
	sql: "1 = 1",
	params: []
};
const FALSE = {
	sql: "0 = 1",
	params: []
};
/** Distinct values fetched for regex expansion. */
const REGEX_DISTINCT_LIMIT = 5e3;
const REGEX_MATCH_LIMIT = 2e3;
/** Budget for filter parameters in one statement; D1 allows 100 and reports need the rest. */
const FILTER_PARAM_BUDGET = 60;
const and = (frags) => {
	const real = frags.filter((f) => f.sql !== TRUE.sql);
	if (!real.length) return TRUE;
	return {
		sql: real.map((f) => `(${f.sql})`).join(" AND "),
		params: real.flatMap((f) => f.params)
	};
};
const or = (frags) => {
	if (!frags.length) return FALSE;
	if (frags.length === 1) return frags[0];
	return {
		sql: frags.map((f) => `(${f.sql})`).join(" OR "),
		params: frags.flatMap((f) => f.params)
	};
};
/**
* `col IN` a list, chunked at 90 values. Each chunk binds one JSON array parameter, so a filter with
* any number of values (or a regex expansion of 2000 matches) stays inside the D1 parameter limit.
*/
function inList(dialect, col, values, int = false, size = IN_CHUNK) {
	if (!values.length) return FALSE;
	if (values.length === 1) return {
		sql: `${col} = ?`,
		params: [values[0]]
	};
	const each = dialect === "postgres" ? int ? "SELECT CAST(jsonb_array_elements_text(CAST(? AS jsonb)) AS BIGINT)" : "SELECT jsonb_array_elements_text(CAST(? AS jsonb))" : "SELECT value FROM json_each(?)";
	return or(chunk(values, size).map((part) => ({
		sql: `${col} IN (${each})`,
		params: [JSON.stringify(part)]
	})));
}
/** Positive predicate of `op` over `col` for literal values (regex already expanded). */
function literalPred(dialect, col, op, values, int) {
	const base = op.replace(/^not_/, "").replace(/^is_not$/, "is");
	if (base === "is" || base === "regex") {
		if (int) return inList(dialect, col, values.map(Number).filter((n) => Number.isInteger(n)), true);
		return inList(dialect, col, values);
	}
	const target = int ? `CAST(${col} AS TEXT)` : `lower(${col})`;
	return or(values.map((v) => ({
		sql: `${target} LIKE lower(?) ${LIKE_ESCAPE}`,
		params: [base === "contains" ? `%${likeEscape(v)}%` : `${likeEscape(v)}%`]
	})));
}
/** The text expression of an event property, so numbers compare like the strings users type. */
function propText(dialect, alias, key) {
	const expr = jsonExtract(dialect, `${alias}.props`, key);
	return dialect === "postgres" ? expr : `CAST(${expr} AS TEXT)`;
}
/**
* Columns of a page view or event entry: alias `a` is a row of `docEach` over `s.hits` of the visit `s`.
* A page view entry has `t` and no `n`; an event entry has `n`; an entry with neither is an engagement
* update whose page view has not arrived and is no hit. Times are seconds since the visit started.
*/
function entryCols(dialect, a = "h") {
	const t = field(dialect, a, "t", "int");
	const name = field(dialect, a, "n");
	return {
		id: `${a}.key`,
		ts: `(s.started + ${t})`,
		path: field(dialect, a, "p"),
		query: field(dialect, a, "qs"),
		name,
		dur: field(dialect, a, "d", "int"),
		nav: field(dialect, a, "nt", "int"),
		exit: field(dialect, a, "x", "int"),
		scroll: field(dialect, a, "s", "int"),
		pv: `(${t} IS NOT NULL AND ${name} IS NULL)`,
		ev: `${name} IS NOT NULL`
	};
}
/** Entry rows of the visit `s`: `json_each(s.hits) AS a` (Postgres `jsonb_each`). */
const entriesOf = (dialect, a = "h") => docEach(dialect, "s.hits", a);
/** The text of event property `key` of entry `a` (`pr`), so numbers compare like the strings users type. */
function entryProp(dialect, a, key) {
	if (!PROP_KEY_RE.test(key)) throw new Error(`invalid property key: ${key}`);
	return dialect === "postgres" ? `(${ident(a)}.value -> 'pr' ->> '${key}')` : `CAST(json_extract(${ident(a)}.value, '$.pr.${key}') AS TEXT)`;
}
function hitView(dialect, a, from) {
	if (from === "event") return {
		pv: FALSE.sql,
		ev: TRUE.sql,
		path: `${a}.path`,
		name: `${a}.name`,
		prop: (k) => propText(dialect, a, k)
	};
	const c = entryCols(dialect, a);
	return {
		pv: c.pv,
		ev: c.ev,
		path: c.path,
		name: c.name,
		prop: (k) => entryProp(dialect, a, k)
	};
}
/** The visits of the range, as a predicate on `s` (the visit day encoding of `ca_sessions.day`). */
const visitRange = (ctx, alias = "s") => ({
	sql: `${alias}.site = ? AND ${alias}.day BETWEEN ? AND ?`,
	params: [
		ctx.site,
		visitDayKey(ctx.from),
		visitDayKey(ctx.to)
	]
});
/** `SELECT <expr> AS v` over the entries of the visits of the range matching `kind` (regex expansion source). */
function entrySource$1(ctx, a, expr, kind) {
	const r = visitRange(ctx);
	return {
		sql: `SELECT ${expr} AS v FROM ca_sessions s CROSS JOIN ${entriesOf(ctx.db.dialect, a)} WHERE ${r.sql} AND ${kind}`,
		params: r.params
	};
}
async function expandRegex(ctx, src, patterns) {
	const bad = patterns.map((p) => ({
		p,
		v: validateSafeRegex(p, "i")
	})).find((r) => !r.v.ok);
	if (bad && !bad.v.ok) throw new QueryError("invalid_regex", `${bad.v.error} (${bad.p})`);
	const rows = await ctx.db.all(`SELECT DISTINCT t.v AS v FROM (${src.sql}) t WHERE t.v IS NOT NULL LIMIT ${REGEX_DISTINCT_LIMIT + 1}`, src.params);
	if (rows.length > REGEX_DISTINCT_LIMIT) throw new QueryError("narrow_filter", `More than ${REGEX_DISTINCT_LIMIT} distinct values in this range. Narrow the range or use contains or prefix.`);
	const res2 = patterns.map((p) => compileSafeRegex(p, "i"));
	const matches = rows.map((r) => String(r.v)).filter((v) => res2.some((re) => re.test(v)));
	if (matches.length > REGEX_MATCH_LIMIT) throw new QueryError("narrow_filter", `The pattern matches more than ${REGEX_MATCH_LIMIT} values. Make it more specific.`);
	return matches;
}
/** Literal values of a filter: regex ops are expanded over `src` once, then compared with `is`. */
async function literal(ctx, f, src) {
	if (f.op === "regex" || f.op === "not_regex") return {
		op: "is",
		values: await expandRegex(ctx, src(), f.values)
	};
	return {
		op: f.op,
		values: f.values
	};
}
/** Positive predicate for a filter over `col`. */
async function positive(ctx, col, f, int, src) {
	const l = await literal(ctx, f, src);
	return literalPred(ctx.db.dialect, col, l.op, l.values, int);
}
/** `SELECT <col> AS v` over the rows of a table with ISO days in the range (session and search dims). */
const tableSource = (ctx, table, alias, col, visit) => {
	const r = visit ? visitRange(ctx, alias) : {
		sql: `${alias}.site = ? AND ${alias}.day BETWEEN ? AND ?`,
		params: [
			ctx.site,
			ctx.from,
			ctx.to
		]
	};
	return {
		sql: `SELECT ${col} AS v FROM ${table} ${alias} WHERE ${r.sql}`,
		params: r.params
	};
};
/** Hit predicate (alias `a`, an entry or a `ca_events` row) for a goal or funnel step. */
async function goalPredicate(ctx, goal, a, from = "entry") {
	const d = ctx.db.dialect;
	const v = hitView(d, a, from);
	const match = goal.match;
	const asFilter = (dim) => ({
		dim,
		op: match === "contains" ? "contains" : match,
		values: [goal.value]
	});
	if (goal.type === "page") {
		if (from === "event") return FALSE;
		const src = () => entrySource$1(ctx, "x", entryCols(d, "x").path, entryCols(d, "x").pv);
		return and([{
			sql: v.pv,
			params: []
		}, await positive(ctx, v.path, asFilter("page"), false, src)]);
	}
	if (goal.type === "event") {
		const props = "props" in goal && goal.props ? Object.entries(goal.props) : [];
		return and([{
			sql: `${v.ev} AND ${v.name} = ?`,
			params: [goal.value]
		}, ...props.map(([k, val]) => ({
			sql: `${v.prop(k)} = ?`,
			params: [val]
		}))]);
	}
	const url = v.prop("url");
	const val = goal.value.toLowerCase();
	const pred = match === "is" ? {
		sql: `(lower(${url}) = ? OR lower(${url}) LIKE ? ${LIKE_ESCAPE})`,
		params: [val, `${likeEscape(val)}/%`]
	} : {
		sql: `lower(${url}) LIKE ? ${LIKE_ESCAPE}`,
		params: [match === "prefix" ? `${likeEscape(val)}%` : `%${likeEscape(val)}%`]
	};
	return and([{
		sql: `${v.ev} AND ${v.name} = '_outbound'`,
		params: []
	}, pred]);
}
function findGoal(ctx, name) {
	const g = ctx.goals.find((x) => x.name === name && x.active !== false);
	if (!g) throw new QueryError("unknown_goal", `Unknown goal: ${name}`);
	return g;
}
const NUMERIC = new Set(NUM_OPS);
/**
* Op and value rules the schema cannot express: numeric ops only on `revenue`, which takes
* exactly one decimal value and an optional currency in `prop`; `currency` takes `is` or `is_not` and codes.
*/
function validateFilters(filters) {
	for (const f of filters) {
		const bad = (msg) => {
			throw new QueryError("invalid_filter", msg);
		};
		if (f.dim === "revenue") {
			if (!NUMERIC.has(f.op)) bad("The revenue filter takes gt, gte, lt or lte.");
			if (f.values.length !== 1 || !REVENUE_VALUE_RE.test(f.values[0])) bad("The revenue filter takes one amount such as 50 or 49.90.");
			if (f.prop !== void 0 && !normalizeCurrency(f.prop)) bad(`Unknown currency: ${f.prop}`);
		} else if (NUMERIC.has(f.op)) bad(`The operator ${f.op} is valid for the revenue filter only.`);
		else if (f.dim === "currency") {
			if (f.op !== "is" && f.op !== "is_not") bad("The currency filter takes is or is_not.");
			for (const v of f.values) if (!normalizeCurrency(v)) bad(`Unknown currency: ${v}`);
		}
	}
}
/**
* Session predicate of a `currency` or `revenue` filter: a semi-join on the visit key `(sday, sid)` over the
* orders of the range in `ca_events` (by the order's own day, through the `(site, day)` index). Refund rows
* (negative `val`) are not orders and never match.
*/
function revenueFilter(ctx, f) {
	const base = "SELECT x.sday, x.sid FROM ca_events x WHERE x.site = ? AND x.day BETWEEN ? AND ? AND x.val >= 0 AND x.sid IS NOT NULL AND x.sday IS NOT NULL";
	const params = [
		ctx.site,
		dayInt(ctx.from),
		dayInt(ctx.to)
	];
	const key = "(s.day, s.sid)";
	if (f.dim === "currency") {
		const codes = f.values.map((v) => normalizeCurrency(v));
		const list = inList(ctx.db.dialect, "x.cur", codes);
		return {
			sql: `${key} ${f.op === "is_not" ? "NOT IN" : "IN"} (${base} AND ${list.sql})`,
			params: [...params, ...list.params]
		};
	}
	const cur = normalizeCurrency(f.prop ?? ctx.currency ?? "USD") ?? "USD";
	const v = Number(f.values[0]);
	const having = (cmp) => ({
		sql: `${base} AND x.cur = ? GROUP BY x.sday, x.sid HAVING SUM(x.val) ${cmp} ?`,
		params: [
			...params,
			cur,
			v
		]
	});
	if (f.op === "gt" || f.op === "gte") {
		const h = having(f.op === "gt" ? ">" : ">=");
		return {
			sql: `${key} IN (${h.sql})`,
			params: h.params
		};
	}
	if (v <= 0) {
		if (f.op === "lt") return FALSE;
		const h = having("<=");
		return {
			sql: `${key} IN (${h.sql})`,
			params: h.params
		};
	}
	const h = having(f.op === "lt" ? ">=" : ">");
	return {
		sql: `${key} NOT IN (${h.sql})`,
		params: h.params
	};
}
function negate(col, f) {
	return {
		sql: col ? `${col} IS NULL OR NOT (${f.sql})` : `NOT (${f.sql})`,
		params: f.params
	};
}
/** Compile traffic filters (search dims are compiled by `compileSearch`). */
async function compileTraffic(ctx, filters) {
	const session = [];
	const pv = [];
	const ev = [];
	const srv = [];
	const ignoredTraffic = [];
	const d = ctx.db.dialect;
	validateFilters(filters);
	for (const f of filters) {
		if (f.dim === "currency" || f.dim === "revenue") {
			session.push(revenueFilter(ctx, f));
			continue;
		}
		const def = TRAFFIC_DIMS[f.dim];
		if (!def) {
			ignoredTraffic.push(f.dim);
			continue;
		}
		const neg = NEGATED.has(f.op);
		if (def.scope === "session") {
			const col = `s.${ident(def.column)}`;
			const src = () => tableSource(ctx, "ca_sessions", "s", col, true);
			const p = await positive(ctx, col, f, false, src);
			session.push(neg ? negate(col, p) : p);
			continue;
		}
		let inner;
		let own = null;
		if (f.dim === "goal") {
			const preds = [];
			for (const name of f.values) preds.push(await goalPredicate(ctx, findGoal(ctx, name), "x"));
			inner = or(preds);
		} else {
			const kind = def.kind;
			const col = (a) => f.dim === "event_prop" ? entryProp(d, a, f.prop) : f.dim === "page" ? entryCols(d, a).path : entryCols(d, a).name;
			const x = entryCols(d, "x");
			const src = () => {
				const e = entrySource$1(ctx, "x", col("x"), x[kind]);
				if (f.dim !== "page") return e;
				const r = {
					sql: "SELECT path AS v FROM ca_srv WHERE site = ? AND day BETWEEN ? AND ?",
					params: [
						ctx.site,
						dayInt(ctx.from),
						dayInt(ctx.to)
					]
				};
				return {
					sql: `${e.sql} UNION ${r.sql}`,
					params: [...e.params, ...r.params]
				};
			};
			const l = await literal(ctx, f, src);
			const pred = (c) => literalPred(d, c, l.op, l.values, false);
			inner = and([{
				sql: x[kind],
				params: []
			}, pred(col("x"))]);
			own = {
				kind,
				frag: neg ? negate(col("h"), pred(col("h"))) : pred(col("h"))
			};
			if (f.dim === "page") srv.push(neg ? negate("h.path", pred("h.path")) : pred("h.path"));
		}
		session.push({
			sql: `${neg ? "NOT " : ""}EXISTS (SELECT 1 FROM ${entriesOf(d, "x")} WHERE ${inner.sql})`,
			params: inner.params
		});
		if (own) (own.kind === "pv" ? pv : ev).push(own.frag);
	}
	const out = {
		session: and(session),
		pv: and(pv),
		ev: and(ev),
		srv: and(srv),
		ignoredTraffic
	};
	if (out.session.params.length + Math.max(out.pv.params.length, out.ev.params.length) > FILTER_PARAM_BUDGET) throw new QueryError("too_many_values", "Too many filter values in one query. Combine values with prefix or regex.");
	return out;
}
async function compileSearch(ctx, filters) {
	const preds = [];
	const needs = /* @__PURE__ */ new Set();
	const ignored = [];
	for (const f of filters) {
		const def = SEARCH_DIMS[f.dim];
		if (!def) {
			ignored.push(f.dim);
			continue;
		}
		if (f.dim !== "source") needs.add(f.dim);
		const col = `d.${ident(def.column)}`;
		const src = () => tableSource(ctx, "ca_search_daily", "d", col, false);
		const p = await positive(ctx, col, f, false, src);
		preds.push(NEGATED.has(f.op) ? negate(null, p) : p);
	}
	const pred = and(preds);
	if (pred.params.length > FILTER_PARAM_BUDGET) throw new QueryError("too_many_values", "Too many filter values in one query.");
	return {
		pred,
		needs,
		ignored
	};
}

//#endregion
//#region src/query/reports/base.ts
const num = (v) => {
	const n = typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : typeof v === "string" ? Number(v) : 0;
	return Number.isFinite(n) ? n : 0;
};
const ratio = (a, b) => b > 0 ? a / b : null;
const round = (v, digits = 4) => v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits;
/** Session duration: wall clock between first and last pageview, or the visible time when longer. */
const DURATION_MS = "CASE WHEN (s.last_seen - s.started) * 1000 > s.visible_ms THEN (s.last_seen - s.started) * 1000 ELSE s.visible_ms END";
/**
* Day semantics. A fact belongs to the day of the row that stores it: page views and events are entries of
* the visit document and count on the day the visit started (`ca_sessions.day`), also when the visit runs
* past midnight; orders and server-reported events (`ca_events`) and error pages (`ca_srv`) count on their
* own day. Every range is therefore a key range of one table: `(site, day, ...)`. An hour chart of orders
* uses the order's own time. Totals over a range only differ at its ends (docs/limits.md).
*/
const visitDays = (site, from, to) => ({
	sql: "s.site = ? AND s.day BETWEEN ? AND ?",
	params: [
		site,
		visitDayKey(from),
		visitDayKey(to)
	]
});
/**
* Visits active in the realtime window: a visit lasts at most a day, so it started today or yesterday (two
* key ranges, never a scan of older days).
*/
function liveVisits(rc) {
	const today = dayInZone(rc.now, rc.settings.siteTimezone);
	return {
		sql: "s.site = ? AND s.day IN (?, ?) AND s.last_seen > ? AND s.pageviews > 0",
		params: [
			rc.site,
			visitDayKey(today),
			visitDayKey(addDays(today, -1)),
			rc.now - rc.settings.realtimeWindowMinutes * 60
		]
	};
}
/**
* Engaged sessions over `ca_sessions s`: active time at or above the threshold (its one parameter, in ms), two
* or more pageviews, or any event. A bounce is a session that is not engaged (the GA4 meaning), so bounces are
* always sessions minus engaged.
*/
const ENGAGED_SQL = "SUM(CASE WHEN s.engaged_ms >= ? OR s.pageviews > 1 OR s.events > 0 THEN 1 ELSE 0 END) AS engaged";
/** Base predicate: sessions of the site in range with at least one pageview, plus filters. */
function sessionWhere(site, from, to, filters) {
	return and([
		visitDays(site, from, to),
		{
			sql: "s.pageviews > 0",
			params: []
		},
		filters
	]);
}
/**
* Session metrics per key and day, summed per key in the outer query. Visitors are distinct `vkey`
* per day, summed. `keyExpr` null gives one totals row.
*/
function sessionAggSql(rc, input, keyExpr, extra = TRUE) {
	const where = and([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), extra]);
	const k = keyExpr ? `${keyExpr} AS key, ` : "";
	const g = keyExpr ? `${keyExpr}, ` : "";
	const inner = `SELECT ${k}s.day AS day, COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews, COUNT(DISTINCT s.vkey) AS visitors, SUM(s.events) AS events,
${ENGAGED_SQL},
SUM(${DURATION_MS}) AS duration_ms
FROM ca_sessions s WHERE ${where.sql} GROUP BY ${g}s.day`;
	const sums = "SUM(t.sessions) AS sessions, SUM(t.events) AS events, SUM(t.pageviews) AS pageviews, SUM(t.visitors) AS visitors, SUM(t.sessions) - SUM(t.engaged) AS bounces, SUM(t.engaged) AS engaged, SUM(t.duration_ms) AS duration_ms";
	return {
		sql: keyExpr ? `SELECT t.key AS key, ${sums} FROM (${inner}) t GROUP BY t.key` : `SELECT ${sums} FROM (${inner}) t`,
		params: [rc.settings.engagedThresholdSeconds * 1e3, ...where.params]
	};
}
/** Derived session metrics from raw sums. */
function sessionMetrics(r) {
	const sessions = num(r.sessions);
	const pageviews = num(r.pageviews);
	return {
		visitors: num(r.visitors),
		sessions,
		pageviews,
		views_per_session: round(ratio(pageviews, sessions)),
		bounce_rate: round(ratio(num(r.bounces), sessions)),
		engaged_rate: round(ratio(num(r.engaged), sessions)),
		avg_duration: round(ratio(num(r.duration_ms) / 1e3, sessions), 1)
	};
}
/** Breakdown of filtered sessions by a session column expression. */
async function sessionBreakdown(rc, input, keyExpr, extra = TRUE) {
	const q = sessionAggSql(rc, input, keyExpr, extra);
	const rows = await rc.db.all(`${q.sql} ORDER BY sessions DESC, key LIMIT ? OFFSET ?`, [
		...q.params,
		input.limit + 1,
		input.offset
	]);
	return {
		rows: rows.slice(0, input.limit).map((r) => ({
			key: String(r.key),
			...sessionMetrics(r)
		})),
		truncated: rows.length > input.limit
	};
}
/** Filtered session totals (also the denominator of goal and event rates). */
async function sessionTotals(rc, input) {
	const q = sessionAggSql(rc, input, null);
	const [r] = await rc.db.all(q.sql, q.params);
	return sessionMetrics(r ?? {});
}
/**
* Page view or event entries of the filtered sessions in range: `FROM ca_sessions s, json_each(s.hits) h`, one
* key range of `ca_sessions`. Entry fields are expressions, see `entryCols` (`h.path` becomes `entryCols(d).path`).
*/
function hitJoin(rc, input, kind, extra = TRUE) {
	const own = kind === "pv" ? input.traffic?.pv : input.traffic?.ev;
	const where = and([
		sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE),
		{
			sql: entryCols(rc.db.dialect)[kind],
			params: []
		},
		own ?? TRUE,
		extra
	]);
	return {
		sql: `FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql}`,
		params: where.params
	};
}
/**
* Orders of the range with their visit: `ca_events h` (one row per order, whatever its origin) by
* the order's own day, LEFT JOIN the visit by its key `(site, sday, sid)`, so an order without a visit (or
* with a visit of no pageview) stays in the totals as `(not set)`; under a session filter only orders of a
* counted visit remain. The column names of `h` are those the reports used before (`path`, `name`, `props`,
* `val`, `cur`, `sid`, `ts`); `h.day` is yyyymmdd.
*/
function revenueWhere(site, from, to, session, extra = TRUE) {
	const where = and([
		{
			sql: "h.site = ? AND h.day BETWEEN ? AND ? AND h.val IS NOT NULL",
			params: [
				site,
				dayInt(from),
				dayInt(to)
			]
		},
		session.sql === TRUE.sql ? TRUE : and([{
			sql: "s.pageviews > 0",
			params: []
		}, session]),
		extra
	]);
	return {
		sql: `FROM ca_events h LEFT JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid WHERE ${where.sql}`,
		params: where.params
	};
}
/**
* Order sums over `ca_events h`: a refund is a row with a negative `val` (agent events, docs/revenue.md), so
* orders, gross revenue and paying sessions count rows with `val >= 0` only and `refunds` is the refunded amount.
*/
/** Goals per goal statement (`UNION ALL`), in the closed-day writer and the detailed Goals report. */
const GOALS_PER_STATEMENT = 10;
/** Goal statements in groups of at most `GOALS_PER_STATEMENT`, each within the bound parameter limit. */
function goalGroups(parts) {
	const groups = [];
	for (const p of parts) {
		const g = groups[groups.length - 1];
		if (g && g.length < GOALS_PER_STATEMENT && g.reduce((n, x) => n + x.params.length, 0) + p.params.length <= MAX_PARAMS) g.push(p);
		else groups.push([p]);
	}
	return groups;
}
const ORDER_SUMS = "SUM(CASE WHEN h.val >= 0 THEN 1 ELSE 0 END) AS orders, SUM(CASE WHEN h.val >= 0 THEN h.val ELSE 0 END) AS revenue, SUM(CASE WHEN h.val < 0 THEN -h.val ELSE 0 END) AS refunds, COUNT(DISTINCT CASE WHEN h.val >= 0 THEN h.sid END) AS sessions";
/** The `ca_revenue_daily` dim of the refund rows of `dim`: `revenue` holds the refunded amount, `orders` and `sessions` 0. */
const refundDim = (dim) => `refund.${dim}`;
/** `col IN (...)` over the keys of the current page of rows: one JSON parameter, so 10 000 export keys still fit. */
const keysIn = (rc, col, keys) => inList(rc.db.dialect, col, keys, false, Number.MAX_SAFE_INTEGER);
/** Annotations whose local day lies in the range. */
function annotationsIn(rc, from, to) {
	return rc.annotations.filter((a) => {
		const d = dayInZone(a.ts, rc.settings.siteTimezone);
		return d >= from && d <= to;
	}).sort((a, b) => a.ts - b.ts);
}

//#endregion
//#region src/query/reports/summary.ts
/**
* Summary reads: the stored rows of `ca_rollup` and `ca_revenue_daily` over the
* closed days of a range, merged in memory with the rows `computeDay` returns for the days that are not stored
* yet (today, and yesterday until it closes). Stored and open rows come from the same function, so a range that
* ends today answers like the detailed reports. Also the filter plan of the summary engine: which filters a
* summary answer honours (single dimension rows, a pair row of the report's dimension and one segment, or the
* cube for segments combined) and which it cannot, with the reason.
*
* `../rollup.js` is loaded on demand: it imports the revenue report module, which imports this one.
*/
/** The segment dimensions: pair rows cross one of them with a page-like dimension. */
const SEGMENTS$1 = [
	"channel",
	"country",
	"device"
];
/** `seg` of the cube reads: `ca_cube` rows, and `ca_revenue_daily` rows of dim `all` per cube cell. */
const CUBE_SEG = "cube";
/** Joins the channel, country and device of a cube cell into one `segkey` (and the two keys of a session pair). */
const CELL_SEP = "";
/** Dimensions with pair rows (`seg` one of `SEGMENTS`). */
const PAIR_DIMS$1 = new Set([
	"page",
	"entry",
	"source",
	"utm_campaign",
	"event",
	"goal"
]);
/** Filter dimension to summary dimension (the same names). */
const FILTER_DIMS = {
	page: "page",
	entry: "entry",
	exit: "exit",
	channel: "channel",
	source: "source",
	utm_campaign: "utm_campaign",
	country: "country",
	device: "device",
	browser: "browser",
	os: "os",
	lang: "lang",
	event: "event",
	goal: "goal"
};
/** Filter dimensions `ca_revenue_daily` keeps: a revenue read under any other (browser, os, exit, lang) has no rows. */
const REVENUE_FILTER_DIMS = new Set([
	"channel",
	"source",
	"utm_campaign",
	"entry",
	"page",
	"country",
	"device",
	"event",
	"goal"
]);
/**
* A negated filter on these drops summary rows, while the detailed rows drop whole visits (a visit with the page,
* event or goal), or keep visits the summaries do not hold (campaign rows exist only for visits with a campaign).
*/
const NO_NEGATION = new Set([
	"page",
	"event",
	"goal",
	"utm_campaign"
]);
/**
* Report dimensions whose own filter the summaries cannot answer: events, goals and exit pages count their rates
* over the matching visits, and a revenue breakdown by page, event or goal lists every order of the matching visits.
*/
const OWN_TRAFFIC = new Set([
	"event",
	"goal",
	"exit"
]);
const OWN_REVENUE = new Set([
	"page",
	"event",
	"goal"
]);
const ROLLUP_METRICS = [
	"pageviews",
	"sessions",
	"visitors",
	"bounces",
	"engaged",
	"engaged_ms",
	"events",
	"hits"
];
/** `refunds` is the `revenue` of the `refund.<dim>` rows, read with the order rows of the dim. */
const REVENUE_METRICS = [
	"orders",
	"revenue",
	"sessions",
	"refunds"
];
const isSegment = (d) => SEGMENTS$1.includes(d ?? "");
const isSessionDim = (d) => TRAFFIC_DIMS[d]?.scope === "session";
/**
* Which filters a summary answer honours. `own` is the report's dimension (null for totals and series, which take
* the first filtered session dimension that is not a segment, else the first filtered segment). One segment
* combines with a pair dimension through its pair rows. Segments combine with each other through the cube, for
* totals and series and for a breakdown by a segment; a second segment beside a pair dimension does not.
* `revenue`: a read of `ca_revenue_daily`, which keeps fewer dimensions and every order without a visit (as
* `(not set)`), so no negated filter applies there.
*/
function planFilters(filters, own, revenue = false) {
	const unavailable = /* @__PURE__ */ new Map();
	const off = (f, reason) => unavailable.has(f.dim) || unavailable.set(f.dim, reason);
	const ownOff = revenue ? OWN_REVENUE : OWN_TRAFFIC;
	const kept = filters.filter((f) => {
		const d = FILTER_DIMS[f.dim];
		if (!d || revenue && !REVENUE_FILTER_DIMS.has(d)) return off(f, "not_kept"), false;
		if (NEGATED.has(f.op) && (revenue || NO_NEGATION.has(d) && !(d === "utm_campaign" && own === d))) return off(f, "negated"), false;
		if (d === own && ownOff.has(d)) return off(f, "own"), false;
		return true;
	});
	const dimOf = (f) => FILTER_DIMS[f.dim];
	const base = own ?? kept.map(dimOf).find((d) => !isSegment(d) && isSessionDim(d)) ?? null;
	const segs = [...new Set(kept.map(dimOf).filter((d) => isSegment(d) && d !== base))];
	let src = {
		dim: base ?? "all",
		seg: ""
	};
	let usable = new Set(base ? [base] : []);
	const first = segs[0];
	if (first) {
		if (base === null && segs.length > 1 || isSegment(base)) [src, usable] = [{
			dim: base ?? "all",
			seg: "",
			cube: true
		}, new Set(SEGMENTS$1)];
		else if (base === null) [src, usable] = [{
			dim: first,
			seg: ""
		}, new Set([first])];
		else if (PAIR_DIMS$1.has(base)) [src, usable] = [{
			dim: base,
			seg: first
		}, new Set([base, first])];
	}
	const applied = kept.filter((f) => usable.has(dimOf(f)) ? true : (off(f, "combination"), false));
	return {
		src,
		applied,
		unavailable: [...unavailable].map(([d, r]) => `${d}:${r}`)
	};
}
/** Does `key` pass the filter (same operator semantics as the SQL compiler)? */
function matchKey(f, key) {
	const base = f.op.replace(/^not_/, "").replace(/^is_not$/, "is");
	const k = key.toLowerCase();
	let hit;
	if (base === "regex") hit = f.values.some((p) => {
		const v = validateSafeRegex(p, "i");
		if (!v.ok) throw new QueryError("invalid_regex", `${v.error} (${p})`);
		return compileSafeRegex(p, "i").test(key);
	});
	else if (base === "contains") hit = f.values.some((v) => k.includes(v.toLowerCase()));
	else if (base === "prefix") hit = f.values.some((v) => k.startsWith(v.toLowerCase()));
	else hit = f.values.includes(key);
	return NEGATED.has(f.op) ? !hit : hit;
}
/** Open days one read computes in memory, newest first (today, yesterday, and the day the writer is closing). */
const MAX_OPEN_DAYS = 4;
const OPEN_TTL_MS = 6e4;
const OPEN_MAX = 100;
const openCache = /* @__PURE__ */ new Map();
function clearOpenDays() {
	openCache.clear();
}
/** Last day whose summary rows are stored: the writer's watermark, else the last closed day. */
async function storedThrough(rc) {
	return rc.summaryThrough ?? (await Promise.resolve().then(() => rollup_exports)).lastClosedDay(rc.now, rc.settings.siteTimezone);
}
/** The stored part of a range and its open days (after `storedThrough`, up to today). */
async function splitRange(rc, from, to) {
	const through = await storedThrough(rc);
	const today = dayInZone(rc.now, rc.settings.siteTimezone);
	const end = to < through ? to : through;
	const first = from > through ? from : addDays(through, 1);
	const last = to < today ? to : today;
	const all = first <= last ? eachDay(first, last) : [];
	return {
		stored: from <= end ? {
			from,
			to: end
		} : null,
		open: all.slice(-MAX_OPEN_DAYS),
		missing: all.slice(0, Math.max(0, all.length - MAX_OPEN_DAYS))
	};
}
/** `summary_behind:<from>:<to>` when a summary answer leaves out days the writer has not stored yet (more than `MAX_OPEN_DAYS` behind). */
async function behindNotice(rc, from, to) {
	const { missing } = await splitRange(rc, from, to);
	return missing.length ? [`summary_behind:${missing[0]}:${missing[missing.length - 1]}`] : [];
}
/** `computeDay` of an open day, cached 60 seconds per isolate (one report computes it once for all its reads). */
function openDay(rc, site, goals, day, nowMs = Date.now()) {
	const s = rc.settings;
	const key = JSON.stringify([
		site,
		day,
		s.siteTimezone,
		s.engagedThresholdSeconds,
		s.realtimeWindowMinutes,
		goals
	]);
	const hit = openCache.get(key);
	if (hit && nowMs - hit.at < OPEN_TTL_MS) return hit.value;
	const value = Promise.resolve().then(() => rollup_exports).then((m) => m.computeDay({
		db: rc.db,
		site,
		settings: s,
		goals
	}, day));
	openCache.delete(key);
	if (openCache.size >= OPEN_MAX) openCache.delete(openCache.keys().next().value);
	openCache.set(key, {
		at: nowMs,
		value
	});
	value.catch(() => openCache.get(key)?.value === value && openCache.delete(key));
	return value;
}
/** The statement over the stored days: one key range `(site, dim, seg, day)` of the primary key, the same text on both dialects. */
function summarySql(r, keyIn = "") {
	const rev = r.table === "ca_revenue_daily";
	const group = [
		"r.key",
		"r.segkey",
		...r.byDay ? ["r.day"] : [],
		...rev ? ["r.cur"] : []
	];
	const refund = `r.dim LIKE '${refundDim("")}%'`;
	const sums = rev ? [
		`SUM(r.orders) AS orders`,
		`SUM(CASE WHEN ${refund} THEN 0 ELSE r.revenue END) AS revenue`,
		`SUM(r.sessions) AS sessions`,
		`SUM(CASE WHEN ${refund} THEN r.revenue ELSE 0 END) AS refunds`
	] : ROLLUP_METRICS.map((m) => `SUM(r.${m}) AS ${m}`);
	return `SELECT ${group.map((g) => `${g} AS ${g.slice(2)}`).join(", ")}, ${sums.join(", ")} FROM ${r.table} r WHERE r.site = ? AND ${rev ? "r.dim IN (?, ?)" : "r.dim = ?"} AND r.seg = ? AND r.day BETWEEN ? AND ?${r.cur ? " AND r.cur = ?" : ""}${keyIn ? ` AND (${keyIn})` : ""} GROUP BY ${group.join(", ")}`;
}
/**
* The stored cube cells over a range: one key range `(site, day)` of `ca_cube`, per cell (and day). `duration_ms`
* comes back as `engaged_ms`, the column the session rows of `ca_rollup` keep it in.
*/
function cubeSql(dialect, byDay) {
	const day = int(dialect, 0).sql;
	const group = [
		"c.channel",
		"c.country",
		"c.device",
		...byDay ? ["c.day"] : []
	];
	return `SELECT ${group.map((g) => `${g} AS ${g.slice(2)}`).join(", ")}, SUM(c.sessions) AS sessions, SUM(c.pageviews) AS pageviews, SUM(c.visitors) AS visitors, SUM(c.bounces) AS bounces, SUM(c.engaged) AS engaged, SUM(c.duration_ms) AS engaged_ms, SUM(c.events) AS events FROM ca_cube c WHERE c.site = ? AND c.day BETWEEN ${day} AND ${day} GROUP BY ${group.join(", ")}`;
}
/** A cube row as a summary row: no key, the cell in `segkey`. */
const cubeRow = (r) => ({
	...r,
	key: "",
	segkey: SEGMENTS$1.map((g) => String(r[g])).join(CELL_SEP),
	engaged_ms: r.engaged_ms ?? r.duration_ms
});
/** Add `rows` into one row per key, segment value, day and currency. */
function sumInto(out, rows, metrics, byDay) {
	for (const r of rows) {
		const k = {
			key: String(r.key),
			segkey: String(r.segkey ?? ""),
			day: byDay ? isoDay(r.day) : "",
			cur: r.cur == null ? "" : String(r.cur)
		};
		const id = `${k.key}\u0000${k.segkey}\u0000${k.day}\u0000${k.cur}`;
		let o = out.get(id);
		if (!o) out.set(id, o = {
			...k,
			...Object.fromEntries(metrics.map((m) => [m, 0]))
		});
		for (const m of metrics) o[m] = num(o[m]) + num(r[m]);
	}
}
/**
* Summary rows of one dimension (and segment) over a range: the stored days in one statement, the open days from
* `computeDay`. Seg `cube` reads the cube cells (`ca_cube`, or the revenue rows of dim `all` per cell).
*/
async function readSummary(rc, from, to, r) {
	const rev = r.table === "ca_revenue_daily";
	const cube = r.seg === CUBE_SEG && !rev;
	const metrics = rev ? REVENUE_METRICS : ROLLUP_METRICS;
	const { stored, open } = await splitRange(rc, from, to);
	const out = /* @__PURE__ */ new Map();
	if (stored && cube) sumInto(out, (await rc.db.all(cubeSql(rc.db.dialect, !!r.byDay), [
		rc.site,
		dayInt(stored.from),
		dayInt(stored.to)
	])).map(cubeRow), metrics, !!r.byDay);
	else if (stored) {
		const k = r.keys ? inList(rc.db.dialect, "r.key", r.keys, false, Number.MAX_SAFE_INTEGER) : null;
		sumInto(out, await rc.db.all(summarySql(r, k?.sql), [
			rc.site,
			r.dim,
			...rev ? [refundDim(r.dim)] : [],
			r.seg,
			stored.from,
			stored.to,
			...r.cur ? [r.cur] : [],
			...k?.params ?? []
		]), metrics, !!r.byDay);
	}
	const keys = r.keys ? new Set(r.keys) : null;
	for (const day of open) {
		const d = await openDay(rc, rc.site, rc.goals, day);
		if (cube) {
			sumInto(out, (d.cube ?? []).map((x) => ({
				...cubeRow(x),
				day
			})), metrics, !!r.byDay);
			continue;
		}
		const pairs = r.seg === CUBE_SEG ? d.revenueCube : rev ? d.revenuePairs : d.pairs;
		const rows = r.seg ? pairs ?? [] : rev ? d.revenue : d.rows;
		const refund = rev ? refundDim(r.dim) : null;
		sumInto(out, rows.filter((x) => (x.dim === r.dim || x.dim === refund) && (x.seg ?? "") === r.seg && (!r.cur || x.cur === r.cur) && (!keys || keys.has(x.key))).map((x) => x.dim === refund ? {
			...x,
			day,
			revenue: 0,
			refunds: x.revenue
		} : {
			...x,
			day,
			refunds: 0
		}), metrics, !!r.byDay);
	}
	return [...out.values()];
}
/**
* Rows of the plan's source over the input range that pass every applied filter, summed per key of `by` (the
* report's dimension; null sums everything into key '') and per day when `byDay`.
*/
const planRows = (rc, input, plan, by, byDay = false) => planRead(rc, input, plan, {
	table: "ca_rollup",
	byKey: !!by,
	byDay
});
/** Revenue rows (`ca_revenue_daily`) of a plan, filtered like `planRows`, per key (`byKey`), day and currency. */
const planRevenue = (rc, input, plan, o = {}) => planRead(rc, input, plan, {
	table: "ca_revenue_daily",
	byKey: !!o.byKey,
	byDay: !!o.byDay,
	...o.cur ? { cur: o.cur } : {}
});
async function planRead(rc, input, plan, o) {
	const { dim, seg, cube } = plan.src;
	const read = cube ? {
		dim: "all",
		seg: CUBE_SEG
	} : {
		dim,
		seg
	};
	const keyOf = (r, d) => cube ? r.segkey.split(CELL_SEP)[SEGMENTS$1.indexOf(d)] ?? "" : FILTER_DIMS[d] === dim ? r.key : r.segkey;
	const read_ = await readSummary(rc, input.from, input.to, {
		table: o.table,
		...read,
		byDay: o.byDay,
		...o.cur ? { cur: o.cur } : {}
	});
	for (const f of plan.applied) if (read_.some((r) => keyOf(r, f.dim) === "(other)")) rc.folded?.add(f.dim);
	const rows = read_.filter((r) => plan.applied.every((f) => matchKey(f, keyOf(r, f.dim))));
	const out = /* @__PURE__ */ new Map();
	sumInto(out, rows.map((r) => ({
		...r,
		key: o.byKey ? cube ? keyOf(r, dim) : r.key : "",
		segkey: ""
	})), o.table === "ca_rollup" ? ROLLUP_METRICS : REVENUE_METRICS, o.byDay);
	return [...out.values()];
}
const scanCache = /* @__PURE__ */ new Map();
function clearScanCache() {
	scanCache.clear();
}
/** Visits per stored day of a range (the `all` rows; open days are not counted), cached 60 seconds per isolate. One key range. */
function storedSessions(rc, from, to, nowMs = Date.now()) {
	const key = JSON.stringify([
		rc.site,
		from,
		to
	]);
	const hit = scanCache.get(key);
	if (hit && nowMs - hit.at < OPEN_TTL_MS) return hit.value;
	const value = rc.db.all("SELECT r.day AS day, r.sessions AS sessions FROM ca_rollup r WHERE r.site = ? AND r.dim = 'all' AND r.seg = '' AND r.day BETWEEN ? AND ?", [
		rc.site,
		from,
		to
	]).then((rows) => rows.map((r) => ({
		day: isoDay(r.day),
		sessions: num(r.sessions)
	})));
	scanCache.delete(key);
	if (scanCache.size >= OPEN_MAX) scanCache.delete(scanCache.keys().next().value);
	scanCache.set(key, {
		at: nowMs,
		value
	});
	value.catch(() => scanCache.get(key)?.value === value && scanCache.delete(key));
	return value;
}

//#endregion
//#region src/query/reports/timeseries.ts
/** auto: hour up to 2 days, day up to 120 days, week beyond. */
function resolveGranularity(g, from, to) {
	if (g !== "auto") return g;
	const n = daysBetween(from, to);
	return n <= 2 ? "hour" : n <= 120 ? "day" : "week";
}
/** Monday of the ISO week containing `day`. */
function weekStart(day) {
	return addDays(day, -(((/* @__PURE__ */ new Date(`${day}T00:00:00Z`)).getUTCDay() + 6) % 7));
}
const hourKey = (day, h) => `${day} ${String(h).padStart(2, "0")}:00`;
/** Session metrics per bucket, zero-filled, with annotations of the range (current run). */
async function timeseries(rc, input) {
	const gran = resolveGranularity(input.granularity, input.from, input.to);
	const where = sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE);
	const byHour = gran === "hour";
	const rows = await rc.db.all(`SELECT s.day AS day, ${byHour ? "s.hour" : "0"} AS hour, COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews, COUNT(DISTINCT s.vkey) AS visitors,
${ENGAGED_SQL},
SUM(${DURATION_MS}) AS duration_ms
FROM ca_sessions s WHERE ${where.sql} GROUP BY s.day${byHour ? ", s.hour" : ""}`, [rc.settings.engagedThresholdSeconds * 1e3, ...where.params]);
	const series = bucketSeries(input.from, input.to, gran, rows.map((r) => ({
		...r,
		bounces: Number(r.sessions) - Number(r.engaged)
	})));
	return input.isCompare ? {
		series,
		granularity: gran
	} : {
		series,
		granularity: gran,
		annotations: annotationsIn(rc, input.from, input.to)
	};
}
/** Zero-filled buckets from per day (or day and hour) session sums. */
function bucketSeries(from, to, gran, rows) {
	const byHour = gran === "hour";
	const buckets = /* @__PURE__ */ new Map();
	const keys = [];
	for (const day of eachDay(from, to)) {
		const ks = byHour ? Array.from({ length: 24 }, (_, h) => hourKey(day, h)) : [gran === "week" ? weekStart(day) : day];
		for (const k of ks) if (!buckets.has(k)) {
			buckets.set(k, {
				sessions: 0,
				pageviews: 0,
				visitors: 0,
				bounces: 0,
				engaged: 0,
				duration_ms: 0
			});
			keys.push(k);
		}
	}
	for (const r of rows) {
		const day = isoDay(r.day);
		const k = byHour ? hourKey(day, Number(r.hour)) : gran === "week" ? weekStart(day) : day;
		const b = buckets.get(k);
		if (!b) continue;
		for (const f of Object.keys(b)) b[f] = (b[f] ?? 0) + Number(r[f] ?? 0);
	}
	return keys.map((t) => ({
		t,
		...sessionMetrics(buckets.get(t) ?? {})
	}));
}

//#endregion
//#region src/query/reports/revenue.ts
/**
* Revenue reports: `revenue`, `revenue_series`, `revenue_breakdown`, the `withRevenue`
* merge and `hasRevenue`. Every figure is within one currency: sums are grouped by `cur` or restricted to
* `cur = ?`, never added across codes. Raw statements read `ca_events h LEFT JOIN ca_sessions s` with the
* range on the order's own day (`revenueWhere`); ranges answered from the summaries read `ca_revenue_daily` (stored and open days). Visitor
* counts per page, event and goal come from the visit documents (`hitJoin`).
*/
const REVENUE_REPORTS = [
	"revenue",
	"revenue_series",
	"revenue_breakdown"
];
/** Most orders `revenue_orders` lists. */
const RECENT_ORDERS_CAP = 50;
/** Rollup dim of `ca_revenue_daily` and `ca_rollup` per breakdown dim. */
const ROLLUP_DIM = {
	channel: "channel",
	source: "source",
	campaign: "utm_campaign",
	entry: "entry",
	page: "page",
	country: "country",
	device: "device",
	goal: "goal",
	event: "event"
};
const NOT_SET$2 = "'(not set)'";
/** A hit whose session row is missing or has no pageview is `(not set)` in every session dim. */
const sess = (col) => `CASE WHEN s.pageviews > 0 THEN COALESCE(s.${col}, ${NOT_SET$2}) ELSE ${NOT_SET$2} END`;
/** Key expressions over `h` and `s` per non-goal dim (shared with the rollup). */
const REVENUE_KEYS = {
	channel: sess("channel"),
	source: sess("source"),
	campaign: sess("utm_campaign"),
	entry: sess("entry_path"),
	country: sess("country"),
	device: sess("device"),
	page: `COALESCE(h.path, ${NOT_SET$2})`,
	event: "h.name"
};
/** Session-side key expressions (pageviews > 0 there), equal to the keys above for the same session. */
const VISITOR_KEYS = {
	channel: `COALESCE(s.channel, ${NOT_SET$2})`,
	source: `COALESCE(s.source, ${NOT_SET$2})`,
	campaign: `COALESCE(s.utm_campaign, ${NOT_SET$2})`,
	entry: `COALESCE(s.entry_path, ${NOT_SET$2})`,
	country: `COALESCE(s.country, ${NOT_SET$2})`,
	device: `COALESCE(s.device, ${NOT_SET$2})`
};
const OTHER$1 = "(other)";
/** Parameters per goal statement; D1 allows 100. */
const GOAL_PARAM_BUDGET = 90;
/** The report currency: `params.currency` or the site default, validated (typed `invalid_currency`). */
function currencyOf(rc, input) {
	const asked = input.params.currency;
	if (asked !== void 0) {
		const c = normalizeCurrency(asked);
		if (!c) throw new QueryError("invalid_currency", `Unknown currency: ${String(asked).slice(0, 8)}`);
		return c;
	}
	return isCurrency(rc.defaultCurrency) ? rc.defaultCurrency : "USD";
}
function dimOf(input) {
	const d = input.params.dim;
	if (!REVENUE_BREAKDOWN_DIMS.includes(d ?? "")) throw new QueryError("invalid_params", `revenue_breakdown needs params.dim, one of ${REVENUE_BREAKDOWN_DIMS.join(", ")}.`);
	return d;
}
const money = (v, cur) => v === null ? null : roundMinor(v, cur);
/** Per-currency entries, the selected one first, the others by orders then code (money is never ranked across codes). */
function currencyList(rows, visitors, selected) {
	return rows.filter((r) => (num(r.orders) > 0 || num(r.refunds) > 0) && typeof r.cur === "string").map((r) => {
		const cur = String(r.cur);
		const revenue = roundMinor(num(r.revenue), cur);
		const refunds = roundMinor(num(r.refunds), cur);
		const orders = num(r.orders);
		return {
			currency: cur,
			revenue,
			refunds,
			net_revenue: roundMinor(revenue - refunds, cur),
			orders,
			aov: money(ratio(revenue, orders), cur),
			revenue_per_visitor: visitors === null ? null : round(ratio(revenue, visitors)),
			paying_sessions: num(r.sessions)
		};
	}).sort((a, b) => a.currency === selected ? -1 : b.currency === selected ? 1 : b.orders - a.orders || (a.currency < b.currency ? -1 : 1));
}
/**
* The summary plan of a revenue read: filters on one segment apply (to the totals, and through a pair row to a
* breakdown by a pair dimension). `dim` is the breakdown's dimension; its header uses the same plan.
*/
const revenuePlan = (input, dim) => planFilters(input.filters, dim ? ROLLUP_DIM[dim] : null, true);
/** The totals of a breakdown: its own plan only when a filter on its dimension applies (an order may match no goal, or several). */
function headerPlan(input, dim) {
	const own = revenuePlan(input, dim);
	return dim && own.applied.some((f) => f.dim === ROLLUP_DIM[dim]) ? own : revenuePlan(input);
}
async function currencyRows(rc, input, dim) {
	if (input.summary) return planRevenue(rc, input, headerPlan(input, dim));
	const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE);
	return rc.db.all(`SELECT h.cur AS cur, ${ORDER_SUMS} ${w.sql} GROUP BY h.cur`, w.params);
}
/** Visitors and sessions of the filtered set: the Overview figures (raw) or the `all` rollup rows. */
async function audience(rc, input, dim) {
	if (input.summary) {
		const [r] = await planRows(rc, input, headerPlan(input, dim), null);
		return {
			visitors: num(r?.visitors),
			sessions: num(r?.sessions)
		};
	}
	const q = sessionAggSql(rc, input, null);
	const [r] = await rc.db.all(q.sql, q.params);
	return {
		visitors: num(r?.visitors),
		sessions: num(r?.sessions)
	};
}
/**
* Any revenue for the site: one row of the raw window (through the partial index) or of
* `ca_revenue_daily`. Two `SELECT 1 ... LIMIT 1` in one statement.
*/
async function hasRevenue(rc) {
	const [r] = await rc.db.all(`SELECT (SELECT 1 FROM ca_events WHERE site = ? AND day >= ? AND val IS NOT NULL LIMIT 1) AS raw, (SELECT 1 FROM ca_revenue_daily WHERE site = ? LIMIT 1) AS rolled`, [
		rc.site,
		rc.rawFrom ? dayInt(rc.rawFrom) : 0,
		rc.site
	]);
	return num(r?.raw) > 0 || num(r?.rolled) > 0;
}
const metaOf = (list, cur) => ({
	currency: cur,
	currencies: list,
	other_currencies: list.filter((c) => c.currency !== cur).map((c) => c.currency)
});
/** `revenue`: totals in one currency, the per-currency list, `hasRevenue`; `rows` is the list for export. */
async function revenue(rc, input) {
	const cur = currencyOf(rc, input);
	const rows = await currencyRows(rc, input);
	const aud = await audience(rc, input);
	const list = currencyList(rows, aud.visitors, cur);
	const own = list.find((c) => c.currency === cur);
	const rev = own?.revenue ?? 0;
	const orders = own?.orders ?? 0;
	const totals = {
		revenue: rev,
		refunds: own?.refunds ?? 0,
		net_revenue: own?.net_revenue ?? 0,
		orders,
		aov: money(ratio(rev, orders), cur),
		revenue_per_visitor: round(ratio(rev, aud.visitors)),
		revenue_per_session: round(ratio(rev, aud.sessions)),
		paying_sessions: own?.paying_sessions ?? 0,
		visitors: aud.visitors,
		sessions: aud.sessions
	};
	const data = {
		...metaOf(list, cur),
		totals,
		rows: list.map((c) => ({
			key: c.currency,
			...c
		}))
	};
	if (!input.isCompare && !input.lean) data.hasRevenue = list.length > 0 || await hasRevenue(rc);
	return data;
}
/** `revenue_series`: revenue, refunds, net revenue, orders and average order value per bucket in one currency, zero filled. */
async function revenueSeries(rc, input) {
	const cur = currencyOf(rc, input);
	const asked = resolveGranularity(input.granularity, input.from, input.to);
	const rolled = input.summary;
	const gran = rolled && asked === "hour" ? "day" : asked;
	const byHour = gran === "hour";
	let rows;
	if (rolled) rows = (await planRevenue(rc, input, revenuePlan(input), {
		byDay: true,
		cur
	})).map((r) => ({
		...r,
		hour: 0
	}));
	else {
		const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE, {
			sql: "h.cur = ?",
			params: [cur]
		});
		const tz = rc.settings.siteTimezone;
		rows = (await rc.db.all(`SELECT h.day AS day, ${byHour ? "h.ts / 900" : "0"} AS q, ${ORDER_SUMS} ${w.sql} GROUP BY h.day${byHour ? ", h.ts / 900" : ""}`, w.params)).map((r) => byHour ? {
			...r,
			day: dayInZone(num(r.q) * 900, tz),
			hour: hourInZone(num(r.q) * 900, tz)
		} : {
			...r,
			day: isoDay(r.day),
			hour: 0
		});
	}
	const buckets = /* @__PURE__ */ new Map();
	for (const day of eachDay(input.from, input.to)) {
		const ks = byHour ? Array.from({ length: 24 }, (_, h) => hourKey(day, h)) : [gran === "week" ? weekStart(day) : day];
		for (const k of ks) if (!buckets.has(k)) buckets.set(k, {
			orders: 0,
			revenue: 0,
			refunds: 0
		});
	}
	for (const r of rows) {
		const day = String(r.day);
		const b = buckets.get(byHour ? hourKey(day, num(r.hour)) : gran === "week" ? weekStart(day) : day);
		if (!b) continue;
		b.orders += num(r.orders);
		b.revenue += num(r.revenue);
		b.refunds += num(r.refunds);
	}
	const series = [...buckets].map(([t, b]) => {
		const rev = roundMinor(b.revenue, cur);
		const refunds = roundMinor(b.refunds, cur);
		return {
			t,
			revenue: rev,
			refunds,
			net_revenue: roundMinor(rev - refunds, cur),
			orders: b.orders,
			aov: money(ratio(rev, b.orders), cur)
		};
	});
	const data = {
		...metaOf(currencyList(await currencyRows(rc, input), (await audience(rc, input)).visitors, cur), cur),
		series,
		granularity: gran
	};
	if (input.isCompare) return data;
	return {
		...data,
		annotations: annotationsIn(rc, input.from, input.to),
		...rolled && asked === "hour" ? { notices: ["granularity_day"] } : {}
	};
}
/** Active event goals: the only goals that carry revenue. */
const eventGoals = (goals) => goals.filter((g) => g.active !== false && g.type === "event");
/** Per goal parts of one `UNION ALL`, split so that no statement binds more than 90 parameters. */
async function goalUnion(rc, input, goals, from, part) {
	const cc = {
		db: rc.db,
		site: rc.site,
		from: input.from,
		to: input.to,
		goals: rc.goals
	};
	const parts = [];
	for (const g of goals) parts.push(part(g.name, await goalPredicate(cc, g, "h", from)));
	const out = [];
	let batch = [];
	const flush = async () => {
		if (!batch.length) return;
		out.push(...await rc.db.all(batch.map((p) => p.sql).join(" UNION ALL "), batch.flatMap((p) => p.params)));
		batch = [];
	};
	for (const p of parts) {
		if (batch.length && batch.reduce((n, b) => n + b.params.length, 0) + p.params.length > GOAL_PARAM_BUDGET) await flush();
		batch.push(p);
	}
	await flush();
	return out;
}
/** Revenue rows of the selected currency per key of `dim` (raw or rollup). */
async function revenueByKey(rc, input, dim, cur) {
	let rows;
	if (input.summary) rows = await planRevenue(rc, input, revenuePlan(input, dim), {
		byKey: true,
		cur
	});
	else if (dim === "goal") {
		const goals = eventGoals(rc.goals);
		rows = goals.length ? await goalUnion(rc, input, goals, "event", (key, pred) => {
			const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE, and([{
				sql: "h.cur = ?",
				params: [cur]
			}, pred]));
			return {
				sql: `SELECT CAST(? AS TEXT) AS key, ${ORDER_SUMS} ${w.sql}`,
				params: [key, ...w.params]
			};
		}) : [];
	} else {
		const k = REVENUE_KEYS[dim];
		const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE, {
			sql: "h.cur = ?",
			params: [cur]
		});
		rows = await rc.db.all(`SELECT ${k} AS key, ${ORDER_SUMS} ${w.sql} GROUP BY ${k}`, w.params);
	}
	return new Map(rows.filter((r) => num(r.orders) > 0 || num(r.refunds) > 0).map((r) => [String(r.key), {
		revenue: roundMinor(num(r.revenue), cur),
		refunds: roundMinor(num(r.refunds), cur),
		orders: num(r.orders),
		sessions: num(r.sessions)
	}]));
}
/** Visitors and sessions per key from the matching breakdown statement; null when the source has none. */
async function visitorsByKey(rc, input, dim) {
	const out = /* @__PURE__ */ new Map();
	if (input.summary) {
		if (dim === "goal" || dim === "event") return out;
		const rows = await planRows(rc, input, revenuePlan(input, dim), ROLLUP_DIM[dim]);
		for (const r of rows) if (String(r.key) !== OTHER$1) out.set(String(r.key), {
			visitors: num(r.visitors),
			sessions: num(r.sessions)
		});
		return out;
	}
	let rows;
	const h = entryCols(rc.db.dialect);
	const perDay = (key, j, group) => ({
		sql: `SELECT t.key AS key, SUM(t.visitors) AS visitors, SUM(t.sessions) AS sessions FROM (SELECT ${key} AS key, s.day AS day, COUNT(DISTINCT s.vkey) AS visitors, COUNT(DISTINCT s.sid) AS sessions ${j.sql} GROUP BY ${group}s.day) t GROUP BY t.key`,
		params: j.params
	});
	if (dim === "page") {
		const q = perDay(h.path, hitJoin(rc, input, "pv"), `${h.path}, `);
		rows = await rc.db.all(q.sql, q.params);
	} else if (dim === "event") {
		const q = perDay(h.name, hitJoin(rc, input, "ev"), `${h.name}, `);
		rows = await rc.db.all(q.sql, q.params);
	} else if (dim === "goal") {
		const goals = eventGoals(rc.goals);
		rows = goals.length ? await goalUnion(rc, input, goals, "entry", (key, pred) => {
			const q = perDay("CAST(? AS TEXT)", hitJoin(rc, input, "ev", pred), "");
			return {
				sql: q.sql,
				params: [key, ...q.params]
			};
		}) : [];
	} else {
		const q = sessionAggSql(rc, input, VISITOR_KEYS[dim]);
		rows = await rc.db.all(q.sql, q.params);
	}
	for (const r of rows) out.set(String(r.key), {
		visitors: num(r.visitors),
		sessions: num(r.sessions)
	});
	return out;
}
/** `revenue_breakdown`: rows of one dim in one currency ranked by revenue, then orders, then key. */
async function revenueBreakdown(rc, input) {
	const cur = currencyOf(rc, input);
	const dim = dimOf(input);
	const list = currencyList(await currencyRows(rc, input, dim), (await audience(rc, input, dim)).visitors, cur);
	const rev = await revenueByKey(rc, input, dim, cur);
	const vis = await visitorsByKey(rc, input, dim);
	const rows = [...new Set([...rev.keys(), ...vis.keys()])].map((key) => {
		const r = rev.get(key);
		const v = vis.get(key);
		const revenue = r?.revenue ?? 0;
		const refunds = r?.refunds ?? 0;
		const orders = r?.orders ?? 0;
		const visitors = v?.visitors ?? null;
		return {
			key,
			revenue,
			refunds,
			net_revenue: roundMinor(revenue - refunds, cur),
			orders,
			aov: money(ratio(revenue, orders), cur),
			revenue_per_visitor: visitors === null ? null : round(ratio(revenue, visitors)),
			visitors,
			sessions: v?.sessions ?? null,
			currency: cur
		};
	});
	rows.sort((a, b) => num(b.revenue) - num(a.revenue) || num(b.orders) - num(a.orders) || num(b.refunds) - num(a.refunds) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	return {
		...metaOf(list, cur),
		dim,
		rows: rows.slice(input.offset, input.offset + input.limit),
		truncated: rows.length > input.offset + input.limit
	};
}
/**
* `revenue_orders`: the newest orders and refunds of the range in one currency, from the detailed rows only (no
* summary form, so a range before the detailed window answers `raw_only`). Each row is the stored order reference
* (a hash of the order id, or the hit id), its day, the amount (negative for a refund) and its visit's first touch;
* never a session or visitor key. At most `RECENT_ORDERS_CAP` rows.
*/
async function revenueOrders(rc, input) {
	const cur = currencyOf(rc, input);
	const cap = Math.min(input.limit, RECENT_ORDERS_CAP);
	const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE, {
		sql: "h.cur = ?",
		params: [cur]
	});
	const rows = await rc.db.all(`SELECT h.id AS id, h.day AS day, h.val AS val, ${REVENUE_KEYS.channel} AS channel, ${REVENUE_KEYS.entry} AS entry, ${REVENUE_KEYS.country} AS country ${w.sql} ORDER BY h.ts DESC, h.id DESC LIMIT ?`, [...w.params, cap + 1]);
	return {
		currency: cur,
		rows: rows.slice(0, cap).map((r) => ({
			key: String(r.id),
			day: isoDay(r.day),
			amount: roundMinor(num(r.val), cur),
			refund: num(r.val) < 0,
			channel: String(r.channel),
			entry: String(r.entry),
			country: String(r.country)
		})),
		truncated: rows.length > cap
	};
}
/** Base report to revenue dim of `withRevenue: true`. */
const WITH_REVENUE = {
	channels: "channel",
	sources: "source",
	campaigns: "campaign",
	pages: "page",
	entry_pages: "entry",
	countries: "country",
	devices: "device",
	events: "event",
	goals: "goal"
};
/**
* Merge `revenue`, `refunds`, `net_revenue`, `orders` and `revenue_currency` into the base rows by key (one extra statement pair,
* no SQL join). Page and outbound goals carry null. A key with revenue but no base row is appended with
* null base metrics when the base rows are complete (first page, not truncated).
*/
async function withRevenue(rc, input, report, data) {
	const dim = WITH_REVENUE[report];
	if (!dim || !data.rows) return data;
	if (report === "campaigns" && input.params.field && input.params.field !== "utm_campaign") return {
		...data,
		notices: [...data.notices ?? [], "revenue_not_available"]
	};
	if (input.summary && revenuePlan(input, dim).unavailable.length) return {
		...data,
		notices: [...data.notices ?? [], "revenue_not_available"]
	};
	const cur = currencyOf(rc, input);
	const list = currencyList(await currencyRows(rc, input, dim), null, cur);
	const rev = await revenueByKey(rc, input, dim, cur);
	const types = new Map(rc.goals.map((g) => [g.name, g.type]));
	const seen = /* @__PURE__ */ new Set();
	const rows = data.rows.map((row) => {
		seen.add(row.key);
		if (dim === "goal" && types.get(row.key) !== "event") return {
			...row,
			revenue: null,
			refunds: null,
			net_revenue: null,
			orders: null,
			revenue_currency: cur
		};
		const r = rev.get(row.key);
		return {
			...row,
			revenue: r?.revenue ?? 0,
			refunds: r?.refunds ?? 0,
			net_revenue: roundMinor((r?.revenue ?? 0) - (r?.refunds ?? 0), cur),
			orders: r?.orders ?? 0,
			revenue_currency: cur
		};
	});
	if (!data.truncated && input.offset === 0 && dim !== "goal") {
		for (const [key, r] of rev) if (!seen.has(key)) rows.push({
			key,
			visitors: null,
			sessions: null,
			revenue_per_visitor: null,
			revenue: r.revenue,
			refunds: r.refunds,
			net_revenue: roundMinor(r.revenue - r.refunds, cur),
			orders: r.orders,
			revenue_currency: cur
		});
	}
	return {
		...data,
		rows,
		currency: cur,
		currencies: list.map(({ revenue_per_visitor: _r, ...c }) => c)
	};
}

//#endregion
//#region src/query/reports/journeys.ts
/**
* Journeys: session level page flows over the pageviews of the filtered sessions. Each report is
* one statement plus one count statement for the session cap. Consecutive views of one path (a reload, a route
* re-entry) are one step. Pageviews in the same second are ordered by entry key, so such pairs may swap. Before
* the detailed window `journeysFromSummary` answers from the daily `next` and `path3` rows (`journeyDay`), which
* keep the top steps and paths of each day: notice `top_paths_per_day`.
*/
const JOURNEY_MAX_RANGE_DAYS = 31;
const JOURNEY_SESSION_CAP = 5e4;
/** Rows with fewer sessions are omitted and counted in `hidden_sessions`: a one session path is one person's route. */
const JOURNEY_MIN_SESSIONS = 2;
const JOURNEY_MAX_ROWS = 20;
/** Grouped rows read before the floor; one page has far fewer distinct neighbours. */
const GROUP_LIMIT = 5e3;
const EXIT = "(exit)";
const ENTRY = "(entry)";
const ORDER = "PARTITION BY p.day, p.sid ORDER BY p.ts, p.id";
/**
* Range and session caps, then the windowed CTE `seq (sid, path, prev, next, next2, n)`: one row per step of a
* session, with the previous and the two following steps and the step number.
*/
async function journeyBase(rc, input) {
	checkRange(input);
	const sessions = sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE);
	const [c] = await rc.db.all(`SELECT COUNT(*) AS n FROM ca_sessions s WHERE ${sessions.sql}`, sessions.params);
	const n = num(c?.n);
	if (n > JOURNEY_SESSION_CAP) throw new QueryError("journey_cap", `Journeys read at most ${JOURNEY_SESSION_CAP} sessions; this range has ${n}. Narrow the range or add filters.`);
	return journeySeq(rc, sessions);
}
/** The windowed CTE `seq` over the page views of the visits `sessions` selects (no range or session cap). */
function journeySeq(rc, sessions) {
	const h = entryCols(rc.db.dialect);
	const where = and([sessions, {
		sql: h.pv,
		params: []
	}]);
	return {
		sql: `WITH v AS (SELECT s.day AS day, s.sid AS sid, ${h.path} AS path, ${h.ts} AS ts, ${h.id} AS id, LAG(${h.path}) OVER (PARTITION BY s.day, s.sid ORDER BY ${h.ts}, ${h.id}) AS prior
FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql}),
p AS (SELECT v.day AS day, v.sid AS sid, v.path AS path, v.ts AS ts, v.id AS id FROM v WHERE v.prior IS NULL OR v.prior <> v.path),
seq AS (SELECT p.sid AS sid, p.path AS path, LAG(p.path) OVER (${ORDER}) AS prev, LEAD(p.path) OVER (${ORDER}) AS next, LEAD(p.path, 2) OVER (${ORDER}) AS next2, ROW_NUMBER() OVER (${ORDER}) AS n FROM p)`,
		params: where.params
	};
}
function checkRange(input) {
	const days = daysBetween(input.from, input.to);
	if (days > JOURNEY_MAX_RANGE_DAYS) throw new QueryError("journey_range", `Journeys read at most ${JOURNEY_MAX_RANGE_DAYS} days; this range has ${days}. Choose a shorter range.`);
}
/** Rows at or above the floor (at most 20) and the sessions of the omitted ones. */
function floor(rows) {
	return {
		rows: rows.filter((r) => r.sessions >= JOURNEY_MIN_SESSIONS).slice(0, JOURNEY_MAX_ROWS),
		hidden_sessions: rows.filter((r) => r.sessions < JOURNEY_MIN_SESSIONS).reduce((a, r) => a + r.sessions, 0)
	};
}
function neighbour(column, none) {
	return async (rc, input) => {
		const path = input.params.path;
		if (!path) throw new QueryError("invalid_params", `journey_${column} needs params.path.`);
		const base = await journeyBase(rc, input);
		const key = `COALESCE(t.${column}, '${none}')`;
		const rows = await rc.db.all(`${base.sql}
SELECT ${key} AS key, COUNT(DISTINCT t.sid) AS sessions, (SELECT COUNT(DISTINCT x.sid) FROM seq x WHERE x.path = ?) AS page_sessions
FROM seq t WHERE t.path = ? AND COALESCE(t.${column}, '') <> t.path GROUP BY ${key} ORDER BY sessions DESC, key LIMIT ${GROUP_LIMIT}`, [
			...base.params,
			path,
			path
		]);
		const total = num(rows[0]?.page_sessions);
		return {
			...floor(rows.map((r) => ({
				key: String(r.key),
				sessions: num(r.sessions),
				share: round(ratio(num(r.sessions), total))
			}))),
			page_sessions: total
		};
	};
}
/** What followed the page, including `(exit)`. A drill-down, not a tile report. */
const journeyNext = neighbour("next", EXIT);
/** What preceded the page, including `(entry)`. A drill-down, not a tile report. */
const journeyPrev = neighbour("prev", ENTRY);
/** The most common three step sequences from the landing page (`params.entry` narrows the landing page). */
async function journeyPaths(rc, input) {
	const base = await journeyBase(rc, input);
	const entry = input.params.entry;
	const p2 = `COALESCE(t.next, '${EXIT}')`;
	const p3 = `CASE WHEN t.next IS NULL THEN '' ELSE COALESCE(t.next2, '${EXIT}') END`;
	return floor((await rc.db.all(`${base.sql}
SELECT t.path AS path1, ${p2} AS path2, ${p3} AS path3, COUNT(*) AS sessions FROM seq t WHERE t.n = 1${entry ? " AND t.path = ?" : ""}
GROUP BY t.path, ${p2}, ${p3} ORDER BY sessions DESC, path1, path2, path3 LIMIT ${GROUP_LIMIT}`, [...base.params, ...entry ? [entry] : []])).map((r) => {
		const path3 = String(r.path3) || null;
		return {
			key: [
				String(r.path1),
				String(r.path2),
				...path3 ? [path3] : []
			].join(" > "),
			path1: String(r.path1),
			path2: String(r.path2),
			path3,
			sessions: num(r.sessions)
		};
	}));
}
/** Summary dims of the journeys: `next` (key a page, segkey the next page, `(exit)`, or '' for the page's own sessions; key `(entry)` for landings) and `path3` (key the landing page, segkey the next two steps). */
const JOURNEY_DIMS = ["next", "path3"];
/** Separates the second and third step of a `path3` segkey (no path holds it). */
const STEP_SEP = "";
/**
* The journey rows of one site and day for the summaries, one statement over the same steps as the reports: what
* followed each page, which page each visit landed on, the visits of each page, and the three step paths. A visit
* belongs to one day, so the rows of several days add up to the detailed counts.
*/
async function journeyDay(rc, day) {
	const base = journeySeq(rc, sessionWhere(rc.site, day, day, TRUE));
	const p2 = `COALESCE(t.next, '${EXIT}')`;
	const p3 = `CASE WHEN t.next IS NULL THEN '' ELSE COALESCE(t.next2, '${EXIT}') END`;
	return (await rc.db.all(`${base.sql}
SELECT 'next' AS dim, t.path AS key, ${p2} AS segkey, COUNT(DISTINCT t.sid) AS sessions FROM seq t WHERE COALESCE(t.next, '') <> t.path GROUP BY t.path, ${p2}
UNION ALL SELECT 'next', '${ENTRY}', t.path, COUNT(DISTINCT t.sid) FROM seq t WHERE t.n = 1 GROUP BY t.path
UNION ALL SELECT 'next', t.path, '', COUNT(DISTINCT t.sid) FROM seq t GROUP BY t.path
UNION ALL SELECT 'path3', t.path, ${p2} || '${STEP_SEP}' || ${p3}, COUNT(*) FROM seq t WHERE t.n = 1 GROUP BY t.path, ${p2}, ${p3}`, base.params)).map((r) => ({
		dim: r.dim,
		key: String(r.key),
		segkey: String(r.segkey),
		sessions: num(r.sessions)
	}));
}
/** `dim:reason` of the filters a journey summary answer cannot honour: every filter (journey rows have no segments). */
const journeysUnavailable = (filters) => [...new Set(filters.map((f) => `${f.dim}:not_kept`))];
/** Range rule and notices of a summary answer: no filter applies to the journey rows. */
function summaryNotices(input) {
	checkRange(input);
	return ["top_paths_per_day", ...journeysUnavailable(input.filters).map((u) => `filter_unavailable:${u}`)];
}
const read = async (rc, input, dim, o) => (await Promise.resolve().then(() => rollup_exports)).readFamily(rc, input.from, input.to, {
	table: "ca_rollup",
	dim,
	seg: "",
	...o
});
function neighbourFromSummary(column) {
	return async (rc, input) => {
		const notices = summaryNotices(input);
		const path = input.params.path;
		if (!path) throw new QueryError("invalid_params", `journey_${column} needs params.path.`);
		const own = await read(rc, input, "next", { key: path });
		const total = num(own.find((r) => r.segkey === "")?.sessions);
		return {
			...floor((column === "next" ? own.filter((r) => r.segkey !== "").map((r) => ({
				key: String(r.segkey),
				n: num(r.sessions)
			})) : (await read(rc, input, "next", { segkey: path })).map((r) => ({
				key: String(r.key),
				n: num(r.sessions)
			}))).sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1)).map((r) => ({
				key: r.key,
				sessions: r.n,
				share: round(ratio(r.n, total))
			}))),
			page_sessions: total,
			notices
		};
	};
}
/**
* The journey reports from the daily summary rows (a range before the detailed window), in the detailed reports'
* shape, with the 31 day range rule and the floor of two sessions. Each day keeps its top steps and paths, so the
* answer is the top paths per day (`top_paths_per_day`); filters do not apply (`filter_unavailable:<dim>:not_kept`).
*/
const journeysFromSummary = {
	journey_next: neighbourFromSummary("next"),
	journey_prev: neighbourFromSummary("prev"),
	journey_paths: async (rc, input) => {
		const notices = summaryNotices(input);
		const entry = input.params.entry;
		const rows = (await read(rc, input, "path3", entry ? { key: entry } : {})).map((r) => {
			const [path2 = "", rest = ""] = String(r.segkey).split(STEP_SEP);
			const path3 = rest || null;
			return {
				key: [
					String(r.key),
					path2,
					...path3 ? [path3] : []
				].join(" > "),
				path1: String(r.key),
				path2,
				path3,
				sessions: num(r.sessions)
			};
		});
		const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
		rows.sort((a, b) => b.sessions - a.sessions || cmp(String(a.path1), String(b.path1)) || cmp(a.path2, b.path2) || cmp(a.path3 ?? "", b.path3 ?? ""));
		return {
			...floor(rows),
			notices
		};
	}
};

//#endregion
//#region src/query/reports/links.ts
/**
* `links` (Links convention, docs/integration.md): impressions, clicks, CTR, clicking sessions and conversions per
* link, placement, page or session dim. Clicks are `out` events and conversions `conv` events keyed by their `slug` and
* `place` props; impressions are `seen` events exploded over `s0` to `s9`, each `<slug>` or `<slug>@<place>`.
* Events are entries of the visit documents of the range, plus the link events the site's server reported
* without a visit (`ca_events`, by their own day); a visit with no page view and an event without one are
* `(not set)` in the session dims. A conversion's amount is its `ca_events` row, keyed like the
* entry. Three statements merged by key in JS. Revenue columns only with `params.withRevenue`, in one currency, the other
* currencies listed. Before the detailed window `linksFromSummary` answers from the daily link rows
* (`linkDay`, stored by the closed-day writer).
*/
const NONE = "'(none)'";
const NOT_SET$1 = "'(not set)'";
const VIEW_KEYS = Array.from({ length: 10 }, (_, i) => `'s${i}'`).join(", ");
/** Event entries of the visits of the range; under a session filter only entries of a counted visit remain. */
function entrySource(rc, input) {
	const d = rc.db.dialect;
	const h = entryCols(d);
	const session = input.traffic?.session ?? TRUE;
	return {
		from(join, extra) {
			const where = and([
				visitDays(rc.site, input.from, input.to),
				{
					sql: h.ev,
					params: []
				},
				session.sql === TRUE.sql ? TRUE : and([{
					sql: "s.pageviews > 0",
					params: []
				}, session]),
				input.traffic?.ev ?? TRUE,
				extra
			]);
			return {
				sql: `FROM ca_sessions s CROSS JOIN ${entriesOf(d)}${join} WHERE ${where.sql}`,
				params: where.params
			};
		},
		name: h.name,
		path: h.path,
		sid: "s.sid",
		prop: (k) => entryProp(d, "h", k),
		each: d === "postgres" ? ", jsonb_each_text(h.value -> 'pr') AS p" : ", json_each(h.value, '$.pr') AS p",
		amount: (left) => ` ${left ? "LEFT " : ""}JOIN ca_events r ON r.site = s.site AND r.id = ${h.id}`,
		val: "r.val",
		cur: "r.cur",
		sessionKey: (by) => REVENUE_KEYS[by],
		counted: "CASE WHEN s.pageviews > 0 THEN 1 ELSE 0 END"
	};
}
/** Link events the site's server reported without a visit (`ca_events`, by their own day): `(not set)` in the session dims. Refund rows (negative `val`) are not events. */
function visitlessSource(rc, input) {
	const d = rc.db.dialect;
	return {
		from(join, extra) {
			const where = and([{
				sql: "h.site = ? AND h.day BETWEEN ? AND ? AND h.sid IS NULL AND (h.val IS NULL OR h.val >= 0)",
				params: [
					rc.site,
					dayInt(input.from),
					dayInt(input.to)
				]
			}, extra]);
			return {
				sql: `FROM ca_events h${join} WHERE ${where.sql}`,
				params: where.params
			};
		},
		name: "h.name",
		path: "h.path",
		sid: "NULL",
		prop: (k) => propText(d, "h", k),
		each: d === "postgres" ? ", jsonb_each_text(CAST(h.props AS jsonb)) AS p" : ", json_each(h.props) AS p",
		amount: () => "",
		val: "h.val",
		cur: "h.cur",
		sessionKey: () => NOT_SET$1,
		counted: "0"
	};
}
/** One statement over every source: each grouped by `key`, then summed by `key` (sessions never overlap: visitless rows have none). */
async function overSources(rc, sources, part, sums) {
	const parts = sources.map(part);
	return rc.db.all(`SELECT t.key AS key, ${sums} FROM (${parts.map((p) => p.sql).join(" UNION ALL ")}) t GROUP BY t.key`, parts.flatMap((p) => p.params));
}
/** `seen` keys (`<slug>` or `<slug>@<place>`) of property row `p`: the value, its slug and its placement. */
function seenKeys(d) {
	const pos = (v) => d === "postgres" ? `strpos(${v}, '@')` : `instr(${v}, '@')`;
	const v = d === "postgres" ? "p.value" : "CAST(p.value AS TEXT)";
	return {
		v,
		slug: `CASE WHEN ${pos(v)} > 0 THEN substr(${v}, 1, ${pos(v)} - 1) ELSE ${v} END`,
		place: `CASE WHEN ${pos(v)} > 0 THEN substr(${v}, ${pos(v)} + 1) ELSE ${NONE} END`
	};
}
const hitSlug = (src) => `COALESCE(${src.prop(LINK_EVENTS.key)}, ${NOT_SET$1})`;
const hitPlace = (src) => `COALESCE(NULLIF(${src.prop(LINK_EVENTS.place)}, ''), ${NONE})`;
function linkBy(input) {
	const by = input.params.by ?? "link";
	if (!LINK_BY.includes(by)) throw new QueryError("invalid_params", `links params.by is one of ${LINK_BY.join(", ")}.`);
	return by;
}
async function links(rc, input) {
	const by = linkBy(input);
	const { v, slug: seenSlug, place: seenPlace } = seenKeys(rc.db.dialect);
	const keyOf = (src, slug, place) => by === "link" ? slug : by === "place" ? place : by === "page" ? `COALESCE(${src.path}, ${NOT_SET$1})` : src.sessionKey(by);
	const slug = input.params.slug;
	const onSlug = (expr) => slug ? {
		sql: `${expr} = ?`,
		params: [slug]
	} : TRUE;
	const sources = (input.traffic?.session ?? TRUE).sql === TRUE.sql ? [entrySource(rc, input), visitlessSource(rc, input)] : [entrySource(rc, input)];
	const cur = input.params.withRevenue ? currencyOf(rc, input) : null;
	const clickRows = await overSources(rc, sources, (src) => {
		const hk = keyOf(src, hitSlug(src), hitPlace(src));
		const f = src.from(cur ? src.amount(true) : "", and([{
			sql: `${src.name} IN (?, ?)`,
			params: [LINK_EVENTS.click, LINK_EVENTS.sale]
		}, onSlug(hitSlug(src))]));
		return {
			sql: `SELECT ${hk} AS key, SUM(CASE WHEN ${src.name} = ? THEN 1 ELSE 0 END) AS clicks, COUNT(DISTINCT CASE WHEN ${src.name} = ? THEN ${src.sid} END) AS sessions, SUM(CASE WHEN ${src.name} = ? THEN 1 ELSE 0 END) AS conversions${cur ? `, SUM(CASE WHEN ${src.name} = ? AND ${src.cur} = ? THEN ${src.val} ELSE 0 END) AS revenue` : ", 0 AS revenue"} ${f.sql} GROUP BY ${hk}`,
			params: [
				LINK_EVENTS.click,
				LINK_EVENTS.click,
				LINK_EVENTS.sale,
				...cur ? [LINK_EVENTS.sale, cur] : [],
				...f.params
			]
		};
	}, "SUM(t.clicks) AS clicks, SUM(t.sessions) AS sessions, SUM(t.conversions) AS conversions, SUM(t.revenue) AS revenue");
	const seenRows = await overSources(rc, sources, (src) => {
		const sk = keyOf(src, seenSlug, seenPlace);
		const f = src.from(src.each, and([{
			sql: `${src.name} = ? AND p.key IN (${VIEW_KEYS}) AND ${v} <> ''`,
			params: [LINK_EVENTS.view]
		}, onSlug(seenSlug)]));
		return {
			sql: `SELECT ${sk} AS key, COUNT(*) AS impressions ${f.sql} GROUP BY ${sk}`,
			params: f.params
		};
	}, "SUM(t.impressions) AS impressions");
	const byKey = /* @__PURE__ */ new Map();
	for (const r of seenRows) sumsOf(byKey, r.key).impressions += num(r.impressions);
	for (const r of clickRows) Object.assign(sumsOf(byKey, r.key), {
		clicks: num(r.clicks),
		sessions: num(r.sessions),
		conversions: num(r.conversions),
		revenue: num(r.revenue)
	});
	if (!cur) return linkData(by, byKey, input, null);
	const parts = sources.map((src) => {
		const f = src.from(src.amount(false), and([{
			sql: `${src.name} = ? AND ${src.val} IS NOT NULL AND ${src.cur} IS NOT NULL`,
			params: [LINK_EVENTS.sale]
		}, onSlug(hitSlug(src))]));
		return {
			sql: `SELECT ${src.cur} AS cur, COUNT(*) AS orders, SUM(${src.val}) AS revenue ${f.sql} GROUP BY ${src.cur}`,
			params: f.params
		};
	});
	return linkData(by, byKey, input, cur, await rc.db.all(`SELECT t.cur AS cur, SUM(t.orders) AS orders, SUM(t.revenue) AS revenue FROM (${parts.map((p) => p.sql).join(" UNION ALL ")}) t GROUP BY t.cur`, parts.flatMap((p) => p.params)));
}
const sumsOf = (byKey, k) => {
	const key = String(k);
	const e = byKey.get(key) ?? {
		impressions: 0,
		clicks: 0,
		sessions: 0,
		conversions: 0,
		revenue: 0
	};
	byKey.set(key, e);
	return e;
};
/** The report's answer from the sums per key, and (with a currency) the conversion values per currency. */
function linkData(by, byKey, input, cur, perCur = []) {
	const ctr = (clicks, impressions) => round(ratio(clicks, impressions)) ?? 0;
	const money = cur ? (n) => roundMinor(n, cur) : null;
	const rows = [...byKey].map(([key, e]) => ({
		key,
		impressions: e.impressions,
		clicks: e.clicks,
		ctr: ctr(e.clicks, e.impressions),
		sessions: e.sessions,
		conversions: e.conversions,
		...money ? {
			revenue: money(e.revenue),
			revenue_currency: cur
		} : {}
	}));
	rows.sort((a, b) => num(b.clicks) - num(a.clicks) || num(b.impressions) - num(a.impressions) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	const sum = (k) => [...byKey.values()].reduce((a, e) => a + e[k], 0);
	const data = {
		by,
		totals: {
			impressions: sum("impressions"),
			clicks: sum("clicks"),
			ctr: ctr(sum("clicks"), sum("impressions")),
			conversions: sum("conversions"),
			...money ? { revenue: money(sum("revenue")) } : {}
		},
		rows: rows.slice(input.offset, input.offset + input.limit),
		truncated: rows.length > input.offset + input.limit
	};
	if (!cur) return data;
	const currencies = perCur.map((r) => ({
		currency: String(r.cur),
		revenue: roundMinor(num(r.revenue), String(r.cur)),
		orders: num(r.orders)
	})).sort((a, b) => a.currency === cur ? -1 : b.currency === cur ? 1 : b.orders - a.orders || (a.currency < b.currency ? -1 : 1));
	return {
		...data,
		currency: cur,
		currencies,
		other_currencies: currencies.filter((c) => c.currency !== cur).map((c) => c.currency)
	};
}
/** Summary dims of the links report: `link` (by slug, also crossed with a segment) and `link_place` (by placement). */
const LINK_DIMS = ["link", "link_place"];
/** `ca_rollup` column of each link metric (the table has one column set for every dim). */
const LINK_COLS = {
	impressions: "hits",
	clicks: "events",
	sessions: "sessions",
	conversions: "engaged"
};
/**
* The link rows of one site and day for the summaries, one statement over the report's sources: per family
* (`link`, `link_place`, and `link` crossed with each of `segs`) the clicks, clicking sessions and conversions,
* the conversion values per currency, and the impressions. Pair rows hold what a filter on that segment keeps:
* events of a visit with a page view (the report's session filter rule), so a pair row equals the detailed report
* under that filter.
*/
async function linkDay(rc, day, segs) {
	const input = {
		from: day,
		to: day,
		filters: [],
		granularity: "day",
		params: {},
		limit: 0,
		offset: 0,
		isCompare: false
	};
	const sources = [entrySource(rc, input), visitlessSource(rc, input)];
	const seen = seenKeys(rc.db.dialect);
	const cols = (src) => `${src.counted} AS counted${segs.map((g) => `, ${src.sessionKey(g)} AS ${g}`).join("")}`;
	const events = sources.map((src) => {
		const f = src.from(src.amount(true), {
			sql: `${src.name} IN (?, ?)`,
			params: [LINK_EVENTS.click, LINK_EVENTS.sale]
		});
		return {
			sql: `SELECT ${hitSlug(src)} AS slug, ${hitPlace(src)} AS place, CASE WHEN ${src.name} = ? THEN 1 ELSE 0 END AS click, ${src.sid} AS sid, ${src.val} AS val, ${src.cur} AS cur, ${cols(src)} ${f.sql}`,
			params: [LINK_EVENTS.click, ...f.params]
		};
	});
	const views = sources.map((src) => {
		const f = src.from(src.each, {
			sql: `${src.name} = ? AND p.key IN (${VIEW_KEYS}) AND ${seen.v} <> ''`,
			params: [LINK_EVENTS.view]
		});
		return {
			sql: `SELECT ${seen.slug} AS slug, ${seen.place} AS place, ${cols(src)} ${f.sql}`,
			params: f.params
		};
	});
	const parts = [
		[
			"link",
			"",
			"slug"
		],
		[
			"link_place",
			"",
			"place"
		],
		...segs.map((g) => [
			"link",
			g,
			"slug"
		])
	].flatMap(([dim, seg, k]) => {
		const head = `SELECT '${dim}' AS dim, '${seg}' AS seg, ${k} AS key, ${seg || "''"} AS segkey`;
		const counted = seg ? " AND counted = 1" : "";
		const group = `GROUP BY ${k}${seg ? `, ${seg}` : ""}`;
		return [
			`${head}, '' AS cur, 0 AS impressions, SUM(click) AS clicks, COUNT(DISTINCT CASE WHEN click = 1 THEN sid END) AS sessions, SUM(1 - click) AS conversions, 0 AS orders, 0 AS revenue FROM e WHERE 1 = 1${counted} ${group}`,
			`${head}, cur, 0, 0, 0, 0, COUNT(*), SUM(val) FROM e WHERE click = 0 AND val IS NOT NULL AND cur IS NOT NULL${counted} ${group}, cur`,
			`${head}, '', COUNT(*), 0, 0, 0, 0, 0 FROM i WHERE 1 = 1${counted} ${group}`
		];
	});
	return (await rc.db.all(`WITH e AS (${events.map((p) => p.sql).join(" UNION ALL ")}), i AS (${views.map((p) => p.sql).join(" UNION ALL ")}) ${parts.join(" UNION ALL ")}`, [...events.flatMap((p) => p.params), ...views.flatMap((p) => p.params)])).map((r) => ({
		dim: r.dim,
		seg: String(r.seg),
		key: String(r.key),
		segkey: String(r.segkey),
		cur: String(r.cur ?? ""),
		impressions: num(r.impressions),
		clicks: num(r.clicks),
		sessions: num(r.sessions),
		conversions: num(r.conversions),
		orders: num(r.orders),
		revenue: num(r.revenue)
	}));
}
/**
* What a links summary answer honours, or null when the breakdown has no summary rows (by page or a session dim,
* placements of one link). By link: one of channel, country and device through the pair rows; by placement: none.
* `unavailable` holds `dim:reason` like `planFilters`.
*/
function linksPlan(input) {
	const by = linkBy(input);
	if (by !== "link" && (by !== "place" || input.params.slug)) return null;
	const seg = by === "link" ? input.filters.find((f) => SEGMENTS.includes(f.dim))?.dim ?? "" : "";
	return {
		by,
		seg,
		unavailable: [...new Map(input.filters.filter((f) => f.dim !== seg).map((f) => [f.dim, SEGMENTS.includes(f.dim) && seg ? "combination" : "not_kept"]))].map(([d, r]) => `${d}:${r}`)
	};
}
/**
* The links report from the daily summary rows, in the detailed report's shape (see `linksPlan`). Filters it cannot
* honour are named in `filter_unavailable:<dim>:<reason>`. Each day keeps its top links (`(other)` holds the rest).
*/
async function linksFromSummary(rc, input) {
	const plan = linksPlan(input);
	const slug = input.params.slug;
	if (!plan) throw new QueryError("raw_only", `Links ${slug ? "of one link " : ""}by ${linkBy(input)} need detailed data, which is kept for the raw retention window only. Choose a more recent range.`);
	const { by, seg } = plan;
	const applied = input.filters.filter((f) => f.dim === seg);
	const notices = plan.unavailable.map((u) => `filter_unavailable:${u}`);
	const dim = by === "link" ? "link" : "link_place";
	const [{ readFamily }, { matchKey }] = await Promise.all([Promise.resolve().then(() => rollup_exports), import("./rollup-DR7ov-xz.mjs").then((n) => n.i)]);
	const pass = (r) => applied.every((f) => matchKey(f, String(r.segkey)));
	const read = (table) => readFamily(rc, input.from, input.to, {
		table,
		dim,
		seg,
		...slug ? { key: slug } : {}
	}).then((rows) => rows.filter(pass));
	const byKey = /* @__PURE__ */ new Map();
	for (const r of await read("ca_rollup")) {
		const e = sumsOf(byKey, r.key);
		for (const [m, col] of Object.entries(LINK_COLS)) e[m] += num(r[col]);
	}
	if (!input.params.withRevenue) return {
		...linkData(by, byKey, input, null),
		notices
	};
	if (notices.length) return {
		...linkData(by, byKey, input, null),
		notices: [...notices, "revenue_not_available"]
	};
	const cur = currencyOf(rc, input);
	const perCur = /* @__PURE__ */ new Map();
	for (const r of await read("ca_revenue_daily")) {
		if (r.cur === cur) sumsOf(byKey, r.key).revenue += num(r.revenue);
		const c = perCur.get(String(r.cur)) ?? {
			cur: String(r.cur),
			orders: 0,
			revenue: 0
		};
		perCur.set(c.cur, {
			cur: c.cur,
			orders: c.orders + num(r.orders),
			revenue: c.revenue + num(r.revenue)
		});
	}
	return {
		...linkData(by, byKey, input, cur, [...perCur.values()]),
		notices
	};
}
/** Segment dims of the link pair rows (the summary segments). */
const SEGMENTS = [
	"channel",
	"country",
	"device"
];

//#endregion
//#region src/query/rollup.ts
var rollup_exports = /* @__PURE__ */ __exportAll({
	CLOSE_GRACE_S: () => CLOSE_GRACE_S,
	CUBE_CAP: () => CUBE_CAP,
	CUBE_METRICS: () => CUBE_METRICS,
	JOURNEY_CAP: () => JOURNEY_CAP,
	KV_REVENUE_CURSOR: () => KV_REVENUE_CURSOR,
	KV_ROLLUP_CURSOR: () => KV_ROLLUP_CURSOR,
	KV_WATERMARK: () => KV_WATERMARK,
	LINK_TOP_N: () => LINK_TOP_N,
	OTHER: () => OTHER,
	PAIR_DIMS: () => PAIR_DIMS,
	PAIR_ROWS: () => PAIR_ROWS,
	PAIR_WEIGHTS: () => PAIR_WEIGHTS,
	REVENUE_RECONCILE_DAYS_PER_TICK: () => REVENUE_RECONCILE_DAYS_PER_TICK,
	REVENUE_ROLLUP_MAX_SITES_PER_TICK: () => REVENUE_ROLLUP_MAX_SITES_PER_TICK,
	REVENUE_STATEMENTS_PER_SITE: () => REVENUE_STATEMENTS_PER_SITE,
	ROLLUP_DIMS: () => ROLLUP_DIMS,
	SEGS: () => SEGS,
	SESSION_KEYS: () => SESSION_KEYS,
	SUMMARY_DIMS: () => SUMMARY_DIMS,
	TOP_N: () => TOP_N,
	VANISHED_LIST_BYTES: () => VANISHED_LIST_BYTES,
	computeDay: () => computeDay,
	computeJourneys: () => computeJourneys,
	computeLinks: () => computeLinks,
	computeRevenueDays: () => computeRevenueDays,
	counted: () => counted,
	cubeUpsertSql: () => cubeUpsertSql,
	cubeVanishedSql: () => cubeVanishedSql,
	dayStatements: () => dayStatements,
	foldCube: () => foldCube,
	foldPairs: () => foldPairs,
	foldRevenue: () => foldRevenue,
	foldTop: () => foldTop,
	lastClosedDay: () => lastClosedDay,
	pairCap: () => pairCap,
	readFamily: () => readFamily,
	revenueDrift: () => revenueDrift,
	rollupDay: () => rollupDay,
	rollupRevenue: () => rollupRevenue,
	rollupRevenueDays: () => rollupRevenueDays,
	runRevenue: () => runRevenue,
	runRollup: () => runRollup,
	sitesOfDay: () => sitesOfDay,
	summaryRows: () => summaryRows,
	summaryUpsertSql: () => summaryUpsertSql,
	summaryVanishedSql: () => summaryVanishedSql,
	vanishedStmts: () => vanishedStmts
});
const ROLLUP_DIMS = [
	"all",
	"page",
	"entry",
	"exit",
	"channel",
	"source",
	"utm_campaign",
	"country",
	"device",
	"browser",
	"os",
	"lang",
	"event",
	"goal"
];
/** Key folded from the rows beyond the top N of a dim and day. */
const OTHER = "(other)";
const NOT_SET = "'(not set)'";
/** Top-N per dim and day (pages 500, sources 200). */
const TOP_N = {
	all: 1,
	page: 500,
	entry: 500,
	exit: 500,
	channel: 200,
	source: 200,
	utm_campaign: 200,
	country: 200,
	device: 200,
	browser: 200,
	os: 200,
	lang: 200,
	event: 200,
	goal: 200
};
/** Session key expressions, identical to the raw breakdown reports. */
const SESSION_KEYS = {
	all: "''",
	entry: "s.entry_path",
	exit: "s.exit_path",
	channel: `COALESCE(s.channel, ${NOT_SET})`,
	source: `COALESCE(s.source, ${NOT_SET})`,
	utm_campaign: "s.utm_campaign",
	country: `COALESCE(s.country, ${NOT_SET})`,
	device: `COALESCE(s.device, ${NOT_SET})`,
	browser: `COALESCE(s.browser, ${NOT_SET})`,
	os: `COALESCE(s.os, ${NOT_SET})`,
	lang: `COALESCE(s.lang, ${NOT_SET})`
};
/** Segment dimensions of the pair rows (`seg`, its value in `segkey`): the filters people combine most. */
const SEGS = [
	"channel",
	"country",
	"device"
];
/** Dims stored crossed with every segment, and their fixed weight in the pair budget. */
const PAIR_WEIGHTS = {
	page: 4,
	entry: 2,
	source: 2,
	utm_campaign: 1,
	event: 2,
	goal: 1
};
const PAIR_DIMS = Object.keys(PAIR_WEIGHTS);
/** Weight of the link pairs (`link` x one segment, stored with the link rows) in the same pair budget. */
const LINK_PAIR_WEIGHT = 1;
/**
* Pair rows per site and day across all pairs. `standard` and `dedicated`: what is left of the summary share
* (a quarter of the profile's bytes, 130 bytes a row, 760 days) after the single dimension, link, journey and cube rows
* at their caps, so 25 months of summaries fit even at every cap (tested). `small`: 340 of the about 760 rows a day the
* share held at 130 bytes. The rows measured 74 to 81 bytes since (`SUMMARY_ROW_BYTES`), so the caps leave a margin.
*/
const PAIR_ROWS = {
	small: 340,
	standard: 7500,
	dedicated: 15e3
};
const WEIGHT_SUM = SEGS.length * (Object.values(PAIR_WEIGHTS).reduce((a, w) => a + w, 0) + LINK_PAIR_WEIGHT);
/** Rows of one pair family (`dim` x one segment) per day: its weighted share of the profile's pair rows. */
const pairCap = (profile, dim) => Math.floor(PAIR_ROWS[profile ?? "standard"] * (dim === "link" ? LINK_PAIR_WEIGHT : PAIR_WEIGHTS[dim]) / WEIGHT_SUM);
/** Link rows per family and day (`link`, `link_place`; their conversion values per currency likewise). */
const LINK_TOP_N = 200;
/** Journey rows per day: `next` (steps, and the pages they name) and `path3`. */
const JOURNEY_CAP = {
	small: {
		next: 200,
		path3: 50
	},
	standard: {
		next: 2e3,
		path3: 500
	},
	dedicated: {
		next: 2e3,
		path3: 500
	}
};
/** Every dim of `ca_rollup` and `ca_revenue_daily` (the storage estimate counts them). */
const SUMMARY_DIMS = [
	...ROLLUP_DIMS,
	...LINK_DIMS,
	...JOURNEY_DIMS
];
/** Separates the two keys of a session pair inside one SQL key (no path, channel, country or device holds it). */
const SEP = CELL_SEP;
/**
* Cube cells (channel x country x device) per site and day. A day has few channels and devices, so the cells are
* mostly countries: the cap folds the smallest countries into `(other)` (see `foldCube`). Inside the summary share
* beside the pairs (`tests/rollup-pairs.test.ts`).
*/
const CUBE_CAP = {
	small: 150,
	standard: 1e3,
	dedicated: 1e3
};
const CUBE_METRICS = [
	"sessions",
	"pageviews",
	"visitors",
	"bounces",
	"engaged",
	"duration_ms",
	"events"
];
const KV_WATERMARK = "rollup:watermark";
const METRICS = [
	"pageviews",
	"sessions",
	"visitors",
	"bounces",
	"engaged",
	"engaged_ms",
	"events",
	"hits"
];
const row = (dim, key, m) => ({
	dim,
	key,
	...Object.fromEntries(METRICS.map((k) => [k, num(m[k])]))
});
/** Keep the top N rows by `by`, fold the rest into one `(other)` row (visitors summed, so approximate there). */
function foldTop(rows, n, by) {
	const sorted = [...rows].sort((a, b) => b[by] - a[by] || (a.key < b.key ? -1 : 1));
	if (sorted.length <= n) return sorted;
	const keep = sorted.slice(0, n - 1).filter((r) => r.key !== OTHER);
	const rest = sorted.filter((r) => !keep.includes(r));
	const other = row(rest[0]?.dim, OTHER, {});
	for (const r of rest) for (const m of METRICS) other[m] += r[m];
	return [...keep, other];
}
/**
* Keep the top rows of one pair family (one dim and segment) within `n` rows. Rows beyond the top fold into key
* `(other)` of their own segment value, so the totals under a segment filter stay exact; segment values with no
* kept row fold into `(other)` x `(other)`. The family's sum of every metric is unchanged.
*/
function foldPairs(rows, n, rank, add) {
	if (rows.length <= n) return rows;
	const sorted = [...rows].sort((a, b) => rank(b) - rank(a) || (a.key < b.key ? -1 : a.key > b.key ? 1 : a.segkey < b.segkey ? -1 : 1));
	const keep = /* @__PURE__ */ new Set();
	const segs = /* @__PURE__ */ new Set();
	for (const r of sorted) if (keep.size + 1 + segs.size + (segs.has(r.segkey) ? 0 : 1) + 1 <= n) keep.add(r), segs.add(r.segkey);
	const others = /* @__PURE__ */ new Map();
	for (const r of sorted) {
		if (keep.has(r) && r.key !== OTHER) continue;
		const segkey = segs.has(r.segkey) ? r.segkey : OTHER;
		let o = others.get(segkey);
		if (!o) {
			o = {
				...r,
				key: OTHER,
				segkey
			};
			others.set(segkey, o);
		} else add(o, r);
	}
	return [...[...keep].filter((r) => r.key !== OTHER), ...others.values()];
}
/**
* Fold cube cells (`segkey` = channel, country and device joined by `SEP`, `key` '') to `n` rows: countries beyond
* the top fold into `(other)` of their channel and device, so totals under channel and device filters stay exact;
* a channel and device with no kept cell folds into `(other)` x3. Every metric's total is unchanged.
*/
function foldCube(rows, n, rank, add) {
	return foldPairs(rows.map((r) => {
		const [channel, country, device] = r.segkey.split(SEP);
		return {
			...r,
			key: country,
			segkey: `${channel}${SEP}${device}`
		};
	}), n, rank, add).map((r) => {
		const [channel, device = OTHER] = r.segkey.split(SEP);
		return {
			...r,
			key: "",
			segkey: [
				channel,
				r.key,
				device
			].join(SEP)
		};
	});
}
const addMetrics = (into, r) => {
	for (const m of METRICS) into[m] += r[m];
};
/**
* Every summary row of one site and day, computed from the visit documents (`json_each`) and `ca_events`. Reads
* only, so the same function serves the closed-day writer and, in memory, days that are still open.
*/
async function computeDay(rc, day) {
	const { rows, pairs, cube } = await computeRollupRows(rc, day);
	const r = await computeRevenue(rc, [day]);
	return {
		rows,
		pairs,
		revenue: r.revenue,
		revenuePairs: r.pairs,
		...await computeLinks(rc, day),
		journeys: await computeJourneys(rc, day),
		cube,
		revenueCube: r.cube
	};
}
const reportCtx = (rc) => ({
	...rc,
	now: 0,
	funnels: {},
	annotations: []
});
const familyRow = (dim, seg, key, segkey, m) => ({
	dim,
	seg,
	key,
	segkey,
	...Object.fromEntries(METRICS.map((k) => [k, m[k] ?? 0]))
});
const addAll = (into, r) => {
	for (const m of METRICS) into[m] += r[m];
};
/** Group rows by `id`, fold each group with `fold`. */
function foldGroups(rows, id, fold) {
	const groups = /* @__PURE__ */ new Map();
	for (const r of rows) {
		const g = groups.get(id(r));
		if (g) g.push(r);
		else groups.set(id(r), [r]);
	}
	return [...groups.values()].flatMap(fold);
}
/** The link families of one day (one statement), each folded to its cap: top links by clicks and impressions, the rest in `(other)`. */
async function computeLinks(rc, day) {
	const rows = await linkDay(reportCtx(rc), day, SEGS);
	const cap = (seg) => seg ? pairCap(rc.settings.capacityProfile, "link") : LINK_TOP_N;
	const byKey = /* @__PURE__ */ new Map();
	for (const r of rows.filter((x) => x.cur === "")) {
		const id = `${r.dim}\u0000${r.seg}\u0000${r.key}\u0000${r.segkey}`;
		const into = byKey.get(id) ?? familyRow(r.dim, r.seg, r.key, r.segkey, {});
		for (const [m, col] of Object.entries(LINK_COLS)) into[col] += r[m];
		byKey.set(id, into);
	}
	const counts = [...byKey.values()];
	const values = rows.filter((r) => r.cur !== "").map((r) => ({
		day,
		dim: r.dim,
		seg: r.seg,
		key: r.key,
		segkey: r.segkey,
		cur: r.cur,
		orders: r.orders,
		revenue: r.revenue,
		sessions: 0
	}));
	return {
		links: foldGroups(counts, (r) => `${r.dim}|${r.seg}`, (g) => foldPairs(g, cap(g[0]?.seg ?? ""), (r) => r.events + r.hits, addAll)),
		linkRevenue: foldGroups(values, (r) => `${r.dim}|${r.seg}|${r.cur}`, (g) => foldPairs(g, cap(g[0]?.seg ?? ""), (r) => r.orders, (into, r) => {
			into.orders += r.orders;
			into.revenue += r.revenue;
		}))
	};
}
/**
* The journey families of one day (one statement), folded to the profile's caps. Steps fold per page (a page's
* steps beyond the top become its `(other)` step) within a third of the `next` cap, so the page rows the kept steps
* name fit in the rest; paths fold per landing page.
*/
async function computeJourneys(rc, day) {
	const rows = (await journeyDay(reportCtx(rc), day)).map((r) => familyRow(r.dim, "", r.key, r.segkey, { sessions: r.sessions }));
	const cap = JOURNEY_CAP[rc.settings.capacityProfile ?? "standard"];
	const swap = (r) => ({
		...r,
		key: r.segkey,
		segkey: r.key
	});
	const fold = (xs, n) => foldPairs(xs.map(swap), n, (r) => r.sessions, addAll).map(swap);
	const steps = fold(rows.filter((r) => r.dim === "next" && r.segkey !== ""), Math.floor(cap.next / 3));
	const named = new Set(steps.flatMap((r) => [r.key, r.segkey]));
	const pages = rows.filter((r) => r.dim === "next" && r.segkey === "" && named.has(r.key));
	return [
		...steps,
		...pages,
		...fold(rows.filter((r) => r.dim === "path3"), cap.path3)
	];
}
/** Fold every pair family of `pairs` (one dim and segment each) to its cap. */
function foldPairFamilies(rc, pairs, by) {
	const out = [];
	for (const dim of PAIR_DIMS) for (const seg of SEGS) out.push(...foldPairs(pairs.filter((p) => p.dim === dim && p.seg === seg), pairCap(rc.settings.capacityProfile, dim), (p) => p[by], addMetrics));
	return out;
}
async function computeRollupRows(rc, day) {
	const ctx = reportCtx(rc);
	const input = {
		from: day,
		to: day,
		filters: [],
		granularity: "day",
		params: {},
		limit: 0,
		offset: 0,
		isCompare: false
	};
	const out = [];
	const pairs = [];
	const sessionDims = Object.entries(SESSION_KEYS);
	const pairParts = sessionDims.filter(([dim]) => dim in PAIR_WEIGHTS).flatMap(([dim, expr]) => SEGS.map((seg) => [
		dim,
		`${expr} || '${SEP}' || ${SESSION_KEYS[seg]}`,
		seg
	]));
	const cubePart = [
		"cube",
		SEGS.map((g) => SESSION_KEYS[g]).join(` || '${SEP}' || `),
		CUBE_SEG
	];
	const parts = [
		...sessionDims.map(([dim, expr]) => [
			dim,
			expr,
			""
		]),
		...pairParts,
		cubePart
	].map(([dim, expr, seg]) => {
		const q = sessionAggSql(ctx, input, dim === "all" ? null : expr, dim === "utm_campaign" ? {
			sql: "s.utm_campaign IS NOT NULL",
			params: []
		} : TRUE);
		return {
			sql: `SELECT '${dim}' AS dim, '${seg}' AS seg, ${dim === "all" ? "''" : "x.key"} AS key, x.sessions, x.events, x.pageviews, x.visitors, x.bounces, x.engaged, x.duration_ms FROM (${q.sql}) x`,
			params: q.params
		};
	});
	const sessionRows = (await rc.db.all(parts.map((p) => p.sql).join(" UNION ALL "), parts.flatMap((p) => p.params))).filter((r) => num(r.sessions) > 0);
	for (const [dim] of sessionDims) {
		const mapped = sessionRows.filter((r) => r.dim === dim && r.seg === "").map((r) => row(dim, String(r.key), {
			...r,
			engaged_ms: r.duration_ms
		}));
		out.push(...foldTop(mapped, TOP_N[dim], "sessions"));
	}
	const cube = foldCube(sessionRows.filter((x) => x.seg === CUBE_SEG).map((r) => ({
		key: "",
		segkey: String(r.key),
		...cubeMetrics(r)
	})), CUBE_CAP[rc.settings.capacityProfile ?? "standard"], (r) => r.sessions, (into, r) => {
		for (const m of CUBE_METRICS) into[m] += r[m];
	}).map(({ key: _, segkey, ...m }) => {
		const [channel, country, device] = segkey.split(SEP);
		return {
			channel,
			country,
			device,
			...m
		};
	});
	for (const r of sessionRows.filter((x) => x.seg !== "" && x.seg !== CUBE_SEG)) {
		const k = String(r.key);
		const at = k.lastIndexOf(SEP);
		if (at < 0) continue;
		pairs.push({
			...row(r.dim, k.slice(0, at), {
				...r,
				engaged_ms: r.duration_ms
			}),
			seg: r.seg,
			segkey: k.slice(at + 1)
		});
	}
	const h = entryCols(rc.db.dialect);
	const segCols = SEGS.map((g) => `${SESSION_KEYS[g]} AS ${g}`).join(", ");
	const grouped = (from, keyExpr, cols, aggs) => ({
		sql: `WITH e AS (SELECT ${keyExpr} AS key, ${cols}s.sid AS sid, s.vkey AS vkey, ${segCols} ${from.sql}) ${["", ...SEGS].map((g) => `SELECT '${g}' AS seg, ${g || "''"} AS segkey, key, ${aggs} FROM e GROUP BY key${g ? `, ${g}` : ""}`).join(" UNION ALL ")}`,
		params: from.params
	});
	const split = (rows, dim) => {
		for (const r of rows.filter((x) => x.seg !== "")) pairs.push({
			...row(dim, String(r.key), r),
			seg: r.seg,
			segkey: String(r.segkey)
		});
		return rows.filter((x) => x.seg === "").map((r) => row(dim, String(r.key), r));
	};
	const pq = grouped(hitJoin(ctx, input, "pv"), h.path, `${h.dur} AS dur, `, "COUNT(*) AS pageviews, COUNT(DISTINCT vkey) AS visitors, COUNT(DISTINCT sid) AS sessions, SUM(dur) AS engaged_ms, COUNT(dur) AS hits");
	out.push(...foldTop(split(await rc.db.all(pq.sql, pq.params), "page"), TOP_N.page, "pageviews"));
	const eq = grouped(hitJoin(ctx, input, "ev", {
		sql: `${h.name} NOT LIKE '\\_%' ESCAPE '\\'`,
		params: []
	}), h.name, "", "COUNT(*) AS events, COUNT(DISTINCT sid) AS sessions, COUNT(DISTINCT vkey) AS visitors");
	out.push(...foldTop(split(await rc.db.all(eq.sql, eq.params), "event"), TOP_N.event, "events"));
	const cc = {
		db: rc.db,
		site: rc.site,
		from: day,
		to: day,
		goals: rc.goals
	};
	const goals = [];
	const goalParts = [];
	for (const g of rc.goals.filter((x) => x.active !== false)) {
		const where = and([sessionWhere(rc.site, day, day, TRUE), await goalPredicate(cc, g, "h")]);
		goalParts.push({
			sql: `SELECT CAST(? AS TEXT) AS goal, ${segCols}, COUNT(*) AS events, COUNT(DISTINCT s.sid) AS sessions FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql} GROUP BY ${SEGS.map((x) => SESSION_KEYS[x]).join(", ")}`,
			params: [g.name, ...where.params]
		});
	}
	const byGoal = /* @__PURE__ */ new Map();
	for (const group of goalGroups(goalParts)) for (const r of await rc.db.all(group.map((p) => p.sql).join(" UNION ALL "), group.flatMap((p) => p.params))) byGoal.set(String(r.goal), [...byGoal.get(String(r.goal)) ?? [], r]);
	for (const [name, rs] of byGoal) {
		const total = row("goal", name, {});
		const bySeg = /* @__PURE__ */ new Map();
		for (const r of rs) {
			addMetrics(total, row("goal", name, r));
			for (const seg of SEGS) {
				const p = bySeg.get(`${seg}\u0000${r[seg]}`) ?? {
					...row("goal", name, {}),
					seg,
					segkey: String(r[seg])
				};
				addMetrics(p, row("goal", name, r));
				bySeg.set(`${seg}\u0000${r[seg]}`, p);
			}
		}
		if (total.events > 0) goals.push(total);
		pairs.push(...bySeg.values());
	}
	out.push(...foldTop(goals, TOP_N.goal, "events"));
	return {
		rows: out,
		pairs: foldPairFamilies(rc, pairs, "sessions"),
		cube
	};
}
const cubeMetrics = (r) => Object.fromEntries(CUBE_METRICS.map((m) => [m, num(r[m])]));
/** Rows per upsert statement: each binds one JSON array, so the size stays small for D1. */
const ROWS_PER_INSERT = 500;
const REVENUE_COLS = [
	"dim",
	"key",
	"seg",
	"segkey",
	"cur",
	"orders",
	"revenue",
	"sessions"
];
const ROLLUP_COLS = [
	"dim",
	"key",
	"seg",
	"segkey",
	...METRICS
];
/**
* `INSERT ... SELECT` over one JSON array parameter of rows (`cols` in order, the first `text` of them text),
* as the changed-rows upsert: a row equal to the stored one costs 0 rows written.
*/
function summaryUpsertSql(dialect, table, cols, text, conflict, day = "?") {
	const sel = cols.map((c, i) => dialect === "postgres" ? i < text ? `value->>${i}` : `CAST(value->>${i} AS ${c === "revenue" ? "DOUBLE PRECISION" : "BIGINT"})` : `json_extract(value, '$[${i}]')`);
	const from = dialect === "postgres" ? "jsonb_array_elements(CAST(? AS jsonb))" : "json_each(?)";
	return `INSERT INTO ${table} (site, day, ${cols.join(", ")}) SELECT ?, ${day}, ${sel.join(", ")} FROM ${from} WHERE true ${upsertChanged(dialect, table, conflict, cols.slice(text))}`;
}
/**
* Delete the rows of one site and day whose key is not in the JSON array parameter (keys such as `dim|key`, or
* `dim|cur|key`): the single dimension rows (`seg = ''`), or with `segs` the pair rows of those segments.
* `dim IN (...)` and `seg` keep it key ranges of the primary key, so single and pair rows never touch each other.
*/
function summaryVanishedSql(dialect, table, dims, key, segs, range = {}) {
	const list = dialect === "postgres" ? "SELECT jsonb_array_elements_text(CAST(? AS jsonb))" : "SELECT value FROM json_each(?)";
	const quoted = (xs) => xs.map((d) => `'${d}'`).join(", ");
	const k = dialect === "postgres" ? `(${key}) COLLATE "C"` : `(${key})`;
	const bounds = `${range.lo ? ` AND ${k} >= ?` : ""}${range.hi ? ` AND ${k} < ?` : ""}`;
	return `DELETE FROM ${table} WHERE site = ? AND dim IN (${quoted(dims)}) AND ${segs ? `seg IN (${quoted(segs)})` : "seg = ''"} AND day = ? AND ${key} NOT IN (${list})${bounds}`;
}
/** Bytes of one vanished-keys list parameter; D1 refuses a value over 2 MB, so a longer list is split. */
const VANISHED_LIST_BYTES = 256e3;
const utf8 = new TextEncoder();
const byteOrder = (a, b) => {
	for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
	return a.length - b.length;
};
/**
* The vanished-keys delete of one family for a day's `keys`: one statement, or, when the list passes `max` bytes,
* one per part of the keys in byte order, each deleting inside its own key range (from its first key to the next
* part's first) the rows that are not in its part. The ranges cover every key, so the result is the single statement's.
*/
function vanishedStmts(dialect, table, dims, key, segs, site, day, keys, max = VANISHED_LIST_BYTES) {
	const list = JSON.stringify(keys);
	if (utf8.encode(list).length <= max) return [{
		sql: summaryVanishedSql(dialect, table, dims, key, segs),
		params: [
			site,
			day,
			list
		]
	}];
	const sorted = keys.map((k) => [k, utf8.encode(k)]).sort((a, b) => byteOrder(a[1], b[1]));
	const parts = [];
	let part = [];
	let size = 2;
	for (const [k] of sorted) {
		const b = utf8.encode(JSON.stringify(k)).length + 1;
		if (part.length && size + b > max) {
			parts.push(part);
			part = [];
			size = 2;
		}
		part.push(k);
		size += b;
	}
	parts.push(part);
	return parts.map((p, i) => {
		const range = {
			lo: i > 0,
			hi: i < parts.length - 1
		};
		return {
			sql: summaryVanishedSql(dialect, table, dims, key, segs, range),
			params: [
				site,
				day,
				JSON.stringify(p),
				...range.lo ? [p[0]] : [],
				...range.hi ? [parts[i + 1]?.[0]] : []
			]
		};
	});
}
/** `ca_cube` keeps its day as a yyyymmdd integer (bound through a cast, as every integer). */
const CUBE_COLS = [
	"channel",
	"country",
	"device",
	...CUBE_METRICS
];
const cubeUpsertSql = (d) => summaryUpsertSql(d, "ca_cube", CUBE_COLS, 3, [
	"site",
	"day",
	"channel",
	"country",
	"device"
], int(d, 0).sql);
/** Vanished cells of one site and day: the key range `(site, day)` of `ca_cube`, nothing else. */
const cubeVanishedSql = (d) => `DELETE FROM ca_cube WHERE site = ? AND day = ${int(d, 0).sql} AND channel || '${SEP}' || country || '${SEP}' || device NOT IN (${d === "postgres" ? "SELECT jsonb_array_elements_text(CAST(? AS jsonb))" : "SELECT value FROM json_each(?)"})`;
const ROLLUP_UPSERT = (d) => summaryUpsertSql(d, "ca_rollup", ROLLUP_COLS, 4, [
	"site",
	"dim",
	"seg",
	"day",
	"key",
	"segkey"
]);
const REVENUE_UPSERT = (d) => summaryUpsertSql(d, "ca_revenue_daily", REVENUE_COLS, 5, [
	"site",
	"dim",
	"seg",
	"day",
	"key",
	"segkey",
	"cur"
]);
/** Vanished keys of the pair rows, bounded to the pair dims and segments. */
const PAIR_KEY = "dim || '|' || seg || '|' || key || '|' || segkey";
const REVENUE_BASE_DIMS = [...new Set([
	"all",
	...Object.values(ROLLUP_DIM),
	"goal"
])];
/** Every dim of the single `ca_revenue_daily` rows: the order rows and their refund rows. */
const REVENUE_DIMS = [...REVENUE_BASE_DIMS, ...REVENUE_BASE_DIMS.map(refundDim)];
const REVENUE_PAIR_DIMS = [...PAIR_DIMS, ...PAIR_DIMS.map(refundDim)];
const FAMILY_DIMS = [...LINK_DIMS, ...JOURNEY_DIMS];
const FAMILY_SEGS = ["", ...SEGS];
/** Statements that store one day's summary rows of one site: changed rows only, then the keys that vanished. */
function writeDayStmts(dialect, site, day, s) {
	const stmts = [];
	const keys = (rows, cur) => rows.map((r) => r.seg ? `${r.dim}|${r.seg}|${r.key}|${r.segkey}` : `${r.dim}|${cur ? `${r.cur}|` : ""}${r.key}`);
	const vanished = (table, dims, key, segs, list) => stmts.push(...vanishedStmts(dialect, table, dims, key, segs, site, day, list));
	if (s.rows) {
		const all = [...s.rows, ...s.pairs ?? []];
		for (const part of chunk(all, ROWS_PER_INSERT)) stmts.push({
			sql: ROLLUP_UPSERT(dialect),
			params: [
				site,
				day,
				JSON.stringify(part.map((r) => [
					r.dim,
					r.key,
					"seg" in r ? r.seg : "",
					"segkey" in r ? r.segkey : "",
					...METRICS.map((m) => r[m])
				]))
			]
		});
		vanished("ca_rollup", ROLLUP_DIMS, "dim || '|' || key", void 0, keys(s.rows, false));
		if (s.pairs) vanished("ca_rollup", PAIR_DIMS, PAIR_KEY, SEGS, keys(s.pairs, false));
	}
	if (s.links && s.journeys) {
		const fam = [...s.links, ...s.journeys];
		for (const part of chunk(fam, ROWS_PER_INSERT)) stmts.push({
			sql: ROLLUP_UPSERT(dialect),
			params: [
				site,
				day,
				JSON.stringify(part.map((r) => [
					r.dim,
					r.key,
					r.seg,
					r.segkey,
					...METRICS.map((m) => r[m])
				]))
			]
		});
		vanished("ca_rollup", FAMILY_DIMS, PAIR_KEY, FAMILY_SEGS, fam.map((r) => `${r.dim}|${r.seg}|${r.key}|${r.segkey}`));
	}
	if (s.cube) {
		for (const part of chunk(s.cube, ROWS_PER_INSERT)) stmts.push({
			sql: cubeUpsertSql(dialect),
			params: [
				site,
				dayInt(day),
				JSON.stringify(part.map((r) => CUBE_COLS.map((c) => r[c])))
			]
		});
		stmts.push({
			sql: cubeVanishedSql(dialect),
			params: [
				site,
				dayInt(day),
				JSON.stringify(s.cube.map((r) => [
					r.channel,
					r.country,
					r.device
				].join(SEP)))
			]
		});
	}
	if (s.linkRevenue) {
		for (const part of chunk(s.linkRevenue, ROWS_PER_INSERT)) stmts.push({
			sql: REVENUE_UPSERT(dialect),
			params: [
				site,
				day,
				JSON.stringify(part.map((r) => [
					r.dim,
					r.key,
					r.seg,
					r.segkey,
					r.cur,
					r.orders,
					r.revenue,
					r.sessions
				]))
			]
		});
		vanished("ca_revenue_daily", LINK_DIMS, `${PAIR_KEY} || '|' || cur`, FAMILY_SEGS, s.linkRevenue.map((r) => `${r.dim}|${r.seg}|${r.key}|${r.segkey}|${r.cur}`));
	}
	if (s.revenue) {
		const own = s.revenue.filter((r) => r.day === day);
		const ownPairs = (s.revenuePairs ?? []).filter((r) => r.day === day);
		const ownCube = (s.revenueCube ?? []).filter((r) => r.day === day);
		for (const part of chunk([
			...own,
			...ownPairs,
			...ownCube
		], ROWS_PER_INSERT)) stmts.push({
			sql: REVENUE_UPSERT(dialect),
			params: [
				site,
				day,
				JSON.stringify(part.map((r) => [
					r.dim,
					r.key,
					"seg" in r ? r.seg : "",
					"segkey" in r ? r.segkey : "",
					r.cur,
					r.orders,
					r.revenue,
					r.sessions
				]))
			]
		});
		vanished("ca_revenue_daily", REVENUE_DIMS, "dim || '|' || cur || '|' || key", void 0, keys(own, true));
		if (s.revenuePairs) vanished("ca_revenue_daily", REVENUE_PAIR_DIMS, `${PAIR_KEY} || '|' || cur`, SEGS, ownPairs.map((r) => `${r.dim}|${r.seg}|${r.key}|${r.segkey}|${r.cur}`));
		if (s.revenueCube) vanished("ca_revenue_daily", ["all", refundDim("all")], "dim || '|' || segkey || '|' || cur", [CUBE_SEG], ownCube.map((r) => `${r.dim}|${r.segkey}|${r.cur}`));
	}
	return stmts;
}
/**
* Store the summary of one closed day (`ca_rollup`, `ca_cube` and `ca_revenue_daily`). Only rows that differ from the stored
* ones are written, so a day costs its row count once and a repeat costs 0 rows. Returns the summary row count.
*/
async function rollupDay(rc, day) {
	const s = await computeDay(rc, day);
	await rc.db.batch(writeDayStmts(rc.db.dialect, rc.site, day, s));
	return summaryRows(s);
}
/** Rows of a day's summary, pairs, links and journeys included. */
const summaryRows = (s) => s.rows.length + s.pairs.length + s.revenue.length + s.revenuePairs.length + s.links.length + s.linkRevenue.length + s.journeys.length + s.cube.length + s.revenueCube.length;
/**
* Statements `rollupDay` costs for a site with these goals, at least: the reads (sessions, pages, events, goals ten per statement,
* revenue, links, journeys), one upsert per table (a day under 500 rows per table) and two deletes per table, plus
* the link and journey upsert and delete of each table, and the cube's upsert, delete and revenue delete.
*/
const dayStatements = (goals) => 3 + Math.ceil(goals.filter((g) => g.active !== false).length / GOALS_PER_STATEMENT) + 1 + Math.ceil(eventGoals(goals).length / GOALS_PER_STATEMENT) + 2 + 6 + 4 + 3;
/**
* Rows of one link or journey family over a range, summed per key, segment value (and currency): the closed days
* from the stored rows in one key-range statement `(site, dim, seg, day)`, the open days (after the watermark, see
* `splitRange`) from the `links`, `linkRevenue` and `journeys` parts of `computeDay` (the shared open-day cache).
*/
async function readFamily(rc, from, to, f) {
	const rev = f.table === "ca_revenue_daily";
	const metrics = rev ? ["orders", "revenue"] : METRICS;
	const group = [
		"r.key",
		"r.segkey",
		...rev ? ["r.cur"] : []
	];
	const { stored, open } = await splitRange(rc, from, to);
	const out = /* @__PURE__ */ new Map();
	const add = (r) => {
		const id = `${String(r.key)}\u0000${String(r.segkey)}\u0000${rev ? String(r.cur) : ""}`;
		const o = out.get(id) ?? {
			key: String(r.key),
			segkey: String(r.segkey),
			...rev ? { cur: String(r.cur) } : {},
			...Object.fromEntries(metrics.map((m) => [m, 0]))
		};
		for (const m of metrics) o[m] = num(o[m]) + num(r[m]);
		out.set(id, o);
	};
	if (stored) {
		const extra = [...f.key !== void 0 ? ["r.key = ?"] : [], ...f.segkey !== void 0 ? ["r.segkey = ?"] : []];
		(await rc.db.all(`SELECT ${group.map((g) => `${g} AS ${g.slice(2)}`).join(", ")}, ${metrics.map((m) => `SUM(r.${m}) AS ${m}`).join(", ")} FROM ${f.table} r WHERE r.site = ? AND r.dim = ? AND r.seg = ? AND r.day BETWEEN ? AND ?${extra.map((x) => ` AND ${x}`).join("")} GROUP BY ${group.join(", ")}`, [
			rc.site,
			f.dim,
			f.seg,
			stored.from,
			stored.to,
			...f.key !== void 0 ? [f.key] : [],
			...f.segkey !== void 0 ? [f.segkey] : []
		])).forEach(add);
	}
	const isLink = LINK_DIMS.includes(f.dim);
	for (const day of open) {
		const d = await openDay(rc, rc.site, rc.goals, day);
		(isLink ? rev ? d.linkRevenue : d.links : d.journeys).filter((r) => r.dim === f.dim && r.seg === f.seg && (f.key === void 0 || r.key === f.key) && (f.segkey === void 0 || r.segkey === f.segkey)).forEach((r) => add({ ...r }));
	}
	return [...out.values()];
}
/** State key of a day being closed: `{ day, site }`, the last site whose summary of `day` is stored. */
const KV_ROLLUP_CURSOR = "rollup:cursor";
/** KV calls of a tick (watermark and cursor, read and write), kept out of the statement budget. */
const KV_CALLS = 4;
/** Skip scan of the sites of `table` as CTE `name` (the form of `siteScan` in storage.ts, which imports this module). */
const scan = (table, name) => `${name}(site) AS (SELECT MIN(site) FROM ${table} UNION ALL SELECT (SELECT MIN(site) FROM ${table} WHERE site > ${name}.site) FROM ${name} WHERE ${name}.site IS NOT NULL)`;
/** `WITH RECURSIVE` sources `s` (sites of `ca_sessions`) and `e` (sites of `ca_events`), 1 row read per site. */
const SITES_CTE = `WITH RECURSIVE ${scan("ca_sessions", "s")}, ${scan("ca_events", "e")}`;
/** First day with a visit or an event of any site, or null (two key-range probes per site). */
async function firstDay(db) {
	const [r] = await db.all(`${SITES_CTE} SELECT (SELECT MIN((SELECT MIN(day) FROM ca_sessions v WHERE v.site = s.site)) FROM s WHERE s.site IS NOT NULL) AS a, (SELECT MIN((SELECT MIN(day) FROM ca_events o WHERE o.site = e.site)) FROM e WHERE e.site IS NOT NULL) AS b`, []);
	const days = [r?.a, r?.b].filter((d) => d != null).map(isoDay);
	return days.length ? days.sort()[0] : null;
}
/** Sites after `after` with a visit or an order on `day`: the sites of this database, by skip scan and key probes. */
async function sitesOfDay(db, day, after = "") {
	return (await db.all(`${SITES_CTE} SELECT site FROM (SELECT site FROM s UNION SELECT site FROM e) x WHERE site IS NOT NULL AND site > ? AND (EXISTS (SELECT 1 FROM ca_sessions v WHERE v.site = x.site AND v.day = ?) OR EXISTS (SELECT 1 FROM ca_events o WHERE o.site = x.site AND o.day = ? AND o.val IS NOT NULL)) ORDER BY site`, [
		after,
		visitDayKey(day),
		dayInt(day)
	])).map((r) => r.site);
}
/**
* Cron tick, the closed-day writer: stores the summary of every closed day after the watermark, oldest first,
* site by site, until the statement budget of the capacity profile is spent. Open days (today, and yesterday until
* it closes) are never stored. Resumable (`KV_ROLLUP_CURSOR`, saved even when a statement fails) and idempotent
* (changed-rows upserts), so a repeated or failed run costs no extra rows. An idle tick runs no statement and
* writes nothing. The watermark (one per database, days in `siteTimezone`) moves only when every site holds the day:
* retention deletes detailed days up to it.
*/
/** Statements a run spends before its first site-day: the first-day probe and the sites of the day. */
const FIRST_DAY_FIXED = 2;
const tooBig = (site, day, need, limit) => /* @__PURE__ */ new Error(`rollup: storing ${site} on ${day} needs ${need} requests, more than the ${limit} one run of this capacity profile may make; fewer active goals or a larger profile lets it close`);
async function runRollup(rc, kv, now, o = {}) {
	const last = lastClosedDay(now, rc.settings.siteTimezone);
	const c = counted(rc.db);
	const whole = (PROFILES[rc.settings.capacityProfile ?? "standard"] ?? PROFILES.standard).requests - KV_CALLS;
	const limit = (o.requests ?? whole + KV_CALLS) - KV_CALLS;
	const wm = await kv.get(KV_WATERMARK);
	const cursor = await kv.get(KV_ROLLUP_CURSOR);
	const out = {
		days: [],
		sites: [],
		rows: 0,
		statements: 0,
		watermark: wm,
		done: false
	};
	let day = wm ? addDays(wm, 1) : null;
	let after = "";
	const goals = /* @__PURE__ */ new Map();
	try {
		if (!wm) day = await firstDay(c.db);
		if (day && cursor?.day === day) after = cursor.site;
		let loads = 0;
		const used = () => c.n() + loads;
		days: while (day && day <= last) {
			const sites = await sitesOfDay(c.db, day, after);
			out.days.push(day);
			for (const site of sites) {
				let g = goals.get(site);
				if (!g) {
					loads++;
					g = await rc.goals(site);
					goals.set(site, g);
				}
				const fresh = !out.sites.length && c.n() <= FIRST_DAY_FIXED;
				const cap = fresh ? Math.max(limit, whole) : limit;
				if (used() + dayStatements(g) > cap) {
					if (fresh) throw tooBig(site, day, used() + dayStatements(g), cap);
					break days;
				}
				const sum = await computeDay({
					db: c.db,
					site,
					settings: rc.settings,
					goals: g
				}, day);
				const stmts = writeDayStmts(rc.db.dialect, site, day, sum);
				if (used() + stmts.length > cap) {
					if (fresh) throw tooBig(site, day, used() + stmts.length, cap);
					break days;
				}
				await c.db.batch(stmts);
				out.rows += summaryRows(sum);
				out.sites.push(`${site}@${day}`);
				after = site;
			}
			out.watermark = day;
			day = addDays(day, 1);
			after = "";
			if (used() + 1 > limit) break;
		}
		if (!day || day > last) {
			out.done = true;
			if (!out.watermark || out.watermark < last) out.watermark = last;
		}
	} finally {
		out.statements = c.n();
		if (out.watermark && out.watermark !== wm) await kv.set(KV_WATERMARK, out.watermark);
		const next = after ? {
			day,
			site: after
		} : out.days.length || out.done ? null : cursor;
		if (next && (next.day !== cursor?.day || next.site !== cursor?.site)) await kv.set(KV_ROLLUP_CURSOR, next);
		else if (!next && cursor) await kv.delete(KV_ROLLUP_CURSOR);
	}
	return out;
}
const REVENUE_ROLLUP_MAX_SITES_PER_TICK = 3;
const REVENUE_RECONCILE_DAYS_PER_TICK = 2;
/** Statements one site may cost in one `revenue` run: the reconcile and two recomputed days of a site without goals, by `dayStatements` (spy-tested). */
const REVENUE_STATEMENTS_PER_SITE = 39;
const KV_REVENUE_CURSOR = "revenue:cursor";
/** Requests of a `revenue` run besides the sites: the probe, the watermark and cursor reads, the cursor write. */
const REVENUE_FIXED_REQUESTS = 4;
/** Sites with an order in the raw window or a revenue summary row there: skip scans of both tables, then one key range per site. */
const REVENUE_PROBE = `WITH RECURSIVE e(site) AS (SELECT MIN(site) FROM ca_events UNION ALL SELECT (SELECT MIN(site) FROM ca_events WHERE site > e.site) FROM e WHERE e.site IS NOT NULL),
r(site) AS (SELECT MIN(site) FROM ca_revenue_daily UNION ALL SELECT (SELECT MIN(site) FROM ca_revenue_daily WHERE site > r.site) FROM r WHERE r.site IS NOT NULL)
SELECT site FROM e WHERE site IS NOT NULL AND EXISTS (SELECT 1 FROM ca_events x WHERE x.site = e.site AND x.day >= ? AND x.val IS NOT NULL)
UNION SELECT site FROM r WHERE site IS NOT NULL AND EXISTS (SELECT 1 FROM ca_revenue_daily x WHERE x.site = r.site AND x.dim = 'all' AND x.seg = '' AND x.day >= ?)
ORDER BY site`;
/** Non-goal dims of `ca_revenue_daily` with their key expressions over `h` and `s` (`all` has none). */
const REVENUE_ROLLUP_KEYS = [["all", null], ...Object.entries(REVENUE_KEYS).map(([d, k]) => [ROLLUP_DIM[d], k])];
const REVENUE_TOP_N = (dim) => dim === "page" || dim === "entry" ? 500 : 200;
/** Keep the top N keys per day, dim and currency by orders; fold the rest into `(other)`. */
function foldRevenue(rows) {
	const groups = /* @__PURE__ */ new Map();
	for (const r of rows) {
		const g = `${r.day}\u0000${r.dim}\u0000${r.cur}`;
		const list = groups.get(g);
		if (list) list.push(r);
		else groups.set(g, [r]);
	}
	const out = [];
	for (const list of groups.values()) {
		const n = REVENUE_TOP_N(list[0]?.dim ?? "");
		const sorted = list.sort((a, b) => b.orders - a.orders || (a.key < b.key ? -1 : 1));
		if (sorted.length <= n) {
			out.push(...sorted);
			continue;
		}
		const keep = sorted.slice(0, n - 1).filter((r) => r.key !== OTHER);
		const rest = sorted.filter((r) => !keep.includes(r));
		const other = {
			...rest[0],
			key: OTHER,
			orders: 0,
			revenue: 0,
			sessions: 0,
			refunds: 0
		};
		for (const r of rest) addRevenue(other, r);
		out.push(...keep, other);
	}
	return out;
}
/** Revenue rows of the given days (single dimension only). */
const computeRevenueDays = async (rc, days) => (await computeRevenue(rc, days)).revenue;
/**
* Revenue rows and revenue pairs of the given days: one `UNION ALL` for the nine non-goal dims, one statement per
* ten event goals. Each statement groups by the three segments too; an order and its visit have one value per
* segment, so orders, revenue and distinct visits add up across those groups into the single and the pair rows.
*/
async function computeRevenue(rc, days) {
	const daysIn = inList(rc.db.dialect, "h.day", days.map(dayInt), true);
	const base = (extra = TRUE) => {
		const w = and([
			{
				sql: "h.site = ? AND h.val IS NOT NULL",
				params: [rc.site]
			},
			daysIn,
			extra
		]);
		return {
			sql: `FROM ca_events h LEFT JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid WHERE ${w.sql}`,
			params: w.params
		};
	};
	const segKeys = SEGS.map((g) => REVENUE_KEYS[g]);
	const agg = `${segKeys.map((k, i) => `${k} AS ${SEGS[i]}`).join(", ")}, ${ORDER_SUMS}`;
	const by = `h.day, h.cur, ${segKeys.join(", ")}`;
	const parts = REVENUE_ROLLUP_KEYS.map(([dim, k]) => {
		const b = base();
		return {
			sql: `SELECT '${dim}' AS dim, ${k ?? "''"} AS key, h.day AS day, h.cur AS cur, ${agg} ${b.sql} GROUP BY ${k ? `${k}, ` : ""}${by}`,
			params: b.params
		};
	});
	const rows = await rc.db.all(parts.map((p) => p.sql).join(" UNION ALL "), parts.flatMap((p) => p.params));
	const cc = {
		db: rc.db,
		site: rc.site,
		from: days[0],
		to: days.at(-1),
		goals: rc.goals
	};
	for (const group of chunk(eventGoals(rc.goals), GOALS_PER_STATEMENT)) {
		const gp = [];
		for (const g of group) {
			const b = base(await goalPredicate(cc, g, "h", "event"));
			gp.push({
				sql: `SELECT 'goal' AS dim, CAST(? AS TEXT) AS key, h.day AS day, h.cur AS cur, ${agg} ${b.sql} GROUP BY ${by}`,
				params: [g.name, ...b.params]
			});
		}
		rows.push(...await rc.db.all(gp.map((p) => p.sql).join(" UNION ALL "), gp.flatMap((p) => p.params)));
	}
	const single = /* @__PURE__ */ new Map();
	const pairs = /* @__PURE__ */ new Map();
	const cube = /* @__PURE__ */ new Map();
	const add = (m, id, r) => {
		const e = m.get(id);
		if (!e) m.set(id, r);
		else addRevenue(e, r);
	};
	for (const r of rows.filter((x) => (num(x.orders) > 0 || num(x.refunds) > 0) && typeof x.cur === "string")) {
		const v = {
			day: isoDay(r.day),
			dim: String(r.dim),
			key: String(r.key),
			cur: String(r.cur),
			orders: num(r.orders),
			revenue: num(r.revenue),
			sessions: num(r.sessions),
			refunds: num(r.refunds)
		};
		add(single, [
			v.day,
			v.dim,
			v.cur,
			v.key
		].join("\0"), { ...v });
		if (v.dim in PAIR_WEIGHTS) for (const seg of SEGS) add(pairs, [
			v.day,
			v.dim,
			seg,
			v.cur,
			v.key,
			r[seg]
		].join("\0"), {
			...v,
			seg,
			segkey: String(r[seg])
		});
		if (v.dim === "all") {
			const segkey = SEGS.map((g) => String(r[g])).join(SEP);
			add(cube, [
				v.day,
				v.cur,
				segkey
			].join("\0"), {
				...v,
				seg: CUBE_SEG,
				segkey
			});
		}
	}
	const cubeCap = CUBE_CAP[rc.settings.capacityProfile ?? "standard"];
	const cells = foldGroups([...cube.values()], (r) => `${r.day}\u0000${r.cur}`, (g) => foldCube(g, cubeCap, (r) => r.orders, addRevenue));
	return {
		revenue: refundRows(foldRevenue([...single.values()])),
		pairs: refundRows(foldRevenuePairs(rc, [...pairs.values()])),
		cube: refundRows(cells)
	};
}
/**
* The stored form of folded rows: each row with orders, plus one `refund.<dim>` row (same seg, key, segkey and
* currency; `revenue` the refunded amount, `orders` and `sessions` 0) for each row with refunds. A refund counts on
* its own day with the original order's attribution, so a day can hold refunds of a key without orders.
*/
function refundRows(rows) {
	const out = rows.filter((r) => r.orders > 0);
	for (const r of rows) if ((r.refunds ?? 0) > 0) out.push({
		...r,
		dim: refundDim(r.dim),
		orders: 0,
		revenue: r.refunds,
		sessions: 0,
		refunds: 0
	});
	return out;
}
/** Fold every revenue pair family (day, dim, segment and currency) to the cap of its dim, ranked by orders. */
function foldRevenuePairs(rc, rows) {
	const groups = /* @__PURE__ */ new Map();
	for (const r of rows) {
		const g = `${r.day}\u0000${r.dim}\u0000${r.seg}\u0000${r.cur}`;
		const list = groups.get(g);
		if (list) list.push(r);
		else groups.set(g, [r]);
	}
	return [...groups.values()].flatMap((list) => foldPairs(list, pairCap(rc.settings.capacityProfile, list[0]?.dim), (r) => r.orders, addRevenue));
}
const addRevenue = (into, r) => {
	into.orders += r.orders;
	into.revenue += r.revenue;
	into.sessions += r.sessions;
	into.refunds = (into.refunds ?? 0) + (r.refunds ?? 0);
};
/** Store the `ca_revenue_daily` rows of the given days (changed rows only, vanished keys deleted). */
async function rollupRevenueDays(rc, days) {
	const r = await computeRevenue(rc, days);
	await rc.db.batch(days.flatMap((d) => writeDayStmts(rc.db.dialect, rc.site, d, {
		revenue: r.revenue,
		revenuePairs: r.pairs,
		revenueCube: r.cube
	})));
	return r.revenue.length + r.pairs.length + r.cube.length;
}
const rollupRevenue = (rc, day) => rollupRevenueDays(rc, [day]);
/** Wraps a database to count statements (batches count each statement). */
/** `db` with every statement counted (a batch counts each). */
function counted(db) {
	let n = 0;
	return {
		n: () => n,
		db: {
			dialect: db.dialect,
			run: (s, p) => (n++, db.run(s, p)),
			all: (s, p) => (n++, db.all(s, p)),
			batch: (st) => (n += st.length, db.batch(st))
		}
	};
}
/**
* Days of the reconcile window whose raw totals per currency differ from the `all` rows of
* `ca_revenue_daily` (late agent events, corrections, voids and refunds), or whose orders without a counted visit
* differ from the stored channel `(not set)` row (an agent call that attaches a visit to an order stored without one
* changes the attribution, not the totals). An order whose visit is gone (retention) is counted apart: the stored row
* may match with or without it, as the day was stored before or after the visit went. One statement.
*/
async function revenueDrift(db, site, from, to) {
	if (from > to) return [];
	const rows = await db.all(`SELECT 'r' AS src, CAST(h.day AS TEXT) AS day, h.cur AS cur, ${ORDER_SUMS}, SUM(CASE WHEN h.val >= 0 AND (h.sid IS NULL OR s.sid IS NOT NULL) AND ${REVENUE_KEYS.channel} = ${NOT_SET} THEN 1 ELSE 0 END) AS unset, SUM(CASE WHEN h.val >= 0 AND h.sid IS NOT NULL AND s.sid IS NULL THEN 1 ELSE 0 END) AS orphans FROM ca_events h LEFT JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid WHERE h.site = ? AND h.day BETWEEN ? AND ? AND h.val IS NOT NULL GROUP BY h.day, h.cur
UNION ALL SELECT CASE WHEN dim = 'all' THEN 'd' WHEN dim = 'channel' THEN 'u' ELSE 'f' END AS src, day, cur, orders, revenue, 0 AS refunds, 0 AS sessions, 0 AS unset, 0 AS orphans FROM ca_revenue_daily WHERE site = ? AND (dim IN ('all', '${refundDim("all")}') OR (dim = 'channel' AND key = ${NOT_SET})) AND seg = '' AND day BETWEEN ? AND ?`, [
		site,
		dayInt(from),
		dayInt(to),
		site,
		from,
		to
	]);
	const seen = /* @__PURE__ */ new Map();
	for (const r of rows) {
		const k = `${isoDay(r.day)}\u0000${String(r.cur)}`;
		const e = seen.get(k) ?? {
			r: [
				0,
				0,
				0,
				0
			],
			d: [
				0,
				0,
				0,
				0
			],
			orphans: 0
		};
		const m = (v) => roundMinor(num(v), String(r.cur));
		if (r.src === "r") e.r = [
			num(r.orders),
			m(r.revenue),
			m(r.refunds),
			num(r.unset)
		], e.orphans = num(r.orphans);
		else if (r.src === "d") e.d[0] = num(r.orders), e.d[1] = m(r.revenue);
		else if (r.src === "u") e.d[3] = num(r.orders);
		else e.d[2] = m(r.revenue);
		seen.set(k, e);
	}
	const days = /* @__PURE__ */ new Set();
	for (const [k, e] of seen) if (e.r.some((v, i) => v !== e.d[i] && !(i === 3 && v + e.orphans === e.d[3]))) days.add(k.split("\0")[0]);
	return [...days].sort();
}
/**
* The `revenue` cron task: for at most 3 sites with revenue (KV cursor), reconcile the closed days of
* the raw window (from the day after `rawFrom`, the caller's `rawFromDay`, up to the rollup watermark) and store
* again at most two differing days with `rollupDay` (changed rows only), within the statements per site. Open days
* are never stored; late orders of a closed day (agent events, corrections, voids) are what this catches.
*/
async function runRevenue(rc, kv, now, rawFrom, o = {}) {
	const yesterday = addDays(dayInZone(now, rc.settings.siteTimezone), -1);
	const wm = await kv.get(KV_WATERMARK);
	const to = wm && wm < addDays(yesterday, -1) ? wm : addDays(yesterday, -1);
	const all = (await rc.db.all(REVENUE_PROBE, [dayInt(rawFrom), rawFrom])).map((r) => r.site);
	const budget = (o.requests ?? PROFILES[rc.settings.capacityProfile ?? "standard"].requests) - REVENUE_FIXED_REQUESTS;
	let used = 0;
	const cursor = await kv.get(KV_REVENUE_CURSOR);
	const after = all.filter((s) => !cursor || s > cursor);
	const pick = (after.length ? after : all).slice(0, REVENUE_ROLLUP_MAX_SITES_PER_TICK);
	const out = {
		sites: [],
		cursor: null
	};
	for (const site of pick) {
		const cap = Math.min(REVENUE_STATEMENTS_PER_SITE, budget - used - 1);
		if (cap < 1) break;
		const c = counted(rc.db);
		const goals = await rc.goals(site);
		const sc = {
			db: c.db,
			site,
			settings: rc.settings,
			goals
		};
		const drift = wm ? (await revenueDrift(c.db, site, addDays(rawFrom, 1), to)).slice(0, REVENUE_RECONCILE_DAYS_PER_TICK) : [];
		const recomputed = [];
		for (const d of drift) {
			if (c.n() + dayStatements(goals) > cap) break;
			const stmts = writeDayStmts(rc.db.dialect, site, d, await computeDay(sc, d));
			if (c.n() + stmts.length > cap) break;
			await c.db.batch(stmts);
			recomputed.push(d);
		}
		used += c.n() + 1;
		out.sites.push({
			site,
			statements: c.n(),
			recomputed,
			pending: drift.length - recomputed.length
		});
	}
	const last = out.sites.at(-1)?.site;
	out.cursor = last && last !== all.at(-1) ? last : null;
	if (out.cursor) await kv.set(KV_REVENUE_CURSOR, out.cursor);
	else await kv.delete(KV_REVENUE_CURSOR);
	return out;
}

//#endregion
export { planRows as $, samePeriodLastYear as $n, budgetMb as $t, currencyList as A, docSet as An, validateFilters as At, bucketSeries as B, visitDayKey as Bn, OPS as Bt, journeyPaths as C, ddl as Cn, compileSearch as Ct, RECENT_ORDERS_CAP as D, docObject as Dn, entryProp as Dt, journeysUnavailable as E, docJson as En, entryCols as Et, revenueBreakdown as F, paramRows as Fn, GoalSchema as Ft, FILTER_DIMS as G, dayInZone as Gn, REVENUE_VALUE_RE as Gt, timeseries as H, chunk as Hn, QuerySchema as Ht, revenueOrders as I, q as In, LINK_BY as It, clearOpenDays as J, hourInZone as Jn, DEFAULT_SETTINGS as Jt, SEGMENTS$1 as K, daysBetween as Kn, SEARCH_DIMS as Kt, revenuePlan as L, raw as Ln, MAX_FILTERS as Lt, hasRevenue as M, isoDay as Mn, FUNNEL_MODES as Mt, metaOf as N, join as Nn, FilterSchema as Nt, REVENUE_REPORTS as O, docPut as On, goalPredicate as Ot, revenue as P, likeEscape as Pn, FunnelStepsSchema as Pt, planFilters as Q, saltDay as Qn, SUMMARY_SHARE as Qt, revenueSeries as R, upsertChanged as Rn, NEGATED as Rt, journeyNext as S, dayInt as Sn, and as St, journeysFromSummary as T, docGet as Tn, entriesOf as Tt, weekStart as U, ident as Un, REVENUE_BREAKDOWN_DIMS as Ut, resolveGranularity as V, MAX_PARAMS as Vn, PROP_KEY_RE as Vt, CUBE_SEG as W, addDays as Wn, REVENUE_DIMS$1 as Wt, matchKey as X, previousPeriod as Xn, PROFILES as Xt, clearScanCache as Y, lastClosedDay as Yn, HOST_FORM_POINTER as Yt, openDay as Z, saltBoundary as Zn, SITE_SEARCH_MAX_PARAMS as Zt, linksPlan as _, normalizeCurrency as _n, sessionTotals as _t, OTHER as a, parseSiteSearchParams as an, ORDER_SUMS as at, JOURNEY_MIN_SESSIONS as b, SID_SLICES as bn, QueryError as bt, counted as c, parseLinkRules as cn, hitJoin as ct, rollup_exports as d, validateSafeRegex as dn, num as dt, budgetRange as en, zonedToEpoch as er, readSummary as et, runRevenue as f, MAX_CURRENCIES_LISTED as fn, ratio as ft, linksFromSummary as g, isCurrency as gn, sessionMetrics as gt, links as h, formatAmount as hn, sessionBreakdown as ht, KV_WATERMARK as i, normalizeSettings as in, DURATION_MS as it, currencyOf as j, field as jn, DIM_NAMES as jt, WITH_REVENUE as k, docRead as kn, inList as kt, dayStatements as l, publicNames as ln, keysIn as lt, sitesOfDay as m, REVENUE_MAX_VALUE as mn, round as mt, KV_REVENUE_CURSOR as n, cachedSettings as nn, storedSessions as nt, SEGS as o, settingsSchema as on, annotationsIn as ot, runRollup as p, REVENUE_MAX_OID as pn, refundDim as pt, behindNotice as q, eachDay as qn, TRAFFIC_DIMS as qt, KV_ROLLUP_CURSOR as r, d1CapMb as rn, storedThrough as rt, SUMMARY_DIMS as s, storageBudget as sn, goalGroups as st, CUBE_CAP as t, budgetWarning as tn, splitRange as tt, rollupDay as u, compileSafeRegex as un, liveVisits as ut, JOURNEY_MAX_RANGE_DAYS as v, roundMinor as vn, sessionWhere as vt, journeyPrev as w, deleteDaySlice as wn, compileTraffic as wt, JOURNEY_SESSION_CAP as x, VISIT_DAY_TYPE as xn, TRUE as xt, JOURNEY_MAX_ROWS as y, LIKE_ESCAPE as yn, visitDays as yt, withRevenue as z, upsertClause as zn, NUM_OPS as zt };