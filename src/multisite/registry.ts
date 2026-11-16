/**
 * Client sites registry: the `sites` storage collection, its validation rules and a 60 s
 * in-memory snapshot keyed by `key` and by `id`, invalidated on save (the channel rules pattern).
 */
import { PluginRouteError } from "emdash";
import { z } from "zod";
import { type KvLike, randomId } from "../core/crypto.js";

export const SITE_ID_RE = /^[a-z0-9-]{1,32}$/;
export const SITE_KEY_RE = /^[a-z0-9]{20}$/;
/** Lowercase hostname with at least one dot, no scheme, no port, no path. */
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
export const MAX_HOSTS = 10;
export const MAX_SITES = 500;
const TTL_MS = 60_000;

export const ClientSiteSchema = z.object({
	id: z.string().regex(SITE_ID_RE),
	label: z.string().min(1).max(64),
	key: z.string().regex(SITE_KEY_RE),
	hosts: z.array(z.string().regex(HOST_RE)).min(1).max(MAX_HOSTS),
	gscProperty: z.string().max(512).default(""),
	bingSiteUrl: z.string().max(512).default(""),
	paused: z.boolean().default(false),
	created: z.number().int(),
	/** Absent means the master's setting. Checked on save; an unlisted stored code reads as Inherit, never hides the site. */
	defaultCurrency: z.string().max(8).optional(),
	acceptClientRevenue: z.boolean().optional(),
	/** Site search parameter names; absent inherits the master's, empty is off for this site. */
	siteSearchParams: z.array(z.string().regex(/^[a-z0-9_]{1,16}$/)).max(5).optional(),
	/**
	 * Linked to this install's own site: its events are stored under the local site id with the host recorded, so
	 * the visitor key and the visit continue across the hosts. Its per-site settings do not apply then.
	 */
	linked: z.boolean().optional(),
});
export type ClientSite = z.output<typeof ClientSiteSchema>;

/** Structural subset of the host `StorageCollection` (`plugins/types.ts`). */
export interface SitesColl {
	query(o?: { where?: Record<string, unknown>; limit?: number; cursor?: string }): Promise<{ items: Array<{ id: string; data: unknown }>; cursor?: string; hasMore: boolean }>;
	get(id: string): Promise<unknown>;
	put(id: string, data: unknown): Promise<void>;
	delete(id: string): Promise<boolean>;
}

/**
 * `byKey` holds every site (ingest). A linked site has no data of its own, so `byId` and `sites`, which every
 * route that binds, lists or syncs a site reads, hold only the others; the linked ones are in `linked`.
 */
export interface Registry {
	byKey: ReadonlyMap<string, ClientSite>;
	byId: ReadonlyMap<string, ClientSite>;
	sites: readonly ClientSite[];
	linked: readonly ClientSite[];
}

const EMPTY: Registry = { byKey: new Map(), byId: new Map(), sites: [], linked: [] };
let snap: { reg: Registry; at: number } | undefined;

/** Drop the snapshot so the next read reloads (after a save, a delete or a key change). */
export function invalidateRegistry(): void {
	snap = undefined;
	linkedSnap = undefined;
}

/** Every valid record of the collection, sorted by label. */
export async function loadSites(coll: Pick<SitesColl, "query"> | undefined): Promise<ClientSite[]> {
	if (!coll) return [];
	const out: ClientSite[] = [];
	let cursor: string | undefined;
	for (let i = 0; i < MAX_SITES / 100; i++) {
		const page = await coll.query({ limit: 100, ...(cursor ? { cursor } : {}) });
		for (const it of page.items) {
			const r = ClientSiteSchema.safeParse(it.data);
			if (r.success) out.push(r.data);
		}
		if (!page.hasMore || !page.cursor) break;
		cursor = page.cursor;
	}
	return out.sort((a, b) => a.label.localeCompare(b.label) || (a.id < b.id ? -1 : 1));
}

/** The registry snapshot, reloaded at most every 60 s per isolate; the last good one survives a read error. */
export async function registry(coll: Pick<SitesColl, "query"> | undefined, nowMs = Date.now()): Promise<Registry> {
	if (snap && nowMs - snap.at < TTL_MS) return snap.reg;
	let reg = snap?.reg ?? EMPTY;
	try {
		const all = await loadSites(coll);
		const sites = all.filter((s) => !s.linked);
		reg = { sites, linked: all.filter((s) => s.linked), byKey: new Map(all.map((s) => [s.key, s])), byId: new Map(sites.map((s) => [s.id, s])) };
	} catch {
		// Keep the last good snapshot.
	}
	snap = { reg, at: nowMs };
	return reg;
}

export const newSiteKey = () => randomId(20);

/** Hosts of the client sites linked to this install's own site. */
export const linkedHosts = (sites: readonly ClientSite[]): string[] => sites.flatMap((s) => (s.linked ? s.hosts : []));

