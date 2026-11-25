/**
 * Data page, Move data tab: the admin part of "switch first, then backfill". The user points the plugin option at the
 * new database and deploys; this tab then copies the old database's rows into it through the `move/*` routes
 * (`src/routes/move.ts`): source, destination, start with progress, check, and removing the old tables. The page
 * continues a running move call by call while it is open; the `move` cron task does otherwise.
 */
import { Button } from "@cloudflare/kumo";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { DeleteJobView } from "../../../query/filtered-delete.js";
import type { moveView } from "../../../move/job.js";
import { PROFILES } from "../../../settings.js";
import { PANEL_DEFINITIONS, type PanelId } from "../../../charts/definitions.js";
import { call, errorText, withApiSite } from "../../api.js";
import { count } from "../../components/format.js";
import { isRemote, type View } from "../../components/Header.js";
import { Field, InfoMark, Notice } from "../../components/ui.js";
import { wikiUrl } from "../../docs-links.js";
import { SetupEmpty } from "../../setup.js";
import type { Receipt } from "../Data.js";

export type MoveJobState = NonNullable<ReturnType<typeof moveView>>;
export interface MoveState {
	job: MoveJobState | null;
	/** Binding the site writes to now; null is the EmDash database. */
	dest: string | null;
}

const CONFIRM = "DELETE";
/** Rows per chunk by profile, as `MOVE_ROWS` of the job (which this bundle must not import). */
const CHUNK_ROWS = (profile: string) => (profile === "small" ? 50 : 200);
/** Requests one chunk takes: a read, a write and the saved position, plus a marker on the counter tables. */
const CHUNK_REQUESTS = 4;
/** Poll while the day's copy rows are used up: the job does nothing until 00:00 UTC, the cron task resumes it. */
export const CAPPED_WAIT_MS = 300_000;

export const MOVE_TEXT = {
	banner: (n: number) => `Moving data: ${n} percent. Older days appear as they arrive.`,
	paused: (n: number) => `The move is paused at ${n} percent. Reports show the rows copied so far.`,
	denied: "Moving data needs the permission to manage plugins. The steps below show where the data is; an administrator starts the move.",
	deleting: "A delete is still running. Start the move when it has finished.",
	notCounted: "The rows are counted when the move starts; the estimate shows then.",
	estimate: (chunks: number, rows: number, perRun: number, minutes: number) =>
		`About ${count(chunks)} chunks of up to ${count(rows)} rows are left. The background run each minute moves up to about ${count(perRun)} of them, so roughly ${count(minutes)} minutes without this page open, less while it is open. This is an estimate: the real time depends on the size of the rows and the speed of both databases.`,
	split: "A visitor who was on the site during the switch counts as two visits on that day. Page views, events and revenue are complete.",
	checkWait: "The check runs when the copy has finished.",
	removeWait: "Available once the check found nothing missing.",
	dropped: "The old tables were deleted.",
	capped: (rows: number, cap: number, days: number) =>
		`Today's rows for moving are used: ${count(rows)} rows were written into the new database today, and on the small profile a move writes at most ${count(cap)} a day so recording keeps priority. The move continues tomorrow after 00:00 UTC by itself, also without this page open. At this pace it takes at least ${count(days)} more ${days === 1 ? "day" : "days"}.`,
	canceled: "Starting again with the same source and site continues this move from where it stopped.",
} as const;

const name = (b: string | null) => (b ? `Binding ${b}` : "The EmDash database");
const nameIn = (b: string | null) => (b ? `the binding ${b}` : "the EmDash database");
const statusWord = { running: "Running", paused: "Paused", done: "Done", canceled: "Canceled" } as const;

function Step({ n, title, panel, children }: { n: number; title: string; panel: PanelId; children: ReactNode }) {
	return (
		<section className="ca-panel" aria-label={title}>
			<h3>
				{n}. {title}
				<InfoMark text={PANEL_DEFINITIONS[panel]} />
			</h3>
			{children}
		</section>
	);
}

/** Every chunk left of the job, and the minutes the per minute background run alone takes for them. */
export function moveEstimate(job: Pick<MoveJobState, "total" | "read">, profile: string): { chunks: number; rows: number; perRun: number; minutes: number } {
	const rows = CHUNK_ROWS(profile);
	const chunks = Object.entries(job.total).reduce((a, [t, n]) => a + Math.ceil(Math.max(0, n - (job.read[t] ?? 0)) / rows), 0);
	const perRun = Math.max(1, Math.floor((PROFILES[profile as keyof typeof PROFILES]?.requests ?? 40) / CHUNK_REQUESTS));
	return { chunks, rows, perRun, minutes: Math.ceil(chunks / perRun) };
}

