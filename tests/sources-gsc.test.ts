/** Google pull per day and the row store. */
import { beforeEach, describe, expect, it } from "vitest";
import { clearTokenCache } from "../src/sources/gsc-auth.js";
import { GSC_PAGE_ROWS, google } from "../src/sources/gsc.js";
import { pageKeyFor } from "../src/sources/page-key.js";
import { replaceDay } from "../src/sources/store.js";
import { makeBudget } from "../src/sources/sync.js";
import type { SourceCtx } from "../src/sources/types.js";
import { fakeGoogle, googleSettings } from "./gsc.helpers.js";
import { MemoryKv, schemaDb } from "./helpers.js";

const target = { site: "default", property: "sc-domain:example.com", pageKey: pageKeyFor("https://example.com") };
const sctx = (http: SourceCtx["http"], over: Record<string, unknown> = {}): SourceCtx => ({ http, kv: new MemoryKv(), settings: googleSettings(over), budget: makeBudget(() => 0, 1000) });

describe("Google source", () => {
	beforeEach(() => clearTokenCache());

	it("pulls the six grains of one day with type web and maps rows to ca_search_daily", async () => {
		const g = fakeGoogle();
		const rows = await google.fetchDay(sctx(g.http), target, "2026-03-10");
		const q = g.queries();
		expect(q.map((c) => (c.body.dimensions as string[]).join("+"))).toEqual(["date", "page", "query", "page+query", "country", "device"]);
		expect(q.every((c) => c.body.type === "web" && c.body.startDate === "2026-03-10" && c.body.endDate === "2026-03-10" && c.body.startRow === 0 && c.property === "sc-domain:example.com")).toBe(true);
		expect(q[3]?.body.rowLimit).toBe(5000);
		expect(q[0]?.body.rowLimit).toBe(25_000);
		expect(rows).toContainEqual({ page_key: "", query: "", country: "", device: "", clicks: 40, impressions: 1000, pos_sum: 8500 });
		expect(rows).toContainEqual({ page_key: "/blog", query: "cookieless analytics", country: "", device: "", clicks: 9, impressions: 200, pos_sum: 900 });
		expect(rows).toContainEqual({ page_key: "", query: "", country: "DEU", device: "", clicks: 15, impressions: 400, pos_sum: 4300 });
		expect(rows).toContainEqual({ page_key: "", query: "", country: "", device: "MOBILE", clicks: 10, impressions: 300, pos_sum: 300 * 10.83 });
		// The other host's page is dropped.
		expect(rows.filter((r) => r.page_key && !r.query).map((r) => r.page_key)).toEqual(["/blog", "/blog", "/"]);
	});

	it("pages at 25000 rows with startRow and caps the page with query grain", async () => {
		const many = (n: number, start: number) => ({ rows: Array.from({ length: n }, (_, i) => ({ keys: [`https://example.com/p${start + i}`, `q${start + i}`], clicks: 1, impressions: 2, position: 3 })) });
		const g = fakeGoogle({
			query: (b) => {
				const dims = (b.dimensions as string[]).join(",");
				const start = b.startRow as number;
				if (dims === "page") return many(start === 0 ? GSC_PAGE_ROWS : 3, start);
				if (dims === "page,query") return many(b.rowLimit as number, start);
				return { rows: [] };
			},
		});
		const rows = await google.fetchDay(sctx(g.http, { searchMaxRowsPerDay: 1000 }), target, "2026-03-10");
		const pages = g.queries().filter((c) => (c.body.dimensions as string[]).join() === "page");
		expect(pages.map((c) => c.body.startRow)).toEqual([0, GSC_PAGE_ROWS]);
		expect(rows.filter((r) => r.page_key && !r.query)).toHaveLength(GSC_PAGE_ROWS + 3);
		const pq = g.queries().filter((c) => (c.body.dimensions as string[]).join() === "page,query");
		expect(pq.map((c) => [c.body.startRow, c.body.rowLimit])).toEqual([[0, 1000]]);
		expect(rows.filter((r) => r.page_key && r.query)).toHaveLength(1000);
	});

	it("test() reports whether the mapped property is visible", async () => {
		expect(await google.test(sctx(fakeGoogle().http), target)).toEqual({ property: "sc-domain:example.com", found: true, permissionLevel: "siteOwner" });
		expect(await google.test(sctx(fakeGoogle().http), { ...target, property: "https://shop.example.net/" })).toMatchObject({ found: false });
	});

	it("a non-2xx answer is a SourceError with the status and no body echo", async () => {
		const g = fakeGoogle({ status: () => 403 });
		const err = (await google.fetchDay(sctx(g.http), target, "2026-03-10").catch((e: unknown) => e)) as { status: number; message: string };
		expect(err.status).toBe(403);
		expect(err.message).toBe("Search Console answered 403 (PERMISSION_DENIED).");
	});
});

describe("search row store", () => {
	it("a day pulled twice ends with one row set; rows sharing a key are summed", async () => {
		const env = await schemaDb();
		const rows = await google.fetchDay(sctx(fakeGoogle().http), target, "2026-03-10");
		await replaceDay(env.db, "default", "google", "2026-03-10", rows, true);
		const n = env.count("ca_search_daily");
		expect(n).toBe(rows.length - 1);
		await replaceDay(env.db, "default", "google", "2026-03-10", rows, false);
		expect(env.count("ca_search_daily")).toBe(n);
		const blog = env.raw.prepare("SELECT clicks, impressions, pos_sum, provisional FROM ca_search_daily WHERE page_key = '/blog' AND query = ''").all();
		expect(blog).toEqual([{ clicks: 21, impressions: 410, pos_sum: 1660, provisional: 0 }]);
		// Another site and another day are untouched by a replace.
		await replaceDay(env.db, "blog", "google", "2026-03-10", rows.slice(0, 2), false);
		await replaceDay(env.db, "default", "google", "2026-03-11", [], false);
		expect(env.count("ca_search_daily")).toBe(n + 2);
		await replaceDay(env.db, "default", "google", "2026-03-10", [], false);
		expect(env.count("ca_search_daily")).toBe(2);
	});
});
