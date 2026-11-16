/**
 * Scheduled dashboard email body: `renderEmail` returns `{ subject, text, html }`. The HTML is table
 * based with inline styles, because mail clients strip SVG: KPI tiles as label, value and change; series tiles as one
 * line with latest, previous and change; breakdowns and tables as a table. No image, script, remote resource or share
 * link; the only URL is the one link to the dashboard in the admin. Every dynamic string is escaped (paths, sources,
 * event names and search terms are visitor controlled).
 */
import { noticeText } from "../charts/caveats.js";
import { changeText, describeChange } from "../charts/change.js";
import { fmt } from "../charts/geometry.js";
import { type Preset, PRESETS } from "../core/presets.js";
import { escapeHtml as e, footnotes } from "./render.js";
import { type Dashboard, MAIL_MAX_HTML_BYTES } from "./schema.js";
import { currencyLines, formatValue, REVENUE_EMPTY, type TileData, type TileLine, tileChange, tileTitle, valueFormat, valueLabel } from "./tiles.js";

/** One tile of the email: its data, or null when it failed; `budget` when the query budget left it out. */
export interface EmailTile {
	data: TileData | null;
	budget?: boolean;
	/** Site search tiles: terms below the two session floor (`hidden_terms`). */
	hiddenTerms?: number;
}

export interface EmailInput {
	dashboard: Pick<Dashboard, "name" | "tiles">;
	/** Aligned with `dashboard.tiles`. */
	tiles: readonly EmailTile[];
	range: Preset;
	compare: boolean;
	subject?: string | undefined;
	/** The one link of the email: the dashboard in the admin. */
	adminUrl: string;
	/** Epoch seconds. */
	generatedAt: number;
}

export const BUDGET_LINE = "Not included in this email: query budget reached.";
const TOO_LARGE_LINE = "Not included in this email: too large for an email.";

const presetLabel = (p: Preset) => PRESETS.find((x) => x[0] === p)?.[1] ?? p;
const S = {
	body: "margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a",
	box: "max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0",
	cell: "padding:12px 16px",
	h1: "font-size:20px;margin:0 0 4px",
	h2: "font-size:14px;margin:0 0 6px",
	muted: "color:#64748b;font-size:12px;margin:4px 0",
	kpi: "font-size:24px;font-weight:bold",
	th: "text-align:left;padding:3px 6px;border-bottom:1px solid #e2e8f0;font-size:12px",
	td: "text-align:left;padding:3px 6px;border-bottom:1px solid #f1f5f9;font-size:12px",
	num: "text-align:right;padding:3px 6px;border-bottom:1px solid #f1f5f9;font-size:12px",
};

/** Change colours with at least 4.5:1 on white; the words carry the meaning too. */
const JUDGE_COLOR = { better: "#15803d", worse: "#b91c1c", neutral: "#64748b" } as const;

/** The change line of a KPI tile under its value: arrow, label and word in the judgement colour, then the detail. */
function changeLine(d: TileData): string {
	const c = tileChange(d);
	if (!c) return "";
	const color = c.kind === "none" || c.muted ? JUDGE_COLOR.neutral : JUDGE_COLOR[c.judgement ?? "neutral"];
	return `<p style="margin:2px 0 0;font-size:13px;color:${color}">${e(changeText(c, true))}</p>${c.detail ? `<p style="${S.muted}">${e(c.detail)}</p>` : ""}`;
}

/** A revenue tile whose site has no revenue is left out of the email. */
const omitted = (report: string, d: TileData | null) => report.startsWith("revenue") && d?.empty === REVENUE_EMPTY;

const lastTwo = (l: TileLine): { latest: number | null; previous: number | null } => {
	const i = l.values.length - 1;
	const latest = l.values[i] ?? null;
	// With a comparison the previous value is the compare series at the same point, else the point before.
	const previous = l.compare ? (l.compare[i] ?? null) : (l.values[i - 1] ?? null);
	return { latest, previous };
};

