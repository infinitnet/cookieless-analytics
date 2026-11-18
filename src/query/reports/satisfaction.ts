/**
 * Satisfaction reports: long and short clicks, bad experience, estimated pogo-sticking, returns to
 * search, search re-entry and the back/forward load share, over organic search sessions only (the dispatcher adds
 * the scope channel is Organic Search to every run, see `organicScope`). Classified at query time from `ca_sessions` and the page view
 * entries of its document
 * with the thresholds of the moment, so a changed threshold reclassifies every stored session at once.
 */
import { eachDay } from "../../core/time.js";
import { isoDay } from "../../db/dialect.js";
import { DEFAULT_SETTINGS } from "../../settings.js";
import { QueryError, TRUE } from "../compile.js";
import {
	annotationsIn,
	DURATION_MS,
	entriesOf,
	entryCols,
	hitJoin,
	keysIn,
	type Metrics,
	num,
	type Point,
	type ReportCtx,
	type ReportData,
	type Row,
	type RunInput,
	ratio,
	round,
	sessionWhere,
} from "./base.js";
import { resolveGranularity, weekStart } from "./timeseries.js";

import { SATISFACTION_BY, SATISFACTION_MIN_MEASURED, type SatisfactionBy } from "./satisfaction-copy.js";

export { SATISFACTION_CAVEAT, SATISFACTION_RAW_ONLY } from "./satisfaction-copy.js";

/** Session column per `params.by`; `entry` is the landing page table. */
const BY_COL: Record<SatisfactionBy, string> = {
	entry: "s.entry_path",
	source: "COALESCE(s.source, '(not set)')",
	device: "COALESCE(s.device, '(not set)')",
	country: "COALESCE(s.country, '(not set)')",
	browser: "COALESCE(s.browser, '(not set)')",
};

const COUNTS = ["sessions", "measured", "duration_ms", "long_clicks", "short_clicks", "bad_experiences", "search_sessions", "search_measured", "pogo_sticks", "reentered", "returned_from_search", "engaged_ms"] as const;
type Counts = Record<(typeof COUNTS)[number], number>;

/** Thresholds in seconds: long click `L` and the effective bad experience threshold `B' = min(bad, L)`. */
export function thresholds(rc: ReportCtx): { long: number; bad: number } {
	const long = rc.settings.longClickSeconds ?? DEFAULT_SETTINGS.longClickSeconds;
	return { long, bad: Math.min(rc.settings.badExperienceSeconds ?? DEFAULT_SETTINGS.badExperienceSeconds, long) };
}

/**
 * Per-session classification in an inner query, counted per key (and day) outside. The landing exit is read
 * only for single-page sessions, from their one page view entry.
 */
function countsSql(rc: ReportCtx, input: RunInput, keyExpr: string | null, byDay: boolean) {
	const where = sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE);
	const d = rc.db.dialect;
	const x = entryCols(d, "x");
	const pvs = `FROM ${entriesOf(d, "x")} WHERE ${x.pv}`;
	const { long, bad } = thresholds(rc);
	const group = [keyExpr ? "t.key" : null, byDay ? "t.day" : null].filter(Boolean);
	const inner = `SELECT ${keyExpr ? `${keyExpr} AS key, ` : ""}s.day AS day, ${DURATION_MS} AS dur,
CASE WHEN s.visible_ms > 0 THEN 1 ELSE 0 END AS m,
CASE WHEN s.channel = 'Organic Search' THEN 1 ELSE 0 END AS se,
CASE WHEN s.pageviews = 1 AND s.events = 0 THEN 1 ELSE 0 END AS single,
s.interacted AS inter, s.reentries AS re, s.engaged_ms AS eng,
CASE WHEN s.pageviews = 1 THEN (SELECT MAX(${x.exit}) ${pvs}) END AS lexit,
CASE WHEN s.reentries > 0 THEN (SELECT ${x.exit} ${pvs} ORDER BY ${x.ts}, ${x.id} LIMIT 1) END AS fexit
FROM ca_sessions s WHERE ${where.sql}`;
	const sql = `SELECT ${group.map((g) => `${g} AS ${g?.slice(2)}, `).join("")}COUNT(*) AS sessions, SUM(t.m) AS measured, SUM(t.dur) AS duration_ms,
SUM(CASE WHEN t.m = 1 AND t.dur > ? THEN 1 ELSE 0 END) AS long_clicks,
SUM(CASE WHEN t.m = 1 AND t.dur <= ? THEN 1 ELSE 0 END) AS short_clicks,
SUM(CASE WHEN t.m = 1 AND t.single = 1 AND t.inter = 0 AND t.dur < ? THEN 1 ELSE 0 END) AS bad_experiences,
SUM(t.se) AS search_sessions,
SUM(CASE WHEN t.se = 1 AND t.m = 1 THEN 1 ELSE 0 END) AS search_measured,
SUM(CASE WHEN t.se = 1 AND t.m = 1 AND t.single = 1 AND t.dur <= ? AND t.lexit = 2 THEN 1 ELSE 0 END) AS pogo_sticks,
SUM(CASE WHEN t.se = 1 AND t.re > 0 THEN 1 ELSE 0 END) AS reentered,
SUM(CASE WHEN t.se = 1 AND t.re > 0 AND t.fexit = 2 THEN 1 ELSE 0 END) AS returned_from_search,
SUM(t.eng) AS engaged_ms
FROM (${inner}) t${group.length ? ` GROUP BY ${group.join(", ")}` : ""}`;
	return { sql, params: [long * 1000, long * 1000, bad * 1000, long * 1000, ...where.params] };
}

