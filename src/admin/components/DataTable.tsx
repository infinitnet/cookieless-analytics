/**
 * Report table: sortable columns, click a value to add an `is` filter, compare deltas, paging. Columns with no value
 * in any row are left out; the body is one tab stop with arrow keys between its controls (roving tabindex).
 */
import { Button } from "@cloudflare/kumo";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import type { Dim } from "../../query/filters.js";
import { isBool, readPref, recordOf, writePref } from "../prefs.js";
import { ChangeCell } from "./Change.js";
import { count, fmt, type Format } from "./format.js";
import { type Caveat, type MenuCheck, Empty, InfoMark, Loading, ROW_MAIN, rowLink } from "./ui.js";

export interface Column {
	key: string;
	label: string;
	format?: Format;
	/** Clicking a value of this column adds `dim is value`. */
	dim?: Dim;
	/** Info marker next to the header. */
	caveat?: Caveat;
	/** Secondary line under the value. */
	note?: (row: TableRow) => string;
	/** Off until picked in the panel's column menu. */
	optional?: boolean;
}

/** Report value of a missing dimension; it is NULL in SQL, so an `is` filter on the label would match nothing. */
const NOT_SET = "(not set)";

export type TableRow = Record<string, unknown> & { key: string; previous?: Record<string, unknown> | null };

const blank = (v: unknown) => v == null || v === "";
/** The columns that hold a value in at least one row (side B of a segment comparison counts); the first column always stays. */
export const withData = (columns: readonly Column[], rows: readonly TableRow[]): Column[] =>
	rows.length ? columns.filter((c, i) => i === 0 || rows.some((r) => !blank(r[c.key]) || !blank((r.previous as Record<string, unknown> | null | undefined)?.[c.key]))) : [...columns];

const COLS_KEY = "cols.v1";
const colsMap = recordOf(recordOf(isBool));

/**
 * Column choice of report `id` in this browser (`ca.cols.v1`): the columns to show, and one menu check per column
 * with data. A column the visitor never touched follows its `optional` flag; at least one column besides the first stays.
 */
export function useColumns(id: string, columns: readonly Column[], rows: readonly TableRow[]): { columns: Column[]; checks: MenuCheck[] } {
	const [picks, setPicks] = useState<Record<string, boolean>>(() => readPref("local", COLS_KEY, colsMap)?.[id] ?? {});
	const offered = withData(columns, rows);
	const on = (c: Column) => picks[c.key] ?? !c.optional;
	const shown = offered.filter((c, i) => i === 0 || on(c));
	const pick = (key: string, value: boolean) => {
		const next = { ...picks, [key]: value };
		setPicks(next);
		// Read again before writing: other tables on the page keep their own choices in the same key.
		writePref("local", COLS_KEY, { ...readPref("local", COLS_KEY, colsMap), [id]: next });
	};
	const checks = offered.length > 2 ? offered.slice(1).map((c) => ({ label: c.label, checked: on(c), disabled: on(c) && shown.length <= 2, onChange: (v: boolean) => pick(c.key, v) })) : [];
	return { columns: shown, checks };
}

/** Funnel mark after a filterable value; shown on row hover and focus. */
const FilterMark = () => (
	<svg className="ca-filter-mark" viewBox="0 0 16 16" width={12} height={12} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
		<path d="M2 3h12l-4.5 5.5V13l-3 1.5v-6z" />
	</svg>
);

export interface DataTableProps {
	label: string;
	columns: readonly Column[];
	rows: readonly TableRow[];
	pageSize?: number;
	/** More rows exist on the server than were loaded. */
	truncated?: boolean | undefined;
	onFilter?: ((dim: Dim, value: string) => void) | undefined;
	loading?: boolean | undefined;
	/** One button per row after the columns, for example "Queries" on the Pages report. */
	action?: { label: string; onClick: (row: TableRow) => void } | undefined;
	/** Segment comparison: the names of sides A and B; numeric cells add the B value under the A value. */
	compareNames?: readonly [string, string] | undefined;
	/** The one action of the empty state (for example "Clear filters"). */
	emptyAction?: { label: string; onClick: () => void } | undefined;
}

/** Sort direction mark of a header; drawn, not a glyph. */
function SortMark({ dir }: { dir: "asc" | "desc" | null }) {
	return (
		<svg viewBox="0 0 10 10" width={10} height={10} aria-hidden="true" fill="currentColor" opacity={dir ? 1 : 0.35}>
			{dir !== "asc" && <path d="M2 6h6L5 9.5z" />}
			{dir !== "desc" && <path d="M2 4h6L5 .5z" />}
		</svg>
	);
}

/** Alignment by column type: text (the first column is the row's name) reads from the left, numbers line up on the right. */
const numCell = (c: Column, i: number) => (i > 0 && c.format !== "text" ? "ca-num" : undefined);

function compare(a: unknown, b: unknown): number {
	if (typeof a === "number" && typeof b === "number") return a - b;
	if (a == null) return b == null ? 0 : -1;
	if (b == null) return 1;
	return String(a).localeCompare(String(b));
}

