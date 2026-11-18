import { HIT_RE, RESERVED_EVENTS, SID_RE } from "./contract.mjs";
import { $n as saltDay, $t as SUMMARY_SHARE, Bn as upsertClause, Cn as dayInt, Dn as docJson, En as docGet, Gn as addDays, In as paramRows, Kn as dayInZone, Ln as q, Mn as field, On as docObject, Pn as join, Qn as saltBoundary, Rn as raw, Sn as VISIT_DAY_TYPE, Tn as deleteDaySlice, Vn as visitDayKey, W as CUBE_SEG, Xn as lastClosedDay, Yn as hourInZone, Zt as PROFILES, cn as storageBudget, hn as REVENUE_MAX_VALUE, i as KV_WATERMARK, jn as docSet, mn as REVENUE_MAX_OID, o as SEGS, s as SUMMARY_DIMS, vn as normalizeCurrency, wn as ddl, xn as SID_SLICES, zn as upsertChanged } from "./rollup-DahnNaAs.mjs";
import { PluginRouteError } from "emdash";
import { z } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";

//#region src/core/crypto.ts
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Random `[a-z0-9]{n}` from `crypto.getRandomValues` (rejection sampling, no modulo bias). */
function randomId(n) {
	let out = "";
	while (out.length < n) {
		const bytes = crypto.getRandomValues(new Uint8Array(n * 2));
		for (const b of bytes) if (b < 252 && out.length < n) out += ALPHABET[b % 36];
	}
	return out;
}
const enc = new TextEncoder();
function base64url(bytes) {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmacSha256(key, message) {
	const raw = typeof key === "string" ? enc.encode(key) : key;
	const k = await crypto.subtle.importKey("raw", raw, {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}
async function sha256(message) {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(message)));
}
/** Constant-time string compare (length leak only). */
function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
function expandIpv6(ip) {
	const parts = ip.split("::");
	if (parts.length > 2) return null;
	const head = parts[0] ? parts[0].split(":") : [];
	const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
	const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
	if (fill < 0 || parts.length === 1 && head.length !== 8) return null;
	const groups = [
		...head,
		...Array(fill).fill("0"),
		...tail
	];
	if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
	return groups.map((g) => Number.parseInt(g, 16));
}
/**
* Truncate an IP to its network prefix: IPv4 /24 (strict /16), IPv6 /48 (strict /32).
* Unparseable input returns "" so it still hashes but never leaks.
*/
function truncateIp(ip, mode = "standard") {
	if (!ip) return "";
	let v = ip.trim().toLowerCase();
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
	if (mapped?.[1]) v = mapped[1];
	const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
	if (v4) {
		const o = v4.slice(1, 5).map(Number);
		if (o.some((n) => n > 255)) return "";
		return mode === "strict" ? `${o[0]}.${o[1]}.0.0` : `${o[0]}.${o[1]}.${o[2]}.0`;
	}
	const g = expandIpv6(v.replace(/%.*$/, ""));
	if (!g) return "";
	const keep = mode === "strict" ? 2 : 3;
	return `${g.slice(0, keep).map((n) => n.toString(16)).join(":")}::`;
}
/** True when `ip` lies inside `cidr` (IPv4 or IPv6, already validated by settings). */
function ipInCidr(ip, cidr) {
	const [net = "", bitsRaw = ""] = cidr.split("/");
	const bits = Number(bitsRaw);
	const words = (v) => {
		const m = v.trim().toLowerCase().replace(/^::ffff:(?=\d+\.)/, "");
		const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(m);
		if (v4) return v4.slice(1, 5).map(Number);
		const g = expandIpv6(m.replace(/%.*$/, ""));
		return g ? g.flatMap((n) => [n >> 8, n & 255]) : null;
	};
	const a = words(ip);
	const b = words(net);
	if (!a || !b || a.length !== b.length || !(bits >= 0 && bits <= a.length * 8)) return false;
	for (let i = 0; i < a.length; i++) {
		const keep = Math.max(0, Math.min(8, bits - i * 8));
		const mask = keep === 0 ? 0 : 255 << 8 - keep & 255;
		if ((a[i] & mask) !== (b[i] & mask)) return false;
	}
	return true;
}
/** Daily visitor key: base64url(HMAC-SHA256(salt, site|ipTrunc|uaNorm)) truncated to 22 chars. */
async function vkey(salt, site, ipTrunc, uaNorm) {
	return base64url(await hmacSha256(salt, `${site}|${ipTrunc}|${uaNorm}`)).slice(0, 22);
}
const SALT_PREFIX = "salt:";
const saltCache = /* @__PURE__ */ new Map();
/** Salt for a salt day, created lazily with compare-and-set so concurrent isolates agree. */
async function getOrCreateSalt(kv, day) {
	const cached = saltCache.get(day);
	if (cached) return cached;
	const key = SALT_PREFIX + day;
	let salt = await kv.get(key);
	if (!salt) {
		const fresh = base64url(crypto.getRandomValues(new Uint8Array(32)));
		salt = (await kv.compareAndSet(key, null, fresh)).applied ? fresh : await kv.get(key);
		if (!salt) throw new Error("salt unavailable");
	}
	if (saltCache.size > 8) saltCache.clear();
	saltCache.set(day, salt);
	return salt;
}

//#endregion
//#region src/core/worker-env.ts
let found$1;
/**
* The Worker's bindings, looked up once per isolate through `cloudflare:workers`. Null where that module does not
* exist (Node, other hosts).
*/
function workerEnv() {
	return found$1 ??= (async () => {
		try {
			const { env } = await import("cloudflare:workers");
			return env ?? null;
		} catch {
			return null;
		}
	})();
}

//#endregion
//#region src/db/d1.ts
/** A binding value is a D1 database when it can prepare and batch. */
const isD1 = (v) => typeof v?.prepare === "function" && typeof v.batch === "function";
const bindable$1 = (p) => {
	if (p === void 0) return null;
	if (typeof p === "boolean") return p ? 1 : 0;
	if (typeof p === "bigint") return Number.isSafeInteger(Number(p)) ? Number(p) : String(p);
	return p;
};
/** D1 code 7429 ("DB overloaded") with a text that does not say so gets the word, so the 503 path retries it. */
function mapError(err) {
	const msg = String(err?.message ?? err);
	if (/\b7429\b/.test(msg) && !/\boverloaded\b/i.test(msg)) return new Error(`D1 DB is overloaded (7429): ${msg}`, { cause: err });
	return err;
}
function fromD1(d1) {
	let meta;
	const stmt = (sql, params = []) => d1.prepare(sql).bind(...params.map(bindable$1));
	async function call(f) {
		try {
			const r = await f();
			meta = (Array.isArray(r) ? r[r.length - 1] : r)?.meta ?? meta;
			if (Array.isArray(r) && meta) meta = {
				...meta,
				rows_written: r.reduce((a, x) => a + (x.meta?.rows_written ?? 0), 0)
			};
			return r;
		} catch (err) {
			throw mapError(err);
		}
	}
	const db = {
		dialect: "sqlite",
		get meta() {
			return meta;
		},
		async run(sql, params) {
			return { changes: (await call(() => stmt(sql, params).run())).meta?.changes ?? 0 };
		},
		async all(sql, params) {
			return (await call(() => stmt(sql, params).all())).results ?? [];
		},
		async batch(stmts) {
			if (stmts.length) await call(() => d1.batch(stmts.map((s) => stmt(s.sql, s.params))));
		},
		async size() {
			await db.run("SELECT 1");
			return meta?.size_after === void 0 ? null : { bytes: meta.size_after };
		}
	};
	return db;
}

//#endregion
//#region src/db/adapter.ts
/** Detect the SQL flavour the same way EmDash core does (adapter class), with a capability fallback. */
function detectDialect(db) {
	const adapter = db.getExecutor().adapter;
	if (adapter.constructor?.name?.includes("Postgres")) return "postgres";
	return adapter.supportsTransactionalDdl === true ? "postgres" : "sqlite";
}
/** `?` placeholders to `$1..$n`, outside single-quoted strings. */
function toPostgresPlaceholders(sql) {
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
function fromKysely(k, dialect = detectDialect(k)) {
	async function exec(sql, params = []) {
		const text = dialect === "postgres" ? toPostgresPlaceholders(sql) : sql;
		const query = Object.freeze({
			sql: text,
			parameters: Object.freeze([...params]),
			query: Object.freeze({
				kind: "RawNode",
				sqlFragments: Object.freeze([text]),
				parameters: Object.freeze([])
			}),
			queryId: { queryId: Math.random().toString(36).slice(2) }
		});
		return k.executeQuery(query);
	}
	const db = {
		dialect,
		async run(sql, params) {
			const r = await exec(sql, params);
			const n = r.numAffectedRows ?? r.numUpdatedOrDeletedRows ?? 0n;
			return { changes: Number(n) };
		},
		async all(sql, params) {
			return (await exec(sql, params)).rows;
		},
		async batch(stmts) {
			for (const s of stmts) await exec(s.sql, s.params);
		},
		...dialect === "postgres" ? { size: () => catalogSize(db) } : {}
	};
	return db;
}
/** Startup self-check: one trivial read. On failure the caller disables writes and shows a banner. */
async function selfCheck(db) {
	try {
		const rows = await db.all("SELECT 1 AS ok");
		if (Number(rows[0]?.ok) !== 1) return {
			ok: false,
			error: "unexpected self-check result"
		};
		return {
			ok: true,
			dialect: db.dialect
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err)
		};
	}
}

//#endregion
//#region src/db/schema.ts
const SCHEMA_VERSION_KEY = "schema:version";
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
	PRIMARY KEY (site, dim, seg, day, key, segkey, cur)){NOROWID}`
];
/** Forward-only. Never edit a released entry; append a new version instead. */
const MIGRATIONS = [{
	version: 1,
	statements: LAYOUT
}];
const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
const TABLES = [
	"ca_sessions",
	"ca_events",
	"ca_srv",
	"ca_drops",
	"ca_cube",
	"ca_rollup",
	"ca_aliases",
	"ca_search_daily",
	"ca_revenue_daily"
];
/**
* Apply pending migrations and record `schema:version` in KV. Safe to call on every activation
* and lazily before the first write: statements are idempotent and the version only moves forward.
* An own analytics database (`ownDatabase`) keeps its version in its own `ca_meta` row instead: the host KV
* then says nothing about it, so removing the option later still creates the tables on the host database.
*/
async function ensureSchema(db, kv, migrations = MIGRATIONS) {
	const store = own.has(db) ? versionRow(db) : kv;
	const current = await schemaVersion(db, kv);
	let version = current;
	for (const m of migrations) {
		if (m.version <= current) continue;
		await db.batch(m.statements.map((s) => ({ sql: ddl(db.dialect, s) })));
		await store.set(SCHEMA_VERSION_KEY, m.version);
		version = m.version;
	}
	return version;
}
const own = /* @__PURE__ */ new WeakSet();
/** The recorded schema version: the host KV, or the version row of an own analytics database. */
async function schemaVersion(db, kv) {
	return Number(await (own.has(db) ? versionRow(db) : kv).get(SCHEMA_VERSION_KEY) ?? 0) || 0;
}
/**
* Mark a `Db` as the own analytics database (plugin option `database`). The host applies no migrations there, so
* `ensureSchema` creates the tables itself, once: the DDL costs its rows written on the first run only (every
* statement is `IF NOT EXISTS` and the version row skips them afterwards; one read per isolate).
*/
function ownDatabase(db) {
	own.add(db);
	return db;
}
/** The `Db` was marked by `ownDatabase` (its storage budget is that of an own database). */
const isOwnDatabase = (db) => own.has(db);
/** Name and value rows of an own analytics database; it holds the schema version only. */
const META_TABLE = "CREATE TABLE IF NOT EXISTS ca_meta (name TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL){NOROWID}";
function versionRow(db) {
	return {
		async get(key) {
			const rows = await db.all("SELECT value FROM ca_meta WHERE name = ?", [key]).catch(() => []);
			return rows[0] ? JSON.parse(rows[0].value) : null;
		},
		async set(key, value) {
			await db.batch([{ sql: ddl(db.dialect, META_TABLE) }, {
				sql: "INSERT INTO ca_meta (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value",
				params: [key, JSON.stringify(value)]
			}]);
		}
	};
}
let ready;
/** Own databases are remembered each on its own: the host's single promise must never stand for another database. */
const ownReady = /* @__PURE__ */ new WeakMap();
/** `ensureSchema` once per isolate (once per own database); a failure is retried on the next call. */
function ensureSchemaOnce(db, kv) {
	const once = () => ensureSchema(db, kv).then(() => void 0, (err) => {
		if (own.has(db)) ownReady.delete(db);
		else ready = void 0;
		throw err;
	});
	if (own.has(db)) {
		let p = ownReady.get(db);
		if (!p) ownReady.set(db, p = once());
		return p;
	}
	ready ??= once();
	return ready;
}

//#endregion
//#region src/db/pg.ts
const isHyperdrive = (v) => typeof v?.connectionString === "string";
const DRIVER = Symbol.for("cookieless-analytics:pg-driver");
const SCOPE = Symbol.for("cookieless-analytics:pg-scope");
const g = globalThis;
const store = g[SCOPE] ??= new AsyncLocalStorage();
const usePgDriver = (driver) => {
	g[DRIVER] = driver;
};
const pgDriver = () => g[DRIVER];
/**
* Run `fn` with request scoped Postgres clients. When `fn` settles, statements it left running finish (at most
* `DRAIN_MS`), then the clients are closed. A nested scope uses the outer one.
*/
async function pgScope(fn) {
	if (store.getStore()?.open) return fn();
	const holder = {
		open: true,
		slots: /* @__PURE__ */ new Map()
	};
	try {
		return await store.run(holder, fn);
	} finally {
		holder.open = false;
		const slots = [...holder.slots.values()];
		if (slots.length) {
			await within(Promise.all(slots.map((s) => s.tail)), DRAIN_MS);
			await Promise.all(slots.map(async (s) => close(await s.client.catch(() => null))));
			holder.slots.clear();
		}
	}
}
/** Statement timeout of the ingest path: covers the measured 700 ms first statement of a Neon database resumed from zero. */
const INGEST_STATEMENT_MS = 5e3;
/**
* Runs `fn` with every Postgres statement it sends limited to `ms` (on the scope's clients, or on clients of its
* own outside a scope). A statement that runs longer fails as a timeout and its client is closed.
*/
function pgStatementLimit(ms, fn) {
	const h = store.getStore();
	const child = h?.open ? Object.assign(Object.create(h), { statementMs: Math.min(ms, h.statementMs ?? ms) }) : {
		open: false,
		slots: /* @__PURE__ */ new Map(),
		statementMs: ms
	};
	return store.run(child, fn);
}
/**
* `pgScope` that never joins an enclosing scope: for work after the response (`after()` inherits the route's context,
* and must neither hold the route's clients open nor run on them after they closed).
*/
const pgOwnScope = (fn) => store.exit(() => pgScope(fn));
/** Longer than the driver's query timeout (15 s), so a statement still running ends by itself first. */
const DRAIN_MS = 16e3;
const END_MS = 1e3;
/** Waits for `p` (never rejects) or `ms`, whichever comes first. */
async function within(p, ms) {
	let timer;
	await Promise.race([p.catch(() => void 0), new Promise((r) => timer = setTimeout(r, ms))]);
	clearTimeout(timer);
}
/** `end()` that cannot hang the caller: a dead socket gets a second, then is left behind. */
async function close(c) {
	if (c) await within(c.end(), END_MS);
}
const URL_RE = /[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+/g;
const CREDENTIAL_RE = /\b(auth|credential|host|key|password|secret|signature|token|user)\s*[=:]\s*\S+/gi;
/** Server texts like `for user "x"`, `host "1.2.3.4", user "x", database "y"`. */
const QUOTED_RE = /\b(database|host|role|user)\s+"[^"]*"/gi;
/** Socket texts like `connect ECONNREFUSED 10.0.0.5:5432`, `getaddrinfo ENOTFOUND db.example.com`. */
const SOCKET_TARGET_RE = /\b(ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|ENOTFOUND)\s+\S+/g;
const IPV4_RE = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g;
/** IPv6 candidates (`2001:db8::5`, `[fe80::1%eth0]:5432`); `ipv6` keeps times and `x::bigint` casts. */
const IPV6_RE = /(?<![\w:.])\[?(?:[0-9A-Fa-f]{1,4})?(?::[0-9A-Fa-f]{0,4}){2,7}(?:%[\w.-]+)?\]?(?::\d{1,5})?(?![\w:])/g;
const ipv6 = (m) => {
	const addr = m.replace(/^\[|\](?::\d+)?$|%.*$/g, "");
	return /[0-9A-Fa-f]/.test(addr) && (addr.includes("::") || addr.split(":").length === 8) ? "[redacted]" : m;
};
const CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;
/**
* Removes URLs, `key=value` credentials, quoted user, host and database names, socket targets, IPv4 and IPv6
* addresses, plus every part of `connectionString` (user, password, host, database) wherever it appears (a part of
* one or two characters as a whole word only); flattens the text and caps it at 500 characters.
*/
function redact(message, connectionString) {
	let out = message;
	for (const part of secretsOf(connectionString)) out = part.length >= 3 ? out.split(part).join("[redacted]") : out.replace(new RegExp(`(?<![A-Za-z0-9_])${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_])`, "g"), "[redacted]");
	return out.replace(URL_RE, "[redacted url]").replace(CREDENTIAL_RE, "$1=[redacted]").replace(QUOTED_RE, "$1 \"[redacted]\"").replace(SOCKET_TARGET_RE, "$1 [redacted]").replace(IPV4_RE, "[redacted]").replace(IPV6_RE, ipv6).replace(/[\r\n\t]+/g, " ").slice(0, 500);
}
/** The connection string itself and its user, password, host and database, longest first; none when it does not parse. */
function secretsOf(connectionString) {
	if (!connectionString) return [];
	const parts = [connectionString];
	try {
		const u = new URL(connectionString);
		parts.push(u.host, u.hostname, u.username, u.password, decodeURIComponent(u.username), decodeURIComponent(u.password), u.pathname.slice(1));
	} catch {}
	return [...new Set(parts.filter((p) => p.length > 0))].sort((a, b) => b.length - a.length);
}
/** SQLSTATE class 08 (connection), too many connections, starting up, shutting down, serialization and deadlock aborts. */
const TRANSIENT_CODES = new Set([
	"53300",
	"57P01",
	"57P03",
	"40001",
	"40P01"
]);
const SOCKET_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"EPIPE",
	"ETIMEDOUT",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"EAI_AGAIN"
]);
const TIMEOUT_RE = /timeout|timed out|connection terminated|connection (?:was )?closed|client (?:was|has been) closed|network connection lost/i;
const codeOf = (err) => {
	const c = err?.code;
	return typeof c === "string" && CODE_RE.test(c) ? c : "";
};
/** True for an error after which the client must not be reused (and a connect may be tried again). */
const isConnectionError = (err) => {
	const code = codeOf(err);
	if (SOCKET_CODES.has(code)) return true;
	if (/^[0-9A-Z]{5}$/.test(code)) return code.startsWith("08") || code === "57P01" || code === "57P03";
	return TIMEOUT_RE.test(String(err?.message ?? err));
};
/** A connect or statement timeout; a server error with a SQLSTATE that quotes the word is not one. */
const isTimeout = (err) => {
	const code = codeOf(err);
	return code === "ETIMEDOUT" || !/^[0-9A-Z]{5}$/.test(code) && /timeout|timed out/i.test(String(err?.message ?? ""));
};
/** The error this package throws: redacted text, the SQLSTATE in brackets, "overloaded" for transient states. */
function mapPgError(err, connectionString) {
	const code = codeOf(err);
	const text = redact(String(err?.message ?? err), connectionString) || "unknown error";
	const tag = code ? ` (${code})` : "";
	if (TRANSIENT_CODES.has(code) || isConnectionError(err)) return Object.assign(/* @__PURE__ */ new Error(`Postgres is overloaded or unreachable${tag}: ${text}`), { code });
	return Object.assign(/* @__PURE__ */ new Error(`Postgres error${tag}: ${text}`), { code });
}
const RETRY_PAUSE_MS = () => 100 + Math.random() * 200;
async function connect(driver, connectionString) {
	for (let attempt = 0;; attempt++) {
		const c = driver(connectionString);
		c.on?.("error", () => void 0);
		try {
			await c.connect();
			return c;
		} catch (err) {
			close(c);
			if (attempt > 0 || !isConnectionError(err) || isTimeout(err)) throw err;
			await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS()));
		}
	}
}
const bindable = (p) => p === void 0 ? null : p;
/** How long a binding is refused without connecting after a connect or statement timeout. */
const FAIL_FAST_MS = 2e4;
/** Open fail-fast windows by binding name, one map per isolate (shared by every bundle of the package). */
const failFast = g[Symbol.for("cookieless-analytics:pg-fail-fast")] ??= /* @__PURE__ */ new Map();
/** `p`, or a timeout error after `ms` (none without `ms`). */
function timed(p, ms) {
	if (!ms) return p;
	let timer;
	const late = new Promise((_, reject) => timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`statement timeout: no answer within ${ms} ms`)), ms));
	return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
/** Clients left in an unknown transaction state (a failed `ROLLBACK`): never reused. */
const poisoned = /* @__PURE__ */ new WeakSet();
/**
* `binding` is read on every use, never stored on the returned object. `name` is the binding name, the only
* label that appears in messages.
*/
function fromPg(binding, name) {
	const driver = () => {
		const d = pgDriver();
		if (!d) throw new Error(`binding ${name} is a Hyperdrive binding; set engine: "postgres" in the plugin options`);
		return d;
	};
	/** Runs `f` on a client of the current scope (serialised per client), or on a client of its own. */
	async function use(f0) {
		const d = driver();
		const down = failFast.get(name);
		if (down && Date.now() < down.until) throw new Error(`${down.reason} (not connecting again for ${Math.ceil((down.until - Date.now()) / 1e3)} s)`);
		const holder = store.getStore();
		const f = (c) => timed(f0(c), holder?.statementMs);
		try {
			if (!holder?.open) {
				const c = await connect(d, binding.connectionString);
				try {
					return await f(c);
				} finally {
					await close(c);
				}
			}
			let slot = holder.slots.get(name);
			if (!slot) {
				const client = connect(d, binding.connectionString);
				slot = {
					client,
					tail: client
				};
				holder.slots.set(name, slot);
			}
			const s = slot;
			const p = s.tail.then(() => s.client.then(f), () => s.client.then(f));
			s.tail = p.catch(() => void 0);
			try {
				return await p;
			} catch (err) {
				if ((isConnectionError(err) || await s.client.then((c) => poisoned.has(c), () => true)) && holder.slots.get(name) === s) {
					holder.slots.delete(name);
					s.client.then(close, () => void 0);
				}
				throw err;
			}
		} catch (err) {
			const e = mapPgError(err, binding.connectionString);
			if (isTimeout(err)) failFast.set(name, {
				until: Date.now() + FAIL_FAST_MS,
				reason: e.message
			});
			throw e;
		}
	}
	const query = (c, sql, params = []) => c.query(toPostgresPlaceholders(sql), params.map(bindable));
	const db = {
		dialect: "postgres",
		async run(sql, params) {
			return { changes: (await use((c) => query(c, sql, params))).rowCount ?? 0 };
		},
		async all(sql, params) {
			return (await use((c) => query(c, sql, params))).rows;
		},
		async batch(stmts) {
			if (!stmts.length) return;
			if (stmts.length === 1) return void await use((c) => query(c, stmts[0].sql, stmts[0].params));
			await use(async (c) => {
				await c.query("BEGIN");
				try {
					for (const s of stmts) await query(c, s.sql, s.params);
					await c.query("COMMIT");
				} catch (err) {
					if (!isConnectionError(err)) await c.query("ROLLBACK").catch(() => poisoned.add(c));
					throw err;
				}
			});
		},
		size: () => catalogSize(db)
	};
	return db;
}
/** Whole database and each analytics table (`pg_total_relation_size`: heap, indexes, TOAST), in the schemas of `search_path`. */
async function catalogSize(db) {
	const names = [...TABLES, "ca_meta"];
	const rows = await db.all(`SELECT '' AS name, pg_database_size(current_database()) AS bytes
		 UNION ALL
		 SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE c.relkind = 'r' AND n.nspname = ANY (current_schemas(false)) AND c.relname IN (${names.map(() => "?").join(", ")})`, names);
	const tables = {};
	let bytes = 0;
	for (const r of rows) if (r.name === "") bytes = Number(r.bytes);
	else tables[r.name] = (tables[r.name] ?? 0) + Number(r.bytes);
	return {
		bytes,
		tables
	};
}

//#endregion
//#region src/db/query-cache.ts
const CACHE_ON_MESSAGE = "Hyperdrive query caching is on; recreate the configuration with --caching-disabled";
/** A probe that takes longer counts as failed: it never holds an ingest request for the full query timeouts. */
const PROBE_MS = 1e4;
/**
* True when a read through `db` returns a value its own last write replaced. Each probe uses a row of its own, so no
* cache entry of another isolate's probe can answer its reads. Five statements: write, read, write, read, delete.
* `live` false stops it before its next statement (its deadline passed): no statement runs after that, so a stopped
* probe leaves its row.
*/
async function probeQueryCache(db, live = () => true) {
	const row = `cache_probe:${crypto.randomUUID()}`;
	const step = (s) => live() ? s() : Promise.reject(/* @__PURE__ */ new Error("cookieless-analytics: the query cache probe was stopped at its deadline"));
	const write = (v) => step(() => db.run("INSERT INTO ca_meta (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value", [row, v]));
	const read = async () => (await step(() => db.all("SELECT value FROM ca_meta WHERE name = ?", [row])))[0]?.value;
	try {
		const first = crypto.randomUUID();
		await write(first);
		await read();
		await write(crypto.randomUUID());
		return await read() === first;
	} finally {
		if (live()) await db.run("DELETE FROM ca_meta WHERE name = ?", [row]).catch(() => void 0);
	}
}
/** `p`, or a rejection after `ms`. */
function deadline(p, ms) {
	let timer;
	return Promise.race([p, new Promise((_, reject) => timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`cookieless-analytics: the query cache probe took longer than ${ms} ms`)), ms))]).finally(() => clearTimeout(timer));
}
/** Binding names of the Hyperdrive `Db`s, so the probe runs on those only. */
const hyperdrive = /* @__PURE__ */ new WeakMap();
/** Settled probe results only: a running probe belongs to its request and is never shared. */
const results = /* @__PURE__ */ new Map();
/** Marks `db` as the Hyperdrive binding `name`. */
function hyperdriveDb(db, name) {
	hyperdrive.set(db, name);
	return db;
}
/**
* Whether `db` is a Hyperdrive binding with query caching on: false for any other database. Until a result is
* stored for the binding in this isolate, each call runs a probe of its own, with its own timer, so a request
* cancelled mid-probe never holds up another. A probe that fails or takes longer than `PROBE_MS` (the database is
* down or slow) stores nothing and rethrows: the write would fail the same way.
*/
async function queryCacheOn(db) {
	const name = hyperdrive.get(db);
	if (name === void 0) return false;
	const known = results.get(name);
	if (known !== void 0) return known;
	let live = true;
	const on = await deadline(probeQueryCache(db, () => live), PROBE_MS).finally(() => {
		live = false;
	});
	if (!results.has(name)) {
		results.set(name, on);
		if (on) console.warn(`cookieless-analytics: binding ${name}: ${CACHE_ON_MESSAGE}. Page views and events are not recorded until then.`);
	}
	return results.get(name) ?? on;
}

//#endregion
//#region src/db/facts.ts
/** A `Db` whose every statement fails: the configured binding does not exist in this Worker. */
function missingDb(binding) {
	const fail = async () => {
		throw new Error(`cookieless-analytics: database option: the D1 or Hyperdrive binding ${binding} does not exist in this Worker; analytics are not written to the host database. Add the binding to the wrangler config or remove the option.`);
	};
	return {
		dialect: "sqlite",
		run: fail,
		all: fail,
		batch: fail
	};
}
/** Cron state keys of a routed database: the default database keeps the plain keys. */
const statePrefix = (binding) => `db:${binding}:`;
/** The KV under `prefix`. Only the methods the KV has are wrapped. */
function prefixedKv(kv, prefix) {
	if (!prefix) return kv;
	const k = kv;
	const out = {};
	if (k.get) out.get = (key) => k.get(prefix + key);
	if (k.set) out.set = (key, v) => k.set(prefix + key, v);
	if (k.delete) out.delete = (key) => k.delete(prefix + key);
	if (k.list) out.list = async (p = "") => (await k.list(prefix + p)).map((e) => ({
		...e,
		key: e.key.slice(prefix.length)
	}));
	if (k.compareAndSet) out.compareAndSet = (key, rev, v) => k.compareAndSet(prefix + key, rev, v);
	return out;
}
/** The resolver for the plugin options `database` or `databases` (absent: the host database for every site). */
function factsDb(option, host, env = workerEnv) {
	const route = !option ? { sites: {} } : "binding" in option ? {
		default: option.binding,
		sites: {}
	} : option;
	const opened = /* @__PURE__ */ new Map();
	const open = (binding) => {
		let get = opened.get(binding);
		if (!get) {
			const own = env().then((e) => {
				const b = e?.[binding];
				return ownDatabase(isD1(b) ? fromD1(b) : isHyperdrive(b) ? hyperdriveDb(fromPg(b, binding), binding) : missingDb(binding));
			});
			let ready = false;
			get = async () => {
				const db = await own;
				if (!ready) await ensureSchema(db, {
					get: async () => null,
					set: async () => {}
				}).then(() => ready = true, () => void 0);
				return db;
			};
			opened.set(binding, get);
		}
		return get();
	};
	/** The binding of `site`, or null for the default database. */
	const bindingOf = (site) => {
		const b = (site !== void 0 && Object.hasOwn(route.sites, site) ? route.sites[site] : void 0) ?? route.default;
		return b === void 0 || b === route.default ? null : b;
	};
	const dbOf = (b) => b !== null ? open(b) : route.default !== void 0 ? open(route.default) : host();
	const kvOf = (kv, b) => b === null ? kv : prefixedKv(kv, statePrefix(b));
	const dbFor = ((site) => dbOf(bindingOf(site)));
	dbFor.kv = (kv, site) => kvOf(kv, bindingOf(site));
	dbFor.binding = bindingOf;
	dbFor.targets = () => [null, ...new Set(Object.values(route.sites).filter((b) => b !== route.default))].map((b) => ({
		binding: b ?? route.default ?? null,
		db: () => dbOf(b),
		kv: (kv) => kvOf(kv, b)
	}));
	return dbFor;
}
let current;
/** `createPlugin` records its resolver, so the middleware (an entry without plugin options) uses the same database. */
function setPluginFacts(dbFor) {
	return current = dbFor;
}
/**
* The resolver `createPlugin` recorded. Throws when the plugin was not created in this isolate: the option is
* unknown then, and a write must not guess the host database.
*/
function pluginFacts() {
	if (!current) throw new Error("cookieless-analytics: the plugin is not initialised in this isolate; the analytics database is unknown.");
	return current;
}
/** The resolver `createPlugin` recorded, or null (tests and tools that build routes without the plugin). */
function pluginFactsOrNull() {
	return current ?? null;
}
/**
* Run `task` once per database of `dbFor` (a cron task), each with the host KV under that database's prefix and
* its share of a request budget (`share(total)`: the databases of one invocation split the platform's queries per
* invocation). A database that fails (a missing binding) is logged and the others still run; the first error is
* thrown at the end.
*/
async function eachTarget(dbFor, kv, task, log) {
	let failed;
	const targets = dbFor.targets();
	const share = (total) => Math.max(1, Math.floor(total / targets.length));
	for (const t of targets) try {
		await task(await t.db(), t.kv(kv), share, t.binding);
	} catch (err) {
		log?.warn(`cookieless-analytics: task failed on the database ${t.binding ?? "of the host"}: ${err.message}`);
		failed ??= err;
	}
	if (failed) throw failed;
}
/**
* The databases a whole-install task walks (a tool's rollup or retention run): the plugin's when sites are routed
* to several databases, else the one database of `db`.
*/
function factsTargets(db) {
	const t = current?.targets();
	return t && t.length > 1 ? t : [{
		binding: null,
		db: () => db(),
		kv: (kv) => kv
	}];
}
/** Run `task` once per database of `factsTargets`; with several, the default database's result plus one entry per database. */
async function eachDatabase(db, kv, task) {
	const targets = factsTargets(db);
	if (targets.length === 1) return task(await db(), kv);
	const out = [];
	for (const t of targets) out.push({
		...await task(await t.db(), t.kv(kv)),
		binding: t.binding
	});
	return {
		...out[0],
		databases: out
	};
}
/**
* The lazy schema migration of the host database, when some site's tables are there. Own databases (missing ones
* included) get their tables from `dbFor` itself, so one site's database never decides another site's writes.
*/
async function ensureHostSchema(dbFor, kv) {
	const host = dbFor.targets().find((t) => t.binding === null);
	if (host) await ensureSchemaOnce(await host.db(), kv);
}
/** The host KV through the prefix of `site`'s database (the plain KV before `createPlugin` or without routing). */
function stateKv(kv, site) {
	return current ? current.kv(kv, site) : kv;
}

//#endregion
//#region src/core/ids.ts
const MAX_URL = 2048;
const EVENT_NAME_RE = /^[A-Za-z0-9_.:\- ]{1,64}$/;
const PROP_KEY_RE = /^[A-Za-z0-9_]{1,32}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const isSid = (v) => typeof v === "string" && SID_RE.test(v);
const isHitId = (v) => typeof v === "string" && HIT_RE.test(v);
function isReservedEvent(name) {
	return Object.hasOwn(RESERVED_EVENTS, name);
}
/** Custom event names: 1..64 of `[A-Za-z0-9_.:\- ]`; a leading `_` is reserved for built-in events. */
function isEventName(v, allowReserved = false) {
	if (typeof v !== "string" || !EVENT_NAME_RE.test(v)) return false;
	return v.startsWith("_") ? allowReserved && isReservedEvent(v) : true;
}
/** Same-origin path plus query as sent by the page script. */
function isPath(v) {
	return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && v.length <= MAX_URL && !CONTROL_RE.test(v);
}
/** Empty string or an absolute http(s) URL. */
function isReferrer(v) {
	if (v === "") return true;
	if (typeof v !== "string" || v.length > MAX_URL || CONTROL_RE.test(v)) return false;
	return /^https?:\/\//i.test(v) && URL.canParse(v);
}
/**
* Clean an event property map: at most 10 keys, keys `^[A-Za-z0-9_]{1,32}$`, values string <= 128,
* finite number or boolean. Invalid entries are dropped. Reserved events keep only their fixed key.
*/
function cleanProps(p, eventName) {
	if (p === void 0 || p === null) return void 0;
	if (typeof p !== "object" || Array.isArray(p)) return void 0;
	const only = eventName && isReservedEvent(eventName) ? RESERVED_EVENTS[eventName] : void 0;
	const out = {};
	let n = 0;
	for (const [k, v] of Object.entries(p)) {
		if (n >= 10) break;
		if (only ? k !== only : !PROP_KEY_RE.test(k)) continue;
		if (typeof v === "string" && v.length <= 128 && !CONTROL_RE.test(v) || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) {
			out[k] = v;
			n++;
		}
	}
	return n ? out : void 0;
}
const OID_RE = new RegExp(`^[A-Za-z0-9_.:\\-]{1,${REVENUE_MAX_OID}}$`);
/**
* Revenue fields of an event: null when there is no `val` (a lone `cur` or `oid` is ignored),
* an error when any of the three is invalid (the caller then drops all three and keeps the event).
* `cur` is normalised but never defaulted here; rounding needs the effective currency and happens on write.
*/
function validateRevenue(b) {
	if (b.val === void 0) return null;
	if (typeof b.val !== "number" || !Number.isFinite(b.val) || b.val < 0 || b.val > REVENUE_MAX_VALUE) return { error: "invalid_value" };
	const cur = b.cur === void 0 ? void 0 : normalizeCurrency(b.cur);
	if (cur === null) return { error: "invalid_currency" };
	if (b.oid !== void 0 && (typeof b.oid !== "string" || !OID_RE.test(b.oid))) return { error: "invalid_id" };
	return {
		val: b.val,
		...cur ? { cur } : {},
		...b.oid !== void 0 ? { oid: b.oid } : {}
	};
}
const isInt = (v, min, max) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
/** Validate a parsed ingest body. Returns a clean typed body or null (dropped silently with 204). */
function validateIngest(raw, maxEngagedMs = 72e5) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const b = raw;
	if (b.v !== 1) return null;
	if (b.sid !== void 0 && !isSid(b.sid)) return null;
	if (b.k !== void 0 && !isSid(b.k)) return null;
	const base = { v: 1 };
	if (b.sid) base.sid = b.sid;
	if (b.k) base.k = b.k;
	if (b.n === 0 || b.n === 1) base.n = b.n;
	switch (b.t) {
		case "pv":
			if (!isHitId(b.h) || !isPath(b.u)) return null;
			if (b.r !== void 0 && !isReferrer(b.r)) return null;
			if (b.w !== void 0 && !isInt(b.w, 0, 1e5)) return null;
			return {
				...base,
				t: "pv",
				h: b.h,
				u: b.u,
				...b.r ? { r: b.r } : {},
				...b.w !== void 0 ? { w: b.w } : {},
				...isInt(b.nt, 0, 2) ? { nt: b.nt } : {}
			};
		case "en":
			if (!isHitId(b.h) || typeof b.d !== "number" || !Number.isFinite(b.d) || b.d < 0) return null;
			if (b.s !== void 0 && !isInt(b.s, 0, 100)) return null;
			return {
				...base,
				t: "en",
				h: b.h,
				d: Math.min(Math.round(b.d), maxEngagedMs),
				...isInt(b.e, 1, maxEngagedMs) ? { e: b.e } : {},
				...b.s !== void 0 ? { s: b.s } : {},
				...b.i === 1 || b.i === 0 ? { i: b.i } : {},
				...isInt(b.x, 0, 2) ? { x: b.x } : {}
			};
		case "ev": {
			if (!isEventName(b.name, true)) return null;
			if (b.h !== void 0 && !isHitId(b.h)) return null;
			if (b.u !== void 0 && !isPath(b.u)) return null;
			const rev = isReservedEvent(b.name) ? null : validateRevenue(b);
			const p = cleanProps(b.p, b.name);
			return {
				...base,
				t: "ev",
				name: b.name,
				...b.h ? { h: b.h } : {},
				...b.u ? { u: b.u } : {},
				...p ? { p } : {},
				...rev && !("error" in rev) ? rev : {},
				...rev && "error" in rev ? { revenueInvalid: true } : {}
			};
		}
		default: return null;
	}
}

//#endregion
//#region src/sources/types.ts
const SOURCE_IDS = ["google", "bing"];
var BudgetExhausted = class extends Error {};
/** Provider error with the HTTP status; 401 and 403 are never retried, 429 and 503 back off to the next tick. */
var SourceError = class extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
/** A provider that refuses this caller for now (Bing `ThrottleIP`, `ThrottleUser`, `ThrottleHost`): not a failure of the connection. */
var ThrottledError = class extends SourceError {
	constructor(code, message) {
		super(429, message);
		this.code = code;
	}
};
/** Mapping field of each provider in settings and in a client site record. */
const MAPPING_FIELD = {
	google: "gscProperty",
	bing: "bingSiteUrl"
};

//#endregion
//#region src/sources/budget.ts
/** The ingest write guard of the `small` profile: 85 percent of the Workers Free plan's 100,000 rows per day. */
const GUARD_ROWS = 85e3;
const SYNC_BUDGET = {
	small: {
		daily: GUARD_ROWS * .25,
		pauseAt: GUARD_ROWS * .6
	},
	standard: {
		daily: 5e5,
		pauseAt: null
	},
	dedicated: {
		daily: 1e6,
		pauseAt: null
	}
};
/** Rows written per inserted search row: the table (WITHOUT ROWID) plus the page index. */
const ROWS_PER_INSERT = 2;
/** Rows written per deleted search row. */
const ROWS_PER_DELETE = 1;
/** Upper bound per row of a day that may already be stored (its old row deleted, the new one inserted). */
const ROWS_PER_ROW_BOUND = ROWS_PER_DELETE + ROWS_PER_INSERT;
/** Rows per day of the estimate before a site has stored days (a planning value; stored days replace it). */
const PLANNING_ROWS_PER_DAY = 500;
/** State key: rows the Search syncs wrote on the UTC day `{ day, rows }`. */
const KV_SYNC_ROWS = "budget:sync";
/** Days a provider keeps: Google about 16 months, Bing about 6 months. */
const PROVIDER_DAYS = {
	google: 490,
	bing: 180
};
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
/** 00:00 UTC after `ms`. */
const nextUtcDay = (ms) => (Math.floor(ms / 864e5) + 1) * 864e5;
/**
* The backfill range of `days` (back from yesterday, 0 for the provider limit) or from `from`, clamped to what the
* provider keeps and to the search retention. `clamped` tells the caller the start moved.
*/
function backfillRange(o, source, yesterday, retentionDays) {
	const oldest = addDays(yesterday, 1 - Math.min(PROVIDER_DAYS[source], retentionDays));
	const want = o.from ?? addDays(yesterday, 1 - (o.days || PROVIDER_DAYS[source]));
	return want < oldest ? {
		from: oldest,
		to: yesterday,
		clamped: true
	} : {
		from: want,
		to: yesterday,
		clamped: false
	};
}
/** Today's rows of the syncs are used: the work waits until `resumeAt` (ms). A `BudgetExhausted`, so a tick stops and saves its cursor. */
var RowsPaused = class extends BudgetExhausted {
	constructor(resumeAt, message = "Today's Search rows budget is used.") {
		super();
		this.resumeAt = resumeAt;
		this.message = message;
		this.name = "RowsPaused";
	}
};
/**
* Today's sync rows of one tick or import: read once per UTC day from `KV_SYNC_ROWS`, charged with the rows each
* write reported, stored after every charge. `ingest` answers today's estimated ingest rows (`small` only).
*/
var SyncRows = class {
	/** Rows charged by this instance. */
	charged = 0;
	day = "";
	rows = 0;
	ingestRows = null;
	constructor(kv, now, profile, ingest) {
		this.kv = kv;
		this.now = now;
		this.profile = profile;
		this.ingest = ingest;
	}
	async allowance() {
		const day = utcDay(this.now());
		const { daily, pauseAt } = SYNC_BUDGET[this.profile];
		if (day !== this.day) {
			const s = await this.kv.get(KV_SYNC_ROWS);
			this.day = day;
			this.rows = s?.day === day ? s.rows : 0;
			this.ingestRows = pauseAt !== null && this.ingest ? await this.ingest() : null;
		}
		const total = (this.ingestRows ?? 0) + this.rows;
		const left = Math.max(0, Math.min(daily - this.rows, pauseAt === null ? Number.POSITIVE_INFINITY : pauseAt - total));
		const paused = left === 0;
		return {
			budget: daily,
			used: this.rows,
			left,
			paused,
			pauseAt,
			ingest: this.ingestRows,
			resumeAt: paused ? nextUtcDay(this.now()) : null
		};
	}
	async charge(n) {
		if (n <= 0) return;
		await this.allowance();
		this.rows += n;
		this.charged += n;
		await this.kv.set(KV_SYNC_ROWS, {
			day: this.day,
			rows: this.rows
		});
	}
};

//#endregion
//#region src/move/day-budget.ts
/** Rows a move and `data/load` together may write in one UTC day on `small` with D1. */
const COPY_DAY_ROWS = 15e3;
/** Counter of today's copied rows: `{ day, rows }`, `day` the UTC day. */
const KV_COPY_ROWS = "copy:rows";
/** Epoch seconds of the next 00:00 UTC after `now`. */
const nextUtcMidnight = (now) => (Math.floor(now / 86400) + 1) * 86400;
/** Rows copied in the UTC day of `now`. */
async function copiedToday(kv, now) {
	const c = await kv.get(KV_COPY_ROWS);
	return c?.day === dayInZone(now, "UTC") ? c.rows : 0;
}
/** Rows that may still be copied today. */
const copyRowsLeft = async (kv, now) => Math.max(0, COPY_DAY_ROWS - await copiedToday(kv, now));
/** Charge `rows` copied rows to today: the counter and today's write budget state (when one is stored). Returns today's total. */
async function chargeCopyRows(kv, now, rows) {
	const day = dayInZone(now, "UTC");
	const total = await copiedToday(kv, now) + rows;
	await kv.set(KV_COPY_ROWS, {
		day,
		rows: total
	});
	const b = await kv.get(KV_WRITE_BUDGET);
	if (b?.day === day) await kv.set(KV_WRITE_BUDGET, {
		...b,
		rows: b.rows + rows,
		blocked: b.blocked || b.rows + rows >= b.limit
	});
	return total;
}

//#endregion
//#region src/query/retention.ts
const KV_CURSOR = "retention:cursor";
/** Rows per chunk of the per-site purge, and the size one retention statement aims at. */
const CHUNK_ROWS = 2e3;
const MAX_CHUNKS = 20;
/** Salts older than this many days before the current salt day are deleted. */
const SALT_KEEP_DAYS = 2;
/** Requests kept for the end of a tick: the cursor write. */
const END_RESERVE = 1;
/** Rows one tick may delete on the `small` profile, so a backlog cannot spend the Free plan's daily rows written. */
const SMALL_TICK_ROWS = 2e3;
/**
* Rows the retention task may delete per UTC day on `small`. Deleted rows are written rows: they count toward the
* write guard's estimate (`deletedToday`), and this cap keeps a backlog (a window shortened by the storage budget)
* from spending the day's allowance (the last statement of a tick may pass it, as it may pass `SMALL_TICK_ROWS`).
* Steady state at the guard's traffic is about 12,000 a day.
*/
const SMALL_DAY_ROWS = 15e3;
const STEP_COUNT = 9;
/** Rows a filtered delete job wrote in the UTC day `{ day, rows }` (`src/query/filtered-delete.ts`). */
const KV_DELETE_ROWS = "delete:rows";
/** Rows retention and a filtered delete job wrote in the UTC day of `now`, from the cursor and `KV_DELETE_ROWS`. */
async function deletedToday(kv, now) {
	const day = dayInZone(now, "UTC");
	const u = (await kv.get(KV_CURSOR))?.utc;
	const j = await kv.get(KV_DELETE_ROWS);
	return (u && u.day === day ? u.rows : 0) + (j && j.day === day ? j.rows : 0);
}
/** `day` minus whole months, clamped to the month's last day. */
function addMonths(day, n) {
	const [y, m, d] = day.split("-").map(Number);
	const t = new Date(Date.UTC(y, m - 1 + n, 1));
	const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
	return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
/** The next retention tick starts a new cycle with a fresh storage estimate, so a changed budget applies then, not the next day. */
async function clearEstimateDay(kv) {
	const c = await kv.get(KV_CURSOR);
	if (c) await kv.set(KV_CURSOR, {
		...c,
		day: ""
	});
}
/** Effective detailed window in days: the setting, shortened while the storage budget requires it. */
async function effectiveRawDays(kv, s) {
	return rawDaysOf(await kv.get(KV_CURSOR), s);
}
const rawDaysOf = (c, s) => c?.capped ? Math.min(c.rawDays, s.rawRetentionDays) : s.rawRetentionDays;
/** First day of the detailed window; reports for ranges starting earlier read the rollup. */
async function rawFromDay(kv, s, now) {
	const c = await kv.get(KV_CURSOR);
	const byDays = addDays(dayInZone(now, s.siteTimezone), -rawDaysOf(c, s));
	const cutoff = c?.cutoff;
	return cutoff && cutoff > byDays ? cutoff : byDays;
}
/** Every site present in the fact and summary tables, by skip scan (1 row read per site and table). */
async function sitesInTables(db) {
	const found = /* @__PURE__ */ new Set();
	for (const t of [
		"ca_sessions",
		"ca_events",
		"ca_srv",
		"ca_drops",
		"ca_aliases",
		"ca_rollup",
		"ca_cube",
		"ca_search_daily",
		"ca_revenue_daily"
	]) for (const r of await db.all(`${siteScan(t)} SELECT site FROM s WHERE site IS NOT NULL`, [])) found.add(String(r.site));
	return [...found].sort();
}
function steps(s, today, rawDays, watermark, now) {
	const rawCutoff = addDays(today, -rawDays);
	const human = humanCutoff(rawCutoff, watermark);
	const summary = addMonths(today, -s.rollupRetentionMonths);
	return [
		{
			name: "sessions",
			table: "ca_sessions",
			mode: "slices",
			prefix: [],
			cutoff: human === null ? null : visitDayKey(human)
		},
		{
			name: "events",
			table: "ca_events",
			mode: "day",
			prefix: [],
			cutoff: human === null ? null : dayInt(human)
		},
		{
			name: "srv",
			table: "ca_srv",
			mode: "day",
			prefix: [],
			cutoff: dayInt(rawCutoff)
		},
		{
			name: "drops",
			table: "ca_drops",
			mode: "day",
			prefix: [],
			cutoff: dayInt(rawCutoff)
		},
		{
			name: "aliases",
			table: "ca_aliases",
			mode: "expiry",
			prefix: [],
			cutoff: now
		},
		{
			name: "cube",
			table: "ca_cube",
			mode: "day",
			prefix: [],
			cutoff: dayInt(summary)
		},
		{
			name: "rollup",
			table: "ca_rollup",
			mode: "day",
			prefix: ["dim", "seg"],
			cutoff: summary
		},
		{
			name: "revenue",
			table: "ca_revenue_daily",
			mode: "day",
			prefix: ["dim", "seg"],
			cutoff: summary
		},
		{
			name: "search",
			table: "ca_search_daily",
			mode: "day",
			prefix: ["source"],
			cutoff: addDays(today, -s.searchRetentionDays)
		}
	];
}
const humanCutoff = (rawCutoff, watermark) => watermark ? rawCutoff <= addDays(watermark, 1) ? rawCutoff : addDays(watermark, 1) : null;
async function runChunk(db, site, st, chunkRows) {
	if (st.cutoff === null) return 0;
	if (st.mode === "day") return (await db.run(`DELETE FROM ${st.table} WHERE site = ? AND day = (SELECT MIN(day) FROM ${st.table} WHERE site = ? AND ${st.where})`, [
		site,
		site,
		st.cutoff
	])).changes;
	const pk = st.pk;
	return (await db.run(`DELETE FROM ${st.table} WHERE site = ? AND ${pk} IN (SELECT ${pk} FROM ${st.table} WHERE site = ? AND ${st.where} LIMIT ${chunkRows})`, [
		site,
		site,
		st.cutoff
	])).changes;
}
var Exhausted = class extends Error {};
/** `db` and `kv` with every call counted against `limit` requests; a call that does not fit throws `Exhausted`. */
function metered(db, kv, limit) {
	let used = 0;
	const spend = () => {
		if (used >= limit - END_RESERVE) throw new Exhausted();
		used++;
	};
	const mdb = {
		dialect: db.dialect,
		get meta() {
			return db.meta;
		},
		run: (sql, p) => (spend(), db.run(sql, p)),
		all: (sql, p) => (spend(), db.all(sql, p)),
		batch: (stmts) => (spend(), db.batch(stmts))
	};
	return {
		db: isOwnDatabase(db) ? ownDatabase(mdb) : mdb,
		kv: {
			get: (k) => (spend(), kv.get(k)),
			set: (k, v) => (spend(), kv.set(k, v))
		},
		used: () => used
	};
}
/** Next site of `table` after `after` (the first when null), or null. */
async function nextSite(db, table, after) {
	const [r] = await db.all(after === null ? `SELECT MIN(site) AS s FROM ${table}` : `SELECT MIN(site) AS s FROM ${table} WHERE site > ?`, after === null ? [] : [after]);
	return r?.s ?? null;
}
/** Next key prefix of `site` after `after` (the first when null), in key order, or null. */
async function nextPrefix(db, st, site, after) {
	const cols = st.prefix.join(", ");
	const tuple = st.prefix.length > 1 ? `(${cols}) > (${st.prefix.map(() => "?").join(", ")})` : `${cols} > ?`;
	const rows = await db.all(`SELECT ${cols} FROM ${st.table} WHERE site = ?${after ? ` AND ${tuple}` : ""} ORDER BY ${cols} LIMIT 1`, [site, ...after ?? []]);
	return rows[0] ? st.prefix.map((c) => String(rows[0]?.[c])) : null;
}
/**
* One statement of work on the current site (and prefix). Returns true when nothing older than the cutoff is
* left there. `day` deletes the oldest day (`MIN(day)` is a key-range probe); `slices` deletes the visits of the
* oldest day slice by slice, sizing each statement from the rows per slice of the one before.
*/
async function work(db, st, c, cutoff, deleted) {
	const site = c.site;
	if (st.mode === "expiry") {
		deleted((await db.run(`DELETE FROM ${st.table} WHERE site = ? AND expires < ?`, [site, cutoff])).changes);
		return true;
	}
	if (st.mode === "day") {
		const eq = st.prefix.map((p) => ` AND ${p} = ?`).join("");
		const pv = c.prefix ?? [];
		const n = (await db.run(`DELETE FROM ${st.table} WHERE site = ?${eq} AND day = (SELECT MIN(day) FROM ${st.table} WHERE site = ?${eq}) AND day < ?`, [
			site,
			...pv,
			site,
			...pv,
			cutoff
		])).changes;
		deleted(n);
		return n === 0;
	}
	if (c.vday == null) {
		const [r] = await db.all(`SELECT MIN(day) AS d FROM ${st.table} WHERE site = ?`, [site]);
		if (r?.d == null || r.d >= cutoff) return true;
		c.vday = r.d;
		c.slice = 0;
		c.perSlice = void 0;
		return false;
	}
	const from = c.slice ?? 0;
	const per = c.perSlice ?? CHUNK_ROWS;
	const span = Math.max(1, Math.min(SID_SLICES.length - from, Math.floor(CHUNK_ROWS / Math.max(1, per))));
	const range = [SID_SLICES[from]?.[0] ?? null, SID_SLICES[from + span - 1]?.[1] ?? null];
	const f = deleteDaySlice(db.dialect, st.table, site, c.vday, range);
	const n = (await db.run(f.sql, f.params)).changes;
	deleted(n);
	c.perSlice = n / span;
	c.slice = from + span;
	if (c.slice >= SID_SLICES.length) {
		c.vday = null;
		c.slice = 0;
	}
	return false;
}
/**
* One retention tick within the request budget of the capacity profile, resuming from the KV cursor. A new local
* day starts a new cycle: storage estimate, effective window, then every step from the start. Returns the cursor
* and `done` once the cycle has walked every step.
*/
async function runRetention(db, kv, s, now, o = {}) {
	const m = metered(db, kv, o.requests ?? PROFILES[s.capacityProfile].requests);
	const today = dayInZone(now, s.siteTimezone);
	let c = await m.kv.get(KV_CURSOR);
	const list = (cur, watermark) => steps(s, today, cur.rawDays, watermark, now);
	let watermark = null;
	let rows = 0;
	const utcDay = dayInZone(now, "UTC");
	try {
		watermark = await m.kv.get(KV_WATERMARK);
		if (!c || c.day !== today) {
			const storage = await estimateStorage(m.db, s, today);
			const keep = c && c.step < STEP_COUNT ? {
				step: c.step,
				site: c.site ?? null,
				prefix: c.prefix ?? null,
				vday: c.vday ?? null,
				slice: c.slice ?? 0
			} : {
				step: 0,
				site: null,
				prefix: null
			};
			c = {
				day: today,
				rawDays: storage.rawDays,
				capped: storage.capped,
				storage,
				cutoff: c?.cutoff ?? null,
				...keep,
				deleted: {}
			};
		}
		const cur = c;
		const all = list(cur, watermark);
		const human = humanCutoff(addDays(today, -cur.rawDays), watermark);
		if (human && (!cur.cutoff || human > cur.cutoff)) {
			cur.cutoff = human;
			await m.kv.set(KV_CURSOR, cur);
		}
		const doneToday = cur.utc?.day === utcDay ? cur.utc.rows : 0;
		const maxRows = o.rows ?? (dailyRowsApply(s.capacityProfile, db) ? Math.min(SMALL_TICK_ROWS, SMALL_DAY_ROWS - doneToday) : Number.POSITIVE_INFINITY);
		const count = (name) => (n) => {
			cur.deleted[name] = (cur.deleted[name] ?? 0) + n;
			rows += n;
		};
		let savedStep = cur.step;
		while (rows < maxRows) {
			if (cur.step !== savedStep && cur.step < all.length) {
				await m.kv.set(KV_CURSOR, {
					...cur,
					utc: dayRows(cur.utc, utcDay, rows)
				});
				savedStep = cur.step;
			}
			const st = all[cur.step];
			if (!st) break;
			if (st.cutoff === null) {
				Object.assign(cur, {
					step: cur.step + 1,
					site: null,
					prefix: null
				});
				continue;
			}
			if (cur.site == null) {
				const first = await nextSite(m.db, st.table, null);
				if (first === null) {
					Object.assign(cur, {
						step: cur.step + 1,
						site: null,
						prefix: null
					});
					continue;
				}
				Object.assign(cur, {
					site: first,
					prefix: null,
					vday: null,
					slice: 0
				});
			}
			if (st.prefix.length && cur.prefix == null) {
				const p = await nextPrefix(m.db, st, cur.site, null);
				if (p === null) {
					await advanceSite(m.db, st, cur);
					continue;
				}
				cur.prefix = p;
			}
			if (!await work(m.db, st, cur, st.cutoff, count(st.name))) continue;
			if (st.prefix.length) {
				const p = await nextPrefix(m.db, st, cur.site, cur.prefix ?? null);
				if (p) {
					cur.prefix = p;
					continue;
				}
			}
			await advanceSite(m.db, st, cur);
		}
	} catch (e) {
		if (!(e instanceof Exhausted)) {
			if (c) await kv.set(KV_CURSOR, {
				...c,
				utc: dayRows(c.utc, utcDay, rows)
			}).catch(() => void 0);
			throw e;
		}
	}
	if (!c) throw new Error("retention: the request budget does not cover the start of a cycle");
	c.utc = dayRows(c.utc, utcDay, rows);
	await kv.set(KV_CURSOR, c);
	return {
		...c,
		done: c.step >= list(c, watermark).length,
		requests: m.used() + 1
	};
}
/** The rows retention deleted in the UTC day, with this run's `rows` added. */
const dayRows = (utc, day, rows) => ({
	day,
	rows: (utc?.day === day ? utc.rows : 0) + rows
});
/** The current site of the step is finished: move to the next one, or to the next step. */
async function advanceSite(db, st, c) {
	const next = await nextSite(db, st.table, c.site ?? null);
	Object.assign(c, next === null ? {
		step: c.step + 1,
		site: null
	} : { site: next }, {
		prefix: null,
		vday: null,
		slice: 0,
		perSlice: void 0
	});
}
/** Delete `salt:<day>` keys older than two days before the current salt day. */
async function cleanSalts(kv, s, now) {
	const keep = addDays(saltDay(now, s.saltTimezone, s.saltRotationHour), -SALT_KEEP_DAYS);
	const gone = [];
	for (const { key } of await kv.list("salt:")) if (key.slice(5) < keep) {
		await kv.delete(key);
		gone.push(key);
	}
	return gone;
}

//#endregion
//#region src/query/storage.ts
/**
* Bytes per visit and per document entry (page view or event), JSONB document, row and index included, as measured
* with `dbstat` on SQLite (the verification gate's size runs: 657, 667 and 670 bytes per visit of 3.25 entries at
* 1,000, 10,000 and 100,000 page views a day, documents grown in place). Every run had the same entries per visit,
* so the split between the two keeps the proportion of the earlier fit.
*/
const VISIT_BYTES = 290;
const ENTRY_BYTES = 115;
/**
* Bytes of one summary row (`ca_rollup`, `ca_revenue_daily`, `ca_cube`, indexes included), as measured with `dbstat`
* in the same runs, rows stored day by day by the closed-day writer: 74, 77 and 81.
*/
const SUMMARY_ROW_BYTES = 75;
/**
* Margin on both estimates for what SQLite did not measure: D1's page overhead and fill (production D1 stored text
* documents inserted whole at 900 bytes per visit of 2.9 entries; JSONB saves about 17 percent of that). Keeps the
* estimate 9 to 12 percent above the measured sizes, so the detailed window shortens early rather than late.
*/
const STORAGE_SAFETY = 1.1;
/** Most the measured database size (`size_after`) may raise the detailed estimate: the estimate's error on generator traffic stays below it. */
const MAX_SCALE = 1.5;
/** A shortened window keeps the detailed data this far below its share, so it does not shorten again the next day. */
const SHORTEN_TO = .95;
/** `WITH RECURSIVE s(site)`: every site of `table` by skip scan, one row read per site. */
const siteScan = (table) => `WITH RECURSIVE s(site) AS (SELECT MIN(site) FROM ${table} UNION ALL SELECT (SELECT MIN(site) FROM ${table} WHERE site > s.site) FROM s WHERE s.site IS NOT NULL)`;
const dimList = SUMMARY_DIMS.map((d) => `'${d}'`).join(", ");
/** Single dimension rows, the pair rows of every segment and the revenue rows per cube cell: key ranges of the summary primary keys. */
const segList = [
	"",
	...SEGS,
	CUBE_SEG
].map((d) => `'${d}'`).join(", ");
/** Bytes of the detailed data of one day from its `all` summary row. */
const dayBytes = (visits, entries) => (visits * VISIT_BYTES + entries * ENTRY_BYTES) * STORAGE_SAFETY;
/**
* The estimate and the detailed window it allows. Two statements: the `all` rows of every site and day in the
* longest retention, and the summary rows of the newest day before `today` (single dimension, pair, link, journey, revenue and cube rows).
*/
async function estimateStorage(db, s, today) {
	const rawFrom = addDays(today, -s.rawRetentionDays);
	const from = addDays(today, -Math.max(s.rawRetentionDays, Math.ceil(s.rollupRetentionMonths * 31)));
	const days = (await db.all(`${siteScan("ca_rollup")} SELECT r.day AS day, SUM(r.sessions) AS visits, SUM(r.pageviews + r.events) AS entries FROM s JOIN ca_rollup r ON r.site = s.site AND r.dim = 'all' AND r.seg = '' AND r.day >= ? GROUP BY r.day ORDER BY r.day DESC`, [from])).map((d) => ({
		day: String(d.day),
		bytes: dayBytes(Number(d.visits), Number(d.entries))
	}));
	const sample = days.find((d) => d.day < today)?.day;
	let rows = 0;
	if (sample) {
		const [r] = await db.all(`${siteScan("ca_rollup")} SELECT SUM((SELECT COUNT(*) FROM ca_rollup r WHERE r.site = s.site AND r.dim IN (${dimList}) AND r.seg IN (${segList}) AND r.day = ?) + (SELECT COUNT(*) FROM ca_revenue_daily v WHERE v.site = s.site AND v.dim IN (${dimList}) AND v.seg IN (${segList}) AND v.day = ?) + (SELECT COUNT(*) FROM ca_cube c WHERE c.site = s.site AND c.day = ?)) AS n FROM s WHERE s.site IS NOT NULL`, [
			sample,
			sample,
			dayInt(sample)
		]);
		rows = Number(r?.n ?? 0);
	}
	const { bytes: budget } = storageBudget(s, budgetTargetOf(db));
	const share = budget * (1 - SUMMARY_SHARE);
	const summary = Math.round(rows * days.length * SUMMARY_ROW_BYTES * STORAGE_SAFETY);
	const size = db.meta?.size_after;
	const estimated = days.filter((d) => d.day >= rawFrom).reduce((a, d) => a + d.bytes, 0);
	const measured = typeof size === "number" && estimated > 0;
	const scale = measured ? Math.min(MAX_SCALE, Math.max(1, (size - summary) / estimated)) : 1;
	const detailDays = days.filter((d) => d.day >= rawFrom).map((d) => ({
		...d,
		bytes: d.bytes * scale
	}));
	let detail = Math.round(detailDays.reduce((a, d) => a + d.bytes, 0));
	let rawDays = s.rawRetentionDays;
	if (detail > share) {
		let sum = 0;
		let keep = 0;
		for (const d of detailDays) {
			sum += d.bytes;
			if (sum > share * SHORTEN_TO) break;
			keep++;
		}
		detail = Math.round(detailDays.slice(0, Math.max(1, keep)).reduce((a, d) => a + d.bytes, 0));
		const oldestKept = detailDays[Math.max(0, keep - 1)]?.day ?? today;
		rawDays = Math.min(s.rawRetentionDays, Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldestKept}T00:00:00Z`)) / 864e5)));
	}
	return {
		profile: s.capacityProfile,
		budget,
		bytes: detail + summary,
		detail,
		summary,
		rawDays,
		capped: rawDays < s.rawRetentionDays,
		...measured ? { measured } : {}
	};
}
/** State key of the write budget: the estimate of the current UTC day. */
const KV_WRITE_BUDGET = "budget:writes";
/** The Workers Free plan's daily D1 rows written, per account (resets at 00:00 UTC). */
const FREE_ROWS_PER_DAY = 1e5;
/** Ingest stops at this share of the daily rows, so the CMS can still save content. */
const GUARD_SHARE = .85;
/**
* Rows written at ingest per counted unit (rule-table meter, `tests/write-guard.test.ts`): a visit 1 (insert into
* the table and its vkey index, less the first page view it carries), a page view 2.6 (its entry 1, engagement
* updates 1.5, second-tab aliases 0.1), an event 1. With the production mix about 3.3 per page view. Deletes are
* not estimated: retention counts the rows it deletes in the UTC day (`deletedToday`) and the guard adds them.
*/
const ROWS_PER_VISIT = 1;
const ROWS_PER_PV = 2.6;
const ROWS_PER_EVENT = 1;
/** Rows written per day that do not depend on traffic: one day of summary rows on `small`. */
const FIXED_ROWS = 2500;
/**
* Seconds between two checks: hourly while below a quarter of the limit, then every 10 minutes. From a quarter
* (21,250 rows) an hour would need about 24,000 page views to pass the Free plan's 100,000 before the next check.
*/
const FAST_FROM = .25;
const CHECK_SLOW_S = 3600;
const CHECK_FAST_S = 600;
/** Rows written estimated from today's visits, page views and events, plus the rows Search syncs wrote and retention deleted today, and whether that crosses the guard. */
function writeBudget(c, day, at, sync = 0, deletes = 0) {
	const rows = Math.round(c.visits * ROWS_PER_VISIT + c.pageviews * ROWS_PER_PV + c.events * ROWS_PER_EVENT + FIXED_ROWS) + sync + deletes;
	const limit = FREE_ROWS_PER_DAY * GUARD_SHARE;
	return {
		day,
		at,
		visits: c.visits,
		pageviews: c.pageviews,
		events: c.events,
		rows,
		limit,
		blocked: rows >= limit,
		...sync ? { sync } : {},
		...deletes ? { deletes } : {}
	};
}
/** The budget table row of the database `db`: Postgres, an own D1 database or the EmDash database on D1. */
const budgetTargetOf = (db) => db.dialect === "postgres" ? "postgres" : isOwnDatabase(db) ? "own" : "host";
/**
* Whether the D1 Free plan's daily rows bound the writes to `db`: the `small` profile on a SQLite database. Postgres
* has no daily row limit, so `small` there never blocks or slows writes (write guard, retention and delete rows, Search rows).
*/
const dailyRowsApply = (profile, db) => profile === "small" && db.dialect === "sqlite";
/**
* Write budget of the current UTC day: null unless `dailyRowsApply` (the `small` profile on D1). Answered from the state key while it
* is fresh; otherwise one statement counts the visits and sums the page views and events of the visits started since 00:00 UTC (it reads the
* visits of at most two local days) and the state is stored again. A blocked state holds until the UTC day ends.
*/
async function budgetState(db, kv, now, profile, timeZone = "UTC") {
	if (!dailyRowsApply(profile, db)) return null;
	const day = dayInZone(now, "UTC");
	const prev = await kv.get(KV_WRITE_BUDGET);
	if (prev && prev.day === day && (prev.blocked || now - prev.at < (prev.rows >= prev.limit * FAST_FROM ? CHECK_FAST_S : CHECK_SLOW_S))) return prev;
	const midnight = Date.parse(`${day}T00:00:00Z`) / 1e3;
	const days = [...new Set([dayInZone(midnight, timeZone), dayInZone(now, timeZone)])].map(visitDayKey);
	const [r] = await db.all(`${siteScan("ca_sessions")} SELECT COUNT(*) AS v, COALESCE(SUM(v.pageviews), 0) AS pv, COALESCE(SUM(v.events), 0) AS ev FROM s JOIN ca_sessions v ON v.site = s.site AND v.day IN (${days.map(() => "?").join(", ")}) WHERE v.started >= ?`, [...days, midnight]);
	const sync = await kv.get(KV_SYNC_ROWS);
	const state = writeBudget({
		visits: Number(r?.v ?? 0),
		pageviews: Number(r?.pv ?? 0),
		events: Number(r?.ev ?? 0)
	}, day, now, sync?.day === day ? sync.rows : 0, await deletedToday(kv, now) + await copiedToday(kv, now));
	await kv.set(KV_WRITE_BUDGET, state);
	return state;
}

