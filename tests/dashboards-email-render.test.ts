/** Dashboard email body: table based HTML and a text part, escaped, no images, scripts or remote URLs. */
import { beforeAll, describe, expect, it } from "vitest";
import { FORBIDDEN_PUBLIC_WORDS, PLUGIN_ID } from "../src/contract.js";
import { BUDGET_LINE, type EmailTile, renderEmail } from "../src/dashboards/email.js";
import { adminUrl, composeEmail, mailDeps } from "../src/dashboards/mail.js";
import { type Dashboard, MAIL_MAX_HTML_BYTES, readDashboard } from "../src/dashboards/schema.js";
import { readTemplate } from "../src/dashboards/templates.js";
import type { TileData } from "../src/dashboards/tiles.js";
import { clearReportCache } from "../src/query/reports/index.js";
import type { Settings } from "../src/settings.js";
import { memColl, T0 } from "./agent.helpers.js";
import { seedRevenue } from "./fixtures/revenue.js";
import { seed } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";

const ADMIN = adminUrl("https://example.org", { id: "abcdefabcdef", site: "default" }, "default");

/** No image, script, svg or remote URL but the admin link; no forbidden word or plugin id outside it; no long dashes. */
function clean(s: string, html = true) {
	const lower = s.toLowerCase();
	// The text part is plain text: a visitor's path such as "<img src=x>" is shown as written, never interpreted.
	if (html) for (const bad of ["<svg", "<img", "<script", "<link", "<iframe", "<form", "<style"]) expect(lower, bad).not.toContain(bad);
	expect(s.split("http").length - 1, "one URL").toBe(1);
	const rest = s.replaceAll(ADMIN, "").toLowerCase();
	expect(rest).not.toContain(PLUGIN_ID);
	for (const w of FORBIDDEN_PUBLIC_WORDS) expect(rest, w).not.toContain(w);
	expect(s).not.toMatch(/[\u2013\u2014]/);
}

const asDashboard = (builtin: string): Dashboard => {
	const { kind: _k, description: _d, dependencies: _x, ...t } = readTemplate({ builtin });
	return readDashboard({ ...t, id: "abcdefabcdef", site: "default", v: 1, created: 1, updated: 1 });
};

const td = (o: Partial<TileData>): TileData => ({ kind: "table", metric: null, value: null, buckets: [], lines: [], rows: [], columns: [], notices: [], ...o });

describe("renderEmail of every tile kind", () => {
	const dashboard = readDashboard({
		id: "abcdefabcdef",
		site: "default",
		v: 1,
		name: `Team <view> & "friends"`,
		tiles: [
			{ id: "k00001", report: "overview", kind: "kpi", metric: "visitors", w: 1 },
			{ id: "l00001", report: "timeseries", kind: "line", metrics: ["visitors"], w: 3 },
			{ id: "a00001", report: "timeseries", kind: "area", metrics: ["sessions"], w: 2, title: "Sessions <b>" },
			{ id: "b00001", report: "pages", kind: "bars", w: 1 },
			{ id: "d00001", report: "devices", kind: "donut", w: 1 },
			{ id: "t00001", report: "pages", kind: "table", w: 2, limit: 10 },
			{ id: "s00001", report: "search_position_bands_series", kind: "stacked", metric: "queries", w: 3 },
			{ id: "e00001", report: "channels", kind: "table", w: 1 },
		],
		defaults: { range: "30d", compare: "none", filters: [] },
		viewer: { ranges: ["30d"], compare: false },
		created: 1,
		updated: 1,
	});
	const buckets = ["2026-03-10", "2026-03-11"];
	const values = [10, 20];
	const tiles: EmailTile[] = [
		{ data: td({ kind: "kpi", metric: "visitors", value: 1234, compare: { visitors: 1102 } }) },
		{ data: td({ kind: "line", metric: "visitors", buckets, lines: [{ key: "visitors", values, compare: [5, 16] }], notices: ["summary"] }) },
		{ data: td({ kind: "area", metric: "sessions", buckets, lines: [{ key: "sessions", values, compare: null }] }) },
		{ data: td({ kind: "bars", metric: "visitors", rows: [{ label: "<img src=x>", value: 50 }, { label: "/b", value: 20 }] }) },
		{ data: td({ kind: "donut", metric: "visitors", rows: [{ label: "desktop", value: 70 }] }) },
		{ data: td({ kind: "table", columns: ["key", "visitors", "bounce_rate"], rows: Array.from({ length: 10 }, (_, i) => ({ key: `/post-${i}/"q"&<x>`, visitors: 100 - i, bounce_rate: 0.3 })) }) },
		{ data: td({ kind: "stacked", stack: { keys: ["b1"], labels: ["Positions 1 to 3"], series: [{ t: "2026-03-09", values: { b1: 4 } }] } }) },
		{ data: null, budget: true },
	];
	const out = renderEmail({ dashboard, tiles, range: "30d", compare: true, adminUrl: ADMIN, generatedAt: T0 });

	it("has no svg, image, script, remote URL or forbidden word and stays under the size cap", () => {
		clean(out.html);
		clean(out.text, false);
		expect(new TextEncoder().encode(out.html).length).toBeLessThan(MAIL_MAX_HTML_BYTES);
		expect(out.html).toContain("<table");
		expect(out.html).not.toContain("<style");
	});

	it("escapes every dynamic string: a row key <img src=x> appears escaped", () => {
		expect(out.html).toContain("&lt;img src=x&gt;");
		expect(out.html).not.toContain("<img src=x>");
		expect(out.html).toContain("Team &lt;view&gt; &amp; &quot;friends&quot;");
		expect(out.html).toContain("Sessions &lt;b&gt;");
		expect(out.html).toContain("/post-0/&quot;q&quot;&amp;&lt;x&gt;");
		expect(out.subject).toBe(`Team <view> & "friends": Last 30 days`);
	});

	it("shows KPI value and change, series as latest, previous and change, tables, the budget line and the caveats", () => {
		expect(out.text).toContain("1,234\n\u2191 +12.0% better, +132, from 1,102");
		expect(out.html).toContain("color:#15803d\">\u2191 +12.0% better</p>");
		// Small numbers stay muted in words; the judgement still reads.
		expect(out.text).toContain("Latest: 20, previous: 16, change: \u2191 +4 better (small numbers)");
		expect(out.text).toContain("Latest: 20, previous: 10, change: \u2191 +10 better (small numbers)");
		expect(out.text).toContain("- <img src=x>: Visitors 50");
		expect(out.html).toContain(BUDGET_LINE);
		expect(out.text).toContain("Distinct visitors per day");
		expect(out.text).toContain("daily summaries");
		expect(out.text.trim().endsWith(ADMIN)).toBe(true);
	});

	it("prints the hidden term count of a site search tile and caps the HTML size", () => {
		const one = renderEmail({ dashboard: { name: "S", tiles: [dashboard.tiles[5] as Dashboard["tiles"][number]] }, tiles: [{ data: tiles[5]?.data ?? null, hiddenTerms: 3 }], range: "7d", compare: false, adminUrl: ADMIN, generatedAt: T0 });
		expect(one.html).toContain("3 search terms used in only one session are not shown.");
		const huge = td({ kind: "table", columns: ["key", "visitors"], rows: Array.from({ length: 25 }, (_, i) => ({ key: `/${"x".repeat(500)}${i}`, visitors: i })) });
		const big = renderEmail({
			dashboard: { name: "Big", tiles: Array.from({ length: 12 }, () => dashboard.tiles[5] as Dashboard["tiles"][number]) },
			tiles: Array.from({ length: 12 }, () => ({ data: huge })),
			range: "7d",
			compare: false,
			adminUrl: ADMIN,
			generatedAt: T0,
		});
		expect(new TextEncoder().encode(big.html).length).toBeLessThanOrEqual(MAIL_MAX_HTML_BYTES);
	});
});

