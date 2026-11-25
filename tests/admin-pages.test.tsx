// @vitest-environment jsdom
/** Report pages: every tab against mocked `data/query`, empty states, click to filter, rollup notice, search columns. */
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pages } from "../src/admin/index.js";
import { resetSearchStatus } from "../src/admin/api.js";
import Audience from "../src/admin/pages/Audience.js";
import Behaviour, { FUNNEL_REVENUE_NOTE, SITE_SEARCH_TEXT } from "../src/admin/pages/Behaviour.js";
import Pages from "../src/admin/pages/Pages.js";
import Revenue, { ATTRIBUTION_NOTE, ORDERS_NOTE, REFUNDS_NOTE, REVENUE_GUIDE } from "../src/admin/pages/Revenue.js";
import { ORDERS_RAW_ONLY } from "../src/query/reports/revenue-copy.js";
import { QuerySchema, REVENUE_BREAKDOWN_DIMS } from "../src/query/filters.js";
import Satisfaction from "../src/admin/pages/Satisfaction.js";
import Sources, { AI_CHANNEL as SOURCES_AI } from "../src/admin/pages/Sources.js";
import { AI_CHANNEL } from "../src/query/reports/sources.js";
import { SETTINGS_HREF } from "../src/admin/components/ReportNotices.js";
import { decodeState } from "../src/admin/state.js";
import { CAVEATS } from "../src/admin/components/ui.js";
import { COLUMN_DEFINITIONS, metricDefinition, satisfactionDefinition } from "../src/charts/definitions.js";
import { ADMIN_PAGES } from "../src/index.js";
import { SATISFACTION_RAW_ONLY } from "../src/query/reports/satisfaction-copy.js";
import { SITE_NOTICES } from "../src/charts/caveats.js";

type Body = { report: string; query: Record<string, unknown>; params?: Record<string, unknown>; [k: string]: unknown };
let calls: Array<{ route: string; body: Body }> = [];
let notices: string[] = [];
let empty = false;
let dataNotices: string[] = [];
let status: Response | null = null;
let funnels: unknown[] = [];
let rawOnly = false;
/** Appended to the raw_only message, as the routes do when the detailed window is known. */
let rawFromLine = "";
let revenueOn = false;
/** Refunds in the range of the revenue stubs. */
let refundsOn = false;
/** First detailed day of the `revenue_orders` stub: a range starting earlier answers raw_only. */
let ordersFrom: string | null = null;
/** Extra fields of the local site in `sites/list` (for example `captureRegion`). */
let siteExtra: Record<string, unknown> = {};
/** `dimension_values` answers an error (the Journeys page picker). */
let refusePages = false;
/** Rows of every `satisfaction` answer instead of the one landing page; `min_measured` of the answer (absent: an older site). */
let satRows: Array<Record<string, unknown>> | null = null;
let satMin: number | undefined = 30;

/** A column header's label without its info mark. */
const headText = (t: Element) => t.querySelector("button:not(.ca-info-btn)")?.textContent ?? t.textContent;
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

/** Row shapes as the reports in `src/query/reports/*.ts` return them. */
const SESSION = { visitors: 5, sessions: 6, pageviews: 8, views_per_session: 1.3333, bounce_rate: 0.5, engaged_rate: 0.5, avg_duration: 42 };
const SEARCH = { clicks: 7, impressions: 100, ctr: 0.07, position: 4.5 };
const AUTO = { events: 7, sessions: 3 };
function rows(report: string): Array<Record<string, unknown>> {
	if (empty) return [];
	switch (report) {
		case "pages":
			return [{ key: "/a", pageviews: 9, visitors: 5, avg_time: 30, avg_visible: 45, exit_rate: 0.5, scroll_median: 50, ...SEARCH }];
		case "entry_pages": {
			const { sessions: _s, ...rest } = SESSION;
			return [{ key: "/entry", ...rest, entries: 6 }];
		}
		case "exit_pages":
			return [{ key: "/exit", exits: 4, visitors: 3, exit_rate: 0.25 }];
		case "not_found":
			return [{ key: "/missing", ref: "other.example", hits: 3, last_seen: 1_772_000_000 }];
		case "ai_referrals":
			return [{ key: "chatgpt.com", ...SESSION, landing: [{ path: "/x", sessions: 2 }, { path: "/y", sessions: 1 }] }];
		case "events":
			return [{ key: "events one", events: 7, sessions: 3, rate: 0.1 }];
		case "event_props":
			return [{ key: "plan=pro", prop: "plan", value: "pro", count: 4 }];
		case "goals":
			return [{ key: "goals one", type: "page", completions: 4, converting: 3, conversion_rate: 0.06 }];
		case "funnels":
			return [
				{ key: "1", label: "Landing", sessions: 10, drop_off: 0, conversion: 1 },
				{ key: "2", label: "Signup", sessions: 4, drop_off: 0.6, conversion: 0.4 },
			];
		case "outbound":
		case "downloads":
		case "forms":
			return [{ key: `${report} one`, ...AUTO }];
		case "scroll":
			return [0, 25, 50, 75, 100].map((b) => ({ key: String(b), pageviews: b + 1, share: 0.2 }));
		case "satisfaction":
			return (
				satRows ?? [{ key: "/land", sessions: 6, measured: 5, avg_duration: 42, pct_long: 0.4, pct_short: 0.6, pct_bad: 0.2, pogo_stick_rate: 0.1, returned_from_search_rate: 0.05, search_reentry_rate: 0.05, back_nav_rate: 0.15, score: 0.1, low_sample: false, previous: { score: 0.05, low_sample: false }, delta: { score: 1 } }]
			);
		case "search_page_queries":
			return [{ key: "search_page_queries one", ...SEARCH }];
		case "dimension_values":
			return [{ key: "/pricing" }, { key: "/docs" }];
		case "journey_next":
		case "journey_prev":
			return [{ key: `${report} page`, sessions: 4, share: 0.5 }];
		case "journey_paths":
			return [{ key: "/ > /pricing > (exit)", path1: "/", path2: "/pricing", path3: "(exit)", sessions: 3 }];
		case "site_search":
			return [{ key: "red shoes", searches: 4, sessions: 3, searches_per_session: 1.33, sessions_upper_bound: true }];
		default:
			return [{ key: `${report} one`, ...SESSION }];
	}
}

/** Every column of every shown table has a value in the first row, so a wrong column key cannot pass. */
function expectFilledCells(container: HTMLElement) {
	for (const table of container.querySelectorAll("table")) {
		const cells = [...(table.querySelector("tbody tr")?.querySelectorAll("td") ?? [])].map((td) => td.textContent);
		expect(cells.length).toBeGreaterThan(1);
		expect(cells, table.getAttribute("aria-label") ?? "").not.toContain("-");
	}
}

/** Let pending fetch answers settle, so an absence check runs after the state update it depends on. */
const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)));

