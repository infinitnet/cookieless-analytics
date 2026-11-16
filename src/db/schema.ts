import type { KvLike } from "../core/crypto.js";
import type { Db, Dialect } from "./adapter.js";
import { ddl, VISIT_DAY_TYPE } from "./dialect.js";

export const SCHEMA_VERSION_KEY = "schema:version";

/**
 * Data layout. Billing on D1 counts one row written per B-tree a write touches (table plus every index whose
 * columns change), so the layout keeps B-trees per write to the minimum:
 *
 * - `ca_sessions`: one row per visit, clustered by `(site, day, sid)` (`WITHOUT ROWID` on SQLite: the primary
 *   key is the table), with the visit's page views and events inside the `hits` document. One secondary index
 *   (`site, vkey`), written once per visit and never updated. A page view, event or engagement update on a
 *   known visit is one statement and one row written; a new visit is two (table and the vkey index).
 *   Reports scan days as key ranges; retention deletes a day by key range (1 row read and 1 written per visit,
 *   against 4 reads per row for a delete by id list).
 * - `hits` is JSONB on SQLite (binary blob: about 17 percent smaller and up to 3 times faster to read than
 *   text). Rules, enforced by the helpers in `dialect.ts`: write only through the `jsonb_*` functions (the
 *   `json_*` writers return TEXT and silently turn the column back into text), read through `json(hits)`
 *   for exports and display. Postgres stores it as `JSONB`.
 * - `ca_events`: orders and server-reported events, one row each. `ca_srv`: error pages as counters per day,
 *   status, path and referrer. `ca_drops`: drop counters per day and reason. `ca_cube`: daily summary per
 *   channel, country and device.
 * - Summary tables (`ca_rollup`, `ca_cube`, `ca_revenue_daily`) are `WITHOUT ROWID` with no secondary index,
 *   and are written with the changed-rows upsert (`upsertChanged`): an unchanged row costs 0 rows written.
 * - JavaScript numbers bind as REAL on D1; numeric binds go through `CAST(? AS INTEGER)` (`dialect.ts`).
 *
 * Measured on production D1 (rows written): visit insert 2, page view or event on a known visit 1, a
 * replayed one also 1, no-op summary upsert with its `WHERE` 0 (without it 1 per row), key-range delete 1 per
 * row, `DROP TABLE` 0. About 3.3 rows written per page view.
 *
 * Tokens: `{INT}`/`{REAL}` numeric types, `{NOROWID}` the SQLite clustered table clause, `{DOC}` the
 * document column type and default (see `ddl`).
 */
