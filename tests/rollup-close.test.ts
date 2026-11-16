/**
 * The closed-day writer: generated traffic goes through the real write path in a non-UTC zone, the cron tick
 * closes the days, and every single dimension family read from the summary rows must equal the detailed report
 * for that day. Rows written are measured with the rows meter: a closed day costs its summary rows once, a repeat
 * and an idle tick cost 0. Catch-up resumes after a failed run; open days are never stored.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordClientEvent, requestInfo } from "../src/core/recorder.js";
import { validateIngest } from "../src/core/ids.js";
import type { IngestBody } from "../src/contract.js";
import { addDays, eachDay, zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { type Filter, type Goal, QuerySchema } from "../src/query/filters.js";
import { type ReportCtx, type Row, sessionMetrics } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { REVENUE_BREAKDOWN_DIMS } from "../src/query/reports/revenue.js";
import {
	CLOSE_GRACE_S,
	computeDay,
	dayStatements,
	KV_ROLLUP_CURSOR,
	KV_WATERMARK,
	lastClosedDay,
	OTHER,
	PAIR_DIMS,
	PAIR_ROWS,
	pairCap,
	rollupDay,
	runRollup,
	SEGS,
	summaryRows,
	summaryUpsertSql,
	summaryVanishedSql,
} from "../src/query/rollup.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { SUMMARY_ROW_BYTES } from "../src/query/storage.js";
import { generateTraffic, recordTraffic, tableBytes } from "./capacity.helpers.js";
import { CHROME_UA, eventRequest, meteredDb, schemaDb } from "./helpers.js";

const TZ = "America/New_York";
const DAYS = ["2026-06-10", "2026-06-11", "2026-06-12"];
/** 01:00 two days after the last day: every day of DAYS is closed. */
const NOW = zonedToEpoch(addDays(DAYS[2] as string, 2), 1, TZ);
const GOALS: Goal[] = [
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Pro", type: "event", match: "is", value: "signup", props: { plan: "pro" } },
	{ name: "Guides", type: "page", match: "prefix", value: "/guides/" },
	{ name: "Buy", type: "event", match: "is", value: "purchase" },
];
const SETTINGS: Settings = normalizeSettings({ siteTimezone: TZ });

/** 1,200 page views over the three days (under the 500 pages a day kept by the top N) through the real write path, plus orders. */
async function seedGenerator(env: Awaited<ReturnType<typeof schemaDb>>): Promise<number> {
	const traffic = generateTraffic({ pageviews: 1200, seed: 11, rich: true, start: zonedToEpoch(DAYS[0] as string, 0, TZ), spanSeconds: 3 * 86_400 - 1 });
	// Every 40th page view of a visit's own sid is followed by an order (some with an order id, two currencies).
	let n = 0;
	for (const a of traffic.actions.filter((x) => x.body.t === "pv" && !x.body.n)) {
		if (n++ % 40) continue;
		traffic.actions.push({ ...a, at: a.at + 4, body: { v: 1, t: "ev", sid: a.body.sid, name: "purchase", u: a.body.u, val: 10 + (n % 7), cur: n % 3 ? "USD" : "EUR", ...(n % 2 ? { oid: `O-${n}` } : {}) } });
	}
	traffic.actions.sort((a, b) => a.at - b.at);
	const out = await recordTraffic(env.db, traffic, SETTINGS);
	expect(Object.keys(out).filter((k) => !["ok", "reload", "orphan_update"].includes(k))).toEqual([]);
	return traffic.counts.pageviews;
}

const stored = (env: Awaited<ReturnType<typeof schemaDb>>) => ({
	rollup: env.raw.prepare("SELECT * FROM ca_rollup ORDER BY site, dim, seg, day, key, segkey").all(),
	revenue: env.raw.prepare("SELECT * FROM ca_revenue_daily ORDER BY site, dim, seg, day, key, segkey, cur").all(),
	cube: env.raw.prepare("SELECT * FROM ca_cube ORDER BY site, day, channel, country, device").all(),
});

