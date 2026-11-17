/**
 * The definition behind every info mark of the admin: one short sentence per figure (KPI cards, summary tiles)
 * and per panel (report panels, charts, page sections), plus a second sentence only where a figure is an
 * estimate. No React. `tests/definitions.test.tsx` checks the copy and that every card and panel has one.
 */
import { CAVEATS } from "./caveats.js";
import type { ReportName } from "../query/reports/index.js";
import { POGO_DEFINITION, RETURNED_DEFINITION, SATISFACTION_CAVEAT, SCORE_DEFINITION } from "../query/reports/satisfaction-copy.js";

const BOUNCE = "Share of sessions that were not engaged: active time under the engaged threshold, one page view and no event. Equal to 1 minus engaged rate.";

/** Figures by metric key. Position band keys (`queries_1_3`, `band_51_plus`) are read by `metricDefinition`. */
export const METRIC_DEFINITIONS: Readonly<Record<string, string>> = {
	visitors: CAVEATS.visitors,
	sessions: "Visits with at least one page view; a visit ends after the session window passes without activity.",
	pageviews: "Pages viewed by people in the range.",
	views_per_session: "Page views divided by sessions.",
	bounce_rate: BOUNCE,
	engaged_rate: "Share of sessions with active time of at least the engaged threshold, two or more page views, or any event.",
	avg_duration: CAVEATS.duration,
	entries: "Sessions that started on this page.",
	avg_time: CAVEATS.active_time,
	avg_visible: CAVEATS.visible_time,
	exit_rate: "Share of the page's views that were the last view of their session.",
	realtime: "Sessions active within the realtime window.",
	completions: "Times the goal was reached in the range.",
	converting: "Sessions that reached the goal at least once.",
	conversion_rate: "Sessions that reached the goal, divided by all sessions.",
	conversions: "Sessions that reached a goal.",
	events: "Custom events sent in the range.",
	rate: "Share of sessions that sent this event.",
	measured: "Sessions with a measurable end, where at least one engagement update arrived.",
	measured_rate: CAVEATS.satisfaction_measured,
	avg_engaged: "Average active time per session: time with interaction, not the time the page was open.",
	long_clicks: "Measured sessions longer than the long click time.",
	short_clicks: "Measured sessions at or under the long click time.",
	bad_experiences: "Measured single page sessions without interaction, shorter than the bad experience time.",
	pct_long: "Share of measured sessions longer than the long click time (60 seconds by default).",
	pct_short: "Share of measured sessions at or under the long click time (60 seconds by default).",
	pct_bad: "Share of measured sessions with one page, no interaction and under the bad experience time (10 seconds by default).",
	pogo_sticks: `${POGO_DEFINITION} ${SATISFACTION_CAVEAT}`,
	pogo_stick_rate: `${POGO_DEFINITION} ${SATISFACTION_CAVEAT}`,
	returned_from_search: `${RETURNED_DEFINITION} ${SATISFACTION_CAVEAT}`,
	returned_from_search_rate: `${RETURNED_DEFINITION} ${SATISFACTION_CAVEAT}`,
	search_reentry_rate: `Share of search sessions that a second arrival from a search engine joined. ${SATISFACTION_CAVEAT}`,
	back_nav_rate: `Share of the page's loads that came from the back or forward button. ${SATISFACTION_CAVEAT}`,
	score: SCORE_DEFINITION,
	clicks: "Clicks from Google or Bing search results to the site, as the search engine reports them.",
	impressions: "Times the site appeared in Google or Bing search results.",
	ctr: "Click-through rate: search clicks divided by impressions.",
	position: "Average position in search results, weighted by impressions; 1 is the top.",
	queries: "Search queries that showed the site at least once.",
	pages: "Pages that appeared in search results at least once.",
	share: "Share of all impressions.",
	impressions_share: "Share of all impressions.",
	impressions_1_3: "Impressions in positions 1 to 3.",
	share_1_3: "Share of impressions in positions 1 to 3.",
	ctr_1_3: "Click-through rate of impressions in positions 1 to 3.",
	cannibalized_queries: "Queries for which two or more of the site's pages each get a real share of the impressions.",
	cannibalized_impressions: "Impressions of the queries that two or more pages compete for.",
	visible_share: "Share of all search impressions that the page and query rows cover.",
	moved_up: "Queries whose position band improved against the previous period.",
	moved_down: "Queries whose position band worsened against the previous period.",
	unchanged: "Queries that stayed in the same position band.",
	new: "Queries with impressions now and none in the previous period.",
	lost: "Queries with impressions in the previous period and none now.",
	revenue: "Value of the paid orders in the range, in this currency, before refunds.",
	refunds: "Refunds booked in the range, in this currency.",
	net_revenue: "Revenue minus refunds.",
	orders: "Paid orders in the range, in this currency.",
	aov: "Average order value: revenue divided by orders.",
	revenue_per_visitor: "Revenue divided by all visitors of the range.",
	revenue_per_session: "Revenue divided by all sessions of the range.",
	paying_sessions: "Sessions with at least one order.",
};

const BAND_WORDS: Readonly<Record<string, string>> = { "1_3": "1 to 3", "4_10": "4 to 10", "11_20": "11 to 20", "21_50": "21 to 50", "51_plus": "51 or lower" };

