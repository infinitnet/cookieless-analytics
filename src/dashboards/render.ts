/**
 * Server-rendered shared dashboard: one HTML string with inline CSS and inline SVG built from the
 * shared chart geometry. No script, link, image, form or external URL; every interpolated string is escaped.
 */
import { CAVEATS, noticeText } from "../charts/caveats.js";
import { KIND_LABELS } from "../annotations/scope.js";
import { annotationCount, areaPath, axisScale, barWidth, COLORS, DONUT_R, donutArcs, fmt, fmtTick, groupDate, linePath, lineScale, markerGroups, r1, shapePath, stackedRects, W } from "../charts/geometry.js";
import { SEO_TEXT } from "../query/reports/seo-copy.js";
import { annotationBucket } from "../charts/markers.js";
import { type Preset, PRESETS } from "../core/presets.js";
import { type Dashboard, tileNeedsSearch } from "./schema.js";
import { type Change, changeText } from "../charts/change.js";
import { COMPARE_LINES, currencyLines, displayedKeys, formatValue, lineAxes, metricLabel, scoreNote, type TileData, type TileLine, tileChange, tileTitle, TRIMMED_COMPARE, valueFormat, valueLabel } from "./tiles.js";

export interface RenderInput {
	dashboard: Dashboard;
	/** Aligned with `dashboard.tiles`; null when the tile could not be loaded. */
	tiles: ReadonlyArray<TileData | null>;
	range: Preset;
	compare: boolean;
	ranges: readonly Preset[];
	allowCompare: boolean;
	/** Epoch seconds. */
	generatedAt: number;
	/** Site timezone, for the annotation buckets; defaults to UTC. */
	tz?: string;
}

/** Annotations listed under one tile of the shared page. */
export const SHARE_ANNOTATIONS_PER_TILE = 12;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (v: unknown): string => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c] as string);
const e = escapeHtml;

const MUTED = "#94a3b8";
const c = (i: number) => COLORS[i % COLORS.length] as string;
/** Line colour of a series slot: the light values of the admin's slot tokens (blue, emerald, orange, purple), each at least 3:1 on white. */
const SLOT_HEX = ["#2563eb", "#059669", "#ea580c", "#9333ea"] as const;
const slotHex = (slot: number) => SLOT_HEX[slot % SLOT_HEX.length] as string;
const presetLabel = (p: Preset) => PRESETS.find((x) => x[0] === p)?.[1] ?? p;

const CSS = `*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;background:#f8fafc}
header,main,footer{max-width:1200px;margin:0 auto;padding:16px}h1{font-size:22px;margin:0 0 8px}h2{font-size:14px;margin:0 0 8px}
nav{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}nav a{padding:4px 10px;border:1px solid #cbd5e1;border-radius:999px;color:#0f172a;text-decoration:none}
nav a[aria-current]{background:#0f172a;color:#fff;border-color:#0f172a}.upd{color:#64748b;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.w2{grid-column:span 2}.w3{grid-column:span 3}
section{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;min-width:0;overflow-x:auto}
.kpi{font-size:28px;font-weight:600}.better{color:#15803d}.worse{color:#b91c1c}.same{color:#64748b}.note{color:#92400e;font-size:12px;margin:0 0 6px}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #f1f5f9}td.n,th.n{text-align:right}
svg{display:block;width:100%;height:auto}.lg{display:flex;flex-wrap:wrap;gap:4px 12px;margin:6px 0 0;font-size:12px;color:#334155}.caps{display:flex;justify-content:space-between;margin:0 0 4px;font-size:11px;color:#64748b}footer{color:#64748b;font-size:12px}footer p{margin:4px 0}
@media (max-width:720px){.grid{grid-template-columns:1fr}.w2,.w3{grid-column:auto}}`;

function kpi(d: TileData): string {
	const f = valueFormat(d.metric ?? "", d.currency);
	if (d.impact) {
		const i = d.impact;
		const change = changeHtml(tileChange(d), i.notable === false ? " (not notable)" : "");
		const partial = i.complete ? "" : `<p class="note">${e(`The after window has ${i.daysAfter} days so far; numbers will change.`)}</p>`;
		return `<div class="kpi">${e(fmt(i.after, f))}</div><div>Before: ${e(fmt(i.before, f))}, after ${e(i.day)}</div>${change}${partial}`;
	}
	return `<div class="kpi">${e(formatValue(d.metric, d.value, d.currency))}</div>${changeHtml(tileChange(d))}${d.note ? `<div class="upd">${e(d.note)}</div>` : ""}`;
}

