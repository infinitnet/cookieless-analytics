/** Building blocks of the report pages: one report as a table panel, and a page of tabs inside the shell. */
import { type ReactNode, useState } from "react";
import { daysBetween } from "../../core/time.js";
import type { Dim } from "../../query/filters.js";
import type { Params, ReportName, ReportResult } from "../../query/reports/index.js";
import { exportReport, type ReportState, useReport } from "../api.js";
import { otherCurrencies } from "../../dashboards/tiles.js";
import { type Column, DataTable, type DataTableProps, type TableRow, useColumns } from "../components/DataTable.js";
import { METRICS } from "../components/format.js";
import { type MetricDef, MetricChart } from "../components/MetricChart.js";
import { addIs } from "../components/FilterBar.js";
import { Shell, toQuery, type View } from "../components/Header.js";
import { type Caveat, InfoMark, KebabMenu, Notice, Tabs } from "../components/ui.js";
import { adminHref, ErrorScope, ReportError, ReportNotices, usePageError } from "../components/ReportNotices.js";

/** Cards of a page trend from the shared metric labels; visitors carry their caveat. */
export const trendMetrics = (...keys: string[]): MetricDef[] =>
	keys.map((key) => ({ key, label: METRICS[key]?.label ?? key, format: METRICS[key]?.format ?? "number", ...(key === "visitors" ? { caveat: "visitors" as const } : {}) }));

/**
 * The trend above a report page's tables: `timeseries` with the page's range, comparison and
 * filters, one call that reads the daily summaries like every other series; the cards are the sums of its buckets.
 */
export function PageTrend({ view, id, metrics, title }: { view: View; id: string; metrics: readonly MetricDef[]; title?: string }) {
	// Hourly buckets (2 days or less) cannot sum visitors: the cards read one overview request then, as Overview does.
	const hourly = daysBetween(view.state.from, view.state.to) <= 2;
	const ov = useReport(view.site.id, hourly ? { report: "overview", query: toQuery(view.state) } : null);
	const d = ov.data?.data;
	const figures = hourly && d?.totals ? { totals: d.totals, compareTotals: (d.compareTotals as Record<string, unknown> | null | undefined) ?? null } : {};
	return <MetricChart id={id} view={view} metrics={metrics} defaults={metrics.map((m) => m.key)} {...figures} {...(title ? { title } : {})} />;
}

/** Notices of a report answer: top level and inside `data`. */
export const allNotices = (r: ReportResult | null | undefined): string[] => [...(r?.notices ?? []), ...((r?.data.notices as string[] | undefined) ?? [])];

const EXPORT_FORMATS = [["csv", "CSV"], ["json", "JSON"]] as const;

/** Session metric columns shared by the session breakdowns (channels, sources, countries and so on). */
export function sessionColumns(label: string, dim?: Dim): Column[] {
	return [
		{ key: "key", label, format: "text", ...(dim ? { dim } : {}) },
		{ key: "visitors", label: "Visitors" },
		{ key: "sessions", label: "Sessions" },
		{ key: "bounce_rate", label: "Bounce rate", format: "percent" },
		{ key: "avg_duration", label: "Avg. duration", format: "duration" },
	];
}

export interface PanelProps {
	view: View;
	report: ReportName;
	columns: readonly Column[];
	/** Required: a panel head without a title would hold only the menu. */
	title: string;
	caveat?: Caveat;
	params?: Params;
	limit?: number;
	pageSize?: number;
	/** Reshape rows for display (for example lists to text). */
	mapRows?: (rows: TableRow[]) => TableRow[];
	/** Notices are shown once per page; panels on a page with its own notices pass false. */
	showNotices?: boolean;
	action?: DataTableProps["action"];
	/** Extra content above the table, from the report answer (a chart, a total). */
	extra?: (res: ReportResult) => ReactNode;
	/** Add the Revenue and Orders columns through `withRevenue` when the site has revenue. */
	revenue?: boolean;
	/** "Show all" under the table: the admin page path of the full report (`/sources?tab=sources`). */
	more?: string;
	/** Text of the `more` link when it leads elsewhere than the full report (default "Show all"). */
	moreLabel?: string;
}

