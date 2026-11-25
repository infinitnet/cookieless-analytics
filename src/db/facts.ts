/**
 * Where the analytics tables live. Every path that reads or writes them (routes, cron tasks, the middleware, the
 * queue consumer) gets its `Db` from one resolver, `dbFor(site)`. Without the plugin option `database` that is the
 * host database. With it, the analytics tables live in that binding (D1, or Hyperdrive for Postgres: the kind is
 * detected at runtime), while plugin options, KV state and
 * storage collections (settings, cursors, locks, Search credentials) stay on the host database (`ctx.kv`,
 * `optionsKv(hostDb)`, `ctx.storage`).
 *
 * With `databases` the site picks the database: each site listed in `databases.sites` has its tables in its own
 * binding, every other site in `databases.default` (absent: the host database). Nothing ever joins across two
 * databases: cross-site readers open each site's database. Cron state that belongs to a database (rollup
 * watermark and cursors, retention cursor and storage estimate, write budget) lives in the host KV under a
 * prefix per routed binding (`stateKv`); the default database keeps the unprefixed keys.
 *
 * A configured binding that is missing at runtime never falls back to another database: every statement fails
 * with a message naming the binding, so the collect route answers 503 and counts `write_error`.
 */
import type { KvLike } from "../core/crypto.js";
import { workerEnv } from "../core/worker-env.js";
import type { DatabaseOption, DatabasesOption } from "../multisite/config.js";
import type { Db } from "./adapter.js";
import { fromD1, isD1 } from "./d1.js";
import { fromPg, isHyperdrive } from "./pg.js";
import { hyperdriveDb } from "./query-cache.js";
import { ensureSchema, ensureSchemaOnce, ownDatabase } from "./schema.js";

/** One database of the analytics tables: `binding` null is the host database. */
export interface FactsTarget {
	binding: string | null;
	db(): Promise<Db>;
	/** The host KV seen through this database's prefix (its cron state). */
	kv<K extends Partial<KvLike>>(kv: K): K;
}

/** The database of a site's analytics tables (no site: the default database). */
export interface DbFor {
	(site?: string): Promise<Db>;
	/** Every database the option names, the default first: what a cron task walks. */
	targets(): FactsTarget[];
	/** The host KV seen through the prefix of `site`'s database. */
	kv<K extends Partial<KvLike>>(kv: K, site?: string): K;
	/** The routed binding of `site`, or null for the default database. */
	binding(site?: string): string | null;
}

/** A `Db` whose every statement fails: the configured binding does not exist in this Worker. */
export function missingDb(binding: string): Db {
	const fail = async (): Promise<never> => {
		throw new Error(`cookieless-analytics: database option: the D1 or Hyperdrive binding ${binding} does not exist in this Worker; analytics are not written to the host database. Add the binding to the wrangler config or remove the option.`);
	};
	return { dialect: "sqlite", run: fail, all: fail, batch: fail };
}

/** Cron state keys of a routed database: the default database keeps the plain keys. */
export const statePrefix = (binding: string) => `db:${binding}:`;

/** The KV under `prefix`. Only the methods the KV has are wrapped. */
export function prefixedKv<K extends Partial<KvLike>>(kv: K, prefix: string): K {
	if (!prefix) return kv;
	const k = kv as Partial<KvLike>;
	const out: Partial<KvLike> = {};
	if (k.get) out.get = (key) => k.get!(prefix + key);
	if (k.set) out.set = (key, v) => k.set!(prefix + key, v);
	if (k.delete) out.delete = (key) => k.delete!(prefix + key);
	if (k.list) out.list = async (p = "") => (await k.list!(prefix + p)).map((e) => ({ ...e, key: e.key.slice(prefix.length) }));
	if (k.compareAndSet) out.compareAndSet = (key, rev, v) => k.compareAndSet!(prefix + key, rev, v);
	return out as K;
}

