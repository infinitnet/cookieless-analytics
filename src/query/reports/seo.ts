/**
 * SEO views over the stored Search data: cannibalization, position bands with movement and
 * striking distance, rising and declining pages and queries, content decay. Every number is a query-time
 * aggregate of `ca_search_daily` or `ca_rollup` (dim `page`); filtering and capping happen in SQL so the
 * Worker never receives tens of thousands of grouped pairs. Values are always bound; only the constants of
 * this file (band bounds, grain predicates) are part of the SQL text.
 */
import { addDays, daysBetween, eachDay } from "../../core/time.js";
import { LIKE_ESCAPE, likeEscape } from "../../db/dialect.js";
import type { Db } from "../../db/adapter.js";
import { andFrags, compileSearch, type Frag, QueryError, TRUE } from "../compile.js";
import { OTHER } from "../rollup.js";
import { num, type ReportCtx, type ReportData, type Row, type RunInput, ratio, round } from "./base.js";
import { COLUMN, searchWhere } from "./search.js";
import { BAND_UPPER, bandSuffix, POSITION_BANDS, SEO_MAX_RANGE_DAYS, SEO_TEXT, type SeoPeriods } from "./seo-copy.js";
import { storedThrough } from "./summary.js";
import { weekStart } from "./timeseries.js";

export const OVERLAP_MAX_QUERIES = 200;
export const OVERLAP_MAX_PAGES_PER_QUERY = 10;
export const STRIKING_MIN = 4;
export const STRIKING_MAX_EXCLUSIVE = 21;
export const TOP3_MIN_IMPRESSIONS_FOR_ESTIMATE = 1000;
export const DOMINANT_SHARE = 70;
export const SPLIT_SHARE = 50;
/** Rows of the page drill-down and of the query drill-down. */
const DRILL_MAX = 1000;

type Source = "all" | "google" | "bing";
const sourceOf = (input: RunInput): Source => input.params.source ?? "all";

// ── shared helpers ───────────────────────────────────────────────────────────

/** Days of the range; more than 93 is the typed error `range_too_long`. */
export function seoRange(input: Pick<RunInput, "from" | "to">): number {
	const n = daysBetween(input.from, input.to);
	if (n > SEO_MAX_RANGE_DAYS) throw new QueryError("range_too_long", SEO_TEXT.rangeTooLong);
	return n;
}

/** Floors and brand terms: request params override the settings. */
export function floors(rc: ReportCtx, input: RunInput) {
	return {
		minImpressions: input.params.minImpressions ?? rc.settings.searchMinImpressions ?? 50,
		minShare: input.params.minShare ?? rc.settings.searchOverlapMinShare ?? 10,
		brand: input.params.includeBrand ? [] : (rc.settings.searchBrandTerms ?? []),
	};
}

/** Newest day with `provisional = 0` for the source(s); with `all` the older of the per-source days. One statement on the primary key. */
export async function lastFinal(rc: ReportCtx, source: Source): Promise<string | null> {
	const w = andFrags([{ sql: "d.site = ? AND d.provisional = 0", params: [rc.site] }, source === "all" ? TRUE : { sql: "d.source = ?", params: [source] }]);
	const rows = await rc.db.all(`SELECT d.source AS source, MAX(d.day) AS day FROM ca_search_daily d WHERE ${w.sql} GROUP BY d.source`, w.params);
	const days = rows.map((r) => (r.day == null ? "" : String(r.day))).filter(Boolean).sort();
	return days[0] ?? null;
}

/**
 * The period rule: `n` days per period, the current period ends at the newest final day
 * (search) or yesterday (traffic, whose newest day is incomplete), the previous and oldest periods
 * follow back to back. `provisional_excluded` when the requested end was moved.
 */
export async function periods(rc: ReportCtx, input: RunInput, target: Source | "traffic", count: 2 | 3): Promise<{ periods: SeoPeriods; notices: string[] }> {
	const n = seoRange(input);
	// Traffic: the stored summary days only (days still open would read as partial).
	const cap = target === "traffic" ? await storedThrough(rc) : await lastFinal(rc, target);
	const end = cap && cap < input.to ? cap : input.to;
	const current = { from: addDays(end, 1 - n), to: end };
	const previous = { from: addDays(current.from, -n), to: addDays(current.from, -1) };
	const p: SeoPeriods = { current, previous, days: n, excluded: daysBetween(end, input.to) - 1, reason: target === "traffic" ? "incomplete" : "provisional" };
	if (count === 3) p.oldest = { from: addDays(previous.from, -n), to: addDays(previous.from, -1) };
	return { periods: p, notices: end < input.to ? ["provisional_excluded"] : [] };
}

/** `lower(d.query) NOT LIKE ?` per brand term; patterns stay under D1's 50 byte limit (settings drop longer terms). */
export function brandPredicate(terms: readonly string[]): Frag {
	if (!terms.length) return TRUE;
	return { sql: terms.map(() => `lower(d.query) NOT LIKE ? ${LIKE_ESCAPE}`).join(" AND "), params: terms.map((t) => `%${likeEscape(t.toLowerCase())}%`) };
}

/** Band index 0 to 4 of an average position expression (`[1,4)`, `[4,11)`, `[11,21)`, `[21,51)`, `[51,inf)`). */
export const bandCase = (expr: string) => `CASE ${BAND_UPPER.map((u, i) => `WHEN ${expr} < ${u} THEN ${i}`).join(" ")} ELSE ${BAND_UPPER.length} END`;

