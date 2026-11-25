/** Shared pieces: tabs, segmented switch, info marker with fixed caveat texts, notice, empty state, loading, field label. */
import { Button, DropdownMenu, Loader } from "@cloudflare/kumo";
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useId, useState } from "react";
import { CAVEATS, type Caveat } from "../../charts/caveats.js";

export { CAVEATS, type Caveat } from "../../charts/caveats.js";

/**
 * Info button next to a caveated number; the text shows on hover (title) and on click or Enter. `name` names what it
 * explains ("About Impressions" in a column header), so the buttons of one table are told apart.
 */
export function InfoMark({ caveat, text, name }: { caveat?: Caveat; text?: string; name?: string }) {
	const [open, setOpen] = useState(false);
	const body = text ?? (caveat ? CAVEATS[caveat] : "");
	return (
		<span className="ca-info">
			<button type="button" className="ca-info-btn" aria-label={name ? `About ${name}` : "About this number"} aria-expanded={open} title={body} onClick={() => setOpen(!open)}>
				i
			</button>
			{open && (
				<span role="note" className="ca-info-text">
					{body}
				</span>
			)}
		</span>
	);
}

/** Moves focus between sibling buttons with the arrow keys, Home and End (WAI-ARIA tabs and toolbars). */
function arrowFocus(e: KeyboardEvent<HTMLElement>, selector: string): HTMLElement | null {
	const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
	if (!keys.includes(e.key)) return null;
	const list = [...(e.currentTarget.querySelectorAll<HTMLElement>(selector) ?? [])];
	const i = list.indexOf(document.activeElement as HTMLElement);
	const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length;
	const el = list[next] ?? null;
	if (el) {
		e.preventDefault();
		el.focus();
	}
	return el;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: ReadonlyArray<readonly [T, string]>; value: T; onChange: (v: T) => void; label?: string }) {
	return (
		<div role="tablist" aria-label={label} className="ca-tabs" onKeyDown={(e) => arrowFocus(e, "[role=tab]")?.click()}>
			{tabs.map(([id, text]) => (
				<button key={id} type="button" role="tab" className="ca-tab" aria-selected={id === value} tabIndex={id === value ? 0 : -1} onClick={() => onChange(id)}>
					{text}
				</button>
			))}
		</div>
	);
}

/** One-of-n switch as pressed buttons in a labeled group (source switch, "Links by"). */
export function Segmented<T extends string>({ label, value, options, onChange, showLabel = true, radio = false }: { label: string; value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void; showLabel?: boolean; radio?: boolean }) {
	// `radio`: a choice of form mode (radiogroup, arrows select); otherwise a view switch of pressed buttons.
	const group = (
		<div role={radio ? "radiogroup" : "group"} aria-label={label} className="ca-seg" onKeyDown={(e) => (radio ? arrowFocus(e, "button")?.click() : arrowFocus(e, "button"))}>
			{options.map(([id, text]) => (
				<button
					key={id}
					type="button"
					className="ca-seg-btn"
					{...(radio ? { role: "radio", "aria-checked": value === id, tabIndex: value === id ? 0 : -1 } : { "aria-pressed": value === id })}
					onClick={() => onChange(id)}
				>
					{text}
				</button>
			))}
		</div>
	);
	return showLabel ? (
		<div className="ca-seg-wrap">
			<span className="ca-field-label" aria-hidden>
				{label}
			</span>
			{group}
		</div>
	) : (
		group
	);
}

export type Tone = "error" | "warning" | "info" | "success";
export const TONE_LABEL: Record<Tone, string> = { error: "Error", warning: "Warning", info: "Note", success: "Done" };
export const TONE_ICON: Record<Tone, ReactNode> = {
	error: <path d="M8 1.5 15 14H1L8 1.5Zm0 4.5v4m0 2v.01" />,
	warning: <path d="M8 1.5 15 14H1L8 1.5Zm0 4.5v4m0 2v.01" />,
	info: <path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0-8v4.5M8 4.5v.01" />,
	success: <path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM5 8.2l2 2 4-4.2" />,
};

/**
 * Message box in theme colors: icon and a label word carry the tone besides the color. Errors are announced
 * (`role="alert"`), the rest are polite status messages. `label` replaces the default word ("Error", "Warning").
 */
export function Notice({ tone = "info", label, children, action }: { tone?: Tone; label?: string; children: ReactNode; action?: ReactNode }) {
	return (
		<div className={`ca-notice ca-notice--${tone}`} role={tone === "error" ? "alert" : "status"} data-tone={tone}>
			<svg className="ca-notice-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				{TONE_ICON[tone]}
			</svg>
			<div className="ca-notice-body">
				{/* The tone word is generated content (`::before`), so it shows and is read without changing the message text. */}
				<div className="ca-notice-text" data-label={label ?? TONE_LABEL[tone]}>
					{children}
				</div>
				{action && <div className="ca-actions">{action}</div>}
			</div>
		</div>
	);
}

/**
 * Props of a table row that opens something: a click anywhere on it (not on its own links and controls, not after
 * selecting text), or Enter while the row has focus. The row is the one tab stop; its main button (`ROW_MAIN`) stays
 * for screen readers and pointer users but leaves the tab order.
 */