const LAYOUT = [
	// `day` and `ca_events.sday`: VISIT_DAY_TYPE (see `VISIT_DAY_INT`).
	`CREATE TABLE IF NOT EXISTS ca_sessions (
	site TEXT NOT NULL, day ${VISIT_DAY_TYPE} NOT NULL, sid TEXT NOT NULL, vkey TEXT NOT NULL, hour {INT} NOT NULL,
	started {INT} NOT NULL, last_seen {INT} NOT NULL, window_s {INT} NOT NULL,
	entry_path TEXT, exit_path TEXT,
	pageviews {INT} NOT NULL DEFAULT 0, events {INT} NOT NULL DEFAULT 0, engaged_ms {INT} NOT NULL DEFAULT 0,
	visible_ms {INT} NOT NULL DEFAULT 0, reentries {INT} NOT NULL DEFAULT 0,
	max_scroll {INT} NOT NULL DEFAULT 0, interacted {INT} NOT NULL DEFAULT 0,
	ref_host TEXT, ref_path TEXT, channel TEXT, source TEXT,
	utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
	country TEXT, region TEXT, device TEXT, browser TEXT, browser_major TEXT, os TEXT, lang TEXT, screen TEXT, host TEXT,
	hits {DOC},
	PRIMARY KEY (site, day, sid)){NOROWID}`,
	"CREATE INDEX IF NOT EXISTS ca_sessions_vkey ON ca_sessions (site, vkey)",
	`CREATE TABLE IF NOT EXISTS ca_events (
	site TEXT NOT NULL, id TEXT NOT NULL, day {INT} NOT NULL, ts {INT} NOT NULL,
	sday ${VISIT_DAY_TYPE}, sid TEXT,
	name TEXT NOT NULL, path TEXT, props TEXT, val {REAL}, cur TEXT,
	PRIMARY KEY (site, id)){NOROWID}`,
	"CREATE INDEX IF NOT EXISTS ca_events_day ON ca_events (site, day)",
	`CREATE TABLE IF NOT EXISTS ca_srv (
	site TEXT NOT NULL, day {INT} NOT NULL, status {INT} NOT NULL, path TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '',
	n {INT} NOT NULL, last_ts {INT} NOT NULL,
	PRIMARY KEY (site, day, status, path, ref)){NOROWID}`,
	`CREATE TABLE IF NOT EXISTS ca_drops (
	site TEXT NOT NULL, day {INT} NOT NULL, reason TEXT NOT NULL, n {INT} NOT NULL,
	PRIMARY KEY (site, day, reason)){NOROWID}`,
	`CREATE TABLE IF NOT EXISTS ca_cube (
	site TEXT NOT NULL, day {INT} NOT NULL, channel TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL,
	sessions {INT} NOT NULL DEFAULT 0, pageviews {INT} NOT NULL DEFAULT 0, visitors {INT} NOT NULL DEFAULT 0,
	bounces {INT} NOT NULL DEFAULT 0, engaged {INT} NOT NULL DEFAULT 0, duration_ms {INT} NOT NULL DEFAULT 0,
	events {INT} NOT NULL DEFAULT 0,
	PRIMARY KEY (site, day, channel, country, device)){NOROWID}`,
	// `seg`, `segkey`: a second dimension of a pair row ('' for single-dimension rows).
	`CREATE TABLE IF NOT EXISTS ca_rollup (
	site TEXT NOT NULL, day TEXT NOT NULL, dim TEXT NOT NULL, key TEXT NOT NULL,
	seg TEXT NOT NULL DEFAULT '', segkey TEXT NOT NULL DEFAULT '',
	pageviews {INT} NOT NULL DEFAULT 0, sessions {INT} NOT NULL DEFAULT 0, visitors {INT} NOT NULL DEFAULT 0,
	bounces {INT} NOT NULL DEFAULT 0, engaged {INT} NOT NULL DEFAULT 0, engaged_ms {INT} NOT NULL DEFAULT 0,
	events {INT} NOT NULL DEFAULT 0, hits {INT} NOT NULL DEFAULT 0,
	PRIMARY KEY (site, dim, seg, day, key, segkey)){NOROWID}`,
	`CREATE TABLE IF NOT EXISTS ca_aliases (
	site TEXT NOT NULL, sid TEXT NOT NULL, canon TEXT NOT NULL, expires {INT} NOT NULL,
	PRIMARY KEY (site, sid)){NOROWID}`,
	`CREATE TABLE IF NOT EXISTS ca_search_daily (
	site TEXT NOT NULL, source TEXT NOT NULL, day TEXT NOT NULL, page_key TEXT NOT NULL, query TEXT NOT NULL,
	country TEXT NOT NULL, device TEXT NOT NULL,
	clicks {INT} NOT NULL DEFAULT 0, impressions {INT} NOT NULL DEFAULT 0, pos_sum {REAL} NOT NULL DEFAULT 0,
	provisional {INT} NOT NULL DEFAULT 0,
	PRIMARY KEY (site, source, day, page_key, query, country, device)){NOROWID}`,
	"CREATE INDEX IF NOT EXISTS ca_search_daily_site_page_day ON ca_search_daily (site, page_key, day)",
	`CREATE TABLE IF NOT EXISTS ca_revenue_daily (
	site TEXT NOT NULL, day TEXT NOT NULL, dim TEXT NOT NULL, key TEXT NOT NULL, cur TEXT NOT NULL,
	seg TEXT NOT NULL DEFAULT '', segkey TEXT NOT NULL DEFAULT '',
	orders {INT} NOT NULL DEFAULT 0, revenue {REAL} NOT NULL DEFAULT 0, sessions {INT} NOT NULL DEFAULT 0,
	PRIMARY KEY (site, dim, seg, day, key, segkey, cur)){NOROWID}`,
];

