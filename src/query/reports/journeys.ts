/**
 * Journeys: session level page flows over the pageviews of the filtered sessions. Each report is
 * one statement plus one count statement for the session cap. Consecutive views of one path (a reload, a route
 * re-entry) are one step. Pageviews in the same second are ordered by entry key, so such pairs may swap. Before
 * the detailed window `journeysFromSummary` answers from the daily `next` and `path3` rows (`journeyDay`), which
 * keep the top steps and paths of each day: notice `top_paths_per_day`.
 */
import { daysBetween } from "../../core/time.js";
import { andFrags, type Frag, QueryError, TRUE } from "../compile.js";
import { entriesOf, entryCols, num, type ReportCtx, type ReportData, type Row, type RunInput, ratio, round, sessionWhere } from "./base.js";

export const JOURNEY_MAX_RANGE_DAYS = 31;
export const JOURNEY_SESSION_CAP = 50_000;
/** Rows with fewer sessions are omitted and counted in `hidden_sessions`: a one session path is one person's route. */
export const JOURNEY_MIN_SESSIONS = 2;
export const JOURNEY_MAX_ROWS = 20;
/** Grouped rows read before the floor; one page has far fewer distinct neighbors. */
const GROUP_LIMIT = 5000;

export const EXIT = "(exit)";
export const ENTRY = "(entry)";

// One sid may start visits on two days: the visit is `(day, sid)`.
const ORDER = "PARTITION BY p.day, p.sid ORDER BY p.ts, p.id";

/**
 * Range and session caps, then the windowed CTE `seq (sid, path, prev, next, next2, n)`: one row per step of a
 * session, with the previous and the two following steps and the step number.
 */
export async function journeyBase(rc: ReportCtx, input: RunInput): Promise<Frag> {
	checkRange(input);
	const sessions = sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE);
	const [c] = await rc.db.all(`SELECT COUNT(*) AS n FROM ca_sessions s WHERE ${sessions.sql}`, sessions.params);
	const n = num(c?.n);
	if (n > JOURNEY_SESSION_CAP) throw new QueryError("journey_cap", `Journeys read at most ${JOURNEY_SESSION_CAP} sessions; this range has ${n}. Narrow the range or add filters.`);
	return journeySeq(rc, sessions);
}

/** The windowed CTE `seq` over the page views of the visits `sessions` selects (no range or session cap). */
function journeySeq(rc: ReportCtx, sessions: Frag): Frag {
	const h = entryCols(rc.db.dialect);
	const where = andFrags([sessions, { sql: h.pv, params: [] }]);
	return {
		sql: `WITH v AS (SELECT s.day AS day, s.sid AS sid, ${h.path} AS path, ${h.ts} AS ts, ${h.id} AS id, LAG(${h.path}) OVER (PARTITION BY s.day, s.sid ORDER BY ${h.ts}, ${h.id}) AS prior
FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql}),
p AS (SELECT v.day AS day, v.sid AS sid, v.path AS path, v.ts AS ts, v.id AS id FROM v WHERE v.prior IS NULL OR v.prior <> v.path),
seq AS (SELECT p.sid AS sid, p.path AS path, LAG(p.path) OVER (${ORDER}) AS prev, LEAD(p.path) OVER (${ORDER}) AS next, LEAD(p.path, 2) OVER (${ORDER}) AS next2, ROW_NUMBER() OVER (${ORDER}) AS n FROM p)`,
		params: where.params,
	};
}

function checkRange(input: RunInput): void {
	const days = daysBetween(input.from, input.to);
	if (days > JOURNEY_MAX_RANGE_DAYS) throw new QueryError("journey_range", `Journeys read at most ${JOURNEY_MAX_RANGE_DAYS} days; this range has ${days}. Choose a shorter range.`);
}

/** Rows at or above the floor (at most 20) and the sessions of the omitted ones. */
function floor<T extends { sessions: number }>(rows: T[]): { rows: T[]; hidden_sessions: number } {
	const kept = rows.filter((r) => r.sessions >= JOURNEY_MIN_SESSIONS);
	return { rows: kept.slice(0, JOURNEY_MAX_ROWS), hidden_sessions: rows.filter((r) => r.sessions < JOURNEY_MIN_SESSIONS).reduce((a, r) => a + r.sessions, 0) };
}

