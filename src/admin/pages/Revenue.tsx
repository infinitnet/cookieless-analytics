/**
 * Revenue: the one home of revenue. Cards that toggle the series, every attribution breakdown at once,
 * goals to revenue, the newest orders of the detailed window, and a first use state before the first order.
 */
import { REVENUE_EMPTY } from "../../dashboards/tiles.js";
import { REVENUE_BREAKDOWN_DIMS } from "../../query/filters.js";
import { ORDERS_RAW_ONLY } from "../../query/reports/revenue-copy.js";
import { type ReportState, useReport } from "../api.js";
import { type Column, DataTable, type TableRow } from "../components/DataTable.js";
import { addIs } from "../components/FilterBar.js";
import { Shell, toPlainQuery, type View } from "../components/Header.js";
import { type Format } from "../components/format.js";
import { KpiCard } from "../components/KpiCard.js";
import { type MetricDef, MetricChart } from "../components/MetricChart.js";
import { ErrorScope, ReportError } from "../components/ReportNotices.js";
import { InfoMark, Loading, Notice, Segmented } from "../components/ui.js";
import { PANEL_DEFINITIONS } from "../../charts/definitions.js";
import { wikiUrl } from "../docs-links.js";
import { OtherCurrencies, ReportPanel, TableSkeleton, useRevenue } from "./report.js";

const REVENUE_KPIS = [
	["revenue", "Revenue", true],
	["refunds", "Refunds", true],
	["net_revenue", "Net revenue", true],
	["orders", "Orders", false],
	["aov", "Average order value", true],
	["revenue_per_visitor", "Revenue per visitor", true],
	["revenue_per_session", "Revenue per session", true],
	["paying_sessions", "Paying sessions", false],
] as const;

/** The revenue figures `revenue_series` has per bucket: the cards that toggle a line. */
const CHARTED: ReadonlySet<string> = new Set(["revenue", "refunds", "net_revenue", "orders", "aov"]);

/** Shown under the revenue figures when the range holds refunds. */
export const REFUNDS_NOTE =
	"Revenue is the order values before refunds. A refund counts on the day it was made, with the source, pages and country of its order; net revenue is revenue minus refunds, and orders are not reduced by a refund.";

/** The attribution model in one sentence (docs/revenue.md, attribution). */
export const ATTRIBUTION_NOTE =
	"Each order is credited to the first touch of its visit: the referrer, channel, campaign and landing page the visit started with. The plugin keeps no cookie and no identity across visits, so earlier visits get no share.";

/** The revenue guide in the wiki, linked from the first use state. */
export const REVENUE_GUIDE = wikiUrl("Revenue-and-Refunds");

/** Under the recent orders: what the reference is. */
export const ORDERS_NOTE = "The order id you send is never stored; the reference is derived from it, so one order keeps one reference.";

/** KPI cards of the `revenue` report in its currency, then the other currencies line (Overview strip). Refunds and net revenue appear when the range holds refunds. */
export function RevenueKpis({ res, metrics = REVENUE_KPIS.map((k) => k[0]) }: { res: ReportState; metrics?: ReadonlyArray<(typeof REVENUE_KPIS)[number][0]> }) {
	const d = res.data?.data;
	const code = (d?.currency as string | undefined) ?? "";
	const previous = d?.compareTotals as Record<string, unknown> | null | undefined;
	const refunds = Number(d?.totals?.refunds ?? 0) > 0;
	const shown: string[] = refunds && metrics.includes("revenue") ? [...metrics, "refunds", "net_revenue"] : metrics.filter((k) => k !== "refunds" && k !== "net_revenue");
	return (
		<>
			{/* No compare note: the Overview prints it once above its cards, for the same range. */}
			<section className="ca-kpis" aria-label={`Revenue in ${code}`}>
				{REVENUE_KPIS.filter(([k]) => shown.includes(k)).map(([k, label, money]) => (
					<KpiCard key={k} metric={k} label={money ? `${label} (${code})` : label} format={(money ? `money:${code}` : "number") as Format} value={d?.totals?.[k]} compare={previous} />
				))}
			</section>
			{refunds && <Notice label="Refunds">{REFUNDS_NOTE}</Notice>}
			<OtherCurrencies data={d} />
		</>
	);
}

