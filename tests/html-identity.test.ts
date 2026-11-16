// Scope: HTML served to visitors through the host fragment renderer (`emdash/page`).
import { renderFragments } from "emdash/page";
import { beforeEach, describe, expect, it } from "vitest";
import { type Audience, withAudience } from "../src/core/request-scope.js";
import { pageFragments, resetSeenCache } from "../src/fragments.js";
import { normalizeSettings, SCRIPT_FOR_BOTS_CAVEAT, settingsSchema } from "../src/settings.js";
import { MemoryKv } from "./helpers.js";

const layout = (head: string) =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Post</title><link rel="canonical" href="https://example.org/post">${head}</head><body><a href="/next">Next</a><a href="https://other.example/">Out</a></body></html>`;

let kv: MemoryKv;
beforeEach(async () => {
	resetSeenCache();
	kv = new MemoryKv();
	await kv.set("mw:seen", Date.now());
});

/** Render the fixture page as the host would, for a request with the given UA audience. */
async function render(audience: Audience, over: Record<string, unknown> = {}) {
	const frags = await withAudience(audience, () => pageFragments(normalizeSettings(over), kv));
	return layout(renderFragments(frags ?? [], "head"));
}

describe("byte-identical HTML", () => {
	it("Googlebot and Chrome renders are identical and differ from no plugin by exactly one script tag", async () => {
		const bot = await render("robot");
		const human = await render("human");
		expect(bot).toBe(human);
		const plain = layout("");
		const tag = '<script src="/_/e.js" defer></script>';
		expect(human.replace(tag, "")).toBe(plain);
		expect(human.split("<script").length - 1).toBe(1);
		// Nothing else changed: no hrefs, fragments, query strings or attributes added.
		expect(human.length - plain.length).toBe(tag.length);
	});

	it("inline mode: exactly one inline script, identical for every UA", async () => {
		const bot = await render("robot", { scriptDelivery: "inline" });
		expect(bot).toBe(await render("human", { scriptDelivery: "inline" }));
		const extra = bot.slice(layout("").indexOf("</head>"), bot.indexOf("</head>"));
		expect(extra.startsWith("<script>")).toBe(true);
		expect(extra.endsWith("</script>")).toBe(true);
		expect(bot.split("<script").length - 1).toBe(1);
		expect(bot.split("</script>").length - 1).toBe(1);
	});

	it("skip_known_bots drops the tag for bots only, and the setting carries the cache caveat", async () => {
		const over = { scriptForBots: "skip_known_bots" };
		expect(await render("robot", over)).toBe(layout(""));
		expect(await render("human", over)).toContain('<script src="/_/e.js" defer></script>');
		expect(settingsSchema.scriptForBots.description).toContain(SCRIPT_FOR_BOTS_CAVEAT);
		expect(SCRIPT_FOR_BOTS_CAVEAT).toMatch(/route cache/);
		expect(SCRIPT_FOR_BOTS_CAVEAT).toMatch(/Vary: User-Agent/);
	});
});
