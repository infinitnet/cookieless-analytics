/** Capacity harness: a seeded synthetic traffic generator and helpers that run statements or traffic through a meter. */
import type Database from "better-sqlite3";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import type { Db } from "../src/db/adapter.js";
import type { Stmt } from "../src/db/sql.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { eventRequest, type Meter, type MeterEntry, MemoryKv } from "./helpers.js";

/** Small seeded PRNG (mulberry32): the same seed gives the same traffic. */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface TrafficOptions {
	/** Page views to generate. */
	pageviews: number;
	seed?: number;
	/** Epoch seconds of the first visit start. */
	start?: number;
	/** Visit starts are spread over this many seconds. */
	spanSeconds?: number;
	/** Ratios per page view (production mix): sessions 0.464, engagement updates 1.5, events 0.231, aliases 0.1. */
	sessionsPerPv?: number;
	engagementPerPv?: number;
	eventsPerPv?: number;
	aliasesPerPv?: number;
	/** Content of a real site: article paths, a query string on some page views, a referrer on entry, two event properties. */
	rich?: boolean;
	/** The events are link impressions (`seen`, passive: stored entries that `events` does not count). */
	impressions?: boolean;
}

/** One request of the page script: an ingest body and the request facts it arrives with. */
export interface TrafficAction {
	/** Epoch seconds. */
	at: number;
	body: Record<string, unknown>;
	/** Client address (IPv6 documentation prefix, one /48 per visitor). */
	ip: string;
	url: string;
}

export interface Traffic {
	actions: TrafficAction[];
	counts: { pageviews: number; sessions: number; engagement: number; events: number; aliases: number };
}

const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";
const SECTIONS = ["blog", "guides", "docs", "news"] as const;
const WORDS = ["garden", "winter", "bicycle", "repair", "recipe", "budget", "travel", "camera", "coffee", "window", "planner", "starter"] as const;
const REFERRERS = ["search.example.net", "social.example.org", "news.example.com", "mail.example.net"] as const;

/**
 * Synthetic traffic with the production mix. Visits get random sids, so insert order into a table keyed by
 * sid is random, as in production. Counts per kind are exact (rounded from the ratios); which visit and page
 * view they land on is random. An alias is a page view from a second tab: a fresh sid of a known visitor.
 */
