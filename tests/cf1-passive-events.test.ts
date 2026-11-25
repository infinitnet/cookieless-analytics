/**
 * The link impression `seen` is sent by the page without a visitor action: it is stored (the Links report counts
 * it) but adds nothing to the visit's `events`, so a session with only a page view and an impression is a bounce.
 * A click or a custom event still makes the session engaged. Synthetic data only.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { type IngestBody, isPassiveEvent, LINK_EVENTS } from "../src/contract.js";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { MAX_DOC_BYTES } from "../src/core/apply.js";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { MemorySessionStore, resolveSession, type ResolveMeta } from "../src/core/session.js";
import { parseUa } from "../src/core/ua.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type ReportName, runReport } from "../src/query/reports/index.js";
import { rollupDay } from "../src/query/rollup.js";
import { normalizeSettings } from "../src/settings.js";
import { CHROME_UA, eventRequest, schemaDb } from "./helpers.js";

const DAY = "2026-06-10";
const T0 = Date.parse(`${DAY}T12:00:00Z`) / 1000;
const SETTINGS = normalizeSettings({ siteTimezone: "UTC" });
const body = (b: Record<string, unknown>) => validateIngest({ v: 1, ...b }) as IngestBody;
const sid = (n: number) => `${"s".repeat(19)}${n}`;

let env: Awaited<ReturnType<typeof schemaDb>>;
beforeEach(async () => {
	resetCounters();
	clearReportCache();
	env = await schemaDb();
});

const deps = (now: number) => ({ db: env.db, kv: env.kv, settings: SETTINGS, now });
/** One visit: a page view, then the given events a few seconds later; each visit comes from its own address. */
async function visit(n: number, events: ReadonlyArray<Record<string, unknown>>) {
	const info = requestInfo(eventRequest("{}", { "user-agent": CHROME_UA, "cf-connecting-ip": `2001:db8:${n.toString(16)}::7` }));
	expect(await recordClientEvent(deps(T0 + n * 60), body({ t: "pv", sid: sid(n), h: `hhhhhhhhhhh${n}`, u: "/offers", w: 1440 }), info)).toBe("ok");
	for (const [i, e] of events.entries()) expect(await recordClientEvent(deps(T0 + n * 60 + 2 + i), body({ t: "ev", sid: sid(n), u: "/offers", ...e }), info)).toBe("ok");
}
const events = (n: number) => (env.raw.prepare("SELECT events FROM ca_sessions WHERE sid = ?").get(sid(n)) as { events: number }).events;
const ctx = (): ReportCtx => ({ db: env.db, site: "default", settings: SETTINGS, now: T0 + 86_400 * 3, goals: [], funnels: {}, annotations: [] });
const run = (rc: ReportCtx, report: ReportName, params?: Record<string, unknown>) =>
	runReport(rc, { report, query: QuerySchema.parse({ from: DAY, to: DAY, granularity: "day" }), limit: 100, ...(params ? { params } : {}) });

const SEEN = { name: LINK_EVENTS.view, p: { s0: "alpha-offer", s1: "beta-offer@table" } };
const CLICK = { name: LINK_EVENTS.click, p: { slug: "alpha-offer" } };
const CUSTOM = { name: "signup" };

