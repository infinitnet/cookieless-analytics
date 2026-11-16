/** Links (Links convention, docs/integration.md): short link impressions, clicks and CTR by a chosen dimension, a per-link drill-down and the daily sessions with a click. */
import { useState } from "react";
import { LINK_EVENTS } from "../../contract.js";
import { LINK_BY } from "../../query/filters.js";
import type { Column } from "../components/DataTable.js";
import { Shell, type View } from "../components/Header.js";
import { type MetricDef, MetricChart } from "../components/MetricChart.js";
import { ErrorScope } from "../components/ReportNotices.js";
import { ReportPanel, useRevenue } from "./report.js";
import { Segmented } from "./SearchSeo.js";

type By = (typeof LINK_BY)[number];
export const LINK_BY_LABELS: Record<By, string> = {
	link: "Link",
	place: "Placement",
	page: "Page",
	channel: "Channel",
	source: "Source",
	campaign: "Campaign",
	entry: "Landing page",
	country: "Country",
	device: "Device",
};
/** Filter dimension of a row value, so a click on it narrows the view. Links and placements have none. */
const FILTER_DIM: Partial<Record<By, Column["dim"]>> = { channel: "channel", source: "source", campaign: "utm_campaign", entry: "entry", country: "country", device: "device" };

function columns(by: By, code: string | null): Column[] {
	const dim = FILTER_DIM[by];
	return [
		{ key: "key", label: LINK_BY_LABELS[by], format: "text", ...(dim ? { dim } : {}) },
		{ key: "impressions", label: "Impressions" },
		{ key: "clicks", label: "Clicks" },
		{ key: "ctr", label: "CTR", format: "percent" },
		{ key: "sessions", label: "Sessions with a click" },
		{ key: "conversions", label: "Conversions" },
		...(code ? [{ key: "revenue", label: `Revenue (${code})`, format: `money:${code}` } as Column] : []),
	];
}

/** Cards of the trend: sessions and visitors with a short link click. */
const CLICK_METRICS: readonly MetricDef[] = [
	{ key: "sessions", label: "Sessions with a click", format: "number" },
	{ key: "visitors", label: "Visitors with a click", format: "number" },
];

function LinksView({ view }: { view: View }) {
	const { state } = view;
	const [by, setBy] = useState<By>("link");
	const [slug, setSlug] = useState<string | null>(null);
	const [drillBy, setDrillBy] = useState<By>("place");
	// Revenue columns only when the site records revenue at all, in the view's currency.
	const rev = useRevenue(view);
	const code = rev.data?.data.hasRevenue ? String(rev.data.data.currency ?? "") || null : null;
	const money = code ? { withRevenue: true, ...(state.cur ? { currency: state.cur } : {}) } : {};
	// The trend counts the sessions with a short link click: the page's filters plus that event.
	const clicked: View = { ...view, state: { ...state, filters: [...state.filters, { dim: "event", op: "is", values: [LINK_EVENTS.click] }] } };
	const options = LINK_BY.map((k) => [k, LINK_BY_LABELS[k]] as const);
	return (
		<ErrorScope view={view}>
			<MetricChart id="links" view={clicked} metrics={CLICK_METRICS} defaults={["sessions"]} />
			<Segmented label="Links by" value={by} options={options} onChange={(b) => (setBy(b), setSlug(null))} />
			{!rev.loading && (
				<ReportPanel
					view={view}
					report="links"
					title={by === "link" ? "Links" : `Links by ${LINK_BY_LABELS[by].toLowerCase()}`}
					params={{ by, ...money }}
					columns={columns(by, code)}
					{...(by === "link" ? { action: { label: "Details", onClick: (r: { key: string }) => setSlug(r.key) } } : {})}
				/>
			)}
			{slug && by === "link" && (
				<section aria-label={`Details of ${slug}`}>
					<Segmented label={`${slug} by`} value={drillBy} options={options.filter(([k]) => k !== "link")} onChange={setDrillBy} />
					<ReportPanel view={view} report="links" title={`${slug} by ${LINK_BY_LABELS[drillBy].toLowerCase()}`} showNotices={false} params={{ by: drillBy, slug, ...money }} columns={columns(drillBy, code)} />
				</section>
			)}
			<p className="ca-small">
				Clicks are outbound link events of short links, impressions are links seen on a page, conversions are reported sales. CTR is clicks divided by impressions, 0 without impressions. Older ranges read daily link summaries: by link and by placement.
			</p>
		</ErrorScope>
	);
}

export default function Links() {
	return <Shell title="Links">{(v) => <LinksView view={v} key={v.site.id} />}</Shell>;
}
