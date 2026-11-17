import { describe, expect, it } from "vitest";
import { addDays, dayInZone, daysBetween, eachDay, hourInZone, previousPeriod, saltBoundary, saltDay, samePeriodLastYear, tzOffset, zonedToEpoch } from "../src/core/time.js";

const t = (iso: string) => Date.parse(iso) / 1000;

describe("zones", () => {
	it("computes local day and hour", () => {
		expect(dayInZone(t("2026-01-15T23:30:00Z"), "UTC")).toBe("2026-01-15");
		expect(dayInZone(t("2026-01-15T23:30:00Z"), "Europe/Berlin")).toBe("2026-01-16");
		expect(hourInZone(t("2026-01-15T23:30:00Z"), "Europe/Berlin")).toBe(0);
		expect(hourInZone(t("2026-07-15T23:30:00Z"), "Europe/Berlin")).toBe(1);
		expect(dayInZone(t("2026-01-16T03:00:00Z"), "America/New_York")).toBe("2026-01-15");
		expect(hourInZone(t("2026-01-16T03:00:00Z"), "America/New_York")).toBe(22);
		expect(hourInZone(t("2026-01-16T00:00:00Z"), "UTC")).toBe(0);
	});

	it("converts wall time to epoch across DST", () => {
		expect(tzOffset(t("2026-01-15T12:00:00Z"), "Europe/Berlin")).toBe(3600);
		expect(tzOffset(t("2026-07-15T12:00:00Z"), "Europe/Berlin")).toBe(7200);
		expect(zonedToEpoch("2026-01-16", 4, "Europe/Berlin")).toBe(t("2026-01-16T03:00:00Z"));
		expect(zonedToEpoch("2026-07-16", 4, "Europe/Berlin")).toBe(t("2026-07-16T02:00:00Z"));
		expect(zonedToEpoch("2026-03-29", 4, "Europe/Berlin")).toBe(t("2026-03-29T02:00:00Z"));
		expect(zonedToEpoch("2026-10-25", 4, "Europe/Berlin")).toBe(t("2026-10-25T03:00:00Z"));
	});
});

describe("salt day", () => {
	it("starts the day at the rotation hour in the salt timezone", () => {
		// 02:59 Berlin belongs to the previous salt day; 04:00 Berlin starts a new one.
		expect(saltDay(t("2026-01-16T01:59:00Z"), "Europe/Berlin", 4)).toBe("2026-01-15");
		expect(saltDay(t("2026-01-16T02:59:59Z"), "Europe/Berlin", 4)).toBe("2026-01-15");
		expect(saltDay(t("2026-01-16T03:00:00Z"), "Europe/Berlin", 4)).toBe("2026-01-16");
		expect(saltDay(t("2026-01-16T00:00:00Z"), "UTC", 0)).toBe("2026-01-16");
		expect(saltDay(t("2026-01-01T00:30:00Z"), "UTC", 1)).toBe("2025-12-31");
	});

	it("returns the epoch at which the current salt day began", () => {
		expect(saltBoundary(t("2026-01-16T05:00:00Z"), "Europe/Berlin", 4)).toBe(t("2026-01-16T03:00:00Z"));
		expect(saltBoundary(t("2026-01-16T02:00:00Z"), "Europe/Berlin", 4)).toBe(t("2026-01-15T03:00:00Z"));
		expect(saltBoundary(t("2026-03-29T12:00:00Z"), "Europe/Berlin", 4)).toBe(t("2026-03-29T02:00:00Z"));
		expect(saltBoundary(t("2026-01-16T10:00:00Z"), "UTC", 0)).toBe(t("2026-01-16T00:00:00Z"));
	});
});

describe("ranges", () => {
	it("does calendar arithmetic", () => {
		expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
		expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
		expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
		expect(daysBetween("2026-03-01", "2026-03-31")).toBe(31);
		expect(eachDay("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
	});

	it("shifts to the previous period and the same period last year", () => {
		expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-01-29", to: "2026-02-28" });
		expect(previousPeriod({ from: "2026-03-10", to: "2026-03-10" })).toEqual({ from: "2026-03-09", to: "2026-03-09" });
		expect(samePeriodLastYear({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2025-03-01", to: "2025-03-31" });
		expect(samePeriodLastYear({ from: "2028-02-29", to: "2028-03-01" })).toEqual({ from: "2027-02-28", to: "2027-03-01" });
	});
});
