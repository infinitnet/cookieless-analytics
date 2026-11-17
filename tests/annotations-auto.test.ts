/** Automatic annotation settings: master switch, publish and update, collections, and the per-day cap in the site timezone. */
import { describe, expect, it, vi } from "vitest";
import { type AnnotateCtx, annotate, KV_AUTO_ANNOTATIONS } from "../src/annotations/hook.js";
import { normalizeSettings } from "../src/settings.js";

const TS = 1_773_230_400; // 2026-03-11 12:00 UTC
const MIDNIGHT = TS - 12 * 3600; // 2026-03-11 00:00 UTC
const item = (id: string) => ({ id, slug: id, data: { title: id } });

function harness() {
	const store = new Map<string, unknown>();
	const puts: string[] = [];
	const getPublicUrl = vi.fn(async () => "https://example.com/a");
	const kvImpl: AnnotateCtx["kv"] = { get: async <T,>(k: string) => (store.get(k) ?? null) as T | null, set: async (k, v) => void store.set(k, v) };
	const kv = { get: vi.spyOn(kvImpl, "get"), set: vi.spyOn(kvImpl, "set") };
	const put = vi.fn(async (id: string) => void puts.push(id));
	const ctx: AnnotateCtx = { content: { getPublicUrl }, kv: kvImpl, storage: { annotations: { put } } };
	return { ctx, puts, kv, getPublicUrl, put };
}
const settings = (raw: Record<string, unknown> = {}) => normalizeSettings(raw);

describe("automatic annotations", () => {
	it("defaults: publish on, update off, cap 10", () => {
		const s = settings();
		expect([s.autoAnnotations, s.annotatePublish, s.annotateUpdate, s.annotateCollections, s.autoAnnotationsPerDay]).toEqual([true, true, false, [], 10]);
	});

	it("writes nothing with the master switch off", async () => {
		const h = harness();
		const s = settings({ autoAnnotations: false, annotateUpdate: true });
		await annotate(h.ctx, "publish", item("p1"), "posts", s, TS);
		await annotate(h.ctx, "update", item("p1"), "posts", s, TS);
		expect(h.puts).toEqual([]);
	});

	it("annotates publishing but not updates by default", async () => {
		const h = harness();
		await annotate(h.ctx, "publish", item("p1"), "posts", settings(), TS);
		await annotate(h.ctx, "update", item("p1"), "posts", settings(), TS);
		expect(h.puts).toEqual(["publish:posts:p1:2026-03-11"]);
	});

	it("annotates updates when on, and not publishing when that is off", async () => {
		const h = harness();
		const s = settings({ annotateUpdate: true, annotatePublish: false });
		await annotate(h.ctx, "publish", item("p1"), "posts", s, TS);
		await annotate(h.ctx, "update", item("p1"), "posts", s, TS);
		expect(h.puts).toEqual(["update:posts:p1:2026-03-11"]);
	});

	it("annotates only the listed collections", async () => {
		const h = harness();
		const s = settings({ annotateCollections: "posts, news" });
		expect(s.annotateCollections).toEqual(["posts", "news"]);
		for (const c of ["posts", "pages", "news"]) await annotate(h.ctx, "publish", item("x"), c, s, TS);
		expect(h.puts).toEqual(["publish:posts:x:2026-03-11", "publish:news:x:2026-03-11"]);
	});

	it("stops at the daily cap, lets the same item replace its own, and resets on the next site day", async () => {
		const h = harness();
		const s = settings({ autoAnnotationsPerDay: 3, siteTimezone: "America/New_York" });
		// 2026-03-11 00:00 UTC is still 2026-03-10 in New York; the site day ends at 04:00 UTC.
		for (let i = 0; i < 5; i++) await annotate(h.ctx, "publish", item(`p${i}`), "posts", s, MIDNIGHT);
		await annotate(h.ctx, "publish", item("p0"), "posts", s, MIDNIGHT + 60);
		expect(h.puts).toEqual(["publish:posts:p0:2026-03-10", "publish:posts:p1:2026-03-10", "publish:posts:p2:2026-03-10", "publish:posts:p0:2026-03-10"]);
		await annotate(h.ctx, "publish", item("p3"), "posts", s, MIDNIGHT + 3 * 3600);
		expect(h.puts).toHaveLength(4);
		await annotate(h.ctx, "publish", item("p3"), "posts", s, MIDNIGHT + 4 * 3600);
		expect(h.puts.at(-1)).toBe("publish:posts:p3:2026-03-11");
		expect(await h.ctx.kv.get(KV_AUTO_ANNOTATIONS)).toEqual({ day: "2026-03-11", ids: ["publish:posts:p3:2026-03-11"] });
	});

	it("does no work in skipped hooks: no path lookup, no write", async () => {
		const h = harness();
		await annotate(h.ctx, "publish", item("p1"), "posts", settings({ autoAnnotations: false }), TS);
		await annotate(h.ctx, "update", item("p1"), "posts", settings(), TS);
		await annotate(h.ctx, "publish", item("p1"), "pages", settings({ annotateCollections: "posts" }), TS);
		expect(h.kv.get).not.toHaveBeenCalled();
		const capped = settings({ autoAnnotationsPerDay: 1 });
		await annotate(h.ctx, "publish", item("p1"), "posts", capped, TS);
		h.getPublicUrl.mockClear();
		h.put.mockClear();
		h.kv.set.mockClear();
		await annotate(h.ctx, "publish", item("p2"), "posts", capped, TS);
		expect(h.getPublicUrl).not.toHaveBeenCalled();
		expect(h.put).not.toHaveBeenCalled();
		expect(h.kv.set).not.toHaveBeenCalled();
	});
});
