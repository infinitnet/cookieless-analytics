/**
 * Parity of SQLite and Postgres: the same generated traffic and the same tasks on SQLite, on PGlite through
 * `fromPg` (a fake Hyperdrive binding, in one request scope) and on PGlite through `fromKysely` (a host database on
 * Postgres). Ingest, agent events, summaries, revenue, Search rows, every report in the detailed and the summary
 * mode plus filtered runs, drops, the storage estimate, the budget, the filtered delete, retention and purges must
 * give the same results on all three.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLUGIN_ID } from "../src/contract.js";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { D1Sink } from "../src/core/apply.js";
import { drops } from "../src/core/drops.js";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { optionsKv } from "../src/db/options-kv.js";
import { fromPg, pgScope } from "../src/db/pg.js";
import { ensureSchema, ownDatabase, TABLES } from "../src/db/schema.js";
import { createJob, DeleteSpecSchema, KV_DELETE_JOB, previewDelete, runDeleteJob } from "../src/query/filtered-delete.js";
import { QuerySchema } from "../src/query/filters.js";
import { purgeSearch, purgeSite } from "../src/query/purge.js";
import { clearReportCache, REPORT_NAMES, runReport } from "../src/query/reports/index.js";
import { runRetention } from "../src/query/retention.js";
import { runRevenue, runRollup } from "../src/query/rollup.js";
import { budgetState, estimateStorage } from "../src/query/storage.js";
import { normalizeSettings } from "../src/settings.js";
import { replaceDays } from "../src/sources/store.js";
import { generateTraffic } from "./capacity.helpers.js";
import { eventRequest, MemoryKv, memoryDb } from "./helpers.js";
import { dropPgDriver, hyperdrive, kyselyPg, pglite, resetPg } from "./pg.helpers.js";

const START = zonedToEpoch("2026-06-01", 0, "UTC");
const NOW = zonedToEpoch("2026-06-13", 3, "UTC");
const S = normalizeSettings({});
const OPTIONS_TABLE = "CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT)";

type Kv = ReturnType<typeof optionsKv>;
type Result = Record<string, unknown> & { fails: string[]; reports: Record<string, unknown> };

/** Numbers rounded to 6 places, bigints as numbers: the engines differ only in float noise and integer types. */
const norm = (v: unknown): unknown =>
	JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === "bigint" ? Number(x) : typeof x === "number" ? Math.round(x * 1e6) / 1e6 : x)));
const one = async (db: Db, sql: string) => Number((await db.all<{ n: unknown }>(sql))[0]?.n ?? 0);

const REPORT_PARAMS: Record<string, object> = {
	event_props: { event: "signup", prop: "plan" },
	funnels: { steps: [{ type: "page", value: "/" }, { type: "event", value: "signup" }] },
	dimension_values: { dim: "country" },
	search_page_queries: { page: "/blog/a" },
	impact: { report: "overview", at: "2026-06-06", window: 7, scope: "none" },
	revenue_breakdown: { dim: "channel" },
	journey_next: { path: "/" },
	journey_prev: { path: "/" },
	search_cannibalization_page: { page: "/blog/a" },
	search_cannibalization_query: { query: "garden tips" },
};
const NO_COMPARE = new Set(["search_position_moves", "search_movers", "search_decay", "traffic_movers", "traffic_decay", "impact", "revenue_orders", "annotation_impacts"]);

