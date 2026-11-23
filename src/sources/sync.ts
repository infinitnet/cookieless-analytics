/**
 * Search sync tick. Walks the mapped `(site, source)` pairs (local site first, then
 * client sites by id; per site Google then Bing) starting at `kv search:cursor`. A due pair pulls the
 * days from today minus 7 to today minus 1 (the three newest marked provisional) and replaces stored
 * rows; an active backfill then advances. Both pull adaptive windows of days (one call per grain returns
 * every day of a window), up to three windows fetched at once, stored one after the other.
 *
 * Every fetch, database statement and KV call of the tick counts against `syncSubrequestBudget`, the
 * share of the Worker's per-invocation request limit the sync may use, and the tick stops before it
 * (or after 40 s), saves the cursor and schedules one `search-continue` for now plus 60 s. Rows written
 * count against the daily rows budget of `budget.ts`: a window stores only the days that fit, and once the
 * day's rows are used the walk stops and continues at the next UTC day. An active
 * backfill and a throttled Bing pull also schedule one. A pair's error is stored in its state key and the
 * walk goes on; 401 and 403 are not retried before the next due time. `kv search:lock` keeps two ticks
 * from running at once.
 */
import type { KvLike } from "../core/crypto.js";
import { addDays, dayInZone, daysBetween } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import type { ClientSite } from "../multisite/registry.js";
import type { Settings } from "../settings.js";
import { bing } from "./bing.js";
import { GSC_GRAINS, GSC_PAGE_ROWS, google } from "./gsc.js";
import { canonicalOrigin, pageKeyFor } from "./page-key.js";
import { budgetState, dailyRowsApply } from "../query/storage.js";
import { nextUtcDay, ROWS_PER_DELETE, ROWS_PER_INSERT, ROWS_PER_ROW_BOUND, RowsPaused, type SyncAllowance, SyncRows } from "./budget.js";
import { changedDays, mergeRows, replaceStatements, writeReplace } from "./store.js";
import { type Budget, BudgetExhausted, type Http, MAPPING_FIELD, type SearchRow, type SearchSource, SOURCE_IDS, type SiteTarget, SourceError, type SourceId, ThrottledError } from "./types.js";

export const SOURCES: Record<SourceId, SearchSource> = { google, bing };

/** Default of `syncSubrequestBudget`: the Free plan allows 50 requests per invocation; the host's cron bookkeeping, settings and storage reads take the rest. */
export const DEFAULT_SUBREQUEST_BUDGET = 40;
/** Requests kept for the end of a tick: the cursor, the lock release and the pair state. */
export const END_RESERVE = 3;
export const MAX_MS = 40_000;
export const CONTINUE_DELAY_MS = 60_000;
export const SYNC_DAYS = 7;
export const PROVISIONAL_DAYS = 3;
/** Adaptive window of days per pull: starts at 8, doubles while the biggest grain stays under a quarter page, halves on a full page, a load error or a window that did not fit a tick. */
export const WINDOW_START = 8;
export const WINDOW_MAX = 32;
/** Windows fetched at once. Google allows 1,200 queries per minute per site; three windows are 18 calls. */
export const FETCH_PARALLEL = 3;
/** First wait after a throttled or overloaded provider; doubles per repeat up to `RETRY_MAX_MS` (and never beyond the sync interval). */
export const RETRY_BASE_MS = 5 * 60_000;
export const RETRY_MAX_MS = 2 * 3_600_000;
export const KV_SEARCH_CURSOR = "search:cursor";
export const KV_SEARCH_LOCK = "search:lock";
/** Longer than the cron hook timeout (55 s), so a crashed tick's lock expires before the next minute's tick is refused twice. */
export const LOCK_MS = 60_000;
export const THROTTLE_TEXT = { bing: "Bing limits shared server addresses. The sync retries on the next scheduled run.", google: "Google limits how often this server may call it. The sync retries on the next scheduled run." } as const;
/**
 * One-shot continuation names. The host deletes a finished one-shot row by id and `schedule()` upserts
 * the same `(plugin, name)` row (`plugins/cron.ts`), so a continuation that rescheduled its own name
 * would be deleted on return; a continuation therefore schedules the other name.
 */