beforeEach(() => {
	resetSearchStatus();
	calls = [];
	notices = [];
	empty = false;
	dataNotices = [];
	status = null;
	funnels = [];
	rawOnly = false;
	rawFromLine = "";
	revenueOn = false;
	refundsOn = false;
	ordersFrom = null;
	siteExtra = {};
	refusePages = false;
	satRows = null;
	satMin = 30;
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-03-01&to=2026-03-07");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, timezone: "UTC", ...siteExtra }] });
			if (route === "config/segments/list") return ok({ items: [] });
			if (route === "config/funnels/list") return funnels ? ok({ items: funnels }) : new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Forbidden" } }), { status: 403 });
			if (route === "search/status") return status ?? new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "No route" } }), { status: 404 });
			if (refusePages && body.report === "dimension_values") return new Response(JSON.stringify({ error: { code: "invalid_params", message: "Pages could not be listed." } }), { status: 400 });
			if (rawOnly && body.report.startsWith("satisfaction"))
				return new Response(JSON.stringify({ error: { code: "raw_only", message: SATISFACTION_RAW_ONLY + rawFromLine } }), { status: 400 });
			if (body.report === "satisfaction_series")
				return ok({
					report: body.report,
					range: { from: body.query.from, to: body.query.to },
					compare: "none",
					compareRange: null,
					notices,
					data: { series: [{ t: "2026-03-01", pct_long: 0.4, pct_short: 0.6, pct_bad: 0.2, pogo_stick_rate: 0.1, returned_from_search_rate: 0.05 }, { t: "2026-03-02", pct_long: 0.5, pct_short: 0.5, pct_bad: 0.1, pogo_stick_rate: 0.2, returned_from_search_rate: 0.1 }], granularity: "day", annotations: [{ id: "a1", ts: Date.UTC(2026, 2, 2, 12) / 1000, day: "2026-03-02", kind: "release", text: "Fix", scope: null, summary: "Site-wide" }], thresholds: { long_click_seconds: 60, bad_experience_seconds: 10 } },
				});
			const base = { report: body.report, range: { from: body.query.from, to: body.query.to }, compare: "none", compareRange: null, notices };
			// Revenue: the currency follows params.currency, USD by default.
			const cur = (body.params?.currency as string | undefined) ?? "USD";
			const currencies = revenueOn ? [{ currency: "USD", revenue: 59.9, orders: 2 }, { currency: "EUR", revenue: 120, orders: 3 }].sort((a) => (a.currency === cur ? -1 : 1)) : [];
			const refunds = refundsOn ? { refunds: 10, net_revenue: 49.9 } : { refunds: 0, net_revenue: 59.9 };
			if (body.report === "overview") return ok({ ...base, data: { totals: { visitors: 77, sessions: 90, pageviews: 120 } } });
			if (body.report === "revenue")
				return ok({ ...base, data: { currency: cur, hasRevenue: revenueOn, currencies, totals: { revenue: 59.9, ...refunds, orders: 2, aov: 29.95, revenue_per_visitor: 1.5, revenue_per_session: 1.2, paying_sessions: 2 }, rows: [] } });
			if (body.report === "revenue_orders") {
				if (ordersFrom && String(body.query.from) < ordersFrom)
					return new Response(JSON.stringify({ error: { code: "raw_only", message: `${ORDERS_RAW_ONLY} Detailed data starts on ${ordersFrom}.` } }), { status: 400 });
				const order = { key: "o.0a1b2c3d4e5f60718293", day: "2026-03-05", amount: 49.9, refund: false, channel: "Search", entry: "/pricing", country: "DE" };
				return ok({ ...base, data: { currency: cur, rows: refundsOn ? [{ ...order, key: "o.0a1b2c3d4e5f60718293.r1", amount: -10, refund: true }, order] : [order], truncated: false } });
			}
			if (body.report === "revenue_series") return ok({ ...base, data: { currency: cur, currencies, granularity: "day", series: [{ t: "2026-03-01", revenue: 59.9, orders: 2, aov: 29.95 }] } });
			if (body.report === "revenue_breakdown")
				return ok({
					...base,
					data: {
						currency: cur,
						currencies,
						rows: [
							{ key: `${String(body.params?.dim)} one`, revenue: 44.9, ...(refundsOn ? { refunds: 10, net_revenue: 34.9 } : {}), orders: 1, aov: 44.9, revenue_per_visitor: 1.5, visitors: 40, sessions: 50, currency: cur },
							{ key: `${String(body.params?.dim)} two`, revenue: 15, orders: 1, aov: 15, revenue_per_visitor: 0.5, visitors: 30, sessions: 30, currency: cur },
							// A key with visitors and no order: not listed on the Revenue page.
							{ key: `${String(body.params?.dim)} none`, revenue: 0, orders: 0, aov: null, revenue_per_visitor: 0, visitors: 10, sessions: 10, currency: cur },
						],
					},
				});
			if (body.report === "funnels" && body.params?.withRevenue) {
				// Funnel revenue as `funnelRevenue` answers it: the sessions that reached each step, the estimate from step 2 on.
				const money = [
					{ revenue: 120, orders: 3, aov: 40, paying_sessions: 3, revenue_per_session: 12, est_lost_revenue: null },
					{ revenue: 80, orders: 2, aov: 40, paying_sessions: 2, revenue_per_session: 20, est_lost_revenue: 120 },
				];
				return ok({ ...base, data: { currency: cur, currencies, other_currencies: currencies.map((c) => c.currency).filter((c) => c !== cur), rows: rows("funnels").map((r, i) => ({ ...r, ...money[i], revenue_currency: cur })), total_sessions: 50, mode: "sequential" } });
			}
			if (body.params?.withRevenue)
				return ok({ ...base, data: { currency: cur, rows: rows(body.report).map((r) => ({ ...r, revenue: 59.9, orders: 2, revenue_currency: cur })), total_sessions: 50 } });
			const totals = body.report === "satisfaction" ? { sessions: 50, measured: 40, measured_rate: 0.8, avg_engaged: 31, pct_long: 0.4, pct_short: 0.6, pct_bad: 0.2, pogo_stick_rate: 0.1, returned_from_search_rate: 0.05, low_sample: false } : undefined;
			const sample = body.report === "satisfaction" && satMin !== undefined ? { min_measured: satMin } : {};
			const hidden = body.report.startsWith("journey_") ? { hidden_sessions: 2 } : {};
			return ok({ ...base, data: { rows: rows(body.report), total_sessions: 50, notices: dataNotices, ...hidden, ...sample, ...(totals ? { totals, thresholds: { long_click_seconds: 60, bad_experience_seconds: 10 } } : {}) } });
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const queries = () => calls.filter((c) => c.route === "data/query").map((c) => c.body);
const reportsQueried = () => new Set(queries().map((b) => b.report));

/** Each page with its tabs and the reports each tab runs. */
const PAGES: Array<[string, () => ReactElement, Array<[string, string[]]>]> = [
	["Pages", () => <Pages />, [["Pages", ["pages"]], ["Entry pages", ["entry_pages"]], ["Exit pages", ["exit_pages"]], ["Not found", ["not_found"]]]],
	["Sources", () => <Sources />, [["Channels", ["channels"]], ["Sources", ["sources"]], ["Campaigns", ["campaigns"]], ["AI assistants", ["ai_referrals"]]]],
	["Audience", () => <Audience />, [["Countries", ["countries", "regions"]], ["Devices", ["devices"]], ["Browsers", ["browsers"]], ["OS", ["os"]], ["Languages", ["languages"]]]],
	["Behaviour", () => <Behaviour />, [["Events", ["events"]], ["Goals", ["goals"]], ["Site search", ["site_search"]], ["Outbound", ["outbound"]], ["Downloads", ["downloads"]], ["Forms", ["forms"]], ["Scroll", ["scroll"]]]],
];

describe("descriptor", () => {
	it("the Sources AI trend filters the channel the AI report reads", () => {
		expect(SOURCES_AI).toBe(AI_CHANNEL);
	});

	it("lists the five report pages in the order of the admin entry", () => {
		expect(Object.keys(pages)).toEqual(ADMIN_PAGES.map((p) => p.path));
		expect(pages["/pages"]).toBe(Pages);
		expect(pages["/satisfaction"]).toBe(Satisfaction);
		// Search Satisfaction is its own sidebar entry right after Pages, not a tab of it.
		expect(ADMIN_PAGES.map((p) => p.path).slice(2, 4)).toEqual(["/pages", "/satisfaction"]);
		expect(pages["/sources"]).toBe(Sources);
		expect(pages["/audience"]).toBe(Audience);
		expect(pages["/behaviour"]).toBe(Behaviour);
	});
});