/** Table rows of a tile as label and cells; `null` when the tile has no table form. */
function tableOf(d: TileData, maxRows: number): { head: string[]; rows: string[][]; numeric: boolean[] } | null {
	if (d.kind === "table") {
		const rows = d.rows.slice(0, maxRows).map((r) => d.columns.map((k) => (k === "key" || k === "query" ? fmt(r[k], "text") : formatValue(k, r[k], d.currency))));
		return { head: d.columns.map((k) => valueLabel(k, d.currency)), rows, numeric: d.columns.map((k) => k !== "key" && k !== "query") };
	}
	if (d.kind === "bars" || d.kind === "donut") {
		const rows = (d.rows as Array<{ label: string; value: number }>).slice(0, maxRows).map((r) => [r.label, formatValue(d.metric, r.value, d.currency)]);
		return { head: ["Name", valueLabel(d.metric ?? "value", d.currency)], rows, numeric: [false, true] };
	}
	if (d.kind === "stacked" && d.stack) {
		const last = d.stack.series[d.stack.series.length - 1];
		if (!last) return null;
		return { head: [`Period ${last.t}`, "Value"], rows: d.stack.keys.map((k, i) => [d.stack?.labels[i] ?? k, fmt(last.values[k] ?? 0)]), numeric: [false, true] };
	}
	return null;
}

/** The figures of one tile as plain lines (shared by the text part and the HTML lines). */
function lines(d: TileData): string[] {
	if (d.empty) return [d.empty];
	if (d.kind === "kpi" && d.impact) {
		const i = d.impact;
		const c = tileChange(d);
		return [`After ${i.day}: ${formatValue(d.metric, i.after, d.currency)}, before: ${formatValue(d.metric, i.before, d.currency)}${c ? ` (${changeText(c, true)})` : ""}`];
	}
	if (d.kind === "kpi") {
		const c = tileChange(d);
		return [formatValue(d.metric, d.value, d.currency), ...(c ? [changeText(c)] : [])];
	}
	if (d.kind === "line" || d.kind === "area") {
		if (!d.buckets.length || !d.lines.length) return ["No data for this range."];
		// One line per metric; the metric's name leads when the tile has several.
		return d.lines.map((l) => {
			const { latest, previous } = lastTwo(l);
			const c = describeChange(l.key, latest, previous, { format: valueFormat(l.key, d.currency) });
			const lead = d.lines.length > 1 ? `${valueLabel(l.key, d.currency)}, latest` : "Latest";
			return `${lead}: ${formatValue(l.key, latest, d.currency)}, previous: ${formatValue(l.key, previous, d.currency)}${c.kind !== "none" ? `, change: ${changeText(c, true)}` : ""}`;
		});
	}
	return [];
}

