/**
 * SEO tabs of the Search page: Positions, Cannibalization, Changes; and the Changes tab of
 * the Pages page. Every view reads at most 93 days, so `12m` and `ytd` show the fixed text instead of data.
 */
import { Button } from "@cloudflare/kumo";
import { type ReactNode, useState } from "react";
import { daysBetween } from "../../core/time.js";
import type { Params, ReportName } from "../../query/reports/index.js";
import { DIAGNOSIS_LABELS, PATTERN_LABELS, periodLine, SEO_MAX_RANGE_DAYS, SEO_TEXT, type SeoPeriods } from "../../query/reports/seo-copy.js";
import { useReport } from "../api.js";
import { BarList, StackedBars } from "../components/Chart.js";
import { type Column, DataTable, type TableRow } from "../components/DataTable.js";
import { addIs } from "../components/FilterBar.js";
import { toPlainQuery, type View } from "../components/Header.js";
import { Notice, Empty, Field, InfoMark, ROW_MAIN, rowLink } from "../components/ui.js";
import { matchPreset } from "../state.js";
import { ReportNotices } from "../components/ReportNotices.js";

type Source = "all" | "google" | "bing";

import { Segmented } from "../components/ui.js";

export { Segmented };

/** The fixed 93 day text for ranges the SEO views refuse. */
export function seoRangeTooLong(view: View): boolean {
	const p = matchPreset(view.state, view.tz);
	return p === "12m" || p === "ytd" || daysBetween(view.state.from, view.state.to) > SEO_MAX_RANGE_DAYS;
}

const Notices = ({ notices }: { notices: readonly string[] }) => <ReportNotices notices={notices} />;

/** One SEO report request with the page's range and filters; compare never applies. */
function useSeo(view: View, report: ReportName, params: Params, limit = 100) {
	const q = toPlainQuery(view.state);
	return useReport(view.site.id, { report, query: q, params, limit });
}

const n = (key: string, label: string, format: Column["format"] = "number"): Column => ({ key, label, format });
const ctr = (key: string, label = "CTR"): Column => ({ key, label, format: "percent" });
const posCol = (key: string, label = "Position"): Column => ({ key, label, format: "decimal" });
const allNotices = (r: { data: { notices?: unknown }; notices: string[] } | null) => [...(r?.notices ?? []), ...((r?.data.notices as string[] | undefined) ?? [])];

function Guard({ view, children }: { view: View; children: ReactNode }) {
	if (seoRangeTooLong(view)) return <Notice tone="info">{SEO_TEXT.rangeTooLong}</Notice>;
	return <>{children}</>;
}

// ── Positions (34.3) ─────────────────────────────────────────────────────────

/** One part of an SEO tab in a panel with its title; loaded with nothing to show, one line instead. */
function Part({ title, info, empty, children }: { title: string; info?: string; empty: boolean; children: ReactNode }) {
	if (empty) return <p className="ca-panel ca-part-empty">{title}: nothing in this range.</p>;
	return (
		<section className="ca-panel" aria-label={title}>
			<h3>
				{title}
				{info && <InfoMark text={info} />}
			</h3>
			{children}
		</section>
	);
}

export function PositionsTab({ view, source }: { view: View; source: Source }) {
	return (
		<Guard view={view}>
			<PositionsBody view={view} source={source} />
		</Guard>
	);
}

const LIST_LABELS = [
	["up", "Moved up"],
	["down", "Moved down"],
	["new", "New"],
	["lost", "Lost"],
] as const;

