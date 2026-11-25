import { describe, expect, it } from "vitest";
import { DONUT_R, annotationCount, areaPath, axisScale, barWidth, bucketText, fmtTick, formatFamily, niceMax, rangeText, shapePath, slotColor, tickIndexes, donutArcs, fmt, foldSlices, groupDate, linePath, lineScale, MARKER_MIN_GAP, markerGroups, sparkPath, stackedRects, W } from "../src/charts/geometry.js";

describe("chart geometry", () => {
	it("scales an empty series without dividing by zero", () => {
		const s = lineScale(0, [], 200);
		expect(s.max).toBe(1);
		expect(linePath([], s)).toBe("");
		expect(s.y(null)).toBe(180);
	});

	it("centers a single point", () => {
		const s = lineScale(1, [5], 200);
		expect(s.x(0)).toBe(W / 2);
		expect(s.y(5)).toBe(16);
		expect(linePath([5], s)).toBe("M300 16");
		expect(s.step).toBe(W);
	});

	it("breaks the line on null and closes the area", () => {
		const s = lineScale(3, [2, null, 4], 200);
		expect(linePath([2, null, 4], s)).toBe("M0 98 M600 16");
		expect(areaPath("M0 98 L300 16", 2, lineScale(2, [2, 4], 200))).toBe("M0 98 L300 16 L600 180 L0 180 Z");
	});

	it("keeps the y axis label gutters free of points", () => {
		const s = lineScale(3, [], 200, 1, { left: 30, right: 10 });
		expect([s.x(0), s.x(1), s.x(2)]).toEqual([30, 310, 590]);
		expect(s.step).toBe(280);
		expect(lineScale(1, [], 200, 1, { left: 30, right: 10 }).x(0)).toBe(310);
	});

	it("handles long ranges", () => {
		const vals = Array.from({ length: 365 }, (_, i) => i);
		const s = lineScale(vals.length, vals, 200);
		expect(s.x(364)).toBe(W);
		expect(linePath(vals, s).split(" L")).toHaveLength(365);
	});

	it("bar widths, stacked bars and sparklines", () => {
		expect(barWidth(25, 50)).toBe(300);
		expect(barWidth(0, 0)).toBe(0);
		expect(stackedRects([{ parts: [3, 1] }], 160)[0]).toEqual([
			{ x: 60, y: 43, width: 480, height: 117 },
			{ x: 60, y: 4, width: 480, height: 39 },
		]);
		expect(sparkPath([0, 1])).toBe("M0 23 L100 1");
	});

	it("donut arcs: a 100 percent slice and an empty total", () => {
		const [a] = donutArcs([{ label: "all", value: 7 }]);
		expect(a).toMatchObject({ share: 1, dasharray: "251.32 253", dashoffset: -0 });
		expect(donutArcs([{ label: "x", value: 0 }])).toEqual([]);
	});

	it("donut arcs: no dash runs past the end of the circle or repeats, whatever the split", () => {
		const c = 2 * Math.PI * DONUT_R;
		for (let a = 1; a <= 120; a++) {
			for (let b = 1; b <= 120; b++) {
				for (const slices of [[a, b], [a, b, 3]]) {
					const arcs = donutArcs(slices.map((value, i) => ({ label: `s${i}`, value })));
					let prevEnd = 0;
					for (const arc of arcs) {
						const [len = 0, gap = 0] = arc.dasharray.split(" ").map(Number);
						const start = -arc.dashoffset;
						expect(start).toBeCloseTo(prevEnd, 6);
						expect(start + len).toBeLessThanOrEqual(c);
						expect(len + gap).toBeGreaterThan(c);
						prevEnd = start + len;
					}
					expect(c - prevEnd).toBeLessThan(0.011);
				}
			}
		}
		expect(foldSlices(Array.from({ length: 10 }, (_, i) => ({ label: `k${i}`, value: 1 })))).toHaveLength(7);
		expect(foldSlices(Array.from({ length: 10 }, (_, i) => ({ label: `k${i}`, value: 1 }))).at(-1)).toEqual({ label: "other", value: 4 });
	});

	it("formats numbers, percents and durations", () => {
		expect(fmt(1234)).toBe("1,234");
		expect(fmt(250_000)).toBe("250K");
		expect(fmt(0.256, "percent")).toBe("25.6%");
		expect(fmt(3725, "duration")).toBe("1h 2m");
		expect(fmt(null)).toBe("-");
	});
});

