/**
 * Site routing (plugin option `databases`): two sites on two fake D1 bindings. Ingest, the queue consumer, drop
 * counters, the cron tasks, the reports and the Sites page each use the site's own database and never another
 * one; a missing binding fails that site's writes (503, `write_error`) without touching the other databases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLUGIN_ID } from "../src/contract.js";
import { resetWriteGuard } from "../src/core/apply.js";
import { drops } from "../src/core/drops.js";
import { validateIngest } from "../src/core/ids.js";
import { QueueSink, type QueueLike, routedSink } from "../src/core/queue-sink.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { zonedToEpoch } from "../src/core/time.js";
import { type DbFor, eachTarget, ensureHostSchema, factsDb, setPluginFacts, statePrefix, stateKv } from "../src/db/facts.js";
import { optionsKv } from "../src/db/options-kv.js";
import { TABLES } from "../src/db/schema.js";
import cookielessAnalytics from "../src/index.js";
import { parseOptions } from "../src/multisite/config.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { QuerySchema } from "../src/query/filters.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { KV_CURSOR, type RetentionCursor, runRetention } from "../src/query/retention.js";
import { KV_WATERMARK, lastClosedDay, runRollup } from "../src/query/rollup.js";
import { handleQueue, type QueuedMessage } from "../src/queue.js";
import { inRoute } from "../src/routes/in.js";
import { siteRoutes, type SitesCtx, type SummaryRow } from "../src/routes/sites.js";
import { normalizeSettings } from "../src/settings.js";
import { generateTraffic, type Traffic } from "./capacity.helpers.js";
import { type FakeD1, fakeD1, tableNames } from "./d1.helpers.js";
import { eventRequest, memoryDb, sitesColl } from "./helpers.js";
import { ctx } from "./routes.helpers.js";

const START = zonedToEpoch("2026-06-01", 0, "UTC");
const NOW = zonedToEpoch("2026-06-13", 3, "UTC");
const S = normalizeSettings({});
const ROUTE = { default: "CA_DB", sites: { shop: "CA_DB2" } };

/** The host database: only EmDash's `options` table, with the plugin KV over it. */
function hostDb() {
	const m = memoryDb();
	m.raw.exec("CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT)");
	return { ...m, kv: optionsKv(m.db, PLUGIN_ID) };
}

/** Host, CA_DB (the default database) and CA_DB2 (the shop's), with the plugin's resolver over them. */
function setup(env: Record<string, FakeD1> = { CA_DB: fakeD1(), CA_DB2: fakeD1() }, route: Parameters<typeof factsDb>[0] = ROUTE) {
	const host = hostDb();
	const dbFor = factsDb(route, async () => host.db, async () => env);
	return { host, env, dbFor };
}

/** Generated traffic of one site through the recorder and the routed sink. */
async function drive(dbFor: DbFor, kv: ReturnType<typeof optionsKv>, site: string, traffic: Traffic) {
	resetCounters();
	const db = await dbFor(S.siteId);
	const sink = routedSink(dbFor, S, kv, async () => null);
	for (const a of traffic.actions) {
		const body = validateIngest(a.body);
		if (!body) throw new Error("invalid generated body");
		await recordClientEvent({ db, kv, settings: S, now: a.at, site, sink }, body, requestInfo(eventRequest(a.body, { "cf-connecting-ip": a.ip }, a.url)));
	}
}

const sites = (d: FakeD1, table = "ca_sessions") => (d.raw.prepare(`SELECT DISTINCT site FROM ${table} ORDER BY site`).all() as Array<{ site: string }>).map((r) => r.site);
const sum = (d: FakeD1, sql: string) => Number((d.raw.prepare(sql).get() as { n: number | null }).n ?? 0);

const shopTraffic = () => generateTraffic({ pageviews: 300, seed: 31, start: START, spanSeconds: 10 * 86_400 - 1 });
const mainTraffic = () => generateTraffic({ pageviews: 200, seed: 32, start: START, spanSeconds: 10 * 86_400 - 1 });

