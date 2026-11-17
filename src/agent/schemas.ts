/**
 * Agent API request schemas and the endpoint table. Kept free of host imports so
 * `scripts/build-openapi.mjs` can load it under plain Node.
 */
import { z } from "zod";
import { addDays } from "../core/time.js";
import { LINK_BY, MAX_FILTERS, NUM_OPS, OPS, QuerySchema, REVENUE_BREAKDOWN_DIMS, REVENUE_DIMS, REVENUE_VALUE_RE, SEARCH_DIMS, TRAFFIC_DIMS } from "../query/filters.js";
import { MAX_LIMIT, NARROW_FACTOR, ParamsSchema, REPORT_NAMES, REPORTS, SCAN_BUDGET } from "../query/reports/index.js";
import { FUNNEL_SESSION_CAP, FUNNEL_STRICT_SESSION_CAP } from "../query/reports/behaviour.js";
import { JOURNEY_MAX_RANGE_DAYS, JOURNEY_MAX_ROWS, JOURNEY_MIN_SESSIONS, JOURNEY_SESSION_CAP } from "../query/reports/journeys.js";
import { POGO_DEFINITION, SATISFACTION_BY, SATISFACTION_CAVEAT, SATISFACTION_MIN_MEASURED } from "../query/reports/satisfaction-copy.js";
import { COLLECTIONS_CACHE_SECONDS } from "../query/reports/collections.js";
import { SITE_SEARCH_DISTINCT_CAP } from "../query/reports/sitesearch.js";
import { RECENT_ORDERS_CAP } from "../query/reports/revenue.js";
import { SITE_SEARCH_TERM_MAX } from "../core/url.js";
import { SITE_SEARCH_MAX_PARAMS } from "../settings.js";
import { IMPACT_METRICS, IMPACT_WINDOWS, SEO_MAX_RANGE_DAYS, SEO_TEXT } from "../query/reports/seo-copy.js";
import { type Scope, SCOPE_LABELS } from "../keys/scopes.js";
import { DashboardInput, MAX_DASHBOARDS_PER_SITE, MAX_RECORD_BYTES, MAX_TILES, Preset, TILE_KIND_NAMES, TILE_KINDS, TILE_METRICS, TILE_PARAMS } from "../dashboards/schema.js";
import { PRESETS } from "../core/presets.js";
import { requiredScopes } from "./query.js";
import { MAX_ANNOTATION_SEARCH, PathShortcut, ScopeSchema } from "../annotations/scope.js";
import { TargetSchema } from "../annotations/target.js";
import { LINK_EVENTS } from "../contract.js";
import { TABLES } from "../db/schema.js";

/** Optional site: the local site or a client site of this database; absent means the local site. */
export const AgentSite = z.string().regex(/^[a-z0-9-]{1,32}$/).optional();

/** Range cap of the agent API (the admin allows longer ranges). */
export const AGENT_MAX_RANGE_DAYS = 400;

/** A real calendar day: `2026-02-30` or `0000-00-00` would turn range math into NaN or another day. */
const Day = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((d) => addDays(d, 0) === d, { message: "not a calendar day" });

/** The admin `Query` and report names; `query.site` names the site (a remote satellite id answers `site_not_allowed`). */
export const AgentQueryBody = z
	.object({
		report: z.enum(REPORT_NAMES),
		query: QuerySchema,
		params: ParamsSchema.optional(),
		limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
		offset: z.number().int().min(0).max(100_000).optional(),
		/** Matching annotations as `data.annotations`. */
		withAnnotations: z.boolean().optional(),
	})
	.strict();

/** Optional range in the query string; the default is the last 7 days (summary) or 30 days (annotations), today included. */
export const RangeParams = z.object({ from: Day.optional(), to: Day.optional(), site: AgentSite }).strict();
export const SiteParams = z.object({ site: AgentSite }).strict();
/** `GET summary`: the range plus the compare option (default the previous period); a master's All-sites row reads it. */
export const SummaryParams = RangeParams.extend({ compare: z.enum(["previous", "year", "none"]).optional() }).strict();

/** `GET annotations`: the range plus concrete values; only annotations whose scope matches them are returned. */
export const AnnotationParams = RangeParams.extend({
	path: z.string().min(1).max(512).optional(),
	host: z.string().min(1).max(253).optional(),
	query: z.string().min(1).max(512).optional(),
	/** Text search: title, kind, scope or source slug contains it (case-insensitive). */
	q: z.string().trim().max(MAX_ANNOTATION_SEARCH).optional(),
}).strict();