export function rowLink(open: () => void) {
	return {
		className: "ca-rowlink",
		tabIndex: 0,
		onClick: (e: MouseEvent) => {
			if (!window.getSelection()?.toString() && !(e.target as Element).closest("button, a, input, select, textarea, label")) open();
		},
		onKeyDown: (e: KeyboardEvent) => {
			if (e.key === "Enter" && e.target === e.currentTarget) (e.preventDefault(), open());
		},
	};
}
/** Props of a row's main button: out of the tab order, since the row itself takes focus. */
export const ROW_MAIN = { className: "ca-rowlink-main", tabIndex: -1 } as const;

/** Empty state: what is missing, why, and at most one action. */
export function Empty({ children = "No data for this range and these filters.", hint, action }: { children?: ReactNode; hint?: ReactNode; action?: { label: string; onClick: () => void } | undefined }) {
	return (
		<div className="ca-empty">
			<p className="ca-empty-title">{children}</p>
			{hint && <p className="ca-small">{hint}</p>}
			{action && (
				<Button size="sm" variant="secondary" onClick={action.onClick}>
					{action.label}
				</Button>
			)}
		</div>
	);
}

export function Loading({ children = "Loading" }: { children?: ReactNode }) {
	return (
		<p className="ca-loading" aria-busy="true">
			<Loader size="sm" />
			<span>{children}</span>
		</p>
	);
}

/** Visible label above a native control (select); the control keeps its own `aria-label`. */
export function Field({ label, children, help }: { label: string; children: ReactNode; help?: ReactNode }) {
	const field = (
		<label className="ca-field">
			<span className="ca-field-label">{label}</span>
			{children}
		</label>
	);
	// Help stays outside the label, so the control's name is the label alone.
	return help ? (
		<span className="ca-field">
			{field}
			<span className="ca-help">{help}</span>
		</span>
	) : (
		field
	);
}

/** Chart toolbar toggle for annotation markers; the state lives in the URL (`ann=0`). */
export function AnnotationsToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
	return (
		<Button size="sm" variant={on ? "secondary" : "ghost"} className="ca-annotations-toggle" aria-pressed={on} onClick={() => onChange(!on)}>
			Annotations
		</Button>
	);
}

/** Three vertical dots, drawn (the host's icon set is not a dependency). */
function KebabIcon() {
	return (
		<svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" fill="currentColor">
			<circle cx="8" cy="3" r="1.5" />
			<circle cx="8" cy="8" r="1.5" />
			<circle cx="8" cy="13" r="1.5" />
		</svg>
	);
}

/** A checkable menu entry, for example one table column. */
export interface MenuCheck {
	label: string;
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
}

/**
 * Kebab button with a small action menu (Kumo `DropdownMenu`, Base UI menu): `aria-haspopup="menu"` and
 * `aria-expanded` on the button, `menu` and `menuitem` roles, arrow keys, Escape, outside click and focus return.
 * `checks` follow under a "Columns" label and keep the menu open. A menu of one action is that action as a button.
 */
export function KebabMenu({ label, items, checks = [] }: { label: string; items: ReadonlyArray<{ label: string; onSelect: () => void }>; checks?: readonly MenuCheck[] }) {
	const [only] = items;
	if (only && items.length === 1 && !checks.length)
		return (
			<Button variant="ghost" size="sm" className="ca-kebab" onClick={only.onSelect}>
				{only.label}
			</Button>
		);
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger render={<Button variant="ghost" shape="square" size="sm" className="ca-kebab" aria-label={label} />}>
				<KebabIcon />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" className="ca-menu">
				{items.map((it) => (
					<DropdownMenu.Item key={it.label} onClick={it.onSelect}>
						{it.label}
					</DropdownMenu.Item>
				))}
				{checks.length > 0 && (
					<>
						{items.length > 0 && <DropdownMenu.Separator />}
						<DropdownMenu.Group>
							<DropdownMenu.Label>Columns</DropdownMenu.Label>
							{checks.map((c) => (
								<DropdownMenu.CheckboxItem key={c.label} checked={c.checked} disabled={c.disabled ?? false} onCheckedChange={c.onChange}>
									{c.label}
								</DropdownMenu.CheckboxItem>
							))}
						</DropdownMenu.Group>
					</>
				)}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

/**
 * Show or hide a block under a plain label with a chevron (no browser `details` triangle). `open` opens it
 * when it turns true (for example a source falls into Error); the visitor can still close it.
 */
export function Disclosure({ label, open = false, children, className }: { label: string; open?: boolean; children: ReactNode; className?: string }) {
	const [shown, setShown] = useState(open);
	useEffect(() => {
		if (open) setShown(true);
	}, [open]);
	const id = useId();
	return (
		<div className={`ca-disclosure${className ? ` ${className}` : ""}`}>
			<button type="button" className="ca-disclosure-toggle" aria-expanded={shown} aria-controls={id} onClick={() => setShown(!shown)}>
				<svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
					<path d="M6 4l4 4-4 4" />
				</svg>
				{label}
			</button>
			<div id={id} className="ca-disclosure-body" hidden={!shown}>
				{children}
			</div>
		</div>
	);
}