/** Options key holding `linkedHosts` for the page script, written by the sites routes. */
export const LINKED_HOSTS_KEY = "sites:linked";
let linkedSnap: { hosts: string[]; at: number } | undefined;

/** `LINKED_HOSTS_KEY`, read at most every 60 s per isolate (the page script must not cost a read per load). */
export async function linkedHostsOf(kv: Pick<KvLike, "get">, nowMs = Date.now()): Promise<string[]> {
	if (linkedSnap && nowMs - linkedSnap.at < TTL_MS) return linkedSnap.hosts;
	let hosts = linkedSnap?.hosts ?? [];
	try {
		const v = await kv.get<unknown>(LINKED_HOSTS_KEY);
		hosts = Array.isArray(v) ? v.filter((h): h is string => typeof h === "string" && HOST_RE.test(h)) : [];
	} catch {
		// Keep the last good list.
	}
	linkedSnap = { hosts, at: nowMs };
	return hosts;
}

/** Hostname of an origin or URL, lowercase, or null. */
export function hostnameOf(origin: string | null | undefined): string | null {
	if (!origin) return null;
	try {
		return new URL(origin).hostname.toLowerCase();
	} catch {
		return null;
	}
}

export interface SiteRules {
	siteId: string;
	/** Remote satellite ids of the integration options. */
	remoteIds: readonly string[];
	/** Hostnames the master itself serves (request host, `siteOrigin`). */
	masterHosts: readonly string[];
	/** The other client sites (the record being edited excluded). */
	others: readonly ClientSite[];
}

/** Registry rules beyond the field formats; returns the first problem in plain words, or null. */
export function siteProblem(site: Pick<ClientSite, "id" | "hosts" | "key">, r: SiteRules): string | null {
	if (site.id === r.siteId) return `The id ${site.id} is the id of this site.`;
	if (site.id === "all") return "The id all is reserved for the All sites view.";
	if (r.remoteIds.includes(site.id)) return `The id ${site.id} is used by a connected site.`;
	if (r.others.some((o) => o.id === site.id)) return `The id ${site.id} is already registered.`;
	if (new Set(site.hosts).size !== site.hosts.length) return "A host is listed twice.";
	const master = new Set(r.masterHosts.map((h) => h.toLowerCase()));
	for (const h of site.hosts) {
		if (master.has(h)) return `${h} is served by this install; its pages are measured as this site.`;
		const owner = r.others.find((o) => o.hosts.includes(h));
		if (owner) return `${h} is already registered for ${owner.label}.`;
	}
	if (r.others.some((o) => o.key === site.key)) return "The key is used by another site.";
	return null;
}

export type SiteKind = "local" | "client";
export interface BoundSite {
	id: string;
	kind: SiteKind;
	client?: ClientSite;
}

/**
 * The site a private or agent route works on: the requested id when it is the
 * local `siteId` or a registered client site, the local site when none is given. Anything else is a
 * typed 400 `unknown_site`.
 */
export async function bindSite(requested: string | null | undefined, siteId: string, coll: Pick<SitesColl, "query"> | undefined): Promise<BoundSite> {
	if (!requested || requested === siteId) return { id: siteId, kind: "local" };
	const reg = await registry(coll);
	const client = reg.byId.get(requested);
	if (!client && reg.linked.some((s) => s.id === requested))
		throw new PluginRouteError("unknown_site", `The site ${requested} is linked to ${siteId}: its data is ${siteId}'s, use that id.`, 400);
	if (!client) throw new PluginRouteError("unknown_site", `Unknown site ${requested.slice(0, 32)}.`, 400);
	return { id: client.id, kind: "client", client };
}

/** Optional `site` field of a route body. */
export const SiteField = z.string().regex(SITE_ID_RE).optional();

/** Options key prefix of the last event time (epoch ms) of a host of this install's own site, linked hosts included. */
export const HOST_SEEN_PREFIX = "host:seen:";
const HOST_SEEN_EVERY_MS = 10 * 60_000;
const hostSeenAt = new Map<string, number>();

/**
 * Stamp the last event time of `host`, at most every 10 minutes per host and isolate (the middleware's `mw:seen`
 * pattern), so the Hosts list costs a few option writes a day, not one per event. Returns the write to run
 * after the response, or null when none is due.
 */
export function markHostSeen(kv: Pick<KvLike, "set">, host: string, nowMs = Date.now()): (() => Promise<void>) | null {
	if (!HOST_RE.test(host) && host !== "localhost") return null;
	if (nowMs - (hostSeenAt.get(host) ?? Number.NEGATIVE_INFINITY) < HOST_SEEN_EVERY_MS) return null;
	// Request hosts are bounded by the routes that reach this Worker; the map is bounded anyway.
	if (hostSeenAt.size >= 100) hostSeenAt.clear();
	hostSeenAt.set(host, nowMs);
	return () => kv.set(`${HOST_SEEN_PREFIX}${host}`, nowMs).catch(() => {});
}

/** Test helper. */
export function resetHostSeen(): void {
	hostSeenAt.clear();
}