describe.each(PAGES)("%s page", (_name, el, tabs) => {
	it("renders every tab from data/query with the URL range", async () => {
		const { getByRole, container } = render(el());
		for (const [label, reports] of tabs) {
			fireEvent.click(await waitFor(() => getByRole("tab", { name: label })));
			await waitFor(() => {
				for (const r of reports) expect(reportsQueried().has(r)).toBe(true);
			});
			await waitFor(() => expect(container.querySelector("tbody tr")).not.toBeNull());
			await settle();
			expectFilledCells(container);
			expect(getByRole("tab", { name: label }).getAttribute("aria-selected")).toBe("true");
		}
		// The trend above the tabs: one timeseries call with the page's range; on the AI tab it charts that channel.
		const ai = [{ dim: "channel", op: "is", values: [AI_CHANNEL] }];
		for (const b of queries()) expect(b.query).toMatchObject({ from: "2026-03-01", to: "2026-03-07", filters: b.report === "timeseries" && (b.query.filters as unknown[]).length ? ai : [] });
		expect(reportsQueried().has("timeseries")).toBe(_name !== "Behaviour");
	});

	it("shows the empty state on every tab", async () => {
		empty = true;
		const { getByRole, findAllByText } = render(el());
		for (const [label] of tabs) {
			fireEvent.click(await waitFor(() => getByRole("tab", { name: label })));
			expect((await findAllByText("No data for this range and these filters.")).length).toBeGreaterThan(0);
		}
	});

	it("shows the rollup notice for a range beyond the raw window", async () => {
		notices = ["summary", "filter_unavailable:region:not_kept"];
		const { findAllByText } = render(el());
		const badge = await findAllByText((_, el) => el?.getAttribute("data-label") === "Summary data");
		expect(badge.length).toBe(1);
		expect(badge[0]?.textContent).toBe(`${CAVEATS.rollup} Region is not kept in summary data.`);
	});
});

describe("click to filter", () => {
	it("a channel value adds an is chip and queries again", async () => {
		const { findByRole, container } = render(<Sources />);
		fireEvent.click(await findByRole("button", { name: "channels one" }));
		const f = [{ dim: "channel", op: "is", values: ["channels one"] }];
		await waitFor(() => expect(queries().some((b) => b.report === "channels" && JSON.stringify(b.query.filters) === JSON.stringify(f))).toBe(true));
		expect(decodeState(window.location.search, "UTC").filters).toEqual(f);
		expect(container.querySelector(".ca-chip")?.textContent).toContain("is channels one");
	});

	it("a campaign value filters on the selected UTM field", async () => {
		const { getByRole, findByRole, findByLabelText } = render(<Sources />);
		fireEvent.click(await findByRole("tab", { name: "Campaigns" }));
		fireEvent.change(await findByLabelText("UTM field"), { target: { value: "utm_medium" } });
		await waitFor(() => expect(queries().some((b) => b.report === "campaigns" && b.params?.field === "utm_medium")).toBe(true));
		fireEvent.click(getByRole("button", { name: "campaigns one" }));
		await waitFor(() => expect(decodeState(window.location.search, "UTC").filters).toEqual([{ dim: "utm_medium", op: "is", values: ["campaigns one"] }]));
		await findByRole("button", { name: "campaigns one" });
	});

	it("AI assistants list their landing pages as text", async () => {
		const { findByRole, findByText } = render(<Sources />);
		fireEvent.click(await findByRole("tab", { name: "AI assistants" }));
		expect(await findByText("/x, /y")).toBeTruthy();
	});
});

describe("notices", () => {
	it("names a compare-only rollup without the main rollup caveat", async () => {
		notices = ["compare_summary"];
		const { findByText, queryByText } = render(<Pages />);
		expect(await findByText("The comparison range is answered from daily summaries.")).toBeTruthy();
		expect(queryByText(CAVEATS.rollup)).toBeNull();
	});

	it("shows notices a report returns inside its data", async () => {
		dataNotices = ["filters_not_applied"];
		const { findByRole, findByText } = render(<Pages />);
		fireEvent.click(await findByRole("tab", { name: "Not found" }));
		expect(await findByText("Some filters do not apply to this report.")).toBeTruthy();
	});
});

describe("Site search tab", () => {
	it("marks an upper bound with the column note, and shows the enable hint when off", async () => {
		const { findByRole, findByText, getByText } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Site search" }));
		expect(await findByText("3*")).toBeTruthy();
		expect(getByText(SITE_SEARCH_TEXT.sessionsNote)).toBeTruthy();
		cleanup();
		dataNotices = ["site_search_off"];
		empty = true;
		const off = render(<Behaviour />);
		fireEvent.click(await off.findByRole("tab", { name: "Site search" }));
		expect(await off.findByText(SITE_NOTICES.site_search_off)).toBeTruthy();
		const link = within(off.getByText(SITE_NOTICES.site_search_off).closest(".ca-notice") as HTMLElement).getByRole("link", { name: "Open plugin settings" });
		expect(link.getAttribute("href")).toBe(`${SETTINGS_HREF}?tab=script`);
		expect(off.queryByText(SITE_SEARCH_TEXT.sessionsNote)).toBeNull();
	});
});

describe("Pages time columns", () => {
	it("label active time and visible time, each with its definition", async () => {
		const { findAllByRole, findByRole } = render(<Pages />);
		await findByRole("button", { name: "/a" });
		const headers = (await findAllByRole("columnheader")).map((h) => h.querySelector("button")?.textContent).filter(Boolean);
		expect(headers.slice(0, 5)).toEqual(["Page", "Pageviews", "Visitors", "Avg. active time", "Avg. visible time"]);
		const active = (await findAllByRole("columnheader")).find((h) => h.querySelector("button")?.textContent === "Avg. active time");
		expect(active?.querySelector(".ca-info-btn")?.getAttribute("title")).toBe(CAVEATS.active_time);
	});
});

describe("Pages search columns", () => {
	it("are hidden when search/status is missing", async () => {
		const { findByRole, queryByRole } = render(<Pages />);
		await findByRole("button", { name: "/a" });
		await settle();
		expect(calls.some((c) => c.route === "search/status")).toBe(true);
		expect(queryByRole("columnheader", { name: "Impressions" })).toBeNull();
		expect(queryByRole("button", { name: "Queries: /a" })).toBeNull();
		expect(queries().filter((b) => b.report === "pages").every((b) => b.params === undefined)).toBe(true);
	});

	it("are hidden when no source is configured", async () => {
		status = ok({ sources: [{ id: "google", configured: false }] });
		const { findByRole, queryByRole } = render(<Pages />);
		await findByRole("button", { name: "/a" });
		await settle();
		expect(calls.some((c) => c.route === "search/status")).toBe(true);
		expect(queryByRole("columnheader", { name: "Impressions" })).toBeNull();
		expect(queryByRole("button", { name: "Queries: /a" })).toBeNull();
		// The Pages query waits for the status, so it runs once and without search columns.
		expect(queries().filter((b) => b.report === "pages")).toHaveLength(1);
		expect(queries().find((b) => b.report === "pages")?.params).toBeUndefined();
	});

	it("appear with a configured source and open the Queries drawer per page", async () => {
		status = ok({ sources: [{ id: "google", configured: true, property: "sc-domain:example.com" }, { id: "bing", configured: false, property: "" }] });
		const { findByRole, getByRole, container } = render(<Pages />);
		await findByRole("columnheader", { name: "Impressions" });
		expect(getByRole("columnheader", { name: "Position" })).toBeTruthy();
		await waitFor(() => expect(queries().some((b) => b.report === "pages" && b.params?.withSearch === true)).toBe(true));
		expect(queries().filter((b) => b.report === "pages")).toHaveLength(1);
		expect(container.querySelector("tbody")?.textContent).toContain("7.0%");
		const opener = getByRole("button", { name: "Queries: /a" });
		opener.focus();
		fireEvent.click(opener);
		const drawer = await findByRole("complementary", { name: "Search queries for /a" });
		expect(document.activeElement).toBe(drawer);
		await waitFor(() => expect(queries().some((b) => b.report === "search_page_queries" && b.params?.page === "/a")).toBe(true));
		await within(drawer).findByText("search_page_queries one");
		fireEvent.click(within(drawer).getAllByRole("button", { name: "About this number" })[0] as HTMLElement);
		expect(within(drawer).getByRole("note").textContent).toBe(CAVEATS.searchLag);
		expectFilledCells(drawer);
		fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
		expect(container.querySelector(".ca-drawer")).toBeNull();
		expect(document.activeElement).toBe(opener);
	});
});

