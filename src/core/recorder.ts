/** Write path, policy half: checks every event, then hands it to the ingest sink (`apply.ts`). */
import { type IngestBody, isPassiveEvent } from "../contract.js";
import type { ClientSite } from "../multisite/registry.js";
import { type Classification, classifyUa } from "../agents/classify.js";
import type { UserAgentRule } from "../agents/rules.js";
import type { Db } from "../db/adapter.js";
import type { Settings } from "../settings.js";
import { D1Sink, type IngestSink, type VisitMsg } from "./apply.js";
import { drops } from "./drops.js";
import { type ChannelRule, DEFAULT_HOSTS, type HostLists } from "./channels.js";
import { getOrCreateSalt, ipInCidr, type KvLike, randomId, sha256, truncateIp, vkey } from "./crypto.js";
import { CLIENT_IP_HEADER, COUNTRY_HEADER } from "../keys/proxy-secret.js";
import { roundMinor } from "./currency.js";
import type { ValidIngest } from "./ids.js";
import { siteSetting } from "./site-settings.js";
import type { ResolveConfig } from "./session.js";
import { addDays, dayInZone, saltBoundary, saltDay } from "./time.js";
import { parseUa, uaNorm } from "./ua.js";
import { cleanHost, hostInList, normalizeUrl, parseReferrer } from "./url.js";

/** Request facts derived on the server, never trusted from the body. */
export interface RequestInfo {
	ua: string;
	ip: string | null;
	/** Primary `Accept-Language` tag, lowercase. */
	lang: string | null;
	country: string | null;
	region: string | null;
	gpc: boolean;
	dnt: boolean;
	chMobile: string | null;
	chPlatform: string | null;
	/** Host of the requested URL (self-referral detection). */
	host: string | null;
	referer: string | null;
	/** The request carried an `Origin` header (a browser post); decides `acceptClientRevenue`. */
	hasOrigin?: boolean;
}

