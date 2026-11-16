import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOpenApi } from "../src/agent/openapi.js";
import { createPlugin, VERSION } from "../src/index.js";

const doc = buildOpenApi(VERSION);
const committed = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"));
const METHODS = ["get", "post", "put", "patch", "delete", "head"];

describe("OpenAPI document", () => {
	it("is committed up to date (pnpm openapi) for the package version", () => {
		expect(committed).toEqual(doc);
		expect(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version).toBe(VERSION);
	});

	it("scripts/build-openapi.mjs --check agrees with the committed file", () => {
		expect(() => execFileSync(process.execPath, ["scripts/build-openapi.mjs", "--check"], { cwd: new URL("..", import.meta.url), stdio: "pipe" })).not.toThrow();
	});

	it("covers every agent route and method registered on the plugin, and nothing else", () => {
		const routes = (createPlugin() as unknown as { routes: Record<string, { methods?: string[] }> }).routes;
		const registered = Object.entries(routes)
			.filter(([n]) => n.startsWith("agent/"))
			.flatMap(([n, r]) => (r.methods ?? []).map((m) => `${m.toLowerCase()} /${n}`))
			.sort();
		const documented = Object.entries(doc.paths)
			.flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`))
			.sort();
		expect(documented).toEqual(registered);
		expect(registered.length).toBe(14);
	});

	it("covers the annotation scope fields", () => {
		const props = (p: string, m: string) => {
			const op = (doc.paths as Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { properties: Record<string, unknown> } }> }; parameters?: Array<{ name: string }> }>>)[p]?.[m];
			return op?.requestBody ? Object.keys(op.requestBody.content["application/json"]?.schema.properties ?? {}) : (op?.parameters ?? []).map((x) => x.name);
		};
		expect(props("/agent/v1/query", "post")).toContain("withAnnotations");
		expect(props("/agent/v1/annotations", "post")).toEqual(expect.arrayContaining(["scope", "path"]));
		expect(props("/agent/v1/annotations", "get")).toEqual(expect.arrayContaining(["path", "host", "query"]));
	});

	it("is a valid OpenAPI 3.1 shape with the X-Api-Key scheme", () => {
		expect(doc.openapi).toBe("3.1.0");
		expect(doc.info.title && doc.info.version).toBeTruthy();
		expect(doc.components.securitySchemes.apiKey).toEqual({ type: "apiKey", in: "header", name: "X-Api-Key" });
		expect(doc.servers[0]?.url).toBe("/_emdash/api/plugins/cookieless-analytics");
		const ids = new Set<string>();
		for (const [path, ops] of Object.entries(doc.paths)) {
			expect(path).toMatch(/^\/agent\/v1\//);
			for (const [method, op] of Object.entries(ops as Record<string, Record<string, unknown>>)) {
				expect(METHODS).toContain(method);
				const o = op as { operationId: string; security: unknown; responses: Record<string, unknown>; parameters?: Array<{ in: string }>; requestBody?: unknown };
				expect(ids.has(o.operationId)).toBe(false);
				ids.add(o.operationId);
				expect(o.security).toEqual([{ apiKey: [] }]);
				expect(Object.keys(o.responses)).toEqual(expect.arrayContaining(["200", "404", "429"]));
				for (const p of o.parameters ?? []) expect(p.in).toBe("query");
				if (method === "get") expect(o.requestBody).toBeUndefined();
			}
		}
		// Every $ref resolves inside the document.
		const text = JSON.stringify(doc);
		for (const [, ref] of text.matchAll(/"\$ref":"#\/([^"]+)"/g)) {
			const target = (ref as string).split("/").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], doc);
			expect(target, ref).toBeDefined();
		}
	});

	it("never names Bearer as an accepted scheme", () => {
		const text = JSON.stringify(doc);
		expect(text).not.toMatch(/"scheme"\s*:\s*"bearer"/i);
	});

	it("documents the order overwrite rule, the void item and unknown_order on agent/v1/events", () => {
		const op = JSON.stringify((doc.paths as Record<string, unknown>)["/agent/v1/events"]);
		for (const text of ["void", "unknown_order", "replaces the stored amount and currency", "raw window"]) expect(op, text).toContain(text);
		const agents = readFileSync(new URL("../docs/AGENTS.md", import.meta.url), "utf8");
		for (const text of ["\"void\": true", "unknown_order", "replaces its `val` and `cur`"]) expect(agents, text).toContain(text);
	});
});
