/**
 * Bing Webmaster source. JSON API at `https://ssl.bing.com/webmaster/api.svc/json/<Method>`
 * with `siteUrl` in the query and the API key in `apikey` (or an OAuth bearer token, `bing-auth.ts`). Bing takes no date range: every call returns its whole window
 * of dated rows (`{ d: [...] }`, dates as WCF `/Date(ms)/` at UTC midnight), so one window pull of three
 * calls stores every returned day, and a Bing backfill is that same pull. Shapes verified on the live API
 * (docs/design-notes.md): `GetRankAndTrafficStats` gives daily totals; `GetQueryStats` and `GetPageStats`
 * give weekly rows `{ Date, Query, Clicks, Impressions, AvgImpressionPosition }` with the page URL in
 * `Query` for pages; `GetUserSites` gives `{ Url, IsVerified }`. Bing has no country or device.
 */
import { base64url, type KvLike, sha256 } from "../core/crypto.js";
import { bingAccessToken, type BingSettings, bingConfigured } from "./bing-auth.js";
import { fetchJson } from "./gsc-auth.js";
import { type Budget, type Http, type SearchRow, type SearchSource, SourceError, type SiteTarget, type SourceCtx, ThrottledError } from "./types.js";

export { bingConfigured } from "./bing-auth.js";
export const BING_API = "https://ssl.bing.com/webmaster/api.svc/json/";
export const PAGE_QUERIES_TTL_MS = 3_600_000;
/** The in-tick retry after a throttle waits 2 to 5 seconds (jittered so parallel installs spread out). */
export const THROTTLE_WAIT_MS = [2_000, 5_000] as const;

type BingCtx = { http: Http; settings: BingSettings; now?(): number };

/** The API URL; the key goes in `apikey` in API key mode, OAuth sends a bearer token instead. */
export function bingUrl(method: string, apiKey: string, params: Record<string, string> = {}): string {
	return `${BING_API}${method}?${new URLSearchParams({ ...(apiKey ? { apikey: apiKey } : {}), ...params })}`;
}

async function once(ctx: BingCtx, method: string, params: Record<string, string>): Promise<unknown> {
	const s = ctx.settings;
	const oauth = s.bingAuth === "oauth";
	const headers: Record<string, string> = { accept: "application/json", ...(oauth ? { authorization: `Bearer ${await bingAccessToken(ctx)}` } : {}) };
	// Bing answers a throttled caller with 400 `ThrottleIP`, `ThrottleUser` or `ThrottleHost`: not an error of the connection.
	return fetchJson(ctx.http, bingUrl(method, oauth ? "" : s.bingApiKey, params), { headers }, "Bing Webmaster").catch((e: unknown) => {
		const code = e instanceof SourceError ? /\((Throttle[A-Za-z]*)\)/.exec(e.message)?.[1] : undefined;
		throw code ? new ThrottledError(code, e instanceof Error ? e.message : code) : e;
	});
}

/**
 * One API call. With a tick budget, a throttled answer is retried once after a short jittered wait when
 * the budget still has room (some calls pass between throttles, and one pass of each method is enough).
 */
