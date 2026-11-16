/**
 * Annotations page: the range's annotations as rows, newest first, each with the impact on its target KPI over
 * equal windows before and after (one `annotation_impacts` call per page of 7), an editor with the target
 * picker, and the full impact panel of one row (`?a=<id>`, `?a=date` for any date). Window: `?win=`, else the
 * stored preference, else 14 days.
 */
import { Badge, Button } from "@cloudflare/kumo";
import { Fragment, useEffect, useRef, useState } from "react";
import { KIND_LABELS, type Scope } from "../../annotations/scope.js";
import { type Target, TargetSchema, type Verdict, VERDICT_WORDS } from "../../annotations/target.js";
import { ARROW } from "../../charts/change.js";
import { type Format, fmt } from "../../charts/geometry.js";
import { dayInZone, zonedToEpoch } from "../../core/time.js";
import { deleteConfig, errorText, listConfig, saveConfig, useReport, useSearchStatus } from "../api.js";
import { isRemote, Shell, toQuery, type View } from "../components/Header.js";
import { count } from "../components/format.js";
import { GROUP_HINTS, IMPACT_OPTIONS, ImpactPanel, KeyInput, type KeyKind, optionId, optionOf, targetLabel, targetOf, TargetSelect } from "../components/ImpactPanel.js";
import { ErrorScope, ReportError } from "../components/ReportNotices.js";
import { ScopeEditor } from "../components/ScopeEditor.js";
import { Empty, Loading, Notice, Segmented } from "../components/ui.js";
import { readPref, writePref } from "../prefs.js";
import { ANNOTATION_WINDOWS, type ImpactWindow } from "../state.js";
import { Field, RemoteNotice } from "./Config.js";

export const DEFAULT_WINDOW: ImpactWindow = 14;
/** Rows per call, `MAX_IMPACT_ROWS` (the server caps it further on the small capacity profile). */
export const PAGE_SIZE = 6;
const WIN_PREF = "annotations.win.v1";
const parseWin = (v: unknown) => ((ANNOTATION_WINDOWS as readonly unknown[]).includes(v) ? (v as ImpactWindow) : undefined);

/** The window of the page: the URL, else this browser's preference, else 14 days. */
export const windowOf = (win: ImpactWindow | undefined): ImpactWindow => win ?? readPref("local", WIN_PREF, parseWin) ?? DEFAULT_WINDOW;

export const ANNOTATIONS_TEXT = {
	caution: "Impact compares equal windows before and after each annotation; it shows what changed, not that the annotation caused it.",
	emptyTitle: "No annotations in this range yet.",
	emptyHint: "An annotation marks a change on a date, such as a release, a new page or a campaign. Add one and this page compares the days before and after it.",
	noMatch: "No annotations match these filters in this range.",
	add: "Add annotation",
	anyDate: "Impact of a date",
	searchLag: (d: string) => `Search data is final up to ${d}; windows of Search targets end there.`,
	dayOf: (n: number, w: number) => `Day ${n} of ${w}`,
	overlaps: (t: string) => `Overlaps with ${t}`,
	overlapsMore: (t: string, n: number) => `Overlaps with ${t} and ${n} more`,
	overlapHint: "Another change on the same scope falls in these windows, so their effects cannot be separated.",
	defaultTarget: "Default: visitors of the scope",
	targetHint: "One KPI per annotation. Without one, the page measures visitors of the scope (Search clicks for a query scope).",
	searchOff: "Search target, but no Search data is connected.",
} as const;

const KINDS = [["", "All kinds"], ["manual", "Manual"], ["publish", "Published"], ["update", "Updated"], ["release", "Release"]] as const;
const SCOPE_KINDS = [["", "Any scope"], ["site", "Site-wide"], ["path", "Pages"], ["host", "Hosts"], ["query", "Search queries"]] as const;