function neighbor(column: "next" | "prev", none: string) {
	return async (rc: ReportCtx, input: RunInput): Promise<ReportData> => {
		const path = input.params.path;
		if (!path) throw new QueryError("invalid_params", `journey_${column} needs params.path.`);
		const base = await journeyBase(rc, input);
		const key = `COALESCE(t.${column}, '${none}')`;
		const rows = await rc.db.all(
			`${base.sql}
SELECT ${key} AS key, COUNT(DISTINCT t.sid) AS sessions, (SELECT COUNT(DISTINCT x.sid) FROM seq x WHERE x.path = ?) AS page_sessions
FROM seq t WHERE t.path = ? AND COALESCE(t.${column}, '') <> t.path GROUP BY ${key} ORDER BY sessions DESC, key LIMIT ${GROUP_LIMIT}`,
			[...base.params, path, path],
		);
		const total = num(rows[0]?.page_sessions);
		const all = rows.map((r) => ({ key: String(r.key), sessions: num(r.sessions), share: round(ratio(num(r.sessions), total)) }));
		return { ...floor(all), page_sessions: total };
	};
}

/** What followed the page, including `(exit)`. A drill-down, not a tile report. */
export const journeyNext = neighbor("next", EXIT);
/** What preceded the page, including `(entry)`. A drill-down, not a tile report. */
export const journeyPrev = neighbor("prev", ENTRY);

/** The most common three step sequences from the entry page (`params.entry` narrows the entry page). */
export async function journeyPaths(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const base = await journeyBase(rc, input);
	const entry = input.params.entry;
	const p2 = `COALESCE(t.next, '${EXIT}')`;
	const p3 = `CASE WHEN t.next IS NULL THEN '' ELSE COALESCE(t.next2, '${EXIT}') END`;
	const rows = await rc.db.all(
		`${base.sql}
SELECT t.path AS path1, ${p2} AS path2, ${p3} AS path3, COUNT(*) AS sessions FROM seq t WHERE t.n = 1${entry ? " AND t.path = ?" : ""}
GROUP BY t.path, ${p2}, ${p3} ORDER BY sessions DESC, path1, path2, path3 LIMIT ${GROUP_LIMIT}`,
		[...base.params, ...(entry ? [entry] : [])],
	);
	const all = rows.map((r): Row & { sessions: number } => {
		const path3 = String(r.path3) || null;
		const steps = [String(r.path1), String(r.path2), ...(path3 ? [path3] : [])];
		return { key: steps.join(" > "), path1: String(r.path1), path2: String(r.path2), path3, sessions: num(r.sessions) };
	});
	return floor(all);
}

// ── daily summaries ──────────────────────────────────────────────────────────

/** Summary dims of the journeys: `next` (key a page, segkey the next page, `(exit)`, or '' for the page's own sessions; key `(entry)` for landings) and `path3` (key the entry page, segkey the next two steps). */
export const JOURNEY_DIMS = ["next", "path3"] as const;
/** Separates the second and third step of a `path3` segkey (no path holds it). */
export const STEP_SEP = "\u001f";

/** One row of `journeyDay`: distinct visits per step, page or path. */
export interface JourneyDayRow {
	dim: (typeof JOURNEY_DIMS)[number];
	key: string;
	segkey: string;
	sessions: number;
}

/**
 * The journey rows of one site and day for the summaries, one statement over the same steps as the reports: what
 * followed each page, which page each visit landed on, the visits of each page, and the three step paths. A visit
 * belongs to one day, so the rows of several days add up to the detailed counts.
 */
