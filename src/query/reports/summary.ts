/**
 * Summary reads: the stored rows of `ca_rollup` and `ca_revenue_daily` over the
 * closed days of a range, merged in memory with the rows `computeDay` returns for the days that are not stored
 * yet (today, and yesterday until it closes). Stored and open rows come from the same function, so a range that
 * ends today answers like the detailed reports. Also the filter plan of the summary engine: which filters a
 * summary answer honours (single dimension rows, a pair row of the report's dimension and one segment, or the
 * cube for segments combined) and which it cannot, with the reason.
 *
 * `../rollup.js` is loaded on demand: it imports the revenue report module, which imports this one.
 */
import { addDays, dayInZone, eachDay } from "../../core/time.js";
import type { Dialect } from "../../db/adapter.js";
import { dayInt, int, isoDay } from "../../db/dialect.js";
import { inList, QueryError } from "../compile.js";
import { type Filter, NEGATED, TRAFFIC_DIMS } from "../filters.js";
import type { DaySummary, RollupDim, RollupRow, RevenueRow } from "../rollup.js";
import { compileSafeRegex, validateSafeRegex } from "../safe-regex.js";
import { num, refundDim, type ReportCtx, type RunInput } from "./base.js";

/** The segment dimensions: pair rows cross one of them with a page-like dimension. */
export const SEGMENTS = ["channel", "country", "device"] as const;
/** `seg` of the cube reads: `ca_cube` rows, and `ca_revenue_daily` rows of dim `all` per cube cell. */
export const CUBE_SEG = "cube";
/** Joins the channel, country and device of a cube cell into one `segkey` (and the two keys of a session pair). */
export const CELL_SEP = "\u001f";
/** Dimensions with pair rows (`seg` one of `SEGMENTS`). */
export const PAIR_DIMS: ReadonlySet<string> = new Set(["page", "entry", "source", "utm_campaign", "event", "goal"]);

/** Filter dimension to summary dimension (the same names). */
export const FILTER_DIMS: Partial<Record<string, RollupDim>> = {
	page: "page",
	entry: "entry",
	exit: "exit",
	channel: "channel",
	source: "source",
	utm_campaign: "utm_campaign",
	country: "country",
	device: "device",
	browser: "browser",
	os: "os",
	lang: "lang",
	event: "event",
	goal: "goal",
};

/** Filter dimensions `ca_revenue_daily` keeps: a revenue read under any other (browser, os, exit, lang) has no rows. */
const REVENUE_FILTER_DIMS: ReadonlySet<string> = new Set(["channel", "source", "utm_campaign", "entry", "page", "country", "device", "event", "goal"]);
/**
 * A negated filter on these drops summary rows, while the detailed rows drop whole visits (a visit with the page,
 * event or goal), or keep visits the summaries do not hold (campaign rows exist only for visits with a campaign).
 */
const NO_NEGATION: ReadonlySet<string> = new Set(["page", "event", "goal", "utm_campaign"]);
/**
 * Report dimensions whose own filter the summaries cannot answer: events, goals and exit pages count their rates
 * over the matching visits, and a revenue breakdown by page, event or goal lists every order of the matching visits.
 */
const OWN_TRAFFIC: ReadonlySet<string> = new Set(["event", "goal", "exit"]);
const OWN_REVENUE: ReadonlySet<string> = new Set(["page", "event", "goal"]);

const ROLLUP_METRICS = ["pageviews", "sessions", "visitors", "bounces", "engaged", "engaged_ms", "events", "hits"] as const;
/** `refunds` is the `revenue` of the `refund.<dim>` rows, read with the order rows of the dim. */
const REVENUE_METRICS = ["orders", "revenue", "sessions", "refunds"] as const;

type Segment = (typeof SEGMENTS)[number];
const isSegment = (d: string | null): boolean => (SEGMENTS as readonly string[]).includes(d ?? "");
const isSessionDim = (d: string): boolean => (TRAFFIC_DIMS as Record<string, { scope: string }>)[d]?.scope === "session";

// ── the filter plan ──────────────────────────────────────────────────────────

/**
 * Where summary rows come from: single dimension rows (`seg` ''), pair rows (`seg` a segment), or the cube
 * (`cube`, keyed by `dim` when that is a segment: totals, series and the channel, country and device breakdowns).
 */
export type SummarySource = { dim: RollupDim; seg: string; cube?: true };

