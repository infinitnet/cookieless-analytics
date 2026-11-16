/** Publish and update hooks: the page path from the host's public URL, site-wide fallbacks, never throws. */
import { describe, expect, it } from "vitest";
import { type AnnotateCtx, annotate } from "../src/annotations/hook.js";

const S = { siteId: "default", siteTimezone: "UTC" };
const TS = 1_773_230_400; // 2026-03-11
const item = { id: "p1", slug: "my-post", data: { title: "My post" } };

async function run(content: AnnotateCtx["content"], it: Record<string, unknown> = item) {
	const puts: Array<[string, Record<string, unknown>]> = [];
	const ctx: AnnotateCtx = { ...(content ? { content } : {}), storage: { annotations: { put: async (id, data) => void puts.push([id, data as Record<string, unknown>]) } } };
	await annotate(ctx, "publish", it, "posts", S, TS);
	return puts;
}
const url = (u: string | null) => ({ getPublicUrl: async () => u });

describe("annotate hook", () => {
	it("scopes the record to the item's public path", async () => {
		const [[id, rec]] = (await run(url("https://example.com/blog/my-post"))) as [[string, Record<string, unknown>]];
		expect(id).toBe("publish:posts:p1:2026-03-11");
		expect(rec).toEqual({ site: "default", ts: TS, kind: "publish", text: "My post", scope: { v: 1, path: [{ op: "is", value: "/blog/my-post" }] }, slug: "my-post", collection: "posts", ref: "p1" });
		expect(rec).not.toHaveProperty("path");
	});

	it("keeps the host's date and locale segments", async () => {
		const [[, rec]] = (await run(url("https://example.com/fr/2026/my-post"))) as [[string, Record<string, unknown>]];
		expect(rec.scope).toEqual({ v: 1, path: [{ op: "is", value: "/fr/2026/my-post" }] });
	});

	it("is site-wide with slug and collection when the path cannot be resolved", async () => {
		const cases: Array<AnnotateCtx["content"]> = [
			url("https://example.com/{year}/my-post"),
			url(null),
			{},
			undefined,
			{
				getPublicUrl: async () => {
					throw new Error("read failed");
				},
			},
		];
		for (const c of cases) {
			const [[, rec]] = (await run(c)) as [[string, Record<string, unknown>]];
			expect(rec).not.toHaveProperty("scope");
			expect(rec).toMatchObject({ slug: "my-post", collection: "posts", ref: "p1" });
		}
	});

	it("skips items without an id", async () => {
		expect(await run(url("https://example.com/a"), { slug: "x" })).toEqual([]);
	});
});
