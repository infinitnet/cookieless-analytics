/** Private admin routes `data/query` and `data/export`: one report per call, `plugins:read`. */
import { PluginRouteError, pluginResponse } from "emdash";
import { z } from "zod";
import type { KvLike } from "../core/crypto.js";
import { addDays, zonedToEpoch } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { stateKv } from "../db/facts.js";
import { QueryError } from "../query/compile.js";
import { exportBody } from "../query/export.js";
import { FilterSchema, FUNNEL_MODES, FunnelStepsSchema, GoalSchema, type Goal, QuerySchema } from "../query/filters.js";
import { type Annotation, type AnnotationView, annotationView, matchAnnotations, normalizeAnnotation } from "../annotations/scope.js";
import type { FunnelDef } from "../query/reports/base.js";
import { EXPORT_LIMIT, MAX_LIMIT, ParamsSchema, REPORTS, type ReportResult, REPORT_NAMES, runReport } from "../query/reports/index.js";
import { rawFromDay } from "../query/retention.js";
import { KV_WATERMARK } from "../query/rollup.js";
import { siteSetting } from "../core/site-settings.js";
import { bindSite, registry, type SitesColl } from "../multisite/registry.js";
import type { Remote } from "../multisite/proxy.js";
import type { Settings } from "../settings.js";
import { bingConfigured, pageQueries, queryPages } from "../sources/bing.js";
import { pageKeyFor, propertyOrigin } from "../sources/page-key.js";
import type { AnnotationStore } from "../query/reports/base.js";
import { loadCollections, type SchemaLike } from "../query/reports/collections.js";
import { routedSitesDb } from "../query/reports/sites-summary.js";
import type { Http } from "../sources/types.js";
import { buildCatalog } from "../agent/schemas.js";


/** `sitesDb` of a cross-site read when sites live in several databases. */
function sitesDbOf(env: { db(site?: string): Promise<Db> }, kv: KvLike | undefined) {
	const sitesDb = routedSitesDb((site) => env.db(site), kv);
	return sitesDb ? { sitesDb } : {};
}

/** The last stored summary day for the report context (absent before the first closed day). */
async function watermark(kv: { get<T>(k: string): Promise<T | null> }): Promise<{ summaryThrough?: string }> {
	const w = await kv.get<string>(KV_WATERMARK);
	return w ? { summaryThrough: w } : {};
}
export const DataQueryBody = z
	.object({
		report: z.enum(REPORT_NAMES),
		query: QuerySchema,
		params: ParamsSchema.optional(),
		limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
		offset: z.number().int().min(0).max(100_000).optional(),
		withAnnotations: z.boolean().optional(),
	})
	.strict();
export type DataQueryInput = z.input<typeof DataQueryBody>;

export const DataExportBody = z
	.object({
		report: z.enum(REPORT_NAMES),
		query: QuerySchema,
		params: ParamsSchema.optional(),
		format: z.enum(["csv", "json"]),
		limit: z.number().int().min(1).max(EXPORT_LIMIT).optional(),
	})
	.strict();
export type DataExportInput = z.input<typeof DataExportBody>;

export interface Coll {
	query(o?: { where?: Record<string, unknown>; limit?: number; cursor?: string }): Promise<{ items: Array<{ id: string; data: unknown }>; cursor?: string; hasMore: boolean }>;
	get(id: string): Promise<unknown>;
}

/** The parts of the host `RouteContext` this route reads. */
export interface DataCtx {
	input: unknown;
	storage: Partial<Record<"goals" | "funnels" | "segments" | "annotations", Coll>> & { sites?: Pick<SitesColl, "query"> };
	/** Plugin KV: the raw window (rollup fallback) is read from the retention cursor. */
	kv?: KvLike;
	/** Outbound HTTP for the on-demand Bing page queries (`search_page_queries`). */
	http?: Http;
	/** Schema discovery (`schema:read`): the collections of the `collections` report. */
	schema?: SchemaLike;
	/** Set by the share renderer (and the email renderer): `site_search` hides one session terms. */
	publicSurface?: boolean;
}

