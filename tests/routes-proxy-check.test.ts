/** `GET .../proxy/check`: the connection test of a server proxy. One site key, one secret, one of two answers, no write. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROUTES } from "../src/contract.js";
import { drops } from "../src/core/drops.js";
import { resetCounters } from "../src/core/recorder.js";
import { createPlugin } from "../src/index.js";
import { newProxySecret } from "../src/keys/proxy-secret.js";
import { hashSecret } from "../src/keys/token.js";
import { invalidateRegistry, PROXY_SNAPSHOT_MAX_AGE_MS } from "../src/multisite/registry.js";
import { proxyCheckRoute } from "../src/routes/proxy-check.js";
import { sitesColl } from "./helpers.js";

const BLOG_KEY = "kkkkkkkkkkkkkkkkkkkk";
const NEWS_KEY = "nnnnnnnnnnnnnnnnnnnn";
const BARE_KEY = "bbbbbbbbbbbbbbbbbbbb";
const PAUSED_KEY = "pppppppppppppppppppp";
const BASE = "https://example.org/_emdash/api/plugins/cookieless-analytics/proxy/check";

let sites: ReturnType<typeof sitesColl>;
let secrets: Record<string, string>;
/** Calls of the collection by method. */
let calls: Record<"query" | "get" | "put" | "delete", number>;

