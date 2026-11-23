/**
 * Value input of the filter bar: free text with a list of the values the range holds for the chosen dimension
 * (`dimension_values`, at most 50 with their counts), as a WAI-ARIA combobox. Arrow keys move through the list,
 * Enter or a click picks a value, Escape closes the list; anything typed can still be added as it is.
 */
import { Input } from "@cloudflare/kumo";
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from "react";
import { type Dim, SEARCH_DIMS } from "../../query/filters.js";
import { errorText, queryReport } from "../api.js";
import { fmt } from "./format.js";
import { errorRange } from "./ReportNotices.js";

/** Where suggestions come from: the active site and the view's range; `search` reads the search dims from the search table. */
export interface SuggestSource {
	site: string;
	from: string;
	to: string;
	scope?: "traffic" | "search" | undefined;
	/** Property key of the `event_prop` dimension. */
	prop?: string | undefined;
}

/** The last 90 days up to `to` (the form fields of the definitions pages have no range of their own). */
export const suggestRange = (to: string, addDays: (d: string, n: number) => string): { from: string; to: string } => ({ from: addDays(to, -89), to });

export interface Suggestion {
	key: string;
	/** Sessions, page views or events of the value in the range; null for goals (they come from the settings). */
	count: number | null;
}

/** Dims without suggestions: revenue is a number, the currency a code the values report does not list. */
export const NO_SUGGEST: ReadonlySet<Dim> = new Set<Dim>(["revenue", "currency"]);
/** The cap of the values report. */
export const SUGGEST_LIMIT = 50;
/** Typing pause before a prefix request. */
export const SUGGEST_DEBOUNCE_MS = 250;
const PREFIX_MAX = 128;
const CACHE_MAX = 200;

interface Answer {
	rows: Suggestion[];
	/** Fewer rows than the cap: the list holds every value, so typing narrows it without a request. */
	complete: boolean;
}
// Per site, scope, dim, range and prefix, for as long as the admin page is open; a failed answer is not kept.
const cache = new Map<string, Promise<Answer>>();
// The answers that arrived, read synchronously to skip the typing pause when a complete list narrows in memory.
const done = new Map<string, Answer>();
/** Forget every cached list (tests). */
export const resetSuggestions = () => (cache.clear(), done.clear(), fitted.clear(), outboundCache.clear(), propCache.clear());

const scopeOf = (src: SuggestSource, dim: Dim) => (src.scope === "search" && dim in SEARCH_DIMS ? "search" : "traffic");
const cacheKey = (src: SuggestSource, dim: Dim, prefix: string) => [src.site, scopeOf(src, dim), dim, src.prop ?? "", src.from, src.to, prefix].join("\n");

// A range past the detailed window answers with one that fits: remembered per site and range, so later lookups ask once.
const fitted = new Map<string, { from: string; to: string }>();
const rangeKey = (src: { site: string; from: string; to: string }) => `${src.site}|${src.from}|${src.to}`;
/** Ask for `src`'s range, or the range a former answer asked for instead. */
async function askFitted<T>(src: { site: string; from: string; to: string }, ask: (from: string, to: string) => Promise<T>): Promise<T> {
	const known = fitted.get(rangeKey(src));
	if (known) return ask(known.from, known.to);
	try {
		return await ask(src.from, src.to);
	} catch (e) {
		const fix = errorRange(errorText(e), src.to);
		if (!fix) throw e;
		fitted.set(rangeKey(src), fix);
		return ask(fix.from, fix.to);
	}
}

async function load(src: SuggestSource, dim: Dim, prefix: string): Promise<Answer> {
	const scope = scopeOf(src, dim);
	const ask = (from: string, to: string) =>
		queryReport(src.site, { report: "dimension_values", query: { from, to, filters: [], compare: "none" }, params: { dim, ...(src.prop ? { prop: src.prop } : {}), ...(scope === "search" ? { scope } : {}), ...(prefix ? { prefix } : {}) }, limit: SUGGEST_LIMIT });
	const res = await askFitted(src, ask);
	const raw = (res.data.rows ?? []).map((r) => ({ key: String(r.key ?? ""), count: typeof r.count === "number" ? r.count : null })).filter((r) => r.key !== "");
	return { rows: raw, complete: raw.length < SUGGEST_LIMIT };
}

