/**
 * The definition behind every info mark of the admin: one short sentence per figure (KPI cards, summary tiles)
 * and per panel (report panels, charts, page sections), plus a second sentence only where a figure is an
 * estimate. No React. `tests/definitions.test.tsx` checks the copy and that every card and panel has one.
 */
import { CAVEATS } from "./caveats.js";
import type { ReportName } from "../query/reports/index.js";
import { SATISFACTION_MIN_MEASURED, SCORE_DEFINITION } from "../query/reports/satisfaction-copy.js";

const EXIT_RATE = "Exits divided by the page's views. Blank in summary data under a channel, country or device filter, and for pages folded into (other) on some days.";
const CANNIBALIZED = "Queries with two or more pages that each hold at least the share floor (10 percent by default) of the query's impressions. Google data.";
const BOUNCE = "Share of sessions that were not engaged: active time under the engaged threshold, one page view and no event, custom or automatic. Equal to 1 minus engaged rate.";

/** Figures by metric key. Position band keys (`queries_1_3`, `band_51_plus`) are read by `metricDefinition`. */
export const METRIC_DEFINITIONS: Readonly<Record<string, string>> = {
	visitors: CAVEATS.visitors,
	sessions: "Visits with at least one page view, counted on the day they started; a visit ends after the session window passes without activity.",
	pageviews: "Page views of the sessions that started in the range and match the filters; a reload within the dedupe time counts once.",
	views_per_session: "Page views divided by sessions.",
	bounce_rate: BOUNCE,
	engaged_rate: "Share of sessions with active time of at least the engaged threshold, two or more page views, or any event, custom or automatic.",
	avg_duration: CAVEATS.duration,
	entries: "Sessions that started on this page.",
	avg_time: CAVEATS.active_time,
	avg_visible: CAVEATS.visible_time,
	exit_rate: EXIT_RATE,
	realtime: "Sessions with a page view or event within the realtime window (5 minutes by default).",
	completions: "Times the goal was reached in the range.",
	converting: "Sessions that reached the goal at least once.",
	conversion_rate: "Sessions that reached the goal, divided by the sessions of the range under the same filters.",
	conversions: "Sales reported for short links (conv events) in the range, in every currency.",
	events: "Custom events sent in the range.",
	rate: "Sessions that sent this event, divided by the sessions of the range under the same filters.",
	scroll_median: "Median of the deepest scroll position per page view, in percent of the page height; a page that fits the screen counts as 100. Detailed data only.",
	// Search Satisfaction: every rate and the score are shares of measured organic search sessions.
	measured: "Organic search sessions with a measurable end, where at least one engagement update arrived.",
	measured_rate: "Share of organic search sessions with a measurable end, where an engagement update arrived. Every rate and the score count only these sessions.",
	avg_engaged: "Average active time per measured organic search session: time with interaction, not the time the page was open.",
	long_clicks: "Measured organic search sessions that lasted longer than the long click time (60 seconds by default).",
	short_clicks: "Measured organic search sessions that lasted at most the long click time (60 seconds by default).",
	bad_experiences: "Measured organic search sessions with one page view, no event, no interaction and under the bad experience time (10 seconds by default).",
	pct_long: "Share of measured organic search sessions that lasted longer than the long click time (60 seconds by default).",
	pct_short: "Share of measured organic search sessions that lasted at most the long click time (60 seconds by default).",
	pct_bad: "Share of measured organic search sessions with one page view, no event, no interaction and under the bad experience time (10 seconds by default).",
	pogo_stick_rate: "Share of measured organic search sessions with one page view and no event, at or under the long click time, whose page was left with Back or Forward. An estimate.",
	pogo_sticks: "Measured organic search sessions with one page view and no event, at or under the long click time, whose page was left with Back or Forward. An estimate.",
	returned_from_search_rate: "Share of measured organic search sessions that left the landing page with Back or Forward and then came again from a search engine. A part of Search re-entry. An estimate.",
	returned_from_search:
		"Measured organic search sessions that left the landing page with Back or Forward and then came again from a search engine. A part of the search re-entry sessions. An estimate.",
	search_reentry_rate:
		"Share of measured organic search sessions that came again from a search engine. Returned from search is the part that left the landing page with Back or Forward first. An estimate.",
	reentered: "Measured organic search sessions that came again from a search engine, whichever way the landing page was left. An estimate.",
	back_nav_rate: "Share of this page's full loads in organic search sessions that came from Back or Forward. A page restored without a reload is not a load, so a lower bound. An estimate.",
	score: SCORE_DEFINITION,
	clicks: "Clicks from Google or Bing search results to the site, as the search engine reports them.",
	impressions: "Times the site appeared in Google or Bing search results.",
	ctr: "Click-through rate: search clicks divided by impressions.",
	position: "Average position in search results, weighted by impressions; 1 is the top.",
	queries: "Search queries that showed the site at least once.",
	pages: "Pages that appeared in search results at least once.",
	impressions_share: "This band's impressions, divided by the impressions of all listed queries or pages.",
	cannibalized_queries: CANNIBALIZED,
	cannibalized_impressions: "Impressions of the competing pages of those queries; pages under the share floor are left out.",
	visible_share: "Share of Google's total impressions that the stored page and query rows cover.",
	moved_up: "Queries at or above the impressions floor in both periods whose position band improved.",
	moved_down: "Queries at or above the impressions floor in both periods whose position band worsened.",
	unchanged: "Queries at or above the impressions floor in both periods whose position band stayed the same.",
	new: "Queries with impressions at or above the floor now and below it in the previous period.",
	lost: "Queries with impressions at or above the floor in the previous period and below it now.",
	revenue: "Sum of the order values recorded in the range, in this currency, before refunds.",
	refunds: "Refunds booked in the range, in this currency.",
	net_revenue: "Revenue minus refunds.",
	orders: "Orders recorded in the range in this currency: events sent with a value, zero included. A refund leaves the count unchanged.",
	aov: "Average order value: revenue before refunds divided by orders.",
	revenue_per_visitor: "Revenue divided by the visitors of the range under the same filters, buyers or not.",
	revenue_per_session: "Revenue divided by the sessions of the range under the same filters.",
	paying_sessions: "Sessions with at least one order in this currency.",
	potential_clicks: "Clicks a pair could gain at this site's own CTR below position 4 over the same range. An estimate.",
};