describe("Search Satisfaction page", () => {
	const open = async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/satisfaction?from=2026-03-01&to=2026-03-07");
		const r = render(<Satisfaction />);
		await r.findByRole("region", { name: "Key figures" });
		return r;
	};

	it("Search Satisfaction is its own page, not a tab of Pages", async () => {
		const { findByRole, queryByRole } = render(<Pages />);
		await findByRole("tab", { name: "Pages" });
		expect(queryByRole("tab", { name: "Search Satisfaction" })).toBeNull();
	});

	it("names the measured share and the session duration as the dashboard tiles do", async () => {
		const { metricLabel } = await import("../src/dashboards/tiles.js");
		const { getByRole, findAllByRole } = await open();
		const card = getByRole("region", { name: "Key figures" }).querySelector('[data-metric="measured_rate"] .ca-kpi-label');
		expect(card?.textContent).toBe(metricLabel("measured_rate"));
		expect(metricLabel("measured_rate")).toBe("Measured share");
		const headers = (await findAllByRole("columnheader")).map((h) => h.querySelector("button")?.textContent);
		expect(headers).toContain(metricLabel("avg_duration"));
		expect(metricLabel("avg_duration")).toBe("Avg. session duration");
		expect(readFileSync("src/admin/pages/Satisfaction.tsx", "utf8")).toContain('col({ key: "measured_rate", label: "Measured share"');
	});

	it("renders the KPI cards with est. marks, the trend, both ranked lists, the landing table and the thresholds line", async () => {
		const { findByRole, getByRole, findByText, findAllByRole, container } = await open();
		const kpis = getByRole("region", { name: "Key figures" });
		expect([...kpis.querySelectorAll(".ca-kpi")].map((k) => k.getAttribute("data-metric"))).toEqual(["pct_long", "pct_short", "pct_bad", "pogo_stick_rate", "returned_from_search_rate", "avg_engaged", "measured_rate"]);
		expect(kpis.textContent).toContain("Pogo-sticking (estimate)");
		expect(kpis.textContent).toContain("Returned from search (estimate)");
		// Every card carries its own definition, each stating its base: measured organic search sessions.
		const marks = within(kpis).getAllByRole("button", { name: "About this number" }).map((m) => m.getAttribute("title"));
		expect(marks).toEqual(["pct_long", "pct_short", "pct_bad", "pogo_stick_rate", "returned_from_search_rate", "avg_engaged", "measured_rate"].map(metricDefinition));
		expect(marks[3]).toBe("Share of measured organic search sessions with one page view and no event, at or under the long click time, whose page was left with Back or Forward. An estimate.");
		expect(marks[4]).toBe("Share of measured organic search sessions that left the landing page with Back or Forward and then came again from a search engine. A part of Search re-entry. An estimate.");
		expect(marks[5]).toBe("Average active time per measured organic search session: time with interaction, not the time the page was open.");
		expect(marks[6]).toBe("Share of organic search sessions with a measurable end, where an engagement update arrived. Every rate and the score count only these sessions.");
		expect((await findByText(/10 of 50 sessions have no measured end/)).textContent).toContain("They count as sessions and in Avg. session duration, and are left out of every rate, the score and the average active time.");
		expect(await findByRole("img", { name: /^Long clicks per day, .+, 1 annotation$/ })).toBeTruthy();
		for (const name of ["Best pages", "Worst pages"]) {
			const list = getByRole("region", { name });
			const row = await within(list).findByRole("button", { name: "/land: score 10. Open details" });
			expect(row.textContent).toContain("Pogo-sticking (est.) 10.0%");
			expect(row.textContent).toContain("+5 points vs previous");
		}
		await waitFor(() => expect(queries().filter((b) => b.report === "satisfaction" && b.params?.rank).map((b) => b.params?.rank).sort()).toEqual(["best", "worst"]));
		await findByText(/^Thresholds: long click above 60 s/);
		expect(container.querySelector(".ca-thresholds")?.textContent).toBe("Thresholds: long click above 60 s, bad experience below 10 s, sample minimum 30 measured sessions. Change them in Settings; a new threshold reclassifies every stored session at once, a new sample minimum changes only which pages are ranked and marked low sample.");
		expect(getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(`${SETTINGS_HREF}?tab=sessions`);
		const headers = (await findAllByRole("columnheader")).map((h) => h.querySelector("button")?.textContent).filter(Boolean);
		expect(headers).toEqual(["Landing page", "Score", "Sessions", "Avg. session duration", "Long clicks %", "Short clicks %", "Bad experience %", "Pogo-sticking % (estimate)", "Returned from search % (estimate)", "Search re-entry % (estimate)", "Back/forward loads % (estimate)"]);
		await waitFor(() => expect(container.querySelector("tbody")?.textContent).toContain("5 measured"));
		expectFilledCells(container);
		// Each column's info mark is the figure's own definition, the same text as its card and tile.
		const table = await findByRole("table", { name: "Landing pages" });
		// Every sortable header (the last header is the row action's).
		const info = [...table.querySelectorAll("thead th")].filter((th) => th.querySelector(".ca-sort")).map((th) => th.querySelector(".ca-info-btn")?.getAttribute("title") ?? null);
		expect(info).toEqual([null, ...["score", "sessions", "avg_duration", "pct_long", "pct_short", "pct_bad", "pogo_stick_rate", "returned_from_search_rate", "search_reentry_rate", "back_nav_rate"].map((k) => satisfactionDefinition(k) ?? "")]);
		expect(info[2]).toBe("Organic search sessions in the range. The line below counts those with a measurable end.");
		expect(info[3]).toBe("Average duration per organic search session, measured or not: the longer of the visit span and the visible time. Not interaction time.");
		expect(info[1]).toBe("Long click rate minus bad experience rate minus pogo-sticking rate, in points. Marked low sample under the minimum of measured sessions (30 by default).");
		expect(CAVEATS.satisfaction_estimate).toBe("Pogo-sticking, returned from search, search re-entry and back/forward loads are estimates from browser navigation signals.");
	});

	it("a low sample score shows muted with the note, sorts last both ways, and its previous score gives no change in the ranked lists", async () => {
		satRows = [
			{ key: "/small", sessions: 8, measured: 6, avg_duration: 40, pct_long: 0.8, pct_short: 0.2, pct_bad: 0, pogo_stick_rate: 0, returned_from_search_rate: 0, search_reentry_rate: 0, back_nav_rate: 0, score: 0.8, low_sample: true, previous: { score: 0.2, low_sample: true } },
			{ key: "/big", sessions: 60, measured: 50, avg_duration: 40, pct_long: 0.4, pct_short: 0.6, pct_bad: 0.1, pogo_stick_rate: 0.1, returned_from_search_rate: 0.05, search_reentry_rate: 0.05, back_nav_rate: 0.1, score: 0.2, low_sample: false, previous: { score: 0.1, low_sample: false } },
			{ key: "/mid", sessions: 40, measured: 35, avg_duration: 40, pct_long: 0.3, pct_short: 0.7, pct_bad: 0.1, pogo_stick_rate: 0.1, returned_from_search_rate: 0.05, search_reentry_rate: 0.05, back_nav_rate: 0.1, score: 0.1, low_sample: false, previous: null },
		];
		const { findByRole, getByRole } = await open();
		const table = await findByRole("table", { name: "Landing pages" });
		await waitFor(() => expect(table.querySelectorAll("tbody tr")).toHaveLength(3));
		const scoreCell = (page: string) => [...table.querySelectorAll("tbody tr")].find((tr) => tr.querySelector("td")?.textContent === page)?.querySelectorAll("td")[1] as HTMLElement;
		expect(scoreCell("/small").getAttribute("data-quiet")).toBe("true");
		expect(scoreCell("/small").textContent).toBe("80low sample");
		expect(scoreCell("/big").getAttribute("data-quiet")).toBeNull();
		expect(scoreCell("/big").querySelector(".ca-cell-note")).toBeNull();
		const order = () => [...table.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent);
		fireEvent.click(within(table).getByRole("button", { name: "Score" }));
		expect(order()).toEqual(["/big", "/mid", "/small"]);
		fireEvent.click(within(table).getByRole("button", { name: /^Score/ }));
		expect(order()).toEqual(["/mid", "/big", "/small"]);
		// Best pages: the change against a previous score under the minimum is left out.
		const best = getByRole("region", { name: "Best pages" });
		const small = await within(best).findByRole("button", { name: "/small: score 80. Open details" });
		expect(small.textContent).not.toContain("points vs previous");
		expect(within(best).getByRole("button", { name: "/big: score 20. Open details" }).textContent).toContain("+10 points vs previous");
	});

	it("the ranked lists and the thresholds line name the answer's sample minimum, 30 when an older site sends none", async () => {
		satMin = 50;
		const first = await open();
		await first.findByText(/^Thresholds: /);
		expect(first.container.querySelector(".ca-thresholds")?.textContent).toContain("sample minimum 50 measured sessions.");
		expect(within(first.getByRole("region", { name: "Best pages" })).getByText(/Pages with at least/).textContent).toBe("Score: long click rate minus bad experience and pogo-sticking rates, in points. Pages with at least 50 measured sessions.");
		cleanup();
		satMin = undefined;
		empty = true;
		const second = await open();
		expect(await second.findAllByText("No landing page has enough measured sessions yet.")).toHaveLength(2);
		expect(second.container.textContent).toContain("A page is ranked once it has 30 measured sessions in the range. Try a longer range or fewer filters.");
	});

	it("the rate cards toggle lines of one trend; no second switch", async () => {
		const { findByRole, getByRole, queryByRole } = await open();
		await findByRole("img", { name: /^Long clicks per day, .+, 1 annotation$/ });
		expect(queryByRole("group", { name: "Rate" })).toBeNull();
		fireEvent.click(getByRole("button", { name: /^Returned from search \(estimate\) / }));
		expect(await findByRole("img", { name: /^Long clicks and Returned from search \(estimate\) per day, / })).toBeTruthy();
		// Engaged time is a duration: a second scale, on the right axis.
		fireEvent.click(getByRole("button", { name: /^Avg\. active time / }));
		expect(await findByRole("img", { name: /^Long clicks, Returned from search \(estimate\) and Avg\. active time per day, / })).toBeTruthy();
		expect(decodeURIComponent(window.location.search)).toContain("m=pct_long,returned_from_search_rate,avg_engaged");
		// The measured share is a figure, not a line.
		expect(getByRole("region", { name: "Key figures" }).querySelector('[data-metric="measured_rate"] button.ca-kpi-btn')).toBeNull();
	});

	it("breakdown tabs query params.by; no channel tab, every session is organic search", async () => {
		const { findByRole, queryByRole } = await open();
		expect(queryByRole("tab", { name: "Channels" })).toBeNull();
		for (const [label, by] of [["Search engines", "source"], ["Devices", "device"], ["Countries", "country"], ["Browsers", "browser"]] as const) {
			fireEvent.click(await findByRole("tab", { name: label }));
			await waitFor(() => expect(queries().some((b) => b.report === "satisfaction" && b.params?.by === by)).toBe(true));
		}
	});

	it("a ranked row opens the page drawer with its trend, pogo-sticking by search engine and breakdowns; Close returns focus", async () => {
		const { findByRole, getByRole, container } = await open();
		const row = await within(getByRole("region", { name: "Best pages" })).findByRole("button", { name: "/land: score 10. Open details" });
		row.focus();
		fireEvent.click(row);
		const drawer = await findByRole("complementary", { name: "Search Satisfaction of /land" });
		const entry = { dim: "entry", op: "is", values: ["/land"] };
		await waitFor(() => {
			const q = queries();
			// The reports hold the organic search scope themselves: the page sends only the view's own filters.
			expect(q.some((b) => b.report === "satisfaction_series" && JSON.stringify(b.query.filters) === JSON.stringify([entry]))).toBe(true);
			expect(q.some((b) => b.report === "satisfaction" && b.params?.by === "source" && JSON.stringify(b.query.filters) === JSON.stringify([entry]))).toBe(true);
			expect(q.some((b) => b.report === "satisfaction" && b.params?.by === "device" && JSON.stringify(b.query.filters) === JSON.stringify([entry]))).toBe(true);
		});
		expect(within(drawer).getByRole("region", { name: "Pogo-sticking by search engine" })).toBeTruthy();
		expect(within(drawer).queryByRole("button", { name: "Channels" })).toBeNull();
		fireEvent.click(within(drawer).getByRole("button", { name: "Countries" }));
		await waitFor(() => expect(queries().some((b) => b.report === "satisfaction" && b.params?.by === "country")).toBe(true));
		fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
		expect(container.querySelector(".ca-sat-drawer")).toBeNull();
		expect(document.activeElement).toBe(row);
	});

	it("the table's Details button opens the drawer too", async () => {
		const { findByRole } = await open();
		fireEvent.click(await findByRole("button", { name: "Details: /land" }));
		expect(await findByRole("complementary", { name: "Search Satisfaction of /land" })).toBeTruthy();
	});

	it("a click anywhere on an entry row, or Enter on the focused row, opens the drawer; the page name keeps its filter action", async () => {
		const { findByRole, container } = await open();
		const table = await findByRole("table", { name: "Landing pages" });
		const tr = (await within(table).findByRole("button", { name: "Details: /land" })).closest("tr") as HTMLElement;
		expect(tr.tabIndex).toBe(0);
		expect((within(tr).getByRole("button", { name: "Details: /land" }) as HTMLElement).tabIndex).toBe(-1);
		fireEvent.click(tr.querySelectorAll("td")[1] as HTMLElement);
		expect(await findByRole("complementary", { name: "Search Satisfaction of /land" })).toBeTruthy();
		fireEvent.click(within(container.querySelector(".ca-sat-drawer") as HTMLElement).getByRole("button", { name: "Close" }));
		expect(container.querySelector(".ca-sat-drawer")).toBeNull();
		tr.focus();
		fireEvent.keyDown(tr, { key: "Enter" });
		expect(await findByRole("complementary", { name: "Search Satisfaction of /land" })).toBeTruthy();
		fireEvent.click(within(tr).getByRole("button", { name: "/land" }));
		await waitFor(() => expect(decodeState(window.location.search, "UTC").filters).toContainEqual({ dim: "entry", op: "is", values: ["/land"] }));
	});

	it("a raw_only answer that names the first detailed day offers that day to the end of the range", async () => {
		rawOnly = true;
		rawFromLine = " Detailed data starts on 2025-02-10.";
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/satisfaction?from=2025-01-01&to=2025-03-01");
		const { findByRole, queryByRole, findAllByRole } = render(<Satisfaction />);
		const action = await findByRole("button", { name: "Show 2025-02-10 to 2025-03-01 with all filters" });
		await settle();
		// One notice for the whole page, no error banners of the other panels.
		expect(queryByRole("alert")).toBeNull();
		expect((await findAllByRole("button", { name: /^Show / })).length).toBe(1);
		expect(queryByRole("table")).toBeNull();
		fireEvent.click(action);
		await waitFor(() => expect(decodeState(window.location.search, "UTC").from).toBe("2025-02-10"));
	});

	it("presets narrow the organic scope with their chips, Bing organic included", async () => {
		const { findByRole } = await open();
		fireEvent.click(await findByRole("button", { name: "Google organic" }));
		await waitFor(() => expect(decodeState(window.location.search, "UTC").filters).toEqual([{ dim: "source", op: "prefix", values: ["google."] }]));
		fireEvent.click(await findByRole("button", { name: "Chrome" }));
		await waitFor(() => expect(decodeState(window.location.search, "UTC").filters).toContainEqual({ dim: "browser", op: "is", values: ["Chrome"] }));
		fireEvent.click(await findByRole("button", { name: "Bing organic" }));
		await waitFor(() => expect(decodeState(window.location.search, "UTC").filters).toContainEqual({ dim: "source", op: "prefix", values: ["bing."] }));
	});

	it("shows the organic search scope as a fixed chip that cannot be removed, and offers no channel filter", async () => {
		const { findByText, getByLabelText, container, queryByRole } = await open();
		expect(await findByText("Organic search sessions only, every search engine. Narrow to:")).toBeTruthy();
		const chip = container.querySelector('.ca-chip[data-fixed="true"]') as HTMLElement;
		expect(chip.textContent).toBe("Channel is Organic Search, fixed");
		expect(within(chip).queryByRole("button")).toBeNull();
		expect(within(chip).queryByRole("combobox")).toBeNull();
		expect(queryByRole("button", { name: /^Remove Channel/ })).toBeNull();
		const dims = [...(getByLabelText("Dimension") as HTMLSelectElement).options].map((o) => o.value);
		expect(dims).not.toContain("channel");
		expect(dims).toContain("source");
		await waitFor(() => expect(queries().filter((b) => b.report.startsWith("satisfaction")).length).toBeGreaterThan(0));
		// No request carries a channel filter: the reports enforce the scope.
		expect(queries().filter((b) => b.report.startsWith("satisfaction")).every((b) => !JSON.stringify(b.query.filters).includes("channel"))).toBe(true);
	});

	it("a channel chip carried over from another page shows struck through with the reason", async () => {
		window.history.replaceState(null, "", `/_emdash/admin/plugins/x/satisfaction?from=2026-03-01&to=2026-03-07&f=${btoa(JSON.stringify([{ dim: "channel", op: "is", values: ["Direct"] }])).replace(/=+$/, "")}`);
		const { findByRole, container } = render(<Satisfaction />);
		await findByRole("region", { name: "Key figures" });
		const chip = container.querySelector('.ca-chip[data-dim="channel"]:not([data-fixed])') as HTMLElement;
		expect(chip.getAttribute("data-off")).toBe("true");
		expect(chip.getAttribute("title")).toBe("Channel is Organic Search is fixed on this page");
		// The chip stays in the view, so it carries on to the next page.
		expect(decodeState(window.location.search, "UTC").filters).toEqual([{ dim: "channel", op: "is", values: ["Direct"] }]);
	});

	it("shows the empty state of the ranked lists", async () => {
		empty = true;
		const { findAllByText } = await open();
		expect(await findAllByText("No landing page has enough measured sessions yet.")).toHaveLength(2);
	});

	it("shows the raw window notice with one click to a range inside the window", async () => {
		rawOnly = true;
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/satisfaction?from=2025-01-01&to=2025-03-01");
		const { findByText, findByRole, queryByRole } = render(<Satisfaction />);
		expect(await findByText(SATISFACTION_RAW_ONLY)).toBeTruthy();
		await settle();
		expect(queryByRole("table")).toBeNull();
		expect(queryByRole("alert")).toBeNull();
		fireEvent.click(await findByRole("button", { name: "Show the last 30 days" }));
		await waitFor(() => expect(decodeState(window.location.search, "UTC").from).not.toBe("2025-01-01"));
	});
});

