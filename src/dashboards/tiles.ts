/** Shape a report result into what one tile draws; shared by the admin and the shared page renderer. */
import type { AnnotationView } from "../annotations/scope.js";
import { formatAmount, MAX_CURRENCIES_LISTED } from "../core/currency.js";
import { type Change, describeChange, rateBase } from "../charts/change.js";
import { shownNotices } from "../charts/caveats.js";
import { type Format, fmt, foldSlices, rangeText } from "../charts/geometry.js";
import type { ReportResult } from "../query/reports/index.js";
import { LOW_SAMPLE, lowSampleLine, SATISFACTION_MIN_MEASURED } from "../query/reports/satisfaction-copy.js";
import { periodLine, SEO_TEXT, type SeoPeriods } from "../query/reports/seo-copy.js";
import { DEFAULT_TILE_LIMIT } from "./run.js";
import { metricFamily, metricFormat, MONEY_KEYS, type Tile, type TileKind } from "./schema.js";

export interface TileData {
	kind: TileKind;
	metric: string | null;
	value: number | null;
	/** `kpi`: the comparison's figures (absent with no comparison, null when it has none); `impact`: the before window. */
	compare?: Record<string, unknown> | null;
	/** `line` and `area`: the bucket keys, and one line per metric in the tile's order with values aligned to them. */
	buckets: string[];
	lines: TileLine[];
	/** What the dashed lines show: "15 Feb to 28 Feb" or the other segment's name. */
	compareLabel?: string;
	/** `bars` and `donut`: one entry per slice or bar; `table`: the report rows. */
	rows: Array<Record<string, unknown>>;
	columns: string[];
	notices: string[];
	/** `line` and `area`: the matching annotations the report embedded. */
	annotations?: AnnotationView[];
	/** `line` and `area`: bucket size of the series. */
	granularity?: "hour" | "day" | "week";
	/** `stacked`: segment keys, their labels and one value per key and bucket. */
	stack?: { keys: string[]; labels: string[]; series: Array<{ t: string; values: Record<string, number> }> };
	/** `impact` tiles: the two windows and the annotation day, drawn as a marker on the line. */
	impact?: { before: number | null; after: number | null; complete: boolean; daysAfter: number; day: string; notable?: boolean };
	/** Shown instead of the chart, for example "No annotation yet". */
	empty?: string;
	/** Footer lines the tile needs: the period line of the two- and three-period views. */
	period?: string;
	/** Revenue tiles: the one currency of every amount, and the other currencies with orders. */
	currency?: string;
	otherCurrencies?: Array<{ currency: string; revenue: number; orders: number }>;
	/** A footer line of the tile, for example the terms a shared page leaves out. */
	footnote?: string;
	/** A line under a number tile: a Score figure that rests on fewer measured sessions than the sample minimum. */
	note?: string;
}

/** A Search Satisfaction row whose score rests on fewer measured sessions than the sample minimum (table tiles print the flag as "yes"). */
export const lowSampleRow = (r: Record<string, unknown>): boolean => r.low_sample === true || r.low_sample === "yes";
/** The note under the score cell of such a row (tiles, shared pages, emails). */
export const scoreNote = (key: string, r: Record<string, unknown>): string | null => (key === "score" && lowSampleRow(r) ? LOW_SAMPLE : null);
/** Why a Score tile shows no change: the comparison's own score rests on too few measured sessions. */
export const LOW_SAMPLE_COMPARE = "The comparison has fewer measured sessions than the sample minimum, so its score is no base for a change.";

/** One line of a `line` or `area` tile; `compare` is the comparison aligned by index, null without one. */
export interface TileLine {
	key: string;
	values: Array<number | null>;
	compare: Array<number | null> | null;
}

/** Most lines drawn while a comparison is on: each has a dashed twin. */
export const COMPARE_LINES = 2;
export const TRIMMED_COMPARE = "Comparison on: showing the first 2 metrics.";
/** Columns of a table tile that names none: the name and the first three figures of the report. */
export const TABLE_TILE_COLUMNS = 4;
/** A series more than this many times another of its family moves to the right axis (as on the report pages). */
const SCALE_RATIO = 20;

/**
 * Axis of each line, in the tile's order: the first line's scale family on the left, the other on the
 * right. With one family, the lines more than 20 times the smallest move right, so the small one is not flat.
 */
