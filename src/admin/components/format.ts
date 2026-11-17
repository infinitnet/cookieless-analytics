/** Number formats shared by cards, tables and charts. Rates are fractions (0.25 = 25 %), durations seconds. */

import type { Format } from "../../charts/geometry.js";

export { type Format, fmt } from "../../charts/geometry.js";
/** An exact count with thousands separators (61,204): row counts, pagers, budgets. `fmt` compacts from 100,000 up. */
export const count = (n: number) => n.toLocaleString("en-US");
/** One change formatter for cards, tables, tiles and email; it lives with the chart kit so the server renderers share it. */
export { type Change, changeText, describeChange, LOWER_IS_BETTER, rateBase } from "../../charts/change.js";

/** Metric labels and formats used across pages. */
export const METRICS: Record<string, { label: string; format: Format }> = {
	visitors: { label: "Visitors", format: "number" },
	sessions: { label: "Sessions", format: "number" },
	pageviews: { label: "Pageviews", format: "number" },
	views_per_session: { label: "Views per session", format: "decimal" },
	bounce_rate: { label: "Bounce rate", format: "percent" },
	engaged_rate: { label: "Engaged rate", format: "percent" },
	avg_duration: { label: "Avg. session duration", format: "duration" },
};
