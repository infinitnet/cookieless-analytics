/** Filter and query model. Every identifier reaching SQL comes from the fixed maps here. */
import { z } from "zod";

export const OPS = ["is", "is_not", "contains", "not_contains", "prefix", "not_prefix", "regex", "not_regex"] as const;
/** Numeric comparison ops: valid on the `revenue` dim only. */
export const NUM_OPS = ["gt", "gte", "lt", "lte"] as const;
export type NumOp = (typeof NUM_OPS)[number];
export type Op = (typeof OPS)[number] | NumOp;
export const NEGATED: ReadonlySet<Op> = new Set(["is_not", "not_contains", "not_prefix", "not_regex"]);

/** Where a dimension lives: session column, hit predicate, or search table column. */
export type DimScope = "session" | "hit" | "search";

export interface DimDef {
	scope: DimScope;
	/** Column of `ca_sessions` (session), entry field (hit, see `entryCols`) or `ca_search_daily` (search). */
	column: string;
	/** Hit kind for hit dims. */
	kind?: "pv" | "ev";
}

/** Traffic dimensions. `goal` and `event_prop` are expanded by the compiler. */
export const TRAFFIC_DIMS = {
	page: { scope: "hit", column: "path", kind: "pv" },
	entry: { scope: "session", column: "entry_path" },
	exit: { scope: "session", column: "exit_path" },
	channel: { scope: "session", column: "channel" },
	source: { scope: "session", column: "source" },
	ref_host: { scope: "session", column: "ref_host" },
	utm_source: { scope: "session", column: "utm_source" },
	utm_medium: { scope: "session", column: "utm_medium" },
	utm_campaign: { scope: "session", column: "utm_campaign" },
	utm_term: { scope: "session", column: "utm_term" },
	utm_content: { scope: "session", column: "utm_content" },
	host: { scope: "session", column: "host" },
	country: { scope: "session", column: "country" },
	region: { scope: "session", column: "region" },
	device: { scope: "session", column: "device" },
	browser: { scope: "session", column: "browser" },
	os: { scope: "session", column: "os" },
	lang: { scope: "session", column: "lang" },
	event: { scope: "hit", column: "name", kind: "ev" },
	event_prop: { scope: "hit", column: "props", kind: "ev" },
	goal: { scope: "hit", column: "path" },
} as const satisfies Record<string, DimDef>;

/** Dimensions of the search reports: `page` is the normalized page key. */
export const SEARCH_DIMS = {
	page: { scope: "search", column: "page_key" },
	query: { scope: "search", column: "query" },
	country: { scope: "search", column: "country" },
	device: { scope: "search", column: "device" },
	source: { scope: "search", column: "source" },
} as const satisfies Record<string, DimDef>;

/**
 * Revenue dimensions: `currency` (is, is_not) and `revenue` (gt, gte, lt, lte, `prop` the
 * currency). Both are session semi-joins over revenue hits, compiled apart from the maps above.
 */
export const REVENUE_DIMS = ["currency", "revenue"] as const;
export type RevenueDim = (typeof REVENUE_DIMS)[number];
/** `params.dim` of `revenue_breakdown`; `campaign` is the `utm_campaign` field. */
export const REVENUE_BREAKDOWN_DIMS = ["channel", "source", "campaign", "entry", "page", "country", "device", "goal", "event"] as const;
/** `params.by` of the `links` report (Links convention). */
export const LINK_BY = ["link", "place", "page", "channel", "source", "campaign", "entry", "country", "device"] as const;
export const REVENUE_VALUE_RE = /^\d{1,10}(\.\d{1,3})?$/;

export const DIM_NAMES = [...new Set([...Object.keys(TRAFFIC_DIMS), ...REVENUE_DIMS, ...Object.keys(SEARCH_DIMS)])] as [string, ...string[]];
export type Dim = keyof typeof TRAFFIC_DIMS | keyof typeof SEARCH_DIMS | RevenueDim;

export const PROP_KEY_RE = /^[A-Za-z0-9_]{1,32}$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Range cap for the admin route (raw and rollup windows are bounded separately). */
export const MAX_RANGE_DAYS = 1000;
export const MAX_FILTERS = 20;
export const MAX_VALUES = 500;

export const FilterSchema = z
	.object({
		dim: z.enum(DIM_NAMES as [Dim, ...Dim[]]),
		op: z.enum([...OPS, ...NUM_OPS]),
		values: z.array(z.string().min(1).max(512)).min(1).max(MAX_VALUES),
		prop: z.string().regex(PROP_KEY_RE).optional(),
	})
	.strict()
	// `revenue` takes an optional currency in `prop`; its op and value rules are checked by `validateFilters` (typed `invalid_filter`).
	.refine((f) => f.dim === "revenue" || (f.dim === "event_prop") === (f.prop !== undefined), { message: "prop is required for event_prop and only allowed there", path: ["prop"] });
export type Filter = z.infer<typeof FilterSchema>;

const Day = z.string().regex(DAY_RE);

export const QuerySchema = z
	.object({
		from: Day,
		to: Day,
		filters: z.array(FilterSchema).max(MAX_FILTERS).default([]),
		segment: z.string().min(1).max(128).optional(),
		compare: z.enum(["previous", "year", "none", "segment"]).default("none"),
		/** `compare: "segment"`: the segment id of side B, same range. */
		compareSegment: z.string().min(1).max(128).optional(),
		granularity: z.enum(["auto", "hour", "day", "week"]).default("auto"),
		site: z.string().regex(/^[a-z0-9-]{1,32}$/).optional(),
	})
	.strict()
	.refine((q) => (q.compare === "segment") === (q.compareSegment !== undefined), { message: "compareSegment is required for compare segment and only allowed there", path: ["compareSegment"] })
	.refine((q) => q.from <= q.to, { message: "from must not be after to", path: ["from"] })
	.refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < MAX_RANGE_DAYS, { message: `range is longer than ${MAX_RANGE_DAYS} days`, path: ["to"] });
export type Query = z.output<typeof QuerySchema>;
export type QueryInput = z.input<typeof QuerySchema>;

/** Goal definition from the `goals` collection. */
export const GoalSchema = z.object({
	name: z.string().min(1).max(64),
	type: z.enum(["page", "event", "outbound"]),
	match: z.enum(["is", "prefix", "regex", "contains"]),
	value: z.string().min(1).max(512),
	props: z.record(z.string().regex(PROP_KEY_RE), z.string().max(128)).optional(),
	active: z.boolean().optional(),
});
export type Goal = z.infer<typeof GoalSchema>;

/** One funnel step: a page or an event, matched like a goal. */
export const FunnelStepSchema = z.object({
	type: z.enum(["page", "event"]),
	match: z.enum(["is", "prefix", "regex"]).default("is"),
	value: z.string().min(1).max(512),
	label: z.string().max(64).optional(),
});
export type FunnelStep = z.output<typeof FunnelStepSchema>;
export const FunnelStepsSchema = z.array(FunnelStepSchema).min(2).max(6);
/** How steps chain within a session; a record without `mode` is sequential. */
export const FUNNEL_MODES = ["sequential", "strict", "flexible"] as const;
export type FunnelMode = (typeof FUNNEL_MODES)[number];
