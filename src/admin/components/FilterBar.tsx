/** Filter chips: operator menu, include and exclude, regex behind "Advanced" with live validation, save as segment. */
import { Button, Input } from "@cloudflare/kumo";
import { useState } from "react";
import { normalizeCurrency } from "../../core/currency.js";
import { type Dim, type Filter, MAX_FILTERS, MAX_VALUES, NEGATED, type Op, REVENUE_VALUE_RE } from "../../query/filters.js";
import { validateSafeRegex } from "../../query/safe-regex.js";
import { Disclosure } from "./ui.js";

export const DIM_LABELS: Partial<Record<Dim, string>> = {
	page: "Page",
	entry: "Entry page",
	exit: "Exit page",
	channel: "Channel",
	source: "Source",
	ref_host: "Referrer",
	utm_source: "UTM source",
	utm_medium: "UTM medium",
	utm_campaign: "UTM campaign",
	utm_term: "UTM term",
	utm_content: "UTM content",
	host: "Host",
	country: "Country",
	region: "Region",
	device: "Device",
	browser: "Browser",
	os: "OS",
	lang: "Language",
	event: "Event",
	event_prop: "Event property",
	goal: "Goal",
	// "Revenue at least" adds `revenue gte`, in the site's default currency.
	revenue: "Revenue at least",
	currency: "Currency",
};
const NUM_TEXT: Partial<Record<Op, string>> = { gt: "more than", gte: "at least", lt: "less than", lte: "at most" };
/** Chips of these dims have no operator menu (revenue compares numbers, currency is a code). */
const FIXED_OP: ReadonlySet<string> = new Set(["revenue", "currency"]);

/** The filter the add form makes from a typed value, or null when the value does not fit the dim. */
export function addFilter(filters: readonly Filter[], dim: Dim, value: string): Filter[] | null {
	if (dim === "revenue") {
		if (!REVENUE_VALUE_RE.test(value) || filters.length >= MAX_FILTERS) return null;
		return [...filters.filter((f) => f.dim !== "revenue"), { dim: "revenue", op: "gte", values: [value] }];
	}
	if (dim === "currency") {
		const c = normalizeCurrency(value);
		return c ? addIs(filters, "currency", c) : null;
	}
	return addIs(filters, dim, value);
}
/** Dims offered in the add menus (event properties need a key and come from the Behaviour page). */
const ADDABLE = (Object.keys(DIM_LABELS) as Dim[]).filter((d) => d !== "event_prop");

type BaseOp = "is" | "contains" | "prefix" | "regex";
const BASE_OPS: ReadonlyArray<readonly [BaseOp, string]> = [
	["is", "is"],
	["contains", "contains"],
	["prefix", "starts with"],
	["regex", "matches regex"],
];
const NEG: Record<BaseOp, Op> = { is: "is_not", contains: "not_contains", prefix: "not_prefix", regex: "not_regex" };
const baseOf = (op: Op): BaseOp => (op === "is_not" ? "is" : op.replace(/^not_/, "")) as BaseOp;
const isExclude = (op: Op) => NEGATED.has(op);
const opFor = (base: BaseOp, exclude: boolean): Op => (exclude ? NEG[base] : base);

/** Add `dim is value`: merges into an existing include `is` chip of the same dim. */
export function addIs(filters: readonly Filter[], dim: Dim, value: string): Filter[] {
	const i = filters.findIndex((f) => f.dim === dim && f.op === "is" && !f.prop);
	if (i >= 0) {
		const f = filters[i] as Filter;
		if (f.values.includes(value) || f.values.length >= MAX_VALUES) return [...filters];
		return filters.map((x, j) => (j === i ? { ...f, values: [...f.values, value] } : x));
	}
	return filters.length >= MAX_FILTERS ? [...filters] : [...filters, { dim, op: "is", values: [value] }];
}

/** Change the operator, keeping include or exclude. */
export const withBaseOp = (f: Filter, base: BaseOp): Filter => ({ ...f, op: opFor(base, isExclude(f.op)) });
/** Flip include and exclude, keeping the operator. */
export const toggleExclude = (f: Filter): Filter => ({ ...f, op: opFor(baseOf(f.op), !isExclude(f.op)) });

/** Live check for the Advanced regex input; null when valid. */
export function regexError(pattern: string): string | null {
	if (!pattern) return null;
	const r = validateSafeRegex(pattern, "i");
	return r.ok ? null : r.error;
}

export function chipText(f: Filter): string {
	if (f.dim === "revenue") return `Revenue ${NUM_TEXT[f.op] ?? f.op} ${f.values[0] ?? ""}${f.prop ? ` ${f.prop}` : ""}`;
	const op = BASE_OPS.find(([b]) => b === baseOf(f.op))?.[1] ?? f.op;
	const dim = f.dim === "event_prop" ? `Property ${f.prop ?? ""}` : (DIM_LABELS[f.dim] ?? f.dim);
	return `${dim} ${isExclude(f.op) ? "not " : ""}${op} ${f.values.join(", ")}`;
}

