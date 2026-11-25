import { PluginRouteError } from "emdash";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPlugin } from "../src/index.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { type DataCtx, DataQueryBody, type DataQueryInput, dataQueryRoute } from "../src/routes/data.js";
import type { Settings } from "../src/settings.js";
import { RANGE, seed, seedSearch } from "./fixtures/seed.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { cloneSite, schemaDb, sitesColl } from "./helpers.js";

/** Storage collection stub with `query` (equality on `site`, recorded `where`) and `get`. */
function coll(items: Record<string, unknown>) {
	const wheres: unknown[] = [];
	return {
		wheres,
		async query(o?: { where?: Record<string, unknown> }) {
			wheres.push(o?.where);
			const site = o?.where?.site;
			return { items: Object.entries(items).filter(([, d]) => site === undefined || (d as { site?: string }).site === site).map(([id, data]) => ({ id, data })), hasMore: false };
		},
		async get(id: string) {
			return items[id] ?? null;
		},
	};
}

describe("data/query route", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	const storage = {
		goals: coll({
			g1: { site: "default", name: "Signup", type: "event", match: "is", value: "signup" },
			g2: { site: "other", name: "Foreign", type: "page", match: "is", value: "/" },
			g3: { site: "default", name: "Broken", type: "nope" },
		}),
		funnels: coll({
			f1: { site: "default", name: "Flow", steps: [{ type: "page", match: "is", value: "/" }, { type: "page", match: "is", value: "/pricing" }] },
			f2: { site: "other", name: "Foreign", steps: [{ type: "page", match: "is", value: "/" }, { type: "page", match: "is", value: "/x" }] },
			f3: { site: "default", name: "Back", mode: "flexible", steps: [{ type: "page", match: "is", value: "/pricing" }, { type: "page", match: "is", value: "/" }] },
		}),
		segments: coll({
			direct: { site: "default", name: "Direct", filters: [{ dim: "channel", op: "is", values: ["Direct"] }] },
			foreign: { site: "other", name: "Foreign", filters: [] },
			organic: { site: "default", name: "Organic", filters: [{ dim: "channel", op: "is", values: ["Organic Search"] }] },
		}),
		annotations: coll({ a1: { site: "default", ts: 1_773_230_400, kind: "publish", text: "Post" } }),
		sites: sitesColl([{ id: "blog" }]),
	};
	const route = () => dataQueryRoute({ db: async () => env.db, settings: async () => settings, now: () => 0 });
	const call = (input: DataQueryInput) => route().handler({ input: DataQueryBody.parse(input), storage } as DataCtx);

	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
		await seedSearch(env);
		// A client site holding the first day's rows only, so its numbers differ from the local site's.
		cloneSite(env.raw, "blog", "day = '2026-03-10'");
	});
	beforeEach(() => {
		clearReportCache();
		invalidateRegistry();
	});

	it("declares plugins:read and a zod input", () => {
		const r = route();
		expect(r.permission).toBe("plugins:read");
		expect(r.input).toBe(DataQueryBody);
	});

	it("is registered on the plugin as data/query", () => {
		const plugin = createPlugin() as unknown as { routes: Record<string, { permission?: string; input?: unknown }> };
		expect(plugin.routes["data/query"]?.permission).toBe("plugins:read");
		expect(plugin.routes["data/query"]?.input).toBe(DataQueryBody);
	});

	it("answers a report for the local site, with or without site", async () => {
		const a = await call({ report: "overview", query: { ...RANGE } });
		expect(a.data.totals?.sessions).toBe(37);
		const b = await call({ report: "overview", query: { ...RANGE, site: "default" } });
		expect(b.data.totals?.sessions).toBe(37);
	});

	it("returns the typed unknown_site error for a site that is neither local nor registered", async () => {
		const err = await call({ report: "overview", query: { ...RANGE, site: "shop" } }).catch((e) => e);
		expect(err).toBeInstanceOf(PluginRouteError);
		expect(err).toMatchObject({ code: "unknown_site", status: 400 });
	});

	it("answers a client site from its own rows only and never sums the two sites", async () => {
		const local = await call({ report: "overview", query: { ...RANGE } });
		const blog = await call({ report: "overview", query: { ...RANGE, site: "blog" } });
		const blogFirstDay = await call({ report: "overview", query: { from: RANGE.from, to: RANGE.from, site: "blog" } });
		const localFirstDay = await call({ report: "overview", query: { from: RANGE.from, to: RANGE.from } });
		expect(blog.data.totals?.sessions).toBe(localFirstDay.data.totals?.sessions);
		expect(blogFirstDay.data.totals).toEqual(localFirstDay.data.totals);
		expect(local.data.totals?.sessions).toBe(37);
		expect(blog.data.totals?.sessions).toBeLessThan(37);
		// Goals and segments are per site: the local segment is unknown for the client site.
		await expect(call({ report: "overview", query: { ...RANGE, site: "blog", segment: "direct" } })).rejects.toMatchObject({ code: "unknown_segment" });
	});

	it("compares two saved segments on the same range with the ad hoc filters on both sides", async () => {
		const pricing = [{ dim: "page" as const, op: "is" as const, values: ["/pricing"] }];
		const r = await call({ report: "overview", query: { ...RANGE, segment: "direct", compare: "segment", compareSegment: "organic", filters: pricing } });
		// Direct with /pricing: i = 1, 3 per day; Organic Search with /pricing: i = 5 per day.
		expect([r.data.totals?.sessions, (r.data.compareTotals as { sessions?: number } | undefined)?.sessions]).toEqual([6, 3]);
		expect(r.segment).toEqual({ id: "direct", name: "Direct" });
		expect(r.compareSegment).toEqual({ id: "organic", name: "Organic" });
		expect(r.compareRange).toEqual(RANGE);
		// Without a primary segment side A is all visitors.
		const all = await call({ report: "overview", query: { ...RANGE, compare: "segment", compareSegment: "organic" } });
		expect([all.data.totals?.sessions, all.segment]).toEqual([37, undefined]);
		for (const compareSegment of ["foreign", "missing"])
			await expect(call({ report: "overview", query: { ...RANGE, compare: "segment", compareSegment } })).rejects.toMatchObject({ code: "unknown_segment" });
		await expect(call({ report: "search_overview", query: { ...RANGE, compare: "segment", compareSegment: "organic" } })).rejects.toMatchObject({ code: "compare_not_supported" });
	});

	it("applies a saved segment of this site before ad hoc filters", async () => {
		const r = await call({ report: "overview", query: { ...RANGE, segment: "direct", filters: [{ dim: "page", op: "is", values: ["/pricing"] }] } });
		// Direct sessions with /pricing: i = 1 and 3 on each of 3 days.
		expect(r.data.totals?.sessions).toBe(6);
		for (const segment of ["foreign", "missing"])
			await expect(call({ report: "overview", query: { ...RANGE, segment } })).rejects.toMatchObject({ code: "unknown_segment" });
	});

	it("loads only this site's valid goals and funnels", async () => {
		const g = await call({ report: "goals", query: { ...RANGE } });
		expect(g.data.rows?.map((r) => r.key)).toEqual(["Signup"]);
		expect(storage.goals.wheres.at(-1)).toEqual({ site: "default" });
		const f = await call({ report: "funnels", query: { ...RANGE }, params: { funnel: "f1" } });
		expect(f.data.rows?.map((r) => r.sessions)).toEqual([36, 18]);
		await expect(call({ report: "funnels", query: { ...RANGE }, params: { funnel: "f2" } })).rejects.toMatchObject({ code: "unknown_funnel" });
		expect(f.data.mode).toBe("sequential");
		// The stored mode wins over params.mode: nobody views "/" after "/pricing", but flexible ignores order.
		const back = await call({ report: "funnels", query: { ...RANGE }, params: { funnel: "f3", mode: "strict" } });
		expect([back.data.mode, back.data.rows?.map((r) => r.sessions)]).toEqual(["flexible", [18, 18]]);
	});

	it("loads annotations for the range on timeseries", async () => {
		const r = await call({ report: "timeseries", query: { ...RANGE, granularity: "day" } });
		expect((r.data.annotations as Array<{ text: string }>).map((a) => a.text)).toEqual(["Post"]);
		expect(storage.annotations.wheres.at(-1)).toEqual({ site: "default", ts: { gte: 1_773_100_800, lt: 1_773_360_000 } });
	});

	describe("withAnnotations", () => {
		const TS = 1_773_230_400; // 2026-03-11 12:00 UTC
		const saved = storage.annotations;
		beforeEach(() => {
			storage.annotations = coll({
				wide: { site: "default", ts: TS, kind: "manual", text: "Wide" },
				pricing: { site: "default", ts: TS + 1, kind: "manual", text: "Pricing", scope: { v: 1, path: [{ op: "is", value: "/pricing" }] } },
				blog: { site: "default", ts: TS + 2, kind: "publish", text: "Blog", scope: { v: 1, path: [{ op: "is", value: "/blog/a" }] } },
				query: { site: "default", ts: TS + 3, kind: "manual", text: "Query", scope: { v: 1, query: [{ op: "is", value: "cookieless" }] } },
			});
		});
		afterAll(() => {
			storage.annotations = saved;
		});
		const texts = (r: { data: Record<string, unknown> }) => (r.data.annotations as Array<{ text: string }>).map((a) => a.text);

		it("returns data.annotations and meta.annotations on a non-series report", async () => {
			const r = await call({ report: "channels", query: { ...RANGE }, withAnnotations: true });
			expect(texts(r)).toEqual(["Wide", "Pricing", "Blog"]);
			expect(r.meta).toEqual({ annotations: { matched: 3, loaded: 4, truncated: false } });
			expect((r.data.annotations as Array<Record<string, unknown>>)[2]).toEqual({
				id: "blog", ts: TS + 2, day: "2026-03-11", kind: "publish", text: "Blog", scope: { v: 1, path: [{ op: "is", value: "/blog/a" }] }, summary: "Page /blog/a",
			});
			const filtered = await call({ report: "channels", query: { ...RANGE, filters: [{ dim: "page", op: "is", values: ["/pricing"] }] }, withAnnotations: true });
			expect(texts(filtered)).toEqual(["Wide", "Pricing"]);
			const plain = await call({ report: "channels", query: { ...RANGE } });
			expect(plain.data.annotations).toBeUndefined();
			expect(plain.meta).toBeUndefined();
		});

		it("embeds the matching set on series reports", async () => {
			const filters = [{ dim: "page" as const, op: "prefix" as const, values: ["/blog/"] }];
			const ts = await call({ report: "timeseries", query: { ...RANGE, granularity: "day", filters } });
			expect(texts(ts)).toEqual(["Wide", "Blog"]);
			expect(texts(await call({ report: "timeseries", query: { ...RANGE, granularity: "day", filters }, withAnnotations: true }))).toEqual(["Wide", "Blog"]);
			expect(texts(await call({ report: "search_overview", query: { ...RANGE } }))).toEqual(["Wide", "Pricing", "Blog", "Query"]);
			expect(texts(await call({ report: "satisfaction_series", query: { ...RANGE, granularity: "day" } }))).toEqual(["Wide", "Pricing", "Blog"]);
		});

		it("sets truncated when more than 500 annotations are in range", async () => {
			const many: Record<string, unknown> = {};
			for (let i = 0; i < 501; i++) many[`a${i}`] = { site: "default", ts: TS + i, kind: "manual", text: `A${i}` };
			const items = Object.entries(many).map(([id, data]) => ({ id, data }));
			storage.annotations = {
				wheres: [],
				async query(o?: { cursor?: string; orderBy?: unknown }) {
					expect(o?.orderBy).toEqual({ ts: "desc" });
					const start = Number(o?.cursor ?? 0);
					return { items: items.slice(start, start + 100), hasMore: start + 100 < items.length, cursor: String(start + 100) };
				},
				async get() {
					return null;
				},
			} as unknown as typeof storage.annotations;
			const r = await call({ report: "overview", query: { ...RANGE }, withAnnotations: true });
			expect(r.meta?.annotations).toEqual({ matched: 500, loaded: 500, truncated: true });
		});
	});

	it("maps query errors to typed route errors", async () => {
		const err = await call({ report: "overview", query: { ...RANGE, filters: [{ dim: "page", op: "regex", values: ["(a+)+"] }] } }).catch((e) => e);
		expect(err).toBeInstanceOf(PluginRouteError);
		expect(err).toMatchObject({ code: "invalid_regex", status: 400 });
	});

	it("rejects unknown reports, params and dims at the schema", () => {
		expect(DataQueryBody.safeParse({ report: "users", query: RANGE }).success).toBe(false);
		expect(DataQueryBody.safeParse({ report: "pages", query: RANGE, params: { sql: "1" } }).success).toBe(false);
		expect(DataQueryBody.safeParse({ report: "pages", query: { ...RANGE, filters: [{ dim: "vkey", op: "is", values: ["x"] }] } }).success).toBe(false);
		expect(DataQueryBody.safeParse({ report: "pages", query: RANGE, limit: 5000 }).success).toBe(false);
		expect(DataQueryBody.safeParse({ report: "pages", query: RANGE, limit: 10, offset: 5 }).success).toBe(true);
	});

	it("never returns visitor keys or session ids", async () => {
		for (const report of ["overview", "pages", "channels", "events", "goals", "funnels", "not_found"] as const) {
			const r = await call({ report, query: { ...RANGE, compare: "previous" }, ...(report === "funnels" ? { params: { funnel: "f1" } } : {}) });
			const text = JSON.stringify(r);
			expect(text, report).not.toMatch(/"(vkey|sid|ua_hash|ip)"/);
			const ids = (env.raw.prepare("SELECT sid, vkey FROM ca_sessions LIMIT 5").all() as Array<{ sid: string; vkey: string }>).flatMap((x) => [x.sid, x.vkey]);
			for (const id of ids) expect(text, report).not.toContain(id);
		}
	});

	it("the sample minimum saved through the settings route reaches the satisfaction answer of data/query", async () => {
		const { settingsRoutes } = await import("../src/routes/settings.js");
		const { normalizeSettings } = await import("../src/settings.js");
		const stored: Record<string, unknown> = { siteTimezone: "UTC" };
		const sctx = (input: unknown) => ({ input, settings: { get: async (k: string) => stored[k] ?? null, set: async (k: string, v: unknown) => void (stored[k] = v), list: async () => Object.entries(stored).map(([key, value]) => ({ key, value })) } }) as never;
		const routes = settingsRoutes({ settings: async () => normalizeSettings(stored), settingsChanged: () => clearReportCache(), facts: () => null });
		const live = () => dataQueryRoute({ db: async () => env.db, settings: async () => normalizeSettings(stored), now: () => 0 });
		const ask = async () => (await live().handler({ input: DataQueryBody.parse({ report: "satisfaction", query: { ...RANGE } }), storage } as DataCtx)) as unknown as { data: { min_measured: number; totals: { measured: number; low_sample: boolean } } };
		const before = await ask();
		expect(before.data.min_measured).toBe(30);
		for (const min of [10, 250]) {
			await routes["settings/save"].handler(sctx({ values: { satisfactionMinMeasured: min } }));
			expect(stored.satisfactionMinMeasured).toBe(min);
			clearReportCache();
			const r = await ask();
			expect(r.data.min_measured).toBe(min);
			expect(r.data.totals.low_sample).toBe(r.data.totals.measured < min);
		}
	});
});
