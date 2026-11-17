/**
 * Agent API: public routes with their own auth from the `X-Api-Key` header. Every auth or
 * scope failure is 404 with `{}` (no oracle). Responses are aggregates only, except the stored rows of `data/dump`
 * (scope `data:export`, backups and moves); the routes declare no
 * `cacheControl`, so the host sends `Cache-Control: private, no-store` (`plugins/http-route-dispatch.ts`).
 */
import { PluginRouteError, pluginResponse } from "emdash";
import { z } from "zod";
import { CONTRACT_VERSION } from "../contract.js";
import { randomId, type KvLike } from "../core/crypto.js";
import { addDays, dayInZone } from "../core/time.js";
import { isoDay } from "../db/dialect.js";
import { stateKv } from "../db/facts.js";
import { ensureSchemaOnce, schemaVersion } from "../db/schema.js";
import { recordAgentEvents } from "../core/agent-events.js";
import type { RateLimiter } from "../keys/ratelimit.js";
import type { Scope } from "../keys/scopes.js";
import { type KeyColl, verifyKey } from "../keys/store.js";
import type { Filter } from "../query/filters.js";
import type { ReportResult } from "../query/reports/index.js";
import { rawFromDay } from "../query/retention.js";
import { KV_WATERMARK } from "../query/rollup.js";
import { answer, type Coll, type DataCtx, type DataEnv, loadAnnotations } from "../routes/data.js";
import { annotationSearchMatches, annotationView, matchAnnotations, scopeInput, scopeSummary } from "../annotations/scope.js";
import { dropCounts, DROP_DAYS } from "../routes/privacy.js";
import { buildOpenApi } from "./openapi.js";
import { agentBounds, requiredScopes } from "./query.js";
import { AGENT_MAX_RANGE_DAYS, AgentQueryBody, EventsBody, AnnotationBody, AnnotationParams, BackfillBody, buildCatalog, DashboardDataBody, DashboardDeleteBody, DashboardSaveBody, ENDPOINTS, type Endpoint, RangeParams, SearchSyncBody, SiteParams, SummaryParams } from "./schemas.js";
import { bindSite, registry } from "../multisite/registry.js";
import { runDashboard } from "../dashboards/run.js";
import { deleteSharesOf, type ShareColl } from "../dashboards/shares.js";
import { DashboardError, tileNeedsSearch, withoutEmail } from "../dashboards/schema.js";
import { type DashColl, deleteDashboard, getDashboard, listDashboards, saveDashboard } from "../dashboards/store.js";
import { type DataFileEnv, dataFileHandlers } from "../routes/move-files.js";

interface WritableColl extends Coll {
	put(id: string, data: unknown): Promise<void>;
}

/** The parts of the host `RouteContext` the agent routes read. */
export interface AgentCtx {
	request: Request;
	input: unknown;
	kv: KvLike;
	storage: DataCtx["storage"] & { api_keys?: KeyColl; annotations?: WritableColl; dashboards?: DashColl; shares?: ShareColl };
	schema?: DataCtx["schema"];
}

export interface AgentEnv extends DataEnv {
	version: string;
	limiter: RateLimiter;
	/** Remote satellite ids: the agent API never proxies, they answer `site_not_allowed`. */
	remoteIds?(): readonly string[];
	/** Routing of sites to databases for `data/load` (its day budget and move check); absent: one database. */
	route?: DataFileEnv["route"];
	/** Search sources; absent means no source can sync yet. */
	search?: {
		sync(ctx: AgentCtx, body: z.output<typeof SearchSyncBody>): Promise<unknown>;
		backfill(ctx: AgentCtx, body: z.output<typeof BackfillBody>): Promise<unknown>;
	};
}

const send = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	pluginResponse({ status, headers: { "content-type": "application/json; charset=utf-8", ...headers }, body: { kind: "text", value: JSON.stringify(body) } });
const notFound = () => send(404, {});
const fail = (status: number, error: string, message: string) => send(status, { ok: false, error, message });

class InputError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
	const r = schema.safeParse(input ?? {});
	if (!r.success) throw new InputError("invalid_input", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ").slice(0, 500));
	return r.data;
}

/** Range from query parameters, defaulting to the last `days` days with today; bounded like `query`. */
function range(input: unknown, today: string, days: number, schema: typeof RangeParams | typeof AnnotationParams | typeof SummaryParams = RangeParams): { from: string; to: string } {
	const p = parse(schema, input);
	const to = p.to ?? today;
	const from = p.from ?? addDays(to, -(days - 1));
	if (from > to) throw new InputError("invalid_input", "from must not be after to");
	if (!((Date.parse(to) - Date.parse(from)) / 86_400_000 < AGENT_MAX_RANGE_DAYS)) throw new InputError("range_too_long", `The range is longer than ${AGENT_MAX_RANGE_DAYS} days.`);
	return { from, to };
}

