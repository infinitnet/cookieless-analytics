/**
 * A `Db` over a Cloudflare Hyperdrive binding and the node-postgres (`pg`) driver: the analytics tables on an
 * external Postgres. This module never imports `pg`; the runtime entry `@infinitnet/cookieless-analytics/postgres`
 * (`src/postgres.ts`) registers the driver with `usePgDriver`, so the default bundle carries no driver.
 *
 * - Request scope. A socket belongs to the request that opened it, so a client never outlives its scope:
 *   `pgScope(fn)` runs `fn` with an empty holder, the first statement for a binding connects, later ones reuse
 *   the client, and the scope's end closes it. Outside a scope (or after it ended) a statement connects, runs and
 *   closes on its own: slow, never wrong.
 * - `batch()` is `BEGIN`, the statements in order, `COMMIT` (`ROLLBACK` on error): atomic like the D1 binding's
 *   batch. Statements on one client run one after the other, so a parallel query stays out of a transaction.
 * - Bounded retry: a connect that was refused or reset is tried once more; a timeout is not (the driver's connect
 *   timeout bounds it). Statements are never retried here; the collect route retries an overload once.
 * - Fail fast: after a connect or statement timeout on a binding, every statement of that binding in this isolate is
 *   refused for `FAIL_FAST_MS` without connecting, with the redacted reason, so a down database costs one timeout
 *   per window instead of one per request. `pgStatementLimit` gives the ingest path a shorter statement timeout.
 * - Errors: connection failures and transient states come out with the word "overloaded", which `isOverload`
 *   matches. Every message is redacted (URLs, `password=` and similar); the original error is not kept as `cause`.
 */
import type { Db, SizeInfo } from "./adapter.js";
import type { Param, Stmt } from "./sql.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { toPostgresPlaceholders } from "./adapter.js";
import { TABLES } from "./schema.js";

/** The part of a node-postgres `Client` this package uses. */
export interface PgClient {
	connect(): Promise<unknown>;
	query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
	end(): Promise<unknown>;
	on?(event: "error", listener: (err: unknown) => void): unknown;
}

/** Opens a client for a connection string (unconnected). Registered by the `/postgres` entry. */
export type PgDriver = (connectionString: string) => PgClient;

/** A Hyperdrive binding as the Worker sees it. */
export interface HyperdriveLike {
	readonly connectionString: string;
}

export const isHyperdrive = (v: unknown): v is HyperdriveLike => typeof (v as HyperdriveLike | null)?.connectionString === "string";

// One driver and one scope store per isolate, shared by every bundle of the package (separate module copies).
const DRIVER = Symbol.for("cookieless-analytics:pg-driver");
const SCOPE = Symbol.for("cookieless-analytics:pg-scope");
type Slot = { client: Promise<PgClient>; tail: Promise<unknown> };
/** Clients of one scope by binding name. */
type Holder = { open: boolean; slots: Map<string, Slot>; statementMs?: number };
const g = globalThis as Record<symbol, unknown>;
const store = (g[SCOPE] ??= new AsyncLocalStorage<Holder>()) as AsyncLocalStorage<Holder>;

export const usePgDriver = (driver: PgDriver): void => {
	g[DRIVER] = driver;
};
export const pgDriver = (): PgDriver | undefined => g[DRIVER] as PgDriver | undefined;

/**
 * Run `fn` with request scoped Postgres clients. When `fn` settles, statements it left running finish (at most
 * `DRAIN_MS`), then the clients are closed. A nested scope uses the outer one.
 */
export async function pgScope<T>(fn: () => T | Promise<T>): Promise<T> {
	if (store.getStore()?.open) return fn();
	const holder: Holder = { open: true, slots: new Map() };
	try {
		return await store.run(holder, fn);
	} finally {
		holder.open = false;
		const slots = [...holder.slots.values()];
		// No client opened (D1, or a handler without statements): no drain timer.
		if (slots.length) {
			await within(Promise.all(slots.map((s) => s.tail)), DRAIN_MS);
			await Promise.all(slots.map(async (s) => close(await s.client.catch(() => null))));
			holder.slots.clear();
		}
	}
}

/** Statement timeout of the ingest path: covers the measured 700 ms first statement of a Neon database resumed from zero. */
export const INGEST_STATEMENT_MS = 5000;

/**
 * Runs `fn` with every Postgres statement it sends limited to `ms` (on the scope's clients, or on clients of its
 * own outside a scope). A statement that runs longer fails as a timeout and its client is closed.
 */
export function pgStatementLimit<T>(ms: number, fn: () => Promise<T>): Promise<T> {
	const h = store.getStore();
	// A child of the open holder: it shares the scope's clients and sees the scope end through the prototype.
	const child: Holder = h?.open ? Object.assign(Object.create(h) as Holder, { statementMs: Math.min(ms, h.statementMs ?? ms) }) : { open: false, slots: new Map(), statementMs: ms };
	return store.run(child, fn);
}

/**
 * `pgScope` that never joins an enclosing scope: for work after the response (`after()` inherits the route's context,
 * and must neither hold the route's clients open nor run on them after they closed).
 */
