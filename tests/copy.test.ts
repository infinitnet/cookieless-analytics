import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_PUBLIC_WORDS } from "../src/contract.js";
import { HINTS } from "../src/admin/components/MetricChart.js";
import { bucketText, rangeText } from "../src/charts/geometry.js";
import { KIND_LABELS, type Scope, SCOPE_MESSAGES, scopeSummary } from "../src/annotations/scope.js";
import { SEO_NOTICES } from "../src/charts/caveats.js";
import { DIAGNOSIS_LABELS, PATTERN_LABELS, periodLine, SEO_TEXT } from "../src/query/reports/seo-copy.js";
import { GROUP_HINTS, IMPACT_OPTIONS, IMPACT_TEXT } from "../src/admin/components/ImpactPanel.js";
import { ANNOTATIONS_TEXT } from "../src/admin/pages/Annotations.js";
import { TARGET_MESSAGES, VERDICT_WORDS } from "../src/annotations/target.js";
import { ORDER_SESSION_LINE, REVENUE_LINE } from "../src/routes/privacy.js";
import { currencyLines, metricLabel, REVENUE_EMPTY, valueLabel } from "../src/dashboards/tiles.js";
import { chipText, DIM_LABELS } from "../src/admin/components/FilterBar.js";
import { BEHAVIOUR_CATALOG, REVENUE_CATALOG } from "../src/agent/schemas.js";
import { FUNNEL_MODE_TEXT, UA_RULES_TEXT } from "../src/admin/pages/Config.js";
import { RULE_TEXT } from "../src/agents/lines.js";
import { FUNNEL_REVENUE_NOTE, hiddenText } from "../src/admin/pages/Behaviour.js";
import { ATTRIBUTION_NOTE, ORDERS_NOTE, REFUNDS_NOTE } from "../src/admin/pages/Revenue.js";
import { ORDERS_RAW_ONLY } from "../src/query/reports/revenue-copy.js";
import { filterReason, NOTICE_COPY, noticeCopy, noticeText } from "../src/charts/caveats.js";
import { SEGMENT_COMPARE_NOT_SUPPORTED } from "../src/query/reports/index.js";
import { PANEL_TEXT } from "../src/admin/components/TrafficPanel.js";
import { SITE_SEARCH_TEXT } from "../src/admin/pages/Behaviour.js";
import { SITE_NOTICES } from "../src/charts/caveats.js";
import { SITE_SEARCH_LINE } from "../src/routes/privacy.js";
import { hiddenTermsText, tileTitle } from "../src/dashboards/tiles.js";
import { CONTENT_CATALOG } from "../src/agent/schemas.js";
import { HOST_FORM_POINTER, settingsSchema } from "../src/settings.js";
import { UNSEEN_TEXT } from "../src/admin/components/ValueInput.js";
import { SETTINGS_TEXT } from "../src/admin/pages/Settings.js";
import { fieldMeta, SETTINGS_SECTIONS, validateSettings } from "../src/routes/settings.js";
import { headSummary } from "../src/admin/components/Header.js";
import { changeText, describeChange, MISSING_NOTE, SMALL_NOTE } from "../src/charts/change.js";
import { compareText } from "../src/admin/components/Change.js";
import { describeSpec, DeleteSpecSchema } from "../src/query/filtered-delete.js";

// Scope: every tracked or new (not ignored) text file in the repository. Served-output word checks live elsewhere.
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
	.split("\0")
	.filter(Boolean)
	.filter((f) => !/\.(png|jpe?g|gif|ico|woff2?|tgz)$/i.test(f));

// U+2013 en dash and U+2014 em dash, built from code points so this file stays clean.
const DASHES = [0x2013, 0x2014].map((c) => String.fromCharCode(c));