export interface Migration {
	version: number;
	statements: readonly string[];
}

/** Forward-only. Never edit a released entry; append a new version instead. */
export const MIGRATIONS: readonly Migration[] = [{ version: 1, statements: LAYOUT }];
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export const TABLES = [
	"ca_sessions",
	"ca_events",
	"ca_srv",
	"ca_drops",
	"ca_cube",
	"ca_rollup",
	"ca_aliases",
	"ca_search_daily",
	"ca_revenue_daily",
] as const;
export const INDEXES = [
	"ca_sessions_vkey",
	"ca_events_day",
	"ca_search_daily_site_page_day",
] as const;

export function migrationSql(m: Migration, dialect: Dialect): string[] {
	return m.statements.map((s) => ddl(dialect, s));
}

/**
 * Apply pending migrations and record `schema:version` in KV. Safe to call on every activation
 * and lazily before the first write: statements are idempotent and the version only moves forward.
 * An own analytics database (`ownDatabase`) keeps its version in its own `ca_meta` row instead: the host KV
 * then says nothing about it, so removing the option later still creates the tables on the host database.
 */
export async function ensureSchema(db: Db, kv: StateKv, migrations: readonly Migration[] = MIGRATIONS): Promise<number> {
	const store = own.has(db) ? versionRow(db) : kv;
	const current = await schemaVersion(db, kv);
	let version = current;
	for (const m of migrations) {
		if (m.version <= current) continue;
		// One batch: one transaction on a D1 binding; through the host's query builder the statements run in order.
		await db.batch(m.statements.map((s) => ({ sql: ddl(db.dialect, s) })));
		await store.set(SCHEMA_VERSION_KEY, m.version);
		version = m.version;
	}
	return version;
}

/** The KV `ensureSchema` records its version in. */
export type StateKv = Pick<KvLike, "get" | "set">;

const own = new WeakSet<Db>();

/** The recorded schema version: the host KV, or the version row of an own analytics database. */
export async function schemaVersion(db: Db, kv: Pick<KvLike, "get">): Promise<number> {
	return Number((await (own.has(db) ? versionRow(db) : kv).get<number>(SCHEMA_VERSION_KEY)) ?? 0) || 0;
}

/**
 * Mark a `Db` as the own analytics database (plugin option `database`). The host applies no migrations there, so
 * `ensureSchema` creates the tables itself, once: the DDL costs its rows written on the first run only (every
 * statement is `IF NOT EXISTS` and the version row skips them afterwards; one read per isolate).
 */
export function ownDatabase(db: Db): Db {
	own.add(db);
	return db;
}

/** Name and value rows of an own analytics database; it holds the schema version only. */
const META_TABLE = "CREATE TABLE IF NOT EXISTS ca_meta (name TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL){NOROWID}";

function versionRow(db: Db): Pick<KvLike, "get" | "set"> {
	return {
		async get<T>(key: string) {
			// No table yet: a new database, version 0.
			const rows = await db.all<{ value: string }>("SELECT value FROM ca_meta WHERE name = ?", [key]).catch(() => []);
			return rows[0] ? (JSON.parse(rows[0].value) as T) : null;
		},
		async set(key: string, value: unknown) {
			await db.batch([
				{ sql: ddl(db.dialect, META_TABLE) },
				{ sql: "INSERT INTO ca_meta (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value", params: [key, JSON.stringify(value)] },
			]);
		},
	};
}

let ready: Promise<void> | undefined;
/** Own databases are remembered each on its own: the host's single promise must never stand for another database. */
const ownReady = new WeakMap<Db, Promise<void>>();

/** `ensureSchema` once per isolate (once per own database); a failure is retried on the next call. */
export function ensureSchemaOnce(db: Db, kv: StateKv): Promise<void> {
	const once = (): Promise<void> =>
		ensureSchema(db, kv).then(
			() => undefined,
			(err) => {
				if (own.has(db)) ownReady.delete(db);
				else ready = undefined;
				throw err;
			},
		);
	if (own.has(db)) {
		let p = ownReady.get(db);
		if (!p) ownReady.set(db, (p = once()));
		return p;
	}
	ready ??= once();
	return ready;
}