/** The definition of a metric key, position band keys included; undefined when there is none. */
export function metricDefinition(key: string): string | undefined {
	const own = METRIC_DEFINITIONS[key];
	if (own) return own;
	const m = /^(queries|impressions|share|ctr|band)_(\d+_\d+|\d+_plus)$/.exec(key);
	const band = m ? BAND_WORDS[m[2] ?? ""] : undefined;
	if (!m || !band) return undefined;
	if (m[1] === "share") return `Share of impressions in positions ${band}.`;
	if (m[1] === "ctr") return `Click-through rate of impressions in positions ${band}.`;
	if (m[1] === "impressions") return `Impressions in positions ${band}.`;
	return `Queries with an average position of ${band}.`;
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
	timeseries: "The chosen figures per hour, day or week over the selected range.",
	pages: "Page views, visitors, average active time and average visible time for each page.",
	entry_pages: "Sessions by the page they started on, with their bounce rate and duration.",
	exit_pages: "Sessions by the page they ended on, and the share of the page's views that were the last one.",
	not_found: "Requests from people that got a page not found (404) response, by path and referring page.",
	satisfaction: "Long click, short click, bad experience and pogo-sticking rates of measured sessions, grouped by the chosen dimension.",
	satisfaction_series: "The chosen Search Satisfaction rate per day over the selected range.",
	channels: "Sessions grouped by marketing channel, such as Organic Search or Direct, from how each visit started.",
	sources: "Sessions grouped by the referring site or campaign source that started them.",
	campaigns: "Sessions grouped by the UTM campaign tags they started with.",
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
	scroll: "Page views grouped by how far down the page visitors scrolled.",
	dimension_values: "Values of a dimension in the range, offered as filter suggestions.",
	search_overview: "Clicks, impressions, click-through rate and average position from Google or Bing search results.",
	search_queries: "Search queries that showed the site, with their clicks, impressions, CTR and position.",
	search_pages: "Pages shown in search results, with their clicks, impressions, CTR and position.",
	search_countries: "Search clicks and impressions by the searcher's country.",
	search_devices: "Search clicks and impressions by the searcher's device type.",
	search_page_queries: "Search queries that showed this page, with their clicks, impressions, CTR and position.",
	search_cannibalization: "Queries for which two or more of the site's pages each get a real share of the impressions.",
	search_cannibalization_pages: "Pages that compete with other pages of the site for the same queries.",
	search_cannibalization_page: "Queries this page shares with other pages of the site.",
	search_cannibalization_query: "Pages of the site shown for this query, with their share of its impressions.",
	search_position_bands: "Queries and impressions grouped by average position: 1 to 3, 4 to 10, 11 to 20, 21 to 50 and 51 or lower.",
	search_position_bands_series: "Queries in each position band per day or week.",
	search_position_moves: "Queries whose position band improved, worsened or stayed the same against the previous period.",
	search_striking_distance: "Query and page pairs at average position 4 to 20, with the clicks they could gain in positions 1 to 3. Potential clicks are an estimate.",
	search_movers: "Pages or queries with the largest rise or fall in search clicks or impressions against the previous period.",
	search_decay: "Pages that lost the most search clicks against earlier periods.",
	traffic_movers: "Pages with the largest rise or fall in page views against the previous period.",
	traffic_decay: "Pages that lost the most page views against earlier periods.",
	impact: "A figure in equal windows before and after a date, and the change between them.",
	annotation_impacts: "Each annotation's target figure before and after its date, with the change and a verdict.",
	revenue: "Revenue, orders and related figures of paid orders in the selected currency.",
	revenue_series: "Revenue and orders per day or week in the selected currency.",
	revenue_breakdown: "Revenue and orders grouped by the chosen dimension, each credited to the first touch of its visit.",
	revenue_orders: "The newest orders and refunds of the range, with the first touch of their visit.",
	journey_next: "Pages viewed right after this page in the same session.",
	journey_prev: "Pages viewed right before this page in the same session.",
	journey_paths: "The most common sequences of pages viewed in one session.",
	collections: "Page views grouped by the CMS content type of the page.",
	site_search: "Searches made with the site's own search box, by search term.",
	sites_summary: "One row per site with sessions, page views, visitors, bounce rate, engaged rate and revenue.",
	links: "Views, clicks and click-through rate of the site's short links, by link or by the chosen grouping.",
	best_pages: `Landing pages with the highest score. Score: ${SCORE_DEFINITION.charAt(0).toLowerCase()}${SCORE_DEFINITION.slice(1)}`,
	worst_pages: `Landing pages with the lowest score. Score: ${SCORE_DEFINITION.charAt(0).toLowerCase()}${SCORE_DEFINITION.slice(1)}`,
	landing_page: "Search Satisfaction rates and trend of sessions that started on this page.",
	page_search_queries: "Search queries that showed this page in Google or Bing results.",
	capacity: "The capacity profile, database and its health, storage use, detailed data window and write guard of this install.",
	needs_attention: "Problems found in the stored data or the setup, with the next step for each.",
	stored_data: "Rows in each table of stored data, and how long each is kept.",
	requests_not_recorded: "Requests that reached the site but were not stored, by reason.",
	what_is_stored: "Each stored table with its columns and what they hold.",
	revenue_sources: "Revenue grouped by where each order's visit came from.",
	search_connection: "The connection of this Search source and the state of its data sync.",
	impact_before: "The target figure over the window of days before the date; the date itself is in neither window.",
	impact_after: "The target figure over the same number of days after the date.",
	impact_change: "The change from before to after, in percent for counts and in points for rates.",
	move_source: "The database the site wrote to before the switch, and its rows per table when the move started.",
	move_dest: "The database the site writes to now, set in the plugin options. The move copies the older rows into it.",
	move_start: "Copies the rows in chunks, newest summaries first. It runs in the background each minute and faster while this page is open.",
	move_check: "Rows and sums per table, site and day on both sides. Short means rows are missing in the new database.",
	move_remove: "Deletes the copied tables from the old database once the check found nothing missing.",
	link_trend: "Sessions and visitors with at least one short link click, per day or week.",
	pogo_engines: `Pogo-sticking and returned from search rates of search sessions, by search engine. ${SATISFACTION_CAVEAT}`,
};
