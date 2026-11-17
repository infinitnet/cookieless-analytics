/**
 * The cube (`ca_cube`, channel x country x device per day) and the orders per cube cell: generated traffic goes
 * through the real write path in a non-UTC zone, one day is closed and stored, yesterday and today stay open. Under
 * two and three segment filters the totals, the series, the segment breakdowns and revenue read from the summaries
 * must equal the detailed reports, day by day and over the range. Also: the fold keeps totals exact, a day is
 * written once, an idle tick writes nothing, the reads and deletes are key ranges, and the SQL text of both dialects.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, eachDay, zonedToEpoch } from "../src/core/time.js";
import { type Filter, type Goal, NEGATED, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { CELL_SEP, cubeSql } from "../src/query/reports/summary.js";
import { computeDay, CUBE_CAP, CUBE_METRICS, cubeUpsertSql, cubeVanishedSql, foldCube, KV_WATERMARK, OTHER, rollupDay, runRollup, summaryRows, summaryVanishedSql } from "../src/query/rollup.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { meteredDb, schemaDb } from "./helpers.js";

type Env = Awaited<ReturnType<typeof schemaDb>>;
const TZ = "America/New_York";
const TODAY = "2026-06-12";
const D0 = addDays(TODAY, -2);
const DAYS = eachDay(D0, TODAY);
/** 18:00 today: D0 is closed, yesterday and today are open. */
const NOW = zonedToEpoch(TODAY, 18, TZ);
const SETTINGS: Settings = normalizeSettings({ siteTimezone: TZ });
const GOALS: Goal[] = [{ name: "Signup", type: "event", match: "is", value: "signup" }];

const f = (dim: Filter["dim"], ...values: string[]): Filter => ({ dim, op: "is", values });
const run = (rc: ReportCtx, report: ReportName, from: string, to: string, filters: Filter[] = [], params: Params = {}) =>
	runReport(rc, { report, query: QuerySchema.parse({ from, to, filters }), params, limit: 1000 });

