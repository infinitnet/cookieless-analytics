/**
 * Site routes: `sites/list` (`plugins:read`) returns every kind of site the admin can
 * switch between; `sites/save`, `sites/delete` and `sites/key` (`plugins:manage`) edit the client sites
 * registry. Remote satellites come from the integration options and are listed, never edited.
 */
import type { ShareColl } from "../dashboards/shares.js";
import { PluginRouteError } from "emdash";
import { z } from "zod";
import type { KvLike } from "../core/crypto.js";
import { isCurrency } from "../core/currency.js";
import { parseSiteSearchParams, SITE_SEARCH_MAX_PARAMS } from "../settings.js";
import { dayInZone, previousPeriod, samePeriodLastYear } from "../core/time.js";
import { visitDayKey } from "../db/dialect.js";
import type { Db } from "../db/adapter.js";
import { factsTargets, pluginFactsOrNull } from "../db/facts.js";
import { inList } from "../query/compile.js";
import { SEEN_FRESH_MS } from "../fragments.js";
import { MW_SEEN_KEY } from "../middleware-core.js";
import { publicNames } from "../names.js";
import {
	type ClientSite,
	ClientSiteSchema,
	HOST_SEEN_PREFIX,
	hostnameOf,
	invalidateRegistry,
	LINKED_HOSTS_KEY,
	linkedHosts,
	loadSites,
	MAX_HOSTS,
	MAX_SITES,
	newSiteKey,
	registry,
	SITE_ID_RE,
	SITE_KEY_RE,
	siteProblem,
	type SitesColl,
} from "../multisite/registry.js";
import { purgeSite } from "../query/purge.js";
import { clearReportCache, delta, mergeCompare } from "../query/reports/index.js";
import type { ReportData, Row } from "../query/reports/base.js";
import { type RevenueEntry, routedSitesDb, sitesSummary, summaryTotals } from "../query/reports/sites-summary.js";
import { KV_WATERMARK } from "../query/rollup.js";
import type { Settings } from "../settings.js";
import type { Http } from "../sources/types.js";

export type SiteKindName = "local" | "client" | "remote";

export interface SiteEntry {
	id: string;
	label: string;
	/** True for the local site only. */
	local: boolean;
	kind?: SiteKindName;
	/** IANA timezone used for date presets; every site in this database uses `siteTimezone`. */
	timezone?: string;
	/** `https://host` of a connected site, for links to its admin; set by the connected sites. */
	origin?: string;
	/** Remote satellites: whether the key env var is set on this install (never the key). */
	keyPresent?: boolean;
	/** Client sites: the registry record (the key is public: it is in the snippet). */
	client?: ClientSite & { pageviewsToday?: number };
	/** Sites recorded by this database: the `captureRegion` setting, so the admin can say why Regions is empty. Unknown for remote sites. */
	captureRegion?: boolean;
}

/** What the Sites tab needs to show the snippet. */
export interface SnippetInfo {
	/** `<master origin><scriptPath>`. */
	src: string;
	/** Key attribute, `data-ec-key` by default. */
	keyAttr: string;
	/** Window namespace for `page()`. */
	namespace: string;
	/** False when the script is inlined: the master then serves no script file for other sites. */
	external: boolean;
}

export interface SitesEnv {
	settings(): Promise<Pick<Settings, "siteId" | "siteTimezone" | "siteOrigin"> & Partial<Pick<Settings, "scriptPath" | "namespace" | "scriptDelivery" | "captureRegion">>>;
	/** The database of `site`'s analytics tables. */
	db?(site?: string): Promise<Db>;
	/** Remote satellite ids from the integration options. */
	remoteIds?(): readonly string[];
	/** Remote satellites for `sites/list`: id, label, origin and whether the key env var is set. */
	remoteSites?(): ReadonlyArray<{ id: string; label: string; origin: string; keyPresent: boolean }>;
	/** Rows of the remote satellites for `sites/summary` (through the proxy); a failed fetch is a row with `error`. `skip`: ids of this database. */
	remoteRows?(body: SummaryInput, ctx: SitesCtx, skip: ReadonlySet<string>): Promise<SummaryRow[]>;
	now?(): number;
}

/** Collections whose records belong to one site. User agent rules are one set per install and stay. */
const SITE_COLLECTIONS = ["dashboards", "shares", "goals", "funnels", "segments", "channel_rules", "annotations"] as const;

interface SiteColl {
	query(o: { where: Record<string, unknown>; limit: number }): Promise<{ items: Array<{ id: string }>; hasMore: boolean }>;
	delete(id: string): Promise<boolean>;
	deleteMany?(ids: string[]): Promise<number>;
}

