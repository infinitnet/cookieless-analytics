/** Pages (`/pages`): Pages with search columns and a Queries drawer when a Search source is configured, Entry, Exit, Not found, Changes; Satisfaction has its own page (Satisfaction.tsx). */
import { Button } from "@cloudflare/kumo";
import { useEffect, useRef, useState } from "react";
import { searchConfigured } from "../api.js";
import type { Column } from "../components/DataTable.js";
import { siteKind, toQuery, type View } from "../components/Header.js";
import { Empty, InfoMark, Loading } from "../components/ui.js";
import { metricColumn, PageTrend, ReportPanel, SESSION_BASE, SESSION_EXTRA, TabPage, trendMetrics, VISITORS_COLUMN } from "./report.js";
import { COLUMN_DEFINITIONS } from "../../charts/definitions.js";
import { TrafficChangesTab } from "./SearchSeo.js";

const SEARCH_COLUMNS: Column[] = [
	{ key: "impressions", label: "Impressions", info: COLUMN_DEFINITIONS.search_impressions },
	{ key: "clicks", label: "Clicks", info: COLUMN_DEFINITIONS.search_clicks },
	{ key: "ctr", label: "CTR", format: "percent", info: COLUMN_DEFINITIONS.search_ctr },
	{ key: "position", label: "Position", format: "decimal", info: COLUMN_DEFINITIONS.search_position },
];
/** The search columns of the Queries drawer: the figures of one query for this page. */
const QUERY_COLUMNS: Column[] = [metricColumn("impressions", "Impressions"), metricColumn("clicks", "Clicks"), metricColumn("ctr", "CTR", { format: "percent" }), metricColumn("position", "Position", { format: "decimal" })];

/** Search status of the selected site in this database, null while checking; a remote site's sources are not known here, so its view shows no search columns. */
function useSearch(inDb: boolean, siteId: string): boolean | null {
	const [on, setOn] = useState<boolean | null>(inDb ? null : false);
	useEffect(() => {
		let live = true;
		if (inDb) void searchConfigured().then((v) => live && setOn(v));
		else setOn(false);
		return () => {
			live = false;
		};
	}, [inDb, siteId]);
	return on;
}

export function PagesTab({ view }: { view: View }) {
	const search = useSearch(siteKind(view.site) !== "remote", view.site.id);
	const [drawer, setDrawer] = useState<string | null>(null);
	const opener = useRef<HTMLElement | null>(null);
	const drawerRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		if (drawer) drawerRef.current?.focus();
	}, [drawer]);
	const close = () => {
		setDrawer(null);
		opener.current?.focus();
	};
	// Waiting for the status keeps the Pages query from running twice (without and then with search columns).
	if (search === null) return <Loading />;
	return (
		<>
			<ReportPanel
				view={view}
				report="pages"
				title="Pages"
				revenue
				params={search ? { withSearch: true } : undefined}
				columns={[
					{ key: "key", label: "Page", format: "text", dim: "page" },
					metricColumn("pageviews", "Pageviews"),
					{ key: "visitors", label: "Visitors", info: COLUMN_DEFINITIONS.page_visitors },
					metricColumn("avg_time", "Avg. active time", { format: "duration" }),
					metricColumn("avg_visible", "Avg. visible time", { format: "duration" }),
					metricColumn("exit_rate", "Exit rate", { format: "percent" }),
					metricColumn("scroll_median", "Median scroll (%)", { format: "number", optional: true }),
					...(search ? SEARCH_COLUMNS : []),
				]}
				action={
					search
						? {
								label: "Queries",
								onClick: (r) => {
									opener.current = document.activeElement as HTMLElement | null;
									setDrawer(r.key);
								},
							}
						: undefined
				}
			/>
			{search && drawer && (
				<aside ref={drawerRef} tabIndex={-1} className="ca-drawer ca-panel" aria-label={`Search queries for ${drawer}`}>
					<div className="ca-spread">
						<h3>
							Search queries for {drawer}
							<InfoMark caveat="searchLag" />
						</h3>
						<Button size="sm" variant="ghost" onClick={close}>
							Close
						</Button>
					</div>
					<ReportPanel
						view={view}
						report="search_page_queries"
						title="Queries"
						params={{ page: drawer }}
						columns={[{ key: "key", label: "Query", format: "text" }, ...QUERY_COLUMNS]}
					/>
				</aside>
			)}
		</>
	);
}

export default function Pages() {
	return (
		<TabPage
			docs="Reports"
			title="Pages"
			head={(v) => <PageTrend view={v} id="pages" metrics={trendMetrics("pageviews", "visitors")} />}
			tabs={[
				["pages", "Pages", (v) => <PagesTab view={v} />],
				[
					"entry",
					"Entry pages",
					(v) => (
						<ReportPanel
							view={v}
							report="entry_pages"
							title="Entry pages"
							revenue
							columns={[
								{ key: "key", label: "Entry page", format: "text", dim: "entry" },
								metricColumn("entries", "Entries"),
								VISITORS_COLUMN,
								...SESSION_BASE.slice(2),
								...SESSION_EXTRA.slice(1),
							]}
						/>
					),
				],
				[
					"exit",
					"Exit pages",
					(v) => (
						<ReportPanel
							view={v}
							report="exit_pages"
							title="Exit pages"
							columns={[
								{ key: "key", label: "Exit page", format: "text", dim: "exit" },
								{ key: "exits", label: "Exits", info: COLUMN_DEFINITIONS.exits },
								VISITORS_COLUMN,
								metricColumn("exit_rate", "Exit rate", { format: "percent" }),
							]}
						/>
					),
				],
				[
					"not_found",
					"Not found",
					(v) =>
						siteKind(v.site) === "client" ? (
							<Empty>Not available for this site: error pages are seen by the server of an install, and a client site sends page views only.</Empty>
						) : (
							<ReportPanel
								view={v}
								report="not_found"
								title="Not found"
								columns={[
									{ key: "key", label: "Path", format: "text" },
									{ key: "ref", label: "Referrer", format: "text" },
									{ key: "hits", label: "Hits", info: COLUMN_DEFINITIONS.hits },
								]}
							/>
						),
				],
				["changes", "Changes", (v) => <TrafficChangesTab view={v} />],
			]}
		/>
	);
}
