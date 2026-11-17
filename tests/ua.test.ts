import { describe, expect, it } from "vitest";
import { parseUa, uaNorm } from "../src/core/ua.js";

describe("parseUa", () => {
	it.each([
		["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "Chrome", "142", "Windows", "desktop"],
		["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "Chrome", "142", "macOS", "desktop"],
		["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36", "Chrome", "142", "ChromeOS", "desktop"],
		["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36", "Chrome", "141", "Android", "mobile"],
		["Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", "Chrome", "140", "Android", "tablet"],
		["Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.46 Mobile/15E148 Safari/604.1", "Chrome", "142", "iOS", "mobile"],
		["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0", "Edge", "142", "Windows", "desktop"],
		["Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 EdgA/142.0.0.0", "Edge", "142", "Android", "mobile"],
		["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0", "Firefox", "145", "Windows", "desktop"],
		["Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", "Firefox", "140", "Linux", "desktop"],
		["Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/145.0 Mobile/15E148 Safari/605.1.15", "Firefox", "145", "iOS", "mobile"],
		["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15", "Safari", "18", "macOS", "desktop"],
		["Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1", "Safari", "18", "iOS", "mobile"],
		["Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1", "Safari", "18", "iOS", "tablet"],
		["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 OPR/125.0.0.0", "Opera", "125", "Windows", "desktop"],
		["Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36", "Samsung Internet", "28", "Android", "mobile"],
		["Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.32.106]", "Other", "", "iOS", "mobile"],
		["Mozilla/5.0 (Linux; Android 9; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/131.3.1 like Chrome/131.0.0.0 Safari/537.36", "Chrome", "131", "Android", "tablet"],
		["curl/8.5.0", "Other", "", "Other", "desktop"],
		["", "Other", "", "Other", "desktop"],
	])("%s", (ua, browser, browserMajor, os, device) => {
		expect(parseUa(ua)).toEqual({ browser, browserMajor, os, device });
	});

	it("prefers client hints when present", () => {
		const ua = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
		expect(parseUa(ua, { mobile: "?1", platform: '"Android"' }).device).toBe("mobile");
		expect(parseUa("Mozilla/5.0 (X11; Linux x86_64) Chrome/142.0.0.0 Mobile Safari/537.36", { mobile: "?0" }).device).toBe("desktop");
		expect(parseUa("Mozilla/5.0 (X11; Linux x86_64) Chrome/142.0.0.0 Safari/537.36", { platform: '"Chrome OS"' }).os).toBe("ChromeOS");
	});

	it("normalizes to family, major, OS and device only", () => {
		expect(uaNorm(parseUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36"))).toBe("Chrome/142|Windows|desktop");
	});
});