type BreakdownDim = (typeof REVENUE_BREAKDOWN_DIMS)[number];
/** Panel title and first column of each attribution breakdown, and the filter a click on a value adds. */
const DIMS: Record<BreakdownDim, readonly [title: string, label: string, filter: Column["dim"]]> = {
	channel: ["Channels", "Channel", "channel"],
	source: ["Sources", "Source", "source"],
	campaign: ["Campaigns", "Campaign", "utm_campaign"],
	entry: ["Landing pages", "Landing page", "entry"],
	page: ["Pages", "Page", "page"],
	country: ["Countries", "Country", "country"],
	device: ["Devices", "Device", "device"],
	goal: ["Goals to revenue", "Goal", "goal"],
	event: ["Events", "Event", "event"],
};
/** Rows per attribution panel; the export holds every row. */
const PANEL_ROWS = 10;

/** One attribution breakdown: revenue, share of the currency's revenue, refunds and net when present, orders, AOV, revenue per visitor. */
function AttributionPanel({ view, dim, code, total, refunds }: { view: View; dim: BreakdownDim; code: string; total: number; refunds: boolean }) {
	const [title, label, filter] = DIMS[dim];
	const money = (key: string, l: string): Column => ({ key, label: `${l} (${code})`, format: `money:${code}` });
	return (
		<ReportPanel
			view={view}
			report="revenue_breakdown"
			title={title}
			limit={PANEL_ROWS}
			params={{ dim, currency: code }}
			columns={[
				{ key: "key", label, format: "text", dim: filter },
				money("revenue", "Revenue"),
				{ key: "share", label: "Share of revenue", format: "percent" },
				...(refunds ? [money("refunds", "Refunds"), money("net_revenue", "Net revenue")] : []),
				{ key: "orders", label: "Orders" },
				money("aov", "Average order value"),
				money("revenue_per_visitor", "Revenue per visitor"),
				{ key: "visitors", label: "Visitors", optional: true },
				{ key: "sessions", label: "Sessions", optional: true },
			]}
			// Visitors rows without an order stay out: these panels rank where the money came from.
			// A funnel table is too wide for a grid cell: its stepwise revenue lives on the Funnels tab, linked from the goals panel.
			{...(dim === "goal" && { more: "/behaviour?tab=funnels", moreLabel: "Revenue per funnel step", setup: "goals" as const })}
			mapRows={(rows) => rows.filter((r) => Number(r.orders) > 0 || Number(r.refunds) > 0).map((r) => ({ ...r, share: total > 0 ? Number(r.revenue) / total : null }))}
		/>
	);
}

/**
 * The newest orders of the range, from the detailed rows. A range that starts before the detailed window lists the
 * orders from its first day on and says so; a range wholly before it says where the orders can be read instead.
 */
function RecentOrders({ view, code }: { view: View; code: string }) {
	const { state, update, site } = view;
	const query = toPlainQuery(state);
	const req = { report: "revenue_orders" as const, limit: 50, params: { currency: code } };
	const first = useReport(site.id, { ...req, query });
	const from = /Detailed data starts on (\d{4}-\d{2}-\d{2})\./.exec(first.error ?? "")?.[1];
	const clipped = !!from && from <= state.to;
	const second = useReport(site.id, clipped ? { ...req, query: { ...query, from } } : null);
	const res = clipped ? second : first;
	const rows = (res.data?.data.rows ?? []) as TableRow[];
	const refunds = rows.some((r) => r.refund === true);
	const columns: Column[] = [
		{ key: "key", label: "Order reference", format: "text" },
		{ key: "day", label: "Day", format: "text" },
		...(refunds ? [{ key: "kind", label: "Type", format: "text" as const }] : []),
		{ key: "amount", label: `Amount (${code})`, format: `money:${code}` },
		{ key: "channel", label: "Channel", format: "text", dim: "channel" },
		{ key: "entry", label: "Landing page", format: "text", dim: "entry" },
		{ key: "country", label: "Country", format: "text", dim: "country" },
	];
	const outside = !!first.error?.startsWith(ORDERS_RAW_ONLY);
	return (
		<section className="ca-panel" data-report="revenue_orders" aria-label="Recent orders" aria-busy={res.loading}>
			<div className="ca-panel-head">
				<h3>
					Recent orders
					<InfoMark text={PANEL_DEFINITIONS.revenue_orders} />
				</h3>
			</div>
			{clipped && <Notice label="Range">{`Orders from ${from} on: single orders before that day are not kept. The figures above cover the whole range.`}</Notice>}
			{outside && !clipped ? (
				<Notice label="Range">{`${ORDERS_RAW_ONLY} The figures above cover the whole range.`}</Notice>
			) : res.error ? (
				<ReportError error={res.error} view={view} />
			) : !res.data ? (
				<TableSkeleton rows={5} />
			) : (
				<DataTable
					label="Recent orders"
					columns={columns}
					rows={rows.map((r) => ({ ...r, kind: r.refund ? "Refund" : "Order" }))}
					truncated={res.data.data.truncated}
					pageSize={10}
					onFilter={(dim, value) => update({ filters: addIs(state.filters, dim, value) })}
				/>
			)}
			<p className="ca-small">{ORDERS_NOTE}</p>
		</section>
	);
}

