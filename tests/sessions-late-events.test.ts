import { beforeEach, describe, expect, it } from "vitest";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { QuerySchema } from "../src/query/filters.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { normalizeSettings } from "../src/settings.js";
import { eventRequest, schemaDb } from "./helpers.js";

const T0 = Date.parse("2026-06-10T12:00:00Z") / 1000;
const A = "aaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbb";
let env: Awaited<ReturnType<typeof schemaDb>>;
beforeEach(async () => {
	resetCounters();
	env = await schemaDb();
});
// biome-ignore lint/suspicious/noExplicitAny: test bodies
const body = (b: Record<string, unknown>) => validateIngest({ v: 1, ...b }) as any;
const info = () => ({ ...requestInfo(eventRequest("{}", {})), hasOrigin: true });
const deps = (now: number) => ({ db: env.db, kv: env.kv, settings: normalizeSettings({ acceptClientRevenue: true, defaultCurrency: "EUR" }), now });
const send = (now: number, b: Record<string, unknown>) => recordClientEvent(deps(now), body(b), info());
const report = async (name: string, params: Record<string, unknown> = {}) => {
	clearReportCache();
	const rc = { db: env.db, site: "default", settings: normalizeSettings({}), now: T0 + 7200, goals: [{ name: "Signup", type: "event", match: "is", value: "signup", active: true }], funnels: {}, annotations: [], defaultCurrency: "EUR" };
	// biome-ignore lint/suspicious/noExplicitAny: report context and rows
	return (await runReport(rc as any, { report: name as any, query: QuerySchema.parse({ from: "2026-06-10", to: "2026-06-10" }), params })).data as any;
};
const visits = () => env.raw.prepare("SELECT sid, pageviews, events, channel, last_seen - started AS dur FROM ca_sessions ORDER BY started, sid").all();

describe("an event after the session window on the same page", () => {
	it("joins the visit of its sid: events, goals and revenue by channel keep it, the duration skips the idle time", async () => {
		expect(await send(T0, { t: "pv", sid: A, h: "hhhhhhhhhhh1", u: "/pricing", r: "https://www.google.com/", n: 1, w: 1440 })).toBe("ok");
		expect(await send(T0 + 900, { t: "en", sid: A, h: "hhhhhhhhhhh1", d: 600000, e: 900000, s: 80, i: 1, x: 0 })).toBe("ok");
		expect(await send(T0 + 31 * 60, { t: "ev", sid: A, h: "eeeeeeeeeee1", name: "signup", u: "/pricing" })).toBe("ok");
		expect(await send(T0 + 31 * 60 + 5, { t: "ev", sid: A, h: "eeeeeeeeeee2", name: "purchase", u: "/pricing", val: 49, cur: "EUR", oid: "o-1" })).toBe("ok");
		expect(visits()).toEqual([{ sid: A, pageviews: 1, events: 2, channel: "Organic Search", dur: 0 }]);
		expect((await report("events")).rows).toMatchObject([{ key: "purchase", events: 1 }, { key: "signup", events: 1 }]);
		expect((await report("goals")).rows).toMatchObject([{ key: "Signup", completions: 1, converting: 1 }]);
		const rev = (await report("revenue_breakdown", { dim: "channel" })).rows;
		expect(rev).toMatchObject([{ key: "Organic Search", orders: 1 }]);
		expect(rev.some((r: { key: string }) => r.key === "(not set)")).toBe(false);
	});

	it("an event inside the window still moves last_seen", async () => {
		await send(T0, { t: "pv", sid: A, h: "hhhhhhhhhhh1", u: "/a", n: 1, w: 1440 });
		await send(T0 + 600, { t: "ev", sid: A, h: "eeeeeeeeeee1", name: "x", u: "/a" });
		expect(visits()).toEqual([{ sid: A, pageviews: 1, events: 1, channel: "Direct", dur: 600 }]);
	});

	it("a page view after the window still starts a new visit", async () => {
		await send(T0, { t: "pv", sid: A, h: "hhhhhhhhhhh1", u: "/a", n: 1, w: 1440 });
		await send(T0 + 31 * 60, { t: "pv", sid: A, h: "hhhhhhhhhhh2", u: "/b", n: 0, w: 1440 });
		expect(visits().map((v) => (v as { pageviews: number }).pageviews)).toEqual([1, 1]);
	});

	it("an event whose sid has no stored visit still creates a visit", async () => {
		expect(await send(T0, { t: "ev", sid: B, h: "eeeeeeeeeee1", name: "x", u: "/a" })).toBe("ok");
		expect(visits()).toEqual([{ sid: B, pageviews: 0, events: 1, channel: "Direct", dur: 0 }]);
	});
});

describe("an engagement update of a later page after a long read", () => {
	it("reaches the visit through the alias 35 minutes later", async () => {
		await send(T0, { t: "pv", sid: A, h: "hhhhhhhhhhh1", u: "/a", n: 1, w: 1440 });
		await send(T0 + 60, { t: "pv", sid: B, h: "hhhhhhhhhhh2", u: "/long-read", n: 1, w: 1440 });
		expect(await send(T0 + 60 + 35 * 60, { t: "en", sid: B, h: "hhhhhhhhhhh2", d: 1500000, e: 2100000, s: 100, i: 1, x: 1 })).toBe("ok");
		const row = env.raw.prepare("SELECT engaged_ms, json(hits) AS hits FROM ca_sessions WHERE sid = ?").get(A) as { engaged_ms: number; hits: string };
		expect(row.engaged_ms).toBe(1500000);
		expect(JSON.parse(row.hits).hhhhhhhhhhh2).toMatchObject({ d: 1500000, e: 2100000, s: 100, x: 1 });
	});

	it("a sid aliased to a visit that ended starts a new visit and its events follow it", async () => {
		await send(T0, { t: "pv", sid: A, h: "hhhhhhhhhhh1", u: "/a", n: 1, w: 1440 });
		// A second document joins the visit through the visitor key: alias B to A.
		await send(T0 + 60, { t: "pv", sid: B, h: "hhhhhhhhhhh2", u: "/b", n: 1, w: 1440 });
		// 40 minutes later the same document navigates in app: a new visit, and B's alias moves to it.
		await send(T0 + 60 + 40 * 60, { t: "pv", sid: B, h: "hhhhhhhhhhh3", u: "/c", n: 0, w: 1440 });
		await send(T0 + 60 + 41 * 60, { t: "ev", sid: B, h: "eeeeeeeeeee1", name: "signup", u: "/c" });
		const v = visits() as Array<{ sid: string; pageviews: number; events: number }>;
		expect(v.map((x) => [x.sid === A, x.pageviews, x.events])).toEqual([
			[true, 2, 0],
			[false, 1, 1],
		]);
	});
});