describe("Behaviour", () => {
	it("shows the properties of an event", async () => {
		const { findByRole, findByText } = render(<Behaviour />);
		fireEvent.click(await findByRole("button", { name: "Properties: events one" }));
		expect(await findByText("pro")).toBeTruthy();
		expect(queries().find((b) => b.report === "event_props")?.params).toEqual({ event: "events one" });
	});

	it("states the goal denominator", async () => {
		const { findByRole, findByText } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Goals" }));
		expect(await findByText("Conversion rate is out of 50 sessions in the current filter.")).toBeTruthy();
	});

	it("runs the selected funnel", async () => {
		funnels = [
			{ id: "f1", data: { name: "Signup" } },
			{ id: "f2", data: { name: "Checkout" } },
		];
		const { findByRole, findByLabelText } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Funnels" }));
		await waitFor(() => expect(queries().some((b) => b.report === "funnels" && b.params?.funnel === "f1")).toBe(true));
		expect(await findByRole("cell", { name: "Landing" })).toBeTruthy();
		expect(await findByRole("img", { name: "Sessions per funnel step" })).toBeTruthy();
		// The picker label stacks above it at field label size, like every other picker.
		expect((await findByLabelText("Funnel")).closest("label")?.className).toBe("ca-field");
		fireEvent.change(await findByLabelText("Funnel"), { target: { value: "f2" } });
		await waitFor(() => expect(queries().some((b) => b.report === "funnels" && b.params?.funnel === "f2")).toBe(true));
	});

	it("adds the funnel revenue columns, the estimate note and the other currencies when the site has revenue", async () => {
		revenueOn = true;
		funnels = [{ id: "f1", data: { name: "Checkout" } }];
		const { findByRole, findByText, queryByRole, container } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Funnels" }));
		await waitFor(() => expect(queries().find((b) => b.report === "funnels")?.params).toEqual({ funnel: "f1", withRevenue: true, currency: "USD" }));
		expect(await findByRole("columnheader", { name: /Est\. lost revenue \(USD\)/ })).toBeTruthy();
		expect(await findByRole("columnheader", { name: /Revenue per session \(USD\)/ })).toBeTruthy();
		// No refunds in the answer: no Refunds or Net revenue column.
		expect(queryByRole("columnheader", { name: /Refunds/ })).toBeNull();
		expect(await findByText(FUNNEL_REVENUE_NOTE)).toBeTruthy();
		expect((await findByText(/Other currencies:/)).textContent).toContain("EUR");
		// Step 1 has no estimate: its cell is the only dash.
		const first = [...(container.querySelector("tbody tr")?.querySelectorAll("td") ?? [])].map((td) => td.textContent);
		expect(first.filter((t) => t === "-")).toHaveLength(1);
		// Every queried funnel asked for revenue once the probe answered.
		expect(queries().filter((b) => b.report === "funnels").every((b) => b.params?.withRevenue === true)).toBe(true);
	});

	it("asks for no funnel revenue on a site without revenue", async () => {
		funnels = [{ id: "f1", data: { name: "Checkout" } }];
		const { findByRole, queryByRole } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Funnels" }));
		expect(await findByRole("cell", { name: "Landing" })).toBeTruthy();
		expect(queries().find((b) => b.report === "funnels")?.params).toEqual({ funnel: "f1" });
		expect(queryByRole("columnheader", { name: /Revenue/ })).toBeNull();
	});

	it("shows the stored funnel mode", async () => {
		funnels = [{ id: "f1", data: { name: "Signup", mode: "strict" } }];
		const { findByRole, findByText } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Funnels" }));
		expect(await findByText("Mode: strict")).toBeTruthy();
	});

	it("journeys: a page picker, came from and went to for the page, the top paths and the floor footnote", async () => {
		const { findByRole, findByLabelText, findAllByText, container } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Journeys" }));
		await waitFor(() => expect(queries().some((b) => b.report === "journey_next" && b.params?.path === "/pricing")).toBe(true));
		expect(queries().find((b) => b.report === "journey_prev")?.params).toEqual({ path: "/pricing" });
		expect(queries().find((b) => b.report === "dimension_values")?.params).toEqual({ dim: "page" });
		expect(await findByRole("img", { name: "Came from" })).toBeTruthy();
		expect(await findByRole("img", { name: "Went to" })).toBeTruthy();
		expect(await findByRole("cell", { name: "(exit)" })).toBeTruthy();
		expect((await findAllByText("2 sessions on routes taken by fewer than 2 sessions are not shown.")).length).toBe(3);
		expectFilledCells(container);
		fireEvent.change(await findByLabelText("Page"), { target: { value: "/docs" } });
		await waitFor(() => expect(queries().some((b) => b.report === "journey_prev" && b.params?.path === "/docs")).toBe(true));
	});

	it("shows the error when the funnel list fails", async () => {
		funnels = null as unknown as unknown[];
		const { findByRole } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Funnels" }));
		expect((await findByRole("alert")).textContent).toContain("The funnel list could not be loaded");
	});

	it("sorts scroll depth numerically", async () => {
		const { findByRole, container } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Scroll" }));
		const header = await findByRole("button", { name: "Max scroll depth (%)" });
		fireEvent.click(header);
		fireEvent.click(header);
		const first = () => [...container.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent);
		expect(first()).toEqual(["0", "25", "50", "75", "100"]);
	});

	it("shows an empty state without funnels", async () => {
		const { findByRole, findByText } = render(<Behaviour />);
		fireEvent.click(await findByRole("tab", { name: "Funnels" }));
		expect(await findByText("No funnels yet.")).toBeTruthy();
		expect((await findByRole("link", { name: "Create a funnel" })).getAttribute("href")).toMatch(/\/config\?tab=funnels&new=1$/);
		expect(reportsQueried().has("funnels")).toBe(false);
	});
});

