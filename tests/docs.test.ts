import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scopeSummary } from "../src/annotations/scope.js";
import { settingsSchema } from "../src/settings.js";

const read = (f: string) => readFileSync(f, "utf8");
const DOCS = [
	"install",
	"privacy",
	"sessions",
	"bots",
	"filters",
	"integration",
	"AGENTS",
	"search-sources",
	"multi-site",
	"client-sites",
	"settings",
	"limits",
	"release",
	"dashboards",
	"annotations",
	"revenue",
	"behaviour",
	"content",
	"email",
	"mcp",
	"design-notes",
	"performance",
];

/** Every line of `src`, `docs` and README.md matching the pattern, as `file:line: text`. */
function grep(re: RegExp): string[] {
	const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "src", "docs", "README.md"], { encoding: "utf8" })
		.split("\0")
		.filter(Boolean);
	const hits: string[] = [];
	for (const f of files) {
		read(f)
			.split("\n")
			.forEach((line, i) => {
				if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 160)}`);
			});
	}
	return hits;
}

describe("docs set", () => {
	it("every doc exists and the repo has the root notices", () => {
		for (const d of DOCS) expect(existsSync(`docs/${d}.md`), d).toBe(true);
		for (const f of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "CONTRIBUTING.md", "SECURITY.md", "docs/openapi.json"]) expect(existsSync(f), f).toBe(true);
	});

	it("README, docs and the wiki state facts plainly: no UNVERIFIED tag", () => {
		expect(grep(/UNVERIFIED/).filter((h) => !h.startsWith("src/"))).toEqual([]);
	});

	it("no markdown table in the README, docs or the wiki has a header row of empty cells", () => {
		const emptyHeader = (md: string) => md.split("\n").filter((l, i, ls) => /^\s*\|(\s*\|)+\s*$/.test(l) && /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(ls[i + 1] ?? ""));
		expect(emptyHeader("| | |\n|---|---|\n| a | b |")).toHaveLength(1);
		expect(emptyHeader("| Feature | What it does |\n|---|---|")).toHaveLength(0);
		const files = ["README.md", ...["docs", "docs/wiki"].flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => `${d}/${f}`))];
		expect(files.flatMap((f) => emptyHeader(read(f)).map((l) => `${f}: ${l}`))).toEqual([]);
	});

	it("every relative link between docs resolves", () => {
		const broken: string[] = [];
		const sources = ["README.md", "CONTRIBUTING.md", "SECURITY.md", ...readdirSync("docs").filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`)];
		for (const f of sources) {
			const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : "";
			for (const m of read(f).matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
				const target = m[1] ?? "";
				if (/^[a-z]+:/i.test(target)) continue;
				if (!existsSync(dir + target)) broken.push(`${f}: ${target}`);
			}
		}
		expect(broken).toEqual([]);
	});

	it("docs/settings.md is generated from settingsSchema and lists every key", () => {
		execFileSync(process.execPath, ["scripts/build-settings-doc.mjs", "--check"], { stdio: "pipe" });
		const doc = read("docs/settings.md");
		for (const key of Object.keys(settingsSchema)) expect(doc, key).toContain(`| \`${key}\` |`);
	});

	it("search sources has the SEO views and Annotation impact chapters, limits the 93 day arithmetic", () => {
		const search = read("docs/search-sources.md");
		expect(search).toMatch(/^#+ .*SEO views/m);
		expect(search).toMatch(/^#+ .*Annotation impact/m);
		expect(read("docs/limits.md")).toMatch(/93 days?/);
		expect(read("docs/limits.md")).toMatch(/50 (D1 )?queries/);
	});

	it("sessions describe passive links, the visitor key join, the key change limit and the satisfaction caveats", () => {
		const s = read("docs/sessions.md");
		expect(s).toMatch(/passive on links and the address/);
		expect(s).toMatch(/starts a new session on the next full page load/);
		expect(s).toMatch(/channel is Direct/);
		expect(s).toMatch(/^#+ Search Satisfaction metrics/m);
		expect(s).toContain("Pogo-sticking, returned from search, search re-entry and back/forward loads are estimates from browser navigation signals.");
		expect(s).toContain(
			"Search Satisfaction is computed from session rows, which are kept for the raw retention window only. Choose a more recent range or raise the raw retention.",
		);
	});

	it("release lists the shared view and the 1.0 live checks", () => {
		const r = read("docs/release.md").toLowerCase();
		for (const w of [
			"private window",
			"password",
			"request.cf",
			"cron",
			"dialect",
			"service account",
			"getusersites",
			"tag manager",
			"options",
			"agent/v1/events",
			"script size",
			"editor panel",
			"scheduled email",
			"mcp",
		]) {
			expect(r, w).toContain(w);
		}
	});

	it("every annotation editor string appears in the docs or the admin", () => {
		const corpus = [
			...readdirSync("docs").filter((f) => f.endsWith(".md")).map((f) => read(`docs/${f}`)),
			...execFileSync("git", ["ls-files", "src/admin", "src/annotations", "src/routes/annotations.ts"], { encoding: "utf8" })
				.split("\n")
				.filter(Boolean)
				.map(read),
		].join("\n");
		for (const s of [
			"Site-wide",
			"This page",
			"This section",
			"Back to simple",
			"in the last 30 days",
			"The pattern matches more than 2,000 values. Make it more specific.",
			"Add at least one rule or choose Site-wide.",
			"Host must be a lowercase hostname without scheme or port.",
			"Path must start with /.",
			"At most 10 rules per kind and 20 in total.",
			"Combine fewer rules of different kinds in one scope.",
			"Query rules apply to Search data only; this site has no Search source yet.",
			"Search charts only",
		]) {
			expect(corpus, s).toContain(s);
		}
		expect(scopeSummary(undefined)).toBe("Site-wide");
		expect(scopeSummary({ v: 1, path: [{ op: "is", value: "/blog/x" }] })).toBe("Page /blog/x");
		expect(scopeSummary({ v: 1, path: [{ op: "prefix", value: "/blog/" }] })).toBe("Pages starting with /blog/");
		expect(scopeSummary({ v: 1, host: [{ op: "is", value: "shop.example.com" }] })).toBe("Host shop.example.com");
	});

	it("annotations doc covers scopes, the toggle and automatic annotations", () => {
		const a = read("docs/annotations.md");
		for (const w of ["ann=0", "viewer.annotations", "{slug}", "shown when unsure", "regex", "prefix"]) expect(a, w).toContain(w);
		expect(read("docs/AGENTS.md")).toMatch(/^#+ .*Annotations/m);
		expect(read("docs/AGENTS.md")).toMatch(/^#+ .*Search Satisfaction/m);
	});

	it("the Postgres setup names caching off, the driver floor and the option, and says the providers other than Neon should work", () => {
		for (const f of ["docs/install.md", "docs/wiki/Postgres-Hyperdrive.md"]) {
			const d = read(f);
			for (const w of ["--caching-disabled", "nodejs_compat", "8.16.3", 'engine: "postgres"', "placement", "100,000 statements", "Workers VPC"]) expect(d, `${f}: ${w}`).toContain(w);
			const rows = d.split("\n").filter((l) => /^\| (Supabase|A provider's pooled|Pooled endpoints)/.test(l));
			expect(rows.length, f).toBe(2);
			for (const r of rows) expect(r, f).toContain("Should work");
			expect(d, f).not.toMatch(/page rendering (waits|is slowed)/i);
		}
		expect(read("docs/limits.md")).toMatch(/^## Postgres through Hyperdrive/m);
	});

	it("revenue docs state the one currency rule and no exchange rates", () => {
		const r = read("docs/revenue.md").toLowerCase();
		expect(r).toContain("exchange rate");
		expect(r).toMatch(/one currency/);
		expect(r).toMatch(/raw window/);
	});
});

describe("features outside the scope", () => {
	it("crawler or robots appear only in the exclusion data, the bots doc, header names and exclusion sentences", () => {
		const allowedFile = /^(src\/data\/agents(\.curated)?\.json|src\/agents\/rules\.ts|docs\/bots\.md|docs\/design-notes\.md):/;
		const allowedLine = /x-robots-tag|name="robots"|ai\.robots\.txt|crawler-user-agents|not counted|excluded|never leave/i;
		const hits = grep(/crawler|robots/i).filter((h) => !allowedFile.test(h) && !allowedLine.test(h));
		expect(hits).toEqual([]);
	});

	it("no Web Vitals anywhere", () => {
		expect(grep(/vitals/i)).toEqual([]);
	});

});
