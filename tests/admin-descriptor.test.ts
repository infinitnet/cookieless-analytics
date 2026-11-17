/** Labelling convention for admin surfaces: one sidebar folder, product names where the host shows none, no bracket prefixes. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_PAGES, ADMIN_WIDGETS, cookielessAnalytics, createPlugin, PLUGIN_LABELS } from "../src/index.js";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

describe("admin labelling", () => {
	it("fourteen pages (Settings last), every one in the Analytics folder, titles without the product name", () => {
		expect(ADMIN_PAGES).toHaveLength(14);
		for (const p of ADMIN_PAGES) {
			expect(p.group, p.path).toBe("Analytics");
			expect(p.label).not.toMatch(/cookieless/i);
		}
		expect((cookielessAnalytics().adminPages as Array<{ group?: string }> | undefined)?.every((p) => p.group === "Analytics")).toBe(true);
	});

	it("mounts the Settings page routes, manage only", () => {
		const routes = (createPlugin() as unknown as { routes: Record<string, { permission?: string }> }).routes;
		expect([routes["settings/get"]?.permission, routes["settings/save"]?.permission]).toEqual(["plugins:manage", "plugins:manage"]);
	});

	it("the widget title, the display name and the plugin description on the descriptor and on definePlugin", () => {
		expect(ADMIN_WIDGETS[0].title).toBe("Cookieless Analytics");
		expect(PLUGIN_LABELS.displayName).toBe("Cookieless Analytics by Infinitnet");
		expect(PLUGIN_LABELS.description).toContain("self-hosted, cookieless web analytics plugin for EmDash CMS");
		const d = cookielessAnalytics() as unknown as Record<string, unknown>;
		expect([d.displayName, d.description]).toEqual([PLUGIN_LABELS.displayName, PLUGIN_LABELS.description]);
		const dashes = [0x2013, 0x2014].map((c) => String.fromCharCode(c));
		expect(dashes.some((d) => PLUGIN_LABELS.description.includes(d))).toBe(false);
		expect(typeof createPlugin).toBe("function");
	});

	it("no string in src/admin starts with a bracket prefix such as [CA]", () => {
		const hits: string[] = [];
		for (const f of walk("src/admin").filter((x) => /\.(ts|tsx)$/.test(x))) {
			const text = readFileSync(f, "utf8");
			for (const m of text.matchAll(/(["'`>])\s*(\[[A-Z]{1,4}\])/g)) hits.push(`${f}: ${m[2]}`);
			for (const m of text.matchAll(/["'`]([^"'`\n]*)["'`]/g)) if (/^\[[A-Z]{1,4}\]/.test(m[1] ?? "")) hits.push(`${f}: ${m[1]}`);
		}
		expect(hits).toEqual([]);
	});
});