describe("revenue surfaces", () => {
	const TABLES: Array<[() => ReactElement, string, string]> = [
		[() => <Sources />, "Channels", "channels"],
		[() => <Sources />, "Sources", "sources"],
		[() => <Pages />, "Pages", "pages"],
		[() => <Pages />, "Entry pages", "entry_pages"],
		[() => <Audience />, "Countries", "countries"],
		[() => <Audience />, "Devices", "devices"],
		[() => <Behaviour />, "Goals", "goals"],
	];

	it("cf8: every session and revenue column carries the definition of its own figure", async () => {
		revenueOn = true;
		const info = (container: HTMLElement) => Object.fromEntries([...container.querySelectorAll("thead th")].filter((th) => th.querySelector(".ca-sort")).map((th) => [headText(th), th.querySelector(".ca-info-btn")?.getAttribute("title") ?? null]));
		const sessionCols = {
			Visitors: COLUMN_DEFINITIONS.visitors,
			Sessions: metricDefinition("sessions"),
			"Bounce rate": metricDefinition("bounce_rate"),
			"Avg. session duration": metricDefinition("avg_duration"),
		};
		for (const [el, tab, report] of TABLES.filter(([, , r]) => ["channels", "sources", "countries", "devices"].includes(r))) {
			const { getByRole, container, findByText } = render(el());
			fireEvent.click(await waitFor(() => getByRole("tab", { name: tab })));
			await findByText("59.90 USD");
			const marks = info(container);
			expect(marks, report).toMatchObject({ ...sessionCols, Orders: COLUMN_DEFINITIONS.orders_row, "Revenue (USD)": report === "countries" || report === "devices" ? COLUMN_DEFINITIONS.revenue_visit : COLUMN_DEFINITIONS.revenue_first_touch });
			cleanup();
		}
		const { getByRole, container, findByText } = render(<Pages />);
		fireEvent.click(await waitFor(() => getByRole("tab", { name: "Pages" })));
		await findByText("59.90 USD");
		expect(info(container)).toMatchObject({ Pageviews: metricDefinition("pageviews"), Visitors: COLUMN_DEFINITIONS.page_visitors, "Exit rate": metricDefinition("exit_rate"), "Avg. active time": metricDefinition("avg_time"), "Revenue (USD)": COLUMN_DEFINITIONS.revenue_page });
	});

	it("a site without revenue shows no revenue column and the Revenue page its first use state", async () => {
		for (const [el, tab, report] of TABLES) {
			const { getByRole, container } = render(el());
			fireEvent.click(await waitFor(() => getByRole("tab", { name: tab })));
			await waitFor(() => expect(queries().some((b) => b.report === report)).toBe(true));
			await settle();
			expect([...container.querySelectorAll("th")].map((t) => t.textContent).join("|"), report).not.toContain("Revenue");
			expect(queries().some((b) => b.params?.withRevenue)).toBe(false);
			cleanup();
		}
		const { findByRole, getByText, container } = render(<Revenue />);
		expect(await findByRole("heading", { name: "No revenue recorded yet" })).toBeTruthy();
		expect(container.querySelector("pre")?.textContent).toContain('window.__ec.event("purchase", {}, { value: 49.9, currency: "EUR", id: "A-1001" });');
		expect(getByText("Revenue guide").getAttribute("href")).toBe(REVENUE_GUIDE);
		await settle();
		expect(queries().some((b) => ["revenue_series", "revenue_breakdown", "revenue_orders"].includes(b.report))).toBe(false);
	});

	it("with revenue, the tables of Sources, Pages, Audience and Goals get Revenue and Orders columns through withRevenue", async () => {
		revenueOn = true;
		for (const [el, tab, report] of TABLES) {
			const { getByRole, container, findByText } = render(el());
			fireEvent.click(await waitFor(() => getByRole("tab", { name: tab })));
			await findByText("59.90 USD");
			expect([...container.querySelectorAll("th")].map(headText)).toEqual(expect.arrayContaining(["Revenue (USD)", "Orders"]));
			expect(queries().filter((b) => b.report === report).every((b) => b.params?.withRevenue === true), report).toBe(true);
			cleanup();
		}
	});

	it("Behaviour has no Revenue tab: the Revenue page is the one home of revenue", async () => {
		revenueOn = true;
		const { findByRole, queryByRole } = render(<Behaviour />);
		await findByRole("tab", { name: "Goals" });
		expect(queryByRole("tab", { name: "Revenue" })).toBeNull();
		expect(pages["/revenue"]).toBe(Revenue);
		expect(ADMIN_PAGES.find((p) => p.path === "/revenue")).toEqual({ path: "/revenue", label: "Revenue", icon: "coins", group: "Analytics" });
		expect(ADMIN_PAGES.map((p) => p.path).indexOf("/revenue")).toBe(ADMIN_PAGES.map((p) => p.path).indexOf("/behaviour") + 1);
	});
});

