/** Shared report types and SQL building blocks. */
import type { Annotation as StoredAnnotation, AnnotationView } from "../../annotations/scope.js";
import { addDays, dayInZone } from "../../core/time.js";
import type { Db } from "../../db/adapter.js";
import { dayInt, visitDayKey } from "../../db/dialect.js";
import { MAX_PARAMS, type Param } from "../../db/sql.js";
import type { Settings } from "../../settings.js";
import { andFrags, type CompiledSearch, type CompiledTraffic, entriesOf, entryCols, type Frag, inList, TRUE } from "../compile.js";

export { entryCols, entriesOf };
import type { Filter, FunnelMode, FunnelStep, Goal, Query } from "../filters.js";

/** A normalized, matching annotation; the series reports embed these. */
export type Annotation = Pick<AnnotationView, "ts" | "kind" | "text"> & Partial<AnnotationView>;

export interface FunnelDef {
	name: string;
	steps: FunnelStep[];
	/** Absent: sequential. */
	mode?: FunnelMode | undefined;
}

/** Everything a report needs besides the query; built once per request by the route. */
export interface ReportCtx {
	db: Db;
	site: string;
	settings: Pick<Settings, "siteTimezone" | "engagedThresholdSeconds" | "realtimeWindowMinutes"> &
		Partial<Pick<Settings, "capacityProfile" | "longClickSeconds" | "badExperienceSeconds" | "searchMinImpressions" | "searchOverlapMinShare" | "searchBrandTerms">>;
	/** Epoch seconds. */
	now: number;
	goals: readonly Goal[];
	funnels: Readonly<Record<string, FunnelDef>>;
	annotations: readonly Annotation[];
	/** The site's `defaultCurrency`: revenue reports and `revenue` filters without a currency use it. */
	defaultCurrency?: string;
	/** Routable collections of the CMS for `collections`; null on a client site, which has none. */
	collections?: ReadonlyArray<{ slug: string; urlPattern: string | null }> | null;
	/** Site search parameter names of the site for `site_search`; empty is off. */
	siteSearchParams?: readonly string[];
	/** A shared page or an email: `site_search` omits terms of fewer than two sessions. */
	publicSurface?: boolean;
	/** First day of the raw window; traffic ranges starting earlier read the summaries. Absent: raw only. */
	rawFrom?: string;
	/** Last day whose summary rows are stored (the rollup watermark); later days are computed in memory. Absent: the last closed day. */
	summaryThrough?: string;
	/** Set by a summary answer: filtered dimensions whose rows in the range hold an `(other)` key (notice `summary_other:<dim>`). */
	folded?: Set<string>;
	/** Bing queries of one page key on demand (`search_page_queries`); absent when Bing is not connected or mapped. */
	bingPageQueries?: (page: string) => Promise<ReadonlyArray<{ query: string; day: string; clicks: number; impressions: number; pos_sum: number }>>;
	/** Bing pages of one query on demand (`search_cannibalization_query`); page keys already normalized. */
	bingQueryPages?: (query: string) => Promise<ReadonlyArray<{ page: string; day: string; clicks: number; impressions: number; pos_sum: number }>>;
	/** Annotation lookups of the `impact` report; set by the route for that report only. */
	annotationStore?: AnnotationStore;
	/** Goal names by record id (`annotation_impacts`: a goal target names its goal by id). */
	goalNames?: ReadonlyMap<string, string>;
	/** The dispatcher itself, so `impact` runs its target report through the one compare path. */
	/** `sites_summary`: the sites to list, resolved by the route from the registry and the key's sites. */
	sites?: readonly string[];
	/** `sites_summary` with site routing: each site's database, a key equal for sites that share one, and its watermark. Absent: `db` holds every site. */
	sitesDb?: SitesDb;
	dispatch?: (req: { report: string; query: Query; params?: ReportParams; limit?: number; lean?: boolean }) => Promise<{ data: ReportData; notices: string[] }>;
}

export type SitesDb = (site: string) => Promise<{ key: string; db: Db; summaryThrough?: string | undefined }>;

