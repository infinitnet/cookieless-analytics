/**
 * Annotation impact: one metric of one report over equal windows before and after an
 * annotation or a date. The target report runs twice through the report dispatcher (`rc.dispatch`), the
 * same path the compare option uses; this file only builds the windows and the filters and reads the
 * metric. The annotation day belongs to neither window because the change happened during it.
 * `annotation_impacts` measures a page of annotations on their target KPI in one call (Annotations page).
 */
import { type Annotation, annotationSearchMatches, annotationView, type Scope, scopeSummary, scopeToFilters } from "../../annotations/scope.js";
import { defaultTarget, isSearchTarget, scopesOverlap, type Target, verdictOf } from "../../annotations/target.js";
import { addDays, dayInZone, daysBetween } from "../../core/time.js";
import { normalizeUrl } from "../../core/url.js";
import { QueryError } from "../compile.js";
import type { Filter, Query } from "../filters.js";
import type { ReportCtx, ReportData, ReportParams, RunInput } from "./base.js";
import { lastFinal } from "./seo.js";
import { COUNT_METRICS, IMPACT_KEY_DIM, IMPACT_METRICS, IMPACT_REPORTS, type ImpactReport, SEO_TEXT } from "./seo-copy.js";

export const DEFAULT_IMPACT_WINDOW = 28;

const SEARCH_TARGET = (r: string) => r.startsWith("search_");
/** Target reports whose session metrics the `timeseries` report serves per day (with the key as a filter). */
const TRAFFIC_SERIES: ReadonlySet<string> = new Set(["overview", "channels", "sources", "campaigns", "countries", "devices", "browsers"]);
const SESSION_SERIES: ReadonlySet<string> = new Set(["sessions", "visitors", "pageviews", "bounce_rate", "engaged_rate", "avg_duration", "views_per_session"]);
const SEARCH_SERIES: ReadonlySet<string> = new Set(["clicks", "impressions", "ctr", "position"]);

