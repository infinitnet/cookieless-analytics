/**
 * Retention: whole days, oldest first, by key range, never by scan. A tick walks the tables step
 * by step, the sites of each table by skip scan (`MIN(site) WHERE site > ?`, 1 row read per site), and deletes
 * one day per statement; visits are deleted in slices of the sid key range so one statement stays near
 * `CHUNK_ROWS` rows. Every statement and KV call counts against the request budget of the capacity profile;
 * the tick stops before it, saves its cursor and the next tick resumes. Deleting is idempotent, so a lost cursor
 * repeats at most one tick of work. Once per local day the cycle starts over with a fresh storage estimate,
 * which may shorten the detailed window. Human visits are never deleted before the rollup holds their day.
 */
import type { KvLike } from "../core/crypto.js";
import { addDays, dayInZone, saltDay } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { dayInt, deleteDaySlice, SID_SLICES, visitDayKey } from "../db/dialect.js";
import type { Param } from "../db/sql.js";
import { isOwnDatabase, ownDatabase } from "../db/schema.js";
import { PROFILES, type Settings } from "../settings.js";
import { KV_WATERMARK } from "./rollup.js";
import { dailyRowsApply, estimateStorage, type StorageEstimate, siteScan } from "./storage.js";

export const KV_CURSOR = "retention:cursor";
/** Rows per chunk of the per-site purge, and the size one retention statement aims at. */
export const CHUNK_ROWS = 2000;
export const MAX_CHUNKS = 20;
/** Salts older than this many days before the current salt day are deleted. */
export const SALT_KEEP_DAYS = 2;
/** Requests kept for the end of a tick: the cursor write. */
export const END_RESERVE = 1;
/** Rows one tick may delete on the `small` profile, so a backlog cannot spend the Free plan's daily rows written. */
export const SMALL_TICK_ROWS = 2_000;
/**
 * Rows the retention task may delete per UTC day on `small`. Deleted rows are written rows: they count toward the
 * write guard's estimate (`deletedToday`), and this cap keeps a backlog (a window shortened by the storage budget)
 * from spending the day's allowance (the last statement of a tick may pass it, as it may pass `SMALL_TICK_ROWS`).
 * Steady state at the guard's traffic is about 12,000 a day.
 */
export const SMALL_DAY_ROWS = 15_000;
const STEP_COUNT = 9;

export type RetentionSettings = Pick<Settings, "siteTimezone" | "rawRetentionDays" | "rollupRetentionMonths" | "searchRetentionDays" | "capacityProfile" | "storageBudgetMb">;

export interface RetentionCursor {
	/** Local day of the current cycle; a new day starts a new cycle at step 0. */
	day: string;
	/** Effective detailed window in days (shorter than the setting when the storage budget requires it). */
	rawDays: number;
	capped: boolean;
	/** The estimate made when the cycle started. */
	storage?: StorageEstimate;
	/** Human detailed days before this day may be gone (the cutoff applied this cycle), or null. */
	cutoff?: string | null;
	/** Position: the step, the site of that step (null: not started), its key prefix (rollup families, search source). */
	step: number;
	site?: string | null;
	prefix?: string[] | null;
	/** Visits: the day being deleted, the next sid slice, and rows per slice of the last statement (sizes the next). */
	vday?: string | number | null;
	slice?: number;
	perSlice?: number;
	deleted: Record<string, number>;
	/** Rows deleted in the UTC day `day` (every cycle of it); the write guard adds them to its estimate. */
	utc?: { day: string; rows: number };
}

/** Rows a filtered delete job wrote in the UTC day `{ day, rows }` (`src/query/filtered-delete.ts`). */
export const KV_DELETE_ROWS = "delete:rows";

/** Rows retention and a filtered delete job wrote in the UTC day of `now`, from the cursor and `KV_DELETE_ROWS`. */
export async function deletedToday(kv: Pick<KvLike, "get">, now: number): Promise<number> {
	const day = dayInZone(now, "UTC");
	const u = (await kv.get<RetentionCursor>(KV_CURSOR))?.utc;
	const j = await kv.get<{ day: string; rows: number }>(KV_DELETE_ROWS);
	return (u && u.day === day ? u.rows : 0) + (j && j.day === day ? j.rows : 0);
}

