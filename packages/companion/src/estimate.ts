/**
 * Page views per month to rows, profile and advice. Pure. Every constant is a number of the full
 * plugin's docs; tests/pure.test.ts finds each one in the file it cites.
 */
import { type Answers, effectiveDatabase } from "./steps.js";

/** The docs give figures per day; a month counts as 30 days. */
export const DAYS_PER_MONTH = 30;
/** docs/limits.md, Measured on production D1: rows written per page view with the typical mix. */
export const ROWS_PER_PAGE_VIEW = 3.3;
/** docs/limits.md, Estimate: 25 months of detail in the `standard` default budget. */
export const STANDARD_PAGE_VIEWS_PER_DAY = 17_500;
/** docs/limits.md, Estimate: 25 months of detail in the `dedicated` default budget. */
export const DEDICATED_PAGE_VIEWS_PER_DAY = 26_200;

export type Profile = "standard" | "dedicated";
export type Advice = "fits" | "own_database" | "shorter_detail" | "raise_budget";

export interface Estimate {
	pageViewsPerDay: number;
	rowsPerDay: number;
	profile: Profile;
	advice: Advice;
}

/** Null until the page views are answered. Page views per day round up, so a value over a limit never shows as the limit. */
export function estimate(a: Answers): Estimate | null {
	if (a.pageViews === null) return null;
	const perDay = a.pageViews / DAYS_PER_MONTH;
	const db = effectiveDatabase(a);
	// Profile as docs/limits.md "When to choose": a database of its own takes dedicated.
	const profile: Profile = db === "emdash" ? "standard" : "dedicated";
	const fits = perDay <= (profile === "standard" ? STANDARD_PAGE_VIEWS_PER_DAY : DEDICATED_PAGE_VIEWS_PER_DAY);
	let advice: Advice = "fits";
	if (!fits) {
		if (db === "postgres") advice = "raise_budget";
		else if (db === "emdash" && a.platform === "cloudflare") advice = "own_database";
		else advice = "shorter_detail";
	}
	return { pageViewsPerDay: Math.ceil(perDay), rowsPerDay: Math.round(perDay * ROWS_PER_PAGE_VIEW), profile, advice };
}
