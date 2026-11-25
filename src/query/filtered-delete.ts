/**
 * Filtered delete (Data page, Delete tab): removes the visits that match stored dimensions (spam or bots the
 * classifier missed) with their page views, events, orders and refunds, then stores again the summary of every
 * closed day it touched from the detailed rows that remain (`rollupDay`, the closed-day writer). Filters are the
 * report filters (`compileTraffic`, same regex limits), restricted to visit columns, plus screen class, hour of day
 * and a visit shape. Days before the detailed window hold only summaries and cannot be filtered: their summaries
 * can only be deleted whole, as a separate choice.
 *
 * The preview reads only. A job runs in bounded calls: the request budget of one call, and on `small` a daily row
 * cap and a pause while the write guard's estimate is high, so ingest keeps priority. Its cursor lives in KV, so a
 * lost call repeats at most one idempotent chunk: every day that must be stored again is marked and saved before
 * its rows are deleted (one more save per newly marked day). The counts come from the calls that saved after their
 * delete, so a call lost between its delete and its save is not counted (`deleted` can be lower than what went).
 * The admin page and the hourly `retention` cron task (with the requests retention left) continue it.
 */
import { z } from "zod";
import type { KvLike } from "../core/crypto.js";
import { addDays, daysBetween, dayInZone } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { dayInt, isoDay, visitDayKey } from "../db/dialect.js";
import { stateKv } from "../db/facts.js";
import type { Param } from "../db/sql.js";
import { PROFILES, type Settings } from "../settings.js";
import { SYNC_BUDGET } from "../sources/budget.js";
import { andFrags, compileTraffic, type Frag, inList } from "./compile.js";
import { type Dim, FilterSchema, type Goal, MAX_FILTERS, TRAFFIC_DIMS } from "./filters.js";
import { refundDim } from "./reports/base.js";
import { clearReportCache } from "./reports/index.js";
import { CUBE_SEG } from "./reports/summary.js";
import { KV_DELETE_ROWS, rawFromDay } from "./retention.js";
import { CUBE_CAP, dayStatements, KV_WATERMARK, rollupDay, SEGS, SUMMARY_DIMS } from "./rollup.js";
import { budgetState, dailyRowsApply } from "./storage.js";

/** Filter dims a delete takes: the columns of the visit row (page, event, goal and revenue dims are not). */
export const DELETE_DIMS = (Object.keys(TRAFFIC_DIMS) as Array<keyof typeof TRAFFIC_DIMS>).filter((k) => TRAFFIC_DIMS[k].scope === "session") as Dim[];
/** Screen width classes (`screenBucket`). */
export const SCREENS = ["xs", "sm", "md", "lg", "xl"] as const;
/** Visit shapes: `single_view_idle` is one page view with no active time and no scroll. */
export const SHAPES = ["single_view_idle"] as const;
/** Longest range of one delete, so the preview reads a bounded number of visits. */
export const DELETE_MAX_DAYS = 400;
/** Visits per delete statement. */
export const DELETE_CHUNK = 500;
/** Rows written per deleted visit (the row and its `vkey` index entry) and per deleted `ca_events` row (row and day index). */
export const ROWS_PER_VISIT_DELETE = 2;
export const ROWS_PER_EVENT_DELETE = 2;
/** shortcut: summary rows one deleted visit can change on its day (single dims, pairs, cube, links, journeys); measure on D1 if the estimate proves far off. */
export const ROWS_TOUCHED_PER_VISIT = 40;
/** `small`: rows a delete job may write per UTC day, and the guard estimate at which it waits for the next UTC day. */
export const DELETE_DAY_ROWS = 15_000;
export const DELETE_PAUSE_AT = SYNC_BUDGET.small.pauseAt as number;
/** A call holds the job this long, so the page and the cron task do not work on it at once. */
export const LEASE_S = 60;
export const KV_DELETE_JOB = "delete:job";
export const KV_DELETE_LOG = "delete:log";
/** Id of a job an admin canceled; the next call of that job starts the cancel (a call in flight may not see a status change). */
export const KV_DELETE_CANCEL = "delete:cancel";
export const LOG_KEEP = 10;

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Hour = z.number().int().min(0).max(23);
export const DeleteSpecSchema = z
	.object({
		from: Day,
		to: Day,
		filters: z.array(FilterSchema).max(MAX_FILTERS).default([]),
		screen: z.array(z.enum(SCREENS)).min(1).max(SCREENS.length).optional(),
		hours: z.object({ from: Hour, to: Hour }).strict().optional(),
		shape: z.enum(SHAPES).optional(),
		/** Also delete the whole summaries of the range's days before the detailed window. */
		oldDays: z.boolean().optional(),
	})
	.strict()
	.refine((s) => s.filters.every((f) => DELETE_DIMS.includes(f.dim)), { message: "Only visit dimensions can select visits to delete.", path: ["filters"] })
	.refine((s) => s.from <= s.to, { message: "from must not be after to", path: ["from"] })
	.refine((s) => daysBetween(s.from, s.to) < DELETE_MAX_DAYS, { message: `at most ${DELETE_MAX_DAYS} days`, path: ["to"] });