interface Ann {
	id?: string;
	ts: number;
	day: string;
	kind: "manual" | "publish" | "update" | "release";
	text: string;
	scope: Scope | null;
	summary: string;
	target: Target | null;
}
export interface ImpactRow {
	key: string;
	annotation: Ann;
	target: Target;
	target_default: boolean;
	window: number;
	days_after: number;
	complete?: boolean;
	not_yet?: string;
	periods?: { before: { from: string; to: string }; after: { from: string; to: string } };
	before?: number | null;
	after?: number | null;
	delta_pct?: number | null;
	currency?: string | null;
	verdict: Verdict;
	good: boolean | null;
	overlaps: Array<{ id: string | null; day: string; text: string }>;
	notices?: string[];
}

const formatOf = (r: Pick<ImpactRow, "target" | "currency">): Format => (r.target.metric === "revenue" && r.currency ? `money:${r.currency}` : (optionOf(r.target)?.[4] ?? "number"));

/** Tooltip of the impact cell: both values and both windows. */
export function impactTitle(r: ImpactRow): string {
	if (!r.periods) return r.not_yet ? `The first day after the annotation is complete on ${r.not_yet}.` : VERDICT_WORDS[r.verdict];
	const f = formatOf(r);
	const { before, after } = r.periods;
	return `Before ${fmt(r.before ?? null, f)} (${before.from} to ${before.to}), after ${fmt(r.after ?? null, f)} (${after.from} to ${after.to}), ${r.days_after} days each.`;
}

/** Arrow, percent and the plain word; Too early shows the day count and no verdict. Colour from `good`, so a fall in bounce reads as good news. */
export function ImpactMark({ r }: { r: ImpactRow }) {
	const title = impactTitle(r);
	if (r.verdict === "too_early")
		return (
			<span className="ca-delta" data-muted="true" title={title}>
				{r.days_after > 0 ? ANNOTATIONS_TEXT.dayOf(r.days_after, r.window) : VERDICT_WORDS.too_early}
			</span>
		);
	if (r.verdict === "no_data")
		return (
			<span className="ca-delta" data-muted="true" title={title}>
				{VERDICT_WORDS.no_data}
			</span>
		);
	const dir = r.verdict === "flat" ? "flat" : r.verdict;
	const pct = r.delta_pct == null ? "" : `${r.delta_pct > 0 ? "+" : ""}${(r.delta_pct * 100).toFixed(1)}% `;
	return (
		<span className="ca-delta" data-judge={r.good === true ? "better" : r.good === false ? "worse" : undefined} title={title}>
			<span className="ca-delta-arrow" aria-hidden="true">
				{ARROW[dir]}
			</span>
			{pct}
			{VERDICT_WORDS[r.verdict]}
			{r.good !== null && <span className="ca-sr-only">, {r.good ? "better" : "worse"}</span>}
		</span>
	);
}

interface Draft {
	id?: string;
	ts: number;
	kind: Ann["kind"];
	text: string;
	scope?: Scope;
	/** Option id of the target, empty for the default. */
	choice: string;
	key: string;
	source?: Target["params"];
	/** Fields the content hook stored (source item, slug), sent back unchanged. */
	keep: Record<string, unknown>;
}

function draftOf(a: Ann): Draft {
	const { id, ts: _t, day: _d, kind: _k, text: _x, scope: _s, summary: _m, target: _g, ...keep } = a as Ann & Record<string, unknown>;
	return {
		...(id ? { id } : {}),
		ts: a.ts,
		kind: a.kind,
		text: a.text,
		...(a.scope ? { scope: a.scope } : {}),
		choice: a.target ? optionId(optionOf(a.target) ?? (IMPACT_OPTIONS[0] as (typeof IMPACT_OPTIONS)[number])) : "",
		key: a.target?.params?.goal ?? a.target?.params?.key ?? "",
		...(a.target?.params ? { source: a.target.params } : {}),
		keep,
	};
}

/** The stored target of a draft: undefined for the default; the extra params (source, currency, prop) of an unchanged target stay. */
export function draftTarget(d: Pick<Draft, "choice" | "key" | "source">): Target | undefined {
	const o = IMPACT_OPTIONS.find((x) => optionId(x) === d.choice);
	if (!o) return undefined;
	const t = targetOf(o, d.key);
	const { key: _k, goal: _g, ...rest } = d.source ?? {};
	return Object.keys(rest).length ? { ...t, params: { ...t.params, ...rest } } : t;
}

