/** Bing: throttling as a state with backoff, the in-tick retry, OAuth end to end against a fake Bing server, and the CSV import. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { type SearchCtx, searchRoutes } from "../src/routes/search.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { BING_API } from "../src/sources/bing.js";
import { BING_AUTH_URL, BING_TOKEN_URL, clearBingTokenCache } from "../src/sources/bing-auth.js";
import { parseBingCsv, parseCount, parseDay, parseDecimal } from "../src/sources/bing-csv.js";
import { type PairState, RETRY_BASE_MS, RETRY_MAX_MS, runSearchTick, stateKey, type SyncCtx } from "../src/sources/sync.js";
import { schemaDb } from "./helpers.js";

const T0 = 1_773_360_000_000; // 2026-03-13T00:00:00Z
const KEY = "FixtureBingApiKeyPlaceholder0001";
const fx = (m: string) => JSON.parse(readFileSync(new URL(`./fixtures/bing/${m}.json`, import.meta.url), "utf8")) as unknown;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Bing's API and OAuth endpoints. `throttle(n)` answers the n-th API call (from 1) with `ThrottleIP`; OAuth mode demands the bearer token and no key. */
function fakeBing(o: { throttle?: (n: number) => boolean; oauth?: boolean } = {}) {
	const api: Array<{ method: string; params: Record<string, string>; auth: string | null }> = [];
	const token: Array<Record<string, string>> = [];
	let n = 0;
	const http = {
		async fetch(url: string, init?: RequestInit) {
			if (url === BING_TOKEN_URL) {
				const f = Object.fromEntries(new URLSearchParams(String(init?.body)));
				token.push(f);
				if (f.client_id !== "fixture-bing-client" || f.client_secret !== "fixture-bing-secret") return json(400, { error: "invalid_client" });
				if (f.grant_type === "authorization_code")
					return f.code === "fixture-code" && f.redirect_uri === "https://example.com/_emdash/admin/plugins/cookieless-analytics/search"
						? json(200, { access_token: "bing-access-1", token_type: "bearer", expires_in: 3599, refresh_token: "bing-refresh-1" })
						: json(400, { error: "invalid_grant" });
				return f.grant_type === "refresh_token" && f.refresh_token === "bing-refresh-1" ? json(200, { access_token: "bing-access-2", token_type: "bearer", expires_in: 3599 }) : json(400, { error: "invalid_grant" });
			}
			expect(url.startsWith(BING_API)).toBe(true);
			const u = new URL(url);
			const method = u.pathname.split("/").pop() as string;
			const auth = new Headers(init?.headers).get("authorization");
			api.push({ method, params: Object.fromEntries(u.searchParams), auth });
			if (o.oauth && (!auth?.startsWith("Bearer bing-access-") || u.searchParams.has("apikey"))) return json(400, { ErrorCode: 3, Message: "ERROR!!! InvalidApiKey" });
			if (o.throttle?.(++n)) return json(400, { ErrorCode: 3, Message: "ERROR!!! ThrottleIP" });
			return json(200, fx(method));
		},
	};
	return { http, api, token };
}

const base = { bingEnabled: true, bingApiKey: KEY, bingSiteUrl: "https://www.example.com/", siteOrigin: "https://example.com", siteTimezone: "UTC" };
const settingsOf = (over: Record<string, unknown> = {}): Settings => normalizeSettings({ ...base, ...over });

async function harness(o: Parameters<typeof fakeBing>[0] = {}, over: Record<string, unknown> = {}) {
	const env = await schemaDb();
	const b = fakeBing(o);
	const waits: number[] = [];
	const scheduled: string[] = [];
	const logs: string[] = [];
	let now = T0;
	const ctx: SyncCtx = {
		http: b.http,
		kv: env.kv,
		db: env.db,
		settings: settingsOf(over),
		clients: [],
		cron: { schedule: async (_n, s) => void scheduled.push(s.schedule) },
		now: () => now,
		sleep: async (ms) => void waits.push(ms),
		log: { warn: (m) => void logs.push(m) },
	};
	return { env, b, ctx, waits, scheduled, logs, setNow: (t: number) => void (now = t), rows: () => (env.raw.prepare("SELECT COUNT(*) AS n FROM ca_search_daily").get() as { n: number }).n };
}