/** Noise guard `abs(a - b) > 2 * sqrt(a + b)`, squared so no SQL `SQRT` is needed (both sides are not negative). */
export const notableExpr = (a: string, b: string) => `CASE WHEN (${a} - ${b}) * (${a} - ${b}) > 4 * (${a} + ${b}) THEN 1 ELSE 0 END`;

const isNotable = (a: number, b: number) => Math.abs(a - b) > 2 * Math.sqrt(a + b);
const pos = (sum: unknown, imp: unknown): number | null => round(ratio(num(sum), num(imp)), 2);
const bandOf = (i: unknown): string | null => (typeof i === "number" || typeof i === "bigint" || typeof i === "string" ? (POSITION_BANDS[Number(i)] ?? null) : null);

/** Pair grain (page with query) rows: Google only, since Bing stores no pairs. */
const PAIR_GRAIN = "d.page_key <> '' AND d.query <> '' AND d.country = '' AND d.device = ''";

/** Filters of the pair views: `country` and `device` cannot apply (`filters_not_applied`); Bing selections read Google rows (`bing_no_pairs`). */
async function pairWhere(rc: ReportCtx, input: RunInput, brand: readonly string[]): Promise<{ where: Frag; notices: string[] }> {
	const kept = input.filters.filter((f) => f.dim !== "country" && f.dim !== "device");
	const c = await compileSearch({ db: rc.db, site: rc.site, from: input.from, to: input.to, goals: rc.goals }, kept);
	const notices: string[] = [];
	if (kept.length < input.filters.length) notices.push("filters_not_applied");
	if (sourceOf(input) !== "google") notices.push("bing_no_pairs");
	const where = andFrags([{ sql: `d.site = ? AND d.source = ? AND d.day BETWEEN ? AND ? AND ${PAIR_GRAIN}`, params: [rc.site, "google", input.from, input.to] }, c.pred, brandPredicate(brand)]);
	return { where, notices };
}

/**
 * Page of a stored pair with any `#fragment` cut off: ingest already keys pages without fragments
 * (`pageKeyFor`), this is the safety net so a stored `/page#toc` still counts as `/page` (summed, and
 * the position stays impression weighted because `pos_sum` is summed).
 */
export function pageNoFragment(db: Pick<Db, "dialect">): string {
	return db.dialect === "postgres" ? "split_part(d.page_key, '#', 1)" : "CASE WHEN instr(d.page_key, '#') > 0 THEN substr(d.page_key, 1, instr(d.page_key, '#') - 1) ELSE d.page_key END";
}

/** CTEs `pq` (pairs), `qs0` (query totals), `pqf` (pairs over the share floor) and `qs` (cannibalized queries). */
function overlapCtes(db: Pick<Db, "dialect">, where: Frag, minShare: number, minImpressions: number, cap: number | null): Frag {
	const page = pageNoFragment(db);
	return {
		sql: `WITH pq AS (SELECT d.query AS query, ${page} AS page, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE ${where.sql} GROUP BY d.query, ${page}),
qs0 AS (SELECT pq.query AS query, SUM(pq.impressions) AS impressions FROM pq GROUP BY pq.query),
pqf AS (SELECT pq.query AS query, pq.page AS page, pq.clicks AS clicks, pq.impressions AS impressions, pq.pos_sum AS pos_sum, qs0.impressions AS q_total FROM pq JOIN qs0 ON qs0.query = pq.query WHERE pq.impressions > 0 AND pq.impressions * 100 >= ? * qs0.impressions),
qs AS (SELECT pqf.query AS query, COUNT(*) AS pages, SUM(pqf.impressions) AS impressions, SUM(pqf.clicks) AS clicks, MAX(pqf.q_total) AS q_total FROM pqf GROUP BY pqf.query HAVING COUNT(*) >= 2 AND SUM(pqf.impressions) >= ?${cap === null ? "" : " ORDER BY SUM(pqf.impressions) DESC, pqf.query LIMIT ?"})`,
		params: [...where.params, minShare, minImpressions, ...(cap === null ? [] : [cap])],
	};
}

/** Visible share: page with query impressions over totals grain impressions, Google rows of the range. */
async function coverage(rc: ReportCtx, input: RunInput): Promise<number | null> {
	const [r] = await rc.db.all(
		`SELECT SUM(CASE WHEN d.page_key <> '' AND d.query <> '' THEN d.impressions ELSE 0 END) AS visible, SUM(CASE WHEN d.page_key = '' AND d.query = '' THEN d.impressions ELSE 0 END) AS total FROM ca_search_daily d WHERE d.site = ? AND d.source = ? AND d.day BETWEEN ? AND ? AND d.country = '' AND d.device = ''`,
		[rc.site, "google", input.from, input.to],
	);
	return round(ratio(num(r?.visible), num(r?.total)));
}

export interface OverlapPage {
	page: string;
	impressions: number;
	impressions_share: number | null;
	clicks: number;
	clicks_share: number | null;
	position: number | null;
}

/** Best page: most clicks, then better position, then more impressions. */
export function bestPage<P extends Pick<OverlapPage, "page" | "clicks" | "impressions" | "position">>(pages: readonly P[]): P | undefined {
	return [...pages].sort((a, b) => b.clicks - a.clicks || (a.position ?? Infinity) - (b.position ?? Infinity) || b.impressions - a.impressions || (a.page < b.page ? -1 : 1))[0];
}