/** Position bands are half open on the average position: [1, 4), [4, 11), [11, 21), [21, 51) and 51 on. */
const BAND_WORDS: Readonly<Record<string, string>> = { "1_3": "below 4", "4_10": "4 to below 11", "11_20": "11 to below 21", "21_50": "21 to below 51", "51_plus": "51 and beyond" };

/**
 * Search Satisfaction columns whose key other reports use with another meaning (`sessions`, `avg_duration`), and the
 * measured sessions of the search engine table in the page drawer. Read through `satisfactionDefinition`.
 */
export const SATISFACTION_DEFINITIONS = {
	sessions: "Organic search sessions in the range. The line below counts those with a measurable end.",
	avg_duration: "Average duration per organic search session, measured or not: the longer of the visit span and the visible time. Not interaction time.",
	engine_measured: "Organic search sessions from this search engine with a measurable end: the base of both rates in this table.",
} as const;

/** The definition of a Search Satisfaction column: its own text where the key means something else elsewhere, else the metric's. */
export const satisfactionDefinition = (key: string): string | undefined => (SATISFACTION_DEFINITIONS as Readonly<Record<string, string>>)[key] ?? metricDefinition(key);

/** The definition of a metric key, position band keys included; undefined when there is none. */
export function metricDefinition(key: string): string | undefined {
	const own = METRIC_DEFINITIONS[key];
	if (own) return own;
	const m = /^(queries|impressions|share|ctr|band)_(\d+_\d+|\d+_plus)$/.exec(key);
	const band = m ? BAND_WORDS[m[2] ?? ""] : undefined;
	if (!m || !band) return undefined;
	if (m[1] === "share") return `Share of impressions that belong to queries or pages whose average position falls in the band ${band}.`;
	if (m[1] === "ctr") return `Click-through rate of the queries or pages whose average position falls in the band ${band}.`;
	if (m[1] === "impressions") return `Impressions of the queries or pages whose average position in the range falls in the band ${band}.`;
	if (m[1] === "band") return `Queries or pages, or their impressions (the chosen metric), whose average position falls in the band ${band}, per day or week.`;
	return `Queries whose average position in the range falls in the band ${band}.`;
}

