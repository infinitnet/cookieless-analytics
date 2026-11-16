/** Write path regressions: a page view stored after its own event, and orders whose visit document write failed or came late. */
import { beforeEach, describe, expect, it } from "vitest";
import { validateIngest } from "../../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../../src/core/recorder.js";
import type { Db } from "../../src/db/adapter.js";
import { normalizeSettings } from "../../src/settings.js";
import { entryRows, eventRequest, schemaDb } from "../helpers.js";
import { OVERLOAD } from "./gate.helpers.js";

const T0 = Date.parse("2026-06-10T12:00:00Z") / 1000;
const SID = "abcdefghij0123456789";
const settings = normalizeSettings({});
const info = () => requestInfo(eventRequest("{}", { "cf-connecting-ip": "2001:db8:7::1" }));
const body = (b: Record<string, unknown>) => validateIngest({ v: 1, ...b }) as NonNullable<ReturnType<typeof validateIngest>>;

beforeEach(() => resetCounters());

describe("a page view stored after its own event", () => {
	it("is a page view, not a reload, when the event opened the visit first (a retried page view)", async () => {
		const env = await schemaDb();
		const deps = (now: number) => ({ db: env.db, kv: env.kv, settings, now });
		// The first page view of a page load (fresh sid, so the slow path) was refused with a 503; its event got through and opened the visit; the retry arrives later.
		expect(await recordClientEvent(deps(T0 + 1), body({ t: "ev", sid: SID, h: "evevevevev01", name: "signup", u: "/a" }), info())).toBe("ok");
		expect(await recordClientEvent(deps(T0 + 2), body({ t: "pv", sid: SID, n: 1, h: "pvpvpvpvpv01", u: "/a", w: 1440 }), info())).toBe("ok");
		expect(env.raw.prepare("SELECT pageviews, events FROM ca_sessions").all()).toEqual([{ pageviews: 1, events: 1 }]);
		// A real reload (a fresh sid of the same visitor, same page, within the dedupe time) is still not counted.
		expect(await recordClientEvent(deps(T0 + 3), body({ t: "pv", sid: "zzzzzzzzzz0123456789", n: 1, h: "pvpvpvpvpv02", u: "/a", w: 1440 }), info())).toBe("reload");
	});
});

describe("an order whose document write failed after its row was stored", () => {
	it("gets its entry on the retry; a true duplicate stays a duplicate at 0 rows", async () => {
		const env = await schemaDb();
		let failNext = false;
		const db: Db = {
			...env.db,
			run: (sql, p) => env.db.run(sql, p),
			all: async (sql, p) => {
				if (failNext && /^UPDATE ca_sessions/.test(sql)) {
					failNext = false;
					throw new Error(OVERLOAD);
				}
				const rows = await env.db.all(sql, p);
				if (/^INSERT INTO ca_events/.test(sql) && rows.length) failNext = true;
				return rows as never;
			},
		};
		const deps = (now: number) => ({ db, kv: env.kv, settings, now });
		expect(await recordClientEvent(deps(T0), body({ t: "pv", sid: SID, h: "pvpvpvpvpv01", u: "/shop", w: 1440 }), info())).toBe("ok");
		const order = body({ t: "ev", sid: SID, h: "ororororor01", name: "purchase", u: "/shop", val: 12.5, cur: "EUR", oid: "A-1" });
		await expect(recordClientEvent(deps(T0 + 4), order, info())).rejects.toThrow(/overloaded/);
		expect(entryRows(env.raw).filter((e) => e.kind === "ev")).toHaveLength(0);
		// The retry (the route's own, or the page script's) finds the row and adds the missing entry.
		expect(await recordClientEvent(deps(T0 + 9), order, info())).toBe("ok");
		expect(entryRows(env.raw).filter((e) => e.kind === "ev").map((e) => e.name)).toEqual(["purchase"]);
		expect(env.raw.prepare("SELECT pageviews, events FROM ca_sessions").all()).toEqual([{ pageviews: 1, events: 1 }]);
		// A thank-you page reload with the same order id: still one entry, one row, counted as a duplicate.
		expect(await recordClientEvent(deps(T0 + 30), order, info())).toBe("duplicate_order");
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_events").get()).toEqual({ n: 1 });
		expect(env.raw.prepare("SELECT events FROM ca_sessions").get()).toEqual({ events: 1 });
	});
});

describe("an order whose row was stored before its visit existed (documented residual)", () => {
	it("stays a duplicate_order without an entry; the order row and its amount are kept", async () => {
		const env = await schemaDb();
		let fail = true;
		const db: Db = {
			...env.db,
			all: async (sql, p) => {
				// The order is the first event of a fresh sid: its row is stored without a visit, then the visit write fails.
				if (fail && /^INSERT INTO ca_sessions/.test(sql)) {
					fail = false;
					throw new Error(OVERLOAD);
				}
				return (await env.db.all(sql, p)) as never;
			},
		};
		const deps = (now: number) => ({ db, kv: env.kv, settings, now });
		const order = body({ t: "ev", sid: SID, h: "ororororor02", name: "purchase", u: "/shop", val: 30, cur: "USD", oid: "A-2" });
		await expect(recordClientEvent(deps(T0), order, info())).rejects.toThrow(/overloaded/);
		expect(env.raw.prepare("SELECT sid, val, cur FROM ca_events").all()).toEqual([{ sid: null, val: 30, cur: "USD" }]);
		// The retry cannot tell this row from an agent's unattributed order, which a browser post must not claim.
		expect(await recordClientEvent(deps(T0 + 5), order, info())).toBe("duplicate_order");
		expect(entryRows(env.raw)).toEqual([]);
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_sessions").get()).toEqual({ n: 0 });
		expect(env.raw.prepare("SELECT sid, val, cur FROM ca_events").all()).toEqual([{ sid: null, val: 30, cur: "USD" }]);
	});
});
