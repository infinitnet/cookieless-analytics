/**
 * Search routes. `search/status` is `plugins:read`; the others are `plugins:manage`:
 * `search/test`, `search/sync` (one forced tick for a site), `search/backfill` (start, cancel, status),
 * `search/oauth/start`, `search/oauth/exchange` (Google, or Bing with `source: "bing"`; the exchange finds
 * the provider by its pending `state`), `search/import` (a Bing Webmaster Tools CSV export for one site),
 * `search/properties` (picker list with a suggestion for
 * the site), `search/map` (stores the mapping: settings for the local site, the registry record for
 * a client site) and `search/connect` (the master-level connection fields of the Search setup state).
 * No route ever returns a token or a secret setting.
 */
import { PluginRouteError } from "emdash";
import { z } from "zod";
import { PLUGIN_ID } from "../contract.js";
import type { KvLike } from "../core/crypto.js";
import { addDays, dayInZone, daysBetween } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { bindSite, type BoundSite, ClientSiteSchema, hostnameOf, invalidateRegistry, loadSites, SiteField, type SitesColl } from "../multisite/registry.js";
import type { Settings } from "../settings.js";
import { backfillStatus, cancelBackfill, startBackfill } from "../sources/backfill.js";
import { backfillRange, KV_SYNC_ROWS, PLANNING_ROWS_PER_DAY, PROVIDER_DAYS, RowsPaused, SYNC_BUDGET, utcDay } from "../sources/budget.js";
import { listBingSites } from "../sources/bing.js";
import { exchangeBingOAuth, isBingState, startBingOAuth } from "../sources/bing-auth.js";
import { CSV_MAX_CHARS, CsvError, importBingCsv, parseBingCsv } from "../sources/bing-csv.js";
import { exchangeOAuth, gscConfigured, listProperties, startOAuth, suggestProperty } from "../sources/gsc-auth.js";
import { canonicalOrigin } from "../sources/page-key.js";
import { makeBudget, mappingOf, PROVISIONAL_DAYS, type PairState, runSearchTick, SOURCES, stateKey, SYNC_DAYS, type SyncCtx, syncRows, targetOf, THROTTLE_TEXT } from "../sources/sync.js";
import { type Http, MAPPING_FIELD, SOURCE_IDS, SourceError, type SourceId } from "../sources/types.js";

export interface SearchCtx {
	input?: unknown;
	request?: Request;
	kv: KvLike;
	http?: Http;
	settings?: { set(key: string, value: unknown): Promise<void>; delete?(key: string): Promise<boolean> };
	storage?: { sites?: SitesColl };
	cron?: SyncCtx["cron"];
}

export interface SearchEnv {
	/** The database of `site`'s analytics tables. */
	db(site?: string): Promise<Db>;
	settings(): Promise<Settings>;
	/** Drop the cached settings after a write (the OAuth exchange, a mapping). */
	settingsChanged?(): void;
	/** Milliseconds; defaults to the clock. */
	now?(): number;
}

const Source = z.enum(SOURCE_IDS);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const StatusBody = z.object({ site: SiteField }).strict().optional();
export const TestBody = z.object({ site: SiteField, source: Source.default("google") }).strict();
export const SyncBody = z.object({ site: SiteField, source: Source.optional() }).strict();
/** Start takes `days` back from yesterday (0: everything the source offers; default the `backfillDays` setting) or `from`; both are clamped to what the provider keeps. */
export const BackfillRouteBody = z.object({ action: z.enum(["start", "cancel", "status"]), site: SiteField, source: Source.default("google"), days: z.number().int().min(0).max(1000).optional(), from: Day.optional(), to: Day.optional() }).strict();
export const OAuthStartBody = z.object({ source: Source.optional() }).strict().optional();
export const OAuthExchangeBody = z.object({ code: z.string().min(1).max(2048), state: z.string().min(1).max(128), source: Source.optional() }).strict();
/** A Bing Webmaster Tools CSV export as text; `day` stores a file without a date column. */
export const ImportBody = z.object({ site: SiteField, source: z.literal("bing").default("bing"), csv: z.string().min(1).max(CSV_MAX_CHARS), day: Day.optional() }).strict();
export const PropertiesBody = z.object({ site: SiteField, source: Source.default("google") }).strict();
export const MapBody = z.object({ site: SiteField, source: Source, property: z.string().trim().max(512) }).strict();
/** Master-level connection fields; an empty secret clears it. The mapping goes through `search/map`. */
export const ConnectBody = z
	.object({
		gscAuth: z.enum(["off", "oauth", "service_account"]).optional(),
		gscClientId: z.string().trim().max(256).optional(),
		gscClientSecret: z.string().trim().max(256).optional(),
		gscServiceAccount: z.string().trim().max(8192).optional(),
		bingEnabled: z.boolean().optional(),
		bingAuth: z.enum(["apikey", "oauth"]).optional(),
		bingApiKey: z.string().trim().max(128).optional(),
		bingClientId: z.string().trim().max(256).optional(),
		bingClientSecret: z.string().trim().max(256).optional(),
	})
	.strict();