describe("copy rules", () => {
	it("finds files to scan", () => {
		expect(files.length).toBeGreaterThan(10);
	});

	it("no em dash or en dash in any text file", () => {
		const hits: string[] = [];
		for (const f of files) {
			let text: string;
			try {
				text = readFileSync(f, "utf8");
			} catch {
				continue;
			}
			text.split("\n").forEach((line, i) => {
				if (DASHES.some((d) => line.includes(d))) hits.push(`${f}:${i + 1}`);
			});
		}
		expect(hits).toEqual([]);
	});

	it("no forbidden public word in the admin source (the plugin id comes from the contract)", () => {
		const admin = files.filter((f) => f.startsWith("src/admin/"));
		expect(admin.length).toBeGreaterThan(5);
		const hits: string[] = [];
		for (const f of admin) {
			const text = readFileSync(f, "utf8").toLowerCase();
			for (const w of FORBIDDEN_PUBLIC_WORDS) if (text.includes(w)) hits.push(`${f}: ${w}`);
		}
		expect(hits).toEqual([]);
	});

	it("revenue strings carry no dash and no forbidden word", () => {
		const strings = [
			REVENUE_EMPTY,
			...currencyLines({ currency: "USD", otherCurrencies: [{ currency: "EUR", revenue: 120, orders: 3 }] }),
			valueLabel("revenue", "USD"),
			metricLabel("aov"),
			chipText({ dim: "revenue", op: "gte", values: ["50"] }),
			DIM_LABELS.revenue ?? "",
			DIM_LABELS.currency ?? "",
			REVENUE_CATALOG.currencyRule,
			"Void revenue",
			"Count matching orders",
			"Other currencies: ",
			// The Revenue page.
			ATTRIBUTION_NOTE,
			ORDERS_NOTE,
			REFUNDS_NOTE,
			ORDERS_RAW_ONLY,
			REVENUE_CATALOG.reports.revenue_orders.rule,
			"Orders from 2026-03-04 on: single orders before that day are not kept. The figures above cover the whole range.",
			"Revenue comes from events that carry an order value. Send one from the order confirmation page, or record orders from your server with an API key.",
			"__ec is the default value of the Window namespace setting. The figures, the breakdowns and the recent orders appear here with the first order.",
			"Where the revenue came from",
			// Funnel revenue (Behaviour, Funnels) and its link from the Revenue page.
			FUNNEL_REVENUE_NOTE,
			"Est. lost revenue (USD)",
			"Revenue per session (USD)",
			"Revenue per funnel step",
			"Goals to revenue",
			"Share of revenue",
			"Order reference",
			"Recent orders",
			"Revenue guide",
		];
		expect(strings).toContain("Amounts in USD.");
		expect(strings).toContain("Also recorded: 120.00 EUR (3 orders).");
		for (const t of strings) {
			expect(t).not.toMatch(new RegExp(`[${DASHES.join("")}]`));
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase()).not.toContain(w);
		}
	});

	it("funnel mode, segment comparison and journey strings carry no dash and no forbidden word", () => {
		const strings = [
			...Object.values(FUNNEL_MODE_TEXT),
			UNSEEN_TEXT,
			...Object.values(BEHAVIOUR_CATALOG.funnels.modes),
			BEHAVIOUR_CATALOG.funnels.modeRule,
			BEHAVIOUR_CATALOG.funnels.revenueRule,
			BEHAVIOUR_CATALOG.compareSegment.rule,
			BEHAVIOUR_CATALOG.compareSegment.notSupported,
			BEHAVIOUR_CATALOG.journeys.rule,
			SEGMENT_COMPARE_NOT_SUPPORTED,
			...noticeText(["compare_segment_missing"]),
			hiddenText(3) ?? "",
			"Another segment",
			"Compare with segment",
			"Compare with another segment",
			"Came from",
			"Went to",
			"Top paths",
		];
		expect(strings).toContain("The compare segment of this dashboard was deleted; this tile shows no comparison.");
		expect(strings).toContain("3 sessions on routes taken by fewer than 2 sessions are not shown.");
		for (const t of strings) {
			expect(t).not.toMatch(new RegExp(`[${DASHES.join("")}]`));
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase()).not.toContain(w);
		}
	});

	it("collections, site search and editor panel strings carry no dash and no forbidden word", () => {
		const strings = [
			...Object.values(PANEL_TEXT),
			...Object.values(SITE_SEARCH_TEXT),
			...Object.values(SITE_NOTICES),
			SITE_SEARCH_LINE,
			hiddenTermsText(1),
			hiddenTermsText(3),
			settingsSchema.siteSearchParams.label,
			settingsSchema.siteSearchParams.description,
			"Site search",
			"Traffic",
			"Site search parameters",
			"Own list (empty is off)",
			tileTitle({ id: "t00001", report: "collections", kind: "bars", w: 1 }),
			tileTitle({ id: "t00002", report: "site_search", kind: "table", w: 1 }),
		];
		expect(strings).toContain("This entry has no public page yet.");
		expect(strings).toContain("Content types");
		expect(strings).toContain("1 search term used in fewer than 2 sessions is not shown.");
		// The agent catalog names the `collections` report, so it is checked for dashes only.
		const catalog = [CONTENT_CATALOG.collections.rule, CONTENT_CATALOG.site_search.rule, ...Object.values(CONTENT_CATALOG.collections.metrics), ...Object.values(CONTENT_CATALOG.site_search.metrics)];
		for (const t of catalog) expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
		for (const t of strings) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});

	it("header summary and live badge strings carry no dash and no forbidden word", () => {
		const q = { from: "2026-03-01", to: "2026-03-14", filters: [{ dim: "country" as const, op: "is" as const, values: ["DE"] }] };
		const strings = [
			...(["none", "previous", "year", "segment"] as const).map((compare) => headSummary({ ...q, compare }, "UTC", "All sites", "Segment from the link")),
			"active now",
		];
		expect(strings[1]).toBe("All sites, 2026-03-01 to 2026-03-14, vs previous period, Segment from the link, 1 filter");
		for (const t of strings) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});

	it("filtered delete strings (Data page, Delete tab) carry no dash and no forbidden word", () => {
		const src = readFileSync("src/admin/pages/DataDelete.tsx", "utf8");
		const strings = [
			"Delete matching visits",
			"Preview matching visits",
			"Typical bot visit",
			"One page view, no active time and no scroll (combine it with a country or a browser above)",
			"Top values of the matches",
			"Check that this is the traffic you mean to delete.",
			"What is removed",
			"Revenue changes",
			"Older days",
			"Keep it out",
			"Nothing is added for you.",
			"Recent deletions",
			"No deletions yet.",
			"Cancel delete",
			"Cancelling: storing the touched days again.",
			"Paused: the daily write guard is high, so recording keeps priority.",
			"Paused: today's rows for deleting are used.",
			"It continues by itself after 00:00 UTC.",
			"Phone, under 576 px",
			"Desktop, 1200 px and wider",
		];
		const spec = DeleteSpecSchema.parse({ from: "2026-03-01", to: "2026-03-07", filters: [{ dim: "browser", op: "not_regex", values: ["^Head"] }], screen: ["xs"], hours: { from: 22, to: 3 }, shape: "single_view_idle", oldDays: true });
		expect(describeSpec(spec)).toBe("2026-03-01 to 2026-03-07: browser not regex ^Head; screen xs; hour 22 to 3; one page view, no active time, no scroll; whole summaries of older days");
		for (const t of [...strings, describeSpec(spec)]) {
			if (strings.includes(t)) expect(src.includes(t), t).toBe(true);
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});

	it("page wiring strings (first run, errors, Data attention, trends, sidebar) carry no dash and no forbidden word", () => {
		const files = ["Overview", "Data", "SitesSummary", "SearchSeo", "Links", "Sources", "Search", "Behaviour"].map((p) => `src/admin/pages/${p}.tsx`);
		const src = [...files, "src/admin/components/ReportNotices.tsx", "src/admin/pages/report.tsx", "src/index.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
		const strings = [
			"No visits yet",
			"The report starts with the first stored visit, and this list goes away.",
			"Page script on the site",
			"Not seen yet.",
			"The plugin adds the script to the pages it serves while Inject script tag is on.",
			"Page script settings",
			"Snippet in Definitions, Sites",
			"First visit received",
			"Not yet. Open a page of the site; the visit shows here within a minute.",
			"Check again",
			"Connect Search (optional)",
			"Clicks and positions from Google and Bing next to your pages.",
			"Open Search",
			"No visit matches these filters in this range.",
			"Visits are stored for other days.",
			"Show all",
			"The database is busy. Try again in a moment.",
			"The server could not be reached. Try again in a moment.",
			"Try again",
			"Not loaded.",
			"Needs attention",
			"Stored data",
			"Recording is paused until the next UTC day.",
			"Daily summaries are catching up.",
			"The queue tier would take the load.",
			"The Workers Free plan needs the Small profile.",
			"events were not stored today.",
			"now instead of with the nightly run. Store daily summaries writes the closed days that have none yet.",
			"Daily summaries, complete up to ",
			"Daily summaries; the first one is not stored yet.",
			": nothing in this range.",
			"Sessions with a click",
			"Visitors with a click",
			"Visits from AI assistants per day",
			"Search data arrives two to three days late. Pick an older range, or load older days in Connections.",
			'label: "Definitions"',
			'label: "Settings"',
		];
		for (const t of strings) {
			expect(src.includes(t), t).toBe(true);
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});

	it("table strings (column menu, skip link, value filter) carry no dash and no forbidden word", () => {
		const src = ["src/admin/components/DataTable.tsx", "src/admin/components/ui.tsx", "src/admin/pages/report.tsx", "src/admin/components/Header.tsx"].map((f) => readFileSync(f, "utf8")).join("\n");
		const strings = ["Columns", "Export and columns: ", "Skip to report", "Filter by this value"];
		for (const t of strings) {
			expect(src.includes(t), t).toBe(true);
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});

	it("annotation scope strings carry no dash and no forbidden word", () => {
		const scope: Scope = { v: 1, host: [{ op: "is", value: "a.org" }], path: [{ op: "prefix", value: "/b/" }], query: [{ op: "regex", value: "^x" }] };
		const strings = [
			...Object.values(SCOPE_MESSAGES),
			...Object.values(KIND_LABELS),
			scopeSummary(scope),
			scopeSummary(undefined),
			"Show annotations to viewers",
			"Annotation texts are visible to anyone with the link.",
			"Showing the newest 500 of this range",
			"Search charts only",
		];
		for (const t of strings) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
		expect(SCOPE_MESSAGES).toMatchObject({
			empty: "Add at least one rule or choose Site-wide.",
			host: "Host must be a lowercase hostname without scheme or port.",
			path: "Path must start with /.",
			count: "At most 10 rules per kind and 20 in total.",
			mixed: "Combine fewer rules of different kinds in one scope.",
			noSource: "Query rules apply to Search data only; this site has no Search source yet.",
		});
	});

	it("SEO view and impact strings carry no dash and no forbidden word; fixed texts verbatim", () => {
		const strings = [
			...Object.values(SEO_TEXT),
			...Object.values(SEO_NOTICES),
			...Object.values(PATTERN_LABELS),
			...Object.values(DIAGNOSIS_LABELS),
			...IMPACT_OPTIONS.map((o) => o[3]),
			...Object.values(IMPACT_TEXT).map((t) => (typeof t === "function" ? (t as (a: number, b: number) => string)(9, 28) : t)),
			periodLine({ current: { from: "2026-10-14", to: "2026-11-10" }, previous: { from: "2026-09-16", to: "2026-10-13" }, days: 28, excluded: 3, reason: "provisional" }),
			"Rising",
			"Declining",
			"Notable only",
			"Declining over three periods",
			"Include brand queries",
		];
		for (const t of strings) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
		expect(SEO_TEXT.caution).toBe("Before and after comparisons show correlation, not causation. Seasonality, other changes and search engine updates overlap; annotations in the same window are listed.");
		expect(SEO_TEXT.coverage).toBe("Based on Google Search Console data of the stored page and query rows. Google omits rare queries and keeps top rows only, so shares are of visible queries.");
		expect(SEO_TEXT.rangeTooLong).toBe("This view reads detailed rows and is limited to 93 days. Choose a shorter range.");
		expect(periodLine({ current: { from: "2026-10-14", to: "2026-11-10" }, previous: { from: "2026-09-16", to: "2026-10-13" }, days: 28, excluded: 3, reason: "provisional" })).toBe(
			"Comparing 2026-10-14 to 2026-11-10 with the 28 days before; the newest 3 days are excluded as provisional",
		);
		expect(IMPACT_TEXT.incomplete(9, 28)).toBe("The after window has 9 of 28 days; numbers will change.");
	});

	it("Annotations page strings carry no dash and no forbidden word; the caution is one plain sentence", () => {
		const call = (t: unknown) => (typeof t === "function" ? (t as (a: string | number, b: number) => string)(5, 14) : String(t));
		const strings = [
			...Object.values(ANNOTATIONS_TEXT).map(call),
			ANNOTATIONS_TEXT.overlaps("Price change"),
			ANNOTATIONS_TEXT.overlapsMore("Price change", 2),
			ANNOTATIONS_TEXT.searchLag("2026-03-12"),
			...Object.values(GROUP_HINTS),
			...Object.values(VERDICT_WORDS),
			...Object.values(TARGET_MESSAGES),
			"Open in Annotations",
			"Search charts only",
			"Details",
			"Hide",
			"Target KPI",
			"Same scope and windows",
			"Choose a goal",
		];
		for (const t of strings) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
		expect(ANNOTATIONS_TEXT.dayOf(5, 14)).toBe("Day 5 of 14");
		expect(Object.values(VERDICT_WORDS)).toEqual(["Up", "Down", "Flat", "Too early", "Not enough data"]);
		expect(ANNOTATIONS_TEXT.caution.split(". ")).toHaveLength(1);
	});

	it("revenue receipt lines and the agent event reasons carry no dash and no forbidden word", () => {
		for (const t of [REVENUE_LINE, ORDER_SESSION_LINE, "unknown_order"]) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});

	it("user agent rule strings carry no dash and no forbidden word", () => {
		const call = (v: unknown) => (typeof v === "function" ? (v as (...a: unknown[]) => string)("x", 2) : String(v));
		const texts = [
			...Object.entries(UA_RULES_TEXT).filter(([k]) => k !== "diff").map(([, v]) => call(v)),
			UA_RULES_TEXT.saved(0),
			UA_RULES_TEXT.saved(1),
			UA_RULES_TEXT.diff({ added: [1], changed: [], removed: [], unchanged: 2 }),
			...Object.values(RULE_TEXT).map(call),
			"List",
			"Edit as text",
			"Rules, one per line",
			"Check",
			"Download .txt",
			"Load a file",
			"Built-in list",
			"Force human",
			"No entries match.",
		];
		for (const t of texts) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});

	it("Settings page strings, section names and field texts carry no dash and no forbidden word", () => {
		const fixed = Object.values(SETTINGS_TEXT).map((v) => (typeof v === "function" ? `${v(1, "out", "slug")} ${v(3, "out", "slug")}` : v));
		// Field texts come from the schema (the host form shows them as well; "Do Not Track" is a name): dashes only.
		const fields = SETTINGS_SECTIONS.flatMap((sec) => sec.keys.flatMap((k) => { const f = fieldMeta(k); return [f.label, f.help, f.more ?? "", f.unit ?? "", ...(f.options ?? []).map((o) => o.label)]; }));
		for (const t of fields) expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
		const errors = Object.values(validateSettings({ siteId: "X", siteTimezone: "x", siteOrigin: "x", scriptPath: "x", collectPath: "x", sharePath: "x", namespace: "x", excludePaths: "x", sessionWindowMinutes: -1, captureRegion: 1, signals: 1, ignoreReferrerHosts: 1, gscAuth: "off", nope: 1, badExperienceSeconds: 60, longClickSeconds: 10 }, {}).errors);
		expect(errors.length).toBeGreaterThan(14);
		for (const t of [...fixed, ...SETTINGS_SECTIONS.map((sec) => sec.label), ...errors, HOST_FORM_POINTER]) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
		// Plain words: no unit left in a label, no key names shown as labels.
		for (const sec of SETTINGS_SECTIONS) for (const k of sec.keys) expect(fieldMeta(k).label, k).not.toMatch(/\((minutes|seconds|days|hours|months|percent|ms)\)$|^[a-z]+[A-Z]/);
	});
});

describe("tile titles", () => {
	const t = (report: string, kind: string, extra: Record<string, unknown> = {}) => tileTitle({ id: "t00001", report, kind, w: 1, ...extra } as Parameters<typeof tileTitle>[0]);
	it("reads as plain words, not report: metric", () => {
		expect(t("timeseries", "line", { metrics: ["sessions"] })).toBe("Sessions over time");
		expect(t("search_overview", "line", { metrics: ["clicks", "impressions", "ctr"] })).toBe("Clicks, Impressions and CTR over time");
		expect(t("revenue_series", "area", { metrics: ["revenue"] })).toBe("Revenue over time");
		expect(t("overview", "kpi", { metric: "bounce_rate" })).toBe("Bounce rate");
		expect(t("impact", "kpi", { metric: "sessions" })).toBe("Impact on sessions");
		expect(t("pages", "bars")).toBe("Top pages");
		expect(t("channels", "table", { metric: "visitors" })).toBe("Top channels");
		expect(t("devices", "donut")).toBe("Devices");
		expect(tileTitle({ id: "t00001", report: "revenue", kind: "kpi", w: 1, metric: "revenue" }, "USD")).toBe("Revenue (USD)");
		expect(tileTitle({ id: "t00001", report: "pages", kind: "bars", w: 1, title: "My pages" })).toBe("My pages");
	});
	it("has no colon, dash or forbidden word in any default title", async () => {
		const { TILE_KINDS, TILE_METRICS } = await import("../src/dashboards/schema.js");
		for (const [report, kinds] of Object.entries(TILE_KINDS))
			for (const kind of kinds)
				for (const metric of [undefined, ...((TILE_METRICS as Record<string, readonly string[] | undefined>)[report] ?? [])]) {
					const title = t(report, kind, metric ? (kind === "line" || kind === "area" ? { metrics: [metric] } : { metric }) : {});
					expect(title.includes(":"), title).toBe(false);
					expect(DASHES.some((d) => title.includes(d)), title).toBe(false);
					for (const w of FORBIDDEN_PUBLIC_WORDS) expect(title.toLowerCase().includes(w), `${title}: ${w}`).toBe(false);
				}
	});
});

describe("chart copy", () => {
	it("hints, controls and tooltip words carry no dash and no forbidden word", () => {
		const strings = [
			...Object.values(HINTS),
			"Show as table",
			"Chart values. Use the arrow keys.",
			"Dashed lines: ",
			"No data",
			"This period",
			"Comparison period",
			"Reset",
			"Not loaded.",
			"Position (1 is best)",
			"Left axis",
			"Right axis",
			"Visitors is small next to Pageviews on this scale.",
			"Visitors 820, up 12.0 percent, better, +88, from 732",
			bucketText("2026-03-09"),
			bucketText("2026-03-09 14:00", "hour"),
			bucketText("2026-03-09", "week"),
			rangeText("2025-12-20", "2026-01-02"),
		];
		const source = ["src/admin/components/Chart.tsx", "src/admin/components/MetricChart.tsx", "src/admin/components/KpiCard.tsx"].map((f) => readFileSync(f, "utf8")).join("\n");
		for (const t of strings) {
			if (!/\d/.test(t) && !t.includes("is small next to")) expect(source.includes(t.replace(/ $/, "")), t).toBe(true);
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});
});

describe("dashboard copy", () => {
	it("menu, picker, share cell, legend and checklist words carry no dash and no forbidden word", async () => {
		const { tileMetricsProblem } = await import("../src/dashboards/schema.js");
		const { TRIMMED_COMPARE } = await import("../src/dashboards/tiles.js");
		const strings = [
			"New dashboard",
			"Start blank",
			"An empty dashboard to fill with your own tiles.",
			"From a file",
			"A template file exported from a dashboard on this or another site.",
			"Choose a file",
			"Use and schedule email",
			"No dashboards yet. Choose New dashboard to start from a template or a blank one.",
			"no expiry",
			"More",
			"Show annotations",
			"Copy to sites",
			"Export with dependencies",
			"Schedule email",
			"Metrics",
			"Up to 4, on at most two scales. Viewers can hide lines, not add them.",
			"One metric stays on.",
			"An impact line shows one metric.",
			" Turn one off first.",
			"Small screen: showing the first 2 metrics.",
			TRIMMED_COMPARE,
			...[[], ["a", "b", "c", "d", "e"], ["clicks", "ctr", "position"]].map((l) => tileMetricsProblem(l) ?? ""),
		];
		const source = readFileSync("src/admin/pages/Dashboards.tsx", "utf8");
		for (const t of strings) {
			if (/^[A-Z ]/.test(t) && !t.includes("metrics at once") && !t.includes("more than two") && !t.includes("at least one") && t !== TRIMMED_COMPARE) expect(source.includes(t), t).toBe(true);
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});
});

describe("Search Satisfaction copy", () => {
	it("every Search Satisfaction text carries no dash and no forbidden word, and the shared ones end the sentence", async () => {
		const { satisfactionDefinition, SATISFACTION_DEFINITIONS, PANEL_DEFINITIONS } = await import("../src/charts/definitions.js");
		const { LOW_SAMPLE, lowSampleLine, POGO_DEFINITION, RETURNED_DEFINITION, SCORE_DEFINITION } = await import("../src/query/reports/satisfaction-copy.js");
		const { LOW_SAMPLE_COMPARE, metricLabel } = await import("../src/dashboards/tiles.js");
		const { settingsSchema } = await import("../src/settings.js");
		const { SATISFACTION_CATALOG } = await import("../src/agent/schemas.js");
		const keys = ["sessions", "measured", "measured_rate", "avg_duration", "avg_engaged", "pct_long", "pct_short", "pct_bad", "pogo_stick_rate", "pogo_sticks", "returned_from_search_rate", "returned_from_search", "search_reentry_rate", "reentered", "back_nav_rate", "score"];
		const sentences = [
			...keys.map((k) => satisfactionDefinition(k) ?? ""),
			...Object.values(SATISFACTION_DEFINITIONS),
			PANEL_DEFINITIONS.satisfaction,
			PANEL_DEFINITIONS.best_pages,
			PANEL_DEFINITIONS.worst_pages,
			PANEL_DEFINITIONS.pogo_engines,
			POGO_DEFINITION,
			RETURNED_DEFINITION,
			SCORE_DEFINITION,
			lowSampleLine(30),
			LOW_SAMPLE_COMPARE,
			settingsSchema.satisfactionMinMeasured.description,
			"They count as sessions and in Avg. session duration, and are left out of every rate, the score and the average active time.",
		];
		const words = [LOW_SAMPLE, "Measured share", "Measured sessions", settingsSchema.satisfactionMinMeasured.label, metricLabel("search_reentry_rate"), metricLabel("back_nav_rate"), metricLabel("low_sample"), "Search re-entry (estimate)", SATISFACTION_CATALOG.params.rank];
		const page = readFileSync("src/admin/pages/Satisfaction.tsx", "utf8");
		for (const t of ["Measured share", "Measured sessions", "sample minimum", "They count as sessions and in Avg. session duration"]) expect(page.includes(t), t).toBe(true);
		expect(readFileSync("src/admin/components/ImpactPanel.tsx", "utf8")).toContain('"Search re-entry (estimate)"');
		for (const t of sentences) {
			expect(t.length, t).toBeGreaterThan(0);
			expect(t.endsWith("."), t).toBe(true);
		}
		for (const t of [...sentences, ...words]) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});
});

describe("metric definition copy", () => {
	it("every definition, column text, footnote, notice and label of the figures carries no dash and no forbidden word, and every sentence ends", async () => {
		const { COLUMN_DEFINITIONS, LINK_DEFINITIONS, METRIC_DEFINITIONS, PANEL_DEFINITIONS, tileDefinition } = await import("../src/charts/definitions.js");
		const { CAVEATS, noticeCopy, SEO_NOTICES } = await import("../src/charts/caveats.js");
		const { SEO_TEXT, baseWords } = await import("../src/query/reports/seo-copy.js");
		const { metricLabel } = await import("../src/dashboards/tiles.js");
		const { settingsSchema } = await import("../src/settings.js");
		const { METRICS, SEO_CATALOG } = await import("../src/agent/schemas.js");
		const { LINKS_NOTE } = await import("../src/admin/pages/Links.js");
		const { SCROLL_TEXT } = await import("../src/admin/pages/Behaviour.js");
		const { SEARCH_ROWS_TEXT } = await import("../src/admin/pages/Search.js");
		const { ATTRIBUTION_NOTE } = await import("../src/admin/pages/Revenue.js");
		const { WIDGET_COMPARE } = await import("../src/admin/widget.js");
		const { SATISFACTION_RANKS } = await import("../src/admin/pages/Dashboards.js");
		const { BUILTIN_NAMES, readTemplate } = await import("../src/dashboards/templates.js");
		const { tileTitle } = await import("../src/dashboards/tiles.js");
		// Every tile title of the built-in templates other than Search Satisfaction, as a dashboard prints it.
		const tileTitles = BUILTIN_NAMES.filter((n) => n !== "satisfaction").flatMap((n) => readTemplate({ builtin: n }).tiles.map((t) => tileTitle(t)));
		// The definition maps are partial records: their values are the texts.
		const vals = (o: Readonly<Record<string, string | undefined>>): string[] => Object.values(o).map((t) => t ?? "");
		const maps: string[] = [METRIC_DEFINITIONS, PANEL_DEFINITIONS, COLUMN_DEFINITIONS, LINK_DEFINITIONS, SCROLL_TEXT, SEARCH_ROWS_TEXT].flatMap(vals);
		// Record lookups are typed as possibly undefined; an absent text fails the length check below.
		const sentences = [
			...maps,
			tileDefinition("satisfaction", "sessions") ?? "",
			CAVEATS.visitors,
			CAVEATS.duration,
			CAVEATS.active_time,
			CAVEATS.bounce_footnote,
			CAVEATS.duration_footnote,
			SEO_NOTICES.top3_insufficient,
			noticeCopy("exit_rate_segment") ?? "",
			SEO_TEXT.striking,
			SEO_TEXT.decay,
			LINKS_NOTE,
			ATTRIBUTION_NOTE,
			settingsSchema.engagedThresholdSeconds.description,
			settingsSchema.realtimeWindowMinutes.description,
			settingsSchema.searchMinImpressions.description,
		].map((t) => t ?? "");
		// The agent catalog is served to API keys only, never to a visitor: it names reports such as collections, so only the dash rule applies.
		const catalog = [...Object.values(METRICS), SEO_CATALOG.periodRule, SEO_CATALOG.bandRule].map((t) => t ?? "");
		for (const t of catalog) expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
		const words = [
			WIDGET_COMPARE,
			SEO_TEXT.top3Insufficient,
			...["sessions", "pageviews", "entries", "orders", "visitors", "measured", "impressions"].map((b) => baseWords(b, "overview")),
			...["converting", "conversion_rate", "rate", "conversion", "drop_off", "delta", "delta_pct", "overlapping_queries_pct", "overlapping_impressions_pct", "potential_clicks", "avg_duration", "conversions", "measured_rate"].map(metricLabel),
			...SATISFACTION_RANKS.map(([, label]) => label),
			...tileTitles,
		];
		// The labels themselves, from the code that prints them: tiles name figures as the admin pages do.
		expect(["avg_duration", "converting", "conversion_rate", "conversions", "measured_rate"].map(metricLabel)).toEqual(["Avg. session duration", "Converting sessions", "Conversion rate", "Sales", "Measured share"]);
		// Search Satisfaction names its pages landing pages; every other place says entry page.
		expect(SATISFACTION_RANKS[0]).toEqual(["", "Busiest landing pages"]);
		expect(tileTitles.filter((t) => /landing page/i.test(t))).toEqual([]);
		expect(tileTitles).toEqual(expect.arrayContaining(["Entry pages", "Revenue by entry page"]));
		for (const t of sentences) {
			expect(t.length, t).toBeGreaterThan(0);
			expect(t.endsWith(".") || t.endsWith(")"), t).toBe(true);
		}
		for (const t of [...sentences, ...words]) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});
});

describe("engaged threshold text", () => {
	it("says a bounce is a session that is not engaged, so a one page session over the threshold is no bounce", async () => {
		const { settingsSchema } = await import("../src/settings.js");
		const text = settingsSchema.engagedThresholdSeconds.description;
		expect(text).toBe("Active time from which a session counts as engaged. A session with two or more page views or any event is engaged whatever its active time. A session that is not engaged is a bounce.");
		for (const f of ["docs/settings.md", "docs/wiki/Settings-Reference.md"]) expect(readFileSync(f, "utf8"), f).toContain(text);
	});
});

describe("entry and landing pages", () => {
	it("README, the dashboard docs and the templates say entry page; landing page only where Search Satisfaction speaks", () => {
		const lines = ["README.md", "docs/dashboards.md", "docs/revenue.md", "docs/wiki/Reports.md", "docs/wiki/Revenue-and-Refunds.md"].flatMap((f) => readFileSync(f, "utf8").split("\n").map((l) => `${f}: ${l}`));
		expect(lines.filter((l) => /landing page/i.test(l) && !/satisfaction/i.test(l))).toEqual([]);
		const templates = readdirSync("src/data/templates").filter((f) => f.endsWith(".json") && f !== "satisfaction.json");
		expect(templates.length).toBeGreaterThan(10);
		for (const f of templates) expect(readFileSync(`src/data/templates/${f}`, "utf8"), f).not.toMatch(/landing page/i);
	});
});

describe("change words", () => {
	it("every change text, note and compare label carries no dash and no forbidden word", () => {
		const cases = [
			describeChange("visitors", 2156, 1925, { format: "number" }),
			describeChange("bounce_rate", 0.38, 0.41, { format: "percent", base: 50 }),
			describeChange("avg_duration", 60, 135, { format: "duration" }),
			describeChange("position", 7.8, 8.2, { format: "decimal" }),
			describeChange("revenue", -50, -100, { format: "money:EUR" }),
			describeChange("orders", 5, 0, { format: "number" }),
			describeChange("visitors", 5, 5, { format: "number" }),
			describeChange("realtime", 9, 4, { format: "number" }),
			describeChange("clicks", 10, null, { format: "number" }),
			describeChange("score", 0.24, 0.2, { format: "points", base: 300 }),
			describeChange("score", -0.1, 0.2, { format: "points", base: 20 }),
		];
		const range = { from: "2026-10-01", to: "2026-10-28" };
		const strings = [
			...cases.flatMap((c) => [c.label, c.detail, c.words, changeText(c), changeText(c, true)]),
			SMALL_NOTE,
			MISSING_NOTE,
			", small numbers",
			"vs yesterday",
			...[
				{ compare: "previous", compareRange: range },
				{ compare: "year", compareRange: range },
				{ compare: "segment", compareRange: range, compareSegment: { id: "s", name: "Returning visitors" } },
			].map((r) => compareText(r as never) ?? ""),
		];
		expect(strings).toContain("vs previous period (1 Oct to 28 Oct)");
		for (const t of strings) {
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});
});

describe("report notices", () => {
	// Every string literal a reader puts into a notices list: `"code"` in an array or push, and `` `code:${...}` ``.
	const sources = files.filter((f) => /^src\/.*\.tsx?$/.test(f) && !/^src\/(admin|charts|client)\//.test(f));
	// Other fields that share a line with a notices list.
	const NOT_NOTICES = new Set(["week", "up", "traffic"]);
	const produced = new Map<string, string>();
	for (const f of sources)
		readFileSync(f, "utf8")
			.split("\n")
			.forEach((line, i) => {
				if (!/notices|return \["/i.test(line)) return;
				for (const m of line.matchAll(/(?:\[|push\(|\? |, |\.\.\.\[)\s*"([a-z][a-z0-9_]*)"/g)) if (!NOT_NOTICES.has(m[1] as string)) produced.set(m[1] as string, `${f}:${i + 1}`);
				for (const m of line.matchAll(/`([a-z][a-z0-9_]*):\$\{/g)) produced.set(m[1] as string, `${f}:${i + 1}`);
			});

	it("finds the codes of the summary routing", () => {
		for (const c of ["summary", "compare_summary", "detail_from", "filter_unavailable", "ignored_dim", "revenue_not_available", "top_paths_per_day", "granularity_day", "exit_rate_partial"]) expect(produced.has(c), c).toBe(true);
	});

	it("every code a reader returns has copy in NOTICE_COPY", () => {
		const missing = [...produced].filter(([c]) => !(c in NOTICE_COPY)).map(([c, at]) => `${c} (${at})`);
		expect(missing).toEqual([]);
	});

	it("every text carries no dash and no forbidden word", () => {
		const ctx = { label: (d: string) => d, filtered: ["country", "device"] };
		const texts = Object.entries(NOTICE_COPY).flatMap(([c, f]) => (f ? [f(["country", "combination"], ctx), f(["page", "not_kept"], {}), noticeCopy(c) ?? ""] : []));
		expect(texts.length).toBeGreaterThan(20);
		for (const t of texts) {
			expect(t.trim(), t).not.toBe("");
			expect(DASHES.some((d) => t.includes(d)), t).toBe(false);
			for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${t}: ${w}`).toBe(false);
		}
	});

	it("chip reasons follow the copy list", () => {
		const label = (d: string) => ({ country: "country", device: "device", page: "page" })[d] ?? d;
		expect(filterReason("device", "combination", { label, filtered: ["country", "device"] })).toBe("Device cannot be combined with country in summary data.");
		expect(filterReason("region", "not_kept")).toBe("Region is not kept in summary data.");
		expect(noticeText(["summary", "compare_summary", "detail_from:2026-03-01", "filter_unavailable:region:not_kept"])).toEqual([
			NOTICE_COPY.summary?.([], {}),
			"Detailed data starts on 2026-03-01. A range from that day applies every filter.",
			"Region is not kept in summary data.",
		]);
		expect(noticeText(["compare_summary"])).toEqual(["The comparison range is answered from daily summaries."]);
		expect(noticeText(["coverage", "unknown_code"])).toEqual([]);
	});
});
