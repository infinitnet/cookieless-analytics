// @vitest-environment jsdom
/** Whole-area click targets: KPI cards, report rows with a drill-down, bar rows. */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarList } from "../src/admin/components/Chart.js";
import { DataTable } from "../src/admin/components/DataTable.js";
import { KpiCard } from "../src/admin/components/KpiCard.js";
import { ADMIN_CSS } from "../src/admin/styles.js";

afterEach(cleanup);

describe("KPI card", () => {
	it("a selectable card is one toggle button over the whole card; the info mark is a sibling in the corner", () => {
		const onSelect = vi.fn();
		const { container, getByRole } = render(<KpiCard metric="impressions" label="Impressions" value={1200} format="number" compare={{ impressions: 1071 }} active slot={1} axis="Right axis" onSelect={onSelect} />);
		const card = container.querySelector(".ca-kpi") as HTMLElement;
		expect(card.getAttribute("data-selectable")).toBe("true");
		const btn = getByRole("button", { name: "Impressions 1,200, up 12.0 percent, better, +129, from 1,071" });
		expect(btn.getAttribute("aria-pressed")).toBe("true");
		expect(btn.textContent).toContain("Impressions");
		expect(btn.textContent).toContain("+12.0%");
		// One selecting control; the info mark is a separate button, not nested inside it.
		expect(btn.querySelector("button")).toBeNull();
		expect(card.querySelector(":scope > .ca-info")).not.toBeNull();
		fireEvent.click(btn, { shiftKey: true });
		expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ shiftKey: true }));
		// The slot: color on the top edge, shape and axis in the chip.
		expect(card.getAttribute("data-slot")).toBe("1");
		expect(card.style.getPropertyValue("--ca-slot")).toBe("var(--ca-series-2, #16a34a)");
		expect(card.querySelector(".ca-kpi-chip")?.getAttribute("title")).toBe("Right axis");
		expect(ADMIN_CSS).toContain(".ca-kpi[data-slot] { box-shadow: inset 0 3px 0 var(--ca-slot); }");
		expect(ADMIN_CSS).toContain(".ca-kpi > .ca-info { position: absolute;");
		expect(ADMIN_CSS).toContain(".ca-kpi button.ca-kpi-btn:focus-visible { outline:");
	});

	it("an inactive card is not pressed and carries no slot", () => {
		const { container, getByRole } = render(<KpiCard metric="clicks" label="Clicks" value={3} format="number" slot={0} onSelect={() => {}} />);
		expect(getByRole("button", { name: "Clicks 3" }).getAttribute("aria-pressed")).toBe("false");
		expect(container.querySelector("[data-slot]")).toBeNull();
	});

	it("a card without a selection is not marked clickable", () => {
		const { container } = render(<KpiCard metric="clicks" label="Clicks" value={3} format="number" />);
		expect(container.querySelector(".ca-kpi")?.hasAttribute("data-selectable")).toBe(false);
	});
});

describe("report rows with a drill-down", () => {
	const columns = [
		{ key: "key", label: "Page", format: "text" as const, dim: "page" as const },
		{ key: "visitors", label: "Visitors" },
	];
	const rows = [{ key: "/a", visitors: 5 }];

	it("a click anywhere on the row opens the drill-down; the filter button keeps its own action", () => {
		const open = vi.fn();
		const filter = vi.fn();
		const { container, getByRole } = render(<DataTable label="Pages" columns={columns} rows={rows} onFilter={filter} action={{ label: "Queries", onClick: open }} />);
		const tr = container.querySelector("tbody tr") as HTMLElement;
		expect(tr.className).toContain("ca-rowlink");
		fireEvent.click(tr.querySelectorAll("td")[1] as HTMLElement);
		expect(open).toHaveBeenCalledWith(rows[0]);
		fireEvent.click(getByRole("button", { name: "/a" }));
		expect(filter).toHaveBeenCalledWith("page", "/a");
		expect(open).toHaveBeenCalledOnce();
		fireEvent.click(getByRole("button", { name: "Queries: /a" }));
		expect(open).toHaveBeenCalledTimes(2);
	});

	it("the row is the one tab stop: Enter on it opens the drill-down, Enter on a nested control does not", () => {
		const open = vi.fn();
		const filter = vi.fn();
		const { container, getByRole } = render(<DataTable label="Pages" columns={columns} rows={rows} onFilter={filter} action={{ label: "Details", onClick: open }} />);
		const tr = container.querySelector("tbody tr") as HTMLElement;
		expect(tr.tabIndex).toBe(0);
		expect((getByRole("button", { name: "Details: /a" }) as HTMLElement).tabIndex).toBe(-1);
		fireEvent.keyDown(tr, { key: "Enter" });
		expect(open).toHaveBeenCalledWith(rows[0]);
		fireEvent.keyDown(getByRole("button", { name: "/a" }), { key: "Enter" });
		fireEvent.keyDown(tr, { key: "a" });
		expect(open).toHaveBeenCalledOnce();
		expect(ADMIN_CSS).toContain(".ca-rowlink:is(:focus-visible, :has(.ca-rowlink-main:focus-visible)) { outline:");
	});

	it("selecting text in a row does not open the drill-down", () => {
		const open = vi.fn();
		const { container } = render(<DataTable label="Pages" columns={columns} rows={rows} action={{ label: "Queries", onClick: open }} />);
		const cell = container.querySelectorAll("tbody td")[1] as HTMLElement;
		const range = document.createRange();
		range.selectNodeContents(cell);
		window.getSelection()?.addRange(range);
		fireEvent.click(cell);
		expect(open).not.toHaveBeenCalled();
		window.getSelection()?.removeAllRanges();
	});

	it("rows without a drill-down are not clickable", () => {
		const { container } = render(<DataTable label="Pages" columns={columns} rows={rows} />);
		expect(container.querySelector("tbody tr")?.className ?? "").not.toContain("ca-rowlink");
	});
});

describe("bar rows", () => {
	it("a click on the empty part of a short bar's row selects it", () => {
		const onSelect = vi.fn();
		const { container } = render(<BarList label="Channels" rows={[{ label: "Search", value: 100 }, { label: "Direct", value: 1 }]} onSelect={onSelect} />);
		fireEvent.click(container.querySelectorAll(".ca-bar-hit")[1] as Element);
		expect(onSelect).toHaveBeenCalledWith("Direct");
	});
});
