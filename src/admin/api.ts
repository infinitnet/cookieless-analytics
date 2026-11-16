/** Admin calls to the private plugin routes. `apiFetch` adds the host CSRF header; `parseApiResponse` unwraps `{ data }`. */
import { apiFetch, getErrorMessage } from "emdash/plugin-utils";
import { useCallback, useEffect, useState } from "react";
import { PLUGIN_ID } from "../contract.js";
import type { FunnelMode, QueryInput } from "../query/filters.js";
import type { Params, ReportName, ReportResult } from "../query/reports/index.js";
import type { SiteEntry } from "../routes/sites.js";
import type { searchService } from "../routes/search.js";

export const API_BASE = `/_emdash/api/plugins/${PLUGIN_ID}/`;

const post = (route: string, body: unknown, signal?: AbortSignal) =>
	apiFetch(API_BASE + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });

/**
 * The first message of a `z.formatError` tree (the host's `error.details` for a refused body) with its field,
 * for example `name: Too small`; the `data` wrapper of a save body is left out of the field.
 */
export function firstIssue(tree: unknown, path: readonly string[] = []): string | null {
	if (!tree || typeof tree !== "object") return null;
	const t = tree as Record<string, unknown>;
	const own = Array.isArray(t._errors) ? t._errors.find((e): e is string => typeof e === "string") : undefined;
	if (own) {
		const field = (path[0] === "data" ? path.slice(1) : path).join(".");
		return field ? `${field}: ${own}` : own;
	}
	for (const [k, v] of Object.entries(t)) {
		const hit = k === "_errors" ? null : firstIssue(v, [...path, k]);
		if (hit) return hit;
	}
	return null;
}

/** POST a JSON body to a plugin route and return the unwrapped data; throws `Error(message)` on failure, an `AbortError` when `signal` fires. */
export async function call<T>(route: string, body: unknown = {}, signal?: AbortSignal): Promise<T> {
	try {
		const res = await post(route, body, signal);
		if (res.ok) return ((await res.json()) as { data: T }).data;
		const err = ((await res.json().catch(() => null)) as { error?: { message?: unknown; details?: unknown } } | null)?.error;
		const message = typeof err?.message === "string" && err.message ? err.message : "The request failed.";
		const issue = firstIssue(err?.details);
		throw new Error(issue ? `${message}: ${issue}` : message);
	} finally {
		// Connect, map, sync, import and backfill change what `search/status` answers.
		if (route.startsWith("search/") && route !== "search/status") resetSearchStatus();
	}
}

export interface ReportCall {
	report: ReportName;
	query: QueryInput;
	params?: Params;
	limit?: number;
	offset?: number;
	/** Matching annotations as `data.annotations`. */
	withAnnotations?: boolean;
}

/** `data/query` for the selected site; an empty site id means the local site and is left out. */
export function queryReport(site: string, req: ReportCall, signal?: AbortSignal): Promise<ReportResult> {
	return call<ReportResult>("data/query", withSite(site, req), signal);
}

