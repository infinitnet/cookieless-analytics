import { classifyUa } from "../agents/classify.js";
import type { IngestBody } from "../contract.js";
import { validateIngest } from "../core/ids.js";
import type { IngestSink } from "../core/apply.js";
import { type DropKind, drops } from "../core/drops.js";
import { bump, type DropReason, forwardedFacts, type RecorderDeps, recordClientEvent, requestInfo, sinkOf } from "../core/recorder.js";
import { dayInZone } from "../core/time.js";
import { INGEST_STATEMENT_MS, pgStatementLimit } from "../db/pg.js";
import { CACHE_ON_MESSAGE } from "../db/query-cache.js";
import { PROXY_KEY_HEADER, proxySecretOk } from "../keys/proxy-secret.js";
import { type ClientSite, hostnameOf, linkedHosts, markHostSeen, proxyHashOf, registry } from "../multisite/registry.js";
import { pluginResponse } from "emdash";
import { noContent, type RouteCtx, type RouteEnv } from "./env.js";

/** Body parser, an object so tests can spy on it (bots must never reach it). */
export const ingestParser = {
	parse(text: unknown): unknown {
		if (typeof text !== "string") return null;
		try {
			return JSON.parse(text);
		} catch {
			return null;
		}
	},
};

/** Where an event belongs, or why it is dropped. `linked`: the key's site is linked to the local site. */
export type Resolution = { site: null; host: string | null; linked?: true } | { site: ClientSite; host: string } | { drop: DropReason };

/**
 * Origin rule. Without `k`: no `Origin` (server to server) or the request's own origin, local site.
 * With `k`: the key's site, an `https` `Origin` on one of its hosts (never the master's own origin), not
 * paused; `host` is the `Origin` hostname. A linked site's events belong to the local site, host kept.
 */
export function resolveOrigin(request: Request, body: Pick<IngestBody, "k">, byKey: ReadonlyMap<string, ClientSite>): Resolution {
	const origin = request.headers.get("origin");
	const own = new URL(request.url);
	if (!body.k) return origin && origin !== own.origin ? { drop: "origin_rejected" } : { site: null, host: own.hostname || null };
	const site = byKey.get(body.k);
	if (!site) return { drop: "unknown_key" };
	const host = origin?.startsWith("https://") ? hostnameOf(origin) : null;
	if (!host || origin === own.origin || !site.hosts.includes(host)) return { drop: "origin_rejected" };
	if (site.paused) return { drop: "site_paused" };
	return site.linked ? { site: null, host, linked: true } : { site, host };
}

/** Seconds a client waits before it sends a refused page view or event again (`Retry-After`). */
export const RETRY_AFTER_S = 5;

/** A D1 overload error ("D1 DB is overloaded. ..."): worth one more try after a short pause. */
export const isOverload = (err: unknown) => /\boverloaded\b/i.test(String((err as { message?: unknown } | null)?.message ?? err));
/** State key of the last background run stopped by a platform limit (`PlatformLimit`); the Data page reads it. */
export const KV_PLATFORM_LIMIT = "platform_limit_hit";
/** A background run stopped by the per-invocation request limit (Workers Free: 50; "Too many subrequests", "Too many API requests by single worker invocation"), or by an overloaded database. */
export interface PlatformLimit {
	at: number;
	task: string;
	kind: "requests" | "overload";
}
export const platformLimitKind = (err: unknown): PlatformLimit["kind"] | null => {
	const m = String((err as { message?: unknown } | null)?.message ?? err);
	return /too many (subrequests|api requests)/i.test(m) ? "requests" : isOverload(err) ? "overload" : null;
};
/** The drop reason of a failed write: D1's "exceeded D1's free tier daily row ... limit" is `daily_limit`. */
const failReason = (err: unknown): DropReason => (isOverload(err) ? "overload" : /free tier daily row/i.test(String((err as { message?: unknown } | null)?.message ?? err)) ? "daily_limit" : "write_error");

/** One jittered retry of a write that failed with an overload error; replays are no-ops (keyed entries). */
export function retryOnce(sink: IngestSink, pauseMs = () => 50 + Math.random() * 150): IngestSink {
	return {
		async ingest(msg) {
			try {
				return await sink.ingest(msg);
			} catch (err) {
				if (!isOverload(err)) throw err;
				await new Promise((r) => setTimeout(r, pauseMs()));
				return sink.ingest(msg);
			}
		},
	};
}

/** 503 with `Retry-After`: the event was not stored and the client sends it again. */
export const unavailable = (seconds = RETRY_AFTER_S) => pluginResponse({ status: 503, headers: { "content-type": "text/plain", "retry-after": String(seconds) } });

/** 503 without `Retry-After`: the day's write allowance is used up and the client stops sending this event. */
export const blocked = () => pluginResponse({ status: 503, headers: { "content-type": "text/plain" } });

/**
 * Public ingest route. 204 for bots (after the UA check alone), invalid bodies and dropped events.
 * Page views and events are written before the response: 204 once stored, 503 with `Retry-After` when the
 * write fails (counted as `overload` or `write_error`), so the page script retries; 503 without it while the
 * `small` profile's daily writes are blocked (`budget_blocked`) or Hyperdrive query caching is on (a permanent
 * condition, counted as `write_error`), so it does not. Engagement updates are
 * written after the response (a beacon cannot retry; the next update carries the same totals). Every request
 * that is not stored is counted in `drops` (bots as `bot`, nothing else of them), flushed in an `after()`.
 *
 * Proxy mode: a post that carries `X-EC-Proxy-Key` comes from a server proxy on a client site's own host. When the
 * header is the proxy secret of the event's site, the visitor's address and country are taken from `X-EC-Client-IP`
 * and `X-EC-Country` and never from the connection, which is the proxy's. A post without the header never reads them.
 */