beforeEach(async () => {
	resetCounters();
	invalidateRegistry();
	sites = sitesColl([
		{ id: "blog", key: BLOG_KEY, hosts: ["blog.example.net"] },
		{ id: "news", key: NEWS_KEY, hosts: ["news.example.net"] },
		{ id: "bare", key: BARE_KEY, hosts: ["bare.example.net"] },
		{ id: "paused", key: PAUSED_KEY, hosts: ["paused.example.net"], paused: true },
	]);
	secrets = {};
	for (const id of ["blog", "news", "paused"]) {
		const { secret, hash } = await newProxySecret();
		secrets[id] = secret;
		Object.assign(sites.items.get(id) as object, { proxyHash: hash, proxyCreated: 1 });
	}
	calls = { query: 0, get: 0, put: 0, delete: 0 };
	for (const m of ["query", "get", "put", "delete"] as const) {
		const real = (sites[m] as (...a: unknown[]) => unknown).bind(sites);
		(sites as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => {
			calls[m]++;
			return real(...a);
		};
	}
});

/** One call as the host makes it: the query string parsed into `input`. */
async function check(k: string | null, secret?: string | null, extra: Record<string, string> = {}) {
	const url = k === null ? BASE : `${BASE}?k=${encodeURIComponent(k)}`;
	const request = new Request(url, { headers: { ...(secret === undefined || secret === null ? {} : { "x-ec-proxy-key": secret }), ...extra } });
	const res = await proxyCheckRoute().handler({ request, input: Object.fromEntries(new URL(url).searchParams), storage: { sites } });
	return { status: res.status, headers: res.headers, body: res.body && "value" in res.body ? JSON.parse(String(res.body.value)) : null };
}
const NO = { status: 403, headers: [["content-type", "application/json; charset=utf-8"]], body: { v: 1, ok: false } };

describe("proxy check route", () => {
	it("is a public GET with a raw answer and no cache header of its own, registered under the contract's name", () => {
		const r = proxyCheckRoute();
		expect(r).toMatchObject({ public: true, methods: ["GET"], response: "raw" });
		// Without `cacheControl` the host sends `private, no-store` with every answer.
		expect(r).not.toHaveProperty("cacheControl");
		expect(ROUTES.proxyCheck).toBe("proxy/check");
		const routes = (createPlugin() as unknown as { routes: Record<string, { public?: boolean; methods?: string[] }> }).routes;
		expect(routes["proxy/check"]).toMatchObject({ public: true, methods: ["GET"] });
	});

	it("answers 200 ok for the secret of the site key", async () => {
		expect(await check(BLOG_KEY, secrets.blog)).toEqual({ status: 200, headers: NO.headers, body: { v: 1, ok: true } });
		expect((await check(NEWS_KEY, secrets.news)).body).toEqual({ v: 1, ok: true });
		// A paused site's secret is still its secret: the check is about the secret alone.
		expect((await check(PAUSED_KEY, secrets.paused)).status).toBe(200);
		// The WordPress HTTP client's own user agent is a robot for the event route; the check does not look at it.
		expect((await check(BLOG_KEY, secrets.blog, { "user-agent": "WordPress/6.8; https://blog.example.net" })).status).toBe(200);
	});

	it("gives one and the same answer for a wrong secret, an unknown site and everything else", async () => {
		const wrong = (await newProxySecret()).secret;
		const cases: Array<[string, string | null, string | null | undefined]> = [
			["a wrong secret", BLOG_KEY, wrong],
			["an unknown site key", "uuuuuuuuuuuuuuuuuuuu", wrong],
			["an unknown site key with a real secret", "uuuuuuuuuuuuuuuuuuuu", secrets.blog as string],
			["the secret of another site", BLOG_KEY, secrets.news as string],
			["a site without a secret", BARE_KEY, wrong],
			["no secret header", BLOG_KEY, undefined],
			["an empty secret", BLOG_KEY, ""],
			["a malformed secret", BLOG_KEY, "nope"],
			["the stored hash instead of the secret", BLOG_KEY, await hashSecret(secrets.blog as string)],
			["no site key", null, secrets.blog as string],
			["a malformed site key", "BLOG", secrets.blog as string],
			["a site id instead of its key", "blog", secrets.blog as string],
		];
		for (const [name, k, secret] of cases) expect(await check(k, secret), name).toEqual(NO);
	});

	it("answers for the one site key given: a secret that is valid elsewhere tells nothing", async () => {
		// The holder of the blog's secret learns nothing about any other key: known, unknown, with or without a secret.
		const seen = new Set<string>();
		for (const k of [NEWS_KEY, BARE_KEY, PAUSED_KEY, "uuuuuuuuuuuuuuuuuuuu", "vvvvvvvvvvvvvvvvvvvv"]) seen.add(JSON.stringify(await check(k, secrets.blog)));
		expect([...seen]).toEqual([JSON.stringify(NO)]);
	});

	it("writes nothing and counts nothing: one registry load serves every call", async () => {
		const log = vi.spyOn(console, "log");
		const error = vi.spyOn(console, "error");
		const before = JSON.stringify([...sites.items]);
		for (let i = 0; i < 20; i++) {
			await check(BLOG_KEY, secrets.blog);
			await check(BLOG_KEY, "A".repeat(43));
			await check("uuuuuuuuuuuuuuuuuuuu", secrets.blog);
		}
		// The handler is given the request, the query and the sites collection: no database, no state store, no settings.
		expect(calls).toEqual({ query: 1, get: 0, put: 0, delete: 0 });
		expect(JSON.stringify([...sites.items])).toBe(before);
		expect(drops.size).toBe(0);
		expect(log).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});

	it("a malformed site key does not even load the registry", async () => {
		await check("not a key", secrets.blog);
		await check(null, secrets.blog);
		expect(calls.query).toBe(0);
	});

	it("refuses every secret once the sites collection could not be read for 10 minutes, and checks again after a good load", async () => {
		const T = Date.parse("2026-03-13T00:00:30Z");
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(T);
			expect((await check(BLOG_KEY, secrets.blog)).status).toBe(200);
			const working = sites.query;
			sites.query = () => Promise.reject(new Error("sites unavailable"));
			vi.setSystemTime(T + PROXY_SNAPSHOT_MAX_AGE_MS);
			expect((await check(BLOG_KEY, secrets.blog)).status).toBe(200);
			vi.setSystemTime(T + PROXY_SNAPSHOT_MAX_AGE_MS + 1);
			expect(await check(BLOG_KEY, secrets.blog)).toEqual(NO);
			sites.query = working;
			vi.setSystemTime(T + PROXY_SNAPSHOT_MAX_AGE_MS + 60_001);
			expect((await check(BLOG_KEY, secrets.blog)).status).toBe(200);
		} finally {
			vi.useRealTimers();
		}
	});
});