function PositionsBody({ view, source }: { view: View; source: Source }) {
	const [dim, setDim] = useState<"query" | "page">("query");
	const [list, setList] = useState<(typeof LIST_LABELS)[number][0]>("up");
	const count = dim === "page" ? "pages" : "queries";
	const bands = useSeo(view, "search_position_bands", { source, dim });
	const series = useSeo(view, "search_position_bands_series", { source, dim });
	const moves = useSeo(view, "search_position_moves", { source, dim });
	const striking = useSeo(view, "search_striking_distance", { source });
	const rows = (bands.data?.data.rows ?? []) as TableRow[];
	const sd = series.data?.data;
	const keys = (sd?.keys as string[] | undefined) ?? [];
	const labels = (sd?.labels as string[] | undefined) ?? keys;
	const md = moves.data?.data;
	const matrix = (md?.matrix as TableRow[] | undefined) ?? [];
	const listRows = ((md?.[list] as Array<Record<string, unknown>> | undefined) ?? []).map((r) => ({ key: String(r.query), ...r })) as TableRow[];
	const sRows = (striking.data?.data.rows ?? []) as TableRow[];
	const ctr13 = (striking.data?.data.totals as Record<string, number | null> | undefined)?.ctr_1_3;
	return (
		<section aria-label="Positions" className="ca-stack">
			<Segmented label="Group by" value={dim} options={[["query", "Queries"], ["page", "Pages"]]} onChange={setDim} />
			{(bands.error ?? series.error ?? moves.error ?? striking.error) && <Notice tone="error">{bands.error ?? series.error ?? moves.error ?? striking.error}</Notice>}
			<Part title="Position bands" info={SEO_TEXT.bands} empty={!!bands.data && !rows.length}>
				{rows.length > 0 && <BarList label="Position bands" rows={rows.map((r) => ({ label: r.key, value: Number(r[count] ?? 0) }))} />}
				<DataTable label="Position bands" columns={[{ key: "key", label: "Band", format: "text" }, n(count, dim === "page" ? "Pages" : "Queries"), n("impressions", "Impressions"), n("clicks", "Clicks"), ctr("ctr")]} rows={rows} loading={bands.loading} />
			</Part>
			<Part title="Bands over time" empty={!!sd && !(sd.series as unknown[] | undefined)?.length}>
				{sd ? <StackedBars label="Bands over time" keys={labels} data={((sd.series as Array<Record<string, unknown>>) ?? []).map((p) => ({ t: String(p.t), parts: keys.map((k) => Number(p[k] ?? 0)) }))} /> : <Empty />}
			</Part>
			<Part title="Movement between bands" info={SEO_TEXT.notable} empty={!!md && !matrix.length && LIST_LABELS.every(([k]) => !(md[k] as unknown[] | undefined)?.length)}>
			<PeriodLine periods={md?.periods as SeoPeriods | undefined} />
			<Notices notices={allNotices(moves.data)} />
			<DataTable label="Movement between bands" columns={[{ key: "from", label: "From", format: "text" }, { key: "to", label: "To", format: "text" }, n("queries", dim === "page" ? "Pages" : "Queries"), n("impressions", "Impressions")]} rows={matrix.map((m) => ({ ...m, key: `${m.from} ${m.to}` })) as TableRow[]} loading={moves.loading} />
			<Segmented label="List" value={list} options={LIST_LABELS} onChange={setList} />
			<DataTable
				label={`${LIST_LABELS.find((l) => l[0] === list)?.[1]} list`}
				columns={[{ key: "key", label: dim === "page" ? "Page" : "Query", format: "text", dim }, n("impressions", "Impressions"), n("clicks", "Clicks"), posCol("position_previous", "Previous position"), posCol("position_current", "Current position"), { key: "band_previous", label: "Previous band", format: "text" }, { key: "band_current", label: "Current band", format: "text" }]}
				rows={listRows}
				onFilter={(d, v) => view.update({ filters: addIs(view.state.filters, d, v) })}
			/>
			</Part>
			<Part title="Striking distance" info={SEO_TEXT.striking} empty={!!striking.data && !sRows.length}>
			<CoverageLine />
			<Notices notices={allNotices(striking.data)} />
			<p className="ca-small">Your CTR in positions 1 to 3: {ctr13 === null || ctr13 === undefined ? SEO_TEXT.top3Insufficient : `${(ctr13 * 100).toFixed(1)}%`}</p>
			<DataTable
				label="Striking distance"
				columns={[{ key: "query", label: "Query", format: "text", dim: "query" }, { key: "page", label: "Page", format: "text", dim: "page" }, n("impressions", "Impressions"), n("clicks", "Clicks"), ctr("ctr"), posCol("position"), n("potential_clicks", `Potential clicks (${SEO_TEXT.estimate})`)]}
				rows={sRows}
				truncated={striking.data?.data.truncated}
				loading={striking.loading}
				onFilter={(d, v) => view.update({ filters: addIs(view.state.filters, d, v) })}
			/>
			</Part>
		</section>
	);
}

