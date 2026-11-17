/** The report is named "Search Satisfaction" wherever a person reads it; the id `satisfaction` stays. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ADMIN_PAGES } from "../src/index.js";
import { settingsSchema } from "../src/settings.js";
import satisfactionTemplate from "../src/data/templates/satisfaction.json";

/** The old standalone name: the word not preceded by "Search " (or "Search-", the wiki page). */
const OLD_NAME = /(?<!Search[ -])\bsatisfaction\b/gi;
/** Text that names the report id `satisfaction` (agent messages and descriptions), not the page. */
const ALLOWED = [/\bsatisfaction params\.(by|rank)\b/g, /\bsatisfaction params\.rank\)/g];
/** A link target, image path or anchor that names the old page or file (ids such as `satisfaction_series` are not targets). */
const OLD_TARGET = /(?<![Ss]earch-)\b[Ss]atisfaction\b/;

const ID = /^[a-z0-9_./:-]*$/;

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

/** Prose of a markdown file: code, link targets and HTML attributes are identifiers or paths. */
const mdProse = (s: string) =>
	s
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`\n]*`/g, "")
		.replace(/\]\([^)]*\)/g, "]")
		.replace(/(href|src)="[^"]*"/g, "");

/** What a person can read in a source file: string literals and JSX text, minus pure identifiers and paths. */
function sourceText(code: string, file = "x.tsx"): string {
	const out: string[] = [];
	const visit = (n: ts.Node) => {
		if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
		if (ts.isStringLiteralLike(n) || ts.isTemplateLiteralToken(n) || ts.isJsxText(n)) out.push(n.text);
		ts.forEachChild(n, visit);
	};
	visit(ts.createSourceFile(file, code, ts.ScriptTarget.Latest, false, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
	// Lowercase tokens are ids and paths (`satisfaction`, `/satisfaction`); CSS comments are never shown.
	return out
		.filter((t) => !ID.test(t))
		.join("\n")
		.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every string value of a JSON file. */
const jsonText = (v: unknown): string => (typeof v === "string" ? (ID.test(v) ? "" : v) : v && typeof v === "object" ? Object.values(v).map(jsonText).join("\n") : "");

function hits(file: string, text: string): string[] {
	const clean = ALLOWED.reduce((t, re) => t.replace(re, ""), text);
	return [...clean.matchAll(OLD_NAME)].map((m) => `${file}: ...${clean.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 30).replace(/\n/g, " ")}...`);
}

function oldNameHits(): string[] {
	const md = [...walk("docs"), ...walk("template"), "README.md", "CONTRIBUTING.md"].filter((f) => f.endsWith(".md") && existsSync(f));
	const src = [...walk("src"), ...walk("template"), ...walk("scripts"), "docs/openapi.json"].filter((f) => /\.(tsx?|m?js|json)$/.test(f));
	return [...md.flatMap((f) => hits(f, mdProse(readFileSync(f, "utf8")))), ...src.flatMap((f) => hits(f, f.endsWith(".json") ? jsonText(JSON.parse(readFileSync(f, "utf8"))) : sourceText(readFileSync(f, "utf8"), f)))];
}

/** Link targets and `href` or `src` values of a markdown file. */
const targets = (s: string) => [...s.matchAll(/\]\(([^)\s]+)[^)]*\)|(?:href|src)="([^"]*)"/g)].map((m) => m[1] ?? m[2] ?? "");

function oldTargets(): string[] {
	const md = [...walk("docs"), ...walk("template"), "README.md", "CONTRIBUTING.md"].filter((f) => f.endsWith(".md") && existsSync(f));
	return md.flatMap((f) => targets(readFileSync(f, "utf8")).filter((t) => OLD_TARGET.test(t)).map((t) => `${f}: ${t}`));
}

describe("Search Satisfaction name", () => {
	it("no user visible text uses the old standalone name: docs, the agent catalog (openapi.json), src, template and scripts", () => {
		expect(oldNameHits()).toEqual([]);
	});

	it("no link target, image path or anchor names the old page", () => {
		expect(oldTargets()).toEqual([]);
	});

	it("the sidebar entry, the dashboard template and the wiki page carry the new name", () => {
		expect(ADMIN_PAGES.find((p) => p.path === "/satisfaction")?.label).toBe("Search Satisfaction");
		expect(satisfactionTemplate.name).toBe("Search Satisfaction");
		expect(existsSync("docs/wiki/Search-Satisfaction.md")).toBe(true);
		expect(existsSync("docs/wiki/Satisfaction.md")).toBe(false);
	});

	it("the screenshot stub uses the default thresholds, so the image's threshold line matches the settings", () => {
		const m = /thresholds: \{ long_click_seconds: (\d+), bad_experience_seconds: (\d+) \}/.exec(readFileSync("scripts/dev/wiki-shots/stub.js", "utf8"));
		expect([Number(m?.[1]), Number(m?.[2])]).toEqual([settingsSchema.longClickSeconds.default, settingsSchema.badExperienceSeconds.default]);
	});

	it("the guard sees the old name and passes the new one and identifiers", () => {
		expect(hits("x", mdProse("Open **Satisfaction** in the sidebar."))).toHaveLength(1);
		expect(hits("x", sourceText('const t = <h1 title="Satisfaction">x</h1>;'))).toHaveLength(1);
		expect(hits("x", sourceText('const a = { label: "Search Satisfaction", report: "satisfaction", s: "satisfaction_series" };'))).toEqual([]);
		expect(hits("x", mdProse("The `satisfaction` report, see [Search Satisfaction](Search-Satisfaction)."))).toEqual([]);
		expect(hits("x", jsonText({ description: "Bounce rate (satisfaction reports)" }))).toHaveLength(1);
		expect(hits("x", sourceText('page.getByRole("heading", { name: "Satisfaction" });', "x.mjs"))).toHaveLength(1);
		expect(targets("[a](Satisfaction) ![b](images/satisfaction.png) <img src=\"docs/readme/satisfaction.png\"> [c](sessions.md#satisfaction-metrics)").filter((t) => OLD_TARGET.test(t))).toHaveLength(4);
		expect(targets("[a](Search-Satisfaction) ![b](images/search-satisfaction.png) [c](sessions.md#search-satisfaction-metrics)").filter((t) => OLD_TARGET.test(t))).toEqual([]);
	});
});
