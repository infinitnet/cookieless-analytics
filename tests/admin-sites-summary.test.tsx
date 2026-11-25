// @vitest-environment jsdom
/** All sites: the switcher entry, the Overview table and the banner on every other page. */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteSwitcher } from "../src/admin/components/Header.js";
import Overview from "../src/admin/pages/Overview.js";
import Pages from "../src/admin/pages/Pages.js";
import type { SiteEntry, SummaryRow } from "../src/routes/sites.js";

type Body = Record<string, unknown> & { query?: Record<string, unknown> };
let calls: Array<{ route: string; body: Body }> = [];
const SITES: SiteEntry[] = [
	{ id: "main", label: "This site", local: true, kind: "local", timezone: "UTC" },
	{ id: "blog", label: "Blog", local: false, kind: "client", timezone: "UTC" },
	{ id: "shop", label: "Shop", local: false, kind: "client", timezone: "UTC" },
];
const row = (id: string, label: string, kind: SummaryRow["kind"], pageviews: number, revenue: SummaryRow["revenue"] = []): SummaryRow => ({
	id,
	label,
	kind,
	sessions: pageviews / 2,
	pageviews,
	visitors: pageviews / 4,
	bounce_rate: 0.25,
	engaged_rate: 0.5,
	revenue,
	previous: { pageviews: (pageviews * 2) / 3 },
});
const SUMMARY = {
	from: "2026-03-01",
	to: "2026-03-07",
	compare: "previous",
	compareRange: { from: "2026-02-22", to: "2026-02-28" },
	watermark: "2026-03-06",
	rows: [
		row("shop", "Shop", "client", 400, [
			{ currency: "USD", revenue: 120.5, orders: 3 },
			{ currency: "EUR", revenue: 80, orders: 2 },
		]),
		row("main", "This site", "local", 200),
		row("blog", "Blog", "client", 100),
	],
	totals: {
		sessions: 350,
		pageviews: 700,
		visitors: null,
		revenue: [
			{ currency: "USD", revenue: 120.5, orders: 3 },
			{ currency: "EUR", revenue: 80, orders: 2 },
		],
		previous: { sessions: 350 / 1.1, pageviews: 700 / 1.2 },
	},
};
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
	calls = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/").slice(-2).join("/");
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			if (route === "sites/list") return ok({ sites: SITES });
			if (route === "sites/summary") return ok(SUMMARY);
			if (route.endsWith("/list")) return ok({ items: [] });
			if (route === "search/status") return ok({ sources: [] });
			return ok({ report: body.report, range: body.query, compare: "none", compareRange: null, notices: [], data: { rows: [], totals: {}, series: [] } });
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("All sites", () => {
	it("is the first switcher entry when two or more sites exist", () => {
		const onChange = vi.fn();
		const { getByLabelText } = render(<SiteSwitcher sites={SITES} value="all" onChange={onChange} />);
		const select = getByLabelText("Site") as HTMLSelectElement;
		expect([...select.options].map((o) => o.textContent)).toEqual(["All sites", "This site (this install)", "Blog (client site)", "Shop (client site)"]);
		expect(select.value).toBe("all");
		fireEvent.change(select, { target: { value: "blog" } });
		expect(onChange).toHaveBeenCalledWith("blog");
	});

	it("turns the Overview into the table: totals, not summed visitors, revenue per currency, deltas, watermark; a row click selects the site", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/?from=2026-03-01&to=2026-03-07&cmp=previous&site=all");
		const { findByText, container, getByRole } = render(<Overview />);
		await findByText("not summed");
		expect(calls.find((c) => c.route === "sites/summary")?.body).toEqual({ from: "2026-03-01", to: "2026-03-07", compare: "previous" });
		// No report of a single site is asked for, and the filter bar is not offered.
		expect(calls.some((c) => c.route === "data/query")).toBe(false);
		expect((container.querySelector("select[aria-label='Site']") as HTMLSelectElement).value).toBe("all");
		const rows = [...container.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("th")?.textContent);
		expect(rows).toEqual(["Shop", "This site", "Blog"]);
		const head = container.querySelector("thead")?.textContent ?? "";
		expect(head).toContain("Bounce rate");
		expect(head).not.toContain("Engaged rate");
		const headCells = container.querySelectorAll("thead tr:first-child > *").length;
		for (const tr of container.querySelectorAll("tbody tr, tfoot tr")) expect(tr.children.length).toBe(headCells);
		const shop = container.querySelector("tbody tr") as HTMLElement;
		expect(shop.textContent).toContain("120.50 USD");
		expect(shop.textContent).toContain("80.00 EUR");
		expect(shop.textContent).toContain("+50.0%");
		// The shared change cell: its own element with the judgment, not gray text glued to the figure.
		expect(shop.querySelector("td .ca-delta")?.getAttribute("data-judge")).toBe("better");
		const total = container.querySelector("tfoot tr") as HTMLElement;
		expect(total.textContent).toContain("700");
		expect(total.textContent).toContain("+20.0%");
		expect(total.querySelectorAll("td div")).toHaveLength(2);
		expect(container.querySelector(".ca-watermark")?.textContent).toContain("complete up to 2026-03-06");
		fireEvent.click(getByRole("button", { name: "Blog" }));
		await waitFor(() => expect(new URLSearchParams(window.location.search).get("site")).toBe("blog"));
		await waitFor(() => expect(calls.some((c) => c.route === "data/query" && c.body.query?.site === "blog")).toBe(true));
	});

	it("shows the local site with a banner offering the choice on every other page", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-03-01&to=2026-03-07&site=all");
		const { findByText, getByRole } = render(<Pages />);
		await findByText(/All sites is a table on the Overview page; this page shows This site\./);
		expect(getByRole("link", { name: "Open the All sites table" }).getAttribute("href")).toContain("?site=all&from=2026-03-01&to=2026-03-07");
		await waitFor(() => expect(calls.some((c) => c.route === "data/query")).toBe(true));
		// The local site is the id "main": its id travels in the query, never "all".
		expect(calls.filter((c) => c.route === "data/query").every((c) => c.body.query?.site !== "all")).toBe(true);
		fireEvent.click(getByRole("button", { name: "Stay on This site" }));
		await waitFor(() => expect(new URLSearchParams(window.location.search).get("site")).toBeNull());
	});
});
