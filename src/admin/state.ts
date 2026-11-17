/**
 * Admin view state in the URL: `?from=&to=&f=<base64url json>&cmp=&seg=&site=&tab=&src=&m=`, so every
 * view is a link. The range, comparison, segment, filters and site are also kept for the browser session
 * (`ca.view.v1`), so they carry over to the next admin page, whose sidebar link has no query string.
 */
import { useCallback, useEffect, useState } from "react";
import { daysBetween, previousPeriod, samePeriodLastYear } from "../core/time.js";
import { DEFAULT_PRESET, type Preset, PRESETS, presetRange } from "../core/presets.js";
import { normalizeCurrency } from "../core/currency.js";
import { readPref, writePref } from "./prefs.js";
import { type Filter, FilterSchema, MAX_FILTERS, MAX_RANGE_DAYS } from "../query/filters.js";

export type Compare = "none" | "previous" | "year" | "segment";

export interface QueryState {
	from: string;
	to: string;
	compare: Compare;
	filters: Filter[];
	segment?: string;
	/** Side B of `compare: "segment"` (`?cmp=seg&cseg=<id>`). */
	cseg?: string;
	site?: string;
	/** Open dashboard (`?d=`). */
	dash?: string;
	/** Annotation markers on charts; absent means on, `ann=0` in the URL when off. */
	annotations?: boolean;
	/** Annotations page: the open row (`?a=<annotation id>`), or `date` for the impact of any date. */
	a?: string;
	/** Annotations page: the impact window in days (`?win=`); absent means the stored preference or 14. */
	win?: ImpactWindow;
	/** Annotations page: the text search (`?q=`, trimmed, at most 100 characters). */
	q?: string;
	/** Currency of the revenue views (`?cur=<ISO>`); absent means the site default. */
	cur?: string;
	/** Active tab of the page (`?tab=`); absent means the first tab. The page checks it against its own tabs. */
	tab?: string;
	/** Definitions: open the tab's New form once (`?new=1`, from a setup prompt); the page clears it. */
	new?: boolean;
	/** Search source (`?src=`); absent means all sources. */
	src?: SearchSource;
	/** Selected chart metrics of this page in slot order (`?m=a,b`, at most 4); see `chartMetrics` in `prefs.ts`. */
	m?: string[];
}

export type SearchSource = "google" | "bing";
/** Windows the Annotations page offers. */
export const ANNOTATION_WINDOWS = [7, 14, 28] as const;
export type ImpactWindow = (typeof ANNOTATION_WINDOWS)[number];

export { type Preset, PRESETS, presetRange } from "../core/presets.js";

/** The preset matching the range today, or null for a custom range. */
export function matchPreset(r: { from: string; to: string }, tz: string, nowSec?: number): Preset | null {
	for (const [p] of PRESETS) {
		const pr = presetRange(p, tz, nowSec);
		if (pr.from === r.from && pr.to === r.to) return p;
	}
	return null;
}

/** The range the server compares against (same functions as the report dispatcher). */
export function compareRange(s: Pick<QueryState, "from" | "to" | "compare">): { from: string; to: string } | null {
	if (s.compare === "previous") return previousPeriod(s);
	if (s.compare === "year") return samePeriodLastYear(s);
	return null;
}

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const SITE_RE = /^[a-z0-9-]{1,32}$/;
const SEG_RE = /^[A-Za-z0-9:._-]{1,128}$/;
const TAB_RE = /^[a-z0-9-]{1,40}$/;
const METRIC_RE = /^[a-z][a-z0-9_]{0,39}$/;