export const AnnotationBody = z
	.object({
		text: z.string().trim().min(1).max(200),
		/** Epoch seconds; defaults to now. */
		ts: z.number().int().min(0).optional(),
		kind: z.enum(["release", "manual"]).default("release"),
		/** Shortcut for one page: `{ v: 1, path: [{ op: "is", value: path }] }`. Not together with `scope`. */
		path: PathShortcut.optional(),
		scope: ScopeSchema.optional(),
		/** The KPI its impact is measured on (`report`, `metric`, `params`); absent means visitors of the scope. */
		target: TargetSchema.optional(),
		site: AgentSite,
	})
	.strict();

export const SearchSyncBody = z.object({ source: z.enum(["google", "bing"]).optional(), site: AgentSite }).strict();
export const BackfillBody = z
	.object({ action: z.enum(["start", "cancel", "status"]), source: z.enum(["google", "bing"]).optional(), days: z.number().int().min(0).max(1000).optional(), from: Day.optional(), to: Day.optional(), site: AgentSite })
	.strict();

const DashId = z.string().regex(/^[a-z0-9]{12}$/);
/** `compare: "segment"` uses the dashboard's `defaults.compareSegment`; without one the tiles run without comparison. */
export const DashboardDataBody = z.object({ id: DashId, site: AgentSite, range: Preset.optional(), compare: z.enum(["none", "previous", "year", "segment"]).optional() }).strict();
/** Parsed loosely so the dashboard itself gets the typed errors of the record schema. */
export const DashboardSaveBody = z.object({ dashboard: z.record(z.string(), z.unknown()), site: AgentSite }).strict();
const DashboardSaveDoc = z.object({ dashboard: DashboardInput, site: AgentSite }).strict();
export const DashboardDeleteBody = z.object({ id: DashId, site: AgentSite }).strict();

/** `POST events`: parsed loosely so each item gets its own result; `EventsDoc` documents the item. */
export const EventsBody = z.object({ site: AgentSite, events: z.array(z.unknown()).min(1).max(20) }).strict();
const AgentEvent = z.object({
	name: z.string().min(1).max(64).describe("Event name; a leading underscore is reserved."),
	val: z.number().min(0).max(1_000_000_000).optional().describe("Order value, rounded to the currency's minor unit. Not with refund."),
	cur: z.string().length(3).optional().describe("ISO 4217 code; absent means the site's default currency."),
	oid: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/).optional().describe("Order id: one order is stored once, by any path. Reposting it here replaces the amount and currency and counts in data.duplicates. Never stored."),
	void: z.literal(true).optional().describe("With name and oid only, no val: sets the stored order's value and currency to null, the event stays. An order id not stored is rejected with unknown_order. Works inside the raw window only."),
	refund: z
		.number()
		.gt(0)
		.max(1_000_000_000)
		.optional()
		.describe(
			"With name, oid and rid: refund this amount of the stored order (same name and oid), booked on the refund's own day (ts) with the order's attribution, page and currency. Partial refunds add up; above the order's amount is refund_exceeds_order, an order id not stored is unknown_order, cur other than the order's is currency_mismatch. sid, u and p are not read.",
		),
	rid: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/).optional().describe("Refund id, required with refund: a refund is stored once per order and refund id, so a retry counts in data.duplicates. Never stored."),
	sid: z.string().regex(/^[a-z0-9]{20}$/).optional().describe("The page's session id (window.<namespace>.sid) to attribute the event; absent stores it unattributed."),
	ts: z.number().int().optional().describe("Epoch seconds, from 30 days ago (and after the first day of the raw window) to 60 s ahead; absent means now."),
	u: z.string().max(2048).optional().describe("Path; absent means the session's last page."),
	p: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Properties, at most 10."),
});
const EventsDoc = z.object({ site: AgentSite, events: z.array(AgentEvent).min(1).max(20) }).strict();

/** Rows per `data/dump` and `data/load` call at most; a dump also stops before 1.2 MB (`MAX_CHUNK_BYTES`). */
export const MAX_DATA_ROWS = 1000;
const DataTable = z.enum(TABLES).describe("One of the nine analytics tables.");
export const DataDumpBody = z
	.object({
		site: AgentSite.describe("Only this site's rows; absent means every site of the database (a key with a site restriction always gets its one site)."),
		table: DataTable,
		cursor: z.array(z.union([z.string(), z.number()])).min(1).max(8).nullable().optional().describe("The next-cursor header of the previous call; absent or null starts at the beginning."),
		limit: z.number().int().min(1).max(MAX_DATA_ROWS).optional().describe("Rows at most; default 50 on the small capacity profile, 500 otherwise. An answer also stops before 1.2 MB: ask for fewer rows after an answer that came back short with a next cursor."),
	})
	.strict();
