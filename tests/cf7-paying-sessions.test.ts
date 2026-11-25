/**
 * Paying sessions count visits by their key, visit day plus sid: one sid that starts a visit on each of two days and
 * orders in both is two paying sessions, in the detailed rows and in the daily summaries alike. Synthetic data only.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { dayInt, visitDayKey } from "../src/db/dialect.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { rollupDay } from "../src/query/rollup.js";
import { normalizeSettings } from "../src/settings.js";
import { schemaDb } from "./helpers.js";

const DAYS = ["2026-04-08", "2026-04-09"];
const SETTINGS = normalizeSettings({ siteTimezone: "UTC" });
const SID = "pppppppppppppppppppp";

let env: Awaited<ReturnType<typeof schemaDb>>;
beforeEach(async () => {
	clearReportCache();
	env = await schemaDb();
	const visit = env.raw.prepare(
		"INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, engaged_ms, visible_ms, channel) VALUES ('default', ?, ?, ?, 10, ?, ?, 1800, '/', '/', 1, 1, 0, 0, 'Direct')",
	);
	const order = env.raw.prepare("INSERT INTO ca_events (site, id, day, ts, sday, sid, name, path, props, val, cur) VALUES ('default', ?, ?, ?, ?, ?, 'purchase', '/', NULL, ?, 'USD')");
	DAYS.forEach((day, i) => {
		const t = zonedToEpoch(day, 10, "UTC");
		visit.run(visitDayKey(day), SID, `k${i}`, t, t + 60);
		order.run(`o.${i}`, dayInt(day), t + 30, visitDayKey(day), SID, 20 + i);
	});
	// A second visit with an order, so the day rows are not all equal.
	const t = zonedToEpoch(DAYS[0] as string, 12, "UTC");
	visit.run(visitDayKey(DAYS[0] as string), "qqqqqqqqqqqqqqqqqqqq", "k9", t, t + 60);
	order.run("o.9", dayInt(DAYS[0] as string), t + 30, visitDayKey(DAYS[0] as string), "qqqqqqqqqqqqqqqqqqqq", 5);
});

const ctx = (): ReportCtx => ({ db: env.db, site: "default", settings: SETTINGS, now: zonedToEpoch("2026-04-12", 0, "UTC"), goals: [], funnels: {}, annotations: [], defaultCurrency: "USD" });
const run = (rc: ReportCtx) => runReport(rc, { report: "revenue", query: QuerySchema.parse({ from: DAYS[0], to: DAYS[1] }), params: { currency: "USD" } });

describe("cf7: paying sessions by visit key", () => {
	it("cf7: one sid with a visit and an order on each of two days is two paying sessions, detailed and summarized", async () => {
		const live = await run(ctx());
		expect(live.data.totals).toMatchObject({ orders: 3, revenue: 46, paying_sessions: 3 });
		for (const day of DAYS) await rollupDay({ db: env.db, site: "default", settings: SETTINGS, goals: [] }, day);
		clearReportCache();
		const rolled = await run({ ...ctx(), rawFrom: "2030-01-01" });
		expect(rolled.notices).toContain("summary");
		expect(rolled.data.totals?.paying_sessions).toBe(live.data.totals?.paying_sessions);
	});
});
