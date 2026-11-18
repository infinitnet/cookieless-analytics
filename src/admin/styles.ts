/**
 * The one admin stylesheet, injected once by the admin entry. Layout, spacing, focus and the few native controls
 * Kumo has no drop-in for (select, checkbox, radio). Every color is a host (Kumo) token, so light and dark both work.
 * It sits in the host's `components` layer: Kumo's utilities still win on Kumo elements, the host preflight loses.
 */
export const STYLE_ID = "ca-admin-style";

const T = {
	fg: "var(--text-color-kumo-default, CanvasText)",
	strong: "var(--text-color-kumo-strong, CanvasText)",
	muted: "var(--text-color-kumo-subtle, GrayText)",
	surface: "var(--color-kumo-base, Canvas)",
	sunken: "var(--color-kumo-recessed, Canvas)",
	hover: "var(--color-kumo-tint, Canvas)",
	line: "var(--color-kumo-hairline, GrayText)",
	accent: "var(--color-kumo-brand, Highlight)",
	focus: "var(--color-kumo-brand, Highlight)",
	link: "var(--text-color-kumo-link, LinkText)",
};

export const ADMIN_CSS = `@layer components {
.ca-root {
	--ca-1: 4px; --ca-2: 8px; --ca-3: 12px; --ca-4: 16px; --ca-6: 24px; --ca-radius: 8px;
	--ca-fg: ${T.fg}; --ca-strong: ${T.strong}; --ca-muted: ${T.muted};
	--ca-muted-text: color-mix(in oklab, var(--ca-muted) 75%, var(--ca-fg));
	--ca-surface: ${T.surface}; --ca-sunken: ${T.sunken}; --ca-hover: ${T.hover}; --ca-line: ${T.line};
	--ca-field-border: color-mix(in oklab, var(--ca-fg) 32%, transparent);
	--ca-accent: ${T.accent}; --ca-focus: ${T.focus}; --ca-link: ${T.link};
	--ca-good: var(--text-color-kumo-success, CanvasText); --ca-bad: var(--text-color-kumo-danger, CanvasText);
	--ca-shadow: 0 8px 24px color-mix(in oklab, var(--color-kumo-contrast, CanvasText) 16%, transparent);
	--ca-series-1: light-dark(var(--color-kumo-brand, Highlight), var(--color-blue-400, oklch(70.7% .165 254.624)));
	--ca-series-2: light-dark(var(--color-emerald-600, oklch(59.6% .145 163.225)), var(--color-emerald-400, oklch(76.5% .177 163.223)));
	--ca-series-3: light-dark(var(--color-orange-600, oklch(64.6% .222 41.116)), var(--color-orange-400, oklch(75% .183 55.934)));
	--ca-series-4: light-dark(var(--color-pink-600, oklch(59.2% .249 .584)), var(--color-pink-400, oklch(71.8% .202 349.761)));
	--ca-series-5: light-dark(var(--color-purple-600, oklch(55.8% .288 302.321)), var(--color-purple-400, oklch(71.4% .203 305.504)));
	--ca-series-6: light-dark(var(--color-teal-700, oklch(51.1% .096 186.391)), var(--color-teal-400, oklch(77.7% .152 181.912)));
	--ca-series-7: var(--ca-muted);
	color: var(--ca-fg); font-size: 14px; line-height: 1.5; display: grid; gap: var(--ca-4); min-width: 0;
}
.ca-root :where(h1, h2, h3, h4) { color: var(--ca-strong); margin: 0; line-height: 1.3; text-wrap: balance; }
.ca-root :where(h1) { font-size: 20px; font-weight: 600; }
.ca-root :where(h2) { font-size: 16px; font-weight: 600; }
.ca-root :where(h3) { font-size: 14px; font-weight: 600; }
.ca-root :where(p) { margin: 0; }
.ca-root :where(ul, ol) { margin: 0; padding-left: var(--ca-4); }
.ca-root :where(a) { color: var(--ca-link); text-decoration: underline; text-underline-offset: 2px; }
.ca-root :where(code) { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; background: var(--ca-sunken); border-radius: 4px; padding: 1px 4px; overflow-wrap: anywhere; }
.ca-root :where(fieldset) { border: 1px solid var(--ca-line); border-radius: var(--ca-radius); padding: var(--ca-3) var(--ca-4); margin: 0; min-width: 0; display: grid; gap: var(--ca-3); }
.ca-root :where(legend) { font-weight: 600; color: var(--ca-strong); padding: 0 var(--ca-1); }
.ca-root :where(dl) { margin: 0; }
.ca-root :where(dd) { margin: 0; }
.ca-root :where(label) { color: var(--ca-fg); }
.ca-root ::selection { background: color-mix(in oklab, var(--ca-accent) 30%, transparent); }
.ca-root :where(a, button, select, input, textarea, [tabindex]):focus-visible { outline: 2px solid var(--ca-focus); outline-offset: 2px; }

/* Native controls Kumo has no drop-in for, and a net for any plain one: never browser-default under the host preflight. */
.ca-root :where(select, textarea, input:not([type=checkbox], [type=radio], [type=range], [type=file], [type=color])):where(:not([class*="kumo"])) {
	font: inherit; font-size: 14px; color: var(--ca-fg); background-color: var(--color-kumo-control, Field);
	border: 1px solid var(--ca-field-border); border-radius: var(--ca-radius); min-width: 0; max-width: 100%;
}
.ca-root :where(select, input:not([type=checkbox], [type=radio], [type=range], [type=file], [type=color])):where(:not([class*="kumo"])) { height: 36px; padding: 0 var(--ca-3); }
/* Drawn chevron 12px from the border; text stops 36px from it. Mid gray holds 3:1 on light and dark fields. */
.ca-root :where(select):where(:not([class*="kumo"], [multiple])) {
	appearance: none; -webkit-appearance: none; padding-right: 36px; cursor: pointer;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='gray' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
	background-repeat: no-repeat; background-position: right 12px center; background-size: 14px 14px;
	text-overflow: ellipsis;
}
.ca-root :where(textarea):where(:not([class*="kumo"])) { padding: var(--ca-2) var(--ca-3); width: 100%; resize: vertical; }
.ca-root :where(select, input, textarea):disabled { opacity: .6; cursor: not-allowed; }
.ca-root :where(input[type=checkbox], input[type=radio]) { accent-color: var(--ca-accent); width: 16px; height: 16px; margin: 0; flex: none; }
.ca-root :where(button):where(:not([data-kumo-component], .ca-linkbtn, .ca-tab, .ca-seg-btn, .ca-kpi-value, .ca-info-btn, .ca-sort)) {
	font: inherit; font-size: 13px; font-weight: 500; color: var(--ca-fg); background: var(--ca-surface);
	border: 1px solid var(--ca-field-border); border-radius: var(--ca-radius); height: 32px; padding: 0 var(--ca-3); cursor: pointer;
}
.ca-root :where(button):where(:not([data-kumo-component], .ca-linkbtn, .ca-tab, .ca-seg-btn, .ca-kpi-value, .ca-info-btn, .ca-sort)):hover:not(:disabled) { background: var(--ca-hover); }
.ca-root :where(button):disabled { opacity: .55; cursor: not-allowed; }

/* Plain sections, tab panels and forms stack with the spacing scale; inline controls keep their width. */
.ca-root :where([role=tabpanel], section, form, [role=form]) { display: grid; gap: var(--ca-3); min-width: 0; align-content: start; }
.ca-root :where([role=tabpanel], section, form, [role=form], .ca-stack, .ca-panel, .ca-section) > :where(button, a, label, select, input, small, .ca-field, .ca-actions, .ca-seg, .ca-seg-wrap, .ca-check) { justify-self: start; }
.ca-root :where(input[type=file]) { font: inherit; font-size: 13px; color: var(--ca-muted); }
.ca-root ::file-selector-button { font: inherit; font-size: 13px; font-weight: 500; color: var(--ca-fg); background: var(--ca-surface); border: 1px solid var(--ca-field-border); border-radius: var(--ca-radius); height: 32px; padding: 0 var(--ca-3); margin-right: var(--ca-2); cursor: pointer; }

/* Page frame */
.ca-page-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--ca-2) var(--ca-4); }
.ca-sub { color: var(--ca-muted-text); font-size: 13px; }
.ca-small { font-size: 12px; color: var(--ca-muted-text); }
/* Muted at the size of its surroundings, for an absent value in a table cell. */
.ca-muted { color: var(--ca-muted-text); }
.ca-section { display: grid; gap: var(--ca-3); min-width: 0; }
.ca-stack { display: grid; gap: var(--ca-3); min-width: 0; align-content: start; }
.ca-row, .ca-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ca-2); min-width: 0; }
.ca-row-end { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--ca-2) var(--ca-3); min-width: 0; }
.ca-spread { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ca-2) var(--ca-3); min-width: 0; }
.ca-footer { font-size: 12px; color: var(--ca-muted-text); padding-top: var(--ca-2); }
.ca-shell { position: relative; }
.ca-root .ca-skip { position: absolute; top: 0; left: 0; z-index: 5; box-shadow: var(--ca-shadow); }
/* Pinned to the corner of their containing block: at their static place inside a scrolling table they widened the page. */
.ca-root .ca-skip:not(:focus), .ca-sr-only, .ca-sr { position: absolute; top: 0; left: 0; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* Header: site, range, comparison, segment, filters */
.ca-header { display: grid; gap: var(--ca-3); padding: var(--ca-3) var(--ca-4); background: var(--ca-surface); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); min-width: 0; }
.ca-header-row, .ca-daterange { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--ca-2) var(--ca-3); min-width: 0; }
.ca-field { display: inline-grid; gap: var(--ca-1); min-width: 0; align-content: start; }
.ca-field-label { font-size: 12px; font-weight: 500; color: var(--ca-muted-text); }
:where(.ca-form, .ca-dialog) .ca-field-label { font-size: 14px; color: var(--ca-fg); }
.ca-help { font-size: 12px; color: var(--ca-muted-text); }
.ca-compare-range { font-size: 12px; color: var(--ca-muted); align-self: center; padding-top: 18px; }
.ca-head-body { display: grid; gap: var(--ca-3); min-width: 0; }
.ca-head-toggle { display: none; align-items: center; gap: var(--ca-2); width: 100%; min-height: 32px; font: inherit; font-size: 13px; font-weight: 500; text-align: left; color: var(--ca-fg); background: none; border: 0; padding: var(--ca-1); margin: calc(-1 * var(--ca-1)); border-radius: 6px; cursor: pointer; }
.ca-head-toggle:hover { background: var(--ca-hover); }
.ca-head-toggle > svg { flex: none; color: var(--ca-muted); transition: transform 120ms ease-out; }
.ca-head-toggle[aria-expanded=true] > svg { transform: rotate(90deg); }
.ca-live { display: inline-flex; align-items: center; gap: var(--ca-2); font-size: 13px; font-weight: 500; padding: 2px var(--ca-3); border: 1px solid var(--ca-line); border-radius: 999px; background: var(--ca-surface); font-variant-numeric: tabular-nums; }
.ca-page-head > .ca-sub { color: var(--ca-fg); }
.ca-page-head > .ca-learn { margin-left: auto; font-size: 13px; }
.ca-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ca-good); }
.ca-filterbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ca-2); padding-top: var(--ca-3); border-top: 1px solid var(--ca-line); min-width: 0; }
.ca-filter-add, .ca-save-segment, .ca-advanced form { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--ca-2); min-width: 0; }
.ca-disclosure { display: grid; gap: var(--ca-2); min-width: 0; }
.ca-disclosure-toggle { display: inline-flex; align-items: center; gap: var(--ca-1); justify-self: start; font: inherit; font-size: 13px; font-weight: 500; color: var(--ca-strong); background: none; border: 0; padding: var(--ca-1) var(--ca-2) var(--ca-1) var(--ca-1); margin-left: calc(-1 * var(--ca-1)); border-radius: 6px; cursor: pointer; }
.ca-disclosure-toggle:hover { background: var(--ca-hover); }
.ca-disclosure-toggle > svg { flex: none; color: var(--ca-muted); transition: transform 120ms ease-out; }
.ca-disclosure-toggle[aria-expanded=true] > svg { transform: rotate(90deg); }
.ca-advanced:has(> .ca-disclosure-toggle[aria-expanded=true]) { flex-basis: 100%; }
@media (prefers-reduced-motion: reduce) { .ca-disclosure-toggle > svg { transition: none; } }
.ca-chip { display: inline-flex; align-items: center; gap: var(--ca-1); padding: 2px 2px 2px var(--ca-3); border: 1px solid var(--ca-field-border); border-radius: 999px; background: var(--ca-sunken); font-size: 13px; max-width: 100%; }
.ca-chip > span:first-child { overflow-wrap: anywhere; }
.ca-chip[data-off="true"] { opacity: .7; border-style: dashed; }
.ca-chip[data-off="true"] .ca-chip-text { text-decoration: line-through; }
.ca-chip :where(select):where(:not([class*="kumo"])) { height: 26px; font-size: 12px; border-radius: 999px; padding: 0 32px 0 var(--ca-2); background-size: 12px 12px; }

/* Tabs and segmented switches */
.ca-tabs { display: flex; gap: var(--ca-1); border-bottom: 1px solid var(--ca-line); overflow-x: auto; scrollbar-width: thin; min-width: 0; }
/* Scroll affordance: a tab bar or table that overflows sideways fades out at its right edge until it is scrolled to the end (no fade without overflow). */
@property --ca-scroll-fade { syntax: "<length>"; inherits: false; initial-value: 0px; }
@keyframes ca-scroll-fade { from { --ca-scroll-fade: 32px; } to { --ca-scroll-fade: 0px; } }
@supports (animation-timeline: scroll()) { .ca-tabs, .ca-table-scroll { mask-image: linear-gradient(to left, transparent, black var(--ca-scroll-fade)); animation: ca-scroll-fade linear both; animation-timeline: scroll(self inline); } }
.ca-tab { font: inherit; font-size: 14px; font-weight: 500; color: var(--ca-muted-text); background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: var(--ca-2) var(--ca-3); white-space: nowrap; cursor: pointer; border-radius: 6px 6px 0 0; transition: color .15s, background-color .15s, border-color .15s; }
.ca-tab:hover { color: var(--ca-fg); background: var(--ca-hover); }
.ca-tab[aria-selected="true"] { color: var(--ca-strong); border-bottom-color: var(--ca-accent); font-weight: 600; }
.ca-tab:focus-visible { outline-offset: -2px; }
.ca-seg { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; background: var(--ca-sunken); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); max-width: 100%; }
.ca-seg-btn { font: inherit; font-size: 13px; font-weight: 500; color: var(--ca-muted-text); background: transparent; border: 0; border-radius: 6px; height: 28px; padding: 0 var(--ca-3); cursor: pointer; white-space: nowrap; transition: color .15s, background-color .15s; }
.ca-seg-btn:hover { color: var(--ca-fg); background: var(--ca-hover); }
.ca-seg-btn:is([aria-pressed="true"], [aria-checked="true"]) { color: var(--ca-strong); background: var(--ca-surface); font-weight: 600; box-shadow: 0 0 0 1px var(--ca-field-border); }
.ca-seg-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ca-2); }
.ca-seg-wrap > .ca-field-label { font-size: 13px; }
/* In a toolbar row of fields the switch takes the field pattern: its label stacked above it at field label size. */
.ca-row-end > .ca-seg-wrap { display: grid; gap: var(--ca-1); }
.ca-row-end > .ca-seg-wrap > .ca-field-label { font-size: 12px; }
/* Small buttons (28 px) sit level with the 36 px fields of the row. */
.ca-row-end > button { margin-bottom: var(--ca-1); }
/* A checkbox in such a row sits level with the 36 px fields. */
.ca-row-end > .ca-check { min-height: 36px; }

/* Panels, KPI cards, charts */
.ca-panel { background: var(--ca-surface); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); padding: var(--ca-4); display: grid; gap: var(--ca-3); min-width: 0; align-content: start; }
.ca-panel > :where(h2, h3) { display: flex; align-items: center; gap: var(--ca-1); }
.ca-panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: var(--ca-4); min-width: 0; align-items: start; }
.ca-root > *, .ca-stack > *, .ca-section > *, .ca-panel > * { min-width: 0; }
.ca-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 184px), 1fr)); gap: var(--ca-3); min-width: 0; }
.ca-kpi { position: relative; background: var(--ca-surface); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); display: grid; min-width: 0; transition: border-color .15s, box-shadow .15s; }
/* Charted card: the slot colour as a 3 px top edge (an inset shadow, so the card keeps its height) and the slot shape. */
.ca-kpi[data-slot] { box-shadow: inset 0 3px 0 var(--ca-slot); }
.ca-kpi .ca-kpi-btn { font: inherit; color: inherit; background: none; border: 0; margin: 0; padding: var(--ca-3) var(--ca-4); height: auto; display: grid; gap: 2px; align-content: start; text-align: left; width: 100%; min-width: 0; border-radius: inherit; }
.ca-kpi button.ca-kpi-btn { cursor: pointer; }
.ca-kpi button.ca-kpi-btn:hover:not(:disabled) { background: var(--ca-hover); }
.ca-kpi button.ca-kpi-btn:focus-visible { outline: 2px solid var(--ca-focus); outline-offset: 2px; }
.ca-kpi button.ca-kpi-btn:disabled { opacity: 1; cursor: default; }
.ca-kpi[data-selectable]:hover { border-color: var(--ca-field-border); }
.ca-kpi > .ca-info { position: absolute; top: var(--ca-3); right: var(--ca-3); z-index: 1; margin: 0; align-items: flex-end; }
.ca-kpi-label { font-size: 12px; font-weight: 500; color: var(--ca-muted); display: flex; align-items: center; gap: 6px; padding-right: 20px; }
.ca-kpi-chip { display: inline-flex; align-items: center; }
.ca-kpi-value { font-size: 20px; overflow-wrap: anywhere; font-weight: 600; line-height: 1.25; color: var(--ca-strong); font-variant-numeric: tabular-nums; }
.ca-kpi svg:not(.ca-shape) { margin-top: var(--ca-1); max-width: 100%; }
.ca-bars g[role=button]:hover .ca-bar-hit { fill: var(--ca-hover); }
.ca-bars g[role=button]:focus-visible { outline: 2px solid var(--ca-focus); outline-offset: 1px; }
/* Relative: the hidden judgement word stays inside a table's scroll box instead of widening the page. */
.ca-delta { position: relative; font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--ca-muted); }
.ca-delta[data-judge="better"] { color: var(--ca-good); }
.ca-delta[data-judge="worse"] { color: var(--ca-bad); }
.ca-delta-arrow { margin-right: 2px; }
/* Cards: the change line, then the absolute change and the previous value on a second, quieter line. */
.ca-kpi .ca-delta, .ca-impact-grid .ca-delta { display: grid; }
.ca-delta-detail { font-weight: 400; color: var(--ca-muted); overflow-wrap: anywhere; }
/* On the page background the muted token falls under 4.5:1, so the compare label takes the text colour. */
.ca-kpi-cmp { margin: 0; font-size: 12px; color: var(--ca-fg); }
.ca-chart { margin: 0; display: grid; gap: var(--ca-2); min-width: 0; }
.ca-chart svg { display: block; overflow: visible; }
.ca-chart svg text { fill: var(--ca-muted); font-family: inherit; }
.ca-chart :where(path, line, rect, circle) { vector-effect: non-scaling-stroke; }
.ca-chart-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ca-2); }
.ca-axis-caps { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 var(--ca-3); font-size: 12px; color: var(--ca-muted); }
.ca-axis-caps > :last-child:not(:first-child) { text-align: right; margin-left: auto; }
.ca-chart svg text.ca-direct { fill: var(--ca-fg); }
/* One focus stop per plot; the tooltip floats inside it, so hover never changes the page height. */
.ca-plot { position: relative; touch-action: pan-y; border-radius: 4px; min-width: 0; }
.ca-plot:focus-visible { outline: 2px solid var(--ca-focus); outline-offset: 4px; }
.ca-tip { position: absolute; left: 0; z-index: 2; pointer-events: none; width: max-content; max-width: 260px; display: grid; gap: 4px; padding: var(--ca-2) var(--ca-3); font-size: 12px; line-height: 1.4; font-variant-numeric: tabular-nums; color: var(--ca-fg); background: var(--color-kumo-base, var(--ca-surface)); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); box-shadow: var(--ca-shadow); transition: transform 80ms linear; }
.ca-tip-head { font-weight: 600; color: var(--ca-strong); }
.ca-tip-row { display: grid; grid-template-columns: 1fr auto; gap: 0 var(--ca-3); align-items: center; }
.ca-tip-name { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.ca-tip-val { text-align: right; font-weight: 600; }
.ca-tip-cmp { grid-column: 1 / -1; color: var(--ca-muted); padding-left: 16px; }
.ca-tip-notes { border-top: 1px solid var(--ca-line); padding-top: 4px; display: grid; gap: 2px; }
/* The hint line under the cards is always in the layout: a refused click never moves the page. */
.ca-chart-hint { min-height: 20px; margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--ca-1) var(--ca-2); font-size: 12px; color: var(--ca-muted); }
/* An idle hint (no text, no Reset) leaves the flow: no blank row and no extra gap between the cards and the chart. It stays a live region. */
.ca-chart-hint:has(> span:empty):not(:has(> button)) { position: absolute; }
.ca-chart-skel { display: grid; place-items: center; border-radius: var(--ca-radius); background: var(--ca-sunken); }
.ca-chart-data > .ca-disclosure-toggle { font-size: 12px; color: var(--ca-muted); }
.ca-chart-data .ca-table-scroll { max-height: 320px; }
.ca-legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ca-1) var(--ca-3); font-size: 12px; color: var(--ca-muted); }
.ca-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.ca-legend > span[data-on] { color: var(--ca-fg); }
.ca-legend .ca-legend-item { font: inherit; color: var(--ca-fg); background: none; border: 0; height: auto; min-height: 24px; padding: 0 4px; display: inline-flex; align-items: center; gap: 6px; border-radius: 4px; cursor: pointer; }
.ca-legend .ca-legend-item:hover { background: var(--ca-hover); }
.ca-legend-pct { font-variant-numeric: tabular-nums; color: var(--ca-fg); }
.ca-shape { flex: none; display: inline-block; }
.ca-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex: none; }
.ca-donut svg circle[tabindex] { outline: none; cursor: default; transition: opacity 80ms linear; }
.ca-chart svg .ca-donut-centre text { fill: var(--ca-fg); }
.ca-chart svg .ca-donut-centre .ca-donut-pct { fill: var(--ca-strong); }
.ca-bars svg text { fill: var(--ca-fg); }

/* Tables */
.ca-table { display: grid; gap: var(--ca-2); min-width: 0; }
/* Right edge fade while more columns exist: a shade fixed to the box, covered by a patch that scrolls with the content and reaches the edge at the last column. */
.ca-table-scroll {
	overflow: auto; max-height: 560px; min-width: 0; border: 1px solid var(--ca-line); border-radius: var(--ca-radius);
	background: linear-gradient(to left, var(--ca-surface) 16px, transparent) right / 32px 100% no-repeat local,
		linear-gradient(to left, color-mix(in oklab, var(--color-kumo-contrast, CanvasText) 14%, transparent), transparent) right / 16px 100% no-repeat scroll, var(--ca-surface);
}
/* Sticky first column: the row name stays while the figures scroll. */
.ca-table-scroll :where(th, td):first-child { position: sticky; left: 0; z-index: 1; background: var(--ca-surface); box-shadow: inset -1px 0 var(--ca-line); }
.ca-table-scroll thead th:first-child { z-index: 2; background: var(--ca-sunken); }
.ca-table-scroll tbody tr:hover > :first-child { background: linear-gradient(var(--ca-hover) 0 0) var(--ca-surface); }
.ca-table-scroll .ca-subrow > :first-child { background: var(--ca-sunken); }
.ca-table-scroll > table, table.ca-grid { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; font-variant-numeric: tabular-nums; }
.ca-root :where(table) :where(tbody, tfoot) th { text-align: left; font-weight: 600; padding: var(--ca-2) var(--ca-3); border-bottom: 1px solid var(--ca-line); vertical-align: top; color: var(--ca-strong); }
.ca-root :where(table) tfoot :where(th, td) { border-top: 1px solid var(--ca-field-border); border-bottom: 0; }
.ca-root :where(table) thead th { position: sticky; top: 0; z-index: 1; background: var(--ca-sunken); color: var(--ca-muted-text); font-size: 12px; font-weight: 600; text-align: left; padding: var(--ca-2) var(--ca-3); border-bottom: 1px solid var(--ca-line); white-space: nowrap; vertical-align: bottom; }
.ca-root :where(table) td { padding: var(--ca-2) var(--ca-3); border-bottom: 1px solid var(--ca-line); vertical-align: top; }
.ca-root :where(table) tbody tr:last-child td { border-bottom: 0; }
.ca-root :where(table) tbody tr:hover :where(td, th) { background: var(--ca-hover); }
/* Rows that open something: the whole row is the target; the focus ring of its button outlines the row. */
.ca-rowlink:not([data-error]) { cursor: pointer; }
.ca-rowlink:is(:focus-visible, :has(.ca-rowlink-main:focus-visible)) { outline: 2px solid var(--ca-focus); outline-offset: -2px; }
.ca-rowlink .ca-rowlink-main:focus-visible { outline: none; }
.ca-subrow td { background: var(--ca-sunken); }
.ca-subrow td:first-child { padding-left: var(--ca-6); }
.ca-root :where(table) td:first-child { overflow-wrap: anywhere; min-width: 160px; }
.ca-root :where(table) :where(th, td).ca-num { text-align: right; white-space: nowrap; }
/* Sortable header: default text and a 24 px target that keeps the header height. */
.ca-sort { font: inherit; color: var(--ca-fg); background: none; border: 0; padding: 3px 0; margin: -3px 0; min-height: 24px; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; border-radius: 4px; }
.ca-sort:hover { color: var(--ca-strong); }
.ca-cell-note, .ca-side-b { font-size: 11px; color: var(--ca-muted); }
.ca-root td .ca-delta { margin-left: var(--ca-1); font-size: 11px; white-space: nowrap; }
.ca-pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--ca-2); font-size: 12px; color: var(--ca-muted); }
.ca-table-foot { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: flex-end; gap: var(--ca-2); }
.ca-tile .ca-kpi, .ca-tile .ca-kpi .ca-kpi-btn { border: 0; padding: 0; background: none; box-shadow: none; }
/* A number tile shows its info marker in the tile corner, level with the title. */
.ca-tile { position: relative; }
.ca-tile .ca-kpi { position: static; }
.ca-tile .ca-kpi > .ca-info { top: var(--ca-4); right: var(--ca-4); }
.ca-root td:last-child:has(> button) { white-space: nowrap; }
/* A row with action buttons centres every cell, so one-line text sits level with the buttons. */
.ca-root :where(table) tr:has(> td > .ca-row-actions, > td:last-child > button) > :where(td, th) { vertical-align: middle; }
.ca-row-actions { flex-wrap: nowrap; }
.ca-panel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ca-2); min-width: 0; }
.ca-panel-head > :where(h2, h3) { display: flex; align-items: center; gap: var(--ca-1); min-width: 0; }
.ca-panel-head > .ca-kebab { margin-left: auto; flex: none; }
.ca-kebab { color: var(--ca-muted); }
.ca-kebab:hover, .ca-kebab[aria-expanded=true] { color: var(--ca-fg); }
.ca-empty { display: grid; justify-items: center; gap: var(--ca-2); text-align: center; padding: var(--ca-6) var(--ca-4); color: var(--ca-muted); border: 1px dashed var(--ca-line); border-radius: var(--ca-radius); }
.ca-empty-title { color: var(--ca-fg); font-weight: 600; }
.ca-loading { display: flex; align-items: center; gap: var(--ca-2); color: var(--ca-muted); padding: var(--ca-3) 0; }
.ca-linkbtn { font: inherit; color: var(--ca-link); background: none; border: 0; padding: 3px 0; margin: -3px 0; cursor: pointer; text-align: left; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; border-radius: 2px; }
.ca-linkbtn:hover { text-decoration-style: solid; }
/* Values that filter: plain text in the default colour, underline and a funnel mark on hover and focus; 24 px tall target. */
.ca-linkbtn.ca-cell-filter { position: relative; color: inherit; text-decoration: none; padding: 3px 0; margin: -3px 0; min-width: 24px; }
.ca-cell-filter:is(:hover, :focus-visible) { text-decoration: underline; text-underline-offset: 3px; }
/* Out of the flow (in the cell padding), so it never wraps a line or widens the column. */
.ca-filter-mark { position: absolute; left: calc(100% + 1px); bottom: 7px; width: 11px; height: 11px; color: var(--ca-muted); opacity: 0; pointer-events: none; }
@media (max-width: 640px) { .ca-root :where(table) td:first-child { min-width: 120px; } }
:is(tr:hover, .ca-cell-filter:focus-visible) .ca-filter-mark { opacity: 1; }

/* Notices */
.ca-notice { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--ca-2) var(--ca-3); padding: 10px var(--ca-3); border: 1px solid var(--ca-tone-line); border-radius: var(--ca-radius); background: var(--ca-tone-bg); color: var(--ca-fg); }
.ca-notice-icon { color: var(--ca-tone); width: 16px; height: 16px; margin-top: 2px; }
.ca-notice-body { display: grid; gap: var(--ca-1); min-width: 0; overflow-wrap: anywhere; }
.ca-notice-text::before { content: attr(data-label) ": "; font-weight: 600; color: var(--ca-strong); }
/* The host stylesheet removes list markers; numbered steps in a notice keep their numbers. */
.ca-notice-text ol { list-style: decimal; }
.ca-field-error { font-size: 12px; font-weight: 500; color: var(--ca-bad); }
.ca-notice-body .ca-actions { margin-top: var(--ca-1); }
.ca-notice--error { --ca-tone: var(--text-color-kumo-danger, CanvasText); --ca-tone-bg: var(--color-kumo-danger-tint, Canvas); }
.ca-notice--warning { --ca-tone: var(--text-color-kumo-warning, CanvasText); --ca-tone-bg: var(--color-kumo-warning-tint, Canvas); }
.ca-notice--info { --ca-tone: var(--text-color-kumo-info, CanvasText); --ca-tone-bg: var(--color-kumo-info-tint, Canvas); }
.ca-notice--success { --ca-tone: var(--text-color-kumo-success, CanvasText); --ca-tone-bg: var(--color-kumo-success-tint, Canvas); }
.ca-notice { --ca-tone-line: color-mix(in oklab, var(--ca-tone) 35%, transparent); }

/* Info marker and popovers */
.ca-info { display: inline-flex; flex-direction: column; vertical-align: middle; margin-left: var(--ca-1); }
/* A 24 px target around a 16 px drawn circle; the negative margin keeps the layout of the 16 px mark. */
.ca-info-btn { font: inherit; font-size: 10px; font-weight: 700; line-height: 1; width: 24px; height: 24px; margin: -4px; display: inline-grid; place-items: center; position: relative; isolation: isolate; border-radius: 50%; border: 0; background: none; color: var(--ca-muted-text); cursor: help; padding: 0; }
.ca-info-btn::before { content: ""; position: absolute; inset: 4px; z-index: -1; border-radius: 50%; border: 1px solid var(--ca-field-border); background: var(--ca-surface); }
.ca-info-btn:hover, .ca-info-btn[aria-expanded="true"] { color: var(--ca-fg); }
.ca-info-btn:is(:hover, [aria-expanded="true"])::before { border-color: var(--ca-fg); }
.ca-info-text { display: block; font-size: 12px; font-weight: 400; color: var(--ca-fg); max-width: 300px; margin-top: var(--ca-1); padding: var(--ca-2); background: var(--ca-sunken); border-radius: 6px; white-space: normal; text-align: left; }
.ca-popover { margin-top: var(--ca-2); max-width: 420px; background: var(--ca-surface); color: var(--ca-fg); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); padding: var(--ca-3); box-shadow: var(--ca-shadow); display: grid; gap: var(--ca-2); }
.ca-popover ul { list-style: none; padding: 0; display: grid; gap: var(--ca-2); }
.ca-range-options { border: 0; padding: 0; margin: 0; display: grid; gap: var(--ca-2); min-width: 0; }
.ca-range-options > legend { padding: 0; margin-bottom: var(--ca-1); }
.ca-range-option { display: flex; gap: var(--ca-2); align-items: flex-start; min-width: 0; }
.ca-range-option > span { display: grid; gap: 2px; min-width: 0; }
.ca-range-option input { margin-top: 3px; }
.ca-dialog:focus { outline: none; }
.ca-dialog { background: var(--ca-surface); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); padding: var(--ca-4); display: grid; gap: var(--ca-3); min-width: 0; box-shadow: var(--ca-shadow); }

/* Forms and lists */
.ca-field-wrap { display: inline-grid; gap: var(--ca-1); min-width: 0; align-content: start; margin: 0 var(--ca-2) var(--ca-2) 0; }
/* A text box spans the row: no gap at its right edge. */
.ca-field-wrap:has(> .ca-field > textarea) { margin-right: 0; }
/* Search field with its clear button inside; the button's 44 px target spills over the field edge, its drawn mark stays small. */
.ca-search-box { position: relative; display: inline-flex; align-items: center; }
.ca-search-box > input { width: 16rem; padding-right: 36px; }
.ca-search-box > input::-webkit-search-cancel-button { display: none; }
.ca-root .ca-search-box > .ca-search-clear { position: absolute; right: -4px; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--ca-muted-text); font-size: 18px; line-height: 1; cursor: pointer; }
.ca-root .ca-search-box > .ca-search-clear:hover { color: var(--ca-fg); background: none; }
/* Grid stacks and flex rows space their children with gap: a field there spans its column to the edge. The margin only spaces fields flowing inline (editor forms). */
.ca-root :where([role=tabpanel], section, form, [role=form], .ca-section, .ca-form, .ca-row, .ca-row-end, .ca-actions) > .ca-field-wrap { margin: 0; }
.ca-num-input { width: 96px; }
.ca-secret { display: block; user-select: all; word-break: break-all; padding: var(--ca-2) var(--ca-3); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); }
.ca-pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; padding: var(--ca-3); background: var(--ca-sunken); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
.ca-root fieldset.ca-plain { border: 0; padding: 0; }
/* No border to sit in, so the legend starts at the edge like a field label. */
.ca-root fieldset.ca-plain > legend { padding: 0; }
.ca-check-inline { display: inline-flex; margin-right: var(--ca-3); }
.ca-cards { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: var(--ca-3); }
.ca-card-link { position: relative; cursor: pointer; transition: border-color .15s; }
.ca-card-link:hover { border-color: var(--ca-field-border); background: var(--ca-hover); }
.ca-card-link .ca-stretch::after { content: ""; position: absolute; inset: 0; border-radius: var(--ca-radius); }
.ca-card-link:has(.ca-stretch:focus-visible) { outline: 2px solid var(--ca-focus); outline-offset: 2px; }
.ca-card-link .ca-stretch:focus-visible { outline: none; }
.ca-cards > li { display: grid; gap: var(--ca-2); align-content: start; justify-items: start; padding: var(--ca-3) var(--ca-4); background: var(--ca-surface); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); }
.ca-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ca-3); }
.ca-tile[data-w="2"] { grid-column: span 2; }
.ca-tile[data-w="3"] { grid-column: span 3; }
.ca-tile-form { gap: var(--ca-2); }
.ca-dash-head h2 { margin-right: auto; }
.ca-impact-grid { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: var(--ca-1) var(--ca-4); font-variant-numeric: tabular-nums; }
[data-low="true"] { opacity: .6; }
.ca-drawer { margin-top: var(--ca-2); }
.ca-badge { margin-left: var(--ca-2); }
.ca-form { display: grid; gap: var(--ca-3); min-width: 0; max-width: 720px; }
/* A bare field (a label, which stacks keep at its own width) spans the form like a wrapped one. */
.ca-root .ca-form > .ca-field { justify-self: stretch; }
.ca-check { display: flex; align-items: center; gap: var(--ca-2); cursor: pointer; width: fit-content; }
.ca-checks { display: flex; flex-wrap: wrap; gap: var(--ca-2) var(--ca-4); }
.ca-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--ca-2); }
.ca-list > li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ca-2) var(--ca-3); padding: var(--ca-3) var(--ca-4); background: var(--ca-surface); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); min-width: 0; }
.ca-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--ca-1) var(--ca-3); font-size: 13px; }
.ca-meta dt { color: var(--ca-muted); }
.ca-meta dd { overflow-wrap: anywhere; }

/* Search connections */
.ca-connections { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: var(--ca-4); align-items: start; }
.ca-conn-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ca-2); }
.ca-copy { display: flex; align-items: center; gap: var(--ca-2); min-width: 0; }
.ca-copy > code { flex: 1; display: block; padding: var(--ca-2) var(--ca-3); font-size: 12px; line-height: 1.5; border: 1px solid var(--ca-line); border-radius: var(--ca-radius); }
.ca-conn-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ca-2) var(--ca-3); padding: var(--ca-2) var(--ca-4); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); font-size: 13px; }
.ca-search-head { row-gap: var(--ca-1); }
.ca-search-sync { margin: 0; margin-left: auto; text-align: right; }
@media (max-width: 640px) { .ca-search-sync { margin-left: 0; text-align: left; } }

.ca-traffic-panel, .ca-widget { gap: var(--ca-3); }
.ca-figures { display: flex; flex-wrap: wrap; gap: var(--ca-3) var(--ca-6); }
.ca-figure { display: grid; gap: 2px; }
.ca-figure strong { font-size: 20px; font-weight: 600; color: var(--ca-strong); font-variant-numeric: tabular-nums; }

/* Satisfaction: ranked pages, each row one button */
.ca-rank { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--ca-2); }
.ca-rank-row { font: inherit; color: inherit; width: 100%; height: auto; font-weight: 400; display: grid; gap: var(--ca-1); text-align: left; padding: var(--ca-2) var(--ca-3); background: var(--ca-surface); border: 1px solid var(--ca-line); border-radius: var(--ca-radius); cursor: pointer; transition: border-color .15s; }
.ca-rank-row:hover { border-color: var(--ca-field-border); background: var(--ca-hover); }
.ca-rank-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ca-3); min-width: 0; }
.ca-rank-page { font-weight: 600; color: var(--ca-strong); overflow-wrap: anywhere; min-width: 0; }
.ca-rank-score { font-size: 18px; font-weight: 600; color: var(--ca-strong); font-variant-numeric: tabular-nums; }
.ca-rank-parts { display: flex; flex-wrap: wrap; gap: 2px var(--ca-3); font-size: 12px; color: var(--ca-muted); font-variant-numeric: tabular-nums; }
.ca-presets, .ca-sat-drawer { align-items: center; }
.ca-sat-drawer { border-color: var(--ca-accent); }

/* Settings page: section list (a select under 640px), one section form, sticky save row */
.ca-settings { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--ca-4); align-items: start; min-width: 0; }
.ca-set-nav { display: grid; gap: 2px; position: sticky; top: var(--ca-4); }
.ca-set-nav .ca-set-navbtn { display: flex; align-items: center; justify-content: space-between; gap: var(--ca-2); width: 100%; height: auto; min-height: 36px; padding: var(--ca-2) var(--ca-3); text-align: left; font-size: 14px; font-weight: 500; color: var(--ca-fg); background: none; border: 0; border-radius: 6px; }
.ca-set-nav .ca-set-navbtn:hover { color: var(--ca-fg); background: var(--ca-hover); }
.ca-set-nav .ca-set-navbtn[aria-current] { color: var(--ca-strong); font-weight: 600; background: var(--ca-hover); box-shadow: inset 2px 0 0 var(--ca-accent); }
.ca-set-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--ca-accent); }
.ca-set-select { display: none; }
.ca-set-form { gap: var(--ca-4); padding-bottom: 0; }
.ca-set-fields { display: grid; gap: var(--ca-4); min-width: 0; }
.ca-set-field { display: grid; gap: var(--ca-1); min-width: 0; max-width: 640px; }
.ca-root .ca-set-choice { border: 0; padding: 0; gap: var(--ca-1); }
.ca-set-choice > legend { padding: 0; margin-bottom: var(--ca-1); }
.ca-set-label { font-weight: 500; color: var(--ca-strong); }
.ca-set-field > :where(select, input, textarea) { width: 100%; max-width: 420px; }
.ca-set-field > textarea { max-width: 640px; }
.ca-set-unit { display: inline-flex; align-items: center; gap: var(--ca-2); }
.ca-set-unit > input { width: 140px; }
.ca-set-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ca-2) var(--ca-3); margin: 0 calc(-1 * var(--ca-4)); padding: var(--ca-3) var(--ca-4); background: var(--ca-surface); border-top: 1px solid var(--ca-line); border-radius: 0 0 var(--ca-radius) var(--ca-radius); }
.ca-set-ro { display: grid; grid-template-columns: minmax(0, max-content) minmax(0, 1fr); gap: var(--ca-2) var(--ca-4); }
.ca-set-ro > div { display: contents; }
.ca-set-ro dt { color: var(--ca-muted); }
.ca-set-ro dd { overflow-wrap: anywhere; }
@media (max-width: 640px) {
	.ca-settings { grid-template-columns: minmax(0, 1fr); }
	.ca-set-nav { display: none; }
	.ca-set-select { display: inline-grid; }
	.ca-set-select > select { width: 100%; }
	.ca-set-foot { margin: 0 calc(-1 * var(--ca-3)); padding: var(--ca-3); }
	.ca-set-ro { grid-template-columns: minmax(0, 1fr); gap: 0; }
	.ca-set-ro dd { margin-bottom: var(--ca-2); }
}

/* Page wiring: Overview grid, panel footers, first run, Data attention list, error detail, placeholders */
/* Five or more cards: 4 columns, so no card is left alone on a row. */
@media (min-width: 1100px) { .ca-kpis:has(> :nth-child(5)) { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.ca-overview > .ca-panels { align-items: stretch; }
/* Equal panels in a row with "Show all" on one line at the bottom. */
.ca-overview > .ca-panels > .ca-panel { display: flex; flex-direction: column; }
.ca-overview > .ca-panels > .ca-panel > .ca-more { margin-top: auto; align-self: flex-start; }
.ca-group-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--ca-strong); }
.ca-more { justify-self: start; display: inline-flex; align-items: center; min-height: 24px; font-size: 13px; color: var(--ca-link); }
.ca-err-detail { display: block; margin-top: 2px; overflow-wrap: anywhere; }
.ca-table-skel { align-content: center; }
.ca-part-empty { margin: 0; padding: var(--ca-3) var(--ca-4); color: var(--ca-muted-text); }
.ca-first-run { max-width: 760px; }
.ca-first-run > :where(h2, p) { margin: 0; }
/* Numbers drawn by a counter: the host resets list markers. */
.ca-steps { margin: 0; padding: 0; list-style: none; counter-reset: ca-step; display: grid; gap: var(--ca-4); }
.ca-steps > li { counter-increment: ca-step; position: relative; display: grid; gap: 2px; padding-left: 36px; }
.ca-steps > li::before { content: counter(ca-step); position: absolute; left: 0; top: -1px; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; border: 1px solid var(--ca-line); font-size: 12px; font-weight: 600; color: var(--ca-muted-text); }
.ca-steps > li[data-done]::before { border-color: var(--ca-good); color: var(--ca-good); }
.ca-step-title { font-weight: 600; color: var(--ca-strong); }
.ca-steps > li[data-done] .ca-step-state { color: var(--ca-good); }
.ca-steps .ca-actions { margin-top: var(--ca-1); }
.ca-attention > ul { list-style: none; margin: 0; padding: 0; display: grid; }
.ca-attention > ul > li { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--ca-2); padding: var(--ca-2) 0; border-top: 1px solid var(--ca-line); }
.ca-attention > ul > li:first-child { border-top: 0; padding-top: 0; }
.ca-attention .ca-notice-icon { margin-top: 5px; }
.ca-attention li > .ca-stack > span { font-size: 13px; font-weight: 500; color: var(--ca-strong); padding: var(--ca-1) 0; }
.ca-attention .ca-disclosure-body > p { margin: var(--ca-1) 0 0; }

@media (max-width: 640px) {
	.ca-copy { align-items: flex-start; }
	.ca-tiles { grid-template-columns: minmax(0, 1fr); }
	.ca-tile[data-w] { grid-column: auto; }
	.ca-impact-grid { grid-template-columns: repeat(2, auto); }
	.ca-header { padding: var(--ca-3); }
	.ca-panel { padding: var(--ca-3); }
	.ca-header-row > .ca-field, .ca-daterange > .ca-field { flex: 1 1 140px; }
	.ca-header-row select, .ca-daterange select, .ca-daterange input { width: 100%; }
	.ca-compare-range { padding-top: 0; flex-basis: 100%; }
	.ca-head-toggle { display: flex; }
	.ca-header[data-open=false] > .ca-head-body { display: none; }
	.ca-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.ca-kpi .ca-kpi-btn { padding: var(--ca-3); }
	.ca-kpi-value { font-size: 18px; }
	.ca-root :where(table) :where(th, td) { padding: 6px var(--ca-2); }
	.ca-copy { flex-direction: column; }
}
/* Data, Delete tab: filtered delete */
.ca-fd { display: grid; gap: var(--ca-3); margin-bottom: var(--ca-4); }
.ca-root fieldset.ca-fd-checks { display: flex; flex-wrap: wrap; gap: var(--ca-2) var(--ca-4); }
.ca-fd-checks label, .ca-fd-old { display: inline-flex; gap: var(--ca-2); align-items: baseline; }
.ca-fd-old { display: flex; margin-top: var(--ca-2); }
.ca-fd-days { max-height: 320px; overflow-y: auto; }
.ca-fd-barcell { width: 40%; }
.ca-fd ul { list-style: disc; padding-left: var(--ca-6); margin: 0; }
.ca-fd-bar { display: block; height: 8px; min-width: 2px; border-radius: 2px; background: var(--ca-series-1); }
/* Dashboards: template cards keep their button at the bottom; tile legend toggles; one name per number tile; share state cells. */
.ca-cards > li { grid-template-rows: auto 1fr auto; align-content: stretch; align-items: start; }
.ca-tile[data-plain] .ca-kpi-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
/* The tile draws its own legend of toggles above the plot; the chart's static one would repeat it. */
.ca-tile-hint { color: var(--ca-fg); }
.ca-legend-off { display: inline-block; width: 10px; height: 10px; border: 1.5px solid var(--ca-muted); border-radius: 50%; box-sizing: border-box; }
.ca-tile-metrics { display: flex; flex-wrap: wrap; gap: var(--ca-1) var(--ca-3); }
.ca-tile-metrics > .ca-chart-hint { flex-basis: 100%; }
.ca-shared-cell { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--ca-1) var(--ca-2); }
.ca-shared { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--ca-2); }
.ca-shared > li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ca-2); }
/* Revenue page: attribution panels two to a row at 1440, one at 390; their tables carry six or more columns. */
.ca-rev-panels { grid-template-columns: repeat(auto-fit, minmax(min(100%, 560px), 1fr)); }
/* Annotations page */
/* The date column needs no row-name width; the title gets it, so it does not wrap word by word on a phone. */
.ca-annotations :where(th, td):first-child { min-width: 0; white-space: nowrap; }
.ca-annotations td:nth-child(3) { min-width: 180px; }
.ca-overlap { display: block; }
.ca-annotations tr[data-open] > td { border-bottom: 0; }
.ca-impact-row > td { white-space: normal; }
.ca-impact-pick { align-items: end; }
.ca-impact-context { grid-template-columns: repeat(3, auto); }
@media (prefers-reduced-motion: reduce) { .ca-root * { transition: none !important; } }
}`;

/** Adds the stylesheet once per document; no-op outside a browser. */
export function injectStyles(doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
	if (!doc || doc.getElementById(STYLE_ID)) return;
	const el = doc.createElement("style");
	el.id = STYLE_ID;
	el.textContent = ADMIN_CSS;
	doc.head.appendChild(el);
}
