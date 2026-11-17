import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The page script makes no history call at all and never writes the address.
const DIR = join(__dirname, "..", "src", "client");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

const FORBIDDEN: [string, RegExp][] = [
	["history", /history/i],
	["replaceState", /replaceState/],
	["pushState", /pushState/],
	["popstate", /popstate/i],
	["location.replace", /location\s*\.\s*replace\b/],
	["location.assign", /location\s*\.\s*assign\b/],
	["location.hash", /\.\s*hash\b/],
];

describe("no history manipulation in the page script", () => {
	it("scans the source files and the generated script", () => {
		expect(FILES).toContain("boot.ts");
		expect(FILES).toContain("generated.ts");
	});

	it.each(FILES)("%s has no history reference, no fragment handling and no address write", (f) => {
		const src = readFileSync(join(DIR, f), "utf8");
		for (const [name, re] of FORBIDDEN) expect(re.test(src), `${f}: ${name}`).toBe(false);
	});
});