/**
 * Pattern label of a cannibalized query: `dominant`, `split`, `inverted`, else `shared`. Shares are of the
 * query's impressions over all its pages (`total`), so pages under the share floor still count in the denominator;
 * the listed `impressions_share` values are of the counted pages and sum to 100.
 */
export function overlapPattern(pages: readonly OverlapPage[], total?: number): "dominant" | "split" | "inverted" | "shared" {
	const best = bestPage(pages);
	if (!best) return "shared";
	const top = Math.min(...pages.map((p) => p.position ?? Infinity));
	const share = (p: OverlapPage) => (total ? p.impressions / total : (p.impressions_share ?? 0)) * 100;
	if (share(best) >= DOMINANT_SHARE && (best.position ?? Infinity) <= top) return "dominant";
	if (pages.every((p) => share(p) < SPLIT_SHARE)) return "split";
	const most = pages.reduce((a, b) => (b.impressions > a.impressions ? b : a));
	if (pages.some((p) => p !== most && (p.position ?? Infinity) < (most.position ?? Infinity))) return "inverted";
	return "shared";
}

const noCompare = (input: RunInput) => {
	if (input.isCompare) throw new QueryError("compare_not_supported", SEO_TEXT.compareNotSupported);
};

// ── cannibalization (34.2) ───────────────────────────────────────────────────

export async function searchCannibalization(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	noCompare(input);
	seoRange(input);
	const f = floors(rc, input);
	const { where, notices } = await pairWhere(rc, input, f.brand);
	const c = overlapCtes(rc.db, where, f.minShare, f.minImpressions, OVERLAP_MAX_QUERIES);
	const rows = await rc.db.all(
		`${c.sql},
ranked AS (SELECT pqf.query AS query, pqf.page AS page, pqf.clicks AS clicks, pqf.impressions AS impressions, pqf.pos_sum AS pos_sum, ROW_NUMBER() OVER (PARTITION BY pqf.query ORDER BY pqf.impressions DESC, pqf.page) AS rn FROM pqf JOIN qs ON qs.query = pqf.query)
SELECT r.query AS query, r.page AS page, r.clicks AS clicks, r.impressions AS impressions, r.pos_sum AS pos_sum, qs.pages AS q_pages, qs.impressions AS q_impressions, qs.clicks AS q_clicks, qs.q_total AS q_total FROM ranked r JOIN qs ON qs.query = r.query WHERE r.rn <= ? ORDER BY qs.impressions DESC, r.query, r.rn`,
		[...c.params, OVERLAP_MAX_PAGES_PER_QUERY],
	);
	const byQuery = new Map<string, { pages: number; impressions: number; clicks: number; total: number; list: OverlapPage[] }>();
	for (const r of rows) {
		const q = String(r.query);
		const e = byQuery.get(q) ?? { pages: num(r.q_pages), impressions: num(r.q_impressions), clicks: num(r.q_clicks), total: num(r.q_total), list: [] };
		const imp = num(r.impressions);
		const clicks = num(r.clicks);
		e.list.push({ page: String(r.page), impressions: imp, impressions_share: round(ratio(imp, e.impressions)), clicks, clicks_share: round(ratio(clicks, e.clicks)), position: pos(r.pos_sum, imp) });
		byQuery.set(q, e);
	}
	const out: Row[] = [...byQuery].map(([query, e]) => ({ key: query, query, pages: e.pages, impressions: e.impressions, clicks: e.clicks, pattern: overlapPattern(e.list, e.total), best_page: bestPage(e.list)?.page ?? null, page_list: e.list }));
	// Totals over every cannibalized query, not only the 200 listed.
	const all = overlapCtes(rc.db, where, f.minShare, f.minImpressions, null);
	const [t] = await rc.db.all(`${all.sql} SELECT COUNT(*) AS n, SUM(qs.impressions) AS impressions FROM qs`, all.params);
	return {
		rows: out.slice(input.offset, input.offset + input.limit),
		truncated: out.length > input.offset + input.limit,
		totals: { cannibalized_queries: num(t?.n), cannibalized_impressions: num(t?.impressions), visible_share: await coverage(rc, input) },
		// The floors in effect, so the admin prefills its fields from the settings.
		floors: { minImpressions: f.minImpressions, minShare: f.minShare, brandTerms: (rc.settings.searchBrandTerms ?? []).length, includeBrand: !!input.params.includeBrand },
		notices: [...notices, "coverage", ...(out.length >= OVERLAP_MAX_QUERIES ? ["capped"] : [])],
	};
}