export const CONTINUE_JOBS = ["search-continue", "search-continue-next"] as const;
export const stateKey = (site: string, source: SourceId) => `search:state:${site}:${source}`;
export const backfillKey = (site: string, source: SourceId) => `search:backfill:${site}:${source}`;

export interface PairState {
	/** Time of the last successful pull. */
	lastRun?: string | null;
	status?: "ok" | "error" | "throttled";
	lastError?: string | null;
	lastErrorAt?: string | null;
	/** Next day to pull of an unfinished sync window. */
	cursorDay?: string | null;
	/** Days per pull of the next sync window. */
	window?: number;
	/** Throttled: the provider's code, when it last answered so, how often in a row, and the next attempt. */
	throttleCode?: string | null;
	throttledAt?: string | null;
	throttleCount?: number;
	nextAttempt?: string | null;
	/** Failed pulls in a row (not throttles); the next try waits `backoff(errorCount)`, kept in `nextAttempt`. */
	errorCount?: number;
}
export interface BackfillState {
	from: string;
	to: string;
	cursor: string;
	done: boolean;
	error: string | null;
	/** Days per pull of the next backfill window. */
	window?: number;
	/** Rows stored so far. */
	rows?: number;
	/** Start time (ms), for the remaining time estimate. */
	started?: number;
	/** After a load error: no pull before this time (ms), doubling per error in a row (`retries`). */
	retryAt?: number;
	/** The next batch runs at about this time (ms): a minute after an unfinished tick, 00:00 UTC once today's rows are used. */
	nextAt?: number;
	retries?: number;
}

export interface SyncCtx {
	http: Http;
	kv: KvLike;
	db: Db;
	/** The database of a site's analytics tables (site routing); absent: `db` holds every site. */
	dbOf?: (site: string) => Promise<Db>;
	settings: Settings;
	/** Registered client sites. */
	clients: readonly ClientSite[];
	cron?: { schedule(name: string, o: { schedule: string }): Promise<void> };
	/** Milliseconds. */
	now(): number;
	/** Request URL of an admin or agent call: the local site's origin when `siteOrigin` is empty. */
	requestUrl?: string;
	/** Waits before an in-tick retry; defaults to a timer. */
	sleep?(ms: number): Promise<void>;
	log?: { warn(message: string): void };
}

export interface Pair {
	id: string;
	site: string;
	source: SourceId;
	target: SiteTarget;
}

/** The property a site maps to at a provider, or "". */
export function mappingOf(s: Settings, client: ClientSite | undefined, source: SourceId): string {
	return (client ? client[MAPPING_FIELD[source]] : s[MAPPING_FIELD[source]]) ?? "";
}

/** The site's target at a provider: property and page key normalizer. */
export function targetOf(s: Settings, site: string, client: ClientSite | undefined, source: SourceId, requestUrl?: string): SiteTarget {
	const property = mappingOf(s, client, source);
	return { site, property, pageKey: pageKeyFor(canonicalOrigin({ siteOrigin: s.siteOrigin, client, requestUrl, property })) };
}

/** Every configured and mapped pair in walk order. Unmapped sites and unconfigured sources are skipped. */
export function mappedPairs(s: Settings, clients: readonly ClientSite[], requestUrl?: string): Pair[] {
	const sites: Array<[string, ClientSite | undefined]> = [[s.siteId, undefined], ...[...clients].sort((a, b) => (a.id < b.id ? -1 : 1)).map((c): [string, ClientSite] => [c.id, c])];
	const out: Pair[] = [];
	for (const [site, client] of sites)
		for (const source of SOURCE_IDS) {
			if (!SOURCES[source].configured(s) || !mappingOf(s, client, source)) continue;
			out.push({ id: `${site}:${source}`, site, source, target: targetOf(s, site, client, source, requestUrl) });
		}
	return out;
}