/** The change line (arrow, label and the better or worse word, never colour alone) and the detail line under it. */
function changeHtml(c: Change | null, tail = ""): string {
	if (!c) return "";
	if (c.kind === "none") return `<div class="same" title="${e(c.note)}">${e(c.label)}</div>`;
	const cls = c.muted || c.judgement === "neutral" ? "same" : (c.judgement ?? "same");
	return `<div class="${cls}">${e(changeText(c, true))}${e(tail)}</div>${c.detail ? `<div class="upd">${e(c.detail)}</div>` : ""}`;
}

/** Marker groups (dashed line, dot, count badge, native `<title>`) and the list under the chart. */
function annotationParts(d: TileData, sc: Pick<ReturnType<typeof lineScale>, "x" | "top" | "bottom">, tz: string): { svg: string; list: string; count: number } {
	const list = d.annotations ?? [];
	if (!list.length) return { svg: "", list: "", count: 0 };
	const index = new Map(d.buckets.map((t, i) => [t, i]));
	const gran = d.granularity ?? "day";
	const marks = list.map((a) => ({ t: annotationBucket(a.ts, gran, tz), a }));
	const groups = markerGroups(marks, (t) => {
		const i = index.get(t);
		return i === undefined ? undefined : sc.x(i);
	});
	const svg = groups
		.map((g) => {
			const tip = `${annotationCount(g.count)} on ${groupDate(g)}: ${g.markers.map((m) => m.a.text).join("; ")}`;
			const badge = g.count > 1 ? `<text x="${r1(g.x + 6)}" y="${sc.top - 4}" font-size="9" fill="${c(2)}">${g.count}</text>` : "";
			return `<g data-marker="${e(g.ts[0])}"><title>${e(tip)}</title><line x1="${g.x}" x2="${g.x}" y1="${sc.top}" y2="${sc.bottom}" stroke="${c(2)}" stroke-dasharray="2 2"/><circle cx="${g.x}" cy="${sc.top}" r="4" fill="${c(2)}"/>${badge}</g>`;
		})
		.join("");
	const shown = groups.flatMap((g) => g.markers.map((m) => m.a));
	const items = shown
		.slice(0, SHARE_ANNOTATIONS_PER_TILE)
		.map((a) => `<li><time datetime="${e(a.day)}">${e(a.day)}</time> ${e(a.text)} <span style="color:#64748b">(${e(KIND_LABELS[a.kind] ?? a.kind)}, ${e(a.summary)})</span></li>`);
	if (shown.length > SHARE_ANNOTATIONS_PER_TILE) items.push(`<li>and ${shown.length - SHARE_ANNOTATIONS_PER_TILE} more</li>`);
	return { svg, list: shown.length ? `<ul aria-label="Annotations" style="margin:6px 0 0;padding-left:18px;font-size:12px">${items.join("")}</ul>` : "", count: shown.length };
}

/** A small legend swatch: the slot shape, solid or as a dashed stroke for the comparison. */
const swatch = (slot: number, dashed = false) =>
	`<svg viewBox="0 0 16 10" width="16" height="10" aria-hidden="true" style="display:inline;width:16px;vertical-align:middle">${dashed ? `<line x1="0" x2="16" y1="5" y2="5" stroke="${slotHex(slot)}" stroke-dasharray="4 3" stroke-width="1.5"/>` : `<path d="${shapePath(slot, 8, 5, 4)}" fill="${slotHex(slot)}"/>`}</svg>`;

