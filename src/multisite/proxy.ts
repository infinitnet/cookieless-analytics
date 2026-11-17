/**
 * Remote satellite proxy: forwards a report body to the satellite's `agent/v1/query` (and the
 * All-sites row to its `agent/v1/summary`) through the host's `ctx.http`, which validates the target and
 * the target against `allowedHosts`; redirects are refused (`redirect: "error"`) so the key is never sent elsewhere. The key is read from
 * `process.env[keyEnv]` at call time and never returned, stored or logged.
 */
import { PLUGIN_ID } from "../contract.js";
import type { RevenueEntry } from "../query/reports/sites-summary.js";
import type { SummaryRow } from "../routes/sites.js";
import type { Http } from "../sources/types.js";
import type { RemoteSite } from "./config.js";

export const REMOTE_TIMEOUT_MS = 8000;
export const REMOTE_MAX_BYTES = 1_048_576;
export const REMOTE_CACHE_MS = 60_000;
const CACHE_MAX = 200;
export const AGENT_BASE = `/_emdash/api/plugins/${PLUGIN_ID}/agent/v1`;

/** Why a call failed: `key_missing` (env var unset), `not_configured` (no such satellite), `timeout`, `too_large`, `network`, `invalid` (not the agent envelope), `http` (non 2xx). */
export type RemoteReason = "key_missing" | "not_configured" | "no_http" | "timeout" | "too_large" | "network" | "invalid" | "http";
export type RemoteResult<T = unknown> = { ok: true; data: T } | { ok: false; error: "remote_error"; status: number; reason: RemoteReason };

export interface ProxyDeps {
	/** Env source; defaults to `process.env` (the runtime source EmDash reads `EMDASH_ENCRYPTION_KEY` from). */
	env?: () => Record<string, string | undefined>;
	nowMs?: () => number;
	timeoutMs?: number;
}

const processEnv = (): Record<string, string | undefined> => (typeof process !== "undefined" && process.env ? process.env : {});