//#endregion
//#region src/data/channels.json
var channels_default = [
	{
		"id": "paid_search",
		"channel": "Paid Search",
		"any": [
			{
				"list": "search",
				"medium": "^(.*cp.*|ppc|retargeting|paid.*)$"
			},
			{ "click": [
				"gclid",
				"msclkid",
				"gbraid",
				"wbraid",
				"yclid"
			] },
			{ "adsSource": "search" }
		]
	},
	{
		"id": "paid_social",
		"channel": "Paid Social",
		"any": [
			{
				"list": "social",
				"medium": "^(.*cp.*|ppc|retargeting|paid.*)$"
			},
			{ "click": ["ttclid", "twclid"] },
			{ "adsSource": "social" }
		]
	},
	{
		"id": "paid_video",
		"channel": "Paid Video",
		"any": [{
			"list": "video",
			"medium": "^(.*cp.*|ppc|retargeting|paid.*)$"
		}, { "adsSource": "video" }]
	},
	{
		"id": "paid_shopping",
		"channel": "Paid Shopping",
		"any": [{
			"list": "shopping",
			"medium": "^(.*cp.*|ppc|retargeting|paid.*)$"
		}, {
			"campaign": "^(.*(([^a-df-z]|^)shop|shopping).*)$",
			"medium": "^(.*cp.*|ppc|retargeting|paid.*)$"
		}]
	},
	{
		"id": "paid_other",
		"channel": "Paid Other",
		"any": [{ "medium": "^(.*cp.*|ppc|retargeting|paid.*)$" }]
	},
	{
		"id": "display",
		"channel": "Display",
		"any": [{ "mediumIn": [
			"display",
			"banner",
			"expandable",
			"interstitial",
			"cpm"
		] }]
	},
	{
		"id": "affiliates",
		"channel": "Affiliates",
		"any": [{ "mediumIn": ["affiliate"] }]
	},
	{
		"id": "cross_network",
		"channel": "Cross-network",
		"any": [{ "mediumIn": ["cross-network"] }]
	},
	{
		"id": "audio",
		"channel": "Audio",
		"any": [{ "mediumIn": ["audio"] }]
	},
	{
		"id": "sms",
		"channel": "SMS",
		"any": [{ "sourceIn": ["sms"] }, { "mediumIn": ["sms"] }]
	},
	{
		"id": "mobile_push",
		"channel": "Mobile Push",
		"any": [{ "sourceIn": ["firebase"] }, { "medium": "^(mobile|notification)$|push$" }]
	},
	{
		"id": "email",
		"channel": "Email",
		"any": [
			{ "sourceIn": [
				"gmail",
				"email",
				"e-mail",
				"e_mail",
				"e mail",
				"newsletter"
			] },
			{ "mediumIn": [
				"gmail",
				"email",
				"e-mail",
				"e_mail",
				"e mail",
				"newsletter"
			] },
			{ "refList": "webmail" }
		]
	},
	{
		"id": "ai_assistants",
		"channel": "AI Assistants",
		"any": [{ "list": "ai" }]
	},
	{
		"id": "organic_search",
		"channel": "Organic Search",
		"any": [{ "list": "search" }, { "mediumIn": ["organic"] }]
	},
	{
		"id": "organic_social",
		"channel": "Organic Social",
		"any": [
			{ "list": "social" },
			{ "mediumIn": [
				"social",
				"social-network",
				"social-media",
				"sm",
				"social network",
				"social media"
			] },
			{ "click": ["fbclid"] }
		]
	},
	{
		"id": "organic_video",
		"channel": "Organic Video",
		"any": [{ "list": "video" }, { "medium": "^(.*video.*)$" }]
	},
	{
		"id": "organic_shopping",
		"channel": "Organic Shopping",
		"any": [{ "list": "shopping" }, { "campaign": "^(.*(([^a-df-z]|^)shop|shopping).*)$" }]
	},
	{
		"id": "referral",
		"channel": "Referral",
		"any": [{ "mediumIn": [
			"referral",
			"app",
			"link"
		] }, { "referrer": true }]
	},
	{
		"id": "direct",
		"channel": "Direct",
		"any": [{ "direct": true }]
	},
	{
		"id": "unknown",
		"channel": "Unknown",
		"any": [{ "utm": true }]
	}
];

