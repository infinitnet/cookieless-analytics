import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCT_NAME, PRODUCT_URL, VERSION } from "../src/contract.js";
import { CAPABILITIES, cookielessAnalytics, PLUGIN_LABELS } from "../src/index.js";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
	name: string;
	version: string;
	description: string;
	author: { name: string; url: string };
	license: string;
	homepage: string;
	keywords: string[];
	repository: { url: string };
	files: string[];
	exports: Record<string, string | { types: string; default: string }>;
	publishConfig: Record<string, unknown>;
	scripts: Record<string, string>;
};
const readme = readFileSync("README.md", "utf8");
const TAGLINE = "Self-hosted, cookieless web analytics. Runs on EmDash, tracks any site.";
// The base description plus its feature clauses.
const DESCRIPTION =
	"Cookieless Analytics by Infinitnet: self-hosted, privacy-first web analytics. Runs on EmDash CMS (Cloudflare Workers and D1) and tracks any site: real sessions without cookies, channels, goals, funnels, Search Console and Bing data, client sites through a snippet, custom dashboards you can share by link, revenue by source and currency, and an API for agents, inside your CMS admin.";

describe("package metadata", () => {
	it("name, version, author, licence and repository", () => {
		expect(pkg.name).toBe("@infinitnet/cookieless-analytics");
		expect(pkg.version).toBe("1.0.0");
		expect(VERSION).toBe(pkg.version);
		expect(cookielessAnalytics().version).toBe(pkg.version);
		expect(pkg.author).toEqual({ name: "Constantin Oesterling (Infinitnet)", url: "https://github.com/infinitnet" });
		expect(pkg.license).toBe("Apache-2.0");
		expect(pkg.homepage).toBe(PRODUCT_URL);
		expect(pkg.repository.url).toBe("git+https://github.com/infinitnet/cookieless-analytics.git");
	});

	it("description and keywords, equal to the plugin's own description", () => {
		expect(pkg.description).toBe(DESCRIPTION);
		expect(PLUGIN_LABELS.description).toBe(DESCRIPTION);
		expect(PLUGIN_LABELS.displayName).toBe(PRODUCT_NAME);
		for (const k of [
			"cookieless analytics",
			"web analytics",
			"privacy analytics",
			"self hosted",
			"emdash",
			"emdash-plugin",
			"search console",
			"astro",
			"cloudflare workers",
			"d1",
			"tag manager",
			"dashboards",
			"revenue analytics",
			"ecommerce analytics",
		]) {
			expect(pkg.keywords).toContain(k);
		}
	});

	it("publishes dist, src and the five notices, public, with no token or provenance setting in package.json (trusted publishing adds provenance)", () => {
		expect(pkg.files).toEqual(["dist", "src", "README.md", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]);
		expect(pkg.publishConfig).toEqual({ access: "public" });
		expect(pkg.scripts.prepublishOnly).toBe("pnpm build && pnpm test && pnpm typecheck && pnpm scrub");
		expect(pkg.scripts.scrub).toBe("node scripts/scrub-check.mjs --require");
	});

	it("every export points at a committed file", () => {
		for (const [name, target] of Object.entries(pkg.exports)) {
			for (const f of typeof target === "string" ? [target] : [target.types, target.default]) expect(existsSync(f), `${name}: ${f}`).toBe(true);
		}
	});

	it("the packed tarball holds only dist, src, README, LICENSE, NOTICE and THIRD_PARTY_NOTICES", () => {
		type Packed = { filename: string; files: Array<{ path: string }> };
		// npm 10 prints an array, npm 11 an object keyed by package name.
		const raw = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) as Packed[] | Record<string, Packed>;
		const info = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];
		expect(info?.filename).toBe("infinitnet-cookieless-analytics-1.0.0.tgz");
		const top = new Set(info?.files.map((f) => f.path.split("/")[0]));
		expect([...top].sort()).toEqual(["LICENSE", "NOTICE", "README.md", "THIRD_PARTY_NOTICES.md", "dist", "package.json", "src"]);
	}, 30_000);

	it("declares exactly the expected capabilities", () => {
		expect([...CAPABILITIES].sort()).toEqual(["content:read", "email:send", "hooks.page-fragments:register", "network:request", "schema:read"]);
		expect([...(cookielessAnalytics().capabilities ?? [])].sort()).toEqual([...CAPABILITIES].sort());
	});
});

