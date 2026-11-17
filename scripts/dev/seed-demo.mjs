#!/usr/bin/env node
// Deterministic demo data for screenshots: 90 days of an invented site (example.com), from a fixed random seed.
// The wiki screenshot harness (scripts/dev/wiki-shots) answers the admin's report calls from it; nothing here
// touches a database. `node scripts/dev/seed-demo.mjs` prints the data set as JSON.

export const DEMO_END = "2026-06-30";
export const DEMO_DAYS = 90;
export const DEMO_SEED = 20260630;

/** Small seeded PRNG (mulberry32): the same seed gives the same numbers on every run. */
export function prng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const dayAdd = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const DIMS = {
	pages: ["/", "/blog/getting-started", "/pricing", "/docs/install", "/features", "/blog/release-notes", "/about", "/contact", "/docs/api", "/blog/privacy-basics"],
	channels: ["Organic search", "Direct", "Referral", "Social", "AI assistants", "Email", "Paid search"],
	sources: ["google", "(direct)", "bing", "news.example.com", "duckduckgo", "chat.example.com", "social.example.net", "newsletter"],
	campaigns: ["spring-launch", "newsletter-june", "partner-week"],
	countries: ["DE", "US", "GB", "FR", "NL", "AT", "CH", "SE"],
	regions: ["DE-BE", "DE-BY", "US-CA", "GB-ENG", "FR-IDF"],
	devices: ["desktop", "mobile", "tablet"],
	browsers: ["Chrome", "Safari", "Firefox", "Edge", "Samsung Internet"],
	os: ["Windows", "iOS", "Android", "macOS", "Linux"],
	languages: ["en", "de", "fr", "nl", "sv"],
	goals: ["Signup", "Contact form", "Newsletter", "Pricing view"],
	events: ["signup", "newsletter_subscribe", "video_play", "_outbound", "_download", "_form"],
	search_queries: ["example analytics", "cookieless tracking", "privacy web stats", "example.com pricing", "self hosted analytics", "analytics without cookies", "example dashboard"],
	search_pages: ["/", "/blog/getting-started", "/pricing", "/docs/install", "/blog/privacy-basics"],
	search_countries: ["DE", "US", "GB", "FR"],
	search_devices: ["DESKTOP", "MOBILE", "TABLET"],
	links: ["partner-a", "partner-b", "tool-c", "book-d"],
	outbound: ["https://docs.example.org/", "https://github.example.net/demo", "https://partner.example.com/"],
	downloads: ["/files/price-list.pdf", "/files/whitepaper.pdf", "/files/sample.csv"],
	forms: ["contact", "newsletter", "signup"],
	site_search: ["install", "pricing", "export", "api key"],
	collections: ["posts", "pages", "docs"],
};

const path = (op, value) => ({ v: 1, path: [{ op, value }] });
/**
 * Annotations of the demo window, oldest first: [day, kind, text, scope, target, before value, change after].
 * A null target is the default (visitors of the scope); a null change is still too early in the 14 day window.
 */
const ANNOTATIONS = [
	["2026-04-21", "release", "Faster page loads", null, null, 300, 0.06],
	["2026-05-12", "manual", "Spring sale ended", null, { report: "revenue", metric: "revenue" }, 7900, -0.14],
	["2026-06-04", "update", "Docs install guide rewritten", path("prefix", "/docs/"), { report: "pages", metric: "avg_time", params: { key: "/docs/install" } }, 71, 0.012],
	["2026-06-06", "manual", "Paused paid search", null, { report: "channels", metric: "sessions", params: { key: "Paid search" } }, 610, -0.32],
	["2026-06-09", "release", "New pricing page", path("is", "/pricing"), { report: "goals", metric: "conversion_rate", params: { goal: "g1" } }, 0.041, 0.18],
	["2026-06-11", "publish", "Blog: privacy basics", path("is", "/blog/privacy-basics"), null, 820, -0.09],
	["2026-06-13", "update", "Shorter signup form", path("is", "/signup"), { report: "events", metric: "events", params: { key: "signup" } }, 140, 0.031],
	["2026-06-15", "manual", "Title tags reworked", path("prefix", "/blog/"), { report: "search_overview", metric: "clicks" }, 1450, 0.12],
	["2026-06-22", "publish", "Blog: release notes", path("is", "/blog/release-notes"), null, null, null],
	["2026-06-26", "release", "Checkout redesign", null, { report: "overview", metric: "bounce_rate" }, null, null],
];
/** User agent rules as stored, in the order the classifier applies them: bot rules with a category, human fixes, regex last. */
const AGENT_RULES = [
	["robot", "contains", "examplemonitor", "Uptime monitor", "monitoring"],
	["robot", "prefix", "examplefetcher/", "Link preview fetcher", "social_preview"],
	["robot", "contains", "statuscheck.example.net", "Status page checks", "monitoring"],
	["robot", "exact", "Example-Feed-Reader/2.1", "Feed reader", "feed_reader"],
	["robot", "contains", "examplecrawler", "Partner crawler", "scraper_generic"],
	["robot", "prefix", "ExampleArchive/", "Web archive", "archiver"],
	["human", "contains", "exampleapp", "Our own app", ""],
	["human", "contains", "ExampleKiosk", "Store kiosks", ""],
	["human", "exact", "Mozilla/5.0 (X11; Linux x86_64) ExampleTV/3.0", "Smart TV app", ""],
	["robot", "contains", "loadtest-example", "Our load tests", "headless_automation"],
	["robot", "regex", "^examplebot/\\d+(\\.\\d+)*$", "Versioned example bot", "scraper_generic"],
	["robot", "regex", "scanner-[a-z]+\\.example\\.org", "Security scans", "security_scanner"],
];
/** A few rows of the built-in list, invented: [name, category, source, mode, pattern]. */
const BUILTIN = [
	["ExampleSearch", "search_engine", "built-in", "contains", "examplesearchbot"],
	["ExampleAI crawler", "ai_training", "built-in", "contains", "exampleai-crawler"],
	["ExampleAI answers", "ai_search", "built-in", "regex", "^ExampleAnswer/"],
	["Example SEO audit", "seo_tool", "built-in", "contains", "exampleseo"],
	["Headless browser", "headless_automation", "built-in", "regex", "Headless[Cc]hrome"],
];

