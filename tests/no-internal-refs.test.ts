/** The public tree describes the product only: no reference to a private specification, internal reviews, work lanes or measurement ids. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SELF = "tests/no-internal-refs.test.ts";
const SKIP = /^(dist\/|src\/data\/)|^pnpm-lock\.yaml$|\.(png|jpe?g|gif|webp|ico|woff2?|tgz)$/i;

const MARKERS: RegExp[] = [
	/SPEC [0-9]/,
	/DEVIATIONS/,
	/\bspecification\b/i,
	/\blane[- ][a-z0-9]+\b/i,
	/\breview (section )?[A-Z]{1,2}-?[A-Z]?[0-9]*\b/,
	/\bowner (decision|feedback|rule)\b/i,
	/\bgate item [0-9]/i,
	/\bspike\b/i,
	/\bN[0-9]\b/,
	/\.omc\b/,
	/\bearlier (build|layout|version)\b/i,
];

function hits(text: string): string[] {
	return MARKERS.filter((re) => re.test(text)).map((re) => re.source);
}

describe("no internal references", () => {
	it("no tracked text file carries an internal marker", () => {
		const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
			.split("\0")
			.filter((f) => f && f !== SELF && !SKIP.test(f));
		const found: string[] = [];
		for (const f of files) {
			let text: string;
			try {
				text = readFileSync(f, "utf8");
			} catch {
				continue;
			}
			text.split("\n").forEach((line, i) => {
				for (const m of hits(line)) found.push(`${f}:${i + 1}: ${m}`);
			});
		}
		expect(found).toEqual([]);
	});

	it("the markers catch what they forbid", () => {
		for (const s of ["(SPEC 36.15)", "docs/DEVIATIONS.md", "the specification", "lane FP", "(review B-L17)", "review section E", "owner feedback", "Gate item 3", "the spike", "N0 on D1", ".omc/", "the earlier layout"]) {
			expect(hits(s), s).not.toEqual([]);
		}
		for (const s of ["a review of the rules", "Main site", "A-1001", "SPECIAL", "previous period", "the plane"]) {
			expect(hits(s), s).toEqual([]);
		}
	});
});
