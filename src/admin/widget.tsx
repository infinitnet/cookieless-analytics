/** Dashboard widget: today's visitors and pageviews against yesterday, realtime, top page today, link to the reports. */
import { PLUGIN_ID } from "../contract.js";
import { useReport } from "./api.js";
import { ChangeMark } from "./components/Change.js";
import { describeChange, fmt } from "./components/format.js";
import { InfoMark, Notice } from "./components/ui.js";
import { useSite } from "./site.js";
import { presetRange } from "./state.js";

export const DASHBOARD_HREF = `/_emdash/admin/plugins/${PLUGIN_ID}/`;

/** Always the local site; "today" is the local site's calendar day. */
export default function TodayWidget() {
	const { sites, local } = useSite();
	const day = presetRange("today", local.timezone ?? "UTC");
	const query = { ...day, filters: [] };
	// The previous period of one day is yesterday.
	const ov = useReport("", sites ? { report: "overview", query: { ...query, compare: "previous" } } : null);
	const top = useReport("", sites ? { report: "pages", query: { ...query, compare: "none" }, limit: 1 } : null);
	const totals = ov.data?.data.totals;
	const prev = ov.data?.data.compareTotals as Record<string, unknown> | null | undefined;
	const topPage = top.data?.data.rows?.[0];
	const error = ov.error ?? top.error;
	const figure = (k: "visitors" | "pageviews", label: string) => {
		const change = prev !== undefined && totals ? describeChange(k, totals[k], prev?.[k], { format: "number" }) : null;
		return (
			<div className="ca-figure" data-metric={k}>
				<div className="ca-small">
					{label}
					{k === "visitors" && <InfoMark caveat="visitors" />}
				</div>
				<strong>{fmt(totals?.[k])}</strong>{" "}
				{change && change.kind !== "none" && change.direction !== "flat" && (
					<>
						<ChangeMark c={change} compact /> <span className="ca-small">vs yesterday</span>
					</>
				)}
			</div>
		);
	};
	return (
		<div className="ca-widget ca-root">
			{error ? (
				<Notice tone="error">{error}</Notice>
			) : (
				<>
					<div className="ca-figures">
						{figure("visitors", "Visitors today")}
						{figure("pageviews", "Pageviews today")}
						<div className="ca-figure" data-metric="realtime">
							<div className="ca-small">Active now</div>
							<strong>{fmt(ov.data?.data.realtime)}</strong>
						</div>
					</div>
					<p className="ca-small">Top page today: {topPage ? `${topPage.key} (${fmt(topPage.pageviews)})` : "-"}</p>
				</>
			)}
			<a href={DASHBOARD_HREF}>Open the reports</a>
		</div>
	);
}