export const DataLoadBody = z
	.object({
		site: AgentSite.describe("When set, every row must be of this site."),
		layout: z.number().int().describe("The table layout of the export; must equal the site's (x-layout of data/dump)."),
		table: DataTable,
		rows: z.array(z.record(z.string(), z.unknown())).max(MAX_DATA_ROWS).describe("Rows as data/dump wrote them, one object per row."),
	})
	.strict();

export type Method = "GET" | "POST";
export interface Endpoint {
	name: string;
	method: Method;
	/** Required scope; null means any valid key. */
	scope: Scope | null;
	summary: string;
	body?: z.core.$ZodType;
	params?: z.core.$ZodType;
}

/** Every agent route and method. Route names are mounted at `/_emdash/api/plugins/cookieless-analytics/<name>`. */
export const ENDPOINTS: readonly Endpoint[] = [
	{
		name: "agent/v1/query",
		method: "POST",
		scope: "read:analytics",
		summary: "Run one report. query.compare segment with query.compareSegment compares two segments on the same range (not on search reports, the SEO views or impact). Search reports, including the SEO views, need read:search instead; pages with withSearch and impact over a search report need both. Revenue reports (revenue, revenue_series, revenue_breakdown, revenue_orders) answer in params.currency, default the site's defaultCurrency, list every currency with orders in data.currencies and name the currency in meta.currency; money of two currencies is never added. Long ranges and ranges before the detailed window are answered from daily summaries (notices summary, filter_unavailable:<dim>:<reason>, detail_from:<day>; errors raw_only and narrow_range; the catalog's summaries entry has the rule).",
		body: AgentQueryBody,
	},
	{ name: "agent/v1/reports", method: "GET", scope: "read:analytics", summary: "Catalog: report names, dimensions, operators, metric definitions and scopes." },
	{ name: "agent/v1/summary", method: "GET", scope: "read:analytics", summary: "The Overview numbers for a range, compared with the previous period (compare=year for the same period last year, none for no comparison), plus data.revenue: revenue, refunds, net revenue and orders per currency, never summed across currencies.", params: SummaryParams },
	{ name: "agent/v1/status", method: "GET", scope: "read:analytics", summary: "Versions, data freshness, rollup watermark, drop counters and search sync state.", params: SiteParams },
	{ name: "agent/v1/annotations", method: "GET", scope: "read:analytics", summary: "Annotations in a range, newest first, with scope and summary; path, host and query keep the ones whose scope matches that value; q keeps the ones whose title, kind, scope or source slug contains the text.", params: AnnotationParams },
	{ name: "agent/v1/annotations", method: "POST", scope: "write:annotations", summary: "Add an annotation, for example a release from a deploy script; scope limits where it shows, path is a shortcut for one page.", body: AnnotationBody },
	{ name: "agent/v1/search/sync", method: "POST", scope: "sync:search", summary: "Run one Search sync tick now.", body: SearchSyncBody },
	{ name: "agent/v1/search/backfill", method: "POST", scope: "sync:search", summary: "Start, cancel or read the progress of a Search backfill.", body: BackfillBody },
	{ name: "agent/v1/dashboards", method: "GET", scope: "read:analytics", summary: "Dashboard definitions of the key's sites, or of one site with ?site=.", params: SiteParams },
	{ name: "agent/v1/dashboards/data", method: "POST", scope: "read:analytics", summary: "Run every tile of one dashboard. A dashboard with a search tile also needs read:search.", body: DashboardDataBody },
	{ name: "agent/v1/dashboards/save", method: "POST", scope: "write:dashboards", summary: "Create (no id) or replace a dashboard; the catalog lists the tile kinds per report.", body: DashboardSaveDoc },
	{ name: "agent/v1/dashboards/delete", method: "POST", scope: "write:dashboards", summary: "Delete a dashboard.", body: DashboardDeleteBody },
	{ name: "agent/v1/events", method: "POST", scope: "write:events", summary: "Record 1 to 20 events, typically orders from a payment webhook; invalid items are listed in data.rejected by index; a repeated order id replaces the stored amount and currency, a void item nulls them, both count in data.duplicates.", body: EventsDoc },
	{
		name: "agent/v1/data/dump",
		method: "POST",
		scope: "data:export",
		summary: "One chunk of a table's stored rows as NDJSON (application/x-ndjson, one row per line, under 1.2 MB), read by primary key. Headers: x-next-cursor (URI encoded JSON array for the next call; absent when the table is done), x-layout (table layout), x-engine (sqlite or postgres), x-total (row count, on the first call of a table only). Used by the ca-data CLI for backups and moves.",
		body: DataDumpBody,
	},
	{
		name: "agent/v1/data/load",
		method: "POST",
		scope: "data:import",
		summary: "Insert rows written by data/dump. Idempotent: a row whose key exists is kept as it is, so a repeated chunk inserts 0 rows; counters of ca_srv and ca_drops are not added. A layout other than the site's answers 400 layout_mismatch; a row whose site, columns or values the table cannot store answers 400 invalid_row; 409 delete_running or move_running while a delete of the Data page or a data move into that database runs. On the small capacity profile with D1 the rows count against the day's copy rows (shared with the data move): 429 daily_limit with Retry-After to 00:00 UTC. Answers data.inserted; an empty rows array writes nothing and answers data.layout and the table's row count in data.total.",
		body: DataLoadBody,
	},
	{ name: "agent/v1/openapi.json", method: "GET", scope: null, summary: "This OpenAPI document." },
];

