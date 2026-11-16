/**
 * Astro-free middleware logic. Never reads, buffers, rewrites or re-headers page
 * responses: the `Response` returned by `next()` is returned as the same object.
 */
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
import { classifyUa } from "./agents/classify.js";
import type { UserAgentRule } from "./agents/rules.js";
import { PLUGIN_ID, ROUTES } from "./contract.js";
import { requestInfo, type ServerHitInfo, shouldRecordServerHit } from "./core/recorder.js";
import { markMiddlewareLive, withAudience } from "./core/request-scope.js";
import { scriptResponse } from "./client/serve.js";
import { SHARE_OPEN_MAX_AGE } from "./dashboards/limits.js";
import type { Settings } from "./settings.js";

/** Structural subset of the Astro `APIContext`. */
export interface MwContext {
	request: Request;
	url: URL;
	locals: Record<string, unknown> & { user?: { role?: number } | null };
	cache?: { set(value: false): void } | undefined;
}

export type MwNext = () => Promise<Response>;

export interface MwDeps {
	settings(): Promise<Settings>;
	/** `after` from `emdash`. */
	after(fn: () => Promise<unknown>): void;
	recordServerHit(info: ServerHitInfo): Promise<unknown>;
	/** Write `mw:seen`; called at most every 10 minutes per isolate and must not block. */
	markSeen(): void;
	/** Milliseconds. */
	now?(): number;
	/** Hosts of the client sites linked to this site, for the page script (`linkedHostsOf`); read only for the script path. */
	linkedHosts?(): Promise<readonly string[]>;
	/** The site's user agent rules (`storedAgentRules`), so a page request is classified like an ingest call. */
	agentRules?(): Promise<readonly UserAgentRule[]>;
}

export const MW_SEEN_KEY = "mw:seen";
const SEEN_EVERY_MS = 10 * 60_000;
let lastSeen = Number.NEGATIVE_INFINITY;

const STATIC_RE = /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|wasm)$/i;
const EDIT_COOKIE_RE = /(?:^|;\s*)emdash-edit-mode=true(?:;|$)/;

