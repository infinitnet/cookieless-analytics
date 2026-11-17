/**
 * The link and journey families of the summaries (`link`, `link_place`, link pairs, `next`, `path3`): generated
 * traffic with link events goes through the real write path, the closed-day writer stores the days, and the links
 * and journey reports answered from the summary rows (a range before the detailed window) must equal the detailed
 * reports below the caps, for stored days and for open days computed in memory. Folding keeps the totals, rows are
 * written once, and the statements are asserted as text for both dialects.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { type Filter, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { journeyDay, STEP_SEP } from "../src/query/reports/journeys.js";
import { linkDay } from "../src/query/reports/links.js";
import { computeDay, computeJourneys, dayStatements, computeLinks, JOURNEY_CAP, LINK_TOP_N, OTHER, pairCap, rollupDay, runRollup, SEGS, summaryRows } from "../src/query/rollup.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { generateTraffic, recordTraffic, rng } from "./capacity.helpers.js";
import { meteredDb, schemaDb } from "./helpers.js";

const TZ = "America/New_York";
const DAYS = ["2026-06-10", "2026-06-11", "2026-06-12"];
/** 01:00 two days after the last day: every day is closed. */
const NOW = zonedToEpoch(addDays(DAYS[2] as string, 2), 1, TZ);
/** 12:00 on the last day: the first day is closed and stored, the other two are open and computed in memory. */
const NOON = zonedToEpoch(DAYS[2] as string, 12, TZ);
const SETTINGS: Settings = normalizeSettings({ siteTimezone: TZ });
const SLUGS = Array.from({ length: 15 }, (_, i) => `offer-${String.fromCharCode(97 + i)}`);
const PLACES = ["table", "sidebar", "footer"];

/** 1,200 page views over three days on 50 paths (journeys repeat), plus link impressions, clicks and conversions in two currencies. */
async function seed(env: Awaited<ReturnType<typeof schemaDb>>): Promise<void> {
	const traffic = generateTraffic({ pageviews: 1200, seed: 5, start: zonedToEpoch(DAYS[0] as string, 0, TZ), spanSeconds: 3 * 86_400 - 1 });
	const r = rng(17);
	const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] as T;
	let n = 0;
	for (const a of traffic.actions.filter((x) => x.body.t === "pv" && !x.body.n)) {
		const sid = a.body.sid;
		const u = a.body.u;
		const keys = Array.from({ length: 1 + Math.floor(r() * 4) }, () => `${pick(SLUGS)}${r() < 0.7 ? `@${pick(PLACES)}` : ""}`);
		traffic.actions.push({ ...a, at: a.at + 1, body: { v: 1, t: "ev", sid, name: "seen", u, p: Object.fromEntries(keys.map((k, i) => [`s${i}`, k])) } });
		if (r() < 0.3) {
			const slug = pick(SLUGS);
			const place = r() < 0.7 ? { place: pick(PLACES) } : {};
			traffic.actions.push({ ...a, at: a.at + 2, body: { v: 1, t: "ev", sid, name: "out", u, p: { slug, ...place } } });
			if (r() < 0.3) traffic.actions.push({ ...a, at: a.at + 3, body: { v: 1, t: "ev", sid, name: "conv", u, p: { slug, ...place }, val: 5 + (n % 9), cur: n++ % 3 ? "USD" : "EUR" } });
		}
	}
	traffic.actions.sort((a, b) => a.at - b.at);
	const out = await recordTraffic(env.db, traffic, SETTINGS);
	expect(Object.keys(out).filter((k) => !["ok", "reload", "orphan_update"].includes(k))).toEqual([]);
	// The generator's requests carry no country or device: give the visits some, so the pairs hold several values.
	env.raw.exec("UPDATE ca_sessions SET country = CASE unicode(substr(sid, 3, 1)) % 3 WHEN 0 THEN 'DE' WHEN 1 THEN 'FR' END, device = CASE unicode(substr(sid, 5, 1)) % 2 WHEN 0 THEN 'mobile' ELSE 'desktop' END");
}

