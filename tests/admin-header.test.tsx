// @vitest-environment jsdom
/** Header and shell: controls per page, From and To only for Custom, the collapsed summary line, the live badge. */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateRange, headSummary, Shell, useShellHead, type Controls } from "../src/admin/components/Header.js";
import { presetRange, type QueryState } from "../src/admin/state.js";
import type { SiteEntry } from "../src/routes/sites.js";

const SITES: SiteEntry[] = [
	{ id: "main", label: "Main site", local: true, kind: "local", timezone: "UTC" },
	{ id: "blog", label: "Blog", local: false, kind: "client", timezone: "UTC" },
];
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const base: QueryState = { from: "2026-03-01", to: "2026-03-14", compare: "none", filters: [] };

beforeEach(() => {
	window.sessionStorage.clear();
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/config?from=2026-03-01&to=2026-03-14");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			const route = url.split("/").slice(-2).join("/");
			if (route === "sites/list") return ok({ sites: SITES });
			return ok({ items: [] });
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("headSummary", () => {
	it("names a preset, the comparison, the segment and the filter count; the site only when given", () => {
		const r = presetRange("7d", "UTC");
		expect(headSummary({ ...base, ...r, compare: "previous" }, "UTC", null, null)).toBe("Last 7 days, vs previous period");
		const f = [{ dim: "country" as const, op: "is" as const, values: ["DE"] }];
		expect(headSummary({ ...base, filters: f }, "UTC", "Blog", "Mobile")).toBe("Blog, 2026-03-01 to 2026-03-14, Mobile, 1 filter");
		expect(headSummary({ ...base, compare: "year", filters: [...f, ...f] }, "UTC", null, null)).toBe("2026-03-01 to 2026-03-14, vs same period last year, 2 filters");
	});

});

describe("DateRange", () => {
	it("shows the resolved range as text for a preset, and From and To only for Custom", () => {
		const onChange = vi.fn();
		const r = presetRange("7d", "UTC");
		const { queryByLabelText, getByLabelText, getByText } = render(<DateRange state={{ ...base, ...r }} tz="UTC" onChange={onChange} />);
		expect(queryByLabelText("From")).toBeNull();
		expect(queryByLabelText("To")).toBeNull();
		expect(getByText(`${r.from} to ${r.to}`)).toBeTruthy();
		fireEvent.change(getByLabelText("Date range"), { target: { value: "custom" } });
		expect((getByLabelText("Date range") as HTMLSelectElement).value).toBe("custom");
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.change(getByLabelText("From"), { target: { value: "2026-01-01" } });
		expect(onChange).toHaveBeenCalledWith({ from: "2026-01-01" });
		fireEvent.change(getByLabelText("Date range"), { target: { value: "30d" } });
		expect(queryByLabelText("From")).toBeNull();
	});

	it("opens From and To for a range that matches no preset", () => {
		const { getByLabelText } = render(<DateRange state={base} tz="UTC" onChange={() => {}} />);
		expect((getByLabelText("Date range") as HTMLSelectElement).value).toBe("custom");
		expect((getByLabelText("From") as HTMLInputElement).value).toBe("2026-03-01");
	});
});

function Live({ n, controls }: { n?: number; controls?: Controls }) {
	useShellHead({ live: n, controls });
	return <p>body</p>;
}

describe("Shell", () => {
	it("full: every control plus a summary toggle whose open state lives in the session", async () => {
		const { findByLabelText, getByRole, getByLabelText, container } = render(<Shell title="Overview">{() => <p>body</p>}</Shell>);
		await findByLabelText("Site");
		expect(getByLabelText("Date range")).toBeTruthy();
		expect(container.querySelector(".ca-filterbar")).not.toBeNull();
		const toggle = getByRole("button", { name: "Main site, 2026-03-01 to 2026-03-14" });
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(container.querySelector(".ca-header")?.getAttribute("data-open")).toBe("false");
		fireEvent.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(window.sessionStorage.getItem("ca.head.open.v1")).toBe("true");
		// The page head does not repeat the site the select already names.
		expect(container.querySelector(".ca-page-head .ca-sub")).toBeNull();
	});

	it("site: the site select only, no range, filters or toggle", async () => {
		const { findByLabelText, queryByLabelText, container } = render(
			<Shell title="Definitions" controls="site">
				{() => <p>body</p>}
			</Shell>,
		);
		await findByLabelText("Site");
		expect(queryByLabelText("Date range")).toBeNull();
		expect(container.querySelector(".ca-filterbar")).toBeNull();
		expect(container.querySelector(".ca-head-toggle")).toBeNull();
		expect(container.querySelector(".ca-header")?.getAttribute("data-open")).toBe("true");
	});

	it("none: no header, the page head names the site", async () => {
		const { findByText, container } = render(
			<Shell title="Data" controls="none">
				{() => <p>body</p>}
			</Shell>,
		);
		await findByText("body");
		expect(container.querySelector(".ca-header")).toBeNull();
		expect(container.querySelector(".ca-page-head .ca-sub")?.textContent).toBe("Main site");
	});

	it("a page body sets the live badge and narrows the controls while mounted", async () => {
		const { findByText, container, rerender } = render(<Shell title="Overview">{() => <Live n={1234} />}</Shell>);
		expect((await findByText(/active now/)).textContent).toBe("1,234 active now");
		expect(container.querySelector(".ca-filterbar")).not.toBeNull();
		rerender(<Shell title="Overview">{() => <Live controls="site" />}</Shell>);
		await waitFor(() => expect(container.querySelector(".ca-filterbar")).toBeNull());
		expect(container.querySelector(".ca-live")).toBeNull();
		rerender(<Shell title="Overview">{() => <p>body</p>}</Shell>);
		await waitFor(() => expect(container.querySelector(".ca-filterbar")).not.toBeNull());
	});
});
