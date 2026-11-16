import { describe, expect, it } from "vitest";
import type { Db, Dialect } from "../src/db/adapter.js";
import { type CompileCtx, compileSearch, compileTraffic, inList, QueryError, REGEX_DISTINCT_LIMIT } from "../src/query/compile.js";
import { type Filter, OPS, SEARCH_DIMS, TRAFFIC_DIMS } from "../src/query/filters.js";
import { schemaDb } from "./helpers.js";

/** Db stub: regex expansion reads these distinct values; every statement is recorded. */
function fakeDb(dialect: Dialect, distinct: string[] = ["/a", "/b", "DE", "US", "200", "404"]): Db & { seen: string[] } {
	const seen: string[] = [];
	return {
		dialect,
		seen,
		run: async () => ({ changes: 0 }),
		all: async <T,>(sql: string) => {
			seen.push(sql);
			return distinct.map((v) => ({ v })) as T[];
		},
		batch: async () => {},
	};
}

const GOALS = [
	{ name: "Pricing", type: "page" as const, match: "prefix" as const, value: "/pricing" },
	{ name: "Signup", type: "event" as const, match: "is" as const, value: "signup", props: { plan: "pro" } },
	{ name: "Leave", type: "outbound" as const, match: "contains" as const, value: "example" },
];
const ctxFor = (db: Db): CompileCtx => ({ db, site: "default", from: "2026-03-10", to: "2026-03-12", goals: GOALS });

const VALUES: Record<string, string[]> = { regex: ["^/a$", "^D"], not_regex: ["^/a$"], status: ["404"] };
const filter = (dim: string, op: (typeof OPS)[number]): Filter =>
	({ dim, op, values: dim === "status" && !op.includes("regex") ? ["404", "500"] : (VALUES[op] ?? ["/a", "x_y%"]), ...(dim === "event_prop" ? { prop: "plan" } : {}) }) as Filter;

describe.each(["sqlite", "postgres"] as const)("compileTraffic snapshots (%s)", (dialect) => {
	it("every op on one dim per scope, and is on every dim", async () => {
		const out: Record<string, unknown> = {};
		for (const dim of ["channel", "page", "event_prop", "status"])
			for (const op of OPS) out[`${dim} ${op}`] = await compileTraffic(ctxFor(fakeDb(dialect)), [filter(dim, op)]);
		for (const dim of Object.keys(TRAFFIC_DIMS)) {
			const f = dim === "goal" ? ({ dim, op: "is", values: ["Pricing", "Signup", "Leave"] } as Filter) : filter(dim, "is");
			out[`${dim} is`] = await compileTraffic(ctxFor(fakeDb(dialect)), [f]);
		}
		out["goal is_not"] = await compileTraffic(ctxFor(fakeDb(dialect)), [{ dim: "goal", op: "is_not", values: ["Signup"] }]);
		expect(out).toMatchSnapshot();
		// Every hit filter is an EXISTS over the visit's own entries: no second scan, no sid list.
		const sql = JSON.stringify(out);
		const joins = sql.match(/EXISTS \(SELECT 1 FROM json_?b?_?each\(s\.hits\) AS x/g) ?? [];
		expect(joins.length).toBeGreaterThan(10);
		expect(sql).not.toMatch(/ca_hits|s\.sid (NOT )?IN/);
	});

	it("search dims on every op", async () => {
		const out: Record<string, unknown> = {};
		for (const dim of Object.keys(SEARCH_DIMS)) for (const op of OPS) out[`${dim} ${op}`] = await compileSearch(ctxFor(fakeDb(dialect)), [filter(dim, op)]);
		expect(out).toMatchSnapshot();
	});
});

describe("compiled SQL runs on SQLite", () => {
	it("executes every traffic filter shape against the real schema", async () => {
		const env = await schemaDb();
		for (const dim of Object.keys(TRAFFIC_DIMS))
			for (const op of OPS) {
				if (dim === "goal" && op.includes("regex")) continue;
				const f = dim === "goal" ? ({ dim, op, values: ["Pricing", "Signup", "Leave"] } as Filter) : filter(dim, op);
				const c = await compileTraffic(ctxFor(env.db), [f]);
				await env.db.all(`SELECT COUNT(*) AS n FROM ca_sessions s WHERE ${c.session.sql}`, c.session.params);
				await env.db.all(`SELECT COUNT(*) AS n FROM ca_sessions s CROSS JOIN json_each(s.hits) AS h WHERE (${c.pv.sql}) AND (${c.ev.sql})`, [...c.pv.params, ...c.ev.params]);
				await env.db.all(`SELECT COUNT(*) AS n FROM ca_srv h WHERE ${c.srv.sql}`, c.srv.params);
			}
		for (const dim of Object.keys(SEARCH_DIMS))
			for (const op of OPS) {
				const c = await compileSearch(ctxFor(env.db), [filter(dim, op)]);
				await env.db.all(`SELECT COUNT(*) AS n FROM ca_search_daily d WHERE ${c.pred.sql}`, c.pred.params);
			}
	});
});

describe("chunked IN lists", () => {
	it("splits 250 values into 3 chunks with one bound parameter each, and matches on SQLite", async () => {
		const values = Array.from({ length: 250 }, (_, i) => `/p${i}`);
		const f = inList("sqlite", "s.entry_path", values);
		expect(f.params).toHaveLength(3);
		expect(f.sql.match(/json_each\(\?\)/g)).toHaveLength(3);
		expect(JSON.parse(f.params[2] as string)).toHaveLength(70);
		expect(inList("postgres", "h.status", [404, 500], true).sql).toBe("h.status IN (SELECT CAST(jsonb_array_elements_text(CAST(? AS jsonb)) AS BIGINT))");

		const env = await schemaDb();
		env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, pageviews) VALUES ('default', 'a', 'v', '2026-03-10', 0, 0, 0, 1800, '/p200', 1)").run();
		const c = await compileTraffic(ctxFor(env.db), [{ dim: "entry", op: "is", values }]);
		expect(await env.db.all(`SELECT sid FROM ca_sessions s WHERE ${c.session.sql}`, c.session.params)).toEqual([{ sid: "a" }]);
		const n = await compileTraffic(ctxFor(env.db), [{ dim: "entry", op: "is_not", values }]);
		expect(await env.db.all(`SELECT sid FROM ca_sessions s WHERE ${n.session.sql}`, n.session.params)).toEqual([]);
	});

	it("rejects filters that would exceed the parameter budget", async () => {
		const many = Array.from({ length: 100 }, (_, i) => `x${i}`);
		await expect(compileTraffic(ctxFor(fakeDb("sqlite")), [{ dim: "page", op: "contains", values: many }])).rejects.toMatchObject({ code: "too_many_values" });
	});
});