export type DeleteSpec = z.output<typeof DeleteSpecSchema>;

/** Readable conditions of a spec, for the audit line (dimension values only, never a visitor). */
export function describeSpec(s: DeleteSpec): string {
	const parts = s.filters.map((f) => `${f.dim} ${f.op.replace("_", " ")} ${f.values.join(", ")}`);
	if (s.screen) parts.push(`screen ${s.screen.join(", ")}`);
	if (s.hours) parts.push(`hour ${s.hours.from} to ${s.hours.to}`);
	if (s.shape) parts.push("one page view, no active time, no scroll");
	if (s.oldDays) parts.push("whole summaries of older days");
	return `${s.from} to ${s.to}${parts.length ? `: ${parts.join("; ")}` : ": every visit"}`;
}

/** Predicate over `ca_sessions s` (site and day excluded) for the visits of `from..to` the spec selects. */
export async function compileDelete(db: Db, site: string, spec: DeleteSpec, from: string, to: string): Promise<Frag> {
	const t = await compileTraffic({ db, site, from, to, goals: [] }, spec.filters);
	const parts: Frag[] = [t.session];
	if (spec.screen) parts.push(inList(db.dialect, "s.screen", spec.screen));
	if (spec.hours) {
		const { from: a, to: b } = spec.hours;
		// A range over midnight (22 to 3) wraps.
		parts.push(a <= b ? { sql: "s.hour BETWEEN ? AND ?", params: [a, b] } : { sql: "(s.hour >= ? OR s.hour <= ?)", params: [a, b] });
	}
	if (spec.shape === "single_view_idle") parts.push({ sql: "s.pageviews = 1 AND s.engaged_ms = 0 AND s.max_scroll = 0", params: [] });
	return andFrags(parts);
}

/** `FROM ca_sessions s WHERE` the visits of `from..to` of `site` matching `pred`. */
const matched = (site: string, from: string, to: string, pred: Frag): Frag => ({
	sql: `FROM ca_sessions s WHERE s.site = ? AND s.day BETWEEN ? AND ? AND (${pred.sql})`,
	params: [site, visitDayKey(from), visitDayKey(to), ...pred.params],
});

const SUMMARY_SEGS = ["", ...SEGS, CUBE_SEG];
const ROLLUP_DIM_LIST = SUMMARY_DIMS;
const REVENUE_DIM_LIST = [...SUMMARY_DIMS, ...SUMMARY_DIMS.map(refundDim)];
const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");
/** Summary rows of one table and site in `day` (or a day range), by key range of `(site, dim, seg, day)`. */
const summaryWhere = (dims: readonly string[]) => `site = ? AND dim IN (${list(dims)}) AND seg IN (${list(SUMMARY_SEGS)})`;

export const TOP_DIMS = ["country", "browser", "os", "device", "channel", "ref_host", "entry_path"] as const;

export interface DeletePreviewDay {
	day: string;
	visits: number;
	pageviews: number;
	events: number;
	/** The day's summary is stored and will be stored again. */
	stored: boolean;
}

