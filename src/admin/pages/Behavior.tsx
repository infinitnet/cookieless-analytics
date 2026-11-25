/** Behavior (`/behavior`): Events (with properties), Goals, Funnels, Journeys, Site search, Outbound, Downloads, Forms, Scroll. */
import { useEffect, useState } from "react";
import { type FunnelItem, listFunnels, useReport } from "../api.js";
import { BarList } from "../components/Chart.js";
import type { Column } from "../components/DataTable.js";
import { isRemote, toPlainQuery, type View } from "../components/Header.js";
import { fmt } from "../components/format.js";
import { Notice, Empty, Field, Loading } from "../components/ui.js";
import { SetupEmpty } from "../setup.js";
import { metricColumn, OtherCurrencies, ReportPanel, TabPage, TableSkeleton, useRevenue } from "./report.js";
import { COLUMN_DEFINITIONS } from "../../charts/definitions.js";

/** The scroll table columns: each row holds the page views whose deepest scroll reached its depth and stayed below the next. */
export const SCROLL_TEXT = {
	pageviews: "Page views whose deepest scroll reached this depth and stayed below the next row.",
	share: "These page views divided by the page views with a scroll measurement.",
} as const;

const AUTO_COLUMNS = (label: string): Column[] => [
	{ key: "key", label, format: "text" },
	{ key: "events", label: "Events", info: COLUMN_DEFINITIONS.event_count },
	{ key: "sessions", label: "Sessions", info: COLUMN_DEFINITIONS.event_sessions },
];

export function EventsTab({ view }: { view: View }) {
	const [event, setEvent] = useState<string | null>(null);
	return (
		<>
			<ReportPanel
				view={view}
				report="events"
				title="Events"
				columns={[
					{ key: "key", label: "Event", format: "text", dim: "event" },
					{ key: "events", label: "Events", info: COLUMN_DEFINITIONS.event_count },
					{ key: "sessions", label: "Sessions", info: COLUMN_DEFINITIONS.event_sessions },
					metricColumn("rate", "Share of sessions", { format: "percent" }),
				]}
				action={{ label: "Properties", onClick: (r) => setEvent(r.key) }}
			/>
			{event && (
				<ReportPanel
					view={view}
					report="event_props"
					title={`Properties of ${event}`}
					showNotices={false}
					params={{ event }}
					columns={[
						{ key: "prop", label: "Property", format: "text" },
						{ key: "value", label: "Value", format: "text" },
						{ key: "count", label: "Events" },
					]}
				/>
			)}
		</>
	);
}

/** Under the funnel revenue columns: what a step's revenue holds, and that lost revenue is an estimate. */
export const FUNNEL_REVENUE_NOTE =
	"Revenue at a step is every order in the range of the sessions that reached the step, including orders placed before it. Est. lost revenue is an estimate, not a measured amount: the sessions that left before the step, valued at the average revenue of the sessions that reached the last step.";

/** Revenue columns of a funnel in `code`; the report leaves them out when the range has no orders, and empty columns hide. */
const funnelMoney = (code: string): Column[] => {
	const money = (key: string, label: string): Column => ({ key, label: `${label} (${code})`, format: `money:${code}` });
	return [
		money("revenue", "Revenue"),
		money("refunds", "Refunds"),
		money("net_revenue", "Net revenue"),
		{ key: "orders", label: "Orders" },
		money("aov", "Average order value"),
		money("revenue_per_session", "Revenue per session"),
		money("est_lost_revenue", "Est. lost revenue"),
	];
};