//#endregion
//#region src/data/hosts.json
var hosts_default = {
	search: [
		"google.*",
		"bing.com",
		"duckduckgo.com",
		"ecosia.org",
		"yahoo.*",
		"baidu.com",
		"yandex.*",
		"search.brave.com",
		"startpage.com",
		"qwant.com",
		"naver.com",
		"seznam.cz",
		"kagi.com",
		"ask.com",
		"aol.com",
		"mojeek.com",
		"sogou.com",
		"so.com",
		"daum.net"
	],
	social: [
		"facebook.com",
		"fb.com",
		"m.facebook.com",
		"l.facebook.com",
		"lm.facebook.com",
		"instagram.com",
		"l.instagram.com",
		"x.com",
		"t.co",
		"twitter.com",
		"linkedin.com",
		"lnkd.in",
		"reddit.com",
		"pinterest.*",
		"tiktok.com",
		"threads.net",
		"threads.com",
		"bsky.app",
		"mastodon.*",
		"news.ycombinator.com",
		"vk.com",
		"telegram.org",
		"t.me",
		"whatsapp.com",
		"wa.me",
		"snapchat.com",
		"tumblr.com",
		"quora.com",
		"discord.com",
		"weibo.com",
		"xing.com"
	],
	video: [
		"youtube.com",
		"youtu.be",
		"m.youtube.com",
		"vimeo.com",
		"twitch.tv",
		"dailymotion.com",
		"rumble.com"
	],
	shopping: [
		"shopping.google.com",
		"amazon.*",
		"ebay.*",
		"etsy.com",
		"aliexpress.com",
		"walmart.com",
		"idealo.*",
		"shopify.com"
	],
	ai: [
		"chatgpt.com",
		"chat.openai.com",
		"perplexity.ai",
		"claude.ai",
		"gemini.google.com",
		"copilot.microsoft.com",
		"you.com",
		"phind.com",
		"meta.ai",
		"grok.com",
		"deepseek.com",
		"chat.deepseek.com",
		"chat.mistral.ai",
		"poe.com",
		"duck.ai"
	],
	webmail: [
		"mail.google.com",
		"outlook.live.com",
		"outlook.office.com",
		"outlook.office365.com",
		"mail.yahoo.com",
		"mail.proton.me",
		"proton.me",
		"mail.aol.com",
		"mail.yandex.ru",
		"web.de",
		"gmx.net",
		"gmx.de",
		"icloud.com"
	],
	ignore: [
		"paypal.com",
		"stripe.com",
		"klarna.com",
		"adyen.com",
		"mollie.com",
		"checkout.com",
		"accounts.google.com",
		"login.microsoftonline.com",
		"login.live.com",
		"appleid.apple.com",
		"auth0.com",
		"okta.com",
		"3dsecure.io"
	]
};

