/** Active time (interaction) is never called page time or engaged time where readers see it; durations say they are visible time. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAVEATS } from "../src/charts/caveats.js";
import { METRIC_DEFINITIONS } from "../src/charts/definitions.js";
import { metricLabel } from "../src/dashboards/tiles.js";

const ROOTS = ["src/admin", "src/charts", "src/dashboards", "src/data/templates", "docs", "README.md"];
const BANNED = /time on page|avg\. engaged time/i;

function files(path: string): string[] {
	if (!statSync(path).isDirectory()) return [path];
	return readdirSync(path, { recursive: true, encoding: "utf8" })
		.map((f) => join(path, f))
		.filter((f) => /\.(md|json|ts|tsx)$/.test(f) && statSync(f).isFile());
}

describe("time metric wording", () => {
	it("no user facing text calls active time 'time on page' or 'Avg. engaged time'", () => {
		const found: string[] = [];
		for (const f of ROOTS.flatMap(files))
			readFileSync(f, "utf8")
				.split("\n")
				.forEach((line, i) => BANNED.test(line) && found.push(`${f}:${i + 1}`));
		expect(found).toEqual([]);
	});

	it("the pattern catches what it forbids", () => {
		for (const s of ["Avg. time on page", "average Time On Page", "Avg. engaged time"]) expect(BANNED.test(s), s).toBe(true);
	});

	it("labels and definitions keep active time and duration apart", () => {
		expect(metricLabel("avg_time")).toBe("Avg. active time");
		expect(metricLabel("avg_engaged")).toBe("Avg. active time");
		expect(metricLabel("avg_visible")).toBe("Avg. visible time");
		expect(METRIC_DEFINITIONS.avg_time).toBe(CAVEATS.active_time);
		expect(CAVEATS.active_time).toContain("0 s");
		expect(METRIC_DEFINITIONS.avg_duration).toContain("Interaction is not required.");
	});
});