export interface Plan {
	src: SummarySource;
	/** Filters the summary rows honour. */
	applied: Filter[];
	/**
	 * `dim:reason` of every filter they cannot honour: `not_kept` (no summary rows), `combination`, `negated` (a
	 * negated operator the rows cannot answer) or `own` (a filter on the report's own dimension the rows cannot answer).
	 */
	unavailable: string[];
}

/**
 * Which filters a summary answer honours. `own` is the report's dimension (null for totals and series, which take
 * the first filtered session dimension that is not a segment, else the first filtered segment). One segment
 * combines with a pair dimension through its pair rows. Segments combine with each other through the cube, for
 * totals and series and for a breakdown by a segment; a second segment beside a pair dimension does not.
 * `revenue`: a read of `ca_revenue_daily`, which keeps fewer dimensions and every order without a visit (as
 * `(not set)`), so no negated filter applies there.
 */
export function planFilters(filters: readonly Filter[], own: RollupDim | null, revenue = false): Plan {
	const unavailable = new Map<string, string>();
	const off = (f: Filter, reason: string) => unavailable.has(f.dim) || unavailable.set(f.dim, reason);
	const ownOff = revenue ? OWN_REVENUE : OWN_TRAFFIC;
	const kept = filters.filter((f) => {
		const d = FILTER_DIMS[f.dim];
		if (!d || (revenue && !REVENUE_FILTER_DIMS.has(d))) return off(f, "not_kept"), false;
		// A visit has one campaign: on the campaigns report itself, dropping a campaign's row drops its visits.
		if (NEGATED.has(f.op) && (revenue || (NO_NEGATION.has(d) && !(d === "utm_campaign" && own === d)))) return off(f, "negated"), false;
		if (d === own && ownOff.has(d)) return off(f, "own"), false;
		return true;
	});
	const dimOf = (f: Filter) => FILTER_DIMS[f.dim] as RollupDim;
	const base = own ?? kept.map(dimOf).find((d) => !isSegment(d) && isSessionDim(d)) ?? null;
	const segs = [...new Set(kept.map(dimOf).filter((d) => isSegment(d) && d !== base))];
	let src: SummarySource = { dim: base ?? "all", seg: "" };
	let usable = new Set<string>(base ? [base] : []);
	const first = segs[0];
	if (first) {
		if ((base === null && segs.length > 1) || isSegment(base)) [src, usable] = [{ dim: base ?? "all", seg: "", cube: true }, new Set(SEGMENTS)];
		else if (base === null) [src, usable] = [{ dim: first, seg: "" }, new Set([first])];
		else if (PAIR_DIMS.has(base)) [src, usable] = [{ dim: base, seg: first }, new Set([base, first])];
	}
	const applied = kept.filter((f) => (usable.has(dimOf(f)) ? true : (off(f, "combination"), false)));
	return { src, applied, unavailable: [...unavailable].map(([d, r]) => `${d}:${r}`) };
}

/** Does `key` pass the filter (same operator semantics as the SQL compiler)? */
export function matchKey(f: Filter, key: string): boolean {
	const base = f.op.replace(/^not_/, "").replace(/^is_not$/, "is");
	const k = key.toLowerCase();
	let hit: boolean;
	if (base === "regex") {
		hit = f.values.some((p) => {
			const v = validateSafeRegex(p, "i");
			if (!v.ok) throw new QueryError("invalid_regex", `${v.error} (${p})`);
			return (compileSafeRegex(p, "i") as RegExp).test(key);
		});
	} else if (base === "contains") hit = f.values.some((v) => k.includes(v.toLowerCase()));
	else if (base === "prefix") hit = f.values.some((v) => k.startsWith(v.toLowerCase()));
	else hit = f.values.includes(key);
	return NEGATED.has(f.op) ? !hit : hit;
}

// ── open days ────────────────────────────────────────────────────────────────

/** Open days one read computes in memory, newest first (today, yesterday, and the day the writer is closing). */
export const MAX_OPEN_DAYS = 4;
const OPEN_TTL_MS = 60_000;
const OPEN_MAX = 100;
type Paired<T> = T & { seg?: string; segkey?: string };
/** The summary of an open day; pair rows (`seg`, `segkey`) are `pairs` and `revenuePairs`. */
type OpenDay = DaySummary & { pairs?: Array<Paired<RollupRow>>; revenuePairs?: Array<Paired<RevenueRow>> };
const openCache = new Map<string, { at: number; value: Promise<OpenDay> }>();

export function clearOpenDays(): void {
	openCache.clear();
}

