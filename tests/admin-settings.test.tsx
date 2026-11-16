// @vitest-environment jsdom
/** Settings page: sections from the URL, one section at a time, save per section with field errors, Search sign-in read only. The real settings routes run behind fetch. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings, { SETTINGS_TEXT } from "../src/admin/pages/Settings.js";
import { settingsRoutes } from "../src/routes/settings.js";
import { normalizeSettings } from "../src/settings.js";

type Body = Record<string, unknown>;
let stored: Record<string, unknown> = {};
let calls: Array<{ route: string; body: Body }> = [];
const routes = settingsRoutes({ settings: async () => normalizeSettings(stored) });
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const store = {
	get: async (k: string) => stored[k] ?? null,
	set: async (k: string, v: unknown) => void (stored[k] = v),
	list: async () => Object.entries(stored).map(([key, value]) => ({ key, value })),
};

beforeEach(() => {
	stored = { gscAuth: "oauth", gscClientId: "client.example.com", gscClientSecret: "never-echo", gscProperty: "sc-domain:example.com" };
	calls = [];
	window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/settings");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			const r = routes[route as keyof typeof routes];
			return ok(await r.handler({ input: r.input.parse(body), settings: store }));
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("Settings page", () => {
	it("opens the section named in the URL, lists every section and shows one at a time", async () => {
		window.history.replaceState(null, "", "?tab=privacy");
		render(<Settings />);
		expect(await screen.findByRole("heading", { level: 2, name: "Privacy and exclusions" })).toBeTruthy();
		const nav = screen.getByRole("navigation", { name: "Settings sections" });
		expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["General", "Page script", "Privacy and exclusions", "Sessions and engagement", "Revenue", "Search", "Search connections", "Data and capacity", "Limits and API"]);
		expect(within(nav).getByRole("button", { name: "Privacy and exclusions" }).getAttribute("aria-current")).toBe("page");
		expect(screen.queryByLabelText("Site timezone")).toBeNull();
		expect(screen.getAllByRole("form")).toHaveLength(1);
	});

	it("a section change is a history step, and Back returns to the previous section", async () => {
		render(<Settings />);
		await screen.findByRole("heading", { level: 2, name: "General" });
		const push = vi.spyOn(window.history, "pushState");
		fireEvent.click(screen.getByRole("button", { name: "Sessions and engagement" }));
		expect(push).toHaveBeenCalledTimes(1);
		expect(location.search).toBe("?tab=sessions");
		expect(screen.getByRole("heading", { level: 2, name: "Sessions and engagement" })).toBeTruthy();
		window.history.replaceState(null, "", "?tab=general");
		window.dispatchEvent(new PopStateEvent("popstate"));
		expect(await screen.findByRole("heading", { level: 2, name: "General" })).toBeTruthy();
		// The section select (shown under 640px) moves too.
		fireEvent.change(screen.getByLabelText("Section"), { target: { value: "limits" } });
		expect(screen.getByRole("heading", { level: 2, name: "Limits and API" })).toBeTruthy();
	});

	it("saves only the changed keys of the section and says so", async () => {
		window.history.replaceState(null, "", "?tab=sessions");
		render(<Settings />);
		const input = (await screen.findByLabelText("Session window")) as HTMLInputElement;
		expect(input.value).toBe("30");
		fireEvent.change(input, { target: { value: "45" } });
		expect(screen.getByRole("status").textContent).toBe(SETTINGS_TEXT.changed);
		expect(screen.getByText("Default: 30 minutes.", { exact: false })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Save Sessions and engagement" }));
		await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SETTINGS_TEXT.saved));
		expect(calls.find((c) => c.route === "settings/save")?.body).toEqual({ values: { sessionWindowMinutes: 45 } });
		expect(stored.sessionWindowMinutes).toBe(45);
		expect(stored.gscAuth).toBe("oauth");
	});

	it("shows a refused value under its field, opens Advanced for it and saves nothing", async () => {
		window.history.replaceState(null, "", "?tab=sessions");
		render(<Settings />);
		fireEvent.click(await screen.findByRole("button", { name: "Advanced" }));
		fireEvent.change(screen.getByLabelText("Maximum engaged time per page"), { target: { value: "500" } });
		fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
		fireEvent.change(screen.getByLabelText("Long click"), { target: { value: "20" } });
		fireEvent.change(screen.getByLabelText("Bad experience"), { target: { value: "30" } });
		fireEvent.click(screen.getByRole("button", { name: "Save Sessions and engagement" }));
		expect(await screen.findByText(SETTINGS_TEXT.refused(2))).toBeTruthy();
		expect(screen.getByText("Use a whole number from 1 to 120.")).toBeTruthy();
		expect(screen.getByText("Not above the long click time (20 seconds).")).toBeTruthy();
		expect(screen.getByLabelText("Maximum engaged time per page").getAttribute("aria-invalid")).toBe("true");
		expect(stored.maxEngagedMsPerPage).toBeUndefined();
		expect(stored.badExperienceSeconds).toBeUndefined();
		expect(stored.longClickSeconds).toBeUndefined();
	});

	it("hides a field while the switch it depends on is off", async () => {
		window.history.replaceState(null, "", "?tab=script");
		render(<Settings />);
		expect(await screen.findByLabelText("Download extensions")).toBeTruthy();
		fireEvent.click(screen.getByLabelText("Download events"));
		expect(screen.queryByLabelText("Download extensions")).toBeNull();
		expect(screen.getByRole("navigation").querySelector(".ca-set-dot")).toBeTruthy();
	});

	it("an invalid draft hidden by its switch is not sent and does not block the save", async () => {
		window.history.replaceState(null, "", "?tab=script");
		render(<Settings />);
		fireEvent.change(await screen.findByLabelText("Download extensions"), { target: { value: "not a list !!" } });
		fireEvent.click(screen.getByLabelText("Download events"));
		fireEvent.click(screen.getByRole("button", { name: "Save Page script" }));
		await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SETTINGS_TEXT.saved));
		const sent = calls.find((c) => c.route === "settings/save")?.body.values as Record<string, unknown>;
		expect(Object.keys(sent)).not.toContain("downloadExtensions");
		expect(stored.downloadExtensions).toBeUndefined();
	});

	it("disables Save while a save runs", async () => {
		window.history.replaceState(null, "", "?tab=sessions");
		let release: () => void = () => {};
		const gate = new Promise<void>((r) => (release = r));
		const real = globalThis.fetch;
		vi.stubGlobal("fetch", async (url: string, init: RequestInit) => (String(url).endsWith("settings/save") && (await gate), real(url, init)));
		render(<Settings />);
		fireEvent.change(await screen.findByLabelText("Session window"), { target: { value: "45" } });
		const save = screen.getByRole("button", { name: "Save Sessions and engagement" });
		fireEvent.click(save);
		await waitFor(() => expect(save).toHaveProperty("disabled", true));
		release();
		await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SETTINGS_TEXT.saved));
		expect(save).toHaveProperty("disabled", false);
	});

	it("shows Search sign-in read only, secrets as Set or Not set, with the way to the Search page", async () => {
		window.history.replaceState(null, "", "?tab=connections");
		render(<Settings />);
		await screen.findByRole("heading", { level: 2, name: "Search connections" });
		expect(document.body.textContent).not.toContain("never-echo");
		expect(screen.getByRole("link", { name: "Open Search connections" }).getAttribute("href")).toBe("/_emdash/admin/plugins/cookieless-analytics/search");
		const row = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
		expect(row("Google OAuth client secret")).toBe("Set");
		expect(row("Google refresh token")).toBe("Not set");
		expect(row("Google Search Console")).toBe("OAuth client");
		expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
		expect(screen.queryByRole("textbox")).toBeNull();
	});
});
