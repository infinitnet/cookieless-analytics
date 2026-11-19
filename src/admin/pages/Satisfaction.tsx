/**
 * Satisfaction (own page): click quality of organic search sessions with the comparison, a trend per rate, the best
 * and worst landing pages by score, breakdowns by session dimension and a drawer per landing page. Every number comes
 * from the `satisfaction` and `satisfaction_series` reports, which cover organic search sessions only; groupings use
 * `params.by`, the lists `params.rank`.
 */
import { Button } from "@cloudflare/kumo";
import { useEffect, useRef, useState } from "react";
import type { Dim, Filter } from "../../query/filters.js";
import type { Annotation } from "../../query/reports/base.js";
import { ORGANIC_SEARCH, SATISFACTION_MIN_MEASURED, SATISFACTION_RAW_ONLY, type SatisfactionBy } from "../../query/reports/satisfaction-copy.js";
import type { Granularity } from "../../query/reports/timeseries.js";
import { useReport } from "../api.js";
import { annotationMarkers, LineChart } from "../components/Chart.js";
import type { Column, TableRow } from "../components/DataTable.js";
import { addIs } from "../components/FilterBar.js";
import { fmt } from "../components/format.js";
import { Shell, toQuery, type View } from "../components/Header.js";
import { annotationAction } from "../components/AnnotationPopover.js";
import { PANEL_DEFINITIONS } from "../../charts/definitions.js";
import { AnnotationsToggle, type Caveat, Empty, InfoMark, Loading, Notice, Segmented, Tabs } from "../components/ui.js";
import { presetRange } from "../state.js";
import { activeTab, ReportPanel, tabParam } from "./report.js";
import { type MetricDef, MetricChart } from "../components/MetricChart.js";
import { ErrorScope, errorRange, SETTINGS_HREF, usePageError } from "../components/ReportNotices.js";

/**
 * Preset filter sets inside the fixed organic search scope: added as chips, so they combine with every other filter
 * and segment. Organic sessions store the referrer host (google.com, google.co.uk), so the source matches by prefix.
 */
export const SATISFACTION_PRESETS: ReadonlyArray<readonly [string, readonly Filter[]]> = [
	["Google organic", [{ dim: "source", op: "prefix", values: ["google."] }]],
	["Bing organic", [{ dim: "source", op: "prefix", values: ["bing."] }]],
	["Chrome", [{ dim: "browser", op: "is", values: ["Chrome"] }]],
];

/** The scope of the reports (organic search sessions), shown in the header as a fixed chip that cannot be removed; the channel leaves the add menu. */
export const SATISFACTION_FIXED: readonly Filter[] = [ORGANIC_SEARCH];

/** Add preset filters; `is` values merge into an existing chip, other filters are added once. */
export function addPreset(filters: readonly Filter[], preset: readonly Filter[]): Filter[] {
	let out = [...filters];
	for (const f of preset) {
		if (f.op === "is") out = addIs(out, f.dim, f.values[0] as string);
		else if (!out.some((x) => JSON.stringify(x) === JSON.stringify(f))) out.push(f);
	}
	return out;
}

/** The rates of the trend chart: key, card label, short label, info text. */
export const SAT_RATES = [
	["pct_long", "Long clicks", "Long clicks", undefined],
	["pct_short", "Short clicks", "Short clicks", undefined],
	["pct_bad", "Bad experience", "Bad experience", undefined],
	["pogo_stick_rate", "Pogo-sticking (estimate)", "Pogo-sticking", "pogo"],
	["returned_from_search_rate", "Returned from search (estimate)", "Returned from search", "returned"],
] as const satisfies ReadonlyArray<readonly [string, string, string, Caveat | undefined]>;
type Rate = (typeof SAT_RATES)[number][0];

/** Score in points: 0.75 becomes "75", -1.5714 becomes "-157". */
export const points = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 100)) : "n/a");

