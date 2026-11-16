/** Report dispatcher: validation, compare execution, deltas, the routing rule (detailed or summaries) and a 30 s isolate cache. */
import { z } from "zod";
import { addDays, previousPeriod, samePeriodLastYear } from "../../core/time.js";
import type { Db } from "../../db/adapter.js";
import { MAX_PARAMS } from "../../db/sql.js";
import type { CapacityProfile } from "../../settings.js";
import { type CompileCtx, compileSearch, compileTraffic, QueryError, validateFilters } from "../compile.js";
import { DIM_NAMES, type Filter, FUNNEL_MODES, FunnelStepsSchema, PROP_KEY_RE, type Query } from "../filters.js";
import { countries, browsers, devices, languages, os, regions } from "./audience.js";
import type { Metrics, Point, ReportCtx, ReportData, Row, RunInput } from "./base.js";
import { downloads, eventProps, events, forms, funnels, goals, outbound, scroll } from "./behaviour.js";
import { overview } from "./overview.js";
import { planFilters, RAW_ONLY, rawOnly, ROLLUP_REPORTS, runRollupReport } from "./rollup.js";
import { behindNotice, clearOpenDays, clearScanCache, storedSessions } from "./summary.js";
import { entryPages, exitPages, notFound, pages } from "./pages.js";
import { satisfaction, satisfactionSeries } from "./satisfaction.js";
import { searchCountries, searchDevices, searchOverview, searchPageQueries, searchPages, searchQueries } from "./search.js";
import {
	searchCannibalization,
	searchCannibalizationPage,
	searchCannibalizationPages,
	searchCannibalizationQuery,
	searchDecay,
	searchMovers,
	searchPositionBands,
	searchPositionBandsSeries,
	searchPositionMoves,
	searchStrikingDistance,
	trafficDecay,
	trafficMovers,
} from "./seo.js";
import { IMPACT_REPORTS, IMPACT_WINDOWS, SEO_TEXT } from "./seo-copy.js";
import { annotationImpacts, impact, SCOPE_KINDS_FILTER } from "./impact.js";
import { aiReferrals, campaigns, channels, sources } from "./sources.js";
import { timeseries } from "./timeseries.js";
import { currencyOf, REVENUE_REPORTS, type RevenueDim, revenue, revenueBreakdown, revenueOrders, revenuePlan, revenueSeries, WITH_REVENUE, withRevenue } from "./revenue.js";
import { dimensionValues } from "./values.js";
import { journeyNext, journeyPaths, journeyPrev, journeysFromSummary, journeysUnavailable } from "./journeys.js";
import { collections } from "./collections.js";
import { siteSearch } from "./sitesearch.js";
import { sitesSummary } from "./sites-summary.js";
import { LINK_BY, links, linksFromSummary, linksPlan } from "./links.js";

type Runner = (rc: ReportCtx, input: RunInput) => Promise<ReportData>;
type Kind = "traffic" | "search";