/** A provider error keeps its own text. Anything else names the error class and a short, single-line excerpt so an operator can find the cause (no stack, no secrets: messages come from the database or the runtime). */
export const message = (e: unknown) => {
	if (e instanceof SourceError) return e.message;
	const name = e instanceof Error && e.name ? e.name : "Error";
	const text = (e instanceof Error ? e.message : typeof e === "string" ? e : "").replace(/\s+/g, " ").trim().slice(0, 160);
	return text ? `The pull failed (${name}: ${text}).` : `The pull failed (${name}).`;
};
const noRetry = (e: unknown) => e instanceof SourceError && (e.status === 401 || e.status === 403);
/** Too many requests or a server side failure: the provider is under load, so the window shrinks and the next try waits. */
const loadError = (e: unknown) => e instanceof SourceError && (e.status === 429 || e.status >= 500);

/** `limit` requests (fetches, statements, KV calls) or `maxMs`, whichever comes first, minus `END_RESERVE`. */
export function makeBudget(now: () => number, limit = DEFAULT_SUBREQUEST_BUDGET, maxMs = MAX_MS): Budget {
	const start = now();
	let calls = 0;
	let used = 0;
	const left = () => limit - END_RESERVE - used;
	const need = (n: number) => {
		if (n > left() || now() - start >= maxMs) throw new BudgetExhausted();
	};
	return {
		spend() {
			need(1);
			calls++;
		},
		need,
		count(n = 1) {
			used += n;
		},
		get calls() {
			return calls;
		},
		get used() {
			return used;
		},
		get left() {
			return left();
		},
		limit,
	};
}

/** Today's Search sync rows, with today's estimated ingest rows (`small`: the write guard's estimate without the sync rows). */
export function syncRows(ctx: Pick<SyncCtx, "db" | "kv" | "now" | "settings">): SyncRows {
	const s = ctx.settings;
	// `small` on Postgres has no D1 daily rows to share: the Search rows get the standard allowance.
	const profile = s.capacityProfile === "small" && !dailyRowsApply("small", ctx.db) ? "standard" : s.capacityProfile;
	return new SyncRows(ctx.kv, ctx.now, profile, async () => {
		const w = await budgetState(ctx.db, ctx.kv, Math.floor(ctx.now() / 1000), s.capacityProfile, s.siteTimezone);
		return w ? w.rows - (w.sync ?? 0) : 0;
	});
}

/** The database of `site`'s search rows. */
const siteDb = (ctx: SyncCtx, site: string): Promise<Db> => (ctx.dbOf ? ctx.dbOf(site) : Promise.resolve(ctx.db));

/** The tick's context with every fetch, statement and KV call metered against the budget. */
function metered(ctx: SyncCtx, budget: Budget): SyncCtx {
	const c = (n = 1) => budget.count(n);
	const { http, db, dbOf, kv } = ctx;
	const count = (db: Db): Db => ({
		dialect: db.dialect,
		run: (sql, p) => (c(), db.run(sql, p)),
		all: (sql, p) => (c(), db.all(sql, p)),
		batch: (stmts) => (c(stmts.length), db.batch(stmts)),
		get meta() {
			return db.meta;
		},
	});
	return {
		...ctx,
		http: { fetch: (url, init) => (c(), http.fetch(url, init)) },
		db: count(db),
		...(dbOf ? { dbOf: async (site: string) => count(await dbOf(site)) } : {}),
		kv: {
			get: <T>(key: string) => (c(), kv.get<T>(key)),
			set: (key, v) => (c(), kv.set(key, v)),
			delete: (key) => (c(), kv.delete(key)),
			list: (p) => (c(), kv.list(p)),
			compareAndSet: (key, e, v) => (c(), kv.compareAndSet(key, e, v)),
		},
	};
}

/**
 * The platform's own per-invocation request limit ("Too many subrequests by single Worker invocation") is
 * not a failure of the pull: nothing of the window was stored and the cursor stays, so the work resumes on
 * the next tick exactly like an exhausted tick budget.
 */
const isPlatformLimit = (e: unknown) => e instanceof Error && /too many subrequests/i.test(e.message);
async function yieldOnPlatformLimit<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (e) {
		if (isPlatformLimit(e)) throw new BudgetExhausted();
		throw e;
	}
}

