/** Data page: storage and retention, export, privacy receipt, delete. */
import { Button } from "@cloudflare/kumo";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import type { ReportName } from "../../query/reports/index.js";
import { addDays } from "../../core/time.js";
import type { DropKind } from "../../core/drops.js";
import type { buildReceipt, capacityOf } from "../../routes/privacy.js";
import { call, errorText, exportReport, withApiSite } from "../api.js";
import { isRemote, Shell, siteKind, toQuery, useShellHead, type View } from "../components/Header.js";
import { count } from "../components/format.js";
import { PANEL_DEFINITIONS } from "../../charts/definitions.js";
import { Disclosure, Empty, InfoMark, Loading, Notice, Tabs, TONE_ICON, TONE_LABEL, type Tone } from "../components/ui.js";
import { Field, RemoteNotice } from "./Config.js";
import { FilteredDelete, PROFILE_LABELS } from "./DataDelete.js";
import { SETTINGS_HREF } from "../components/ReportNotices.js";
import { wikiUrl } from "../docs-links.js";
import { activeTab, tabParam, useRevenue } from "./report.js";
import { BUDGET_TEXT, budgetText } from "./Settings.js";
import { MoveData } from "./data/MoveData.js";

export type Receipt = Awaited<ReturnType<typeof buildReceipt>> & {
	db: { dialect: string };
	ingest?: { tier: "direct" | "queue"; queueBound: boolean };
	capacity?: Awaited<ReturnType<typeof capacityOf>>;
};

/** Share of the storage budget from which the Data page shows a notice. */
export const STORAGE_NOTICE = 0.85;
/** Shares of the most a D1 database holds from which the live size is a warning, then critical. */
export const FULL_WARNING = 0.8;
export const FULL_CRITICAL = 0.9;
/** Shown while the write guard of the small profile stops recording. */
export const WRITES_NOTICE = "The daily write allowance of the small profile is nearly used. Recording resumes at the next UTC day.";
const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

/** Readable reasons of `ca_drops` (every kind, so a new reason fails to compile here until it has its words). */
export const DROP_LABELS: Record<DropKind, string> = {
	bot: "Known bots",
	privacy_signal: "Privacy signal of the browser (DNT or GPC)",
	excluded_path: "Excluded path",
	excluded_ip: "Excluded IP address",
	session_cap: "Visit reached its page view or event cap",
	sid_rate: "Too many events from one visit",
	vkey_rate: "Too many visits from one visitor",
	reload: "Reload counted once",
	invalid: "Invalid request",
	origin_rejected: "Sent from a host that is not registered",
	unknown_key: "Unknown site key",
	site_paused: "Site paused",
	revenue_invalid: "Revenue value not valid",
	revenue_not_accepted: "Revenue from the browser not accepted",
	duplicate_order: "Order already recorded",
	orphan_update: "Engagement update without its visit",
	overload: "Database overloaded (sent again by the page script)",
	write_error: "Database write failed (sent again by the page script)",
	daily_limit: "Daily limit of the Workers Free plan reached",
	budget_blocked: "Paused by the daily write guard",
	late_after_close: "Arrived after its day's summary was stored",
};