export const REPORTS = {
	overview: ["traffic", overview],
	timeseries: ["traffic", timeseries],
	pages: ["traffic", pages],
	entry_pages: ["traffic", entryPages],
	exit_pages: ["traffic", exitPages],
	not_found: ["traffic", notFound],
	satisfaction: ["traffic", satisfaction],
	satisfaction_series: ["traffic", satisfactionSeries],
	channels: ["traffic", channels],
	sources: ["traffic", sources],
	campaigns: ["traffic", campaigns],
	ai_referrals: ["traffic", aiReferrals],
	countries: ["traffic", countries],
	regions: ["traffic", regions],
	devices: ["traffic", devices],
	browsers: ["traffic", browsers],
	os: ["traffic", os],
	languages: ["traffic", languages],
	events: ["traffic", events],
	event_props: ["traffic", eventProps],
	goals: ["traffic", goals],
	funnels: ["traffic", funnels],
	outbound: ["traffic", outbound],
	downloads: ["traffic", downloads],
	forms: ["traffic", forms],
	scroll: ["traffic", scroll],
	dimension_values: ["traffic", dimensionValues],
	search_overview: ["search", searchOverview],
	search_queries: ["search", searchQueries],
	search_pages: ["search", searchPages],
	search_countries: ["search", searchCountries],
	search_devices: ["search", searchDevices],
	search_page_queries: ["search", searchPageQueries],
	search_cannibalization: ["search", searchCannibalization],
	search_cannibalization_pages: ["search", searchCannibalizationPages],
	search_cannibalization_page: ["search", searchCannibalizationPage],
	search_cannibalization_query: ["search", searchCannibalizationQuery],
	search_position_bands: ["search", searchPositionBands],
	search_position_bands_series: ["search", searchPositionBandsSeries],
	search_position_moves: ["search", searchPositionMoves],
	search_striking_distance: ["search", searchStrikingDistance],
	search_movers: ["search", searchMovers],
	search_decay: ["search", searchDecay],
	traffic_movers: ["traffic", trafficMovers],
	traffic_decay: ["traffic", trafficDecay],
	impact: ["traffic", impact],
	annotation_impacts: ["traffic", annotationImpacts],
	revenue: ["traffic", revenue],
	revenue_series: ["traffic", revenueSeries],
	revenue_breakdown: ["traffic", revenueBreakdown],
	revenue_orders: ["traffic", revenueOrders],
	journey_next: ["traffic", journeyNext],
	journey_prev: ["traffic", journeyPrev],
	journey_paths: ["traffic", journeyPaths],
	collections: ["traffic", collections],
	site_search: ["traffic", siteSearch],
	sites_summary: ["traffic", sitesSummary],
	links: ["traffic", links],
} as const satisfies Record<string, readonly [Kind, Runner]>;

export type ReportName = keyof typeof REPORTS;
export const REPORT_NAMES = Object.keys(REPORTS) as [ReportName, ...ReportName[]];
/** Search reports, gated separately for agents (`read:search`). */
export const SEARCH_REPORTS = REPORT_NAMES.filter((n) => REPORTS[n][0] === "search");
/** Reports that refuse the compare option. */
export const NO_COMPARE: ReadonlySet<string> = new Set(["search_cannibalization", "search_cannibalization_pages", "search_cannibalization_page", "search_cannibalization_query"]);
/** Reports that compare periods on their own: the compare option is ignored. */
/** `revenue_orders` is a list of single orders: a comparison has nothing to pair, so it is ignored. */
export const SELF_COMPARED: ReadonlySet<string> = new Set(["search_position_moves", "search_movers", "search_decay", "traffic_movers", "traffic_decay", "impact", "revenue_orders", "annotation_impacts"]);
/** Reports over the summaries or the dispatcher itself: no filter compilation and no routing. */
const UNCOMPILED: ReadonlySet<string> = new Set(["traffic_movers", "traffic_decay", "impact", "annotation_impacts", "collections", "sites_summary"]);
/** Reports with a summary reader of their own (the link and journey families), routed like the other summaries. */
const OWN_SUMMARY: Readonly<Record<string, (rc: ReportCtx, input: RunInput) => Promise<ReportData & { notices: string[] }>>> = { links: linksFromSummary, ...journeysFromSummary };