//#endregion
//#region src/core/url.ts
/** Path, query and referrer helpers. */
const BASE = "http://h.invalid";
const UTM_KEYS = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content"
];
const CLICK_IDS = [
	"gclid",
	"msclkid",
	"gbraid",
	"wbraid",
	"yclid",
	"fbclid",
	"ttclid",
	"twclid"
];
/** `www.` stripped, lowercase host. */
function cleanHost(host) {
	return host.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}
function allowed(param, allowlist) {
	const p = param.toLowerCase();
	return allowlist.some((a) => a.endsWith("*") ? p.startsWith(a.slice(0, -1)) : p === a);
}
const SITE_SEARCH_TERM_MAX = 64;
/**
* A site search term as stored: trimmed, lowercased, whitespace collapsed, at most 64
* characters, and `redacted` when it holds an `@` or nine or more consecutive digits (personal data typed
* into a search box).
*/
function sanitizeSearchTerm(v) {
	const t = v.trim().toLowerCase().replace(/\s+/g, " ");
	if (t.includes("@") || /\d{9,}/.test(t)) return "redacted";
	return t.slice(0, SITE_SEARCH_TERM_MAX).trim();
}
/**
* Normalize a `path?query` (or absolute URL) against a query allowlist. `searchParams` (site search names,
* pageviews only) are kept too, with each value through `sanitizeSearchTerm`; an empty term is dropped.
*/
function normalizeUrl(u, allowlist, searchParams = []) {
	let url;
	try {
		url = new URL(u, BASE);
	} catch {
		return {
			path: "/",
			query: "",
			utm: {},
			clickIds: []
		};
	}
	let path = url.pathname.replace(/\/{2,}/g, "/");
	if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
	path = path.slice(0, 512) || "/";
	const kept = [];
	const utm = {};
	const clickIds = [];
	for (const [k, v] of url.searchParams) {
		const key = k.toLowerCase();
		if (UTM_KEYS.includes(key) && v.trim() && !utm[key]) utm[key] = v.trim().toLowerCase().slice(0, 128);
		if (CLICK_IDS.includes(key) && !clickIds.includes(key)) clickIds.push(key);
		if (searchParams.includes(key)) {
			const term = sanitizeSearchTerm(v);
			if (term) kept.push([key, term]);
		} else if (allowed(key, allowlist)) kept.push([key, v.slice(0, 256)]);
	}
	kept.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
	const query = new URLSearchParams(kept).toString().slice(0, 1024);
	return {
		path,
		query,
		utm,
		clickIds
	};
}
/** Host (lowercase, `www.` stripped) and path of an absolute http(s) referrer, or null. */
function parseReferrer(r) {
	if (!r) return null;
	try {
		const url = new URL(r);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		const host = cleanHost(url.hostname);
		if (!host) return null;
		return {
			host,
			path: url.pathname.slice(0, 256) || "/"
		};
	} catch {
		return null;
	}
}
/** A public suffix such as `com`, `de`, `co.uk` or `com.au` (not `evil.com`). */
const SUFFIX_RE = /^(?:[a-z]{2,6}|(?:co|com|net|org|ac|gov|edu|ne|or)\.[a-z]{2})$/;
/** Host matches a list entry: exact or subdomain (`bing.com`), or the base on any public suffix for `google.*`. */
function hostMatches(host, entry) {
	const h = cleanHost(host);
	const e = entry.toLowerCase();
	if (e.endsWith(".*")) {
		const base = e.slice(0, -2);
		const labels = h.split(".");
		return labels.some((l, i) => l === base && SUFFIX_RE.test(labels.slice(i + 1).join(".")));
	}
	return h === e || h.endsWith(`.${e}`);
}
function hostInList(host, list) {
	return !!host && !!list && list.some((e) => hostMatches(host, e));
}