export interface DataEnv {
	/** The database of `site`'s analytics tables. */
	db(site?: string): Promise<Db>;
	settings(): Promise<Settings>;
	/** Epoch seconds; defaults to the clock. */
	now?(): number;
	/** Remote satellites of the integration options; `data/query` and `data/export` proxy to them. */
	remote?: Remote;
}

const MAX_PAGES = 5;

/** Up to five pages of 100. `info.truncated` reports whether more items exist. */
export async function loadAll(
	coll: Coll | undefined,
	where: Record<string, unknown>,
	opts: { orderBy?: Record<string, "asc" | "desc">; info?: { truncated?: boolean } } = {},
): Promise<Array<{ id: string; data: unknown }>> {
	if (!coll) return [];
	const out: Array<{ id: string; data: unknown }> = [];
	let cursor: string | undefined;
	for (let i = 0; i < MAX_PAGES; i++) {
		const page = await coll.query({ where, limit: 100, ...(opts.orderBy ? { orderBy: opts.orderBy } : {}), ...(cursor ? { cursor } : {}) });
		out.push(...page.items);
		if (opts.info) opts.info.truncated = page.hasMore && i === MAX_PAGES - 1;
		if (!page.hasMore || !page.cursor) break;
		cursor = page.cursor;
	}
	return out;
}

/** The site's annotations of a day range, newest 500 first, normalized. */
export async function loadAnnotations(coll: Coll | undefined, site: string, from: string, to: string, tz: string): Promise<{ items: Annotation[]; truncated: boolean }> {
	const info: { truncated?: boolean } = {};
	const ts = { gte: zonedToEpoch(from, 0, tz), lt: zonedToEpoch(addDays(to, 1), 0, tz) };
	const items: Annotation[] = [];
	for (const it of await loadAll(coll, { site, ts }, { orderBy: { ts: "desc" }, info })) {
		const a = normalizeAnnotation(it.data, it.id);
		if (a) items.push(a);
	}
	return { items, truncated: !!info.truncated };
}

const SiteItem = z.object({ site: z.string() }).passthrough();
const FunnelItem = z.object({ name: z.string().max(64), steps: FunnelStepsSchema, mode: z.enum(FUNNEL_MODES).optional() });
const SegmentItem = z.object({ site: z.string(), name: z.string().optional(), filters: z.array(FilterSchema).max(20) });

/** A segment of the site by id, or `unknown_segment`. */
async function loadSegment(ctx: DataCtx, id: string, site: string) {
	const seg = SegmentItem.safeParse(await ctx.storage.segments?.get(id));
	if (!seg.success || seg.data.site !== site) throw new PluginRouteError("unknown_segment", "Unknown segment.", 400);
	return { ref: { id, name: seg.data.name ?? id }, filters: seg.data.filters };
}

/** Valid goals of the site from the `goals` collection. */
export async function loadGoals(coll: Coll | undefined, site: string): Promise<Goal[]> {
	const goals: Goal[] = [];
	for (const it of await loadAll(coll, { site })) {
		const g = GoalSchema.safeParse(it.data);
		if (g.success && SiteItem.safeParse(it.data).data?.site === site) goals.push(g.data);
	}
	return goals;
}

/** Goal names by record id of the site (a goal target of an annotation names its goal by id). */
async function goalNames(coll: Coll | undefined, site: string): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	for (const it of await loadAll(coll, { site })) {
		const g = GoalSchema.safeParse(it.data);
		if (g.success) out.set(it.id, g.data.name);
	}
	return out;
}

function routeError(err: unknown): never {
	if (err instanceof QueryError) throw new PluginRouteError(err.code, err.message, 400);
	throw err;
}

