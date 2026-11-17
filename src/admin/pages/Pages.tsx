/** Pages (`/pages`): Pages with search columns and a Queries drawer when a Search source is configured, Entry, Exit, Not found, Changes; Satisfaction has its own page (Satisfaction.tsx). */
import { Button } from "@cloudflare/kumo";
import { useEffect, useRef, useState } from "react";
import { searchConfigured } from "../api.js";
import type { Column } from "../components/DataTable.js";
import { siteKind, toQuery, type View } from "../components/Header.js";
import { Empty, InfoMark, Loading } from "../components/ui.js";
import { PageTrend, ReportPanel, TabPage, trendMetrics } from "./report.js";
import { TrafficChangesTab } from "./SearchSeo.js";

const SEARCH_COLUMNS: Column[] = [
	{ key: "impressions", label: "Impressions" },
	{ key: "clicks", label: "Clicks" },
	{ key: "ctr", label: "CTR", format: "percent" },
	{ key: "position", label: "Position", format: "decimal" },
];

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
					{ key: "pageviews", label: "Pageviews" },
					{ key: "visitors", label: "Visitors" },
					{ key: "avg_time", label: "Avg. active time", format: "duration", caveat: "active_time" },
					{ key: "avg_visible", label: "Avg. visible time", format: "duration", caveat: "visible_time" },
					{ key: "exit_rate", label: "Exit rate", format: "percent" },
					{ key: "scroll_median", label: "Median scroll (%)", format: "number", optional: true },
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
						columns={[{ key: "key", label: "Query", format: "text" }, ...SEARCH_COLUMNS]}
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
								{ key: "entries", label: "Entries" },
								{ key: "visitors", label: "Visitors" },
								{ key: "bounce_rate", label: "Bounce rate", format: "percent" },
								{ key: "avg_duration", label: "Avg. duration", format: "duration", caveat: "duration" },
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
								{ key: "exits", label: "Exits" },
								{ key: "visitors", label: "Visitors" },
								{ key: "exit_rate", label: "Exit rate", format: "percent" },
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
									{ key: "hits", label: "Hits" },
								]}
							/>
						),
				],
				["changes", "Changes", (v) => <TrafficChangesTab view={v} />],
			]}
		/>
	);
}
