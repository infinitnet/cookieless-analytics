/** Overview (`/`): KPI strip, timeseries with compare and annotations, Channels, Top pages, Sources, Countries, Devices, Goals mini. */
import { Button } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import type { HostEntry } from "../../routes/sites.js";
import { CompanionNotice } from "../companion.js";
import { annotationAction } from "../components/AnnotationPopover.js";
import { call, useReport, useSearchStatus } from "../api.js";
import { Donut } from "../components/Chart.js";
import { METRICS } from "../components/format.js";
import { Shell, siteKind, toQuery, useShellHead, type View } from "../components/Header.js";
import { MetricChart } from "../components/MetricChart.js";
import { Empty, InfoMark } from "../components/ui.js";
import { COLUMN_DEFINITIONS, PANEL_DEFINITIONS } from "../../charts/definitions.js";
import { noticeCopy, shownNotices } from "../../charts/caveats.js";
import { presetRange } from "../state.js";
import { RevenueKpis } from "./Revenue.js";
import { adminHref, ErrorScope, ReportNotices, SETTINGS_HREF, usePageError } from "../components/ReportNotices.js";
import { allNotices, metricColumn, ReportPanel, SESSION_EXTRA, useRevenue, VISITORS_COLUMN } from "./report.js";
import type { Column } from "../components/DataTable.js";
import { SitesSummary } from "./SitesSummary.js";

const KPIS = ["visitors", "sessions", "pageviews", "views_per_session", "bounce_rate", "avg_duration"] as const;

/** Overview panels: the first 8 rows each, so the grid is even; notices once at the top of the page. */
const ROWS = 8;
const SHORT: Column[] = [
	VISITORS_COLUMN,
	metricColumn("sessions", "Sessions"),
	metricColumn("bounce_rate", "Bounce rate", { format: "percent", optional: true }),
	metricColumn("avg_duration", METRICS.avg_duration?.label ?? "Avg. session duration", { format: "duration", optional: true }),
	...SESSION_EXTRA,
];

/** Under the Top pages preview (whose notices are not shown on the page): why its exit rate is blank under a segment filter, while the Exit rate column is shown. */
export function ExitRateNotice({ notices, shown }: { notices: readonly string[]; shown: readonly string[] }) {
	return shownNotices(notices, shown).includes("exit_rate_segment") ? <p className="ca-small">{noticeCopy("exit_rate_segment")}</p> : null;
}

export function OverviewBody(view: View) {
	return (
		<ErrorScope view={view}>
			<OverviewReport {...view} />
		</ErrorScope>
	);
}

function OverviewReport(view: View) {
	const { state, update, site, tz } = view;
	const p = { view, limit: ROWS, pageSize: ROWS, showNotices: false };
	const query = toQuery(state);
	const ov = useReport(site.id, { report: "overview", query });
	const ts = useReport(site.id, { report: "timeseries", query });
	usePageError(ov.error);
	const totals = ov.data?.data.totals;
	const compareTotals = ov.data?.data.compareTotals as Record<string, unknown> | null | undefined;
	const notices = [...new Set([...allNotices(ov.data), ...allNotices(ts.data)])];
	const realtime = ov.data?.data.realtime;
	// "Active now" is not a figure of the range: a live badge in the page head.
	const firstRun = ov.data?.data.stored === false;
	// On a first run range and filters change nothing: the site select only.
	useShellHead({ live: typeof realtime === "number" ? realtime : null, controls: firstRun ? "site" : undefined });
	// The revenue strip: its own request in the default currency; nothing for a site without revenue.
	const rev = useRevenue({ ...view, state: { ...state, cur: undefined } as typeof state });
	if (ov.data && !Number(totals?.sessions ?? 0)) {
		if (firstRun) return <FirstRun view={view} reload={() => ov.reload?.()} />;
		// Visits exist, none in this range or under these filters: one empty state for the page, not one per panel.
		const narrowed = state.filters.length > 0 || !!state.segment;
		const r90 = presetRange("90d", tz);
		const [preset, words] = state.from === r90.from && state.to === r90.to ? (["12m", "12 months"] as const) : (["90d", "90 days"] as const);
		return (
			<>
				<ReportNotices notices={notices} view={view} />
				<Empty
					hint={narrowed ? "No visit matches these filters in this range." : "Visits are stored for other days."}
					action={
						narrowed
							? { label: "Clear filters and segment", onClick: () => update({ filters: [], segment: undefined }) }
							: { label: `Show the last ${words}`, onClick: () => update(presetRange(preset, tz)) }
					}
				>
					No visits from {state.from} to {state.to}.
				</Empty>
			</>
		);
	}

	return (
		<div className="ca-overview ca-stack">
			<ReportNotices notices={notices} view={view} />
			<MetricChart
				id="overview"
				view={view}
				metrics={KPIS.map((k) => ({ key: k, ...(METRICS[k] ?? { label: k, format: "number" as const }) }))}
				defaults={["visitors"]}
				result={ts}
				totals={totals}
				compareTotals={compareTotals}
				trend
				annotations
				markerActions={annotationAction}
			/>
			{rev.data?.data.hasRevenue === true && (
				<section className="ca-panel ca-revenue-strip" aria-label="Revenue">
					<div className="ca-panel-head">
						<h3>
							Revenue
							<InfoMark text={PANEL_DEFINITIONS.revenue} />
						</h3>
					</div>
					<RevenueKpis res={rev} metrics={["revenue", "orders", "aov", "revenue_per_visitor"]} />
					<a className="ca-more" href={adminHref("/revenue")}>
						Show all<span className="ca-sr"> Revenue</span>
					</a>
				</section>
			)}
			<div className="ca-panels">
				<ReportPanel {...p} report="channels" columnsId="overview.channels" title="Channels" more="/sources" columns={[{ key: "key", label: "Channel", format: "text", dim: "channel" }, ...SHORT]} />
				<ReportPanel
					{...p}
					report="pages"
					columnsId="overview.pages"
					title="Top pages"
					more="/pages"
					columns={[
						{ key: "key", label: "Page", format: "text", dim: "page" },
						{ key: "visitors", label: "Visitors", info: COLUMN_DEFINITIONS.page_visitors },
						metricColumn("pageviews", "Pageviews"),
						metricColumn("avg_time", "Avg. active time", { format: "duration", optional: true }),
						metricColumn("avg_visible", "Avg. visible time", { format: "duration", optional: true }),
						metricColumn("exit_rate", "Exit rate", { format: "percent", optional: true }),
						metricColumn("scroll_median", "Median scroll (%)", { format: "number", optional: true }),
					]}
					extra={(res, chosen) => <ExitRateNotice notices={allNotices(res)} shown={chosen} />}
				/>
				<ReportPanel {...p} report="sources" columnsId="overview.sources" title="Sources" more="/sources?tab=sources" columns={[{ key: "key", label: "Source", format: "text", dim: "source" }, ...SHORT]} />
				<ReportPanel {...p} report="countries" columnsId="overview.countries" title="Countries" more="/audience" columns={[{ key: "key", label: "Country", format: "text", dim: "country" }, ...SHORT]} />
				<ReportPanel
					{...p}
					report="devices"
					columnsId="overview.devices"
					title="Devices"
					more="/audience?tab=devices"
					columns={[{ key: "key", label: "Device", format: "text", dim: "device" }, ...SHORT]}
					extra={(res) => <Donut label="Sessions by device" unit="sessions" slices={(res.data.rows ?? []).map((r) => ({ label: r.key, value: Number(r.sessions ?? 0) }))} />}
				/>
				<ReportPanel
					{...p}
					report="goals"
					title="Goals"
					more="/behaviour?tab=goals"
					setup="goals"
					columnsId="overview.goals"
					columns={[
						{ key: "key", label: "Goal", format: "text", dim: "goal" },
						metricColumn("converting", "Converting sessions"),
						metricColumn("conversion_rate", "Conversion rate", { format: "percent" }),
						metricColumn("completions", "Completions", { optional: true }),
					]}
				/>
			</div>
		</div>
	);
}