export function DataTable({ label, columns: all, rows, pageSize = 25, truncated, onFilter, loading, action, compareNames, emptyAction }: DataTableProps) {
	const columns = withData(all, rows);
	const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
	const [page, setPage] = useState(0);
	// The body's one tab stop: [row on this page, control in that row].
	const [cur, setCur] = useState<readonly [number, number]>([0, 0]);
	useEffect(() => setPage(0), [rows]);
	const sorted = useMemo(() => {
		if (!sort) return rows;
		return [...rows].sort((a, b) => compare(a[sort.key], b[sort.key]) * (sort.desc ? -1 : 1));
	}, [rows, sort]);
	const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
	const p = Math.min(page, pages - 1);
	const shown = sorted.slice(p * pageSize, (p + 1) * pageSize);
	const toggle = (key: string) => {
		setPage(0);
		setSort((s) => (s?.key === key ? { key, desc: !s.desc } : { key, desc: true }));
	};
	const filterable = (c: Column, v: unknown): v is string => !!(c.dim && onFilter && typeof v === "string" && v !== "" && v !== NOT_SET);
	// Controls per row: the row itself when it opens something, then each filterable value.
	const stops = shown.map((r) => (action ? 1 : 0) + columns.filter((c) => filterable(c, r[c.key])).length);
	const ar = stops[cur[0]] ? cur[0] : stops.findIndex((n) => n > 0);
	const ac = Math.min(cur[1], (stops[ar] ?? 1) - 1);
	const stop = (r: number, c: number) => ({ "data-c": c, tabIndex: r === ar && c === ac ? 0 : -1 });
	const move = (e: KeyboardEvent<HTMLTableSectionElement>) => {
		const el = (e.target as HTMLElement).closest<HTMLElement>("[data-c]");
		const r0 = Number(el?.closest("tr")?.dataset.r);
		if (!el || Number.isNaN(r0)) return;
		let [r, c] = [r0, Number(el.dataset.c)];
		const step = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key];
		if (step) {
			do r += step;
			while (r >= 0 && r < stops.length && !stops[r]);
			if (!stops[r]) return;
		} else if (e.key === "ArrowRight") c++;
		else if (e.key === "ArrowLeft") c--;
		else if (e.key === "Home") c = 0;
		else if (e.key === "End") c = Infinity;
		else return;
		e.preventDefault();
		c = Math.max(0, Math.min(c, (stops[r] ?? 1) - 1));
		const tr = e.currentTarget.querySelector<HTMLElement>(`tr[data-r="${r}"]`);
		(tr?.dataset.c === String(c) ? tr : tr?.querySelector<HTMLElement>(`[data-c="${c}"]`))?.focus();
	};
	const follow = (e: { target: EventTarget }) => {
		const el = (e.target as HTMLElement).closest<HTMLElement>("[data-c]");
		const r = Number(el?.closest("tr")?.dataset.r);
		if (el && !Number.isNaN(r)) setCur([r, Number(el.dataset.c)]);
	};

	return (
		<div className="ca-table">
			{compareNames && rows.length > 0 && (
				<p className="ca-compare-names ca-small">
					Values of {compareNames[0]}, then {compareNames[1]} and the difference.
				</p>
			)}
			{rows.length === 0 ? (
				loading ? (
					<Loading />
				) : (
					<Empty hint="Try a longer date range, or remove a filter or segment." action={emptyAction} />
				)
			) : (
				<div className="ca-table-scroll">
					<table aria-label={label}>
						<thead>
							<tr>
								{columns.map((c, i) => (
									<th key={c.key} className={numCell(c, i)} aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}>
										<button type="button" className="ca-sort" onClick={() => toggle(c.key)}>
											{c.label}
											<SortMark dir={sort?.key === c.key ? (sort.desc ? "desc" : "asc") : null} />
										</button>
										{c.caveat && <InfoMark caveat={c.caveat} />}
									</th>
								))}
								{action && <th aria-label={action.label} />}
							</tr>
						</thead>
						<tbody onKeyDown={move} onFocus={follow}>
							{shown.map((r, ri) => {
								let n = action ? 1 : 0;
								return (
								<tr
									key={`${r.key}\u0000${String(r.ref ?? "")}`}
									data-r={ri}
									// The whole row opens the drill-down (click or Enter); filter buttons and other controls keep their own action.
									{...(action && { ...rowLink(() => action.onClick(r)), ...stop(ri, 0) })}
								>
									{columns.map((c, i) => {
										const v = r[c.key];
										const text = fmt(v, c.format);
										return (
											<td key={c.key} className={numCell(c, i)}>
												{filterable(c, v) ? (
													<button type="button" className="ca-linkbtn ca-cell-filter" title="Filter by this value" {...stop(ri, n++)} onClick={() => onFilter?.(c.dim as Dim, v)}>
														{text}
														<FilterMark />
													</button>
												) : (
													text
												)}
												{c.note && <div className="ca-cell-note">{c.note(r)}</div>}
												{compareNames && typeof v === "number" && (
													<div className="ca-side-b">
														{compareNames[1]}: {fmt(r.previous?.[c.key] ?? null, c.format)}
													</div>
												)}
												{i > 0 && <ChangeCell metric={c.key} value={v} prev={r.previous} format={c.format ?? "number"} />}
											</td>
										);
									})}
									{action && (
										<td className="ca-num">
											<Button size="xs" {...ROW_MAIN} aria-label={`${action.label}: ${r.key}`} onClick={() => action.onClick(r)}>
												{action.label}
											</Button>
										</td>
									)}
								</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
			{(pages > 1 || truncated) && (
				<div className="ca-table-foot">
					<div className="ca-pager">
						{truncated && <span>More rows exist; export for the full list.</span>}
						<Button size="sm" disabled={p === 0} onClick={() => setPage(p - 1)}>
							Previous
						</Button>
						<span>
							Page {count(p + 1)} of {count(pages)}
						</span>
						<Button size="sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
							Next
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