function Editor({ draft, tz, searchOn, goals, onCancel, onSaved }: { draft: Draft; tz: string; searchOn: boolean; goals: ReadonlyMap<string, string>; onCancel(): void; onSaved(): void }) {
	const [d, setD] = useState(draft);
	const [scopeValid, setScopeValid] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const opt = IMPACT_OPTIONS.find((o) => optionId(o) === d.choice);
	const target = draftTarget(d);
	const check = target ? TargetSchema.safeParse(target) : null;
	const targetError = check && !check.success ? (check.error.issues[0]?.message ?? null) : null;
	const save = async () => {
		setError(null);
		try {
			await saveConfig("annotations", { ts: d.ts, kind: d.kind, text: d.text, ...(d.scope ? { scope: d.scope } : {}), ...(target ? { target } : {}), ...d.keep }, d.id);
			onSaved();
		} catch (e) {
			setError(errorText(e));
		}
	};
	return (
		// Not a <form>: the scope editor holds forms of its own.
		<div role="form" className="ca-panel" aria-label={d.id ? "Edit annotation" : "New annotation"}>
			{error && <Notice tone="error">{error}</Notice>}
			{/* Noon in the site timezone keeps the marker on the chosen day. */}
			<Field label="Date">
				<input type="date" value={dayInZone(d.ts, tz)} onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setD({ ...d, ts: zonedToEpoch(e.target.value, 12, tz) })} />
			</Field>
			<Field label="Text">
				<input value={d.text} maxLength={200} onChange={(e) => setD({ ...d, text: e.target.value })} />
			</Field>
			<span className="ca-small">Kind: {KIND_LABELS[d.kind] ?? d.kind}</span>
			<ScopeEditor
				scope={d.scope}
				onChange={(scope) => {
					const { scope: _old, ...rest } = d;
					setD(scope ? { ...rest, scope } : rest);
				}}
				onValid={setScopeValid}
			/>
			<Field label="Target KPI" error={targetError}>
				<TargetSelect label="Target KPI" value={d.choice} searchOn={searchOn || opt?.[5] === "search"} defaultLabel={ANNOTATIONS_TEXT.defaultTarget} onChange={(choice) => setD({ ...d, choice, key: "" })} />
			</Field>
			{opt?.[5] && opt[5] !== "search" && <KeyInput kind={opt[5] as KeyKind} value={d.key} goals={goals} onChange={(key) => setD({ ...d, key })} />}
			<p className="ca-small">{opt ? GROUP_HINTS[opt[0]] : ANNOTATIONS_TEXT.targetHint}</p>
			<div className="ca-actions">
				<Button variant="primary" size="sm" disabled={!d.text.trim() || !!targetError || !scopeValid} onClick={() => void save()}>
					Save
				</Button>
				<Button size="sm" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</div>
	);
}

/** Goal names by id, for the target picker and the target column. */
function useGoals(): ReadonlyMap<string, string> {
	const [goals, setGoals] = useState<ReadonlyMap<string, string>>(new Map());
	useEffect(() => {
		let live = true;
		listConfig<{ name: string }>("goals").then(
			(r) => live && setGoals(new Map(r.items.map((i) => [i.id, i.data.name]))),
			() => undefined,
		);
		return () => {
			live = false;
		};
	}, []);
	return goals;
}