function toBase64Url(text: string): string {
	let bin = "";
	for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(v: string): string {
	const bin = atob(v.replace(/-/g, "+").replace(/_/g, "/"));
	return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Query string of a state; empty fields are left out. */
export function encodeState(s: QueryState): string {
	const q = new URLSearchParams({ from: s.from, to: s.to });
	if (s.filters.length) q.set("f", toBase64Url(JSON.stringify(s.filters)));
	if (s.compare === "segment") {
		if (s.cseg) q.set("cmp", "seg");
		if (s.cseg) q.set("cseg", s.cseg);
	} else if (s.compare !== "none") q.set("cmp", s.compare);
	if (s.segment) q.set("seg", s.segment);
	if (s.site) q.set("site", s.site);
	if (s.dash) q.set("d", s.dash);
	if (s.annotations === false) q.set("ann", "0");
	if (s.a) q.set("a", s.a);
	if (s.win) q.set("win", String(s.win));
	if (s.q) q.set("q", s.q);
	if (s.cur) q.set("cur", s.cur);
	if (s.tab) q.set("tab", s.tab);
	if (s.new) q.set("new", "1");
	if (s.src) q.set("src", s.src);
	if (s.m?.length) q.set("m", s.m.join(","));
	return q.toString();
}

/** True when the server accepts the range (`QuerySchema`: from <= to, under `MAX_RANGE_DAYS`). */
export const validRange = (from: string, to: string) => DAY_RE.test(from) && DAY_RE.test(to) && from <= to && daysBetween(from, to) <= MAX_RANGE_DAYS;

/**
 * State from a (pasted) query string. A URL without a valid `from` and `to` (a sidebar link) takes the
 * session view `stored` under its own parameters. Anything invalid falls back to the default range or is dropped.
 */
export function decodeState(search: string, tz: string, nowSec?: number, stored?: StoredView): QueryState {
	let q = new URLSearchParams(search);
	if (stored && !validRange(q.get("from") ?? "", q.get("to") ?? "")) {
		const base = new URLSearchParams(stored.q);
		// A relative preset is stored by name, so "Last 7 days" still ends today in a later session.
		if (stored.preset) for (const [k, v] of Object.entries(presetRange(stored.preset, tz, nowSec))) base.set(k, v);
		for (const [k, v] of q) if (k !== "from" && k !== "to") base.set(k, v);
		q = base;
	}
	const from = q.get("from") ?? "";
	const to = q.get("to") ?? "";
	const range = validRange(from, to) ? { from, to } : presetRange(DEFAULT_PRESET, tz, nowSec);
	const cmp = q.get("cmp");
	const cseg = q.get("cseg");
	const segCompare = cmp === "seg" && !!cseg && SEG_RE.test(cseg);
	const s: QueryState = { ...range, compare: cmp === "previous" || cmp === "year" ? cmp : segCompare ? "segment" : "none", filters: decodeFilters(q.get("f")) };
	if (segCompare && cseg) s.cseg = cseg;
	const seg = q.get("seg");
	if (seg && SEG_RE.test(seg)) s.segment = seg;
	const site = q.get("site");
	if (site && SITE_RE.test(site)) s.site = site;
	const dash = q.get("d");
	if (dash && /^[a-z0-9]{12}$/.test(dash)) s.dash = dash;
	if (q.get("ann") === "0") s.annotations = false;
	const a = q.get("a");
	if (a && /^[A-Za-z0-9:._-]{1,128}$/.test(a)) s.a = a;
	const win = Number(q.get("win"));
	if ((ANNOTATION_WINDOWS as readonly number[]).includes(win)) s.win = win as ImpactWindow;
	const text = q.get("q")?.trim().slice(0, 100);
	if (text) s.q = text;
	const cur = normalizeCurrency(q.get("cur"));
	if (cur) s.cur = cur;
	const tab = q.get("tab");
	if (tab && TAB_RE.test(tab)) s.tab = tab;
	if (q.get("new") === "1") s.new = true;
	const src = q.get("src");
	if (src === "google" || src === "bing") s.src = src;
	const m = [...new Set((q.get("m") ?? "").split(",").filter((x) => METRIC_RE.test(x)))].slice(0, 4);
	if (m.length) s.m = m;
	return s;
}

// ── Session carry-over ──────────────────────────────────────────

/** The part of the view that follows the user from page to page in this browser session. */
export interface StoredView {
	/** Query string of from, to, f, cmp, cseg, seg and site, through the same codec. */
	q: string;
	/** The relative preset the range matched when stored; it wins over the stored dates. */
	preset?: Preset;
}
const VIEW_KEY = "view.v1";
const isPreset = (p: unknown): p is Preset => PRESETS.some(([k]) => k === p);

/** The session view to store for `s`: the page-only fields (tab, new, metrics, source, dashboard, open annotation, window, currency, annotations) stay out. */
export function viewToStore(s: QueryState, tz: string, nowSec?: number): StoredView {
	const { from, to, compare, filters, segment, cseg, site } = s;
	const preset = matchPreset(s, tz, nowSec);
	return { q: encodeState({ from, to, compare, filters, segment, cseg, site }), ...(preset ? { preset } : {}) };
}

/** The stored session view, or undefined when there is none, storage is blocked or the value is malformed. */
export const readStoredView = (): StoredView | undefined =>
	readPref("session", VIEW_KEY, (v) => {
		const o = v as Partial<StoredView> | null;
		return o && typeof o.q === "string" && (o.preset === undefined || isPreset(o.preset)) ? { q: o.q, ...(o.preset ? { preset: o.preset } : {}) } : undefined;
	});

function decodeFilters(f: string | null): Filter[] {
	if (!f) return [];
	try {
		const raw: unknown = JSON.parse(fromBase64Url(f));
		if (!Array.isArray(raw)) return [];
		return raw.flatMap((x) => {
			const r = FilterSchema.safeParse(x);
			return r.success ? [r.data] : [];
		}).slice(0, MAX_FILTERS);
	} catch {
		return [];
	}
}

/**
 * The view state, kept in `location.search` and mirrored to the session view. A tab change adds a history
 * entry (`pushState`, so Back returns to the previous tab); every other change replaces the current one.
 * Both leave the host router alone.
 */
export function useQueryState(tz: string): [QueryState, (next: Partial<QueryState>) => void] {
	const [state, setState] = useState(() => decodeState(window.location.search, tz, undefined, readStoredView()));
	// The first view becomes a link too: write the decoded (cleaned) state once, without the one-shot `new`.
	useEffect(() => writeUrl({ ...state, new: undefined }, tz), []);
	useEffect(() => {
		const onPop = () => setState(decodeState(window.location.search, tz));
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [tz]);
	const update = useCallback((next: Partial<QueryState>) => {
		setState((cur) => {
			const s = { ...cur, ...next };
			if (s.compare !== "segment") delete s.cseg;
			else if (!s.cseg) s.compare = "none";
			for (const k of ["segment", "cseg", "site", "dash", "a", "win", "q", "cur", "tab", "src", "new"] as const) if (!s[k]) delete s[k];
			if (!s.m?.length) delete s.m;
			if (s.annotations !== false) delete s.annotations;
			writeUrl(s, tz, s.tab !== cur.tab);
			return s;
		});
	}, [tz]);
	return [state, update];
}

/** Rewrite the page URL through the codec, which drops every parameter it does not own (the OAuth return's `code` and `state`). */
export const cleanUrl = (tz: string) => writeUrl(decodeState(window.location.search, tz, undefined, readStoredView()), tz);

function writeUrl(s: QueryState, tz: string, push = false): void {
	const search = `?${encodeState(s)}`;
	const url = `${window.location.pathname}${search}${window.location.hash}`;
	// The equality check keeps a repeated call (React may run the updater twice) from adding a second entry.
	if (push && search !== window.location.search) window.history.pushState(window.history.state, "", url);
	else window.history.replaceState(window.history.state, "", url);
	// An open dashboard's range, comparison, segment and filters are its own: they never carry over to other pages.
	if (!s.dash) writePref("session", VIEW_KEY, viewToStore(s, tz));
}