/**
 * Every record of a deleted site: its dashboards (and with them their email schedule), share links, goals, funnels,
 * segments, channel rules and annotations. Once the id no longer binds they could not be listed or removed.
 */
async function deleteSiteRecords(storage: SitesCtx["storage"], site: string): Promise<void> {
	for (const name of SITE_COLLECTIONS) {
		const c = storage?.[name] as SiteColl | undefined;
		if (!c) continue;
		// Each page is deleted before the next query, so the first page is always the next one.
		for (let more = true; more; ) {
			const page = await c.query({ where: { site }, limit: 100 });
			const ids = page.items.map((i) => i.id);
			if (!ids.length) break;
			if (c.deleteMany) await c.deleteMany(ids);
			else for (const id of ids) await c.delete(id);
			more = page.hasMore;
		}
	}
}

export interface SitesCtx {
	input?: unknown;
	request?: Request;
	kv?: KvLike;
	storage?: { sites?: SitesColl; shares?: ShareColl } & Partial<Record<(typeof SITE_COLLECTIONS)[number], SiteColl>>;
	/** Outbound HTTP for the remote rows of `sites/summary`. */
	http?: Http;
}

export const ListBody = z.object({ counts: z.boolean().optional() }).strict().optional();
const Host = z.string().trim().toLowerCase().max(253);
export const SaveBody = z
	.object({
		/** True to create; false or absent edits an existing record. */
		create: z.boolean().optional(),
		id: z.string().regex(SITE_ID_RE),
		label: z.string().trim().min(1).max(64),
		hosts: z.array(Host).min(1).max(MAX_HOSTS),
		gscProperty: z.string().trim().max(512).optional(),
		bingSiteUrl: z.string().trim().max(512).optional(),
		paused: z.boolean().optional(),
		/** Per-site revenue settings: null removes the field, so the site inherits the master's setting. */
		defaultCurrency: z.string().refine(isCurrency, "Unknown currency code.").nullable().optional(),
		acceptClientRevenue: z.boolean().nullable().optional(),
		/** Site search parameter names, comma separated: null inherits, "" turns it off for this site. */
		siteSearchParams: z.string().max(200).nullable().optional(),
		/** Linked to this site: events stored under this site's id, the visit continues across the hosts. */
		linked: z.boolean().optional(),
	})
	.strict();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** The plain object (the MCP tool input must be one); the route adds the order check. */
export const SummaryFields = z.object({ from: Day, to: Day, compare: z.enum(["none", "previous", "year"]).optional() }).strict();
export const SummaryBody = SummaryFields.refine((b) => b.from <= b.to, { message: "from must not be after to", path: ["from"] });
export type SummaryInput = z.output<typeof SummaryBody>;

/** One row of the All-sites summary. */
export interface SummaryRow {
	id: string;
	label: string;
	kind: SiteKindName;
	sessions: number | null;
	pageviews: number | null;
	visitors: number | null;
	bounce_rate: number | null;
	engaged_rate: number | null;
	revenue: RevenueEntry[];
	previous?: Record<string, unknown> | null;
	delta?: Record<string, number | null>;
	/** Remote rows only: the fetch failed; the figures are null. */
	error?: string;
}

/** One host of this site in `sites/hosts`: its own hosts and the hosts of linked client sites. */
export interface HostEntry {
	host: string;
	/** `own`: served by this install; `linked`: a linked client site's host. */
	kind: "own" | "linked";
	/** Label of the linked client site. */
	site?: string;
	paused?: boolean;
	/** Epoch ms of the last stored page view or event from this host (updated at most every 10 minutes), or null. */
	lastEvent: number | null;
}

export const DeleteBody = z.object({ id: z.string().regex(SITE_ID_RE), deleteData: z.boolean() }).strict();
/** Regenerate the key, or set a given one (moving a site between installs keeps its snippet). */
export const KeyBody = z.object({ id: z.string().regex(SITE_ID_RE), key: z.string().optional() }).strict();

const bad = (msg: string) => new PluginRouteError("invalid_site", msg, 400);

function coll(ctx: SitesCtx): SitesColl {
	const c = ctx.storage?.sites;
	if (!c) throw new PluginRouteError("storage_unavailable", "The sites collection is not available.", 500);
	return c;
}

/** Hostnames this install serves: the admin request's host and `siteOrigin`. */
function masterHosts(ctx: SitesCtx, s: Pick<Settings, "siteOrigin">): string[] {
	return [hostnameOf(ctx.request?.url), hostnameOf(s.siteOrigin)].filter((h): h is string => !!h);
}

