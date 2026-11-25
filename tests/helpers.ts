import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { KvLike } from "../src/core/crypto.js";
import { type Db, fromKysely } from "../src/db/adapter.js";
import { assertParams, type Param } from "../src/db/sql.js";
import { dayInZone } from "../src/core/time.js";
import { dayInt } from "../src/db/dialect.js";
import { assertColumns, assertD1Limits, type D1LimitOptions } from "./d1-limits.js";

/** Map-backed KV with compare-and-set semantics like the host `ctx.kv`. */
export class MemoryKv implements KvLike {
	/** Stored as JSON text, like the options table: a value mutated after get or set is not saved without a set. */
	data = new Map<string, string>();
	async get<T>(key: string) {
		const v = this.data.get(key);
		return (v === undefined ? null : JSON.parse(v)) as T | null;
	}
	async set(key: string, value: unknown) {
		this.data.set(key, JSON.stringify(value ?? null));
	}
	async delete(key: string) {
		return this.data.delete(key);
	}
	async list(prefix = "") {
		return [...this.data].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: JSON.parse(value) as unknown }));
	}
	async compareAndSet(key: string, expected: string | null, value: unknown) {
		if (expected === null && this.data.has(key)) return { applied: false };
		this.data.set(key, JSON.stringify(value ?? null));
		return { applied: true };
	}
}

