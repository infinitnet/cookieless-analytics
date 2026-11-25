// @vitest-environment jsdom
/** Tile list of the dashboard editor: drag handle with mocked rects, the move buttons, focus. */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TileList } from "../src/admin/components/TileList.js";
import type { Tile } from "../src/dashboards/schema.js";

// jsdom has no PointerEvent; a MouseEvent carries clientY and button.
if (!("PointerEvent" in window))
	Object.assign(window, {
		PointerEvent: class extends MouseEvent {
			pointerId: number;
			constructor(type: string, init: PointerEventInit = {}) {
				super(type, init);
				this.pointerId = init.pointerId ?? 0;
			}
		},
	});

const TILES: Tile[] = ["aaaaaa", "bbbbbb", "cccccc", "dddddd"].map((id) => ({ id, report: "pages", kind: "table", w: 1 }));
let last: Tile[] = TILES;

function Harness() {
	const [tiles, setTiles] = useState<Tile[]>(TILES);
	return (
		<TileList
			tiles={tiles}
			describe={(t) => t.id}
			onChange={(t) => {
				last = t;
				setTiles(t);
			}}
			onEdit={() => {}}
		/>
	);
}

const order = () => within(screen.getByRole("list", { name: "Tiles" })).getAllByRole("listitem").map((li) => li.getAttribute("data-tile"));

/** Rows of 40 px from y = 0, so the middles are 20, 60, 100, 140. */
function mockRects() {
	for (const li of screen.getAllByRole("listitem")) {
		const i = order().indexOf(li.getAttribute("data-tile"));
		li.getBoundingClientRect = () => ({ top: i * 40, height: 40, bottom: i * 40 + 40, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON: () => ({}) });
	}
}

afterEach(() => {
	cleanup();
	last = TILES;
});

describe("TileList", () => {
	it("each tile has a drag handle that does not scroll on touch", () => {
		render(<Harness />);
		const handles = screen.getAllByRole("button", { name: "Drag to reorder" });
		expect(handles).toHaveLength(4);
		expect((handles[0] as HTMLElement).style.touchAction).toBe("none");
	});

	it("drags the first tile to the end and the last to the front", () => {
		render(<Harness />);
		mockRects();
		const handle = () => screen.getAllByRole("button", { name: "Drag to reorder" });
		fireEvent.pointerDown(handle()[0] as HTMLElement, { button: 0, pointerId: 1, clientY: 10 });
		fireEvent.pointerMove(handle()[0] as HTMLElement, { pointerId: 1, clientY: 150 });
		expect(screen.getAllByRole("listitem")[3]?.hasAttribute("data-drop-after")).toBe(true);
		fireEvent.pointerUp(handle()[0] as HTMLElement, { pointerId: 1, clientY: 150 });
		expect(order()).toEqual(["bbbbbb", "cccccc", "dddddd", "aaaaaa"]);
		expect(document.activeElement?.getAttribute("data-tile")).toBe("aaaaaa");
		mockRects();
		fireEvent.pointerDown(handle()[3] as HTMLElement, { button: 0, pointerId: 1, clientY: 130 });
		fireEvent.pointerUp(handle()[3] as HTMLElement, { pointerId: 1, clientY: 5 });
		expect(order()).toEqual(["aaaaaa", "bbbbbb", "cccccc", "dddddd"]);
		expect(last.map((t) => t.id)).toEqual(["aaaaaa", "bbbbbb", "cccccc", "dddddd"]);
	});

	it("a drop on its own place or a canceled drag changes nothing", () => {
		render(<Harness />);
		mockRects();
		const h = screen.getAllByRole("button", { name: "Drag to reorder" })[1] as HTMLElement;
		fireEvent.pointerDown(h, { button: 0, pointerId: 1, clientY: 60 });
		fireEvent.pointerUp(h, { pointerId: 1, clientY: 70 });
		fireEvent.pointerDown(h, { button: 0, pointerId: 1, clientY: 60 });
		fireEvent.pointerCancel(h, { pointerId: 1 });
		expect(order()).toEqual(["aaaaaa", "bbbbbb", "cccccc", "dddddd"]);
		expect(last).toBe(TILES);
	});

	it("the move buttons still work and return focus to the moved tile", () => {
		render(<Harness />);
		fireEvent.click(screen.getByRole("button", { name: "Move cccccc up" }));
		expect(order()).toEqual(["aaaaaa", "cccccc", "bbbbbb", "dddddd"]);
		expect(document.activeElement?.getAttribute("data-tile")).toBe("cccccc");
		fireEvent.click(screen.getByRole("button", { name: "Move aaaaaa down" }));
		expect(order()).toEqual(["cccccc", "aaaaaa", "bbbbbb", "dddddd"]);
		expect(screen.getByRole("button", { name: "Move cccccc up" })).toHaveProperty("disabled", true);
	});

	it("respects reduced motion", () => {
		const { container } = render(<Harness />);
		expect(container.querySelector("style")?.textContent).toContain("@media (prefers-reduced-motion: reduce)");
	});
});
