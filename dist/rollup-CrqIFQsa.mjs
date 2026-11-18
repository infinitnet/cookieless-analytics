import { t as __exportAll } from "./rolldown-runtime-95iHPtFO.mjs";
import { $ as planRows, B as bucketSeries, Cn as dayInt, Ct as and, Dt as entryCols, G as FILTER_DIMS, K as SEGMENTS, Q as planFilters, St as TRUE, V as resolveGranularity, X as matchKey, _t as sessionMetrics, a as OTHER, dt as liveVisits, et as readSummary, ft as num, gt as sessionBreakdown, ht as round, lt as hitJoin, ot as annotationsIn, pt as ratio, ut as keysIn, vt as sessionTotals, xt as QueryError, yt as sessionWhere } from "./rollup-DahnNaAs.mjs";

//#region src/query/reports/overview.ts
/** KPI strip: totals plus realtime sessions (current run only). */
async function overview(rc, input) {
	const totals = await sessionTotals(rc, input);
	if (input.isCompare || input.lean) return { totals };
	const filters = input.traffic?.session ?? TRUE;
	const live = liveVisits(rc);
	const [r] = await rc.db.all(`SELECT COUNT(*) AS n FROM ca_sessions s WHERE ${live.sql} AND (${filters.sql})`, [...live.params, ...filters.params]);
	return {
		totals,
		realtime: num(r?.n),
		...await firstRun(rc, totals.sessions)
	};
}
/**
* `stored`: whether the site holds any visit at all, detailed or summarized, asked only when the range has none: the
* admin then tells a first run (no visit yet) from an empty range. One indexed lookup, nothing otherwise.
*/
async function firstRun(rc, sessions) {
	if (num(sessions) > 0) return {};
	return { stored: (await rc.db.all("SELECT 1 AS n FROM ca_sessions WHERE site = ? UNION ALL SELECT 1 AS n FROM ca_rollup WHERE site = ? LIMIT 1", [rc.site, rc.site])).length > 0 };
}