describe("cf1: a link impression engages no session", () => {
	it("cf1: only seen is passive", () => {
		expect(isPassiveEvent(LINK_EVENTS.view)).toBe(true);
		for (const n of [LINK_EVENTS.click, LINK_EVENTS.sale, "signup", "_outbound", undefined]) expect(isPassiveEvent(n)).toBe(false);
	});

	it("cf1: a page view with only link impressions is a bounce; a click or a custom event engages", async () => {
		await visit(1, [SEEN, SEEN]);
		await visit(2, [SEEN, CLICK]);
		await visit(3, [CUSTOM]);
		expect([events(1), events(2), events(3)]).toEqual([0, 1, 1]);
		const t = (await run(ctx(), "overview")).data.totals;
		expect(t).toMatchObject({ sessions: 3, bounce_rate: 0.3333, engaged_rate: 0.6667 });
		expect(Number(t?.bounce_rate) + Number(t?.engaged_rate)).toBeCloseTo(1, 4);
		// The impressions are still stored and counted by the Links report.
		const links = (await run(ctx(), "links")).data.rows ?? [];
		expect(links.find((r) => r.key === "alpha-offer")).toMatchObject({ impressions: 3, clicks: 1 });
		expect(links.find((r) => r.key === "beta-offer")).toMatchObject({ impressions: 3, clicks: 0 });
	});

	it("cf1: the day summary agrees with the detailed read", async () => {
		await visit(1, [SEEN]);
		await visit(2, [CLICK]);
		await visit(3, []);
		await visit(4, [SEEN, CUSTOM]);
		const live = ctx();
		await rollupDay({ db: env.db, site: "default", settings: SETTINGS, goals: [] }, DAY);
		for (const report of ["overview", "channels", "entry_pages", "timeseries"] as const) {
			clearReportCache();
			const a = (await run(live, report)).data;
			clearReportCache();
			const b = (await run({ ...live, rawFrom: "2030-01-01" }, report)).data;
			expect(b.totals ?? b.rows ?? b.series).toEqual(a.totals ?? a.rows ?? a.series);
		}
		expect((await run(live, "overview")).data.totals).toMatchObject({ sessions: 4, bounce_rate: 0.5, engaged_rate: 0.5 });
	});

	it("cf1: an impression that opens the visit before its page view leaves events at 0", async () => {
		const info = requestInfo(eventRequest("{}", { "user-agent": CHROME_UA }));
		expect(await recordClientEvent(deps(T0), body({ t: "ev", sid: sid(5), u: "/offers", ...SEEN }), info)).toBe("ok");
		expect(await recordClientEvent(deps(T0 + 1), body({ t: "pv", sid: sid(5), h: "hhhhhhhhhhh5", u: "/offers", w: 1440 }), info)).toBe("ok");
		expect(env.raw.prepare("SELECT pageviews, events FROM ca_sessions").all()).toEqual([{ pageviews: 1, events: 0 }]);
		expect((await run(ctx(), "overview")).data.totals).toMatchObject({ sessions: 1, bounce_rate: 1 });
	});

	it("cf1: the in-memory session rules mirror the stored counter", async () => {
		const store = new MemorySessionStore();
		const meta: ResolveMeta = { site: "default", ua: parseUa(CHROME_UA), vkeyFor: async () => "k1" };
		const cfg = { ...SETTINGS, maxSessionMinutes: 1440 };
		const first = await resolveSession({ t: "pv", sid: sid(6), u: "/" }, meta, T0, cfg, store);
		await resolveSession({ t: "ev", sid: sid(6), u: "/", passive: true }, meta, T0 + 1, cfg, store);
		const passive = await resolveSession({ t: "ev", sid: sid(6), u: "/", passive: true }, meta, T0 + 2, cfg, store);
		expect(passive.session.events).toBe(0);
		const counted = await resolveSession({ t: "ev", sid: sid(6), u: "/" }, meta, T0 + 3, cfg, store);
		expect([first.session.events, counted.session.events]).toEqual([0, 1]);
		const opened = await resolveSession({ t: "ev", sid: sid(7), u: "/", passive: true }, { ...meta, vkeyFor: async () => "k2" }, T0, cfg, store);
		expect(opened.created).toBe(true);
		expect(opened.session.events).toBe(0);
	});

	it("cf1: server reported impressions attached to a visit are stored but not counted", async () => {
		await visit(8, []);
		const out = await recordAgentEvents(deps(T0 + 600), "default", [
			{ name: LINK_EVENTS.view, sid: sid(8), p: { s0: "alpha-offer" } },
			{ name: "signup", sid: sid(8) },
		]);
		expect(out.accepted).toBe(2);
		expect(events(8)).toBe(1);
	});

	it("cf1: a passive event on a full document is dropped as session_cap, not refused", async () => {
		await visit(9, []);
		const pad = "x".repeat(MAX_DOC_BYTES);
		env.raw.prepare("UPDATE ca_sessions SET hits = json_set(hits, '$.pad', json_object('t', 0, 'p', ?)) WHERE sid = ?").run(pad, sid(9));
		const info = requestInfo(eventRequest("{}", { "user-agent": CHROME_UA, "cf-connecting-ip": "2001:db8:9::7" }));
		expect(await recordClientEvent(deps(T0 + 9 * 60 + 5), body({ t: "ev", sid: sid(9), u: "/offers", ...SEEN }), info)).toBe("session_cap");
		// A counted event is still bounded by the event cap only.
		expect(await recordClientEvent(deps(T0 + 9 * 60 + 6), body({ t: "ev", sid: sid(9), u: "/offers", ...CUSTOM }), info)).toBe("ok");
		expect(events(9)).toBe(1);
	});
});