const sourceCtx = (ctx: SyncCtx, budget: Budget) => ({ http: ctx.http, kv: ctx.kv, settings: ctx.settings, budget, now: ctx.now, ...(ctx.sleep ? { sleep: ctx.sleep } : {}) });
const provisional = (today: string) => (day: string) => day >= addDays(today, -PROVISIONAL_DAYS);
const lesser = (d: string, e: string) => (d < e ? d : e);
/**
 * The days of `days` (oldest first, or newest first) whose rows written fit the rows left today, stopping at the
 * first that does not. A day costs its stored rows deleted plus its rows inserted when `stored` counts them, else
 * the bound `ROWS_PER_ROW_BOUND` per row. A day bigger than the whole share is taken alone on a UTC day without
 * sync writes yet, while it stays under the pause line, so a large site still makes progress.
 */
function fitting(a: SyncAllowance, days: ReadonlyMap<string, SearchRow[]>, newestFirst = false, stored?: ReadonlyMap<string, number>): Map<string, SearchRow[]> {
	const out = new Map<string, SearchRow[]>();
	if (a.paused) return out;
	let left = a.left;
	const keys = [...days.keys()].sort();
	if (newestFirst) keys.reverse();
	for (const day of keys) {
		const list = days.get(day) ?? [];
		const cost = stored ? (stored.get(day) ?? 0) * ROWS_PER_DELETE + list.length * ROWS_PER_INSERT : list.length * ROWS_PER_ROW_BOUND;
		const alone = !out.size && a.used === 0 && cost <= (a.pauseAt === null ? a.budget : a.pauseAt - (a.ingest ?? 0));
		if (cost > left && !alone) break;
		left -= cost;
		out.set(day, list);
	}
	return out;
}
const backoff = (count: number, s: Settings) => Math.min(RETRY_BASE_MS * 2 ** Math.max(0, count - 1), RETRY_MAX_MS, s.searchSyncHours * 3_600_000);

/**
 * Pull `pos.cursor`..`last` of a range source (Google) in windows of `pos.win` days, storing each window
 * whole and moving `pos.cursor` (then calling `stored`, which persists it) only after it is stored, so a
 * crash resumes cleanly. Up to `FETCH_PARALLEL` windows are fetched at once when the budget has room for
 * all of them; writes stay in order. Rethrows `BudgetExhausted` and provider errors with `pos.win` set
 * to the window size to use next.
 */
