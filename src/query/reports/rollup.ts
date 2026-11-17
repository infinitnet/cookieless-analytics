/**
 * Report executors over the summaries: ranges before the detailed window, and long ranges inside
 * it that the dispatcher routes here. Rows come from `planRows` (stored days plus open days in memory); the filter
 * plan decides which filters apply: the report's own dimension, and one segment (channel, country or device) with a
 * pair dimension through a pair row. Every other filter is reported as `filter_unavailable:<dim>:<reason>`.
 */
import { QueryError } from "../compile.js";
import { OTHER, type RollupDim } from "../rollup.js";
import { liveVisits, annotationsIn, num, type ReportCtx, type ReportData, type Row, type RunInput, ratio, round, sessionMetrics } from "./base.js";
import { firstRun } from "./overview.js";
import { searchForPages } from "./pages.js";
import { SATISFACTION_RAW_ONLY } from "./satisfaction-copy.js";
import { ORDERS_RAW_ONLY } from "./revenue-copy.js";
import { FILTER_DIMS, matchKey, type Plan, planFilters, planRows, readSummary, SEGMENTS, type SumRow } from "./summary.js";
import { bucketSeries, resolveGranularity } from "./timeseries.js";

export { matchKey, planFilters };

const sessionRow = (r: Record<string, unknown>) => sessionMetrics({ ...r, duration_ms: r.engaged_ms });

function paginate(rows: Row[], input: RunInput): ReportData {
	return { rows: rows.slice(input.offset, input.offset + input.limit), truncated: rows.length > input.offset + input.limit };
}

const byKey = (rows: readonly SumRow[]) => new Map(rows.map((r) => [r.key, r]));

/** Totals of the filtered sessions. */
async function totals(rc: ReportCtx, input: RunInput, plan: Plan): Promise<Record<string, unknown>> {
	return (await planRows(rc, input, plan, null))[0] ?? {};
}

/** Denominator of event and goal rates: every session under the segment filters the report applied. */
const segmentPlan = (plan: Plan) => planFilters(plan.applied.filter((f) => (SEGMENTS as readonly string[]).includes(FILTER_DIMS[f.dim] ?? "")), null);

/**
 * Exit rate of each key, exits over page views summed over the same days. A day with only one of the two rows counts
 * when the other family kept every key that day (no `(other)` row, so that side is 0); when it folded, the key's
 * share of that day is unknown and its rate is null (`partial`). A day with neither row adds to neither side. At most
 * 1: a visit opened by an event can exit on a page it never viewed. `(other)` itself has no rate.
 */
export async function exitRates(rc: ReportCtx, input: RunInput, keys: readonly string[]): Promise<{ rates: Map<string, number | null>; partial: boolean }> {
	const read = (dim: RollupDim) => readSummary(rc, input.from, input.to, { table: "ca_rollup", dim, seg: "", byDay: true, keys: [...keys, OTHER] });
	const pages = await read("page");
	const exits = await read("exit");
	const at = (rows: SumRow[], m: string) => new Map(rows.map((r) => [`${r.key}\u0000${r.day}`, num(r[m])]));
	const folded = (rows: SumRow[]) => new Set(rows.filter((r) => r.key === OTHER).map((r) => r.day));
	const [pv, ex, pvFolded, exFolded] = [at(pages, "pageviews"), at(exits, "sessions"), folded(pages), folded(exits)];
	const days = [...new Set([...pages, ...exits].map((r) => r.day))];
	const rates = new Map<string, number | null>();
	let partial = false;
	// `(other)` holds different pages in the two families: no rate.
	for (const key of keys.filter((k) => k !== OTHER)) {
		let views = 0;
		let out = 0;
		let known = true;
		for (const day of days) {
			const p = pv.get(`${key}\u0000${day}`);
			const e = ex.get(`${key}\u0000${day}`);
			if ((p === undefined && e !== undefined && pvFolded.has(day)) || (e === undefined && p !== undefined && exFolded.has(day))) known = false;
			views += p ?? 0;
			out += e ?? 0;
		}
		const rate = known ? round(ratio(out, views)) : null;
		if (!known) partial = true;
		rates.set(key, rate === null ? null : Math.min(1, rate));
	}
	return { rates, partial };
}

