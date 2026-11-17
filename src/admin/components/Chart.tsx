/**
 * Small SVG chart kit: multi series line with up to two axes, one floating tooltip for
 * pointer, touch and keys, compare overlay, annotation markers and a table view; horizontal bars, stacked
 * bars, sparkline, donut.
 */
import { type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { scopeSummary } from "../../annotations/scope.js";
import { annotationBucket } from "../../charts/markers.js";
import { dayInZone } from "../../core/time.js";
import type { Annotation } from "../../query/reports/base.js";
import type { Granularity } from "../../query/reports/timeseries.js";
import {
	annotationCount,
	areaPath,
	axisScale,
	barWidth,
	bucketText,
	color,
	DONUT_R,
	donutArcs,
	fmt,
	fmtTick,
	type Format,
	groupDate,
	linePath,
	lineScale,
	type MarkerGroup,
	markerGroups,
	MUTED,
	shapePath,
	slotColor,
	sparkPath,
	stackedRects,
	tickIndexes,
	W,
} from "../../charts/geometry.js";
import { AnnotationPopover } from "./AnnotationPopover.js";
import { ChangeMark } from "./Change.js";
import { describeChange } from "./format.js";


/**
 * Units per CSS px of a `W` wide viewBox at its rendered width, so text, markers and heights keep their px
 * size on any screen. 1 without ResizeObserver (tests, old browsers): the geometry is then the plain viewBox.
 */
function useUnits(): [RefObject<SVGSVGElement | null>, number] {
	const ref = useRef<SVGSVGElement | null>(null);
	const [width, setWidth] = useState(W);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(([e]) => {
			const w = Math.round(e?.contentRect.width ?? 0);
			if (w > 0) setWidth(w);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, W / width];
}

/**
 * Active bucket of a plot: one pointer handler instead of one node per bucket, a tap or drag on
 * touch (cleared by a tap outside), and keys on the one focus stop: Left and Right one bucket, Page Up and
 * Page Down 7, Home and End, Escape clears. `indexAt` maps the x fraction of the plot to a bucket.
 */
function usePlotNav(n: number, indexAt: (frac: number) => number) {
	const [active, setActive] = useState<number | null>(null);
	const ref = useRef<HTMLDivElement>(null);
	const on = active !== null;
	useEffect(() => {
		if (!on) return;
		const outside = (e: Event) => {
			if (!ref.current?.contains(e.target as Node)) setActive(null);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [on]);
	const clamp = (i: number) => Math.max(0, Math.min(n - 1, i));
	const at = (e: PointerEvent<HTMLDivElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		const i = indexAt((e.clientX - r.left) / r.width);
		if (r.width > 0 && n > 0 && Number.isFinite(i)) setActive(clamp(i));
	};
	const props = {
		ref,
		tabIndex: n > 0 ? 0 : -1,
		onPointerMove: at,
		onPointerDown: at,
		onPointerLeave: (e: PointerEvent<HTMLDivElement>) => {
			if (e.pointerType === "mouse") setActive(null);
		},
		onBlur: (e: { relatedTarget: EventTarget | null }) => {
			if (!ref.current?.contains(e.relatedTarget as Node | null)) setActive(null);
		},
		onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
			// Keys on a marker button inside the plot belong to that button.
			if (e.target !== e.currentTarget || n === 0) return;
			const step = ({ ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 } as Record<string, number>)[e.key];
			let next: number | null;
			if (step !== undefined) next = active === null ? (step > 0 ? 0 : n - 1) : clamp(active + step);
			else if (e.key === "Home") next = 0;
			else if (e.key === "End") next = n - 1;
			else if (e.key === "Escape") next = null;
			else return;
			e.preventDefault();
			setActive(next);
		},
	};
	return [active, props] as const;
}

/**
 * Floating tooltip inside the plot (never in the flow, so nothing moves): 12 px right of the guide line,
 * left of it when it would cross the right edge, and always kept inside the plot (narrow screens).
 */
function Tip({ x, top, width, children }: { x: number; top: number; width: number; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const w = el.offsetWidth;
		const at = x + 12 + w <= width ? x + 12 : x - 12 - w;
		el.style.transform = `translateX(${Math.round(Math.max(0, Math.min(width - w, at)))}px)`;
	});
	return (
		<div ref={ref} className="ca-tip" aria-hidden="true" style={{ top }}>
			{children}
		</div>
	);
}

/** Slot shape as a small inline SVG (legend, tooltip rows, card chips). */
export function SlotShape({ slot, dashed = false }: { slot: number; dashed?: boolean }) {
	return (
		<svg aria-hidden="true" className="ca-shape" width={dashed ? 18 : 10} height={10} viewBox={dashed ? "0 0 18 10" : "0 0 10 10"}>
			{dashed ? <line x1={0} x2={18} y1={5} y2={5} stroke={slotColor(slot)} strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 3" /> : <path d={shapePath(slot, 5, 5, 4)} fill={slotColor(slot)} />}
		</svg>
	);
}

export interface Marker {
	/** Bucket key of the series (`YYYY-MM-DD`, `YYYY-MM-DD HH:00` or a week start). */
	t: string;
	label: string;
	id?: string;
	/** Local day of the annotation. */
	day?: string;
	kind?: string;
	/** Scope summary. */
	summary?: string;
}

/** Annotation markers keyed like the timeseries buckets of the site timezone. */
export function annotationMarkers(annotations: readonly Annotation[], gran: Granularity, tz: string): Marker[] {
	return annotations.map((a) => {
		const day = dayInZone(a.ts, tz);
		const t = annotationBucket(a.ts, gran, tz);
		return { t, label: a.text, ...(a.id ? { id: a.id } : {}), day, kind: a.kind, summary: a.summary ?? scopeSummary(a.scope ?? undefined) };
	});
}

/** One line of a `LineChart`. */
export interface ChartSeries {
	key: string;
	label: string;
	format: Format;
	/** Colour and shape slot 0 to 3; the index in `series` when absent. */
	slot?: number;
	values: ReadonlyArray<number | null>;
	/** Comparison values aligned by index: drawn dashed in the series colour. */
	compare?: ReadonlyArray<number | null> | undefined;
	axis?: "left" | "right";
	/** 1 at the top (Search position). */
	invert?: boolean;
}

export interface LineChartProps {
	/** Bucket keys, one per value of every series. */
	buckets?: readonly string[];
	series?: readonly ChartSeries[];
	/** Single series form (kept for pages that chart one metric): the bucket and its value. */
	points?: ReadonlyArray<{ t: string; v: number | null }>;
	/** Single series form: compare values aligned by index (previous period or last year). */
	compare?: ReadonlyArray<number | null> | undefined;
	format?: Format;
	/** Single series form: the charted metric, so the tooltip judges its change (lower is better, position). */
	metric?: string | undefined;
	/** Segment comparison: the names of the solid and the dashed side. */
	names?: readonly [string, string] | undefined;
	/** What the dashed lines show ("15 Feb to 28 Feb" or a segment name). */
	compareLabel?: string | undefined;
	granularity?: Granularity | undefined;
	markers?: readonly Marker[] | undefined;
	label: string;
	height?: number;
	/** Per-annotation actions in the marker popover. */
	markerActions?: ((m: Marker) => ReactNode) | undefined;
	/** Called when a marker group opens its popover. */
	onMarkerOpen?: ((g: MarkerGroup<Marker>) => void) | undefined;
	/** Legend entries become toggle buttons (same rules as the cards). */
	onToggle?: ((key: string, e: { shiftKey: boolean; altKey: boolean }) => void) | undefined;
	/** Replaces the built-in legend below the plot (null: none); dashboard tiles list their hidden lines too. */
	legend?: ReactNode;
}

/** Axis caption: the labels on the axis; position says which way is better; money names its currency once (not on every tick). */
function caption(list: readonly ChartSeries[]): string {
	const text = list.map((s) => (s.invert ? `${s.label} (1 is best)` : s.label)).join(", ");
	const code = list[0]?.format.startsWith("money:") ? list[0].format.slice(6) : "";
	return code && !text.includes(code) ? `${text} (${code})` : text;
}

/**
 * Lines with up to 4 series on at most 2 axes; area fill with exactly one series. Hover, touch and arrow
 * keys show one floating tooltip and a status sentence for screen readers; marker groups open a popover.
 */
export function LineChart(props: LineChartProps) {
	const { markers = [], label, height: px = 200, markerActions, onMarkerOpen, names, granularity, onToggle } = props;
	const single = !props.series;
	const buckets = props.buckets ?? props.points?.map((p) => p.t) ?? [];
	const series: ChartSeries[] = (
		props.series ?? [{ key: props.metric ?? "value", label: names?.[0] ?? (props.compare ? "This period" : label), format: props.format ?? "number", values: props.points?.map((p) => p.v) ?? [], compare: props.compare }]
	).map((s, i) => ({ ...s, slot: s.slot ?? i }));
	const cmpLabel = props.compareLabel ?? names?.[1] ?? "Comparison period";
	const gran = granularity ?? (buckets[0]?.includes(" ") ? "hour" : "day");
	const n = buckets.length;
	const [svgRef, u] = useUnits();
	const widthPx = W / u;
	// Height in viewBox units for `px` CSS px at the rendered width.
	const height = Math.round(px * u);
	const [open, setOpen] = useState<{ g: MarkerGroup<Marker>; opener: HTMLElement | SVGElement } | null>(null);
	const [table, setTable] = useState(false);
	const { top, bottom } = lineScale(n, [], height, u);
	const sides = (["left", "right"] as const).map((side) => {
		const list = series.filter((s) => (s.axis ?? "left") === side);
		const vals = list.flatMap((s) => [...s.values, ...(s.compare ?? [])]);
		return { side, list, scale: axisScale(vals, top, bottom, list.some((s) => s.invert)), format: list[0]?.format ?? "number" };
	});
	const [left, right] = sides as [(typeof sides)[0], (typeof sides)[0]];
	// Gutters as wide as the y axis labels, so lines and annotation markers never cover them (about 6.5 px a character at 11 px).
	const gutter = (side: typeof left) => (side.list.length ? (Math.max(...side.scale.ticks.map((v) => fmtTick(v, side.format).length)) * 6.5 + 6) * u : 0);
	const inset = { left: gutter(left), right: gutter(right) };
	const sc = lineScale(n, [], height, u, inset);
	const { x } = sc;
	const plotW = W - inset.left - inset.right;
	const [hover, nav] = usePlotNav(n, (f) => Math.round(((f * W - inset.left) / plotW) * (n - 1)));
	const scaleOf = (s: ChartSeries) => (s.axis === "right" ? right : left).scale;
	const path = (vals: ReadonlyArray<number | null>, s: ChartSeries) => linePath(vals.slice(0, Math.max(n, 1)), { x, y: scaleOf(s).y });
	const index = new Map(buckets.map((t, i) => [t, i]));
	const marks = new Map<number, string[]>();
	for (const m of markers) {
		const i = index.get(m.t);
		if (i !== undefined) marks.set(i, [...(marks.get(i) ?? []), m.label]);
	}
	const groups = markerGroups(markers, (t) => {
		const i = index.get(t);
		return i === undefined ? undefined : x(i);
	});
	const shown = groups.reduce((s, g) => s + g.count, 0);
	const openGroup = (g: MarkerGroup<Marker>, opener: HTMLElement | SVGElement) => {
		setOpen({ g, opener });
		onMarkerOpen?.(g);
	};
	const anyCompare = series.some((s) => s.compare?.length);
	const multi = series.length > 1;
	const captions = multi || right.list.length > 0 || series.some((s) => s.invert || s.format.startsWith("money:"));
	// Direct labels at the line ends on wide screens, dropped when two would touch or a right axis holds the edge.
	const ends = series.map((s) => {
		let i = n - 1;
		while (i >= 0 && s.values[i] == null) i--;
		return i < 0 ? null : { s, i, y: scaleOf(s).y(s.values[i] ?? null) };
	});
	const ys = ends.flatMap((e) => (e ? [e.y] : [])).sort((a, b) => a - b);
	const direct = multi && right.list.length === 0 && widthPx >= 700 && n > 1 && ys.every((y, i) => i === 0 || y - (ys[i - 1] as number) >= 14 * u);
	const ticks = tickIndexes(n, widthPx < 600 ? 3 : 6);
	const sentence = (i: number) => {
		const t = bucketText(buckets[i] ?? "", gran);
		const now = series.map((s) => `${s.label} ${s.values[i] == null ? "no data" : fmt(s.values[i], s.format)}`).join(", ");
		const was = series.filter((s) => s.compare?.length).map((s) => `${s.label} ${s.compare?.[i] == null ? "no data" : fmt(s.compare[i], s.format)}`);
		const notes = marks.get(i);
		return `${t}: ${now}.${was.length ? ` ${cmpLabel}: ${was.join(", ")}.` : ""}${notes ? ` Annotations: ${notes.join(", ")}.` : ""}`;
	};
	return (
		<figure className="ca-chart">
			{captions && (
				<div className="ca-axis-caps">
					<span>{caption(left.list)}</span>
					{right.list.length > 0 && <span>{caption(right.list)}</span>}
				</div>
			)}
			<div className="ca-plot" role="group" aria-label="Chart values. Use the arrow keys." {...nav}>
				<svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={shown ? `${label}, ${annotationCount(shown)}` : label}>
					{left.scale.ticks.map((v, k) => {
						const y = left.scale.y(v);
						return (
							<g key={k} data-tick={k}>
								<line x1={0} x2={W} y1={y} y2={y} stroke={MUTED} strokeOpacity={k === (left.scale.invert ? 2 : 0) ? 0.5 : 0.25} strokeDasharray={k === (left.scale.invert ? 2 : 0) ? undefined : "2 3"} />
								<text x={0} y={y - 3 * u} fontSize={11 * u}>
									{fmtTick(v, left.format)}
								</text>
								{right.list.length > 0 && (
									<text x={W} y={y - 3 * u} fontSize={11 * u} textAnchor="end" data-axis="right">
										{fmtTick(right.scale.ticks[k] ?? 0, right.format)}
									</text>
								)}
							</g>
						);
					})}
					{n > 0 &&
						series.length === 1 &&
						series.map((s) => {
							const d = path(s.values, s);
							return d && s.values.every((v) => v !== null) && !s.invert ? <path key="area" d={areaPath(d, n, sc)} fill={slotColor(s.slot ?? 0)} fillOpacity={0.12} /> : null;
						})}
					{series.map((s) =>
						s.compare?.length ? (
							<path key={`${s.key}-c`} d={path(s.compare, s)} fill="none" stroke={slotColor(s.slot ?? 0)} strokeOpacity={0.6} strokeDasharray="4 3" strokeWidth={1.5} data-compare={s.key} />
						) : null,
					)}
					{series.map((s) => {
						const d = path(s.values, s);
						return d ? <path key={s.key} d={d} fill="none" stroke={slotColor(s.slot ?? 0)} strokeWidth={2} data-series={s.key} /> : null;
					})}
					{n === 1 && series.map((s) => (s.values[0] == null ? null : <path key={`${s.key}-p`} d={shapePath(s.slot ?? 0, x(0), scaleOf(s).y(s.values[0] ?? null), 4 * u)} fill={slotColor(s.slot ?? 0)} data-point={s.key} />))}
					{direct &&
						ends.map((e) =>
							e ? (
								<g key={`${e.s.key}-end`} data-end={e.s.key}>
									<path d={shapePath(e.s.slot ?? 0, x(e.i), e.y, 3.5 * u)} fill={slotColor(e.s.slot ?? 0)} />
									<text x={x(e.i) - 8 * u} y={e.y - 6 * u} fontSize={11 * u} textAnchor="end" className="ca-direct">
										{e.s.label}
									</text>
								</g>
							) : null,
						)}
					{groups.map((g) => (
						<g
							key={g.ts.join(" ")}
							data-marker={g.ts[0]}
							role="button"
							tabIndex={0}
							aria-label={`${annotationCount(g.count)} on ${groupDate(g)}`}
							style={{ cursor: "pointer" }}
							onClick={(e) => openGroup(g, e.currentTarget)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									openGroup(g, e.currentTarget);
								}
							}}
						>
							{/* A 16px strip, so the thin marker line is not the only target. */}
							<rect x={g.x - 8 * u} y={top - 6 * u} width={16 * u} height={bottom - top + 6 * u} fill="transparent" />
							<line x1={g.x} x2={g.x} y1={top} y2={bottom} stroke={color(2)} strokeDasharray="2 2" />
							<circle cx={g.x} cy={top} r={4 * u} fill={color(2)}>
								<title>{g.markers.map((m) => m.label).join("\n")}</title>
							</circle>
							{g.count > 1 && (
								<text x={g.x + 6 * u} y={top - 4 * u} fontSize={11 * u} fill={color(2)} data-count={g.count}>
									{g.count}
								</text>
							)}
						</g>
					))}
					{hover !== null && (
						<g pointerEvents="none" data-hover={buckets[hover]}>
							<line x1={x(hover)} x2={x(hover)} y1={top} y2={bottom} stroke={MUTED} />
							{series.map((s) => (s.values[hover] == null ? null : <path key={s.key} d={shapePath(s.slot ?? 0, x(hover), scaleOf(s).y(s.values[hover] ?? null), 4 * u)} fill={slotColor(s.slot ?? 0)} stroke="var(--ca-surface)" strokeWidth={1} />))}
						</g>
					)}
					{ticks.map((i, k) => (
						<text key={i} x={x(i)} y={height - 4 * u} fontSize={11 * u} textAnchor={ticks.length > 1 && k === 0 ? "start" : k === ticks.length - 1 && ticks.length > 1 ? "end" : "middle"} data-xtick={buckets[i]}>
							{bucketText(buckets[i] ?? "", gran, false)}
						</text>
					))}
				</svg>
				{hover !== null && (
					<Tip x={x(hover) / u} top={top / u} width={widthPx}>
						<div className="ca-tip-head">{bucketText(buckets[hover] ?? "", gran)}</div>
						{series.map((s) => {
							const v = s.values[hover] ?? null;
							const was = s.compare?.length ? (s.compare[hover] ?? null) : undefined;
							const c = v != null && was != null ? describeChange(s.key, v, was, { format: s.format }) : null;
							return (
								<div key={s.key} className="ca-tip-row">
									<span className="ca-tip-name">
										<SlotShape slot={s.slot ?? 0} />
										{s.label}
									</span>
									<span className="ca-tip-val">{v == null ? "No data" : fmt(v, s.format)}</span>
									{was !== undefined && (
										<span className="ca-tip-cmp">
											{cmpLabel}: {was == null ? "No data" : fmt(was, s.format)}
											{c && c.direction !== "flat" && (
												<>
													{" "}
													(<ChangeMark c={c} compact />)
												</>
											)}
										</span>
									)}
								</div>
							);
						})}
						{marks.has(hover) && (
							<div className="ca-tip-notes">
								{marks.get(hover)?.slice(0, 2).map((m) => <div key={m}>{m}</div>)}
								{(marks.get(hover)?.length ?? 0) > 2 && <div>+{(marks.get(hover)?.length ?? 0) - 2} more</div>}
							</div>
						)}
					</Tip>
				)}
			</div>
			<p className="ca-sr-only" role="status">
				{hover === null ? "" : sentence(hover)}
			</p>
			{props.legend !== undefined ? props.legend : (multi || anyCompare) && (
				<div className="ca-legend" {...(names ? { "data-legend": "segments" } : {})}>
					{series.map((s) =>
						onToggle && !single ? (
							<button key={s.key} type="button" className="ca-legend-item" aria-pressed="true" onClick={(e) => onToggle(s.key, e)}>
								<SlotShape slot={s.slot ?? 0} />
								{s.label}
							</button>
						) : (
							<span key={s.key}>
								<SlotShape slot={s.slot ?? 0} />
								{s.label}
							</span>
						),
					)}
					{anyCompare && (
						<span data-legend-compare="">
							<SlotShape slot={series.length === 1 ? (series[0]?.slot ?? 0) : 0} dashed />
							<span className="ca-sr-only">Dashed lines: </span>
							{cmpLabel}
						</span>
					)}
				</div>
			)}
			{n > 0 && (
				<div className="ca-chart-data ca-disclosure">
					{/* The table mounts only when opened: an hourly month is 720 rows. */}
					<button type="button" className="ca-disclosure-toggle" aria-expanded={table} onClick={() => setTable(!table)}>
						<svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
							<path d="M6 4l4 4-4 4" />
						</svg>
						Show as table
					</button>
					{table && (
						<div className="ca-table-scroll ca-disclosure-body">
							<table>
								<caption className="ca-sr-only">{label}</caption>
								<thead>
									<tr>
										<th scope="col">Date</th>
										{series.map((s) => (
											<th key={s.key} scope="col">
												{s.label}
											</th>
										))}
										{series.map((s) =>
											s.compare?.length ? (
												<th key={`${s.key}-c`} scope="col">
													{s.label}, {cmpLabel}
												</th>
											) : null,
										)}
									</tr>
								</thead>
								<tbody>
									{buckets.map((t, i) => (
										<tr key={t}>
											<th scope="row">{bucketText(t, gran)}</th>
											{series.map((s) => (
												<td key={s.key}>{fmt(s.values[i] ?? null, s.format)}</td>
											))}
											{series.map((s) => (s.compare?.length ? <td key={`${s.key}-c`}>{fmt(s.compare[i] ?? null, s.format)}</td> : null))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
			{open && (
				<AnnotationPopover
					markers={open.g.markers}
					date={groupDate(open.g)}
					actions={markerActions}
					onClose={() => {
						const opener = open.opener;
						setOpen(null);
						opener.focus();
					}}
				/>
			)}
		</figure>
	);
}

export interface BarRow {
	label: string;
	value: number;
}

/** Horizontal bars, one per row, scaled to the largest value. */
export function BarList({ rows, format = "number", label, onSelect }: { rows: readonly BarRow[]; format?: Format; label: string; onSelect?: (label: string) => void }) {
	const max = Math.max(1, ...rows.map((r) => r.value));
	const [svgRef, u] = useUnits();
	const rowH = 28 * u;
	return (
		<svg ref={svgRef} className="ca-bars" viewBox={`0 0 ${W} ${rows.length * rowH}`} width="100%" role={onSelect ? "group" : "img"} aria-label={label}>
			{rows.map((r, i) => (
				<g
					key={r.label}
					transform={`translate(0 ${i * rowH})`}
					{...(onSelect && {
						role: "button",
						tabIndex: 0,
						"aria-label": `${r.label}: ${fmt(r.value, format)}`,
						onClick: () => onSelect(r.label),
						onKeyDown: (e: { key: string; preventDefault(): void }) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onSelect(r.label);
							}
						},
						style: { cursor: "pointer" },
					})}
				>
					{/* The whole row is the click target, not only the painted bar and its text. */}
					{onSelect && <rect className="ca-bar-hit" x={0} y={u} width={W} height={rowH - 2 * u} rx={4 * u} fill="transparent" />}
					<rect x={0} y={2 * u} width={barWidth(r.value, max)} height={rowH - 4 * u} rx={3 * u} fill={color(0)} fillOpacity={0.22} />
					<text x={8 * u} y={rowH / 2 + 4 * u} fontSize={12 * u} fill="currentColor">
						{r.label}
					</text>
					<text x={W - 6 * u} y={rowH / 2 + 4 * u} fontSize={12 * u} textAnchor="end" fill="currentColor">
						{fmt(r.value, format)}
					</text>
				</g>
			))}
		</svg>
	);
}

/** Vertical stacked bars: one bar per entry, one segment per key; the same tooltip and keys as the line chart. */
export function StackedBars({ data, keys, label, height: px = 160 }: { data: ReadonlyArray<{ t: string; parts: readonly number[] }>; keys: readonly string[]; label: string; height?: number }) {
	const [svgRef, u] = useUnits();
	const height = Math.round(px * u);
	const rects = stackedRects(data, height);
	const n = data.length;
	const [active, nav] = usePlotNav(n, (f) => Math.floor(f * n));
	const d = active === null ? undefined : data[active];
	const bw = n ? W / n : W;
	const part = (k: number) => keys[k] ?? String(k);
	return (
		<figure className="ca-chart">
			<div className="ca-plot" role="group" aria-label="Chart values. Use the arrow keys." {...nav}>
				<svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={label}>
					{data.map((p, i) => (
						<g key={p.t} opacity={active === null || active === i ? 1 : 0.55}>
							{rects[i]?.map((r, k) => (
								<rect key={k} x={r.x} y={r.y} width={r.width} height={r.height} fill={color(k)} />
							))}
						</g>
					))}
				</svg>
				{d && active !== null && (
					<Tip x={(active * bw + bw / 2) / u} top={0} width={W / u}>
						<div className="ca-tip-head">{bucketText(d.t)}</div>
						{d.parts.map((v, k) => (
							<div key={k} className="ca-tip-row">
								<span className="ca-tip-name">
									<span aria-hidden className="ca-swatch" style={{ background: color(k) }} />
									{part(k)}
								</span>
								<span className="ca-tip-val">{fmt(v)}</span>
							</div>
						))}
					</Tip>
				)}
			</div>
			<p className="ca-sr-only" role="status">
				{d ? `${bucketText(d.t)}: ${d.parts.map((v, k) => `${part(k)} ${fmt(v)}`).join(", ")}.` : ""}
			</p>
			<Legend keys={keys} />
		</figure>
	);
}

/** Tiny line without axes, for KPI cards. */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
	const w = 100;
	const h = 24;
	const d = sparkPath(values, w, h);
	return (
		<svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
			<path d={d} fill="none" stroke={color(0)} strokeWidth={1.5} />
		</svg>
	);
}

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;

/**
 * Donut of shares with the percent in the legend. Hover or focus on a slice, or hover on its
 * legend row, dims the others and writes label, percent and value in the centre; slices are focusable.
 */
export function Donut({ slices, label, size = 120, format = "number", unit }: { slices: readonly BarRow[]; label: string; size?: number; format?: Format; unit?: string }) {
	const [on, setOn] = useState<number | null>(null);
	const arcs = donutArcs(slices);
	const value = (i: number) => `${fmt(slices[i]?.value ?? 0, format)}${unit ? ` ${unit}` : ""}`;
	const a = on === null ? undefined : arcs[on];
	return (
		<figure className="ca-chart ca-donut">
			<svg viewBox="0 0 100 100" width={size} height={size} role="group" aria-label={label}>
				<circle cx={50} cy={50} r={DONUT_R} fill="none" stroke={MUTED} strokeOpacity={0.2} strokeWidth={14} />
				{arcs.map((s, i) => (
					<circle
						key={s.label}
						cx={50}
						cy={50}
						r={DONUT_R}
						fill="none"
						stroke={color(i)}
						strokeWidth={14}
						strokeDasharray={s.dasharray}
						strokeDashoffset={s.dashoffset}
						transform="rotate(-90 50 50)"
						opacity={on === null || on === i ? 1 : 0.35}
						tabIndex={0}
						role="img"
						aria-label={`${s.label}: ${pct(s.share)}, ${value(i)}`}
						onPointerEnter={() => setOn(i)}
						onPointerLeave={() => setOn(null)}
						onFocus={() => setOn(i)}
						onBlur={() => setOn(null)}
					/>
				))}
				{a && on !== null && (
					<g aria-hidden="true" className="ca-donut-centre" textAnchor="middle">
						<text x={50} y={41} fontSize={8}>
							{a.label.length > 14 ? `${a.label.slice(0, 13)}...` : a.label}
						</text>
						<text x={50} y={54} fontSize={12} fontWeight={600} className="ca-donut-pct">
							{pct(a.share)}
						</text>
						<text x={50} y={65} fontSize={8}>
							{value(on)}
						</text>
					</g>
				)}
			</svg>
			<figcaption className="ca-legend">
				{slices.map((s, i) => (
					<span key={s.label} data-on={on === i ? "true" : undefined} onPointerEnter={() => setOn(i)} onPointerLeave={() => setOn(null)}>
						<span aria-hidden className="ca-swatch" style={{ background: color(i) }} />
						{s.label}
						{arcs[i] && <span className="ca-legend-pct">{pct(arcs[i].share)}</span>}
					</span>
				))}
			</figcaption>
		</figure>
	);
}

function Legend({ keys }: { keys: readonly string[] }) {
	return (
		<figcaption className="ca-legend">
			{keys.map((k, i) => (
				<span key={k}>
					<span aria-hidden className="ca-swatch" style={{ background: color(i) }} />
					{k}
				</span>
			))}
		</figcaption>
	);
}

