/**
 * Delete tab, matching visits: conditions on what a visit stores, a read-only preview (per day, top values, revenue,
 * summary days, rows written), a typed confirmation, then a job the server runs in bounded calls. The page continues
 * the job while it is open; the hourly `retention` cron task does otherwise. Recent deletions are listed from the audit log.
 */
import { Button } from "@cloudflare/kumo";
import { type FormEvent, Fragment, useEffect, useState } from "react";
import { PLUGIN_ID } from "../../contract.js";
import type { DeleteJobView, DeleteLogEntry, DeletePreview, DeleteSpec, SCREENS } from "../../query/filtered-delete.js";
import { type Dim, type Filter, TRAFFIC_DIMS } from "../../query/filters.js";
import { call, errorText, withApiSite } from "../api.js";
import { DIM_LABELS, FilterBar } from "../components/FilterBar.js";
import { count } from "../components/format.js";
import type { View } from "../components/Header.js";
import { SETTINGS_HREF } from "../components/ReportNotices.js";
import { Field, Notice } from "../components/ui.js";

/** Visit dims (the same rule as `DELETE_DIMS` on the server, which this bundle must not import). */
const DIMS = (Object.keys(TRAFFIC_DIMS) as Array<keyof typeof TRAFFIC_DIMS>).filter((k) => TRAFFIC_DIMS[k].scope === "session") as Dim[];
const SCREEN_LABELS = [
	["xs", "Phone, under 576 px"],
	["sm", "Small tablet, 576 to 767 px"],
	["md", "Tablet, 768 to 991 px"],
	["lg", "Laptop, 992 to 1199 px"],
	["xl", "Desktop, 1200 px and wider"],
] as const satisfies ReadonlyArray<readonly [(typeof SCREENS)[number], string]>;
const TOP_LABELS: Record<string, string> = { country: "Country", browser: "Browser", os: "OS", device: "Device", channel: "Channel", ref_host: "Referrer", entry_path: "Entry page" };
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const CONFIRM = "DELETE";
const USER_AGENT_RULES_HREF = `/_emdash/admin/plugins/${PLUGIN_ID}/config?tab=user-agents`;

const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

export const PROFILE_LABELS: Record<string, string> = { small: "Small (Workers Free)", standard: "Standard", dedicated: "Dedicated database" };

/** The cost sentence of a delete preview for the site's real capacity profile: only `small` caps the rows a day. */
export function deleteCostText(est: DeletePreview["estimate"], rows: number): string {
	const head = `About ${plural(rows, "row")} written.`;
	if (est.profile !== "small") return `${head} On the ${PROFILE_LABELS[est.profile] ?? est.profile} profile there is no daily row cap: the delete runs in steps until it is done.`;
	const today = est.today ? ` Today's writes so far: about ${count(est.today.rows)} of ${count(est.today.limit)}; this delete is ${Math.round((100 * rows) / est.today.limit)} percent of that allowance.` : "";
	return `${head} On the Small profile this takes ${plural(Math.max(1, Math.ceil(rows / est.dayRows)), "UTC day")}: at most ${count(est.dayRows)} rows a day, paused while the daily write guard is high.${today}`;
}
const money = (v: number, cur: string) => `${v.toFixed(2)} ${cur}`;
const when = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ");

interface DeleteState {
	job: DeleteJobView | null;
	log: DeleteLogEntry[];
	dayRows: number | null;
}
const active = (j: DeleteJobView | null | undefined) => j?.status === "running" || j?.status === "cancelling";

