// @vitest-environment jsdom
/** Search page: every row of the connection states matrix, source switch, annotations, loading older days, OAuth return, client and remote sites. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSearchStatus } from "../src/admin/api.js";
import { pages } from "../src/admin/index.js";
import Search, { backfillError, estimateText, explainError, pacedText, readOAuthReturn, storedDays } from "../src/admin/pages/Search.js";
import { FORBIDDEN_PUBLIC_WORDS } from "../src/contract.js";
import { settingsSchema } from "../src/settings.js";
import { BACKFILL_OPTIONS, backfillEstimate, PROVIDER_LIMIT_TEXT } from "../src/sources/budget.js";
import { ADMIN_PAGES } from "../src/index.js";

type Body = Record<string, any>;
let calls: Array<{ route: string; body: Body }> = [];
let sources: Array<Record<string, unknown>> = [];
let sites: Array<Record<string, unknown>> = [];
let annotations: unknown[] = [];
let budget: Record<string, unknown> | undefined;
/** `source` of the `search/oauth/exchange` answer (Bing answers "bing"). */
let exchangeSource: string | undefined;

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const src = (id: "google" | "bing", o: Record<string, unknown> = {}) => ({ id, configured: true, property: id === "google" ? "sc-domain:example.com" : "https://example.com/", lastRun: "2026-03-12T07:00:00.000Z", status: "ok", lastError: null, lastErrorAt: null, syncing: false, rows: 10, firstDay: "2026-03-01", lastDay: "2026-03-11", backfill: null, ...o });
const LOCAL = { id: "main", label: "This site", local: true, kind: "local", timezone: "UTC" };

beforeEach(() => {
	resetSearchStatus();
	calls = [];
	sources = [];
	annotations = [];
	budget = undefined;
	sites = [LOCAL];
	window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?from=2026-03-01&to=2026-03-07");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			switch (route) {
				case "sites/list":
					return ok({ sites });
				case "config/segments/list":
					return ok({ items: [] });
				case "search/status":
					return ok({ site: body.site ?? "main", kind: body.site ? "client" : "local", sources, ...(budget ? { budget } : {}), provisional: { from: "2026-03-10", to: "2026-03-12" } });
				case "search/properties":
					return ok({ site: body.site ?? "main", source: body.source, current: "", suggested: body.source === "google" ? "sc-domain:example.org" : "https://example.org/", items: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }, { siteUrl: body.source === "google" ? "sc-domain:example.org" : "https://example.org/", permissionLevel: "siteFullUser" }] });
				case "search/oauth/exchange":
					return ok({ connected: true, ...(exchangeSource ? { source: exchangeSource } : {}) });
				case "search/backfill":
					return ok(body.from === "2026-03-05" ? { stored: true, backfill: null } : {});
				case "search/oauth/start":
					return ok({ url: "https://accounts.google.com/o/oauth2/v2/auth?state=s" });
				case "data/query": {
					const base = { report: body.report, range: { from: body.query.from, to: body.query.to }, compare: "none", compareRange: null, notices: [] };
					if (body.report === "search_overview")
						return ok({
							...base,
							data: {
								totals: { clicks: 7, impressions: 200, ctr: 0.035, position: 4.25 },
								series: [
									{ t: "2026-03-01", clicks: 3, impressions: 100, ctr: 0.03, position: 4 },
									{ t: "2026-03-02", clicks: 4, impressions: 100, ctr: 0.04, position: 4.5 },
								],
								annotations,
							},
						});
					return ok({ ...base, data: { rows: [{ key: `${body.report} one`, clicks: 7, impressions: 100, ctr: 0.07, position: 4.5 }] } });
				}
				default:
					return ok({});
			}
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const routeCalls = (r: string) => calls.filter((c) => c.route === r).map((c) => c.body);
const queries = () => routeCalls("data/query");
const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)));
const OFF = { configured: false, property: "", lastRun: null, status: null, rows: 0, firstDay: null, lastDay: null };
const tabNames = () => screen.getAllByRole("tab").map((t) => t.textContent);
const ALL_TABS = ["Overview", "Queries", "Pages", "Countries", "Devices", "Positions", "Cannibalization", "Changes"];
const connections = () => screen.getByRole("button", { name: "Connections" });
const openConnections = async () => {
	const t = await screen.findByRole("button", { name: "Connections" });
	if (t.getAttribute("aria-expanded") === "false") fireEvent.click(t);
};
const card = (name: RegExp) => screen.getByRole("group", { name });
/** The rendered copy of a state: no en or em dash, no word the public surfaces must avoid. */
const checkCopy = (raw: string) => {
	// The product name in the footer and the admin redirect URI to copy are not copy.
	const text = raw.replace(/Cookieless Analytics by Infinitnet v?[\d.]+/, "").replace(/https?:\/\/\S*?plugins\/cookieless-analytics\/search/g, "");
	expect(/[\u2013\u2014]/.test(text), text).toBe(false);
	for (const w of FORBIDDEN_PUBLIC_WORDS) expect(text.toLowerCase().includes(w), `${w} in ${text}`).toBe(false);
};

