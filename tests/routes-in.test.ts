import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drops as counters } from "../src/core/drops.js";
import { resetCounters } from "../src/core/recorder.js";
import { D1Sink, type IngestMsg } from "../src/core/apply.js";
import { ingestParser, inRoute, isOverload, RETRY_AFTER_S, retryOnce } from "../src/routes/in.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { dropsOf } from "./drops.helpers.js";
import { entryRows, eventRequest, GOOGLEBOT_UA, schemaDb, sitesColl } from "./helpers.js";
import { ctx, fakeEnv } from "./routes.helpers.js";

const SID = "aaaaaaaaaaaaaaaaaaaa";
const PV = { v: 1, t: "pv", sid: SID, n: 1, h: "hhhhhhhhhhh1", u: "/hello?utm_source=x", r: "", w: 1440 };

let db: Awaited<ReturnType<typeof schemaDb>>;
beforeEach(async () => {
	resetCounters();
	// The route's after() flushes at once instead of waiting out the window.
	counters.windowMs = 0;
	db = await schemaDb();
});
/** `ca_drops` as stored, without flushing the isolate's counters first. */
const stored = () => Object.fromEntries((db.raw.prepare("SELECT reason, n FROM ca_drops").all() as Array<{ reason: string; n: number }>).map((r) => [r.reason, r.n]));
afterEach(() => vi.restoreAllMocks());

/** Page view and event entries of the stored visit documents. */
const entries = () => entryRows(db.raw);
const pick = (r: Record<string, unknown> | undefined, ...f: string[]) => Object.fromEntries(f.map((k) => [k, r?.[k]]));

async function call(body: unknown, headers: Record<string, string> = {}, settings = {}) {
	const f = fakeEnv(db, settings);
	const req = eventRequest(body, headers);
	const input = await req.clone().text();
	const res = await inRoute(f.env).handler(ctx(req, input, db.kv));
	return { res, f };
}

describe("in route declaration", () => {
	it("is public, POST only, text body capped at 8 KB, raw response", () => {
		const r = inRoute(fakeEnv(db).env);
		expect(r).toMatchObject({ public: true, methods: ["POST"], request: { body: "text", maxBytes: 8192 }, response: "raw" });
	});
});

