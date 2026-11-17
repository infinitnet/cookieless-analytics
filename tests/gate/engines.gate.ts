/**
 * The detailed engine against the summary engine on one seeded data set. Three sites (the local site
 * with a linked host, two client sites), 60 days in Europe/Berlin (across the summer time change), about 200,000
 * page views through the real recorder, orders in USD and EUR, link impressions, clicks and conversions, goals.
 * The closed days are stored by the real closed-day writer. Then every report of `REPORTS` runs through both
 * engines (detailed: no detailed window; summary: a window that starts after every range) on a closed range, a
 * range ending today (open days computed in memory) and one day, and the answers are diffed. Each difference is
 * put under a known cause or listed as unexplained. The detailed side is also checked against a naive reference
 * computed in plain JavaScript from the stored rows flattened to one row per page view and event.
 *
 * Run: GATE_OUT=<dir> vitest run --config scripts/gate/vitest.config.mjs tests/gate/engines.gate.ts
 * Scale with GATE_PV (page views per day of the local site, default 2,000; the client sites get 0.45 and 0.22 of it).
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateIngest } from "../../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../../src/core/recorder.js";
import { addDays, eachDay, zonedToEpoch } from "../../src/core/time.js";
import { ensureSchema } from "../../src/db/schema.js";
import { type Filter, type Goal, QuerySchema } from "../../src/query/filters.js";
import type { ReportCtx, Row } from "../../src/query/reports/base.js";
import { clearReportCache, type Params, REPORT_NAMES, type ReportName, REPORTS, runReport } from "../../src/query/reports/index.js";
import { KV_WATERMARK, runRollup } from "../../src/query/rollup.js";
import { normalizeSettings } from "../../src/settings.js";
import { eventRequest, MemoryKv } from "../helpers.js";
import { dayTraffic, fileDb, fmt, gateWrite, visitorHeaders } from "./gate.helpers.js";

const TZ = "Europe/Berlin";
const FIRST = "2026-02-16";
const DAYS = eachDay(FIRST, addDays(FIRST, 59));
const TODAY = DAYS.at(-1) as string;
const NOW = zonedToEpoch(TODAY, 18, TZ);
const PV = Number(process.env.GATE_PV ?? 2000);
const SITES = [
	{ id: "default", share: 1 },
	{ id: "c1", share: 0.45 },
	{ id: "c2", share: 0.22 },
];
const LINKED = "shop.example.net";
const GOALS: Goal[] = [
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Guides", type: "page", match: "prefix", value: "/guides/" },
	{ name: "Buy", type: "event", match: "is", value: "purchase" },
];
const settings = normalizeSettings({ siteTimezone: TZ });

type Data = Record<string, unknown>;
interface Case {
	site: string;
	range: string;
	from: string;
	to: string;
	report: ReportName;
	params: Params;
	filters: Filter[];
}
interface Outcome extends Case {
	status: "identical" | "expected" | "unexplained" | "summary_raw_only" | "error_both" | "error_one";
	causes: string[];
	detail: string;
	notices: string[];
}

const err = (e: unknown) => String((e as { code?: string })?.code ?? (e as Error)?.message ?? e).slice(0, 120);

/** Rows by key (and `ref`), with the fields that differ between the two answers. */
function diffRows(a: Row[], b: Row[]) {
	const id = (r: Row) => `${String(r.key)}\u0000${String(r.ref ?? "")}`;
	const ma = new Map(a.map((r) => [id(r), r]));
	const mb = new Map(b.map((r) => [id(r), r]));
	const onlyA = [...ma.keys()].filter((k) => !mb.has(k)).map((k) => k.split("\u0000")[0] as string);
	const onlyB = [...mb.keys()].filter((k) => !ma.has(k)).map((k) => k.split("\u0000")[0] as string);
	const fields = new Set<string>();
	const pairs: string[] = [];
	let changed = 0;
	for (const [k, ra] of ma) {
		const rb = mb.get(k);
		if (!rb) continue;
		let c = false;
		for (const f of new Set([...Object.keys(ra), ...Object.keys(rb)]))
			if (JSON.stringify(ra[f]) !== JSON.stringify(rb[f])) {
				fields.add(f);
				c = true;
			}
		if (c && pairs.length < 2) pairs.push(`${JSON.stringify(ra)} => ${JSON.stringify(rb)}`);
		if (c) changed++;
	}
	return { onlyA, onlyB, fields: [...fields], changed, pairs, orderDiffers: a.map(id).join() !== b.map(id).join() };
}

