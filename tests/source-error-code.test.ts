import { describe, expect, it } from "vitest";
import { fetchJson } from "../src/sources/gsc-auth.js";

const http = (body: unknown, status: number) => ({ fetch: async () => new Response(JSON.stringify(body), { status }) }) as never;

describe("provider error codes", () => {
	it("names Bing's error without echoing the body", async () => {
		await expect(fetchJson(http({ ErrorCode: 3, Message: "ERROR!!! InvalidApiKey" }, 400), "https://example.com/x", {}, "Bing Webmaster")).rejects.toThrow("Bing Webmaster answered 400 (InvalidApiKey).");
	});
	it("keeps Google's code", async () => {
		await expect(fetchJson(http({ error: "invalid_grant" }, 400), "https://example.com/x", {}, "Google")).rejects.toThrow("Google answered 400 (invalid_grant).");
	});
});

describe("Bing throttling", () => {
	it("backs off like a 429", async () => {
		const { listBingSites: listSites } = await import("../src/sources/bing.js");
		const throttled = { fetch: async () => new Response(JSON.stringify({ ErrorCode: 3, Message: "ERROR!!! ThrottleIP" }), { status: 400 }) } as never;
		await expect(listSites({ http: throttled, settings: { bingEnabled: true, bingAuth: "apikey", bingApiKey: "k", bingClientId: "", bingClientSecret: "", bingRefreshToken: "" } })).rejects.toMatchObject({ status: 429 });
	});
});

describe("causes are named", () => {
	it("a 2xx answer without JSON names the content type; a bad service account key names the error class", async () => {
		const html = { fetch: async () => new Response("<!doctype html><p>sign in</p>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }) } as never;
		await expect(fetchJson(html, "https://example.com/x", {}, "Search Console")).rejects.toMatchObject({ status: 502, message: "Search Console answered 200 without JSON (text/html)." });
		const { getAccessToken } = await import("../src/sources/gsc-auth.js");
		const bad = JSON.stringify({ client_email: "x@example.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n" });
		const err = await getAccessToken({ http: html, settings: { gscAuth: "service_account", gscServiceAccount: bad, gscClientId: "", gscClientSecret: "", gscRefreshToken: "" } }).then(
			() => "",
			(e: unknown) => (e as Error).message,
		);
		expect(err).toMatch(/^The service account key could not be read \([A-Za-z]+\)\.$/);
	});
});
