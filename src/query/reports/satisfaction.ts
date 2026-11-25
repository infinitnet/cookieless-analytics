/**
 * Satisfaction reports: long and short clicks, bad experience, estimated pogo-sticking, returns to
 * search, search re-entry and the back/forward load share, over organic search sessions only (the dispatcher adds
 * the scope channel is Organic Search to every run, see `organicScope`, and the statement itself reads only
 * sessions of that channel). Classified at query time from `ca_sessions` and the page view entries of its document
 * with the thresholds of the moment, so a changed threshold reclassifies every stored session at once.
 * One denominator rule: every rate, the score and the average active time count measured sessions only (an
 * unmeasured session is in no numerator and no denominator of them); `avg_duration` covers every session.
 */
import { eachDay } from "../../core/time.js";
import { isoDay } from "../../db/dialect.js";
import { DEFAULT_SETTINGS } from "../../settings.js";
import { andFrags, QueryError, TRUE } from "../compile.js";
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

import { SATISFACTION_BY, type SatisfactionBy } from "./satisfaction-copy.js";

export { SATISFACTION_CAVEAT, SATISFACTION_RAW_ONLY } from "./satisfaction-copy.js";

/** The channel of every session these reports read (the dispatcher's `organicScope` adds the same as a filter). */
const ORGANIC_ONLY = { sql: "s.channel = 'Organic Search'", params: [] };

/** Session column per `params.by`; `entry` is the landing page table. */
const BY_COL: Record<SatisfactionBy, string> = {
	entry: "s.entry_path",
	source: "COALESCE(s.source, '(not set)')",
	device: "COALESCE(s.device, '(not set)')",
	country: "COALESCE(s.country, '(not set)')",
	browser: "COALESCE(s.browser, '(not set)')",
};

const COUNTS = ["sessions", "measured", "duration_ms", "long_clicks", "short_clicks", "bad_experiences", "pogo_sticks", "reentered", "returned_from_search", "engaged_ms"] as const;
type Counts = Record<(typeof COUNTS)[number], number>;

/** Thresholds in seconds: long click `L` and the effective bad experience threshold `B' = min(bad, L)`. */
export function thresholds(rc: ReportCtx): { long: number; bad: number } {
	const long = rc.settings.longClickSeconds ?? DEFAULT_SETTINGS.longClickSeconds;
	return { long, bad: Math.min(rc.settings.badExperienceSeconds ?? DEFAULT_SETTINGS.badExperienceSeconds, long) };
}

/** Fewest measured sessions for a ranked page and for a score that is not `low_sample` (setting `satisfactionMinMeasured`). */
export function minMeasured(rc: ReportCtx): number {
	return rc.settings.satisfactionMinMeasured ?? DEFAULT_SETTINGS.satisfactionMinMeasured;
}

/**
 * Per-session classification in an inner query, counted per key (and day) outside. The landing exit is read
 * only for single-page sessions, from their one page view entry. Every count but `sessions` and `duration_ms`
 * counts measured sessions (`m = 1`) only.
 */
