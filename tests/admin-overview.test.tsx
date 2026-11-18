// @vitest-environment jsdom
/** Minimal Overview page: the wiring from URL state through the shell to `data/query` and back. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pages, widgets } from "../src/admin/index.js";
import Overview from "../src/admin/pages/Overview.js";
import { resetSearchStatus } from "../src/admin/api.js";
import { decodeState } from "../src/admin/state.js";
import { CAVEATS } from "../src/admin/components/ui.js";
import { ADMIN_PAGES, ADMIN_WIDGETS, cookielessAnalytics } from "../src/index.js";

type Body = { report: string; query: Record<string, unknown>; [k: string]: unknown };
let calls: Array<{ route: string; body: Body }> = [];
let notices: string[] = [];
let segmentItems: unknown[] = [];
let exportResponse: () => Response;
let hasRevenue = false;
/** Replaces the overview answer's data (first run, empty range). */
let overviewData: Record<string, unknown> | null = null;
/** Every data/query call fails with this message while set. */
let failWith: string | null = null;

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const totals = { visitors: 120, sessions: 150, pageviews: 400, views_per_session: 2.6667, bounce_rate: 0.4, engaged_rate: 0.6, avg_duration: 75 };

function answer(body: Body) {
	const base = { report: body.report, range: { from: body.query.from, to: body.query.to }, compare: body.query.compare ?? "none", compareRange: null, notices };
	switch (body.report) {
		case "overview":
			return { ...base, data: overviewData ?? { totals, compareTotals: { ...totals, visitors: 100, bounce_rate: 0.35 }, realtime: 3 } };
		case "timeseries":
			return {
				...base,
				data: {
					granularity: "day",
					series: [
						{ t: "2026-03-01", ...totals },
						{ t: "2026-03-02", ...totals, visitors: 60 },
					],
					compareSeries: [{ t: "2026-02-27", ...totals }],
					annotations: [{ ts: Date.UTC(2026, 2, 2, 12) / 1000, kind: "manual", text: "Launch" }],
				},
			};
		case "revenue":
			return {
				...base,
				data: {
					currency: "USD",
					hasRevenue,
					totals: { revenue: 1234.5, orders: 10, aov: 123.45, revenue_per_visitor: 10.29 },
					currencies: hasRevenue ? [{ currency: "USD", revenue: 1234.5, orders: 10 }, { currency: "EUR", revenue: 120, orders: 3 }] : [],
				},
			};
		case "pages":
			return {
				...base,
				data: {
					rows: [
						{ key: "/a", visitors: 50, pageviews: 90 },
						{ key: "/b", visitors: 20, pageviews: 30 },
					],
				},
			};
		default:
			return { ...base, data: { rows: [{ key: `${body.report} one`, visitors: 5, sessions: 6, converting: 2, conversion_rate: 0.1 }] } };
	}
}

beforeEach(() => {
	calls = [];
	notices = [];
	hasRevenue = false;
	overviewData = null;
	failWith = null;
	resetSearchStatus();
	segmentItems = [];
	exportResponse = () => new Response("key\n/a\n", { status: 200, headers: { "content-disposition": 'attachment; filename="pages-2026-03-01.csv"' } });
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/?from=2026-03-01&to=2026-03-02&cmp=previous&site=main");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/").slice(-2).join("/");
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, timezone: "UTC" }] });
			if (route === "segments/list") return ok({ items: segmentItems });
			if (route === "segments/save") return ok({ id: "s2", data: body.data });
			if (route === "data/export") return exportResponse();
			if (route === "sites/hosts") return ok({ hosts: [{ host: "example.com", kind: "own", lastEvent: null }] });
			if (route === "search/status") return ok({ sources: [] });
			if (route === "data/query" && failWith) return new Response(JSON.stringify({ success: false, error: { code: "query_failed", message: failWith } }), { status: 500, headers: { "content-type": "application/json" } });
			return ok(answer(body));
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const PANELS = ["channels", "countries", "devices", "goals", "overview", "pages", "revenue", "sources", "timeseries"];
const queries = () => calls.filter((c) => c.route === "data/query").map((c) => c.body);

