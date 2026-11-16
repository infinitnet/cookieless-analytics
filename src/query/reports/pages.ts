import { dayInt } from "../../db/dialect.js";
import { andFrags, type Frag, TRUE } from "../compile.js";
import { entryCols, hitJoin, keysIn, num, type ReportCtx, type ReportData, type Row, type RunInput, ratio, round, sessionBreakdown, sessionWhere } from "./base.js";

/** Search metrics for page keys over the range: page grain rows of the selected source. */
export async function searchForPages(rc: ReportCtx, input: RunInput, keys: readonly string[]) {
	const out = new Map<string, { clicks: number; impressions: number; ctr: number | null; position: number | null }>();
	if (!keys.length) return out;
	const src = input.params.source && input.params.source !== "all" ? { sql: "d.source = ?", params: [input.params.source] } : TRUE;
	const where = andFrags([
		{ sql: "d.site = ? AND d.day BETWEEN ? AND ? AND d.query = '' AND d.country = '' AND d.device = ''", params: [rc.site, input.from, input.to] },
		keysIn(rc, "d.page_key", keys),
		src,
	]);
	const rows = await rc.db.all(
		`SELECT d.page_key AS key, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE ${where.sql} GROUP BY d.page_key`,
		where.params,
	);
	for (const r of rows) {
		const clicks = num(r.clicks);
		const impressions = num(r.impressions);
		out.set(String(r.key), { clicks, impressions, ctr: round(ratio(clicks, impressions)), position: round(ratio(num(r.pos_sum), impressions), 2) });
	}
	return out;
}

/** Pageviews per path over the range for the given keys (exit rate denominator). */
async function pageviewsFor(rc: ReportCtx, input: RunInput, keys: readonly string[]): Promise<Map<string, number>> {
	if (!keys.length) return new Map();
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "pv", keysIn(rc, h.path, keys));
	const rows = await rc.db.all(`SELECT ${h.path} AS key, COUNT(*) AS n ${j.sql} GROUP BY ${h.path}`, j.params);
	return new Map(rows.map((r) => [String(r.key), num(r.n)]));
}

/** Lower median from a value histogram. */
function median(hist: Array<[number, number]>): number | null {
	const total = hist.reduce((a, [, n]) => a + n, 0);
	if (!total) return null;
	let seen = 0;
	for (const [v, n] of hist.sort((a, b) => a[0] - b[0])) {
		seen += n;
		if (seen * 2 >= total) return v;
	}
	return null;
}

/** Top pages: pageviews, visitors, avg time on page, exit rate, scroll median; optional search columns. */
export async function pages(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "pv");
	const rows = await rc.db.all(
		`SELECT t.key AS key, SUM(t.pageviews) AS pageviews, SUM(t.visitors) AS visitors, SUM(t.dur_sum) AS dur_sum, SUM(t.dur_n) AS dur_n FROM (
SELECT ${h.path} AS key, s.day AS day, COUNT(*) AS pageviews, COUNT(DISTINCT s.vkey) AS visitors, SUM(${h.dur}) AS dur_sum, COUNT(${h.dur}) AS dur_n ${j.sql} GROUP BY ${h.path}, s.day
) t GROUP BY t.key ORDER BY pageviews DESC, key LIMIT ? OFFSET ?`,
		[...j.params, input.limit + 1, input.offset],
	);
	const page = rows.slice(0, input.limit);
	const keys = page.map((r) => String(r.key));

	const exits = new Map<string, number>();
	const scroll = new Map<string, Array<[number, number]>>();
	if (keys.length) {
		const w = andFrags([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), keysIn(rc, "s.exit_path", keys)]);
		for (const r of await rc.db.all(`SELECT s.exit_path AS key, COUNT(*) AS n FROM ca_sessions s WHERE ${w.sql} GROUP BY s.exit_path`, w.params))
			exits.set(String(r.key), num(r.n));
		const sj = hitJoin(rc, input, "pv", andFrags([keysIn(rc, h.path, keys), { sql: `${h.scroll} IS NOT NULL`, params: [] }]));
		for (const r of await rc.db.all(`SELECT ${h.path} AS key, ${h.scroll} AS v, COUNT(*) AS n ${sj.sql} GROUP BY ${h.path}, ${h.scroll}`, sj.params)) {
			const k = String(r.key);
			scroll.set(k, [...(scroll.get(k) ?? []), [num(r.v), num(r.n)]]);
		}
	}
	const search = input.params.withSearch ? await searchForPages(rc, input, keys) : null;

	const out: Row[] = page.map((r) => {
		const key = String(r.key);
		const pageviews = num(r.pageviews);
		const row: Row = {
			key,
			pageviews,
			visitors: num(r.visitors),
			avg_time: round(ratio(num(r.dur_sum) / 1000, num(r.dur_n)), 1),
			// A visit opened by an event can exit on a path it never viewed (more exits than views): capped at 1, as in the summaries.
			exit_rate: capped(round(ratio(exits.get(key) ?? 0, pageviews))),
			scroll_median: median(scroll.get(key) ?? []),
		};
		if (search) {
			const s = search.get(key);
			Object.assign(row, { impressions: s?.impressions ?? null, clicks: s?.clicks ?? null, ctr: s?.ctr ?? null, position: s?.position ?? null });
		}
		return row;
	});
	return { rows: out, truncated: rows.length > input.limit };
}

/** Entry pages: entries (sessions), visitors, bounce rate, avg duration. */
export async function entryPages(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const d = await sessionBreakdown(rc, input, "s.entry_path");
	d.rows = d.rows?.map(({ sessions, ...r }) => ({ ...r, entries: sessions }));
	return d;
}

/** An exit rate at most 1 (null stays null). */
const capped = (v: number | null) => (v === null ? null : Math.min(1, v));

/** Exit pages: exits and exit rate (exits / pageviews of the path). */
export async function exitPages(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const d = await sessionBreakdown(rc, input, "s.exit_path");
	const pv = await pageviewsFor(rc, input, (d.rows ?? []).map((r) => r.key));
	d.rows = d.rows?.map((r) => ({ key: r.key, exits: r.sessions, visitors: r.visitors, exit_rate: capped(round(ratio(num(r.sessions), pv.get(r.key) ?? 0))) }));
	return d;
}

/** Human 404 responses by path and external referrer: the server's counters in `ca_srv`, by their own day. */
export async function notFound(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const where: Frag = andFrags([
		{ sql: "h.site = ? AND h.day BETWEEN ? AND ? AND h.status = 404", params: [rc.site, dayInt(input.from), dayInt(input.to)] },
		input.traffic?.srv ?? TRUE,
	]);
	const rows = await rc.db.all(
		`SELECT h.path AS key, NULLIF(h.ref, '') AS ref, SUM(h.n) AS hits, MAX(h.last_ts) AS last_seen FROM ca_srv h WHERE ${where.sql} GROUP BY h.path, h.ref ORDER BY hits DESC, key, ref LIMIT ? OFFSET ?`,
		[...where.params, input.limit + 1, input.offset],
	);
	const notices = (input.filters ?? []).some((f) => f.dim !== "page") ? ["filters_not_applied"] : [];
	return {
		rows: rows.slice(0, input.limit).map((r) => ({ key: String(r.key), ref: r.ref == null ? null : String(r.ref), hits: num(r.hits), last_seen: num(r.last_seen) })),
		truncated: rows.length > input.limit,
		notices,
	};
}
