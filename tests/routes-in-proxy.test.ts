/**
 * Proxy mode of the event route: a server proxy on a client site's own host forwards browser posts with the
 * site's proxy secret in `X-EC-Proxy-Key` and the visitor's address in `X-EC-Client-IP`. Every clock is fixed:
 * the route's own time comes from the injected `now`, the registry window from a faked `Date`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drops as counters } from "../src/core/drops.js";
import { forwardedFacts, MAX_FORWARDED_IP_LENGTH, resetCounters } from "../src/core/recorder.js";
import { ensureSchema } from "../src/db/schema.js";
import { newProxySecret } from "../src/keys/proxy-secret.js";
import { hashSecret } from "../src/keys/token.js";
import { invalidateRegistry, PROXY_SNAPSHOT_MAX_AGE_MS } from "../src/multisite/registry.js";
import type { RouteEnv } from "../src/routes/env.js";
import { inRoute } from "../src/routes/in.js";
import { siteRoutes, type SitesCtx } from "../src/routes/sites.js";
import { normalizeSettings } from "../src/settings.js";
import { dropsOf } from "./drops.helpers.js";
import { entryRows, eventRequest, GOOGLEBOT_UA, MemoryKv, memoryDb, meteredDb, schemaDb, sitesColl } from "./helpers.js";
import { ctx, fakeEnv } from "./routes.helpers.js";

const NOW = 1_773_360_030; // 2026-03-13T00:00:30Z: 30 s into a minute
const BLOG_KEY = "kkkkkkkkkkkkkkkkkkkk";
const SHOP_KEY = "llllllllllllllllllll";
const NEWS_KEY = "nnnnnnnnnnnnnnnnnnnn";
const PAUSED_KEY = "pppppppppppppppppppp";
const ORIGIN = "https://blog.example.net";
const PV = { v: 1, t: "pv", sid: "aaaaaaaaaaaaaaaaaaaa", n: 1, h: "hhhhhhhhhhh1", u: "/hello", r: "", k: BLOG_KEY };
/** The proxy server's own address, as the install sees it. */
const PROXY_IP = "192.0.2.10";

type Env = Awaited<ReturnType<typeof schemaDb>>;
let db: Env;
let sites: ReturnType<typeof sitesColl>;
/** Loads of the sites registry (one `query` each): the only storage the proxy check depends on. */
let reads = 0;