/** `data/export` as a file download in the browser. */
export async function exportReport(site: string, req: ReportCall, format: "csv" | "json"): Promise<void> {
	const { offset: _o, ...rest } = withSite(site, req);
	const res = await post("data/export", { ...rest, format });
	if (!res.ok) throw new Error(await getErrorMessage(res, "The export failed."));
	const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${req.report}.${format}`;
	const url = URL.createObjectURL(await res.blob());
	const a = Object.assign(document.createElement("a"), { href: url, download: name });
	a.click();
	// Some browsers start the download asynchronously; revoking at once can cancel it.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const listSites = () => call<{ sites: SiteEntry[] }>("sites/list");

let apiSite = "";
/**
 * The selected site of this database (a client site) for config, segment, funnel and tool calls; empty
 * means the local site and leaves `site` out. Set by the page shell before the page renders.
 */
export function setApiSite(id: string): void {
	apiSite = id;
}
/** `body` with the selected site added when one is set. */
export const withApiSite = <T extends object>(body: T): T & { site?: string } => (apiSite ? { ...body, site: apiSite } : body);

export interface SegmentItem {
	id: string;
	data: { name: string; filters: NonNullable<QueryInput["filters"]> };
}
export const listSegments = () => call<{ items: SegmentItem[] }>("config/segments/list", withApiSite({ limit: 100 }));
export const saveSegment = (name: string, filters: NonNullable<QueryInput["filters"]>) =>
	call<{ id: string }>("config/segments/save", withApiSite({ data: { name, filters } }));

export interface FunnelItem {
	id: string;
	data: { name: string; mode?: FunnelMode };
}
export const listFunnels = () => call<{ items: FunnelItem[] }>("config/funnels/list", withApiSite({ limit: 100 }));

/** One stored config item; the server adds `site` to `data`. */
export interface Item<T> {
	id: string;
	data: T & { site?: string };
}
// shortcut: lists the first 100 items without paging; add the cursor when a site needs more.
export const listConfig = <T>(kind: string, extra: Record<string, unknown> = {}) =>
	call<{ items: Array<Item<T>>; truncated?: boolean }>(`config/${kind}/list`, withApiSite({ limit: 100, ...extra }));
/** Save new (no id) or replace; `site` is stamped by the server and must not be sent. */
export function saveConfig(kind: string, data: Record<string, unknown>, id?: string) {
	const { site: _s, ...rest } = data;
	return call<{ id: string }>(`config/${kind}/save`, withApiSite(id ? { id, data: rest } : { data: rest }));
}
export const deleteConfig = (kind: string, id: string) => call<{ deleted: boolean }>(`config/${kind}/delete`, withApiSite({ id }));

/** Error text of a failed call. */
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The answer of `search/status` (`src/routes/search.ts`). */
export type SearchStatus = Awaited<ReturnType<ReturnType<typeof searchService>["status"]>>;
export type SearchSourceStatus = SearchStatus["sources"][number];

/**
 * One Search source as the admin shows it: `off` not configured; `unmapped` configured
 * without a property for this site; `error` and `throttled` from the last sync; else `connected`.
 */
export type SearchSourceState = "off" | "unmapped" | "connected" | "error" | "throttled";
export interface SearchSummary {
	google: SearchSourceState;
	bing: SearchSourceState;
	/** Some source has stored rows for this site. */
	hasRows: boolean;
	/** Sources that are mapped (any state but `off` and `unmapped`): what the Source switch and Search columns may offer. */
	usable: Array<"google" | "bing">;
	/** The full route answer, for the Search page's details. */
	raw: SearchStatus;
}

export function sourceState(s: Pick<SearchSourceStatus, "configured" | "property" | "status" | "lastError">): SearchSourceState {
	if (!s.configured) return "off";
	if (!s.property) return "unmapped";
	if (s.status === "throttled") return "throttled";
	if (s.status !== "error") return "connected";
	// An older Bing sync recorded its throttling as a 429 error.
	return /Throttle|answered 429/.test(s.lastError ?? "") ? "throttled" : "error";
}

export function summarizeSearch(raw: SearchStatus): SearchSummary {
	const st = (id: "google" | "bing") => {
		const src = raw.sources.find((x) => x.id === id);
		return src ? sourceState(src) : "off";
	};
	const google = st("google");
	const bing = st("bing");
	return {
		google,
		bing,
		hasRows: raw.sources.some((x) => x.rows > 0),
		usable: (["google", "bing"] as const).filter((id) => (id === "google" ? google : bing) !== "off" && (id === "google" ? google : bing) !== "unmapped"),
		raw,
	};
}

// One `search/status` call per site for a minute: the panels of a page and the next admin page share it. A failed call is not kept.
const SEARCH_TTL_MS = 60_000;
const searchCache = new Map<string, { at: number; p: Promise<SearchSummary> }>();
function fetchSearchStatus(site: string): Promise<SearchSummary> {
	const hit = searchCache.get(site);
	if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.p;
	const p = call<SearchStatus>("search/status", site ? { site } : {}).then(summarizeSearch);
	p.catch(() => searchCache.get(site)?.p === p && searchCache.delete(site));
	searchCache.set(site, { at: Date.now(), p });
	return p;
}
/** Forget every cached Search status (tests; after a change that affects every site). */
export const resetSearchStatus = () => searchCache.clear();

/** True when the selected site has a connected and mapped Search source; false when the route is missing or fails. */
export const searchConfigured = () =>
	fetchSearchStatus(apiSite).then(
		(s) => s.usable.length > 0,
		() => false,
	);

export interface SearchStatusState {
	/** Null while loading, after an error, or when `on` is false. */
	status: SearchSummary | null;
	error: string | null;
	/** Fetch again, past the cache (after connecting, syncing or mapping a source). */
	reload: () => void;
}

/**
 * Search status of the selected site (`view.site`), shared by every caller on the page: one request per
 * site for the page lifetime. A remote site's sources are not known here: no request, `status` stays null.
 */
export function useSearchStatus(site: SiteEntry): SearchStatusState {
	const on = (site.kind ?? (site.local ? "local" : "remote")) !== "remote";
	// The same id convention as `setApiSite`: empty for the local site.
	const siteId = site.local ? "" : site.id;
	const [st, setSt] = useState<{ status: SearchSummary | null; error: string | null }>({ status: null, error: null });
	const [n, setN] = useState(0);
	useEffect(() => {
		if (!on) {
			setSt({ status: null, error: null });
			return;
		}
		let live = true;
		setSt({ status: null, error: null });
		fetchSearchStatus(siteId).then(
			(status) => live && setSt({ status, error: null }),
			(e: unknown) => live && setSt({ status: null, error: errorText(e) }),
		);
		return () => {
			live = false;
		};
	}, [siteId, on, n]);
	const reload = useCallback(() => {
		searchCache.delete(siteId);
		setN((x) => x + 1);
	}, [siteId]);
	return { ...st, reload };
}

function withSite(site: string, req: ReportCall): ReportCall {
	return site ? { ...req, query: { ...req.query, site } } : req;
}

export interface ReportState {
	data: ReportResult | null;
	error: string | null;
	loading: boolean;
	/** Run the same request again. */
	reload?: () => void;
}

// Reload functions of the reports on screen whose last call failed, for one "Try again" per page.
const failed = new Set<() => void>();

/** Run every failed report on screen again; returns how many were started. */
export function retryFailedReports(): number {
	const list = [...failed];
	failed.clear();
	for (const reload of list) reload();
	return list.length;
}

/**
 * Run a report whenever the site or the request changes. A change aborts the request still running
 * (a fast second filter click drops the first round); stale answers are dropped either way.
 */
export function useReport(site: string, req: ReportCall | null): ReportState {
	const [st, setSt] = useState<Omit<ReportState, "reload">>({ data: null, error: null, loading: req !== null });
	const [n, setN] = useState(0);
	const reload = useCallback(() => setN((x) => x + 1), []);
	const key = req ? JSON.stringify([site, req]) : "";
	useEffect(() => {
		if (!req) return;
		let live = true;
		const ctl = new AbortController();
		setSt((s) => ({ ...s, loading: true, error: null }));
		queryReport(site, req, ctl.signal).then(
			(data) => {
				if (!live) return;
				failed.delete(reload);
				setSt({ data, error: null, loading: false });
			},
			(e: unknown) => {
				if (!live) return;
				failed.add(reload);
				setSt({ data: null, error: errorText(e), loading: false });
			},
		);
		return () => {
			live = false;
			failed.delete(reload);
			ctl.abort();
		};
		// `key` stands for `site` and `req`.
	}, [key, n]);
	return { ...st, reload };
}
