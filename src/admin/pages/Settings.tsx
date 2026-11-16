/**
 * Settings page: the plugin settings in sections (`settings/get`), one section at a time, each saved on its own
 * through `settings/save`, which writes only the changed keys and answers an error per field. The section is in the
 * URL (`?tab=`, Back returns to the previous one). Search sign-in is shown read only: it is changed on the Search page.
 */
import { Button } from "@cloudflare/kumo";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { PLUGIN_ID, PRODUCT_NAME, PRODUCT_URL, VERSION } from "../../contract.js";
import type { FieldMeta, settingsRoutes } from "../../routes/settings.js";
import { call, errorText } from "../api.js";
import { Disclosure, InfoMark, Loading, Notice } from "../components/ui.js";

type Loaded = Awaited<ReturnType<ReturnType<typeof settingsRoutes>["settings/get"]["handler"]>>;
type Section = Loaded["sections"][number];
type Value = string | number | boolean;
type SaveResult = { saved: true; values: Record<string, Value> } | { saved: false; errors: Record<string, string> };

const pageHref = (path: string) => `/_emdash/admin/plugins/${PLUGIN_ID}${path}`;
const TIMEZONE_KEYS: ReadonlySet<string> = new Set(["siteTimezone", "saltTimezone"]);
/** Choices of up to this many options are radio buttons, the rest a select. */
const RADIO_MAX = 3;

export const SETTINGS_TEXT = {
	intro: "These apply to the whole install. Each section is saved on its own.",
	changed: "Changed, not saved",
	saved: "Saved.",
	refused: (n: number) => (n === 1 ? "1 value is not valid. Nothing in this section was saved." : `${n} values are not valid. Nothing in this section was saved.`),
	searchOnly: "Search sign-in is changed on the Search page, so a page opened earlier cannot undo a connection.",
	noSearch: "No Search source is connected yet. These settings apply once one is.",
	leave: "Settings changed and not saved.",
} as const;

const tabOf = (sections: readonly Section[]) => {
	const t = new URLSearchParams(location.search).get("tab");
	return sections.some((s) => s.id === t) ? (t as string) : (sections[0]?.id ?? "");
};

/** A value as words: on or off, an option's label, "empty". */
function shown(f: FieldMeta, v: Value | undefined): string {
	if (typeof v === "boolean") return v ? "on" : "off";
	if (v === undefined || v === "") return "empty";
	const opt = f.options?.find((o) => o.value === v);
	return opt ? opt.label : `${String(v).replace(/\n/g, ", ")}${f.unit ? ` ${f.unit}` : ""}`;
}

function zones(current: string): string[] {
	const all = (Intl as { supportedValuesOf?(k: string): string[] }).supportedValuesOf?.("timeZone") ?? [];
	return [...new Set(["UTC", current, ...all])].filter(Boolean);
}

function Control({ f, id, value, set, describedBy, invalid }: { f: FieldMeta; id: string; value: Value; set: (v: Value) => void; describedBy: string; invalid: boolean }) {
	const aria = { id, "aria-describedby": describedBy, "aria-invalid": invalid || undefined };
	if (TIMEZONE_KEYS.has(f.key) && zones("").length > 1)
		return (
			<select {...aria} value={String(value)} onChange={(e) => set(e.target.value)}>
				{zones(String(value)).map((z) => (
					<option key={z}>{z}</option>
				))}
			</select>
		);
	if (f.type === "select")
		return (
			<select {...aria} value={String(value)} onChange={(e) => set(e.target.value)}>
				{f.options?.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		);
	if (f.type === "number")
		return (
			<span className="ca-set-unit">
				<input {...aria} type="number" inputMode="numeric" step={1} min={f.min} max={f.max} value={value === "" ? "" : Number(value)} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))} />
				{f.unit && <span className="ca-small">{f.unit}</span>}
			</span>
		);
	if (f.multiline) return <textarea {...aria} rows={4} value={String(value)} onChange={(e) => set(e.target.value)} />;
	return <input {...aria} type="text" inputMode={f.type === "url" ? "url" : undefined} autoComplete="off" spellCheck={false} value={String(value)} onChange={(e) => set(e.target.value)} />;
}

