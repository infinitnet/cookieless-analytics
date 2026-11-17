/** Search routes: status, test, sync, backfill, OAuth, properties with suggestions, map. */
import { beforeEach, describe, expect, it } from "vitest";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { redirectUri, type SearchCtx, searchRoutes, searchService, validProperty } from "../src/routes/search.js";
import { normalizeSettings } from "../src/settings.js";
import { clearTokenCache, OAUTH_KV } from "../src/sources/gsc-auth.js";
import { googleSettings, fakeGoogle } from "./gsc.helpers.js";
import { MemoryKv, schemaDb, sitesColl } from "./helpers.js";

const T0 = 1_773_360_000_000; // 2026-03-13T00:00:00Z
const SECRETS = ["fixture-client-secret", "1//fixture-refresh-token", "ya29.", "PRIVATE KEY", "never-echo"];

async function harness(o: { status?: (p: string) => number | undefined; setError?: Error } = {}) {
	const env = await schemaDb();
	const g = fakeGoogle(o);
	const stored: Record<string, unknown> = {};
	let changed = 0;
	const sites = sitesColl([{ id: "shop", hosts: ["www.example.org"] }, { id: "bare", hosts: ["bare.example.net"] }]);
	invalidateRegistry();
	const routes = searchRoutes({ db: async () => env.db, settings: async () => googleSettings(stored), settingsChanged: () => void changed++, now: () => T0 });
	const outputs: string[] = [];
	async function call(name: keyof typeof routes, input?: unknown) {
		const ctx: SearchCtx = {
			input,
			request: new Request("https://admin.example.com/_emdash/api/plugins/cookieless-analytics/" + name, { method: "POST" }),
			kv: env.kv,
			http: g.http,
			settings: {
				set: async (k, v) => {
					if (o.setError) throw o.setError;
					stored[k] = v;
				},
			},
			storage: { sites },
			cron: { schedule: async () => undefined },
		};
		const r = await routes[name].handler(ctx);
		outputs.push(JSON.stringify(r));
		return r as Record<string, any>;
	}
	return { env, g, routes, call, stored, sites, outputs, changed: () => changed };
}