function cached(src: SuggestSource, dim: Dim, prefix: string): Promise<Answer> {
	const k = cacheKey(src, dim, prefix);
	let p = cache.get(k);
	if (!p) {
		if (cache.size >= CACHE_MAX) {
			const oldest = cache.keys().next().value as string;
			cache.delete(oldest);
			done.delete(oldest);
		}
		p = load(src, dim, prefix);
		cache.set(k, p);
		p.then(
			(a) => cache.get(k) === p && done.set(k, a),
			() => cache.delete(k),
		);
	}
	return p;
}

/** Values that start with the text first, then values that contain it (case-insensitive). */
export function narrow(rows: readonly Suggestion[], text: string): Suggestion[] {
	const t = text.toLowerCase();
	const starts = rows.filter((r) => r.key.toLowerCase().startsWith(t));
	return [...starts, ...rows.filter((r) => !r.key.toLowerCase().startsWith(t) && r.key.toLowerCase().includes(t))];
}

/**
 * The suggestions for `dim` while the input has focus: the full list when nothing is typed; with text, the cached
 * full list narrowed in memory when it was complete, else one request with the typed prefix after a short pause.
 */
function useSuggestions(src: SuggestSource | undefined, dim: Dim, text: string, active: boolean): Suggestion[] {
	// The rows with the site, range and dimension they answer: a list for another one is never shown or picked.
	const [got, setGot] = useState<{ k: string; rows: Suggestion[] }>({ k: "", rows: [] });
	const on = active && !!src && !NO_SUGGEST.has(dim);
	const needle = text.trim().slice(0, PREFIX_MAX);
	const site = src?.site;
	const from = src?.from;
	const to = src?.to;
	const scope = src?.scope;
	const prop = src?.prop;
	const k = `${site}|${from}|${to}|${scope}|${dim}|${prop}`;
	useEffect(() => {
		if (!on || site === undefined || !from || !to) return;
		const s: SuggestSource = { site, from, to, scope, prop };
		let live = true;
		const run = async () => {
			try {
				const base = cache.get(cacheKey(s, dim, ""));
				let list: Suggestion[];
				if (!needle) list = (await cached(s, dim, "")).rows;
				else {
					const all = base ? await base.catch(() => null) : null;
					list = all?.complete ? narrow(all.rows, needle) : (await cached(s, dim, needle)).rows;
				}
				if (live) setGot({ k, rows: list });
			} catch {
				// No suggestions: free text still works.
				if (live) setGot({ k, rows: [] });
			}
		};
		const t = setTimeout(run, needle && !done.get(cacheKey(s, dim, ""))?.complete ? SUGGEST_DEBOUNCE_MS : 0);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [on, site, from, to, scope, prop, dim, needle, k]);
	return on && got.k === k ? got.rows : [];
}

export interface ValueInputProps {
	dim: Dim;
	value: string;
	onChange: (value: string) => void;
	/** A suggestion was picked (Enter or click). */
	onPick: (value: string) => void;
	/** Absent: plain free text, nothing is requested. */
	source?: SuggestSource | undefined;
	/** A fixed list instead of a request (the keys and values of one event). */
	options?: readonly Suggestion[] | undefined;
	placeholder?: string;
	label?: string;
	maxLength?: number;
	/** Names the list and its live count; default: values in the range. */
	listLabel?: string;
	/** Id of a note about the field. */
	describedBy?: string | undefined;
	/** Focus entered or left the field. */
	onFocusChange?: ((focused: boolean) => void) | undefined;
	/** Keys left out of requested lists. */
	hide?: ((key: string) => boolean) | undefined;
}

export function ValueInput({ dim, value, onChange, onPick, source, options, placeholder, label = "Value", maxLength = 512, listLabel = "Values in this range", describedBy, onFocusChange, hide }: ValueInputProps) {
	const id = useId();
	const listId = `${id}-values`;
	const [focused, setFocused] = useState(false);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const fetched = useSuggestions(options ? undefined : source, dim, value, focused);
	const needle = value.trim();
	// One array per content, so a render does not look like a new list and reset the highlight.
	const rows = useMemo(() => {
		const list = options ? narrow(options, needle) : fetched;
		return hide ? list.filter((r) => !hide(r.key)) : list;
	}, [options, needle, fetched, hide]);
	const rowsKey = rows.map((r) => r.key).join("\n");
	const shown = open && focused && rows.length > 0;
	// A new list starts with nothing highlighted, so Enter adds the typed text until an arrow key picks a row.
	useEffect(() => setActive(-1), [rowsKey]);
	// The highlighted row stays inside the scrolling list.
	useEffect(() => {
		if (shown && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
	}, [shown, active, listId]);
	const pick = (key: string) => {
		setOpen(false);
		setActive(-1);
		onPick(key);
	};
	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			if (!rows.length) return;
			e.preventDefault();
			if (!shown) {
				setOpen(true);
				setActive(e.key === "ArrowDown" ? 0 : rows.length - 1);
				return;
			}
			setActive((a) => (e.key === "ArrowDown" ? (a + 1) % rows.length : a <= 0 ? rows.length - 1 : a - 1));
		} else if (e.key === "Enter" && shown && active >= 0 && rows[active]) {
			e.preventDefault();
			pick(rows[active].key);
		} else if (e.key === "Escape" && shown) {
			e.preventDefault();
			e.stopPropagation();
			setOpen(false);
			setActive(-1);
		} else if (e.key === "Tab") setOpen(false);
	};
	return (
		<span className="ca-combo">
			<Input
				aria-label={label}
				role="combobox"
				aria-autocomplete="list"
				aria-describedby={describedBy}
				aria-expanded={shown}
				aria-controls={listId}
				aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
				autoComplete="off"
				value={value}
				maxLength={maxLength}
				placeholder={placeholder}
				onChange={(e) => {
					onChange(e.target.value);
					setOpen(true);
				}}
				onFocus={() => {
					setFocused(true);
					setOpen(true);
					onFocusChange?.(true);
				}}
				onBlur={() => {
					setFocused(false);
					setOpen(false);
					onFocusChange?.(false);
				}}
				onKeyDown={onKeyDown}
			/>
			<ul
				id={listId}
				role="listbox"
				aria-label={listLabel}
				className="ca-combo-list"
				hidden={!shown}
				// Keeps focus in the input, so a click on a row or the scrollbar lands before the list closes.
				onMouseDown={(e) => e.preventDefault()}
			>
				{shown &&
					rows.map((r, i) => (
						<li
							key={r.key}
							id={`${listId}-${i}`}
							role="option"
							aria-selected={i === active}
							className="ca-combo-opt"
							onMouseEnter={() => setActive(i)}
							onClick={() => pick(r.key)}
						>
							<span className="ca-combo-key">{r.key}</span>
							{r.count !== null && <span className="ca-combo-count">{fmt(r.count, "number")}</span>}
						</li>
					))}
			</ul>
			<span className="ca-sr" aria-live="polite">
				{shown ? `${rows.length} ${rows.length === 1 ? "suggestion" : "suggestions"}` : ""}
			</span>
		</span>
	);
}