describe("regex expansion", () => {
	it("returns the typed narrow error above 5000 distinct values", async () => {
		const env = await schemaDb();
		env.raw
			.prepare(
				`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 6000)
INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, pageviews) SELECT 'default', 's' || i, 'v', '2026-03-10', 0, 0, 0, 1800, '/p' || i, 1 FROM n`,
			)
			.run();
		const err = await compileTraffic(ctxFor(env.db), [{ dim: "entry", op: "regex", values: ["^/p1"] }]).catch((e) => e);
		expect(err).toBeInstanceOf(QueryError);
		expect(err.code).toBe("narrow_filter");
		expect(err.message).toContain(String(REGEX_DISTINCT_LIMIT));
	});

	it("returns the narrow error above 2000 matches and expands small matches into IN chunks", async () => {
		const many = Array.from({ length: 2500 }, (_, i) => `/p${i}`);
		await expect(compileTraffic(ctxFor(fakeDb("sqlite", many)), [{ dim: "entry", op: "regex", values: ["^/p"] }])).rejects.toMatchObject({ code: "narrow_filter" });
		const c = await compileTraffic(ctxFor(fakeDb("sqlite", many)), [{ dim: "entry", op: "regex", values: ["^/p1\\d$"] }]);
		expect(JSON.parse(c.session.params[0] as string)).toEqual(["/p10", "/p11", "/p12", "/p13", "/p14", "/p15", "/p16", "/p17", "/p18", "/p19"]);
		const none = await compileTraffic(ctxFor(fakeDb("sqlite", many)), [{ dim: "entry", op: "regex", values: ["^/zzz"] }]);
		expect(none.session.sql).toBe("(0 = 1)");
	});

	it("never pushes a regex to SQL and rejects unsafe patterns", async () => {
		const db = fakeDb("sqlite");
		const c = await compileTraffic(ctxFor(db), [{ dim: "country", op: "regex", values: ["^D"] }]);
		expect(c.session.sql).not.toMatch(/REGEXP|~/);
		expect(db.seen[0]).toMatch(/^SELECT DISTINCT t\.v AS v FROM \(SELECT s\.country AS v FROM ca_sessions s WHERE/);
		expect(db.seen[0]).toContain("LIMIT 5001");
		await expect(compileTraffic(ctxFor(fakeDb("sqlite")), [{ dim: "country", op: "regex", values: ["(a+)+"] }])).rejects.toMatchObject({ code: "invalid_regex" });
	});
});

describe.each(["sqlite", "postgres"] as const)("revenue filter snapshots (%s)", (dialect) => {
	it("currency and revenue compile to semi-joins with sid IS NOT NULL and no inlined value", async () => {
		const fs: Filter[] = [
			{ dim: "currency", op: "is", values: ["EUR"] },
			{ dim: "currency", op: "is_not", values: ["EUR", "USD"] },
			{ dim: "revenue", op: "gte", values: ["50"] },
			{ dim: "revenue", op: "gt", values: ["50"], prop: "EUR" },
			{ dim: "revenue", op: "lt", values: ["49.9"] },
			{ dim: "revenue", op: "lte", values: ["0"] },
		];
		const out: Record<string, unknown> = {};
		for (const f of fs) {
			const c = await compileTraffic({ ...ctxFor(fakeDb(dialect)), currency: "USD" }, [f]);
			out[`${f.dim} ${f.op} ${f.values.join(",")}`] = c;
			expect(c.session.sql).toContain("x.sid IS NOT NULL");
			expect(c.session.sql).not.toMatch(/EUR|USD|49\.9|\b50\b/);
		}
		expect(out).toMatchSnapshot();
	});
});
