/**
 * Search (`/search`): the setup state until a source is connected (Google with OAuth
 * and the property picker or a pasted service account; the Bing key and site), then the data: problems of
 * a source on top, one muted sync line, the source switch (only with two mapped sources) and the tabs Overview,
 * Queries, Pages, Countries, Devices, Positions, Cannibalization and Changes. Sync, loading older
 * days, the sign-in forms and the Bing file import sit in Connections at the bottom.
 * A client site shows its own mapping picker instead of the connection fields (they are master-level).
 * The page is also the OAuth return target: `code` and `state` are posted once and stripped from the URL.
 */
import { Badge, Button, Input, InputArea } from "@cloudflare/kumo";
import { useDialog } from "../components/useDialog.js";
import { BingImport } from "../components/BingImport.js";
import { count } from "../components/format.js";
import { BingSignIn } from "../components/BingSignIn.js";
import { ExternalLink, SETUP_LINKS, SetupSteps } from "../components/SetupSteps.js";
import { annotationAction } from "../components/AnnotationPopover.js";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { PLUGIN_ID } from "../../contract.js";
import { addDays, daysBetween } from "../../core/time.js";
import type { searchService } from "../../routes/search.js";
import { BACKFILL_DEFAULT_DAYS, BACKFILL_OPTIONS, type BackfillEstimate, backfillEstimate, backfillRange, PLANNING_ROWS_PER_DAY, PROVIDER_LIMIT_TEXT } from "../../sources/budget.js";
import { call, errorText, type SearchSummary, useReport, useSearchStatus, withApiSite } from "../api.js";
import type { Column } from "../components/DataTable.js";
import { siteKind, Shell, toQuery, useShellHead, type View } from "../components/Header.js";
import { type MetricDef, MetricChart } from "../components/MetricChart.js";
import { PANEL_DEFINITIONS } from "../../charts/definitions.js";
import { Disclosure, Empty, Field, InfoMark, Loading, Notice, Segmented, Tabs, type Tone } from "../components/ui.js";
import { cleanUrl } from "../state.js";
import { ErrorScope, ReportNotices } from "../components/ReportNotices.js";
import { activeTab, allNotices, ReportPanel, tabParam } from "./report.js";
import { CannibalizationTab, PositionsTab, SearchChangesTab } from "./SearchSeo.js";

export type SearchStatus = Awaited<ReturnType<ReturnType<typeof searchService>["status"]>>;
type SourceStatus = SearchStatus["sources"][number];
type SourceId = SourceStatus["id"];
type SourceSwitch = "all" | SourceId;

const NAMES: Record<SourceId, string> = { google: "Google", bing: "Bing" };
const TITLES: Record<SourceId, string> = { google: "Google Search Console", bing: "Bing Webmaster Tools" };
const BLURB: Record<SourceId, string> = { google: "Clicks, impressions and positions from Google Search.", bing: "Clicks, impressions and positions from Bing." };

// ── OAuth return ─────────────────────────────────────────────────────────────

export type OAuthReturn = { code: string; state: string } | { error: string } | null;

/** `code` and `state` (or Google's `error`) of the page URL after the consent screen. */
export function readOAuthReturn(search: string): OAuthReturn {
	const q = new URLSearchParams(search);
	const code = q.get("code");
	const state = q.get("state");
	if (q.get("error")) return { error: q.get("error") as string };
	return code && state ? { code, state } : null;
}

/** States already posted in this page load, so a re-render or a remount never posts twice. */
const posted = new Set<string>();

