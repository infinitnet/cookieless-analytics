/**
 * Annotation scope editor: simple mode (Site-wide, This page, This section) and advanced mode
 * (Host, Path and Query rule lists), the live summary, the validation messages verbatim and a debounced
 * preview of what the scope covers over the last 30 days.
 */
import { Button } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import {
	escapeRegex,
	KIND_OPS,
	MAX_SCOPE_RULES,
	MAX_SCOPE_RULES_PER_KIND,
	type Rule,
	type Scope,
	SCOPE_KINDS,
	SCOPE_MESSAGES,
	ScopeSchema,
	type ScopeKind,
	scopeSummary,
} from "../../annotations/scope.js";
import { call, errorText, withApiSite } from "../api.js";

type RowOp = Rule["op"] | "contains";
interface Row {
	op: RowOp;
	value: string;
}
type Rows = Record<ScopeKind, Row[]>;

const KIND_TITLES: Record<ScopeKind, string> = { host: "Host", path: "Path", query: "Query" };
const OP_LABELS: Record<RowOp, string> = { is: "is", prefix: "starts with", contains: "contains", regex: "regex" };
const PREVIEW_DELAY_MS = 400;

interface Part {
	count: number;
	sample: string[];
}
interface Preview {
	hosts: Part;
	pages: Part;
	queries: Part | null;
	notices: string[];
}

/** "contains" is written as an escaped regex; empty rows are left out. */
export function rowsToScope(rows: Rows): Scope {
	const out: Scope = { v: 1 };
	for (const k of SCOPE_KINDS) {
		const list = rows[k].filter((r) => r.value !== "").map((r): Rule => (r.op === "contains" ? { op: "regex", value: escapeRegex(r.value) } : { op: r.op, value: r.value }));
		if (list.length) out[k] = list;
	}
	return out;
}

const toRows = (scope: Scope | undefined): Rows => ({ host: [...(scope?.host ?? [])], path: [...(scope?.path ?? [])], query: [...(scope?.query ?? [])] });
const ruleCount = (rows: Rows) => SCOPE_KINDS.reduce((n, k) => n + rows[k].length, 0);

type Simple = "site" | "page" | "section";
/** The simple mode form of a scope, or null when it needs advanced mode. */
function simpleOf(scope: Scope | undefined): { mode: Simple; value: string } | null {
	if (!scope || SCOPE_KINDS.every((k) => !scope[k]?.length)) return { mode: "site", value: "" };
	const p = scope.path;
	if (scope.host?.length || scope.query?.length || p?.length !== 1) return null;
	const r = p[0] as Rule;
	return r.op === "is" ? { mode: "page", value: r.value } : r.op === "prefix" ? { mode: "section", value: r.value } : null;
}

export interface ScopeEditorProps {
	scope: Scope | undefined;
	onChange(scope: Scope | undefined): void;
	/** False while the scope is empty or invalid ("This page" without a path would save site-wide). */
	onValid?(valid: boolean): void;
}

