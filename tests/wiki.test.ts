// The wiki pages in docs/wiki (published by scripts/publish-wiki.mjs) name only settings keys, event names and
// identifiers that exist in the code, link only to pages and images that exist, and copy the settings table.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LINK_EVENTS, RESERVED_EVENTS } from "../src/contract.js";
import { settingsSchema } from "../src/settings.js";

const WIKI = "docs/wiki";
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const pages = readdirSync(WIKI).filter((f) => f.endsWith(".md"));
const text = Object.fromEntries(pages.map((f) => [f, readFileSync(join(WIKI, f), "utf8")]));
const SRC = walk("src")
	.filter((f) => /\.(ts|tsx|json)$/.test(f))
	.map((f) => readFileSync(f, "utf8"))
	.join("\n");
/** Inline code spans outside fenced blocks. */
const spans = (md: string) => [...md.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\n]+)`/g)].map((m) => m[1] ?? "");

describe("wiki", () => {
	it("has the home, sidebar and footer and one page per feature", () => {
		for (const f of ["Home.md", "_Sidebar.md", "_Footer.md", "Quick-Install.md", "Events.md", "Settings-Reference.md"]) expect(pages, f).toContain(f);
		expect(pages.length).toBeGreaterThan(20);
	});

	it("every wiki link names an existing page and every image exists", () => {
		const broken: string[] = [];
		for (const [f, md] of Object.entries(text)) {
			for (const m of md.matchAll(/!?\[[^\]]*\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
				const t = m[1] ?? "";
				if (/^(https?:|mailto:)/.test(t)) continue;
				const ok = t.startsWith("images/") ? existsSync(join(WIKI, t)) : existsSync(join(WIKI, `${t}.md`));
				if (!ok) broken.push(`${f}: ${t}`);
			}
		}
		expect(broken).toEqual([]);
	});

	it("every wiki image has alt text and stays small: at most 200 KB, the README crops at most 150 KB", () => {
		for (const [f, md] of Object.entries(text)) for (const m of md.matchAll(/!\[([^\]]*)\]\(images\//g)) expect(m[1]?.length, f).toBeGreaterThan(9);
		const big = [
			...readdirSync(join(WIKI, "images")).map((f) => [join(WIKI, "images", f), 200 * 1024] as const),
			...readdirSync("docs/readme").map((f) => [join("docs/readme", f), 150 * 1024] as const),
		].filter(([f, max]) => statSync(f).size > max);
		expect(big).toEqual([]);
	});

	it("every page is in the sidebar", () => {
		const side = text["_Sidebar.md"] ?? "";
		const missing = pages.filter((f) => !f.startsWith("_") && f !== "Home.md" && !side.includes(`(${f.slice(0, -3)})`));
		expect(missing).toEqual([]);
	});

	it("every identifier in code spans exists in src: settings keys, `_` event names, camelCase names", () => {
		const unknown: string[] = [];
		for (const [f, md] of Object.entries(text)) {
			for (const s of spans(md)) {
				const id = s.replace(/\(\)$/, "");
				if (/^(_[a-z]+|[a-z]+(?:[A-Z][a-z0-9]*)+)$/.test(id) && !new RegExp(`\\b${id}\\b`).test(SRC)) unknown.push(`${f}: ${id}`);
			}
		}
		expect(unknown).toEqual([]);
	});

	it("Settings-Reference lists every settings key once, with the row of docs/settings.md", () => {
		const rowOf = (md: string) =>
			new Map([...md.matchAll(/^\| `([A-Za-z]+)`(?: \(Advanced\))? \| (.*) \|$/gm)].map((m) => [m[1] ?? "", m[2] ?? ""]));
		const wiki = rowOf(text["Settings-Reference.md"] ?? "");
		const doc = rowOf(readFileSync("docs/settings.md", "utf8"));
		expect([...wiki.keys()].sort()).toEqual(Object.keys(settingsSchema).sort());
		for (const [k, row] of wiki) expect(row, k).toBe(doc.get(k));
	});

	it("Events names every reserved event and every links convention event", () => {
		const md = text["Events.md"] ?? "";
		const names = [...Object.keys(RESERVED_EVENTS), LINK_EVENTS.click, LINK_EVENTS.view, LINK_EVENTS.sale];
		expect(names.filter((n) => !md.includes(`\`${n}\``))).toEqual([]);
	});

	it("has no em or en dash", () => {
		const hits = Object.entries(text).filter(([, md]) => /[\u2013\u2014]/.test(md)).map(([f]) => f);
		expect(hits).toEqual([]);
	});
});

describe("scripts/publish-wiki.mjs", () => {
	it("mirrors docs/wiki into the wiki repo as one commit by Infinitnet", () => {
		const tmp = mkdtempSync(join(tmpdir(), "wiki-test-"));
		const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd, encoding: "utf8" });
		try {
			const bare = join(tmp, "x.wiki.git");
			const seed = join(tmp, "seed");
			git(tmp, "init", "--quiet", "--bare", bare);
			git(tmp, "clone", "--quiet", bare, seed);
			writeFileSync(join(seed, "Old-Page.md"), "old\n");
			git(seed, "add", "-A");
			git(seed, "commit", "--quiet", "-m", "seed");
			git(seed, "push", "--quiet", "origin", "HEAD");
			execFileSync("node", ["scripts/publish-wiki.mjs"], { env: { ...process.env, WIKI_REMOTE: bare, GITHUB_TOKEN: "" }, encoding: "utf8" });
			const out = join(tmp, "out");
			git(tmp, "clone", "--quiet", bare, out);
			expect(existsSync(join(out, "Old-Page.md"))).toBe(false);
			expect(readFileSync(join(out, "Home.md"), "utf8")).toBe(text["Home.md"]);
			expect(existsSync(join(out, "images"))).toBe(true);
			expect(git(out, "log", "-1", "--format=%an")).toBe("Infinitnet\n");
			// A second run with nothing new adds no commit.
			expect(execFileSync("node", ["scripts/publish-wiki.mjs"], { env: { ...process.env, WIKI_REMOTE: bare }, encoding: "utf8" })).toContain("up to date");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});
});
