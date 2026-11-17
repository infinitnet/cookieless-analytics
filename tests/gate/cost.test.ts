/**
 * Write cost: statements and rows written per page view, on SQLite with the counting `Db` (the rule table of
 * `tests/helpers.ts`, which reproduces the measured production D1 values), for calm and busy traffic; the
 * cost of a closed day, a rewrite and an idle tick; and the background budget of the `small` profile (at most
 * its 40 requests per invocation, statements plus state reads and writes) with key-range reads only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { validateIngest } from "../../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../../src/core/recorder.js";
import { addDays, zonedToEpoch } from "../../src/core/time.js";
import type { Db } from "../../src/db/adapter.js";
import type { Goal } from "../../src/query/filters.js";
import { runRetention } from "../../src/query/retention.js";
import { KV_WATERMARK, rollupDay, runRevenue, runRollup } from "../../src/query/rollup.js";
import { normalizeSettings, PROFILES, type Settings } from "../../src/settings.js";
import { generateTraffic, recordTraffic, type Traffic } from "../capacity.helpers.js";
import { cloneSite, eventRequest, MemoryKv, meteredDb, schemaDb } from "../helpers.js";
import { gateTraffic, gateWrite } from "./gate.helpers.js";

const results: Record<string, unknown> = {};
const perPv = (n: number, pv: number) => Math.round((n / pv) * 100) / 100;

async function measure(traffic: Traffic) {
	const meter = meteredDb(await schemaDb());
	meter.reset();
	const out = await recordTraffic(meter.db, traffic);
	return { out, rows: meter.stats.rowsWritten, statements: meter.stats.statements, read: meter.stats.rowsRead, meter };
}

describe("gate: rows and statements per page view", () => {
	// Calm: 1,500 page views over 8 hours (about 0.05 per second). Busy: 6,000 over 30 minutes (about 3.3 per
	// second): many live visits at once, so more slow-path reads find candidates and more second tabs resolve.
	const calm = generateTraffic({ pageviews: 1500, seed: 7 });
	const busy = generateTraffic({ pageviews: 6000, seed: 8, spanSeconds: 1800 });

	it("calm and busy traffic cost about 3.3 rows and 3.9 statements per page view (docs/limits.md)", async () => {
		for (const [label, t] of [["calm", calm], ["busy", busy]] as const) {
			const m = await measure(t);
			const pv = t.counts.pageviews;
			results[label] = { pageviews: pv, actions: t.actions.length, outcomes: m.out, rowsPerPv: perPv(m.rows, pv), statementsPerPv: perPv(m.statements, pv), rowsReadPerPvLowerBound: perPv(m.read, pv) };
			expect(m.out, label).toEqual({ ok: t.actions.length });
			// docs/limits.md: "about 3.3 rows written and 3.9 statements per page view"; measured 3.30 and 3.86.
			expect(Math.abs(m.rows / pv - 3.3), `${label} rows`).toBeLessThanOrEqual(0.15);
			expect(Math.abs(m.statements / pv - 3.9), `${label} statements`).toBeLessThanOrEqual(0.15);
		}
	}, 180_000);
});

/** Replays: one KV for both passes, so the daily salts and visitor keys are the same. */
describe("gate: replays", () => {
	it("every page view and event sent twice (a retry): the second pass writes 0 rows (docs/limits.md)", async () => {
		const t = generateTraffic({ pageviews: 600, seed: 12 });
		const env = await schemaDb();
		const meter = meteredDb(env);
		const kv = new MemoryKv();
		const settings = normalizeSettings({});
		const send = async (pass: number) => {
			resetCounters();
			for (const a of t.actions.filter((x) => x.body.t !== "en")) {
				const body = validateIngest(a.body.t === "ev" ? { ...a.body, h: `ev${String(a.at)}${String(a.body.u)}`.slice(0, 12).padEnd(12, "0") } : a.body);
				if (!body) throw new Error("invalid body");
				await recordClientEvent({ db: meter.db, kv, settings, now: a.at + pass * 20 }, body, requestInfo(eventRequest(a.body, { "cf-connecting-ip": a.ip }, a.url)));
			}
		};
		await send(0);
		meter.reset();
		await send(1);
		results.replay = { requests: t.actions.filter((x) => x.body.t !== "en").length, rowsWritten: meter.stats.rowsWritten, statements: meter.stats.statements };
		expect(meter.stats.rowsWritten).toBe(0);
	}, 120_000);
});