/** `collectPath` answers carry `access-control-allow-origin: *`: bodiless 204s without credentials expose nothing. */
const noContent = () => new Response(null, { status: 204, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
const preflight = () =>
	new Response(null, {
		status: 204,
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-methods": "POST",
			"access-control-allow-headers": "content-type",
			"access-control-max-age": "86400",
			"cache-control": "no-store",
		},
	});

const role = (ctx: MwContext) => (typeof ctx.locals.user?.role === "number" ? ctx.locals.user.role : 0);

/** `GET|HEAD scriptPath` with external delivery. One cached options read at most (the linked hosts). */
export async function handleScript(ctx: MwContext, s: Settings, linkedHosts?: () => Promise<readonly string[]>): Promise<Response | null> {
	const m = ctx.request.method;
	if ((m !== "GET" && m !== "HEAD") || ctx.url.pathname !== s.scriptPath || s.scriptDelivery !== "external") return null;
	return scriptResponse(s, ctx.request, (await linkedHosts?.().catch(() => [])) ?? []);
}

/** The `in` route refused to store the event (503): passed on with its `Retry-After`, readable cross-origin. */
const unavailable = (retryAfter: string | null) =>
	new Response(null, {
		status: 503,
		headers: {
			"cache-control": "no-store",
			"access-control-allow-origin": "*",
			...(retryAfter ? { "retry-after": retryAfter, "access-control-expose-headers": "retry-after" } : {}),
		},
	});

/** Status and `Retry-After` of a raw route answer (a `pluginResponse`), read defensively. */
function rawStatus(data: unknown): { status: number; retryAfter: string | null } {
	const r = data as { status?: unknown; headers?: unknown } | null;
	const h = Array.isArray(r?.headers) ? (r.headers as unknown[]).find((e): e is [string, string] => Array.isArray(e) && String(e[0]).toLowerCase() === "retry-after") : undefined;
	return { status: typeof r?.status === "number" ? r.status : 204, retryAfter: h ? String(h[1]) : null };
}

/**
 * `POST collectPath`: forward the untouched `Request` in process to the `in` route; 204, or the route's 503 when the
 * event could not be stored. The
 * `in` route applies the origin rule because only it knows the client sites registry.
 * `OPTIONS collectPath` answers the CORS preflight of `page()` callers that post JSON.
 */
export async function handleCollect(ctx: MwContext, s: Settings): Promise<Response | null> {
	if (ctx.url.pathname !== s.collectPath) return null;
	if (ctx.request.method === "OPTIONS") return preflight();
	if (ctx.request.method !== "POST") return null;
	const origin = ctx.request.headers.get("origin");
	// Editors are recognised on the master's own pages only; a client site's visitors are never editors here.
	if (s.excludeEditors && role(ctx) >= 30 && (!origin || origin === ctx.url.origin)) return noContent();
	const dispatch = getPublicPluginApiRouteHandler(ctx.locals as Parameters<typeof getPublicPluginApiRouteHandler>[0]);
	// No dispatcher, or one that throws: the event was not handed to the route, so it is not stored. Answered 503
	// without Retry-After (the page script does not send it again), never 204 as if it were stored.
	if (!dispatch) return unavailable(null);
	try {
		const res = await dispatch(PLUGIN_ID, "POST", `/${ROUTES.in}`, ctx.request);
		// The host answers 503 itself when it is not ready (no Retry-After there: the page script's own schedule applies).
		const r = res.success ? rawStatus(res.data) : { status: (res as { status?: number }).status ?? 0, retryAfter: "5" };
		if (r.status === 503) return unavailable(r.retryAfter);
	} catch {
		return unavailable(null);
	}
	return noContent();
}

/** Headers of every shared page answer. */
const SHARE_HEADERS = {
	"x-robots-tag": "noindex, nofollow",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff",
	"content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
};
const SHARE_TEXT: Record<number, string> = { 401: "A password is needed to open this page.", 404: "Not found.", 429: "Too many attempts. Try again later." };

/** The `share/view` route result (`src/routes/share-view.ts`), read defensively from the dispatcher. */
interface ShareResult {
	status: number;
	html?: string;
	realm?: string;
	retryAfter?: number;
	cache?: "open" | "private";
}

/**
 * `GET|HEAD sharePath/<token>`: dispatch in process to `share/view` and build the response. The
 * share path never reaches `next()` or the recorder. Other methods and the bare path fall through to the site.
 */
export async function handleShare(ctx: MwContext, s: Settings): Promise<Response | null> {
	const m = ctx.request.method;
	const p = ctx.url.pathname;
	if ((m !== "GET" && m !== "HEAD") || !p.startsWith(`${s.sharePath}/`) || p.length === s.sharePath.length + 1) return null;
	const dispatch = getPublicPluginApiRouteHandler(ctx.locals as Parameters<typeof getPublicPluginApiRouteHandler>[0]);
	let r: ShareResult = { status: 404 };
	if (dispatch) {
		try {
			const res = await dispatch(PLUGIN_ID, "GET", `/${ROUTES.shareView}`, ctx.request);
			const d = res.data as ShareResult | undefined;
			if (res.success && d && [200, 401, 404, 429].includes(d.status)) r = d;
		} catch {}
	}
	const ok = r.status === 200 && typeof r.html === "string";
	const status = ok ? 200 : r.status === 200 ? 404 : r.status;
	const headers: Record<string, string> = {
		...SHARE_HEADERS,
		"content-type": ok ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
		"cache-control": ok ? (r.cache === "open" ? `public, max-age=${SHARE_OPEN_MAX_AGE}` : "private, no-store") : "no-store",
	};
	if (status === 401) headers["www-authenticate"] = `Basic realm="${(r.realm ?? "View").replace(/["\\]/g, "")}", charset="UTF-8"`;
	if (status === 429) headers["retry-after"] = String(Math.max(1, Math.ceil(r.retryAfter ?? 1)));
	return new Response(m === "HEAD" ? null : ok ? (r.html as string) : SHARE_TEXT[status], { status, headers });
}

/** Requests the middleware never looks at beyond the path. */
export function skipRequest(url: URL, request: Request): boolean {
	const p = url.pathname;
	return (
		p.startsWith("/_emdash") ||
		p.startsWith("/_astro/") ||
		p.startsWith("/_image") ||
		url.searchParams.has("_preview") ||
		url.searchParams.has("_edit") ||
		EDIT_COOKIE_RE.test(request.headers.get("cookie") ?? "") ||
		STATIC_RE.test(p)
	);
}

/** Status and HTML-ness from headers only; the body is never touched. */
export function observeResponse(res: Response): { status: number; html: boolean } {
	return { status: res.status, html: (res.headers.get("content-type") ?? "").includes("text/html") };
}

/**
 * Fail-open guard: a plugin error (settings read, `after`, dispatch) never takes the page down. `next()` runs
 * at most once; when it already answered, that response is returned, and a rejection of the site's own
 * `next()` surfaces once, unchanged.
 */
export async function handleRequest(ctx: MwContext, next: MwNext, deps: MwDeps): Promise<Response> {
	let res: Promise<Response> | undefined;
	const once = () => (res ??= next());
	try {
		return await handle(ctx, once, deps);
	} catch (err) {
		// A rejected `next()` rethrows here, once; past this line the error is the plugin's own.
		const r = res && (await res);
		console.warn("[cookieless] request handling failed:", err);
		return r ?? next();
	}
}

async function handle(ctx: MwContext, next: MwNext, deps: MwDeps): Promise<Response> {
	const s = await deps.settings();
	const now = deps.now?.() ?? Date.now();
	markMiddlewareLive(now);
	const early = (await handleScript(ctx, s, deps.linkedHosts)) ?? (await handleCollect(ctx, s)) ?? (await handleShare(ctx, s));
	if (early) return early;
	// Other methods on the plugin's own public paths are not site pages: never log them.
	// Share URLs carry the token: other methods on them fall through to the site but are never logged.
	if (skipRequest(ctx.url, ctx.request) || ctx.url.pathname === s.scriptPath || ctx.url.pathname === s.collectPath || ctx.url.pathname.startsWith(`${s.sharePath}/`)) return next();

	if (now - lastSeen >= SEEN_EVERY_MS) {
		lastSeen = now;
		deps.markSeen();
	}

	const c = classifyUa(ctx.request.headers.get("user-agent"), await deps.agentRules?.().catch(() => undefined));
	try {
		ctx.locals[s.namespace] = { audience: c.audience, botId: c.botId ?? null };
	} catch {}

	const res = await (s.scriptForBots === "skip_known_bots" ? withAudience(c.audience, next) : next());
	const o = observeResponse(res);
	if (shouldRecordServerHit(o.status, c.audience, s)) {
		const info: ServerHitInfo = {
			...requestInfo(ctx.request),
			url: ctx.url.pathname + ctx.url.search,
			method: ctx.request.method,
			status: o.status,
			userRole: role(ctx),
			classification: c,
		};
		deps.after(() => deps.recordServerHit(info));
	}
	return res;
}

/** Test helper: make the next request mark the middleware as seen again. */
export function resetSeen(): void {
	lastSeen = Number.NEGATIVE_INFINITY;
}
