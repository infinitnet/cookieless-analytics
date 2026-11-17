/**
 * Seeded report fixture, written through the real recorder so reports run on the rows production would
 * store (visit documents, `ca_events`, `ca_srv`). The schedule is in local site time, so the expected numbers are the
 * same in every timezone. Hand-computed totals are listed in tests/reports.test.ts.
 *
 * Current range 2026-03-10..12, 12 sessions per day (index i, start at local 08:00 + i hours):
 *   i  channel         pages            events          engagement              country device
 *   0  Direct          /                _outbound +30s  / 2000 ms, scroll 25    DE      mobile
 *   1  Direct          /, /pricing      -               /pricing 5000, 50       US      desktop  visitor X
 *   2  Direct          /                -               / 15000, 80             FR      desktop
 *   3  Direct          /, /pricing      signup pro +90s /pricing 5000, 50       DE      desktop  visitor X
 *   4  Organic Search  /                -               -                       US      mobile
 *   5  Organic Search  /, /pricing      -               /pricing 5000, 50       FR      desktop
 *   6  Organic Search  /                -               -                       DE      desktop
 *   7  Organic Social  /, /pricing      signup pro      /pricing 5000, 50       US      desktop
 *   8  Organic Social  /                -               -                       FR      mobile
 *   9  Paid Search     /, /pricing      -               /pricing 5000, 50       DE      desktop
 *  10  Paid Search     /                -               -                       US      desktop
 *  11  AI Assistants   /, /pricing      signup free     /pricing 5000, 50       FR      desktop
 * Second pageviews come 60 s after the first. Boundary sessions (Direct, /late, no country):
 *   B1 2026-03-12 23:55 (in range), B2 2026-03-13 00:05 (after), B3 2026-03-09 23:55 (previous range).
 * Previous range extras: P1 2026-03-08 10:00 Direct /; P2 2026-03-09 12:00 Organic Search /, /pricing.
 * Year range extras: Y1 2025-03-11 10:00 Organic Search /, /pricing; Y2 2025-03-12 10:00 Paid Search /.
 * Server rows: human 404s /missing (twice, referrer news.example.com/post) and /gone; bot requests that write nothing.
 */
import type { IngestBody } from "../../src/contract.js";
import { validateIngest } from "../../src/core/ids.js";
import { type RecorderDeps, recordClientEvent, recordServerHit, requestInfo, resetCounters } from "../../src/core/recorder.js";
import { zonedToEpoch } from "../../src/core/time.js";
import { normalizeSettings, type Settings } from "../../src/settings.js";
import { CHROME_UA, eventRequest, GOOGLEBOT_UA, type schemaDb } from "../helpers.js";

export const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
export const GPTBOT_UA = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
export const DAYS = ["2026-03-10", "2026-03-11", "2026-03-12"] as const;
export const RANGE = { from: "2026-03-10", to: "2026-03-12" } as const;

type Env = Awaited<ReturnType<typeof schemaDb>>;

interface Visit {
	day: string;
	/** Local hour and minute of the first pageview. */
	hour: number;
	minute?: number;
	ip: string;
	ua?: string;
	country?: string;
	ref?: string;
	query?: string;
	pages: string[];
	/** Engagement per page index: [ms, scroll]. */
	eng?: Record<number, [number, number]>;
	events?: Array<{ at: number; name: string; p?: Record<string, string> }>;
}

const CHANNEL = [
	{},
	{},
	{},
	{},
	{ ref: "https://www.google.com/" },
	{ ref: "https://www.google.com/" },
	{ ref: "https://www.google.com/" },
	{ ref: "https://www.facebook.com/" },
	{ ref: "https://www.facebook.com/" },
	{ ref: "https://www.google.com/", query: "?utm_source=google&utm_medium=cpc&utm_campaign=spring" },
	{ ref: "https://www.google.com/", query: "?utm_source=google&utm_medium=cpc&utm_campaign=spring" },
	{ ref: "https://chatgpt.com/" },
] as const;
const COUNTRY = ["DE", "US", "FR"] as const;

function dayVisits(day: string, d: number): Visit[] {
	return Array.from({ length: 12 }, (_, i) => {
		const odd = i % 2 === 1;
		const v: Visit = {
			day,
			hour: 8 + i,
			// Visitor X (i = 1 and i = 3) shares IP and user agent; everyone else has their own /24.
			ip: i === 3 ? `198.${d}.1.7` : `198.${d}.${i}.7`,
			ua: i % 4 === 0 ? IPHONE_UA : CHROME_UA,
			country: COUNTRY[i % 3] as string,
			...CHANNEL[i],
			pages: odd ? ["/", "/pricing"] : ["/"],
		};
		if (odd) v.eng = { 1: [5000, 50] };
		if (i === 0) v.eng = { 0: [2000, 25] };
		if (i === 2) v.eng = { 0: [15000, 80] };
		if (i === 0) v.events = [{ at: 30, name: "_outbound", p: { url: "example.net/x" } }];
		if (i === 3 || i === 7) v.events = [{ at: 90, name: "signup", p: { plan: "pro" } }];
		if (i === 11) v.events = [{ at: 90, name: "signup", p: { plan: "free" } }];
		return v;
	});
}

