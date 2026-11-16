import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/scrub-check.mjs");
const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "scrub-"));
	dirs.push(root);
	for (const [f, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, f)), { recursive: true });
		writeFileSync(join(root, f), text);
	}
	const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: root, stdio: "pipe" });
	git("init", "-q");
	git("add", "-A");
	git("commit", "-qm", "test: fixture");
	return root;
}

function denylist(text: string): string {
	const d = mkdtempSync(join(tmpdir(), "scrub-list-"));
	dirs.push(d);
	writeFileSync(join(d, "list.txt"), text);
	return join(d, "list.txt");
}

function scrub(root: string, args: string[], list?: string) {
	const env = { ...process.env };
	delete env.SCRUB_DENYLIST_FILE;
	if (list) env.SCRUB_DENYLIST_FILE = list;
	const r = spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { env, encoding: "utf8" });
	return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// A planted term built at run time so this file never contains it.
const PLANTED = ["acme", "widget", "corp"].join("");
const AUTHOR = ["Infini", "tnet"].join("");
const LEGAL = ["Consta", "ntin Oeste", "rling"].join("");

const CLEAN = {
	"README.md": `# Cookieless Analytics by ${AUTHOR}\n`,
	LICENSE: `Apache License\n\n   Copyright 2026 ${LEGAL} (${AUTHOR})\n`,
	NOTICE: `Product page: https://${AUTHOR.toLowerCase()}.io/cookieless-analytics/\n`,
	"package.json": JSON.stringify({ name: `@${AUTHOR.toLowerCase()}/cookieless-analytics`, author: AUTHOR, repository: { url: `git+https://github.com/${AUTHOR.toLowerCase()}/cookieless-analytics.git` } }),
	"src/admin/footer.tsx": `export const F = "Cookieless Analytics by ${AUTHOR} 1.0.0";\n`,
};