beforeEach(() => {
	resetCounters();
	resetWriteGuard();
	drops.clear();
	clearReportCache();
	invalidateRegistry();
});
afterEach(() => {
	vi.useRealTimers();
	drops.route = undefined;
});

describe("databases option", () => {
	it("is validated when the plugin is created and reaches createPlugin through the descriptor", () => {
		expect(parseOptions({ databases: ROUTE })).toEqual({ sites: [], databases: ROUTE });
		expect(parseOptions({ databases: { sites: { shop: "CA_DB2" } } })).toEqual({ sites: [], databases: { sites: { shop: "CA_DB2" } } });
		expect(cookielessAnalytics({ databases: ROUTE }).options).toEqual({ databases: ROUTE });
		const bad: Array<[unknown, RegExp]> = [
			["CA_DB", /must be an object/],
			[{ sites: { shop: "CA_DB2" }, default: "1DB" }, /default must name a D1 or Hyperdrive binding/],
			[{}, /sites must be an object/],
			[{ sites: ["CA_DB2"] }, /sites must be an object/],
			[{ sites: { Shop: "CA_DB2" } }, /site id "Shop"/],
			[{ sites: { all: "CA_DB2" } }, /site id "all"/],
			[{ sites: { shop: "CA-DB2" } }, /site shop must name a D1 or Hyperdrive binding/],
			[{ sites: { shop: 2 } }, /site shop must name a D1 or Hyperdrive binding/],
		];
		for (const [databases, msg] of bad) expect(() => parseOptions({ databases }), JSON.stringify(databases)).toThrow(msg);
		expect(() => parseOptions({ database: { binding: "CA_DB" }, databases: ROUTE })).toThrow(/database or databases, not both/);
	});
});

describe("the resolver", () => {
	it("routes each site to its binding, the others to the default; one schema per binding; KV state per binding", async () => {
		const { env, dbFor, host } = setup();
		const shop = await dbFor("shop");
		expect(await dbFor("shop")).toBe(shop);
		expect(await dbFor("blog")).toBe(await dbFor());
		expect(await dbFor("default")).not.toBe(shop);
		expect(dbFor.binding("shop")).toBe("CA_DB2");
		expect(dbFor.binding("blog")).toBeNull();
		expect(dbFor.targets().map((t) => t.binding)).toEqual(["CA_DB", "CA_DB2"]);
		// Each own database got its tables once; the host none.
		for (const d of [env.CA_DB, env.CA_DB2] as FakeD1[]) expect(tableNames(d.raw).sort()).toEqual([...TABLES, "ca_meta"].sort());
		expect(tableNames(host.raw)).toEqual(["options"]);
		const before = (env.CA_DB2 as FakeD1).stats.statements;
		await dbFor("shop");
		expect((env.CA_DB2 as FakeD1).stats.statements).toBe(before);
		// Cron state: the default database keeps the plain keys, the routed one its prefix.
		await dbFor.kv(host.kv, "blog").set(KV_WATERMARK, "2026-06-01");
		await dbFor.kv(host.kv, "shop").set(KV_WATERMARK, "2026-06-02");
		expect(await host.kv.get(KV_WATERMARK)).toBe("2026-06-01");
		expect(await host.kv.get(`${statePrefix("CA_DB2")}${KV_WATERMARK}`)).toBe("2026-06-02");
		expect((await dbFor.kv(host.kv, "shop").list("rollup:")).map((e) => e.key)).toEqual([KV_WATERMARK]);
	});

	it("without a default the unlisted sites stay on the host database; a site routed to the default binding shares it", async () => {
		const host = memoryDb().db;
		const d1 = fakeD1();
		const dbFor = factsDb({ sites: { shop: "CA_DB2", blog: "CA_DB" }, default: "CA_DB" }, async () => host, async () => ({ CA_DB: d1, CA_DB2: fakeD1() }));
		expect(dbFor.binding("blog")).toBeNull();
		expect(dbFor.targets()).toHaveLength(2);
		const hostOnly = factsDb({ sites: { shop: "CA_DB2" } }, async () => host, async () => ({ CA_DB2: fakeD1() }));
		expect(await hostOnly("default")).toBe(host);
		expect(await hostOnly()).toBe(host);
		expect(hostOnly.targets().map((t) => t.binding)).toEqual([null, "CA_DB2"]);
	});
});