/** Copy of the capacity notices (PLAN 4.4 meaning; numbers filled in). */
export const CAPACITY_TEXT = {
	free: "This install appears to run on the Workers Free plan. Choose the Small capacity profile.",
	overload: (n: number) => `${count(n)} events could not be stored today because the database was overloaded. The page script sends them again; see Limits in the documentation.`,
	shortened: (n: number) =>
		`Detailed data is kept for ${n} days because the storage limit of this profile is reached. Older days are available as summaries. To keep more: give these tables their own database, or raise the profile.`,
	catchingUp: (day: string) => `Daily summaries are stored through ${day}. The later closed days are written by the next background runs.`,
	full: (bytes: number, cap: number) => `The database holds ${size(bytes)} of the ${cap < 1e9 ? `${size(cap)} a D1 database on the Workers Free plan` : `${cap / 1e9} GB a D1 database`} can hold.`,
	fullOwn: "D1 refuses every write at 10 GB. When this database is full, recording stops until data is deleted. Lower the storage budget or delete old data.",
	cacheOn: (binding: string | null) => `Query caching is on for the Hyperdrive binding${binding ? ` ${binding}` : ""}. Page views and events are not recorded.`,
	cacheOnDetail:
		"Hyperdrive answers a read from its cache after a write, so page views would be lost. Until caching is off, every page view and event is refused and counted under Database write failed. Recreate the Hyperdrive configuration with --caching-disabled (wrangler hyperdrive create <name> --connection-string=<url> --caching-disabled), put the new id in the binding of your wrangler config and deploy.",
	slow: (ms: number) => `The database answered in ${count(ms)} ms.`,
	slowDetail: (engine: string) =>
		`Each page view and event waits for a few statements before it is stored, so a slow database can make requests fail and be sent again by the page script.${engine === "postgres" ? " With Postgres through Hyperdrive, set placement.region in your wrangler config to the region of the database. A Neon database that scaled to zero took about 700 ms for its first statement (measured)." : ""}`,
	wholeDatabase: " (the whole Postgres database, including tables of other applications)",
	sizeUnknown: "The size of the EmDash database is unknown: its D1 binding was not found, or the Worker has several. Storage budget plus site content is not checked against the database's limit.",
	queueHint: "This site would benefit from the queue tier. Create a queue, add the producer binding to your wrangler config and deploy the consumer Worker (see Limits in the documentation).",
} as const;