describe("search routes", () => {
	beforeEach(() => clearTokenCache());

	it("declares status as plugins:read and every other route as plugins:manage", async () => {
		const { routes } = await harness();
		expect(Object.fromEntries(Object.entries(routes).map(([n, r]) => [n, r.permission]))).toEqual({
			"search/status": "plugins:read",
			"search/test": "plugins:manage",
			"search/sync": "plugins:manage",
			"search/backfill": "plugins:manage",
			"search/oauth/start": "plugins:manage",
			"search/oauth/exchange": "plugins:manage",
			"search/import": "plugins:manage",
			"search/properties": "plugins:manage",
			"search/map": "plugins:manage",
			"search/connect": "plugins:manage",
		});
	});

	it("status lists both sources for a site; sync fills rows and the state", async () => {
		const h = await harness();
		const before = await h.call("search/status", {});
		expect(before).toMatchObject({ site: "default", kind: "local", provisional: { from: "2026-03-10", to: "2026-03-12" } });
		expect(before.sources.map((s: Record<string, unknown>) => [s.id, s.configured, s.property, s.rows])).toEqual([
			["google", true, "sc-domain:example.com", 0],
			["bing", false, "", 0],
		]);
		const r = await h.call("search/sync", { source: "google" });
		// The whole 7 day window in one call per grain.
		expect(r).toMatchObject({ calls: 6, done: true, pairs: ["default:google"] });
		const after = await h.call("search/status");
		expect(after.sources[0]).toMatchObject({ syncing: false, firstDay: "2026-03-06", lastDay: "2026-03-12", status: "ok", message: null, nextAttempt: null });
		expect(after.sources[0].rows).toBeGreaterThan(0);
		// A client site reports its own mapping and rows.
		expect((await h.call("search/status", { site: "shop" })).sources[0]).toMatchObject({ property: "", rows: 0 });
		await expect(h.call("search/status", { site: "nope" })).rejects.toMatchObject({ code: "unknown_site" });
	});

	it("status reports the missing days between the oldest stored day and the sync window", async () => {
		const h = await harness();
		for (const day of ["2026-02-01", "2026-02-02", "2026-02-05", "2026-03-04", "2026-03-09"])
			h.env.raw.prepare("INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional) VALUES ('default', 'google', ?, '', '', '', '', 1, 10, 30, 0)").run(day);
		const g = (await h.call("search/status")).sources[0];
		expect(g).toMatchObject({ rows: 5, firstDay: "2026-02-01", lastDay: "2026-03-09" });
		// 2026-03-06 on is the sync window (today 2026-03-13): the regular sync fills it.
		expect(g.holes).toEqual([
			["2026-02-03", "2026-02-04"],
			["2026-02-06", "2026-03-03"],
			["2026-03-05", "2026-03-05"],
		]);
		expect((await h.call("search/status")).sources[1].holes).toEqual([]);
	});

	it("sync and backfill refuse an unmapped site or a source without a client", async () => {
		const h = await harness();
		await expect(h.call("search/sync", { site: "shop", source: "google" })).rejects.toMatchObject({ code: "not_mapped" });
		await expect(h.call("search/sync", { source: "bing" })).rejects.toMatchObject({ code: "not_configured" });
		await expect(h.call("search/backfill", { action: "start", site: "shop", from: "2026-01-01", to: "2026-01-02" })).rejects.toMatchObject({ code: "not_mapped" });
		// Without a source the forced run walks the site's mapped pairs: none.
		expect(await h.call("search/sync", { site: "shop" })).toMatchObject({ calls: 0, pairs: [], done: true });
	});

	it("backfill start, status and cancel per site", async () => {
		const h = await harness();
		expect(await h.call("search/backfill", { action: "start", from: "2026-01-01", to: "2026-01-31" })).toMatchObject({ site: "default", source: "google", backfill: { days: 31, completed: 0 } });
		expect(await h.call("search/backfill", { action: "status" })).toMatchObject({ backfill: { from: "2026-01-01", cursor: "2026-01-01" } });
		expect((await h.call("search/status")).sources[0].backfill).toMatchObject({ days: 31 });
		await expect(h.call("search/backfill", { action: "start", from: "2026-01-02", to: "2026-01-01" })).rejects.toMatchObject({ code: "invalid_range" });
		expect(await h.call("search/backfill", { action: "cancel" })).toEqual({ cancelled: true });
		expect(await h.call("search/backfill", { action: "status" })).toMatchObject({ backfill: null });
	});

	it("OAuth: start returns the Google URL with the admin page as redirect; exchange stores the refresh token and returns no secret", async () => {
		const h = await harness();
		const { url } = await h.call("search/oauth/start", {});
		const q = new URL(url).searchParams;
		expect(q.get("redirect_uri")).toBe("https://example.com/_emdash/admin/plugins/cookieless-analytics/search");
		expect(redirectUri("https://example.com")).toBe(q.get("redirect_uri"));
		await expect(h.call("search/oauth/exchange", { code: "4/x", state: "forged" })).rejects.toMatchObject({ code: "oauth_state" });
		const r = await h.call("search/oauth/exchange", { code: "4/x", state: q.get("state") });
		expect(r).toEqual({ connected: true });
		expect(h.stored.gscRefreshToken).toBe("1//fixture-refresh-token");
		expect(h.changed()).toBe(1);
		expect(await h.env.kv.get(OAUTH_KV)).toBeNull();
	});

	it("exchange without EMDASH_ENCRYPTION_KEY answers a typed error", async () => {
		const err = Object.assign(new Error("Plugin secret settings require EMDASH_ENCRYPTION_KEY"), { name: "PluginSettingEncryptionError" });
		const h = await harness({ setError: err });
		const { url } = await h.call("search/oauth/start", {});
		await expect(h.call("search/oauth/exchange", { code: "4/x", state: new URL(url).searchParams.get("state") })).rejects.toMatchObject({ code: "encryption_key_missing" });
	});

	it("properties: verified list with a suggestion for the local site and for a client site", async () => {
		const h = await harness();
		const local = await h.call("search/properties", {});
		expect(local).toMatchObject({ site: "default", current: "sc-domain:example.com", suggested: "sc-domain:example.com" });
		expect(local.items.map((i: { siteUrl: string }) => i.siteUrl)).not.toContain("https://shop.example.net/");
		expect(await h.call("search/properties", { site: "shop" })).toMatchObject({ site: "shop", current: "", suggested: "https://www.example.org/" });
		expect(await h.call("search/properties", { site: "bare" })).toMatchObject({ suggested: null });
		await expect(h.call("search/properties", { source: "bing" })).rejects.toMatchObject({ code: "not_configured" });
	});

	it("map stores the local mapping in settings and a client mapping in its registry record", async () => {
		const h = await harness();
		expect(await h.call("search/map", { source: "google", property: "https://example.com/" })).toEqual({ site: "default", source: "google", property: "https://example.com/", backfill: null });
		expect(h.stored.gscProperty).toBe("https://example.com/");
		await h.call("search/map", { site: "shop", source: "google", property: "https://www.example.org/" });
		expect(h.sites.items.get("shop")).toMatchObject({ gscProperty: "https://www.example.org/", hosts: ["www.example.org"] });
		expect((await h.call("search/status", { site: "shop" })).sources[0].property).toBe("https://www.example.org/");
		await h.call("search/map", { site: "shop", source: "bing", property: "https://www.example.org/" });
		expect(h.sites.items.get("shop")).toMatchObject({ bingSiteUrl: "https://www.example.org/" });
		await h.call("search/map", { site: "shop", source: "google", property: "" });
		expect(h.sites.items.get("shop")).toMatchObject({ gscProperty: "" });
		await expect(h.call("search/map", { source: "google", property: "example.com" })).rejects.toMatchObject({ code: "invalid_property" });
		expect(validProperty("google", "sc-domain:example.com")).toBe(true);
		expect(validProperty("google", "https://example.com")).toBe(false);
		expect(validProperty("google", "javascript:alert(1)")).toBe(false);
		expect(validProperty("bing", "https://example.com")).toBe(true);
	});

	it("test reports the property, or the provider status without a body echo", async () => {
		expect(await (await harness()).call("search/test", {})).toMatchObject({ ok: true, result: { found: true, permissionLevel: "siteOwner" } });
		const denied = await harness({ status: () => 403 });
		// The sites list is not a query; force the failure on the property call through sync instead.
		expect(await denied.call("search/test", {})).toMatchObject({ ok: true });
		await denied.call("search/sync", { source: "google" });
		const st = await denied.call("search/status");
		expect(st.sources[0]).toMatchObject({ status: "error", lastError: "Search Console answered 403 (PERMISSION_DENIED)." });
	});

	it("no secret appears in any route output", async () => {
		const h = await harness();
		const { url } = await h.call("search/oauth/start", {});
		await h.call("search/oauth/exchange", { code: "4/x", state: new URL(url).searchParams.get("state") });
		await h.call("search/properties", {});
		await h.call("search/test", {});
		await h.call("search/sync", {});
		await h.call("search/status", {});
		await h.call("search/backfill", { action: "start", from: "2026-01-01", to: "2026-01-02" });
		for (const out of h.outputs) for (const s of SECRETS) expect(out).not.toContain(s);
		// The KV holds no token either.
		for (const { value } of await h.env.kv.list("search:")) for (const s of SECRETS) expect(JSON.stringify(value)).not.toContain(s);
	});
});