describe("Revenue page", () => {
	it("cards, the attribution sentence, every breakdown at once with share of revenue, and the recent orders", async () => {
		revenueOn = true;
		const { findByText, getByText, container, getByRole } = render(<Revenue />);
		await findByText("Other currencies: 120.00 EUR (3 orders).");
		expect(getByText(ATTRIBUTION_NOTE)).toBeTruthy();
		expect(container.querySelector('[data-metric="revenue"]')?.textContent).toContain("Revenue (USD)59.90 USD");
		// One panel per breakdown dimension, each in the page currency.
		await waitFor(() => expect(new Set(queries().filter((b) => b.report === "revenue_breakdown").map((b) => b.params?.dim))).toEqual(new Set(REVENUE_BREAKDOWN_DIMS)));
		expect(queries().filter((b) => b.report === "revenue_breakdown").every((b) => b.params?.currency === "USD" && b.limit === 10)).toBe(true);
		for (const title of ["Channels", "Sources", "Campaigns", "Entry pages", "Pages", "Countries", "Devices", "Goals to revenue", "Events"]) expect(getByRole("heading", { name: new RegExp(`^${title}( |$)`) })).toBeTruthy();
		const channels = (await findByText("channel one")).closest("table") as HTMLElement;
		expect([...channels.querySelectorAll("th")].map(headText)).toEqual(["Channel", "Revenue (USD)", "Share of revenue", "Orders", "Average order value (USD)", "Revenue per visitor (USD)"]);
		// 44.90 of 59.90 is 75.0 %; the key without an order is left out.
		expect(within(channels).getByText("channel one").closest("tr")?.textContent).toContain("75.0%");
		expect(within(channels).queryByText("channel none")).toBeNull();
		// Recent orders: reference, day, amount, first touch; the comparison is not sent.
		const orders = (await findByText("o.0a1b2c3d4e5f60718293")).closest("table") as HTMLElement;
		expect([...orders.querySelectorAll("th")].map(headText)).toEqual(["Order reference", "Day", "Amount (USD)", "Channel", "Entry page", "Country"]);
		expect(orders.querySelector("tbody tr")?.textContent).toContain("49.90 USD");
		expect(getByText(ORDERS_NOTE)).toBeTruthy();
		const funnelLink = getByRole("link", { name: "Revenue per funnel step" });
		expect(funnelLink.getAttribute("href")).toMatch(/\/behaviour\?tab=funnels$/);
		// Inside the goals panel, where "Show all" sits on other panels, not loose between panels.
		expect(funnelLink.closest("section")?.getAttribute("aria-label")).toBe("Goals to revenue");
		expect(queries().find((b) => b.report === "revenue_orders")?.query.compare).toBe("none");
		expect(container.textContent).not.toMatch(/visitor key|session id|vkey|\bsid\b/i);
		expectFilledCells(orders);
	});

	it("the currency chips switch every figure, panel and the orders through the cur URL state", async () => {
		revenueOn = true;
		const { findByText, getByRole } = render(<Revenue />);
		await findByText("Other currencies: 120.00 EUR (3 orders).");
		const chips = getByRole("group", { name: "Currency" });
		expect(within(chips).getAllByRole("button").map((b) => b.textContent)).toEqual(["USD", "EUR"]);
		fireEvent.click(within(chips).getByRole("button", { name: "EUR" }));
		expect(decodeState(window.location.search, "UTC").cur).toBe("EUR");
		await findByText("Other currencies: 59.90 USD (2 orders).");
		await waitFor(() => expect(queries().filter((b) => b.report === "revenue_breakdown" && b.params?.currency === "EUR")).toHaveLength(REVENUE_BREAKDOWN_DIMS.length));
		await waitFor(() => expect(queries().some((b) => b.report === "revenue_orders" && b.params?.currency === "EUR")).toBe(true));
		expect(queries().some((b) => b.report === "revenue_series" && b.params?.currency === "EUR")).toBe(true);
	});

	it("refunds add Refunds and Net revenue columns, the refunds note and a Type column in the orders", async () => {
		revenueOn = true;
		refundsOn = true;
		const { findByText, getByText, container } = render(<Revenue />);
		await findByText(REFUNDS_NOTE);
		expect(container.querySelector('[data-metric="net_revenue"]')?.textContent).toContain("49.90 USD");
		const channels = (await findByText("channel one")).closest("table") as HTMLElement;
		expect([...channels.querySelectorAll("th")].map(headText)).toEqual(expect.arrayContaining(["Refunds (USD)", "Net revenue (USD)"]));
		const orders = (await findByText("o.0a1b2c3d4e5f60718293.r1")).closest("table") as HTMLElement;
		expect([...orders.querySelectorAll("th")].map(headText)).toContain("Type");
		expect(within(orders).getByText("o.0a1b2c3d4e5f60718293.r1").closest("tr")?.textContent).toContain("Refund");
		expect(getByText(ATTRIBUTION_NOTE)).toBeTruthy();
	});

	it("a range that starts before the detailed window lists the orders from its first detailed day and says so", async () => {
		revenueOn = true;
		ordersFrom = "2026-03-04";
		const { findByText } = render(<Revenue />);
		await findByText("Orders from 2026-03-04 on: single orders before that day are not kept. The figures above cover the whole range.");
		await findByText("o.0a1b2c3d4e5f60718293");
		expect(queries().filter((b) => b.report === "revenue_orders").map((b) => b.query.from)).toEqual(["2026-03-01", "2026-03-04"]);
	});

	it("a range wholly before the detailed window: one notice in the orders panel, the figures stay, no page error", async () => {
		revenueOn = true;
		ordersFrom = "2026-04-01";
		const { findByText, container } = render(<Revenue />);
		await findByText(`${ORDERS_RAW_ONLY} The figures above cover the whole range.`);
		expect(container.querySelector('[data-metric="revenue"]')?.textContent).toContain("59.90 USD");
		expect(container.querySelectorAll(".ca-notice[data-tone='error'], [role='alert']")).toHaveLength(0);
	});
});