export interface DeletePreview {
	site: string;
	/** The conditions as the audit line reads them (`describeSpec`). */
	summary: string;
	from: string;
	to: string;
	/** First day of the detailed window; earlier days cannot be filtered. */
	rawFrom: string;
	days: DeletePreviewDay[];
	totals: { visits: number; pageviews: number; events: number; orders: number; refunds: number; eventRows: number };
	/** Orders and refunds of the matched visits, per currency (refunds as a positive amount). */
	revenue: Array<{ cur: string; orders: number; revenue: number; refunds: number; refunded: number }>;
	/** Top values of the main dimensions among the matched visits. */
	top: Record<(typeof TOP_DIMS)[number], Array<{ value: string | null; visits: number }>>;
	/** Days of the range before the detailed window: summary only, visits from their `all` row. */
	old: { from: string; to: string; days: Array<{ day: string; visits: number }>; summaryRows: number } | null;
	/** Closed, stored days whose summaries are stored again. */
	recloseDays: number;
	estimate: {
		rows: number;
		deleteRows: number;
		summaryRows: number;
		oldRows: number;
		/** UTC days the job takes at least on the `small` profile, at `dayRows` rows a day. */
		smallDays: number;
		dayRows: number;
		profile: Settings["capacityProfile"];
		/** Today's write guard estimate (`small` only). */
		today: { rows: number; limit: number } | null;
	};
}

export interface DeleteEnv {
	db: Db;
	/** Plugin KV (the state of the site's database is read through `stateKv`). */
	kv: KvLike;
	settings: Settings;
	site: string;
	now: number;
}

const n = (v: unknown) => Number(v ?? 0) || 0;

