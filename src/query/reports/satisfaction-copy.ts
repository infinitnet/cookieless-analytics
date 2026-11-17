/** Fixed Satisfaction texts, shared by the reports, the agent catalog and the admin without pulling in SQL code. */

/** Typed `raw_only` text beyond the raw window. */
export const SATISFACTION_RAW_ONLY =
	"Search Satisfaction is computed from session rows, which are kept for the raw retention window only. Choose a more recent range or raise the raw retention.";

/** Caveat of the estimates (pogo-sticking, returned from search, search re-entry, back/forward loads). */
export const SATISFACTION_CAVEAT = "An estimate from browser navigation signals.";

/** One sentence that defines pogo-sticking, shown in the info text of every pogo-sticking figure. */
export const POGO_DEFINITION = "Pogo-sticking: a visitor from a search engine leaves the landing page quickly with the back button and returns to the results.";

/** One sentence that defines the stronger signal "Returned from search" (docs/sessions.md). */
export const RETURNED_DEFINITION = "Returned from search: a search visitor left the landing page with back or forward and came again from a search engine in one session.";

/** Groupings of the `satisfaction` report (`params.by`); `entry` is the landing page. */
export const SATISFACTION_BY = ["entry", "channel", "source", "device", "country", "browser"] as const;
export type SatisfactionBy = (typeof SATISFACTION_BY)[number];

/** Fewest measured sessions a landing page needs to be ranked as a best or worst page (`params.rank`). */
export const SATISFACTION_MIN_MEASURED = 30;

/** How the best and worst pages are ranked (docs/sessions.md "Best and worst pages"). */
export const SCORE_DEFINITION = `Long click rate minus bad experience rate minus pogo-sticking rate, in points, for landing pages with at least ${SATISFACTION_MIN_MEASURED} measured sessions.`;