/** Cards and columns of the Links page: each figure counts short link events only. */
export const LINK_DEFINITIONS = {
	sessions: "Sessions with at least one page view and a short link click.",
	visitors: "Distinct visitors per day with at least one page view and a short link click, added up over the range.",
	impressions: "Link keys of seen events: each time a page listed this short link.",
	clicks: "Clicks on this short link (out events), from a redirect or a link rule.",
	ctr: "Clicks divided by impressions; 0 without impressions.",
	conversions: "Sales reported for this short link (conv events), in every currency.",
	revenue: "Revenue is the sum of the reported sales in this currency, before refunds.",
} as const;

/** Columns whose figure in a table means something narrower than the metric key in general. */
export const COLUMN_DEFINITIONS = {
	visitors: "Distinct visitors per day and row, added up over the range; a person can appear in several rows.",
	page_visitors: "Distinct visitors per day who viewed this page, added up over the range.",
	exits: "Sessions whose last page view was this page.",
	hits: "Requests from people that got a 404 response, counted on the day of the request.",
	search_impressions: "Times this page appeared in Google or Bing search results over the same range; the three newest days are provisional.",
	search_clicks: "Clicks from Google or Bing search results to this page over the same range; the three newest days are provisional.",
	search_ctr: "Search clicks divided by search impressions of this page over the same range.",
	search_position: "Average position of this page in Google or Bing search results, weighted by impressions; 1 is the top.",
	revenue_first_touch: "Revenue of the orders whose visit started from this row, before refunds; orders without a counted visit are under (not set).",
	revenue_page: "Revenue of the orders recorded on this page (the page that sent the order event), before refunds.",
	revenue_visit: "Revenue of the orders whose visit came from this country (or device), before refunds.",
	revenue_order_event: "Revenue of the orders sent as this event, before refunds.",
	revenue_order_goal: "Revenue of the orders that match this goal, before refunds; one order can count for several goals.",
	orders_row: "Orders of this row in this currency: events sent with a value, zero included.",
	revenue_share: "This row's revenue divided by the revenue of the range in this currency; goal rows can add up to more than 100 percent.",
	revenue_per_visitor_row: "Revenue of the row divided by the visitors of the row.",
	drop_off: "Share of the sessions of the previous step that did not reach this step.",
	conversion: "Sessions that reached this step, divided by the sessions that reached step 1.",
	journey_share: "Sessions that took this step, divided by the sessions that viewed the selected page.",
	event_sessions: "Sessions that sent this event at least once.",
	event_count: "Times this event was sent in the range.",
	overlapping_queries_pct: "Overlapping queries divided by all queries of the page.",
	overlapping_impressions_pct: "Impressions of the overlapping queries divided by all impressions of the page.",
	striking_ctr: "CTR of the Google query and page pairs with an average position below 4, over the same range.",
} as const;

/** The definition of a KPI tile: a Search Satisfaction tile counts organic search sessions only. */
export function tileDefinition(report: string, key: string): string | undefined {
	if (report === "satisfaction" || report === "satisfaction_series") return key === "sessions" ? "Organic search sessions with at least one page view." : satisfactionDefinition(key);
	return metricDefinition(key);
}