/** The rollup watermark of the sites' databases: the oldest one, null when any database has none yet. */
async function oldestWatermark(db: (site?: string) => Promise<Db>, kv: KvLike): Promise<string | null> {
	const marks = await Promise.all(factsTargets(db).map((t) => t.kv(kv).get<string>(KV_WATERMARK)));
	return marks.some((m) => !m) ? null : ([...(marks as string[])].sort()[0] ?? null);
}

export function siteRoutes(env: SitesEnv) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1000);
	const remoteIds = () => env.remoteIds?.() ?? [];

	async function checked(ctx: SitesCtx, site: ClientSite, except: string | null): Promise<ClientSite> {
		const s = await env.settings();
		const parsed = ClientSiteSchema.safeParse(site);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			throw bad(issue?.path[0] === "hosts" ? "Each host must be a lowercase host name such as www.example.com, without scheme, port or path." : `Invalid ${String(issue?.path[0] ?? "site")}.`);
		}
		const others = (await loadSites(coll(ctx))).filter((o) => o.id !== except);
		const problem = siteProblem(parsed.data, { siteId: s.siteId, remoteIds: remoteIds(), masterHosts: masterHosts(ctx, s), others });
		if (problem) throw bad(problem);
		return parsed.data;
	}

	/**
	 * The page script's linked hosts (`LINKED_HOSTS_KEY`) for the registry as it will be, and the last event stamps
	 * of hosts no longer linked removed. A save writes it before the record: if the record write then fails, a host
	 * is at worst left without fragments, never given them.
	 */
	async function syncLinked(ctx: SitesCtx, sites: readonly ClientSite[]) {
		invalidateRegistry();
		if (!ctx.kv) return;
		const hosts = linkedHosts(sites);
		await ctx.kv.set(LINKED_HOSTS_KEY, hosts);
		const keep = new Set([...hosts, hostnameOf((await env.settings()).siteOrigin)]);
		for (const e of await ctx.kv.list(HOST_SEEN_PREFIX)) if (!keep.has(e.key.slice(HOST_SEEN_PREFIX.length))) await ctx.kv.delete(e.key);
	}

	async function write(ctx: SitesCtx, site: ClientSite) {
		await syncLinked(ctx, [...(await loadSites(coll(ctx))).filter((o) => o.id !== site.id), site]);
		await coll(ctx).put(site.id, site);
		invalidateRegistry();
		return { site };
	}

	return {
		"sites/list": {
			permission: "plugins:read" as const,
			input: ListBody,
			async handler(ctx: SitesCtx = {}): Promise<{ sites: SiteEntry[]; linked?: ClientSite[]; middlewareSeen?: boolean; snippet?: SnippetInfo }> {
				const body = ListBody.parse(ctx.input ?? undefined);
				const s = await env.settings();
				const all = await loadSites(ctx.storage?.sites);
				// A linked site has no data of its own (its events are this site's), so it is not a site to switch to.
				const clients = all.filter((c) => !c.linked);
				const linked = all.filter((c) => c.linked);
				const sites: SiteEntry[] = [
					{ id: s.siteId, label: "This site", local: true, kind: "local", timezone: s.siteTimezone, captureRegion: s.captureRegion },
					...clients.map((c): SiteEntry => ({ id: c.id, label: c.label, local: false, kind: "client", timezone: s.siteTimezone, client: c, captureRegion: s.captureRegion })),
				];
				// Remote satellites last; an id that collides with a site of this database is not listed (this database wins).
				const taken = new Set(sites.map((e) => e.id));
				for (const r of env.remoteSites?.() ?? [])
					if (!taken.has(r.id)) sites.push({ id: r.id, label: r.label, local: false, kind: "remote", timezone: s.siteTimezone, origin: r.origin, keyPresent: r.keyPresent });
				if (!body?.counts) return { sites, ...(linked.length ? { linked } : {}) };
				// Pageviews today per client site (visits started today, a key range each) and the middleware liveness for the degraded-mode warning.
				if (env.db) {
					const today = dayInZone(now(), s.siteTimezone);
					// One statement per database, not per site: sites routed to different databases are never read together.
					const facts = pluginFactsOrNull();
					const groups = new Map<string, SiteEntry[]>();
					for (const e of sites) if (e.client) groups.set(facts?.binding(e.id) ?? "", [...(groups.get(facts?.binding(e.id) ?? "") ?? []), e]);
					for (const list of groups.values()) {
						const db = await env.db((list[0] as SiteEntry).id);
						const ids = inList(db.dialect, "site", list.map((e) => e.id));
						// A missing or failing database leaves only its own sites without a count.
						const rows = await db.all(`SELECT site, SUM(pageviews) AS n FROM ca_sessions WHERE day = ? AND (${ids.sql}) GROUP BY site`, [visitDayKey(today), ...ids.params]).catch(() => null);
						if (!rows) continue;
						const n = new Map(rows.map((r) => [String(r.site), Number(r.n ?? 0)]));
						for (const e of list) if (e.client) e.client = { ...e.client, pageviewsToday: n.get(e.id) ?? 0 };
					}
				}
				const seen = ctx.kv ? await ctx.kv.get<number>(MW_SEEN_KEY) : null;
				const origin = s.siteOrigin || (ctx.request ? new URL(ctx.request.url).origin : "");
				const names = publicNames(s.namespace ?? "");
				return {
					sites,
					...(linked.length ? { linked } : {}),
					middlewareSeen: typeof seen === "number" && now() * 1000 - seen < SEEN_FRESH_MS,
					snippet: { src: `${origin}${s.scriptPath ?? "/_/e.js"}`, keyAttr: `${names.attrPrefix}key`, namespace: names.namespace, external: (s.scriptDelivery ?? "external") === "external" },
				};
			},
		},

		"sites/summary": {
			permission: "plugins:read" as const,
			input: SummaryBody,
			async handler(ctx: SitesCtx) {
				const body = SummaryBody.parse(ctx.input);
				const s = await env.settings();
				if (!env.db) throw new PluginRouteError("storage_unavailable", "The database is not available.", 500);
				const db = await env.db(s.siteId);
				const clients = (await registry(ctx.storage?.sites)).sites;
				const entries = new Map<string, Pick<SummaryRow, "id" | "label" | "kind">>([
					[s.siteId, { id: s.siteId, label: "This site", kind: "local" }],
					...clients.map((c): [string, Pick<SummaryRow, "id" | "label" | "kind">] => [c.id, { id: c.id, label: c.label, kind: "client" }]),
				]);
				const sitesDb = routedSitesDb((site) => (env.db as NonNullable<typeof env.db>)(site), ctx.kv);
				const rc = { db, site: s.siteId, sites: [...entries.keys()], ...(sitesDb ? { sitesDb } : {}), settings: { siteTimezone: s.siteTimezone, engagedThresholdSeconds: 0, realtimeWindowMinutes: 0 }, now: now(), goals: [], funnels: {}, annotations: [] };
				const run = (from: string, to: string, isCompare: boolean) =>
					sitesSummary(rc, { from, to, filters: [], granularity: "auto", params: {}, limit: MAX_SITES, offset: 0, isCompare });
				const compare = body.compare ?? "none";
				const compareRange = compare === "previous" ? previousPeriod(body) : compare === "year" ? samePeriodLastYear(body) : null;
				let data: ReportData = await run(body.from, body.to, false);
				let prevRows: Row[] | null = null;
				if (compareRange) {
					const prev = await run(compareRange.from, compareRange.to, true);
					prevRows = prev.rows ?? [];
					data = mergeCompare(data, prev);
				}
				const rows: SummaryRow[] = (data.rows ?? []).map(({ key, ...r }) => ({ ...(entries.get(key) as Pick<SummaryRow, "id" | "label" | "kind">), ...(r as Omit<SummaryRow, "id" | "label" | "kind">) }));
				const remote = env.remoteRows ? await env.remoteRows(body, ctx, new Set(entries.keys())) : [];
				rows.push(...remote);
				rows.sort((a, b) => (b.pageviews ?? -1) - (a.pageviews ?? -1));
				const totals = summaryTotals(rows);
				// The previous period covers the same sites as the current one: remote rows bring their own.
				const prevTotals = prevRows ? summaryTotals([...prevRows, ...remote.flatMap((r) => (r.previous ? [r.previous] : []))]) : null;
				return {
					from: body.from,
					to: body.to,
					compare,
					compareRange,
					// Rollup figures: complete up to this day.
					// With several databases, the oldest of their watermarks.
					watermark: ctx.kv ? await oldestWatermark(env.db, ctx.kv) : null,
					rows,
					totals: {
						...totals,
						...(prevTotals ? { previous: prevTotals, delta: { sessions: delta(totals.sessions, prevTotals.sessions), pageviews: delta(totals.pageviews, prevTotals.pageviews) } } : {}),
					},
				};
			},
		},

		"sites/hosts": {
			permission: "plugins:read" as const,
			input: z.object({}).strict().optional(),
			async handler(ctx: SitesCtx = {}): Promise<{ hosts: HostEntry[] }> {
				const s = await env.settings();
				const seen = new Map<string, number>();
				for (const e of (await ctx.kv?.list(HOST_SEEN_PREFIX)) ?? []) if (typeof e.value === "number") seen.set(e.key.slice(HOST_SEEN_PREFIX.length), e.value);
				const hosts = new Map<string, HostEntry>();
				for (const c of await loadSites(ctx.storage?.sites))
					if (c.linked) for (const h of c.hosts) hosts.set(h, { host: h, kind: "linked", site: c.label, paused: c.paused, lastEvent: seen.get(h) ?? null });
				// Own hosts: the configured origin (stamped) and the admin's host (not stamped: any name can route here).
				for (const h of [hostnameOf(s.siteOrigin), hostnameOf(ctx.request?.url)])
					if (h && !hosts.has(h)) hosts.set(h, { host: h, kind: "own", lastEvent: seen.get(h) ?? null });
				return { hosts: [...hosts.values()].sort((a, b) => (a.kind === b.kind ? a.host.localeCompare(b.host) : a.kind === "own" ? -1 : 1)) };
			},
		},

		"sites/save": {
			permission: "plugins:manage" as const,
			input: SaveBody,
			async handler(ctx: SitesCtx) {
				const body = SaveBody.parse(ctx.input);
				const cur = ClientSiteSchema.safeParse(await coll(ctx).get(body.id));
				if (body.create && cur.success) throw bad(`The id ${body.id} is already registered.`);
				if (!body.create && !cur.success) throw new PluginRouteError("not_found", "Unknown site.", 404);
				if (body.create && (await loadSites(coll(ctx))).length >= MAX_SITES) throw bad(`At most ${MAX_SITES} sites.`);
				const base = cur.success ? cur.data : { key: newSiteKey(), created: now(), gscProperty: "", bingSiteUrl: "", paused: false };
				const { create: _c, ...fields } = body;
				const next = { ...base, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) } as Record<string, unknown>;
				for (const k of ["defaultCurrency", "acceptClientRevenue", "siteSearchParams"]) if (next[k] === null) delete next[k];
				if (typeof next.siteSearchParams === "string") {
					const { names, invalid } = parseSiteSearchParams(next.siteSearchParams);
					if (invalid.length) throw bad(`Site search parameters are at most ${SITE_SEARCH_MAX_PARAMS} names of letters, digits and _ (up to 16 characters): ${invalid.join(", ")}.`);
					next.siteSearchParams = names;
				}
				return write(ctx, await checked(ctx, next as ClientSite, body.id));
			},
		},

		"sites/key": {
			permission: "plugins:manage" as const,
			input: KeyBody,
			async handler(ctx: SitesCtx) {
				const body = KeyBody.parse(ctx.input);
				if (body.key !== undefined && !SITE_KEY_RE.test(body.key)) throw bad("A site key is 20 lowercase letters and digits.");
				const cur = ClientSiteSchema.safeParse(await coll(ctx).get(body.id));
				if (!cur.success) throw new PluginRouteError("not_found", "Unknown site.", 404);
				return write(ctx, await checked(ctx, { ...cur.data, key: body.key ?? newSiteKey() }, body.id));
			},
		},

		"sites/delete": {
			permission: "plugins:manage" as const,
			input: DeleteBody,
			async handler(ctx: SitesCtx) {
				const body = DeleteBody.parse(ctx.input);
				const c = coll(ctx);
				if (!ClientSiteSchema.safeParse(await c.get(body.id)).success) throw new PluginRouteError("not_found", "Unknown site.", 404);
				// Remove the record first: no new events are accepted for it while its rows are deleted.
				await c.delete(body.id);
				await syncLinked(ctx, await loadSites(c));
				// Its share links would otherwise stay live, and its email schedules keep sending, with no way to remove them.
				await deleteSiteRecords(ctx.storage, body.id);
				if (!body.deleteData || !env.db || !ctx.kv) return { id: body.id, deleted: true, data: null };
				// Eight chunks: with the record queries above this stays under the Free limit; the admin continues with tools/purge-site until done.
				const data = await purgeSite(await env.db(body.id), ctx.kv, body.id, { now: now(), maxChunks: 8 });
				clearReportCache();
				return { id: body.id, deleted: true, data };
			},
		},
	};
}
