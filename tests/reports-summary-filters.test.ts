/**
 * Filters the daily summaries cannot answer: the summary plan refuses them, so inside the detailed
 * window the detailed rows answer (the expected values are the detailed answers), and before it the summary answer
 * names each refused filter with `filter_unavailable`. One stored day: three visits and one order without a visit.
 *
 *   V1 Direct, DE, Chrome desktop: /a, /checkout; signup; orders 10 EUR on /a and 40 EUR on /checkout
 *   V2 Organic Search (google), US, iPhone: /, /a; order 25 EUR on /a
 *   V3 Paid Search (utm_campaign spring), FR, Chrome desktop: /b
 *   Agent order without a visit: 33 EUR
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { zonedToEpoch } from "../src/core/time.js";
import { type Filter, type Goal, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport, SCAN_BUDGET } from "../src/query/reports/index.js";
import { rollupDay } from "../src/query/rollup.js";
import { normalizeSettings } from "../src/settings.js";
import { IPHONE_UA } from "./fixtures/seed.js";
import { CHROME_UA, eventRequest, schemaDb } from "./helpers.js";

const TZ = "Europe/Berlin";
const DAY = "2026-03-10";
const GOALS: Goal[] = [
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Buy", type: "event", match: "is", value: "purchase" },
];
const f = (dim: Filter["dim"], op: Filter["op"], ...values: string[]): Filter => ({ dim, op, values });
let raw: ReportCtx;
let win: ReportCtx;
let before: ReportCtx;
const budget = SCAN_BUDGET.standard;

beforeAll(async () => {
	resetCounters();
	const env = await schemaDb();
	const settings = normalizeSettings({ siteTimezone: TZ, defaultCurrency: "EUR" });
	const t0 = zonedToEpoch(DAY, 10, TZ);
	let n = 0;
	const body = (b: Record<string, unknown>) => validateIngest({ v: 1, ...b }, 7_200_000) as NonNullable<ReturnType<typeof validateIngest>>;
	const visit = async (sid: string, ua: string, ip: string, country: string, first: Record<string, unknown>, steps: Array<Record<string, unknown>>) => {
		const info = requestInfo(eventRequest("{}", { "user-agent": ua, "cf-connecting-ip": ip, "cf-ipcountry": country }));
		for (const [i, s] of steps.entries()) {
			const at = t0 + n * 600 + i * 30;
			const b = s.name ? { t: "ev", sid, h: `x${String(++n).padStart(11, "0")}`, ...s } : { t: "pv", sid, h: `h${String(++n).padStart(11, "0")}`, w: 1440, ...s, ...(i === 0 ? first : {}) };
			expect(await recordClientEvent({ db: env.db, kv: env.kv, settings, now: at }, body(b), info)).toBe("ok");
		}
	};
	await visit("v1aaaaaaaaaaaaaaaaaa", CHROME_UA, "198.51.100.7", "DE", {}, [
		{ u: "/a" },
		{ name: "signup", u: "/a" },
		{ name: "purchase", u: "/a", val: 10, cur: "EUR", oid: "O-1" },
		{ u: "/checkout" },
		{ name: "purchase", u: "/checkout", val: 40, cur: "EUR", oid: "O-2" },
	]);
	await visit("v2aaaaaaaaaaaaaaaaaa", IPHONE_UA, "198.51.100.8", "US", { r: "https://www.google.com/" }, [{ u: "/" }, { u: "/a" }, { name: "purchase", u: "/a", val: 25, cur: "EUR", oid: "O-3" }]);
	await visit("v3aaaaaaaaaaaaaaaaaa", CHROME_UA, "198.51.100.9", "FR", { r: "https://www.google.com/" }, [{ u: "/b?utm_source=google&utm_medium=cpc&utm_campaign=spring" }]);
	expect(await recordAgentEvents({ db: env.db, kv: env.kv, settings, now: t0 + 7200 }, "default", [{ name: "purchase", val: 33, cur: "EUR", oid: "O-4" }])).toMatchObject({ accepted: 1 });
	await rollupDay({ db: env.db, site: "default", settings, goals: GOALS }, DAY);
	raw = { db: env.db, site: "default", settings, now: zonedToEpoch("2026-03-13", 12, TZ), goals: GOALS, funnels: {}, annotations: [], defaultCurrency: "EUR" };
	// Inside the window with a scan budget of 1 visit: the summaries answer whenever they honour every filter.
	win = { ...raw, rawFrom: DAY, summaryThrough: DAY };
	before = { ...raw, rawFrom: "2030-01-01", summaryThrough: DAY };
	(SCAN_BUDGET as Record<string, number>).standard = 1;
});
afterAll(() => {
	(SCAN_BUDGET as Record<string, number>).standard = budget;
});

const run = (rc: ReportCtx, report: ReportName, filters: Filter[], params: Params = {}) => {
	clearReportCache();
	return runReport(rc, { report, query: QuerySchema.parse({ from: DAY, to: DAY, filters, granularity: "day" }), params, limit: 1000 });
};
// biome-ignore lint/suspicious/noExplicitAny: report data
type Pick = (d: Record<string, any>) => unknown;
/** The answer inside the window (must be the detailed one) and the refused filters of the summary answer before it. */
async function check(report: ReportName, filters: Filter[], params: Params, pick: Pick, expected: unknown, refused: string[]) {
	const detailed = await run(raw, report, filters, params);
	const inside = await run(win, report, filters, params);
	expect(inside.notices).not.toContain("summary");
	expect(pick(detailed.data)).toEqual(expected);
	expect(pick(inside.data)).toEqual(expected);
	const out = await run(before, report, filters, params);
	expect(out.notices.filter((x) => x.startsWith("filter_unavailable"))).toEqual(refused);
}
const money: Pick = (d) => [d.totals.revenue, d.totals.orders];
const rows =
	(...cols: string[]): Pick =>
	(d) =>
		(d.rows as Array<Record<string, unknown>>).map((r) => cols.map((c) => r[c])).sort();