/** Table rows with the score in points; a change of a signed score means nothing, so its previous value is dropped. */
export const scoreRows = (rows: TableRow[]): TableRow[] =>
	rows.map((r) => ({ ...r, score: typeof r.score === "number" ? Math.round(r.score * 100) : r.score, ...(r.previous ? { previous: { ...r.previous, score: null } } : {}) }));


const RATE_COLUMNS: Column[] = [
	{ key: "sessions", label: "Sessions", note: (r) => `${String(r.measured ?? 0)} measured` },
	{ key: "avg_duration", label: "Avg. duration", format: "duration", caveat: "duration" },
	{ key: "avg_engaged", label: "Avg. active time", format: "duration", caveat: "active_time", optional: true },
	{ key: "measured_rate", label: "Measured sessions", format: "percent", caveat: "satisfaction_measured", optional: true },
	{ key: "pct_long", label: "Long clicks %", format: "percent" },
	{ key: "pct_short", label: "Short clicks %", format: "percent" },
	{ key: "pct_bad", label: "Bad experience %", format: "percent" },
	{ key: "pogo_stick_rate", label: "Pogo-sticking % (estimate)", format: "percent", caveat: "pogo" },
	{ key: "returned_from_search_rate", label: "Returned from search % (estimate)", format: "percent", caveat: "returned" },
	{ key: "search_reentry_rate", label: "Search re-entry % (estimate)", format: "percent", caveat: "satisfaction_estimate" },
];

/** Groupings of the breakdown tabs: `params.by`, tab label, first column label and its filter dim. */
const GROUPS: ReadonlyArray<readonly [SatisfactionBy, string, string, Dim]> = [
	["entry", "Landing pages", "Landing page", "entry"],
	// The source of an organic search session is its search engine.
	["source", "Search engines", "Search engine", "source"],
	["device", "Devices", "Device", "device"],
	["country", "Countries", "Country", "country"],
	["browser", "Browsers", "Browser", "browser"],
];

const columnsFor = (by: SatisfactionBy): Column[] => {
	const [, , label, dim] = GROUPS.find((g) => g[0] === by) ?? GROUPS[0]!;
	return [
		{ key: "key", label, format: "text", dim },
		{ key: "score", label: "Score", format: "number", caveat: "satisfaction_score" },
		...RATE_COLUMNS,
		...(by === "entry" ? [{ key: "back_nav_rate", label: "Back/forward loads % (estimate)", format: "percent", caveat: "satisfaction_estimate" } as Column] : []),
	];
};

type Thresholds = { long_click_seconds: number; bad_experience_seconds: number };

/** The answer of a range before the detailed window (the message may name the first detailed day). */
const isRawOnly = (e: string | null | undefined) => !!e?.startsWith(SATISFACTION_RAW_ONLY);

/** The detailed window notice with one click to a range inside it: from the first detailed day when the answer names it, else 30 days, then 7. */
function RawOnly({ view, error }: { view: View; error: string }) {
	const fix = errorRange(error, view.state.to);
	const r30 = presetRange("30d", view.tz);
	const at30 = view.state.from === r30.from && view.state.to === r30.to;
	const next = fix ? { range: { from: fix.from, to: fix.to }, label: fix.label } : at30 ? { range: presetRange("7d", view.tz), label: "Show the last 7 days" } : { range: r30, label: "Show the last 30 days" };
	return (
		<Notice tone="info" label="Range" action={<Button size="sm" onClick={() => view.update(next.range)}>{next.label}</Button>}>
			{error}
		</Notice>
	);
}

/** The figures of the page: the five rates and active time toggle series of one chart; the measured share is a plain figure. */
const SAT_METRICS: readonly MetricDef[] = [
	...SAT_RATES.map(([key, label]) => ({ key, label, format: "percent" as const })),
	{ key: "avg_engaged", label: "Avg. active time", format: "duration" },
	{ key: "measured_rate", label: "Measured share", format: "percent", selectable: false },
];