/** Denominator a rate metric is read with (`measured` in the response). */
function denominator(metric: string, report: string): string | null {
	if (COUNT_METRICS.has(metric)) return null;
	if (report === "revenue") return metric === "revenue_per_visitor" ? "visitors" : metric === "revenue_per_session" ? "sessions" : "orders";
	if (metric === "ctr" || metric === "position" || metric === "impressions_share") return "impressions";
	const band = /^(?:share|ctr)_(.+)$/.exec(metric);
	if (band) return `impressions_${band[1]}`;
	if (report === "satisfaction") return metric === "search_reentry_rate" || metric === "returned_from_search_rate" ? "search_sessions" : metric === "pogo_stick_rate" ? "search_measured" : metric === "avg_duration" ? "sessions" : "measured";
	if (metric === "avg_time" || metric === "exit_rate") return "pageviews";
	if (report === "entry_pages") return "entries";
	if (metric === "bounce_rate" || metric === "engaged_rate" || metric === "avg_duration" || metric === "views_per_session") return "sessions";
	return null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** What one measurement reads: the target, its window, and the annotation scope to filter by (absent: none). */
interface Measure {
	report: ImpactReport;
	metric: string;
	window: number;
	key?: string | undefined;
	path?: string | undefined;
	scope?: Scope | undefined;
	params: ReportParams;
	/** Add the daily series with the marker (the panel chart). */
	series: boolean;
	/** Add the standard traffic KPIs of both windows (`context`, the strip under an expanded row). */
	context: boolean;
}

/** The newest complete day: yesterday, and for search targets also the newest final day. */
async function lastCompleteDay(rc: ReportCtx, search: boolean, source: string): Promise<{ yesterday: string; last: string }> {
	const yesterday = addDays(dayInZone(rc.now, rc.settings.siteTimezone), -1);
	const final = search ? await lastFinal(rc, source as "all" | "google" | "bing") : null;
	return { yesterday, last: final && final < yesterday ? final : yesterday };
}

/** Both windows of day `day` on one target; `filters` are the page's own. */
async function measure(rc: ReportCtx, filters0: readonly Filter[], day: string, m: Measure, days: { yesterday: string; last: string }): Promise<ReportData> {
	const { report, metric, window, key } = m;
	const search = SEARCH_TARGET(report);
	const { yesterday, last: lastComplete } = days;
	const afterTo = addDays(day, window) < lastComplete ? addDays(day, window) : lastComplete;
	const n = afterTo > day ? daysBetween(addDays(day, 1), afterTo) : 0;
	// The first day after D must be complete: for Search that is the final day, which trails yesterday by the provider lag.
	if (n <= 0) return { not_yet: addDays(day, 2 + Math.max(0, daysBetween(lastComplete, yesterday) - 1)), complete: false, days_after: 0, notices: ["not_yet"] };
	const after = { from: addDays(day, 1), to: afterTo };
	const before = { from: addDays(day, -n), to: addDays(day, -1) };

	// Filters: the page's own, plus the annotation's scope, plus an explicit page.
	const target = search ? "search" : "traffic";
	const pageKey = (path: string) => (search ? normalizeUrl(path, []).path : path);
	const notices: string[] = [];
	const filters: Filter[] = [...filters0];
	if (m.scope) {
		const s = scopeToFilters(m.scope, target, pageKey);
		filters.push(...s.filters);
		notices.push(...s.notices);
	}
	if (m.path) filters.push({ dim: "page", op: "is", values: [pageKey(m.path)] });
	const keyDim = IMPACT_KEY_DIM[report];
	const runFilters = key && keyDim ? [...filters, { dim: keyDim, op: "is", values: [key] } as Filter] : filters;
	const query = (from: string, to: string, f: readonly Filter[], granularity: Query["granularity"] = "auto"): Query => ({
		from,
		to,
		filters: [...f],
		compare: "none",
		granularity,
	});
	const run = (r: { from: string; to: string }) => rc.dispatch?.({ report, query: query(r.from, r.to, runFilters), ...(Object.keys(m.params).length ? { params: m.params } : {}), limit: 1000, lean: true });
	const [b, a] = [await run(before), await run(after)];
	const pick = (d: ReportData | undefined): Record<string, unknown> | undefined => {
		if (!d) return undefined;
		if (!key) return d.totals as Record<string, unknown> | undefined;
		return d.rows?.find((r) => r.key === key);
	};
	const pb = pick(b?.data);
	const pa = pick(a?.data);
	for (const x of [...(b?.notices ?? []), ...(a?.notices ?? [])]) if (!notices.includes(x)) notices.push(x);
	const vb = num(pb?.[metric]);
	const va = num(pa?.[metric]);
	const delta = vb === null || va === null ? null : Math.round((va - vb) * 10_000) / 10_000;
	const out: ReportData = {
		...(key ? { key } : {}),
		complete: n >= window,
		days_after: n,
		periods: { before, after },
		before: vb,
		after: va,
		delta,
		delta_pct: vb === null || va === null || vb === 0 ? null : Math.round(((va - vb) / vb) * 10_000) / 10_000,
		notices: [...notices, ...(n < window ? ["incomplete"] : []), ...(vb === null && va === null ? ["metric_unavailable"] : [])],
	};
	// Amounts carry their code.
	if (report === "revenue") out.currency = a?.data.currency ?? b?.data.currency ?? null;
	if (COUNT_METRICS.has(metric) && vb !== null && va !== null) out.notable = Math.abs(va - vb) > 2 * Math.sqrt(va + vb);
	const den = denominator(metric, report);
	if (den) out.measured = { before: num(pb?.[den]), after: num(pa?.[den]) };

	// Daily series with the marker, when a daily report serves the metric.
	const seriesReport = search && SEARCH_SERIES.has(metric) && report !== "search_position_bands" ? "search_overview" : !search && TRAFFIC_SERIES.has(report) && SESSION_SERIES.has(metric) ? "timeseries" : null;
	if (m.series && seriesReport) {
		const s = await rc.dispatch?.({ report: seriesReport, query: query(before.from, after.to, runFilters, "day"), ...(m.params.source && search ? { params: { source: m.params.source } } : {}), lean: true });
		out.series = (s?.data.series ?? []).map((pt) => ({ t: pt.t, value: num(pt[metric]) }));
		out.marker = day;
	}
	// The standard KPIs of the same scope and windows, for context (traffic filters only: no key, no search scope).
	if (m.context) {
		const tf = [...filters0, ...(m.scope ? scopeToFilters(m.scope, "traffic").filters : []), ...(m.path ? [{ dim: "page", op: "is", values: [m.path] } as Filter] : [])];
		const kpi = async (r: { from: string; to: string }) => (await rc.dispatch?.({ report: "overview", query: query(r.from, r.to, tf), lean: true }))?.data.totals ?? null;
		out.context = { before: await kpi(before), after: await kpi(after) };
	}
	return out;
}

export async function impact(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const p = input.params;
	const report = p.report as ImpactReport | undefined;
	if (!report || !(IMPACT_REPORTS as readonly string[]).includes(report)) throw new QueryError("invalid_params", `impact needs params.report, one of ${IMPACT_REPORTS.join(", ")}.`);
	const metric = p.metric;
	if (!metric || !IMPACT_METRICS[report].includes(metric)) throw new QueryError("invalid_params", `Unknown metric ${metric ?? "(none)"} for ${report}; allowed: ${IMPACT_METRICS[report].join(", ")}.`);
	if (!rc.dispatch) throw new QueryError("invalid_params", "impact runs through the report dispatcher.");
	const tz = rc.settings.siteTimezone;
	const window = p.window ?? DEFAULT_IMPACT_WINDOW;
	const search = SEARCH_TARGET(report);
	const scopeMode = p.scope === "none" ? "none" : "annotation";

	let annotation: Annotation | null = null;
	let day: string;
	if (p.annotation) {
		annotation = (await rc.annotationStore?.resolve(p.annotation, p.kind)) ?? null;
		if (!annotation) {
			if (p.annotation === "latest") return { no_annotation: true, report, metric, window, caution: SEO_TEXT.caution, notices: ["no_annotation"] };
			throw new QueryError("not_found", "Unknown annotation.");
		}
		day = dayInZone(annotation.ts, tz);
	} else if (p.at) day = p.at;
	else throw new QueryError("invalid_params", "impact needs params.annotation or params.at.");

	const annotationOut = annotation ? { id: annotation.id ?? null, ts: annotation.ts, kind: annotation.kind, text: annotation.text, scope: annotation.scope ?? null, summary: scopeSummary(annotation.scope) } : undefined;
	const base = { ...(annotationOut ? { annotation: annotationOut } : {}), day, window, report, metric, scope: scopeMode, caution: SEO_TEXT.caution };
	const key = report === "goals" ? (p.goal ?? p.key) : p.key;
	// Row reports have no totals: without a key there is nothing to read.
	if (!key && (report === "goals" || IMPACT_KEY_DIM[report])) throw new QueryError("invalid_params", `impact over ${report} needs params.key${report === "goals" ? " or params.goal" : ""}.`);
	const targetParams: ReportParams = {
		...(p.source ? { source: p.source } : {}),
		...(p.prop ? { prop: p.prop } : {}),
		...(p.dim ? { dim: p.dim } : {}),
		...(p.currency ? { currency: p.currency } : {}),
	};
	const m: Measure = { report, metric, window, key, path: p.path, scope: scopeMode === "annotation" ? annotation?.scope : undefined, params: targetParams, series: true, context: p.context === true };
	const out: ReportData = { ...base, ...(await measure(rc, input.filters, day, m, await lastCompleteDay(rc, search, p.source ?? "all"))) };
	if (out.not_yet) return out;
	const periods = out.periods as { before: { from: string }; after: { to: string } };
	const others = (await rc.annotationStore?.inRange(periods.before.from, periods.after.to)) ?? [];
	out.overlapping = others
		.filter((o) => !(annotation && (annotation.id !== undefined ? o.id === annotation.id : o.ts === annotation.ts && o.text === annotation.text)))
		.sort((x, y) => x.ts - y.ts)
		.map((o) => ({ id: o.id ?? null, ts: o.ts, kind: o.kind, text: o.text }));
	return out;
}

/** Window of the Annotations page when none is given. */
export const DEFAULT_LIST_WINDOW = 14;
/** Rows (each two lean runs of its target, at most 3 statements each) one `annotation_impacts` call measures: a full page stays under 45 D1 statements. */
export const MAX_IMPACT_ROWS = 6;
export const MAX_IMPACT_ROWS_SMALL = 5;
export const SCOPE_KINDS_FILTER = ["site", "host", "path", "query"] as const;

const scopeKindOf = (a: Annotation): string[] => (a.scope ? (["host", "path", "query"] as const).filter((k) => a.scope?.[k]?.length) : ["site"]);

/**
 * One page of the range's annotations, newest first, each measured on its target KPI (or the default) over equal
 * windows, with the verdict and the overlapping annotations of the same scope. One annotation read for the page;
 * the target runs go through the cached dispatcher, so two rows with the same target and day share them.
 */
export async function annotationImpacts(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	if (!rc.dispatch || !rc.annotationStore) throw new QueryError("invalid_params", "annotation_impacts runs through the report dispatcher.");
	const p = input.params;
	const tz = rc.settings.siteTimezone;
	const window = p.window ?? DEFAULT_LIST_WINDOW;
	const cap = rc.settings.capacityProfile === "small" ? MAX_IMPACT_ROWS_SMALL : MAX_IMPACT_ROWS;
	const limit = Math.min(input.limit, cap);
	// Search targets are measured with `withSearch` (agents need read:search for it) and once final Search rows exist.
	const searchOn = p.withSearch === true && (await lastFinal(rc, "all")) !== null;
	// Neighbours up to one window outside the range can overlap a row's windows.
	const all = await rc.annotationStore.inRange(addDays(input.from, -window), addDays(input.to, window));
	const dayOf = (a: Annotation) => dayInZone(a.ts, tz);
	const list = all
		.filter((a) => dayOf(a) >= input.from && dayOf(a) <= input.to && (!p.kind || a.kind === p.kind) && (!p.scopeKind || scopeKindOf(a).includes(p.scopeKind)) && (!p.q || annotationSearchMatches(a, p.q)))
		.sort((x, y) => y.ts - x.ts);
	const page = list.slice(input.offset, input.offset + limit);
	const days = { traffic: await lastCompleteDay(rc, false, "all"), search: new Map<string, { yesterday: string; last: string }>() };
	const rows = [];
	for (const a of page) {
		const day = dayOf(a);
		const target: Target = a.target ?? defaultTarget(a.scope, searchOn);
		const search = isSearchTarget(target);
		const source = target.params?.source ?? "all";
		let d = search ? days.search.get(source) : days.traffic;
		if (!d) days.search.set(source, (d = await lastCompleteDay(rc, true, source)));
		const goal = target.params?.goal;
		const key = target.report === "goals" ? (goal ? (rc.goalNames?.get(goal) ?? goal) : undefined) : target.params?.key;
		const { key: _k, goal: _g, ...params } = target.params ?? {};
		const figures =
			search && !searchOn
				? { complete: false, days_after: window, before: null, after: null, notices: ["search_no_data"] }
				: await measure(rc, input.filters, day, { report: target.report, metric: target.metric, window, key, scope: a.scope, params, series: false, context: false }, d);
		const periods = figures.periods as { before: { from: string }; after: { to: string } } | undefined;
		const from = periods?.before.from ?? addDays(day, -window);
		const to = periods?.after.to ?? addDays(day, window);
		const overlaps = all
			.filter((o) => o.id !== a.id && dayOf(o) >= from && dayOf(o) <= to && scopesOverlap(a.scope, o.scope))
			.sort((x, y) => x.ts - y.ts)
			.map((o) => ({ id: o.id ?? null, day: dayOf(o), text: o.text }));
		const v = verdictOf(target.metric, { window, days_after: Number(figures.days_after ?? 0), before: figures.before as number | null, after: figures.after as number | null, ...(typeof figures.notable === "boolean" ? { notable: figures.notable } : {}), ...(figures.measured ? { measured: figures.measured as { before: number | null; after: number | null } } : {}) });
		const { collection, ref, slug } = a;
		rows.push({
			key: a.id ?? `${a.ts}`,
			annotation: { ...annotationView(a, tz), target: a.target ?? null, ...(collection ? { collection } : {}), ...(ref ? { ref } : {}), ...(slug ? { slug } : {}) },
			target,
			target_default: !a.target,
			...figures,
			window,
			...v,
			overlaps,
		});
	}
	const searchThrough = [...days.search.values()].find((x) => x.last < x.yesterday)?.last;
	return { rows, total: list.length, window, limit, caution: SEO_TEXT.caution, ...(searchThrough ? { search_through: searchThrough } : {}), notices: searchThrough ? ["search_lags"] : [] };
}
