import { beforeEach, describe, expect, it } from "vitest";
import { dropsOf } from "./drops.helpers.js";
import type { IngestBody } from "../src/contract.js";
import { ipInCidr } from "../src/core/crypto.js";
import { validateIngest } from "../src/core/ids.js";
import { readVisits, YOUNG_VISIT_S } from "../src/core/apply.js";
import { type RecorderDeps, recordClientEvent, recordServerHit, requestInfo, resetCounters, shouldRecordServerHit } from "../src/core/recorder.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { CHROME_UA, entryRows, eventRequest, GOOGLEBOT_UA, schemaDb } from "./helpers.js";

const T0 = Date.parse("2026-06-10T12:00:00Z") / 1000;
const SID = "aaaaaaaaaaaaaaaaaaaa";
const SID2 = "bbbbbbbbbbbbbbbbbbbb";
const H1 = "hhhhhhhhhhh1";
const H2 = "hhhhhhhhhhh2";

let env: Awaited<ReturnType<typeof schemaDb>>;
beforeEach(async () => {
	resetCounters();
	env = await schemaDb();
});

function deps(over: Partial<Settings> = {}, now = T0): RecorderDeps {
	return { db: env.db, kv: env.kv, settings: normalizeSettings(over as Record<string, unknown>), now };
}
const info = (headers: Record<string, string> = {}) => requestInfo(eventRequest("{}", headers));
const body = (b: Record<string, unknown>) => validateIngest({ v: 1, ...b }) as IngestBody;
const pv = (sid: string | undefined, h: string, u = "/", extra: Record<string, unknown> = {}) => body({ t: "pv", ...(sid ? { sid } : {}), h, u, w: 1440, ...extra });
// The page view and event entries of the stored visit documents; an event with an amount carries its `ca_events` row's.
const hits = () =>
	entryRows(env.raw).map((e) => ({ ...e, ...((env.raw.prepare("SELECT val, cur FROM ca_events WHERE site = ? AND id = ?").get(e.site, e.id) as object | undefined) ?? { val: null, cur: null }) }));
const sessions = () => env.raw.prepare("SELECT * FROM ca_sessions").all() as Record<string, unknown>[];

describe("requestInfo", () => {
	it("derives server facts from headers and cf", () => {
		const req = eventRequest("{}", { "sec-gpc": "1", "cf-ipcountry": "de", "sec-ch-ua-mobile": "?1" });
		(req as unknown as { cf: object }).cf = { asn: 3320, region: "Berlin" };
		const i = requestInfo(req);
		expect(i).toMatchObject({ ua: CHROME_UA, ip: "203.0.113.7", lang: "de-de", country: "DE", region: "Berlin", gpc: true, dnt: false, chMobile: "?1", host: "example.org" });
	});

	it("lowercases the request host and strips the port", () => {
		expect(requestInfo(new Request("https://WWW.Example.ORG:8443/x")).host).toBe("www.example.org");
	});

	it("trusts CF-Connecting-IP only with request.cf, never X-Forwarded-For, and prefers host meta", () => {
		const plain = new Request("https://example.org/", { headers: { "cf-connecting-ip": "198.51.100.1", "x-forwarded-for": "192.0.2.9" } });
		expect(requestInfo(plain).ip).toBeNull();
		expect(requestInfo(plain, "192.0.2.50").ip).toBe("192.0.2.50");
		expect(requestInfo(eventRequest("{}", { "x-forwarded-for": "192.0.2.9" })).ip).toBe("203.0.113.7");
		expect(requestInfo(eventRequest("{}"), null).ip).toBeNull();
	});
});

