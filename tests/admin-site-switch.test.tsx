// @vitest-environment jsdom
/** Site switcher with the three kinds: kind labels, a missing key, reports through the proxy, notices on Config and Data. */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pages } from "../src/admin/index.js";

type Body = Record<string, any>;
let calls: Array<{ route: string; body: Body }> = [];

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const SITES = [
	{ id: "main", label: "This site", local: true, kind: "local", timezone: "UTC" },
	{ id: "news", label: "News", local: false, kind: "client", timezone: "UTC" },
	{ id: "blog", label: "Blog", local: false, kind: "remote", timezone: "UTC", origin: "https://blog.example.net", keyPresent: true },
	{ id: "far", label: "Far", local: false, kind: "remote", timezone: "UTC", origin: "https://far.example.net", keyPresent: false },
];

const at = (path: string, site: string) => window.history.replaceState(null, "", `/_emdash/admin/plugins/cookieless-analytics${path}?from=2026-03-01&to=2026-03-07&site=${site}`);

beforeEach(() => {
	calls = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			if (route === "sites/list") return ok({ sites: SITES });
			if (route === "data/query") return ok({ report: body.report, range: { from: body.query.from, to: body.query.to }, compare: "none", compareRange: null, notices: [], data: { totals: {}, rows: [], series: [] } });
			return ok({ items: [] });
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("site switcher with remote satellites", () => {
	it("lists local, client and remote sites with their kind and flags a missing key", async () => {
		at("/", "blog");
		const Overview = pages["/"];
		render(<Overview />);
		const select = (await screen.findByLabelText("Site")) as HTMLSelectElement;
		expect([...select.options].map((o) => o.textContent)).toEqual(["All sites", "This site (this install)", "News (client site)", "Blog (connected site)", "Far (connected site, key missing)"]);
		expect(select.value).toBe("blog");
	});

	it("runs every report of a remote site through data/query with its id", async () => {
		at("/", "blog");
		const Overview = pages["/"];
		render(<Overview />);
		await waitFor(() => expect(calls.some((c) => c.route === "data/query")).toBe(true));
		const queries = calls.filter((c) => c.route === "data/query");
		expect(queries.every((c) => c.body.query.site === "blog")).toBe(true);
		// A connected site has no segments here.
		expect(calls.some((c) => c.route === "config/segments/list")).toBe(false);
		expect(screen.queryByText(/is not set on this install/)).toBeNull();
	});

	it("shows the missing key banner for a remote site without a key", async () => {
		at("/", "far");
		const Overview = pages["/"];
		render(<Overview />);
		expect(await screen.findByText(/The API key of Far is not set on this install/)).toBeTruthy();
	});

	it.each(["/config", "/data"] as const)("%s shows a notice with a link to the remote admin instead of forms", async (path) => {
		at(path, "blog");
		const Page = pages[path];
		render(<Page />);
		const link = (await screen.findByText("Open the admin of Blog")) as HTMLAnchorElement;
		expect(link.getAttribute("href")).toBe(`https://blog.example.net/_emdash/admin/plugins/cookieless-analytics${path}`);
		expect(calls.some((c) => c.route.startsWith("config/") && c.route !== "config/segments/list")).toBe(false);
	});
});
