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
import { isRemote, Shell, toQuery, type View } from "../components/Header.js";
import { type DefinitionKind, SetupEmpty, useDefinitionCount } from "../setup.js";
import { InfoMark, KebabMenu, Notice, Tabs } from "../components/ui.js";
import { COLUMN_DEFINITIONS, metricDefinition, type PanelId, PANEL_DEFINITIONS } from "../../charts/definitions.js";
import { shownNotices } from "../../charts/caveats.js";
import type { DocsLink } from "../docs-links.js";
import { adminHref, ErrorScope, ReportError, ReportNotices, usePageError } from "../components/ReportNotices.js";

/** Cards of a page trend from the shared metric labels. */
export const trendMetrics = (...keys: string[]): MetricDef[] =>
	keys.map((key) => ({ key, label: METRICS[key]?.label ?? key, format: METRICS[key]?.format ?? "number" }));

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

/** A column with the metric's own definition behind its info mark (`metricDefinition`); `info` overrides it. */
export const metricColumn = (key: string, label: string, more: Partial<Column> = {}): Column => {
	const info = metricDefinition(key);
	return { key, label, ...(info ? { info } : {}), ...more };
};

/** The Visitors column of a breakdown: per day and row, so rows overlap. */
export const VISITORS_COLUMN: Column = { key: "visitors", label: "Visitors", info: COLUMN_DEFINITIONS.visitors };

/** The session columns after the name: visitors, sessions, bounce rate, average session duration. */
export const SESSION_BASE: Column[] = [
	VISITORS_COLUMN,
	metricColumn("sessions", "Sessions"),
	metricColumn("bounce_rate", "Bounce rate", { format: "percent" }),
	metricColumn("avg_duration", METRICS.avg_duration?.label ?? "Avg. session duration", { format: "duration" }),
];

/** Session metric columns shared by the session breakdowns (channels, sources, countries and so on). */
export function sessionColumns(label: string, dim?: Dim): Column[] {
	return [{ key: "key", label, format: "text", ...(dim ? { dim } : {}) }, ...SESSION_BASE, ...SESSION_EXTRA];
}

/** Session metrics every session breakdown returns that are not shown until the visitor switches them on. */
export const SESSION_EXTRA: Column[] = [
	metricColumn("pageviews", "Pageviews", { optional: true }),
	metricColumn("views_per_session", "Views per session", { format: "decimal", optional: true }),
	metricColumn("engaged_rate", "Engaged rate", { format: "percent", optional: true }),
];

/** What the Revenue column of a report's rows holds (the attribution of `withRevenue`). */
const REVENUE_INFO: Partial<Record<ReportName, string>> = {
	channels: COLUMN_DEFINITIONS.revenue_first_touch,
	sources: COLUMN_DEFINITIONS.revenue_first_touch,
	campaigns: COLUMN_DEFINITIONS.revenue_first_touch,
	entry_pages: COLUMN_DEFINITIONS.revenue_first_touch,
	pages: COLUMN_DEFINITIONS.revenue_page,
	countries: COLUMN_DEFINITIONS.revenue_visit,
	devices: COLUMN_DEFINITIONS.revenue_visit,
	events: COLUMN_DEFINITIONS.revenue_order_event,
	goals: COLUMN_DEFINITIONS.revenue_order_goal,
};