describe("Overview", () => {
	it("is the root admin page and matches the descriptor", () => {
		expect(Object.keys(pages)).toEqual(ADMIN_PAGES.map((p) => p.path));
		expect(cookielessAnalytics().adminPages?.map((p) => p.path)).toEqual(["/", "/dashboards", "/pages", "/satisfaction", "/sources", "/audience", "/behaviour", "/revenue", "/links", "/annotations", "/search", "/config", "/data", "/settings"]);
		expect(pages["/"]).toBe(Overview);
		expect(Object.keys(widgets)).toEqual(ADMIN_WIDGETS.map((w) => w.id));
		expect(cookielessAnalytics().adminWidgets).toEqual([{ id: "today", title: "Cookieless Analytics", size: "third" }]);
	});

	it("restores state from the URL, sends site and compare, and renders KPIs, chart and table", async () => {
		const { findByText, container, getByRole } = render(<Overview />);
		await findByText("/a");
		await waitFor(() => expect(container.querySelector('[data-metric="visitors"]')?.textContent).toContain("120"));
		await findByText("goals one");
		const q = queries();
		expect(q.map((b) => b.report).sort()).toEqual(PANELS);
		for (const b of q) expect(b.query).toEqual({ from: "2026-03-01", to: "2026-03-02", filters: [], compare: "previous", site: "main" });
		expect(container.querySelector('[data-metric="visitors"] .ca-delta-main')?.textContent).toBe("\u2191+20.0% better");
		expect(container.querySelector('[data-metric="visitors"] .ca-delta-detail')?.textContent).toBe("+20, from 100");
		// A rise in bounce rate is bad news, in percentage points.
		expect(container.querySelector('[data-metric="bounce_rate"] .ca-delta')?.getAttribute("data-judge")).toBe("worse");
		expect(container.querySelector('[data-metric="bounce_rate"] .ca-delta-main')?.textContent).toBe("\u2191+5.0 pp worse");
		// What the cards compare with, once for the group.
		expect(container.querySelectorAll(".ca-kpi-cmp")).toHaveLength(1);
		expect(container.querySelector('[data-compare="visitors"]')).not.toBeNull();
		expect(container.querySelector('[data-marker="2026-03-02"]')).not.toBeNull();
		fireEvent.click(within(container.querySelector('[data-metric="visitors"]') as HTMLElement).getByRole("button", { name: "About this number" }));
		expect(getByRole("note").textContent).toBe(CAVEATS.visitors);
		expect(container.querySelector("select[aria-label='Site']")).toBeNull();
		expect((container.querySelector("select[aria-label='Compare']") as HTMLSelectElement).value).toBe("previous");
		// Six cards: bounce rate is the one engagement figure (engaged rate is 1 minus it, in the chart pickers and the API).
		expect([...container.querySelectorAll(".ca-kpis .ca-kpi")].map((k) => k.getAttribute("data-metric"))).toEqual(["visitors", "sessions", "pageviews", "views_per_session", "bounce_rate", "avg_duration"]);
		// "Active now" is a live badge in the page head, not a card.
		expect((await findByText("3 active now")).closest(".ca-page-head")).not.toBeNull();
		expect(container.querySelector('.ca-kpis [data-metric="realtime"]')).toBeNull();
	});

	it("panels show 8 rows and a Show all link to the full report", async () => {
		const { findByText, container } = render(<Overview />);
		await findByText("/a");
		await waitFor(() => expect(container.querySelectorAll(".ca-more")).toHaveLength(6));
		expect(queries().filter((b) => ["channels", "pages", "sources", "countries", "devices", "goals"].includes(b.report)).every((b) => b.limit === 8)).toBe(true);
		const more = (report: string) => container.querySelector(`[data-report="${report}"] .ca-more`)?.getAttribute("href");
		expect([more("channels"), more("sources"), more("devices"), more("goals")]).toEqual([
			"/_emdash/admin/plugins/cookieless-analytics/sources",
			"/_emdash/admin/plugins/cookieless-analytics/sources?tab=sources",
			"/_emdash/admin/plugins/cookieless-analytics/audience?tab=devices",
			"/_emdash/admin/plugins/cookieless-analytics/behaviour?tab=goals",
		]);
		expect(container.querySelector('[data-report="pages"] .ca-more')?.textContent).toBe("Show all Top pages");
	});

	it("first run: no stored visit at all shows the steps instead of the report", async () => {
		overviewData = { totals: { ...totals, visitors: 0, sessions: 0, pageviews: 0 }, realtime: 0, stored: false };
		const { findByRole, getByRole, container } = render(<Overview />);
		const panel = await findByRole("region", { name: "Set up" });
		expect(within(panel).getByRole("heading", { name: "No visits yet" })).toBeTruthy();
		await within(panel).findByText("Not seen yet.");
		expect(within(panel).getByRole("link", { name: "Page script settings" }).getAttribute("href")).toBe("/_emdash/admin/plugins/cookieless-analytics/settings?tab=script");
		expect(await within(panel).findByRole("link", { name: "Open Search" })).toBeTruthy();
		expect(container.querySelector(".ca-kpis")).toBeNull();
		expect(container.querySelector(".ca-empty")).toBeNull();
		const before = queries().filter((b) => b.report === "overview").length;
		fireEvent.click(getByRole("button", { name: "Check again" }));
		await waitFor(() => expect(queries().filter((b) => b.report === "overview").length).toBe(before + 1));
	});

	it("an empty range of a site with visits: one empty state for the page with a wider range", async () => {
		overviewData = { totals: { ...totals, visitors: 0, sessions: 0, pageviews: 0 }, realtime: 0, stored: true };
		const { findByText, getAllByText, getByRole, container } = render(<Overview />);
		await findByText("No visits from 2026-03-01 to 2026-03-02.");
		expect(getAllByText(/No visits from/)).toHaveLength(1);
		expect(container.querySelector(".ca-panels")).toBeNull();
		fireEvent.click(getByRole("button", { name: "Show the last 90 days" }));
		const st = decodeState(window.location.search, "UTC");
		expect(st.to).not.toBe("2026-03-02");
	});

	it("one failing database: the error once on top in plain words with Try again; panels say Not loaded, never No data", async () => {
		failWith = "D1_ERROR: database is overloaded, try again later";
		const { findAllByText, findByText, findByRole, getAllByRole, queryByText, container } = render(<Overview />);
		await findAllByText("Not loaded.");
		await waitFor(() => expect(container.querySelectorAll(".ca-table-skel")).toHaveLength(6));
		const alerts = getAllByRole("alert");
		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.textContent).toContain("The database is busy. Try again in a moment.");
		expect(alerts[0]?.querySelector(".ca-err-detail")?.textContent).toBe(failWith);
		expect(queryByText(/No data for this range/)).toBeNull();
		failWith = null;
		fireEvent.click(await findByRole("button", { name: "Try again" }));
		await findByText("/a");
		await waitFor(() => expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0));
	});

	it("renders the revenue strip only when the site has revenue, in the default currency with the other currencies line", async () => {
		const none = render(<Overview />);
		await none.findByText("/a");
		await waitFor(() => expect(queries().some((b) => b.report === "revenue")).toBe(true));
		expect(none.container.querySelector(".ca-revenue-strip")).toBeNull();
		cleanup();
		hasRevenue = true;
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/?from=2026-03-01&to=2026-03-02&site=main&cur=EUR&cmp=previous");
		const { container, findByText } = render(<Overview />);
		await findByText("Other currencies: 120.00 EUR (3 orders).");
		const strip = container.querySelector(".ca-revenue-strip") as HTMLElement;
		expect([...strip.querySelectorAll("[data-metric]")].map((k) => k.getAttribute("data-metric"))).toEqual(["revenue", "orders", "aov", "revenue_per_visitor"]);
		expect(strip.querySelector('[data-metric="revenue"]')?.textContent).toContain("Revenue (USD)1,234.50 USD");
		// The strip is in the default currency: the `cur` of the Revenue page is not sent.
		expect(queries().filter((b) => b.report === "revenue").every((b) => b.params === undefined)).toBe(true);
		// A panel like the others, with "Show all" as its last child: it links to the Revenue page, the home of revenue.
		expect(strip.classList.contains("ca-panel")).toBe(true);
		expect(strip.lastElementChild?.matches("a.ca-more")).toBe(true);
		expect(strip.querySelector("a.ca-more")?.getAttribute("href")).toBe("/_emdash/admin/plugins/cookieless-analytics/revenue");
		// The compare note is printed once above the page's cards, not again inside the strip.
		expect(container.textContent).toContain("vs previous period");
		expect(strip.textContent).not.toContain("vs previous period");
	});

	it("toggles annotation markers through the URL with aria-pressed", async () => {
		const { findByRole, container } = render(<Overview />);
		const toggle = await findByRole("button", { name: "Annotations" });
		await waitFor(() => expect(container.querySelector('[data-marker="2026-03-02"]')).not.toBeNull());
		expect(toggle.getAttribute("aria-pressed")).toBe("true");
		expect(container.querySelector(".ca-chart svg")?.getAttribute("aria-label")).toMatch(/, 1 annotation$/);
		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-pressed")).toBe("false");
		expect(container.querySelector("[data-marker]")).toBeNull();
		expect(container.querySelector(".ca-chart svg")?.getAttribute("aria-label")).not.toMatch(/annotation/);
		expect(window.location.search).toContain("ann=0");
		fireEvent.click(toggle);
		expect(window.location.search).not.toContain("ann=");
		expect(container.querySelector('[data-marker="2026-03-02"]')).not.toBeNull();
	});

	it("adds an is chip when a table value is clicked, updates the URL and queries again", async () => {
		const { findByRole, container } = render(<Overview />);
		fireEvent.click(await findByRole("button", { name: "/a" }));
		await waitFor(() => expect(queries().some((b) => (b.query.filters as unknown[]).length === 1)).toBe(true));
		const f = [{ dim: "page", op: "is", values: ["/a"] }];
		expect(decodeState(window.location.search, "UTC").filters).toEqual(f);
		expect(new URLSearchParams(window.location.search).get("site")).toBe("main");
		await waitFor(() => expect(queries().filter((b) => JSON.stringify(b.query.filters) === JSON.stringify(f)).length).toBe(PANELS.length));
		expect(queries().filter((b) => JSON.stringify(b.query.filters) === JSON.stringify(f)).map((b) => b.report).sort()).toEqual(PANELS);
		expect(container.querySelector(".ca-chip")?.textContent).toContain("Page is /a");
	});

	it("changing the preset rewrites from and to", async () => {
		const { findByLabelText } = render(<Overview />);
		fireEvent.change(await findByLabelText("Date range"), { target: { value: "7d" } });
		const s = decodeState(window.location.search, "UTC");
		expect(s.from < s.to).toBe(true);
		expect(s.compare).toBe("previous");
		await waitFor(() => expect(queries().some((b) => b.query.from === s.from)).toBe(true));
	});

	it("writes the default view into the URL on first load", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/");
		const { findByText } = render(<Overview />);
		await findByText("/a");
		const q = new URLSearchParams(window.location.search);
		expect(q.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(q.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("exports the table and reports export errors", async () => {
		const created = vi.fn(() => "blob:x");
		vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }));
		const clicked: string[] = [];
		const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
			clicked.push(this.download);
		});
		const { findByRole, container, findByText } = render(<Overview />);
		await findByRole("button", { name: "/a" });
		const top = within(container.querySelector('[data-report="pages"]') as HTMLElement);
		const menu = top.getByRole("button", { name: "Export and columns: Top pages" });
		const choose = async (name: string) => {
			fireEvent.click(menu);
			fireEvent.click(await screen.findByRole("menuitem", { name }));
		};
		await choose("Export CSV");
		await waitFor(() => expect(clicked).toEqual(["pages-2026-03-01.csv"]));
		const exp = calls.find((c) => c.route === "data/export")?.body;
		expect(exp).toMatchObject({ report: "pages", format: "csv", query: { site: "main", compare: "previous" } });
		exportResponse = () => new Response(JSON.stringify({ success: false, error: { code: "invalid", message: "Range too long." } }), { status: 400 });
		await choose("Export JSON");
		expect(await findByText("Range too long.")).toBeTruthy();
		spy.mockRestore();
	});

	it("saves a segment with the selected segment's filters plus the chips", async () => {
		segmentItems = [{ id: "s1", data: { name: "Germany", filters: [{ dim: "country", op: "is", values: ["DE"] }] } }];
		const f = btoa(JSON.stringify([{ dim: "page", op: "is", values: ["/blog"] }]));
		window.history.replaceState(null, "", `/_emdash/admin/plugins/x/?from=2026-03-01&to=2026-03-02&f=${f}&seg=s1`);
		const { findByLabelText, getByRole } = render(<Overview />);
		fireEvent.change(await findByLabelText("Segment name"), { target: { value: "German blog" } });
		fireEvent.click(getByRole("button", { name: "Save as segment" }));
		await waitFor(() => expect(new URLSearchParams(window.location.search).get("seg")).toBe("s2"));
		expect(calls.find((c) => c.route === "segments/save")?.body).toEqual({
			data: {
				name: "German blog",
				filters: [
					{ dim: "country", op: "is", values: ["DE"] },
					{ dim: "page", op: "is", values: ["/blog"] },
				],
			},
		});
		expect(new URLSearchParams(window.location.search).get("f")).toBeNull();
	});

	it("shows an applied segment from a link that is not listed and lets it be cleared", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/?from=2026-03-01&to=2026-03-02&seg=other&f=" + btoa(JSON.stringify([{ dim: "page", op: "is", values: ["/a"] }])));
		const { findByLabelText, queryByLabelText } = render(<Overview />);
		const select = (await findByLabelText("Segment")) as HTMLSelectElement;
		expect(select.value).toBe("other");
		expect(select.selectedOptions[0]?.textContent).toBe("Segment from the link");
		expect(queryByLabelText("Segment name")).toBeNull();
		fireEvent.change(select, { target: { value: "" } });
		expect(new URLSearchParams(window.location.search).get("seg")).toBeNull();
	});

	it("shows the summary badge with the chip reason, strikes the chip through and offers the range with all filters", async () => {
		const f = Buffer.from(JSON.stringify([{ dim: "country", op: "is", values: ["DE"] }, { dim: "page", op: "is", values: ["/a"] }])).toString("base64url");
		window.history.replaceState(null, "", `/_emdash/admin/plugins/x/?from=2026-01-01&to=2026-03-02&f=${f}&site=main`);
		notices = ["summary", "filter_unavailable:page:combination", "detail_from:2026-02-01"];
		const { container, getByRole } = render(<Overview />);
		const badge = await waitFor(() => container.querySelector('[data-label="Summary data"]')?.closest('[role="status"]') ?? Promise.reject(new Error("no badge")));
		expect(badge?.textContent).toContain(CAVEATS.rollup);
		expect(badge?.textContent).toContain("Page cannot be combined with country in summary data.");
		expect(badge?.textContent).toContain("Detailed data starts on 2026-02-01.");
		await waitFor(() => expect(container.querySelector('.ca-chip[data-dim="page"]')?.getAttribute("data-off")).toBe("true"));
		const chip = container.querySelector('.ca-chip[data-dim="page"]') as HTMLElement;
		expect(chip.getAttribute("title")).toBe("Page cannot be combined with country in summary data.");
		expect(chip.textContent).toContain("Not applied: Page cannot be combined with country in summary data.");
		expect(container.querySelector('.ca-chip[data-dim="country"]')?.hasAttribute("data-off")).toBe(false);
		// The detailed answer has no summary notice: the chip is applied again.
		notices = [];
		fireEvent.click(getByRole("button", { name: "Show 2026-02-01 to 2026-03-02 with all filters" }));
		const st = decodeState(window.location.search, "UTC");
		expect([st.from, st.to, st.filters.length]).toEqual(["2026-02-01", "2026-03-02", 2]);
		await waitFor(() => expect(container.querySelector('.ca-chip[data-dim="page"]')?.hasAttribute("data-off")).toBe(false));
	});

	it("a narrow_range answer offers the longest range that fits", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				const route = url.split("/").slice(-2).join("/");
				if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, timezone: "UTC" }] });
				if (route === "data/query")
					return new Response(JSON.stringify({ success: false, error: { code: "narrow_range", message: "This range holds about 2,400,000 visits, more than one detailed report may read with these filters. Choose 2026-02-20 to 2026-03-02, or filters the daily summaries can answer." } }), { status: 400, headers: { "content-type": "application/json" } });
				return ok({ items: [] });
			}),
		);
		const { findAllByRole } = render(<Overview />);
		const action = (await findAllByRole("button", { name: "Show 2026-02-20 to 2026-03-02" }))[0] as HTMLElement;
		fireEvent.click(action);
		expect([decodeState(window.location.search, "UTC").from, decodeState(window.location.search, "UTC").to]).toEqual(["2026-02-20", "2026-03-02"]);
	});
});
