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
const TAGLINE = "Self-hosted, cookieless web analytics for EmDash and any site. A ~3 KB script, no extra service, your own database.";
// One definitional sentence, the README's opening, under 200 characters.
const DESCRIPTION =
	"Cookieless Analytics by Infinitnet is a self-hosted, cookieless web analytics plugin for EmDash CMS with real sessions, no cookies and a page script of about 3 KB gzipped.";

describe("package metadata", () => {
	it("name, version, author, license and repository", () => {
		expect(pkg.name).toBe("@infinitnet/cookieless-analytics");
		expect(pkg.version).toBe("1.4.0");
		expect(VERSION).toBe(pkg.version);
		// The credit line in the admin footer shows the version with a v prefix (Header and Settings).
		for (const f of ["src/admin/components/Header.tsx", "src/admin/pages/Settings.tsx"]) expect(readFileSync(f, "utf8"), f).toContain("{PRODUCT_NAME}</a> v{VERSION}");
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
			"cookieless tracking",
			"no cookies",
			"cookie consent",
			"gdpr",
			"eprivacy",
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
		expect(pkg.files).toEqual(["dist", "scripts/ca-data.mjs", "src", "README.md", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]);
		expect(pkg.publishConfig).toEqual({ access: "public" });
		expect(pkg.scripts.prepublishOnly).toBe("pnpm build && pnpm test && pnpm typecheck");
	});

	it("every export points at a committed file", () => {
		for (const [name, target] of Object.entries(pkg.exports)) {
			for (const f of typeof target === "string" ? [target] : [target.types, target.default]) expect(existsSync(f), `${name}: ${f}`).toBe(true);
		}
	});

	it("the packed tarball holds only dist, src, the ca-data script, README, LICENSE, NOTICE and THIRD_PARTY_NOTICES", () => {
		type Packed = { filename: string; files: Array<{ path: string }> };
		// npm 10 prints an array, npm 11 an object keyed by package name.
		const raw = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) as Packed[] | Record<string, Packed>;
		const info = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];
		expect(info?.filename).toBe("infinitnet-cookieless-analytics-1.4.0.tgz");
		const top = new Set(info?.files.map((f) => f.path.split("/")[0]));
		expect([...top].sort()).toEqual(["LICENSE", "NOTICE", "README.md", "THIRD_PARTY_NOTICES.md", "dist", "package.json", "scripts", "src"]);
		expect(info?.files.filter((f) => f.path.startsWith("packages/"))).toEqual([]);
	}, 30_000);

	it("declares exactly the expected capabilities", () => {
		expect([...CAPABILITIES].sort()).toEqual(["content:read", "email:send", "hooks.page-fragments:register", "network:request", "schema:read"]);
		expect([...(cookielessAnalytics().capabilities ?? [])].sort()).toEqual([...CAPABILITIES].sort());
	});
});

describe("license: LICENSE, NOTICE and package.json agree", () => {
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

	it("NOTICE carries the attribution line, the repository and the website", () => {
		const repo = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
		expect(notice.split("\n")[0]).toBe(`${PRODUCT_NAME}, ${repo}`);
		expect(notice).toContain(pkg.homepage);
		expect(notice).toContain("Apache License, Version 2.0");
	});

	it("the README names the same license and holder", () => {
		const section = readme.slice(readme.indexOf("## License and notices"));
		expect(section).toContain("Apache-2.0");
		expect(section).toContain(pkg.author.name);
		expect(section).toContain("[NOTICE](NOTICE)");
		expect(readme).not.toMatch(/\bMIT, see \[LICENSE\]/);
	});

	it("the README head has the CI, license and EmDash badges and the website badge; contributors are an image, not a workflow", () => {
		const head = readme.slice(0, readme.indexOf("## Why"));
		expect(head).toContain("actions/workflows/ci.yml/badge.svg");
		expect(head).toContain("(LICENSE)");
		expect(head).toMatch(/!\[EmDash [^\]]*\]/);
		expect(head).toContain("img.shields.io/npm/v/@infinitnet/cookieless-analytics.svg");
		expect(head).toContain("https://www.npmjs.com/package/@infinitnet/cookieless-analytics");
		expect(head).toContain(`[![Website](https://img.shields.io/badge/website-visit-informational.svg)](${pkg.homepage})`);
		expect(head).not.toContain("Product page");
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
		// The first paragraph after the header block defines the product in one sentence, not a "Name: label" opener.
		const opening = readme.slice(readme.indexOf("</div>") + 6).trim().split("\n")[0];
		expect(opening).toBe(DESCRIPTION);
		expect(DESCRIPTION.length).toBeLessThan(200);
		expect(DESCRIPTION.match(/[.!?](\s|$)/g)).toHaveLength(1);
		expect(DESCRIPTION).toMatch(/^Cookieless Analytics by Infinitnet is a /);
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
			"License and notices",
		];
		expect(heads).toEqual(want);
		expect(readme).toContain("Hosted on your EmDash install, measuring every site you register.");
		for (const w of ["plausible alternative", "self hosted analytics", "astro analytics", "no cookie to ask consent for", "legitimate interest (gdpr art. 6(1)(f))"]) expect(readme.toLowerCase()).toContain(w);
		// The disclaimer stands once, in the privacy doc and on the wiki privacy page, not in the README.
		expect(readme.toLowerCase()).not.toContain("legal advice");
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
		expect(readme).toMatch(/no listing in the EmDash plugin registry/);
	});

	it("Install names the registry companion and links its README and wiki page", () => {
		const install = readme.slice(readme.indexOf("## Install"), readme.indexOf("## Features"));
		const subs = [...install.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
		expect(subs).toEqual(["Why a native plugin", "A) New site: Deploy to Cloudflare", "B) Existing EmDash site: npm", "Requirements", "Trust model", "Registry companion"]);
		expect(install).toContain(
			"Cookieless Analytics Companion is a sandboxed helper in the EmDash plugin registry. It guides the install of this plugin and confirms it. It counts nothing and is not required.",
		);
		expect(install).toContain("](packages/companion/README.md)");
		expect(install).toContain("](https://github.com/infinitnet/cookieless-analytics/wiki/Registry-Companion)");
		expect(install).toContain("search the Registry for Cookieless Analytics Companion");
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
		for (const step of ["pnpm install --frozen-lockfile", "pnpm typecheck", "pnpm test", "pnpm build", "publint", "attw", '= "1.4.0"']) expect(ci).toContain(step);
		expect(readFileSync("pnpm-lock.yaml", "utf8")).toMatch(/emdash@1\.4\.0/);
	});

	it("a version tag publishes @infinitnet/cookieless-analytics with provenance and releases on infinitnet/cookieless-analytics", () => {
		expect(release).toMatch(/tags: \["v\*\.\*\.\*"\]/);
		expect(release).toContain("id-token: write");
		expect(release).toContain('npm publish "$TARBALL" --provenance --access public');
		expect(release).toContain('gh release create "$GITHUB_REF_NAME" "$TARBALL"');
		expect(release).toContain("--repo infinitnet/cookieless-analytics");
		expect(release).toContain("--generate-notes");
	});
});
