/**
 * Hyperdrive query caching on the analytics binding. Hyperdrive caches read statements by default and does not
 * invalidate them on writes, so a read right after a write can return the old row. The plugin's read, decide, write
 * paths (salt, visit lookup, engagement) then lose page views. The probe finds it: write a marker, read it, write a
 * new value, read again with the identical statement; the old value on the second read means the binding caches.
 * Five statements per probe, run lazily by ingest until one result is stored for the isolate and binding. With caching on, ingest refuses
 * every write with `CACHE_ON_MESSAGE` (a counted drop), never a silent wrong count.
 */
import type { Db } from "./adapter.js";

export const CACHE_ON_MESSAGE = "Hyperdrive query caching is on; recreate the configuration with --caching-disabled";

/** A probe that takes longer counts as failed: it never holds an ingest request for the full query timeouts. */
export const PROBE_MS = 10_000;

/**
 * True when a read through `db` returns a value its own last write replaced. Each probe uses a row of its own, so no
 * cache entry of another isolate's probe can answer its reads. Five statements: write, read, write, read, delete.
 * `live` false stops it before its next statement (its deadline passed): no statement runs after that, so a stopped
 * probe leaves its row.
 */
export async function probeQueryCache(db: Db, live: () => boolean = () => true): Promise<boolean> {
	const row = `cache_probe:${crypto.randomUUID()}`;
	const step = <T>(s: () => Promise<T>): Promise<T> => (live() ? s() : Promise.reject(new Error("cookieless-analytics: the query cache probe was stopped at its deadline")));
	const write = (v: string) => step(() => db.run("INSERT INTO ca_meta (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value", [row, v]));
	const read = async () => (await step(() => db.all<{ value: string }>("SELECT value FROM ca_meta WHERE name = ?", [row])))[0]?.value;
	try {
		const first = crypto.randomUUID();
		await write(first);
		await read();
		await write(crypto.randomUUID());
		// Only this probe ever wrote `first`, and it replaced it: reading it again can only come from a cache.
		return (await read()) === first;
	} finally {
		if (live()) await db.run("DELETE FROM ca_meta WHERE name = ?", [row]).catch(() => undefined);
	}
}

/** `p`, or a rejection after `ms`. */
function deadline<T>(p: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`cookieless-analytics: the query cache probe took longer than ${ms} ms`)), ms)))]).finally(() => clearTimeout(timer));
}

/** Binding names of the Hyperdrive `Db`s, so the probe runs on those only. */
const hyperdrive = new WeakMap<Db, string>();
/** Settled probe results only: a running probe belongs to its request and is never shared. */
const results = new Map<string, boolean>();

/** Marks `db` as the Hyperdrive binding `name`. */
export function hyperdriveDb(db: Db, name: string): Db {
	hyperdrive.set(db, name);
	return db;
}

/**
 * Whether `db` is a Hyperdrive binding with query caching on: false for any other database. Until a result is
 * stored for the binding in this isolate, each call runs a probe of its own, with its own timer, so a request
 * cancelled mid-probe never holds up another. A probe that fails or takes longer than `PROBE_MS` (the database is
 * down or slow) stores nothing and rethrows: the write would fail the same way.
 */
export async function queryCacheOn(db: Db): Promise<boolean> {
	const name = hyperdrive.get(db);
	if (name === undefined) return false;
	const known = results.get(name);
	if (known !== undefined) return known;
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

/** The probe results of this isolate by binding name (the health message on the Data page). */
export const queryCacheResults = (): ReadonlyMap<string, boolean> => results;

/** Test helper: forget the probes of this isolate. */
export function resetQueryCache(): void {
	results.clear();
}