/** Before the first order: what to send, one example and the guide, instead of an empty report. */
export function FirstRevenue() {
	return (
		<section className="ca-panel ca-first-run" aria-label="Set up revenue">
			<h2>{REVENUE_EMPTY}</h2>
			<p>Revenue comes from events that carry an order value. Send one from the order confirmation page, or record orders from your server with an API key.</p>
			<pre className="ca-pre">{'window.__ec.event("purchase", {}, { value: 49.9, currency: "EUR", id: "A-1001" });'}</pre>
			<p className="ca-small">__ec is the default value of the Window namespace setting. The figures, the breakdowns and the recent orders appear here with the first order.</p>
			<p>
				<a href={REVENUE_GUIDE} target="_blank" rel="noreferrer">
					Revenue guide
				</a>
			</p>
		</section>
	);
}

/** The page body: currency chips, cards and series, the attribution panels, recent orders. */
export function RevenueBody({ view }: { view: View }) {
	const { state, update } = view;
	const res = useRevenue(view);
	const d = res.data?.data;
	if (res.error) return <ReportError error={res.error} view={view} />;
	if (!d) return <Loading />;
	if (!d.hasRevenue) return <FirstRevenue />;
	const code = String(d.currency);
	const seen = [...new Set([code, ...((d.currencies ?? []) as Array<{ currency: string }>).map((c) => c.currency)])];
	const refunds = Number(d.totals?.refunds ?? 0) > 0;
	// The figures of `revenue_series` toggle lines; the per visitor and per session figures are plain cards.
	const metrics: MetricDef[] = REVENUE_KPIS.filter(([k]) => refunds || (k !== "refunds" && k !== "net_revenue")).map(([key, label, money]) => ({
		key,
		label: money ? `${label} (${code})` : label,
		format: (money ? `money:${code}` : "number") as Format,
		...(CHARTED.has(key) ? {} : { selectable: false }),
	}));
	return (
		<>
			<p className="ca-small">{ATTRIBUTION_NOTE}</p>
			{seen.length > 1 && <Segmented label="Currency" value={code} options={seen.map((c) => [c, c] as const)} onChange={(c) => update({ cur: c })} />}
			<MetricChart
				id="revenue"
				view={view}
				metrics={metrics}
				defaults={["revenue"]}
				report="revenue_series"
				params={state.cur ? { currency: state.cur } : undefined}
				totals={d.totals}
				compareTotals={d.compareTotals as Record<string, unknown> | null | undefined}
				title={`Revenue in ${code}`}
			/>
			{refunds && <Notice label="Refunds">{REFUNDS_NOTE}</Notice>}
			<OtherCurrencies data={d} />
			<h2 className="ca-group-title">
				Where the revenue came from
				<InfoMark text={PANEL_DEFINITIONS.revenue_sources} />
			</h2>
			<div className="ca-panels ca-rev-panels">
				{REVENUE_BREAKDOWN_DIMS.map((dim) => (
					<AttributionPanel key={dim} view={view} dim={dim} code={code} total={Number(d.totals?.revenue ?? 0)} refunds={refunds} />
				))}
			</div>
			<RecentOrders view={view} code={code} />
		</>
	);
}

export default function Revenue() {
	return (
		<Shell title="Revenue" docs="Revenue-and-Refunds">
			{(v) => (
				<ErrorScope view={v} key={v.site.id}>
					<div className="ca-stack">
						<RevenueBody view={v} />
					</div>
				</ErrorScope>
			)}
		</Shell>
	);
}