export function CoverageLine({ share }: { share?: number | null }) {
	return (
		<p className="ca-coverage ca-small">
			{SEO_TEXT.coverage}
			{share !== undefined && share !== null ? ` Visible share of impressions: ${(share * 100).toFixed(1)}%.` : ""}
		</p>
	);
}

export function PeriodLine({ periods }: { periods: SeoPeriods | undefined }) {
	const text = periodLine(periods);
	return text ? (
		<p className="ca-period ca-small">
			{text}
		</p>
	) : null;
}

// ── Cannibalization (34.2) ───────────────────────────────────────────────────

export function CannibalizationTab({ view, source }: { view: View; source: Source }) {
	return (
		<Guard view={view}>
			<CannibalizationBody view={view} source={source} />
		</Guard>
	);
}

interface Floors {
	minImpressions?: number;
	minShare?: number;
	includeBrand?: boolean;
}

function CannibalizationBody({ view, source }: { view: View; source: Source }) {
	const [mode, setMode] = useState<"queries" | "pages">("queries");
	const [floors, setFloors] = useState<Floors>({});
	const [open, setOpen] = useState<string | null>(null);
	const [drawer, setDrawer] = useState<{ kind: "page" | "query"; value: string } | null>(null);
	const params: Params = { source, ...floors };
	const res = useSeo(view, mode === "queries" ? "search_cannibalization" : "search_cannibalization_pages", params);
	const d = res.data?.data;
	const eff = (d?.floors as { minImpressions: number; minShare: number; includeBrand: boolean } | undefined) ?? null;
	const totals = d?.totals as Record<string, number | null> | undefined;
	const rows = (d?.rows ?? []) as TableRow[];
	const num = (v: string) => (v === "" ? undefined : Math.max(1, Math.round(Number(v))));
	return (
		<section aria-label="Cannibalization" className="ca-panel">
			<CoverageLine share={totals?.visible_share} />
			<div role="group" aria-label="Floors" className="ca-row-end">
				<Field label="Minimum impressions">
					<input type="number" min={1} max={100000} value={floors.minImpressions ?? eff?.minImpressions ?? ""} onChange={(e) => setFloors({ ...floors, minImpressions: num(e.target.value) })} className="ca-num-input" />
				</Field>
				<Field label="Minimum share (percent)">
					<input type="number" min={1} max={50} value={floors.minShare ?? eff?.minShare ?? ""} onChange={(e) => setFloors({ ...floors, minShare: num(e.target.value) })} className="ca-num-input" />
				</Field>
				<label className="ca-check">
					<input type="checkbox" checked={!!floors.includeBrand} onChange={(e) => setFloors({ ...floors, includeBrand: e.target.checked || undefined })} /> Include brand queries
				</label>
			</div>
			<Segmented label="View" value={mode} options={[["queries", "Queries"], ["pages", "Pages"]]} onChange={setMode} />
			{res.error && <Notice tone="error">{res.error}</Notice>}
			<Notices notices={allNotices(res.data).filter((x) => x !== "coverage")} />
			{mode === "queries" ? (
				<>
					<p className="ca-small">
						Patterns
						<InfoMark text={SEO_TEXT.patterns} />
					</p>
					{totals && (
						<p className="ca-small">
							{totals.cannibalized_queries} queries with competing pages, {totals.cannibalized_impressions} impressions
						</p>
					)}
					{res.data && !rows.length && <Empty>No query has competing pages above the floors.</Empty>}
					<div className="ca-table-scroll">
					<table aria-label="Queries with competing pages">
						<thead>
							<tr>
								<th>Query</th>
								<th>Pages</th>
								<th>Impressions</th>
								<th>Clicks</th>
								<th>Pattern</th>
								<th>Best page</th>
							</tr>
						</thead>
						<tbody>
							{rows.flatMap((r) => {
								const q = String(r.query ?? r.key);
								const expanded = open === q;
								const head = (
									<tr key={q} {...rowLink(() => setOpen(expanded ? null : q))}>
										<td>
											<button type="button" {...ROW_MAIN} className="ca-linkbtn ca-rowlink-main" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : q)}>
												{q}
											</button>{" "}
											<Button size="xs" variant="ghost" aria-label={`Pages of ${q}`} onClick={() => setDrawer({ kind: "query", value: q })}>
												Pages
											</Button>
										</td>
										<td>{String(r.pages)}</td>
										<td>{String(r.impressions)}</td>
										<td>{String(r.clicks)}</td>
										<td>{PATTERN_LABELS[String(r.pattern)] ?? String(r.pattern)}</td>
										<td>{String(r.best_page ?? "-")}</td>
									</tr>
								);
								if (!expanded) return [head];
								const pages = (r.page_list as Array<Record<string, unknown>>) ?? [];
								return [
									head,
									...pages.map((p) => (
										<tr key={`${q}\u0000${String(p.page)}`} {...rowLink(() => setDrawer({ kind: "page", value: String(p.page) }))} className="ca-subrow ca-rowlink">
											<td>
												<button type="button" {...ROW_MAIN} className="ca-linkbtn ca-rowlink-main" onClick={() => setDrawer({ kind: "page", value: String(p.page) })}>
													{String(p.page)}
												</button>
											</td>
											<td />
											<td>
												{String(p.impressions)} ({((Number(p.impressions_share) || 0) * 100).toFixed(1)}%)
											</td>
											<td>
												{String(p.clicks)} ({((Number(p.clicks_share) || 0) * 100).toFixed(1)}%)
											</td>
											<td>{p.position === null ? "-" : Number(p.position).toFixed(2)}</td>
											<td />
										</tr>
									)),
								];
							})}
						</tbody>
					</table>
					</div>
				</>
			) : (
				<DataTable
					label="Competing pages"
					columns={[{ key: "key", label: "Page", format: "text" }, n("queries", "Queries"), n("overlapping_queries", "Overlapping queries"), { key: "overlapping_queries_pct", label: "Share of queries", format: "percent" }, n("impressions", "Impressions"), n("overlapping_impressions", "Overlapping impressions"), { key: "overlapping_impressions_pct", label: "Share of impressions", format: "percent" }, n("clicks", "Clicks"), n("overlapping_clicks", "Overlapping clicks")]}
					rows={rows}
					truncated={d?.truncated}
					loading={res.loading}
					action={{ label: "Competitors", onClick: (r) => setDrawer({ kind: "page", value: String(r.key) }) }}
				/>
			)}
			{drawer && <Drawer view={view} source={source} floors={floors} target={drawer} onClose={() => setDrawer(null)} />}
		</section>
	);
}

