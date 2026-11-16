import { describe, expect, it } from "vitest";
import { classifyPath, compilePattern, derivePath, OTHER_COLLECTION } from "../src/content/path.js";

const host = (u: string | null) => ({ content: { getPublicUrl: async () => u } });

describe("derivePath", () => {
	it("uses the host path, with its locale and date segments", async () => {
		expect(await derivePath(host("https://example.com/fr/2026/my-post"), "posts", { id: "p1" })).toBe("/fr/2026/my-post");
	});

	it("fills a custom placeholder the host leaves literal from content.data", async () => {
		const ctx = host("https://example.com/{category}/my-post");
		expect(await derivePath(ctx, "posts", { id: "p1", data: { category: "news" } })).toBe("/news/my-post");
		expect(await derivePath(ctx, "posts", { id: "p1", data: { category: 7 } })).toBe("/7/my-post");
		// Unfillable: missing, unsafe or not a string or number.
		for (const data of [{}, { category: "a/b" }, { category: { x: 1 } }, { category: "" }]) expect(await derivePath(ctx, "posts", { id: "p1", data })).toBeNull();
	});

	it("is null for a draft, a missing id, a missing content API or a failing read", async () => {
		expect(await derivePath(host(null), "posts", { id: "p1" })).toBeNull();
		expect(await derivePath(host("https://example.com/a"), "posts", {})).toBeNull();
		expect(await derivePath({}, "posts", { id: "p1" })).toBeNull();
		const failing = { content: { getPublicUrl: async (): Promise<string> => Promise.reject(new Error("x")) } };
		expect(await derivePath(failing, "posts", { id: "p1" })).toBeNull();
	});
});

describe("classifyPath", () => {
	const patterns = [compilePattern("posts", "/blog/{slug}"), compilePattern("news", "/blog/news/{slug}"), compilePattern("pages", "/{slug}"), compilePattern("docs", null)];

	it("compiles placeholders to one segment, anchored", () => {
		const c = compilePattern("posts", "/blog/{year}/{slug}/");
		expect(c.re.test("/blog/2026/a")).toBe(true);
		expect(c.re.test("/blog/2026/a/b")).toBe(false);
		expect(c.re.test("/x/blog/2026/a")).toBe(false);
		expect(c.literal).toBe("/blog//".length);
	});

	it("picks the most literal pattern when two overlap", () => {
		expect(classifyPath("/blog/news/launch", patterns)).toBe("news");
		expect(classifyPath("/blog/launch", patterns)).toBe("posts");
		expect(classifyPath("/about", patterns)).toBe("pages");
	});

	it("allows a locale prefix", () => {
		expect(classifyPath("/fr/blog/launch", patterns)).toBe("posts");
		expect(classifyPath("/pt-br/blog/news/launch", patterns)).toBe("news");
	});

	it("uses the host default for a null pattern and (other) when nothing matches", () => {
		expect(classifyPath("/docs/setup", patterns)).toBe("docs");
		expect(classifyPath("/a/b/c/d", patterns)).toBe(OTHER_COLLECTION);
		expect(classifyPath("/", patterns)).toBe(OTHER_COLLECTION);
	});
});
