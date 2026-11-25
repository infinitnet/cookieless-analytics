/**
 * Filtered delete: the preview counts what the report engine shows for the same filters, the job deletes exactly
 * that and the reports stop showing it, closed days are stored again so the summary and detailed engines agree,
 * days before the detailed window are summary only, revenue is counted, and the job is budgeted, resumable and
 * cancellable. Fake database (SQLite in memory) only.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { agentRoutes } from "../src/agent/routes.js";
import { createRateLimiter } from "../src/keys/ratelimit.js";
import {
	DELETE_DAY_ROWS,
	DELETE_PAUSE_AT,
	type DeleteJob,
	type DeleteSpec,
	DeleteSpecSchema,
	type JobEnv,
	KV_DELETE_JOB,
	previewDelete,
	runDeleteJob,
} from "../src/query/filtered-delete.js";
import { type Filter, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type ReportName, runReport } from "../src/query/reports/index.js";
import { deletedToday, KV_DELETE_ROWS } from "../src/query/retention.js";
import { KV_WATERMARK, runRollup } from "../src/query/rollup.js";
import { KV_WRITE_BUDGET } from "../src/query/storage.js";
import { type ToolsCtx, toolRoutes } from "../src/routes/tools.js";
import { PROFILES, type Settings } from "../src/settings.js";
import { seed } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";

type Env = Awaited<ReturnType<typeof schemaDb>>;
const NOW = zonedToEpoch("2026-03-13", 12, "UTC");
const f = (dim: Filter["dim"], op: Filter["op"], ...values: string[]): Filter => ({ dim, op, values });
const spec = (s: Partial<DeleteSpec> = {}): DeleteSpec => DeleteSpecSchema.parse({ from: "2026-03-10", to: "2026-03-12", ...s });

describe("filtered delete", () => {
	let env: Env;
	let settings: Settings;
	const rc = (summary: boolean): ReportCtx => ({
		db: env.db,
		site: "default",
		settings,
		now: NOW,
		goals: [],
		funnels: {},
		annotations: [],
		// A detailed window starting after the range makes the summaries answer it.
		...(summary ? { rawFrom: "2026-03-13", summaryThrough: "2026-03-11" } : {}),
	});
	const report = async (name: ReportName, filters: Filter[] = [], summary = false, from = "2026-03-10", to = "2026-03-12") => {
		clearReportCache();
		return (await runReport(rc(summary), { report: name, query: QuerySchema.parse({ from, to, filters }), params: {}, limit: 1000 })).data;
	};
	const sessions = async (filters: Filter[] = [], summary = false, from?: string, to?: string) => Number((await report("overview", filters, summary, from, to)).totals?.sessions ?? 0);
	const denv = () => ({ db: env.db, kv: env.kv, settings, site: "default", now: NOW });
	const jenv = (o: Partial<JobEnv> = {}): JobEnv => ({ kv: env.kv, db: async () => env.db, settings, goals: async () => [], now: NOW, ...o });
	const routes = (now = NOW) =>
		toolRoutes({ db: async () => env.db, settings: async () => settings, agentRules: async () => [], channelRules: async () => [], goals: async () => [], now: () => now });
	const call = (name: keyof ReturnType<typeof routes>, input?: unknown, now = NOW) =>
		routes(now)[name].handler({ input, kv: env.kv, user: { email: "owner@example.com" } } as ToolsCtx) as Promise<Record<string, unknown>>;
	const finish = async (o: Partial<JobEnv> = {}, requests?: number) => {
		for (let k = 0; k < 200; k++) {
			const j = await runDeleteJob(jenv(o), requests);
			if (!j || (j.status !== "running" && j.status !== "canceling") || j.paused) return j;
		}
		throw new Error("job did not finish");
	};
	const start = async (s: DeleteSpec, confirm?: string) => {
		const p = await previewDelete(denv(), s);
		return call("tools/delete-start", { spec: s, confirm: confirm ?? String(p.totals.visits) });
	};

	/** Close every day up to the last closed one (one tick stops at its request budget). */
	const rollupAll = async () => {
		for (let k = 0; k < 100; k++) if ((await runRollup({ db: env.db, settings, goals: async () => [] }, env.kv, NOW)).done) return;
	};

	beforeEach(async () => {
		env = await schemaDb();
		settings = { ...(await seed(env, "UTC")), rawRetentionDays: 90 };
		await rollupAll();
		clearReportCache();
	});

	it("previews, deletes and stops showing exactly what the report engine matches", async () => {
		const cases: Array<Partial<DeleteSpec>> = [
			{ filters: [f("country", "is", "DE")] },
			{ filters: [f("country", "is", "US", "FR"), f("device", "is", "mobile")] },
			{ filters: [f("channel", "is_not", "Direct")] },
			{ filters: [f("browser", "regex", "^chr")] },
			{ filters: [f("entry", "prefix", "/late")] },
		];
		for (const c of cases) {
			env = await schemaDb();
			await seed(env, "UTC");
			await rollupAll();
			const filters = c.filters ?? [];
			const before = await sessions();
			const shown = await sessions(filters);
			const p = await previewDelete(denv(), spec(c));
			expect(p.totals.visits).toBe(shown);
			expect(p.days.reduce((a, d) => a + d.visits, 0)).toBe(shown);
			await start(spec(c));
			const job = (await finish()) as DeleteJob;
			expect(job.status).toBe("done");
			expect(job.deleted.visits).toBe(shown);
			expect(await sessions(filters)).toBe(0);
			expect(await sessions()).toBe(before - shown);
		}
	});

	it("stores closed days again so the summary and detailed engines agree", async () => {
		const s = spec({ filters: [f("country", "is", "DE")] });
		expect(await sessions([], true, "2026-03-10", "2026-03-11")).toBe(await sessions([], false, "2026-03-10", "2026-03-11"));
		const p = await previewDelete(denv(), s);
		// 2026-03-10 and 11 are closed and stored; 12 is open and computed when read.
		expect(p.days.map((d) => [d.day, d.stored])).toEqual([["2026-03-10", true], ["2026-03-11", true], ["2026-03-12", false]]);
		expect(p.recloseDays).toBe(2);
		await start(s);
		const job = (await finish()) as DeleteJob;
		expect(job.deleted.summaryDays).toBe(2);
		// Pages are left out: the summaries hold no scroll median.
		for (const name of ["overview", "countries", "channels", "devices"] as const) {
			const raw = await report(name, [], false, "2026-03-10", "2026-03-11");
			const sum = await report(name, [], true, "2026-03-10", "2026-03-11");
			expect(sum.totals ?? sum.rows).toEqual(raw.totals ?? raw.rows);
		}
		expect(((await report("countries", [], true, "2026-03-10", "2026-03-11")).rows as Array<{ key: string }>).map((r) => r.key)).not.toContain("DE");
	});

	it("matches the shape preset, hours and screen classes on the visit row", async () => {
		const q = (sql: string) => (env.raw.prepare(`SELECT COUNT(*) AS n FROM ca_sessions WHERE site = 'default' AND day BETWEEN '2026-03-10' AND '2026-03-12' AND ${sql}`).get() as { n: number }).n;
		expect((await previewDelete(denv(), spec({ shape: "single_view_idle" }))).totals.visits).toBe(q("pageviews = 1 AND engaged_ms = 0 AND max_scroll = 0"));
		expect((await previewDelete(denv(), spec({ hours: { from: 8, to: 10 } }))).totals.visits).toBe(q("hour BETWEEN 8 AND 10"));
		expect((await previewDelete(denv(), spec({ hours: { from: 22, to: 9 } }))).totals.visits).toBe(q("(hour >= 22 OR hour <= 9)"));
		expect((await previewDelete(denv(), spec({ screen: ["xl"], shape: "single_view_idle" }))).totals.visits).toBe(q("screen = 'xl' AND pageviews = 1 AND engaged_ms = 0 AND max_scroll = 0"));
		const top = (await previewDelete(denv(), spec({ filters: [f("country", "is", "DE")] }))).top;
		expect(top.country).toEqual([{ value: "DE", visits: 12 }]);
	});

	it("counts orders and refunds of the matched visits and removes them with the visits", async () => {
		const s = env.raw.prepare("SELECT day, sid FROM ca_sessions WHERE site = 'default' AND day = '2026-03-11' AND country = 'DE' LIMIT 1").get() as { day: string; sid: string };
		const ins = env.raw.prepare("INSERT INTO ca_events (site, id, day, ts, sday, sid, name, path, val, cur) VALUES ('default', ?, 20260311, ?, ?, ?, 'purchase', '/', ?, 'EUR')");
		ins.run("o1", NOW - 86_400, s.day, s.sid, 50);
		ins.run("o2", NOW - 86_400, s.day, s.sid, -10);
		await rollupAll();
		const revenue = () => env.raw.prepare("SELECT COALESCE(SUM(revenue), 0) AS v FROM ca_revenue_daily WHERE site = 'default' AND day = '2026-03-11' AND dim = 'all' AND seg = ''").get() as { v: number };
		// Stored again by hand: the order came after the day was closed.
		const { rollupDay } = await import("../src/query/rollup.js");
		await rollupDay({ db: env.db, site: "default", settings, goals: [] }, "2026-03-11");
		expect(revenue().v).toBe(50);
		const p = await previewDelete(denv(), spec({ filters: [f("country", "is", "DE")] }));
		expect(p.totals).toMatchObject({ orders: 1, refunds: 1 });
		expect(p.revenue).toEqual([{ cur: "EUR", orders: 1, revenue: 50, refunds: 1, refunded: 10 }]);
		await start(spec({ filters: [f("country", "is", "DE")] }));
		const job = (await finish()) as DeleteJob;
		expect(job.deleted).toMatchObject({ orders: 1, refunds: 1 });
		expect(env.count("ca_events")).toBe(0);
		expect(revenue().v).toBe(0);
	});

	it("orders deleted by a call that stops before its visit DELETE are still counted", async () => {
		const s = env.raw.prepare("SELECT day, sid FROM ca_sessions WHERE site = 'default' AND day = '2026-03-11' AND country = 'DE' LIMIT 1").get() as { day: string; sid: string };
		const ins = env.raw.prepare("INSERT INTO ca_events (site, id, day, ts, sday, sid, name, path, val, cur) VALUES ('default', ?, 20260311, ?, ?, ?, 'purchase', '/', ?, 'EUR')");
		ins.run("o1", NOW - 86_400, s.day, s.sid, 50);
		ins.run("o2", NOW - 86_400, s.day, s.sid, -10);
		const sp = spec({ filters: [f("country", "is", "DE")] });
		const { createJob } = await import("../src/query/filtered-delete.js");
		await env.kv.set(KV_DELETE_JOB, await createJob(denv(), sp, null, await previewDelete(denv(), sp)));
		// The invocation stops at its first visit DELETE, after the orders went.
		let orders = false;
		const db: Db = {
			...env.db,
			dialect: env.db.dialect,
			all: env.db.all.bind(env.db),
			batch: env.db.batch.bind(env.db),
			run: (q, params) => ((orders ||= q.startsWith("DELETE FROM ca_events")) && q.startsWith("DELETE FROM ca_sessions") ? Promise.reject(new Error("Too many API requests by single worker invocation.")) : env.db.run(q, params)),
		};
		await expect(runDeleteJob(jenv({ db: async () => db }))).rejects.toThrow("Too many API requests");
		expect(orders).toBe(true);
		expect(env.count("ca_events")).toBe(0);
		const job = (await finish({ now: NOW + 120 })) as DeleteJob;
		expect(job.status).toBe("done");
		expect(job.deleted).toMatchObject({ orders: 1, refunds: 1 });
	});

	it("days before the detailed window are summary only: counted apart, deleted whole only when chosen", async () => {
		const wide = spec({ from: "2025-03-01", filters: [f("country", "is", "DE")] });
		const p = await previewDelete(denv(), wide);
		expect(p.rawFrom).toBe("2025-12-13");
		expect(p.days.every((d) => d.day >= p.rawFrom)).toBe(true);
		expect(p.old?.days.map((d) => d.day)).toEqual(["2025-03-11", "2025-03-12"]);
		expect(p.estimate.oldRows).toBe(0);
		const old = (t: string, day: string) => (env.raw.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE day = ?`).get(t === "ca_cube" ? Number(day.replaceAll("-", "")) : day) as { n: number }).n;
		expect(old("ca_rollup", "2025-03-11")).toBeGreaterThan(0);
		await start(wide);
		await finish();
		expect(old("ca_rollup", "2025-03-11")).toBeGreaterThan(0);
		const both = spec({ from: "2025-03-01", filters: [f("country", "is", "DE")], oldDays: true });
		const p2 = await previewDelete(denv(), both);
		expect(p2.estimate.oldRows).toBe(p2.old?.summaryRows);
		await start(both);
		const job = (await finish()) as DeleteJob;
		expect(job.deleted.oldDays).toBe(2);
		for (const t of ["ca_rollup", "ca_revenue_daily", "ca_cube"]) for (const day of ["2025-03-11", "2025-03-12"]) expect(old(t, day)).toBe(0);
		expect(old("ca_rollup", "2026-03-10")).toBeGreaterThan(0);
	});

	it("rejects page dims, unsafe patterns and ranges over the limit", async () => {
		expect(DeleteSpecSchema.safeParse({ from: "2026-03-10", to: "2026-03-12", filters: [f("page", "is", "/")] }).success).toBe(false);
		expect(DeleteSpecSchema.safeParse({ from: "2024-01-01", to: "2026-03-12" }).success).toBe(false);
		await expect(previewDelete(denv(), spec({ filters: [f("browser", "regex", "(a+)+$")] }))).rejects.toMatchObject({ code: "invalid_regex" });
	});

	it("start needs the typed count or DELETE, and one job at a time", async () => {
		const s = spec({ filters: [f("country", "is", "DE")] });
		await expect(start(s, "11")).rejects.toMatchObject({ code: "confirm_required" });
		await expect(start(spec({ filters: [f("country", "is", "XX")] }), "DELETE")).rejects.toMatchObject({ code: "nothing_to_delete" });
		await call("tools/delete-start", { spec: s, confirm: "DELETE" });
		const job = (await env.kv.get<DeleteJob>(KV_DELETE_JOB)) as DeleteJob;
		expect(job.by).toBe("owner@example.com");
		await env.kv.set(KV_DELETE_JOB, { ...job, status: "running", paused: null });
		await expect(start(s, "DELETE")).rejects.toMatchObject({ code: "delete_running" });
		const st = await call("tools/delete-status");
		expect((st.job as { pred?: unknown }).pred).toBeUndefined();
	});

	it("runs in bounded calls and resumes after an interrupted call with the same result", async () => {
		const s = spec({ filters: [f("channel", "is", "Direct")] });
		const shown = await sessions(s.filters);
		const p = await previewDelete(denv(), s);
		const { createJob } = await import("../src/query/filtered-delete.js");
		await env.kv.set(KV_DELETE_JOB, await createJob(denv(), s, null, p));
		// The small profile's requests: one day's summary (`dayStatements`) and a chunk, not the whole job.
		const first = (await runDeleteJob(jenv(), 40)) as DeleteJob;
		expect(first.status).toBe("running");
		expect(first.i).toBeLessThan(first.days.length);
		// The next call fails at its first DELETE like a lost connection.
		let deletes = 0;
		const flaky: Db = { ...env.db, dialect: env.db.dialect, all: env.db.all.bind(env.db), batch: env.db.batch.bind(env.db), run: (q, params) => (q.startsWith("DELETE") && ++deletes === 1 ? Promise.reject(new Error("network lost")) : env.db.run(q, params)) };
		await expect(runDeleteJob(jenv({ db: async () => flaky }), 40)).rejects.toThrow("network lost");
		const mid = (await env.kv.get<DeleteJob>(KV_DELETE_JOB)) as DeleteJob;
		expect(mid.status).toBe("running");
		expect(mid.lease).toBeUndefined();
		let calls = 0;
		let j: DeleteJob | null = mid;
		while (j && j.status === "running" && calls < 50) {
			j = await runDeleteJob(jenv(), 40);
			calls++;
		}
		expect(j?.status).toBe("done");
		expect(await sessions(s.filters)).toBe(0);
		expect(await sessions()).toBe(37 - shown);
	});

	it("a call lost between its DELETE statements and its job save still stores the day again", async () => {
		const s = spec({ from: "2026-03-10", to: "2026-03-10", filters: [f("country", "is", "DE")] });
		const p = await previewDelete(denv(), s);
		const { createJob } = await import("../src/query/filtered-delete.js");
		await env.kv.set(KV_DELETE_JOB, await createJob(denv(), s, null, p));
		// The invocation dies at the first job save after its visits are deleted (the platform's request limit).
		let deleted = false;
		const db: Db = { ...env.db, dialect: env.db.dialect, all: env.db.all.bind(env.db), batch: env.db.batch.bind(env.db), run: (q, params) => ((deleted ||= q.startsWith("DELETE FROM ca_sessions")), env.db.run(q, params)) };
		const kv = { ...env.kv, get: env.kv.get.bind(env.kv), delete: env.kv.delete.bind(env.kv), list: env.kv.list.bind(env.kv), compareAndSet: env.kv.compareAndSet.bind(env.kv), set: (k: string, v: unknown) => (deleted && k === KV_DELETE_JOB ? Promise.reject(new Error("Too many API requests by single worker invocation.")) : env.kv.set(k, v)) };
		await expect(runDeleteJob(jenv({ db: async () => db, kv }))).rejects.toThrow("Too many API requests");
		expect(deleted).toBe(true);
		const j = (await finish({ now: NOW + 120 })) as DeleteJob;
		expect(j.status).toBe("done");
		expect(j.deleted.summaryDays).toBe(1);
		expect(await sessions(s.filters, false, "2026-03-10", "2026-03-10")).toBe(0);
		expect(await sessions([], true, "2026-03-10", "2026-03-10")).toBe(await sessions([], false, "2026-03-10", "2026-03-10"));
	});

	it("delete-start leaves room for its preview and the host, delete-run and delete-cancel for the host", async () => {
		settings = { ...settings, capacityProfile: "small" };
		let n = 0;
		const db: Db = { dialect: env.db.dialect, run: (q, p) => (n++, env.db.run(q, p)), all: (q, p) => (n++, env.db.all(q, p)), batch: (st) => ((n += st.length), env.db.batch(st)) };
		const kv = new Proxy(env.kv, { get: (t, k) => (typeof (t as never)[k] === "function" ? (...a: unknown[]) => (n++, (t as unknown as Record<string, (...x: unknown[]) => unknown>)[k as string]?.(...a)) : (t as never)[k]) });
		const r = toolRoutes({ db: async () => db, settings: async () => settings, agentRules: async () => [], channelRules: async () => [], goals: async () => [], now: () => NOW });
		const s = spec({ filters: [f("country", "is_not", "ZZ")] });
		const p = await previewDelete(denv(), s);
		n = 0;
		await r["tools/delete-start"].handler({ input: { spec: s, confirm: "DELETE" }, kv, user: null } as unknown as ToolsCtx);
		const used = n;
		expect(((await env.kv.get<DeleteJob>(KV_DELETE_JOB)) as DeleteJob).status).toBe("running");
		expect(p.totals.visits).toBeGreaterThan(0);
		expect(used).toBeLessThanOrEqual(PROFILES[settings.capacityProfile].requests - 8);
		for (const name of ["tools/delete-run", "tools/delete-cancel"] as const) {
			n = 0;
			await r[name].handler({ input: {}, kv, user: null } as unknown as ToolsCtx);
			expect(n).toBeLessThanOrEqual(PROFILES[settings.capacityProfile].requests - 4);
		}
	});

	it("on small, waits for the next UTC day at the daily rows and while the write guard is high", async () => {
		settings = { ...settings, capacityProfile: "small" };
		const s = spec({ filters: [f("country", "is", "DE")] });
		const p = await previewDelete(denv(), s);
		expect(p.estimate.smallDays).toBe(1);
		expect(p.estimate.today?.limit).toBe(85_000);
		const { createJob } = await import("../src/query/filtered-delete.js");
		await env.kv.set(KV_DELETE_JOB, { ...(await createJob(denv(), s, null, p)), utc: { day: "2026-03-13", rows: DELETE_DAY_ROWS } });
		let j = (await runDeleteJob(jenv())) as DeleteJob;
		expect(j.paused?.reason).toBe("day_rows");
		expect(j.deleted.visits).toBe(0);
		// The guard's estimate is high on the next day.
		const next = NOW + 86_400;
		await env.kv.set(KV_WRITE_BUDGET, { day: "2026-03-14", at: next, visits: 0, pageviews: 0, events: 0, rows: DELETE_PAUSE_AT, limit: 85_000, blocked: false });
		j = (await runDeleteJob(jenv({ now: next }))) as DeleteJob;
		expect(j.paused?.reason).toBe("guard");
		await env.kv.delete(KV_WRITE_BUDGET);
		// The guard's pause holds to the end of that UTC day.
		expect((await runDeleteJob(jenv({ now: next + 3600 })))?.deleted.visits).toBe(0);
		const after = next + 86_400;
		j = (await finish({ now: after })) as DeleteJob;
		expect(j.paused).toBeNull();
		expect(j.status).toBe("done");
		expect(j.utc.day).toBe("2026-03-15");
		// The guard counts the job's rows of the day.
		expect(await env.kv.get(KV_DELETE_ROWS)).toEqual(j.utc);
		expect(await deletedToday(env.kv, after)).toBe(j.utc.rows);
	});

	it("cancel stops deleting, stores the touched days again and is logged", async () => {
		const s = spec({ filters: [f("country", "is", "DE", "US")] });
		const p = await previewDelete(denv(), s);
		const { createJob } = await import("../src/query/filtered-delete.js");
		await env.kv.set(KV_DELETE_JOB, await createJob(denv(), s, "owner@example.com", p));
		// One chunk only: the first day.
		let j = (await runDeleteJob(jenv(), 14)) as DeleteJob;
		expect(j.status).toBe("running");
		const gone = j.deleted.visits;
		expect(gone).toBeGreaterThan(0);
		const r = await call("tools/delete-cancel", {});
		j = r.job as DeleteJob;
		if (j.status === "canceling") j = (await finish()) as DeleteJob;
		expect(j.status).toBe("canceled");
		expect(j.deleted.visits).toBe(gone);
		expect(Object.keys(j.reclose)).toEqual([]);
		expect(await sessions([], true, "2026-03-10", "2026-03-11")).toBe(await sessions([], false, "2026-03-10", "2026-03-11"));
		const log = (await call("tools/delete-status")).log as Array<Record<string, unknown>>;
		expect(log[0]).toMatchObject({ status: "canceled", by: "owner@example.com", summary: "2026-03-10 to 2026-03-12: country is DE, US" });
		expect(JSON.stringify(log)).not.toMatch(/sid|vkey/);
	});

	it("keeps the last 10 deletions and is admin only", async () => {
		for (let k = 0; k < 11; k++) {
			await env.kv.delete(KV_DELETE_JOB);
			await start(spec({ filters: [f("country", "is", "DE")] }), "DELETE").catch(() => undefined);
			await finish();
			if (k === 0) expect(await sessions([f("country", "is", "DE")])).toBe(0);
			// Re-seed matches so each start has something to delete.
			env.raw.prepare("UPDATE ca_sessions SET country = 'DE' WHERE sid = (SELECT sid FROM ca_sessions WHERE country = 'FR' LIMIT 1)").run();
		}
		const log = (await call("tools/delete-status")).log as unknown[];
		expect(log.length).toBe(10);
		for (const name of ["tools/delete-preview", "tools/delete-start", "tools/delete-run", "tools/delete-cancel", "tools/delete-status"] as const) expect(routes()[name].permission).toBe("plugins:manage");
		const agent = agentRoutes({ db: async () => env.db, settings: async () => settings, now: () => NOW, version: "0", limiter: createRateLimiter() } as never);
		expect(Object.keys(agent).filter((k) => /tools\/|purge|delete-(preview|start|run|cancel|status)|filtered/.test(k))).toEqual([]);
	});

	it("an idle run reads one key; a run left too few requests by retention does nothing", async () => {
		expect(await runDeleteJob(jenv())).toBeNull();
		const p = await previewDelete(denv(), spec({ filters: [f("country", "is", "DE")] }));
		const { createJob, MIN_REQUESTS } = await import("../src/query/filtered-delete.js");
		await env.kv.set(KV_DELETE_JOB, await createJob(denv(), spec({ filters: [f("country", "is", "DE")] }), null, p));
		expect((await runDeleteJob(jenv(), MIN_REQUESTS - 1))?.deleted.visits).toBe(0);
		expect((await runDeleteJob(jenv(), MIN_REQUESTS - 1))?.lease).toBeUndefined();
		expect(await env.kv.get(KV_WATERMARK)).toBe("2026-03-11");
	});
});
