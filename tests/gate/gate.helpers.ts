/**
 * Shared parts of the verification gate: where results go, a fault-injecting `Db`, generator traffic with
 * client event ids and orders, and a canonical dump of the stored rows for comparisons.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { Db } from "../../src/db/adapter.js";
import { generateTraffic, rng, type Traffic, type TrafficOptions } from "../capacity.helpers.js";

/** Gate results are written only when `GATE_OUT` names a directory (the gate run), never by the normal suite. */
export function gateWrite(name: string, text: string): void {
	const dir = process.env.GATE_OUT;
	if (!dir) return;
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), text);
}

export const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** The D1 overload text (one of the three documented ones): the route retries it once, then answers 503. */
export const OVERLOAD = "D1 DB is overloaded. Too many requests queued.";

export interface Faults {
	/** Probability per statement of an overload error raised before the statement runs. */
	overload: number;
	/** Probability per statement that the isolate dies right after the statement ran (committed). */
	kill: number;
	/** Probability per statement of a stall (an awaited pause that lets other isolates run first). */
	stall: number;
}
export const NO_FAULTS: Faults = { overload: 0, kill: 0, stall: 0 };

export interface FaultStats {
	statements: number;
	overloads: number;
	kills: number;
	stalls: number;
}

/** State of one simulated isolate as the faulty `Db` sees it: once dead, every call fails. */
export interface Life {
	dead: boolean;
}

/**
 * A `Db` that injects faults: overload errors before a statement, stalls (pauses of up to 3 ms of real time,
 * which reorder the interleaved isolates), and a kill after a statement committed. After a kill the isolate
 * is gone: every later call throws, and the harness discards whatever the isolate still held in memory.
 */
export function faultDb(base: Db, f: Faults, r: () => number, life: Life, stats: FaultStats): Db {
	const step = async () => {
		if (life.dead) throw new Error("isolate gone");
		if (r() < f.stall) {
			stats.stalls++;
			await new Promise((res) => setTimeout(res, Math.floor(r() * 3)));
			if (life.dead) throw new Error("isolate gone");
		}
		if (r() < f.overload) {
			stats.overloads++;
			throw new Error(OVERLOAD);
		}
	};
	const after = () => {
		stats.statements++;
		if (r() < f.kill) {
			stats.kills++;
			life.dead = true;
			throw new Error("isolate killed");
		}
	};
	return {
		dialect: base.dialect,
		async run(sql, params) {
			await step();
			const out = await base.run(sql, params);
			after();
			return out;
		},
		async all(sql, params) {
			await step();
			const out = await base.all(sql, params);
			after();
			return out as never;
		},
		async batch(stmts) {
			// A batch is one transaction on D1: all of it or nothing, then the kill.
			await step();
			await base.batch(stmts);
			after();
		},
	};
}

/**
 * Generator traffic (production mix) plus client event ids (as the page script sends them) and an order on every
 * `orderEvery`th first page view of a visit, half of them with an order id, in USD and EUR.
 */
export function gateTraffic(o: TrafficOptions & { orderEvery?: number }): Traffic {
	const t = generateTraffic(o);
	const r = rng((o.seed ?? 1) + 7);
	let n = 0;
	let k = 0;
	const extra: Traffic["actions"] = [];
	for (const a of t.actions) {
		if (a.body.t === "ev") a.body.h = `v${String(((o.seed ?? 1) * 100_000 + n++) % 1e11).padStart(11, "0")}`;
		if (o.orderEvery && a.body.t === "pv" && !a.body.n && k++ % o.orderEvery === 0) {
			const val = Math.round(r() * 9000) / 100 + 1;
			extra.push({ ...a, at: a.at + 4, body: { v: 1, t: "ev", sid: a.body.sid, h: `o${String(((o.seed ?? 1) * 100_000 + k) % 1e11).padStart(11, "0")}`, name: "purchase", u: a.body.u, val, cur: k % 3 ? "USD" : "EUR", ...(k % 2 ? { oid: `A-${String(o.seed ?? 1)}-${String(k).padStart(8, "0")}` } : {}) } });
		}
	}
	t.actions.push(...extra);
	t.actions.sort((a, b) => a.at - b.at);
	t.counts.events += extra.length;
	return t;
}

export interface Entry {
	visit: string;
	kind: "pv" | "ev";
	path: string | null;
	name: string | null;
	props: string | null;
	d: number | null;
	e: number | null;
	s: number | null;
	x: number | null;
}

