/** Pure chart geometry and number formatting shared by the admin chart kit and the server renderer. No DOM, no React. */

import { formatAmount } from "../core/currency.js";

/** `money:<ISO code>` prints an amount with its code (`1,234.50 USD`). */
export type Format = "number" | "percent" | "duration" | "decimal" | "text" | `money:${string}`;

/** Width of every chart's view box. */
export const W = 600;
export const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#7c3aed", "#0891b2", "#64748b"];
export const color = (i: number) => `var(--ca-series-${i + 1}, ${COLORS[i % COLORS.length]})`;
export const MUTED = "var(--ca-muted, #94a3b8)";
export const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

const nf = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Rates are fractions (0.25 = 25 %), durations seconds. */
export function fmt(v: unknown, f: Format = "number"): string {
	if (v === null || v === undefined || v === "") return "-";
	if (f === "text" || typeof v !== "number") return String(v);
	if (f.startsWith("money:")) return formatAmount(v, f.slice(6));
	switch (f) {
		case "percent":
			return `${(v * 100).toFixed(1)}%`;
		case "duration": {
			const s = Math.round(v);
			return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
		}
		case "decimal":
			return v.toFixed(2);
		default:
			return Math.abs(v) >= 100_000 ? compact.format(v) : nf.format(v);
	}
}

export interface LineScale {
	top: number;
	bottom: number;
	max: number;
	/** Width of one bucket's hover band. */
	step: number;
	x(i: number): number;
	y(v: number | null): number;
}

/** x and y scales of a line chart of `n` points; the y axis starts at 0 and ends at the largest value (at least 1). */
/** `unit`: viewBox units per pixel (the admin scales paddings with the rendered width); 1 keeps the plain viewBox. */
/** `inset`: viewBox units kept free left and right of the points, the gutters of the y axis labels. */
export function lineScale(n: number, values: ReadonlyArray<number | null>, height: number, unit = 1, inset: { left?: number; right?: number } = {}): LineScale {
	const top = 16 * unit;
	const bottom = height - 20 * unit;
	const max = Math.max(1, ...values.map((v) => v ?? 0));
	const l = inset.left ?? 0;
	const w = W - l - (inset.right ?? 0);
	return {
		top,
		bottom,
		max,
		step: n <= 1 ? w : w / (n - 1),
		x: (i) => r1(l + (n <= 1 ? w / 2 : (i / (n - 1)) * w)),
		y: (v) => r1(bottom - ((v ?? 0) / max) * (bottom - top)),
	};
}

