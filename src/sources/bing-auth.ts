/**
 * Bing Webmaster auth: the API key (`apikey` query parameter, default) or OAuth 2.0 with the site's own
 * client from Bing Webmaster Tools (Settings, API access, OAuth client). OAuth follows Microsoft's
 * description (learn.microsoft.com/bingwebmaster/oauth2): authorize at `AUTH_URL` with `response_type=code`,
 * `client_id`, `redirect_uri`, `scope=webmaster.read` and `state`; exchange and refresh at `TOKEN_URL`
 * (form fields `client_id`, `client_secret`, `code` or `refresh_token`, `grant_type`, `redirect_uri`);
 * the API then takes `Authorization: Bearer`. Bing documents no PKCE, so none is sent; `state` is checked
 * here. Access tokens are cached in memory until expiry minus 60 s, keyed by a hash of the credential.
 * No token or secret is ever returned or logged.
 */
import { PluginRouteError } from "emdash";
import { type KvLike, randomId, sha256, timingSafeEqual } from "../core/crypto.js";
import type { Settings } from "../settings.js";
import { fetchJson } from "./gsc-auth.js";
import { type Http, SourceError } from "./types.js";

export const BING_AUTH_URL = "https://www.bing.com/webmasters/oauth/authorize";
export const BING_TOKEN_URL = "https://www.bing.com/webmasters/oauth/token";
export const BING_SCOPE = "webmaster.read";
export const BING_OAUTH_KV = "search:oauth:bing";
const TTL_MS = 10 * 60_000;
const EARLY_MS = 60_000;

export type BingSettings = Pick<Settings, "bingEnabled" | "bingAuth" | "bingApiKey" | "bingClientId" | "bingClientSecret" | "bingRefreshToken">;

/** The switch is on and the selected mode has its credentials. */
export const bingConfigured = (s: BingSettings) => s.bingEnabled && (s.bingAuth === "oauth" ? !!(s.bingClientId && s.bingClientSecret && s.bingRefreshToken) : !!s.bingApiKey);

const tokens = new Map<string, { token: string; exp: number }>();
export const clearBingTokenCache = () => tokens.clear();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const form = (fields: Record<string, string>): RequestInit => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });

function cache(key: string, body: unknown, nowMs: number): string {
	const t = body as { access_token?: unknown; expires_in?: unknown };
	if (typeof t.access_token !== "string") throw new SourceError(502, "Bing sent no access token.");
	tokens.set(key, { token: t.access_token, exp: nowMs + (typeof t.expires_in === "number" ? t.expires_in : 3600) * 1000 - EARLY_MS });
	return t.access_token;
}

/** A valid access token from the refresh token. */
export async function bingAccessToken(ctx: { http: Http; settings: BingSettings; now?(): number }): Promise<string> {
	const s = ctx.settings;
	const nowMs = ctx.now?.() ?? Date.now();
	if (!s.bingClientId || !s.bingClientSecret || !s.bingRefreshToken) throw new SourceError(401, "Bing is not connected.");
	const key = hex(await sha256(`${s.bingClientId}\n${s.bingRefreshToken}`));
	const hit = tokens.get(key);
	if (hit && hit.exp > nowMs) return hit.token;
	const body = await fetchJson(ctx.http, BING_TOKEN_URL, form({ client_id: s.bingClientId, client_secret: s.bingClientSecret, refresh_token: s.bingRefreshToken, grant_type: "refresh_token" }), "Bing sign-in");
	return cache(key, body, nowMs);
}

interface OAuthState {
	state: string;
	expires: number;
	redirectUri: string;
}

/** Start the web flow: store `state` for 10 minutes, return Bing's consent URL. */
export async function startBingOAuth(ctx: { kv: KvLike; settings: BingSettings; now?(): number }, redirectUri: string): Promise<{ url: string }> {
	const s = ctx.settings;
	if (!s.bingClientId || !s.bingClientSecret) throw new PluginRouteError("oauth_not_configured", "Save the Bing OAuth client id and client secret first.", 400);
	const state = randomId(32);
	await ctx.kv.set(BING_OAUTH_KV, { state, expires: (ctx.now?.() ?? Date.now()) + TTL_MS, redirectUri } satisfies OAuthState);
	const q = new URLSearchParams({ response_type: "code", client_id: s.bingClientId, redirect_uri: redirectUri, scope: BING_SCOPE, state });
	return { url: `${BING_AUTH_URL}?${q}` };
}

/** The pending Bing sign-in matches this `state` (the return page posts `code` and `state` without naming the provider). */
export async function isBingState(kv: KvLike, state: string): Promise<boolean> {
	const rec = await kv.get<OAuthState>(BING_OAUTH_KV);
	return !!rec && typeof rec.state === "string" && timingSafeEqual(rec.state, state);
}

/** Finish the web flow: check `state`, exchange the code, store the refresh token through `setSecret`, clear the KV state. */
export async function exchangeBingOAuth(
	ctx: { http: Http; kv: KvLike; settings: BingSettings; setSecret(key: "bingRefreshToken", value: string): Promise<void>; now?(): number },
	code: string,
	state: string,
): Promise<{ connected: true; source: "bing" }> {
	const nowMs = ctx.now?.() ?? Date.now();
	const rec = await ctx.kv.get<OAuthState>(BING_OAUTH_KV);
	if (!rec || typeof rec.state !== "string" || rec.expires < nowMs || !timingSafeEqual(rec.state, state))
		throw new PluginRouteError("oauth_state", "The sign-in expired or did not start here. Connect Bing again.", 400);
	const s = ctx.settings;
	const body = (await fetchJson(ctx.http, BING_TOKEN_URL, form({ client_id: s.bingClientId, client_secret: s.bingClientSecret, code, grant_type: "authorization_code", redirect_uri: rec.redirectUri }), "Bing sign-in")) as {
		refresh_token?: unknown;
	};
	if (typeof body.refresh_token !== "string" || !body.refresh_token) throw new PluginRouteError("no_refresh_token", "Bing sent no refresh token. Connect Bing again.", 502);
	await ctx.setSecret("bingRefreshToken", body.refresh_token);
	cache(hex(await sha256(`${s.bingClientId}\n${body.refresh_token}`)), body, nowMs);
	await ctx.kv.delete(BING_OAUTH_KV);
	return { connected: true, source: "bing" };
}