function Row({ r, open, view, searchOn, goals, onToggle, onEdit, onDeleted }: { r: ImpactRow; open: boolean; view: View; searchOn: boolean; goals: ReadonlyMap<string, string>; onToggle(): void; onEdit(): void; onDeleted(): void }) {
	const [armed, setArmed] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ref = useRef<HTMLTableRowElement>(null);
	const a = r.annotation;
	// A deep link (`?a=<id>`) scrolls its row into view once.
	useEffect(() => {
		if (open) ref.current?.scrollIntoView?.({ block: "nearest" });
	}, []);
	const first = r.overlaps[0];
	return (
		<>
			<tr ref={ref} data-open={open ? "true" : undefined}>
				<td>{a.day}</td>
				<td>{KIND_LABELS[a.kind] ?? a.kind}</td>
				<td>
					{a.text}
					{first && (
						<span className="ca-small ca-overlap" title={ANNOTATIONS_TEXT.overlapHint}>
							{r.overlaps.length > 1 ? ANNOTATIONS_TEXT.overlapsMore(first.text, r.overlaps.length - 1) : ANNOTATIONS_TEXT.overlaps(first.text)}
						</span>
					)}
				</td>
				<td>
					{a.summary}
					{a.scope?.query?.length ? (
						<Badge variant="info" className="ca-badge">
							Search charts only
						</Badge>
					) : null}
				</td>
				<td>
					{targetLabel(r.target, goals)}
					{r.target_default && <span className="ca-sr-only"> (default)</span>}
				</td>
				<td>
					<ImpactMark r={r} />
				</td>
				<td>
					<div className="ca-actions ca-row-actions">
						<Button size="sm" aria-expanded={open} onClick={onToggle}>
							{open ? "Hide" : "Details"}
						</Button>
						<Button size="sm" onClick={onEdit}>
							Edit
						</Button>
						{armed && a.id ? (
							<Button variant="primary" size="sm" onClick={() => void deleteConfig("annotations", a.id as string).then(onDeleted, (e: unknown) => setError(errorText(e)))}>
								Confirm delete
							</Button>
						) : (
							<Button variant="secondary-destructive" size="sm" onClick={() => setArmed(true)}>
								Delete
							</Button>
						)}
					</div>
					{error && <Notice tone="error">{error}</Notice>}
				</td>
			</tr>
			{open && a.id && (
				<tr className="ca-impact-row">
					<td colSpan={7}>
						{first && <Notice tone="warning">{ANNOTATIONS_TEXT.overlapHint}</Notice>}
						{r.notices?.includes("search_no_data") && <Notice tone="info">{ANNOTATIONS_TEXT.searchOff}</Notice>}
						<ImpactPanel view={view} annotation={a.id} target={r.target} window={r.window} searchOn={searchOn || r.target.report.startsWith("search_")} goals={goals} />
					</td>
				</tr>
			)}
		</>
	);
}

