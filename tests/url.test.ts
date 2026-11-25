/** Site search term sanitizer and its place in `normalizeUrl`. */
import { describe, expect, it } from "vitest";
import { normalizeUrl, sanitizeSearchTerm } from "../src/core/url.js";
import { normalizeSettings, parseSiteSearchParams } from "../src/settings.js";

describe("sanitizeSearchTerm", () => {
	it("trims, lowercases and collapses whitespace", () => {
		expect(sanitizeSearchTerm("  Red \t SHOES\n")).toBe("red shoes");
	});
	it("truncates at 64 characters", () => {
		expect(sanitizeSearchTerm("a".repeat(100))).toBe("a".repeat(64));
	});
	it("redacts an email and nine or more consecutive digits", () => {
		expect(sanitizeSearchTerm("mail me at someone@example.com")).toBe("redacted");
		expect(sanitizeSearchTerm("order 0123456789")).toBe("redacted");
		expect(sanitizeSearchTerm("12345678")).toBe("12345678");
		expect(sanitizeSearchTerm("123 456 789")).toBe("123 456 789");
	});
});

describe("normalizeUrl with site search names", () => {
	it("keeps only the exact names, sanitized, next to the allowlist", () => {
		expect(normalizeUrl("/s?S=Hello%20World&utm_source=x&sx=1", ["utm_*"], ["s"]).query).toBe("s=hello+world&utm_source=x");
		expect(normalizeUrl("/s?q=%20%20", [], ["q"]).query).toBe("");
		expect(normalizeUrl("/s?q=hi", []).query).toBe("");
	});
});

describe("siteSearchParams setting", () => {
	it("is empty by default and keeps at most five valid lowercase names", () => {
		expect(normalizeSettings({}).siteSearchParams).toEqual([]);
		expect(normalizeSettings({ siteSearchParams: "Q, s,bad-name, a, b, c, d" }).siteSearchParams).toEqual(["q", "s", "a", "b", "c"]);
		expect(parseSiteSearchParams("q,toolongparameter_x,a b c d e")).toEqual({ names: ["q", "a", "b", "c", "d"], invalid: ["toolongparameter_x", "e"] });
	});
});
