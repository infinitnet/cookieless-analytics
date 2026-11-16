/**
 * Public route `share/view`, reached only through the middleware's in-process dispatch on
 * `sharePath/<token>`. Answers `{ status, html?, realm?, retryAfter?, cache? }`; the middleware builds the response.
 * Unknown, expired and revoked tokens are indistinguishable (404).
 */
import type { KvLike } from "../core/crypto.js";
import type { Preset } from "../core/presets.js";
import { checkPassword, lockedFor, passwordOk, recordFailure, resetFailures } from "../dashboards/password.js";
import { renderShared } from "../dashboards/render.js";
import { distinctRequests, runDashboard } from "../dashboards/run.js";
import { SHARE_COMPARE_MAX_REQUESTS } from "../dashboards/schema.js";
import { lookup, recordView, type ShareColl } from "../dashboards/shares.js";
import { type DashColl, getDashboard } from "../dashboards/store.js";
import { tileData } from "../dashboards/tiles.js";
import { answer, type DataCtx, type DataEnv, loadAll, loadAnnotations } from "./data.js";

export interface ShareViewResult {
	status: 200 | 401 | 404 | 429;
	html?: string;
	/** 401: the Basic auth realm. */
	realm?: string;
	/** 429: seconds. */
	retryAfter?: number;
	/** 200: `open` links may be cached a minute, `private` ones never. */
	cache?: "open" | "private";
}

export interface ShareViewCtx {
	request: Request;
	kv: KvLike;
	storage: DataCtx["storage"] & { shares?: ShareColl; dashboards?: DashColl };
	schema?: DataCtx["schema"];
}

export interface ShareViewEnv extends DataEnv {
	/** Run work after the response (`after` from `emdash`). */
	after(fn: () => Promise<unknown>): void;
}

/** The password of `Authorization: Basic base64(user:pass)` as UTF-8; the user part is ignored. */
export function basicPassword(header: string | null): string | null {
	const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? "");
	if (!m) return null;
	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(m[1] as string), (c) => c.charCodeAt(0)));
		const i = text.indexOf(":");
		return i < 0 ? null : text.slice(i + 1);
	} catch {
		return null;
	}
}

export function shareViewRoute(env: ShareViewEnv) {
	return {
		public: true,
		methods: ["GET" as const],
		request: { body: "none" as const },
		async handler(ctx: ShareViewCtx): Promise<ShareViewResult> {
			const s = await env.settings();
			const now = env.now?.() ?? Math.floor(Date.now() / 1000);
			const url = new URL(ctx.request.url);
			// Only the share path answers: the direct plugin route path is a 404.
			const prefix = `${s.sharePath}/`;
			const token = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
			if (!token || token.includes("/") || !ctx.storage.shares || !ctx.storage.dashboards) return { status: 404 };
			const hit = await lookup(ctx.storage.shares, token, now);
			if (!hit) return { status: 404 };
			const dash = await getDashboard(ctx.storage.dashboards, hit.share.site, hit.share.dashboard).catch(() => null);
			if (!dash) return { status: 404 };

			if (hit.share.pw) {
				const wait = await lockedFor(ctx.kv, hit.id, now);
				if (wait > 0) return { status: 429, retryAfter: wait };
				const realm = `View ${hit.share.prefix}`;
				const password = basicPassword(ctx.request.headers.get("authorization"));
				if (password === null) return { status: 401, realm };
				if (!passwordOk(password) || !(await checkPassword(hit.id, hit.share.pw, password, hit.secret, now * 1000))) {
					await recordFailure(ctx.kv, hit.id, now);
					return { status: 401, realm };
				}
				await resetFailures(ctx.kv, hit.id);
			}

			const r = url.searchParams.get("r");
			const range = dash.viewer.ranges.includes(r as Preset) ? (r as Preset) : dash.defaults.range;
			const allowCompare = dash.viewer.compare && distinctRequests(dash) <= SHARE_COMPARE_MAX_REQUESTS;
			const compare = allowCompare && url.searchParams.get("c") === "1";
			const site = hit.share.site;
			const dctx: DataCtx = { input: null, storage: ctx.storage, kv: ctx.kv, publicSurface: true, ...(ctx.schema ? { schema: ctx.schema } : {}) };
			const run = await runDashboard(
				{
					site,
					tz: s.siteTimezone,
					now,
					dispatch: (b, a) => answer(env, dctx, b, a),
					loadAnnotations: (r) => loadAnnotations(ctx.storage.annotations, site, r.from, r.to, s.siteTimezone),
					segmentExists: async (id) => ((await ctx.storage.segments?.get(id)) as { site?: unknown } | null)?.site === site,
				},
				dash,
				// Annotation texts reach viewers only when the dashboard turns them on.
				// `?c=1` turns on the dashboard's own comparison: a compare segment when set, the previous period otherwise.
				{ range, compare: compare ? (dash.defaults.compare === "segment" ? "segment" : "previous") : "none", annotations: dash.viewer.annotations === true },
			);
			const goalNames = dash.tiles.some((t) => t.params?.goal) ? new Map((await loadAll(ctx.storage.goals, { site })).map((g) => [g.id, (g.data as { name?: string }).name])) : new Map<string, string | undefined>();
			const tiles = dash.tiles.map((t, i) => {
				const res = run.tiles[i]?.result;
				if (!res) return null;
				const d = tileData(t, res, { goalName: t.params?.goal ? goalNames.get(t.params.goal) : undefined });
				return { ...d, notices: [...d.notices, ...(run.tiles[i]?.notices ?? [])] };
			});
			const html = renderShared({ dashboard: dash, tiles, range, compare, ranges: dash.viewer.ranges, allowCompare, generatedAt: now, tz: s.siteTimezone });
			const shares = ctx.storage.shares;
			// The middleware dispatches HEAD as GET with the original Request: a HEAD is not a view.
			if (ctx.request.method !== "HEAD") env.after(() => recordView(shares, hit.id, now));
			return { status: 200, html, cache: hit.share.pw ? "private" : "open" };
		},
	};
}
