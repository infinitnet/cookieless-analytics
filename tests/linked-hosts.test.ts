/**
 * Linked hosts end to end: a client site linked to this site (a shop on another host) stores its events under
 * this site's id with the host recorded, so the visitor key and the visit continue across the hosts, the hop is
 * never a referral, and shop revenue attributes to the entry channel. Synthetic traffic of the generator.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { drops as counters } from "../src/core/drops.js";
import { resetCounters } from "../src/core/recorder.js";
import { scriptResponse } from "../src/client/serve.js";
import { bindSite, HOST_SEEN_PREFIX, invalidateRegistry, LINKED_HOSTS_KEY, linkedHostsOf, resetHostSeen } from "../src/multisite/registry.js";
import { keyRoutes } from "../src/routes/keys.js";
import { inRoute } from "../src/routes/in.js";
import { type HostEntry, siteRoutes, type SitesCtx } from "../src/routes/sites.js";
import { normalizeSettings } from "../src/settings.js";
import { generateTraffic, type TrafficAction } from "./capacity.helpers.js";
import { dropsOf } from "./drops.helpers.js";
import { eventRequest, schemaDb, sitesColl } from "./helpers.js";
import { ctx, fakeEnv } from "./routes.helpers.js";

const MAIN = "example.com"; // the generator's install host: https://example.com/_/e
const SHOP = "shop.example.net";
const BLOG = "blog.example.net";
const SHOP_KEY = "llllllllllllllllllll";
const BLOG_KEY = "bbbbbbbbbbbbbbbbbbbb";
const SETTINGS = { siteOrigin: `https://${MAIN}` };

type Env = Awaited<ReturnType<typeof schemaDb>>;

function registryColl(linked = true) {
	const sites = sitesColl([
		{ id: "shop", key: SHOP_KEY, hosts: [SHOP] },
		{ id: "blog", key: BLOG_KEY, hosts: [BLOG] },
	]);
	(sites.items.get("shop") as { linked?: boolean }).linked = linked;
	return sites;
}

/** One request of the page script through the `in` route, as the browser sends it. */
async function send(env: Env, sites: ReturnType<typeof sitesColl>, a: TrafficAction, origin: string | null) {
	const f = fakeEnv(env, SETTINGS, a.at);
	const req = eventRequest(a.body, { "cf-connecting-ip": a.ip, ...(origin ? { origin: `https://${origin}` } : {}) }, a.url);
	const res = await inRoute(f.env).handler({ ...ctx(req, await req.clone().text(), env.kv), requestMeta: { ip: a.ip }, storage: { sites } });
	await f.runAfter();
	expect(res.status).toBe(204);
}

/**
 * The generator's traffic, with every event a purchase (one order each). `hop`: inside each visit the page views
 * after the entry alternate shop, main, shop: each lands with a fresh id (no fragment crosses hosts), the
 * previous page as referrer, and the shop's key and Origin. Engagement and events follow their page view.
 */
