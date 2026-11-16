/** Cron wiring: schedules, the dispatcher, the hook timeout and lazy schedule creation. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CRON_JOBS, CRON_TIMEOUT_MS, type CronJob, createPlugin, cronDispatcher, ensureCron, HEAVY_JOBS, KV_CRON_OWED, resetCronTurns } from "../src/index.js";
import { MemoryKv } from "./helpers.js";
import { KV_PLATFORM_LIMIT, platformLimitKind } from "../src/routes/in.js";

const log = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

beforeEach(() => resetCronTurns());

/** Minute and hour fields only: `*`, `*\/n`, lists and plain numbers, the forms the schedules use. */
const field = (f: string, max: number) =>
	f.split(",").flatMap((p) => {
		if (p === "*") return Array.from({ length: max }, (_, i) => i);
		const step = /^\*\/(\d+)$/.exec(p);
		if (step) return Array.from({ length: max }, (_, i) => i).filter((i) => i % Number(step[1]) === 0);
		return [Number(p)];
	});
const matches = (cron: string, minuteOfDay: number) => {
	const [m = "", h = ""] = cron.split(" ");
	return field(h, 24).includes(Math.floor(minuteOfDay / 60)) && field(m, 60).includes(minuteOfDay % 60);
};

/**
 * A day of host ticks every `every` minutes, as the host runs them: every task whose next run is due runs in the
 * tick's one invocation, one after another (each taking `taskMs`), then its next run is the next matching minute.
 * Returns the tasks each invocation ran (after the dispatcher's turn rule) and the runs per task.
 */
async function simulateDay(every: number, taskMs = 2_000) {
	vi.useFakeTimers();
	const start = Date.parse("2026-06-10T00:00:00Z");
	vi.setSystemTime(start);
	const kv = new MemoryKv();
	let ran: string[] = [];
	const handlers = Object.fromEntries(
		(["rollup", "retention", "salts", "search", "revenue", "mail", "search-continue", "search-continue-next"] as CronJob[]).map((n) => [
			n,
			async () => {
				ran.push(n);
				vi.setSystemTime(Date.now() + taskMs);
			},
		]),
	) as Record<CronJob, () => Promise<void>>;
	const dispatch = cronDispatcher(handlers);
	const ctx = { log: log(), kv } as never as Parameters<typeof dispatch>[1];
	const next = new Map(Object.entries(CRON_JOBS).map(([n, c]) => [n, Array.from({ length: 1440 }, (_, m) => m).find((m) => matches(c, m)) as number]));
	const invocations: string[][] = [];
	const runs: Record<string, number> = {};
	for (let t = 0; t < 1440; t += every) {
		vi.setSystemTime(start + t * 60_000);
		ran = [];
		const due = [...next].filter(([, m]) => m <= t).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
		for (const [n] of due) {
			await dispatch({ name: n, scheduledAt: "" }, ctx);
			const cron = CRON_JOBS[n as keyof typeof CRON_JOBS];
			next.set(n, Array.from({ length: 1440 }, (_, m) => m).find((m) => m > t && matches(cron, m)) ?? 1440 + t);
		}
		invocations.push(ran);
		for (const n of ran) runs[n] = (runs[n] ?? 0) + 1;
	}
	vi.useRealTimers();
	return { invocations, runs, kv };
}