// ── summaries: closed days, rewrite, idle tick, the small budget ───────────────

const TZ = "America/New_York";
const D0 = "2026-06-01";
const GOALS: Goal[] = [
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Guides", type: "page", match: "prefix", value: "/guides/" },
	{ name: "Buy", type: "event", match: "is", value: "purchase" },
];
/** Noon five days later: D0 to D0 + 2 are closed (a day closes at the local midnight that starts its day + 2). */
const NOW = zonedToEpoch(addDays(D0, 5), 12, TZ);

/** Three days of rich traffic with orders in USD and EUR, recorded for sites `default`, `s2` and `s3`. */
async function threeDays(settings: Settings) {
	const env = await schemaDb();
	const t = gateTraffic({ pageviews: 1200, seed: 11, rich: true, orderEvery: 6, start: zonedToEpoch(D0, 0, TZ), spanSeconds: 3 * 86_400 - 7200 });
	await recordTraffic(env.db, t, settings);
	cloneSite(env.raw, "s2");
	cloneSite(env.raw, "s3");
	env.raw.exec("DELETE FROM ca_sessions WHERE site = 's3' AND pageviews = 1");
	return env;
}

/** Counting KV: state reads and writes count against the same request budget as statements. */
function countingKv(kv: MemoryKv) {
	let n = 0;
	const wrapped = {
		get: <T>(k: string) => (n++, kv.get<T>(k)),
		set: (k: string, v: unknown) => (n++, kv.set(k, v)),
		delete: (k: string) => (n++, kv.delete(k)),
		list: (p?: string) => (n++, kv.list(p)),
		compareAndSet: (k: string, e: string | null, v: unknown) => (n++, kv.compareAndSet(k, e, v)),
	};
	return { kv: wrapped, calls: () => n, reset: () => void (n = 0) };
}

/** Query plans of logged statements: every ca_* table read by a key range that starts with the site. */
function scans(raw: import("better-sqlite3").Database, log: ReadonlyArray<{ sql: string; params: unknown[] }>): string[] {
	const bad = new Set<string>();
	for (const s of log) {
		if (!/^\s*(SELECT|WITH|UPDATE|DELETE)/i.test(s.sql)) continue;
		let plan: Array<{ detail: string }>;
		try {
			plan = raw.prepare(`EXPLAIN QUERY PLAN ${s.sql}`).all(...(s.params as never[])) as Array<{ detail: string }>;
		} catch {
			continue;
		}
		for (const p of plan) {
			// A table scan reads `SCAN <table>` or `SCAN <alias>` of a ca_* table; CTEs, subqueries and json_each are not tables.
			const name = /^SCAN (\w+)$/.exec(p.detail)?.[1];
			if (name && (name.startsWith("ca_") || new RegExp(`\\bca_\\w+\\s+(?:AS\\s+)?${name}\\b`, "i").test(s.sql))) bad.add(`${p.detail}  <=  ${s.sql.slice(0, 160)}`);
		}
	}
	return [...bad];
}

function spy(db: Db) {
	const log: Array<{ sql: string; params: unknown[] }> = [];
	const wrapped: Db = {
		dialect: db.dialect,
		run: (sql, p) => (log.push({ sql, params: [...(p ?? [])] }), db.run(sql, p)),
		all: (sql, p) => (log.push({ sql, params: [...(p ?? [])] }), db.all(sql, p)),
		batch: async (stmts) => {
			for (const s of stmts) log.push({ sql: s.sql, params: [...(s.params ?? [])] });
			return db.batch(stmts);
		},
	};
	return { db: wrapped, log };
}