beforeEach(async () => {
	resetCounters();
	counters.windowMs = 0;
	invalidateRegistry();
	db = await schemaDb();
	sites = sitesColl([
		{ id: "blog", key: BLOG_KEY, hosts: ["blog.example.net", "www.blog.example.net"] },
		{ id: "news", key: NEWS_KEY, hosts: ["news.example.net"] },
		{ id: "shop", key: SHOP_KEY, hosts: ["shop.example.net"] },
		{ id: "paused", key: PAUSED_KEY, hosts: ["paused.example.net"], paused: true },
	]);
	(sites.items.get("shop") as { linked?: boolean }).linked = true;
	const query = sites.query.bind(sites);
	reads = 0;
	sites.query = (o) => {
		reads++;
		return query(o);
	};
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** A proxy secret for `id`, written to the record as another isolate would leave it; this isolate reloads. */
async function secretOf(id = "blog", reload = true): Promise<string> {
	const { secret, hash } = await newProxySecret();
	Object.assign(sites.items.get(id) as object, { proxyHash: hash, proxyCreated: NOW - 1000 });
	if (reload) invalidateRegistry();
	return secret;
}

const admin = siteRoutes({ settings: async () => ({ siteId: "default", siteTimezone: "UTC", siteOrigin: "" }), now: () => NOW });
const manage = (name: "sites/proxy-secret" | "sites/save" | "sites/key" | "sites/list", input?: unknown) =>
	(admin[name].handler as (c: SitesCtx) => Promise<Record<string, unknown>>)({ input, kv: db.kv, storage: { sites }, request: new Request("https://example.org/_emdash/api/x") });

interface Sent {
	body?: Record<string, unknown>;
	/** The value of `X-EC-Proxy-Key`; absent: the public path. */
	key?: string | null;
	ip?: string | null;
	origin?: string | null;
	headers?: Record<string, string>;
	settings?: Record<string, unknown>;
	at?: number;
	cf?: object;
}
async function send(o: Sent = {}) {
	const f = fakeEnv(db, o.settings ?? {}, o.at ?? NOW);
	const headers: Record<string, string> = { "cf-connecting-ip": PROXY_IP, ...o.headers };
	if (o.origin !== null) headers.origin = o.origin ?? ORIGIN;
	if (o.key !== undefined && o.key !== null) headers["x-ec-proxy-key"] = o.key;
	if (o.ip !== null && o.key) headers["x-ec-client-ip"] = o.ip ?? "203.0.113.7";
	const req = eventRequest({ ...PV, ...o.body }, headers);
	if (o.cf) (req as unknown as { cf: object }).cf = o.cf;
	const res = await inRoute(f.env).handler({ ...ctx(req, await req.clone().text(), db.kv), requestMeta: { ip: PROXY_IP }, storage: { sites } });
	await f.runAfter();
	return res;
}
const sessions = () => db.raw.prepare("SELECT site, host, country, region FROM ca_sessions ORDER BY sid").all() as Array<{ site: string; host: string; country: string | null; region: string | null }>;
const header = (res: { headers: Array<[string, string]> }, name: string) => res.headers.find(([k]) => k === name)?.[1];
/** A fresh document of another visitor: its own session id and hit id. */
const doc = (i: number) => ({ sid: `${"s".repeat(17)}${String(i).padStart(3, "0")}`, h: `${"h".repeat(9)}${String(i).padStart(3, "0")}` });
const stored = () => db.count("ca_sessions") + entryRows(db.raw).length;

describe("proxy mode: the forwarded address", () => {
	it("two forwarded addresses with one user agent are two visits; the same address joins its visit", async () => {
		const key = await secretOf();
		await send({ key, ip: "203.0.113.7", body: doc(1) });
		await send({ key, ip: "198.51.100.9", body: doc(2) });
		expect(db.count("ca_sessions")).toBe(2);
		// A second full page load from the first address (a fresh document) continues that visit.
		await send({ key, ip: "203.0.113.7", body: { ...doc(3), u: "/next" }, at: NOW + 5 });
		expect(db.count("ca_sessions")).toBe(2);
		expect(db.raw.prepare("SELECT pageviews FROM ca_sessions ORDER BY pageviews").all()).toEqual([{ pageviews: 1 }, { pageviews: 2 }]);
		expect(await dropsOf(db)).toEqual({});
	});

	it("without the secret header the forwarding headers are never read: every visitor behind the proxy address is one visit", async () => {
		await secretOf();
		await send({ headers: { "x-ec-client-ip": "203.0.113.7", "x-ec-country": "FR" }, body: doc(1) });
		await send({ headers: { "x-ec-client-ip": "198.51.100.9", "x-ec-country": "DE" }, body: doc(2), at: NOW + 5 });
		expect(db.count("ca_sessions")).toBe(1);
		expect(sessions()[0]).toMatchObject({ site: "blog", country: null });
	});

	it("the public path stores the same rows and gives the same answer with and without the forwarding headers, on a site with a secret", async () => {
		await secretOf();
		const dump = () => JSON.stringify([db.raw.prepare("SELECT * FROM ca_sessions").all(), entryRows(db.raw), db.raw.prepare("SELECT * FROM ca_events").all()]);
		const cf = { country: "DE", region: "BE" };
		const plainRes = JSON.stringify(await send({ cf, settings: { captureRegion: true } }));
		const plain = dump();
		expect(sessions()[0]).toMatchObject({ country: "DE", region: "BE" });
		db.raw.exec("DELETE FROM ca_sessions");
		resetCounters();
		const res = await send({ cf, settings: { captureRegion: true }, headers: { "x-ec-client-ip": "198.51.100.9", "x-ec-country": "FR" } });
		expect(dump()).toBe(plain);
		expect(JSON.stringify(res)).toBe(plainRes);
		expect(await dropsOf(db)).toEqual({});
	});

	it("applies the excluded IP ranges to the forwarded address", async () => {
		const key = await secretOf();
		await send({ key, ip: "203.0.113.7", settings: { excludeIpPrefixes: "203.0.113.0/24" } });
		expect(db.count("ca_sessions")).toBe(0);
		expect(await dropsOf(db)).toEqual({ excluded_ip: 1 });
	});

	it.each([
		["missing", null],
		["empty", " "],
		["a list", "203.0.113.7, 198.51.100.9"],
		["not an address", "unknown"],
		["three octets", "1.2.3"],
		["an octet over 255", "999.1.1.1"],
		["colons only", "::::"],
		["with a port", "203.0.113.7:4711"],
		["longer than an address", `2001:db8:${"0:".repeat(20)}1`],
		["loopback", "127.0.0.1"],
		["IPv6 loopback", "::1"],
		["mapped loopback", "::ffff:127.0.0.1"],
		["hex mapped loopback", "::ffff:7f00:1"],
		["hex mapped loopback with leading zeros", "::ffff:7f00:0001"],
		["hex mapped loopback written in full", "0:0:0:0:0:ffff:7f00:1"],
		["mapped loopback written in full", "0:0:0:0:0:ffff:127.0.0.1"],
		["unspecified", "0.0.0.0"],
		["IPv6 unspecified", "::"],
		["hex mapped unspecified", "::ffff:0:0"],
		["a zone id", "fe80::1%eth0"],
		["a loopback with a zone id", "::1%lo"],
		["a global address with a zone id", "2001:db8::1%1"],
		["a list without a space", "203.0.113.7,198.51.100.9"],
		["a list with spaces only", "203.0.113.7 198.51.100.9"],
		["in brackets", "[2001:db8::1]"],
		["over 45 characters", `0000:0000:0000:0000:0000:ffff:203.000.113.0007`],
	])("a valid secret with an unusable address (%s) is dropped as invalid, never recorded under the proxy address", async (_n, ip) => {
		const key = await secretOf();
		const res = await send({ key, ip: null, ...(ip === null ? {} : { headers: { "x-ec-client-ip": ip } }) });
		expect(res.status).toBe(204);
		expect(stored()).toBe(0);
		expect(await dropsOf(db)).toEqual({ invalid: 1 });
	});

	it("a hex mapped address is its IPv4 address: two visitors are two visits, and the dotted form joins the same visit", async () => {
		const key = await secretOf();
		await send({ key, ip: "::ffff:cb00:7107", body: doc(1) });
		await send({ key, ip: "::ffff:c633:6409", body: doc(2) });
		expect(db.count("ca_sessions")).toBe(2);
		await send({ key, ip: "203.0.113.7", body: { ...doc(3), u: "/next" }, at: NOW + 5 });
		await send({ key, ip: "0:0:0:0:0:ffff:c633:6409", body: { ...doc(4), u: "/next" }, at: NOW + 6 });
		expect(db.count("ca_sessions")).toBe(2);
		expect(db.raw.prepare("SELECT pageviews FROM ca_sessions ORDER BY pageviews").all()).toEqual([{ pageviews: 2 }, { pageviews: 2 }]);
		expect(await dropsOf(db)).toEqual({});
	});

	it("the excluded IP ranges match a hex mapped address", async () => {
		const key = await secretOf();
		await send({ key, ip: "::ffff:cb00:7107", settings: { excludeIpPrefixes: "203.0.113.0/24" } });
		expect(db.count("ca_sessions")).toBe(0);
		expect(await dropsOf(db)).toEqual({ excluded_ip: 1 });
	});

	it("accepts the longest text form of an address (45 characters) and nothing longer", async () => {
		const key = await secretOf();
		const longest = "0000:0000:0000:0000:0000:ffff:203.000.113.007";
		expect(longest).toHaveLength(MAX_FORWARDED_IP_LENGTH);
		expect(MAX_FORWARDED_IP_LENGTH).toBe(45);
		const facts = (ip: string) => forwardedFacts(new Headers({ "x-ec-client-ip": ip }));
		expect(facts(longest)).toEqual({ ip: longest, country: null });
		expect(facts(` ${longest} `)).toEqual({ ip: longest, country: null });
		expect(facts(`0${longest}`)).toBeNull();
		await send({ key, ip: longest, body: doc(1) });
		await send({ key, ip: "203.0.113.7", body: { ...doc(2), u: "/next" }, at: NOW + 5 });
		expect(db.raw.prepare("SELECT pageviews FROM ca_sessions").all()).toEqual([{ pageviews: 2 }]);
	});

	it("accepts IPv6 and private addresses", async () => {
		const key = await secretOf();
		await send({ key, ip: "2001:db8:1:2::5", body: doc(1) });
		await send({ key, ip: "10.1.2.3", body: doc(2) });
		expect(db.count("ca_sessions")).toBe(2);
	});
});

describe("proxy mode: country and region", () => {
	it("takes the country from X-EC-Country, never from the proxy's own edge, and stores no region", async () => {
		const key = await secretOf();
		const cf = { country: "US", region: "Virginia" };
		const s = { captureRegion: true };
		await send({ key, cf, settings: s, headers: { "x-ec-country": "fr", "cf-ipcountry": "US" }, body: doc(1), ip: "203.0.113.1" });
		await send({ key, cf, settings: s, headers: { "cf-ipcountry": "US" }, body: doc(2), ip: "203.0.114.1" });
		await send({ key, cf, settings: s, headers: { "x-ec-country": "XX" }, body: doc(3), ip: "203.0.115.1" });
		await send({ key, cf, settings: s, headers: { "x-ec-country": "FRA" }, body: doc(4), ip: "203.0.116.1" });
		expect(sessions().map((r) => [r.country, r.region])).toEqual([["FR", null], [null, null], [null, null], [null, null]]);
	});
});

describe("proxy mode: the secret", () => {
	const refused: Array<[string, () => Promise<string>]> = [
		["an empty header", async () => ((await secretOf()), "")],
		["a malformed secret", async () => ((await secretOf()), "nope")],
		["a wrong secret", async () => ((await secretOf()), "A".repeat(43))],
		["the secret with one character changed", async () => {
			const s = await secretOf();
			return `${s.slice(0, 42)}${s.endsWith("A") ? "B" : "A"}`;
		}],
		["an API key token", async () => ((await secretOf()), `abcdefgh.${"A".repeat(43)}`)],
		["the hash instead of the secret", async () => hashSecret(await secretOf())],
		["any secret for a site that has none", async () => (await newProxySecret()).secret],
		["the secret of another site", async () => ((await secretOf("blog")), secretOf("news"))],
		["a secret removed through the sites route", async () => {
			const { secret } = await manage("sites/proxy-secret", { id: "blog" });
			await manage("sites/proxy-secret", { id: "blog", revoke: true });
			return secret as string;
		}],
		["the old secret after a new one was made through the sites route", async () => {
			const { secret } = await manage("sites/proxy-secret", { id: "blog" });
			await manage("sites/proxy-secret", { id: "blog" });
			return secret as string;
		}],
	];
	it.each(refused)("%s is refused: 204, nothing stored, counted as proxy_auth", async (_n, make) => {
		const res = await send({ key: await make() });
		expect(res).toMatchObject({ status: 204, body: null });
		expect(stored()).toBe(0);
		expect(await dropsOf(db)).toEqual({ proxy_auth: 1 });
		// The refusal is counted under the install's own site: the caller is not authenticated.
		expect(db.raw.prepare("SELECT site FROM ca_drops").all()).toEqual([{ site: "default" }]);
	});

	it("a secret made through the sites route works at once, and so does its replacement", async () => {
		const first = (await manage("sites/proxy-secret", { id: "blog" })).secret as string;
		expect((await send({ key: first, body: doc(1) })).status).toBe(204);
		const second = (await manage("sites/proxy-secret", { id: "blog" })).secret as string;
		await send({ key: second, body: doc(2), ip: "198.51.100.9" });
		expect(db.count("ca_sessions")).toBe(2);
		expect(await dropsOf(db)).toEqual({});
	});

	it("a secret is refused for a post without a site key (the install's own pages)", async () => {
		const key = await secretOf();
		const { k: _k, ...body } = PV;
		const f = fakeEnv(db, {}, NOW);
		const req = eventRequest(body, { "x-ec-proxy-key": key, "x-ec-client-ip": "203.0.113.7" });
		await inRoute(f.env).handler({ ...ctx(req, await req.clone().text(), db.kv), storage: { sites } });
		await f.runAfter();
		expect(stored()).toBe(0);
		expect(await dropsOf(db)).toEqual({ proxy_auth: 1 });
	});

	it("the origin rule, the pause and an unknown site key come first; a bot is answered before all of it", async () => {
		const key = await secretOf();
		await secretOf("paused");
		await send({ key, origin: null });
		await send({ key, origin: "https://other.example.net" });
		await send({ key, body: { k: PAUSED_KEY }, origin: "https://paused.example.net" });
		await send({ key, body: { k: "uuuuuuuuuuuuuuuuuuuu" } });
		await send({ key, headers: { "user-agent": GOOGLEBOT_UA } });
		expect(await dropsOf(db)).toEqual({ origin_rejected: 2, site_paused: 1, unknown_key: 1, bot: 1 });
	});

	it("a proxy secret grants no revenue authority: acceptClientRevenue off strips the value", async () => {
		const key = await secretOf();
		await send({ key });
		await send({ key, body: { t: "ev", name: "purchase", h: "eeeeeeeeeee1", u: "/thanks", val: 5, cur: "EUR", oid: "A1" }, settings: { acceptClientRevenue: false }, at: NOW + 1 });
		expect(entryRows(db.raw).filter((e) => e.kind === "ev")).toHaveLength(1);
		expect(db.count("ca_events")).toBe(0);
		expect(await dropsOf(db)).toEqual({ revenue_not_accepted: 1 });
	});
});

describe("proxy mode: linked hosts", () => {
	const SHOP = { k: SHOP_KEY };
	it("a linked host forwards with its own secret; the visit is the local site's, host kept", async () => {
		const key = await secretOf("shop");
		await send({ key, body: SHOP, origin: "https://shop.example.net" });
		expect(sessions()).toEqual([expect.objectContaining({ site: "default", host: "shop.example.net" })]);
		expect(await dropsOf(db)).toEqual({});
	});

	it("a linked host above proxyRateLimitPerMinute gets the 503 and the proxy_rate drop is counted under the local site", async () => {
		const key = await secretOf("shop");
		const s = { proxyRateLimitPerMinute: 60 };
		for (let i = 0; i < 60; i++) expect((await send({ key, settings: s, body: { ...SHOP, ...doc(i) }, origin: "https://shop.example.net", ip: `203.0.${i}.7` })).status).toBe(204);
		const over = await send({ key, settings: s, body: { ...SHOP, ...doc(60) }, origin: "https://shop.example.net", ip: "203.0.60.7" });
		expect([over.status, header(over, "retry-after")]).toEqual([503, "30"]);
		expect(await dropsOf(db)).toEqual({ proxy_rate: 1 });
		expect(db.raw.prepare("SELECT site FROM ca_drops").all()).toEqual([{ site: "default" }]);
		expect(db.raw.prepare("SELECT DISTINCT site FROM ca_sessions").all()).toEqual([{ site: "default" }]);
	});

	it("a client site's secret is refused for a linked host, and the linked host's secret for a client site", async () => {
		const blog = await secretOf("blog");
		const shop = await secretOf("shop");
		await send({ key: blog, body: SHOP, origin: "https://shop.example.net" });
		await send({ key: shop });
		expect(db.count("ca_sessions")).toBe(0);
		expect(await dropsOf(db)).toEqual({ proxy_auth: 2 });
	});
});

describe("proxy mode: no storage read and no statement of its own", () => {
	const SID = "aaaaaaaaaaaaaaaaaaaa";
	// A visit of two page views, each followed by the engagement update the script sends when the tab is hidden.
	const VISIT = [
		{ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/", r: "", n: 1, k: BLOG_KEY },
		{ v: 1, t: "en", sid: SID, h: "hhhhhhhhhhh1", d: 4000, e: 5000, s: 40, i: 1, x: 0, k: BLOG_KEY },
		{ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh2", u: "/b", k: BLOG_KEY },
		{ v: 1, t: "en", sid: SID, h: "hhhhhhhhhhh2", d: 3000, e: 3000, s: 80, i: 1, x: 1, k: BLOG_KEY },
	];

	/** Statements per request of `VISIT` on a metered database with the D1 limits, with or without the proxy headers. */
	async function statements(key: string | null) {
		resetCounters();
		const m = meteredDb();
		const kv = new MemoryKv();
		await ensureSchema(m.db, kv);
		const tasks: Array<() => Promise<unknown>> = [];
		const s = normalizeSettings({});
		const post = async (body: object, at: number, ip: string) => {
			const env: RouteEnv = { deps: async () => ({ db: m.db, kv, settings: s, now: at }), after: (fn) => void tasks.push(fn) };
			const req = eventRequest(body, { origin: ORIGIN, "cf-connecting-ip": key ? PROXY_IP : ip, ...(key ? { "x-ec-proxy-key": key, "x-ec-client-ip": ip } : {}) });
			expect((await inRoute(env).handler({ ...ctx(req, await req.clone().text(), kv), requestMeta: { ip: key ? PROXY_IP : ip }, storage: { sites } })).status).toBe(204);
			for (const t of tasks.splice(0)) await t();
		};
		// The first request of the day creates the daily salt; measure the steady state after it.
		await post({ ...VISIT[0], sid: "zzzzzzzzzzzzzzzzzzzz", h: "zzzzzzzzzzz1" }, NOW - 60, "198.51.100.9");
		const per: number[] = [];
		for (const [i, body] of VISIT.entries()) {
			m.reset();
			await post(body as object, NOW + i * 10, "203.0.113.7");
			per.push(m.stats.statements);
		}
		return per;
	}

	it("a proxied request costs the statements of the public path: 2 for a new visit, then 1 each, and one registry load for all of them", async () => {
		const key = await secretOf();
		const before = reads;
		// The public path first (the numbers of docs/performance.md), then the same visit through the proxy.
		const direct = await statements(null);
		expect(direct).toEqual([2, 1, 1, 1]);
		expect(await statements(key)).toEqual(direct);
		// Ten requests, one load of the sites registry (its snapshot); the route has no key collection to read at all.
		expect(reads - before).toBe(1);
	});

	it("the test database keeps the D1 limits: a compound SELECT of more than 5 terms is refused", async () => {
		const terms = (n: number) => Array.from({ length: n }, (_, i) => `SELECT ${i} AS n`).join(" UNION ALL ");
		await expect(db.db.all(terms(5))).resolves.toHaveLength(5);
		await expect(db.db.all(terms(6))).rejects.toThrow(/too many terms in compound SELECT/);
		await expect(memoryDb().db.all(terms(6))).rejects.toThrow(/too many terms in compound SELECT/);
	});

	it("refusals cost no statement but the drop counter flush", async () => {
		const key = await secretOf();
		const all = vi.spyOn(db.db, "all");
		const run = vi.spyOn(db.db, "run");
		const batch = vi.spyOn(db.db, "batch");
		await send({ key: "A".repeat(43) });
		await send({ key, ip: "127.0.0.1" });
		expect(all).not.toHaveBeenCalled();
		expect(batch).not.toHaveBeenCalled();
		// One flush statement per request, written after the answer.
		expect(run.mock.calls.map(([sql]) => /^INSERT INTO ca_drops/.test(sql))).toEqual([true, true]);
	});
});

describe("proxy mode: the 60 second registry window", () => {
	const T = Date.parse("2026-03-13T00:00:30Z");

	it("a secret replaced in another isolate keeps working here until the window ends, then only the new one does", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(T);
		const old = await secretOf();
		await send({ key: old, body: doc(1), ip: "203.0.1.7" });
		expect(db.count("ca_sessions")).toBe(1);
		const loads = reads;
		// Another isolate makes a new secret: the record changes, this isolate's snapshot does not.
		const next = await secretOf("blog", false);
		vi.setSystemTime(T + 59_999);
		await send({ key: old, body: doc(2), ip: "203.0.2.7" });
		expect(db.count("ca_sessions")).toBe(2);
		await send({ key: next, body: doc(3), ip: "203.0.3.7" });
		expect(db.count("ca_sessions")).toBe(2);
		expect(reads).toBe(loads);
		// 60,000 ms after the snapshot was taken it is read again.
		vi.setSystemTime(T + 60_000);
		await send({ key: old, body: doc(4), ip: "203.0.4.7" });
		expect(db.count("ca_sessions")).toBe(2);
		await send({ key: next, body: doc(5), ip: "203.0.5.7" });
		expect(db.count("ca_sessions")).toBe(3);
		expect(reads).toBe(loads + 1);
		expect(await dropsOf(db)).toEqual({ proxy_auth: 2 });
	});

	it("a secret removed in another isolate stops within the window; a wrong secret never costs a registry load", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(T);
		const key = await secretOf();
		await send({ key, body: doc(1) });
		const loads = reads;
		const rec = sites.items.get("blog") as { proxyHash?: string; proxyCreated?: number };
		delete rec.proxyHash;
		delete rec.proxyCreated;
		for (let i = 0; i < 5; i++) await send({ key: "A".repeat(43), body: doc(10 + i) });
		vi.setSystemTime(T + 59_999);
		await send({ key, body: doc(2), ip: "203.0.2.7" });
		expect(db.count("ca_sessions")).toBe(2);
		expect(reads).toBe(loads);
		vi.setSystemTime(T + 60_000);
		await send({ key, body: doc(3), ip: "203.0.3.7" });
		expect(db.count("ca_sessions")).toBe(2);
		expect(await dropsOf(db)).toEqual({ proxy_auth: 6 });
	});
});

describe("proxy mode: a sites collection that cannot be read", () => {
	const T = Date.parse("2026-03-13T00:00:30Z");
	/** From now on every load of the sites collection fails. */
	const breakReads = () => {
		sites.query = () => {
			reads++;
			return Promise.reject(new Error("sites unavailable"));
		};
	};

	it("a secret removed while reads fail is accepted for at most 10 minutes after the last good load, then refused; the public path keeps the snapshot", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(T);
		const key = await secretOf();
		await send({ key, body: doc(1), ip: "203.0.1.7" });
		expect(db.count("ca_sessions")).toBe(1);
		// Another isolate removes the secret, and from then on this isolate cannot read the collection.
		const rec = sites.items.get("blog") as { proxyHash?: string; proxyCreated?: number };
		delete rec.proxyHash;
		delete rec.proxyCreated;
		breakReads();
		const loads = reads;
		vi.setSystemTime(T + 2 * 60_000);
		await send({ key, body: doc(2), ip: "203.0.2.7" });
		vi.setSystemTime(T + PROXY_SNAPSHOT_MAX_AGE_MS);
		await send({ key, body: doc(3), ip: "203.0.3.7" });
		expect(db.count("ca_sessions")).toBe(3);
		expect(reads).toBeGreaterThan(loads);
		vi.setSystemTime(T + PROXY_SNAPSHOT_MAX_AGE_MS + 1);
		await send({ key, body: doc(4), ip: "203.0.4.7" });
		vi.setSystemTime(T + 600 * 60_000);
		await send({ key, body: doc(5), ip: "203.0.5.7" });
		expect(db.count("ca_sessions")).toBe(3);
		expect(await dropsOf(db)).toEqual({ proxy_auth: 2 });
		// Everything else the registry serves keeps the last good snapshot: a plain browser post of the site is stored.
		await send({ body: doc(6) });
		expect(db.count("ca_sessions")).toBe(4);
		expect(PROXY_SNAPSHOT_MAX_AGE_MS).toBe(600_000);
	});

	it("fails closed for a valid secret too while reads fail, and accepts it again after the next good load", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(T);
		const key = await secretOf();
		await send({ key, body: doc(1), ip: "203.0.1.7" });
		const working = sites.query;
		breakReads();
		vi.setSystemTime(T + PROXY_SNAPSHOT_MAX_AGE_MS + 1);
		await send({ key, body: doc(2), ip: "203.0.2.7" });
		expect(db.count("ca_sessions")).toBe(1);
		expect(await dropsOf(db)).toEqual({ proxy_auth: 1 });
		sites.query = working;
		// The failed load renewed the 60 s window; the next load after it succeeds.
		vi.setSystemTime(T + PROXY_SNAPSHOT_MAX_AGE_MS + 60_001);
		await send({ key, body: doc(3), ip: "203.0.3.7" });
		expect(db.count("ca_sessions")).toBe(2);
	});
});