export interface PanelProps {
	view: View;
	report: ReportName;
	/** The id of the column choice in this browser; the report name unless the panel has its own columns (Overview previews). */
	columnsId?: string;
	columns: readonly Column[];
	/** Required: a panel head without a title would hold only the menu. */
	title: string;
	/** The info mark of the title, when it is not the definition of `report`. */
	info?: ReportName | PanelId;
	params?: Params;
	limit?: number;
	pageSize?: number;
	/** Reshape rows for display (for example lists to text). */
	mapRows?: (rows: TableRow[]) => TableRow[];
	/** Notices are shown once per page; panels on a page with its own notices pass false. */
	showNotices?: boolean;
	action?: DataTableProps["action"];
	/** Extra content above the table, from the report answer (a chart, a total) and the keys of the columns switched on. */
	extra?: (res: ReportResult, chosen: readonly string[]) => ReactNode;
	/** Add the Revenue and Orders columns through `withRevenue` when the site has revenue. */
	revenue?: boolean;
	/** "Show all" under the table: the admin page path of the full report (`/sources?tab=sources`). */
	more?: string;
	/** Text of the `more` link when it leads elsewhere than the full report (default "Show all"). */
	moreLabel?: string;
	/**
	 * The definition the rows come from: an empty answer while the site has none shows the setup prompt instead of
	 * "No data". `links` has no definition; its prompt shows while no filter or segment narrows the view.
	 */
	setup?: DefinitionKind | "links";
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
export function ReportPanel({ view, report, columnsId, columns: baseColumns, title, info, params: baseParams, limit = 100, pageSize, mapRows, showNotices = true, action, extra, revenue, more, moreLabel, setup }: PanelProps) {
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
	const money = (key: string, l: string, info = metricDefinition(key)): Column => ({ key, label: `${l} (${code})`, format: `money:${code}`, ...(info ? { info } : {}) });
	const columns: readonly Column[] =
		withRev && code
			? [
					...baseColumns,
					money("revenue", "Revenue", REVENUE_INFO[report]),
					...(refunds ? [money("refunds", "Refunds"), money("net_revenue", "Net revenue")] : []),
					{ key: "orders", label: "Orders", info: COLUMN_DEFINITIONS.orders_row },
				]
			: baseColumns;
	const [exportError, setExportError] = useState<string | null>(null);
	// Inside a page's error scope the error shows once on top, and the panel only says "Not loaded.".
	const scoped = usePageError(res.error);
	const skeletonRows = Math.min(pageSize ?? SKELETON_ROWS, limit, SKELETON_ROWS);
	const all = (res.data?.data.rows ?? []) as TableRow[];
	const rows = mapRows ? mapRows(all) : all;
	// One column choice per report in this browser, on every page that shows the report; a panel with its own columns names its own id.
	const picked = useColumns(columnsId ?? report, columns, rows);
	const narrowed = state.filters.length > 0 || !!state.segment;
	const empty = !!res.data && !res.loading && !rows.length;
	const defined = setup && setup !== "links" ? setup : "goals";
	const count = useDefinitionCount(defined, site.id, empty && !!setup && setup !== "links" && !isRemote(site));
	const prompt = empty && setup && (setup === "links" ? !narrowed : count === 0) ? setup : null;
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
					<InfoMark text={PANEL_DEFINITIONS[info ?? report]} />
				</h3>
				<KebabMenu
					label={picked.checks.length ? `Export and columns: ${label}` : `Export ${label}`}
					items={EXPORT_FORMATS.map(([format, name]) => ({ label: `Export ${name}`, onSelect: () => runExport(format) }))}
					checks={picked.checks}
				/>
			</div>
			{res.error && !scoped && <ReportError error={res.error} view={view} />}
			{exportError && <Notice tone="error">{exportError}</Notice>}
			{showNotices && <ReportNotices notices={shownNotices(allNotices(res.data), picked.chosen)} view={view} />}
			{res.data && extra?.(res.data, picked.chosen)}
			{res.error && !res.data ? (
				<TableSkeleton rows={skeletonRows}>
					<p className="ca-small">Not loaded.</p>
				</TableSkeleton>
			) : !res.data ? (
				<TableSkeleton rows={skeletonRows} />
			) : prompt ? (
				<SetupEmpty kind={prompt} />
			) : (
			<DataTable
				label={label}
				columns={picked.columns}
				rows={rows}
				// A preview cut at its row count says so with its "Show all" link, not with a pager of one page.
				truncated={more ? undefined : res.data?.data.truncated}
				loading={res.loading}
				pageSize={pageSize}
				action={action}
				compareNames={compareNames(res.data)}
				// A preview with "Show all" stays short; the full report has the search.
				search={!more}
				emptyAction={narrowed ? { label: "Clear filters and segment", onClick: () => update({ filters: [], segment: undefined }) } : undefined}
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
export function TabPage<T extends string>({ tabs, title, head, docs }: { tabs: ReadonlyArray<readonly [T, string, (v: View) => ReactNode]>; title?: string; head?: (v: View, tab: T) => ReactNode; docs?: DocsLink }) {
	return (
		<Shell title={title} docs={docs}>
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