describe("Bing throttling", () => {
	beforeEach(() => invalidateRegistry());

	it("is a state, not an error: last sync and rows stay, the code is logged, the next attempt backs off and a success returns to normal", async () => {
		let throttle = false;
		const h = await harness({ throttle: () => throttle });
		await runSearchTick(h.ctx);
		const good = await h.env.kv.get<PairState>(stateKey("default", "bing"));
		const rows = h.rows();
		expect(rows).toBeGreaterThan(0);

		// Seven hours later every call is throttled: one retry inside the tick after a jittered wait, then the throttled state.
		throttle = true;
		const t1 = T0 + 7 * 3_600_000;
		h.setNow(t1);
		const r = await runSearchTick(h.ctx);
		expect(r.done).toBe(true);
		expect(h.waits).toHaveLength(1);
		expect(h.waits[0]).toBeGreaterThanOrEqual(2_000);
		expect(h.waits[0]).toBeLessThan(5_000);
		const st = await h.env.kv.get<PairState>(stateKey("default", "bing"));
		expect(st).toMatchObject({ status: "throttled", throttleCode: "ThrottleIP", throttleCount: 1, lastRun: good?.lastRun, lastError: null, nextAttempt: new Date(t1 + RETRY_BASE_MS).toISOString() });
		expect(h.rows()).toBe(rows);
		expect(h.logs[0]).toMatch(/bing throttled \(ThrottleIP\) for site default/);
		expect(h.logs.join()).not.toContain(KEY);
		// The next attempt is scheduled, sooner than the 6 hour sync interval.
		expect(h.scheduled.at(-1)).toBe(new Date(t1 + RETRY_BASE_MS).toISOString());

		// Before the next attempt nothing is called; at it, a second throttle doubles the wait.
		const calls = h.b.api.length;
		h.setNow(t1 + 60_000);
		await runSearchTick(h.ctx);
		expect(h.b.api).toHaveLength(calls);
		h.setNow(t1 + RETRY_BASE_MS);
		await runSearchTick(h.ctx);
		expect(await h.env.kv.get<PairState>(stateKey("default", "bing"))).toMatchObject({ throttleCount: 2, nextAttempt: new Date(t1 + 3 * RETRY_BASE_MS).toISOString() });

		// Capped: never beyond two hours (and never beyond the sync interval).
		await h.env.kv.set(stateKey("default", "bing"), { ...(await h.env.kv.get<PairState>(stateKey("default", "bing"))), throttleCount: 30, nextAttempt: new Date(t1).toISOString() });
		await runSearchTick(h.ctx);
		const capped = await h.env.kv.get<PairState>(stateKey("default", "bing"));
		expect(Date.parse(capped?.nextAttempt ?? "") - (t1 + RETRY_BASE_MS)).toBe(RETRY_MAX_MS);

		// A success clears the throttle and returns to the normal cadence.
		throttle = false;
		h.setNow(Date.parse(capped?.nextAttempt ?? ""));
		await runSearchTick(h.ctx);
		expect(await h.env.kv.get<PairState>(stateKey("default", "bing"))).toMatchObject({ status: "ok", throttleCount: 0, nextAttempt: null, throttleCode: null });
	});

	it("one pass between throttles is enough: the in-tick retry stores the whole window", async () => {
		const h = await harness({ throttle: (n) => n === 2 });
		await runSearchTick(h.ctx);
		expect(h.b.api.map((c) => c.method)).toEqual(["GetRankAndTrafficStats", "GetQueryStats", "GetQueryStats", "GetPageStats"]);
		expect(await h.env.kv.get<PairState>(stateKey("default", "bing"))).toMatchObject({ status: "ok" });
		expect(h.rows()).toBeGreaterThan(0);
	});

	it("search/status shows Throttled with the plain sentence and the next attempt", async () => {
		const h = await harness({ throttle: () => true });
		await runSearchTick(h.ctx);
		const routes = searchRoutes({ db: async () => h.env.db, settings: async () => h.ctx.settings, now: () => T0 });
		const out = (await routes["search/status"].handler({ input: {}, kv: h.env.kv } as SearchCtx)) as { sources: Array<Record<string, unknown>> };
		expect(out.sources.find((s) => s.id === "bing")).toMatchObject({
			status: "throttled",
			message: "Bing limits shared server addresses. The sync retries on the next scheduled run.",
			throttleCode: "ThrottleIP",
			nextAttempt: new Date(T0 + RETRY_BASE_MS).toISOString(),
			lastError: null,
		});
	});
});

