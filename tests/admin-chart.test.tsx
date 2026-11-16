// @vitest-environment jsdom
/** SVG chart kit. */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { annotationMarkers, BarList, Donut, LineChart, Sparkline, StackedBars } from "../src/admin/components/Chart.js";
import { zonedToEpoch } from "../src/core/time.js";
import { ADMIN_CSS } from "../src/admin/styles.js";

afterEach(cleanup);

const points = [
	{ t: "2026-03-01", v: 10 },
	{ t: "2026-03-02", v: 25 },
	{ t: "2026-03-03", v: 5 },
	{ t: "2026-03-04", v: 40 },
];

describe("LineChart", () => {
	it("renders without compare and annotations", () => {
		const { container } = render(<LineChart label="Visitors" points={points} />);
		expect(container.querySelector('[data-series="value"]')).not.toBeNull();
		expect(container.querySelector("[data-compare]")).toBeNull();
		expect(container.querySelector("[data-marker]")).toBeNull();
		expect(container.innerHTML).toMatchSnapshot();
	});

	it("renders the compare overlay in the series colour and annotation markers", () => {
		const markers = [
			{ t: "2026-03-02", label: "Post published" },
			{ t: "2026-03-02", label: "Post updated" },
			{ t: "2026-02-01", label: "outside the range" },
		];
		const { container } = render(<LineChart label="Visitors" points={points} compare={[8, 30, 2, 20]} markers={markers} />);
		const cmp = container.querySelector('[data-compare="value"]');
		expect(cmp?.getAttribute("stroke-dasharray")).toBe("4 3");
		expect(cmp?.getAttribute("stroke")).toBe(container.querySelector('[data-series="value"]')?.getAttribute("stroke"));
		const marks = container.querySelectorAll("[data-marker]");
		expect(marks).toHaveLength(1);
		expect(marks[0]?.getAttribute("data-marker")).toBe("2026-03-02");
		expect(marks[0]?.querySelector("title")?.textContent).toBe("Post published\nPost updated");
		expect(container.innerHTML).toMatchSnapshot();
	});

	it("a legend slot replaces the built-in legend below the plot; null shows none", () => {
		const own = render(<LineChart label="Visitors" points={points} compare={[1, 2, 3, 4]} legend={<div data-own-legend="" />} />).container;
		const fig = own.querySelector("figure.ca-chart") as HTMLElement;
		expect(fig.querySelector("[data-own-legend]")).not.toBeNull();
		expect(fig.querySelector(".ca-legend")).toBeNull();
		// Below the plot, like the built-in legend.
		expect(fig.querySelector(".ca-plot")?.compareDocumentPosition(fig.querySelector("[data-own-legend]") as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		const none = render(<LineChart label="Visitors" points={points} compare={[1, 2, 3, 4]} legend={null} />).container;
		expect(none.querySelector(".ca-legend")).toBeNull();
	});

	it("y axis: three gridlines from 0 to a nice maximum; up to 6 date ticks", () => {
		const { container } = render(<LineChart label="Visitors" points={points} />);
		expect([...container.querySelectorAll("[data-tick] text")].map((t) => t.textContent)).toEqual(["0", "25", "50"]);
		const days = Array.from({ length: 14 }, (_, i) => ({ t: `2026-03-${String(i + 1).padStart(2, "0")}`, v: i }));
		const many = render(<LineChart label="Visitors" points={days} />).container;
		expect([...many.querySelectorAll("[data-xtick]")].map((t) => t.textContent)).toEqual(["1 Mar", "4 Mar", "6 Mar", "9 Mar", "11 Mar", "14 Mar"]);
	});

	it("breaks the line at null buckets instead of drawing zero", () => {
		const { container } = render(
			<LineChart
				label="Bounce rate"
				format="percent"
				points={[
					{ t: "a", v: 0.5 },
					{ t: "b", v: null },
					{ t: "c", v: 0.25 },
					{ t: "d", v: 0.5 },
				]}
			/>,
		);
		expect(container.querySelector('[data-series="value"]')?.getAttribute("d")).toBe("M25.5 16 M408.5 98 L600 16");
		expect(container.querySelector("[data-tick] text")?.textContent).toBe("0%");
	});

	it("handles an empty series, and draws a single bucket as a marker", () => {
		expect(render(<LineChart label="x" points={[]} />).container.querySelector("path")).toBeNull();
		const one = render(<LineChart label="x" points={[{ t: "2026-03-01", v: 3 }]} />).container;
		expect(one.querySelector('[data-point="value"]')).not.toBeNull();
	});
});

const days = ["2026-03-09", "2026-03-10", "2026-03-11"];
const two = [
	{ key: "visitors", label: "Visitors", format: "number" as const, slot: 0, values: [116, 120, null], compare: [98.6, 130, 50] },
	{ key: "bounce_rate", label: "Bounce rate", format: "percent" as const, slot: 1, values: [0.4, 0.5, 0.3], compare: [0.5, 0.5, 0.3], axis: "right" as const },
];

describe("LineChart with several series", () => {
	it("draws each series in its slot colour, a right axis and the axis captions", () => {
		const { container } = render(<LineChart label="Trend" buckets={days} series={two} compareLabel="15 Feb to 28 Feb" />);
		expect(container.querySelector('[data-series="visitors"]')?.getAttribute("stroke")).toBe("var(--ca-series-1, #2563eb)");
		expect(container.querySelector('[data-series="bounce_rate"]')?.getAttribute("stroke")).toBe("var(--ca-series-2, #16a34a)");
		expect([...container.querySelectorAll('[data-axis="right"]')].map((t) => t.textContent)).toEqual(["0%", "25%", "50%"]);
		expect([...container.querySelectorAll(".ca-axis-caps span")].map((s) => s.textContent)).toEqual(["Visitors", "Bounce rate"]);
		// Area fill only with exactly one series.
		expect(container.querySelector('path[fill-opacity="0.12"]')).toBeNull();
		const legend = container.querySelector(".ca-legend") as HTMLElement;
		expect(legend.textContent).toBe("VisitorsBounce rateDashed lines: 15 Feb to 28 Feb");
	});

	it("an inverted axis puts 1 at the top", () => {
		const pos = [{ key: "position", label: "Position", format: "decimal" as const, values: [3, 8, 1], invert: true }];
		const { container } = render(<LineChart label="Position" buckets={days} series={pos} />);
		expect([...container.querySelectorAll("[data-tick] text")].map((t) => t.textContent)).toEqual(["10", "5.5", "1"]);
		expect(container.querySelector(".ca-axis-caps")?.textContent).toBe("Position (1 is best)");
		expect(container.querySelector('[data-series="position"]')?.getAttribute("d")).toBe("M25.5 52.4 L312.8 143.6 L600 16");
	});

	it("a money axis names its currency once in the caption", () => {
		const rev = [{ key: "revenue", label: "Revenue", format: "money:EUR" as const, values: [1500, 900, 1200] }];
		const { container } = render(<LineChart label="Revenue" buckets={days} series={rev} />);
		expect(container.querySelector(".ca-axis-caps")?.textContent).toBe("Revenue (EUR)");
		expect([...container.querySelectorAll("[data-tick] text")].map((t) => t.textContent)).toEqual(["0", "1K", "2K"]);
	});

	it("legend entries toggle series when the chart is interactive", () => {
		const onToggle = vi.fn();
		const { getByRole } = render(<LineChart label="Trend" buckets={days} series={two} onToggle={onToggle} />);
		fireEvent.click(getByRole("button", { name: "Bounce rate" }), { shiftKey: true });
		expect(onToggle).toHaveBeenCalledWith("bounce_rate", expect.objectContaining({ shiftKey: true }));
	});
});

describe("tooltip, keys, pointer and touch", () => {
	const chart = () => render(<LineChart label="Trend" buckets={days} series={two} compareLabel="15 Feb to 28 Feb" markers={[1, 2, 3].map((i) => ({ t: "2026-03-09", label: `Note ${i}` }))} />);
	const plot = (c: HTMLElement) => c.querySelector(".ca-plot") as HTMLElement;
	// jsdom has no PointerEvent: a mouse event under the pointer event name carries clientX and pointerType.
	const pointer = (el: Element, type: string, clientX: number, pointerType: string) => {
		const e = new MouseEvent(type, { bubbles: true, clientX });
		Object.defineProperty(e, "pointerType", { value: pointerType });
		act(() => {
			el.dispatchEvent(e);
		});
	};

	it("the plot is one focus stop; arrows, Home, End, Page keys and Escape move the active bucket", () => {
		const { container, getByRole } = chart();
		const p = plot(container);
		expect(p.getAttribute("tabindex")).toBe("0");
		expect(p.getAttribute("role")).toBe("group");
		const status = getByRole("status");
		expect(status.textContent).toBe("");
		fireEvent.keyDown(p, { key: "ArrowRight" });
		expect(container.querySelector("[data-hover]")?.getAttribute("data-hover")).toBe("2026-03-09");
		fireEvent.keyDown(p, { key: "ArrowRight" });
		expect(container.querySelector("[data-hover]")?.getAttribute("data-hover")).toBe("2026-03-10");
		fireEvent.keyDown(p, { key: "Home" });
		expect(container.querySelector("[data-hover]")?.getAttribute("data-hover")).toBe("2026-03-09");
		fireEvent.keyDown(p, { key: "PageDown" });
		expect(container.querySelector("[data-hover]")?.getAttribute("data-hover")).toBe("2026-03-11");
		fireEvent.keyDown(p, { key: "PageUp" });
		fireEvent.keyDown(p, { key: "End" });
		expect(container.querySelector("[data-hover]")?.getAttribute("data-hover")).toBe("2026-03-11");
		fireEvent.keyDown(p, { key: "ArrowLeft" });
		expect(container.querySelector("[data-hover]")?.getAttribute("data-hover")).toBe("2026-03-10");
		fireEvent.keyDown(p, { key: "Escape" });
		expect(container.querySelector("[data-hover]")).toBeNull();
		expect(container.querySelector(".ca-tip")).toBeNull();
		// The status line stays mounted, empty.
		expect(getByRole("status").textContent).toBe("");
	});

	it("a single series names its metric, so the tooltip judges a lower-is-better rate", () => {
		const { container } = render(<LineChart label="Bad experience over time" format="percent" metric="pct_bad" points={[{ t: "2026-03-09", v: 0.12 }, { t: "2026-03-10", v: 0.1 }]} compare={[0.1, 0.1]} />);
		fireEvent.keyDown(container.querySelector(".ca-plot") as HTMLElement, { key: "Home" });
		const mark = container.querySelector(".ca-tip .ca-delta") as HTMLElement;
		expect(mark.getAttribute("data-judge")).toBe("worse");
		expect(mark.textContent).toBe("\u2191+2.0 pp worse");
	});

	it("tooltip and status text: date, one row per series, comparison with change, No data, annotations", () => {
		const { container, getByRole } = chart();
		const p = plot(container);
		fireEvent.keyDown(p, { key: "Home" });
		const tip = container.querySelector(".ca-tip") as HTMLElement;
		expect(tip.getAttribute("aria-hidden")).toBe("true");
		expect(tip.querySelector(".ca-tip-head")?.textContent).toBe("Mon 9 Mar 2026");
		expect([...tip.querySelectorAll(".ca-tip-row")].map((r) => r.textContent)).toEqual(["Visitors11615 Feb to 28 Feb: 98.6 (\u2191+17.6% better)", "Bounce rate40.0%15 Feb to 28 Feb: 50.0% (\u2193-10.0 pp better)"]);
		// A fall in bounce rate is good news, and a rate changes in percentage points.
		expect(tip.querySelectorAll("[data-judge]")[1]?.getAttribute("data-judge")).toBe("better");
		expect(tip.querySelector(".ca-tip-notes")?.textContent).toBe("Note 1Note 2+1 more");
		expect(getByRole("status").textContent).toBe("Mon 9 Mar 2026: Visitors 116, Bounce rate 40.0%. 15 Feb to 28 Feb: Visitors 98.6, Bounce rate 50.0%. Annotations: Note 1, Note 2, Note 3.");
		fireEvent.keyDown(p, { key: "End" });
		expect(container.querySelector(".ca-tip-row .ca-tip-val")?.textContent).toBe("No data");
	});

	it("hover adds no element to the flow: the tooltip floats inside the plot", () => {
		const { container } = chart();
		const fig = container.querySelector("figure") as HTMLElement;
		const flow = () => [...fig.children].map((c) => c.className);
		const before = flow();
		const p = plot(container);
		vi.spyOn(p, "getBoundingClientRect").mockReturnValue({ left: 100, width: 600, top: 0, height: 200, right: 700, bottom: 200, x: 100, y: 0, toJSON: () => ({}) });
		pointer(p, "pointermove", 400, "mouse");
		expect(container.querySelector("[data-hover]")?.getAttribute("data-hover")).toBe("2026-03-10");
		expect(flow()).toEqual(before);
		expect(container.querySelector(".ca-tip")?.parentElement).toBe(p);
		expect(ADMIN_CSS).toMatch(/\.ca-tip \{ position: absolute;[^}]*pointer-events: none;/);
		pointer(p, "pointerout", 0, "mouse");
		expect(container.querySelector("[data-hover]")).toBeNull();
	});

	it("touch: a tap sets the bucket, it stays after the finger lifts, a tap outside clears it", () => {
		const { container } = chart();
		const p = plot(container);
		vi.spyOn(p, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300, top: 0, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
		pointer(p, "pointerdown", 290, "touch");
		pointer(p, "pointerout", 0, "touch");
		expect(container.querySelector("[data-hover]")?.getAttribute("data-hover")).toBe("2026-03-11");
		// Near the right edge the tooltip goes left of the guide line (jsdom measures it 0 px wide: the last point, 599 inside the right axis gutter, - 12).
		expect((container.querySelector(".ca-tip") as HTMLElement).style.transform).toBe("translateX(587px)");
		fireEvent.pointerDown(document.body);
		expect(container.querySelector("[data-hover]")).toBeNull();
	});

	it("Show as table: one row per bucket, one column per series and comparison", () => {
		const { container, getByRole } = chart();
		expect(container.querySelector("table")).toBeNull();
		const btn = getByRole("button", { name: "Show as table" });
		fireEvent.click(btn);
		expect(btn.getAttribute("aria-expanded")).toBe("true");
		const rows = [...container.querySelectorAll("table tr")].map((r) => [...r.children].map((c) => c.textContent));
		expect(rows[0]).toEqual(["Date", "Visitors", "Bounce rate", "Visitors, 15 Feb to 28 Feb", "Bounce rate, 15 Feb to 28 Feb"]);
		expect(rows[3]).toEqual(["Wed 11 Mar 2026", "-", "30.0%", "50", "30.0%"]);
	});
});

describe("other charts", () => {
	it("horizontal bars scale to the largest value and report clicks", () => {
		let picked = "";
		const { container } = render(
			<BarList
				label="Channels"
				rows={[
					{ label: "Search", value: 50 },
					{ label: "Direct", value: 25 },
				]}
				onSelect={(l) => (picked = l)}
			/>,
		);
		const rects = container.querySelectorAll("rect:not(.ca-bar-hit)");
		expect(rects[0]?.getAttribute("width")).toBe("600");
		expect(rects[1]?.getAttribute("width")).toBe("300");
		// Each row is clickable over the full width, not only over its bar.
		const hits = container.querySelectorAll(".ca-bar-hit");
		expect([...hits].map((h) => h.getAttribute("width"))).toEqual(["600", "600"]);
		fireEvent.click(hits[1] as Element);
		expect(picked).toBe("Direct");
		fireEvent.keyDown(container.querySelector('[aria-label="Search: 50"]') as Element, { key: "Enter" });
		expect(picked).toBe("Search");
		expect(container.innerHTML).toMatchSnapshot();
	});

	it("stacked bars, sparkline and donut", () => {
		const stacked = render(
			<StackedBars
				label="Devices"
				keys={["desktop", "mobile"]}
				data={[
					{ t: "2026-03-01", parts: [3, 1] },
					{ t: "2026-03-02", parts: [2, 2] },
				]}
			/>,
		).container;
		expect(stacked.querySelectorAll("rect")).toHaveLength(4);
		expect(stacked.innerHTML).toMatchSnapshot();
		const spark = render(<Sparkline label="trend" values={[1, 3, 2]} />).container;
		expect(spark.querySelector("path")?.getAttribute("d")).toBe("M0 15.7 L50 1 L100 8.3");
		const donut = render(
			<Donut
				label="Share"
				slices={[
					{ label: "a", value: 1 },
					{ label: "b", value: 3 },
				]}
			/>,
		).container;
		expect(donut.innerHTML).toMatchSnapshot();
	});

	it("donut: percent in the legend, focusable slices, the centre names the hovered or focused slice", () => {
		const { container } = render(
			<Donut
				label="Sessions by device"
				unit="sessions"
				slices={[
					{ label: "desktop", value: 692 },
					{ label: "mobile", value: 703 },
				]}
			/>,
		);
		expect(container.querySelector(".ca-legend")?.textContent).toBe("desktop49.6%mobile50.4%");
		const slices = container.querySelectorAll("circle[tabindex='0']");
		expect([...slices].map((c) => c.getAttribute("aria-label"))).toEqual(["desktop: 49.6%, 692 sessions", "mobile: 50.4%, 703 sessions"]);
		expect(container.querySelector(".ca-donut-centre")).toBeNull();
		fireEvent.focus(slices[0] as Element);
		expect([...container.querySelectorAll(".ca-donut-centre text")].map((t) => t.textContent)).toEqual(["desktop", "49.6%", "692 sessions"]);
		expect(slices[1]?.getAttribute("opacity")).toBe("0.35");
		fireEvent.blur(slices[0] as Element);
		fireEvent.pointerEnter(container.querySelectorAll(".ca-legend > span")[1] as Element);
		expect(container.querySelector(".ca-donut-pct")?.textContent).toBe("50.4%");
		expect(slices[0]?.getAttribute("opacity")).toBe("0.35");
	});

	it("stacked bars share the keyboard and the status sentence", () => {
		const { container, getByRole } = render(
			<StackedBars
				label="Bands"
				keys={["top 3", "4 to 10"]}
				data={[
					{ t: "2026-03-01", parts: [3, 1] },
					{ t: "2026-03-02", parts: [2, 2] },
				]}
			/>,
		);
		fireEvent.keyDown(container.querySelector(".ca-plot") as Element, { key: "End" });
		expect(getByRole("status").textContent).toBe("Mon 2 Mar 2026: top 3 2, 4 to 10 2.");
		expect(container.querySelector(".ca-tip-head")?.textContent).toBe("Mon 2 Mar 2026");
	});
});

describe("annotationMarkers", () => {
	it("maps annotation times to the buckets of the site timezone", () => {
		const ts = zonedToEpoch("2026-03-04", 23, "UTC") + 1800; // 23:30 UTC on Wednesday 4 March
		const a = [{ ts, kind: "manual", text: "Launch" }];
		const at = (t: string, day: string) => [{ t, label: "Launch", day, kind: "manual", summary: "Site-wide" }];
		expect(annotationMarkers(a, "day", "UTC")).toEqual(at("2026-03-04", "2026-03-04"));
		expect(annotationMarkers(a, "day", "Europe/Berlin")).toEqual(at("2026-03-05", "2026-03-05"));
		expect(annotationMarkers(a, "hour", "UTC")).toEqual(at("2026-03-04 23:00", "2026-03-04"));
		expect(annotationMarkers(a, "week", "UTC")).toEqual(at("2026-03-02", "2026-03-04"));
		const scoped = annotationMarkers([{ id: "x", ts, kind: "publish", text: "Post", scope: { v: 1, path: [{ op: "is", value: "/a" }] } }], "day", "UTC");
		expect(scoped).toEqual([{ t: "2026-03-04", label: "Post", id: "x", day: "2026-03-04", kind: "publish", summary: "Page /a" }]);
	});
});

describe("marker groups, popover and accessibility", () => {
	const many = [
		{ t: "2026-03-01", label: "A", id: "a", day: "2026-03-01", kind: "manual", summary: "Site-wide" },
		{ t: "2026-03-01", label: "B", id: "b", day: "2026-03-01", kind: "publish", summary: "Page /blog/b" },
		{ t: "2026-03-04", label: "C", id: "c", day: "2026-03-04", kind: "release", summary: "Host a.org" },
	];

	it("renders no marker and an unchanged label without markers", () => {
		const { container } = render(<LineChart label="Visitors" points={points} markers={[]} />);
		expect(container.querySelector("[data-marker]")).toBeNull();
		expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Visitors");
	});

	it("groups one bucket with a count badge and ends the chart label with the count", () => {
		const { container } = render(<LineChart label="Visitors" points={points} markers={many} />);
		const groups = container.querySelectorAll("[data-marker]");
		expect(groups).toHaveLength(2);
		expect(groups[0]?.getAttribute("role")).toBe("button");
		expect(groups[0]?.getAttribute("tabindex")).toBe("0");
		expect(groups[0]?.getAttribute("aria-label")).toBe("2 annotations on 2026-03-01");
		expect(groups[0]?.querySelector("[data-count]")?.textContent).toBe("2");
		expect(groups[1]?.querySelector("[data-count]")).toBeNull();
		expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Visitors, 3 annotations");
	});

	it("clusters buckets closer than MARKER_MIN_GAP at the mean x with the summed count", () => {
		const dense = Array.from({ length: 200 }, (_, i) => ({ t: `p${i}`, v: i }));
		const ms = [
			{ t: "p10", label: "X" },
			{ t: "p11", label: "Y" },
			{ t: "p11", label: "Z" },
		];
		const { container } = render(<LineChart label="Dense" points={dense} markers={ms} />);
		const groups = container.querySelectorAll("[data-marker]");
		expect(groups).toHaveLength(1);
		expect(groups[0]?.querySelector("[data-count]")?.textContent).toBe("3");
		expect(groups[0]?.getAttribute("aria-label")).toBe("3 annotations on p10 to p11");
		// x(10) = 54.4, x(11) = 57.3 on a 600 wide view box of 200 points after the 25.5 label gutter: mean 55.9.
		expect(groups[0]?.querySelector("line")?.getAttribute("x1")).toBe("55.9");
	});

	it("opens the popover by click, Enter and Space, closes on Escape and outside click, returns focus", () => {
		const actions = (m: { id?: string }) => <button type="button">Act {m.id}</button>;
		const { container, getByRole, queryByRole } = render(<LineChart label="Visitors" points={points} markers={many} markerActions={actions} />);
		const g = container.querySelector("[data-marker]") as HTMLElement;
		fireEvent.click(g);
		const dialog = getByRole("dialog");
		expect(dialog.getAttribute("aria-label")).toBe("Annotations on 2026-03-01");
		expect(document.activeElement).toBe(dialog);
		expect(dialog.textContent).toContain("A2026-03-01, Manual, Site-wide");
		expect(dialog.textContent).toContain("B2026-03-01, Published, Page /blog/b");
		expect(dialog.textContent).toContain("Act b");
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(queryByRole("dialog")).toBeNull();
		expect(document.activeElement).toBe(g);
		fireEvent.keyDown(g, { key: "Enter" });
		expect(queryByRole("dialog")).not.toBeNull();
		fireEvent.mouseDown(document.body);
		expect(queryByRole("dialog")).toBeNull();
		fireEvent.keyDown(container.querySelectorAll("[data-marker]")[1] as Element, { key: " " });
		expect(getByRole("dialog").textContent).toContain("C2026-03-04, Release, Host a.org");
	});
});