export const pgOwnScope = <T>(fn: () => T | Promise<T>): Promise<T> => store.exit(() => pgScope(fn));

/** Longer than the driver's query timeout (15 s), so a statement still running ends by itself first. */
const DRAIN_MS = 16_000;
const END_MS = 1000;

/** Waits for `p` (never rejects) or `ms`, whichever comes first. */
async function within(p: Promise<unknown>, ms: number): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([p.catch(() => undefined), new Promise((r) => (timer = setTimeout(r, ms)))]);
	clearTimeout(timer);
}

/** `end()` that cannot hang the caller: a dead socket gets a second, then is left behind. */
async function close(c: PgClient | null): Promise<void> {
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
const ipv6 = (m: string): string => {
	const addr = m.replace(/^\[|\](?::\d+)?$|%.*$/g, "");
	return /[0-9A-Fa-f]/.test(addr) && (addr.includes("::") || addr.split(":").length === 8) ? "[redacted]" : m;
};
const CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * Removes URLs, `key=value` credentials, quoted user, host and database names, socket targets, IPv4 and IPv6
 * addresses, plus every part of `connectionString` (user, password, host, database) wherever it appears (a part of
 * one or two characters as a whole word only); flattens the text and caps it at 500 characters.
 */
export function redact(message: string, connectionString?: string): string {
	let out = message;
	for (const part of secretsOf(connectionString)) {
		out = part.length >= 3 ? out.split(part).join("[redacted]") : out.replace(new RegExp(`(?<![A-Za-z0-9_])${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_])`, "g"), "[redacted]");
	}
	return out
		.replace(URL_RE, "[redacted url]")
		.replace(CREDENTIAL_RE, "$1=[redacted]")
		.replace(QUOTED_RE, '$1 "[redacted]"')
		.replace(SOCKET_TARGET_RE, "$1 [redacted]")
		.replace(IPV4_RE, "[redacted]")
		.replace(IPV6_RE, ipv6)
		.replace(/[\r\n\t]+/g, " ")
		.slice(0, 500);
}

/** The connection string itself and its user, password, host and database, longest first; none when it does not parse. */
function secretsOf(connectionString?: string): string[] {
	if (!connectionString) return [];
	const parts = [connectionString];
	try {
		const u = new URL(connectionString);
		parts.push(u.host, u.hostname, u.username, u.password, decodeURIComponent(u.username), decodeURIComponent(u.password), u.pathname.slice(1));
	} catch {
		// Not a URL (key=value form): the patterns above cover it.
	}
	return [...new Set(parts.filter((p) => p.length > 0))].sort((a, b) => b.length - a.length);
}

/** SQLSTATE class 08 (connection), too many connections, starting up, shutting down, serialization and deadlock aborts. */
const TRANSIENT_CODES = new Set(["53300", "57P01", "57P03", "40001", "40P01"]);
const SOCKET_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"]);
const TIMEOUT_RE = /timeout|timed out|connection terminated|connection (?:was )?closed|client (?:was|has been) closed|network connection lost/i;

const codeOf = (err: unknown): string => {
	const c = (err as { code?: unknown } | null)?.code;
	return typeof c === "string" && CODE_RE.test(c) ? c : "";
};

/** True for an error after which the client must not be reused (and a connect may be tried again). */
const isConnectionError = (err: unknown): boolean => {
	const code = codeOf(err);
	if (SOCKET_CODES.has(code)) return true;
	// A server error with a SQLSTATE says what it is; its text may quote any value ("timeout" included).
	if (/^[0-9A-Z]{5}$/.test(code)) return code.startsWith("08") || code === "57P01" || code === "57P03";
	return TIMEOUT_RE.test(String((err as { message?: unknown } | null)?.message ?? err));
};

/** A connect or statement timeout; a server error with a SQLSTATE that quotes the word is not one. */
const isTimeout = (err: unknown): boolean => {
	const code = codeOf(err);
	return code === "ETIMEDOUT" || (!/^[0-9A-Z]{5}$/.test(code) && /timeout|timed out/i.test(String((err as { message?: unknown } | null)?.message ?? "")));
};

/** The error this package throws: redacted text, the SQLSTATE in brackets, "overloaded" for transient states. */
export function mapPgError(err: unknown, connectionString?: string): Error {
	const code = codeOf(err);
	const text = redact(String((err as { message?: unknown } | null)?.message ?? err), connectionString) || "unknown error";
	const tag = code ? ` (${code})` : "";
	if (TRANSIENT_CODES.has(code) || isConnectionError(err)) return Object.assign(new Error(`Postgres is overloaded or unreachable${tag}: ${text}`), { code });
	return Object.assign(new Error(`Postgres error${tag}: ${text}`), { code });
}

const RETRY_PAUSE_MS = () => 100 + Math.random() * 200;

async function connect(driver: PgDriver, connectionString: string): Promise<PgClient> {
	for (let attempt = 0; ; attempt++) {
		const c = driver(connectionString);
		// An idle socket error must not become an unhandled error event; the next statement sees the broken client.
		c.on?.("error", () => undefined);
		try {
			await c.connect();
			return c;
		} catch (err) {
			void close(c);
			if (attempt > 0 || !isConnectionError(err) || isTimeout(err)) throw err;
			await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS()));
		}
	}
}