/** The smallest of 1, 2, 2.5 or 5 times a power of ten at or above `v` (1 for 0 or less), so an axis ends on a round value. */
export function niceMax(v: number): number {
	if (!(v > 0)) return 1;
	const e = 10 ** Math.floor(Math.log10(v));
	const f = v / e;
	return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

/** Scale family of a format: series of one family can share an axis. */
export const formatFamily = (f: Format): string => (f === "number" || f === "text" ? "count" : f);

export interface AxisScale {
	/** Value at the bottom (top when inverted) and at the other end of the plot. */
	min: number;
	max: number;
	invert: boolean;
	/** The three gridline values, bottom to top on screen. */
	ticks: [number, number, number];
	y(v: number | null): number;
}

/**
 * One y axis over `values`: 0 (or a nice minimum below a negative value, such as a net revenue after refunds) to a
 * nice maximum; `invert` (Search position) runs 1 at the top to the nice maximum at the bottom, so better positions sit higher.
 */
export function axisScale(values: ReadonlyArray<number | null>, top: number, bottom: number, invert = false): AxisScale {
	const low = Math.min(0, ...values.map((v) => v ?? 0));
	const min = invert ? 1 : low < 0 ? -niceMax(-low) : 0;
	const top0 = niceMax(Math.max(0, ...values.map((v) => v ?? 0)));
	const max = invert ? Math.max(2, top0) : top0;
	const mid = min + (max - min) / 2;
	const frac = (v: number) => (v - min) / (max - min);
	return {
		min,
		max,
		invert,
		ticks: invert ? [max, mid, min] : [min, mid, max],
		y: (v) => r1(invert ? top + frac(v ?? min) * (bottom - top) : bottom - frac(v ?? 0) * (bottom - top)),
	};
}

/** Short tick label: compact counts ("9.2k"), whole percents, durations as `fmt`, money without its code (the code is in the axis caption). */
export function fmtTick(v: number, f: Format): string {
	if (f === "percent") return `${r1(v * 100)}%`;
	if (f === "duration") return fmt(v, f);
	if (f === "decimal") return String(r1(v));
	return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

/** Up to `count` evenly spread bucket indexes of `n` buckets, first and last included. */
export function tickIndexes(n: number, count: number): number[] {
	if (n <= 0) return [];
	if (n <= count) return Array.from({ length: n }, (_, i) => i);
	return [...new Set(Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / Math.max(1, count - 1))))];
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BUCKET_RE = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?$/;

/**
 * A bucket key as text. `long`: "Mon 9 Mar 2026", "9 Mar 2026, 14:00", "Week of 9 Mar 2026"; short (axis
 * ticks): "9 Mar" or "14:00". Keys that are not dates come back unchanged.
 */
export function bucketText(t: string, gran: "hour" | "day" | "week" = "day", long = true): string {
	const m = BUCKET_RE.exec(t);
	if (!m) return t;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	const day = `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
	if (!long) return m[4] && gran === "hour" ? (m[4] === "00:00" ? day : m[4]) : day;
	if (m[4]) return `${day} ${m[1]}, ${m[4]}`;
	return gran === "week" ? `Week of ${day} ${m[1]}` : `${DOW[d.getUTCDay()]} ${day} ${m[1]}`;
}

/** A day range as "15 Feb to 28 Feb" (the year only when the two differ from each other). */
export function rangeText(from: string, to: string): string {
	const a = bucketText(from, "day", false);
	const b = bucketText(to, "day", false);
	return from.slice(0, 4) === to.slice(0, 4) ? `${a} to ${b}` : `${a} ${from.slice(0, 4)} to ${b} ${to.slice(0, 4)}`;
}

/** Marker shape per series slot, so a line is told apart by more than its colour: circle, square, triangle, diamond. */
export function shapePath(slot: number, cx: number, cy: number, r: number): string {
	const p = (x: number, y: number) => `${r1(cx + x)} ${r1(cy + y)}`;
	switch (slot % 4) {
		case 1:
			return `M${p(-r * 0.85, -r * 0.85)} H${r1(cx + r * 0.85)} V${r1(cy + r * 0.85)} H${r1(cx - r * 0.85)} Z`;
		case 2:
			return `M${p(0, -r)} L${p(r, r * 0.8)} L${p(-r, r * 0.8)} Z`;
		case 3:
			return `M${p(0, -r)} L${p(r, 0)} L${p(0, r)} L${p(-r, 0)} Z`;
		default:
			return `M${p(-r, 0)} A${r1(r)} ${r1(r)} 0 1 0 ${p(r, 0)} A${r1(r)} ${r1(r)} 0 1 0 ${p(-r, 0)} Z`;
	}
}

/** Series token index of each slot: blue, emerald, orange, purple (pink is left out, too close to orange). */
export const SLOT_TOKENS = [0, 1, 2, 4] as const;
export const slotColor = (slot: number) => color(SLOT_TOKENS[slot % 4] as number);

/** Path of a line; null values break the line instead of drawing a false zero. */
export function linePath(vals: ReadonlyArray<number | null>, s: Pick<LineScale, "x" | "y">): string {
	return vals
		.map((v, i) => (v === null ? "" : `${i && vals[i - 1] !== null ? "L" : "M"}${s.x(i)} ${s.y(v)}`))
		.filter(Boolean)
		.join(" ");
}

/** Closed area under a line path of `n` points (only drawn when no value is null). */
export const areaPath = (line: string, n: number, s: Pick<LineScale, "x" | "bottom">): string => `${line} L${s.x(n - 1)} ${s.bottom} L${s.x(0)} ${s.bottom} Z`;

/** Bar length of `value` scaled to the largest value (at least 1) over `width`. */
export const barWidth = (value: number, max: number, width = W): number => r1((value / Math.max(1, max)) * width);

export interface StackRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Vertical stacked bars: per entry, one rect per part from the bottom up. */
export function stackedRects(data: ReadonlyArray<{ parts: readonly number[] }>, height: number): StackRect[][] {
	const max = Math.max(1, ...data.map((d) => d.parts.reduce((a, b) => a + b, 0)));
	const bw = data.length ? W / data.length : W;
	const plot = height - 4;
	return data.map((d, i) => {
		let acc = 0;
		return d.parts.map((p) => {
			const hgt = (p / max) * plot;
			acc += hgt;
			return { x: r1(i * bw + bw * 0.1), y: r1(height - acc), width: r1(bw * 0.8), height: r1(hgt) };
		});
	});
}

/** Sparkline path in a `w` by `h` box. */
export function sparkPath(values: readonly number[], w = 100, h = 24): string {
	const max = Math.max(1, ...values);
	return values.map((v, i) => `${i ? "L" : "M"}${r1(values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w)} ${r1(h - 1 - (v / max) * (h - 2))}`).join(" ");
}

export const DONUT_R = 40;

export interface Arc {
	label: string;
	/** Fraction of the total. */
	share: number;
	dasharray: string;
	dashoffset: number;
}

/**
 * Donut slices as circle stroke dashes (radius DONUT_R in a 100 by 100 box); empty when the total is 0.
 * Each slice is one dash from its start to its end, and the gap is longer than the circle, so the pattern never
 * repeats. Slice boundaries are rounded down to 0.01 and the next slice starts where the last one ended, so the
 * last dash cannot run past the end of the circle and wrap into a sliver at 12 o'clock.
 */
export function donutArcs(slices: ReadonlyArray<{ label: string; value: number }>): Arc[] {
	const total = slices.reduce((a, s) => a + s.value, 0);
	if (total <= 0) return [];
	const c = 2 * Math.PI * DONUT_R;
	const down = (v: number) => Math.floor(v * 100) / 100;
	const gap = Math.ceil(c) + 1;
	let sum = 0;
	let start = 0;
	return slices.map((s) => {
		sum += s.value;
		const end = down((sum / total) * c);
		const len = Math.max(0, end - start);
		const arc = { label: s.label, share: s.value / total, dasharray: `${r2(len)} ${gap}`, dashoffset: r2(-start) };
		start = end;
		return arc;
	});
}

/** At most `max` slices: the rest is folded into one "other" slice. */
export function foldSlices(rows: ReadonlyArray<{ label: string; value: number }>, max = 8): Array<{ label: string; value: number }> {
	if (rows.length <= max) return [...rows];
	const rest = rows.slice(max - 1).reduce((a, r) => a + r.value, 0);
	return [...rows.slice(0, max - 1), { label: "other", value: rest }];
}

/** Marker groups closer than this many view box units merge into one cluster. */
export const MARKER_MIN_GAP = 10;

export interface MarkerGroup<M> {
	/** Mean x of the merged buckets. */
	x: number;
	count: number;
	markers: M[];
	/** Bucket keys in x order. */
	ts: string[];
}

/**
 * Markers grouped per bucket, then adjacent buckets closer than `gap` merged into one cluster drawn at
 * their mean x. Markers whose bucket is not on the chart (`xOf` undefined) are dropped.
 */
export function markerGroups<M extends { t: string }>(markers: readonly M[], xOf: (t: string) => number | undefined, gap = MARKER_MIN_GAP): MarkerGroup<M>[] {
	const buckets = new Map<string, { x: number; markers: M[] }>();
	for (const m of markers) {
		const x = xOf(m.t);
		if (x === undefined) continue;
		const b = buckets.get(m.t);
		if (b) b.markers.push(m);
		else buckets.set(m.t, { x, markers: [m] });
	}
	const out: Array<{ xs: number[]; ts: string[]; markers: M[] }> = [];
	for (const [t, b] of [...buckets].sort((p, q) => p[1].x - q[1].x)) {
		const last = out[out.length - 1];
		if (last && b.x - (last.xs[last.xs.length - 1] as number) < gap) {
			last.xs.push(b.x);
			last.ts.push(t);
			last.markers.push(...b.markers);
		} else out.push({ xs: [b.x], ts: [t], markers: [...b.markers] });
	}
	return out.map((g) => ({ x: r1(g.xs.reduce((s, v) => s + v, 0) / g.xs.length), count: g.markers.length, markers: g.markers, ts: g.ts }));
}

/** "2026-03-10" or "2026-03-10 to 2026-03-12" for a cluster. */
export const groupDate = (g: Pick<MarkerGroup<unknown>, "ts">): string => (g.ts.length > 1 ? `${g.ts[0]} to ${g.ts[g.ts.length - 1]}` : (g.ts[0] ?? ""));
export const annotationCount = (n: number) => `${n} annotation${n === 1 ? "" : "s"}`;