function SettingField({ f, value, set, error }: { f: FieldMeta; value: Value; set: (v: Value) => void; error?: string | undefined }) {
	const id = `ca-set-${f.key}`;
	const helpId = `${id}-help`;
	const errId = `${id}-error`;
	const describedBy = error ? `${errId} ${helpId}` : helpId;
	const changed = f.default !== undefined && value !== f.default;
	const foot = (
		<>
			<p className="ca-help" id={helpId}>
				{f.help}
				{f.key === "siteId" && " Changing it starts a new data set: earlier rows stay under the old id."}
				{f.more && <InfoMark text={f.more} />}
			</p>
			{changed && (
				<p className="ca-small">
					Default: {shown(f, f.default)}.{" "}
					<button type="button" className="ca-linkbtn" onClick={() => set(f.default as Value)}>
						Reset<span className="ca-sr-only"> {f.label}</span>
					</button>
				</p>
			)}
			{error && (
				<p className="ca-field-error" id={errId}>
					{error}
				</p>
			)}
		</>
	);
	if (f.type === "boolean")
		return (
			<div className="ca-set-field">
				<label className="ca-check">
					<input id={id} type="checkbox" checked={value === true} aria-describedby={describedBy} aria-invalid={!!error || undefined} onChange={(e) => set(e.target.checked)} />
					<span className="ca-set-label">{f.label}</span>
				</label>
				{foot}
			</div>
		);
	if (f.type === "select" && (f.options?.length ?? 0) <= RADIO_MAX)
		return (
			<fieldset className="ca-set-field ca-set-choice" aria-describedby={describedBy}>
				<legend className="ca-set-label">{f.label}</legend>
				{f.options?.map((o, i) => (
					<label key={o.value} className="ca-check">
						<input id={i === 0 ? id : undefined} type="radio" name={id} checked={value === o.value} onChange={() => set(o.value)} />
						{o.label}
					</label>
				))}
				{foot}
			</fieldset>
		);
	return (
		<div className="ca-set-field">
			<label className="ca-set-label" htmlFor={id}>
				{f.label}
			</label>
			<Control f={f} id={id} value={value} set={set} describedBy={describedBy} invalid={!!error} />
			{foot}
		</div>
	);
}

function ReadOnly({ section, data }: { section: Section; data: Loaded }) {
	return (
		<>
			<Notice tone="info" action={<a href={pageHref("/search")}>Open Search connections</a>}>
				{SETTINGS_TEXT.searchOnly}
			</Notice>
			<dl className="ca-set-ro">
				{section.fields.map((f) => (
					<div key={f.key}>
						<dt>{f.label}</dt>
						<dd>{f.type === "secret" ? (data.secrets[f.key] ? "Set" : "Not set") : data.values[f.key] === "" ? "Not set" : typeof data.values[f.key] === "boolean" ? (data.values[f.key] ? "On" : "Off") : shown(f, data.values[f.key])}</dd>
					</div>
				))}
			</dl>
		</>
	);
}

function SectionForm({ section, data, draft, setDraft, errors, onSave, onOpen, status, busy }: {
	section: Section;
	data: Loaded;
	draft: Record<string, Value>;
	setDraft: (key: string, v: Value) => void;
	errors: Record<string, string>;
	onSave: () => void;
	onOpen: (id: string) => void;
	status: ReactNode;
	busy: boolean;
}) {
	const value = (k: string) => (k in draft ? (draft[k] as Value) : (data.values[k] as Value));
	// A field that only matters while a switch is on hides with it (the stored value stays).
	const visible = section.fields.filter((f) => !f.when || value(f.when) === true);
	const field = (f: FieldMeta) => <SettingField key={f.key} f={f} value={value(f.key)} set={(v) => setDraft(f.key, v)} error={errors[f.key]} />;
	const main = visible.filter((f) => !f.advanced);
	const adv = visible.filter((f) => f.advanced);
	const submit = (e: FormEvent) => {
		e.preventDefault();
		onSave();
	};
	return (
		<form className="ca-panel ca-set-form" noValidate aria-labelledby="ca-set-title" onSubmit={submit}>
			<h2 id="ca-set-title">{section.label}</h2>
			{section.id === "search" && !data.search.google && !data.search.bing && (
				<Notice tone="info" action={<a href={pageHref("/search")}>Open Search</a>}>
					{SETTINGS_TEXT.noSearch}
				</Notice>
			)}
			{section.readOnly ? (
				<ReadOnly section={section} data={data} />
			) : (
				<>
					<div className="ca-set-fields">{main.map(field)}</div>
					{section.id === "revenue" && (
						<p className="ca-help">
							Default currency: {String(data.values.defaultCurrency)}. It is set under{" "}
							<button type="button" className="ca-linkbtn" onClick={() => onOpen("general")}>
								General
							</button>
							.
						</p>
					)}
					{section.id === "revenue" && (
						<p className="ca-help">
							<a href={pageHref("/revenue")}>See the figures</a> on the Revenue page.
						</p>
					)}
					{section.id === "data" && (
						<p className="ca-help">
							<a href={pageHref("/data")}>See what is stored</a> on the Data page.
						</p>
					)}
					{adv.length > 0 && (
						// Opens by itself when a refused value sits inside.
						<Disclosure label="Advanced" open={adv.some((f) => errors[f.key])}>
							<div className="ca-set-fields">{adv.map(field)}</div>
						</Disclosure>
					)}
					<div className="ca-set-foot">
						<Button type="submit" variant="primary" size="sm" disabled={busy}>
							Save {section.label}
						</Button>
						<span role="status" className="ca-small">
							{status}
						</span>
					</div>
				</>
			)}
		</form>
	);
}