export async function searchCannibalizationPages(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	noCompare(input);
	seoRange(input);
	const f = floors(rc, input);
	const { where, notices } = await pairWhere(rc, input, f.brand);
	const c = overlapCtes(rc.db, where, f.minShare, f.minImpressions, null);
	const hit = "CASE WHEN cp.page IS NULL THEN 0 ELSE";
	const rows = await rc.db.all(
		`${c.sql},
cp AS (SELECT pqf.query AS query, pqf.page AS page FROM pqf JOIN qs ON qs.query = pqf.query)
SELECT pq.page AS page, COUNT(*) AS queries, SUM(${hit} 1 END) AS overlapping_queries, SUM(pq.impressions) AS impressions, SUM(${hit} pq.impressions END) AS overlapping_impressions, SUM(pq.clicks) AS clicks, SUM(${hit} pq.clicks END) AS overlapping_clicks
FROM pq LEFT JOIN cp ON cp.query = pq.query AND cp.page = pq.page GROUP BY pq.page HAVING SUM(${hit} 1 END) > 0 ORDER BY overlapping_impressions DESC, page LIMIT ? OFFSET ?`,
		[...c.params, input.limit + 1, input.offset],
	);
	return {
		rows: rows.slice(0, input.limit).map((r) => ({
			key: String(r.page),
			queries: num(r.queries),
			overlapping_queries: num(r.overlapping_queries),
			overlapping_queries_pct: round(ratio(num(r.overlapping_queries), num(r.queries))),
			impressions: num(r.impressions),
			overlapping_impressions: num(r.overlapping_impressions),
			overlapping_impressions_pct: round(ratio(num(r.overlapping_impressions), num(r.impressions))),
			clicks: num(r.clicks),
			overlapping_clicks: num(r.overlapping_clicks),
		})),
		truncated: rows.length > input.limit,
		notices: [...notices, "coverage"],
	};
}

/** One page: the other pages it competes with and the shared queries (stored Google rows). */
export async function searchCannibalizationPage(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	noCompare(input);
	seoRange(input);
	const page = input.params.page;
	if (!page) throw new QueryError("invalid_params", "search_cannibalization_page needs params.page.");
	const f = floors(rc, input);
	const { where, notices } = await pairWhere(rc, input, f.brand);
	const c = overlapCtes(rc.db, where, f.minShare, f.minImpressions, null);
	const rows = await rc.db.all(
		`${c.sql},
cp AS (SELECT pqf.query AS query, pqf.page AS page, pqf.impressions AS impressions, pqf.pos_sum AS pos_sum FROM pqf JOIN qs ON qs.query = pqf.query)
SELECT a.query AS query, a.impressions AS impressions_this, a.pos_sum AS pos_this, b.page AS other_page, b.impressions AS impressions_other, b.pos_sum AS pos_other FROM cp a JOIN cp b ON b.query = a.query AND b.page <> a.page WHERE a.page = ? ORDER BY a.impressions DESC, a.query, b.impressions DESC, b.page LIMIT ?`,
		[...c.params, page, DRILL_MAX],
	);
	const queries = rows.map((r) => ({
		query: String(r.query),
		impressions_this: num(r.impressions_this),
		position_this: pos(r.pos_this, r.impressions_this),
		impressions_other: num(r.impressions_other),
		position_other: pos(r.pos_other, r.impressions_other),
		other_page: String(r.other_page),
	}));
	const pairs = new Map<string, { other_page: string; shared_queries: number; shared_impressions_this: number; shared_impressions_other: number }>();
	for (const q of queries) {
		const p = pairs.get(q.other_page) ?? { other_page: q.other_page, shared_queries: 0, shared_impressions_this: 0, shared_impressions_other: 0 };
		p.shared_queries += 1;
		p.shared_impressions_this += q.impressions_this;
		p.shared_impressions_other += q.impressions_other;
		pairs.set(q.other_page, p);
	}
	const list = [...pairs.values()].sort((a, b) => b.shared_impressions_this - a.shared_impressions_this || (a.other_page < b.other_page ? -1 : 1));
	return { page, pairs: list, queries, truncated: rows.length >= DRILL_MAX, notices: [...notices, "coverage"] };
}

/** One query: its pages from stored Google rows, and for Bing from `GetQueryPageStats` on request (cached one hour). */
export async function searchCannibalizationQuery(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	noCompare(input);
	seoRange(input);
	const query = input.params.query;
	if (!query) throw new QueryError("invalid_params", "search_cannibalization_query needs params.query.");
	const source = sourceOf(input);
	const sums = new Map<string, { clicks: number; impressions: number; pos_sum: number }>();
	const add = (page: string, r: { clicks: unknown; impressions: unknown; pos_sum: unknown }) => {
		const e = sums.get(page) ?? { clicks: 0, impressions: 0, pos_sum: 0 };
		sums.set(page, { clicks: e.clicks + num(r.clicks), impressions: e.impressions + num(r.impressions), pos_sum: e.pos_sum + num(r.pos_sum) });
	};
	const notices: string[] = [];
	if (source !== "bing") {
		const { where, notices: n } = await pairWhere(rc, { ...input, params: { ...input.params, source: "google" } }, []);
		notices.push(...n);
		const w = andFrags([where, { sql: "d.query = ?", params: [query] }]);
		const rows = await rc.db.all(
			`SELECT ${pageNoFragment(rc.db)} AS page, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${pageNoFragment(rc.db)} ORDER BY impressions DESC, page LIMIT ?`,
			[...w.params, DRILL_MAX],
		);
		for (const r of rows) add(String(r.page), { clicks: r.clicks, impressions: r.impressions, pos_sum: r.pos_sum });
	}
	if (source !== "google" && rc.bingQueryPages) {
		try {
			for (const r of await rc.bingQueryPages(query)) if (r.day >= input.from && r.day <= input.to) add(r.page, r);
			if (input.filters.length) notices.push("filters_not_applied");
		} catch (e) {
			if (source === "bing") throw new QueryError("source_error", e instanceof Error ? e.message : "Bing Webmaster did not answer.");
		}
	}
	const total = [...sums.values()].reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }), { clicks: 0, impressions: 0 });
	const pages: OverlapPage[] = [...sums]
		.map(([page, r]) => ({ page, impressions: r.impressions, impressions_share: round(ratio(r.impressions, total.impressions)), clicks: r.clicks, clicks_share: round(ratio(r.clicks, total.clicks)), position: pos(r.pos_sum, r.impressions) }))
		.sort((a, b) => b.impressions - a.impressions || (a.page < b.page ? -1 : 1));
	return { query, page_list: pages, best_page: bestPage(pages)?.page ?? null, pattern: pages.length > 1 ? overlapPattern(pages) : null, notices };
}