/** Rows of the loading and "Not loaded" placeholder: the height of a short table, so panels do not jump. */
const SKELETON_ROWS = 8;
/** A placeholder the height of a loaded table of `rows` rows (36 px each, plus the header). */
export function TableSkeleton({ rows = SKELETON_ROWS, children }: { rows?: number; children?: ReactNode }) {
	return (
		<div className="ca-chart-skel ca-table-skel" style={{ minHeight: 36 * (rows + 1) }} aria-busy={children ? undefined : true}>
			{children ?? <span className="ca-sr">Loading</span>}
		</div>
	);
}

/**
 * The `revenue` report of the view (currency `cur` or the site default); `data.hasRevenue` decides whether
 * revenue surfaces show at all, so a site without revenue sees none. Pass `on = false` to skip the request.
 */
export function useRevenue(view: View, on = true): ReportState {
	const { state, site } = view;
	return useReport(site.id, on ? { report: "revenue", query: toQuery(state), ...(state.cur ? { params: { currency: state.cur } } : {}) } : null);
}

/** "Other currencies: 120.00 EUR (3 orders)." under revenue figures; nothing when there are none. */
export function OtherCurrencies({ data }: { data: ReportResult["data"] | undefined }) {
	const list = ((data?.currencies ?? []) as Array<{ currency: string; revenue: number; orders: number }>).filter((c) => c.currency !== data?.currency);
	if (!list.length) return null;
	return (
		<p className="ca-other-currencies ca-small">
			Other currencies: {otherCurrencies(list)}.
		</p>
	);
}

/** Names of the two sides of a segment comparison, or undefined. */
export const compareNames = (r: ReportResult | null | undefined): readonly [string, string] | undefined =>
	r?.compare === "segment" && r.compareSegment ? [r.segment?.name ?? "All visitors", r.compareSegment.name] : undefined;

