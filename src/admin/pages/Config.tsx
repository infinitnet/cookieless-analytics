/** Definitions page (route `/config`): goals, funnels, segments, channel rules, user agent rules, UTM builder, API keys, Sites. Annotations have their own page. */
import { Button } from "@cloudflare/kumo";
import { activeTab, tabParam } from "./report.js";
import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PLUGIN_ID } from "../../contract.js";
import { AGENT_CATEGORIES, type AgentCategory, MAX_USER_REGEX_RULES, MAX_USER_RULES } from "../../agents/rules.js";
import { formatRule, formatRules, type LineIssue, type LineRule, parseRuleLines, RULE_TEXT } from "../../agents/lines.js";
import { BUILTIN_CHANNEL_RULES, type ChannelCondition, classifyChannel } from "../../core/channels.js";
import { addDays, dayInZone, zonedToEpoch } from "../../core/time.js";
import { SCOPE_LABELS, SCOPES, type Scope } from "../../keys/scopes.js";
import type { ApiKeyView } from "../../keys/store.js";
import { UTM_KEYS, type Utm } from "../../core/url.js";
import type { Filter, FunnelMode, FunnelStep, Goal } from "../../query/filters.js";
import type { SiteEntry } from "../../routes/sites.js";
import { call, deleteConfig, errorText, type Item, listConfig, saveConfig, withApiSite } from "../api.js";
import { FilterBar, chipText, regexError } from "../components/FilterBar.js";
import { propOptions, type SuggestSource, SuggestInput, suggestRange, useEventProps } from "../components/ValueInput.js";
import { count } from "../components/format.js";
import { isRemote, Shell, type View } from "../components/Header.js";
import { Sites } from "./Sites.js";
import { LIST_SEARCH_OVER, matchesText, noMatch, SearchBox } from "../components/SearchBox.js";
import { Disclosure, Notice, Empty, Segmented, Tabs, Loading } from "../components/ui.js";

/** Shown instead of forms when a connected site is selected. */
export function RemoteNotice({ site, path }: { site: SiteEntry; path: string }) {
	return (
		<Notice>
			Configuration is managed on the selected site.{" "}
			{site.origin && <a href={`${site.origin}/_emdash/admin/plugins/${PLUGIN_ID}${path}`}>Open the admin of {site.label}</a>}
		</Notice>
	);
}

/** Label wrapping a control, so every input has an accessible name. */
export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string | null }) {
	return (
		<span className="ca-field-wrap">
			<label className="ca-field">
				<span className="ca-field-label">{label}</span>
				{children}
			</label>
			{error && (
				<span role="alert" className="ca-field-error">
					{error}
				</span>
			)}
		</span>
	);
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<T | readonly [T, string]>; onChange: (v: T) => void }) {
	return (
		<Field label={label}>
			<select value={value} onChange={(e) => onChange(e.target.value as T)}>
				{options.map((o) => {
					const [v, l] = typeof o === "string" ? [o, o] : o;
					return (
						<option key={v} value={v}>
							{l}
						</option>
					);
				})}
			</select>
		</Field>
	);
}

const Text = ({ label, value, onChange, error, ...rest }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; placeholder?: string; type?: string }) => (
	<Field label={label} error={error}>
		<input value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
	</Field>
);

interface Store<T> {
	kind: string;
	items: Array<Item<T>> | null;
	error: string | null;
	setError: (e: string | null) => void;
	reload: () => Promise<void>;
}

function useItems<T>(kind: string, load: () => Promise<{ items: Array<Item<T>> }> = () => listConfig<T>(kind)): Store<T> {
	const [items, setItems] = useState<Array<Item<T>> | null>(null);
	const [error, setError] = useState<string | null>(null);
	const reload = useCallback(
		() =>
			load().then(
				(r) => setItems(r.items),
				(e: unknown) => setError(errorText(e)),
			),
		// `load` is a module-level function or the default for `kind`, so `kind` alone keys it.
		[kind],
	);
	useEffect(() => {
		void reload();
	}, [reload]);
	return { kind, items, error, setError, reload };
}

interface CrudProps<T> {
	store: Store<T>;
	noun: string;
	blank: () => T;
	columns: ReadonlyArray<readonly [string, (d: T) => ReactNode]>;
	form: (draft: T, set: (d: T) => void) => ReactNode;
	/** Body to save; defaults to the draft. */
	toSave?: (d: T) => Record<string, unknown>;
	show?: (d: T) => boolean;
	sort?: (a: T, b: T) => number;
	/** Start with the New form open (`?new=1`). */
	startNew?: boolean | undefined;
}