function useOAuthReturn(): { message: string | null; tone: "info" | "error"; done: number } {
	const [ret] = useState(() => {
		const r = readOAuthReturn(window.location.search);
		// Strip at once, before anything can copy the URL.
		if (r) cleanUrl(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
		return r;
	});
	const [out, setOut] = useState<{ message: string | null; tone: "info" | "error"; done: number }>(() =>
		// The return does not say which provider sent it (Google or Bing); the exchange answers its source.
		ret && "error" in ret ? { message: "Access was not granted. Try Connect again.", tone: "error", done: 0 } : { message: ret ? "Connecting" : null, tone: "info", done: 0 },
	);
	useEffect(() => {
		if (!ret || "error" in ret || posted.has(ret.state)) return;
		posted.add(ret.state);
		call<{ source?: string }>("search/oauth/exchange", { code: ret.code, state: ret.state }).then(
			(r) => setOut({ message: `${r.source === "bing" ? "Bing" : "Google"} is connected. Pick the property below.`, tone: "info", done: 1 }),
			(e: unknown) => setOut({ message: errorText(e), tone: "error", done: 1 }),
		);
	}, []);
	return out;
}

export default function Search() {
	const oauth = useOAuthReturn();
	return (
		<Shell title="Search" docs="Search-Integrations" filterScope="search">
			{(v) => (
				<>
					{oauth.message && <Notice tone={oauth.tone === "error" ? "error" : oauth.done ? "success" : "info"}>{oauth.message}</Notice>}
					<SearchBody view={v} reloadKey={oauth.done} />
				</>
			)}
		</Shell>
	);
}

// ── Page body ────────────────────────────────────────────────────────────────

/** Open every closed disclosure from the one inside `id` up to the page, then bring `id` into view. */
function reveal(id: string): void {
	const el = document.getElementById(id);
	for (let n: Element | null = el?.firstElementChild ?? null; n; n = n.parentElement) {
		const t = n.classList.contains("ca-disclosure") ? n.querySelector(":scope > .ca-disclosure-toggle") : null;
		if (t instanceof HTMLElement && t.getAttribute("aria-expanded") === "false") t.click();
	}
	el?.scrollIntoView?.({ block: "start" });
}

/** The sources with a property for this site (Source switch, sync line, reports); the order of `search/status`. */
const mappedSources = (st: SearchStatus) => st.sources.filter((s) => s.configured && s.property);

export function SearchBody({ view, reloadKey = 0 }: { view: View; reloadKey?: number }) {
	const kind = siteKind(view.site);
	const { status: fresh, error, reload } = useSearchStatus(view.site);
	const ids = useId();
	// A reload (after a sync, a save or a mapping) keeps the page as it is until the new status arrives: open sections and forms stay.
	const kept = useRef<{ site: string; summary: SearchSummary } | null>(null);
	if (fresh) kept.current = { site: view.site.id, summary: fresh };
	const summary = fresh ?? (kept.current?.site === view.site.id ? kept.current.summary : null);
	// Nothing connected: the page is the setup, and range and filters change nothing (matrix E).
	useShellHead({ controls: summary && !summary.raw.sources.some((s) => s.configured) ? "site" : undefined });
	// After the OAuth exchange the stored state changed: read it past the cache.
	useEffect(() => {
		if (reloadKey) reload();
	}, [reloadKey]);
	if (kind === "remote") return <ReportTabs view={view} live={null} />;
	if (error) return <Notice tone="error">{error}</Notice>;
	if (!summary) return <Loading />;
	const st = summary.raw;
	const client = kind === "client";
	const connected = st.sources.filter((s) => s.configured);
	if (!connected.length)
		return client ? (
			<Notice tone="info">No Search source is connected. Connect Google or Bing on the Search page of the main site first.</Notice>
		) : (
			<section aria-label="Search setup" className="ca-section">
				<h2>Connect a Search source</h2>
				<p className="ca-sub">Search data shows clicks, impressions and positions from Google Search Console and Bing Webmaster Tools next to your traffic. Connect one or both.</p>
				<Connections status={st} onChange={reload} importId={`${ids}-import`} />
			</section>
		);
	const live = mappedSources(st);
	const connId = `${ids}-conn`;
	const importId = `${ids}-import`;
	return (
		<>
			{/* A source without a property for this site: its picker on top. A client site also changes a mapped property here. */}
			{connected
				.filter((s) => client || !s.property)
				.map((s) =>
					s.property ? (
						<MappingPicker key={s.id} source={s} onChange={reload} />
					) : (
						<Notice key={s.id} tone="info" label={`${NAMES[s.id]} property not picked`}>
							<MappingPicker source={s} onChange={reload} />
						</Notice>
					),
				)}
			{live.map((s) => (
				<SourceProblem key={s.id} source={s} onOpen={() => reveal(connId)} onImport={() => reveal(importId)} />
			))}
			{live.length === 0 ? (
				<Notice tone="info">No property mapped for this site.</Notice>
			) : live.some((s) => s.rows > 0) ? (
				<ReportTabs view={view} live={live} aside={<SyncLine status={st} live={live} />} />
			) : (
				<FirstSync status={st} live={live} onChange={reload} />
			)}
			{(!client || live.length > 0) && (
				<div id={connId}>
					{/* Opens by itself on a failed sync: the failing card shows its form. A throttle waits, so it stays closed. */}
					<Disclosure label="Connections" open={live.some((s) => connectionState(s) === "error")} className="ca-section">
						<Connections status={st} client={client} onChange={reload} importId={importId} />
					</Disclosure>
				</div>
			)}
		</>
	);
}

// ── Connection state and provider errors ────────────────────────────────────

export type ConnectionState = "connected" | "not_connected" | "error" | "throttled";
export const STATE_LABELS: Record<ConnectionState, string> = { connected: "Connected", not_connected: "Not connected", error: "Error", throttled: "Throttled" };
const STATE_BADGE = { connected: "success", not_connected: "neutral", error: "error", throttled: "warning" } as const;

/** State of a source from `search/status`; Bing's `ThrottleIP` and `ThrottleUser` (status `throttled`, or a 429 of an older sync) read as Throttled. */
export function connectionState(s: Pick<SourceStatus, "configured" | "status" | "lastError">): ConnectionState {
	if (!s.configured) return "not_connected";
	if (s.status === "throttled") return "throttled";
	if (s.status !== "error") return "connected";
	return /Throttle|answered 429/.test(s.lastError ?? "") ? "throttled" : "error";
}

/** The provider's code from a sync error ("Google answered 400 (invalid_grant).") or its HTTP status; null when the text has neither. */
export function providerCode(message: string | null | undefined): string | null {
	if (!message) return null;
	const code = /\(([A-Za-z_]{2,40})\)\.?\s*$/.exec(message)?.[1];
	if (code) return code;
	const http = /answered (\d{3})/.exec(message)?.[1];
	return http ? `HTTP ${http}` : null;
}

/** One plain sentence on what a sync error means and what to do. */
export function explainError(source: SourceId, message: string | null | undefined): string {
	const m = message ?? "";
	if (/Throttle|answered 429/.test(m))
		return source === "bing"
			? "Bing limits shared server addresses. The sync retries on the next scheduled run."
			: "The provider limits how often this server may call it. The sync tries again on the next scheduled run; nothing to do.";
	if (/invalid_grant/.test(m)) return "Google no longer accepts the saved sign-in: it expired or access was removed. Connect Google again.";
	if (/InvalidApiKey|answered 401|UNAUTHENTICATED/.test(m)) return source === "bing" ? "Bing rejected the API key. Create a new key in Bing Webmaster Tools and save it in Connections." : "Google rejected the credentials. Connect Google again.";
	if (/answered 403|PERMISSION_DENIED|NotAuthorized/.test(m)) return "The account has no access to this property. Add it as a user of the property, or pick another property.";
	if (/answered 5\d\d/.test(m)) return "The provider had a temporary problem. The sync tries again on the next scheduled run.";
	return "The last sync failed. The sync tries again on the next scheduled run; if this stays, check Connections.";
}

/** The provider code of a source in Error or Throttled, else null. */
const codeOf = (s: SourceStatus) => (s.status === "throttled" ? s.throttleCode : s.configured && s.status === "error" ? providerCode(s.lastError) : null);

function StateBadge({ state }: { state: ConnectionState }) {
	return (
		<Badge variant={STATE_BADGE[state]} appearance="dot">
			{STATE_LABELS[state]}
		</Badge>
	);
}

/** The one notice of a source in Error or Throttled, above the data: plain explanation, provider code, raw message and the way to act. */
function SourceProblem({ source, onOpen, onImport }: { source: SourceStatus; onOpen: () => void; onImport: () => void }) {
	const state = connectionState(source);
	if (state !== "error" && state !== "throttled") return null;
	// A throttle is not an error: the last good sync and its rows stay, the code and the next attempt are shown instead of an error text.
	const paused = source.status === "throttled";
	const code = codeOf(source);
	const tone: Tone = state === "throttled" ? "warning" : "error";
	return (
		<Notice
			tone={tone}
			label={state === "throttled" ? `${NAMES[source.id]} throttled` : `${NAMES[source.id]} sync failed`}
			action={
				<>
					{source.id === "bing" && state === "throttled" && (
						<Button size="sm" onClick={onImport}>
							Import a file instead
						</Button>
					)}
					<Button size="sm" variant="ghost" onClick={onOpen}>
						Open connections
					</Button>
				</>
			}
		>
			{paused ? (source.message ?? explainError(source.id, "Throttle")) : explainError(source.id, source.lastError)}
			{paused && source.nextAttempt && ` Next attempt: ${when(source.nextAttempt)} UTC.`}
			{code && (
				<>
					{" "}
					Provider code: <code>{code}</code>.
				</>
			)}{" "}
			{!paused && (
				<span className="ca-small">
					{source.lastError}
					{source.lastErrorAt ? ` (${when(source.lastErrorAt)})` : ""}
				</span>
			)}
		</Notice>
	);
}

// ── Above the data: sync line and the first sync ────────────────────────────

/** One muted line: when the data was synced (per source when they differ or one failed), which days can still change, and older days loading. */
export function SyncLine({ status, live }: { status: SearchStatus; live: readonly SourceStatus[] }) {
	const same = new Set(live.map((s) => s.lastRun)).size === 1 && !live.some((s) => connectionState(s) === "error");
	const synced = same ? `Synced ${when(live[0]?.lastRun ?? null)}.` : live.map((s) => `${NAMES[s.id]}: last synced ${when(s.lastRun)}.`).join(" ");
	const loading = live.filter((s) => s.backfill && !s.backfill.done);
	return (
		<p className="ca-small ca-search-sync">
			{synced}
			{live.some((s) => s.syncing) && " Syncing now."} Provisional from {status.provisional.from}.
			<InfoMark caveat="searchLag" />
			{loading.map((s) => (
				<span key={s.id}>
					{" "}
					{loading.length > 1 ? `${NAMES[s.id]}: ` : ""}
					{s.backfill && pacedText(s.backfill, undefined)}
				</span>
			))}
		</p>
	);
}

/** Sync now and Load older days (with its dialog) for the mapped sources of this site. */
function SyncActions({ status, live, onChange, primary = false, children }: { status: SearchStatus; live: readonly SourceStatus[]; onChange: () => void; primary?: boolean; children?: ReactNode }) {
	const [dialog, setDialog] = useState(false);
	const [msg, setMsg] = useState<string | null>(null);
	const sync = () => call("search/sync", withApiSite({})).then(onChange, (e: unknown) => setMsg(errorText(e)));
	return (
		<>
			{msg && <Notice tone="error">{msg}</Notice>}
			<div className="ca-actions">
				<Button size="sm" variant={primary ? "primary" : "secondary"} onClick={() => void sync()}>
					Sync now
				</Button>
				<Button size="sm" variant="secondary" onClick={() => setDialog(true)}>
					Load older days
				</Button>
				{children}
			</div>
			{dialog && (
				<BackfillDialog
					sources={live}
					budget={status.budget}
					yesterday={status.provisional.to}
					onClose={() => setDialog(false)}
					onStarted={() => {
						setDialog(false);
						onChange();
					}}
				/>
			)}
		</>
	);
}

/** Connected, no row stored yet: one explanation and the next step instead of cards of zeros and a flat chart. */
function FirstSync({ status, live, onChange }: { status: SearchStatus; live: readonly SourceStatus[]; onChange: () => void }) {
	const days = status.budget?.defaultDays ?? BACKFILL_DEFAULT_DAYS;
	const first = live[0];
	const est = first ? optionEstimate({ days }, first, status.provisional.to, status.budget) : null;
	const title = live.some((s) => s.syncing) ? "Connected. The first sync is running." : live.some((s) => s.lastRun) ? "Connected. The last sync stored no rows yet." : "Connected. Not synced yet.";
	return (
		<section className="ca-panel ca-stack ca-search-first" aria-label="Search data">
			<h3>{title}</h3>
			<p className="ca-help">Search data arrives two to three days late. The figures and reports appear here once the first rows are stored.</p>
			<SyncActions status={status} live={live} onChange={onChange} primary>
				{est && (
					<span className="ca-help">
						Last {count(days)} days: {estimateText(est, status.budget?.profile === "small")}
					</span>
				)}
			</SyncActions>
		</section>
	);
}

// ── Connections ─────────────────────────────────────────────────────────────

export const redirectUriOf = (origin: string) => `${origin}/_emdash/admin/plugins/${PLUGIN_ID}/search`;

function CopyBlock({ text, label }: { text: string; label: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="ca-copy">
			<code>{text}</code>
			<Button
				size="sm"
				aria-label={`Copy ${label}`}
				onClick={() =>
					void navigator.clipboard?.writeText(text).then(
						() => setCopied(true),
						() => setCopied(false),
					)
				}
			>
				{copied ? "Copied" : "Copy"}
			</Button>
		</div>
	);
}

function SourceMeta({ source }: { source: SourceStatus }) {
	return (
		<dl className="ca-meta">
			<dt>Property</dt>
			<dd>{source.property || "Not mapped yet"}</dd>
			<dt>Last sync</dt>
			<dd>
				{when(source.lastRun)}
				{source.syncing ? ", syncing now" : ""}
			</dd>
			{source.firstDay && source.lastDay && (
				<>
					<dt>Stored days</dt>
					<dd>
						{source.firstDay} to {source.lastDay}
					</dd>
				</>
			)}
		</dl>
	);
}

type Run = (f: () => Promise<unknown>, done: string, tone?: "info") => Promise<void>;

function GoogleSignIn({ run }: { run: Run }) {
	const [mode, setMode] = useState<"oauth" | "service_account">("oauth");
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [sa, setSa] = useState("");
	const connectOAuth = () =>
		run(
			async () => {
				await call("search/connect", { gscAuth: "oauth", ...(clientId ? { gscClientId: clientId } : {}), ...(clientSecret ? { gscClientSecret: clientSecret } : {}) });
				const { url } = await call<{ url: string }>("search/oauth/start", {});
				window.location.assign(url);
			},
			"Opening Google",
			"info",
		);
	return (
		<>
			<Segmented label="Google sign-in" value={mode} options={[["oauth", "OAuth client"], ["service_account", "Service account"]]} onChange={setMode} radio />
			{mode === "oauth" ? (
				<div className="ca-form">
					<div className="ca-stack">
						<SetupSteps
							label="Google OAuth setup"
							steps={[
								<>
									<ExternalLink href={SETUP_LINKS.googleProject}>Create a Google Cloud project</ExternalLink> or pick an existing one.
								</>,
								<>
									<ExternalLink href={SETUP_LINKS.googleApi}>Enable the Google Search Console API</ExternalLink> in that project.
								</>,
								<>
									On the <ExternalLink href={SETUP_LINKS.googleAudience}>Audience page</ExternalLink>, set the app up with user type External, then choose Publish app so the publishing status is In production. In Testing, Google ends the connection after 7 days.
								</>,
								<>
									On the <ExternalLink href={SETUP_LINKS.googleClients}>Clients page</ExternalLink>, create a client of type Web application and add this authorized redirect URI:
								</>,
							]}
						/>
						<CopyBlock text={redirectUriOf(window.location.origin)} label="redirect URI" />
						<p className="ca-help">Paste the client ID and secret below. Google then shows "Google hasn't verified this app": choose Advanced, then continue. That is expected for your own client.</p>
					</div>
					<Input label="Client ID" description="Shown on the OAuth client page in Google Cloud." value={clientId} autoComplete="off" onChange={(e) => setClientId(e.target.value)} />
					<Input label="Client secret" type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
					<div className="ca-actions">
						<Button variant="primary" size="sm" onClick={() => void connectOAuth()}>
							Connect Google
						</Button>
						<span className="ca-help">Opens Google to grant read access to Search Console.</span>
					</div>
				</div>
			) : (
				<div className="ca-form">
					<SetupSteps
						label="Google service account setup"
						steps={[
							<>
								<ExternalLink href={SETUP_LINKS.googleApi}>Enable the Google Search Console API</ExternalLink> in your Google Cloud project.
							</>,
							<>
								<ExternalLink href={SETUP_LINKS.googleServiceAccounts}>Create a service account</ExternalLink>, then open it, Keys, Add key, JSON.
							</>,
							<>
								In <ExternalLink href={SETUP_LINKS.searchConsoleUsers}>Search Console users and permissions</ExternalLink>, add the service account email to the property. Restricted is enough.
							</>,
						]}
					/>
					<InputArea label="Service account JSON key" description="Paste the whole key file." rows={5} value={sa} onChange={(e) => setSa(e.target.value)} />
					<div className="ca-actions">
						<Button variant="primary" size="sm" disabled={!sa.trim()} onClick={() => void run(() => call("search/connect", { gscAuth: "service_account", gscServiceAccount: sa }).then(() => setSa("")), "Service account saved.")}>
							Save service account
						</Button>
					</div>
				</div>
			)}
		</>
	);
}

/**
 * One source in Connections. Not connected: a Connect button (a quiet row once the other source is connected) that
 * opens the form. Connected: facts and actions; the form only after Change sign-in or while the source is in Error.
 * A client site sees facts only (sign-in is master-level).
 */
function SourceCard({ source, status, client, quiet, run, act, importId, onChange }: { source: SourceStatus; status: SearchStatus; client: boolean; quiet: boolean; run: Run; act: (route: string, body: Record<string, unknown>) => void; importId: string; onChange: () => void }) {
	const state = connectionState(source);
	const [edit, setEdit] = useState(false);
	const ids = useId();
	const title = TITLES[source.id];
	const code = codeOf(source);
	if (!source.configured && quiet && !edit)
		return (
			<div className="ca-conn-row" data-source={source.id} data-state={state}>
				<span>
					<strong>{title}</strong>: not connected.
				</span>
				<Button size="sm" variant="secondary" aria-label={`Connect ${title}`} onClick={() => setEdit(true)}>
					Connect
				</Button>
			</div>
		);
	const form = !client && (edit || state === "error");
	const b = source.backfill;
	return (
		<section className="ca-panel" role="group" aria-labelledby={`${ids}-h`} data-source={source.id} data-state={state}>
			<div className="ca-conn-head">
				<h3 id={`${ids}-h`}>
					{title}
					<InfoMark text={PANEL_DEFINITIONS.search_connection} />
				</h3>
				<span className="ca-row">
					{code && <code className="ca-small">{code}</code>}
					<StateBadge state={state} />
				</span>
			</div>
			{source.configured ? <SourceMeta source={source} /> : !edit && <p className="ca-help">{BLURB[source.id]}</p>}
			{b && (
				<p className="ca-small ca-row">
					{b.done ? "Older days loaded." : pacedText(b, status.budget)}
					{b.error ? ` (${b.error})` : ""}
					{!b.done && (
						<Button size="xs" variant="ghost" onClick={() => act("search/backfill", { action: "cancel", source: source.id })}>
							Stop loading older days
						</Button>
					)}
				</p>
			)}
			{!client && state !== "error" && (
				<div className="ca-actions">
					<Button size="sm" variant={source.configured || edit ? "secondary" : "primary"} aria-expanded={edit} aria-label={source.configured || edit ? undefined : `Connect ${title}`} onClick={() => setEdit(!edit)}>
						{source.configured ? (edit ? "Hide sign-in" : "Change sign-in") : edit ? "Cancel" : "Connect"}
					</Button>
				</div>
			)}
			{form &&
				(source.id === "google" ? (
					<GoogleSignIn run={run} />
				) : (
					<BingSignIn configured={source.configured} auth={source.auth === "oauth" ? "oauth" : "apikey"} run={run} redirect={<CopyBlock text={redirectUriOf(window.location.origin)} label="Bing redirect URI" />} />
				))}
			{source.id === "bing" && source.configured && (
				<div id={importId}>
					<Disclosure label="Import Bing data from a file" open={state === "throttled"}>
						<BingImport yesterday={status.provisional.to} onDone={onChange} />
					</Disclosure>
				</div>
			)}
		</section>
	);
}

function Connections({ status, client = false, importId, onChange }: { status: SearchStatus; client?: boolean; importId: string; onChange: () => void }) {
	const [msg, setMsg] = useState<{ text: string; tone: Tone } | null>(null);
	const run: Run = async (f, done, tone) => {
		setMsg(null);
		try {
			await f();
			setMsg({ text: done, tone: tone ?? "success" });
			onChange();
		} catch (e) {
			setMsg({ text: errorText(e), tone: "error" });
		}
	};
	const act = (route: string, body: Record<string, unknown>) => void call(route, withApiSite(body)).then(onChange, (e: unknown) => setMsg({ text: errorText(e), tone: "error" }));
	const live = mappedSources(status);
	const setup = !status.sources.some((s) => s.configured);
	// Connected sources as cards first; a source that is not connected follows as one quiet row (setup: two cards).
	const sorted = [...status.sources].filter((s) => !client || s.configured).sort((a, b) => Number(b.configured) - Number(a.configured));
	const card = (s: SourceStatus) => <SourceCard key={`${s.id}-${s.configured}`} source={s} status={status} client={client} quiet={!setup} run={run} act={act} importId={importId} onChange={onChange} />;
	return (
		<div className="ca-stack">
			{msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
			{live.length > 0 && <SyncActions status={status} live={live} onChange={onChange} />}
			<div className="ca-connections">{sorted.filter((s) => setup || s.configured).map(card)}</div>
			{sorted.filter((s) => !setup && !s.configured).map(card)}
			{!client && <p className="ca-help">Keys are stored encrypted, which needs EMDASH_ENCRYPTION_KEY on the server.</p>}
		</div>
	);
}

// ── Property mapping (local and client sites) ───────────────────────────────

interface Properties {
	current: string;
	suggested: string | null;
	items: Array<{ siteUrl: string; permissionLevel: string }>;
}

export function MappingPicker({ source, onChange }: { source: SourceStatus; onChange: () => void }) {
	const [list, setList] = useState<Properties | null>(null);
	const [pick, setPick] = useState("");
	const [msg, setMsg] = useState<{ text: string; tone: "info" | "error" } | null>(null);
	const name = NAMES[source.id];
	const load = () => {
		setMsg(null);
		call<Properties>("search/properties", withApiSite({ source: source.id })).then(
			(r) => {
				setList(r);
				setPick(r.current || r.suggested || "");
			},
			(e: unknown) => setMsg({ text: errorText(e), tone: "error" }),
		);
	};
	// The picker opens by itself while nothing is mapped.
	useEffect(() => {
		if (!source.property) load();
	}, [source.id]);
	const save = () =>
		call("search/map", withApiSite({ source: source.id, property: pick })).then(
			() => {
				setList(null);
				onChange();
			},
			(e: unknown) => setMsg({ text: errorText(e), tone: "error" }),
		);
	return (
		<div className="ca-mapping ca-stack" data-source={source.id}>
			<div className="ca-row">
				<span>
					{name} property: <strong>{source.property || "none"}</strong>
				</span>
				{!list && (
					<Button size="sm" onClick={load}>
						Change {name} property
					</Button>
				)}
			</div>
			{msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
			{list && (
				<div className="ca-row-end">
					<Field label={`${name} property`} help="Suggested: the property that matches this site.">
						<select value={pick} onChange={(e) => setPick(e.target.value)}>
							<option value="">None</option>
							{list.items.map((i) => (
								<option key={i.siteUrl} value={i.siteUrl}>
									{i.siteUrl}
									{i.siteUrl === list.suggested ? " (suggested)" : ""}
								</option>
							))}
						</select>
					</Field>
					<Button variant="primary" size="sm" onClick={() => void save()}>
						Save {name} property
					</Button>
				</div>
			)}
		</div>
	);
}

// ── Loading older days (routes and settings keep the name `backfill`) ───────

const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "not yet");

type Budget = SearchStatus["budget"] | undefined;
type Progress = NonNullable<SourceStatus["backfill"]>;

/** "Loading older days: N of M done. Continues <when>." plus today's rows against the daily budget when known. */
export function pacedText(b: Pick<Progress, "completed" | "days"> & { nextAt?: number | null }, budget: Budget): string {
	const next = b.nextAt ? `at ${new Date(b.nextAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : "with the next sync";
	const rows = budget ? ` Rows written today: ${count(budget.usedToday)} of ${count(budget.daily)}.` : "";
	return `Loading older days: ${count(b.completed)} of ${count(b.days)} done. Continues ${next}.${rows}`;
}

/** Why a custom start cannot be used, or null (the server checks the same rules and clamps to the provider's limit). */
export function backfillError(from: string, yesterday: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return "Pick a start date.";
	if (from > yesterday) return "Older days end yesterday, so the start is yesterday at the latest.";
	return null;
}

/**
 * The estimate of a range option for one source: its start (clamped to the provider's limit and the retention), the
 * missing days from there (before the oldest stored day, and the holes search/status reports) and the rows they write.
 */
export function optionEstimate(o: { days?: number; from?: string }, s: Pick<SourceStatus, "id" | "firstDay"> & { perDay?: number; holes?: ReadonlyArray<readonly [string, string]> }, yesterday: string, budget: Budget): BackfillEstimate & { from: string; clamped: boolean } {
	const r = backfillRange(o, s.id, yesterday, budget?.retentionDays ?? 800);
	const to = s.firstDay && s.firstDay <= yesterday ? addDays(s.firstDay, -1) : yesterday;
	const days = (r.from > to ? 0 : daysBetween(r.from, to)) + (s.holes ?? []).reduce((n, [a, b]) => n + (r.from > b ? 0 : daysBetween(r.from > a ? r.from : a, b)), 0);
	return { ...backfillEstimate(days, s.perDay ?? PLANNING_ROWS_PER_DAY, budget?.profile ?? "standard"), from: r.from, clamped: r.clamped };
}

const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;
export const estimateText = (e: BackfillEstimate, small: boolean) =>
	!e.days ? "Already stored, nothing to write." : `${plural(e.days, "day", "days")}, about ${count(e.rows)} rows, ${plural(e.budgets, "daily budget", "daily budgets")}${small ? `: about ${plural(e.budgets, "day", "days")} on the small profile` : ""}.`;

type RangeChoice = number | "custom";

export function BackfillDialog({ sources, budget, yesterday, onClose, onStarted }: { sources: readonly SourceStatus[]; budget: Budget; yesterday: string; onClose: () => void; onStarted: () => void }) {
	const [id, setId] = useState<SourceId>(sources[0]?.id ?? "google");
	const def = budget?.defaultDays ?? BACKFILL_DEFAULT_DAYS;
	const [choice, setChoice] = useState<RangeChoice>(BACKFILL_OPTIONS.some((o) => o.days === def) ? def : BACKFILL_DEFAULT_DAYS);
	const [from, setFrom] = useState(addDays(yesterday, 1 - def));
	const [err, setErr] = useState<string | null>(null);
	const name = useId();
	const dialog = useDialog<HTMLDivElement>(onClose);
	const src = sources.find((s) => s.id === id) ?? sources[0];
	const small = budget?.profile === "small";
	const invalid = choice === "custom" ? backfillError(from, yesterday) : null;
	const est = (o: { days?: number; from?: string }) => (src ? optionEstimate(o, src, yesterday, budget) : null);
	const chosen = invalid ? null : est(choice === "custom" ? { from } : { days: choice });
	// The request the server answered "stored" for: the note goes when the choice changes.
	const body = { action: "start", source: id, ...(choice === "custom" ? { from } : { days: choice }) };
	const ask = JSON.stringify(body);
	const [stored, setStored] = useState<string | null>(null);
	const start = () =>
		call<{ stored: boolean }>("search/backfill", withApiSite(body)).then(
			(r) => (r.stored ? setStored(ask) : onStarted()),
			(e: unknown) => setErr(errorText(e)),
		);
	return (
		<div role="dialog" aria-label="Load older days" className="ca-dialog" {...dialog}>
			<h3>Load older days</h3>
			{sources.length > 1 && (
				<Field label="Source">
					<select value={id} onChange={(e) => setId(e.target.value as SourceId)}>
						{sources.map((s) => (
							<option key={s.id} value={s.id}>
								{NAMES[s.id]}
							</option>
						))}
					</select>
				</Field>
			)}
			<fieldset className="ca-range-options">
				<legend className="ca-field-label">Range</legend>
				{BACKFILL_OPTIONS.map((o) => {
					const e = est({ days: o.days });
					return (
						<label key={o.days} className="ca-range-option">
							<input type="radio" name={name} checked={choice === o.days} onChange={() => setChoice(o.days)} />
							<span>
								<span>
									{o.label}
									{o.days === 0 ? ` (${PROVIDER_LIMIT_TEXT[id]})` : ""}
								</span>
								{e && <span className="ca-help">{estimateText(e, small)}</span>}
							</span>
						</label>
					);
				})}
				<label className="ca-range-option">
					<input type="radio" name={name} checked={choice === "custom"} onChange={() => setChoice("custom")} />
					<span>
						<span>From a date</span>
						{choice === "custom" && chosen && <span className="ca-help">{estimateText(chosen, small)}</span>}
					</span>
				</label>
				{choice === "custom" && <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
			</fieldset>
			{chosen?.clamped && (
				<p className="ca-help">
					{PROVIDER_LIMIT_TEXT[id]}: loading starts at {chosen.from}.
				</p>
			)}
			{id === "bing" && <p className="ca-help">Bing has no date range: loading older Bing days stores the days Bing returns from the start of the range.</p>}
			{small && chosen && chosen.days > 0 && (
				<Notice tone="warning" label="Small profile">
					Loading these days writes about {count(chosen.rows)} rows. On the small profile Search may write {count(budget?.daily ?? 0)} rows a day, so it takes about {plural(chosen.budgets, "day", "days")}. Recording page views keeps priority: loading pauses until 00:00 UTC whenever the day's writes near the limit.
				</Notice>
			)}
			{(invalid ?? err) && <Notice tone="error">{invalid ?? err}</Notice>}
			{stored === ask && <p role="status">Already stored, nothing to write.</p>}
			<div className="ca-actions">
				{/* A custom start runs as asked on the server, so it is never closed here. */}
				<Button variant="primary" size="sm" disabled={!!invalid || (choice !== "custom" && chosen?.days === 0)} onClick={() => void start()}>
					Start loading
				</Button>
				<Button variant="ghost" size="sm" onClick={onClose}>
					Close
				</Button>
			</div>
		</div>
	);
}

// ── Reports ──────────────────────────────────────────────────────────────────

const METRIC_COLUMNS: Column[] = [
	{ key: "clicks", label: "Clicks" },
	{ key: "impressions", label: "Impressions" },
	{ key: "ctr", label: "CTR", format: "percent" },
	{ key: "position", label: "Position", format: "decimal" },
];
type Tab = "overview" | "queries" | "pages" | "countries" | "devices" | "positions" | "cannibalization" | "changes";
const TABS: ReadonlyArray<readonly [Tab, string]> = [
	["overview", "Overview"],
	["queries", "Queries"],
	["pages", "Pages"],
	["countries", "Countries"],
	["devices", "Devices"],
	["positions", "Positions"],
	["cannibalization", "Cannibalization"],
	["changes", "Changes"],
];
/** Bing has no country or device rows: the two tabs go when Google is not mapped. */
const GOOGLE_ONLY_TABS: ReadonlySet<Tab> = new Set(["countries", "devices"]);
const SOURCE_OPTIONS: ReadonlyArray<readonly [SourceSwitch, string]> = [
	["all", "All sources"],
	["google", "Google"],
	["bing", "Bing"],
];
const BREAKDOWN = {
	queries: ["search_queries", "Query", "query"],
	pages: ["search_pages", "Page", "page"],
	countries: ["search_countries", "Country", "country"],
	devices: ["search_devices", "Device", "device"],
} as const;

/** The stored days of `sources` (earliest first day, latest last day), or null when none is stored. */
export function storedDays(sources: ReadonlyArray<Pick<SourceStatus, "firstDay" | "lastDay">>): { from: string; to: string } | null {
	const firsts = sources.flatMap((s) => (s.firstDay ? [s.firstDay] : [])).sort();
	const lasts = sources.flatMap((s) => (s.lastDay ? [s.lastDay] : [])).sort();
	return firsts.length && lasts.length ? { from: firsts[0] as string, to: lasts.at(-1) as string } : null;
}

/**
 * The tabs with the source switch. `live` is the mapped sources of a local or client site; null for a remote site,
 * whose sources are not known here (no switch, every tab). With one mapped source the switch is hidden and the
 * reports ask for that source; `?src=` that names a source not on offer is dropped.
 */
export function ReportTabs({ view, live, aside }: { view: View; live: readonly SourceStatus[] | null; aside?: ReactNode }) {
	const { state, update } = view;
	const ids = live?.map((s) => s.id) ?? null;
	const switchable = !!ids && ids.length > 1;
	const tabs = ids && !ids.includes("google") ? TABS.filter(([t]) => !GOOGLE_ONLY_TABS.has(t)) : TABS;
	const tab = activeTab(tabs, state.tab);
	const source: SourceSwitch = switchable ? (state.src ?? "all") : ids?.length === 1 ? (ids[0] as SourceId) : "all";
	const badSrc = !!state.src && !switchable;
	useEffect(() => {
		if (badSrc) update({ src: undefined });
	}, [badSrc]);
	const stored = live && storedDays(source === "all" ? live : live.filter((s) => s.id === source));
	const outside = !!stored && (state.to < stored.from || state.from > stored.to);
	const label = tabs.find((t) => t[0] === tab)?.[1];
	return (
		<div className="ca-stack">
			{(switchable || aside) && (
				<div className="ca-spread ca-search-head">
					{switchable ? <Segmented label="Source" value={source} options={SOURCE_OPTIONS} onChange={(s) => update({ src: s === "all" ? undefined : s })} /> : <span />}
					{aside}
				</div>
			)}
			<Tabs label="Search reports" tabs={tabs} value={tab} onChange={(id) => update({ tab: tabParam(tabs, id) })} />
			<div role="tabpanel" className="ca-stack" aria-label={label}>
				{tab === "overview" ? (
					outside && stored ? (
						<section className="ca-panel" aria-label="Search trend">
							<Empty
								hint={`Stored days: ${stored.from} to ${stored.to}.`}
								action={{ label: "Show the last stored 28 days", onClick: () => update({ from: [stored.from, addDays(stored.to, -27)].sort()[1] as string, to: stored.to }) }}
							>
								No Search data from {state.from} to {state.to}.
							</Empty>
						</section>
					) : (
						<SearchOverview view={view} source={source} />
					)
				) : tab === "positions" ? (
					<PositionsTab view={view} source={source} />
				) : tab === "cannibalization" ? (
					<CannibalizationTab view={view} source={source} />
				) : tab === "changes" ? (
					<SearchChangesTab view={view} source={source} />
				) : (
					<>
						{(tab === "countries" || tab === "devices") && source !== "google" && <Notice tone="info">Bing has no country or device data; these rows are Google data.</Notice>}
						<ReportPanel
							view={view}
							report={BREAKDOWN[tab][0]}
							params={{ source }}
							title={label ?? BREAKDOWN[tab][1]}
							columns={[{ key: "key", label: BREAKDOWN[tab][1], format: "text", dim: BREAKDOWN[tab][2] }, ...METRIC_COLUMNS]}
						/>
					</>
				)}
			</div>
		</div>
	);
}

/** Search figures and their trend: clicks and impressions by default, position on its own inverted axis. */
const SEARCH_METRICS: readonly MetricDef[] = [
	{ key: "clicks", label: "Clicks", format: "number" },
	{ key: "impressions", label: "Impressions", format: "number" },
	{ key: "ctr", label: "CTR", format: "percent" },
	{ key: "position", label: "Avg. position", format: "decimal", invert: true },
];

export function SearchOverview({ view, source }: { view: View; source: SourceSwitch }) {
	const { state, site } = view;
	const res = useReport(site.id, { report: "search_overview", query: toQuery(state, "search_overview"), params: { source }, withAnnotations: true });
	const empty = !!res.data && (res.data.data.series ?? []).every((p) => !p.impressions);
	return (
		<ErrorScope view={view}>
			<div className="ca-stack">
				<ReportNotices notices={allNotices(res.data)} view={view} />
				{empty ? (
					<section className="ca-panel" aria-label="Search trend">
						<Empty hint="Search data arrives two to three days late. Pick an older range, or load older days in Connections." />
					</section>
				) : (
					<MetricChart id="search" view={view} metrics={SEARCH_METRICS} defaults={["clicks", "impressions"]} info="search_overview" result={res} trend annotations markerActions={annotationAction} />
				)}
				<p className="ca-small">Position is the impression-weighted average.</p>
			</div>
		</ErrorScope>
	);
}