/** Normalized annotations of the site for `impact`. */
export interface AnnotationStore {
	/** One annotation by id, or the newest (optionally of one kind) for `"latest"`. */
	resolve(ref: string, kind?: string): Promise<StoredAnnotation | null>;
	/** Every annotation with its local day in `[from, to]`. */
	inRange(from: string, to: string): Promise<StoredAnnotation[]>;
}

/** Report-specific parameters (validated in `index.ts`). */
export interface ReportParams {
	withSearch?: boolean;
	withRevenue?: boolean;
	currency?: string;
	field?: "utm_source" | "utm_medium" | "utm_campaign" | "utm_term" | "utm_content";
	event?: string;
	funnel?: string;
	steps?: FunnelStep[];
	/** Mode of ad hoc `steps`; a stored funnel uses its own. */
	mode?: FunnelMode;
	source?: "all" | "google" | "bing";
	page?: string;
	dim?: string;
	prop?: string;
	prefix?: string;
	scope?: "traffic" | "search" | "none" | "annotation";
	direction?: "up" | "down";
	metric?: string;
	minImpressions?: number;
	minShare?: number;
	includeBrand?: boolean;
	list?: "matrix" | "up" | "down" | "new" | "lost";
	query?: string;
	annotation?: string;
	kind?: "manual" | "publish" | "update" | "release";
	at?: string;
	window?: number;
	report?: string;
	key?: string;
	goal?: string;
	path?: string;
	context?: boolean;
	scopeKind?: "site" | "host" | "path" | "query";
	entry?: string;
	by?: string;
	slug?: string;
	rank?: "best" | "worst";
}

/** One run of a report over one range (the dispatcher runs it again for the compare range). */
export interface RunInput {
	from: string;
	to: string;
	filters: readonly Filter[];
	granularity: "auto" | "hour" | "day" | "week";
	params: ReportParams;
	limit: number;
	offset: number;
	/** Present for traffic reports. */
	traffic?: CompiledTraffic;
	/** Present for search reports. */
	search?: CompiledSearch;
	/** True for the compare run (realtime is skipped there). */
	isCompare: boolean;
	/** Answered from the summaries (set by the dispatcher's routing rule). */
	summary?: boolean;
	/** An impact measurement reads only the figures: no realtime count and no first-run lookup (D1 query budget). */
	lean?: boolean;
}

export type Metrics = Record<string, number | null>;
export interface Row extends Record<string, unknown> {
	key: string;
}
export interface Point extends Record<string, unknown> {
	t: string;
}

export interface ReportData {
	totals?: Metrics;
	rows?: Row[];
	series?: Point[];
	/** More rows exist beyond `limit`. */
	truncated?: boolean;
	notices?: string[];
	[extra: string]: unknown;
}

