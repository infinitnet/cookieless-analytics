/**
 * Editor sidebar panel "Traffic": the last 30 days of the entry's public page from
 * `editor/traffic`, fetched once when the panel mounts. Read only; a link opens the Pages report filtered to the path.
 * The host context's content type field is passed through by spread, so this admin source never names it (copy rule).
 */
import { useEffect, useState } from "react";
import type { EditorTraffic } from "../../routes/editor.js";
import { call } from "../api.js";
import { encodeState } from "../state.js";
import { DASHBOARD_HREF } from "../widget.js";
import { Sparkline } from "./Chart.js";
import { fmt } from "./format.js";
import { Notice } from "./ui.js";

export const PANEL_TEXT = {
	loading: "Loading traffic...",
	noPage: "This entry has no public page yet.",
	noData: "No visits to this page in the last 30 days yet.",
	pageviews: "Pageviews",
	visitors: "Visitors",
	avgTime: "Avg. time on page",
	sources: "Top sources",
	search: "Search",
	annotations: "Annotations",
	revenue: "Revenue",
	open: "Open in the Pages report",
	range: "Last 30 days",
} as const;

/** The parts of the host's `ContentEditorPanelContext` the panel names; the content type field arrives in the rest. */
export interface TrafficPanelProps {
	entry: { id: string; slug?: string | null };
	locale?: string;
}

/** Admin URL of the Pages report filtered to one path over the panel's range. */
export function pagesHref(path: string, range: { from: string; to: string }): string {
	return `${DASHBOARD_HREF}pages?${encodeState({ ...range, compare: "none", filters: [{ dim: "page", op: "is", values: [path] }] })}`;
}

const Figure = ({ label, value }: { label: string; value: string }) => (
	<div className="ca-figure">
		<div className="ca-small">{label}</div>
		<strong>{value}</strong>
	</div>
);

export function TrafficPanel({ entry, locale, ...host }: TrafficPanelProps) {
	const [state, setState] = useState<{ data?: EditorTraffic; error?: string }>({});
	const hostKey = JSON.stringify(host);
	useEffect(() => {
		let live = true;
		call<EditorTraffic>("editor/traffic", { ...(JSON.parse(hostKey) as object), id: entry.id, ...(entry.slug ? { slug: entry.slug } : {}), ...(locale ? { locale } : {}) }).then(
			(data) => live && setState({ data }),
			(e: unknown) => live && setState({ error: e instanceof Error ? e.message : String(e) }),
		);
		return () => {
			live = false;
		};
		// Once per opened entry.
	}, [hostKey, entry.id, entry.slug, locale]);

	const { data, error } = state;
	if (error)
		return (
			<div className="ca-root">
				<Notice tone="error">{error}</Notice>
			</div>
		);
	if (!data)
		return (
			<p className="ca-root ca-small" aria-busy="true">
				{PANEL_TEXT.loading}
			</p>
		);
	if (!data.path || !data.range) return <p className="ca-root ca-small">{PANEL_TEXT.noPage}</p>;
	const link = <a href={pagesHref(data.path, data.range)}>{PANEL_TEXT.open}</a>;
	if (!data.pageviews)
		return (
			<div className="ca-traffic-panel ca-root">
				<p>{PANEL_TEXT.noData}</p>
				{link}
			</div>
		);
	return (
		<div className="ca-traffic-panel ca-root">
			<div className="ca-small">
				{PANEL_TEXT.range}: <code>{data.path}</code>
			</div>
			<Sparkline values={(data.series ?? []).map((p) => p.pageviews)} label={PANEL_TEXT.pageviews} />
			<div className="ca-figures">
				<Figure label={PANEL_TEXT.pageviews} value={fmt(data.pageviews)} />
				<Figure label={PANEL_TEXT.visitors} value={fmt(data.visitors)} />
				<Figure label={PANEL_TEXT.avgTime} value={data.avg_time == null ? "-" : `${fmt(data.avg_time)} s`} />
			</div>
			{!!data.sources?.length && (
				<div>
					<div className="ca-small">{PANEL_TEXT.sources}</div>
					<ul>
						{data.sources.map((s) => (
							<li key={s.key}>
								{s.key} ({fmt(s.sessions)})
							</li>
						))}
					</ul>
				</div>
			)}
			{data.search && (
				<div data-part="search">
					<div className="ca-small">{PANEL_TEXT.search}</div>
					{fmt(data.search.clicks)} clicks, {fmt(data.search.impressions)} impressions, position {data.search.position ?? "-"}
				</div>
			)}
			{data.revenue && (
				<Figure label={PANEL_TEXT.revenue} value={`${data.revenue.revenue.toFixed(2)} ${data.revenue.currency} (${fmt(data.revenue.orders)} orders)`} />
			)}
			{!!data.annotations?.length && (
				<div>
					<div className="ca-small">{PANEL_TEXT.annotations}</div>
					<ul>
						{data.annotations.map((a) => (
							<li key={`${a.ts}:${a.text}`}>
								{a.day}: {a.text}
							</li>
						))}
					</ul>
				</div>
			)}
			{link}
		</div>
	);
}