function tileHtml(title: string, t: EmailTile, maxRows: number): string {
	const head = `<h2 style="${S.h2}">${e(title)}</h2>`;
	if (t.budget) return `${head}<p style="${S.muted}">${e(BUDGET_LINE)} Open the dashboard in the admin to see it.</p>`;
	const d = t.data;
	if (!d) return `${head}<p style="${S.muted}">This tile could not be loaded.</p>`;
	const notes = noticeText(d.notices).map((n) => `<p style="${S.muted}">${e(n)}</p>`).join("");
	let body: string;
	const tbl = d.empty ? null : tableOf(d, maxRows);
	if (tbl) {
		if (!tbl.rows.length) body = `<p style="margin:0">No data for this range.</p>`;
		else {
			const th = tbl.head.map((h, i) => `<th style="${tbl.numeric[i] ? S.num : S.th}">${e(h)}</th>`).join("");
			const rows = tbl.rows.map((r) => `<tr>${r.map((c, i) => `<td style="${tbl.numeric[i] ? S.num : S.td}">${e(c)}</td>`).join("")}</tr>`).join("");
			body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th}</tr>${rows}</table>`;
		}
	} else {
		const ls = lines(d);
		body = d.kind === "kpi" && !d.empty ? `<div style="${S.kpi}">${e(ls[0] ?? "")}</div>${d.impact ? "" : changeLine(d)}` : ls.map((l) => `<p style="margin:0">${e(l)}</p>`).join("");
	}
	const money = d.empty ? "" : currencyLines(d).map((l) => `<p style="${S.muted}">${e(l)}</p>`).join("");
	const hidden = t.hiddenTerms ? `<p style="${S.muted}">${e(hiddenLine(t.hiddenTerms))}</p>` : "";
	return `${head}${notes}${body}${money}${hidden}`;
}

const hiddenLine = (n: number) => `${n} search term${n === 1 ? "" : "s"} used in only one session ${n === 1 ? "is" : "are"} not shown.`;

function tileText(title: string, t: EmailTile, maxRows: number): string {
	const out = [title.toUpperCase()];
	if (t.budget) out.push(`${BUDGET_LINE} Open the dashboard in the admin to see it.`);
	else if (!t.data) out.push("This tile could not be loaded.");
	else {
		const d = t.data;
		out.push(...noticeText(d.notices));
		const tbl = d.empty ? null : tableOf(d, maxRows);
		if (tbl) out.push(...(tbl.rows.length ? tbl.rows.map((r) => `- ${r[0]}: ${r.slice(1).map((c, i) => `${tbl.head[i + 1]} ${c}`).join(", ")}`) : ["No data for this range."]));
		else out.push(...lines(d));
		if (!d.empty) out.push(...currencyLines(d));
		if (t.hiddenTerms) out.push(hiddenLine(t.hiddenTerms));
	}
	return out.join("\n");
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

export function renderEmail(input: EmailInput): { subject: string; text: string; html: string } {
	const { dashboard: dash } = input;
	const range = presetLabel(input.range);
	const subject = input.subject ?? `${dash.name}: ${range}`;
	const updated = new Date(input.generatedAt * 1000).toISOString().slice(0, 16).replace("T", " ");
	const sub = `${range}${input.compare ? ", compared with the previous period" : ""}. Updated ${updated} UTC.`;
	const shown = dash.tiles.flatMap((tile, i) => {
		const t = input.tiles[i] ?? { data: null };
		return omitted(tile.report, t.data) ? [] : [{ title: tileTitle(tile, t.data?.currency), t }];
	});
	const notes = footnotes({ dashboard: { ...dash, tiles: dash.tiles } as Dashboard, tiles: input.tiles.map((t) => t.data) });

	const build = (maxRows: number, bodies: boolean) => {
		const cells = shown.map(({ title, t }) => `<tr><td style="${S.cell};border-top:1px solid #e2e8f0">${bodies ? tileHtml(title, t, maxRows) : `<h2 style="${S.h2}">${e(title)}</h2><p style="${S.muted}">${e(TOO_LARGE_LINE)}</p>`}</td></tr>`).join("");
		const foot = notes.map((n) => `<p style="${S.muted}">${e(n)}</p>`).join("");
		return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(subject)}</title></head><body style="${S.body}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${S.box}"><tr><td style="${S.cell}"><h1 style="${S.h1}">${e(dash.name)}</h1><p style="${S.muted}">${e(sub)}</p></td></tr>${cells}<tr><td style="${S.cell};border-top:1px solid #e2e8f0">${foot}<p style="font-size:13px;margin:8px 0 0"><a href="${e(input.adminUrl)}" style="color:#2563eb">Open this dashboard in the admin</a></p></td></tr></table></td></tr></table></body></html>`;
	};
	// Within the size cap: full tables, then five rows, then titles only.
	let html = build(Number.POSITIVE_INFINITY, true);
	if (bytes(html) > MAIL_MAX_HTML_BYTES) html = build(5, true);
	if (bytes(html) > MAIL_MAX_HTML_BYTES) html = build(0, false);

	const text = [dash.name, sub, "", ...shown.map(({ title, t }) => `${tileText(title, t, Number.POSITIVE_INFINITY)}\n`), ...notes, "", `Open this dashboard in the admin: ${input.adminUrl}`].join("\n");
	return { subject, text, html };
}
