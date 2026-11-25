/**
 * Data move (Data page, Move data), "switch first, then backfill". The user points the plugin option at the new
 * database and deploys: from then on every write goes there and the old database (the source) is frozen. This job
 * then copies the source's analytics tables into the database the site writes to now (the destination), chunk by
 * chunk (`readChunk`, `writeChunk`), so no row is written twice and no visit is merged.
 *
 * - Resumable like the filtered delete: the job lives in the host KV and the position is saved after every chunk.
 *   A call takes a 60 s lease and renews it at every save; a save first reads the job back and the call stops,
 *   without saving, when another call holds it. A call starts a chunk only within its 40 s and a chunk is two
 *   statements (on Postgres each ends at the 15 s statement timeout; D1 sets its own limits), so a running call
 *   renews its lease before it runs out. Taking the lease is not atomic (see the shortcut below): two calls that take it at the same moment
 *   can both run until the first save. The `move` cron task (every minute while a job is active) and the admin
 *   page continue it, each within the profile's requests (40 on `small`).
 * - Pause and cancel write only the stop key (`KV_MOVE_STOP`): a call applies it at its end, and a call that finds
 *   it with no call in flight applies it before any work. Neither rewrites the position.
 * - Order: summaries first, then Search rows, events, server hits, drops, visits, aliases last. Visits are read in
 *   descending key order, site first, so within each site the newest day comes first and reports fill in from
 *   recent to old.
 * - Chunks: `MOVE_ROWS` rows and at most `MOVE_CHUNK_BYTES` of JSON. A failed chunk halves the rows, a chunk that
 *   passes doubles them back; after `MOVE_MAX_FAILS` failures at the same position the job pauses with the error.
 * - On the `small` profile with a D1 destination (`dailyRowsApply`) the rows written count against the copy day
 *   budget (`day-budget.ts`, 15,000 a UTC day, shared with `data/load`) and the write guard's state; at the cap the
 *   job waits until 00:00 UTC (`until`).
 * - Rows written to the destination since the switch win on a key conflict; a visit that went on across the switch
 *   keeps both halves (`SPLIT_SUFFIX`). Counters per day (`ca_srv`, `ca_drops`) follow a ledger in the host KV
 *   (`KV_MOVE_LEDGER`) of source, destination and site: the first move of a pair adds the source count to a key
 *   the destination holds, a move of the same pair again leaves it, and a move back (the reverse pair) keeps the
 *   larger count. A canceled job is resumed from its position (`resumeCanceled`) rather than started again.
 *   Adding is not idempotent: a `pending` marker with the chunk's position and row count is saved before the write,
 *   and a marker found on resume counts as applied: the same rows are loaded again without adding. A write that fails with a definite SQL error did not apply and clears the
 *   marker. The limit: when the outcome is unknown (connection lost, timeout) the marker stays, so if that write did
 *   not apply, the keys of that chunk the destination already held miss the source's counts (an undercount, never a
 *   double count); the check then shows those days as short.
 * - After the copy the source's watermark (taken at start) is written under the destination's prefix and the
 *   destination's in-run cursors (rollup, revenue, retention) are deleted. The watermark only moves back: to the
 *   earliest of the source's, the destination's and the source's last summary day, so the rollup closes every day
 *   after it again from complete rows.
 * - Then each table is checked per site and day (`dayTotals`, integer and real sums), only days inside the
 *   destination's detailed window (`from` in the result). On a day where the destination holds more rows the
 *   source's keys are checked one by one (`missingKeys`), so rows of the destination cannot hide missing ones.
 * - While a job is active (running or paused) the rollup, revenue, retention and Search tasks skip its destination
 *   and the delete tools refuse to start. Ingest is never paused.
 *
 * One `Db` per database and call: on Postgres that is one connection per invocation inside the request scope.
 */