describe("the cube on generated traffic", () => {
	let env: Env;
	let raw: ReportCtx;
	let sum: ReportCtx;
	let written: { rows: number; written: number; cube: number };
	/** Two values of each segment that hold traffic, from the detailed reports. */
	let values: Record<"channel" | "country" | "device", string[]>;

	beforeAll(async () => {
		env = await schemaDb();
		const traffic = generateTraffic({ pageviews: 900, seed: 5, rich: true, start: zonedToEpoch(D0, 0, TZ), spanSeconds: 2 * 86_400 + 17 * 3600 });
		let n = 0;
		for (const a of traffic.actions.filter((x) => x.body.t === "pv" && !x.body.n)) {
			if (n++ % 25) continue;
			traffic.actions.push({ ...a, at: a.at + 4, body: { v: 1, t: "ev", sid: a.body.sid, name: "purchase", u: a.body.u, val: 10 + (n % 5), cur: n % 3 ? "USD" : "EUR" } });
		}
		traffic.actions.sort((a, b) => a.at - b.at);
		await recordTraffic(env.db, traffic, SETTINGS);
		// The generator's requests carry no country and one device. Per visitor key, as the request facts behind it:
		// countries DE, FR, none and 40 rare ones (so a small cap folds), devices desktop, mobile and tablet.
		env.raw.exec(
			"UPDATE ca_sessions SET country = CASE unicode(substr(vkey, 3, 1)) % 4 WHEN 0 THEN 'DE' WHEN 1 THEN 'FR' WHEN 2 THEN NULL ELSE 'C' || (unicode(substr(vkey, 5, 1)) % 40) END, device = CASE unicode(substr(vkey, 7, 1)) % 3 WHEN 0 THEN 'desktop' WHEN 1 THEN 'mobile' ELSE 'tablet' END",
		);
		const meter = meteredDb(env);
		const t = await runRollup({ db: meter.db, settings: SETTINGS, goals: async () => GOALS }, env.kv, NOW);
		expect(t).toMatchObject({ days: [D0], watermark: D0 });
		written = { rows: t.rows, written: meter.stats.rowsWritten, cube: (env.raw.prepare("SELECT COUNT(*) AS n FROM ca_cube").get() as { n: number }).n };
		raw = { db: env.db, site: "default", settings: SETTINGS, now: NOW, goals: GOALS, funnels: {}, annotations: [], defaultCurrency: "USD" };
		// Every range starts before this window: the summary engine answers.
		sum = { ...raw, rawFrom: "2030-01-01", summaryThrough: (await env.kv.get<string>(KV_WATERMARK)) as string };
		const top = async (report: ReportName) => ((await run(raw, report, D0, TODAY)).data.rows ?? []).map((r) => String(r.key)).filter((k) => k !== "(not set)").slice(0, 2);
		values = { channel: await top("channels"), country: ["DE", "FR"], device: await top("devices") };
		expect(values.channel).toHaveLength(2);
		expect(values.device).toHaveLength(2);
	});
	beforeEach(() => clearReportCache());

	/** Every combination of two segments and of all three, two values each, plus a negated filter. */
	const combos = (): Filter[][] => {
		const [ch, co, de] = [values.channel, values.country, values.device];
		const out: Filter[][] = [];
		for (const a of ch) for (const b of co) out.push([f("channel", a), f("country", b)]);
		for (const a of ch) for (const b of de) out.push([f("channel", a), f("device", b)]);
		for (const a of co) for (const b of de) out.push([f("country", a), f("device", b)]);
		for (const a of ch) for (const b of co) for (const c of de) out.push([f("channel", a), f("country", b), f("device", c)]);
		out.push([{ dim: "country", op: "is_not", values: ["DE"] }, f("device", de[0] as string)]);
		return out;
	};

	it("stores the closed day once: its cube rows are part of the rows written", () => {
		expect(written.cube).toBeGreaterThan(20);
		expect(written.written).toBe(written.rows);
		expect(env.raw.prepare("SELECT DISTINCT day FROM ca_cube").all()).toEqual([{ day: Number(D0.replaceAll("-", "")) }]);
		console.log(`[rollup] cube rows of the closed day: ${written.cube} of ${written.rows} summary rows`);
	});

	it("totals equal the detailed answer under two and three segment filters, day by day (stored and open) and over the range", async () => {
		for (const filters of combos())
			for (const [from, to] of [...DAYS.map((d) => [d, d] as const), [D0, TODAY] as const]) {
				const a = await run(raw, "overview", from, to, filters);
				const b = await run(sum, "overview", from, to, filters);
				expect(b.notices, JSON.stringify(filters)).toEqual(["summary", "detail_from:2030-01-01"]);
				expect(b.data.totals, `${from} ${to} ${JSON.stringify(filters)}`).toEqual(a.data.totals);
			}
	});

	it("the series and the segment breakdowns equal the detailed answer over the range", async () => {
		for (const filters of combos()) {
			const label = JSON.stringify(filters);
			expect((await run(sum, "timeseries", D0, TODAY, filters)).data.series, label).toEqual((await run(raw, "timeseries", D0, TODAY, filters)).data.series);
			for (const report of ["channels", "countries", "devices"] as const) {
				const b = await run(sum, report, D0, TODAY, filters);
				expect(b.notices, `${report} ${label}`).toEqual(["summary", "detail_from:2030-01-01"]);
				expect(b.data.rows, `${report} ${label}`).toEqual((await run(raw, report, D0, TODAY, filters)).data.rows);
			}
		}
	});

	it("revenue totals and the segment breakdowns equal the detailed answer in every currency", async () => {
		let orders = 0;
		for (const filters of combos())
			for (const currency of ["USD", "EUR"]) {
				const label = `${currency} ${JSON.stringify(filters)}`;
				const b = await run(sum, "revenue", D0, TODAY, filters, { currency });
				// Revenue summaries keep orders without a visit as (not set): a negated filter is refused (tests/reports-summary-filters.test.ts).
				const negated = filters.filter((x) => NEGATED.has(x.op));
				if (negated.length) {
					expect(b.notices, label).toEqual(expect.arrayContaining(negated.map((x) => `filter_unavailable:${x.dim}:negated`)));
					continue;
				}
				const a = await run(raw, "revenue", D0, TODAY, filters, { currency });
				expect(b.notices, label).toEqual(["summary", "detail_from:2030-01-01"]);
				expect(b.data.totals, label).toEqual(a.data.totals);
				orders += Number((a.data.totals as Row | undefined)?.orders ?? 0);
				const pick = (rows: Row[] | undefined) => (rows ?? []).filter((r) => Number(r.orders) > 0).map((r) => [r.key, r.revenue, r.orders]);
				const q = (rc: ReportCtx) => run(rc, "revenue_breakdown", D0, TODAY, filters, { dim: "country", currency });
				expect(pick((await q(sum)).data.rows), label).toEqual(pick((await q(raw)).data.rows));
			}
		expect(orders).toBeGreaterThan(0);
	});

	it("a page-like report under two segments stays unavailable, and its revenue is left out", async () => {
		const filters = [f("country", "DE"), f("device", values.device[0] as string)];
		for (const report of ["pages", "entry_pages", "sources", "events", "goals"] as const)
			expect((await run(sum, report, D0, TODAY, filters)).notices, report).toContain("filter_unavailable:device:combination");
		const s = await run(sum, "sources", D0, TODAY, filters, { withRevenue: true });
		expect(s.data.notices).toEqual(["revenue_not_available"]);
	});

	it("a small cap folds the rare countries into (other); every total and every channel and device stays exact", async () => {
		const full = await computeDay({ db: env.db, site: "default", settings: SETTINGS, goals: GOALS }, D0);
		// The generated day holds fewer cells than the small profile keeps: lower its cap for this test.
		const cap = CUBE_CAP.small;
		CUBE_CAP.small = 24;
		const small = await computeDay({ db: env.db, site: "default", settings: { ...SETTINGS, capacityProfile: "small" }, goals: GOALS }, D0).finally(() => {
			CUBE_CAP.small = cap;
		});
		expect(full.cube.length).toBeGreaterThan(24);
		expect(small.cube.length).toBeLessThanOrEqual(24);
		expect(small.revenueCube.filter((r) => r.cur === "USD").length).toBeLessThanOrEqual(24);
		expect(small.cube.some((c) => c.country === OTHER)).toBe(true);
		const by = (rows: typeof full.cube, key: (c: (typeof full.cube)[number]) => string) => {
			const m = new Map<string, number[]>();
			for (const c of rows) m.set(key(c), (m.get(key(c)) ?? CUBE_METRICS.map(() => 0)).map((v, i) => v + c[CUBE_METRICS[i] as (typeof CUBE_METRICS)[number]]));
			return m;
		};
		expect(by(small.cube, () => "")).toEqual(by(full.cube, () => ""));
		// Every channel and device pair that kept a cell keeps its totals.
		const pairs = by(small.cube, (c) => `${c.channel}|${c.device}`);
		const fullPairs = by(full.cube, (c) => `${c.channel}|${c.device}`);
		for (const [k, v] of pairs) if (k !== `${OTHER}|${OTHER}`) expect(v, k).toEqual(fullPairs.get(k));
		// The largest cell is kept as it is.
		const top = [...full.cube].sort((a, b) => b.sessions - a.sessions)[0];
		expect(small.cube).toContainEqual(top);
		const orders = (rows: typeof full.revenueCube, cur: string) => rows.filter((r) => r.cur === cur).reduce<[number, number]>(([o, v], r) => [o + r.orders, v + r.revenue], [0, 0]);
		for (const cur of ["USD", "EUR"]) expect(orders(small.revenueCube, cur), cur).toEqual(orders(full.revenueCube, cur));
	});

	it("a day written again costs 0 rows; a vanished cell is deleted within its day only; an idle tick writes nothing", async () => {
		const meter = meteredDb(env);
		const rc = { db: meter.db, site: "default", settings: SETTINGS, goals: GOALS };
		const dump = () => env.raw.prepare("SELECT * FROM ca_cube ORDER BY day, channel, country, device").all();
		const before = dump();
		meter.reset();
		expect(await rollupDay(rc, D0)).toBe(written.rows);
		expect(meter.stats.rowsWritten).toBe(0);
		expect(dump()).toEqual(before);
		// A stale cell of the day goes; a cell of another day stays.
		const ins = env.raw.prepare("INSERT INTO ca_cube (site, day, channel, country, device, sessions) VALUES ('default', ?, 'Gone', 'XX', 'tv', 1)");
		ins.run(Number(D0.replaceAll("-", "")));
		ins.run(20260101);
		meter.reset();
		await rollupDay(rc, D0);
		expect(meter.stats.rowsWritten).toBe(1);
		expect(env.raw.prepare("SELECT day FROM ca_cube WHERE channel = 'Gone'").all()).toEqual([{ day: 20260101 }]);
		env.raw.prepare("DELETE FROM ca_cube WHERE channel = 'Gone'").run();
		meter.reset();
		const idle = await runRollup({ db: meter.db, settings: SETTINGS, goals: async () => GOALS }, env.kv, NOW);
		expect(idle).toMatchObject({ days: [], statements: 0, done: true });
		expect(meter.stats).toMatchObject({ statements: 0, rowsWritten: 0 });
	});

	it("computeDay counts the cube in the day's summary rows and stores nothing", async () => {
		const meter = meteredDb(env);
		const s = await computeDay({ db: meter.db, site: "default", settings: SETTINGS, goals: GOALS }, TODAY);
		expect(s.cube.length).toBeGreaterThan(0);
		expect(summaryRows(s)).toBeGreaterThan(s.cube.length + s.revenueCube.length);
		expect(meter.stats.rowsWritten).toBe(0);
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_cube WHERE day = ?").get(Number(TODAY.replaceAll("-", "")))).toEqual({ n: 0 });
	});

	it("reads and deletes are key ranges of the primary keys (SQLite plan)", () => {
		const plan = (sql: string, params: unknown[]) => (env.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>).map((p) => p.detail).join("\n");
		for (const byDay of [false, true]) {
			const p = plan(cubeSql("sqlite", byDay), ["default", 20260610, 20260612]);
			expect(p).toMatch(/SEARCH c USING PRIMARY KEY \(site=\? AND day>\? AND day<\?\)/);
			expect(p).not.toMatch(/SCAN c\b(?! USING)/);
		}
		expect(plan(cubeVanishedSql("sqlite"), ["default", 20260610, "[]"])).toMatch(/SEARCH ca_cube USING PRIMARY KEY \(site=\? AND day=\?\)/);
		expect(plan(summaryVanishedSql("sqlite", "ca_revenue_daily", ["all"], "segkey || '|' || cur", ["cube"]), ["default", D0, "[]"])).toMatch(
			/SEARCH ca_revenue_daily USING PRIMARY KEY \(site=\? AND dim=\? AND seg=\? AND day=\?\)/,
		);
	});
});

