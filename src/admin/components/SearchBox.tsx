/** A search field with a clear button; `onSearch` runs once typing pauses for `SEARCH_DEBOUNCE_MS`, and at once on clear. */
import { useEffect, useId, useState } from "react";

/** Typing waits this long before the search runs. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface SearchBoxProps {
	/** The applied term; the field follows it when it changes from outside (Back, a link, a reset). */
	value: string;
	onSearch(q: string): void;
	placeholder: string;
	/** Name of the search landmark; the field's visible label is "Search". */
	label?: string;
	clearLabel?: string;
}

export function SearchBox({ value, onSearch, placeholder, label = "Search", clearLabel = "Clear search" }: SearchBoxProps) {
	const id = useId();
	const [text, setText] = useState(value);
	// The term changed from outside: show it, unless it is what the field already holds.
	useEffect(() => {
		if (value !== text.trim()) setText(value);
	}, [value]);
	useEffect(() => {
		const q = text.trim();
		if (q === value) return;
		const t = setTimeout(() => onSearch(q), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [text]);
	return (
		<span className="ca-field-wrap" role="search" aria-label={label}>
			<span className="ca-field">
				<label className="ca-field-label" htmlFor={id}>
					Search
				</label>
				<span className="ca-search-box">
					<input id={id} type="search" value={text} maxLength={100} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
					{text && (
						<button type="button" className="ca-search-clear" aria-label={clearLabel} onClick={() => (setText(""), onSearch(""))}>
							<span aria-hidden="true">×</span>
						</button>
					)}
				</span>
			</span>
		</span>
	);
}

/** Case-insensitive literal substring match of `q` in any of `texts`; an empty term matches everything. */
export const matchesText = (q: string, texts: readonly unknown[]): boolean => {
	const needle = q.trim().toLowerCase();
	return !needle || texts.some((t) => typeof t === "string" && t.toLowerCase().includes(needle));
};

/** A settings list longer than this gets a search box. */
export const LIST_SEARCH_OVER = 10;

/** The empty state of a search that matched nothing, with the way back. */
export const noMatch = (q: string, clear: () => void) => ({ text: `Nothing matches "${q}".`, action: { label: "Clear search", onClick: clear } });