import type { KvLike } from "../core/crypto.js";
import { dayInZone } from "../core/time.js";
import { workerEnv } from "../core/worker-env.js";
import type { Db } from "../db/adapter.js";
import { fromD1, isD1 } from "../db/d1.js";
import { isoDay } from "../db/dialect.js";
import { statePrefix } from "../db/facts.js";
import { fromPg, isHyperdrive } from "../db/pg.js";
import type { Param } from "../db/sql.js";
import type { TableName } from "../db/tables.js";
import { clearReportCache } from "../query/reports/index.js";
import { KV_CURSOR, rawFromDay } from "../query/retention.js";
import { KV_REVENUE_CURSOR, KV_ROLLUP_CURSOR, KV_WATERMARK } from "../query/rollup.js";
import { dailyRowsApply } from "../query/storage.js";
import type { CapacityProfile, Settings } from "../settings.js";
import { type DayTotals, dayTotals, type MoveRow, missingKeys, readChunk, writeChunk } from "./chunks.js";
import { chargeCopyRows, COPY_DAY_ROWS, copiedToday, nextUtcMidnight } from "./day-budget.js";

export const KV_MOVE_JOB = "move:job";
/** Pause or cancel of a job (`{ id, status }`): the job applies it; nothing else rewrites the job for it. */
export const KV_MOVE_STOP = "move:stop";
/** Source, destination and site of every move whose counters were loaded (JSON text of the three). */
export const KV_MOVE_LEDGER = "move:counters";
/** The cron task that continues a job; scheduled while a job is active, canceled when none is. */
export const MOVE_CRON = "move";
export const MOVE_SCHEDULE = "* * * * *";
export const MOVE_ORDER: readonly TableName[] = ["ca_rollup", "ca_cube", "ca_revenue_daily", "ca_search_daily", "ca_events", "ca_srv", "ca_drops", "ca_sessions", "ca_aliases"];
const COUNTERS: ReadonlySet<TableName> = new Set(["ca_srv", "ca_drops"]);
/** Cron state of a database: the watermark is copied from the source, the others are deleted at the destination. */
export const STATE_KEYS = [KV_WATERMARK, KV_ROLLUP_CURSOR, KV_REVENUE_CURSOR, KV_CURSOR] as const;
/** Rows per chunk: on `small` (Workers Free, 10 ms CPU) a chunk must stay small. */
export const MOVE_ROWS: Readonly<Record<CapacityProfile, number>> = { small: 50, standard: 200, dedicated: 200 };
/** JSON bytes per chunk (one bound parameter): half of the 2 MB D1 documents per string or row. */
export const MOVE_CHUNK_BYTES = 1_000_000;
/** Failures at one position before the job pauses. */
export const MOVE_MAX_FAILS = 5;
/** Rows written per row copied: a secondary index adds one on D1. */
export const WRITE_ROWS: Partial<Record<TableName, number>> = { ca_sessions: 2, ca_events: 2, ca_search_daily: 2 };
/** Source keys per page of the key check. */
const KEY_ROWS = 500;
export const MOVE_LEASE_S = 60;
/** Wall time within which one call starts chunks, below the cron hook's 55 s. */
export const MOVE_TICK_MS = 40_000;
/** Fewer requests than this make no chunk worth starting: job and stop read, lease and its check, a chunk (read, write, save), the end. */
export const MIN_MOVE_REQUESTS = 12;
/** Requests a call keeps for its end: the holder read, the stop read, the job write, the cron cancel. */
const END_REQUESTS = 4;
/** Differing keys a verification keeps per table. */
const SAMPLE = 5;

export interface VerifyTable {
	/** Site and day keys of the source that were compared. */
	keys: number;
	/** Keys where the destination holds fewer rows or a lower sum than the source, or lacks a source row: data missing. */
	short: number;
	/** Keys where the destination holds more (rows written since the switch, split visits). */
	more: number;
	/** First day compared: the destination's detailed window. Earlier days of the source are not compared (`skipped`); null: every day. Always set by the check. */
	from?: string | null;
	skipped?: number;
	/** Days checked key by key (the destination held more rows). */
	byKey?: number;
	sample: Array<{ key: string; source: Record<string, string>; dest: Record<string, string> | null }>;
}