type Runner = (rc: ReportCtx, input: RunInput, plan: Plan) => Promise<ReportData>;

function breakdown(dim: RollupDim, rename?: (r: Row) => Row): [RollupDim, Runner] {
	return [
		dim,
		async (rc, input, plan) => {
			const rows = (await planRows(rc, input, plan, dim))
				.filter((r) => num(r.sessions) > 0)
				.map((r) => ({ key: r.key, ...sessionRow(r) }) as Row)
				.sort((a, b) => num(b.sessions) - num(a.sessions) || (a.key < b.key ? -1 : 1));
			return paginate(rename ? rows.map(rename) : rows, input);
		},
	];
}

/** Summary executors by report name; the tuple's dim is the report's own breakdown dim (null for totals). */
export const ROLLUP_REPORTS: Record<string, [RollupDim | null, Runner]> = {
	overview: [
		null,
		async (rc, input, plan) => {
			const t = sessionRow(await totals(rc, input, plan));
			if (input.isCompare || input.lean) return { totals: t };
			// Realtime is a raw count; it can honour no summary filter, so it is left out when filters are set.
			if (input.filters.length) return { totals: t, realtime: null, ...(await firstRun(rc, t.sessions)) };
			const live = liveVisits(rc);
			const [r] = await rc.db.all(`SELECT COUNT(*) AS n FROM ca_sessions s WHERE ${live.sql}`, live.params);
			return { totals: t, realtime: num(r?.n), ...(await firstRun(rc, t.sessions)) };
		},
	],
	timeseries: [
		null,
		async (rc, input, plan) => {
			const asked = resolveGranularity(input.granularity, input.from, input.to);
			const gran = asked === "hour" ? "day" : asked;
			const rows = await planRows(rc, input, plan, null, true);
			const series = bucketSeries(input.from, input.to, gran, rows.map((r) => ({ ...r, duration_ms: r.engaged_ms })));
			const notices = asked === "hour" ? ["granularity_day"] : [];
			return input.isCompare ? { series, granularity: gran } : { series, granularity: gran, annotations: annotationsIn(rc, input.from, input.to), notices };
		},
	],
	pages: [
		"page",
		async (rc, input, plan) => {
			const all = (await planRows(rc, input, plan, "page")).filter((r) => num(r.pageviews) > 0).sort((a, b) => num(b.pageviews) - num(a.pageviews) || (a.key < b.key ? -1 : 1));
			const page = all.slice(input.offset, input.offset + input.limit);
			const keys = page.map((r) => r.key);
			// Exits have no pair rows: the exit rate is known for the unsegmented page rows only.
			const exits = plan.src.seg === "" ? await exitRates(rc, input, keys) : null;
			const search = input.params.withSearch ? await searchForPages(rc, input, keys) : null;
			const rows: Row[] = page.map((r) => {
				const pageviews = num(r.pageviews);
				const row: Row = {
					key: r.key,
					pageviews,
					visitors: num(r.visitors),
					avg_time: round(ratio(num(r.engaged_ms) / 1000, num(r.hits)), 1),
					// Not kept in the summaries.
					avg_visible: null,
					exit_rate: exits?.rates.get(r.key) ?? null,
					scroll_median: null,
				};
				if (search) {
					const s = search.get(r.key);
					Object.assign(row, { impressions: s?.impressions ?? null, clicks: s?.clicks ?? null, ctr: s?.ctr ?? null, position: s?.position ?? null });
				}
				return row;
			});
			return { rows, truncated: all.length > input.offset + input.limit, notices: exits?.partial ? ["exit_rate_partial"] : [] };
		},
	],
	entry_pages: breakdown("entry", ({ sessions, ...r }) => ({ ...r, entries: sessions })),
	exit_pages: [
		"exit",
		async (rc, input, plan) => {
			const d = await breakdown("exit")[1](rc, input, plan);
			const { rates, partial } = await exitRates(rc, input, d.rows?.map((r) => String(r.key)) ?? []);
			d.rows = d.rows?.map((r) => ({ key: r.key, exits: r.sessions, visitors: r.visitors, exit_rate: rates.get(String(r.key)) ?? null }));
			return { ...d, notices: partial ? ["exit_rate_partial"] : [] };
		},
	],
	channels: breakdown("channel"),
	sources: breakdown("source"),
	campaigns: [
		"utm_campaign",
		async (rc, input, plan) => {
			if (input.params.field && input.params.field !== "utm_campaign") throw new QueryError("raw_only", "Only utm_campaign is kept beyond the raw window.");
			return breakdown("utm_campaign")[1](rc, input, plan);
		},
	],
	countries: breakdown("country"),
	devices: breakdown("device"),
	browsers: breakdown("browser"),
	os: breakdown("os"),
	languages: breakdown("lang"),
	events: [
		"event",
		async (rc, input, plan) => {
			const total = num((await totals(rc, input, segmentPlan(plan))).sessions);
			const rows = (await planRows(rc, input, plan, "event"))
				.filter((r) => !r.key.startsWith("_") && num(r.events) > 0)
				.map((r) => ({ key: r.key, events: num(r.events), sessions: num(r.sessions), rate: round(ratio(num(r.sessions), total)) }) as Row)
				.sort((a, b) => num(b.events) - num(a.events) || (a.key < b.key ? -1 : 1));
			return { ...paginate(rows, input), total_sessions: total };
		},
	],
	goals: [
		"goal",
		async (rc, input, plan) => {
			const total = num((await totals(rc, input, segmentPlan(plan))).sessions);
			const by = byKey(await planRows(rc, input, plan, "goal"));
			const own = plan.applied.filter((f) => f.dim === "goal");
			const rows: Row[] = rc.goals
				.filter((g) => g.active !== false && own.every((f) => matchKey(f, g.name)))
				.map((g) => {
					const r = by.get(g.name);
					const converting = num(r?.sessions);
					return { key: g.name, type: g.type, completions: num(r?.events), converting, conversion_rate: round(ratio(converting, total)) };
				})
				.sort((a, b) => num(b.converting) - num(a.converting) || (a.key < b.key ? -1 : 1));
			return { rows, total_sessions: total };
		},
	],
};