export function FilteredDelete({ view }: { view: View }) {
	const [from, setFrom] = useState(view.state.from);
	const [to, setTo] = useState(view.state.to);
	const [filters, setFilters] = useState<Filter[]>([]);
	const [screen, setScreen] = useState<string[]>([]);
	const [hFrom, setHFrom] = useState("");
	const [hTo, setHTo] = useState("");
	const [shape, setShape] = useState(false);
	const [oldDays, setOldDays] = useState(false);
	const [preview, setPreview] = useState<DeletePreview | null>(null);
	const [typed, setTyped] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [state, setState] = useState<DeleteState | null>(null);

	const spec = (): DeleteSpec => ({
		from,
		to,
		filters,
		...(screen.length ? { screen: screen as DeleteSpec["screen"] } : {}),
		...(hFrom !== "" && hTo !== "" ? { hours: { from: Number(hFrom), to: Number(hTo) } } : {}),
		...(shape ? { shape: "single_view_idle" as const } : {}),
		...(oldDays ? { oldDays: true } : {}),
	});
	/** Any change to the conditions drops the preview: the confirmation must match what is shown. */
	const edit =
		<T,>(set: (v: T) => void) =>
		(v: T) => {
			set(v);
			setPreview(null);
			setTyped("");
		};

	useEffect(() => {
		call<DeleteState>("tools/delete-status").then(setState, (e: unknown) => setError(errorText(e)));
	}, []);
	// While a job runs, the page continues it call by call; a paused job is looked at again each minute.
	const job = state?.job;
	useEffect(() => {
		if (!active(job)) return;
		let retry: ReturnType<typeof setTimeout> | undefined;
		const t = setTimeout(
			() =>
				call<DeleteState>("tools/delete-run").then(setState, (e: unknown) => {
					setError(errorText(e));
					// One failed call does not stop the job: read the status again later, which continues it.
					retry = setTimeout(() => call<DeleteState>("tools/delete-status").then(setState, (e2: unknown) => setError(errorText(e2))), 30_000);
				}),
			job?.paused ? 60_000 : 300,
		);
		return () => {
			clearTimeout(t);
			clearTimeout(retry);
		};
	}, [job]);
	/** The job and the log are install-wide: name the site of an entry. */
	const siteName = (id: string) => view.sites.find((s) => s.id === id)?.label ?? id;
	/** Exactly one hour chosen sends no hour condition: Preview waits for both or neither. */
	const halfHour = (hFrom === "") !== (hTo === "");

	const run = async (route: string, body: unknown, done: (r: never) => void) => {
		setBusy(true);
		setError(null);
		try {
			done((await call(route, body)) as never);
		} catch (e) {
			setError(errorText(e));
		}
		setBusy(false);
	};
	const onPreview = () => {
		void run("tools/delete-preview", withApiSite({ spec: spec() }), (p: DeletePreview) => setPreview(p));
	};
	const p = preview;
	const old = p?.old?.days.length ? p.old : null;
	const visits = p?.totals.visits ?? 0;
	const doable = !!p && (visits > 0 || (oldDays && !!old));
	const rows = p ? p.estimate.deleteRows + p.estimate.summaryRows + (oldDays && old ? old.summaryRows : 0) : 0;
	const onStart = (e: FormEvent) => {
		e.preventDefault();
		void run("tools/delete-start", withApiSite({ spec: spec(), confirm: typed.trim() }), (s: DeleteState) => {
			setState(s);
			setPreview(null);
			setTyped("");
		});
	};
	const confirmed = typed.trim() === CONFIRM || (visits > 0 && typed.trim() === String(visits));
	const last = job && !active(job) ? job : null;

	return (
		<section aria-label="Delete matching visits" className="ca-fd">
			<h3>Delete matching visits</h3>
			<p className="ca-small">
				For spam or bots that were counted as visitors. Visits are matched on what is stored about them (no IP address and no full user agent are kept): country, region, device, browser, OS, language, screen size, channel, source, referrer, campaign, entry and exit page, host, hour of day and the shape of the visit. Conditions combine with AND; values inside one condition with OR.
			</p>
			{job && active(job) && <JobProgress job={job} site={siteName(job.site)} dayRows={state?.dayRows ?? null} busy={busy} onCancel={() => void run("tools/delete-cancel", {}, setState)} />}
			{last && (
				<Notice tone={last.status === "done" ? "success" : "info"}>
					{siteName(last.site)}: {last.status === "done" ? "Deleted" : "Cancelled after deleting"} {plural(last.deleted.visits, "visit")}, {plural(last.deleted.orders, "order")} and {plural(last.deleted.refunds, "refund")}. Daily summaries stored again: {plural(last.deleted.summaryDays, "day")}
					{last.deleted.oldDays ? `; whole summaries deleted: ${plural(last.deleted.oldDays, "day")}` : ""}.
					{last.skipped.length ? ` ${plural(last.skipped.length, "day")} left the detailed window before its summary could be stored again and keeps the old summary.` : ""}
				</Notice>
			)}
			{/* Not a form: the filter bar holds its own forms. */}
			<div role="group" aria-label="Conditions" className="ca-form">
				<div className="ca-actions">
					<Field label="From">
						<input type="date" required value={from} onChange={(e) => edit(setFrom)(e.target.value)} />
					</Field>
					<Field label="To">
						<input type="date" required value={to} onChange={(e) => edit(setTo)(e.target.value)} />
					</Field>
					<Field label="Hour of day from (site time)">
						<select value={hFrom} onChange={(e) => edit(setHFrom)(e.target.value)}>
							<option value="">Any</option>
							{HOURS.map((h) => (
								<option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
							))}
						</select>
					</Field>
					<Field label="Hour of day to">
						<select value={hTo} onChange={(e) => edit(setHTo)(e.target.value)}>
							<option value="">Any</option>
							{HOURS.map((h) => (
								<option key={h} value={h}>{`${String(h).padStart(2, "0")}:59`}</option>
							))}
						</select>
					</Field>
				</div>
				<FilterBar filters={filters} onChange={edit(setFilters)} dims={DIMS} />
				<fieldset className="ca-fd-checks">
					<legend>Screen size</legend>
					{SCREEN_LABELS.map(([k, l]) => (
						<label key={k}>
							<input type="checkbox" checked={screen.includes(k)} onChange={(e) => edit(setScreen)(e.target.checked ? [...screen, k] : screen.filter((x) => x !== k))} /> {l}
						</label>
					))}
				</fieldset>
				<fieldset className="ca-fd-checks">
					<legend>Typical bot visit</legend>
					<label>
						<input type="checkbox" checked={shape} onChange={(e) => edit(setShape)(e.target.checked)} /> One page view, no engaged time and no scroll (combine it with a country or a browser above)
					</label>
				</fieldset>
				<div className="ca-actions">
					<Button variant="primary" size="sm" disabled={busy || !from || !to || from > to || halfHour} onClick={onPreview}>
						Preview matching visits
					</Button>
					{halfHour && <span className="ca-small">Choose both hours of day, or neither.</span>}
				</div>
			</div>
			{error && <Notice tone="error">{error}</Notice>}
			{p && <PreviewView p={p} oldDays={oldDays} setOldDays={setOldDays} rows={rows} />}
			{p && doable && (
				<form aria-label="Confirm delete" className="ca-form" onSubmit={onStart}>
					<Field label={visits > 0 ? `Type ${visits} or ${CONFIRM} to confirm` : `Type ${CONFIRM} to confirm`}>
						<input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
					</Field>
					<Button variant="secondary-destructive" size="sm" type="submit" disabled={busy || !confirmed || active(job)}>
						{visits > 0 ? `Delete ${plural(visits, "visit")}` : `Delete the summaries of ${plural(old?.days.length ?? 0, "day")}`}
					</Button>
					{active(job) && <span className="ca-small"> A delete is still running.</span>}
				</form>
			)}
			<RecentDeletions log={state?.log ?? []} siteName={siteName} />
		</section>
	);
}

