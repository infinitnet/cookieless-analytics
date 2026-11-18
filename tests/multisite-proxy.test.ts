/** Remote satellites: two in-process instances with separate in-memory databases; the master proxies through a host-like fetch. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRemote, REMOTE_MAX_BYTES, remoteSummaryRows, SITES_SUMMARY_MAX_REMOTE } from "../src/multisite/proxy.js";
import type { RemoteSite } from "../src/multisite/config.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { type DataCtx, DataQueryBody, dataExportRoute, dataQueryRoute } from "../src/routes/data.js";
import { siteRoutes, type SitesCtx } from "../src/routes/sites.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { agentHarness, memColl } from "./agent.helpers.js";
import { RANGE, seed } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";

const KEY_ENV = "CA_SITE_BLOG_KEY";
const BLOG: RemoteSite = { id: "blog", label: "Blog", origin: "https://blog.example.net", keyEnv: KEY_ENV };

describe("remote satellite proxy", () => {
	let satEnv: Awaited<ReturnType<typeof schemaDb>>;
	let masterEnv: Awaited<ReturnType<typeof schemaDb>>;
	let sat: Awaited<ReturnType<typeof agentHarness>>;
	let token: string;
	let masterSettings: Settings;
	let vars: Record<string, string | undefined>;
	let now: number;

	/** The host's `ctx.http`: only `allowedHosts` are reached; the request is dispatched to the satellite's agent routes. */
	const hostFetch = vi.fn(async (url: string, init: RequestInit = {}): Promise<Response> => {
		const u = new URL(url);
		if (u.hostname !== "blog.example.net") throw new Error("host not allowed");
		const headers = new Headers(init.headers);
		expect(headers.get("x-emdash-request")).toBe("1");
		const name = u.pathname.replace("/_emdash/api/plugins/cookieless-analytics/", "");
		const method = (init.method ?? "GET") as "GET" | "POST";
		const input = method === "GET" ? Object.fromEntries(u.searchParams) : JSON.parse(String(init.body));
		const r = await sat.call(name, { method, token: headers.get("x-api-key"), input });
		return new Response(r.text, { status: r.status, headers: r.headers });
	});

	const remote = (sites: RemoteSite[] = [BLOG], timeoutMs?: number) => createRemote(sites, { env: () => vars, nowMs: () => now, ...(timeoutMs ? { timeoutMs } : {}) });
	const master = (r = remote()) => dataQueryRoute({ db: async () => masterEnv.db, settings: async () => masterSettings, remote: r });
	const ask = (body: unknown, r = remote(), http: DataCtx["http"] = { fetch: hostFetch }) =>
		master(r).handler({ input: DataQueryBody.parse(body), storage: {}, http } as DataCtx) as Promise<Record<string, any>>;

	beforeAll(async () => {
		satEnv = await schemaDb();
		const satSettings = await seed(satEnv, "UTC");
		sat = await agentHarness(satEnv, satSettings, { limiter: () => 0 });
		token = await sat.key(["read:analytics", "read:search"]);
		masterEnv = await schemaDb();
		masterSettings = normalizeSettings({ siteId: "default", siteTimezone: "UTC" });
	});
	beforeEach(() => {
		invalidateRegistry();
		clearReportCache();
		hostFetch.mockClear();
		vars = { [KEY_ENV]: token };
		now = 1_000_000;
	});

	it("returns the satellite's overview and a filtered report identical to its agent route", async () => {
		for (const body of [
			{ report: "overview", query: { ...RANGE, compare: "previous" } },
			{ report: "channels", query: { ...RANGE, filters: [{ dim: "country", op: "is", values: ["DE", "US"] }] } },
		]) {
			const direct = await sat.call("agent/v1/query", { token, input: body });
			expect(direct.status).toBe(200);
			const viaMaster = await ask({ ...body, query: { ...body.query, site: "blog" } });
			expect(viaMaster).toEqual(direct.json.data);
		}
		// The master's own database is empty: the numbers came from the satellite.
		const local = await ask({ report: "overview", query: { ...RANGE } });
		expect(local.data.totals.sessions).toBe(0);
		expect((await ask({ report: "overview", query: { ...RANGE, site: "blog" } })).data.totals.sessions).toBeGreaterThan(0);
	});

	it("forwards a tile query with the identical body (site left out), the key and the request header, and caches 60 s per body", async () => {
		const tile = { report: "pages", query: { ...RANGE, site: "blog", filters: [{ dim: "device", op: "is", values: ["desktop"] }] }, limit: 10 };
		const r = remote();
		await ask(tile, r);
		expect(hostFetch).toHaveBeenCalledOnce();
		const [url, init] = hostFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://blog.example.net/_emdash/api/plugins/cookieless-analytics/agent/v1/query");
		const { site: _s, ...query } = DataQueryBody.parse(tile).query;
		expect(JSON.parse(String(init.body))).toEqual({ ...DataQueryBody.parse(tile), query });
		expect(new Headers(init.headers).get("x-api-key")).toBe(token);
		expect(init.redirect).toBe("error");
		await ask(tile, r);
		expect(hostFetch).toHaveBeenCalledOnce();
		now += 60_001;
		await ask(tile, r);
		expect(hostFetch).toHaveBeenCalledTimes(2);
	});

	it("a missing env var is remote_error key_missing before any fetch", async () => {
		vars = {};
		const err = await ask({ report: "overview", query: { ...RANGE, site: "blog" } }).catch((e) => e);
		expect(err).toMatchObject({ code: "remote_error", status: 502, details: { reason: "key_missing" } });
		expect(hostFetch).not.toHaveBeenCalled();
	});

	it("an id or origin that is not in the options is refused before any fetch", async () => {
		const r = remote();
		expect(await r.query({ fetch: hostFetch }, "shop", { query: {} })).toMatchObject({ ok: false, error: "remote_error", reason: "not_configured" });
		await expect(ask({ report: "overview", query: { ...RANGE, site: "shop" } })).rejects.toMatchObject({ code: "unknown_site" });
		expect(hostFetch).not.toHaveBeenCalled();
	});

	it("this database wins when a remote id is also a client site", async () => {
		const sites = memColl({ blog: { id: "blog", label: "Blog", key: "a".repeat(20), hosts: ["blog.example.net"], created: 1 } });
		const out = (await master().handler({ input: DataQueryBody.parse({ report: "overview", query: { ...RANGE, site: "blog" } }), storage: { sites }, http: { fetch: hostFetch } } as DataCtx)) as Record<string, any>;
		expect(out.data.totals.sessions).toBe(0);
		expect(hostFetch).not.toHaveBeenCalled();
	});

	it("never follows a redirect itself, caps the body and never echoes the remote body or the key", async () => {
		const cases: Array<[Response, Record<string, unknown>]> = [
			[new Response("", { status: 302, headers: { location: "https://elsewhere.example.org/" } }), { status: 302, reason: "http" }],
			[new Response(`secret remote detail ${"x".repeat(10)}`, { status: 500 }), { status: 500, reason: "http" }],
			[new Response(JSON.stringify({ ok: true, data: { pad: "x".repeat(REMOTE_MAX_BYTES) } }), { status: 200 }), { status: 200, reason: "too_large" }],
			[new Response("not json", { status: 200 }), { status: 200, reason: "invalid" }],
		];
		for (const [res, details] of cases) {
			const fetch = vi.fn(async () => res);
			const err = await ask({ report: "overview", query: { ...RANGE, site: "blog" } }, remote(), { fetch }).catch((e) => e);
			expect(fetch).toHaveBeenCalledOnce();
			expect(err).toMatchObject({ code: "remote_error", details });
			const text = JSON.stringify({ message: err.message, details: err.details });
			expect(text).not.toContain("secret remote detail");
			expect(text).not.toContain(token);
		}
	});

	it("times out after the deadline", async () => {
		const fetch = vi.fn(() => new Promise<Response>(() => {}));
		const err = await ask({ report: "overview", query: { ...RANGE, site: "blog" } }, remote([BLOG], 20), { fetch }).catch((e) => e);
		expect(err).toMatchObject({ code: "remote_error", details: { status: 504, reason: "timeout" } });
	});

	it("data/export of a remote site exports the proxied rows", async () => {
		const res = (await dataExportRoute({ db: async () => masterEnv.db, settings: async () => masterSettings, remote: remote() }).handler({
			input: { report: "pages", query: { ...RANGE, site: "blog" }, format: "csv" },
			storage: {},
			http: { fetch: hostFetch },
		} as unknown as DataCtx)) as unknown as { body: { value: string } };
		expect(hostFetch).toHaveBeenCalledOnce();
		expect(JSON.parse(String((hostFetch.mock.calls[0] as [string, RequestInit])[1].body)).limit).toBe(1000);
		expect(res.body.value.split("\n").length).toBeGreaterThan(2);
	});

	describe("All-sites summary", () => {
		const summary = (r: ReturnType<typeof remote>, http: SitesCtx["http"], input: unknown = { ...RANGE, compare: "previous" }) =>
			siteRoutes({
				settings: async () => masterSettings,
				db: async () => masterEnv.db,
				remoteIds: r.ids,
				remoteRows: (body, ctx, skip) => remoteSummaryRows(r, ctx.http, body, skip),
			})["sites/summary"].handler({ input, kv: masterEnv.kv, storage: { sites: memColl() }, http } as SitesCtx) as Promise<Record<string, any>>;

		it("lists the satellite row next to the local row with its summary figures and revenue list", async () => {
			const out = await summary(remote(), { fetch: hostFetch });
			const direct = await sat.call("agent/v1/summary", { token, input: { ...RANGE, compare: "previous" } });
			const t = direct.json.data.data.totals;
			const row = out.rows.find((r: { id: string }) => r.id === "blog");
			expect(row).toMatchObject({ kind: "remote", label: "Blog", sessions: t.sessions, pageviews: t.pageviews, visitors: t.visitors, bounce_rate: t.bounce_rate, engaged_rate: t.engaged_rate, revenue: [] });
			expect(row.delta).toBeTruthy();
			expect(row.error).toBeUndefined();
			expect(out.rows.map((r: { kind: string }) => r.kind).sort()).toEqual(["local", "remote"]);
			// Visitors are never summed across sites.
			expect(out.totals.visitors).toBeNull();
			expect(out.totals.pageviews).toBe(t.pageviews);
			// The satellite's summary takes the compare option and lists revenue per currency.
			expect(Array.isArray(direct.json.data.data.revenue)).toBe(true);
			const none = await sat.call("agent/v1/summary", { token, input: { ...RANGE, compare: "none" } });
			expect(none.json.data.data.compareTotals).toBeUndefined();
			expect((await sat.call("agent/v1/summary", { token, input: { ...RANGE, compare: "segment" } })).status).toBe(400);
			const [url] = hostFetch.mock.calls[0] as [string];
			expect(url).toBe(`https://blog.example.net/_emdash/api/plugins/cookieless-analytics/agent/v1/summary?from=${RANGE.from}&to=${RANGE.to}&compare=previous`);
		});

		it("a failing satellite is an error row, never a failed page, and at most 10 satellites are fetched, 3 at a time", async () => {
			const many: RemoteSite[] = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, label: `S${i}`, origin: `https://s${i}.example.net`, keyEnv: `KEY_S${i}` }));
			vars = Object.fromEntries(many.map((s) => [s.keyEnv, "k"]));
			let active = 0;
			let peak = 0;
			const fetch = vi.fn(async (url: string) => {
				active++;
				peak = Math.max(peak, active);
				await new Promise((r) => setTimeout(r, 5));
				active--;
				if (url.startsWith("https://s1.")) return new Response("down", { status: 503 });
				return new Response(JSON.stringify({ ok: true, data: { data: { totals: { sessions: 1, pageviews: 2, visitors: 1, bounce_rate: 0, engaged_rate: 1 }, compareTotals: { sessions: 1, pageviews: 4 }, delta: { pageviews: -0.5 }, revenue: [{ currency: "EUR", revenue: 5, orders: 1 }] } } }), { status: 200 });
			});
			const out = await summary(remote(many), { fetch }, { ...RANGE, compare: "previous" });
			expect(fetch).toHaveBeenCalledTimes(SITES_SUMMARY_MAX_REMOTE);
			expect(peak).toBeLessThanOrEqual(3);
			const failed = out.rows.find((r: { id: string }) => r.id === "s1");
			expect(failed).toMatchObject({ kind: "remote", error: "http_503", sessions: null, pageviews: null });
			expect(out.rows.find((r: { id: string }) => r.id === "s0")).toMatchObject({ pageviews: 2, revenue: [{ currency: "EUR", revenue: 5, orders: 1 }] });
			expect(out.totals.revenue).toEqual([{ currency: "EUR", revenue: 45, orders: 9 }]);
			// Totals compare the same sites in both periods: the satellites' previous figures are in the previous total.
			expect(out.totals.previous.pageviews).toBe(36);
			expect(out.totals.delta.pageviews).toBe(-0.5);
		});

		it("derives a satellite's bounce rate from its engaged rate, for both periods, and keeps its delta as sent", async () => {
			const fetch = vi.fn(
				async () =>
					new Response(
						JSON.stringify({ ok: true, data: { data: { totals: { sessions: 10, pageviews: 20, visitors: 8, bounce_rate: 0.6, engaged_rate: 0.5 }, compareTotals: { sessions: 10, pageviews: 20, visitors: 8, bounce_rate: 0.9, engaged_rate: 0.3 }, delta: { bounce_rate: -0.3333 } } } }),
						{ status: 200 },
					),
			);
			const out = await summary(remote(), { fetch });
			const row = out.rows.find((r: { id: string }) => r.id === "blog");
			expect(row).toMatchObject({ bounce_rate: 0.5, engaged_rate: 0.5, previous: { bounce_rate: 0.7, engaged_rate: 0.3 }, delta: { bounce_rate: -0.3333 } });
		});
	});
});