export function createRemote(sites: readonly RemoteSite[], deps: ProxyDeps = {}) {
	const byId = new Map(sites.map((s) => [s.id, s]));
	const env = deps.env ?? processEnv;
	const nowMs = deps.nowMs ?? Date.now;
	const timeoutMs = deps.timeoutMs ?? REMOTE_TIMEOUT_MS;
	const cache = new Map<string, { at: number; value: RemoteResult }>();
	const err = (status: number, reason: RemoteReason): RemoteResult => ({ ok: false, error: "remote_error", status, reason });

	async function call(http: Http | undefined, id: string, path: string, init: { method: "GET" | "POST"; body?: string }): Promise<RemoteResult> {
		// Only satellites of the options are ever fetched: the target is built from their origin.
		const site = byId.get(id);
		if (!site) return err(0, "not_configured");
		const key = env()[site.keyEnv];
		if (!key) return err(0, "key_missing");
		if (!http) return err(0, "no_http");
		const cacheKey = `${id}\n${init.method} ${path}\n${init.body ?? ""}`;
		const hit = cache.get(cacheKey);
		if (hit && nowMs() - hit.at < REMOTE_CACHE_MS) return hit.value;
		const ac = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<"timeout">((resolve) => {
			timer = setTimeout(() => {
				ac.abort();
				resolve("timeout");
			}, timeoutMs);
		});
		let res: Response | "timeout";
		try {
			res = await Promise.race([
				http.fetch(`${site.origin}${AGENT_BASE}/${path}`, {
					method: init.method,
					// The key must never reach another allowed host through a redirect: the host fails the request instead.
					redirect: "error",
					headers: { "x-api-key": key, "x-emdash-request": "1", accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
					...(init.body ? { body: init.body } : {}),
					signal: ac.signal,
				}),
				timeout,
			]);
		} catch {
			return ac.signal.aborted ? err(504, "timeout") : err(502, "network");
		} finally {
			clearTimeout(timer);
		}
		if (res === "timeout") return err(504, "timeout");
		// A 3xx the host did not follow is a failure too; the remote body is never echoed.
		if (res.status < 200 || res.status > 299) return err(res.status, "http");
		if (Number(res.headers.get("content-length") ?? 0) > REMOTE_MAX_BYTES) return err(res.status, "too_large");
		const buf = await res.arrayBuffer().catch(() => null);
		if (!buf) return err(502, "network");
		if (buf.byteLength > REMOTE_MAX_BYTES) return err(res.status, "too_large");
		let json: { ok?: unknown; data?: unknown };
		try {
			json = JSON.parse(new TextDecoder().decode(buf));
		} catch {
			return err(res.status, "invalid");
		}
		if (!json || json.ok !== true || json.data === null || typeof json.data !== "object") return err(res.status, "invalid");
		const value: RemoteResult = { ok: true, data: json.data };
		if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
		cache.set(cacheKey, { at: nowMs(), value });
		return value;
	}

	return {
		sites,
		find: (id: string | null | undefined) => (id ? byId.get(id) : undefined),
		ids: () => sites.map((s) => s.id),
		/** Whether the key env var of a satellite is set; never its value. */
		keyPresent: (id: string) => {
			const s = byId.get(id);
			return !!s && !!env()[s.keyEnv];
		},
		/** `agent/v1/query` with the body; `query.site` is left out so the satellite answers its own site. */
		query(http: Http | undefined, id: string, body: { query: Record<string, unknown> } & Record<string, unknown>): Promise<RemoteResult> {
			const { site: _s, ...query } = body.query;
			return call(http, id, "query", { method: "POST", body: JSON.stringify({ ...body, query }) });
		},
		/** `agent/v1/summary` for a range and compare option. */
		summary(http: Http | undefined, id: string, p: { from: string; to: string; compare?: string }): Promise<RemoteResult> {
			const qs = new URLSearchParams({ from: p.from, to: p.to, ...(p.compare ? { compare: p.compare } : {}) });
			return call(http, id, `summary?${qs}`, { method: "GET" });
		},
		clearCache: () => cache.clear(),
	};
}
export type Remote = ReturnType<typeof createRemote>;

/** All-sites summary: at most this many satellites are fetched per page, three at a time. */
export const SITES_SUMMARY_MAX_REMOTE = 10;
const SUMMARY_CONCURRENCY = 3;
const ROW_METRICS = ["sessions", "pageviews", "visitors", "bounce_rate", "engaged_rate"] as const;
type RemoteRow = SummaryRow;

const pick = (o: unknown) => {
	const r = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
	return Object.fromEntries(ROW_METRICS.map((k) => [k, typeof r[k] === "number" ? (r[k] as number) : null])) as Record<(typeof ROW_METRICS)[number], number | null>;
};
const revenueOf = (v: unknown): RevenueEntry[] =>
	(Array.isArray(v) ? v : []).flatMap((e) =>
		e && typeof e.currency === "string" && typeof e.revenue === "number" && typeof e.orders === "number" ? [{ currency: e.currency, revenue: e.revenue, orders: e.orders }] : [],
	);

/**
 * One row per satellite from its `agent/v1/summary`: a failed fetch is a row with `error` and null figures,
 * never a failed page. `skip` holds ids that resolve to a site of this database.
 */
export async function remoteSummaryRows(remote: Remote, http: Http | undefined, body: { from: string; to: string; compare?: string | undefined }, skip: ReadonlySet<string> = new Set()): Promise<RemoteRow[]> {
	const list = remote.sites.filter((s) => !skip.has(s.id)).slice(0, SITES_SUMMARY_MAX_REMOTE);
	const out: RemoteRow[] = [];
	let next = 0;
	const worker = async () => {
		while (next < list.length) {
			const i = next++;
			const s = list[i] as RemoteSite;
			const base = { id: s.id, label: s.label, kind: "remote" as const };
			const r = await remote.summary(http, s.id, { from: body.from, to: body.to, ...(body.compare ? { compare: body.compare } : {}) });
			if (!r.ok) {
				out[i] = { ...base, ...pick(null), revenue: [], error: r.reason === "http" ? `http_${r.status}` : r.reason };
				continue;
			}
			// The envelope's `data` is the Overview report result: `data.totals`, `data.compareTotals`, `data.delta`, plus `data.revenue`.
			const d = ((r.data as { data?: unknown }).data ?? {}) as Record<string, unknown>;
			const compared = body.compare && body.compare !== "none" && d.compareTotals;
			const delta = d.delta && typeof d.delta === "object" ? (d.delta as Record<string, unknown>) : {};
			out[i] = {
				...base,
				...pick(d.totals),
				revenue: revenueOf(d.revenue),
				...(compared ? { previous: pick(d.compareTotals), delta: Object.fromEntries(ROW_METRICS.map((k) => [k, typeof delta[k] === "number" ? (delta[k] as number) : null])) } : {}),
			};
		}
	};
	await Promise.all(Array.from({ length: Math.min(SUMMARY_CONCURRENCY, list.length) }, worker));
	return out;
}