//#endregion
//#region src/query/reports/pages.ts
/** Search metrics for page keys over the range: page grain rows of the selected source. */
async function searchForPages(rc, input, keys) {
	const out = /* @__PURE__ */ new Map();
	if (!keys.length) return out;
	const src = input.params.source && input.params.source !== "all" ? {
		sql: "d.source = ?",
		params: [input.params.source]
	} : TRUE;
	const where = and([
		{
			sql: "d.site = ? AND d.day BETWEEN ? AND ? AND d.query = '' AND d.country = '' AND d.device = ''",
			params: [
				rc.site,
				input.from,
				input.to
			]
		},
		keysIn(rc, "d.page_key", keys),
		src
	]);
	const rows = await rc.db.all(`SELECT d.page_key AS key, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE ${where.sql} GROUP BY d.page_key`, where.params);
	for (const r of rows) {
		const clicks = num(r.clicks);
		const impressions = num(r.impressions);
		out.set(String(r.key), {
			clicks,
			impressions,
			ctr: round(ratio(clicks, impressions)),
			position: round(ratio(num(r.pos_sum), impressions), 2)
		});
	}
	return out;
}
/** Pageviews per path over the range for the given keys (exit rate denominator). */
async function pageviewsFor(rc, input, keys) {
	if (!keys.length) return /* @__PURE__ */ new Map();
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "pv", keysIn(rc, h.path, keys));
	const rows = await rc.db.all(`SELECT ${h.path} AS key, COUNT(*) AS n ${j.sql} GROUP BY ${h.path}`, j.params);
	return new Map(rows.map((r) => [String(r.key), num(r.n)]));
}
/** Lower median from a value histogram. */
function median(hist) {
	const total = hist.reduce((a, [, n]) => a + n, 0);
	if (!total) return null;
	let seen = 0;
	for (const [v, n] of hist.sort((a, b) => a[0] - b[0])) {
		seen += n;
		if (seen * 2 >= total) return v;
	}
	return null;
}
/** Top pages: pageviews, visitors, avg active time, avg visible time, exit rate, scroll median; optional search columns. */
async function pages(rc, input) {
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "pv");
	const rows = await rc.db.all(`SELECT t.key AS key, SUM(t.pageviews) AS pageviews, SUM(t.visitors) AS visitors, SUM(t.dur_sum) AS dur_sum, SUM(t.dur_n) AS dur_n, SUM(t.vis_sum) AS vis_sum, SUM(t.vis_n) AS vis_n FROM (
SELECT ${h.path} AS key, s.day AS day, COUNT(*) AS pageviews, COUNT(DISTINCT s.vkey) AS visitors, SUM(${h.dur}) AS dur_sum, COUNT(${h.dur}) AS dur_n, SUM(${h.vis}) AS vis_sum, COUNT(${h.vis}) AS vis_n ${j.sql} GROUP BY ${h.path}, s.day
) t GROUP BY t.key ORDER BY pageviews DESC, key LIMIT ? OFFSET ?`, [
		...j.params,
		input.limit + 1,
		input.offset
	]);
	const page = rows.slice(0, input.limit);
	const keys = page.map((r) => String(r.key));
	const exits = /* @__PURE__ */ new Map();
	const scroll = /* @__PURE__ */ new Map();
	if (keys.length) {
		const w = and([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), keysIn(rc, "s.exit_path", keys)]);
		for (const r of await rc.db.all(`SELECT s.exit_path AS key, COUNT(*) AS n FROM ca_sessions s WHERE ${w.sql} GROUP BY s.exit_path`, w.params)) exits.set(String(r.key), num(r.n));
		const sj = hitJoin(rc, input, "pv", and([keysIn(rc, h.path, keys), {
			sql: `${h.scroll} IS NOT NULL`,
			params: []
		}]));
		for (const r of await rc.db.all(`SELECT ${h.path} AS key, ${h.scroll} AS v, COUNT(*) AS n ${sj.sql} GROUP BY ${h.path}, ${h.scroll}`, sj.params)) {
			const k = String(r.key);
			scroll.set(k, [...scroll.get(k) ?? [], [num(r.v), num(r.n)]]);
		}
	}
	const search = input.params.withSearch ? await searchForPages(rc, input, keys) : null;
	return {
		rows: page.map((r) => {
			const key = String(r.key);
			const pageviews = num(r.pageviews);
			const row = {
				key,
				pageviews,
				visitors: num(r.visitors),
				avg_time: round(ratio(num(r.dur_sum) / 1e3, num(r.dur_n)), 1),
				avg_visible: round(ratio(num(r.vis_sum) / 1e3, num(r.vis_n)), 1),
				exit_rate: capped(round(ratio(exits.get(key) ?? 0, pageviews))),
				scroll_median: median(scroll.get(key) ?? [])
			};
			if (search) {
				const s = search.get(key);
				Object.assign(row, {
					impressions: s?.impressions ?? null,
					clicks: s?.clicks ?? null,
					ctr: s?.ctr ?? null,
					position: s?.position ?? null
				});
			}
			return row;
		}),
		truncated: rows.length > input.limit
	};
}
/** Entry pages: entries (sessions), visitors, bounce rate, avg duration. */
async function entryPages(rc, input) {
	const d = await sessionBreakdown(rc, input, "s.entry_path");
	d.rows = d.rows?.map(({ sessions, ...r }) => ({
		...r,
		entries: sessions
	}));
	return d;
}
/** An exit rate at most 1 (null stays null). */
const capped = (v) => v === null ? null : Math.min(1, v);
/** Exit pages: exits and exit rate (exits / pageviews of the path). */
async function exitPages(rc, input) {
	const d = await sessionBreakdown(rc, input, "s.exit_path");
	const pv = await pageviewsFor(rc, input, (d.rows ?? []).map((r) => r.key));
	d.rows = d.rows?.map((r) => ({
		key: r.key,
		exits: r.sessions,
		visitors: r.visitors,
		exit_rate: capped(round(ratio(num(r.sessions), pv.get(r.key) ?? 0)))
	}));
	return d;
}
/** Human 404 responses by path and external referrer: the server's counters in `ca_srv`, by their own day. */
async function notFound(rc, input) {
	const where = and([{
		sql: "h.site = ? AND h.day BETWEEN ? AND ? AND h.status = 404",
		params: [
			rc.site,
			dayInt(input.from),
			dayInt(input.to)
		]
	}, input.traffic?.srv ?? TRUE]);
	const rows = await rc.db.all(`SELECT h.path AS key, NULLIF(h.ref, '') AS ref, SUM(h.n) AS hits, MAX(h.last_ts) AS last_seen FROM ca_srv h WHERE ${where.sql} GROUP BY h.path, h.ref ORDER BY hits DESC, key, ref LIMIT ? OFFSET ?`, [
		...where.params,
		input.limit + 1,
		input.offset
	]);
	const notices = (input.filters ?? []).some((f) => f.dim !== "page") ? ["filters_not_applied"] : [];
	return {
		rows: rows.slice(0, input.limit).map((r) => ({
			key: String(r.key),
			ref: r.ref == null ? null : String(r.ref),
			hits: num(r.hits),
			last_seen: num(r.last_seen)
		})),
		truncated: rows.length > input.limit,
		notices
	};
}