export function FunnelsTab({ view }: { view: View }) {
	// The site's revenue probe (cached with the page's other reports) decides whether the funnel asks for revenue.
	const rev = useRevenue(view);
	const code = rev.data?.data.hasRevenue === true ? String(rev.data.data.currency ?? "") : "";
	const [items, setItems] = useState<FunnelItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [id, setId] = useState("");
	useEffect(() => {
		let live = true;
		// Listing funnels needs `plugins:manage`; without it the tab shows the error from the route.
		listFunnels().then(
			(r) => {
				if (!live) return;
				setItems(r.items);
				setId((cur) => cur || (r.items[0]?.id ?? ""));
			},
			(e: unknown) => {
				if (!live) return;
				setItems([]);
				setError(e instanceof Error ? e.message : String(e));
			},
		);
		return () => {
			live = false;
		};
	}, []);
	if (!items) return <Loading />;
	if (error) return <Notice tone="error">The funnel list could not be loaded: {error}</Notice>;
	if (!items.length) return isRemote(view.site) ? <Empty>No funnels yet.</Empty> : <SetupEmpty kind="funnels" />;
	return (
		<>
			<Field label="Funnel" help={`Mode: ${items.find((f) => f.id === id)?.data.mode ?? "sequential"}`}>
				<select value={id} onChange={(e) => setId(e.target.value)}>
					{items.map((f) => (
						<option key={f.id} value={f.id}>
							{f.data.name}
						</option>
					))}
				</select>
			</Field>
			{rev.loading ? (
				<TableSkeleton rows={3} />
			) : (
				<ReportPanel
					view={view}
					report="funnels"
					title="Funnel steps"
					params={code ? { funnel: id, withRevenue: true, currency: code } : { funnel: id }}
					columns={[
						{ key: "label", label: "Step", format: "text" },
						{ key: "sessions", label: "Sessions" },
						{ key: "drop_off", label: "Drop-off", format: "percent", info: COLUMN_DEFINITIONS.drop_off },
						{ key: "conversion", label: "Of first step", format: "percent", info: COLUMN_DEFINITIONS.conversion },
						...(code ? funnelMoney(code) : []),
					]}
					extra={(res) => (
						<>
							<BarList label="Sessions per funnel step" rows={(res.data.rows ?? []).map((r) => ({ label: String(r.label), value: Number(r.sessions ?? 0) }))} />
							{res.data.currency !== undefined && (
								<>
									<p className="ca-small">{FUNNEL_REVENUE_NOTE}</p>
									<OtherCurrencies data={res.data} />
								</>
							)}
						</>
					)}
				/>
			)}
		</>
	);
}

/** The footnote of the journey floor. */
export const hiddenText = (n: unknown) => (typeof n === "number" && n > 0 ? `${fmt(n)} sessions on routes taken by fewer than 2 sessions are not shown.` : null);

const JOURNEY_COLUMNS = (label: string): Column[] => [
	{ key: "key", label, format: "text" },
	{ key: "sessions", label: "Sessions" },
	{ key: "share", label: "Share", format: "percent", info: COLUMN_DEFINITIONS.journey_share },
];

/** Journeys: a page picker, what came before and after it, and the top three step paths. */
export function JourneysTab({ view }: { view: View }) {
	const { state, site } = view;
	const pages = useReport(site.id, { report: "dimension_values", query: toPlainQuery(state), params: { dim: "page" }, limit: 50 });
	const options = (pages.data?.data.rows ?? []).map((r) => String(r.key));
	const [picked, setPicked] = useState("");
	const path = picked || options[0] || "";
	const note = (res: { data: Record<string, unknown> }) => {
		const t = hiddenText(res.data.hidden_sessions);
		return t ? <p className="ca-small">{t}</p> : null;
	};
	const bars = (title: string) => (res: { data: { rows?: Array<Record<string, unknown>>; hidden_sessions?: unknown } }) => (
		<>
			<BarList label={title} rows={(res.data.rows ?? []).map((r) => ({ label: String(r.key), value: Number(r.sessions ?? 0) }))} />
			{note(res)}
		</>
	);
	return (
		<>
			<p className="ca-small">Page flows within one visit over the last 31 days at most. Repeated views of one page count as one step; views in the same second may appear in either order.</p>
			{pages.error && <Notice tone="error">{pages.error}</Notice>}
			<Field label="Page">
				<select value={path} onChange={(e) => setPicked(e.target.value)} disabled={!options.length}>
					{options.map((p) => (
						<option key={p} value={p}>
							{p}
						</option>
					))}
				</select>
			</Field>
			{path ? (
				<div className="ca-panels">
					<ReportPanel view={view} report="journey_prev" title="Came from" params={{ path }} columns={JOURNEY_COLUMNS("Previous page")} extra={bars("Came from")} />
					<ReportPanel view={view} report="journey_next" title="Went to" params={{ path }} columns={JOURNEY_COLUMNS("Next page")} extra={bars("Went to")} />
				</div>
			) : (
				pages.data && <Empty />
			)}
			<ReportPanel
				view={view}
				report="journey_paths"
				title="Top paths"
				columns={[
					{ key: "path1", label: "Entry page", format: "text" },
					{ key: "path2", label: "Second page", format: "text" },
					{ key: "path3", label: "Third page", format: "text" },
					{ key: "sessions", label: "Sessions" },
				]}
				extra={note}
			/>
		</>
	);
}