function Drawer({ view, source, floors, target, onClose }: { view: View; source: Source; floors: Floors; target: { kind: "page" | "query"; value: string }; onClose(): void }) {
	const page = target.kind === "page";
	const res = useSeo(view, page ? "search_cannibalization_page" : "search_cannibalization_query", page ? { source, ...floors, page: target.value } : { source, query: target.value });
	const d = res.data?.data;
	return (
		<aside role="dialog" aria-label={page ? `Competing pages of ${target.value}` : `Pages of ${target.value}`} className="ca-dialog">
			<div className="ca-spread">
				<h3>{target.value}</h3>
				<Button size="sm" onClick={onClose}>
					Close
				</Button>
			</div>
			{!page && source !== "google" && <p className="ca-small">Bing: {SEO_TEXT.bingOnRequest}</p>}
			{res.error && <Notice tone="error">{res.error}</Notice>}
			{page ? (
				<>
					<DataTable label="Competing pages" columns={[{ key: "key", label: "Other page", format: "text" }, n("shared_queries", "Shared queries"), n("shared_impressions_this", "Impressions here"), n("shared_impressions_other", "Impressions there")]} rows={((d?.pairs as Array<Record<string, unknown>> | undefined) ?? []).map((p) => ({ key: String(p.other_page), ...p })) as TableRow[]} loading={res.loading} />
					<DataTable label="Shared queries" columns={[{ key: "key", label: "Query", format: "text" }, { key: "other_page", label: "Other page", format: "text" }, n("impressions_this", "Impressions here"), posCol("position_this", "Position here"), n("impressions_other", "Impressions there"), posCol("position_other", "Position there")]} rows={((d?.queries as Array<Record<string, unknown>> | undefined) ?? []).map((q) => ({ key: String(q.query), ...q })) as TableRow[]} />
				</>
			) : (
				<DataTable label="Pages of this query" columns={[{ key: "key", label: "Page", format: "text" }, n("impressions", "Impressions"), { key: "impressions_share", label: "Share", format: "percent" }, n("clicks", "Clicks"), posCol("position")]} rows={((d?.page_list as Array<Record<string, unknown>> | undefined) ?? []).map((p) => ({ key: String(p.page), ...p })) as TableRow[]} loading={res.loading} />
			)}
		</aside>
	);
}

