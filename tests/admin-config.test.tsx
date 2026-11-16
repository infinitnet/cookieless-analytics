// @vitest-environment jsdom
/** Config page: create, edit and delete each item through mocked routes that validate with the real schemas. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pages } from "../src/admin/index.js";
import Config, { buildUtmUrl } from "../src/admin/pages/Config.js";
import { BUILTIN_CHANNEL_RULES } from "../src/core/channels.js";
import { ADMIN_PAGES } from "../src/index.js";
import { CONFIG_COLLECTIONS, type ConfigCollection, type ConfigCtx, configRoutes, saveBody } from "../src/routes/config.js";
import { toolRoutes } from "../src/routes/tools.js";
import { z } from "zod";

type Body = Record<string, unknown>;
let calls: Array<{ route: string; body: Body }> = [];
let store: Record<string, Map<string, Record<string, unknown>>> = {};
let sites: unknown[] = [];
let nextId = 0;
let reclassify: Array<{ site: string; scanned: number; updated: number; cursor: string | null; done: boolean; stored: string[] }> = [];
/** null answers the call with an error. */
let rollups: Array<{ next: string | null; after: string | null } | null> = [];

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { code: "ERR", message } }), { status, headers: { "content-type": "application/json" } });

/** The real agent tester over the rules in the mocked store. */
const tester = toolRoutes({
	db: () => Promise.reject(new Error("unused")),
	settings: () => Promise.reject(new Error("unused")),
	agentRules: async () => [...(store.agent_rules ?? new Map()).entries()].map(([id, d]) => ({ ...d, id }) as never),
	channelRules: async () => [],
	goals: async () => [],
})["tools/test-agent"];

/** The real bulk and built-in rule routes over the mocked store. */
const ruleRoutes = configRoutes({ settings: async () => ({ siteId: "main" }) });
const mapColl = (m: Map<string, Record<string, unknown>>) => ({
	query: async () => ({ items: [...m].map(([id, data]) => ({ id, data })), hasMore: false }),
	get: async (id: string) => m.get(id) ?? null,
	put: async (id: string, data: unknown) => void m.set(id, data as Record<string, unknown>),
	delete: async (id: string) => m.delete(id),
	putMany: async (rows: Array<{ id: string; data: unknown }>) => rows.forEach((r) => m.set(r.id, r.data as Record<string, unknown>)),
	deleteMany: async (ids: string[]) => ids.filter((id) => m.delete(id)).length,
});

async function handle(route: string, body: Body): Promise<Response> {
	if (route === "sites/list") return ok({ sites });
	if (route === "config/agent_rules/bulk" || route === "config/agent_rules/builtin") {
		try {
			return ok(await ruleRoutes[route]?.handler({ input: body, storage: { agent_rules: mapColl((store.agent_rules ??= new Map())) } } as unknown as ConfigCtx));
		} catch (e) {
			return fail(400, (e as Error).message);
		}
	}
	if (route === "tools/test-agent") return ok(await tester.handler({ input: body, kv: {} as never }));
	if (route === "tools/reclassify-channels") return ok(reclassify.shift());
	if (route === "tools/rollup-now") {
		const r = rollups.shift();
		return r === null ? fail(500, "Platform limit") : ok(r);
	}
	const m = /^config\/([a-z_]+)\/(list|save|delete)$/.exec(route);
	if (!m) return fail(404, "No route");
	const kind = m[1] as ConfigCollection;
	if (!CONFIG_COLLECTIONS.includes(kind)) return fail(404, "No route");
	const items = (store[kind] ??= new Map());
	if (m[2] === "list") return ok({ items: [...items].map(([id, data]) => ({ id, data })), cursor: null });
	if (m[2] === "delete") return items.delete(String(body.id)) ? ok({ id: body.id, deleted: true }) : fail(404, "Unknown item.");
	const parsed = saveBody(kind).safeParse(body);
	// As the host answers a refused body: a fixed message, the reasons in `details` (z.formatError).
	if (!parsed.success) return new Response(JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: z.formatError(parsed.error) } }), { status: 400, headers: { "content-type": "application/json" } });
	const id = parsed.data.id ?? `id${++nextId}`;
	items.set(id, { ...(parsed.data.data as Body), site: "main" });
	return ok({ id });
}

