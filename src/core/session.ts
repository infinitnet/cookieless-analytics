import type { Settings } from "../settings.js";
import { type ChannelRule, classifyChannel, type HostLists, isIgnoredReferrer } from "./channels.js";
import { randomId } from "./crypto.js";
import { isSid } from "./ids.js";
import { addDays, dayInZone, hourInZone, saltBoundary, saltDay } from "./time.js";
import type { ParsedUa } from "./ua.js";
import { normalizeUrl, parseReferrer } from "./url.js";

/** Longest visit the `(site, day, sid)` lookup reaches: the visit started today or yesterday. */
export const MAX_VISIT_MINUTES = 1440;
/** An alias lives as long as the longest visit: an engagement update after a long read on a later page still finds its visit. */
const ALIAS_S = MAX_VISIT_MINUTES * 60;

/** One `ca_sessions` row. */
export interface SessionRow {
	site: string;
	sid: string;
	vkey: string;
	day: string;
	hour: number;
	started: number;
	last_seen: number;
	window_s: number;
	entry_path: string;
	exit_path: string;
	pageviews: number;
	events: number;
	engaged_ms: number;
	max_scroll: number;
	interacted: number;
	ref_host: string | null;
	ref_path: string | null;
	channel: string;
	source: string;
	utm_source: string | null;
	utm_medium: string | null;
	utm_campaign: string | null;
	utm_term: string | null;
	utm_content: string | null;
	country: string | null;
	region: string | null;
	device: string;
	browser: string;
	browser_major: string;
	os: string;
	lang: string | null;
	screen: string | null;
	/** Request hostname of the entry page (lowercase, no port). */
	host: string | null;
}

export interface ContinuePatch {
	now: number;
	/** Set for pageviews: new exit path. */
	exitPath?: string;
	pageviews: number;
	events: number;
}

export interface SessionStore {
	getSession(site: string, sid: string): Promise<SessionRow | null>;
	/** Most recently seen session of any of `vkeys` with `last_seen + window_s >= now`. */
	findActiveByVkey(site: string, vkeys: readonly string[], now: number): Promise<SessionRow | null>;
	/** Canonical sid for an alias that has not expired, or null. */
	getAlias(site: string, sid: string, now: number): Promise<string | null>;
	putAlias(site: string, sid: string, canon: string, expires: number): Promise<void>;
	create(row: SessionRow): Promise<void>;
	continue(site: string, sid: string, patch: ContinuePatch): Promise<void>;
}

export interface ResolveEvent {
	t: "pv" | "ev";
	sid?: string | null;
	/** Path and query of the page. */
	u?: string;
	r?: string;
	w?: number;
	/** A passive event (`isPassiveEvent`, the link impression): it continues or opens the visit but adds nothing to `events`. */
	passive?: boolean;
}

export interface ResolveMeta {
	site: string;
	/** Host of the site, so self-referrals never start a source. */
	siteHost?: string | null;
	ua: ParsedUa;
	lang?: string | null;
	country?: string | null;
	region?: string | null;
	/** Visitor key for a salt day (`YYYY-MM-DD`), computed with that day's salt. */
	vkeyFor(saltDay: string): Promise<string>;
}

export type ResolveConfig = Pick<
	Settings,
	"sessionWindowMinutes" | "maxSessionMinutes" | "saltTimezone" | "saltRotationHour" | "siteTimezone" | "ignoreReferrerHosts" | "queryAllowlist"
> &
	Partial<Pick<Settings, "reloadDedupeSeconds" | "maxPageviewsPerSession" | "maxEventsPerSession">> & { channelRules?: readonly ChannelRule[]; hosts?: HostLists };

export interface ResolveResult {
	session: SessionRow;
	created: boolean;
	/** Set when a pageview continued a session but was not counted (nothing written). */
	skipped?: "reload" | "session_cap";
}

export function isActive(s: SessionRow, now: number, maxSessionMinutes: number): boolean {
	return now - s.last_seen <= s.window_s && now - s.started <= maxSessionMinutes * 60;
}

export function screenBucket(w: number | undefined): string | null {
	if (w === undefined || !Number.isFinite(w) || w <= 0) return null;
	if (w < 576) return "xs";
	if (w < 768) return "sm";
	if (w < 992) return "md";
	if (w < 1200) return "lg";
	return "xl";
}

