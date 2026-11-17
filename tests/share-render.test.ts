/** Shared page renderer: structure, accessibility, escaping, size and the public word rule. */
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FORBIDDEN_PUBLIC_WORDS, PLUGIN_ID } from "../src/contract.js";
import { renderShared, type RenderInput, SHARE_ANNOTATIONS_PER_TILE } from "../src/dashboards/render.js";
import { type Dashboard, MAX_TILES, readDashboard } from "../src/dashboards/schema.js";
import type { TileData } from "../src/dashboards/tiles.js";

const td = (o: Partial<TileData> & Pick<TileData, "kind">): TileData => ({ metric: null, value: null, buckets: [], lines: [], rows: [], columns: [], notices: [], ...o });
const buckets = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
const vals = buckets.map((_, i) => 100 + i * 3);

export function fixture(): { dashboard: Dashboard; tiles: TileData[] } {
	const dashboard = readDashboard({
		id: "abcdefabcdef",
		site: "default",
		v: 1,
		name: `Team <view> & "friends"`,
		tiles: [
			{ id: "k00001", report: "overview", kind: "kpi", metric: "visitors", w: 1 },
			{ id: "k00002", report: "overview", kind: "kpi", metric: "bounce_rate", w: 1 },
			{ id: "k00003", report: "satisfaction", kind: "kpi", metric: "pct_long", w: 1 },
			{ id: "l00001", report: "timeseries", kind: "line", metrics: ["visitors"], w: 3 },
			{ id: "a00001", report: "search_overview", kind: "area", metrics: ["clicks"], w: 2, title: "Clicks <b>" },
			{ id: "b00001", report: "pages", kind: "bars", w: 1 },
			{ id: "d00001", report: "devices", kind: "donut", w: 1 },
			{ id: "t00001", report: "pages", kind: "table", w: 2, limit: 10 },
			{ id: "e00001", report: "channels", kind: "table", w: 1 },
		],
		defaults: { range: "30d", compare: "none", filters: [] },
		viewer: { ranges: ["7d", "30d", "90d"], compare: true },
		created: 1,
		updated: 1,
	});
	const tiles = [
		td({ kind: "kpi", metric: "visitors", value: 1234, compare: { visitors: 1102 } }),
		td({ kind: "kpi", metric: "bounce_rate", value: 0.41, compare: { bounce_rate: 0.46, sessions: 900 } }),
		td({ kind: "kpi", metric: "pct_long", value: 0.6 }),
		td({ kind: "line", metric: "visitors", buckets, lines: [{ key: "visitors", values: vals, compare: vals.map((v) => v - 10) }], notices: ["summary"] }),
		td({ kind: "area", metric: "clicks", buckets, lines: [{ key: "clicks", values: vals, compare: null }] }),
		td({ kind: "bars", metric: "visitors", rows: [{ label: "/a?x=<script>&y='1'", value: 50 }, { label: "/b", value: 20 }] }),
		td({ kind: "donut", metric: "visitors", rows: [{ label: "desktop", value: 70 }, { label: "mobile", value: 30 }] }),
		td({
			kind: "table",
			columns: ["key", "visitors", "bounce_rate"],
			rows: Array.from({ length: 10 }, (_, i) => ({ key: `/post-${i}/"q"&<x>`, visitors: 100 - i, bounce_rate: 0.3 })),
		}),
		td({ kind: "table", columns: ["key", "visitors"], rows: [] }),
	];
	return { dashboard, tiles };
}

/** Annotations as the runner attaches them; the assertions run with and without them. */
const at = (day: number, hour = 12) => Date.UTC(2026, 9, day, hour) / 1000;
const ann = (id: string, ts: number, text: string, summary = "Site-wide") => ({ id, ts, day: new Date(ts * 1000).toISOString().slice(0, 10), kind: "release", text, scope: null, summary });
const ANNOTATED = [ann("a1", at(5), "Deploy <script>alert(1)</script>"), ann("a2", at(5, 13), "Second", "Page /blog/x"), ann("a3", at(20), "Later")];
let withAnnotations = false;

const input = (over: Partial<RenderInput> = {}): RenderInput => {
	const f = fixture();
	const tiles = withAnnotations ? f.tiles.map((t) => (t.kind === "line" ? { ...t, annotations: ANNOTATED } : t)) : f.tiles;
	return { dashboard: f.dashboard, tiles, range: "30d", compare: true, ranges: f.dashboard.viewer.ranges, allowCompare: true, generatedAt: 1_793_000_000, ...over };
};
const parse = (html: string) => new JSDOM(html).window.document;