describe("two sites on two databases", () => {
	it("ingest, drops, rollup, retention and reports of each site stay in its own database, both ways", async () => {
		const { host, env, dbFor } = setup();
		const a = env.CA_DB as FakeD1;
		const b = env.CA_DB2 as FakeD1;
		const main = mainTraffic();
		const shop = shopTraffic();
		await drive(dbFor, host.kv, "default", main);
		await drive(dbFor, host.kv, "shop", shop);
		expect(sites(a)).toEqual(["default"]);
		expect(sites(b)).toEqual(["shop"]);
		expect(sum(a, "SELECT SUM(pageviews) AS n FROM ca_sessions")).toBe(main.counts.pageviews);
		expect(sum(b, "SELECT SUM(pageviews) AS n FROM ca_sessions")).toBe(shop.counts.pageviews);

		// Drop counters of both sites in one isolate: each flushes to its site's database.
		drops.route = dbFor;
		drops.add("default", "2026-06-12", "invalid", 2);
		drops.add("shop", "2026-06-12", "bot", 5);
		expect(await drops.flush(await dbFor())).toBe(2);
		expect(sum(a, "SELECT SUM(n) AS n FROM ca_drops WHERE site = 'default'")).toBe(2);
		expect(sum(b, "SELECT SUM(n) AS n FROM ca_drops WHERE site = 'shop'")).toBe(5);
		expect(sites(a, "ca_drops")).toEqual(["default"]);
		expect(sites(b, "ca_drops")).toEqual(["shop"]);

		// Cron: rollup per database until done, each with its own watermark.
		const rollup = () => eachTarget(dbFor, host.kv, (db, kv) => runRollup({ db, settings: S, goals: async () => [] }, kv, NOW));
		for (let i = 0; i < 30; i++) await rollup();
		expect(sites(a, "ca_rollup")).toEqual(["default"]);
		expect(sites(b, "ca_rollup")).toEqual(["shop"]);
		const closed = lastClosedDay(NOW, "UTC");
		expect(await host.kv.get(KV_WATERMARK)).toBe(closed);
		expect(stateKv(host.kv, "shop")).toBe(host.kv); // no plugin resolver recorded yet: plain KV
		expect(await dbFor.kv(host.kv, "shop").get(KV_WATERMARK)).toBe(closed);

		// Reports: detailed and summary answers of each site, each from its own database.
		for (const [site, t] of [["default", main], ["shop", shop]] as const) {
			const report = { db: await dbFor(site), site, settings: S, now: NOW, goals: [], funnels: {}, annotations: [], defaultCurrency: "USD" };
			const q = { report: "overview" as const, query: QuerySchema.parse({ from: "2026-06-01", to: "2026-06-10" }), limit: 100 };
			const detailed = await runReport(report, q);
			clearReportCache();
			const summary = await runReport({ ...report, rawFrom: "2030-01-01" }, q);
			clearReportCache();
			expect(detailed.data.totals?.pageviews).toBe(t.counts.pageviews);
			expect(summary.data.totals).toEqual(detailed.data.totals);
		}

		// Retention per database: each cursor and storage estimate is its database's, under its own key.
		const rs = { ...S, rawRetentionDays: 7 };
		for (let i = 0; i < 100; i++) await eachTarget(dbFor, host.kv, (db, kv) => runRetention(db, kv, rs, NOW));
		const ca = await host.kv.get<RetentionCursor>(KV_CURSOR);
		const cb = await dbFor.kv(host.kv, "shop").get<RetentionCursor>(KV_CURSOR);
		expect(ca?.storage?.measured).toBe(true);
		expect(cb?.storage?.measured).toBe(true);
		expect(cb?.storage?.bytes).not.toBe(ca?.storage?.bytes);
		for (const d of [a, b]) expect(String((d.raw.prepare("SELECT MIN(day) AS d FROM ca_sessions").get() as { d: string }).d) >= "2026-06-06").toBe(true);

		// The host holds only options, the databases only analytics tables.
		expect(tableNames(host.raw)).toEqual(["options"]);
	});

	it("a cron task that fails on one database still runs on the other, then reports the failure", async () => {
		const { host, dbFor } = setup({ CA_DB: fakeD1() });
		const ran: Array<string | null> = [];
		const warned: string[] = [];
		await expect(
			eachTarget(
				dbFor,
				host.kv,
				async (db) => {
					await db.all("SELECT 1");
					ran.push("ok");
				},
				{ warn: (m) => void warned.push(m) },
			),
		).rejects.toThrow(/binding CA_DB2 does not exist/);
		expect(ran).toEqual(["ok"]);
		expect(warned).toHaveLength(1);
		expect(warned[0]).toMatch(/CA_DB2/);
	});
});

