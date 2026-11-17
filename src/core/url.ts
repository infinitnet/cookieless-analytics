/** Path, query and referrer helpers. */

const BASE = "http://h.invalid";
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>>;
export const CLICK_IDS = ["gclid", "msclkid", "gbraid", "wbraid", "yclid", "fbclid", "ttclid", "twclid"] as const;

/** `www.` stripped, lowercase host. */
export function cleanHost(host: string): string {
	return host.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

export function allowed(param: string, allowlist: readonly string[]): boolean {
	const p = param.toLowerCase();
	return allowlist.some((a) => (a.endsWith("*") ? p.startsWith(a.slice(0, -1)) : p === a));
}

export const SITE_SEARCH_TERM_MAX = 64;

/**
 * A site search term as stored: trimmed, lowercased, whitespace collapsed, at most 64
 * characters, and `redacted` when it holds an `@` or nine or more consecutive digits (personal data typed
 * into a search box).
 */
export function sanitizeSearchTerm(v: string): string {
	const t = v.trim().toLowerCase().replace(/\s+/g, " ");
	if (t.includes("@") || /\d{9,}/.test(t)) return "redacted";
	return t.slice(0, SITE_SEARCH_TERM_MAX).trim();
}

export interface NormalizedUrl {
	/** Path without trailing slash (except root), repeated slashes collapsed, max 512 chars. */
	path: string;
	/** Allowlisted parameters, sorted, `a=1&b=2`, or "" when none. */
	query: string;
	utm: Utm;
	/** Click id parameter names present (`gclid`, ...), regardless of the allowlist. */
	clickIds: string[];
}

/**
 * Normalize a `path?query` (or absolute URL) against a query allowlist. `searchParams` (site search names,
 * pageviews only) are kept too, with each value through `sanitizeSearchTerm`; an empty term is dropped.
 */
export function normalizeUrl(u: string, allowlist: readonly string[], searchParams: readonly string[] = []): NormalizedUrl {
	let url: URL;
	try {
		url = new URL(u, BASE);
	} catch {
		return { path: "/", query: "", utm: {}, clickIds: [] };
	}
	let path = url.pathname.replace(/\/{2,}/g, "/");
	if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
	path = path.slice(0, 512) || "/";
	const kept: [string, string][] = [];
	const utm: Utm = {};
	const clickIds: string[] = [];
	for (const [k, v] of url.searchParams) {
		const key = k.toLowerCase();
		if ((UTM_KEYS as readonly string[]).includes(key) && v.trim() && !utm[key as UtmKey])
			utm[key as UtmKey] = v.trim().toLowerCase().slice(0, 128);
		if ((CLICK_IDS as readonly string[]).includes(key) && !clickIds.includes(key)) clickIds.push(key);
		if (searchParams.includes(key)) {
			const term = sanitizeSearchTerm(v);
			if (term) kept.push([key, term]);
		} else if (allowed(key, allowlist)) kept.push([key, v.slice(0, 256)]);
	}
	kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
	const query = new URLSearchParams(kept).toString().slice(0, 1024);
	return { path, query, utm, clickIds };
}

export interface Referrer {
	host: string;
	path: string;
}

/** Host (lowercase, `www.` stripped) and path of an absolute http(s) referrer, or null. */
export function parseReferrer(r: string | null | undefined): Referrer | null {
	if (!r) return null;
	try {
		const url = new URL(r);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		const host = cleanHost(url.hostname);
		if (!host) return null;
		return { host, path: url.pathname.slice(0, 256) || "/" };
	} catch {
		return null;
	}
}

/** True when two hosts are the same site, ignoring case and a leading `www.`. */
export function sameHost(a: string | null | undefined, b: string | null | undefined): boolean {
	return !!a && !!b && cleanHost(a) === cleanHost(b);
}

/** A public suffix such as `com`, `de`, `co.uk` or `com.au` (not `evil.com`). */
const SUFFIX_RE = /^(?:[a-z]{2,6}|(?:co|com|net|org|ac|gov|edu|ne|or)\.[a-z]{2})$/;

/** Host matches a list entry: exact or subdomain (`bing.com`), or the base on any public suffix for `google.*`. */
export function hostMatches(host: string, entry: string): boolean {
	const h = cleanHost(host);
	const e = entry.toLowerCase();
	if (e.endsWith(".*")) {
		const base = e.slice(0, -2);
		const labels = h.split(".");
		return labels.some((l, i) => l === base && SUFFIX_RE.test(labels.slice(i + 1).join(".")));
	}
	return h === e || h.endsWith(`.${e}`);
}

export function hostInList(host: string | null | undefined, list: readonly string[] | undefined): boolean {
	return !!host && !!list && list.some((e) => hostMatches(host, e));
}