/** Sessions with no measured end, left out of every rate; nothing when all are measured. */
function Unmeasured({ totals }: { totals: Record<string, unknown> | undefined }) {
	const sessions = typeof totals?.sessions === "number" ? totals.sessions : 0;
	const unmeasured = sessions - (typeof totals?.measured === "number" ? totals.measured : 0);
	if (unmeasured <= 0) return null;
	return (
		<p className="ca-small ca-sat-unmeasured">
			{fmt(unmeasured, "number")} of {fmt(sessions, "number")} sessions have no measured end (the visitor closed the app before any engagement update arrived, the last update was lost, or the script was blocked). They count as sessions but are left out of every rate.
		</p>
	);
}

/** Trend of one rate in the page drawer with the comparison and annotation markers; the switch picks the rate. */
function Trend({ view, query, metric, onMetric, title }: { view: View; query: ReturnType<typeof toQuery>; metric: Rate; onMetric: (m: Rate) => void; title: string }) {
	const { state, update, site, tz } = view;
	const series = useReport(site.id, { report: "satisfaction_series", query });
	if (isRawOnly(series.error)) return null;
	const points = series.data?.data.series ?? [];
	const compare = series.data?.data.compareSeries as Array<Record<string, unknown>> | undefined;
	const gran = (series.data?.data.granularity ?? "day") as Granularity;
	const label = SAT_RATES.find((r) => r[0] === metric)?.[2] ?? metric;
	return (
		<section className="ca-panel" aria-label={title} aria-busy={series.loading}>
			<h3>
				{title}
				<InfoMark text={PANEL_DEFINITIONS.satisfaction_series} />
			</h3>
			{series.error && <Notice tone="error">{series.error}</Notice>}
			<div className="ca-chart-toolbar ca-spread">
				<Segmented label="Rate" showLabel={false} value={metric} options={SAT_RATES.map(([k, , short]) => [k, short] as const)} onChange={onMetric} />
				<AnnotationsToggle on={state.annotations !== false} onChange={(on) => update({ annotations: on })} />
			</div>
			{series.loading && !points.length ? (
				<Loading />
			) : (
				<LineChart
					label={`${label} over time`}
					format="percent"
					metric={metric}
					points={points.map((p) => ({ t: p.t, v: (p[metric] as number | null) ?? null }))}
					compare={compare?.map((p) => (p[metric] as number | null) ?? null)}
					markers={state.annotations !== false ? annotationMarkers((series.data?.data.annotations ?? []) as Annotation[], gran, tz) : []}
					markerActions={annotationAction}
				/>
			)}
		</section>
	);
}

/** Best or worst landing pages by score; each row is one button that opens the page drawer. */
export function RankList({ view, rank, onOpen }: { view: View; rank: "best" | "worst"; onOpen: (page: string) => void }) {
	const { state, site } = view;
	const res = useReport(site.id, { report: "satisfaction", query: toQuery(state, "satisfaction"), params: { rank }, limit: 5 });
	const rows = (res.data?.data.rows ?? []) as TableRow[];
	const title = rank === "best" ? "Best pages" : "Worst pages";
	return (
		<section className="ca-panel" aria-label={title} aria-busy={res.loading}>
			<h3>
				{title}
				<InfoMark text={PANEL_DEFINITIONS[rank === "best" ? "best_pages" : "worst_pages"]} />
			</h3>
			<p className="ca-small">Score: long click rate minus bad experience and pogo-sticking rates, in points. Pages with at least {SATISFACTION_MIN_MEASURED} measured sessions.</p>
			{res.error && !isRawOnly(res.error) && <Notice tone="error">{res.error}</Notice>}
			{res.loading && !rows.length ? (
				<Loading />
			) : !rows.length ? (
				<Empty hint={`A page is ranked once it has ${SATISFACTION_MIN_MEASURED} measured sessions in the range. Try a longer range or fewer filters.`}>No landing page has enough measured sessions yet.</Empty>
			) : (
				<ol className="ca-rank">
					{rows.map((r) => {
						const prev = (r.previous as Record<string, unknown> | null | undefined)?.score;
						const d = typeof r.score === "number" && typeof prev === "number" ? Math.round((r.score - prev) * 100) : null;
						return (
							<li key={r.key}>
								<button type="button" className="ca-rank-row" onClick={() => onOpen(r.key)} aria-label={`${r.key}: score ${points(r.score)}. Open details`}>
									<span className="ca-rank-head">
										<span className="ca-rank-page">{r.key}</span>
										<span className="ca-rank-score">{points(r.score)}</span>
									</span>
									<span className="ca-rank-parts">
										<span>{fmt(r.sessions, "number")} sessions</span>
										<span>Long clicks {fmt(r.pct_long, "percent")}</span>
										<span>Bad experience {fmt(r.pct_bad, "percent")}</span>
										<span>Pogo-sticking (est.) {fmt(r.pogo_stick_rate, "percent")}</span>
										{d !== null && (
											<span className="ca-delta" data-judge={d === 0 ? undefined : d > 0 ? "better" : "worse"}>
												{d > 0 ? "+" : ""}
												{d} points vs previous
											</span>
										)}
									</span>
								</button>
							</li>
						);
					})}
				</ol>
			)}
		</section>
	);
}

