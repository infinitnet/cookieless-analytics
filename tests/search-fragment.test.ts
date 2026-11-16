/** Fragment URLs are one page: `/page`, `/page#toc` and `/page#faq` sum into `/page` at ingest and at report time. */
import { beforeAll, describe, expect, it } from "vitest";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { mapRow } from "../src/sources/gsc.js";
import { pageKeyFor } from "../src/sources/page-key.js";
import { mergeRows } from "../src/sources/store.js";
import { insertSearch, runner, seoCtx } from "./fixtures/seo.js";
import { schemaDb } from "./helpers.js";

const DAY = "2026-03-10";

describe("ingest", () => {
	it("Google rows for example.com/page, #toc and #faq merge into one /page row with summed metrics and a weighted position", () => {
		const target = { pageKey: pageKeyFor("https://example.com") };
		const api = [
			{ keys: ["https://example.com/page", "blue widgets"], clicks: 10, impressions: 100, position: 2 },
			{ keys: ["https://example.com/page#toc", "blue widgets"], clicks: 5, impressions: 300, position: 6 },
			{ keys: ["https://example.com/page#faq", "blue widgets"], clicks: 1, impressions: 100, position: 10 },
		];
		const rows = mergeRows(api.map((r) => mapRow(["page", "query"], r, target)).filter((r) => r !== null));
		expect(rows).toHaveLength(1);
		const [r] = rows;
		expect(r?.page_key).toBe("/page");
		expect([r?.clicks, r?.impressions]).toEqual([16, 500]);
		// (2*100 + 6*300 + 10*100) / 500
		expect((r?.pos_sum ?? 0) / (r?.impressions ?? 1)).toBeCloseTo(6);
	});

	it("query strings and trailing slashes keep their existing page key rules", () => {
		const key = pageKeyFor("https://example.com");
		expect(key("https://example.com/page/#toc")).toBe(key("https://example.com/page/"));
		expect(key("https://example.com/page?x=1#toc")).toBe(key("https://example.com/page?x=1"));
	});
});

describe("report time", () => {
	let rc: ReportCtx;
	const run = runner(() => rc);
	beforeAll(async () => {
		const env = await schemaDb();
		// Rows as an older store could hold them: fragments inside the page key.
		insertSearch(env.raw, "default", [
			{ day: DAY, query: "blue widgets", page: "/page", impressions: 100, clicks: 10, position: 2 },
			{ day: DAY, query: "blue widgets", page: "/page#toc", impressions: 300, clicks: 5, position: 6 },
			{ day: DAY, query: "blue widgets", page: "/page#faq", impressions: 100, clicks: 1, position: 10 },
			{ day: DAY, query: "blue widgets", page: "/other", impressions: 200, clicks: 4, position: 3 },
			{ day: DAY, query: "red widgets", page: "/page#toc", impressions: 300, clicks: 3, position: 4 },
			{ day: DAY, query: "red widgets", page: "/page#faq", impressions: 300, clicks: 3, position: 4 },
		]);
		rc = seoCtx(env.db, "default");
	});

	it("cannibalization counts /page once with summed metrics; a query whose only pages are fragments of one page is not cannibalized", async () => {
		const rows = (await run("search_cannibalization", {})).data.rows as Row[];
		expect(rows.map((r) => r.query)).toEqual(["blue widgets"]);
		const list = rows[0]?.page_list as Array<Record<string, unknown>>;
		expect(list.map((p) => [p.page, p.impressions, p.clicks, p.position])).toEqual([
			["/page", 500, 16, 6],
			["/other", 200, 4, 3],
		]);
	});

	it("the query drill-down lists /page once", async () => {
		const r = await run("search_cannibalization_query", {}, { query: "blue widgets", source: "google" });
		const pages = r.data.page_list as Array<Record<string, unknown>>;
		expect(pages.map((p) => [p.page, p.impressions, p.clicks])).toEqual([
			["/page", 500, 16],
			["/other", 200, 4],
		]);
	});

	it("the pages view and the page drill-down use the fragment free page", async () => {
		const pages = (await run("search_cannibalization_pages", {})).data.rows as Row[];
		expect(pages.map((p) => p.key).sort()).toEqual(["/other", "/page"]);
		const one = await run("search_cannibalization_page", {}, { page: "/page" });
		expect((one.data.pairs as Array<Record<string, unknown>>).map((p) => p.other_page)).toEqual(["/other"]);
	});
});
