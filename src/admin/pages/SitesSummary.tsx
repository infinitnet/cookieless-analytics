/** All-sites summary: one table over every site, shown on the Overview when the switcher reads "All sites". */
import { useEffect, useState } from "react";
import type { RevenueEntry } from "../../query/reports/sites-summary.js";
import type { SummaryRow } from "../../routes/sites.js";
import { call } from "../api.js";
import { ChangeCell } from "../components/Change.js";
import { fmt, type Format } from "../components/format.js";
import type { View } from "../components/Header.js";
import { Notice, Loading, ROW_MAIN, rowLink } from "../components/ui.js";

export interface SummaryResult {
	from: string;
	to: string;
	compareRange: { from: string; to: string } | null;
	watermark: string | null;
	rows: SummaryRow[];
	totals: { sessions: number; pageviews: number; visitors: null; revenue: RevenueEntry[]; previous?: Record<string, unknown> | null };
}

const COLUMNS: ReadonlyArray<readonly [keyof SummaryRow & string, string, Format]> = [
	["sessions", "Sessions", "number"],
	["pageviews", "Pageviews", "number"],
	["visitors", "Visitors", "number"],
	["bounce_rate", "Bounce rate", "percent"],
	["engaged_rate", "Engaged rate", "percent"],
];

/** Revenue as one line per currency, never one number. */
function Revenue({ list }: { list: readonly RevenueEntry[] }) {
	if (!list.length) return <>-</>;
	return (
		<>
			{list.map((e) => (
				<div key={e.currency}>{fmt(e.revenue, `money:${e.currency}`)}</div>
			))}
		</>
	);
}

export function SitesSummary({ state, update }: Pick<View, "state" | "update">) {
	const [res, setRes] = useState<SummaryResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Period comparisons only: a segment does not exist across sites.
	const compare = state.compare === "previous" || state.compare === "year" ? state.compare : "none";
	useEffect(() => {
		let live = true;
		setError(null);
		call<SummaryResult>("sites/summary", { from: state.from, to: state.to, compare }).then(
			(r) => live && setRes(r),
			(e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
		);
		return () => {
			live = false;
		};
	}, [state.from, state.to, compare]);
	if (error) return <Notice tone="error">{error}</Notice>;
	if (!res) return <Loading />;
	return (
		<section className="ca-sites-summary ca-table ca-panel" aria-label="All sites">
			<h3>All sites</h3>
			<div className="ca-table-scroll">
			<table className="ca-grid">
				<thead>
					<tr>
						<th scope="col">
							Site
						</th>
						{COLUMNS.map(([k, label]) => (
							<th key={k} scope="col" className="ca-num">
								{label}
							</th>
						))}
						<th scope="col" className="ca-num">
							Revenue
						</th>
					</tr>
				</thead>
				<tbody>
					{res.rows.map((r) => (
						<tr key={r.id} {...(r.error ? {} : rowLink(() => update({ site: r.kind === "local" ? undefined : r.id })))} className="ca-site-row ca-rowlink" data-error={r.error ? "true" : undefined}>
							<th scope="row">
								<button type="button" {...ROW_MAIN} className="ca-linkbtn ca-rowlink-main" disabled={!!r.error} onClick={() => update({ site: r.kind === "local" ? undefined : r.id })}>
									{r.label}
								</button>
								{r.error && <small role="note"> {r.error}</small>}
							</th>
							{COLUMNS.map(([k, , f]) => (
								<td key={k} className="ca-num">
									{fmt(r[k], f)}
									<ChangeCell metric={k} value={r[k]} prev={r.previous} format={f} />
								</td>
							))}
							<td className="ca-num">
								<Revenue list={r.revenue} />
							</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="ca-totals">
						<th scope="row">
							Total
						</th>
						<td className="ca-num">
							{fmt(res.totals.sessions)}
							<ChangeCell metric="sessions" value={res.totals.sessions} prev={res.totals.previous} format="number" />
						</td>
						<td className="ca-num">
							{fmt(res.totals.pageviews)}
							<ChangeCell metric="pageviews" value={res.totals.pageviews} prev={res.totals.previous} format="number" />
						</td>
						<td className="ca-num" title="A visitor of two sites is two visitors; cross-site uniques are never counted.">
							not summed
						</td>
						<td />
						<td />
						<td className="ca-num">
							<Revenue list={res.totals.revenue} />
						</td>
					</tr>
				</tfoot>
			</table>
			</div>
			<p className="ca-watermark ca-small">
				{res.watermark ? `Daily summaries, complete up to ${res.watermark}.` : "Daily summaries; the first one is not stored yet."}
				{res.compareRange && ` Compared with ${res.compareRange.from} to ${res.compareRange.to}.`}
			</p>
		</section>
	);
}
