// @vitest-environment jsdom
/** Dashboard widget: today against yesterday, realtime, top page, link to the reports. */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayInZone } from "../src/core/time.js";
import TodayWidget, { DASHBOARD_HREF } from "../src/admin/widget.js";
import { PLUGIN_ID } from "../src/contract.js";

type Body = { report: string; query: Record<string, unknown>; limit?: number };
let calls: Body[] = [];
let fail = false;
let prevTotals: Record<string, unknown> | null = { visitors: 8, pageviews: 40 };
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
	calls = [];
	fail = false;
	prevTotals = { visitors: 8, pageviews: 40 };
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			if (url.endsWith("sites/list")) return ok({ sites: [{ id: "main", label: "This site", local: true, timezone: "Pacific/Auckland" }] });
			const body = JSON.parse(String(init.body)) as Body;
			calls.push(body);
			if (fail) return new Response(JSON.stringify({ error: { code: "x", message: "Query failed." } }), { status: 500 });
			if (body.report === "overview") return ok({ data: { totals: { visitors: 12, pageviews: 30 }, compareTotals: prevTotals, realtime: 2 }, notices: [] });
			return ok({ data: { rows: [{ key: "/hello", pageviews: 9 }] }, notices: [] });
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("TodayWidget", () => {
	it("shows no change and no orphan label when yesterday has no figure or the same one", async () => {
		prevTotals = { visitors: null, pageviews: 30 };
		const { container } = render(<TodayWidget />);
		await waitFor(() => expect(container.querySelector('[data-metric="visitors"]')?.textContent).toContain("12"));
		expect(container.textContent).not.toContain("vs yesterday");
		expect(container.querySelector(".ca-delta")).toBeNull();
	});

	it("compares today with yesterday in the site timezone and shows realtime and the top page", async () => {
		const { container, findByText } = render(<TodayWidget />);
		expect(await findByText("Top page today: /hello (9)")).toBeTruthy();
		await waitFor(() => expect(container.querySelector('[data-metric="visitors"]')?.textContent).toContain("12"));
		expect(container.querySelector('[data-metric="visitors"]')?.textContent).toContain("\u2191+4 better vs yesterday");
		// 8 visitors yesterday is small numbers: muted.
		expect(container.querySelector('[data-metric="visitors"] .ca-delta')?.getAttribute("data-muted")).toBe("true");
		expect(container.querySelector('[data-metric="pageviews"] .ca-delta')?.getAttribute("data-judge")).toBe("worse");
		expect(container.querySelector('[data-metric="pageviews"]')?.textContent).toContain("\u2193-25.0% worse vs yesterday");
		expect(container.querySelector('[data-metric="realtime"]')?.textContent).toContain("2");
		const today = dayInZone(Math.floor(Date.now() / 1000), "Pacific/Auckland");
		const ov = calls.find((c) => c.report === "overview");
		expect(ov?.query).toEqual({ from: today, to: today, filters: [], compare: "previous" });
		const top = calls.find((c) => c.report === "pages");
		expect(top).toMatchObject({ limit: 1, query: { from: today, to: today, compare: "none" } });
		// Always the local site: no `site` in the body.
		for (const c of calls) expect(c.query.site).toBeUndefined();
		expect(container.querySelector("a")?.getAttribute("href")).toBe(DASHBOARD_HREF);
		expect(DASHBOARD_HREF).toBe(`/_emdash/admin/plugins/${PLUGIN_ID}/`);
	});

	it("shows the error and keeps the link", async () => {
		fail = true;
		const { findByRole, container } = render(<TodayWidget />);
		expect((await findByRole("alert")).textContent).toBe("Query failed.");
		expect(container.querySelector("a")?.textContent).toBe("Open the reports");
	});
});