//#endregion
//#region src/core/channels.ts
const DEFAULT_HOSTS = hosts_default;
const BUILTIN_CHANNEL_RULES = channels_default;
const reCache = /* @__PURE__ */ new Map();
function re(p) {
	if (!reCache.has(p)) {
		let r = null;
		try {
			r = new RegExp(p, "i");
		} catch {
			r = null;
		}
		reCache.set(p, r);
	}
	return reCache.get(p) ?? null;
}
/** Bare label of a two-label list entry: `google.*` and `bing.com` give `google` and `bing`; deeper hosts give null. */
function entryLabel(entry) {
	const parts = entry.toLowerCase().split(".");
	if (parts.length !== 2) return null;
	return parts[0] || null;
}
/** utm_source names a host of the list: a host value is matched as a host, a bare word against entry labels. */
function sourceInList(source, list) {
	if (!source) return false;
	if (source.includes(".")) return hostInList(source, list);
	return list.some((e) => entryLabel(e) === source);
}
function test(c, i, hosts) {
	const { refHost, utm, clickIds } = i;
	const src = utm.utm_source;
	const med = utm.utm_medium;
	const camp = utm.utm_campaign;
	if (c.list && !(hostInList(refHost, hosts[c.list]) || sourceInList(src, hosts[c.list]))) return false;
	if (c.refList && !hostInList(refHost, hosts[c.refList])) return false;
	if (c.medium && !(med && re(c.medium)?.test(med))) return false;
	if (c.source && !(src && re(c.source)?.test(src))) return false;
	if (c.campaign && !(camp && re(c.campaign)?.test(camp))) return false;
	if (c.mediumIn && !(med && c.mediumIn.includes(med))) return false;
	if (c.sourceIn && !(src && c.sourceIn.includes(src))) return false;
	if (c.click && !c.click.some((k) => clickIds.includes(k))) return false;
	if (c.adsSource) {
		if (!src || !/ads?$/.test(src)) return false;
		if (!hosts[c.adsSource].map(entryLabel).filter((l) => !!l).some((l) => src.includes(l))) return false;
	}
	const hasUtm = Object.values(utm).some(Boolean);
	if (c.referrer && !refHost) return false;
	if (c.utm && !hasUtm) return false;
	if (c.direct && (refHost || hasUtm || clickIds.length > 0)) return false;
	return true;
}
/** Built-ins (minus disabled ids) merged with user rules by priority; ties keep user rules first. */
function buildChannelRules(user = [], disabled = []) {
	const builtins = BUILTIN_CHANNEL_RULES.map((rule, idx) => ({
		rule,
		p: (idx + 1) * 10,
		u: 1,
		idx
	})).filter((x) => !disabled.includes(x.rule.id));
	const users = user.map((r, idx) => ({
		rule: r,
		p: r.priority ?? 0,
		u: 0,
		idx
	}));
	return [...builtins, ...users].sort((a, b) => a.p - b.p || a.u - b.u || a.idx - b.idx).map((x) => x.rule);
}
/** First matching rule wins; nothing matched (no referrer, no UTM) is Direct. */
function classifyChannel(input, opts = {}) {
	const i = {
		refHost: input.refHost ? cleanHost(input.refHost) : null,
		utm: input.utm ?? {},
		clickIds: input.clickIds ?? []
	};
	const hosts = opts.hosts ?? DEFAULT_HOSTS;
	const source = i.refHost || i.utm.utm_source || (Object.values(i.utm).some(Boolean) ? "(not set)" : "(direct)");
	for (const rule of opts.rules ?? BUILTIN_CHANNEL_RULES) if (rule.any.some((c) => test(c, i, hosts))) return {
		channel: rule.channel,
		source
	};
	return {
		channel: "Direct",
		source
	};
}
/** A referrer host that never starts a source: the site itself, built-in ignore list, or extra hosts. */
function isIgnoredReferrer(host, siteHost, extra = [], hosts = DEFAULT_HOSTS) {
	const h = cleanHost(host);
	return !!siteHost && h === cleanHost(siteHost) || hostInList(h, hosts.ignore) || hostInList(h, extra);
}