describe("a missing binding", () => {
	it("answers 503 and counts write_error for the routed site; nothing goes to the default or the host database", async () => {
		const a = fakeD1();
		const { host, dbFor } = setup({ CA_DB: a }, { default: "CA_DB", sites: { default: "CA_DB2" } });
		const routeEnv = {
			deps: async () => ({ db: await dbFor(S.siteId), kv: host.kv, settings: S, sink: routedSink(dbFor, S, host.kv, async () => null) }),
			after: () => {},
		};
		const req = eventRequest({ v: 1, t: "pv", sid: "aaaaaaaaaaaaaaaaaaaa", n: 1, h: "hhhhhhhhhhh1", u: "/a", r: "", w: 1440 });
		const res = await inRoute(routeEnv).handler(ctx(req, await req.clone().text(), host.kv));
		expect(res.status).toBe(503);
		expect(drops.rows().find((r) => r.reason === "write_error")?.n).toBeGreaterThanOrEqual(1);
		// The default database was never even opened.
		expect(a.stats.statements).toBe(0);
		expect(tableNames(host.raw)).toEqual(["options"]);
	});
});

describe("a linked host", () => {
	it("records into the local site's database, never the linked id's, and keeps the host stamp", async () => {
		// The linked id is routed elsewhere on purpose: routing by it would put the shop's page view into CA_DB.
		const a = fakeD1();
		const b = fakeD1();
		const { host, dbFor } = setup({ CA_DB: a, CA_DB2: b }, { default: "CA_DB", sites: { default: "CA_DB2", shop: "CA_DB" } });
		const settings = normalizeSettings({ siteOrigin: "https://example.com" });
		const sites = sitesColl([{ id: "shop", key: "llllllllllllllllllll", hosts: ["shop.example.net"] }]);
		(sites.items.get("shop") as { linked?: boolean }).linked = true;
		const tasks: Array<() => Promise<unknown>> = [];
		const routeEnv = {
			deps: async () => ({ db: await dbFor(settings.siteId), kv: host.kv, settings, now: NOW, sink: routedSink(dbFor, settings, host.kv, async () => null) }),
			after: (fn: () => Promise<unknown>) => void tasks.push(fn),
		};
		const send = async (body: Record<string, unknown>, origin: string | null, at: number) => {
			const req = eventRequest({ v: 1, t: "pv", n: 1, w: 1440, ...body }, { "cf-connecting-ip": "2001:db8:91::1", ...(origin ? { origin } : {}) }, "https://example.com/_/e");
			const res = await inRoute({ ...routeEnv, deps: async () => ({ ...(await routeEnv.deps()), now: at }) }).handler({ ...ctx(req, await req.clone().text(), host.kv), requestMeta: { ip: "2001:db8:91::1" }, storage: { sites } });
			for (const t of tasks.splice(0)) await t();
			expect(res.status).toBe(204);
		};
		await send({ sid: "a".repeat(20), h: "h00000000011", u: "/product", r: "" }, null, NOW);
		await send({ sid: "b".repeat(20), h: "h00000000012", u: "/cart", r: "https://example.com/product", k: "llllllllllllllllllll" }, "https://shop.example.net", NOW + 30);
		expect(b.raw.prepare("SELECT site, pageviews, ref_host FROM ca_sessions").all()).toEqual([{ site: "default", pageviews: 2, ref_host: null }]);
		expect(b.raw.prepare("SELECT h.value ->> 'hs' AS hs FROM ca_sessions s CROSS JOIN json_each(s.hits) h ORDER BY h.key").all()).toEqual([{ hs: null }, { hs: "shop.example.net" }]);
		// CA_DB (the linked id's binding and the default) was never opened, and the host stays without tables.
		expect(a.stats.statements).toBe(0);
		expect(tableNames(host.raw)).toEqual(["options"]);
		expect(drops.rows()).toEqual([]);
	});
});

