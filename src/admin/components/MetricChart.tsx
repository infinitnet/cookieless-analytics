/**
 * Metric cards that toggle the series of one trend chart. One component for every page
 * with a trend: the cards, the chart, the legend and the selection rules. The selection lives in the URL
 * (`m`) and as the browser's personal default (`src/admin/prefs.ts`).
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { formatFamily, type Format, rangeText } from "../../charts/geometry.js";
import type { Params, ReportName } from "../../query/reports/index.js";
import type { Granularity } from "../../query/reports/timeseries.js";
import { type ReportState, useReport } from "../api.js";
import { chartMetrics, MAX_METRICS, setChartMetrics } from "../prefs.js";
import { annotationMarkers, type ChartSeries, LineChart, type Marker } from "./Chart.js";
import { CompareNote } from "./Change.js";
import { LOWER_IS_BETTER } from "./format.js";
import { type View, toQuery } from "./Header.js";
import { KpiCard } from "./KpiCard.js";
import { usePageError } from "./ReportNotices.js";
import { type PanelId, PANEL_DEFINITIONS } from "../../charts/definitions.js";
import { AnnotationsToggle, Empty, InfoMark } from "./ui.js";

export interface MetricDef {
	key: string;
	label: string;
	format: Format;
	lowerIsBetter?: boolean;
	/** False: a card without a toggle (a figure that is not a series). */
	selectable?: boolean;
	/** Drawn 1 at the top on its own axis (Search position). */
	invert?: boolean;
}

export const HINTS = {
	max: `Up to ${MAX_METRICS} metrics at once. Turn one off first.`,
	compare: "Up to 2 metrics while a comparison is on.",
	narrow: "Up to 2 metrics on a small screen.",
	scales: "These metrics use two scales already. Turn one off first.",
	last: "One metric stays on.",
	trimmedCompare: "Comparison on: showing the first 2 metrics.",
	trimmedNarrow: "Small screen: showing the first 2 metrics.",
} as const;

/** Scale family of a metric: its format family, and a separate one for an inverted axis. */
export const familyOf = (m: Pick<MetricDef, "format" | "invert">) => (m.invert ? "rank" : formatFamily(m.format));

/** Most series on at once: 2 with a comparison (each has a dashed twin) or on a small screen, else 4. */
export const seriesLimit = (compare: boolean, narrow: boolean) => (compare || narrow ? 2 : MAX_METRICS);

/** Slot per selected key: a kept key keeps its slot, a new key takes the lowest free one. */
export function nextSlots(prev: Readonly<Record<string, number>>, selected: readonly string[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const k of selected) if (prev[k] !== undefined) out[k] = prev[k];
	const used = new Set(Object.values(out));
	for (const k of selected) {
		if (out[k] !== undefined) continue;
		let s = 0;
		while (used.has(s)) s++;
		out[k] = s;
		used.add(s);
	}
	return out;
}

/**
 * A click on the card of `key`: the new selection, or the reason it is refused (the chart then
 * stays as it is). `only`: Shift or Alt click, this card alone.
 */
export function toggleMetric(selected: readonly string[], key: string, metrics: readonly MetricDef[], o: { compare: boolean; narrow: boolean; only?: boolean }): { selected: string[] } | { refused: string } {
	if (o.only) return { selected: [key] };
	if (selected.includes(key)) return selected.length === 1 ? { refused: HINTS.last } : { selected: selected.filter((k) => k !== key) };
	if (selected.length >= seriesLimit(o.compare, o.narrow)) return { refused: o.compare ? HINTS.compare : o.narrow ? HINTS.narrow : HINTS.max };
	const def = (k: string) => metrics.find((m) => m.key === k);
	const families = new Set([...selected, key].map((k) => def(k)).flatMap((m) => (m ? [familyOf(m)] : [])));
	if (families.size > 2) return { refused: HINTS.scales };
	return { selected: [...selected, key] };
}