export type Body = {
	report: z.output<typeof DataQueryBody>["report"];
	query: z.output<typeof QuerySchema>;
	params?: z.output<typeof ParamsSchema> | undefined;
	limit?: number | undefined;
	offset?: number | undefined;
	withAnnotations?: boolean | undefined;
	/** `sites_summary`: an agent key's site restriction (empty or absent: every site of this database). */
	allowedSites?: readonly string[] | undefined;
};

/** Reports that embed their matching annotations. */
export const SERIES_REPORTS: ReadonlySet<string> = new Set(["timeseries", "satisfaction_series", "search_overview", "revenue_series"]);

export type LoadedAnnotations = Awaited<ReturnType<typeof loadAnnotations>>;

/**
 * Reads one dashboard run shares across its requests: the annotations the runner read once, and the goals and the
 * raw window state of a site, read on first use and kept for the rest of the run.
 */
export interface Preloaded {
	annotations: LoadedAnnotations;
	memo: Map<string, Promise<unknown>>;
}

/**
 * Resolve segment, goals, funnels, annotations and the raw window, then run the report. Shared with the
 * agent API. `preloaded` replaces the annotation read and keeps goals and the raw window state for a dashboard run.
 */
export async function answer(env: DataEnv, ctx: DataCtx, body: Body, preloaded?: Preloaded): Promise<ReportResult> {
	const s = await env.settings();
	const bound = await bindSite(body.query.site, s.siteId, ctx.storage.sites);
	const site = bound.id;
	const once = <T>(key: string, load: () => Promise<T>): Promise<T> => {
		if (!preloaded) return load();
		let p = preloaded.memo.get(key) as Promise<T> | undefined;
		if (!p) preloaded.memo.set(key, (p = load()));
		return p;
	};

	let filters = body.query.filters;
	const segA = body.query.segment ? await loadSegment(ctx, body.query.segment, site) : undefined;
	if (segA) filters = [...segA.filters, ...filters];
	// Side B of a segment comparison: the ad hoc filters with the compare segment in the segment slot.
	const segB = body.query.compare === "segment" && body.query.compareSegment ? await loadSegment(ctx, body.query.compareSegment, site) : undefined;

	const goals = await once(`goals:${site}`, () => loadGoals(ctx.storage.goals, site));
	const funnels: Record<string, FunnelDef> = {};
	if (body.report === "funnels" && body.params?.funnel) {
		const raw = await ctx.storage.funnels?.get(body.params.funnel);
		const f = FunnelItem.safeParse(raw);
		if (f.success && SiteItem.safeParse(raw).data?.site === site) funnels[body.params.funnel] = f.data;
	}
	let annotations: AnnotationView[] = [];
	let meta: ReportResult["meta"];
	if (body.withAnnotations || SERIES_REPORTS.has(body.report)) {
		const { from, to } = body.query;
		const tz = s.siteTimezone;
		const loaded = preloaded?.annotations ?? (await loadAnnotations(ctx.storage.annotations, site, from, to, tz));
		const target = REPORTS[body.report][0];
		annotations = matchAnnotations(loaded.items, { site, from, to, tz, target, filters }).map((a) => annotationView(a, tz));
		meta = { annotations: { matched: annotations.length, loaded: loaded.items.length, truncated: loaded.truncated } };
	}

	const now = env.now?.() ?? Math.floor(Date.now() / 1000);
	const kv = ctx.kv;
	const rc = {
		db: await env.db(site),
		site,
		settings: s,
		now,
		goals,
		funnels,
		annotations,
		defaultCurrency: siteSetting(s, bound.client, "defaultCurrency"),
		...(kv ? await once(`state:${site}`, async () => ({ rawFrom: await rawFromDay(stateKv(kv, site), s, now), ...(await watermark(stateKv(kv, site))) })) : {}),
		...(body.report === "search_page_queries" ? bingDrawer(ctx, s, bound.client?.bingSiteUrl ?? s.bingSiteUrl) : {}),
		...(body.report === "search_cannibalization_query" ? bingQueryDrawer(ctx, s, bound.client?.bingSiteUrl ?? s.bingSiteUrl) : {}),
		...(body.report === "site_search" ? { siteSearchParams: siteSetting(s, bound.client, "siteSearchParams"), publicSurface: !!ctx.publicSurface } : {}),
		...(body.report === "collections" ? { collections: bound.client ? null : await loadCollections(ctx.schema) } : {}),
		...(body.report === "impact" || body.report === "annotation_impacts" ? { annotationStore: annotationStore(ctx.storage.annotations, site, s.siteTimezone, now) } : {}),
		...(body.report === "annotation_impacts" ? { goalNames: await goalNames(ctx.storage.goals, site) } : {}),
		...(body.report === "sites_summary" ? { sites: await summarySites(ctx, s.siteId, body.allowedSites), ...sitesDbOf(env, ctx.kv) } : {}),
	};
	// A dashboard impact tile names its goal by record id; the goals report keys rows by name.
	let params = body.params;
	if (body.report === "impact" && params?.goal) {
		const raw = await ctx.storage.goals?.get(params.goal);
		const g = GoalSchema.safeParse(raw);
		if (g.success && SiteItem.safeParse(raw).data?.site === site) params = { ...params, goal: g.data.name };
	}
	let result: ReportResult;
	try {
		result = await runReport(rc, {
			report: body.report,
			query: { ...body.query, filters },
			...(params ? { params } : {}),
			...(segB ? { compareFilters: [...segB.filters, ...body.query.filters], compareSegment: segB.ref } : {}),
			...(body.limit !== undefined ? { limit: body.limit } : {}),
			...(body.offset !== undefined ? { offset: body.offset } : {}),
		});
	} catch (err) {
		routeError(err);
	}
	if (segB && segA) result = { ...result, segment: segA.ref };
	if (!meta) return result;
	// The dispatcher cache shares result objects: copy, never mutate.
	return { ...result, ...(body.withAnnotations && !SERIES_REPORTS.has(body.report) ? { data: { ...result.data, annotations } } : {}), meta };
}

