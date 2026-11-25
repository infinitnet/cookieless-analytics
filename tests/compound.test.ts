/**
 * `db/compound.ts`: the term counter the test databases use to refuse what D1 refuses (more than 5 terms in one compound
 * SELECT), and the helper that runs a union of any number of parts in statements within that limit.
 */
import { describe, expect, it } from "vitest";
import { assertCompound, COMPOUND_ERROR, MAX_COMPOUND_TERMS, maxCompoundTerms, type SelectPart, unionAll, unionAllChunked, unionAllStatements, unionGroups, unionStatements } from "../src/db/compound.js";
import { fakeD1 } from "./d1.helpers.js";
import { fromD1 } from "../src/db/d1.js";
import { memoryDb } from "./helpers.js";

const sel = (n: number, op = "UNION ALL") => Array.from({ length: n }, (_, i) => `SELECT ${i} AS n`).join(` ${op} `);

describe("maxCompoundTerms", () => {
	it("counts the terms of a top-level compound, one for a plain SELECT", () => {
		expect(maxCompoundTerms("SELECT 1")).toBe(1);
		expect(maxCompoundTerms(sel(5))).toBe(5);
		expect(maxCompoundTerms(sel(6))).toBe(6);
		expect(maxCompoundTerms(sel(21))).toBe(21);
		// Every operator counts: UNION, UNION ALL, INTERSECT, EXCEPT, in any case.
		expect(maxCompoundTerms("SELECT 1 union SELECT 2 Intersect SELECT 3 except SELECT 4 UNION ALL SELECT 5 UNION SELECT 6")).toBe(6);
	});

	it("counts each parenthesized subquery on its own", () => {
		// Three subqueries of 4 terms each, joined by 3 terms at the top: the largest compound has 4 terms.
		const four = `(${sel(4)})`;
		expect(maxCompoundTerms(`SELECT * FROM ${four} a UNION ALL SELECT * FROM ${four} b UNION ALL SELECT * FROM ${four} c`)).toBe(4);
		// A nested subquery of 6 inside a plain SELECT still fails.
		expect(maxCompoundTerms(`SELECT * FROM (SELECT * FROM (${sel(6)}) x) y`)).toBe(6);
		// Sibling subqueries of 3 each at the same level are separate compounds, not one of 6.
		expect(maxCompoundTerms(`SELECT (SELECT COUNT(*) FROM (${sel(3)})), (SELECT COUNT(*) FROM (${sel(3)}))`)).toBe(3);
		expect(maxCompoundTerms(`SELECT 1 WHERE 1 IN (${sel(3)}) AND 2 IN (${sel(5)})`)).toBe(5);
	});

	it("counts each CTE body on its own, and the statement after the CTEs", () => {
		expect(maxCompoundTerms(`WITH e AS (${sel(2)}), i AS (${sel(2)}) ${sel(5)}`)).toBe(5);
		expect(maxCompoundTerms(`WITH e AS (${sel(6)}) SELECT * FROM e`)).toBe(6);
		expect(maxCompoundTerms(`WITH e AS (${sel(2)}) ${sel(15)}`)).toBe(15);
		// The recursive site scan: two terms.
		expect(maxCompoundTerms("WITH RECURSIVE s(site) AS (SELECT MIN(site) FROM t UNION ALL SELECT (SELECT MIN(site) FROM t WHERE site > s.site) FROM s WHERE s.site IS NOT NULL) SELECT site FROM s")).toBe(2);
	});

	it("skips string literals, quoted identifiers and comments that hold the operator words", () => {
		expect(maxCompoundTerms("SELECT 'a UNION b UNION c UNION d UNION e UNION f' AS x")).toBe(1);
		expect(maxCompoundTerms("SELECT 'it''s ) UNION (' AS x UNION SELECT 'b'")).toBe(2);
		expect(maxCompoundTerms(`SELECT "union" , "a "" UNION b" FROM "t UNION" UNION SELECT 1, 2 FROM t`)).toBe(2);
		expect(maxCompoundTerms("SELECT `union`, [EXCEPT ( ] FROM t UNION SELECT 1, 2")).toBe(2);
		expect(maxCompoundTerms(`SELECT 1 -- UNION SELECT 2 UNION SELECT 3\n UNION SELECT 2 /* UNION ( SELECT 4 */`)).toBe(2);
		// Identifiers that only contain the words.
		expect(maxCompoundTerms("SELECT union_id, except_at, my_intersect FROM unions")).toBe(1);
	});

	it("treats a multi-row VALUES list as one term and separate statements of a script apart", () => {
		expect(maxCompoundTerms("INSERT INTO t VALUES (1), (2), (3), (4), (5), (6), (7)")).toBe(1);
		expect(maxCompoundTerms(`${sel(3)}; ${sel(4)}; SELECT 1`)).toBe(4);
	});

	it("assertCompound throws D1's own error past 5 terms", () => {
		expect(MAX_COMPOUND_TERMS).toBe(5);
		expect(() => assertCompound(sel(5))).not.toThrow();
		expect(() => assertCompound(sel(6))).toThrow(COMPOUND_ERROR);
		expect(COMPOUND_ERROR).toContain("too many terms in compound SELECT");
	});
});

