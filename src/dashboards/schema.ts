/** Dashboard and template records and their limits. No report SQL is imported, so the admin bundle can use it. */
import { z } from "zod";
import { PRESETS } from "../core/presets.js";
import { isCurrency } from "../core/currency.js";
import { type Format, formatFamily } from "../charts/geometry.js";
import { FilterSchema, LINK_BY, REVENUE_BREAKDOWN_DIMS } from "../query/filters.js";
import type { ReportName } from "../query/reports/index.js";
import { bandSuffix, IMPACT_METRICS, IMPACT_REPORTS, IMPACT_WINDOWS, POSITION_BANDS } from "../query/reports/seo-copy.js";

import { MAIL_MAX_RECIPIENTS, MAX_RECORD_BYTES, MAX_TILES } from "./limits.js";

export * from "./limits.js";

export const TILE_KIND_NAMES = ["kpi", "line", "area", "bars", "donut", "table", "stacked"] as const;
export type TileKind = (typeof TILE_KIND_NAMES)[number];

const SESSION_METRICS = ["visitors", "sessions", "pageviews", "views_per_session", "bounce_rate", "engaged_rate", "avg_duration"];
const SAT_RATES = ["pct_long", "pct_short", "pct_bad", "pogo_stick_rate", "returned_from_search_rate", "sessions", "measured"];
const SEARCH_METRICS = ["clicks", "impressions", "ctr", "position"];
const BREAKDOWN: readonly TileKind[] = ["bars", "donut", "table"];

/** Which kinds each tile report accepts. Every report but `dimension_values` and `search_page_queries`. */
export const TILE_KINDS = {
	overview: ["kpi"],
	timeseries: ["line", "area"],
	satisfaction: ["kpi", ...BREAKDOWN],
	satisfaction_series: ["line", "area"],
	search_overview: ["kpi", "line", "area"],
	goals: ["kpi", ...BREAKDOWN],
	pages: BREAKDOWN,
	entry_pages: BREAKDOWN,
	exit_pages: BREAKDOWN,
	not_found: BREAKDOWN,
	channels: BREAKDOWN,
	sources: BREAKDOWN,
	campaigns: BREAKDOWN,
	ai_referrals: BREAKDOWN,
	countries: BREAKDOWN,
	regions: BREAKDOWN,
	devices: BREAKDOWN,
	browsers: BREAKDOWN,
	os: BREAKDOWN,
	languages: BREAKDOWN,
	events: BREAKDOWN,
	event_props: BREAKDOWN,
	funnels: BREAKDOWN,
	outbound: BREAKDOWN,
	downloads: BREAKDOWN,
	forms: BREAKDOWN,
	scroll: BREAKDOWN,
	search_queries: BREAKDOWN,
	search_pages: BREAKDOWN,
	search_countries: BREAKDOWN,
	search_devices: BREAKDOWN,
	search_cannibalization: ["kpi", "table"],
	search_cannibalization_pages: ["table"],
	search_position_bands: ["kpi", ...BREAKDOWN],
	search_position_bands_series: ["stacked", "line", "area"],
	search_position_moves: ["kpi", "table"],
	search_striking_distance: ["table"],
	search_movers: ["table"],
	search_decay: ["table"],
	traffic_movers: ["table"],
	traffic_decay: ["table"],
	impact: ["kpi", "line"],
	revenue: ["kpi"],
	revenue_series: ["line", "area"],
	revenue_breakdown: BREAKDOWN,
	// The two drill-downs are not tile reports.
	journey_paths: ["table"],
	collections: BREAKDOWN,
	site_search: ["table"],
	// Links convention.
	links: ["bars", "table"],
	// `revenue_orders` is not a tile: single orders stay off shared links and emails.
} as const satisfies Record<
	Exclude<ReportName, "dimension_values" | "search_page_queries" | "search_cannibalization_page" | "search_cannibalization_query" | "journey_next" | "journey_prev" | "sites_summary" | "revenue_orders" | "annotation_impacts">,
	readonly TileKind[]
>;

