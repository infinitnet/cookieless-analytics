import { beforeEach, describe, expect, it } from "vitest";
import { DIRECT_IN_PATH } from "../src/client/serve.js";
import { markMiddlewareLive, withAudience } from "../src/core/request-scope.js";
import { pageFragments, resetSeenCache } from "../src/fragments.js";
import { normalizeSettings } from "../src/settings.js";
import { MemoryKv } from "./helpers.js";

const NOW = Date.parse("2026-06-10T12:00:00Z");
let kv: MemoryKv;
beforeEach(() => {
	resetSeenCache();
	markMiddlewareLive(Number.NEGATIVE_INFINITY);
	kv = new MemoryKv();
});
const s = (over = {}) => normalizeSettings(over);

describe("page:fragments", () => {
	it("emits one deferred external script at head when the middleware is live", async () => {
		await kv.set("mw:seen", NOW - 60_000);
		expect(await pageFragments(s(), kv, NOW)).toEqual([{ kind: "external-script", placement: "head", src: "/_/e.js", defer: true, key: "cookieless-analytics" }]);
	});

	it("falls back to inline code pointed at the direct route when mw:seen is missing or stale", async () => {
		for (const seen of [null, NOW - 25 * 3600_000]) {
			resetSeenCache();
			if (seen !== null) await kv.set("mw:seen", seen);
			const [f] = (await pageFragments(s(), kv, NOW)) ?? [];
			expect(f).toMatchObject({ kind: "inline-script", placement: "head" });
			expect((f as { code: string }).code).toContain(`"c":"${DIRECT_IN_PATH}"`);
		}
	});

	it("inline delivery uses the neutral event path when the middleware is live", async () => {
		await kv.set("mw:seen", NOW);
		const [f] = (await pageFragments(s({ scriptDelivery: "inline" }), kv, NOW)) ?? [];
		expect((f as { code: string }).code).toContain('"c":"/_/e"');
		expect((f as { code: string }).code).not.toContain("/_emdash/");
	});

	it("a middleware request in this isolate counts as live even before mw:seen is written", async () => {
		markMiddlewareLive(NOW - 1000);
		expect(await pageFragments(s(), kv, NOW)).toMatchObject([{ kind: "external-script", src: "/_/e.js" }]);
	});

	it("emits nothing when injectScript is off", async () => {
		expect(await pageFragments(s({ injectScript: false }), kv, NOW)).toBeNull();
	});

	it("ignores the request audience unless skip_known_bots is on", async () => {
		await kv.set("mw:seen", NOW);
		expect(await withAudience("robot", () => pageFragments(s(), kv, NOW))).toHaveLength(1);
		expect(await withAudience("robot", () => pageFragments(s({ scriptForBots: "skip_known_bots" }), kv, NOW))).toBeNull();
		expect(await withAudience("human", () => pageFragments(s({ scriptForBots: "skip_known_bots" }), kv, NOW))).toHaveLength(1);
	});
});