describe("licence: LICENSE, NOTICE and package.json agree", () => {
	const license = readFileSync("LICENSE", "utf8");
	const notice = readFileSync("NOTICE", "utf8");

	it("Apache-2.0 with one copyright holder", () => {
		expect(pkg.license).toBe("Apache-2.0");
		expect(license).toMatch(/^\s*Apache License\n\s*Version 2\.0, January 2004\n/);
		expect(license).toContain("END OF TERMS AND CONDITIONS");
		const holder = `Copyright 2026 ${pkg.author.name}`;
		expect(license).toContain(`   ${holder}\n`);
		expect(license).not.toContain("[name of copyright owner]");
		expect(notice).toContain(`${holder}\n`);
	});

	it("NOTICE carries the attribution line, the repository and the product page", () => {
		const repo = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
		expect(notice.split("\n")[0]).toBe(`${PRODUCT_NAME}, ${repo}`);
		expect(notice).toContain(pkg.homepage);
		expect(notice).toContain("Apache License, Version 2.0");
	});

	it("the README names the same licence and holder", () => {
		const section = readme.slice(readme.indexOf("## Licence and notices"));
		expect(section).toContain("Apache-2.0");
		expect(section).toContain(pkg.author.name);
		expect(section).toContain("[NOTICE](NOTICE)");
		expect(readme).not.toMatch(/\bMIT, see \[LICENSE\]/);
	});

	it("the README head has the CI, licence and EmDash badges and the product page; contributors are an image, not a workflow", () => {
		const head = readme.slice(0, readme.indexOf("## Why"));
		expect(head).toContain("actions/workflows/ci.yml/badge.svg");
		expect(head).toContain("(LICENSE)");
		expect(head).toMatch(/!\[EmDash [^\]]*\]/);
		expect(head).toContain("img.shields.io/npm/v/@infinitnet/cookieless-analytics.svg");
		expect(head).toContain("https://www.npmjs.com/package/@infinitnet/cookieless-analytics");
		expect(head).toContain(`<${pkg.homepage}>`);
		// The header block is centered; GitHub and npm render the Markdown inside it.
		expect(readme.startsWith('<div align="center">\n')).toBe(true);
		expect(head).toContain("</div>");
		expect(readme).toContain("https://contrib.rocks/image?repo=infinitnet/cookieless-analytics");
		expect(readme).toContain("https://github.com/infinitnet/cookieless-analytics/graphs/contributors");
	});
});

describe("README", () => {
	it("title, tagline and description", () => {
		const lines = readme.split("\n");
		// The first heading is the title and the tagline is the next paragraph (inside the centered header block).
		const title = lines.findIndex((l) => l.startsWith("# "));
		expect(lines[title]).toBe("# Cookieless Analytics by Infinitnet");
		expect(lines[title]).not.toMatch(/\bAI\b|Robots/);
		expect(lines[title + 2]).toBe(TAGLINE);
		expect(lines.slice(0, title).every((l) => l.trim() === "" || l.startsWith("<div"))).toBe(true);
		expect(readme).toContain(DESCRIPTION);
		expect(readme).toContain("npm install @infinitnet/cookieless-analytics");
	});

	it("has the README sections in order", () => {
		const heads = [...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
		const want = [
			"Why this one",
			"Install",
			"Features",
			"Use cases",
			"How it works",
			"Limits and plans",
			"Privacy",
			"Agent API and MCP",
			"Documentation",
			"Contributors",
			"Security",
			"Licence and notices",
		];
		expect(heads).toEqual(want);
		expect(readme).toContain("Hosted on your EmDash install, measuring every site you register.");
		for (const w of ["plausible alternative", "self hosted analytics", "astro analytics", "not legal advice"]) expect(readme.toLowerCase()).toContain(w);
	});

	it("every README image has alt text and every local image exists", () => {
		const imgs = [...readme.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
		expect(imgs.length).toBeGreaterThan(0);
		for (const img of imgs) {
			expect(img, img).toMatch(/ alt="[^"]{10,}"/);
			const src = img.match(/ src="([^"]+)"/)?.[1] ?? "";
			if (!/^https?:/.test(src)) expect(existsSync(src), src).toBe(true);
		}
	});

	it("the trust model names the host mail provider and the registry note", () => {
		expect(readme).toMatch(/### Trust model[\s\S]*mail provider/);
		expect(readme).toContain("no telemetry");
		expect(readme).toMatch(/no one-click listing in the EmDash plugin registry/);
	});

	it("the README keeps no roadmap and no list of declined features", () => {
		expect(readme).not.toMatch(/^## Roadmap/m);
		expect(readme.toLowerCase()).not.toMatch(/not built|not planned|roadmap/);
	});
});

describe("release workflows", () => {
	const ci = readFileSync(".github/workflows/ci.yml", "utf8");
	const release = readFileSync(".github/workflows/release.yml", "utf8");

	it("CI typechecks, tests, builds and checks the package against the emdash 1.4.0 floor (tests/github.test.ts has the shape)", () => {
		for (const step of ["pnpm install --frozen-lockfile", "pnpm typecheck", "pnpm test", "pnpm build", "publint", "attw", "scrub-check.mjs", '= "1.4.0"']) expect(ci).toContain(step);
		expect(readFileSync("pnpm-lock.yaml", "utf8")).toMatch(/emdash@1\.4\.0/);
	});

	it("a version tag publishes @infinitnet/cookieless-analytics with provenance and releases on infinitnet/cookieless-analytics", () => {
		expect(release).toMatch(/tags: \["v\*\.\*\.\*"\]/);
		expect(release).toContain("id-token: write");
		expect(release).toContain('npm publish "$TARBALL" --provenance --access public');
		expect(release).toContain('gh release create "$GITHUB_REF_NAME" "$TARBALL"');
		expect(release).toContain("--repo infinitnet/cookieless-analytics");
		expect(release).toContain("scrub-check.mjs");
		expect(release).toContain("--generate-notes");
	});
});