describe("closed-day writer on generated traffic", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let meter: ReturnType<typeof meteredDb>;
	let raw: ReportCtx;
	let rolled: ReportCtx;
	const perDay: Record<string, { rows: number; written: number }> = {};

	beforeAll(async () => {
		env = await schemaDb();
		await seedGenerator(env);
		// The generator's requests carry no country: give two thirds of the visits one, so the country pairs hold three values.
		env.raw.exec("UPDATE ca_sessions SET country = CASE unicode(substr(sid, 3, 1)) % 3 WHEN 0 THEN 'DE' WHEN 1 THEN 'FR' END");
		meter = meteredDb(env);
		const rc = { db: meter.db, settings: SETTINGS, goals: async () => GOALS };
		// A budget of one site-day per tick (the 4 KV calls, the probes, the day and less than a second day), so each day's cost is measured alone.
		for (const day of DAYS) {
			meter.reset();
			const t = await runRollup(rc, env.kv, NOW, { requests: 5 + 2 * dayStatements(GOALS) });
			expect(t.sites).toEqual([`default@${day}`]);
			perDay[day] = { rows: t.rows, written: meter.stats.rowsWritten };
		}
		raw = { db: env.db, site: "default", settings: SETTINGS, now: NOW, goals: GOALS, funnels: {}, annotations: [], defaultCurrency: "USD" };
		rolled = { ...raw, rawFrom: "2030-01-01" };
	});
	beforeEach(() => clearReportCache());

	const run = (rc: ReportCtx, report: ReportName, from: string, to: string, params: Params = {}, filters: Filter[] = []) =>
		runReport(rc, { report, query: QuerySchema.parse({ from, to, filters }), params, limit: 1000 });

	it("stores every day once, at its exact row count, and moves the watermark", async () => {
		for (const day of DAYS) {
			expect(perDay[day]?.rows, day).toBeGreaterThan(50);
			// Every summary row is one new row of a clustered table with no index; no delete finds anything.
			expect(perDay[day]?.written, day).toBe(perDay[day]?.rows);
		}
		expect(await env.kv.get(KV_WATERMARK)).toBe(DAYS[2]);
		const rows = Object.values(perDay).reduce((a, d) => a + d.rows, 0);
		expect(stored(env).rollup.length + stored(env).revenue.length + stored(env).cube.length).toBe(rows);
		const mean = rows / DAYS.length;
		// Before: today and yesterday deleted and inserted again every 30 minutes, with a secondary index (1 + 3 per row).
		const before = 2 * 48 * 4 * mean;
		const pairs = (t: string) => (env.raw.prepare(`SELECT day, COUNT(*) AS n FROM ${t} WHERE seg <> '' GROUP BY day ORDER BY day`).all() as Array<{ n: number }>).map((r) => r.n);
		console.log(`[rollup] rows written per closed day: ${DAYS.map((d) => perDay[d]?.written).join(", ")} (mean ${mean.toFixed(0)}), of them pair rows ${pairs("ca_rollup").join(", ")} and revenue pairs ${pairs("ca_revenue_daily").join(", ")}; the rewrite of two days every 30 minutes cost about ${before.toFixed(0)} per day`);
	});

	it.each(DAYS)("the summary rows of %s answer every family like the detailed reports", async (day) => {
		const SESSION_REPORTS: ReportName[] = ["channels", "sources", "campaigns", "countries", "devices", "browsers", "os", "languages", "entry_pages", "exit_pages", "events", "goals"];
		for (const report of SESSION_REPORTS) {
			const a = await run(raw, report, day, day);
			const b = await run(rolled, report, day, day);
			expect(b.notices, report).toContain("summary");
			expect(b.data.rows, report).toEqual(a.data.rows);
			// The generator sets no campaign.
			if (report !== "campaigns") expect((a.data.rows ?? []).length, report).toBeGreaterThan(0);
		}
		const ov = [await run(raw, "overview", day, day), await run(rolled, "overview", day, day)];
		expect(ov[1]?.data.totals).toEqual(ov[0]?.data.totals);
		const noScroll = (rows: Row[] | undefined) => (rows ?? []).map(({ scroll_median: _s, ...r }) => r);
		const pages = [await run(raw, "pages", day, day), await run(rolled, "pages", day, day)];
		expect(noScroll(pages[1]?.data.rows)).toEqual(noScroll(pages[0]?.data.rows));
		const rev = [await run(raw, "revenue", day, day, { currency: "USD" }), await run(rolled, "revenue", day, day, { currency: "USD" })];
		expect(rev[1]?.data.totals?.revenue).toBe(rev[0]?.data.totals?.revenue);
		expect(rev[1]?.data.totals?.orders).toBe(rev[0]?.data.totals?.orders);
		for (const cur of ["USD", "EUR"])
			for (const dim of REVENUE_BREAKDOWN_DIMS) {
				const pick = (rows: Row[] | undefined) => (rows ?? []).filter((r) => Number(r.orders) > 0).map((r) => [r.key, r.revenue, r.orders]);
				const q = (rc: ReportCtx) => run(rc, "revenue_breakdown", day, day, { dim, currency: cur });
				expect(pick((await q(rolled)).data.rows), `${dim} ${cur}`).toEqual(pick((await q(raw)).data.rows));
			}
	});

	it.each(DAYS)("every pair row of %s equals the detailed report under that segment filter", async (day) => {
		type P = Record<string, unknown> & { dim: string; seg: string; segkey: string; key: string };
		const pairs = env.raw.prepare("SELECT * FROM ca_rollup WHERE day = ? AND seg <> ''").all(day) as P[];
		const revPairs = env.raw.prepare("SELECT * FROM ca_revenue_daily WHERE day = ? AND seg <> ''").all(day) as P[];
		expect(revPairs.length).toBeGreaterThan(0);
		// Below the cap: nothing is folded.
		expect(pairs.filter((p) => p.key === "(other)")).toEqual([]);
		const n = (v: unknown) => Number(v);
		const round1 = (v: number) => Math.round(v * 10) / 10;
		// Report per pair dim, and the report row a pair row must equal.
		const SHAPES: Record<string, [ReportName, (p: P) => Row]> = {
			page: ["pages", (p) => ({ key: p.key, pageviews: n(p.pageviews), visitors: n(p.visitors), avg_time: n(p.hits) ? round1(n(p.engaged_ms) / 1000 / n(p.hits)) : null })],
			entry: ["entry_pages", (p) => ({ key: p.key, ...sessionMetrics({ ...p, duration_ms: p.engaged_ms }) })],
			source: ["sources", (p) => ({ key: p.key, ...sessionMetrics({ ...p, duration_ms: p.engaged_ms }) })],
			utm_campaign: ["campaigns", (p) => ({ key: p.key, ...sessionMetrics({ ...p, duration_ms: p.engaged_ms }) })],
			event: ["events", (p) => ({ key: p.key, events: n(p.events), sessions: n(p.sessions) })],
			goal: ["goals", (p) => ({ key: p.key, completions: n(p.events), converting: n(p.sessions) })],
		};
		let compared = 0;
		for (const seg of SEGS) {
			const values = [...new Set(pairs.filter((p) => p.seg === seg).map((p) => p.segkey))];
			expect(values.length, seg).toBeGreaterThan(0);
			// A detailed filter cannot select a missing value, which the summaries key as `(not set)`; the sums below cover it.
			for (const v of values.filter((x) => x !== "(not set)")) {
				const filters: Filter[] = [{ dim: seg, op: "is", values: [v] }];
				for (const [dim, [report, shape]] of Object.entries(SHAPES)) {
					const want = (await run(raw, report, day, day, {}, filters)).data.rows ?? [];
					// The fields the report shows (the entry pages report has no sessions column, for one).
					const keys = Object.keys(shape({ dim, seg, segkey: v, key: "" })).filter((k) => !want[0] || k in want[0]);
					const fields = (r: Row) => Object.fromEntries(keys.map((k) => [k, r[k]]));
					const got = pairs.filter((p) => p.dim === dim && p.seg === seg && p.segkey === v).map(shape);
					const pick = (rows: Row[]) => rows.map(fields).filter((r) => dim !== "goal" || n(r.completions) > 0).sort((a, b) => (String(a.key) < String(b.key) ? -1 : 1));
					expect(pick(got), `${dim} x ${seg}=${v}`).toEqual(pick(want));
					compared += got.length;
				}
				for (const cur of ["USD", "EUR"])
					for (const dim of ["page", "entry", "source", "campaign", "event", "goal"] as const) {
						const stored = dim === "campaign" ? "utm_campaign" : dim;
						const want = ((await run(raw, "revenue_breakdown", day, day, { dim, currency: cur }, filters)).data.rows ?? []).filter((r) => n(r.orders) > 0).map((r) => [r.key, r.revenue, r.orders]);
						const got = revPairs.filter((p) => p.dim === stored && p.seg === seg && p.segkey === v && p.cur === cur).map((p) => [p.key, Math.round(n(p.revenue) * 100) / 100, n(p.orders)]);
						const sort = (rows: unknown[][]) => rows.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
						expect(sort(got), `revenue ${dim} x ${seg}=${v} ${cur}`).toEqual(sort(want));
					}
			}
			// Every family of a segment adds up to the single dimension rows: no row is lost to a segment value.
			for (const dim of Object.keys(SHAPES)) {
				const sum = (rows: P[], m: string) => rows.reduce((a, r) => a + n(r[m]), 0);
				const single = env.raw.prepare("SELECT * FROM ca_rollup WHERE day = ? AND dim = ? AND seg = ''").all(day, dim) as P[];
				const fam = pairs.filter((p) => p.dim === dim && p.seg === seg);
				for (const m of ["pageviews", "events"]) expect(sum(fam, m), `${dim} x ${seg} ${m}`).toBe(sum(single, m));
			}
		}
		expect(compared).toBeGreaterThan(500);
	});

	it("on the small profile the pair families fold to their caps, and every total stays exact", async () => {
		const rc = { db: env.db, site: "default", settings: SETTINGS, goals: GOALS };
		const full = await computeDay(rc, DAYS[0] as string);
		const small = await computeDay({ ...rc, settings: { ...SETTINGS, capacityProfile: "small" as const } }, DAYS[0] as string);
		expect(small.rows).toEqual(full.rows);
		expect(small.revenue).toEqual(full.revenue);
		expect(full.pairs.length).toBeGreaterThan(PAIR_ROWS.small);
		expect(small.pairs.length).toBeLessThanOrEqual(PAIR_ROWS.small);
		const total = (rows: typeof full.pairs, m: "pageviews" | "sessions" | "events" | "engaged_ms" | "hits", segkey?: string) =>
			rows.filter((r) => segkey === undefined || r.segkey === segkey).reduce((a, r) => a + r[m], 0);
		let folded = 0;
		for (const dim of PAIR_DIMS)
			for (const seg of SEGS) {
				const a = full.pairs.filter((r) => r.dim === dim && r.seg === seg);
				const b = small.pairs.filter((r) => r.dim === dim && r.seg === seg);
				expect(b.length, `${dim} x ${seg}`).toBeLessThanOrEqual(pairCap("small", dim));
				if (b.some((r) => r.key === OTHER)) folded++;
				const kept = new Set(b.filter((r) => r.key !== OTHER).map((r) => r.segkey));
				for (const m of ["pageviews", "sessions", "events", "engaged_ms", "hits"] as const) {
					expect(total(b, m), `${dim} x ${seg} ${m}`).toBe(total(a, m));
					for (const v of kept) expect(total(b, m, v), `${dim} x ${seg}=${v} ${m}`).toBe(total(a, m, v));
				}
			}
		expect(folded).toBeGreaterThan(0);
		for (const r of small.revenuePairs) expect(small.revenuePairs.filter((x) => x.dim === r.dim && x.seg === r.seg && x.cur === r.cur).length).toBeLessThanOrEqual(pairCap("small", r.dim as never));
		const money = (rows: typeof full.revenuePairs) => Math.round(rows.reduce((a, r) => a + r.revenue, 0) * 100);
		expect(money(small.revenuePairs)).toBe(money(full.revenuePairs));
	});

	it("a stored summary row stays near the bytes of the storage estimate", () => {
		const n = env.count("ca_rollup");
		const perRow = tableBytes(env.raw, "ca_rollup") / n;
		console.log(`[rollup] ca_rollup: ${n} rows, ${perRow.toFixed(1)} bytes per row (estimate ${SUMMARY_ROW_BYTES})`);
		// The constant is calibrated by the gate's size runs (200,000 rows and more: 74 to 81 bytes); this small table
		// (about 11,000 rows) pays more page fill per row, about 94 bytes.
		expect(perRow).toBeLessThan(SUMMARY_ROW_BYTES * 1.3);
	});

	it("the timeseries over the closed days equals the detailed one", async () => {
		const a = await run(raw, "timeseries", DAYS[0] as string, DAYS[2] as string);
		const b = await run(rolled, "timeseries", DAYS[0] as string, DAYS[2] as string);
		expect(b.data.series).toEqual(a.data.series);
	});

	it("a day written again costs 0 rows; an idle tick runs no statement and writes nothing", async () => {
		const before = stored(env);
		meter.reset();
		for (const day of DAYS) await rollupDay({ db: meter.db, site: "default", settings: SETTINGS, goals: GOALS }, day);
		expect(meter.stats.rowsWritten).toBe(0);
		expect(stored(env)).toEqual(before);
		meter.reset();
		const sets: string[] = [];
		const kv: typeof env.kv = Object.create(env.kv);
		kv.set = async (k: string) => void sets.push(k);
		kv.delete = async (k: string) => (sets.push(k), true);
		const idle = await runRollup({ db: meter.db, settings: SETTINGS, goals: async () => GOALS }, kv, NOW);
		expect(idle).toMatchObject({ days: [], statements: 0, done: true, watermark: DAYS[2] });
		expect(meter.stats).toMatchObject({ statements: 0, rowsWritten: 0 });
		expect(sets).toEqual([]);
	});

	it("computeDay of an open day returns its rows without storing them", async () => {
		const open = addDays(DAYS[2] as string, 1);
		meter.reset();
		const s = await computeDay({ db: meter.db, site: "default", settings: SETTINGS, goals: GOALS }, DAYS[2] as string);
		expect(summaryRows(s)).toBe(perDay[DAYS[2] as string]?.rows);
		expect(meter.stats.rowsWritten).toBe(0);
		expect((await computeDay({ db: env.db, site: "default", settings: SETTINGS, goals: GOALS }, open)).rows).toEqual([]);
	});
});

