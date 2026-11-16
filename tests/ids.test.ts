import { describe, expect, it } from "vitest";
import { cleanProps, isEventName, isPath, isReferrer, isSid, validateIngest, validateRevenue } from "../src/core/ids.js";
import { validateSafeRegex } from "../src/query/safe-regex.js";

const SID = "abcdefghij0123456789";
const H = "abcdef012345";

describe("validators", () => {
	it("checks sid, event names, paths and referrers", () => {
		expect(isSid(SID)).toBe(true);
		expect(isSid("ABCDEFGHIJ0123456789")).toBe(false);
		expect(isEventName("signup")).toBe(true);
		expect(isEventName("plan: pro-2")).toBe(true);
		expect(isEventName("_outbound")).toBe(false);
		expect(isEventName("_outbound", true)).toBe(true);
		expect(isEventName("_custom", true)).toBe(false);
		expect(isEventName("x".repeat(65))).toBe(false);
		expect(isPath("/a?b=1")).toBe(true);
		expect(isPath("//evil.example/")).toBe(false);
		expect(isPath(`/${"a".repeat(2048)}`)).toBe(false);
		expect(isReferrer("")).toBe(true);
		expect(isReferrer("https://example.org/x")).toBe(true);
		expect(isReferrer("javascript:alert(1)")).toBe(false);
	});

	it("cleans props and keeps only the fixed key on reserved events", () => {
		expect(cleanProps({ plan: "pro", n: 2, ok: true, bad: { x: 1 }, "no-dash": "x", long: "x".repeat(129) })).toEqual({ plan: "pro", n: 2, ok: true });
		expect(cleanProps({ url: "example.org/a", extra: "x" }, "_outbound")).toEqual({ url: "example.org/a" });
		expect(cleanProps(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`k${i}`, i])))).toEqual(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, i])));
		expect(cleanProps([1, 2])).toBeUndefined();
	});
});