describe.each([false, true])("shared page renderer (annotations %s)", (annotated) => {
	beforeAll(() => {
		withAnnotations = annotated;
	});
	afterAll(() => {
		withAnnotations = false;
	});

	it("is a valid document with the required head", () => {
		const html = renderShared(input());
		expect(html.startsWith("<!doctype html>")).toBe(true);
		const doc = parse(html);
		expect(doc.documentElement.lang).toBe("en");
		expect(doc.querySelector('meta[name="viewport"]')).not.toBeNull();
		expect(doc.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
		expect(doc.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe("no-referrer");
		expect(doc.title).toBe(`Team <view> & "friends"`);
		expect(doc.querySelectorAll("style")).toHaveLength(1);
		expect(doc.querySelector("h1")?.textContent).toBe(`Team <view> & "friends"`);
		expect(doc.querySelector(".upd")?.textContent).toMatch(/^Updated \d{4}-\d\d-\d\d \d\d:\d\d UTC$/);
		expect(doc.querySelector("footer")?.textContent).toContain("Shared view");
	});

	it("renders one labelled section and h2 per tile, aria on every svg, a table under bars and donut", () => {
		const doc = parse(renderShared(input()));
		const sections = [...doc.querySelectorAll("main > section")];
		expect(sections).toHaveLength(9);
		for (const s of sections) {
			const h2 = s.querySelector("h2");
			expect(h2?.id).toBe(s.getAttribute("aria-labelledby"));
		}
		expect(doc.querySelectorAll("h2")).toHaveLength(9);
		// Legend swatches are decorative (`aria-hidden`); every chart is an image with a name.
		for (const svg of doc.querySelectorAll("svg:not([aria-hidden])")) {
			expect(svg.getAttribute("role")).toBe("img");
			expect(svg.getAttribute("aria-label")).toBeTruthy();
		}
		for (const id of ["b00001", "d00001"]) expect(doc.querySelector(`section[aria-labelledby="t-${id}"] svg + table`)).not.toBeNull();
		const line = doc.querySelector('section[aria-labelledby="t-l00001"] svg') as Element;
		// One title per bucket, plus one per marker group when annotations are attached.
		expect(line.querySelectorAll("title")).toHaveLength(annotated ? 32 : 30);
		expect(doc.querySelectorAll('section[aria-labelledby="t-t00001"] tbody tr')).toHaveLength(10);
		expect(doc.querySelector('section[aria-labelledby="t-e00001"]')?.textContent).toContain("No data for this range.");
		expect(doc.querySelector('section[aria-labelledby="t-k00001"] .kpi')?.textContent).toBe("1,234");
		expect(doc.querySelector('section[aria-labelledby="t-k00001"] .better')?.textContent).toBe("\u2191 +12.0% better");
		expect(doc.querySelector('section[aria-labelledby="t-k00001"] .upd')?.textContent).toBe("+132, from 1,102");
		// A rate changes in percentage points; a fall of the bounce rate is better.
		expect(doc.querySelector('section[aria-labelledby="t-k00002"] .better')?.textContent).toBe("\u2193 -5.0 pp better");
		expect(doc.querySelector('section[aria-labelledby="t-k00003"] .better, section[aria-labelledby="t-k00003"] .worse, section[aria-labelledby="t-k00003"] .same')).toBeNull();
		expect(doc.querySelector('section[aria-labelledby="t-a00001"] h2')?.textContent).toBe("Clicks <b>");
	});

	it("marks the current range and shows the compare series only when present", () => {
		const doc = parse(renderShared(input()));
		const links = [...doc.querySelectorAll("nav a")];
		expect(links.map((a) => a.getAttribute("href"))).toEqual(["?r=7d&c=1", "?r=30d&c=1", "?r=90d&c=1", "?r=30d"]);
		expect(links.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent)).toEqual(["Last 30 days"]);
		expect(doc.querySelectorAll("[data-compare]")).toHaveLength(1);
		const off = parse(renderShared(input({ compare: false, allowCompare: false, tiles: fixture().tiles.map((t) => ({ ...t, lines: t.lines.map((l) => ({ ...l, compare: null })) })) })));
		expect(off.querySelectorAll("[data-compare]")).toHaveLength(0);
		expect([...off.querySelectorAll("nav a")].map((a) => a.getAttribute("href"))).toEqual(["?r=7d", "?r=30d", "?r=90d"]);
	});

	it("adds the footnotes the tiles need", () => {
		const text = parse(renderShared(input())).querySelector("footer")?.textContent ?? "";
		expect(text).toContain("Distinct visitors per day");
		expect(text).toContain("are estimates");
		expect(text).toContain("Search data arrives 2 to 3 days late");
		const doc = parse(renderShared(input()));
		expect(doc.querySelector('section[aria-labelledby="t-l00001"] .note')?.textContent).toContain("daily summaries");
	});

	it("escapes names, titles, labels and keys", () => {
		const html = renderShared(input());
		expect(html).not.toContain("<view>");
		expect(html).not.toContain("<b>");
		expect(html).not.toContain("<x>");
		expect(html).toContain("/a?x=&lt;script&gt;&amp;y=&#39;1&#39;");
		expect(html).toContain("/post-0/&quot;q&quot;&amp;&lt;x&gt;");
	});

	it("loads nothing, names nothing and stays under 150 KB for 12 tiles", () => {
		const f = fixture();
		const many = { ...f.dashboard, tiles: Array.from({ length: MAX_TILES }, (_, i) => ({ ...(f.dashboard.tiles[i % f.dashboard.tiles.length] as Dashboard["tiles"][number]), id: `x${String(i).padStart(5, "0")}` })) };
		const tiles = many.tiles.map((_, i) => f.tiles[i % f.tiles.length] as TileData);
		const html = renderShared(input({ dashboard: many, tiles }));
		const lower = html.toLowerCase();
		for (const bad of ["<script", "http", "<img", "<link", "<form", "<iframe", "localstorage", "document.cookie", PLUGIN_ID]) expect(lower).not.toContain(bad);
		for (const w of FORBIDDEN_PUBLIC_WORDS) expect(lower).not.toContain(w);
		expect(html).not.toMatch(/[\u2013\u2014]/);
		expect(new TextEncoder().encode(html).length).toBeLessThan(150 * 1024);
	});

	it("renders a tile that failed as a short message", () => {
		const doc = parse(renderShared(input({ tiles: fixture().tiles.map((t, i) => (i === 0 ? null : t)) })));
		expect(doc.querySelector('section[aria-labelledby="t-k00001"]')?.textContent).toContain("could not be loaded");
	});
});

describe("shared page annotations", () => {
	const lineTile = (annotations: ReturnType<typeof ann>[]) => {
		const f = fixture();
		return input({ tiles: f.tiles.map((t, i) => (i === 3 ? { ...t, annotations } : t)) });
	};

	it("draws one group per bucket with a title and a count badge, and lists the annotations", () => {
		const doc = parse(renderShared(lineTile(ANNOTATED)));
		const sec = doc.querySelector('section[aria-labelledby="t-l00001"]') as Element;
		const groups = sec.querySelectorAll("svg g[data-marker]");
		expect(groups).toHaveLength(2);
		expect(groups[0]?.getAttribute("data-marker")).toBe("2026-10-05");
		expect(groups[0]?.querySelector("title")?.textContent).toBe("2 annotations on 2026-10-05: Deploy <script>alert(1)</script>; Second");
		expect(groups[0]?.querySelector("text")?.textContent).toBe("2");
		expect(groups[1]?.querySelector("text")).toBeNull();
		expect(sec.querySelector("svg")?.getAttribute("aria-label")).toBe("Visitors over time, 30 points, 3 annotations");
		const items = [...sec.querySelectorAll('ul[aria-label="Annotations"] li')].map((li) => li.textContent);
		expect(items).toEqual(["2026-10-05 Deploy <script>alert(1)</script> (Release, Site-wide)", "2026-10-05 Second (Release, Page /blog/x)", "2026-10-20 Later (Release, Site-wide)"]);
	});

	it("escapes the texts and lists at most 12 with and n more", () => {
		const many = Array.from({ length: 15 }, (_, i) => ann(`m${i}`, at(1 + i * 2), `Note ${i} & <i>`));
		const html = renderShared(lineTile(many));
		expect(html).not.toContain("<script>alert");
		expect(html).not.toContain("<i>");
		const items = [...parse(html).querySelectorAll('ul[aria-label="Annotations"] li')].map((li) => li.textContent);
		expect(items).toHaveLength(13);
		expect(items[12]).toBe("and 3 more");
		expect(SHARE_ANNOTATIONS_PER_TILE).toBe(12);
	});

	it("renders no marker and no list without annotations", () => {
		const html = renderShared(lineTile([]));
		expect(html).not.toContain("data-marker");
		expect(html).not.toContain('aria-label="Annotations"');
	});
});

describe("SEO and impact tiles", () => {
	const seo = (): RenderInput => {
		const dashboard = readDashboard({
			id: "abcdefabcdef",
			site: "default",
			v: 1,
			name: "SEO",
			tiles: [
				{ id: "s00001", report: "search_position_bands_series", kind: "stacked", metric: "queries", w: 3 },
				{ id: "s00002", report: "search_cannibalization", kind: "table", w: 3 },
				{ id: "s00003", report: "search_movers", kind: "table", w: 3 },
				{ id: "i00001", report: "impact", kind: "kpi", metric: "sessions", params: { annotation: "latest", report: "overview" }, w: 1 },
				{ id: "i00002", report: "impact", kind: "line", metrics: ["sessions"], params: { annotation: "latest", report: "overview" }, w: 2 },
				{ id: "i00003", report: "impact", kind: "kpi", metric: "clicks", params: { annotation: "latest", report: "search_overview" }, w: 1 },
			],
			defaults: { range: "30d", compare: "none", filters: [] },
			viewer: { ranges: ["30d"], compare: false },
			created: 1,
			updated: 1,
		});
		const keys = ["band_1_3", "band_4_10"];
		const tiles: TileData[] = [
			td({ kind: "stacked", stack: { keys, labels: ["1-3", "4-10"], series: [{ t: "2026-10-01", values: { band_1_3: 3, band_4_10: 5 } }, { t: "2026-10-02", values: { band_1_3: 4, band_4_10: 2 } }] } }),
			td({ kind: "table", columns: ["query", "pages", "pattern"], rows: [{ query: "blue <widgets>", pages: 2, pattern: "split" }], notices: ["coverage", "bing_no_pairs"] }),
			td({ kind: "table", columns: ["key", "delta"], rows: [{ key: "/a", delta: -5 }], period: "Comparing 2026-10-01 to 2026-10-28 with the 28 days before; the newest 3 days are excluded as provisional" }),
			td({ kind: "kpi", metric: "sessions", value: 160, compare: { sessions: 100 }, impact: { before: 100, after: 160, complete: false, daysAfter: 9, day: "2026-10-10", notable: true } }),
			td({ kind: "line", metric: "sessions", buckets, lines: [{ key: "sessions", values: vals, compare: null }], impact: { before: 100, after: 160, complete: true, daysAfter: 28, day: "2026-10-10" } }),
			td({ kind: "kpi", metric: "clicks", empty: "No annotation yet" }),
		];
		return { dashboard, tiles, range: "30d", compare: false, ranges: ["30d"], allowCompare: false, generatedAt: 1_790_000_000 };
	};

	it("draws a stacked chart with a title per segment and a table, the impact numbers and marker, and the footnotes", () => {
		const html = renderShared(seo());
		const doc = new JSDOM(html).window.document;
		const stack = doc.querySelector('[aria-labelledby="t-s00001"]') as Element;
		expect(stack.querySelectorAll("svg rect")).toHaveLength(4);
		expect([...stack.querySelectorAll("svg rect title")].map((t) => t.textContent)).toContain("2026-10-01: 1-3 3");
		expect(stack.querySelector("table")?.textContent).toContain("4-10");
		const k = doc.querySelector('[aria-labelledby="t-i00001"]')?.textContent ?? "";
		expect(k).toContain("160");
		expect(k).toContain("Before: 100");
		expect(k).toContain("\u2191 +60.0% better");
		expect(k).toContain("+60, from 100");
		expect(k).toContain("The after window has 9 days so far; numbers will change.");
		expect(doc.querySelector('[aria-labelledby="t-i00002"] [data-marker="2026-10-10"]')).not.toBeNull();
		expect(doc.querySelector('[aria-labelledby="t-i00003"]')?.textContent).toContain("No annotation yet");
		const foot = doc.querySelector("footer")?.textContent ?? "";
		expect(foot).toContain("Based on the stored page and query rows.");
		expect(foot).toContain("Comparing 2026-10-01 to 2026-10-28 with the 28 days before");
		expect(foot).toContain("Before and after comparisons show correlation, not causation.");
		expect(html).not.toMatch(/<script|\u2014|\u2013/i);
		const lower = html.toLowerCase();
		for (const w of FORBIDDEN_PUBLIC_WORDS) expect(lower).not.toContain(w);
		expect(html).toContain("blue &lt;widgets&gt;");
	});
});

describe("revenue tiles", () => {
	it("show the code in every value and header, the currency footnote and the other currencies line", async () => {
		const { tileData, REVENUE_EMPTY } = await import("../src/dashboards/tiles.js");
		const dashboard = readDashboard({
			id: "abcdefabcdef",
			site: "default",
			v: 1,
			name: "Revenue",
			tiles: [
				{ id: "r00001", report: "revenue", kind: "kpi", metric: "revenue", w: 1 },
				{ id: "r00002", report: "revenue_series", kind: "line", metrics: ["revenue"], w: 2 },
				{ id: "r00003", report: "revenue_breakdown", kind: "table", params: { dim: "channel" }, w: 2 },
				{ id: "r00004", report: "revenue_breakdown", kind: "bars", params: { dim: "source" }, w: 1 },
				{ id: "r00005", report: "revenue", kind: "kpi", metric: "orders", w: 1 },
			],
			defaults: { range: "30d", compare: "none", filters: [] },
			viewer: { ranges: ["30d"], compare: false },
			created: 1,
			updated: 1,
		});
		const currencies = [
			{ currency: "USD", revenue: 1234.5, orders: 5 },
			...["EUR", "GBP", "JPY", "CHF", "SEK", "NOK"].map((c, i) => ({ currency: c, revenue: 100 + i, orders: i + 1 })),
		];
		const result = (report: string, data: Record<string, unknown>) => ({ report, range: { from: "2026-10-01", to: "2026-10-30" }, compare: "none", compareRange: null, notices: [], data: { currency: "USD", currencies, ...data } }) as never;
		const rows = [{ key: "Search", revenue: 1000, orders: 3, aov: 333.33, revenue_per_visitor: 2.5, visitors: 400, sessions: 420, currency: "USD" }];
		const tiles = [
			tileData(dashboard.tiles[0] as never, result("revenue", { totals: { revenue: 1234.5, orders: 5 }, hasRevenue: true })),
			tileData(dashboard.tiles[1] as never, result("revenue_series", { series: [{ t: "2026-10-01", revenue: 1234.5, orders: 5, aov: 246.9 }] })),
			tileData(dashboard.tiles[2] as never, result("revenue_breakdown", { rows })),
			tileData(dashboard.tiles[3] as never, result("revenue_breakdown", { rows })),
			tileData(dashboard.tiles[4] as never, result("revenue", { totals: { revenue: 0, orders: 0 }, currencies: [], hasRevenue: false })),
		];
		const html = renderShared({ dashboard, tiles, range: "30d", compare: false, ranges: ["30d"], allowCompare: false, generatedAt: 1_793_000_000 });
		const doc = parse(html);
		const text = doc.body.textContent ?? "";
		expect(doc.querySelector("#t-r00001")?.textContent).toBe("Revenue (USD)");
		expect(doc.querySelector("section .kpi")?.textContent).toBe("1,234.50 USD");
		expect(text).toContain("1,000.00 USD");
		expect(text).toContain("333.33 USD");
		expect([...doc.querySelectorAll("th")].map((t) => t.textContent)).toEqual(expect.arrayContaining(["Revenue (USD)", "Average order value (USD)", "Orders"]));
		expect(text).toContain("Amounts in USD.");
		expect(text).toContain("Also recorded: 100.00 EUR (1 order), 101.00 GBP (2 orders), 102 JPY (3 orders), 103.00 CHF (4 orders), 104.00 SEK (5 orders) and 1 more.");
		// Never a bare amount: every number of a revenue column carries the code.
		for (const td of doc.querySelectorAll("td.n")) if (/\d/.test(td.textContent ?? "") && !/^(3|400|420)$/.test(td.textContent ?? "")) expect(td.textContent).toMatch(/ [A-Z]{3}$/);
		expect(text).toContain(REVENUE_EMPTY);
		const lower = html.toLowerCase();
		for (const bad of ["<script", "http", "<img", PLUGIN_ID]) expect(lower).not.toContain(bad);
		for (const w of FORBIDDEN_PUBLIC_WORDS) expect(lower).not.toContain(w);
	});
});