// ── Changes (34.5) ───────────────────────────────────────────────────────────

function moverColumns(label: string, dim: "page" | "query", metric: string): Column[] {
	return [
		{ key: "key", label, format: "text", dim },
		n("current", `Current ${metric}`),
		n("previous", `Previous ${metric}`),
		n("delta", "Change"),
		{ key: "delta_pct", label: "Change (percent)", format: "percent" },
		...(metric === "page views" ? [] : [posCol("position_current", "Position now"), posCol("position_previous", "Position before")]),
	];
}

/** Rows that are not notable render muted; "Notable only" hides them. */
function MoversTable({ view, label, rows, columns, loading, notableOnly }: { view: View; label: string; rows: TableRow[]; columns: Column[]; loading: boolean; notableOnly: boolean }) {
	const shown = notableOnly ? rows.filter((r) => r.notable === true) : rows;
	return (
		<div className="ca-movers">
			<DataTable label={label} columns={[...columns, { key: "notable_label", label: "Notable", format: "text" }]} rows={shown.map((r) => ({ ...r, notable_label: r.notable ? "yes" : "" }))} loading={loading} onFilter={(d, v) => view.update({ filters: addIs(view.state.filters, d, v) })} />
		</div>
	);
}

export function SearchChangesTab({ view, source }: { view: View; source: Source }) {
	return (
		<Guard view={view}>
			<SearchChangesBody view={view} source={source} />
		</Guard>
	);
}

