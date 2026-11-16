import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { PAGE_SCRIPT } from "../src/client/generated.js";
import cookielessAnalyticsIntegration from "../src/integration.js";
import { CAPABILITIES, cookielessAnalytics, createPlugin, VERSION } from "../src/index.js";
import { settingsSchema } from "../src/settings.js";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string; name: string };

describe("Astro integration", () => {
	it("registers exactly one pre middleware pointing at the built middleware file", () => {
		const addMiddleware = vi.fn();
		const integration = cookielessAnalyticsIntegration();
		expect(integration.name).toBe("cookieless-analytics");
		(integration.hooks["astro:config:setup"] as (p: unknown) => void)({ addMiddleware });
		expect(addMiddleware).toHaveBeenCalledOnce();
		const arg = addMiddleware.mock.calls[0]?.[0] as { entrypoint: URL; order: string };
		expect(arg.order).toBe("pre");
		expect(arg.entrypoint).toBeInstanceOf(URL);
		expect(arg.entrypoint.pathname.endsWith("/middleware.mjs")).toBe(true);
	});

	it("the built middleware exports onRequest and the built index exports createPlugin", () => {
		for (const f of ["dist/index.mjs", "dist/integration.mjs", "dist/middleware.mjs", "dist/contract.mjs"]) expect(existsSync(f)).toBe(true);
		expect(readFileSync("dist/middleware.mjs", "utf8")).toMatch(/export \{[^}]*\bonRequest\b[^}]*\}/);
		expect(readFileSync("dist/index.mjs", "utf8")).toMatch(/export \{[^}]*\bcreatePlugin\b[^}]*\}/);
	});

	it("the embedded page script stays under 3 KB gzipped", () => {
		expect(gzipSync(PAGE_SCRIPT).length).toBeLessThan(3072);
	});
});

describe("plugin wiring", () => {
	it("descriptor is native with storage, capabilities and the settings schema", () => {
		const d = cookielessAnalytics();
		expect(d).toMatchObject({
			id: "cookieless-analytics",
			version: pkg.version,
			format: "native",
			entrypoint: pkg.name,
			adminEntry: `${pkg.name}/admin`,
			capabilities: ["hooks.page-fragments:register", "content:read", "email:send", "network:request", "schema:read"],
			allowedHosts: ["oauth2.googleapis.com", "www.googleapis.com", "ssl.bing.com", "www.bing.com"],
		});
		expect(Object.keys(d.storage ?? {})).toEqual(["goals", "funnels", "segments", "channel_rules", "agent_rules", "annotations", "api_keys", "sites", "dashboards", "shares"]);
		for (const c of Object.values(d.storage ?? {})) expect(c.indexes?.every((i) => typeof i === "string")).toBe(true);
		// The mail task reads the next due dashboard through a top level index.
		expect(d.storage?.dashboards?.indexes).toEqual(["site", "emailNext"]);
		expect(d.settingsSchema).toBe(settingsSchema);
		expect(VERSION).toBe(pkg.version);
	});

	it("createPlugin passes definePlugin validation with the public routes and hooks", () => {
		const p = createPlugin();
		expect(p.id).toBe("cookieless-analytics");
		expect(p.capabilities).toEqual([...CAPABILITIES]);
		expect([...CAPABILITIES]).toEqual(["hooks.page-fragments:register", "content:read", "email:send", "network:request", "schema:read"]);
		expect(p.allowedHosts).toEqual(["oauth2.googleapis.com", "www.googleapis.com", "ssl.bing.com", "www.bing.com"]);
		const config = ["goals", "funnels", "segments", "channel_rules", "agent_rules", "annotations"].flatMap((c) => ["list", "save", "delete"].map((a) => `config/${c}/${a}`)).concat("config/agent_rules/bulk", "config/agent_rules/builtin");
		const tools = ["tools/test-agent", "tools/reclassify-channels", "tools/rollup-now", "tools/purge", "tools/delete-all", "tools/delete-preview", "tools/delete-start", "tools/delete-run", "tools/delete-cancel", "tools/delete-status", "tools/purge-site", "tools/purge-search", "tools/revenue-void"];
		const keys = ["keys/list", "keys/create", "keys/revoke", "keys/delete"];
		const search = ["status", "test", "sync", "backfill", "oauth/start", "oauth/exchange", "import", "properties", "map", "connect"].map((n) => `search/${n}`);
		const shares = ["shares/list", "shares/create", "shares/delete"];
		const dashboards = ["list", "get", "save", "delete", "export", "import", "copy", "email/status", "email/save", "email/send-test"].map((n) => `dashboards/${n}`);
		const agent = ["query", "reports", "summary", "status", "annotations", "search/sync", "search/backfill", "dashboards", "dashboards/data", "dashboards/save", "dashboards/delete", "events", "openapi.json"].map((n) => `agent/v1/${n}`);
		expect(Object.keys(p.routes).sort()).toEqual(["contract", "share/view", "data/export", "data/query", "data/catalog", "in", "privacy/receipt", "annotations/preview", "editor/traffic", "session", "sites/list", "sites/summary", "sites/hosts", "sites/save", "sites/delete", "sites/key", "settings/get", "settings/save", ...config, ...tools, ...keys, ...search, ...shares, ...dashboards, ...agent].sort());
		expect(p.routes["data/export"]).toMatchObject({ response: "raw", permission: "plugins:read" });
		expect(p.routes.in).toMatchObject({ public: true, response: "raw", request: { body: "text", maxBytes: 8192 } });
		expect(p.routes["share/view"]).toMatchObject({ public: true, methods: ["GET"], request: { body: "none" } });
		expect(p.routes.session).toMatchObject({ public: true, response: "raw", methods: ["GET"] });
		expect(Object.keys(p.hooks).sort()).toEqual(["content:afterPublish", "content:afterSave", "cron", "page:fragments", "plugin:activate"]);
	});
});
