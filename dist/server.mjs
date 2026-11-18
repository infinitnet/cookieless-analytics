import { PLUGIN_ID, ROUTES } from "./contract.mjs";
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
// src/server.ts
/**
* In-process helper for other plugins and site code on the same EmDash install:
* `recordEvent(locals, event, request)` posts one event body to this plugin's `in` route through the
* host's public route dispatcher. Package export `./server`; types come from `./contract`.
*/
/**
* Headers copied from the visitor's request, so the event joins the visitor's session by visitor key and
* honours the privacy signals; nothing else is (no cookie, origin, referer or forwarding header).
*/
const COPIED = [
	"user-agent",
	"accept-language",
	"cf-connecting-ip",
	"sec-gpc",
	"dnt",
	"sec-ch-ua-mobile",
	"sec-ch-ua-platform"
];
/**
* Record one event for the visitor of `request`. No `Origin` is sent, so the event belongs to the local
* site and keeps its revenue fields even when `acceptClientRevenue` is off. Returns `{ ok }`, or null when
* the plugin or its route is absent; never throws.
*/
async function recordEvent(locals, event, request) {
	const dispatch = getPublicPluginApiRouteHandler(locals);
	if (!dispatch) return null;
	const headers = new Headers({ "content-type": "application/json" });
	for (const h of COPIED) {
		const v = request.headers.get(h);
		if (v !== null) headers.set(h, v);
	}
	const cf = request.cf;
	try {
		const post = new Request(request.url, {
			method: "POST",
			headers,
			body: JSON.stringify({
				...event,
				v: 1,
				t: "ev"
			}),
			...cf ? { cf } : {}
		});
		if (cf && post.cf === void 0) Object.defineProperty(post, "cf", { value: cf });
		const res = await dispatch(PLUGIN_ID, "POST", `/${ROUTES.in}`, post);
		if (!res.success && res.error?.code === "NOT_FOUND") return null;
		const status = res.data?.status;
		return { ok: res.success && (typeof status !== "number" || status < 300) };
	} catch {
		return { ok: false };
	}
}
export { recordEvent };