describe("Bing OAuth", () => {
	beforeEach(() => {
		clearBingTokenCache();
		invalidateRegistry();
	});

	it("connects through start and exchange, then syncs with a bearer token and no key", async () => {
		const env = await schemaDb();
		const b = fakeBing({ oauth: true });
		const stored: Record<string, unknown> = { bingAuth: "oauth", bingApiKey: "", bingClientId: "fixture-bing-client", bingClientSecret: "fixture-bing-secret" };
		const routes = searchRoutes({ db: async () => env.db, settings: async () => settingsOf(stored), now: () => T0 });
		const call = async (name: keyof typeof routes, input: unknown) =>
			(await routes[name].handler({ input, request: new Request("https://example.com/_emdash/api/plugins/cookieless-analytics/x", { method: "POST" }), kv: env.kv, http: b.http, settings: { set: async (k, v) => void (stored[k] = v) } } as SearchCtx)) as Record<string, any>;
		expect(settingsOf(stored).bingAuth).toBe("oauth");

		const { url } = await call("search/oauth/start", { source: "bing" });
		const u = new URL(url);
		expect(`${u.origin}${u.pathname}`).toBe(BING_AUTH_URL);
		expect(Object.fromEntries(u.searchParams)).toMatchObject({ response_type: "code", client_id: "fixture-bing-client", scope: "webmaster.read", redirect_uri: "https://example.com/_emdash/admin/plugins/cookieless-analytics/search" });
		// The return page posts code and state only; the state names the provider.
		await expect(call("search/oauth/exchange", { code: "fixture-code", state: "wrong" })).rejects.toMatchObject({ code: "oauth_state" });
		const r = await call("search/oauth/exchange", { code: "fixture-code", state: u.searchParams.get("state") });
		expect(r).toEqual({ connected: true, source: "bing" });
		expect(stored.bingRefreshToken).toBe("bing-refresh-1");
		expect(JSON.stringify(r)).not.toContain("bing-refresh-1");
		expect(b.token[0]).toMatchObject({ grant_type: "authorization_code", code: "fixture-code" });

		// The sync: a fresh isolate refreshes, then every API call carries the bearer token.
		clearBingTokenCache();
		const ctx: SyncCtx = { http: b.http, kv: env.kv, db: env.db, settings: settingsOf(stored), clients: [], now: () => T0 };
		const tick = await runSearchTick(ctx);
		expect(tick.done).toBe(true);
		expect(b.token.at(-1)).toMatchObject({ grant_type: "refresh_token", refresh_token: "bing-refresh-1" });
		expect(b.api.length).toBe(3);
		expect(b.api.every((c) => c.auth === "Bearer bing-access-2" && !("apikey" in c.params))).toBe(true);
		expect(await env.kv.get<PairState>(stateKey("default", "bing"))).toMatchObject({ status: "ok" });
		expect((env.raw.prepare("SELECT COUNT(*) AS n FROM ca_search_daily WHERE source = 'bing'").get() as { n: number }).n).toBeGreaterThan(0);
	});

	it("is configured only with the client and the refresh token", async () => {
		const { bingConfigured } = await import("../src/sources/bing-auth.js");
		expect(bingConfigured(settingsOf({ bingAuth: "oauth", bingClientId: "c", bingClientSecret: "s" }))).toBe(false);
		expect(bingConfigured(settingsOf({ bingAuth: "oauth", bingClientId: "c", bingClientSecret: "s", bingRefreshToken: "r" }))).toBe(true);
		expect(bingConfigured(settingsOf())).toBe(true);
	});
});

