/**
 * Google Search Console source: `searchAnalytics/query` per window of days for the grains
 * totals (`date`), `page`, `query`, `page` with `query` (capped at `searchMaxRowsPerDay` per day), `country`
 * and `device`; a window of several days adds the `date` dimension, so one call returns every day of it
 * (Google: "date" is a valid dimension; cost grows with the range, hence the adaptive window of the sync);
 * `type: web`; `startRow` paging at 25000 rows. `dataState: all` includes the fresh days
 * that the sync marks provisional and re-pulls. Positions are stored as `pos_sum = position * impressions`.
 */
import { addDays } from "../core/time.js";
import { fetchJson, getAccessToken, gscConfigured, listProperties } from "./gsc-auth.js";
import type { SearchRow, SearchSource, SiteTarget, SourceCtx } from "./types.js";

export const GSC_PAGE_ROWS = 25_000;
type Dim = "date" | "page" | "query" | "country" | "device";
export const GSC_GRAINS: ReadonlyArray<readonly Dim[]> = [["date"], ["page"], ["query"], ["page", "query"], ["country"], ["device"]];

export const queryUrl = (property: string) => `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;

interface ApiRow {
	keys?: unknown[];
	clicks?: number;
	impressions?: number;
	position?: number;
}

/** One stored row from an API row, or null when its page is on another host or a key is empty. */
export function mapRow(dims: readonly Dim[], r: ApiRow, target: Pick<SiteTarget, "pageKey">): SearchRow | null {
	const row: SearchRow = { page_key: "", query: "", country: "", device: "", clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0), pos_sum: (r.position ?? 0) * (r.impressions ?? 0) };
	for (const [i, d] of dims.entries()) {
		const v = typeof r.keys?.[i] === "string" ? (r.keys[i] as string).trim() : "";
		if (d === "date") continue;
		if (!v) return null;
		if (d === "page") {
			const k = target.pageKey(v);
			if (k === null) return null;
			row.page_key = k;
		} else if (d === "query") row.query = v.slice(0, 512);
		// Google's codes as delivered, uppercased: ISO 3166-1 alpha-3 countries (`DEU`), devices (`DESKTOP`).
		else row[d] = v.toUpperCase().slice(0, 16);
	}
	return row;
}

/**
 * One grain over `from`..`to`. A single day sends the grain as is, `rowLimit` capped (page with query at
 * `searchMaxRowsPerDay`, Google's order: clicks descending). Several days add the `date` dimension, which
 * Google sorts by date with arbitrary order inside a day, so every row is paged out and each day is cut
 * to the cap after a stable sort by clicks: the same rows a single-day request returns.
 */
async function pullGrain(ctx: SourceCtx, target: SiteTarget, from: string, to: string, dims: readonly Dim[], token: string): Promise<{ byDay: Map<string, ApiRow[]>; total: number; req: readonly Dim[] }> {
	const multi = from !== to;
	const req: readonly Dim[] = multi && dims[0] !== "date" ? ["date", ...dims] : dims;
	const cap = dims.length === 2 ? ctx.settings.searchMaxRowsPerDay : Number.POSITIVE_INFINITY;
	const serverCap = multi ? Number.POSITIVE_INFINITY : cap;
	const byDay = new Map<string, ApiRow[]>();
	let total = 0;
	// shortcut: a grain needing more pages than one tick's budget never completes; the window halves down to one day, and real properties stay far below 25000 rows per day and grain.
	for (let startRow = 0; startRow < serverCap; ) {
		const rowLimit = Math.min(GSC_PAGE_ROWS, serverCap - startRow);
		ctx.budget.spend();
		const body = (await fetchJson(
			ctx.http,
			queryUrl(target.property),
			{
				method: "POST",
				headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
				body: JSON.stringify({ startDate: from, endDate: to, dimensions: req, type: "web", dataState: "all", rowLimit, startRow }),
			},
			"Search Console",
		)) as { rows?: ApiRow[] };
		const rows = Array.isArray(body.rows) ? body.rows : [];
		total += rows.length;
		for (const r of rows) {
			const day = multi ? r.keys?.[0] : from;
			if (typeof day !== "string" || day < from || day > to) continue;
			const list = byDay.get(day);
			if (list) list.push(r);
			else byDay.set(day, [r]);
		}
		if (rows.length < rowLimit) break;
		startRow += rows.length;
	}
	if (multi && Number.isFinite(cap)) for (const [day, list] of byDay) byDay.set(day, list.sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0)).slice(0, cap));
	return { byDay, total, req };
}

/** Every grain over `from`..`to`: rows by day (each day present) and the row count of the biggest grain. */
export async function fetchRange(ctx: SourceCtx, target: SiteTarget, from: string, to: string): Promise<{ days: Map<string, SearchRow[]>; largest: number }> {
	const days = new Map<string, SearchRow[]>();
	for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, []);
	let largest = 0;
	for (const dims of GSC_GRAINS) {
		const { byDay, total, req } = await pullGrain(ctx, target, from, to, dims, await getAccessToken(ctx));
		largest = Math.max(largest, total);
		for (const [day, rows] of byDay) {
			const out = days.get(day);
			if (!out) continue;
			for (const r of rows) {
				const m = mapRow(req, r, target);
				if (m) out.push(m);
			}
		}
	}
	return { days, largest };
}

export const google: SearchSource = {
	id: "google",
	configured: gscConfigured,
	async test(ctx, target) {
		const props = await listProperties(ctx);
		const p = props.find((x) => x.siteUrl === target.property);
		return { property: target.property, found: !!p, permissionLevel: p?.permissionLevel ?? null };
	},
	async fetchDay(ctx, target, day) {
		return (await fetchRange(ctx, target, day, day)).days.get(day) ?? [];
	},
	fetchRange,
};
