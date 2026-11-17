// @vitest-environment jsdom
/** Config, API keys tab: create shows the token once, list and revoke never show it; the real keys routes run behind fetch. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Config from "../src/admin/pages/Config.js";
import { keyRoutes } from "../src/routes/keys.js";
import { memColl } from "./agent.helpers.js";

type Body = Record<string, unknown>;
let calls: Array<{ route: string; body: Body }> = [];
let keys = memColl();
const routes = keyRoutes();
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { code: "ERR", message } }), { status, headers: { "content-type": "application/json" } });

async function handle(route: string, body: Body): Promise<Response> {
	if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, timezone: "UTC" }] });
	const r = routes[route as keyof typeof routes];
	if (!r) return fail(404, "No route");
	const parsed = r.input.safeParse(body);
	if (!parsed.success) return fail(400, "Invalid request body");
	try {
		return ok(await r.handler({ input: parsed.data, storage: { api_keys: keys } }));
	} catch (e) {
		return fail(400, (e as Error).message);
	}
}

beforeEach(() => {
	calls = [];
	keys = memColl();
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/config");
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

async function openKeys() {
	render(<Config />);
	fireEvent.click(await screen.findByRole("tab", { name: "API keys" }));
	return screen.getByRole("tabpanel", { name: "API keys" });
}

describe("API keys tab", () => {
	it("creates a key with scopes and expiry, shows the token once, then lists it without the token", async () => {
		const panel = await openKeys();
		await within(panel).findByText("No API keys yet.");
		const form = within(panel).getByRole("form", { name: "New API key" });
		fireEvent.change(within(form).getByLabelText("Label"), { target: { value: "Deploy script" } });
		fireEvent.click(within(form).getByRole("checkbox", { name: /^read:analytics/ }));
		fireEvent.click(within(form).getByRole("checkbox", { name: /^write:annotations/ }));
		expect(within(form).getByRole("checkbox", { name: /^write:events: Record events and order values/ })).toBeTruthy();
		fireEvent.change(within(form).getByLabelText("Expires after (optional)"), { target: { value: "2099-12-31" } });
		fireEvent.click(within(form).getByRole("button", { name: "Create key" }));
		const shown = await within(panel).findByLabelText("New API key", { selector: "code" });
		const token = shown.textContent ?? "";
		expect(token).toMatch(/^[a-z0-9]{8}\.[A-Za-z0-9_-]{43}$/);
		expect(calls.find((c) => c.route === "keys/create")?.body).toEqual({ label: "Deploy script", scopes: ["write:annotations"], expires: Date.UTC(2100, 0, 1) / 1000 });
		const row = (await within(panel).findByRole("cell", { name: "Deploy script" })).closest("tr") as HTMLElement;
		expect(within(row).getByText(`${token.slice(0, 8)}...`)).toBeTruthy();
		expect(within(row).getByText("2099-12-31")).toBeTruthy();

		const writeText = vi.fn(async () => undefined);
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		fireEvent.click(within(panel).getByRole("button", { name: "Copy key" }));
		await within(panel).findByText("Copied.");
		expect(writeText).toHaveBeenCalledWith(token);

		fireEvent.click(within(panel).getByRole("button", { name: "Done" }));
		expect(panel.textContent).not.toContain(token.slice(9));
		// No later response carries the secret.
		const listed = await (await handle("keys/list", {})).text();
		expect(listed).not.toContain(token.slice(9));
	});

	it("revokes after a second click", async () => {
		const panel = await openKeys();
		await within(panel).findByText("No API keys yet.");
		fireEvent.change(within(panel).getByLabelText("Label"), { target: { value: "Master" } });
		fireEvent.click(within(panel).getByRole("button", { name: "Create key" }));
		const row = (await within(panel).findByRole("cell", { name: "Master" })).closest("tr") as HTMLElement;
		expect(within(row).getByText("active")).toBeTruthy();
		fireEvent.click(within(row).getByRole("button", { name: "Revoke" }));
		expect(calls.some((c) => c.route === "keys/revoke")).toBe(false);
		fireEvent.click(within(row).getByRole("button", { name: "Confirm revoke" }));
		await waitFor(() => expect(within(panel).getByText("revoked")).toBeTruthy());
		expect(calls.find((c) => c.route === "keys/revoke")?.body).toMatchObject({ id: expect.any(String) });
	});

	it("disables Create without a label or a scope and shows route errors", async () => {
		const panel = await openKeys();
		await within(panel).findByText("No API keys yet.");
		const create = within(panel).getByRole("button", { name: "Create key" }) as HTMLButtonElement;
		expect(create.disabled).toBe(true);
		fireEvent.change(within(panel).getByLabelText("Label"), { target: { value: "x" } });
		expect(create.disabled).toBe(false);
		fireEvent.click(within(panel).getByRole("checkbox", { name: /^read:analytics/ }));
		expect(create.disabled).toBe(true);
		fireEvent.click(within(panel).getByRole("checkbox", { name: /^read:search/ }));
		fireEvent.change(within(panel).getByLabelText("Expires after (optional)"), { target: { value: "2000-01-01" } });
		fireEvent.click(create);
		expect(await within(panel).findByText("The expiry must be in the future.")).toBeTruthy();
	});

	it("the create form is a form like the others: 720 px wide, one label style for fields and legends", async () => {
		const panel = await openKeys();
		await within(panel).findByText("No API keys yet.");
		const form = within(panel).getByRole("form", { name: "New API key" });
		expect(form.className).toBe("ca-form");
		const scopes = within(form).getByRole("group", { name: "Scopes" });
		expect(scopes.querySelector("legend")?.className).toBe("ca-field-label");
		expect(within(form).getByText("Label").className).toBe("ca-field-label");
	});
});