/** Event names are 1 to 64 characters; a longer text is never asked for. */
const NAME_MAX = 64;

/**
 * Whether `value` was seen in the range: null while unknown (no source, nothing typed, no answer yet, or an answer cut at
 * the cap that does not hold it). A complete list answers in memory; one request per dimension serves every keystroke.
 */
export function useSeen(src: SuggestSource | undefined, dim: Dim, value: string, on = true): boolean | null {
	const [got, setGot] = useState<{ k: string; seen: boolean | null } | null>(null);
	const needle = value.trim();
	const site = src?.site;
	const from = src?.from;
	const to = src?.to;
	const prop = src?.prop;
	const k = `${site}|${from}|${to}|${dim}|${prop}|${needle}`;
	useEffect(() => {
		if (!on || site === undefined || !from || !to || !needle || needle.length > NAME_MAX || NO_SUGGEST.has(dim)) return;
		const s: SuggestSource = { site, from, to, prop };
		let live = true;
		const t = setTimeout(async () => {
			try {
				const base = await cached(s, dim, "");
				let seen: boolean | null;
				if (base.complete) seen = base.rows.some((r) => r.key === needle);
				else {
					const a = await cached(s, dim, needle);
					seen = a.rows.some((r) => r.key === needle) ? true : a.complete ? false : null;
				}
				if (live) setGot({ k, seen });
			} catch {
				if (live) setGot(null);
			}
		}, SUGGEST_DEBOUNCE_MS);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [on, site, from, to, prop, dim, needle, k]);
	return on && got?.k === k ? got.seen : null;
}

export const UNSEEN_TEXT = "Not seen recently. Check the spelling.";

const outboundCache = new Map<string, Promise<Suggestion[]>>();
const OUTBOUND_LIMIT = 500;

/** Outbound links of the range with their event counts, as `host/path` (the `outbound` report). */
function loadOutbound(src: SuggestSource): Promise<Suggestion[]> {
	const k = rangeKey(src);
	let p = outboundCache.get(k);
	if (!p) {
		const ask = (from: string, to: string) => queryReport(src.site, { report: "outbound", query: { from, to, filters: [], compare: "none" }, params: {}, limit: OUTBOUND_LIMIT });
		p = askFitted(src, ask).then((res) =>
			(res.data.rows ?? []).map((r) => ({ key: String(r.key ?? ""), count: typeof r.events === "number" ? r.events : null })).filter((r) => r.key !== "" && r.key !== "(not set)"),
		);
		outboundCache.set(k, p);
		p.catch(() => outboundCache.delete(k));
	}
	return p;
}

/** The hosts of outbound links by event count. */
export function outboundHosts(links: readonly Suggestion[]): Suggestion[] {
	const hosts = new Map<string, number>();
	for (const l of links) {
		const h = l.key.split("/")[0] as string;
		hosts.set(h, (hosts.get(h) ?? 0) + (l.count ?? 0));
	}
	return [...hosts].map(([key, count]) => ({ key, count })).sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || (a.key < b.key ? -1 : 1));
}

