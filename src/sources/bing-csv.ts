/**
 * Bing Webmaster Tools file import: the CSV the Search Performance report exports (one table per file:
 * keywords, that is queries, or pages). The exact export layout is not documented by Microsoft
 * (see docs/search-sources.md), so the parser is lenient: comma, semicolon or tab separated,
 * an optional byte order mark, quoted fields, header names matched loosely ("Keyword", "Query", "Page",
 * "URL", "Avg. Position", ...), thousands separators and decimal commas, and dates as ISO, M/D/YYYY,
 * D.M.YYYY or a WCF `/Date(ms)/`. A file without a date column is stored on one day the caller names.
 */
import { addDays } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { wcfDay } from "./bing.js";
import { nextUtcDay, ROWS_PER_ROW_BOUND, RowsPaused, type SyncRows } from "./budget.js";
import { replaceStatements, writeReplace } from "./store.js";
import { PROVISIONAL_DAYS } from "./sync.js";
import type { SearchRow, SiteTarget } from "./types.js";

/** About 8,000 rows; parsing it takes about 7 ms of CPU (measured: about 14 ms per million characters), inside the Workers Free plan's 10 ms. */
export const CSV_MAX_CHARS = 500_000;
export const CSV_MAX_ROWS = 50_000;

export type CsvKind = "query" | "page" | "totals";
export interface CsvRow {
	key: string;
	day: string | null;
	clicks: number;
	impressions: number;
	position: number;
}
export interface ParsedCsv {
	kind: CsvKind;
	hasDate: boolean;
	rows: CsvRow[];
	/** Data lines that were not usable (no key, no numbers, an unreadable date). */
	skipped: number;
}

export class CsvError extends Error {}

const HEADERS: Record<string, readonly string[]> = {
	query: ["keyword", "keywords", "query", "queries", "searchquery", "searchqueries", "searchterm", "topqueries", "topkeywords"],
	page: ["page", "pages", "url", "urls", "pageurl", "toppages", "landingpage"],
	day: ["date", "day", "reportdate"],
	clicks: ["clicks", "click"],
	impressions: ["impressions", "impression", "impr"],
	position: ["avgposition", "averageposition", "position", "avgimpressionposition", "averageimpressionposition", "avgpos", "rank", "avgrank"],
};
const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

/** Fields of each line; `"` quotes with `""` escapes, CRLF or LF line ends. Scans with `indexOf` (native) instead of per character. */
export function splitCsv(text: string, sep: string): string[][] {
	const out: string[][] = [];
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i] as string;
		if (!line.includes('"')) {
			if (line.trim()) out.push(line.split(sep));
			continue;
		}
		const row: string[] = [];
		let j = 0;
		for (;;) {
			if (line.charCodeAt(j) === 34) {
				let k = j + 1;
				let buf = "";
				for (;;) {
					const q = line.indexOf('"', k);
					if (q < 0) {
						// A quoted field spanning lines.
						if (i + 1 >= lines.length) {
							buf += line.slice(k);
							k = line.length;
							break;
						}
						line += `\n${lines[++i]}`;
						continue;
					}
					if (line.charCodeAt(q + 1) === 34) {
						buf += line.slice(k, q + 1);
						k = q + 2;
						continue;
					}
					buf += line.slice(k, q);
					k = q + 1;
					break;
				}
				row.push(buf);
				const e = line.indexOf(sep, k);
				if (e < 0) break;
				j = e + 1;
			} else {
				const e = line.indexOf(sep, j);
				if (e < 0) {
					row.push(line.slice(j));
					break;
				}
				row.push(line.slice(j, e));
				j = e + 1;
			}
		}
		if (row.some((f) => f.trim())) out.push(row);
	}
	return out;
}