type Ctx = Pick<ReportCtx, "db" | "site" | "now" | "settings" | "goals" | "summaryThrough" | "folded">;

/** Last day whose summary rows are stored: the writer's watermark, else the last closed day. */
export async function storedThrough(rc: Ctx): Promise<string> {
	return rc.summaryThrough ?? (await import("../rollup.js")).lastClosedDay(rc.now, rc.settings.siteTimezone);
}

/** The stored part of a range and its open days (after `storedThrough`, up to today). */
export async function splitRange(rc: Ctx, from: string, to: string): Promise<{ stored: { from: string; to: string } | null; open: string[]; missing: string[] }> {
	const through = await storedThrough(rc);
	const today = dayInZone(rc.now, rc.settings.siteTimezone);
	const end = to < through ? to : through;
	const first = from > through ? from : addDays(through, 1);
	const last = to < today ? to : today;
	// Only the newest MAX_OPEN_DAYS are computed; a writer further behind leaves the older ones out (`missing`, named by `summary_behind`).
	const all = first <= last ? eachDay(first, last) : [];
	return { stored: from <= end ? { from, to: end } : null, open: all.slice(-MAX_OPEN_DAYS), missing: all.slice(0, Math.max(0, all.length - MAX_OPEN_DAYS)) };
}

/** `summary_behind:<from>:<to>` when a summary answer leaves out days the writer has not stored yet (more than `MAX_OPEN_DAYS` behind). */
export async function behindNotice(rc: Ctx, from: string, to: string): Promise<string[]> {
	const { missing } = await splitRange(rc, from, to);
	return missing.length ? [`summary_behind:${missing[0]}:${missing[missing.length - 1]}`] : [];
}

/** `computeDay` of an open day, cached 60 seconds per isolate (one report computes it once for all its reads). */
export function openDay(rc: Pick<ReportCtx, "db" | "settings">, site: string, goals: ReportCtx["goals"], day: string, nowMs = Date.now()): Promise<OpenDay> {
	const s = rc.settings;
	const key = JSON.stringify([site, day, s.siteTimezone, s.engagedThresholdSeconds, s.realtimeWindowMinutes, goals]);
	const hit = openCache.get(key);
	if (hit && nowMs - hit.at < OPEN_TTL_MS) return hit.value;
	const value: Promise<OpenDay> = import("../rollup.js").then((m) => m.computeDay({ db: rc.db, site, settings: s, goals }, day));
	openCache.delete(key);
	if (openCache.size >= OPEN_MAX) openCache.delete(openCache.keys().next().value as string);
	openCache.set(key, { at: nowMs, value });
	value.catch(() => openCache.get(key)?.value === value && openCache.delete(key));
	return value;
}

// ── readers ──────────────────────────────────────────────────────────────────

/** Summed metrics of one key (and segment value, day, currency when grouped by them). */
export interface SumRow {
	key: string;
	segkey: string;
	day: string;
	cur: string;
	[metric: string]: string | number;
}

export interface SummaryRead {
	table: "ca_rollup" | "ca_revenue_daily";
	dim: string;
	seg: string;
	/** Group by day too. */
	byDay?: boolean;
	/** `ca_revenue_daily`: one currency. */
	cur?: string;
	/** These keys only. */
	keys?: readonly string[];
}

/** The statement over the stored days: one key range `(site, dim, seg, day)` of the primary key, the same text on both dialects. */
export function summarySql(r: Omit<SummaryRead, "dim" | "seg" | "keys">, keyIn = ""): string {
	const rev = r.table === "ca_revenue_daily";
	const group = ["r.key", "r.segkey", ...(r.byDay ? ["r.day"] : []), ...(rev ? ["r.cur"] : [])];
	const refund = `r.dim LIKE '${refundDim("")}%'`;
	const sums = rev
		? [`SUM(r.orders) AS orders`, `SUM(CASE WHEN ${refund} THEN 0 ELSE r.revenue END) AS revenue`, `SUM(r.sessions) AS sessions`, `SUM(CASE WHEN ${refund} THEN r.revenue ELSE 0 END) AS refunds`]
		: ROLLUP_METRICS.map((m) => `SUM(r.${m}) AS ${m}`);
	// Revenue: the order rows of the dim and its refund rows, two key ranges of one statement.
	return `SELECT ${group.map((g) => `${g} AS ${g.slice(2)}`).join(", ")}, ${sums.join(", ")} FROM ${r.table} r WHERE r.site = ? AND ${rev ? "r.dim IN (?, ?)" : "r.dim = ?"} AND r.seg = ? AND r.day BETWEEN ? AND ?${r.cur ? " AND r.cur = ?" : ""}${keyIn ? ` AND (${keyIn})` : ""} GROUP BY ${group.join(", ")}`;
}