/** The sites of this database (local and client, never remote) a `sites_summary` lists. */
export async function summarySites(ctx: Pick<DataCtx, "storage">, siteId: string, allowed?: readonly string[]): Promise<string[]> {
	const all = [siteId, ...(await registry(ctx.storage.sites)).sites.map((c) => c.id)];
	return allowed?.length ? all.filter((id) => allowed.includes(id)) : all;
}

/** The Bing lookup of the per-page drawer: page URLs are the Bing site URL's origin plus the page key. */
function bingDrawer(ctx: DataCtx, s: Settings, siteUrl: string) {
	const { http, kv } = ctx;
	if (!http || !kv || !bingConfigured(s) || !siteUrl) return {};
	const origin = propertyOrigin(siteUrl);
	return { bingPageQueries: (page: string) => pageQueries({ http, kv, settings: s }, siteUrl, origin + page) };
}

/** The Bing lookup of the query drill-down: page URLs map to page keys of the Bing site URL's host. */
function bingQueryDrawer(ctx: DataCtx, s: Settings, siteUrl: string) {
	const { http, kv } = ctx;
	if (!http || !kv || !bingConfigured(s) || !siteUrl) return {};
	const key = pageKeyFor(propertyOrigin(siteUrl));
	return {
		bingQueryPages: async (query: string) =>
			(await queryPages({ http, kv, settings: s }, siteUrl, query)).flatMap((r) => {
				const page = key(r.url);
				return page === null ? [] : [{ page, day: r.day, clicks: r.clicks, impressions: r.impressions, pos_sum: r.pos_sum }];
			}),
	};
}