async function scenario(db: Db, kv: Kv): Promise<Result> {
	const res: Result = { fails: [], reports: {} };
	const step = async (name: string, f: () => Promise<unknown>) => {
		try {
			res[name] = norm(await f());
		} catch (e) {
			res.fails.push(`${name}: ${String((e as Error).message).slice(0, 300)}`);
		}
	};
	await ensureSchema(ownDatabase(db), new MemoryKv());
	await step("ingest", async () => {
		resetCounters();
		const out: Record<string, number> = {};
		const sink = new D1Sink(db);
		const traffic = generateTraffic({ pageviews: 600, seed: 21, rich: true, start: START, spanSeconds: 10 * 86_400 - 1 });
		for (const a of traffic.actions) {
			const body = validateIngest(a.body);
			if (!body) throw new Error("invalid generated body");
			const o = await recordClientEvent({ db, kv, settings: S, now: a.at, sink }, body, requestInfo(eventRequest(a.body, { "cf-connecting-ip": a.ip }, a.url)));
			out[o] = (out[o] ?? 0) + 1;
		}
		return out;
	});
	await step("agent events", () =>
		recordAgentEvents({ db, kv, settings: S, now: START + 5 * 86_400 }, "default", [
			{ name: "purchase", val: 49.9, cur: "EUR", oid: "o-1", ts: START + 4 * 86_400 },
			{ name: "purchase", val: 20, cur: "USD", oid: "o-2", ts: START + 4 * 86_400 + 60, p: { plan: "pro" } },
			{ name: "purchase", refund: 5, cur: "USD", oid: "o-2", rid: "r-1", ts: START + 4 * 86_400 + 600 },
			{ name: "purchase", oid: "o-1", void: true },
		] as never),
	);
	await step("counts", async () => {
		const o: Record<string, number> = {};
		for (const t of TABLES) o[t] = await one(db, `SELECT COUNT(*) AS n FROM ${t}`);
		for (const c of ["pageviews", "events", "engaged_ms"]) o[c] = await one(db, `SELECT SUM(${c}) AS n FROM ca_sessions`);
		return o;
	});
	const rc = { db, settings: S, goals: async () => [] };
	await step("rollup", async () => {
		let t = await runRollup(rc, kv, NOW);
		for (let i = 0; i < 80 && !t.done; i++) t = await runRollup(rc, kv, NOW);
		return t.done;
	});
	await step("revenue", async () => {
		let t = await runRevenue(rc, kv, NOW, "2026-05-01");
		for (let i = 0; i < 20 && !(t as { done?: boolean }).done; i++) t = await runRevenue(rc, kv, NOW, "2026-05-01");
		return t;
	});
	await step("summaries", async () => ({
		rollup: await one(db, "SELECT COUNT(*) AS n FROM ca_rollup"),
		cube: await one(db, "SELECT COUNT(*) AS n FROM ca_cube"),
		revenue: await one(db, "SELECT COUNT(*) AS n FROM ca_revenue_daily"),
		sessions: await one(db, "SELECT SUM(sessions) AS n FROM ca_rollup WHERE dim = 'all' AND seg = ''"),
	}));
	await step("search", async () => {
		const days = new Map<string, Array<Record<string, string | number>>>();
		for (let d = 1; d <= 10; d++)
			days.set(`2026-06-${String(d).padStart(2, "0")}`, [
				{ page_key: "/blog/a", query: "garden tips", country: "de", device: "MOBILE", clicks: 3 + d, impressions: 100, pos_sum: 420.5 },
				{ page_key: "/blog/b", query: "Grüße \"quoted\" 'x'", country: "us", device: "DESKTOP", clicks: 1, impressions: 80, pos_sum: 600 },
				{ page_key: "", query: "", country: "", device: "", clicks: 9, impressions: 300, pos_sum: 1500 },
			]);
		return [await replaceDays(db, "default", "google", days as never, () => false), await replaceDays(db, "default", "google", days as never, () => true)];
	});
	const report = { db, site: "default", settings: S, now: NOW, goals: [], funnels: {}, annotations: [], defaultCurrency: "USD", collections: [], siteSearchParams: ["q"] };
	const runOne = async (key: string, ctx: object, q: object) => {
		clearReportCache();
		try {
			res.reports[key] = norm((await runReport(ctx as never, q as never)).data);
		} catch (e) {
			res.reports[key] = `ERR ${String((e as Error).message).slice(0, 300)}`;
		}
	};
	for (const mode of ["raw", "summary"] as const)
		for (const r of REPORT_NAMES) {
			const compare = r.startsWith("search_cannibalization") || NO_COMPARE.has(r) ? {} : { compare: "previous" };
			const q = { report: r, query: QuerySchema.parse({ from: "2026-06-01", to: "2026-06-10", ...compare }), limit: 50, ...(REPORT_PARAMS[r] ? { params: REPORT_PARAMS[r] } : {}) };
			await runOne(`${mode}:${r}`, mode === "raw" ? report : { ...report, rawFrom: "2030-01-01" }, q);
		}
	const filters = [
		[{ dim: "country", op: "is", values: ["DE"] }],
		[{ dim: "page", op: "contains", values: ["blog"] }],
		[{ dim: "browser", op: "is_not", values: ["Chrome"] }],
		[{ dim: "page", op: "regex", values: ["^/blog/.*"] }],
	];
	for (const [i, f] of filters.entries()) await runOne(`filter${i}`, report, { report: "pages", query: QuerySchema.parse({ from: "2026-06-01", to: "2026-06-10", filters: f }), limit: 20 });
	await step("drops", async () => {
		drops.clear();
		drops.add("default", "2026-06-12", "invalid", 2);
		await drops.flush(db);
		return one(db, "SELECT SUM(n) AS n FROM ca_drops");
	});
	await step("storage", () => estimateStorage(db, S, "2026-06-13"));
	// The D1 Free plan's daily rows: a budget on SQLite, none on Postgres (both sides answer true).
	await step("budget", async () => {
		const b = await budgetState(db, new MemoryKv(), START + 86_400 * 3 + 7200, "small", "UTC");
		return db.dialect === "postgres" ? b === null : b !== null && b.pageviews > 0;
	});
	await step("delete", async () => {
		const spec = DeleteSpecSchema.parse({ from: "2026-06-02", to: "2026-06-03", filters: [{ dim: "country", op: "is_not", values: ["ZZ"] }] });
		const env = { db, kv, settings: S, site: "default", now: NOW };
		const preview = await previewDelete(env as never, spec);
		await kv.set(KV_DELETE_JOB, await createJob(env as never, spec, null, preview as never));
		const run = () => runDeleteJob({ kv, db: async () => db, settings: S, goals: async () => [], now: NOW } as never, 400);
		let j = await run();
		for (let i = 0; i < 30 && j && (j.status === "running" || j.status === "cancelling"); i++) j = await run();
		return { preview, status: j?.status, counts: (j as { counts?: unknown } | null)?.counts };
	});
	await step("retention", async () => {
		const rs = { ...S, rawRetentionDays: 7 };
		let r = await runRetention(db, kv, rs, NOW);
		for (let i = 0; i < 100 && !r.done; i++) r = await runRetention(db, kv, rs, NOW);
		return { done: r.done, left: await one(db, "SELECT COUNT(*) AS n FROM ca_sessions"), min: (await db.all<{ d: unknown }>("SELECT MIN(day) AS d FROM ca_sessions"))[0]?.d };
	});
	await step("purge search", async () => {
		let r = await purgeSearch(db, "default", "google");
		for (let i = 0; i < 20 && !r.done; i++) r = await purgeSearch(db, "default", "google");
		return r.done;
	});
	await step("purge site", async () => {
		let r = await purgeSite(db, kv, "default");
		for (let i = 0; i < 60 && !r.done; i++) r = await purgeSite(db, kv, "default");
		const left: Record<string, number> = {};
		for (const t of TABLES) left[t] = await one(db, `SELECT COUNT(*) AS n FROM ${t}`);
		return { done: r.done, left };
	});
	return res;
}

