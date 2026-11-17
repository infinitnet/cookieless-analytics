/** Integration option `sites`: validation at createPlugin and the derived `allowedHosts`. */
import { describe, expect, it } from "vitest";
import { ALLOWED_HOSTS, cookielessAnalytics, createPlugin } from "../src/index.js";
import { allowedHostsFor, parseOptions } from "../src/multisite/config.js";
import { mappedPairs } from "../src/sources/sync.js";
import { normalizeSettings } from "../src/settings.js";

const blog = { id: "blog", label: "Blog", origin: "https://blog.example.net", keyEnv: "CA_SITE_BLOG_KEY" };
const shop = { id: "shop", label: "Shop", origin: "https://shop.example.org:8443/", keyEnv: "CA_SITE_SHOP_KEY" };

describe("sites option", () => {
	it("accepts valid satellites and normalizes the origin", () => {
		expect(parseOptions({ sites: [blog, shop] }).sites).toEqual([blog, { ...shop, origin: "https://shop.example.org:8443" }]);
		expect(parseOptions(undefined).sites).toEqual([]);
		expect(parseOptions({}).sites).toEqual([]);
	});

	it.each([
		["an http origin", { ...blog, origin: "http://blog.example.net" }, /https origin/],
		["an origin with a path", { ...blog, origin: "https://blog.example.net/sub" }, /https origin/],
		["an origin with a query", { ...blog, origin: "https://blog.example.net/?a=1" }, /https origin/],
		["an origin with credentials", { ...blog, origin: "https://u:p@blog.example.net" }, /https origin/],
		["an uppercase id", { ...blog, id: "Blog" }, /id/],
		["an id longer than 32", { ...blog, id: "a".repeat(33) }, /id/],
		["the id of this site", { ...blog, id: "default" }, /id of this site/],
		["the reserved id all", { ...blog, id: "all" }, /reserved/],
		["a lowercase keyEnv", { ...blog, keyEnv: "ca_key" }, /keyEnv/],
		["a short keyEnv", { ...blog, keyEnv: "CA" }, /keyEnv/],
		["a keyEnv starting with a digit", { ...blog, keyEnv: "1CA_KEY" }, /keyEnv/],
		["an empty label", { ...blog, label: " " }, /label/],
	])("rejects %s at createPlugin and in the descriptor", (_name, site, msg) => {
		expect(() => createPlugin({ sites: [site] })).toThrow(msg);
		expect(() => cookielessAnalytics({ sites: [site] })).toThrow(msg);
	});

	it("rejects a duplicate id and a remote id equal to the configured siteId", () => {
		expect(() => parseOptions({ sites: [blog, { ...shop, id: "blog" }] })).toThrow(/twice/);
		expect(() => parseOptions({ sites: [blog] }, "blog")).toThrow(/id of this site/);
		expect(() => parseOptions({ sites: "blog" })).toThrow(/array/);
	});

	it("allowedHosts are the Search hosts plus exactly the configured hostnames", () => {
		const expected = [...ALLOWED_HOSTS, "blog.example.net", "shop.example.org"];
		expect(createPlugin({ sites: [blog, shop] }).allowedHosts).toEqual(expected);
		const d = cookielessAnalytics({ sites: [blog, shop] });
		expect(d.allowedHosts).toEqual(expected);
		// The descriptor carries the options to `createPlugin(options)` in the generated module.
		expect(d.options).toEqual({ sites: [blog, { ...shop, origin: "https://shop.example.org:8443" }] });
		expect(createPlugin().allowedHosts).toEqual([...ALLOWED_HOSTS]);
		expect(cookielessAnalytics().options).toBeUndefined();
		expect(allowedHostsFor(["a.example.com"], [blog, { ...blog, id: "blog2" }])).toEqual(["a.example.com", "blog.example.net"]);
	});

	it("the master never syncs Search data for a satellite", () => {
		const s = normalizeSettings({ siteId: "default", gscProperty: "sc-domain:example.com", bingSiteUrl: "https://example.com/" });
		expect(mappedPairs(s, []).map((p) => p.site)).not.toContain("blog");
	});
});

describe("database engine option", () => {
	it.each([
		["an unknown engine", { database: { binding: "CA_PG", engine: "mysql" } }, /database option: engine must be "d1" or "postgres".*"mysql"/],
		["an engine of the wrong type", { database: { binding: "CA_PG", engine: true } }, /database option: engine must be "d1" or "postgres"/],
		["an engine in the wrong case", { databases: { sites: { shop: "CA_PG" }, engine: "Postgres" } }, /databases option: engine must be "d1" or "postgres"/],
		["an engine without a binding", { database: { engine: "postgres" } }, /database option: binding must name the D1 or Hyperdrive binding/],
		["a Hyperdrive binding name with a dash", { database: { binding: "CA-PG", engine: "postgres" } }, /binding must name the D1 or Hyperdrive binding/],
		["a routed site without a binding name", { databases: { sites: { shop: 1 }, engine: "postgres" } }, /site shop must name a D1 or Hyperdrive binding/],
		["both options", { database: { binding: "CA_PG", engine: "postgres" }, databases: { sites: {} } }, /not both/],
	])("rejects %s at createPlugin and in the descriptor", (_name, options, msg) => {
		expect(() => parseOptions(options)).toThrow(msg);
		expect(() => createPlugin(options as never)).toThrow(msg);
		expect(() => cookielessAnalytics(options as never)).toThrow(msg);
	});

	it("keeps the engine; the descriptor loads the /postgres entry only with engine postgres", () => {
		expect(parseOptions({ database: { binding: "CA_PG", engine: "postgres" } }).database).toEqual({ binding: "CA_PG", engine: "postgres" });
		expect(parseOptions({ databases: { default: "CA_DB", sites: { shop: "CA_PG" }, engine: "postgres" } }).databases).toEqual({ default: "CA_DB", sites: { shop: "CA_PG" }, engine: "postgres" });
		const entry = (o: Parameters<typeof cookielessAnalytics>[0]) => cookielessAnalytics(o).entrypoint;
		expect(entry({ database: { binding: "CA_PG", engine: "postgres" } })).toBe("@infinitnet/cookieless-analytics/postgres");
		expect(entry({ databases: { sites: { shop: "CA_PG" }, engine: "postgres" } })).toBe("@infinitnet/cookieless-analytics/postgres");
		for (const o of [undefined, {}, { database: { binding: "CA_DB" } }, { database: { binding: "CA_DB", engine: "d1" as const } }, { databases: { sites: { shop: "CA_DB" } } }])
			expect(entry(o), JSON.stringify(o)).toBe("@infinitnet/cookieless-analytics");
		// The options reach `createPlugin(options)` of that entry unchanged.
		expect(cookielessAnalytics({ database: { binding: "CA_PG", engine: "postgres" } }).options).toEqual({ database: { binding: "CA_PG", engine: "postgres" } });
	});
});
