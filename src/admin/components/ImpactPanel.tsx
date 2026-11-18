/**
 * Impact panel: one metric before and after an annotation or a date, over equal windows.
 * Opened from a row of the Annotations page (`?a=<id>`, `?a=date` for any date). One `impact` request per
 * picked metric; the page filters carry over. The target picker parts serve the annotation editor too.
 */
import { Button } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { KIND_LABELS, type Scope } from "../../annotations/scope.js";
import type { Target } from "../../annotations/target.js";
import { describeChange } from "../../charts/change.js";
import { type Format, fmt } from "../../charts/geometry.js";
import { ChangeMark } from "./Change.js";
import { addDays, dayInZone } from "../../core/time.js";
import type { Params } from "../../query/reports/index.js";
import { IMPACT_WINDOWS, type ImpactReport, SEO_TEXT } from "../../query/reports/seo-copy.js";
import { queryReport, useReport } from "../api.js";
import { LineChart } from "./Chart.js";
import { toQuery, type View } from "./Header.js";
import { METRICS } from "./format.js";
import { InfoMark, Notice } from "./ui.js";
import { metricDefinition, PANEL_DEFINITIONS } from "../../charts/definitions.js";

/** What a target needs besides the metric: a channel, a goal, a page or an event name; `search` metrics run over the scope. */
export type KeyKind = "channel" | "goal" | "search" | "page" | "event";
type Option = readonly [group: string, report: ImpactReport, metric: string, label: string, format: Format, key?: KeyKind];

/** Report and metric picker, grouped by family; also the target picker of the annotation editor. */
export const IMPACT_OPTIONS: readonly Option[] = [
	["Traffic", "overview", "visitors", "Visitors", "number"],
	["Traffic", "overview", "sessions", "Sessions", "number"],
	["Traffic", "overview", "pageviews", "Page views", "number"],
	["Traffic", "overview", "bounce_rate", "Bounce rate", "percent"],
	["Traffic", "overview", "engaged_rate", "Engaged rate", "percent"],
	["Traffic", "overview", "avg_duration", "Avg. duration", "duration"],
	["Traffic", "overview", "views_per_session", "Views per session", "decimal"],
	["Pages", "pages", "avg_time", "Avg. active time", "duration", "page"],
	["Pages", "pages", "exit_rate", "Exit rate", "percent", "page"],
	["Channels", "channels", "sessions", "Sessions of one channel", "number", "channel"],
	["Goals", "goals", "completions", "Goal completions", "number", "goal"],
	["Goals", "goals", "conversion_rate", "Goal conversion rate", "percent", "goal"],
	["Events", "events", "events", "Event count", "number", "event"],
	["Revenue", "revenue", "orders", "Orders", "number"],
	["Revenue", "revenue", "revenue", "Revenue", "number"],
	["Search", "search_overview", "clicks", "Search clicks", "number", "search"],
	["Search", "search_overview", "impressions", "Search impressions", "number", "search"],
	["Search", "search_overview", "ctr", "Search CTR", "percent", "search"],
	["Search", "search_overview", "position", "Search position", "decimal", "search"],
	["Search Satisfaction", "satisfaction", "pct_long", "Long clicks", "percent"],
	["Search Satisfaction", "satisfaction", "pct_short", "Short clicks", "percent"],
	["Search Satisfaction", "satisfaction", "pct_bad", "Bad experience", "percent"],
	["Search Satisfaction", "satisfaction", "pogo_stick_rate", "Pogo-sticking (estimate)", "percent"],
	["Search Satisfaction", "satisfaction", "search_reentry_rate", "Search re-entry", "percent"],
];
/** One line per group on what its metrics measure (the hint under the picker). */
export const GROUP_HINTS: Record<string, string> = {
	Traffic: "Visits inside the annotation's scope.",
	Pages: "One page: its active time and the share of visits that left from it.",
	Channels: "Sessions from one channel, inside the scope.",
	Goals: "Completions of one goal, inside the scope.",
	Events: "How often one event was sent, inside the scope.",
	Revenue: "Orders and revenue in the site currency, inside the scope.",
	Search: "Search Console or Bing data; a query scope measures that query.",
	"Search Satisfaction": "How visitors from search behaved after they landed.",
};
export const optionId = (o: Option) => `${o[1]}:${o[2]}`;
/** The options on offer: Search metrics only while a Search source is connected. */
export const optionsFor = (searchOn: boolean) => IMPACT_OPTIONS.filter((o) => searchOn || o[5] !== "search");
export const optionOf = (t: Pick<Target, "report" | "metric">) => IMPACT_OPTIONS.find((o) => o[1] === t.report && o[2] === t.metric);
/** The stored target of an option and its row value (a goal id, a channel, a page, an event). */
export function targetOf(o: Option, key: string): Target {
	const k = key.trim();
	const params = o[5] === "goal" ? { goal: k } : o[5] && o[5] !== "search" ? { key: k } : null;
	return { report: o[1], metric: o[2], ...(params && k ? { params } : {}) };
}
/** Short name of a target, with its goal name or row. */
export function targetLabel(t: Target, goals: ReadonlyMap<string, string> = new Map()): string {
	const label = optionOf(t)?.[3] ?? t.metric;
	const row = t.params?.goal ? (goals.get(t.params.goal) ?? t.params.goal) : t.params?.key;
	return row ? `${label}: ${row}` : label;
}
const GROUPS = [...new Set(IMPACT_OPTIONS.map((o) => o[0]))];
/** Rates below these denominators are greyed (the impression floor default, 50 sessions). */
const LOW_IMPRESSIONS = 50;
const LOW_SESSIONS = 50;
/** The fixed strip of standard KPIs under an expanded row (same scope and windows). */
const CONTEXT_KPIS = ["visitors", "sessions", "pageviews", "bounce_rate", "avg_duration"] as const;

