import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The admin entry is bundled for the browser by the host. Any value import (not `import type`) that reaches the
 * `emdash` main entry, `emdash/runtime`, `emdash/astro`, `astro:*` or a `node:` module breaks the host build.
 */
const ROOT = join(__dirname, "..");
const FORBIDDEN = (s: string) => s === "emdash" || s === "emdash/runtime" || s === "emdash/astro" || s.startsWith("node:") || s.startsWith("astro");

function resolveFile(from: string, spec: string): string | undefined {
	const base = normalize(join(dirname(from), spec)).replace(/\.(jsx?|mjs)$/, "");
	for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) if (existsSync(base + ext)) return base + ext;
	return undefined;
}

function walk(entry: string): { seen: Set<string>; bad: string[] } {
	const seen = new Set<string>();
	const bad: string[] = [];
	const visit = (file: string, chain: string[]): void => {
		if (seen.has(file)) return;
		seen.add(file);
		const text = readFileSync(file, "utf8");
		const re = /^\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm;
		for (let m = re.exec(text); m; m = re.exec(text)) {
			const [, typeOnly, spec] = m;
			if (typeOnly || !spec) continue;
			if (spec.startsWith(".")) {
				const next = resolveFile(file, spec);
				if (next) visit(next, [...chain, file]);
			} else if (FORBIDDEN(spec)) bad.push(`${spec} <- ${[...chain, file].map((f) => f.replace(ROOT, "")).join(" > ")}`);
		}
	};
	visit(entry, []);
	return { seen, bad };
}

describe("admin bundle import graph", () => {
	it("reaches no server only module through value imports", () => {
		const { seen, bad } = walk(join(ROOT, "src/admin/index.tsx"));
		expect(seen.size).toBeGreaterThan(50);
		expect(bad).toEqual([]);
	});
});