/** Metric definitions served by the catalog; the admin InfoMark caveats say the same in more words. */
export const METRICS: Record<string, string> = {
	visitors: "Distinct daily visitor keys summed per day; a visitor seen on two days counts twice. Cross-day uniques are not tracked.",
	sessions: "Sessions of humans; the window is the sessionWindowMinutes setting.",
	pageviews: "Page views of humans.",
	views_per_session: "pageviews / sessions.",
	bounce_rate: "Sessions that are not engaged, divided by sessions: 1 - engaged_rate (the GA4 meaning).",
	engaged_rate: "Sessions with active time at or above the engagement threshold, more than one page view or any event, divided by sessions.",
	avg_duration: "Mean session duration in seconds: the longer of the visit span (first to last activity) and the visible time. Not interaction time.",
	avg_time: "Mean active time per page view in seconds (pages report): time with interaction, within 60 s of the last one, so an open but untouched page counts 0 s.",
	avg_visible: "Mean visible time per page view in seconds (pages report, detailed data only; null in summaries).",
	realtime: "Sessions active within the realtime window (overview only).",
	conversions: "Sessions that reached a goal.",
	conversion_rate: "conversions / sessions of the filtered set.",
	clicks: "Search clicks reported by the provider.",
	impressions: "Search impressions reported by the provider.",
	ctr: "clicks / impressions.",
	position: "Impression weighted mean position: sum of position times impressions, divided by impressions.",
	measured: "Sessions with at least one engagement update (visible time above 0); the Search Satisfaction rates divide by these.",
	search_sessions: "Sessions whose channel is Organic Search or Paid Search (Search Satisfaction reports).",
	long_clicks: "Measured sessions longer than the longClickSeconds setting (default 60 s).",
	short_clicks: "Measured sessions at or below the longClickSeconds setting.",
	bad_experiences: "Measured single page sessions without events or interaction, shorter than min(badExperienceSeconds, longClickSeconds).",
	search_measured: "Measured search sessions: the denominator of pogo_stick_rate (Search Satisfaction reports).",
	pogo_sticks: "Measured search sessions with one page view, no events, a short click, and a page left for the back and forward cache.",
	reentered: "Search sessions that a later arrival from a search engine joined.",
	returned_from_search: "Search sessions that a later arrival from a search engine joined and whose landing page view (the first) was left for the back and forward cache.",
	avg_engaged: "Mean active time per session in seconds (Search Satisfaction reports): time with interaction, not the time the page was open.",
	measured_rate: "measured / sessions: the share of sessions with a measurable end.",
	score: "pct_long - pct_bad - pogo_stick_rate (pogo_stick_rate counts as 0 without measured search sessions); null without measured sessions. Ranks best and worst pages (satisfaction params.rank).",
	pct_long: "long_clicks / measured.",
	pct_short: "short_clicks / measured.",
	pct_bad: "bad_experiences / measured.",
	pogo_stick_rate: `pogo_sticks / search_measured. ${POGO_DEFINITION} An estimate.`,
	returned_from_search_rate: "returned_from_search / search_sessions. A stronger pogo-sticking signal: the visitor demonstrably came back from a search engine. An estimate.",
	search_reentry_rate: "reentered / search_sessions. An estimate.",
	back_nav_rate: "Page loads of type back_forward / page loads with a known navigation type; restores from the back and forward cache are not loads, so a lower bound. An estimate.",
	// SEO views.
	cannibalized_queries: "Queries with two or more pages each holding at least minShare percent of the query's impressions, and at least minImpressions impressions in the range (search_cannibalization).",
	cannibalized_impressions: "Impressions of the cannibalized queries.",
	visible_share: "Page with query impressions over total impressions of the range: the share of search traffic the pair views can see.",
	impressions_share: "A page's (or band's) impressions over the query's (or all) impressions.",
	moved_up: "Queries whose position band improved between the previous and the current period.",
	moved_down: "Queries whose position band worsened between the two periods.",
	potential_clicks: "impressions * max(0, ctr_1_3 - ctr), where ctr_1_3 is the site's own CTR in band 1-3 over the same range; null below 1,000 band 1-3 impressions. An estimate.",
	notable: "abs(current - previous) > 2 * sqrt(current + previous) for counts; a rule of thumb for count data, not a statistical test.",
	loss: "Clicks (or page views) of the oldest period minus the current period (decay views).",
	// Revenue: every figure is in one currency, never added across currencies.
	revenue: "Sum of the values of revenue events (events sent with a value) in one currency, before refunds (gross).",
	refunds: "Sum of the refunds booked in the range (agent/v1/events refund items), by the refund's own day and the order's attribution.",
	net_revenue: "revenue - refunds; negative on a day or key with more refunds than new orders.",
	orders: "Revenue events in the currency; an event with value 0 is an order of zero. A refund is not an order and never changes this count.",
	aov: "Average order value: revenue / orders, per currency.",
	revenue_per_visitor: "revenue / visitors, where visitors is the Overview figure for the same filters and range (all visitors, not only buyers).",
	revenue_per_session: "revenue / sessions of the filtered set.",
	paying_sessions: "Distinct sessions with at least one revenue event in the currency.",
};

