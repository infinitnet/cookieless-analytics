/**
 * Pair rows (dim x channel, country or device): the fold to the cap of a family, the pair budget against the
 * summary share of each profile, and the pair statements in both dialects. The equality of every pair with the
 * detailed report under that segment filter, and the fold on generated traffic, are in `rollup-close.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { CUBE_CAP, foldPairs, foldRevenue, foldTop, JOURNEY_CAP, LINK_TOP_N, OTHER, PAIR_DIMS, PAIR_ROWS, pairCap, SEGS, summaryUpsertSql, summaryVanishedSql, TOP_N } from "../src/query/rollup.js";
import { LINK_DIMS } from "../src/query/reports/links.js";
import { PROFILES, SUMMARY_SHARE } from "../src/settings.js";
import { STORAGE_SAFETY, SUMMARY_ROW_BYTES } from "../src/query/storage.js";

type R = { key: string; segkey: string; sessions: number; pageviews: number };
const add = (into: R, r: R) => {
	into.sessions += r.sessions;
	into.pageviews += r.pageviews;
};
const sum = (rows: R[], m: "sessions" | "pageviews", segkey?: string) => rows.filter((r) => segkey === undefined || r.segkey === segkey).reduce((a, r) => a + r[m], 0);

describe("folding a pair family", () => {
	// 3 segment values, 40 keys each; sessions fall with the key number, DE has the largest.
	const rows: R[] = ["DE", "FR", "US"].flatMap((segkey, s) => Array.from({ length: 40 }, (_, i) => ({ key: `/p${i}`, segkey, sessions: (40 - i) * (3 - s), pageviews: (40 - i) * 2 })));

	it("keeps a family under its cap as it is", () => {
		expect(foldPairs(rows, rows.length, (r) => r.sessions, add)).toBe(rows);
	});

	it.each([3, 10, 60, 119])("above the cap keeps at most %i rows and every total exact, per segment value too", (cap) => {
		const out = foldPairs(rows, cap, (r) => r.sessions, add);
		expect(out.length).toBeLessThanOrEqual(cap);
		for (const m of ["sessions", "pageviews"] as const) expect(sum(out, m), m).toBe(sum(rows, m));
		// A segment value with a kept row keeps its exact totals; the others are in `(other)` x `(other)`.
		const kept = new Set(out.filter((r) => r.key !== OTHER).map((r) => r.segkey));
		for (const v of kept) for (const m of ["sessions", "pageviews"] as const) expect(sum(out, m, v), `${v} ${m}`).toBe(sum(rows, m, v));
		const lost = ["DE", "FR", "US"].filter((v) => !kept.has(v));
		expect(sum(out, "sessions", OTHER)).toBe(lost.reduce((a, v) => a + sum(rows, "sessions", v), 0));
		// The top rows are kept: the largest row of DE always survives a cap above 2.
		expect(out.some((r) => r.key === "/p0" && r.segkey === "DE")).toBe(true);
		// The input is not changed.
		expect(rows[0]).toEqual({ key: "/p0", segkey: "DE", sessions: 120, pageviews: 80 });
	});

	it("a key that is literally (other) merges with the fold row: one row per primary key", () => {
		const withOther = [...rows, { key: OTHER, segkey: "DE", sessions: 500, pageviews: 7 }];
		const out = foldPairs(withOther, 10, (r) => r.sessions, add);
		const ids = out.map((r) => `${r.key}|${r.segkey}`);
		expect(new Set(ids).size).toBe(ids.length);
		expect(out.length).toBeLessThanOrEqual(10);
		for (const m of ["sessions", "pageviews"] as const) expect(sum(out, m, "DE"), m).toBe(sum(withOther, m, "DE"));
	});
});

describe("single dimension folds", () => {
	it("a key that is literally (other) folds too: one row per primary key, totals exact", () => {
		const base = { pageviews: 0, sessions: 0, visitors: 0, bounces: 0, engaged: 0, engaged_ms: 0, events: 0, hits: 0 };
		const rows = [OTHER, "a", "b", "c", "d"].map((key, i) => ({ ...base, dim: "utm_campaign" as const, key, sessions: 10 - i }));
		const out = foldTop(rows, 3, "sessions");
		expect(out.map((r) => r.key)).toEqual(["a", OTHER]);
		expect(out.reduce((a, r) => a + r.sessions, 0)).toBe(rows.reduce((a, r) => a + r.sessions, 0));
		const rev = Array.from({ length: 205 }, (_, i) => ({ day: "2026-06-10", dim: "source", key: i ? `s${i}` : OTHER, cur: "USD", orders: 300 - i, revenue: 1, sessions: 1 }));
		const folded = foldRevenue(rev);
		expect(folded.filter((r) => r.key === OTHER)).toHaveLength(1);
		expect(folded).toHaveLength(199);
		expect(folded.reduce((a, r) => a + r.orders, 0)).toBe(rev.reduce((a, r) => a + r.orders, 0));
	});
});

describe("pair budget", () => {
	it("splits the pair rows of a profile by fixed weights", () => {
		for (const profile of ["small", "standard", "dedicated"] as const) {
			// The link pairs (`link` x a segment) share the budget.
			const total = [...PAIR_DIMS, "link" as const].reduce((a, d) => a + SEGS.length * pairCap(profile, d), 0);
			expect(total, profile).toBeLessThanOrEqual(PAIR_ROWS[profile]);
			expect(total, profile).toBeGreaterThan(PAIR_ROWS[profile] * 0.95);
		}
		expect(pairCap("small", "page")).toBe(34);
		expect(pairCap("standard", "link")).toBe(192);
		expect(pairCap(undefined, "page")).toBe(pairCap("standard", "page"));
	});

	it("25 months of summaries at every cap fit the summary share of standard and dedicated", () => {
		// Single dimension rows, the two link families, the journey rows and the cube cells at their caps.
		const single = (profile: "standard" | "dedicated") =>
			Object.values(TOP_N).reduce((a, n) => a + n, 0) + LINK_DIMS.length * LINK_TOP_N + JOURNEY_CAP[profile].next + JOURNEY_CAP[profile].path3 + CUBE_CAP[profile];
		for (const profile of ["standard", "dedicated"] as const) {
			const bytes = (single(profile) + PAIR_ROWS[profile]) * SUMMARY_ROW_BYTES * STORAGE_SAFETY * 760;
			expect(bytes, profile).toBeLessThanOrEqual(PROFILES[profile].bytes * SUMMARY_SHARE);
		}
		// `small`: the pairs and the cube alone stay inside the share; the single dimension rows at their caps would not (see limits).
		expect((PAIR_ROWS.small + CUBE_CAP.small) * SUMMARY_ROW_BYTES * STORAGE_SAFETY * 760).toBeLessThan(PROFILES.small.bytes * SUMMARY_SHARE);
	});
});

describe("pair statements, both dialects", () => {
	const cols = ["dim", "key", "seg", "segkey", "pageviews"];
	const conflict = ["site", "dim", "seg", "day", "key", "segkey"];
	it("stores single and pair rows through one upsert with the segment columns", () => {
		expect(summaryUpsertSql("sqlite", "ca_rollup", cols, 4, conflict)).toBe(
			"INSERT INTO ca_rollup (site, day, dim, key, seg, segkey, pageviews) SELECT ?, ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]') FROM json_each(?) WHERE true ON CONFLICT (site, dim, seg, day, key, segkey) DO UPDATE SET pageviews = excluded.pageviews WHERE ca_rollup.pageviews IS NOT excluded.pageviews",
		);
		// Postgres: asserted as text only.
		expect(summaryUpsertSql("postgres", "ca_rollup", cols, 4, conflict)).toBe(
			"INSERT INTO ca_rollup (site, day, dim, key, seg, segkey, pageviews) SELECT ?, ?, value->>0, value->>1, value->>2, value->>3, CAST(value->>4 AS BIGINT) FROM jsonb_array_elements(CAST(? AS jsonb)) WHERE true ON CONFLICT (site, dim, seg, day, key, segkey) DO UPDATE SET pageviews = excluded.pageviews WHERE ca_rollup.pageviews IS DISTINCT FROM excluded.pageviews",
		);
	});

	it("deletes vanished pair keys only inside the pair ranges, never a single dimension row", () => {
		const key = "dim || '|' || seg || '|' || key || '|' || segkey";
		expect(summaryVanishedSql("sqlite", "ca_rollup", ["page", "goal"], key, SEGS)).toBe(
			"DELETE FROM ca_rollup WHERE site = ? AND dim IN ('page', 'goal') AND seg IN ('channel', 'country', 'device') AND day = ? AND dim || '|' || seg || '|' || key || '|' || segkey NOT IN (SELECT value FROM json_each(?))",
		);
		expect(summaryVanishedSql("postgres", "ca_revenue_daily", ["page"], `${key} || '|' || cur`, SEGS)).toBe(
			"DELETE FROM ca_revenue_daily WHERE site = ? AND dim IN ('page') AND seg IN ('channel', 'country', 'device') AND day = ? AND dim || '|' || seg || '|' || key || '|' || segkey || '|' || cur NOT IN (SELECT jsonb_array_elements_text(CAST(? AS jsonb)))",
		);
	});
});
