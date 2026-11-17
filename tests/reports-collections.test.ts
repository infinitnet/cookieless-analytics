/** Per-collection report over a seeded rollup; hand sums in comments. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { classifyPath, compilePattern } from "../src/content/path.js";
import { clearCollectionsCache, COLLECTIONS_CACHE_SECONDS, loadCollections } from "../src/query/reports/collections.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { QuerySchema } from "../src/query/filters.js";
import { schemaDb } from "./helpers.js";

const SETTINGS = { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 };
const COLLECTIONS = [
	{ slug: "posts", urlPattern: "/blog/{slug}" },
	// Overlaps `/blog/{slug}` on two segment paths; fewer literal characters, so posts wins there.
	{ slug: "sections", urlPattern: "/{section}/{slug}" },
	{ slug: "pages", urlPattern: null },
];
// [day, key, pageviews, visitors, sessions, engaged_ms, hits]
const PAGES: Array<[string, string, number, number, number, number, number]> = [
	["2025-01-10", "/blog/a", 10, 6, 7, 20_000, 10],
	["2025-01-11", "/blog/a", 5, 3, 4, 10_000, 5],
	["2025-01-10", "/fr/blog/b", 4, 2, 2, 8_000, 4],
	["2025-01-10", "/guides/x", 6, 5, 5, 6_000, 6],
	["2025-01-10", "/pages/about", 3, 3, 3, 0, 3],
	["2025-01-10", "/a/b/c", 2, 2, 2, 0, 2],
	// The folded top 500 rest: no path, left out of every row.
	["2025-01-10", "(other)", 7, 7, 7, 0, 7],
];

describe("collections", () => {
	let rc: ReportCtx;
	beforeAll(async () => {
		const env = await schemaDb();
		const ins = env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, pageviews, visitors, sessions, engaged_ms, hits) VALUES ('default', ?, 'page', ?, ?, ?, ?, ?, ?)");
		for (const p of PAGES) ins.run(...p);
		const all = env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, pageviews) VALUES ('default', ?, 'all', 'all', ?)");
		// Day totals: 32 + 5 = 37 pageviews, equal to every page row including the folded one.
		all.run("2025-01-10", 32);
		all.run("2025-01-11", 5);
		rc = { db: env.db, site: "default", settings: SETTINGS, now: 0, goals: [], funnels: {}, annotations: [], collections: COLLECTIONS, rawFrom: "2026-01-01", summaryThrough: "2026-12-31" };
	});
	beforeEach(() => clearReportCache());
	const run = (over: Partial<ReportCtx> = {}, filters: unknown[] = []) =>
		runReport({ ...rc, ...over }, { report: "collections", query: QuerySchema.parse({ from: "2025-01-01", to: "2025-01-31", filters }) });

	it("classifier: anchored, most literal characters wins, locale prefix, (other)", () => {
		const p = COLLECTIONS.map((c) => compilePattern(c.slug, c.urlPattern));
		expect(classifyPath("/blog/a", p)).toBe("posts");
		expect(classifyPath("/fr/blog/a", p)).toBe("posts");
		expect(classifyPath("/guides/x", p)).toBe("sections");
		expect(classifyPath("/pages/about", p)).toBe("pages");
		expect(classifyPath("/blog/a/extra", p)).toBe("(other)");
		expect(classifyPath("/", p)).toBe("(other)");
	});

	it("rows equal hand sums per collection; coverage is the classified share of the day totals", async () => {
		const r = await run();
		const rows = r.data.rows?.map(({ key, pageviews, visitors, sessions, avg_time, pages }) => ({ key, pageviews, visitors, sessions, avg_time, pages }));
		expect(rows).toEqual([
			// posts: 10 + 5 + 4 views, 6 + 3 + 2 page visitors, 7 + 4 + 2 sessions, 38 s over 19 hits.
			{ key: "posts", pageviews: 19, visitors: 11, sessions: 13, avg_time: 2, pages: 2 },
			// /guides/x and /pages/about both match `/{section}/{slug}` (2 literals) but /pages/about matches `/pages/{slug}` (7).
			{ key: "sections", pageviews: 6, visitors: 5, sessions: 5, avg_time: 1, pages: 1 },
			{ key: "pages", pageviews: 3, visitors: 3, sessions: 3, avg_time: 0, pages: 1 },
			{ key: "(other)", pageviews: 2, visitors: 2, sessions: 2, avg_time: 0, pages: 1 },
		]);
		// (19 + 6 + 3 + 2) / 37.
		expect(r.data.totals).toEqual({ pageviews: 30, day_pageviews: 37, coverage: 0.8108 });
		expect(r.notices).toEqual([]);
	});

	it("filters are not applied and noticed; a client site answers not_available_for_site", async () => {
		const f = await run({}, [{ dim: "country", op: "is", values: ["DE"] }]);
		expect(f.data.notices).toEqual(["filters_not_applied"]);
		expect(f.data.rows?.[0]?.pageviews).toBe(19);
		const c = await run({ collections: null });
		expect(c.data).toEqual({ rows: [], notices: ["not_available_for_site"] });
	});

	it("the collection list keeps routable collections and is cached for five minutes", async () => {
		clearCollectionsCache();
		let calls = 0;
		const schema = {
			listCollections: async () => (
				calls++,
				[
					{ slug: "posts", urlPattern: "/blog/{slug}", routable: true },
					{ slug: "menus", urlPattern: null, routable: false },
				]
			),
		};
		expect(await loadCollections(schema, 0)).toEqual([{ slug: "posts", urlPattern: "/blog/{slug}" }]);
		await loadCollections(schema, COLLECTIONS_CACHE_SECONDS * 1000 - 1);
		expect(calls).toBe(1);
		await loadCollections(schema, COLLECTIONS_CACHE_SECONDS * 1000);
		expect(calls).toBe(2);
		expect(await loadCollections(undefined)).toEqual([]);
		clearCollectionsCache();
	});
});