function countsSql(rc: ReportCtx, input: RunInput, keyExpr: string | null, byDay: boolean) {
	// The scope holds by construction too: every count, the score and each rate read organic search sessions only.
	const where = sessionWhere(rc.site, input.from, input.to, andFrags([input.traffic?.session ?? TRUE, ORGANIC_ONLY]));
	const d = rc.db.dialect;
	const x = entryCols(d, "x");
	const pvs = `FROM ${entriesOf(d, "x")} WHERE ${x.pv}`;
	const { long, bad } = thresholds(rc);
	const group = [keyExpr ? "t.key" : null, byDay ? "t.day" : null].filter(Boolean);
	const inner = `SELECT ${keyExpr ? `${keyExpr} AS key, ` : ""}s.day AS day, ${DURATION_MS} AS dur,
CASE WHEN s.visible_ms > 0 THEN 1 ELSE 0 END AS m,
CASE WHEN s.pageviews = 1 AND s.events = 0 THEN 1 ELSE 0 END AS single,
s.interacted AS inter, s.reentries AS re, s.engaged_ms AS eng,
CASE WHEN s.pageviews = 1 THEN (SELECT MAX(${x.exit}) ${pvs}) END AS lexit,
CASE WHEN s.reentries > 0 THEN (SELECT ${x.exit} ${pvs} ORDER BY ${x.ts}, ${x.id} LIMIT 1) END AS fexit
FROM ca_sessions s WHERE ${where.sql}`;
	const sql = `SELECT ${group.map((g) => `${g} AS ${g?.slice(2)}, `).join("")}COUNT(*) AS sessions, SUM(t.m) AS measured, SUM(t.dur) AS duration_ms,
SUM(CASE WHEN t.m = 1 AND t.dur > ? THEN 1 ELSE 0 END) AS long_clicks,
SUM(CASE WHEN t.m = 1 AND t.dur <= ? THEN 1 ELSE 0 END) AS short_clicks,
SUM(CASE WHEN t.m = 1 AND t.single = 1 AND t.inter = 0 AND t.dur < ? THEN 1 ELSE 0 END) AS bad_experiences,
SUM(CASE WHEN t.m = 1 AND t.single = 1 AND t.dur <= ? AND t.lexit = 2 THEN 1 ELSE 0 END) AS pogo_sticks,
SUM(CASE WHEN t.m = 1 AND t.re > 0 THEN 1 ELSE 0 END) AS reentered,
SUM(CASE WHEN t.m = 1 AND t.re > 0 AND t.fexit = 2 THEN 1 ELSE 0 END) AS returned_from_search,
SUM(CASE WHEN t.m = 1 THEN t.eng ELSE 0 END) AS engaged_ms
FROM (${inner}) t${group.length ? ` GROUP BY ${group.join(", ")}` : ""}`;
	return { sql, params: [long * 1000, long * 1000, bad * 1000, long * 1000, ...where.params] };
}

const counts = (r: Record<string, unknown> | undefined): Counts => Object.fromEntries(COUNTS.map((c) => [c, num(r?.[c])])) as Counts;

/**
 * Page score (docs/sessions.md "Best and worst pages"): long click rate minus bad experience rate minus pogo-sticking
 * rate, all over measured sessions, so `(long_clicks - bad_experiences - pogo_sticks) / measured`. Null when nothing
 * is measured.
 */
export function score(c: Pick<Counts, "measured" | "long_clicks" | "bad_experiences" | "pogo_sticks">): number | null {
	if (!c.measured) return null;
	return round((c.long_clicks - c.bad_experiences - c.pogo_sticks) / c.measured);
}

/** Satisfaction figures; every rate, the score and `avg_engaged` divide by measured sessions, `avg_duration` by all sessions. */
function rates(c: Counts): Metrics {
	return {
		sessions: c.sessions,
		measured: c.measured,
		avg_duration: round(ratio(c.duration_ms / 1000, c.sessions), 1),
		avg_engaged: round(ratio(c.engaged_ms / 1000, c.measured), 1),
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
		pogo_stick_rate: round(ratio(c.pogo_sticks, c.measured)),
		returned_from_search_rate: round(ratio(c.returned_from_search, c.measured)),
		search_reentry_rate: round(ratio(c.reentered, c.measured)),
		score: score(c),
	};
}

/** Back/forward loads per path: `nav = 2` over pageviews with a known navigation type (full loads only). */
async function backNav(rc: ReportCtx, input: RunInput, keys: readonly string[] | null) {
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "pv", keys ? keysIn(rc, h.path, keys) : TRUE);
	const cols = `SUM(CASE WHEN ${h.nav} = 2 THEN 1 ELSE 0 END) AS bf, COUNT(${h.nav}) AS loads`;
	const rows = await rc.db.all(keys ? `SELECT ${h.path} AS key, ${cols} ${j.sql} GROUP BY ${h.path}` : `SELECT ${cols} ${j.sql}`, j.params);
	return rows.map((r) => ({ key: r.key == null ? "" : String(r.key), rate: round(ratio(num(r.bf), num(r.loads))), loads: num(r.loads) }));
}

