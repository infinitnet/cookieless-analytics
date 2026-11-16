/** Hand-built Search rows for the SEO views: invented queries and numbers, example paths only. */
import { zonedToEpoch } from "../../src/core/time.js";
import type { Db } from "../../src/db/adapter.js";
import { type QueryInput, QuerySchema } from "../../src/query/filters.js";
import type { ReportCtx } from "../../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../../src/query/reports/index.js";
import { normalizeSettings } from "../../src/settings.js";

type Raw = { prepare(sql: string): { run(...a: unknown[]): unknown } };

export interface SearchFixtureRow {
	source?: "google" | "bing";
	day: string;
	page?: string;
	query?: string;
	clicks: number;
	impressions: number;
	/** Sum of positions times impressions; `position` is a shortcut for `position * impressions`. */
	pos_sum?: number;
	position?: number;
	provisional?: boolean;
}

export function insertSearch(raw: Raw, site: string, rows: readonly SearchFixtureRow[]): void {
	const stmt = raw.prepare(
		"INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional) VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?, ?)",
	);
	for (const r of rows) stmt.run(site, r.source ?? "google", r.day, r.page ?? "", r.query ?? "", r.clicks, r.impressions, r.pos_sum ?? (r.position ?? 0) * r.impressions, r.provisional ? 1 : 0);
}

export function insertRollupPages(raw: Raw, site: string, rows: ReadonlyArray<{ day: string; page: string; pageviews: number }>): void {
	const stmt = raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, pageviews) VALUES (?, ?, 'page', ?, ?)");
	for (const r of rows) stmt.run(site, r.day, r.page, r.pageviews);
}

/** A report context over `db` for `site`, with SEO settings and a clock. */
export function seoCtx(db: Db, site: string, over: Record<string, unknown> = {}, now = zonedToEpoch("2026-03-15", 12, "UTC")): ReportCtx {
	return { db, site, settings: normalizeSettings({ searchBrandTerms: "acme", ...over }), now, goals: [], funnels: {}, annotations: [] };
}

export const runner = (rc: () => ReportCtx) => (report: ReportName, q: Partial<QueryInput>, params?: Params, limit?: number) => {
	clearReportCache();
	return runReport(rc(), { report, query: QuerySchema.parse({ from: "2026-03-01", to: "2026-03-30", ...q }), ...(params ? { params } : {}), ...(limit ? { limit } : {}) });
};