describe("gate: summaries and background tasks", () => {
	let standard: Awaited<ReturnType<typeof threeDays>>;
	beforeAll(async () => {
		standard = await threeDays(normalizeSettings({ siteTimezone: TZ }));
	}, 120_000);

	it("a closed day costs exactly its summary rows once, a rewrite 0 rows, an idle tick 0 statements", async () => {
		const settings = normalizeSettings({ siteTimezone: TZ });
		const meter = meteredDb(standard);
		const kv = new MemoryKv();
		meter.reset();
		const tick = await runRollup({ db: meter.db, settings, goals: async () => GOALS }, kv, NOW);
		expect(tick.days.slice(0, 3)).toEqual([D0, addDays(D0, 1), addDays(D0, 2)]);
		const stored = (["ca_rollup", "ca_revenue_daily", "ca_cube"] as const).reduce((n, t) => n + (standard.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, 0);
		const perDay = Object.fromEntries(tick.days.map((d) => [d, (["ca_rollup", "ca_revenue_daily", "ca_cube"] as const).reduce((n, t) => n + (standard.raw.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE day = ?`).get(t === "ca_cube" ? Number(d.replaceAll("-", "")) : d) as { n: number } | undefined)?.n! , 0)]));
		const written = meter.stats.rowsWritten;
		const statements = meter.stats.statements;
		meter.reset();
		for (const site of ["default", "s2", "s3"]) for (const d of tick.days) await rollupDay({ db: meter.db, site, settings, goals: GOALS }, d);
		const rewrite = meter.stats.rowsWritten;
		meter.reset();
		const idle = await runRollup({ db: meter.db, settings, goals: async () => GOALS }, kv, NOW);
		results.closedDays = { sites: 3, days: tick.days.length, summaryRowsStored: stored, rowsWritten: written, statements, rowsPerSiteDay: perDay, rewriteRowsWritten: rewrite, idleTick: { statements: meter.stats.statements, rows: meter.stats.rowsWritten, days: idle.days } };
		expect(written).toBe(stored);
		expect(rewrite).toBe(0);
		expect(meter.stats.statements).toBe(0);
		expect(idle.days).toEqual([]);
	}, 120_000);

	it("small profile: every background invocation stays inside 40 requests and reads key ranges only", async () => {
		const settings = normalizeSettings({ siteTimezone: TZ, capacityProfile: "small", rawRetentionDays: 7 });
		const env = await threeDays(settings);
		const meter = meteredDb(env);
		const store = new MemoryKv();
		const k = countingKv(store);
		const s = spy(meter.db);
		const budget = PROFILES.small.requests;
		const ticks: Record<string, number[]> = { rollup: [], retention: [], revenue: [] };
		const step = async (name: string, fn: () => Promise<unknown>) => {
			meter.reset();
			k.reset();
			await fn();
			ticks[name]?.push(meter.stats.statements + k.calls());
		};
		for (let i = 0; i < 30; i++) {
			await step("rollup", () => runRollup({ db: s.db, settings, goals: async () => GOALS }, k.kv, NOW, { requests: budget }));
			if ((await store.get<string>(KV_WATERMARK)) === addDays(D0, 3)) break;
		}
		// Retention ten days later deletes the three detailed days (window 7) in budgeted ticks.
		const later = NOW + 10 * 86_400;
		for (let i = 0; i < 40; i++) {
			let done = false;
			await step("retention", async () => (done = (await runRetention(s.db, k.kv, settings, later, { requests: budget })).done));
			if (done) break;
		}
		// The revenue reconcile on the stored days, with every revenue row changed so every site recomputes.
		env.raw.exec("UPDATE ca_revenue_daily SET revenue = revenue + 1");
		await step("revenue", () => runRevenue({ db: s.db, settings, goals: async () => GOALS }, k.kv, NOW, addDays(D0, -1)));
		const over = Object.fromEntries(Object.entries(ticks).map(([n, xs]) => [n, xs.filter((x) => x > budget)]));
		const scanned = scans(env.raw, s.log);
		results.smallBudget = { budget, requestsPerInvocation: ticks, over, scans: scanned };
		gateWrite("cost.json", `${JSON.stringify(results, null, 1)}\n`);
		process.stdout.write(`[gate cost] ${JSON.stringify(results)}\n`);
		expect(ticks.rollup?.length).toBeGreaterThan(1);
		expect(ticks.retention?.length).toBeGreaterThan(0);
		expect(over).toEqual({ rollup: [], retention: [], revenue: [] });
		expect(scanned).toEqual([]);
	}, 180_000);
});