describe("recordClientEvent: pageviews and sessions", () => {
	it("creates one session and one hit, then continues the session", async () => {
		expect(await recordClientEvent(deps(), pv(SID, H1, "/a?utm_source=news&x=1", { r: "https://www.bing.com/search?q=x" }), info())).toBe("ok");
		expect(sessions()).toHaveLength(1);
		expect(sessions()[0]).toMatchObject({ site: "default", sid: SID, entry_path: "/a", pageviews: 1, ref_host: "bing.com", lang: "de-de", device: "desktop", browser: "Chrome", host: "example.org" });
		expect(hits()[0]).toMatchObject({ id: H1, sid: SID, kind: "pv", path: "/a", query: "utm_source=news", dur: null, host: "example.org" });

		expect(await recordClientEvent(deps({}, T0 + 60), pv(SID, H2, "/b"), info())).toBe("ok");
		expect(sessions()[0]).toMatchObject({ pageviews: 2, exit_path: "/b", last_seen: T0 + 60, entry_path: "/a" });
		expect(hits()).toHaveLength(2);
	});

	it("aliases a fresh client sid onto the active session of the same visitor", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
		expect(await recordClientEvent(deps({}, T0 + 30), pv(SID2, H2, "/b", { n: 1 }), info())).toBe("ok");
		expect(sessions()).toHaveLength(1);
		const alias = env.raw.prepare("SELECT * FROM ca_aliases").get() as Record<string, unknown>;
		expect(alias).toMatchObject({ sid: SID2, canon: SID, expires: T0 + 30 + 86_400 });
		// The page view is an entry of the canonical visit, keyed by its client hit id.
		expect(hits()[1]).toMatchObject({ id: H2, sid: SID });
	});

	it("drops a reload of the same path within reloadDedupeSeconds", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
		expect(await recordClientEvent(deps({}, T0 + 1), pv(SID2, H2, "/a"), info())).toBe("reload");
		expect(sessions()[0]).toMatchObject({ pageviews: 1 });
		expect(hits()).toHaveLength(1);
	});

	it("caps pageviews per session", async () => {
		const d = deps({ maxPageviewsPerSession: 10 });
		for (let i = 0; i < 10; i++) expect(await recordClientEvent({ ...d, now: T0 + i * 10 }, pv(SID, `hhhhhhhhhh${String(i).padStart(2, "0")}`, `/p${i}`), info())).toBe("ok");
		expect(await recordClientEvent({ ...d, now: T0 + 200 }, pv(SID, "hhhhhhhhhh99", "/p99"), info())).toBe("session_cap");
		expect(sessions()[0]).toMatchObject({ pageviews: 10 });
		expect(await dropsOf(env, "2026-06-10")).toEqual({ session_cap: 1 });
	});

	it("caps events per sid per minute", async () => {
		const d = deps({ maxEventsPerSidPerMinute: 10 });
		await recordClientEvent(d, pv(SID, H1, "/a"), info());
		for (let i = 0; i < 9; i++) expect(await recordClientEvent(d, body({ t: "ev", sid: SID, name: "x" }), info())).toBe("ok");
		expect(await recordClientEvent(d, body({ t: "ev", sid: SID, name: "x" }), info())).toBe("sid_rate");
	});

	it("caps events per visitor key per minute", async () => {
		const d = deps({ maxEventsPerVkeyPerMinute: 10 });
		for (let i = 0; i < 10; i++) await recordClientEvent(d, body({ t: "ev", name: "x" }), info());
		expect(await recordClientEvent(d, body({ t: "ev", name: "x" }), info())).toBe("vkey_rate");
	});
});

describe("recordClientEvent: drops", () => {
	it("drops on Sec-GPC with signals=gpc and counts the reason", async () => {
		expect(await recordClientEvent(deps(), pv(SID, H1), info({ "sec-gpc": "1" }))).toBe("privacy_signal");
		expect(await recordClientEvent(deps({ signals: "none" }), pv(SID, H1), info({ "sec-gpc": "1" }))).toBe("ok");
		expect(await recordClientEvent(deps({ signals: "dnt_and_gpc" }), pv(SID2, H2), info({ dnt: "1" }))).toBe("privacy_signal");
		expect(await dropsOf(env, "2026-06-10")).toEqual({ privacy_signal: 2 });
	});

	it("drops excluded paths and IP ranges", async () => {
		expect(await recordClientEvent(deps(), pv(SID, H1, "/_emdash/admin"), info())).toBe("excluded_path");
		expect(await recordClientEvent(deps({ excludeIpPrefixes: "203.0.113.0/24" } as never), pv(SID, H1), info())).toBe("excluded_ip");
		expect(hits()).toHaveLength(0);
		expect(env.count("ca_sessions")).toBe(0);
	});

	it("drops engagement without a sid", async () => {
		expect(await recordClientEvent(deps(), body({ t: "en", h: H1, d: 5 }), info())).toBe("invalid");
	});
});