describe("markerGroups", () => {
	const xs: Record<string, number> = { a: 0, b: 5, c: 12, d: 100, e: 300 };
	const xOf = (t: string) => xs[t];
	const m = (t: string, id: string) => ({ t, id });

	it("groups per bucket with counts and drops buckets off the chart", () => {
		const g = markerGroups([m("d", "1"), m("d", "2"), m("e", "3"), m("zz", "4")], xOf);
		expect(g.map((x) => [x.x, x.count, x.ts])).toEqual([
			[100, 2, ["d"]],
			[300, 1, ["e"]],
		]);
	});

	it("merges adjacent buckets closer than MARKER_MIN_GAP at the mean x", () => {
		expect(MARKER_MIN_GAP).toBe(10);
		const g = markerGroups([m("c", "3"), m("a", "1"), m("b", "2"), m("b", "2b"), m("d", "4")], xOf);
		expect(g.map((x) => [x.x, x.count, x.ts, x.markers.map((y) => y.id)])).toEqual([
			[5.7, 4, ["a", "b", "c"], ["1", "2", "2b", "3"]],
			[100, 1, ["d"], ["4"]],
		]);
		expect(groupDate(g[0] as never)).toBe("a to c");
		expect(annotationCount(1)).toBe("1 annotation");
		expect(annotationCount(4)).toBe("4 annotations");
	});

	it("axes end on a nice value: 1, 2, 2.5 or 5 times a power of ten", () => {
		expect([0, -3, 0.41, 1, 3, 166, 312, 9200, 250].map(niceMax)).toEqual([1, 1, 0.5, 1, 5, 200, 500, 10000, 250]);
		const a = axisScale([166, null, 40], 16, 180);
		expect(a.ticks).toEqual([0, 100, 200]);
		expect([a.y(0), a.y(100), a.y(200), a.y(null)]).toEqual([180, 98, 16, 180]);
		const pos = axisScale([3, 8, 1], 16, 180, true);
		expect(pos.ticks).toEqual([10, 5.5, 1]);
		expect([pos.y(1), pos.y(10)]).toEqual([16, 180]);
		expect(axisScale([1, 1], 16, 180, true).max).toBe(2);
		// A negative value (net revenue after refunds) gets a nice minimum below 0 and stays inside the plot.
		const net = axisScale([-30, 100], 16, 180);
		expect([net.min, net.max]).toEqual([-50, 100]);
		expect(net.y(-30)).toBeLessThanOrEqual(180);
		expect(net.y(-50)).toBe(180);
	});

	it("tick labels, date ticks, bucket and range text", () => {
		expect([fmtTick(9200, "number"), fmtTick(0.25, "percent"), fmtTick(90, "duration"), fmtTick(5.5, "decimal"), fmtTick(1500, "money:USD")]).toEqual(["9.2K", "25%", "1m 30s", "5.5", "1.5K"]);
		expect(tickIndexes(0, 6)).toEqual([]);
		expect(tickIndexes(3, 6)).toEqual([0, 1, 2]);
		expect(tickIndexes(30, 3)).toEqual([0, 15, 29]);
		expect(bucketText("2026-03-09")).toBe("Mon 9 Mar 2026");
		expect(bucketText("2026-03-09 14:00", "hour")).toBe("9 Mar 2026, 14:00");
		expect(bucketText("2026-03-09", "week")).toBe("Week of 9 Mar 2026");
		expect(bucketText("2026-03-09 14:00", "hour", false)).toBe("14:00");
		expect(bucketText("2026-03-09 00:00", "hour", false)).toBe("9 Mar");
		expect(bucketText("p10")).toBe("p10");
		expect(rangeText("2026-02-15", "2026-02-28")).toBe("15 Feb to 28 Feb");
		expect(rangeText("2025-12-20", "2026-01-02")).toBe("20 Dec 2025 to 2 Jan 2026");
	});

	it("four slot shapes and colors, and scale families", () => {
		const shapes = [0, 1, 2, 3].map((i) => shapePath(i, 5, 5, 4));
		expect(new Set(shapes).size).toBe(4);
		expect(shapePath(4, 5, 5, 4)).toBe(shapes[0]);
		expect([0, 1, 2, 3].map(slotColor)).toEqual(["var(--ca-series-1, #2563eb)", "var(--ca-series-2, #16a34a)", "var(--ca-series-3, #f59e0b)", "var(--ca-series-5, #7c3aed)"]);
		expect(["number", "percent", "duration", "decimal", "money:EUR"].map((f) => formatFamily(f as never))).toEqual(["count", "percent", "duration", "decimal", "money:EUR"]);
	});
});
