// @vitest-environment jsdom
/** Dashboards page over mocked routes: list, gallery, editor, dashboard view, copy to sites. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pages } from "../src/admin/index.js";
import { ADMIN_CSS } from "../src/admin/styles.js";
import Dashboards from "../src/admin/pages/Dashboards.js";
import { readStoredView } from "../src/admin/state.js";
import { ADMIN_PAGES } from "../src/index.js";

type Body = Record<string, unknown> & { report?: string; query?: Record<string, unknown> };
let calls: Array<{ route: string; body: Body }> = [];
let links: Array<Record<string, unknown>> = [];
const SHARE = { id: "s1", site: "main", dashboard: "abcdefabcdef", prefix: "abcd1234", password: true, expired: false, created: 1773360000, views: 3, lastViewed: 1773370000 };
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

const DASH = {
	id: "abcdefabcdef",
	site: "main",
	v: 1,
	name: "Weekly",
	tiles: [
		{ id: "kpi001", report: "overview", kind: "kpi", metric: "visitors", w: 1 },
		{ id: "kpi002", report: "overview", kind: "kpi", metric: "bounce_rate", w: 1 },
		{ id: "tab001", report: "channels", kind: "table", w: 3, limit: 5 },
	],
	defaults: { range: "7d", compare: "previous", filters: [{ dim: "country", op: "is", values: ["DE"] }] },
	viewer: { ranges: ["7d", "30d"], compare: true },
	created: 1,
	updated: 1773360000,
};

let dash: typeof DASH = DASH;
/** The dashboards of the list route; the one above by default. */
let listed: Array<typeof DASH> = [DASH];
let provider = true;
let deleteFails = false;

function answer(body: Body) {
	const base = { report: body.report, range: {}, compare: "none", compareRange: null, notices: [] };
	if (body.report === "timeseries")
		return {
			...base,
			data: {
				granularity: "day",
				series: [
					{ t: "2026-03-01", sessions: 3, visitors: 2 },
					{ t: "2026-03-07", sessions: 5, visitors: 4 },
				],
				annotations: [{ id: "n1", ts: Date.UTC(2026, 2, 7, 9) / 1000, day: "2026-03-07", kind: "release", text: "Deploy", scope: null, summary: "Site-wide" }],
			},
		};
	if (body.report === "overview") return { ...base, data: { totals: { visitors: 120, bounce_rate: 0.25 }, delta: { visitors: 0.5 } } };
	return { ...base, data: { rows: [{ key: "Direct", visitors: 9, sessions: 10 }] } };
}