async function pullRange(ctx: SyncCtx, p: Pair, src: SearchSource, budget: Budget, rows: SyncRows, today: string, pos: { cursor: string; win: number }, last: string, stored: (rows: number) => Promise<void>, pace: { perDay?: number } = {}): Promise<void> {
	const fetchRange = src.fetchRange;
	if (!fetchRange) return;
	// A window costs one call per grain, the stored rows count (and a comparison per 400,000 characters of rows of stored days), its writes (at least two statements), the cursor save and the rows charge.
	const perWindow = GSC_GRAINS.length + 5;
	while (pos.cursor <= last) {
		const a = await rows.allowance();
		if (a.paused) throw new RowsPaused(a.resumeAt ?? nextUtcDay(ctx.now()));
		// Days today's rows allow at the rows per day seen so far (before any, the configured cap); one probe day when unknown or on a fresh UTC day.
		let room = Math.floor(a.left / (ROWS_PER_INSERT * (pace.perDay ?? ctx.settings.searchMaxRowsPerDay)));
		if (room < 1 && (pace.perDay === undefined || a.used === 0)) room = 1;
		if (room < 1) throw new RowsPaused(nextUtcDay(ctx.now()));
		const ranges: Array<[string, string]> = [];
		for (let from = pos.cursor; from <= last && room > 0 && ranges.length < FETCH_PARALLEL && (ranges.length + 1) * perWindow <= budget.left; ) {
			const to = lesser(addDays(from, Math.min(pos.win, room) - 1), last);
			ranges.push([from, to]);
			room -= daysBetween(from, to);
			from = addDays(to, 1);
		}
		if (!ranges.length) throw new BudgetExhausted();
		const usedBefore = budget.used;
		let grown = false;
		const results = await Promise.allSettled(ranges.map(([from, to]) => yieldOnPlatformLimit(() => fetchRange(sourceCtx(ctx, budget), p.target, from, to))));
		for (const [i, r] of results.entries()) {
			if (r.status === "rejected") {
				const e = r.reason;
				// A window that did not fit although the tick had half its budget left, or that met a provider under load, shrinks.
				if ((e instanceof BudgetExhausted && usedBefore <= budget.limit / 2) || loadError(e)) pos.win = Math.max(1, Math.floor(pos.win / 2));
				throw e;
			}
			const { days, largest } = r.value;
			pace.perDay = Math.max(1, Math.ceil([...days.values()].reduce((n, l) => n + l.length, 0) / Math.max(1, days.size)));
			const db = await siteDb(ctx, p.site);
			// A day that equals its stored rows is not written again; the others cost their stored rows deleted plus their rows inserted.
			let found: Awaited<ReturnType<typeof changedDays>>;
			try {
				found = await yieldOnPlatformLimit(() => changedDays(db, p.site, p.source, days, provisional(today), () => budget.need(1)));
			} catch (e) {
				// The comparison reads of the first window do not fit what the fetches left: a smaller window next time, so a run always makes progress.
				if (i === 0 && e instanceof BudgetExhausted) pos.win = Math.max(1, Math.floor(pos.win / 2));
				throw e;
			}
			const { changed, had } = found;
			const fit = fitting(await rows.allowance(), changed, false, had);
			let n = 0;
			if (fit.size) {
				const w = replaceStatements(db.dialect, p.site, p.source, fit, provisional(today));
				n = w.rows;
				try {
					budget.need(w.stmts.length + 2);
				} catch (e) {
					// The first window's writes do not fit what the fetches left: a smaller window next time, so a run always makes progress.
					if (i === 0) pos.win = Math.max(1, Math.floor(pos.win / 2));
					throw e;
				}
				await rows.charge(await yieldOnPlatformLimit(() => writeReplace(db, w.stmts, n)));
			}
			// The cursor passes the unchanged days and the days written, up to the first changed day that waits for the next UTC day.
			if (fit.size || (!changed.size && days.size)) {
				const waiting = [...changed.keys()].sort().find((d) => !fit.has(d));
				pos.cursor = waiting ?? addDays([...days.keys()].sort().pop() as string, 1);
				if (largest >= GSC_PAGE_ROWS) pos.win = Math.max(1, Math.floor(pos.win / 2));
				else if (largest < GSC_PAGE_ROWS / 4 && !grown) {
					pos.win = Math.min(WINDOW_MAX, pos.win * 2);
					grown = true;
				}
				// The rows stored count is the pulled rows of the days the cursor passed, written or equal to what was stored.
				await stored([...days].filter(([d]) => d < pos.cursor).reduce((t, [, l]) => t + mergeRows(l).length, 0));
			}
			// The rest of the window waits for the next UTC day's rows.
			if (fit.size < changed.size) throw new RowsPaused(nextUtcDay(ctx.now()));
		}
	}
}

/** A Bing throttle: state "throttled", the last successful sync and its rows stay, the next attempt backs off. Returns that time (ms). */
async function throttled(ctx: SyncCtx, p: Pair, key: string, st: PairState, e: ThrottledError, nowIso: string): Promise<number> {
	const count = (st.throttleCount ?? 0) + 1;
	const next = ctx.now() + backoff(count, ctx.settings);
	const out: PairState = { ...st, status: "throttled", throttleCode: e.code, throttledAt: nowIso, throttleCount: count, nextAttempt: new Date(next).toISOString(), cursorDay: null };
	await ctx.kv.set(key, out);
	ctx.log?.warn(`cookieless-analytics: ${p.source} throttled (${e.code}) for site ${p.site}, attempt ${count}; next attempt ${out.nextAttempt}`);
	return next;
}
const clearThrottle = { throttleCode: null, throttledAt: null, throttleCount: 0, nextAttempt: null, errorCount: 0 } as const;