function firstTouch(evt: ResolveEvent, meta: ResolveMeta, now: number, cfg: ResolveConfig, sid: string, vkey: string): SessionRow {
	const url = normalizeUrl(evt.u ?? "/", cfg.queryAllowlist);
	const ref = parseReferrer(evt.r);
	const ext = ref && !isIgnoredReferrer(ref.host, meta.siteHost, cfg.ignoreReferrerHosts, cfg.hosts) ? ref : null;
	const { channel, source } = classifyChannel(
		{ refHost: ext?.host ?? null, utm: url.utm, clickIds: url.clickIds },
		{ ...(cfg.channelRules ? { rules: cfg.channelRules } : {}), ...(cfg.hosts ? { hosts: cfg.hosts } : {}) },
	);
	const isPv = evt.t === "pv";
	return {
		site: meta.site,
		sid,
		vkey,
		day: dayInZone(now, cfg.siteTimezone),
		hour: hourInZone(now, cfg.siteTimezone),
		started: now,
		last_seen: now,
		window_s: cfg.sessionWindowMinutes * 60,
		entry_path: url.path,
		exit_path: url.path,
		pageviews: isPv ? 1 : 0,
		events: isPv || evt.passive ? 0 : 1,
		engaged_ms: 0,
		max_scroll: 0,
		interacted: 0,
		ref_host: ext?.host ?? null,
		ref_path: ext?.path ?? null,
		channel,
		source,
		utm_source: url.utm.utm_source ?? null,
		utm_medium: url.utm.utm_medium ?? null,
		utm_campaign: url.utm.utm_campaign ?? null,
		utm_term: url.utm.utm_term ?? null,
		utm_content: url.utm.utm_content ?? null,
		country: meta.country ?? null,
		region: meta.region ?? null,
		device: meta.ua.device,
		browser: meta.ua.browser,
		browser_major: meta.ua.browserMajor,
		os: meta.ua.os,
		lang: meta.lang ?? null,
		screen: screenBucket(evt.w),
		host: meta.siteHost ?? null,
	};
}

async function cont(store: SessionStore, s: SessionRow, evt: ResolveEvent, now: number, cfg: ResolveConfig): Promise<ResolveResult> {
	const isPv = evt.t === "pv";
	const patch: ContinuePatch = { now, pageviews: isPv ? 1 : 0, events: isPv || evt.passive ? 0 : 1 };
	if (isPv) {
		patch.exitPath = normalizeUrl(evt.u ?? "/", cfg.queryAllowlist).path;
		if (cfg.maxPageviewsPerSession !== undefined && s.pageviews >= cfg.maxPageviewsPerSession) return { session: s, created: false, skipped: "session_cap" };
		// A reload sends a fresh sid that resolves back here through the visitor key. A visit without a page view
		// (opened by an event that arrived before its page view, for example after a retried 503) holds nothing to reload.
		if (cfg.reloadDedupeSeconds && s.pageviews > 0 && s.exit_path === patch.exitPath && now >= s.last_seen && now - s.last_seen <= cfg.reloadDedupeSeconds)
			return { session: s, created: false, skipped: "reload" };
	} else if (cfg.maxEventsPerSession !== undefined && s.events >= cfg.maxEventsPerSession) return { session: s, created: false, skipped: "session_cap" };
	await store.continue(s.site, s.sid, patch);
	return {
		session: {
			...s,
			last_seen: Math.max(s.last_seen, now),
			exit_path: patch.exitPath ?? s.exit_path,
			pageviews: s.pageviews + patch.pageviews,
			events: s.events + patch.events,
		},
		created: false,
	};
}

/**
 * Session resolution. `cfg.sessionWindowMinutes` applies to new sessions only;
 * existing rows keep their own `window_s`. Never changes first-touch fields of an existing session.
 */
