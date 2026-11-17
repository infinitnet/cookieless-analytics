/** Fixed caveat and notice texts, shared by the admin info markers and the shared page. No React. */
import { POGO_DEFINITION, RETURNED_DEFINITION, SATISFACTION_CAVEAT, SCORE_DEFINITION } from "../query/reports/satisfaction-copy.js";
import { SEO_TEXT } from "../query/reports/seo-copy.js";

/** Notice texts of the SEO views and the impact view. */
export const SEO_NOTICES: Record<string, string> = {
	bing_no_pairs: `${SEO_TEXT.bingNoPairs}.`,
	top3_insufficient: "Potential clicks need at least 1,000 impressions in positions 1 to 3 over this range; not enough top-3 data.",
	scope_host_not_applied: "Host rules do not apply to Search data; this comparison is not limited by host.",
	capped: "The list shows the 200 queries with the most impressions; the totals count every query.",
	metric_unavailable: "This report has no value for this metric here; pick a row or another metric.",
	scope_query_not_applied: "Query rules apply to Search data only; this comparison is site-wide. Pick a Search metric to compare the query.",
};

export const CAVEATS = {
	visitors: "Distinct visitors per day, added up over the range, so a person who returns on another day counts again.",
	nat: "People who share one network address and the same browser family on the same day can count as one visitor.",
	searchLag: "Search data arrives 2 to 3 days late. The three newest days are provisional and are replaced on the next sync.",
	rollup: "This range is answered from daily summaries: it starts before the detailed data window, or it is too long to read in detail. Some filters do not apply to summaries.",
	satisfaction_estimate: "Pogo-sticking, returned from search, search re-entry and back/forward loads are estimates from browser navigation signals.",
	pogo: `${POGO_DEFINITION} ${SATISFACTION_CAVEAT}`,
	returned: `${RETURNED_DEFINITION} ${SATISFACTION_CAVEAT}`,
	satisfaction_score: SCORE_DEFINITION,
	active_time: "Active time counts only while the visitor interacts, so a page that is open but untouched shows 0 s. See Avg. duration for visible time.",
	duration: "Time the page was visible, whichever is longer of the visit span and the visible time. Not interaction time.",
	visible_time: "Time the page was visible per page view, whether or not the visitor interacted. Kept in detailed data only, so summary ranges leave it blank.",
	satisfaction_measured: "Share of sessions with a measurable end, where at least one engagement update arrived; the rates count only these sessions.",
} as const;
export type Caveat = keyof typeof CAVEATS;

/** Notices of the collections and site search reports. */
export const SITE_NOTICES = {
	not_available_for_site: "This report reads the content types of this site's CMS; a client site has none.",
	site_search_off: "Site search is off. Add the query parameter names of your site search (for example q or s) in the plugin settings, or for a client site on the Sites tab.",
	site_search_capped: "Only the 5,000 most frequent search strings of this range were read.",
} as const;

/** What the admin adds to the copy: readable dimension names, and the dimensions filtered in the view. */
export interface NoticeCtx {
	label?: (dim: string) => string;
	filtered?: readonly string[];
}
const dimName = (c: NoticeCtx, d: string) => c.label?.(d) ?? d.replace(/_/g, " ");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A label inside a sentence: "Country" reads "country", "UTM source" keeps its capitals. */
const low = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** The reason of a filter that summary data cannot apply (`filter_unavailable:<dim>:<reason>`), shown on its chip and in the notice. */
export function filterReason(dim: string, reason: string, c: NoticeCtx = {}): string {
	const name = cap(dimName(c, dim));
	if (reason === "negated") return `${name} cannot be excluded in summary data.`;
	if (reason === "own") return `${name} cannot filter this report in summary data.`;
	if (reason !== "combination") return `${name} is not kept in summary data.`;
	const others = [...new Set((c.filtered ?? []).filter((d) => d !== dim))].map((d) => low(dimName(c, d)));
	return `${name} cannot be combined with ${others.length ? others.join(" and ") : "the other filters"} in summary data.`;
}

/**
 * Copy of every notice code a report can return (`code`, or `code:arg:arg`), one table for the admin, the shared page
 * and email; `tests/copy.test.ts` fails when a reader returns a code missing here. `null`: the code's own view shows it
 * with its figures (the Impact panel, the SEO coverage line).
 */
export const NOTICE_COPY: Record<string, ((args: readonly string[], c: NoticeCtx) => string) | null> = {
	summary: () => CAVEATS.rollup,
	compare_summary: () => "The comparison range is answered from daily summaries.",
	detail_from: ([day]) => `Detailed data starts on ${day}. A range from that day applies every filter.`,
	summary_other: ([dim = ""], c) => `Some ${dimName(c, dim)} values were summed into (other) on some days of this range, so the filter cannot match them there and these figures may be low.`,
	summary_behind: ([from, to]) => `The daily summaries are not stored yet for ${from === to ? from : `${from} to ${to}`}, so ${from === to ? "that day is" : "those days are"} missing from these totals until the background runs catch up.`,
	filter_unavailable: ([dim = "", reason = ""], c) => filterReason(dim, reason, c),
	ignored_dim: ([dim = ""], c) => `${cap(dimName(c, dim))} does not apply to this report.`,
	revenue_not_available: () => "Revenue is left out: the daily summaries cannot apply these filters to orders.",
	top_paths_per_day: () => "Daily summaries keep the top paths per day, so rare steps and paths are not counted here.",
	granularity_day: () => "Hourly detail is not kept for this range; the chart shows days.",
	exit_rate_partial: () => "Exit rate is blank for pages whose exits or page views were folded into other pages on some days of this range.",
	filters_not_applied: () => "Some filters do not apply to this report.",
	segment_missing: () => "The default segment of this dashboard was deleted; this tile shows all visitors.",
	compare_segment_missing: () => "The compare segment of this dashboard was deleted; this tile shows no comparison.",
	not_available_for_site: () => SITE_NOTICES.not_available_for_site,
	site_search_off: () => SITE_NOTICES.site_search_off,
	site_search_capped: () => SITE_NOTICES.site_search_capped,
	provisional_excluded: () => "The newest Search days are provisional, so the period ends at the newest final day.",
	scope_no_search_source: () => "Query rules apply to Search data only; this site has no Search source yet.",
	...Object.fromEntries(Object.entries(SEO_NOTICES).map(([k, t]) => [k, () => t])),
	coverage: null,
	no_annotation: null,
	not_yet: null,
	incomplete: null,
	// Annotations page: shown by its own notice and row text.
	search_lags: null,
	search_no_data: null,
};

/** The text of one notice code, or null (unknown, or shown by its own view). */
export function noticeCopy(code: string, c: NoticeCtx = {}): string | null {
	const [head = "", ...args] = code.split(":");
	return NOTICE_COPY[head]?.(args, c) ?? null;
}

/** Readable texts of a report's notices, in order, without repeats; the compare side's engine only when the current side is detailed. */
export function noticeText(notices: readonly string[], c: NoticeCtx = {}): string[] {
	const out: string[] = [];
	for (const n of notices) {
		if (n === "compare_summary" && notices.includes("summary")) continue;
		const t = noticeCopy(n, c);
		if (t && !out.includes(t)) out.push(t);
	}
	return out;
}
