/**
 * Text form of your user agent rules, one rule per line: `action mode pattern # comment`.
 * Shared by the admin editor (local check) and the bulk route (server check), so both report the same lines.
 */
import { validateSafeRegex } from "../query/safe-regex.js";
import { compileUserRules, MAX_RULE_PATTERN, MAX_USER_REGEX_RULES, MAX_USER_RULES, type UserAgentRule } from "./rules.js";

export type RuleMode = UserAgentRule["mode"];
export const RULE_MODES: readonly RuleMode[] = ["contains", "prefix", "exact", "regex"];
const MAX_NAME = 64;

/** One rule as the text carries it; the comment is kept as the rule name. */
export interface LineRule {
	action: "robot" | "human";
	mode: RuleMode;
	pattern: string;
	name?: string;
}
export interface LineIssue {
	line: number;
	message: string;
}
export interface ParsedLines {
	rules: Array<LineRule & { line: number }>;
	errors: LineIssue[];
}

/** Current browser user agents that no `bot` rule should match (the same list as `scripts/build-agent-data.mjs`). */
export const BROWSER_UAS = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
	"Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0]",
];

export const RULE_TEXT = {
	example: ["# action mode pattern # optional comment", "bot contains examplemonitor # Uptime monitor", "bot prefix examplefetcher/", "human contains exampleapp # Our own app", "bot regex ^examplebot/\\d+$"].join("\n"),
	shape: "Write action, mode and pattern, for example: bot contains examplebot",
	action: (a: string) => `Unknown action "${a}": use bot or human.`,
	mode: (m: string) => `Unknown mode "${m}": use contains, prefix, exact or regex.`,
	long: `Pattern longer than ${MAX_RULE_PATTERN} characters.`,
	name: `Comment longer than ${MAX_NAME} characters (it is kept as the rule name).`,
	regex: (e: string) => `Unsafe or invalid regex: ${e}`,
	duplicate: (n: number) => `Same mode and pattern as line ${n}.`,
	total: `At most ${MAX_USER_RULES} rules in total; this line is rule ${MAX_USER_RULES + 1}.`,
	regexCap: `At most ${MAX_USER_REGEX_RULES} regex rules; this line is regex rule ${MAX_USER_REGEX_RULES + 1}.`,
	browser: "This bot rule matches a current browser user agent, so real visitors would be excluded.",
	order: "This new rule is stored after the rules you keep, so a kept rule on a later line still wins when both match.",
	hash: "A pattern cannot hold a space, # and a space: the text view reads that as the start of a comment.",
	same: "A rule with the same mode and pattern exists.",
};

/** Mode and pattern, as rules are matched (regex patterns keep their case). */
export const ruleKey = (r: { mode: string; pattern: string }) => `${r.mode} ${r.mode === "regex" ? r.pattern : r.pattern.toLowerCase()}`;
const toUser = (r: LineRule): UserAgentRule => ({ pattern: r.pattern, mode: r.mode, action: r.action });

/** Parse the text; every error and warning carries its 1-based line number. */
export function parseRuleLines(text: string): ParsedLines {
	const out: ParsedLines = { rules: [], errors: [] };
	const seen = new Map<string, number>();
	let regex = 0;
	text.split(/\r?\n/).forEach((raw, i) => {
		const line = i + 1;
		let s = raw.trim();
		if (!s || s.startsWith("#")) return;
		let name: string | undefined;
		const c = s.indexOf(" # ");
		if (c >= 0) {
			name = s.slice(c + 3).trim() || undefined;
			s = s.slice(0, c).trim();
		}
		const m = /^(\S+)\s+(\S+)\s+(.+)$/.exec(s);
		const err = (message: string) => out.errors.push({ line, message });
		if (!m) return void err(RULE_TEXT.shape);
		const [, action = "", mode = "", pattern = ""] = m;
		const before = out.errors.length;
		if (action !== "bot" && action !== "human") err(RULE_TEXT.action(action));
		if (!(RULE_MODES as readonly string[]).includes(mode)) err(RULE_TEXT.mode(mode));
		if (pattern.length > MAX_RULE_PATTERN) err(RULE_TEXT.long);
		if (name && name.length > MAX_NAME) err(RULE_TEXT.name);
		if (mode === "regex") {
			const v = validateSafeRegex(pattern, "i");
			if (!v.ok) err(RULE_TEXT.regex(v.error));
		}
		const key = ruleKey({ mode, pattern });
		const first = seen.get(key);
		if (first) err(RULE_TEXT.duplicate(first));
		else seen.set(key, line);
		if (out.errors.length > before) return;
		const rule: LineRule = { action: action === "human" ? "human" : "robot", mode: mode as RuleMode, pattern, ...(name ? { name } : {}) };
		if (out.rules.length === MAX_USER_RULES) err(RULE_TEXT.total);
		if (mode === "regex" && ++regex === MAX_USER_REGEX_RULES + 1) err(RULE_TEXT.regexCap);
		out.rules.push({ ...rule, line });
	});
	return out;
}

