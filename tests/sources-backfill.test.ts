/** Search backfill per site: start, validation, progress, crash resume, cancel. */
import { beforeEach, describe, expect, it } from "vitest";
import { backfillStatus, cancelBackfill, startBackfill } from "../src/sources/backfill.js";
import { clearTokenCache } from "../src/sources/gsc-auth.js";
import { backfillKey, type BackfillState, runSearchTick, stateKey, type SyncCtx } from "../src/sources/sync.js";
import { fakeGoogle, googleSettings } from "./gsc.helpers.js";
import { MemoryKv, schemaDb } from "./helpers.js";

const T0 = 1_773_360_000_000; // 2026-03-13T00:00:00Z
const TODAY = "2026-03-13";

describe("search backfill", () => {
	beforeEach(() => clearTokenCache());

	it("validates the range", async () => {
		const kv = new MemoryKv();
		await expect(startBackfill(kv, "default", "google", "2026-02-10", "2026-02-01", TODAY)).rejects.toMatchObject({ code: "invalid_range" });
		await expect(startBackfill(kv, "default", "google", "2026-03-01", TODAY, TODAY)).rejects.toMatchObject({ code: "invalid_range" });
		await expect(startBackfill(kv, "default", "google", "2024-01-01", "2024-02-01", TODAY)).rejects.toMatchObject({ code: "invalid_range" });
		expect(await startBackfill(kv, "default", "google", "2026-02-01", "2026-02-10", TODAY)).toMatchObject({ days: 10, completed: 0, done: false, cursor: "2026-02-01" });
		expect(await cancelBackfill(kv, "default", "google")).toEqual({ canceled: true });
		expect(await backfillStatus(kv, "default", "google")).toBeNull();
	});

	it("advances per site inside the tick budget, resumes from its cursor after a crash, and reports progress", async () => {
		const env = await schemaDb();
		const g = fakeGoogle();
		let crash = false;
		let now = T0;
		const ctx: SyncCtx = {
			http: {
				fetch: async (url, init) => {
					if (crash && url.includes("searchAnalytics") && String(init?.body).includes('"device"')) throw new Error("isolate killed");
					return g.http.fetch(url, init);
				},
			},
			kv: env.kv,
			db: env.db,
			settings: googleSettings({ syncSubrequestBudget: 20 }),
			clients: [],
			cron: { schedule: async () => undefined },
			now: () => now,
		};
		// The sync window is done, so the whole budget goes to the backfill.
		await env.kv.set(stateKey("default", "google"), { lastRun: new Date(T0).toISOString() });
		await startBackfill(env.kv, "default", "google", "2026-01-01", "2026-01-20", TODAY);
		// A budget of 20 fits one window of 8 days.
		const first = await runSearchTick(ctx);
		expect(first.used).toBeLessThanOrEqual(20);
		expect(await backfillStatus(env.kv, "default", "google")).toMatchObject({ cursor: "2026-01-09", completed: 8, days: 20, done: false, window: 16 });
		expect(env.raw.prepare("SELECT COUNT(DISTINCT day) AS n, MIN(day) AS a, MAX(day) AS b FROM ca_search_daily").get()).toEqual({ n: 8, a: "2026-01-01", b: "2026-01-08" });

		// A crash in the middle of a window: nothing of it is stored and the cursor stays.
		crash = true;
		now += 60_000;
		await runSearchTick(ctx);
		const b = await env.kv.get<BackfillState>(backfillKey("default", "google"));
		expect(b).toMatchObject({ cursor: "2026-01-09", done: false, error: expect.stringMatching(/^The pull failed \(Error: isolate killed\)/) });
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_search_daily WHERE day >= '2026-01-09'").get()).toEqual({ n: 0 });

		crash = false;
		now += 60_000;
		await runSearchTick(ctx);
		expect(await backfillStatus(env.kv, "default", "google")).toMatchObject({ completed: 20, done: true, error: null });
		expect(env.raw.prepare("SELECT COUNT(DISTINCT day) AS n, MAX(provisional) AS p FROM ca_search_daily").get()).toEqual({ n: 20, p: 0 });
		// Another site's backfill record is separate.
		expect(await backfillStatus(env.kv, "blog", "google")).toBeNull();
	});
	it("treats the platform request limit as an exhausted tick, not as an error", async () => {
		const env = await schemaDb();
		const g = fakeGoogle();
		let searches = 0;
		const ctx: SyncCtx = {
			http: {
				fetch: async (url, init) => {
					if (url.includes("searchAnalytics") && ++searches === 3) throw new Error("Too many subrequests by single Worker invocation.");
					return g.http.fetch(url, init);
				},
			},
			kv: env.kv,
			db: env.db,
			settings: googleSettings(),
			clients: [],
			cron: { schedule: async () => undefined },
			now: () => T0,
		};
		await env.kv.set(stateKey("default", "google"), { lastRun: new Date(T0).toISOString() });
		await startBackfill(env.kv, "default", "google", "2026-01-01", "2026-01-05", TODAY);
		await runSearchTick(ctx);
		const b = await env.kv.get<BackfillState>(backfillKey("default", "google"));
		expect(b?.error ?? null).toBeNull();
		expect(b?.done).toBe(false);
		const st = await env.kv.get<{ status?: string; lastError?: string | null }>(stateKey("default", "google"));
		expect(st?.lastError ?? null).toBeNull();
	});
});