/** The Best and Worst pages panels. */
function rankDefinition(order: "highest" | "lowest"): string {
	return `Landing pages with the ${order} score, among pages with at least the minimum of measured sessions (${SATISFACTION_MIN_MEASURED} by default). Score: long clicks minus bad experience minus pogo-sticking.`;
}

/** Panels of the admin that are not one report. */
export type PanelId =
	| "best_pages"
	| "worst_pages"
	| "landing_page"
	| "page_search_queries"
	| "capacity"
	| "needs_attention"
	| "stored_data"
	| "requests_not_recorded"
	| "what_is_stored"
	| "revenue_sources"
	| "search_connection"
	| "pogo_engines"
	| "link_trend"
	| "impact_before"
	| "impact_after"
	| "impact_change"
	| "move_source"
	| "move_dest"
	| "move_start"
	| "move_check"
	| "move_remove";

/** Panels by report name (every report, so the compiler finds a new one) and by panel id. */
export const PANEL_DEFINITIONS: Readonly<Record<ReportName | PanelId, string>> = {
	overview: "Visitors, sessions and engagement of the site over the selected range.",
	timeseries: "The chosen figures per hour, day or week. A session and all its page views count in the bucket in which the session started.",
	pages: "Page views, visitors, average active time and average visible time for each page.",
	entry_pages: "Sessions by the page they started on, with their bounce rate and duration.",
	exit_pages: "Sessions by the page they ended on, and the share of the page's views that were the last one.",
	not_found: "Requests from people that got a page not found (404) response, by path and referring page.",
	satisfaction: "Search Satisfaction figures of organic search sessions, grouped by the chosen dimension; every rate is a share of the measured sessions.",
	satisfaction_series: "The chosen Search Satisfaction rate of organic search sessions per day over the selected range.",
	channels: "Sessions grouped by marketing channel, such as Organic Search or Direct, from how each visit started.",
	sources: "Sessions grouped by the referring site or campaign source that started them.",
	campaigns: "Sessions grouped by the chosen UTM tag they started with; sessions without that tag are left out.",
	ai_referrals: "Sessions that started from an AI assistant such as ChatGPT, by assistant.",
	countries: "Sessions grouped by the visitor's country.",
	regions: "Sessions grouped by the visitor's region.",
	devices: "Sessions grouped by device type: desktop, mobile or tablet.",
	browsers: "Sessions grouped by browser.",
	os: "Sessions grouped by operating system.",
	languages: "Sessions grouped by the browser's preferred language.",
	events: "Custom events by name, with the sessions that sent them.",
	event_props: "Values of one event property, with how often each was sent.",
	goals: "Completions, converting sessions and conversion rate of each goal.",
	funnels: "Sessions that reached each step of the funnel, and where they dropped off.",
	outbound: "Clicks on links to other sites, by link address.",
	downloads: "Clicks on file download links, by file.",
	forms: "Form submissions, by form.",
	scroll: "Page views by deepest scroll position: each row holds the views that reached that depth and stayed below the next. Share is of the views with a scroll measurement.",
	dimension_values: "Values of a dimension in the range, offered as filter suggestions.",
	search_overview: "Clicks, impressions, click-through rate and average position from Google or Bing search results.",
	search_queries: "Search queries that showed the site, with their clicks, impressions, CTR and position.",
	search_pages: "Pages shown in search results, with their clicks, impressions, CTR and position.",
	search_countries: "Search clicks and impressions by the searcher's country.",
	search_devices: "Search clicks and impressions by the searcher's device type.",
	search_page_queries: "Search queries that showed this page, with their clicks, impressions, CTR and position.",
	search_cannibalization: CANNIBALIZED,
	search_cannibalization_pages: "Pages that compete with other pages of the site for the same queries.",
	search_cannibalization_page: "Queries this page shares with other pages of the site.",
	search_cannibalization_query: "Pages of the site shown for this query, with their share of its impressions.",
	search_position_bands: "Queries or pages and their impressions grouped by average position in the range: below 4, 4 to below 11, 11 to below 21, 21 to below 51, and 51 and beyond.",
	search_position_bands_series: "Queries or pages, or their impressions, in each position band per day or week.",
	search_position_moves: "Queries whose position band improved, worsened or stayed the same against the previous period.",
	search_striking_distance: "Google query and page pairs with an average position from 4 to below 21, with the clicks they could gain at this site's own top band CTR. Potential clicks are an estimate.",
	search_movers: "Pages or queries with the largest rise or fall in search clicks or impressions against the previous period.",
	search_decay: "Pages whose search clicks fell from the oldest to the middle period and again to the current one, ordered by the clicks lost.",
	traffic_movers: "Pages with the largest rise or fall in page views against the previous period.",
	traffic_decay: "Pages whose page views fell from the oldest to the middle period and again to the current one, ordered by the views lost.",
	impact: "A figure in equal windows before and after a date, and the change between them.",
	annotation_impacts: "Each annotation's target figure in equal windows before and after its date, with a verdict. Flat: inside the noise rule for counts, or a move under 5 percent for rates.",
	revenue: "Revenue, orders and related figures of the orders recorded in the range, in one currency: the selected one, or the site default on Overview.",
	revenue_series: "Revenue and orders per day or week in the selected currency.",
	revenue_breakdown: "Revenue and orders grouped by the chosen dimension: by the first touch of the order's visit, or by the page, event or goal of the order itself.",
	revenue_orders: "The newest orders and refunds of the range, 50 at most, with the channel, entry page and country of their visit.",
	journey_next: "Pages viewed right after this page in the same session.",
	journey_prev: "Pages viewed right before this page in the same session.",
	journey_paths: "The most common first three pages of a session, starting at its entry page.",
	collections: "Page views grouped by the CMS content type of the page.",
	site_search: "Searches made with the site's own search box, by search term.",
	sites_summary: "One row per site with sessions, page views, visitors, bounce rate and revenue before refunds.",
	links: "Impressions, clicks and click-through rate of the site's short links, by link or by the chosen grouping.",
	best_pages: rankDefinition("highest"),
	worst_pages: rankDefinition("lowest"),
	landing_page: "Search Satisfaction rates and trend of organic search sessions that started on this page.",
	page_search_queries: "Search queries that showed this page in Google or Bing results.",
	capacity: "The capacity profile, database and its health, storage use, detailed data window and write guard of this install.",
	needs_attention: "Problems found in the stored data or the setup, with the next step for each.",
	stored_data: "Rows in each table of stored data, and how long each is kept.",
	requests_not_recorded: "Requests that reached the site but were not stored, by reason.",
	what_is_stored: "Each stored table with its columns and what they hold.",
	revenue_sources: "Revenue grouped by the first touch of each order's visit, and by the page, event and goal of the order itself.",
	search_connection: "The connection of this Search source and the state of its data sync.",
	impact_before: "The target figure over the same number of days ending the day before the date; the date itself is in neither window.",
	impact_after: "The target figure over the days after the date, up to the window and the last complete day.",
	impact_change: "The change from before to after: percent for counts, amounts and durations, percentage points for rates, positions for Search position.",
	move_source: "The database the site wrote to before the switch, and its rows per table when the move started.",
	move_dest: "The database the site writes to now, set in the plugin options. The move copies the older rows into it.",
	move_start: "Copies the rows in chunks, newest summaries first. It runs in the background each minute and faster while this page is open.",
	move_check: "Rows and sums per table, site and day on both sides. Short means rows are missing in the new database.",
	move_remove: "Deletes the copied tables from the old database once the check found nothing missing.",
	link_trend: "Sessions and visitors with at least one short link click, per hour, day or week.",
	pogo_engines: "Pogo-sticking and returned from search rates of the measured organic search sessions that landed on this page, by search engine. Both are estimates.",
};