describe("proxy mode: requests per minute", () => {
	it("answers 503 with the seconds to the next minute above proxyRateLimitPerMinute, counts proxy_rate, and resumes", async () => {
		const key = await secretOf();
		const news = await secretOf("news");
		const s = { proxyRateLimitPerMinute: 60 };
		for (let i = 0; i < 60; i++) expect((await send({ key, settings: s, body: doc(i), ip: `203.0.${i}.7` })).status).toBe(204);
		const over = await send({ key, settings: s, body: doc(60), ip: "203.0.60.7" });
		// The clock is 30 s into the minute.
		expect([over.status, header(over, "retry-after")]).toEqual([503, "30"]);
		expect(db.count("ca_sessions")).toBe(60);
		expect(await dropsOf(db)).toEqual({ proxy_rate: 1 });
		// Counted under the event's site: the caller holds its secret.
		expect(db.raw.prepare("SELECT site FROM ca_drops").all()).toEqual([{ site: "blog" }]);
		// The public path of the same site and the proxy of another site are not behind this site's ceiling.
		expect((await send({ settings: s, body: doc(61) })).status).toBe(204);
		expect((await send({ key: news, settings: s, body: { ...doc(62), k: NEWS_KEY }, origin: "https://news.example.net" })).status).toBe(204);
		// The page script's retry in the next minute is stored.
		expect((await send({ key, settings: s, body: doc(60), ip: "203.0.60.7", at: NOW + 30 })).status).toBe(204);
		expect(db.count("ca_sessions")).toBe(63);
	});

	it("every body type gets the 503, with Retry-After from 60 at the start of a minute to 1 at its end", async () => {
		const key = await secretOf();
		const s = { proxyRateLimitPerMinute: 60 };
		const minute = NOW - 30;
		for (let i = 0; i < 60; i++) await send({ key, settings: s, body: doc(i), ip: `203.0.${i}.7`, at: minute });
		const en = await send({ key, settings: s, body: { t: "en", ...doc(0), d: 1000, e: 1000, s: 10, i: 1, x: 0 }, at: minute });
		const ev = await send({ key, settings: s, body: { t: "ev", ...doc(70), name: "signup", u: "/" }, at: minute + 59 });
		expect([en.status, header(en, "retry-after"), ev.status, header(ev, "retry-after")]).toEqual([503, "60", 503, "1"]);
		expect(await dropsOf(db)).toEqual({ proxy_rate: 2 });
	});

	it("a refused secret does not count toward the ceiling", async () => {
		const key = await secretOf();
		const s = { proxyRateLimitPerMinute: 60 };
		for (let i = 0; i < 100; i++) await send({ key: "A".repeat(43), settings: s, body: doc(i) });
		expect((await send({ key, settings: s, body: doc(200) })).status).toBe(204);
		expect(db.count("ca_sessions")).toBe(1);
		expect(await dropsOf(db)).toEqual({ proxy_auth: 100 });
	});
});

