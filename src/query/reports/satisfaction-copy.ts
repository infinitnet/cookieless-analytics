/** Fixed Satisfaction texts, shared by the reports, the agent catalog and the admin without pulling in SQL code. */
import type { Filter } from "../filters.js";

/** The scope of the Search Satisfaction reports: organic search sessions of every search engine. */
export const ORGANIC_SEARCH: Filter = { dim: "channel", op: "is", values: ["Organic Search"] };

/**
 * Filters of a Search Satisfaction run: the scope first, every channel filter of the caller left out (the report
 * answers the notice `ignored_dim:channel` for it). Other filters narrow inside the scope.
 */
export const organicScope = (filters: readonly Filter[]): Filter[] => [ORGANIC_SEARCH, ...filters.filter((f) => f.dim !== "channel")];

/** True for a channel filter that is not the scope itself: the one the report leaves out and says so. */
export const conflictsWithScope = (f: Filter): boolean => f.dim === "channel" && !(f.op === "is" && f.values.length === 1 && f.values[0] === ORGANIC_SEARCH.values[0]);

/** The reports that cover organic search sessions only. */
export const SATISFACTION_REPORTS: ReadonlySet<string> = new Set(["satisfaction", "satisfaction_series"]);

/** Typed `raw_only` text beyond the raw window. */
export const SATISFACTION_RAW_ONLY =
	"Search Satisfaction is computed from session rows, which are kept for the raw retention window only. Choose a more recent range or raise the raw retention.";

/** Caveat of the estimates (pogo-sticking, returned from search, search re-entry, back/forward loads). */
export const SATISFACTION_CAVEAT = "An estimate from browser navigation signals.";

/** One sentence that defines pogo-sticking (agent catalog `pogoDefinition`, docs/sessions.md). */
export const POGO_DEFINITION = "Pogo-sticking: a search visitor views one page, sends no event and leaves it with Back or Forward within the long click time.";

/** One sentence that defines the stronger signal "Returned from search" (docs/sessions.md). */
export const RETURNED_DEFINITION = "Returned from search: a search visitor left the landing page with Back or Forward and then came again from a search engine in the same session.";

/** Groupings of the `satisfaction` report (`params.by`); `entry` is the landing page. */
export const SATISFACTION_BY = ["entry", "source", "device", "country", "browser"] as const;
export type SatisfactionBy = (typeof SATISFACTION_BY)[number];

/**
 * Default of the setting `satisfactionMinMeasured`: fewest measured sessions a landing page needs to be ranked as a
 * best or worst page (`params.rank`); a score under it is marked `low_sample`.
 */
export const SATISFACTION_MIN_MEASURED = 30;

/** The note under a score that rests on fewer measured sessions than the sample minimum (`low_sample`). */
export const LOW_SAMPLE = "low sample";

/** The line under a Score number tile whose figure is `low_sample`. */
export const lowSampleLine = (min: number) => `Low sample: under ${min} measured sessions, the sample minimum.`;

/** The score of a row (docs/sessions.md "Best and worst pages"). */
export const SCORE_DEFINITION = `Long click rate minus bad experience rate minus pogo-sticking rate, in points. Marked low sample under the minimum of measured sessions (${SATISFACTION_MIN_MEASURED} by default).`;
