/**
 * Rows-written budget of the Search syncs (Google, Bing and the file import), per UTC day, shared with the
 * ingest write guard (`src/query/storage.ts`). No server only imports: the admin computes its estimates here.
 *
 * Rows written per stored search row (measured on the counting Db, `tests/sources-rows-budget.test.ts`):
 * `ca_search_daily` is `WITHOUT ROWID`, so the key is the table, and it keeps one page index, so an insert
 * writes 2 rows and a delete writes 1. A new day costs 2 per row, a day written again costs at most 3
 * (`ROWS_PER_ROW_BOUND`). A backfill estimate is therefore `days x rows per day x 2`.
 *
 * Daily budget per capacity profile (UTC day, resets at 00:00 UTC):
 *
 * | Profile     | Search sync rows per day           | Syncs pause when today's rows (ingest estimate plus syncs) reach |
 * |-------------|------------------------------------|------------------------------------------------------------------|
 * | `small`     | 21,250 (25 percent of the 85,000 guard) | 51,000 (60 percent of the guard): ingest keeps priority     |
 * | `standard`  | 500,000                            | no pause                                                         |
 * | `dedicated` | 1,000,000                          | no pause                                                         |
 */
import type { KvLike } from "../core/crypto.js";
import { addDays } from "../core/time.js";
import type { CapacityProfile } from "../settings.js";
import { BudgetExhausted, type SourceId } from "./types.js";

/** The ingest write guard of the `small` profile: 85 percent of the Workers Free plan's 100,000 rows per day. */
export const GUARD_ROWS = 85_000;
export const SYNC_BUDGET: Readonly<Record<CapacityProfile, { daily: number; pauseAt: number | null }>> = {
	small: { daily: GUARD_ROWS * 0.25, pauseAt: GUARD_ROWS * 0.6 },
	standard: { daily: 500_000, pauseAt: null },
	dedicated: { daily: 1_000_000, pauseAt: null },
};
/** Rows written per inserted search row: the table (WITHOUT ROWID) plus the page index. */
export const ROWS_PER_INSERT = 2;
/** Rows written per deleted search row. */
export const ROWS_PER_DELETE = 1;
/** Upper bound per row of a day that may already be stored (its old row deleted, the new one inserted). */
export const ROWS_PER_ROW_BOUND = ROWS_PER_DELETE + ROWS_PER_INSERT;
/** Rows per day of the estimate before a site has stored days (a planning value; stored days replace it). */
export const PLANNING_ROWS_PER_DAY = 500;
/** State key: rows the Search syncs wrote on the UTC day `{ day, rows }`. */
export const KV_SYNC_ROWS = "budget:sync";

/** Days a provider keeps: Google about 16 months, Bing about 6 months. */
export const PROVIDER_DAYS: Readonly<Record<SourceId, number>> = { google: 490, bing: 180 };
export const PROVIDER_LIMIT_TEXT: Readonly<Record<SourceId, string>> = { google: "Google keeps about 16 months", bing: "Bing keeps about 6 months" };
/** Default of the `backfillDays` setting. */
export const BACKFILL_DEFAULT_DAYS = 90;
/** The range options of the Load older days dialog; `0` is everything the source offers. */
export const BACKFILL_OPTIONS = [
	{ days: 30, label: "Last 30 days" },
	{ days: 90, label: "Last 90 days" },
	{ days: 180, label: "Last 180 days" },
	{ days: 365, label: "Last 12 months" },
	{ days: 0, label: "Everything the source offers" },
] as const;

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** 00:00 UTC after `ms`. */
export const nextUtcDay = (ms: number) => (Math.floor(ms / 86_400_000) + 1) * 86_400_000;

/**
 * The backfill range of `days` (back from yesterday, 0 for the provider limit) or from `from`, clamped to what the
 * provider keeps and to the search retention. `clamped` tells the caller the start moved.
 */
export function backfillRange(o: { days?: number | undefined; from?: string | undefined }, source: SourceId, yesterday: string, retentionDays: number): { from: string; to: string; clamped: boolean } {
	const oldest = addDays(yesterday, 1 - Math.min(PROVIDER_DAYS[source], retentionDays));
	const want = o.from ?? addDays(yesterday, 1 - (o.days || PROVIDER_DAYS[source]));
	return want < oldest ? { from: oldest, to: yesterday, clamped: true } : { from: want, to: yesterday, clamped: false };
}

export interface BackfillEstimate {
	/** Days to pull (stored days are not pulled again). */
	days: number;
	/** Rows written. */
	rows: number;
	/** Daily budgets of the profile it needs: on `small`, the UTC days it takes at least. */
	budgets: number;
}

/** Estimate of a backfill of `days` new days at `perDay` rows a day. */
export function backfillEstimate(days: number, perDay: number, profile: CapacityProfile): BackfillEstimate {
	const rows = Math.max(0, days) * Math.max(1, Math.round(perDay)) * ROWS_PER_INSERT;
	return { days: Math.max(0, days), rows, budgets: rows ? Math.ceil(rows / SYNC_BUDGET[profile].daily) : 0 };
}

/** Today's rows of the syncs are used: the work waits until `resumeAt` (ms). A `BudgetExhausted`, so a tick stops and saves its cursor. */
export class RowsPaused extends BudgetExhausted {
	constructor(
		readonly resumeAt: number,
		message = "Today's Search rows budget is used.",
	) {
		super();
		this.message = message;
		this.name = "RowsPaused";
	}
}

export interface SyncAllowance {
	/** The profile's daily sync rows, and those used today. */
	budget: number;
	used: number;
	/** Rows the syncs may still write today. */
	left: number;
	paused: boolean;
	/** Today's rows (ingest estimate plus syncs) at which the syncs pause, or null. */
	pauseAt: number | null;
	/** Today's estimated ingest rows (`small` only). */
	ingest: number | null;
	resumeAt: number | null;
}

/**
 * Today's sync rows of one tick or import: read once per UTC day from `KV_SYNC_ROWS`, charged with the rows each
 * write reported, stored after every charge. `ingest` answers today's estimated ingest rows (`small` only).
 */
export class SyncRows {
	/** Rows charged by this instance. */
	charged = 0;
	private day = "";
	private rows = 0;
	private ingestRows: number | null = null;
	constructor(
		private readonly kv: KvLike,
		private readonly now: () => number,
		private readonly profile: CapacityProfile,
		private readonly ingest?: () => Promise<number>,
	) {}

	async allowance(): Promise<SyncAllowance> {
		const day = utcDay(this.now());
		const { daily, pauseAt } = SYNC_BUDGET[this.profile];
		if (day !== this.day) {
			const s = await this.kv.get<{ day: string; rows: number }>(KV_SYNC_ROWS);
			this.day = day;
			this.rows = s?.day === day ? s.rows : 0;
			this.ingestRows = pauseAt !== null && this.ingest ? await this.ingest() : null;
		}
		const total = (this.ingestRows ?? 0) + this.rows;
		const left = Math.max(0, Math.min(daily - this.rows, pauseAt === null ? Number.POSITIVE_INFINITY : pauseAt - total));
		const paused = left === 0;
		return { budget: daily, used: this.rows, left, paused, pauseAt, ingest: this.ingestRows, resumeAt: paused ? nextUtcDay(this.now()) : null };
	}

	async charge(n: number): Promise<void> {
		if (n <= 0) return;
		await this.allowance();
		this.rows += n;
		this.charged += n;
		await this.kv.set(KV_SYNC_ROWS, { day: this.day, rows: this.rows });
	}
}