export const IMPACT_TEXT = {
	incomplete: (n: number, w: number) => `The after window has ${n} of ${w} days; numbers will change.`,
	notYet: (d: string) => `The first comparison is possible on ${d}.`,
	notable: "Notable",
	noise: "Within the usual noise",
	suggestSearch: "Use Search clicks",
	pagePicker: "Page (optional)",
	anyDate: "Any date",
	context: "Same scope and windows",
} as const;

/** The metric picker grouped by report, unavailable groups left out. */
export function TargetSelect({ label, value, searchOn, onChange, defaultLabel }: { label: string; value: string; searchOn: boolean; onChange(id: string): void; defaultLabel?: string }) {
	const options = optionsFor(searchOn);
	return (
		<select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
			{defaultLabel && <option value="">{defaultLabel}</option>}
			{GROUPS.filter((g) => options.some((o) => o[0] === g)).map((g) => (
				<optgroup key={g} label={g}>
					{options
						.filter((o) => o[0] === g)
						.map((o) => (
							<option key={optionId(o)} value={optionId(o)}>
								{o[3]}
							</option>
						))}
				</optgroup>
			))}
		</select>
	);
}

/** The row input of an option: a goal by name, a channel, a page or an event. */
export function KeyInput({ kind, value, goals, onChange }: { kind: KeyKind; value: string; goals: ReadonlyMap<string, string>; onChange(v: string): void }) {
	if (kind === "goal")
		return (
			<label>
				Goal{" "}
				<select value={value} onChange={(e) => onChange(e.target.value)}>
					<option value="">Choose a goal</option>
					{[...goals].map(([id, name]) => (
						<option key={id} value={id}>
							{name}
						</option>
					))}
				</select>
			</label>
		);
	const label = kind === "channel" ? "Channel" : kind === "page" ? "Page" : kind === "event" ? "Event" : "Query";
	return (
		<label>
			{label} <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={kind === "channel" ? "Organic Search" : kind === "page" ? "/pricing/" : kind === "event" ? "signup" : ""} />
		</label>
	);
}

interface ImpactData {
	annotation?: { id: string | null; ts: number; kind: string; text: string; scope: Scope | null; summary: string };
	day?: string;
	window?: number;
	complete?: boolean;
	days_after?: number;
	before?: number | null;
	after?: number | null;
	delta?: number | null;
	delta_pct?: number | null;
	notable?: boolean;
	measured?: { before: number | null; after: number | null };
	series?: Array<{ t: string; value: number | null }>;
	marker?: string;
	overlapping?: Array<{ id: string | null; ts: number; kind: string; text: string }>;
	not_yet?: string;
	no_annotation?: boolean;
	notices?: string[];
	currency?: string | null;
	context?: { before: Record<string, number | null> | null; after: Record<string, number | null> | null };
}

/** Pages of the range for the page picker (`dimension_values`). */
function usePages(view: View): string[] {
	const [pages, setPages] = useState<string[]>([]);
	useEffect(() => {
		let live = true;
		queryReport(view.site.id, { report: "dimension_values", query: { from: view.state.from, to: view.state.to, filters: [], compare: "none" }, params: { dim: "page" }, limit: 50 }).then(
			(r) => live && setPages((r.data.rows ?? []).map((x) => String(x.key))),
			() => live && setPages([]),
		);
		return () => {
			live = false;
		};
	}, [view.site.id, view.state.from, view.state.to]);
	return pages;
}