//#endregion
//#region src/core/session.ts
/** Longest visit the `(site, day, sid)` lookup reaches: the visit started today or yesterday. */
const MAX_VISIT_MINUTES = 1440;
/** An alias lives as long as the longest visit: an engagement update after a long read on a later page still finds its visit. */
const ALIAS_S = MAX_VISIT_MINUTES * 60;
function isActive(s, now, maxSessionMinutes) {
	return now - s.last_seen <= s.window_s && now - s.started <= maxSessionMinutes * 60;
}
function screenBucket(w) {
	if (w === void 0 || !Number.isFinite(w) || w <= 0) return null;
	if (w < 576) return "xs";
	if (w < 768) return "sm";
	if (w < 992) return "md";
	if (w < 1200) return "lg";
	return "xl";
}
function firstTouch(evt, meta, now, cfg, sid, vkey) {
	const url = normalizeUrl(evt.u ?? "/", cfg.queryAllowlist);
	const ref = parseReferrer(evt.r);
	const ext = ref && !isIgnoredReferrer(ref.host, meta.siteHost, cfg.ignoreReferrerHosts, cfg.hosts) ? ref : null;
	const { channel, source } = classifyChannel({
		refHost: ext?.host ?? null,
		utm: url.utm,
		clickIds: url.clickIds
	}, {
		...cfg.channelRules ? { rules: cfg.channelRules } : {},
		...cfg.hosts ? { hosts: cfg.hosts } : {}
	});
	const isPv = evt.t === "pv";
	return {
		site: meta.site,
		sid,
		vkey,
		day: dayInZone(now, cfg.siteTimezone),
		hour: hourInZone(now, cfg.siteTimezone),
		started: now,
		last_seen: now,
		window_s: cfg.sessionWindowMinutes * 60,
		entry_path: url.path,
		exit_path: url.path,
		pageviews: isPv ? 1 : 0,
		events: isPv ? 0 : 1,
		engaged_ms: 0,
		max_scroll: 0,
		interacted: 0,
		ref_host: ext?.host ?? null,
		ref_path: ext?.path ?? null,
		channel,
		source,
		utm_source: url.utm.utm_source ?? null,
		utm_medium: url.utm.utm_medium ?? null,
		utm_campaign: url.utm.utm_campaign ?? null,
		utm_term: url.utm.utm_term ?? null,
		utm_content: url.utm.utm_content ?? null,
		country: meta.country ?? null,
		region: meta.region ?? null,
		device: meta.ua.device,
		browser: meta.ua.browser,
		browser_major: meta.ua.browserMajor,
		os: meta.ua.os,
		lang: meta.lang ?? null,
		screen: screenBucket(evt.w),
		host: meta.siteHost ?? null
	};
}
async function cont(store, s, evt, now, cfg) {
	const isPv = evt.t === "pv";
	const patch = {
		now,
		pageviews: isPv ? 1 : 0,
		events: isPv ? 0 : 1
	};
	if (isPv) {
		patch.exitPath = normalizeUrl(evt.u ?? "/", cfg.queryAllowlist).path;
		if (cfg.maxPageviewsPerSession !== void 0 && s.pageviews >= cfg.maxPageviewsPerSession) return {
			session: s,
			created: false,
			skipped: "session_cap"
		};
		if (cfg.reloadDedupeSeconds && s.pageviews > 0 && s.exit_path === patch.exitPath && now >= s.last_seen && now - s.last_seen <= cfg.reloadDedupeSeconds) return {
			session: s,
			created: false,
			skipped: "reload"
		};
	} else if (cfg.maxEventsPerSession !== void 0 && s.events >= cfg.maxEventsPerSession) return {
		session: s,
		created: false,
		skipped: "session_cap"
	};
	await store.continue(s.site, s.sid, patch);
	return {
		session: {
			...s,
			last_seen: Math.max(s.last_seen, now),
			exit_path: patch.exitPath ?? s.exit_path,
			pageviews: s.pageviews + patch.pageviews,
			events: s.events + patch.events
		},
		created: false
	};
}
/**
* Session resolution. `cfg.sessionWindowMinutes` applies to new sessions only;
* existing rows keep their own `window_s`. Never changes first-touch fields of an existing session.
*/
async function resolveSession(evt, meta, now, cfg, store) {
	const W = cfg.sessionWindowMinutes * 60;
	const site = meta.site;
	const sidIn = isSid(evt.sid) ? evt.sid : null;
	let own = null;
	let canon = null;
	if (sidIn) {
		own = await store.getSession(site, sidIn);
		if (own && isActive(own, now, cfg.maxSessionMinutes)) return cont(store, own, evt, now, cfg);
		canon = await store.getAlias(site, sidIn, now);
		const s = canon ? await store.getSession(site, canon) : null;
		if (s && isActive(s, now, cfg.maxSessionMinutes)) return cont(store, s, evt, now, cfg);
	}
	const today = saltDay(now, cfg.saltTimezone, cfg.saltRotationHour);
	const currentKey = await meta.vkeyFor(today);
	const keys = [currentKey];
	if (now < saltBoundary(now, cfg.saltTimezone, cfg.saltRotationHour) + W) keys.push(await meta.vkeyFor(addDays(today, -1)));
	const found = await store.findActiveByVkey(site, keys, now);
	if (found && isActive(found, now, cfg.maxSessionMinutes)) {
		if (sidIn && sidIn !== found.sid) await store.putAlias(site, sidIn, found.sid, now + ALIAS_S);
		return cont(store, found, evt, now, cfg);
	}
	const sid = sidIn && !own && !canon ? sidIn : randomId(20);
	if (sidIn && (own || canon)) await store.putAlias(site, sidIn, sid, now + ALIAS_S);
	const row = firstTouch(evt, meta, now, cfg, sid, currentKey);
	await store.create(row);
	return {
		session: row,
		created: true
	};
}
/** In-memory `SessionStore` for tests. */
var MemorySessionStore = class {
	sessions = /* @__PURE__ */ new Map();
	aliases = /* @__PURE__ */ new Map();
	async getSession(site, sid) {
		const s = this.sessions.get(`${site}|${sid}`);
		return s ? { ...s } : null;
	}
	async findActiveByVkey(site, vkeys, now) {
		let best = null;
		for (const s of this.sessions.values()) if (s.site === site && vkeys.includes(s.vkey) && s.last_seen + s.window_s >= now && (!best || s.last_seen > best.last_seen)) best = s;
		return best ? { ...best } : null;
	}
	async getAlias(site, sid, now) {
		const a = this.aliases.get(`${site}|${sid}`);
		return a && a.expires >= now ? a.canon : null;
	}
	async putAlias(site, sid, canon, expires) {
		this.aliases.set(`${site}|${sid}`, {
			canon,
			expires
		});
	}
	async create(row) {
		const k = `${row.site}|${row.sid}`;
		if (this.sessions.has(k)) throw new Error(`duplicate session ${k}`);
		this.sessions.set(k, { ...row });
	}
	async continue(site, sid, p) {
		const s = this.sessions.get(`${site}|${sid}`);
		if (!s) return;
		s.last_seen = Math.max(s.last_seen, p.now);
		if (p.exitPath !== void 0) s.exit_path = p.exitPath;
		s.pageviews += p.pageviews;
		s.events += p.events;
	}
};
/**
* One-request store: answers from the rows of one read (`readVisits` in `apply.ts`) and records the writes
* the resolution decided, which the caller then turns into statements.
*/
var RequestStore = class extends MemorySessionStore {
	created = null;
	continued = null;
	alias = null;
	constructor(site, rows, alias) {
		super();
		for (const r of [...rows].sort((a, b) => a.started - b.started)) this.sessions.set(`${r.site}|${r.sid}`, { ...r });
		if (alias) this.aliases.set(`${site}|${alias.sid}`, {
			canon: alias.canon,
			expires: Number.POSITIVE_INFINITY
		});
	}
	async putAlias(site, sid, canon, expires) {
		this.alias = {
			sid,
			canon,
			expires
		};
		await super.putAlias(site, sid, canon, expires);
	}
	async create(row) {
		this.created = { ...row };
		await super.create(row);
	}
	async continue(site, sid, p) {
		this.continued = {
			sid,
			day: this.sessions.get(`${site}|${sid}`)?.day ?? ""
		};
		await super.continue(site, sid, p);
	}
};