/** A failed pull: the error, and for a retryable one a next attempt backing off like a throttle, so a failing provider is not called every minute while continuations run. */
function failed(ctx: SyncCtx, st: PairState, e: unknown, nowIso: string, cursorDay: string | null): PairState {
	const count = (st.errorCount ?? 0) + 1;
	const retry = !noRetry(e);
	return Object.assign(st, { status: "error", lastError: message(e), lastErrorAt: nowIso, cursorDay: retry ? cursorDay : null, throttleCode: null, throttledAt: null, throttleCount: 0, errorCount: count, nextAttempt: retry ? new Date(ctx.now() + backoff(count, ctx.settings)).toISOString() : null }, retry ? {} : { lastRun: nowIso });
}
/** Not before `nextAttempt` (a throttle or a retryable error) unless forced. */
const waiting = (ctx: SyncCtx, st: PairState) => (st.nextAttempt && (st.status === "throttled" || st.status === "error") ? Date.parse(st.nextAttempt) : 0);

/**
 * A provider without a date range (Bing): one pull returns every day, all stored (inside the retention,
 * before today) with one DELETE and a few inserts. An open backfill makes the pair due and is done once
 * that pull is stored. Returns when the pair wants the next tick (ms), or null.
 */
async function runWindowPair(ctx: SyncCtx, p: Pair, src: SearchSource & Required<Pick<SearchSource, "fetchWindow">>, budget: Budget, rows: SyncRows, today: string, force: boolean): Promise<number | null> {
	const key = stateKey(p.site, p.source);
	const bkey = backfillKey(p.site, p.source);
	const st: PairState = (await ctx.kv.get<PairState>(key)) ?? {};
	const bf = await ctx.kv.get<BackfillState>(bkey);
	const pending = bf && !bf.done ? bf : null;
	const wait = waiting(ctx, st);
	const due = force || (wait ? ctx.now() >= wait : !!st.cursorDay || !!pending || !st.lastRun || ctx.now() - Date.parse(st.lastRun) >= ctx.settings.searchSyncHours * 3_600_000);
	if (!due) return wait || null;
	const nowIso = new Date(ctx.now()).toISOString();
	try {
		const a = await rows.allowance();
		if (a.paused) throw new RowsPaused(a.resumeAt ?? nextUtcDay(ctx.now()));
		const days = await yieldOnPlatformLimit(() => src.fetchWindow(sourceCtx(ctx, budget), p.target));
		// Without a backfill only the sync window is stored; a backfill (the first connect, or Start) reaches back to its start.
		const floor = addDays(today, -ctx.settings.searchRetentionDays);
		const want = pending ? pending.from : addDays(today, -SYNC_DAYS);
		const oldest = want > floor ? want : floor;
		const keep = new Map<string, SearchRow[]>();
		for (const [day, list] of days) if (day >= oldest && day < today) keep.set(day, list);
		const db = await siteDb(ctx, p.site);
		budget.need(1);
		// Stored days older than the sync window are final and not written again; the rest goes newest first as far as today's rows allow.
		for (const r of await db.all<{ day: string }>("SELECT DISTINCT day FROM ca_search_daily WHERE site = ? AND source = ? AND day < ?", [p.site, p.source, addDays(today, -SYNC_DAYS)])) keep.delete(String(r.day));
		// Days that equal their stored rows are not written again.
		const { changed, had } = await yieldOnPlatformLimit(() => changedDays(db, p.site, p.source, keep, provisional(today), () => budget.need(1)));
		const fit = fitting(a, changed, true, had);
		const { stmts, rows: n } = replaceStatements(db.dialect, p.site, p.source, fit, provisional(today));
		budget.need(stmts.length + 3);
		// Each day is replaced whole, so stopping at the platform limit and pulling the window again is safe.
		if (stmts.length) await rows.charge(await yieldOnPlatformLimit(() => writeReplace(db, stmts, n)));
		if (fit.size < changed.size) throw new RowsPaused(nextUtcDay(ctx.now()));
		Object.assign(st, { cursorDay: null, lastRun: nowIso, status: "ok", lastError: null, ...clearThrottle });
		await ctx.kv.set(key, st);
		if (pending) await ctx.kv.set(bkey, { ...pending, cursor: addDays(pending.to, 1), done: true, error: null, rows: [...keep.values()].reduce((t, l) => t + mergeRows(l).length, 0) });
		return null;
	} catch (e) {
		// `cursorDay` only flags the window as unfinished here: the next tick pulls it again.
		if (e instanceof BudgetExhausted) {
			await ctx.kv.set(key, { ...st, cursorDay: today });
			// Paused by today's rows (not the request budget, so the extra write fits): the next batch time for the status.
			if (pending && e instanceof RowsPaused) await ctx.kv.set(bkey, { ...pending, nextAt: e.resumeAt });
			throw e;
		}
		if (e instanceof ThrottledError) return throttled(ctx, p, key, st, e, nowIso);
		await ctx.kv.set(key, failed(ctx, st, e, nowIso, today));
		if (pending) await ctx.kv.set(bkey, { ...pending, error: message(e) });
		return st.nextAttempt ? Date.parse(st.nextAttempt) : null;
	}
}