/**
 * First run: the site holds no visit yet, so the steps to the first one instead of an empty report.
 * The answer stops saying so with the first stored visit, and the report takes over.
 */
export function FirstRun({ view, reload }: { view: View; reload: () => void }) {
	const { site, sites } = view;
	const remote = siteKind(site) === "remote";
	const [hosts, setHosts] = useState<HostEntry[] | null>(remote ? [] : null);
	const search = useSearchStatus(site).status;
	useEffect(() => {
		// The hosts this install has seen events from; a remote site's are known to its own install only.
		if (!remote)
			call<{ hosts: HostEntry[] }>("sites/hosts").then(
				(r) => setHosts(r.hosts),
				() => setHosts([]),
			);
	}, [remote]);
	const seen = (hosts ?? []).filter((h) => h.lastEvent !== null && (site.local ? h.kind === "own" : h.site === site.label)).sort((a, b) => (b.lastEvent ?? 0) - (a.lastEvent ?? 0))[0];
	const local = sites.find((s) => s.local);
	const snippet = adminHref(`/config?tab=sites${local ? `&site=${encodeURIComponent(local.id)}` : ""}`);
	return (
		<section className="ca-panel ca-first-run" aria-label="Set up">
			<h2>No visits yet</h2>
			<p>The report starts with the first stored visit, and this list goes away.</p>
			<ol className="ca-steps">
				<li data-done={seen ? "true" : undefined}>
					<span className="ca-step-title">Page script on the site</span>
					<span className="ca-step-state">{hosts === null ? "Checking." : seen ? `Seen on ${seen.host}, last event ${new Date(seen.lastEvent ?? 0).toLocaleString()}.` : "Not seen yet."}</span>
					{site.local ? (
						<>
							<span className="ca-small">The plugin adds the script to the pages it serves while Inject script tag is on.</span>
							<span className="ca-actions">
								<a href={`${SETTINGS_HREF}?tab=script`}>Page script settings</a>
							</span>
						</>
					) : (
						!remote && (
							<>
								<span className="ca-small">Add the snippet of {site.label} to its pages.</span>
								<span className="ca-actions">
									<a href={snippet}>Snippet in Definitions, Sites</a>
								</span>
							</>
						)
					)}
				</li>
				<li>
					<span className="ca-step-title">First visit received</span>
					<span className="ca-step-state">Not yet. Open a page of the site; the visit shows here within a minute.</span>
					<span className="ca-actions">
						<Button size="sm" onClick={reload}>
							Check again
						</Button>
					</span>
				</li>
				{search && (
					<li data-done={search.usable.length ? "true" : undefined}>
						<span className="ca-step-title">Connect Search (optional)</span>
						<span className="ca-step-state">{search.usable.length ? "Connected." : "Clicks and positions from Google and Bing next to your pages."}</span>
						{!search.usable.length && (
							<span className="ca-actions">
								<a href={adminHref("/search")}>Open Search</a>
							</span>
						)}
					</li>
				)}
			</ol>
		</section>
	);
}

export default function Overview() {
	return (
		<Shell allSites title="Overview" docs={({ all }) => (all ? "Multi-Site-and-Sites-View" : "Reports")}>
			{(v) => (
				<>
					<CompanionNotice />
					{v.all ? <SitesSummary {...v} /> : <OverviewBody {...v} />}
				</>
			)}
		</Shell>
	);
}
