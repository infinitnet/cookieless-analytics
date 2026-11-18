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

describe("registry companion docs", () => {
	const DIR = "packages/companion";
	const SECTIONS = ["description", "installation", "faq", "security", "changelog"];
	const graphemes = (s: string) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].length;
	const files = [`${DIR}/README.md`, ...SECTIONS.map((s) => `${DIR}/listing/${s}.md`), "docs/wiki/Registry-Companion.md"];
	const companionReadme = read(`${DIR}/README.md`);

	it("the manifest description fits 140 graphemes and each listing section 2,000 graphemes and 20,000 bytes", () => {
		const description = read(`${DIR}/emdash-plugin.jsonc`).match(/^\t"description": "([^"]+)"/m)?.[1] ?? "";
		expect(description).toMatch(/^Guided setup for Cookieless Analytics by Infinitnet/);
		expect(graphemes(description)).toBeLessThanOrEqual(140);
		for (const s of SECTIONS) {
			const md = read(`${DIR}/listing/${s}.md`);
			expect(graphemes(md), s).toBeLessThan(2000);
			expect(Buffer.byteLength(md), s).toBeLessThan(20000);
		}
	});

	it("the companion README stays under 20 KB because it is packed into the bundle", () => {
		expect(Buffer.byteLength(companionReadme)).toBeLessThan(20 * 1024);
	});

	it("the companion README opens with the definition and the honest second paragraph", () => {
		const paras = companionReadme.split("\n\n");
		expect(paras[0]).toBe("# Cookieless Analytics Companion");
		expect(paras[1]).toBe(
			"Cookieless Analytics Companion is a sandboxed EmDash plugin that guides and confirms the install of Cookieless Analytics by Infinitnet, the full cookieless web analytics plugin for EmDash.",
		);
		expect(paras[2]).toBe("It does not count visits. Installing it from the registry does not install or trust the npm package.");
		expect(companionReadme).toContain("https://www.npmjs.com/package/@infinitnet/cookieless-analytics");
	});

	it("both READMEs link each other with relative paths that resolve", () => {
		expect(read("README.md")).toContain("](packages/companion/README.md)");
		expect(companionReadme).toContain("](../../README.md)");
		const broken = [...companionReadme.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)]
			.map((m) => m[1] ?? "")
			.filter((t) => !/^[a-z]+:/i.test(t) && !existsSync(`${DIR}/${t}`));
		expect(broken).toEqual([]);
	});

	it("listing sections use absolute links only, since the registry shows them outside the repository", () => {
		for (const s of SECTIONS) expect([...read(`${DIR}/listing/${s}.md`).matchAll(/\]\((?!https:\/\/)([^)]+)\)/g)].map((m) => m[1]), s).toEqual([]);
	});

	it("installation says first that a site without a sandbox installs the full plugin from npm", () => {
		expect(read(`${DIR}/listing/installation.md`).split("\n")[0]).toMatch(/^A site without a plugin sandbox does not need the companion\..*from npm/);
	});

	it("the companion text has no dash, no hedging tag, no empty table header, no image and no publisher handle", () => {
		const emptyHeader = (md: string) => md.split("\n").some((l, i, ls) => /^\s*\|(\s*\|)+\s*$/.test(l) && /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(ls[i + 1] ?? ""));
		for (const f of files) {
			const md = read(f);
			expect(md, f).not.toMatch(/[\u2013\u2014]|UNVERIFIED|!\[/);
			expect(md, f).not.toMatch(/@[a-z0-9-]+\.[a-z0-9.-]+\/cookieless-analytics-companion|did:plc:/);
			expect(emptyHeader(md), f).toBe(false);
			expect(md, f).toMatch(/Cookieless Analytics (Companion|by Infinitnet)/);
		}
		for (const f of ["README.md", `${DIR}/README.md`, `${DIR}/listing/installation.md`, "docs/wiki/Registry-Companion.md"]) {
			expect(read(f), f).toContain("search the Registry for Cookieless Analytics Companion");
		}
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