/** Score order of `params.rank` over the grouped counts `g`; `1.0 *` keeps the division real on every dialect. */
const SCORE_SQL = "(1.0 * (g.long_clicks - g.bad_experiences - g.pogo_sticks) / g.measured)";

/**
 * Landing page table plus totals; `params.by` groups by a session dimension instead of the landing page,
 * and `params.rank` (`best` | `worst`) orders landing pages with at least `minMeasured(rc)` measured sessions
 * by score. A ranked compare run reads the previous period's busiest landing pages unranked, so a ranked page finds
 * its previous row by key (shortcut: up to 1000 pages; a page outside them shows no previous value). Totals and
 * every row carry `low_sample` (fewer measured sessions than `min_measured`) after `back_nav_rate`.
 */
export async function satisfaction(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const byName = (input.params.by ?? "entry") as SatisfactionBy;
	if (!(SATISFACTION_BY as readonly string[]).includes(byName)) throw new QueryError("invalid_params", `satisfaction params.by is one of ${SATISFACTION_BY.join(", ")}.`);
	const rank = input.params.rank;
	if (rank && byName !== "entry") throw new QueryError("invalid_params", "satisfaction params.rank ranks landing pages; leave params.by out or set it to entry.");
	const by = countsSql(rc, input, BY_COL[byName], false);
	const ranked = rank && !input.isCompare;
	const min = minMeasured(rc);
	const limit = rank && input.isCompare ? 1000 : input.limit;
	const rows = ranked
		? await rc.db.all(`SELECT g.* FROM (${by.sql}) g WHERE g.measured >= ? ORDER BY ${SCORE_SQL} ${rank === "best" ? "DESC" : "ASC"}, g.sessions DESC, g.key LIMIT ? OFFSET ?`, [...by.params, min, limit + 1, input.offset])
		: await rc.db.all(`${by.sql} ORDER BY sessions DESC, key LIMIT ? OFFSET ?`, [...by.params, limit + 1, input.offset]);
	const page = rows.slice(0, limit);
	const keys = byName === "entry" ? page.map((r) => String(r.key)) : [];
	const nav = new Map(keys.length ? (await backNav(rc, input, keys)).map((r) => [r.key, r]) : []);
	const tot = countsSql(rc, input, null, false);
	const [t] = await rc.db.all(tot.sql, tot.params);
	const [tb] = await backNav(rc, input, null);
	const { long, bad } = thresholds(rc);
	const tc = counts(t);
	// An impact measurement (`lean`) also reads the page loads the back/forward rate rests on, its base.
	const loads = (n: { loads: number } | undefined): Record<string, number> => (input.lean ? { page_loads: n?.loads ?? 0 } : {});
	return {
		totals: { ...rates(tc), back_nav_rate: tb?.rate ?? null, low_sample: tc.measured < min, ...loads(tb) },
		rows: page.map((r): Row => {
			const c = counts(r);
			const b = nav.get(String(r.key));
			return { key: String(r.key), ...rates(c), back_nav_rate: b?.rate ?? null, low_sample: c.measured < min, ...(byName === "entry" ? loads(b) : {}) };
		}),
		truncated: rows.length > limit,
		thresholds: { long_click_seconds: long, bad_experience_seconds: bad },
		min_measured: min,
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
		return { t, pct_long, pct_short, pct_bad, pogo_stick_rate, returned_from_search_rate, avg_engaged, sessions, measured, long_clicks, short_clicks, bad_experiences, pogo_sticks };
	});
	if (input.isCompare) return { series, granularity: gran };
	const { long, bad } = thresholds(rc);
	return { series, granularity: gran, thresholds: { long_click_seconds: long, bad_experience_seconds: bad }, annotations: annotationsIn(rc, input.from, input.to), notices: asked === "hour" ? ["granularity_day"] : [] };
}