/** One pair: the sync window when due (or forced, or unfinished), then an active backfill. Rethrows only `BudgetExhausted`; returns when the pair wants the next tick (ms), or null. */
async function runPair(ctx: SyncCtx, p: Pair, budget: Budget, rows: SyncRows, today: string, force: boolean): Promise<number | null> {
	// The pair's two state reads count too: with many sites the walk itself would reach the limit.
	budget.need(2);
	const src = SOURCES[p.source] as SearchSource;
	if (src.fetchWindow) return runWindowPair(ctx, p, src as SearchSource & Required<Pick<SearchSource, "fetchWindow">>, budget, rows, today, force);
	const key = stateKey(p.site, p.source);
	const st: PairState = (await ctx.kv.get<PairState>(key)) ?? {};
	const nowIso = new Date(ctx.now()).toISOString();
	const wait = waiting(ctx, st);
	const due = force || (wait ? ctx.now() >= wait : !!st.cursorDay || !st.lastRun || ctx.now() - Date.parse(st.lastRun) >= ctx.settings.searchSyncHours * 3_600_000);
	const wake = wait && !due ? wait : null;
	if (due) {
		const pos = { cursor: st.cursorDay && st.cursorDay >= addDays(today, -SYNC_DAYS) ? st.cursorDay : addDays(today, -SYNC_DAYS), win: st.window ?? WINDOW_START };
		const save = () => ctx.kv.set(key, Object.assign(st, { cursorDay: pos.cursor, window: pos.win }));
		try {
			await pullRange(ctx, p, src, budget, rows, today, pos, addDays(today, -1), save);
			Object.assign(st, { cursorDay: null, window: pos.win, lastRun: nowIso, status: "ok", lastError: null, errorCount: 0, nextAttempt: null });
			await ctx.kv.set(key, st);
		} catch (e) {
			if (e instanceof BudgetExhausted) {
				if (pos.win !== st.window) await save();
				throw e;
			}
			await ctx.kv.set(key, Object.assign(failed(ctx, st, e, nowIso, pos.cursor), { window: pos.win }));
			return st.nextAttempt ? Date.parse(st.nextAttempt) : null;
		}
	}
	const bkey = backfillKey(p.site, p.source);
	const bf = await ctx.kv.get<BackfillState>(bkey);
	if (!bf || bf.done) return wake;
	if (bf.retryAt && ctx.now() < bf.retryAt && !force) return bf.retryAt;
	const pos = { cursor: bf.cursor, win: bf.window ?? WINDOW_START };
	// Rows per day of the days stored so far size the windows against today's rows budget.
	const done = daysBetween(bf.from, bf.cursor) - 1;
	try {
		await pullRange(ctx, p, src, budget, rows, today, pos, bf.to, (n) => ctx.kv.set(bkey, Object.assign(bf, { cursor: pos.cursor, window: pos.win, rows: (bf.rows ?? 0) + n, error: null, retryAt: 0, retries: 0 })), done > 0 && bf.rows ? { perDay: Math.max(1, Math.ceil(bf.rows / done)) } : {});
		await ctx.kv.set(bkey, { ...bf, done: true, error: null, retryAt: 0, retries: 0 });
		return wake;
	} catch (e) {
		// The backfill goes on in the next tick: a continuation is scheduled for every unfinished tick.
		if (e instanceof BudgetExhausted) {
			await ctx.kv.set(bkey, { ...bf, window: pos.win, nextAt: e instanceof RowsPaused ? e.resumeAt : ctx.now() + CONTINUE_DELAY_MS });
			throw e;
		}
		const retries = (bf.retries ?? 0) + 1;
		const retryAt = loadError(e) ? ctx.now() + backoff(retries, ctx.settings) : 0;
		await ctx.kv.set(bkey, { ...bf, window: pos.win, error: message(e), retryAt, retries });
		return retryAt || wake;
	}
}