beforeEach(() => {
	calls = [];
	store = {};
	nextId = 0;
	reclassify = [];
	rollups = [];
	sites = [{ id: "main", label: "This site", local: true, timezone: "Pacific/Auckland" }];
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

const saves = (kind: string) => calls.filter((c) => c.route === `config/${kind}/save`).map((c) => c.body);
const items = (kind: string) => [...(store[kind] ?? new Map()).values()];
const set = (el: HTMLElement, label: string, value: string) => fireEvent.change(within(el).getByLabelText(label), { target: { value } });
const click = (el: HTMLElement, name: string) => fireEvent.click(within(el).getByRole("button", { name }));

async function openTab(name: string) {
	render(<Config />);
	fireEvent.click(await screen.findByRole("tab", { name }));
	return screen.getByRole("tabpanel", { name });
}

/** Opens the editor of the row whose first cell is `name`. */
function editRow(panel: HTMLElement, name: string) {
	const row = within(panel).getByRole("cell", { name }).closest("tr") as HTMLElement;
	click(row, "Edit");
}

async function deleteRow(panel: HTMLElement, name: string) {
	const row = within(panel).getByRole("cell", { name }).closest("tr") as HTMLElement;
	click(row, "Delete");
	click(row, "Confirm delete");
	await waitFor(() => expect(within(panel).queryByRole("cell", { name })).toBeNull());
}

describe("descriptor", () => {
	it("ends the admin pages with Definitions, Data and Settings", () => {
		expect(ADMIN_PAGES.map((p) => [p.path, p.label]).slice(-3)).toEqual([["/config", "Definitions"], ["/data", "Data"], ["/settings", "Settings"]]);
		expect(Object.keys(pages)).toEqual(ADMIN_PAGES.map((p) => p.path));
		expect(pages["/config"]).toBe(Config);
	});
});

describe("Config page", () => {
	it("shows every Config tab in order", async () => {
		render(<Config />);
		// The first render of the file is cold under load: allow more than the 1 s default.
		await screen.findByRole("tablist", {}, { timeout: 5000 });
		expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Goals", "Funnels", "Segments", "Channel rules", "User agent rules", "UTM builder", "API keys", "Sites"]);
		// Titled Definitions; range and filters change nothing here, so one site shows no header.
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Definitions");
		expect(document.querySelector(".ca-header")).toBeNull();
		// The tab is in the URL; Back returns to the previous one.
		fireEvent.click(screen.getByRole("tab", { name: "Funnels" }));
		await waitFor(() => expect(new URLSearchParams(window.location.search).get("tab")).toBe("funnels"));
	});

	it("goals: create, edit and delete", async () => {
		const panel = await openTab("Goals");
		await within(panel).findByText("No goals yet.");
		click(panel, "New goal");
		const form = within(panel).getByRole("form", { name: "New goal" });
		set(form, "Name", "Signup");
		set(form, "Type", "event");
		set(form, "Event name", "signup");
		set(form, "Property (optional)", "plan");
		set(form, "Property value", "pro");
		// Save and Cancel share one actions row.
		expect(within(form).getByRole("button", { name: "Cancel" }).parentElement).toBe(within(form).getByRole("button", { name: "Save" }).parentElement);
		click(form, "Save");
		await within(panel).findByRole("cell", { name: "Signup" });
		expect(items("goals")).toEqual([{ name: "Signup", type: "event", match: "is", value: "signup", props: { plan: "pro" }, active: true, site: "main" }]);

		editRow(panel, "Signup");
		const edit = within(panel).getByRole("form", { name: "Edit goal" });
		set(edit, "Name", "Signup pro");
		fireEvent.click(within(edit).getByLabelText("Active"));
		click(edit, "Save");
		await within(panel).findByRole("cell", { name: "Signup pro" });
		expect(saves("goals")[1]).toMatchObject({ id: "id1", data: { name: "Signup pro", active: false } });
		expect(saves("goals")[1]?.data).not.toHaveProperty("site");
		expect(store.goals?.size).toBe(1);

		await deleteRow(panel, "Signup pro");
		expect(store.goals?.size).toBe(0);
	});

	it("goals: a regex is checked live and the route error is shown", async () => {
		const panel = await openTab("Goals");
		click(panel, "New goal");
		const form = within(panel).getByRole("form", { name: "New goal" });
		set(form, "Name", "Bad");
		set(form, "Match", "regex");
		set(form, "Path", "(a+)+");
		expect(within(form).getByRole("alert").textContent).toMatch(/nested|quantifier/i);
		click(form, "Save");
		await within(panel).findByText(/Unsafe or invalid regex/);
		expect(store.goals?.size ?? 0).toBe(0);
	});

	it("goals: Match offers only the modes the engine honours for each type", async () => {
		const panel = await openTab("Goals");
		click(panel, "New goal");
		const form = within(panel).getByRole("form", { name: "New goal" });
		const modes = () => Array.from((within(form).getByLabelText("Match") as HTMLSelectElement).options).map((o) => o.value);
		expect(modes()).toEqual(["is", "prefix", "contains", "regex"]);
		set(form, "Match", "regex");
		set(form, "Type", "outbound");
		expect(modes()).toEqual(["is", "prefix", "contains"]);
		expect((within(form).getByLabelText("Match") as HTMLSelectElement).value).toBe("is");
		set(form, "Match", "contains");
		set(form, "Type", "event");
		expect(within(form).queryByLabelText("Match")).toBeNull();
		set(form, "Name", "Signup");
		set(form, "Event name", "signup_");
		click(form, "Save");
		await within(panel).findByRole("cell", { name: "Signup" });
		expect(items("goals")[0]).toMatchObject({ type: "event", match: "is", value: "signup_" });
	});

	it("a refused value names its field and reason", async () => {
		const panel = await openTab("Segments");
		click(panel, "New segment");
		const form = within(panel).getByRole("form", { name: "New segment" });
		set(form, "Name", "Empty");
		click(form, "Save");
		expect(await within(panel).findByText(/^Invalid request body: filters: Too small/)).toBeTruthy();
	});

	it("funnels: an event step hides Match and matches its name exactly", async () => {
		const panel = await openTab("Funnels");
		click(panel, "New funnel");
		const form = within(panel).getByRole("form", { name: "New funnel" });
		set(form, "Step 2 match", "regex");
		set(form, "Step 2 type", "event");
		expect(within(form).queryByLabelText("Step 2 match")).toBeNull();
		expect(within(form).getByLabelText("Step 1 match")).toBeTruthy();
		set(form, "Name", "Pay");
		set(form, "Step 1 value", "/cart");
		set(form, "Step 2 value", "pay");
		click(form, "Save");
		await within(panel).findByRole("cell", { name: "Pay" });
		expect((items("funnels")[0] as { steps: unknown[] }).steps[1]).toEqual({ type: "event", match: "is", value: "pay" });
	});

	it("funnels: 2 to 6 steps, create, edit and delete", async () => {
		const panel = await openTab("Funnels");
		click(panel, "New funnel");
		const form = within(panel).getByRole("form", { name: "New funnel" });
		expect(within(form).getByRole("button", { name: "Remove step 1" })).toHaveProperty("disabled", true);
		for (let i = 0; i < 4; i++) click(form, "Add step");
		expect(within(form).getByRole("button", { name: "Add step" })).toHaveProperty("disabled", true);
		expect(within(form).getAllByLabelText(/Step \d value/)).toHaveLength(6);
		for (let i = 0; i < 3; i++) click(form, "Remove step 6".replace("6", String(6 - i)));
		set(form, "Name", "Checkout");
		expect(form.textContent).toContain("Strict: each step is the next page view or event of the visit");
		expect(form.textContent).toContain("Flexible: the steps happen in any order");
		set(form, "Mode", "strict");
		set(form, "Step 1 value", "/cart");
		set(form, "Step 2 type", "event");
		set(form, "Step 2 value", "pay");
		set(form, "Step 3 match", "prefix");
		set(form, "Step 3 value", "/thanks");
		click(form, "Save");
		await within(panel).findByRole("cell", { name: "Checkout" });
		expect(items("funnels")[0]).toMatchObject({
			name: "Checkout",
			mode: "strict",
			steps: [
				{ type: "page", match: "is", value: "/cart" },
				{ type: "event", match: "is", value: "pay" },
				{ type: "page", match: "prefix", value: "/thanks" },
			],
		});

		editRow(panel, "Checkout");
		const edit = within(panel).getByRole("form", { name: "Edit funnel" });
		click(edit, "Remove step 3");
		click(edit, "Save");
		await waitFor(() => expect((items("funnels")[0] as { steps: unknown[] }).steps).toHaveLength(2));
		await deleteRow(panel, "Checkout");
		expect(store.funnels?.size).toBe(0);
	});

	it("segments: create with the filter bar, edit and delete", async () => {
		const panel = await openTab("Segments");
		click(panel, "New segment");
		const form = within(panel).getByRole("form", { name: "New segment" });
		set(form, "Name", "Blog");
		set(form, "Value", "/blog");
		click(form, "Add filter");
		// Adding a filter must not save the segment (no nested form submit).
		expect(saves("segments")).toHaveLength(0);
		click(form, "Save");
		await within(panel).findByRole("cell", { name: "Blog" });
		expect(items("segments")[0]).toMatchObject({ name: "Blog", filters: [{ dim: "page", op: "is", values: ["/blog"] }] });

		editRow(panel, "Blog");
		const edit = within(panel).getByRole("form", { name: "Edit segment" });
		set(edit, "Name", "Blog posts");
		click(edit, "Save");
		await within(panel).findByRole("cell", { name: "Blog posts" });
		await deleteRow(panel, "Blog posts");
		expect(store.segments?.size).toBe(0);
	});

	it("channel rules: switch a built-in off and on, user rule create, edit, delete, reclassify", async () => {
		const panel = await openTab("Channel rules");
		const first = BUILTIN_CHANNEL_RULES[0];
		if (!first) throw new Error("no built-in rules");
		const box = await within(panel).findByLabelText(new RegExp(`^${first.channel} \\(priority 10\\)`));
		await waitFor(() => expect(box).toHaveProperty("disabled", false));
		fireEvent.click(box);
		await waitFor(() => expect(items("channel_rules")).toEqual([{ disables: first.id, site: "main" }]));
		await waitFor(() => expect(box).toHaveProperty("checked", false));
		fireEvent.click(box);
		await waitFor(() => expect(store.channel_rules?.size).toBe(0));

		click(panel, "New rule");
		const form = within(panel).getByRole("form", { name: "New rule" });
		set(form, "Channel", "Partners");
		set(form, "utm_medium regex", "^partner$");
		set(form, "Referrer in host list", "social");
		click(form, "Save");
		await within(panel).findByRole("cell", { name: "Partners" });
		expect(items("channel_rules")[0]).toEqual({ channel: "Partners", priority: 5, any: [{ medium: "^partner$", refList: "social" }], site: "main" });

		editRow(panel, "Partners");
		const edit = within(panel).getByRole("form", { name: "Edit rule" });
		set(edit, "Referrer in host list", "");
		set(edit, "Priority (lower runs first; built-ins use 10 to 200)", "300");
		click(edit, "Save");
		await waitFor(() => expect(items("channel_rules")[0]).toMatchObject({ priority: 300, any: [{ medium: "^partner$" }] }));
		expect((items("channel_rules")[0] as { any: Body[] }).any[0]).not.toHaveProperty("refList");
		await deleteRow(panel, "Partners");

		reclassify = [
			{ site: "main", scanned: 2000, updated: 7, cursor: "s2000", done: false, stored: ["2026-01-02", "2026-01-01"] },
			{ site: "main", scanned: 120, updated: 1, cursor: null, done: true, stored: ["2026-03-10"] },
		];
		// The changed closed days of the site are stored again: 31 days per call, following `next` and `after` when a call stops at its budget.
		rollups = [{ next: "2026-01-02", after: null }, { next: "2026-01-02", after: "main" }, { next: null, after: null }, { next: null, after: null }];
		click(panel, "Reclassify sessions");
		await within(panel).findByText("Checked 2120 sessions, changed 8. Stored the summaries of 3 closed days again.");
		expect(calls.filter((c) => c.route === "tools/reclassify-channels").map((c) => c.body)).toEqual([{}, { cursor: "s2000" }]);
		expect(calls.filter((c) => c.route === "tools/rollup-now").map((c) => c.body)).toEqual([
			{ from: "2026-01-01", to: "2026-01-02", site: "main" },
			{ from: "2026-01-02", to: "2026-01-02", site: "main" },
			{ from: "2026-01-02", to: "2026-01-02", site: "main", after: "main" },
			{ from: "2026-03-10", to: "2026-03-10", site: "main" },
		]);
	});

	it("reclassify: a failed store names the first day not stored and Continue finishes the kept days", async () => {
		const panel = await openTab("Channel rules");
		reclassify = [{ site: "main", scanned: 50, updated: 2, cursor: null, done: true, stored: ["2026-02-15", "2026-01-01"] }];
		rollups = [{ next: null, after: null }, null];
		click(panel, "Reclassify sessions");
		await within(panel).findByText("Stopped: Platform limit. Summaries from 2026-02-15 on were not stored again.");
		rollups = [{ next: null, after: null }];
		click(panel, "Continue");
		await within(panel).findByText("Stored the summaries of 1 closed days again.");
		expect(within(panel).queryByRole("button", { name: "Continue" })).toBeNull();
		expect(calls.filter((c) => c.route === "tools/rollup-now").map((c) => c.body)).toEqual([
			{ from: "2026-01-01", to: "2026-01-01", site: "main" },
			{ from: "2026-02-15", to: "2026-02-15", site: "main" },
			{ from: "2026-02-15", to: "2026-02-15", site: "main" },
		]);
	});

	it("user agent rules: create, edit, delete and the tester shows the matching rule", async () => {
		const panel = await openTab("User agent rules");
		click(panel, "New rule");
		const form = within(panel).getByRole("form", { name: "New rule" });
		set(form, "User agent pattern", "examplefetcher");
		set(form, "Name", "Example fetcher");
		set(form, "Category", "monitoring");
		click(form, "Save");
		await within(panel).findByRole("cell", { name: "contains examplefetcher" });
		expect(items("agent_rules")[0]).toEqual({ pattern: "examplefetcher", mode: "contains", action: "robot", name: "Example fetcher", category: "monitoring", site: "main" });

		const tester = within(panel).getByRole("form", { name: "Test a user agent" });
		// A form like the rest: 14 px label, 720 px wide.
		expect(tester.className).toBe("ca-form");
		set(tester, "User agent", "Mozilla/5.0 (compatible; ExampleFetcher/2.1)");
		click(tester, "Test");
		await within(panel).findByText(/matched by your rule "contains examplefetcher"/);
		expect(within(panel).getByRole("status").textContent).toContain("(monitoring)");

		set(tester, "User agent", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)");
		click(tester, "Test");
		await within(panel).findByText(/matched by a built-in rule/);
		set(tester, "User agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
		click(tester, "Test");
		await within(panel).findByText("Human: counted as a visitor.");

		editRow(panel, "contains examplefetcher");
		const edit = within(panel).getByRole("form", { name: "Edit rule" });
		set(edit, "Mark as", "human");
		click(edit, "Save");
		await waitFor(() => expect(items("agent_rules")[0]).toMatchObject({ action: "human" }));
		await deleteRow(panel, "contains examplefetcher");
		expect(store.agent_rules?.size).toBe(0);
	});

	it("user agent rules as text: line errors, diff, save, export and import", async () => {
		store.agent_rules = new Map([["r1", { site: "main", pattern: "examplemonitor", mode: "contains", action: "robot", name: "Monitor", category: "monitoring" }]]);
		const panel = await openTab("User agent rules");
		await within(panel).findByRole("cell", { name: "contains examplemonitor" });
		fireEvent.click(within(panel).getByRole("button", { name: "Edit as text" }));
		const box = within(panel).getByLabelText("Rules, one per line") as HTMLTextAreaElement;
		expect(box.value).toBe("bot contains examplemonitor # Monitor");
		const save = () => within(panel).getByRole("button", { name: "Save" }) as HTMLButtonElement;
		expect(save().disabled).toBe(true);

		fireEvent.change(box, { target: { value: "bot contains examplemonitor # Monitor\nbot glob x\nhuman exact exampleapp/1.0" } });
		click(panel, "Check");
		const err = await within(panel).findByRole("button", { name: 'Line 2: Unknown mode "glob": use contains, prefix, exact or regex.' });
		// Nothing went to the server for a text with local errors.
		expect(calls.some((c) => c.route === "config/agent_rules/bulk")).toBe(false);
		fireEvent.click(err);
		expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe("bot glob x");
		expect(save().disabled).toBe(true);

		fireEvent.change(box, { target: { value: "bot contains examplemonitor # Monitor\nhuman exact exampleapp/1.0\nbot contains mozilla" } });
		click(panel, "Check");
		await within(panel).findByText(/2 added, 0 changed, 0 removed, 1 unchanged\./);
		expect(within(panel).getByRole("button", { name: /^Line 3: This bot rule matches a current browser/ })).toBeTruthy();
		expect(calls.filter((c) => c.route === "config/agent_rules/bulk").map((c) => c.body.check)).toEqual([true]);
		expect(save().disabled).toBe(false);
		// An edit after the check closes Save again.
		fireEvent.change(box, { target: { value: "bot contains examplemonitor # Monitor\nhuman exact exampleapp/1.0" } });
		expect(save().disabled).toBe(true);
		click(panel, "Check");
		await within(panel).findByText(/1 added, 0 changed, 0 removed, 1 unchanged\./);
		click(panel, "Save");
		await within(panel).findByText("Saved: 1 row written.");
		expect(items("agent_rules")).toEqual([
			{ site: "main", pattern: "examplemonitor", mode: "contains", action: "robot", name: "Monitor", category: "monitoring" },
			{ site: "main", pattern: "exampleapp/1.0", mode: "exact", action: "human" },
		]);
		await waitFor(() => expect((within(panel).getByLabelText("Rules, one per line") as HTMLTextAreaElement).value).toBe("bot contains examplemonitor # Monitor\nhuman exact exampleapp/1.0"));

		const writeText = vi.fn(async () => undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		click(panel, "Copy");
		await within(panel).findByText("Copied to the clipboard.");
		expect(writeText).toHaveBeenCalledWith("bot contains examplemonitor # Monitor\nhuman exact exampleapp/1.0");
		// Import fills the box and saves nothing.
		const before = calls.length;
		// jsdom has no Blob.text; the browser does.
		const file = Object.assign(new File(["bot prefix examplefetcher/\n"], "rules.txt", { type: "text/plain" }), { text: async () => "bot prefix examplefetcher/\n" });
		fireEvent.change(within(panel).getByLabelText("Load a file"), { target: { files: [file] } });
		await waitFor(() => expect((within(panel).getByLabelText("Rules, one per line") as HTMLTextAreaElement).value).toBe("bot prefix examplefetcher/\n"));
		expect(calls.length).toBe(before);
		expect(within(panel).getByText("Unsaved changes. Check the rules, then save.")).toBeTruthy();
	});

	it("user agent rules as text: a 60 rule save repeats until none remain", async () => {
		const panel = await openTab("User agent rules");
		fireEvent.click(await within(panel).findByRole("button", { name: "Edit as text" }));
		const box = within(panel).getByLabelText("Rules, one per line") as HTMLTextAreaElement;
		fireEvent.change(box, { target: { value: Array.from({ length: 60 }, (_, i) => `bot contains examplemonitor${i}`).join("\n") } });
		click(panel, "Check");
		await within(panel).findByText(/60 added, 0 changed, 0 removed, 0 unchanged\./);
		click(panel, "Save");
		await within(panel).findByText("Saved: 60 rows written.");
		expect(calls.filter((c) => c.route === "config/agent_rules/bulk" && !c.body.check)).toHaveLength(2);
		expect(store.agent_rules?.size).toBe(60);
	});

	it("built-in list: pages of 50, search, Force human goes through the text and marks the row", async () => {
		const panel = await openTab("User agent rules");
		fireEvent.click(within(panel).getByRole("button", { name: "Built-in list" }));
		const list = within(panel).getByRole("region", { name: "Built-in list" });
		await within(list).findByText(/^Rows 1 to 50 of /);
		expect(within(list).getAllByRole("row")).toHaveLength(51);
		click(list, "Next");
		await within(list).findByText(/^Rows 51 to 100 of /);
		set(list, "Search the built-in list", "googlebot-image");
		await within(list).findByText("Rows 1 to 1 of 1");
		fireEvent.click(within(list).getByRole("button", { name: "Force human: Googlebot-Image" }));
		const box = within(panel).getByLabelText("Rules, one per line") as HTMLTextAreaElement;
		expect(box.value).toBe("human contains googlebot-image # Googlebot-Image");
		expect(within(panel).getByText(/^Added to the text: human contains googlebot-image/)).toBeTruthy();
		expect(within(list).getByText("Your rule: human")).toBeTruthy();
		expect(store.agent_rules?.size ?? 0).toBe(0);
		click(panel, "Check");
		await within(panel).findByText(/1 added, 0 changed, 0 removed, 0 unchanged\./);
		click(panel, "Save");
		await waitFor(() => expect(items("agent_rules")).toEqual([{ site: "main", action: "human", mode: "contains", pattern: "googlebot-image", name: "Googlebot-Image" }]));
		// The tester now answers human for that bot.
		const tester = within(panel).getByRole("form", { name: "Test a user agent" });
		set(tester, "User agent", "Googlebot-Image/1.0 (example.com)");
		click(tester, "Test");
		await within(panel).findByText("Human: counted as a visitor.");
	});

	it("user agent rules are one set: no tab with a client site selected", async () => {
		sites = [
			{ id: "main", label: "This site", local: true, timezone: "UTC" },
			{ id: "shop", label: "Shop", local: false, kind: "client", timezone: "UTC" },
		];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/config?from=2026-03-01&to=2026-03-07&site=shop");
		render(<Config />);
		await screen.findByText(/User agent rules, API keys and client sites are managed with this install selected/);
		expect(screen.queryByRole("tab", { name: "User agent rules" })).toBeNull();
	});

	it("UTM builder: tagged URL, predicted channel, validation and copy", async () => {
		const writeText = vi.fn(async () => undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		const panel = await openTab("UTM builder");
		set(panel, "Page URL", "example.com/page");
		expect(within(panel).getByRole("alert").textContent).toBe("Enter a full http or https URL.");
		set(panel, "Page URL", "https://example.com/page?x=1#top");
		set(panel, "utm_source (required)", "google");
		set(panel, "utm_medium", "cpc");
		set(panel, "utm_campaign", "spring sale");
		const out = within(panel).getByLabelText("Tagged URL").textContent;
		expect(within(panel).queryByText("Copied.")).toBeNull();
		expect(out).toBe("https://example.com/page?x=1&utm_source=google&utm_medium=cpc&utm_campaign=spring+sale#top");
		expect(within(panel).getByText("Paid Search")).toBeTruthy();
		set(panel, "utm_medium", "newsletter");
		set(panel, "utm_source (required)", "weekly");
		expect(within(panel).getByText(/Predicted channel with the default rules/).textContent).toBe("Predicted channel with the default rules: Email");
		click(panel, "Copy URL");
		await within(panel).findByText("Copied.");
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining("utm_source=weekly"));
		// A changed link is not the copied one.
		set(panel, "utm_term", "x");
		expect(within(panel).queryByText("Copied.")).toBeNull();
	});

	it("buildUtmUrl rejects other schemes and removes empty fields", () => {
		expect(buildUtmUrl("javascript:alert(1)", { utm_source: "x" })).toBeNull();
		expect(buildUtmUrl("https://example.com/?utm_term=old", { utm_source: " a ", utm_term: "" })).toBe("https://example.com/?utm_source=a");
	});

	it("API keys tab renders the key manager (details in admin-keys)", async () => {
		const panel = await openTab("API keys");
		expect(within(panel).getByRole("form", { name: "New API key" })).toBeTruthy();
	});

	it("a connected site shows the notice with a link and no forms", async () => {
		sites = [
			{ id: "main", label: "This site", local: true, timezone: "UTC" },
			{ id: "blog", label: "Blog", local: false, origin: "https://blog.example" },
		];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/config?from=2026-03-01&to=2026-03-07&site=blog");
		render(<Config />);
		await screen.findByText(/Configuration is managed on the selected site/);
		expect(screen.getByRole("link", { name: "Open the admin of Blog" }).getAttribute("href")).toBe("https://blog.example/_emdash/admin/plugins/cookieless-analytics/config");
		expect(screen.queryByRole("tablist")).toBeNull();
		expect(screen.queryByRole("button", { name: /^New / })).toBeNull();
		await act(async () => new Promise((r) => setTimeout(r, 20)));
		expect(calls.filter((c) => c.route.startsWith("config/") && c.route !== "config/segments/list")).toEqual([]);
	});
});