describe("foldCube", () => {
	type Cell = { key: string; segkey: string; sessions: number };
	const cell = (channel: string, country: string, device: string, sessions: number): Cell => ({ key: "", segkey: [channel, country, device].join(CELL_SEP), sessions });
	const add = (into: Cell, r: Cell) => {
		into.sessions += r.sessions;
	};
	const cells: Cell[] = [];
	for (const ch of ["Direct", "Search", "Social"]) for (const de of ["desktop", "mobile"]) for (let c = 0; c < 60; c++) cells.push(cell(ch, `C${c}`, de, 1 + ((c * 7 + ch.length) % 13)));
	const total = (rows: Cell[], pick: (parts: string[]) => string) => {
		const m = new Map<string, number>();
		for (const r of rows) m.set(pick(r.segkey.split(CELL_SEP)), (m.get(pick(r.segkey.split(CELL_SEP))) ?? 0) + r.sessions);
		return m;
	};

	it.each([7, 20, 150, 359, 360])("keeps at most %i rows, every channel and device total and the sum exact, the input unchanged", (n) => {
		const copy = structuredClone(cells);
		const out = foldCube(cells, n, (r) => r.sessions, add);
		expect(cells).toEqual(copy);
		expect(out.length).toBeLessThanOrEqual(n);
		expect(out.every((r) => r.key === "" && r.segkey.split(CELL_SEP).length === 3)).toBe(true);
		expect(new Set(out.map((r) => r.segkey)).size).toBe(out.length);
		expect(out.reduce((a, r) => a + r.sessions, 0)).toBe(cells.reduce((a, r) => a + r.sessions, 0));
		const kept = total(out, ([ch, , de]) => `${ch}|${de}`);
		const all = total(cells, ([ch, , de]) => `${ch}|${de}`);
		for (const [k, v] of kept) if (k !== `${OTHER}|${OTHER}`) expect(v, k).toBe(all.get(k));
		if (n >= 360) expect(out).toEqual(cells);
	});

	it("a country literally named (other) merges into the fold row of its channel and device", () => {
		const out = foldCube([...cells, cell("Direct", OTHER, "desktop", 100)], 20, (r) => r.sessions, add);
		expect(new Set(out.map((r) => r.segkey)).size).toBe(out.length);
	});
});

