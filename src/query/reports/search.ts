/** Search reports over `ca_search_daily`. Position is `SUM(pos_sum) / SUM(impressions)`. */
import { eachDay } from "../../core/time.js";
import { andFrags, type Frag, QueryError, type SearchGrainDim, TRUE } from "../compile.js";
import { annotationsIn, type Metrics, num, type ReportCtx, type ReportData, type Row, type RunInput, ratio, round } from "./base.js";

const GRAIN_DIMS: readonly SearchGrainDim[] = ["page", "query", "country", "device"];
export const COLUMN: Record<SearchGrainDim, string> = { page: "d.page_key", query: "d.query", country: "d.country", device: "d.device" };
/** Stored grains, smallest first: totals, page, query, country, device, page with query. */
const GRAINS: ReadonlyArray<readonly SearchGrainDim[]> = [[], ["page"], ["query"], ["country"], ["device"], ["page", "query"]];

/** Rows of the smallest stored grain that holds every needed dimension. */
export function grainPredicate(needs: ReadonlySet<SearchGrainDim>): Frag {
	const grain = GRAINS.find((g) => [...needs].every((n) => g.includes(n)));
	if (!grain) throw new QueryError("unsupported_filter", `Search data has no breakdown by ${[...needs].join(" and ")} together.`);
	return { sql: GRAIN_DIMS.map((d) => `${COLUMN[d]} ${grain.includes(d) ? "<> ''" : "= ''"}`).join(" AND "), params: [] };
}

export function searchWhere(rc: ReportCtx, input: RunInput, group: SearchGrainDim | null, extra: Frag = TRUE): Frag {
	const s = input.search;
	const needs = new Set<SearchGrainDim>(s?.needs ?? []);
	if (group) needs.add(group);
	const source = input.params.source && input.params.source !== "all" ? { sql: "d.source = ?", params: [input.params.source] } : TRUE;
	return andFrags([{ sql: "d.site = ? AND d.day BETWEEN ? AND ?", params: [rc.site, input.from, input.to] }, grainPredicate(needs), source, s?.pred ?? TRUE, extra]);
}

const SUMS = "SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum";

export function searchMetrics(r: Record<string, unknown>): Metrics {
	const clicks = num(r.clicks);
	const impressions = num(r.impressions);
	return { clicks, impressions, ctr: round(ratio(clicks, impressions)), position: round(ratio(num(r.pos_sum), impressions), 2) };
}

const notices = (input: RunInput) => (input.search?.ignored.length ? ["filters_not_applied"] : []);

/** Totals and a zero-filled daily series, with annotations (current run). */
export async function searchOverview(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const w = searchWhere(rc, input, null);
	const rows = await rc.db.all(`SELECT d.day AS day, ${SUMS} FROM ca_search_daily d WHERE ${w.sql} GROUP BY d.day`, w.params);
	const byDay = new Map(rows.map((r) => [String(r.day), r]));
	const total = { clicks: 0, impressions: 0, pos_sum: 0 };
	for (const r of rows) {
		total.clicks += num(r.clicks);
		total.impressions += num(r.impressions);
		total.pos_sum += num(r.pos_sum);
	}
	const series = eachDay(input.from, input.to).map((t) => ({ t, ...searchMetrics(byDay.get(t) ?? {}) }));
	const out: ReportData = { totals: searchMetrics(total), series, notices: notices(input) };
	if (!input.isCompare) out.annotations = annotationsIn(rc, input.from, input.to);
	return out;
}

function breakdown(group: SearchGrainDim, extra?: (input: RunInput) => Frag) {
	return async (rc: ReportCtx, input: RunInput): Promise<ReportData> => {
		const col = COLUMN[group];
		const w = searchWhere(rc, input, group, extra?.(input));
		const rows = await rc.db.all(
			`SELECT ${col} AS key, ${SUMS} FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${col} ORDER BY clicks DESC, impressions DESC, key LIMIT ? OFFSET ?`,
			[...w.params, input.limit + 1, input.offset],
		);
		return { rows: rows.slice(0, input.limit).map((r) => ({ key: String(r.key), ...searchMetrics(r) })), truncated: rows.length > input.limit, notices: notices(input) };
	};
}

export const searchQueries = breakdown("query");
export const searchPages = breakdown("page");
export const searchCountries = breakdown("country");
export const searchDevices = breakdown("device");
/**
 * Queries of one page key: Google from the stored page with query rows, Bing on demand through
 * `rc.bingPageQueries` (one provider call, cached one hour). With `all` both are merged per query.
 * Search filters do not apply to the Bing rows (`filters_not_applied`).
 */
export async function searchPageQueries(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	if (!input.params.page) throw new QueryError("invalid_params", "search_page_queries needs params.page.");
	const page = input.params.page;
	const source = input.params.source ?? "all";
	const pageInput = { ...input, search: { pred: input.search?.pred ?? TRUE, ignored: input.search?.ignored ?? [], needs: new Set([...(input.search?.needs ?? []), "page" as const]) } };
	const stored = breakdown("query", () => ({ sql: "d.page_key = ?", params: [page] }));
	if (source === "google" || !rc.bingPageQueries) return stored(rc, pageInput);
	// shortcut: the merge reads at most 1000 stored queries of the page; enough for a drawer, raise if pages carry more.
	const google = source === "all" ? await stored(rc, { ...pageInput, limit: 1000, offset: 0 }) : { rows: [] };
	const sums = new Map<string, { clicks: number; impressions: number; pos_sum: number }>();
	const add = (q: string, r: { clicks: number; impressions: number; pos_sum: number }) => {
		const cur = sums.get(q) ?? { clicks: 0, impressions: 0, pos_sum: 0 };
		sums.set(q, { clicks: cur.clicks + r.clicks, impressions: cur.impressions + r.impressions, pos_sum: cur.pos_sum + r.pos_sum });
	};
	for (const r of google.rows ?? []) add(r.key, { clicks: num(r.clicks), impressions: num(r.impressions), pos_sum: num(r.position) * num(r.impressions) });
	let live: Awaited<ReturnType<NonNullable<ReportCtx["bingPageQueries"]>>>;
	try {
		live = await rc.bingPageQueries(page);
	} catch (e) {
		if (source === "bing") throw new QueryError("source_error", e instanceof Error ? e.message : "Bing Webmaster did not answer.");
		live = [];
	}
	for (const r of live) if (r.day >= input.from && r.day <= input.to) add(r.query, r);
	const rows = [...sums]
		.map(([key, r]): Row => ({ key, ...searchMetrics(r) }))
		.sort((a, b) => num(b.clicks) - num(a.clicks) || num(b.impressions) - num(a.impressions) || (a.key < b.key ? -1 : 1));
	const filtered = (input.search?.pred ?? TRUE).sql !== TRUE.sql || (input.search?.ignored.length ?? 0) > 0;
	return { rows: rows.slice(input.offset, input.offset + input.limit), truncated: rows.length > input.offset + input.limit, notices: filtered ? ["filters_not_applied"] : [] };
}
