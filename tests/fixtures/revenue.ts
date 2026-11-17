/**
 * Synthetic revenue fixture: invented amounts in USD, EUR and
 * JPY over 40 days, hosts of example.com only. Hand sums are in tests/reports-revenue.test.ts.
 *
 * Sessions (all site `default` unless cloned):
 * - S1 2026-03-10 Search/google, entry /, DE, desktop, vkey v1, 2 pageviews
 * - S2 2026-03-10 Direct, entry /pricing, US, mobile, vkey v2, 1 pageview
 * - S3 2026-02-05 Search/google, entry /blog, DE, desktop, vkey v3, 1 pageview
 * - S4 2026-03-11 Social, entry /, vkey v5, 0 pageviews (a session the agent route attached to)
 * - S5 2026-03-11 Direct, entry /, US, desktop, vkey v4, 3 pageviews, no revenue
 * Revenue hits (purchase unless noted):
 * - h1 S1 03-10 /checkout 49.90 USD plan=pro;  h2 S1 03-10 /checkout 10.00 USD plan=basic
 * - h3 S2 03-10 /thanks 120.00 EUR;            h4 S3 02-05 /checkout 1000 JPY
 * - h5 S2 03-11 /thanks 0 USD (a free order);   h6 no session 03-11 /api 30.00 USD
 * - h7 S4 03-11 /x 5.00 USD (session with zero pageviews)
 */
import type Database from "better-sqlite3";
import { putHits } from "../helpers.js";
import type { Goal } from "../../src/query/filters.js";

export const REV_RANGE = { from: "2026-02-01", to: "2026-03-12" };
export const SID = { S1: "s1aaaaaaaaaaaaaaaaaa", S2: "s2aaaaaaaaaaaaaaaaaa", S3: "s3aaaaaaaaaaaaaaaaaa", S4: "s4aaaaaaaaaaaaaaaaaa", S5: "s5aaaaaaaaaaaaaaaaaa" };
export const REV_GOALS: Goal[] = [
	{ name: "Bought", type: "event", match: "is", value: "purchase" },
	{ name: "Pro", type: "event", match: "is", value: "purchase", props: { plan: "pro" } },
	{ name: "Pricing", type: "page", match: "is", value: "/pricing" },
	{ name: "Leave", type: "outbound", match: "is", value: "example.net" },
];

type S = { sid: string; day: string; channel: string; source: string | null; entry: string; country: string | null; device: string | null; vkey: string; pv: number };
const SESSIONS: S[] = [
	{ sid: SID.S1, day: "2026-03-10", channel: "Search", source: "google", entry: "/", country: "DE", device: "desktop", vkey: "v1", pv: 2 },
	{ sid: SID.S2, day: "2026-03-10", channel: "Direct", source: null, entry: "/pricing", country: "US", device: "mobile", vkey: "v2", pv: 1 },
	{ sid: SID.S3, day: "2026-02-05", channel: "Search", source: "google", entry: "/blog", country: "DE", device: "desktop", vkey: "v3", pv: 1 },
	{ sid: SID.S4, day: "2026-03-11", channel: "Social", source: "example.com", entry: "/", country: "FR", device: "desktop", vkey: "v5", pv: 0 },
	{ sid: SID.S5, day: "2026-03-11", channel: "Direct", source: null, entry: "/", country: "US", device: "desktop", vkey: "v4", pv: 3 },
];
type H = [id: string, sid: string | null, day: string, path: string, name: string, val: number | null, cur: string | null, props: string | null];
const HITS: H[] = [
	["h1", SID.S1, "2026-03-10", "/checkout", "purchase", 49.9, "USD", '{"plan":"pro"}'],
	["h2", SID.S1, "2026-03-10", "/checkout", "purchase", 10, "USD", '{"plan":"basic"}'],
	["h3", SID.S2, "2026-03-10", "/thanks", "purchase", 120, "EUR", null],
	["h4", SID.S3, "2026-02-05", "/checkout", "purchase", 1000, "JPY", null],
	["h5", SID.S2, "2026-03-11", "/thanks", "purchase", 0, "USD", null],
	["h6", null, "2026-03-11", "/api", "purchase", 30, "USD", null],
	["h7", SID.S4, "2026-03-11", "/x", "purchase", 5, "USD", null],
	["e1", SID.S5, "2026-03-11", "/", "signup", null, null, null],
];
const PAGEVIEWS: Array<[string, string, string]> = [
	[SID.S1, "2026-03-10", "/"],
	[SID.S1, "2026-03-10", "/checkout"],
	[SID.S2, "2026-03-10", "/pricing"],
	[SID.S3, "2026-02-05", "/blog"],
	[SID.S5, "2026-03-11", "/"],
	[SID.S5, "2026-03-11", "/a"],
	[SID.S5, "2026-03-11", "/b"],
];

/** Insert the fixture for `site`; `onlyCur` strips the value and code of the other currencies' hits (the twin site: same events, other money gone). */
export function seedRevenue(raw: Database.Database, site = "default", onlyCur?: string): void {
	const sess = raw.prepare(
		"INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, channel, source, country, device, host) VALUES (?, ?, ?, ?, 10, 0, 60, 1800, ?, ?, ?, 0, ?, ?, ?, ?, 'example.com')",
	);
	for (const s of SESSIONS) sess.run(site, s.sid, s.vkey, s.day, s.entry, s.entry, s.pv, s.channel, s.source, s.country, s.device);
	putHits(
		raw,
		HITS.map(([id, sid, day, path, name, val, cur, props]) => {
			const keep = !onlyCur || cur === onlyCur;
			return { site, id, sid, ts: 0, day, kind: "ev" as const, path, name, props, val: keep ? val : null, cur: keep ? cur : null };
		}),
	);
	putHits(raw, PAGEVIEWS.map(([sid, day, path], i) => ({ site, id: `pv${i}`, sid, ts: 0, day, kind: "pv" as const, path })));
}
