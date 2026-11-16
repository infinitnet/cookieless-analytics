/** Fixed texts of the SEO views and the impact view. No SQL, so the admin bundle and the share renderer import it. */

export const SEO_MAX_RANGE_DAYS = 93;
export const POSITION_BANDS = ["1-3", "4-10", "11-20", "21-50", "51+"] as const;
/** Lower bounds of the half-open bands `[1,4)`, `[4,11)`, `[11,21)`, `[21,51)`, `[51,inf)`. */
export const BAND_UPPER = [4, 11, 21, 51] as const;
/** Metric key suffix per band: `queries_1_3`, `impressions_51_plus`. */
export const bandSuffix = (b: string) => b.replace("-", "_").replace("+", "_plus");

export const SEO_TEXT = {
	coverage: "Based on the stored page and query rows. Google omits rare queries and keeps top rows only, so shares are of visible queries.",
	rangeTooLong: "This view reads detailed rows and is limited to 93 days. Choose a shorter range.",
	bingNoPairs: "Bing exposes page and query pairs only per page or per query on request; the lists are Google data",
	bingOnRequest: "Loads from Bing on request, cached one hour.",
	top3Insufficient: "not enough top-3 data",
	estimate: "est.",
	notable: "Notable means the change is larger than twice the square root of the two counts added up. A rule of thumb for counts, not a statistical test.",
	bands: "Bands use the average position of each query or page over the period: 1-3, 4-10, 11-20, 21-50 and 51+.",
	striking: "Pairs at average position 4 to 20. The estimate uses this site's own CTR in positions 1 to 3 over the same range.",
	patterns:
		"Dominant: the best page holds at least 70 percent of the impressions and the best position. Split: no page holds 50 percent. Inverted: the page with the most impressions ranks worse than another page. Shared: anything else.",
	decay: "Pages whose clicks fell in each of three consecutive periods. Position: the position worsened by 2 or more. CTR: the CTR fell under 75 percent with a stable position. Demand: neither, so fewer searches.",
	compareNotSupported: "These views compare periods on their own; the compare option does not apply.",
	caution: "Before and after comparisons show correlation, not causation. Seasonality, other changes and search engine updates overlap; annotations in the same window are listed.",
	noAnnotation: "No annotation yet",
} as const;

export const PATTERN_LABELS: Record<string, string> = { dominant: "Dominant", split: "Split", inverted: "Inverted", shared: "Shared" };
export const DIAGNOSIS_LABELS: Record<string, string> = { position: "Position", ctr: "CTR", demand: "Demand" };

/**
 * The period line of the two- and three-period views, for example
 * "Comparing 2026-10-14 to 2026-11-10 with the 28 days before; the newest 3 days are excluded as provisional".
 */
export function periodLine(p: SeoPeriods | undefined): string {
	if (!p) return "";
	const n = p.days;
	const base = `Comparing ${p.current.from} to ${p.current.to} with the ${n} days before${p.oldest ? ` and the ${n} days before that` : ""}`;
	if (p.excluded <= 0) return base;
	return `${base}; the newest ${p.excluded} day${p.excluded === 1 ? " is" : "s are"} excluded as ${p.reason}`;
}

/** The `periods` object of the two- and three-period reports. */
export interface SeoPeriods {
	current: { from: string; to: string };
	previous: { from: string; to: string };
	oldest?: { from: string; to: string };
	/** Days per period. */
	days: number;
	/** Days at the end of the requested range left out. */
	excluded: number;
	reason: "provisional" | "incomplete";
}

/** Impact windows offered by the panel and accepted by the report. */
export const IMPACT_WINDOWS = [7, 14, 28, 60, 90] as const;
/** Target reports of `impact`: reports that return totals or rows. */
export const IMPACT_REPORTS = [
	"overview",
	"channels",
	"sources",
	"campaigns",
	"pages",
	"entry_pages",
	"countries",
	"devices",
	"browsers",
	"goals",
	"events",
	"satisfaction",
	"search_overview",
	"search_pages",
	"search_queries",
	"search_countries",
	"search_devices",
	"search_position_bands",
	"revenue",
] as const;
export type ImpactReport = (typeof IMPACT_REPORTS)[number];
/** Count metrics get `notable`; everything else shows its denominators. */
export const COUNT_METRICS: ReadonlySet<string> = new Set(["sessions", "visitors", "pageviews", "events", "conversions", "completions", "converting", "clicks", "impressions", "bounces", "long_clicks", "short_clicks", "bad_experiences", "pogo_sticks", "returned_from_search", "measured", "queries", "pages", "count", "orders"]);

const SESSION = ["sessions", "visitors", "pageviews", "bounce_rate", "engaged_rate", "avg_duration", "views_per_session"];
const SEARCH = ["clicks", "impressions", "ctr", "position"];
const BAND_TOTALS = POSITION_BANDS.flatMap((b) => ["queries", "impressions", "share", "ctr"].map((m) => `${m}_${bandSuffix(b)}`));

/** Metric keys `impact` accepts per target report; the panel's pickers read the same list. */
export const IMPACT_METRICS: Record<ImpactReport, readonly string[]> = {
	overview: SESSION,
	channels: SESSION,
	sources: SESSION,
	campaigns: SESSION,
	countries: SESSION,
	devices: SESSION,
	browsers: SESSION,
	entry_pages: ["entries", "visitors", "pageviews", "bounce_rate", "engaged_rate", "avg_duration", "views_per_session"],
	pages: ["pageviews", "visitors", "avg_time", "exit_rate"],
	goals: ["completions", "converting", "conversion_rate"],
	events: ["events", "sessions", "rate"],
	satisfaction: ["sessions", "measured", "avg_duration", "long_clicks", "short_clicks", "bad_experiences", "pogo_sticks", "returned_from_search", "pct_long", "pct_short", "pct_bad", "pogo_stick_rate", "returned_from_search_rate", "search_reentry_rate", "back_nav_rate"],
	search_overview: SEARCH,
	search_pages: SEARCH,
	search_queries: SEARCH,
	search_countries: SEARCH,
	search_devices: SEARCH,
	search_position_bands: [...BAND_TOTALS, "queries", "pages", "impressions", "clicks", "ctr", "impressions_share"],
	// `notable` applies to orders only; amounts and ratios carry their denominators.
	revenue: ["revenue", "orders", "aov", "revenue_per_visitor", "revenue_per_session"],
};

/** The breakdown dimension of a row report's key: `impact` filters the target by it so the row is always present. */
export const IMPACT_KEY_DIM: Partial<Record<ImpactReport, string>> = {
	channels: "channel",
	sources: "source",
	campaigns: "utm_campaign",
	countries: "country",
	devices: "device",
	browsers: "browser",
	entry_pages: "entry",
	pages: "page",
	events: "event",
	search_pages: "page",
	search_queries: "query",
	search_countries: "country",
	search_devices: "device",
};
