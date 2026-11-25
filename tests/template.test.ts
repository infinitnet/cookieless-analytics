// template/ is the site the README's Deploy to Cloudflare button copies into a new repository: it must stand on its
// own, install the plugin from npm, and give Cloudflare everything it reads (bindings, cron, secrets, descriptions).
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const T = "template";
const read = (f: string) => readFileSync(join(T, f), "utf8");
/** JSONC: drops line comments and trailing commas (the template has no `//` inside strings except URLs, kept by the lookbehind). */
const jsonc = (s: string) => JSON.parse(s.replace(/(?<!:)\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
const pkg = JSON.parse(read("package.json")) as {
	private: boolean;
	scripts: Record<string, string>;
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
	cloudflare: { bindings: Record<string, { description: string }> };
};
const wrangler = jsonc(read("wrangler.jsonc")) as {
	main: string;
	d1_databases?: Array<{ binding: string }>;
	r2_buckets?: Array<{ binding: string }>;
	kv_namespaces?: Array<{ binding: string }>;
	queues?: { producers?: Array<{ binding: string }> };
	triggers: { crons: string[] };
};
const files = readdirSync(T, { recursive: true, withFileTypes: true })
	.filter((d) => d.isFile())
	.map((d) => join(d.parentPath, d.name).slice(T.length + 1));
const BUTTON = "https://deploy.workers.cloudflare.com/?url=https://github.com/infinitnet/cookieless-analytics/tree/main/template";

describe("template/ (Deploy to Cloudflare)", () => {
	it("depends on @infinitnet/cookieless-analytics from npm and on nothing local", () => {
		expect(pkg.private).toBe(true);
		expect(pkg.dependencies["@infinitnet/cookieless-analytics"]).toBe("^1.0.0");
		for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
			expect(range, name).not.toMatch(/^(workspace|file|link|portal|git|github):|^\.|^\//);
		}
		expect(files.filter((f) => /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/.test(f))).toEqual([]);
		expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
	});

	it("builds and deploys with the scripts Cloudflare runs", () => {
		expect(pkg.scripts.build).toBe("astro build");
		expect(pkg.scripts.deploy).toBe("astro build && wrangler deploy");
	});

	it("wrangler.jsonc has the D1 binding DB, the R2 binding MEDIA, an existing entry point and the one-minute cron", () => {
		expect(wrangler.d1_databases?.map((d) => d.binding)).toEqual(["DB"]);
		expect(wrangler.r2_buckets?.map((d) => d.binding)).toEqual(["MEDIA"]);
		expect(existsSync(join(T, wrangler.main))).toBe(true);
		expect(wrangler.triggers.crons).toEqual(["* * * * *"]);
	});

	it("every binding and every secret has a description, and the capacity profile note is there", () => {
		const secrets = [...read(".dev.vars.example").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? "");
		expect(secrets).toEqual(["EMDASH_ENCRYPTION_KEY"]);
		const names = [
			...(wrangler.d1_databases ?? []),
			...(wrangler.r2_buckets ?? []),
			...(wrangler.kv_namespaces ?? []),
			...(wrangler.queues?.producers ?? []),
		].map((b) => b.binding);
		for (const n of [...names, ...secrets]) expect(pkg.cloudflare.bindings[n]?.description.trim().length ?? 0, n).toBeGreaterThan(20);
		expect(Object.keys(pkg.cloudflare.bindings).sort()).toEqual([...names, ...secrets].sort());
		expect(pkg.cloudflare.bindings.DB?.description).toMatch(/Workers Free[\s\S]*Small/);
		expect(pkg.cloudflare.bindings.EMDASH_ENCRYPTION_KEY?.description).toContain("npx emdash secrets generate");
		expect(read("README.md")).toMatch(/Small on the Workers Free plan/);
	});

	it("wires the plugin as docs/install.md describes", () => {
		const astro = read("astro.config.mjs");
		expect(astro).toContain('import cookielessAnalytics from "@infinitnet/cookieless-analytics";');
		expect(astro).toContain('import cookielessAnalyticsIntegration from "@infinitnet/cookieless-analytics/integration";');
		expect(astro).toContain("plugins: [cookielessAnalytics()]");
		expect(astro.indexOf("cookielessAnalyticsIntegration()")).toBeGreaterThan(astro.indexOf("emdash({"));
		expect(astro).not.toContain("ignorePathPrefixes");
		expect(read("src/layouts/Base.astro")).toMatch(/<EmDashHead page=\{pageCtx\} \/>/);
	});

	it("keeps the starter's MIT license and the attribution NOTICE", () => {
		expect(read("LICENSE")).toMatch(/^The MIT License\n\nCopyright 2026 Cloudflare Inc\./);
		expect(read("NOTICE")).toContain("https://github.com/emdash-cms/templates/tree/main/starter-cloudflare");
		expect(read(".gitignore")).toContain("!.dev.vars.example");
	});

	it("the README, docs/install.md and the wiki carry the same button", () => {
		for (const f of ["README.md", "docs/install.md", "docs/wiki/Quick-Install.md", "template/README.md"]) {
			expect(readFileSync(f, "utf8"), f).toContain(`[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](${BUTTON})`);
		}
	});

	it("has no em or en dashes", () => {
		for (const f of files) expect(read(f), f).not.toMatch(/[\u2013\u2014]/);
	});
});