describe("Bing CSV import", () => {
	it("reads numbers, decimals and dates the way the exports write them", () => {
		expect([parseCount("1,234"), parseCount("1.234"), parseCount("1 234"), parseCount("12"), parseCount(""), parseCount("x")]).toEqual([1234, 1234, 1234, 12, 0, null]);
		expect([parseDecimal("4.5"), parseDecimal("4,5"), parseDecimal("1,234.5"), parseDecimal("1.234,5"), parseDecimal("12%")]).toEqual([4.5, 4.5, 1234.5, 1234.5, 12]);
		expect([parseDay("2026-03-06"), parseDay("2026-03-06T00:00:00"), parseDay("3/6/2026"), parseDay("13/6/2026"), parseDay("06.03.2026"), parseDay("/Date(1772755200000)/"), parseDay("2026-02-30"), parseDay("soon")]).toEqual([
			"2026-03-06",
			"2026-03-06",
			"2026-03-06",
			"2026-06-13",
			"2026-03-06",
			"2026-03-06",
			null,
			null,
		]);
	});

	it("parses a comma file with a byte order mark and quotes, and a semicolon file with decimal commas", () => {
		const a = parseBingCsv('﻿Keyword,Impressions,Clicks,CTR,Avg. Position,Date\r\n"blue widgets, cheap",1,200,12,1.00%,4.5,3/6/2026\r\nred widgets,40,2,5.00%,7,3/7/2026\r\n,1,1,,1,3/7/2026\r\n'.replace("1,200", '"1,200"'));
		expect(a).toMatchObject({ kind: "query", hasDate: true, skipped: 1 });
		expect(a.rows).toEqual([
			{ key: "blue widgets, cheap", day: "2026-03-06", impressions: 1200, clicks: 12, position: 4.5 },
			{ key: "red widgets", day: "2026-03-07", impressions: 40, clicks: 2, position: 7 },
		]);
		const b = parseBingCsv("Page;Clicks;Impressions;Average Position\nhttps://www.example.com/widgets/;3;1.234;2,5\nhttps://other.example.net/x;1;5;9\n");
		expect(b).toMatchObject({ kind: "page", hasDate: false, skipped: 0 });
		expect(b.rows[0]).toEqual({ key: "https://www.example.com/widgets/", day: null, clicks: 3, impressions: 1234, position: 2.5 });
		// D/M/YYYY is decided for the whole file: 03/04 is 3 April because another row has 13 as first part; a short footer line is skipped.
		const c = parseBingCsv("Keyword,Clicks,Impressions,Date\na,1,10,13/04/2026\nb,1,10,03/04/2026\nTotal,2\n");
		expect(c.rows.map((r) => r.day)).toEqual(["2026-04-13", "2026-04-03"]);
		expect(c.skipped).toBe(1);
		expect(() => parseBingCsv("Name,Value\nx,1\n")).toThrow(/no Clicks and Impressions/);
		expect(() => parseBingCsv("Keyword,Page,Clicks,Impressions\n")).toThrow(/both a query and a page column/);
	});

	it("search/import stores the site's rows like a pull, replaces only that table per day, and validates", async () => {
		const env = await schemaDb();
		invalidateRegistry();
		const routes = searchRoutes({ db: async () => env.db, settings: async () => settingsOf(), now: () => T0 });
		const imp = async (input: unknown) => (await routes["search/import"].handler({ input, kv: env.kv, request: new Request("https://example.com/x", { method: "POST" }) } as SearchCtx)) as Record<string, unknown>;
		const rows = (where: string) => env.raw.prepare(`SELECT day, page_key, query, country, device, clicks, impressions, pos_sum, provisional FROM ca_search_daily WHERE source = 'bing' AND ${where} ORDER BY day, page_key, query`).all();

		expect(await imp({ csv: "Keyword,Clicks,Impressions,Avg. Position,Date\nblue widgets,4,40,3,2026-03-06\nblue widgets,1,10,2,2026-03-11\nold,1,1,1,2020-01-01\n" })).toMatchObject({ site: "default", kind: "query", days: 2, rows: 2, skipped: 1, from: "2026-03-06", to: "2026-03-11" });
		expect(rows("query <> ''")).toEqual([
			{ day: "2026-03-06", page_key: "", query: "blue widgets", country: "", device: "", clicks: 4, impressions: 40, pos_sum: 120, provisional: 0 },
			{ day: "2026-03-11", page_key: "", query: "blue widgets", country: "", device: "", clicks: 1, impressions: 10, pos_sum: 20, provisional: 1 },
		]);
		// The page file of the same day keeps the query rows; another host is dropped; no date column needs the day.
		await expect(imp({ csv: "Page;Clicks;Impressions;Average Position\nhttps://www.example.com/widgets/;3;30;4\n" })).rejects.toMatchObject({ code: "invalid_file" });
		expect(await imp({ csv: "Page;Clicks;Impressions;Average Position\nhttps://www.example.com/widgets/;3;30;4\nhttps://other.example.net/x;1;5;9\n", day: "2026-03-06" })).toMatchObject({ kind: "page", rows: 1, skipped: 1 });
		expect(rows("day = '2026-03-06'")).toHaveLength(2);
		// Importing the query table again replaces only the query rows of its days.
		await imp({ csv: "Keyword,Clicks,Impressions,Date\nred widgets,2,20,2026-03-06\n" });
		expect(rows("day = '2026-03-06'").map((r) => (r as { page_key: string; query: string }).page_key || (r as { query: string }).query)).toEqual(["red widgets", "/widgets"]);
		await expect(imp({ csv: "x".repeat(500_001) })).rejects.toThrow();
		await expect(imp({ csv: "Keyword,Clicks,Impressions,Date\nx,1,1,2026-03-06\n", source: "google" })).rejects.toThrow();
	});
});