export interface MoveJob {
	id: string;
	by: string | null;
	at: number;
	/** Source binding; null is the EmDash database. */
	source: string | null;
	/** Binding of the destination database (null: the EmDash database), as `FactsTarget.binding`. */
	dest: string | null;
	/** Only this site's rows; absent: every site of the source. The destination is this site's database. */
	site?: string;
	status: "running" | "paused" | "done" | "canceled";
	/** Position: index into `MOVE_ORDER` and the key of the last row copied of that table. */
	t: number;
	after: Param[] | null;
	/** A counter chunk whose load may have been applied (saved before the write): its position and rows. */
	pending: { t: number; after: Param[] | null; n: number } | null;
	/** How counters are loaded, from the ledger at the first counter chunk. */
	counters?: "add" | "max" | "none";
	/** Rows per chunk after a failure: halved by each failure, doubled by each chunk that passes. */
	chunkRows?: number;
	/** Failures at one position (`pos`: the position as JSON). */
	fails?: { pos: string; n: number };
	/** The day's copy rows are used up: the job continues at this epoch (00:00 UTC). */
	until?: number;
	/** Rows copied into the destination in the UTC day `day` (the move and `data/load`), as of the last call. */
	today?: { day: string; rows: number };
	/** Rows of the source at start, rows read and rows inserted, per table. */
	total: Record<string, number>;
	read: Record<string, number>;
	inserted: Record<string, number>;
	/** The source's cron state at start; its watermark is written under the destination's prefix after the copy. */
	state: Record<string, unknown>;
	stateCopied: boolean;
	/** Verification position and result; `vk` the key check of table `v`: days left, position within the first. */
	v: number;
	vk?: { days: Array<[string, string]>; after: Param[] | null; hit: boolean };
	verify: Record<string, VerifyTable>;
	error: string | null;
	finished?: number;
	/** When the old tables were dropped. */
	dropped?: number;
	lease?: number;
	/** Random id of the call holding the lease. */
	holder?: string;
}

export const isMoving = (j: MoveJob | null): j is MoveJob => !!j && (j.status === "running" || j.status === "paused");
export type MoveJobView = Omit<MoveJob, "lease" | "holder" | "state" | "pending" | "after" | "vk" | "fails" | "chunkRows"> & {
	percent: number;
	/** Rows the copy may still write today on `small` with D1 (as of the last call); null when no day budget applies. */
	rowsLeftToday: number | null;
};
export function moveView(j: MoveJob | null): MoveJobView | null {
	if (!j) return null;
	const { lease: _l, holder: _h, state: _s, pending: _p, after: _a, vk: _k, fails: _f, chunkRows: _r, ...v } = j;
	const total = Object.values(j.total).reduce((a, b) => a + b, 0);
	const read = Object.values(j.read).reduce((a, b) => a + b, 0);
	const percent = j.t >= MOVE_ORDER.length ? 100 : total ? Math.min(99, Math.floor((read / total) * 100)) : 0;
	return { ...v, percent, rowsLeftToday: j.today ? Math.max(0, COPY_DAY_ROWS - j.today.rows) : null };
}

/** The `Db` of a D1 or Hyperdrive binding of this Worker, or null when there is no such binding. */
export async function openBinding(name: string, env: () => Promise<Record<string, unknown> | null> = workerEnv): Promise<Db | null> {
	const b = (await env())?.[name];
	return isD1(b) ? fromD1(b) : isHyperdrive(b) ? fromPg(b, name) : null;
}

/**
 * The source's cron state now. The EmDash database keeps the plain keys; a binding keeps the plain keys when it was
 * the default database and its prefixed keys when a site was routed to it (taken when its prefixed watermark exists).
 */
export async function sourceState(kv: Pick<KvLike, "get">, source: string | null): Promise<Record<string, unknown>> {
	let prefix = source === null ? "" : statePrefix(source);
	if (prefix && (await kv.get(prefix + KV_WATERMARK)) === null) prefix = "";
	const out: Record<string, unknown> = {};
	for (const k of STATE_KEYS) out[k] = await kv.get(prefix + k);
	return out;
}

/** Rows of every table of the source (of one site), for the progress. */
export async function sourceTotals(db: Db, site?: string): Promise<Record<string, number>> {
	const out: Record<string, number> = {};
	for (const t of MOVE_ORDER) {
		const [r] = await db.all<{ n: unknown }>(`SELECT COUNT(*) AS n FROM ${t}${site === undefined ? "" : " WHERE site = ?"}`, site === undefined ? [] : [site]);
		out[t] = Number(r?.n ?? 0);
	}
	return out;
}

