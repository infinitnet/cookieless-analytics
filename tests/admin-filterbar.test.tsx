// @vitest-environment jsdom
/** FilterBar: chip add, operator switch, include and exclude, regex validation, save as segment. */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addFilter, addIs, chipText, FilterBar, regexError, toggleExclude, withBaseOp } from "../src/admin/components/FilterBar.js";
import type { Filter } from "../src/query/filters.js";
import { LineChart } from "../src/admin/components/Chart.js";
import { DataTable } from "../src/admin/components/DataTable.js";
import { DateRange } from "../src/admin/components/Header.js";

afterEach(cleanup);

/** Controlled bar that exposes the latest filters. */
function harness(initial: Filter[] = [], onSaveSegment?: (n: string) => void) {
	const seen: { filters: Filter[] } = { filters: initial };
	function H() {
		const [f, setF] = useState<Filter[]>(initial);
		seen.filters = f;
		return <FilterBar filters={f} onChange={setF} onSaveSegment={onSaveSegment} />;
	}
	return { seen, ...render(<H />) };
}

describe("filter helpers", () => {
	it("addIs creates a chip and merges values of the same dim", () => {
		let f = addIs([], "page", "/a");
		expect(f).toEqual([{ dim: "page", op: "is", values: ["/a"] }]);
		f = addIs(f, "page", "/b");
		f = addIs(f, "page", "/b");
		f = addIs(f, "country", "DE");
		expect(f).toEqual([
			{ dim: "page", op: "is", values: ["/a", "/b"] },
			{ dim: "country", op: "is", values: ["DE"] },
		]);
		// An exclude chip of the same dim is not merged into.
		expect(addIs([{ dim: "page", op: "is_not", values: ["/x"] }], "page", "/a")).toHaveLength(2);
	});

	it("switches operators and keeps include or exclude", () => {
		const f: Filter = { dim: "page", op: "is", values: ["/a"] };
		expect(withBaseOp(f, "prefix").op).toBe("prefix");
		expect(toggleExclude(f).op).toBe("is_not");
		expect(withBaseOp(toggleExclude(f), "contains").op).toBe("not_contains");
		expect(toggleExclude({ ...f, op: "not_regex" }).op).toBe("regex");
		expect(chipText({ ...f, op: "not_prefix", values: ["/blog", "/news"] })).toBe("Page not starts with /blog, /news");
	});

	it("validates regex like the server", () => {
		expect(regexError("^/blog/")).toBeNull();
		expect(regexError("(foo|bar)-\\d{1,3}")).toBeNull();
		expect(regexError("(a+)+")).toMatch(/nested|quantifier/i);
		expect(regexError("")).toBeNull();
	});
});