describe("recordClientEvent: engagement and events", () => {
	it("keeps the maximum of every field over repeated updates and recomputes the session sums", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
		await recordClientEvent(deps({}, T0 + 20), pv(SID, H2, "/b"), info());
		await recordClientEvent(deps(), body({ t: "en", sid: SID, h: H1, d: 12000, e: 15000, s: 75, i: 1, x: 0 }), info());
		await recordClientEvent(deps(), body({ t: "en", sid: SID, h: H1, d: 9000, e: 30000, s: 40, i: 0, x: 0 }), info());
		await recordClientEvent(deps(), body({ t: "en", sid: SID, h: H2, d: 4000, e: 5000, s: 10 }), info());
		expect(hits()[0]).toMatchObject({ dur: 12000, vis: 30000, scroll: 75, exit: 0 });
		expect(hits()[1]).toMatchObject({ dur: 4000, vis: 5000, scroll: 10, exit: null });
		const [h1, h2] = hits() as { dur: number; vis: number }[];
		expect(sessions()[0]).toMatchObject({ engaged_ms: (h1?.dur ?? 0) + (h2?.dur ?? 0), visible_ms: (h1?.vis ?? 0) + (h2?.vis ?? 0), max_scroll: 75, interacted: 1 });
	});

	it("reordered updates give the same end state, and exit 2 is not lowered by a later 0", async () => {
		const updates = [
			{ d: 1000, e: 2000, s: 20, i: 0, x: 0 },
			{ d: 5000, e: 9000, s: 60, i: 1, x: 2 },
			{ d: 3000, e: 4000, s: 30, i: 0, x: 0 },
		];
		const end = async (order: number[]) => {
			env = await schemaDb();
			resetCounters();
			await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
			for (const i of order) await recordClientEvent(deps(), body({ t: "en", sid: SID, h: H1, ...updates[i] }), info());
			const { engaged_ms, visible_ms, max_scroll, interacted } = sessions()[0] as Record<string, unknown>;
			const { dur, vis, scroll, exit } = hits()[0] as Record<string, unknown>;
			return { engaged_ms, visible_ms, max_scroll, interacted, dur, vis, scroll, exit };
		};
		const a = await end([0, 1, 2]);
		expect(a).toEqual({ engaged_ms: 5000, visible_ms: 9000, max_scroll: 60, interacted: 1, dur: 5000, vis: 9000, scroll: 60, exit: 2 });
		expect(await end([2, 1, 0])).toEqual(a);
		expect(await end([1, 0, 2])).toEqual(a);
	});

	it("stores nav on pageviews and NULL for route changes", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a", { nt: 2 }), info());
		await recordClientEvent(deps({}, T0 + 5), pv(SID, H2, "/b"), info());
		expect(hits().map((h) => h.nav)).toEqual([2, null]);
	});

	it("engagement through an alias sid updates the canonical session", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
		await recordClientEvent(deps({}, T0 + 30), pv(SID2, H2, "/b"), info());
		await recordClientEvent(deps({}, T0 + 40), body({ t: "en", sid: SID2, h: H2, d: 3000 }), info());
		expect(sessions()[0]).toMatchObject({ sid: SID, engaged_ms: 3000 });
	});

	describe("search re-entry", () => {
		const reentries = () => Number(sessions()[0]?.reentries);
		const start = () => recordClientEvent(deps(), pv(SID, H1, "/a", { n: 1, r: "https://www.google.com/" }), info());

		it("is 0 on session create and counts a fresh id from a search host on an existing session", async () => {
			await start();
			expect(reentries()).toBe(0);
			await recordClientEvent(deps({}, T0 + 60), pv(SID2, H2, "/a", { n: 1, r: "https://www.google.com/", nt: 0 }), info());
			expect(sessions()).toHaveLength(1);
			expect(reentries()).toBe(1);
		});

		it.each([
			["a continued page view (n = 0)", { n: 0, r: "https://www.google.com/" }],
			["an own-host referrer", { n: 1, r: "https://example.org/x" }],
			["a non-search referrer", { n: 1, r: "https://news.example/" }],
			["no referrer", { n: 1 }],
			["a reload", { n: 1, r: "https://www.google.com/", nt: 1 }],
			["a back or forward load", { n: 1, r: "https://www.google.com/", nt: 2 }],
		])("does not count %s", async (_n, extra) => {
			await start();
			await recordClientEvent(deps({}, T0 + 60), pv(SID2, H2, "/b", extra), info());
			expect(sessions()).toHaveLength(1);
			expect(reentries()).toBe(0);
		});
	});

	it("stores custom and reserved events; reserved events keep only their fixed key", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
		await recordClientEvent(deps(), body({ t: "ev", sid: SID, name: "signup", p: { plan: "pro" }, val: 12.5, u: "/a" }), info());
		await recordClientEvent(deps(), body({ t: "ev", sid: SID, name: "_outbound", p: { url: "x.com/y", extra: "z" }, u: "/a" }), info());
		const evs = hits().filter((h) => h.kind === "ev");
		expect(evs.map((e) => [e.name, e.props, e.val]).sort()).toEqual([
			["_outbound", '{"url":"x.com/y"}', null],
			["signup", '{"plan":"pro"}', 12.5],
		]);
		expect(sessions()[0]).toMatchObject({ events: 2, pageviews: 1 });
	});

	it("an event carrying its page's hit id does not collide with the pageview", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
		await recordClientEvent(deps(), body({ t: "ev", sid: SID, h: H1, name: "x" }), info());
		expect(hits().map((h) => h.kind).sort()).toEqual(["ev", "pv"]);
	});
});