/** Catalog of the revenue reports. */
export const REVENUE_CATALOG = {
	reports: {
		revenue: { params: ["currency"], metrics: ["revenue", "refunds", "net_revenue", "orders", "aov", "revenue_per_visitor", "revenue_per_session", "paying_sessions"] },
		revenue_series: { params: ["currency"], metrics: ["revenue", "refunds", "net_revenue", "orders", "aov"] },
		revenue_breakdown: { params: ["currency", "dim"], dims: REVENUE_BREAKDOWN_DIMS, metrics: ["revenue", "refunds", "net_revenue", "orders", "aov", "revenue_per_visitor"] },
		revenue_orders: {
			params: ["currency"],
			fields: ["key", "day", "amount", "refund", "channel", "entry", "country"],
			rule: `The newest orders and refunds of the range, at most ${RECENT_ORDERS_CAP}, from detailed data only (raw_only before the detailed window). key is the stored order reference (a hash of the order id); amount is negative for a refund; channel, entry and country are the first touch of the order's visit. No session or visitor key.`,
		},
	},
	withRevenue: ["channels", "sources", "campaigns", "pages", "entry_pages", "countries", "devices", "events", "goals"],
	filterDims: { currency: { ops: ["is", "is_not"] }, revenue: { ops: NUM_OPS, value: REVENUE_VALUE_RE.source, prop: "an ISO 4217 code; absent means the site's default currency" } },
	currencyRule: "Money of two currencies is never added. Every revenue report answers in params.currency (default: the site's defaultCurrency) and lists every currency with orders in data.currencies; meta.currency names the currency of the figures.",
	errors: ["invalid_currency", "invalid_params", "invalid_filter"],
	ingest: { route: "agent/v1/events", scope: "write:events" },
} as const;