interface PanelProps {
	view: View;
	/** Annotation id, or null for any date. */
	annotation: string | null;
	/** The annotation's target KPI (the first metric shown). */
	target?: Target | undefined;
	/** Fixed by the page's window selector; absent: the panel offers every window. */
	window?: number | undefined;
	searchOn: boolean;
	goals: ReadonlyMap<string, string>;
	onClose?: (() => void) | undefined;
}

export function ImpactPanel({ view, annotation, target, window: fixedWindow, searchOn, goals, onClose }: PanelProps) {
	const { state, site, tz } = view;
	const [ownWin, setWin] = useState<number>(28);
	const win = fixedWindow ?? ownWin;
	const first = (target && optionOf(target)) ?? (IMPACT_OPTIONS[0] as Option);
	const [choice, setChoice] = useState(optionId(first));
	const [key, setKey] = useState(target?.params?.goal ?? target?.params?.key ?? "");
	const [searchBy, setSearchBy] = useState<"site" | "page" | "query">("site");
	const [scope, setScope] = useState<"annotation" | "none">("annotation");
	const [path, setPath] = useState("");
	const [at, setAt] = useState(() => addDays(dayInZone(Math.floor(Date.now() / 1000), tz), -29));
	const pages = usePages(view);
	const opt = IMPACT_OPTIONS.find((o) => optionId(o) === choice) ?? (IMPACT_OPTIONS[0] as Option);
	const report = opt[5] === "search" && searchBy !== "site" ? (searchBy === "page" ? "search_pages" : "search_queries") : opt[1];
	const needsKey = (!!opt[5] && opt[5] !== "search") || (opt[5] === "search" && searchBy !== "site");
	const params: Params = {
		...(annotation ? { annotation, context: true } : { at }),
		window: win as Params["window"],
		report: report as Params["report"],
		metric: opt[2],
		...(needsKey && key ? (opt[5] === "goal" ? { goal: key } : { key }) : {}),
		...(scope === "none" ? { scope: "none" as const } : {}),
		...(target?.params?.source && opt[5] === "search" ? { source: target.params.source } : {}),
		...(target?.params?.currency && opt[1] === "revenue" ? { currency: target.params.currency } : {}),
		// No path is sent until a page is chosen.
		...(path.startsWith("/") ? { path } : {}),
	};
	const ready = !needsKey || !!key;
	const res = useReport(site.id, ready ? { report: "impact", query: toQuery(state, "impact"), params } : null);
	const d = (res.data?.data ?? null) as ImpactData | null;
	const a = d?.annotation;
	const hasPath = !!a?.scope?.path?.length;
	const notices = d?.notices ?? [];
	const queryOnTraffic = notices.includes("scope_query_not_applied");
	const den = d?.measured;
	const low = den && Math.min(den.before ?? 0, den.after ?? 0) < (report.startsWith("search_") ? LOW_IMPRESSIONS : LOW_SESSIONS);
	// Money keeps its currency.
	const f: Format = opt[2] === "revenue" && d?.currency ? `money:${d.currency}` : opt[4];
	return (
		<section role="region" aria-label="Impact" className="ca-impact">
			{onClose && (
				<div className="ca-spread">
					<h3>
						Impact{a ? `: ${a.text}` : ""}
						<InfoMark text={PANEL_DEFINITIONS.impact} />
					</h3>
					<Button size="sm" onClick={onClose}>
						Close
					</Button>
				</div>
			)}
			{!annotation && (
				<label>
					{IMPACT_TEXT.anyDate} <input type="date" value={at} onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setAt(e.target.value)} />
				</label>
			)}
			{fixedWindow === undefined && (
				<div role="group" aria-label="Window" className="ca-actions">
					{IMPACT_WINDOWS.map((w) => (
						<Button size="sm" key={w} aria-pressed={win === w} onClick={() => setWin(w)}>
							{w} days
						</Button>
					))}
				</div>
			)}
			<div className="ca-actions ca-impact-pick">
				<label>
					Metric <TargetSelect label="Metric" value={choice} searchOn={searchOn} onChange={(id) => (setChoice(id), setKey(""))} />
				</label>
				{opt[5] === "search" && (
					<label>
						For{" "}
						<select value={searchBy} onChange={(e) => (setSearchBy(e.target.value as "site" | "page" | "query"), setKey(""))}>
							<option value="site">The whole site</option>
							<option value="page">One page</option>
							<option value="query">One query</option>
						</select>
					</label>
				)}
				{needsKey && <KeyInput kind={opt[5] === "search" ? (searchBy === "page" ? "page" : "search") : (opt[5] as KeyKind)} value={key} goals={goals} onChange={setKey} />}
			</div>
			<p className="ca-small">{GROUP_HINTS[opt[0]]}</p>
			{annotation && (
				<div role="radiogroup" aria-label="Scope" className="ca-checks">
					<label>
						<input type="radio" name={`impact-scope-${annotation}`} checked={scope === "annotation"} onChange={() => setScope("annotation")} /> Annotation scope{a ? ` (${a.summary})` : ""}
					</label>{" "}
					<label>
						<input type="radio" name={`impact-scope-${annotation}`} checked={scope === "none"} onChange={() => setScope("none")} /> Site-wide
					</label>
				</div>
			)}
			{(!annotation || !hasPath || scope === "none") && (
				<label className="ca-check">
					{IMPACT_TEXT.pagePicker}{" "}
					<input list="ca-impact-pages" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/" aria-label={IMPACT_TEXT.pagePicker} />
					<datalist id="ca-impact-pages">
						{pages.map((p) => (
							<option key={p} value={p} />
						))}
					</datalist>
				</label>
			)}
			{res.error && <Notice tone="error">{res.error}</Notice>}
			{d?.no_annotation && <Notice tone="info">{SEO_TEXT.noAnnotation}</Notice>}
			{d?.not_yet && <Notice tone="info">{IMPACT_TEXT.notYet(d.not_yet)}</Notice>}
			{notices
				.filter((n) => n.startsWith("scope_"))
				.map((n) => (
					<Notice key={n} tone="warning">
						{n === "scope_host_not_applied" ? "Host rules do not apply to Search data; this comparison is not limited by host." : "Query rules apply to Search data only; this comparison is site-wide. Pick a Search metric to compare the query."}
					</Notice>
				))}
			{queryOnTraffic && !report.startsWith("search_") && searchOn && (
				<Button size="sm" onClick={() => setChoice("search_overview:clicks")}>
					{IMPACT_TEXT.suggestSearch}
				</Button>
			)}
			{d && d.before !== undefined && !d.not_yet && (
				<div aria-label="Impact result" className="ca-stack" data-low={low ? "true" : undefined}>
					<dl className="ca-impact-grid">
						<div>
							<dt>
								Before
								<InfoMark text={PANEL_DEFINITIONS.impact_before} />
							</dt>
							<dd>{fmt(d.before, f)}</dd>
						</div>
						<div>
							<dt>
								After
								<InfoMark text={PANEL_DEFINITIONS.impact_after} />
							</dt>
							<dd>{fmt(d.after, f)}</dd>
						</div>
						<div>
							<dt>
								Change
								<InfoMark text={PANEL_DEFINITIONS.impact_change} />
							</dt>
							<dd>
								<ChangeMark c={describeChange(opt[2], d.after, d.before, { format: f, base: den?.before })} />
							</dd>
						</div>
					</dl>
					{d.notable !== undefined && <p className="ca-small">{d.notable ? IMPACT_TEXT.notable : IMPACT_TEXT.noise}</p>}
					{den && (
						<p className="ca-small">
							{fmt(den.before)} {report.startsWith("search_") ? "impressions" : "measured"} before, {fmt(den.after)} after
						</p>
					)}
					{d.complete === false && <Notice tone="warning">{IMPACT_TEXT.incomplete(d.days_after ?? 0, d.window ?? win)}</Notice>}
					{d.series && d.series.length > 0 && <LineChart label={`${opt[3]} before and after`} format={f} metric={opt[2]} height={140} points={d.series.map((p) => ({ t: p.t, v: p.value }))} markers={d.marker ? [{ t: d.marker, label: a?.text ?? d.marker, day: d.marker }] : []} />}
					{d.context && (
						<>
							<h4>{IMPACT_TEXT.context}</h4>
							<dl aria-label={IMPACT_TEXT.context} className="ca-impact-grid ca-impact-context">
								{CONTEXT_KPIS.map((k) => {
									const m = METRICS[k] as { label: string; format: Format };
									const b = d.context?.before?.[k] ?? null;
									const v = d.context?.after?.[k] ?? null;
									return (
										<div key={k}>
											<dt>
												{m.label}
												<InfoMark text={metricDefinition(k) ?? ""} />
											</dt>
											<dd>
												{fmt(v, m.format)} <ChangeMark compact c={describeChange(k, v, b, { format: m.format })} />
											</dd>
										</div>
									);
								})}
							</dl>
						</>
					)}
					{d.overlapping && d.overlapping.length > 0 && (
						<>
							<h4>Other annotations in these windows</h4>
							<ul aria-label="Overlapping annotations">
								{d.overlapping.map((o) => (
									<li key={`${o.id}-${o.ts}`}>
										{dayInZone(o.ts, tz)} {o.text} ({KIND_LABELS[o.kind] ?? o.kind})
									</li>
								))}
							</ul>
						</>
					)}
				</div>
			)}
		</section>
	);
}