/** One landing page: its figures, trend, breakdowns and pogo-sticking per search engine; the view carries an `entry` filter. */
export function PageDrawer({ view, page, onClose }: { view: View; page: string; onClose: () => void }) {
	const ref = useRef<HTMLElement | null>(null);
	useEffect(() => ref.current?.focus(), [page]);
	const [metric, setMetric] = useState<Rate>("pct_long");
	const [by, setBy] = useState<SatisfactionBy>("device");
	const entry: Filter = { dim: "entry", op: "is", values: [page] };
	// Value clicks inside the drawer filter the whole page; the drawer's own entry filter is not carried over.
	const sub: View = { ...view, state: { ...view.state, filters: [...view.state.filters, entry] }, update: (next) => view.update(next.filters ? { ...next, filters: next.filters.filter((f) => f !== entry) } : next) };
	return (
		<aside ref={ref} tabIndex={-1} className="ca-drawer ca-panel ca-sat-drawer" aria-label={`Search Satisfaction of ${page}`}>
			<div className="ca-spread">
				<h2>
					Landing page {page}
					<InfoMark text={PANEL_DEFINITIONS.landing_page} />
				</h2>
				<Button size="sm" variant="ghost" onClick={onClose}>
					Close
				</Button>
			</div>
			<Trend view={sub} query={toQuery(sub.state, "satisfaction_series")} metric={metric} onMetric={setMetric} title="Rates over time" />
			<ReportPanel
				view={sub}
				report="satisfaction"
				params={{ by: "source" }}
				title="Pogo-sticking by search engine"
				info="pogo_engines"
				columns={[
					{ key: "key", label: "Search engine", format: "text", dim: "source" },
					{ key: "search_measured", label: "Measured search sessions" },
					{ key: "pogo_stick_rate", label: "Pogo-sticking % (estimate)", format: "percent", caveat: "pogo" },
					{ key: "returned_from_search_rate", label: "Returned from search % (estimate)", format: "percent", caveat: "returned" },
				]}
			/>
			<Segmented label="Break down by" value={by} options={GROUPS.filter((g) => g[0] !== "entry").map(([k, l]) => [k, l] as const)} onChange={setBy} />
			<ReportPanel view={sub} report="satisfaction" params={{ by }} title={GROUPS.find((g) => g[0] === by)?.[1] ?? by} columns={columnsFor(by)} pageSize={10} mapRows={scoreRows} />
		</aside>
	);
}

/** The page body: everything above reads the header's range, comparison, segment and filters. */
export function SatisfactionBody({ view }: { view: View }) {
	return (
		<ErrorScope view={view}>
			<SatisfactionReport view={view} />
		</ErrorScope>
	);
}

