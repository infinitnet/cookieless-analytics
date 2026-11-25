// @vitest-environment jsdom
/** Links page (Links convention): the table with the `by` selector, the per-link drill-down and the click series, against a mocked `data/query`. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pages } from "../src/admin/index.js";
import Links from "../src/admin/pages/Links.js";
import { ADMIN_PAGES } from "../src/index.js";

type Body = { report: string; query: { filters: unknown[] } & Record<string, unknown>; params?: Record<string, unknown> };
let calls: Body[] = [];
let revenueOn = false;

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const ROW = { impressions: 6, clicks: 3, ctr: 0.5, sessions: 3, conversions: 2 };

beforeEach(() => {
	calls = [];
	revenueOn = false;
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/links?from=2026-03-01&to=2026-03-07");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, timezone: "UTC" }] });
			if (route === "config/segments/list") return ok({ items: [] });
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push(body);
			const base = { report: body.report, range: { from: "2026-03-01", to: "2026-03-07" }, compare: "none", compareRange: null, notices: [] };
			if (body.report === "revenue") return ok({ ...base, data: { currency: "EUR", hasRevenue: revenueOn, currencies: [], totals: {}, rows: [] } });
			if (body.report === "timeseries") return ok({ ...base, data: { granularity: "day", series: [{ t: "2026-03-01", sessions: 2 }, { t: "2026-03-02", sessions: 1 }] } });
			const p = body.params ?? {};
			const key = p.slug ? `${String(p.by)} of ${String(p.slug)}` : p.by === "link" ? "alpha-offer" : `${String(p.by)} one`;
			return ok({ ...base, data: { by: p.by, rows: [{ key, ...ROW, ...(p.withRevenue ? { revenue: 12.5, revenue_currency: "EUR" } : {}) }], ...(p.withRevenue ? { currency: "EUR", currencies: [] } : {}) } });
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const links = () => calls.filter((b) => b.report === "links");
const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)));

describe("Links page", () => {
	it("is a descriptor page in the Analytics folder, registered in the admin entry", () => {
		expect(ADMIN_PAGES.find((p) => p.path === "/links")).toEqual({ path: "/links", label: "Links", icon: "tag", group: "Analytics" });
		expect(pages["/links"]).toBe(Links);
	});

	it("renders the table, switches the breakdown and drills into one link", async () => {
		render(<Links />);
		const table = await screen.findByRole("table", { name: "Links" });
		expect(within(table).getByText("alpha-offer")).toBeTruthy();
		expect(within(table).getByText("50.0%")).toBeTruthy();
		expect(links()[0]?.params).toEqual({ by: "link" });
		// The daily series counts sessions with a click: timeseries filtered on the click event.
		const ts = calls.find((b) => b.report === "timeseries");
		expect(ts?.query.filters).toEqual([{ dim: "event", op: "is", values: ["out"] }]);
		// In a titled panel with its cards: sessions and visitors with a click.
		expect(await screen.findByRole("img", { name: /^Sessions with a click per day/ })).toBeTruthy();
		expect(screen.getByRole("heading", { name: /^Sessions with a click per day( |$)/ })).toBeTruthy();
		expect(screen.getByRole("button", { name: /^Visitors with a click / })).toBeTruthy();

		fireEvent.click(within(table).getByRole("button", { name: /Details/ }));
		const detail = await screen.findByRole("region", { name: "Details of alpha-offer" });
		await waitFor(() => expect(within(detail).getByText("place of alpha-offer")).toBeTruthy());
		expect(links().at(-1)?.params).toEqual({ by: "place", slug: "alpha-offer" });
		fireEvent.click(within(within(detail).getByRole("group", { name: "alpha-offer by" })).getByRole("button", { name: "Channel" }));
		await waitFor(() => expect(links().at(-1)?.params).toEqual({ by: "channel", slug: "alpha-offer" }));

		fireEvent.click(within(screen.getByRole("group", { name: "Links by" })).getByRole("button", { name: "Placement" }));
		await waitFor(() => expect(links().at(-1)?.params).toEqual({ by: "place" }));
		await settle();
		expect(screen.queryByRole("region", { name: "Details of alpha-offer" })).toBeNull();
		expect(await screen.findByRole("table", { name: "Links by placement" })).toBeTruthy();
	});

	it("names the sale column as a links tile does", async () => {
		const { metricLabel } = await import("../src/dashboards/tiles.js");
		render(<Links />);
		const table = await screen.findByRole("table", { name: "Links" });
		const headers = within(table).getAllByRole("columnheader").map((h) => h.querySelector("button")?.textContent ?? h.textContent);
		expect(headers).toContain(metricLabel("conversions"));
		expect(metricLabel("conversions")).toBe("Sales");
	});

	it("adds the revenue column in the site's currency only when the site records revenue", async () => {
		revenueOn = true;
		render(<Links />);
		const table = await screen.findByRole("table", { name: "Links" });
		expect(within(table).getByRole("columnheader", { name: /Revenue \(EUR\)/ })).toBeTruthy();
		expect(links()[0]?.params).toEqual({ by: "link", withRevenue: true });
	});
});
