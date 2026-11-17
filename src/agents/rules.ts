import agentsData from "../data/agents.json";
import { compileSafeRegex } from "../query/safe-regex.js";

export type AgentCategory =
	| "search_engine"
	| "ai_training"
	| "ai_search"
	| "ai_assistant"
	| "seo_tool"
	| "social_preview"
	| "monitoring"
	| "feed_reader"
	| "security_scanner"
	| "headless_automation"
	| "scraper_generic"
	| "archiver"
	| "ads_verification"
	| "unknown_bot";

export const AGENT_CATEGORIES: readonly AgentCategory[] = [
	"search_engine",
	"ai_training",
	"ai_search",
	"ai_assistant",
	"seo_tool",
	"social_preview",
	"monitoring",
	"feed_reader",
	"security_scanner",
	"headless_automation",
	"scraper_generic",
	"archiver",
	"ads_verification",
	"unknown_bot",
];

export interface AgentRecord {
	id: string;
	name: string;
	operator: string;
	category: AgentCategory;
	/** `contains` patterns are lowercase; `regex` patterns run with the `i` flag; `lit` is a required lowercase substring. */
	match: { mode: "contains"; pattern: string } | { mode: "regex"; pattern: string; lit?: string };
	docs?: string;
	source: "curated" | "ai.robots.txt" | "crawler-user-agents";
}

/** Admin-editable rule (`agent_rules` collection). */
export interface UserAgentRule {
	id?: string;
	pattern: string;
	mode: "contains" | "prefix" | "exact" | "regex";
	/** `robot` labels a match as a bot; `human` forces human. */
	action: "robot" | "human";
	name?: string;
	category?: AgentCategory;
	enabled?: boolean;
}

export const AGENTS = agentsData as AgentRecord[];
/** Your rules in total, regex rules included; the classifier and the routes stop at these caps. */
export const MAX_USER_RULES = 500;
export const MAX_USER_REGEX_RULES = 50;
export const MAX_RULE_PATTERN = 512;

export interface CompiledRule {
	id: string;
	category: AgentCategory;
	human: boolean;
	test(ua: string): boolean;
}

/** Built-in rules. Regexes compile on first candidate hit; `lit` is the substring pre-filter. */
export function compileBuiltins(records: readonly AgentRecord[] = AGENTS): CompiledRule[] {
	return records.map((r) => {
		const base = { id: r.id, category: r.category, human: false };
		const m = r.match;
		if (m.mode === "contains") return { ...base, test: (ua: string) => ua.includes(m.pattern) };
		let re: RegExp | null | undefined;
		return {
			...base,
			test(ua: string) {
				if (m.lit && !ua.includes(m.lit)) return false;
				if (re === undefined) re = compileSafeRegex(m.pattern, "i");
				return re ? re.test(ua) : false;
			},
		};
	});
}

export interface UserRules {
	/** First `contains`, `prefix` or `exact` rule in list order that matches the lowercase UA. */
	plain(ua: string): CompiledRule | undefined;
	regex: CompiledRule[];
}

/**
 * Split user rules into plain (run first) and regex (run after built-ins, at most 50), at most 500 in total.
 * Plain rules are indexed (exact in a map, prefixes by length, contains in a loop that stops at the best hit so far),
 * and the answer equals a loop over the rules in list order.
 */
export function compileUserRules(rules: readonly UserAgentRule[] = []): UserRules {
	const all: CompiledRule[] = [];
	const exact = new Map<string, number>();
	const prefix = new Map<string, number>();
	const contains: Array<[string, number]> = [];
	const regex: CompiledRule[] = [];
	let n = 0;
	rules.forEach((r, i) => {
		if (r.enabled === false || typeof r.pattern !== "string" || !r.pattern || n >= MAX_USER_RULES) return;
		const base = {
			id: r.id ?? `user-${i + 1}`,
			category: r.category ?? "unknown_bot",
			human: r.action === "human",
		};
		if (r.mode === "regex") {
			if (regex.length >= MAX_USER_REGEX_RULES) return;
			n++;
			const re = compileSafeRegex(r.pattern, "i");
			if (re) regex.push({ ...base, test: (ua) => re.test(ua) });
			return;
		}
		n++;
		const p = r.pattern.toLowerCase();
		const k = all.length;
		const test = r.mode === "exact" ? (ua: string) => ua === p : r.mode === "prefix" ? (ua: string) => ua.startsWith(p) : (ua: string) => ua.includes(p);
		all.push({ ...base, test });
		if (r.mode === "exact") {
			if (!exact.has(p)) exact.set(p, k);
		} else if (r.mode === "prefix") {
			if (!prefix.has(p)) prefix.set(p, k);
		} else contains.push([p, k]);
	});
	const lengths = [...new Set([...prefix.keys()].map((p) => p.length))].sort((a, b) => a - b);
	return {
		regex,
		plain(ua) {
			let best = exact.get(ua) ?? all.length;
			for (const l of lengths) {
				if (l > ua.length) break;
				const k = prefix.get(ua.slice(0, l));
				if (k !== undefined && k < best) best = k;
			}
			for (const [p, k] of contains) {
				if (k >= best) break;
				if (ua.includes(p)) {
					best = k;
					break;
				}
			}
			return all[best];
		},
	};
}
