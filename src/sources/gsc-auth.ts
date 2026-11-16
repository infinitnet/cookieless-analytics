/**
 * Google auth: one `getAccessToken` over two modes. `service_account`: RS256 JWT bearer grant
 * signed with WebCrypto. `oauth`: refresh grant with the operator's own web client; the refresh token
 * comes from the web flow (`startOAuth`, `exchangeOAuth`) with `state` and a PKCE verifier kept in
 * `kv search:oauth` for 10 minutes. Access tokens are cached in memory until expiry minus 60 s, keyed
 * by a hash of the credential so a changed credential never reuses a token. No token or secret is ever
 * returned or logged; provider errors carry the status and Google's short error code only.
 */
import { PluginRouteError } from "emdash";
import { base64url, type KvLike, randomId, sha256, timingSafeEqual } from "../core/crypto.js";
import type { Settings } from "../settings.js";
import { type Http, SourceError } from "./types.js";

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const OAUTH_KV = "search:oauth";
export const OAUTH_TTL_MS = 10 * 60_000;
const EARLY_MS = 60_000;

export type AuthSettings = Pick<Settings, "gscAuth" | "gscClientId" | "gscClientSecret" | "gscRefreshToken" | "gscServiceAccount">;
export interface AuthCtx {
	http: Http;
	settings: AuthSettings;
	/** Milliseconds; defaults to the clock. */
	now?(): number;
}

const tokens = new Map<string, { token: string; exp: number }>();
export const clearTokenCache = () => tokens.clear();

interface ServiceAccount {
	client_email: string;
	private_key: string;
}
function serviceAccount(json: string): ServiceAccount | null {
	try {
		const sa = JSON.parse(json) as Partial<ServiceAccount>;
		return typeof sa.client_email === "string" && typeof sa.private_key === "string" && sa.private_key.includes("PRIVATE KEY") ? (sa as ServiceAccount) : null;
	} catch {
		return null;
	}
}

/** Credentials for the selected mode are present. */
export function gscConfigured(s: AuthSettings): boolean {
	if (s.gscAuth === "service_account") return !!serviceAccount(s.gscServiceAccount);
	if (s.gscAuth === "oauth") return !!(s.gscClientId && s.gscClientSecret && s.gscRefreshToken);
	return false;
}

/** The provider's short error code (Google `invalid_grant`, Bing `InvalidApiKey`), never a body echo. */
async function errorCode(res: Response): Promise<string> {
	try {
		const j = (await res.json()) as { error?: unknown; ErrorCode?: unknown; Message?: unknown };
		if (typeof j.ErrorCode === "number" && typeof j.Message === "string") {
			const word = /([A-Za-z]{3,40})\s*$/.exec(j.Message)?.[1];
			return word ? ` (${word})` : "";
		}
		const e = typeof j.error === "string" ? j.error : (j.error as { status?: unknown } | undefined)?.status;
		return typeof e === "string" && /^[A-Za-z_]{1,40}$/.test(e) ? ` (${e})` : "";
	} catch {
		return "";
	}
}

/** Fetch JSON; a non-2xx answer becomes `SourceError` with the status. */
export async function fetchJson(http: Http, url: string, init: RequestInit, what: string): Promise<unknown> {
	const res = await http.fetch(url, init);
	if (!res.ok) throw new SourceError(res.status, `${what} answered ${res.status}${await errorCode(res)}.`);
	try {
		return await res.json();
	} catch {
		// A proxy or captive page answering 200 with HTML: name it instead of a bare parse error.
		const type = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().slice(0, 40) || "no content type";
		throw new SourceError(502, `${what} answered ${res.status} without JSON (${type}).`);
	}
}

const form = (fields: Record<string, string>): RequestInit => ({
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams(fields).toString(),
});

const enc = new TextEncoder();
const b64json = (v: unknown) => base64url(enc.encode(JSON.stringify(v)));

/** RS256 JWT assertion for the bearer grant (RFC 7523), valid one hour. */
export async function signJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
	const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
	const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
	const input = `${b64json({ alg: "RS256", typ: "JWT" })}.${b64json({ iss: sa.client_email, scope: GSC_SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 })}`;
	const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(input)));
	return `${input}.${base64url(sig)}`;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

function cacheToken(key: string, body: unknown, nowMs: number): string {
	const t = body as { access_token?: unknown; expires_in?: unknown };
	if (typeof t.access_token !== "string") throw new SourceError(502, "Google sent no access token.");
	tokens.set(key, { token: t.access_token, exp: nowMs + (typeof t.expires_in === "number" ? t.expires_in : 3600) * 1000 - EARLY_MS });
	return t.access_token;
}

