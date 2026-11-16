/**
 * Internal site search: the terms kept in the query (`qs`) of page view entries under the configured
 * parameter names, raw window only. One statement: the distinct query strings carrying a name (a `LIKE`
 * prefilter per name), at most 5,000, parsed in JS with an exact name match.
 */
import { LIKE_ESCAPE, likeEscape } from "../../db/dialect.js";
import { entryCols, hitJoin, num, type ReportCtx, type ReportData, type Row, type RunInput, ratio, round } from "./base.js";
import { JOURNEY_MIN_SESSIONS } from "./journeys.js";

export const SITE_SEARCH_DISTINCT_CAP = 5_000;

export async function siteSearch(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const names = rc.siteSearchParams ?? [];
	if (!names.length) return { rows: [], notices: ["site_search_off"] };
	const hq = entryCols(rc.db.dialect).query;
	const like = { sql: names.map(() => `${hq} LIKE ? ${LIKE_ESCAPE}`).join(" OR "), params: names.map((n) => `%${likeEscape(n)}=%`) };
	const j = hitJoin(rc, input, "pv", like);
	const strings = await rc.db.all(`SELECT ${hq} AS q, COUNT(*) AS searches, COUNT(DISTINCT s.sid) AS sessions ${j.sql} GROUP BY ${hq} ORDER BY searches DESC, q LIMIT ?`, [
		...j.params,
		SITE_SEARCH_DISTINCT_CAP + 1,
	]);
	const terms = new Map<string, { searches: number; sessions: number; strings: number }>();
	for (const r of strings.slice(0, SITE_SEARCH_DISTINCT_CAP)) {
		const params = new URLSearchParams(String(r.q ?? ""));
		const seen = new Set<string>();
		for (const [k, v] of params) if (names.includes(k) && v) seen.add(v);
		for (const term of seen) {
			const t = terms.get(term) ?? { searches: 0, sessions: 0, strings: 0 };
			t.searches += num(r.searches);
			// Summed over the distinct strings: a session that searched the term twice with other parameters counts twice.
			t.sessions += num(r.sessions);
			t.strings += 1;
			terms.set(term, t);
		}
	}
	let all: Row[] = [...terms]
		.map(([key, t]) => ({ key, searches: t.searches, sessions: t.sessions, searches_per_session: round(ratio(t.searches, t.sessions), 2), sessions_upper_bound: t.strings > 1 }))
		.sort((a, b) => b.searches - a.searches || b.sessions - a.sessions || (a.key < b.key ? -1 : 1));
	let hidden_terms: number | undefined;
	// Shared pages and emails omit terms of a single session: one person's words.
	if (rc.publicSurface) {
		const kept = all.filter((r) => num(r.sessions) >= JOURNEY_MIN_SESSIONS);
		hidden_terms = all.length - kept.length;
		all = kept;
	}
	return {
		rows: all.slice(input.offset, input.offset + input.limit),
		truncated: all.length > input.offset + input.limit,
		totals: { searches: all.reduce((a, r) => a + num(r.searches), 0), terms: all.length },
		...(hidden_terms !== undefined ? { hidden_terms } : {}),
		...(strings.length > SITE_SEARCH_DISTINCT_CAP ? { notices: ["site_search_capped"] } : {}),
	};
}
