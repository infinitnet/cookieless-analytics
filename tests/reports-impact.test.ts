/** Annotation impact: windows, completeness, scope filters, notable, overlapping, the two dispatcher runs. */
import { describe, expect, it, vi } from "vitest";
import { requiredScopes } from "../src/agent/query.js";
import type { Annotation } from "../src/annotations/scope.js";
import { zonedToEpoch } from "../src/core/time.js";
import type { Filter } from "../src/query/filters.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, ReportData, ReportParams } from "../src/query/reports/base.js";
import { clearReportCache, type Params, ParamsSchema, runReport } from "../src/query/reports/index.js";
import { baseWords, SEO_TEXT } from "../src/query/reports/seo-copy.js";
import { annotationStore } from "../src/routes/data.js";
import { memColl } from "./agent.helpers.js";
import { insertSearch, seoCtx } from "./fixtures/seo.js";
import { schemaDb } from "./helpers.js";

const D = "2026-03-10";
const at = (day: string, h = 12) => zonedToEpoch(day, h, "UTC");
const ANN: Record<string, Annotation & { site: string }> = {
	a1: { site: "default", ts: at(D), kind: "publish", text: "New pricing page", scope: { v: 1, path: [{ op: "is", value: "/pricing/" }] } },
	a2: { site: "default", ts: at("2026-03-20"), kind: "manual", text: "Newsletter" },
	a3: { site: "default", ts: at("2026-03-05"), kind: "release", text: "Release 2", scope: { v: 1, query: [{ op: "is", value: "blue widgets" }] } },
	b1: { site: "other", ts: at("2026-03-25"), kind: "manual", text: "Other site" },
};

interface Call {
	report: string;
	from: string;
	to: string;
	filters: readonly Filter[];
	params?: ReportParams;
}