describe("Audience regions", () => {
	it("region capture off: a plain Regions heading, a notice with the settings link, and no regions query", async () => {
		siteExtra = { captureRegion: false };
		const { findByText, getByRole, queryByText } = render(<Audience />);
		const notice = (await findByText(/Region capture is off\./)).closest(".ca-notice") as HTMLElement;
		expect(within(notice).getByRole("link", { name: "Open plugin settings" }).getAttribute("href")).toBe("/_emdash/admin/plugins/cookieless-analytics/settings?tab=privacy");
		expect(getByRole("heading", { name: "Regions" })).toBeTruthy();
		expect(queryByText(/only when/)).toBeNull();
		await waitFor(() => expect(calls.some((c) => c.body.report === "countries")).toBe(true));
		expect(calls.some((c) => c.body.report === "regions")).toBe(false);
	});

	it("region capture on: the Regions report under the plain title, no notice", async () => {
		siteExtra = { captureRegion: true };
		const { findByRole, queryByText } = render(<Audience />);
		expect(await findByRole("heading", { name: /^Regions( |$)/ })).toBeTruthy();
		await waitFor(() => expect(calls.some((c) => c.body.report === "regions")).toBe(true));
		expect(queryByText(/Region capture is off/)).toBeNull();
	});
});

describe("segment comparison on views that never compare", () => {
	const SEG = "from=2026-03-01&to=2026-03-07&cmp=seg&cseg=s1";
	const valid = (report: string) => {
		const sent = queries().filter((b) => b.report === report);
		expect(sent.length).toBeGreaterThan(0);
		for (const b of sent) expect(QuerySchema.safeParse(b.query).success, JSON.stringify(b.query)).toBe(true);
		expect(sent.every((b) => b.query.compare === "none" && !("compareSegment" in b.query))).toBe(true);
	};
	it("the Journeys page picker sends a query the server accepts, and shows its error", async () => {
		window.history.replaceState(null, "", `/_emdash/admin/plugins/x/behaviour?tab=journeys&${SEG}`);
		render(<Behaviour />);
		await waitFor(() => expect(queries().some((b) => b.report === "dimension_values")).toBe(true));
		valid("dimension_values");
		cleanup();
		refusePages = true;
		const { findByText } = render(<Behaviour />);
		expect(await findByText("Pages could not be listed.")).toBeTruthy();
	});
	it("Recent orders sends a query the server accepts", async () => {
		revenueOn = true;
		window.history.replaceState(null, "", `/_emdash/admin/plugins/x/revenue?${SEG}`);
		render(<Revenue />);
		await waitFor(() => expect(queries().some((b) => b.report === "revenue_orders")).toBe(true));
		valid("revenue_orders");
	});
});

describe("page trend cards on an hourly range", () => {
	it("Visitors reads one overview request on a range of up to 2 days, and none on a longer range", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-03-01&to=2026-03-01");
		const { container } = render(<Pages />);
		await waitFor(() => expect(container.querySelector('[data-metric="visitors"]')?.textContent).toContain("77"));
		expect(queries().filter((b) => b.report === "overview")).toHaveLength(1);
		cleanup();
		calls = [];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-03-01&to=2026-03-07");
		render(<Pages />);
		await waitFor(() => expect(queries().some((b) => b.report === "timeseries")).toBe(true));
		expect(queries().some((b) => b.report === "overview")).toBe(false);
	});
});