/** The data set: one row per day with the site totals, and fixed weights per dimension value. */
export function seedDemo(seed = DEMO_SEED) {
	const rnd = prng(seed);
	const jitter = (spread) => 1 + (rnd() * 2 - 1) * spread;
	// A bounce is a session that is not engaged; `_draw` keeps the random sequence stable.
	const rates = (_draw, engaged) => ({ bounce_rate: Math.round((1 - engaged) * 1000) / 1000, engaged_rate: engaged });
	const days = [];
	for (let i = 0; i < DEMO_DAYS; i++) {
		const t = dayAdd(DEMO_END, i - DEMO_DAYS + 1);
		const dow = new Date(`${t}T00:00:00Z`).getUTCDay();
		const level = (dow === 0 || dow === 6 ? 0.72 : 1) * (1 + i * 0.004) * jitter(0.08);
		const visitors = Math.round(310 * level);
		const sessions = Math.round(visitors * 1.27 * jitter(0.03));
		const pageviews = Math.round(sessions * 2.2 * jitter(0.05));
		const impressions = Math.round(3400 * level * jitter(0.1));
		const clicks = Math.round(impressions * 0.034 * jitter(0.12));
		const orders = Math.max(0, Math.round(9 * level * jitter(0.35)));
		const revenue = Math.round(orders * 79 * jitter(0.2) * 100) / 100;
		days.push({
			t,
			visitors,
			sessions,
			pageviews,
			views_per_session: Math.round((pageviews / sessions) * 100) / 100,
			...rates(jitter(0.08), Math.round(0.58 * jitter(0.06) * 1000) / 1000),
			avg_duration: Math.round(94 * jitter(0.15)),
			clicks,
			impressions,
			ctr: Math.round((clicks / impressions) * 10000) / 10000,
			position: Math.round(11.4 * jitter(0.08) * 10) / 10,
			orders,
			revenue,
			refunds: rnd() < 0.15 ? Math.round(79 * 100) / 100 : 0,
			pct_long: Math.round(0.42 * jitter(0.08) * 1000) / 1000,
			pct_short: Math.round(0.31 * jitter(0.08) * 1000) / 1000,
			pct_bad: Math.round(0.12 * jitter(0.15) * 1000) / 1000,
			avg_engaged: Math.round(64 * jitter(0.12)),
		});
	}
	const dims = Object.fromEntries(
		Object.entries(DIMS).map(([name, keys]) => {
			const raw = keys.map((_, i) => (1 / (i + 1.4)) * jitter(0.25));
			const sum = raw.reduce((a, b) => a + b, 0);
			return [name, keys.map((key, i) => ({ key, w: raw[i] / sum, change: Math.round((rnd() * 0.5 - 0.2) * 1000) / 1000 }))];
		}),
	);
	const annotations = ANNOTATIONS.map(([day, kind, text, scope, target, before, change], i) => ({
		id: `n${i + 1}`,
		ts: Date.parse(`${day}T10:00:00Z`) / 1000,
		day,
		kind,
		text,
		scope,
		target,
		before,
		change,
	}));
	const agentRules = AGENT_RULES.map(([action, mode, pattern, name, category], i) => ({ id: `r${String(i + 1).padStart(2, "0")}`, data: { action, mode, pattern, name, ...(category ? { category } : {}) } }));
	const builtin = BUILTIN.map(([name, category, source, mode, pattern], i) => ({ id: `b${i + 1}`, name, category, source, mode, pattern }));
	return { end: DEMO_END, days, dims, annotations, agentRules, builtin };
}

if (typeof process !== "undefined" && process.argv?.[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	process.stdout.write(`${JSON.stringify(seedDemo(), null, 1)}\n`);
}
