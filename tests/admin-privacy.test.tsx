// @vitest-environment jsdom
/** Privacy receipt tab: the real receipt rendered, and the copy block is neutral, dash-free and copied verbatim. */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Data from "../src/admin/pages/Data.js";
import { FORBIDDEN_PUBLIC_WORDS } from "../src/contract.js";
import { privacyRoute, STATEMENT } from "../src/routes/privacy.js";
import { normalizeSettings } from "../src/settings.js";
import { MemoryKv, schemaDb } from "./helpers.js";

let receipt: unknown;
const writeText = vi.fn(async (_t: string) => undefined);
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
	writeText.mockClear();
	Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/data?from=2026-03-01&to=2026-03-07");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, timezone: "UTC" }] });
			if (route === "privacy/receipt") return ok(receipt);
			return ok({ items: [] });
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe.each(["none", "gpc", "dnt_and_gpc"])("privacy receipt with signals %s", (signals) => {
	it("renders the statement, salt, drops and tables, and copies a clean Markdown block", async () => {
		const env = await schemaDb();
		const kv = new MemoryKv();
		env.raw.prepare("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260224, 'privacy_signal', 4)").run();
		await kv.set("salt:2026-02-25", "x");
		receipt = await privacyRoute({ db: async () => env.db, settings: async () => normalizeSettings({ signals }), now: () => 1_772_000_000 }).handler({ kv });
		const markdown = (receipt as { markdown: string }).markdown;

		render(<Data />);
		fireEvent.click(await screen.findByRole("tab", { name: "Privacy receipt" }));
		const panel = screen.getByRole("tabpanel", { name: "Privacy receipt" });
		// The receipt is fetched when the tab opens: wait for it, then the rest is on the page.
		expect(await within(panel).findByText(STATEMENT)).toBeTruthy();
		// Panels like the Storage tab; the counts in a table with the number column on the right.
		for (const name of ["Statement", "Salt", "Requests not recorded", "What is stored", "For your privacy page"]) expect(within(panel).getByRole("region", { name }).className).toBe("ca-panel");
		const drops = within(panel).getByRole("table", { name: "Requests not recorded" });
		expect(within(drops).getByRole("row", { name: "Privacy signal of the browser (DNT or GPC) 4" })).toBeTruthy();
		expect(panel.textContent).toContain("Stored salts: 2026-02-25");
		expect(panel.textContent).toContain("ca_sessions");
		expect(panel.textContent).toContain("api_keys");

		const block = within(panel).getByLabelText("Markdown for your privacy page");
		expect(block.textContent).toBe(markdown);
		const lower = markdown.toLowerCase();
		for (const w of FORBIDDEN_PUBLIC_WORDS) expect(lower, w).not.toContain(w);
		expect(markdown).not.toMatch(/[\u2013\u2014]/);
		expect(panel.textContent).not.toMatch(/[\u2013\u2014]/);

		fireEvent.click(within(panel).getByRole("button", { name: "Copy Markdown" }));
		await within(panel).findByText("Copied.");
		expect(writeText).toHaveBeenCalledWith(markdown);
	});
});
