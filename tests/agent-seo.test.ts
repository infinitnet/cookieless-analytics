/** Agent API and the SEO views: scope matrix, catalog, OpenAPI coverage. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildOpenApi } from "../src/agent/openapi.js";
import { requiredScopes } from "../src/agent/query.js";
import { clearReportCache, REPORTS } from "../src/query/reports/index.js";
import { SEO_TEXT } from "../src/query/reports/seo-copy.js";
import { VERSION } from "../src/index.js";
import { agentHarness, memColl } from "./agent.helpers.js";
import { RANGE, seed, seedSearch } from "./fixtures/seed.js";
import { storedDash } from "./fixtures/dashboards.js";
import { schemaDb } from "./helpers.js";

const SEARCH_VIEWS = [
	"search_cannibalization",
	"search_cannibalization_pages",
	"search_cannibalization_page",
	"search_cannibalization_query",
	"search_position_bands",
	"search_position_bands_series",
	"search_position_moves",
	"search_striking_distance",
	"search_movers",
	"search_decay",
] as const;
const PARAMS: Record<string, Record<string, unknown>> = { search_cannibalization_page: { page: "/" }, search_cannibalization_query: { query: "cookieless" } };

describe("agent API: SEO views and impact", () => {
	let h: Awaited<ReturnType<typeof agentHarness>>;
	beforeAll(async () => {
		const env = await schemaDb();
		const settings = await seed(env, "UTC");
		await seedSearch(env);
		h = await agentHarness(env, settings, { limiter: () => 0 });
		h.storage.annotations = memColl({ a1: { site: "default", ts: Date.UTC(2026, 2, 11, 12) / 1000, kind: "manual", text: "Change" } });
	});
	beforeEach(() => clearReportCache());

	it("search views need read:search, the traffic views read:analytics, impact follows its target", async () => {
		const search = await h.key(["read:search"]);
		const analytics = await h.key(["read:analytics"]);
		for (const report of SEARCH_VIEWS) {
			expect(REPORTS[report][0], report).toBe("search");
			const ok = await h.call("agent/v1/query", { token: search, input: { report, query: RANGE, params: PARAMS[report] } });
			expect(ok.status, `${report}: ${ok.text}`).toBe(200);
			expect((await h.call("agent/v1/query", { token: analytics, input: { report, query: RANGE, params: PARAMS[report] } })).status, report).toBe(404);
		}
		for (const report of ["traffic_movers", "traffic_decay"]) {
			expect((await h.call("agent/v1/query", { token: analytics, input: { report, query: RANGE } })).status, report).toBe(200);
			expect((await h.call("agent/v1/query", { token: search, input: { report, query: RANGE } })).status, report).toBe(404);
		}
		const imp = (report: string, metric: string) => ({ report: "impact", query: RANGE, params: { annotation: "a1", report, metric } });
		const r = await h.call("agent/v1/query", { token: analytics, input: imp("overview", "sessions") });
		expect(r.status, r.text).toBe(200);
		expect(r.json.data.data.caution).toBe(SEO_TEXT.caution);
		expect((await h.call("agent/v1/query", { token: analytics, input: imp("search_overview", "clicks") })).status).toBe(404);
		const both = await h.key(["read:analytics", "read:search"]);
		expect((await h.call("agent/v1/query", { token: both, input: imp("search_overview", "clicks") })).status).toBe(200);
		expect(requiredScopes({ report: "search_movers" })).toEqual(["read:search"]);
	});

	it("dashboards/data needs read:search for an impact tile over a search report", async () => {
		await h.storage.dashboards.put("dashdashdash", storedDash("dashdashdash", "default", [{ id: "imp001", report: "impact", kind: "kpi", metric: "clicks", params: { annotation: "latest", report: "search_overview" }, w: 1 }]));
		expect((await h.call("agent/v1/dashboards/data", { token: await h.key(["read:analytics"]), input: { id: "dashdashdash" } })).status).toBe(404);
		expect((await h.call("agent/v1/dashboards/data", { token: await h.key(["read:analytics", "read:search"]), input: { id: "dashdashdash" } })).status).toBe(200);
	});

	it("the catalog lists the params, the period rule, the coverage text and potential_clicks as an estimate", async () => {
		const r = await h.call("agent/v1/reports", { token: await h.key(["read:analytics"]), input: {} });
		const c = r.json.data;
		expect(c.metrics.potential_clicks).toMatchObject({ estimate: true });
		expect(c.seo.coverage).toBe(SEO_TEXT.coverage);
		expect(c.seo.periodRule).toContain("provisional_excluded");
		expect(c.seo.reports.search_movers.params).toEqual(expect.arrayContaining(["dim", "direction", "metric", "minImpressions"]));
		expect(c.seo.impact.windows).toEqual([7, 14, 28, 60, 90]);
		expect(c.seo.impact.caution).toBe(SEO_TEXT.caution);
		expect(c.dashboards.tileKinds.search_position_bands_series).toEqual(["stacked", "line", "area"]);
		expect(c.dashboards.tileParams.impact).toEqual(expect.arrayContaining(["annotation", "window", "report", "scope", "path"]));
		for (const name of [...SEARCH_VIEWS, "traffic_movers", "traffic_decay", "impact"]) expect(c.reports.map((x: { name: string }) => x.name)).toContain(name);
	});

	it("OpenAPI lists the new report names and params", () => {
		const body = (buildOpenApi(VERSION).paths as Record<string, Record<string, { requestBody: { content: Record<string, { schema: { properties: Record<string, { enum?: string[]; properties?: Record<string, unknown> }> } }> } }>>)["/agent/v1/query"]?.post?.requestBody.content["application/json"]?.schema;
		expect(body?.properties.report?.enum).toEqual(expect.arrayContaining([...SEARCH_VIEWS, "traffic_movers", "traffic_decay", "impact"]));
		expect(Object.keys(body?.properties.params?.properties ?? {})).toEqual(expect.arrayContaining(["direction", "minImpressions", "minShare", "includeBrand", "annotation", "window", "report", "key", "path", "list"]));
	});
});
