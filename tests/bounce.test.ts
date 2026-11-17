/**
 * Bounce follows the GA4 meaning: a session is a bounce exactly when it is not engaged, so bounce rate is
 * 1 minus engaged rate. Live reads and the stored day summaries agree. Synthetic data only.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { visitDayKey } from "../src/db/dialect.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type ReportName, runReport } from "../src/query/reports/index.js";
import { rollupDay } from "../src/query/rollup.js";
import { normalizeSettings } from "../src/settings.js";
import { schemaDb } from "./helpers.js";

const DAY = "2026-04-08";
const SETTINGS = normalizeSettings({ siteTimezone: "UTC" });
const THR = SETTINGS.engagedThresholdSeconds * 1000;

interface Visit {
	sid: string;
	pageviews: number;
	events: number;
	engaged_ms: number;
	channel: string;
}

async function setup(visits: readonly Visit[]) {
	const env = await schemaDb();
	const t0 = zonedToEpoch(DAY, 10, "UTC");
	const ins = env.raw.prepare(
		"INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, engaged_ms, visible_ms, channel) VALUES ('default', ?, ?, ?, 10, ?, ?, 1800, '/', '/', ?, ?, ?, ?, ?)",
	);
	for (const v of visits) ins.run(visitDayKey(DAY), v.sid, `k-${v.sid}`, t0, t0, v.pageviews, v.events, v.engaged_ms, v.engaged_ms, v.channel);
	const live: ReportCtx = { db: env.db, site: "default", settings: SETTINGS, now: zonedToEpoch("2026-04-11", 0, "UTC"), goals: [], funnels: {}, annotations: [] };
	return { env, live, rolled: { ...live, rawFrom: "2030-01-01" } as ReportCtx };
}

const run = (rc: ReportCtx, report: ReportName) => runReport(rc, { report, query: QuerySchema.parse({ from: DAY, to: DAY, granularity: "day" }), limit: 100 });
const bounceOf = async (v: Omit<Visit, "sid" | "channel">) => {
	const { live } = await setup([{ sid: "a", channel: "Direct", ...v }]);
	return (await run(live, "overview")).data.totals?.bounce_rate;
};

describe("bounce is a session that is not engaged", () => {
	beforeEach(() => clearReportCache());

	it("a long single page session is engaged, not a bounce", async () => {
		expect(await bounceOf({ pageviews: 1, events: 0, engaged_ms: 5 * 60_000 })).toBe(0);
	});

	it("a single page under the threshold with no event is a bounce", async () => {
		expect(await bounceOf({ pageviews: 1, events: 0, engaged_ms: THR - 1 })).toBe(1);
	});

	it("a single page with an event is not a bounce", async () => {
		expect(await bounceOf({ pageviews: 1, events: 1, engaged_ms: 0 })).toBe(0);
	});

	it("two page views are not a bounce", async () => {
		expect(await bounceOf({ pageviews: 2, events: 0, engaged_ms: 0 })).toBe(0);
	});

	it("bounce rate plus engaged rate is 1, and the day summary agrees with the live read", async () => {
		const visits: Visit[] = [];
		for (let i = 0; i < 40; i++)
			visits.push({ sid: `s${i}`, pageviews: 1 + (i % 3 === 0 ? 1 : 0), events: i % 5 === 0 ? 1 : 0, engaged_ms: (i * 977) % (3 * THR), channel: i % 2 ? "Direct" : "Organic Search" });
		const { env, live, rolled } = await setup(visits);
		await rollupDay({ db: env.db, site: "default", settings: SETTINGS, goals: [] }, DAY);
		for (const report of ["overview", "channels", "entry_pages", "timeseries"] as const) {
			clearReportCache();
			const a = await run(live, report);
			clearReportCache();
			const b = await run(rolled, report);
			expect(b.data.totals ?? b.data.rows ?? b.data.series).toEqual(a.data.totals ?? a.data.rows ?? a.data.series);
			const rows = [a.data.totals, ...(a.data.rows ?? []), ...(a.data.series ?? [])].filter((r) => r && Number(r.sessions ?? r.entries) > 0);
			expect(rows.length).toBeGreaterThan(0);
			for (const r of rows) expect(Number(r?.bounce_rate) + Number(r?.engaged_rate)).toBeCloseTo(1, 3);
		}
		const t = (await run(live, "overview")).data.totals;
		expect(t?.bounce_rate).toBeGreaterThan(0);
		expect(t?.engaged_rate).toBeGreaterThan(0);
	});
});
