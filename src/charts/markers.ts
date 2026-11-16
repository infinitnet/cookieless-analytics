/** Bucket key of an annotation on a series chart, shared by the admin chart kit and the shared page renderer. */
import { dayInZone, hourInZone } from "../core/time.js";
import { type Granularity, weekStart } from "../query/reports/timeseries.js";

/** The series bucket (`YYYY-MM-DD`, `YYYY-MM-DD HH:00` or a week start) holding `ts` in the site timezone. */
export function annotationBucket(ts: number, gran: Granularity, tz: string): string {
	const day = dayInZone(ts, tz);
	return gran === "hour" ? `${day} ${String(hourInZone(ts, tz)).padStart(2, "0")}:00` : gran === "week" ? weekStart(day) : day;
}