describe("proxy mode: the secret is never stored, logged or echoed", () => {
	it("the record keeps only the hash; no answer, log line, table or state key holds the secret, and no answer holds the hash", async () => {
		const logs: unknown[][] = [];
		for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a));
		const made = await manage("sites/proxy-secret", { id: "blog" });
		const secret = made.secret as string;
		expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const hash = await hashSecret(secret);
		// Stored: the hash and the time, never the secret.
		expect(sites.items.get("blog")).toMatchObject({ proxyHash: hash, proxyCreated: NOW });
		expect(JSON.stringify([...sites.items.values()])).not.toContain(secret);
		// The answer that shows the secret once does not show the hash.
		expect(made.site).toMatchObject({ id: "blog", proxyCreated: NOW });
		expect(JSON.stringify(made)).not.toContain(hash);

		const answers = [
			await manage("sites/list", { counts: true }),
			await manage("sites/save", { id: "blog", label: "Blog 2", hosts: ["blog.example.net", "www.blog.example.net"] }),
			await manage("sites/key", { id: "blog", key: BLOG_KEY }),
			await send({ key: secret, cf: { country: "DE" }, headers: { "x-ec-country": "FR" } }),
			await send({ key: "A".repeat(43), body: doc(2) }),
			await send({ key: secret, ip: "127.0.0.1", body: doc(3) }),
		];
		// Saving the site and changing its key keep the secret.
		expect(sites.items.get("blog")).toMatchObject({ label: "Blog 2", proxyHash: hash, proxyCreated: NOW });
		expect(db.count("ca_sessions")).toBe(1);
		const everything = JSON.stringify([
			answers,
			logs,
			[...db.kv.data],
			...["ca_sessions", "ca_events", "ca_drops", "ca_srv"].map((t) => db.raw.prepare(`SELECT * FROM ${t}`).all()),
			entryRows(db.raw),
		]);
		expect(everything).not.toContain(secret);
		expect(everything).not.toContain(hash);
		expect(logs).toEqual([]);
		// Nor is the forwarded address kept anywhere.
		expect(everything).not.toContain("203.0.113.7");
	});
});