export function newMoveJob(o: { source: string | null; dest: string | null; site?: string | undefined; by: string | null; now: number; total: Record<string, number>; state: Record<string, unknown> }): MoveJob {
	const zero = Object.fromEntries(MOVE_ORDER.map((t) => [t, 0]));
	return {
		id: `${o.now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
		by: o.by,
		at: o.now,
		source: o.source,
		dest: o.dest,
		...(o.site !== undefined ? { site: o.site } : {}),
		status: "running",
		t: 0,
		after: null,
		pending: null,
		total: o.total,
		read: { ...zero },
		inserted: { ...zero },
		state: o.state,
		stateCopied: false,
		v: 0,
		verify: {},
		error: null,
	};
}

const splitKey = (key: string): [string, string] => {
	const i = key.lastIndexOf(" ");
	return [key.slice(0, i), key.slice(i + 1)];
};
/** Whether a site and day key lies before `from` (a table without a day, day "", is always compared). */
const before = (key: string, from: string | null) => {
	const day = splitKey(key)[1];
	return from !== null && day !== "" && isoDay(day) < from;
};

/**
 * Source against destination per site and day from `from` on: the destination may hold more (rows since the
 * switch), never less. Days before `from` are counted as `skipped`.
 */
export function compareTotals(source: DayTotals, dest: DayTotals, from: string | null = null): VerifyTable {
	const out: VerifyTable = { keys: 0, short: 0, more: 0, from, skipped: 0, byKey: 0, sample: [] };
	for (const [key, s] of Object.entries(source)) {
		if (before(key, from)) {
			out.skipped = (out.skipped ?? 0) + 1;
			continue;
		}
		out.keys++;
		const d = dest[key];
		if (!d || Object.entries(s).some(([c, v]) => Number(d[c] ?? 0) < Number(v))) {
			out.short++;
			if (out.sample.length < SAMPLE) out.sample.push({ key, source: s, dest: d ?? null });
		} else if (Object.entries(s).some(([c, v]) => d[c] !== v)) out.more++;
	}
	return out;
}

/** Site and day keys the totals cannot settle: the destination holds more rows there, which could hide missing ones. */
export function keyCheckDays(source: DayTotals, dest: DayTotals, from: string | null = null): Array<[string, string]> {
	return Object.entries(source)
		.filter(([key, s]) => !before(key, from) && Number(dest[key]?.n ?? 0) > Number(s.n) && !Object.entries(s).some(([c, v]) => Number(dest[key]?.[c] ?? 0) < Number(v)))
		.map(([key]) => splitKey(key));
}

/** Source keys of one day found missing by `missingKeys`: on the day's first find it turns from more to short. */
function noteMissing(v: VerifyTable, site: string, day: string, missing: readonly MoveRow[], first: boolean): void {
	if (!missing.length) return;
	if (first) {
		v.short++;
		v.more--;
	}
	for (const m of missing) if (v.sample.length < SAMPLE) v.sample.push({ key: `${site} ${day}`, source: Object.fromEntries(Object.entries(m).map(([k, x]) => [k, String(x)])), dest: null });
}

/** Verify one table at once (the route's check again): totals, then the key check of the days that need one. */
export async function verifyTable(src: Db, dst: Db, table: TableName, site?: string, from: string | null = null): Promise<VerifyTable> {
	const s = await dayTotals(src, table, site);
	const d = await dayTotals(dst, table, site);
	const v = compareTotals(s, d, from);
	for (const [st, day] of keyCheckDays(s, d, from)) {
		v.byKey = (v.byKey ?? 0) + 1;
		let after: Param[] | null = null;
		let hit = false;
		do {
			const p = await missingKeys(src, dst, table, st, day, after, KEY_ROWS);
			noteMissing(v, st, day, p.missing, !hit);
			hit ||= p.missing.length > 0;
			after = p.next;
		} while (after);
	}
	return v;
}

/** First day of the destination's detailed window, or null without settings (every day is compared). */
export const verifyFrom = async (kv: KvLike, s: Pick<Settings, "rawRetentionDays" | "siteTimezone"> | undefined, now: number): Promise<string | null> => (s ? rawFromDay(kv, s, now) : null);

const pairId = (source: string | null, dest: string | null, site: string | undefined) => JSON.stringify([source, dest, site ?? null]);

/** How this job loads counters, from the ledger; the job's pair is recorded. Two requests. */
async function counterMode(kv: KvLike, j: MoveJob): Promise<NonNullable<MoveJob["counters"]>> {
	const ledger = (await kv.get<string[]>(KV_MOVE_LEDGER)) ?? [];
	const id = pairId(j.source, j.dest, j.site);
	if (ledger.includes(id)) return "none";
	await kv.set(KV_MOVE_LEDGER, [...ledger, id]);
	return ledger.includes(pairId(j.dest, j.source, j.site)) ? "max" : "add";
}

/**
 * The last job when it is a canceled move of the same source, destination and site, set running again from its
 * saved position (the stop key cleared, the job saved); null otherwise. The start route calls it before a new job.
 */
export async function resumeCanceled(kv: KvLike, o: { source: string | null; dest: string | null; site?: string | undefined }): Promise<MoveJob | null> {
	const job = await kv.get<MoveJob>(KV_MOVE_JOB);
	if (job?.status !== "canceled" || job.dropped || job.source !== o.source || job.dest !== o.dest || job.site !== o.site) return null;
	const { finished: _f, lease: _l, holder: _h, fails: _x, ...rest } = job;
	const j: MoveJob = { ...rest, status: "running", error: null };
	await kv.delete(KV_MOVE_STOP);
	await kv.set(KV_MOVE_JOB, j);
	return j;
}

/**
 * Whether a statement failed with an error the database reported (it did not apply): a SQLSTATE outside the
 * connection classes, or a SQLite result code. A lost connection or a timeout leaves the outcome unknown.
 */
export function definiteSqlError(err: unknown): boolean {
	const code = String((err as { code?: unknown } | null)?.code ?? "");
	// A socket error code (EPIPE) has the shape of a SQLSTATE but is a connection error.
	if (/^[0-9A-Z]{5}$/.test(code) && !/^E[A-Z]{4}$/.test(code)) return !code.startsWith("08") && !/^57P0[1-3]$/.test(code);
	return /\bSQLITE_[A-Z_]+/.test(`${code} ${String((err as { message?: unknown } | null)?.message ?? err)}`);
}

export interface MoveEnv {
	/** The host KV (unprefixed). */
	kv: KvLike;
	/** The source database: null is the EmDash database. */
	source(binding: string | null): Promise<Db>;
	/** The database `site` writes to now (no site: the default database). */
	dest(site?: string): Promise<Db>;
	/** The host KV under the prefix of `site`'s database. */
	destKv(kv: KvLike, site?: string): KvLike;
	profile: CapacityProfile;
	/** For the check's window (the destination's detailed days); absent: every day is compared. */
	settings?: Pick<Settings, "rawRetentionDays" | "siteTimezone"> | undefined;
	/** Epoch seconds. */
	now: number;
	cron?: { schedule(name: string, o: { schedule: string }): Promise<void>; cancel(name: string): Promise<void> } | undefined;
	/** Milliseconds, for the call's wall time; defaults to the clock. */
	clock?: () => number;
}

class Budget extends Error {}
/** Another call holds the job now: this call stops without saving it. */
class Lost extends Error {}
type Stop = { id: string; status: "paused" | "canceled" };
const same = (a: readonly Param[] | null, b: readonly Param[] | null) => JSON.stringify(a) === JSON.stringify(b);
function applyStop(j: MoveJob, stop: Stop | null, now: number): void {
	if (stop?.id !== j.id || j.status !== "running") return;
	j.status = stop.status;
	if (stop.status === "canceled") j.finished = now;
}

/**
 * One bounded call of the current job: chunks until `requests` or the wall time is spent, then the state copy and
 * the verification. Returns the job, or null. A failing statement is saved as `error` and rethrown; the next call
 * repeats the chunk from the saved position with half the rows.
 */
export async function runMoveJob(e: MoveEnv, requests: number): Promise<MoveJob | null> {
	const job = await e.kv.get<MoveJob>(KV_MOVE_JOB);
	if (!isMoving(job)) {
		// No work left: the every-minute task goes.
		await e.cron?.cancel(MOVE_CRON).catch(() => {});
		return job;
	}
	if (job.status !== "running" || (job.lease ?? 0) > e.now) return job;
	// A pause or cancel sent while no call ran is applied before any work.
	const stop = await e.kv.get<Stop>(KV_MOVE_STOP);
	if (stop?.id === job.id) {
		applyStop(job, stop, e.now);
		await e.kv.set(KV_MOVE_JOB, job);
		if (!isMoving(job)) await e.cron?.cancel(MOVE_CRON).catch(() => {});
		return job;
	}
	if ((job.until ?? 0) > e.now || requests < MIN_MOVE_REQUESTS) return job;
	const clock = e.clock ?? Date.now;
	const started = clock();
	const at = () => e.now + Math.floor((clock() - started) / 1000);
	const { until: _u, ...rest } = job;
	const j: MoveJob = { ...rest, lease: e.now + MOVE_LEASE_S, holder: Math.random().toString(36).slice(2, 10) };
	await e.kv.set(KV_MOVE_JOB, j);
	// shortcut: the KV has no atomic take, so the lease is read back: two calls that read the job at the same moment
	// would both pass otherwise; a compare-and-set lease once the host KV's revision semantics are settled.
	if ((await e.kv.get<MoveJob>(KV_MOVE_JOB))?.holder !== j.holder) return job;
	// The job and stop read, the lease and its check; the end keeps its own.
	let used = 4;
	let endRequests = END_REQUESTS;
	const left = () => requests - used - endRequests;
	const dkv = e.destKv(e.kv, j.site);
	/** Rows charged to the day by this call, not yet in the counter. */
	let copied = 0;
	const flush = async () => {
		if (!copied) return;
		const rows = await chargeCopyRows(dkv, e.now, copied);
		copied = 0;
		if (j.today) j.today.rows = rows;
	};
	/** The holder read back; another holder ends this call. */
	const mine = async () => (await e.kv.get<MoveJob>(KV_MOVE_JOB))?.holder === j.holder;
	/** A pause or cancel sent while this call ran wins over the status it read. */
	const end = async () => {
		await flush();
		if (!(await mine())) return;
		applyStop(j, await e.kv.get<Stop>(KV_MOVE_STOP), e.now);
		delete j.lease;
		delete j.holder;
		await e.kv.set(KV_MOVE_JOB, j);
	};
	const save = async () => {
		used += 2;
		if (!(await mine())) throw new Lost();
		j.lease = at() + MOVE_LEASE_S;
		await e.kv.set(KV_MOVE_JOB, j);
	};
	let src: Db | undefined;
	const source = async () => (src ??= await e.source(j.source));
	let dst: Db | undefined;
	let wrote = false;
	/** This call saved the counter marker of the write in flight, and that write started. */
	let marked = false;
	let writing = false;
	try {
		dst = await e.dest(j.site);
		const small = dailyRowsApply(e.profile, dst);
		/** Rows the day budget leaves (on `small` with D1). */
		let room = Number.POSITIVE_INFINITY;
		if (small) {
			// The counter read now; at the end its update (2) and the write budget state's (2).
			used++;
			endRequests += 4;
			const rows = await copiedToday(dkv, e.now);
			j.today = { day: dayInZone(e.now, "UTC"), rows };
			room = COPY_DAY_ROWS - rows;
		}
		while (j.t < MOVE_ORDER.length) {
			const table = MOVE_ORDER[j.t] as TableName;
			const counters = COUNTERS.has(table);
			const ledger = counters && !j.counters ? 2 : 0;
			if (left() < (counters ? 6 : 4) + ledger || clock() - started > MOVE_TICK_MS) throw new Budget();
			if (ledger) {
				used += ledger;
				j.counters = await counterMode(e.kv, j);
			}
			const per = WRITE_ROWS[table] ?? 1;
			// A marker of this very position: its load may have been applied, so the same rows are loaded without adding.
			const marker = counters && j.pending && j.pending.t === j.t && same(j.pending.after, j.after) ? j.pending : null;
			let size = j.chunkRows ?? MOVE_ROWS[e.profile];
			if (marker) size = marker.n;
			else if (small) {
				const fit = Math.floor(room / per);
				if (fit < 1) {
					j.until = nextUtcMidnight(e.now);
					throw new Budget();
				}
				size = Math.min(size, fit);
			}
			used++;
			const c = await readChunk(await source(), table, j.after, size, j.site, MOVE_CHUNK_BYTES);
			const add = counters && j.counters === "add" && !marker;
			if (add && c.rows.length) {
				j.pending = { t: j.t, after: j.after, n: c.rows.length };
				marked = true;
				await save();
			}
			used++;
			writing = true;
			const n = await writeChunk(dst, table, c.rows, add ? "add" : counters && j.counters === "max" ? "max" : null);
			writing = marked = false;
			wrote ||= n > 0;
			copied += small ? n * per : 0;
			room -= n * per;
			j.read[table] = (j.read[table] ?? 0) + c.rows.length;
			j.inserted[table] = (j.inserted[table] ?? 0) + n;
			j.pending = null;
			j.error = null;
			delete j.fails;
			// After a failure the rows grow back, doubling with each chunk that passes.
			if (j.chunkRows && j.chunkRows * 2 < MOVE_ROWS[e.profile]) j.chunkRows *= 2;
			else delete j.chunkRows;
			if (c.next) j.after = c.next;
			else {
				j.t++;
				j.after = null;
				delete j.chunkRows;
			}
			await save();
		}
		if (!j.stateCopied) {
			if (left() < STATE_KEYS.length + 4) throw new Budget();
			used += 2;
			const [last] = await (await source()).all<{ d: string | null }>(`SELECT MAX(day) AS d FROM ca_rollup${j.site === undefined ? "" : " WHERE site = ?"}`, j.site === undefined ? [] : [j.site]);
			const marks = [j.state[KV_WATERMARK], await dkv.get<string>(KV_WATERMARK), last?.d ?? null];
			// No watermark on any side means the rollup starts at the first detailed day: the safe choice.
			const wm = marks.some((m) => typeof m !== "string") ? null : (marks as string[]).sort()[0];
			for (const k of STATE_KEYS) {
				used++;
				// The other keys are in-run cursors of another database: they carry no progress here.
				if (k === KV_WATERMARK && wm) await dkv.set(k, wm);
				else await dkv.delete(k);
			}
			j.stateCopied = true;
			await save();
		}
		while (j.v < MOVE_ORDER.length) {
			const table = MOVE_ORDER[j.v] as TableName;
			if (left() < (j.vk ? 4 : 5)) throw new Budget();
			if (!j.vk) {
				used += 3;
				const from = await verifyFrom(dkv, e.settings, e.now);
				const s = await dayTotals(await source(), table, j.site);
				const d = await dayTotals(dst, table, j.site);
				j.verify[table] = compareTotals(s, d, from);
				j.vk = { days: keyCheckDays(s, d, from), after: null, hit: false };
				(j.verify[table] as VerifyTable).byKey = j.vk.days.length;
			} else {
				used += 2;
				const [site, day] = j.vk.days[0] as [string, string];
				const p = await missingKeys(await source(), dst, table, site, day, j.vk.after, KEY_ROWS);
				noteMissing(j.verify[table] as VerifyTable, site, day, p.missing, !j.vk.hit);
				j.vk.hit ||= p.missing.length > 0;
				if (p.next) j.vk.after = p.next;
				else j.vk = { days: j.vk.days.slice(1), after: null, hit: false };
			}
			if (!j.vk.days.length) {
				delete j.vk;
				j.v++;
			}
			await save();
		}
		j.status = "done";
		j.finished = e.now;
	} catch (err) {
		if (err instanceof Lost) {
			await flush();
			return e.kv.get<MoveJob>(KV_MOVE_JOB);
		}
		if (!(err instanceof Budget)) {
			// A marker whose write never ran, or was refused, marks nothing: the retry adds the counts.
			if (marked && (!writing || definiteSqlError(err))) j.pending = null;
			const pos = JSON.stringify([j.t, j.after, j.v, j.vk?.days[0] ?? null, j.vk?.after ?? null]);
			const n = j.fails?.pos === pos ? j.fails.n + 1 : 1;
			j.fails = { pos, n };
			if (j.t < MOVE_ORDER.length) j.chunkRows = Math.max(1, Math.floor((j.chunkRows ?? MOVE_ROWS[e.profile]) / 2));
			const msg = (err as Error).message;
			j.error = msg;
			if (n % MOVE_MAX_FAILS === 0) {
				j.status = "paused";
				j.error = `The move stopped after ${n} failed tries at the same place in ${MOVE_ORDER[j.t] ?? MOVE_ORDER[j.v]}: ${msg}. Resume it to try again.`;
			}
			await end();
			throw err;
		}
	} finally {
		if (wrote) clearReportCache();
	}
	await end();
	if (!isMoving(j)) await e.cron?.cancel(MOVE_CRON).catch(() => {});
	return j;
}

/** Drop the analytics tables and `ca_meta` from a database (the old one, after a move): one batch. */
export async function dropTables(db: Db): Promise<void> {
	await db.batch([...MOVE_ORDER, "ca_meta"].map((t) => ({ sql: `DROP TABLE IF EXISTS ${t}`, params: [] })));
}