function Body({ view }: { view: View }) {
	const { state, site, tz, update } = view;
	const win = windowOf(state.win);
	const [kind, setKind] = useState("");
	const [scopeKind, setScopeKind] = useState("");
	// The paging offset belongs to its range: a new range starts at the first row.
	const range = `${state.from}:${state.to}`;
	const [paged, setPaged] = useState({ range, offset: 0 });
	const offset = paged.range === range ? paged.offset : 0;
	const setOffset = (o: number) => setPaged({ range, offset: o });
	const [edit, setEdit] = useState<Draft | null>(null);
	const searchOn = (useSearchStatus(site).status?.usable.length ?? 0) > 0;
	const goals = useGoals();
	const res = useReport(site.id, {
		report: "annotation_impacts",
		query: toQuery(state, "annotation_impacts"),
		params: { window: win, withSearch: true, ...(kind ? { kind: kind as Ann["kind"] } : {}), ...(scopeKind ? { scopeKind: scopeKind as "site" } : {}) },
		limit: PAGE_SIZE,
		offset,
	});
	const data = res.data?.data as { rows?: ImpactRow[]; total?: number; limit?: number; search_through?: string } | undefined;
	const rows = data?.rows ?? [];
	const total = data?.total ?? 0;
	const limit = data?.limit ?? PAGE_SIZE;
	const filtered = !!kind || !!scopeKind;
	const setWin = (w: ImpactWindow) => {
		writePref("local", WIN_PREF, w);
		update({ win: w === DEFAULT_WINDOW ? undefined : w });
	};
	const toggle = (id: string) => update({ a: state.a === id ? undefined : id });
	const blank = (): Draft => ({ ts: zonedToEpoch(dayInZone(Math.floor(Date.now() / 1000), tz), 12, tz), kind: "manual", text: "", choice: "", key: "", keep: {} });
	const add = () => setEdit(blank());
	const saved = () => {
		setEdit(null);
		res.reload?.();
	};
	return (
		<>
			<p className="ca-small">{ANNOTATIONS_TEXT.caution}</p>
			<div className="ca-row-end">
				<Segmented radio label="Window" value={String(win)} options={ANNOTATION_WINDOWS.map((w) => [String(w), `${w} days`] as const)} onChange={(v) => setWin(Number(v) as ImpactWindow)} />
				<Field label="Kind">
					<select value={kind} onChange={(e) => (setKind(e.target.value), setOffset(0))}>
						{KINDS.map(([v, l]) => (
							<option key={v} value={v}>
								{l}
							</option>
						))}
					</select>
				</Field>
				<Field label="Scope">
					<select value={scopeKind} onChange={(e) => (setScopeKind(e.target.value), setOffset(0))}>
						{SCOPE_KINDS.map(([v, l]) => (
							<option key={v} value={v}>
								{l}
							</option>
						))}
					</select>
				</Field>
				<Button variant="primary" size="sm" disabled={edit !== null} onClick={add}>
					{ANNOTATIONS_TEXT.add}
				</Button>
				<Button size="sm" onClick={() => update({ a: "date" })}>
					{ANNOTATIONS_TEXT.anyDate}
				</Button>
			</div>
			{data?.search_through && <Notice tone="info">{ANNOTATIONS_TEXT.searchLag(data.search_through)}</Notice>}
			{state.a === "date" && (
				<div className="ca-panel">
					<ImpactPanel view={view} annotation={null} window={win} searchOn={searchOn} goals={goals} onClose={() => update({ a: undefined })} />
				</div>
			)}
			{/* A deep link (`?a=<id>`) to an annotation outside this page of rows opens its panel here. */}
			{state.a && state.a !== "date" && res.data && !rows.some((r) => r.annotation.id === state.a) && (
				<div className="ca-panel">
					<ImpactPanel view={view} annotation={state.a} window={win} searchOn={searchOn} goals={goals} onClose={() => update({ a: undefined })} />
				</div>
			)}
			{edit && <Editor key={edit.id ?? "new"} draft={edit} tz={tz} searchOn={searchOn} goals={goals} onCancel={() => setEdit(null)} onSaved={saved} />}
			{res.error ? (
				<ReportError error={res.error} view={view} />
			) : !res.data ? (
				<Loading />
			) : rows.length === 0 ? (
				filtered ? <Empty>{ANNOTATIONS_TEXT.noMatch}</Empty> : <Empty hint={ANNOTATIONS_TEXT.emptyHint} {...(edit ? {} : { action: { label: ANNOTATIONS_TEXT.add, onClick: add } })}>{ANNOTATIONS_TEXT.emptyTitle}</Empty>
			) : (
				<>
					<div className="ca-table-scroll">
						<table aria-label="Annotations" className="ca-annotations">
							<thead>
								<tr>
									<th>Date</th>
									<th>Kind</th>
									<th>Title</th>
									<th>Scope</th>
									<th>Target</th>
									<th>Impact ({win} days)</th>
									<th>
										<span className="ca-sr">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => (
									<Fragment key={r.key}>
										<Row r={r} open={state.a === r.annotation.id} view={view} searchOn={searchOn} goals={goals} onToggle={() => toggle(r.annotation.id ?? r.key)} onEdit={() => setEdit(draftOf(r.annotation))} onDeleted={() => res.reload?.()} />
									</Fragment>
								))}
							</tbody>
						</table>
					</div>
					{total > limit && (
						<div className="ca-actions">
							<span className="ca-small">
								Rows {count(offset + 1)} to {count(Math.min(offset + limit, total))} of {count(total)}
							</span>
							<Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
								Previous
							</Button>
							<Button size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
								Next
							</Button>
						</div>
					)}
				</>
			)}
		</>
	);
}

export default function Annotations() {
	return (
		<Shell title="Annotations">
			{(v) =>
				isRemote(v.site) ? (
					<RemoteNotice site={v.site} path="/annotations" />
				) : (
					<ErrorScope view={v}>
						<Body view={v} />
					</ErrorScope>
				)
			}
		</Shell>
	);
}