/** One report as a table: click a value to filter, export, notices and errors. */
export function ReportPanel({ view, report, columns: baseColumns, title, caveat, params: baseParams, limit = 100, pageSize, mapRows, showNotices = true, action, extra, revenue, more, moreLabel }: PanelProps) {
	const { state, update, site } = view;
	const query = toQuery(state, report);
	const rev = useRevenue(view, !!revenue);
	const withRev = !!revenue && rev.data?.data.hasRevenue === true;
	const params: Params | undefined = withRev ? { ...baseParams, withRevenue: true, ...(state.cur ? { currency: state.cur } : {}) } : baseParams;
	const req = { report, query, limit, ...(params ? { params } : {}) };
	// Wait for the revenue probe, so a site with revenue does not load the table twice.
	const res = useReport(site.id, revenue && rev.loading ? null : req);
	const code = (res.data?.data.currency as string | undefined) ?? (rev.data?.data.currency as string | undefined) ?? "";
	// Refunds and net revenue next to revenue when the range holds refunds (the revenue probe's totals).
	const refunds = Number(rev.data?.data.totals?.refunds ?? 0) > 0;
	const money = (key: string, l: string): Column => ({ key, label: `${l} (${code})`, format: `money:${code}` });
	const columns: readonly Column[] =
		withRev && code
			? [...baseColumns, money("revenue", "Revenue"), ...(refunds ? [money("refunds", "Refunds"), money("net_revenue", "Net revenue")] : []), { key: "orders", label: "Orders" }]
			: baseColumns;
	const [exportError, setExportError] = useState<string | null>(null);
	// Inside a page's error scope the error shows once on top, and the panel only says "Not loaded.".
	const scoped = usePageError(res.error);
	const skeletonRows = Math.min(pageSize ?? SKELETON_ROWS, limit, SKELETON_ROWS);
	const all = (res.data?.data.rows ?? []) as TableRow[];
	const rows = mapRows ? mapRows(all) : all;
	// One column choice per report in this browser, on every page that shows the report.
	const picked = useColumns(report, columns, rows);
	const label = title;
	const runExport = (format: "csv" | "json") => {
		setExportError(null);
		exportReport(site.id, { report, query, ...(params ? { params } : {}) }, format).catch((e: unknown) => setExportError(e instanceof Error ? e.message : String(e)));
	};
	return (
		<section className="ca-panel" data-report={report} aria-label={title} aria-busy={res.loading}>
			<div className="ca-panel-head">
				<h3>
					{title}
					{caveat && <InfoMark caveat={caveat} />}
				</h3>
				<KebabMenu
					label={picked.checks.length ? `Export and columns: ${label}` : `Export ${label}`}
					items={EXPORT_FORMATS.map(([format, name]) => ({ label: `Export ${name}`, onSelect: () => runExport(format) }))}
					checks={picked.checks}
				/>
			</div>
			{res.error && !scoped && <ReportError error={res.error} view={view} />}
			{exportError && <Notice tone="error">{exportError}</Notice>}
			{showNotices && <ReportNotices notices={allNotices(res.data)} view={view} />}
			{res.data && extra?.(res.data)}
			{res.error && !res.data ? (
				<TableSkeleton rows={skeletonRows}>
					<p className="ca-small">Not loaded.</p>
				</TableSkeleton>
			) : !res.data ? (
				<TableSkeleton rows={skeletonRows} />
			) : (
			<DataTable
				label={label}
				columns={picked.columns}
				rows={rows}
				truncated={res.data?.data.truncated}
				loading={res.loading}
				pageSize={pageSize}
				action={action}
				compareNames={compareNames(res.data)}
				emptyAction={state.filters.length || state.segment ? { label: "Clear filters and segment", onClick: () => update({ filters: [], segment: undefined }) } : undefined}
				onFilter={(dim, value) => update({ filters: addIs(state.filters, dim, value) })}
			/>
			)}
			{more && res.data && (
				<a className="ca-more" href={adminHref(more)}>
					{moreLabel ?? (
						<>
							Show all<span className="ca-sr"> {label}</span>
						</>
					)}
				</a>
			)}
		</section>
	);
}

/** The active tab of `tabs` from the URL `tab`; an unknown or absent id means the first tab. */
export const activeTab = <T extends string>(tabs: ReadonlyArray<readonly [T, ...unknown[]]>, tab: string | undefined): T => (tabs.find((t) => t[0] === tab) ?? tabs[0])?.[0] as T;
/** The `tab` value to write for `id`: undefined for the first tab, so default links stay short. Use as `update({ tab: tabParam(tabs, id) })`. */
export const tabParam = (tabs: ReadonlyArray<readonly [string, ...unknown[]]>, id: string): string | undefined => (id === tabs[0]?.[0] ? undefined : id);

/**
 * A report page: the shell header, an optional trend above the tabs (`head`, given the active tab), then tabs (URL
 * `tab`, Back returns to the previous tab); each tab renders its panels with the view. Report errors show once on top.
 */
export function TabPage<T extends string>({ tabs, title, head }: { tabs: ReadonlyArray<readonly [T, string, (v: View) => ReactNode]>; title?: string; head?: (v: View, tab: T) => ReactNode }) {
	return (
		<Shell title={title}>
			{(v) => {
				const tab = activeTab(tabs, v.state.tab);
				const current = tabs.find((t) => t[0] === tab);
				return (
					<ErrorScope view={v} key={v.site.id}>
						{head?.(v, tab)}
						<Tabs label={title} tabs={tabs.map(([id, label]) => [id, label] as const)} value={tab} onChange={(id) => v.update({ tab: tabParam(tabs, id) })} />
						<div role="tabpanel" className="ca-stack" aria-label={current?.[1]}>
							{current?.[2](v)}
						</div>
					</ErrorScope>
				);
			}}
		</Shell>
	);
}