describe("readVisits (the slow-path read)", () => {
	it("finds a visit by visitor key only within its own window", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
		const own = await readVisits(env.db, "default", T0, "UTC", SID, []);
		const s = own.rows[0];
		expect(s?.window_s).toBe(1800);
		expect((await readVisits(env.db, "default", T0 + 1800, "UTC", null, [s?.vkey as string])).rows).toHaveLength(1);
		expect((await readVisits(env.db, "default", T0 + 1801, "UTC", null, [s?.vkey as string])).rows).toHaveLength(0);
		expect((await readVisits(env.db, "default", T0, "UTC", SID2, [])).canon).toBeNull();
	});
});

describe("server hits", () => {
	const srv = (over: Partial<Parameters<typeof recordServerHit>[1]> = {}) => ({ ...info(), url: "/missing?utm_source=x&a=1", method: "GET", status: 404, ...over });

	it("decides by audience and settings", () => {
		const s = { logErrorPages: true };
		expect(shouldRecordServerHit(404, "human", s)).toBe(true);
		expect(shouldRecordServerHit(200, "human", s)).toBe(false);
		expect(shouldRecordServerHit(404, "robot", s)).toBe(false);
		expect(shouldRecordServerHit(200, "robot", s)).toBe(false);
		expect(shouldRecordServerHit(500, "human", { ...s, logErrorPages: false })).toBe(false);
	});

	it("counts a human error page per day, status, path and external referrer, never a vkey or ua hash", async () => {
		expect(await recordServerHit(deps(), srv({ referer: "https://news.example.com/post" }))).toBe(true);
		expect(await recordServerHit(deps({}, T0 + 9), srv({ referer: "https://news.example.com/post" }))).toBe(true);
		const rows = env.raw.prepare("SELECT * FROM ca_srv").all() as Record<string, unknown>[];
		expect(rows).toEqual([{ site: "default", day: 20260610, status: 404, path: "/missing", ref: "news.example.com/post", n: 2, last_ts: T0 + 9 }]);
		expect(await recordServerHit(deps(), srv({ status: 200 }))).toBe(false);
		expect(await recordServerHit(deps(), srv({ userRole: 30 }))).toBe(false);
		expect(await recordServerHit(deps(), srv({ url: "/_emdash/x" }))).toBe(false);
	});

	it("a Googlebot 404 writes nothing, even with error pages logged", async () => {
		const d = deps({ logErrorPages: true });
		expect(await recordServerHit(d, srv({ ua: GOOGLEBOT_UA }))).toBe(false);
		expect(await recordServerHit(d, srv({ ua: GOOGLEBOT_UA, status: 200 }))).toBe(false);
		expect(hits()).toHaveLength(0);
	});
});