/** A valid access token for the configured mode. */
export async function getAccessToken(ctx: AuthCtx): Promise<string> {
	const s = ctx.settings;
	const nowMs = ctx.now?.() ?? Date.now();
	if (!gscConfigured(s)) throw new SourceError(401, "Google Search Console is not connected.");
	const cred = s.gscAuth === "service_account" ? s.gscServiceAccount : `${s.gscClientId}\n${s.gscRefreshToken}`;
	const key = `${s.gscAuth}:${hex(await sha256(cred))}`;
	const hit = tokens.get(key);
	if (hit && hit.exp > nowMs) return hit.token;
	if (s.gscAuth === "service_account") {
		const sa = serviceAccount(s.gscServiceAccount) as ServiceAccount;
		let assertion: string;
		try {
			assertion = await signJwt(sa, Math.floor(nowMs / 1000));
		} catch (e) {
			// The class (DataError, SyntaxError, ...) tells a malformed key from an unsupported one; the message could quote key material, so it is left out.
			throw new SourceError(401, `The service account key could not be read (${e instanceof Error && e.name ? e.name : "Error"}).`);
		}
		return cacheToken(key, await fetchJson(ctx.http, TOKEN_URL, form({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), "Google sign-in"), nowMs);
	}
	const body = await fetchJson(
		ctx.http,
		TOKEN_URL,
		form({ grant_type: "refresh_token", client_id: s.gscClientId, client_secret: s.gscClientSecret, refresh_token: s.gscRefreshToken }),
		"Google sign-in",
	);
	return cacheToken(key, body, nowMs);
}

interface OAuthState {
	state: string;
	verifier: string;
	expires: number;
	redirectUri: string;
}

/** Start the web flow: store `state` and the PKCE verifier, return the Google consent URL. */
export async function startOAuth(ctx: { kv: KvLike; settings: AuthSettings; now?(): number }, redirectUri: string): Promise<{ url: string }> {
	const s = ctx.settings;
	if (!s.gscClientId || !s.gscClientSecret) throw new PluginRouteError("oauth_not_configured", "Save the OAuth client id and client secret in the plugin settings first.", 400);
	const state = randomId(32);
	const verifier = randomId(64);
	await ctx.kv.set(OAUTH_KV, { state, verifier, expires: (ctx.now?.() ?? Date.now()) + OAUTH_TTL_MS, redirectUri } satisfies OAuthState);
	const q = new URLSearchParams({
		client_id: s.gscClientId,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: GSC_SCOPE,
		access_type: "offline",
		prompt: "consent",
		state,
		code_challenge: base64url(await sha256(verifier)),
		code_challenge_method: "S256",
	});
	return { url: `${AUTH_URL}?${q}` };
}

/**
 * Finish the web flow: check `state`, exchange the code, store the refresh token through
 * `setSecret` (the host encrypts it) and clear the KV state. Answers `{ connected: true }` only.
 */
export async function exchangeOAuth(
	ctx: { http: Http; kv: KvLike; settings: AuthSettings; setSecret(key: "gscRefreshToken", value: string): Promise<void>; now?(): number },
	code: string,
	state: string,
): Promise<{ connected: true }> {
	const nowMs = ctx.now?.() ?? Date.now();
	const rec = await ctx.kv.get<OAuthState>(OAUTH_KV);
	if (!rec || typeof rec.state !== "string" || rec.expires < nowMs || !timingSafeEqual(rec.state, state))
		throw new PluginRouteError("oauth_state", "The sign-in expired or did not start here. Connect Google again.", 400);
	const s = ctx.settings;
	const body = (await fetchJson(
		ctx.http,
		TOKEN_URL,
		form({ grant_type: "authorization_code", code, client_id: s.gscClientId, client_secret: s.gscClientSecret, redirect_uri: rec.redirectUri, code_verifier: rec.verifier }),
		"Google sign-in",
	)) as { refresh_token?: unknown };
	if (typeof body.refresh_token !== "string" || !body.refresh_token)
		throw new PluginRouteError("no_refresh_token", "Google sent no refresh token. Remove the app's access in your Google account and connect again.", 502);
	await ctx.setSecret("gscRefreshToken", body.refresh_token);
	// The token of this exchange serves the property picker right away, before the settings cache refreshes.
	cacheToken(`oauth:${hex(await sha256(`${s.gscClientId}\n${body.refresh_token}`))}`, body, nowMs);
	await ctx.kv.delete(OAUTH_KV);
	return { connected: true };
}

export interface Property {
	siteUrl: string;
	permissionLevel: string;
}

/** Search Console properties of the connected identity; unverified entries hidden. */
export async function listProperties(ctx: AuthCtx): Promise<Property[]> {
	const token = await getAccessToken(ctx);
	const body = (await fetchJson(ctx.http, SITES_URL, { headers: { authorization: `Bearer ${token}` } }, "Search Console")) as { siteEntry?: unknown };
	const entries = Array.isArray(body.siteEntry) ? (body.siteEntry as Array<Partial<Property>>) : [];
	return entries
		.filter((e): e is Property => typeof e.siteUrl === "string" && typeof e.permissionLevel === "string" && e.permissionLevel !== "siteUnverifiedUser")
		.map((e) => ({ siteUrl: e.siteUrl, permissionLevel: e.permissionLevel }));
}

/**
 * The property proposed for a hostname: a URL prefix property on exactly that hostname
 * (https first), else the narrowest `sc-domain:` property equal to the hostname or a parent of it.
 */
export function suggestProperty(siteUrls: readonly string[], hostname: string): string | null {
	const host = hostname.toLowerCase();
	const prefixes = siteUrls.filter((u) => {
		try {
			return !u.startsWith("sc-domain:") && new URL(u).hostname.toLowerCase() === host;
		} catch {
			return false;
		}
	});
	const best = prefixes.find((u) => u.startsWith("https:")) ?? prefixes[0];
	if (best) return best;
	const domains = siteUrls.filter((u) => {
		const d = u.startsWith("sc-domain:") ? u.slice(10).toLowerCase() : "";
		return !!d && (host === d || host.endsWith(`.${d}`));
	});
	return domains.sort((a, b) => b.length - a.length)[0] ?? null;
}