export const num = (v: unknown): number => {
	const n = typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : typeof v === "string" ? Number(v) : 0;
	return Number.isFinite(n) ? n : 0;
};
export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
export const round = (v: number | null, digits = 4): number | null => (v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/** Session duration: wall clock between first and last pageview, or the visible time when longer. */
export const DURATION_MS = "CASE WHEN (s.last_seen - s.started) * 1000 > s.visible_ms THEN (s.last_seen - s.started) * 1000 ELSE s.visible_ms END";

/**
 * Day semantics. A fact belongs to the day of the row that stores it: page views and events are entries of
 * the visit document and count on the day the visit started (`ca_sessions.day`), also when the visit runs
 * past midnight; orders and server-reported events (`ca_events`) and error pages (`ca_srv`) count on their
 * own day. Every range is therefore a key range of one table: `(site, day, ...)`. An hour chart of orders
 * uses the order's own time. Totals over a range only differ at its ends (docs/limits.md).
 */
export const visitDays = (site: string, from: string, to: string): Frag => ({ sql: "s.site = ? AND s.day BETWEEN ? AND ?", params: [site, visitDayKey(from), visitDayKey(to)] });

/**
 * Visits active in the realtime window: a visit lasts at most a day, so it started today or yesterday (two
 * key ranges, never a scan of older days).
 */
export function liveVisits(rc: Pick<ReportCtx, "site" | "now" | "settings">): Frag {
	const today = dayInZone(rc.now, rc.settings.siteTimezone);
	return {
		sql: "s.site = ? AND s.day IN (?, ?) AND s.last_seen > ? AND s.pageviews > 0",
		params: [rc.site, visitDayKey(today), visitDayKey(addDays(today, -1)), rc.now - rc.settings.realtimeWindowMinutes * 60],
	};
}

/** Base predicate: sessions of the site in range with at least one pageview, plus filters. */
export function sessionWhere(site: string, from: string, to: string, filters: Frag): Frag {
	return andFrags([visitDays(site, from, to), { sql: "s.pageviews > 0", params: [] }, filters]);
}

/**
 * Session metrics per key and day, summed per key in the outer query. Visitors are distinct `vkey`
 * per day, summed. `keyExpr` null gives one totals row.
 */
export function sessionAggSql(rc: ReportCtx, input: RunInput, keyExpr: string | null, extra: Frag = TRUE): Frag {
	const where = andFrags([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), extra]);
	const k = keyExpr ? `${keyExpr} AS key, ` : "";
	const g = keyExpr ? `${keyExpr}, ` : "";
	const inner = `SELECT ${k}s.day AS day, COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews, COUNT(DISTINCT s.vkey) AS visitors, SUM(s.events) AS events,
SUM(CASE WHEN s.pageviews = 1 AND s.events = 0 THEN 1 ELSE 0 END) AS bounces,
SUM(CASE WHEN s.engaged_ms >= ? OR s.pageviews > 1 OR s.events > 0 THEN 1 ELSE 0 END) AS engaged,
SUM(${DURATION_MS}) AS duration_ms
FROM ca_sessions s WHERE ${where.sql} GROUP BY ${g}s.day`;
	const sums = "SUM(t.sessions) AS sessions, SUM(t.events) AS events, SUM(t.pageviews) AS pageviews, SUM(t.visitors) AS visitors, SUM(t.bounces) AS bounces, SUM(t.engaged) AS engaged, SUM(t.duration_ms) AS duration_ms";
	return {
		sql: keyExpr ? `SELECT t.key AS key, ${sums} FROM (${inner}) t GROUP BY t.key` : `SELECT ${sums} FROM (${inner}) t`,
		params: [rc.settings.engagedThresholdSeconds * 1000, ...where.params],
	};
}

/** Derived session metrics from raw sums. */
export function sessionMetrics(r: Record<string, unknown>): Metrics {
	const sessions = num(r.sessions);
	const pageviews = num(r.pageviews);
	return {
		visitors: num(r.visitors),
		sessions,
		pageviews,
		views_per_session: round(ratio(pageviews, sessions)),
		bounce_rate: round(ratio(num(r.bounces), sessions)),
		engaged_rate: round(ratio(num(r.engaged), sessions)),
		avg_duration: round(ratio(num(r.duration_ms) / 1000, sessions), 1),
	};
}

/** Breakdown of filtered sessions by a session column expression. */
export async function sessionBreakdown(rc: ReportCtx, input: RunInput, keyExpr: string, extra: Frag = TRUE): Promise<ReportData> {
	const q = sessionAggSql(rc, input, keyExpr, extra);
	const rows = await rc.db.all(`${q.sql} ORDER BY sessions DESC, key LIMIT ? OFFSET ?`, [...q.params, input.limit + 1, input.offset]);
	return {
		rows: rows.slice(0, input.limit).map((r) => ({ key: String(r.key), ...sessionMetrics(r) })),
		truncated: rows.length > input.limit,
	};
}

/** Filtered session totals (also the denominator of goal and event rates). */
export async function sessionTotals(rc: ReportCtx, input: RunInput): Promise<Metrics> {
	const q = sessionAggSql(rc, input, null);
	const [r] = await rc.db.all(q.sql, q.params);
	return sessionMetrics(r ?? {});
}

