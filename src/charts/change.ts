/**
 * One change description for every figure with a comparison: admin KPI cards, table change cells, the chart
 * tooltip, dashboard tiles, the share page and the email. Pure, no DOM: the server renderers import it too.
 *
 * Classes, from the metric and its format:
 * - count (`number`): relative change, then the absolute difference and the previous value (`+12.0%`, `+231, from 1,925`).
 * - rate (`percent`, rates and shares): the difference in percentage points (`+1.2 pp`, `from 41.0%`), no relative percent.
 * - duration, decimal and money: relative change, then the difference in the metric's own unit; money stays in
 *   the one currency of the format (a report answers in one currency, amounts are never converted or mixed).
 * - position (Search): the difference in positions with its judgement (`0.4 better`, `from 8.2`), no percent.
 * - points (the Search Satisfaction score, a signed figure): the difference in points (`+4 points`, `+1 point`,
 *   `from 20`), never a relative percent, which means nothing for a value that can be 0 or negative.
 * - Rates and points take the difference of the two figures as printed, so the change always matches them.
 *
 * Judgement: the arrow shows the raw direction; better, worse or neutral comes from `LOWER_IS_BETTER` and
 * `NO_JUDGEMENT` below. Every other metric is higher-is-better (traffic volume, engagement, revenue, orders).
 */
import { fmt, type Format } from "./geometry.js";

/** Metrics where a fall is good news. */
export const LOWER_IS_BETTER: ReadonlySet<string> = new Set([
	"bounce_rate",
	"exit_rate",
	"position",
	"pct_short",
	"pct_bad",
	"pogo_stick_rate",
	"returned_from_search_rate",
	"search_reentry_rate",
	"back_nav_rate",
	"refunds",
	"drop_off",
	"est_lost_revenue",
]);

/**
 * Metrics with no better or worse: a live count ("Active now" is not a period figure) and the measured share
 * of Satisfaction (how much of the traffic the rates rest on, a coverage figure, not an outcome).
 */
export const NO_JUDGEMENT: ReadonlySet<string> = new Set(["realtime", "measured_rate"]);

/** A count whose previous value is under this is small numbers: the change shows muted. */
export const SMALL_COUNT = 30;
/** A rate, average or amount resting on fewer sessions (or impressions) than this is small numbers. */
export const SMALL_BASE = 100;

export const SMALL_NOTE = `Small numbers: the comparison rests on under ${SMALL_COUNT} for a count or under ${SMALL_BASE} sessions for a rate or average, so a large change can be chance.`;
export const MISSING_NOTE = "One of the two periods has no figure for this metric (no data, days not loaded yet, or a source not connected).";

export type ChangeUnit = "percent" | "pp" | "points" | "positions" | "duration" | "decimal" | "count" | `money:${string}`;

export interface Change {
	/** `change` a comparable pair, `new` a previous value of 0, `none` one side missing. */
	kind: "change" | "new" | "none";
	/** Raw direction of the figure (the arrow). */
	direction: "up" | "down" | "flat" | null;
	judgement: "better" | "worse" | "neutral" | null;
	/** Relative change as a fraction; null for rates, positions, a zero or missing base. */
	rel: number | null;
	/** Difference in the metric's unit (fraction points for a rate). */
	abs: number | null;
	unit: ChangeUnit;
	/** The first visible text: `+12.0%`, `+1.2 pp`, `0.4 better`, `No change`, `New`, `No comparison`. */
	label: string;
	/** Second line: absolute difference and the previous value (`+231, from 1,925`). */
	detail: string;
	/** Small numbers: shown without the good or bad colour. */
	muted: boolean;
	/** Why it is muted or missing, for the tooltip. */
	note: string | null;
	/** For screen readers: `up 12.0 percent, better`. */
	words: string;
}

export interface ChangeOpts {
	format: Format;
	/** Sessions (or impressions) behind the previous value of a rate or average: under `SMALL_BASE` mutes it. */
	base?: number | null | undefined;
	lowerIsBetter?: boolean | undefined;
	/** Reason shown when a side is missing; `MISSING_NOTE` otherwise. */
	reason?: string | undefined;
}

export const ARROW = { up: "↑", down: "↓", flat: "→" } as const;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const one = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (r: number) => `${r > 0 ? "+" : r < 0 ? "-" : ""}${one.format(Math.abs(r * 100))}%`;

function unitOf(metric: string, f: Format): ChangeUnit {
	if (metric === "position") return "positions";
	if (f === "percent") return "pp";
	if (f === "points") return "points";
	if (f === "duration" || f === "decimal") return f;
	if (f.startsWith("money:")) return f as ChangeUnit;
	return "count";
}

/** A signed difference in the unit: `+231`, `-12s`, `+0.12`, `+120.00 EUR`, `+1.2 pp`. */
function signed(abs: number, unit: ChangeUnit, f: Format): string {
	const sign = abs > 0 ? "+" : abs < 0 ? "-" : "";
	if (unit === "pp") return `${sign}${Math.abs(abs * 100).toFixed(1)} pp`;
	if (unit === "points") {
		const n = Math.round(Math.abs(abs * 100));
		return `${sign}${n} ${n === 1 ? "point" : "points"}`;
	}
	return `${sign}${fmt(Math.abs(abs), unit === "count" ? "number" : f)}`;
}

