/** Server side event ingestion, `POST agent/v1/events`. Every id, amount and host is invented. */
import { beforeEach, describe, expect, it } from "vitest";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { addDays, dayInZone, hourInZone, zonedToEpoch } from "../src/core/time.js";
import { dropsOf } from "./drops.helpers.js";
import { isoDay } from "../src/db/dialect.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { normalizeSettings } from "../src/settings.js";
import { agentHarness, T0 } from "./agent.helpers.js";
import { entryRows, eventRequest, schemaDb } from "./helpers.js";

const SID = "aaaaaaaaaaaaaaaaaaaa";
const SID_OTHER = "bbbbbbbbbbbbbbbbbbbb";
const ALIAS = "cccccccccccccccccccc";
const settings = normalizeSettings({ defaultCurrency: "EUR" });
const SHOP = { id: "shop", label: "Shop", key: "shopkkkkkkkkkkkkkkkk", hosts: ["shop.example.com"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0, defaultCurrency: "JPY" };

let env: Awaited<ReturnType<typeof schemaDb>>;
let h: Awaited<ReturnType<typeof agentHarness>>;

function session(site: string, sid: string, lastSeen: number) {
	env.raw
		.prepare(
			"INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, channel, source) VALUES (?, ?, 'k', '2026-03-12', 10, ?, ?, 1800, '/', '/checkout', 3, 0, 'Organic Search', 'google')",
		)
		.run(site, sid, lastSeen - 60, lastSeen);
}
const sess = (sid: string, site = "default") => env.raw.prepare("SELECT events, last_seen, exit_path FROM ca_sessions WHERE site = ? AND sid = ?").get(site, sid);
/** The `ca_events` rows of a site (orders and server-reported events), days as ISO. */
const evHits = (site = "default") =>
	(env.raw.prepare("SELECT id, sid, name, path, val, cur, day, ts FROM ca_events WHERE site = ? ORDER BY ts, name").all(site) as Record<string, unknown>[]).map((r): Record<string, unknown> => ({ ...r, day: isoDay(r.day) }));

beforeEach(async () => {
	resetCounters();
	invalidateRegistry();
	env = await schemaDb();
	h = await agentHarness(env, settings);
	h.storage.sites.items.set("shop", SHOP);
	session("default", SID, T0 - 7200);
	session("shop", SID_OTHER, T0 - 600);
	env.raw.prepare("INSERT INTO ca_aliases (site, sid, canon, expires) VALUES ('default', ?, ?, ?)").run(ALIAS, SID, T0 - 5000);
});

const post = async (input: unknown, scopes: Parameters<typeof h.key>[0] = ["write:events"], sites?: string[]) =>
	h.call("agent/v1/events", { token: await h.key(scopes, undefined, sites), input });

describe("agent/v1/events", () => {
	it("is scoped: write:events cannot query and read:analytics cannot send events", async () => {
		const writer = await h.key(["write:events"]);
		const reader = await h.key(["read:analytics"]);
		const q = await h.call("agent/v1/query", { token: writer, input: { report: "overview", query: { from: "2026-03-10", to: "2026-03-12" } } });
		expect([q.status, q.json]).toEqual([404, {}]);
		const e = await h.call("agent/v1/events", { token: reader, input: { events: [{ name: "purchase", val: 1 }] } });
		expect([e.status, e.json]).toEqual([404, {}]);
		expect(evHits()).toEqual([]);
	});

	it("applies the key's sites restriction with 404 {}", async () => {
		const r = await post({ site: "shop", events: [{ name: "purchase", val: 1 }] }, ["write:events"], ["default"]);
		expect([r.status, r.json]).toEqual([404, {}]);
		const ok = await post({ site: "shop", events: [{ name: "purchase", val: 1 }] }, ["write:events"], ["shop"]);
		expect(ok.json.data).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
		// The client site's own default currency.
		expect(evHits("shop")[0]).toMatchObject({ val: 1, cur: "JPY", sid: null });
	});

	it("answers 400 invalid_body for 21 events, an empty list or a body without events", async () => {
		for (const input of [{ events: Array.from({ length: 21 }, () => ({ name: "x" })) }, { events: [] }, {}, { events: "x" }]) {
			const r = await post(input);
			expect([r.status, r.json.error], JSON.stringify(input).slice(0, 40)).toEqual([400, "invalid_body"]);
		}
	});

	it("reports bad items by index and stores the others", async () => {
		const r = await post({
			events: [
				{ name: "purchase", val: 49.9, cur: "usd", oid: "A-1001", u: "/thanks?utm_source=mail&x=1" },
				{ name: "purchase", val: -1 },
				{ name: "signup", p: { plan: "pro" } },
			],
		});
		expect(r.status).toBe(200);
		expect(r.json).toMatchObject({ ok: true, data: { accepted: 2, duplicates: 0, rejected: [{ index: 1, reason: "invalid_value" }] } });
		const rows = evHits();
		expect(rows.map((x) => [x.name, x.val, x.cur, x.path, x.sid])).toEqual([
			["purchase", 49.9, "USD", "/thanks", null],
			["signup", null, null, null, null],
		]);
		expect(rows[0]?.id).toMatch(/^o\.[0-9a-f]{20}$/);
	});

	it("names every rejection reason", async () => {
		const r = await post({
			events: [
				{ name: "_outbound" },
				{ name: "_custom" },
				{ name: "bad/name" },
				{ name: "p", val: 5, cur: "ZZZ" },
				{ name: "p", val: 5, oid: "A 1" },
				{ name: "p", ts: 1.5 },
				{ name: "p", sid: "nope" },
				{ name: "p", u: "https://example.com/x" },
				"text",
			],
		});
		expect(r.json.data.rejected).toEqual([
			{ index: 0, reason: "reserved_name" },
			{ index: 1, reason: "reserved_name" },
			{ index: 2, reason: "invalid_name" },
			{ index: 3, reason: "invalid_currency" },
			{ index: 4, reason: "invalid_id" },
			{ index: 5, reason: "invalid_ts" },
			{ index: 6, reason: "invalid_sid" },
			{ index: 7, reason: "invalid_path" },
			{ index: 8, reason: "invalid_name" },
		]);
		expect(r.json.data.accepted).toBe(0);
	});

	it("accepts ts from 30 days ago to 60 s ahead and computes the day from it", async () => {
		const r = await post({
			events: [
				{ name: "old", ts: T0 - 31 * 86_400 },
				{ name: "future", ts: T0 + 120 },
				{ name: "edge", ts: T0 - 30 * 86_400 },
				{ name: "now" },
				{ name: "soon", ts: T0 + 60 },
			],
		});
		expect(r.json.data.rejected).toEqual([{ index: 0, reason: "invalid_ts" }, { index: 1, reason: "invalid_ts" }]);
		expect(evHits().map((x) => [x.name, x.day])).toEqual([["edge", "2026-02-11"], ["now", "2026-03-13"], ["soon", "2026-03-13"]]);
	});

	it("clamps ts to the raw window, read once per call, with day and hour in the site timezone", async () => {
		const day = 86_400;
		const run = async (rawRetentionDays: number, offsets: number[]) => {
			env.raw.exec("DELETE FROM ca_events");
			const s = normalizeSettings({ defaultCurrency: "EUR", rawRetentionDays, siteTimezone: "Europe/Berlin" });
			const r = await recordAgentEvents({ db: env.db, kv: env.kv, settings: s, now: T0 }, "default", offsets.map((o, i) => ({ name: `e${i}`, ts: T0 - o })));
			return { rejected: r.rejected.map((x) => x.index), rows: evHits().map((x) => [x.name, x.day]) };
		};
		// T0 is 2026-03-13 01:00 in Berlin; with 7 raw days the window starts on 2026-03-06, so its first full day is the 7th.
		expect(await run(7, [8 * day, 7 * day, 5 * day, -61, -60])).toEqual({ rejected: [0, 1, 3], rows: [["e2", "2026-03-08"], ["e4", "2026-03-13"]] });
		expect(hourInZone((env.raw.prepare("SELECT ts FROM ca_events WHERE name = 'e2'").get() as { ts: number }).ts, "Europe/Berlin")).toBe(1);
		expect(await run(90, [31 * day, 29 * day])).toEqual({ rejected: [0], rows: [["e1", "2026-02-12"]] });
	});

	it("attaches to a session of the site, directly or through an alias, even after its window, without touching engagement", async () => {
		const before = sess(SID) as { last_seen: number; exit_path: string };
		const r = await post({ events: [{ name: "purchase", val: 10, sid: SID }, { name: "purchase", val: 20, sid: ALIAS, u: "/done" }] });
		expect(r.json.data).toEqual({ accepted: 2, duplicates: 0, rejected: [] });
		expect(sess(SID)).toEqual({ events: 2, last_seen: before.last_seen, exit_path: "/checkout" });
		const rows = evHits();
		// Same ts and name: the order between the two is not defined.
		expect(rows.map((x) => [x.sid, x.path, x.cur]).sort((a, b) => String(a[1]).localeCompare(String(b[1])))).toEqual([[SID, "/checkout", "EUR"], [SID, "/done", "EUR"]]);
		// Channel and source come from the session by join.
		const joined = env.raw.prepare("SELECT s.channel, s.source FROM ca_events h JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid").all();
		expect(joined).toEqual([{ channel: "Organic Search", source: "google" }, { channel: "Organic Search", source: "google" }]);
	});

	it("attaches to a session closed two days ago without reopening it", async () => {
		const OLD = "ffffffffffffffffffff";
		session("default", OLD, T0 - 2 * 86_400);
		const before = sess(OLD) as { last_seen: number };
		const r = await post({ events: [{ name: "purchase", val: 12, sid: OLD }] });
		expect(r.json.data).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
		expect(sess(OLD)).toEqual({ events: 1, last_seen: before.last_seen, exit_path: "/checkout" });
		expect(env.raw.prepare("SELECT s.channel, s.source FROM ca_events h JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid WHERE h.sid = ?").all(OLD)).toEqual([
			{ channel: "Organic Search", source: "google" },
		]);
	});

	it("an event for a visit on a closed day keeps its row and attribution, leaves the stored day as it is and counts late_after_close", async () => {
		const OLD = "eeeeeeeeeeeeeeeeeeee";
		// Three days before T0's day: closed (its summary may be stored), still inside the 7 day reach.
		const day = addDays(dayInZone(T0, settings.siteTimezone), -3);
		env.raw
			.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, channel, source) VALUES ('default', ?, 'k', ?, 10, ?, ?, 1800, '/', '/checkout', 3, 0, 'Organic Search', 'google')")
			.run(OLD, day, zonedToEpoch(day, 10, settings.siteTimezone), zonedToEpoch(day, 10, settings.siteTimezone) + 60);
		const doc = () => env.raw.prepare("SELECT events, json(hits) AS hits FROM ca_sessions WHERE sid = ?").get(OLD);
		const before = doc();
		const r = await post({ events: [{ name: "purchase", val: 12, sid: OLD }, { name: "signup", sid: OLD }] });
		expect(r.json.data).toEqual({ accepted: 2, duplicates: 0, rejected: [] });
		expect(doc()).toEqual(before);
		// The order keeps its visit, so revenue by channel still sees it.
		expect(env.raw.prepare("SELECT s.channel FROM ca_events h JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid WHERE h.sid = ?").all(OLD)).toEqual([
			{ channel: "Organic Search" },
			{ channel: "Organic Search" },
		]);
		expect(await dropsOf(env)).toEqual({ late_after_close: 2 });
	});

	it("rejects an unknown sid and a sid of another site, and stores an event without sid unattributed", async () => {
		const r = await post({ events: [{ name: "purchase", val: 1, sid: "zzzzzzzzzzzzzzzzzzzz" }, { name: "purchase", val: 2, sid: SID_OTHER }, { name: "purchase", val: 3 }] });
		expect(r.json.data).toEqual({ accepted: 1, duplicates: 0, rejected: [{ index: 0, reason: "invalid_sid" }, { index: 1, reason: "invalid_sid" }] });
		expect(evHits().map((x) => [x.val, x.sid])).toEqual([[3, null]]);
		expect((sess(SID_OTHER, "shop") as { events: number }).events).toBe(0);
	});

	it("stores one row per order across calls, inside a call and with the browser path", async () => {
		const order = { name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001", sid: SID };
		expect((await post({ events: [order, order] })).json.data).toEqual({ accepted: 1, duplicates: 1, rejected: [] });
		expect((await post({ events: [order] })).json.data).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
		expect((sess(SID) as { events: number }).events).toBe(1);
		// The browser reports the same order: same hit id, so no second row and no second count.
		const deps = { db: env.db, kv: env.kv, settings, now: T0 };
		const body = validateIngest({ v: 1, t: "ev", sid: SID, name: "purchase", u: "/thanks", val: 49.9, cur: "EUR", oid: "A-1001" })!;
		expect(await recordClientEvent(deps, body, requestInfo(eventRequest("{}")))).toBe("duplicate_order");
		// Another name is another order.
		expect((await post({ events: [{ ...order, name: "renewal" }] })).json.data.accepted).toBe(1);
		expect(evHits()).toHaveLength(2);
	});

	it("an order first seen by the browser is a duplicate for the agent route, which takes its amount", async () => {
		const deps = { db: env.db, kv: env.kv, settings, now: T0 };
		await recordClientEvent(deps, validateIngest({ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/thanks" })!, requestInfo(eventRequest("{}")));
		await recordClientEvent(deps, validateIngest({ v: 1, t: "ev", sid: SID, name: "purchase", val: 5, oid: "A-3001" })!, requestInfo(eventRequest("{}")));
		expect((await post({ events: [{ name: "purchase", val: 5, oid: "A-3001" }] })).json.data).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
	});

	it("a browser order and a concurrent agent post of the same oid end as one row with the agent's amount", async () => {
		const deps = { db: env.db, kv: env.kv, settings, now: T0 };
		await recordClientEvent(deps, validateIngest({ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/thanks" })!, requestInfo(eventRequest("{}")));
		const before = (sess(SID) as { events: number }).events;
		const [, r] = await Promise.all([
			recordClientEvent(deps, validateIngest({ v: 1, t: "ev", sid: SID, name: "purchase", val: 5, oid: "A-5001" })!, requestInfo(eventRequest("{}"))),
			recordAgentEvents(deps, "default", [{ name: "purchase", val: 7.5, cur: "USD", oid: "A-5001", sid: SID }]),
		]);
		expect(r.accepted + r.duplicates).toBe(1);
		expect((sess(SID) as { events: number }).events).toBe(before + 1);
		expect(env.raw.prepare("SELECT val, cur FROM ca_events WHERE id LIKE 'o.%'").all()).toEqual([{ val: 7.5, cur: "USD" }]);
	});

	describe("the authenticated route has the last word on an order", () => {
		const deps = () => ({ db: env.db, kv: env.kv, settings, now: T0 });
		const browserOrder = async (oid: string, val: number, cur: string, now = T0 - 100) => {
			const d = { ...deps(), now };
			await recordClientEvent(d, validateIngest({ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/thanks" })!, requestInfo(eventRequest("{}")));
			return recordClientEvent(d, validateIngest({ v: 1, t: "ev", sid: SID, name: "purchase", u: "/thanks", val, cur, oid })!, requestInfo(eventRequest("{}")));
		};
		const orders = () => env.raw.prepare("SELECT name, val, cur, sid, path, ts FROM ca_events WHERE id LIKE 'o.%' ORDER BY name").all();

		it("a browser order then an agent post of the same oid keep one row with the agent's amount and the browser's ts, path and sid", async () => {
			expect(await browserOrder("A-1001", 10, "USD")).toBe("ok");
			// The browser session (a fresh one: SID's window has expired).
			const browserSid = (orders()[0] as { sid: string }).sid;
			const events = (sess(browserSid) as { events: number }).events;
			const r = await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001", u: "/elsewhere", sid: SID }]);
			expect(r).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
			expect(orders()).toEqual([{ name: "purchase", val: 49.9, cur: "EUR", sid: browserSid, path: "/thanks", ts: T0 - 100 }]);
			expect((sess(browserSid) as { events: number }).events).toBe(events);
			expect((sess(SID) as { events: number }).events).toBe(0);
		});

		it("an agent order then a browser post of the same oid leave the agent's row", async () => {
			await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001" }]);
			expect(await browserOrder("A-1001", 0, "USD")).toBe("duplicate_order");
			expect(orders()).toEqual([expect.objectContaining({ val: 49.9, cur: "EUR", sid: null })]);
		});

		it("a guessed id posted first by a browser does not block the real order, and an unattributed row gains the agent's sid", async () => {
			await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 0, cur: "USD", oid: "A-1002" }]);
			expect(await browserOrder("A-1002", 0, "USD")).toBe("duplicate_order");
			const r = await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 80, cur: "USD", oid: "A-1002", sid: ALIAS }]);
			expect(r).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
			expect(orders()).toEqual([expect.objectContaining({ val: 80, cur: "USD", sid: SID })]);
			// A row that has a session keeps it.
			env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events) VALUES ('default', 'eeeeeeeeeeeeeeeeeeee', 'k', '2026-03-12', 10, 0, 0, 1800, '/', '/', 1, 0)").run();
			await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 81, oid: "A-1002", sid: "eeeeeeeeeeeeeeeeeeee" }]);
			expect(orders()).toEqual([expect.objectContaining({ val: 81, cur: "EUR", sid: SID })]);
		});

		it("the same oid under another event name or another site is another row", async () => {
			await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 1, oid: "A-1001" }, { name: "renewal", val: 2, oid: "A-1001" }]);
			await recordAgentEvents(deps(), "shop", [{ name: "purchase", val: 3, oid: "A-1001" }]);
			expect(env.raw.prepare("SELECT site, name, val FROM ca_events WHERE id LIKE 'o.%' ORDER BY site, name").all()).toEqual([
				{ site: "default", name: "purchase", val: 1 },
				{ site: "default", name: "renewal", val: 2 },
				{ site: "shop", name: "purchase", val: 3 },
			]);
		});

		it("a repeat inside one call keeps the last amount in one row", async () => {
			const r = await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 1, oid: "A-1001" }, { name: "purchase", val: 2, cur: "USD", oid: "A-1001" }]);
			expect(r).toEqual({ accepted: 1, duplicates: 1, rejected: [] });
			expect(orders()).toEqual([expect.objectContaining({ val: 2, cur: "USD" })]);
		});
	});

	describe("corrections and voids by order id", () => {
		const deps = () => ({ db: env.db, kv: env.kv, settings, now: T0 });
		const purchases = () => env.raw.prepare("SELECT val, cur FROM ca_events WHERE name = 'purchase'").all();

		it("a correction replaces the amount and a void keeps the event with val and cur NULL", async () => {
			await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001", sid: SID }]);
			expect(await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 30, cur: "EUR", oid: "A-1001" }])).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
			expect(purchases()).toEqual([{ val: 30, cur: "EUR" }]);
			expect(await recordAgentEvents(deps(), "default", [{ name: "purchase", oid: "A-1001", void: true }])).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
			expect(purchases()).toEqual([{ val: null, cur: null }]);
			expect(env.raw.prepare("SELECT sid FROM ca_events WHERE name = 'purchase'").get()).toEqual({ sid: SID });
			expect((sess(SID) as { events: number }).events).toBe(1);
		});

		it("answers unknown_order for a void of an order not stored, invalid_value for a void with a value or a negative value", async () => {
			const r = await recordAgentEvents(deps(), "default", [
				{ name: "purchase", oid: "A-9999", void: true },
				{ name: "purchase", oid: "A-1001", void: true, val: 5 },
				{ name: "purchase", val: -5, oid: "A-1002" },
				{ name: "purchase", void: true },
				{ name: "purchase", oid: "A-1001", void: false },
			]);
			expect(r).toEqual({
				accepted: 0,
				duplicates: 0,
				rejected: [
					{ index: 0, reason: "unknown_order" },
					{ index: 1, reason: "invalid_value" },
					{ index: 2, reason: "invalid_value" },
					{ index: 3, reason: "invalid_id" },
					{ index: 4, reason: "invalid_value" },
				],
			});
			expect(evHits()).toEqual([]);
		});

		it("19 new orders and 1 void cost at most 8 statements", async () => {
			await recordAgentEvents(deps(), "default", [{ name: "purchase", val: 1, oid: "A-1001" }]);
			const c = counting();
			const events = [...Array.from({ length: 19 }, (_, i) => ({ name: "purchase", val: 2, oid: `A-${2000 + i}` })), { name: "purchase", oid: "A-1001", void: true }];
			const r = await recordAgentEvents({ ...deps(), db: c.db }, "default", events);
			expect(r).toEqual({ accepted: 19, duplicates: 1, rejected: [] });
			expect(c.n()).toBeLessThanOrEqual(8);
			expect(env.raw.prepare("SELECT COUNT(*) AS n, COUNT(val) AS v FROM ca_events WHERE name = 'purchase'").get()).toEqual({ n: 20, v: 19 });
		});
	});

	it("is set based: three reads, one insert per 9 events and one document update per visit (spy)", async () => {
		const sids = Array.from({ length: 20 }, (_, i) => `s${String(i).padStart(19, "0")}`);
		const aliases = Array.from({ length: 10 }, (_, i) => `a${String(i).padStart(19, "0")}`);
		for (const x of sids) session("default", x, T0 - 100);
		// Ten of the twenty sids reach their session through the alias table.
		for (let i = 0; i < 10; i++) env.raw.prepare("INSERT INTO ca_aliases (site, sid, canon, expires) VALUES ('default', ?, ?, ?)").run(aliases[i], sids[10 + i], T0 + 5000);
		const orders = (n: number, from: number) =>
			Array.from({ length: n }, (_, i) => ({ name: "purchase", val: i + 0.5, oid: `A-${from + i}`, sid: i < 10 ? sids[i] : aliases[i - 10] }));
		for (const [n, from] of [[1, 1000], [5, 2000], [6, 3000], [20, 4000]] as const) {
			const c = counting();
			const r = await recordAgentEvents({ db: c.db, kv: env.kv, settings, now: T0 }, "default", orders(n, from));
			expect(r, `${n} events`).toEqual({ accepted: n, duplicates: 0, rejected: [] });
			// Every order here attaches to its own visit.
			expect(c.n(), `${n} events`).toBeLessThanOrEqual(3 + Math.ceil(n / 9) + n);
		}
		// Every session got exactly the events attached to it, aliased ones on their canonical sid.
		expect((sess(sids[0] as string) as { events: number }).events).toBe(4);
		expect((sess(sids[19] as string) as { events: number }).events).toBe(1);
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_events WHERE sid IN (SELECT sid FROM ca_aliases)").get()).toEqual({ n: 0 });
	});

	it("raises events by 2 for two events of one session in one update and touches no other session field", async () => {
		const cols = "events, last_seen, exit_path, pageviews, engaged_ms, visible_ms, max_scroll, window_s, day, hour, started";
		const before = env.raw.prepare(`SELECT ${cols} FROM ca_sessions WHERE sid = ?`).get(SID) as Record<string, unknown>;
		const c = counting();
		await recordAgentEvents({ db: c.db, kv: env.kv, settings, now: T0 }, "default", [{ name: "purchase", val: 1, sid: SID }, { name: "upsell", val: 2, sid: ALIAS }]);
		expect(c.sql.filter((q) => q.startsWith("UPDATE"))).toHaveLength(1);
		expect(env.raw.prepare(`SELECT ${cols} FROM ca_sessions WHERE sid = ?`).get(SID)).toEqual({ ...before, events: 2 });
	});

	it("adds every new event of a visit to its document, keyed like its row; a repeated order adds nothing", async () => {
		const started = (env.raw.prepare("SELECT started FROM ca_sessions WHERE sid = ?").get(SID) as { started: number }).started;
		const post = (events: unknown[]) => recordAgentEvents({ db: env.db, kv: env.kv, settings, now: T0 }, "default", events);
		await post([{ name: "purchase", val: 9, oid: "A-77", sid: SID, u: "/thanks", p: { plan: "pro" } }, { name: "upsell", sid: ALIAS, ts: T0 - 30 }]);
		const ids = (env.raw.prepare("SELECT id, name FROM ca_events ORDER BY name").all() as Array<{ id: string; name: string }>).map((r) => r.id);
		const doc = entryRows(env.raw, "e.sid = ? AND e.kind = 'ev'", [SID]);
		expect(doc.map((e) => e.id).sort()).toEqual([...ids].sort());
		expect(doc.find((e) => e.name === "purchase")).toMatchObject({ ts: T0, path: "/thanks", props: '{"plan":"pro"}' });
		expect(doc.find((e) => e.name === "upsell")).toMatchObject({ ts: T0 - 30 });
		expect(T0 - started).toBeGreaterThan(0);
		await post([{ name: "purchase", val: 12, oid: "A-77", sid: SID }]);
		expect(entryRows(env.raw, "e.sid = ? AND e.kind = 'ev'", [SID])).toHaveLength(2);
		expect((sess(SID) as { events: number }).events).toBe(2);
	});

	it("an order stored without a visit joins its visit's document when a repeat brings the sid", async () => {
		const post = (events: unknown[]) => recordAgentEvents({ db: env.db, kv: env.kv, settings, now: T0 }, "default", events);
		expect(await post([{ name: "purchase", val: 5, oid: "A-88" }])).toMatchObject({ accepted: 1 });
		expect(entryRows(env.raw, "e.kind = 'ev'")).toHaveLength(0);
		expect(await post([{ name: "purchase", val: 6, oid: "A-88", sid: SID }])).toMatchObject({ accepted: 0, duplicates: 1 });
		expect(entryRows(env.raw, "e.sid = ? AND e.kind = 'ev'", [SID]).map((e) => e.name)).toEqual(["purchase"]);
		expect((sess(SID) as { events: number }).events).toBe(1);
		// A third post changes the amount only.
		await post([{ name: "purchase", val: 7, oid: "A-88", sid: SID }]);
		expect(entryRows(env.raw, "e.sid = ? AND e.kind = 'ev'", [SID])).toHaveLength(1);
		expect((sess(SID) as { events: number }).events).toBe(1);
	});

	it("stores rows that satisfy the revenue join rule (the join fixture)", async () => {
		// A closed session dated two days before the hit, and a session with zero page views.
		env.raw.prepare("UPDATE ca_sessions SET day = '2026-03-11' WHERE sid = ?").run(SID);
		const ZERO = "dddddddddddddddddddd";
		session("default", ZERO, T0 - 100);
		env.raw.prepare("UPDATE ca_sessions SET pageviews = 0 WHERE sid = ?").run(ZERO);
		const r = await recordAgentEvents({ db: env.db, kv: env.kv, settings, now: T0 }, "default", [
			{ name: "purchase", val: 1, oid: "A-1001" },
			{ name: "purchase", val: 2, oid: "A-1002", sid: ALIAS },
			{ name: "purchase", val: 3, sid: SID },
			{ name: "purchase", val: 4, sid: ZERO },
		]);
		expect(r).toEqual({ accepted: 4, duplicates: 0, rejected: [] });
		const rows = env.raw
			.prepare("SELECT h.val, h.day, s.sid FROM ca_events h LEFT JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid WHERE h.site = ? AND h.day BETWEEN ? AND ? AND h.val IS NOT NULL ORDER BY h.val")
			.all("default", 20260301, 20260313);
		expect(rows).toEqual([
			{ val: 1, day: 20260313, sid: null },
			{ val: 2, day: 20260313, sid: SID },
			{ val: 3, day: 20260313, sid: SID },
			{ val: 4, day: 20260313, sid: ZERO },
		]);
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_events WHERE sid = ''").get()).toEqual({ n: 0 });
	});
});

/** Database adapter spy: counts every statement, a batch counts each of its statements. */
function counting() {
	const db = env.db;
	const sql: string[] = [];
	const wrapped = {
		dialect: db.dialect,
		all: (q: string, p?: unknown[]) => (sql.push(q), db.all(q, p as never)),
		run: (q: string, p?: unknown[]) => (sql.push(q), db.run(q, p as never)),
		batch: (stmts: Parameters<typeof db.batch>[0]) => (sql.push(...stmts.map((x) => x.sql)), db.batch(stmts)),
	} as unknown as typeof db;
	return { db: wrapped, sql, n: () => sql.length };
}
