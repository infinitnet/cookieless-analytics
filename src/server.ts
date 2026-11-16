/**
 * In-process helper for other plugins and site code on the same EmDash install:
 * `recordEvent(locals, event, request)` posts one event body to this plugin's `in` route through the
 * host's public route dispatcher. Package export `./server`; types come from `./contract`.
 */
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
import { type IngestEvent, PLUGIN_ID, ROUTES } from "./contract.js";

/** The event fields a caller sets; `v` and `t` are filled in. */
export type ServerEvent = Pick<IngestEvent, "name" | "u" | "p" | "val" | "cur" | "oid" | "sid" | "h">;

/**
 * Headers copied from the visitor's request, so the event joins the visitor's session by visitor key and
 * honours the privacy signals; nothing else is (no cookie, origin, referer or forwarding header).
 */
const COPIED = ["user-agent", "accept-language", "cf-connecting-ip", "sec-gpc", "dnt", "sec-ch-ua-mobile", "sec-ch-ua-platform"] as const;

/**
 * Record one event for the visitor of `request`. No `Origin` is sent, so the event belongs to the local
 * site and keeps its revenue fields even when `acceptClientRevenue` is off. Returns `{ ok }`, or null when
 * the plugin or its route is absent; never throws.
 */
export async function recordEvent(locals: unknown, event: ServerEvent, request: Request): Promise<{ ok: boolean } | null> {
	const dispatch = getPublicPluginApiRouteHandler(locals as Parameters<typeof getPublicPluginApiRouteHandler>[0]);
	if (!dispatch) return null;
	const headers = new Headers({ "content-type": "application/json" });
	for (const h of COPIED) {
		const v = request.headers.get(h);
		if (v !== null) headers.set(h, v);
	}
	const cf = (request as { cf?: unknown }).cf;
	try {
		// Workers take `cf` in the init; elsewhere it is set on the object, where the recorder reads it.
		const post = new Request(request.url, { method: "POST", headers, body: JSON.stringify({ ...event, v: 1, t: "ev" }), ...(cf ? { cf } : {}) } as RequestInit);
		if (cf && (post as { cf?: unknown }).cf === undefined) Object.defineProperty(post, "cf", { value: cf });
		const res = await dispatch(PLUGIN_ID, "POST", `/${ROUTES.in}`, post);
		if (!res.success && res.error?.code === "NOT_FOUND") return null;
		// A raw route answer is a `pluginResponse`: 503 means the event was not stored and may be sent again.
		const status = (res.data as { status?: unknown } | null | undefined)?.status;
		return { ok: res.success && (typeof status !== "number" || status < 300) };
	} catch {
		return { ok: false };
	}
}