const counts = (r: Record<string, unknown> | undefined): Counts => Object.fromEntries(COUNTS.map((c) => [c, num(r?.[c])])) as Counts;

/**
 * Page score (docs/sessions.md "Best and worst pages"): long click rate minus bad experience rate minus pogo-sticking
 * rate, from the raw counts; a page without measured search sessions counts its pogo-sticking rate as 0. Null when
 * nothing is measured.
 */
export function score(c: Pick<Counts, "measured" | "long_clicks" | "bad_experiences" | "pogo_sticks" | "search_measured">): number | null {
	if (!c.measured) return null;
	return round((c.long_clicks - c.bad_experiences) / c.measured - (c.search_measured ? c.pogo_sticks / c.search_measured : 0));
}

/** Satisfaction rates; every rate leaves unmeasured sessions out of its denominator. */
function rates(c: Counts): Metrics {
	return {
		sessions: c.sessions,
		measured: c.measured,
		search_sessions: c.search_sessions,
		search_measured: c.search_measured,
		avg_duration: round(ratio(c.duration_ms / 1000, c.sessions), 1),
		avg_engaged: round(ratio(c.engaged_ms / 1000, c.sessions), 1),
		measured_rate: round(ratio(c.measured, c.sessions)),
		long_clicks: c.long_clicks,
		short_clicks: c.short_clicks,
		bad_experiences: c.bad_experiences,
		pogo_sticks: c.pogo_sticks,
		reentered: c.reentered,
		returned_from_search: c.returned_from_search,
		pct_long: round(ratio(c.long_clicks, c.measured)),
		pct_short: round(ratio(c.short_clicks, c.measured)),
		pct_bad: round(ratio(c.bad_experiences, c.measured)),
		pogo_stick_rate: round(ratio(c.pogo_sticks, c.search_measured)),
		returned_from_search_rate: round(ratio(c.returned_from_search, c.search_sessions)),
		search_reentry_rate: round(ratio(c.reentered, c.search_sessions)),
		score: score(c),
	};
}

/** Back/forward loads per path: `nav = 2` over pageviews with a known navigation type (full loads only). */
async function backNav(rc: ReportCtx, input: RunInput, keys: readonly string[] | null) {
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "pv", keys ? keysIn(rc, h.path, keys) : TRUE);
	const cols = `SUM(CASE WHEN ${h.nav} = 2 THEN 1 ELSE 0 END) AS bf, COUNT(${h.nav}) AS loads`;
	const rows = await rc.db.all(keys ? `SELECT ${h.path} AS key, ${cols} ${j.sql} GROUP BY ${h.path}` : `SELECT ${cols} ${j.sql}`, j.params);
	return rows.map((r) => ({ key: r.key == null ? "" : String(r.key), rate: round(ratio(num(r.bf), num(r.loads))) }));
}

/** Score order of `params.rank` over the grouped counts `g`; `1.0 *` keeps the division real on every dialect. */
const SCORE_SQL = "(1.0 * (g.long_clicks - g.bad_experiences) / g.measured - CASE WHEN g.search_measured > 0 THEN 1.0 * g.pogo_sticks / g.search_measured ELSE 0 END)";