/** Largest value of one series more than this many times another of the same family: the larger ones move to the right axis when it is free. */
export const SCALE_RATIO = 20;

/**
 * Axis per selected metric, `selected` in slot order. One family: the left axis, unless one
 * series is more than 20 times another, then the larger group goes right. Two families: the first left,
 * the other right; a series that is small next to another on its shared axis gets a hint.
 */
export function assignAxes(selected: readonly MetricDef[], maxOf: (key: string) => number): { axis: Record<string, "left" | "right">; hint?: string } {
	const fams = [...new Set(selected.map(familyOf))];
	const axis: Record<string, "left" | "right"> = {};
	for (const m of selected) axis[m.key] = familyOf(m) === fams[0] ? "left" : "right";
	if (fams.length === 1 && selected.length > 1) {
		const least = Math.min(...selected.map((m) => maxOf(m.key)));
		const big = selected.filter((m) => maxOf(m.key) > SCALE_RATIO * Math.max(least, 0));
		if (least > 0 && big.length) for (const m of big) axis[m.key] = "right";
		return { axis };
	}
	for (const f of fams) {
		const list = selected.filter((m) => familyOf(m) === f);
		const small = list.reduce<MetricDef | undefined>((a, m) => (!a || maxOf(m.key) < maxOf(a.key) ? m : a), undefined);
		const large = list.reduce<MetricDef | undefined>((a, m) => (!a || maxOf(m.key) > maxOf(a.key) ? m : a), undefined);
		if (small && large && maxOf(small.key) > 0 && maxOf(large.key) > SCALE_RATIO * maxOf(small.key)) return { axis, hint: `${small.label} is small next to ${large.label} on this scale.` };
	}
	return { axis };
}

/** Counts that add up over buckets (visitors are distinct per day and summed over days; per hour they are not). */
const SUMMED = ["visitors", "sessions", "pageviews"] as const;

/**
 * Card figures of a report without totals (`timeseries`): the sums of the summed counts over the buckets, and the
 * same sums over the comparison buckets (null without a comparison). Visitors only for day and week buckets.
 */
export function seriesTotals(series: ReadonlyArray<Record<string, unknown>>, compare: ReadonlyArray<Record<string, unknown>> | undefined, gran: Granularity): { totals: Record<string, number>; compareTotals: Record<string, number> | null } {
	const totals: Record<string, number> = {};
	const previous: Record<string, number> = {};
	const sum = (list: ReadonlyArray<Record<string, unknown>>, k: string) => list.reduce((n, p) => n + (Number(p[k]) || 0), 0);
	for (const k of SUMMED) {
		if (k === "visitors" && gran === "hour") continue;
		totals[k] = sum(series, k);
		if (compare?.length) previous[k] = sum(compare, k);
	}
	return { totals, compareTotals: compare?.length ? previous : null };
}

/** True below 640 px wide (the 390 px phone layout): at most 2 series. */
function useNarrow(): boolean {
	const q = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 640px)") : null;
	const [narrow, setNarrow] = useState(() => q?.matches ?? false);
	useEffect(() => {
		if (!q) return;
		const on = () => setNarrow(q.matches);
		q.addEventListener?.("change", on);
		return () => q.removeEventListener?.("change", on);
	}, [q?.media]);
	return narrow;
}