describe("Search Satisfaction score in the email", () => {
	const dashboard = readDashboard({
		id: "abcdefabcdef",
		site: "default",
		v: 1,
		name: "Search",
		tiles: [
			{ id: "k00001", report: "satisfaction", kind: "kpi", metric: "score", w: 1 },
			{ id: "t00001", report: "satisfaction", kind: "table", w: 2, columns: ["score", "measured"], params: { rank: "worst" } },
		],
		defaults: { range: "30d", compare: "none", filters: [] },
		viewer: { ranges: ["30d"], compare: false },
		created: 1,
		updated: 1,
	});
	const tiles: EmailTile[] = [
		{ data: td({ kind: "kpi", metric: "score", value: 0.24, note: "Low sample: under 30 measured sessions, the sample minimum." }) },
		{ data: td({ kind: "table", columns: ["key", "score", "measured"], rows: [{ key: "/a", score: 0.5, measured: 12, low_sample: "yes" }, { key: "/b", score: -0.157, measured: 80, low_sample: "no" }] }) },
	];

	it("prints the score in points, \"low sample\" under a low sample score and the line under the number tile", () => {
		const m = renderEmail({ dashboard, tiles, range: "30d", compare: false, generatedAt: 1_793_000_000, adminUrl: ADMIN });
		clean(m.html);
		clean(m.text, false);
		expect(m.text).toContain("24\nLow sample: under 30 measured sessions, the sample minimum.");
		expect(m.text).toContain("- /a: Score 50 (low sample), Measured 12");
		expect(m.text).toContain("- /b: Score -16, Measured 80");
		expect(m.html).toMatch(/>50<div style="[^"]*">low sample<\/div><\/td>/);
		expect(m.html).toContain("Low sample: under 30 measured sessions, the sample minimum.");
	});
});

describe("rendered email of the built-in templates", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let empty: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
		seedRevenue(env.raw);
		empty = await schemaDb();
	});
	const compose = (e: typeof env, d: Dashboard, compare: boolean) => {
		clearReportCache();
		const deps = mailDeps({ db: async () => e.db, settings: async () => settings }, { input: null, storage: { segments: memColl(), goals: memColl() }, kv: e.kv }, settings, "https://example.org");
		return composeEmail({ ...deps, now: T0 + 3600 }, d, { range: "30d", compare });
	};

	it("the weekly digest: figures, no svg, image, script, second URL, forbidden word or long dash", async () => {
		const m = await compose(env, asDashboard("weekly-digest"), true);
		clean(m.html);
		clean(m.text, false);
		expect(m.text).toContain("VISITORS");
		expect(m.text).toContain("TOP PAGES");
		expect(m.text).not.toContain("could not be loaded");
		expect(new TextEncoder().encode(m.html).length).toBeLessThan(MAIL_MAX_HTML_BYTES);
	});

	it("the Revenue template shows amounts with the currency code", async () => {
		const m = await compose(env, asDashboard("revenue"), false);
		clean(m.html);
		clean(m.text, false);
		expect(m.text).toMatch(/REVENUE \(USD\)/);
		expect(m.text).toContain("Amounts in USD.");
		expect(m.text).not.toContain("could not be loaded");
	});

	it("omits revenue tiles on a site without revenue", async () => {
		const m = await compose(empty, asDashboard("revenue"), false);
		clean(m.html);
		expect(m.text).not.toMatch(/REVENUE|ORDERS/);
		expect(m.html).not.toContain("No revenue recorded yet");
	});
});
