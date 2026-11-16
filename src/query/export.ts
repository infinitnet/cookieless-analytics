/** Report export: CSV per RFC 4180 and JSON, at most 10 000 rows. */
import type { ReportData } from "./reports/base.js";
import { EXPORT_LIMIT, type ReportResult } from "./reports/index.js";

export type ExportFormat = "csv" | "json";

/**
 * The exported rows of a report: its rows, else its series, else its totals as one row. Revenue results
 * (`data.currency`) carry a `currency` column on every row, so no amount leaves without its code.
 */
export function exportRows(data: ReportData): Array<Record<string, unknown>> {
	const rows = (data.rows ?? data.series ?? (data.totals ? [data.totals] : [])).slice(0, EXPORT_LIMIT);
	const cur = typeof data.currency === "string" ? data.currency : null;
	return cur ? rows.map((r) => ({ ...r, currency: typeof r.currency === "string" ? r.currency : cur })) : rows;
}

/** One level of nesting becomes `parent.child` columns; deeper values and arrays become JSON text. */
function flatten(r: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(r)) {
		if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
		else out[k] = v;
	}
	return out;
}

/** A spreadsheet must not run a stored path or referrer as a formula. */
const FORMULA = /^[=+\-@\t\r]/;

export function csvField(v: unknown): string {
	if (v === null || v === undefined) return "";
	let s = typeof v === "object" ? JSON.stringify(v) : String(v);
	if (typeof v === "string" && FORMULA.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180: CRLF line ends, a header row, fields quoted when they hold a quote, comma or line break. */
export function toCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
	const flat = rows.map(flatten);
	const cols: string[] = [];
	for (const r of flat) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
	return [cols.map(csvField).join(","), ...flat.map((r) => cols.map((c) => csvField(r[c])).join(","))].join("\r\n") + "\r\n";
}

export function exportBody(result: ReportResult, format: ExportFormat): { body: string; contentType: string; filename: string } {
	const rows = exportRows(result.data);
	const filename = `${result.report}-${result.range.from}-${result.range.to}.${format}`;
	return format === "csv"
		? { body: toCsv(rows), contentType: "text/csv; charset=utf-8", filename }
		: { body: JSON.stringify(rows), contentType: "application/json; charset=utf-8", filename };
}