/** The `json_*` writers return TEXT even on a JSONB input: one of them turns the JSONB document back into text. */
const TEXT_JSON_WRITER = /\bjson_(set|patch|insert|replace|remove)\s*\(/i;

export type TestDbOptions = D1LimitOptions;

/**
 * D1 limits (placeholders = params, at most 100; at most 5 terms per compound SELECT; LIKE patterns of at most 50 bytes;
 * at most 100 KB of SQL; results checked for at most 100 columns) and the JSONB write rule, checked on every statement.
 */
function check(sql: string, params?: readonly unknown[], o: TestDbOptions = {}): void {
	assertParams(sql, params);
	assertD1Limits(sql, params, o);
	if (TEXT_JSON_WRITER.test(sql)) throw new Error(`text JSON writer in a statement, use the jsonb_* helpers of dialect.ts: ${sql}`);
}

/** In-memory SQLite. Every statement is checked against the D1 limits and the JSONB write rule. */
export function memoryDb(o: TestDbOptions = {}): { db: Db; kysely: Kysely<any>; raw: Database.Database } {
	const raw = new Database(":memory:");
	const kysely = new Kysely<any>({ dialect: new SqliteDialect({ database: raw }) });
	const inner = fromKysely(kysely);
	const db: Db = {
		dialect: inner.dialect,
		run: async (sql, params) => (check(sql, params, o), inner.run(sql, params)),
		all: async <T>(sql: string, params?: Param[]) => (check(sql, params, o), assertColumns(await inner.all<T>(sql, params))),
		batch: async (stmts) => (stmts.forEach((s) => check(s.sql, s.params, o)), inner.batch(stmts)),
	};
	return { db, kysely, raw };
}

// ── rows meter ────────────────────────────────────────────────────────────────

export interface MeterStats {
	statements: number;
	rowsWritten: number;
	rowsRead: number;
}

export interface MeterEntry {
	sql: string;
	kind: "read" | "write" | "ddl";
	written: number;
	read: number;
}

export interface Meter {
	db: Db;
	stats: MeterStats;
	log: MeterEntry[];
	/** Zero the counters and the log (after the schema setup, before the measured part). */
	reset(): void;
}

/*
 * RULE TABLE: D1 rows_written and rows_read per statement, from measurements on production D1. The writes are exact;
 * the reads are a lower bound (D1 also counts the rows a statement visits without changing them).
 *
 * | Statement                                   | rows_written                                     | rows_read             |
 * | INSERT of a new row                         | 1 + 1 per index that holds the row: every index,  | 0                     |
 * |                                             | the primary key index of a rowid table with a     |                       |
 * |                                             | non-integer key, a partial index only when the    |                       |
 * |                                             | row matches its WHERE. WITHOUT ROWID: the key is  |                       |
 * |                                             | the table. Session insert 5 [34, 278], hit 4      |                       |
 * |                                             | [35, 280], revenue hit 5 [36, 285], document      |                       |
 * |                                             | insert 2 [45, 308], ca_events 2 [53, 318]         |                       |
 * | UPDATE of a row (also the DO UPDATE branch  | 1 + 1 per index whose columns change ("Indexes    | 1 per row             |
 * | of an upsert)                               | will add an additional written row when writes    |                       |
 * |                                             | include the indexed column" [184]). Continue 3    |                       |
 * |                                             | [37, 282], engagement 1 + 1 [38-39, 287-288],     |                       |
 * |                                             | alias update 1 [40, 290], S1 1 [46, 311], S2 1    |                       |
 * |                                             | [49, 314], S3 1 [52, 317], S6 1 [56, 324], drops  |                       |
 * |                                             | 1 per reason [57, 325-326]                        |                       |
 * | Replay: UPDATE that leaves the data as is   | 1 (still billed) [47, 50, 312, 315]               | 1 per row             |
 * | UPDATE or DELETE matching no row            | 0 [48, 51, 313, 316]                              | 1 (the probe)         |
 * | Upsert, conflict, DO NOTHING                | 0 [53, 279, 319]                                  | 0                     |
 * | Upsert, conflict, DO UPDATE WHERE false     | 0 [59, 296, 300, 327]                             | 0 (D1: 1 per row)     |
 * | Upsert, conflict, DO UPDATE without WHERE   | 1 per row, also when unchanged [60, 301]          | 1 per row             |
 * | DELETE                                      | 1 per row, index entries not counted [43, 61,     | 1 per row (+1 probe   |
 * |                                             | 302, 383, 385]                                    | when none)            |
 * | SELECT                                      | 0                                                 | rows returned         |
 * | CREATE TABLE                                | 2, 3 for a rowid table with a primary key index   | 1                     |
 * |                                             | [A.2: 344, 369-373]; 0 if it exists              |                       |
 * | CREATE INDEX                                | 1 [345, 371]; 0 if it exists                     | 2                     |
 * | DROP TABLE                                  | 0, 1 when the table had an index [63, 305, 336,   | 27, 59 with an index  |
 * |                                             | 367-368]                                          |                       |
 *
 * Writes are counted by temporary triggers on every table, so they see the real old and new values.
 */

function columnsOf(raw: Database.Database, table: string): string[] {
	return (raw.prepare("SELECT name FROM pragma_table_info(?)").all(table) as { name: string }[]).map((c) => c.name);
}

function userTables(raw: Database.Database): string[] {
	return (raw.prepare("SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
}

/** Indexes that hold a row of `table` besides the table itself: every index, except the primary key of a WITHOUT ROWID table. */
function indexesOf(raw: Database.Database, table: string): Array<{ cols: string[]; where: string | null }> {
	const wr = (raw.prepare("SELECT wr FROM pragma_table_list WHERE schema = 'main' AND name = ?").get(table) as { wr: number }).wr;
	const list = raw.prepare("SELECT name, origin, partial FROM pragma_index_list(?)").all(table) as { name: string; origin: string; partial: number }[];
	return list
		.filter((i) => !(wr && i.origin === "pk"))
		.map((i) => {
			const cols = (raw.prepare("SELECT name FROM pragma_index_info(?)").all(i.name) as { name: string | null }[]).map((c) => c.name ?? "");
			const sql = i.partial ? ((raw.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(i.name) as { sql: string }).sql) : "";
			return { cols, where: i.partial ? sql.slice(sql.lastIndexOf(" WHERE ") + 7) : null };
		});
}

function installTriggers(raw: Database.Database): void {
	raw.exec("CREATE TEMP TABLE IF NOT EXISTS _meter (w INTEGER NOT NULL, r INTEGER NOT NULL)");
	if (!raw.prepare("SELECT 1 FROM temp._meter").get()) raw.exec("INSERT INTO temp._meter VALUES (0, 0)");
	for (const t of userTables(raw)) {
		const cols = columnsOf(raw, t);
		const on = (pred: string, row: "NEW" | "OLD") => cols.reduce((p, c) => p.replace(new RegExp(`\\b${c}\\b`, "g"), `${row}.${c}`), pred);
		const idx = indexesOf(raw, t);
		const ins = idx.map((i) => (i.where ? `(CASE WHEN ${on(i.where, "NEW")} THEN 1 ELSE 0 END)` : "1"));
		const upd = idx.map((i) => {
			const changed = i.cols.map((c) => `NEW.${c} IS NOT OLD.${c}`).join(" OR ");
			const held = i.where ? ` AND ((${on(i.where, "NEW")}) OR (${on(i.where, "OLD")}))` : "";
			return `(CASE WHEN (${changed})${held} THEN 1 ELSE 0 END)`;
		});
		raw.exec(`
			DROP TRIGGER IF EXISTS temp._m_${t}_i; DROP TRIGGER IF EXISTS temp._m_${t}_u; DROP TRIGGER IF EXISTS temp._m_${t}_d;
			CREATE TEMP TRIGGER _m_${t}_i AFTER INSERT ON main.${t} BEGIN UPDATE temp._meter SET w = w + ${["1", ...ins].join(" + ")}; END;
			CREATE TEMP TRIGGER _m_${t}_u AFTER UPDATE ON main.${t} BEGIN UPDATE temp._meter SET w = w + ${["1", ...upd].join(" + ")}, r = r + 1; END;
			CREATE TEMP TRIGGER _m_${t}_d AFTER DELETE ON main.${t} BEGIN UPDATE temp._meter SET w = w + 1, r = r + 1; END;`);
	}
}

const DDL_RE = /^\s*(CREATE\s+(?:UNIQUE\s+)?INDEX|CREATE\s+TABLE|DROP\s+TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(\w+)(?:\s+ON\s+(\w+))?/i;

/** D1 cost of a DDL statement, judged on the schema before it runs (rule table above). */
function ddlCost(raw: Database.Database, sql: string): { written: number; read: number } {
	const m = DDL_RE.exec(sql);
	if (!m) return { written: 0, read: 0 };
	const verb = (m[1] as string).toUpperCase().replace(/\s+/g, " ");
	const name = m[2] as string;
	const exists = !!raw.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(name);
	if (verb.endsWith("INDEX")) return exists ? { written: 0, read: 0 } : { written: 1, read: 2 };
	if (verb === "CREATE TABLE") return exists ? { written: 0, read: 0 } : { written: /WITHOUT ROWID\s*$/i.test(sql) || !/PRIMARY KEY/i.test(sql) ? 2 : 3, read: 1 };
	if (!exists) return { written: 0, read: 0 };
	const hasIndex = !!raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").get(name);
	return hasIndex ? { written: 1, read: 59 } : { written: 0, read: 27 };
}

/**
 * A `Db` over in-memory SQLite that counts statements and estimates D1 rows written and read with the rule
 * table above. Pass an existing `memoryDb()` to meter a database that already has a schema.
 */
export function meteredDb(m: ReturnType<typeof memoryDb> = memoryDb()): ReturnType<typeof memoryDb> & Meter {
	const { raw } = m;
	installTriggers(raw);
	const stats: MeterStats = { statements: 0, rowsWritten: 0, rowsRead: 0 };
	const log: MeterEntry[] = [];
	const take = () => {
		const v = raw.prepare("SELECT w, r FROM temp._meter").get() as { w: number; r: number };
		raw.exec("UPDATE temp._meter SET w = 0, r = 0");
		return v;
	};
	async function measure<T>(sql: string, exec: () => Promise<T>, returned: (r: T) => number): Promise<T> {
		const word = /^\s*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "";
		const kind: MeterEntry["kind"] = word === "SELECT" || word === "WITH" ? "read" : word === "CREATE" || word === "DROP" || word === "ALTER" ? "ddl" : "write";
		const ddl = kind === "ddl" ? ddlCost(raw, sql) : null;
		take();
		const result = await exec();
		const t = take();
		let written = t.w;
		let read = t.r;
		if (ddl) {
			({ written, read } = ddl);
			installTriggers(raw);
		} else if (kind === "read") read += returned(result);
		else if (read === 0 && /^\s*(UPDATE|DELETE)\b/i.test(sql)) read = 1;
		stats.statements++;
		stats.rowsWritten += written;
		stats.rowsRead += read;
		log.push({ sql, kind, written, read });
		return result;
	}
	const db: Db = {
		dialect: m.db.dialect,
		run: (sql, params) => measure(sql, () => m.db.run(sql, params), () => 0),
		all: <T>(sql: string, params?: Param[]) => measure(sql, () => m.db.all<T>(sql, params), (rows) => rows.length),
		async batch(stmts) {
			for (const s of stmts) await db.run(s.sql, s.params);
		},
	};
	return {
		...m,
		db,
		stats,
		log,
		reset() {
			Object.assign(stats, { statements: 0, rowsWritten: 0, rowsRead: 0 });
			log.length = 0;
		},
	};
}

/**
 * The same meter over a local D1 (Miniflare's workerd engine), summing the real `meta.rows_written` and
 * `meta.rows_read`. Null when the `miniflare` package is not importable; tests skip then.
 */
export async function d1Meter(): Promise<(Meter & { dispose(): Promise<void> }) | null> {
	const name = "miniflare";
	let mod: { Miniflare: new (o: object) => { getD1Database(n: string): Promise<D1Like>; dispose(): Promise<void> } };
	try {
		mod = await import(/* @vite-ignore */ name);
	} catch {
		return null;
	}
	const mf = new mod.Miniflare({ modules: true, script: "export default {}", d1Databases: ["DB"] });
	const d1 = await mf.getD1Database("DB");
	const stats: MeterStats = { statements: 0, rowsWritten: 0, rowsRead: 0 };
	const log: MeterEntry[] = [];
	async function exec(sql: string, params: Param[] = []) {
		check(sql, params);
		const r = await d1.prepare(sql).bind(...params).all();
		const word = /^\s*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "";
		stats.statements++;
		stats.rowsWritten += r.meta.rows_written;
		stats.rowsRead += r.meta.rows_read;
		log.push({ sql, kind: word === "SELECT" ? "read" : word === "CREATE" || word === "DROP" ? "ddl" : "write", written: r.meta.rows_written, read: r.meta.rows_read });
		return r;
	}
	const db: Db = {
		dialect: "sqlite",
		run: async (sql, params) => ({ changes: (await exec(sql, params)).meta.changes }),
		all: async <T>(sql: string, params?: Param[]) => (await exec(sql, params)).results as T[],
		async batch(stmts) {
			for (const s of stmts) await exec(s.sql, s.params);
		},
	};
	return {
		db,
		stats,
		log,
		reset() {
			Object.assign(stats, { statements: 0, rowsWritten: 0, rowsRead: 0 });
			log.length = 0;
		},
		dispose: () => mf.dispose(),
	};
}

interface D1Like {
	prepare(sql: string): { bind(...v: unknown[]): { all(): Promise<{ results: unknown[]; meta: { rows_written: number; rows_read: number; changes: number } }> } };
}

export const CHROME_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
export const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

/** In-memory SQLite with the plugin schema applied, plus a KV. */
export async function schemaDb(o: TestDbOptions = {}) {
	const m = memoryDb(o);
	const kv = new MemoryKv();
	const { ensureSchema } = await import("../src/db/schema.js");
	await ensureSchema(m.db, kv);
	const count = (table: string) => (m.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
	return { ...m, kv, count };
}

/** Request to the neutral event path with a JSON body. */
export function eventRequest(body: unknown, headers: Record<string, string> = {}, url = "https://example.org/_/e"): Request {
	const req = new Request(url, {
		method: "POST",
		headers: { "user-agent": CHROME_UA, "cf-connecting-ip": "203.0.113.7", "accept-language": "de-DE,de;q=0.9", ...headers },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
	// As on Cloudflare: `request.cf` exists, so CF-Connecting-IP is trusted.
	(req as unknown as { cf: object }).cf = {};
	return req;
}

/** Copy the raw rows of `from` (optionally only rows matching `where`) to site `to`: a second site with the same data shape. */
export function cloneSite(raw: Database.Database, to: string, where = "1 = 1", from = "default"): void {
	for (const t of ["ca_sessions", "ca_events", "ca_srv"])
		raw.exec(`CREATE TEMP TABLE x AS SELECT * FROM ${t} WHERE site = '${from}' AND ${where}; UPDATE x SET site = '${to}'; INSERT INTO ${t} SELECT * FROM x; DROP TABLE x;`);
}

/** In-memory `sites` storage collection with the given client site records (key and hosts filled in). */
export function sitesColl(sites: Array<{ id: string; hosts?: string[]; key?: string; paused?: boolean; label?: string }>) {
	const items = new Map<string, unknown>(
		sites.map((s, i) => [s.id, { label: s.label ?? s.id, key: s.key ?? `${s.id.replace(/-/g, "")}${"k".repeat(20)}`.slice(0, 20), hosts: s.hosts ?? [`${s.id}${i}.example.net`], gscProperty: "", bingSiteUrl: "", paused: !!s.paused, created: 0, id: s.id }]),
	);
	return {
		items,
		async query(o?: { where?: Record<string, unknown>; limit?: number }) {
			const w = o?.where ?? {};
			const all = [...items].filter(([, d]) => Object.entries(w).every(([k, v]) => (d as Record<string, unknown>)[k] === v));
			return { items: all.map(([id, data]) => ({ id, data })), hasMore: false };
		},
		async get(id: string) {
			return items.get(id) ?? null;
		},
		async put(id: string, data: unknown) {
			items.set(id, data);
		},
		async delete(id: string) {
			return items.delete(id);
		},
	};
}

/** A hand-built page view or event, described by the fields a report reads. */
export interface FixtureHit {
	site?: string;
	/** Entry key in the visit document (and `ca_events.id` when the hit is also an order row). */
	id: string;
	sid: string | null;
	/** Epoch seconds. */
	ts: number;
	kind: "pv" | "ev";
	/** ISO day of a `ca_events` row; default: the day of `ts` in `tz`. */
	day?: string;
	path?: string | null;
	query?: string | null;
	name?: string | null;
	/** JSON object text. */
	props?: string | null;
	val?: number | null;
	cur?: string | null;
	dur?: number | null;
	vis?: number | null;
	nav?: number | null;
	exit?: number | null;
	scroll?: number | null;
}

/**
 * Store hand-built hits where production stores them: a page view or event of a visit is an entry of the
 * visit's document (`t` = `ts - started`; the visit row must exist), an event with an amount, or without a
 * visit, is also one `ca_events` row keyed like the entry. Fields that are null are omitted, as the writers do.
 */
export function putHits(raw: Database.Database, hits: readonly FixtureHit[], tz = "UTC"): void {
	const visit = raw.prepare("SELECT day, started FROM ca_sessions WHERE site = ? AND sid = ? ORDER BY day DESC LIMIT 1");
	const put = raw.prepare(`UPDATE ca_sessions SET hits = jsonb_set(hits, '$."' || ? || '"', jsonb(?)) WHERE site = ? AND day = ? AND sid = ?`);
	const ev = raw.prepare("INSERT INTO ca_events (site, id, day, ts, sday, sid, name, path, props, val, cur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
	const drop = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
	for (const h of hits) {
		const site = h.site ?? "default";
		const v = h.sid ? (visit.get(site, h.sid) as { day: string | number; started: number } | undefined) : undefined;
		if (h.sid && !v) throw new Error(`putHits: no visit ${site}/${h.sid}`);
		if (v) {
			const entry =
				h.kind === "pv"
					? drop({ t: h.ts - v.started, p: h.path, qs: h.query, nt: h.nav, d: h.dur, e: h.vis, s: h.scroll, x: h.exit })
					: drop({ t: h.ts - v.started, n: h.name, p: h.path, pr: h.props ? JSON.parse(h.props) : null });
			put.run(h.id, JSON.stringify(entry), site, v.day, h.sid);
		}
		if (h.kind === "ev" && (h.val != null || !v))
			ev.run(site, h.id, dayInt(h.day ?? dayInZone(h.ts, tz)), h.ts, v?.day ?? null, v ? h.sid : null, h.name ?? "", h.path ?? null, h.props ?? null, h.val ?? null, h.cur ?? null);
	}
}

/** Page view and event entries of the stored visit documents as rows, for assertions (`kind`, `path`, `dur`, ...). */
export function entryRows(raw: Database.Database, where = "1 = 1", params: unknown[] = []): Array<Record<string, unknown>> {
	return raw
		.prepare(
			`SELECT * FROM (SELECT s.site AS site, s.sid AS sid, s.day AS day, h.key AS id, s.started + (h.value ->> 't') AS ts, CASE WHEN h.value ->> 'n' IS NULL THEN 'pv' ELSE 'ev' END AS kind,
h.value ->> 'p' AS path, h.value ->> 'qs' AS query, h.value ->> 'n' AS name, json(h.value -> 'pr') AS props, h.value ->> 'd' AS dur, h.value ->> 'e' AS vis,
h.value ->> 'nt' AS nav, h.value ->> 'x' AS exit, h.value ->> 's' AS scroll, s.host AS host
FROM ca_sessions s CROSS JOIN json_each(s.hits) h WHERE h.value ->> 't' IS NOT NULL) e WHERE ${where} ORDER BY e.ts, e.id`,
		)
		.all(...params) as Array<Record<string, unknown>>;
}