//#endregion
//#region src/core/apply.ts
/** An engagement update may open an entry (its page view not seen yet) only while the document is below this size. */
/** A visit this young may get an engagement update before its page view's entry (that page view still in flight). */
const YOUNG_VISIT_S = 30;
const MAX_DOC_BYTES = 65536;
const SESSION_COLS = [
	"site",
	"sid",
	"vkey",
	"day",
	"hour",
	"started",
	"last_seen",
	"window_s",
	"entry_path",
	"exit_path",
	"pageviews",
	"events",
	"engaged_ms",
	"max_scroll",
	"interacted",
	"ref_host",
	"ref_path",
	"channel",
	"source",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
	"country",
	"region",
	"device",
	"browser",
	"browser_major",
	"os",
	"lang",
	"screen",
	"host"
];
const SESSION_INTS = [
	"hour",
	"started",
	"last_seen",
	"window_s",
	"pageviews",
	"events",
	"engaged_ms",
	"max_scroll",
	"interacted"
];
/** Postgres returns BIGINT as strings; normalise numeric columns. The day goes back to its ISO form. */
function toSession(r) {
	const row = { ...r };
	for (const c of SESSION_INTS) row[c] = Number(row[c]);
	const d = String(row.day);
	row.day = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
	return row;
}
const fn = (d, name) => raw(d === "postgres" ? name === "max" ? "GREATEST" : "jsonb_build_object" : name === "max" ? "MAX" : "jsonb_object");
/** Today and yesterday in the site time zone: the days a live visit can have started on. */
function liveDays(now, tz) {
	const today = dayInZone(now, tz);
	return [visitDayKey(today), visitDayKey(addDays(today, -1))];
}
/**
* S4: in one statement, the client sid's alias, its own visit, the alias's visit and the live visits of the
* visitor keys, all among visits started today or yesterday. One row (all NULL) when nothing matches.
*/
function visitReadSql(d, site, now, tz, sid, vkeys, key) {
	const s = q(d);
	const [today, yday] = liveDays(now, tz);
	return s`SELECT a.canon AS canon, ${raw(SESSION_COLS.map((c) => `v.${c}`).join(", "))}${key ? s`, ${docGet(d, "v.hits", key, "t")} IS NOT NULL AS seen` : raw("")} FROM (SELECT (SELECT canon FROM ca_aliases WHERE site = ${site} AND sid = ${sid} AND expires >= ${now}) AS canon) a LEFT JOIN ca_sessions v ON v.site = ${site} AND v.day IN (${today}, ${yday}) AND (v.sid = ${sid} OR v.sid = a.canon${vkeys.length ? s` OR (v.vkey IN (${join(vkeys.map((k) => s`${k}`))}) AND v.last_seen + v.window_s >= ${now})` : raw("")})`;
}
async function readVisits(db, site, now, tz, sid, vkeys, key) {
	const f = visitReadSql(db.dialect, site, now, tz, sid, vkeys, key);
	const rows = await db.all(f.sql, f.params);
	const canon = rows[0]?.canon ?? null;
	const visits = rows.filter((r) => r.sid !== null && r.sid !== void 0);
	return {
		canon,
		rows: visits.map(toSession),
		seen: visits.some((r) => r.seen === true || Number(r.seen) === 1)
	};
}
/** The visit of a client sid (through its live alias) among visits started today or yesterday. */
function bySid(d, site, sid, now, tz, alias = "") {
	const [today, yday] = liveDays(now, tz);
	const v = raw(alias ? `${alias}.` : "");
	return q(d)`${v}site = ${site} AND ${v}day IN (${today}, ${yday}) AND ${v}sid = COALESCE((SELECT canon FROM ca_aliases WHERE site = ${site} AND sid = ${sid} AND expires >= ${now}), ${sid})`;
}
/** One visit by its key. */
function byKey(d, site, day, sid) {
	return q(d)`site = ${site} AND day = ${visitDayKey(day)} AND sid = ${sid}`;
}
const maxSeconds = (cfg) => Math.min(cfg.maxSessionMinutes, MAX_VISIT_MINUTES) * 60;
/**
* Live and below the cap, and no entry under the key yet (the replay guard). An event carrying the sid of a stored
* visit belongs to the page that visit shows, so it skips the inactivity window (a long read, then a click); a page
* view after the window starts a new visit.
*/
function liveGuard(d, m) {
	const s = q(d);
	const cap = m.t === "pv" ? s`pageviews < ${m.cfg.maxPageviewsPerSession ?? 500}` : m.rev ? raw("1 = 1") : s`events < ${m.cfg.maxEventsPerSession ?? 200}`;
	const win = m.t === "pv" ? s` AND ${m.now} - last_seen <= window_s` : raw("");
	return s`${docGet(d, "hits", m.key, "t")} IS NULL${win} AND ${m.now} - started <= ${maxSeconds(m.cfg)} AND ${cap}`;
}
/**
* S1 and S3: add the entry to a known visit. The entry is written with explicit-field `jsonb_set`, not
* `jsonb_patch`: with the replay guard the entry has no `t` yet, so setting fields keeps an engagement
* update that arrived first exactly as a merge would, and on a 50 KB document it costs a fraction of the SQL
* time of a patch, which rewrites the whole object (measured in `tests/apply.test.ts`; on D1: 4.4 ms
* against 0.9 ms).
*/
function entryUpdate(d, m, target, reentry = false) {
	const s = q(d);
	const f = m.fields;
	if (m.t === "pv") return s`UPDATE ca_sessions SET hits = ${docSet(d, "hits", m.key, {
		t: s`${m.now} - started`,
		p: f.p,
		qs: f.qs,
		nt: f.nt,
		re: reentry ? 1 : void 0,
		hs: f.hs
	})}, pageviews = pageviews + 1, last_seen = ${fn(d, "max")}(last_seen, ${m.now}), exit_path = ${f.p ?? null}${raw(reentry ? ", reentries = reentries + 1" : "")} WHERE ${target} AND ${liveGuard(d, m)} RETURNING sid`;
	return s`UPDATE ca_sessions SET hits = ${docSet(d, "hits", m.key, {
		t: s`${m.now} - started`,
		n: f.n,
		p: f.p ?? raw("exit_path"),
		pr: m.props ? docJson(d, m.props) : void 0,
		hs: f.hs
	})}, events = events + 1, last_seen = ${s`CASE WHEN ${m.now} - last_seen <= window_s THEN ${fn(d, "max")}(last_seen, ${m.now}) ELSE last_seen END`} WHERE ${target} AND ${liveGuard(d, m)} RETURNING sid`;
}
/** Slow path, new visit: the row with its first entry inside; nothing on a conflict (a racing first event). */
function visitInsert(d, row, m) {
	const s = q(d);
	const vals = SESSION_COLS.map((c) => c === "day" ? s`${visitDayKey(row.day)}` : s`${row[c]}`);
	const f = m.fields;
	const entry = m.t === "pv" ? docObject(d, {
		t: 0,
		p: f.p,
		qs: f.qs,
		nt: f.nt,
		hs: f.hs
	}) : docObject(d, {
		t: 0,
		n: f.n,
		p: f.p ?? row.exit_path,
		pr: m.props ? docJson(d, m.props) : void 0,
		hs: f.hs
	});
	return s`INSERT INTO ca_sessions (${raw(SESSION_COLS.join(", "))}, hits) VALUES (${join(vals)}, ${fn(d, "object")}(${m.key}, ${entry})) ON CONFLICT DO NOTHING RETURNING sid`;
}
/** S2: totals move by the difference to the stored value, so repeated and reordered updates converge. */
function engageUpdate(d, m) {
	const s = q(d);
	const max = fn(d, "max");
	const old = (f) => s`COALESCE(${docGet(d, "hits", m.key, f, "int")}, 0)`;
	const grown = (f, v) => v === void 0 ? void 0 : s`${max}(${v}, ${old(f)})`;
	const set = [s`engaged_ms = engaged_ms + ${max}(0, ${m.d} - ${old("d")})`];
	if (m.e !== void 0) set.push(s`visible_ms = visible_ms + ${max}(0, ${m.e} - ${old("e")})`);
	if (m.s !== void 0) set.push(s`max_scroll = ${max}(max_scroll, ${m.s})`);
	if (m.i !== void 0) set.push(s`interacted = ${max}(interacted, ${m.i})`);
	set.push(s`hits = ${docSet(d, "hits", m.key, {
		d: grown("d", m.d),
		e: grown("e", m.e),
		s: grown("s", m.s),
		x: grown("x", m.x)
	})}`);
	const size = raw(d === "postgres" ? "pg_column_size(hits)" : "length(hits)");
	const known = s`(${docGet(d, "hits", m.key, "t")} IS NOT NULL OR ${docGet(d, "hits", m.key, "d")} IS NOT NULL OR (started >= ${m.now - YOUNG_VISIT_S} AND pageviews < ${m.cap} AND ${size} < ${MAX_DOC_BYTES}))`;
	return s`UPDATE ca_sessions SET ${join(set)} WHERE ${bySid(d, m.site, m.sid, m.now, m.tz)} AND ${known}`;
}
/**
* Revenue: one `ca_events` row per order, attached to the client sid's visit (the caller moves it when the event
* lands on another visit). A conflict is a
* duplicate order and costs 0 rows. (SQLite needs the `WHERE` of an `INSERT ... SELECT` before `ON CONFLICT`.)
*/
function orderInsert(d, m) {
	const s = q(d);
	const tz = m.cfg.siteTimezone;
	const on = m.sid ? bySid(d, m.site, m.sid, m.now, tz, "v") : raw("1 = 0");
	const props = m.props ? JSON.stringify(m.props) : null;
	const val = {
		sql: d === "postgres" ? "CAST(? AS DOUBLE PRECISION)" : "?",
		params: [m.rev?.val ?? null]
	};
	return s`INSERT INTO ca_events (site, id, day, ts, sday, sid, name, path, props, val, cur) SELECT ${m.site}, ${m.key}, ${dayInt(dayInZone(m.now, tz))}, ${m.now}, v.day, v.sid, ${m.fields.n ?? ""}, COALESCE(${m.fields.p ?? null}, v.exit_path), ${props}, ${val}, ${m.rev?.cur ?? null} FROM (SELECT 1 AS one) o LEFT JOIN ca_sessions v ON ${on} WHERE 1 = 1 ON CONFLICT (site, id) DO NOTHING RETURNING sid`;
}
/**
* S5: an alias lives as long as the longest visit, so it is written again when the canonical visit changes, or when
* less than half its life is left (an alias written with a shorter life); 0 rows otherwise.
*/
function aliasUpsert(d, site, a) {
	return q(d)`INSERT INTO ca_aliases (site, sid, canon, expires) VALUES (${site}, ${a.sid}, ${a.canon}, ${a.expires}) ON CONFLICT (site, sid) DO UPDATE SET canon = excluded.canon, expires = excluded.expires WHERE ca_aliases.canon <> excluded.canon OR ca_aliases.expires < excluded.expires - ${MAX_VISIT_MINUTES * 30}`;
}
/** S6: error pages as counters per day, status, path and referrer. */
function srvUpsert(d, m) {
	return q(d)`INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES (${m.site}, ${dayInt(dayInZone(m.now, m.tz))}, ${m.status}, ${m.path}, ${m.ref}, ${1}, ${m.now}) ${raw(upsertClause("ca_srv", [
		"site",
		"day",
		"status",
		"path",
		"ref"
	], ["last_ts"], ["n"]))}`;
}
/** The guard state of this isolate per database, kept as long as `budgetState` would answer from its key. */
const guardCache = /* @__PURE__ */ new Map();
/**
* Whether the daily write allowance stops ingest (`small` profile only). The state is kept in the isolate until
* `budgetState` would check again (hourly, every 10 minutes above a quarter of the limit, a blocked state until the
* next UTC day), so between checks a write costs no extra statement and a blocked event costs none at all; the
* first event after a check is due pays one state read (and, when the stored state is stale, the page view sum).
* A failed check lets writes through for a minute: the guard is an estimate and must not stop ingest by itself.
*/
async function writesBlocked(db, g, now) {
	if (!dailyRowsApply(g.profile, db)) return false;
	const key = g.key ?? "";
	const hit = guardCache.get(key);
	if (hit?.profile === g.profile && now < hit.until) return hit.blocked;
	let st;
	try {
		st = await budgetState(db, g.kv, now, g.profile, g.tz);
	} catch {
		guardCache.set(key, {
			profile: g.profile,
			until: now + 60,
			blocked: false
		});
		return false;
	}
	if (!st) return false;
	const nextDay = Date.parse(`${st.day}T00:00:00Z`) / 1e3 + 86400;
	const until = st.blocked ? nextDay : Math.min(nextDay, st.at + (st.rows >= st.limit * FAST_FROM ? CHECK_FAST_S : CHECK_SLOW_S));
	guardCache.set(key, {
		profile: g.profile,
		until,
		blocked: st.blocked
	});
	return st.blocked;
}
/** Applies events with the statements above, directly on the database; with a guard, not while the day's writes are blocked. */
var D1Sink = class {
	constructor(db, guard) {
		this.db = db;
		this.guard = guard;
	}
	async ingest(m) {
		if (this.guard && await writesBlocked(this.db, this.guard, m.now)) return "budget_blocked";
		const d = this.db.dialect;
		if (m.t === "srv") {
			const f = srvUpsert(d, m);
			await this.db.run(f.sql, f.params);
			return "ok";
		}
		if (m.t === "en") {
			const f = engageUpdate(d, m);
			return (await this.db.run(f.sql, f.params)).changes > 0 ? "ok" : "orphan_update";
		}
		return this.visit(m);
	}
	async returns(f) {
		return this.db.all(f.sql, f.params);
	}
	async visit(m) {
		const d = this.db.dialect;
		const tz = m.cfg.siteTimezone;
		let attached = null;
		if (m.rev) {
			const r = await this.returns(orderInsert(d, m));
			if (!r.length) {
				const own = q(d)`${bySid(d, m.site, m.sid ?? "", m.now, tz)} AND (day, sid) IN (SELECT sday, sid FROM ca_events WHERE site = ${m.site} AND id = ${m.key})`;
				if (m.sid && (await this.returns(entryUpdate(d, m, own))).length) return "ok";
				return "duplicate_order";
			}
			attached = r[0]?.sid ?? null;
		}
		if (m.sid && !m.fresh && (await this.returns(entryUpdate(d, m, bySid(d, m.site, m.sid, m.now, tz)))).length) return "ok";
		const read = await readVisits(this.db, m.site, m.now, tz, m.sid, Object.values(m.keys), m.key);
		if (read.seen) return "ok";
		const store = new RequestStore(m.site, read.rows, m.sid && read.canon ? {
			sid: m.sid,
			canon: read.canon
		} : null);
		const cfg = {
			...m.cfg,
			maxSessionMinutes: Math.min(m.cfg.maxSessionMinutes, MAX_VISIT_MINUTES),
			...m.rev && { maxEventsPerSession: void 0 }
		};
		const vkeyFor = async (day) => {
			const k = m.keys[day];
			if (!k) throw new Error(`no visitor key for salt day ${day}`);
			return k;
		};
		const res = await resolveSession(m.evt, {
			...m.meta,
			vkeyFor
		}, m.now, cfg, store);
		if (store.alias) {
			const f = aliasUpsert(d, m.site, store.alias);
			await this.db.run(f.sql, f.params);
		}
		if (res.skipped) return res.skipped;
		const visit = res.session;
		const target = byKey(d, m.site, visit.day, visit.sid);
		let wrote;
		if (store.created) wrote = (await this.returns(visitInsert(d, store.created, m))).length > 0 || (await this.returns(entryUpdate(d, m, target))).length > 0;
		else wrote = (await this.returns(entryUpdate(d, m, target, m.t === "pv" && !!m.reentry))).length > 0;
		if (!wrote) {
			const has = q(d)`SELECT 1 AS ok FROM ca_sessions WHERE ${target} AND ${docGet(d, "hits", m.key, "t")} IS NOT NULL`;
			if (!(await this.db.all(has.sql, has.params)).length) throw new Error("ingest: the visit changed between the read and the write");
		}
		if (m.rev && attached !== visit.sid) {
			const f = q(d)`UPDATE ca_events SET sday = ${visitDayKey(visit.day)}, sid = ${visit.sid} WHERE site = ${m.site} AND id = ${m.key}`;
			await this.db.run(f.sql, f.params);
		}
		return "ok";
	}
};

//#endregion
//#region src/core/drops.ts
/** Age of the oldest count at which a request flushes. */
const FLUSH_MS = 1e4;
/** The flush statement: all counters in one JSON parameter, one row written per site, day and reason. */
function dropsFlushSql(d, rows) {
	const x = paramRows(d, rows, "x");
	const f = (name, as) => field(d, "x", name, as);
	return {
		sql: `INSERT INTO ca_drops (site, day, reason, n) SELECT ${f("site")}, ${f("day", "int")}, ${f("reason")}, ${f("n", "int")} FROM ${x.sql} WHERE 1 = 1 ${upsertChanged(d, "ca_drops", [
			"site",
			"day",
			"reason"
		], [], ["n"])}`,
		params: x.params
	};
}
const SEP = "\0";
/** The counters of one isolate. */
var DropCounters = class {
	pending = /* @__PURE__ */ new Map();
	/** Epoch ms of the oldest pending count. */
	oldest = 0;
	/** A request's `after()` is already waiting out the window. */
	armed = false;
	/** With site routing (`databases` option): each site's counts go to its own database, not to the `db` of the flush. */
	route;
	constructor(windowMs = FLUSH_MS, clock = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
		this.windowMs = windowMs;
		this.clock = clock;
		this.sleep = sleep;
	}
	/** Count one drop (or `n`); `day` is the ISO day in the site time zone. Synchronous: no I/O. */
	add(site, day, reason, n = 1) {
		if (!this.pending.size) this.oldest = this.clock();
		const k = [
			site,
			day,
			reason
		].join(SEP);
		this.pending.set(k, (this.pending.get(k) ?? 0) + n);
	}
	/** Counts not written yet. */
	get size() {
		return this.pending.size;
	}
	rows() {
		return [...this.pending].map(([k, n]) => {
			const [site, day, reason] = k.split(SEP);
			return {
				site,
				day: dayInt(day),
				reason,
				n
			};
		});
	}
	/**
	* Write the counters in one statement (one per database with site routing). On failure the counts of the failed
	* database are kept for the next flush and the error is thrown.
	*/
	async flush(db) {
		if (!this.pending.size) return 0;
		const batch = this.pending;
		this.pending = /* @__PURE__ */ new Map();
		const groups = /* @__PURE__ */ new Map();
		for (const e of batch) {
			const g = this.route?.binding(e[0].split(SEP)[0]) ?? "";
			groups.get(g)?.push(e) ?? groups.set(g, [e]);
		}
		let written = 0;
		let failed;
		for (const entries of groups.values()) try {
			const rows = entries.map(([k, n]) => {
				const [s, day, reason] = k.split(SEP);
				return {
					site: s,
					day: dayInt(day),
					reason,
					n
				};
			});
			const target = this.route ? await this.route(rows[0]?.site) : db;
			const f = dropsFlushSql(target.dialect, rows);
			await target.run(f.sql, f.params);
			written += rows.length;
		} catch (err) {
			failed ??= err;
			for (const [k, n] of entries) this.pending.set(k, (this.pending.get(k) ?? 0) + n);
		}
		if (failed) {
			this.oldest = this.clock();
			throw failed;
		}
		return written;
	}
	/**
	* Run inside the calling request's own `after()`: flush when the oldest count is due, otherwise wait out the
	* window unless another request already does. Never throws (a failed flush keeps its counts).
	*/
	async settle(db) {
		if (!this.pending.size) return;
		const wait = this.oldest + this.windowMs - this.clock();
		if (wait > 0) {
			if (this.armed) return;
			this.armed = true;
			try {
				await this.sleep(wait);
			} finally {
				this.armed = false;
			}
		}
		await this.flush(db).catch(() => {});
	}
	/** Test helper: forget every count. */
	clear() {
		this.pending.clear();
		this.armed = false;
	}
};
/** The counters of this isolate. */
const drops = new DropCounters();