// ── position bands (34.3) ────────────────────────────────────────────────────

const dimOf = (input: RunInput, fallback: "query" | "page"): "query" | "page" => (input.params.dim === "page" || input.params.dim === "query" ? input.params.dim : fallback);
const AVG = "SUM(d.pos_sum) / NULLIF(SUM(d.impressions), 0)";

export async function searchPositionBands(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	seoRange(input);
	const dim = dimOf(input, "query");
	const col = COLUMN[dim];
	const w = searchWhere(rc, input, dim);
	const rows = await rc.db.all(
		`SELECT k.band AS band, COUNT(*) AS n, SUM(k.impressions) AS impressions, SUM(k.clicks) AS clicks FROM (SELECT ${col} AS key, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, ${bandCase(AVG)} AS band FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${col} HAVING SUM(d.impressions) > 0) k GROUP BY k.band`,
		w.params,
	);
	const byBand = new Map(rows.map((r) => [bandOf(r.band), r]));
	const allImp = rows.reduce((a, r) => a + num(r.impressions), 0);
	const count = dim === "page" ? "pages" : "queries";
	const totals: Record<string, number | null> = { [count]: rows.reduce((a, r) => a + num(r.n), 0), impressions: allImp };
	const out: Row[] = POSITION_BANDS.map((band) => {
		const r = byBand.get(band);
		const impressions = num(r?.impressions);
		const clicks = num(r?.clicks);
		const row = { key: band, [count]: num(r?.n), impressions, clicks, ctr: round(ratio(clicks, impressions)), impressions_share: round(ratio(impressions, allImp)) };
		const s = bandSuffix(band);
		totals[`${count}_${s}`] = num(r?.n);
		totals[`impressions_${s}`] = impressions;
		totals[`share_${s}`] = row.impressions_share;
		totals[`ctr_${s}`] = row.ctr;
		return row;
	});
	return { rows: out, totals, notices: input.search?.ignored.length ? ["filters_not_applied"] : [] };
}

/** Series point key of a band: `band_1_3`. */
export const bandKey = (band: string) => `band_${bandSuffix(band)}`;

export async function searchPositionBandsSeries(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const days = seoRange(input);
	const dim = dimOf(input, "query");
	const col = COLUMN[dim];
	const byWeek = days > 31;
	const bucket = !byWeek ? "d.day" : rc.db.dialect === "postgres" ? "to_char(date_trunc('week', CAST(d.day AS date)), 'YYYY-MM-DD')" : "date(d.day, '-6 days', 'weekday 1')";
	const metric = input.params.metric === "impressions" ? "impressions" : "queries";
	const w = searchWhere(rc, input, dim);
	const rows = await rc.db.all(
		`SELECT k.bucket AS bucket, k.band AS band, COUNT(*) AS n, SUM(k.impressions) AS impressions FROM (SELECT ${bucket} AS bucket, ${col} AS key, SUM(d.impressions) AS impressions, ${bandCase(AVG)} AS band FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${bucket}, ${col} HAVING SUM(d.impressions) > 0) k GROUP BY k.bucket, k.band`,
		w.params,
	);
	const buckets = new Map<string, Record<string, number>>();
	for (const day of eachDay(input.from, input.to)) {
		const t = byWeek ? weekStart(day) : day;
		if (!buckets.has(t)) buckets.set(t, Object.fromEntries(POSITION_BANDS.map((b) => [bandKey(b), 0])));
	}
	for (const r of rows) {
		const band = bandOf(r.band);
		const b = buckets.get(String(r.bucket));
		if (band && b) b[bandKey(band)] = metric === "impressions" ? num(r.impressions) : num(r.n);
	}
	return { keys: POSITION_BANDS.map(bandKey), labels: [...POSITION_BANDS], metric, granularity: byWeek ? "week" : "day", series: [...buckets].map(([t, v]) => ({ t, ...v })), notices: input.search?.ignored.length ? ["filters_not_applied"] : [] };
}

/** Per key sums of two periods in one scan (`c` current, `p` previous): clicks, impressions, pos_sum. */
function twoPeriodSums(col: string, split: string): Frag {
	const s = (when: string, v: string) => `SUM(CASE WHEN d.day ${when} ? THEN d.${v} ELSE 0 END)`;
	return {
		sql: `${col} AS key, ${s(">=", "clicks")} AS cc, ${s(">=", "impressions")} AS ic, ${s(">=", "pos_sum")} AS pc, ${s("<", "clicks")} AS cp, ${s("<", "impressions")} AS ip, ${s("<", "pos_sum")} AS pp`,
		params: [split, split, split, split, split, split],
	};
}