/** Catalog of funnel modes, segment comparison and journeys. */
export const BEHAVIOUR_CATALOG = {
	funnels: {
		params: ["funnel", "steps", "mode", "withRevenue", "currency"],
		modes: {
			sequential: "Step n is reached by a matching hit after the step n-1 hit in the same session; anything may happen between. The default, also for a stored funnel without mode.",
			strict: "Step n must be the next countable hit of the session after the step n-1 hit. Countable: pageviews, user events (not _ events) and any hit matching a step. Hits in the same second are simultaneous: never between, and may satisfy consecutive steps in either order.",
			flexible: "The steps may be completed in any order within one session; step n counts sessions that completed steps 1 to n.",
		},
		revenueRule:
			"withRevenue adds per step the revenue of the sessions that reached it, in params.currency or the site's defaultCurrency: revenue, orders, aov, paying_sessions, revenue_per_session, revenue_currency, refunds and net_revenue when present. Every order of such a session in the range counts at every step it reached. est_lost_revenue is an estimate: the sessions that left before the step times the revenue per session of the sessions that reached the last step. Without orders in the range the keys are absent; data.other_currencies lists the other codes.",
		modeRule: "A stored funnel (params.funnel) uses its own mode; params.mode applies to ad hoc params.steps. data.mode names the mode used.",
		sessionCaps: { sequential: FUNNEL_SESSION_CAP, flexible: FUNNEL_SESSION_CAP, strict: FUNNEL_STRICT_SESSION_CAP },
		errors: ["funnel_cap", "unknown_funnel", "invalid_params"],
	},
	compareSegment: {
		query: { compare: "segment", compareSegment: "a segment id of the site" },
		rule: "Side B runs over the same range with the ad hoc filters and the compare segment in place of query.segment; compareTotals, previous per row and compareSeries hold side B, compareRange equals the range, and the result echoes segment and compareSegment as { id, name }. Visitors are never summed across the two sides.",
		notSupported: "Search reports, the SEO views and impact answer compare_not_supported; an unknown segment answers unknown_segment.",
	},
	journeys: {
		reports: { journey_next: { params: ["path"], tile: false }, journey_prev: { params: ["path"], tile: false }, journey_paths: { params: ["entry"], tile: true } },
		maxRangeDays: JOURNEY_MAX_RANGE_DAYS,
		sessionCap: JOURNEY_SESSION_CAP,
		minSessions: JOURNEY_MIN_SESSIONS,
		maxRows: JOURNEY_MAX_ROWS,
		rule: "Pageviews of the filtered sessions. A range starting before the raw window reads the daily summaries: the top steps and paths of each day (notice top_paths_per_day), no filters (filter_unavailable:<dim>:not_kept). Consecutive views of one path are one step. Rows with fewer than minSessions sessions are omitted and counted in data.hidden_sessions. Pageviews in the same second are ordered by hit id, so such pairs may swap.",
		errors: ["journey_range", "journey_cap", "raw_only", "invalid_params"],
	},
} as const;

/** Catalog of the per-collection and site search reports. */
export const CONTENT_CATALOG = {
	collections: {
		tile: true,
		metrics: { pageviews: "Pageviews of the collection's pages.", visitors: "Page visitors: the sum of per-page daily visitors, so one person reading two pages counts twice.", sessions: "Sessions summed per page.", avg_time: "Average active time per page view in seconds: time with interaction, not the time the page was open.", pages: "Distinct paths of the collection." },
		rule: "Reads the daily page summaries (ca_rollup dim page), so it covers the whole summary retention. Paths are classified by each routable collection's URL pattern; the pattern with the most literal characters wins and unmatched paths are (other). totals.coverage is the classified share of all pageviews; the rest is folded into (other) by the top 500 pages per day.",
		cacheSeconds: COLLECTIONS_CACHE_SECONDS,
		notices: ["filters_not_applied", "not_available_for_site"],
	},
	site_search: {
		tile: true,
		metrics: { searches: "Pageviews carrying the term.", sessions: "Sessions per term, summed over the distinct stored query strings that carry it; an upper bound when sessions_upper_bound is true.", searches_per_session: "searches over sessions." },
		setting: "siteSearchParams",
		maxParams: SITE_SEARCH_MAX_PARAMS,
		termMax: SITE_SEARCH_TERM_MAX,
		distinctCap: SITE_SEARCH_DISTINCT_CAP,
		minSessionsShared: JOURNEY_MIN_SESSIONS,
		rule: "Raw window only. Terms are trimmed, lowercased, whitespace collapsed, at most 64 characters, and redacted when they hold an @ or nine or more consecutive digits. The agent API and the admin show every term; shared pages and emails omit terms of fewer than minSessionsShared sessions and count them in data.hidden_terms. Whether a search found results is unknown; send an event such as search_no_results.",
		notices: ["site_search_off", "site_search_capped"],
		errors: ["raw_only"],
	},
} as const;