describe("unionAllChunked", () => {
	const parts = (n: number, params = 1): SelectPart[] => Array.from({ length: n }, (_, i) => ({ sql: `SELECT ${i} AS n, ${Array.from({ length: params }, () => "?").join(" + ")} AS p`, params: Array.from({ length: params }, () => i) }));

	it("uses the fewest statements of at most 5 terms, in order", () => {
		expect(unionGroups(parts(21)).map((g) => g.length)).toEqual([5, 5, 5, 5, 1]);
		expect(unionGroups(parts(5)).map((g) => g.length)).toEqual([5]);
		expect(unionGroups(parts(0))).toEqual([]);
		expect(unionStatements(21)).toBe(5);
		expect(unionStatements(9)).toBe(2);
		expect(unionStatements(0)).toBe(0);
		for (const s of unionAllStatements(parts(21))) expect(maxCompoundTerms(s.sql)).toBeLessThanOrEqual(MAX_COMPOUND_TERMS);
	});

	it("keeps each statement within the bound parameter budget, head included", () => {
		// 30 parameters a part: three fit 100, the fourth would not.
		expect(unionGroups(parts(7, 30)).map((g) => g.length)).toEqual([3, 3, 1]);
		expect(unionGroups(parts(7, 30), { maxParams: 90 }).map((g) => g.length)).toEqual([3, 3, 1]);
		expect(unionGroups(parts(7, 30), { head: { sql: "WITH x AS (SELECT ?)", params: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } }).map((g) => g.length)).toEqual([2, 2, 2, 1]);
		const st = unionAllStatements(parts(6, 2), { head: { sql: "WITH h AS (SELECT ? AS v)", params: ["h"] } });
		expect(st).toHaveLength(2);
		for (const s of st) {
			expect(s.sql.startsWith("WITH h AS (SELECT ? AS v) SELECT 0 AS n") || s.sql.startsWith("WITH h AS (SELECT ? AS v) SELECT 5 AS n")).toBe(true);
			expect(s.params[0]).toBe("h");
		}
	});

	it("returns the rows of every part in order, on the D1 test databases", async () => {
		const { db } = memoryDb();
		const rows = await unionAllChunked<{ n: number; p: number }>(db, parts(12));
		expect(rows.map((r) => r.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		expect(rows.map((r) => r.p)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		expect(await unionAllChunked(db, [])).toEqual([]);
		// The same parts as one statement are refused there, as on D1.
		const one = unionAllStatements(parts(12));
		expect(one).toHaveLength(3);
		await expect(db.all(parts(12).map((p) => p.sql).join(" UNION ALL "), parts(12).flatMap((p) => p.params))).rejects.toThrow(/too many terms in compound SELECT/);
		const d1 = fromD1(fakeD1());
		expect((await unionAllChunked(d1, parts(12))).length).toBe(12);
		await expect(d1.all(sel(6))).rejects.toThrow(/too many terms in compound SELECT/);
		// Without the limit (a baseline database), the single statement runs.
		const plain = memoryDb({ compoundLimit: false });
		expect(await plain.db.all(sel(6))).toHaveLength(6);
	});

	it("unionAll joins a fixed union of at most 5 parts and refuses more", () => {
		expect(unionAll(parts(2)).sql).toBe("SELECT 0 AS n, ? AS p UNION ALL SELECT 1 AS n, ? AS p");
		expect(unionAll(parts(2), "UNION").sql).toContain(" UNION SELECT 1");
		expect(unionAll(parts(5)).params).toEqual([0, 1, 2, 3, 4]);
		expect(() => unionAll(parts(6))).toThrow(/6 parts/);
		expect(() => unionAll([])).toThrow();
	});
});