function SatisfactionReport({ view }: { view: View }) {
	const { state, update, site } = view;
	const query = toQuery(state, "satisfaction");
	const totals = useReport(site.id, { report: "satisfaction", query, limit: 1 });
	usePageError(isRawOnly(totals.error) ? null : totals.error);
	const tab = activeTab(GROUPS, state.tab);
	const [find, setFind] = useState("");
	const [drawer, setDrawer] = useState<string | null>(null);
	const opener = useRef<HTMLElement | null>(null);
	const open = (page: string) => {
		opener.current = document.activeElement as HTMLElement | null;
		setDrawer(page);
	};
	const close = () => {
		setDrawer(null);
		opener.current?.focus();
	};
	if (totals.error && isRawOnly(totals.error)) return <RawOnly view={view} error={totals.error} />;
	const th = totals.data?.data.thresholds as Thresholds | undefined;
	const needle = find.trim().toLowerCase();
	return (
		<>
			<div className="ca-presets ca-actions" role="group" aria-label="Presets">
				<span className="ca-small ca-sat-scope">Organic search sessions only, every search engine. Narrow to:</span>
				{SATISFACTION_PRESETS.map(([name, preset]) => (
					<Button size="sm" key={name} onClick={() => update({ filters: addPreset(state.filters, preset) })}>
						{name}
					</Button>
				))}
			</div>
			<MetricChart
				id="satisfaction"
				view={view}
				metrics={SAT_METRICS}
				defaults={["pct_long"]}
				report="satisfaction_series"
				totals={totals.data?.data.totals}
				compareTotals={totals.data?.data.compareTotals as Record<string, unknown> | null | undefined}
				title="Rates over time"
				annotations
				markerActions={annotationAction}
			/>
			<Unmeasured totals={totals.data?.data.totals} />
			<div className="ca-panels">
				<RankList view={view} rank="best" onOpen={open} />
				<RankList view={view} rank="worst" onOpen={open} />
			</div>
			{drawer && <PageDrawer key={drawer} view={view} page={drawer} onClose={close} />}
			<Tabs label="Break down by" tabs={GROUPS.map(([k, l]) => [k, l] as const)} value={tab} onChange={(id) => update({ tab: tabParam(GROUPS, id) })} />
			<div role="tabpanel" className="ca-stack" aria-label={GROUPS.find((g) => g[0] === tab)?.[1]}>
				{tab === "entry" && (
					<label className="ca-field ca-sat-find">
						<span className="ca-field-label">Find a landing page</span>
						<input type="search" value={find} placeholder="/blog/" onChange={(e) => setFind(e.target.value)} />
					</label>
				)}
				<ReportPanel
					key={tab}
					view={view}
					report="satisfaction"
					title={GROUPS.find((g) => g[0] === tab)?.[1] ?? tab}
					params={tab === "entry" ? undefined : { by: tab }}
					limit={tab === "entry" ? 1000 : 100}
					columns={columnsFor(tab)}
					mapRows={(rows) => scoreRows(needle ? rows.filter((r) => r.key.toLowerCase().includes(needle)) : rows)}
					action={tab === "entry" ? { label: "Details", onClick: (r) => open(r.key) } : undefined}
				/>
			</div>
			{th && (
				<p className="ca-thresholds ca-small">
					Thresholds: long click above {th.long_click_seconds} s, bad experience below {th.bad_experience_seconds} s. Change them in <a href={`${SETTINGS_HREF}?tab=sessions`}>Settings</a>; every stored session is reclassified at once.
				</p>
			)}
		</>
	);
}

export default function Satisfaction() {
	return (
		<Shell title="Search Satisfaction" docs="Search-Satisfaction" fixedFilters={SATISFACTION_FIXED}>
			{(v) => <SatisfactionBody key={v.site.id} view={v} />}
		</Shell>
	);
}