describe("write order (every event is one statement on the visit row)", () => {
	it("an engagement update that arrives before its pageview is kept", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
		expect(await recordClientEvent(deps({}, T0 + 10), body({ t: "en", sid: SID, h: H2, d: 4000 }), info())).toBe("ok");
		await recordClientEvent(deps({}, T0 + 11), pv(SID, H2, "/b"), info());
		expect(hits()[1]).toMatchObject({ id: H2, path: "/b", dur: 4000 });
		expect(sessions()[0]).toMatchObject({ pageviews: 2, engaged_ms: 4000 });
	});

	it("an engagement update for a page view the visit does not hold opens no entry once the visit is older than YOUNG_VISIT_S", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a"), info());
		// A dropped page view (excluded path, reload) leaves its later engagement update without an entry: time not counted.
		expect(await recordClientEvent(deps({}, T0 + YOUNG_VISIT_S + 1), body({ t: "en", sid: SID, h: H2, d: 4000 }), info())).toBe("orphan_update");
		expect(sessions()[0]).toMatchObject({ pageviews: 1, engaged_ms: 0 });
		expect(hits().map((h) => h.id)).toEqual([H1]);
		// The page view's own entry still takes its updates at any age.
		expect(await recordClientEvent(deps({}, T0 + 600), body({ t: "en", sid: SID, h: H1, d: 3000 }), info())).toBe("ok");
		expect(sessions()[0]).toMatchObject({ engaged_ms: 3000 });
	});

	it("an engagement update for an unknown visit is the counted drop orphan_update", async () => {
		expect(await recordClientEvent(deps(), body({ t: "en", sid: SID, h: H1, d: 4000 }), info())).toBe("orphan_update");
		expect(await dropsOf(env, "2026-06-10")).toEqual({ orphan_update: 1 });
	});
});

