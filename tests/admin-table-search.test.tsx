// @vitest-environment jsdom
/** DataTable search: shown only over one page of rows, filters the loaded rows literally, keeps sort and paging. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable, TABLE_SEARCH_TEXT, type TableRow } from "../src/admin/components/DataTable.js";
import { SEARCH_DEBOUNCE_MS } from "../src/admin/components/SearchBox.js";

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
	{ key: "key", label: "Page", format: "text" as const },
	{ key: "title", label: "Title", format: "text" as const },
	{ key: "visitors", label: "Visitors" },
];
const pages = (n: number): TableRow[] => Array.from({ length: n }, (_, i) => ({ key: `/post-${i + 1}`, title: `Post ${i + 1}`, visitors: i + 1 }));
const firstCol = (c: HTMLElement) => [...c.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent);
const box = () => screen.getByRole("searchbox") as HTMLInputElement;
const type = async (c: HTMLElement, text: string, first: string | undefined) => {
	fireEvent.change(box(), { target: { value: text } });
	await waitFor(() => expect(firstCol(c)[0]).toBe(first), { timeout: SEARCH_DEBOUNCE_MS * 8 });
};

describe("DataTable search", () => {
	it("is hidden at one page of rows or less and shown over it, with its landmark name", () => {
		const { rerender } = render(<DataTable label="Pages" columns={columns} rows={pages(5)} pageSize={5} />);
		expect(screen.queryByRole("search")).toBeNull();
		rerender(<DataTable label="Pages" columns={columns} rows={pages(6)} pageSize={5} />);
		expect(screen.getByRole("search", { name: TABLE_SEARCH_TEXT.label })).toBeTruthy();
	});

	it("never shows when search is off (dashboard tiles)", () => {
		render(<DataTable label="Pages" columns={columns} rows={pages(30)} pageSize={5} search={false} />);
		expect(screen.queryByRole("search")).toBeNull();
	});

	it("filters the loaded rows on text columns case-insensitively, counts matches and resets to page 1", async () => {
		const { container } = render(<DataTable label="Pages" columns={columns} rows={pages(30)} pageSize={5} />);
		fireEvent.click(screen.getByRole("button", { name: "Next" }));
		expect(firstCol(container)[0]).toBe("/post-6");
		// "POST 2" matches the title column of 2 and 20 to 29.
		await type(container, "POST 2", "/post-2");
		expect(screen.getByRole("status").textContent).toBe("11 of 30 rows match");
		expect(screen.getByText("Page 1 of 3")).toBeTruthy();
		// The key column matches too, and a number column does not.
		await type(container, "post-17", "/post-17");
		expect(firstCol(container)).toEqual(["/post-17"]);
		await type(container, "17", "/post-17");
		expect(firstCol(container)).toEqual(["/post-17"]);
	});

	it("keeps the chosen sort while searching", async () => {
		const { container } = render(<DataTable label="Pages" columns={columns} rows={pages(30)} pageSize={5} />);
		fireEvent.click(screen.getByRole("button", { name: "Visitors" }));
		expect(firstCol(container)[0]).toBe("/post-30");
		await type(container, "post-1", "/post-19");
		expect(firstCol(container)).toEqual(["/post-19", "/post-18", "/post-17", "/post-16", "/post-15"]);
	});

	it("takes wildcard and regex characters literally", async () => {
		const rows: TableRow[] = [...pages(6), { key: "/a.b", visitors: 1 }, { key: "/a%b", visitors: 1 }, { key: "/axb", visitors: 1 }];
		const { container } = render(<DataTable label="Pages" columns={columns} rows={rows} pageSize={5} />);
		await type(container, ".", "/a.b");
		expect(firstCol(container)).toEqual(["/a.b"]);
		await type(container, "%", "/a%b");
		expect(firstCol(container)).toEqual(["/a%b"]);
		await type(container, "a.*b", undefined);
		expect(firstCol(container)).toEqual([]);
	});

	it("shows an empty state with a clear button when nothing matches", async () => {
		const { container } = render(<DataTable label="Pages" columns={columns} rows={pages(8)} pageSize={5} />);
		await type(container, "nothing here", undefined);
		expect(screen.getByText('No rows match "nothing here".')).toBeTruthy();
		fireEvent.click(screen.getAllByRole("button", { name: "Clear search" }).at(-1) as HTMLElement);
		expect(firstCol(container)).toHaveLength(5);
		expect(box().value).toBe("");
	});

	it("says the search covers only the rows shown when the server truncated them", () => {
		const { rerender } = render(<DataTable label="Pages" columns={columns} rows={pages(8)} pageSize={5} />);
		expect(screen.queryByText(TABLE_SEARCH_TEXT.truncated)).toBeNull();
		rerender(<DataTable label="Pages" columns={columns} rows={pages(8)} pageSize={5} truncated />);
		expect(screen.getByText(TABLE_SEARCH_TEXT.truncated)).toBeTruthy();
	});

	it("clears the term when new rows arrive (another report, range or filter)", async () => {
		const { container, rerender } = render(<DataTable label="Pages" columns={columns} rows={pages(8)} pageSize={5} />);
		await type(container, "post-7", "/post-7");
		rerender(<DataTable label="Pages" columns={columns} rows={pages(9)} pageSize={5} />);
		await waitFor(() => expect(box().value).toBe(""));
		expect(firstCol(container)).toHaveLength(5);
	});
});