/** The read-only preview of a spec: what matches, per day, the sanity check, the summary days and the cost. */
export async function previewDelete(e: DeleteEnv, spec: DeleteSpec): Promise<DeletePreview> {
	const { db, site, settings: s } = e;
	const skv = stateKv(e.kv, site);
	const rawFrom = await rawFromDay(skv, s, e.now);
	const wm = await skv.get<string>(KV_WATERMARK);
	const lo = spec.from < rawFrom ? rawFrom : spec.from;
	const out: DeletePreview = {
		site,
		summary: describeSpec(spec),
		from: spec.from,
		to: spec.to,
		rawFrom,
		days: [],
		totals: { visits: 0, pageviews: 0, events: 0, orders: 0, refunds: 0, eventRows: 0 },
		revenue: [],
		top: Object.fromEntries(TOP_DIMS.map((d) => [d, []])) as unknown as DeletePreview["top"],
		old: null,
		recloseDays: 0,
		estimate: { rows: 0, deleteRows: 0, summaryRows: 0, oldRows: 0, smallDays: 0, dayRows: DELETE_DAY_ROWS, profile: s.capacityProfile, today: null },
	};
	const counts = new Map<string, number>();
	const sumHi = spec.to < (wm ?? "") ? spec.to : wm;
	if (sumHi && spec.from <= sumHi) {
		const rows = await db.all<{ day: string; n: number }>(
			`SELECT day, SUM(n) AS n FROM (SELECT day, COUNT(*) AS n FROM ca_rollup WHERE ${summaryWhere(ROLLUP_DIM_LIST)} AND day BETWEEN ? AND ? GROUP BY day UNION ALL SELECT day, COUNT(*) AS n FROM ca_revenue_daily WHERE ${summaryWhere(REVENUE_DIM_LIST)} AND day BETWEEN ? AND ? GROUP BY day) t GROUP BY day`,
			[site, spec.from, sumHi, site, spec.from, sumHi],
		);
		// shortcut: cube rows are not counted, the profile's cap per day stands in for them.
		for (const r of rows) counts.set(String(r.day), n(r.n) + CUBE_CAP[s.capacityProfile]);
	}
	if (lo <= spec.to) {
		const m = matched(site, lo, spec.to, await compileDelete(db, site, spec, lo, spec.to));
		const touched = new Map<string, number>();
		for (const r of await db.all(`SELECT s.day AS day, COUNT(*) AS visits, SUM(s.pageviews) AS pageviews, SUM(s.events) AS events ${m.sql} GROUP BY s.day ORDER BY s.day`, m.params)) {
			const day = isoDay(r.day);
			out.days.push({ day, visits: n(r.visits), pageviews: n(r.pageviews), events: n(r.events), stored: !!wm && day <= wm });
			touched.set(day, n(r.visits));
		}
		for (const d of out.days) {
			out.totals.visits += d.visits;
			out.totals.pageviews += d.pageviews;
			out.totals.events += d.events;
		}
		// Orders, refunds and server events of the matched visits; an order's day is never before its visit's day.
		const ev = await db.all(
			`SELECT e.day AS day, e.cur AS cur, CASE WHEN e.val IS NULL THEN 'e' WHEN e.val >= 0 THEN 'o' ELSE 'r' END AS k, COUNT(*) AS n, SUM(e.val) AS v FROM ca_events e WHERE e.site = ? AND e.day >= ? AND (e.sday, e.sid) IN (SELECT s.day, s.sid ${m.sql}) GROUP BY e.day, e.cur, k`,
			[site, dayInt(lo), ...m.params],
		);
		const cur = new Map<string, DeletePreview["revenue"][number]>();
		for (const r of ev) {
			const day = isoDay(r.day);
			out.totals.eventRows += n(r.n);
			if (r.k !== "e") touched.set(day, (touched.get(day) ?? 0) + n(r.n));
			if (r.k === "e") continue;
			const c = cur.get(String(r.cur)) ?? { cur: String(r.cur), orders: 0, revenue: 0, refunds: 0, refunded: 0 };
			if (r.k === "o") (c.orders += n(r.n)), (c.revenue += n(r.v)), (out.totals.orders += n(r.n));
			else (c.refunds += n(r.n)), (c.refunded -= n(r.v)), (out.totals.refunds += n(r.n));
			cur.set(c.cur, c);
		}
		out.revenue = [...cur.values()].sort((a, b) => (a.cur < b.cur ? -1 : 1));
		const tops = TOP_DIMS.map((d, i) => `SELECT * FROM (SELECT '${d}' AS d, ${d} AS v, COUNT(*) AS n FROM m GROUP BY ${d} ORDER BY n DESC, v LIMIT 5) t${i}`).join(" UNION ALL ");
		for (const r of await db.all(`WITH m AS (SELECT ${TOP_DIMS.map((d) => `s.${d} AS ${d}`).join(", ")} ${m.sql}) ${tops}`, m.params))
			out.top[r.d as (typeof TOP_DIMS)[number]].push({ value: r.v == null ? null : String(r.v), visits: n(r.n) });
		for (const [day, k] of touched) {
			if (!wm || day > wm || day < rawFrom) continue;
			out.recloseDays++;
			out.estimate.summaryRows += Math.min(counts.get(day) ?? 0, k * ROWS_TOUCHED_PER_VISIT);
		}
		out.estimate.deleteRows = out.totals.visits * ROWS_PER_VISIT_DELETE + out.totals.eventRows * ROWS_PER_EVENT_DELETE;
	}
	if (spec.from < rawFrom) {
		const hi = spec.to < rawFrom ? spec.to : addDays(rawFrom, -1);
		const days = (await db.all("SELECT day, sessions FROM ca_rollup WHERE site = ? AND dim = 'all' AND seg = '' AND key = '' AND day BETWEEN ? AND ? ORDER BY day", [site, spec.from, hi])).map((r) => ({ day: String(r.day), visits: n(r.sessions) }));
		out.old = { from: spec.from, to: hi, days, summaryRows: days.reduce((a, d) => a + (counts.get(d.day) ?? 0), 0) };
		if (spec.oldDays) out.estimate.oldRows = out.old.summaryRows;
	}
	const est = out.estimate;
	est.rows = est.deleteRows + est.summaryRows + est.oldRows;
	est.smallDays = Math.ceil(est.rows / DELETE_DAY_ROWS);
	const w = await budgetState(db, skv, e.now, s.capacityProfile, s.siteTimezone);
	if (w) est.today = { rows: w.rows, limit: w.limit };
	return out;
}

// ── the job ───────────────────────────────────────────────────────────────────

export interface DeleteCounts {
	visits: number;
	pageviews: number;
	events: number;
	orders: number;
	refunds: number;
	/** Closed days whose summaries were stored again, and days before the window whose summaries were deleted. */
	summaryDays: number;
	oldDays: number;
	summaryRows: number;
}