/** A dispatcher spy: totals grow with the start day so before and after differ; rows carry one key. */
function harness(now: string, values: { before: number; after: number; den?: [number, number] } = { before: 100, after: 160 }) {
	const calls: Call[] = [];
	const dispatch = vi.fn(async (r: { report: string; query: { from: string; to: string; filters: readonly Filter[] }; params?: ReportParams }) => {
		calls.push({ report: r.report, from: r.query.from, to: r.query.to, filters: r.query.filters, ...(r.params ? { params: r.params } : {}) });
		const after = r.query.from > D;
		const v = after ? values.after : values.before;
		const den = values.den ? values.den[after ? 1 : 0] : 50;
		const totals = { sessions: v, bounce_rate: 0.5, clicks: v, impressions: den, ctr: 0.1, position: 4, pct_long: 0.4, measured: den, back_nav_rate: 0.2, page_loads: den * 3 };
		const data: ReportData = { totals, rows: [{ key: "Organic Search", sessions: v }], series: [{ t: r.query.from, sessions: 1, clicks: 2 }] };
		return { data, notices: [] as string[] };
	});
	const rc: ReportCtx = {
		...seoCtx({ dialect: "sqlite", run: async () => ({ changes: 0 }), all: async () => [], batch: async () => {} }, "default", {}, at(now)),
		dispatch,
		annotationStore: annotationStore(memColl(ANN), "default", "UTC"),
	};
	const run = (params: Params, filters: Filter[] = []) => {
		clearReportCache();
		return runReport(rc, { report: "impact", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-03-31", filters }), params });
	};
	return { run, calls, dispatch };
}

describe("impact windows", () => {
	it("the annotation day is in neither window; equal windows; exactly two runs of the target", async () => {
		const h = harness("2026-04-30");
		const r = await h.run({ annotation: "a2", report: "overview", metric: "sessions" });
		expect(r.data).toMatchObject({
			day: "2026-03-20",
			window: 28,
			complete: true,
			days_after: 28,
			periods: { before: { from: "2026-02-20", to: "2026-03-19" }, after: { from: "2026-03-21", to: "2026-04-17" } },
			before: 100,
			after: 160,
			caution: SEO_TEXT.caution,
		});
		expect(h.calls.filter((c) => c.report === "overview")).toHaveLength(2);
		expect(h.calls.filter((c) => c.report === "timeseries")).toHaveLength(1);
		expect(r.data.series).toBeDefined();
		expect(r.data.marker).toBe("2026-03-20");
	});

	it("an after window cut by yesterday shortens the before window and sets complete false", async () => {
		const h = harness("2026-03-20");
		const r = await h.run({ at: D, report: "overview", metric: "sessions", window: 14 });
		expect(r.data).toMatchObject({ complete: false, days_after: 9, periods: { before: { from: "2026-03-01", to: "2026-03-09" }, after: { from: "2026-03-11", to: "2026-03-19" } }, before: 100, after: 160, delta: 60, delta_pct: 0.6, notable: true });
		expect(r.data.notices).toContain("incomplete");
		expect((await harness("2026-03-11").run({ at: D, report: "overview", metric: "sessions" })).data).toMatchObject({ not_yet: "2026-03-12", complete: false, days_after: 0 });
	});

	it("an after window cut by the last final search day", async () => {
		const env = await schemaDb();
		insertSearch(env.raw, "default", [
			{ day: "2026-03-15", impressions: 1, clicks: 0 },
			{ day: "2026-03-16", impressions: 1, clicks: 0, provisional: true },
		]);
		const h = harness("2026-04-30");
		const rc = { ...seoCtx(env.db, "default", {}, at("2026-04-30")), dispatch: h.dispatch };
		clearReportCache();
		const r = await runReport(rc, { report: "impact", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-03-31" }), params: { at: D, report: "search_overview", metric: "clicks" } });
		expect(r.data).toMatchObject({ complete: false, days_after: 5, periods: { before: { from: "2026-03-05", to: "2026-03-09" }, after: { from: "2026-03-11", to: "2026-03-15" } } });
	});

	it("window presets only; latest resolves the newest annotation, optionally of one kind", async () => {
		expect(ParamsSchema.safeParse({ window: 30 }).success).toBe(false);
		for (const w of [7, 14, 28, 60, 90]) expect(ParamsSchema.safeParse({ window: w }).success).toBe(true);
		const h = harness("2026-04-30");
		expect((await h.run({ annotation: "latest", report: "overview", metric: "sessions" })).data.annotation).toMatchObject({ id: "a2", text: "Newsletter", summary: "Site-wide" });
		expect((await h.run({ annotation: "latest", kind: "publish", report: "overview", metric: "sessions" })).data.annotation).toMatchObject({ id: "a1", summary: "Page /pricing/" });
		await expect(h.run({ annotation: "b1", report: "overview", metric: "sessions" })).rejects.toMatchObject({ code: "not_found" });
		await expect(h.run({ annotation: "a1", report: "overview", metric: "clicks" })).rejects.toMatchObject({ code: "invalid_params" });
		const none = harness("2026-04-30");
		const empty = { ...none, run: (p: Params) => runReport({ ...seoCtx({ dialect: "sqlite", run: async () => ({ changes: 0 }), all: async () => [], batch: async () => {} }, "default"), dispatch: none.dispatch, annotationStore: annotationStore(memColl({}), "default", "UTC") }, { report: "impact", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-03-31" }), params: p }) };
		expect((await empty.run({ annotation: "latest", report: "overview", metric: "sessions" })).data).toMatchObject({ no_annotation: true });
	});

	it("cf10: the base of a rate is named in words: sessions, page views, entries, orders, visitors, measured sessions or impressions", () => {
		expect(["sessions", "pageviews", "entries", "orders", "visitors", "measured", "impressions", "impressions_1_3"].map((b) => baseWords(b, "overview"))).toEqual(["sessions", "page views", "entries", "orders", "visitors", "measured sessions", "impressions", "impressions"]);
		// An answer from an older satellite carries no base.
		expect([baseWords(undefined, "search_overview"), baseWords(undefined, "overview")]).toEqual(["impressions", "measured"]);
	});

	it("notable for counts only, denominators for rates, delta_pct null when before is 0, overlapping excludes the selected one", async () => {
		const h = harness("2026-04-30", { before: 0, after: 10, den: [40, 60] });
		const count = await h.run({ annotation: "a1", report: "overview", metric: "sessions", scope: "none" });
		expect(count.data).toMatchObject({ before: 0, after: 10, delta: 10, delta_pct: null, notable: true });
		expect(count.data.measured).toBeUndefined();
		expect((count.data.overlapping as Array<{ id: string }>).map((o) => o.id)).toEqual(["a3", "a2"]);
		const rate = await h.run({ annotation: "a1", report: "search_overview", metric: "position" });
		expect(rate.data.notable).toBeUndefined();
		expect(rate.data.measured).toEqual({ base: "impressions", before: 40, after: 60 });
		// Every Search Satisfaction rate reads measured sessions; avg_duration reads every session.
		for (const metric of ["pct_long", "pogo_stick_rate", "returned_from_search_rate", "search_reentry_rate"]) {
			const sat = await h.run({ annotation: "a1", report: "satisfaction", metric });
			expect(sat.data.measured, metric).toEqual({ base: "measured", before: 40, after: 60 });
		}
		expect((await h.run({ annotation: "a1", report: "satisfaction", metric: "avg_duration" })).data.measured).toEqual({ base: "sessions", before: 0, after: 10 });
		// The back/forward rate is a share of page loads, not of measured sessions.
		expect((await h.run({ annotation: "a1", report: "satisfaction", metric: "back_nav_rate" })).data.measured).toEqual({ base: "page_loads", before: 120, after: 180 });
		expect(baseWords("page_loads", "satisfaction")).toBe("page loads");
		const row = await h.run({ annotation: "a1", report: "channels", metric: "sessions", key: "Organic Search", scope: "none" });
		expect(row.data).toMatchObject({ key: "Organic Search", before: 0, after: 10 });
		expect(h.calls.at(-2)?.filters).toEqual([{ dim: "channel", op: "is", values: ["Organic Search"] }]);
	});
});

describe("impact scope", () => {
	const targetFilters = (calls: Call[], report: string) => calls.filter((c) => c.report === report).map((c) => c.filters);

	it("a path scope gives one page filter: the path on traffic, the page key on search", async () => {
		const h = harness("2026-04-30");
		await h.run({ annotation: "a1", report: "overview", metric: "sessions" });
		expect(targetFilters(h.calls, "overview")).toEqual([[{ dim: "page", op: "is", values: ["/pricing/"] }], [{ dim: "page", op: "is", values: ["/pricing/"] }]]);
		await h.run({ annotation: "a1", report: "search_overview", metric: "clicks" });
		expect(targetFilters(h.calls, "search_overview")[0]).toEqual([{ dim: "page", op: "is", values: ["/pricing"] }]);
	});

	it("a query scope on a traffic target adds no filter and the notice; on search it becomes a query filter", async () => {
		const h = harness("2026-04-30");
		const r = await h.run({ annotation: "a3", report: "overview", metric: "sessions" });
		expect(targetFilters(h.calls, "overview")[0]).toEqual([]);
		expect(r.data.notices).toContain("scope_query_not_applied");
		await h.run({ annotation: "a3", report: "search_overview", metric: "clicks" });
		expect(targetFilters(h.calls, "search_overview")[0]).toEqual([{ dim: "query", op: "is", values: ["blue widgets"] }]);
	});

	it("params.path adds one more page filter; scope none adds nothing; page filters are carried over", async () => {
		const h = harness("2026-04-30");
		const carried: Filter = { dim: "country", op: "is", values: ["DE"] };
		await h.run({ annotation: "a1", report: "overview", metric: "sessions", path: "/blog/" }, [carried]);
		expect(targetFilters(h.calls, "overview")[0]).toEqual([carried, { dim: "page", op: "is", values: ["/pricing/"] }, { dim: "page", op: "is", values: ["/blog/"] }]);
		const n = harness("2026-04-30");
		const r = await n.run({ annotation: "a1", report: "overview", metric: "sessions", scope: "none" });
		expect(targetFilters(n.calls, "overview")[0]).toEqual([]);
		expect(r.data.scope).toBe("none");
	});
});

describe("impact through the real dispatcher", () => {
	it("raw_only propagates for satisfaction beyond the raw window; read:search follows the target", async () => {
		const env = await schemaDb();
		const rc = { ...seoCtx(env.db, "default", {}, at("2026-04-30")), rawFrom: "2026-03-05", annotationStore: annotationStore(memColl(ANN), "default", "UTC") };
		clearReportCache();
		await expect(runReport(rc, { report: "impact", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-03-31" }), params: { annotation: "a1", report: "satisfaction", metric: "pct_long" } })).rejects.toMatchObject({ code: "raw_only" });
		const ok = await runReport(rc, { report: "impact", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-03-31" }), params: { at: "2026-04-10", report: "overview", metric: "sessions", window: 7 } });
		expect(ok.data).toMatchObject({ before: 0, after: 0, delta: 0, complete: true });
		expect(requiredScopes({ report: "impact", params: { report: "search_pages" } })).toEqual(["read:analytics", "read:search"]);
		expect(requiredScopes({ report: "impact", params: { report: "overview" } })).toEqual(["read:analytics"]);
	});
});

describe("impact edge cases", () => {
	it("row reports need a key; latest skips future annotations; not_yet waits for the Search lag", async () => {
		const h = harness("2026-04-30");
		await expect(h.run({ annotation: "a1", report: "search_pages", metric: "clicks" })).rejects.toMatchObject({ code: "invalid_params" });
		await expect(h.run({ annotation: "a1", report: "goals", metric: "completions" })).rejects.toMatchObject({ code: "invalid_params" });
		const future = annotationStore(memColl({ ...ANN, f1: { site: "default", ts: at("2026-12-01"), kind: "manual", text: "Planned" } }), "default", "UTC", at("2026-04-30"));
		expect((await future.resolve("latest"))?.text).toBe("Newsletter");
		const env = await schemaDb();
		insertSearch(env.raw, "default", [{ day: "2026-03-07", impressions: 1, clicks: 0 }]);
		clearReportCache();
		const r = await runReport({ ...seoCtx(env.db, "default", {}, at("2026-03-11")), dispatch: h.dispatch }, { report: "impact", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-03-31" }), params: { at: D, report: "search_overview", metric: "clicks" } });
		// Yesterday is 03-10 and the newest final day 03-07: three days of lag after the earliest traffic date 03-12.
		expect(r.data.not_yet).toBe("2026-03-15");
	});

	it("a dashboard goal id resolves to the goal name for the impact target", async () => {
		const { answer } = await import("../src/routes/data.js");
		const env = await schemaDb();
		const seen: unknown[] = [];
		const storage = {
			goals: memColl({ g1: { site: "default", name: "Signup", type: "page", match: "is", value: "/thanks" } }),
			annotations: memColl(ANN),
		};
		const settings = seoCtx(env.db, "default").settings as never;
		clearReportCache();
		const r = await answer({ db: async () => env.db, settings: async () => settings, now: () => at("2026-04-30") }, { input: {}, storage } as never, {
			report: "impact",
			query: QuerySchema.parse({ from: "2026-03-01", to: "2026-03-31" }),
			params: { annotation: "a1", report: "goals", metric: "completions", goal: "g1" },
		});
		seen.push(r.data.key);
		expect(seen).toEqual(["Signup"]);
	});
});

