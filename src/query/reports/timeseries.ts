import { addDays, daysBetween, eachDay } from "../../core/time.js";
import { isoDay } from "../../db/dialect.js";
import { TRUE } from "../compile.js";
import { annotationsIn, DURATION_MS, type Point, type ReportCtx, type ReportData, type RunInput, sessionMetrics, sessionWhere } from "./base.js";

export type Granularity = "hour" | "day" | "week";

/** auto: hour up to 2 days, day up to 120 days, week beyond. */
export function resolveGranularity(g: RunInput["granularity"], from: string, to: string): Granularity {
	if (g !== "auto") return g;
	const n = daysBetween(from, to);
	return n <= 2 ? "hour" : n <= 120 ? "day" : "week";
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
	const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
	return addDays(day, -((dow + 6) % 7));
}

export const hourKey = (day: string, h: number) => `${day} ${String(h).padStart(2, "0")}:00`;

/** Session metrics per bucket, zero-filled, with annotations of the range (current run). */
export async function timeseries(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const gran = resolveGranularity(input.granularity, input.from, input.to);
	const where = sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE);
	const byHour = gran === "hour";
	// Visitors: distinct per day (per hour for hourly buckets), summed into weeks.
	const rows = await rc.db.all(
		`SELECT s.day AS day, ${byHour ? "s.hour" : "0"} AS hour, COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews, COUNT(DISTINCT s.vkey) AS visitors,
SUM(CASE WHEN s.pageviews = 1 AND s.events = 0 THEN 1 ELSE 0 END) AS bounces,
SUM(CASE WHEN s.engaged_ms >= ? OR s.pageviews > 1 OR s.events > 0 THEN 1 ELSE 0 END) AS engaged,
SUM(${DURATION_MS}) AS duration_ms
FROM ca_sessions s WHERE ${where.sql} GROUP BY s.day${byHour ? ", s.hour" : ""}`,
		[rc.settings.engagedThresholdSeconds * 1000, ...where.params],
	);
	const series = bucketSeries(input.from, input.to, gran, rows);
	return input.isCompare ? { series, granularity: gran } : { series, granularity: gran, annotations: annotationsIn(rc, input.from, input.to) };
}

/** Zero-filled buckets from per day (or day and hour) session sums. */
export function bucketSeries(from: string, to: string, gran: Granularity, rows: ReadonlyArray<Record<string, unknown>>): Point[] {
	const byHour = gran === "hour";
	const buckets = new Map<string, Record<string, number>>();
	const keys: string[] = [];
	for (const day of eachDay(from, to)) {
		const ks = byHour ? Array.from({ length: 24 }, (_, h) => hourKey(day, h)) : [gran === "week" ? weekStart(day) : day];
		for (const k of ks)
			if (!buckets.has(k)) {
				buckets.set(k, { sessions: 0, pageviews: 0, visitors: 0, bounces: 0, engaged: 0, duration_ms: 0 });
				keys.push(k);
			}
	}
	for (const r of rows) {
		const day = isoDay(r.day);
		const k = byHour ? hourKey(day, Number(r.hour)) : gran === "week" ? weekStart(day) : day;
		const b = buckets.get(k);
		if (!b) continue;
		for (const f of Object.keys(b)) b[f] = (b[f] ?? 0) + Number(r[f] ?? 0);
	}
	return keys.map((t) => ({ t, ...sessionMetrics(buckets.get(t) ?? {}) }));
}