async function call(ctx: BingCtx & { budget?: Budget; sleep?(ms: number): Promise<void> }, method: string, params: Record<string, string> = {}): Promise<Array<Record<string, unknown>>> {
	ctx.budget?.spend();
	let body: unknown;
	try {
		body = await once(ctx, method, params);
	} catch (e) {
		if (!(e instanceof ThrottledError) || !ctx.budget) throw e;
		const [lo, hi] = THROTTLE_WAIT_MS;
		await (ctx.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(lo + Math.floor(Math.random() * (hi - lo)));
		ctx.budget.spend();
		body = await once(ctx, method, params);
	}
	const d = (body as { d?: unknown } | null)?.d;
	return Array.isArray(d) ? (d as Array<Record<string, unknown>>) : [];
}

/** `/Date(1752451200000)/` (optionally with an offset suffix) as `YYYY-MM-DD` in UTC, or null. */
export function wcfDay(v: unknown): string | null {
	const m = typeof v === "string" ? /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(v) : null;
	return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : null;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

function stat(r: Record<string, unknown>): Pick<SearchRow, "clicks" | "impressions" | "pos_sum"> {
	const impressions = Math.round(n(r.Impressions));
	// `AvgClickPosition` is -1 without clicks; the impression position is the one that matches Google's `position`.
	return { clicks: Math.round(n(r.Clicks)), impressions, pos_sum: n(r.AvgImpressionPosition) * impressions };
}

/** Rows of the three methods grouped by day, page keys normalized for the site, other hosts dropped. */
export function windowRows(totals: ReadonlyArray<Record<string, unknown>>, queries: ReadonlyArray<Record<string, unknown>>, pages: ReadonlyArray<Record<string, unknown>>, target: Pick<SiteTarget, "pageKey">): Map<string, SearchRow[]> {
	const out = new Map<string, SearchRow[]>();
	const add = (day: string | null, row: SearchRow | null) => {
		if (!day || !row) return;
		const list = out.get(day);
		if (list) list.push(row);
		else out.set(day, [row]);
	};
	const blank = { page_key: "", query: "", country: "", device: "" };
	for (const r of totals) add(wcfDay(r.Date), { ...blank, ...stat(r) });
	for (const r of queries) {
		const q = typeof r.Query === "string" ? r.Query.trim().slice(0, 512) : "";
		add(wcfDay(r.Date), q ? { ...blank, query: q, ...stat(r) } : null);
	}
	for (const r of pages) {
		const k = typeof r.Query === "string" ? target.pageKey(r.Query) : null;
		add(wcfDay(r.Date), k === null ? null : { ...blank, page_key: k, ...stat(r) });
	}
	return out;
}

/** The whole Bing window of a site: three calls, rows by day. */
export async function fetchWindow(ctx: SourceCtx, target: SiteTarget): Promise<Map<string, SearchRow[]>> {
	const site = { siteUrl: target.property };
	const totals = await call(ctx, "GetRankAndTrafficStats", site);
	const queries = await call(ctx, "GetQueryStats", site);
	const pages = await call(ctx, "GetPageStats", site);
	return windowRows(totals, queries, pages, target);
}

export interface BingSite {
	siteUrl: string;
	verified: boolean;
}

/** Sites of the key owner; unverified entries hidden. */
export async function listBingSites(ctx: BingCtx): Promise<BingSite[]> {
	return (await call({ http: ctx.http, settings: ctx.settings, ...(ctx.now ? { now: ctx.now } : {}) }, "GetUserSites"))
		.filter((r) => typeof r.Url === "string" && r.IsVerified === true)
		.map((r) => ({ siteUrl: r.Url as string, verified: true }));
}

export interface PageQueryRow {
	query: string;
	day: string;
	clicks: number;
	impressions: number;
	pos_sum: number;
}

/**
 * Queries of one page URL on demand (`GetPageQueryStats`), cached one hour in
 * `kv search:pagequeries:<hash>` so reopening the drawer costs no provider call.
 */
export async function pageQueries(ctx: { http: Http; kv: KvLike; settings: BingSettings; now?(): number }, siteUrl: string, pageUrl: string): Promise<PageQueryRow[]> {
	const now = ctx.now?.() ?? Date.now();
	const key = `search:pagequeries:${base64url(await sha256(`${siteUrl}\n${pageUrl}`)).slice(0, 32)}`;
	const hit = await ctx.kv.get<{ at: number; rows: PageQueryRow[] }>(key);
	if (hit && now - hit.at < PAGE_QUERIES_TTL_MS) return hit.rows;
	const rows: PageQueryRow[] = [];
	for (const r of await call(ctx, "GetPageQueryStats", { siteUrl, page: pageUrl })) {
		const day = wcfDay(r.Date);
		const query = typeof r.Query === "string" ? r.Query.trim().slice(0, 512) : "";
		if (day && query) rows.push({ query, day, ...stat(r) });
	}
	await ctx.kv.set(key, { at: now, rows });
	return rows;
}

export interface QueryPageRow {
	/** The page URL as Bing returns it (in the field named `Query`, like `GetPageStats`). */
	url: string;
	day: string;
	clicks: number;
	impressions: number;
	pos_sum: number;
}

/**
 * Pages of one query on demand (`GetQueryPageStats`), cached one hour in
 * `kv search:querypages:<hash>`. Bing returns per day rows with the page URL in `Query`, the same row
 * type as `GetPageStats` (field names to confirm on the preview, docs/release.md).
 */
export async function queryPages(ctx: { http: Http; kv: KvLike; settings: BingSettings; now?(): number }, siteUrl: string, query: string): Promise<QueryPageRow[]> {
	const now = ctx.now?.() ?? Date.now();
	const key = `search:querypages:${base64url(await sha256(`${siteUrl}\n${query}`)).slice(0, 32)}`;
	const hit = await ctx.kv.get<{ at: number; rows: QueryPageRow[] }>(key);
	if (hit && now - hit.at < PAGE_QUERIES_TTL_MS) return hit.rows;
	const rows: QueryPageRow[] = [];
	for (const r of await call(ctx, "GetQueryPageStats", { siteUrl, query })) {
		const day = wcfDay(r.Date);
		const url = typeof r.Query === "string" ? r.Query.trim() : "";
		if (day && url) rows.push({ url, day, ...stat(r) });
	}
	await ctx.kv.set(key, { at: now, rows });
	return rows;
}

export const bing: SearchSource = {
	id: "bing",
	configured: bingConfigured,
	async test(ctx, target) {
		const sites = await listBingSites(ctx);
		return { property: target.property, found: sites.some((x) => x.siteUrl === target.property) };
	},
	async fetchDay(ctx, target, day) {
		return (await fetchWindow(ctx, target)).get(day) ?? [];
	},
	fetchWindow,
};