describe("Search page", () => {
	it("is a descriptor page registered in the admin entry, among the fourteen", () => {
		expect(ADMIN_PAGES.find((p) => p.path === "/search")).toEqual({ path: "/search", label: "Search", icon: "search", group: "Analytics" });
		expect(pages["/search"]).toBe(Search);
		expect(ADMIN_PAGES).toHaveLength(14);
	});

	it("neither connected: the page is the setup, two cards closed to a Connect button, no switch, no tabs, no report", async () => {
		sources = [src("google", OFF), src("bing", OFF)];
		render(<Search />);
		await screen.findByRole("heading", { name: "Connect a Search source" });
		// Range and filters change nothing here: site select only, and with one site no header at all (matrix E).
		await waitFor(() => expect(document.querySelector(".ca-header")).toBeNull());
		const google = card(/Google Search Console/);
		expect(within(google).queryByLabelText("Client ID")).toBeNull();
		expect(within(card(/Bing Webmaster Tools/)).queryByLabelText("API key")).toBeNull();
		fireEvent.click(within(google).getByRole("button", { name: "Connect Google Search Console" }));
		expect(within(google).getByLabelText("Client ID")).toBeTruthy();
		expect(screen.getByText("/_emdash/admin/plugins/cookieless-analytics/search", { exact: false })).toBeTruthy();
		expect(screen.queryByRole("tablist")).toBeNull();
		expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
		await settle();
		expect(queries()).toHaveLength(0);
		checkCopy(document.body.textContent ?? "");
	});

	it("connects Google over OAuth: saves the client, then asks for the consent URL", async () => {
		sources = [src("google", OFF), src("bing", OFF)];
		const assign = vi.fn();
		vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign, search: "", origin: "https://example.com", pathname: "/x", hash: "" } as Location);
		render(<Search />);
		fireEvent.click(await screen.findByRole("button", { name: "Connect Google Search Console" }));
		fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "id.example" } });
		fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "secret" } });
		fireEvent.click(screen.getByRole("button", { name: "Connect Google" }));
		await waitFor(() => expect(assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=s"));
		expect(routeCalls("search/connect")).toEqual([{ gscAuth: "oauth", gscClientId: "id.example", gscClientSecret: "secret" }]);
		expect(routeCalls("search/oauth/start")).toHaveLength(1);
	});

	it("saves a service account and a Bing key through search/connect", async () => {
		sources = [src("google", OFF), src("bing", OFF)];
		render(<Search />);
		fireEvent.click(await screen.findByRole("button", { name: "Connect Google Search Console" }));
		fireEvent.click(screen.getByRole("button", { name: "Connect Bing Webmaster Tools" }));
		fireEvent.click(screen.getByRole("radio", { name: "Service account" }));
		fireEvent.change(screen.getByLabelText("Service account JSON key"), { target: { value: '{"client_email":"a"}' } });
		fireEvent.click(screen.getByRole("button", { name: "Save service account" }));
		fireEvent.change(screen.getByLabelText("API key"), { target: { value: "fedcba9876543210" } });
		fireEvent.click(screen.getByRole("button", { name: "Save Bing key" }));
		await waitFor(() => expect(routeCalls("search/connect")).toHaveLength(2));
		expect(routeCalls("search/connect")).toEqual([{ gscAuth: "service_account", gscServiceAccount: '{"client_email":"a"}' }, { bingEnabled: true, bingAuth: "apikey", bingApiKey: "fedcba9876543210" }]);
	});

	it("only Google: one muted sync line, no switch, all 8 tabs asking for Google, Connections closed with one quiet Bing row", async () => {
		sources = [src("google"), src("bing", OFF)];
		render(<Search />);
		const kpis = await screen.findByRole("region", { name: "Key figures" });
		await waitFor(() => expect(kpis.textContent).toContain("4.25"));
		expect(document.querySelector(".ca-search-sync")?.textContent).toMatch(/^Synced 2026-03-12 07:00\. Provisional from 2026-03-10\.\s*i?$/);
		expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
		expect(tabNames()).toEqual(ALL_TABS);
		expect(queries()[0]).toMatchObject({ report: "search_overview", params: { source: "google" }, withAnnotations: true });
		fireEvent.click(screen.getByRole("tab", { name: "Countries" }));
		await screen.findByRole("button", { name: "search_countries one" });
		expect(window.location.search).toContain("tab=countries");
		// Google only: the Bing sentence of the Countries tab does not apply.
		expect(screen.queryByText(/Bing has no country or device data/)).toBeNull();
		expect(connections().getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(connections());
		expect(card(/Google Search Console/).getAttribute("data-state")).toBe("connected");
		expect(screen.getByText(/: not connected\./).closest(".ca-conn-row")?.textContent).toBe("Bing Webmaster Tools: not connected.Connect");
		checkCopy(document.body.textContent ?? "");
	});

	it("only Bing: no switch, Countries and Devices hidden, reports ask for Bing; the Google row and the Bing import in Connections", async () => {
		sources = [src("google", OFF), src("bing")];
		render(<Search />);
		await screen.findByRole("region", { name: "Key figures" });
		expect(tabNames()).toEqual(["Overview", "Queries", "Pages", "Positions", "Cannibalization", "Changes"]);
		expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
		expect(queries()[0]).toMatchObject({ report: "search_overview", params: { source: "bing" } });
		fireEvent.click(connections());
		const bing = card(/Bing Webmaster Tools/);
		expect(within(bing).queryByLabelText("API key")).toBeNull();
		expect(within(bing).getByRole("button", { name: "Import Bing data from a file" }).getAttribute("aria-expanded")).toBe("false");
		expect(screen.getByRole("button", { name: "Connect Google Search Console" })).toBeTruthy();
	});

	it("both: the switch offers All, Google and Bing, writes ?src=, and Countries says its rows are Google data", async () => {
		sources = [src("google"), src("bing")];
		render(<Search />);
		const sw = await screen.findByRole("group", { name: "Source" });
		expect(within(sw).getAllByRole("button").map((b) => b.textContent)).toEqual(["All sources", "Google", "Bing"]);
		expect(tabNames()).toEqual(ALL_TABS);
		await waitFor(() => expect(queries()[0]).toMatchObject({ report: "search_overview", params: { source: "all" } }));
		fireEvent.click(within(sw).getByRole("button", { name: "Bing" }));
		await waitFor(() => expect(queries().some((b) => b.report === "search_overview" && b.params.source === "bing")).toBe(true));
		expect(window.location.search).toContain("src=bing");
		for (const [tab, report] of [["Queries", "search_queries"], ["Pages", "search_pages"], ["Countries", "search_countries"], ["Devices", "search_devices"]] as const) {
			fireEvent.click(screen.getByRole("tab", { name: tab }));
			await screen.findByRole("button", { name: `${report} one` });
			expect(queries().at(-1)).toMatchObject({ report, params: { source: "bing" } });
		}
		expect(screen.getByText("Bing has no country or device data; these rows are Google data.")).toBeTruthy();
		fireEvent.click(connections());
		expect(card(/Google Search Console/)).toBeTruthy();
		expect(card(/Bing Webmaster Tools/)).toBeTruthy();
	});

	it("drops ?src= naming a source that is not on offer", async () => {
		sources = [src("google"), src("bing", OFF)];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?from=2026-03-01&to=2026-03-07&src=bing");
		render(<Search />);
		await screen.findByRole("region", { name: "Key figures" });
		await waitFor(() => expect(window.location.search).not.toContain("src="));
		expect(queries().every((b) => b.params.source === "google")).toBe(true);
	});

	it("configured, property not mapped: the picker on top, the mapped source's data below", async () => {
		sources = [src("google", { property: "", rows: 0, firstDay: null, lastDay: null }), src("bing")];
		render(<Search />);
		expect(await screen.findByLabelText("Google property")).toBeTruthy();
		await screen.findByRole("region", { name: "Key figures" });
		expect(queries()[0]).toMatchObject({ params: { source: "bing" } });
		expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
	});

	it("connected, no data yet: one explanation with Sync now replaces the switch, tabs, cards and chart", async () => {
		sources = [src("google", { rows: 0, firstDay: null, lastDay: null, lastRun: null }), src("bing", OFF)];
		render(<Search />);
		const first = await screen.findByRole("region", { name: "Search data" });
		expect(within(first).getByRole("heading").textContent).toBe("Connected. Not synced yet.");
		expect(first.textContent).toContain("Last 90 days: 90 days, about");
		expect(screen.queryByRole("tablist")).toBeNull();
		expect(screen.queryByRole("region", { name: "Key figures" })).toBeNull();
		fireEvent.click(within(first).getByRole("button", { name: "Sync now" }));
		await waitFor(() => expect(routeCalls("search/sync")).toEqual([{}]));
		fireEvent.click(within(first).getByRole("button", { name: "Load older days" }));
		expect(screen.getByRole("dialog", { name: "Load older days" })).toBeTruthy();
		await settle();
		expect(queries()).toHaveLength(0);
		checkCopy(document.body.textContent ?? "");
	});

	it("connected, first sync running: says so", async () => {
		sources = [src("google", { rows: 0, firstDay: null, lastDay: null, lastRun: null, syncing: true })];
		render(<Search />);
		expect((await screen.findByRole("heading", { name: "Connected. The first sync is running." })).tagName).toBe("H3");
	});

	it("data exists, none in the chosen range: the stored days and a button to the last stored 28 days", async () => {
		expect(storedDays([{ firstDay: "2026-01-05", lastDay: "2026-02-20" }, { firstDay: "2026-01-01", lastDay: "2026-02-10" }, { firstDay: null, lastDay: null }])).toEqual({ from: "2026-01-01", to: "2026-02-20" });
		expect(storedDays([{ firstDay: null, lastDay: null }])).toBeNull();
		sources = [src("google", { firstDay: "2026-01-01", lastDay: "2026-02-20" }), src("bing", OFF)];
		render(<Search />);
		await screen.findByText("No Search data from 2026-03-01 to 2026-03-07.");
		expect(screen.getByText("Stored days: 2026-01-01 to 2026-02-20.")).toBeTruthy();
		expect(screen.queryByRole("region", { name: "Key figures" })).toBeNull();
		// The other tabs stay.
		expect(tabNames()).toEqual(ALL_TABS);
		fireEvent.click(screen.getByRole("button", { name: "Show the last stored 28 days" }));
		await waitFor(() => expect(window.location.search).toContain("from=2026-01-24&to=2026-02-20"));
		await screen.findByRole("region", { name: "Key figures" });
	});

	it("error on a source: one notice on top with Open connections, the data stays, Connections opens with the failing card's form", async () => {
		sources = [src("google", { status: "error", lastError: "Google answered 400 (invalid_grant).", lastErrorAt: "2026-03-12T07:00:00.000Z" }), src("bing")];
		render(<Search />);
		await screen.findByRole("region", { name: "Key figures" });
		const alerts = screen.getAllByRole("alert");
		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.textContent).toContain("Connect Google again");
		expect(alerts[0]?.textContent).toContain("invalid_grant");
		expect(within(alerts[0] as HTMLElement).getByRole("button", { name: "Open connections" })).toBeTruthy();
		expect(document.querySelector(".ca-search-sync")?.textContent).toContain("Google: last synced 2026-03-12 07:00. Bing: last synced 2026-03-12 07:00.");
		expect(connections().getAttribute("aria-expanded")).toBe("true");
		const google = card(/Google Search Console/);
		expect(google.getAttribute("data-state")).toBe("error");
		expect(within(google).getByText("invalid_grant").tagName).toBe("CODE");
		expect(within(google).getByLabelText("Client ID")).toBeTruthy();
		// The healthy Bing card keeps its form closed.
		expect(within(card(/Bing Webmaster Tools/)).queryByLabelText("API key")).toBeNull();
		checkCopy(document.body.textContent ?? "");
	});

	it("throttled Bing: a warning on top, Connections stays closed, Import a file instead opens it at the Bing import", async () => {
		sources = [src("google"), src("bing", { status: "throttled", message: "Bing limits shared server addresses. The sync retries on the next scheduled run.", throttleCode: "ThrottleIP", nextAttempt: "2026-03-13T00:05:00.000Z" })];
		render(<Search />);
		await screen.findByRole("region", { name: "Key figures" });
		expect(screen.queryByRole("alert")).toBeNull();
		const warn = screen.getAllByRole("status").find((n) => n.textContent?.includes("ThrottleIP")) as HTMLElement;
		expect(warn.textContent).toContain("Next attempt: 2026-03-13 00:05 UTC.");
		expect(connections().getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(within(warn).getByRole("button", { name: "Import a file instead" }));
		expect(connections().getAttribute("aria-expanded")).toBe("true");
		const bing = card(/Bing Webmaster Tools/);
		expect(within(bing).getByRole("button", { name: "Import Bing data from a file" }).getAttribute("aria-expanded")).toBe("true");
		expect(within(bing).getByLabelText("CSV file")).toBeTruthy();
	});

	it("a connected card shows facts and actions; the form only after Change sign-in", async () => {
		sources = [src("google"), src("bing")];
		render(<Search />);
		await openConnections();
		const google = card(/Google Search Console/);
		const bing = card(/Bing Webmaster Tools/);
		expect(within(google).queryByLabelText("Client ID")).toBeNull();
		expect(within(bing).queryByLabelText("API key")).toBeNull();
		expect(google.textContent).toContain("sc-domain:example.com");
		fireEvent.click(within(bing).getByRole("button", { name: "Change sign-in" }));
		expect(within(bing).getByLabelText("API key")).toBeTruthy();
		expect(within(bing).getByRole("button", { name: "Turn Bing off" })).toBeTruthy();
		fireEvent.click(within(bing).getByRole("button", { name: "Hide sign-in" }));
		expect(within(bing).queryByLabelText("API key")).toBeNull();
	});

	it("draws the annotation markers the server matched, behind the Annotations toggle", async () => {
		sources = [src("google")];
		annotations = [{ id: "a1", ts: Date.UTC(2026, 2, 2, 12) / 1000, day: "2026-03-02", kind: "manual", text: "Blue widgets launch", scope: { v: 1, query: [{ op: "is", value: "blue widgets" }] }, summary: "Query blue widgets" }];
		const { container } = render(<Search />);
		// Clicks and impressions together by default.
		await screen.findByRole("img", { name: /^Clicks and Impressions per day, .+, 1 annotation$/ });
		fireEvent.click(container.querySelector('[data-marker="2026-03-02"]') as Element);
		expect(screen.getByRole("dialog").textContent).toContain("Blue widgets launch");
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
		fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
		await screen.findByRole("img", { name: /^Clicks and Impressions per day, [^,]+$/ });
		expect(container.querySelector("[data-marker]")).toBeNull();
		expect(window.location.search).toContain("ann=0");
	});

	it("load older days: progress in the sync line, a range selector with estimates (90 days by default), the small warning, custom start and stop", async () => {
		expect(backfillError("", "2026-03-12")).toBe("Pick a start date.");
		expect(backfillError("2026-03-13", "2026-03-12")).toBe("Older days end yesterday, so the start is yesterday at the latest.");
		expect(backfillError("2026-03-12", "2026-03-12")).toBeNull();
		budget = { profile: "small", daily: 21_250, usedToday: 4_000, defaultDays: 90, retentionDays: 800 };
		const nextAt = Date.parse("2026-03-13T00:00:00Z");
		sources = [src("google", { perDay: 100, backfill: { from: "2026-01-01", to: "2026-01-10", cursor: "2026-01-04", done: false, error: null, days: 10, completed: 3, nextAt } }), src("bing", { perDay: 100 })];
		render(<Search />);
		await screen.findByRole("region", { name: "Key figures" });
		expect(document.querySelector(".ca-search-sync")?.textContent).toContain("Loading older days: 3 of 10 done. Continues at 2026-03-13 00:00 UTC.");
		fireEvent.click(connections());
		const google = card(/Google Search Console/);
		expect(google.textContent).toContain("Loading older days: 3 of 10 done. Continues at 2026-03-13 00:00 UTC. Rows written today: 4,000 of 21,250.");
		fireEvent.click(screen.getByRole("button", { name: "Load older days" }));
		const dialog = screen.getByRole("dialog", { name: "Load older days" });
		const radio = (name: RegExp) => within(dialog).getByRole("radio", { name }) as HTMLInputElement;
		expect(radio(/^Last 90 days/).checked).toBe(true);
		// Stored from 2026-03-01: a range ends 2026-02-28. 100 rows a day, 2 rows written per row, 21,250 a day on small.
		expect(radio(/^Last 30 days/).closest("label")?.textContent).toContain("18 days, about 3,600 rows, 1 daily budget: about 1 day on the small profile.");
		expect(radio(/^Last 90 days/).closest("label")?.textContent).toContain("78 days, about 15,600 rows, 1 daily budget");
		expect(radio(/^Last 12 months/).closest("label")?.textContent).toContain("353 days, about 70,600 rows, 4 daily budgets: about 4 days on the small profile.");
		expect(radio(/^Everything the source offers/).closest("label")?.textContent).toContain("Everything the source offers (Google keeps about 16 months)478 days, about 95,600 rows, 5 daily budgets");
		expect(within(dialog).getByText(/Loading these days writes about 15,600 rows\. On the small profile Search may write 21,250 rows a day, so it takes about 1 day\./)).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "Start loading" }));
		await waitFor(() => expect(routeCalls("search/backfill")).toEqual([{ action: "start", source: "google", days: 90 }]));
		fireEvent.click(screen.getByRole("button", { name: "Load older days" }));
		const again = screen.getByRole("dialog", { name: "Load older days" });
		fireEvent.click(within(again).getByRole("radio", { name: /^From a date/ }));
		fireEvent.change(within(again).getByLabelText("From"), { target: { value: "2026-03-13" } });
		expect(within(again).getByRole("alert").textContent).toBe("Older days end yesterday, so the start is yesterday at the latest.");
		expect((within(again).getByRole("button", { name: "Start loading" }) as HTMLButtonElement).disabled).toBe(true);
		// A custom start runs as asked on the server: Start stays open, and a "stored" answer keeps the dialog with the note.
		fireEvent.change(within(again).getByLabelText("From"), { target: { value: "2026-03-05" } });
		expect(within(again).getByText("Already stored, nothing to write.")).toBeTruthy();
		fireEvent.click(within(again).getByRole("button", { name: "Start loading" }));
		await waitFor(() => expect(within(again).getAllByText("Already stored, nothing to write.")).toHaveLength(2));
		expect(routeCalls("search/backfill")[1]).toEqual({ action: "start", source: "google", from: "2026-03-05" });
		fireEvent.change(within(again).getByLabelText("From"), { target: { value: "2026-02-01" } });
		expect(within(again).queryByText("Already stored, nothing to write.")).toBeNull();
		fireEvent.change(within(again).getByLabelText("Source"), { target: { value: "bing" } });
		expect(within(again).getByRole("radio", { name: /^Everything the source offers \(Bing keeps about 6 months\)/ })).toBeTruthy();
		fireEvent.click(within(again).getByRole("button", { name: "Start loading" }));
		await waitFor(() => expect(routeCalls("search/backfill")[2]).toEqual({ action: "start", source: "bing", from: "2026-02-01" }));
		fireEvent.click(within(card(/Google Search Console/)).getByRole("button", { name: "Stop loading older days" }));
		await waitFor(() => expect(routeCalls("search/backfill")[3]).toEqual({ action: "cancel", source: "google" }));
	});

	it("load older days counts the holes search/status reports, so a hole can be refilled from a preset", async () => {
		sources = [src("google", { firstDay: "2026-01-01", holes: [["2026-02-10", "2026-02-14"]] })];
		render(<Search />);
		await screen.findByRole("region", { name: "Key figures" });
		fireEvent.click(connections());
		fireEvent.click(screen.getByRole("button", { name: "Load older days" }));
		const dialog = screen.getByRole("dialog", { name: "Load older days" });
		const radio = (name: RegExp) => within(dialog).getByRole("radio", { name }) as HTMLInputElement;
		// From 2026-02-11: four days of the hole. From 2025-12-13: 19 days before the oldest stored day and the five of the hole.
		expect(radio(/^Last 30 days/).closest("label")?.textContent).toContain("4 days, about");
		expect(radio(/^Last 90 days/).closest("label")?.textContent).toContain("24 days, about");
		fireEvent.click(radio(/^Last 30 days/));
		fireEvent.click(within(dialog).getByRole("button", { name: "Start loading" }));
		await waitFor(() => expect(routeCalls("search/backfill")).toEqual([{ action: "start", source: "google", days: 30 }]));
	});

	it("load older days copy: plain words, no dash, no forbidden word, no Backfill in the UI", () => {
		const texts = [
			...BACKFILL_OPTIONS.map((o) => o.label),
			...Object.values(PROVIDER_LIMIT_TEXT),
			estimateText(backfillEstimate(90, 186, "small"), true),
			estimateText(backfillEstimate(1, 10, "standard"), false),
			estimateText(backfillEstimate(0, 10, "small"), true),
			pacedText({ completed: 3, days: 10, nextAt: Date.parse("2026-03-13T00:00:00Z") }, { profile: "small", daily: 21_250, usedToday: 4_000, defaultDays: 90, retentionDays: 800 }),
			pacedText({ completed: 0, days: 1, nextAt: null }, undefined),
			backfillError("", "2026-03-12") ?? "",
			backfillError("2026-03-13", "2026-03-12") ?? "",
			...["Throttle", "invalid_grant", "answered 401", "answered 403", "answered 503", "other"].flatMap((m) => [explainError("google", m), explainError("bing", m)]),
			settingsSchema.backfillDays.description,
		];
		expect(texts).toContain("90 days, about 33,480 rows, 2 daily budgets: about 2 days on the small profile.");
		expect(texts).toContain("1 day, about 20 rows, 1 daily budget.");
		expect(texts).toContain("Loading older days: 0 of 1 done. Continues with the next sync.");
		for (const t of texts) {
			expect(t.trim(), t).not.toBe("");
			checkCopy(t);
		}
		for (const t of texts.slice(0, -1)) expect(/backfill/i.test(t), t).toBe(false);
	});

	it("handles the OAuth return: posts code and state once and strips them from the URL", async () => {
		expect(readOAuthReturn("?code=c&state=s&scope=x")).toEqual({ code: "c", state: "s" });
		expect(readOAuthReturn("?error=access_denied&state=s")).toEqual({ error: "access_denied" });
		expect(readOAuthReturn("?from=2026-03-01")).toBeNull();
		sources = [src("google", { property: "" })];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?code=4%2Fabc&state=st8&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fwebmasters.readonly");
		const first = render(<Search />);
		expect(window.location.search).not.toMatch(/code=|state=|scope=/);
		await screen.findByText("Google is connected. Pick the property below.");
		expect(routeCalls("search/oauth/exchange")).toEqual([{ code: "4/abc", state: "st8" }]);
		// The status is read again after the exchange, then the picker opens for the unmapped property.
		await waitFor(() => expect(calls.map((c) => c.route).lastIndexOf("search/status")).toBeGreaterThan(calls.findIndex((c) => c.route === "search/oauth/exchange")));
		await screen.findByLabelText("Google property");
		first.unmount();
		render(<Search />);
		await settle();
		expect(routeCalls("search/oauth/exchange")).toHaveLength(1);
	});

	it("a Bing return is reported as Bing", async () => {
		exchangeSource = "bing";
		try {
			sources = [src("google", { property: "" })];
			window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?code=bcode&state=bst");
			render(<Search />);
			await screen.findByText("Bing is connected. Pick the property below.");
		} finally {
			exchangeSource = undefined;
		}
	});

	it("shows the provider's refusal from the OAuth return without posting", async () => {
		sources = [src("google", { configured: false, property: "" })];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?error=access_denied&state=x");
		render(<Search />);
		await screen.findByText("Access was not granted. Try Connect again.");
		expect(routeCalls("search/oauth/exchange")).toHaveLength(0);
		expect(window.location.search).not.toContain("error=");
	});
});

