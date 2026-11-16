import { describe, expect, it } from "vitest";
import { buildChannelRules, type ChannelInput, classifyChannel, isIgnoredReferrer } from "../src/core/channels.js";
import { hostMatches, normalizeUrl, parseReferrer, sameHost } from "../src/core/url.js";

const fromUrl = (u: string, refHost: string | null = null): ChannelInput => {
	const n = normalizeUrl(u, []);
	return { refHost, utm: n.utm, clickIds: n.clickIds };
};

describe("classifyChannel", () => {
	it.each([
		["direct", fromUrl("/"), "Direct", "(direct)"],
		["search referrer", fromUrl("/", "www.google.com"), "Organic Search", "google.com"],
		["search ccTLD", fromUrl("/", "google.co.uk"), "Organic Search", "google.co.uk"],
		["bing", fromUrl("/", "bing.com"), "Organic Search", "bing.com"],
		["organic medium", fromUrl("/?utm_source=bing&utm_medium=organic"), "Organic Search", "bing"],
		["paid search utm", fromUrl("/?utm_source=google&utm_medium=cpc"), "Paid Search", "google"],
		["paid search click id", fromUrl("/?gclid=abc", "www.google.com"), "Paid Search", "google.com"],
		["msclkid without referrer", fromUrl("/?msclkid=x"), "Paid Search", "(direct)"],
		["ads source", fromUrl("/?utm_source=googleads"), "Paid Search", "googleads"],
		["paid social", fromUrl("/?utm_source=facebook&utm_medium=paid_social"), "Paid Social", "facebook"],
		["tiktok click", fromUrl("/?ttclid=1"), "Paid Social", "(direct)"],
		["paid video", fromUrl("/?utm_source=youtube&utm_medium=cpv"), "Paid Video", "youtube"],
		["paid shopping", fromUrl("/?utm_source=amazon&utm_medium=ppc"), "Paid Shopping", "amazon"],
		["paid shopping campaign", fromUrl("/?utm_source=partner&utm_medium=paid&utm_campaign=summer-shop"), "Paid Shopping", "partner"],
		["paid other", fromUrl("/?utm_source=newsletter&utm_medium=cpc"), "Paid Other", "newsletter"],
		["display", fromUrl("/?utm_source=network&utm_medium=banner"), "Display", "network"],
		["affiliates", fromUrl("/?utm_source=partner&utm_medium=affiliate"), "Affiliates", "partner"],
		["cross-network", fromUrl("/?utm_medium=cross-network"), "Cross-network", "(not set)"],
		["audio", fromUrl("/?utm_medium=audio"), "Audio", "(not set)"],
		["sms", fromUrl("/?utm_source=sms"), "SMS", "sms"],
		["mobile push", fromUrl("/?utm_source=app&utm_medium=web-push"), "Mobile Push", "app"],
		["firebase", fromUrl("/?utm_source=firebase"), "Mobile Push", "firebase"],
		["email utm", fromUrl("/?utm_source=list&utm_medium=email"), "Email", "list"],
		["webmail referrer", fromUrl("/", "mail.google.com"), "Email", "mail.google.com"],
		["ai referrer", fromUrl("/", "chatgpt.com"), "AI Assistants", "chatgpt.com"],
		["ai utm source", fromUrl("/?utm_source=chatgpt.com"), "AI Assistants", "chatgpt.com"],
		["ai subdomain of a search host", fromUrl("/", "gemini.google.com"), "AI Assistants", "gemini.google.com"],
		["perplexity", fromUrl("/", "www.perplexity.ai"), "AI Assistants", "perplexity.ai"],
		["social referrer", fromUrl("/", "t.co"), "Organic Social", "t.co"],
		["social medium", fromUrl("/?utm_source=forum&utm_medium=social"), "Organic Social", "forum"],
		["fbclid only", fromUrl("/?fbclid=x"), "Organic Social", "(direct)"],
		["video referrer", fromUrl("/", "m.youtube.com"), "Organic Video", "m.youtube.com"],
		["shopping referrer", fromUrl("/", "amazon.de"), "Organic Shopping", "amazon.de"],
		["referral", fromUrl("/", "news.example.org"), "Referral", "news.example.org"],
		["referral medium", fromUrl("/?utm_source=blogroll&utm_medium=referral"), "Referral", "blogroll"],
		["unknown utm", fromUrl("/?utm_source=partner"), "Unknown", "partner"],
	])("%s", (_name, input, channel, source) => {
		expect(classifyChannel(input)).toEqual({ channel, source });
	});

	it("merges user rules by priority and honours disabled built-ins", () => {
		const rules = buildChannelRules([{ id: "partners", channel: "Partners", priority: 5, any: [{ sourceIn: ["partner"] }] }], ["ai_assistants"]);
		expect(rules[0]?.id).toBe("partners");
		expect(classifyChannel(fromUrl("/?utm_source=partner"), { rules }).channel).toBe("Partners");
		expect(classifyChannel(fromUrl("/", "chatgpt.com"), { rules }).channel).toBe("Referral");
		expect(rules.some((r) => r.id === "ai_assistants")).toBe(false);
	});

	it("supports custom host lists", () => {
		const hosts = { search: [], social: [], video: [], shopping: [], ai: ["assistant.example"], webmail: [], ignore: [] };
		expect(classifyChannel(fromUrl("/", "assistant.example"), { hosts }).channel).toBe("AI Assistants");
		expect(classifyChannel(fromUrl("/", "google.com"), { hosts }).channel).toBe("Referral");
	});
});