describe("link and journey summaries on generated traffic", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let raw: ReportCtx;
	const written: number[] = [];
	const rows: Array<{ all: number; families: number }> = [];

	beforeAll(async () => {
		env = await schemaDb();
		await seed(env);
		const meter = meteredDb(env);
		const rc = { db: meter.db, settings: SETTINGS, goals: async () => [] };
		for (const day of DAYS) {
			meter.reset();
			// One site-day per tick: the 4 KV calls, the probes, the day and less than a second day.
			const t = await runRollup(rc, env.kv, NOW, { requests: 5 + 2 * dayStatements([]) });
			expect(t.sites).toEqual([`default@${day}`]);
			written.push(meter.stats.rowsWritten);
			const s = await computeDay({ db: env.db, site: "default", settings: SETTINGS, goals: [] }, day);
			rows.push({ all: summaryRows(s), families: s.links.length + s.linkRevenue.length + s.journeys.length });
			expect(t.rows).toBe(summaryRows(s));
		}
		raw = { db: env.db, site: "default", settings: SETTINGS, now: NOW, goals: [], funnels: {}, annotations: [], defaultCurrency: "USD" };
	}, 30_000);
	beforeEach(() => clearReportCache());

	const run = (rc: ReportCtx, report: ReportName, from: string, to: string, params: Params = {}, filters: Filter[] = []) =>
		runReport(rc, { report, query: QuerySchema.parse({ from, to, filters }), params, limit: 1000 });
	/** The detailed answer and the summary answer (range before the detailed window) of the same request. */
	async function both(now: number, report: ReportName, from: string, to: string, params: Params = {}, filters: Filter[] = []) {
		const a = await run({ ...raw, now }, report, from, to, params, filters);
		const b = await run({ ...raw, now, rawFrom: "2030-01-01" }, report, from, to, params, filters);
		expect(a.notices).not.toContain("summary");
		expect(b.notices).toContain("summary");
		return [a, b] as const;
	}
	const is = (dim: Filter["dim"], v: string): Filter => ({ dim, op: "is", values: [v] });

	it("stores every day once at its exact row count; the families' share of the rows", async () => {
		for (const [i, w] of written.entries()) {
			expect(rows[i]?.families, DAYS[i]).toBeGreaterThan(100);
			expect(w, DAYS[i]).toBe(rows[i]?.all);
		}
		console.log(
			`[rollup] rows per closed day with the link and journey families: ${rows.map((r) => r.all).join(", ")}; without them: ${rows.map((r) => r.all - r.families).join(", ")}; written once: ${written.join(", ")}`,
		);
		// A day stored again writes nothing; an idle tick runs no statement.
		const meter = meteredDb(env);
		await rollupDay({ db: meter.db, site: "default", settings: SETTINGS, goals: [] }, DAYS[1] as string);
		expect(meter.stats.rowsWritten).toBe(0);
		meter.reset();
		const idle = await runRollup({ db: meter.db, settings: SETTINGS, goals: async () => [] }, env.kv, NOW);
		expect(idle).toMatchObject({ days: [], rows: 0, statements: 0 });
		expect(meter.stats.rowsWritten).toBe(0);
	});

	it.each([
		["stored days", NOW],
		["open days computed in memory", NOON],
	])("links from %s equal the detailed report", async (_label, now) => {
		const ranges = [...DAYS.map((d) => [d, d]), [DAYS[0], DAYS[2]]] as Array<[string, string]>;
		for (const [from, to] of ranges) {
			const label = `${from}..${to}`;
			for (const params of [{}, { by: "place" }, { withRevenue: true }, { withRevenue: true, currency: "EUR" }, { by: "place", withRevenue: true }] as Params[]) {
				const [a, b] = await both(now, "links", from, to, params);
				expect((a.data.rows ?? []).length, label).toBeGreaterThan(2);
				expect(b.data, `${label} ${JSON.stringify(params)}`).toEqual(a.data);
			}
			const top = (await run(raw, "links", from, to)).data.rows?.[0]?.key as string;
			const [a, b] = await both(now, "links", from, to, { slug: top, withRevenue: true });
			expect(b.data, `${label} slug`).toEqual(a.data);
			// One segment filter reads the link pairs; every value of the three segments.
			for (const [dim, values] of [
				["channel", ["Direct", "Referral"]],
				["country", ["DE", "FR"]],
				["device", ["mobile", "desktop"]],
			] as const)
				for (const v of values) {
					const [x, y] = await both(now, "links", from, to, { withRevenue: true }, [is(dim, v)]);
					expect(y.data, `${label} ${dim}=${v}`).toEqual(x.data);
					expect(y.notices.filter((n) => n.startsWith(`filter_unavailable:${dim}:`))).toEqual([]);
				}
		}
	});

	it.each([
		["stored days", NOW],
		["open days computed in memory", NOON],
	])("journeys from %s equal the detailed reports, with the notice", async (_label, now) => {
		const ranges = [...DAYS.map((d) => [d, d]), [DAYS[0], DAYS[2]]] as Array<[string, string]>;
		for (const [from, to] of ranges) {
			const label = `${from}..${to}`;
			const [a, b] = await both(now, "journey_paths", from, to);
			expect(b.notices).toContain("top_paths_per_day");
			expect(a.notices).not.toContain("top_paths_per_day");
			expect((a.data.rows ?? []).length, label).toBeGreaterThan(2);
			expect(b.data, `${label} paths`).toEqual(a.data);
			const landing = String(a.data.rows?.[0]?.path1);
			const [c, d] = await both(now, "journey_paths", from, to, { entry: landing });
			expect(d.data, `${label} paths from ${landing}`).toEqual(c.data);
			const pages = new Set((a.data.rows ?? []).flatMap((r) => [r.path1, r.path2]).filter((p) => typeof p === "string" && p.startsWith("/")));
			for (const path of [...pages].slice(0, 6) as string[])
				for (const report of ["journey_next", "journey_prev"] as const) {
					const [x, y] = await both(now, report, from, to, { path });
					expect(y.data, `${label} ${report} ${path}`).toEqual(x.data);
				}
		}
	});

	it("journeys keep the 31 day rule and the floor of two sessions; filters are named, not applied", async () => {
		const sum = { ...raw, rawFrom: "2030-01-01" };
		await expect(run(sum, "journey_paths", "2026-05-01", "2026-06-12")).rejects.toMatchObject({ code: "journey_range" });
		const r = await run(sum, "journey_paths", DAYS[0] as string, DAYS[2] as string, {}, [is("country", "DE")]);
		expect(r.notices).toEqual(expect.arrayContaining(["summary", "top_paths_per_day", "filter_unavailable:country:not_kept"]));
		expect((r.data.rows ?? []).every((x) => Number(x.sessions) >= 2)).toBe(true);
		expect(Number(r.data.hidden_sessions)).toBeGreaterThan(0);
	});

	it("links answer by link and by place only; other breakdowns and filters are named", async () => {
		const sum = { ...raw, rawFrom: "2030-01-01" };
		await expect(run(sum, "links", DAYS[0] as string, DAYS[0] as string, { by: "page" })).rejects.toMatchObject({ code: "raw_only" });
		await expect(run(sum, "links", DAYS[0] as string, DAYS[0] as string, { by: "place", slug: SLUGS[0] as string })).rejects.toMatchObject({ code: "raw_only" });
		const r = await run(sum, "links", DAYS[0] as string, DAYS[0] as string, { by: "place" }, [is("country", "DE"), is("page", "/p/1")]);
		expect(r.notices).toEqual(expect.arrayContaining(["summary", "filter_unavailable:country:not_kept", "filter_unavailable:page:not_kept"]));
	});

	it("folding to the small profile's caps keeps every family within its cap and the totals exact", async () => {
		const small = { db: env.db, site: "default", settings: { ...SETTINGS, capacityProfile: "small" as const }, goals: [] };
		const full = { ...small, settings: SETTINGS };
		const sum = (xs: ReadonlyArray<object>, m: string) => xs.reduce((a, r) => a + Number((r as Record<string, unknown>)[m]), 0);
		for (const day of DAYS) {
			const [l, f] = [await computeLinks(small, day), await computeLinks(full, day)];
			let folded = 0;
			for (const seg of ["", ...SEGS]) {
				const a = l.links.filter((r) => r.dim === "link" && r.seg === seg);
				const b = f.links.filter((r) => r.dim === "link" && r.seg === seg);
				expect(a.length, `link ${seg}`).toBeLessThanOrEqual(seg ? pairCap("small", "link") : LINK_TOP_N);
				if (a.some((r) => r.key === OTHER)) folded++;
				for (const m of ["hits", "events", "sessions", "engaged"]) expect(sum(a, m), `${day} ${seg} ${m}`).toBe(sum(b, m));
				// Each kept segment value keeps its totals.
				for (const v of new Set(a.map((r) => r.segkey).filter((k) => k !== OTHER))) expect(sum(a.filter((r) => r.segkey === v), "events")).toBe(sum(b.filter((r) => r.segkey === v), "events"));
			}
			expect(folded, day).toBeGreaterThan(0);
			for (const cur of ["USD", "EUR"]) expect(sum(l.linkRevenue.filter((r) => r.dim === "link" && r.seg === "" && r.cur === cur), "revenue")).toBeCloseTo(sum(f.linkRevenue.filter((r) => r.dim === "link" && r.seg === "" && r.cur === cur), "revenue"), 6);

			const [js, jf] = [await computeJourneys(small, day), await computeJourneys(full, day)];
			const cap = JOURNEY_CAP.small;
			const steps = (xs: typeof js) => xs.filter((r) => r.dim === "next" && r.segkey !== "");
			expect(steps(js).length + js.filter((r) => r.dim === "next" && r.segkey === "").length, day).toBeLessThanOrEqual(cap.next);
			expect(js.filter((r) => r.dim === "path3").length, day).toBeLessThanOrEqual(cap.path3);
			expect(steps(js).length, day).toBeLessThan(steps(jf).length);
			expect(sum(steps(js), "sessions")).toBe(sum(steps(jf), "sessions"));
			expect(sum(js.filter((r) => r.dim === "path3"), "sessions")).toBe(sum(jf.filter((r) => r.dim === "path3"), "sessions"));
			// A kept page keeps the total of its steps; the page rows the kept steps name are kept.
			for (const page of new Set(steps(js).map((r) => r.key).filter((k) => k !== OTHER))) {
				expect(sum(steps(js).filter((r) => r.key === page), "sessions"), page).toBe(sum(steps(jf).filter((r) => r.key === page), "sessions"));
				if (page !== "(entry)") expect(js.some((r) => r.dim === "next" && r.key === page && r.segkey === "")).toBe(true);
			}
		}
	});
});