/** A count: "1,234", "1.234" and "1 234" are 1234; anything else rounds. */
export function parseCount(v: string): number | null {
	if (/^\d+$/.test(v)) return Number(v);
	const t = v.replace(/[\s  ]/g, "");
	if (!t) return 0;
	if (/^\d{1,3}([.,']\d{3})+$/.test(t)) return Number(t.replace(/[.,']/g, ""));
	const n = Number(t.replace(",", "."));
	return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** A decimal: "4.5", "4,5" (decimal comma), "1,234.5" and "1.234,5". */
export function parseDecimal(v: string): number | null {
	if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
	let t = v.replace(/[\s  %]/g, "");
	if (!t) return 0;
	const dot = t.lastIndexOf(".");
	const comma = t.lastIndexOf(",");
	if (dot >= 0 && comma >= 0) t = dot > comma ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
	else if (comma >= 0) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
	const n = Number(t);
	return Number.isFinite(n) && n >= 0 ? n : null;
}

const iso = (y: number, m: number, d: number) => {
	const t = Date.UTC(y, m - 1, d);
	const s = new Date(t).toISOString().slice(0, 10);
	return y >= 2000 && y < 2100 && s === `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` ? s : null;
};

/** `YYYY-MM-DD` from ISO (optionally with a time), `YYYY/MM/DD`, `M/D/YYYY` (US, the Bing default; D/M/YYYY for the whole file when any first part is above 12), `D.M.YYYY`, `D-M-YYYY` or `/Date(ms)/`. */
const days = new Map<string, string | null>();
/** `dayFirst`: slash dates are D/M/YYYY; the parser decides it once per file (any first part above 12). */
export function parseDay(v: string, dayFirst = false): string | null {
	// An export repeats each date on many rows.
	const k = dayFirst ? `d${v}` : v;
	const hit = days.get(k);
	if (hit !== undefined) return hit;
	if (days.size > 5000) days.clear();
	const d = readDay(v.trim(), dayFirst);
	days.set(k, d);
	return d;
}
function readDay(t: string, dayFirst: boolean): string | null {
	let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/.exec(t);
	if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
	m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(t);
	if (m) return dayFirst || Number(m[1]) > 12 ? iso(Number(m[3]), Number(m[2]), Number(m[1])) : iso(Number(m[3]), Number(m[1]), Number(m[2]));
	m = /^(\d{1,2})[.-](\d{1,2})[.-](\d{4})(?:\s.*)?$/.exec(t);
	if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
	return wcfDay(t);
}

/** Parse one exported table. Throws `CsvError` with a plain sentence when the file is not usable. */
export function parseBingCsv(input: string): ParsedCsv {
	if (input.length > CSV_MAX_CHARS) throw new CsvError(`The file is larger than ${CSV_MAX_CHARS / 1000} KB. Export a shorter date range.`);
	const text = input.replace(/^﻿/, "");
	const first = text.split(/\r?\n/, 1)[0] ?? "";
	const counts = [",", ";", "\t"].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1]);
	const sep = (counts[0] as readonly [string, number])[0];
	const lines = splitCsv(text, sep);
	const header = (lines.shift() ?? []).map(norm);
	const col = (name: keyof typeof HEADERS) => header.findIndex((h) => (HEADERS[name] as readonly string[]).includes(h));
	const at = { query: col("query"), page: col("page"), day: col("day"), clicks: col("clicks"), impressions: col("impressions"), position: col("position") };
	if (at.clicks < 0 || at.impressions < 0) throw new CsvError("The file has no Clicks and Impressions columns. Export the Search Performance table from Bing Webmaster Tools.");
	if (at.query >= 0 && at.page >= 0) throw new CsvError("The file has both a query and a page column. Bing stores no page with query pairs; import the Keywords and the Pages export separately.");
	const kind: CsvKind = at.query >= 0 ? "query" : at.page >= 0 ? "page" : "totals";
	if (kind === "totals" && at.day < 0) throw new CsvError("The file has no Keyword, Page or Date column.");
	if (lines.length > CSV_MAX_ROWS) throw new CsvError(`The file has more than ${CSV_MAX_ROWS} rows. Export a shorter date range.`);
	const keyAt = kind === "query" ? at.query : at.page;
	const rows: CsvRow[] = [];
	let skipped = 0;
	// One order for the whole file: a single slash date with a first part above 12 makes every slash date D/M.
	const dayFirst = at.day >= 0 && lines.some((f) => Number(/^\s*(\d{1,2})\/\d{1,2}\/\d{4}/.exec(f[at.day] ?? "")?.[1] ?? 0) > 12);
	const last = Math.max(at.clicks, at.impressions, at.position, at.day, keyAt);
	for (const f of lines) {
		// A short line (cut off, or a footer) has no counts: skipped rather than read as zero.
		if (f.length <= last) {
			skipped++;
			continue;
		}
		const key = keyAt >= 0 ? (f[keyAt] ?? "").trim() : "";
		const day = at.day >= 0 ? parseDay(f[at.day] ?? "", dayFirst) : null;
		const clicks = parseCount(f[at.clicks] ?? "");
		const impressions = parseCount(f[at.impressions] ?? "");
		const position = at.position >= 0 ? parseDecimal(f[at.position] ?? "") : 0;
		if ((kind !== "totals" && !key) || (at.day >= 0 && !day) || clicks === null || impressions === null || position === null) {
			skipped++;
			continue;
		}
		rows.push({ key, day, clicks, impressions, position });
	}
	return { kind, hasDate: at.day >= 0, rows, skipped };
}

