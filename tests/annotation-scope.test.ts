import { describe, expect, it, vi } from "vitest";
import {
	type Annotation,
	annotationMatches,
	escapeRegex,
	type MatchContext,
	matchAnnotations,
	normalizeAnnotation,
	SCOPE_MESSAGES,
	ScopeSchema,
	scopeSummary,
	scopeToFilters,
} from "../src/annotations/scope.js";
import type { Db } from "../src/db/adapter.js";
import { compileSearch, compileTraffic } from "../src/query/compile.js";
import type { Filter } from "../src/query/filters.js";
import * as safe from "../src/query/safe-regex.js";

vi.mock("../src/query/safe-regex.js", async (orig) => {
	const real = await orig<typeof import("../src/query/safe-regex.js")>();
	return { ...real, compileSafeRegex: vi.fn(real.compileSafeRegex) };
});

const TZ = "UTC";
const TS = Date.UTC(2026, 2, 10, 12) / 1000; // 2026-03-10
const ctx = (filters: Filter[] = [], over: Partial<MatchContext> = {}): MatchContext => ({ site: "s", from: "2026-03-01", to: "2026-03-31", tz: TZ, target: "traffic", filters, ...over });
const ann = (scope?: Annotation["scope"], over: Partial<Annotation> = {}): Annotation => ({ site: "s", ts: TS, kind: "manual", text: "x", ...(scope ? { scope } : {}), ...over });
const f = (dim: Filter["dim"], op: Filter["op"], ...values: string[]): Filter => ({ dim, op, values });
const messages = (input: unknown) => {
	const r = ScopeSchema.safeParse(input);
	return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("ScopeSchema", () => {
	it("accepts the site-wide forms", () => {
		for (const s of [{}, { v: 1 }, { v: 1, path: [] }]) expect(ScopeSchema.parse(s)).toEqual({ v: 1 });
		expect(ScopeSchema.optional().parse(undefined)).toBeUndefined();
	});

	it("accepts each kind and op", () => {
		const s = { v: 1, host: [{ op: "is", value: "shop.example.com" }, { op: "regex", value: "^shop\\." }], path: [{ op: "prefix", value: "/blog/" }], query: [{ op: "is", value: "How To" }] };
		expect(ScopeSchema.parse(s)).toEqual(s);
	});

	it("rejects with typed messages", () => {
		const r = (op: string, value: string) => ({ op, value });
		expect(messages({ v: 1, path: Array.from({ length: 11 }, (_, i) => r("is", `/p${i}`)) })).toContain(SCOPE_MESSAGES.count);
		expect(
			messages({ v: 1, host: Array.from({ length: 10 }, (_, i) => r("is", `h${i}.example.com`)), path: Array.from({ length: 10 }, (_, i) => r("is", `/p${i}`)), query: [r("is", "q")] }),
		).toContain(SCOPE_MESSAGES.count);
		expect(messages({ v: 2 })).toEqual([SCOPE_MESSAGES.version]);
		expect(messages({ v: 1, host: [r("is", "https://example.com")] })).toEqual([SCOPE_MESSAGES.host]);
		expect(messages({ v: 1, host: [r("is", "example.com:8080")] })).toEqual([SCOPE_MESSAGES.host]);
		expect(messages({ v: 1, host: [r("is", "Example.com")] })).toEqual([SCOPE_MESSAGES.host]);
		expect(messages({ v: 1, path: [r("is", "blog")] })).toEqual([SCOPE_MESSAGES.path]);
		expect(messages({ v: 1, path: [r("prefix", "blog")] })).toEqual([SCOPE_MESSAGES.path]);
		expect(messages({ v: 1, path: [r("is", `/${"a".repeat(512)}`)] }).length).toBe(1);
		expect(messages({ v: 1, path: [r("regex", "(a+)+")] })[0]).toMatch(/Nested/);
		expect(messages({ v: 1, host: [r("prefix", "shop")] })[0]).toMatch(/not allowed for host/);
		expect(messages({ v: 1, query: [r("prefix", "how")] })[0]).toMatch(/not allowed for query/);
		expect(messages({ v: 1, path: [r("is", `/${"a".repeat(150)}`), r("prefix", `/${"b".repeat(150)}`)] })).toEqual([SCOPE_MESSAGES.mixed]);
	});
});

describe("normalizeAnnotation", () => {
	it("reads the stored scope; a stray path field is not a scope", () => {
		const scope = { v: 1, path: [{ op: "prefix", value: "/b/" }] };
		expect(normalizeAnnotation({ ts: TS, kind: "manual", text: "t", scope })?.scope).toEqual(scope);
		expect(normalizeAnnotation({ ts: TS, kind: "manual", text: "t", path: "/a" })?.scope).toBeUndefined();
	});
	it("reads an unknown version as site-wide with a notice", () => {
		const a = normalizeAnnotation({ ts: TS, kind: "manual", text: "t", scope: { v: 9, path: [] } });
		expect(a?.scope).toBeUndefined();
		expect(a?.notice).toBe("scope_unknown_version");
	});
	it("reads a site-wide scope as no scope and drops a malformed record", () => {
		expect(normalizeAnnotation({ ts: TS, kind: "manual", text: "t", scope: { v: 1 } }, "id1")).toEqual({ id: "id1", ts: TS, kind: "manual", text: "t" });
		expect(normalizeAnnotation({ kind: "manual" })).toBeNull();
	});
});

describe("annotationMatches", () => {
	const isA = { v: 1 as const, path: [{ op: "is" as const, value: "/blog/a" }] };
	const prefix = { v: 1 as const, path: [{ op: "prefix" as const, value: "/blog/" }] };
	const regex = { v: 1 as const, path: [{ op: "regex" as const, value: "^/blog/\\d+$" }] };

	it("site-wide matches empty and filtered contexts", () => {
		expect(annotationMatches(ann(), ctx())).toBe(true);
		expect(annotationMatches(ann(), ctx([f("page", "is", "/x"), f("country", "is", "DE")]))).toBe(true);
	});

	it("path is", () => {
		const a = ann(isA);
		expect(annotationMatches(a, ctx())).toBe(true);
		expect(annotationMatches(a, ctx([f("country", "is", "DE")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("page", "is", "/blog/a")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("page", "prefix", "/blog")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("page", "regex", "^/blog/[a-z]$")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("page", "is", "/other")]))).toBe(false);
		expect(annotationMatches(a, ctx([f("page", "is_not", "/blog/a")]))).toBe(false);
		expect(annotationMatches(a, ctx([f("page", "is_not", "/other")]))).toBe(true);
	});

	it("path prefix", () => {
		const a = ann(prefix);
		expect(annotationMatches(a, ctx([f("page", "is", "/blog/x")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("page", "is", "/shop")]))).toBe(false);
		expect(annotationMatches(a, ctx([f("page", "prefix", "/bl")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("page", "prefix", "/blog/2026/")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("page", "prefix", "/shop/")]))).toBe(false);
		expect(annotationMatches(a, ctx([f("page", "not_prefix", "/blog/")]))).toBe(true);
	});

	it("path regex", () => {
		const a = ann(regex);
		expect(annotationMatches(a, ctx([f("page", "is", "/blog/12")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("page", "is", "/blog/x")]))).toBe(false);
		expect(annotationMatches(a, ctx([f("page", "regex", "^/shop")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("page", "contains", "zzz")]))).toBe(true);
	});

	it("host rules against host filters, case-insensitive", () => {
		const a = ann({ v: 1, host: [{ op: "is", value: "shop.example.com" }] });
		expect(annotationMatches(a, ctx([f("host", "is", "Shop.Example.com")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("host", "is", "www.example.com")]))).toBe(false);
		expect(annotationMatches(a, ctx([f("host", "is_not", "shop.example.com")]))).toBe(false);
		expect(annotationMatches(ann({ v: 1, host: [{ op: "regex", value: "^shop\\." }] }), ctx([f("host", "is", "shop.a.org")]))).toBe(true);
	});

	it("query scopes match search contexts only", () => {
		const a = ann({ v: 1, query: [{ op: "is", value: "How To" }] });
		expect(annotationMatches(a, ctx())).toBe(false);
		expect(annotationMatches(a, ctx([], { target: "search" }))).toBe(true);
		expect(annotationMatches(a, ctx([f("query", "is", "how to")], { target: "search" }))).toBe(true);
		expect(annotationMatches(a, ctx([f("query", "is", "other")], { target: "search" }))).toBe(false);
	});

	it("AND across kinds, OR within a kind", () => {
		const a = ann({ v: 1, host: [{ op: "is", value: "a.org" }, { op: "is", value: "b.org" }], path: [{ op: "is", value: "/p" }] });
		expect(annotationMatches(a, ctx([f("host", "is", "b.org"), f("page", "is", "/p")]))).toBe(true);
		expect(annotationMatches(a, ctx([f("host", "is", "c.org"), f("page", "is", "/p")]))).toBe(false);
		expect(annotationMatches(a, ctx([f("host", "is", "a.org"), f("page", "is", "/q")]))).toBe(false);
	});

	it("dates and sites", () => {
		expect(annotationMatches(ann(), ctx([], { from: "2026-03-11" }))).toBe(false);
		expect(annotationMatches(ann(), ctx([], { to: "2026-03-09" }))).toBe(false);
		expect(annotationMatches(ann(undefined, { site: "other" }), ctx())).toBe(false);
	});

	it("compiles each regex once per call", () => {
		const spy = vi.mocked(safe.compileSafeRegex);
		spy.mockClear();
		const list = Array.from({ length: 50 }, () => ann(regex));
		expect(matchAnnotations(list, ctx([f("page", "is", "/blog/1", "/blog/2")])).length).toBe(50);
		expect(spy.mock.calls.filter((c) => c[0] === "^/blog/\\d+$").length).toBe(1);
	});

	it("runs the adversarial corpus over 500 annotations in under 50 ms", () => {
		const corpus = ["^(([a-z])+.)+[A-Z]([a-z])+$", "[a-z]+x[a-z]+!", "\\w+\\d+!", "^.*x.*!", "^\\w+\\d+!", "^.{0,50}.{0,50}x", "a?a?a?a?a?a?a?a?a?b", "^/blog/", "(foo|bar)-\\d{1,3}", "^[^/]+/[^/]+$"];
		const valid = corpus.filter((p) => safe.validateSafeRegex(p, "i").ok);
		const list = Array.from({ length: 500 }, (_, i) => ann({ v: 1, path: [{ op: "regex", value: valid[i % valid.length] as string }, { op: "is", value: `/p${i}` }] }));
		const inputs = ["a".repeat(511), `${"a".repeat(511)}!`, "/blog/".repeat(80), "1".repeat(511)].map((s) => `/${s}`);
		const t0 = performance.now();
		matchAnnotations(list, ctx([f("page", "is", ...inputs), f("page", "is_not", ...inputs)]));
		expect(performance.now() - t0).toBeLessThan(50);
	});
});

describe("scopeToFilters", () => {
	it("one filter per op per kind", () => {
		expect(scopeToFilters({ v: 1, host: [{ op: "is", value: "a.org" }, { op: "is", value: "b.org" }], path: [{ op: "prefix", value: "/blog/" }] }, "traffic")).toEqual({
			filters: [f("host", "is", "a.org", "b.org"), f("page", "prefix", "/blog/")],
			notices: [],
		});
		expect(scopeToFilters(undefined, "traffic")).toEqual({ filters: [], notices: [] });
	});

	it("a mixed kind becomes one escaped regex", () => {
		const out = scopeToFilters({ v: 1, path: [{ op: "is", value: "/a.b" }, { op: "prefix", value: "/c/" }, { op: "regex", value: "^/d\\d" }] }, "traffic");
		expect(out.filters).toEqual([f("page", "regex", "^\\/a\\.b$|^\\/c\\/|(?:^/d\\d)")]);
		const re = new RegExp(out.filters[0]?.values[0] as string, "i");
		expect(["/a.b", "/c/x", "/d1"].every((s) => re.test(s))).toBe(true);
		expect(re.test("/aXb")).toBe(false);
		expect(safe.validateSafeRegex(out.filters[0]?.values[0] as string, "i").ok).toBe(true);
	});

	it("notices and page key normalization", () => {
		const scope = { v: 1 as const, host: [{ op: "is" as const, value: "a.org" }], path: [{ op: "is" as const, value: "/A/" }], query: [{ op: "is" as const, value: "q" }] };
		expect(scopeToFilters(scope, "search", (p) => p.toLowerCase().replace(/\/$/, ""))).toEqual({ filters: [f("page", "is", "/a"), f("query", "is", "q")], notices: ["scope_host_not_applied"] });
		expect(scopeToFilters(scope, "traffic")).toEqual({ filters: [f("host", "is", "a.org"), f("page", "is", "/A/")], notices: ["scope_query_not_applied"] });
	});

	it("compiles to the same SQL as hand-written filters", async () => {
		const db: Db = { dialect: "sqlite", run: async () => ({ changes: 0 }), all: async () => [], batch: async () => {} };
		const cc = { db, site: "s", from: "2026-03-01", to: "2026-03-31", goals: [] };
		const scope = { v: 1 as const, host: [{ op: "is" as const, value: "a.org" }], path: [{ op: "prefix" as const, value: "/blog/" }], query: [{ op: "is" as const, value: "q" }] };
		expect(await compileTraffic(cc, scopeToFilters(scope, "traffic").filters)).toEqual(await compileTraffic(cc, [f("host", "is", "a.org"), f("page", "prefix", "/blog/")]));
		expect(await compileSearch(cc, scopeToFilters(scope, "search").filters)).toEqual(await compileSearch(cc, [f("page", "prefix", "/blog/"), f("query", "is", "q")]));
		expect(await compileTraffic(cc, scopeToFilters(scope, "traffic").filters)).toMatchSnapshot();
	});
});

describe("scopeSummary and escapeRegex", () => {
	it("summaries", () => {
		const r = (op: "is" | "prefix" | "regex", value: string) => ({ op, value });
		expect({
			none: scopeSummary(undefined),
			empty: scopeSummary({ v: 1 }),
			page: scopeSummary({ v: 1, path: [r("is", "/blog/x")] }),
			prefix: scopeSummary({ v: 1, path: [r("prefix", "/blog/")] }),
			regex: scopeSummary({ v: 1, path: [r("regex", "^/blog/\\d+")] }),
			host: scopeSummary({ v: 1, host: [r("is", "shop.example.com")] }),
			hosts: scopeSummary({ v: 1, host: [r("regex", "^shop\\.")] }),
			query: scopeSummary({ v: 1, query: [r("is", "how to x")] }),
			terms: scopeSummary({ v: 1, query: [r("is", "a"), r("is", "b"), r("is", "c")] }),
			queries: scopeSummary({ v: 1, query: [r("regex", "^how to")] }),
			rules: scopeSummary({ v: 1, path: [r("is", "/a"), r("is", "/b"), r("prefix", "/c"), r("regex", "d")] }),
			two: scopeSummary({ v: 1, path: [r("is", "/a"), r("is", "/b")] }),
			joined: scopeSummary({ v: 1, host: [r("is", "a.org")], path: [r("prefix", "/blog/")] }),
		}).toMatchSnapshot();
	});
	it("escapeRegex", () => {
		expect(new RegExp(`^${escapeRegex("a.b*c(d)[e]?/f")}$`).test("a.b*c(d)[e]?/f")).toBe(true);
	});
});
