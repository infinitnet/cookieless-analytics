/** A first Bing backfill of 26 weeks at W rows per week under the default request budget: the comparison with stored rows does not cost the pull its capacity. */
import { describe, expect, it } from "vitest";
import { startBackfill } from "../src/sources/backfill.js";
import { type BackfillState, backfillKey, runSearchTick } from "../src/sources/sync.js";
import { normalizeSettings } from "../src/settings.js";
import { platformLimit } from "./gsc.helpers.js";
import { schemaDb } from "./helpers.js";

const T0 = Date.parse("2026-03-13T00:00:00Z");
const DAY = 86_400_000;
const wcf = (ms: number) => `/Date(${ms})/`;
describe("Bing backfill requests", () => {
	for (const W of [1200, 2400])
		it(`stores a first backfill of 26 weeks at ${W} rows a week in one tick under the default request budget`, async () => {
			const env = await schemaDb();
			const totals = Array.from({ length: 180 }, (_, i) => ({ Date: wcf(T0 - (i + 1) * DAY), Clicks: 5 + i, Impressions: 100 + i, AvgImpressionPosition: 7.5 }));
			const weeks = Array.from({ length: 26 }, (_, w) => T0 - (w * 7 + 2) * DAY);
			const queries = weeks.flatMap((d) => Array.from({ length: W / 2 }, (_, i) => ({ Date: wcf(d), Query: `a realistic long tail search query number ${i}`, Clicks: i % 5, Impressions: 10 + i, AvgImpressionPosition: 3.25 + (i % 40) })));
			const pages = weeks.flatMap((d) => Array.from({ length: W / 2 }, (_, i) => ({ Date: wcf(d), Query: `https://www.example.com/articles/2025/a-realistic-long-slug-of-an-article-${i}/`, Clicks: i % 5, Impressions: 10 + i, AvgImpressionPosition: 3.25 + (i % 40) })));
			const body: Record<string, unknown> = { GetRankAndTrafficStats: totals, GetQueryStats: queries, GetPageStats: pages };
			const http = { fetch: async (url: string) => new Response(JSON.stringify({ d: body[new URL(url).pathname.split("/").pop() as string] }), { status: 200, headers: { "content-type": "application/json" } }) };
			const p = platformLimit(50);
			let now = T0;
			const settings = normalizeSettings({ bingEnabled: true, bingApiKey: "FixtureBingApiKeyPlaceholder0001", bingSiteUrl: "https://www.example.com/", siteOrigin: "https://example.com", siteTimezone: "UTC", capacityProfile: "standard" });
			const ctx = { http: p.http(http), kv: p.kv(env.kv), db: p.db(env.db), settings, clients: [], cron: { schedule: async () => undefined }, now: () => now };
			await startBackfill(env.kv, "default", "bing", "2025-09-20", "2026-03-12", "2026-03-13");
			let ticks = 0;
			const used: number[] = [];
			for (; ticks < 6; ticks++) {
				if ((await env.kv.get<BackfillState>(backfillKey("default", "bing")))?.done) break;
				p.reset();
				const r = await runSearchTick(ctx).catch(() => undefined);
				used.push(r?.used ?? -1);
				now += 60_000;
			}
			const b = (await env.kv.get<BackfillState>(backfillKey("default", "bing"))) as BackfillState;
			const n = env.raw.prepare("SELECT COUNT(*) AS n FROM ca_search_daily").get() as { n: number };
			expect(b.done).toBe(true);
			expect(ticks).toBe(1);
			expect(Math.max(...used)).toBeLessThanOrEqual(40);
			expect(n.n).toBeGreaterThan(24 * W);
		}, 240_000);
});