//#endregion
//#region src/multisite/registry.ts
/**
* Client sites registry: the `sites` storage collection, its validation rules and a 60 s
* in-memory snapshot keyed by `key` and by `id`, invalidated on save (the channel rules pattern).
*/
const SITE_ID_RE = /^[a-z0-9-]{1,32}$/;
const SITE_KEY_RE = /^[a-z0-9]{20}$/;
/** Lowercase hostname with at least one dot, no scheme, no port, no path. */
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const MAX_HOSTS = 10;
const MAX_SITES = 500;
const TTL_MS = 6e4;
const ClientSiteSchema = z.object({
	id: z.string().regex(SITE_ID_RE),
	label: z.string().min(1).max(64),
	key: z.string().regex(SITE_KEY_RE),
	hosts: z.array(z.string().regex(HOST_RE)).min(1).max(MAX_HOSTS),
	gscProperty: z.string().max(512).default(""),
	bingSiteUrl: z.string().max(512).default(""),
	paused: z.boolean().default(false),
	created: z.number().int(),
	defaultCurrency: z.string().max(8).optional(),
	acceptClientRevenue: z.boolean().optional(),
	siteSearchParams: z.array(z.string().regex(/^[a-z0-9_]{1,16}$/)).max(5).optional(),
	linked: z.boolean().optional()
});
const EMPTY = {
	byKey: /* @__PURE__ */ new Map(),
	byId: /* @__PURE__ */ new Map(),
	sites: [],
	linked: []
};
let snap;
/** Drop the snapshot so the next read reloads (after a save, a delete or a key change). */
function invalidateRegistry() {
	snap = void 0;
	linkedSnap = void 0;
}
/** Every valid record of the collection, sorted by label. */
async function loadSites(coll) {
	if (!coll) return [];
	const out = [];
	let cursor;
	for (let i = 0; i < MAX_SITES / 100; i++) {
		const page = await coll.query({
			limit: 100,
			...cursor ? { cursor } : {}
		});
		for (const it of page.items) {
			const r = ClientSiteSchema.safeParse(it.data);
			if (r.success) out.push(r.data);
		}
		if (!page.hasMore || !page.cursor) break;
		cursor = page.cursor;
	}
	return out.sort((a, b) => a.label.localeCompare(b.label) || (a.id < b.id ? -1 : 1));
}
/** The registry snapshot, reloaded at most every 60 s per isolate; the last good one survives a read error. */
async function registry(coll, nowMs = Date.now()) {
	if (snap && nowMs - snap.at < TTL_MS) return snap.reg;
	let reg = snap?.reg ?? EMPTY;
	try {
		const all = await loadSites(coll);
		const sites = all.filter((s) => !s.linked);
		reg = {
			sites,
			linked: all.filter((s) => s.linked),
			byKey: new Map(all.map((s) => [s.key, s])),
			byId: new Map(sites.map((s) => [s.id, s]))
		};
	} catch {}
	snap = {
		reg,
		at: nowMs
	};
	return reg;
}
const newSiteKey = () => randomId(20);
/** Hosts of the client sites linked to this install's own site. */
const linkedHosts = (sites) => sites.flatMap((s) => s.linked ? s.hosts : []);
/** Options key holding `linkedHosts` for the page script, written by the sites routes. */
const LINKED_HOSTS_KEY = "sites:linked";
let linkedSnap;
/** `LINKED_HOSTS_KEY`, read at most every 60 s per isolate (the page script must not cost a read per load). */
async function linkedHostsOf(kv, nowMs = Date.now()) {
	if (linkedSnap && nowMs - linkedSnap.at < TTL_MS) return linkedSnap.hosts;
	let hosts = linkedSnap?.hosts ?? [];
	try {
		const v = await kv.get(LINKED_HOSTS_KEY);
		hosts = Array.isArray(v) ? v.filter((h) => typeof h === "string" && HOST_RE.test(h)) : [];
	} catch {}
	linkedSnap = {
		hosts,
		at: nowMs
	};
	return hosts;
}
/** Hostname of an origin or URL, lowercase, or null. */
function hostnameOf(origin) {
	if (!origin) return null;
	try {
		return new URL(origin).hostname.toLowerCase();
	} catch {
		return null;
	}
}
/** Registry rules beyond the field formats; returns the first problem in plain words, or null. */
function siteProblem(site, r) {
	if (site.id === r.siteId) return `The id ${site.id} is the id of this site.`;
	if (site.id === "all") return "The id all is reserved for the All sites view.";
	if (r.remoteIds.includes(site.id)) return `The id ${site.id} is used by a connected site.`;
	if (r.others.some((o) => o.id === site.id)) return `The id ${site.id} is already registered.`;
	if (new Set(site.hosts).size !== site.hosts.length) return "A host is listed twice.";
	const master = new Set(r.masterHosts.map((h) => h.toLowerCase()));
	for (const h of site.hosts) {
		if (master.has(h)) return `${h} is served by this install; its pages are measured as this site.`;
		const owner = r.others.find((o) => o.hosts.includes(h));
		if (owner) return `${h} is already registered for ${owner.label}.`;
	}
	if (r.others.some((o) => o.key === site.key)) return "The key is used by another site.";
	return null;
}
/**
* The site a private or agent route works on: the requested id when it is the
* local `siteId` or a registered client site, the local site when none is given. Anything else is a
* typed 400 `unknown_site`.
*/
async function bindSite(requested, siteId, coll) {
	if (!requested || requested === siteId) return {
		id: siteId,
		kind: "local"
	};
	const reg = await registry(coll);
	const client = reg.byId.get(requested);
	if (!client && reg.linked.some((s) => s.id === requested)) throw new PluginRouteError("unknown_site", `The site ${requested} is linked to ${siteId}: its data is ${siteId}'s, use that id.`, 400);
	if (!client) throw new PluginRouteError("unknown_site", `Unknown site ${requested.slice(0, 32)}.`, 400);
	return {
		id: client.id,
		kind: "client",
		client
	};
}
/** Optional `site` field of a route body. */
const SiteField = z.string().regex(SITE_ID_RE).optional();
/** Options key prefix of the last event time (epoch ms) of a host of this install's own site, linked hosts included. */
const HOST_SEEN_PREFIX = "host:seen:";
const HOST_SEEN_EVERY_MS = 10 * 6e4;
const hostSeenAt = /* @__PURE__ */ new Map();
/**
* Stamp the last event time of `host`, at most every 10 minutes per host and isolate (the middleware's `mw:seen`
* pattern), so the Hosts list costs a few option writes a day, not one per event. Returns the write to run
* after the response, or null when none is due.
*/
function markHostSeen(kv, host, nowMs = Date.now()) {
	if (!HOST_RE.test(host) && host !== "localhost") return null;
	if (nowMs - (hostSeenAt.get(host) ?? Number.NEGATIVE_INFINITY) < HOST_SEEN_EVERY_MS) return null;
	if (hostSeenAt.size >= 100) hostSeenAt.clear();
	hostSeenAt.set(host, nowMs);
	return () => kv.set(`${HOST_SEEN_PREFIX}${host}`, nowMs).catch(() => {});
}

//#endregion
//#region src/core/queue-sink.ts
/** Name of the producer binding in the host's wrangler config. */
const QUEUE_BINDING = "CA_QUEUE";
let found;
/** The queue binding, looked up once per isolate. Null where `cloudflare:workers` does not exist or the binding is missing. */
function queueBinding() {
	return found ??= workerEnv().then((env) => {
		const q = env?.[QUEUE_BINDING];
		return typeof q?.send === "function" ? q : null;
	});
}
/** Active tier, and whether a queue binding exists (the Data page hints at it when unused). Never the queue on Postgres (`ingestSink`). */
async function ingestStatus(s, binding = queueBinding, dialect = "sqlite") {
	const queueBound = dialect === "sqlite" && await binding() !== null;
	return {
		tier: s.ingestTier === "queue" && queueBound ? "queue" : "direct",
		queueBound
	};
}
/**
* The sink of the selected tier: the queue only when selected and bound and `db` is SQLite (the consumer writes to
* D1), else the database (behind `guard` when given). A Hyperdrive binding with query caching on refuses every
* write with `CACHE_ON_MESSAGE` (counted as a drop by the caller).
*/
async function ingestSink(db, s, binding = queueBinding, guard) {
	if (await queryCacheOn(db)) return { ingest: async () => Promise.reject(/* @__PURE__ */ new Error(`cookieless-analytics: ${CACHE_ON_MESSAGE}`)) };
	const direct = new D1Sink(db, guard);
	const q = s.ingestTier === "queue" && db.dialect === "sqlite" ? await binding() : null;
	return q ? new QueueSink(q, direct, guard ? (now) => writesBlocked(db, guard, now) : void 0) : direct;
}
/**
* The sink of one request with site routing: each event goes to its site's database (one sink per database),
* behind that database's write guard (state under its KV prefix). A missing binding rejects the event; it is
* never written to another database. Postgres statements of an event (schema check and probe included) are limited
* to `INGEST_STATEMENT_MS`.
*/
function routedSink(dbFor, s, kv, binding = queueBinding) {
	const sinks = /* @__PURE__ */ new Map();
	return { ingest(m) {
		return pgStatementLimit(INGEST_STATEMENT_MS, async () => {
			const key = dbFor.binding(m.site) ?? "";
			let p = sinks.get(key);
			if (!p) sinks.set(key, p = dbFor(m.site).then((d) => ingestSink(d, s, binding, {
				kv: dbFor.kv(kv, m.site),
				profile: s.capacityProfile,
				tz: s.siteTimezone,
				key
			})));
			return (await p).ingest(m);
		});
	} };
}
const RESOLVE_KEYS = [
	"sessionWindowMinutes",
	"maxSessionMinutes",
	"saltTimezone",
	"saltRotationHour",
	"siteTimezone",
	"ignoreReferrerHosts",
	"queryAllowlist",
	"reloadDedupeSeconds",
	"maxPageviewsPerSession",
	"maxEventsPerSession",
	"channelRules",
	"hosts"
];
const KEPT_PARAMS = [...UTM_KEYS, ...CLICK_IDS];
/** Page URL as the session rules read it: the path plus the allowlisted, campaign and click id parameters. */
function pageUrl(u, allowlist) {
	try {
		const url = new URL(u, "https://x.invalid");
		for (const k of [...url.searchParams.keys()]) if (!KEPT_PARAMS.includes(k.toLowerCase()) && !allowed(k.toLowerCase(), allowlist)) url.searchParams.delete(k);
		return url.pathname + url.search;
	} catch {
		return "/";
	}
}
/** Referrer as the session rules read it: scheme, host and path. */
function referrer(r) {
	try {
		const url = new URL(r);
		return `${url.protocol}//${url.host}${url.pathname}`;
	} catch {
		return;
	}
}
/**
* The message as queued, holding only what the session rules read: the settings they use (never a secret), the
* page URL without parameters that are not stored, and the referrer without its query.
*/
function queueMessage(m) {
	if (m.t !== "pv" && m.t !== "ev") return m;
	const cfg = Object.fromEntries(RESOLVE_KEYS.filter((k) => m.cfg[k] !== void 0).map((k) => [k, m.cfg[k]]));
	const evt = { ...m.evt };
	if (evt.u !== void 0) evt.u = pageUrl(evt.u, cfg.queryAllowlist);
	if (evt.r) evt.r = referrer(evt.r);
	if (evt.r === void 0) delete evt.r;
	return {
		...m,
		cfg,
		evt
	};
}
/** Sends to the queue; a failed send writes the event through `direct` instead. The write guard is checked before the send (the consumer has none). */
var QueueSink = class {
	constructor(queue, direct, blocked) {
		this.queue = queue;
		this.direct = direct;
		this.blocked = blocked;
	}
	async ingest(m) {
		if (m.t === "srv") return this.direct.ingest(m);
		if (this.blocked && await this.blocked(m.now)) return "budget_blocked";
		try {
			await this.queue.send(queueMessage(m));
			return "ok";
		} catch {
			return this.direct.ingest(m);
		}
	}
};
/** Backoff after a failed write: 30 s, doubling, at most 10 minutes, so with the 20 retries of the consumer config a database outage of about 2.5 hours is ridden out. */
const retryDelay = (attempts) => Math.min(600, 30 * 2 ** Math.max(0, attempts - 1));
/** An engagement update whose visit is not written yet (its page view is still queued) is retried this often. */
const ORPHAN_ATTEMPTS = 3;
const ORPHAN_DELAY_S = 30;
const tokens = (m) => m.t === "srv" ? [] : m.t === "en" ? [m.sid] : [...m.sid ? [m.sid] : [], ...Object.values(m.keys)];
/**
* Messages in send order (event time, then queue time), split into groups that cannot touch the same visit: a
* group joins every message sharing a sid or a visitor key. Groups run in parallel, a group in order, so a
* redelivered or reordered batch gives the tables the direct path gives.
*/
function visitorGroups(messages) {
	const sorted = [...messages].sort((a, b) => a.body.now - b.body.now || a.timestamp.getTime() - b.timestamp.getTime());
	const parent = sorted.map((_, i) => i);
	const find = (i) => parent[i] === i ? i : parent[i] = find(parent[i]);
	const owner = /* @__PURE__ */ new Map();
	sorted.forEach((m, i) => {
		for (const t of tokens(m.body)) {
			const j = owner.get(t);
			if (j === void 0) owner.set(t, i);
			else parent[find(i)] = find(j);
		}
	});
	const groups = /* @__PURE__ */ new Map();
	sorted.forEach((m, i) => {
		const g = groups.get(find(i)) ?? [];
		g.push(m);
		groups.set(find(i), g);
	});
	return [...groups.values()];
}
/**
* A page view, event or engagement update reaches visits started on its own day or the day before. Once that day
* before is closed (its summary stored, `lastClosedDay`), applying the message could change a stored day, so a
* message delayed that long (past 00:15 of the day after its own, by a backlog or an outage) is not written.
*/
function late(m, now) {
	if (m.t === "srv") return false;
	const tz = "cfg" in m ? m.cfg.siteTimezone : m.tz;
	return addDays(dayInZone(m.now, tz), -1) <= lastClosedDay(now, tz);
}
/**
* Consumer: applies one queue batch through `D1Sink`. Every statement is keyed by the entry id, so a redelivered
* message changes nothing. A failing message is retried with the rest of its group (order kept); drops are
* counted as on the direct path.
*/
async function consumeBatch(batch, db, kv) {
	const sink = new D1Sink(db);
	const dropped = [];
	await Promise.all(visitorGroups(batch.messages).map(async (group) => {
		for (const [i, msg] of group.entries()) {
			const m = msg.body;
			let out;
			try {
				out = late(m, Date.now() / 1e3) ? "late_after_close" : await sink.ingest(m);
			} catch {
				for (const rest of group.slice(i)) rest.retry({ delaySeconds: retryDelay(rest.attempts) });
				return;
			}
			if (out === "orphan_update" && msg.attempts < ORPHAN_ATTEMPTS) {
				msg.retry({ delaySeconds: ORPHAN_DELAY_S });
				continue;
			}
			msg.ack();
			if (out !== "ok" && (msg.attempts === 1 || out === "orphan_update")) dropped.push([
				m.site,
				dayInZone(m.now, "cfg" in m ? m.cfg.siteTimezone : m.tz),
				out
			]);
		}
	}));
	for (const [site, day, reason] of dropped) drops.add(site, day, reason);
	if (dropped.length) await drops.flush(db).catch(() => {});
}

//#endregion
export { clearEstimateDay as $, pgStatementLimit as $t, MAX_VISIT_MINUTES as A, isPath as At, hostInList as B, missingDb as Bt, newSiteKey as C, MAPPING_FIELD as Ct, D1Sink as D, OID_RE as Dt, drops as E, ThrottledError as Et, classifyChannel as F, eachDatabase as Ft, budgetTargetOf as G, statePrefix as Gt, parseReferrer as H, pluginFactsOrNull as Ht, CLICK_IDS as I, eachTarget as It, KV_CURSOR as J, INGEST_STATEMENT_MS as Jt, dailyRowsApply as K, CACHE_ON_MESSAGE as Kt, SITE_SEARCH_TERM_MAX as L, ensureHostSchema as Lt, BUILTIN_CHANNEL_RULES as M, isSid as Mt, DEFAULT_HOSTS as N, validateIngest as Nt, MAX_DOC_BYTES as O, cleanProps as Ot, buildChannelRules as P, validateRevenue as Pt, cleanSalts as Q, pgScope as Qt, UTM_KEYS as R, factsDb as Rt, markHostSeen as S, BudgetExhausted as St, siteProblem as T, SourceError as Tt, KV_WRITE_BUDGET as U, setPluginFacts as Ut, normalizeUrl as V, pluginFacts as Vt, budgetState as W, stateKv as Wt, MAX_CHUNKS as X, isHyperdrive as Xt, KV_DELETE_ROWS as Y, fromPg as Yt, SALT_KEEP_DAYS as Z, pgOwnScope as Zt, hostnameOf as _, randomId as _n, SYNC_BUDGET as _t, queueBinding as a, ensureSchema as an, COPY_DAY_ROWS as at, linkedHostsOf as b, truncateIp as bn, nextUtcDay as bt, ClientSiteSchema as c, schemaVersion as cn, copyRowsLeft as ct, MAX_HOSTS as d, fromD1 as dn, PLANNING_ROWS_PER_DAY as dt, redact as en, effectiveRawDays as et, MAX_SITES as f, isD1 as fn, PROVIDER_DAYS as ft, bindSite as g, ipInCidr as gn, RowsPaused as gt, SiteField as h, getOrCreateSalt as hn, ROWS_PER_ROW_BOUND as ht, ingestStatus as i, TABLES as in, sitesInTables as it, isActive as j, isReservedEvent as jt, readVisits as k, isEventName as kt, HOST_SEEN_PREFIX as l, fromKysely as ln, nextUtcMidnight as lt, SITE_KEY_RE as m, base64url as mn, ROWS_PER_INSERT as mt, QUEUE_BINDING as n, SCHEMA_VERSION as nn, runChunk as nt, routedSink as o, ensureSchemaOnce as on, chargeCopyRows as ot, SITE_ID_RE as p, workerEnv as pn, ROWS_PER_DELETE as pt, CHUNK_ROWS as q, queryCacheOn as qt, consumeBatch as r, SCHEMA_VERSION_KEY as rn, runRetention as rt, visitorGroups as s, isOwnDatabase as sn, copiedToday as st, ORPHAN_ATTEMPTS as t, usePgDriver as tn, rawFromDay as tt, LINKED_HOSTS_KEY as u, selfCheck as un, KV_SYNC_ROWS as ut, invalidateRegistry as v, sha256 as vn, SyncRows as vt, registry as w, SOURCE_IDS as wt, loadSites as x, vkey as xn, utcDay as xt, linkedHosts as y, timingSafeEqual as yn, backfillRange as yt, cleanHost as z, factsTargets as zt };