describe("Search Overview annotations", () => {
	it("shows the annotations matching the Search filters only", async () => {
		const { answer } = await import("../src/routes/data.js");
		const { clearReportCache } = await import("../src/query/reports/index.js");
		clearReportCache();
		const env = await schemaDb();
		const ts = Date.UTC(2026, 2, 5, 12) / 1000;
		const items = [
			{ id: "q1", data: { site: "default", ts, kind: "manual", text: "Blue widgets launch", scope: { v: 1, query: [{ op: "is", value: "blue widgets" }] } } },
			{ id: "q2", data: { site: "default", ts, kind: "manual", text: "Red widgets launch", scope: { v: 1, query: [{ op: "is", value: "red widgets" }] } } },
			{ id: "p1", data: { site: "default", ts, kind: "manual", text: "Other page rewrite", scope: { v: 1, path: [{ op: "is", value: "/other" }] } } },
		];
		const annotations = { query: async () => ({ items, hasMore: false }), get: async () => null };
		const run = (report: "search_overview" | "timeseries", filters: Array<{ dim: string; op: string; values: string[] }>) =>
			answer(
				{ db: async () => env.db, settings: async () => googleSettings({ siteTimezone: "UTC" }), now: () => T0 / 1000 },
				{ input: {}, storage: { annotations } },
				{ report, query: { from: "2026-03-01", to: "2026-03-07", filters: filters as never, compare: "none", granularity: "auto" }, withAnnotations: true },
			);
		const texts = (r: Awaited<ReturnType<typeof run>>) => ((r.data.annotations ?? []) as Array<{ text: string }>).map((a) => a.text);
		const search = await run("search_overview", [{ dim: "query", op: "is", values: ["blue widgets"] }, { dim: "page", op: "is", values: ["/widgets"] }]);
		expect(texts(search)).toEqual(["Blue widgets launch"]);
		// A query scope is for Search charts only.
		expect(texts(await run("timeseries", []))).toEqual(["Other page rewrite"]);
	});
});

describe("backfill over a hole in the stored days", () => {
	it("a missing stretch between old days and the sync window is refilled, by days and by a named range", async () => {
		const env = await schemaDb();
		const settings = normalizeSettings({ siteTimezone: "UTC", backfillDays: 90 });
		const ins = (day: string) =>
			env.db.run("INSERT OR IGNORE INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [settings.siteId, "google", day, "", "", "", "", 1, 1, 1, 0]);
		// Stored before a three week outage and in the sync window after it; 2026-10-19 to 2026-11-08 are missing. Today is 2026-11-16.
		for (const d of ["2026-10-01", "2026-10-18", "2026-11-09", "2026-11-15"]) await ins(d);
		const svc = searchService({ db: async () => env.db, settings: async () => settings, now: () => Date.parse("2026-11-16T12:00:00Z") });
		const b = { id: settings.siteId, kind: "local" as const };
		const byDays = await svc.start({ kv: new MemoryKv() } as never, b, "google", settings, { days: 90 });
		expect(byDays).toMatchObject({ stored: false, backfill: { from: "2026-08-18", to: "2026-11-08" } });
		const byRange = await svc.start({ kv: new MemoryKv() } as never, b, "google", settings, { from: "2026-10-19", to: "2026-11-08" });
		expect(byRange).toMatchObject({ stored: false, backfill: { from: "2026-10-19", to: "2026-11-08" } });
		// Every day before the sync window stored: nothing starts.
		for (let d = "2026-08-18"; d <= "2026-11-08"; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) await ins(d);
		expect(await svc.start({ kv: new MemoryKv() } as never, b, "google", settings, { days: 90 })).toMatchObject({ stored: true, backfill: null });
	});
});
