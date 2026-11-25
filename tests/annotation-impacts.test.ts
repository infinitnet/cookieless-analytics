/** Annotation targets, row verdicts and the batched `annotation_impacts` report (Annotations page). */
import { describe, expect, it, vi } from "vitest";
import { requiredScopes } from "../src/agent/query.js";
import { AnnotationBody, AnnotationParams, SEO_CATALOG } from "../src/agent/schemas.js";
import { annotationSearchMatches, normalizeAnnotation } from "../src/annotations/scope.js";
import { defaultTarget, scopesOverlap, TargetSchema, verdictOf } from "../src/annotations/target.js";
import { zonedToEpoch } from "../src/core/time.js";
import { MCP_TOOLS } from "../src/mcp.js";
import type { Filter } from "../src/query/filters.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, ReportData, ReportParams } from "../src/query/reports/base.js";
import { clearReportCache, type Params, ParamsSchema, runReport } from "../src/query/reports/index.js";
import { saveBody } from "../src/routes/config.js";
import { annotationStore } from "../src/routes/data.js";
import { memColl } from "./agent.helpers.js";
import { seoCtx } from "./fixtures/seo.js";
import { z } from "zod";

const at = (day: string, h = 12) => zonedToEpoch(day, h, "UTC");
const PAGE = { v: 1 as const, path: [{ op: "is" as const, value: "/pricing/" }] };
const QUERY = { v: 1 as const, query: [{ op: "is" as const, value: "blue widgets" }] };

describe("target schema", () => {
	it("accepts each report type with its required row", () => {
		for (const t of [
			{ report: "overview", metric: "visitors" },
			{ report: "overview", metric: "bounce_rate" },
			{ report: "goals", metric: "completions", params: { goal: "g1" } },
			{ report: "events", metric: "events", params: { key: "signup", prop: "plan" } },
			{ report: "channels", metric: "sessions", params: { key: "Organic Search" } },
			{ report: "pages", metric: "avg_time", params: { key: "/pricing/" } },
			{ report: "revenue", metric: "revenue", params: { currency: "EUR" } },
			{ report: "search_overview", metric: "position", params: { source: "google" } },
		])
			expect(TargetSchema.safeParse(t).success, JSON.stringify(t)).toBe(true);
	});
	it("refuses a metric of another report, a missing row or goal, and unknown fields", () => {
		const msg = (t: unknown) => (TargetSchema.safeParse(t).error?.issues ?? []).map((i) => i.message);
		expect(msg({ report: "overview", metric: "clicks" })).toEqual(["This metric is not offered for that report."]);
		expect(msg({ report: "goals", metric: "completions" })).toEqual(["Pick a goal."]);
		expect(msg({ report: "channels", metric: "sessions" })).toEqual(["Pick the row to measure (a channel, a page, an event or a query)."]);
		expect(TargetSchema.safeParse({ report: "overview", metric: "visitors", extra: 1 }).success).toBe(false);
		expect(TargetSchema.safeParse({ report: "nope", metric: "visitors" }).success).toBe(false);
	});
	it("is stored by the config route and the agent API, read back by the adapter, and dropped when invalid", () => {
		const target = { report: "overview", metric: "sessions" };
		expect(saveBody("annotations").safeParse({ data: { ts: 1, kind: "manual", text: "x", target } }).success).toBe(true);
		expect(saveBody("annotations").safeParse({ data: { ts: 1, kind: "manual", text: "x", target: { report: "overview", metric: "clicks" } } }).success).toBe(false);
		expect(AnnotationBody.safeParse({ text: "x", target }).success).toBe(true);
		expect(normalizeAnnotation({ ts: 1, kind: "manual", text: "x", target })?.target).toEqual(target);
		expect(normalizeAnnotation({ ts: 1, kind: "manual", text: "x", target: { report: "overview" } })?.target).toBeUndefined();
	});
	it("keeps the MCP annotate input JSON Schema representable", () => {
		expect(() => z.toJSONSchema(MCP_TOOLS.analytics_annotate.input)).not.toThrow();
	});
	it("defaults to visitors, or Search clicks for a query scope while Search is on", () => {
		expect(defaultTarget(undefined, true)).toEqual({ report: "overview", metric: "visitors" });
		expect(defaultTarget(PAGE, true)).toEqual({ report: "overview", metric: "visitors" });
		expect(defaultTarget(QUERY, true)).toEqual({ report: "search_overview", metric: "clicks" });
		expect(defaultTarget(QUERY, false)).toEqual({ report: "overview", metric: "visitors" });
	});
});

