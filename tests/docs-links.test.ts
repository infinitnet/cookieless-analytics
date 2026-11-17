/** In-app "Learn more" links point at wiki pages that exist, and each docs page links its wiki counterpart. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WIKI_PAGES, wikiUrl } from "../src/admin/docs-links.js";
import { REVENUE_GUIDE } from "../src/admin/pages/Revenue.js";

const WIKI = "https://github.com/infinitnet/cookieless-analytics/wiki/";

describe("wiki links", () => {
	it("every mapped page is a file in docs/wiki", () => {
		expect(WIKI_PAGES.filter((p) => !existsSync(`docs/wiki/${p}.md`))).toEqual([]);
		expect(wikiUrl("Revenue-and-Refunds")).toBe(`${WIKI}Revenue-and-Refunds`);
		expect(REVENUE_GUIDE).toBe(wikiUrl("Revenue-and-Refunds"));
	});

	it("the Wiki line under a docs title links existing wiki pages", () => {
		const broken: string[] = [];
		let linked = 0;
		for (const f of readdirSync("docs").filter((n) => n.endsWith(".md"))) {
			const line = readFileSync(`docs/${f}`, "utf8").split("\n").slice(0, 4).find((l) => l.startsWith("Wiki: "));
			if (!line) continue;
			linked++;
			for (const [, page] of line.matchAll(/\]\(https:\/\/github\.com\/infinitnet\/cookieless-analytics\/wiki\/([^)]+)\)/g)) if (!existsSync(`docs/wiki/${page}.md`)) broken.push(`${f}: ${page}`);
		}
		expect(broken).toEqual([]);
		expect(linked).toBeGreaterThanOrEqual(19);
	});
});