export interface Run {
	ctx: AgentCtx;
	scopes: Scope[];
	/** The key's site restriction; empty means every site of this database. */
	keySites: string[];
	site: string;
	tz: string;
	now: number;
}
export interface Out {
	data: unknown;
	from?: string | null;
	to?: string | null;
	truncated?: boolean;
	/** Sent as is, without the envelope (the OpenAPI document). */
	raw?: boolean;
	/** Extra envelope `meta` fields (`annotations`). */
	meta?: Record<string, unknown>;
	/** Sent as this body and headers instead of the envelope (the NDJSON of `data/dump`). */
	text?: { value: string; headers: Record<string, string>; status?: number };
}

/** Fields of `search:state:<source>` that agents may see; anything else the sync stores stays private. */
export const SEARCH_STATE_FIELDS = ["lastRun", "status", "lastError"] as const;
const searchState = (v: unknown) =>
	Object.fromEntries(SEARCH_STATE_FIELDS.flatMap((k) => {
		const x = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
		return x === undefined || (x !== null && typeof x === "object") ? [] : [[k, x]];
	}));

/** Revenue results name their currency in the envelope `meta`. */
const reportOut = (r: ReportResult): Out => {
	const meta = { ...r.meta, ...(typeof r.data.currency === "string" ? { currency: r.data.currency } : {}) };
	return { data: r, from: r.range.from, to: r.range.to, truncated: !!r.data.truncated, ...(Object.keys(meta).length ? { meta } : {}) };
};