describe("url helpers", () => {
	it("normalizes paths and keeps allowlisted query params sorted", () => {
		expect(normalizeUrl("/blog//post/?b=2&utm_source=X&a=1&gclid=g", ["utm_*", "gclid"])).toEqual({
			path: "/blog/post",
			query: "gclid=g&utm_source=X",
			utm: { utm_source: "x" },
			clickIds: ["gclid"],
		});
		expect(normalizeUrl("/", []).path).toBe("/");
		expect(normalizeUrl("https://example.org/a/?x=1", []).path).toBe("/a");
	});

	it("parses referrers and compares hosts", () => {
		expect(parseReferrer("https://WWW.Example.org/a/b?c=1")).toEqual({ host: "example.org", path: "/a/b" });
		expect(parseReferrer("android-app://com.google.android.gm/")).toBeNull();
		expect(parseReferrer("")).toBeNull();
		expect(parseReferrer("not a url")).toBeNull();
		expect(sameHost("www.example.org", "EXAMPLE.org")).toBe(true);
		expect(sameHost("blog.example.org", "example.org")).toBe(false);
		expect(hostMatches("www.google.de", "google.*")).toBe(true);
		expect(hostMatches("googleusercontent.com", "google.*")).toBe(false);
		expect(hostMatches("google.co.uk", "google.*")).toBe(true);
		expect(hostMatches("news.google.com.au", "google.*")).toBe(true);
		expect(hostMatches("mastodon.social", "mastodon.*")).toBe(true);
		// Lookalike hosts never inherit a channel.
		expect(hostMatches("google.evil.com", "google.*")).toBe(false);
		expect(hostMatches("x.google.evil.com", "google.*")).toBe(false);
		expect(classifyChannel(fromUrl("/", "google.evil.com")).channel).toBe("Referral");
		expect(hostMatches("news.bing.com", "bing.com")).toBe(true);
		expect(hostMatches("notbing.com", "bing.com")).toBe(false);
	});

	it("ignores self, payment and configured referrer hosts", () => {
		expect(isIgnoredReferrer("www.example.org", "example.org")).toBe(true);
		expect(isIgnoredReferrer("checkout.stripe.com", "example.org")).toBe(true);
		expect(isIgnoredReferrer("www.paypal.com", "example.org")).toBe(true);
		expect(isIgnoredReferrer("sso.example.net", "example.org", ["example.net"])).toBe(true);
		expect(isIgnoredReferrer("google.com", "example.org")).toBe(false);
	});
});