export interface DeleteJob {
	id: string;
	site: string;
	by: string | null;
	/** Epoch seconds of the start and of the end. */
	at: number;
	finished?: number;
	spec: DeleteSpec;
	summary: string;
	/** The visit predicate compiled at the start (regex values expanded then), and its range. */
	pred: Frag;
	/** Visit days with matches at the start, oldest first, and the position. */
	days: string[];
	i: number;
	/** Days whose summary must be stored again, with the deleted visits and orders that touched them. */
	reclose: Record<string, number>;
	/** Days before the window whose summaries go (with `oldDays`), and the position. */
	old: string[];
	oi: number;
	/** Visits that matched at the start. */
	expected: number;
	/** What the saved calls deleted: a call lost between its delete and its save is not counted. */
	deleted: DeleteCounts;
	/** Closed days that left the detailed window before their summary could be stored again: they keep the old summary. */
	skipped: string[];
	status: "running" | "canceling" | "done" | "canceled";
	/** Rows this job wrote in the UTC day. */
	utc: { day: string; rows: number };
	/** Waiting for the next UTC day: the job's daily rows are used (`day_rows`) or the write guard's estimate is high (`guard`). */
	paused: { until: number; reason: "day_rows" | "guard" } | null;
	lease?: number;
}

export interface DeleteLogEntry {
	at: number;
	finished: number;
	by: string | null;
	site: string;
	summary: string;
	status: "done" | "canceled";
	deleted: DeleteCounts;
	skipped: number;
}

/** What the admin sees of a job: no compiled predicate. */
export type DeleteJobView = Omit<DeleteJob, "pred" | "lease">;
export const jobView = (j: DeleteJob | null): DeleteJobView | null => {
	if (!j) return null;
	const { pred: _p, lease: _l, ...v } = j;
	return v;
};
export const isActive = (j: DeleteJob | null): j is DeleteJob => !!j && (j.status === "running" || j.status === "canceling");

