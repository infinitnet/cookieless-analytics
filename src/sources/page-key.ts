/**
 * Page key: one key for provider URLs and own paths. The path is normalized exactly like
 * hit paths (`normalizeUrl`: query and fragment stripped, trailing slash stripped except root), so the
 * Pages join and the drawer match stored hits. Absolute URLs must be http or https on the site's
 * canonical host (lowercase; `www.` is ignored like everywhere else in this plugin); other hosts give null.
 */
import { cleanHost, normalizeUrl } from "../core/url.js";
import type { ClientSite } from "../multisite/registry.js";

export function pageKeyFor(origin: string): (url: string) => string | null {
	let host = "";
	try {
		host = cleanHost(new URL(origin).hostname);
	} catch {
		// No canonical origin: only own paths map.
	}
	return (url) => {
		const u = url.trim();
		if (u.startsWith("/") && !u.startsWith("//")) return normalizeUrl(u, []).path;
		let parsed: URL;
		try {
			parsed = new URL(u);
		} catch {
			return null;
		}
		if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !host || cleanHost(parsed.hostname) !== host) return null;
		return normalizeUrl(parsed.pathname, []).path;
	};
}

/** Origin a property stands for: `sc-domain:example.com` gives `https://example.com`; a URL prefix gives its origin. */
export function propertyOrigin(property: string): string {
	if (property.startsWith("sc-domain:")) return `https://${property.slice(10).toLowerCase()}`;
	try {
		return new URL(property).origin;
	} catch {
		return "";
	}
}

/**
 * Canonical origin of a site: the local site uses `siteOrigin`, else the request origin;
 * a client site uses `https://` plus its first registered host. Cron runs have no request, so the
 * mapped property's origin is the last fallback (docs/design-notes.md).
 */
export function canonicalOrigin(o: { siteOrigin: string; client?: Pick<ClientSite, "hosts">; requestUrl?: string; property?: string }): string {
	if (o.client) return o.client.hosts[0] ? `https://${o.client.hosts[0]}` : "";
	if (o.siteOrigin) return o.siteOrigin;
	if (o.requestUrl) {
		try {
			return new URL(o.requestUrl).origin;
		} catch {
			// fall through
		}
	}
	return o.property ? propertyOrigin(o.property) : "";
}