function traffic(hop: boolean): Array<{ a: TrafficAction; origin: string | null }> {
	const t = generateTraffic({ pageviews: 400, seed: 21, rich: true });
	const where = new Map<string, { sid: string; host: string }>(); // hit id -> page
	const byPage = new Map<string, string>(); // at | path -> hit id (events carry the visit's sid, a second tab has its own)
	const index = new Map<string, number>(); // page views per visit sid so far
	const last = new Map<string, string>(); // visit sid -> URL of its last page
	const out: Array<{ a: TrafficAction; origin: string | null }> = [];
	let orders = 0;
	const at = (host: string, body: Record<string, unknown>, a: TrafficAction) => ({
		a: { ...a, body: { ...body, ...(host === SHOP ? { k: SHOP_KEY } : {}) } },
		origin: host === MAIN ? null : host,
	});
	for (const a of t.actions) {
		const b = a.body as Record<string, unknown> & { t: string; sid: string; h?: string; u?: string };
		if (b.t === "pv") {
			const i = index.get(b.sid) ?? 0;
			index.set(b.sid, i + 1);
			byPage.set(`${a.at}|${b.u}`, b.h as string);
			const host = hop && i > 0 && b.n !== 1 ? (i % 2 === 1 ? SHOP : MAIN) : MAIN;
			const moved = hop && i > 0 && b.n !== 1;
			const sid = moved ? `${b.h}zzzzzzzz` : b.sid;
			where.set(b.h as string, { sid, host });
			const body = moved ? { ...b, sid, n: 1, r: last.get(b.sid) } : b;
			last.set(b.sid, `https://${host}${b.u}`);
			out.push(at(host, body, a));
		} else if (b.t === "en") {
			const p = where.get(b.h as string) as { sid: string; host: string };
			out.push(at(p.host, { ...b, sid: p.sid }, a));
		} else {
			const p = where.get(byPage.get(`${a.at - 3}|${b.u}`) as string) as { sid: string; host: string };
			out.push(at(p.host, { ...b, sid: p.sid, name: "purchase", val: 20, cur: "EUR", oid: `o-${orders++}` }, a));
		}
	}
	return out;
}

async function run(hop: boolean) {
	resetCounters();
	counters.windowMs = 0;
	invalidateRegistry();
	resetHostSeen();
	const env = await schemaDb();
	const sites = registryColl();
	const actions = traffic(hop);
	for (const { a, origin } of actions) await send(env, sites, a, origin);
	return { env, actions };
}

const VISIT_COLS = "sid, channel, source, ref_host, entry_path, exit_path, pageviews, events, engaged_ms, visible_ms, host";
const visits = (env: Env) => env.raw.prepare(`SELECT ${VISIT_COLS} FROM ca_sessions ORDER BY sid`).all();
const revenueByChannel = (env: Env) =>
	env.raw.prepare("SELECT s.channel AS channel, COUNT(*) AS orders, SUM(e.val) AS revenue FROM ca_events e JOIN ca_sessions s ON s.site = e.site AND s.day = e.sday AND s.sid = e.sid GROUP BY s.channel ORDER BY s.channel").all();
const entryHosts = (env: Env) =>
	env.raw.prepare("SELECT h.value ->> 'hs' AS hs, COUNT(*) AS n FROM ca_sessions s CROSS JOIN json_each(s.hits) h GROUP BY 1 ORDER BY 1").all() as Array<{ hs: string | null; n: number }>;

describe("linked hosts, end to end on generated traffic", () => {
	it("a visit moving between the main host and the shop is one visit of one visitor, with the entry channel, no self-referral and the host recorded", async () => {
		const base = await run(false);
		const hop = await run(true);
		const shopPages = hop.actions.filter(({ a, origin }) => origin === SHOP && (a.body as { t: string }).t !== "en").length;
		expect(shopPages).toBeGreaterThan(50);

		// Same visits, field for field: the hops changed no first touch, no entry, no count and no total.
		const sessions = generateTraffic({ pageviews: 400, seed: 21, rich: true }).counts.sessions;
		expect(visits(base.env)).toHaveLength(sessions);
		expect(visits(hop.env)).toEqual(visits(base.env));
		// One visitor per visit (each generated visitor has one address), all stored under this site.
		expect(hop.env.raw.prepare("SELECT COUNT(DISTINCT vkey) AS v, COUNT(*) AS n, COUNT(DISTINCT site) AS s, MIN(site) AS site FROM ca_sessions").get()).toEqual({ v: sessions, n: sessions, s: 1, site: "default" });
		// No visit names its own hosts as referrer.
		expect(hop.env.raw.prepare("SELECT COUNT(*) AS n FROM ca_sessions WHERE ref_host IN (?, ?)").get(MAIN, SHOP)).toEqual({ n: 0 });
		// The host of each shop page view and event is on its entry; main host entries carry none.
		expect(entryHosts(hop.env)).toEqual([
			{ hs: null, n: expect.any(Number) },
			{ hs: SHOP, n: shopPages },
		]);
		expect(entryHosts(base.env).map((r) => r.hs)).toEqual([null]);
		// Shop orders attribute to the visit's entry channel exactly as if the visit had stayed on one host.
		const rev = revenueByChannel(hop.env) as Array<{ orders: number }>;
		expect(rev).toEqual(revenueByChannel(base.env));
		expect(rev.reduce((n, r) => n + r.orders, 0)).toBe(hop.env.count("ca_events"));
		expect(await dropsOf(hop.env)).toEqual({});
		// Nothing landed under the linked site's own id.
		expect(hop.env.raw.prepare("SELECT COUNT(*) AS n FROM ca_events WHERE site <> 'default'").get()).toEqual({ n: 0 });
	});
});