export async function searchPositionMoves(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const dim = dimOf(input, "query");
	const { periods: p, notices } = await periods(rc, input, sourceOf(input), 2);
	const { minImpressions } = floors(rc, input);
	const col = COLUMN[dim];
	const w = searchWhere(rc, { ...input, from: p.previous.from, to: p.current.to }, dim);
	const sums = twoPeriodSums(col, p.current.from);
	const ctes = {
		sql: `WITH a AS (SELECT ${sums.sql} FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${col}),
m AS (SELECT a.key AS key, a.cc AS cc, a.ic AS ic, a.pc AS pc, a.cp AS cp, a.ip AS ip, a.pp AS pp, CASE WHEN a.ip >= ? THEN ${bandCase("a.pp / NULLIF(a.ip, 0)")} ELSE -1 END AS bf, CASE WHEN a.ic >= ? THEN ${bandCase("a.pc / NULLIF(a.ic, 0)")} ELSE -2 END AS bt FROM a WHERE a.ic >= ? OR a.ip >= ?)`,
		params: [...sums.params, ...w.params, minImpressions, minImpressions, minImpressions, minImpressions],
	};
	const matrixRows = await rc.db.all(`${ctes.sql} SELECT m.bf AS bf, m.bt AS bt, COUNT(*) AS n, SUM(CASE WHEN m.bt = -2 THEN m.ip ELSE m.ic END) AS impressions FROM m GROUP BY m.bf, m.bt`, ctes.params);
	const listRows = await rc.db.all(
		`${ctes.sql},
v AS (SELECT m.key AS key, m.cc AS cc, m.ic AS ic, m.pc AS pc, m.cp AS cp, m.ip AS ip, m.pp AS pp, m.bf AS bf, m.bt AS bt, CASE WHEN m.bf = -1 THEN 'new' WHEN m.bt = -2 THEN 'lost' WHEN m.bt < m.bf THEN 'up' WHEN m.bt > m.bf THEN 'down' ELSE 'same' END AS mv FROM m),
r AS (SELECT v.key AS key, v.cc AS cc, v.ic AS ic, v.pc AS pc, v.cp AS cp, v.ip AS ip, v.pp AS pp, v.bf AS bf, v.bt AS bt, v.mv AS mv, ROW_NUMBER() OVER (PARTITION BY v.mv ORDER BY CASE WHEN v.mv = 'lost' THEN v.ip ELSE v.ic END DESC, v.key) AS rn FROM v WHERE v.mv <> 'same')
SELECT r.key AS key, r.cc AS cc, r.ic AS ic, r.pc AS pc, r.cp AS cp, r.ip AS ip, r.pp AS pp, r.bf AS bf, r.bt AS bt, r.mv AS mv FROM r WHERE r.rn <= ? ORDER BY r.mv, r.rn`,
		[...ctes.params, input.limit],
	);
	const label = (i: unknown) => (Number(i) === -1 ? "new" : Number(i) === -2 ? "lost" : bandOf(i));
	const matrix = matrixRows.map((r) => ({ from: label(r.bf), to: label(r.bt), queries: num(r.n), impressions: num(r.impressions) }));
	const totals = { moved_up: 0, moved_down: 0, unchanged: 0, new: 0, lost: 0 };
	for (const r of matrixRows) {
		const f = Number(r.bf);
		const t = Number(r.bt);
		const k = f === -1 ? "new" : t === -2 ? "lost" : t < f ? "moved_up" : t > f ? "moved_down" : "unchanged";
		totals[k] += num(r.n);
	}
	const lists: Record<string, unknown[]> = { up: [], down: [], new: [], lost: [] };
	for (const r of listRows) {
		const lost = r.mv === "lost";
		lists[String(r.mv)]?.push({
			query: String(r.key),
			impressions: num(lost ? r.ip : r.ic),
			clicks: num(lost ? r.cp : r.cc),
			position_previous: r.mv === "new" ? null : pos(r.pp, r.ip),
			position_current: lost ? null : pos(r.pc, r.ic),
			band_previous: r.mv === "new" ? null : bandOf(r.bf),
			band_current: lost ? null : bandOf(r.bt),
		});
	}
	const list = input.params.list && input.params.list !== "matrix" ? (lists[input.params.list] as Array<Record<string, unknown>>) : null;
	const rows: Row[] = list ? list.map((x) => ({ key: String(x.query), ...x })) : matrix.map((m) => ({ key: `${m.from} > ${m.to}`, ...m }));
	return { dim, matrix, rows, ...lists, totals, periods: p, notices };
}

