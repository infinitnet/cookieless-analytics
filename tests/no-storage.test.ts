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
	// The page script is the one place that touches browser storage: the opt-out flag, read once at load and written only by a click on the opt-out control.
	const SCRIPT = ["boot.ts", "generated.ts"].map((f) => join("src/client", f));

	it("src/client and the shared page renderer never touch browser storage or cookies, apart from the page script's opt-out flag", () => {
		const files = [...walk("src/client"), "src/dashboards/render.ts"].filter((f) => /\.(ts|tsx)$/.test(f) && !SCRIPT.includes(f));
		expect(files.length).toBeGreaterThan(2);
		const hits = files.filter((f) => STORAGE.test(readFileSync(f, "utf8")));
		expect(hits).toEqual([]);
	});

	it("the page script uses only localStorage, only for the opt-out flag: one read and one click-driven write", () => {
		for (const f of SCRIPT) {
			const src = readFileSync(f, "utf8");
			expect(src, f).not.toMatch(/sessionStorage|indexedDB|cookieStore|document\.cookie/);
			expect(src.match(/localStorage/g)?.length, f).toBeGreaterThanOrEqual(1);
		}
		const boot = readFileSync(SCRIPT[0] as string, "utf8");
		expect(boot.match(/localStorage\.getItem/g)).toHaveLength(1);
		expect(boot.match(/localStorage\[/g)).toHaveLength(1);
	});

	it("in src/admin only prefs.ts names browser storage, and it sets no cookie", () => {
		const files = walk("src/admin").filter((f) => /\.(ts|tsx)$/.test(f));
		expect(files.length).toBeGreaterThan(20);
		const hits = files.filter((f) => STORAGE.test(readFileSync(f, "utf8")));
		expect(hits).toEqual([join("src/admin", "prefs.ts")]);
		expect(readFileSync("src/admin/prefs.ts", "utf8")).not.toMatch(/document\.cookie|cookieStore|indexedDB/);
	});

	it("keeps the 76 settings, five of them for automatic annotations", () => {
		const keys = Object.keys(settingsSchema);
		expect(keys).toHaveLength(76);
		expect(keys.filter((k) => /annot|scope|marker/i.test(k))).toEqual(["autoAnnotations", "annotatePublish", "annotateUpdate", "annotateCollections", "autoAnnotationsPerDay"]);
	});

	it("keeps the admin pages of the descriptor", () => {
		expect(ADMIN_PAGES.map((p) => p.path)).toEqual(["/", "/dashboards", "/pages", "/satisfaction", "/sources", "/audience", "/behaviour", "/revenue", "/links", "/annotations", "/search", "/config", "/data", "/settings"]);
	});
});