describe("a missing binding of the main site", () => {
	it("does not stop the client sites on a healthy database (the schema check is per database)", async () => {
		const a = fakeD1();
		const { host, dbFor } = setup({ CA_DB: a }, { default: "CA_DB", sites: { default: "CA_DB2" } });
		const shop = shopTraffic();
		resetCounters();
		const sink = routedSink(dbFor, S, host.kv, async () => null);
		const ready = () => ensureHostSchema(dbFor, host.kv);
		for (const x of shop.actions) {
			const body = validateIngest(x.body);
			if (!body) throw new Error("invalid generated body");
			await recordClientEvent({ db: await dbFor(S.siteId), kv: host.kv, settings: S, now: x.at, site: "shop", sink, ready }, body, requestInfo(eventRequest(x.body, { "cf-connecting-ip": x.ip }, x.url)));
		}
		expect(sum(a, "SELECT SUM(pageviews) AS n FROM ca_sessions WHERE site = 'shop'")).toBe(shop.counts.pageviews);
		// The host is no database of this option: nothing to migrate there.
		expect(tableNames(host.raw)).toEqual(["options"]);
	});
});

describe("cron budget", () => {
	it("the databases of one invocation share the profile's requests", async () => {
		const { host, dbFor } = setup();
		await drive(dbFor, host.kv, "default", mainTraffic());
		await drive(dbFor, host.kv, "shop", shopTraffic());
		const small = { ...S, capacityProfile: "small" as const };
		let statements = 0;
		const shares: number[] = [];
		await eachTarget(dbFor, host.kv, async (db, kv, share) => {
			shares.push(share(40));
			statements += (await runRollup({ db, settings: small, goals: async () => [] }, kv, NOW, { requests: share(40) })).statements;
		});
		expect(shares).toEqual([20, 20]);
		// Both databases had closed days to store, and together they stayed inside one run's 40 requests.
		expect(statements).toBeGreaterThan(10);
		expect(statements).toBeLessThanOrEqual(40);
	});
});

