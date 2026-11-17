/**
 * Refunds (docs/revenue.md, section 4): `{ name, oid, rid, refund }` on `agent/v1/events` books a negative amount on
 * the refund's own day with the original order's attribution. Every id, amount and host is invented.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { resetCounters } from "../src/core/recorder.js";
import { zonedToEpoch } from "../src/core/time.js";
import { type Goal, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { KV_WATERMARK, revenueDrift, rollupDay, runRevenue } from "../src/query/rollup.js";
import { normalizeSettings } from "../src/settings.js";
import { schemaDb } from "./helpers.js";

const S1 = "aaaaaaaaaaaaaaaaaaaa";
const S2 = "bbbbbbbbbbbbbbbbbbbb";
const SETTINGS = normalizeSettings({ siteTimezone: "UTC", defaultCurrency: "EUR" });
const NOW = zonedToEpoch("2026-03-13", 1, "UTC");
const at = (day: string, hour = 12) => zonedToEpoch(day, hour, "UTC");
const GOALS: Goal[] = [{ name: "Bought", type: "event", match: "is", value: "purchase" }];
const DAYS = ["2026-03-10", "2026-03-11", "2026-03-12"];

let env: Awaited<ReturnType<typeof schemaDb>>;
const post = (events: unknown[], now = NOW) => recordAgentEvents({ db: env.db, kv: env.kv, settings: SETTINGS, now }, "default", events);
const refund = (oid: string, rid: string, amount: number, day = "2026-03-12", extra: Record<string, unknown> = {}) => ({ name: "purchase", oid, rid, refund: amount, ts: at(day), ...extra });
const rows = () => env.raw.prepare("SELECT id, day, sday, sid, name, path, val, cur FROM ca_events WHERE site = 'default' ORDER BY ts, id").all() as Array<Record<string, unknown>>;

function visit(sid: string, channel: string, source: string | null, country: string, device: string) {
	env.raw
		.prepare(
			"INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, channel, source, country, device) VALUES ('default', ?, ?, '2026-03-10', 10, ?, ?, 1800, '/landing', '/checkout', 2, 0, ?, ?, ?, ?)",
		)
		.run(sid, `k${sid}`, at("2026-03-10", 10), at("2026-03-10", 11), channel, source, country, device);
}

beforeEach(async () => {
	resetCounters();
	clearReportCache();
	env = await schemaDb();
	visit(S1, "Organic Search", "google.com", "DE", "desktop");
	visit(S2, "Direct", null, "FR", "mobile");
	expect(
		await post([
			{ name: "purchase", val: 100, cur: "EUR", oid: "A-1", sid: S1, u: "/checkout", ts: at("2026-03-10", 11) },
			{ name: "purchase", val: 50, cur: "EUR", oid: "A-2", sid: S2, u: "/cart", ts: at("2026-03-10", 11) },
		]),
	).toEqual({ accepted: 2, duplicates: 0, rejected: [] });
});

const ctx = (summary = false): ReportCtx => ({
	db: env.db,
	site: "default",
	settings: SETTINGS,
	now: NOW,
	goals: GOALS,
	funnels: {},
	annotations: [],
	defaultCurrency: "EUR",
	...(summary ? { rawFrom: "2100-01-01", summaryThrough: "2026-03-12" } : {}),
});
const run = (report: ReportName, params: Params = {}, from = "2026-03-10", to = "2026-03-12", summary = false) => {
	clearReportCache();
	return runReport(ctx(summary), { report, query: QuerySchema.parse({ from, to, granularity: "day" }), params });
};

describe("refund ingestion", () => {
	it("books the refund on its own day with the order's visit, page and currency; a retry is stored once", async () => {
		expect(await post([refund("A-1", "R-1", 30)])).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
		expect(await post([refund("A-1", "R-1", 30)])).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
		const r = rows().filter((x) => Number(x.val) < 0);
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({ day: 20260312, sid: S1, name: "purchase", path: "/checkout", val: -30, cur: "EUR" });
		expect(String(r[0]?.id)).toMatch(/^o\.[0-9a-f]{20}\.r[0-9a-f]{20}$/);
		// The visit is never touched.
		const visitRow = () => env.raw.prepare("SELECT * FROM ca_sessions WHERE sid = ?").get(S1);
		const before = visitRow();
		await post([refund("A-1", "R-2", 5)]);
		expect(visitRow()).toEqual(before);
	});

	it("partial, second partial and full refunds; above the order's amount is refund_exceeds_order", async () => {
		expect(await post([refund("A-1", "R-1", 30), refund("A-1", "R-2", 50)])).toEqual({ accepted: 2, duplicates: 0, rejected: [] });
		expect(await post([refund("A-1", "R-3", 20.01)])).toEqual({ accepted: 0, duplicates: 0, rejected: [{ index: 0, reason: "refund_exceeds_order" }] });
		expect(await post([refund("A-1", "R-3", 20)])).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
		expect(await post([refund("A-1", "R-4", 0.01)])).toEqual({ accepted: 0, duplicates: 0, rejected: [{ index: 0, reason: "refund_exceeds_order" }] });
		// A retry of a stored refund is still a duplicate once the order is fully refunded.
		expect(await post([refund("A-1", "R-2", 50)])).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
	});

	it("rejects an unknown order, another currency, bad fields and a refund dated before its order", async () => {
		const res = await post([
			refund("NOPE", "R-1", 10),
			refund("A-1", "R-1", 10, "2026-03-12", { cur: "USD" }),
			refund("A-1", "R-2", 10, "2026-03-12", { cur: "eur" }),
			refund("A-1", "R-3", -5),
			{ name: "purchase", oid: "A-1", refund: 5 },
			refund("A-1", "R-4", 5, "2026-03-12", { val: 5 }),
			refund("A-1", "R-5", 5, "2026-03-12", { ts: at("2026-03-09") }),
			refund("A-1", "R-6", 0.001),
		]);
		expect(res).toEqual({
			accepted: 1,
			duplicates: 0,
			rejected: [
				{ index: 0, reason: "unknown_order" },
				{ index: 1, reason: "currency_mismatch" },
				{ index: 3, reason: "invalid_value" },
				{ index: 4, reason: "invalid_id" },
				{ index: 5, reason: "invalid_value" },
				{ index: 6, reason: "invalid_ts" },
				{ index: 7, reason: "invalid_value" },
			],
		});
	});

	it("void then refund is refused; refund then void voids the refunds too", async () => {
		await post([{ name: "purchase", oid: "A-2", void: true }]);
		expect(await post([refund("A-2", "R-1", 10)])).toEqual({ accepted: 0, duplicates: 0, rejected: [{ index: 0, reason: "refund_exceeds_order" }] });
		await post([refund("A-1", "R-1", 40)]);
		await post([{ name: "purchase", oid: "A-1", void: true }]);
		expect(rows().every((x) => x.val === null)).toBe(true);
		const r = await run("revenue");
		expect(r.data.totals).toMatchObject({ revenue: 0, refunds: 0, net_revenue: 0, orders: 0 });
	});

	it("a correction keeps working and the refund limit follows the corrected amount", async () => {
		expect(await post([{ name: "purchase", val: 60, cur: "EUR", oid: "A-1" }])).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
		expect(await post([refund("A-1", "R-1", 61)])).toMatchObject({ rejected: [{ index: 0, reason: "refund_exceeds_order" }] });
		expect(await post([refund("A-1", "R-1", 60)])).toMatchObject({ accepted: 1 });
	});
});

describe("refunds in the reports", () => {
	beforeEach(async () => {
		await post([refund("A-1", "R-1", 30)]);
	});

	it("gross revenue, refunds and net per currency; orders and paying sessions unchanged", async () => {
		const r = await run("revenue");
		expect(r.data.totals).toMatchObject({ revenue: 150, refunds: 30, net_revenue: 120, orders: 2, paying_sessions: 2, aov: 75 });
		// The refund's day alone: no order, the refund, a negative net.
		const day = await run("revenue", {}, "2026-03-12", "2026-03-12");
		expect(day.data.totals).toMatchObject({ revenue: 0, refunds: 30, net_revenue: -30, orders: 0, paying_sessions: 0 });
		expect(day.data.currencies).toEqual([expect.objectContaining({ currency: "EUR", orders: 0, refunds: 30 })]);
	});

	it("the series books the refund on its own day", async () => {
		const s = (await run("revenue_series", {}, "2026-03-10", "2026-03-12")).data.series ?? [];
		expect(s.map((p) => [p.t, p.revenue, p.refunds, p.net_revenue, p.orders])).toEqual([
			["2026-03-10", 150, 0, 150, 2],
			["2026-03-11", 0, 0, 0, 0],
			["2026-03-12", 0, 30, -30, 0],
		]);
	});

	it("each breakdown carries the original order's attribution", async () => {
		const by = async (dim: string) => (await run("revenue_breakdown", { dim })).data.rows?.map((r) => [r.key, r.revenue, r.refunds, r.net_revenue, r.orders]);
		expect(await by("channel")).toEqual([
			["Organic Search", 100, 30, 70, 1],
			["Direct", 50, 0, 50, 1],
		]);
		expect(await by("source")).toEqual([
			["google.com", 100, 30, 70, 1],
			["(not set)", 50, 0, 50, 1],
		]);
		expect(await by("page")).toEqual([
			["/checkout", 100, 30, 70, 1],
			["/cart", 50, 0, 50, 1],
		]);
		expect((await by("country"))?.[0]).toEqual(["DE", 100, 30, 70, 1]);
		expect((await by("device"))?.[0]).toEqual(["desktop", 100, 30, 70, 1]);
		expect((await by("entry"))?.[0]).toEqual(["/landing", 150, 30, 120, 2]);
		expect((await by("goal"))?.[0]).toEqual(["Bought", 150, 30, 120, 2]);
		expect((await by("event"))?.[0]).toEqual(["purchase", 150, 30, 120, 2]);
		const ch = await runReport(ctx(), { report: "channels", query: QuerySchema.parse({ from: "2026-03-10", to: "2026-03-12" }), params: { withRevenue: true } });
		expect(ch.data.rows?.find((r) => r.key === "Organic Search")).toMatchObject({ revenue: 100, refunds: 30, orders: 1 });
	});

	it("a refund-only key ranks before keys without money, so a row limit keeps it", async () => {
		await post([refund("A-1", "R-1", 30)]);
		// A visit without revenue on the refund's day: a key with visitors and nothing else, sorting first by name.
		env.raw
			.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, channel) VALUES ('default', 's-zero', 'kzero', '2026-03-12', 10, ?, ?, 1800, '/a', '/a', 1, 0, 'Direct')")
			.run(at("2026-03-12", 10), at("2026-03-12", 10));
		clearReportCache();
		const r = await runReport(ctx(), { report: "revenue_breakdown", query: QuerySchema.parse({ from: "2026-03-12", to: "2026-03-12", granularity: "day" }), params: { dim: "channel" }, limit: 1 });
		expect(r.data.rows?.map((x) => [x.key, x.refunds])).toEqual([["Organic Search", 30]]);
	});

	it("the summary engine agrees with the detailed one on every revenue report", async () => {
		for (const d of DAYS) await rollupDay({ db: env.db, site: "default", settings: SETTINGS, goals: GOALS }, d);
		const cases: Array<[ReportName, Params]> = [
			["revenue", {}],
			["revenue_series", {}],
			...["channel", "source", "campaign", "entry", "page", "country", "device", "goal", "event"].map((dim): [ReportName, Params] => ["revenue_breakdown", { dim }]),
		];
		for (const [report, params] of cases)
			for (const [from, to] of [
				["2026-03-10", "2026-03-12"],
				["2026-03-12", "2026-03-12"],
				["2026-03-12", "2026-03-13"],
			] as const) {
				const a = await run(report, params, from, to);
				const b = await run(report, params, from, to, true);
				expect(b.notices ?? [], `${report} ${JSON.stringify(params)}`).toContain("summary");
				const pick = (x: typeof a) => JSON.stringify({ totals: x.data.totals, series: x.data.series, currencies: x.data.currencies, rows: x.data.rows?.map(({ visitors: _v, sessions: _s, revenue_per_visitor: _r, ...r }) => r) });
				expect(pick(b), `${report} ${JSON.stringify(params)} ${from}..${to}`).toBe(pick(a));
			}
		// A segment filter on summary data reads the pair rows of the refunds too.
		const f = { from: "2026-03-10", to: "2026-03-12", filters: [{ dim: "country", op: "is", values: ["DE"] }] };
		clearReportCache();
		const fa = await runReport(ctx(), { report: "revenue_breakdown", query: QuerySchema.parse(f), params: { dim: "page" } });
		clearReportCache();
		const fb = await runReport(ctx(true), { report: "revenue_breakdown", query: QuerySchema.parse(f), params: { dim: "page" } });
		expect(fb.data.rows?.map((r) => [r.key, r.revenue, r.refunds])).toEqual(fa.data.rows?.map((r) => [r.key, r.revenue, r.refunds]));
		expect(fa.data.rows?.map((r) => [r.key, r.revenue, r.refunds])).toEqual([["/checkout", 100, 30]]);
	});

	it("a refund on a closed day after its summary is stored is caught by the revenue task", async () => {
		const rc = { db: env.db, site: "default", settings: SETTINGS, goals: GOALS };
		for (const d of DAYS) await rollupDay(rc, d);
		expect(await revenueDrift(env.db, "default", "2026-03-10", "2026-03-12")).toEqual([]);
		await post([refund("A-2", "R-9", 20, "2026-03-11")]);
		expect(await revenueDrift(env.db, "default", "2026-03-10", "2026-03-12")).toEqual(["2026-03-11"]);
		await env.kv.set(KV_WATERMARK, "2026-03-12");
		const t = await runRevenue({ db: env.db, settings: SETTINGS, goals: async () => GOALS }, env.kv, NOW, "2026-02-01");
		expect(t.sites[0]?.recomputed).toEqual(["2026-03-11"]);
		expect(await revenueDrift(env.db, "default", "2026-03-10", "2026-03-12")).toEqual([]);
		const b = await run("revenue_breakdown", { dim: "channel" }, "2026-03-11", "2026-03-11", true);
		expect(b.data.rows?.map((r) => [r.key, r.revenue, r.refunds, r.net_revenue])).toContainEqual(["Direct", 0, 20, -20]);
		// The refund rows of the summary have their own dim; no order row is written for a day without orders.
		const stored = env.raw.prepare("SELECT dim, key, orders, revenue, sessions FROM ca_revenue_daily WHERE site = 'default' AND day = '2026-03-11' AND seg = '' ORDER BY dim, key").all();
		expect(stored).toContainEqual({ dim: "refund.all", key: "", orders: 0, revenue: 20, sessions: 0 });
		expect(stored).toContainEqual({ dim: "refund.channel", key: "Direct", orders: 0, revenue: 20, sessions: 0 });
		expect(stored.some((r) => (r as { dim: string }).dim === "all")).toBe(false);
	});

	it("an order of a closed day that gains its visit later is caught by the revenue task", async () => {
		await post([{ name: "purchase", val: 30, cur: "EUR", oid: "A-3", ts: at("2026-03-10", 11) }]);
		const rc = { db: env.db, site: "default", settings: SETTINGS, goals: GOALS };
		for (const d of DAYS) await rollupDay(rc, d);
		expect(await revenueDrift(env.db, "default", "2026-03-10", "2026-03-12")).toEqual([]);
		// The same order again, now with its visit: the totals stay, the attribution changes.
		await post([{ name: "purchase", val: 30, cur: "EUR", oid: "A-3", sid: S1, ts: at("2026-03-10", 11) }]);
		expect(await revenueDrift(env.db, "default", "2026-03-10", "2026-03-12")).toEqual(["2026-03-10"]);
		await env.kv.set(KV_WATERMARK, "2026-03-12");
		await runRevenue({ db: env.db, settings: SETTINGS, goals: async () => GOALS }, env.kv, NOW, "2026-02-01");
		const sum = await run("revenue_breakdown", { dim: "channel" }, "2026-03-10", "2026-03-10", true);
		const raw = await run("revenue_breakdown", { dim: "channel" }, "2026-03-10", "2026-03-10");
		expect(sum.data.rows).toEqual(raw.data.rows);
		expect(raw.data.rows?.map((r) => [r.key, r.revenue])).toContainEqual(["Organic Search", 130]);
	});

	it("an order whose visit retention deleted is not a difference", async () => {
		const rc = { db: env.db, site: "default", settings: SETTINGS, goals: GOALS };
		for (const d of DAYS) await rollupDay(rc, d);
		env.raw.prepare("DELETE FROM ca_sessions WHERE site = 'default' AND sid = ?").run(S1);
		expect(await revenueDrift(env.db, "default", "2026-03-10", "2026-03-12")).toEqual([]);
		// Stored again after the visit went (rollup-now from Reclassify, a void): the order sits in (not set), still no difference.
		const before = env.raw.prepare("SELECT orders FROM ca_revenue_daily WHERE site = 'default' AND dim = 'channel' AND key = '(not set)' AND seg = ''").all();
		for (const d of DAYS) await rollupDay(rc, d);
		expect(env.raw.prepare("SELECT orders FROM ca_revenue_daily WHERE site = 'default' AND dim = 'channel' AND key = '(not set)' AND seg = ''").all()).not.toEqual(before);
		expect(await revenueDrift(env.db, "default", "2026-03-10", "2026-03-12")).toEqual([]);
	});
});
