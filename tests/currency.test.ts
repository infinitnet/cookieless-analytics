import { describe, expect, it } from "vitest";
import { CURRENCIES, exponent, formatAmount, isCurrency, normalizeCurrency, roundMinor } from "../src/core/currency.js";

describe("currency list", () => {
	it("holds the active codes with their exponents and no testing or metal codes", () => {
		expect(CURRENCIES.length).toBeGreaterThan(140);
		expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length);
		for (const c of CURRENCIES) {
			expect(c.code).toMatch(/^[A-Z]{3}$/);
			expect([0, 2, 3]).toContain(c.exp);
			expect(c.name.length).toBeGreaterThan(0);
		}
		for (const x of ["XTS", "XXX", "XAU", "XAG", "XPT", "XPD"]) expect(isCurrency(x)).toBe(false);
		const zero = ["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF", "XPF", "PYG", "RWF", "KMF", "GNF", "DJF", "BIF", "VUV"];
		const three = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"];
		expect(CURRENCIES.filter((c) => c.exp === 0).map((c) => c.code).sort()).toEqual([...zero].sort());
		expect(CURRENCIES.filter((c) => c.exp === 3).map((c) => c.code).sort()).toEqual([...three].sort());
		expect(exponent("USD")).toBe(2);
	});

	it("normalizes input without falling back", () => {
		expect(normalizeCurrency(" usd ")).toBe("USD");
		for (const bad of ["US", "USDD", "XXX1", "ABC", 978, null, undefined]) expect(normalizeCurrency(bad)).toBeNull();
	});
});

describe("rounding and formatting", () => {
	it("rounds half away from zero to the minor unit", () => {
		expect(roundMinor(0.005, "USD")).toBe(0.01);
		expect(roundMinor(1.005, "USD")).toBe(1.01);
		expect(roundMinor(0.005, "JPY")).toBe(0);
		expect(roundMinor(1234.5, "JPY")).toBe(1235);
		expect(roundMinor(1.0005, "KWD")).toBe(1.001);
		expect(roundMinor(1_000_000_000, "USD")).toBe(1_000_000_000);
	});

	it("1,000 events of 0.10 sum to exactly 100.00 after rounding", () => {
		let sum = 0;
		for (let i = 0; i < 1000; i++) sum += roundMinor(0.1, "USD");
		expect(sum).not.toBe(100);
		expect(roundMinor(sum, "USD")).toBe(100);
		expect(formatAmount(sum, "USD")).toBe("100.00 USD");
	});

	it("prints the fixed form with the code", () => {
		expect(formatAmount(1234.5, "USD")).toBe("1,234.50 USD");
		expect(formatAmount(1234.5, "JPY")).toBe("1,235 JPY");
		expect(formatAmount(0, "EUR")).toBe("0.00 EUR");
		expect(formatAmount(1234567.0005, "BHD")).toBe("1,234,567.001 BHD");
		expect(formatAmount(999, "USD")).toBe("999.00 USD");
	});
});

describe("siteSetting", () => {
	it("reads the client's value when present and valid, else the master's", async () => {
		const { siteSetting } = await import("../src/core/site-settings.js");
		const master = { defaultCurrency: "GBP", acceptClientRevenue: true };
		expect(siteSetting(master, undefined, "defaultCurrency")).toBe("GBP");
		expect(siteSetting(master, { defaultCurrency: "EUR" }, "defaultCurrency")).toBe("EUR");
		// A code dropped from a later list reads as Inherit.
		expect(siteSetting(master, { defaultCurrency: "ZZZ" }, "defaultCurrency")).toBe("GBP");
		expect(siteSetting(master, { acceptClientRevenue: false }, "acceptClientRevenue")).toBe(false);
		expect(siteSetting(master, {}, "acceptClientRevenue")).toBe(true);
	});
});