beforeEach(() => {
	dash = DASH;
	listed = [DASH];
	provider = true;
	deleteFails = false;
	calls = [];
	links = [];
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-03-01&to=2026-03-07");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/cookieless-analytics/")[1] ?? url;
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			switch (route) {
				case "sites/list":
					return ok({
						sites: [
							{ id: "main", label: "This site", local: true, kind: "local", timezone: "UTC" },
							{ id: "blog", label: "Blog", local: false, kind: "client", timezone: "UTC" },
						],
					});
				case "dashboards/list":
					return ok({ site: "main", items: listed, shares: links.length ? { [DASH.id]: { count: links.length, state: links.some((l) => !l.password) ? "open" : "password", views: 3, expires: null } } : {} });
				case "shares/list":
					return ok({ items: links });
				case "shares/create": {
					const share = { ...SHARE, id: `s${links.length + 1}`, password: !!body.password, expires: body.expires ?? null, views: 0, lastViewed: null, ...(body.label ? { label: body.label } : {}) };
					links = [...links, share];
					return ok({ link: "https://example.org/_/s/abcd1234.SECRETSECRETSECRETSECRETSECRETSECRETSECRE", share });
				}
				case "shares/delete":
					links = links.filter((l) => l.id !== body.id);
					return ok({ id: body.id, deleted: true });
				case "dashboards/get":
					return ok(dash);
				case "dashboards/delete":
					if (deleteFails) return new Response(JSON.stringify({ success: false, error: { message: "Storage unavailable" } }), { status: 500, headers: { "content-type": "application/json" } });
					return ok({ id: body.id, deleted: true });
				case "dashboards/import":
				case "dashboards/copy":
					return ok({ created: [{ site: "blog", id: "copy00000000" }], dependencies: [], unresolved: [], failed: [] });
				case "dashboards/save":
					return ok({ ...(body.dashboard as object), id: "newdash00000", site: "main", v: 1, created: 2, updated: 2 });
				case "data/query":
					return ok(answer(body));
				case "dashboards/email/status":
					return ok(provider ? { provider: true, scheduled: 0 } : { provider: false, scheduled: 0, message: "No email provider is configured. Install and activate an email provider plugin, then select it in Settings > Email." });
				case "dashboards/email/save":
					return ok({ ...dash, email: body.email, emailNext: 1773648000 });
				case "dashboards/email/send-test":
					return ok({ sent: true, to: "owner@example.com" });
				default:
					return ok({ items: [] });
			}
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const routeCalls = (r: string) => calls.filter((c) => c.route === r).map((c) => c.body);
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
/** Opens the More menu of the dashboard view and returns its items in order. */
const openMore = async () => {
	const button = screen.getByRole("button", { name: "More" });
	act(() => button.focus());
	fireEvent.click(button);
	await waitFor(() => expect(button.getAttribute("aria-expanded")).toBe("true"));
	return [...document.querySelectorAll('[role="menu"] [role^="menuitem"], [role="menu"] [role="separator"]')] as HTMLElement[];
};
const more = async (name: string) => {
	const item = (await openMore()).find((e) => e.textContent === name);
	if (!item) throw new Error(`no menu item ${name}`);
	fireEvent.click(item);
};

describe("Dashboards page", () => {
	it("is the second of fourteen descriptor pages and registered in the admin entry", () => {
		expect(ADMIN_PAGES[1]).toEqual({ path: "/dashboards", label: "Dashboards", icon: "dashboard", group: "Analytics" });
		expect(ADMIN_PAGES).toHaveLength(14);
		expect(pages["/dashboards"]).toBe(Dashboards);
	});

	it("the dashboards list sits on the card surface; a click on the row or Enter on it opens the dashboard", async () => {
		render(<Dashboards />);
		const name = await screen.findByRole("button", { name: "Weekly" });
		const list = screen.getByRole("region", { name: "Your dashboards" });
		expect(list.classList.contains("ca-panel")).toBe(true);
		expect(ADMIN_CSS).toMatch(/\.ca-panel \{ background: var\(--ca-surface\)/);
		const tr = name.closest("tr") as HTMLElement;
		expect([tr.tabIndex, name.tabIndex]).toEqual([0, -1]);
		// Tiles is a number column (right); "Not shared" keeps the cell size, only its colour is muted.
		expect([...tr.querySelectorAll("td")].map((td) => td.className)).toEqual(["", "ca-num", "", ""]);
		expect(within(tr).getByText("Not shared").className).toBe("ca-muted");
		expect(ADMIN_CSS).toContain(".ca-muted { color: var(--ca-muted-text); }");
		tr.focus();
		fireEvent.keyDown(tr, { key: "Enter" });
		await waitFor(() => expect(new URLSearchParams(window.location.search).get("d")).toBe("abcdefabcdef"));
	});

	it("a search box over 10 dashboards matches the name", async () => {
		const named = (i: number) => ({ ...DASH, id: `dash${String(i).padStart(8, "0")}`, name: i === 4 ? "Launch week" : `Board ${i}` });
		listed = Array.from({ length: 10 }, (_, i) => named(i + 1));
		render(<Dashboards />);
		await screen.findByRole("button", { name: "Board 10" });
		expect(screen.queryByRole("search")).toBeNull();
		cleanup();
		listed = [...listed, named(11)];
		render(<Dashboards />);
		await screen.findByRole("button", { name: "Board 11" });
		const list = screen.getByRole("region", { name: "Your dashboards" });
		fireEvent.change(within(within(list).getByRole("search", { name: "Search dashboards" })).getByRole("searchbox"), { target: { value: "LAUNCH" } });
		await waitFor(() => expect(within(list).getAllByRole("row")).toHaveLength(2));
		within(list).getByRole("button", { name: "Launch week" });
		fireEvent.change(within(list).getByRole("searchbox"), { target: { value: "zzz" } });
		await within(list).findByText('Nothing matches "zzz".');
	});

	it("lists the site's dashboards and applies a gallery template", async () => {
		render(<Dashboards />);
		await screen.findByRole("button", { name: "Weekly" });
		// The templates sit behind New dashboard; nothing is shared, so there is no Shared links section.
		expect(screen.queryByRole("region", { name: "New dashboard" })).toBeNull();
		expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Your dashboards"]);
		expect(screen.queryByLabelText("Import a template file")).toBeNull();
		click("New dashboard");
		const gallery = screen.getByRole("region", { name: "New dashboard" });
		// Blank and a file first, then the groups Analytics (ten, with Links) and SEO (four).
		expect(within(gallery).getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent).slice(0, 3)).toEqual(["Blank", "From a file", "Overview"]);
		expect(within(gallery).getAllByRole("listitem")).toHaveLength(16);
		expect((within(gallery).getByLabelText("Import a template file") as HTMLInputElement).hidden).toBe(true);
		expect(within(screen.getByRole("group", { name: "Analytics templates" })).getAllByRole("listitem")).toHaveLength(10);
		expect(within(screen.getByRole("group", { name: "SEO templates" })).getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent)).toEqual(["SEO overview", "Cannibalization", "Position bands", "Winners and losers"]);
		expect(screen.queryByRole("searchbox")).toBeNull();
		fireEvent.click(within(gallery).getByRole("button", { name: "Use the Overview template" }));
		await screen.findByText("Added.");
		expect(routeCalls("dashboards/import")).toEqual([{ sites: ["main"], createDependencies: true, builtin: "overview" }]);
		expect(routeCalls("dashboards/list").length).toBeGreaterThanOrEqual(2);
	});

	it("creates a dashboard: add three tiles, move, resize, remove, save", async () => {
		render(<Dashboards />);
		fireEvent.click(await screen.findByRole("button", { name: "New dashboard" }));
		click("Start blank");
		const addTile = async (report: string, kind?: string) => {
			click("Add tile");
			const form = screen.getByRole("form", { name: "Tile" });
			fireEvent.change(within(form).getByLabelText("Report"), { target: { value: report } });
			if (kind) fireEvent.change(within(form).getByLabelText("Chart"), { target: { value: kind } });
			fireEvent.click(within(form).getByRole("button", { name: "Save tile" }));
		};
		await addTile("overview");
		await addTile("channels", "donut");
		await addTile("timeseries", "area");
		// The metrics checklist of a line or area tile: the last one stays on, a third scale is refused.
		fireEvent.click(screen.getAllByRole("button", { name: /^Edit / })[2] as HTMLElement);
		const tileForm = screen.getByRole("form", { name: "Tile" });
		const metrics = within(tileForm).getByRole("group", { name: "Metrics" });
		fireEvent.click(within(metrics).getByLabelText("Visitors"));
		expect(within(metrics).getByRole("status").textContent).toBe("One metric stays on.");
		fireEvent.click(within(metrics).getByLabelText("Sessions"));
		fireEvent.click(within(metrics).getByLabelText("Bounce rate"));
		fireEvent.click(within(metrics).getByLabelText("Avg. session duration"));
		expect(within(metrics).getByRole("status").textContent).toBe("These metrics need more than two scales. Turn one off first.");
		expect((within(metrics).getByLabelText("Avg. session duration") as HTMLInputElement).checked).toBe(false);
		fireEvent.click(within(tileForm).getByRole("button", { name: "Save tile" }));
		const list = screen.getByRole("list", { name: "Tiles" });
		expect(within(list).getAllByRole("listitem")).toHaveLength(3);
		expect(screen.getByTestId("distinct").textContent).toBe("3");
		const ids = within(list).getAllByRole("listitem").map((li) => li.getAttribute("data-tile") as string);
		fireEvent.click(screen.getByRole("button", { name: `Move ${ids[2]} up` }));
		fireEvent.change(screen.getByLabelText(`Width of ${ids[0]}`), { target: { value: "3" } });
		fireEvent.click(screen.getByRole("button", { name: `Remove ${ids[1]}` }));
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Mine" } });
		fireEvent.click(screen.getByLabelText("Show annotations to viewers"));
		click("Save dashboard");
		await waitFor(() => expect(routeCalls("dashboards/save")).toHaveLength(1));
		const saved = routeCalls("dashboards/save")[0]?.dashboard as { name: string; viewer: { annotations?: boolean }; tiles: Array<{ id: string; report: string; kind: string; w: number; metrics?: string[] }> };
		expect(saved.name).toBe("Mine");
		expect(saved.viewer.annotations).toBe(true);
		expect(saved.tiles.map((t) => [t.id, t.report, t.kind, t.w])).toEqual([
			[ids[0], "overview", "kpi", 3],
			[ids[2], "timeseries", "area", 1],
		]);
		expect(saved.tiles[1]?.metrics).toEqual(["visitors", "sessions", "bounce_rate"]);
		// Saving opens the new dashboard.
		await waitFor(() => expect(routeCalls("dashboards/get")).toEqual([{ id: "newdash00000" }]));
	});

	it("renders a dashboard: header starts from its defaults, one data/query per tile, copy to sites", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-03-01&to=2026-03-07&d=abcdefabcdef");
		render(<Dashboards />);
		await screen.findByRole("heading", { name: "Weekly" });
		// KPI tiles are figures, not toggles.
		await waitFor(() => expect(document.querySelector('[data-metric="visitors"] .ca-kpi-value')?.textContent).toBe("120"));
		expect(document.querySelector('[data-metric="bounce_rate"] .ca-kpi-value')?.textContent).toBe("25.0%");
		await screen.findByRole("cell", { name: "Direct" });
		expect((screen.getByLabelText("Compare") as HTMLSelectElement).value).toBe("previous");
		const q = routeCalls("data/query");
		expect(q.map((b) => b.report).sort()).toEqual(["channels", "overview", "overview"]);
		expect(q[0]?.query).toMatchObject({ compare: "previous", filters: [{ dim: "country", op: "is", values: ["DE"] }] });
		expect(q.find((b) => b.report === "channels")?.limit).toBe(5);

		await more("Copy to sites");
		const form = screen.getByRole("form", { name: "Copy to sites" });
		fireEvent.click(within(form).getByLabelText("Blog"));
		fireEvent.click(within(form).getByRole("button", { name: "Copy" }));
		await within(form).findByText(/Copied to 1 site\./);
		expect(routeCalls("dashboards/copy")).toEqual([{ id: "abcdefabcdef", sites: ["blog"], createDependencies: true }]);

		await more("Delete");
		const del = screen.getByRole("form", { name: "Delete dashboard" });
		expect(within(del).getByRole("button", { name: "Delete dashboard" })).toHaveProperty("disabled", true);
	});

	it("a dashboard's defaults stay with it: the session view and the header after closing keep the earlier view; a linked range wins", async () => {
		const m = new Map<string, string>();
		vi.stubGlobal("sessionStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
		const search = () => new URLSearchParams(window.location.search);
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-02-01&to=2026-02-07");
		render(<Dashboards />);
		fireEvent.click(await screen.findByRole("button", { name: "Weekly" }));
		await screen.findByRole("heading", { name: "Weekly" });
		await waitFor(() => expect(search().get("cmp")).toBe("previous"));
		expect(readStoredView()?.q).toContain("from=2026-02-01");
		expect(readStoredView()?.q).not.toContain("cmp=");
		fireEvent.click(screen.getByRole("button", { name: "All dashboards" }));
		await waitFor(() => expect(search().get("d")).toBeNull());
		expect([search().get("from"), search().get("to"), search().get("cmp"), search().get("f")]).toEqual(["2026-02-01", "2026-02-07", null, null]);
		cleanup();
		calls = [];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?d=abcdefabcdef&from=2026-01-05&to=2026-01-11");
		render(<Dashboards />);
		await waitFor(() => expect(routeCalls("data/query").at(-1)?.query).toMatchObject({ from: "2026-01-05", to: "2026-01-11", compare: "previous" }));
	});

	it("keeps Edit and Share in the head, Share primary with no link, the rest in More with Delete last", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-03-01&to=2026-03-07&d=abcdefabcdef");
		render(<Dashboards />);
		await screen.findByRole("heading", { name: "Weekly" });
		const head = screen.getByRole("heading", { name: "Weekly" }).parentElement as HTMLElement;
		expect(within(head).getAllByRole("button").map((b) => b.textContent)).toEqual(["All dashboards", "Edit", "Share", "More"]);
		await waitFor(() => expect(routeCalls("shares/list")).toHaveLength(1));
		const items = await openMore();
		expect(items.map((e) => e.getAttribute("role") === "separator" ? "|" : e.textContent)).toEqual(["Copy to sites", "Export", "Export with dependencies", "Schedule email", "|", "Delete"]);
	});

	it("names a number tile once and shows four columns in a table tile", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-03-01&to=2026-03-07&d=abcdefabcdef");
		const { container } = render(<Dashboards />);
		await screen.findByRole("cell", { name: "Direct" });
		await waitFor(() => expect(container.querySelector('[data-tile="kpi001"]')?.hasAttribute("data-plain")).toBe(true));
		expect(ADMIN_CSS).toContain(".ca-tile[data-plain] .ca-kpi-label { position: absolute;");
		expect([...(container.querySelector('[data-tile="tab001"] thead tr')?.children ?? [])].length).toBeLessThanOrEqual(4);
	});

	it("toggles the lines of a tile with two metrics from its legend, one stays on", async () => {
		dash = { ...DASH, tiles: [{ id: "line02", report: "timeseries", kind: "line", metrics: ["visitors", "sessions"], w: 3 }] } as unknown as typeof DASH;
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-03-01&to=2026-03-07&d=abcdefabcdef");
		const { container } = render(<Dashboards />);
		const legend = await screen.findByRole("group", { name: "Lines" });
		const tile = container.querySelector('[data-tile="line02"]') as HTMLElement;
		expect(tile.hasAttribute("data-lines")).toBe(true);
		expect([...tile.querySelectorAll("path[data-series]")].map((p) => p.getAttribute("data-series"))).toEqual(["visitors", "sessions"]);
		const sessions = within(legend).getByRole("button", { name: "Sessions" });
		fireEvent.click(sessions);
		expect(sessions.getAttribute("aria-pressed")).toBe("false");
		expect([...tile.querySelectorAll("path[data-series]")].map((p) => p.getAttribute("data-series"))).toEqual(["visitors"]);
		fireEvent.click(within(legend).getByRole("button", { name: "Visitors" }));
		expect(tile.querySelector(".ca-tile-hint")?.textContent).toBe("One metric stays on.");
		fireEvent.click(sessions);
		expect(tile.querySelectorAll("path[data-series]")).toHaveLength(2);
		// The view toggle never saves the tile.
		expect(routeCalls("dashboards/save")).toHaveLength(0);
	});

	it("deletes a dashboard after the typed name matches: error in the panel, then back to the list with a notice", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-03-01&to=2026-03-07&d=abcdefabcdef");
		deleteFails = true;
		render(<Dashboards />);
		await screen.findByRole("heading", { name: "Weekly" });
		await more("Delete");
		const del = screen.getByRole("form", { name: "Delete dashboard" });
		expect(del.textContent).toContain('Type the name "Weekly" to confirm');
		expect(within(del).getByText("Weekly").tagName).toBe("CODE");
		const input = within(del).getByLabelText(/Type the name/);
		const button = within(del).getByRole("button", { name: "Delete dashboard" });
		fireEvent.change(input, { target: { value: "Week" } });
		expect(button).toHaveProperty("disabled", true);
		fireEvent.change(input, { target: { value: "Weekly" } });
		expect(button).toHaveProperty("disabled", false);
		fireEvent.click(button);
		expect((await within(del).findByRole("alert")).textContent).toContain("Storage unavailable");
		expect(screen.getByRole("heading", { name: "Weekly" })).toBeTruthy();
		deleteFails = false;
		fireEvent.click(button);
		expect((await screen.findByRole("status")).textContent).toContain("Dashboard deleted.");
		expect(screen.getByRole("region", { name: "Your dashboards" })).toBeTruthy();
		expect(routeCalls("dashboards/delete")).toEqual([{ id: "abcdefabcdef" }, { id: "abcdefabcdef" }]);
	});

	it("shares a dashboard: several labelled links, the link shown once, state per link, revoke one", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-03-01&to=2026-03-07&d=abcdefabcdef");
		const writeText = vi.fn(async () => {});
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		render(<Dashboards />);
		await screen.findByRole("heading", { name: "Weekly" });
		click("Share");
		const dialog = screen.getByRole("region", { name: "Share" });
		const form = await within(dialog).findByRole("form", { name: "Create share link" });
		expect(within(dialog).getByText("To change the password, create a new link.")).toBeTruthy();
		const pw = within(form).getByLabelText(/Password/);
		fireEvent.change(pw, { target: { value: "short" } });
		expect(within(form).getByRole("button", { name: "Create link" })).toHaveProperty("disabled", true);
		fireEvent.change(pw, { target: { value: "long enough pw" } });
		fireEvent.change(within(form).getByLabelText("Expires"), { target: { value: "30" } });
		fireEvent.change(within(form).getByLabelText("Label (optional)"), { target: { value: "Board" } });
		fireEvent.click(within(form).getByRole("button", { name: "Create link" }));
		const link = (await within(dialog).findByLabelText("Share link")) as HTMLInputElement;
		expect(link.value).toMatch(/\/_\/s\/abcd1234\./);
		expect(within(dialog).getByText("This link is shown only once. Copy it now.")).toBeTruthy();
		const sent = routeCalls("shares/create")[0] as { password: string; expires: number; dashboard: string };
		expect(sent).toMatchObject({ dashboard: "abcdefabcdef", password: "long enough pw", label: "Board" });
		expect(sent.expires - Math.floor(Date.now() / 1000)).toBeGreaterThan(29 * 86400);
		fireEvent.click(within(dialog).getByRole("button", { name: "Copy link" }));
		await within(dialog).findByRole("button", { name: "Copied" });
		expect(writeText).toHaveBeenCalledWith(link.value);
		expect(within(dialog).getByTestId("share-state").textContent).toBe("Password");
		expect(within(dialog).getByText("Views (approximate)")).toBeTruthy();
		expect(within(dialog).getByText("Last viewed (approximate)")).toBeTruthy();

		// A second, open link next to the first.
		fireEvent.click(within(form).getByRole("button", { name: "Create link" }));
		await waitFor(() => expect(within(dialog).getAllByTestId("share-state").map((c) => c.textContent)).toEqual(["Password", "Open"]));

		// Reopened, the link is never shown again.
		click("Close");
		click("Share");
		const again = screen.getByRole("region", { name: "Share" });
		await waitFor(() => expect(within(again).getAllByTestId("share-state")).toHaveLength(2));
		expect(within(again).queryByLabelText("Share link")).toBeNull();
		fireEvent.click(within(again).getByRole("button", { name: "Revoke Board" }));
		await waitFor(() => expect(within(again).getAllByTestId("share-state").map((c) => c.textContent)).toEqual(["Open"]));
		expect(routeCalls("shares/delete")).toEqual([{ id: "s1" }]);
	});

	it("shows matching annotations on series tiles behind the view toggle, and the viewer switch saves", async () => {
		dash = { ...DASH, tiles: [...DASH.tiles, { id: "line01", report: "timeseries", kind: "line", metrics: ["sessions"], w: 3 }] } as typeof DASH;
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-03-01&to=2026-03-07&d=abcdefabcdef");
		const { container } = render(<Dashboards />);
		await screen.findByRole("img", { name: "Sessions over time, 1 annotation" });
		const q = routeCalls("data/query");
		expect(q.find((b) => b.report === "timeseries")?.withAnnotations).toBe(true);
		expect(q.find((b) => b.report === "channels")?.withAnnotations).toBeUndefined();
		const toggle = (await openMore()).find((e) => e.textContent === "Show annotations") as HTMLElement;
		expect(toggle.getAttribute("aria-checked")).toBe("true");
		fireEvent.click(toggle);
		expect(container.querySelector("[data-marker]")).toBeNull();
		expect(window.location.search).toContain("ann=0");

		click("Share");
		const dialog = screen.getByRole("region", { name: "Share" });
		expect(within(dialog).getByText("Annotation texts are visible to anyone with the link.")).toBeTruthy();
		const box = within(dialog).getByLabelText("Show annotations to viewers") as HTMLInputElement;
		expect(box.checked).toBe(false);
		fireEvent.click(box);
		await waitFor(() => expect(routeCalls("dashboards/save")).toHaveLength(1));
		const saved = routeCalls("dashboards/save")[0]?.dashboard as { id: string; viewer: unknown; site?: string };
		expect(saved).toMatchObject({ id: "abcdefabcdef", viewer: { ranges: ["7d", "30d"], compare: true, annotations: true } });
		expect(saved.site).toBeUndefined();
	});

	it("shows the most permissive state and the link count in the list", async () => {
		links = [{ ...SHARE, password: true }, { ...SHARE, id: "s2", password: false }];
		render(<Dashboards />);
		await screen.findByRole("button", { name: "Weekly" });
		// A badge with the state, then that link's expiry and the link count, and a Shared links section.
		const cell = screen.getAllByText("no expiry, 2 links")[0]?.closest("td") as HTMLElement;
		expect(within(cell).getByText("Open")).toBeTruthy();
		expect(within(screen.getByRole("region", { name: "Shared links" })).getByText("3 views")).toBeTruthy();
	});

	it("Set up weekly digest creates the dashboard and opens a weekly Monday 08:00 schedule for recipients", async () => {
		render(<Dashboards />);
		fireEvent.click(await screen.findByRole("button", { name: "New dashboard" }));
		click("Use the Weekly digest template and schedule its email");
		const dialog = await screen.findByRole("region", { name: "Schedule email" });
		expect(routeCalls("dashboards/import")).toEqual([{ sites: ["main"], createDependencies: true, builtin: "weekly-digest" }]);
		const form = within(dialog).getByRole("form", { name: "Email schedule" });
		expect((within(form).getByLabelText("Frequency") as HTMLSelectElement).value).toBe("weekly");
		expect((within(form).getByLabelText("Weekday") as HTMLSelectElement).value).toBe("1");
		expect((within(form).getByLabelText("Hour") as HTMLSelectElement).value).toBe("8");
		expect((within(form).getByLabelText("Compare with the previous period") as HTMLInputElement).checked).toBe(true);
		expect(within(form).getByRole("button", { name: "Save schedule" })).toHaveProperty("disabled", true);
		fireEvent.change(within(form).getByLabelText(/Recipients/), { target: { value: "reports@example.com\nboard@example.com" } });
		fireEvent.click(within(form).getByRole("button", { name: "Save schedule" }));
		await within(dialog).findByText("Schedule saved.");
		expect(routeCalls("dashboards/email/save")[0]).toMatchObject({
			id: "abcdefabcdef",
			email: { enabled: true, frequency: "weekly", weekday: 1, hour: 8, range: "7d", compare: true, recipients: ["reports@example.com", "board@example.com"] },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Send test" }));
		await within(dialog).findByText("A test email was sent to owner@example.com.");
		expect(routeCalls("dashboards/email/send-test")).toEqual([{ id: "abcdefabcdef" }]);
	});

	it("the schedule dialog says when no provider is configured and refuses a bad recipient", async () => {
		provider = false;
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/dashboards?from=2026-03-01&to=2026-03-07&d=abcdefabcdef");
		render(<Dashboards />);
		await screen.findByRole("heading", { name: "Weekly" });
		await more("Schedule email");
		const dialog = screen.getByRole("region", { name: "Schedule email" });
		await within(dialog).findByText(/No email provider is configured\. Install and activate an email provider plugin, then select it in Settings > Email\./);
		expect(within(dialog).getByRole("button", { name: "Send test" })).toHaveProperty("disabled", true);
		fireEvent.change(within(dialog).getByLabelText(/Recipients/), { target: { value: "Reports <reports@example.com>" } });
		expect(within(dialog).getByRole("alert").textContent).toContain("plain email address");
		expect(within(dialog).getByRole("button", { name: "Save schedule" })).toHaveProperty("disabled", true);
		fireEvent.change(within(dialog).getByLabelText("Frequency"), { target: { value: "monthly" } });
		expect(within(dialog).getAllByRole("option", { name: "28" })).toHaveLength(1);
		expect(within(dialog).queryByRole("option", { name: "29" })).toBeNull();
	});
});
