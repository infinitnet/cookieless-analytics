import { describe, expect, it } from "vitest";
import { compileSafeRegex, validateSafeRegex } from "../src/query/safe-regex.js";
import agents from "../src/data/agents.json";

const ACCEPT = [
	"^/blog/", "(foo|bar)-\\d{1,3}", "^/p/[a-z0-9-]+$", "\\.(pdf|zip)$", "(?:ab)?c", "(?<y>\\d{4})-\\d{2}", "[(){}|+*]", "a{2}", "x{1,50}",
	"^https?://", "\\bfoo\\b", "(ab){3}", "\\u00e9", "^[^/]+/[^/]+$", "\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}", "^/p/[a-z0-9-]+/r/\\d+$",
];
const REJECT: Array<[string, RegExp]> = [
	["(a+)+", /Nested/],
	["(a*)*", /Nested/],
	["((a+))+", /Nested/],
	["(a|aa)+", /alternation/],
	["(a|b){2,5}", /alternation/],
	["(ab){2,}", /Unbounded/],
	["(?=x)", /Lookaround/],
	["(?!x)", /Lookaround/],
	["(?<=x)y", /Lookaround/],
	["(?<!x)y", /Lookaround/],
	["(a)\\1", /Backreferences/],
	["(?<n>a)\\k<n>", /Backreferences/],
	[".{1,500}", /Repeats above 50/],
	["a{51}", /Repeats above 50/],
	["\\p{L}", /Unicode property/],
	["[\\p{L}]", /Unicode property/],
	["(" .repeat(21) + ")".repeat(21), /groups/],
	[".*.*.*.*!", /open-ended/],
	[".*x.*!", /open-ended/],
	["[^/]+/[^/]+", /open-ended/],
	["^.*a.*b.*c", /two open-ended/],
	["^a+|b+c+", /open-ended/],
	["a{0,50}a{0,50}a{0,50}!", /combinations/],
	["a?".repeat(11) + "b", /combinations/],
	["(", /compile/],
	["a)", /compile/],
	["*a", /compile/],
	["[abc", /compile/],
	["", /empty/],
	["x".repeat(201), /longer/],
];

describe("validateSafeRegex", () => {
	it("accepts the RE2-like subset", () => {
		for (const p of ACCEPT) expect(validateSafeRegex(p), p).toEqual({ ok: true });
	});

	it("rejects unsafe or invalid patterns with a reason", () => {
		for (const [p, reason] of REJECT) {
			const r = validateSafeRegex(p);
			expect(r.ok, p).toBe(false);
			if (!r.ok) expect(r.error, p).toMatch(reason);
		}
	});

	it("allows only the i flag", () => {
		expect(validateSafeRegex("a", "i").ok).toBe(true);
		for (const f of ["g", "m", "s", "u", "y", "ig"]) expect(validateSafeRegex("a", f).ok, f).toBe(false);
		expect(compileSafeRegex("(a+)+")).toBeNull();
		expect(compileSafeRegex("^/Blog")?.test("/blog/x")).toBe(true);
	});

	it("keeps every generated agent pattern valid", () => {
		for (const a of agents as Array<{ match: { mode: string; pattern: string } }>)
			if (a.match.mode === "regex") expect(validateSafeRegex(a.match.pattern, "i").ok, a.match.pattern).toBe(true);
	});

	// Deterministic: which patterns of an adversarial corpus get through is pinned exactly, and each one that does
	// is bounded by the validator's own rules (one open-ended repeat, or two after `^`, so at most quadratic on the
	// 512 character inputs; at most 1000 combinations of bounded repeats). The clock is only a sanity bound, set
	// far above any loaded runner (one round takes a few milliseconds) and far below what one backtracking pattern
	// costs on these inputs (exponential in the input length, so it would not finish at all).
	it("refuses every catastrophic pattern of an adversarial corpus; the few that pass are bounded by construction", () => {
		const adversarial = [
			"(a+)+$", "(a|a)*$", "(.*a){20}", "^(([a-z])+.)+[A-Z]([a-z])+$", "(\\w+\\s?)*$", "(x+x+)+y", "^(a|aa)+$", "(.*)*",
			"([a-zA-Z]+)*", "(a|b|c|d)+$", "^[a-z]+(\\.[a-z]+)*$", ".*.*.*.*!", "\\w*\\w*\\w*\\w*!", "a{0,50}a{0,50}a{0,50}!", ".*x.*!",
			"[a-z]+x[a-z]+!", "\\w+\\d+!", "^.*x.*!", "^\\w+\\d+!", "^.{0,50}.{0,50}x", "a?a?a?a?a?a?a?a?a?b",
		];
		// Two open-ended repeats after `^` (quadratic at most) and 2^9 = 512 combinations of `?` (under 1000).
		expect(adversarial.filter((p) => compileSafeRegex(p) !== null)).toEqual(["^.*x.*!", "^\\w+\\d+!", "a?a?a?a?a?a?a?a?a?b"]);
		expect(ACCEPT.every((p) => compileSafeRegex(p) !== null)).toBe(true);
		const inputs = ["a".repeat(512), "a".repeat(511) + "!", "x".repeat(512), "1".repeat(512), `${"ab".repeat(256)}`, "/blog/".repeat(80)];
		const t0 = performance.now();
		let runs = 0;
		for (const p of [...adversarial, ...ACCEPT]) {
			const re = compileSafeRegex(p);
			if (!re) continue;
			for (const s of inputs) {
				re.test(s);
				runs++;
			}
		}
		expect(runs).toBe((3 + ACCEPT.length) * inputs.length);
		expect(performance.now() - t0).toBeLessThan(2000);
	});
});
