/** Small user agent parser: browser family and major, OS family, device class. */

export type Browser = "Chrome" | "Edge" | "Firefox" | "Safari" | "Opera" | "Samsung Internet" | "Other";
export type Os = "Windows" | "macOS" | "iOS" | "Android" | "Linux" | "ChromeOS" | "Other";
export type Device = "desktop" | "mobile" | "tablet";

export interface ParsedUa {
	browser: Browser;
	browserMajor: string;
	os: Os;
	device: Device;
}

/** Optional client hints (`Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform`) as raw header values. */
export interface UaHints {
	mobile?: string | null;
	platform?: string | null;
}

const BROWSERS: [Browser, RegExp][] = [
	["Samsung Internet", /samsungbrowser\/(\d+)/],
	["Edge", /\b(?:edg|edge|edga|edgios)\/(\d+)/],
	["Opera", /\b(?:opr|opera|opt)\/(\d+)/],
	["Firefox", /\b(?:firefox|fxios)\/(\d+)/],
	["Chrome", /\b(?:crios|chrome|chromium)\/(\d+)/],
	["Safari", /\bversion\/(\d+)[^ ]* (?:mobile\/\S+ )?safari\//],
];

const PLATFORM_HINTS: Record<string, Os> = {
	windows: "Windows",
	macos: "macOS",
	ios: "iOS",
	android: "Android",
	linux: "Linux",
	"chrome os": "ChromeOS",
	chromeos: "ChromeOS",
};

function osFromUa(ua: string): Os {
	if (/iphone|ipad|ipod/.test(ua)) return "iOS";
	if (ua.includes("android")) return "Android";
	if (ua.includes("windows")) return "Windows";
	if (ua.includes("cros")) return "ChromeOS";
	if (/mac os x|macintosh/.test(ua)) return "macOS";
	if (/linux|x11/.test(ua)) return "Linux";
	return "Other";
}

export function parseUa(uaRaw: string | null | undefined, hints: UaHints = {}): ParsedUa {
	const ua = (uaRaw ?? "").slice(0, 512).toLowerCase();
	let browser: Browser = "Other";
	let browserMajor = "";
	for (const [name, re] of BROWSERS) {
		const m = re.exec(ua);
		if (m?.[1]) {
			browser = name;
			browserMajor = m[1];
			break;
		}
	}
	const platform = hints.platform?.replace(/"/g, "").trim().toLowerCase();
	const os = (platform && PLATFORM_HINTS[platform]) || osFromUa(ua);

	let device: Device = "desktop";
	if (/ipad|tablet|kindle|silk\//.test(ua) || (ua.includes("android") && !ua.includes("mobile"))) device = "tablet";
	else if (/mobile|iphone|ipod|windows phone/.test(ua)) device = "mobile";
	if (hints.mobile === "?1") device = "mobile";
	else if (hints.mobile === "?0" && device === "mobile") device = "desktop";
	return { browser, browserMajor, os, device };
}

/** Normalized UA used in the visitor key: family and major, OS family, device class. */
export function uaNorm(p: ParsedUa): string {
	return `${p.browser}/${p.browserMajor}|${p.os}|${p.device}`;
}