/** Lines of one tile: up to 4 series on at most two axes, dashed comparisons in the series colour, a legend and direct labels. */
function line(d: TileData, title: string, area: boolean, tz: string): string {
	const height = 180;
	const n = d.buckets.length;
	const compare = d.lines.some((l) => l.compare);
	const lines = compare ? d.lines.slice(0, COMPARE_LINES) : d.lines;
	const axes = lineAxes(lines);
	const sc = lineScale(n, [], height);
	const sides = (["left", "right"] as const).map((side) => {
		const list = lines.filter((l) => axes[l.key] === side);
		const scale = axisScale(
			list.flatMap((l) => [...l.values, ...(l.compare ?? [])]),
			sc.top,
			sc.bottom,
			list.some((l) => l.key === "position"),
		);
		return { list, scale, format: valueFormat(list[0]?.key ?? "", d.currency) };
	});
	const [left, right] = sides as [(typeof sides)[0], (typeof sides)[0]];
	const yOf = (l: TileLine) => (axes[l.key] === "right" ? right : left).scale.y;
	const path = (vals: ReadonlyArray<number | null>, l: TileLine) => linePath(vals.slice(0, Math.max(n, 1)), { x: sc.x, y: yOf(l) });
	const val = (l: TileLine, v: number | null) => formatValue(l.key, v, d.currency);
	const parts = left.scale.ticks.map((v, k) => {
		const y = left.scale.y(v);
		const r = right.list.length ? `<text x="${W}" y="${r1(y - 3)}" font-size="10" fill="${MUTED}" text-anchor="end">${e(fmtTick(right.scale.ticks[k] ?? 0, right.format))}</text>` : "";
		return `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${MUTED}" stroke-opacity="0.3"${k === (left.scale.invert ? 2 : 0) ? "" : ' stroke-dasharray="2 3"'}/><text x="0" y="${r1(y - 3)}" font-size="10" fill="${MUTED}">${e(fmtTick(v, left.format))}</text>${r}`;
	});
	lines.forEach((l, slot) => {
		const cur = path(l.values, l);
		if (area && lines.length === 1 && n > 0 && cur && l.values.every((v) => v !== null) && l.key !== "position") parts.push(`<path d="${areaPath(cur, n, { x: sc.x, bottom: sc.bottom })}" fill="${slotHex(slot)}" fill-opacity="0.12"/>`);
		if (l.compare?.length) parts.push(`<path d="${path(l.compare, l)}" fill="none" stroke="${slotHex(slot)}" stroke-opacity="0.6" stroke-dasharray="4 3" stroke-width="1.5" data-compare="${e(l.key)}"/>`);
		if (cur) parts.push(`<path d="${cur}" fill="none" stroke="${slotHex(slot)}" stroke-width="2" data-series="${e(l.key)}"/>`);
		if (n === 1 && l.values[0] != null) parts.push(`<path d="${shapePath(slot, sc.x(0), yOf(l)(l.values[0]), 4)}" fill="${slotHex(slot)}"/>`);
	});
	const ends = lines.map((l, slot) => {
		let i = n - 1;
		while (i >= 0 && l.values[i] == null) i--;
		return i < 0 ? null : { l, slot, i, y: yOf(l)(l.values[i] ?? null) };
	});
	const ys = ends.flatMap((p) => (p ? [p.y] : [])).sort((a, b) => a - b);
	// Direct labels at the line ends when two or more lines share the left axis and no two labels touch.
	if (lines.length > 1 && !right.list.length && n > 1 && ys.every((y, i) => i === 0 || y - (ys[i - 1] as number) >= 14))
		for (const p of ends) if (p) parts.push(`<text x="${r1(sc.x(p.i) - 6)}" y="${r1(p.y - 6)}" font-size="10" text-anchor="end" fill="#334155" data-end="${e(p.l.key)}">${e(metricLabel(p.l.key))}</text>`);
	d.buckets.forEach((t, i) => {
		const now = lines.map((l) => `${metricLabel(l.key)} ${val(l, l.values[i] ?? null)}`).join(", ");
		const was = compare ? `; ${d.compareLabel ?? "comparison"}: ${lines.map((l) => `${metricLabel(l.key)} ${val(l, l.compare?.[i] ?? null)}`).join(", ")}` : "";
		parts.push(`<rect x="${r1(sc.x(i) - sc.step / 2)}" y="0" width="${r1(sc.step)}" height="${height}" fill="transparent"><title>${e(`${t}: ${now}${was}`)}</title></rect>`);
	});
	if (n > 0) parts.push(`<text x="0" y="${height - 4}" font-size="10" fill="${MUTED}">${e(d.buckets[0])}</text><text x="${W}" y="${height - 4}" font-size="10" fill="${MUTED}" text-anchor="end">${e(d.buckets[n - 1])}</text>`);
	const ann = annotationParts(d, sc, tz);
	parts.push(ann.svg);
	// The impact line marks the annotation day.
	const mi = d.impact ? d.buckets.indexOf(d.impact.day) : -1;
	if (mi >= 0) parts.push(`<g data-marker="${e(d.impact?.day)}"><title>${e(`Change on ${d.impact?.day}`)}</title><line x1="${sc.x(mi)}" x2="${sc.x(mi)}" y1="${sc.top}" y2="${sc.bottom}" stroke="${c(2)}" stroke-dasharray="2 2"/></g>`);
	const label = `${title}, ${n} points${ann.count ? `, ${annotationCount(ann.count)}` : ""}`;
	const caps = right.list.length ? `<p class="caps"><span>${e(left.list.map((l) => metricLabel(l.key)).join(", "))}</span><span>${e(right.list.map((l) => metricLabel(l.key)).join(", "))}</span></p>` : "";
	const legend =
		lines.length > 1 || compare
			? `<p class="lg">${lines.map((l, slot) => `<span>${swatch(slot)} ${e(metricLabel(l.key))}</span>`).join("")}${compare ? `<span>${swatch(0, true)} Dashed: ${e(d.compareLabel ?? "comparison")}</span>` : ""}</p>`
			: "";
	const trimmed = compare && d.lines.length > lines.length ? `<p class="upd">${e(TRIMMED_COMPARE)}</p>` : "";
	return `${caps}<svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${e(label)}">${parts.join("")}</svg>${legend}${trimmed}${ann.list}`;
}