/** A new job from a spec: the matched visit days of the detailed window now, and the older days when chosen. */
export async function createJob(e: DeleteEnv, spec: DeleteSpec, by: string | null, preview: DeletePreview): Promise<DeleteJob> {
	const lo = spec.from < preview.rawFrom ? preview.rawFrom : spec.from;
	const pred = lo <= spec.to ? await compileDelete(e.db, e.site, spec, lo, spec.to) : { sql: "0 = 1", params: [] };
	return {
		id: `${e.now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
		site: e.site,
		by,
		at: e.now,
		spec,
		summary: describeSpec(spec),
		pred,
		days: preview.days.map((d) => d.day),
		i: 0,
		reclose: {},
		old: spec.oldDays && preview.old ? preview.old.days.map((d) => d.day) : [],
		oi: 0,
		expected: preview.totals.visits,
		deleted: { visits: 0, pageviews: 0, events: 0, orders: 0, refunds: 0, summaryDays: 0, oldDays: 0, summaryRows: 0 },
		skipped: [],
		status: "running",
		utc: { day: dayInZone(e.now, "UTC"), rows: 0 },
		paused: null,
	};
}

export interface JobEnv {
	kv: KvLike;
	db(site: string): Promise<Db>;
	settings: Settings;
	goals(site: string): Promise<readonly Goal[]>;
	now: number;
}

class Budget extends Error {}

/** `db` with every statement counted (a batch counts each); past `limit` a call throws `Budget`. */
function counted(db: Db, limit: () => number) {
	let used = 0;
	const spend = (k: number) => {
		if (used + k > limit()) throw new Budget();
		used += k;
	};
	const c: Db = { dialect: db.dialect, run: (q, p) => (spend(1), db.run(q, p)), all: (q, p) => (spend(1), db.all(q, p)), batch: (st) => (spend(st.length), db.batch(st)) };
	return { db: c, used: () => used, spend };
}

/** Fewer requests than this make no chunk worth starting (lease, guard, chunk, save, end). */
export const MIN_REQUESTS = 12;
/** KV calls a run keeps for its end: the job, the guard's rows and the log. */
const END_REQUESTS = 3;
const nextUtc = (now: number) => (Math.floor(now / 86_400) + 1) * 86_400;

/**
 * One bounded call of the current job: delete the matched visits day by day in chunks (orders and server events of
 * a visit first), store again each closed day once no later chunk can change it, then delete the whole summaries of
 * the chosen older days. Stops before the request budget, at the `small` profile's daily rows or when the write
 * guard's estimate reaches `DELETE_PAUSE_AT`, and saves the job after every chunk. Returns the job, or null.
 */
export async function runDeleteJob(e: JobEnv, requests = PROFILES[e.settings.capacityProfile].requests): Promise<DeleteJob | null> {
	let job = await e.kv.get<DeleteJob>(KV_DELETE_JOB);
	if (!isActive(job) || (job.lease ?? 0) > e.now || requests < MIN_REQUESTS) return job;
	if (job.status === "running" && (await e.kv.get<string>(KV_DELETE_CANCEL)) === job.id) job.status = "canceling";
	if (job.paused && job.paused.until > e.now && job.status === "running") return job;
	job.lease = e.now + LEASE_S;
	job.paused = null;
	await e.kv.set(KV_DELETE_JOB, job);
	const j: DeleteJob = job;
	const s = e.settings;
	const site = j.site;
	const skv = stateKv(e.kv, site);
	const raw = await e.db(site);
	// The job's KV writes count against the same budget: the lease above, one per chunk, the end.
	let kvCalls = 3;
	const c = counted(raw, () => requests - kvCalls - END_REQUESTS);
	const save = async () => {
		kvCalls++;
		await e.kv.set(KV_DELETE_JOB, j);
	};
	const utc = dayInZone(e.now, "UTC");
	if (j.utc.day !== utc) j.utc = { day: utc, rows: 0 };
	const small = dailyRowsApply(s.capacityProfile, c.db);
	let guard = 0;
	const charge = (rows: number) => {
		j.utc.rows += rows;
		guard += rows;
	};
	/** On `small`, whether `rows` more may be written now; sets the pause when not. */
	const room = (rows: number): boolean => {
		if (!small) return true;
		const reason = j.utc.rows + rows > DELETE_DAY_ROWS ? "day_rows" : guard + rows >= DELETE_PAUSE_AT ? "guard" : null;
		if (reason) j.paused = { until: nextUtc(e.now), reason };
		return !reason;
	};
	const d = c.db.dialect;
	try {
		if (small) guard = (await budgetState(c.db, skv, e.now, "small", s.siteTimezone))?.rows ?? 0;
		let goals: readonly Goal[] | null = null;
		const reclose = async (before: string | null) => {
			const wm = await skv.get<string>(KV_WATERMARK);
			const rawNow = await rawFromDay(skv, s, e.now);
			kvCalls += 2;
			for (const day of Object.keys(j.reclose).sort()) {
				if (before !== null && day >= before) break;
				const k = j.reclose[day] as number;
				// A day after the watermark is stored later from the rows that remain; one before the window has lost its rows.
				if (!wm || day > wm || day < rawNow) {
					if (wm && day < rawNow) j.skipped.push(day);
					delete j.reclose[day];
					continue;
				}
				if (!goals) {
					kvCalls++;
					goals = await e.goals(site);
				}
				if (c.used() + dayStatements(goals) > requests - kvCalls - END_REQUESTS) throw new Budget();
				if (!room(k * ROWS_TOUCHED_PER_VISIT)) return false;
				const rows = await rollupDay({ db: c.db, site, settings: s, goals }, day);
				charge(Math.min(rows, k * ROWS_TOUCHED_PER_VISIT));
				j.deleted.summaryDays++;
				delete j.reclose[day];
				await save();
			}
			return true;
		};
		while (j.status === "running" && j.i < j.days.length) {
			const day = j.days[j.i] as string;
			if (!room(DELETE_CHUNK * ROWS_PER_VISIT_DELETE)) break;
			const rows = await c.db.all<{ sid: string; pageviews: number; events: number }>(
				`SELECT s.sid AS sid, s.pageviews AS pageviews, s.events AS events FROM ca_sessions s WHERE s.site = ? AND s.day = ? AND (${j.pred.sql}) LIMIT ${DELETE_CHUNK}`,
				[site, visitDayKey(day), ...(j.pred.params as Param[])],
			);
			if (rows.length) {
				const sids = inList(d, "sid", rows.map((r) => r.sid));
				const evWhere = `site = ? AND day >= ? AND sday = ? AND (${sids.sql})`;
				const evParams: Param[] = [site, dayInt(day), visitDayKey(day), ...sids.params];
				const ev = await c.db.all(`SELECT day, SUM(CASE WHEN val >= 0 THEN 1 ELSE 0 END) AS o, SUM(CASE WHEN val < 0 THEN 1 ELSE 0 END) AS r, COUNT(*) AS n FROM ca_events WHERE ${evWhere} GROUP BY day`, evParams);
				let server = 0;
				let orders = 0;
				let refunds = 0;
				let marked = !(day in j.reclose);
				j.reclose[day] = (j.reclose[day] ?? 0) + rows.length;
				for (const r of ev) {
					const od = isoDay(r.day);
					if (n(r.o) + n(r.r)) {
						marked ||= !(od in j.reclose);
						j.reclose[od] = (j.reclose[od] ?? 0) + n(r.o) + n(r.r);
					}
					orders += n(r.o);
					refunds += n(r.r);
					server += n(r.n) - n(r.o) - n(r.r);
				}
				// A newly marked day is saved before the delete, so a call lost after it cannot leave that day's summary unchanged.
				if (marked) await save();
				// Orders before their visits: a lost call between the two leaves no order without its visit.
				const evGone = ev.length ? (await c.db.run(`DELETE FROM ca_events WHERE ${evWhere}`, evParams)).changes : 0;
				// Counted at once: a call that stops before the next DELETE finds these orders gone on its repeat.
				j.deleted.orders += orders;
				j.deleted.refunds += refunds;
				const gone = (await c.db.run(`DELETE FROM ca_sessions WHERE site = ? AND day = ? AND (${sids.sql})`, [site, visitDayKey(day), ...sids.params])).changes;
				j.deleted.visits += gone;
				j.deleted.pageviews += rows.reduce((a, r) => a + n(r.pageviews), 0);
				j.deleted.events += rows.reduce((a, r) => a + n(r.events), 0) + server;
				charge(gone * ROWS_PER_VISIT_DELETE + evGone * ROWS_PER_EVENT_DELETE);
			}
			if (rows.length < DELETE_CHUNK) j.i++;
			await save();
			// A day is final once every visit day up to it is done: orders come on or after their visit's day.
			if (rows.length < DELETE_CHUNK && !(await reclose(j.days[j.i] ?? null))) break;
		}
		const deleting = j.status === "running" && j.i >= j.days.length;
		if ((deleting || j.status === "canceling") && !j.paused && (await reclose(null))) {
			while (j.status === "running" && j.oi < j.old.length) {
				const day = j.old[j.oi] as string;
				// Only days still before the window: their detailed rows are gone, so nothing could store them again.
				if (!room(0)) break;
				let gone = 0;
				gone += (await c.db.run(`DELETE FROM ca_rollup WHERE ${summaryWhere(ROLLUP_DIM_LIST)} AND day = ?`, [site, day])).changes;
				gone += (await c.db.run(`DELETE FROM ca_revenue_daily WHERE ${summaryWhere(REVENUE_DIM_LIST)} AND day = ?`, [site, day])).changes;
				gone += (await c.db.run("DELETE FROM ca_cube WHERE site = ? AND day = ?", [site, dayInt(day)])).changes;
				charge(gone);
				j.deleted.summaryRows += gone;
				j.deleted.oldDays++;
				j.oi++;
				await save();
			}
			if (!Object.keys(j.reclose).length && (j.status === "canceling" || j.oi >= j.old.length)) j.status = j.status === "canceling" ? "canceled" : "done";
		}
	} catch (err) {
		if (!(err instanceof Budget)) {
			delete j.lease;
			await e.kv.set(KV_DELETE_JOB, j);
			throw err;
		}
	}
	delete j.lease;
	if (j.status === "done" || j.status === "canceled") {
		j.finished = e.now;
		const log = (await e.kv.get<DeleteLogEntry[]>(KV_DELETE_LOG)) ?? [];
		const entry: DeleteLogEntry = { at: j.at, finished: e.now, by: j.by, site, summary: j.summary, status: j.status, deleted: j.deleted, skipped: j.skipped.length };
		await e.kv.set(KV_DELETE_LOG, [entry, ...log].slice(0, LOG_KEEP));
		await e.kv.delete(KV_DELETE_CANCEL);
	}
	await e.kv.set(KV_DELETE_JOB, j);
	if (j.utc.rows) await skv.set(KV_DELETE_ROWS, j.utc);
	clearReportCache();
	job = j;
	return job;
}