/** Reports with no summary executor and their own `raw_only` text. */
export const RAW_ONLY: Record<string, string> = {
	satisfaction: SATISFACTION_RAW_ONLY,
	satisfaction_series: SATISFACTION_RAW_ONLY,
	revenue_orders: ORDERS_RAW_ONLY,
};

/** The `raw_only` error of a report without summaries; names the first detailed day when known. */
export function rawOnly(report: string, rawFrom?: string): QueryError {
	const from = rawFrom ? ` Detailed data starts on ${rawFrom}.` : "";
	return new QueryError("raw_only", `${RAW_ONLY[report] ?? `The ${report} report needs detailed data, which is kept for the detailed window only. Choose a more recent range.`}${from}`);
}

/** Run a report from the summaries. Returns the data plus the notices for the response. */
export async function runRollupReport(report: string, rc: ReportCtx, input: RunInput): Promise<{ data: ReportData; notices: string[] }> {
	const entry = ROLLUP_REPORTS[report];
	if (!entry || RAW_ONLY[report]) throw rawOnly(report, rc.rawFrom);
	const [dim, run] = entry;
	const plan = planFilters(input.filters, dim);
	const { notices: own, ...data } = await run(rc, input, plan);
	return { data, notices: ["summary", ...plan.unavailable.map((u) => `filter_unavailable:${u}`), ...(own ?? [])] };
}