export type TileReport = keyof typeof TILE_KINDS;
export const TILE_REPORTS = Object.keys(TILE_KINDS) as [TileReport, ...TileReport[]];
export const isSearchReport = (r: string) => r.startsWith("search_");
/** A tile reads Search data: a search report, or `impact` over a search report. */
export const tileNeedsSearch = (t: { report: string; params?: { report?: string | undefined } | undefined }) => isSearchReport(t.report) || (t.report === "impact" && isSearchReport(t.params?.report ?? ""));

/** Metric keys a `kpi`, `line` or `area` tile may show, per report (keys of the report's totals, series or goal row). */
export const TILE_METRICS: Partial<Record<TileReport, readonly string[]>> = {
	overview: SESSION_METRICS,
	timeseries: SESSION_METRICS,
	satisfaction: ["sessions", "measured", "measured_rate", "avg_duration", "avg_engaged", "pct_long", "pct_short", "pct_bad", "pogo_stick_rate", "returned_from_search_rate", "search_reentry_rate", "back_nav_rate", "score"],
	satisfaction_series: SAT_RATES,
	search_overview: SEARCH_METRICS,
	goals: ["completions", "converting", "conversion_rate"],
	search_cannibalization: ["cannibalized_queries", "cannibalized_impressions", "visible_share"],
	search_position_bands: [...POSITION_BANDS.map((b) => `queries_${bandSuffix(b)}`), "impressions_1_3", "share_1_3", "ctr_1_3"],
	search_position_bands_series: POSITION_BANDS.map((b) => `band_${bandSuffix(b)}`),
	search_position_moves: ["moved_up", "moved_down", "unchanged", "new", "lost"],
	revenue: ["revenue", "refunds", "net_revenue", "orders", "aov", "revenue_per_visitor", "revenue_per_session", "paying_sessions"],
	revenue_series: ["revenue", "refunds", "net_revenue", "orders", "aov"],
};

/** Amount keys: shown with their currency code, never as a bare number. */
export const MONEY_KEYS: ReadonlySet<string> = new Set(["revenue", "aov", "revenue_per_visitor", "revenue_per_session"]);

/** Display format of a metric key. */
export function metricFormat(key: string): Format {
	if (key === "avg_duration" || key === "avg_time" || key === "avg_visible" || key === "avg_engaged") return "duration";
	if (key === "position" || key === "views_per_session") return "decimal";
	if (key === "ctr" || key === "share" || key.endsWith("_rate") || key.startsWith("pct_") || key.endsWith("_share") || key.endsWith("_pct") || key.startsWith("share_") || key.startsWith("ctr_") || key.startsWith("ctr")) return "percent";
	if (key.startsWith("position")) return "decimal";
	return "number";
}

/** Scale family of a series metric: lines of one family share an axis; position has its own, 1 at the top. */
export const metricFamily = (key: string): string => (key === "position" ? "rank" : MONEY_KEYS.has(key) ? "money" : formatFamily(metricFormat(key)));

/** Most metrics of one line or area tile. */
export const MAX_TILE_METRICS = 4;
/** Most figure columns a table tile can name (the name column comes first). */
export const MAX_TILE_COLUMNS = 6;

/** Why a metric list cannot be one line or area tile, else null. */
export function tileMetricsProblem(list: readonly string[]): string | null {
	if (!list.length) return "Choose at least one metric.";
	if (list.length > MAX_TILE_METRICS) return `Up to ${MAX_TILE_METRICS} metrics at once.`;
	if (new Set(list.map(metricFamily)).size > 2) return "These metrics need more than two scales.";
	return null;
}

/** Optional `Tile.params` keys per report; `source`, `goal`, `funnel`, `event` and `prop` keep their own rules. */
export const TILE_PARAMS: Partial<Record<TileReport, readonly string[]>> = {
	search_cannibalization: ["minImpressions", "minShare", "includeBrand"],
	search_cannibalization_pages: ["minImpressions", "minShare", "includeBrand"],
	search_position_bands: ["dim"],
	search_position_bands_series: ["dim", "metric"],
	search_position_moves: ["dim", "minImpressions", "list"],
	search_striking_distance: ["minImpressions", "includeBrand"],
	search_movers: ["dim", "direction", "metric", "minImpressions"],
	search_decay: ["minImpressions"],
	traffic_movers: ["direction", "minImpressions"],
	traffic_decay: ["minImpressions"],
	impact: ["annotation", "kind", "at", "window", "report", "key", "scope", "path", "currency"],
	revenue: ["currency"],
	revenue_series: ["currency"],
	revenue_breakdown: ["currency", "dim"],
	journey_paths: ["entry"],
	links: ["by", "slug"],
	satisfaction: ["rank"],
};
const SEO_PARAM_KEYS = ["by", "rank", "slug", "entry", "currency", "list", "dim", "direction", "metric", "minImpressions", "minShare", "includeBrand", "annotation", "kind", "at", "window", "report", "key", "scope", "path"] as const;

