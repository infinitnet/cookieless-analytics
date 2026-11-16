/**
 * Per-site deletion: every fact row of one site in chunks of 2000 with a resume
 * cursor in KV (`purge:<site>`), the retention machinery; and the Search rows of one site and source.
 */
import type { KvLike } from "../core/crypto.js";
import type { Db } from "../db/adapter.js";
import { CHUNK_ROWS, MAX_CHUNKS, runChunk, type Step } from "./retention.js";

/** Every fact row of a site, in delete order; `day` steps remove one day per chunk. */
export const SITE_STEPS: readonly Step[] = [
	{ name: "sessions", table: "ca_sessions", mode: "rows", pk: "sid", where: "1 = ?", cutoff: 1 },
	{ name: "aliases", table: "ca_aliases", mode: "rows", pk: "sid", where: "1 = ?", cutoff: 1 },
	{ name: "events", table: "ca_events", mode: "rows", pk: "id", where: "1 = ?", cutoff: 1 },
	{ name: "srv", table: "ca_srv", mode: "day", where: "1 = ?", cutoff: 1 },
	{ name: "drops", table: "ca_drops", mode: "day", where: "1 = ?", cutoff: 1 },
	{ name: "cube", table: "ca_cube", mode: "day", where: "1 = ?", cutoff: 1 },
	{ name: "rollup", table: "ca_rollup", mode: "day", where: "day < ?", cutoff: "9999-12-31" },
	{ name: "search", table: "ca_search_daily", mode: "day", where: "day < ?", cutoff: "9999-12-31" },
	{ name: "revenue", table: "ca_revenue_daily", mode: "day", where: "day < ?", cutoff: "9999-12-31" },
];

export interface PurgeCursor {
	step: number;
	deleted: Record<string, number>;
	/** Epoch seconds of the last chunk. */
	at?: number;
}
/** A delete cursor untouched for this long belongs to an abandoned delete and is not resumed. */
export const STALE_SECONDS = 3600;
export const purgeKey = (site: string) => `purge:${site}`;

export interface PurgeOptions {
	chunkRows?: number;
	maxChunks?: number;
	/** Epoch seconds; defaults to the clock. */
	now?: number;
}

/**
 * One bounded call of a per-site delete: at most `maxChunks` chunks, resuming from `purge:<site>`.
 * The cursor only moves after a chunk is deleted, so a crash repeats at most one (idempotent) chunk.
 * The cursor is removed when the site has no rows left.
 */
export async function purgeSite(db: Db, kv: KvLike, site: string, o: PurgeOptions = {}): Promise<PurgeCursor & { site: string; done: boolean }> {
	const chunkRows = o.chunkRows ?? CHUNK_ROWS;
	const maxChunks = o.maxChunks ?? MAX_CHUNKS;
	const key = purgeKey(site);
	const now = o.now ?? Math.floor(Date.now() / 1000);
	const saved = await kv.get<PurgeCursor>(key);
	// A cursor of an abandoned delete would skip tables that gained rows since: an old one starts over.
	const c: PurgeCursor = saved && now - (saved.at ?? 0) < STALE_SECONDS ? saved : { step: 0, deleted: {}, at: now };
	for (let n = 0; n < maxChunks && c.step < SITE_STEPS.length; n++) {
		const st = SITE_STEPS[c.step] as Step;
		const changes = await runChunk(db, site, st, chunkRows);
		c.deleted[st.name] = (c.deleted[st.name] ?? 0) + changes;
		if (st.mode === "rows" ? changes < chunkRows : changes === 0) c.step++;
		c.at = now;
		await kv.set(key, c);
	}
	const done = c.step >= SITE_STEPS.length;
	if (done) await kv.delete(key);
	return { ...c, site, done };
}

/**
 * One bounded call deleting the stored Search rows of one site and source, oldest days first: each chunk
 * removes whole days up to about `chunkRows` rows (at least one day). Idempotent, so no cursor is needed.
 */
export async function purgeSearch(db: Db, site: string, source: string, o: PurgeOptions = {}): Promise<{ deleted: number; done: boolean }> {
	const chunkRows = o.chunkRows ?? CHUNK_ROWS;
	const maxChunks = o.maxChunks ?? MAX_CHUNKS;
	let deleted = 0;
	for (let n = 0; n < maxChunks; n++) {
		const days = await db.all<{ day: string; n: number }>(
			"SELECT day, COUNT(*) AS n FROM ca_search_daily WHERE site = ? AND source = ? GROUP BY day ORDER BY day LIMIT 1000",
			[site, source],
		);
		if (!days.length) return { deleted, done: true };
		let last = days[0]?.day as string;
		let sum = 0;
		for (const d of days) {
			if (sum > 0 && sum + Number(d.n) > chunkRows) break;
			sum += Number(d.n);
			last = d.day;
		}
		deleted += (await db.run("DELETE FROM ca_search_daily WHERE site = ? AND source = ? AND day <= ?", [site, source, last])).changes;
	}
	const [left] = await db.all("SELECT COUNT(*) AS n FROM ca_search_daily WHERE site = ? AND source = ?", [site, source]);
	return { deleted, done: Number(left?.n ?? 0) === 0 };
}