interface CfLike {
	country?: unknown;
	region?: unknown;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/**
 * Extract `RequestInfo` from a native `Request` (keeps `request.cf`). Pass the host's `requestMeta.ip`
 * when there is one; otherwise `CF-Connecting-IP` is trusted only when `request.cf` exists, the same
 * rule as the host (`plugins/request-meta.ts`). `X-Forwarded-For` is never trusted here.
 */
export function requestInfo(request: Request, ip?: string | null): RequestInfo {
	const h = request.headers;
	const cf = (request as { cf?: CfLike }).cf;
	const lang = h.get("accept-language")?.split(",")[0]?.split(";")[0]?.trim().toLowerCase().slice(0, 16) || null;
	const country = str(cf?.country) ?? str(h.get("cf-ipcountry"));
	let host: string | null = null;
	try {
		// `hostname` is lowercase and has no port.
		host = new URL(request.url).hostname.slice(0, 253) || null;
	} catch {}
	return {
		ua: (h.get("user-agent") ?? "").slice(0, 512),
		ip: ip !== undefined ? ip : cf ? h.get("cf-connecting-ip") : null,
		lang: lang && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(lang) ? lang : null,
		country: country && /^[A-Z]{2}$/i.test(country) && country.toUpperCase() !== "XX" ? country.toUpperCase() : null,
		region: str(cf?.region)?.slice(0, 64) ?? null,
		gpc: h.get("sec-gpc") === "1",
		dnt: h.get("dnt") === "1",
		chMobile: h.get("sec-ch-ua-mobile"),
		chPlatform: h.get("sec-ch-ua-platform"),
		host,
		referer: h.get("referer"),
	};
}

/**
 * Addresses no visitor can have: a proxy that sends one is reporting itself or its own reverse proxy. An
 * IPv4-mapped IPv6 address (`::ffff:127.0.0.1`, `::ffff:7f00:1`) is compared as its IPv4 address.
 */
const NOT_A_CLIENT = ["127.0.0.0/8", "0.0.0.0/32", "::1/128", "::/128"];
/** The longest text form of one address: `0000:0000:0000:0000:0000:ffff:255.255.255.255`. */
export const MAX_FORWARDED_IP_LENGTH = 45;

/**
 * Client facts a server proxy forwards: `X-EC-Client-IP` (one IPv4 or IPv6 address) and the optional
 * `X-EC-Country` (two letters). The `in` route calls this only after the site's proxy secret matched.
 * Null: no usable address. The value is one address of at most 45 characters made of hex digits, colons and
 * dots only, so a list, a port in brackets and a zone id (`fe80::1%eth0`, which names an interface of the
 * proxy, not a visitor) are refused. `truncateIp` returns "" for anything it cannot parse, which would hash every
 * such visitor into one key, so an address counts only when it truncates to something.
 */
export function forwardedFacts(h: Headers): { ip: string; country: string | null } | null {
	const ip = (h.get(CLIENT_IP_HEADER) ?? "").trim();
	if (!ip || ip.length > MAX_FORWARDED_IP_LENGTH || !/^[0-9a-fA-F:.]+$/.test(ip)) return null;
	if (truncateIp(ip) === "" || NOT_A_CLIENT.some((c) => ipInCidr(ip, c))) return null;
	const country = (h.get(COUNTRY_HEADER) ?? "").trim().toUpperCase();
	return { ip, country: /^[A-Z]{2}$/.test(country) && country !== "XX" ? country : null };
}

export type DropReason =
	| "privacy_signal"
	| "excluded_path"
	| "excluded_ip"
	| "session_cap"
	| "sid_rate"
	| "vkey_rate"
	| "reload"
	| "invalid"
	| "origin_rejected"
	| "unknown_key"
	| "site_paused"
	| "revenue_invalid"
	| "revenue_not_accepted"
	| "duplicate_order"
	| "orphan_update"
	/** The page view or event write failed with a database overload error and was answered 503 (the client retries). */
	| "overload"
	/** The write failed with any other error and was answered 503. */
	| "write_error"
	/** D1 refused the write because the account used the Workers Free plan's daily rows (answered 503; the Data page reads it as a Free plan sign). */
	| "daily_limit"
	/** The daily write allowance of the `small` profile is used up: answered 503 without `Retry-After` (the client stops). */
	| "budget_blocked";

export interface RecorderDeps {
	db: Db;
	kv: KvLike;
	settings: Settings;
	/** Epoch seconds; defaults to the clock. */
	now?: number;
	channelRules?: readonly ChannelRule[];
	hosts?: HostLists;
	agentRules?: readonly UserAgentRule[];
	/** Runs before the first write (lazy schema migration). */
	ready?: () => Promise<void>;
	/** Site of client events: a client site resolved by the `in` route, else `settings.siteId`. */
	site?: string;
	/** Registry record of a client site, for its per-site settings. */
	client?: ClientSite;
	/** Where accepted events go; defaults to the database (`D1Sink`). */
	sink?: IngestSink;
	/** Host of a site linked to the local site (the event's `Origin`): stored on the entry as `hs`. */
	linkedHost?: string;
}

/** The sink of `deps`: the given one, or the database behind the write guard of the `small` profile. */
export const sinkOf = (deps: RecorderDeps): IngestSink =>
	deps.sink ?? new D1Sink(deps.db, { kv: deps.kv, profile: deps.settings.capacityProfile, tz: deps.settings.siteTimezone });

// ── per-isolate minute counters ───────────────────────────────────────────────

const counters = new Map<string, number>();
/** Increment and return a per-minute counter. Per isolate, so caps are approximate across isolates. */
export function bump(kind: string, id: string, now: number): number {
	const k = `${kind}|${id}|${Math.floor(now / 60)}`;
	const n = (counters.get(k) ?? 0) + 1;
	counters.delete(k);
	if (counters.size >= 5000) counters.delete(counters.keys().next().value as string);
	counters.set(k, n);
	return n;
}

/** Test helper: forget per-isolate counters, the drop counters included. */
export function resetCounters(): void {
	counters.clear();
	drops.clear();
}

// ── client events ─────────────────────────────────────────────────────────────

/** Hit id of an order: `o.` plus 20 hex characters of SHA-256(site|name|oid), so one order is one row. */
export async function orderHitId(site: string, name: string, oid: string): Promise<string> {
	const h = await sha256(`${site}|${name}|${oid}`);
	return `o.${[...h.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const nowS = (deps: RecorderDeps) => deps.now ?? Math.floor(Date.now() / 1000);

function signalDrop(s: Settings, info: RequestInfo): boolean {
	return (s.signals !== "none" && info.gpc) || (s.signals === "dnt_and_gpc" && info.dnt);
}

function excludedIp(s: Settings, info: RequestInfo): boolean {
	return !!info.ip && s.excludeIpPrefixes.some((c) => ipInCidr(info.ip as string, c));
}

function excludedPath(s: Settings, path: string | undefined): boolean {
	return !!path && s.excludePaths.some((p) => path.startsWith(p));
}

export type RecordOutcome = "ok" | DropReason;

/**
 * Search re-entry: a fresh client id (`n = 1`) arriving from a search engine host. Reloads and
 * back or forward loads keep the original referrer, so only a new navigation (`nt` 0 or absent) counts.
 */
function isSearchReentry(body: Extract<IngestBody, { t: "pv" }>, info: RequestInfo, hosts: HostLists): boolean {
	if (body.n !== 1 || (body.nt !== undefined && body.nt !== 0)) return false;
	const ref = parseReferrer(body.r);
	return !!ref && cleanHost(ref.host) !== cleanHost(info.host ?? "") && hostInList(ref.host, hosts.search);
}

/**
 * Record one validated client event: the policy checks (privacy signals, exclusions, rate caps,
 * revenue rules), then one message to the sink. Bots never reach this function: the route answers them
 * before parsing. Returns "ok" or the drop reason (also counted in `drops`, flushed by the caller).
 */
export async function recordClientEvent(deps: RecorderDeps, input: ValidIngest, info: RequestInfo): Promise<RecordOutcome> {
	const { kv, settings: s } = deps;
	const site = deps.site ?? s.siteId;
	const now = nowS(deps);
	const day = dayInZone(now, s.siteTimezone);
	const sink = sinkOf(deps);
	const drop = (reason: DropReason): RecordOutcome => {
		drops.add(site, day, reason);
		return reason;
	};
	const done = (out: RecordOutcome) => (out === "ok" ? out : drop(out));

	await deps.ready?.();
	let body: IngestBody = input;
	if (signalDrop(s, info)) return drop("privacy_signal");
	if (excludedIp(s, info)) return drop("excluded_ip");
	if (body.t !== "en" && excludedPath(s, body.u ? normalizeUrl(body.u, []).path : undefined)) return drop("excluded_path");
	if (body.sid && bump("sid", `${site}|${body.sid}`, now) > s.maxEventsPerSidPerMinute) return drop("sid_rate");

	if (body.t === "en") {
		if (!body.sid) return drop("invalid");
		// Updates are cumulative: every field only rises, so repeated or reordered updates converge.
		return done(
			await sink.ingest({
				t: "en",
				site,
				now,
				sid: body.sid,
				key: body.h,
				tz: s.siteTimezone,
				cap: s.maxPageviewsPerSession,
				d: body.d,
				...(body.e !== undefined ? { e: body.e } : {}),
				...(body.s !== undefined ? { s: body.s } : {}),
				...(body.i !== undefined ? { i: body.i } : {}),
				...(body.x !== undefined ? { x: body.x } : {}),
			}),
		);
	}

	const ua = parseUa(info.ua, { mobile: info.chMobile, platform: info.chPlatform });
	const ipTrunc = truncateIp(info.ip, s.ipTruncation);
	const norm = uaNorm(ua);
	const vkeyFor = async (d: string) => vkey(await getOrCreateSalt(kv, d), site, ipTrunc, norm);
	// The per-visitor cap uses the key of the current salt day, the same key a new session gets.
	const today = saltDay(now, s.saltTimezone, s.saltRotationHour);
	const keys: Record<string, string> = { [today]: await vkeyFor(today) };
	if (bump("vkey", keys[today] as string, now) > s.maxEventsPerVkeyPerMinute) return drop("vkey_rate");
	// Near the salt rotation a visit may still carry yesterday's key (the same rule as `resolveSession`).
	if (now < saltBoundary(now, s.saltTimezone, s.saltRotationHour) + s.sessionWindowMinutes * 60) keys[addDays(today, -1)] = await vkeyFor(addDays(today, -1));

	// Revenue: these drops keep the event and are counted once it is stored (a refused event is
	// counted under its own reason, and its retry must not count them again); an order already stored is dropped whole by the sink.
	let orderId: string | null = null;
	const kept: DropReason[] = [];
	if (body.t === "ev") {
		if (input.revenueInvalid) kept.push("revenue_invalid");
		if (body.val !== undefined && info.hasOrigin && !siteSetting(s, deps.client, "acceptClientRevenue")) {
			const { val: _v, cur: _c, oid: _o, ...rest } = body;
			body = rest;
			kept.push("revenue_not_accepted");
		}
		if (body.val !== undefined && body.oid) orderId = await orderHitId(site, body.name, body.oid);
	}

	const cfg: ResolveConfig = {
		...s,
		...(deps.channelRules ? { channelRules: deps.channelRules } : {}),
		...(deps.hosts ? { hosts: deps.hosts } : {}),
	};
	// Site search terms are kept on pageviews only.
	const url = body.u ? normalizeUrl(body.u, s.queryAllowlist, body.t === "pv" ? siteSetting(s, deps.client, "siteSearchParams") : []) : null;
	const msg: VisitMsg = {
		t: body.t,
		site,
		now,
		sid: body.sid ?? null,
		fresh: body.n === 1,
		// Events are keyed `e` + the client event id, so a retried event is stored once; a sender without an id gets a random one.
		key: body.t === "pv" ? body.h : (orderId ?? `e${body.h ?? randomId(12)}`),
		fields: body.t === "pv" ? { p: url?.path, qs: url?.query || undefined, nt: body.nt, hs: deps.linkedHost } : { n: body.name, p: url?.path, hs: deps.linkedHost },
		evt: {
			t: body.t,
			sid: body.sid ?? null,
			...(body.u ? { u: body.u } : {}),
			...(body.t === "pv" ? { r: body.r, w: s.captureScreen ? body.w : undefined } : isPassiveEvent(body.name) ? { passive: true } : {}),
		},
		meta: {
			site,
			siteHost: info.host,
			ua,
			lang: s.captureLanguage ? info.lang : null,
			country: info.country,
			region: s.captureRegion ? info.region : null,
		},
		keys,
		cfg,
	};
	if (body.t === "pv") msg.reentry = isSearchReentry(body, info, deps.hosts ?? DEFAULT_HOSTS);
	else {
		if (body.p) msg.props = body.p;
		if (body.val !== undefined) {
			// The effective currency is stored at write time, so a later default change never relabels history.
			const cur = body.cur ?? siteSetting(s, deps.client, "defaultCurrency");
			msg.rev = { val: cur ? roundMinor(body.val, cur) : null, cur: cur || null };
		}
	}
	const out = await sink.ingest(msg);
	if (out === "ok") for (const r of kept) drop(r);
	return done(out);
}

// ── server hits (human error pages) ──────────────────────────────────────────

export interface ServerHitInfo extends RequestInfo {
	/** Path and query of the request. */
	url: string;
	method: string;
	status: number;
	/** `locals.user.role` when signed in. */
	userRole?: number | null;
	/** Classification already computed by the middleware. */
	classification?: Classification;
}

/** Decides whether a server-observed response is counted in `ca_srv`: a robot never writes. */
export function shouldRecordServerHit(status: number, audience: "human" | "robot", s: Pick<Settings, "logErrorPages">): boolean {
	return audience === "human" && status >= 400 && s.logErrorPages;
}

/** Record a server-observed error page as a counter (S6). Returns true when it was counted. */
export async function recordServerHit(deps: RecorderDeps, info: ServerHitInfo): Promise<boolean> {
	const s = deps.settings;
	const now = nowS(deps);
	const c = info.classification ?? classifyUa(info.ua, deps.agentRules);
	if (!shouldRecordServerHit(info.status, c.audience, s)) return false;
	if (s.excludeEditors && (info.userRole ?? 0) >= 30) return false;
	const url = normalizeUrl(info.url, s.queryAllowlist);
	if (excludedPath(s, url.path)) return false;

	if (signalDrop(s, info) || excludedIp(s, info)) return false;
	const r = parseReferrer(info.referer);
	const ref = r && r.host !== (info.host ?? "").replace(/^www\./, "") ? `${r.host}${r.path}`.slice(0, 256) : "";
	await deps.ready?.();
	const out = await sinkOf(deps).ingest({ t: "srv", site: s.siteId, now, tz: s.siteTimezone, status: info.status, path: url.path, ref });
	if (out === "ok") return true;
	drops.add(s.siteId, dayInZone(now, s.siteTimezone), out);
	await drops.settle(deps.db);
	return false;
}
