// @vitest-environment jsdom
/** Search page, Bing items: the Throttled notice with the next attempt, the file import in the Bing card, and the OAuth sign-in mode. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSearchStatus } from "../src/admin/api.js";
import Search from "../src/admin/pages/Search.js";

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const src = (id: "google" | "bing", o: Record<string, unknown> = {}) => ({ id, configured: true, auth: id === "bing" ? "apikey" : "oauth", property: id === "google" ? "sc-domain:example.com" : "https://example.com/", lastRun: "2026-03-12T07:00:00.000Z", status: "ok", message: null, throttleCode: null, nextAttempt: null, lastError: null, lastErrorAt: null, syncing: false, rows: 867, firstDay: "2026-03-01", lastDay: "2026-03-11", backfill: null, ...o });

describe("Search page, Bing", () => {
	let sources: Array<Record<string, unknown>> = [];
	const bodies: Array<[string, Record<string, unknown>]> = [];
	beforeEach(() => {
		resetSearchStatus();
		bodies.length = 0;
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?from=2026-03-01&to=2026-03-07");
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
				bodies.push([route, JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>]);
				if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, kind: "local", timezone: "UTC" }] });
				if (route === "search/status") return ok({ site: "main", kind: "local", sources, provisional: { from: "2026-03-10", to: "2026-03-12" } });
				if (route === "search/import") return ok({ site: "main", source: "bing", kind: "query", days: 2, rows: 14, skipped: 1, from: "2026-03-05", to: "2026-03-06" });
				if (route === "data/query") return ok({ report: "x", range: {}, compare: "none", compareRange: null, notices: [], data: { rows: [], series: [], totals: {} } });
				return ok({ items: [] });
			}),
		);
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("shows Throttled with the plain sentence, the code and the next attempt on top; the card keeps the last sync and the code", async () => {
		sources = [src("google"), src("bing", { status: "throttled", message: "Bing limits shared server addresses. The sync retries on the next scheduled run.", throttleCode: "ThrottleIP", nextAttempt: "2026-03-13T00:05:00.000Z" })];
		render(<Search />);
		const note = await screen.findByText(/Bing limits shared server addresses/);
		const box = note.closest("[role=status]") as HTMLElement;
		expect(box.textContent).toContain("Next attempt: 2026-03-13 00:05 UTC.");
		expect(box.textContent).toContain("ThrottleIP");
		expect(screen.queryByRole("alert")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Connections" }));
		const bing = screen.getByRole("group", { name: /Bing Webmaster Tools/ });
		expect(bing.getAttribute("data-state")).toBe("throttled");
		expect(within(bing).getByText("ThrottleIP").tagName).toBe("CODE");
		expect(within(bing).getByText("2026-03-12 07:00")).toBeTruthy();
		// Shown once, on top.
		expect(within(bing).queryByText(/Bing limits shared server addresses/)).toBeNull();
	});

	it("imports a Bing CSV through search/import and reports the result", async () => {
		sources = [src("google"), src("bing")];
		render(<Search />);
		fireEvent.click(await screen.findByRole("button", { name: "Connections" }));
		const toggle = screen.getByRole("button", { name: "Import Bing data from a file" });
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(toggle);
		const card = screen.getByRole("group", { name: /Bing Webmaster Tools/ });
		const text = "Keyword,Clicks,Impressions,Date\nblue widgets,4,40,2026-03-06\n";
		// jsdom's File has no text(); browsers do.
		const file = Object.assign(new File([text], "keywords.csv", { type: "text/csv" }), { text: async () => text });
		fireEvent.change(card.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
		fireEvent.click(within(card).getByRole("button", { name: "Import file" }));
		await within(card).findByText("Imported 14 query rows on 2 days (2026-03-05 to 2026-03-06); 1 rows skipped.");
		const sent = bodies.find(([r]) => r === "search/import")?.[1];
		expect(sent).toMatchObject({ source: "bing", csv: expect.stringContaining("blue widgets") });
	});

	it("offers the OAuth client with the redirect URI to copy", async () => {
		sources = [src("google"), src("bing", { configured: false, property: "" })];
		render(<Search />);
		// A healthy page keeps the connection cards in a closed Connections section.
		fireEvent.click(await screen.findByRole("button", { name: /Connections/ }));
		fireEvent.click(screen.getByRole("button", { name: "Connect Bing Webmaster Tools" }));
		const bing = await screen.findByRole("group", { name: /Bing Webmaster Tools/ });
		fireEvent.click(within(bing).getByRole("radio", { name: "OAuth client" }));
		expect(within(bing).getByText(/\/_emdash\/admin\/plugins\/cookieless-analytics\/search$/).tagName).toBe("CODE");
		expect(within(bing).getByLabelText("Bing client ID")).toBeTruthy();
		await waitFor(() => expect(within(bing).getByRole("button", { name: "Connect Bing" })).toBeTruthy());
	});
});