/**
 * The stored cube cells over a range: one key range `(site, day)` of `ca_cube`, per cell (and day). `duration_ms`
 * comes back as `engaged_ms`, the column the session rows of `ca_rollup` keep it in.
 */
// shortcut: filters apply in JS, so a by-day read returns every cell of every day (up to 1,000 a day); push `is` filters into the WHERE if long cube series get slow.
export function cubeSql(dialect: Dialect, byDay: boolean): string {
	const day = int(dialect, 0).sql;
	const group = ["c.channel", "c.country", "c.device", ...(byDay ? ["c.day"] : [])];
	return `SELECT ${group.map((g) => `${g} AS ${g.slice(2)}`).join(", ")}, SUM(c.sessions) AS sessions, SUM(c.pageviews) AS pageviews, SUM(c.visitors) AS visitors, SUM(c.bounces) AS bounces, SUM(c.engaged) AS engaged, SUM(c.duration_ms) AS engaged_ms, SUM(c.events) AS events FROM ca_cube c WHERE c.site = ? AND c.day BETWEEN ${day} AND ${day} GROUP BY ${group.join(", ")}`;
}

/** A cube row as a summary row: no key, the cell in `segkey`. */
const cubeRow = (r: Record<string, unknown>) => ({ ...r, key: "", segkey: SEGMENTS.map((g) => String(r[g])).join(CELL_SEP), engaged_ms: r.engaged_ms ?? r.duration_ms });

/** Add `rows` into one row per key, segment value, day and currency. */
function sumInto(out: Map<string, SumRow>, rows: Iterable<Record<string, unknown>>, metrics: readonly string[], byDay: boolean): void {
	for (const r of rows) {
		const k = { key: String(r.key), segkey: String(r.segkey ?? ""), day: byDay ? isoDay(r.day) : "", cur: r.cur == null ? "" : String(r.cur) };
		const id = `${k.key}\u0000${k.segkey}\u0000${k.day}\u0000${k.cur}`;
		let o = out.get(id);
		if (!o) out.set(id, (o = { ...k, ...Object.fromEntries(metrics.map((m) => [m, 0])) } as SumRow));
		for (const m of metrics) o[m] = num(o[m]) + num(r[m]);
	}
}

/**
 * Summary rows of one dimension (and segment) over a range: the stored days in one statement, the open days from
 * `computeDay`. Seg `cube` reads the cube cells (`ca_cube`, or the revenue rows of dim `all` per cell).
 */
export async function readSummary(rc: Ctx, from: string, to: string, r: SummaryRead): Promise<SumRow[]> {
	const rev = r.table === "ca_revenue_daily";
	const cube = r.seg === CUBE_SEG && !rev;
	const metrics = rev ? REVENUE_METRICS : ROLLUP_METRICS;
	const { stored, open } = await splitRange(rc, from, to);
	const out = new Map<string, SumRow>();
	if (stored && cube) sumInto(out, (await rc.db.all(cubeSql(rc.db.dialect, !!r.byDay), [rc.site, dayInt(stored.from), dayInt(stored.to)])).map(cubeRow), metrics, !!r.byDay);
	else if (stored) {
		const k = r.keys ? inList(rc.db.dialect, "r.key", r.keys, false, Number.MAX_SAFE_INTEGER) : null;
		sumInto(out, await rc.db.all(summarySql(r, k?.sql), [rc.site, r.dim, ...(rev ? [refundDim(r.dim)] : []), r.seg, stored.from, stored.to, ...(r.cur ? [r.cur] : []), ...(k?.params ?? [])]), metrics, !!r.byDay);
	}
	const keys = r.keys ? new Set(r.keys) : null;
	for (const day of open) {
		const d = await openDay(rc, rc.site, rc.goals, day);
		if (cube) {
			sumInto(out, (d.cube ?? []).map((x) => ({ ...cubeRow(x), day })), metrics, !!r.byDay);
			continue;
		}
		const pairs = r.seg === CUBE_SEG ? d.revenueCube : rev ? d.revenuePairs : d.pairs;
		const rows: ReadonlyArray<Paired<RollupRow | RevenueRow>> = r.seg ? (pairs ?? []) : rev ? d.revenue : d.rows;
		const refund = rev ? refundDim(r.dim) : null;
		const mine = rows.filter((x) => (x.dim === r.dim || x.dim === refund) && (x.seg ?? "") === r.seg && (!r.cur || (x as RevenueRow).cur === r.cur) && (!keys || keys.has(x.key)));
		sumInto(
			out,
			mine.map((x) => (x.dim === refund ? { ...x, day, revenue: 0, refunds: (x as RevenueRow).revenue } : { ...x, day, refunds: 0 })),
			metrics,
			!!r.byDay,
		);
	}
	return [...out.values()];
}

