// @vitest-environment jsdom
/**
 * SEO tabs of the Search page and the Changes tab of the Pages page:
 * mocked routes, the params the controls post, the period and coverage lines, the 93 day text, the scope notices.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Pages from "../src/admin/pages/Pages.js";
import { resetSearchStatus } from "../src/admin/api.js";
import Search from "../src/admin/pages/Search.js";
import { SEO_TEXT } from "../src/query/reports/seo-copy.js";
import { QuerySchema } from "../src/query/filters.js";

type Body = Record<string, any>;
let calls: Array<{ route: string; body: Body }> = [];
let sources: Array<Record<string, unknown>> = [];

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const src = (id: "google" | "bing", configured = true) => ({ id, configured, property: configured ? "sc-domain:example.com" : "", lastRun: null, status: "ok", lastError: null, lastErrorAt: null, syncing: false, rows: 10, firstDay: "2026-03-01", lastDay: "2026-03-11", backfill: null });
const PERIODS = { current: { from: "2026-02-27", to: "2026-03-12" }, previous: { from: "2026-02-13", to: "2026-02-26" }, days: 14, excluded: 2, reason: "provisional" };

function data(body: Body): Record<string, unknown> {
	const bing = body.params?.source === "bing" || body.params?.source === "all" || !body.params?.source;
	const pairs = bing && String(body.report).includes("cannibalization") ? ["bing_no_pairs", "coverage"] : ["coverage"];
	switch (body.report) {
		case "search_position_bands":
			return { rows: ["1-3", "4-10", "11-20", "21-50", "51+"].map((b, i) => ({ key: b, queries: 5 - i, impressions: 100, clicks: 10, ctr: 0.1, impressions_share: 0.2 })), totals: { queries: 15 } };
		case "search_position_bands_series":
			return { keys: ["band_1_3", "band_4_10"], labels: ["1-3", "4-10"], series: [{ t: "2026-03-01", band_1_3: 2, band_4_10: 3 }] };
		case "search_position_moves":
			return { matrix: [{ from: "11-20", to: "1-3", queries: 1, impressions: 100 }], up: [{ query: "up q", impressions: 100, clicks: 20, position_previous: 15, position_current: 2, band_previous: "11-20", band_current: "1-3" }], down: [], new: [], lost: [{ query: "lost q", impressions: 50, clicks: 1, position_previous: 8, position_current: null, band_previous: "4-10", band_current: null }], totals: { moved_up: 1 }, periods: PERIODS, notices: ["provisional_excluded"] };
		case "search_striking_distance":
			return { rows: [{ key: "s1\u0000/a", query: "s1", page: "/a", impressions: 200, clicks: 10, ctr: 0.05, position: 4, potential_clicks: 50 }], totals: { ctr_1_3: 0.3, impressions_1_3: 1000 }, notices: ["coverage"] };
		case "search_cannibalization":
			return {
				rows: [{ key: "blue widgets", query: "blue widgets", pages: 2, impressions: 900, clicks: 70, pattern: "shared", best_page: "/a", page_list: [{ page: "/a", impressions: 600, impressions_share: 0.6667, clicks: 60, clicks_share: 0.8571, position: 2 }, { page: "/b", impressions: 300, impressions_share: 0.3333, clicks: 10, clicks_share: 0.1429, position: 5 }] }],
				totals: { cannibalized_queries: 1, cannibalized_impressions: 900, visible_share: 0.712 },
				floors: { minImpressions: 50, minShare: 10, brandTerms: 1, includeBrand: false },
				notices: pairs,
			};
		case "search_cannibalization_pages":
			return { rows: [{ key: "/a", queries: 5, overlapping_queries: 4, overlapping_queries_pct: 0.8, impressions: 1820, overlapping_impressions: 1800, overlapping_impressions_pct: 0.989, clicks: 148, overlapping_clicks: 148 }], notices: pairs };
		case "search_cannibalization_page":
			return { page: body.params.page, pairs: [{ other_page: "/b", shared_queries: 4, shared_impressions_this: 1800, shared_impressions_other: 700 }], queries: [], notices: pairs };
		case "search_cannibalization_query":
			return { query: body.params.query, page_list: [{ page: "/a", impressions: 40, impressions_share: 1, clicks: 2, clicks_share: 1, position: 4 }], notices: [] };
		case "search_movers":
		case "traffic_movers":
			return { rows: [{ key: "/a", current: 40, previous: 100, delta: -60, delta_pct: -0.6, notable: true }, { key: "/b", current: 5, previous: 10, delta: -5, delta_pct: -0.5, notable: false }], periods: PERIODS, notices: ["provisional_excluded"] };
		case "search_decay":
			return { rows: [{ key: "/p", oldest: 100, middle: 60, current: 30, loss: 70, position_oldest: 3, position_current: 6, diagnosis: "position" }], periods: { ...PERIODS, oldest: { from: "2026-01-30", to: "2026-02-12" } } };
		case "traffic_decay":
			return { rows: [{ key: "/x", oldest: 300, middle: 200, current: 100, loss: 200 }], periods: PERIODS };
		case "dimension_values":
			return { rows: [{ key: "/" }, { key: "/pricing" }] };
		default:
			return { rows: [] };
	}
}

beforeEach(() => {
	resetSearchStatus();
	calls = [];
	sources = [src("google"), src("bing")];
	window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?from=2026-03-01&to=2026-03-14");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			switch (route) {
				case "sites/list":
					return ok({ sites: [{ id: "main", label: "This site", local: true, kind: "local", timezone: "UTC" }] });
				case "config/segments/list":
					return ok({ items: [] });
				case "search/status":
					return ok({ site: "main", kind: "local", sources, provisional: { from: "2026-03-10", to: "2026-03-12" } });
				case "data/query":
					return ok({ report: body.report, range: { from: body.query.from, to: body.query.to }, compare: "none", compareRange: null, notices: [], data: data(body) });
				default:
					return ok({ items: [] });
			}
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const queries = (report?: string) => calls.filter((c) => c.route === "data/query" && (!report || c.body.report === report)).map((c) => c.body);
const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)));
const openTab = async (name: string) => fireEvent.click(await screen.findByRole("tab", { name }));

describe("Search page SEO tabs", () => {
	it("Positions: bands, the stacked trend, the moves matrix and lists, striking distance; dim toggle posts the param", async () => {
		render(<Search />);
		await openTab("Positions");
		const panel = await screen.findByRole("region", { name: "Positions" });
		await within(panel).findByRole("table", { name: "Position bands" });
		expect(within(panel).getByRole("img", { name: "Bands over time" })).toBeTruthy();
		expect(await within(panel).findByText(/Comparing 2026-02-27 to 2026-03-12 with the 14 days before; the newest 2 days are excluded as provisional/)).toBeTruthy();
		expect(within(panel).getByText("up q")).toBeTruthy();
		fireEvent.click(within(panel).getByRole("button", { name: "Lost" }));
		expect(await within(panel).findByText("lost q")).toBeTruthy();
		expect(within(panel).getByText(SEO_TEXT.coverage)).toBeTruthy();
		expect(within(panel).getByText(/Potential clicks \(est\.\)/)).toBeTruthy();
		fireEvent.click(within(panel).getByRole("button", { name: "Pages" }));
		await waitFor(() => expect(queries("search_position_bands").at(-1)?.params).toEqual({ source: "all", dim: "page" }));
		expect(queries("search_position_moves").every((q) => q.query.compare === "none")).toBe(true);
	});

	it("Cannibalization: coverage line with the visible share, floors prefilled and posted, expandable rows, drawers", async () => {
		render(<Search />);
		await openTab("Cannibalization");
		const panel = await screen.findByRole("region", { name: "Cannibalization" });
		expect(await within(panel).findByText(/Visible share of impressions: 71\.2%/)).toBeTruthy();
		expect(within(panel).getByText(/Based on Google Search Console data/)).toBeTruthy();
		expect(within(panel).queryByText(`${SEO_TEXT.bingNoPairs}.`)).toBeNull();
		const imp = within(panel).getByLabelText("Minimum impressions") as HTMLInputElement;
		await waitFor(() => expect(imp.value).toBe("50"));
		fireEvent.change(imp, { target: { value: "80" } });
		fireEvent.click(within(panel).getByLabelText("Include brand queries"));
		await waitFor(() => expect(queries("search_cannibalization").at(-1)?.params).toEqual({ source: "all", minImpressions: 80, includeBrand: true }));
		fireEvent.click(await within(panel).findByRole("button", { name: "blue widgets" }));
		expect(within(panel).getByRole("button", { name: "/b" })).toBeTruthy();
		fireEvent.click(within(panel).getByRole("button", { name: "Pages of blue widgets" }));
		const drawer = await screen.findByRole("dialog", { name: "Pages of blue widgets" });
		expect(within(drawer).getByText(`Bing: ${SEO_TEXT.bingOnRequest}`)).toBeTruthy();
		expect(queries("search_cannibalization_query").at(-1)?.params).toEqual({ source: "all", query: "blue widgets" });
		// Focus is in the drawer; Escape closes it like the Close button does.
		expect(document.activeElement).toBe(drawer);
		fireEvent.keyDown(drawer, { key: "Escape" });
		expect(screen.queryByRole("dialog", { name: "Pages of blue widgets" })).toBeNull();
		fireEvent.click(within(panel).getByRole("button", { name: "/a" }));
		await screen.findByRole("dialog", { name: "Competing pages of /a" });
		expect(queries("search_cannibalization_page").at(-1)?.params).toMatchObject({ page: "/a" });
		fireEvent.click(within(panel).getByRole("button", { name: "Pages" }));
		await within(panel).findAllByRole("table", { name: "Competing pages" });
		await waitFor(() => expect(queries("search_cannibalization_pages").length).toBeGreaterThan(0));
	});

	it("Bing only: the pair lists say they are Google data in the coverage line, and bands and movers still render from Bing rows", async () => {
		sources = [src("google", false), src("bing")];
		render(<Search />);
		// One mapped source: no switch, the reports ask for Bing.
		await openTab("Cannibalization");
		expect(await screen.findByText(/Based on Google Search Console data/)).toBeTruthy();
		expect(screen.queryByText(`${SEO_TEXT.bingNoPairs}.`)).toBeNull();
		await openTab("Positions");
		await screen.findByRole("table", { name: "Position bands" });
		expect(queries("search_position_bands").at(-1)?.params.source).toBe("bing");
		await openTab("Changes");
		await screen.findByRole("table", { name: "Declining pages" });
		expect(queries("search_movers").at(-1)?.params).toEqual({ source: "bing", dim: "page", direction: "down", metric: "clicks" });
	});

	it("Changes: controls post dim, direction and metric; notable only hides rows; decay panel with diagnosis; period line", async () => {
		render(<Search />);
		await openTab("Changes");
		const panel = await screen.findByRole("region", { name: "Changes" });
		await within(panel).findByText("/b");
		fireEvent.click(within(panel).getByRole("button", { name: "Queries" }));
		fireEvent.click(within(panel).getByRole("button", { name: "Rising" }));
		fireEvent.click(within(panel).getByRole("button", { name: "Impressions" }));
		await waitFor(() => expect(queries("search_movers").at(-1)?.params).toEqual({ source: "all", dim: "query", direction: "up", metric: "impressions" }));
		await within(panel).findByText("/b");
		fireEvent.click(within(panel).getByLabelText("Notable only"));
		await waitFor(() => expect(within(panel).queryByText("/b")).toBeNull());
		expect(within(panel).getByText("Position")).toBeTruthy();
		expect(within(panel).getAllByText(/Comparing 2026-02-27 to 2026-03-12/).length).toBeGreaterThan(0);
	});

	it("12m and ytd show the 93 day text instead of data", async () => {
		const today = new Date().toISOString().slice(0, 10);
		const y = Number(today.slice(0, 4));
		const from = new Date(Date.UTC(y - 1, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + 1)).toISOString().slice(0, 10);
		window.history.replaceState(null, "", `/_emdash/admin/plugins/cookieless-analytics/search?from=${from}&to=${today}`);
		render(<Search />);
		await openTab("Positions");
		expect(await screen.findByText(SEO_TEXT.rangeTooLong)).toBeTruthy();
		await openTab("Changes");
		expect(await screen.findByText(SEO_TEXT.rangeTooLong)).toBeTruthy();
		await settle();
		expect(queries("search_movers")).toHaveLength(0);
		expect(queries("search_position_bands")).toHaveLength(0);
	});
});

describe("Pages page Changes tab", () => {
	it("traffic movers and decay with the period line; direction posts the param", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/pages?from=2026-03-01&to=2026-03-14");
		render(<Pages />);
		await openTab("Changes");
		const panel = await screen.findByRole("region", { name: "Changes" });
		await within(panel).findByRole("table", { name: "Declining pages" });
		expect(within(panel).getByRole("table", { name: "Page views declining over three periods" })).toBeTruthy();
		expect(within(panel).getAllByText(/Comparing 2026-02-27 to 2026-03-12/).length).toBeGreaterThan(0);
		fireEvent.click(within(panel).getByRole("button", { name: "Rising" }));
		await waitFor(() => expect(queries("traffic_movers").at(-1)?.params).toEqual({ direction: "up" }));
	});
});


describe("segment comparison", () => {
	it("every SEO view and drawer, and Pages > Changes, send a query the server accepts", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?from=2026-03-01&to=2026-03-14&cmp=seg&cseg=s1");
		render(<Search />);
		await openTab("Positions");
		await screen.findByRole("table", { name: "Position bands" });
		await openTab("Cannibalization");
		const panel = await screen.findByRole("region", { name: "Cannibalization" });
		fireEvent.click(await within(panel).findByRole("button", { name: "blue widgets" }));
		fireEvent.click(within(panel).getByRole("button", { name: "/a" }));
		await screen.findByRole("dialog", { name: "Competing pages of /a" });
		await openTab("Changes");
		await screen.findByRole("table", { name: "Declining pages" });
		cleanup();
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/pages?from=2026-03-01&to=2026-03-14&cmp=seg&cseg=s1");
		render(<Pages />);
		await openTab("Changes");
		await screen.findByRole("table", { name: "Page views declining over three periods" });
		const seo = queries().filter((q) => /^search_|^traffic_/.test(String(q.report)));
		for (const r of ["search_position_bands", "search_position_moves", "search_cannibalization", "search_cannibalization_page", "search_movers", "search_decay", "traffic_movers", "traffic_decay"]) expect(seo.some((q) => q.report === r), r).toBe(true);
		for (const q of seo) expect(QuerySchema.safeParse(q.query).success, `${q.report} ${JSON.stringify(q.query)}`).toBe(true);
	});
});