/**
 * Page view or event entries of the filtered sessions in range: `FROM ca_sessions s, json_each(s.hits) h`, one
 * key range of `ca_sessions`. Entry fields are expressions, see `entryCols` (`h.path` becomes `entryCols(d).path`).
 */
export function hitJoin(rc: ReportCtx, input: RunInput, kind: "pv" | "ev", extra: Frag = TRUE): Frag {
	const own = kind === "pv" ? input.traffic?.pv : input.traffic?.ev;
	const where = andFrags([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), { sql: entryCols(rc.db.dialect)[kind], params: [] }, own ?? TRUE, extra]);
	return { sql: `FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql}`, params: where.params };
}

/**
 * Orders of the range with their visit: `ca_events h` (one row per order, whatever its origin) by
 * the order's own day, LEFT JOIN the visit by its key `(site, sday, sid)`, so an order without a visit (or
 * with a visit of no pageview) stays in the totals as `(not set)`; under a session filter only orders of a
 * counted visit remain. The column names of `h` are those the reports used before (`path`, `name`, `props`,
 * `val`, `cur`, `sid`, `ts`); `h.day` is yyyymmdd.
 */
export function revenueWhere(site: string, from: string, to: string, session: Frag, extra: Frag = TRUE): Frag {
	const where = andFrags([
		{ sql: "h.site = ? AND h.day BETWEEN ? AND ? AND h.val IS NOT NULL", params: [site, dayInt(from), dayInt(to)] },
		session.sql === TRUE.sql ? TRUE : andFrags([{ sql: "s.pageviews > 0", params: [] }, session]),
		extra,
	]);
	return { sql: `FROM ca_events h LEFT JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid WHERE ${where.sql}`, params: where.params };
}

/**
 * Order sums over `ca_events h`: a refund is a row with a negative `val` (agent events, docs/revenue.md), so
 * orders, gross revenue and paying sessions count rows with `val >= 0` only and `refunds` is the refunded amount.
 */
/** Goals per goal statement (`UNION ALL`), in the closed-day writer and the detailed Goals report. */
export const GOALS_PER_STATEMENT = 10;

/** Goal statements in groups of at most `GOALS_PER_STATEMENT`, each within the bound parameter limit. */
export function goalGroups(parts: readonly Frag[]): Frag[][] {
	const groups: Frag[][] = [];
	for (const p of parts) {
		const g = groups[groups.length - 1];
		if (g && g.length < GOALS_PER_STATEMENT && g.reduce((n, x) => n + x.params.length, 0) + p.params.length <= MAX_PARAMS) g.push(p);
		else groups.push([p]);
	}
	return groups;
}

export const ORDER_SUMS =
	"SUM(CASE WHEN h.val >= 0 THEN 1 ELSE 0 END) AS orders, SUM(CASE WHEN h.val >= 0 THEN h.val ELSE 0 END) AS revenue, SUM(CASE WHEN h.val < 0 THEN -h.val ELSE 0 END) AS refunds, COUNT(DISTINCT CASE WHEN h.val >= 0 THEN h.sid END) AS sessions";
/** The `ca_revenue_daily` dim of the refund rows of `dim`: `revenue` holds the refunded amount, `orders` and `sessions` 0. */
export const refundDim = (dim: string) => `refund.${dim}`;

/** `col IN (...)` over the keys of the current page of rows: one JSON parameter, so 10 000 export keys still fit. */
export const keysIn = (rc: ReportCtx, col: string, keys: readonly string[]): Frag => inList(rc.db.dialect, col, keys, false, Number.MAX_SAFE_INTEGER);

/** Annotations whose local day lies in the range. */
export function annotationsIn(rc: ReportCtx, from: string, to: string): Annotation[] {
	return rc.annotations
		.filter((a) => {
			const d = dayInZone(a.ts, rc.settings.siteTimezone);
			return d >= from && d <= to;
		})
		.sort((a, b) => a.ts - b.ts);
}

export type { Param };
