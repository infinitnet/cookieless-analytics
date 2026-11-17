/** Link rules: the line format, every refusal with its line number, the caps, and the label order of a match. */
import { describe, expect, it } from "vitest";
import { FORBIDDEN_PUBLIC_WORDS } from "../src/contract.js";
import { linkTarget, MAX_LINK_RULES, matchLinkRule, parseLinkRules } from "../src/link-rules.js";

const EXAMPLES = `/go/ out
~^/recommends/([^/]+) out
shop.example.net/ shop_click
ads.example.com/ -
mailto: contact email
tel: contact phone
~^(?:www\\.)?(instagram|facebook|linkedin)\\.com/ social`;

const err = (text: string, ignored: string[] = []) => parseLinkRules(text, ignored).error;

describe("parseLinkRules", () => {
	it("accepts the seven example lines, in order, and skips blank lines", () => {
		const r = parseLinkRules(`\n${EXAMPLES}\n\n`);
		expect(r.error).toBeUndefined();
		expect(r.rules).toEqual([
			["/go/", "out"],
			["~^/recommends/([^/]+)", "out"],
			["shop.example.net/", "shop_click"],
			["ads.example.com/", "-"],
			["mailto:", "contact", "email"],
			["tel:", "contact", "phone"],
			["~^(?:www\\.)?(instagram|facebook|linkedin)\\.com/", "social"],
		]);
		expect(parseLinkRules("").rules).toEqual([]);
	});

	it("lowercases a host pattern, as the browser gives the host", () => {
		expect(parseLinkRules("Shop.Example.NET/P/ x").rules).toEqual([["shop.example.net/P/", "x"]]);
	});

	it.each([
		["/go/", 'Line 1: use "pattern event" or "pattern event label".'],
		["/go/ out a b", 'Line 1: use "pattern event" or "pattern event label".'],
		["go out", "Line 1: the pattern starts with /, a host name, mailto:, tel: or ~ for a regular expression."],
		["~ out", "Line 1: the pattern starts with /, a host name, mailto:, tel: or ~ for a regular expression."],
		["~^(a+)+$ out", "Line 1: Nested quantifiers are not allowed."],
		["~[ out", "Line 1: Pattern does not compile."],
		["/go/ _x", "Line 1: the event name uses letters, digits, _ . : and -, up to 64 characters, and does not start with _."],
		[`/go/ ${"e".repeat(65)}`, "Line 1: the event name uses letters, digits, _ . : and -, up to 64 characters, and does not start with _."],
		["/go/ seen", "Line 1: seen and conv are not click events."],
		["/go/ conv", "Line 1: seen and conv are not click events."],
		[`/go/ out ${"l".repeat(65)}`, "Line 1: the label is 1 to 64 characters with no spaces."],
		[`/${"p".repeat(200)} out`, "Line 1: the pattern is longer than 200 characters."],
		["/go/ out\n/go/ other", "Line 2: the same pattern is used twice."],
	])("%j is refused: %s", (text, message) => {
		expect(err(text)).toBe(message);
	});

	it("names the first bad line by its line number and keeps the valid lines", () => {
		const r = parseLinkRules("/go/ out\n\nbad x\n/a/ x\n~(a|b)+ y");
		expect(r.error).toBe("Line 3: the pattern starts with /, a host name, mailto:, tel: or ~ for a regular expression.");
		expect(r.rules).toEqual([
			["/go/", "out"],
			["/a/", "x"],
		]);
	});

	it("refuses every word of the neutral public footprint on the line", () => {
		for (const w of FORBIDDEN_PUBLIC_WORDS) {
			expect(err(`/${w}/ x`), w).toBe("Line 1: contains a word that is not served to visitors.");
			expect(err(`/go/ x ${w.toUpperCase()}`), w).toBe("Line 1: contains a word that is not served to visitors.");
		}
	});

	it("refuses a path prefix under a short link prefix, not the other way round", () => {
		expect(err("/go/alpha out", ["/go/"])).toBe("Line 1: /go/ is a short link path prefix, whose redirect already reports the click. Remove it there or here.");
		expect(err("/g out", ["/go/"])).toBeUndefined();
		expect(err("~^/go/ out", ["/go/"])).toBeUndefined();
	});

	it("caps: 20 rules, 2,048 characters", () => {
		const lines = Array.from({ length: MAX_LINK_RULES + 1 }, (_, i) => `/p${i}/ e`);
		const r = parseLinkRules(lines.join("\n"));
		expect(r.error).toBe("At most 20 rules.");
		expect(r.rules).toHaveLength(20);
		expect(err(lines.slice(0, 20).join("\n"))).toBeUndefined();
		const long = `/go/ out\n${" ".repeat(2048)}`;
		expect(long.length).toBe(2057);
		expect(err(long)).toBe("All rules together are longer than 2,048 characters.");
	});
});

describe("matchLinkRule", () => {
	const { rules } = parseLinkRules(`/fixed/ a pinned\n~^/g1/([^/]+) b\n~^/whole/[a-z]+ c\n/go/ out\n/none/ -`);

	it("label order: fixed label, group 1, whole match, rest after the prefix without one trailing slash, whole target", () => {
		expect(matchLinkRule(rules, "/fixed/x")).toEqual({ index: 0, event: "a", slug: "pinned" });
		expect(matchLinkRule(rules, "/g1/beta/y")).toEqual({ index: 1, event: "b", slug: "beta" });
		expect(matchLinkRule(rules, "/whole/abc/9")).toEqual({ index: 2, event: "c", slug: "/whole/abc" });
		expect(matchLinkRule(rules, "/go/alpha-offer/")).toEqual({ index: 3, event: "out", slug: "alpha-offer" });
		expect(matchLinkRule(rules, "/go/")).toEqual({ index: 3, event: "out", slug: "/go/" });
	});

	it("a deny rule matches with no slug; no match is null; the slug is cut to 128", () => {
		expect(matchLinkRule(rules, "/none/x")).toEqual({ index: 4, event: "-", slug: "" });
		expect(matchLinkRule(rules, "/next")).toBeNull();
		expect(matchLinkRule(rules, `/go/${"s".repeat(300)}`)?.slug).toHaveLength(128);
	});

	it("regular expressions ignore case, prefixes do not; the first match wins", () => {
		expect(matchLinkRule(rules, "/G1/X")?.slug).toBe("X");
		expect(matchLinkRule(rules, "/GO/x")).toBeNull();
		expect(matchLinkRule([["/a", "first"], ["/a/b", "second"]], "/a/b")?.event).toBe("first");
	});

	it("linkTarget: path on the page host, host and path elsewhere, href without query otherwise, cut to 512", () => {
		expect(linkTarget(new URL("https://example.com/go/x?y=1#z"), "example.com")).toBe("/go/x");
		expect(linkTarget(new URL("https://shop.example.net/p/42?u=1"), "example.com")).toBe("shop.example.net/p/42");
		expect(linkTarget(new URL("mailto:hello@example.org?subject=Hi"), "example.com")).toBe("mailto:hello@example.org");
		expect(linkTarget(new URL(`https://example.com/${"a".repeat(600)}`), "example.com")).toHaveLength(512);
	});
});