describe("scrub check", () => {
	it("passes with the author name in README, LICENSE, package.json and the admin footer", () => {
		const r = scrub(tree(CLEAN), ["--require", "--history"], denylist(`# private terms\n${PLANTED}\n`));
		expect(r.out).toContain("scrub: clean");
		expect(r.code).toBe(0);
	});

	it("fails on a planted term and shows the file and line", () => {
		const root = tree({ ...CLEAN, "docs/a.md": `one\ntwo ${PLANTED.toUpperCase()} three\n` });
		const r = scrub(root, ["--require"], denylist(PLANTED));
		expect(r.code).toBe(1);
		expect(r.out).toContain("docs/a.md:2: denylist term");
	});

	it("fails on a planted term in a file name", () => {
		const r = scrub(tree({ ...CLEAN, [`docs/${PLANTED}.md`]: "x\n" }), [], denylist(PLANTED));
		expect(r.code).toBe(1);
		expect(r.out).toContain(`docs/${PLANTED}.md (file name):0`);
	});

	it("finds a term that only survives in the history with --history", () => {
		const root = tree({ ...CLEAN, "docs/b.md": `${PLANTED}\n` });
		execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "rm", "-q", "docs/b.md"], { cwd: root });
		execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "chore: remove"], { cwd: root });
		const list = denylist(PLANTED);
		expect(scrub(root, [], list).code).toBe(0);
		const r = scrub(root, ["--history"], list);
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/commit [0-9a-f]{12}:\d+: denylist term/);
	});

	it("rejects a denylist that contains the author name, in any case", () => {
		for (const entry of [AUTHOR, AUTHOR.toUpperCase(), AUTHOR.toLowerCase().slice(0, 6)]) {
			const r = scrub(tree(CLEAN), ["--require"], denylist(`${PLANTED}\n${entry}\n`));
			expect(r.code).toBe(2);
			expect(r.out).toContain("matches the allowed author name");
		}
	});

	it("fails clearly with --require and no denylist, and runs the built-in patterns without it", () => {
		const r = scrub(tree(CLEAN), ["--require"]);
		expect(r.code).toBe(2);
		expect(r.out).toContain("SCRUB_DENYLIST_FILE");
		const missing = scrub(tree(CLEAN), ["--require"], "/nonexistent/list.txt");
		expect(missing.code).toBe(2);
		expect(missing.out).toContain("not found");
		expect(scrub(tree(CLEAN), []).code).toBe(0);
	});

	it("fails on credential patterns and an author site hostname without any denylist", () => {
		const hex = "0123456789abcdef".repeat(2);
		const cases = [
			`const apikey = "${hex}";`,
			`api_key: ${hex}`,
			`"${hex}" // api_key`,
			`client: 1234-abc${".apps.googleusercontent"}.com`,
			`secret: ${"GOCSPX"}-abcdef`,
			`see https://www.${AUTHOR.toLowerCase()}.io/page`,
		];
		for (const line of cases) {
			const r = scrub(tree({ ...CLEAN, "x.ts": `${line}\n` }), []);
			expect(r.code, line).toBe(1);
			expect(r.out, line).toContain("x.ts:1:");
		}
	});

	it("allows only the exact author credit and product page; other forms of the name or host still fail", () => {
		const [first = "", last = ""] = LEGAL.split(" ");
		const list = denylist(`${first}\n${last}\n`);
		expect(scrub(tree(CLEAN), ["--require"], list).code).toBe(0);
		for (const line of [`home: /home/${first.toLowerCase()}/x`, `mail ${last.toLowerCase()}@example.com`]) {
			const r = scrub(tree({ ...CLEAN, "x.ts": `${line}\n` }), [], list);
			expect(r.code, line).toBe(1);
			expect(r.out, line).toContain("x.ts:1: denylist term");
		}
		for (const line of [`https://${AUTHOR.toLowerCase()}.io/other-page/`, `https://www.${AUTHOR.toLowerCase()}.io/cookieless-analytics/`]) {
			const r = scrub(tree({ ...CLEAN, "x.ts": `${line}\n` }), []);
			expect(r.code, line).toBe(1);
			expect(r.out, line).toContain("x.ts:1: author site hostname");
		}
	});

	it("the repository tree itself is clean of the built-in patterns", () => {
		const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", env: { ...process.env, SCRUB_DENYLIST_FILE: "" } });
		expect(`${r.stdout}${r.stderr}`).toContain("scrub: clean");
		expect(r.status).toBe(0);
	});

	it("the real denylist is never in the repository", () => {
		const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n");
		expect(files.filter((f) => /denylist/i.test(f))).toEqual([]);
		expect(readFileSync(".gitignore", "utf8")).toMatch(/denylist/);
	});
});

describe("synthetic fixtures: no real data", () => {
	// Site hosts in fixtures are example domains; public referrer and provider hosts are allowed as what they are.
	// The user agent lists (uas.json, agent-data) are third party bot data with info URLs and are not site data.
	const PUBLIC = new Set(["www.google.com", "www.facebook.com", "chatgpt.com", "openai.com", "www.googleapis.com", "oauth2.googleapis.com", "ssl.bing.com", "www.bing.com"]);
	const isExample = (h: string) => /(^|\.)example\.(com|org|net)$/.test(h) || h === "localhost";

	it("every host in the site data fixtures is example.com, example.org, example.net or localhost", () => {
		const files = execFileSync("git", ["ls-files", "tests/fixtures"], { encoding: "utf8" })
			.split("\n")
			.filter((f) => f && !f.startsWith("tests/fixtures/agent-data/") && f !== "tests/fixtures/uas.json");
		expect(files.length).toBeGreaterThan(10);
		const bad: string[] = [];
		for (const f of files) {
			const text = readFileSync(f, "utf8");
			const hosts = [
				...[...text.matchAll(/(?:https?:\/\/|sc-domain:)([a-z0-9.-]+)/gi)].map((m) => m[1] ?? ""),
				// Bare host names in host fields and lists.
				...[...text.matchAll(/["'`]([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|de|dev|app|co|uk))["'`/]/gi)].map((m) => m[1] ?? ""),
			].map((h) => h.toLowerCase().replace(/\.$/, ""));
			for (const h of hosts) if (!isExample(h) && !PUBLIC.has(h)) bad.push(`${f}: ${h}`);
		}
		expect(bad).toEqual([]);
	});
});
