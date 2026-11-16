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

	it("validates and runs an adversarial corpus in under 50 ms", () => {
		const corpus = [
			"(a+)+$", "(a|a)*$", "(.*a){20}", "^(([a-z])+.)+[A-Z]([a-z])+$", "(\\w+\\s?)*$", "(x+x+)+y", "^(a|aa)+$", "(.*)*",
			"([a-zA-Z]+)*", "(a|b|c|d)+$", "^[a-z]+(\\.[a-z]+)*$", ".*.*.*.*!", "\\w*\\w*\\w*\\w*!", "a{0,50}a{0,50}a{0,50}!", ".*x.*!",
			"[a-z]+x[a-z]+!", "\\w+\\d+!", "^.*x.*!", "^\\w+\\d+!", "^.{0,50}.{0,50}x", "a?a?a?a?a?a?a?a?a?b", ...ACCEPT,
		];
		const inputs = ["a".repeat(512), "a".repeat(511) + "!", "x".repeat(512), "1".repeat(512), `${"ab".repeat(256)}`, "/blog/".repeat(80)];
		const t0 = performance.now();
		for (let round = 0; round < 5; round++)
			for (const p of corpus) {
				const re = compileSafeRegex(p);
				if (re) for (const s of inputs) re.test(s);
			}
		expect(performance.now() - t0).toBeLessThan(50);
	});
});