const rowsRead = (j: Pick<MoveJobState, "read">) => Object.values(j.read).reduce((a, b) => a + b, 0);

/** The day's copy rows of a job waiting for 00:00 UTC: rows written today, the day's cap, and days left at least (an indexed row counts twice). */
export function moveCapped(job: Pick<MoveJobState, "until" | "today" | "rowsLeftToday" | "total" | "read">): { rows: number; cap: number; days: number } | null {
	if (!job.until || !job.today) return null;
	const cap = job.today.rows + (job.rowsLeftToday ?? 0);
	const left = Object.entries(job.total).reduce((a, [t, n]) => a + Math.max(0, n - (job.read[t] ?? 0)), 0);
	return { rows: job.today.rows, cap, days: cap > 0 ? Math.max(1, Math.ceil(left / cap)) : 1 };
}

/** True when the check of a finished move covered every table and found nothing missing. */
export const checkClean = (job: MoveJobState | null): boolean =>
	!!job && job.status === "done" && !job.dropped && Object.keys(job.total).every((t) => job.verify[t]) && Object.values(job.verify).every((v) => v.short === 0);

export function MoveData({ view }: { view: View }) {
	const [st, setSt] = useState<MoveState | null>(null);
	const [denied, setDenied] = useState<string | null>(null);
	const [receipt, setReceipt] = useState<Receipt | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fromBinding, setFromBinding] = useState(false);
	const [binding, setBinding] = useState("");
	const [site, setSite] = useState("");
	const [typed, setTyped] = useState("");

	useEffect(() => {
		call<MoveState>("move/status").then(
			(r) => {
				setSt(r);
				// A new move starts from the last one's source and site: for a canceled move the start route then continues it.
				if (r.job?.source) (setFromBinding(true), setBinding(r.job.source));
				if (r.job?.site) setSite(r.job.site);
			},
			(e: unknown) => setDenied(errorText(e)),
		);
		call<Receipt>("privacy/receipt", withApiSite({})).then(setReceipt, () => {});
		call<{ job: DeleteJobView | null }>("tools/delete-status").then(
			(d) => setDeleting(d.job?.status === "running" || d.job?.status === "canceling"),
			() => {},
		);
	}, []);
	// While the move runs, the page continues it call by call, as the delete tools do; it stops when the job does.
	const job = st?.job ?? null;
	const [wait, setWait] = useState(300);
	useEffect(() => {
		if (job?.status !== "running") return;
		let t: ReturnType<typeof setTimeout> | undefined;
		const before = rowsRead(job);
		const next = () =>
			call<MoveState>("move/run").then(
				(r) => {
					// No rows read: the background run holds the lease. Ask again in a few seconds, not at once.
					setWait(r.job && rowsRead(r.job) === before ? 5_000 : 300);
					setSt(r);
				},
				(e: unknown) => {
					// A failed call does not stop the move: try again later until a call answers (a new state re-arms this).
					setError(errorText(e));
					t = setTimeout(() => void next(), 30_000);
				},
			);
		t = setTimeout(() => void next(), job.until ? CAPPED_WAIT_MS : wait);
		return () => clearTimeout(t);
	}, [job]);

	const act = async (route: string, body: unknown = {}) => {
		setBusy(true);
		setError(null);
		try {
			setSt(await call<MoveState>(route, body));
			return true;
		} catch (e) {
			setError(errorText(e));
			return false;
		} finally {
			setBusy(false);
		}
	};
	const canAct = st !== null && !denied;
	/** A move of one site leaves the other sites' rows in the old tables: the route refuses removing them. */
	const oneSite = job?.status === "done" && job.site !== undefined;
	const moving = job?.status === "running" || job?.status === "paused";
	const source = fromBinding ? binding.trim() : null;
	const sites = view.sites.filter((s) => !isRemote(s) && s.id);
	const onStart = () => void act("move/start", { source, ...(site ? { site } : {}) });
	const onDrop = async (e: FormEvent) => {
		e.preventDefault();
		if (typed !== CONFIRM) return;
		if (await act("move/drop-old-tables", { confirm: CONFIRM })) setTyped("");
	};
	const c = receipt?.capacity;
	const destRows = receipt?.tables.reduce((a, t) => a + ("rows" in t ? Number(t.rows) || 0 : 0), 0);
	const profile = c?.profile ?? "standard";
	const est = job && moving ? moveEstimate(job, profile) : null;
	const capped = job?.status === "running" ? moveCapped(job) : null;
	const clean = checkClean(job) && !oneSite;
	const tables = job ? Object.keys(job.total) : [];

	return (
		<div className="ca-stack">
			{job?.status === "running" && <Notice tone="info">{MOVE_TEXT.banner(job.percent)}</Notice>}
			{job?.status === "paused" && <Notice tone="warning">{MOVE_TEXT.paused(job.percent)}</Notice>}
			{st && !job && st.dest === null && <SetupEmpty kind="move" />}
			<Notice tone="info" label="Before you start">
				<p>The page cannot change where the site writes. One config change and one deploy come first:</p>
				<ol>
					<li>Create the new database (D1, or Postgres through Hyperdrive with caching disabled) and add its binding to your wrangler config.</li>
					<li>Point the plugin option at it (database, or a site in databases) and deploy. From then on new data goes there; the old database keeps everything up to the deploy.</li>
					<li>Then move the older rows here.</li>
				</ol>
				<p>
					Guides: <a href={wikiUrl("Move-Data")} target="_blank" rel="noreferrer">Move data</a>, <a href={wikiUrl("Postgres-Hyperdrive")} target="_blank" rel="noreferrer">Postgres through Hyperdrive</a>. Without a binding of the old database in this Worker (another account or install), use the command line tool instead: <code>ca-data export</code> on the old site and <code>ca-data import</code> on the new one.
				</p>
			</Notice>
			{denied && <Notice tone="info">{MOVE_TEXT.denied}</Notice>}
			{error && <Notice tone="error">{error}</Notice>}

			<Step n={1} title="Where the data is now" panel="move_source">
				{job && (
					<>
						<p>
							{name(job.source)}
							{job.site ? `, the rows of site ${job.site}` : ", every site"}.
						</p>
						<p className="ca-small">Rows when the move started: {count(Object.values(job.total).reduce((a, b) => a + b, 0))}.</p>
					</>
				)}
				{canAct && !moving ? (
					<div role="group" aria-label="Source" className="ca-form">
						<label>
							<input type="radio" name="ca-move-source" checked={!fromBinding} onChange={() => setFromBinding(false)} /> The EmDash database
						</label>
						<label>
							<input type="radio" name="ca-move-source" checked={fromBinding} onChange={() => setFromBinding(true)} /> Another database of this Worker
						</label>
						{fromBinding && (
							<Field label="Binding name in your wrangler config">
								<input value={binding} onChange={(e) => setBinding(e.target.value)} autoComplete="off" spellCheck={false} placeholder="CA_DB_OLD" />
							</Field>
						)}
						{sites.length > 1 && (
							<Field label="Site">
								<select value={site} onChange={(e) => setSite(e.target.value)}>
									<option value="">Every site</option>
									{sites.map((s) => (
										<option key={s.id} value={s.id}>
											{s.label}
										</option>
									))}
								</select>
							</Field>
						)}
						<p className="ca-small">{MOVE_TEXT.notCounted}</p>
					</div>
				) : (
					!job && <p className="ca-small">{denied ? "Shown to users who manage plugins." : "No move yet."}</p>
				)}
			</Step>

			<Step n={2} title="Where it goes" panel="move_dest">
				<dl className="ca-meta">
					<dt>Database</dt>
					<dd>{st ? name(job?.dest ?? st.dest) : c ? name(c.database) : "Not known yet"}</dd>
					{c && (
						<>
							<dt>Engine</dt>
							<dd>{c.health.engine === "postgres" ? "Postgres through Hyperdrive" : "D1"}</dd>
							<dt>Health</dt>
							<dd>{`${c.health.status === "caching_on" ? "Query caching is on: fix it before moving" : c.health.status === "slow" ? "Slow" : "Answering"}; the self-check took ${count(c.health.latencyMs)} ms.`}</dd>
						</>
					)}
					{destRows !== undefined && (
						<>
							<dt>Rows now</dt>
							<dd>{count(destRows)}</dd>
						</>
					)}
				</dl>
			</Step>

			<Step n={3} title="Start" panel="move_start">
				{capped ? <Notice tone="info">{MOVE_TEXT.capped(capped.rows, capped.cap, capped.days)}</Notice> : est && <p>{MOVE_TEXT.estimate(est.chunks, est.rows, est.perRun, est.minutes)}</p>}
				{job && (
					<div className="ca-table-scroll">
						<table className="ca-grid" aria-label="Progress per table">
							<thead>
								<tr>
									<th>Table</th>
									<th className="ca-num">Rows read</th>
									<th className="ca-num">Of</th>
									<th className="ca-num">New rows written</th>
								</tr>
							</thead>
							<tbody>
								{tables.map((t) => (
									<tr key={t}>
										<td>
											<code>{t}</code>
										</td>
										<td className="ca-num">{count(job.read[t] ?? 0)}</td>
										<td className="ca-num">{count(job.total[t] ?? 0)}</td>
										<td className="ca-num">{count(job.inserted[t] ?? 0)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				{job && (
					<p>{job.status === "done" ? "Done." : `${statusWord[job.status]}, ${job.percent} percent.`}</p>
				)}
				{job?.status === "done" && <p className="ca-small">{MOVE_TEXT.split}</p>}
				{job?.status === "canceled" && !job.dropped && <p className="ca-small">{MOVE_TEXT.canceled}</p>}
				{job?.error && <Notice tone="error">{job.status === "paused" ? job.error : `The last chunk failed (${job.error}). It is tried again with the next call.`}</Notice>}
				{canAct && (
					<div className="ca-actions">
						{!moving && (
							<Button variant="primary" size="sm" disabled={busy || deleting || (fromBinding && !source)} onClick={onStart}>
								{job ? "Start a new move" : "Start the move"}
							</Button>
						)}
						{moving && (
							// One button for both, so keyboard focus stays on it.
							<Button size="sm" disabled={busy} onClick={() => void act("move/pause", job?.status === "paused" ? { resume: true } : {})}>
								{job?.status === "paused" ? "Resume" : "Pause"}
							</Button>
						)}
						{moving && (
							<Button variant="secondary-destructive" size="sm" disabled={busy} onClick={() => void act("move/cancel")}>
								Cancel the move
							</Button>
						)}
						{deleting && !moving && <span className="ca-small">{MOVE_TEXT.deleting}</span>}
					</div>
				)}
			</Step>

			<Step n={4} title="Check" panel="move_check">
				{job?.status === "done" && Object.keys(job.verify).length > 0 ? (
					<div className="ca-table-scroll">
						<table className="ca-grid" aria-label="Check per table">
							<thead>
								<tr>
									<th>Table</th>
									<th className="ca-num">Days checked</th>
									<th className="ca-num">Short</th>
									<th className="ca-num">More</th>
								</tr>
							</thead>
							<tbody>
								{Object.entries(job.verify).map(([t, v]) => (
									<tr key={t} data-short={v.short > 0 || undefined}>
										<td>
											<code>{t}</code>
										</td>
										<td className="ca-num">{count(v.keys)}</td>
										<td className="ca-num">{count(v.short)}</td>
										<td className="ca-num">{count(v.more)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="ca-small">{MOVE_TEXT.checkWait}</p>
				)}
				{job?.status === "done" && !job.dropped && (
					<>
						<p className="ca-small">Short: rows missing in the new database. More: rows written there since the switch, and visits split at the switch.</p>
						{!clean && <Notice tone="warning">Rows are missing in the new database. Run the check again after the next daily summaries, or start a new move; it copies only what is missing.</Notice>}
						{canAct && (
							<Button size="sm" disabled={busy} onClick={() => void act("move/verify")}>
								Check again
							</Button>
						)}
					</>
				)}
			</Step>

			<Step n={5} title="Remove the old tables" panel="move_remove">
				{job?.dropped ? (
					<Notice tone="success">{MOVE_TEXT.dropped}</Notice>
				) : (
					<>
						<p className="ca-small">
							Deletes the nine tables and the table layout record from {job ? nameIn(job.source) : "the old database"}. Settings and definitions stay. It cannot be undone; until then, pointing the option back and deploying is a full way back.
						</p>
						<p className="ca-small" id="ca-move-remove-wait">
						{oneSite ? `Only the rows of site ${job.site} were moved; the old tables keep the other sites' rows and stay.` : clean ? "" : MOVE_TEXT.removeWait}
					</p>
						{canAct && (
							<form aria-label="Remove the old tables" className="ca-form" onSubmit={(e) => void onDrop(e)}>
								<Field label={`Type ${CONFIRM} to confirm`}>
									<input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={!clean} aria-describedby="ca-move-remove-wait" />
								</Field>
								<Button variant="secondary-destructive" size="sm" type="submit" disabled={busy || !clean || typed !== CONFIRM}>
									Delete the old tables
								</Button>
							</form>
						)}
					</>
				)}
			</Step>
		</div>
	);
}