export interface MetricChartProps {
	/** Page key: the personal default in storage. */
	id: string;
	view: View;
	/** Cards in order; each selectable card is a series of the report. */
	metrics: readonly MetricDef[];
	/** Selected when the URL and the personal default say nothing. */
	defaults: readonly string[];
	/** Report with a per bucket `series` (and `compareSeries`): `timeseries` by default, run with the page's range, comparison and filters. */
	report?: ReportName;
	/** The info mark of the chart title, when it is not the definition of `report`. */
	info?: ReportName | PanelId;
	params?: Params;
	/** The page ran the report already (it shares the result): no second call. */
	result?: ReportState;
	/** Card figures and the comparison's figures; else the report's own `totals` and `compareTotals`; else the sums of the summed counts over the buckets (`seriesTotals`). */
	totals?: Record<string, unknown> | undefined;
	compareTotals?: Record<string, unknown> | null | undefined;
	/** Panel heading; "Visitors and Sessions per day" by default. */
	title?: string;
	/** Annotation markers and their toggle. */
	annotations?: boolean;
	markerActions?: ((m: Marker) => ReactNode) | undefined;
	/** Sparklines on the cards. */
	trend?: boolean;
	/** More cards after the metric cards (figures that are not series). */
	extraCards?: ReactNode;
	height?: number;
}