describe("row verdict", () => {
	const f = (o: Partial<Parameters<typeof verdictOf>[1]>) => ({ window: 14, days_after: 14, ...o });
	it("up, down and flat for counts follow the notable rule", () => {
		expect(verdictOf("visitors", f({ before: 100, after: 160, notable: true }))).toEqual({ verdict: "up", good: true });
		expect(verdictOf("visitors", f({ before: 160, after: 100, notable: true }))).toEqual({ verdict: "down", good: false });
		expect(verdictOf("visitors", f({ before: 100, after: 110, notable: false }))).toEqual({ verdict: "flat", good: null });
	});
	it("too early while the after window is short, not enough data on small or missing numbers", () => {
		expect(verdictOf("visitors", f({ days_after: 5, before: 100, after: 160, notable: true })).verdict).toBe("too_early");
		expect(verdictOf("visitors", f({ before: 5, after: 9, notable: true })).verdict).toBe("no_data");
		expect(verdictOf("visitors", f({ before: null, after: 9 })).verdict).toBe("no_data");
		expect(verdictOf("bounce_rate", f({ before: 0.4, after: 0.6, measured: { before: 30, after: 400 } })).verdict).toBe("no_data");
	});
	it("rates use a 5 percent band, and lower is better colors a fall as good news", () => {
		expect(verdictOf("engaged_rate", f({ before: 0.5, after: 0.51, measured: { before: 500, after: 500 } })).verdict).toBe("flat");
		expect(verdictOf("bounce_rate", f({ before: 0.5, after: 0.4, measured: { before: 500, after: 500 } }))).toEqual({ verdict: "down", good: true });
		expect(verdictOf("position", f({ before: 8, after: 5, measured: { before: 900, after: 900 } }))).toEqual({ verdict: "down", good: true });
		expect(verdictOf("exit_rate", f({ before: 0.3, after: 0.5, measured: { before: 900, after: 900 } }))).toEqual({ verdict: "up", good: false });
	});
	it("scopes overlap when either is site-wide or both share a rule", () => {
		expect(scopesOverlap(undefined, PAGE)).toBe(true);
		expect(scopesOverlap(PAGE, { v: 1, path: [{ op: "is", value: "/pricing/" }, { op: "is", value: "/x" }] })).toBe(true);
		expect(scopesOverlap(PAGE, { v: 1, path: [{ op: "is", value: "/other" }] })).toBe(false);
		expect(scopesOverlap(PAGE, QUERY)).toBe(false);
	});
});