//#endregion
//#region src/query/reports/satisfaction-copy.ts
/** Fixed Satisfaction texts, shared by the reports, the agent catalog and the admin without pulling in SQL code. */
/** Typed `raw_only` text beyond the raw window. */
const SATISFACTION_RAW_ONLY = "Search Satisfaction is computed from session rows, which are kept for the raw retention window only. Choose a more recent range or raise the raw retention.";
/** Caveat of the estimates (pogo-sticking, returned from search, search re-entry, back/forward loads). */
const SATISFACTION_CAVEAT = "An estimate from browser navigation signals.";
/** One sentence that defines pogo-sticking, shown in the info text of every pogo-sticking figure. */
const POGO_DEFINITION = "Pogo-sticking: a visitor from a search engine leaves the landing page quickly with the back button and returns to the results.";
/** One sentence that defines the stronger signal "Returned from search" (docs/sessions.md). */
const RETURNED_DEFINITION = "Returned from search: a search visitor left the landing page with back or forward and came again from a search engine in one session.";
/** Groupings of the `satisfaction` report (`params.by`); `entry` is the landing page. */
const SATISFACTION_BY = [
	"entry",
	"channel",
	"source",
	"device",
	"country",
	"browser"
];
/** Fewest measured sessions a landing page needs to be ranked as a best or worst page (`params.rank`). */
const SATISFACTION_MIN_MEASURED = 30;
/** How the best and worst pages are ranked (docs/sessions.md "Best and worst pages"). */
const SCORE_DEFINITION = `Long click rate minus bad experience rate minus pogo-sticking rate, in points, for landing pages with at least ${SATISFACTION_MIN_MEASURED} measured sessions.`;

//#endregion
//#region src/query/reports/revenue-copy.ts
/** Text of the `revenue_orders` answer outside the detailed window; shared with the admin, so kept free of server imports. */
const ORDERS_RAW_ONLY = "Single orders are kept for the detailed window only; the totals and breakdowns cover older days from the daily summaries.";

