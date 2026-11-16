// @vitest-environment jsdom
/** KebabMenu: button aria, menu roles, item choice, Escape and focus return, outside click, arrow keys. */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KebabMenu } from "../src/admin/components/ui.js";

afterEach(cleanup);

const setup = () => {
	const csv = vi.fn();
	const json = vi.fn();
	const r = render(<KebabMenu label="Export Top pages" items={[{ label: "Export CSV", onSelect: csv }, { label: "Export JSON", onSelect: json }]} />);
	const button = r.getByRole("button", { name: "Export Top pages" });
	return { ...r, button, csv, json };
};
const open = async (button: HTMLElement) => {
	act(() => button.focus());
	fireEvent.click(button);
	await waitFor(() => expect(button.getAttribute("aria-expanded")).toBe("true"));
};

describe("KebabMenu", () => {
	it("is a menu button that opens a menu of menuitems", async () => {
		const { button } = setup();
		expect(button.getAttribute("aria-haspopup")).toBe("menu");
		expect(button.getAttribute("aria-expanded")).toBe("false");
		await open(button);
		const menu = document.querySelector('[role="menu"]');
		expect(menu).not.toBeNull();
		expect([...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].map((e) => e.textContent)).toEqual(["Export CSV", "Export JSON"]);
	});

	it("choosing an item runs it and closes the menu", async () => {
		const { button, json } = setup();
		await open(button);
		const item = [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent === "Export JSON") as HTMLElement;
		fireEvent.click(item);
		expect(json).toHaveBeenCalledOnce();
		await waitFor(() => expect(button.getAttribute("aria-expanded")).toBe("false"));
	});

	it("Escape closes the menu and returns focus to the button", async () => {
		const { button } = setup();
		await open(button);
		const menu = document.querySelector('[role="menu"]') as HTMLElement;
		fireEvent.keyDown(menu, { key: "Escape" });
		await waitFor(() => expect(button.getAttribute("aria-expanded")).toBe("false"));
		await waitFor(() => expect(document.activeElement).toBe(button));
	});

	it("a click outside closes the menu", async () => {
		const { button } = setup();
		await open(button);
		fireEvent.pointerDown(document.body);
		fireEvent.mouseDown(document.body);
		fireEvent.click(document.body);
		await waitFor(() => expect(button.getAttribute("aria-expanded")).toBe("false"));
	});

	it("arrow keys move between items", async () => {
		const { button } = setup();
		await open(button);
		const menu = document.querySelector('[role="menu"]') as HTMLElement;
		const items = [...document.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
		fireEvent.keyDown(menu, { key: "ArrowDown" });
		await waitFor(() => expect(items).toContain(document.activeElement));
		const first = document.activeElement;
		fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
		await waitFor(() => expect(document.activeElement).not.toBe(first));
		expect(items).toContain(document.activeElement);
	});
});