/** The resolver for the plugin options `database` or `databases` (absent: the host database for every site). */
export function factsDb(option: DatabaseOption | DatabasesOption | undefined, host: () => Promise<Db>, env: () => Promise<Record<string, unknown> | null> = workerEnv): DbFor {
	const route: DatabasesOption = !option ? { sites: {} } : "binding" in option ? { default: option.binding, sites: {} } : option;
	const opened = new Map<string, () => Promise<Db>>();
	const open = (binding: string): Promise<Db> => {
		let get = opened.get(binding);
		if (!get) {
			const own = env().then((e) => {
				const b = e?.[binding];
				// A missing binding is an own database too: its schema check fails on its own, never on the host's memo.
				// A Hyperdrive binding without the `/postgres` entry fails every statement with a message naming `engine`.
				return ownDatabase(isD1(b) ? fromD1(b) : isHyperdrive(b) ? hyperdriveDb(fromPg(b, binding), binding) : missingDb(binding));
			});
			let ready = false;
			// The host migrates only its own database: create the tables here, until one check succeeds per binding and
			// isolate. Each call runs its own check meanwhile (never one shared with another request, which may be canceled).
			// A failure surfaces on the statements that follow. The KV is unused (the version row is in `db`).
			get = async () => {
				const db = await own;
				if (!ready) await ensureSchema(db, { get: async () => null, set: async () => {} }).then(() => (ready = true), () => undefined);
				return db;
			};
			opened.set(binding, get);
		}
		return get();
	};
	/** The binding of `site`, or null for the default database. */
	const bindingOf = (site?: string): string | null => {
		const b = (site !== undefined && Object.hasOwn(route.sites, site) ? route.sites[site] : undefined) ?? route.default;
		return b === undefined || b === route.default ? null : b;
	};
	const dbOf = (b: string | null) => (b !== null ? open(b) : route.default !== undefined ? open(route.default) : host());
	const kvOf = <K extends Partial<KvLike>>(kv: K, b: string | null) => (b === null ? kv : prefixedKv(kv, statePrefix(b)));
	const dbFor = ((site?: string) => dbOf(bindingOf(site))) as DbFor;
	dbFor.kv = (kv, site) => kvOf(kv, bindingOf(site));
	dbFor.binding = bindingOf;
	dbFor.targets = () =>
		[null, ...new Set(Object.values(route.sites).filter((b) => b !== route.default))].map((b) => ({
			binding: b ?? route.default ?? null,
			db: () => dbOf(b),
			kv: (kv) => kvOf(kv, b),
		}));
	return dbFor;
}

let current: DbFor | undefined;

/** `createPlugin` records its resolver, so the middleware (an entry without plugin options) uses the same database. */
export function setPluginFacts(dbFor: DbFor): DbFor {
	return (current = dbFor);
}

/**
 * The resolver `createPlugin` recorded. Throws when the plugin was not created in this isolate: the option is
 * unknown then, and a write must not guess the host database.
 */
export function pluginFacts(): DbFor {
	if (!current) throw new Error("cookieless-analytics: the plugin is not initialized in this isolate; the analytics database is unknown.");
	return current;
}

/** The resolver `createPlugin` recorded, or null (tests and tools that build routes without the plugin). */
export function pluginFactsOrNull(): DbFor | null {
	return current ?? null;
}

/**
 * Run `task` once per database of `dbFor` (a cron task), each with the host KV under that database's prefix and
 * its share of a request budget (`share(total)`: the databases of one invocation split the platform's queries per
 * invocation). A database that fails (a missing binding) is logged and the others still run; the first error is
 * thrown at the end.
 */
export async function eachTarget(dbFor: Pick<DbFor, "targets">, kv: KvLike, task: (db: Db, kv: KvLike, share: (total: number) => number, binding: string | null) => Promise<unknown>, log?: { warn(msg: string): void }): Promise<void> {
	let failed: unknown;
	const targets = dbFor.targets();
	const share = (total: number) => Math.max(1, Math.floor(total / targets.length));
	for (const t of targets) {
		try {
			await task(await t.db(), t.kv(kv), share, t.binding);
		} catch (err) {
			log?.warn(`cookieless-analytics: task failed on the database ${t.binding ?? "of the host"}: ${(err as Error).message}`);
			failed ??= err;
		}
	}
	if (failed) throw failed;
}

/**
 * The databases a whole-install task walks (a tool's rollup or retention run): the plugin's when sites are routed
 * to several databases, else the one database of `db`.
 */
export function factsTargets(db: (site?: string) => Promise<Db>): FactsTarget[] {
	const t = current?.targets();
	return t && t.length > 1 ? t : [{ binding: null, db: () => db(), kv: (kv) => kv }];
}

/** Run `task` once per database of `factsTargets`; with several, the default database's result plus one entry per database. */
export async function eachDatabase<R extends object>(db: (site?: string) => Promise<Db>, kv: KvLike, task: (db: Db, kv: KvLike) => Promise<R>): Promise<R | (R & { databases: Array<R & { binding: string | null }> })> {
	const targets = factsTargets(db);
	if (targets.length === 1) return task(await db(), kv);
	const out: Array<R & { binding: string | null }> = [];
	for (const t of targets) out.push({ ...(await task(await t.db(), t.kv(kv))), binding: t.binding });
	return { ...(out[0] as R), databases: out };
}

/**
 * The lazy schema migration of the host database, when some site's tables are there. Own databases (missing ones
 * included) get their tables from `dbFor` itself, so one site's database never decides another site's writes.
 */
export async function ensureHostSchema(dbFor: Pick<DbFor, "targets">, kv: Pick<KvLike, "get" | "set">): Promise<void> {
	const host = dbFor.targets().find((t) => t.binding === null);
	if (host) await ensureSchemaOnce(await host.db(), kv);
}

/** The host KV through the prefix of `site`'s database (the plain KV before `createPlugin` or without routing). */
export function stateKv<K extends Partial<KvLike>>(kv: K, site?: string): K {
	return current ? current.kv(kv, site) : kv;
}