type Slice = { label: string; value: number };

function rowsTable(rows: readonly Slice[], metric: string | null, title: string, currency?: string): string {
	return `<table aria-label="${e(title)}"><thead><tr><th scope="col">Name</th><th scope="col" class="n">${e(valueLabel(metric ?? "value", currency))}</th></tr></thead><tbody>${rows
		.map((r) => `<tr><td>${e(r.label)}</td><td class="n">${e(formatValue(metric, r.value, currency))}</td></tr>`)
		.join("")}</tbody></table>`;
}

function bars(d: TileData, title: string): string {
	const rows = d.rows as Slice[];
	const max = Math.max(1, ...rows.map((r) => r.value));
	const rowH = 22;
	const g = rows
		.map(
			(r, i) =>
				`<g transform="translate(0 ${i * rowH})"><rect x="0" y="2" width="${barWidth(r.value, max)}" height="${rowH - 4}" fill="${c(0)}" fill-opacity="0.18"/><text x="6" y="${rowH / 2 + 4}" font-size="12">${e(r.label)}</text><text x="${W - 4}" y="${rowH / 2 + 4}" font-size="12" text-anchor="end">${e(formatValue(d.metric, r.value, d.currency))}</text></g>`,
		)
		.join("");
	return `<svg viewBox="0 0 ${W} ${rows.length * rowH}" role="img" aria-label="${e(title)}">${g}</svg>${rowsTable(rows, d.metric, title, d.currency)}`;
}

function donut(d: TileData, title: string): string {
	const rows = d.rows as Slice[];
	const arcs = donutArcs(rows)
		.map(
			(a, i) =>
				`<circle cx="50" cy="50" r="${DONUT_R}" fill="none" stroke="${c(i)}" stroke-width="14" stroke-dasharray="${a.dasharray}" stroke-dashoffset="${a.dashoffset}" transform="rotate(-90 50 50)"><title>${e(`${a.label}: ${fmt(a.share, "percent")}`)}</title></circle>`,
		)
		.join("");
	return `<svg viewBox="0 0 100 100" style="max-width:160px" role="img" aria-label="${e(title)}"><circle cx="50" cy="50" r="${DONUT_R}" fill="none" stroke="${MUTED}" stroke-opacity="0.2" stroke-width="14"/>${arcs}</svg>${rowsTable(rows, d.metric, title, d.currency)}`;
}

/** The line under a cell: "low sample" under a Search Satisfaction score that rests on too few measured sessions. */
const cellNote = (k: string, r: Record<string, unknown>) => {
	const note = scoreNote(k, r);
	return note ? `<div class="upd">${e(note)}</div>` : "";
};

