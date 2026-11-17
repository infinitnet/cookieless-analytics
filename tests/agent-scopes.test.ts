import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { requiredScopes } from "../src/agent/query.js";
import { type Scope, SCOPES } from "../src/keys/scopes.js";
import { clearReportCache, REPORT_NAMES, SEARCH_REPORTS } from "../src/query/reports/index.js";
import type { Settings } from "../src/settings.js";
import { agentHarness } from "./agent.helpers.js";
import { RANGE, seed, seedSearch } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";
import { SCHEMA_VERSION } from "../src/db/schema.js";
import { kpi, storedDash } from "./fixtures/dashboards.js";

const Q = { query: { ...RANGE } };
/** Every endpoint (and the three query flavours) with the scope sets that may call it. */
const MATRIX: Array<{ label: string; name: string; method?: "GET" | "POST"; input?: unknown; allowed: (s: Scope[]) => boolean }> = [
	{ label: "query traffic", name: "agent/v1/query", input: { report: "overview", ...Q }, allowed: (s) => s.includes("read:analytics") },
	{ label: "query search", name: "agent/v1/query", input: { report: "search_overview", ...Q }, allowed: (s) => s.includes("read:search") },
	{ label: "query pages withSearch", name: "agent/v1/query", input: { report: "pages", ...Q, params: { withSearch: true } }, allowed: (s) => s.includes("read:analytics") && s.includes("read:search") },
	{ label: "query search dimension values", name: "agent/v1/query", input: { report: "dimension_values", ...Q, params: { dim: "query", scope: "search" } }, allowed: (s) => s.includes("read:search") },
	{ label: "reports", name: "agent/v1/reports", allowed: (s) => s.includes("read:analytics") },
	{ label: "summary", name: "agent/v1/summary", input: { ...RANGE }, allowed: (s) => s.includes("read:analytics") },
	{ label: "status", name: "agent/v1/status", allowed: (s) => s.includes("read:analytics") },
	{ label: "annotations GET", name: "agent/v1/annotations", method: "GET", allowed: (s) => s.includes("read:analytics") },
	{ label: "annotations POST", name: "agent/v1/annotations", method: "POST", input: { text: "deploy" }, allowed: (s) => s.includes("write:annotations") },
	{ label: "search sync", name: "agent/v1/search/sync", input: {}, allowed: (s) => s.includes("sync:search") },
	{ label: "search backfill", name: "agent/v1/search/backfill", input: { action: "status" }, allowed: (s) => s.includes("sync:search") },
	{ label: "dashboards GET", name: "agent/v1/dashboards", method: "GET", allowed: (s) => s.includes("read:analytics") },
	{ label: "dashboards data", name: "agent/v1/dashboards/data", input: { id: "traffic00000" }, allowed: (s) => s.includes("read:analytics") },
	{ label: "dashboards data with a search tile", name: "agent/v1/dashboards/data", input: { id: "search000000" }, allowed: (s) => s.includes("read:analytics") && s.includes("read:search") },
	{ label: "dashboards save", name: "agent/v1/dashboards/save", input: { dashboard: { name: "New", tiles: [kpi("visitors")], defaults: { range: "7d", compare: "none", filters: [] }, viewer: { ranges: ["7d"], compare: false } } }, allowed: (s) => s.includes("write:dashboards") },
	{ label: "dashboards delete", name: "agent/v1/dashboards/delete", input: { id: "delete000000" }, allowed: (s) => s.includes("write:dashboards") },
	{ label: "events", name: "agent/v1/events", input: { events: [{ name: "purchase", val: 5 }] }, allowed: (s) => s.includes("write:events") },
	{ label: "data dump", name: "agent/v1/data/dump", input: { table: "ca_drops" }, allowed: (s) => s.includes("data:export") },
	{ label: "data load", name: "agent/v1/data/load", input: { layout: SCHEMA_VERSION, table: "ca_drops", rows: [] }, allowed: (s) => s.includes("data:import") },
	{ label: "openapi", name: "agent/v1/openapi.json", allowed: () => true },
];
function seedDashboards(h: Awaited<ReturnType<typeof agentHarness>>) {
	h.storage.dashboards.items.set("traffic00000", storedDash("traffic00000", "default", [kpi("visitors")]));
	h.storage.dashboards.items.set("search000000", storedDash("search000000", "default", [kpi("visitors"), { id: "srch01", report: "search_overview", kind: "kpi", metric: "clicks", w: 1 }]));
	h.storage.dashboards.items.set("delete000000", storedDash("delete000000", "default", [kpi("visitors")]));
}
const KEYS: Scope[][] = [...SCOPES.map((s) => [s]), ["read:analytics", "read:search"], [...SCOPES]];

describe("agent scope matrix", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
		await seedSearch(env);
	});
	beforeEach(() => clearReportCache());

	it("maps reports to scopes", () => {
		for (const r of REPORT_NAMES) expect(requiredScopes({ report: r })).toEqual(SEARCH_REPORTS.includes(r) ? ["read:search"] : ["read:analytics"]);
	});

	for (const scopes of KEYS) {
		it(`key with ${scopes.join(" + ")}`, async () => {
			const h = await agentHarness(env, settings, { search: { sync: async () => ({ ran: true }), backfill: async () => ({ state: "idle" }) } });
			const token = await h.key(scopes);
			seedDashboards(h);
			for (const m of MATRIX) {
				const r = await h.call(m.name, { token, ...(m.method ? { method: m.method } : {}), input: m.input ?? {} });
				if (m.allowed(scopes)) expect(r.status, `${m.label} with ${scopes}`).toBe(200);
				else expect({ status: r.status, text: r.text }, `${m.label} with ${scopes}`).toEqual({ status: 404, text: "{}" });
			}
		});
	}

	it("query answers 404 to a key without a read scope, whatever the body", async () => {
		const h = await agentHarness(env, settings);
		const token = await h.key(["write:annotations", "sync:search"]);
		for (const input of [{}, { report: "nope" }, { report: "overview", query: { ...RANGE, site: "x" } }, { report: "overview", ...Q }])
			expect(await h.call("agent/v1/query", { token, input }).then((r) => ({ status: r.status, text: r.text }))).toEqual({ status: 404, text: "{}" });
	});

	it("a key with no scope reaches only the OpenAPI document", async () => {
		const h = await agentHarness(env, settings);
		const token = await h.key([]);
		seedDashboards(h);
		for (const m of MATRIX) {
			const r = await h.call(m.name, { token, ...(m.method ? { method: m.method } : {}), input: m.input ?? {} });
			expect(r.status, m.label).toBe(m.name === "agent/v1/openapi.json" ? 200 : 404);
		}
	});

	it("no source comment claims that no ingest scope exists (write:events is the one)", () => {
		const files = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" }).split("\n").filter((f) => /\.(ts|tsx|mjs)$/.test(f));
		const old = /no scope for[^.]*\bingest/i;
		expect(files.filter((f) => old.test(readFileSync(f, "utf8")))).toEqual([]);
		expect(readFileSync("src/keys/scopes.ts", "utf8")).toContain("`write:events` is the one ingest scope");
	});
});