describe("in route", () => {
	it("answers a bot with 204 before parsing, writes nothing of it and counts it as bot after the response", async () => {
		const parse = vi.spyOn(ingestParser, "parse");
		const run = vi.spyOn(db.db, "run");
		const batch = vi.spyOn(db.db, "batch");
		const { res, f } = await call(PV, { "user-agent": GOOGLEBOT_UA });
		expect(res).toMatchObject({ status: 204, body: null });
		expect(parse).not.toHaveBeenCalled();
		expect(f.tasks).toHaveLength(1); // the drop counter flush, nothing else
		expect(run).not.toHaveBeenCalled();
		expect(batch).not.toHaveBeenCalled();
		await f.runAfter();
		expect(entries().length + db.count("ca_sessions")).toBe(0);
		expect(db.raw.prepare("SELECT site, day, reason, n FROM ca_drops").all()).toEqual([{ site: "default", day: expect.any(Number), reason: "bot", n: 1 }]);
		expect(db.kv.data.size).toBe(1); // only schema:version from setup
		// Nothing of the request is kept anywhere: no user agent, no address, no path.
		const tables = (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name);
		const dump = JSON.stringify(tables.map((t) => db.raw.prepare(`SELECT * FROM "${t}"`).all())) + JSON.stringify([...db.kv.data]);
		for (const needle of ["Googlebot", "hello", SID]) expect(dump).not.toContain(needle);
	});

	it("records a human pageview before the response: one hit and one session, nothing left for after()", async () => {
		const parse = vi.spyOn(ingestParser, "parse");
		const { res, f } = await call(PV);
		expect(res.status).toBe(204);
		expect(parse).toHaveBeenCalledOnce();
		expect(f.tasks).toHaveLength(0);
		expect(entries().length).toBe(1);
		expect(db.count("ca_sessions")).toBe(1);
	});

	it("drops Sec-GPC with signals = gpc and counts it", async () => {
		const { res, f } = await call(PV, { "sec-gpc": "1" });
		expect(res.status).toBe(204);
		await f.runAfter();
		expect(entries().length).toBe(0);
		expect(stored()).toEqual({ privacy_signal: 1 });
	});

	it("passes the Origin header to the revenue switch: a browser post loses its value, a server post keeps it", async () => {
		const EV = { v: 1, t: "ev", sid: SID, name: "purchase", u: "/thanks", val: 5, cur: "EUR" };
		const first = await call(PV);
		await first.f.runAfter();
		const browser = await call(EV, { origin: "https://example.org" }, { acceptClientRevenue: false });
		await browser.f.runAfter();
		const server = await call({ ...EV, val: 7 }, {}, { acceptClientRevenue: false });
		await server.f.runAfter();
		// Both events are entries of the visit; only the server post is an order row with its amount.
		expect(entries().filter((e) => e.kind === "ev")).toHaveLength(2);
		expect(db.raw.prepare("SELECT val, cur FROM ca_events ORDER BY val").all()).toEqual([{ val: 7, cur: "EUR" }]);
	});

	it("drops excluded paths", async () => {
		const { f } = await call({ ...PV, u: "/private/x" }, {}, { excludePaths: "/private/" });
		await f.runAfter();
		expect(entries().length).toBe(0);
		expect(stored()).toEqual({ excluded_path: 1 });
	});

	it("answers 204 to malformed and invalid bodies and counts them as invalid", async () => {
		for (const b of ["{not json", { v: 2, t: "pv" }, { ...PV, sid: "BAD" }, { v: 1, t: "ev", name: "_secret" }]) {
			const { res, f } = await call(b);
			expect(res.status).toBe(204);
			expect(f.tasks).toHaveLength(1); // the drop counter flush
		}
		expect(await dropsOf(db)).toEqual({ invalid: 4 });
		expect(db.count("ca_sessions")).toBe(0);
	});

	it("answers 204 to out-of-range nt, e and x and drops only those fields", async () => {
		const a = await call({ ...PV, nt: 7 });
		expect(a.res.status).toBe(204);
		await a.f.runAfter();
		const b = await call({ v: 1, t: "en", sid: SID, h: PV.h, d: 4000, e: 0, x: 9, s: 50 });
		expect(b.res.status).toBe(204);
		await b.f.runAfter();
		expect(pick(entries()[0], "nav", "dur", "vis", "exit", "scroll")).toEqual({ nav: null, dur: 4000, vis: null, exit: null, scroll: 50 });
		const c = await call({ v: 1, t: "en", sid: SID, h: PV.h, d: 5000, e: 6000, x: 2 });
		expect(c.res.status).toBe(204);
		await c.f.runAfter();
		expect(pick(entries()[0], "dur", "vis", "exit")).toEqual({ dur: 5000, vis: 6000, exit: 2 });
	});

	it("stores only the fixed key of a reserved event", async () => {
		await (await call(PV)).f.runAfter();
		await (await call({ v: 1, t: "ev", sid: SID, name: "_download", u: "/hello", p: { file: "/a.pdf", size: 10, x: "y" } })).f.runAfter();
		const row = pick(entries().find((e) => e.kind === "ev"), "name", "props");
		expect(row).toEqual({ name: "_download", props: '{"file":"/a.pdf"}' });
	});
});