/**
 * Put a difference under its known causes; what no cause covers is unexplained. Causes are the documented limits
 * of summary answers (docs/design-notes.md "Rollup reports", docs/revenue.md, docs/limits.md "Many client sites").
 */
function classify(report: ReportName, a: Data, b: Data, responseNotices: string[], filtered: boolean, folded: boolean): { causes: string[]; detail: string; unexplained: boolean } {
	const notices = [...responseNotices, ...((b.notices as string[] | undefined) ?? [])];
	const causes = new Set<string>();
	const parts: string[] = [];
	let unexplained = false;
	const unavailable = notices.filter((n) => n.startsWith("filter_unavailable"));
	const loose = unavailable.length > 0 || notices.includes("revenue_not_available") || notices.includes("top_paths_per_day");
	if (unavailable.length) causes.add("a filter the summaries cannot apply is left out (notice filter_unavailable)");
	if (notices.includes("revenue_not_available")) causes.add("revenue left out under a filter the summaries cannot apply (notice revenue_not_available)");
	if (notices.includes("top_paths_per_day")) causes.add("journeys keep the top steps and paths of each day (notice top_paths_per_day)");
	const hourly = notices.includes("granularity_day");
	if (hourly) causes.add("an hourly series falls back to days (notice granularity_day)");
	for (const part of ["rows", "series", "totals", "currencies", "compareSeries"] as const) {
		const x = a[part];
		const y = b[part];
		if (JSON.stringify(x) === JSON.stringify(y)) continue;
		if (part === "totals" || !Array.isArray(x) || !Array.isArray(y)) {
			const fx = (x ?? {}) as Data;
			const fy = (y ?? {}) as Data;
			const fs = [...new Set([...Object.keys(fx), ...Object.keys(fy)])].filter((f) => JSON.stringify(fx[f]) !== JSON.stringify(fy[f]));
			parts.push(`${part}: ${fs.map((f) => `${f} ${JSON.stringify(fx[f])} / ${JSON.stringify(fy[f])}`).join(", ")}`);
			if (!loose) unexplained = true;
			continue;
		}
		const d = diffRows(x as Row[], y as Row[]);
		const sample = (keys: string[], rows: Row[]) => keys.slice(0, 3).map((k) => JSON.stringify(rows.find((r) => String(r.key) === k))).join(" ");
		parts.push(`${part}: ${d.changed} changed (${d.fields.join(", ")}) ${d.pairs.join(" ")}, ${d.onlyA.length} only detailed ${sample(d.onlyA, x as Row[])}, ${d.onlyB.length} only summary ${sample(d.onlyB, y as Row[])}${d.orderDiffers ? ", order" : ""}`);
		if (part === "series" && hourly) continue;
		const other = d.onlyB.includes("(other)") || folded;
		const impossible = (y as Row[]).filter((r) => typeof r.exit_rate === "number" && r.exit_rate > 1);
		if (impossible.length) {
			parts.push(`exit rate above 1 in the summary answer: ${impossible.slice(0, 3).map((r) => `${String(r.key)} ${String(r.exit_rate)}`).join(", ")}`);
			unexplained = true;
		}
		if (folded) causes.add("a key below the cap on some days is partly in (other) (stored (other) rows in the range)");
		else if (other) causes.add("rows past the per-day caps are summed into (other)");
		const revNull = report === "revenue_breakdown";
		const fieldsLeft = d.fields.filter((f) => {
			if (f === "scroll_median") return !causes.add("scroll median is detailed only (docs/design-notes.md)");
			if (f === "avg_visible") return !causes.add("visible time per page is detailed only (docs/design-notes.md)");
			if (f === "exit_rate" && (y as Row[]).some((r) => r.exit_rate === null)) return !causes.add("exit rate of a folded or pair page is not stored");
			if (revNull && ["visitors", "sessions", "revenue_per_visitor"].includes(f) && (y as Row[]).some((r) => r.visitors === null))
				return !causes.add("summary revenue breakdown: goal and event rows, and keys without a traffic summary row, have no visitors (docs/revenue.md)");
			return true;
		});
		const onlyA = d.onlyA.filter((k) => {
			const r = (x as Row[]).find((z) => String(z.key) === k);
			if (report === "revenue_breakdown" && r && Number(r.orders) === 0) return !causes.add("keys with visitors and no revenue are listed by the detailed engine only");
			return true;
		});
		if (loose || (other && !fieldsLeft.length)) continue;
		if (folded) continue;
		if (fieldsLeft.length || onlyA.length || (d.onlyB.length && !other)) unexplained = true;
	}
	for (const k of Object.keys({ ...a, ...b })) {
		if (["rows", "series", "totals", "currencies", "compareSeries", "notices"].includes(k) || JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
		parts.push(`${k}: ${JSON.stringify(a[k])} detailed, ${JSON.stringify(b[k])} summary`);
		if (k === "realtime" && b[k] === null && filtered) causes.add("realtime is null under filters in summary answers (docs/design-notes.md)");
		else if (k === "granularity" && hourly) continue;
		// Fewer rows after a fold: the detailed answer is cut at the limit, the summary answer is not.
		else if (k === "truncated" && (folded || Array.isArray(b.rows) && (b.rows as Row[]).some((r) => r.key === "(other)"))) causes.add("rows past the per-day caps are summed into (other)");
		else if (!loose) unexplained = true;
	}
	return { causes: [...causes], detail: parts.join("; "), unexplained };
}

/** Parameters per report: every report runs at least once; some run with several. */
function paramsOf(report: ReportName, topPage: string): Params[] {
	switch (report) {
		case "event_props":
			return [{ event: "signup" }];
		case "funnels":
			return [{ steps: [{ type: "page", match: "prefix", value: "/blog/" }, { type: "event", match: "is", value: "signup" }] }];
		case "journey_next":
		case "journey_prev":
			return [{ path: topPage }];
		case "revenue":
			return [{ currency: "USD" }, { currency: "EUR" }];
		case "revenue_series":
			return [{ currency: "USD" }];
		case "revenue_breakdown":
			return ["channel", "page", "entry", "source", "campaign", "country", "device", "goal", "event"].map((dim) => ({ dim, currency: "USD" }));
		case "dimension_values":
			return [{ dim: "page" }, { dim: "country" }];
		case "links":
			return [{}, { by: "place" }, { withRevenue: true, currency: "USD" }];
		case "impact":
			return [{ at: "2026-03-20" }];
		default:
			return [{}];
	}
}

describe("gate: detailed and summary engines on one data set", () => {
	it("every report, both engines, closed and open days, diffed", async () => {
		const path = join(tmpdir(), `ca-gate-engines-${process.pid}.db`);
		rmSync(path, { force: true });
		const { db, raw } = await fileDb(path);
		const kv = new MemoryKv();
		await ensureSchema(db, kv);
		const t0 = Date.now();
		const counts = { actions: 0, pageviews: 0, outcomes: {} as Record<string, number> };
		resetCounters();
		for (const [i, day] of DAYS.entries())
			for (const [j, s] of SITES.entries()) {
				const traffic = dayTraffic({ site: s.id, day, pageviews: Math.round(PV * s.share), seed: 1000 * i + j + 1, tz: TZ }, zonedToEpoch);
				counts.pageviews += traffic.counts.pageviews;
				for (const a of traffic.actions) {
					const body = validateIngest(a.body);
					if (!body) throw new Error("invalid generated body");
					const h = visitorHeaders(a.ip);
					// One visitor address in ten browses the linked shop host of the local site.
					const linked = s.id === "default" && a.ip.endsWith("0::1");
					const out = await recordClientEvent({ db, kv, settings, now: a.at, ...(s.id === "default" ? {} : { site: s.id }), ...(linked ? { linkedHost: LINKED } : {}) }, body, requestInfo(eventRequest(a.body, h, a.url)));
					counts.outcomes[out] = (counts.outcomes[out] ?? 0) + 1;
					counts.actions++;
				}
			}
		const recordS = (Date.now() - t0) / 1000;
		const t1 = Date.now();
		let ticks = 0;
		for (;;) {
			const r = await runRollup({ db, settings, goals: async () => GOALS }, kv, NOW);
			ticks++;
			if (!r.days.length || ticks > 400) break;
		}
		const watermark = (await kv.get<string>(KV_WATERMARK)) as string;
		const rollupS = (Date.now() - t1) / 1000;
		const closedTo = watermark;
		const n = (sql: string) => (raw.prepare(sql).get() as { n: number }).n;
		const data = {
			pageviews: counts.pageviews,
			actions: counts.actions,
			outcomes: counts.outcomes,
			visits: n("SELECT COUNT(*) AS n FROM ca_sessions"),
			orders: n("SELECT COUNT(*) AS n FROM ca_events WHERE val IS NOT NULL"),
			currencies: (raw.prepare("SELECT cur, COUNT(*) AS n FROM ca_events WHERE val IS NOT NULL GROUP BY cur").all() as Array<{ cur: string; n: number }>).map((r) => `${r.cur} ${r.n}`),
			linkedEntries: n("SELECT COUNT(*) AS n FROM ca_sessions s, json_each(s.hits) h WHERE h.value ->> 'hs' IS NOT NULL"),
			summaryRows: n("SELECT COUNT(*) AS n FROM ca_rollup") + n("SELECT COUNT(*) AS n FROM ca_revenue_daily") + n("SELECT COUNT(*) AS n FROM ca_cube"),
			watermark,
			recordSeconds: Math.round(recordS),
			rollupSeconds: Math.round(rollupS),
			rollupTicks: ticks,
		};
		process.stdout.write(`[gate engines] data ${JSON.stringify(data)}\n`);
		expect(watermark).toBe(addDays(TODAY, -2));

		const base: ReportCtx = { db, site: "default", settings, now: NOW, goals: GOALS, funnels: {}, annotations: [], defaultCurrency: "USD", siteSearchParams: ["q"], sites: SITES.map((s) => s.id), collections: null };
		const run = (rc: ReportCtx, c: Case) => {
			clearReportCache();
			return runReport(rc, { report: c.report, query: QuerySchema.parse({ from: c.from, to: c.to, filters: c.filters }), params: c.params, limit: 100 });
		};
		// Journeys allow at most 31 days, so the closed range is 30 days; the long one covers the rest.
		const RANGES = [
			{ range: "closed", from: addDays(closedTo, -29), to: closedTo },
			{ range: "long", from: addDays(FIRST, 1), to: closedTo },
			{ range: "open", from: addDays(TODAY, -9), to: TODAY },
			{ range: "one day", from: "2026-03-29", to: "2026-03-29" },
		];
		const FILTERS: Array<[string, Filter[]]> = [
			["none", []],
			["country DE", [{ dim: "country", op: "is", values: ["DE"] }]],
		];
		const outcomes: Outcome[] = [];
		const t2 = Date.now();
		for (const s of SITES) {
			const detailed: ReportCtx = { ...base, site: s.id };
			const summary: ReportCtx = { ...detailed, rawFrom: "2100-01-01", summaryThrough: watermark };
			const topPage = String((await run(detailed, { site: s.id, range: "", from: RANGES[0]!.from, to: RANGES[0]!.to, report: "pages", params: {}, filters: [] })).data.rows?.[0]?.key ?? "/");
			for (const r of RANGES)
				for (const [fname, filters] of FILTERS) {
					// The filtered pass, the long and the one day range on the local site only (time).
					if ((fname !== "none" || r.range === "one day" || r.range === "long") && s.id !== "default") continue;
					if (r.range === "long" && fname !== "none") continue;
					for (const report of REPORT_NAMES)
						for (const params of paramsOf(report, topPage)) {
							const c: Case = { site: s.id, range: r.range, from: r.from, to: r.to, report, params, filters };
							let a: Awaited<ReturnType<typeof run>> | null = null;
							let b: Awaited<ReturnType<typeof run>> | null = null;
							let ea = "";
							let eb = "";
							try {
								a = await run(detailed, c);
							} catch (e) {
								ea = err(e);
							}
							try {
								b = await run(summary, c);
							} catch (e) {
								eb = err(e);
							}
							const base2 = { ...c, notices: b?.notices ?? [] };
							if (outcomes.length % 100 === 0) process.stdout.write(`[gate engines] progress ${outcomes.length} cases, ${Math.round((Date.now() - t2) / 1000)} s\n`);
							if (ea && eb && eb.includes("raw_only")) outcomes.push({ ...base2, status: "summary_raw_only", causes: ["no summary form: detailed data only"], detail: `detailed: ${ea}; summary: ${eb}` });
							else if (ea && eb) outcomes.push({ ...base2, status: ea === eb ? "error_both" : "error_one", causes: [], detail: `detailed: ${ea}; summary: ${eb}` });
							else if (!a && b) outcomes.push({ ...base2, status: "error_one", causes: [], detail: `detailed: ${ea}` });
							else if (a && !b) outcomes.push({ ...base2, status: eb.includes("raw_only") ? "summary_raw_only" : "error_one", causes: eb.includes("raw_only") ? ["no summary form: detailed data only"] : [], detail: `summary: ${eb}` });
							else if (a && b) {
								if (JSON.stringify(a.data) === JSON.stringify(b.data)) outcomes.push({ ...base2, status: "identical", causes: [], detail: "" });
								else {
									const k = classify(report, a.data as Data, b.data as Data, b.notices, filters.length > 0, foldedIn(raw, c));
									outcomes.push({ ...base2, status: k.unexplained ? "unexplained" : "expected", causes: k.causes, detail: k.detail });
								}
							}
						}
				}
		}
		const reportS = (Date.now() - t2) / 1000;

		// The detailed side against a naive reference: the stored rows flattened to one row per page view.
		const ref = reference(raw, "default", RANGES[0]!.from, RANGES[0]!.to);
		const d: ReportCtx = { ...base };
		const C = (report: ReportName, params: Params = {}): Case => ({ site: "default", range: "closed", from: RANGES[0]!.from, to: RANGES[0]!.to, report, params, filters: [] });
		const ov = (await run(d, C("overview"))).data.totals as Data;
		const pages = (await run(d, C("pages"))).data.rows as Row[];
		const channels = (await run(d, C("channels"))).data.rows as Row[];
		const events = (await run(d, C("events"))).data.rows as Row[];
		const rev = (await run(d, C("revenue", { currency: "USD" }))).data.totals as Data;
		const refChecks = {
			overview: { sessions: [ov.sessions, ref.sessions], pageviews: [ov.pageviews, ref.pageviews], visitors: [ov.visitors, ref.visitors] },
			pagesTop100: pages.filter((r) => r.pageviews !== ref.pages.get(String(r.key))).length,
			channels: channels.filter((r) => r.sessions !== ref.channels.get(String(r.key))).length,
			events: events.filter((r) => r.events !== ref.events.get(String(r.key))).length,
			revenueUSD: { revenue: [rev.revenue, ref.usd.revenue], orders: [rev.orders, ref.usd.orders] },
		};
		const refOk = ov.sessions === ref.sessions && ov.pageviews === ref.pageviews && ov.visitors === ref.visitors && !refChecks.pagesTop100 && !refChecks.channels && !refChecks.events && rev.orders === ref.usd.orders && Math.abs(Number(rev.revenue) - ref.usd.revenue) < 0.005;

		const by = (st: Outcome["status"]) => outcomes.filter((o) => o.status === st);
		const md = renderMarkdown(data, outcomes, refChecks, refOk, { recordS, rollupS, reportS });
		gateWrite("engines.md", md);
		gateWrite("engines.json", `${JSON.stringify({ data, refChecks, refOk, outcomes }, null, 1)}\n`);
		process.stdout.write(`[gate engines] cases ${outcomes.length}, identical ${by("identical").length}, expected ${by("expected").length}, raw_only ${by("summary_raw_only").length}, error_both ${by("error_both").length}, error_one ${by("error_one").length}, unexplained ${by("unexplained").length}, reference ${refOk ? "equal" : "DIFFERS"} ${JSON.stringify(refChecks)}\n`);
		raw.close();
		rmSync(path, { force: true });
		expect(refOk).toBe(true);
		expect(by("error_one").map((o) => `${o.site} ${o.range} ${o.report} ${o.detail}`)).toEqual([]);
		expect(by("unexplained").map((o) => `${o.site} ${o.range} ${o.report} ${JSON.stringify(o.params)} ${o.filters.length ? "DE" : ""}: ${o.detail}`)).toEqual([]);
	});
});

/** Summary dims a report reads (single and pair rows), to look for stored `(other)` rows in its range. */
function dimsOf(c: Case): string[] {
	if (c.report === "pages") return ["page", "exit"];
	if (c.report === "entry_pages") return ["entry"];
	if (c.report === "exit_pages") return ["exit", "page"];
	if (c.report === "revenue_breakdown" && typeof c.params.dim === "string") return [c.params.dim === "campaign" ? "utm_campaign" : c.params.dim];
	return [];
}

/** Whether the stored summaries of the case's range folded a key of its dims into `(other)` on some day. */
function foldedIn(raw: import("better-sqlite3").Database, c: Case): boolean {
	const dims = dimsOf(c);
	if (!dims.length) return false;
	const q = `SELECT 1 FROM %t WHERE site = ? AND dim IN (${dims.map(() => "?").join(", ")}) AND day >= ? AND day <= ? AND key = '(other)' LIMIT 1`;
	return ["ca_rollup", "ca_revenue_daily"].some((t) => !!raw.prepare(q.replace("%t", t)).get(c.site, ...dims, c.from, c.to));
}

/** Naive totals from the stored rows: visits of the range with a page view, page views by path, orders by their own day. */
function reference(raw: import("better-sqlite3").Database, site: string, from: string, to: string) {
	const visits = raw.prepare("SELECT day, sid, vkey, channel, pageviews, json(hits) AS doc FROM ca_sessions WHERE site = ? AND day >= ? AND day <= ? AND pageviews > 0").all(site, from, to) as Array<{ day: string; sid: string; vkey: string; channel: string | null; pageviews: number; doc: string }>;
	const pages = new Map<string, number>();
	const channels = new Map<string, number>();
	const events = new Map<string, number>();
	const perDay = new Map<string, Set<string>>();
	let pageviews = 0;
	for (const v of visits) {
		perDay.set(v.day, (perDay.get(v.day) ?? new Set()).add(v.vkey));
		channels.set(v.channel ?? "(not set)", (channels.get(v.channel ?? "(not set)") ?? 0) + 1);
		for (const e of Object.values(JSON.parse(v.doc) as Record<string, Record<string, unknown>>)) {
			if (e.t === undefined) continue;
			if (e.n === undefined) {
				pageviews++;
				pages.set(String(e.p), (pages.get(String(e.p)) ?? 0) + 1);
			} else if (!String(e.n).startsWith("_")) events.set(String(e.n), (events.get(String(e.n)) ?? 0) + 1);
		}
	}
	const d = (x: string) => Number(x.replaceAll("-", ""));
	const usd = raw.prepare("SELECT COUNT(*) AS orders, COALESCE(SUM(val), 0) AS revenue FROM ca_events WHERE site = ? AND day >= ? AND day <= ? AND val IS NOT NULL AND cur = 'USD'").get(site, d(from), d(to)) as { orders: number; revenue: number };
	return { sessions: visits.length, pageviews, visitors: [...perDay.values()].reduce((a, s) => a + s.size, 0), pages, channels, events, usd: { orders: usd.orders, revenue: Math.round(usd.revenue * 100) / 100 } };
}

function renderMarkdown(data: Record<string, unknown>, outcomes: Outcome[], refChecks: unknown, refOk: boolean, t: { recordS: number; rollupS: number; reportS: number }): string {
	const count = (f: (o: Outcome) => boolean) => outcomes.filter(f).length;
	const causes = new Map<string, Set<string>>();
	for (const o of outcomes) for (const c of o.causes) causes.set(c, (causes.get(c) ?? new Set()).add(o.report));
	const lines = [
		"# Detailed engine against summary engine",
		"",
		`Data set: ${fmt(Number(data.pageviews))} page views (${fmt(Number(data.actions))} requests) on 3 sites over 60 days, ${fmt(Number(data.visits))} visits, ${fmt(Number(data.orders))} orders (${(data.currencies as string[]).join(", ")}), ${fmt(Number(data.linkedEntries))} entries on the linked host, ${fmt(Number(data.summaryRows))} summary rows, watermark ${String(data.watermark)}. Recording ${Math.round(t.recordS)} s, closed-day writer ${Math.round(t.rollupS)} s in ${String(data.rollupTicks)} ticks, reports ${Math.round(t.reportS)} s.`,
		`Outcomes of the recorder: ${JSON.stringify(data.outcomes)}.`,
		"",
		`Detailed engine against the naive row-per-hit reference (local site, closed range): ${refOk ? "equal" : "DIFFERS"}. ${JSON.stringify(refChecks)}`,
		"",
		"| Outcome | Cases |",
		"|---|---|",
		...(["identical", "expected", "summary_raw_only", "error_both", "error_one", "unexplained"] as const).map((s) => `| ${s} | ${count((o) => o.status === s)} |`),
		`| total | ${outcomes.length} |`,
		"",
		"## Expected differences and their cause",
		"",
		"| Cause | Reports |",
		"|---|---|",
		...[...causes].map(([c, rs]) => `| ${c} | ${[...rs].sort().join(", ")} |`),
		"",
		"## Every case that is not identical",
		"",
		"| Site | Range | Report | Params | Filter | Outcome | Detail |",
		"|---|---|---|---|---|---|---|",
		...outcomes
			.filter((o) => o.status !== "identical")
			.map((o) => `| ${o.site} | ${o.range} | ${o.report} | ${JSON.stringify(o.params).replaceAll("|", "/")} | ${o.filters.length ? "country DE" : ""} | ${o.status} | ${o.detail.replaceAll("|", "/")} |`),
		"",
		"## Identical",
		"",
		[...new Set(outcomes.filter((o) => o.status === "identical").map((o) => o.report))].sort().join(", "),
		"",
		`Reports in REPORTS: ${Object.keys(REPORTS).length}.`,
		"",
	];
	return lines.join("\n");
}
