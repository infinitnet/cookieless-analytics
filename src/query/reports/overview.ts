import { TRUE } from "../compile.js";
import { liveVisits, type ReportCtx, type ReportData, type RunInput, num, sessionTotals } from "./base.js";

/** KPI strip: totals plus realtime sessions (current run only). */
export async function overview(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const totals = await sessionTotals(rc, input);
	if (input.isCompare || input.lean) return { totals };
	const filters = input.traffic?.session ?? TRUE;
	const live = liveVisits(rc);
	const [r] = await rc.db.all(`SELECT COUNT(*) AS n FROM ca_sessions s WHERE ${live.sql} AND (${filters.sql})`, [...live.params, ...filters.params]);
	return { totals, realtime: num(r?.n), ...(await firstRun(rc, totals.sessions)) };
}

/**
 * `stored`: whether the site holds any visit at all, detailed or summarized, asked only when the range has none: the
 * admin then tells a first run (no visit yet) from an empty range. One indexed lookup, nothing otherwise.
 */
export async function firstRun(rc: ReportCtx, sessions: unknown): Promise<{ stored?: boolean }> {
	if (num(sessions) > 0) return {};
	const rows = await rc.db.all("SELECT 1 AS n FROM ca_sessions WHERE site = ? UNION ALL SELECT 1 AS n FROM ca_rollup WHERE site = ? LIMIT 1", [rc.site, rc.site]);
	return { stored: rows.length > 0 };
}