export function lineAxes(lines: ReadonlyArray<Pick<TileLine, "key" | "values" | "compare">>): Record<string, "left" | "right"> {
	const fams = lines.map((l) => metricFamily(l.key));
	const out: Record<string, "left" | "right"> = {};
	lines.forEach((l, i) => (out[l.key] = fams[i] === fams[0] ? "left" : "right"));
	if (lines.length > 1 && new Set(fams).size === 1) {
		const top = (l: (typeof lines)[number]) => Math.max(0, ...l.values.map((v) => v ?? 0), ...(l.compare ?? []).map((v) => v ?? 0));
		const least = Math.min(...lines.map(top));
		if (least > 0) for (const l of lines) if (top(l) > SCALE_RATIO * least) out[l.key] = "right";
	}
	return out;
}

/** The footnote of the site search floor on shared pages and in emails. */
export const hiddenTermsText = (n: number) => `${n} search term${n === 1 ? "" : "s"} used in fewer than 2 sessions ${n === 1 ? "is" : "are"} not shown.`;

/** Not a table column: nested values, the currency code, and `last_seen` of Not found (an epoch second, not a figure). */
const SKIP = new Set(["key", "previous", "delta", "page_list", "periods", "currency", "revenue_currency", "last_seen"]);

/** Columns a table tile can show for these rows: the name column, then every plain value of the first row in the report's order. */
export function tableColumnKeys(rows: ReadonlyArray<Record<string, unknown>>): string[] {
	const first = rows[0] ?? {};
	const label = "query" in first ? "query" : "key";
	return [label, ...Object.keys(first).filter((k) => !SKIP.has(k) && k !== label && (first[k] === null || typeof first[k] !== "object"))];
}

export const REVENUE_EMPTY = "No revenue recorded yet";

/** Format of a value: amounts as `money:<code>` when the tile has a currency, else the metric's format. */
export const valueFormat = (key: string, currency?: string): Format => (currency && MONEY_KEYS.has(key) ? `money:${currency}` : metricFormat(key));
export const formatValue = (key: string | null, v: unknown, currency?: string): string => fmt(v, valueFormat(key ?? "", currency));

/** Header of a column or KPI: "Revenue (USD)" for amounts. */
export const valueLabel = (key: string, currency?: string) => (currency && MONEY_KEYS.has(key) ? `${metricLabel(key)} (${currency})` : metricLabel(key));

/** "100.00 EUR (1 order), 80.00 GBP (2 orders)", at most 5 listed then "and n more"; empty without others. */
export function otherCurrencies(others: ReadonlyArray<{ currency: string; revenue: number; orders: number }>): string {
	const listed = others.slice(0, MAX_CURRENCIES_LISTED).map((c) => `${formatAmount(c.revenue, c.currency)} (${c.orders} order${c.orders === 1 ? "" : "s"})`);
	return `${listed.join(", ")}${others.length > MAX_CURRENCIES_LISTED ? ` and ${others.length - MAX_CURRENCIES_LISTED} more` : ""}`;
}

/** The lines under a revenue tile: "Amounts in USD." and "Also recorded: 120.00 EUR (3 orders)." */
export function currencyLines(d: Pick<TileData, "currency" | "otherCurrencies">): string[] {
	if (!d.currency) return [];
	const others = otherCurrencies(d.otherCurrencies ?? []);
	return [`Amounts in ${d.currency}.`, ...(others ? [`Also recorded: ${others}.`] : [])];
}

/** Labels that the key cannot spell (the satisfaction estimates carry "estimate"); the admin's `METRICS` labels agree. */
const LABELS: Partial<Record<string, string>> = {
	key: "Name",
	ctr: "CTR",
	avg_duration: "Avg. session duration",
	// The Links page's names: a `conv` event is a sale, and the Search Satisfaction coverage figure is a share.
	conversions: "Sales",
	measured_rate: "Measured share",
	avg_time: "Avg. active time",
	avg_visible: "Avg. visible time",
	avg_engaged: "Avg. active time",
	converting: "Converting sessions",
	conversion_rate: "Conversion rate",
	rate: "Share of sessions",
	conversion: "Of first step",
	drop_off: "Drop-off",
	delta: "Change",
	delta_pct: "Change (percent)",
	overlapping_queries_pct: "Share of queries",
	overlapping_impressions_pct: "Share of impressions",
	potential_clicks: "Potential clicks (est.)",
	scroll_median: "Median scroll (%)",
	aov: "Average order value",
	pogo_stick_rate: "Pogo-sticking (estimate)",
	pogo_sticks: "Pogo-sticking sessions (estimate)",
	returned_from_search_rate: "Returned from search (estimate)",
	returned_from_search: "Returned from search sessions (estimate)",
	search_reentry_rate: "Search re-entry (estimate)",
	back_nav_rate: "Back/forward loads (estimate)",
};