/** Catalog of the satisfaction reports (docs/sessions.md). */
/** Catalog of the routing rule and the summary engine (docs/AGENTS.md). */
export const SUMMARY_CATALOG = {
	rule: `A report reads the detailed visits when its range lies inside the detailed window (status.rawFrom onward) and the stored days hold at most the scan budget of the capacity profile (${Object.entries(SCAN_BUDGET)
		.map(([k, v]) => `${k} ${v.toLocaleString("en-US")}`)
		.join(", ")} visits). Above it the daily summaries answer when they honour every filter; otherwise the detailed visits answer up to ${NARROW_FACTOR} times the budget, and beyond that the error narrow_range names the longest range that fits. A range before the detailed window reads the summaries; reports without summaries answer raw_only. Days not stored yet (today, and yesterday until it closes) are computed from the visits on read, so summary figures include today.`,
	filters: "Summaries apply filters on the report's own dimension. One of channel, country and device combines with page, entry, source, utm_campaign, event or goal (pair rows). Two or three of channel, country and device combine with each other (the daily cube) in overview, timeseries, channels, countries, devices, revenue and revenue_series, and revenue_breakdown by channel, country or device; next to another breakdown or another session filter only one applies. They do not apply: is_not, not_contains, not_prefix and not_regex on page, event, goal and utm_campaign, or on any dimension of a revenue read; browser, os, exit and lang on a revenue read; a filter on the own dimension of events, goals, exit_pages and of revenue_breakdown by page, event or goal. No filter is dropped silently.",
	notices: {
		summary: "The answer reads the daily summaries.",
		compare_summary: "The compare range reads the daily summaries.",
		"filter_unavailable:<dim>:<reason>": "This filter was not applied. reason not_kept: the summaries keep no such dimension (revenue summaries keep channel, source, utm_campaign, entry, page, country, device, event and goal); combination: it cannot be combined with the report's dimension or the other filters in summaries; negated: the summaries cannot answer this negated operator (page, event, goal and utm_campaign, and every dimension of a revenue read); own: a filter on the report's own dimension (events, goals, exit pages, and the revenue breakdown by page, event or goal).",
		"detail_from:<day>": "The first day of detailed data: a range from that day applies every filter and every report.",
		"summary_other:<dim>": "On some days of the range the summaries hold this filtered dimension's rarer values summed into (other), which a filter cannot match: the figures may be low.",
		"summary_behind:<from>:<to>": "These days have no stored daily summaries yet (the background runs are more than four days behind) and are missing from a summary answer until they catch up.",
	},
	errors: ["raw_only", "narrow_range"],
};

export const SATISFACTION_CATALOG = {
	params: {
		by: SATISFACTION_BY,
		rank: `best | worst: landing pages with at least ${SATISFACTION_MIN_MEASURED} measured sessions ordered by score; only with by entry (the default)`,
	},
	minMeasured: SATISFACTION_MIN_MEASURED,
	pogoDefinition: POGO_DEFINITION,
} as const;

/** Catalog of the `links` report (Links convention, docs/integration.md). */
export const LINKS_CATALOG = {
	tile: true,
	events: LINK_EVENTS,
	params: { by: LINK_BY, slug: "one link; with by: place, its placements", withRevenue: "adds revenue and revenue_currency in params.currency", currency: "ISO 4217 code of the revenue columns" },
	metrics: {
		impressions: "Link keys of view events (s0 to s9, each <slug> or <slug>@<place>).",
		clicks: "Click events of the key.",
		ctr: "clicks / impressions from the sums; 0 without impressions.",
		sessions: "Distinct sessions with a click.",
		conversions: "Sale events of the key, every currency.",
		revenue: "Sum of sale values in the selected currency only (withRevenue).",
	},
	rule: "A range starting before the raw window reads the daily link summaries (notices summary and detail_from:<day>), as does a range over the scan budget (see summaries): by link (all links, one link, or one filter on channel, country or device) and by place; other breakdowns answer raw_only before the window and other filters are named in filter_unavailable:<dim>:<reason>. Each day keeps its top 200 links and places, the rest is (other). A key without a placement counts under (none); a hit without a counted session is (not set) in the session dims. Money of two currencies is never added; data.currencies lists every currency of the sale events.",
} as const;