/** Route handlers by route name and method. */
export type Handlers = Record<string, Partial<Record<"GET" | "POST", (r: Run) => Promise<Out>>>>;
function handlers(env: AgentEnv): Handlers {
	return {
		...dataFileHandlers(env),
		"agent/v1/query": {
			async POST({ ctx, scopes, keySites, site }) {
				// A key with no read scope gets the same 404 for any body, valid or not.
				if (!scopes.includes("read:analytics") && !scopes.includes("read:search")) throw new ScopeError();
				const body = parse(AgentQueryBody, ctx.input);
				const bound = agentBounds(body);
				if (bound) throw new InputError(bound.error, bound.message);
				if (!requiredScopes(body).every((s) => scopes.includes(s))) throw new ScopeError();
				return reportOut(await answer(env, ctx, { ...body, query: { ...body.query, site }, limit: body.limit ?? 100, allowedSites: keySites }));
			},
		},
		"agent/v1/reports": {
			GET: async () => ({ data: buildCatalog() }),
		},
		"agent/v1/summary": {
			async GET({ ctx, site, tz, now }) {
				const r = range(ctx.input, dayInZone(now, tz), 7, SummaryParams);
				const compare = parse(SummaryParams, ctx.input).compare ?? "previous";
				const ov = await answer(env, ctx, { report: "overview", query: { ...r, site, filters: [], compare, granularity: "auto" } });
				const rev = await answer(env, ctx, { report: "revenue", query: { ...r, site, filters: [], compare: "none", granularity: "auto" } });
				const list = Array.isArray(rev.data.currencies) ? (rev.data.currencies as Array<{ currency: string; revenue: number; refunds: number; net_revenue: number; orders: number }>) : [];
				return reportOut({ ...ov, data: { ...ov.data, revenue: list.map(({ currency, revenue, refunds, net_revenue, orders }) => ({ currency, revenue, refunds, net_revenue, orders })) } });
			},
		},
		"agent/v1/status": {
			async GET({ ctx, site, now }) {
				parse(SiteParams, ctx.input);
				const s = await env.settings();
				const db = await env.db(site);
				// Watermark and retention state of the site's database.
				const dkv = stateKv(ctx.kv, site);
				const [last] = await db.all("SELECT MAX(day) AS day FROM ca_sessions WHERE site = ?", [site]);
				return {
					data: {
						version: env.version,
						contract: CONTRACT_VERSION,
						schema: await schemaVersion(db, ctx.kv),
						timezone: s.siteTimezone,
						lastHumanDay: last?.day == null ? null : isoDay(last.day),
						rawFrom: await rawFromDay(dkv, s, now),
						rollupWatermark: await dkv.get<string>(KV_WATERMARK),
						drops: { days: DROP_DAYS, byReason: await dropCounts(db, site, dayInZone(now, s.siteTimezone), DROP_DAYS) },
						// `search:state:<site>:<source>`: this site's sources only.
						search: Object.fromEntries((await ctx.kv.list(`search:state:${site}:`)).map((e) => [e.key.slice(14 + site.length), searchState(e.value)])),
					},
				};
			},
		},
		"agent/v1/annotations": {
			async GET({ ctx, site, tz, now }) {
				const r = range(ctx.input, dayInZone(now, tz), 30, AnnotationParams);
				const p = parse(AnnotationParams, ctx.input);
				const loaded = await loadAnnotations(ctx.storage.annotations, site, r.from, r.to, tz);
				// Concrete values become `is` filters, so the shared matching function decides.
				const filters: Filter[] = [];
				if (p.path) filters.push({ dim: "page", op: "is", values: [p.path] });
				if (p.host) filters.push({ dim: "host", op: "is", values: [p.host] });
				if (p.query) filters.push({ dim: "query", op: "is", values: [p.query] });
				const kept = filters.length ? matchAnnotations(loaded.items, { site, ...r, tz, target: p.query ? "search" : "traffic", filters }) : loaded.items;
				// The target is for the admin's tools only: chart payloads (and shared dashboards) carry the plain view.
				const items = kept.filter((a) => !p.q || annotationSearchMatches(a, p.q)).map((a) => ({ ...annotationView(a, tz), target: a.target ?? null })).sort((a, b) => b.ts - a.ts);
				return { data: { items }, ...r, truncated: loaded.truncated };
			},
			async POST({ ctx, site, now }) {
				const body = parse(AnnotationBody, ctx.input);
				if (!ctx.storage.annotations) throw new PluginRouteError("storage_unavailable", "The annotations collection is not available.", 500);
				const scope = scopeInput(body.path, body.scope);
				if (scope === null) throw new InputError("scope_conflict", "Send either path or scope, not both.");
				const item = { site, ts: body.ts ?? now, kind: body.kind, text: body.text, ...(scope ? { scope } : {}), ...(body.target ? { target: body.target } : {}) };
				const id = randomId(16);
				await ctx.storage.annotations.put(id, item);
				return { data: { id, ...item, summary: scopeSummary(scope) } };
			},
		},
		"agent/v1/search/sync": {
			async POST({ ctx, site }) {
				const body = parse(SearchSyncBody, ctx.input);
				if (!env.search) throw new InputError("search_unavailable", "No Search source can sync on this site.");
				return { data: await env.search.sync(ctx, { ...body, site }) };
			},
		},
		"agent/v1/search/backfill": {
			async POST({ ctx, site }) {
				const body = parse(BackfillBody, ctx.input);
				if (!env.search) throw new InputError("search_unavailable", "No Search source can sync on this site.");
				return { data: await env.search.backfill(ctx, { ...body, site }) };
			},
		},
		"agent/v1/dashboards": {
			async GET({ ctx, keySites }) {
				const p = parse(SiteParams, ctx.input);
				const s = await env.settings();
				const all = [s.siteId, ...(await registry(ctx.storage.sites)).sites.map((c) => c.id)];
				const sites = p.site ? [(await bindSite(p.site, s.siteId, ctx.storage.sites)).id] : keySites.length ? all.filter((x) => keySites.includes(x)) : all;
				const items = [];
				// The schedule and its recipients never leave through an agent route.
				for (const site of sites) items.push(...(await listDashboards(dashColl(ctx), site)).map(withoutEmail));
				return { data: { items } };
			},
		},
		"agent/v1/dashboards/data": {
			async POST({ ctx, scopes, site, tz, now }) {
				const body = parse(DashboardDataBody, ctx.input);
				const d = await dashboard(ctx, site, body.id);
				if (d.tiles.some(tileNeedsSearch) && !scopes.includes("read:search")) throw new ScopeError();
				const run = await runDashboard(
					{
						site,
						tz,
						now,
						dispatch: (b, a) => answer(env, ctx, b, a),
						loadAnnotations: (r) => loadAnnotations(ctx.storage.annotations, site, r.from, r.to, tz),
						segmentExists: async (id) => ((await ctx.storage.segments?.get(id)) as { site?: unknown } | null)?.site === site,
					},
					d,
					{ ...(body.range ? { range: body.range } : {}), ...(body.compare ? { compare: body.compare } : {}), annotations: true },
				);
				return { data: { id: d.id, name: d.name, ...run }, ...run.range };
			},
		},
		"agent/v1/dashboards/save": {
			async POST({ ctx, site, now }) {
				const body = parse(DashboardSaveBody, ctx.input);
				return { data: withoutEmail(await saveDashboard(dashColl(ctx), site, body.dashboard, now).catch(typedDash)) };
			},
		},
		"agent/v1/dashboards/delete": {
			async POST({ ctx, site }) {
				const body = parse(DashboardDeleteBody, ctx.input);
				if (!(await deleteDashboard(dashColl(ctx), site, body.id))) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
				if (ctx.storage.shares) await deleteSharesOf(ctx.storage.shares, site, body.id);
				return { data: { id: body.id, deleted: true } };
			},
		},
		"agent/v1/events": {
			async POST({ ctx, site, now }) {
				const body = EventsBody.safeParse(ctx.input ?? {});
				if (!body.success) throw new InputError("invalid_body", "Send an object with an events array of 1 to 20 items.");
				const settings = await env.settings();
				const db = await env.db(site);
				const bound = await bindSite(site, settings.siteId, ctx.storage.sites);
				const deps = { db, kv: stateKv(ctx.kv, site), settings, now, site, ...(bound.client ? { client: bound.client } : {}), ready: () => ensureSchemaOnce(db, ctx.kv) };
				return { data: await recordAgentEvents(deps, site, body.data.events) };
			},
		},
		"agent/v1/openapi.json": {
			GET: async () => ({ data: buildOpenApi(env.version), raw: true }),
		},
	};
}