const bindable = (p: Param | undefined): unknown => (p === undefined ? null : p);

/** How long a binding is refused without connecting after a connect or statement timeout. */
export const FAIL_FAST_MS = 20_000;
type Down = { until: number; reason: string };
/** Open fail-fast windows by binding name, one map per isolate (shared by every bundle of the package). */
const failFast = (g[Symbol.for("cookieless-analytics:pg-fail-fast")] ??= new Map<string, Down>()) as Map<string, Down>;
/** Test helper: close every fail-fast window of this isolate. */
export const resetPgFailFast = (): void => failFast.clear();

/** `p`, or a timeout error after `ms` (none without `ms`). */
function timed<T>(p: Promise<T>, ms: number | undefined): Promise<T> {
	if (!ms) return p;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`statement timeout: no answer within ${ms} ms`)), ms)));
	return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** Clients left in an unknown transaction state (a failed `ROLLBACK`): never reused. */
const poisoned = new WeakSet<PgClient>();

/**
 * `binding` is read on every use, never stored on the returned object. `name` is the binding name, the only
 * label that appears in messages.
 */
export function fromPg(binding: HyperdriveLike, name: string): Db {
	const driver = () => {
		const d = pgDriver();
		if (!d) throw new Error(`binding ${name} is a Hyperdrive binding; set engine: "postgres" in the plugin options`);
		return d;
	};

	/** Runs `f` on a client of the current scope (serialised per client), or on a client of its own. */
	async function use<T>(f0: (c: PgClient) => Promise<T>): Promise<T> {
		const d = driver();
		const down = failFast.get(name);
		if (down && Date.now() < down.until) throw new Error(`${down.reason} (not connecting again for ${Math.ceil((down.until - Date.now()) / 1000)} s)`);
		const holder = store.getStore();
		const f = (c: PgClient) => timed(f0(c), holder?.statementMs);
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
				slot = { client, tail: client };
				holder.slots.set(name, slot);
			}
			const s = slot;
			const p = s.tail.then(
				() => s.client.then(f),
				() => s.client.then(f),
			);
			s.tail = p.catch(() => undefined);
			try {
				return await p;
			} catch (err) {
				// A broken or never opened client leaves the scope; the next statement connects again.
				const broken = isConnectionError(err) || (await s.client.then((c) => poisoned.has(c), () => true));
				if (broken && holder.slots.get(name) === s) {
					holder.slots.delete(name);
					void s.client.then(close, () => undefined);
				}
				throw err;
			}
		} catch (err) {
			const e = mapPgError(err, binding.connectionString);
			if (isTimeout(err)) failFast.set(name, { until: Date.now() + FAIL_FAST_MS, reason: e.message });
			throw e;
		}
	}

	const query = (c: PgClient, sql: string, params: readonly Param[] = []) => c.query(toPostgresPlaceholders(sql), params.map(bindable));

	const db: Db = {
		dialect: "postgres",
		async run(sql, params) {
			const r = await use((c) => query(c, sql, params));
			return { changes: r.rowCount ?? 0 };
		},
		async all<T>(sql: string, params?: Param[]) {
			return (await use((c) => query(c, sql, params))).rows as T[];
		},
		async batch(stmts: readonly Stmt[]) {
			if (!stmts.length) return;
			// One statement is atomic on its own: no BEGIN and COMMIT (two more statements against the Hyperdrive allowance).
			if (stmts.length === 1) return void (await use((c) => query(c, stmts[0]!.sql, stmts[0]!.params)));
			await use(async (c) => {
				await c.query("BEGIN");
				try {
					for (const s of stmts) await query(c, s.sql, s.params);
					await c.query("COMMIT");
				} catch (err) {
					// After a connection error the client is dropped and the server rolls back; a ROLLBACK would only queue behind the dead query.
					if (!isConnectionError(err)) await c.query("ROLLBACK").catch(() => poisoned.add(c));
					throw err;
				}
			});
		},
		size: () => catalogSize(db),
	};
	return db;
}

/** Whole database and each analytics table (`pg_total_relation_size`: heap, indexes, TOAST), in the schemas of `search_path`. */
export async function catalogSize(db: Db): Promise<SizeInfo> {
	const names = [...TABLES, "ca_meta"];
	const rows = await db.all<{ name: string; bytes: unknown }>(
		`SELECT '' AS name, pg_database_size(current_database()) AS bytes
		 UNION ALL
		 SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE c.relkind = 'r' AND n.nspname = ANY (current_schemas(false)) AND c.relname IN (${names.map(() => "?").join(", ")})`,
		names,
	);
	const tables: Record<string, number> = {};
	let bytes = 0;
	for (const r of rows) {
		if (r.name === "") bytes = Number(r.bytes);
		else tables[r.name] = (tables[r.name] ?? 0) + Number(r.bytes);
	}
	return { bytes, tables };
}
