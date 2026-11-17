/** Persistent header: site switcher, date range, compare, segment picker, filter chips; and the page shell. */
import { PRODUCT_NAME, PRODUCT_URL, VERSION } from "../../contract.js";
import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useId, useState } from "react";
import type { SiteEntry } from "../../routes/sites.js";
import { listSegments, saveSegment, type SegmentItem, setApiSite } from "../api.js";
import { ALL_SITES, selectedSite, useSite } from "../site.js";
import { type Compare, compareRange, matchPreset, PRESETS, type Preset, presetRange, type QueryState, useQueryState, validRange } from "../state.js";
import { FilterBar } from "./FilterBar.js";
import { OffFilters } from "./ReportNotices.js";
import { Button, LinkButton } from "@cloudflare/kumo";
import { SETUP_COPY } from "../setup.js";
import { Field, Loading, Notice } from "./ui.js";
import { DASHBOARD_HREF } from "../widget.js";
import { isBool, usePref } from "../prefs.js";
import { fmt } from "./format.js";
import { type DocsLink, type WikiPage, wikiUrl } from "../docs-links.js";

/** Kind of a site entry; entries without a kind come from before the registry and are local or remote. */
export const siteKind = (s: SiteEntry) => s.kind ?? (s.local ? "local" : "remote");
/** True for a remote satellite: its data lives in another database and every report is proxied. */
export const isRemote = (s: SiteEntry) => siteKind(s) === "remote";
const KIND_LABELS = { local: "this install", client: "client site", remote: "connected site" } as const;

/** Renders nothing unless client or connected sites exist; "All sites" first, then local, client and connected sites with their kind. */
export function SiteSwitcher({ sites, value, onChange }: { sites: readonly SiteEntry[]; value: string; onChange: (id: string) => void }) {
	if (sites.length < 2) return null;
	const order = { local: 0, client: 1, remote: 2 } as const;
	const sorted = [...sites].sort((a, b) => order[siteKind(a)] - order[siteKind(b)]);
	return (
		<Field label="Site">
		<select aria-label="Site" value={value} onChange={(e) => onChange(e.target.value)}>
			<option value={ALL_SITES}>All sites</option>
			{sorted.map((s) => (
				<option key={s.id} value={s.id}>
					{s.label} ({KIND_LABELS[siteKind(s)]}
					{s.keyPresent === false ? ", key missing" : ""})
				</option>
			))}
		</select>
		</Field>
	);
}

/** `segments`: offered as "Another segment" in the compare menu; absent or empty hides the option. */
export function DateRange({ state, tz, onChange, segments = [] }: { state: QueryState; tz: string; onChange: (next: Partial<QueryState>) => void; segments?: readonly SegmentItem[] | undefined }) {
	// Picking "Custom" keeps the range and opens From and To; any preset closes them again.
	const [custom, setCustom] = useState(false);
	const preset = (custom ? null : matchPreset(state, tz)) ?? "custom";
	const cmp = compareRange(state);
	return (
		<div className="ca-daterange">
			<Field label="Date range">
			<select
				aria-label="Date range"
				value={preset}
				onChange={(e) => {
					setCustom(e.target.value === "custom");
					if (e.target.value !== "custom") onChange(presetRange(e.target.value as Preset, tz));
				}}
			>
				{PRESETS.map(([id, label]) => (
					<option key={id} value={id}>
						{label}
					</option>
				))}
				<option value="custom">Custom</option>
			</select>
			</Field>
			{preset === "custom" ? (
				<>
					<Field label="From">
					<input type="date" aria-label="From" value={state.from} max={state.to} onChange={(e) => validRange(e.target.value, state.to) && onChange({ from: e.target.value })} />
					</Field>
					<Field label="To">
					<input type="date" aria-label="To" value={state.to} min={state.from} onChange={(e) => validRange(state.from, e.target.value) && onChange({ to: e.target.value })} />
					</Field>
				</>
			) : (
				<span className="ca-compare-range">
					{state.from} to {state.to}
				</span>
			)}
			<Field label="Comparison">
			<select
				aria-label="Compare"
				value={state.compare}
				onChange={(e) => {
					const compare = e.target.value as Compare;
					if (compare !== "segment") return onChange({ compare });
					const cseg = state.cseg ?? (segments.find((s) => s.id !== state.segment) ?? segments[0])?.id;
					if (cseg) onChange({ compare, cseg });
				}}
			>
				<option value="none">No comparison</option>
				<option value="previous">Previous period</option>
				<option value="year">Same period last year</option>
				{(segments.length > 0 || state.compare === "segment") && <option value="segment">Another segment</option>}
			</select>
			</Field>
			{state.compare === "segment" && (
				<Field label="Compare with">
				<select aria-label="Compare with segment" value={state.cseg ?? ""} onChange={(e) => onChange({ cseg: e.target.value })}>
					{state.cseg && !segments.some((s) => s.id === state.cseg) && <option value={state.cseg}>Segment from the link</option>}
					{segments.map((s) => (
						<option key={s.id} value={s.id}>
							{s.data.name}
						</option>
					))}
				</select>
				</Field>
			)}
			{cmp && (
				<span className="ca-compare-range">
					vs {cmp.from} to {cmp.to}
				</span>
			)}
		</div>
	);
}

