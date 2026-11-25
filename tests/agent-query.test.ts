import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearReportCache, REPORT_NAMES } from "../src/query/reports/index.js";
import { type DataCtx, DataQueryBody, dataQueryRoute } from "../src/routes/data.js";
import type { Settings } from "../src/settings.js";
import { agentHarness, memColl } from "./agent.helpers.js";
import { RANGE, seed, seedSearch } from "./fixtures/seed.js";
import { cloneSite, schemaDb } from "./helpers.js";
import { invalidateRegistry } from "../src/multisite/registry.js";

describe("agent/v1/query", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	let h: Awaited<ReturnType<typeof agentHarness>>;
	let token: string;
	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
		await seedSearch(env);
		h = await agentHarness(env, settings, { limiter: () => 0 });
		token = await h.key(["read:analytics", "read:search"]);
	});
	beforeEach(() => clearReportCache());
	const q = (input: unknown) => h.call("agent/v1/query", { token, input });

	it("equals the admin data/query answer", async () => {
		const body = { report: "channels" as const, query: { ...RANGE, compare: "previous" as const, filters: [{ dim: "country" as const, op: "is" as const, values: ["DE", "US"] }] } };
		const admin = await dataQueryRoute({ db: async () => env.db, settings: async () => settings }).handler({ input: DataQueryBody.parse(body), storage: {} } as DataCtx);
		const r = await q(body);
		expect(r.status).toBe(200);
		expect(r.json.data).toEqual(JSON.parse(JSON.stringify(admin)));
		expect(r.json.meta).toMatchObject({ from: RANGE.from, to: RANGE.to, truncated: false });
	});

	it("serves satisfaction and satisfaction_series under read:analytics only", async () => {
		const analytics = await h.key(["read:analytics"]);
		const searchOnly = await h.key(["read:search"]);
		for (const report of ["satisfaction", "satisfaction_series"]) {
			const ok = await h.call("agent/v1/query", { token: analytics, input: { report, query: { ...RANGE } } });
			expect(ok.status, report).toBe(200);
			expect(ok.json.data.data.totals ?? ok.json.data.data.series).toBeTruthy();
			const no = await h.call("agent/v1/query", { token: searchOnly, input: { report, query: { ...RANGE } } });
			expect({ status: no.status, text: no.text }, report).toEqual({ status: 404, text: "{}" });
		}
	});

	it("serves the revenue reports under read:analytics with meta.currency, and lists them in the catalog", async () => {
		const analytics = await h.key(["read:analytics"]);
		const searchOnly = await h.key(["read:search"]);
		for (const [report, params] of [["revenue", { currency: "EUR" }], ["revenue_series", {}], ["revenue_breakdown", { dim: "goal" }]] as const) {
			const ok = await h.call("agent/v1/query", { token: analytics, input: { report, query: { ...RANGE }, params } });
			expect(ok.status, report).toBe(200);
			expect(ok.json.meta.currency, report).toBe(report === "revenue" ? "EUR" : "USD");
			expect(Array.isArray(ok.json.data.data.currencies), report).toBe(true);
			const no = await h.call("agent/v1/query", { token: searchOnly, input: { report, query: { ...RANGE }, params } });
			expect(no.status, report).toBe(404);
		}
		const bad = await h.call("agent/v1/query", { token: analytics, input: { report: "revenue", query: { ...RANGE }, params: { currency: "ZZZ" } } });
		expect([bad.status, bad.json.error]).toEqual([400, "invalid_currency"]);
		const badFilter = await h.call("agent/v1/query", { token: analytics, input: { report: "overview", query: { ...RANGE, filters: [{ dim: "country", op: "gte", values: ["5"] }] } } });
		expect([badFilter.status, badFilter.json.error]).toEqual([400, "invalid_filter"]);
		const cat = await h.call("agent/v1/reports", { token: analytics });
		const c = cat.json.data;
		expect(c.reports.map((r: { name: string }) => r.name)).toEqual(expect.arrayContaining(["revenue", "revenue_series", "revenue_breakdown"]));
		expect(c.dimensions.traffic).toEqual(expect.arrayContaining(["currency", "revenue"]));
		expect(c.ops).toEqual(expect.arrayContaining(["gt", "gte", "lt", "lte"]));
		expect(c.params).toEqual(expect.arrayContaining(["currency", "withRevenue"]));
		for (const m of ["revenue", "orders", "aov", "revenue_per_visitor", "revenue_per_session", "paying_sessions"]) expect(c.metrics[m], m).toMatchObject({ estimate: false });
		expect(c.revenue.reports.revenue_breakdown.dims).toContain("campaign");
		expect(c.dashboards.tileParams.revenue_breakdown).toEqual(["currency", "dim"]);
	});

	it("serves funnel modes, segment comparison and journeys, and lists them in the catalog", async () => {
		h.storage.segments.items.set("sd", { site: "default", name: "Direct", filters: [{ dim: "channel", op: "is", values: ["Direct"] }] });
		h.storage.segments.items.set("so", { site: "default", name: "Organic", filters: [{ dim: "channel", op: "is", values: ["Organic Search"] }] });
		const steps = [{ type: "page", match: "is", value: "/pricing" }, { type: "page", match: "is", value: "/" }];
		const flex = await q({ report: "funnels", query: { ...RANGE }, params: { steps, mode: "flexible" } });
		expect([flex.status, flex.json.data.data.mode, flex.json.data.data.rows.map((r: { sessions: number }) => r.sessions)]).toEqual([200, "flexible", [18, 18]]);
		const cmp = await q({ report: "overview", query: { ...RANGE, segment: "sd", compare: "segment", compareSegment: "so" } });
		expect(cmp.status).toBe(200);
		expect([cmp.json.data.segment, cmp.json.data.compareSegment, cmp.json.data.compareRange]).toEqual([{ id: "sd", name: "Direct" }, { id: "so", name: "Organic" }, RANGE]);
		const refused = await q({ report: "search_queries", query: { ...RANGE, compare: "segment", compareSegment: "so" } });
		expect([refused.status, refused.json.error]).toEqual([400, "compare_not_supported"]);
		const paths = await q({ report: "journey_paths", query: { ...RANGE } });
		expect(paths.status).toBe(200);
		expect(paths.json.data.data.rows[0]).toMatchObject({ path1: "/", sessions: expect.any(Number) });
		const long = await q({ report: "journey_paths", query: { from: "2026-02-01", to: "2026-03-12" } });
		expect([long.status, long.json.error]).toEqual([400, "journey_range"]);
		const c = (await h.call("agent/v1/reports", { token })).json.data;
		expect(c.params).toEqual(expect.arrayContaining(["mode", "entry"]));
		expect(Object.keys(c.behavior.funnels.modes)).toEqual(["sequential", "strict", "flexible"]);
		expect(c.behavior.funnels.sessionCaps.strict).toBe(10_000);
		expect(c.behavior.journeys).toMatchObject({ maxRangeDays: 31, sessionCap: 50_000, minSessions: 2 });
		expect(c.dashboards.tileKinds.journey_paths).toEqual(["table"]);
		expect(c.dashboards.tileParams.journey_paths).toEqual(["entry"]);
	});

	it("serves collections and site_search and lists them in the catalog", async () => {
		const col = await q({ report: "collections", query: { ...RANGE } });
		expect(col.status).toBe(200);
		expect(col.json.data.data.totals).toHaveProperty("coverage");
		const ss = await q({ report: "site_search", query: { ...RANGE } });
		expect([ss.status, ss.json.data.data.notices]).toEqual([200, ["site_search_off"]]);
		const c = (await h.call("agent/v1/reports", { token })).json.data;
		expect(c.reports.map((r: { name: string }) => r.name)).toEqual(expect.arrayContaining(["collections", "site_search"]));
		expect(c.content.site_search).toMatchObject({ setting: "siteSearchParams", maxParams: 5, termMax: 64, distinctCap: 5000, minSessionsShared: 2 });
		expect(c.content.collections.cacheSeconds).toBe(300);
		expect(c.dashboards.tileKinds.collections).toEqual(["bars", "donut", "table"]);
		expect(c.dashboards.tileKinds.site_search).toEqual(["table"]);
	});

	it("reports truncation in meta", async () => {
		const r = await q({ report: "pages", query: { ...RANGE }, limit: 1 });
		expect(r.json.meta.truncated).toBe(true);
		expect(r.json.data.data.rows).toHaveLength(1);
	});

	it("returns matching annotations and meta.annotations with withAnnotations", async () => {
		const ts = 1_773_230_400;
		h.storage.annotations.items.set("w", { site: "default", ts, kind: "manual", text: "Wide" });
		h.storage.annotations.items.set("p", { site: "default", ts: ts + 1, kind: "release", text: "Pricing", scope: { v: 1, path: [{ op: "is", value: "/pricing" }] } });
		try {
			const r = await q({ report: "countries", query: { ...RANGE, filters: [{ dim: "page", op: "is", values: ["/"] }] }, withAnnotations: true });
			expect(r.status).toBe(200);
			expect(r.json.data.data.annotations).toEqual([{ id: "w", ts, day: "2026-03-11", kind: "manual", text: "Wide", scope: null, summary: "Site-wide" }]);
			expect(r.json.meta.annotations).toEqual({ matched: 1, loaded: 2, truncated: false });
			const series = await q({ report: "timeseries", query: { ...RANGE, granularity: "day" } });
			expect(series.json.data.data.annotations.map((a: { text: string }) => a.text)).toEqual(["Wide", "Pricing"]);
		} finally {
			h.storage.annotations.items.clear();
		}
	});

	it("answers a client site from its own rows, rejects remote and unknown ids, names the site in meta", async () => {
		invalidateRegistry();
		cloneSite(env.raw, "blog", "day = '2026-03-10'");
		await h.storage.sites.put("blog", { id: "blog", label: "Blog", key: "b".repeat(20), hosts: ["blog.example.net"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 });
		const local = await q({ report: "overview", query: { ...RANGE } });
		const blog = await q({ report: "overview", query: { ...RANGE, site: "blog" } });
		const firstDay = await q({ report: "overview", query: { from: RANGE.from, to: RANGE.from } });
		expect(local.json.meta.site).toBe("default");
		expect(blog.json.meta.site).toBe("blog");
		expect(blog.json.data.data.totals).toEqual(firstDay.json.data.data.totals);
		expect(blog.json.data.data.totals.sessions).toBeLessThan(local.json.data.data.totals.sessions);
		expect((await q({ report: "overview", query: { ...RANGE, site: "default" } })).json.meta.site).toBe("default");
		expect((await q({ report: "overview", query: { ...RANGE, site: "nope" } })).json).toMatchObject({ ok: false, error: "unknown_site" });
		const remote = await agentHarness(env, settings, { limiter: () => 0, remoteIds: () => ["shop"] });
		const t = await remote.key(["read:analytics"]);
		const r = await remote.call("agent/v1/query", { token: t, input: { report: "overview", query: { ...RANGE, site: "shop" } } });
		expect(r.status).toBe(400);
		expect(r.json).toMatchObject({ ok: false, error: "site_not_allowed" });
		env.raw.exec("DELETE FROM ca_sessions WHERE site = 'blog'; DELETE FROM ca_events WHERE site = 'blog'; DELETE FROM ca_srv WHERE site = 'blog'");
		h.storage.sites.items.clear();
		invalidateRegistry();
	});

	it("rejects bad filters, unknown reports, extra fields and oversized limits", async () => {
		for (const body of [
			{ report: "overview", query: { ...RANGE, filters: [{ dim: "vkey", op: "is", values: ["x"] }] } },
			{ report: "overview", query: { ...RANGE, filters: [{ dim: "page", op: "is", values: ["x"], prop: "p; DROP TABLE" }] } },
			{ report: "overview", query: { ...RANGE, filters: [{ dim: "page", op: "matches", values: ["x"] }] } },
			{ report: "visitors_raw", query: { ...RANGE } },
			{ report: "overview", query: { ...RANGE }, sql: "SELECT 1" },
			{ report: "pages", query: { ...RANGE }, limit: 5000 },
			{ report: "overview", query: { from: "2026-03-12", to: "2026-03-10" } },
		]) {
			const r = await q(body);
			expect(r.status, JSON.stringify(body)).toBe(400);
			expect(r.json).toMatchObject({ ok: false, error: "invalid_input" });
		}
	});

	it("caps the range at 400 days", async () => {
		expect((await q({ report: "overview", query: { from: "2024-01-01", to: "2026-03-11" } })).json).toMatchObject({ ok: false, error: "range_too_long" });
		expect((await q({ report: "overview", query: { from: "2025-02-06", to: "2026-03-13" } })).json).toMatchObject({ ok: false, error: "range_too_long" });
		expect((await q({ report: "overview", query: { from: "2025-02-07", to: "2026-03-13" } })).status).toBe(200);
	});

	it("rejects unsafe regex", async () => {
		const r = await q({ report: "pages", query: { ...RANGE, filters: [{ dim: "page", op: "regex", values: ["(a+)+"] }] } });
		expect(r.status).toBe(400);
		expect(r.json).toMatchObject({ ok: false, error: "invalid_regex" });
	});

	it("never returns visitor keys, session ids, IPs or user agents", async () => {
		const ids = new Set<string>();
		for (const r of await env.db.all("SELECT sid, vkey FROM ca_sessions")) for (const v of [r.sid, r.vkey]) if (v) ids.add(String(v));
		expect(ids.size).toBeGreaterThan(10);
		const params: Record<string, unknown> = { event_props: { event: "signup" }, funnels: { steps: [{ type: "page", match: "is", value: "/" }, { type: "page", match: "prefix", value: "/" }] }, dimension_values: { dim: "page" }, search_page_queries: { page: "https://example.org/" }, search_cannibalization_page: { page: "/" }, search_cannibalization_query: { query: "x" }, impact: { at: "2026-03-11", report: "overview", metric: "sessions" }, revenue_breakdown: { dim: "channel" }, journey_next: { path: "/" }, journey_prev: { path: "/" } };
		const texts: string[] = [];
		for (const report of REPORT_NAMES) {
			const r = await q({ report, query: { ...RANGE }, ...(params[report] ? { params: params[report] } : {}) });
			expect(r.status, `${report}: ${r.text}`).toBe(200);
			texts.push(r.text);
		}
		for (const route of ["agent/v1/summary", "agent/v1/status", "agent/v1/annotations"]) texts.push((await h.call(route, { token, input: {} })).text);
		const all = texts.join("\n");
		for (const id of ids) expect(all).not.toContain(id);
		expect(all).not.toMatch(/"(vkey|sid|ip|ua|ua_hash|user_agent)"\s*:/);
		expect(all).not.toMatch(/Mozilla\/|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
	});

	it("resolves a saved segment of this site", async () => {
		const seg = await agentHarness(env, settings);
		seg.storage.segments = memColl({ direct: { site: "default", name: "Direct", filters: [{ dim: "channel", op: "is", values: ["Direct"] }] } });
		const t = await seg.key(["read:analytics"]);
		const all = await seg.call("agent/v1/query", { token: t, input: { report: "overview", query: { ...RANGE } } });
		const direct = await seg.call("agent/v1/query", { token: t, input: { report: "overview", query: { ...RANGE, segment: "direct" } } });
		expect(direct.json.data.data.totals.sessions).toBeLessThan(all.json.data.data.totals.sessions);
		expect((await seg.call("agent/v1/query", { token: t, input: { report: "overview", query: { ...RANGE, segment: "nope" } } })).json).toMatchObject({ ok: false, error: "unknown_segment" });
	});
});
