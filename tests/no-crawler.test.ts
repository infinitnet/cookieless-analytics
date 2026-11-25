/** The plugin has no crawler reporting: no crawler report artifact in the source or the tests (bot exclusion is separate). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `audience =(?!=)` matches the SQL predicate, not the classifier's `audience ===` comparisons.
const BANNED = [/ca_ranges/, /ca_robot_daily/, /crawler_log/, /crawlerLog/, /disableRouteCache/, /audience =(?!=)/];
const SELF = "no-crawler.test.ts";

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs|json|snap)$/.test(n) && n !== SELF ? [p] : [];
	});
}

describe("no crawler reporting", () => {
	it("no source or test file mentions a crawler report artifact", () => {
		const hits = files("src")
			.concat(files("tests"))
			.flatMap((f) => {
				const text = readFileSync(f, "utf8");
				return BANNED.filter((re) => re.test(text)).map((re) => `${f}: ${re.source}`);
			});
		expect(hits).toEqual([]);
	});

	it("there is no src/robots directory", () => {
		expect(() => statSync("src/robots")).toThrow();
	});
});
