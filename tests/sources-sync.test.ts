/** Search sync tick: walk over (site, source) pairs, shared budget, cursor, per-pair errors, throttle. */
import { beforeEach, describe, expect, it } from "vitest";
import type { ClientSite } from "../src/multisite/registry.js";
import { clearTokenCache } from "../src/sources/gsc-auth.js";
import { KV_SEARCH_CURSOR, KV_SEARCH_LOCK, mappedPairs, type PairState, runSearchTick, stateKey, type SyncCtx } from "../src/sources/sync.js";
import { fakeGoogle, googleSettings } from "./gsc.helpers.js";
import { schemaDb } from "./helpers.js";

const T0 = 1_773_360_000_000; // 2026-03-13T00:00:00Z
const HOUR = 3_600_000;
const client = (id: string, host: string, gscProperty: string): ClientSite => ({ id, label: id, key: `${id}${"k".repeat(20)}`.slice(0, 20), hosts: [host], gscProperty, bingSiteUrl: "", paused: false, created: 0 });

async function harness(o: { clients?: ClientSite[]; status?: (p: string) => number | undefined; tick?: () => void; query?: NonNullable<Parameters<typeof fakeGoogle>[0]>["query"]; settings?: Record<string, unknown> } = {}) {
	const env = await schemaDb();
	const g = fakeGoogle(o);
	const scheduled: Array<[string, string]> = [];
	let now = T0;
	const ctx: SyncCtx = {
		http: g.http,
		kv: env.kv,
		db: env.db,
		settings: googleSettings(o.settings),
		clients: o.clients ?? [],
		cron: { schedule: async (name, s) => void scheduled.push([name, s.schedule]) },
		now: () => now,
	};
	return { env, g, ctx, scheduled, setNow: (n: number) => void (now = n), advance: (ms: number) => void (now += ms), days: () => env.raw.prepare("SELECT site, day, MAX(provisional) AS p, COUNT(*) AS n FROM ca_search_daily GROUP BY site, day ORDER BY site, day").all() as Array<{ site: string; day: string; p: number; n: number }> };
}