describe("in route origin matrix", () => {
	const KEY = "kkkkkkkkkkkkkkkkkkkk";
	const PAUSED = "pppppppppppppppppppp";
	const MASTER = "https://example.org";
	let sites: ReturnType<typeof sitesColl>;
	beforeEach(() => {
		invalidateRegistry();
		sites = sitesColl([
			{ id: "blog", key: KEY, hosts: ["blog.example.net", "www.blog.example.net"] },
			{ id: "shop", key: PAUSED, hosts: ["shop.example.net"], paused: true },
		]);
	});

	async function send(over: Record<string, unknown>, origin: string | null) {
		const f = fakeEnv(db);
		const req = eventRequest({ ...PV, ...over }, origin ? { origin } : {});
		const res = await inRoute(f.env).handler({ ...ctx(req, await req.clone().text(), db.kv), storage: { sites } });
		await f.runAfter();
		return res;
	}
	const rows = () => db.raw.prepare("SELECT site, host FROM ca_sessions ORDER BY site").all();
	const drops = () => dropsOf(db);

	const cases: Array<[string, Record<string, unknown>, string | null, { site: string; host: string } | string]> = [
		["no k, no Origin: local", {}, null, { site: "default", host: "example.org" }],
		["no k, same Origin: local", {}, MASTER, { site: "default", host: "example.org" }],
		["no k, foreign Origin", {}, "https://blog.example.net", "origin_rejected"],
		["k, registered https Origin: client site", { k: KEY }, "https://blog.example.net", { site: "blog", host: "blog.example.net" }],
		["k, second registered host", { k: KEY }, "https://www.blog.example.net", { site: "blog", host: "www.blog.example.net" }],
		["k, unregistered Origin", { k: KEY }, "https://other.example.net", "origin_rejected"],
		["k, http Origin", { k: KEY }, "http://blog.example.net", "origin_rejected"],
		["k, null Origin", { k: KEY }, "null", "origin_rejected"],
		["k, missing Origin", { k: KEY }, null, "origin_rejected"],
		["k, same-origin request", { k: KEY }, MASTER, "origin_rejected"],
		["k, paused site", { k: PAUSED }, "https://shop.example.net", "site_paused"],
		["unknown key", { k: "uuuuuuuuuuuuuuuuuuuu" }, "https://blog.example.net", "unknown_key"],
	];

	it.each(cases)("%s", async (_name, over, origin, expected) => {
		const res = await send(over, origin);
		expect(res.status).toBe(204);
		expect(res.body).toBeNull();
		if (typeof expected === "string") {
			expect(db.count("ca_sessions") + entries().length).toBe(0);
			expect(await drops()).toEqual({ [expected]: 1 });
		} else {
			expect(rows()).toEqual([expected]);
			expect(entries().map((e) => pick(e, "site", "host"))).toEqual([expected]);
			expect(await drops()).toEqual({});
		}
	});

	it("counts each drop reason separately", async () => {
		await send({ k: KEY }, "https://other.example.net");
		await send({ k: KEY }, null);
		await send({ k: PAUSED }, "https://shop.example.net");
		await send({ k: "uuuuuuuuuuuuuuuuuuuu" }, "https://blog.example.net");
		expect(await drops()).toEqual({ origin_rejected: 2, site_paused: 1, unknown_key: 1 });
	});

	it("drops a malformed key as an invalid body", async () => {
		const res = await send({ k: "BAD" }, "https://blog.example.net");
		expect(res.status).toBe(204);
		expect(entries().length).toBe(0);
	});

	it("stops a site at once when it is paused and refreshed", async () => {
		await send({ k: KEY }, "https://blog.example.net");
		await sites.put("blog", { ...(await sites.get("blog") as object), paused: true });
		invalidateRegistry();
		await send({ k: KEY, h: "hhhhhhhhhhh2" }, "https://blog.example.net");
		expect(entries().length).toBe(1);
		expect(await drops()).toEqual({ site_paused: 1 });
	});
});

