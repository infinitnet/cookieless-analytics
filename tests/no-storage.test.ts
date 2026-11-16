/**
 * Guards: no browser storage on the public surfaces, no new setting, no new admin page.
 * The admin may keep UI preferences in browser storage, but only through `src/admin/prefs.ts`,
 * so storage use cannot spread through the admin unseen. The public page script and the shared page renderer stay storage free.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_PAGES } from "../src/index.js";
import { settingsSchema } from "../src/settings.js";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const STORAGE = /\b(localStorage|sessionStorage|indexedDB|cookieStore)\b|document\.cookie/;

describe("no browser storage", () => {
	it("src/client and the shared page renderer never touch browser storage or cookies", () => {
		const files = [...walk("src/client"), "src/dashboards/render.ts"].filter((f) => /\.(ts|tsx)$/.test(f));
		expect(files.length).toBeGreaterThan(3);
		const hits = files.filter((f) => STORAGE.test(readFileSync(f, "utf8")));
		expect(hits).toEqual([]);
	});

	it("in src/admin only prefs.ts names browser storage, and it sets no cookie", () => {
		const files = walk("src/admin").filter((f) => /\.(ts|tsx)$/.test(f));
		expect(files.length).toBeGreaterThan(20);
		const hits = files.filter((f) => STORAGE.test(readFileSync(f, "utf8")));
		expect(hits).toEqual([join("src/admin", "prefs.ts")]);
		expect(readFileSync("src/admin/prefs.ts", "utf8")).not.toMatch(/document\.cookie|cookieStore|indexedDB/);
	});

	it("adds no setting for annotations and keeps the 68 settings", () => {
		const keys = Object.keys(settingsSchema);
		expect(keys).toHaveLength(68);
		expect(keys.filter((k) => /annot|scope|marker/i.test(k))).toEqual([]);
	});

	it("keeps the admin pages of the descriptor", () => {
		expect(ADMIN_PAGES.map((p) => p.path)).toEqual(["/", "/dashboards", "/pages", "/satisfaction", "/sources", "/audience", "/behaviour", "/revenue", "/links", "/annotations", "/search", "/config", "/data", "/settings"]);
	});
});