/**
 * With no segment listed and none applied: a "Create a segment" link when the list was read (`canCreate`), else
 * nothing. An applied segment that is not listed (a shared link) still shows and can be cleared.
 */
export function SegmentPicker({ segments, value, onChange, canCreate = false }: { segments: readonly SegmentItem[]; value: string | undefined; onChange: (id: string | undefined) => void; canCreate?: boolean }) {
	if (!segments.length && !value)
		return canCreate ? (
			<LinkButton size="sm" variant="ghost" className="ca-segment-create" href={SETUP_COPY.segments.href} title={SETUP_COPY.segments.text}>
				{SETUP_COPY.segments.label}
			</LinkButton>
		) : null;
	return (
		<Field label="Segment">
		<select aria-label="Segment" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
			<option value="">All visitors</option>
			{value && !segments.some((s) => s.id === value) && <option value={value}>Segment from the link</option>}
			{segments.map((s) => (
				<option key={s.id} value={s.id}>
					{s.data.name}
				</option>
			))}
		</select>
		</Field>
	);
}

/** What a page receives from the shell. */
export interface View {
	state: QueryState;
	update: (next: Partial<QueryState>) => void;
	/** Selected site; its id goes into every `data/query` call. */
	site: SiteEntry;
	/** Every site of the switcher. */
	sites: readonly SiteEntry[];
	/** Timezone of the local site (presets, annotation markers). */
	tz: string;
	/** The switcher reads "All sites" (`site=all`); `site` is then the local site. */
	all?: boolean;
}

/** Header controls a page uses: all of them, the site switcher only (pages that ignore range and filters), or none. */
export type Controls = "full" | "site" | "none";

/** What a page body puts into the shell while it is mounted: `controls` overrides the `Shell` prop, `live` shows the "active now" badge. */
export interface ShellHead {
	controls?: Controls | undefined;
	live?: number | null | undefined;
}
const HeadContext = createContext<(h: ShellHead | null) => void>(() => {});

/** Sets the shell head from inside a page, e.g. `useShellHead({ live: realtime })`, or `{ controls: "site" }` while nothing can be filtered. */
export function useShellHead(h: ShellHead): void {
	const set = useContext(HeadContext);
	useEffect(() => {
		set(h);
		return () => set(null);
	}, [set, h.controls, h.live]);
}

/** The live badge of the page head: visitors seen within the realtime window. */
export function LiveBadge({ value }: { value: number }) {
	return (
		<span className="ca-live">
			<span className="ca-live-dot" aria-hidden="true" />
			{fmt(value, "number")} active now
		</span>
	);
}

const COMPARE_TEXT: Record<Compare, string | null> = { none: null, previous: "vs previous period", year: "vs same period last year", segment: "vs another segment" };

/** One line for the collapsed header at narrow widths: site (when there is a choice), range, comparison, segment, filters. */
export function headSummary(state: QueryState, tz: string, site: string | null, segment: string | null): string {
	const p = matchPreset(state, tz);
	const n = state.filters.length;
	return [site, p ? PRESETS.find(([id]) => id === p)?.[1] : `${state.from} to ${state.to}`, COMPARE_TEXT[state.compare], segment, n ? `${n} ${n === 1 ? "filter" : "filters"}` : null]
		.filter(Boolean)
		.join(", ");
}

