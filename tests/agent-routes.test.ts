import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ENDPOINTS } from "../src/agent/schemas.js";
import { createPlugin } from "../src/index.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { SATISFACTION_CAVEAT } from "../src/query/reports/satisfaction.js";
import type { Settings } from "../src/settings.js";
import { dashInput, kpi, storedDash } from "./fixtures/dashboards.js";
import { agentHarness, T0 } from "./agent.helpers.js";
import { RANGE, seed } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";
import { invalidateRegistry } from "../src/multisite/registry.js";

type HostRoute = { public?: boolean; methods?: string[]; cacheControl?: string; response?: string; permission?: string };

/**
 * The lookup of the host catch-all (`emdash-runtime.ts` getPluginRouteMeta: the path minus its
 * leading slash indexes `routes`) and its cache rule (`plugins/http-route-dispatch.ts`: only public
 * GETs that declare `cacheControl` keep it, everything else gets `private, no-store`).
 */
const lookup = (routes: Record<string, HostRoute>, path: string) => routes[path.replace(/^\//, "")] ?? null;
const hostCacheControl = (meta: HostRoute, method: string) => (meta.public && meta.cacheControl && (method === "GET" || method === "HEAD") ? meta.cacheControl : "private, no-store");

describe("agent route registration", () => {
	const plugin = createPlugin() as unknown as { routes: Record<string, HostRoute> };

	it("resolves every multi-segment agent route through the host lookup", () => {
		for (const e of ENDPOINTS) {
			const meta = lookup(plugin.routes, `/${e.name}`);
			expect(meta, e.name).not.toBeNull();
			expect(meta?.public).toBe(true);
			expect(meta?.response).toBe("raw");
			expect(meta?.methods).toContain(e.method);
		}
		expect(lookup(plugin.routes, "/agent/v1/nope")).toBeNull();
	});

	it("declares no cacheControl, so the host answers private, no-store", () => {
		for (const e of ENDPOINTS) {
			const meta = lookup(plugin.routes, `/${e.name}`) as HostRoute;
			expect(meta.cacheControl).toBeUndefined();
			expect(hostCacheControl(meta, e.method)).toBe("private, no-store");
		}
	});

	it("declares no permission and no input schema (auth and validation run in the handler)", () => {
		for (const e of ENDPOINTS) {
			const meta = lookup(plugin.routes, `/${e.name}`) as HostRoute & { input?: unknown };
			expect(meta.permission).toBeUndefined();
			expect(meta.input).toBeUndefined();
		}
	});
});

describe("agent auth", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
	});
	beforeEach(() => clearReportCache());

	it("answers identical 404s for missing, malformed, unknown, wrong, revoked, expired tokens and a missing scope", async () => {
		const h = await agentHarness(env, settings);
		const good = await h.key(["read:analytics"]);
		const expiring = await h.key(["read:analytics"], T0 + 10);
		const revoked = await h.key(["read:analytics"]);
		const revokedId = [...h.storage.api_keys.items].find(([, d]) => (d as { prefix: string }).prefix === revoked.slice(0, 8))?.[0] as string;
		await h.storage.api_keys.put(revokedId, { ...(h.storage.api_keys.items.get(revokedId) as object), revoked: true });
		const annotationsOnly = await h.key(["write:annotations"]);
		h.setNow(T0 + 10);
		const tokens = [null, "garbage", `${good.slice(0, 8)}.${"x".repeat(43)}`, `zzzzzzzz${good.slice(8)}`, `${good}x`, revoked, expiring, annotationsOnly];
		const outs = [];
		for (const token of tokens) outs.push(await h.call("agent/v1/status", { token }));
		for (const o of outs) expect({ status: o.status, text: o.text, headers: o.headers }).toEqual({ status: 404, text: "{}", headers: outs[0]?.headers });
		expect((await h.call("agent/v1/status", { token: good })).status).toBe(200);
	});

	it("ignores Authorization: Bearer and the query string", async () => {
		const h = await agentHarness(env, settings);
		const token = await h.key(["read:analytics"]);
		expect((await h.call("agent/v1/status", { headers: { authorization: `Bearer ${token}` } })).status).toBe(404);
		expect((await h.call("agent/v1/summary", { input: { key: token, api_key: token } })).status).toBe(404);
	});

	it("rate limits per key with Retry-After", async () => {
		const h = await agentHarness(env, { ...settings, agentRateLimitPerMinute: 5 });
		const a = await h.key(["read:analytics"]);
		const b = await h.key(["read:analytics"]);
		for (let i = 0; i < 5; i++) expect((await h.call("agent/v1/reports", { token: a })).status).toBe(200);
		const limited = await h.call("agent/v1/reports", { token: a });
		expect(limited.status).toBe(429);
		expect(limited.json).toMatchObject({ ok: false, error: "rate_limited" });
		expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
		expect((await h.call("agent/v1/reports", { token: b })).status).toBe(200);
		h.setNow(T0 + 61);
		expect((await h.call("agent/v1/reports", { token: a })).status).toBe(200);
	});

	it("does not write last_used on a second call within 10 minutes", async () => {
		const h = await agentHarness(env, settings);
		const token = await h.key(["read:analytics"]);
		const created = h.storage.api_keys.puts;
		await h.call("agent/v1/reports", { token });
		expect(h.storage.api_keys.puts).toBe(created + 1);
		h.setNow(T0 + 599);
		await h.call("agent/v1/reports", { token });
		expect(h.storage.api_keys.puts).toBe(created + 1);
		h.setNow(T0 + 600);
		await h.call("agent/v1/reports", { token });
		expect(h.storage.api_keys.puts).toBe(created + 2);
	});
});