describe("summary answers refuse the filters their rows cannot answer", () => {
	it("1. a negated filter on a revenue read (orders without a visit are (not set) in the summaries)", async () => {
		await check("revenue", [f("channel", "is_not", "Direct")], {}, money, [25, 1], ["filter_unavailable:channel:negated"]);
		await check("revenue", [f("country", "is_not", "DE")], {}, money, [25, 1], ["filter_unavailable:country:negated"]);
		await check("revenue_breakdown", [f("source", "is_not", "google.com")], { dim: "source" }, rows("key", "revenue"), [["(direct)", 50]], ["filter_unavailable:source:negated"]);
	});

	it("2. revenue under browser, os or exit: ca_revenue_daily keeps no such rows", async () => {
		await check("revenue", [f("browser", "is", "Chrome")], {}, money, [50, 2], ["filter_unavailable:browser:not_kept"]);
		await check("revenue", [f("os", "is", "iOS")], {}, money, [25, 1], ["filter_unavailable:os:not_kept"]);
		await check("revenue", [f("exit", "is", "/checkout")], {}, money, [50, 2], ["filter_unavailable:exit:not_kept"]);
		await check("revenue_series", [f("browser", "is", "Chrome")], {}, (d) => d.series.map((p: Record<string, unknown>) => p.revenue), [50], ["filter_unavailable:browser:not_kept"]);
	});

	it("3. a page, event or goal filter on the revenue breakdown of that dimension, and withRevenue on Pages", async () => {
		await check("revenue_breakdown", [f("page", "is", "/checkout")], { dim: "page" }, rows("key", "revenue"), [["/a", 10], ["/checkout", 40]], ["filter_unavailable:page:own"]);
		const pages = await run(win, "pages", [f("page", "is", "/checkout")], { withRevenue: true });
		expect([pages.notices.includes("summary"), rows("key", "revenue")(pages.data)]).toEqual([false, [["/a", 10], ["/checkout", 40]]]);
		await check("revenue_breakdown", [f("event", "is", "signup")], { dim: "event" }, rows("key", "revenue"), [["purchase", 50], ["signup", 0]], ["filter_unavailable:event:own"]);
		await check("revenue_breakdown", [f("goal", "is", "Signup")], { dim: "goal" }, rows("key", "revenue"), [["Buy", 50], ["Signup", 0]], ["filter_unavailable:goal:own"]);
	});

	it("4. events, goals and exit pages filtered by their own dimension", async () => {
		await check("events", [f("event", "is", "signup")], {}, (d) => [d.total_sessions, d.rows[0].rate], [1, 1], ["filter_unavailable:event:own"]);
		await check("goals", [f("goal", "is", "Signup")], {}, (d) => [d.total_sessions, ...(rows("key", "converting", "conversion_rate")(d) as unknown[])], [1, ["Buy", 1, 1], ["Signup", 1, 1]], ["filter_unavailable:goal:own"]);
		await check("exit_pages", [f("exit", "is_not", "/checkout")], {}, rows("key", "exits", "exit_rate"), [["/a", 1, 1], ["/b", 1, 1]], ["filter_unavailable:exit:own"]);
	});

	it("5. a negated page, event or goal filter drops whole visits in the detailed rows", async () => {
		await check("pages", [f("page", "is_not", "/checkout")], {}, rows("key", "pageviews"), [["/", 1], ["/a", 1], ["/b", 1]], ["filter_unavailable:page:negated"]);
		await check("events", [f("event", "is_not", "signup")], {}, rows("key", "events"), [["purchase", 1]], ["filter_unavailable:event:negated"]);
		await check("goals", [f("goal", "is_not", "Signup")], {}, (d) => [d.total_sessions, d.rows.find((r: Record<string, unknown>) => r.key === "Buy").completions], [2, 1], ["filter_unavailable:goal:negated"]);
	});

	it("6. a negated utm_campaign filter: campaign rows hold only visits with a campaign", async () => {
		await check("overview", [f("utm_campaign", "is_not", "spring")], {}, (d) => [d.totals.sessions, d.totals.pageviews], [2, 4], ["filter_unavailable:utm_campaign:negated"]);
		await check("timeseries", [f("utm_campaign", "not_contains", "spr")], {}, (d) => d.series.map((p: Record<string, unknown>) => p.sessions), [2], ["filter_unavailable:utm_campaign:negated"]);
		await check("revenue", [f("utm_campaign", "is_not", "spring")], {}, (d) => [d.totals.revenue, d.totals.sessions], [75, 2], ["filter_unavailable:utm_campaign:negated"]);
	});

	it("7. revenue by campaign: the (not set) row has no audience in the summaries (documented null, not a wrong number)", async () => {
		const notSet: Pick = (d) => d.rows.filter((r: Record<string, unknown>) => r.key === "(not set)").map((r: Record<string, unknown>) => [r.revenue, r.visitors, r.sessions, r.revenue_per_visitor]);
		expect(notSet((await run(raw, "revenue_breakdown", [], { dim: "campaign" })).data)).toEqual([[108, 2, 2, 54]]);
		const s = await run(win, "revenue_breakdown", [], { dim: "campaign" });
		expect([s.notices, notSet(s.data)]).toEqual([["summary"], [[108, null, null, null]]]);
	});

	it("withRevenue: a filter the traffic rows apply is not named unavailable; the revenue columns are left out", async () => {
		const out = await run(before, "channels", [f("channel", "is_not", "Direct")], { withRevenue: true });
		expect(out.notices.filter((x) => x.startsWith("filter_unavailable"))).toEqual([]);
		expect(out.data.notices).toEqual(["revenue_not_available"]);
		// Inside the window the detailed rows answer, revenue included.
		const inside = await run(win, "channels", [f("channel", "is_not", "Direct")], { withRevenue: true });
		expect(inside.notices).not.toContain("summary");
		expect(rows("key", "revenue")(inside.data)).toEqual(rows("key", "revenue")((await run(raw, "channels", [f("channel", "is_not", "Direct")], { withRevenue: true })).data));
	});

	it("positive segment filters still answer from the summaries, equal to the detailed rows", async () => {
		for (const [report, filters, params] of [
			["revenue", [f("channel", "is", "Direct")], {}],
			["revenue_breakdown", [f("country", "is", "US")], { dim: "page" }],
			["overview", [f("utm_campaign", "is", "spring")], {}],
			["pages", [f("page", "is", "/checkout")], {}],
		] as Array<[ReportName, Filter[], Params]>) {
			const s = await run(win, report, filters, params);
			expect(s.notices, report).toEqual(["summary"]);
			const d = await run(raw, report, filters, params);
			expect(s.data.totals ?? s.data.rows, report).toEqual(d.data.totals ?? d.data.rows);
		}
	});
});