describe("cube statements, both dialects (Postgres: text only)", () => {
	it("reads one key range of ca_cube, duration as engaged_ms", () => {
		expect(cubeSql("sqlite", false)).toBe(
			"SELECT c.channel AS channel, c.country AS country, c.device AS device, SUM(c.sessions) AS sessions, SUM(c.pageviews) AS pageviews, SUM(c.visitors) AS visitors, SUM(c.bounces) AS bounces, SUM(c.engaged) AS engaged, SUM(c.duration_ms) AS engaged_ms, SUM(c.events) AS events FROM ca_cube c WHERE c.site = ? AND c.day BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER) GROUP BY c.channel, c.country, c.device",
		);
		expect(cubeSql("postgres", true)).toBe(
			"SELECT c.channel AS channel, c.country AS country, c.device AS device, c.day AS day, SUM(c.sessions) AS sessions, SUM(c.pageviews) AS pageviews, SUM(c.visitors) AS visitors, SUM(c.bounces) AS bounces, SUM(c.engaged) AS engaged, SUM(c.duration_ms) AS engaged_ms, SUM(c.events) AS events FROM ca_cube c WHERE c.site = ? AND c.day BETWEEN CAST(? AS BIGINT) AND CAST(? AS BIGINT) GROUP BY c.channel, c.country, c.device, c.day",
		);
	});

	it("stores changed cells only and deletes the vanished cells of one site and day", () => {
		expect(cubeUpsertSql("sqlite")).toBe(
			"INSERT INTO ca_cube (site, day, channel, country, device, sessions, pageviews, visitors, bounces, engaged, duration_ms, events) SELECT ?, CAST(? AS INTEGER), json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]'), json_extract(value, '$[8]'), json_extract(value, '$[9]') FROM json_each(?) WHERE true ON CONFLICT (site, day, channel, country, device) DO UPDATE SET sessions = excluded.sessions, pageviews = excluded.pageviews, visitors = excluded.visitors, bounces = excluded.bounces, engaged = excluded.engaged, duration_ms = excluded.duration_ms, events = excluded.events WHERE ca_cube.sessions IS NOT excluded.sessions OR ca_cube.pageviews IS NOT excluded.pageviews OR ca_cube.visitors IS NOT excluded.visitors OR ca_cube.bounces IS NOT excluded.bounces OR ca_cube.engaged IS NOT excluded.engaged OR ca_cube.duration_ms IS NOT excluded.duration_ms OR ca_cube.events IS NOT excluded.events",
		);
		expect(cubeUpsertSql("postgres")).toBe(
			"INSERT INTO ca_cube (site, day, channel, country, device, sessions, pageviews, visitors, bounces, engaged, duration_ms, events) SELECT ?, CAST(? AS BIGINT), value->>0, value->>1, value->>2, CAST(value->>3 AS BIGINT), CAST(value->>4 AS BIGINT), CAST(value->>5 AS BIGINT), CAST(value->>6 AS BIGINT), CAST(value->>7 AS BIGINT), CAST(value->>8 AS BIGINT), CAST(value->>9 AS BIGINT) FROM jsonb_array_elements(CAST(? AS jsonb)) WHERE true ON CONFLICT (site, day, channel, country, device) DO UPDATE SET sessions = excluded.sessions, pageviews = excluded.pageviews, visitors = excluded.visitors, bounces = excluded.bounces, engaged = excluded.engaged, duration_ms = excluded.duration_ms, events = excluded.events WHERE ca_cube.sessions IS DISTINCT FROM excluded.sessions OR ca_cube.pageviews IS DISTINCT FROM excluded.pageviews OR ca_cube.visitors IS DISTINCT FROM excluded.visitors OR ca_cube.bounces IS DISTINCT FROM excluded.bounces OR ca_cube.engaged IS DISTINCT FROM excluded.engaged OR ca_cube.duration_ms IS DISTINCT FROM excluded.duration_ms OR ca_cube.events IS DISTINCT FROM excluded.events",
		);
		// The cell key joins the three values by CELL_SEP, which no channel, country or device holds.
		expect(cubeVanishedSql("sqlite")).toBe(`DELETE FROM ca_cube WHERE site = ? AND day = CAST(? AS INTEGER) AND channel || '${CELL_SEP}' || country || '${CELL_SEP}' || device NOT IN (SELECT value FROM json_each(?))`);
		expect(cubeVanishedSql("postgres")).toBe(
			`DELETE FROM ca_cube WHERE site = ? AND day = CAST(? AS BIGINT) AND channel || '${CELL_SEP}' || country || '${CELL_SEP}' || device NOT IN (SELECT jsonb_array_elements_text(CAST(? AS jsonb)))`,
		);
		// The orders per cell: their own key range of ca_revenue_daily (dim `all`, seg `cube`), never a single or pair row.
		expect(summaryVanishedSql("postgres", "ca_revenue_daily", ["all"], "segkey || '|' || cur", ["cube"])).toBe(
			"DELETE FROM ca_revenue_daily WHERE site = ? AND dim IN ('all') AND seg IN ('cube') AND day = ? AND segkey || '|' || cur NOT IN (SELECT jsonb_array_elements_text(CAST(? AS jsonb)))",
		);
	});
});
