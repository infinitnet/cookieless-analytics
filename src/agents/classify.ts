import { type AgentCategory, type CompiledRule, compileBuiltins, compileUserRules, type UserAgentRule } from "./rules.js";

export interface Classification {
	audience: "human" | "robot";
	botId?: string;
	category?: AgentCategory;
}

const MAX_UA = 512;
const LRU_SIZE = 2000;
/** In-app WebViews: real people in social apps, never bots. */
const WEBVIEW_MARKERS = ["fban/", "fbav/", "instagram", "linkedinapp", " line/"];
/** Bounded generic fallback: bot-like words not followed by a letter (`cubot` is a phone brand). */
const GENERIC_RE = /(?<!cu)bot(?![a-z])|crawl(?:er|ing)?(?![a-z])|spider|scraper|fetch(?:er)?(?![a-z])|monitor(?:ing)?(?![a-z])|check(?:er)?(?![a-z])|probe(?![a-z])/;

const HUMAN: Classification = Object.freeze({ audience: "human" });
const robot = (botId: string, category: AgentCategory): Classification => ({ audience: "robot", botId, category });
const fromRule = (r: CompiledRule): Classification => (r.human ? HUMAN : robot(r.id, r.category));

let builtins: CompiledRule[] | undefined;

export interface Classifier {
	classify(ua: string | null | undefined): Classification;
}

/** A classifier with its own LRU; user rules overlay the built-in data. */
export function createClassifier(userRules?: readonly UserAgentRule[]): Classifier {
	const user = compileUserRules(userRules);
	const cache = new Map<string, Classification>();

	function run(ua: string): Classification {
		if (ua.trim().length < 10) return robot(ua.trim() ? "short-ua" : "empty-ua", "unknown_bot");
		const own = user.plain(ua);
		if (own) return fromRule(own);
		if (WEBVIEW_MARKERS.some((m) => ua.includes(m))) return HUMAN;
		builtins ??= compileBuiltins();
		for (const r of builtins) if (r.test(ua)) return fromRule(r);
		for (const r of user.regex) if (r.test(ua)) return fromRule(r);
		if (GENERIC_RE.test(ua)) return robot("generic", "unknown_bot");
		return HUMAN;
	}

	return {
		classify(raw) {
			const ua = (raw ?? "").slice(0, MAX_UA).toLowerCase();
			const hit = cache.get(ua);
			if (hit) {
				cache.delete(ua);
				cache.set(ua, hit);
				return hit;
			}
			const res = run(ua);
			if (cache.size >= LRU_SIZE) cache.delete(cache.keys().next().value as string);
			cache.set(ua, res);
			return res;
		},
	};
}

const defaultClassifier = createClassifier();
const userClassifiers = new WeakMap<readonly UserAgentRule[], Classifier>();

/** Classify a user agent. Pass the same `userRules` array instance to reuse its cache. */
export function classifyUa(ua: string | null | undefined, userRules?: readonly UserAgentRule[]): Classification {
	if (!userRules || userRules.length === 0) return defaultClassifier.classify(ua);
	let c = userClassifiers.get(userRules);
	if (!c) {
		c = createClassifier(userRules);
		userClassifiers.set(userRules, c);
	}
	return c.classify(ua);
}
