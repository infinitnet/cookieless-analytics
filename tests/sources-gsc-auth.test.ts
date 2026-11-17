/** Google auth: JWT bearer grant, refresh grant, token cache, the OAuth web flow, properties. */
import { beforeEach, describe, expect, it } from "vitest";
import { base64url } from "../src/core/crypto.js";
import { clearTokenCache, exchangeOAuth, GSC_SCOPE, getAccessToken, gscConfigured, listProperties, OAUTH_KV, signJwt, startOAuth, suggestProperty, TOKEN_URL } from "../src/sources/gsc-auth.js";
import { fakeGoogle, googleSettings, testServiceAccount } from "./gsc.helpers.js";
import { MemoryKv } from "./helpers.js";

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

describe("Google auth", () => {
	beforeEach(() => clearTokenCache());

	it("signs an RS256 JWT assertion that verifies with the service account's public key", async () => {
		const sa = await testServiceAccount();
		const jwt = await signJwt(JSON.parse(sa.json), 1_773_360_000);
		const [h, c, sig] = jwt.split(".") as [string, string, string];
		expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
		expect(decode(c)).toEqual({ iss: "reader@project.iam.gserviceaccount.com", scope: GSC_SCOPE, aud: TOKEN_URL, iat: 1_773_360_000, exp: 1_773_363_600 });
		const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", sa.publicKey, Buffer.from(sig, "base64url"), new TextEncoder().encode(`${h}.${c}`));
		expect(ok).toBe(true);
		expect(base64url(new Uint8Array([251, 255]))).toBe("-_8");
	});

	it("service account mode posts the bearer grant and caches the token until expiry minus 60 s", async () => {
		const sa = await testServiceAccount();
		const g = fakeGoogle();
		let now = 1_773_360_000_000;
		const ctx = { http: g.http, settings: googleSettings({ gscAuth: "service_account", gscServiceAccount: sa.json }), now: () => now };
		expect(await getAccessToken(ctx)).toBe("ya29.fixture-access-token");
		expect(g.calls[0]?.form?.grant_type).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
		expect(g.calls[0]?.form?.assertion?.split(".")).toHaveLength(3);
		now += 3_538_000; // 3599 s - 60 s - 1 s
		await getAccessToken(ctx);
		expect(g.calls).toHaveLength(1);
		now += 2_000;
		await getAccessToken(ctx);
		expect(g.calls).toHaveLength(2);
	});

	it("OAuth mode uses the refresh grant; a changed credential never reuses a cached token", async () => {
		const g = fakeGoogle();
		await getAccessToken({ http: g.http, settings: googleSettings() });
		expect(g.calls[0]?.form).toEqual({ grant_type: "refresh_token", client_id: "client-id.apps.example", client_secret: "fixture-client-secret", refresh_token: "1//fixture-refresh-token" });
		await getAccessToken({ http: g.http, settings: googleSettings({ gscRefreshToken: "1//another" }) });
		expect(g.calls).toHaveLength(2);
	});

	it("configured only with complete credentials for the selected mode", async () => {
		expect(gscConfigured(googleSettings())).toBe(true);
		expect(gscConfigured(googleSettings({ gscRefreshToken: "" }))).toBe(false);
		expect(gscConfigured(googleSettings({ gscAuth: "off" }))).toBe(false);
		expect(gscConfigured(googleSettings({ gscAuth: "service_account", gscServiceAccount: "{}" }))).toBe(false);
		await expect(getAccessToken({ http: fakeGoogle().http, settings: googleSettings({ gscAuth: "off" }) })).rejects.toMatchObject({ status: 401 });
	});

	it("the web flow: state and PKCE in KV, the Google URL, the exchange stores the refresh token and returns nothing secret", async () => {
		const kv = new MemoryKv();
		const now = 1_773_360_000_000;
		const { url } = await startOAuth({ kv, settings: googleSettings({ gscRefreshToken: "" }), now: () => now }, "https://example.com/_emdash/admin/plugins/cookieless-analytics/search");
		const u = new URL(url);
		expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
		const q = Object.fromEntries(u.searchParams);
		expect(q).toMatchObject({ client_id: "client-id.apps.example", response_type: "code", access_type: "offline", prompt: "consent", scope: GSC_SCOPE, code_challenge_method: "S256" });
		const rec = (await kv.get<{ state: string; verifier: string; expires: number }>(OAUTH_KV)) as { state: string; verifier: string; expires: number };
		expect(rec.expires).toBe(now + 600_000);
		expect(q.state).toBe(rec.state);
		expect(q.code_challenge).toBe(base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rec.verifier)))));
		expect(url).not.toContain(rec.verifier);

		const g = fakeGoogle();
		const stored: Array<[string, string]> = [];
		const ctx = { http: g.http, kv, settings: googleSettings({ gscRefreshToken: "" }), now: () => now + 1000, setSecret: async (k: string, v: string) => void stored.push([k, v]) };
		await expect(exchangeOAuth(ctx, "4/code", "wrong-state")).rejects.toMatchObject({ code: "oauth_state" });
		expect(g.calls).toHaveLength(0);
		const r = await exchangeOAuth(ctx, "4/code", rec.state);
		expect(r).toEqual({ connected: true });
		expect(JSON.stringify(r)).not.toContain("fixture");
		expect(stored).toEqual([["gscRefreshToken", "1//fixture-refresh-token"]]);
		expect(g.calls[0]?.form).toMatchObject({ grant_type: "authorization_code", code: "4/code", code_verifier: rec.verifier, redirect_uri: "https://example.com/_emdash/admin/plugins/cookieless-analytics/search" });
		expect(await kv.get(OAUTH_KV)).toBeNull();
		// The state is single use.
		await expect(exchangeOAuth(ctx, "4/code", rec.state)).rejects.toMatchObject({ code: "oauth_state" });
	});

	it("an expired state is rejected; a missing client is a typed error", async () => {
		const kv = new MemoryKv();
		await startOAuth({ kv, settings: googleSettings(), now: () => 0 }, "https://example.com/x");
		const rec = (await kv.get<{ state: string }>(OAUTH_KV)) as { state: string };
		await expect(exchangeOAuth({ http: fakeGoogle().http, kv, settings: googleSettings(), now: () => 600_001, setSecret: async () => undefined }, "c", rec.state)).rejects.toMatchObject({ code: "oauth_state" });
		await expect(startOAuth({ kv, settings: googleSettings({ gscClientSecret: "" }) }, "https://example.com/x")).rejects.toMatchObject({ code: "oauth_not_configured" });
	});

	it("properties hide unverified entries; suggestions follow the matching rules", async () => {
		const items = await listProperties({ http: fakeGoogle().http, settings: googleSettings() });
		expect(items.map((i) => i.siteUrl)).toEqual(["sc-domain:example.com", "https://www.example.org/", "http://www.example.org/", "sc-domain:blog.example.com"]);
		const urls = items.map((i) => i.siteUrl);
		expect(suggestProperty(urls, "example.com")).toBe("sc-domain:example.com");
		expect(suggestProperty(urls, "shop.example.com")).toBe("sc-domain:example.com");
		expect(suggestProperty(urls, "blog.example.com")).toBe("sc-domain:blog.example.com");
		expect(suggestProperty(urls, "www.example.org")).toBe("https://www.example.org/");
		expect(suggestProperty(urls, "example.org")).toBeNull();
		expect(suggestProperty(urls, "shop.example.net")).toBeNull();
		expect(suggestProperty(urls, "notexample.com")).toBeNull();
	});
});
