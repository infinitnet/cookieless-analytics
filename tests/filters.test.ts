import { describe, expect, it } from "vitest";
import { compileTraffic } from "../src/query/compile.js";
import { DIM_NAMES, type Filter, FilterSchema, FunnelStepsSchema, GoalSchema, QuerySchema, SEARCH_DIMS, TRAFFIC_DIMS } from "../src/query/filters.js";
import { putHits, schemaDb } from "./helpers.js";

describe("zod model", () => {
	it("rejects injection strings in dim and prop names", () => {
		for (const dim of ["page; DROP TABLE ca_sessions", "s.sid", "path'", "PAGE", "__proto__"]) expect(FilterSchema.safeParse({ dim, op: "is", values: ["x"] }).success, dim).toBe(false);
		for (const prop of ["a'b", "a.b", "$.x", "x) OR 1=1 --", "", "a".repeat(33)])
			expect(FilterSchema.safeParse({ dim: "event_prop", op: "is", values: ["x"], prop }).success, prop).toBe(false);
		expect(FilterSchema.safeParse({ dim: "page", op: "is", values: ["x"], prop: "plan" }).success).toBe(false);
		expect(FilterSchema.safeParse({ dim: "event_prop", op: "is", values: ["x"] }).success).toBe(false);
		expect(FilterSchema.safeParse({ dim: "page", op: "like", values: ["x"] }).success).toBe(false);
		expect(FilterSchema.safeParse({ dim: "page", op: "is", values: [] }).success).toBe(false);
		expect(FilterSchema.safeParse({ dim: "page", op: "is", values: ["x"], sql: "1" }).success).toBe(false);
	});

	it("validates query ranges and defaults", () => {
		expect(QuerySchema.parse({ from: "2026-03-10", to: "2026-03-12" })).toEqual({ from: "2026-03-10", to: "2026-03-12", filters: [], compare: "none", granularity: "auto" });
		expect(QuerySchema.safeParse({ from: "2026-03-12", to: "2026-03-10" }).success).toBe(false);
		expect(QuerySchema.safeParse({ from: "2023-01-01", to: "2026-03-10" }).success).toBe(false);
		expect(QuerySchema.safeParse({ from: "2026-13-01", to: "2026-13-02" }).success).toBe(false);
		expect(QuerySchema.safeParse({ from: "2026-03-10", to: "2026-03-10", site: "Other Site" }).success).toBe(false);
		expect(QuerySchema.safeParse({ from: "2026-03-10", to: "2026-03-10", extra: 1 }).success).toBe(false);
	});
});

describe("dimension maps", () => {
	it("cover every traffic and search dimension with plain column identifiers", () => {
		expect(Object.keys(TRAFFIC_DIMS).sort()).toEqual(
			["page", "entry", "exit", "channel", "source", "ref_host", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "host", "country", "region", "device", "browser", "os", "lang", "event", "event_prop", "goal"].sort(),
		);
		expect(Object.keys(SEARCH_DIMS).sort()).toEqual(["country", "device", "page", "query", "source"]);
		for (const d of [...Object.values(TRAFFIC_DIMS), ...Object.values(SEARCH_DIMS)]) expect(d.column).toMatch(/^[a-z_]+$/);
		expect(DIM_NAMES).toContain("query");
	});

	it("validates goals and funnel steps", () => {
		expect(GoalSchema.safeParse({ name: "G", type: "page", match: "regex", value: "^/a" }).success).toBe(true);
		expect(GoalSchema.safeParse({ name: "G", type: "visit", match: "is", value: "/" }).success).toBe(false);
		const step = { type: "page", match: "is", value: "/" };
		expect(FunnelStepsSchema.safeParse([step]).success).toBe(false);
		expect(FunnelStepsSchema.safeParse(Array(6).fill(step)).success).toBe(true);
		expect(FunnelStepsSchema.safeParse(Array(7).fill(step)).success).toBe(false);
	});
});

describe("negated hit filters with unattributed hits", () => {
	const GOALS = [{ name: "Bought", type: "event" as const, match: "is" as const, value: "purchase" }];
	const cases: Filter[] = [
		{ dim: "event", op: "is_not", values: ["purchase"] },
		{ dim: "goal", op: "is_not", values: ["Bought"] },
		{ dim: "event_prop", op: "is_not", values: ["pro"], prop: "plan" },
	];
	const hit = (env: Awaited<ReturnType<typeof schemaDb>>, id: string, sid: string | null, name: string, props: string | null) =>
		putHits(env.raw, [{ id, sid, ts: 0, day: "2026-03-11", kind: "ev", path: "/x", name, props, val: 10, cur: "USD" }]);
	async function run(f: Filter, unattributed: boolean) {
		const env = await schemaDb();
		for (const sid of ["aaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbb"])
			env.raw
				.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, channel) VALUES ('default', ?, 'k', '2026-03-11', 10, 0, 0, 1800, '/', '/', 1, 0, 'Direct')")
				.run(sid);
		hit(env, "a.1", "aaaaaaaaaaaaaaaaaaaa", "purchase", '{"plan":"pro"}');
		if (unattributed) hit(env, "u.1", null, "purchase", '{"plan":"pro"}');
		const ctx = { db: env.db, site: "default", from: "2026-03-10", to: "2026-03-12", goals: GOALS };
		const sel = async (g: Filter) => {
			const c = await compileTraffic(ctx, [g]);
			return (await env.db.all<{ sid: string }>(`SELECT s.sid FROM ca_sessions s WHERE ${c.session.sql} ORDER BY s.sid`, c.session.params)).map((r) => r.sid);
		};
		return { neg: await sel(f), pos: await sel({ ...f, op: "is" } as Filter) };
	}

	for (const f of cases)
		it(`${f.dim} is_not keeps the session without the event, with or without a sid NULL hit`, async () => {
			const without = await run(f, false);
			const withNull = await run(f, true);
			expect(without).toEqual({ neg: ["bbbbbbbbbbbbbbbbbbbb"], pos: ["aaaaaaaaaaaaaaaaaaaa"] });
			expect(withNull).toEqual(without);
		});
});