describe("closing days", () => {
	it("closes a day only after the write path stops reaching it: local midnight of day + 2, plus the grace", () => {
		const d = "2026-03-07";
		// The night of the change to summer time in New York.
		const at = (day: string, h: number) => zonedToEpoch(day, h, TZ);
		expect(lastClosedDay(at("2026-03-09", 0) + CLOSE_GRACE_S - 1, TZ)).toBe(addDays(d, -1));
		expect(lastClosedDay(at("2026-03-09", 0) + CLOSE_GRACE_S, TZ)).toBe(d);
		expect(lastClosedDay(at("2026-03-09", 23), TZ)).toBe(d);
		expect(lastClosedDay(at("2026-03-09", 12), "UTC")).toBe(d);
	});

	it("a visit crossing midnight counts on the day it started, and that day is not stored until it is closed", async () => {
		const env = await schemaDb();
		const info = requestInfo(eventRequest("{}", { "user-agent": CHROME_UA, "cf-connecting-ip": "2001:db8:5::7" }));
		const body = (b: Record<string, unknown>) => validateIngest({ v: 1, ...b }, 7_200_000) as IngestBody;
		const day = "2026-06-10";
		const t0 = zonedToEpoch(day, 23, TZ) + 50 * 60;
		for (const [i, [at, u]] of ([[t0, "/before"], [t0 + 20 * 60, "/after"]] as const).entries())
			expect(await recordClientEvent({ db: env.db, kv: env.kv, settings: SETTINGS, now: at }, body({ t: "pv", sid: "crossmidnightsid0001", h: `hit00000000${i}`, u, w: 1440 }), info)).toBe("ok");
		const rc = { db: env.db, settings: SETTINGS, goals: async () => [] };
		// 23:00 the next day: the visit's day can still change, so nothing is stored.
		let t = await runRollup(rc, env.kv, zonedToEpoch(addDays(day, 1), 23, TZ));
		expect(t.days).toEqual([]);
		expect(env.count("ca_rollup")).toBe(0);
		t = await runRollup(rc, env.kv, zonedToEpoch(addDays(day, 2), 1, TZ));
		expect(t).toMatchObject({ days: [day], watermark: day, done: true });
		const pages = env.raw.prepare("SELECT day, key, pageviews FROM ca_rollup WHERE dim = 'page' AND seg = '' ORDER BY key").all();
		expect(pages).toEqual([
			{ day, key: "/after", pageviews: 1 },
			{ day, key: "/before", pageviews: 1 },
		]);
	});

	it("catch-up resumes after a failed run and ends with the tables of a clean run", async () => {
		const seedTwo = async () => {
			const env = await schemaDb();
			await seedGenerator(env);
			// A second site on the middle day, and a downtime gap: the tick walks the empty days too.
			env.raw.exec(`INSERT INTO ca_sessions SELECT 'blog', day, sid, vkey, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, engaged_ms, visible_ms, reentries, max_scroll, interacted, ref_host, ref_path, channel, source, utm_source, utm_medium, utm_campaign, utm_term, utm_content, country, region, device, browser, browser_major, os, lang, screen, host, hits FROM ca_sessions WHERE day = '${DAYS[1]}'`);
			return env;
		};
		const later = zonedToEpoch(addDays(DAYS[2] as string, 6), 12, TZ);
		const clean = await seedTwo();
		const cc = { db: clean.db, settings: SETTINGS, goals: async () => GOALS };
		for (let i = 0, t = { done: false }; i < 20 && !t.done; i++) t = await runRollup(cc, clean.kv, later);

		const env = await seedTwo();
		let n = 0;
		const failing: Db = {
			dialect: env.db.dialect,
			all: (s, p) => env.db.all(s, p),
			run: (s, p) => env.db.run(s, p),
			// The third write batch fails (the second site of the second day, sites in key order): the cursor holds the site-day before it.
			batch: async (st) => {
				if (++n === 3) throw new Error("D1 DB is overloaded. Requests queued for too long.");
				return env.db.batch(st);
			},
		};
		await expect(runRollup({ db: failing, settings: SETTINGS, goals: async () => GOALS }, env.kv, later)).rejects.toThrow(/overloaded/);
		expect(await env.kv.get(KV_ROLLUP_CURSOR)).toEqual({ day: DAYS[1], site: "blog" });
		expect(await env.kv.get(KV_WATERMARK)).toBe(DAYS[0]);
		const meter = meteredDb(env);
		const rc = { db: meter.db, settings: SETTINGS, goals: async () => GOALS };
		let t = await runRollup(rc, env.kv, later, { requests: 40 });
		// Resumed after the stored site-day: nothing stored is computed again.
		expect(t.sites[0]).toBe(`default@${DAYS[1]}`);
		for (let i = 0; i < 20 && !t.done; i++) t = await runRollup(rc, env.kv, later, { requests: 40 });
		expect(t.watermark).toBe(lastClosedDay(later, TZ));
		expect(await env.kv.get(KV_ROLLUP_CURSOR)).toBeNull();
		expect(stored(env)).toEqual(stored(clean));
		expect(stored(env).rollup.some((r) => (r as { site: string }).site === "blog")).toBe(true);
		// Days with no data cost one statement each and write nothing.
		expect(eachDay(DAYS[0] as string, lastClosedDay(later, TZ)).length).toBeGreaterThan(DAYS.length);
	}, 20_000);
});

