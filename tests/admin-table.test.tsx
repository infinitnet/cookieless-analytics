// @vitest-environment jsdom
/** DataTable: sorting, click-to-filter, paging, deltas, empty state, empty columns, one tab stop, column choice. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Column, DataTable, type TableRow, useColumns } from "../src/admin/components/DataTable.js";
import { KebabMenu } from "../src/admin/components/ui.js";

// Node's own `localStorage` global hides jsdom's under vitest; a plain in-memory Storage stands in.
const memoryStorage = (): Storage => {
	const m = new Map<string, string>();
	return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const columns = [
	{ key: "key", label: "Page", format: "text" as const, dim: "page" as const },
	{ key: "visitors", label: "Visitors" },
	{ key: "bounce_rate", label: "Bounce rate", format: "percent" as const },
];
const rows: TableRow[] = [
	{ key: "/a", visitors: 5, bounce_rate: 0.5, previous: { visitors: 4, bounce_rate: 0.6 } },
	{ key: "/b", visitors: 12, bounce_rate: 0.2, previous: null },
	{ key: "/c", visitors: 1, bounce_rate: null },
];
const firstCol = (c: HTMLElement) => [...c.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent);

describe("DataTable", () => {
	it("names each column's info button after the column and keeps it out of the header's name; columns without info have none", () => {
		const cols: Column[] = [columns[0] as Column, { key: "visitors", label: "Visitors", info: "Distinct visitors per day." }, { key: "bounce_rate", label: "Bounce rate", format: "percent" }];
		const { getByRole, getAllByRole } = render(<DataTable label="Pages" columns={cols} rows={rows} />);
		expect(getByRole("columnheader", { name: "Visitors" })).toBeTruthy();
		expect(getByRole("columnheader", { name: "Bounce rate" })).toBeTruthy();
		const info = getByRole("button", { name: "About Visitors" });
		expect(info.getAttribute("title")).toBe("Distinct visitors per day.");
		// One info button for the one column with a definition: header tab stops are the sort buttons plus it.
		const head = getAllByRole("columnheader");
		expect(head.flatMap((h) => [...h.querySelectorAll("button")]).map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Page", "Visitors", "About Visitors", "Bounce rate"]);
	});

	it("keeps the server order until a header is clicked, then sorts descending and ascending", () => {
		const { container, getByRole } = render(<DataTable label="Pages" columns={columns} rows={rows} />);
		expect(firstCol(container)).toEqual(["/a", "/b", "/c"]);
		fireEvent.click(getByRole("button", { name: "Visitors" }));
		expect(firstCol(container)).toEqual(["/b", "/a", "/c"]);
		expect(container.querySelector('th[aria-sort="descending"]')?.textContent).toContain("Visitors");
		fireEvent.click(getByRole("button", { name: /Visitors/ }));
		expect(firstCol(container)).toEqual(["/c", "/a", "/b"]);
		fireEvent.click(getByRole("button", { name: "Bounce rate" }));
		expect(firstCol(container)).toEqual(["/a", "/b", "/c"]);
	});

	it("a column's info text shows as the info mark of its header", () => {
		const cols: Column[] = [columns[0] as Column, { key: "visitors", label: "Visitors", info: "Visitors of the page." }, columns[2] as Column];
		const { container } = render(<DataTable label="Pages" columns={cols} rows={rows} />);
		const marks = [...container.querySelectorAll("thead th")].map((th) => th.querySelector(".ca-info-btn")?.getAttribute("title") ?? null);
		expect(marks).toEqual([null, "Visitors of the page.", null]);
	});

	it("quiet rows show muted and sort last in both directions on their column only; other columns and tables sort as before", () => {
		const scored: TableRow[] = [
			{ key: "/a", score: 30, sessions: 4, low_sample: true },
			{ key: "/b", score: 10, sessions: 50, low_sample: false },
			{ key: "/c", score: -20, sessions: 60, low_sample: false },
			{ key: "/d", score: 50, sessions: 3, low_sample: true },
		];
		const quiet = (r: TableRow) => r.low_sample === true;
		const cols: Column[] = [
			{ key: "key", label: "Page", format: "text" },
			{ key: "score", label: "Score", quiet, note: (r) => (quiet(r) ? "low sample" : "") },
			{ key: "sessions", label: "Sessions" },
		];
		const { container, getByRole } = render(<DataTable label="Pages" columns={cols} rows={scored} />);
		const scoreCells = [...container.querySelectorAll("tbody tr")].map((tr) => tr.querySelectorAll("td")[1] as HTMLElement);
		expect(scoreCells.map((td) => td.getAttribute("data-quiet"))).toEqual(["true", null, null, "true"]);
		expect(scoreCells.map((td) => td.classList.contains("ca-muted"))).toEqual([true, false, false, true]);
		expect(scoreCells.map((td) => td.querySelector(".ca-cell-note")?.textContent ?? null)).toEqual(["low sample", null, null, "low sample"]);
		fireEvent.click(getByRole("button", { name: "Score" }));
		expect(firstCol(container)).toEqual(["/b", "/c", "/d", "/a"]);
		fireEvent.click(getByRole("button", { name: /Score/ }));
		expect(firstCol(container)).toEqual(["/c", "/b", "/a", "/d"]);
		// Sessions has no quiet rule: plain order.
		fireEvent.click(getByRole("button", { name: "Sessions" }));
		expect(firstCol(container)).toEqual(["/c", "/b", "/a", "/d"]);
		fireEvent.click(getByRole("button", { name: /Sessions/ }));
		expect(firstCol(container)).toEqual(["/d", "/a", "/b", "/c"]);
		cleanup();
		// The same rows in a table without the rule sort by value alone.
		const plain = render(<DataTable label="Plain" columns={cols.map(({ quiet: _q, ...c }) => c)} rows={scored} />);
		fireEvent.click(plain.getByRole("button", { name: "Score" }));
		expect(firstCol(plain.container)).toEqual(["/d", "/a", "/b", "/c"]);
	});

	it("aligns by column type: text columns left, number columns right", () => {
		const cols: Column[] = [...columns, { key: "channel", label: "Channel", format: "text" }];
		const { container } = render(<DataTable label="Pages" columns={cols} rows={rows.map((r) => ({ ...r, channel: "Direct" }))} />);
		const classes = (sel: string) => [...container.querySelectorAll(sel)].map((el) => el.className);
		expect(classes("thead th")).toEqual(["", "ca-num", "ca-num", ""]);
		expect(classes("tbody tr:first-child td")).toEqual(["", "ca-num", "ca-num", ""]);
	});

	it("adds an is filter when a value is clicked", () => {
		const onFilter = vi.fn();
		const { getByRole } = render(<DataTable label="Pages" columns={columns} rows={rows} onFilter={onFilter} />);
		fireEvent.click(getByRole("button", { name: "/b" }));
		expect(onFilter).toHaveBeenCalledWith("page", "/b");
	});

	it("offers no filter on (not set), which is NULL on the server", () => {
		const { queryByRole, getByText } = render(<DataTable label="Countries" columns={columns} rows={[{ key: "(not set)", visitors: 2 }]} onFilter={vi.fn()} />);
		expect(getByText("(not set)").tagName).toBe("TD");
		expect(queryByRole("button", { name: "(not set)" })).toBeNull();
	});

	it("renders a row action after the columns", () => {
		const onClick = vi.fn();
		const { getByRole } = render(<DataTable label="Pages" columns={columns} rows={rows} action={{ label: "Queries", onClick }} />);
		fireEvent.click(getByRole("button", { name: "Queries: /b" }));
		expect(onClick).toHaveBeenCalledWith(rows[1]);
	});

	it("formats values and shows compare deltas with the right tone", () => {
		const { container } = render(<DataTable label="Pages" columns={columns} rows={rows} />);
		const first = container.querySelector("tbody tr") as HTMLElement;
		expect(first.textContent).toBe("/a5\u2191+1 better50.0%\u2193-10.0 pp better");
		const deltas = [...first.querySelectorAll(".ca-delta")] as HTMLElement[];
		// 4 visitors before is small numbers: muted, no colour, the plain difference instead of a percent; a lower bounce rate is good, in percentage points.
		expect(deltas.map((d) => d.getAttribute("data-judge"))).toEqual([null, "better"]);
		expect(deltas.map((d) => d.getAttribute("data-muted"))).toEqual(["true", null]);
		// A row with no previous row shows no change.
		expect(container.querySelectorAll("tbody tr")[1]?.querySelector(".ca-delta")).toBeNull();
		expect(container.querySelectorAll("tbody tr")[2]?.textContent).toBe("/c1-");
	});

	it("pages through rows and notes truncation", () => {
		const many = Array.from({ length: 5 }, (_, i) => ({ key: `/p${i}`, visitors: 10 - i, bounce_rate: 0 }));
		const { container, getByRole, getByText } = render(<DataTable label="Pages" columns={columns} rows={many} pageSize={2} truncated />);
		expect(firstCol(container)).toEqual(["/p0", "/p1"]);
		const pager = container.querySelector(".ca-pager") as HTMLElement;
		expect(within(pager).getByText("Page 1 of 3")).toBeTruthy();
		expect(getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
		fireEvent.click(getByRole("button", { name: "Next" }));
		fireEvent.click(getByRole("button", { name: "Next" }));
		expect(firstCol(container)).toEqual(["/p4"]);
		expect(getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
		expect(getByText(/More rows exist/)).toBeTruthy();
	});

	it("goes back to the first page on a new sort or new rows", () => {
		const many = Array.from({ length: 5 }, (_, i) => ({ key: `/p${i}`, visitors: 10 - i, bounce_rate: 0 }));
		const { container, getByRole, rerender } = render(<DataTable label="Pages" columns={columns} rows={many} pageSize={2} />);
		fireEvent.click(getByRole("button", { name: "Next" }));
		fireEvent.click(getByRole("button", { name: "Visitors" }));
		expect(firstCol(container)).toEqual(["/p0", "/p1"]);
		fireEvent.click(getByRole("button", { name: "Next" }));
		rerender(<DataTable label="Pages" columns={columns} rows={many.slice(1)} pageSize={2} />);
		expect(firstCol(container)).toEqual(["/p1", "/p2"]);
	});

	it("shows loading instead of the empty state while rows load", () => {
		expect(render(<DataTable label="Pages" columns={columns} rows={[]} loading />).getByText("Loading")).toBeTruthy();
	});

	it("shows the empty state", () => {
		const { container, getByText } = render(<DataTable label="Pages" columns={columns} rows={[]} />);
		expect(container.querySelector("table")).toBeNull();
		expect(getByText("No data for this range and these filters.")).toBeTruthy();
	});

	it("leaves out a column with no value in any row, keeps the first column and a column with side B values", () => {
		const cols: Column[] = [...columns, { key: "revenue", label: "Revenue" }, { key: "orders", label: "Orders" }];
		const r: TableRow[] = [
			{ key: "", visitors: 1, revenue: null, orders: null, previous: { orders: 3 } },
			{ key: "", visitors: 2, revenue: "", bounce_rate: 0.5 },
		];
		const { container } = render(<DataTable label="Pages" columns={cols} rows={r} />);
		expect([...container.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Page", "Visitors", "Bounce rate", "Orders"]);
	});

	it("is one tab stop; arrow keys, Home and End move between the controls of the body", () => {
		const r: TableRow[] = [{ key: "/a", visitors: 1 }, { key: "(not set)", visitors: 2 }, { key: "/c", visitors: 3 }];
		const open = vi.fn();
		const { container } = render(<DataTable label="Pages" columns={columns} rows={r} onFilter={vi.fn()} action={{ label: "Queries", onClick: open }} />);
		const tbody = container.querySelector("tbody") as HTMLElement;
		const stops = () => [...tbody.querySelectorAll<HTMLElement>("[tabindex='0']")];
		expect(stops()).toHaveLength(1);
		const rows = [...tbody.querySelectorAll("tr")] as HTMLElement[];
		expect(stops()[0]).toBe(rows[0]);
		act(() => rows[0]?.focus());
		fireEvent.keyDown(rows[0] as HTMLElement, { key: "ArrowRight" });
		const a = within(rows[0] as HTMLElement).getByRole("button", { name: "/a" });
		expect(document.activeElement).toBe(a);
		expect(stops()).toEqual([a]);
		// Down from the value: the (not set) row has no filter, so the focus lands on its row, the nearest control.
		fireEvent.keyDown(a, { key: "ArrowDown" });
		expect(document.activeElement).toBe(rows[1]);
		fireEvent.keyDown(rows[1] as HTMLElement, { key: "ArrowDown" });
		expect(document.activeElement).toBe(rows[2]);
		fireEvent.keyDown(rows[2] as HTMLElement, { key: "End" });
		expect(document.activeElement).toBe(within(rows[2] as HTMLElement).getByRole("button", { name: "/c" }));
		fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
		expect(document.activeElement).toBe(rows[2]);
		fireEvent.keyDown(rows[2] as HTMLElement, { key: "ArrowDown" });
		expect(document.activeElement).toBe(rows[2]);
		fireEvent.keyDown(rows[2] as HTMLElement, { key: "Enter" });
		expect(open).toHaveBeenCalledWith(r[2]);
		expect(stops()).toEqual([rows[2]]);
	});

	it("puts the value buttons out of the tab order but one when rows have no action", () => {
		const { container } = render(<DataTable label="Pages" columns={columns} rows={rows} onFilter={vi.fn()} />);
		const buttons = [...container.querySelectorAll<HTMLElement>("tbody button")];
		expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
		act(() => buttons[0]?.focus());
		fireEvent.keyDown(buttons[0] as HTMLElement, { key: "ArrowDown" });
		expect(document.activeElement).toBe(buttons[1]);
		expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
	});
});

describe("column choice", () => {
	const cols: Column[] = [
		{ key: "key", label: "Page", format: "text" },
		{ key: "visitors", label: "Visitors" },
		{ key: "pageviews", label: "Pageviews" },
		{ key: "scroll", label: "Median scroll", optional: true },
		{ key: "orders", label: "Orders" },
	];
	const data: TableRow[] = [{ key: "/a", visitors: 1, pageviews: 2, scroll: 40, orders: null }];
	function Panel({ c = cols }: { c?: Column[] }) {
		const picked = useColumns("pages", c, data);
		return (
			<>
				<KebabMenu label="Export and columns: Pages" items={[{ label: "Export CSV", onSelect: () => {} }]} checks={picked.checks} />
				<DataTable label="Pages" columns={picked.columns} rows={data} />
			</>
		);
	}
	const heads = () => [...document.querySelectorAll("thead th")].map((th) => th.textContent);
	const openMenu = async () => {
		fireEvent.click(screen.getByRole("button", { name: "Export and columns: Pages" }));
		return (await screen.findAllByRole("menuitemcheckbox")) as HTMLElement[];
	};

	it("shows the default set, offers every column with data in the menu, and stores a choice in this browser", async () => {
		render(<Panel />);
		expect(heads()).toEqual(["Page", "Visitors", "Pageviews"]);
		const checks = await openMenu();
		// Orders has no value in any row: not shown and not offered.
		expect(checks.map((c) => [c.textContent, c.getAttribute("aria-checked")])).toEqual([
			["Visitors", "true"],
			["Pageviews", "true"],
			["Median scroll", "false"],
		]);
		fireEvent.click(checks[2] as HTMLElement);
		await waitFor(() => expect(heads()).toEqual(["Page", "Visitors", "Pageviews", "Median scroll"]));
		fireEvent.click(checks[0] as HTMLElement);
		await waitFor(() => expect(heads()).toEqual(["Page", "Pageviews", "Median scroll"]));
		expect(JSON.parse(localStorage.getItem("ca.cols.v1") ?? "null")).toEqual({ pages: { scroll: true, visitors: false } });
		cleanup();
		render(<Panel />);
		expect(heads()).toEqual(["Page", "Pageviews", "Median scroll"]);
	});

	it("keeps one column besides the first", async () => {
		localStorage.setItem("ca.cols.v1", JSON.stringify({ pages: { visitors: false }, other: { x: true } }));
		render(<Panel />);
		expect(heads()).toEqual(["Page", "Pageviews"]);
		const checks = await openMenu();
		expect(checks[1]?.getAttribute("aria-checked")).toBe("true");
		expect(checks[1]?.hasAttribute("data-disabled") || checks[1]?.getAttribute("aria-disabled") === "true").toBe(true);
		fireEvent.click(checks[0] as HTMLElement);
		await waitFor(() => expect(heads()).toEqual(["Page", "Visitors", "Pageviews"]));
		// Other reports' choices stay.
		expect(JSON.parse(localStorage.getItem("ca.cols.v1") ?? "null").other).toEqual({ x: true });
	});

	it("two tables of one report keep both choices", async () => {
		render(
			<>
				<Panel />
				<Panel />
			</>,
		);
		const first = (await screen.findAllByRole("button", { name: "Export and columns: Pages" }))[0] as HTMLElement;
		fireEvent.click(first);
		fireEvent.click((await screen.findAllByRole("menuitemcheckbox"))[0] as HTMLElement);
		await waitFor(() => expect(JSON.parse(localStorage.getItem("ca.cols.v1") ?? "null").pages).toEqual({ visitors: false }));
		const second = screen.getAllByRole("button", { name: "Export and columns: Pages" })[1] as HTMLElement;
		fireEvent.keyDown(document.body, { key: "Escape" });
		fireEvent.click(second);
		const checks = (await screen.findAllByRole("menuitemcheckbox")) as HTMLElement[];
		fireEvent.click(checks.find((c) => c.textContent === "Median scroll") as HTMLElement);
		await waitFor(() => expect(JSON.parse(localStorage.getItem("ca.cols.v1") ?? "null").pages).toEqual({ visitors: false, scroll: true }));
	});

	it("falls back to the default set when the choice would leave only names", () => {
		localStorage.setItem("ca.cols.v1", JSON.stringify({ pages: { visitors: false, pageviews: false } }));
		render(<Panel />);
		expect(heads()).toEqual(["Page", "Visitors", "Pageviews"]);
	});

	it("drops the sort of a column the visitor hides", async () => {
		const two: TableRow[] = [{ key: "/a", visitors: 1, pageviews: 9 }, { key: "/b", visitors: 2, pageviews: 3 }];
		function Sorted() {
			const picked = useColumns("sorted", cols.slice(0, 3), two);
			return (
				<>
					<KebabMenu label="Export and columns: Pages" items={[{ label: "Export CSV", onSelect: () => {} }]} checks={picked.checks} />
					<DataTable label="Pages" columns={picked.columns} rows={two} />
				</>
			);
		}
		render(<Sorted />);
		fireEvent.click(screen.getByRole("button", { name: /Pageviews/ }));
		expect([...document.querySelectorAll("thead th")].map((th) => th.getAttribute("aria-sort"))).toContain("descending");
		fireEvent.click(await screen.findByRole("button", { name: "Export and columns: Pages" }));
		const checks = (await screen.findAllByRole("menuitemcheckbox")) as HTMLElement[];
		fireEvent.click(checks.find((c) => c.textContent === "Pageviews") as HTMLElement);
		await waitFor(() => expect(heads()).toEqual(["Page", "Visitors"]));
		expect([...document.querySelectorAll("thead th")].map((th) => th.getAttribute("aria-sort"))).not.toContain("descending");
	});

	it("keeps the page when the rows are rebuilt with the same keys", () => {
		const many: TableRow[] = Array.from({ length: 30 }, (_, i) => ({ key: `/p${i}`, visitors: i, pageviews: i }));
		function Rebuilt() {
			const [n, setN] = useState(0);
			return (
				<>
					<button type="button" onClick={() => setN(n + 1)}>
						Rerender
					</button>
					<DataTable label="Pages" columns={cols.slice(0, 3)} rows={many.map((r) => ({ ...r }))} pageSize={10} />
				</>
			);
		}
		render(<Rebuilt />);
		fireEvent.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText(/Page 2 of 3/)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Rerender" }));
		expect(screen.getByText(/Page 2 of 3/)).toBeTruthy();
	});

	it("ignores a stored value of the wrong shape and offers no choice for two columns", () => {
		localStorage.setItem("ca.cols.v1", "{\"pages\":[1]}");
		render(<Panel c={cols.slice(0, 2)} />);
		expect(heads()).toEqual(["Page", "Visitors"]);
		// One action and no checks: the menu is that action as a button.
		expect(screen.getByRole("button", { name: "Export CSV" }).getAttribute("aria-haspopup")).toBeNull();
	});
});

describe("truncated table on one page", () => {
	it("says more rows exist and shows no pager of one page", () => {
		const rows: TableRow[] = [{ key: "/a", visitors: 1 }, { key: "/b", visitors: 2 }];
		render(<DataTable label="Orders" columns={[{ key: "key", label: "Page", format: "text" }, { key: "visitors", label: "Visitors" }]} rows={rows} truncated />);
		expect(screen.getByText(/More rows exist/)).toBeTruthy();
		expect(screen.queryByText(/Page 1 of 1/)).toBeNull();
		expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
	});
});
