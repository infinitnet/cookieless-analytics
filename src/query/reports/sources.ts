import { andFrags } from "../compile.js";
import { keysIn, num, type ReportCtx, type ReportData, type RunInput, sessionBreakdown, sessionWhere } from "./base.js";

/** Channel name of AI assistant referrals (data/channels.json). */
export const AI_CHANNEL = "AI Assistants";
const NOT_SET = "'(not set)'";

export const channels = (rc: ReportCtx, input: RunInput) => sessionBreakdown(rc, input, `COALESCE(s.channel, ${NOT_SET})`);
export const sources = (rc: ReportCtx, input: RunInput) => sessionBreakdown(rc, input, `COALESCE(s.source, ${NOT_SET})`);

/** Sessions per value of one UTM field (default `utm_campaign`); sessions without it are left out. */
export function campaigns(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const col = `s.${input.params.field ?? "utm_campaign"}`;
	return sessionBreakdown(rc, input, col, { sql: `${col} IS NOT NULL`, params: [] });
}

/** Sessions from AI assistants by source, with their top landing pages (a lower bound). */
export async function aiReferrals(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const d = await sessionBreakdown(rc, input, `COALESCE(s.source, ${NOT_SET})`, { sql: "s.channel = ?", params: [AI_CHANNEL] });
	const keys = (d.rows ?? []).map((r) => r.key);
	if (!keys.length) return d;
	const w = andFrags([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? { sql: "1 = 1", params: [] }), { sql: "s.channel = ?", params: [AI_CHANNEL] }, keysIn(rc, `COALESCE(s.source, ${NOT_SET})`, keys)]);
	const landing = await rc.db.all(
		`SELECT COALESCE(s.source, ${NOT_SET}) AS key, s.entry_path AS path, COUNT(*) AS n FROM ca_sessions s WHERE ${w.sql} GROUP BY COALESCE(s.source, ${NOT_SET}), s.entry_path ORDER BY n DESC, path`,
		w.params,
	);
	const top = new Map<string, Array<{ path: string; sessions: number }>>();
	for (const r of landing) {
		const list = top.get(String(r.key)) ?? [];
		if (list.length < 5) list.push({ path: String(r.path), sessions: num(r.n) });
		top.set(String(r.key), list);
	}
	d.rows = d.rows?.map((r) => ({ ...r, landing: top.get(r.key) ?? [] }));
	return d;
}