export function ScopeEditor({ scope, onChange, onValid }: ScopeEditorProps) {
	const initial = simpleOf(scope);
	const [advanced, setAdvanced] = useState(initial === null);
	const [simple, setSimple] = useState<{ mode: Simple; value: string }>(initial ?? { mode: "site", value: "" });
	const [rows, setRows] = useState<Rows>(() => toRows(scope));
	const [preview, setPreview] = useState<Preview | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);

	const current: Scope = advanced ? rowsToScope(rows) : simple.mode === "site" ? { v: 1 } : { v: 1, path: [{ op: simple.mode === "page" ? "is" : "prefix", value: simple.value }] };
	const empty = advanced ? ruleCount(rows) === 0 || SCOPE_KINDS.every((k) => rows[k].every((r) => r.value === "")) : simple.mode !== "site" && simple.value === "";
	const check = ScopeSchema.safeParse(current);
	const messages = empty ? [SCOPE_MESSAGES.empty] : check.success ? [] : [...new Set(check.error.issues.map((i) => i.message))];
	const key = JSON.stringify(current);
	const valid = !empty && check.success;
	useEffect(() => onValid?.(valid), [valid]);

	const emit = (s: Scope) => onChange(SCOPE_KINDS.some((k) => s[k]?.length) ? s : undefined);
	const updateRows = (next: Rows) => {
		setRows(next);
		emit(rowsToScope(next));
	};
	const updateSimple = (next: { mode: Simple; value: string }) => {
		setSimple(next);
		emit(next.mode === "site" || !next.value ? { v: 1 } : { v: 1, path: [{ op: next.mode === "page" ? "is" : "prefix", value: next.value }] });
	};

	useEffect(() => {
		if (empty || !check.success) {
			setPreview(null);
			return;
		}
		let live = true;
		const t = setTimeout(() => {
			call<Preview>("annotations/preview", withApiSite({ scope: current, days: 30 })).then(
				(p) => {
					if (!live) return;
					setPreview(p);
					setPreviewError(null);
				},
				(e: unknown) => {
					if (!live) return;
					setPreview(null);
					setPreviewError(errorText(e));
				},
			);
		}, PREVIEW_DELAY_MS);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [key]);

	const total = ruleCount(rows);
	const fitsSimple = simpleOf(rowsToScope(rows)) !== null;
	return (
		<fieldset className="ca-scope" aria-label="Scope">
			<legend>Scope</legend>
			{advanced ? (
				<>
					{SCOPE_KINDS.map((k) => (
						<fieldset key={k} aria-label={`${KIND_TITLES[k]} rules`}>
							<legend>{KIND_TITLES[k]}</legend>
							{rows[k].map((r, i) => (
								<div key={i}>
									<select
										aria-label={`${KIND_TITLES[k]} rule ${i + 1} operator`}
										value={r.op}
										onChange={(e) => updateRows({ ...rows, [k]: rows[k].map((x, j) => (j === i ? { ...x, op: e.target.value as RowOp } : x)) })}
									>
										{[...KIND_OPS[k].filter((o) => o !== "regex"), "contains" as const, "regex" as const].map((o) => (
											<option key={o} value={o}>
												{OP_LABELS[o]}
											</option>
										))}
									</select>{" "}
									<input
										aria-label={`${KIND_TITLES[k]} rule ${i + 1} value`}
										value={r.value}
										onChange={(e) => updateRows({ ...rows, [k]: rows[k].map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
									/>{" "}
									<Button variant="secondary-destructive" size="sm" onClick={() => updateRows({ ...rows, [k]: rows[k].filter((_, j) => j !== i) })}>
										Remove {KIND_TITLES[k].toLowerCase()} rule {i + 1}
									</Button>
								</div>
							))}
							<Button variant="primary" size="sm"
								disabled={rows[k].length >= MAX_SCOPE_RULES_PER_KIND || total >= MAX_SCOPE_RULES}
								onClick={() => updateRows({ ...rows, [k]: [...rows[k], { op: "is", value: "" }] })}
							>
								Add {KIND_TITLES[k].toLowerCase()} rule
							</Button>
						</fieldset>
					))}
					{SCOPE_KINDS.some((k) => rows[k].length >= MAX_SCOPE_RULES_PER_KIND) || total >= MAX_SCOPE_RULES ? <p role="status">{SCOPE_MESSAGES.count}</p> : null}
					{fitsSimple && (
						<button
							type="button"
							className="ca-linkbtn"
							onClick={() => {
								const s = simpleOf(rowsToScope(rows)) ?? { mode: "site" as const, value: "" };
								setAdvanced(false);
								updateSimple(s);
							}}
						>
							Back to simple
						</button>
					)}
				</>
			) : (
				<>
					<div role="radiogroup" aria-label="Where it applies">
						{(
							[
								["site", "Site-wide"],
								["page", "This page"],
								["section", "This section"],
							] as const
						).map(([m, l]) => (
							<label key={m} className="ca-check ca-check-inline">
								<input type="radio" name="ca-scope-mode" checked={simple.mode === m} onChange={() => updateSimple({ mode: m, value: m === "site" ? "" : simple.value })} /> {l}
							</label>
						))}
					</div>
					{simple.mode !== "site" && (
						<label>
							{simple.mode === "page" ? "Page path" : "Section prefix"}{" "}
							<input value={simple.value} placeholder={simple.mode === "page" ? "/blog/post" : "/blog/"} onChange={(e) => updateSimple({ ...simple, value: e.target.value })} />
						</label>
					)}{" "}
					<button
						type="button"
						className="ca-linkbtn"
						onClick={() => {
							const next = toRows(current.path?.length ? current : undefined);
							setRows(next);
							setAdvanced(true);
						}}
					>
						Advanced
					</button>
				</>
			)}
			<p data-testid="scope-summary">{empty ? "Site-wide" : scopeSummary(current)}</p>
			{messages.map((m) => (
				<p key={m} role="alert" className="ca-field-error">
					{m}
				</p>
			))}
			{previewError && (
				<p role="alert" className="ca-small">
					{previewError}
				</p>
			)}
			{preview && <PreviewPanel p={preview} />}
		</fieldset>
	);
}

function PreviewPanel({ p }: { p: Preview }) {
	const parts = [`${p.hosts.count} hosts`, `${p.pages.count} pages`, ...(p.queries ? [`${p.queries.count} queries`] : [])];
	const samples = [...p.pages.sample, ...(p.queries?.sample ?? [])];
	return (
		<div role="status" aria-label="Scope preview" className="ca-small">
			<p>{parts.join(", ")} in the last 30 days</p>
			{samples.length > 0 && (
				<ul>
					{samples.map((s) => (
						<li key={s}>{s}</li>
					))}
				</ul>
			)}
			{p.notices.includes("scope_no_search_source") && <p>{SCOPE_MESSAGES.noSource}</p>}
		</div>
	);
}
