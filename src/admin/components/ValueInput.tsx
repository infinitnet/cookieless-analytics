/**
 * Value input of the filter bar: free text with a list of the values the range holds for the chosen dimension
 * (`dimension_values`, at most 50 with their counts), as a WAI-ARIA combobox. Arrow keys move through the list,
 * Enter or a click picks a value, Escape closes the list; anything typed can still be added as it is.
 */
import { Input } from "@cloudflare/kumo";
import { type KeyboardEvent, useEffect, useId, useState } from "react";
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
}

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
export const resetSuggestions = () => (cache.clear(), done.clear());

const scopeOf = (src: SuggestSource, dim: Dim) => (src.scope === "search" && dim in SEARCH_DIMS ? "search" : "traffic");
const cacheKey = (src: SuggestSource, dim: Dim, prefix: string) => [src.site, scopeOf(src, dim), dim, src.from, src.to, prefix].join("\n");

async function load(src: SuggestSource, dim: Dim, prefix: string): Promise<Answer> {
	const scope = scopeOf(src, dim);
	const ask = (from: string, to: string) =>
		queryReport(src.site, { report: "dimension_values", query: { from, to, filters: [], compare: "none" }, params: { dim, ...(scope === "search" ? { scope } : {}), ...(prefix ? { prefix } : {}) }, limit: SUGGEST_LIMIT });
	let res: Awaited<ReturnType<typeof ask>>;
	try {
		res = await ask(src.from, src.to);
	} catch (e) {
		// A range past the detailed window (or too large to read) is answered with a range that fits: ask that once, quietly.
		const fix = errorRange(errorText(e), src.to);
		if (!fix) throw e;
		res = await ask(fix.from, fix.to);
	}
	const rows = (res.data.rows ?? []).map((r) => ({ key: String(r.key ?? ""), count: typeof r.count === "number" ? r.count : null })).filter((r) => r.key !== "");
	return { rows, complete: rows.length < SUGGEST_LIMIT };
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
	const k = `${site}|${from}|${to}|${scope}|${dim}`;
	useEffect(() => {
		if (!on || site === undefined || !from || !to) return;
		const s: SuggestSource = { site, from, to, scope };
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
	}, [on, site, from, to, scope, dim, needle, k]);
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
	placeholder?: string;
	label?: string;
	maxLength?: number;
}

export function ValueInput({ dim, value, onChange, onPick, source, placeholder, label = "Value", maxLength = 512 }: ValueInputProps) {
	const id = useId();
	const listId = `${id}-values`;
	const [focused, setFocused] = useState(false);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const rows = useSuggestions(source, dim, value, focused);
	const shown = open && focused && rows.length > 0;
	// A new list starts with nothing highlighted, so Enter adds the typed text until an arrow key picks a row.
	useEffect(() => setActive(-1), [rows]);
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
				}}
				onBlur={() => {
					setFocused(false);
					setOpen(false);
				}}
				onKeyDown={onKeyDown}
			/>
			<ul
				id={listId}
				role="listbox"
				aria-label="Values in this range"
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
				{shown ? `${rows.length} ${rows.length === 1 ? "value" : "values"} in this range` : ""}
			</span>
		</span>
	);
}
