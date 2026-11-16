/** Page key normalizer per site. */
import { describe, expect, it } from "vitest";
import { canonicalOrigin, pageKeyFor, propertyOrigin } from "../src/sources/page-key.js";

describe("page key", () => {
	const key = pageKeyFor("https://example.com");
	it.each([
		["https://example.com/blog/", "/blog"],
		["http://example.com/blog", "/blog"],
		["https://example.com/", "/"],
		["https://example.com", "/"],
		["https://EXAMPLE.com/Blog/", "/Blog"],
		["https://www.example.com/a?x=1#top", "/a"],
		["https://example.com/a//b/", "/a/b"],
		["/blog/?utm_source=x", "/blog"],
		["/", "/"],
		["https://other.example.net/blog/", null],
		["https://example.com.evil.test/blog", null],
		["ftp://example.com/blog", null],
		["//example.com/blog", null],
		["not a url", null],
	])("%s gives %s", (input, out) => {
		expect(key(input)).toBe(out);
	});

	it("a client site keys on its first registered host and rejects the master's host", () => {
		const origin = canonicalOrigin({ siteOrigin: "https://example.com", client: { hosts: ["shop.example.org", "example.org"] } });
		expect(origin).toBe("https://shop.example.org");
		const k = pageKeyFor(origin);
		expect(k("https://shop.example.org/cart/")).toBe("/cart");
		expect(k("https://example.com/cart/")).toBeNull();
		expect(k("https://example.org/cart/")).toBeNull();
	});

	it("the local origin falls back from siteOrigin to the request and then to the property", () => {
		expect(canonicalOrigin({ siteOrigin: "https://example.com", requestUrl: "https://admin.example.net/x" })).toBe("https://example.com");
		expect(canonicalOrigin({ siteOrigin: "", requestUrl: "https://example.net/_emdash/x" })).toBe("https://example.net");
		expect(canonicalOrigin({ siteOrigin: "", property: "sc-domain:Example.com" })).toBe("https://example.com");
		expect(propertyOrigin("https://www.example.org/")).toBe("https://www.example.org");
		expect(propertyOrigin("garbage")).toBe("");
		// Without any origin only own paths map.
		expect(pageKeyFor("")("/a/")).toBe("/a");
		expect(pageKeyFor("")("https://example.com/a")).toBeNull();
	});
});
