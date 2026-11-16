/**
 * Synthetic Links fixture (Links convention, docs/integration.md): invented slugs and amounts, example.com only.
 * Hand sums are in tests/reports-links.test.ts.
 *
 * Sessions (site `default`):
 * - A 2026-03-10 Search/google, DE, desktop, entry /, pageviews / and /reviews
 * - B 2026-03-10 Direct, US, mobile, entry /reviews, pageview /reviews
 * - C 2026-03-11 Search/google, DE, mobile, entry /, pageview /
 * - D 2026-03-11 Direct, FR, desktop, 0 pageviews (a session only a click created)
 * `seen` (impressions):
 * - v1 A /reviews, 10 keys: alpha@offers-table, beta@offers-table, gamma@offers-table, alpha@sidebar, beta@sidebar,
 *   alpha, beta, alpha@offers-table, beta@offers-table, alpha@sidebar
 * - v2 B /reviews, 3 keys: alpha@offers-table, beta@offers-table, gamma
 * - v3 C /, 1 key: beta@sidebar
 * `out` (clicks):
 * - o1 A 03-10 /reviews alpha offers-table;  o2 A 03-10 /reviews beta sidebar;  o3 B 03-10 /reviews alpha offers-table
 * - o4 D 03-11 / alpha (no place);           o5 no session 03-11 /x delta offers-table
 * `conv` (conversions):
 * - c1 A 03-10 alpha offers-table 12.50 EUR; c2 B 03-11 beta sidebar 7.25 EUR; c3 no session 03-11 alpha 4.00 USD
 */
import type Database from "better-sqlite3";
import { putHits } from "../helpers.js";

export const LINKS_RANGE = { from: "2026-03-01", to: "2026-03-12" };
const SID = { A: "laaaaaaaaaaaaaaaaaaa", B: "lbaaaaaaaaaaaaaaaaaa", C: "lcaaaaaaaaaaaaaaaaaa", D: "ldaaaaaaaaaaaaaaaaaa" };

type S = [sid: string, day: string, channel: string, source: string | null, entry: string | null, country: string, device: string, pv: number];
const SESSIONS: S[] = [
	[SID.A, "2026-03-10", "Search", "google", "/", "DE", "desktop", 2],
	[SID.B, "2026-03-10", "Direct", null, "/reviews", "US", "mobile", 1],
	[SID.C, "2026-03-11", "Search", "google", "/", "DE", "mobile", 1],
	[SID.D, "2026-03-11", "Direct", null, null, "FR", "desktop", 0],
];
const PAGEVIEWS: Array<[string, string, string]> = [
	[SID.A, "2026-03-10", "/"],
	[SID.A, "2026-03-10", "/reviews"],
	[SID.B, "2026-03-10", "/reviews"],
	[SID.C, "2026-03-11", "/"],
];
const keys = (...k: string[]) => JSON.stringify(Object.fromEntries(k.map((v, i) => [`s${i}`, v])));
type H = [id: string, sid: string | null, day: string, path: string, name: string, props: string, val: number | null, cur: string | null];
const HITS: H[] = [
	[
		"v1",
		SID.A,
		"2026-03-10",
		"/reviews",
		"seen",
		keys(
			"alpha-offer@offers-table",
			"beta-offer@offers-table",
			"gamma-offer@offers-table",
			"alpha-offer@sidebar",
			"beta-offer@sidebar",
			"alpha-offer",
			"beta-offer",
			"alpha-offer@offers-table",
			"beta-offer@offers-table",
			"alpha-offer@sidebar",
		),
		null,
		null,
	],
	["v2", SID.B, "2026-03-10", "/reviews", "seen", keys("alpha-offer@offers-table", "beta-offer@offers-table", "gamma-offer"), null, null],
	["v3", SID.C, "2026-03-11", "/", "seen", keys("beta-offer@sidebar"), null, null],
	["o1", SID.A, "2026-03-10", "/reviews", "out", '{"slug":"alpha-offer","place":"offers-table"}', null, null],
	["o2", SID.A, "2026-03-10", "/reviews", "out", '{"slug":"beta-offer","place":"sidebar"}', null, null],
	["o3", SID.B, "2026-03-10", "/reviews", "out", '{"slug":"alpha-offer","place":"offers-table"}', null, null],
	["o4", SID.D, "2026-03-11", "/", "out", '{"slug":"alpha-offer"}', null, null],
	["o5", null, "2026-03-11", "/x", "out", '{"slug":"delta-offer","place":"offers-table"}', null, null],
	["c1", SID.A, "2026-03-10", "/reviews", "conv", '{"slug":"alpha-offer","place":"offers-table"}', 12.5, "EUR"],
	["c2", SID.B, "2026-03-11", "/reviews", "conv", '{"slug":"beta-offer","place":"sidebar"}', 7.25, "EUR"],
	["c3", null, "2026-03-11", "/x", "conv", '{"slug":"alpha-offer"}', 4, "USD"],
];

export function seedLinks(raw: Database.Database, site = "default"): void {
	const sess = raw.prepare(
		"INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, channel, source, country, device, host) VALUES (?, ?, ?, ?, 10, 0, 60, 1800, ?, ?, ?, 0, ?, ?, ?, ?, 'example.com')",
	);
	for (const [sid, day, channel, source, entry, country, device, pv] of SESSIONS) sess.run(site, sid, `v${sid[1]}`, day, entry, entry, pv, channel, source, country, device);
	putHits(raw, HITS.map(([id, sid, day, path, name, props, val, cur]) => ({ site, id, sid, ts: 0, day, kind: "ev" as const, path, name, props, val, cur })));
	putHits(raw, PAGEVIEWS.map(([sid, day, path], i) => ({ site, id: `lpv${i}`, sid, ts: 0, day, kind: "pv" as const, path })));
}
