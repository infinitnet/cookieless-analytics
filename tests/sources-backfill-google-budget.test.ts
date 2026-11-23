/** A Google backfill whose window grew on small days and then meets big days: the comparison reads never stall it. */
import { beforeEach, describe, expect, it } from "vitest";
import { startBackfill } from "../src/sources/backfill.js";
import { clearTokenCache } from "../src/sources/gsc-auth.js";
import { type BackfillState, backfillKey, runSearchTick, stateKey } from "../src/sources/sync.js";
import { fakeGoogle, googleSettings, platformLimit, SMALL_SITE, syntheticDay } from "./gsc.helpers.js";
import { schemaDb } from "./helpers.js";

const T0 = 1_773_360_000_000; // 2026-03-13
const TODAY = "2026-03-13";
const N = 770;
const long = (k: string) => k.replace("https://example.com/p", "https://example.com/articles/2025/a-realistic-long-slug-of-an-article-p").replace(/^query /, "a realistic long tail search query number ");

describe("Google backfill requests", () => {
	beforeEach(() => clearTokenCache());
	it("finishes a backfill whose window grew on small days and then meets days of about 2,300 rows", async () => {
		const env = await schemaDb();
		const BIG = { page: N, query: N, pageQuery: N };
		const g = fakeGoogle({
			query: (body: any) => {
				const size = String(body.startDate) < "2025-12-19" ? SMALL_SITE : BIG;
				const start = Number(body.startRow ?? 0);
				return { rows: syntheticDay(body.startDate, body.dimensions, size).map((r: any) => ({ ...r, keys: r.keys.map(long) })).slice(start, start + Number(body.rowLimit ?? 1000)) };
			},
		});
		const p = platformLimit(50);
		let now = T0;
		const ctx = { http: p.http(g.http), kv: p.kv(env.kv), db: p.db(env.db), settings: googleSettings(), clients: [], cron: { schedule: async () => undefined }, now: () => now };
		await env.kv.set(stateKey("default", "google"), { lastRun: new Date(T0).toISOString() });
		await startBackfill(env.kv, "default", "google", "2025-11-01", "2026-03-01", TODAY);
		let ticks = 0;
		for (; ticks < 25; ticks++) {
			if ((await env.kv.get<BackfillState>(backfillKey("default", "google")))?.done) break;
			p.reset();
			now += 60_000;
			await runSearchTick(ctx).catch(() => undefined);
		}
		const b = (await env.kv.get<BackfillState>(backfillKey("default", "google"))) as BackfillState;
		expect(b.done).toBe(true);
		expect(ticks).toBeLessThanOrEqual(12);
	});
});