export interface FilterBarProps {
	filters: readonly Filter[];
	onChange: (filters: Filter[]) => void;
	onSaveSegment?: ((name: string) => void) | undefined;
	/** Dims the reports could not apply (summary data), with the reason shown on the chip. */
	disabled?: ReadonlyMap<string, string> | undefined;
	/** The dims offered (all addable dims by default). */
	dims?: readonly Dim[] | undefined;
}

export function FilterBar({ filters, onChange, onSaveSegment, disabled, dims }: FilterBarProps) {
	const [dim, setDim] = useState<Dim>(dims?.[0] ?? "page");
	const [value, setValue] = useState("");
	const [rxDim, setRxDim] = useState<Dim>(dims?.[0] ?? "page");
	const [rx, setRx] = useState("");
	const [segName, setSegName] = useState("");
	const rxErr = regexError(rx);
	const replace = (i: number, f: Filter) => onChange(filters.map((x, j) => (j === i ? f : x)));
	const full = filters.length >= MAX_FILTERS;

	return (
		<div className="ca-filterbar">
			{filters.map((f, i) => (
				<span key={i} className="ca-chip" data-dim={f.dim} data-op={f.op} data-off={disabled?.has(f.dim) ? "true" : undefined} title={disabled?.get(f.dim)}>
					<span className="ca-chip-text">{chipText(f)}</span>
					{disabled?.has(f.dim) && <span className="ca-sr">Not applied: {disabled.get(f.dim)}</span>}
					{!FIXED_OP.has(f.dim) && (
						<select aria-label="Operator" value={baseOf(f.op)} onChange={(e) => replace(i, withBaseOp(f, e.target.value as BaseOp))}>
							{BASE_OPS.map(([b, label]) => (
								<option key={b} value={b} disabled={b === "regex" && f.values.some((v) => regexError(v) !== null)}>
									{label}
								</option>
							))}
						</select>
					)}
					{f.dim !== "revenue" && (
						<Button size="xs" variant="ghost" onClick={() => replace(i, toggleExclude(f))}>
							{isExclude(f.op) ? "Include" : "Exclude"}
						</Button>
					)}
					<Button size="xs" variant="ghost" shape="square" aria-label={`Remove ${chipText(f)}`} onClick={() => onChange(filters.filter((_, j) => j !== i))}>
						<svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
							<path d="M4 4l8 8M12 4l-8 8" />
						</svg>
					</Button>
				</span>
			))}
			<form
				className="ca-filter-add"
				onSubmit={(e) => {
					e.preventDefault();
					const next = value.trim() ? addFilter(filters, dim, value.trim()) : null;
					if (next) onChange(next);
					setValue("");
				}}
			>
				<DimSelect label="Dimension" value={dim} onChange={setDim} dims={dims} />
				<Input aria-label="Value" value={value} maxLength={512} onChange={(e) => setValue(e.target.value)} placeholder={dim === "revenue" ? "50" : dim === "currency" ? "EUR" : "Value to match"} />
				<Button type="submit" disabled={full || !value.trim()}>
					Add filter
				</Button>
			</form>
			<Disclosure label="Advanced" className="ca-advanced">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (!rx || rxErr || full) return;
						onChange([...filters, { dim: rxDim, op: "regex", values: [rx] }]);
						setRx("");
					}}
				>
					<DimSelect label="Regex dimension" value={rxDim} onChange={setRxDim} regex dims={dims} />
					<Input aria-label="Regular expression" aria-invalid={rxErr !== null} variant={rxErr ? "error" : "default"} value={rx} maxLength={200} onChange={(e) => setRx(e.target.value)} placeholder="^/blog/" />
					<Button type="submit" disabled={!rx || rxErr !== null || full}>
						Add regex
					</Button>
					{rxErr && (
						<span className="ca-regex-error ca-field-error" role="alert">
							{rxErr}
						</span>
					)}
				</form>
			</Disclosure>
			{onSaveSegment && filters.length > 0 && (
				<form
					className="ca-save-segment"
					onSubmit={(e) => {
						e.preventDefault();
						if (segName.trim()) onSaveSegment(segName.trim());
						setSegName("");
					}}
				>
					<Input aria-label="Segment name" value={segName} maxLength={64} onChange={(e) => setSegName(e.target.value)} placeholder="Segment name" />
					<Button type="submit" disabled={!segName.trim()}>
						Save as segment
					</Button>
				</form>
			)}
		</div>
	);
}

function DimSelect({ label, value, onChange, regex, dims }: { label: string; value: Dim; onChange: (d: Dim) => void; regex?: boolean; dims?: readonly Dim[] | undefined }) {
	return (
		<select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Dim)}>
			{(dims ?? ADDABLE).filter((d) => !regex || !FIXED_OP.has(d)).map((d) => (
				<option key={d} value={d}>
					{DIM_LABELS[d]}
				</option>
			))}
		</select>
	);
}