/** An outbound goal matches the host exactly (any path) or `host/path` exactly, in lower case. */
export function outboundSeen(links: readonly Suggestion[], value: string): boolean {
	const v = value.trim().toLowerCase();
	return links.some((l) => {
		const u = l.key.toLowerCase();
		return u === v || u.startsWith(`${v}/`);
	});
}

/** The outbound links of the range once `on`; null while loading or when they could not be read. */
function useOutbound(src: SuggestSource | undefined, on: boolean): Suggestion[] | null {
	const [got, setGot] = useState<{ k: string; rows: Suggestion[] } | null>(null);
	const site = src?.site;
	const from = src?.from;
	const to = src?.to;
	const k = `${site}|${from}|${to}`;
	useEffect(() => {
		if (!on || site === undefined || !from || !to) return;
		let live = true;
		loadOutbound({ site, from, to }).then(
			(rows) => live && setGot({ k, rows }),
			() => live && setGot(null),
		);
		return () => {
			live = false;
		};
	}, [on, site, from, to, k]);
	return on && got?.k === k ? got.rows : null;
}

export interface SuggestInputProps {
	dim: Dim;
	value: string;
	onChange: (value: string) => void;
	source?: SuggestSource | undefined;
	options?: readonly Suggestion[] | undefined;
	label?: string;
	placeholder?: string;
	/** Show the note when the value was not seen (exact-match fields). */
	check?: boolean;
	/** `outbound`: the hosts of the outbound links; the note follows the goal's own match. */
	kind?: "outbound" | undefined;
	/** Names the list; default: values seen recently. */
	listLabel?: string;
	/** Focus entered or left the field. */
	onFocusChange?: ((focused: boolean) => void) | undefined;
}

const hideReserved = (key: string) => key.startsWith("_");

