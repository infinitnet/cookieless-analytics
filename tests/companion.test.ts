/** The full plugin and the registry companion in packages/companion share a hand-written contract; this pins both sides. */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as full from "../packages/companion/src/full.js";
import { COMPANION_PUBLISHER_DID, COMPANION_SLUG, CONTRACT_VERSION, type CompanionHello, isCompanionHello, PLUGIN_ID, VERSION } from "../src/contract.js";

const read = (f: string) => readFileSync(f, "utf8");
const jsonc = (s: string) => JSON.parse(s.replace(/(?<!:)\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
const root = JSON.parse(read("package.json")) as { name: string; version: string };
const pkg = JSON.parse(read("packages/companion/package.json")) as { name: string; version: string; private: boolean };
const manifest = jsonc(read("packages/companion/emdash-plugin.jsonc")) as { slug: string; publisher: string; name: string };

// shortcut: `yaml` is resolved through astro's install, as in tests/github.test.ts. Add it as a devDependency if this breaks.
const YAML = createRequire(realpathSync("node_modules/astro/package.json"))("yaml") as typeof import("yaml");
const tagMatch = (patterns: string[], ref: string) => patterns.some((t) => new RegExp(`^${t.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`).test(ref));

describe("companion contract", () => {
	it("full.ts duplicates the full plugin's constants exactly", () => {
		expect(full.PLUGIN_ID).toBe(PLUGIN_ID);
		expect(full.CONTRACT_VERSION).toBe(CONTRACT_VERSION);
		expect(full.COMPANION_SLUG).toBe(COMPANION_SLUG);
		expect(full.PACKAGE_NAME).toBe(root.name);
		expect(full.OVERVIEW_PATH).toBe(`/_emdash/admin/plugins/${PLUGIN_ID}/`);
	});

	it("the hello the admin sends is accepted by both guards, unchanged", () => {
		const hello: CompanionHello = { v: 1, product: PLUGIN_ID, pluginVersion: VERSION, contractVersion: CONTRACT_VERSION };
		expect(isCompanionHello(hello)).toBe(true);
		expect(full.parseHello(hello)).toEqual(hello);
		expect(Object.keys(hello).sort()).toEqual(["contractVersion", "pluginVersion", "product", "v"]);
	});

	it("both guards agree on what they refuse", () => {
		const ok = { v: 1, product: PLUGIN_ID, pluginVersion: VERSION, contractVersion: CONTRACT_VERSION };
		const bad: unknown[] = [
			null,
			[],
			"hello",
			{ ...ok, extra: 1 },
			{ ...ok, v: 2 },
			{ ...ok, product: "other" },
			{ ...ok, pluginVersion: "1.1" },
			{ ...ok, pluginVersion: 110 },
			{ ...ok, contractVersion: 0 },
			{ ...ok, contractVersion: 1.5 },
			{ ...ok, contractVersion: 1000 },
			{ v: 1, product: PLUGIN_ID, pluginVersion: VERSION },
		];
		for (const b of bad) {
			expect(isCompanionHello(b), JSON.stringify(b)).toBe(false);
			expect(full.parseHello(b), JSON.stringify(b)).toBeNull();
		}
		// A later contract version passes both guards, so the companion can show it is out of date.
		expect(isCompanionHello({ ...ok, contractVersion: 2 })).toBe(true);
		expect(full.parseHello({ ...ok, contractVersion: 2 })?.contractVersion).toBe(2);
	});
});

describe("companion manifest and package", () => {
	it("slug and publisher equal the constants the full plugin's admin matches on", () => {
		expect(manifest.slug).toBe(COMPANION_SLUG);
		expect(manifest.slug).toMatch(/^[a-z][a-z0-9_-]{0,63}$/);
		expect(manifest.name).toBe("Cookieless Analytics Companion");
		expect(manifest.publisher).toBe(COMPANION_PUBLISHER_DID);
	});

	it("the publisher is a DID, never a handle: a real did:plc", () => {
		expect(/^did:plc:[a-z2-7]{24}$/.test(manifest.publisher), manifest.publisher).toBe(true);
	});

	it("the package is private, named after the full plugin's package, at 1.0.0 with a matching changelog entry", () => {
		expect(pkg.name).toBe(`${root.name}-companion`);
		expect(pkg.private).toBe(true);
		expect(pkg.version).toBe("1.0.0");
		expect(read("packages/companion/listing/changelog.md").split("\n")[0]).toBe(`## ${pkg.version}`);
	});
});

describe("release tags", () => {
	const companionTag = `${COMPANION_SLUG}@${pkg.version}`;

	it("release.yml runs for the native version tag and never for the companion tag", () => {
		const tags = (YAML.parse(read(".github/workflows/release.yml")) as { on: { push: { tags: string[] } } }).on.push.tags;
		expect(tagMatch(tags, `v${root.version}`)).toBe(true);
		expect(tagMatch(tags, companionTag)).toBe(false);
	});

	it("the generated companion release workflow, once committed, runs for the companion tag and never for a v tag", () => {
		const f = ".github/workflows/emdash-release.yml";
		// The workflow is written by the registry CLI at release setup; until then there is nothing to match.
		if (!existsSync(f)) return;
		const on = (YAML.parse(read(f)) as { on: { push?: { tags?: string[] } } }).on;
		const tags = on.push?.tags ?? [];
		expect(tagMatch(tags, `v${root.version}`)).toBe(false);
		expect(tagMatch(tags, "v1.2.3")).toBe(false);
		if (tags.length) expect(tagMatch(tags, companionTag)).toBe(true);
	});
});