function JobProgress({ job, site, dayRows, busy, onCancel }: { job: DeleteJobView; site: string; dayRows: number | null; busy: boolean; onCancel: () => void }) {
	const done = Math.min(job.i, job.days.length);
	return (
		<div className="ca-panel" role="status" aria-label="Delete in progress">
			<p>
				<strong>{job.status === "cancelling" ? "Cancelling: storing the touched days again." : `Deleting: ${done} of ${plural(job.days.length, "day")}`}</strong>
				{`, ${count(job.deleted.visits)} of ${plural(job.expected, "visit")} so far. Rows written today ${count(job.utc.rows)}${dayRows ? ` of ${count(dayRows)}` : ""}.`}
			</p>
			{job.paused && (
				<p className="ca-small">
					{job.paused.reason === "guard" ? "Paused: the daily write guard is high, so recording keeps priority." : "Paused: today's rows for deleting are used."} It continues by itself after 00:00 UTC.
				</p>
			)}
			<p className="ca-small">
				Site: {site}. Conditions: {job.summary}
			</p>
			{job.status === "running" && (
				<Button size="sm" disabled={busy} onClick={onCancel}>
					Cancel delete
				</Button>
			)}
		</div>
	);
}

function PreviewView({ p, oldDays, setOldDays, rows }: { p: DeletePreview; oldDays: boolean; setOldDays: (v: boolean) => void; rows: number }) {
	const t = p.totals;
	const max = Math.max(1, ...p.days.map((d) => d.visits));
	const old = p.old?.days.length ? p.old : null;
	const lo = p.from < p.rawFrom ? p.rawFrom : p.from;
	return (
		<div className="ca-panel" aria-label="Preview">
			<h4>Preview</h4>
			<p role="status">
				<strong>{plural(t.visits, "visit")} match</strong> from {lo} to {p.to}: {plural(t.pageviews, "page view")}, {plural(t.events, "event")}, {plural(t.orders, "order")} and {plural(t.refunds, "refund")}.
			</p>
			<p className="ca-small">Conditions: {p.summary}</p>
			{t.orders + t.refunds > 0 && (
				<Notice tone="warning" label="Revenue changes">
					These visits carry {p.revenue.map((r) => `${plural(r.orders, "order")} (${money(r.revenue, r.cur)})${r.refunds ? ` and ${plural(r.refunds, "refund")} (${money(r.refunded, r.cur)})` : ""}`).join(", ")}. They are deleted with the visits, so revenue figures go down.
				</Notice>
			)}
			{old && (
				<Notice tone="info" label="Older days">
					{plural(old.days.length, "day")} from {old.from} to {old.to} are older than the detailed data, which starts on {p.rawFrom}. Only daily summaries are kept for them and summaries cannot be filtered, so their visits are not counted above.
					<label className="ca-fd-old">
						<input type="checkbox" checked={oldDays} onChange={(e) => setOldDays(e.target.checked)} /> Also delete the whole daily summaries of these {plural(old.days.length, "day")} ({plural(old.days.reduce((a, d) => a + d.visits, 0), "visit")}, all traffic of those days, not only the matches)
					</label>
				</Notice>
			)}
			{p.days.length > 0 && (
				<>
					<div className="ca-table-scroll ca-fd-days">
						<table className="ca-grid" aria-label="Matching visits per day">
							<thead>
								<tr>
									<th>Day</th>
									<th className="ca-num">Visits</th>
									<th className="ca-num">Page views</th>
									<th aria-hidden="true" />
								</tr>
							</thead>
							<tbody>
								{p.days.map((d) => (
									<tr key={d.day}>
										<td>{d.day}</td>
										<td className="ca-num">{count(d.visits)}</td>
										<td className="ca-num">{count(d.pageviews)}</td>
										<td className="ca-fd-barcell" aria-hidden="true">
											<span className="ca-fd-bar" style={{ width: `${(100 * d.visits) / max}%` }} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<h4>Top values of the matches</h4>
					<p className="ca-small">Check that this is the traffic you mean to delete.</p>
					<dl className="ca-meta">
						{Object.entries(p.top).map(([dim, vals]) => (
							<Fragment key={dim}>
								<dt>{TOP_LABELS[dim] ?? DIM_LABELS[dim as Dim] ?? dim}</dt>
								<dd>{vals.map((v) => `${v.value ?? "(not set)"} ${Math.round((100 * v.visits) / Math.max(1, t.visits))}%`).join(", ")}</dd>
							</Fragment>
						))}
					</dl>
				</>
			)}
			<h4>What is removed</h4>
			<ul>
				<li>
					Detailed rows: {plural(t.visits, "visit")} in ca_sessions with their page views and events, and {plural(t.eventRows, "row")} of orders, refunds and server events in ca_events.
				</li>
				<li>
					Daily summaries: {plural(p.recloseDays, "closed day")} {p.recloseDays === 1 ? "is" : "are"} stored again from the visits that remain (ca_rollup, ca_revenue_daily, ca_cube). Days not closed yet are computed when read.
				</li>
				{oldDays && old && <li>Older days: the daily summaries of {plural(old.days.length, "day")} are deleted whole.</li>}
			</ul>
			<p>{deleteCostText(p.estimate, rows)}</p>
			<Notice tone="info" label="Keep it out">
				To stop this traffic from being counted again, add an <a href={USER_AGENT_RULES_HREF}>user agent rule</a> or an excluded path or IP range in the <a href={`${SETTINGS_HREF}?tab=privacy`}>privacy and exclusion settings</a>. Nothing is added for you.
			</Notice>
		</div>
	);
}

function RecentDeletions({ log, siteName }: { log: DeleteLogEntry[]; siteName: (id: string) => string }) {
	return (
		<>
			<h4>Recent deletions</h4>
			{log.length ? (
				<div className="ca-table-scroll">
					<table className="ca-grid" aria-label="Recent deletions">
						<thead>
							<tr>
								<th>Finished (UTC)</th>
								<th>By</th>
								<th>Site</th>
								<th>Conditions</th>
								<th className="ca-num">Visits</th>
								<th className="ca-num">Orders</th>
								<th className="ca-num">Days stored again</th>
								<th>Result</th>
							</tr>
						</thead>
						<tbody>
							{log.map((l) => (
								<tr key={`${l.at}-${l.finished}`}>
									<td>{when(l.finished)}</td>
									<td>{l.by ?? "unknown"}</td>
									<td>{siteName(l.site)}</td>
									<td>{l.summary}</td>
									<td className="ca-num">{count(l.deleted.visits)}</td>
									<td className="ca-num">{count(l.deleted.orders)}</td>
									<td className="ca-num">{count(l.deleted.summaryDays)}</td>
									<td>{l.status === "done" ? "Done" : "Cancelled"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="ca-small">No deletions yet.</p>
			)}
		</>
	);
}