describe("ipInCidr", () => {
	it("matches IPv4 and IPv6 prefixes", () => {
		expect(ipInCidr("203.0.113.7", "203.0.113.0/24")).toBe(true);
		expect(ipInCidr("203.0.114.7", "203.0.113.0/24")).toBe(false);
		expect(ipInCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
		expect(ipInCidr("::ffff:10.1.2.3", "10.0.0.0/8")).toBe(true);
		expect(ipInCidr("2001:db8:1::5", "2001:db8::/32")).toBe(true);
		expect(ipInCidr("2001:db9::5", "2001:db8::/32")).toBe(false);
		expect(ipInCidr("10.1.2.3", "2001:db8::/32")).toBe(false);
	});
});

describe("client sites", () => {
	const blog = (): RecorderDeps => ({ ...deps(), site: "blog" });
	const clientInfo = () => ({ ...info(), host: "blog.example.net" });

	it("gives the same ip and ua different visitor keys on two sites", async () => {
		await recordClientEvent(deps(), pv(SID, H1), info());
		await recordClientEvent(blog(), pv(SID2, H2), clientInfo());
		const rows = env.raw.prepare("SELECT site, vkey, host FROM ca_sessions ORDER BY site").all() as Array<{ site: string; vkey: string; host: string }>;
		expect(rows.map((r) => [r.site, r.host])).toEqual([["blog", "blog.example.net"], ["default", "example.org"]]);
		expect(rows[0]?.vkey).not.toBe(rows[1]?.vkey);
		expect(hits().map((h) => ({ site: h.site, host: h.host })).sort((a, b) => String(a.site).localeCompare(String(b.site)))).toEqual([
			{ site: "blog", host: "blog.example.net" },
			{ site: "default", host: "example.org" },
		]);
	});

	it("never continues a sid of site A under site B", async () => {
		await recordClientEvent(deps(), pv(SID, H1), info());
		await recordClientEvent(blog(), pv(SID, H2, "/b", { n: 0 }), clientInfo());
		const rows = env.raw.prepare("SELECT site, sid, pageviews FROM ca_sessions ORDER BY site").all() as Array<{ site: string; pageviews: number }>;
		expect(rows.map((r) => [r.site, r.pageviews])).toEqual([["blog", 1], ["default", 1]]);
		// Engagement for site A's hit sent under site B changes nothing.
		await recordClientEvent(blog(), body({ t: "en", sid: SID, h: H1, d: 5000, e: 6000 }), clientInfo());
		expect(hits().find((h) => h.site === "default")).toMatchObject({ dur: null });
	});
});

describe("recordClientEvent: revenue", () => {
	const ev = (x: Record<string, unknown>, sid = SID) => validateIngest({ v: 1, t: "ev", sid, name: "purchase", u: "/thanks", ...x })!;
	const browser = () => ({ ...info({ origin: "https://example.org" }), hasOrigin: true });
	const server = () => ({ ...info(), hasOrigin: false });
	const revRows = () =>
		(hits() as unknown as { kind: string; id: string; name: string; val: number | null; cur: string | null }[])
			.filter((h) => h.kind === "ev")
			.map(({ id, name, val, cur }) => ({ id, name, val, cur }))
			.sort((a, b) => (a.id < b.id ? -1 : 1));
	const drops = () => dropsOf(env, "2026-06-10");
	const start = () => recordClientEvent(deps(), pv(SID, H1, "/thanks"), info());

	it("stores the site default when no currency is sent, rounded to its minor unit, and keeps stored rows when the default changes", async () => {
		await start();
		await recordClientEvent(deps(), ev({ val: 0.005 }), browser());
		await recordClientEvent(deps({ defaultCurrency: "JPY" }), ev({ val: 1234.5 }), browser());
		await recordClientEvent(deps({ defaultCurrency: "JPY" }), ev({ val: 9.999, cur: "usd" }), browser());
		const rows = revRows().map((r) => [r.val, r.cur]).sort((a, b) => String(a[1]).localeCompare(String(b[1])) || Number(a[0]) - Number(b[0]));
		expect(rows).toEqual([[1235, "JPY"], [0.01, "USD"], [10, "USD"]]);
		await recordClientEvent(deps({ defaultCurrency: "JPY" }), ev({ val: 0.004 }), browser());
		expect(revRows().filter((r) => r.cur === "JPY").map((r) => r.val).sort()).toEqual([0, 1235]);
	});

	it("uses a client site's own default, or the master's when it inherits", async () => {
		const client = { id: "shop", label: "Shop", key: "k".repeat(20), hosts: ["shop.example.com"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 };
		const d = (c: typeof client & { defaultCurrency?: string }) => ({ ...deps({ defaultCurrency: "GBP" }), site: "shop", client: c });
		await recordClientEvent(d({ ...client, defaultCurrency: "EUR" }), ev({ val: 5 }), browser());
		await recordClientEvent(d(client), ev({ val: 6 }, SID2), browser());
		const rows = env.raw.prepare("SELECT val, cur FROM ca_events WHERE site = 'shop' ORDER BY val").all();
		expect(rows).toEqual([{ val: 5, cur: "EUR" }, { val: 6, cur: "GBP" }]);
	});

	it("counts invalid revenue and keeps the event without its value", async () => {
		await start();
		expect(await recordClientEvent(deps(), ev({ val: -1, cur: "USD" }), browser())).toBe("ok");
		expect(await recordClientEvent(deps(), ev({ val: 5, cur: "XXX" }), browser())).toBe("ok");
		expect(revRows().map((r) => [r.name, r.val, r.cur])).toEqual([["purchase", null, null], ["purchase", null, null]]);
		expect((await drops()).revenue_invalid).toBe(2);
	});

	it("acceptClientRevenue off drops the fields from a request with Origin and keeps them without", async () => {
		await start();
		const off = () => deps({ acceptClientRevenue: false });
		expect(await recordClientEvent(off(), ev({ val: 5, cur: "EUR", oid: "A-1001" }), browser())).toBe("ok");
		expect(await recordClientEvent(off(), ev({ val: 7, cur: "EUR", oid: "A-1002" }), server())).toBe("ok");
		const rows = revRows();
		expect(rows.map((r) => [r.val, r.cur])).toEqual(expect.arrayContaining([[null, null], [7, "EUR"]]));
		// The stripped event is a plain event: a random `e` key, no order id.
		expect(rows.find((r) => r.val === null)?.id).toMatch(/^e[a-z0-9]{12}$/);
		expect((await drops()).revenue_not_accepted).toBe(1);
	});

	it("stores one row per order id and raises the session's events once", async () => {
		await start();
		const order = ev({ val: 49.9, cur: "EUR", oid: "A-1001" });
		expect(await recordClientEvent(deps(), order, browser())).toBe("ok");
		expect(await recordClientEvent(deps({}, T0 + 5), order, browser())).toBe("duplicate_order");
		// A server post of the same order (no Origin) is the same row.
		expect(await recordClientEvent(deps({}, T0 + 6), order, server())).toBe("duplicate_order");
		expect(revRows()).toHaveLength(1);
		expect(revRows()[0]?.id).toMatch(/^o\.[0-9a-f]{20}$/);
		expect(sessions()[0]?.events).toBe(1);
		expect((await drops()).duplicate_order).toBe(2);
		// Another event name or another site is another order.
		expect(await recordClientEvent(deps(), ev({ val: 49.9, cur: "EUR", oid: "A-1001", name: "renewal" }), browser())).toBe("ok");
		expect(await recordClientEvent({ ...deps(), site: "shop" }, order, browser())).toBe("ok");
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_events WHERE id LIKE 'o.%'").get()).toEqual({ n: 3 });
		// The order row is attached to the visit it belongs to.
		expect(env.raw.prepare("SELECT sday, sid FROM ca_events WHERE site = 'default' AND name = 'purchase'").get()).toEqual({ sday: "2026-06-10", sid: SID });
	});

	it("two concurrent posts of one order store one row and raise the session's events once", async () => {
		await start();
		const events = () => Number(sessions()[0]?.events ?? 0);
		const before = events();
		const order = ev({ val: 12, cur: "USD", oid: "A-1001" });
		const outs = await Promise.all([recordClientEvent(deps(), order, browser()), recordClientEvent(deps(), order, browser())]);
		expect(outs.sort()).toEqual(["duplicate_order", "ok"]);
		expect(revRows().filter((r) => r.val === 12)).toHaveLength(1);
		expect(events() - before).toBe(1);
	});
});

describe("site search terms", () => {
	const url = "/search?q=%20Red%20%20Shoes%20&utm_source=news&s=x&page=2";
	const query = () => hits().map((h) => h.query);

	it("off by default: the query column is exactly the allowlist result", async () => {
		await recordClientEvent(deps(), pv(SID, H1, url), info());
		expect(query()).toEqual(["utm_source=news"]);
	});

	it("keeps the configured names on pageviews, sanitised; s never matches utm_source", async () => {
		await recordClientEvent(deps({ siteSearchParams: "q, s" } as unknown as Partial<Settings>), pv(SID, H1, url), info());
		expect(query()).toEqual(["q=red+shoes&s=x&utm_source=news"]);
		await recordClientEvent(deps({ siteSearchParams: "s" } as unknown as Partial<Settings>, T0 + 5), pv(SID, H2, "/?utm_source=abc"), info());
		expect(query()[1]).toBe("utm_source=abc");
	});

	it("never on events, and a client site override wins over the master", async () => {
		await recordClientEvent(deps({ siteSearchParams: "q" } as unknown as Partial<Settings>), pv(SID, H1), info());
		await recordClientEvent(deps({ siteSearchParams: "q" } as unknown as Partial<Settings>, T0 + 1), body({ t: "ev", sid: SID, name: "signup", u: "/x?q=shoes" }), info());
		expect(hits()[1]?.query).toBeNull();
		const client = { id: "blog", label: "Blog", key: "k".repeat(20), hosts: ["blog.example.net"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0, siteSearchParams: ["find"] };
		const blog = { ...deps({ siteSearchParams: "q" } as unknown as Partial<Settings>), site: "blog", client };
		await recordClientEvent(blog, pv(SID2, H2, "/s?q=a&find=B"), { ...info(), host: "blog.example.net" });
		expect(hits().find((h) => h.site === "blog")).toMatchObject({ query: "find=b" });
	});
});