export function inRoute(env: RouteEnv) {
	return {
		public: true,
		methods: ["POST" as const],
		request: { body: "text" as const, maxBytes: 8192 },
		response: "raw" as const,
		async handler(ctx: RouteCtx) {
			try {
				// Every Postgres statement of the request (schema check, probe, writes) gets the ingest timeout.
				return await pgStatementLimit(INGEST_STATEMENT_MS, () => handle(ctx));
			} catch {
				// The settings could not be read: not stored and not countable (no site), so send it again.
				return unavailable();
			}
		},
	};

	async function handle(ctx: RouteCtx) {
		const deps = await env.deps(ctx);
		try {
			return await decide(ctx, deps);
		} catch {
			// The sites registry or the channel rules could not be read: not stored, so send it again.
			drops.add(deps.settings.siteId, dayInZone(deps.now ?? Math.floor(Date.now() / 1000), deps.settings.siteTimezone), "write_error");
			return unavailable();
		} finally {
			if (drops.size) env.after(() => drops.settle(deps.db));
		}
	}

	async function decide(ctx: RouteCtx, deps: RecorderDeps) {
		const now = deps.now ?? Math.floor(Date.now() / 1000);
		const day = dayInZone(now, deps.settings.siteTimezone);
		const count = (reason: DropKind, site = deps.settings.siteId) => {
			drops.add(site, day, reason);
			return noContent();
		};
		// A robot is counted before parsing, under the local site: nothing of the request is read or kept.
		if (classifyUa(ctx.request.headers.get("user-agent"), deps.agentRules).audience === "robot") return count("bot");
		const body = validateIngest(ingestParser.parse(ctx.input), deps.settings.maxEngagedMsPerPage);
		if (!body) return count("invalid");
		const reg = await registry(ctx.storage?.sites);
		const res = resolveOrigin(ctx.request, body, reg.byKey);
		if ("drop" in res) return count(res.drop);
		// Proxy mode. The secret belongs to the record of the event's own key (a linked host has its own), which the
		// registry snapshot already holds, so the check costs one hash and no read. Every failure drops the event:
		// it is never recorded with the proxy's own address.
		const proxyKey = ctx.request.headers.get(PROXY_KEY_HEADER);
		let fwd: ReturnType<typeof forwardedFacts> = null;
		if (proxyKey !== null) {
			const rec = body.k ? reg.byKey.get(body.k) : undefined;
			// Counted under this install's own site, like `bot` and `unknown_key`: the caller is not authenticated.
			if (!rec || !(await proxySecretOk(proxyHashOf(reg, rec), proxyKey))) return count("proxy_auth");
			const site = res.site ? res.site.id : deps.settings.siteId;
			// A runaway guard, not a security bound: one counter per site and isolate.
			if (bump("proxy", rec.id, now) > deps.settings.proxyRateLimitPerMinute) {
				count("proxy_rate", site);
				return unavailable(60 - (now % 60));
			}
			fwd = forwardedFacts(ctx.request.headers);
			if (!fwd) return count("invalid", site);
		}
		const info = {
			...requestInfo(ctx.request, ctx.requestMeta ? ctx.requestMeta.ip : undefined),
			host: res.host,
			hasOrigin: ctx.request.headers.has("origin"),
			// The proxy's own edge location says nothing about the visitor: country from the header or none, no region.
			...(fwd ? { ip: fwd.ip, country: fwd.country, region: null } : {}),
		};
		const linked = linkedHosts(reg.linked);
		let d: RecorderDeps = deps;
		if (res.site) {
			const channelRules = await env.channelRules?.(ctx, res.site.id);
			d = { ...deps, site: res.site.id, client: res.site, ...(channelRules ? { channelRules } : {}) };
		} else {
			// Linked hosts count as own: a hop between them and this site's hosts never starts a source.
			const s = deps.settings;
			if (linked.length) {
				const own = [hostnameOf(ctx.request.url), hostnameOf(s.siteOrigin)].filter((h): h is string => !!h);
				d = { ...deps, settings: { ...s, ignoreReferrerHosts: [...new Set([...s.ignoreReferrerHosts, ...linked, ...own])] } };
			}
			if (res.linked && res.host) d = { ...d, linkedHost: res.host };
		}
		if (body.t === "en") {
			env.after(async () => {
				try {
					await recordClientEvent(d, body, info);
				} catch (err) {
					count(failReason(err), d.site);
				}
				await drops.settle(d.db);
			});
			return noContent();
		}
		try {
			const out = await recordClientEvent({ ...d, sink: retryOnce(sinkOf(d)) }, body, info);
			// Last event time of a linked host or of `siteOrigin`'s host (the Hosts list), throttled per isolate. Only
			// known hosts: a request's own host name can be any name that routes to this Worker.
			const known = res.host && (linked.includes(res.host) || res.host === hostnameOf(deps.settings.siteOrigin));
			const stamp = out === "ok" && !res.site && known && linked.length ? markHostSeen(ctx.kv, res.host as string) : null;
			if (stamp) env.after(stamp);
			return out === "budget_blocked" ? blocked() : noContent();
		} catch (err) {
			count(failReason(err), d.site);
			return String((err as { message?: unknown } | null)?.message).includes(CACHE_ON_MESSAGE) ? blocked() : unavailable();
		}
	}
}