describe("write before the response, 503 and idempotent events", () => {
	const OVERLOAD = "D1_ERROR: D1 DB is overloaded. Requests queued for too long.";
	const header = (res: { headers: Array<[string, string]> }, name: string) => res.headers.find(([k]) => k === name)?.[1];
	const visit = () => db.raw.prepare("SELECT pageviews, events FROM ca_sessions").get() as { pageviews: number; events: number };

	/** A sink that throws the given errors first, then writes through the real one. */
	function failing(...errors: string[]) {
		const real = new D1Sink(db.db);
		const calls: IngestMsg[] = [];
		return {
			calls,
			async ingest(m: IngestMsg) {
				calls.push(m);
				const e = errors.shift();
				if (e) throw new Error(e);
				return real.ingest(m);
			},
		};
	}
	async function callWith(sink: { ingest(m: IngestMsg): Promise<unknown> }, body: unknown) {
		const f = fakeEnv(db);
		const env = { ...f.env, deps: async (c: Parameters<typeof f.env.deps>[0]) => ({ ...(await f.env.deps(c)), sink: sink as D1Sink }) };
		const req = eventRequest(body);
		const res = await inRoute(env).handler(ctx(req, await req.clone().text(), db.kv));
		return { res, f };
	}

	it("a page view or event posted twice is stored once (client ids key the visit document)", async () => {
		expect((await call(PV)).res.status).toBe(204);
		expect((await call({ ...PV, n: 0 })).res.status).toBe(204);
		expect((await call(PV)).res.status).toBe(204); // a retry keeps n = 1: the slow path finds the entry
		const EV = { v: 1, t: "ev", sid: SID, h: "eeeeeeeeeee1", name: "signup", u: "/hello" };
		for (let i = 0; i < 3; i++) expect((await call(EV)).res.status).toBe(204);
		expect(visit()).toEqual({ pageviews: 1, events: 1 });
		const keys = db.raw.prepare("SELECT k.key FROM ca_sessions, json_each(ca_sessions.hits) k ORDER BY k.key").all();
		expect(keys).toEqual([{ key: `e${EV.h}` }, { key: PV.h }]);
	});

	it("an event without an id is a new event on every post", async () => {
		await call(PV);
		const EV = { v: 1, t: "ev", sid: SID, name: "signup", u: "/hello" };
		await call(EV);
		await call(EV);
		expect(visit()).toEqual({ pageviews: 1, events: 2 });
	});

	it("answers 503 with Retry-After when the write keeps failing on overload, and counts it after the response", async () => {
		const sink = failing(OVERLOAD, OVERLOAD);
		const { res, f } = await callWith(sink, PV);
		expect(res.status).toBe(503);
		expect(header(res, "retry-after")).toBe(String(RETRY_AFTER_S));
		expect(sink.calls).toHaveLength(2); // one retry in the server
		expect(db.count("ca_sessions")).toBe(0);
		expect(stored()).toEqual({});
		await f.runAfter();
		expect(stored()).toEqual({ overload: 1 });
	});

	it("one overload error is absorbed by the server retry: 204 and stored", async () => {
		const sink = failing(OVERLOAD);
		const { res } = await callWith(sink, PV);
		expect(res.status).toBe(204);
		expect(sink.calls).toHaveLength(2);
		expect(visit()).toEqual({ pageviews: 1, events: 0 });
	});

	it("any other write error is 503 at once, counted as write_error", async () => {
		const sink = failing("SQLITE_ERROR: no such table");
		const { res, f } = await callWith(sink, { v: 1, t: "ev", sid: SID, h: "eeeeeeeeeee2", name: "signup", u: "/x" });
		expect(res.status).toBe(503);
		expect(sink.calls).toHaveLength(1);
		await f.runAfter();
		expect(stored()).toEqual({ write_error: 1 });
	});

	it("D1's Free plan daily limit error is counted as daily_limit (the Data page's Free plan sign)", async () => {
		const sink = failing("D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.");
		const { res, f } = await callWith(sink, { v: 1, t: "ev", sid: SID, h: "eeeeeeeeeee3", name: "signup", u: "/x" });
		expect(res.status).toBe(503);
		await f.runAfter();
		expect(stored()).toEqual({ daily_limit: 1 });
	});

	it("a failed engagement write and a failed channel rules read are counted too", async () => {
		await call(PV);
		const en = await callWith(failing(OVERLOAD), { v: 1, t: "en", sid: SID, h: PV.h, d: 4000 });
		await en.f.runAfter();
		expect(stored()).toEqual({ overload: 1 });
		const f = fakeEnv(db);
		const env = { ...f.env, channelRules: () => Promise.reject(new Error("D1 DB is overloaded. Too many requests queued.")) };
		const req = eventRequest({ ...PV, k: "kkkkkkkkkkkkkkkkkkkk" }, { origin: "https://blog.example.net" });
		invalidateRegistry();
		const sites = sitesColl([{ id: "blog", key: "kkkkkkkkkkkkkkkkkkkk", hosts: ["blog.example.net"] }]);
		const res = await inRoute(env).handler({ ...ctx(req, await req.clone().text(), db.kv), storage: { sites } });
		expect([res.status, header(res, "retry-after")]).toEqual([503, String(RETRY_AFTER_S)]);
		await f.runAfter();
		expect(stored()).toEqual({ overload: 1, write_error: 1 });
	});

	it("revenue drops are counted once, when the event is stored, not on each refused attempt", async () => {
		await call(PV);
		const EV = { v: 1, t: "ev", sid: SID, h: "eeeeeeeeeee3", name: "purchase", u: "/x", val: -1, cur: "USD" };
		expect((await callWith(failing("SQLITE_ERROR: x"), EV)).res.status).toBe(503);
		expect((await call(EV)).res.status).toBe(204);
		expect(await dropsOf(db)).toEqual({ write_error: 1, revenue_invalid: 1 });
	});

	it("the client's retry of a refused page view is stored once", async () => {
		expect((await callWith(failing(OVERLOAD, OVERLOAD), PV)).res.status).toBe(503);
		expect((await call(PV)).res.status).toBe(204);
		expect((await call(PV)).res.status).toBe(204);
		expect(visit()).toEqual({ pageviews: 1, events: 0 });
	});

	it("engagement updates are still written after the response and answered 204", async () => {
		await call(PV);
		const sink = failing(OVERLOAD, OVERLOAD);
		const { res, f } = await callWith(sink, { v: 1, t: "en", sid: SID, h: PV.h, d: 4000 });
		expect(res.status).toBe(204);
		expect(sink.calls).toHaveLength(0);
		expect(f.tasks).toHaveLength(1);
	});

	it("a failed read before the write (settings, sites registry) is a 503 too, never a silent 204", async () => {
		const f = fakeEnv(db);
		const env = { ...f.env, deps: async () => Promise.reject(new Error("D1 DB is overloaded. Too many requests queued.")) };
		const req = eventRequest(PV);
		const res = await inRoute(env).handler(ctx(req, await req.clone().text(), db.kv));
		expect([res.status, header(res, "retry-after")]).toEqual([503, String(RETRY_AFTER_S)]);
	});

	it("dropped events stay 204 (the rules cannot be probed)", async () => {
		const { res } = await call(PV, { "sec-gpc": "1" });
		expect(res.status).toBe(204);
	});

	it("recognises the D1 overload texts and code", () => {
		for (const m of ["D1 DB is overloaded. Requests queued for too long.", "D1 DB is overloaded. Too many requests queued.", "D1 DB is overloaded. Too many resources consumed within a 10 second window"]) expect(isOverload(new Error(m))).toBe(true);
		for (const m of ["no such table", "row 7429 not found"]) expect(isOverload(new Error(m))).toBe(false);
		expect(isOverload(null)).toBe(false);
	});

	it("retryOnce pauses with jitter before its single retry", async () => {
		const pauses: number[] = [];
		let n = 0;
		const sink = retryOnce({ ingest: async () => (n++ ? "ok" : Promise.reject(new Error(OVERLOAD))) }, () => (pauses.push(1), 1));
		expect(await sink.ingest({} as IngestMsg)).toBe("ok");
		expect([n, pauses.length]).toEqual([2, 1]);
	});
});