describe("cron", () => {
	it("declares the five jobs with their schedules", () => {
		expect(CRON_JOBS).toEqual({ rollup: "*/30 * * * *", retention: "17 * * * *", salts: "5 0 * * *", search: "7 */1 * * *", revenue: "25,55 * * * *", mail: "15,35,45 * * * *" });
	});

	it("no two plugin tasks are due in the same minute over 24 hours", () => {
		const due = new Map<number, string[]>();
		for (const [name, cron] of Object.entries(CRON_JOBS)) {
			const [m = "", h = ""] = cron.split(" ");
			for (const hour of field(h, 24)) for (const min of field(m, 60)) due.set(hour * 60 + min, [...(due.get(hour * 60 + min) ?? []), name]);
		}
		expect([...due.values()].filter((names) => names.length > 1)).toEqual([]);
		expect(due.get(25)).toEqual(["revenue"]);
		expect(due.get(23 * 60 + 55)).toEqual(["revenue"]);
		// The mail task at minutes 15, 35 and 45 of every hour, alone.
		for (const h of [0, 7, 23]) for (const m of [15, 35, 45]) expect(due.get(h * 60 + m)).toEqual(["mail"]);
	});

	it("declares the cron hook with a 55 s timeout", () => {
		const p = createPlugin() as unknown as { hooks: { cron: { handler: unknown; timeout: number } } };
		expect(CRON_TIMEOUT_MS).toBe(55_000);
		expect(p.hooks.cron.timeout).toBe(55_000);
		expect(typeof p.hooks.cron.handler).toBe("function");
	});

	it("maps each job name to one handler and ignores and logs unknown names", async () => {
		const names: CronJob[] = ["rollup", "retention", "salts", "search", "revenue", "mail", "search-continue", "search-continue-next"];
		const calls: string[] = [];
		const handlers = Object.fromEntries(names.map((n) => [n, async () => void calls.push(n)])) as Record<CronJob, () => Promise<void>>;
		const dispatch = cronDispatcher(handlers);
		const ctx = { log: log(), kv: new MemoryKv() } as never as Parameters<typeof dispatch>[1];
		// One invocation per job (a minute apart), so the one-heavy-task rule does not apply.
		for (const n of names) {
			resetCronTurns();
			await dispatch({ name: n, scheduledAt: "" }, ctx);
		}
		expect(calls).toEqual(names);
		await dispatch({ name: "nope", scheduledAt: "" }, ctx);
		await dispatch({ name: "toString", scheduledAt: "" }, ctx);
		expect(calls).toEqual(names);
		expect((ctx as unknown as { log: ReturnType<typeof log> }).log.warn).toHaveBeenCalledTimes(2);
	});

	it("a run stopped by the platform's request limit leaves the Free plan flag, written by the next run when the limit also refused it", async () => {
		const { MemoryKv } = await import("./helpers.js");
		const kv = new MemoryKv();
		let refuse = true;
		const ctx = { log: log(), kv: { ...kv, get: kv.get.bind(kv), set: async (k: string, v: unknown) => (refuse ? Promise.reject(new Error("Too many subrequests.")) : kv.set(k, v)) } } as never as Parameters<ReturnType<typeof cronDispatcher>>[1];
		const fail = (message: string) => async () => Promise.reject(new Error(message));
		const ok = async () => {};
		const dispatch = cronDispatcher({ rollup: fail("Too many API requests by single worker invocation."), retention: ok, salts: fail("no such column: x") } as never);
		await expect(dispatch({ name: "rollup", scheduledAt: "" }, ctx)).rejects.toThrow(/Too many API requests/);
		expect(await kv.get(KV_PLATFORM_LIMIT)).toBeNull();
		refuse = false;
		await dispatch({ name: "retention", scheduledAt: "" }, ctx);
		expect(await kv.get(KV_PLATFORM_LIMIT)).toMatchObject({ task: "rollup", kind: "requests" });
		// Any other failure leaves no flag.
		await kv.delete(KV_PLATFORM_LIMIT);
		await expect(dispatch({ name: "salts", scheduledAt: "" }, ctx)).rejects.toThrow();
		expect(await kv.get(KV_PLATFORM_LIMIT)).toBeNull();
		expect(platformLimitKind(new Error("D1 DB is overloaded. Too many requests queued."))).toBe("overload");
		expect(platformLimitKind(new Error("Too many subrequests."))).toBe("requests");
	});

	it("per-minute trigger: every task runs at each of its minutes, never two heavy ones in an invocation", async () => {
		const { invocations, runs, kv } = await simulateDay(1);
		expect(invocations.filter((r) => r.filter((n) => HEAVY_JOBS.has(n)).length > 1)).toEqual([]);
		expect(runs).toEqual({ rollup: 48, retention: 24, salts: 1, search: 24, revenue: 48, mail: 72 });
		expect(await kv.get(KV_CRON_OWED)).toBeNull();
	});

	it("15 minute trigger: one heavy task per invocation, the others take turns and every one keeps running", async () => {
		const { invocations, runs } = await simulateDay(15);
		// At :30 rollup, retention and revenue are due together; at :15 search and mail.
		expect(invocations.filter((r) => r.filter((n) => HEAVY_JOBS.has(n)).length > 1)).toEqual([]);
		expect(invocations.filter((r) => r.length > 0).length).toBe(96);
		for (const n of ["rollup", "retention", "search", "revenue", "mail"]) expect(runs[n], n).toBeGreaterThanOrEqual(12);
		expect(runs.salts).toBe(1);
		process.stdout.write(`[cron] 15 minute trigger, runs per day: ${JSON.stringify(runs)}\n`);
	});

	afterEach(() => vi.useRealTimers());

	it("the plugin's search handlers do nothing without outbound HTTP", async () => {
		const p = createPlugin() as unknown as { hooks: { cron: { handler: (e: unknown, c: unknown) => Promise<void> } } };
		const ctx = { log: log(), kv: new MemoryKv(), storage: {} };
		await expect(p.hooks.cron.handler({ name: "search", scheduledAt: "" }, ctx)).resolves.toBeUndefined();
		resetCronTurns();
		await expect(p.hooks.cron.handler({ name: "search-continue", scheduledAt: "" }, ctx)).resolves.toBeUndefined();
		resetCronTurns();
		await expect(p.hooks.cron.handler({ name: "search-continue-next", scheduledAt: "" }, ctx)).resolves.toBeUndefined();
		expect(ctx.log.warn).not.toHaveBeenCalled();
	});

	it("the mail task sends nothing without an email provider", async () => {
		const p = createPlugin() as unknown as { hooks: { cron: { handler: (e: unknown, c: unknown) => Promise<void> } } };
		const ctx = { log: log(), kv: new MemoryKv(), storage: { dashboards: { query: vi.fn() } } };
		await expect(p.hooks.cron.handler({ name: "mail", scheduledAt: "" }, ctx)).resolves.toBeUndefined();
		expect(ctx.storage.dashboards.query).not.toHaveBeenCalled();
	});

	it("ensureCron schedules missing or changed jobs only", async () => {
		const scheduled: Array<[string, string]> = [];
		const cron = {
			list: async () => [
				{ name: "rollup", schedule: "*/30 * * * *", nextRunAt: "", lastRunAt: null },
				{ name: "salts", schedule: "0 0 * * *", nextRunAt: "", lastRunAt: null },
			],
			schedule: async (name: string, o: { schedule: string }) => void scheduled.push([name, o.schedule]),
			cancel: async () => undefined,
		};
		await ensureCron({ cron });
		expect(scheduled).toEqual([
			["retention", "17 * * * *"],
			["salts", "5 0 * * *"],
			["search", "7 */1 * * *"],
			["revenue", "25,55 * * * *"],
			["mail", "15,35,45 * * * *"],
		]);
		await expect(ensureCron({})).resolves.toBeUndefined();
	});
});
