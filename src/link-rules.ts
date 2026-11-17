/**
 * Link rules (`linkRules` setting): one rule per line, `<pattern> <event> [label]`. Parsed here for the
 * server and the admin page; the page script (`src/client/boot.ts`) runs the same match at click time.
 * A leaf module: the admin Settings page imports it, so it imports nothing else.
 */
import { isNeutral } from "./names.js";
import { validateSafeRegex } from "./query/safe-regex.js";

/** Pattern (literal prefix, or `~` and a regular expression), event name or `-`, optional fixed `slug`. */
export type LinkRule = [pattern: string, event: string, label?: string];

export const MAX_LINK_RULES = 20;
export const MAX_LINK_RULES_TEXT = 2048;
/** Link target strings are cut to this length, the input bound `validateSafeRegex` is tuned for. */
export const MAX_LINK_TARGET = 512;

const HOST_RE = /^([a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{1,5})?)\//i;
const EVENT_RE = /^[A-Za-z0-9.:-][A-Za-z0-9_.:-]{0,63}$/;
const LABEL_RE = /^[^\s\u0000-\u001f\u007f]{1,64}$/;

/** Valid rules (the first 20) and the message of the first bad line, if any. Bad lines are left out. */
export function parseLinkRules(text: string, ignored: readonly string[] = []): { rules: LinkRule[]; error?: string } {
	const rules: LinkRule[] = [];
	let error = text.length > MAX_LINK_RULES_TEXT ? "All rules together are longer than 2,048 characters." : undefined;
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim() ?? "";
		if (!line) continue;
		const bad = lineError(line, ignored, rules);
		if (bad) error ??= `Line ${i + 1}: ${bad}`;
		else if (rules.length < MAX_LINK_RULES) rules.push(ruleOf(line));
		else error ??= `At most ${MAX_LINK_RULES} rules.`;
	}
	return error ? { rules, error } : { rules };
}

/** The rule of a valid line; a host is lowercased, as the browser gives it. */
function ruleOf(line: string): LinkRule {
	const [p = "", n = "", l] = line.split(/\s+/);
	const pattern = p.replace(HOST_RE, (h) => h.toLowerCase());
	return l ? [pattern, n, l] : [pattern, n];
}

function lineError(line: string, ignored: readonly string[], rules: readonly LinkRule[]): string | undefined {
	const parts = line.split(/\s+/);
	if (parts.length < 2 || parts.length > 3) return 'use "pattern event" or "pattern event label".';
	const [p = "", n = "", l] = parts;
	const regex = p[0] === "~" && p.length > 1;
	if (!regex && !(p[0] === "/" || p.startsWith("mailto:") || p.startsWith("tel:") || HOST_RE.test(p)))
		return "the pattern starts with /, a host name, mailto:, tel: or ~ for a regular expression.";
	if (regex) {
		const r = validateSafeRegex(p.slice(1), "i");
		if (!r.ok) return r.error;
	} else if (p.length > 200) return "the pattern is longer than 200 characters.";
	if (n !== "-" && !EVENT_RE.test(n)) return "the event name uses letters, digits, _ . : and -, up to 64 characters, and does not start with _.";
	if (n === "seen" || n === "conv") return "seen and conv are not click events.";
	if (l !== undefined && !LABEL_RE.test(l)) return "the label is 1 to 64 characters with no spaces.";
	if (!isNeutral(line)) return "contains a word that is not served to visitors.";
	const under = p[0] === "/" ? ignored.find((x) => p.startsWith(x)) : undefined;
	if (under) return `${under} is a short link path prefix, whose redirect already reports the click. Remove it there or here.`;
	const pattern = ruleOf(line)[0];
	if (rules.some((r) => r[0] === pattern)) return "the same pattern is used twice.";
	return undefined;
}

/**
 * The string rules match against, as the page script builds it: the path for a link to the page's own host,
 * host and path for another http(s) host, the href without its query for anything else (`mailto:`, `tel:`).
 */
export function linkTarget(url: URL, pageHost: string): string {
	const web = url.protocol === "http:" || url.protocol === "https:";
	return (web ? (url.host === pageHost ? "" : url.host) + url.pathname : url.href.split("?")[0] || "").slice(0, MAX_LINK_TARGET);
}

/**
 * The first rule matching `target`: its index, event (`-` sends nothing) and `slug`. Mirrors the click handler
 * in `src/client/boot.ts`; tests/client.test.ts checks both give the same result.
 */
export function matchLinkRule(rules: readonly LinkRule[], target: string): { index: number; event: string; slug: string } | null {
	for (let i = 0; i < rules.length; i++) {
		const [p, n, l] = rules[i] as LinkRule;
		let s: string | undefined;
		try {
			if (p[0] === "~") {
				const m = new RegExp(p.slice(1), "i").exec(target);
				if (m) s = m[1] || m[0];
			} else if (!target.indexOf(p)) s = target.slice(p.length);
		} catch {}
		if (s !== undefined) return { index: i, event: n, slug: n === "-" ? "" : (l || s.replace(/\/$/, "") || target).slice(0, 128) };
	}
	return null;
}