function table(d: TileData, title: string): string {
	const head = d.columns.map((k) => `<th scope="col"${k === "key" ? "" : ' class="n"'}>${e(valueLabel(k, d.currency))}</th>`).join("");
	const body = d.rows
		.map((r) => `<tr>${d.columns.map((k) => (k === "key" ? `<td>${e(fmt(r[k], "text"))}</td>` : `<td class="n">${e(formatValue(k, r[k], d.currency))}${cellNote(k, r)}</td>`)).join("")}</tr>`)
		.join("");
	return `<table aria-label="${e(title)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Stacked bars: one `<rect>` per segment with a `<title>`, then the same values as a table. */
function stacked(d: TileData, title: string): string {
	const st = d.stack;
	if (!st || !st.series.length) return "<p>No data for this range.</p>";
	const height = 160;
	const rects = stackedRects(
		st.series.map((p) => ({ parts: st.keys.map((k) => p.values[k] ?? 0) })),
		height,
	);
	const g = rects
		.map((col, i) => {
			const p = st.series[i];
			return col.map((r, j) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${c(j)}"><title>${e(`${p?.t}: ${st.labels[j] ?? st.keys[j]} ${fmt(p?.values[st.keys[j] as string] ?? 0)}`)}</title></rect>`).join("");
		})
		.join("");
	const head = `<th scope="col">Period</th>${st.labels.map((l) => `<th scope="col" class="n">${e(l)}</th>`).join("")}`;
	const body = st.series.map((p) => `<tr><td>${e(p.t)}</td>${st.keys.map((k) => `<td class="n">${e(fmt(p.values[k] ?? 0))}</td>`).join("")}</tr>`).join("");
	return `<svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${e(`${title}, ${st.series.length} bars`)}">${g}</svg><table aria-label="${e(title)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function tileBody(d: TileData | null, title: string, tz: string): string {
	if (!d) return "<p>This tile could not be loaded.</p>";
	if (d.empty) return `<p>${e(d.empty)}</p>`;
	if (d.kind === "stacked") return stacked(d, title);
	if (d.kind === "kpi") return kpi(d);
	if (d.kind === "line" || d.kind === "area") return d.buckets.length && d.lines.length ? line(d, title, d.kind === "area", tz) : "<p>No data for this range.</p>";
	if (!d.rows.length) return "<p>No data for this range.</p>";
	if (d.kind === "bars") return bars(d, title);
	if (d.kind === "donut") return donut(d, title);
	return table(d, title);
}

/** Keys whose tiles carry the per-day visitors footnote; `converting` counts sessions and carries none. */
const VISITOR_KEYS = new Set(["visitors"]);
/** Whether a tile displays the figure `key` (`displayedKeys`). */
const shows = (d: TileData | null | undefined, key: string) => !!d && displayedKeys(d).includes(key);

/** Caveats the tiles need: per-day visitors, the bounce rate and session duration definitions, satisfaction estimates, search data lag, summaries. */
export function footnotes(input: Pick<RenderInput, "dashboard" | "tiles">): string[] {
	const out = new Set<string>();
	input.dashboard.tiles.forEach((t, i) => {
		const d = input.tiles[i];
		if ([...VISITOR_KEYS].some((k) => shows(d, k))) out.add(CAVEATS.visitors);
		if (shows(d, "bounce_rate")) out.add(CAVEATS.bounce_footnote);
		if (shows(d, "avg_duration")) out.add(CAVEATS.duration_footnote);
		if (t.report === "satisfaction" || t.report === "satisfaction_series") out.add(CAVEATS.satisfaction_estimate);
		if (tileNeedsSearch(t)) out.add(CAVEATS.searchLag);
		if (d?.notices.includes("coverage")) out.add(SEO_TEXT.coverage);
		if (d?.period) out.add(d.period);
		if (d?.footnote) out.add(d.footnote);
		if (t.report === "impact") out.add(SEO_TEXT.caution);
	});
	return [...out];
}

function href(range: Preset, compare: boolean): string {
	return `?r=${encodeURIComponent(range)}${compare ? "&c=1" : ""}`;
}

export function renderShared(input: RenderInput): string {
	const { dashboard: dash, range, compare } = input;
	const updated = new Date(input.generatedAt * 1000).toISOString();
	const nav = input.ranges.map((p) => `<a href="${e(href(p, compare))}"${p === range ? ' aria-current="page"' : ""}>${e(presetLabel(p))}</a>`);
	const cmpText = dash.defaults.compare === "segment" ? "Compare with another segment" : "Compare with previous period";
	if (input.allowCompare) nav.push(`<a href="${e(href(range, !compare))}"${compare ? ' aria-current="true"' : ""}>${cmpText}</a>`);
	const tiles = dash.tiles.map((t, i) => {
		const d = input.tiles[i] ?? null;
		const title = tileTitle(t, d?.currency);
		const hid = `t-${t.id}`;
		const notes = d ? noticeText(d.notices).map((n) => `<p class="note">${e(n)}</p>`).join("") : "";
		// Revenue tiles: the tile's currency and the other currencies, so no amount disappears silently.
		const money = d && !d.empty ? currencyLines(d).map((l) => `<p class="upd">${e(l)}</p>`).join("") : "";
		return `<section class="w${t.w}" aria-labelledby="${hid}"><h2 id="${hid}">${e(title)}</h2>${notes}${tileBody(d, title, input.tz ?? "UTC")}${money}</section>`;
	});
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>${e(dash.name)}</title><style>${CSS}</style></head><body><header><h1>${e(dash.name)}</h1><nav aria-label="Date range">${nav.join("")}</nav><p class="upd">Updated <time datetime="${e(updated)}">${e(updated.slice(0, 16).replace("T", " "))}</time> UTC</p></header><main class="grid">${tiles.join("")}</main><footer>${footnotes(input)
		.map((f) => `<p>${e(f)}</p>`)
		.join("")}<p>Shared view</p></footer></body></html>`;
}
