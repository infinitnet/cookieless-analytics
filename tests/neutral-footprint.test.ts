// Scope: everything served to a visitor's browser by default (script body, script headers, page
// fragments, public names). Repository docs may use the forbidden words; served output may not.
import { renderFragments } from "emdash/page";
import { describe, expect, it } from "vitest";
import { clientConfig, scriptBody, scriptResponse } from "../src/client/serve.js";
import { PAGE_SCRIPT } from "../src/client/generated.js";
import { FORBIDDEN_PUBLIC_WORDS } from "../src/contract.js";
import { pageFragments, resetSeenCache } from "../src/fragments.js";
import { publicNames } from "../src/names.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings.js";
import { MemoryKv } from "./helpers.js";

/**
 * Forbidden words present in `text`. Browser API names are allowed: `navigator.sendBeacon`
 * and `navigator.doNotTrack`, which the script reads (see docs/design-notes.md).
 */
function forbidden(text: string): string[] {
	const t = text.toLowerCase().replace(/\.sendbeacon\b/g, "").replace(/\.donottrack\b/g, "");
	return FORBIDDEN_PUBLIC_WORDS.filter((w) => t.includes(w));
}

describe("neutral public footprint", () => {
	it("default public names are neutral", () => {
		const n = publicNames(DEFAULT_SETTINGS.namespace);
		const names = [DEFAULT_SETTINGS.scriptPath, DEFAULT_SETTINGS.collectPath, DEFAULT_SETTINGS.sharePath, n.namespace, n.queue, n.readyEvent, n.attrEvent, n.attrPropPrefix, n.attrIgnore];
		expect(names).toEqual(["/_/e.js", "/_/e", "/_/s", "__ec", "__ecq", "__ec:ready", "data-ec-event", "data-ec-prop-", "data-ec-ignore"]);
		expect(forbidden(names.join(" "))).toEqual([]);
	});

	it("the served script contains no forbidden word and no plugin API path", () => {
		const body = scriptBody(DEFAULT_SETTINGS);
		expect(forbidden(body)).toEqual([]);
		expect(body).not.toContain("/_emdash/api/plugins");
		expect(body).not.toContain("__CFG__");
		expect(forbidden(PAGE_SCRIPT)).toEqual([]);
	});

	it("link rules with a forbidden word are not served", () => {
		const s = normalizeSettings({ linkRules: "/go/ out\n/stats/ x" });
		expect(forbidden(scriptBody(s))).toEqual([]);
		expect(clientConfig(s).r).toEqual([["/go/", "out"]]);
	});

	it("script response headers are neutral", () => {
		const res = scriptResponse(DEFAULT_SETTINGS, new Request("https://example.org/_/e.js"));
		const headers = [...res.headers].map(([k, v]) => `${k}: ${v}`).join("\n");
		expect(forbidden(headers)).toEqual([]);
	});

	it("rendered page fragments are neutral and free of plugin paths when mw:seen is fresh", async () => {
		resetSeenCache();
		const kv = new MemoryKv();
		await kv.set("mw:seen", Date.now());
		for (const delivery of ["external", "inline"]) {
			const html = renderFragments((await pageFragments(normalizeSettings({ scriptDelivery: delivery }), kv)) ?? [], "head");
			expect(html).toContain("<script");
			expect(forbidden(html)).toEqual([]);
			expect(html).not.toContain("/_emdash/api/plugins");
		}
	});

	it("browser API names are the only exempt occurrences", () => {
		expect(forbidden("navigator.sendBeacon(x); i.doNotTrack")).toEqual([]);
		expect(forbidden("sendBeaconX doNotTracker beacon")).toEqual(["track", "tracker", "beacon"]);
	});

	it("the production script has no test hooks", () => {
		expect(PAGE_SCRIPT).not.toContain("__trusted");
		expect(PAGE_SCRIPT).not.toContain("__TEST_HOOKS__");
		expect(PAGE_SCRIPT.split("__CFG__")).toHaveLength(2);
	});
});