/** `sc-domain:example.com` or an http(s) URL prefix ending in `/` for Google; an http(s) URL for Bing; empty unmaps. */
export function validProperty(source: SourceId, p: string): boolean {
	if (!p) return true;
	if (source === "google" && /^sc-domain:[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(p)) return true;
	try {
		const u = new URL(p);
		return (u.protocol === "https:" || u.protocol === "http:") && !u.search && !u.hash && !u.username && (source === "bing" || p.endsWith("/"));
	} catch {
		return false;
	}
}

export const redirectUri = (origin: string) => `${origin}/_emdash/admin/plugins/${PLUGIN_ID}/search`;

const manage = "plugins:manage" as const;

function http(ctx: SearchCtx): Http {
	if (!ctx.http) throw new PluginRouteError("network_unavailable", "Outbound requests are not available to this plugin.", 500);
	return ctx.http;
}

/** A provider failure as a typed route error with the status and no body echo. */
function typed(e: unknown): never {
	if (e instanceof SourceError) throw new PluginRouteError("source_error", e.message, e.status === 401 || e.status === 403 ? 400 : 502);
	throw e;
}

/** Search actions shared by the admin routes and the agent API (`sync:search`). */
export function searchService(env: SearchEnv) {
	const now = () => env.now?.() ?? Date.now();
	const bound = async (ctx: SearchCtx, site: string | undefined) => bindSite(site, (await env.settings()).siteId, ctx.storage?.sites);
	const today = (s: Settings) => dayInZone(Math.floor(now() / 1000), s.siteTimezone);

	async function syncCtx(ctx: SearchCtx): Promise<SyncCtx> {
		return { http: http(ctx), kv: ctx.kv, db: await env.db(), dbOf: (site: string) => env.db(site), settings: await env.settings(), clients: (await loadSites(ctx.storage?.sites)).filter((c) => !c.linked), now, ...(ctx.cron ? { cron: ctx.cron } : {}), ...(ctx.request ? { requestUrl: ctx.request.url } : {}) };
	}

	function usable(s: Settings, b: BoundSite, source: SourceId) {
		if (!SOURCES[source].configured(s)) throw new PluginRouteError("not_configured", `The ${source} source is not connected.`, 400);
		if (!mappingOf(s, b.client, source)) throw new PluginRouteError("not_mapped", "No property mapped for this site.", 400);
	}

	/**
	 * Start a backfill of `days` (default `backfillDays`) or from `from`, clamped to the provider's limit. A named `from`
	 * runs as asked. Otherwise the range ends at the newest missing day before the sync window (a hole left by an outage
	 * included), and when no day is missing nothing starts. The tick never writes a stored day before the sync window again.
	 */
	async function start(ctx: SearchCtx, b: BoundSite, source: SourceId, s: Settings, o: { days?: number | undefined; from?: string | undefined; to?: string | undefined }) {
		const t = today(s);
		if (o.days !== undefined && o.from !== undefined) throw new PluginRouteError("invalid_range", "Send days or from, not both.", 400);
		if (o.from && o.to && o.from > o.to) throw new PluginRouteError("invalid_range", "from must not be after to.", 400);
		if (o.to && o.to >= t) throw new PluginRouteError("invalid_range", "A backfill ends yesterday at the latest.", 400);
		const r = backfillRange({ days: o.from ? undefined : (o.days ?? s.backfillDays), from: o.from }, source, addDays(t, -1), s.searchRetentionDays);
		let to = o.to ?? r.to;
		if (!o.from) {
			const rows = await (await env.db(b.id)).all<{ day: string }>("SELECT DISTINCT day FROM ca_search_daily WHERE site = ? AND source = ? AND day >= ? AND day <= ?", [b.id, source, r.from, to]);
			const stored = new Set(rows.map((x) => String(x.day)));
			// Nothing stored: the whole range. Otherwise the regular sync pulls the last SYNC_DAYS days; look for missing days before them.
			if (stored.size) {
				const end = addDays(t, -SYNC_DAYS - 1);
				if (to > end) to = end;
				while (to >= r.from && stored.has(to)) to = addDays(to, -1);
			}
		}
		if (r.from > to) return { site: b.id, source, from: r.from, clamped: r.clamped, stored: true, backfill: null };
		return { site: b.id, source, from: r.from, clamped: r.clamped, stored: false, backfill: await startBackfill(ctx.kv, b.id, source, r.from, to, t, now()) };
	}

	return {
		syncCtx,
		start,
		/** One forced tick over the site's pairs (one source when given). */
		async sync(ctx: SearchCtx, body: { site?: string | undefined; source?: SourceId | undefined }) {
			const b = await bound(ctx, body.site);
			const s = await env.settings();
			if (body.source) usable(s, b, body.source);
			return runSearchTick(await syncCtx(ctx), { only: { site: b.id, ...(body.source ? { source: body.source } : {}) } });
		},
		async backfill(ctx: SearchCtx, body: { action: "start" | "cancel" | "status"; site?: string | undefined; source?: SourceId | undefined; days?: number | undefined; from?: string | undefined; to?: string | undefined }) {
			const b = await bound(ctx, body.site);
			const source = body.source ?? "google";
			if (body.action === "cancel") return cancelBackfill(ctx.kv, b.id, source);
			if (body.action === "status") return { site: b.id, source, backfill: await backfillStatus(ctx.kv, b.id, source, now()) };
			const s = await env.settings();
			usable(s, b, source);
			return start(ctx, b, source, s, body);
		},
		async status(ctx: SearchCtx, site: string | undefined) {
			const b = await bound(ctx, site);
			const s = await env.settings();
			const db = await env.db(b.id);
			const t = today(s);
			// One row per stored day (at most the retention per source): the totals and the holes come from the same read.
			const rows = new Map<string, { n: number; first: string; last: string; holes: Array<[string, string]> }>();
			const syncFrom = addDays(t, -SYNC_DAYS);
			for (const r of await db.all("SELECT source, day, COUNT(*) AS n FROM ca_search_daily WHERE site = ? GROUP BY source, day ORDER BY source, day", [b.id])) {
				const day = String(r.day);
				const x = rows.get(String(r.source));
				if (!x) {
					rows.set(String(r.source), { n: Number(r.n), first: day, last: day, holes: [] });
					continue;
				}
				// A missing run before the sync window: the regular sync fills the days after it.
				const end = addDays(day, -1) < syncFrom ? addDays(day, -1) : addDays(syncFrom, -1);
				if (addDays(x.last, 1) <= end) x.holes.push([addDays(x.last, 1), end]);
				x.n += Number(r.n);
				x.last = day;
			}
			const sources = [];
			for (const id of SOURCE_IDS) {
				const st = (await ctx.kv.get<PairState>(stateKey(b.id, id))) ?? {};
				const r = rows.get(id);
				sources.push({
					id,
					configured: SOURCES[id].configured(s),
					auth: id === "bing" ? s.bingAuth : s.gscAuth,
					property: mappingOf(s, b.client, id),
					lastRun: st.lastRun ?? null,
					status: st.status ?? null,
					// Throttled: the plain sentence, the provider's code and the next attempt; lastRun and rows stay those of the last success.
					message: st.status === "throttled" ? THROTTLE_TEXT[id] : null,
					throttleCode: st.status === "throttled" ? (st.throttleCode ?? null) : null,
					nextAttempt: st.status === "throttled" ? (st.nextAttempt ?? null) : null,
					lastError: st.lastError ?? null,
					lastErrorAt: st.lastErrorAt ?? null,
					syncing: !!st.cursorDay,
					rows: r?.n ?? 0,
					firstDay: r?.first ?? null,
					lastDay: r?.last ?? null,
					// Missing days between firstDay and the sync window, as inclusive runs: the dialog counts the days a range would write.
					holes: r?.holes ?? [],
					// Rows per stored day for the backfill estimate (a planning value before any day is stored), and the days the provider keeps.
					perDay: r ? Math.ceil(r.n / daysBetween(r.first, r.last)) : PLANNING_ROWS_PER_DAY,
					limitDays: PROVIDER_DAYS[id],
					backfill: await backfillStatus(ctx.kv, b.id, id, now()),
				});
			}
			const used = await ctx.kv.get<{ day: string; rows: number }>(KV_SYNC_ROWS);
			// Today's rows of every Search sync against the profile's daily budget (UTC day).
			const budget = { profile: s.capacityProfile, daily: SYNC_BUDGET[s.capacityProfile].daily, usedToday: used?.day === utcDay(now()) ? used.rows : 0, defaultDays: s.backfillDays, retentionDays: s.searchRetentionDays };
			return { site: b.id, kind: b.kind, sources, budget, provisional: { from: addDays(t, -PROVISIONAL_DAYS), to: addDays(t, -1) } };
		},
		bound,
	};
}

export function searchRoutes(env: SearchEnv) {
	const svc = searchService(env);
	const now = () => env.now?.() ?? Date.now();

	return {
		"search/status": {
			permission: "plugins:read" as const,
			input: StatusBody,
			handler: async (ctx: SearchCtx) => svc.status(ctx, StatusBody.parse(ctx.input ?? undefined)?.site),
		},

		"search/test": {
			permission: manage,
			input: TestBody,
			async handler(ctx: SearchCtx) {
				const body = TestBody.parse(ctx.input ?? {});
				const b = await svc.bound(ctx, body.site);
				const s = await env.settings();
				const src = SOURCES[body.source];
				try {
					const target = targetOf(s, b.id, b.client, body.source, ctx.request?.url);
					return { ok: true, source: body.source, result: await src.test({ http: http(ctx), kv: ctx.kv, settings: s, budget: makeBudget(now) }, target) };
				} catch (e) {
					if (e instanceof SourceError) return { ok: false, source: body.source, status: e.status, message: e.message };
					throw e;
				}
			},
		},

		"search/sync": {
			permission: manage,
			input: SyncBody,
			handler: async (ctx: SearchCtx) => svc.sync(ctx, SyncBody.parse(ctx.input ?? {})),
		},

		"search/backfill": {
			permission: manage,
			input: BackfillRouteBody,
			handler: async (ctx: SearchCtx) => svc.backfill(ctx, BackfillRouteBody.parse(ctx.input)),
		},

		"search/oauth/start": {
			permission: manage,
			input: OAuthStartBody,
			async handler(ctx: SearchCtx) {
				const s = await env.settings();
				const origin = s.siteOrigin || (ctx.request ? new URL(ctx.request.url).origin : "");
				if (!origin) throw new PluginRouteError("origin_unknown", "Set the site origin in the plugin settings.", 400);
				if (OAuthStartBody.parse(ctx.input ?? undefined)?.source === "bing") return startBingOAuth({ kv: ctx.kv, settings: s, now }, redirectUri(origin));
				return startOAuth({ kv: ctx.kv, settings: s, now }, redirectUri(origin));
			},
		},

		"search/oauth/exchange": {
			permission: manage,
			input: OAuthExchangeBody,
			async handler(ctx: SearchCtx) {
				const body = OAuthExchangeBody.parse(ctx.input);
				const settings = ctx.settings;
				if (!settings) throw new PluginRouteError("settings_unavailable", "Plugin settings are not available.", 500);
				const setSecret = async (key: "gscRefreshToken" | "bingRefreshToken", value: string) => {
					try {
						await settings.set(key, value);
					} catch (e) {
						if ((e as Error).name === "PluginSettingEncryptionError") throw new PluginRouteError("encryption_key_missing", "Saving the connection needs EMDASH_ENCRYPTION_KEY on the server.", 400);
						throw e;
					}
				};
				const base = { http: http(ctx), kv: ctx.kv, settings: await env.settings(), now, setSecret };
				// The return page posts `code` and `state` only; the pending Bing sign-in is recognized by its state.
				const bingFlow = body.source ? body.source === "bing" : await isBingState(ctx.kv, body.state);
				const r = bingFlow ? await exchangeBingOAuth(base, body.code, body.state).catch(typed) : await exchangeOAuth(base, body.code, body.state).catch(typed);
				env.settingsChanged?.();
				return r;
			},
		},

		"search/import": {
			permission: manage,
			input: ImportBody,
			async handler(ctx: SearchCtx) {
				const body = ImportBody.parse(ctx.input);
				const b = await svc.bound(ctx, body.site);
				const s = await env.settings();
				try {
					const csv = parseBingCsv(body.csv);
					const target = targetOf(s, b.id, b.client, "bing", ctx.request?.url);
					// A file stores the days of the backfill range only, within today's Search rows budget.
					const rows = syncRows({ db: await env.db(), kv: ctx.kv, now, settings: s });
					return { site: b.id, source: "bing", ...(await importBingCsv({ db: await env.db(b.id), target, today: dayInZone(Math.floor(now() / 1000), s.siteTimezone), retentionDays: Math.min(s.searchRetentionDays, s.backfillDays), rows }, csv, body.day)) };
				} catch (e) {
					if (e instanceof CsvError) throw new PluginRouteError("invalid_file", e.message, 400);
					if (e instanceof RowsPaused) throw new PluginRouteError("write_budget", e.message, 429);
					throw e;
				}
			},
		},

		"search/properties": {
			permission: manage,
			input: PropertiesBody,
			async handler(ctx: SearchCtx) {
				const body = PropertiesBody.parse(ctx.input ?? {});
				const b = await svc.bound(ctx, body.site);
				const s = await env.settings();
				if (!SOURCES[body.source].configured(s)) throw new PluginRouteError("not_configured", `The ${body.source} source is not connected.`, 400);
				const items =
					body.source === "google"
						? await listProperties({ http: http(ctx), settings: s, now }).catch(typed)
						: (await listBingSites({ http: http(ctx), settings: s }).catch(typed)).map((x) => ({ siteUrl: x.siteUrl, permissionLevel: "verified" }));
				const host = hostnameOf(canonicalOrigin({ siteOrigin: s.siteOrigin, client: b.client, ...(ctx.request ? { requestUrl: ctx.request.url } : {}) }));
				return { site: b.id, source: body.source, current: mappingOf(s, b.client, body.source), suggested: host ? suggestProperty(items.map((i) => i.siteUrl), host) : null, items };
			},
		},

		"search/map": {
			permission: manage,
			input: MapBody,
			async handler(ctx: SearchCtx) {
				const body = MapBody.parse(ctx.input);
				if (!validProperty(body.source, body.property))
					throw new PluginRouteError("invalid_property", body.source === "google" ? "Use sc-domain:example.com or a URL prefix such as https://example.com/." : "Use the site URL as registered, such as https://example.com/.", 400);
				const b = await svc.bound(ctx, body.site);
				const field = MAPPING_FIELD[body.source];
				const before = mappingOf(await env.settings(), b.client, body.source);
				if (b.client) {
					const sites = ctx.storage?.sites;
					if (!sites) throw new PluginRouteError("storage_unavailable", "The sites collection is not available.", 500);
					const cur = ClientSiteSchema.parse(await sites.get(b.id));
					await sites.put(b.id, { ...cur, [field]: body.property });
					invalidateRegistry();
				} else {
					if (!ctx.settings) throw new PluginRouteError("settings_unavailable", "Plugin settings are not available.", 500);
					await ctx.settings.set(field, body.property);
					env.settingsChanged?.();
				}
				// The first connect backfills the default range, except on `small`, where only Start begins a backfill.
				const s = await env.settings();
				const auto = !before && !!body.property && s.capacityProfile !== "small" && SOURCES[body.source].configured(s) && !(await backfillStatus(ctx.kv, b.id, body.source, now()));
				const backfill = auto ? (await svc.start(ctx, b, body.source, s, {})).backfill : null;
				return { site: b.id, source: body.source, property: body.property, backfill };
			},
		},

		"search/connect": {
			permission: manage,
			input: ConnectBody,
			async handler(ctx: SearchCtx) {
				const body = ConnectBody.parse(ctx.input ?? {});
				const settings = ctx.settings;
				if (!settings) throw new PluginRouteError("settings_unavailable", "Plugin settings are not available.", 500);
				if (body.gscServiceAccount && !gscConfigured({ gscAuth: "service_account", gscServiceAccount: body.gscServiceAccount, gscClientId: "", gscClientSecret: "", gscRefreshToken: "" }))
					throw new PluginRouteError("invalid_service_account", "Paste the whole JSON key file of the service account.", 400);
				if (body.bingApiKey && !/^[A-Za-z0-9]{16,128}$/.test(body.bingApiKey)) throw new PluginRouteError("invalid_api_key", "The Bing API key has letters and digits only.", 400);
				if (body.bingClientId && !/^[A-Za-z0-9._-]{4,256}$/.test(body.bingClientId)) throw new PluginRouteError("invalid_client_id", "The Bing client id has letters, digits, dots, dashes and underscores only.", 400);
				try {
					for (const [key, value] of Object.entries(body)) {
						if (value === "" && settings.delete) await settings.delete(key);
						else await settings.set(key, value);
					}
				} catch (e) {
					if ((e as Error).name === "PluginSettingEncryptionError") throw new PluginRouteError("encryption_key_missing", "Saving keys needs EMDASH_ENCRYPTION_KEY on the server.", 400);
					throw e;
				} finally {
					env.settingsChanged?.();
				}
				const s = await env.settings();
				return { google: SOURCES.google.configured(s), bing: SOURCES.bing.configured(s) };
			},
		},
	};
}