describe("validateIngest", () => {
	it("accepts the contract shapes", () => {
		expect(validateIngest({ v: 1, t: "pv", sid: SID, n: 1, h: H, u: "/a", r: "https://x.example/", w: 1440 })).toEqual({ v: 1, t: "pv", sid: SID, n: 1, h: H, u: "/a", r: "https://x.example/", w: 1440 });
		expect(validateIngest({ v: 1, t: "en", sid: SID, h: H, d: 99_999_999, s: 75, i: 1 }, 1_800_000)).toEqual({ v: 1, t: "en", sid: SID, h: H, d: 1_800_000, s: 75, i: 1 });
		expect(validateIngest({ v: 1, t: "ev", name: "signup", p: { plan: "pro" }, val: 2 })).toEqual({ v: 1, t: "ev", name: "signup", p: { plan: "pro" }, val: 2 });
	});

	it("validates revenue and keeps the event when the revenue fields are dropped", () => {
		const ev = (x: Record<string, unknown>) => validateIngest({ v: 1, t: "ev", name: "purchase", ...x });
		expect(ev({ val: 49.9, cur: "eur", oid: "A-1001" })).toEqual({ v: 1, t: "ev", name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001" });
		expect(ev({ val: 0 })).toEqual({ v: 1, t: "ev", name: "purchase", val: 0 });
		expect(ev({ val: 1_000_000_000 })).toMatchObject({ val: 1_000_000_000 });
		expect(ev({ val: 0.005, cur: "usd" })).toMatchObject({ val: 0.005, cur: "USD" });
		for (const val of [1_000_000_001, -1, Number.NaN, Number.POSITIVE_INFINITY, "12", null]) {
			expect(ev({ val, cur: "USD", oid: "A-1001" }), String(val)).toEqual({ v: 1, t: "ev", name: "purchase", revenueInvalid: true });
		}
		for (const cur of ["US", "USDD", "XXX1", "ABC", "XXX", 840]) {
			expect(ev({ val: 5, cur }), String(cur)).toEqual({ v: 1, t: "ev", name: "purchase", revenueInvalid: true });
		}
		// `cur` and `oid` without `val` are ignored, valid or not.
		expect(ev({ cur: "nope", oid: "!!" })).toEqual({ v: 1, t: "ev", name: "purchase" });
		expect(ev({ val: 5, oid: "x".repeat(64) })).toMatchObject({ oid: "x".repeat(64) });
		expect(ev({ val: 5, oid: "A_1.2:3-x" })).toMatchObject({ oid: "A_1.2:3-x" });
		for (const oid of ["", "x".repeat(65), "A 1", "A/1", "ä", 1001]) expect(ev({ val: 5, oid }), String(oid)).toMatchObject({ revenueInvalid: true });
		// Reserved events drop all three, silently.
		expect(validateIngest({ v: 1, t: "ev", name: "_form", p: { form: "contact", extra: 1 }, val: 2, cur: "USD", oid: "A-1" })).toEqual({ v: 1, t: "ev", name: "_form", p: { form: "contact" } });
		expect(validateRevenue({ val: 5, cur: "JPY" })).toEqual({ val: 5, cur: "JPY" });
		expect(validateRevenue({ val: 5, cur: "ZZZ" })).toEqual({ error: "invalid_currency" });
		expect(validateRevenue({ val: 5, oid: "a b" })).toEqual({ error: "invalid_id" });
		expect(validateRevenue({ val: -5 })).toEqual({ error: "invalid_value" });
	});

	it("keeps nt, e and x in range and drops only the field otherwise", () => {
		expect(validateIngest({ v: 1, t: "pv", h: H, u: "/a", nt: 2 })).toMatchObject({ nt: 2 });
		expect(validateIngest({ v: 1, t: "en", h: H, d: 5, e: 900, x: 2 }, 1_800_000)).toEqual({ v: 1, t: "en", h: H, d: 5, e: 900, x: 2 });
		for (const nt of [3, -1, 1.5, "2", null]) {
			const r = validateIngest({ v: 1, t: "pv", h: H, u: "/a", nt });
			expect(r, String(nt)).toEqual({ v: 1, t: "pv", h: H, u: "/a" });
		}
		for (const [e, x] of [[0, 3], [1_800_001, -1], [1.5, "1"], ["9", 0.5]] as const) {
			const r = validateIngest({ v: 1, t: "en", h: H, d: 5, e, x }, 1_800_000);
			expect(r, `${e} ${x}`).toEqual({ v: 1, t: "en", h: H, d: 5 });
		}
	});

	it("rejects malformed bodies", () => {
		for (const bad of [null, [], { v: 2, t: "pv", h: H, u: "/" }, { v: 1, t: "pv", h: H }, { v: 1, t: "pv", h: "x", u: "/" }, { v: 1, t: "pv", sid: "bad", h: H, u: "/" }, { v: 1, t: "en", h: H, d: -1 }, { v: 1, t: "ev", name: "_secret" }, { v: 1, t: "zz" }, { v: 1, t: "pv", h: H, u: "/", w: 1.5 }])
			expect(validateIngest(bad), JSON.stringify(bad)).toBeNull();
	});
});

describe("safe-regex (minimal validator)", () => {
	it("accepts simple patterns and rejects dangerous ones", () => {
		for (const ok of ["^/blog/", "(foo|bar)-\\d{1,3}", "Ahrefs(Bot|SiteAudit)"]) expect(validateSafeRegex(ok), ok).toEqual({ ok: true });
		for (const bad of ["(a+)+", "(a|aa)+", "(?=x)", "(?<!x)y", "(a)\\1", ".{1,500}", "\\p{L}", "", "x".repeat(201), "("]) expect(validateSafeRegex(bad).ok, bad).toBe(false);
		expect(validateSafeRegex("abc", "g").ok).toBe(false);
	});
});