describe("search sync tick", () => {
	beforeEach(() => clearTokenCache());

	it("stays inside syncSubrequestBudget, saves the cursor, schedules exactly one search-continue, and finishes the window over later ticks", async () => {
		const h = await harness({ settings: { syncSubrequestBudget: 20 } });
		// One day per window to start with: the window doubles after each small answer.
		await h.env.kv.set(stateKey("default", "google"), { window: 1 });
		const r = await runSearchTick(h.ctx);
		expect(r).toMatchObject({ calls: 6, done: false, continued: true });
		expect(r.used).toBeLessThanOrEqual(20);
		expect(h.g.queries()).toHaveLength(6);
		expect(h.scheduled).toEqual([["search-continue", new Date(T0 + 60_000).toISOString()]]);
		expect(await h.env.kv.get(KV_SEARCH_CURSOR)).toBe("default:google");
		expect(h.days().map((d) => d.day)).toEqual(["2026-03-06"]);
		expect(await h.env.kv.get<PairState>(stateKey("default", "google"))).toMatchObject({ cursorDay: "2026-03-07", window: 2 });

		// A continuation schedules the other name, so the host's delete of the finished one-shot row cannot drop it.
		h.advance(60_000);
		const second = await runSearchTick(h.ctx, { continueAs: "search-continue-next" });
		expect(second.used).toBeLessThanOrEqual(20);
		expect(h.scheduled[1]?.[0]).toBe("search-continue-next");
		// Two days in one call per grain.
		expect(h.g.queries().slice(6).every((q) => q.body.startDate === "2026-03-07" && q.body.endDate === "2026-03-08")).toBe(true);
		let last = second;
		for (let i = 0; i < 5 && !last.done; i++) {
			h.advance(60_000);
			last = await runSearchTick(h.ctx);
			expect(last.used).toBeLessThanOrEqual(20);
		}
		expect(last).toMatchObject({ done: true, continued: false });
		expect(await h.env.kv.get(KV_SEARCH_CURSOR)).toBeNull();
		expect(await h.env.kv.get(KV_SEARCH_LOCK)).toBeNull();
		expect(h.days().map((d) => [d.day, d.p])).toEqual([
			["2026-03-06", 0],
			["2026-03-07", 0],
			["2026-03-08", 0],
			["2026-03-09", 0],
			["2026-03-10", 1],
			["2026-03-11", 1],
			["2026-03-12", 1],
		]);
		const st = await h.env.kv.get<PairState>(stateKey("default", "google"));
		expect(st).toMatchObject({ status: "ok", lastError: null, cursorDay: null });
	});

	it("pulls the 7 day sync window in one call per grain and refuses a second tick while one runs", async () => {
		const h = await harness();
		const r = await runSearchTick(h.ctx);
		expect(r).toMatchObject({ calls: 6, done: true, continued: false });
		expect(h.g.queries().every((q) => q.body.startDate === "2026-03-06" && q.body.endDate === "2026-03-12" && (q.body.dimensions as string[])[0] === "date")).toBe(true);
		expect(h.days()).toHaveLength(7);
		await h.env.kv.set(KV_SEARCH_LOCK, { until: T0 + 30_000 });
		expect(await runSearchTick(h.ctx, { only: { site: "default" } })).toMatchObject({ busy: true, calls: 0 });
		// A lock past its time belongs to a crashed tick and is taken over.
		h.advance(31_000);
		expect((await runSearchTick(h.ctx, { only: { site: "default" } })).busy).toBeUndefined();
	});

	it("throttles each pair to searchSyncHours, then re-pulls and replaces the provisional window", async () => {
		const h = await harness();
		for (let i = 0; i < 3; i++) await runSearchTick(h.ctx);
		const before = h.days();
		const calls = h.g.queries().length;
		h.advance(HOUR);
		expect((await runSearchTick(h.ctx)).calls).toBe(0);
		expect(h.g.queries()).toHaveLength(calls);

		// Six hours later the next day: the window moves, yesterday's provisional days are replaced.
		h.setNow(T0 + 24 * HOUR);
		for (let i = 0; i < 3; i++) await runSearchTick(h.ctx);
		const after = h.days();
		expect(after.map((d) => [d.day, d.p])).toEqual([
			["2026-03-06", 0],
			["2026-03-07", 0],
			["2026-03-08", 0],
			["2026-03-09", 0],
			["2026-03-10", 0],
			["2026-03-11", 1],
			["2026-03-12", 1],
			["2026-03-13", 1],
		]);
		// A re-pulled day keeps exactly one row set.
		expect(after.find((d) => d.day === "2026-03-10")?.n).toBe(before.find((d) => d.day === "2026-03-10")?.n);
	});

	it("stops at a simulated 40 s and schedules one continuation", async () => {
		let h: Awaited<ReturnType<typeof harness>> | undefined;
		h = await harness({ tick: () => h?.advance(15_000) });
		const r = await runSearchTick(h.ctx);
		// Each answer takes 15 s: the token call ends at 15 s, query calls start at 15 and 30 s, the next would start at 45 s.
		expect(r.done).toBe(false);
		expect(r.calls).toBe(2);
		expect(h.g.queries()).toHaveLength(r.calls);
		expect(h.scheduled).toHaveLength(1);
	});

	it("walks three mapped sites: a 403 is recorded on its own pair, the budget stops before the third, the next tick resumes at the cursor", async () => {
		const clients = [client("blog", "blog.example.com", "sc-domain:blog.example.com"), client("shop", "shop.example.org", "https://shop.example.org/"), client("bare", "bare.example.net", "")];
		const h = await harness({ clients, status: (p) => (p === "sc-domain:blog.example.com" ? 403 : undefined), settings: { syncSubrequestBudget: 20 } });
		expect(mappedPairs(h.ctx.settings, clients).map((p) => p.id)).toEqual(["default:google", "blog:google", "shop:google"]);
		// The local site synced recently.
		await h.env.kv.set(stateKey("default", "google"), { lastRun: new Date(T0 - HOUR).toISOString(), status: "ok", lastError: null });
		const r = await runSearchTick(h.ctx);
		expect(r.pairs).toEqual(["default:google", "blog:google", "shop:google"]);
		expect(r).toMatchObject({ done: false, continued: true });
		const blog = await h.env.kv.get<PairState>(stateKey("blog", "google"));
		expect(blog).toMatchObject({ status: "error", lastError: "Search Console answered 403 (PERMISSION_DENIED).", lastRun: new Date(T0).toISOString(), cursorDay: null });
		expect(JSON.stringify(blog)).not.toContain("never-echo");
		expect(h.g.queries().filter((c) => c.property === "https://shop.example.org/")).toHaveLength(0);
		expect(await h.env.kv.get(KV_SEARCH_CURSOR)).toBe("shop:google");
		expect(await h.env.kv.get(stateKey("bare", "google"))).toBeNull();

		// The next tick starts at shop and pulls its window; blog is not retried before its next due time.
		h.advance(60_000);
		const before = h.g.queries().length;
		const next = await runSearchTick(h.ctx);
		expect(next.pairs[0]).toBe("shop:google");
		expect(h.g.queries()[before]?.property).toBe("https://shop.example.org/");
		expect(h.g.queries().slice(before).some((c) => c.property === "sc-domain:blog.example.com")).toBe(false);
		expect(h.days().filter((d) => d.site === "shop")).toHaveLength(7);
	});

	it("a 429 keeps the pair's window for the next tick; a manual run forces one site only and leaves the cursor alone", async () => {
		let limited = true;
		const h = await harness({ clients: [client("shop", "shop.example.org", "https://shop.example.org/")], status: (p) => (limited && p === "sc-domain:example.com" ? 429 : undefined) });
		await runSearchTick(h.ctx);
		const st = await h.env.kv.get<PairState>(stateKey("default", "google"));
		expect(st).toMatchObject({ status: "error", cursorDay: "2026-03-06" });
		expect(st?.lastRun).toBeUndefined();
		limited = false;
		await h.env.kv.set(KV_SEARCH_CURSOR, "shop:google");
		const r = await runSearchTick(h.ctx, { only: { site: "default", source: "google" } });
		expect(r.pairs).toEqual(["default:google"]);
		expect(await h.env.kv.get(KV_SEARCH_CURSOR)).toBe("shop:google");
	});

	it("rows of a client site carry its id and only its own host's pages", async () => {
		const h = await harness({ clients: [client("shop", "shop.example.org", "https://shop.example.org/")], query: (b, p) => ((b.dimensions as string[]).join() === "page" ? { rows: [{ keys: [p === "sc-domain:example.com" ? "https://example.com/a" : "https://shop.example.org/cart/"], clicks: 1, impressions: 10, position: 2 }, { keys: ["https://example.com/b"], clicks: 1, impressions: 10, position: 2 }] } : { rows: [] }) });
		await h.env.kv.set(stateKey("default", "google"), { lastRun: new Date(T0).toISOString() });
		await runSearchTick(h.ctx);
		expect(h.env.raw.prepare("SELECT DISTINCT site, page_key FROM ca_search_daily ORDER BY page_key").all()).toEqual([{ site: "shop", page_key: "/cart" }]);
	});

	it("a retryable error backs off instead of calling the provider on every minute's continuation", async () => {
		const h = await harness({ status: () => 503 });
		await runSearchTick(h.ctx);
		const st = await h.env.kv.get<PairState>(stateKey("default", "google"));
		expect(st).toMatchObject({ status: "error", errorCount: 1, nextAttempt: new Date(T0 + 5 * 60_000).toISOString() });
		const calls = h.g.queries().length;
		h.advance(60_000);
		await runSearchTick(h.ctx);
		expect(h.g.queries()).toHaveLength(calls);
		h.setNow(T0 + 5 * 60_000);
		await runSearchTick(h.ctx);
		expect(await h.env.kv.get<PairState>(stateKey("default", "google"))).toMatchObject({ errorCount: 2, nextAttempt: new Date(T0 + 15 * 60_000).toISOString() });
	});

	it("walking many pairs stays inside the budget and resumes at the cursor", async () => {
		const clients = Array.from({ length: 30 }, (_, i) => client(`s${String(i).padStart(2, "0")}`, `s${i}.example.org`, `https://s${i}.example.org/`));
		const h = await harness({ clients });
		for (const c of [{ id: "default" }, ...clients]) await h.env.kv.set(stateKey(c.id, "google"), { lastRun: new Date(T0).toISOString() });
		const r = await runSearchTick(h.ctx);
		expect(r.used).toBeLessThanOrEqual(40);
		expect(r).toMatchObject({ done: false, continued: true });
		const cursor = await h.env.kv.get<string>(KV_SEARCH_CURSOR);
		h.advance(60_000);
		expect((await runSearchTick(h.ctx)).pairs[0]).toBe(cursor);
	});
});
