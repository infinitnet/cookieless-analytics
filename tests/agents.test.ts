import { describe, expect, it } from "vitest";
import { classifyUa, createClassifier } from "../src/agents/classify.js";
import fixtures from "./fixtures/uas.json";

interface Fixture {
	ua: string;
	audience: "human" | "robot";
	botId?: string;
}

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

describe("classifyUa acceptance", () => {
	it.each([
		["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
		["GPTBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.3; +https://openai.com/gptbot)"],
		["ClaudeBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"],
		["PerplexityBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"],
		["python-requests", "python-requests/2.32.3"],
		["curl", "curl/8.5.0"],
		["HeadlessChrome", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36"],
		["empty UA", ""],
		["missing UA", undefined],
	])("%s is a robot", (_name, ua) => {
		expect(classifyUa(ua).audience).toBe("robot");
	});

	it.each([
		["Chrome", CHROME],
		["Safari", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15"],
		["Firefox", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0"],
		["FBAN WebView", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.32.106]"],
		["Samsung Internet", "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36"],
	])("%s is human", (_name, ua) => {
		expect(classifyUa(ua)).toEqual({ audience: "human" });
	});

	it("returns bot id and category", () => {
		expect(classifyUa("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toEqual({ audience: "robot", botId: "googlebot", category: "search_engine" });
		expect(classifyUa("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.3; +https://openai.com/gptbot)")).toMatchObject({ botId: "gptbot", category: "ai_training" });
		expect(classifyUa("")).toEqual({ audience: "robot", botId: "empty-ua", category: "unknown_bot" });
	});
});

describe("classifyUa fixtures", () => {
	const list = fixtures as Fixture[];
	it("has about 150 labelled user agents", () => {
		expect(list.length).toBeGreaterThanOrEqual(150);
		expect(list.filter((f) => f.audience === "human").length).toBeGreaterThanOrEqual(60);
	});
	it.each(list.map((f) => [f.botId ?? "human", f] as const))("%s", (_id, f) => {
		const r = classifyUa(f.ua);
		expect(r.audience, f.ua).toBe(f.audience);
		if (f.botId) expect(r.botId, f.ua).toBe(f.botId);
	});
});

describe("user rules and cache", () => {
	it("lets a user rule mark a built-in bot as human and add new bots", () => {
		const rules = [
			{ pattern: "uptimerobot", mode: "contains" as const, action: "human" as const },
			{ pattern: "acme-internal-browser", mode: "contains" as const, action: "robot" as const, category: "monitoring" as const, id: "acme" },
			{ pattern: "^mozilla/5\\.0 \\(x11; acme os", mode: "regex" as const, action: "robot" as const },
		];
		expect(classifyUa("Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)", rules).audience).toBe("human");
		expect(classifyUa(`${CHROME} acme-internal-browser`, rules)).toEqual({ audience: "robot", botId: "acme", category: "monitoring" });
		expect(classifyUa("Mozilla/5.0 (X11; ACME OS 3) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36", rules)).toEqual({ audience: "robot", botId: "user-3", category: "unknown_bot" });
		expect(classifyUa(CHROME, rules).audience).toBe("human");
	});

	it("ignores unsafe or disabled user regexes", () => {
		const c = createClassifier([
			{ pattern: "(a+)+$", mode: "regex", action: "robot" },
			{ pattern: "chrome", mode: "contains", action: "robot", enabled: false },
		]);
		expect(c.classify(`${CHROME} aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!`).audience).toBe("human");
	});

	it("caches results and truncates long user agents", () => {
		const c = createClassifier();
		const first = c.classify(CHROME);
		expect(c.classify(CHROME)).toBe(first);
		const long = `${CHROME} ${"x".repeat(1000)} googlebot`;
		expect(c.classify(long).audience).toBe("human");
	});

	it("classifies an unseen user agent quickly", () => {
		const c = createClassifier();
		const start = performance.now();
		for (let i = 0; i < 200; i++) c.classify(`${CHROME} build/${i}`);
		expect(performance.now() - start).toBeLessThan(2000);
	});
});