export interface ImportResult {
	kind: CsvKind;
	days: number;
	rows: number;
	/** Lines not usable, plus rows outside the retention or on another host. */
	skipped: number;
	from: string | null;
	to: string | null;
}

/**
 * Store a parsed export as source `bing` rows of one site: per day, the rows of that table replace the
 * stored rows of the same table (queries keep pages and totals, and the reverse), exactly the rows a pull
 * of the API would write (no country or device, `pos_sum = position * impressions`, pages normalized to
 * the site's page keys, other hosts dropped). Days must lie inside `searchRetentionDays` and before today;
 * the newest three are provisional like a pull. A file without dates goes to `day`.
 */
export async function importBingCsv(o: { db: Db; target: Pick<SiteTarget, "site" | "pageKey">; today: string; retentionDays: number; rows?: SyncRows }, csv: ParsedCsv, day?: string): Promise<ImportResult> {
	if (!csv.hasDate && !day) throw new CsvError("The file has no Date column. Choose the day to store it on (for example the last day of the exported range).");
	const oldest = addDays(o.today, -o.retentionDays);
	const days = new Map<string, SearchRow[]>();
	let skipped = csv.skipped;
	for (const r of csv.rows) {
		const d = r.day ?? (day as string);
		const page = csv.kind === "page" ? o.target.pageKey(r.key) : "";
		if (d < oldest || d >= o.today || page === null) {
			skipped++;
			continue;
		}
		const row: SearchRow = { page_key: page, query: csv.kind === "query" ? r.key.slice(0, 512) : "", country: "", device: "", clicks: r.clicks, impressions: r.impressions, pos_sum: r.position * r.impressions };
		const list = days.get(d);
		if (list) list.push(row);
		else days.set(d, [row]);
	}
	const { stmts, rows } = replaceStatements(o.db.dialect, o.target.site, "bing", days, (d) => d >= addDays(o.today, -PROVISIONAL_DAYS), csv.kind);
	// The whole file or nothing: its bound must fit what today's Search rows budget has left.
	const a = await o.rows?.allowance();
	if (a && rows * ROWS_PER_ROW_BOUND > a.left)
		throw new RowsPaused(nextUtcDay(Date.now()), `This file writes up to ${rows * ROWS_PER_ROW_BOUND} rows; Search may write ${a.left} more rows today (the budget resets at 00:00 UTC). Import it after the reset, or export fewer days.`);
	const written = await writeReplace(o.db, stmts, rows);
	await o.rows?.charge(written);
	const sorted = [...days.keys()].sort();
	return { kind: csv.kind, days: days.size, rows, skipped, from: sorted[0] ?? null, to: sorted[sorted.length - 1] ?? null };
}