/**
 * Rows of the plan's source over the input range that pass every applied filter, summed per key of `by` (the
 * report's dimension; null sums everything into key '') and per day when `byDay`.
 */
export const planRows = (rc: Ctx, input: Pick<RunInput, "from" | "to">, plan: Plan, by: RollupDim | null, byDay = false): Promise<SumRow[]> =>
	planRead(rc, input, plan, { table: "ca_rollup", byKey: !!by, byDay });

/** Revenue rows (`ca_revenue_daily`) of a plan, filtered like `planRows`, per key (`byKey`), day and currency. */
export const planRevenue = (rc: Ctx, input: Pick<RunInput, "from" | "to">, plan: Plan, o: { byKey?: boolean; byDay?: boolean; cur?: string } = {}): Promise<SumRow[]> =>
	planRead(rc, input, plan, { table: "ca_revenue_daily", byKey: !!o.byKey, byDay: !!o.byDay, ...(o.cur ? { cur: o.cur } : {}) });

async function planRead(rc: Ctx, input: Pick<RunInput, "from" | "to">, plan: Plan, o: { table: SummaryRead["table"]; byKey: boolean; byDay: boolean; cur?: string }): Promise<SumRow[]> {
	const { dim, seg, cube } = plan.src;
	const read = cube ? { dim: "all", seg: CUBE_SEG } : { dim, seg };
	// A cube row's key is the value of the plan's dimension in its cell (none for totals).
	const keyOf = (r: SumRow, d: string): string => (cube ? (r.segkey.split(CELL_SEP)[SEGMENTS.indexOf(d as Segment)] ?? "") : FILTER_DIMS[d] === dim ? r.key : r.segkey);
	const read_ = await readSummary(rc, input.from, input.to, { table: o.table, ...read, byDay: o.byDay, ...(o.cur ? { cur: o.cur } : {}) });
	// Keys folded into `(other)` on some day cannot match a key filter: the answer names the dimension.
	for (const f of plan.applied) if (read_.some((r) => keyOf(r, f.dim) === "(other)")) rc.folded?.add(f.dim);
	const rows = read_.filter((r) => plan.applied.every((f) => matchKey(f, keyOf(r, f.dim))));
	const out = new Map<string, SumRow>();
	sumInto(
		out,
		rows.map((r) => ({ ...r, key: o.byKey ? (cube ? keyOf(r, dim) : r.key) : "", segkey: "" })),
		o.table === "ca_rollup" ? ROLLUP_METRICS : REVENUE_METRICS,
		o.byDay,
	);
	return [...out.values()];
}

// ── the scan estimate of the routing rule ────────────────────────────────────

const scanCache = new Map<string, { at: number; value: Promise<Array<{ day: string; sessions: number }>> }>();

export function clearScanCache(): void {
	scanCache.clear();
}

/** Visits per stored day of a range (the `all` rows; open days are not counted), cached 60 seconds per isolate. One key range. */
export function storedSessions(rc: Pick<ReportCtx, "db" | "site">, from: string, to: string, nowMs = Date.now()): Promise<Array<{ day: string; sessions: number }>> {
	const key = JSON.stringify([rc.site, from, to]);
	const hit = scanCache.get(key);
	if (hit && nowMs - hit.at < OPEN_TTL_MS) return hit.value;
	const value = rc.db
		.all("SELECT r.day AS day, r.sessions AS sessions FROM ca_rollup r WHERE r.site = ? AND r.dim = 'all' AND r.seg = '' AND r.day BETWEEN ? AND ?", [rc.site, from, to])
		.then((rows) => rows.map((r) => ({ day: isoDay(r.day), sessions: num(r.sessions) })));
	scanCache.delete(key);
	if (scanCache.size >= OPEN_MAX) scanCache.delete(scanCache.keys().next().value as string);
	scanCache.set(key, { at: nowMs, value });
	value.catch(() => scanCache.get(key)?.value === value && scanCache.delete(key));
	return value;
}
