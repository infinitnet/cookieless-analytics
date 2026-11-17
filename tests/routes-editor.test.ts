/** `editor/traffic`: path through `derivePath`, the empty state, the statement budget. */
import { beforeAll, describe, expect, it } from "vitest";
import { createPlugin } from "../src/index.js";
import type { Db } from "../src/db/adapter.js";
import { type EditorCtx, editorRoutes } from "../src/routes/editor.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { putHits, schemaDb } from "./helpers.js";

const NOW = Date.parse("2026-03-13T12:00:00Z") / 1000;
const TS = NOW - 3600;

function annotations(items: Array<{ id: string; data: unknown }>) {
	return { query: async () => ({ items, hasMore: false }), get: async () => null };
}

describe("editor/traffic", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let statements: string[];
	const spyDb = (): Db => ({ ...env.db, all: (sql, params) => (statements.push(sql), env.db.all(sql, params)) });
	const call = (ctx: Partial<EditorCtx>, s: Partial<Settings> = {}) => {
		statements = [];
		const settings = normalizeSettings({ siteTimezone: "UTC", ...s } as Record<string, unknown>);
		return editorRoutes({ db: async () => spyDb(), settings: async () => settings, now: () => NOW })["editor/traffic"].handler({
			input: { collection: "posts", id: "p1" },
			storage: {},
			...ctx,
		} as EditorCtx);
	};
	const publicUrl = (url: string | null) => ({ getPublicUrl: async () => url, get: async () => ({ data: { topic: "news" } }) });

	beforeAll(async () => {
		env = await schemaDb();
		const ses = env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, channel, source) VALUES ('default', ?, ?, ?, 0, ?, ?, 1800, 1, 'Direct', ?)");
		const hit = (id: string, sid: string, ts: number, day: string, kind: "pv" | "ev", path: string, dur: number | null, val: number | null, cur: string | null, name: string | null) =>
			putHits(env.raw, [{ id, sid, ts, day, kind, path, dur, val, cur, name }]);
		const rows: Array<[string, string, string, string | null]> = [
			["s1", "2026-03-12", "/news/hello", "google.com"],
			["s2", "2026-03-12", "/news/hello", "google.com"],
			["s3", "2026-03-10", "/news/hello", null],
			["s4", "2026-03-12", "/other", "bing.com"],
			// Outside the 30 days.
			["s5", "2026-01-01", "/news/hello", "google.com"],
		];
		rows.forEach(([sid, day, path, src], i) => {
			ses.run(sid, `v${sid}`, day, TS, TS, src);
			hit(`h${i}`, sid, TS, day, "pv", path, 4000, null, null, null);
		});
		hit("r1", "s1", TS, "2026-03-12", "ev", "/news/hello", null, 25.5, "USD", "purchase");
		hit("r2", "s2", TS, "2026-03-12", "ev", "/news/hello", null, 10, "EUR", "purchase");
		env.raw
			.prepare("INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum) VALUES ('default', 'google', '2026-03-11', '/news/hello', '', '', '', 3, 40, 200)")
			.run();
	});

	it("is registered with plugins:read", () => {
		const plugin = createPlugin() as unknown as { routes: Record<string, { permission?: string }> };
		expect(plugin.routes["editor/traffic"]?.permission).toBe("plugins:read");
	});

	it("derives the path through derivePath, filling a custom placeholder from the entry's data", async () => {
		const r = await call({ content: publicUrl("https://example.com/{topic}/hello") });
		expect(r).toMatchObject({ path: "/news/hello", range: { from: "2026-02-12", to: "2026-03-13" }, pageviews: 3, visitors: 3, avg_time: 4, revenue: { currency: "USD", revenue: 25.5, orders: 1 } });
		expect(r.series).toHaveLength(30);
		expect(r.series?.find((p) => p.t === "2026-03-12")?.pageviews).toBe(2);
		expect(r.sources).toEqual([
			{ key: "google.com", sessions: 2 },
			{ key: "(not set)", sessions: 1 },
		]);
		// No Search source: no search statement.
		expect(r.search).toBeNull();
		expect(statements.length).toBeLessThanOrEqual(6);
	});

	it("falls back to getPublicUrl alone and stays within six statements with search and revenue", async () => {
		const r = await call({ content: { getPublicUrl: async () => "https://example.com/news/hello" } }, { bingEnabled: true, bingApiKey: "k" } as Partial<Settings>);
		expect(r.path).toBe("/news/hello");
		expect(r.search).toEqual({ clicks: 3, impressions: 40, position: 5 });
		expect(statements.length).toBeLessThanOrEqual(6);
	});

	it("a draft has no public page: the empty state with no statement", async () => {
		expect(await call({ content: publicUrl(null) })).toEqual({ path: null });
		expect(statements).toHaveLength(0);
	});

	it("returns the newest five annotations whose scope matches the path", async () => {
		const scoped = (id: string, path: string, ts: number) => ({ id, data: { site: "default", ts, kind: "manual", text: id, scope: { v: 1, path: [{ op: "is", value: path }] } } });
		const items = [...Array.from({ length: 6 }, (_, i) => scoped(`a${i}`, "/news/hello", TS - i * 86_400)), scoped("other", "/other", TS)];
		const r = await call({ content: publicUrl("https://example.com/news/hello"), storage: { annotations: annotations(items) } });
		expect(r.annotations?.map((a) => a.text)).toEqual(["a0", "a1", "a2", "a3", "a4"]);
	});
});