export async function resolveSession(
	evt: ResolveEvent,
	meta: ResolveMeta,
	now: number,
	cfg: ResolveConfig,
	store: SessionStore,
): Promise<ResolveResult> {
	const W = cfg.sessionWindowMinutes * 60;
	const site = meta.site;
	const sidIn = isSid(evt.sid) ? evt.sid : null;
	let own: SessionRow | null = null;
	let canon: string | null = null;

	if (sidIn) {
		own = await store.getSession(site, sidIn);
		if (own && isActive(own, now, cfg.maxSessionMinutes)) return cont(store, own, evt, now, cfg);
		canon = await store.getAlias(site, sidIn, now);
		const s = canon ? await store.getSession(site, canon) : null;
		if (s && isActive(s, now, cfg.maxSessionMinutes)) return cont(store, s, evt, now, cfg);
	}

	const today = saltDay(now, cfg.saltTimezone, cfg.saltRotationHour);
	const currentKey = await meta.vkeyFor(today);
	const keys = [currentKey];
	if (now < saltBoundary(now, cfg.saltTimezone, cfg.saltRotationHour) + W) keys.push(await meta.vkeyFor(addDays(today, -1)));
	const found = await store.findActiveByVkey(site, keys, now);
	if (found && isActive(found, now, cfg.maxSessionMinutes)) {
		if (sidIn && sidIn !== found.sid) await store.putAlias(site, sidIn, found.sid, now + ALIAS_S);
		return cont(store, found, evt, now, cfg);
	}

	// A sid whose own row is closed cannot be reused as a primary key, and a sid whose alias still points at an ended
	// visit would keep reaching it: start fresh and alias the sid to the new visit.
	const sid = sidIn && !own && !canon ? sidIn : randomId(20);
	if (sidIn && (own || canon)) await store.putAlias(site, sidIn, sid, now + ALIAS_S);
	const row = firstTouch(evt, meta, now, cfg, sid, currentKey);
	await store.create(row);
	return { session: row, created: true };
}

/** In-memory `SessionStore` for tests. */
export class MemorySessionStore implements SessionStore {
	sessions = new Map<string, SessionRow>();
	aliases = new Map<string, { canon: string; expires: number }>();

	async getSession(site: string, sid: string) {
		const s = this.sessions.get(`${site}|${sid}`);
		return s ? { ...s } : null;
	}
	async findActiveByVkey(site: string, vkeys: readonly string[], now: number) {
		let best: SessionRow | null = null;
		for (const s of this.sessions.values()) {
			if (s.site === site && vkeys.includes(s.vkey) && s.last_seen + s.window_s >= now && (!best || s.last_seen > best.last_seen)) best = s;
		}
		return best ? { ...best } : null;
	}
	async getAlias(site: string, sid: string, now: number) {
		const a = this.aliases.get(`${site}|${sid}`);
		return a && a.expires >= now ? a.canon : null;
	}
	async putAlias(site: string, sid: string, canon: string, expires: number) {
		this.aliases.set(`${site}|${sid}`, { canon, expires });
	}
	async create(row: SessionRow) {
		const k = `${row.site}|${row.sid}`;
		if (this.sessions.has(k)) throw new Error(`duplicate session ${k}`);
		this.sessions.set(k, { ...row });
	}
	async continue(site: string, sid: string, p: ContinuePatch) {
		const s = this.sessions.get(`${site}|${sid}`);
		if (!s) return;
		s.last_seen = Math.max(s.last_seen, p.now);
		if (p.exitPath !== undefined) s.exit_path = p.exitPath;
		s.pageviews += p.pageviews;
		s.events += p.events;
	}
}

/**
 * One-request store: answers from the rows of one read (`readVisits` in `apply.ts`) and records the writes
 * the resolution decided, which the caller then turns into statements.
 */
export class RequestStore extends MemorySessionStore {
	created: SessionRow | null = null;
	continued: { sid: string; day: string } | null = null;
	alias: { sid: string; canon: string; expires: number } | null = null;

	constructor(site: string, rows: readonly SessionRow[], alias: { sid: string; canon: string } | null) {
		super();
		// Two rows of one sid (a closed visit yesterday, its successor today) cannot both be live: keep the newer.
		for (const r of [...rows].sort((a, b) => a.started - b.started)) this.sessions.set(`${r.site}|${r.sid}`, { ...r });
		if (alias) this.aliases.set(`${site}|${alias.sid}`, { canon: alias.canon, expires: Number.POSITIVE_INFINITY });
	}
	override async putAlias(site: string, sid: string, canon: string, expires: number) {
		this.alias = { sid, canon, expires };
		await super.putAlias(site, sid, canon, expires);
	}
	override async create(row: SessionRow) {
		this.created = { ...row };
		await super.create(row);
	}
	override async continue(site: string, sid: string, p: ContinuePatch) {
		this.continued = { sid, day: this.sessions.get(`${site}|${sid}`)?.day ?? "" };
		await super.continue(site, sid, p);
	}
}