/** List with Edit and Delete per item and one form for a new or the edited item; delete asks for a second click. */
function Crud<T>({ store, noun, blank, columns, form, toSave, show, sort, startNew }: CrudProps<T>) {
	const [edit, setEdit] = useState<{ id?: string; draft: T } | null>(() => (startNew ? { draft: blank() } : null));
	const [armed, setArmed] = useState<string | null>(null);
	const { items, error, setError, reload } = store;
	const run = async (fn: () => Promise<unknown>) => {
		setError(null);
		try {
			await fn();
			await reload();
			return true;
		} catch (e) {
			setError(errorText(e));
			return false;
		}
	};
	const submit = async () => {
		if (!edit) return;
		const body = toSave ? toSave(edit.draft) : (edit.draft as Record<string, unknown>);
		if (await run(() => saveConfig(store.kind, body, edit.id))) setEdit(null);
	};
	const [q, setQ] = useState("");
	const all = (items ?? []).filter((i) => !show || show(i.data));
	if (sort) all.sort((a, b) => sort(a.data, b.data));
	// The search matches the text of every column: name, key, pattern, match value.
	const list = all.filter((i) => matchesText(q, columns.map(([, f]) => f(i.data))));
	const none = noMatch(q, () => setQ(""));
	return (
		<section aria-label={`${noun}s`}>
			{error && <Notice tone="error">{error}</Notice>}
			{all.length > LIST_SEARCH_OVER && <SearchBox value={q} label={`Search ${noun.toLowerCase()}s`} placeholder={`Search ${noun.toLowerCase()}s`} onSearch={setQ} />}
			{items === null ? (
				<Loading />
			) : all.length === 0 ? (
				<Empty>No {noun.toLowerCase()}s yet.</Empty>
			) : list.length === 0 ? (
				<Empty action={none.action}>{none.text}</Empty>
			) : (
				<div className="ca-table-scroll">
					<table aria-label={`${noun}s`}>
						<thead>
							<tr>
								{columns.map(([l]) => (
									<th key={l}>{l}</th>
								))}
								<th>
									<span className="ca-sr">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{list.map((it) => (
								<tr key={it.id}>
									{columns.map(([l, f]) => (
										<td key={l}>{f(it.data)}</td>
									))}
									<td>
										{/* Kumo buttons are blocks: one row keeps the actions side by side. */}
										<div className="ca-actions ca-row-actions">
											<Button size="sm" disabled={edit !== null} onClick={() => setEdit({ id: it.id, draft: structuredClone(it.data) })}>
												Edit
											</Button>
											{armed === it.id ? (
												<Button variant="primary" size="sm" onClick={() => void run(() => deleteConfig(store.kind, it.id)).then(() => setArmed(null))}>
													Confirm delete
												</Button>
											) : (
												<Button variant="secondary-destructive" size="sm" onClick={() => setArmed(it.id)}>
													Delete
												</Button>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{edit ? (
				// Not a <form>: the segment editor holds the filter bar's own forms, and nested forms would submit both.
				<div role="form" className="ca-panel" aria-label={edit.id ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`}>
					<div>{form(edit.draft, (draft) => setEdit({ ...edit, draft }))}</div>
					<div className="ca-actions">
						<Button variant="primary" size="sm" onClick={() => void submit()}>
							Save
						</Button>
						<Button size="sm" onClick={() => setEdit(null)}>
							Cancel
						</Button>
					</div>
				</div>
			) : (
				<Button size="sm" variant="primary" onClick={() => setEdit({ draft: blank() })}>
					New {noun.toLowerCase()}
				</Button>
			)}
		</section>
	);
}

const MATCHES = [
	["is", "is"],
	["prefix", "starts with"],
	["contains", "contains"],
	["regex", "regex"],
] as const;
const STEP_MATCHES = MATCHES.filter((m): m is Exclude<(typeof MATCHES)[number], readonly ["contains", string]> => m[0] !== "contains");
/** The modes the engine honours for an outbound goal (compile.ts: no regex); an event goal or step matches its name exactly. */
const OUTBOUND_MATCHES = MATCHES.filter((m) => m[0] !== "regex");
/** A goal's match after a type change: "is" for an event, and for an outbound goal that held regex. */
const goalMatch = (type: Goal["type"], match: Goal["match"]): Goal["match"] => (type === "event" || (type === "outbound" && match === "regex") ? "is" : match);

/** Site and last 90 days for the suggestions of the definition forms; absent on a remote site. */
const SuggestCtx = createContext<SuggestSource | undefined>(undefined);

type Matcher = { type: "page" | "event" | "outbound"; match: string; value: string };

/** The value of a goal or funnel step: the pages, event names or outbound hosts seen in the last 90 days. */
function MatchValue({ type, match, value, label, onChange }: Matcher & { label: string; onChange: (v: string) => void }) {
	const src = useContext(SuggestCtx);
	const exact = match === "is";
	const error = type === "page" && match === "regex" ? regexError(value) : null;
	const input =
		type === "event" ? (
			<SuggestInput dim="event" value={value} onChange={onChange} source={src} label={label} check />
		) : type === "page" ? (
			<SuggestInput dim="page" value={value} onChange={onChange} source={match === "regex" ? undefined : src} label={label} check={exact} />
		) : (
			<SuggestInput dim="event_prop" kind="outbound" value={value} onChange={onChange} source={src} label={label} check={exact} />
		);
	return (
		<Field label={label} error={error}>
			{input}
		</Field>
	);
}

/** The channel of a rule: the channels seen in the last 90 days. */
function ChannelField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	return (
		<Field label="Channel">
			<SuggestInput dim="channel" value={value} onChange={onChange} source={useContext(SuggestCtx)} label="Channel" />
		</Field>
	);
}

/** Property key and value of an event goal, from the keys and values the event carried. */
function PropFields({ event, pk, pv, setProp }: { event: string; pk: string; pv: string; setProp: (k: string, v: string) => void }) {
	const src = useContext(SuggestCtx);
	const [touched, setTouched] = useState(false);
	const { keys, values } = propOptions(useEventProps(src, event, touched), pk);
	return (
		<>
			<Field label="Property (optional)">
				<SuggestInput dim="event_prop" value={pk} onChange={(k) => setProp(k, pv)} options={src ? keys : undefined} label="Property (optional)" onFocusChange={(f) => f && setTouched(true)} />
			</Field>
			<Field label="Property value">
				<SuggestInput dim="event_prop" value={pv} onChange={(v) => setProp(pk, v)} options={src ? values : undefined} label="Property value" onFocusChange={(f) => f && setTouched(true)} />
			</Field>
		</>
	);
}

function Goals({ startNew }: { startNew?: boolean | undefined }) {
	const store = useItems<Goal>("goals");
	return (
		<Crud
			startNew={startNew}
			store={store}
			noun="Goal"
			blank={(): Goal => ({ name: "", type: "page", match: "is", value: "", active: true })}
			columns={[
				["Name", (g) => g.name],
				["Type", (g) => g.type],
				["Match", (g) => `${g.match} ${g.value}`],
				["Active", (g) => (g.active === false ? "no" : "yes")],
			]}
			toSave={(g) => {
				const props = Object.fromEntries(Object.entries(g.props ?? {}).filter(([k]) => k));
				const { props: _p, ...rest } = g;
				const trimmed = { ...rest, value: g.value.trim() };
				return g.type === "event" && Object.keys(props).length ? { ...trimmed, props } : trimmed;
			}}
			form={(g, set) => {
				// The form edits the first property; any others saved through the route are kept.
				const [[pk, pv] = ["", ""], ...others] = Object.entries(g.props ?? {});
				const setProp = (k: string, v: string) => set({ ...g, props: { ...Object.fromEntries(others), [k]: v } });
				return (
					<>
						<Text label="Name" value={g.name} onChange={(name) => set({ ...g, name })} />
						<Select label="Type" value={g.type} options={["page", "event", "outbound"]} onChange={(type) => set({ ...g, type, match: goalMatch(type, g.match) })} />
						{g.type !== "event" && <Select label="Match" value={g.match} options={g.type === "page" ? MATCHES : OUTBOUND_MATCHES} onChange={(match) => set({ ...g, match })} />}
						<MatchValue type={g.type} match={g.match} value={g.value} label={g.type === "page" ? "Path" : g.type === "event" ? "Event name" : "Link host"} onChange={(value) => set({ ...g, value })} />
						{g.type === "event" && <PropFields event={g.value} pk={pk} pv={pv} setProp={setProp} />}
						<Field label="Active">
							<input type="checkbox" checked={g.active !== false} onChange={(e) => set({ ...g, active: e.target.checked })} />
						</Field>
					</>
				);
			}}
		/>
	);
}

interface Funnel {
	name: string;
	steps: FunnelStep[];
	mode?: FunnelMode;
}
/** The three definitions of the mode, printed next to the mode select. */
export const FUNNEL_MODE_TEXT: Record<FunnelMode, string> = {
	sequential: "Sequential: each step happens after the previous one in the same visit; anything may happen between.",
	strict: "Strict: each step is the next page view or event of the visit after the previous step. Hits in the same second count as simultaneous.",
	flexible: "Flexible: the steps happen in any order within one visit; step n counts visits that completed steps 1 to n.",
};
const step = (): FunnelStep => ({ type: "page", match: "is", value: "" });

function Funnels({ startNew }: { startNew?: boolean | undefined }) {
	const store = useItems<Funnel>("funnels");
	return (
		<Crud
			startNew={startNew}
			store={store}
			noun="Funnel"
			blank={(): Funnel => ({ name: "", steps: [step(), step()] })}
			toSave={(f) => ({ ...f, steps: f.steps.map((x) => ({ ...x, value: x.value.trim() })) })}
			columns={[
				["Name", (f) => f.name],
				["Steps", (f) => f.steps.map((s) => s.label || s.value).join(" > ")],
				["Mode", (f) => f.mode ?? "sequential"],
			]}
			form={(f, set) => {
				const setStep = (i: number, s: FunnelStep) => set({ ...f, steps: f.steps.map((x, j) => (j === i ? s : x)) });
				return (
					<>
						<Text label="Name" value={f.name} onChange={(name) => set({ ...f, name })} />
						<Select label="Mode" value={f.mode ?? "sequential"} options={["sequential", "strict", "flexible"] as const} onChange={(mode) => set({ ...f, mode })} />
						<ul className="ca-small">
							{(["sequential", "strict", "flexible"] as const).map((m) => (
								<li key={m}>{FUNNEL_MODE_TEXT[m]}</li>
							))}
						</ul>
						<ol>
							{f.steps.map((s, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: steps have no id and are edited in place
								<li key={i}>
									<Select label={`Step ${i + 1} type`} value={s.type} options={["page", "event"]} onChange={(type) => setStep(i, { ...s, type, ...(type === "event" ? { match: "is" as const } : {}) })} />
									{s.type === "page" && <Select label={`Step ${i + 1} match`} value={s.match} options={STEP_MATCHES} onChange={(match) => setStep(i, { ...s, match })} />}
									<MatchValue type={s.type} match={s.match} value={s.value} label={`Step ${i + 1} value`} onChange={(value) => setStep(i, { ...s, value })} />
									<Button variant="secondary-destructive" size="sm" disabled={f.steps.length <= 2} onClick={() => set({ ...f, steps: f.steps.filter((_, j) => j !== i) })}>
										Remove step {i + 1}
									</Button>
								</li>
							))}
						</ol>
						<Button variant="primary" size="sm" disabled={f.steps.length >= 6} onClick={() => set({ ...f, steps: [...f.steps, step()] })}>
							Add step
						</Button>
						<p className="ca-small">2 to 6 steps within one visit.</p>
					</>
				);
			}}
		/>
	);
}

interface Segment {
	name: string;
	filters: Filter[];
}

function Segments({ startNew }: { startNew?: boolean | undefined }) {
	const store = useItems<Segment>("segments");
	return (
		<Crud
			startNew={startNew}
			store={store}
			noun="Segment"
			blank={() => ({ name: "", filters: [] })}
			columns={[
				["Name", (s) => s.name],
				["Filters", (s) => s.filters.map(chipText).join("; ")],
			]}
			form={(s, set) => (
				<>
					<Text label="Name" value={s.name} onChange={(name) => set({ ...s, name })} />
					<FilterBar filters={s.filters} onChange={(filters) => set({ ...s, filters })} />
				</>
			)}
		/>
	);
}

type ChannelItem = { channel: string; any: ChannelCondition[]; priority: number } | { disables: string };
const HOST_LISTS = ["", "search", "social", "video", "shopping", "ai", "webmail"] as const;
const isUser = (r: ChannelItem): r is Exclude<ChannelItem, { disables: string }> => !("disables" in r);

function ChannelRules() {
	const store = useItems<ChannelItem>("channel_rules");
	const [busy, setBusy] = useState(false);
	const [toggling, setToggling] = useState(false);
	const [result, setResult] = useState<string | null>(null);
	const off = new Map((store.items ?? []).flatMap((i) => ("disables" in i.data ? [[i.data.disables, i.id] as const] : [])));
	const toggle = async (id: string, on: boolean) => {
		store.setError(null);
		setToggling(true);
		try {
			const item = off.get(id);
			if (on && item) await deleteConfig("channel_rules", item);
			if (!on && !item) await saveConfig("channel_rules", { disables: id });
			await store.reload();
		} catch (e) {
			store.setError(errorText(e));
		}
		setToggling(false);
	};
	// The closed days of a run whose summaries were not stored again: kept so Continue can finish them.
	const [pending, setPending] = useState<{ site: string; days: string[] } | null>(null);
	const stopped = (e: unknown, from: string | undefined) => `Stopped: ${errorText(e).replace(/\.?$/, ".")}${from ? ` Summaries from ${from} on were not stored again.` : ""}`;
	// Closed days keep the old channels in their summaries until stored again: this site only, at most 31 days per call,
	// each call within its budget and continuing where the last one stopped (`next`, `after`).
	const storeAgain = async (site: string, days: string[], head: string) => {
		let done = 0;
		let after: string | null = null;
		let from = days[0];
		try {
			for (let i = 0; from && i < 10_000; i++) {
				const to = days.filter((d) => d <= addDays(from as string, 30)).at(-1) as string;
				setResult(`${head}Storing the summaries of ${days.length} closed days again: ${done} done.`);
				const r: { next: string | null; after: string | null } = await call("tools/rollup-now", { from, to, site, ...(after ? { after } : {}) });
				done = days.filter((d) => d < (r.next ?? addDays(to, 1))).length;
				after = r.next ? r.after : null;
				from = r.next ?? days.find((d) => d > to);
			}
			setPending((p) => (p?.site === site ? null : p));
			setResult(`${head}${days.length ? `Stored the summaries of ${days.length} closed days again.` : ""}`.trim());
		} catch (e) {
			setPending({ site, days: days.filter((d) => d >= (from as string)) });
			setResult(stopped(e, from));
		}
	};
	const reclassify = async () => {
		setBusy(true);
		setResult(null);
		let scanned = 0;
		let updated = 0;
		// Days left over by a stopped run of this site are stored with this run's days.
		const stored = new Set<string>(pending?.days);
		let site = pending?.site ?? "";
		try {
			let cursor: string | null = null;
			// Each call handles up to 2000 sessions; the loop is bounded so a stuck cursor cannot spin.
			for (let i = 0; i < 1000; i++) {
				const r: { site: string; scanned: number; updated: number; cursor: string | null; done: boolean; stored: string[] } = await call("tools/reclassify-channels", withApiSite(cursor ? { cursor } : {}));
				if (r.site !== site) stored.clear();
				site = r.site;
				scanned += r.scanned;
				updated += r.updated;
				for (const d of r.stored) stored.add(d);
				setResult(`Checked ${scanned} sessions, changed ${updated}.`);
				if (r.done || !r.cursor) break;
				cursor = r.cursor;
			}
		} catch (e) {
			const days = [...stored].sort();
			if (days.length) setPending({ site, days });
			setResult(stopped(e, days[0]));
			setBusy(false);
			return;
		}
		await storeAgain(site, [...stored].sort(), `Checked ${scanned} sessions, changed ${updated}. `);
		setBusy(false);
	};
	const resume = async () => {
		if (!pending) return;
		setBusy(true);
		await storeAgain(pending.site, pending.days, "");
		setBusy(false);
	};
	return (
		<>
			<h3>Built-in rules</h3>
			<p className="ca-small">Checked in this order; the first match sets the channel. Built-in rules can be switched off, not edited.</p>
			<ul className="ca-list">
				{BUILTIN_CHANNEL_RULES.map((r, i) => (
					<li key={r.id}>
						<label>
							<input type="checkbox" checked={!off.has(r.id)} disabled={store.items === null || toggling} onChange={(e) => void toggle(r.id, e.target.checked)} /> {r.channel} (priority {(i + 1) * 10})
						</label>
					</li>
				))}
			</ul>
			<h3>Your rules</h3>
			<Crud
				store={store}
				noun="Rule"
				show={isUser}
				blank={() => ({ channel: "", priority: 5, any: [{}] })}
				columns={[
					["Channel", (r) => (isUser(r) ? r.channel : "")],
					["Priority", (r) => (isUser(r) ? r.priority : "")],
					["When", (r) => (isUser(r) ? r.any.map((c) => Object.entries(c).map(([k, v]) => `${k} ${String(v)}`).join(" and ")).join(" or ") : "")],
				]}
				toSave={(r) => {
					if (!isUser(r)) return r;
					const [first = {}, ...rest] = r.any;
					const clean = Object.fromEntries(Object.entries(first).filter(([, v]) => v !== "" && v !== undefined));
					return { ...r, any: [clean, ...rest] };
				}}
				form={(r, set) => {
					if (!isUser(r)) return null;
					const c = r.any[0] ?? {};
					const setC = (n: ChannelCondition) => set({ ...r, any: [n, ...r.any.slice(1)] });
					return (
						<>
							<ChannelField value={r.channel} onChange={(channel) => set({ ...r, channel })} />
							<Field label="Priority (lower runs first; built-ins use 10 to 200)">
								<input type="number" value={r.priority} onChange={(e) => set({ ...r, priority: Math.trunc(Number(e.target.value)) })} />
							</Field>
							<Select label="Referrer in host list" value={(c.refList ?? "") as (typeof HOST_LISTS)[number]} options={HOST_LISTS} onChange={(v) => setC({ ...c, refList: v || undefined } as ChannelCondition)} />
							{(["medium", "source", "campaign"] as const).map((k) => (
								<Text key={k} label={`utm_${k} regex`} value={c[k] ?? ""} onChange={(v) => setC({ ...c, [k]: v })} error={regexError(c[k] ?? "")} />
							))}
							{r.any.length > 1 && <p className="ca-small">This rule has {r.any.length - 1} more conditions, kept as they are.</p>}
						</>
					);
				}}
			/>
			<h3>Reclassify</h3>
			<p className="ca-small">Applies the current rules to the stored sessions of the detailed data window.</p>
			<div className="ca-actions">
				<Button size="sm" disabled={busy} onClick={() => void reclassify()}>
					Reclassify sessions
				</Button>
				{pending && (
					<Button size="sm" disabled={busy} onClick={() => void resume()}>
						Continue
					</Button>
				)}
			</div>
			{result && <Notice tone={/^Stopped/.test(result) ? "error" : "success"}>{result}</Notice>}
		</>
	);
}

type AgentRule = { pattern: string; mode: "contains" | "prefix" | "exact" | "regex"; action: "robot" | "human"; name?: string; category?: string };
interface TestResult {
	audience: "human" | "robot";
	botId?: string;
	category?: string;
	matched: "user_rule" | "builtin" | "none";
	rule: (AgentRule & { id?: string }) | null;
}

/** Copy of the user agent rules tab, exported for the copy test. */
export const UA_RULES_TEXT = {
	syntax: "One rule per line: the action (bot or human), the mode (contains, prefix, exact or regex), then the pattern. Text after a space, # and a space is kept as the rule name. Blank lines and lines that start with # are ignored.",
	caps: `At most ${MAX_USER_RULES} rules, of them at most ${MAX_USER_REGEX_RULES} regex rules. Save replaces the whole set for every site, and is open only after Check passes.`,
	order: "Your contains, prefix and exact rules run before the built-in list, so a human rule fixes a wrong match and a bot rule adds a missing one. Regex rules run after it. When two of your rules match, the one listed first wins. Saving keeps the order of the rules already stored: a new line is stored after them wherever you type it, and moving lines changes nothing, so a Check warns about a new line above a kept one.",
	builtin: "The built-in list is not edited here: a rule of yours overrides an entry. Force human adds a human rule for the entry to the text; check and save to apply it.",
	unsaved: "Unsaved changes. Check the rules, then save.",
	checking: "Checking",
	noErrors: "No errors.",
	noOverride: "Pattern entry: test a user agent below, then add a rule for it.",
	forced: (line: string) => `Added to the text: ${line}. Check and save to apply it.`,
	saved: (n: number) => (n ? `Saved: ${n} ${n === 1 ? "row" : "rows"} written.` : "Saved: nothing changed."),
	saving: (written: number, remaining: number) => `Saving: ${written} rows written, ${remaining} to go.`,
	diff: (r: { added: unknown[]; changed: unknown[]; removed: unknown[]; unchanged: number }) =>
		`${r.added.length} added, ${r.changed.length} changed, ${r.removed.length} removed, ${r.unchanged} unchanged.`,
	copied: "Copied to the clipboard.",
	own: (action: string) => `Your rule: ${action}`,
};

interface BulkResult {
	errors: LineIssue[];
	warnings: LineIssue[];
	total: number;
	added: string[];
	changed: Array<{ from: string; to: string }>;
	removed: string[];
	unchanged: number;
	written: number;
	/** Save: rows still to write; the page repeats the save until 0. */
	remaining?: number;
}
interface BuiltinRow {
	id: string;
	name: string;
	category: AgentCategory;
	source: string;
	mode: string;
	pattern: string;
	override: { mode: "contains" | "prefix"; pattern: string } | null;
}

/** Every stored rule, page by page, in the order the classifier applies them. */
async function listAllRules(): Promise<{ items: Array<Item<AgentRule>> }> {
	const items: Array<Item<AgentRule>> = [];
	let cursor: string | null | undefined;
	do {
		const r = await call<{ items: Array<Item<AgentRule>>; cursor?: string | null }>("config/agent_rules/list", { limit: 100, ...(cursor ? { cursor } : {}) });
		items.push(...r.items);
		cursor = r.cursor;
	} while (cursor && items.length < 2 * MAX_USER_RULES);
	return { items };
}

/** The rules as text: check (locally, then on the server), see the diff, save the whole set; export and import. */
function RulesText({ text, setText, dirty, onSaved }: { text: string; setText: (t: string) => void; dirty: boolean; onSaved: () => Promise<void> }) {
	const box = useRef<HTMLTextAreaElement>(null);
	const file = useRef<HTMLInputElement>(null);
	const [res, setRes] = useState<{ text: string; r: BulkResult } | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<string | null>(null);
	const [progress, setProgress] = useState<string | null>(null);
	const ready = res?.text === text && res.r.errors.length === 0 && !busy;
	const run = async (save: boolean) => {
		setError(null);
		setDone(null);
		const local = parseRuleLines(text);
		if (local.errors.length) return setRes({ text, r: { errors: local.errors, warnings: [], total: local.rules.length, added: [], changed: [], removed: [], unchanged: 0, written: 0 } });
		setBusy(true);
		try {
			if (save) {
				// A save writes at most 30 rows a call; repeat until nothing remains.
				let written = 0;
				let r: BulkResult;
				do {
					r = await call<BulkResult>("config/agent_rules/bulk", { text });
					written += r.written;
					if (r.remaining) setProgress(UA_RULES_TEXT.saving(written, r.remaining));
				} while (r.remaining && r.written);
				setRes(null);
				setDone(UA_RULES_TEXT.saved(written));
				await onSaved();
			} else setRes({ text, r: await call<BulkResult>("config/agent_rules/bulk", { text, check: true }) });
		} catch (e) {
			setError(errorText(e));
		} finally {
			setBusy(false);
			setProgress(null);
		}
	};
	/** Select line `n` (1-based) of the box. */
	const goto = (n: number) => {
		const el = box.current;
		if (!el) return;
		const lines = el.value.split("\n");
		const start = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
		el.focus();
		el.setSelectionRange(start, start + (lines[n - 1]?.length ?? 0));
	};
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setDone(UA_RULES_TEXT.copied);
		} catch (e) {
			setError(errorText(e));
		}
	};
	const download = () => {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
		a.download = "user-agent-rules.txt";
		a.click();
		URL.revokeObjectURL(a.href);
	};
	const issues = (list: LineIssue[], tone: "error" | "warning") =>
		list.length > 0 && (
			<Notice tone={tone} label={tone === "error" ? "Errors" : "Warnings"}>
				<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
					{list.map((i) => (
						<li key={`${i.line}:${i.message}`}>
							<button type="button" className="ca-linkbtn" onClick={() => goto(i.line)}>
								Line {i.line}: {i.message}
							</button>
						</li>
					))}
				</ul>
			</Notice>
		);
	const r = res?.text === text ? res.r : null;
	return (
		<section aria-label="Rules as text">
			<p className="ca-small">{UA_RULES_TEXT.syntax}</p>
			<pre className="ca-pre" aria-label="Example">
				{RULE_TEXT.example}
			</pre>
			<p className="ca-small">{UA_RULES_TEXT.caps}</p>
			<Field label="Rules, one per line">
				<textarea
					ref={box}
					rows={14}
					wrap="off"
					spellCheck={false}
					style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 12 }}
					value={text}
					onChange={(e) => setText(e.target.value)}
				/>
			</Field>
			{dirty && !r && <p className="ca-small">{UA_RULES_TEXT.unsaved}</p>}
			<div className="ca-actions">
				<Button size="sm" disabled={busy} onClick={() => void run(false)}>
					Check
				</Button>
				<Button size="sm" variant="primary" disabled={!ready} onClick={() => void run(true)}>
					Save
				</Button>
				<Button size="sm" onClick={() => void copy()}>
					Copy
				</Button>
				<Button size="sm" onClick={download}>
					Download .txt
				</Button>
				<Button size="sm" onClick={() => file.current?.click()}>
					Load a file
				</Button>
				<input
					ref={file}
					type="file"
					hidden
					aria-label="Load a file"
					accept=".txt,text/plain"
					onChange={(e) => {
						const f = e.target.files?.[0];
						e.target.value = "";
						if (f) void f.text().then(setText, (err: unknown) => setError(errorText(err)));
					}}
				/>
			</div>
			{busy && <Loading>{progress ?? UA_RULES_TEXT.checking}</Loading>}
			{error && <Notice tone="error">{error}</Notice>}
			{done && <Notice tone="success">{done}</Notice>}
			{r && (
				<>
					{issues(r.errors, "error")}
					{issues(r.warnings, "warning")}
					{r.errors.length === 0 && (
						<Notice tone="info" label="Changes">
							{UA_RULES_TEXT.noErrors} {UA_RULES_TEXT.diff(r)}
						</Notice>
					)}
					{r.added.length > 0 && (
						<Disclosure label={`Added (${r.added.length})`}>
							<pre className="ca-pre">{r.added.join("\n")}</pre>
						</Disclosure>
					)}
					{r.changed.length > 0 && (
						<Disclosure label={`Changed (${r.changed.length})`}>
							<pre className="ca-pre">{r.changed.map((c) => `${c.from}\n  now: ${c.to}`).join("\n")}</pre>
						</Disclosure>
					)}
					{r.removed.length > 0 && (
						<Disclosure label={`Removed (${r.removed.length})`}>
							<pre className="ca-pre">{r.removed.join("\n")}</pre>
						</Disclosure>
					)}
				</>
			)}
		</section>
	);
}

/** Read-only, searchable view of the bundled bot list, 50 rows a page; each row can be forced to human through the text. */
function BuiltinList({ rules, onForceHuman }: { rules: readonly LineRule[]; onForceHuman: (r: LineRule) => void }) {
	const [q, setQ] = useState("");
	const [category, setCategory] = useState("");
	const [page, setPage] = useState(0);
	const [data, setData] = useState<{ total: number; items: BuiltinRow[]; pageSize: number } | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		const t = setTimeout(
			() =>
				void call<{ total: number; items: BuiltinRow[]; pageSize: number }>("config/agent_rules/builtin", { ...(q.trim() ? { q: q.trim() } : {}), ...(category ? { category } : {}), page }).then(
					(r) => live && (setData(r), setError(null)),
					(e: unknown) => live && setError(errorText(e)),
				),
			q ? 250 : 0,
		);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [q, category, page]);
	const own = useMemo(() => new Map(rules.filter((r) => r.mode !== "regex").map((r) => [`${r.mode} ${r.pattern.toLowerCase()}`, r])), [rules]);
	const size = data?.pageSize ?? 50;
	return (
		<section aria-label="Built-in list">
			<p className="ca-small">{UA_RULES_TEXT.builtin}</p>
			<div className="ca-row">
				<Text label="Search the built-in list" value={q} onChange={(v) => (setQ(v), setPage(0))} placeholder="Name or pattern" />
				<Select label="Category" value={category} options={[["", "All categories"], ...AGENT_CATEGORIES.map((c) => [c, c] as const)]} onChange={(v) => (setCategory(v), setPage(0))} />
			</div>
			{error && <Notice tone="error">{error}</Notice>}
			{!data ? (
				<Loading />
			) : data.items.length === 0 ? (
				<Empty>No entries match.</Empty>
			) : (
				<>
					<div className="ca-table-scroll">
						<table aria-label="Built-in entries">
							<thead>
								<tr>
									<th>Name</th>
									<th>Pattern</th>
									<th>Category</th>
									<th>Source</th>
									<th>
										<span className="ca-sr">Override</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{data.items.map((b) => {
									const o = b.override;
									const mine = o && own.get(`${o.mode} ${o.pattern}`);
									return (
										<tr key={b.id}>
											<td>{b.name}</td>
											<td>
												<code>{b.pattern}</code>
											</td>
											<td>{b.category}</td>
											<td>{b.source}</td>
											<td>
												{mine ? (
													<span className="ca-small">{UA_RULES_TEXT.own(mine.action === "human" ? "human" : "bot")}</span>
												) : o ? (
													<Button size="sm" aria-label={`Force human: ${b.name}`} onClick={() => onForceHuman({ action: "human", mode: o.mode, pattern: o.pattern, name: b.name.slice(0, 64) })}>
														Force human
													</Button>
												) : (
													<span className="ca-small">{UA_RULES_TEXT.noOverride}</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					<div className="ca-actions">
						<span className="ca-small">
							Rows {count(page * size + 1)} to {count(Math.min((page + 1) * size, data.total))} of {count(data.total)}
						</span>
						<Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
							Previous
						</Button>
						<Button size="sm" disabled={(page + 1) * size >= data.total} onClick={() => setPage(page + 1)}>
							Next
						</Button>
					</div>
				</>
			)}
		</section>
	);
}

const toLine = (r: AgentRule): LineRule => ({ action: r.action, mode: r.mode, pattern: r.pattern, ...(r.name ? { name: r.name } : {}) });

function UserAgentRules() {
	const store = useItems<AgentRule>("agent_rules", listAllRules);
	const [view, setView] = useState<"list" | "text">("list");
	const current = useMemo(() => formatRules((store.items ?? []).map((i) => toLine(i.data))), [store.items]);
	/** The edited text; null shows the stored rules. */
	const [draft, setDraft] = useState<string | null>(null);
	const [forced, setForced] = useState<string | null>(null);
	const text = draft ?? current;
	const textRules = useMemo(() => parseRuleLines(text).rules, [text]);
	const [ua, setUa] = useState("");
	const [test, setTest] = useState<TestResult | null>(null);
	const [testError, setTestError] = useState<string | null>(null);
	const runTest = async (e: FormEvent) => {
		e.preventDefault();
		setTestError(null);
		try {
			setTest(await call<TestResult>("tools/test-agent", { ua }));
		} catch (err) {
			setTest(null);
			setTestError(errorText(err));
		}
	};
	const forceHuman = (r: LineRule) => {
		const line = formatRule(r);
		setDraft(`${text.trimEnd() ? `${text.trimEnd()}\n` : ""}${line}`);
		setForced(line);
		setView("text");
	};
	return (
		<>
			<p className="ca-small">{UA_RULES_TEXT.order}</p>
			<Segmented
				label="View"
				value={view}
				options={[
					["list", "List"],
					["text", "Edit as text"],
				]}
				onChange={setView}
			/>
			{view === "list" ? (
				<Crud
					store={store}
					noun="Rule"
					blank={(): AgentRule => ({ pattern: "", mode: "contains", action: "robot", name: "" })}
					columns={[
						["Pattern", (r) => `${r.mode} ${r.pattern}`],
						["Result", (r) => (r.action === "human" ? "human" : `robot${r.category ? ` (${r.category})` : ""}`)],
						["Name", (r) => r.name ?? ""],
					]}
					toSave={(r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== ""))}
					form={(r, set) => (
						<>
							<Text label="User agent pattern" value={r.pattern} onChange={(pattern) => set({ ...r, pattern })} error={r.mode === "regex" ? regexError(r.pattern) : null} />
							<Select label="Match" value={r.mode} options={["contains", "prefix", "exact", "regex"]} onChange={(mode) => set({ ...r, mode })} />
							<Select label="Mark as" value={r.action} options={["robot", "human"]} onChange={(action) => set({ ...r, action })} />
							<Text label="Name" value={r.name ?? ""} onChange={(name) => set({ ...r, name })} />
							{r.action === "robot" && <Select label="Category" value={r.category ?? ""} options={["", ...AGENT_CATEGORIES]} onChange={(category) => set({ ...r, category })} />}
						</>
					)}
				/>
			) : store.items === null ? (
				<Loading />
			) : (
				<>
					{forced && draft !== null && <Notice tone="info">{UA_RULES_TEXT.forced(forced)}</Notice>}
					<RulesText
						text={text}
						setText={(t) => (setDraft(t), setForced(null))}
						dirty={draft !== null && draft !== current}
						onSaved={async () => {
							await store.reload();
							setDraft(null);
							setForced(null);
						}}
					/>
				</>
			)}
			<h3>Tester</h3>
			<form aria-label="Test a user agent" className="ca-form" onSubmit={(e) => void runTest(e)}>
				<Field label="User agent">
					<textarea rows={2} cols={60} value={ua} onChange={(e) => setUa(e.target.value)} />
				</Field>
				<Button variant="primary" size="sm" type="submit">
					Test
				</Button>
			</form>
			{testError && <Notice tone="error">{testError}</Notice>}
			{test && (
				<Notice tone="info" label="Result">
					{test.audience === "human"
						? "Human: counted as a visitor."
						: `Robot ${test.botId ?? ""}${test.category ? ` (${test.category})` : ""}, matched by ${test.matched === "user_rule" && test.rule ? `your rule "${test.rule.mode} ${test.rule.pattern}"` : "a built-in rule"}.`}
				</Notice>
			)}
			<Disclosure label="Built-in list">
				<BuiltinList rules={textRules} onForceHuman={forceHuman} />
			</Disclosure>
		</>
	);
}

/** Compose a link with UTM tags; null when the URL is not http or https. */
export function buildUtmUrl(url: string, utm: Utm): string | null {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return null;
	}
	if (u.protocol !== "http:" && u.protocol !== "https:") return null;
	for (const k of UTM_KEYS) {
		const v = utm[k]?.trim();
		if (v) u.searchParams.set(k, v);
		else u.searchParams.delete(k);
	}
	return u.toString();
}

function UtmBuilder() {
	const [url, setUrl] = useState("");
	const [utm, setUtm] = useState<Utm>({});
	const [copied, setCopied] = useState<string | null>(null);
	const out = buildUtmUrl(url, utm);
	const missing = !utm.utm_source?.trim();
	const channel = classifyChannel({ utm: Object.fromEntries(Object.entries(utm).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) }).channel;
	return (
		<section aria-label="UTM builder">
			<Text label="Page URL" value={url} placeholder="https://example.com/page" onChange={setUrl} error={url && !out ? "Enter a full http or https URL." : null} />
			{UTM_KEYS.map((k) => (
				<Text key={k} label={k + (k === "utm_source" ? " (required)" : "")} value={utm[k] ?? ""} onChange={(v) => setUtm({ ...utm, [k]: v })} />
			))}
			{out && !missing ? (
				<>
					<p>
						<output aria-label="Tagged URL">{out}</output>
					</p>
					<p role="status" className="ca-sub">
						Predicted channel with the default rules: <strong>{channel}</strong>
					</p>
					<Button size="sm"
						onClick={() =>
							void (navigator.clipboard?.writeText(out) ?? Promise.reject(new Error("no clipboard"))).then(
								() => setCopied(out),
								() => setCopied(null),
							)
						}
					>
						Copy URL
					</Button>
					{copied === out && <span role="status"> Copied.</span>}
				</>
			) : (
				<p className="ca-small">Enter a page URL and utm_source to see the tagged link.</p>
			)}
		</section>
	);
}

/** API keys for agents, scripts and a multi-site master. The token is shown once, right after creation. */
function ApiKeys({ tz, sites }: { tz: string; sites: readonly SiteEntry[] }) {
	// Keys can be limited to sites of this database: the local site and the client sites.
	const own = sites.filter((s) => s.local || s.kind === "client");
	const [only, setOnly] = useState<string[]>([]);
	const [items, setItems] = useState<ApiKeyView[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [label, setLabel] = useState("");
	const [scopes, setScopes] = useState<Scope[]>([SCOPES[0]]);
	const [expires, setExpires] = useState("");
	const [token, setToken] = useState<{ label: string; value: string; copied: boolean } | null>(null);
	const [armed, setArmed] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const reload = useCallback(
		() =>
			call<{ items: ApiKeyView[] }>("keys/list").then(
				(r) => setItems(r.items),
				(e: unknown) => setError(errorText(e)),
			),
		[],
	);
	useEffect(() => {
		void reload();
	}, [reload]);
	const run = async (fn: () => Promise<unknown>) => {
		setError(null);
		setBusy(true);
		try {
			await fn();
			await reload();
		} catch (e) {
			setError(errorText(e));
		} finally {
			setBusy(false);
		}
	};
	const create = (e: FormEvent) => {
		e.preventDefault();
		void run(async () => {
			// Valid through the chosen day in the site timezone.
			const exp = expires ? zonedToEpoch(addDays(expires, 1), 0, tz) : null;
			const r = await call<{ token: string; key: ApiKeyView }>("keys/create", { label: label.trim(), scopes, expires: exp, ...(only.length ? { sites: only } : {}) });
			setOnly([]);
			setToken({ label: r.key.label, value: r.token, copied: false });
			setLabel("");
			setExpires("");
		});
	};
	const day = (t: number | null) => (t === null ? "" : dayInZone(t, tz));
	const [q, setQ] = useState("");
	const found = (items ?? []).filter((k) => matchesText(q, [k.label, k.prefix]));
	const none = noMatch(q, () => setQ(""));
	return (
		<section aria-label="API keys">
			<p className="ca-small">Agents send the key in the X-Api-Key header. Keys read aggregates only and can at most add annotations or start a Search sync; no key can change settings, keys or visitor data.</p>
			{error && <Notice tone="error">{error}</Notice>}
			{token && (
				<Notice tone="warning">
					New key for {token.label}. Copy it now: it is not shown again.{" "}
					<code aria-label="New API key" className="ca-secret">
						{token.value}
					</code>{" "}
					<Button size="sm"
						onClick={() =>
							void (navigator.clipboard?.writeText(token.value) ?? Promise.reject(new Error("no clipboard"))).then(
								() => setToken({ ...token, copied: true }),
								() => setError("Copy failed; select the key and copy it by hand."),
							)
						}
					>
						Copy key
					</Button>{" "}
					{token.copied && <span role="status">Copied.</span>}{" "}
					<Button size="sm" onClick={() => setToken(null)}>
						Done
					</Button>
				</Notice>
			)}
			{(items?.length ?? 0) > LIST_SEARCH_OVER && <SearchBox value={q} label="Search API keys" placeholder="Label or key" onSearch={setQ} />}
			{items === null ? (
				<Empty>Loading.</Empty>
			) : items.length === 0 ? (
				<Empty>No API keys yet.</Empty>
			) : found.length === 0 ? (
				<Empty action={none.action}>{none.text}</Empty>
			) : (
				<div className="ca-table-scroll">
					<table>
						<thead>
							<tr>
								{["Label", "Key", "Scopes", "Sites", "Created", "Expires", "Last used", "Status", ""].map((h) => (
									<th key={h}>{h}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{found.map((k) => {
								const expired = k.expires !== null && k.expires <= Date.now() / 1000;
								return (
									<tr key={k.id}>
										<td>{k.label}</td>
										<td>
											<code>{k.prefix}...</code>
										</td>
										<td>{k.scopes.join(", ")}</td>
										<td>{k.sites?.length ? k.sites.join(", ") : "all"}</td>
										<td>{day(k.created)}</td>
										{/* Stored as the first second after the chosen day. */}
										<td>{k.expires === null ? "never" : day(k.expires - 1)}</td>
										<td>{day(k.last_used) || "never"}</td>
										<td>{k.revoked ? "revoked" : expired ? "expired" : "active"}</td>
										<td>
											{k.revoked && (
												<Button variant="secondary-destructive" size="sm" disabled={busy} onClick={() => void run(() => call("keys/delete", { id: k.id }))}>
													Delete
												</Button>
											)}
											{!k.revoked &&
												(armed === k.id ? (
													<Button variant="primary" size="sm" disabled={busy} onClick={() => void run(() => call("keys/revoke", { id: k.id })).then(() => setArmed(null))}>
														Confirm revoke
													</Button>
												) : (
													<Button variant="secondary-destructive" size="sm" onClick={() => setArmed(k.id)}>
														Revoke
													</Button>
												))}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
			<form onSubmit={create} aria-label="New API key" className="ca-form">
				<Text label="Label" value={label} onChange={setLabel} />
				<fieldset className="ca-plain">
					<legend className="ca-field-label">Scopes</legend>
					{SCOPES.map((sc) => (
						<label key={sc} className="ca-check">
							<input type="checkbox" checked={scopes.includes(sc)} onChange={(e) => setScopes(e.target.checked ? [...scopes, sc] : scopes.filter((x) => x !== sc))} /> {sc}: {SCOPE_LABELS[sc]}
						</label>
					))}
				</fieldset>
				{own.length > 1 && (
					<fieldset className="ca-plain">
						<legend className="ca-field-label">Sites (none checked: every site)</legend>
						{own.map((st) => (
							<label key={st.id} className="ca-check">
								<input type="checkbox" checked={only.includes(st.id)} onChange={(e) => setOnly(e.target.checked ? [...only, st.id] : only.filter((x) => x !== st.id))} /> {st.label}
							</label>
						))}
					</fieldset>
				)}
				<Text label="Expires after (optional)" type="date" value={expires} onChange={setExpires} />
				<Button variant="primary" size="sm" type="submit" disabled={busy || !label.trim() || scopes.length === 0}>
					Create key
				</Button>
			</form>
		</section>
	);
}

const TABS = [
	["goals", "Goals"],
	["funnels", "Funnels"],
	["segments", "Segments"],
	["channels", "Channel rules"],
	["user-agents", "User agent rules"],
	["utm", "UTM builder"],
	["keys", "API keys"],
	["sites", "Sites"],
] as const;
type Tab = (typeof TABS)[number][0];
/** Master-level tabs, shown with the local site only; user agent rules are one set for every site. */
const MASTER_TABS: readonly Tab[] = ["user-agents", "keys", "sites"];

function Body({ view }: { view: View }) {
	const tabs = view.site.local ? TABS : TABS.filter(([id]) => !MASTER_TABS.includes(id));
	const current = activeTab(tabs, view.state.tab);
	const label = tabs.find((t) => t[0] === current)?.[1];
	// `?new=1` opens the New form of the first tab shown only; dropping it keeps a reload or Back from opening it again.
	const [startNew] = useState(view.state.new ? current : null);
	useEffect(() => {
		if (view.state.new) view.update({ new: undefined });
	}, []);
	// The last 90 days up to today in the site's timezone: the definitions have no range of their own.
	const today = dayInZone(Math.floor(Date.now() / 1000), view.tz);
	const suggest = useMemo<SuggestSource>(() => ({ site: view.site.id, ...suggestRange(today, addDays) }), [view.site.id, today]);
	if (isRemote(view.site)) return <RemoteNotice site={view.site} path="/config" />;
	return (
		<SuggestCtx.Provider value={suggest}>
			{!view.site.local && <Notice>Definitions of the client site {view.site.label}. User agent rules, API keys and client sites are managed with this install selected.</Notice>}
			<Tabs tabs={tabs} value={current} onChange={(id) => view.update({ tab: tabParam(tabs, id) })} />
			<div role="tabpanel" aria-label={label}>
				{current === "goals" && <Goals startNew={startNew === "goals"} />}
				{current === "funnels" && <Funnels startNew={startNew === "funnels"} />}
				{current === "segments" && <Segments startNew={startNew === "segments"} />}
				{current === "channels" && <ChannelRules />}
				{current === "user-agents" && <UserAgentRules />}
				{current === "utm" && <UtmBuilder />}
				{current === "keys" && <ApiKeys tz={view.tz} sites={view.sites} />}
				{current === "sites" && <Sites />}
			</div>
		</SuggestCtx.Provider>
	);
}

export default function Config() {
	return (
		<Shell title="Definitions" controls="site" docs={({ tab }) => (tab === "sites" ? "Multi-Site-and-Sites-View" : "Definitions")}>
			{(v) => <Body view={v} />}
		</Shell>
	);
}
