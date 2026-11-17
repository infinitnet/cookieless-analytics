/**
 * Sessions made only of server events (an outbound link event from a short link redirect, or an agent event)
 * have zero page views. They are stored, but never count as sessions, visitors or bounces in traffic reports.
 * Synthetic data only.
 */
import { describe, expect, it } from "vitest";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo } from "../src/core/recorder.js";
import { zonedToEpoch } from "../src/core/time.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { QuerySchema } from "../src/query/filters.js";
import { RANGE, seed } from "./fixtures/seed.js";
import { eventRequest, schemaDb } from "./helpers.js";

const TZ = "Europe/Berlin";

async function overview(withOut: boolean) {
	const env = await schemaDb();
	const settings = await seed(env, TZ);
	if (withOut) {
		// A visitor whose page script never ran: one `out` event without a session id, as the redirect sends it.
		const body = validateIngest({ v: 1, t: "ev", name: "out", u: "/reviews/alpha", p: { slug: "alpha-offer" } });
		if (!body) throw new Error("invalid body");
		const info = requestInfo(eventRequest("{}", { "cf-connecting-ip": "198.51.100.77" }, "https://example.com/go/alpha-offer"));
		expect(await recordClientEvent({ db: env.db, kv: env.kv, settings, now: zonedToEpoch("2026-03-11", 14, TZ) }, body, info)).toBe("ok");
		const zero = env.raw.prepare("SELECT pageviews, events FROM ca_sessions WHERE pageviews = 0").all();
		expect(zero).toEqual([{ pageviews: 0, events: 1 }]);
	}
	clearReportCache();
	const rc = { db: env.db, site: "default", settings, now: zonedToEpoch("2026-03-13", 0, TZ), goals: [], funnels: {}, annotations: [] };
	const run = (report: "overview" | "channels" | "timeseries") => runReport(rc, { report, query: QuerySchema.parse({ ...RANGE, compare: "previous" }) });
	return { overview: (await run("overview")).data, channels: (await run("channels")).data, timeseries: (await run("timeseries")).data };
}

describe("zero page view sessions", () => {
	it("an out event without a page view leaves sessions, visitors, bounce rate and breakdowns unchanged", async () => {
		const base = await overview(false);
		const withOut = await overview(true);
		expect(withOut.overview.totals).toEqual(base.overview.totals);
		expect(withOut.overview.compareTotals).toEqual(base.overview.compareTotals);
		expect(withOut.channels).toEqual(base.channels);
		expect(withOut.timeseries).toEqual(base.timeseries);
	});
});