describe("agent endpoints", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
		await env.kv.set("search:state:blog:bing", { lastRun: "2026-03-12T08:00:00Z", lastError: null });
		await env.kv.set("search:state:default:google", { lastRun: "2026-03-12T07:07:00Z", lastError: null, token: "never-shown", cursor: { day: "x" } });
		env.raw.prepare("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260312, 'bad_body', 3)").run();
	});
	beforeEach(() => clearReportCache());

	it("wraps answers in the envelope", async () => {
		const h = await agentHarness(env, settings);
		const r = await h.call("agent/v1/summary", { token: await h.key(["read:analytics"]), input: { ...RANGE } });
		expect(r.status).toBe(200);
		expect(r.headers["content-type"]).toContain("application/json");
		expect(r.json).toMatchObject({ ok: true, meta: { site: "default", from: RANGE.from, to: RANGE.to, generatedAt: new Date(T0 * 1000).toISOString(), truncated: false } });
		expect(r.json.data.data.totals.sessions).toBe(37);
		expect(r.json.data.compare).toBe("previous");
	});

	it("summary defaults to the last 7 days with today", async () => {
		const h = await agentHarness(env, settings);
		const r = await h.call("agent/v1/summary", { token: await h.key(["read:analytics"]) });
		expect(r.json.meta).toMatchObject({ from: "2026-03-07", to: "2026-03-13" });
		const bad = await h.call("agent/v1/summary", { token: await h.key(["read:analytics"]), input: { from: "2024-01-01", to: "2026-03-01" } });
		expect(bad.status).toBe(400);
		expect(bad.json).toMatchObject({ ok: false, error: "range_too_long" });
		const t = await h.key(["read:analytics"]);
		for (const route of ["agent/v1/summary", "agent/v1/annotations"])
			for (const input of [{ from: "0000-00-00" }, { to: "9999-99-99" }, { from: "2000-13-01" }, { from: "2026-02-30" }])
				expect((await h.call(route, { token: t, input })).json, `${route} ${JSON.stringify(input)}`).toMatchObject({ ok: false, error: "invalid_input" });
	});

	it("status reports versions, freshness, drops and search state", async () => {
		const h = await agentHarness(env, settings);
		const r = await h.call("agent/v1/status", { token: await h.key(["read:analytics"]) });
		expect(r.json.data).toMatchObject({
			version: "9.9.9",
			contract: 1,
			timezone: "UTC",
			lastHumanDay: (await env.db.all("SELECT MAX(day) AS d FROM ca_sessions"))[0]?.d,
			drops: { days: 30, byReason: { bad_body: 3 } },
			search: { google: { lastRun: "2026-03-12T07:07:00Z", lastError: null } },
		});
		expect(r.json.data.schema).toBeGreaterThan(0);
		expect(r.json.data.search).toEqual({ google: { lastRun: "2026-03-12T07:07:00Z", lastError: null } });
	});

	it("catalog lists every report with its scopes", async () => {
		const h = await agentHarness(env, settings);
		const r = await h.call("agent/v1/reports", { token: await h.key(["read:analytics"]) });
		const byName = Object.fromEntries((r.json.data.reports as Array<{ name: string; scopes: string[] }>).map((x) => [x.name, x.scopes]));
		expect(byName.overview).toEqual(["read:analytics"]);
		expect(byName.search_queries).toEqual(["read:search"]);
		expect(r.json.data.ops).toContain("regex");
		expect(r.json.data.metrics.position).toMatchObject({ definition: expect.stringMatching(/impressions/), estimate: false });
		const metrics = r.json.data.metrics as Record<string, { estimate: boolean; caveat?: string }>;
		expect(Object.keys(metrics).filter((k) => metrics[k]?.estimate).sort()).toEqual(["back_nav_rate", "pogo_stick_rate", "potential_clicks", "returned_from_search_rate", "search_reentry_rate"]);
		expect(metrics.pogo_stick_rate?.caveat).toBe(SATISFACTION_CAVEAT);
		for (const k of ["pct_long", "pct_short", "pct_bad", "sessions"]) expect(metrics[k]?.estimate, k).toBe(false);
		const reports = r.json.data.reports as { name: string; scopes: string[] }[];
		for (const name of ["satisfaction", "satisfaction_series"]) expect(reports.find((x) => x.name === name)?.scopes, name).toEqual(["read:analytics"]);
		expect(r.json.data.limits.maxRangeDays).toBe(400);
	});

	it("posts and lists annotations", async () => {
		const h = await agentHarness(env, settings);
		const w = await h.key(["write:annotations"]);
		const posted = await h.call("agent/v1/annotations", { method: "POST", token: w, input: { text: "Release 2.1", path: "/blog" } });
		expect(posted.status).toBe(200);
		const blog = { v: 1, path: [{ op: "is", value: "/blog" }] };
		expect(posted.json.data).toMatchObject({ site: "default", ts: T0, kind: "release", text: "Release 2.1", scope: blog, summary: "Page /blog" });
		expect(posted.json.data.path).toBeUndefined();
		const shop = { v: 1, host: [{ op: "is", value: "shop.example.com" }] };
		expect((await h.call("agent/v1/annotations", { method: "POST", token: w, input: { text: "Shop", ts: T0 + 60, scope: shop } })).json.data).toMatchObject({ scope: shop, summary: "Host shop.example.com" });
		expect((await h.call("agent/v1/annotations", { method: "POST", token: w, input: { text: "Wide", ts: T0 + 120 } })).json.data.scope).toBeUndefined();
		expect((await h.call("agent/v1/annotations", { method: "POST", token: w, input: { text: "x", path: "/a", scope: shop } })).json).toMatchObject({ ok: false, error: "scope_conflict" });
		expect((await h.call("agent/v1/annotations", { method: "POST", token: w, input: { text: "x", scope: { v: 1, path: [{ op: "is", value: "a" }] } } })).status).toBe(400);
		expect((await h.call("agent/v1/annotations", { method: "POST", token: w, input: { text: "" } })).json).toMatchObject({ ok: false, error: "invalid_input" });
		expect((await h.call("agent/v1/annotations", { method: "POST", token: w, input: { text: "x", kind: "publish" } })).status).toBe(400);
		const r = await h.key(["read:analytics"]);
		const list = await h.call("agent/v1/annotations", { token: r });
		expect(list.json.data.items).toEqual([
			{ id: expect.any(String), ts: T0 + 120, day: "2026-03-13", kind: "release", text: "Wide", scope: null, summary: "Site-wide", target: null },
			{ id: expect.any(String), ts: T0 + 60, day: "2026-03-13", kind: "release", text: "Shop", scope: shop, summary: "Host shop.example.com", target: null },
			{ id: expect.any(String), ts: T0, day: "2026-03-13", kind: "release", text: "Release 2.1", scope: blog, summary: "Page /blog", target: null },
		]);
		expect(list.json.meta).toMatchObject({ from: "2026-02-12", to: "2026-03-13" });
		const texts = async (input: Record<string, string>) => (await h.call("agent/v1/annotations", { token: r, input })).json.data.items.map((i: { text: string }) => i.text);
		expect(await texts({ path: "/blog" })).toEqual(["Wide", "Shop", "Release 2.1"]);
		expect(await texts({ path: "/other" })).toEqual(["Wide", "Shop"]);
		expect(await texts({ host: "www.example.com" })).toEqual(["Wide", "Release 2.1"]);
		expect(await texts({ path: "/other", host: "shop.example.com" })).toEqual(["Wide", "Shop"]);
		// q: a case-insensitive substring of the title or the scope, combined with the scope match, trimmed.
		expect(await texts({ q: "SHOP" })).toEqual(["Shop"]);
		expect(await texts({ q: "  /blog " })).toEqual(["Release 2.1"]);
		expect(await texts({ q: "release", path: "/other" })).toEqual(["Wide", "Shop"]);
		expect(await texts({ q: "2_1" })).toEqual([]);
		expect((await h.call("agent/v1/annotations", { token: r, input: { q: "x".repeat(101) } })).json).toMatchObject({ ok: false, error: "invalid_input" });
	});

	it("search sync and backfill call the Search sources, or answer search_unavailable", async () => {
		const none = await agentHarness(env, settings);
		const t = await none.key(["sync:search"]);
		expect((await none.call("agent/v1/search/sync", { token: t, input: {} })).json).toMatchObject({ ok: false, error: "search_unavailable" });
		const calls: unknown[] = [];
		const h = await agentHarness(env, settings, {
			search: { sync: async (_c, b) => (calls.push(["sync", b]), { ran: true }), backfill: async (_c, b) => (calls.push(["backfill", b]), { done: false }) },
		});
		const k = await h.key(["sync:search"]);
		expect((await h.call("agent/v1/search/sync", { token: k, input: {} })).json.data).toEqual({ ran: true });
		expect((await h.call("agent/v1/search/backfill", { token: k, input: { action: "start", source: "google", from: "2026-01-01", to: "2026-02-01" } })).json.data).toEqual({ done: false });
		expect((await h.call("agent/v1/search/backfill", { token: k, input: { action: "rewind" } })).status).toBe(400);
		expect(calls).toHaveLength(2);
	});

	it("binds every site-aware route to a client site and restricts keys to their sites", async () => {
		invalidateRegistry();
		const h = await agentHarness(env, settings);
		await h.storage.sites.put("blog", { id: "blog", label: "Blog", key: "b".repeat(20), hosts: ["blog.example.net"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 });
		await h.storage.sites.put("shop", { id: "shop", label: "Shop", key: "s".repeat(20), hosts: ["shop.example.net"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 });
		const all = await h.key(["read:analytics", "write:annotations"]);
		const status = await h.call("agent/v1/status", { token: all, input: { site: "blog" } });
		expect(status.json.meta.site).toBe("blog");
		expect(status.json.data.search).toEqual({ bing: { lastRun: "2026-03-12T08:00:00Z", lastError: null } });
		expect(status.json.data.lastHumanDay).toBeNull();
		const summary = await h.call("agent/v1/summary", { token: all, input: { ...RANGE, site: "blog" } });
		expect(summary.json).toMatchObject({ ok: true, meta: { site: "blog" } });
		expect(summary.json.data.data.totals.sessions).toBe(0);
		const posted = await h.call("agent/v1/annotations", { method: "POST", token: all, input: { text: "Blog launch", site: "blog" } });
		expect(posted.json.data.site).toBe("blog");
		const listed = await h.call("agent/v1/annotations", { token: all, input: { site: "blog" } });
		expect(listed.json.data.items.map((i: { text: string }) => i.text)).toEqual(["Blog launch"]);

		const blogOnly = await h.key(["read:analytics"], undefined, ["blog"]);
		expect((await h.call("agent/v1/summary", { token: blogOnly, input: { site: "blog" } })).status).toBe(200);
		for (const input of [{ site: "shop" }, {}, { site: "default" }]) {
			const r = await h.call("agent/v1/summary", { token: blogOnly, input });
			expect({ status: r.status, text: r.text }, JSON.stringify(input)).toEqual({ status: 404, text: "{}" });
		}
		// The catalog and the OpenAPI document belong to no site.
		expect((await h.call("agent/v1/reports", { token: blogOnly })).status).toBe(200);
		expect((await h.call("agent/v1/openapi.json", { token: blogOnly })).status).toBe(200);
		const q = await h.call("agent/v1/query", { token: blogOnly, input: { report: "overview", query: { ...RANGE, site: "shop" } } });
		expect({ status: q.status, text: q.text }).toEqual({ status: 404, text: "{}" });
		// The key's site list never appears in agent output.
		for (const r of [status, summary, posted, listed]) expect(r.text).not.toMatch(/"sites"/);
		invalidateRegistry();
	});

	it("serves the OpenAPI document to any valid key", async () => {
		const h = await agentHarness(env, settings);
		const r = await h.call("agent/v1/openapi.json", { token: await h.key(["write:annotations"]) });
		expect(r.status).toBe(200);
		expect(r.json.openapi).toBe("3.1.0");
		expect(r.json.info.version).toBe("9.9.9");
		expect((await h.call("agent/v1/openapi.json", {})).status).toBe(404);
	});

	it("agent/v1/events keeps its response shape for corrections and voids", async () => {
		const h = await agentHarness(env, settings);
		const token = await h.key(["write:events"]);
		const post = (events: unknown[]) => h.call("agent/v1/events", { token, input: { events } });
		expect((await post([{ name: "purchase", val: 10, oid: "A-1001" }])).json).toMatchObject({ ok: true, data: { accepted: 1, duplicates: 0, rejected: [] } });
		const r = await post([{ name: "purchase", oid: "A-1001", void: true }, { name: "purchase", oid: "A-9999", void: true }]);
		expect([r.status, r.json.ok, r.json.data]).toEqual([200, true, { accepted: 0, duplicates: 1, rejected: [{ index: 1, reason: "unknown_order" }] }]);
		expect(r.json.meta).toBeDefined();
	});

	it("never puts the token in a response or a log", async () => {
		const h = await agentHarness(env, settings);
		const token = await h.key(["read:analytics", "read:search", "sync:search", "write:annotations", "write:dashboards", "write:events", "data:export", "data:import"]);
		h.storage.dashboards.items.set("dash00000000", storedDash("dash00000000", "default", [kpi("visitors")]));
		const secret = token.slice(9);
		const bodies: Record<string, unknown> = {
			"agent/v1/query": { report: "overview", query: { ...RANGE } },
			"agent/v1/annotations": { text: "x" },
			"agent/v1/search/sync": {},
			"agent/v1/search/backfill": { action: "status" },
			"agent/v1/dashboards/data": { id: "dash00000000" },
			"agent/v1/dashboards/save": { dashboard: dashInput() },
			"agent/v1/dashboards/delete": { id: "dash00000000" },
			"agent/v1/events": { events: [{ name: "purchase", val: 1, oid: "A-1001" }] },
			"agent/v1/data/dump": { table: "ca_drops" },
			"agent/v1/data/load": { layout: 1, table: "ca_drops", rows: [] },
		};
		const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
		const texts: string[] = [];
		for (const e of ENDPOINTS) {
			const r = await h.call(e.name, { method: e.method, token, input: e.method === "POST" ? bodies[e.name] : {} });
			expect(r.status, e.name).toBe(e.name.includes("search/") ? 400 : 200);
			texts.push(r.text);
		}
		const logged = JSON.stringify(spies.map((s) => s.mock.calls));
		for (const s of spies) s.mockRestore();
		expect(texts.join("\n")).not.toContain(secret);
		expect(logged).not.toContain(secret);
	});
});