/** Annotation lookups of `impact`: one record by id, the newest (of one kind), or a day range. */
export function annotationStore(coll: Coll | undefined, site: string, tz: string, now = Math.floor(Date.now() / 1000)): AnnotationStore {
	return {
		async resolve(ref, kind) {
			if (ref !== "latest") {
				const raw = await coll?.get(ref);
				const a = normalizeAnnotation(raw, ref);
				return a && a.site === site ? a : null;
			}
			// `kind` is not an indexed field: scan the newest 500 of the site and keep the newest match.
			let best: Annotation | null = null;
			for (const it of await loadAll(coll, { site }, { orderBy: { ts: "desc" } })) {
				const a = normalizeAnnotation(it.data, it.id);
				// A note dated in the future cannot be measured yet; `latest` means the newest one that happened.
				if (a && a.ts <= now && (!kind || a.kind === kind) && (!best || a.ts > best.ts)) best = a;
			}
			return best;
		},
		inRange: async (from, to) => (await loadAnnotations(coll, site, from, to, tz)).items,
	};
}

/**
 * The satellite a body names, or null: a configured remote id that is neither the local `siteId` nor a client
 * site of the registry (this database wins on a collision).
 */
async function remoteOf(env: DataEnv, ctx: DataCtx, site: string | undefined): Promise<string | null> {
	if (!site || !env.remote?.find(site)) return null;
	if (site === (await env.settings()).siteId || (await registry(ctx.storage.sites)).byId.has(site)) return null;
	return site;
}

/** Forward the body to the satellite's `agent/v1/query`; failures are a typed `remote_error` without the remote body. */
async function proxied(remote: Remote, ctx: DataCtx, site: string, body: z.output<typeof DataQueryBody>): Promise<ReportResult> {
	// shortcut: a remote export is capped at the agent API's page size; page through `offset` if a satellite export needs more.
	const r = await remote.query(ctx.http, site, body.limit && body.limit > MAX_LIMIT ? { ...body, limit: MAX_LIMIT } : body);
	if (r.ok) return r.data as ReportResult;
	const text = r.reason === "key_missing" ? "The key of this connected site is not set on this install (key_missing)." : `The connected site did not answer (${r.reason}${r.status ? ` ${r.status}` : ""}).`;
	throw new PluginRouteError("remote_error", text, 502, { status: r.status, reason: r.reason });
}

/** `answer`, or the satellite's answer when `query.site` names a remote satellite. */
async function answerAny(env: DataEnv, ctx: DataCtx, body: z.output<typeof DataQueryBody>): Promise<ReportResult> {
	const site = await remoteOf(env, ctx, body.query.site);
	return site && env.remote ? proxied(env.remote, ctx, site, body) : answer(env, ctx, body);
}

export function dataQueryRoute(env: DataEnv) {
	return {
		permission: "plugins:read" as const,
		input: DataQueryBody,
		handler: (ctx: DataCtx) => answerAny(env, ctx, DataQueryBody.parse(ctx.input)),
	};
}

/** The same report as a file download: CSV or JSON rows, up to 10 000. */
export function dataExportRoute(env: DataEnv) {
	return {
		permission: "plugins:read" as const,
		// The host passes a `pluginResponse` through only on raw routes (`plugins/http-route-dispatch.ts`).
		response: "raw" as const,
		input: DataExportBody,
		async handler(ctx: DataCtx) {
			const body = DataExportBody.parse(ctx.input);
			const { format: _f, ...req } = body;
			const result = await answerAny(env, ctx, { ...req, limit: body.limit ?? EXPORT_LIMIT });
			const out = exportBody(result, body.format);
			return pluginResponse({
				status: 200,
				headers: { "content-type": out.contentType, "content-disposition": `attachment; filename="${out.filename}"` },
				body: { kind: "text", value: out.body },
			});
		},
	};
}

export const CatalogBody = z.object({}).strict();

/** `data/catalog`: the agent catalog (`agent/v1/reports`) for host users and the MCP tool `analytics_catalog`. */
export function dataCatalogRoute() {
	return {
		permission: "plugins:read" as const,
		input: CatalogBody,
		handler: async (ctx: Pick<DataCtx, "input">) => (CatalogBody.parse(ctx.input ?? {}), buildCatalog()),
	};
}