/** Readable label of a metric or column key: `bounce_rate` becomes "Bounce rate". */
export const metricLabel = (key: string) => LABELS[key] ?? `${key[0]?.toUpperCase() ?? ""}${key.slice(1).replace(/_/g, " ")}`;

/** Default titles that differ from the report name: shared pages carry no `FORBIDDEN_PUBLIC_WORDS` term. */
const REPORT_TITLES: Partial<Record<string, string>> = {
	collections: "Content types",
	site_search: "Site search",
	pages: "Top pages",
	entry_pages: "Top entry pages",
	exit_pages: "Top exit pages",
	not_found: "Pages not found",
	channels: "Top channels",
	sources: "Top sources",
	campaigns: "Top campaigns",
	ai_referrals: "AI referrals",
	countries: "Top countries",
	regions: "Top regions",
	os: "Operating systems",
	events: "Top events",
	event_props: "Event properties",
	outbound: "Outbound links",
	scroll: "Scroll depth",
	search_queries: "Top search queries",
	search_pages: "Top pages in search",
	links: "Top links",
};

/** The change of a KPI or impact tile against its comparison; null with no comparison. */
export function tileChange(d: TileData): Change | null {
	if (d.compare === undefined || !d.metric) return null;
	if (d.metric === "score" && d.compare?.low_sample === true) return describeChange(d.metric, d.value, null, { format: valueFormat(d.metric, d.currency), reason: LOW_SAMPLE_COMPARE });
	return describeChange(d.metric, d.value, d.compare?.[d.metric], { format: valueFormat(d.metric, d.currency), base: rateBase(d.compare) });
}

/** The tile's own title, else a display title (stored tiles are not changed): "Sessions over time", "Visitors", "Top pages". */
export function tileTitle(tile: Tile, currency?: string): string {
	const keys = tile.metrics ?? (tile.metric && tile.kind !== "table" ? [tile.metric] : []);
	const m = keys.length ? joinLabels(keys.map(metricLabel)) : null;
	const auto = !m ? (REPORT_TITLES[tile.report] ?? metricLabel(tile.report)) : tile.report === "impact" ? `Impact on ${m.toLowerCase()}` : tile.kind === "line" || tile.kind === "area" || tile.kind === "stacked" ? `${m} over time` : m;
	return `${tile.title ?? auto}${currency ? ` (${currency})` : ""}`;
}