/** Every stored row of the analytics tables, in key order, and the document entries by key. */
export function dumpTables(raw: Database.Database) {
	const all = (sql: string) => raw.prepare(sql).all() as Record<string, unknown>[];
	const visits = all("SELECT *, json(hits) AS hits FROM ca_sessions ORDER BY site, day, sid").map((r) => ({ ...r, hits: JSON.parse(String(r.hits)) as Record<string, Record<string, unknown>> }));
	const entries = new Map<string, Entry>();
	const dup: string[] = [];
	for (const v of visits)
		for (const [key, e] of Object.entries(v.hits)) {
			if (e.t === undefined) continue; // an engagement update whose page view never arrived
			const id = `${String(v.site)}|${key}`;
			if (entries.has(id)) dup.push(id);
			const num = (f: string) => (e[f] === undefined ? null : Number(e[f]));
			entries.set(id, { visit: `${String(v.site)}|${String(v.day)}|${String(v.sid)}`, kind: e.n === undefined ? "pv" : "ev", path: (e.p as string) ?? null, name: (e.n as string) ?? null, props: e.pr === undefined ? null : JSON.stringify(e.pr), d: num("d"), e: num("e"), s: num("s"), x: num("x") });
		}
	return {
		visits,
		entries,
		dup,
		events: all("SELECT site, id, day, sday, name, path, props, val, cur FROM ca_events ORDER BY site, id"),
		aliases: all("SELECT site, sid, canon FROM ca_aliases ORDER BY site, sid"),
		srv: all("SELECT site, day, status, path, ref, n FROM ca_srv ORDER BY site, day, status, path, ref"),
		drops: Object.fromEntries((raw.prepare("SELECT reason, SUM(n) AS n FROM ca_drops GROUP BY reason").all() as Array<{ reason: string; n: number }>).map((x) => [x.reason, x.n])) as Record<string, number>,
	};
}
export type Dump = ReturnType<typeof dumpTables>;

/** A `Db` over an SQLite file (large gate data sets stay out of the heap), with the D1 parameter limit checked. */
export async function fileDb(path: string) {
	const { default: Sqlite } = await import("better-sqlite3");
	const { Kysely, SqliteDialect } = await import("kysely");
	const { fromKysely } = await import("../../src/db/adapter.js");
	const { assertParams } = await import("../../src/db/sql.js");
	const raw = new Sqlite(path);
	raw.pragma("journal_mode = OFF");
	raw.pragma("synchronous = OFF");
	const inner = fromKysely(new Kysely<any>({ dialect: new SqliteDialect({ database: raw }) }));
	const db: Db = {
		dialect: inner.dialect,
		run: (sql, p) => (assertParams(sql, p), inner.run(sql, p)),
		all: (sql, p) => (assertParams(sql, p), inner.all(sql, p)),
		batch: (stmts) => (stmts.forEach((s) => assertParams(s.sql, s.params)), inner.batch(stmts)),
	};
	return { db, raw };
}

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const COUNTRIES = ["DE", "US", "FR", "GB", "NL", ""] as const;
const SLUGS = ["offer-a", "offer-b", "offer-c", "offer-d", "offer-e", "offer-f"] as const;

export interface DayPlan {
	site: string;
	day: string;
	pageviews: number;
	seed: number;
	tz: string;
	/** Share of visits on a linked host of the site (`hs` on their entries). */
	linkedHost?: { host: string; share: number };
}

/**
 * One site-day of realistic synthetic traffic: the rich generator (article paths folded to about 2,000 pages, a
 * referrer on most entries, campaign links), orders in USD and EUR, link impressions, clicks and conversions,
 * countries and two devices per visitor address. Starts at 06:00 local time, spread over 15 hours.
 */
export function dayTraffic(p: DayPlan, zonedToEpoch: (day: string, hour: number, tz: string) => number): Traffic {
	const t = gateTraffic({ pageviews: p.pageviews, seed: p.seed, rich: true, orderEvery: 25, start: zonedToEpoch(p.day, 6, p.tz), spanSeconds: 15 * 3600 });
	let k = 0;
	const extra: Traffic["actions"] = [];
	for (const a of t.actions) {
		if (typeof a.body.u === "string") a.body.u = a.body.u.replace(/^\/(\w+)\/(\w+)-\w+-\w+-(\d+)\//, (_m, s: string, w: string, n: string) => `/${s}/${w}-${Number(n) % 40}/`);
		if (a.body.t !== "pv" || a.body.n || k++ % 5) continue;
		const slug = SLUGS[k % SLUGS.length] as string;
		const place = k % 2 ? { place: k % 4 === 1 ? "hero" : "footer" } : {};
		extra.push({ ...a, at: a.at + 1, body: { v: 1, t: "ev", sid: a.body.sid, h: `se${String((p.seed * 100_000 + k) % 1e10).padStart(10, "0")}`, name: "seen", u: a.body.u, p: { s0: `${slug}@hero`, s1: SLUGS[(k + 1) % SLUGS.length] as string } } });
		if (k % 3 === 0) extra.push({ ...a, at: a.at + 2, body: { v: 1, t: "ev", sid: a.body.sid, h: `ou${String((p.seed * 100_000 + k) % 1e10).padStart(10, "0")}`, name: "out", u: a.body.u, p: { slug, ...place } } });
		if (k % 15 === 0) extra.push({ ...a, at: a.at + 3, body: { v: 1, t: "ev", sid: a.body.sid, h: `co${String((p.seed * 100_000 + k) % 1e10).padStart(10, "0")}`, name: "conv", u: a.body.u, p: { slug, ...place }, val: 5 + (k % 7), cur: k % 2 ? "USD" : "EUR" } });
	}
	t.actions.push(...extra);
	t.actions.sort((a, b) => a.at - b.at);
	return t;
}

/** Request facts of a visitor address: a country and a device that stay with it. */
export function visitorHeaders(ip: string): Record<string, string> {
	let h = 0;
	for (const c of ip) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	const country = COUNTRIES[h % COUNTRIES.length] as string;
	return { "cf-connecting-ip": ip, "user-agent": h % 3 === 0 ? MOBILE_UA : DESKTOP_UA, ...(country ? { "cf-ipcountry": country } : {}) };
}