describe("cursor on an early failure", () => {
	it("a tick that fails before reaching a day keeps the cursor", async () => {
		const env = await schemaDb();
		await env.kv.set(KV_ROLLUP_CURSOR, { day: "2026-06-10", site: "a" });
		const broken: Db = { dialect: env.db.dialect, all: async () => Promise.reject(new Error("D1 DB is overloaded.")), run: env.db.run, batch: env.db.batch };
		await expect(runRollup({ db: broken, settings: SETTINGS, goals: async () => [] }, env.kv, NOW)).rejects.toThrow(/overloaded/);
		expect(await env.kv.get(KV_ROLLUP_CURSOR)).toEqual({ day: "2026-06-10", site: "a" });
	});
});

describe("summary statements, both dialects", () => {
	it("upserts changed rows only and deletes vanished single dimension keys by key range", () => {
		const cols = ["dim", "key", "pageviews", "sessions"];
		const conflict = ["site", "dim", "seg", "day", "key", "segkey"];
		expect(summaryUpsertSql("sqlite", "ca_rollup", cols, 2, conflict)).toBe(
			"INSERT INTO ca_rollup (site, day, dim, key, pageviews, sessions) SELECT ?, ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]') FROM json_each(?) WHERE true ON CONFLICT (site, dim, seg, day, key, segkey) DO UPDATE SET pageviews = excluded.pageviews, sessions = excluded.sessions WHERE ca_rollup.pageviews IS NOT excluded.pageviews OR ca_rollup.sessions IS NOT excluded.sessions",
		);
		// UNVERIFIED on a Postgres server: asserted as text only.
		expect(summaryUpsertSql("postgres", "ca_revenue_daily", ["dim", "key", "cur", "orders", "revenue"], 3, [...conflict, "cur"])).toBe(
			"INSERT INTO ca_revenue_daily (site, day, dim, key, cur, orders, revenue) SELECT ?, ?, value->>0, value->>1, value->>2, CAST(value->>3 AS BIGINT), CAST(value->>4 AS DOUBLE PRECISION) FROM jsonb_array_elements(CAST(? AS jsonb)) WHERE true ON CONFLICT (site, dim, seg, day, key, segkey, cur) DO UPDATE SET orders = excluded.orders, revenue = excluded.revenue WHERE ca_revenue_daily.orders IS DISTINCT FROM excluded.orders OR ca_revenue_daily.revenue IS DISTINCT FROM excluded.revenue",
		);
		expect(summaryVanishedSql("sqlite", "ca_rollup", ["all", "page"], "dim || '|' || key")).toBe(
			"DELETE FROM ca_rollup WHERE site = ? AND dim IN ('all', 'page') AND seg = '' AND day = ? AND dim || '|' || key NOT IN (SELECT value FROM json_each(?))",
		);
		expect(summaryVanishedSql("postgres", "ca_rollup", ["all"], "dim || '|' || key")).toBe(
			"DELETE FROM ca_rollup WHERE site = ? AND dim IN ('all') AND seg = '' AND day = ? AND dim || '|' || key NOT IN (SELECT jsonb_array_elements_text(CAST(? AS jsonb)))",
		);
	});

	it("finds the sites and days by skip scan and key probes: no table scan", async () => {
		const env = await schemaDb();
		await seedGenerator(env);
		const seen: string[] = [];
		const spy: Db = { dialect: env.db.dialect, all: (s, p) => (seen.push(s), env.db.all(s, p)), run: (s, p) => env.db.run(s, p), batch: (st) => env.db.batch(st) };
		await runRollup({ db: spy, settings: SETTINGS, goals: async () => GOALS }, env.kv, NOW, { requests: 40 });
		// The report statements of `computeDay` are the detailed reports' own, whose plans the golden test checks.
		const own = [...new Set(seen.filter((q) => q.startsWith("WITH RECURSIVE")))];
		expect(own.length).toBe(2);
		for (const sql of own) {
			const n = (sql.match(/\?/g) ?? []).length;
			const plan = (env.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...Array.from({ length: n }, () => "x")) as Array<{ detail: string }>).map((p) => p.detail);
			// A bare `SEARCH ... USING ... INDEX` is the one-row seek of `MIN(site)`.
			for (const l of plan.filter((x) => /\bca_\w+\b|USING/.test(x))) expect(l, sql).toMatch(/^SEARCH (ca_\w+|v|o) USING (PRIMARY KEY|INDEX \w+|COVERING INDEX \w+)( \(site[=>]\?|$)/);
			expect(plan.filter((x) => /^SCAN (ca_\w+|v|o)\b/.test(x)), sql).toEqual([]);
		}
	});
});