/** "Visitors", "Visitors and Sessions", "Visitors, Sessions and Pageviews". */
export const joinLabels = (labels: readonly string[]) => (labels.length < 2 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`);

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Keys of the figures a tile displays: a table tile its columns; any other tile its metric (a number, bars or donut
 * tile) and its lines. `columns` of a bars or donut tile holds every key of the rows, most of them not shown.
 */
export const displayedKeys = (d: Pick<TileData, "kind" | "metric" | "lines" | "columns">): string[] => (d.kind === "table" ? [...d.columns] : [...(d.metric ? [d.metric] : []), ...d.lines.map((l) => l.key)]);

/** `goalName` is the name of `params.goal` (the goals report has one row per goal name). Notices about a figure the tile does not display are left out. */
export function tileData(tile: Tile, result: ReportResult, opts: { goalName?: string | undefined } = {}): TileData {
	const out = tileFigures(tile, result, opts);
	return { ...out, notices: shownNotices(out.notices, displayedKeys(out)) };
}

function tileFigures(tile: Tile, result: ReportResult, opts: { goalName?: string | undefined }): TileData {
	const d = result.data;
	const notices = [...result.notices, ...((d.notices as string[] | undefined) ?? [])];
	const rows = (d.rows ?? []) as Array<Record<string, unknown>>;
	const m = tile.metric ?? tile.metrics?.[0];
	const out: TileData = { kind: tile.kind, metric: m ?? null, value: null, buckets: [], lines: [], rows: [], columns: [], notices };
	const series = (d.series ?? []) as Array<Record<string, unknown>>;
	if (d.periods) out.period = periodLine(d.periods as SeoPeriods);
	if (typeof d.hidden_terms === "number" && d.hidden_terms > 0) out.footnote = hiddenTermsText(d.hidden_terms);
	if (typeof d.currency === "string") out.currency = d.currency;
	if (typeof d.currency === "string" && tile.report !== "impact") {
		const list = (d.currencies as Array<{ currency: string; revenue: number; orders: number }> | undefined) ?? [];
		out.otherCurrencies = list.filter((c) => c.currency !== d.currency).map(({ currency, revenue, orders }) => ({ currency, revenue, orders }));
		if (d.hasRevenue === false || (tile.report !== "revenue" && !list.length)) return { ...out, empty: REVENUE_EMPTY };
	}
	if (tile.report === "impact") {
		if (d.no_annotation) return { ...out, empty: SEO_TEXT.noAnnotation };
		if (d.not_yet) return { ...out, empty: `The first comparison is possible on ${String(d.not_yet)}.` };
		const v = (k: string) => n(d[k]);
		out.impact = { before: v("before"), after: v("after"), complete: d.complete === true, daysAfter: v("days_after") ?? 0, day: String(d.day ?? ""), ...(typeof d.notable === "boolean" ? { notable: d.notable } : {}) };
		out.value = v("after");
		if (m) out.compare = { [m]: v("before") };
		if (tile.kind === "line" && m) {
			out.buckets = series.map((p) => String(p.t));
			out.lines = [{ key: m, values: series.map((p) => n(p.value)), compare: null }];
		}
		return out;
	}
	if (tile.kind === "stacked") {
		const keys = (d.keys as string[] | undefined) ?? [];
		out.stack = { keys, labels: (d.labels as string[] | undefined) ?? keys, series: (d.series ?? []).map((p) => ({ t: p.t, values: Object.fromEntries(keys.map((k) => [k, n(p[k]) ?? 0])) })) };
		out.metric = typeof d.metric === "string" ? d.metric : null;
		return out;
	}
	if (tile.kind === "kpi" && m) {
		const row = tile.report === "goals" ? rows.find((r) => r.key === opts.goalName) : undefined;
		const src = tile.report === "goals" ? row : d.totals;
		const prev = tile.report === "goals" ? (row && "previous" in row ? row.previous : undefined) : "compareTotals" in d ? d.compareTotals : undefined;
		out.value = n(src?.[m]);
		if (prev !== undefined) out.compare = (prev ?? null) as Record<string, unknown> | null;
		if (m === "score" && src?.low_sample === true) out.note = lowSampleLine(typeof d.min_measured === "number" ? d.min_measured : SATISFACTION_MIN_MEASURED);
		return out;
	}
	if (tile.kind === "line" || tile.kind === "area") {
		const cmp = d.compareSeries as Array<Record<string, unknown>> | undefined;
		out.buckets = series.map((p) => String(p.t));
		out.lines = (tile.metrics ?? []).map((k) => ({ key: k, values: series.map((p) => n(p[k])), compare: cmp ? cmp.map((p) => n(p[k])) : null }));
		if (cmp && result.compare === "segment" && result.compareSegment) out.compareLabel = result.compareSegment.name;
		else if (cmp && result.compareRange) out.compareLabel = rangeText(result.compareRange.from, result.compareRange.to);
		if (Array.isArray(d.annotations) && d.annotations.length) out.annotations = d.annotations as AnnotationView[];
		if (d.granularity === "hour" || d.granularity === "week" || d.granularity === "day") out.granularity = d.granularity;
		return out;
	}
	const limited = rows.slice(0, tile.limit ?? DEFAULT_TILE_LIMIT);
	const first = limited[0] ?? {};
	// Rows that name their query use it as the first column instead of the internal key.
	const columns = tableColumnKeys(limited);
	// A table tile that names its columns shows those the report returns (in the tile's order); with none left it shows the first figures.
	const named = tile.kind === "table" && tile.columns ? tile.columns.filter((k) => columns.includes(k) && k !== columns[0]) : [];
	out.columns = tile.kind !== "table" ? columns : named.length ? [columns[0] as string, ...named] : columns.slice(0, TABLE_TILE_COLUMNS);
	if (tile.kind === "table") {
		// A change of a signed score means nothing in a table (as on the Search Satisfaction page): its previous value is dropped.
		const prevOf = (r: Record<string, unknown>) => (r.previous && typeof r.previous === "object" && "score" in r.previous ? { previous: { ...(r.previous as Record<string, unknown>), score: null } } : {});
		out.rows = limited.map((r) => ({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "yes" : "no") : v])), ...prevOf(r) }));
		return out;
	}
	const metric = m && m in first ? m : (out.columns.find((k) => k !== "key" && typeof first[k] === "number") ?? null);
	out.metric = metric;
	const bars = limited.map((r) => ({ label: String(r.key ?? ""), value: metric ? (n(r[metric]) ?? 0) : 0 }));
	out.rows = tile.kind === "donut" ? foldSlices(bars) : bars;
	return out;
}