export async function searchStrikingDistance(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	seoRange(input);
	const f = floors(rc, input);
	const { where, notices } = await pairWhere(rc, input, f.brand);
	const rows = await rc.db.all(
		`SELECT d.query AS query, d.page_key AS page, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE ${where.sql} GROUP BY d.query, d.page_key HAVING SUM(d.impressions) >= ? AND SUM(d.pos_sum) >= ${STRIKING_MIN} * SUM(d.impressions) AND SUM(d.pos_sum) < ${STRIKING_MAX_EXCLUSIVE} * SUM(d.impressions) ORDER BY impressions DESC, query, page LIMIT ? OFFSET ?`,
		[...where.params, Math.max(1, f.minImpressions), input.limit + 1, input.offset],
	);
	// The site's own CTR in band 1-3 over the same range and source: pairs with an average position under 4.
	const [top] = await rc.db.all(
		`SELECT SUM(t.clicks) AS clicks, SUM(t.impressions) AS impressions FROM (SELECT SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE d.site = ? AND d.source = ? AND d.day BETWEEN ? AND ? AND ${PAIR_GRAIN} GROUP BY d.query, d.page_key) t WHERE t.impressions > 0 AND t.pos_sum < ${BAND_UPPER[0]} * t.impressions`,
		[rc.site, "google", input.from, input.to],
	);
	const topImp = num(top?.impressions);
	const ctr13 = topImp >= TOP3_MIN_IMPRESSIONS_FOR_ESTIMATE ? num(top?.clicks) / topImp : null;
	const out = rows.slice(0, input.limit).map((r) => {
		const impressions = num(r.impressions);
		const clicks = num(r.clicks);
		const ctr = ratio(clicks, impressions) ?? 0;
		return {
			key: `${String(r.query)}\u0000${String(r.page)}`,
			query: String(r.query),
			page: String(r.page),
			impressions,
			clicks,
			ctr: round(ctr),
			position: pos(r.pos_sum, impressions),
			potential_clicks: ctr13 === null ? null : Math.round(impressions * Math.max(0, ctr13 - ctr)),
		};
	});
	return {
		rows: out,
		truncated: rows.length > input.limit,
		totals: { ctr_1_3: round(ctr13), impressions_1_3: topImp },
		notices: [...notices, "coverage", ...(ctr13 === null ? ["top3_insufficient"] : [])],
	};
}

// ── movers and decay (34.5) ──────────────────────────────────────────────────

function moverRow(key: string, cur: number, prev: number, extra: Record<string, unknown> = {}): Row {
	return { key, current: cur, previous: prev, delta: cur - prev, delta_pct: prev === 0 ? null : round((cur - prev) / prev), ...extra, notable: isNotable(cur, prev) };
}

export async function searchMovers(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const dim = dimOf(input, "page");
	const metric = input.params.metric === "impressions" ? "impressions" : "clicks";
	const up = input.params.direction === "up";
	const { periods: p, notices } = await periods(rc, input, sourceOf(input), 2);
	const { minImpressions } = floors(rc, input);
	const col = COLUMN[dim];
	const w = searchWhere(rc, { ...input, from: p.previous.from, to: p.current.to }, dim);
	const sums = twoPeriodSums(col, p.current.from);
	const [c, pv] = metric === "clicks" ? ["a.cc", "a.cp"] : ["a.ic", "a.ip"];
	const rows = await rc.db.all(
		`WITH a AS (SELECT ${sums.sql} FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${col})
SELECT a.key AS key, a.cc AS cc, a.ic AS ic, a.pc AS pc, a.cp AS cp, a.ip AS ip, a.pp AS pp, ${notableExpr(c, pv)} AS notable FROM a WHERE (a.ic >= ? OR a.ip >= ?) AND ${c} - ${pv} ${up ? ">" : "<"} 0 ORDER BY ABS(${c} - ${pv}) DESC, a.key LIMIT ? OFFSET ?`,
		[...sums.params, ...w.params, minImpressions, minImpressions, input.limit + 1, input.offset],
	);
	const out = rows.slice(0, input.limit).map((r) => {
		const pc = pos(r.pc, r.ic);
		const pp = pos(r.pp, r.ip);
		const both = num(r.ic) >= minImpressions && num(r.ip) >= minImpressions;
		return {
			...moverRow(String(r.key), num(metric === "clicks" ? r.cc : r.ic), num(metric === "clicks" ? r.cp : r.ip), {
				impressions_current: num(r.ic),
				impressions_previous: num(r.ip),
				position_current: pc,
				position_previous: pp,
				ctr_current: round(ratio(num(r.cc), num(r.ic))),
				ctr_previous: round(ratio(num(r.cp), num(r.ip))),
				position_moved: both && pc !== null && pp !== null && Math.abs(pc - pp) >= 1,
			}),
			notable: Number(r.notable) === 1,
		};
	});
	return { dim, metric, direction: up ? "up" : "down", rows: out, truncated: rows.length > input.limit, periods: p, notices: [...notices, ...(input.search?.ignored.length ? ["filters_not_applied"] : [])] };
}

/** Pageviews of `ca_rollup` dim `page`; session filters cannot apply (rollup rows are per dimension value). */
function rollupPages(rc: ReportCtx, from: string, to: string): Frag {
	return { sql: "r.site = ? AND r.dim = 'page' AND r.seg = '' AND r.key <> ? AND r.day BETWEEN ? AND ?", params: [rc.site, OTHER, from, to] };
}