const join = (labels: readonly string[]) => (labels.length < 2 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`);

/** Cards that toggle series, the hint line, and the chart in a panel. */
export function MetricChart({ id, view, metrics, defaults, report = "timeseries", info, params, result, totals, compareTotals, title, annotations = false, markerActions, trend = false, extraCards, height }: MetricChartProps) {
	const { state, update, site, tz } = view;
	const own = useReport(site.id, result ? null : { report, query: toQuery(state, report), ...(params ? { params } : {}) });
	const res = result ?? own;
	// Inside a page's error scope the error shows once on top; the chart area says "Not loaded.".
	usePageError(res.error);
	const data = res.data?.data;
	const series = (data?.series ?? []) as Array<Record<string, unknown>>;
	const compareSeries = data?.compareSeries as Array<Record<string, unknown>> | undefined;
	const gran = (data?.granularity ?? "day") as Granularity;
	const names = res.data?.compare === "segment" && res.data.compareSegment ? ([res.data.segment?.name ?? "All visitors", res.data.compareSegment.name] as const) : undefined;
	const cmpRange = res.data?.compareRange;
	const compareLabel = names?.[1] ?? (cmpRange ? rangeText(cmpRange.from, cmpRange.to) : undefined);
	const compare = !!compareSeries?.length;
	const narrow = useNarrow();
	const selectable = metrics.filter((m) => m.selectable !== false);
	const keys = selectable.map((m) => m.key);
	const picked = chartMetrics(id, state.m, keys, defaults);
	const limit = seriesLimit(compare, narrow);
	// Too many for a comparison or a small screen: the first in card order.
	const shown = picked.length > limit ? keys.filter((k) => picked.includes(k)).slice(0, limit) : picked;
	const trimmed = picked.length > limit ? (compare ? HINTS.trimmedCompare : HINTS.trimmedNarrow) : undefined;
	const slotsRef = useRef<Record<string, number>>({});
	const slots = nextSlots(slotsRef.current, shown);
	slotsRef.current = slots;
	const ordered = [...shown].sort((a, b) => (slots[a] ?? 0) - (slots[b] ?? 0));
	const defs = ordered.flatMap((k) => selectable.filter((m) => m.key === k));
	const maxOf = (k: string) => Math.max(0, ...series.map((p) => Number(p[k] ?? 0)), ...(compareSeries ?? []).map((p) => Number(p[k] ?? 0)));
	const axes = assignAxes(defs, maxOf);
	const twoAxes = Object.values(axes.axis).includes("right");
	const [refused, setRefused] = useState<string | null>(null);
	const loading = res.loading && !res.data;
	const empty = !!res.data && series.length === 0;
	const summed = !totals && !data?.totals && res.data ? seriesTotals(series, compareSeries, gran) : undefined;
	const figures = totals ?? data?.totals ?? summed?.totals;
	const previous = compareTotals !== undefined ? compareTotals : ((data?.compareTotals as Record<string, unknown> | null | undefined) ?? summed?.compareTotals);

	const toggle = (key: string, e: { shiftKey: boolean; altKey: boolean }) => {
		const r = toggleMetric(shown, key, selectable, { compare, narrow, only: e.shiftKey || e.altKey });
		if ("refused" in r) return setRefused(r.refused);
		setRefused(null);
		const next = nextSlots(slots, r.selected);
		const list = [...r.selected].sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0));
		// While the selection is trimmed (comparison, small screen) a click changes this view only, not the personal default.
		update({ m: picked.length > limit ? list : setChartMetrics(id, list, defaults) });
	};
	const reset = () => {
		setRefused(null);
		update({ m: setChartMetrics(id, defaults, defaults) });
	};
	const isDefault = shown.length === defaults.length && shown.every((k) => defaults.includes(k));
	const hint = refused ?? trimmed ?? axes.hint ?? "";

	const lines: ChartSeries[] = defs.map((m) => ({
		key: m.key,
		label: m.label,
		format: m.format,
		slot: slots[m.key] ?? 0,
		values: series.map((p) => (p[m.key] as number | null | undefined) ?? null),
		compare: compareSeries?.map((p) => (p[m.key] as number | null | undefined) ?? null),
		axis: axes.axis[m.key] ?? "left",
		...(m.invert ? { invert: true } : {}),
	}));
	const heading = title ?? `${join(defs.map((m) => m.label))} per ${gran}`;
	const showAnn = annotations && state.annotations !== false;
	const anns = (data?.annotations ?? []) as Parameters<typeof annotationMarkers>[0];
	const px = height ?? 200;

	return (
		<div className="ca-stack">
			<CompareNote result={res.data} />
			<section className="ca-kpis" aria-label="Key figures">
				{metrics.map((m) => {
					const on = shown.includes(m.key);
					const sel = m.selectable !== false;
					return (
						<KpiCard
							key={m.key}
							metric={m.key}
							label={m.label}
							format={m.format}
							value={figures ? (figures[m.key] as number | null | undefined) : undefined}
							compare={previous}
							trend={trend ? series.map((p) => Number(p[m.key] ?? 0)) : undefined}
							lowerIsBetter={m.lowerIsBetter ?? LOWER_IS_BETTER.has(m.key)}
							active={sel && on}
							slot={sel && on ? slots[m.key] : undefined}
							axis={twoAxes && on ? (axes.axis[m.key] === "right" ? "Right axis" : "Left axis") : undefined}
							disabled={loading || empty}
							{...(sel ? { onSelect: (e: { shiftKey: boolean; altKey: boolean }) => toggle(m.key, e) } : {})}
						/>
					);
				})}
				{extraCards}
			</section>
			<p className="ca-chart-hint" role="status">
				<span>{hint}</span>
				{!isDefault && (
					<button type="button" className="ca-linkbtn" onClick={reset}>
						Reset
					</button>
				)}
			</p>
			<section className="ca-panel" aria-label="Trend">
				<div className="ca-chart-toolbar">
					<h3>
						{heading}
						<InfoMark text={PANEL_DEFINITIONS[info ?? report]} />
					</h3>
					{annotations && <AnnotationsToggle on={showAnn} onChange={(on) => update({ annotations: on })} />}
				</div>
				{loading ? (
					<div className="ca-chart-skel" style={{ height: px }} aria-busy="true" />
				) : res.error && !res.data ? (
					<div className="ca-chart-skel" style={{ height: px }}>
						<p className="ca-small">Not loaded.</p>
					</div>
				) : empty ? (
					<div className="ca-chart-skel" style={{ height: px }}>
						<Empty />
					</div>
				) : (
					<LineChart
						label={`${join(defs.map((m) => m.label))} per ${gran}${res.data ? `, ${rangeText(res.data.range.from, res.data.range.to)}` : ""}`}
						buckets={series.map((p) => String(p.t))}
						series={lines}
						granularity={gran}
						names={names}
						compareLabel={compareLabel}
						markers={showAnn ? annotationMarkers(anns, gran, tz) : []}
						markerActions={markerActions}
						onToggle={toggle}
						height={px}
					/>
				)}
			</section>
		</div>
	);
}