describe("linked hosts, single cases", () => {
	let env: Env;
	const T0 = Date.parse("2026-06-10T09:00:00Z") / 1000;
	const IP = "2001:db8:77::1";
	const pv = (sid: string, h: string, u: string, r: string, at: number, extra: Record<string, unknown> = {}): TrafficAction => ({
		at,
		ip: IP,
		url: `https://${MAIN}/_/e`,
		body: { v: 1, t: "pv", sid, n: 1, h, u, r, w: 1440, ...extra },
	});
	beforeEach(async () => {
		resetCounters();
		counters.windowMs = 0;
		invalidateRegistry();
		resetHostSeen();
		env = await schemaDb();
	});
	const rows = () => env.raw.prepare("SELECT site, channel, ref_host, host, pageviews FROM ca_sessions ORDER BY started, site").all();

	it("a new visit that starts on the shop from the main host, or on the main host from the shop, is Direct, not a referral", async () => {
		const sites = registryColl();
		await send(env, sites, pv("a".repeat(20), "h00000000001", "/cart", `https://${MAIN}/product`, T0, { k: SHOP_KEY }), SHOP);
		// Another visitor (another address), from the shop to the main host.
		await send(env, sites, { ...pv("b".repeat(20), "h00000000002", "/", `https://${SHOP}/thanks`, T0 + 10), ip: "2001:db8:78::1" }, null);
		expect(rows()).toEqual([
			{ site: "default", channel: "Direct", ref_host: null, host: SHOP, pageviews: 1 },
			{ site: "default", channel: "Direct", ref_host: null, host: MAIN, pageviews: 1 },
		]);
	});

	it("an unlinked client site is unchanged: its own id and visits, the main host is a referral, no entry host", async () => {
		const sites = registryColl();
		await send(env, sites, pv("c".repeat(20), "h00000000003", "/", "", T0), null);
		await send(env, sites, pv("d".repeat(20), "h00000000004", "/post", `https://${MAIN}/`, T0 + 30, { k: BLOG_KEY }), BLOG);
		expect(rows()).toEqual([
			{ site: "default", channel: "Direct", ref_host: null, host: MAIN, pageviews: 1 },
			{ site: "blog", channel: "Referral", ref_host: MAIN, host: BLOG, pageviews: 1 },
		]);
		expect(entryHosts(env).map((r) => r.hs)).toEqual([null]);
	});

	it("without the link the shop is a client site of its own: two visits, and the main host is a referral", async () => {
		const sites = registryColl(false);
		await send(env, sites, pv("e".repeat(20), "h00000000005", "/", "https://search.example.net/", T0), null);
		await send(env, sites, pv("f".repeat(20), "h00000000006", "/cart", `https://${MAIN}/`, T0 + 30, { k: SHOP_KEY }), SHOP);
		expect(rows()).toEqual([
			{ site: "default", channel: expect.any(String), ref_host: "search.example.net", host: MAIN, pageviews: 1 },
			{ site: "shop", channel: "Referral", ref_host: MAIN, host: SHOP, pageviews: 1 },
		]);
	});

	it("a server-reported order with the shop page's id attaches to the visit and its entry channel", async () => {
		const sites = registryColl();
		const MAIN_SID = "g".repeat(20);
		const SHOP_SID = "h".repeat(20);
		await send(env, sites, pv(MAIN_SID, "h00000000007", "/?utm_source=news&utm_medium=email", "", T0), null);
		await send(env, sites, pv(SHOP_SID, "h00000000008", "/checkout", `https://${MAIN}/`, T0 + 40, { k: SHOP_KEY }), SHOP);
		const r = await recordAgentEvents({ db: env.db, kv: env.kv, settings: normalizeSettings(SETTINGS), now: T0 + 120 }, "default", [{ name: "purchase", val: 49.9, cur: "EUR", oid: "A-1", sid: SHOP_SID }]);
		expect(r).toMatchObject({ accepted: 1, rejected: [] });
		expect(rows()).toEqual([{ site: "default", channel: "Email", ref_host: null, host: MAIN, pageviews: 2 }]);
		expect(revenueByChannel(env)).toEqual([{ channel: "Email", orders: 1, revenue: 49.9 }]);
	});

	it("a paused linked site is refused like any paused site", async () => {
		const sites = registryColl();
		(sites.items.get("shop") as { paused: boolean }).paused = true;
		await send(env, sites, pv("i".repeat(20), "h00000000009", "/", "", T0, { k: SHOP_KEY }), SHOP);
		expect(env.count("ca_sessions")).toBe(0);
		expect(await dropsOf(env)).toEqual({ site_paused: 1 });
	});

	it("stamps the last event time per host only when a linked site exists, at most every 10 minutes", async () => {
		const stamps = () => env.kv.list(HOST_SEEN_PREFIX);
		await send(env, registryColl(false), pv("j".repeat(20), "h00000000010", "/", "", T0), null);
		expect(await stamps()).toEqual([]);
		invalidateRegistry();
		const sites = registryColl();
		await send(env, sites, pv("k".repeat(20), "h00000000011", "/a", "", T0 + 1), null);
		await send(env, sites, pv("l".repeat(20), "h00000000012", "/b", `https://${MAIN}/a`, T0 + 2, { k: SHOP_KEY }), SHOP);
		await send(env, sites, pv("m".repeat(20), "h00000000013", "/c", `https://${SHOP}/b`, T0 + 3), null);
		expect((await stamps()).map((e) => e.key).sort()).toEqual([`${HOST_SEEN_PREFIX}${MAIN}`, `${HOST_SEEN_PREFIX}${SHOP}`]);
		// A host name that is neither linked nor `siteOrigin`'s (any name that routes to the Worker) is never stamped.
		resetHostSeen();
		await send(env, sites, { ...pv("n".repeat(20), "h00000000014", "/", "", T0 + 4), url: "https://attacker.example.org/_/e" }, null);
		expect((await stamps()).map((e) => e.key)).not.toContain(`${HOST_SEEN_PREFIX}attacker.example.org`);
	});

	it("a linked site id is not a site of its own: site binding and API key restrictions refuse it", async () => {
		const sites = registryColl();
		await expect(bindSite("shop", "default", sites)).rejects.toMatchObject({ code: "unknown_site", message: expect.stringContaining("linked") });
		expect(await bindSite("blog", "default", sites)).toMatchObject({ id: "blog", kind: "client" });
		const keys = keyRoutes({ now: () => T0, settings: async () => ({ siteId: "default" }) }) as unknown as Record<string, { handler(c: unknown): Promise<unknown> }>;
		const create = (site: string) => keys["keys/create"]?.handler({ input: { label: "shop backend", scopes: ["write:events"], sites: [site] }, kv: env.kv, storage: { sites, api_keys: sitesColl([]) } });
		await expect(create("shop")).rejects.toMatchObject({ code: "unknown_site" });
	});
});

