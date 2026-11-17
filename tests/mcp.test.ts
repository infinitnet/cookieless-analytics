/** MCP tools: the definition passes `definePlugin`, the runtime filter keeps exactly four tools, each registers on an `McpServer`. */
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { definePlugin } from "emdash";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildCatalog } from "../src/agent/schemas.js";
import { ADMIN_PAGES, createPlugin, PLUGIN_ID } from "../src/index.js";
import { MCP_TOOLS } from "../src/mcp.js";
import { dataCatalogRoute } from "../src/routes/data.js";
import { schemaDb } from "./helpers.js";
import { agentHarness } from "./agent.helpers.js";
import { normalizeSettings } from "../src/settings.js";

type HostRoute = { public?: boolean; methods?: string[]; response?: string; permission?: string; request?: { body?: string } };
type Tool = { description: string; route: string; input: z.ZodType; destructive?: boolean };
const plugin = createPlugin() as unknown as { routes: Record<string, HostRoute>; mcp?: { tools: Record<string, Tool> } };
const tools = plugin.mcp?.tools ?? {};

/** Copy of `isJsonPostRouteContract` (`@emdash-cms/plugin-types`) and the filter of `getPluginMcpTools` (`emdash-runtime.ts`). */
const jsonPost = (r: HostRoute) => r.response !== "raw" && (r.methods === undefined || r.methods.includes("POST")) && (r.request === undefined || r.request.body === "json");
const HOST_PERMISSIONS = ["plugins:read", "plugins:manage"];
const runtimeTools = () =>
	Object.entries(tools).filter(([, t]) => {
		const r = plugin.routes[t.route];
		return !!r && !r.public && r.response !== "raw" && jsonPost(r) && !!r.permission && HOST_PERMISSIONS.includes(r.permission);
	});

describe("MCP tools", () => {
	it("are the four tools with their routes and permissions", () => {
		expect(Object.fromEntries(Object.entries(tools).map(([n, t]) => [n, [t.route, plugin.routes[t.route]?.permission, t.destructive ?? false]]))).toEqual({
			analytics_query: ["data/query", "plugins:read", false],
			analytics_catalog: ["data/catalog", "plugins:read", false],
			analytics_sites_summary: ["sites/summary", "plugins:read", false],
			analytics_annotate: ["config/annotations/save", "plugins:manage", false],
		});
		expect(tools).toBe(MCP_TOOLS);
	});

	it("pass definePlugin, which throws for a missing, public, raw or permissionless route", () => {
		const base = { id: PLUGIN_ID, version: "1.0.0", routes: plugin.routes as Record<string, unknown> };
		expect(() => definePlugin({ ...base, mcp: { tools: MCP_TOOLS } } as never)).not.toThrow();
		const tool = (route: string) => ({ ...base, mcp: { tools: { t: { description: "x", route, input: z.object({}) } } } }) as never;
		expect(() => definePlugin(tool("nope"))).toThrow(/unknown route/);
		expect(() => definePlugin(tool("agent/v1/query"))).toThrow(/public route/);
		expect(() => definePlugin(tool("data/export"))).toThrow(/raw response/);
		expect(() => definePlugin({ ...base, routes: { ...base.routes, g: { methods: ["GET"], permission: "plugins:read", handler: async () => ({}) } }, mcp: { tools: { t: { description: "x", route: "g", input: z.object({}) } } } } as never)).toThrow(/POST-compatible/);
		expect(() => definePlugin({ ...base, routes: { x: { handler: async () => ({}) } }, mcp: { tools: { t: { description: "x", route: "x", input: z.object({}) } } } } as never)).toThrow(/permission/);
	});

	it("survive the runtime filter, all four, with safe names", () => {
		expect(runtimeTools().map(([n]) => n)).toEqual(Object.keys(tools));
		expect(runtimeTools()).toHaveLength(4);
		for (const n of Object.keys(tools)) expect(n).toMatch(/^[a-zA-Z0-9_-]+$/);
	});

	it("cannot ingest events, change keys, shares or settings, or delete data", () => {
		for (const t of Object.values(tools)) {
			expect(t.route).not.toMatch(/^(in|session|contract)$|^agent\/|^keys\/|^shares?\/|^tools\/|delete|purge|settings|^sites\/(save|key)$|^search\/(connect|disconnect|save)/);
			expect(plugin.routes[t.route]?.public).not.toBe(true);
		}
	});

	it("inputs are plain objects without a dashboard email field and register on an McpServer", async () => {
		for (const [n, t] of Object.entries(tools)) {
			expect(t.input, n).toBeInstanceOf(z.ZodObject);
			expect(JSON.stringify(z.toJSONSchema(t.input, { target: "draft-7" })), n).not.toMatch(/"email"/);
		}
		// The annotate input mirrors the route body without the scope transform: strict, values unchanged, the route still checks the rules.
		const body = { data: { ts: 1_773_000_000, kind: "manual", text: "Launch", scope: { path: [{ op: "prefix", value: "/blog/" }] } } };
		expect(MCP_TOOLS.analytics_annotate.input.parse(body)).toEqual(body);
		expect(MCP_TOOLS.analytics_annotate.input.safeParse({ ...body, extra: 1 }).success).toBe(false);
		expect(MCP_TOOLS.analytics_annotate.input.safeParse({ data: { ...body.data, extra: 1 } }).success).toBe(false);
		expect(plugin.routes["config/annotations/save"] && (plugin.routes["config/annotations/save"] as { input: z.ZodType }).input.safeParse({ data: { ...body.data, scope: { path: [{ op: "regex", value: "(a+)+" }] } } }).success).toBe(false);
		// The SDK the host serves the endpoint with (a dependency of emdash, not of this package).
		const sdk = join(realpathSync("node_modules/emdash"), "..", "@modelcontextprotocol/sdk/dist/esm/server/mcp.js");
		const { McpServer } = (await import(pathToFileURL(sdk).href)) as { McpServer: new (info: { name: string; version: string }) => { registerTool(n: string, c: unknown, cb: unknown): unknown } };
		const server = new McpServer({ name: "test", version: "0.0.0" });
		for (const [n, t] of Object.entries(tools))
			expect(() => server.registerTool(`${PLUGIN_ID}__${n}`, { description: t.description, inputSchema: t.input, annotations: { destructiveHint: t.destructive ?? false } }, async () => ({ content: [] }))).not.toThrow();
	});

	it("data/catalog equals the agent catalog", async () => {
		const route = dataCatalogRoute();
		expect(route.permission).toBe("plugins:read");
		const doc = await route.handler({ input: {} });
		expect(doc).toEqual(buildCatalog());
		const env = await schemaDb();
		const h = await agentHarness(env, normalizeSettings({ siteId: "default", siteTimezone: "UTC" }), { limiter: () => 0 });
		const agent = await h.call("agent/v1/reports", { token: await h.key(["read:analytics"]) });
		expect(agent.json.data).toEqual(JSON.parse(JSON.stringify(doc)));
		expect(doc.reports.find((r) => r.name === "sites_summary")).toEqual({ name: "sites_summary", kind: "traffic", scopes: ["read:analytics"] });
	});

	it("leave the descriptor with fourteen pages", () => {
		expect(ADMIN_PAGES).toHaveLength(14);
	});
});