export async function journeyDay(rc: ReportCtx, day: string): Promise<JourneyDayRow[]> {
	const base = journeySeq(rc, sessionWhere(rc.site, day, day, TRUE));
	const p2 = `COALESCE(t.next, '${EXIT}')`;
	const p3 = `CASE WHEN t.next IS NULL THEN '' ELSE COALESCE(t.next2, '${EXIT}') END`;
	const rows = await rc.db.all(
		`${base.sql}
SELECT 'next' AS dim, t.path AS key, ${p2} AS segkey, COUNT(DISTINCT t.sid) AS sessions FROM seq t WHERE COALESCE(t.next, '') <> t.path GROUP BY t.path, ${p2}
UNION ALL SELECT 'next', '${ENTRY}', t.path, COUNT(DISTINCT t.sid) FROM seq t WHERE t.n = 1 GROUP BY t.path
UNION ALL SELECT 'next', t.path, '', COUNT(DISTINCT t.sid) FROM seq t GROUP BY t.path
UNION ALL SELECT 'path3', t.path, ${p2} || '${STEP_SEP}' || ${p3}, COUNT(*) FROM seq t WHERE t.n = 1 GROUP BY t.path, ${p2}, ${p3}`,
		base.params,
	);
	return rows.map((r) => ({ dim: r.dim as JourneyDayRow["dim"], key: String(r.key), segkey: String(r.segkey), sessions: num(r.sessions) }));
}

type Runner = (rc: ReportCtx, input: RunInput) => Promise<ReportData & { notices: string[] }>;

/** `dim:reason` of the filters a journey summary answer cannot honor: every filter (journey rows have no segments). */
export const journeysUnavailable = (filters: RunInput["filters"]): string[] => [...new Set(filters.map((f) => `${f.dim}:not_kept`))];

/** Range rule and notices of a summary answer: no filter applies to the journey rows. */
function summaryNotices(input: RunInput): string[] {
	checkRange(input);
	return ["top_paths_per_day", ...journeysUnavailable(input.filters).map((u) => `filter_unavailable:${u}`)];
}

const read = async (rc: ReportCtx, input: RunInput, dim: (typeof JOURNEY_DIMS)[number], o: { key?: string; segkey?: string }) =>
	(await import("../rollup.js")).readFamily(rc, input.from, input.to, { table: "ca_rollup", dim, seg: "", ...o });

function neighborFromSummary(column: "next" | "prev"): Runner {
	return async (rc, input) => {
		const notices = summaryNotices(input);
		const path = input.params.path;
		if (!path) throw new QueryError("invalid_params", `journey_${column} needs params.path.`);
		const own = await read(rc, input, "next", { key: path });
		const total = num(own.find((r) => r.segkey === "")?.sessions);
		const steps = column === "next" ? own.filter((r) => r.segkey !== "").map((r) => ({ key: String(r.segkey), n: num(r.sessions) })) : (await read(rc, input, "next", { segkey: path })).map((r) => ({ key: String(r.key), n: num(r.sessions) }));
		const all = steps.sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1)).map((r) => ({ key: r.key, sessions: r.n, share: round(ratio(r.n, total)) }));
		return { ...floor(all), page_sessions: total, notices };
	};
}

/**
 * The journey reports from the daily summary rows (a range before the detailed window), in the detailed reports'
 * shape, with the 31 day range rule and the floor of two sessions. Each day keeps its top steps and paths, so the
 * answer is the top paths per day (`top_paths_per_day`); filters do not apply (`filter_unavailable:<dim>:not_kept`).
 */
export const journeysFromSummary: Record<"journey_next" | "journey_prev" | "journey_paths", Runner> = {
	journey_next: neighborFromSummary("next"),
	journey_prev: neighborFromSummary("prev"),
	journey_paths: async (rc, input) => {
		const notices = summaryNotices(input);
		const entry = input.params.entry;
		const rows = (await read(rc, input, "path3", entry ? { key: entry } : {})).map((r): Row & { sessions: number; path2: string; path3: string | null } => {
			const [path2 = "", rest = ""] = String(r.segkey).split(STEP_SEP);
			const path3 = rest || null;
			const steps = [String(r.key), path2, ...(path3 ? [path3] : [])];
			return { key: steps.join(" > "), path1: String(r.key), path2, path3, sessions: num(r.sessions) };
		});
		const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
		rows.sort((a, b) => b.sessions - a.sessions || cmp(String(a.path1), String(b.path1)) || cmp(a.path2, b.path2) || cmp(a.path3 ?? "", b.path3 ?? ""));
		return { ...floor(rows), notices };
	},
};