describe("linked hosts in the sites routes and the page script", () => {
	let env: Env;
	const NOW = Date.parse("2026-06-10T09:00:00Z") / 1000;
	beforeEach(async () => {
		invalidateRegistry();
		env = await schemaDb();
	});
	const routes = () => siteRoutes({ settings: async () => ({ siteId: "default", siteTimezone: "UTC", siteOrigin: `https://${MAIN}` }), db: async () => env.db, now: () => NOW }) as unknown as Record<string, { handler(c: SitesCtx): Promise<any> }>;
	const call = (sites: ReturnType<typeof sitesColl>, name: string, input?: unknown) =>
		routes()[name]?.handler({ input, request: new Request(`https://admin.${MAIN}/_emdash/api/x`), kv: env.kv, storage: { sites } });

	it("saving a link publishes the linked hosts for the page script; the linked site leaves the site switcher and the summary", async () => {
		const sites = sitesColl([{ id: "blog", key: BLOG_KEY, hosts: [BLOG] }]);
		await call(sites, "sites/save", { create: true, id: "shop", label: "Shop", hosts: [SHOP], linked: true });
		expect(await env.kv.get(LINKED_HOSTS_KEY)).toEqual([SHOP]);
		expect(await linkedHostsOf(env.kv)).toEqual([SHOP]);
		const list = await call(sites, "sites/list", {});
		expect(list.sites.map((s: { id: string }) => s.id)).toEqual(["default", "blog"]);
		expect(list.linked.map((s: { id: string }) => s.id)).toEqual(["shop"]);
		const sum = await call(sites, "sites/summary", { from: "2026-06-01", to: "2026-06-10" });
		expect(sum.rows.map((r: { id: string }) => r.id).sort()).toEqual(["blog", "default"]);
		// The served script carries the list, so pages on those hosts count links to the main host as not outbound.
		const body = await scriptResponse(normalizeSettings({}), new Request(`https://${MAIN}/_/e.js`), await linkedHostsOf(env.kv)).text();
		expect(body).toContain(`"l":["${SHOP}"]`);
		// Unlinking or deleting removes them.
		await call(sites, "sites/save", { id: "shop", label: "Shop", hosts: [SHOP], linked: false });
		expect(await env.kv.get(LINKED_HOSTS_KEY)).toEqual([]);
		await call(sites, "sites/save", { id: "shop", label: "Shop", hosts: [SHOP], linked: true });
		await env.kv.set(`${HOST_SEEN_PREFIX}${SHOP}`, 1_000);
		await env.kv.set(`${HOST_SEEN_PREFIX}${MAIN}`, 1_000);
		await call(sites, "sites/delete", { id: "shop", deleteData: false });
		expect(await env.kv.get(LINKED_HOSTS_KEY)).toEqual([]);
		// The stamp of the host no longer linked is gone; the site's own host keeps its stamp.
		expect((await env.kv.list(HOST_SEEN_PREFIX)).map((e) => e.key)).toEqual([`${HOST_SEEN_PREFIX}${MAIN}`]);
	});

	it("sites/hosts lists this site's hosts and the linked hosts with their last event time", async () => {
		const sites = sitesColl([
			{ id: "shop", key: SHOP_KEY, hosts: [SHOP], label: "Shop" },
			{ id: "blog", key: BLOG_KEY, hosts: [BLOG] },
		]);
		(sites.items.get("shop") as { linked?: boolean }).linked = true;
		await env.kv.set(`${HOST_SEEN_PREFIX}${SHOP}`, 1_000);
		await env.kv.set(`${HOST_SEEN_PREFIX}${MAIN}`, 2_000);
		await env.kv.set(`${HOST_SEEN_PREFIX}stale.example.org`, 3_000);
		const r = (await call(sites, "sites/hosts")) as { hosts: HostEntry[] };
		expect(r.hosts).toEqual([
			{ host: `admin.${MAIN}`, kind: "own", lastEvent: null },
			{ host: MAIN, kind: "own", lastEvent: 2_000 },
			{ host: SHOP, kind: "linked", site: "Shop", paused: false, lastEvent: 1_000 },
		]);
	});
});
