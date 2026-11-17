/**
 * The target KPI of an annotation and the verdict of its impact row (Annotations page, `annotation_impacts`).
 * One target per annotation, in the vocabulary of the `impact` report: `{ report, metric, params? }`. Pure and
 * free of host code: the config route, the agent API, the report and the admin bundle share it.
 */
import { z } from "zod";
import { LOWER_IS_BETTER } from "../charts/change.js";
import { PROP_KEY_RE } from "../query/filters.js";
import { COUNT_METRICS, IMPACT_KEY_DIM, IMPACT_METRICS, IMPACT_REPORTS, type ImpactReport } from "../query/reports/seo-copy.js";
import type { Scope } from "./scope.js";

export interface Target {
	report: ImpactReport;
	metric: string;
	/** `key`: the row of a row report (a channel, a page, an event, a query); `goal`: a goal id; the rest pass to the target report. */
	params?: { key?: string; goal?: string; source?: "all" | "google" | "bing"; prop?: string; currency?: string };
}

export const TARGET_MESSAGES = {
	metric: "This metric is not offered for that report.",
	key: "Pick the row to measure (a channel, a page, an event or a query).",
	goal: "Pick a goal.",
} as const;

/** Write and read schema of `target`. Refinements only (no transform), so the MCP tool input stays JSON Schema representable. */
export const TargetSchema: z.ZodType<Target> = z
	.object({
		report: z.enum(IMPACT_REPORTS),
		metric: z.string().regex(/^[a-z0-9_]{1,40}$/),
		params: z
			.object({
				key: z.string().min(1).max(512).optional(),
				goal: z.string().min(1).max(128).optional(),
				source: z.enum(["all", "google", "bing"]).optional(),
				prop: z.string().regex(PROP_KEY_RE).optional(),
				currency: z.string().min(3).max(8).optional(),
			})
			.strict()
			.optional(),
	})
	.strict()
	.superRefine((t, ctx) => {
		if (!IMPACT_METRICS[t.report].includes(t.metric)) ctx.addIssue({ code: "custom", path: ["metric"], message: TARGET_MESSAGES.metric });
		if (t.report === "goals" && !t.params?.goal) ctx.addIssue({ code: "custom", path: ["params", "goal"], message: TARGET_MESSAGES.goal });
		else if (IMPACT_KEY_DIM[t.report] && !t.params?.key) ctx.addIssue({ code: "custom", path: ["params", "key"], message: TARGET_MESSAGES.key });
	});

export const isSearchTarget = (t: Pick<Target, "report">) => t.report.startsWith("search_");

/** No target set: visitors of the scope, or Search clicks for a query scoped annotation while Search is connected. */
export function defaultTarget(scope: Scope | undefined, searchOn: boolean): Target {
	return searchOn && scope?.query?.length ? { report: "search_overview", metric: "clicks" } : { report: "overview", metric: "visitors" };
}

// ── Verdict of one row ──────────────────────────────────────────────────────

export type Verdict = "up" | "down" | "flat" | "too_early" | "no_data";
export const VERDICT_WORDS: Record<Verdict, string> = { up: "Up", down: "Down", flat: "Flat", too_early: "Too early", no_data: "Not enough data" };

/** A count pair below this many (before plus after) is not enough data. */
export const MIN_COUNT = 20;
/** A rate whose smaller denominator (sessions, impressions, orders) is below this is not enough data. */
export const MIN_BASE = 50;
/** A rate or average that moved less than this share of its before value is flat. */
export const FLAT_SHARE = 0.05;

/** The fields of an impact answer the verdict reads. */
export interface ImpactFigures {
	window: number;
	days_after: number;
	before?: number | null;
	after?: number | null;
	notable?: boolean;
	measured?: { before: number | null; after: number | null };
}

/**
 * Up, Down or Flat from equal complete windows; Too early while the after window is short; Not enough data
 * when a value is missing or the base is small. Counts use the `notable` noise rule of the impact report,
 * rates and averages a 5 percent band. The verdict is the raw direction: `good` says whether it is good news.
 */
export function verdictOf(metric: string, f: ImpactFigures): { verdict: Verdict; good: boolean | null } {
	if (f.days_after < f.window) return { verdict: "too_early", good: null };
	const b = f.before ?? null;
	const a = f.after ?? null;
	if (b === null || a === null) return { verdict: "no_data", good: null };
	let flat: boolean;
	if (COUNT_METRICS.has(metric)) {
		if (a + b < MIN_COUNT) return { verdict: "no_data", good: null };
		flat = f.notable === false || a === b;
	} else {
		const base = f.measured ? Math.min(f.measured.before ?? 0, f.measured.after ?? 0) : null;
		if (base !== null && base < MIN_BASE) return { verdict: "no_data", good: null };
		flat = b === 0 ? a === 0 : Math.abs(a - b) / Math.abs(b) < FLAT_SHARE;
	}
	if (flat) return { verdict: "flat", good: null };
	const verdict = a > b ? "up" : "down";
	return { verdict, good: (verdict === "up") !== LOWER_IS_BETTER.has(metric) };
}

// ── Overlap ─────────────────────────────────────────────────────────────────

/**
 * Two scopes can measure the same traffic: either is site-wide, or both name the same rule. Pattern rules of
 * different values are treated as separate (a shared prefix is the common case, and it shares the rule).
 */
export function scopesOverlap(a: Scope | undefined | null, b: Scope | undefined | null): boolean {
	if (!a || !b) return true;
	const rules = (s: Scope) => (["host", "path", "query"] as const).flatMap((k) => (s[k] ?? []).map((r) => `${k}\u0000${r.op}\u0000${r.value}`));
	const ra = rules(a);
	if (!ra.length) return true;
	const rb = new Set(rules(b));
	return !rb.size || ra.some((r) => rb.has(r));
}
