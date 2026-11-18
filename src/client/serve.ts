import { PLUGIN_ID, ROUTES } from "../contract.js";
import { publicNames } from "../names.js";
import type { Settings } from "../settings.js";
import type { ClientConfig } from "./boot.js";
import { PAGE_SCRIPT } from "./generated.js";

/** Direct plugin route, used when the middleware is not installed (degraded mode). */
export const DIRECT_IN_PATH = `/_emdash/api/plugins/${PLUGIN_ID}/${ROUTES.in}`;

/** `linked`: hosts of the client sites linked to this site (`linkedHostsOf`). */
export function clientConfig(s: Settings, viaAlias = true, linked: readonly string[] = []): ClientConfig {
	return {
		c: viaAlias ? s.collectPath : DIRECT_IN_PATH,
		n: s.namespace,
		a: publicNames(s.namespace).attrPrefix,
		g: s.signals,
		o: s.autoOutbound ? 1 : 0,
		dl: s.autoDownloads ? 1 : 0,
		s: s.captureScreen ? 1 : 0,
		f: s.autoForms ? 1 : 0,
		x: s.downloadExtensions,
		m: s.maxEngagedMsPerPage,
		i: s.ignorePathPrefixes,
		l: [...linked],
		r: s.linkRules,
	};
}

/** The page script with its configuration injected. `<` is escaped so the code is safe inline. */
export function scriptBody(s: Settings, viaAlias = true, linked: readonly string[] = []): string {
	const cfg = JSON.stringify(clientConfig(s, viaAlias, linked)).replace(/</g, "\\u003c");
	return PAGE_SCRIPT.replace("__CFG__", () => cfg);
}

/** FNV-1a 32-bit, enough for an ETag. */
function fnv(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
	return (h >>> 0).toString(36);
}

let cache: { key: string; body: string; etag: string } | undefined;

/** `GET|HEAD scriptPath` response: cacheable for one hour, ETag from the configured body, 304 on match. */
export function scriptResponse(s: Settings, request: Request, linked: readonly string[] = []): Response {
	const key = JSON.stringify(clientConfig(s, true, linked));
	if (cache?.key !== key) {
		const body = scriptBody(s, true, linked);
		cache = { key, body, etag: `"${fnv(body)}"` };
	}
	const headers = {
		"content-type": "text/javascript; charset=utf-8",
		"cache-control": "public, max-age=3600",
		etag: cache.etag,
		"x-content-type-options": "nosniff",
	};
	if (request.headers.get("if-none-match") === cache.etag) return new Response(null, { status: 304, headers });
	return new Response(request.method === "HEAD" ? null : cache.body, { status: 200, headers });
}