/**
 * Landing page table plus totals; `params.by` groups by a session dimension instead of the landing page,
 * and `params.rank` (`best` | `worst`) orders landing pages with at least `SATISFACTION_MIN_MEASURED` measured sessions
 * by score. A ranked compare run reads the previous period's busiest landing pages unranked, so a ranked page finds
 * its previous row by key (shortcut: up to 1000 pages; a page outside them shows no previous value).
 */
export async function satisfaction(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const byName = (input.params.by ?? "entry") as SatisfactionBy;
	if (!(SATISFACTION_BY as readonly string[]).includes(byName)) throw new QueryError("invalid_params", `satisfaction params.by is one of ${SATISFACTION_BY.join(", ")}.`);
	const rank = input.params.rank;
	if (rank && byName !== "entry") throw new QueryError("invalid_params", "satisfaction params.rank ranks landing pages; leave params.by out or set it to entry.");
	const by = countsSql(rc, input, BY_COL[byName], false);
	const ranked = rank && !input.isCompare;
	const limit = rank && input.isCompare ? 1000 : input.limit;
	const rows = ranked
		? await rc.db.all(`SELECT g.* FROM (${by.sql}) g WHERE g.measured >= ? ORDER BY ${SCORE_SQL} ${rank === "best" ? "DESC" : "ASC"}, g.sessions DESC, g.key LIMIT ? OFFSET ?`, [...by.params, SATISFACTION_MIN_MEASURED, limit + 1, input.offset])
		: await rc.db.all(`${by.sql} ORDER BY sessions DESC, key LIMIT ? OFFSET ?`, [...by.params, limit + 1, input.offset]);
	const page = rows.slice(0, limit);
	const keys = byName === "entry" ? page.map((r) => String(r.key)) : [];
	const bf = new Map(keys.length ? (await backNav(rc, input, keys)).map((r) => [r.key, r.rate]) : []);
	const tot = countsSql(rc, input, null, false);
	const [t] = await rc.db.all(tot.sql, tot.params);
	const [tb] = await backNav(rc, input, null);
	const { long, bad } = thresholds(rc);
	return {
		totals: { ...rates(counts(t)), back_nav_rate: tb?.rate ?? null },
		rows: page.map((r): Row => ({ key: String(r.key), ...rates(counts(r)), back_nav_rate: bf.get(String(r.key)) ?? null })),
		truncated: rows.length > limit,
		thresholds: { long_click_seconds: long, bad_experience_seconds: bad },
		...(rank ? { min_measured: SATISFACTION_MIN_MEASURED } : {}),
	};
}

/** Daily (or weekly) rates, zero-filled; `hour` is answered per day with a notice. */
export async function satisfactionSeries(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const asked = resolveGranularity(input.granularity, input.from, input.to);
	const gran = asked === "hour" ? "day" : asked;
	const q = countsSql(rc, input, null, true);
	const buckets = new Map<string, Counts>();
	for (const day of eachDay(input.from, input.to)) buckets.set(gran === "week" ? weekStart(day) : day, counts(undefined));
	for (const r of await rc.db.all(q.sql, q.params)) {
		const day = isoDay(r.day);
		const b = buckets.get(gran === "week" ? weekStart(day) : day);
		if (!b) continue;
		const c = counts(r);
		for (const k of COUNTS) b[k] += c[k];
	}
	const series: Point[] = [...buckets].map(([t, c]) => {
		const { pct_long, pct_short, pct_bad, pogo_stick_rate, returned_from_search_rate, avg_engaged, sessions, measured, long_clicks, short_clicks, bad_experiences, pogo_sticks } = rates(c);
		return { t, pct_long, pct_short, pct_bad, pogo_stick_rate, returned_from_search_rate, avg_engaged, sessions, measured, long_clicks, short_clicks, bad_experiences, pogo_sticks, search_measured: c.search_measured };
	});
	if (input.isCompare) return { series, granularity: gran };
	const { long, bad } = thresholds(rc);
	return { series, granularity: gran, thresholds: { long_click_seconds: long, bad_experience_seconds: bad }, annotations: annotationsIn(rc, input.from, input.to), notices: asked === "hour" ? ["granularity_day"] : [] };
}