function SearchChangesBody({ view, source }: { view: View; source: Source }) {
	const [dim, setDim] = useState<"page" | "query">("page");
	const [direction, setDirection] = useState<"up" | "down">("down");
	const [metric, setMetric] = useState<"clicks" | "impressions">("clicks");
	const [notableOnly, setNotableOnly] = useState(false);
	const movers = useSeo(view, "search_movers", { source, dim, direction, metric });
	const decay = useSeo(view, "search_decay", { source });
	const rows = (movers.data?.data.rows ?? []) as TableRow[];
	const dRows = (decay.data?.data.rows ?? []) as TableRow[];
	return (
		<section aria-label="Changes" className="ca-stack">
			<Segmented label="Group by" value={dim} options={[["page", "Pages"], ["query", "Queries"]]} onChange={setDim} />
			<Segmented label="Direction" value={direction} options={[["up", "Rising"], ["down", "Declining"]]} onChange={setDirection} />
			<Segmented label="Metric" value={metric} options={[["clicks", "Clicks"], ["impressions", "Impressions"]]} onChange={setMetric} />
			<label>
				<input type="checkbox" checked={notableOnly} onChange={(e) => setNotableOnly(e.target.checked)} /> Notable only
				<InfoMark text={SEO_TEXT.notable} />
			</label>
			<PeriodLine periods={movers.data?.data.periods as SeoPeriods | undefined} />
			{movers.error && <Notice tone="error">{movers.error}</Notice>}
			<Notices notices={allNotices(movers.data)} />
			<Part title={`${direction === "up" ? "Rising" : "Declining"} ${dim === "page" ? "pages" : "queries"}`} empty={false}>
				<MoversTable view={view} label={`${direction === "up" ? "Rising" : "Declining"} ${dim === "page" ? "pages" : "queries"}`} rows={rows} columns={moverColumns(dim === "page" ? "Page" : "Query", dim, metric)} loading={movers.loading} notableOnly={notableOnly} />
			</Part>
			{decay.error && <Notice tone="error">{decay.error}</Notice>}
			<Part title="Declining over three periods" info={SEO_TEXT.decay} empty={!!decay.data && !dRows.length}>
				<PeriodLine periods={decay.data?.data.periods as SeoPeriods | undefined} />
				<DataTable
					label="Declining over three periods"
					columns={[{ key: "key", label: "Page", format: "text", dim: "page" }, n("oldest", "Oldest"), n("middle", "Middle"), n("current", "Current"), n("loss", "Loss"), posCol("position_oldest", "Position then"), posCol("position_current", "Position now"), { key: "diagnosis_label", label: "Diagnosis", format: "text" }]}
					rows={dRows.map((r) => ({ ...r, diagnosis_label: DIAGNOSIS_LABELS[String(r.diagnosis)] ?? "" }))}
					loading={decay.loading}
				/>
			</Part>
		</section>
	);
}

/** Changes tab of the Pages page: page views of the daily summaries, so no raw window limit. */
export function TrafficChangesTab({ view }: { view: View }) {
	return (
		<Guard view={view}>
			<TrafficChangesBody view={view} />
		</Guard>
	);
}

function TrafficChangesBody({ view }: { view: View }) {
	const [direction, setDirection] = useState<"up" | "down">("down");
	const [notableOnly, setNotableOnly] = useState(false);
	const movers = useSeo(view, "traffic_movers", { direction });
	const decay = useSeo(view, "traffic_decay", {});
	return (
		<section aria-label="Changes" className="ca-stack">
			<Segmented label="Direction" value={direction} options={[["up", "Rising"], ["down", "Declining"]]} onChange={setDirection} />
			<label>
				<input type="checkbox" checked={notableOnly} onChange={(e) => setNotableOnly(e.target.checked)} /> Notable only
				<InfoMark text={SEO_TEXT.notable} />
			</label>
			<PeriodLine periods={movers.data?.data.periods as SeoPeriods | undefined} />
			{movers.error && <Notice tone="error">{movers.error}</Notice>}
			<Notices notices={allNotices(movers.data)} />
			<Part title={`${direction === "up" ? "Rising" : "Declining"} pages`} empty={false}>
				<MoversTable view={view} label={`${direction === "up" ? "Rising" : "Declining"} pages`} rows={(movers.data?.data.rows ?? []) as TableRow[]} columns={moverColumns("Page", "page", "page views")} loading={movers.loading} notableOnly={notableOnly} />
			</Part>
			<Part title="Declining over three periods" empty={!!decay.data && !(decay.data.data.rows ?? []).length}>
				<PeriodLine periods={decay.data?.data.periods as SeoPeriods | undefined} />
				<DataTable label="Page views declining over three periods" columns={[{ key: "key", label: "Page", format: "text", dim: "page" }, n("oldest", "Oldest"), n("middle", "Middle"), n("current", "Current"), n("loss", "Loss")]} rows={(decay.data?.data.rows ?? []) as TableRow[]} loading={decay.loading} />
			</Part>
		</section>
	);
}