/** Differences between two runs, one line per differing key. */
function diff(a: Result, b: Result): string[] {
	const out: string[] = [];
	const cmp = (path: string, x: unknown, y: unknown) => {
		const jx = JSON.stringify(x);
		const jy = JSON.stringify(y);
		if (jx !== jy) out.push(`${path}\n  sqlite:   ${String(jx).slice(0, 400)}\n  postgres: ${String(jy).slice(0, 400)}`);
	};
	for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (k !== "reports") cmp(k, a[k], b[k]);
	for (const k of new Set([...Object.keys(a.reports), ...Object.keys(b.reports)])) cmp(`report ${k}`, a.reports[k], b.reports[k]);
	return out;
}

describe("SQLite and Postgres give the same results", () => {
	const PG = pglite();
	let lite: Result;
	beforeAll(async () => {
		await PG.waitReady;
		const m = memoryDb();
		m.raw.exec(OPTIONS_TABLE);
		lite = await scenario(m.db, optionsKv(m.db, PLUGIN_ID));
	}, 120_000);
	afterAll(dropPgDriver);

	it("the baseline itself ran every step and most reports", () => {
		expect(lite.fails).toEqual([]);
		expect((lite.counts as Record<string, number>).pageviews).toBeGreaterThan(500);
		const ok = Object.values(lite.reports).filter((r) => !(typeof r === "string" && r.startsWith("ERR")));
		expect(ok.length).toBeGreaterThan(90);
	});

	it("Postgres through a Hyperdrive binding and fromPg, in one request scope", async () => {
		await resetPg(PG);
		await PG.exec(OPTIONS_TABLE);
		const h = hyperdrive(PG);
		const db = fromPg(h.binding, "CA_PG");
		const pg = await pgScope(() => scenario(db, optionsKv(db, PLUGIN_ID)));
		expect(diff(lite, pg)).toEqual([]);
		expect(h.stats).toMatchObject({ opened: 1, ended: 1 });
		expect(h.stats.statements.length).toBeGreaterThan(1000);
	}, 120_000);

	it("Postgres as the host database through Kysely", async () => {
		await resetPg(PG);
		await PG.exec(OPTIONS_TABLE);
		const { db } = kyselyPg(PG);
		expect(diff(lite, await scenario(db, optionsKv(db, PLUGIN_ID)))).toEqual([]);
	}, 120_000);
});