export function visits(): Visit[] {
	const late = (day: string, hour: number, minute: number, ip: string): Visit => ({ day, hour, minute, ip, pages: ["/late"] });
	return [
		...DAYS.flatMap((day, d) => dayVisits(day, d + 1)),
		late("2026-03-12", 23, 55, "203.0.1.9"),
		late("2026-03-13", 0, 5, "203.0.2.9"),
		late("2026-03-09", 23, 55, "203.0.3.9"),
		{ day: "2026-03-08", hour: 10, ip: "203.0.4.9", pages: ["/"] },
		{ day: "2026-03-09", hour: 12, ip: "203.0.5.9", ref: "https://www.google.com/", pages: ["/", "/pricing"] },
		{ day: "2025-03-11", hour: 10, ip: "203.0.6.9", ref: "https://www.google.com/", pages: ["/", "/pricing"] },
		{ day: "2025-03-12", hour: 10, ip: "203.0.7.9", ref: "https://www.google.com/", query: "?utm_source=google&utm_medium=cpc", pages: ["/"] },
	];
}

let seq = 0;
/** Unique `[a-z0-9]` ids of the ingest lengths: 20 for sids, 12 for hit ids. */
const id = (len: number, prefix: string) => `${prefix}${String(++seq).padStart(len - 1, "0")}`;
const body = (b: Record<string, unknown>) => {
	const v = validateIngest({ v: 1, ...b }, 7_200_000);
	if (!v) throw new Error(`invalid fixture body ${JSON.stringify(b)}`);
	return v as IngestBody;
};

/** Seed every visit and the 404 rows (bot requests write nothing) into `env` with `siteTimezone = tz`. */
export async function seed(env: Env, tz: string, over: Partial<Settings> = {}): Promise<Settings> {
	resetCounters();
	const settings = normalizeSettings({ siteTimezone: tz, ...over } as Record<string, unknown>);
	const deps = (now: number): RecorderDeps => ({ db: env.db, kv: env.kv, settings, now });
	for (const v of visits()) {
		const t0 = zonedToEpoch(v.day, v.hour, tz) + (v.minute ?? 0) * 60;
		const sid = id(20, "s");
		const headers: Record<string, string> = { "user-agent": v.ua ?? CHROME_UA, "cf-connecting-ip": v.ip, ...(v.country ? { "cf-ipcountry": v.country } : {}) };
		const info = requestInfo(eventRequest("{}", headers));
		const hits: string[] = [];
		for (const [n, path] of v.pages.entries()) {
			const h = id(12, "h");
			hits.push(h);
			const u = n === 0 ? `${path}${v.query ?? ""}` : path;
			const out = await recordClientEvent(deps(t0 + n * 60), body({ t: "pv", sid, h, u, ...(n === 0 && v.ref ? { r: v.ref } : {}), w: 1440 }), info);
			if (out !== "ok") throw new Error(`pageview dropped: ${out}`);
		}
		for (const e of v.events ?? []) {
			const out = await recordClientEvent(deps(t0 + e.at), body({ t: "ev", sid, name: e.name, u: v.pages.at(-1), ...(e.p ? { p: e.p } : {}) }), info);
			if (out !== "ok") throw new Error(`event dropped: ${out}`);
		}
		for (const [n, [d, s]] of Object.entries(v.eng ?? {})) {
			await recordClientEvent(deps(t0 + 100), body({ t: "en", sid, h: hits[Number(n)], d, e: d, s, i: 1 }), info);
		}
	}
	const srv = (url: string, status: number, ua: string, referer?: string, t = zonedToEpoch("2026-03-11", 15, tz)) =>
		recordServerHit(deps(t), { ...requestInfo(eventRequest("{}", { "user-agent": ua, ...(referer ? { referer } : {}) })), url, method: "GET", status });
	await srv("/missing", 404, CHROME_UA, "https://news.example.com/post");
	await srv("/missing", 404, CHROME_UA, "https://news.example.com/post");
	await srv("/gone", 404, CHROME_UA);
	for (let k = 0; k < 3; k++) await srv("/", 200, GOOGLEBOT_UA);
	await srv("/x", 404, GOOGLEBOT_UA);
	for (let k = 0; k < 2; k++) await srv("/", 200, GPTBOT_UA);
	return settings;
}

/** Search rows: totals, page, query, country, device and page with query grains for Google and Bing. */
export async function seedSearch(env: Env, site = "default"): Promise<void> {
	type R = [source: string, day: string, page: string, query: string, country: string, device: string, clicks: number, impressions: number, posSum: number];
	const rows: R[] = [];
	for (const day of DAYS) {
		rows.push(
			["google", day, "", "", "", "", 40, 500, 1500],
			["bing", day, "", "", "", "", 8, 100, 400],
			["google", day, "/", "", "", "", 20, 200, 200],
			["google", day, "/pricing", "", "", "", 10, 100, 300],
			["bing", day, "/pricing", "", "", "", 5, 50, 250],
			["google", day, "/old-page", "", "", "", 1, 10, 80],
			["google", day, "", "emdash analytics", "", "", 6, 60, 120],
			["google", day, "", "cookieless", "", "", 4, 80, 400],
			["bing", day, "", "cookieless", "", "", 2, 40, 200],
			["google", day, "", "", "DE", "", 30, 300, 900],
			["google", day, "", "", "US", "", 10, 200, 600],
			["google", day, "", "", "", "DESKTOP", 25, 300, 600],
			["google", day, "", "", "", "MOBILE", 15, 200, 900],
			["google", day, "/pricing", "cookieless", "", "", 3, 50, 250],
			["google", day, "/", "emdash analytics", "", "", 5, 50, 100],
		);
	}
	rows.push(["google", "2026-03-09", "", "", "", "", 20, 250, 1000]);
	const stmt = env.raw.prepare(
		"INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
	);
	for (const r of rows) stmt.run(site, ...r);
}
