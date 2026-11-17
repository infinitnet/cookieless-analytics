// @vitest-environment jsdom
/** Site list, site switcher and the site carried by every `data/query` call. */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE, queryReport } from "../src/admin/api.js";
import { SiteSwitcher } from "../src/admin/components/Header.js";
import { LOCAL_FALLBACK, loadSites, selectedSite } from "../src/admin/site.js";
import { siteRoutes } from "../src/routes/sites.js";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const local = { id: "main", label: "This site", local: true, timezone: "Europe/Berlin" };
const remote = { id: "shop", label: "Shop", local: false };

describe("sites/list route", () => {
	it("lists the local site with its timezone", async () => {
		const r = siteRoutes({ settings: async () => ({ siteId: "main", siteTimezone: "Europe/Berlin", siteOrigin: "" }) })["sites/list"];
		expect(r.permission).toBe("plugins:read");
		expect(await r.handler()).toEqual({ sites: [{ ...local, kind: "local" }] });
	});
});

describe("site list", () => {
	it("loads sites from the route", async () => {
		const fetch = vi.fn(async () => ok({ sites: [local, remote] }));
		vi.stubGlobal("fetch", fetch);
		expect(await loadSites()).toEqual([local, remote]);
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(`${API_BASE}sites/list`);
		expect(new Headers(init.headers).get("X-EmDash-Request")).toBe("1");
	});

	it("falls back to the static local entry when the route fails", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
		expect(await loadSites()).toEqual([LOCAL_FALLBACK]);
		expect(LOCAL_FALLBACK).toMatchObject({ id: "", local: true });
	});

	it("selects the URL site when listed, else the local site", () => {
		expect(selectedSite([local, remote], "shop", local)).toBe(remote);
		expect(selectedSite([local, remote], "gone", local)).toBe(local);
		expect(selectedSite([local], undefined, local)).toBe(local);
	});

	it("puts the selected site into the data/query body", async () => {
		const fetch = vi.fn(async () => ok({ report: "overview" }));
		vi.stubGlobal("fetch", fetch);
		await queryReport("shop", { report: "overview", query: { from: "2026-03-01", to: "2026-03-07" } });
		await queryReport("", { report: "overview", query: { from: "2026-03-01", to: "2026-03-07" } });
		const bodies = fetch.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
		expect(bodies[0]).toEqual({ report: "overview", query: { from: "2026-03-01", to: "2026-03-07", site: "shop" } });
		expect(bodies[1].query.site).toBeUndefined();
	});
});

describe("SiteSwitcher", () => {
	it("renders nothing with one site", () => {
		const { container } = render(<SiteSwitcher sites={[local]} value="main" onChange={() => {}} />);
		expect(container.innerHTML).toBe("");
	});

	it("renders a select with two sites", () => {
		const onChange = vi.fn();
		const { getByLabelText } = render(<SiteSwitcher sites={[local, remote]} value="main" onChange={onChange} />);
		const select = getByLabelText("Site") as HTMLSelectElement;
		expect([...select.options].map((o) => o.textContent)).toEqual(["All sites", "This site (this install)", "Shop (connected site)"]);
		fireEvent.change(select, { target: { value: "shop" } });
		expect(onChange).toHaveBeenCalledWith("shop");
	});
});