describe("annotation_impacts report", () => {
	const ANN = {
		p1: { site: "default", ts: at("2026-03-10"), kind: "publish", text: "New pricing page", scope: PAGE },
		p2: { site: "default", ts: at("2026-03-14"), kind: "manual", text: "Pricing copy", scope: PAGE, target: { report: "overview", metric: "bounce_rate" } },
		o1: { site: "default", ts: at("2026-03-12"), kind: "manual", text: "Blog post", scope: { v: 1, path: [{ op: "is", value: "/blog/a" }] } },
		r1: { site: "default", ts: at("2026-04-20"), kind: "release", text: "Release 3" },
		q1: { site: "default", ts: at("2026-03-05"), kind: "release", text: "Title test", scope: QUERY },
		x1: { site: "other", ts: at("2026-03-11"), kind: "manual", text: "Other site" },
	};
	function harness(now: string, profile?: "small", ann: Record<string, object> = ANN, dialect: "sqlite" | "postgres" = "sqlite") {
		const calls: Array<{ report: string; from: string; to: string; filters: readonly Filter[]; params?: ReportParams }> = [];
		const dispatch = vi.fn(async (r: { report: string; query: { from: string; to: string; filters: readonly Filter[] }; params?: ReportParams }) => {
			calls.push({ report: r.report, from: r.query.from, to: r.query.to, filters: r.query.filters, ...(r.params ? { params: r.params } : {}) });
			const late = r.query.from >= "2026-03-11";
			const data: ReportData = { totals: { visitors: late ? 400 : 200, sessions: late ? 500 : 300, bounce_rate: late ? 0.3 : 0.5 } };
			return { data, notices: [] as string[] };
		});
		const writes = vi.fn(async () => ({ changes: 0 }));
		const rc: ReportCtx = {
			...seoCtx({ dialect, run: writes, all: async () => [], batch: writes as never }, "default", profile ? { capacityProfile: profile } : {}, at(now)),
			dispatch,
			annotationStore: annotationStore(memColl(ann), "default", "UTC"),
		};
		const run = (params: Params = {}, limit?: number, offset?: number) => {
			clearReportCache();
			return runReport(rc, { report: "annotation_impacts", query: QuerySchema.parse({ from: "2026-03-01", to: "2026-04-30" }), params, ...(limit ? { limit } : {}), ...(offset ? { offset } : {}) });
		};
		return { run, calls, writes };
	}
	type RowOut = { key: string; verdict: string; days_after: number; target: { metric: string }; target_default: boolean; overlaps: Array<{ id: string }>; notices: string[] };
	const rowsOf = (d: ReportData) => d.rows as unknown as RowOut[];

	it("one call lists the range newest first with verdicts, two target runs per measured row and no per-row annotation read", async () => {
		const h = harness("2026-04-25");
		const r = await h.run();
		const rows = rowsOf(r.data);
		expect(rows.map((x) => x.key)).toEqual(["r1", "p2", "o1", "p1", "q1"]);
		expect(r.data).toMatchObject({ total: 5, window: 14 });
		// r1 is four days old: too early, measured with what exists.
		expect(rows[0]).toMatchObject({ verdict: "too_early", days_after: 4 });
		expect(rows.find((x) => x.key === "p1")).toMatchObject({ verdict: "up", target: { metric: "visitors" }, target_default: true });
		expect(rows.find((x) => x.key === "p2")).toMatchObject({ verdict: "down", good: true, target: { metric: "bounce_rate" }, target_default: false });
		// Five rows, two runs each; nothing else is dispatched.
		expect(h.calls).toHaveLength(10);
		expect(h.calls.every((c) => c.report === "overview")).toBe(true);
	});

	it("the page scope filters the measured metric", async () => {
		const h = harness("2026-04-25");
		await h.run({ kind: "publish" });
		expect(h.calls).toHaveLength(2);
		expect(h.calls[0]?.filters).toEqual([{ dim: "page", op: "is", values: ["/pricing/"] }]);
	});

	it("flags overlapping annotations of the same scope only", async () => {
		const h = harness("2026-04-25");
		const rows = rowsOf((await h.run()).data);
		expect(rows.find((x) => x.key === "p1")?.overlaps.map((o) => o.id)).toEqual(["p2"]);
		expect(rows.find((x) => x.key === "o1")?.overlaps).toEqual([]);
	});

	it("filters by kind and scope kind, pages with limit and offset, and caps rows by profile", async () => {
		const h = harness("2026-04-25");
		expect(rowsOf((await h.run({ scopeKind: "site" })).data).map((x) => x.key)).toEqual(["r1"]);
		expect(rowsOf((await h.run({ scopeKind: "query" })).data).map((x) => x.key)).toEqual(["q1"]);
		const page = await h.run({}, 2, 2);
		expect(rowsOf(page.data).map((x) => x.key)).toEqual(["o1", "p1"]);
		expect(page.data.total).toBe(5);
		const big = await harness("2026-04-25").run({}, 500);
		expect(big.data.limit).toBe(6);
		const small = await harness("2026-04-25", "small").run({}, 500);
		expect(small.data.limit).toBe(5);
	});

	it("a query scope measures visitors without Search, and agents need read:search for withSearch", async () => {
		const rows = rowsOf((await harness("2026-04-25").run({ withSearch: true })).data);
		// No final Search rows in this database: Search counts as off.
		expect(rows.find((x) => x.key === "q1")?.target).toEqual({ report: "overview", metric: "visitors" });
		expect(requiredScopes({ report: "annotation_impacts" })).toEqual(["read:analytics"]);
		expect(requiredScopes({ report: "annotation_impacts", params: { withSearch: true } })).toEqual(["read:analytics", "read:search"]);
	});

	describe.each(["sqlite", "postgres"] as const)("text search q (%s)", (dialect) => {
		const SEARCH = {
			s1: { site: "default", ts: at("2026-03-02"), kind: "manual", text: "50% off_sale" },
			s2: { site: "default", ts: at("2026-03-03"), kind: "manual", text: "5000 offxsale" },
			s3: { site: "default", ts: at("2026-03-04"), kind: "manual", text: "Spring campaign", scope: { v: 1, host: [{ op: "is", value: "shop.example.com" }] } },
			s4: { site: "default", ts: at("2026-03-05"), kind: "publish", text: "Hello", slug: "hello-world", collection: "posts", scope: { v: 1, path: [{ op: "prefix", value: "/docs/" }] } },
			s5: { site: "default", ts: at("2026-03-06"), kind: "release", text: "Campaign two" },
			s6: { site: "default", ts: at("2026-03-07"), kind: "manual", text: "Campaign three" },
			s7: { site: "default", ts: at("2026-03-08"), kind: "manual", text: "CAMPAIGN four" },
		};
		const keys = async (params: Params, limit?: number, offset?: number) => {
			const r = await harness("2026-04-25", undefined, SEARCH, dialect).run(params, limit, offset);
			return { keys: rowsOf(r.data).map((x) => x.key), total: r.data.total };
		};
		it("matches the title, kind and its label, scope, slug and collection, case-insensitive", async () => {
			expect((await keys({ q: "spring" })).keys).toEqual(["s3"]);
			expect((await keys({ q: "Published" })).keys).toEqual(["s4"]);
			expect((await keys({ q: "RELEASE" })).keys).toEqual(["s5"]);
			expect((await keys({ q: "SHOP.example" })).keys).toEqual(["s3"]);
			expect((await keys({ q: "/docs" })).keys).toEqual(["s4"]);
			expect((await keys({ q: "starting with" })).keys).toEqual(["s4"]);
			expect((await keys({ q: "hello-wor" })).keys).toEqual(["s4"]);
			expect((await keys({ q: "posts" })).keys).toEqual(["s4"]);
			expect((await keys({ q: "nothing here" })).keys).toEqual([]);
		});
		it("treats % and _ literally", async () => {
			expect((await keys({ q: "0%" })).keys).toEqual(["s1"]);
			expect((await keys({ q: "f_s" })).keys).toEqual(["s1"]);
			expect((await keys({ q: "%" })).keys).toEqual(["s1"]);
			expect((await keys({ q: "_" })).keys).toEqual(["s1"]);
		});
		it("combines with the kind filter and paging, and total counts every match", async () => {
			expect(await keys({ q: "campaign" })).toEqual({ keys: ["s7", "s6", "s5", "s3"], total: 4 });
			expect(await keys({ q: "campaign", kind: "manual" })).toEqual({ keys: ["s7", "s6", "s3"], total: 3 });
			expect(await keys({ q: "campaign", kind: "manual" }, 2, 2)).toEqual({ keys: ["s3"], total: 3 });
			expect(await keys({ q: "campaign", scopeKind: "host" })).toEqual({ keys: ["s3"], total: 1 });
		});
	});

	it("q is trimmed, at most 100 characters, and listed in the catalog and the agent GET", () => {
		expect(ParamsSchema.parse({ q: "  launch " }).q).toBe("launch");
		expect(ParamsSchema.safeParse({ q: "x".repeat(100) }).success).toBe(true);
		expect(ParamsSchema.safeParse({ q: "x".repeat(101) }).success).toBe(false);
		expect(AnnotationParams.parse({ q: " a " }).q).toBe("a");
		expect(AnnotationParams.safeParse({ q: "x".repeat(101) }).success).toBe(false);
		expect(SEO_CATALOG.annotationImpacts.params).toContain("q");
		expect(annotationSearchMatches({ text: "A", kind: "manual" }, "   ")).toBe(true);
	});

	it("reads only: no database write", async () => {
		const h = harness("2026-04-25");
		await h.run();
		expect(h.writes).not.toHaveBeenCalled();
	});
});
