/** Site search report over hand-built pageviews; hand counts in comments. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { putHits, schemaDb } from "./helpers.js";

const SETTINGS = { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 };
// [sid, query]
const HITS: Array<[string, string | null]> = [
	["s1", "q=red+shoes"],
	["s1", "q=red+shoes"],
	["s1", "page=2&q=red+shoes"],
	["s2", "q=red+shoes"],
	["s3", "q=blue"],
	["s3", "s=x&utm_source=news"],
	["s4", "utm_source=q"],
	["s4", null],
];

describe("site_search", () => {
	let rc: ReportCtx;
	beforeAll(async () => {
		const env = await schemaDb();
		const ses = env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, channel) VALUES ('default', ?, ?, '2026-03-10', 0, 1000, 1010, 1800, 3, 'Direct')");
		for (const sid of ["s1", "s2", "s3", "s4"]) ses.run(sid, `v${sid}`);
		putHits(env.raw, HITS.map(([sid, q], i) => ({ id: `h${i}`, sid: sid as string, ts: 1000, kind: "pv" as const, path: "/search", query: q })));
		rc = { db: env.db, site: "default", settings: SETTINGS, now: 0, goals: [], funnels: {}, annotations: [], siteSearchParams: ["q", "s"] };
	});
	beforeEach(() => clearReportCache());
	const run = (over: Partial<ReportCtx> = {}) => runReport({ ...rc, ...over }, { report: "site_search", query: QuerySchema.parse({ from: "2026-03-10", to: "2026-03-10" }) });

	it("counts searches and sessions per term; sessions summed over strings is an upper bound", async () => {
		const r = await run();
		expect(r.data.rows).toEqual([
			// red shoes: 4 pageviews; sessions 2 (q=red+shoes: s1, s2) + 1 (page=2&q=red+shoes: s1) = 3, an upper bound.
			{ key: "red shoes", searches: 4, sessions: 3, searches_per_session: 1.33, sessions_upper_bound: true },
			{ key: "blue", searches: 1, sessions: 1, searches_per_session: 1, sessions_upper_bound: false },
			// `s` is matched exactly: `utm_source=q` is no search.
			{ key: "x", searches: 1, sessions: 1, searches_per_session: 1, sessions_upper_bound: false },
		]);
		expect(r.data).not.toHaveProperty("hidden_terms");
	});

	it("a public surface omits terms of one session and counts them in hidden_terms", async () => {
		const r = await run({ publicSurface: true });
		expect(r.data.rows?.map((x) => x.key)).toEqual(["red shoes"]);
		expect(r.data.hidden_terms).toBe(2);
	});

	it("off without parameter names", async () => {
		expect((await run({ siteSearchParams: [] })).data).toEqual({ rows: [], notices: ["site_search_off"] });
	});

	it("reads raw data only", async () => {
		await expect(run({ rawFrom: "2026-04-01" })).rejects.toMatchObject({ code: "raw_only" });
	});
});