export const Preset = z.enum(PRESETS.map((p) => p[0]) as [(typeof PRESETS)[number][0], ...(typeof PRESETS)[number][0][]]);
/** A segment, goal or funnel reference: a record id in a dashboard, a record name in a template. */
const Ref = z.string().min(1).max(128);
const ColumnKey = z.string().regex(/^[a-z0-9_]{1,32}$/);

export const TileSchema = z
	.object({
		id: z.string().regex(/^[a-z0-9]{6}$/),
		report: z.enum(TILE_REPORTS),
		kind: z.enum(TILE_KIND_NAMES),
		title: z.string().min(1).max(60).optional(),
		/** `kpi`, and the measure of a bars, donut or stacked tile. */
		metric: ColumnKey.optional(),
		/** `line` and `area`: the charted metrics, 1 to 4 on at most two scales. */
		metrics: z.array(ColumnKey).min(1).max(MAX_TILE_METRICS).optional(),
		/** `table`: the figure columns to show after the name, in this order (at most 6); absent means the first three of the report. */
		columns: z.array(ColumnKey).min(1).max(MAX_TILE_COLUMNS).optional(),
		filters: z.array(FilterSchema).max(5).optional(),
		params: z
			.object({
				source: z.enum(["all", "google", "bing"]).optional(),
				goal: Ref.optional(),
				funnel: Ref.optional(),
				event: z.string().min(1).max(64).optional(),
				prop: z.string().regex(/^[A-Za-z0-9_]{1,32}$/).optional(),
				// Additive on `v: 1`.
				dim: z.enum(["query", ...REVENUE_BREAKDOWN_DIMS]).optional(),
				/** Revenue tiles: absent means the site's default currency at run time. */
				currency: z.string().refine(isCurrency, { message: "currency must be an ISO 4217 code such as USD" }).optional(),
				direction: z.enum(["up", "down"]).optional(),
				metric: z.enum(["clicks", "impressions", "queries"]).optional(),
				minImpressions: z.number().int().min(1).max(100_000).optional(),
				minShare: z.number().int().min(1).max(50).optional(),
				includeBrand: z.boolean().optional(),
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
				scope: z.enum(["annotation", "none"]).optional(),
				path: z.string().min(1).max(512).regex(/^\//).optional(),
				/** `journey_paths`: the landing page. */
				entry: z.string().min(1).max(512).regex(/^\//).optional(),
				/** `search_position_moves` tables: the matrix (default) or one of the four lists. */
				list: z.enum(["matrix", "up", "down", "new", "lost"]).optional(),
				/** `links`: the breakdown and one link (Links convention). */
				by: z.enum(LINK_BY).optional(),
				/** `satisfaction` tables: best or worst landing pages by score. */
				rank: z.enum(["best", "worst"]).optional(),
				slug: z.string().min(1).max(128).optional(),
			})
			.strict()
			.optional(),
		limit: z.number().int().min(5).max(25).optional(),
		w: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	})
	.strict()
	.superRefine((t, ctx) => {
		const issue = (message: string, path: string) => ctx.addIssue({ code: "custom", message, path: [path] });
		const kinds: readonly TileKind[] = TILE_KINDS[t.report];
		if (!kinds.includes(t.kind)) issue(`${t.report} cannot be shown as ${t.kind}; allowed: ${kinds.join(", ")}`, "kind");
		const series = t.kind === "line" || t.kind === "area";
		const p = t.params ?? {};
		const metrics = t.report === "impact" ? (p.report ? IMPACT_METRICS[p.report] : []) : TILE_METRICS[t.report];
		if (t.kind === "kpi" && !t.metric) issue("a kpi tile needs a metric", "metric");
		if (t.columns && t.kind !== "table") issue("only a table tile names columns", "columns");
		if (t.columns && new Set(t.columns).size !== t.columns.length) issue("a column is named twice", "columns");
		if (t.kind === "kpi" && t.metric && !metrics?.includes(t.metric)) issue(`unknown metric ${t.metric} for ${t.report}`, "metric");
		if (series && t.metric) issue(`a ${t.kind} tile names its metrics in metrics`, "metric");
		if (!series && t.metrics) issue("metrics is for line and area tiles", "metrics");
		if (series && !t.metrics) issue(`a ${t.kind} tile needs metrics`, "metrics");
		if (series && t.metrics) {
			for (const m of t.metrics) if (!metrics?.includes(m)) issue(`unknown metric ${m} for ${t.report}`, "metrics");
			if (new Set(t.metrics).size !== t.metrics.length) issue("a metric is listed twice", "metrics");
			const problem = tileMetricsProblem(t.metrics);
			if (problem) issue(problem, "metrics");
			if (t.report === "impact" && t.metrics.length > 1) issue("an impact line shows one metric", "metrics");
		}
		if (t.kind === "stacked" && t.metric && t.metric !== "queries" && t.metric !== "impressions") issue("a stacked tile shows queries or impressions", "metric");
		for (const k of SEO_PARAM_KEYS) if (p[k] !== undefined && !TILE_PARAMS[t.report]?.includes(k)) issue(`params.${k} is not a parameter of ${t.report}`, "params");
		if (t.report === "search_position_bands_series" && p.metric === "clicks") issue("params.metric is queries or impressions here", "params");
		if (t.report === "search_movers" && p.metric === "queries") issue("params.metric is clicks or impressions here", "params");
		if (p.dim && t.report === "revenue_breakdown" && p.dim === "query") issue("params.dim of revenue_breakdown is one of " + REVENUE_BREAKDOWN_DIMS.join(", "), "params");
		if (p.dim && t.report !== "revenue_breakdown" && p.dim !== "query" && p.dim !== "page") issue("params.dim is query or page here", "params");
		if (t.report === "revenue_breakdown" && !p.dim) issue("a revenue_breakdown tile needs params.dim", "params");
		if (p.currency && t.report === "impact" && p.report !== "revenue") issue("params.currency is for revenue reports", "params");
		if (t.report === "impact" && !p.report) issue("an impact tile needs params.report", "params");
		if (t.report === "impact" && !p.annotation && !p.at) issue("an impact tile needs params.annotation or params.at", "params");
		if (t.report === "goals" && t.kind === "kpi" && !p.goal) issue("a goals kpi tile needs params.goal", "params");
		if (p.goal && t.report !== "goals" && !(t.report === "impact" && p.report === "goals")) issue("params.goal is for the goals report", "params");
		if (t.report === "funnels" && !p.funnel) issue("a funnels tile needs params.funnel", "params");
		if (p.funnel && t.report !== "funnels") issue("params.funnel is for the funnels report", "params");
		if (t.report === "event_props" && !p.event) issue("an event_props tile needs params.event", "params");
		if ((p.event || p.prop) && t.report !== "event_props") issue("params.event and params.prop are for the event_props report", "params");
		if (p.source && !tileNeedsSearch(t)) issue("params.source is for the search reports", "params");
	});
export type Tile = z.infer<typeof TileSchema>;

const body = {
	name: z.string().trim().min(1).max(80),
	// The count limit is checked first with its own typed error.
	tiles: z.array(TileSchema).min(1),
	defaults: z
		.object({
			range: Preset,
			compare: z.enum(["none", "previous", "year", "segment"]),
			segment: Ref.optional(),
			/** Side B of `compare: "segment"` (additive on `v: 1`). */
			compareSegment: Ref.optional(),
			filters: z.array(FilterSchema).max(10),
		})
		.strict(),
	/** `annotations` (additive on v 1): show matching annotations on shared pages; absent means off. */
	viewer: z.object({ ranges: z.array(Preset).min(1).max(PRESETS.length), compare: z.boolean(), annotations: z.boolean().optional() }).strict(),
};

const refine = (d: { tiles: Tile[]; defaults: { range: string; compare: string; compareSegment?: string | undefined }; viewer: { ranges: string[] } }, ctx: z.RefinementCtx) => {
	if (!d.viewer.ranges.includes(d.defaults.range)) ctx.addIssue({ code: "custom", message: "defaults.range must be one of viewer.ranges", path: ["defaults", "range"] });
	if ((d.defaults.compare === "segment") !== (d.defaults.compareSegment !== undefined))
		ctx.addIssue({ code: "custom", message: "defaults.compareSegment is required for compare segment and only allowed there", path: ["defaults", "compareSegment"] });
	const seen = new Set<string>();
	d.tiles.forEach((t, i) => {
		if (seen.has(t.id)) ctx.addIssue({ code: "custom", message: `duplicate tile id ${t.id}`, path: ["tiles", i, "id"] });
		seen.add(t.id);
	});
};

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/** A plain address: no display name, no list separators, at most 254 characters. */
export const RECIPIENT_RE = /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[A-Za-z]{2,}$/;
export const Recipient = z
	.string()
	.max(254)
	.refine((v) => RECIPIENT_RE.test(v) && !CONTROL.test(v), { message: "Use a plain email address such as reports@example.com." });

/** What `dashboards/email/save` accepts. */
export const EmailSettings = z
	.object({
		enabled: z.boolean(),
		frequency: z.enum(["weekly", "monthly"]),
		/** ISO weekday, 1 is Monday. */
		weekday: z.number().int().min(1).max(7).default(1),
		/** 1 to 28, so every month has the day. */
		monthday: z.number().int().min(1).max(28).default(1),
		/** Hour in the site timezone. */
		hour: z.number().int().min(0).max(23).default(8),
		recipients: z.array(Recipient).min(1).max(MAIL_MAX_RECIPIENTS),
		range: Preset,
		compare: z.boolean(),
		subject: z
			.string()
			.min(1)
			.max(80)
			.refine((v) => !CONTROL.test(v), { message: "The subject cannot contain control characters." })
			.optional(),
	})
	.strict();
export type EmailSettingsT = z.infer<typeof EmailSettings>;

/** The stored `Dashboard.email`: the settings plus the send state. `emailNext` is a top level field (an index reaches top level names only). */
export const EmailRecord = EmailSettings.extend({
	lastSent: z.number().int().optional(),
	lastError: z.string().max(300).optional(),
	/** Recipients of a failed send; only they are retried. */
	pending: z.array(Recipient).max(MAIL_MAX_RECIPIENTS).optional(),
	/** Retries used for the pending recipients. */
	retries: z.number().int().min(0).max(9).optional(),
}).strict();
export type EmailRecordT = z.infer<typeof EmailRecord>;

/** What an editor or agent sends: a dashboard without site and times (`id` absent creates). */
export const DashboardInput = z
	.object({ id: z.string().regex(/^[a-z0-9]{12}$/).optional(), ...body })
	.strict()
	.superRefine(refine);
export type DashboardInputT = z.infer<typeof DashboardInput>;

export const DashboardSchema = z
	.object({
		id: z.string().regex(/^[a-z0-9]{12}$/),
		site: z.string().min(1).max(32),
		v: z.literal(1),
		...body,
		created: z.number().int(),
		updated: z.number().int(),
		/** Written only by `dashboards/email/save` and the mail tick. */
		email: EmailRecord.optional(),
		/** Next due time, epoch seconds; indexed; absent when no schedule is enabled. */
		emailNext: z.number().int().optional(),
	})
	.strict()
	.superRefine(refine);
export type Dashboard = z.infer<typeof DashboardSchema>;

/** Dependency definitions carried by a template (the config collection items, without `site`). */
const Dep = z.object({ name: z.string().min(1).max(64) }).passthrough();
export const TemplateSchema = z
	.object({
		kind: z.literal("dashboard-template"),
		v: z.literal(1),
		...body,
		description: z.string().max(300).optional(),
		dependencies: z.object({ segments: z.array(Dep).max(50).optional(), goals: z.array(Dep).max(50).optional(), funnels: z.array(Dep).max(50).optional() }).strict().optional(),
	})
	.strict()
	.superRefine(refine);
export type Template = z.infer<typeof TemplateSchema>;

export type DashboardErrorCode = "invalid_dashboard" | "too_many_tiles" | "too_many_dashboards" | "record_too_large" | "unknown_version" | "invalid_template" | "too_many_requests" | "too_many_scheduled";

// No parameter properties: the OpenAPI build loads this file with Node type stripping.
export class DashboardError extends Error {
	readonly code: DashboardErrorCode;
	/** Ids of the tiles the error is about (structural errors). */
	readonly tiles: string[];
	constructor(code: DashboardErrorCode, message: string, tiles: string[] = []) {
		super(message);
		this.code = code;
		this.tiles = tiles;
	}
}

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** Parse with typed errors: tile count first, then the zod structure (naming the offending tiles), then the record size. */
export function parseStrict<S extends z.ZodType>(schema: S, input: unknown, code: "invalid_dashboard" | "invalid_template"): z.infer<S> {
	const raw = input as { tiles?: unknown; v?: unknown } | null;
	if (raw && typeof raw === "object" && "v" in raw && raw.v !== 1) throw new DashboardError("unknown_version", `Unknown record version ${String(raw.v).slice(0, 16)}; this reader knows version 1.`);
	if (Array.isArray(raw?.tiles) && raw.tiles.length > MAX_TILES) throw new DashboardError("too_many_tiles", `At most ${MAX_TILES} tiles.`);
	const r = schema.safeParse(input);
	if (!r.success) {
		const tiles = Array.isArray(raw?.tiles) ? raw.tiles : [];
		const bad = new Set<string>();
		for (const i of r.error.issues) if (i.path[0] === "tiles" && typeof i.path[1] === "number") bad.add(String((tiles[i.path[1]] as { id?: unknown } | undefined)?.id ?? `#${i.path[1] + 1}`));
		const first = r.error.issues[0];
		throw new DashboardError(code, `${first ? `${first.path.join(".")}: ${first.message}` : "invalid"}${bad.size ? ` (tiles ${[...bad].join(", ")})` : ""}`, [...bad]);
	}
	// The size limit is on the stored record; a template with dependencies may be larger.
	if (code === "invalid_dashboard" && bytes(r.data) > MAX_RECORD_BYTES) throw new DashboardError("record_too_large", `The record is larger than ${MAX_RECORD_BYTES} bytes.`);
	return r.data;
}

/** A stored record: unknown `v` is a typed error. */
export const readDashboard = (data: unknown): Dashboard => parseStrict(DashboardSchema, data, "invalid_dashboard");

/**
 * Move the item at `from` so it ends at index `to` of the result. `to` is clamped to the list; an
 * out of range `from` returns an unchanged copy. Pure, so the stored `tiles` order is the only layout state.
 */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
	const out = [...list];
	if (!Number.isInteger(from) || from < 0 || from >= out.length) return out;
	const [item] = out.splice(from, 1) as [T];
	out.splice(Math.max(0, Math.min(out.length, Math.trunc(to) || 0)), 0, item);
	return out;
}

/**
 * Insertion slot (0 to rects.length) for a pointer at `y` over items laid out top to bottom: the number of items
 * whose vertical middle lies above `y`. Combined with `reorder` as `to = slot > from ? slot - 1 : slot`.
 */
export function dropIndex(rects: ReadonlyArray<{ top: number; height: number }>, y: number): number {
	let slot = 0;
	for (const r of rects) if (y > r.top + r.height / 2) slot++;
	return slot;
}

/** The `reorder` target of an insertion slot for the item at `from`. */
export const slotTarget = (from: number, slot: number) => (slot > from ? slot - 1 : slot);

/** A dashboard without its schedule: what agent routes, export and MCP tools may return. */
export function withoutEmail<T extends { email?: unknown; emailNext?: unknown }>(d: T): Omit<T, "email" | "emailNext"> {
	const { email: _e, emailNext: _n, ...rest } = d;
	return rest;
}