/** The settings page body, apart from the page frame. */
export function SettingsBody() {
	const [data, setData] = useState<Loaded | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [tab, setTab] = useState("");
	const [draft, setDraftState] = useState<Record<string, Value>>({});
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saved, setSaved] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		call<Loaded>("settings/get").then(
			(d) => {
				setData(d);
				setTab(tabOf(d.sections));
			},
			(e: unknown) => setLoadError(errorText(e)),
		);
	}, []);
	useEffect(() => {
		if (!data) return;
		const back = () => setTab(tabOf(data.sections));
		addEventListener("popstate", back);
		return () => removeEventListener("popstate", back);
	}, [data]);
	const current = (k: string) => (k in draft ? draft[k] : data?.values[k]);
	// A field hidden by its switch is not sent: its draft cannot block the save with no field on screen.
	const dirtyKeys = (s: Section) => s.fields.filter((f) => (!f.when || current(f.when) === true) && f.key in draft && draft[f.key] !== data?.values[f.key]).map((f) => f.key);
	const anyDirty = !!data && data.sections.some((s) => dirtyKeys(s).length > 0);
	useEffect(() => {
		if (!anyDirty) return;
		const warn = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = SETTINGS_TEXT.leave;
		};
		addEventListener("beforeunload", warn);
		return () => removeEventListener("beforeunload", warn);
	}, [anyDirty]);

	if (loadError) return <Notice tone="error">{loadError}</Notice>;
	if (!data) return <Loading />;
	const section = data.sections.find((s) => s.id === tab) ?? data.sections[0];
	if (!section) return null;

	const open = (id: string) => {
		if (id === section.id) return;
		const u = new URL(location.href);
		u.searchParams.set("tab", id);
		// A section change is a step Back can undo.
		history.pushState(null, "", u);
		setTab(id);
		setSaved(null);
		setSaveError(null);
	};
	const setDraft = (key: string, v: Value) => {
		setDraftState((d) => ({ ...d, [key]: v }));
		setSaved(null);
		if (errors[key]) setErrors(({ [key]: _, ...rest }) => rest);
	};
	const save = async () => {
		const keys = dirtyKeys(section);
		setSaved(null);
		setSaveError(null);
		if (!keys.length) return setSaved("Nothing changed.");
		setBusy(true);
		try {
			const r = await call<SaveResult>("settings/save", { values: Object.fromEntries(keys.map((k) => [k, draft[k]])) });
			if (r.saved) {
				setData({ ...data, values: { ...data.values, ...r.values } });
				setDraftState(({ ...d }) => (keys.forEach((k) => delete d[k]), d));
				setErrors({});
				setSaved(SETTINGS_TEXT.saved);
			} else {
				setErrors(r.errors);
				setSaveError(SETTINGS_TEXT.refused(Object.keys(r.errors).length));
				const first = section.fields.find((f) => r.errors[f.key]);
				// After the Advanced disclosure opened for it.
				if (first) setTimeout(() => document.getElementById(`ca-set-${first.key}`)?.focus(), 0);
			}
		} catch (e) {
			setSaveError(errorText(e));
		} finally {
			setBusy(false);
		}
	};
	const dirty = new Set(data.sections.filter((s) => dirtyKeys(s).length).map((s) => s.id));
	const status = busy ? "Saving" : dirty.has(section.id) ? SETTINGS_TEXT.changed : saved;

	return (
		<div className="ca-settings">
			<nav className="ca-set-nav" aria-label="Settings sections">
				{data.sections.map((s) => (
					<button key={s.id} type="button" className="ca-set-navbtn" aria-current={s.id === section.id ? "page" : undefined} onClick={() => open(s.id)}>
						{s.label}
						{dirty.has(s.id) && <span className="ca-set-dot" title={SETTINGS_TEXT.changed} aria-label={SETTINGS_TEXT.changed} role="img" />}
					</button>
				))}
			</nav>
			<label className="ca-field ca-set-select">
				<span className="ca-field-label">Section</span>
				<select value={section.id} onChange={(e) => open(e.target.value)}>
					{data.sections.map((s) => (
						<option key={s.id} value={s.id}>
							{s.label}
							{dirty.has(s.id) ? ` (${SETTINGS_TEXT.changed.toLowerCase()})` : ""}
						</option>
					))}
				</select>
			</label>
			<div className="ca-stack">
				{saveError && <Notice tone="error">{saveError}</Notice>}
				<SectionForm key={section.id} section={section} data={data} draft={draft} setDraft={setDraft} errors={errors} onSave={() => void save()} onOpen={open} status={status} busy={busy} />
			</div>
		</div>
	);
}

export default function Settings() {
	return (
		<div className="ca-root ca-shell">
			<div className="ca-page-head">
				<h1>Settings</h1>
				<span className="ca-sub">{SETTINGS_TEXT.intro}</span>
			</div>
			<SettingsBody />
			<footer className="ca-footer">
				<a href={PRODUCT_URL} target="_blank" rel="noopener noreferrer">{PRODUCT_NAME}</a> {VERSION}
			</footer>
		</div>
	);
}
