/**
 * Storage estimate and the daily write budget of the `small` profile. Neither scans a table: the estimate
 * reads the daily `all` summary rows (one row per site and day) and the summary rows of one day; the write
 * budget reads the visits of the current UTC day once per check interval.
 */
import type { KvLike } from "../core/crypto.js";
import { addDays, dayInZone } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { dayInt, visitDayKey } from "../db/dialect.js";
import { isOwnDatabase } from "../db/schema.js";
import { type BudgetTarget, type CapacityProfile, type Settings, SUMMARY_SHARE, storageBudget } from "../settings.js";
import { KV_SYNC_ROWS } from "../sources/budget.js";
import { copiedToday } from "../move/day-budget.js";
import { deletedToday } from "./retention.js";
import { SEGS, SUMMARY_DIMS } from "./rollup.js";
import { CUBE_SEG } from "./reports/summary.js";

/**
 * Bytes per visit and per document entry (page view or event), JSONB document, row and index included, as measured
 * with `dbstat` on SQLite (the verification gate's size runs: 657, 667 and 670 bytes per visit of 3.25 entries at
 * 1,000, 10,000 and 100,000 page views a day, documents grown in place). Every run had the same entries per visit,
 * so the split between the two keeps the proportion of the earlier fit.
 */
export const VISIT_BYTES = 290;
export const ENTRY_BYTES = 115;
/**
 * Bytes of one summary row (`ca_rollup`, `ca_revenue_daily`, `ca_cube`, indexes included), as measured with `dbstat`
 * in the same runs, rows stored day by day by the closed-day writer: 74, 77 and 81.
 */
export const SUMMARY_ROW_BYTES = 75;
/**
 * Margin on both estimates for what SQLite did not measure: D1's page overhead and fill (production D1 stored text
 * documents inserted whole at 900 bytes per visit of 2.9 entries; JSONB saves about 17 percent of that). Keeps the
 * estimate 9 to 12 percent above the measured sizes, so the detailed window shortens early rather than late.
 */
export const STORAGE_SAFETY = 1.1;
/** Most the measured database size (`size_after`) may raise the detailed estimate: the estimate's error on generator traffic stays below it. */
export const MAX_SCALE = 1.5;
/** A shortened window keeps the detailed data this far below its share, so it does not shorten again the next day. */
export const SHORTEN_TO = 0.95;

export interface StorageEstimate {
	profile: CapacityProfile;
	/** Storage budget (`storageBudget` of the setting in this database), and the estimated bytes of detailed visits and of summaries, all sites. */
	budget: number;
	bytes: number;
	detail: number;
	summary: number;
	/** Detailed window in days: the setting, or shorter when the detailed data does not fit its share. */
	rawDays: number;
	capped: boolean;
	/** The bytes are the database size D1 reported (`size_after`, own analytics database), not the estimate alone. */
	measured?: boolean;
}

/** `WITH RECURSIVE s(site)`: every site of `table` by skip scan, one row read per site. */
export const siteScan = (table: string) =>
	`WITH RECURSIVE s(site) AS (SELECT MIN(site) FROM ${table} UNION ALL SELECT (SELECT MIN(site) FROM ${table} WHERE site > s.site) FROM s WHERE s.site IS NOT NULL)`;

const dimList = SUMMARY_DIMS.map((d) => `'${d}'`).join(", ");
/** Single dimension rows, the pair rows of every segment and the revenue rows per cube cell: key ranges of the summary primary keys. */
const segList = ["", ...SEGS, CUBE_SEG].map((d) => `'${d}'`).join(", ");

/** Bytes of the detailed data of one day from its `all` summary row. */
export const dayBytes = (visits: number, entries: number) => (visits * VISIT_BYTES + entries * ENTRY_BYTES) * STORAGE_SAFETY;

/**
 * The estimate and the detailed window it allows. Two statements: the `all` rows of every site and day in the
 * longest retention, and the summary rows of the newest day before `today` (single dimension, pair, link, journey, revenue and cube rows).
 */