export function generateTraffic(o: TrafficOptions): Traffic {
	const r = rng(o.seed ?? 1);
	const id = (n: number) => Array.from({ length: n }, () => ALPHA[Math.floor(r() * ALPHA.length)]).join("");
	const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] as T;
	const start = o.start ?? Date.parse("2026-06-10T06:00:00Z") / 1000;
	const span = o.spanSeconds ?? 8 * 3600;
	const N = o.pageviews;
	const V = Math.max(1, Math.round(N * (o.sessionsPerPv ?? 0.464)));
	const A = Math.round(N * (o.aliasesPerPv ?? 0.1));
	const E = Math.round(N * (o.eventsPerPv ?? 0.231));
	const EN = Math.round(N * (o.engagementPerPv ?? 1.5));
	if (V > N || A > N - V || V > 0xffff || EN < N) throw new Error("traffic ratios out of range");

	// Page views per visit: one each, the rest spread at random.
	const perVisit = Array.from({ length: V }, () => 1);
	for (let i = V; i < N; i++) perVisit[Math.floor(r() * V)]! += 1;

	interface Pv { visit: number; sid: string; h: string; at: number; path: string; alias: boolean }
	const visits = perVisit.map((n, v) => ({ sid: id(20), ip: `2001:db8:${v.toString(16)}::1`, n, at: start + Math.floor(r() * span) }));
	const pvs: Pv[] = [];
	for (const [v, visit] of visits.entries()) {
		let at = visit.at;
		for (let k = 0; k < visit.n; k++) {
			const path = o.rich
				? `/${pick(SECTIONS)}/${pick(WORDS)}-${pick(WORDS)}-${pick(WORDS)}-${Math.floor(r() * 500)}/${r() < 0.15 ? `?utm_source=${pick(WORDS)}&utm_medium=email` : ""}`
				: `/p/${Math.floor(r() * 50)}`;
			pvs.push({ visit: v, sid: visit.sid, h: id(12), at, path, alias: false });
			at += 20 + Math.floor(r() * 180);
		}
	}
	// Second-tab page views: any page view but the first of its visit.
	const later = pvs.filter((p, i) => i > 0 && pvs[i - 1]?.visit === p.visit);
	for (let i = 0; i < A; i++) {
		const j = i + Math.floor(r() * (later.length - i));
		[later[i], later[j]] = [later[j] as Pv, later[i] as Pv];
		const p = later[i] as Pv;
		p.alias = true;
		p.sid = id(20);
	}
	const actions: TrafficAction[] = [];
	const push = (at: number, visit: number, body: Record<string, unknown>) => actions.push({ at, body: { v: 1, ...body }, ip: (visits[visit] as { ip: string }).ip, url: "https://example.com/_/e" });
	const entry = new Set(pvs.filter((p, i) => i === 0 || pvs[i - 1]?.visit !== p.visit));
	for (const p of pvs)
		push(p.at, p.visit, { t: "pv", sid: p.sid, h: p.h, u: p.path, w: 1440, ...(p.alias ? { n: 1 } : {}), ...(o.rich && entry.has(p) && r() < 0.6 ? { r: `https://${pick(REFERRERS)}/` } : {}) });
	// Engagement: one update per page view, the rest a second update on a random page view.
	const updates = pvs.map((p) => ({ p, k: 1 }));
	for (let i = N; i < EN; i++) (updates[Math.floor(r() * N)] as { k: number }).k++;
	for (const { p, k } of updates)
		for (let j = 1; j <= k; j++) push(p.at + 5 * j, p.visit, { t: "en", sid: p.sid, h: p.h, d: 4000 * j, e: 5000 * j, s: Math.min(100, 30 * j), i: 1 });
	for (let i = 0; i < E; i++) {
		const p = pick(pvs);
		const sid = (visits[p.visit] as { sid: string }).sid;
		if (o.impressions) push(p.at + 3, p.visit, { t: "ev", sid, name: "seen", u: p.path, p: { s0: `${pick(WORDS)}-offer` } });
		else push(p.at + 3, p.visit, { t: "ev", sid, name: "signup", u: p.path, p: o.rich ? { plan: "pro", placement: `${pick(WORDS)}-banner` } : { plan: "pro" } });
	}
	actions.sort((a, b) => a.at - b.at);
	return { actions, counts: { pageviews: N, sessions: V, engagement: EN, events: E, aliases: A } };
}

/** Run statements one by one through a meter; returns each statement's measured cost. */
export async function runStatements(meter: Meter, stmts: readonly Stmt[]): Promise<MeterEntry[]> {
	const from = meter.log.length;
	for (const s of stmts) await meter.db.run(s.sql, s.params);
	return meter.log.slice(from);
}

/**
 * Drive generated traffic through the recorder (policy checks, then the D1 sink) on `db`. Returns the
 * outcome counts. Request facts come from a real `Request`, as in the `in` route.
 */
export async function recordTraffic(db: Db, traffic: Traffic, settings: Settings = normalizeSettings({})): Promise<Record<string, number>> {
	resetCounters();
	const kv = new MemoryKv();
	const outcomes: Record<string, number> = {};
	for (const a of traffic.actions) {
		const body = validateIngest(a.body);
		if (!body) throw new Error(`invalid generated body: ${JSON.stringify(a.body)}`);
		const info = requestInfo(eventRequest(a.body, { "cf-connecting-ip": a.ip }, a.url));
		const out = await recordClientEvent({ db, kv, settings, now: a.at }, body, info);
		outcomes[out] = (outcomes[out] ?? 0) + 1;
	}
	return outcomes;
}

/** Bytes of the pages a table and its indexes occupy (`dbstat`). */
export function tableBytes(raw: Database.Database, table: string): number {
	return (raw.prepare("SELECT COALESCE(SUM(pgsize), 0) AS n FROM dbstat WHERE name = ? OR name IN (SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?)").get(table, table) as { n: number }).n;
}