/** "Learn more" in a page head: the topic's wiki page in a new tab. */
export function LearnMore({ page, topic }: { page: WikiPage; topic: string }) {
	return (
		<a className="ca-learn" href={wikiUrl(page)} target="_blank" rel="noreferrer">
			Learn more<span className="ca-sr"> about {topic} (opens in a new tab)</span>
		</a>
	);
}

/** Loads the sites, then renders the header and the page with the URL state. `allSites`: the page renders the All-sites view itself (the Overview). */
export function Shell({ children, allSites = false, title, controls = "full", docs }: { children: (v: View) => ReactNode; allSites?: boolean; title?: string; controls?: Controls; docs?: DocsLink }) {
	const { sites, local } = useSite();
	if (!sites)
		return (
			<div className="ca-root ca-shell">
				<Loading />
			</div>
		);
	return (
		<ShellBody sites={sites} local={local} allSites={allSites} title={title} controls={controls} docs={docs}>
			{children}
		</ShellBody>
	);
}

function ShellBody({ sites, local, allSites, title, controls: base, docs, children }: { sites: SiteEntry[]; local: SiteEntry; allSites: boolean; title?: string | undefined; controls: Controls; docs?: DocsLink | undefined; children: (v: View) => ReactNode }) {
	const tz = local.timezone ?? "UTC";
	const [state, update] = useQueryState(tz);
	const all = state.site === ALL_SITES && sites.length > 1;
	// `site=all` selects no site: every page but the Overview shows the local site.
	const site = selectedSite(sites, all ? undefined : state.site, local);
	const remote = isRemote(site);
	// Config, segment and tool calls carry a client site's id; set before the page below renders.
	setApiSite(site.local || remote ? "" : site.id);
	const [segments, setSegments] = useState<SegmentItem[]>([]);
	// True once the list was read: only then can an empty list offer "Create a segment".
	const [listed, setListed] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const reload = useCallback(() => {
		// Listing segments needs `plugins:manage`; without it the picker stays hidden. A connected site has none here.
		setListed(false);
		if (remote) setSegments([]);
		else
			listSegments().then(
				(r) => (setSegments(r.items), setListed(true)),
				() => setSegments([]),
			);
	}, [site.id]);
	useEffect(reload, [reload]);
	const save = async (name: string) => {
		setError(null);
		try {
			// A new segment keeps what the view shows: the selected segment's filters plus the chips.
			const base = segments.find((s) => s.id === state.segment)?.data.filters ?? [];
			const { id } = await saveSegment(name, [...base, ...state.filters]);
			reload();
			update({ segment: id, filters: [] });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	const inDb = !remote;
	// Filters the page's reports could not apply, per reporting panel; their chips are struck through.
	const [offBy, setOffBy] = useState<Record<string, Record<string, string>>>({});
	const reportOff = useCallback((id: string, o: Record<string, string> | null) => setOffBy(({ [id]: _, ...rest }) => (o ? { ...rest, [id]: o } : rest)), []);
	const off = new Map(Object.values(offBy).flatMap((o) => Object.entries(o)));
	// The All-sites table takes no filters and no segment.
	const table = all && allSites;
	const [head, setHead] = useState<ShellHead | null>(null);
	const controls = head?.controls ?? base;
	// Collapsed below 640 px (CSS), open state for this browser session.
	const [open, setOpen] = usePref("session", "head.open.v1", isBool, false);
	const bodyId = useId();
	const mainId = useId();
	const multi = sites.length > 1;
	const segName = state.segment ? (segments.find((s) => s.id === state.segment)?.data.name ?? "Segment from the link") : null;
	return (
		<div className="ca-root ca-shell">
			{/* First tab stop: past the header to the report. A button, not a fragment link, so the host router sees no hash. */}
			<button type="button" className="ca-skip" onClick={() => document.getElementById(mainId)?.focus()}>
				Skip to report
			</button>
			{title && (
				<div className="ca-page-head">
					<h1>{title}</h1>
					{typeof head?.live === "number" && <LiveBadge value={head.live} />}
					{/* The site select names the site; without it the head does. */}
					{controls === "none" && !all && multi && <span className="ca-sub">{site.label}</span>}
					{docs && <LearnMore page={typeof docs === "function" ? docs({ tab: state.tab, all }) : docs} topic={title} />}
				</div>
			)}
			{(controls === "full" || (controls === "site" && multi)) && (
			<header className="ca-header" data-open={controls !== "full" || open}>
				{controls === "full" && (
					<button type="button" className="ca-head-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
						<svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
							<path d="M6 4l4 4-4 4" />
						</svg>
						<span>{headSummary(state, tz, multi ? (all ? "All sites" : site.label) : null, table ? null : segName)}</span>
					</button>
				)}
				<div id={bodyId} className="ca-head-body">
				<div className="ca-header-row">
				<SiteSwitcher
					sites={sites}
					value={all ? ALL_SITES : site.id}
					onChange={(id) => update({ site: id === local.id ? undefined : id, segment: undefined, dash: undefined, ...(state.compare === "segment" ? { compare: "none" as const } : {}) })}
				/>
				{controls === "full" && <DateRange state={state} tz={tz} onChange={update} segments={inDb && !table ? segments : []} />}
				{controls === "full" && inDb && !table && <SegmentPicker segments={segments} value={state.segment} onChange={(segment) => update({ segment })} canCreate={listed} />}
				</div>
				{/* Saving needs the applied segment's filters, so it is offered only when that segment is listed. */}
				{controls === "full" && !table && <FilterBar filters={state.filters} disabled={off} onChange={(filters) => update({ filters })} onSaveSegment={inDb && (!state.segment || segments.some((s) => s.id === state.segment)) ? save : undefined} />}
				</div>
			</header>
			)}
			<span id={mainId} tabIndex={-1} className="ca-sr" />
			{error && <Notice tone="error">{error}</Notice>}
			{remote && site.keyPresent === false && (
				<Notice tone="error">
					The API key of {site.label} is not set on this install, so its reports cannot be loaded. Create an API key with both read scopes (reports and Search) in the admin of {site.label}, then set it as
					the env var named for this site in astro.config.
				</Notice>
			)}
			{all && !allSites && (
				<Notice
					tone="info"
					action={
						<>
							<a href={`${DASHBOARD_HREF}?site=${ALL_SITES}&from=${state.from}&to=${state.to}`}>Open the All sites table</a>
							<Button size="sm" onClick={() => update({ site: undefined })}>
								Stay on {local.label}
							</Button>
						</>
					}
				>
					All sites is a table on the Overview page; this page shows {local.label}.
				</Notice>
			)}
			{/* Keyed by site so every page reloads its lists when the site changes. */}
			<HeadContext.Provider value={setHead}>
			<OffFilters.Provider value={reportOff}>
				<Fragment key={all ? ALL_SITES : site.id}>{children({ state, update, site, sites, tz, all })}</Fragment>
			</OffFilters.Provider>
			</HeadContext.Provider>
			<footer className="ca-footer">
				<a href={PRODUCT_URL} target="_blank" rel="noopener noreferrer">{PRODUCT_NAME}</a> v{VERSION}
			</footer>
		</div>
	);
}

/** The `Query` of a view for `data/query`. Search reports and `impact` cannot compare segments: they run without comparison. */
export function toQuery(s: QueryState, report?: string) {
	const noSeg = s.compare === "segment" && (!s.cseg || (report !== undefined && (report.startsWith("search_") || report === "impact" || report === "annotation_impacts")));
	const compare = noSeg ? ("none" as const) : s.compare;
	return { from: s.from, to: s.to, filters: s.filters, compare, ...(compare === "segment" && s.cseg ? { compareSegment: s.cseg } : {}), ...(s.segment ? { segment: s.segment } : {}) };
}

/** The `Query` of a view without any comparison, for reports that never compare (SEO views, the Journeys picker, Recent orders). */
export function toPlainQuery(s: QueryState) {
	const { compareSegment: _c, ...q } = toQuery(s);
	return { ...q, compare: "none" as const };
}