describe("Search page with a client site", () => {
	const CLIENT = { id: "shop", label: "Shop", local: false, kind: "client", timezone: "UTC", client: { id: "shop", label: "Shop", key: "shopkkkkkkkkkkkkkkkk", hosts: ["example.org"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 } };
	beforeEach(() => {
		sites = [LOCAL, CLIENT];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?from=2026-03-01&to=2026-03-07&site=shop");
	});

	it("hides the connection fields, shows the mapping picker with the suggestion and the unmapped state", async () => {
		sources = [src("google", { property: "" }), src("bing", { property: "" })];
		render(<Search />);
		await screen.findByText("No property mapped for this site.");
		expect(routeCalls("search/status")[0]).toEqual({ site: "shop" });
		expect(screen.queryByText("Connections")).toBeNull();
		expect(screen.queryByRole("group", { name: /Google Search Console/ })).toBeNull();
		const google = (await screen.findByLabelText("Google property")) as HTMLSelectElement;
		await waitFor(() => expect(google.value).toBe("sc-domain:example.org"));
		expect(google.textContent).toContain("sc-domain:example.org (suggested)");
		expect(((await screen.findByLabelText("Bing property")) as HTMLSelectElement).value).toBe("https://example.org/");
		expect(routeCalls("search/properties")).toEqual([
			{ site: "shop", source: "google" },
			{ site: "shop", source: "bing" },
		]);
		fireEvent.click(screen.getByRole("button", { name: "Save Google property" }));
		await waitFor(() => expect(routeCalls("search/map")).toEqual([{ site: "shop", source: "google", property: "sc-domain:example.org" }]));
		await settle();
		expect(queries()).toHaveLength(0);
	});

	it("once mapped: its own reports, and Connections with facts, Sync now and Load older days but no sign-in form", async () => {
		sources = [src("google", { property: "sc-domain:example.org" }), src("bing", { configured: false, property: "" })];
		render(<Search />);
		await screen.findByRole("region", { name: "Key figures" });
		await openConnections();
		expect(card(/Google Search Console/).textContent).toContain("sc-domain:example.org");
		expect(screen.queryByRole("button", { name: "Change sign-in" })).toBeNull();
		expect(screen.queryByRole("button", { name: /Connect / })).toBeNull();
		expect(screen.queryByText(/EMDASH_ENCRYPTION_KEY/)).toBeNull();
		expect(screen.getByRole("button", { name: "Load older days" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
		await waitFor(() => expect(routeCalls("search/sync")).toEqual([{ site: "shop" }]));
		await waitFor(() => expect(queries().some((b) => b.report === "search_overview" && b.query.site === "shop")).toBe(true));
	});

	it("asks to connect on the main site when the master has no source", async () => {
		sources = [src("google", { configured: false, property: "" }), src("bing", { configured: false, property: "" })];
		render(<Search />);
		await screen.findByText("No Search source is connected. Connect Google or Bing on the Search page of the main site first.");
		expect(screen.queryByRole("heading", { name: "Connect a Search source" })).toBeNull();
	});
});

describe("Search page with a remote site", () => {
	it("reads no status and proxies the reports", async () => {
		sites = [LOCAL, { id: "far", label: "Far", local: false, kind: "remote", timezone: "UTC", origin: "https://far.example.net" }];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?from=2026-03-01&to=2026-03-07&site=far");
		render(<Search />);
		await waitFor(() => expect(queries().some((b) => b.report === "search_overview" && b.query.site === "far")).toBe(true));
		expect(routeCalls("search/status")).toHaveLength(0);
		// The remote's sources are not known here: no switch, every tab, the reports ask for all sources.
		expect(screen.queryByRole("group", { name: "Source" })).toBeNull();
		expect(tabNames()).toEqual(ALL_TABS);
		expect(queries()[0]).toMatchObject({ params: { source: "all" } });
		expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
	});
});