describe.each(["sqlite", "postgres"] as const)("link and journey day statements (%s)", (dialect) => {
	// Postgres: asserted as text only.
	it("are one statement each, bind every value and keep the documented shape", async () => {
		const seen: Array<{ sql: string; params: unknown[] }> = [];
		const fake: Db = {
			dialect,
			run: async (sql, p) => (seen.push({ sql, params: p ?? [] }), { changes: 0 }),
			all: async (sql, p) => (seen.push({ sql, params: p ?? [] }), [] as never[]),
			batch: async () => {},
		};
		const rc: ReportCtx = { db: fake, site: "default", settings: SETTINGS, now: 0, goals: [], funnels: {}, annotations: [] };
		await linkDay(rc, "2026-06-10", SEGS);
		await journeyDay(rc, "2026-06-10");
		expect(seen).toHaveLength(2);
		const [links, journeys] = seen as [{ sql: string; params: unknown[] }, { sql: string; params: unknown[] }];
		expect(links.sql).toMatch(/^WITH e AS \(SELECT .* UNION ALL SELECT .*\), i AS \(SELECT .*\) SELECT 'link' AS dim, '' AS seg, slug AS key, '' AS segkey, '' AS cur/);
		expect(links.sql).toContain("SELECT 'link_place' AS dim, '' AS seg, place AS key, '' AS segkey");
		for (const seg of SEGS) expect(links.sql).toContain(`SELECT 'link' AS dim, '${seg}' AS seg, slug AS key, ${seg} AS segkey`);
		expect(links.sql).toContain("FROM e WHERE click = 0 AND val IS NOT NULL AND cur IS NOT NULL AND counted = 1 GROUP BY slug, device, cur");
		expect(links.sql).toContain("COUNT(DISTINCT CASE WHEN click = 1 THEN sid END) AS sessions");
		expect(links.sql).toContain(dialect === "postgres" ? "jsonb_each_text(h.value -> 'pr') AS p" : "json_each(h.value, '$.pr') AS p");
		expect(links.sql).not.toMatch(/'out'|'seen'|'conv'|2026|'default'/);
		expect(links.params).toEqual(expect.arrayContaining(["out", "conv", "seen", "default"]));
		expect(journeys.sql).toContain("SELECT 'next' AS dim, t.path AS key, COALESCE(t.next, '(exit)') AS segkey, COUNT(DISTINCT t.sid) AS sessions FROM seq t WHERE COALESCE(t.next, '') <> t.path");
		expect(journeys.sql).toContain("UNION ALL SELECT 'next', '(entry)', t.path, COUNT(DISTINCT t.sid) FROM seq t WHERE t.n = 1 GROUP BY t.path");
		expect(journeys.sql).toContain(`UNION ALL SELECT 'path3', t.path, COALESCE(t.next, '(exit)') || '${STEP_SEP}' || CASE WHEN t.next IS NULL THEN '' ELSE COALESCE(t.next2, '(exit)') END, COUNT(*)`);
		expect(journeys.sql).toMatch(/LEAD\(p\.path, 2\) OVER/);
		expect(journeys.sql).not.toMatch(/2026|'default'/);
		expect({ links: links.sql, journeys: journeys.sql }).toMatchSnapshot();
	});

	it("store the families with the changed-rows upsert and delete vanished keys of their own dims only", async () => {
		const batches: Array<{ sql: string; params?: unknown[] }> = [];
		const fake: Db = {
			dialect,
			run: async () => ({ changes: 0 }),
			all: async (sql) => (sql.startsWith("WITH e AS") ? ([{ dim: "link", seg: "", key: "a", segkey: "", cur: "USD", impressions: 0, clicks: 0, sessions: 0, conversions: 0, orders: 1, revenue: 5 }] as never[]) : ([] as never[])),
			batch: async (st) => void batches.push(...st),
		};
		await rollupDay({ db: fake, site: "default", settings: SETTINGS, goals: [] }, "2026-06-10");
		const fam = batches.filter((s) => /'link'|'next'/.test(s.sql));
		const list = dialect === "postgres" ? "SELECT jsonb_array_elements_text(CAST(? AS jsonb))" : "SELECT value FROM json_each(?)";
		expect(fam.map((s) => s.sql)).toEqual([
			`DELETE FROM ca_rollup WHERE site = ? AND dim IN ('link', 'link_place', 'next', 'path3') AND seg IN ('', 'channel', 'country', 'device') AND day = ? AND dim || '|' || seg || '|' || key || '|' || segkey NOT IN (${list})`,
			`DELETE FROM ca_revenue_daily WHERE site = ? AND dim IN ('link', 'link_place') AND seg IN ('', 'channel', 'country', 'device') AND day = ? AND dim || '|' || seg || '|' || key || '|' || segkey || '|' || cur NOT IN (${list})`,
		]);
		const upserts = batches.filter((s) => s.sql.startsWith("INSERT INTO ca_revenue_daily"));
		expect(upserts.map((s) => s.params?.[2])).toEqual([JSON.stringify([["link", "a", "", "", "USD", 1, 5, 0]])]);
		expect(upserts[0]?.sql).toContain(dialect === "postgres" ? "IS DISTINCT FROM" : "IS NOT excluded.orders");
	});
});