/** One delete step of the retention walk (`day`: one day per statement; `slices`: visits; `expiry`: aliases). */
interface RetentionStep {
	name: string;
	table: string;
	mode: "day" | "slices" | "expiry";
	/** Key columns between `site` and `day`, walked by skip scan. */
	prefix: readonly string[];
	/** Bound value of the cutoff (`day < cutoff`, or `expires < cutoff`), or null to skip the step this cycle. */
	cutoff: Param | null;
}

/** One delete step of the per-site purge (`src/query/purge.ts`). */
export interface Step {
	name: string;
	table: string;
	mode: "rows" | "day";
	pk?: string;
	where: string;
	/** Bound value of the cutoff, or null to skip the step. */
	cutoff: Param | null;
}

/** `day` minus whole months, clamped to the month's last day. */
export function addMonths(day: string, n: number): string {
	const [y, m, d] = day.split("-").map(Number) as [number, number, number];
	const t = new Date(Date.UTC(y, m - 1 + n, 1));
	const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
	return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The next retention tick starts a new cycle with a fresh storage estimate, so a changed budget applies then, not the next day. */
export async function clearEstimateDay(kv: Pick<KvLike, "get" | "set">): Promise<void> {
	const c = await kv.get<RetentionCursor>(KV_CURSOR);
	if (c) await kv.set(KV_CURSOR, { ...c, day: "" });
}

/** Effective detailed window in days: the setting, shortened while the storage budget requires it. */
export async function effectiveRawDays(kv: KvLike, s: Pick<Settings, "rawRetentionDays">): Promise<number> {
	return rawDaysOf(await kv.get<RetentionCursor>(KV_CURSOR), s);
}

const rawDaysOf = (c: RetentionCursor | null, s: Pick<Settings, "rawRetentionDays">) => (c?.capped ? Math.min(c.rawDays, s.rawRetentionDays) : s.rawRetentionDays);

/** First day of the detailed window; reports for ranges starting earlier read the rollup. */
export async function rawFromDay(kv: KvLike, s: Pick<Settings, "rawRetentionDays" | "siteTimezone">, now: number): Promise<string> {
	const c = await kv.get<RetentionCursor>(KV_CURSOR);
	const byDays = addDays(dayInZone(now, s.siteTimezone), -rawDaysOf(c, s));
	// A raised setting cannot bring deleted days back: never start before the last applied cutoff.
	const cutoff = c?.cutoff;
	return cutoff && cutoff > byDays ? cutoff : byDays;
}

/** Every site present in the fact and summary tables, by skip scan (1 row read per site and table). */
export async function sitesInTables(db: Db): Promise<string[]> {
	const found = new Set<string>();
	for (const t of ["ca_sessions", "ca_events", "ca_srv", "ca_drops", "ca_aliases", "ca_rollup", "ca_cube", "ca_search_daily", "ca_revenue_daily"])
		for (const r of await db.all<{ site: string | null }>(`${siteScan(t)} SELECT site FROM s WHERE site IS NOT NULL`, [])) found.add(String(r.site));
	return [...found].sort();
}

function steps(s: RetentionSettings, today: string, rawDays: number, watermark: string | null, now: number): RetentionStep[] {
	const rawCutoff = addDays(today, -rawDays);
	// Never delete human detailed days the rollup does not hold yet.
	const human = humanCutoff(rawCutoff, watermark);
	const summary = addMonths(today, -s.rollupRetentionMonths);
	return [
		{ name: "sessions", table: "ca_sessions", mode: "slices", prefix: [], cutoff: human === null ? null : visitDayKey(human) },
		{ name: "events", table: "ca_events", mode: "day", prefix: [], cutoff: human === null ? null : dayInt(human) },
		{ name: "srv", table: "ca_srv", mode: "day", prefix: [], cutoff: dayInt(rawCutoff) },
		{ name: "drops", table: "ca_drops", mode: "day", prefix: [], cutoff: dayInt(rawCutoff) },
		{ name: "aliases", table: "ca_aliases", mode: "expiry", prefix: [], cutoff: now },
		{ name: "cube", table: "ca_cube", mode: "day", prefix: [], cutoff: dayInt(summary) },
		{ name: "rollup", table: "ca_rollup", mode: "day", prefix: ["dim", "seg"], cutoff: summary },
		{ name: "revenue", table: "ca_revenue_daily", mode: "day", prefix: ["dim", "seg"], cutoff: summary },
		{ name: "search", table: "ca_search_daily", mode: "day", prefix: ["source"], cutoff: addDays(today, -s.searchRetentionDays) },
	];
}

const humanCutoff = (rawCutoff: string, watermark: string | null) => (watermark ? (rawCutoff <= addDays(watermark, 1) ? rawCutoff : addDays(watermark, 1)) : null);

export async function runChunk(db: Db, site: string, st: Step, chunkRows: number): Promise<number> {
	if (st.cutoff === null) return 0;
	if (st.mode === "day") {
		return (await db.run(`DELETE FROM ${st.table} WHERE site = ? AND day = (SELECT MIN(day) FROM ${st.table} WHERE site = ? AND ${st.where})`, [site, site, st.cutoff])).changes;
	}
	const pk = st.pk as string;
	return (await db.run(`DELETE FROM ${st.table} WHERE site = ? AND ${pk} IN (SELECT ${pk} FROM ${st.table} WHERE site = ? AND ${st.where} LIMIT ${chunkRows})`, [site, site, st.cutoff]))
		.changes;
}

class Exhausted extends Error {}

/** `db` and `kv` with every call counted against `limit` requests; a call that does not fit throws `Exhausted`. */
function metered(db: Db, kv: KvLike, limit: number) {
	let used = 0;
	const spend = () => {
		if (used >= limit - END_RESERVE) throw new Exhausted();
		used++;
	};
	const mdb: Db = {
		dialect: db.dialect,
		// The storage estimate reads `size_after` of the last statement (own D1 database).
		get meta() {
			return db.meta;
		},
		run: (sql, p) => (spend(), db.run(sql, p)),
		all: (sql, p) => (spend(), db.all(sql, p)),
		batch: (stmts) => (spend(), db.batch(stmts)),
	};
	const mkv = { get: <T>(k: string) => (spend(), kv.get<T>(k)), set: (k: string, v: unknown) => (spend(), kv.set(k, v)) };
	// The storage estimate picks the budget row of an own database: the wrapper is one too.
	return { db: isOwnDatabase(db) ? ownDatabase(mdb) : mdb, kv: mkv, used: () => used };
}

export interface RetentionOptions {
	/** Requests (statements and KV calls) of this tick; the profile's by default. */
	requests?: number;
	/** Rows this tick may delete; `SMALL_TICK_ROWS` on `small`, unbounded otherwise. */
	rows?: number;
}

/** Next site of `table` after `after` (the first when null), or null. */
async function nextSite(db: Db, table: string, after: string | null): Promise<string | null> {
	const [r] = await db.all<{ s: string | null }>(after === null ? `SELECT MIN(site) AS s FROM ${table}` : `SELECT MIN(site) AS s FROM ${table} WHERE site > ?`, after === null ? [] : [after]);
	return r?.s ?? null;
}

/** Next key prefix of `site` after `after` (the first when null), in key order, or null. */
async function nextPrefix(db: Db, st: RetentionStep, site: string, after: string[] | null): Promise<string[] | null> {
	const cols = st.prefix.join(", ");
	const tuple = st.prefix.length > 1 ? `(${cols}) > (${st.prefix.map(() => "?").join(", ")})` : `${cols} > ?`;
	const rows = await db.all<Record<string, string>>(
		`SELECT ${cols} FROM ${st.table} WHERE site = ?${after ? ` AND ${tuple}` : ""} ORDER BY ${cols} LIMIT 1`,
		[site, ...(after ?? [])],
	);
	return rows[0] ? st.prefix.map((c) => String(rows[0]?.[c])) : null;
}

/**
 * One statement of work on the current site (and prefix). Returns true when nothing older than the cutoff is
 * left there. `day` deletes the oldest day (`MIN(day)` is a key-range probe); `slices` deletes the visits of the
 * oldest day slice by slice, sizing each statement from the rows per slice of the one before.
 */
async function work(db: Db, st: RetentionStep, c: RetentionCursor, cutoff: Param, deleted: (n: number) => void): Promise<boolean> {
	const site = c.site as string;
	if (st.mode === "expiry") {
		// shortcut: no index on expires, so this reads the site's aliases (they live one day: about 0.1 per page view of that day); add an index on (site, expires) if this proves slow on D1.
		deleted((await db.run(`DELETE FROM ${st.table} WHERE site = ? AND expires < ?`, [site, cutoff])).changes);
		return true;
	}
	if (st.mode === "day") {
		const eq = st.prefix.map((p) => ` AND ${p} = ?`).join("");
		const pv = c.prefix ?? [];
		const n = (await db.run(`DELETE FROM ${st.table} WHERE site = ?${eq} AND day = (SELECT MIN(day) FROM ${st.table} WHERE site = ?${eq}) AND day < ?`, [site, ...pv, site, ...pv, cutoff])).changes;
		deleted(n);
		return n === 0;
	}
	if (c.vday == null) {
		const [r] = await db.all<{ d: string | number | null }>(`SELECT MIN(day) AS d FROM ${st.table} WHERE site = ?`, [site]);
		if (r?.d == null || r.d >= (cutoff as string | number)) return true;
		c.vday = r.d;
		c.slice = 0;
		// Size the first statement of every day afresh: another site's or day's rate says nothing about this one.
		c.perSlice = undefined;
		return false;
	}
	const from = c.slice ?? 0;
	const per = c.perSlice ?? CHUNK_ROWS;
	const span = Math.max(1, Math.min(SID_SLICES.length - from, Math.floor(CHUNK_ROWS / Math.max(1, per))));
	const range = [SID_SLICES[from]?.[0] ?? null, SID_SLICES[from + span - 1]?.[1] ?? null] as const;
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
export async function runRetention(db: Db, kv: KvLike, s: RetentionSettings, now: number, o: RetentionOptions = {}): Promise<RetentionCursor & { done: boolean; requests: number }> {
	const m = metered(db, kv, o.requests ?? PROFILES[s.capacityProfile].requests);
	const today = dayInZone(now, s.siteTimezone);
	let c = await m.kv.get<RetentionCursor>(KV_CURSOR);
	const list = (cur: RetentionCursor, watermark: string | null) => steps(s, today, cur.rawDays, watermark, now);
	let watermark: string | null = null;
	let rows = 0;
	const utcDay = dayInZone(now, "UTC");
	try {
		watermark = await m.kv.get<string>(KV_WATERMARK);
		if (!c || c.day !== today) {
			const storage = await estimateStorage(m.db, s, today);
			// A cycle that did not finish yesterday goes on where it stopped, with today's window, so later steps are reached.
			const keep = c && c.step < STEP_COUNT ? { step: c.step, site: c.site ?? null, prefix: c.prefix ?? null, vday: c.vday ?? null, slice: c.slice ?? 0 } : { step: 0, site: null, prefix: null };
			c = { day: today, rawDays: storage.rawDays, capped: storage.capped, storage, cutoff: c?.cutoff ?? null, ...keep, deleted: {} };
		}
		const cur = c;
		const all = list(cur, watermark);
		const human = humanCutoff(addDays(today, -cur.rawDays), watermark);
		if (human && (!cur.cutoff || human > cur.cutoff)) {
			cur.cutoff = human;
			// Saved before the first delete: readers (the revenue task, `tools/rollup`) take the window from the cursor,
			// so none of them stores again a day whose visits this run is deleting.
			await m.kv.set(KV_CURSOR, cur);
		}
		const doneToday = cur.utc?.day === utcDay ? cur.utc.rows : 0;
		const maxRows = o.rows ?? (dailyRowsApply(s.capacityProfile, db) ? Math.min(SMALL_TICK_ROWS, SMALL_DAY_ROWS - doneToday) : Number.POSITIVE_INFINITY);
		const count = (name: string) => (n: number) => {
			cur.deleted[name] = (cur.deleted[name] ?? 0) + n;
			rows += n;
		};
		let savedStep = cur.step;
		while (rows < maxRows) {
			// Each finished step is saved while the run still has requests: a run stopped by the platform's request
			// limit (no request after it succeeds, not even the save below) resumes from its last finished step.
			if (cur.step !== savedStep && cur.step < all.length) {
				await m.kv.set(KV_CURSOR, { ...cur, utc: dayRows(cur.utc, utcDay, rows) });
				savedStep = cur.step;
			}
			const st = all[cur.step];
			if (!st) break;
			if (st.cutoff === null) {
				Object.assign(cur, { step: cur.step + 1, site: null, prefix: null });
				continue;
			}
			if (cur.site == null) {
				const first = await nextSite(m.db, st.table, null);
				if (first === null) {
					Object.assign(cur, { step: cur.step + 1, site: null, prefix: null });
					continue;
				}
				Object.assign(cur, { site: first, prefix: null, vday: null, slice: 0 });
			}
			if (st.prefix.length && cur.prefix == null) {
				const p = await nextPrefix(m.db, st, cur.site as string, null);
				if (p === null) {
					await advanceSite(m.db, st, cur);
					continue;
				}
				cur.prefix = p;
			}
			if (!(await work(m.db, st, cur, st.cutoff, count(st.name)))) continue;
			if (st.prefix.length) {
				const p = await nextPrefix(m.db, st, cur.site as string, cur.prefix ?? null);
				if (p) {
					cur.prefix = p;
					continue;
				}
			}
			await advanceSite(m.db, st, cur);
		}
	} catch (e) {
		if (!(e instanceof Exhausted)) {
			// A run stopped by the platform (an overload, a lost connection) keeps its progress; the save may fail too.
			if (c) await kv.set(KV_CURSOR, { ...c, utc: dayRows(c.utc, utcDay, rows) }).catch(() => undefined);
			throw e;
		}
	}
	if (!c) throw new Error("retention: the request budget does not cover the start of a cycle");
	c.utc = dayRows(c.utc, utcDay, rows);
	await kv.set(KV_CURSOR, c);
	return { ...c, done: c.step >= list(c, watermark).length, requests: m.used() + 1 };
}

/** The rows retention deleted in the UTC day, with this run's `rows` added. */
const dayRows = (utc: RetentionCursor["utc"], day: string, rows: number) => ({ day, rows: (utc?.day === day ? utc.rows : 0) + rows });

/** The current site of the step is finished: move to the next one, or to the next step. */
async function advanceSite(db: Db, st: RetentionStep, c: RetentionCursor): Promise<void> {
	const next = await nextSite(db, st.table, c.site ?? null);
	Object.assign(c, next === null ? { step: c.step + 1, site: null } : { site: next }, { prefix: null, vday: null, slice: 0, perSlice: undefined });
}

/** Delete `salt:<day>` keys older than two days before the current salt day. */
export async function cleanSalts(kv: KvLike, s: Pick<Settings, "saltTimezone" | "saltRotationHour">, now: number): Promise<string[]> {
	const keep = addDays(saltDay(now, s.saltTimezone, s.saltRotationHour), -SALT_KEEP_DAYS);
	const gone: string[] = [];
	for (const { key } of await kv.list("salt:")) {
		if (key.slice(5) < keep) {
			await kv.delete(key);
			gone.push(key);
		}
	}
	return gone;
}