/** Bot rules that match a current browser user agent, as the data generator refuses them (server side: keeps the list out of the admin). */
export function browserWarnings(rules: ReadonlyArray<LineRule & { line: number }>): LineIssue[] {
	return rules
		.filter((rule) => {
			if (rule.action !== "robot") return false;
			const one = compileUserRules([toUser(rule)]);
			return BROWSER_UAS.some((raw) => {
				const ua = raw.toLowerCase();
				return rule.mode === "regex" ? one.regex.some((r) => r.test(ua)) : one.plain(ua) !== undefined;
			});
		})
		.map((r) => ({ line: r.line, message: RULE_TEXT.browser }));
}

/**
 * Added lines above a kept one: a save stores new rules after the rules it keeps, whatever their line,
 * so the kept rule below still wins when both match.
 */
export function orderWarnings(rules: ReadonlyArray<LineRule & { line: number }>, stored: ReadonlyArray<{ mode: string; pattern: string }>): LineIssue[] {
	const kept = new Set(stored.map(ruleKey));
	let last = -1;
	rules.forEach((r, i) => kept.has(ruleKey(r)) && (last = i));
	return rules.flatMap((r, i) => (i < last && !kept.has(ruleKey(r)) ? [{ line: r.line, message: RULE_TEXT.order }] : []));
}

/** One rule as a line of text. */
export const formatRule = (r: LineRule) => `${r.action === "human" ? "human" : "bot"} ${r.mode} ${r.pattern}${r.name ? ` # ${r.name}` : ""}`;
export const formatRules = (rules: readonly LineRule[]) => rules.map(formatRule).join("\n");

export interface RuleDiff<D> {
	added: LineRule[];
	changed: Array<{ id: string; from: D; to: LineRule }>;
	removed: Array<{ id: string; data: D }>;
	unchanged: number;
}

/** What a save of `next` changes on the stored rows, matched by mode and pattern; a second stored row with the same key is removed. */
export function diffRules<D extends LineRule>(current: ReadonlyArray<{ id: string; data: D }>, next: readonly LineRule[]): RuleDiff<D> {
	const byKey = new Map<string, { id: string; data: D }>();
	const removed: RuleDiff<D>["removed"] = [];
	for (const row of current) {
		const k = ruleKey(row.data);
		if (byKey.has(k)) removed.push(row);
		else byKey.set(k, row);
	}
	const diff: RuleDiff<D> = { added: [], changed: [], removed, unchanged: 0 };
	for (const r of next) {
		const k = ruleKey(r);
		const row = byKey.get(k);
		if (!row) diff.added.push(r);
		else if (row.data.action !== r.action || (row.data.name ?? "") !== (r.name ?? "") || row.data.pattern !== r.pattern) diff.changed.push({ id: row.id, from: row.data, to: r });
		else diff.unchanged++;
		byKey.delete(k);
	}
	diff.removed.push(...byKey.values());
	return diff;
}

const META = new Set([..."^$.*+?()[]{}|\\"]);

/**
 * The plain rule that overrides a built-in entry: its `contains` pattern, or a regex that is a literal
 * (escaped punctuation and `[xX]` case pairs allowed), as `contains` or, with a leading `^`, as `prefix`.
 * Null for a real pattern, which only a rule written for the exact user agent can override.
 */
export function builtinOverride(match: { mode: "contains" | "regex"; pattern: string }): { mode: "contains" | "prefix"; pattern: string } | null {
	if (match.mode === "contains") return { mode: "contains", pattern: match.pattern };
	let s = match.pattern.replace(/\[([a-zA-Z])([a-zA-Z])\]/g, (all, a: string, b: string) => (a.toLowerCase() === b.toLowerCase() ? a : all));
	const anchored = s.startsWith("^");
	if (anchored) s = s.slice(1);
	let lit = "";
	for (let i = 0; i < s.length; i++) {
		const ch = s[i] as string;
		if (ch === "\\") {
			const next = s[i + 1];
			if (next === undefined || /[a-zA-Z0-9]/.test(next)) return null;
			lit += next;
			i++;
		} else if (META.has(ch)) return null;
		else lit += ch;
	}
	lit = lit.toLowerCase();
	return lit.trim() ? { mode: anchored ? "prefix" : "contains", pattern: lit } : null;
}
