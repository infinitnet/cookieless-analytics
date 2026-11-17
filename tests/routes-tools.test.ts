/** Tool routes: agent tester, channel reclassification, rollup now, purge, delete all. */
import { beforeEach, describe, expect, it } from "vitest";
import type { UserAgentRule } from "../src/agents/rules.js";
import { BUILTIN_CHANNEL_RULES, buildChannelRules, type ChannelRule } from "../src/core/channels.js";
import { zonedToEpoch } from "../src/core/time.js";
import { KV_WATERMARK } from "../src/query/rollup.js";
import { QuerySchema } from "../src/query/filters.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { KV_CURSOR } from "../src/query/retention.js";
import { DeleteAllBody, RollupNowBody, type ToolsCtx, toolRoutes } from "../src/routes/tools.js";
import type { Settings } from "../src/settings.js";
import { seed, seedSearch } from "./fixtures/seed.js";
import { dayInt } from "../src/db/dialect.js";
import { CHROME_UA, cloneSite, GOOGLEBOT_UA, schemaDb, sitesColl } from "./helpers.js";
import { purgeKey, purgeSearch, purgeSite, STALE_SECONDS } from "../src/query/purge.js";
import { invalidateRegistry } from "../src/multisite/registry.js";

describe("tool routes", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	let agentRules: UserAgentRule[] = [];
	let channelRules: ChannelRule[] = BUILTIN_CHANNEL_RULES;
	const routes = () =>
		toolRoutes({
			db: async () => env.db,
			settings: async () => settings,
			agentRules: async () => agentRules,
			channelRules: async () => channelRules,
			goals: async () => [{ name: "Signup", type: "event", match: "is", value: "signup" }],
			now: () => zonedToEpoch("2026-03-13", 12, "UTC"),
		});
	const call = (name: keyof ReturnType<typeof routes>, input?: unknown) => routes()[name].handler({ input, kv: env.kv } as ToolsCtx) as Promise<Record<string, unknown>>;
	const channels = () => env.raw.prepare("SELECT channel, COUNT(*) AS n FROM ca_sessions GROUP BY channel ORDER BY channel").all();

	beforeEach(async () => {
		env = await schemaDb();
		settings = { ...(await seed(env, "UTC")), rawRetentionDays: 90 };
		await seedSearch(env);
		agentRules = [];
		channelRules = BUILTIN_CHANNEL_RULES;
		invalidateRegistry();
	});

	it("all need plugins:manage", () => {
		for (const r of Object.values(routes())) expect(r.permission).toBe("plugins:manage");
	});

	it("test-agent shows the classification and the matching rule", async () => {
		expect(await call("tools/test-agent", { ua: GOOGLEBOT_UA })).toMatchObject({ audience: "robot", category: "search_engine", matched: "builtin", rule: null });
		expect(await call("tools/test-agent", { ua: CHROME_UA })).toMatchObject({ audience: "human", matched: "none" });
		agentRules = [{ id: "mine", pattern: "chrome/142", mode: "contains", action: "robot", category: "monitoring" }];
		expect(await call("tools/test-agent", { ua: CHROME_UA })).toMatchObject({ audience: "robot", botId: "mine", matched: "user_rule", rule: { id: "mine" } });
	});

	it("reclassify-channels recomputes channels from stored fields and is stable", async () => {
		const before = channels();
		expect(await call("tools/reclassify-channels", {})).toMatchObject({ updated: 0, done: true, cursor: null });
		expect(channels()).toEqual(before);
		channelRules = buildChannelRules([{ id: "p", channel: "Partners", any: [{ source: "^google$" }, { refList: "search" }], priority: -1 }]);
		const r = await call("tools/reclassify-channels", {});
		// Organic Search (3 per day + P2) and Paid Search (2 per day) sessions in the raw window: 9 + 1 + 6.
		expect(r).toMatchObject({ updated: 16, done: true });
		expect((r.scanned as number) > 16).toBe(true);
		const after = Object.fromEntries((channels() as Array<{ channel: string; n: number }>).map((x) => [x.channel, x.n]));
		expect(after.Partners).toBe(16);
		// Last year's sessions are outside the raw window and keep their channel.
		expect(after["Organic Search"]).toBe(1);
		expect(after["Paid Search"]).toBe(1);
	});

	it("reclassify returns the stored days it changed; storing them again makes summary and detailed answers agree", async () => {
		const rc = (summary: boolean) => ({ db: env.db, site: "default", settings, now: zonedToEpoch("2026-03-13", 12, "UTC"), goals: [], funnels: {}, annotations: [], ...(summary ? { rawFrom: "2026-03-13", summaryThrough: "2026-03-11" } : {}) });
		const ch = async (summary: boolean) => {
			clearReportCache();
			return (await runReport(rc(summary), { report: "channels", query: QuerySchema.parse({ from: "2026-03-10", to: "2026-03-11" }), params: {}, limit: 100 })).data.rows;
		};
		for (let i = 0; i < 20 && (await env.kv.get(KV_WATERMARK)) !== "2026-03-11"; i++) await call("tools/rollup-now");
		expect(await ch(true)).toEqual(await ch(false));
		channelRules = buildChannelRules([{ id: "p", channel: "Partners", any: [{ source: "^google$" }, { refList: "search" }], priority: -1 }]);
		const r = (await call("tools/reclassify-channels", {})) as { stored: string[] };
		expect(r.stored).toEqual(["2026-03-09", "2026-03-10", "2026-03-11"]);
		expect(await ch(true)).not.toEqual(await ch(false));
		await call("tools/rollup-now", { from: r.stored[0], to: r.stored.at(-1) });
		expect(await ch(true)).toEqual(await ch(false));
	});

	it("reclassify also returns the day of an order placed after midnight in a changed visit", async () => {
		env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, channel, source, ref_host) VALUES ('default', 'yyyyyyyyyyyyyyyyyyyy', 'v', '2026-03-05', 23, 0, 0, 1800, 1, 'Organic Search', 'google', 'www.google.com')").run();
		env.raw.prepare("INSERT INTO ca_events (site, id, day, ts, sday, sid, name, val, cur) VALUES ('default', 'o-late', 20260306, 0, '2026-03-05', 'yyyyyyyyyyyyyyyyyyyy', 'purchase', 20, 'EUR')").run();
		await env.kv.set(KV_WATERMARK, "2026-03-11");
		channelRules = buildChannelRules([{ id: "p", channel: "Partners", any: [{ source: "^google$" }, { refList: "search" }], priority: -1 }]);
		const r = (await call("tools/reclassify-channels", {})) as { stored: string[] };
		expect(r.stored).toEqual(expect.arrayContaining(["2026-03-05", "2026-03-06"]));
	});

	it("reclassify keeps a click-id channel when neither a click id nor a UTM tag was stored", async () => {
		env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, channel, source) VALUES ('default', 'zzzzzzzzzzzzzzzzzzzz', 'v', '2026-03-12', 0, 0, 0, 1800, 1, 'Paid Search', '(direct)')").run();
		await call("tools/reclassify-channels", {});
		expect((env.raw.prepare("SELECT channel FROM ca_sessions WHERE sid = 'zzzzzzzzzzzzzzzzzzzz'").get() as { channel: string }).channel).toBe("Paid Search");
	});

	it("rollup-now refuses days before the raw window so their rollup is not wiped", async () => {
		await expect(call("tools/rollup-now", { from: "2025-03-01", to: "2025-03-12" })).rejects.toMatchObject({ code: "raw_gone" });
	});

	it("purge starts a fresh cycle so changed settings apply at once", async () => {
		await call("tools/purge");
		settings = { ...settings, searchRetentionDays: 90 };
		env.raw.prepare("INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device) VALUES ('default', 'google', '2025-01-01', '', '', '', '')").run();
		const r = await call("tools/purge");
		expect((r.deleted as Record<string, number>).search).toBeGreaterThan(0);
	});

	it("rollup-now runs a tick or an explicit range of at most 31 days", async () => {
		// Open days (today and yesterday until it closes) are never stored, by a tick or by a range.
		const tick = await call("tools/rollup-now");
		expect(tick.days).not.toContain("2026-03-12");
		expect(tick.watermark as string <= "2026-03-11").toBe(true);
		const range = await call("tools/rollup-now", { from: "2026-03-10", to: "2026-03-13" });
		expect(range.days).toEqual(["2026-03-10", "2026-03-11"]);
		expect(range.rows as number).toBeGreaterThan(0);
		expect(RollupNowBody.safeParse({ from: "2026-01-01", to: "2026-03-01" }).success).toBe(false);
		expect(RollupNowBody.safeParse({ from: "2026-03-02", to: "2026-03-01" }).success).toBe(false);
		expect(RollupNowBody.safeParse({ from: "2026-03-01" }).success).toBe(false);
		// The admin button sends an empty object.
		expect(RollupNowBody.safeParse({}).success).toBe(true);
		const empty = await call("tools/rollup-now", {});
		expect(empty.days).not.toContain("2026-03-13");
	});

	it("rollup-now with a range stops at the profile's requests and returns the day to continue from", async () => {
		settings = { ...settings, capacityProfile: "small" };
		const first = await call("tools/rollup-now", { from: "2026-03-10", to: "2026-03-13" });
		expect(first).toMatchObject({ days: ["2026-03-10"], next: "2026-03-11" });
		const second = await call("tools/rollup-now", { from: first.next, to: "2026-03-13" });
		expect(second).toMatchObject({ days: ["2026-03-11"], next: null });
		settings = { ...settings, capacityProfile: "standard" };
		expect(await call("tools/rollup-now", { from: "2026-03-10", to: "2026-03-13" })).toMatchObject({ days: ["2026-03-10", "2026-03-11"], next: null });
	});

	it("rollup-now continues inside a day with several sites (next and after) and ends", async () => {
		settings = { ...settings, capacityProfile: "small" };
		cloneSite(env.raw, "client-b");
		cloneSite(env.raw, "client-c");
		const done: string[] = [];
		let body: Record<string, unknown> = { from: "2026-03-10", to: "2026-03-11" };
		for (let i = 0; i < 20; i++) {
			const r = (await call("tools/rollup-now", body)) as { sites: string[]; next: string | null; after: string | null };
			done.push(...r.sites);
			if (!r.next) break;
			body = { from: r.next, to: "2026-03-11", ...(r.after ? { after: r.after } : {}) };
		}
		// Three sites on two days, one site-day per call on small: six calls, each site-day once.
		expect(done.sort()).toEqual(["client-b", "client-b", "client-c", "client-c", "default", "default"]);
		const stored = env.raw.prepare("SELECT site, day FROM ca_rollup WHERE dim = 'all' AND seg = '' AND day IN ('2026-03-10', '2026-03-11') ORDER BY site, day").all();
		expect(stored).toHaveLength(6);
		// With a site, only that site.
		const one = (await call("tools/rollup-now", { from: "2026-03-10", to: "2026-03-10", site: "default" })) as { sites: string[] };
		expect(one.sites).toEqual(["default"]);
	});

	it("purge runs one retention tick", async () => {
		const r = await call("tools/purge");
		expect(r).toMatchObject({ day: "2026-03-13", done: true });
		expect(await env.kv.get(KV_CURSOR)).toMatchObject({ day: "2026-03-13" });
	});

	it("delete-all needs the typed confirmation and removes every fact row of the site", async () => {
		expect(DeleteAllBody.safeParse({ confirm: "delete" }).success).toBe(false);
		await expect(call("tools/delete-all", {})).rejects.toMatchObject({ code: "confirm_required" });
		await call("tools/rollup-now");
		env.raw.prepare("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260312, 'reload', 1)").run();
		env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews) VALUES ('other', 'x', 'v', '2026-03-12', 0, 0, 0, 1800, 1)").run();
		let r = await call("tools/delete-all", { confirm: "DELETE" });
		for (let i = 0; i < 20 && !r.done; i++) r = await call("tools/delete-all", { confirm: "DELETE" });
		expect(r.done).toBe(true);
		for (const t of ["ca_rollup", "ca_aliases", "ca_search_daily", "ca_events", "ca_srv", "ca_drops"]) expect(env.count(t), t).toBe(0);
		expect(env.count("ca_sessions")).toBe(1);
		expect(await env.kv.get(purgeKey("default"))).toBeNull();
		// Another site still has rows, so the database-wide state stays.
		expect(await env.kv.get(KV_WATERMARK)).not.toBeNull();
		r = await call("tools/purge-site", { site: "other", confirm: "DELETE" });
		expect(r).toMatchObject({ site: "other", done: true });
		expect(env.count("ca_sessions")).toBe(0);
		expect(await env.kv.get(KV_WATERMARK)).toBeNull();
		expect(env.count("ca_drops")).toBe(0);
	});

	it("purge-site removes exactly one site's rows in chunks and resumes from its cursor after a crash", async () => {
		cloneSite(env.raw, "blog");
		await seedSearch(env, "blog");
		const rev = env.raw.prepare("INSERT INTO ca_revenue_daily (site, day, dim, key, cur, orders, revenue, sessions) VALUES (?, ?, 'all', '', 'USD', 1, 10, 1)");
		for (const site of ["blog", "default"]) for (const d of ["2026-03-11", "2026-03-12"]) rev.run(site, d);
		const blogRows = (t: string) => (env.raw.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE site = 'blog'`).get() as { n: number }).n;
		const localBefore = Object.fromEntries(["ca_sessions", "ca_events", "ca_srv", "ca_search_daily", "ca_revenue_daily"].map((t) => [t, env.count(t) - blogRows(t)]));
		const visits = blogRows("ca_sessions");
		expect(visits).toBeGreaterThan(5);
		expect(blogRows("ca_srv")).toBeGreaterThan(0);
		// A crash after the first chunk: the KV write of the cursor happened, the next call resumes.
		const failing = { ...env.db, run: async (sql: string, p?: unknown[]) => { if (calls++ >= 1) throw new Error("crash"); return env.db.run(sql, p as never); } };
		let calls = 0;
		await expect(purgeSite(failing, env.kv, "blog", { chunkRows: 5 })).rejects.toThrow("crash");
		expect(await env.kv.get(purgeKey("blog"))).toMatchObject({ step: 0, deleted: { sessions: 5 } });
		expect(blogRows("ca_sessions")).toBe(visits - 5);
		let r = await purgeSite(env.db, env.kv, "blog", { chunkRows: 5, maxChunks: 3 });
		expect(r.done).toBe(false);
		for (let i = 0; i < 200 && !r.done; i++) r = await purgeSite(env.db, env.kv, "blog", { chunkRows: 5, maxChunks: 3 });
		expect(r.done).toBe(true);
		expect(r.deleted.sessions).toBe(visits);
		for (const t of ["ca_sessions", "ca_events", "ca_srv", "ca_aliases", "ca_rollup", "ca_search_daily", "ca_revenue_daily"]) expect(blogRows(t), t).toBe(0);
		for (const [t, n] of Object.entries(localBefore)) expect(env.count(t), t).toBe(n);
		expect(await env.kv.get(purgeKey("blog"))).toBeNull();
	});

	it("purge-site starts over from an abandoned cursor instead of skipping tables", async () => {
		cloneSite(env.raw, "blog");
		const NOW = 2_000_000_000;
		await env.kv.set(purgeKey("blog"), { step: 1, deleted: { sessions: 0 }, at: NOW - STALE_SECONDS - 1 });
		let r = await purgeSite(env.db, env.kv, "blog", { now: NOW });
		for (let i = 0; i < 50 && !r.done; i++) r = await purgeSite(env.db, env.kv, "blog", { now: NOW });
		expect((env.raw.prepare("SELECT COUNT(*) AS n FROM ca_sessions WHERE site = 'blog'").get() as { n: number }).n).toBe(0);
		// A fresh cursor is resumed.
		cloneSite(env.raw, "blog");
		await env.kv.set(purgeKey("blog"), { step: 1, deleted: {}, at: NOW - 10 });
		await purgeSite(env.db, env.kv, "blog", { now: NOW });
		expect((env.raw.prepare("SELECT COUNT(*) AS n FROM ca_sessions WHERE site = 'blog'").get() as { n: number }).n).toBeGreaterThan(0);
	});

	it("purge-site accepts a deleted site while its delete cursor remains", async () => {
		await env.kv.set(purgeKey("gone"), { step: 4, deleted: {}, at: zonedToEpoch("2026-03-13", 12, "UTC") });
		await expect(call("tools/purge-site", { site: "gone", confirm: "DELETE" })).resolves.toMatchObject({ site: "gone", done: true });
		expect(await env.kv.get(purgeKey("gone"))).toBeNull();
	});

	it("purge-site needs a site id and the confirmation; an unknown site without rows is refused", async () => {
		await expect(call("tools/purge-site", { site: "blog" })).rejects.toMatchObject({ code: "confirm_required" });
		await expect(call("tools/purge-site", { site: "shop", confirm: "DELETE" })).rejects.toMatchObject({ code: "unknown_site" });
	});

	it("purge-search deletes one site's rows of one source only", async () => {
		await seedSearch(env, "blog");
		const n = (site: string, source: string) => (env.raw.prepare("SELECT COUNT(*) AS n FROM ca_search_daily WHERE site = ? AND source = ?").get(site, source) as { n: number }).n;
		const keep = [n("default", "google"), n("default", "bing"), n("blog", "bing")];
		const r = await purgeSearch(env.db, "blog", "google", { chunkRows: 3, maxChunks: 2 });
		expect(r.done).toBe(false);
		let d = r.deleted;
		for (let i = 0; i < 50; i++) {
			const x = await purgeSearch(env.db, "blog", "google", { chunkRows: 3, maxChunks: 2 });
			d += x.deleted;
			if (x.done) break;
		}
		expect(n("blog", "google")).toBe(0);
		expect([n("default", "google"), n("default", "bing"), n("blog", "bing")]).toEqual(keep);
		await expect(call("tools/purge-search", { source: "bing" })).resolves.toMatchObject({ site: "default", done: true });
		expect(n("default", "bing")).toBe(0);
		expect(d).toBeGreaterThan(0);
	});

	it("reclassify-channels and rollup-now bind the site", async () => {
		cloneSite(env.raw, "blog", "day = '2026-03-11'");
		const r = (await call("tools/rollup-now", { from: "2026-03-11", to: "2026-03-11" })) as { sites: string[] };
		expect(r.sites).toEqual(["blog", "default"]);
		await expect(call("tools/reclassify-channels", { site: "blog" })).rejects.toMatchObject({ code: "unknown_site" });
		const sites = sitesColl([{ id: "blog" }]);
		invalidateRegistry();
		const res = await routes()["tools/reclassify-channels"].handler({ input: { site: "blog" }, kv: env.kv, storage: { sites } } as ToolsCtx);
		expect(res).toMatchObject({ done: true });
		expect((res as { scanned: number }).scanned).toBe((env.raw.prepare("SELECT COUNT(*) AS n FROM ca_sessions WHERE site = 'blog'").get() as { n: number }).n);
	});
});

describe("tools/revenue-void", () => {
	it("counts, then nulls a spoofed order; the report drops it and one revenue run restates the rollup", async () => {
		const { runRevenue, rollupRevenue } = await import("../src/query/rollup.js");
		const { runReport, clearReportCache } = await import("../src/query/reports/index.js");
		const { QuerySchema } = await import("../src/query/filters.js");
		const env = await schemaDb();
		const now = zonedToEpoch("2026-03-13", 12, "UTC");
		const settings = { siteId: "default", siteTimezone: "UTC", rawRetentionDays: 30, engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 } as Settings;
		const day = "2026-03-10";
		const ins = env.raw.prepare("INSERT INTO ca_events (site, id, day, ts, name, path, val, cur) VALUES ('default', ?, ?, 0, 'purchase', '/', ?, 'USD')");
		ins.run("ok1", dayInt(day), 49.9);
		ins.run("spoof", dayInt(day), 1_000_000_000);
		await rollupRevenue({ db: env.db, site: "default", settings, goals: [] }, day);
		const sites = sitesColl([{ id: "shop", hosts: ["shop.example.com"] }]);
		invalidateRegistry();
		const routes = toolRoutes({ db: async () => env.db, settings: async () => settings, agentRules: async () => [], channelRules: async () => [], goals: async () => [], now: () => now });
		const call = (input: unknown) => routes["tools/revenue-void"].handler({ input, kv: env.kv, storage: { sites } } as ToolsCtx);
		expect(routes["tools/revenue-void"].permission).toBe("plugins:manage");
		expect(await call({ day, name: "purchase", minValue: 1_000_000 })).toEqual({ site: "default", day, matched: 1, voided: 0 });
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_events WHERE val IS NOT NULL").get()).toEqual({ n: 2 });
		expect(await call({ day, name: "purchase", minValue: 1_000_000, confirm: true })).toEqual({ site: "default", day, matched: 1, voided: 1 });
		expect(env.raw.prepare("SELECT val, cur FROM ca_events WHERE id = 'spoof'").get()).toEqual({ val: null, cur: null });
		clearReportCache();
		const rc = { db: env.db, site: "default", settings, now, goals: [], funnels: {}, annotations: [], defaultCurrency: "USD" };
		const r = await runReport(rc, { report: "revenue", query: QuerySchema.parse({ from: day, to: day }) });
		expect(r.data.totals).toMatchObject({ revenue: 49.9, orders: 1 });
		// The reconcile covers closed days, up to the rollup watermark.
		await env.kv.set(KV_WATERMARK, "2026-03-11");
		await runRevenue({ db: env.db, settings, goals: async () => [] }, env.kv, now, "2026-02-11");
		expect(env.raw.prepare("SELECT revenue, orders FROM ca_revenue_daily WHERE day = ? AND dim = 'all' AND seg = ''").all(day)).toEqual([{ revenue: 49.9, orders: 1 }]);
		// Outside the raw window, an unknown site, a missing field.
		await expect(call({ day: "2026-01-01", name: "purchase", minValue: 0 })).rejects.toMatchObject({ code: "outside_raw_window" });
		await expect(call({ day: "2026-03-14", name: "purchase", minValue: 0 })).rejects.toMatchObject({ code: "outside_raw_window" });
		await expect(call({ site: "blog", day, name: "purchase", minValue: 0 })).rejects.toMatchObject({ code: "unknown_site" });
		expect(await call({ site: "shop", day, name: "purchase", minValue: 0 })).toEqual({ site: "shop", day, matched: 0, voided: 0 });
		await expect(call({ day, name: "purchase" })).rejects.toThrow();
	});
});