/** Profile, database, storage, detailed window, write guard, ingest and the requests not recorded, with the notices they call for. */
function Capacity({ receipt }: { receipt: Receipt }) {
	const c = receipt.capacity;
	if (!c) return null;
	const { retention: r } = receipt;
	const st = r.storage;
	const today = c.dropsToday;
	const week = c.drops7;
	const reasons = [...new Set([...Object.keys(week), ...Object.keys(today)])].filter((k) => (week[k] ?? 0) + (today[k] ?? 0) > 0).sort();
	const direct = receipt.ingest?.tier !== "queue";
	return (
		<>
			<section className="ca-panel" aria-label="Capacity">
				<h3>
					Capacity
					<InfoMark text={PANEL_DEFINITIONS.capacity} />
				</h3>
				<dl className="ca-meta">
					<dt>Capacity profile</dt>
					<dd>
						{PROFILE_LABELS[c.profile] ?? c.profile}
						{`, storage budget ${size(c.budget.mb * 1e6)}`}
					</dd>
					<dt>Database</dt>
					<dd>
						{c.database ? `${c.health.engine === "postgres" ? "Postgres through Hyperdrive" : "Own D1 database"} (binding ${c.database})` : "The CMS database"}, {receipt.db.dialect}
						{c.size !== null ? `, ${size(c.size)} in total now${c.sizeWholeDatabase ? CAPACITY_TEXT.wholeDatabase : ""}` : ""}. Set with the plugin options in astro.config (read only here).
						{c.budget.contentCheck ? "" : ` ${CAPACITY_TEXT.sizeUnknown}`}
					</dd>
					<dt>Health</dt>
					<dd>{healthText(c.health)}</dd>
					<dt>Storage</dt>
					<dd>
						{st
							? `About ${size(st.bytes)} of ${size(st.budget)} (detailed visits ${size(st.detail)}, summaries ${size(st.summary)}), ${st.measured ? "from the database size" : "estimated"} once a day.`
							: "Estimated with the first retention run of the day."}
					</dd>
					<dt>Detailed data</dt>
					<dd>
						{r.rawDays} days{r.rawDays < c.rawRetentionDays ? ` of the ${c.rawRetentionDays} set` : ""}; older days are answered from daily summaries.
					</dd>
					<dt>Daily summaries</dt>
					<dd>Stored through {r.rollupWatermark ?? "no day yet"}; today and open days are computed when read.</dd>
					<dt>Write guard</dt>
					<dd>
						{c.profile !== "small"
							? "Off: only the Small profile has a daily write guard."
							: receipt.writes
								? `${receipt.writes.blocked ? "Recording paused until 00:00 UTC" : "Recording"}; about ${count(receipt.writes.rows)} of ${count(receipt.writes.limit)} rows written today (estimate).`
								: "On; no estimate for today yet."}
					</dd>
					<dt>Ingest</dt>
					<dd>
						{receipt.ingest?.tier === "queue" ? "Queue tier, written by the consumer Worker." : "Direct to the database."}
						{direct && receipt.ingest?.queueBound ? " A queue binding (CA_QUEUE) is available: choose the queue tier in the settings to use it." : ""}
					</dd>
				</dl>
				<h4>Not recorded</h4>
				{reasons.length ? (
					<div className="ca-table-scroll">
						<table aria-label="Not recorded" className="ca-grid">
							<thead>
								<tr>
									<th>Reason</th>
									<th className="ca-num">Today</th>
									<th className="ca-num">Last 7 days</th>
								</tr>
							</thead>
							<tbody>
								{reasons.map((k) => (
									<tr key={k}>
										<td>{DROP_LABELS[k as DropKind] ?? k}</td>
										<td className="ca-num">{count(today[k] ?? 0)}</td>
										<td className="ca-num">{count(week[k] ?? 0)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p>Nothing in the last 7 days.</p>
				)}
				<p className="ca-small">{receipt.drops.note}</p>
			</section>
		</>
	);
}

/** The Health line: status, the self-check's time and, on Postgres, the query cache probe. */
export function healthText(h: NonNullable<Receipt["capacity"]>["health"]): string {
	// "unreachable" never reaches the page: the route answers 503 with its own message instead.
	const head = h.status === "caching_on" ? "Query caching is on: nothing is recorded" : h.status === "slow" ? "Slow" : "Answering";
	const cache = h.engine !== "postgres" || h.status === "caching_on" ? "" : h.queryCache === false ? " Query caching is off." : " Query caching not checked yet.";
	return `${head}; the self-check took ${count(h.latencyMs)} ms.${cache}`;
}

interface Attention {
	tone: Tone;
	/** The one line. */
	title: string;
	/** The full text, behind the line's own toggle. */
	detail?: string;
	action?: ReactNode;
}
const SEVERITY: readonly Tone[] = ["error", "warning", "info", "success"];

/** What on the storage tab needs an admin's attention, most severe first. */
export function attention(receipt: Receipt): Attention[] {
	const { retention: r, capacity: c } = receipt;
	const st = r.storage;
	const out: Attention[] = [];
	if (st && st.bytes >= STORAGE_NOTICE * st.budget) out.push({ tone: "warning", title: `Storage is at ${Math.round((100 * st.bytes) / st.budget)} percent of the storage budget.` });
	if (r.rawCapped) out.push({ tone: "warning", title: `Detailed data is kept for ${r.rawDays} days only.`, detail: CAPACITY_TEXT.shortened(r.rawDays) });
	if (receipt.writes?.blocked) out.push({ tone: "info", title: "Recording is paused until the next UTC day.", detail: WRITES_NOTICE });
	if (c) {
		if (c.health.status === "caching_on")
			out.push({ tone: "error", title: CAPACITY_TEXT.cacheOn(c.database), detail: CAPACITY_TEXT.cacheOnDetail, action: <a href={wikiUrl("Postgres-Hyperdrive")} target="_blank" rel="noreferrer">Postgres setup guide</a> });
		if (c.health.status === "slow") out.push({ tone: "warning", title: CAPACITY_TEXT.slow(c.health.latencyMs), detail: CAPACITY_TEXT.slowDetail(c.health.engine) });
		if (c.size !== null && c.cap !== null && c.size >= FULL_WARNING * c.cap) {
			const critical = c.size >= FULL_CRITICAL * c.cap;
			const strong = c.profile === "small" ? BUDGET_TEXT.smallStrong : c.budget.target === "own" ? CAPACITY_TEXT.fullOwn : BUDGET_TEXT.hostStrong;
			out.push({ tone: critical ? "error" : "warning", title: CAPACITY_TEXT.full(c.size, c.cap), ...(critical ? { detail: strong } : {}) });
		}
		const budget = budgetText(c.budget.level, c.budget.target, c.profile);
		if (budget) out.push({ tone: c.budget.level === "strong" ? "error" : "warning", title: budget, action: <a href={`${SETTINGS_HREF}?tab=data`}>Open plugin settings</a> });
		const week = c.drops7;
		const overload = c.dropsToday.overload ?? 0;
		if (overload > 0) out.push({ tone: "warning", title: `${count(overload)} events were not stored today.`, detail: CAPACITY_TEXT.overload(overload) });
		if (((week.daily_limit ?? 0) > 0 || c.platformLimit?.kind === "requests") && c.profile !== "small")
			out.push({ tone: "info", title: "The Workers Free plan needs the Small profile.", detail: CAPACITY_TEXT.free, action: <a href={`${SETTINGS_HREF}?tab=data`}>Open plugin settings</a> });
		const behind = r.rollupWatermark && r.rollupWatermark < addDays(c.today, -2) ? r.rollupWatermark : null;
		if (behind) out.push({ tone: "info", title: "Daily summaries are catching up.", detail: CAPACITY_TEXT.catchingUp(behind) });
		if (receipt.ingest?.tier !== "queue" && (week.overload ?? 0) > 0) out.push({ tone: "info", title: "The queue tier would take the load.", detail: CAPACITY_TEXT.queueHint });
	}
	if (receipt.note) out.push({ tone: "info", title: receipt.note });
	return out.sort((a, b) => SEVERITY.indexOf(a.tone) - SEVERITY.indexOf(b.tone));
}

/** One panel, one line per item with its tone, the text behind the line. */
function NeedsAttention({ items }: { items: readonly Attention[] }) {
	if (!items.length) return null;
	return (
		<section className="ca-panel ca-attention" aria-label="Needs attention">
			<h3>
					Needs attention
					<InfoMark text={PANEL_DEFINITIONS.needs_attention} />
				</h3>
			<ul>
				{items.map((i) => (
					<li key={i.title} data-tone={i.tone} className={`ca-notice--${i.tone}`}>
						<svg className="ca-notice-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={TONE_LABEL[i.tone]}>
							{TONE_ICON[i.tone]}
						</svg>
						<div className="ca-stack">
							{i.detail ? (
								<Disclosure label={i.title}>
									<p>{i.detail}</p>
								</Disclosure>
							) : (
								<span>{i.title}</span>
							)}
							{i.action}
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

const date = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ");

function Storage({ receipt, reload }: { receipt: Receipt; reload: () => void }) {
	const [msg, setMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const { retention: r } = receipt;
	const run = async (route: string, done: (res: Record<string, unknown>) => string) => {
		setBusy(true);
		setMsg(null);
		try {
			setMsg(done(await call<Record<string, unknown>>(route)));
			reload();
		} catch (e) {
			setMsg(`Failed: ${errorText(e)}`);
		}
		setBusy(false);
	};
	return (
		<>
			<NeedsAttention items={attention(receipt)} />
			<Capacity receipt={receipt} />
			<section className="ca-panel" aria-label="Stored data">
				<h3>
					Stored data
					<InfoMark text={PANEL_DEFINITIONS.stored_data} />
				</h3>
				<p className="ca-small">Database self-check passed ({receipt.db.dialect}).</p>
				<div className="ca-table-scroll">
					<table aria-label="Storage">
						<thead>
							<tr>
								<th>Holds</th>
								<th className="ca-num">Rows</th>
								<th>Kept for</th>
							</tr>
						</thead>
						<tbody>
							{receipt.tables.map((t) => (
								<tr key={t.name}>
									<td>
										{t.description}
										<div className="ca-cell-note">
											<code>{t.name}</code>
										</div>
									</td>
									<td className="ca-num">{"rows" in t ? count(Number(t.rows)) : ""}</td>
									<td>{t.retention}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<div className="ca-actions">
					<Button size="sm" disabled={busy} onClick={() => void run("tools/purge", (res) => (res.done ? "Retention ran; old rows were deleted." : "Retention deleted a batch of old rows; run it again to continue."))}>
						Run retention now
					</Button>
					<Button size="sm" disabled={busy} onClick={() => void run("tools/rollup-now", () => "Closed days that were not stored yet are now stored as daily summaries.")}>
						Store daily summaries now
					</Button>
				</div>
				<p className="ca-small">Retention removes detailed visits older than {r.rawDays} days now instead of with the nightly run. Store daily summaries writes the closed days that have none yet.</p>
				{msg && <Notice tone={/^(Failed|Stopped)/.test(msg) ? "error" : "success"}>{msg}</Notice>}
			</section>
		</>
	);
}

/** Reports offered for export; the rows are the report's rows for the header range and filters. */
const EXPORTS: ReadonlyArray<readonly [ReportName, string]> = [
	["pages", "Pages"],
	["entry_pages", "Entry pages"],
	["exit_pages", "Exit pages"],
	["not_found", "Not found"],
	["channels", "Channels"],
	["sources", "Sources"],
	["campaigns", "Campaigns"],
	["countries", "Countries"],
	["devices", "Devices"],
	["browsers", "Browsers"],
	["os", "OS"],
	["languages", "Languages"],
	["events", "Events"],
	["goals", "Goals"],
	["timeseries", "Timeseries"],
];

function Export({ view }: { view: View }) {
	const [report, setReport] = useState<ReportName>("pages");
	const [error, setError] = useState<string | null>(null);
	const go = (format: "csv" | "json") => {
		setError(null);
		exportReport(view.site.id, { report, query: toQuery(view.state) }, format).catch((e: unknown) => setError(errorText(e)));
	};
	return (
		<section className="ca-panel" aria-label="Export">
			<h3>Download a report</h3>
			<p className="ca-small">
				Exports use the date range, segment and filters above, up to 10 000 rows. Range: {view.state.from} to {view.state.to}.
			</p>
			<div className="ca-row-end">
				<Field label="Report">
					<select value={report} onChange={(e) => setReport(e.target.value as ReportName)}>
						{EXPORTS.map(([id, l]) => (
							<option key={id} value={id}>
								{l}
							</option>
						))}
					</select>
				</Field>
				<Button size="sm" onClick={() => go("csv")}>
					Download CSV
				</Button>
				<Button size="sm" onClick={() => go("json")}>
					Download JSON
				</Button>
			</div>
			{error && <Notice tone="error">{error}</Notice>}
		</section>
	);
}

export function PrivacyReceipt({ receipt }: { receipt: Receipt }) {
	const [copied, setCopied] = useState<string | null>(null);
	const drops = Object.entries(receipt.drops.byReason);
	return (
		<section aria-label="Privacy receipt" className="ca-stack">
			<section className="ca-panel" aria-label="Statement">
				<h3>{receipt.statement}</h3>
				<p>{receipt.sharing}</p>
				{receipt.email && <p>{receipt.email}</p>}
			</section>
			<section className="ca-panel" aria-label="Salt">
				<h3>Salt</h3>
				<p>
					Current salt day {receipt.salt.day}, {Math.floor(receipt.salt.ageSeconds / 3600)} hours old, next rotation {date(receipt.salt.nextRotation)} UTC. Stored salts: {receipt.salt.stored.join(", ") || "none"}.
				</p>
			</section>
			<section className="ca-panel" aria-label="Requests not recorded">
				<h3>
					Requests not recorded (last {receipt.drops.days} days)
					<InfoMark text={PANEL_DEFINITIONS.requests_not_recorded} />
				</h3>
				<p className="ca-small">{receipt.drops.note}</p>
				{drops.length ? (
					<div className="ca-table-scroll">
						<table aria-label="Requests not recorded" className="ca-grid">
							<thead>
								<tr>
									<th>Reason</th>
									<th className="ca-num">Requests</th>
								</tr>
							</thead>
							<tbody>
								{drops.map(([k, n]) => (
									<tr key={k}>
										<td>{DROP_LABELS[k as DropKind] ?? k}</td>
										<td className="ca-num">{count(n)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p>None.</p>
				)}
			</section>
			<section className="ca-panel" aria-label="What is stored">
				<h3>
					What is stored
					<InfoMark text={PANEL_DEFINITIONS.what_is_stored} />
				</h3>
				<div className="ca-table-scroll">
					<table aria-label="What is stored">
						<thead>
							<tr>
								<th>Holds</th>
								<th className="ca-num">Rows</th>
								<th>Kept for</th>
							</tr>
						</thead>
						<tbody>
							{receipt.tables.map((t) => (
								<tr key={t.name}>
									<td>
										{t.description}
										<div className="ca-cell-note">
											<code>{t.name}</code> ({t.kind})
										</div>
										{t.columns && (
											<ul className="ca-cell-note">
												{Object.entries(t.columns).map(([c, d]) => (
													<li key={c}>
														<code>{c}</code>: {d}
													</li>
												))}
											</ul>
										)}
									</td>
									<td className="ca-num">{"rows" in t ? count(Number(t.rows)) : ""}</td>
									<td>{t.retention}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
			<section className="ca-panel" aria-label="For your privacy page">
				<h3>For your privacy page</h3>
				<pre aria-label="Markdown for your privacy page" className="ca-pre">
					{receipt.markdown}
				</pre>
				<Button size="sm"
					onClick={() =>
						// `navigator.clipboard` is missing on insecure origins.
						void (navigator.clipboard?.writeText(receipt.markdown) ?? Promise.reject(new Error("no clipboard"))).then(
							() => setCopied("Copied."),
							() => setCopied("Copying failed; select the text and copy it by hand."),
						)
					}
				>
					Copy Markdown
				</Button>
				{copied && <span role="status"> {copied}</span>}
			</section>
		</section>
	);
}

const CONFIRM = "DELETE";

function Delete({ reload, client }: { reload: () => void; client: string | null }) {
	const [typed, setTyped] = useState("");
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<string | null>(null);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		if (typed !== CONFIRM) return;
		setBusy(true);
		const total: Record<string, number> = {};
		try {
			// Each call deletes a bounded number of rows; repeat until the server reports done.
			for (let i = 0; i < 1000; i++) {
				const r = client
					? await call<{ deleted: Record<string, number>; done: boolean }>("tools/purge-site", { site: client, confirm: CONFIRM })
					: await call<{ deleted: Record<string, number>; done: boolean }>("tools/delete-all", { confirm: CONFIRM });
				for (const [k, n] of Object.entries(r.deleted)) total[k] = (total[k] ?? 0) + n;
				if (r.done) break;
			}
			setMsg(`Deleted: ${Object.entries(total).map(([k, n]) => `${k} ${count(n)}`).join(", ") || "nothing"}.`);
			setTyped("");
			reload();
		} catch (err) {
			setMsg(`Stopped: ${errorText(err)}`);
		}
		setBusy(false);
	};
	return (
		<form aria-label="Delete all data" className="ca-form" onSubmit={(e) => void submit(e)}>
			<h3>Delete all data</h3>
			<Notice tone="warning">
				This deletes every visit, hit, daily summary and search row of {client ? "the selected client site" : "this site"}. Goals, funnels, rules and annotations stay. It cannot be undone.
			</Notice>
			<Field label={`Type ${CONFIRM} to confirm`}>
				<input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
			</Field>
			<Button variant="secondary-destructive" size="sm" type="submit" disabled={busy || typed !== CONFIRM}>
				Delete all data
			</Button>
			{msg && <Notice tone={/^(Failed|Stopped)/.test(msg) ? "error" : "success"}>{msg}</Notice>}
		</form>
	);
}

/**
 * Void revenue: null the value and currency of one day's events of one name at or above a
 * minimum value, for spoofed orders without an id. A count preview first, then a confirmation.
 */
export function VoidRevenue({ client }: { client: string | null }) {
	const [day, setDay] = useState("");
	const [name, setName] = useState("purchase");
	const [min, setMin] = useState("");
	const [preview, setPreview] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<string | null>(null);
	const body = () => ({ ...(client ? { site: client } : {}), day, name: name.trim(), minValue: Number(min) });
	const ready = /^\d{4}-\d{2}-\d{2}$/.test(day) && name.trim() !== "" && min.trim() !== "" && Number.isFinite(Number(min)) && Number(min) >= 0;
	const run = async (confirm: boolean) => {
		setBusy(true);
		setMsg(null);
		try {
			const r = await call<{ matched: number; voided: number }>("tools/revenue-void", confirm ? { ...body(), confirm: true } : body());
			if (confirm) {
				setMsg(`${r.voided} order${r.voided === 1 ? "" : "s"} voided. The daily revenue summary of ${day} is corrected within half an hour.`);
				setPreview(null);
			} else setPreview(r.matched);
		} catch (err) {
			setMsg(errorText(err));
		}
		setBusy(false);
	};
	const reset = () => setPreview(null);
	return (
		<form aria-label="Void revenue" onSubmit={(e) => (e.preventDefault(), void run(false))} className="ca-form">
			<h3>Void revenue</h3>
			<p className="ca-small">For orders sent without an order id, for example a value posted from the browser console. Orders with an id are corrected or voided by your server through the agent API. Raw days only.</p>
			<Field label="Day">
				<input type="date" value={day} onChange={(e) => (setDay(e.target.value), reset())} />
			</Field>
			<Field label="Event name">
				<input value={name} maxLength={64} onChange={(e) => (setName(e.target.value), reset())} />
			</Field>
			<Field label="Minimum value">
				<input inputMode="decimal" value={min} onChange={(e) => (setMin(e.target.value), reset())} placeholder="10000" />
			</Field>
			<Button variant="primary" size="sm" type="submit" disabled={busy || !ready}>
				Count matching orders
			</Button>
			{preview !== null && (
				<div role="status" className="ca-actions">
					{preview} order{preview === 1 ? "" : "s"} match.{" "}
					{preview > 0 && (
						<Button variant="secondary-destructive" size="sm" disabled={busy} onClick={() => void run(true)}>
							Void {preview} order{preview === 1 ? "" : "s"}
						</Button>
					)}
				</div>
			)}
			{msg && <Notice tone="info">{msg}</Notice>}
		</form>
	);
}

function RevenueVoidIfAny({ view, client }: { view: View; client: string | null }) {
	const rev = useRevenue(view);
	return rev.data?.data.hasRevenue === true ? <VoidRevenue client={client} /> : null;
}

const TABS = [
	["storage", "Storage and retention"],
	["export", "Export"],
	["privacy", "Privacy receipt"],
	["delete", "Delete"],
	["move", "Move data"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Exports read the header's range, segment and filters: the full header while this tab shows. */
function ExportTab({ view }: { view: View }) {
	useShellHead({ controls: "full" });
	return <Export view={view} />;
}

function Body({ view }: { view: View }) {
	const tab: Tab = activeTab(TABS, view.state.tab);
	const [receipt, setReceipt] = useState<Receipt | null>(null);
	const [error, setError] = useState<string | null>(null);
	const remote = isRemote(view.site);
	const client = siteKind(view.site) === "client" ? view.site.id : null;
	const reload = useCallback(() => {
		call<Receipt>("privacy/receipt", withApiSite({})).then(
			(r) => {
				setReceipt(r);
				setError(null);
			},
			(e: unknown) => setError(errorText(e)),
		);
	}, []);
	useEffect(() => {
		if (!remote) reload();
	}, [remote, reload]);
	if (remote) return <RemoteNotice site={view.site} path="/data" />;
	const tabs = TABS;
	const needsReceipt = tab === "storage" || tab === "privacy";
	return (
		<>
			{error && <Notice tone="error">{error}</Notice>}
			<Tabs tabs={tabs} value={tab} onChange={(id) => view.update({ tab: tabParam(TABS, id) })} />
			<div role="tabpanel" aria-label={tabs.find((t) => t[0] === tab)?.[1]}>
				{needsReceipt && !receipt && (error ? <Empty>Storage details are not available.</Empty> : <Loading />)}
				{tab === "storage" && receipt && <Storage receipt={receipt} reload={reload} />}
				{tab === "export" && <ExportTab view={view} />}
				{tab === "move" && <MoveData view={view} />}
				{tab === "privacy" && receipt && <PrivacyReceipt receipt={receipt} />}
				{tab === "delete" && (
					<>
						<FilteredDelete view={view} />
						<Delete reload={reload} client={client} />
						<RevenueVoidIfAny view={view} client={client} />
					</>
				)}
			</div>
		</>
	);
}

export default function Data() {
	return <Shell title="Data" controls="site" docs={({ tab }) => (tab === "move" ? "Move-Data" : "Data-Page")}>{(v) => <Body view={v} />}</Shell>;
}