describe("revenue filters", () => {
	const A = "aaaaaaaaaaaaaaaaaaaa";
	const B = "bbbbbbbbbbbbbbbbbbbb";
	const C = "cccccccccccccccccccc";
	const D = "dddddddddddddddddddd";
	async function env4(site = "default") {
		const env = await schemaDb();
		for (const sid of [A, B, C, D])
			env.raw
				.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, channel) VALUES (?, ?, 'k', '2026-03-11', 10, 0, 0, 1800, '/', '/', 1, 0, 'Direct')")
				.run(site, sid);
		const hit = (id: string, sid: string | null, val: number, cur: string) => putHits(env.raw, [{ site, id, sid, ts: 0, day: "2026-03-11", kind: "ev", path: "/x", name: "purchase", val, cur }]);
		// A: 30 + 30 USD, B: 20 USD, C: 80 EUR, D: no revenue; plus an unattributed 500 USD hit.
		hit("o.1", A, 30, "USD");
		hit("o.2", A, 30, "USD");
		hit("o.3", B, 20, "USD");
		hit("o.4", C, 80, "EUR");
		hit("o.5", null, 500, "USD");
		return env;
	}
	const sel = async (env: Awaited<ReturnType<typeof schemaDb>>, f: Filter, currency = "USD", site = "default") => {
		const c = await compileTraffic({ db: env.db, site, from: "2026-03-10", to: "2026-03-12", goals: [], currency }, [f]);
		return (await env.db.all<{ sid: string }>(`SELECT s.sid FROM ca_sessions s WHERE s.site = ? AND ${c.session.sql} ORDER BY s.sid`, [site, ...c.session.params])).map((r) => r.sid[0]);
	};

	it("currency is and is_not; a sid NULL hit does not empty is_not", async () => {
		const env = await env4();
		expect(await sel(env, { dim: "currency", op: "is", values: ["EUR"] })).toEqual(["c"]);
		expect(await sel(env, { dim: "currency", op: "is", values: ["usd"] })).toEqual(["a", "b"]);
		expect(await sel(env, { dim: "currency", op: "is_not", values: ["EUR"] })).toEqual(["a", "b", "d"]);
	});

	it("revenue gte, gt, lt, lte with and without prop; lt includes sessions without revenue only above zero", async () => {
		const env = await env4();
		expect(await sel(env, { dim: "revenue", op: "gte", values: ["50"] })).toEqual(["a"]);
		expect(await sel(env, { dim: "revenue", op: "gt", values: ["60"] })).toEqual([]);
		expect(await sel(env, { dim: "revenue", op: "gte", values: ["50"], prop: "EUR" })).toEqual(["c"]);
		// The unattributed 500 USD hit does not empty the NOT IN form.
		expect(await sel(env, { dim: "revenue", op: "lt", values: ["50"] })).toEqual(["b", "c", "d"]);
		expect(await sel(env, { dim: "revenue", op: "lte", values: ["20"] })).toEqual(["b", "c", "d"]);
		expect(await sel(env, { dim: "revenue", op: "lt", values: ["0"] })).toEqual([]);
		expect(await sel(env, { dim: "revenue", op: "lte", values: ["0"] })).toEqual([]);
	});

	it("an absent prop resolves to the site default: two sites with different defaults", async () => {
		const usd = await env4("default");
		const eur = await env4("shop");
		expect(await sel(usd, { dim: "revenue", op: "gte", values: ["50"] }, "USD")).toEqual(["a"]);
		expect(await sel(eur, { dim: "revenue", op: "gte", values: ["50"] }, "EUR", "shop")).toEqual(["c"]);
	});

	it("rejects numeric ops on other dims, malformed values and unknown codes with invalid_filter", async () => {
		const env = await env4();
		const bad: Filter[] = [
			{ dim: "channel", op: "gt", values: ["5"] },
			{ dim: "revenue", op: "is", values: ["5"] },
			{ dim: "revenue", op: "gte", values: ["5,00"] },
			{ dim: "revenue", op: "gte", values: ["-1"] },
			{ dim: "revenue", op: "gte", values: ["1", "2"] },
			{ dim: "revenue", op: "gte", values: ["1.0001"] },
			{ dim: "revenue", op: "gte", values: ["1"], prop: "ZZZ" },
			{ dim: "currency", op: "contains", values: ["EU"] },
			{ dim: "currency", op: "is", values: ["EURO"] },
		];
		for (const f of bad) await expect(sel(env, f), JSON.stringify(f)).rejects.toMatchObject({ code: "invalid_filter" });
		expect(FilterSchema.safeParse({ dim: "revenue", op: "gte", values: ["50"], prop: "EUR" }).success).toBe(true);
		expect(FilterSchema.safeParse({ dim: "channel", op: "is", values: ["x"], prop: "EUR" }).success).toBe(false);
	});

	it("a stored segment of revenue filters round trips", () => {
		const seg: Filter[] = [
			{ dim: "revenue", op: "gte", values: ["100"] },
			{ dim: "currency", op: "is", values: ["EUR"] },
		];
		expect(seg.map((f) => FilterSchema.parse(JSON.parse(JSON.stringify(f))))).toEqual(seg);
	});
});