describe("the queue consumer", () => {
	it("routes each message to its site's database; a missing binding retries only that site's messages", async () => {
		const host = hostDb();
		const a = fakeD1();
		const b = fakeD1();
		const DB = fakeD1();
		const sent: unknown[] = [];
		const q: QueueLike = { send: async (body) => void sent.push(JSON.parse(JSON.stringify(body))) };
		// The producer side: both sites through a queue sink (its direct fallback is never used here).
		const producer = factsDb(ROUTE, async () => host.db, async () => ({ CA_DB: fakeD1(), CA_DB2: fakeD1() }));
		for (const [site, t] of [["default", mainTraffic()], ["shop", shopTraffic()]] as const) {
			resetCounters();
			const db = await producer(site);
			for (const x of t.actions) {
				const body = validateIngest(x.body);
				if (!body) throw new Error("invalid generated body");
				await recordClientEvent({ db, kv: host.kv, settings: S, now: x.at, site, sink: new QueueSink(q, { ingest: async () => { throw new Error("no fallback"); } }) }, body, requestInfo(eventRequest(x.body, { "cf-connecting-ip": x.ip }, x.url)));
			}
		}
		const deliver = () =>
			sent.map((body, i) => ({ body, timestamp: new Date(i), attempts: 1, acked: false, retried: false, ack() { this.acked = true; }, retry() { this.retried = true; } }) as QueuedMessage & { acked: boolean; retried: boolean });
		const shopOf = (m: QueuedMessage) => (m.body as { site: string }).site === "shop";

		// CA_DB2 missing: the default site's messages are applied, the shop's retried, none written elsewhere.
		// Applied on the day of the traffic (the consumer refuses messages whose day before is closed).
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.parse("2026-06-01T01:00:00Z"));
		const first = deliver();
		await handleQueue({ messages: first }, { DB, CA_DB: a }, { databases: ROUTE });
		expect(first.filter((m) => !shopOf(m)).every((m) => m.acked)).toBe(true);
		expect(first.filter(shopOf).every((m) => m.retried && !m.acked)).toBe(true);
		expect(sites(a)).toEqual(["default"]);
		expect(DB.stats.statements).toBe(0);

		const second = deliver().filter(shopOf);
		await handleQueue({ messages: second }, { DB, CA_DB: a, CA_DB2: b }, { databases: ROUTE });
		expect(second.every((m) => m.acked)).toBe(true);
		expect(sites(b)).toEqual(["shop"]);
		expect(sites(a)).toEqual(["default"]);
		expect(DB.stats.statements).toBe(0);
	});
});

describe("the Sites page", () => {
	it("reads each site from its own database and never joins across databases", async () => {
		const { host, env, dbFor } = setup();
		setPluginFacts(dbFor);
		const a = env.CA_DB as FakeD1;
		const b = env.CA_DB2 as FakeD1;
		await dbFor("shop");
		await dbFor("default");
		const roll = (d: FakeD1, site: string, day: string, pv: number) =>
			d.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, pageviews, sessions, visitors, bounces, engaged) VALUES (?, ?, 'all', '', ?, ?, ?, 0, 0)").run(site, day, pv, pv, pv);
		roll(a, "default", "2026-06-05", 100);
		roll(b, "shop", "2026-06-05", 300);
		// Rows of a site in the wrong database (left over from before routing) are never read.
		roll(a, "shop", "2026-06-05", 9999);
		roll(b, "default", "2026-06-05", 9999);
		a.raw.prepare("INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, pageviews) VALUES ('shop', ?, 'x', 'v', 0, 0, 0, 0, 77)").run("2026-06-13");
		b.raw.prepare("INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, pageviews) VALUES ('shop', ?, 'y', 'v', 0, 0, 0, 0, 5)").run("2026-06-13");
		await host.kv.set(KV_WATERMARK, "2026-06-10");
		await dbFor.kv(host.kv, "shop").set(KV_WATERMARK, "2026-06-09");

		const routes = siteRoutes({ settings: async () => ({ siteId: "default", siteTimezone: "UTC", siteOrigin: "" }), db: (site) => dbFor(site), now: () => NOW });
		const sc = { kv: host.kv, storage: { sites: sitesColl([{ id: "shop", label: "Shop" }]) } } as unknown as SitesCtx;
		const r = (await routes["sites/summary"].handler({ ...sc, input: { from: "2026-06-01", to: "2026-06-08" } } as SitesCtx)) as { rows: SummaryRow[]; watermark: string | null };
		expect(r.rows.map((x) => [x.id, x.pageviews])).toEqual([
			["shop", 300],
			["default", 100],
		]);
		// The oldest watermark of the two databases.
		expect(r.watermark).toBe("2026-06-09");
		const list = (await routes["sites/list"].handler({ ...sc, input: { counts: true } } as SitesCtx)) as { sites: Array<{ id: string; client?: { pageviewsToday?: number } }> };
		expect(list.sites.find((x) => x.id === "shop")?.client?.pageviewsToday).toBe(5);
	});
});