describe("FilterBar", () => {
	it("adds a chip from the form", () => {
		const { seen, getByLabelText, getByRole } = harness();
		fireEvent.change(getByLabelText("Dimension"), { target: { value: "country" } });
		fireEvent.change(getByLabelText("Value"), { target: { value: " DE " } });
		fireEvent.click(getByRole("button", { name: "Add filter" }));
		expect(seen.filters).toEqual([{ dim: "country", op: "is", values: ["DE"] }]);
		expect(getByRole("button", { name: "Remove Country is DE" })).toBeTruthy();
	});

	it("switches the operator and include or exclude from the chip menu, and removes a chip", () => {
		const { seen, getByLabelText, getByRole, container } = harness([{ dim: "page", op: "is", values: ["/blog"] }]);
		fireEvent.change(getByLabelText("Operator"), { target: { value: "prefix" } });
		expect(seen.filters[0]?.op).toBe("prefix");
		fireEvent.click(getByRole("button", { name: "Exclude" }));
		expect(seen.filters[0]?.op).toBe("not_prefix");
		expect(container.querySelector(".ca-chip")?.getAttribute("data-op")).toBe("not_prefix");
		fireEvent.click(getByRole("button", { name: "Include" }));
		expect(seen.filters[0]?.op).toBe("prefix");
		fireEvent.click(getByRole("button", { name: /^Remove/ }));
		expect(seen.filters).toEqual([]);
	});

	it("validates a regex live under Advanced and adds it only when safe", () => {
		const { seen, getByLabelText, getByRole, queryByRole } = harness();
		const advanced = getByRole("button", { name: "Advanced" });
		expect(advanced.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(advanced);
		expect(advanced.getAttribute("aria-expanded")).toBe("true");
		const input = getByLabelText("Regular expression");
		fireEvent.change(input, { target: { value: "(a+)+" } });
		expect(getByRole("alert").textContent).toBe(regexError("(a+)+"));
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(getByRole("button", { name: "Add regex" }).hasAttribute("disabled")).toBe(true);
		fireEvent.change(input, { target: { value: "^/blog/" } });
		expect(queryByRole("alert")).toBeNull();
		fireEvent.click(getByRole("button", { name: "Add regex" }));
		expect(seen.filters).toEqual([{ dim: "page", op: "regex", values: ["^/blog/"] }]);
	});

	it("saves the filters as a segment", () => {
		const save = vi.fn();
		const { getByLabelText, getByRole } = harness([{ dim: "page", op: "is", values: ["/a"] }], save);
		fireEvent.change(getByLabelText("Segment name"), { target: { value: "Blog readers" } });
		fireEvent.click(getByRole("button", { name: "Save as segment" }));
		expect(save).toHaveBeenCalledWith("Blog readers");
	});

	it("hides save as segment without filters", () => {
		expect(harness([], vi.fn()).queryByLabelText("Segment name")).toBeNull();
	});
});

describe("revenue chips", () => {
	it("Revenue at least adds one revenue gte filter; Currency adds an uppercase code; bad values add nothing", () => {
		expect(addFilter([], "revenue", "50")).toEqual([{ dim: "revenue", op: "gte", values: ["50"] }]);
		expect(addFilter([{ dim: "revenue", op: "gte", values: ["50"] }], "revenue", "100")).toEqual([{ dim: "revenue", op: "gte", values: ["100"] }]);
		expect(addFilter([], "revenue", "5,00")).toBeNull();
		expect(addFilter([], "currency", "eur")).toEqual([{ dim: "currency", op: "is", values: ["EUR"] }]);
		expect(addFilter([], "currency", "EURO")).toBeNull();
		expect(chipText({ dim: "revenue", op: "gte", values: ["50"] })).toBe("Revenue at least 50");
		expect(chipText({ dim: "revenue", op: "lt", values: ["50"], prop: "EUR" })).toBe("Revenue less than 50 EUR");
		expect(chipText({ dim: "currency", op: "is_not", values: ["EUR"] })).toBe("Currency not is EUR");
	});

	it("the add menu offers both; their chips have no operator menu, currency keeps Include and Exclude", () => {
		const { seen, getByLabelText, getByRole, container } = harness();
		const dim = getByLabelText("Dimension") as HTMLSelectElement;
		expect([...dim.options].map((o) => o.textContent)).toEqual(expect.arrayContaining(["Revenue at least", "Currency"]));
		expect([...(getByLabelText("Regex dimension") as HTMLSelectElement).options].map((o) => o.value)).not.toContain("revenue");
		fireEvent.change(dim, { target: { value: "revenue" } });
		fireEvent.change(getByLabelText("Value"), { target: { value: "100" } });
		fireEvent.click(getByRole("button", { name: "Add filter" }));
		fireEvent.change(dim, { target: { value: "currency" } });
		fireEvent.change(getByLabelText("Value"), { target: { value: "usd" } });
		fireEvent.click(getByRole("button", { name: "Add filter" }));
		expect(seen.filters).toEqual([
			{ dim: "revenue", op: "gte", values: ["100"] },
			{ dim: "currency", op: "is", values: ["USD"] },
		]);
		const chips = [...container.querySelectorAll(".ca-chip")];
		expect(chips.map((c) => c.querySelector("select"))).toEqual([null, null]);
		expect(chips[0]?.textContent).not.toContain("Exclude");
		fireEvent.click(chips[1]?.querySelector("button") as HTMLButtonElement);
		expect(seen.filters[1]).toEqual({ dim: "currency", op: "is_not", values: ["USD"] });
	});
});

describe("compare menu: another segment", () => {
	const segs = [
		{ id: "s1", data: { name: "Direct", filters: [] } },
		{ id: "s2", data: { name: "Organic", filters: [] } },
	];
	const state = { from: "2026-02-01", to: "2026-02-28", compare: "none" as const, filters: [], segment: "s1" };

	it("offers Another segment only with segments and picks a segment other than side A", () => {
		const onChange = vi.fn();
		const { getByLabelText, rerender, queryByRole } = render(<DateRange state={state} tz="UTC" onChange={onChange} segments={segs} />);
		fireEvent.change(getByLabelText("Compare"), { target: { value: "segment" } });
		expect(onChange).toHaveBeenCalledWith({ compare: "segment", cseg: "s2" });
		rerender(<DateRange state={{ ...state, compare: "segment", cseg: "s2" }} tz="UTC" onChange={onChange} segments={segs} />);
		fireEvent.change(getByLabelText("Compare with segment"), { target: { value: "s1" } });
		expect(onChange).toHaveBeenLastCalledWith({ cseg: "s1" });
		rerender(<DateRange state={state} tz="UTC" onChange={onChange} />);
		expect(queryByRole("option", { name: "Another segment" })).toBeNull();
	});

	it("draws side B dashed with both names in the legend, and tables show A, B and the difference", () => {
		const { container, getByText } = render(
			<LineChart label="Visitors" points={[{ t: "2026-02-01", v: 3 }, { t: "2026-02-02", v: 4 }]} compare={[1, 2]} names={["Direct", "Organic"]} />,
		);
		expect(container.querySelector('[data-compare="value"]')?.getAttribute("stroke-dasharray")).toBe("4 3");
		expect(container.querySelector('[data-legend="segments"]')?.textContent).toContain("Direct");
		// "Dashed" stays in the accessible text only.
		expect(container.querySelector('[data-legend="segments"]')?.textContent).toContain("Dashed lines: Organic");
		cleanup();
		const t = render(
			<DataTable label="Channels" columns={[{ key: "key", label: "Channel", format: "text" }, { key: "sessions", label: "Sessions" }]} rows={[{ key: "Direct", sessions: 10, previous: { sessions: 8 }, delta: { sessions: 0.25 } }]} compareNames={["Direct", "Organic"]} />,
		);
		expect(t.container.querySelector(".ca-side-b")?.textContent).toBe("Organic: 8");
		expect(t.container.querySelector(".ca-delta")?.textContent).toBeTruthy();
		t.getByText("Values of Direct, then Organic and the difference.");
	});
});
