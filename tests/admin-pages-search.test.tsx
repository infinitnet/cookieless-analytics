// @vitest-environment jsdom
/** Pages tab search columns and the Queries drawer against the per-site `search/status`. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Pages from "../src/admin/pages/Pages.js";

type Body = Record<string, any>;
let calls: Array<{ route: string; body: Body }> = [];
let sources: Array<Record<string, unknown>> = [];

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const SITES = [
	{ id: "main", label: "This site", local: true, kind: "local", timezone: "UTC" },
	{ id: "shop", label: "Shop", local: false, kind: "client", timezone: "UTC" },
	{ id: "far", label: "Far", local: false, kind: "remote", timezone: "UTC" },
];

beforeEach(() => {
	calls = [];
	sources = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			if (route === "sites/list") return ok({ sites: SITES });
			if (route === "config/segments/list") return ok({ items: [] });
			if (route === "search/status") return ok({ sources });
			const row = body.report === "pages" ? { key: "/a", pageviews: 9, visitors: 5, clicks: 7, impressions: 100, ctr: 0.07, position: 4.5 } : { key: "blue widgets", clicks: 2, impressions: 20, ctr: 0.1, position: 3 };
			return ok({ report: body.report, range: { from: body.query.from, to: body.query.to }, compare: "none", compareRange: null, notices: [], data: { rows: [row] } });
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const at = (site: string) => window.history.replaceState(null, "", `/_emdash/admin/plugins/x/pages?from=2026-03-01&to=2026-03-07${site ? `&site=${site}` : ""}`);
const queries = () => calls.filter((c) => c.route === "data/query").map((c) => c.body);

describe("Pages search columns per site", () => {
	it("a client site reads its own status and opens the drawer for its pages", async () => {
		at("shop");
		sources = [{ id: "google", configured: true, property: "" }, { id: "bing", configured: true, property: "https://example.org/" }];
		render(<Pages />);
		await screen.findByRole("columnheader", { name: "Impressions" });
		expect(calls.find((c) => c.route === "search/status")?.body).toEqual({ site: "shop" });
		await waitFor(() => expect(queries().some((b) => b.report === "pages" && b.params?.withSearch && b.query.site === "shop")).toBe(true));
		fireEvent.click(screen.getByRole("button", { name: "Queries: /a" }));
		await screen.findByRole("complementary", { name: "Search queries for /a" });
		await waitFor(() => expect(queries().some((b) => b.report === "search_page_queries" && b.params?.page === "/a" && b.query.site === "shop")).toBe(true));
		await screen.findByText("blue widgets");
	});

	it("a connected but unmapped source shows no search columns", async () => {
		at("");
		sources = [{ id: "google", configured: true, property: "" }, { id: "bing", configured: false, property: "" }];
		render(<Pages />);
		await screen.findByRole("button", { name: "/a" });
		expect(screen.queryByRole("columnheader", { name: "Impressions" })).toBeNull();
		expect(queries().find((b) => b.report === "pages")?.params).toBeUndefined();
	});

	it("a remote site reads no status and shows no search columns", async () => {
		at("far");
		render(<Pages />);
		await screen.findByRole("button", { name: "/a" });
		expect(calls.some((c) => c.route === "search/status")).toBe(false);
		expect(screen.queryByRole("columnheader", { name: "Impressions" })).toBeNull();
	});
});