//#endregion
//#region src/query/reports/rollup.ts
/**
* Report executors over the summaries: ranges before the detailed window, and long ranges inside
* it that the dispatcher routes here. Rows come from `planRows` (stored days plus open days in memory); the filter
* plan decides which filters apply: the report's own dimension, and one segment (channel, country or device) with a
* pair dimension through a pair row. Every other filter is reported as `filter_unavailable:<dim>:<reason>`.
*/
var rollup_exports = /* @__PURE__ */ __exportAll({
	RAW_ONLY: () => RAW_ONLY,
	ROLLUP_REPORTS: () => ROLLUP_REPORTS,
	exitRates: () => exitRates,
	matchKey: () => matchKey,
	planFilters: () => planFilters,
	rawOnly: () => rawOnly,
	runRollupReport: () => runRollupReport
});
const sessionRow = (r) => sessionMetrics({
	...r,
	duration_ms: r.engaged_ms
});
function paginate(rows, input) {
	return {
		rows: rows.slice(input.offset, input.offset + input.limit),
		truncated: rows.length > input.offset + input.limit
	};
}
const byKey = (rows) => new Map(rows.map((r) => [r.key, r]));
/** Totals of the filtered sessions. */
async function totals(rc, input, plan) {
	return (await planRows(rc, input, plan, null))[0] ?? {};
}
/** Denominator of event and goal rates: every session under the segment filters the report applied. */
const segmentPlan = (plan) => planFilters(plan.applied.filter((f) => SEGMENTS.includes(FILTER_DIMS[f.dim] ?? "")), null);
/**
* Exit rate of each key, exits over page views summed over the same days. A day with only one of the two rows counts
* when the other family kept every key that day (no `(other)` row, so that side is 0); when it folded, the key's
* share of that day is unknown and its rate is null (`partial`). A day with neither row adds to neither side. At most
* 1: a visit opened by an event can exit on a page it never viewed. `(other)` itself has no rate.
*/
async function exitRates(rc, input, keys) {
	const read = (dim) => readSummary(rc, input.from, input.to, {
		table: "ca_rollup",
		dim,
		seg: "",
		byDay: true,
		keys: [...keys, OTHER]
	});
	const pages = await read("page");
	const exits = await read("exit");
	const at = (rows, m) => new Map(rows.map((r) => [`${r.key}\u0000${r.day}`, num(r[m])]));
	const folded = (rows) => new Set(rows.filter((r) => r.key === OTHER).map((r) => r.day));
	const [pv, ex, pvFolded, exFolded] = [
		at(pages, "pageviews"),
		at(exits, "sessions"),
		folded(pages),
		folded(exits)
	];
	const days = [...new Set([...pages, ...exits].map((r) => r.day))];
	const rates = /* @__PURE__ */ new Map();
	let partial = false;
	for (const key of keys.filter((k) => k !== OTHER)) {
		let views = 0;
		let out = 0;
		let known = true;
		for (const day of days) {
			const p = pv.get(`${key}\u0000${day}`);
			const e = ex.get(`${key}\u0000${day}`);
			if (p === void 0 && e !== void 0 && pvFolded.has(day) || e === void 0 && p !== void 0 && exFolded.has(day)) known = false;
			views += p ?? 0;
			out += e ?? 0;
		}
		const rate = known ? round(ratio(out, views)) : null;
		if (!known) partial = true;
		rates.set(key, rate === null ? null : Math.min(1, rate));
	}
	return {
		rates,
		partial
	};
}
function breakdown(dim, rename) {
	return [dim, async (rc, input, plan) => {
		const rows = (await planRows(rc, input, plan, dim)).filter((r) => num(r.sessions) > 0).map((r) => ({
			key: r.key,
			...sessionRow(r)
		})).sort((a, b) => num(b.sessions) - num(a.sessions) || (a.key < b.key ? -1 : 1));
		return paginate(rename ? rows.map(rename) : rows, input);
	}];
}
/** Summary executors by report name; the tuple's dim is the report's own breakdown dim (null for totals). */
const ROLLUP_REPORTS = {
	overview: [null, async (rc, input, plan) => {
		const t = sessionRow(await totals(rc, input, plan));
		if (input.isCompare || input.lean) return { totals: t };
		if (input.filters.length) return {
			totals: t,
			realtime: null,
			...await firstRun(rc, t.sessions)
		};
		const live = liveVisits(rc);
		const [r] = await rc.db.all(`SELECT COUNT(*) AS n FROM ca_sessions s WHERE ${live.sql}`, live.params);
		return {
			totals: t,
			realtime: num(r?.n),
			...await firstRun(rc, t.sessions)
		};
	}],
	timeseries: [null, async (rc, input, plan) => {
		const asked = resolveGranularity(input.granularity, input.from, input.to);
		const gran = asked === "hour" ? "day" : asked;
		const rows = await planRows(rc, input, plan, null, true);
		const series = bucketSeries(input.from, input.to, gran, rows.map((r) => ({
			...r,
			duration_ms: r.engaged_ms
		})));
		const notices = asked === "hour" ? ["granularity_day"] : [];
		return input.isCompare ? {
			series,
			granularity: gran
		} : {
			series,
			granularity: gran,
			annotations: annotationsIn(rc, input.from, input.to),
			notices
		};
	}],
	pages: ["page", async (rc, input, plan) => {
		const all = (await planRows(rc, input, plan, "page")).filter((r) => num(r.pageviews) > 0).sort((a, b) => num(b.pageviews) - num(a.pageviews) || (a.key < b.key ? -1 : 1));
		const page = all.slice(input.offset, input.offset + input.limit);
		const keys = page.map((r) => r.key);
		const exits = plan.src.seg === "" ? await exitRates(rc, input, keys) : null;
		const search = input.params.withSearch ? await searchForPages(rc, input, keys) : null;
		return {
			rows: page.map((r) => {
				const pageviews = num(r.pageviews);
				const row = {
					key: r.key,
					pageviews,
					visitors: num(r.visitors),
					avg_time: round(ratio(num(r.engaged_ms) / 1e3, num(r.hits)), 1),
					avg_visible: null,
					exit_rate: exits?.rates.get(r.key) ?? null,
					scroll_median: null
				};
				if (search) {
					const s = search.get(r.key);
					Object.assign(row, {
						impressions: s?.impressions ?? null,
						clicks: s?.clicks ?? null,
						ctr: s?.ctr ?? null,
						position: s?.position ?? null
					});
				}
				return row;
			}),
			truncated: all.length > input.offset + input.limit,
			notices: exits?.partial ? ["exit_rate_partial"] : []
		};
	}],
	entry_pages: breakdown("entry", ({ sessions, ...r }) => ({
		...r,
		entries: sessions
	})),
	exit_pages: ["exit", async (rc, input, plan) => {
		const d = await breakdown("exit")[1](rc, input, plan);
		const { rates, partial } = await exitRates(rc, input, d.rows?.map((r) => String(r.key)) ?? []);
		d.rows = d.rows?.map((r) => ({
			key: r.key,
			exits: r.sessions,
			visitors: r.visitors,
			exit_rate: rates.get(String(r.key)) ?? null
		}));
		return {
			...d,
			notices: partial ? ["exit_rate_partial"] : []
		};
	}],
	channels: breakdown("channel"),
	sources: breakdown("source"),
	campaigns: ["utm_campaign", async (rc, input, plan) => {
		if (input.params.field && input.params.field !== "utm_campaign") throw new QueryError("raw_only", "Only utm_campaign is kept beyond the raw window.");
		return breakdown("utm_campaign")[1](rc, input, plan);
	}],
	countries: breakdown("country"),
	devices: breakdown("device"),
	browsers: breakdown("browser"),
	os: breakdown("os"),
	languages: breakdown("lang"),
	events: ["event", async (rc, input, plan) => {
		const total = num((await totals(rc, input, segmentPlan(plan))).sessions);
		return {
			...paginate((await planRows(rc, input, plan, "event")).filter((r) => !r.key.startsWith("_") && num(r.events) > 0).map((r) => ({
				key: r.key,
				events: num(r.events),
				sessions: num(r.sessions),
				rate: round(ratio(num(r.sessions), total))
			})).sort((a, b) => num(b.events) - num(a.events) || (a.key < b.key ? -1 : 1)), input),
			total_sessions: total
		};
	}],
	goals: ["goal", async (rc, input, plan) => {
		const total = num((await totals(rc, input, segmentPlan(plan))).sessions);
		const by = byKey(await planRows(rc, input, plan, "goal"));
		const own = plan.applied.filter((f) => f.dim === "goal");
		return {
			rows: rc.goals.filter((g) => g.active !== false && own.every((f) => matchKey(f, g.name))).map((g) => {
				const r = by.get(g.name);
				const converting = num(r?.sessions);
				return {
					key: g.name,
					type: g.type,
					completions: num(r?.events),
					converting,
					conversion_rate: round(ratio(converting, total))
				};
			}).sort((a, b) => num(b.converting) - num(a.converting) || (a.key < b.key ? -1 : 1)),
			total_sessions: total
		};
	}]
};
/** Reports with no summary executor and their own `raw_only` text. */
const RAW_ONLY = {
	satisfaction: SATISFACTION_RAW_ONLY,
	satisfaction_series: SATISFACTION_RAW_ONLY,
	revenue_orders: ORDERS_RAW_ONLY
};
/** The `raw_only` error of a report without summaries; names the first detailed day when known. */
function rawOnly(report, rawFrom) {
	const from = rawFrom ? ` Detailed data starts on ${rawFrom}.` : "";
	return new QueryError("raw_only", `${RAW_ONLY[report] ?? `The ${report} report needs detailed data, which is kept for the detailed window only. Choose a more recent range.`}${from}`);
}
/** Run a report from the summaries. Returns the data plus the notices for the response. */
async function runRollupReport(report, rc, input) {
	const entry = ROLLUP_REPORTS[report];
	if (!entry || RAW_ONLY[report]) throw rawOnly(report, rc.rawFrom);
	const [dim, run] = entry;
	const plan = planFilters(input.filters, dim);
	const { notices: own, ...data } = await run(rc, input, plan);
	return {
		data,
		notices: [
			"summary",
			...plan.unavailable.map((u) => `filter_unavailable:${u}`),
			...own ?? []
		]
	};
}

//#endregion
export { runRollupReport as a, SATISFACTION_BY as c, SCORE_DEFINITION as d, entryPages as f, overview as g, pages as h, rollup_exports as i, SATISFACTION_CAVEAT as l, notFound as m, ROLLUP_REPORTS as n, POGO_DEFINITION as o, exitPages as p, rawOnly as r, RETURNED_DEFINITION as s, RAW_ONLY as t, SATISFACTION_MIN_MEASURED as u };