/** Site search texts: the column notes and the stated limits. */
export const SITE_SEARCH_TEXT = {
	sessionsNote: "Sessions per term are summed over the distinct stored searches; marked * where the term also appears with other kept parameters, so a session may count more than once (an upper bound).",
	limits: "The plugin cannot know whether a search found results; send an event such as search_no_results for that. A refreshed results page counts once.",
	upperBound: "*",
} as const;

/** Site search: terms of the configured parameters, raw window only; the enable hint when off. */
export function SiteSearchTab({ view }: { view: View }) {
	return (
		<ReportPanel
			view={view}
			report="site_search"
			title="Site search"
			columns={[
				{ key: "key", label: "Term", format: "text" },
				{ key: "searches", label: "Searches" },
				{ key: "sessions_label", label: "Sessions", format: "text" },
				{ key: "searches_per_session", label: "Searches per session" },
			]}
			mapRows={(rows) => rows.map((r) => ({ ...r, sessions_label: `${fmt(r.sessions)}${r.sessions_upper_bound ? SITE_SEARCH_TEXT.upperBound : ""}` }))}
			extra={(res) =>
				res.data.notices?.includes("site_search_off") ? null : (
					<>
						<p className="ca-small">{SITE_SEARCH_TEXT.sessionsNote}</p>
						<p className="ca-small">{SITE_SEARCH_TEXT.limits}</p>
					</>
				)
			}
		/>
	);
}

export default function Behavior() {
	return (
		<TabPage
			docs={({ tab }) => (tab === "goals" || tab === "funnels" ? "Goals-and-Funnels" : "Events")}
			title="Behavior"
			tabs={[
				["events", "Events", (v) => <EventsTab view={v} />],
				[
					"goals",
					"Goals",
					(v) => (
						<ReportPanel
							view={v}
							report="goals"
							title="Goals"
							revenue
							setup="goals"
							columns={[
								{ key: "key", label: "Goal", format: "text", dim: "goal" },
								{ key: "type", label: "Type", format: "text" },
								metricColumn("completions", "Completions"),
								metricColumn("converting", "Converting sessions"),
								metricColumn("conversion_rate", "Conversion rate", { format: "percent" }),
							]}
							extra={(res) => (res.data.rows?.length ? <p className="ca-small">Conversion rate is out of {fmt(res.data.total_sessions)} sessions in the current filter.</p> : null)}
						/>
					),
				],
				["funnels", "Funnels", (v) => <FunnelsTab view={v} />],
				["journeys", "Journeys", (v) => <JourneysTab view={v} />],
				["site-search", "Site search", (v) => <SiteSearchTab view={v} />],
				["outbound", "Outbound", (v) => <ReportPanel view={v} report="outbound" title="Outbound links" columns={AUTO_COLUMNS("Link")} />],
				["downloads", "Downloads", (v) => <ReportPanel view={v} report="downloads" title="Downloads" columns={AUTO_COLUMNS("File")} />],
				["forms", "Forms", (v) => <ReportPanel view={v} report="forms" title="Forms" columns={AUTO_COLUMNS("Form")} />],
				[
					"scroll",
					"Scroll",
					(v) => (
						<ReportPanel
							view={v}
							report="scroll"
							title="Scroll depth"
							columns={[
								{ key: "depth", label: "Max scroll depth (%)" },
								{ key: "pageviews", label: "Pageviews", info: SCROLL_TEXT.pageviews },
								{ key: "share", label: "Share", format: "percent", info: SCROLL_TEXT.share },
							]}
							mapRows={(rows) => rows.map((r) => ({ ...r, depth: Number(r.key) }))}
							extra={(res) => <BarList label="Pageviews by scroll depth" rows={(res.data.rows ?? []).map((r) => ({ label: `${r.key}%`, value: Number(r.pageviews ?? 0) }))} />}
						/>
					),
				],
			]}
		/>
	);
}
