// @vitest-environment jsdom
/** Config, Sites tab and per-site admin behavior: the real site, key and tool routes run behind fetch. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setApiSite } from "../src/admin/api.js";
import Config from "../src/admin/pages/Config.js";
import Data from "../src/admin/pages/Data.js";
import Pages from "../src/admin/pages/Pages.js";
import { snippets } from "../src/admin/snippet.js";
import { ADMIN_PAGES } from "../src/index.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { isNeutral } from "../src/names.js";
import { keyRoutes } from "../src/routes/keys.js";
import { siteRoutes } from "../src/routes/sites.js";
import { memColl } from "./agent.helpers.js";
import { MemoryKv } from "./helpers.js";

type Body = Record<string, unknown>;
let calls: Array<{ route: string; body: Body }> = [];
let sites = memColl();
let keys = memColl();
let kv = new MemoryKv();
let purges = 0;
const MASTER = "https://master.example.org";
type AnyRoute = { input: { safeParse(b: unknown): { success: boolean; data?: unknown } }; handler(ctx: never): Promise<unknown> };
const routes: Record<string, AnyRoute> = {
	...siteRoutes({ settings: async () => ({ siteId: "main", siteTimezone: "UTC", siteOrigin: MASTER, scriptPath: "/_/e.js", namespace: "__ec", scriptDelivery: "external" }) }),
	...keyRoutes({ settings: async () => ({ siteId: "main" }) }),
};
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { code: "ERR", message } }), { status, headers: { "content-type": "application/json" } });

async function handle(route: string, body: Body): Promise<Response> {
	if (route === "tools/purge-site") return ok({ done: ++purges >= 2, site: body.site });
	if (route === "privacy/receipt") return ok(receipt(body.site as string | undefined));
	if (route.startsWith("config/")) return ok({ items: [], cursor: null });
	if (route === "data/query") return ok({ report: "x", range: { from: "2026-03-01", to: "2026-03-07" }, data: { rows: [] }, notices: [] });
	const r = routes[route];
	if (!r) return fail(404, "No route");
	const parsed = r.input.safeParse(body);
	if (!parsed.success) return fail(400, "Invalid request body");
	try {
		return ok(await (r.handler as (c: unknown) => Promise<unknown>)({ input: parsed.data, kv, storage: { sites, api_keys: keys }, request: new Request(`${MASTER}/_emdash/api/x`) }));
	} catch (e) {
		return fail(400, (e as Error).message);
	}
}

const receipt = (site?: string) => ({
	site: { id: site ?? "main", kind: site ? "client" : "local" },
	...(site ? { note: "Retention settings apply to every site measured by this install; they cannot differ per site." } : {}),
	statement: "No cookies.",
	satisfaction: "",
	tables: [{ name: "ca_sessions", kind: "table", description: "Visits of the site.", retention: "90 days", rows: site ? 7 : 70 }],
	retention: { rawDays: 90, rawCapped: false, storage: null, rollupWatermark: null },
	salt: { day: "2026-03-07", ageSeconds: 0, nextRotation: 0, stored: [] },
	drops: { days: 30, byReason: {}, note: "" },
	writes: null,
	markdown: "## x",
	db: { dialect: "sqlite" },
});

beforeEach(() => {
	invalidateRegistry();
	setApiSite("");
	calls = [];
	sites = memColl();
	keys = memColl();
	kv = new MemoryKv();
	purges = 0;
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/config?from=2026-03-01&to=2026-03-07");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			return handle(route, body);
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const click = (el: HTMLElement, name: string) => fireEvent.click(within(el).getByRole("button", { name }));
const set = (el: HTMLElement, label: string, value: string) => fireEvent.change(within(el).getByLabelText(label), { target: { value } });

async function openSites() {
	render(<Config />);
	fireEvent.click(await screen.findByRole("tab", { name: "Sites" }));
	return screen.getByRole("tabpanel", { name: "Sites" });
}

async function addBlog(panel: HTMLElement) {
	click(panel, "Add a client site");
	const form = within(panel).getByRole("form", { name: "New client site" });
	set(form, "Label", "Blog");
	set(form, "Id (lowercase letters, digits and dashes)", "blog");
	set(form, "Host names, one per line (up to 10, without https://)", "blog.example.net\nwww.blog.example.net");
	click(form, "Add site");
	await within(panel).findByRole("cell", { name: "Blog" });
	return sites.items.get("blog") as { key: string; paused: boolean };
}

describe("snippet", () => {
	it("holds the master origin and the key, no plugin id and no forbidden word", () => {
		const s = snippets({ src: `${MASTER}/_/e.js`, keyAttr: "data-ec-key", namespace: "__ec", external: true }, "k".repeat(20));
		expect(s.tag).toBe(`<script defer src="${MASTER}/_/e.js" data-ec-key="${"k".repeat(20)}"></script>`);
		expect(s.tagManager).toBe(s.tag);
		expect(s.spa).toBe("window.__ec && window.__ec.page();");
		for (const t of Object.values(s)) {
			expect(t).not.toContain("cookieless-analytics");
			expect(t).not.toContain("_emdash");
			expect(isNeutral(t.replace(MASTER, ""))).toBe(true);
			expect(t).not.toMatch(/[\u2013\u2014]/);
		}
	});
});

describe("Sites tab", () => {
	it("round trips the revenue settings through Inherit", async () => {
		const panel = await openSites();
		await within(panel).findByText("No client sites yet.");
		await addBlog(panel);
		const edit = async () => {
			const row = within(panel).getByRole("cell", { name: "Blog" }).closest("tr") as HTMLElement;
			click(row, "Edit");
			return within(panel).getByRole("form", { name: "Edit blog" });
		};
		let form = await edit();
		expect((within(form).getByLabelText("Default currency") as HTMLSelectElement).value).toBe("");
		set(form, "Default currency", "EUR");
		set(form, "Accept revenue from browsers", "off");
		click(form, "Save");
		await waitFor(() => expect(sites.items.get("blog")).toMatchObject({ defaultCurrency: "EUR", acceptClientRevenue: false }));
		form = await edit();
		expect((within(form).getByLabelText("Default currency") as HTMLSelectElement).value).toBe("EUR");
		expect((within(form).getByLabelText("Accept revenue from browsers") as HTMLSelectElement).value).toBe("off");
		set(form, "Default currency", "");
		set(form, "Accept revenue from browsers", "");
		click(form, "Save");
		await waitFor(() => expect(sites.items.get("blog")).not.toHaveProperty("defaultCurrency"));
		expect(sites.items.get("blog")).not.toHaveProperty("acceptClientRevenue");
	});

	it("round trips the site search parameters: own list, off, Inherit", async () => {
		const panel = await openSites();
		await within(panel).findByText("No client sites yet.");
		await addBlog(panel);
		const edit = async () => {
			const row = within(panel).getByRole("cell", { name: "Blog" }).closest("tr") as HTMLElement;
			click(row, "Edit");
			return within(panel).getByRole("form", { name: "Edit blog" });
		};
		let form = await edit();
		const mode = () => within(form).getByLabelText("Site search source") as HTMLSelectElement;
		expect(within(form).queryByLabelText("Site search parameter names")).toBeNull();
		fireEvent.change(mode(), { target: { value: "own" } });
		fireEvent.change(within(form).getByLabelText("Site search parameter names"), { target: { value: "Q, find" } });
		click(form, "Save");
		await waitFor(() => expect(sites.items.get("blog")).toMatchObject({ siteSearchParams: ["q", "find"] }));
		form = await edit();
		expect(mode().value).toBe("own");
		expect((within(form).getByLabelText("Site search parameter names") as HTMLInputElement).value).toBe("q, find");
		fireEvent.change(within(form).getByLabelText("Site search parameter names"), { target: { value: "" } });
		click(form, "Save");
		await waitFor(() => expect(sites.items.get("blog")).toMatchObject({ siteSearchParams: [] }));
		form = await edit();
		// Off is an own empty list, not Inherit.
		expect(mode().value).toBe("own");
		expect((within(form).getByLabelText("Site search parameter names") as HTMLInputElement).value).toBe("");
		fireEvent.change(within(form).getByLabelText("Site search parameter names"), { target: { value: "q" } });
		click(form, "Save");
		await waitFor(() => expect(sites.items.get("blog")).toMatchObject({ siteSearchParams: ["q"] }));
		form = await edit();
		fireEvent.change(mode(), { target: { value: "inherit" } });
		click(form, "Save");
		await waitFor(() => expect(sites.items.get("blog")).not.toHaveProperty("siteSearchParams"));
	});

	it("links a shop to this site: listed as linked, the Hosts list names its host with the limits of a visit across hosts", async () => {
		const panel = await openSites();
		await within(panel).findByText("No client sites yet.");
		click(panel, "Add a client site");
		const form = within(panel).getByRole("form", { name: "New client site" });
		expect(form.className).toBe("ca-form");
		// The submit and Cancel share one actions row instead of stacking as grid rows.
		expect(within(form).getByRole("button", { name: "Cancel" }).parentElement?.className).toBe("ca-actions");
		expect(within(form).getByRole("button", { name: "Add site" }).parentElement?.className).toBe("ca-actions");
		set(form, "Label", "Shop");
		set(form, "Id (lowercase letters, digits and dashes)", "shop");
		set(form, "Host names, one per line (up to 10, without https://)", "shop.example.net");
		fireEvent.click(within(form).getByRole("checkbox", { name: /Linked to this site/ }));
		await within(form).findByText(/stored as this site's visits/);
		click(form, "Add site");
		await within(panel).findByRole("cell", { name: "active, linked to this site" });
		// The number column reads from the right, like every other table.
		expect(within(panel).getByRole("columnheader", { name: "Page views today" }).className).toBe("ca-num");
		expect(sites.items.get("shop")).toMatchObject({ linked: true });
		expect(await kv.get("sites:linked")).toEqual(["shop.example.net"]);
		cleanup();
		const again = await openSites();
		const hosts = await within(again).findByRole("table", { name: "Hosts" });
		expect(within(hosts).getByRole("cell", { name: "shop.example.net" })).toBeTruthy();
		expect(within(hosts).getByRole("cell", { name: "linked: Shop" })).toBeTruthy();
		expect(within(hosts).getAllByRole("cell", { name: "none seen" }).length).toBeGreaterThan(0);
		// Notes start at the table edge: paragraphs, not an indented list.
		expect(within(again).getByText(/change of network or browser/).tagName).toBe("P");
	});

	it("creates a site and shows the three snippet forms with the master origin and key", async () => {
		const panel = await openSites();
		await within(panel).findByText("No client sites yet.");
		const blog = await addBlog(panel);
		expect(calls.find((c) => c.route === "sites/save")?.body).toEqual({ create: true, id: "blog", label: "Blog", hosts: ["blog.example.net", "www.blog.example.net"], gscProperty: "", bingSiteUrl: "", defaultCurrency: null, acceptClientRevenue: null, siteSearchParams: null, linked: false });
		expect(blog).not.toHaveProperty("defaultCurrency");
		const snippet = await within(panel).findByRole("region", { name: "Snippet for Blog" });
		expect(within(snippet).getAllByRole("button", { name: "Copy" })).toHaveLength(3);
		const text = snippet.textContent ?? "";
		expect(text).toContain(`<script defer src="${MASTER}/_/e.js" data-ec-key="${blog.key}"></script>`);
		expect(text).toContain("Initialization - All Pages");
		expect(text).toContain("window.__ec && window.__ec.page();");
		expect(text).not.toContain("cookieless-analytics");
		const row = within(panel).getByRole("cell", { name: "Blog" }).closest("tr") as HTMLElement;
		expect(row.textContent).toContain("blog.example.net, www.blog.example.net");
		expect(row.textContent).toContain("No property mapped");
		// The middleware was never seen: the degraded-mode warning shows.
		expect(within(panel).getByText(/middleware has not been seen/)).toBeTruthy();
	});

	it("shows the server's validation message", async () => {
		const panel = await openSites();
		click(panel, "Add a client site");
		const form = within(panel).getByRole("form", { name: "New client site" });
		set(form, "Label", "Self");
		set(form, "Id (lowercase letters, digits and dashes)", "self");
		set(form, "Host names, one per line (up to 10, without https://)", "master.example.org");
		click(form, "Add site");
		await within(panel).findByText(/served by this install/);
	});

	it("pauses, regenerates the key after confirmation and deletes with the typed confirmation and data", async () => {
		const panel = await openSites();
		const blog = await addBlog(panel);
		const row = () => within(panel).getByRole("cell", { name: "Blog" }).closest("tr") as HTMLElement;
		click(row(), "Pause");
		await waitFor(() => expect((sites.items.get("blog") as { paused: boolean }).paused).toBe(true));
		await within(row()).findByRole("button", { name: "Resume" });
		click(row(), "New key");
		expect(within(panel).getByText(/stops the old one at once/)).toBeTruthy();
		click(row(), "Confirm new key");
		await waitFor(() => expect((sites.items.get("blog") as { key: string }).key).not.toBe(blog.key));
		click(row(), "Delete");
		const form = within(panel).getByRole("form", { name: "Delete blog" });
		expect((within(form).getByRole("button", { name: "Delete site" }) as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(within(form).getByLabelText(/Also delete its data/));
		set(form, "Type DELETE to confirm", "DELETE");
		click(form, "Delete site");
		await within(panel).findByText("Deleted blog and its data.");
		expect(sites.items.has("blog")).toBe(false);
		expect(calls.find((c) => c.route === "sites/delete")?.body).toEqual({ id: "blog", deleteData: true });
		expect(calls.filter((c) => c.route === "tools/purge-site").length).toBe(2);
	});

	it("API keys can be limited to sites of this database", async () => {
		await sites.put("blog", { id: "blog", label: "Blog", key: "b".repeat(20), hosts: ["blog.example.net"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 });
		render(<Config />);
		fireEvent.click(await screen.findByRole("tab", { name: "API keys" }));
		const panel = screen.getByRole("tabpanel", { name: "API keys" });
		const form = within(panel).getByRole("form", { name: "New API key" });
		set(form, "Label", "Blog agent");
		fireEvent.click(within(form).getByLabelText("Blog"));
		click(form, "Create key");
		await within(panel).findByText(/Copy it now/);
		expect(calls.find((c) => c.route === "keys/create")?.body).toMatchObject({ label: "Blog agent", sites: ["blog"] });
		expect(within(panel).getByRole("cell", { name: "blog" })).toBeTruthy();
	});
});

describe("per-site admin behavior", () => {
	beforeEach(async () => {
		await sites.put("blog", { id: "blog", label: "Blog", key: "b".repeat(20), hosts: ["blog.example.net"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 });
	});

	it("the switcher lists All sites, then the kinds, local first", async () => {
		render(<Config />);
		const select = (await screen.findByLabelText("Site")) as HTMLSelectElement;
		expect([...select.options].map((o) => o.textContent)).toEqual(["All sites", "This site (this install)", "Blog (client site)"]);
	});

	it("Config hides User agent rules, API keys and Sites for a client site and sends its id with config calls", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/config?from=2026-03-01&to=2026-03-07&site=blog");
		render(<Config />);
		await screen.findByRole("tablist");
		expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Goals", "Funnels", "Segments", "Channel rules", "UTM builder"]);
		await waitFor(() => expect(calls.find((c) => c.route === "config/goals/list")?.body).toEqual({ limit: 100, site: "blog" }));
		expect(calls.find((c) => c.route === "config/segments/list")?.body).toEqual({ limit: 100, site: "blog" });
	});

	it("Data shows the client site's receipt, the per-database note and the per-site delete", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/data?from=2026-03-01&to=2026-03-07&site=blog");
		render(<Data />);
		await screen.findByText(/apply to every site/);
		expect(calls.find((c) => c.route === "privacy/receipt")?.body).toEqual({ site: "blog" });
		fireEvent.click(screen.getByRole("tab", { name: "Delete" }));
		const form = screen.getByRole("form", { name: "Delete all data" });
		expect(form.textContent).toContain("the selected client site");
		fireEvent.change(within(form).getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
		click(form, "Delete all data");
		await waitFor(() => expect(calls.filter((c) => c.route === "tools/purge-site")[0]?.body).toEqual({ site: "blog", confirm: "DELETE" }));
		expect(calls.some((c) => c.route === "tools/delete-all")).toBe(false);
	});

	it("Pages shows Not found as not available for a client site", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-03-01&to=2026-03-07&site=blog");
		render(<Pages />);
		fireEvent.click(await screen.findByRole("tab", { name: "Not found" }));
		await screen.findByText(/Not available for this site/);
		expect(calls.some((c) => c.route === "data/query" && (c.body as { report?: string }).report === "not_found")).toBe(false);
	});

	it("adds no admin page", () => {
		expect(ADMIN_PAGES.map((p) => p.path)).toEqual(["/", "/dashboards", "/pages", "/satisfaction", "/sources", "/audience", "/behavior", "/revenue", "/links", "/annotations", "/search", "/config", "/data", "/settings"]);
	});
});