export const ParamsSchema = z
	.object({
		withSearch: z.boolean().optional(),
		/** Revenue columns on breakdown reports and per funnel step. */
		withRevenue: z.boolean().optional(),
		/** ISO 4217 code of a revenue report; checked against the list with the typed `invalid_currency`. */
		currency: z.string().min(1).max(8).optional(),
		field: z.enum(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]).optional(),
		event: z.string().min(1).max(64).optional(),
		funnel: z.string().min(1).max(128).optional(),
		steps: FunnelStepsSchema.optional(),
		mode: z.enum(FUNNEL_MODES).optional(),
		source: z.enum(["all", "google", "bing"]).optional(),
		page: z.string().min(1).max(2048).optional(),
		/** `campaign` is the `revenue_breakdown` name of `utm_campaign`. */
		dim: z.enum([...DIM_NAMES, "campaign"] as [string, ...string[]]).optional(),
		prop: z.string().regex(PROP_KEY_RE).optional(),
		prefix: z.string().max(128).optional(),
		/** `dimension_values`: `traffic | search`; `impact`: `annotation | none`. */
		scope: z.enum(["traffic", "search", "annotation", "none"]).optional(),
		// SEO views.
		direction: z.enum(["up", "down"]).optional(),
		metric: z.string().regex(/^[a-z0-9_]{1,32}$/).optional(),
		minImpressions: z.number().int().min(1).max(100_000).optional(),
		minShare: z.number().int().min(1).max(50).optional(),
		includeBrand: z.boolean().optional(),
		/** `search_position_moves`: rows are the matrix (default) or one list. */
		list: z.enum(["matrix", "up", "down", "new", "lost"]).optional(),
		query: z.string().min(1).max(512).optional(),
		// Impact.
		annotation: z.string().min(1).max(128).optional(),
		kind: z.enum(["manual", "publish", "update", "release"]).optional(),
		at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		window: z
			.number()
			.int()
			.refine((w) => (IMPACT_WINDOWS as readonly number[]).includes(w), { message: `window must be one of ${IMPACT_WINDOWS.join(", ")}` })
			.optional(),
		report: z.enum(IMPACT_REPORTS).optional(),
		key: z.string().min(1).max(512).optional(),
		goal: z.string().min(1).max(128).optional(),
		path: z.string().min(1).max(512).regex(/^\//).optional(),
		/** `impact`: add the standard traffic KPIs of both windows as `context`. */
		context: z.boolean().optional(),
		/** `annotation_impacts`: only annotations of this scope kind (`site` is site-wide). */
		scopeKind: z.enum(SCOPE_KINDS_FILTER).optional(),
		/** `journey_paths`: only sessions landing on this page. */
		entry: z.string().min(1).max(512).regex(/^\//).optional(),
		/** `links`: the breakdown and one link (Links convention); `satisfaction`: the grouping (`SATISFACTION_BY`, checked by the report). */
		by: z.enum([...LINK_BY, "browser"]).optional(),
		/** `satisfaction`: best or worst landing pages by score. */
		rank: z.enum(["best", "worst"]).optional(),
		slug: z.string().min(1).max(128).optional(),
	})
	.strict();
export type Params = z.infer<typeof ParamsSchema>;

export const MAX_LIMIT = 1000;
export const SEGMENT_COMPARE_NOT_SUPPORTED = "Segment comparison is not available for search reports, the SEO views and the impact view.";
/** Row cap of `data/export`. */
export const EXPORT_LIMIT = 10_000;

export interface ReportRequest {
	report: ReportName;
	query: Query;
	params?: Params;
	limit?: number;
	offset?: number;
	/** `compare: "segment"`: the filters of side B (the compare segment's filters plus the ad hoc ones), resolved by the route. */
	compareFilters?: readonly Filter[];
	/** Echoed as `compareSegment`. */
	compareSegment?: { id: string; name: string };
	/** Internal (impact measurements): no routing estimate, realtime count or first-run lookup, to stay inside the D1 query budget. */
	lean?: boolean;
}

/** A segment echoed in a result: `{ id, name }`. */
export interface SegmentRef {
	id: string;
	name: string;
}

export interface ReportResult {
	report: ReportName;
	range: { from: string; to: string };
	compare: Query["compare"];
	compareRange: { from: string; to: string } | null;
	/** Side B of `compare: "segment"`; side A is `segment` (absent: all visitors). */
	compareSegment?: SegmentRef;
	segment?: SegmentRef;
	data: ReportData;
	/** Ignored filter dimensions (for example traffic dims in a search report). */
	notices: string[];
	/** Set by the route when annotations were loaded. */
	meta?: { annotations: { matched: number; loaded: number; truncated: boolean } };
}

const DELTA_SKIP = new Set(["key"]);

/** Relative change, null when the previous value is 0 or missing. */
export function delta(cur: unknown, prev: unknown): number | null {
	if (typeof cur !== "number" || typeof prev !== "number" || prev === 0) return null;
	return Math.round(((cur - prev) / prev) * 10_000) / 10_000;
}

function deltas(cur: Metrics | Record<string, unknown>, prev: Record<string, unknown> | undefined): Record<string, number | null> {
	const out: Record<string, number | null> = {};
	for (const [k, v] of Object.entries(cur)) if (typeof v === "number" && !DELTA_SKIP.has(k)) out[k] = prev ? delta(v, prev[k]) : null;
	return out;
}

const rowId = (r: Row) => (r.ref === undefined ? r.key : `${r.key}\u0000${String(r.ref)}`);

/** Attach compare values: totals get `compareTotals` and `delta`, rows get `previous` and `delta`, series get `compareSeries`. */
export function mergeCompare(cur: ReportData, prev: ReportData): ReportData {
	const out: ReportData = { ...cur };
	if (cur.totals) {
		out.compareTotals = prev.totals ?? null;
		out.delta = deltas(cur.totals, prev.totals);
	}
	if (cur.rows) {
		const byKey = new Map((prev.rows ?? []).map((r) => [rowId(r), r]));
		out.rows = cur.rows.map((r) => {
			const p = byKey.get(rowId(r));
			const { key: _k, ...prevMetrics } = p ?? { key: "" };
			return { ...r, previous: p ? prevMetrics : null, delta: deltas(r, p) };
		});
	}
	if (cur.series) out.compareSeries = (prev.series ?? []) as Point[];
	return out;
}

// ── 30 s isolate cache ───────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; value: Promise<ReportResult> }>();

export function clearReportCache(): void {
	cache.clear();
	clearOpenDays();
	clearScanCache();
}

/** Run one report with its compare range. Results are cached per request body for 30 s per isolate. */
export function runReport(rc: ReportCtx, req: ReportRequest, nowMs: number = Date.now()): Promise<ReportResult> {
	const key = JSON.stringify([rc.site, rc.sites ?? null, rc.rawFrom ?? null, rc.summaryThrough ?? null, rc.defaultCurrency ?? null, req.report, req.query, req.params ?? {}, req.limit ?? null, req.offset ?? null, req.compareFilters ?? null, req.compareSegment ?? null, rc.settings, rc.goals, rc.funnels, rc.annotations, rc.collections ?? null, rc.siteSearchParams ?? null, rc.publicSurface ?? false, req.lean ?? false]);
	const hit = cache.get(key);
	if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.value;
	const value = execute(rc, req);
	cache.delete(key);
	if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
	cache.set(key, { at: nowMs, value });
	// Failures are not cached.
	value.catch(() => cache.get(key)?.value === value && cache.delete(key));
	return value;
}

/** Visits one detailed report may scan per capacity profile (more: the summaries answer when they honour every filter). */
export const SCAN_BUDGET: Readonly<Record<CapacityProfile, number>> = { small: 50_000, standard: 500_000, dedicated: 500_000 };
/** A detailed report whose filters the summaries cannot honour may scan this many times the budget, then `narrow_range`. */
export const NARROW_FACTOR = 4;

/** The summary plan of a report (its unavailable filters), or null when it has no summary form. */
function summaryPlan(report: ReportName, filters: readonly Filter[], params: RunInput["params"]): { unavailable: string[]; refused?: string[] } | null {
	if (report === "links") return linksPlan({ filters, params });
	if (report in journeysFromSummary) return { unavailable: journeysUnavailable(filters) };
	if ((REVENUE_REPORTS as readonly string[]).includes(report)) return revenuePlan({ filters }, report === "revenue_breakdown" && params.dim ? (params.dim as RevenueDim) : undefined);
	const entry = ROLLUP_REPORTS[report];
	if (!entry || RAW_ONLY[report] || (report === "campaigns" && params.field && params.field !== "utm_campaign")) return null;
	const plan = planFilters(filters, entry[0]);
	// Revenue columns the summaries cannot filter send the report to the detailed rows inside the window (`refused`);
	// before it the traffic rows still apply them and the columns answer `revenue_not_available`.
	const dim = params.withRevenue ? WITH_REVENUE[report] : undefined;
	return dim ? { unavailable: plan.unavailable, refused: [...plan.unavailable, ...revenuePlan({ filters }, dim).unavailable] } : plan;
}

/**
 * The routing rule (which engine answers a range). Before the detailed window: the summaries, or `raw_only` for a
 * report without them. Inside it: the detailed rows, unless the stored days hold more visits than the profile's scan
 * budget and the summaries honour every filter; a detailed report over `NARROW_FACTOR` times the budget is refused
 * with `narrow_range` and the longest range that fits. Returns the notices of a summary answer, or null.
 */
async function route(rc: ReportCtx, report: ReportName, from: string, to: string, filters: readonly Filter[], params: RunInput["params"], lean = false): Promise<string[] | null> {
	if (!rc.rawFrom) return null;
	const plan = summaryPlan(report, filters, params);
	if (from < rc.rawFrom) {
		if (!plan) throw rawOnly(report, rc.rawFrom);
		return ["summary", ...plan.unavailable.map((u) => `filter_unavailable:${u}`), `detail_from:${rc.rawFrom}`, ...(await behindNotice(rc, from, to))];
	}
	// `revenue_orders` reads at most 51 order rows through the day index, whatever the visits of the range.
	if (report === "revenue_orders") return null;
	// shortcut: a lean run (impact window, at most 28 days) skips the visit estimate and reads the detailed rows; route it if a site outgrows the scan budget in 28 days.
	if (lean) return null;
	const budget = SCAN_BUDGET[rc.settings.capacityProfile ?? "standard"] ?? SCAN_BUDGET.standard;
	const days = await storedSessions(rc, from, to);
	const total = days.reduce((n, d) => n + d.sessions, 0);
	if (total <= budget) return null;
	if (plan && !(plan.refused ?? plan.unavailable).length) return ["summary", ...(await behindNotice(rc, from, to))];
	if (total <= NARROW_FACTOR * budget) return null;
	let n = 0;
	const fits = [...days].sort((a, b) => (a.day < b.day ? 1 : -1)).find((d) => (n += d.sessions) > NARROW_FACTOR * budget);
	// The newest day alone over the bound: name that day.
	const start = fits ? (fits.day < to ? addDays(fits.day, 1) : to) : from;
	throw new QueryError(
		"narrow_range",
		`This range holds about ${total.toLocaleString("en-US")} visits, more than one detailed report may read with these filters. Choose ${start} to ${to}, or filters the daily summaries can answer.`,
	);
}

async function runOnce(rc: ReportCtx, req: ReportRequest, kind: Kind, run: Runner, from: string, to: string, filters: readonly Filter[], isCompare: boolean) {
	const cc: CompileCtx = { db: rc.db, site: rc.site, from, to, goals: rc.goals, ...(rc.defaultCurrency ? { currency: rc.defaultCurrency } : {}) };
	const input: RunInput = {
		from,
		to,
		filters,
		granularity: req.query.granularity,
		params: req.params ?? {},
		limit: Math.max(1, Math.min(req.limit ?? 100, EXPORT_LIMIT)),
		offset: Math.max(0, req.offset ?? 0),
		isCompare,
		...(req.lean ? { lean: true } : {}),
	};
	if (UNCOMPILED.has(req.report)) return { data: await run(rc, input), input, notices: [] as string[] };
	const revenueCols = async (data: ReportData) => (input.params.withRevenue ? withRevenue(rc, input, req.report, data) : data);
	const summary = kind === "traffic" ? await route(rc, req.report, from, to, filters, input.params, req.lean) : null;
	if (summary) {
		input.summary = true;
		const folded = new Set<string>();
		rc = { ...rc, folded };
		const other = () => [...folded].sort().map((d) => `summary_other:${d}`);
		const own = OWN_SUMMARY[req.report];
		if (own) {
			const { notices, ...data } = await own(rc, input);
			return { data: await revenueCols(data), input, notices: [...new Set([...summary, ...notices, ...other()])] };
		}
		// Revenue reports read `ca_revenue_daily` themselves, through the same plan.
		if ((REVENUE_REPORTS as readonly string[]).includes(req.report)) {
			const data = await run(rc, input);
			return { data, input, notices: [...summary, ...other()] };
		}
		const r = await runRollupReport(req.report, rc, input);
		const data = await revenueCols(r.data);
		return { data, input, notices: [...new Set([...summary, ...r.notices, ...other()])] };
	}
	if (kind === "search") input.search = await compileSearch(cc, filters);
	else input.traffic = await compileTraffic(cc, filters);
	return { data: await revenueCols(await run(rc, input)), input, notices: [] as string[] };
}

/** Every report statement stays inside the D1 limit of 100 bound parameters, on every dialect. */
export function guardDb(db: Db): Db {
	const check = (params: readonly unknown[] = []) => {
		if (params.length > MAX_PARAMS) throw new QueryError("too_many_values", "This query needs too many values. Use fewer filter values or a prefix or regex.");
	};
	return {
		dialect: db.dialect,
		run: (sql, params) => (check(params), db.run(sql, params)),
		all: (sql, params) => (check(params), db.all(sql, params)),
		batch: (stmts) => (stmts.forEach((s) => check(s.params)), db.batch(stmts)),
	};
}

async function execute(ctx: ReportCtx, req: ReportRequest): Promise<ReportResult> {
	const rc: ReportCtx = { ...ctx, db: guardDb(ctx.db) };
	// `impact` runs its target report through this dispatcher.
	if (req.report === "impact" || req.report === "annotation_impacts") rc.dispatch ??= (r) => runReport(ctx, r as ReportRequest);
	const [kind, run] = REPORTS[req.report] as readonly [Kind, Runner];
	const { from, to, compare, filters } = req.query;
	// Segment comparison: not on search reports, the SEO views or impact.
	if (compare === "segment" && (kind === "search" || SELF_COMPARED.has(req.report))) throw new QueryError("compare_not_supported", SEGMENT_COMPARE_NOT_SUPPORTED);
	if (compare !== "none" && NO_COMPARE.has(req.report)) throw new QueryError("compare_not_supported", SEO_TEXT.compareNotSupported);
	if (compare === "segment" && !req.compareFilters) throw new QueryError("invalid_params", "compare segment needs the compare segment's filters.");
	// Typed errors before any branch, so the rollup path rejects the same input.
	validateFilters(filters);
	if (req.compareFilters) validateFilters(req.compareFilters);
	if (req.params?.currency !== undefined) currencyOf(rc, { params: req.params });
	const cur = await runOnce(rc, req, kind, run, from, to, filters, false);
	const notices = new Set<string>(kind === "search" ? (cur.input.search?.ignored ?? []).map((d) => `ignored_dim:${d}`) : cur.notices);
	if (kind === "traffic") for (const d of cur.input.traffic?.ignoredTraffic ?? []) notices.add(`ignored_dim:${d}`);
	let data = cur.data;
	let compareRange: ReportResult["compareRange"] = null;
	if (compare !== "none" && req.report !== "dimension_values" && !SELF_COMPARED.has(req.report)) {
		compareRange = compare === "segment" ? { from, to } : compare === "previous" ? previousPeriod({ from, to }) : samePeriodLastYear({ from, to });
		// Side B: the same range with the compare segment in the primary segment slot.
		const prev = await runOnce(rc, req, kind, run, compareRange.from, compareRange.to, compare === "segment" ? (req.compareFilters ?? []) : filters, true);
		// The compare side's own range fix would confuse: only its engine and its filters are reported.
		for (const n of prev.notices) if (!n.startsWith("detail_from:")) notices.add(n === "summary" ? "compare_summary" : n);
		data = mergeCompare(cur.data, prev.data);
	}
	return { report: req.report, range: { from, to }, compare, compareRange, ...(compare === "segment" && req.compareSegment ? { compareSegment: req.compareSegment } : {}), data, notices: [...notices] };
}