/**
 * Change of `metric` from `previous` to `current`. `previous` or `current` missing: `kind: "none"`.
 */
export function describeChange(metric: string, current: unknown, previous: unknown, opts: ChangeOpts): Change {
	const f = opts.format;
	const unit = unitOf(metric, f);
	const cur = num(current);
	// Position 0 means no impressions, not first place.
	const prev = unit === "positions" && num(previous) === 0 ? null : num(previous);
	if (cur === null || prev === null || (unit === "positions" && cur === 0))
		return { kind: "none", direction: null, judgement: null, rel: null, abs: null, unit, label: "No comparison", detail: "", muted: true, note: opts.reason ?? MISSING_NOTE, words: "no comparison" };
	// A rate or score changes by the difference of the two figures as printed (`fmt`), so the sentence never says
	// "No change, from 21" beside a printed 20, nor +0.1 pp between two figures that print alike.
	const printed = (v: number) => (unit === "pp" ? Number.parseFloat(fmt(v, "percent")) : Number(fmt(v, "points")));
	const abs = unit === "pp" || unit === "points" ? (printed(cur) - printed(prev)) / 100 : cur - prev;
	// A change that shows as 0.0 (percent, points or positions) is no change: no arrow, no judgement.
	const shown = unit === "pp" ? abs * 100 : unit === "points" ? Math.round(abs * 100) : unit === "positions" ? abs : prev === 0 ? abs : (abs / Math.abs(prev)) * 100;
	const direction = Math.abs(shown) < 0.05 ? "flat" : abs > 0 ? "up" : "down";
	const lower = opts.lowerIsBetter ?? LOWER_IS_BETTER.has(metric);
	const judgement = direction === "flat" || NO_JUDGEMENT.has(metric) ? "neutral" : (direction === "up") !== lower ? "better" : "worse";
	const small = unit === "count" ? Math.abs(prev) < SMALL_COUNT : opts.base != null && opts.base < SMALL_BASE;
	const from = `from ${fmt(prev, f)}`;
	const base = { direction, judgement, abs, unit, muted: small, note: small ? SMALL_NOTE : null } as const;
	const judged = judgement === "neutral" ? "" : `, ${judgement}`;
	const quiet = small ? ", small numbers" : "";
	if (direction === "flat") return { ...base, kind: "change", rel: unit === "pp" || unit === "points" || unit === "positions" ? null : 0, muted: false, note: null, label: "No change", detail: from, words: "no change" };
	if (unit === "pp") {
		const label = signed(abs, unit, f);
		return { ...base, kind: "change", rel: null, label, detail: from, words: `${direction} ${Math.abs(abs * 100).toFixed(1)} percentage points${judged}${quiet}` };
	}
	if (unit === "points") {
		const label = signed(abs, unit, f);
		return { ...base, kind: "change", rel: null, label, detail: from, words: `${direction} ${label.slice(1)}${judged}${quiet}` };
	}
	if (unit === "positions") {
		const n = Math.abs(abs).toFixed(1);
		return { ...base, kind: "change", rel: null, label: `${n} ${judgement}`, detail: from, words: `${n} positions ${judgement}${quiet}` };
	}
	// Nothing to compare with: "New", shown quietly, never an infinite percent.
	if (prev === 0) return { ...base, kind: "new", rel: null, muted: true, note: null, label: "New", detail: `${signed(abs, unit, f)}, ${from}`, words: "new, previously 0" };
	// Divided by the size of the base, so a negative amount that grows towards zero still reads as up.
	const rel = abs / Math.abs(prev);
	// Small numbers: the plain difference instead of a loud percent (4 to 20 is not "+400%").
	if (small) return { ...base, kind: "change", rel, label: signed(abs, unit, f), detail: from, words: `${direction} ${signed(abs, unit, f).slice(1)}${judged}${quiet}` };
	return { ...base, kind: "change", rel, label: pct(rel), detail: `${signed(abs, unit, f)}, ${from}`, words: `${direction} ${one.format(Math.abs(rel * 100))} percent${judged}` };
}

/** The change as one plain line (email, share page, tooltip): `↑ +12.0% better, +231, from 1,925`; `short` leaves out the detail. */
export function changeText(c: Change, short = false): string {
	if (c.kind === "none") return short ? c.label : `${c.label}: ${c.note ?? MISSING_NOTE}`;
	const word = c.kind === "change" && c.unit !== "positions" && c.judgement !== "neutral" ? ` ${c.judgement}` : "";
	return `${c.direction ? `${ARROW[c.direction]} ` : ""}${c.label}${word}${!short && c.detail ? `, ${c.detail}` : ""}${c.kind === "change" && c.muted ? " (small numbers)" : ""}`;
}

/** Sessions, else impressions, else orders of a previous totals record: what a rate or average rests on. */
export function rateBase(prev: Record<string, unknown> | null | undefined): number | undefined {
	for (const k of ["sessions", "impressions", "orders"]) {
		const v = num(prev?.[k]);
		if (v !== null) return v;
	}
	return undefined;
}
