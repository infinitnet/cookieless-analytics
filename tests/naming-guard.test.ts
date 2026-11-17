/** Satisfaction naming: pogo-sticking and "Returned from search" have one spelling each in src, docs and tests. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Files allowed to spell a banned name: only this guard, which has to name what it forbids. */
const ALLOW = new Set(["tests/naming-guard.test.ts"]);
const BANNED_NAMES = [/quick[\s_-]?returns?/i, /returned[\s_-]to[\s_-]search/i];

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

describe("satisfaction naming", () => {
	it("no other name of pogo-sticking or Returned from search appears", () => {
		const files = [...walk("src"), ...walk("docs"), ...walk("tests"), "README.md"].filter((f) => !ALLOW.has(f.replaceAll("\\", "/")));
		const hits = files.flatMap((f) => {
			const text = readFileSync(f, "utf8");
			return BANNED_NAMES.filter((re) => re.test(text)).map((re) => `${f}: ${re.source}`);
		});
		expect(hits).toEqual([]);
	});

	it("the guard sees a banned name", () => {
		expect(BANNED_NAMES.some((re) => re.test("Returned to search %"))).toBe(true);
		expect(BANNED_NAMES.some((re) => re.test("quick_return_rate"))).toBe(true);
	});
});