/** Take `kv search:lock`, or report it held by a running tick. A lock older than `LOCK_MS` belongs to a crashed tick and is taken over. */
async function lock(kv: KvLike, now: number): Promise<boolean> {
	if ((await kv.compareAndSet(KV_SEARCH_LOCK, null, { until: now + LOCK_MS })).applied) return true;
	const cur = await kv.get<{ until?: number }>(KV_SEARCH_LOCK);
	if (cur && typeof cur.until === "number" && cur.until > now) return false;
	await kv.set(KV_SEARCH_LOCK, { until: now + LOCK_MS });
	return true;
}

export interface TickResult {
	calls: number;
	/** Requests metered: fetches, statements and KV calls of the tick. */
	used: number;
	/** Rows written to `ca_search_daily` by the tick (charged to the daily rows budget). */
	rows: number;
	/** The daily rows budget is used: the walk waits until this time (ms). */
	pausedUntil?: number;
	pairs: string[];
	done: boolean;
	continued: boolean;
	/** Another tick held the lock; nothing ran. */
	busy?: boolean;
}

/**
 * One tick. `only` restricts the walk to one site (and source) and forces it due (the `search/sync`
 * route); such a run leaves `search:cursor` alone.
 */
export async function runSearchTick(outer: SyncCtx, opts: { only?: { site: string; source?: SourceId }; continueAs?: string } = {}): Promise<TickResult> {
	const budget = makeBudget(outer.now, outer.settings.syncSubrequestBudget);
	const ctx = metered(outer, budget);
	if (!(await lock(ctx.kv, ctx.now()))) return { calls: 0, used: budget.used, rows: 0, pairs: [], done: false, continued: false, busy: true };
	const rows = syncRows(ctx);
	let paused: number | null = null;
	const today = dayInZone(Math.floor(ctx.now() / 1000), ctx.settings.siteTimezone);
	let done = true;
	let wake: number | null = null;
	const walked: string[] = [];
	try {
		let pairs = mappedPairs(ctx.settings, ctx.clients, ctx.requestUrl);
		const only = opts.only;
		if (only) pairs = pairs.filter((p) => p.site === only.site && (!only.source || p.source === only.source));
		else {
			const cursor = await ctx.kv.get<string>(KV_SEARCH_CURSOR);
			const at = pairs.findIndex((p) => p.id === cursor);
			if (at > 0) pairs = [...pairs.slice(at), ...pairs.slice(0, at)];
		}
		for (const p of pairs) {
			walked.push(p.id);
			try {
				const w = await runPair(ctx, p, budget, rows, today, !!only);
				if (w !== null) wake = Math.min(wake ?? w, w);
			} catch (e) {
				if (!(e instanceof BudgetExhausted)) throw e;
				if (e instanceof RowsPaused) paused = e.resumeAt;
				done = false;
				if (!only) await ctx.kv.set(KV_SEARCH_CURSOR, p.id);
				break;
			}
		}
		if (done && !only) await ctx.kv.delete(KV_SEARCH_CURSOR);
	} finally {
		await ctx.kv.delete(KV_SEARCH_LOCK);
	}
	// An unfinished tick continues in a minute; a throttled pull or a backfill waiting after a load error at its time.
	// A walk paused by the rows budget continues at the next UTC day.
	const at = paused !== null ? Math.max(paused, ctx.now() + CONTINUE_DELAY_MS) : !done ? ctx.now() + CONTINUE_DELAY_MS : wake === null ? null : Math.max(wake, ctx.now() + CONTINUE_DELAY_MS);
	let continued = false;
	if (at !== null && ctx.cron) {
		await ctx.cron.schedule(opts.continueAs ?? CONTINUE_JOBS[0], { schedule: new Date(at).toISOString() });
		continued = true;
	}
	return { calls: budget.calls, used: budget.used, rows: rows.charged, pairs: walked, done, continued, ...(paused !== null ? { pausedUntil: paused } : {}) };
}