export async function trafficMovers(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const up = input.params.direction === "up";
	const { periods: p, notices } = await periods(rc, input, "traffic", 2);
	const { minImpressions } = floors(rc, input);
	const w = rollupPages(rc, p.previous.from, p.current.to);
	const rows = await rc.db.all(
		`WITH a AS (SELECT r.key AS key, SUM(CASE WHEN r.day >= ? THEN r.pageviews ELSE 0 END) AS c, SUM(CASE WHEN r.day < ? THEN r.pageviews ELSE 0 END) AS p FROM ca_rollup r WHERE ${w.sql} GROUP BY r.key)
SELECT a.key AS key, a.c AS c, a.p AS p, ${notableExpr("a.c", "a.p")} AS notable FROM a WHERE (a.c >= ? OR a.p >= ?) AND a.c - a.p ${up ? ">" : "<"} 0 ORDER BY ABS(a.c - a.p) DESC, a.key LIMIT ? OFFSET ?`,
		[p.current.from, p.current.from, ...w.params, minImpressions, minImpressions, input.limit + 1, input.offset],
	);
	const out = rows.slice(0, input.limit).map((r) => ({ ...moverRow(String(r.key), num(r.c), num(r.p)), notable: Number(r.notable) === 1 }));
	return { metric: "pageviews", direction: up ? "up" : "down", rows: out, truncated: rows.length > input.limit, periods: p, notices: [...notices, ...(input.filters.length ? ["filters_not_applied"] : [])] };
}

/** Diagnosis of a decaying page: `position`, `ctr` or `demand`. */
export function decayDiagnosis(posOld: number | null, posCur: number | null, ctrOld: number | null, ctrCur: number | null): "position" | "ctr" | "demand" {
	if (posOld !== null && posCur !== null && posCur - posOld >= 2) return "position";
	if (ctrOld !== null && ctrCur !== null && ctrCur < 0.75 * ctrOld) return "ctr";
	return "demand";
}

export async function searchDecay(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const { periods: p, notices } = await periods(rc, input, sourceOf(input), 3);
	const oldest = p.oldest as { from: string; to: string };
	const { minImpressions } = floors(rc, input);
	const w = searchWhere(rc, { ...input, from: oldest.from, to: p.current.to }, "page");
	const s = (cond: string, v: string) => `SUM(CASE WHEN ${cond} THEN d.${v} ELSE 0 END)`;
	const rows = await rc.db.all(
		`WITH a AS (SELECT d.page_key AS key, ${s("d.day < ?", "clicks")} AS c1, ${s("d.day >= ? AND d.day < ?", "clicks")} AS c2, ${s("d.day >= ?", "clicks")} AS c3, ${s("d.day < ?", "impressions")} AS i1, ${s("d.day >= ?", "impressions")} AS i3, ${s("d.day < ?", "pos_sum")} AS p1, ${s("d.day >= ?", "pos_sum")} AS p3 FROM ca_search_daily d WHERE ${w.sql} GROUP BY d.page_key)
SELECT a.key AS key, a.c1 AS c1, a.c2 AS c2, a.c3 AS c3, a.i1 AS i1, a.i3 AS i3, a.p1 AS p1, a.p3 AS p3, a.c1 - a.c3 AS loss FROM a WHERE a.c1 > a.c2 AND a.c2 > a.c3 AND a.i1 >= ? ORDER BY loss DESC, key LIMIT ? OFFSET ?`,
		[p.previous.from, p.previous.from, p.current.from, p.current.from, p.previous.from, p.current.from, p.previous.from, p.current.from, ...w.params, minImpressions, input.limit + 1, input.offset],
	);
	const out = rows.slice(0, input.limit).map((r) => {
		const po = pos(r.p1, r.i1);
		const pc = pos(r.p3, r.i3);
		return {
			key: String(r.key),
			oldest: num(r.c1),
			middle: num(r.c2),
			current: num(r.c3),
			loss: num(r.loss),
			position_oldest: po,
			position_current: pc,
			diagnosis: decayDiagnosis(po, pc, ratio(num(r.c1), num(r.i1)), ratio(num(r.c3), num(r.i3))),
		};
	});
	return { rows: out, truncated: rows.length > input.limit, periods: p, notices: [...notices, ...(input.search?.ignored.length ? ["filters_not_applied"] : [])] };
}

export async function trafficDecay(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const { periods: p, notices } = await periods(rc, input, "traffic", 3);
	const oldest = p.oldest as { from: string; to: string };
	const { minImpressions } = floors(rc, input);
	const w = rollupPages(rc, oldest.from, p.current.to);
	const rows = await rc.db.all(
		`WITH a AS (SELECT r.key AS key, SUM(CASE WHEN r.day < ? THEN r.pageviews ELSE 0 END) AS c1, SUM(CASE WHEN r.day >= ? AND r.day < ? THEN r.pageviews ELSE 0 END) AS c2, SUM(CASE WHEN r.day >= ? THEN r.pageviews ELSE 0 END) AS c3 FROM ca_rollup r WHERE ${w.sql} GROUP BY r.key)
SELECT a.key AS key, a.c1 AS c1, a.c2 AS c2, a.c3 AS c3, a.c1 - a.c3 AS loss FROM a WHERE a.c1 > a.c2 AND a.c2 > a.c3 AND a.c1 >= ? ORDER BY loss DESC, key LIMIT ? OFFSET ?`,
		[p.previous.from, p.previous.from, p.current.from, p.current.from, ...w.params, minImpressions, input.limit + 1, input.offset],
	);
	const out = rows.slice(0, input.limit).map((r) => ({ key: String(r.key), oldest: num(r.c1), middle: num(r.c2), current: num(r.c3), loss: num(r.loss) }));
	return { metric: "pageviews", rows: out, truncated: rows.length > input.limit, periods: p, notices: [...notices, ...(input.filters.length ? ["filters_not_applied"] : [])] };
}