/** Catalog of the SEO views and the impact view: parameters, the period rule and the fixed texts. */
export const SEO_CATALOG = {
	maxRangeDays: SEO_MAX_RANGE_DAYS,
	coverage: SEO_TEXT.coverage,
	bingNoPairs: SEO_TEXT.bingNoPairs,
	periodRule:
		"n = min(to - from + 1, 93); the current period ends at the newest final (not provisional) day of the selected sources, or yesterday for traffic views; the previous and oldest periods are the n days before, back to back. The response carries periods and the notice provisional_excluded when the end moved.",
	bands: ["1-3", "4-10", "11-20", "21-50", "51+"],
	reports: {
		search_cannibalization: { params: ["source", "minImpressions", "minShare", "includeBrand"], compare: false },
		search_cannibalization_pages: { params: ["source", "minImpressions", "minShare", "includeBrand"], compare: false },
		search_cannibalization_page: { params: ["page", "source", "minImpressions", "minShare", "includeBrand"], compare: false },
		search_cannibalization_query: { params: ["query", "source"], compare: false },
		search_position_bands: { params: ["source", "dim"] },
		search_position_bands_series: { params: ["source", "dim", "metric"] },
		search_position_moves: { params: ["source", "dim", "minImpressions", "list"], periods: 2 },
		search_striking_distance: { params: ["source", "minImpressions", "includeBrand"], estimates: ["potential_clicks"] },
		search_movers: { params: ["source", "dim", "direction", "metric", "minImpressions"], periods: 2 },
		search_decay: { params: ["source", "minImpressions"], periods: 3 },
		traffic_movers: { params: ["direction", "minImpressions"], periods: 2 },
		traffic_decay: { params: ["minImpressions"], periods: 3 },
	},
	estimates: { potential_clicks: { estimate: true, note: SEO_TEXT.striking } },
	impact: {
		params: ["annotation", "kind", "at", "window", "report", "metric", "key", "goal", "scope", "path", "source", "prop", "dim", "context"],
		windows: IMPACT_WINDOWS,
		metrics: IMPACT_METRICS,
		periodRule:
			"The annotation day D is in neither window. after = [D + 1, min(D + window, last complete day)], before = the same number of days ending at D - 1; the last complete day is yesterday, and for search targets also the newest final search day. complete is false while the after window is shorter than window.",
		caution: SEO_TEXT.caution,
	},
	annotationImpacts: {
		params: ["window", "kind", "scopeKind", "q", "withSearch"],
		maxRows: 50,
		maxRowsSmallProfile: 10,
		rule: "One row per annotation of the range, newest first (limit, offset; total counts every match), each measured on its target (or visitors of its scope, Search clicks for a query scope with withSearch) over equal windows as in impact, with verdict up, down, flat, too_early or no_data, good (true when the change is good news; a fall is good for lower-is-better metrics) and overlaps (annotations of an overlapping scope inside the windows). kind and scopeKind filter; q keeps annotations whose title, kind, scope or source slug contains the text (case-insensitive, at most 100 characters). withSearch measures Search targets and needs read:search. Reads only.",
	},
} as const;

/** Metrics computed from passive browser signals; everything else is a count or a ratio of counts. */
export const ESTIMATES: ReadonlySet<string> = new Set(["pogo_stick_rate", "returned_from_search_rate", "search_reentry_rate", "back_nav_rate", "potential_clicks"]);

/** Catalog entries: definition, the estimate flag and, for estimates, the fixed caveat text. */
export const catalogMetrics = () =>
	Object.fromEntries(
		Object.entries(METRICS).map(([k, definition]) => [k, ESTIMATES.has(k) ? { definition, estimate: true, caveat: k === "potential_clicks" ? SEO_TEXT.striking : SATISFACTION_CAVEAT } : { definition, estimate: false }]),
	);

/** The catalog document: `agent/v1/reports`, the admin route `data/catalog` and the MCP tool `analytics_catalog` serve it. */
export function buildCatalog() {
	return {
		reports: REPORT_NAMES.map((name) => ({ name, kind: REPORTS[name][0], scopes: requiredScopes({ report: name }) })),
		dimensions: { traffic: [...Object.keys(TRAFFIC_DIMS), ...REVENUE_DIMS], search: Object.keys(SEARCH_DIMS) },
		ops: [...OPS, ...NUM_OPS],
		params: Object.keys(ParamsSchema.shape),
		metrics: catalogMetrics(),
		seo: SEO_CATALOG,
		revenue: REVENUE_CATALOG,
		behaviour: BEHAVIOUR_CATALOG,
		content: CONTENT_CATALOG,
		links: LINKS_CATALOG,
		satisfaction: SATISFACTION_CATALOG,
		summaries: SUMMARY_CATALOG,
		scopes: SCOPE_LABELS,
		limits: { maxRangeDays: AGENT_MAX_RANGE_DAYS, maxRows: MAX_LIMIT, maxFilters: MAX_FILTERS },
		dashboards: {
			kinds: TILE_KIND_NAMES,
			tileKinds: TILE_KINDS,
			tileMetrics: TILE_METRICS,
			tileParams: TILE_PARAMS,
			ranges: PRESETS.map((p) => p[0]),
			limits: { dashboardsPerSite: MAX_DASHBOARDS_PER_SITE, tiles: MAX_TILES, recordBytes: MAX_RECORD_BYTES, tileFilters: 5, defaultFilters: 10, tileRows: [5, 25], widths: [1, 2, 3] },
		},
	};
}
