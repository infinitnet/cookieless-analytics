import type { PageFragmentContribution } from "emdash";
import { scriptBody } from "./client/serve.js";
import { PLUGIN_ID } from "./contract.js";
import type { KvLike } from "./core/crypto.js";
import { currentAudience, middlewareLiveAt } from "./core/request-scope.js";
import { MW_SEEN_KEY } from "./middleware-core.js";
import { linkedHostsOf } from "./multisite/registry.js";
import type { Settings } from "./settings.js";

/** `mw:seen` older than this means the middleware is not installed: fall back to the direct route. */
export const SEEN_FRESH_MS = 24 * 3600_000;
const SEEN_CACHE_MS = 60_000;
let seenCache: { value: number | null; at: number } | undefined;

async function middlewareSeen(kv: KvLike, now: number): Promise<boolean> {
	// This isolate's middleware handled a request: no KV read, and no stale-marker window after deploys.
	const live = middlewareLiveAt();
	if (live !== undefined && now - live < SEEN_FRESH_MS) return true;
	if (!seenCache || now - seenCache.at >= SEEN_CACHE_MS) {
		const v = await kv.get<number>(MW_SEEN_KEY);
		seenCache = { value: typeof v === "number" ? v : null, at: now };
	}
	return seenCache.value !== null && now - seenCache.value < SEEN_FRESH_MS;
}

/** Test helper. */
export function resetSeenCache(): void {
	seenCache = undefined;
}

/**
 * `page:fragments` output: one script element at `head`, identical for every request and
 * user agent. Without a live middleware the page gets the same code inline, pointed at the direct
 * plugin route (a plugin route cannot serve JavaScript). UA-dependent output only with the opt-in
 * `scriptForBots = skip_known_bots`.
 */
export async function pageFragments(s: Settings, kv: KvLike, now = Date.now()): Promise<PageFragmentContribution[] | null> {
	if (!s.injectScript) return null;
	if (s.scriptForBots === "skip_known_bots" && currentAudience() === "robot") return null;
	const alias = await middlewareSeen(kv, now);
	// The linked hosts (a cached options read): links to them are this site's, never outbound.
	if (s.scriptDelivery === "inline" || !alias) return [{ kind: "inline-script", placement: "head", code: scriptBody(s, alias, await linkedHostsOf(kv, now)), key: PLUGIN_ID }];
	return [{ kind: "external-script", placement: "head", src: s.scriptPath, defer: true, key: PLUGIN_ID }];
}