class ScopeError extends Error {}

const typedDash = (err: unknown): never => {
	if (err instanceof DashboardError) throw new InputError(err.code, err.message);
	throw err;
};
function dashColl(ctx: AgentCtx): DashColl {
	if (!ctx.storage.dashboards) throw new PluginRouteError("storage_unavailable", "The dashboards collection is not available.", 500);
	return ctx.storage.dashboards;
}
async function dashboard(ctx: AgentCtx, site: string, id: string) {
	const d = await getDashboard(dashColl(ctx), site, id).catch(typedDash);
	if (!d) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
	return d;
}

/** The `site` of a request: `query.site` of a query body, else a top-level `site` (body or query string). */
function requestedSite(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const i = input as { site?: unknown; query?: { site?: unknown } };
	const v = i.query && typeof i.query === "object" && "site" in i.query ? i.query.site : i.site;
	return typeof v === "string" && v ? v : undefined;
}

/** Host route definitions keyed by route name. */
export function agentRoutes(env: AgentEnv) {
	const table = handlers(env);
	const routes: Record<string, { public: true; methods: Array<"GET" | "POST">; response: "raw"; handler(ctx: AgentCtx): Promise<unknown> }> = {};
	for (const [name, byMethod] of Object.entries(table)) {
		const declared = ENDPOINTS.filter((e) => e.name === name);
		routes[name] = {
			public: true,
			methods: declared.map((e) => e.method),
			response: "raw",
			async handler(ctx) {
				const method = ctx.request.method.toUpperCase() as Endpoint["method"];
				const e = declared.find((d) => d.method === method);
				const run = byMethod[method];
				const now = env.now?.() ?? Math.floor(Date.now() / 1000);
				// Only X-Api-Key is read: never a query string, never Authorization (the host owns Bearer tokens).
				const key = e && run && ctx.storage.api_keys ? await verifyKey(ctx.storage.api_keys, ctx.request.headers.get("x-api-key"), now) : null;
				if (!e || !run || !key) return notFound();
				const s = await env.settings();
				const wait = env.limiter(key.id, s.agentRateLimitPerMinute, now * 1000);
				if (wait) return send(429, { ok: false, error: "rate_limited", message: `More than ${s.agentRateLimitPerMinute} requests per minute.` }, { "retry-after": String(wait) });
				// `query` checks its scopes per report after parsing.
				if (e.scope && name !== "agent/v1/query" && !key.scopes.includes(e.scope)) return notFound();
				if (name === "agent/v1/query" && !key.scopes.includes("read:analytics") && !key.scopes.includes("read:search")) return notFound();
				// A key restricted to sites gets the same 404 for any other site.
				const requested = requestedSite(ctx.input) ?? s.siteId;
				// The catalog and the OpenAPI document belong to no site.
				// `GET dashboards` without `?site=` lists the key's own sites.
				const siteless = name === "agent/v1/reports" || name === "agent/v1/openapi.json" || (name === "agent/v1/dashboards" && !requestedSite(ctx.input));
				if (!siteless && key.sites.length && !key.sites.includes(requested)) return notFound();
				try {
					if (env.remoteIds?.().includes(requested)) throw new InputError("site_not_allowed", "The agent API serves the sites of this database only; ask the connected site itself.");
					const site = (await bindSite(requested, s.siteId, ctx.storage.sites)).id;
					const out = await run({ ctx, scopes: key.scopes, keySites: key.sites, site, tz: s.siteTimezone, now });
					if (out.raw) return send(200, out.data);
					if (out.text) return pluginResponse({ status: out.text.status ?? 200, headers: out.text.headers, body: { kind: "text", value: out.text.value } });
					return send(200, {
						ok: true,
						data: out.data,
						meta: { site, from: out.from ?? null, to: out.to ?? null, generatedAt: new Date(now * 1000).toISOString(), truncated: out.truncated ?? false, ...out.meta },
					});
				} catch (err) {
					if (err instanceof ScopeError) return notFound();
					if (err instanceof InputError) return fail(400, err.code, err.message);
					if (err instanceof PluginRouteError) return fail(err.status, err.code, err.message);
					throw err;
				}
			},
		};
	}
	return routes;
}
