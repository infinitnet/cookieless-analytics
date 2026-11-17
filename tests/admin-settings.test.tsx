// @vitest-environment jsdom
/** Settings page: sections from the URL, one section at a time, save per section with field errors, Search sign-in read only. The real settings routes run behind fetch. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings, { BUDGET_TEXT, SETTINGS_TEXT } from "../src/admin/pages/Settings.js";
import { KV_CURSOR } from "../src/query/retention.js";
import { settingsRoutes } from "../src/routes/settings.js";
import { normalizeSettings } from "../src/settings.js";
import { MemoryKv } from "./helpers.js";

type Body = Record<string, unknown>;
let stored: Record<string, unknown> = {};
let calls: Array<{ route: string; body: Body }> = [];
/** Databases of the install (null: every site in the EmDash database) and the Worker env with its `DB` binding. */
let targets: Array<{ binding: string | null }> | null = null;
let hostEnv: Record<string, unknown> | null = null;
let kv = new MemoryKv();
const routes = settingsRoutes({
	settings: async () => normalizeSettings(stored),
	facts: () => (targets ? { targets: () => targets as never } : null),
	workerEnv: async () => hostEnv,
});
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const store = {
	get: async (k: string) => stored[k] ?? null,
	set: async (k: string, v: unknown) => void (stored[k] = v),
	list: async () => Object.entries(stored).map(([key, value]) => ({ key, value })),
};

beforeEach(() => {
	targets = null;
	hostEnv = null;
	kv = new MemoryKv();
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
			return ok(await r.handler({ input: r.input.parse(body), settings: store, kv }));
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
		expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["General", "Page script", "Privacy and exclusions", "Sessions and engagement", "Revenue", "Annotations", "Search", "Search connections", "Data and capacity", "Limits and API"]);
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

	it("Test a link shows what the draft link rules do with a link", async () => {
		window.history.replaceState(null, "", "?tab=script");
		render(<Settings />);
		fireEvent.change(await screen.findByLabelText("Link rules"), { target: { value: "/go/ out\n~^/recommends/([^/]+) out\nmailto: contact email\nads.example.com/ -" } });
		const test = screen.getByLabelText(SETTINGS_TEXT.linkTest);
		const result = () => test.parentElement?.querySelector(".ca-help")?.textContent;
		expect(result()).toBe("");
		fireEvent.change(test, { target: { value: "/recommends/beta-tool" } });
		expect(result()).toBe("Rule 2 matches: sends out with slug beta-tool.");
		fireEvent.change(test, { target: { value: "https://ads.example.com/x" } });
		expect(result()).toBe("Rule 4 matches: nothing is sent.");
		fireEvent.change(test, { target: { value: "https://other.example.org/x" } });
		expect(result()).toBe(SETTINGS_TEXT.linkNone);
		fireEvent.change(screen.getByLabelText("Short link path prefixes"), { target: { value: "/go/" } });
		fireEvent.change(test, { target: { value: "/go/alpha" } });
		expect(result()).toBe(SETTINGS_TEXT.linkSkipped);
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

	describe("storage budget", () => {
		/** The warning under the budget field: its tone and which text, or "" for none. */
		const note = () => {
			const t = Object.entries(BUDGET_TEXT).find(([k, v]) => typeof v === "string" && k !== "range" && screen.queryByText(v));
			return t ? `${screen.getByText(t[1] as string).closest("[data-tone]")?.getAttribute("data-tone")}:${t[0]}` : "";
		};
		const typeBudget = (v: number) => fireEvent.change(screen.getByLabelText("Storage budget"), { target: { value: String(v) } });
		const open = async () => {
			window.history.replaceState(null, "", "?tab=data");
			render(<Settings />);
			await screen.findByLabelText("Storage budget");
		};

		it("shows the range in the EmDash database and each warning above its threshold, as the value changes", async () => {
			await open();
			expect(screen.getByText(BUDGET_TEXT.range(6000, 100, 9000))).toBeTruthy();
			expect(BUDGET_TEXT.range(6000, 100, 9000)).toBe("Here 0 means 6000 MB; other values from 100 to 9000 MB.");
			expect(note()).toBe("");
			for (const [v, want] of [
				[6000, ""],
				[6001, "warning:hostCaution"],
				[8000, "warning:hostCaution"],
				[8001, "error:hostStrong"],
				[0, ""],
			] as const) {
				typeBudget(v);
				expect(note(), String(v)).toBe(want);
			}
			// The Small profile, chosen in the same draft: its range and its two levels.
			fireEvent.click(screen.getByRole("radio", { name: "Small (Workers Free)" }));
			expect(screen.getByText(BUDGET_TEXT.range(300, 50, 450))).toBeTruthy();
			for (const [v, want] of [
				[300, ""],
				[301, "warning:smallCaution"],
				[400, "warning:smallCaution"],
				[401, "error:smallStrong"],
			] as const) {
				typeBudget(v);
				expect(note(), String(v)).toBe(want);
			}
		});

		it("an own D1 database: up to 9500 MB, a warning above 9000", async () => {
			targets = [{ binding: "CA_DB" }];
			await open();
			expect(screen.getByText(BUDGET_TEXT.range(6000, 100, 9500))).toBeTruthy();
			for (const [v, want] of [
				[9000, ""],
				[9001, "warning:ownCaution"],
				[9500, "warning:ownCaution"],
			] as const) {
				typeBudget(v);
				expect(note(), String(v)).toBe(want);
			}
		});

		it("budget plus the rest of the EmDash database above 9500 MB is the strong warning at any value", async () => {
			// 4.6 GB in total through env.DB, 1 GB of it analytics by the last estimate: 3600 MB of content.
			hostEnv = { DB: { prepare: () => ({ bind: () => ({ run: async () => ({ results: [], meta: { size_after: 4.6e9 } }) }) }), batch: async () => [] } };
			await kv.set(KV_CURSOR, { day: "2026-03-07", step: 0, rawDays: 760, capped: false, storage: { profile: "standard", budget: 6e9, bytes: 1e9, detail: 0.8e9, summary: 0.2e9, rawDays: 760, capped: false }, deleted: {} });
			await open();
			expect(calls.find((c) => c.route === "settings/get")).toBeTruthy();
			// The default 6000 already passes 9500 with the content.
			expect(note()).toBe("error:hostStrong");
			typeBudget(5900);
			expect(note()).toBe("");
			typeBudget(5901);
			expect(note()).toBe("error:hostStrong");
		});
	});
});