/**
 * A free-text field that suggests the values seen in the last days; picking fills the field, anything typed is kept.
 * Without a source or a list it is a plain text field. The note about an unseen value shows once the field is left.
 */
export function SuggestInput({ dim, value, onChange, source, options, label, placeholder, check = false, kind, listLabel = "Values seen recently", onFocusChange }: SuggestInputProps) {
	const id = useId();
	const [touched, setTouched] = useState(false);
	const [focused, setFocused] = useState(false);
	const links = useOutbound(source, kind === "outbound" && touched);
	const hosts = useMemo(() => (links ? outboundHosts(links) : undefined), [links]);
	const seenInList = useSeen(kind === "outbound" ? undefined : check ? source : undefined, dim, value, touched);
	const needle = value.trim();
	const seen = kind === "outbound" ? (check && links && needle ? outboundSeen(links, needle) : null) : seenInList;
	if (!source && !options) return <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />;
	const note = seen === false && touched && !focused;
	return (
		<>
			<ValueInput
				dim={dim}
				value={value}
				onChange={onChange}
				onPick={onChange}
				source={kind === "outbound" ? undefined : source}
				options={kind === "outbound" ? hosts : options}
				label={label}
				placeholder={placeholder}
				listLabel={listLabel}
				describedBy={note ? `${id}-note` : undefined}
				hide={dim === "event" ? hideReserved : undefined}
				onFocusChange={(f) => {
					setFocused(f);
					if (f) setTouched(true);
					onFocusChange?.(f);
				}}
			/>
			{note && (
				<span id={`${id}-note`} role="status" className="ca-small ca-help">
					{UNSEEN_TEXT}
				</span>
			)}
		</>
	);
}

export interface EventProp {
	prop: string;
	value: string;
	count: number;
}
const propCache = new Map<string, Promise<EventProp[]>>();
const PROP_CACHE_MAX = 50;
export const resetEventProps = () => propCache.clear();

/** Keys and values of one event in the range (`event_props`); empty until `on`, and without a source or an event name. */
export function useEventProps(src: SuggestSource | undefined, event: string, on = true): EventProp[] {
	const [got, setGot] = useState<{ k: string; rows: EventProp[] }>({ k: "", rows: [] });
	const name = event.trim();
	const site = src?.site;
	const from = src?.from;
	const to = src?.to;
	const k = `${site}|${from}|${to}|${name}`;
	useEffect(() => {
		if (!on || site === undefined || !from || !to || !name || name.length > NAME_MAX) return;
		let live = true;
		const t = setTimeout(() => {
			let p = propCache.get(k);
			if (!p) {
				const ask = (f: string, u: string) => queryReport(site, { report: "event_props", query: { from: f, to: u, filters: [], compare: "none" }, params: { event: name }, limit: 500 });
				p = askFitted({ site, from, to }, ask).then((res) =>
					(res.data.rows ?? []).map((r) => ({ prop: String(r.prop ?? ""), value: String(r.value ?? ""), count: typeof r.count === "number" ? r.count : 0 })).filter((r) => r.prop !== ""),
				);
				if (propCache.size >= PROP_CACHE_MAX) propCache.delete(propCache.keys().next().value as string);
				propCache.set(k, p);
				p.catch(() => propCache.delete(k));
			}
			p.then(
				(rows) => live && setGot({ k, rows }),
				() => live && setGot({ k, rows: [] }),
			);
		}, SUGGEST_DEBOUNCE_MS);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [on, site, from, to, name, k]);
	return on && got.k === k ? got.rows : [];
}

/** The property keys of an event with their event counts, and the values of one key. */
export function propOptions(rows: readonly EventProp[], key: string): { keys: Suggestion[]; values: Suggestion[] } {
	const keys = new Map<string, number>();
	for (const r of rows) keys.set(r.prop, (keys.get(r.prop) ?? 0) + r.count);
	return {
		keys: [...keys].map(([k, count]) => ({ key: k, count })),
		values: rows.filter((r) => r.prop === key && r.value !== "").map((r) => ({ key: r.value, count: r.count })),
	};
}