export async function estimateStorage(db: Db, s: Pick<Settings, "rawRetentionDays" | "rollupRetentionMonths" | "capacityProfile" | "storageBudgetMb">, today: string): Promise<StorageEstimate> {
	const rawFrom = addDays(today, -s.rawRetentionDays);
	const from = addDays(today, -Math.max(s.rawRetentionDays, Math.ceil(s.rollupRetentionMonths * 31)));
	const days = (
		await db.all<{ day: string; visits: number; entries: number }>(
			`${siteScan("ca_rollup")} SELECT r.day AS day, SUM(r.sessions) AS visits, SUM(r.pageviews + r.events) AS entries FROM s JOIN ca_rollup r ON r.site = s.site AND r.dim = 'all' AND r.seg = '' AND r.day >= ? GROUP BY r.day ORDER BY r.day DESC`,
			[from],
		)
	).map((d) => ({ day: String(d.day), bytes: dayBytes(Number(d.visits), Number(d.entries)) }));
	const sample = days.find((d) => d.day < today)?.day;
	let rows = 0;
	if (sample) {
		const [r] = await db.all<{ n: number }>(
			`${siteScan("ca_rollup")} SELECT SUM((SELECT COUNT(*) FROM ca_rollup r WHERE r.site = s.site AND r.dim IN (${dimList}) AND r.seg IN (${segList}) AND r.day = ?) + (SELECT COUNT(*) FROM ca_revenue_daily v WHERE v.site = s.site AND v.dim IN (${dimList}) AND v.seg IN (${segList}) AND v.day = ?) + (SELECT COUNT(*) FROM ca_cube c WHERE c.site = s.site AND c.day = ?)) AS n FROM s WHERE s.site IS NOT NULL`,
			[sample, sample, dayInt(sample)],
		);
		rows = Number(r?.n ?? 0);
	}
	const { bytes: budget } = storageBudget(s, budgetTargetOf(db));
	const share = budget * (1 - SUMMARY_SHARE);
	// shortcut: one sampled day times the days with summaries; search rows are not counted yet.
	const summary = Math.round(rows * days.length * SUMMARY_ROW_BYTES * STORAGE_SAFETY);
	// A raw D1 binding reports the database file size after each statement (own analytics database). It only
	// tightens the estimate, by at most MAX_SCALE: the file also holds what shortening the window cannot free
	// (Search rows, aliases, pages left free by deletes), which must not shrink the detailed window to a day.
	const size = db.meta?.size_after;
	const estimated = days.filter((d) => d.day >= rawFrom).reduce((a, d) => a + d.bytes, 0);
	const measured = typeof size === "number" && estimated > 0;
	const scale = measured ? Math.min(MAX_SCALE, Math.max(1, (size - summary) / estimated)) : 1;
	const detailDays = days.filter((d) => d.day >= rawFrom).map((d) => ({ ...d, bytes: d.bytes * scale }));
	let detail = Math.round(detailDays.reduce((a, d) => a + d.bytes, 0));
	let rawDays = s.rawRetentionDays;
	if (detail > share) {
		// Keep the newest whole days that fit below SHORTEN_TO of the share (at least one).
		let sum = 0;
		let keep = 0;
		for (const d of detailDays) {
			sum += d.bytes;
			if (sum > share * SHORTEN_TO) break;
			keep++;
		}
		// Only the kept days remain once retention has run; the summary rows of the others stay for 25 months.
		detail = Math.round(detailDays.slice(0, Math.max(1, keep)).reduce((a, d) => a + d.bytes, 0));
		const oldestKept = detailDays[Math.max(0, keep - 1)]?.day ?? today;
		rawDays = Math.min(s.rawRetentionDays, Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldestKept}T00:00:00Z`)) / 86_400_000)));
	}
	return { profile: s.capacityProfile, budget, bytes: detail + summary, detail, summary, rawDays, capped: rawDays < s.rawRetentionDays, ...(measured ? { measured } : {}) };
}

// ── daily write budget (`small` profile) ──────────────────────────────────────

/** State key of the write budget: the estimate of the current UTC day. */
export const KV_WRITE_BUDGET = "budget:writes";
/** The Workers Free plan's daily D1 rows written, per account (resets at 00:00 UTC). */
export const FREE_ROWS_PER_DAY = 100_000;
/** Ingest stops at this share of the daily rows, so the CMS can still save content. */
export const GUARD_SHARE = 0.85;
/**
 * Rows written at ingest per counted unit (rule-table meter, `tests/write-guard.test.ts`): a visit 1 (insert into
 * the table and its vkey index, less the first page view it carries), a page view 2.6 (its entry 1, engagement
 * updates 1.5, second-tab aliases 0.1), an event 1. With the production mix about 3.3 per page view. Deletes are
 * not estimated: retention counts the rows it deletes in the UTC day (`deletedToday`) and the guard adds them.
 */
export const ROWS_PER_VISIT = 1;
export const ROWS_PER_PV = 2.6;
export const ROWS_PER_EVENT = 1;
/** Rows written per day that do not depend on traffic: one day of summary rows on `small`. */
export const FIXED_ROWS = 2_500;
/**
 * Seconds between two checks: hourly while below a quarter of the limit, then every 10 minutes. From a quarter
 * (21,250 rows) an hour would need about 24,000 page views to pass the Free plan's 100,000 before the next check.
 */
export const FAST_FROM = 0.25;
export const CHECK_SLOW_S = 3_600;
export const CHECK_FAST_S = 600;

export interface WriteBudget {
	/** UTC day of the estimate. */
	day: string;
	/** Epoch seconds of the check. */
	at: number;
	visits: number;
	pageviews: number;
	events: number;
	/** Estimated rows written today (Search sync rows included), and the limit. */
	rows: number;
	/** Of `rows`, those written by Search syncs (counted, not estimated). */
	sync?: number;
	/** Of `rows`, those deleted by retention or a delete job, or copied by a data move or load today (counted, not estimated). */
	deletes?: number;
	limit: number;
	/** Ingest must stop until 00:00 UTC. */
	blocked: boolean;
}

/** Today's visits, page views and events of visits started since 00:00 UTC (the columns the guard reads). */
export interface DayCounts {
	visits: number;
	pageviews: number;
	events: number;
}

/** Rows written estimated from today's visits, page views and events, plus the rows Search syncs wrote and retention deleted today, and whether that crosses the guard. */
export function writeBudget(c: DayCounts, day: string, at: number, sync = 0, deletes = 0): WriteBudget {
	const rows = Math.round(c.visits * ROWS_PER_VISIT + c.pageviews * ROWS_PER_PV + c.events * ROWS_PER_EVENT + FIXED_ROWS) + sync + deletes;
	const limit = FREE_ROWS_PER_DAY * GUARD_SHARE;
	return { day, at, visits: c.visits, pageviews: c.pageviews, events: c.events, rows, limit, blocked: rows >= limit, ...(sync ? { sync } : {}), ...(deletes ? { deletes } : {}) };
}

/** The budget table row of the database `db`: Postgres, an own D1 database or the EmDash database on D1. */
export const budgetTargetOf = (db: Db): BudgetTarget => (db.dialect === "postgres" ? "postgres" : isOwnDatabase(db) ? "own" : "host");

/**
 * Whether the D1 Free plan's daily rows bound the writes to `db`: the `small` profile on a SQLite database. Postgres
 * has no daily row limit, so `small` there never blocks or slows writes (write guard, retention and delete rows, Search rows).
 */
export const dailyRowsApply = (profile: CapacityProfile, db: Pick<Db, "dialect">): boolean => profile === "small" && db.dialect === "sqlite";

/**
 * Write budget of the current UTC day: null unless `dailyRowsApply` (the `small` profile on D1). Answered from the state key while it
 * is fresh; otherwise one statement counts the visits and sums the page views and events of the visits started since 00:00 UTC (it reads the
 * visits of at most two local days) and the state is stored again. A blocked state holds until the UTC day ends.
 */
export async function budgetState(db: Db, kv: KvLike, now: number, profile: CapacityProfile, timeZone = "UTC"): Promise<WriteBudget | null> {
	if (!dailyRowsApply(profile, db)) return null;
	const day = dayInZone(now, "UTC");
	const prev = await kv.get<WriteBudget>(KV_WRITE_BUDGET);
	if (prev && prev.day === day && (prev.blocked || now - prev.at < (prev.rows >= prev.limit * FAST_FROM ? CHECK_FAST_S : CHECK_SLOW_S))) return prev;
	const midnight = Date.parse(`${day}T00:00:00Z`) / 1000;
	const days = [...new Set([dayInZone(midnight, timeZone), dayInZone(now, timeZone)])].map(visitDayKey);
	const [r] = await db.all<{ v: number; pv: number; ev: number }>(
		`${siteScan("ca_sessions")} SELECT COUNT(*) AS v, COALESCE(SUM(v.pageviews), 0) AS pv, COALESCE(SUM(v.events), 0) AS ev FROM s JOIN ca_sessions v ON v.site = s.site AND v.day IN (${days.map(() => "?").join(", ")}) WHERE v.started >= ?`,
		[...days, midnight],
	);
	const sync = await kv.get<{ day: string; rows: number }>(KV_SYNC_ROWS);
	const state = writeBudget({ visits: Number(r?.v ?? 0), pageviews: Number(r?.pv ?? 0), events: Number(r?.ev ?? 0) }, day, now, sync?.day === day ? sync.rows : 0, (await deletedToday(kv, now)) + (await copiedToday(kv, now)));
	await kv.set(KV_WRITE_BUDGET, state);
	return state;
}
