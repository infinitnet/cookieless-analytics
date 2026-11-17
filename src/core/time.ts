/** Time helpers. Timestamps are epoch seconds; days are `YYYY-MM-DD` strings. */

const DAY_S = 86_400;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
	let f = formatters.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		});
		formatters.set(tz, f);
	}
	return f;
}

interface WallTime {
	y: number;
	m: number;
	d: number;
	h: number;
	mi: number;
	s: number;
}

function wallTime(ts: number, tz: string): WallTime {
	const p: Record<string, number> = {};
	for (const part of formatter(tz).formatToParts(new Date(ts * 1000))) {
		if (part.type !== "literal") p[part.type] = Number(part.value);
	}
	return { y: p.year ?? 1970, m: p.month ?? 1, d: p.day ?? 1, h: (p.hour ?? 0) % 24, mi: p.minute ?? 0, s: p.second ?? 0 };
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDay = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function dayInZone(ts: number, tz: string): string {
	const w = wallTime(ts, tz);
	return fmtDay(w.y, w.m, w.d);
}

export function hourInZone(ts: number, tz: string): number {
	return wallTime(ts, tz).h;
}

/** Offset of `tz` from UTC at instant `ts`, in seconds (positive east of UTC). */
export function tzOffset(ts: number, tz: string): number {
	const w = wallTime(ts, tz);
	return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) / 1000 - Math.floor(ts);
}

/** Epoch seconds of a local wall time in `tz`. Times inside a DST gap resolve one offset away. */
export function zonedToEpoch(day: string, hour: number, tz: string): number {
	const [y, m, d] = day.split("-").map(Number) as [number, number, number];
	const guess = Date.UTC(y, m - 1, d, hour) / 1000;
	const first = guess - tzOffset(guess, tz);
	return guess - tzOffset(first, tz);
}

/** Calendar arithmetic on `YYYY-MM-DD`. */
export function addDays(day: string, n: number): string {
	const [y, m, d] = day.split("-").map(Number) as [number, number, number];
	const t = new Date(Date.UTC(y, m - 1, d + n));
	return fmtDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Inclusive number of days between two `YYYY-MM-DD` strings. */
export function daysBetween(from: string, to: string): number {
	const a = Date.parse(`${from}T00:00:00Z`);
	const b = Date.parse(`${to}T00:00:00Z`);
	return Math.round((b - a) / (DAY_S * 1000)) + 1;
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
	const out: string[] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
	return out;
}

/** Salt day: the local calendar day in `tz` that starts at `rotationHour`. */
export function saltDay(ts: number, tz: string, rotationHour: number): string {
	const w = wallTime(ts, tz);
	const day = fmtDay(w.y, w.m, w.d);
	return w.h < rotationHour ? addDays(day, -1) : day;
}

/** Epoch seconds at which the current salt day began. */
export function saltBoundary(ts: number, tz: string, rotationHour: number): number {
	return zonedToEpoch(saltDay(ts, tz, rotationHour), rotationHour, tz);
}

export interface DayRange {
	from: string;
	to: string;
}

/** Same-length range immediately before `r`. */
export function previousPeriod(r: DayRange): DayRange {
	const len = daysBetween(r.from, r.to);
	return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

function minusYear(day: string): string {
	const [y, m, d] = day.split("-").map(Number) as [number, number, number];
	// Feb 29 maps to Feb 28 of the previous year.
	const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
	return fmtDay(y - 1, m, Math.min(d, last));
}

/** The same calendar range one year earlier. */
export function samePeriodLastYear(r: DayRange): DayRange {
	return { from: minusYear(r.from), to: minusYear(r.to) };
}

/** Minutes after local midnight, past the write path's reach, before a day is closed (requests in flight, cron jitter). */
export const CLOSE_GRACE_S = 15 * 60;

/**
 * Newest closed day (its summary may be stored). The write path reaches visits started today or yesterday
 * (`liveDays`, engagement updates have no time bound), so day D can change until local midnight that starts D + 2:
 * midnight plus the longest session, plus `CLOSE_GRACE_S`.
 */
export function lastClosedDay(now: number, tz: string): string {
	const today = dayInZone(now, tz);
	return addDays(today, now >= zonedToEpoch(today, 0, tz) + CLOSE_GRACE_S ? -2 : -3);
}
