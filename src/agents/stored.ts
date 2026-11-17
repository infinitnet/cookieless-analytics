import type { KvLike } from "../core/crypto.js";
import { MAX_USER_RULES, type UserAgentRule } from "./rules.js";

/** Options key holding every user agent rule of the install for the middleware, written by the config routes on each rules change. */
export const AGENT_RULES_KEY = "agents:rules";
const TTL_MS = 60_000;
let snap: { rules: UserAgentRule[]; at: number } | undefined;

const isRule = (r: unknown): r is UserAgentRule =>
	!!r && typeof r === "object" && typeof (r as UserAgentRule).pattern === "string" && typeof (r as UserAgentRule).mode === "string" && typeof (r as UserAgentRule).action === "string";

/** `AGENT_RULES_KEY`, read at most every 60 s per isolate (the same cache as the route side loader). */
export async function storedAgentRules(kv: Pick<KvLike, "get">, nowMs = Date.now()): Promise<UserAgentRule[]> {
	if (snap && nowMs - snap.at < TTL_MS) return snap.rules;
	let rules = snap?.rules ?? [];
	try {
		const v = await kv.get<unknown>(AGENT_RULES_KEY);
		rules = Array.isArray(v) ? v.filter(isRule).slice(0, MAX_USER_RULES) : [];
	} catch {
		// Keep the last good list.
	}
	snap = { rules, at: nowMs };
	return rules;
}

/** Drop this isolate's copy so the next request reads the key again. */
export function resetStoredAgentRules(): void {
	snap = undefined;
}
