import { $i as truncateIp, Br as isCurrency, Dr as publicNames, Hr as roundMinor, I as cleanHost, Ii as addDays, Ji as getOrCreateSalt, L as hostInList, Li as dayInZone, Or as compileSafeRegex, R as normalizeUrl, T as D1Sink, Ui as saltBoundary, Wi as saltDay, Xi as randomId, Yi as ipInCidr, Zi as sha256, ea as vkey, j as DEFAULT_HOSTS, w as drops, z as parseReferrer } from "./queue-sink-CL7kMcrY.mjs";
import { PLUGIN_ID, ROUTES, isPassiveEvent } from "./contract.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
// src/data/agents.json
var agents_default = [
	{
		"id": "googlebot-image",
		"name": "Googlebot-Image",
		"operator": "Google",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "googlebot-image"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
		"source": "curated"
	},
	{
		"id": "googlebot-video",
		"name": "Googlebot-Video",
		"operator": "Google",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "googlebot-video"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
		"source": "curated"
	},
	{
		"id": "googlebot-news",
		"name": "Googlebot-News",
		"operator": "Google",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "googlebot-news"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
		"source": "curated"
	},
	{
		"id": "googlebot",
		"name": "Googlebot",
		"operator": "Google",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "googlebot"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
		"source": "curated"
	},
	{
		"id": "storebot-google",
		"name": "Storebot-Google",
		"operator": "Google",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "storebot-google"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
		"source": "curated"
	},
	{
		"id": "google-inspectiontool",
		"name": "Google-InspectionTool",
		"operator": "Google",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "google-inspectiontool"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
		"source": "curated"
	},
	{
		"id": "googleother",
		"name": "GoogleOther",
		"operator": "Google",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "googleother"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
		"source": "curated"
	},
	{
		"id": "google-cloudvertexbot",
		"name": "Google-CloudVertexBot",
		"operator": "Google",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "google-cloudvertexbot"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
		"source": "curated"
	},
	{
		"id": "adsbot-google",
		"name": "AdsBot-Google",
		"operator": "Google",
		"category": "ads_verification",
		"match": {
			"mode": "contains",
			"pattern": "adsbot-google"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-special-case-crawlers",
		"source": "curated"
	},
	{
		"id": "mediapartners-google",
		"name": "Mediapartners-Google",
		"operator": "Google",
		"category": "ads_verification",
		"match": {
			"mode": "contains",
			"pattern": "mediapartners-google"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-special-case-crawlers",
		"source": "curated"
	},
	{
		"id": "apis-google",
		"name": "APIs-Google",
		"operator": "Google",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "apis-google"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-special-case-crawlers",
		"source": "curated"
	},
	{
		"id": "google-read-aloud",
		"name": "Google-Read-Aloud",
		"operator": "Google",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "google-read-aloud"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers",
		"source": "curated"
	},
	{
		"id": "google-site-verification",
		"name": "Google-Site-Verification",
		"operator": "Google",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "google-site-verification"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers",
		"source": "curated"
	},
	{
		"id": "google-favicon",
		"name": "Google Favicon",
		"operator": "Google",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "google favicon"
		},
		"source": "curated"
	},
	{
		"id": "google-pagespeed",
		"name": "Google PageSpeed Insights",
		"operator": "Google",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "google page speed insights"
		},
		"source": "curated"
	},
	{
		"id": "chrome-lighthouse",
		"name": "Chrome Lighthouse",
		"operator": "Google",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "chrome-lighthouse"
		},
		"source": "curated"
	},
	{
		"id": "bingbot",
		"name": "Bingbot",
		"operator": "Microsoft",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "bingbot"
		},
		"docs": "https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0",
		"source": "curated"
	},
	{
		"id": "adidxbot",
		"name": "AdIdxBot",
		"operator": "Microsoft",
		"category": "ads_verification",
		"match": {
			"mode": "contains",
			"pattern": "adidxbot"
		},
		"docs": "https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0",
		"source": "curated"
	},
	{
		"id": "bingpreview",
		"name": "BingPreview",
		"operator": "Microsoft",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "bingpreview"
		},
		"source": "curated"
	},
	{
		"id": "microsoftpreview",
		"name": "MicrosoftPreview",
		"operator": "Microsoft",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "microsoftpreview"
		},
		"source": "curated"
	},
	{
		"id": "msnbot",
		"name": "msnbot",
		"operator": "Microsoft",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "msnbot"
		},
		"source": "curated"
	},
	{
		"id": "applebot",
		"name": "Applebot",
		"operator": "Apple",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "applebot"
		},
		"docs": "https://support.apple.com/en-us/119829",
		"source": "curated"
	},
	{
		"id": "duckassistbot",
		"name": "DuckAssistBot",
		"operator": "DuckDuckGo",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "duckassistbot"
		},
		"source": "curated"
	},
	{
		"id": "duckduckbot",
		"name": "DuckDuckBot",
		"operator": "DuckDuckGo",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "duckduckbot"
		},
		"source": "curated"
	},
	{
		"id": "yandexadditional",
		"name": "YandexAdditional",
		"operator": "Yandex",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "yandexadditional"
		},
		"source": "curated"
	},
	{
		"id": "yandeximages",
		"name": "YandexImages",
		"operator": "Yandex",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "yandeximages"
		},
		"source": "curated"
	},
	{
		"id": "yandexbot",
		"name": "YandexBot",
		"operator": "Yandex",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "yandexbot"
		},
		"source": "curated"
	},
	{
		"id": "yandex-bots",
		"name": "Yandex bots",
		"operator": "Yandex",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "yandex.com/bots"
		},
		"source": "curated"
	},
	{
		"id": "baiduspider",
		"name": "Baiduspider",
		"operator": "Baidu",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "baiduspider"
		},
		"source": "curated"
	},
	{
		"id": "sogou",
		"name": "Sogou web spider",
		"operator": "Sogou",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "sogou web spider"
		},
		"source": "curated"
	},
	{
		"id": "360spider",
		"name": "360Spider",
		"operator": "Qihoo 360",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "360spider"
		},
		"source": "curated"
	},
	{
		"id": "petalbot",
		"name": "PetalBot",
		"operator": "Huawei",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "petalbot"
		},
		"source": "curated"
	},
	{
		"id": "seznambot",
		"name": "SeznamBot",
		"operator": "Seznam",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "seznambot"
		},
		"source": "curated"
	},
	{
		"id": "qwant",
		"name": "Qwantbot",
		"operator": "Qwant",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "qwantbot"
		},
		"source": "curated"
	},
	{
		"id": "naver-yeti",
		"name": "Yeti",
		"operator": "Naver",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "naver.me/spd"
		},
		"source": "curated"
	},
	{
		"id": "yahoo-slurp",
		"name": "Yahoo Slurp",
		"operator": "Yahoo",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "slurp"
		},
		"source": "curated"
	},
	{
		"id": "mojeekbot",
		"name": "MojeekBot",
		"operator": "Mojeek",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "mojeekbot"
		},
		"source": "curated"
	},
	{
		"id": "exabot",
		"name": "Exabot",
		"operator": "Exalead",
		"category": "search_engine",
		"match": {
			"mode": "contains",
			"pattern": "exabot"
		},
		"source": "curated"
	},
	{
		"id": "gptbot",
		"name": "GPTBot",
		"operator": "OpenAI",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "gptbot"
		},
		"docs": "https://developers.openai.com/api/docs/bots",
		"source": "curated"
	},
	{
		"id": "oai-searchbot",
		"name": "OAI-SearchBot",
		"operator": "OpenAI",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "oai-searchbot"
		},
		"docs": "https://developers.openai.com/api/docs/bots",
		"source": "curated"
	},
	{
		"id": "oai-adsbot",
		"name": "OAI-AdsBot",
		"operator": "OpenAI",
		"category": "ads_verification",
		"match": {
			"mode": "contains",
			"pattern": "oai-adsbot"
		},
		"docs": "https://developers.openai.com/api/docs/bots",
		"source": "curated"
	},
	{
		"id": "chatgpt-user",
		"name": "ChatGPT-User",
		"operator": "OpenAI",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "chatgpt-user"
		},
		"docs": "https://developers.openai.com/api/docs/bots",
		"source": "curated"
	},
	{
		"id": "claude-searchbot",
		"name": "Claude-SearchBot",
		"operator": "Anthropic",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "claude-searchbot"
		},
		"docs": "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
		"source": "curated"
	},
	{
		"id": "claude-user",
		"name": "Claude-User",
		"operator": "Anthropic",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "claude-user"
		},
		"docs": "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
		"source": "curated"
	},
	{
		"id": "claudebot",
		"name": "ClaudeBot",
		"operator": "Anthropic",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "claudebot"
		},
		"docs": "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
		"source": "curated"
	},
	{
		"id": "claude-web",
		"name": "Claude-Web (legacy)",
		"operator": "Anthropic",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "claude-web"
		},
		"source": "curated"
	},
	{
		"id": "anthropic-ai",
		"name": "anthropic-ai (legacy)",
		"operator": "Anthropic",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "anthropic-ai"
		},
		"source": "curated"
	},
	{
		"id": "perplexity-user",
		"name": "Perplexity-User",
		"operator": "Perplexity",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "perplexity-user"
		},
		"docs": "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
		"source": "curated"
	},
	{
		"id": "perplexitybot",
		"name": "PerplexityBot",
		"operator": "Perplexity",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "perplexitybot"
		},
		"docs": "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
		"source": "curated"
	},
	{
		"id": "meta-externalagent",
		"name": "Meta-ExternalAgent",
		"operator": "Meta",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "meta-externalagent"
		},
		"docs": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers",
		"source": "curated"
	},
	{
		"id": "meta-externalfetcher",
		"name": "Meta-ExternalFetcher",
		"operator": "Meta",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "meta-externalfetcher"
		},
		"docs": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers",
		"source": "curated"
	},
	{
		"id": "meta-webindexer",
		"name": "Meta-WebIndexer",
		"operator": "Meta",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "meta-webindexer"
		},
		"docs": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers",
		"source": "curated"
	},
	{
		"id": "meta-externalads",
		"name": "Meta-ExternalAds",
		"operator": "Meta",
		"category": "ads_verification",
		"match": {
			"mode": "contains",
			"pattern": "meta-externalads"
		},
		"docs": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers",
		"source": "curated"
	},
	{
		"id": "facebookexternalhit",
		"name": "facebookexternalhit",
		"operator": "Meta",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "facebookexternalhit"
		},
		"docs": "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers",
		"source": "curated"
	},
	{
		"id": "facebookcatalog",
		"name": "facebookcatalog",
		"operator": "Meta",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "facebookcatalog"
		},
		"source": "curated"
	},
	{
		"id": "facebookbot",
		"name": "FacebookBot",
		"operator": "Meta",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "facebookbot"
		},
		"source": "curated"
	},
	{
		"id": "amzn-searchbot",
		"name": "Amzn-SearchBot",
		"operator": "Amazon",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "amzn-searchbot"
		},
		"source": "curated"
	},
	{
		"id": "amzn-user",
		"name": "Amzn-User",
		"operator": "Amazon",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "amzn-user"
		},
		"source": "curated"
	},
	{
		"id": "amazonbot",
		"name": "Amazonbot",
		"operator": "Amazon",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "amazonbot"
		},
		"source": "curated"
	},
	{
		"id": "ccbot",
		"name": "CCBot",
		"operator": "Common Crawl",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "ccbot"
		},
		"source": "curated"
	},
	{
		"id": "bytespider",
		"name": "Bytespider",
		"operator": "ByteDance",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "bytespider"
		},
		"source": "curated"
	},
	{
		"id": "diffbot",
		"name": "Diffbot",
		"operator": "Diffbot",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "diffbot"
		},
		"source": "curated"
	},
	{
		"id": "cohere-ai",
		"name": "cohere-ai",
		"operator": "Cohere",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "cohere-ai"
		},
		"source": "curated"
	},
	{
		"id": "mistralai-user",
		"name": "MistralAI-User",
		"operator": "Mistral AI",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "mistralai-user"
		},
		"source": "curated"
	},
	{
		"id": "ai2bot",
		"name": "AI2Bot",
		"operator": "Allen Institute for AI",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "ai2bot"
		},
		"source": "curated"
	},
	{
		"id": "youbot",
		"name": "YouBot",
		"operator": "You.com",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "youbot"
		},
		"source": "curated"
	},
	{
		"id": "ahrefssiteaudit",
		"name": "AhrefsSiteAudit",
		"operator": "Ahrefs",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "ahrefssiteaudit"
		},
		"source": "curated"
	},
	{
		"id": "ahrefsbot",
		"name": "AhrefsBot",
		"operator": "Ahrefs",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "ahrefsbot"
		},
		"source": "curated"
	},
	{
		"id": "semrushbot",
		"name": "SemrushBot",
		"operator": "Semrush",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "semrushbot"
		},
		"source": "curated"
	},
	{
		"id": "mj12bot",
		"name": "MJ12bot",
		"operator": "Majestic",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "mj12bot"
		},
		"source": "curated"
	},
	{
		"id": "dotbot",
		"name": "DotBot",
		"operator": "Moz",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "dotbot"
		},
		"source": "curated"
	},
	{
		"id": "rogerbot",
		"name": "rogerbot",
		"operator": "Moz",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "rogerbot"
		},
		"source": "curated"
	},
	{
		"id": "screaming-frog",
		"name": "Screaming Frog SEO Spider",
		"operator": "Screaming Frog",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "screaming frog"
		},
		"source": "curated"
	},
	{
		"id": "blexbot",
		"name": "BLEXBot",
		"operator": "WebMeUp",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "blexbot"
		},
		"source": "curated"
	},
	{
		"id": "dataforseobot",
		"name": "DataForSeoBot",
		"operator": "DataForSEO",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "dataforseobot"
		},
		"source": "curated"
	},
	{
		"id": "barkrowler",
		"name": "Barkrowler",
		"operator": "Babbar",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "barkrowler"
		},
		"source": "curated"
	},
	{
		"id": "serpstatbot",
		"name": "serpstatbot",
		"operator": "Serpstat",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "serpstatbot"
		},
		"source": "curated"
	},
	{
		"id": "seokicks",
		"name": "SEOkicks",
		"operator": "SEOkicks",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "seokicks"
		},
		"source": "curated"
	},
	{
		"id": "sistrix",
		"name": "SISTRIX",
		"operator": "SISTRIX",
		"category": "seo_tool",
		"match": {
			"mode": "contains",
			"pattern": "sistrix"
		},
		"source": "curated"
	},
	{
		"id": "telegrambot",
		"name": "TelegramBot",
		"operator": "Telegram",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "telegrambot"
		},
		"source": "curated"
	},
	{
		"id": "twitterbot",
		"name": "Twitterbot",
		"operator": "X",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "twitterbot"
		},
		"source": "curated"
	},
	{
		"id": "linkedinbot",
		"name": "LinkedInBot",
		"operator": "LinkedIn",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "linkedinbot"
		},
		"source": "curated"
	},
	{
		"id": "slack-imgproxy",
		"name": "Slack-ImgProxy",
		"operator": "Slack",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "slack-imgproxy"
		},
		"source": "curated"
	},
	{
		"id": "slackbot",
		"name": "Slackbot",
		"operator": "Slack",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "slackbot"
		},
		"source": "curated"
	},
	{
		"id": "discordbot",
		"name": "Discordbot",
		"operator": "Discord",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "discordbot"
		},
		"source": "curated"
	},
	{
		"id": "whatsapp",
		"name": "WhatsApp link preview",
		"operator": "Meta",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "whatsapp/"
		},
		"source": "curated"
	},
	{
		"id": "pinterestbot",
		"name": "Pinterestbot",
		"operator": "Pinterest",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "pinterestbot"
		},
		"source": "curated"
	},
	{
		"id": "redditbot",
		"name": "redditbot",
		"operator": "Reddit",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "redditbot"
		},
		"source": "curated"
	},
	{
		"id": "skypeuripreview",
		"name": "SkypeUriPreview",
		"operator": "Microsoft",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "skypeuripreview"
		},
		"source": "curated"
	},
	{
		"id": "embedly",
		"name": "Embedly",
		"operator": "Embedly",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "embedly"
		},
		"source": "curated"
	},
	{
		"id": "iframely",
		"name": "Iframely",
		"operator": "Iframely",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "iframely"
		},
		"source": "curated"
	},
	{
		"id": "mastodon",
		"name": "Mastodon",
		"operator": "Mastodon",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "mastodon/"
		},
		"source": "curated"
	},
	{
		"id": "bluesky-cardyb",
		"name": "Bluesky Cardyb",
		"operator": "Bluesky",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "cardyb"
		},
		"source": "curated"
	},
	{
		"id": "vkshare",
		"name": "vkShare",
		"operator": "VK",
		"category": "social_preview",
		"match": {
			"mode": "contains",
			"pattern": "vkshare"
		},
		"source": "curated"
	},
	{
		"id": "uptimerobot",
		"name": "UptimeRobot",
		"operator": "UptimeRobot",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "uptimerobot"
		},
		"source": "curated"
	},
	{
		"id": "pingdom",
		"name": "Pingdom",
		"operator": "Pingdom",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "pingdom"
		},
		"source": "curated"
	},
	{
		"id": "statuscake",
		"name": "StatusCake",
		"operator": "StatusCake",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "statuscake"
		},
		"source": "curated"
	},
	{
		"id": "betteruptime",
		"name": "Better Stack",
		"operator": "Better Stack",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "better uptime"
		},
		"source": "curated"
	},
	{
		"id": "site24x7",
		"name": "Site24x7",
		"operator": "Zoho",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "site24x7"
		},
		"source": "curated"
	},
	{
		"id": "datadog-synthetics",
		"name": "Datadog Synthetics",
		"operator": "Datadog",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "datadogsynthetics"
		},
		"source": "curated"
	},
	{
		"id": "newrelicpinger",
		"name": "NewRelicPinger",
		"operator": "New Relic",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "newrelicpinger"
		},
		"source": "curated"
	},
	{
		"id": "checkly",
		"name": "Checkly",
		"operator": "Checkly",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "checkly"
		},
		"source": "curated"
	},
	{
		"id": "uptime-kuma",
		"name": "Uptime Kuma",
		"operator": "Uptime Kuma",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "uptime-kuma"
		},
		"source": "curated"
	},
	{
		"id": "freshping",
		"name": "Freshping",
		"operator": "Freshworks",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "freshping"
		},
		"source": "curated"
	},
	{
		"id": "hetrixtools",
		"name": "HetrixTools",
		"operator": "HetrixTools",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "hetrixtools"
		},
		"source": "curated"
	},
	{
		"id": "cloudflare-healthchecks",
		"name": "Cloudflare-Healthchecks",
		"operator": "Cloudflare",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "cloudflare-healthchecks"
		},
		"source": "curated"
	},
	{
		"id": "zabbix",
		"name": "Zabbix",
		"operator": "Zabbix",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "zabbix"
		},
		"source": "curated"
	},
	{
		"id": "nagios",
		"name": "Nagios check_http",
		"operator": "Nagios",
		"category": "monitoring",
		"match": {
			"mode": "contains",
			"pattern": "check_http/"
		},
		"source": "curated"
	},
	{
		"id": "feedly",
		"name": "Feedly",
		"operator": "Feedly",
		"category": "feed_reader",
		"match": {
			"mode": "contains",
			"pattern": "feedly"
		},
		"source": "curated"
	},
	{
		"id": "feedbin",
		"name": "Feedbin",
		"operator": "Feedbin",
		"category": "feed_reader",
		"match": {
			"mode": "contains",
			"pattern": "feedbin"
		},
		"source": "curated"
	},
	{
		"id": "newsblur",
		"name": "NewsBlur",
		"operator": "NewsBlur",
		"category": "feed_reader",
		"match": {
			"mode": "contains",
			"pattern": "newsblur"
		},
		"source": "curated"
	},
	{
		"id": "inoreader",
		"name": "Inoreader",
		"operator": "Inoreader",
		"category": "feed_reader",
		"match": {
			"mode": "contains",
			"pattern": "inoreader"
		},
		"source": "curated"
	},
	{
		"id": "tiny-tiny-rss",
		"name": "Tiny Tiny RSS",
		"operator": "Tiny Tiny RSS",
		"category": "feed_reader",
		"match": {
			"mode": "contains",
			"pattern": "tiny tiny rss"
		},
		"source": "curated"
	},
	{
		"id": "freshrss",
		"name": "FreshRSS",
		"operator": "FreshRSS",
		"category": "feed_reader",
		"match": {
			"mode": "contains",
			"pattern": "freshrss"
		},
		"source": "curated"
	},
	{
		"id": "miniflux",
		"name": "Miniflux",
		"operator": "Miniflux",
		"category": "feed_reader",
		"match": {
			"mode": "contains",
			"pattern": "miniflux"
		},
		"source": "curated"
	},
	{
		"id": "netnewswire",
		"name": "NetNewsWire",
		"operator": "NetNewsWire",
		"category": "feed_reader",
		"match": {
			"mode": "contains",
			"pattern": "netnewswire"
		},
		"source": "curated"
	},
	{
		"id": "feedfetcher-google",
		"name": "FeedFetcher-Google",
		"operator": "Google",
		"category": "feed_reader",
		"match": {
			"mode": "contains",
			"pattern": "feedfetcher-google"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers",
		"source": "curated"
	},
	{
		"id": "nmap",
		"name": "Nmap Scripting Engine",
		"operator": "Nmap",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "nmap scripting engine"
		},
		"source": "curated"
	},
	{
		"id": "nikto",
		"name": "Nikto",
		"operator": "Nikto",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "nikto"
		},
		"source": "curated"
	},
	{
		"id": "sqlmap",
		"name": "sqlmap",
		"operator": "sqlmap",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "sqlmap"
		},
		"source": "curated"
	},
	{
		"id": "wpscan",
		"name": "WPScan",
		"operator": "WPScan",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "wpscan"
		},
		"source": "curated"
	},
	{
		"id": "nuclei",
		"name": "Nuclei",
		"operator": "ProjectDiscovery",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "nuclei"
		},
		"source": "curated"
	},
	{
		"id": "masscan",
		"name": "masscan",
		"operator": "masscan",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "masscan"
		},
		"source": "curated"
	},
	{
		"id": "zgrab",
		"name": "zgrab",
		"operator": "ZMap",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "zgrab"
		},
		"source": "curated"
	},
	{
		"id": "censysinspect",
		"name": "CensysInspect",
		"operator": "Censys",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "censysinspect"
		},
		"source": "curated"
	},
	{
		"id": "expanse",
		"name": "Expanse",
		"operator": "Palo Alto Networks",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "expanse, a palo alto"
		},
		"source": "curated"
	},
	{
		"id": "netcraft",
		"name": "Netcraft",
		"operator": "Netcraft",
		"category": "security_scanner",
		"match": {
			"mode": "contains",
			"pattern": "netcraft"
		},
		"source": "curated"
	},
	{
		"id": "ia-archiver",
		"name": "ia_archiver",
		"operator": "Internet Archive",
		"category": "archiver",
		"match": {
			"mode": "contains",
			"pattern": "ia_archiver"
		},
		"source": "curated"
	},
	{
		"id": "archive-org-bot",
		"name": "archive.org_bot",
		"operator": "Internet Archive",
		"category": "archiver",
		"match": {
			"mode": "contains",
			"pattern": "archive.org_bot"
		},
		"source": "curated"
	},
	{
		"id": "headlesschrome",
		"name": "HeadlessChrome",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "headlesschrome"
		},
		"source": "curated"
	},
	{
		"id": "phantomjs",
		"name": "PhantomJS",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "phantomjs"
		},
		"source": "curated"
	},
	{
		"id": "python-requests",
		"name": "python-requests",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "python-requests"
		},
		"source": "curated"
	},
	{
		"id": "python-httpx",
		"name": "python-httpx",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "python-httpx"
		},
		"source": "curated"
	},
	{
		"id": "python-urllib",
		"name": "Python-urllib",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "python-urllib"
		},
		"source": "curated"
	},
	{
		"id": "aiohttp",
		"name": "aiohttp",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "aiohttp"
		},
		"source": "curated"
	},
	{
		"id": "go-http-client",
		"name": "Go-http-client",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "go-http-client"
		},
		"source": "curated"
	},
	{
		"id": "curl",
		"name": "curl",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "curl/"
		},
		"source": "curated"
	},
	{
		"id": "wget",
		"name": "Wget",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "wget/"
		},
		"source": "curated"
	},
	{
		"id": "libwww-perl",
		"name": "libwww-perl",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "libwww-perl"
		},
		"source": "curated"
	},
	{
		"id": "apache-httpclient",
		"name": "Apache-HttpClient",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "apache-httpclient"
		},
		"source": "curated"
	},
	{
		"id": "okhttp",
		"name": "okhttp",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "okhttp"
		},
		"source": "curated"
	},
	{
		"id": "java-client",
		"name": "Java HTTP client",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "java/"
		},
		"source": "curated"
	},
	{
		"id": "node-fetch",
		"name": "node-fetch",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "node-fetch"
		},
		"source": "curated"
	},
	{
		"id": "axios",
		"name": "axios",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "axios/"
		},
		"source": "curated"
	},
	{
		"id": "undici",
		"name": "undici",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "undici"
		},
		"source": "curated"
	},
	{
		"id": "scrapy",
		"name": "Scrapy",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "scrapy"
		},
		"source": "curated"
	},
	{
		"id": "httrack",
		"name": "HTTrack",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "httrack"
		},
		"source": "curated"
	},
	{
		"id": "postman",
		"name": "PostmanRuntime",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "postmanruntime"
		},
		"source": "curated"
	},
	{
		"id": "guzzle",
		"name": "GuzzleHttp",
		"operator": "Generic",
		"category": "headless_automation",
		"match": {
			"mode": "contains",
			"pattern": "guzzlehttp"
		},
		"source": "curated"
	},
	{
		"id": "agi-agent",
		"name": "AGI Agent",
		"operator": "AGI, Inc",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "agi agent"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "aiwebindex",
		"name": "AIWebIndex",
		"operator": "Lyrenth",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "aiwebindex"
		},
		"docs": "https://lyrenth.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "addsearchbot",
		"name": "AddSearchBot",
		"operator": "Unclear at this time.",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "addsearchbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "agentdatabot",
		"name": "AgentDataBot",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "agentdatabot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "agenttimes",
		"name": "AgentTimes",
		"operator": "The Agent Times",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "agenttimes"
		},
		"docs": "https://theagenttimes.com/about",
		"source": "ai.robots.txt"
	},
	{
		"id": "amazonbuyforme",
		"name": "AmazonBuyForMe",
		"operator": "Amazon",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "amazonbuyforme"
		},
		"docs": "https://amazon.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "andibot",
		"name": "Andibot",
		"operator": "Andi",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "andibot"
		},
		"docs": "https://andisearch.com/",
		"source": "ai.robots.txt"
	},
	{
		"id": "anomura",
		"name": "Anomura",
		"operator": "Direqt",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "anomura"
		},
		"docs": "https://direqt.ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "apifybot",
		"name": "ApifyBot",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "apifybot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "apifywebsitecontentcrawler",
		"name": "ApifyWebsiteContentCrawler",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "apifywebsitecontentcrawler"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "aranet-searchbot",
		"name": "Aranet-SearchBot",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "aranet-searchbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "awario",
		"name": "Awario",
		"operator": "Awario",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "awario"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "azureai-searchbot",
		"name": "AzureAI-SearchBot",
		"operator": "Unclear at this time.",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "azureai-searchbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "bixelbot",
		"name": "BixelBot",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "bixelbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "bravebot",
		"name": "Bravebot",
		"operator": "https://safe.search.brave.com/help/brave-search-crawler",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "bravebot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "brightbot",
		"name": "Brightbot",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "brightbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "brightbot-1-0",
		"name": "Brightbot 1.0",
		"operator": "https://brightdata.com/brightbot",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "brightbot 1.0"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "buddybot",
		"name": "BuddyBot",
		"operator": "BuddyBotLearning",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "buddybot"
		},
		"docs": "https://www.buddybotlearning.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "cartai-agentic-commerce",
		"name": "CartAI Agentic Commerce",
		"operator": "CartAI that accesses online stores to support user-directed shopping and checkou",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "cartai agentic commerce"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "channel3bot",
		"name": "Channel3Bot",
		"operator": "Unclear at this time.",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "channel3bot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "chatglm-spider",
		"name": "ChatGLM-Spider",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "chatglm-spider"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "chatgpt-agent",
		"name": "ChatGPT Agent",
		"operator": "OpenAI",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "chatgpt agent"
		},
		"docs": "https://openai.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "claude-agent",
		"name": "Claude-Agent",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "claude-agent"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "claude-code",
		"name": "Claude-Code",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "claude-code"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "cledarabot",
		"name": "CledaraBot",
		"operator": "Cledara that visits SaaS providers to complete customer-approved administrative ",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "cledarabot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "cloudvertexbot",
		"name": "CloudVertexBot",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "cloudvertexbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "cloudflare-autorag",
		"name": "Cloudflare-AutoRAG",
		"operator": "Cloudflare",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "cloudflare-autorag"
		},
		"docs": "https://developers.cloudflare.com/autorag",
		"source": "ai.robots.txt"
	},
	{
		"id": "cloudflarebrowserrenderingcrawler",
		"name": "CloudflareBrowserRenderingCrawler",
		"operator": "Cloudflare that returns rendered website content for research, monitoring, and A",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "cloudflarebrowserrenderingcrawler"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "code",
		"name": "Code",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "code"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "codex",
		"name": "Codex",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "codex"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "cotoyogi",
		"name": "Cotoyogi",
		"operator": "ROIS",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "cotoyogi"
		},
		"docs": "https://ds.rois.ac.jp/en_center8/en_crawler/",
		"source": "ai.robots.txt"
	},
	{
		"id": "cragcrawler",
		"name": "CragCrawler",
		"operator": "CragSoftware, a Brazil-based software company specializing in data engineering a",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "cragcrawler"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "crawl4ai",
		"name": "Crawl4AI",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "crawl4ai"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "crawlspace",
		"name": "Crawlspace",
		"operator": "Crawlspace",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "crawlspace"
		},
		"docs": "https://crawlspace.dev",
		"source": "ai.robots.txt"
	},
	{
		"id": "cursor",
		"name": "Cursor",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "cursor"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "datenbank-crawler",
		"name": "Datenbank Crawler",
		"operator": "Datenbank",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "datenbank crawler"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "deepseekbot",
		"name": "DeepSeekBot",
		"operator": "DeepSeek",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "deepseekbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "devin",
		"name": "Devin",
		"operator": "Devin AI",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "devin"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "doubaobot",
		"name": "DoubaoBot",
		"operator": "ByteDance",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "doubaobot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "erniebot",
		"name": "ERNIEBot",
		"operator": "Baidu",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "erniebot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "echobot-bot",
		"name": "Echobot Bot",
		"operator": "Echobox",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "echobot bot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "echoboxbot",
		"name": "EchoboxBot",
		"operator": "Echobox",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "echoboxbot"
		},
		"docs": "https://echobox.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "elevenlabsbot",
		"name": "ElevenlabsBot",
		"operator": "ElevenLabs",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "elevenlabsbot"
		},
		"docs": "https://elevenlabs.io",
		"source": "ai.robots.txt"
	},
	{
		"id": "elevenlabscrawler",
		"name": "ElevenlabsCrawler",
		"operator": "ElevenLabs",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "elevenlabscrawler"
		},
		"docs": "https://elevenlabs.io",
		"source": "ai.robots.txt"
	},
	{
		"id": "exasearchbot",
		"name": "ExaSearchBot",
		"operator": "Exa",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "exasearchbot"
		},
		"docs": "https://exa.ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "exauser",
		"name": "ExaUser",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "exauser"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "factset-spyderbot",
		"name": "Factset_spyderbot",
		"operator": "Factset",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "factset_spyderbot"
		},
		"docs": "https://www.factset.com/ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "firecrawlagent",
		"name": "FirecrawlAgent",
		"operator": "Firecrawl that extracts web content and converts it into structured data for use",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "firecrawlagent"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "friendlycrawler",
		"name": "FriendlyCrawler",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "friendlycrawler"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "geisthaus-pagefetcher",
		"name": "GeistHaus-PageFetcher",
		"operator": "GeistHaus, a company developing AI systems for therapy and psychological assessm",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "geisthaus-pagefetcher"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "gemini-deep-research",
		"name": "Gemini-Deep-Research",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "gemini-deep-research"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "google-agent",
		"name": "Google-Agent",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "google-agent"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "google-extended",
		"name": "Google-Extended",
		"operator": "Google",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "google-extended"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "google-firebase",
		"name": "Google-Firebase",
		"operator": "Google",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "google-firebase"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "google-gemini-cli",
		"name": "Google-Gemini-CLI",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "google-gemini-cli"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "google-gemininotebook",
		"name": "Google-GeminiNotebook",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "google-gemininotebook"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "google-notebooklm",
		"name": "Google-NotebookLM",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "google-notebooklm"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "googleagent-mariner",
		"name": "GoogleAgent-Mariner",
		"operator": "Google",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "googleagent-mariner"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "googleagent-urlcontext",
		"name": "GoogleAgent-URLContext",
		"operator": "Google that retrieves web content on behalf of Gemini API users",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "googleagent-urlcontext"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "grok-bot",
		"name": "Grok Bot",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "grok bot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "grokappandroid",
		"name": "GrokAppAndroid",
		"operator": "xAI",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "grokappandroid"
		},
		"docs": "https://x.ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "grokbot",
		"name": "GrokBot",
		"operator": "xAI",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "grokbot"
		},
		"docs": "https://x.ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "haiku-searchbot",
		"name": "Haiku-SearchBot",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "haiku-searchbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "harkbot",
		"name": "HarkBot",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "harkbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "henkbot",
		"name": "HenkBot",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "henkbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "hunyuan",
		"name": "Hunyuan",
		"operator": "Tencent",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "hunyuan"
		},
		"docs": "https://hunyuan.tencent.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "icc-crawler",
		"name": "ICC-Crawler",
		"operator": "NICT",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "icc-crawler"
		},
		"docs": "https://nict.go.jp",
		"source": "ai.robots.txt"
	},
	{
		"id": "isscyberriskcrawler",
		"name": "ISSCyberRiskCrawler",
		"operator": "ISS-Corporate",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "isscyberriskcrawler"
		},
		"docs": "https://iss-cyber.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "imagesiftbot",
		"name": "ImagesiftBot",
		"operator": "ImageSift",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "imagesiftbot"
		},
		"docs": "https://imagesift.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "instinct",
		"name": "Instinct",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "instinct"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "kangaroo-bot",
		"name": "Kangaroo Bot",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "kangaroo bot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "keenablebot",
		"name": "KeenableBot",
		"operator": "Keenable",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "keenablebot"
		},
		"docs": "https://keenable.ai/",
		"source": "ai.robots.txt"
	},
	{
		"id": "kimi-agent",
		"name": "Kimi-Agent",
		"operator": "Moonshot AI that browses websites while carrying out user-directed research and ",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "kimi-agent"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "kimi-searchbot",
		"name": "Kimi-SearchBot",
		"operator": "Moonshot AI",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "kimi-searchbot"
		},
		"docs": "https://www.moonshot.ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "kimi-user",
		"name": "Kimi-User",
		"operator": "Moonshot AI that fetches web content on behalf of users interacting with Kimi",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "kimi-user"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "kimibot",
		"name": "KimiBot",
		"operator": "Moonshot AI",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "kimibot"
		},
		"docs": "https://www.moonshot.ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "klaviyoaibot",
		"name": "KlaviyoAIBot",
		"operator": "Klaviyo",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "klaviyoaibot"
		},
		"docs": "https://www.klaviyo.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "kunatocrawler",
		"name": "KunatoCrawler",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "kunatocrawler"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "laiondownloader",
		"name": "LAIONDownloader",
		"operator": "Large-scale Artificial Intelligence Open Network",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "laiondownloader"
		},
		"docs": "https://laion.ai/",
		"source": "ai.robots.txt"
	},
	{
		"id": "lightpanda",
		"name": "Lightpanda",
		"operator": "Anyone who downloads the Lightpanda client. Possibly being used by a Grok-adjace",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "lightpanda"
		},
		"docs": "https://github.com/lightpanda-io/browser/issues/3156#issuecomment-5217843616",
		"source": "ai.robots.txt"
	},
	{
		"id": "liner-user",
		"name": "Liner-User",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "liner-user"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "linerbot",
		"name": "LinerBot",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "linerbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "linguee-bot",
		"name": "Linguee Bot",
		"operator": "Linguee",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "linguee bot"
		},
		"docs": "https://www.linguee.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "linkupbot",
		"name": "LinkupBot",
		"operator": "Unclear at this time.",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "linkupbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "manus-user",
		"name": "Manus-User",
		"operator": "Butterfly Effect, a company based in China",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "manus-user"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "minimaxagent",
		"name": "MiniMaxAgent",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "minimaxagent"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "mistralai-index",
		"name": "MistralAI-Index",
		"operator": "Mistral AI",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "mistralai-index"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "mistralai-training",
		"name": "MistralAI-Training",
		"operator": "Mistral AI",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "mistralai-training"
		},
		"docs": "https://mistral.ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "moonshotbot",
		"name": "MoonshotBot",
		"operator": "Kimi",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "moonshotbot"
		},
		"docs": "https://www.kimi.ai/",
		"source": "ai.robots.txt"
	},
	{
		"id": "mozilla-tabstack",
		"name": "Mozilla-Tabstack",
		"operator": "Mozilla that performs programmatic, AI-driven interactions with web content thro",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "mozilla-tabstack"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "muse",
		"name": "Muse",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "muse"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "mycentralaiscraperbot",
		"name": "MyCentralAIScraperBot",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "mycentralaiscraperbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "nagetbot",
		"name": "NagetBot",
		"operator": "Naget Inc (founded by Chris Samarinas, headquarter in Amherst, Massachusetts)",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "nagetbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "notebooklm",
		"name": "NotebookLM",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "notebooklm"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "novaact",
		"name": "NovaAct",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "novaact"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "openai",
		"name": "OpenAI",
		"operator": "OpenAI",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "openai"
		},
		"docs": "https://openai.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "operator",
		"name": "Operator",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "operator"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "pangubot",
		"name": "PanguBot",
		"operator": "the Chinese company Huawei",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "pangubot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "panscient",
		"name": "Panscient",
		"operator": "Panscient",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "panscient"
		},
		"docs": "https://panscient.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "payhawk-invoice-fetching-agent",
		"name": "Payhawk Invoice Fetching Agent",
		"operator": "Payhawk that retrieves invoices from supplier websites for users and attaches th",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "payhawk invoice fetching agent"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "phindbot",
		"name": "PhindBot",
		"operator": "phind",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "phindbot"
		},
		"docs": "https://www.phind.com/",
		"source": "ai.robots.txt"
	},
	{
		"id": "poggio-citations",
		"name": "Poggio-Citations",
		"operator": "Poggio, a company that provides AI sales enablement tools for creating tailored ",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "poggio-citations"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "poseidon-research-crawler",
		"name": "Poseidon Research Crawler",
		"operator": "Poseidon Research",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "poseidon research crawler"
		},
		"docs": "https://www.poseidonresearch.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "qualifiedbot",
		"name": "QualifiedBot",
		"operator": "Qualified",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "qualifiedbot"
		},
		"docs": "https://www.qualified.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "querit-searchbot",
		"name": "Querit-SearchBot",
		"operator": "Querit that indexes web content for their search API service, which is designed ",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "querit-searchbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "queritbot",
		"name": "QueritBot",
		"operator": "Querit, a company providing a search API for large language model integration",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "queritbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "quillbot",
		"name": "QuillBot",
		"operator": "Quillbot",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "quillbot"
		},
		"docs": "https://quillbot.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "qwenbot",
		"name": "QwenBot",
		"operator": "Alibaba",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "qwenbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "reflectionbot",
		"name": "Reflectionbot",
		"operator": "Reflection",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "reflectionbot"
		},
		"docs": "https://reflection.ai/",
		"source": "ai.robots.txt"
	},
	{
		"id": "sbintuitionsbot",
		"name": "SBIntuitionsBot",
		"operator": "SB Intuitions",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "sbintuitionsbot"
		},
		"docs": "https://www.sbintuitions.co.jp/en/",
		"source": "ai.robots.txt"
	},
	{
		"id": "scrybot",
		"name": "ScryBot",
		"operator": "Scry",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "scrybot"
		},
		"docs": "https://scry.io/",
		"source": "ai.robots.txt"
	},
	{
		"id": "shap-user",
		"name": "Shap-User",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "shap-user"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "shapbot",
		"name": "ShapBot",
		"operator": "Parallel",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "shapbot"
		},
		"docs": "https://parallel.ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "sidetrade-indexer-bot",
		"name": "Sidetrade indexer bot",
		"operator": "Sidetrade",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "sidetrade indexer bot"
		},
		"docs": "https://www.sidetrade.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "spider",
		"name": "Spider",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "spider"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "tavilybot",
		"name": "TavilyBot",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "tavilybot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "terra-cotta",
		"name": "Terra Cotta",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "terra cotta"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "terracotta",
		"name": "TerraCotta",
		"operator": "Ceramic AI",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "terracotta"
		},
		"docs": "https://ceramic.ai/",
		"source": "ai.robots.txt"
	},
	{
		"id": "thinkbot",
		"name": "Thinkbot",
		"operator": "Thinkbot",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "thinkbot"
		},
		"docs": "https://www.thinkbot.agency",
		"source": "ai.robots.txt"
	},
	{
		"id": "tiktokspider",
		"name": "TikTokSpider",
		"operator": "ByteDance",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "tiktokspider"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "timpibot",
		"name": "Timpibot",
		"operator": "Timpi",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "timpibot"
		},
		"docs": "https://timpi.io",
		"source": "ai.robots.txt"
	},
	{
		"id": "tongyibot",
		"name": "TongyiBot",
		"operator": "Alibaba that fetches web content for the Tongyi Qianwen assistant and related Qw",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "tongyibot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "trae",
		"name": "Trae",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "trae"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "twinagent",
		"name": "TwinAgent",
		"operator": "Twin, a platform that creates automated workers to perform tasks by integrating ",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "twinagent"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "useai",
		"name": "UseAI",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "useai"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "velenpublicwebcrawler",
		"name": "VelenPublicWebCrawler",
		"operator": "Velen Crawler",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "velenpublicwebcrawler"
		},
		"docs": "https://velen.io",
		"source": "ai.robots.txt"
	},
	{
		"id": "wardbot",
		"name": "WARDBot",
		"operator": "WEBSPARK",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "wardbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "wrtnbot",
		"name": "WRTNBot",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "wrtnbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "webzio-extended",
		"name": "Webzio-Extended",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "webzio-extended"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "yibot",
		"name": "YiBot",
		"operator": "01.ai, an AI company founded by Kai-Fu Lee.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "yibot"
		},
		"docs": "https://01.ai/",
		"source": "ai.robots.txt"
	},
	{
		"id": "yiyanbot",
		"name": "YiyanBot",
		"operator": "Baidu that fetches web content for the yiyan",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "yiyanbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "zanistabot",
		"name": "ZanistaBot",
		"operator": "Unclear at this time.",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "zanistabot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "aihitbot",
		"name": "aiHitBot",
		"operator": "aiHit",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "aihitbot"
		},
		"docs": "https://www.aihitdata.com/about",
		"source": "ai.robots.txt"
	},
	{
		"id": "amazon-qbusiness",
		"name": "amazon-QBusiness",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "amazon-qbusiness"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "amazon-kendra",
		"name": "amazon-kendra",
		"operator": "Amazon",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "amazon-kendra"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "atlassian-bot",
		"name": "atlassian-bot",
		"operator": "Atlassian",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "atlassian-bot"
		},
		"docs": "https://www.atlassian.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "bedrockbot",
		"name": "bedrockbot",
		"operator": "Amazon",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "bedrockbot"
		},
		"docs": "https://amazon.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "bigsur-ai",
		"name": "bigsur.ai",
		"operator": "Big Sur AI that fetches website content to enable AI-powered web agents, sales a",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "bigsur.ai"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "cohere-training-data-crawler",
		"name": "cohere-training-data-crawler",
		"operator": "Cohere to download training data for its LLMs (Large Language Models) that power",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "cohere-training-data-crawler"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "iaskbot",
		"name": "iAskBot",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "iaskbot"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "iaskspider",
		"name": "iaskspider",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "iaskspider"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "iaskspider-2-0",
		"name": "iaskspider/2.0",
		"operator": "iAsk",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "iaskspider/2.0"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "imagespider",
		"name": "imageSpider",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "imagespider"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "img2dataset",
		"name": "img2dataset",
		"operator": "img2dataset",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "img2dataset"
		},
		"docs": "https://github.com/rom1504/img2dataset",
		"source": "ai.robots.txt"
	},
	{
		"id": "kagi-fetcher",
		"name": "kagi-fetcher",
		"operator": "Kagi that fetches web content to answer user queries through Kagi AI, their suit",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "kagi-fetcher"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "laion-huggingface-processor",
		"name": "laion-huggingface-processor",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "laion-huggingface-processor"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "nbot",
		"name": "nbot",
		"operator": "NBot",
		"category": "ai_search",
		"match": {
			"mode": "contains",
			"pattern": "nbot"
		},
		"docs": "https://nbot.ai",
		"source": "ai.robots.txt"
	},
	{
		"id": "netestate-imprint-crawler",
		"name": "netEstate Imprint Crawler",
		"operator": "netEstate",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "netestate imprint crawler"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "newsai",
		"name": "newsai",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "newsai"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "omgili",
		"name": "omgili",
		"operator": "Webz.io",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "omgili"
		},
		"docs": "https://webz.io/",
		"source": "ai.robots.txt"
	},
	{
		"id": "omgilibot",
		"name": "omgilibot",
		"operator": "Webz.io",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "omgilibot"
		},
		"docs": "https://webz.io/",
		"source": "ai.robots.txt"
	},
	{
		"id": "opencode",
		"name": "opencode",
		"operator": "Unclear at this time.",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "opencode"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "panscient-com",
		"name": "panscient.com",
		"operator": "Panscient",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "panscient.com"
		},
		"docs": "https://panscient.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "qodercli",
		"name": "qodercli",
		"operator": "Qoder that helps developers build, debug, and modify software from the terminal",
		"category": "ai_assistant",
		"match": {
			"mode": "contains",
			"pattern": "qodercli"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "quillbot-com",
		"name": "quillbot.com",
		"operator": "Quillbot",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "quillbot.com"
		},
		"docs": "https://quillbot.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "webzio-extended-2",
		"name": "webzio-extended",
		"operator": "Unclear at this time.",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "webzio-extended"
		},
		"source": "ai.robots.txt"
	},
	{
		"id": "wpbot",
		"name": "wpbot",
		"operator": "QuantumCloud",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "wpbot"
		},
		"docs": "https://www.quantumcloud.com",
		"source": "ai.robots.txt"
	},
	{
		"id": "xai-grok",
		"name": "xAI-Grok",
		"operator": "xAI",
		"category": "ai_training",
		"match": {
			"mode": "contains",
			"pattern": "xai-grok"
		},
		"docs": "https://x.ai/",
		"source": "ai.robots.txt"
	},
	{
		"id": "cua-mediapartners-googlebot",
		"name": "Mediapartners Googlebot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Mediapartners \\(Googlebot\\)",
			"lit": "mediapartners (googlebot)"
		},
		"docs": "https://support.google.com/webmasters/answer/1061943?hl=en",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ww-get",
		"name": "wW get",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "[wW]get",
			"lit": "get"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-httpunit",
		"name": "httpunit",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "httpunit",
			"lit": "httpunit"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nutch",
		"name": "Nutch",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Nutch",
			"lit": "nutch"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-phpcrawl",
		"name": "phpcrawl",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "phpcrawl",
			"lit": "phpcrawl"
		},
		"docs": "http://phpcrawl.cuab.de/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jyxobot",
		"name": "jyxobot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "jyxobot",
			"lit": "jyxobot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fast-webcrawler",
		"name": "FAST-WebCrawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "FAST-WebCrawler",
			"lit": "fast-webcrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fast-enterprise-crawler",
		"name": "FAST Enterprise Crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "FAST Enterprise Crawler",
			"lit": "fast enterprise crawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-biglotron",
		"name": "BIGLOTRON",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "BIGLOTRON",
			"lit": "biglotron"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-teoma",
		"name": "Teoma",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Teoma",
			"lit": "teoma"
		},
		"docs": "http://about.ask.com/en/docs/about/webmasters.shtml",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-convera",
		"name": "convera",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "convera",
			"lit": "convera"
		},
		"docs": "http://ews.converasearch.com/crawl.htm",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seekbot",
		"name": "Seekbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "^Seekbot",
			"lit": "seekbot"
		},
		"docs": "http://www.seekbot.net/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gigabot",
		"name": "Gigabot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Gigabot",
			"lit": "gigabot"
		},
		"docs": "http://www.gigablast.com/spider.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gigablast",
		"name": "Gigablast",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Gigablast",
			"lit": "gigablast"
		},
		"docs": "https://github.com/gigablast/open-source-search-engine",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gingercrawler",
		"name": "GingerCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GingerCrawler",
			"lit": "gingercrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webmon",
		"name": "webmon",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "webmon ",
			"lit": "webmon "
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-grub-org",
		"name": "grub.org",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "grub\\.org",
			"lit": "grub.org"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-usinenouvellecrawler",
		"name": "UsineNouvelleCrawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "UsineNouvelleCrawler",
			"lit": "usinenouvellecrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-antibot",
		"name": "antibot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "antibot",
			"lit": "antibot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netresearchserver",
		"name": "netresearchserver",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "netresearchserver",
			"lit": "netresearchserver"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fluffy",
		"name": "fluffy",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "fluffy",
			"lit": "fluffy"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-findlink",
		"name": "findlink",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "findlink",
			"lit": "findlink"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-msrbot",
		"name": "msrbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "msrbot",
			"lit": "msrbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yacybot",
		"name": "yacybot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "yacybot",
			"lit": "yacybot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-aisearchbot",
		"name": "AISearchBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "AISearchBot",
			"lit": "aisearchbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ips-agent",
		"name": "ips-agent",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ips-agent",
			"lit": "ips-agent"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tagoobot",
		"name": "tagoobot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "tagoobot",
			"lit": "tagoobot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-woriobot",
		"name": "woriobot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "woriobot",
			"lit": "woriobot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yanga",
		"name": "yanga",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "yanga",
			"lit": "yanga"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-buzzbot",
		"name": "buzzbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "buzzbot",
			"lit": "buzzbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mlbot",
		"name": "mlbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "mlbot",
			"lit": "mlbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-purebot",
		"name": "purebot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "purebot",
			"lit": "purebot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cyberpatrol",
		"name": "CyberPatrol",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "CyberPatrol",
			"lit": "cyberpatrol"
		},
		"docs": "http://www.cyberpatrol.com/cyberpatrolcrawler.asp",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-voilabot",
		"name": "voilabot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "voilabot",
			"lit": "voilabot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-citeseerxbot",
		"name": "citeseerxbot",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "citeseerxbot",
			"lit": "citeseerxbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-spbot",
		"name": "spbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "spbot",
			"lit": "spbot"
		},
		"docs": "http://www.seoprofiler.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-twengabot",
		"name": "twengabot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "twengabot",
			"lit": "twengabot"
		},
		"docs": "http://www.twenga.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-postrank",
		"name": "postrank",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "postrank",
			"lit": "postrank"
		},
		"docs": "http://www.postrank.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-turnitin",
		"name": "Turnitin",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Turnitin",
			"lit": "turnitin"
		},
		"docs": "http://www.turnitin.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scribdbot",
		"name": "scribdbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "scribdbot",
			"lit": "scribdbot"
		},
		"docs": "http://www.scribd.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-page2rss",
		"name": "page2rss",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "page2rss",
			"lit": "page2rss"
		},
		"docs": "http://www.page2rss.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sitebot",
		"name": "sitebot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "sitebot",
			"lit": "sitebot"
		},
		"docs": "http://www.sitebot.org",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linkdex",
		"name": "linkdex",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "linkdex",
			"lit": "linkdex"
		},
		"docs": "http://www.linkdex.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adidxbot",
		"name": "Adidxbot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Adidxbot",
			"lit": "adidxbot"
		},
		"docs": "https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ezooms",
		"name": "ezooms",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ezooms",
			"lit": "ezooms"
		},
		"docs": "http://www.phpbb.com/community/viewtopic.php?f=64&t=935605&start=450#p12948289",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mail-ru-bot",
		"name": "Mail.RU_Bot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Mail\\.RU_Bot",
			"lit": "mail.ru_bot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-discobot",
		"name": "discobot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "discobot",
			"lit": "discobot"
		},
		"docs": "http://discoveryengine.com/discobot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-heritrix",
		"name": "heritrix",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "heritrix",
			"lit": "heritrix"
		},
		"docs": "https://github.com/internetarchive/heritrix3/wiki",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-findthatfile",
		"name": "findthatfile",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "findthatfile",
			"lit": "findthatfile"
		},
		"docs": "http://www.findthatfile.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-europarchive-org",
		"name": "europarchive.org",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "europarchive\\.org",
			"lit": "europarchive.org"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nerdbynature-bot",
		"name": "NerdByNature.Bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "NerdByNature\\.Bot",
			"lit": "nerdbynature.bot"
		},
		"docs": "http://www.nerdbynature.net/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fuelbot",
		"name": "fuelbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "fuelbot",
			"lit": "fuelbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-crunchbot",
		"name": "CrunchBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "^CrunchBot",
			"lit": "crunchbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-indeedbot",
		"name": "IndeedBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "IndeedBot",
			"lit": "indeedbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mappydata",
		"name": "mappydata",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "mappydata",
			"lit": "mappydata"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-woobot",
		"name": "woobot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "woobot",
			"lit": "woobot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zoominfobot",
		"name": "ZoominfoBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ZoominfoBot",
			"lit": "zoominfobot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-privacyawarebot",
		"name": "PrivacyAwareBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PrivacyAwareBot",
			"lit": "privacyawarebot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-multiviewbot",
		"name": "Multiviewbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Multiviewbot",
			"lit": "multiviewbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-swimgbot",
		"name": "SWIMGBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SWIMGBot",
			"lit": "swimgbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-grobbot",
		"name": "Grobbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Grobbot",
			"lit": "grobbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-eright",
		"name": "eright",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "eright",
			"lit": "eright"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-apercite",
		"name": "Apercite",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Apercite",
			"lit": "apercite"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-semanticbot",
		"name": "semanticbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "semanticbot",
			"lit": "semanticbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-aboundex",
		"name": "Aboundex",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Aboundex",
			"lit": "aboundex"
		},
		"docs": "http://www.aboundex.com/crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-domaincrawler",
		"name": "domaincrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "domaincrawler",
			"lit": "domaincrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wbsearchbot",
		"name": "wbsearchbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "wbsearchbot",
			"lit": "wbsearchbot"
		},
		"docs": "http://www.warebay.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-summify",
		"name": "summify",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "summify",
			"lit": "summify"
		},
		"docs": "http://summify.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-edisterbot",
		"name": "edisterbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "edisterbot",
			"lit": "edisterbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ec2linkfinder",
		"name": "ec2linkfinder",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "ec2linkfinder",
			"lit": "ec2linkfinder"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gslfbot",
		"name": "gslfbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "gslfbot",
			"lit": "gslfbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-intelium-bot",
		"name": "intelium_bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "intelium_bot",
			"lit": "intelium_bot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yeti",
		"name": "Yeti",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Yeti",
			"lit": "yeti"
		},
		"docs": "http://naver.me/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-retrevopageanalyzer",
		"name": "RetrevoPageAnalyzer",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RetrevoPageAnalyzer",
			"lit": "retrevopageanalyzer"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lb-spider",
		"name": "lb-spider",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "lb-spider",
			"lit": "lb-spider"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lssbot",
		"name": "lssbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "lssbot",
			"lit": "lssbot"
		},
		"docs": "https://www.lssbot.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-careerbot",
		"name": "careerbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "careerbot",
			"lit": "careerbot"
		},
		"docs": "http://www.career-x.de/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wotbox",
		"name": "wotbox",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "wotbox",
			"lit": "wotbox"
		},
		"docs": "http://www.wotbox.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wocbot",
		"name": "wocbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "wocbot",
			"lit": "wocbot"
		},
		"docs": "http://www.wocodi.com/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ichiro",
		"name": "ichiro",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "ichiro",
			"lit": "ichiro"
		},
		"docs": "http://help.goo.ne.jp/help/article/1142",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lssrocketcrawler",
		"name": "lssrocketcrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "lssrocketcrawler",
			"lit": "lssrocketcrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-drupact",
		"name": "drupact",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "drupact",
			"lit": "drupact"
		},
		"docs": "http://www.arocom.de/drupact",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webcompanycrawler",
		"name": "webcompanycrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "webcompanycrawler",
			"lit": "webcompanycrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-acoonbot",
		"name": "acoonbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "acoonbot",
			"lit": "acoonbot"
		},
		"docs": "http://www.acoon.de/robot.asp",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-openindexspider",
		"name": "openindexspider",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "openindexspider",
			"lit": "openindexspider"
		},
		"docs": "http://www.openindex.io/en/webmasters/spider.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gnam-gnam-spider",
		"name": "gnam gnam spider",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "gnam gnam spider",
			"lit": "gnam gnam spider"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-web-archive-net-com-bot",
		"name": "web-archive-net.com.bot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "web-archive-net\\.com\\.bot",
			"lit": "web-archive-net.com.bot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-backlinkcrawler",
		"name": "backlinkcrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "backlinkcrawler",
			"lit": "backlinkcrawler"
		},
		"docs": "http://www.backlinktest.com/crawler.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-coccoc",
		"name": "coccoc",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "coccoc",
			"lit": "coccoc"
		},
		"docs": "http://help.coccoc.vn/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-integromedb",
		"name": "integromedb",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "integromedb",
			"lit": "integromedb"
		},
		"docs": "http://www.integromedb.org/Crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-content-crawler-spider",
		"name": "content crawler spider",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "content crawler spider",
			"lit": "content crawler spider"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-toplistbot",
		"name": "toplistbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "toplistbot",
			"lit": "toplistbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-it2media-domain-crawler",
		"name": "it2media-domain-crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "it2media-domain-crawler",
			"lit": "it2media-domain-crawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ip-web-crawler-com",
		"name": "ip-web-crawler.com",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "ip-web-crawler\\.com",
			"lit": "ip-web-crawler.com"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-siteexplorer-info",
		"name": "siteexplorer.info",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "siteexplorer\\.info",
			"lit": "siteexplorer.info"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-elisabot",
		"name": "elisabot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "elisabot",
			"lit": "elisabot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-proximic",
		"name": "proximic",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "proximic",
			"lit": "proximic"
		},
		"docs": "http://www.proximic.com/info/spider.php",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-changedetection",
		"name": "changedetection",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "changedetection",
			"lit": "changedetection"
		},
		"docs": "http://www.changedetection.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-arabot",
		"name": "arabot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "arabot",
			"lit": "arabot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wesee-search",
		"name": "WeSEE:Search",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "WeSEE:Search",
			"lit": "wesee:search"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-niki-bot",
		"name": "niki-bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "niki-bot",
			"lit": "niki-bot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-crystalsemanticsbot",
		"name": "CrystalSemanticsBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "CrystalSemanticsBot",
			"lit": "crystalsemanticsbot"
		},
		"docs": "http://www.crystalsemantics.com/user-agent/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-psbot",
		"name": "psbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "psbot",
			"lit": "psbot"
		},
		"docs": "http://www.picsearch.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-interfaxscanbot",
		"name": "InterfaxScanBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "InterfaxScanBot",
			"lit": "interfaxscanbot"
		},
		"docs": "http://scan-interfax.ru",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cc-metadata-scaper",
		"name": "CC Metadata Scaper",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "CC Metadata Scaper",
			"lit": "cc metadata scaper"
		},
		"docs": "http://wiki.creativecommons.org/Metadata_Scraper",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-g00g1e-net",
		"name": "g00g1e.net",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "g00g1e\\.net",
			"lit": "g00g1e.net"
		},
		"docs": "http://www.g00g1e.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-grapeshotcrawler",
		"name": "GrapeshotCrawler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "GrapeshotCrawler",
			"lit": "grapeshotcrawler"
		},
		"docs": "http://www.grapeshot.co.uk/crawler.php",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-urlappendbot",
		"name": "urlappendbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "urlappendbot",
			"lit": "urlappendbot"
		},
		"docs": "http://www.profound.net/urlappendbot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-brainobot",
		"name": "brainobot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "brainobot",
			"lit": "brainobot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fr-crawler",
		"name": "fr-crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "fr-crawler",
			"lit": "fr-crawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-binlar",
		"name": "binlar",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "binlar",
			"lit": "binlar"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-simplecrawler",
		"name": "SimpleCrawler",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "SimpleCrawler",
			"lit": "simplecrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cxensebot",
		"name": "cXensebot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "cXensebot",
			"lit": "cxensebot"
		},
		"docs": "http://www.cxense.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-smtbot",
		"name": "smtbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "smtbot",
			"lit": "smtbot"
		},
		"docs": "http://www.similartech.com/smtbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bnf-fr-bot",
		"name": "bnf.fr_bot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "bnf\\.fr_bot",
			"lit": "bnf.fr_bot"
		},
		"docs": "http://www.bnf.fr/fr/outils/a.dl_web_capture_robot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-a6-indexer",
		"name": "A6-Indexer",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "A6-Indexer",
			"lit": "a6-indexer"
		},
		"docs": "http://www.a6corp.com/a6-web-scraping-policy/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-admantx",
		"name": "ADmantX",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "ADmantX",
			"lit": "admantx"
		},
		"docs": "http://www.admantx.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-facebot",
		"name": "Facebot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Facebot",
			"lit": "facebot"
		},
		"docs": "https://developers.facebook.com/docs/sharing/best-practices#crawl",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-orangebot",
		"name": "OrangeBot/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "OrangeBot\\/",
			"lit": "orangebot/"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-memorybot",
		"name": "memorybot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "memorybot",
			"lit": "memorybot"
		},
		"docs": "http://mignify.com/bot.htm",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-advbot",
		"name": "AdvBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "AdvBot",
			"lit": "advbot"
		},
		"docs": "http://advbot.net/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-megaindex",
		"name": "MegaIndex",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MegaIndex",
			"lit": "megaindex"
		},
		"docs": "https://www.megaindex.ru/?tab=linkAnalyze",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-semanticscholarbot",
		"name": "SemanticScholarBot",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "SemanticScholarBot",
			"lit": "semanticscholarbot"
		},
		"docs": "https://www.semanticscholar.org/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ltx71",
		"name": "ltx71",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "ltx71",
			"lit": "ltx71"
		},
		"docs": "http://ltx71.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nerdybot",
		"name": "nerdybot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "nerdybot",
			"lit": "nerdybot"
		},
		"docs": "http://nerdybot.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-xovibot",
		"name": "xovibot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "xovibot",
			"lit": "xovibot"
		},
		"docs": "http://www.xovibot.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bubing",
		"name": "BUbiNG",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "BUbiNG",
			"lit": "bubing"
		},
		"docs": "http://law.di.unimi.it/BUbiNG.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-qwantify",
		"name": "Qwantify",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Qwantify",
			"lit": "qwantify"
		},
		"docs": "https://www.qwant.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tweetmemebot",
		"name": "TweetmemeBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "TweetmemeBot",
			"lit": "tweetmemebot"
		},
		"docs": "http://datasift.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-crawler4j",
		"name": "crawler4j",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "crawler4j",
			"lit": "crawler4j"
		},
		"docs": "https://github.com/yasserg/crawler4j",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-findxbot",
		"name": "findxbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "findxbot",
			"lit": "findxbot"
		},
		"docs": "http://www.findxbot.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yoozbot",
		"name": "yoozBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "yoozBot",
			"lit": "yoozbot"
		},
		"docs": "http://yooz.ir",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lipperhey",
		"name": "lipperhey",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "lipperhey",
			"lit": "lipperhey"
		},
		"docs": "http://www.lipperhey.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-y-j",
		"name": "Y!J",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Y!J",
			"lit": "y!j"
		},
		"docs": "https://www.yahoo-help.jp/app/answers/detail/p/595/a_id/42716/~/%E3%82%A6%E3%82%A7%E3%83%96%E3%83%9A%E3%83%BC%E3%82%B8%E3%81%AB%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B9%E3%81%99%E3%82%8B%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E3%81%AE%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E3%82%A8%E3%83%BC%E3%82%B8%E3%82%A7%E3%83%B3%E3%83%88%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-domain-re-animator-bot",
		"name": "Domain Re-Animator Bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Domain Re-Animator Bot",
			"lit": "domain re-animator bot"
		},
		"docs": "http://domainreanimator.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-addthis",
		"name": "AddThis",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "AddThis",
			"lit": "addthis"
		},
		"docs": "https://www.addthis.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-metauri",
		"name": "MetaURI",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MetaURI",
			"lit": "metauri"
		},
		"docs": "http://www.useragentstring.com/MetaURI_id_17683.php",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-livelap-bb-ot",
		"name": "Livelap bB ot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Livelap[bB]ot",
			"lit": "livelap"
		},
		"docs": "http://site.livelap.com/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-openhosebot",
		"name": "OpenHoseBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "OpenHoseBot",
			"lit": "openhosebot"
		},
		"docs": "http://www.openhose.org/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-capsulechecker",
		"name": "CapsuleChecker",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "CapsuleChecker",
			"lit": "capsulechecker"
		},
		"docs": "http://www.capsulink.com/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-collection-infegy-com",
		"name": "collection@infegy.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "collection@infegy\\.com",
			"lit": "collection@infegy.com"
		},
		"docs": "http://infegy.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-istellabot",
		"name": "IstellaBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "IstellaBot",
			"lit": "istellabot"
		},
		"docs": "http://www.tiscali.it/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-deusu",
		"name": "DeuSu/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "DeuSu\\/",
			"lit": "deusu/"
		},
		"docs": "https://deusu.de/robot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-betabot",
		"name": "betaBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "betaBot",
			"lit": "betabot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cliqzbot",
		"name": "Cliqzbot/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Cliqzbot\\/",
			"lit": "cliqzbot/"
		},
		"docs": "http://cliqz.com/company/cliqzbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netestate-ne-crawler",
		"name": "netEstate NE Crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "netEstate NE Crawler",
			"lit": "netestate ne crawler"
		},
		"docs": "http://www.website-datenbank.de/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-safesearch-microdata-crawler",
		"name": "SafeSearch microdata crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "SafeSearch microdata crawler",
			"lit": "safesearch microdata crawler"
		},
		"docs": "https://safesearch.avira.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gluten-free-crawler",
		"name": "Gluten Free Crawler/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Gluten Free Crawler\\/",
			"lit": "gluten free crawler/"
		},
		"docs": "http://glutenfreepleasure.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sonic",
		"name": "Sonic",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Sonic",
			"lit": "sonic"
		},
		"docs": "http://www.yama.info.waseda.ac.jp/~crawler/info.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sysomos",
		"name": "Sysomos",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Sysomos",
			"lit": "sysomos"
		},
		"docs": "http://www.sysomos.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-trove",
		"name": "Trove",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "Trove",
			"lit": "trove"
		},
		"docs": "http://www.trove.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-deadlinkchecker",
		"name": "deadlinkchecker",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "deadlinkchecker",
			"lit": "deadlinkchecker"
		},
		"docs": "http://www.deadlinkchecker.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rankactivelinkbot",
		"name": "RankActiveLinkBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RankActiveLinkBot",
			"lit": "rankactivelinkbot"
		},
		"docs": "https://rankactive.com/resources/rankactive-linkbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-iskanie",
		"name": "iskanie",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "iskanie",
			"lit": "iskanie"
		},
		"docs": "http://www.iskanie.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-safednsbot",
		"name": "SafeDNSBot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "SafeDNSBot",
			"lit": "safednsbot"
		},
		"docs": "https://www.safedns.com/searchbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-veoozbot",
		"name": "Veoozbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Veoozbot",
			"lit": "veoozbot"
		},
		"docs": "http://www.veooz.com/veoozbot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-adwords-instant",
		"name": "Google-Adwords-Instant",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Google-Adwords-Instant",
			"lit": "google-adwords-instant"
		},
		"docs": "http://www.google.com/adsbot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adbeat-bot",
		"name": "adbeat_bot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "adbeat_bot",
			"lit": "adbeat_bot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-whatsapp",
		"name": "WhatsApp",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "WhatsApp",
			"lit": "whatsapp"
		},
		"docs": "https://www.whatsapp.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-contxbot",
		"name": "contxbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "contxbot",
			"lit": "contxbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pinterest-com-bot",
		"name": "pinterest.com/bot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "pinterest\\.com\\/bot",
			"lit": "pinterest.com/bot"
		},
		"docs": "http://www.pinterest.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-electricmonk",
		"name": "electricmonk",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "electricmonk",
			"lit": "electricmonk"
		},
		"docs": "https://www.duedil.com/our-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-garlikcrawler",
		"name": "GarlikCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GarlikCrawler",
			"lit": "garlikcrawler"
		},
		"docs": "http://garlik.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vebidoobot",
		"name": "vebidoobot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "vebidoobot",
			"lit": "vebidoobot"
		},
		"docs": "https://blog.vebidoo.de/vebidoobot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-femtosearchbot",
		"name": "FemtosearchBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "FemtosearchBot",
			"lit": "femtosearchbot"
		},
		"docs": "http://femtosearch.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yahoo-link-preview",
		"name": "Yahoo Link Preview",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Yahoo Link Preview",
			"lit": "yahoo link preview"
		},
		"docs": "https://help.yahoo.com/kb/mail/yahoo-link-preview-SLN23615.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-metajobbot",
		"name": "MetaJobBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MetaJobBot",
			"lit": "metajobbot"
		},
		"docs": "http://www.metajob.de/the/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-domainstatsbot",
		"name": "DomainStatsBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "DomainStatsBot",
			"lit": "domainstatsbot"
		},
		"docs": "http://domainstats.io/our-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mindupbot",
		"name": "mindUpBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "mindUpBot",
			"lit": "mindupbot"
		},
		"docs": "http://www.datenbutler.de/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-daum",
		"name": "Daum/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Daum\\/",
			"lit": "daum/"
		},
		"docs": "http://cs.daum.net/faq/15/4118.html?faqId=28966",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jugendschutzprogramm-crawler",
		"name": "Jugendschutzprogramm-Crawler",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Jugendschutzprogramm-Crawler",
			"lit": "jugendschutzprogramm-crawler"
		},
		"docs": "http://www.jugendschutzprogramm.de",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-xenu-link-sleuth",
		"name": "Xenu Link Sleuth",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Xenu Link Sleuth",
			"lit": "xenu link sleuth"
		},
		"docs": "http://home.snafu.de/tilman/xenulink.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pcore-http",
		"name": "Pcore-HTTP",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Pcore-HTTP",
			"lit": "pcore-http"
		},
		"docs": "https://bitbucket.org/softvisio/pcore/overview",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-moatbot",
		"name": "moatbot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "moatbot",
			"lit": "moatbot"
		},
		"docs": "https://moat.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kosmiobot",
		"name": "KosmioBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "KosmioBot",
			"lit": "kosmiobot"
		},
		"docs": "http://kosm.io/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-appinsights",
		"name": "AppInsights",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "AppInsights",
			"lit": "appinsights"
		},
		"docs": "https://docs.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gowikibot",
		"name": "Gowikibot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Gowikibot",
			"lit": "gowikibot"
		},
		"docs": "http://www.gowikibot.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-piplbot",
		"name": "PiplBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PiplBot",
			"lit": "piplbot"
		},
		"docs": "http://www.pipl.com/bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jetslide",
		"name": "Jetslide",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Jetslide",
			"lit": "jetslide"
		},
		"docs": "http://jetsli.de/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-newsharecounts",
		"name": "newsharecounts",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "newsharecounts",
			"lit": "newsharecounts"
		},
		"docs": "http://newsharecounts.com/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-james-bot",
		"name": "James BOT",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "James BOT",
			"lit": "james bot"
		},
		"docs": "http://cognitiveseo.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tineye",
		"name": "TinEye",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "TinEye",
			"lit": "tineye"
		},
		"docs": "http://www.tineye.com/crawler.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-socialrankiobot",
		"name": "SocialRankIOBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SocialRankIOBot",
			"lit": "socialrankiobot"
		},
		"docs": "http://socialrank.io/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ocarinabot",
		"name": "Ocarinabot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Ocarinabot",
			"lit": "ocarinabot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-epicbot",
		"name": "epicbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "epicbot",
			"lit": "epicbot"
		},
		"docs": "http://www.epictions.com/epicbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-primalbot",
		"name": "Primalbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Primalbot",
			"lit": "primalbot"
		},
		"docs": "https://www.primal.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-duckduckgo-favicons-bot",
		"name": "DuckDuckGo-Favicons-Bot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "DuckDuckGo-Favicons-Bot",
			"lit": "duckduckgo-favicons-bot"
		},
		"docs": "http://duckduckgo.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gnowitnewsbot",
		"name": "GnowitNewsbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GnowitNewsbot",
			"lit": "gnowitnewsbot"
		},
		"docs": "http://www.gnowit.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-leikibot",
		"name": "Leikibot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Leikibot",
			"lit": "leikibot"
		},
		"docs": "http://www.leiki.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linkarchiver",
		"name": "LinkArchiver",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "LinkArchiver",
			"lit": "linkarchiver"
		},
		"docs": "https://github.com/thisisparker/linkarchiver",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yak",
		"name": "YaK/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "YaK\\/",
			"lit": "yak/"
		},
		"docs": "http://linkfluence.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-paperlibot",
		"name": "PaperLiBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PaperLiBot",
			"lit": "paperlibot"
		},
		"docs": "http://support.paper.li/entries/20023257-what-is-paper-li",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-digg-deeper",
		"name": "Digg Deeper",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Digg Deeper",
			"lit": "digg deeper"
		},
		"docs": "http://digg.com/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dcrawl",
		"name": "dcrawl",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "^dcrawl",
			"lit": "dcrawl"
		},
		"docs": "https://github.com/kgretzky/dcrawl",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-snacktory",
		"name": "Snacktory",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Snacktory",
			"lit": "snacktory"
		},
		"docs": "https://github.com/karussell/snacktory",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-anderspinkbot",
		"name": "AndersPinkBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "AndersPinkBot",
			"lit": "anderspinkbot"
		},
		"docs": "http://anderspink.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fyrebot",
		"name": "Fyrebot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Fyrebot",
			"lit": "fyrebot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-everyonesocialbot",
		"name": "EveryoneSocialBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "EveryoneSocialBot",
			"lit": "everyonesocialbot"
		},
		"docs": "http://everyonesocial.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mediatoolkitbot",
		"name": "Mediatoolkitbot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Mediatoolkitbot",
			"lit": "mediatoolkitbot"
		},
		"docs": "http://mediatoolkit.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-luminator-robots",
		"name": "Luminator-robots",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Luminator-robots",
			"lit": "luminator-robots"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-extlinksbot",
		"name": "ExtLinksBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ExtLinksBot",
			"lit": "extlinksbot"
		},
		"docs": "https://extlinks.com/Bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-surveybot",
		"name": "SurveyBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SurveyBot",
			"lit": "surveybot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ning",
		"name": "NING/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "NING\\/",
			"lit": "ning/"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nuzzel",
		"name": "Nuzzel",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Nuzzel",
			"lit": "nuzzel"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pocketparser",
		"name": "PocketParser",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PocketParser",
			"lit": "pocketparser"
		},
		"docs": "https://getpocket.com/pocketparser_ua",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-um-ln",
		"name": "um-LN",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "um-LN",
			"lit": "um-ln"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-muckrack",
		"name": "MuckRack",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MuckRack",
			"lit": "muckrack"
		},
		"docs": "http://muckrack.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ahc",
		"name": "AHC/",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "AHC\\/",
			"lit": "ahc/"
		},
		"docs": "https://github.com/AsyncHttpClient/async-http-client",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-laserlikebot",
		"name": "Laserlikebot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Laserlikebot",
			"lit": "laserlikebot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jetty",
		"name": "Jetty",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Jetty",
			"lit": "jetty"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-upflow",
		"name": "Upflow",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Upflow",
			"lit": "upflow"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-thinklab",
		"name": "Thinklab",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Thinklab",
			"lit": "thinklab"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-traackr-com",
		"name": "Traackr.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Traackr\\.com",
			"lit": "traackr.com"
		},
		"docs": "https://www.traackr.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-twurly",
		"name": "Twurly",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Twurly",
			"lit": "twurly"
		},
		"docs": "http://twurly.org",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-http-get",
		"name": "http_get",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "http_get",
			"lit": "http_get"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dnyzbot",
		"name": "DnyzBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "DnyzBot",
			"lit": "dnyzbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-botify",
		"name": "botify",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "botify",
			"lit": "botify"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-007ac9-crawler",
		"name": "007ac9 Crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "007ac9 Crawler",
			"lit": "007ac9 crawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-behloolbot",
		"name": "BehloolBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BehloolBot",
			"lit": "behloolbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-brandverity",
		"name": "BrandVerity",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BrandVerity",
			"lit": "brandverity"
		},
		"docs": "http://www.brandverity.com/why-is-brandverity-visiting-me",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bdcbot",
		"name": "BDCbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BDCbot",
			"lit": "bdcbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zumbot",
		"name": "ZumBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "ZumBot",
			"lit": "zumbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ezid",
		"name": "EZID",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "EZID",
			"lit": "ezid"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-archivebot",
		"name": "ArchiveBot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "ArchiveBot",
			"lit": "archivebot"
		},
		"docs": "https://github.com/ArchiveTeam/ArchiveBot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lcc",
		"name": "LCC",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "^LCC ",
			"lit": "lcc "
		},
		"docs": "http://corpora.informatik.uni-leipzig.de/crawler_faq.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-filterdb-iss-net-crawler",
		"name": "filterdb.iss.net/crawler",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "filterdb\\.iss\\.net\\/crawler",
			"lit": "filterdb.iss.net/crawler"
		},
		"docs": "http://filterdb.iss.net/crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blp-bbot",
		"name": "BLP_bbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BLP_bbot",
			"lit": "blp_bbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bomborabot",
		"name": "BomboraBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BomboraBot",
			"lit": "bomborabot"
		},
		"docs": "http://www.bombora.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-buck",
		"name": "Buck/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Buck\\/",
			"lit": "buck/"
		},
		"docs": "https://app.hypefactors.com/media-monitoring/about.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-companybook-crawler",
		"name": "Companybook-Crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Companybook-Crawler",
			"lit": "companybook-crawler"
		},
		"docs": "https://www.companybooknetworking.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-genieo",
		"name": "Genieo",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Genieo",
			"lit": "genieo"
		},
		"docs": "http://www.genieo.com/webfilter.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-magpie-crawler",
		"name": "magpie-crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "magpie-crawler",
			"lit": "magpie-crawler"
		},
		"docs": "http://www.brandwatch.net",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-meltwaternews",
		"name": "MeltwaterNews",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MeltwaterNews",
			"lit": "meltwaternews"
		},
		"docs": "http://www.meltwater.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-moreover",
		"name": "Moreover",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Moreover",
			"lit": "moreover"
		},
		"docs": "http://www.moreover.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-newspaper",
		"name": "newspaper/",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "newspaper\\/",
			"lit": "newspaper/"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scoutjet",
		"name": "ScoutJet",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ScoutJet",
			"lit": "scoutjet"
		},
		"docs": "http://www.scoutjet.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sentry",
		"name": "sentry/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "(^| )sentry\\/",
			"lit": "sentry/"
		},
		"docs": "https://sentry.io",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-storygizebot",
		"name": "StorygizeBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "StorygizeBot",
			"lit": "storygizebot"
		},
		"docs": "http://www.storygize.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-outclicksbot",
		"name": "OutclicksBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "OutclicksBot",
			"lit": "outclicksbot"
		},
		"docs": "https://www.outclicks.net",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hatena",
		"name": "Hatena",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Hatena",
			"lit": "hatena"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-web-preview",
		"name": "Google Web Preview",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Google Web Preview",
			"lit": "google web preview"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mauibot",
		"name": "MauiBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MauiBot",
			"lit": "mauibot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-alphabot",
		"name": "AlphaBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "AlphaBot",
			"lit": "alphabot"
		},
		"docs": "http://alphaseobot.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sbl-bot",
		"name": "SBL-BOT",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "SBL-BOT",
			"lit": "sbl-bot"
		},
		"docs": "http://sbl.net",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ias-crawler",
		"name": "IAS crawler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "IAS crawler",
			"lit": "ias crawler"
		},
		"docs": "http://integralads.com/site-indexing-policy/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adscanner",
		"name": "adscanner",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "adscanner",
			"lit": "adscanner"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netvibes",
		"name": "Netvibes",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Netvibes",
			"lit": "netvibes"
		},
		"docs": "http://www.netvibes.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-baidu-yunguance",
		"name": "Baidu-YunGuanCe",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Baidu-YunGuanCe",
			"lit": "baidu-yunguance"
		},
		"docs": "https://ce.baidu.com/topic/topic20150908",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bitlybot",
		"name": "bitlybot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "bitlybot",
			"lit": "bitlybot"
		},
		"docs": "http://bit.ly/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blogmurabot",
		"name": "blogmuraBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "blogmuraBot",
			"lit": "blogmurabot"
		},
		"docs": "http://www.blogmura.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bot-araturka-com",
		"name": "Bot.AraTurka.com",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Bot\\.AraTurka\\.com",
			"lit": "bot.araturka.com"
		},
		"docs": "http://www.araturka.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bot-pge-chlooe-com",
		"name": "bot-pge.chlooe.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "bot-pge\\.chlooe\\.com",
			"lit": "bot-pge.chlooe.com"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-boxcarbot",
		"name": "BoxcarBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BoxcarBot",
			"lit": "boxcarbot"
		},
		"docs": "https://boxcar.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-btwebclient",
		"name": "BTWebClient",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "BTWebClient",
			"lit": "btwebclient"
		},
		"docs": "http://www.utorrent.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-contextad-bot",
		"name": "ContextAd Bot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "ContextAd Bot",
			"lit": "contextad bot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-digincore-bot",
		"name": "Digincore bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Digincore bot",
			"lit": "digincore bot"
		},
		"docs": "http://www.digincore.com/crawler.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-disqus",
		"name": "Disqus",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Disqus",
			"lit": "disqus"
		},
		"docs": "https://disqus.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fetch",
		"name": "Fetch/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Fetch\\/",
			"lit": "fetch/"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fever",
		"name": "Fever",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Fever",
			"lit": "fever"
		},
		"docs": "http://feedafever.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-flamingo-searchengine",
		"name": "Flamingo_SearchEngine",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Flamingo_SearchEngine",
			"lit": "flamingo_searchengine"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-flipboardproxy",
		"name": "FlipboardProxy",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "FlipboardProxy",
			"lit": "flipboardproxy"
		},
		"docs": "https://about.flipboard.com/browserproxy/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-g2reader-bot",
		"name": "g2reader-bot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "g2reader-bot",
			"lit": "g2reader-bot"
		},
		"docs": "http://www.g2reader.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-g2-web-services",
		"name": "G2 Web Services",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "G2 Web Services",
			"lit": "g2 web services"
		},
		"docs": "https://www.g2webservices.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-imrbot",
		"name": "imrbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "imrbot",
			"lit": "imrbot"
		},
		"docs": "http://www.mignify.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-k7mlwcbot",
		"name": "K7MLWCBot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "K7MLWCBot",
			"lit": "k7mlwcbot"
		},
		"docs": "http://www.k7computing.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kemvibot",
		"name": "Kemvibot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Kemvibot",
			"lit": "kemvibot"
		},
		"docs": "http://kemvi.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linkapediabot",
		"name": "linkapediabot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "linkapediabot",
			"lit": "linkapediabot"
		},
		"docs": "http://www.linkapedia.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-siteimprove-com",
		"name": "Siteimprove.com",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Siteimprove\\.com",
			"lit": "siteimprove.com"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dareboost",
		"name": "DareBoost",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "DareBoost",
			"lit": "dareboost"
		},
		"docs": "https://www.dareboost.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zuperlistbot",
		"name": "ZuperlistBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ZuperlistBot\\/",
			"lit": "zuperlistbot/"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feedspot",
		"name": "Feedspot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Feedspot",
			"lit": "feedspot"
		},
		"docs": "http://www.feedspot.com/fs/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tracemyfile",
		"name": "tracemyfile",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "tracemyfile",
			"lit": "tracemyfile"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nimbostratus-bot",
		"name": "Nimbostratus-Bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Nimbostratus-Bot",
			"lit": "nimbostratus-bot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pr-cy-ru",
		"name": "PR-CY.RU",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PR-CY\\.RU",
			"lit": "pr-cy.ru"
		},
		"docs": "https://a.pr-cy.ru/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adstxtcrawler",
		"name": "AdsTxtCrawler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "AdsTxtCrawler",
			"lit": "adstxtcrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-datafeedwatch",
		"name": "Datafeedwatch",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Datafeedwatch",
			"lit": "datafeedwatch"
		},
		"docs": "https://www.datafeedwatch.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tangibleebot",
		"name": "TangibleeBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "TangibleeBot",
			"lit": "tangibleebot"
		},
		"docs": "http://tangiblee.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-xrawler",
		"name": "google-xrawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "google-xrawler",
			"lit": "google-xrawler"
		},
		"docs": "https://webmasters.stackexchange.com/questions/105560/what-is-the-google-xrawler-user-agent-used-for",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-amazon-cloudfront",
		"name": "Amazon CloudFront",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Amazon CloudFront",
			"lit": "amazon cloudfront"
		},
		"docs": "https://aws.amazon.com/cloudfront/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pulsepoint",
		"name": "Pulsepoint",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Pulsepoint ",
			"lit": "pulsepoint "
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-alwaysonline",
		"name": "CloudFlare-AlwaysOnline",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "CloudFlare-AlwaysOnline",
			"lit": "cloudflare-alwaysonline"
		},
		"docs": "https://www.cloudflare.com/always-online/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-traffic-manager",
		"name": "Cloudflare-Traffic-Manager",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Cloudflare-Traffic-Manager",
			"lit": "cloudflare-traffic-manager"
		},
		"docs": "https://developers.cloudflare.com/load-balancing/monitors/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-prefetch",
		"name": "CloudFlare-Prefetch",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "CloudFlare-Prefetch",
			"lit": "cloudflare-prefetch"
		},
		"docs": "https://developers.cloudflare.com/speed/optimization/content/prefetch-urls/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-ssldetector",
		"name": "Cloudflare-SSLDetector",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Cloudflare-SSLDetector",
			"lit": "cloudflare-ssldetector"
		},
		"docs": "https://developers.cloudflare.com/ssl/origin-configuration/ssl-tls-recommender/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-https-developers-cloudflare-com-security-center",
		"name": "https://developers.cloudflare.com/security-center/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "https:\\/\\/developers\\.cloudflare\\.com\\/security-center\\/",
			"lit": "https://developers.cloudflare.com/security-center/"
		},
		"docs": "https://developers.cloudflare.com/ssl/origin-configuration/ssl-tls-recommender/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-structured-data-testing-tool",
		"name": "Google-Structured-Data-Testing-Tool",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Google-Structured-Data-Testing-Tool",
			"lit": "google-structured-data-testing-tool"
		},
		"docs": "https://search.google.com/structured-data/testing-tool",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wordupinfosearch",
		"name": "WordupInfoSearch",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "WordupInfoSearch",
			"lit": "wordupinfosearch"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webdatastats",
		"name": "WebDataStats",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WebDataStats",
			"lit": "webdatastats"
		},
		"docs": "https://webdatastats.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-httpurlconnection",
		"name": "HttpUrlConnection",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "HttpUrlConnection",
			"lit": "httpurlconnection"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zoombot",
		"name": "ZoomBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ZoomBot",
			"lit": "zoombot"
		},
		"docs": "http://suite.seozoom.it/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-moodlebot",
		"name": "MoodleBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MoodleBot",
			"lit": "moodlebot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jpg-newsbot",
		"name": "jpg-newsbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "jpg-newsbot",
			"lit": "jpg-newsbot"
		},
		"docs": "https://vipnytt.no/bots/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-outbrain",
		"name": "outbrain",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "outbrain",
			"lit": "outbrain"
		},
		"docs": "https://www.outbrain.com/help/advertisers/invalid-url/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-w3c-validator",
		"name": "W3C_Validator",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "W3C_Validator",
			"lit": "w3c_validator"
		},
		"docs": "https://validator.w3.org/services",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-validator-nu",
		"name": "Validator.nu",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Validator\\.nu",
			"lit": "validator.nu"
		},
		"docs": "https://validator.w3.org/services",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-w3c-mobileok",
		"name": "W3C-mobileOK",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "W3C-mobileOK",
			"lit": "w3c-mobileok"
		},
		"docs": "https://validator.w3.org/services",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-w3c-i18n-checker",
		"name": "W3C_I18n-Checker",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "W3C_I18n-Checker",
			"lit": "w3c_i18n-checker"
		},
		"docs": "https://validator.w3.org/services",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feedvalidator",
		"name": "FeedValidator",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "FeedValidator",
			"lit": "feedvalidator"
		},
		"docs": "https://validator.w3.org/services",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-w3c-css-validator",
		"name": "W3C_CSS_Validator",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "W3C_CSS_Validator",
			"lit": "w3c_css_validator"
		},
		"docs": "https://validator.w3.org/services",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-w3c-unicorn",
		"name": "W3C_Unicorn",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "W3C_Unicorn",
			"lit": "w3c_unicorn"
		},
		"docs": "https://validator.w3.org/services",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-physicalweb",
		"name": "Google-PhysicalWeb",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Google-PhysicalWeb",
			"lit": "google-physicalweb"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blackboard",
		"name": "Blackboard",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Blackboard",
			"lit": "blackboard"
		},
		"docs": "https://help.blackboard.com/Learn/Administrator/Hosting/Tools_Management/SafeAssign",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bazqux",
		"name": "BazQux",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "BazQux",
			"lit": "bazqux"
		},
		"docs": "https://bazqux.com/fetcher",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-twingly",
		"name": "Twingly",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Twingly",
			"lit": "twingly"
		},
		"docs": "https://twingly.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rivva",
		"name": "Rivva",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Rivva",
			"lit": "rivva"
		},
		"docs": "http://rivva.de",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-experibot",
		"name": "Experibot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Experibot",
			"lit": "experibot"
		},
		"docs": "https://amirkr.wixsite.com/experibot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-awesomecrawler",
		"name": "awesomecrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "awesomecrawler",
			"lit": "awesomecrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dataprovider-com",
		"name": "Dataprovider.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Dataprovider\\.com",
			"lit": "dataprovider.com"
		},
		"docs": "https://www.dataprovider.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-grouphigh",
		"name": "GroupHigh/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GroupHigh\\/",
			"lit": "grouphigh/"
		},
		"docs": "http://www.grouphigh.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-theoldreader-com",
		"name": "theoldreader.com",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "theoldreader\\.com",
			"lit": "theoldreader.com"
		},
		"docs": "https://www.theoldreader.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-anyevent",
		"name": "AnyEvent",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "AnyEvent",
			"lit": "anyevent"
		},
		"docs": "http://software.schmorp.de/pkg/AnyEvent.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-uptimebot-org",
		"name": "Uptimebot.org",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Uptimebot\\.org",
			"lit": "uptimebot.org"
		},
		"docs": "http://uptimebot.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-2ip-ru",
		"name": "2ip.ru",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "2ip\\.ru",
			"lit": "2ip.ru"
		},
		"docs": "https://2ip.ru/cms/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-clickagy",
		"name": "Clickagy",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Clickagy",
			"lit": "clickagy"
		},
		"docs": "https://www.clickagy.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-caliperbot",
		"name": "Caliperbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Caliperbot",
			"lit": "caliperbot"
		},
		"docs": "http://www.conductor.com/caliperbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mbcrawler",
		"name": "MBCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MBCrawler",
			"lit": "mbcrawler"
		},
		"docs": "https://monitorbacklinks.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-online-webceo-bot",
		"name": "online-webceo-bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "online-webceo-bot",
			"lit": "online-webceo-bot"
		},
		"docs": "http://online.webceo.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-b2b-bot",
		"name": "B2B Bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "B2B Bot",
			"lit": "b2b bot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hubspot",
		"name": "HubSpot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "HubSpot",
			"lit": "hubspot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-www-uptime-com",
		"name": "www.uptime.com",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "www\\.uptime\\.com",
			"lit": "www.uptime.com"
		},
		"docs": "http://www.uptime.com/uptimebot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-streamline3bot",
		"name": "Streamline3Bot/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Streamline3Bot\\/",
			"lit": "streamline3bot/"
		},
		"docs": "https://www.ubtsupport.com/legal/Streamline3Bot.php",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mixnodecache",
		"name": "MixnodeCache/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MixnodeCache\\/",
			"lit": "mixnodecache/"
		},
		"docs": "https://cache.mixnode.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-curl",
		"name": "curl",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "^curl",
			"lit": "curl"
		},
		"docs": "https://curl.haxx.se/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-simplescraper",
		"name": "SimpleScraper",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SimpleScraper",
			"lit": "simplescraper"
		},
		"docs": "https://github.com/ramonkcom/simple-scraper/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rssingbot",
		"name": "RSSingBot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "RSSingBot",
			"lit": "rssingbot"
		},
		"docs": "http://www.rssing.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jooblebot",
		"name": "Jooblebot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Jooblebot",
			"lit": "jooblebot"
		},
		"docs": "http://jooble.org/jooble-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fedoraplanet",
		"name": "fedoraplanet",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "fedoraplanet",
			"lit": "fedoraplanet"
		},
		"docs": "http://fedoraplanet.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-friendica",
		"name": "Friendica",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Friendica",
			"lit": "friendica"
		},
		"docs": "https://hoyer.xyz",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nextcloud",
		"name": "NextCloud",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "NextCloud",
			"lit": "nextcloud"
		},
		"docs": "https://nextcloud.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-regionstuttgartbot",
		"name": "RegionStuttgartBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RegionStuttgartBot",
			"lit": "regionstuttgartbot"
		},
		"docs": "http://it.region-stuttgart.de/competenzatlas/unternehmen-suchen/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-datanyze",
		"name": "Datanyze",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Datanyze",
			"lit": "datanyze"
		},
		"docs": "https://www.datanyze.com/dnyzbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-trendsmapresolver",
		"name": "TrendsmapResolver",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "TrendsmapResolver",
			"lit": "trendsmapresolver"
		},
		"docs": "https://www.trendsmap.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tweetedtimes",
		"name": "tweetedtimes",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "tweetedtimes",
			"lit": "tweetedtimes"
		},
		"docs": "https://tweetedtimes.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ntentbot",
		"name": "NTENTbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "NTENTbot",
			"lit": "ntentbot"
		},
		"docs": "https://ntent.com/ntentbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-simplepie",
		"name": "SimplePie",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "SimplePie",
			"lit": "simplepie"
		},
		"docs": "http://simplepie.org",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-searchatlas",
		"name": "SearchAtlas",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SearchAtlas",
			"lit": "searchatlas"
		},
		"docs": "http://SearchAtlas.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-superfeedr",
		"name": "Superfeedr",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Superfeedr",
			"lit": "superfeedr"
		},
		"docs": "http://superfeedr.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feedbot",
		"name": "feedbot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "feedbot",
			"lit": "feedbot"
		},
		"docs": "http://wp.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ut-dorkbot",
		"name": "UT-Dorkbot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "UT-Dorkbot",
			"lit": "ut-dorkbot"
		},
		"docs": "https://security.utexas.edu/dorkbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-amazonproductdiscovery",
		"name": "AmazonProductDiscovery",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "AmazonProductDiscovery",
			"lit": "amazonproductdiscovery"
		},
		"docs": "https://vendorcentral.amazon.com/support/amazonproductbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-amazonsellerinitiatedlisting",
		"name": "AmazonSellerInitiatedListing",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "AmazonSellerInitiatedListing",
			"lit": "amazonsellerinitiatedlisting"
		},
		"docs": "https://vendorcentral.amazon.com/support/amazonproductbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-serendeputybot",
		"name": "SerendeputyBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SerendeputyBot",
			"lit": "serendeputybot"
		},
		"docs": "http://serendeputy.com/about/serendeputy-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-eyeotabot",
		"name": "Eyeotabot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Eyeotabot",
			"lit": "eyeotabot"
		},
		"docs": "http://www.eyeota.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-officestorebot",
		"name": "officestorebot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "officestorebot",
			"lit": "officestorebot"
		},
		"docs": "https://aka.ms/officestorebot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-neticle-crawler",
		"name": "Neticle Crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Neticle Crawler",
			"lit": "neticle crawler"
		},
		"docs": "https://neticle.com/bot/en/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-surdotlybot",
		"name": "SurdotlyBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SurdotlyBot",
			"lit": "surdotlybot"
		},
		"docs": "http://sur.ly/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linkisbot",
		"name": "LinkisBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "LinkisBot",
			"lit": "linkisbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rytebot",
		"name": "RyteBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RyteBot",
			"lit": "rytebot"
		},
		"docs": "https://bot.ryte.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-freewebmonitoring-sitechecker",
		"name": "FreeWebMonitoring SiteChecker",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "FreeWebMonitoring SiteChecker",
			"lit": "freewebmonitoring sitechecker"
		},
		"docs": "https://www.freewebmonitoring.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-aspiegelbot",
		"name": "AspiegelBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "AspiegelBot",
			"lit": "aspiegelbot"
		},
		"docs": "https://aspiegel.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-naver-blog-rssbot",
		"name": "NAVER Blog Rssbot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "NAVER Blog Rssbot",
			"lit": "naver blog rssbot"
		},
		"docs": "http://www.naver.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zenback-bot",
		"name": "zenback bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "zenback bot",
			"lit": "zenback bot"
		},
		"docs": "http://corp.logly.co.jp/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-domains-project",
		"name": "Domains Project/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Domains Project\\/",
			"lit": "domains project/"
		},
		"docs": "https://github.com/tb0hdan/domains",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pandalytics",
		"name": "Pandalytics",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Pandalytics",
			"lit": "pandalytics"
		},
		"docs": "https://domainsbot.com/pandalytics/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vkrobot",
		"name": "VKRobot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "VKRobot",
			"lit": "vkrobot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bidswitchbot",
		"name": "bidswitchbot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "bidswitchbot",
			"lit": "bidswitchbot"
		},
		"docs": "https://www.bidswitch.com/about-us/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tigerbot",
		"name": "tigerbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "tigerbot",
			"lit": "tigerbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nixstatsbot",
		"name": "NIXStatsbot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "NIXStatsbot",
			"lit": "nixstatsbot"
		},
		"docs": "http://www.nixstats.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-atom-feed-robot",
		"name": "Atom Feed Robot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Atom Feed Robot",
			"lit": "atom feed robot"
		},
		"docs": "https://rssmicro.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cc-urebot",
		"name": "Cc urebot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "[Cc]urebot",
			"lit": "urebot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pagepeeker",
		"name": "PagePeeker/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PagePeeker\\/",
			"lit": "pagepeeker/"
		},
		"docs": "https://pagepeeker.com/robots/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vigil",
		"name": "Vigil/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Vigil\\/",
			"lit": "vigil/"
		},
		"docs": "http://vigil-app.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rssbot",
		"name": "rssbot/",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "rssbot\\/",
			"lit": "rssbot/"
		},
		"docs": "https://github.com/iovxw/rssbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-startmebot",
		"name": "startmebot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "startmebot\\/",
			"lit": "startmebot/"
		},
		"docs": "https://start.me/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jobboersebot",
		"name": "JobboerseBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "JobboerseBot",
			"lit": "jobboersebot"
		},
		"docs": "http://www.jobboerse.com/bot.htm",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seewithkids",
		"name": "seewithkids",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "seewithkids",
			"lit": "seewithkids"
		},
		"docs": "http://seewithkids.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ninja-bot",
		"name": "NINJA bot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "NINJA bot",
			"lit": "ninja bot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cutbot",
		"name": "Cutbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Cutbot",
			"lit": "cutbot"
		},
		"docs": "http://cutbot.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bublupbot",
		"name": "BublupBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BublupBot",
			"lit": "bublupbot"
		},
		"docs": "https://www.bublup.com/bublup-bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ridderbot",
		"name": "RidderBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RidderBot",
			"lit": "ridderbot"
		},
		"docs": "https://ridder.co/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-taboolabot",
		"name": "Taboolabot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Taboolabot",
			"lit": "taboolabot"
		},
		"docs": "http://www.taboola.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dubbotbot",
		"name": "Dubbotbot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Dubbotbot",
			"lit": "dubbotbot"
		},
		"docs": "http://dubbot.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-finditanswersbot",
		"name": "FindITAnswersbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "FindITAnswersbot",
			"lit": "finditanswersbot"
		},
		"docs": "http://search.it-influentials.com/bot.htm",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-infoobot",
		"name": "infoobot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "infoobot",
			"lit": "infoobot"
		},
		"docs": "https://www.infoo.nl/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-refindbot",
		"name": "Refindbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Refindbot",
			"lit": "refindbot"
		},
		"docs": "https://refind.com/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blogtraffic-d-d-feed-fetcher",
		"name": "BlogTraffic/d.d Feed-Fetcher",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "BlogTraffic\\/\\d\\.\\d+ Feed-Fetcher",
			"lit": " feed-fetcher"
		},
		"docs": "http://www.blogtraffic.de/rss-bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seobilitybot",
		"name": "SeobilityBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SeobilityBot",
			"lit": "seobilitybot"
		},
		"docs": "https://www.seobility.net/sites/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cincraw",
		"name": "Cincraw",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Cincraw",
			"lit": "cincraw"
		},
		"docs": "http://cincrawdata.net/bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bitbot",
		"name": "BitBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BitBot",
			"lit": "bitbot"
		},
		"docs": "https://bitbot.dev",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-certificates-bridge",
		"name": "Google-Certificates-Bridge",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Google-Certificates-Bridge",
			"lit": "google-certificates-bridge"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-viber",
		"name": "Viber",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Viber",
			"lit": "viber"
		},
		"docs": "https://www.viber.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-e-ventures-investment-crawler",
		"name": "e.ventures Investment Crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "e\\.ventures Investment Crawler",
			"lit": "e.ventures investment crawler"
		},
		"docs": "https://www.eventures.vc/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-evc-batch",
		"name": "evc-batch",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "evc-batch",
			"lit": "evc-batch"
		},
		"docs": "https://www.eventures.vc/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ptst",
		"name": "PTST/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "(^| )PTST\\/",
			"lit": "ptst/"
		},
		"docs": "https://www.webpagetest.org",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-minicrawler",
		"name": "minicrawler",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "minicrawler",
			"lit": "minicrawler"
		},
		"docs": "https://www.testomato.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cookiebot",
		"name": "Cookiebot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Cookiebot",
			"lit": "cookiebot"
		},
		"docs": "https://www.cookiebot.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-trovitbot",
		"name": "trovitBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "trovitBot",
			"lit": "trovitbot"
		},
		"docs": "http://www.trovit.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seostar-co",
		"name": "seostar.co",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "seostar\\.co",
			"lit": "seostar.co"
		},
		"docs": "https://seostar.co/robot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ioncrawl",
		"name": "IonCrawl",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "IonCrawl",
			"lit": "ioncrawl"
		},
		"docs": "https://www.ionos.de/terms-gtc/faq-crawler-en",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seekport",
		"name": "Seekport",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Seekport",
			"lit": "seekport"
		},
		"docs": "https://bot.seekport.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-criteobot",
		"name": "CriteoBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "CriteoBot",
			"lit": "criteobot"
		},
		"docs": "https://www.criteo.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-snap-url-preview-service",
		"name": "Snap URL Preview Service",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Snap URL Preview Service",
			"lit": "snap url preview service"
		},
		"docs": "https://snap.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ruxitsynthetic",
		"name": "RuxitSynthetic",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "RuxitSynthetic",
			"lit": "ruxitsynthetic"
		},
		"docs": "https://www.dynatrace.com/support/help/platform-modules/digital-experience/synthetic-monitoring/browser-monitors/configure-browser-monitors#expand--default-user-agent",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-valve-steam",
		"name": "Valve/Steam",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Valve\\/Steam",
			"lit": "valve/steam"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-odklbot",
		"name": "OdklBot/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "OdklBot\\/",
			"lit": "odklbot/"
		},
		"docs": "https://odnoklassniki.ru/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lightspeedsystemscrawler",
		"name": "LightspeedSystemsCrawler",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "LightspeedSystemsCrawler",
			"lit": "lightspeedsystemscrawler"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ev-crawler",
		"name": "ev-crawler/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ev-crawler\\/",
			"lit": "ev-crawler/"
		},
		"docs": "https://headline.com/legal/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bitsightbot",
		"name": "BitSightBot/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "BitSightBot\\/",
			"lit": "bitsightbot/"
		},
		"docs": "https://www.bitsight.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-woorankreview",
		"name": "woorankreview/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "woorankreview\\/",
			"lit": "woorankreview/"
		},
		"docs": "https://www.woorank.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-safety",
		"name": "Google-Safety",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Google-Safety",
			"lit": "google-safety"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-a-patent-crawler",
		"name": "A Patent Crawler",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "A Patent Crawler",
			"lit": "a patent crawler"
		},
		"docs": "http://scitas.epfl.ch/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-stractbot",
		"name": "StractBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "StractBot",
			"lit": "stractbot"
		},
		"docs": "https://trystract.com/webmasters",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-search-marginalia-nu",
		"name": "search.marginalia.nu",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "search\\.marginalia\\.nu",
			"lit": "search.marginalia.nu"
		},
		"docs": "https://search.marginalia.nu",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nicecrawler",
		"name": "Nicecrawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Nicecrawler",
			"lit": "nicecrawler"
		},
		"docs": "http://www.nicecrawler.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-neevabot",
		"name": "Neevabot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Neevabot",
			"lit": "neevabot"
		},
		"docs": "https://neeva.com/neevabot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-brightedge-crawler",
		"name": "BrightEdge Crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BrightEdge Crawler",
			"lit": "brightedge crawler"
		},
		"docs": "https://www.brightedge.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sitecheckerbotcrawler",
		"name": "SiteCheckerBotCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SiteCheckerBotCrawler",
			"lit": "sitecheckerbotcrawler"
		},
		"docs": "http://sitechecker.pro",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tombapublicwebcrawler",
		"name": "TombaPublicWebCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "TombaPublicWebCrawler",
			"lit": "tombapublicwebcrawler"
		},
		"docs": "https://tombascraper.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-crawlyprojectcrawler",
		"name": "CrawlyProjectCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "CrawlyProjectCrawler",
			"lit": "crawlyprojectcrawler"
		},
		"docs": "https://crawlyproject.digitaldragon.dev/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-komodiabot",
		"name": "KomodiaBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "KomodiaBot",
			"lit": "komodiabot"
		},
		"docs": "http://www.komodia.com/newwiki/index.php/URL_server_crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kstandbot",
		"name": "KStandBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "KStandBot",
			"lit": "kstandbot"
		},
		"docs": "http://url-classification.io",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cispa-webcrawler",
		"name": "CISPA Webcrawler",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "CISPA Webcrawler",
			"lit": "cispa webcrawler"
		},
		"docs": "https://vuln-notify-checker.cispa.saarland",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mtrobot",
		"name": "MTRobot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MTRobot",
			"lit": "mtrobot"
		},
		"docs": "https://metrics-tools.de/robot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hyscore-io",
		"name": "hyscore.io",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "hyscore\\.io",
			"lit": "hyscore.io"
		},
		"docs": "https://hyscore.io/crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-alexandriaorgbot",
		"name": "AlexandriaOrgBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "AlexandriaOrgBot",
			"lit": "alexandriaorgbot"
		},
		"docs": "https://www.alexandria.org/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-2ip-bot",
		"name": "2ip bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "2ip bot",
			"lit": "2ip bot"
		},
		"docs": "http://2ip.io",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seolizer",
		"name": "SEOlizer",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SEOlizer",
			"lit": "seolizer"
		},
		"docs": "https://www.seolizer.de/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vuhuvbot",
		"name": "vuhuvBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "vuhuvBot",
			"lit": "vuhuvbot"
		},
		"docs": "http://vuhuv.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-inetdex-bot",
		"name": "INETDEX-BOT",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "INETDEX-BOT",
			"lit": "inetdex-bot"
		},
		"docs": "https://inetdex.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-synapse",
		"name": "Synapse",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Synapse",
			"lit": "synapse"
		},
		"docs": "https://github.com/matrix-org/synapse",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-t3versionsbot",
		"name": "t3versionsBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "t3versionsBot",
			"lit": "t3versionsbot"
		},
		"docs": "https://www.t3versions.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-deepnoc",
		"name": "deepnoc",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "deepnoc",
			"lit": "deepnoc"
		},
		"docs": "https://deepnoc.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cocolyzebot",
		"name": "Cocolyzebot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Cocolyzebot",
			"lit": "cocolyzebot"
		},
		"docs": "https://cocolyze.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hypestat",
		"name": "hypestat",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "hypestat",
			"lit": "hypestat"
		},
		"docs": "https://hypestat.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-reverseengineeringbot",
		"name": "ReverseEngineeringBot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "ReverseEngineeringBot",
			"lit": "reverseengineeringbot"
		},
		"docs": "https://torus.company/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sempi-tech",
		"name": "sempi.tech",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "sempi\\.tech",
			"lit": "sempi.tech"
		},
		"docs": "http://sempi.tech/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-metainspector",
		"name": "MetaInspector",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MetaInspector",
			"lit": "metainspector"
		},
		"docs": "https://github.com/jaimeiniesta/metainspector",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-l9explore",
		"name": "l9explore",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "l9explore",
			"lit": "l9explore"
		},
		"docs": "https://github.com/LeakIX/l9explore",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-python-opengraph",
		"name": "python-opengraph",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "python-opengraph",
			"lit": "python-opengraph"
		},
		"docs": "https://github.com/jaywink/python-opengraph",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-opengraphcheck",
		"name": "OpenGraphCheck",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "OpenGraphCheck",
			"lit": "opengraphcheck"
		},
		"docs": "https://opengraphcheck.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-developers-google-com-web-snippet",
		"name": "developers.google.com/ /web/snippet",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "developers\\.google\\.com\\/\\+\\/web\\/snippet",
			"lit": "developers.google.com/+/web/snippet"
		},
		"docs": "https://developers.google.com/+/web/snippet",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-senutobot",
		"name": "SenutoBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SenutoBot",
			"lit": "senutobot"
		},
		"docs": "https://www.senuto.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-macocu",
		"name": "MaCoCu",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "MaCoCu",
			"lit": "macocu"
		},
		"docs": "https://www.clarin.si/info/macocu-massive-collection-and-curation-of-monolingual-and-bilingual-data",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netsystemsresearch",
		"name": "NetSystemsResearch",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "NetSystemsResearch",
			"lit": "netsystemsresearch"
		},
		"docs": "http://netsystemsresearch.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pagething",
		"name": "PageThing",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PageThing",
			"lit": "pagething"
		},
		"docs": "http://pagething.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wordpress",
		"name": "WordPress/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WordPress\\/",
			"lit": "wordpress/"
		},
		"docs": "https://wordpress.org",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-phxbot",
		"name": "PhxBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "PhxBot",
			"lit": "phxbot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-internetmeasurement",
		"name": "InternetMeasurement",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "InternetMeasurement",
			"lit": "internetmeasurement"
		},
		"docs": "https://internet-measurement.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bw",
		"name": "BW/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "^BW\\/",
			"lit": "bw/"
		},
		"docs": "https://builtwith.com/biup",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-geedobot",
		"name": "GeedoBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "GeedoBot",
			"lit": "geedobot"
		},
		"docs": "http://www.geedo.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-audisto-crawler",
		"name": "Audisto Crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Audisto Crawler",
			"lit": "audisto crawler"
		},
		"docs": "https://audisto.com/help/crawler/bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-monsidobot",
		"name": "Monsidobot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Monsidobot",
			"lit": "monsidobot"
		},
		"docs": "http://monsido.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-groupmebot",
		"name": "GroupMeBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "GroupMeBot",
			"lit": "groupmebot"
		},
		"docs": "https://groupme.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vercelbot",
		"name": "Vercelbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Vercelbot",
			"lit": "vercelbot"
		},
		"docs": "https://github.com/vercel/vercel/discussions/5095#discussioncomment-58705",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vercel-screenshot",
		"name": "vercel-screenshot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "vercel-screenshot",
			"lit": "vercel-screenshot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-academicbotrtu",
		"name": "AcademicBotRTU",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "AcademicBotRTU",
			"lit": "academicbotrtu"
		},
		"docs": "https://academicbot.rtu.lv",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-keybasebot",
		"name": "KeybaseBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "KeybaseBot",
			"lit": "keybasebot"
		},
		"docs": "https://book.keybase.io/docs/chat/link-previews",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lemmy",
		"name": "Lemmy",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Lemmy",
			"lit": "lemmy"
		},
		"docs": "https://leminal.space",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cookiehubscan",
		"name": "CookieHubScan",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "CookieHubScan",
			"lit": "cookiehubscan"
		},
		"docs": "https://www.cookiehub.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hydrozen-io",
		"name": "Hydrozen.io",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Hydrozen\\.io",
			"lit": "hydrozen.io"
		},
		"docs": "https://docs.hydrozen.io/overview/misc/user-agent-and-ip-list",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-http-banner-detection",
		"name": "HTTP Banner Detection",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "HTTP Banner Detection",
			"lit": "http banner detection"
		},
		"docs": "https://security.ipip.net",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-summalybot",
		"name": "SummalyBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "SummalyBot",
			"lit": "summalybot"
		},
		"docs": "https://github.com/misskey-dev/summaly",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-geedoproductsearch",
		"name": "GeedoProductSearch",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "GeedoProductSearch",
			"lit": "geedoproductsearch"
		},
		"docs": "http://www.geedo.com/product-search.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-oncrawl",
		"name": "OnCrawl/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "OnCrawl\\/",
			"lit": "oncrawl/"
		},
		"docs": "http://www.oncrawl.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sindresorhus-got",
		"name": "sindresorhus/got",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "sindresorhus\\/got",
			"lit": "sindresorhus/got"
		},
		"docs": "https://github.com/sindresorhus/got",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sitebulb",
		"name": "sitebulb",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "sitebulb",
			"lit": "sitebulb"
		},
		"docs": "https://sitebulb.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-ads-conversions",
		"name": "Google-Ads-Conversions",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Google-Ads-Conversions",
			"lit": "google-ads-conversions"
		},
		"docs": "https://developers.google.com/google-ads/api/docs/conversions/upload-online",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-observepoint",
		"name": "ObservePoint",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "ObservePoint",
			"lit": "observepoint"
		},
		"docs": "https://help.observepoint.com/en/articles/9101465-allow-exclude-observepoint-traffic#h_2a8176c9b9",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-alittle-client",
		"name": "ALittle Client",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "ALittle Client",
			"lit": "alittle client"
		},
		"docs": "https://udger.com/resources/ua-list/bot-detail?bot=ALittle+Client",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-aliyunsecbot",
		"name": "AliyunSecBot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "AliyunSecBot",
			"lit": "aliyunsecbot"
		},
		"docs": "https://service.alibaba.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-serankingbacklinksbot",
		"name": "SERankingBacklinksBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SERankingBacklinksBot",
			"lit": "serankingbacklinksbot"
		},
		"docs": "https://seranking.com/backlinks-crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cmschecker",
		"name": "CMSChecker",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "CMSChecker",
			"lit": "cmschecker"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-playwright",
		"name": "Playwright",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Playwright",
			"lit": "playwright"
		},
		"docs": "https://playwright.dev",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-selenium",
		"name": "Selenium",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Selenium",
			"lit": "selenium"
		},
		"docs": "https://www.selenium.dev",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zmeu",
		"name": "ZmEu",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "ZmEu",
			"lit": "zmeu"
		},
		"docs": "https://en.wikipedia.org/wiki/ZmEu_(vulnerability_scanner)",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-aa-cunetix",
		"name": "aA cunetix",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "[aA]cunetix",
			"lit": "cunetix"
		},
		"docs": "https://www.acunetix.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nessus",
		"name": "Nessus",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Nessus",
			"lit": "nessus"
		},
		"docs": "https://www.tenable.com/products/nessus",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dd-ir-bb-uster",
		"name": "dD ir Bb uster",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "[dD]ir[Bb]uster",
			"lit": "uster"
		},
		"docs": "https://github.com/KajanM/DirBuster",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-colly",
		"name": "colly",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "colly",
			"lit": "colly"
		},
		"docs": "https://go-colly.org",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mm-echanize",
		"name": "mM echanize",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "[mM]echanize",
			"lit": "echanize"
		},
		"docs": "https://github.com/sparklemotion/mechanize",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-air-ai-scanning",
		"name": "air.ai/scanning",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "air\\.ai\\/scanning",
			"lit": "air.ai/scanning"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-asnriskscorer",
		"name": "asnriskscorer",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "asnriskscorer",
			"lit": "asnriskscorer"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-oicrawler",
		"name": "OICrawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "OICrawler",
			"lit": "oicrawler"
		},
		"docs": "https://openindex.ai",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-l9scan",
		"name": "l9scan",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "l9scan",
			"lit": "l9scan"
		},
		"docs": "https://github.com/LeakIX/l9scan",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-slaccalebot",
		"name": "SlaccaleBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SlaccaleBot",
			"lit": "slaccalebot"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-customasynchttpclient",
		"name": "CustomAsyncHttpClient",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "CustomAsyncHttpClient",
			"lit": "customasynchttpclient"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-httpie",
		"name": "HTTPie/",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "^HTTPie\\/",
			"lit": "httpie/"
		},
		"docs": "https://httpie.io",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-perplexityuser",
		"name": "PerplexityUser",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "PerplexityUser",
			"lit": "perplexityuser"
		},
		"docs": "https://perplexity.ai",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webzio",
		"name": "webzio",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "webzio",
			"lit": "webzio"
		},
		"docs": "https://webz.io/blog/company/from-omgilibot-to-the-webzbot-duo-a-powerful-leap-for-ethical-and-comprehensive-data-collection/#",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-arenaunfurlbot",
		"name": "ArenaUnfurlBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "^ArenaUnfurlBot",
			"lit": "arenaunfurlbot"
		},
		"docs": "https://arena.ai/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-a360-search",
		"name": "A360-Search",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "A360-Search",
			"lit": "a360-search"
		},
		"docs": "https://area360.uk/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-aasa-bot",
		"name": "AASA-Bot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "AASA-Bot",
			"lit": "aasa-bot"
		},
		"docs": "https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-accessstatus",
		"name": "AccessStatus",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "AccessStatus",
			"lit": "accessstatus"
		},
		"docs": "https://accesslink.fr/page/a-propos-de-accessstatus/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-acquia-optimize",
		"name": "Acquia optimize",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Acquia optimize",
			"lit": "acquia optimize"
		},
		"docs": "https://knownagents.com/agents/acquia-optimize-monsido",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-activecomply",
		"name": "ActiveComply",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "ActiveComply",
			"lit": "activecomply"
		},
		"docs": "https://knownagents.com/agents/activecomply-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adkerneltopiccrawler",
		"name": "AdkernelTopicCrawler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "AdkernelTopicCrawler",
			"lit": "adkerneltopiccrawler"
		},
		"docs": "http://adkernel.com/robot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-alertsite",
		"name": "AlertSite",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "AlertSite",
			"lit": "alertsite"
		},
		"docs": "https://smartbear.com/product/alertsite/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-allafrica",
		"name": "AllAfrica",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "AllAfrica",
			"lit": "allafrica"
		},
		"docs": "https://allafrica.com/misc/info/about/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-amazing-searchbot",
		"name": "Amazing-SearchBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Amazing-SearchBot",
			"lit": "amazing-searchbot"
		},
		"docs": "https://amazing.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-amazon-bedrock-agentcore-browser",
		"name": "Amazon-Bedrock-AgentCore-Browser",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Amazon-Bedrock-AgentCore-Browser",
			"lit": "amazon-bedrock-agentcore-browser"
		},
		"docs": "https://docs.aws.amazon.com/bedrock-agentcore/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-anchor-browser",
		"name": "Anchor Browser",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Anchor Browser",
			"lit": "anchor browser"
		},
		"docs": "https://knownagents.com/agents/anchor-browser",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ap3a-240617-008",
		"name": "AP3A.240617.008",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "AP3A\\.240617\\.008",
			"lit": "ap3a.240617.008"
		},
		"docs": "https://knownagents.com/agents/008",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-archive-it",
		"name": "Archive-It",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "Archive-It",
			"lit": "archive-it"
		},
		"docs": "http://archive-it.org/files/site-owners-special.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-artemis-web-reader",
		"name": "artemis web reader",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "artemis web reader",
			"lit": "artemis web reader"
		},
		"docs": "https://artemis.jamesg.blog/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-attracta",
		"name": "Attracta",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Attracta",
			"lit": "attracta"
		},
		"docs": "https://attracta.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-audigentadbot",
		"name": "AudigentAdBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "AudigentAdBot",
			"lit": "audigentadbot"
		},
		"docs": "http://audigent.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-authory",
		"name": "Authory",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "Authory",
			"lit": "authory"
		},
		"docs": "https://authory.com/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-automaton-newsify-feed-fetcher",
		"name": "Automaton Newsify Feed Fetcher",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Automaton|Newsify Feed Fetcher"
		},
		"docs": "https://knownagents.com/agents/automaton",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bestchange",
		"name": "BestChange",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "BestChange",
			"lit": "bestchange"
		},
		"docs": "https://bestchange.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bl-uk-lddc-bot",
		"name": "bl.uk_lddc_bot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "bl\\.uk_lddc_bot",
			"lit": "bl.uk_lddc_bot"
		},
		"docs": "https://bl.uk/legal-deposit-web-archiving",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blingerp",
		"name": "BlingERP",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "BlingERP",
			"lit": "blingerp"
		},
		"docs": "https://bling.com.br/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blockaid",
		"name": "Blockaid",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Blockaid",
			"lit": "blockaid"
		},
		"docs": "https://knownagents.com/agents/blockaid",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bloglines",
		"name": "Bloglines",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Bloglines",
			"lit": "bloglines"
		},
		"docs": "http://bloglines.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blogvault",
		"name": "BlogVault",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "BlogVault",
			"lit": "blogvault"
		},
		"docs": "https://blogvault.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bluesky-domain-status-classifier",
		"name": "bluesky-domain-status-classifier",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "bluesky-domain-status-classifier",
			"lit": "bluesky-domain-status-classifier"
		},
		"docs": "https://blueskyweb.xyz/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bluesky",
		"name": "Bluesky/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Bluesky\\/",
			"lit": "bluesky/"
		},
		"docs": "https://knownagents.com/agents/bluesky-link-preview-service",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bne-es-bot",
		"name": "bne.es_bot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "bne\\.es_bot",
			"lit": "bne.es_bot"
		},
		"docs": "https://bne.es/es/colecciones/archivo-web-espanola/aviso-webmasters",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-browserbot-observer",
		"name": "BrowserBot-Observer",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "BrowserBot-Observer",
			"lit": "browserbot-observer"
		},
		"docs": "https://obsrvr.net/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bufferlinkpreviewbot",
		"name": "BufferLinkPreviewBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "BufferLinkPreviewBot",
			"lit": "bufferlinkpreviewbot"
		},
		"docs": "https://scraper.buffer.com/about/bots/link-preview-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bugsnag",
		"name": "Bugsnag",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Bugsnag",
			"lit": "bugsnag"
		},
		"docs": "https://knownagents.com/agents/bugsnag-script-fetcher",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-buttondown",
		"name": "Buttondown",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Buttondown",
			"lit": "buttondown"
		},
		"docs": "https://buttondown.email/features",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-capitalonebot",
		"name": "CapitalOneBot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "CapitalOneBot",
			"lit": "capitalonebot"
		},
		"docs": "https://developer.capitalone.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-certchief",
		"name": "CertChief",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "CertChief",
			"lit": "certchief"
		},
		"docs": "https://cert.chief.app/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-channable",
		"name": "channable",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "channable",
			"lit": "channable"
		},
		"docs": "https://channable.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-chirp-gotosocial",
		"name": "Chirp gotosocial",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Chirp|gotosocial"
		},
		"docs": "http://binarycanary.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-clickuplinkunfurler",
		"name": "ClickUpLinkUnfurler",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "ClickUpLinkUnfurler",
			"lit": "clickuplinkunfurler"
		},
		"docs": "https://clickup.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-custom-hostname-verification",
		"name": "Cloudflare-Custom-Hostname-Verification",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Cloudflare-Custom-Hostname-Verification",
			"lit": "cloudflare-custom-hostname-verification"
		},
		"docs": "https://knownagents.com/agents/cloudflare-custom-hostname-verification",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-stream-webhook",
		"name": "Cloudflare-Stream-Webhook",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Cloudflare-Stream-Webhook",
			"lit": "cloudflare-stream-webhook"
		},
		"docs": "https://knownagents.com/agents/cloudflare-stream-webhook",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflareradarurlscanner",
		"name": "CloudflareRadarURLScanner",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "CloudflareRadarURLScanner",
			"lit": "cloudflareradarurlscanner"
		},
		"docs": "https://knownagents.com/agents/cloudflare-radar-url-scanner",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudtrellis",
		"name": "Cloudtrellis",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Cloudtrellis",
			"lit": "cloudtrellis"
		},
		"docs": "https://cloudtrellis.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cc-ludo",
		"name": "cC ludo",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "[cC]ludo",
			"lit": "ludo"
		},
		"docs": "https://knownagents.com/agents/cludo",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-collapsify",
		"name": "Collapsify",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Collapsify",
			"lit": "collapsify"
		},
		"docs": "https://developers.cloudflare.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-contextualbot-ss-outcomes-net",
		"name": "ContextualBot sS outcomes.net",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "ContextualBot[\\s\\S]*outcomes\\.net",
			"lit": "contextualbot"
		},
		"docs": "http://outcomes.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-convermax",
		"name": "Convermax",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Convermax",
			"lit": "convermax"
		},
		"docs": "https://docs.convermax.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cookie-maestro",
		"name": "cookie-maestro",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "cookie-maestro",
			"lit": "cookie-maestro"
		},
		"docs": "https://cookiemaestro.com/documentatie/limit-cookie-maestro-using-robots-txt",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cookiehubverify",
		"name": "CookieHubVerify",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "CookieHubVerify",
			"lit": "cookiehubverify"
		},
		"docs": "https://cookiehub.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cookieyesbot",
		"name": "CookieYesbot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "CookieYesbot",
			"lit": "cookieyesbot"
		},
		"docs": "http://cookieyes.com/documentation/cookieyesbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-crazy-egg",
		"name": "Crazy Egg",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Crazy Egg",
			"lit": "crazy egg"
		},
		"docs": "https://knownagents.com/agents/crazy-egg",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-current-ss-rss-reader",
		"name": "Current sS RSS Reader",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Current[\\s\\S]*RSS Reader",
			"lit": "rss reader"
		},
		"docs": "https://currentreader.app/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cypex-ai-scanning",
		"name": "cypex.ai/scanning",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "cypex\\.ai\\/scanning",
			"lit": "cypex.ai/scanning"
		},
		"docs": "https://cypex.ai/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-deepcrawl",
		"name": "DeepCrawl",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "DeepCrawl",
			"lit": "deepcrawl"
		},
		"docs": "https://lumar.io/spdr/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-digicert-dcv",
		"name": "DigiCert DCV",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "DigiCert DCV",
			"lit": "digicert dcv"
		},
		"docs": "https://digicert.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dlvr-it",
		"name": "dlvr.it",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "dlvr\\.it",
			"lit": "dlvr.it"
		},
		"docs": "http://dlvr.it/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dotcom-monitor",
		"name": "Dotcom-Monitor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Dotcom-Monitor",
			"lit": "dotcom-monitor"
		},
		"docs": "https://knownagents.com/agents/doctom-monitor",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-drataautopilot",
		"name": "DrataAutopilot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "DrataAutopilot",
			"lit": "drataautopilot"
		},
		"docs": "https://knownagents.com/agents/drata-autopilot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dreamhost-data-team",
		"name": "DreamHost Data Team",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "DreamHost Data Team",
			"lit": "dreamhost data team"
		},
		"docs": "http://dreamhost.com/support/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ds9",
		"name": "ds9",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "ds9",
			"lit": "ds9"
		},
		"docs": "https://data.dss.sps.copyright.com/docs/user_agent.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dvbot",
		"name": "DVbot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": " DVbot",
			"lit": " dvbot"
		},
		"docs": "http://doubleverify.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ecovadissustainabilitybot",
		"name": "EcoVadisSustainabilityBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "EcoVadisSustainabilityBot",
			"lit": "ecovadissustainabilitybot"
		},
		"docs": "https://ecovadis.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-elmah-io-uptime-monitoring",
		"name": "elmah.io Uptime Monitoring",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "elmah\\.io Uptime Monitoring",
			"lit": "elmah.io uptime monitoring"
		},
		"docs": "https://knownagents.com/agents/elmah-io-uptime-monitoring",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-evernoterichlinkbot",
		"name": "EvernoteRichLinkBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "EvernoteRichLinkBot",
			"lit": "evernoterichlinkbot"
		},
		"docs": "https://evernote.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ezlynx",
		"name": "EzLynx",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "EzLynx",
			"lit": "ezlynx"
		},
		"docs": "http://ezoic.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ezoicbot",
		"name": "EzoicBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "EzoicBot",
			"lit": "ezoicbot"
		},
		"docs": "https://ezoic.com/bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fastdast",
		"name": "FastDAST",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "FastDAST",
			"lit": "fastdast"
		},
		"docs": "https://knownagents.com/agents/black-duck-fast-dynamic",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feeder",
		"name": "Feeder /",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Feeder \\/",
			"lit": "feeder /"
		},
		"docs": "https://knownagents.com/agents/feeder",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feedflow",
		"name": "FeedFlow",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "FeedFlow",
			"lit": "feedflow"
		},
		"docs": "https://feedflow.dev/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-findfiles-net",
		"name": "FindFiles.net",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "FindFiles\\.net",
			"lit": "findfiles.net"
		},
		"docs": "https://findfiles.net/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fyndsearchengine-crawler",
		"name": "FyndSearchEngine-Crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "FyndSearchEngine-Crawler",
			"lit": "fyndsearchengine-crawler"
		},
		"docs": "https://fynd.bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fyndsearchengine-recrawler",
		"name": "FyndSearchEngine-ReCrawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "FyndSearchEngine-ReCrawler",
			"lit": "fyndsearchengine-recrawler"
		},
		"docs": "https://fynd.bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-goodreads",
		"name": "Goodreads",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Goodreads",
			"lit": "goodreads"
		},
		"docs": "https://goodreads.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-trust-services",
		"name": "Google Trust Services",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Google Trust Services",
			"lit": "google trust services"
		},
		"docs": "https://knownagents.com/agents/google-trust-services-dcv-check",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-greppr-web-crawler",
		"name": "Greppr Web Crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Greppr Web Crawler",
			"lit": "greppr web crawler"
		},
		"docs": "https://greppr.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hardenize",
		"name": "Hardenize",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Hardenize",
			"lit": "hardenize"
		},
		"docs": "https://hardenize.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-honeybadgerbot",
		"name": "HoneybadgerBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "HoneybadgerBot",
			"lit": "honeybadgerbot"
		},
		"docs": "https://knownagents.com/agents/honeybadgerbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-iboubot",
		"name": "IbouBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "IbouBot",
			"lit": "iboubot"
		},
		"docs": "https://ibou.io/iboubot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-innologica",
		"name": "Innologica",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Innologica",
			"lit": "innologica"
		},
		"docs": "https://knownagents.com/agents/innologica",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-known-agent",
		"name": "Known Agent",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Known Agent",
			"lit": "known agent"
		},
		"docs": "https://knownagents.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-krawlerbot",
		"name": "KrawlerBot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "KrawlerBot",
			"lit": "krawlerbot"
		},
		"docs": "https://krawler.app/robot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linkcheckerbot",
		"name": "LinkCheckerBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "LinkCheckerBot",
			"lit": "linkcheckerbot"
		},
		"docs": "https://knownagents.com/agents/linkchecker-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lmarenaunfurlbot",
		"name": "LMArenaUnfurlBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "LMArenaUnfurlBot",
			"lit": "lmarenaunfurlbot"
		},
		"docs": "https://lmarena.ai/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lyonl-asset-proxy",
		"name": "lyonl-asset-proxy",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "lyonl-asset-proxy",
			"lit": "lyonl-asset-proxy"
		},
		"docs": "https://lyonl.com/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lyonl-crawler",
		"name": "lyonl-crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "lyonl-crawler",
			"lit": "lyonl-crawler"
		},
		"docs": "https://lyonl.com/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-magibot",
		"name": "MagiBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "MagiBot",
			"lit": "magibot"
		},
		"docs": "https://magi.com/bots",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-magpierss",
		"name": "MagpieRSS",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "MagpieRSS",
			"lit": "magpierss"
		},
		"docs": "http://magpierss.sf.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mail-ru",
		"name": "mail.ru",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "mail\\.ru",
			"lit": "mail.ru"
		},
		"docs": "https://knownagents.com/agents/mailrubot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mailchimp",
		"name": "MailChimp",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "MailChimp",
			"lit": "mailchimp"
		},
		"docs": "http://mailchimp.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mcontextualbot",
		"name": "McontextualBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "McontextualBot",
			"lit": "mcontextualbot"
		},
		"docs": "http://mcontextual.net/mcontextual-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mediumbot-metatagfetcher",
		"name": "Mediumbot-MetaTagFetcher",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Mediumbot-MetaTagFetcher",
			"lit": "mediumbot-metatagfetcher"
		},
		"docs": "https://medium.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-metaiab-facebook",
		"name": "MetaIAB Facebook",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "MetaIAB Facebook",
			"lit": "metaiab facebook"
		},
		"docs": "https://knownagents.com/agents/facebook",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mixrankbot",
		"name": "MixrankBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "MixrankBot",
			"lit": "mixrankbot"
		},
		"docs": "https://knownagents.com/agents/mixrankbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-modernizebot",
		"name": "ModernizeBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ModernizeBot",
			"lit": "modernizebot"
		},
		"docs": "https://modernizeyourwebsite.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-montasticmonitor",
		"name": "MontasticMonitor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "MontasticMonitor",
			"lit": "montasticmonitor"
		},
		"docs": "https://knownagents.com/agents/montasticmonitor",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nanointeractive",
		"name": "NanoInteractive",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "NanoInteractive",
			"lit": "nanointeractive"
		},
		"docs": "https://nanointeractive.com/crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nestdaddybot",
		"name": "NestDaddybot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "NestDaddybot",
			"lit": "nestdaddybot"
		},
		"docs": "https://nestdaddy.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netseer-crawler",
		"name": "NetSeer crawler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "NetSeer crawler",
			"lit": "netseer crawler"
		},
		"docs": "http://netseer.com/crawler.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netumo-netumo",
		"name": "Netumo netumo",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Netumo|netumo"
		},
		"docs": "https://docs.netumo.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-newrelicsynthetics",
		"name": "NewRelicSynthetics",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "NewRelicSynthetics",
			"lit": "newrelicsynthetics"
		},
		"docs": "https://knownagents.com/agents/new-relic",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-newsroom-bi",
		"name": "NewsRoom.BI",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "NewsRoom\\.BI",
			"lit": "newsroom.bi"
		},
		"docs": "http://newsroom.bi/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nitro",
		"name": "Nitro-",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Nitro-",
			"lit": "nitro-"
		},
		"docs": "https://knownagents.com/agents/nitro",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nitrobot",
		"name": "NitroBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "NitroBot",
			"lit": "nitrobot"
		},
		"docs": "https://knownagents.com/agents/nitrobot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-noibu",
		"name": "Noibu",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Noibu",
			"lit": "noibu"
		},
		"docs": "https://noibu.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nostocrawlerbot",
		"name": "NostoCrawlerBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "NostoCrawlerBot",
			"lit": "nostocrawlerbot"
		},
		"docs": "http://my.nosto.com/tagging",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-onetrust",
		"name": "OneTrust",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "OneTrust",
			"lit": "onetrust"
		},
		"docs": "https://knownagents.com/agents/onetrust-cmp-scanner",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-owler",
		"name": ";Owler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": ";Owler",
			"lit": ";owler"
		},
		"docs": "https://knownagents.com/agents/owler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-parselysharesbot",
		"name": "ParselySharesBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "ParselySharesBot",
			"lit": "parselysharesbot"
		},
		"docs": "https://docs.parse.ly/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-podchaserparser",
		"name": "PodchaserParser",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "PodchaserParser",
			"lit": "podchaserparser"
		},
		"docs": "https://podchaser.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-podimo",
		"name": "Podimo",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Podimo",
			"lit": "podimo"
		},
		"docs": "https://podimo.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-productsup-io-crawler",
		"name": "productsup.io/crawler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "productsup\\.io\\/crawler",
			"lit": "productsup.io/crawler"
		},
		"docs": "https://help.productsup.com/en/29437-29446-import-data-by-crawling-your-website.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-qcbot",
		"name": "qcbot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "qcbot",
			"lit": "qcbot"
		},
		"docs": "http://quic.cloud/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-qualys",
		"name": "Qualys",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Qualys",
			"lit": "qualys"
		},
		"docs": "https://knownagents.com/agents/qualys",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-quora-bot",
		"name": "Quora-Bot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Quora-Bot",
			"lit": "quora-bot"
		},
		"docs": "http://quora.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-qwarrybot",
		"name": "Qwarrybot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Qwarrybot",
			"lit": "qwarrybot"
		},
		"docs": "http://qwarry.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rsiteauditor",
		"name": "RSiteAuditor",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RSiteAuditor",
			"lit": "rsiteauditor"
		},
		"docs": "https://dataforseo.com/apis/on-page-api",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rss-social",
		"name": "RSS.Social",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "RSS\\.Social",
			"lit": "rss.social"
		},
		"docs": "https://rss.social/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-salesforce-com",
		"name": "Salesforce.com",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Salesforce\\.com",
			"lit": "salesforce.com"
		},
		"docs": "https://knownagents.com/agents/sfdc-callout",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scope3",
		"name": "Scope3",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Scope3",
			"lit": "scope3"
		},
		"docs": "https://docs.scope3.com/docs/scope3-crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scraping-nytimes-com",
		"name": "scraping@nytimes.com",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "scraping@nytimes\\.com",
			"lit": "scraping@nytimes.com"
		},
		"docs": "https://github.com/nytimes",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scrubby",
		"name": "Scrubby",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Scrubby",
			"lit": "scrubby"
		},
		"docs": "http://scrubtheweb.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scrunchbot",
		"name": "Scrunchbot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Scrunchbot",
			"lit": "scrunchbot"
		},
		"docs": "https://scrunchai.com/bots",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seo4ajax-com",
		"name": "seo4ajax.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "seo4ajax\\.com",
			"lit": "seo4ajax.com"
		},
		"docs": "https://seo4ajax.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sequelwp",
		"name": "SequelWP",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "SequelWP",
			"lit": "sequelwp"
		},
		"docs": "https://sequelwp.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-serverdensity",
		"name": "ServerDensity",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "ServerDensity",
			"lit": "serverdensity"
		},
		"docs": "https://knownagents.com/agents/server-density",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-shortpixel",
		"name": "ShortPixel",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "ShortPixel",
			"lit": "shortpixel"
		},
		"docs": "https://shortpixel.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-silktide",
		"name": "Silktide",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Silktide",
			"lit": "silktide"
		},
		"docs": "https://silktide.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sitelock",
		"name": "SiteLock",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "SiteLock",
			"lit": "sitelock"
		},
		"docs": "https://knownagents.com/agents/sitelock",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-smarshbot",
		"name": "SmarshBot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "SmarshBot",
			"lit": "smarshbot"
		},
		"docs": "https://smarsh.com/platform/compliance-management/web-archive",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-smtnetpmbot",
		"name": "SMTnetPMBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "SMTnetPMBot",
			"lit": "smtnetpmbot"
		},
		"docs": "https://smtnet.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-software-security-research",
		"name": "Software-Security-Research",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Software-Security-Research",
			"lit": "software-security-research"
		},
		"docs": "https://reverse-proxies-measurements.softsec.ruhr-uni-bochum.de/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sottopopnone",
		"name": "SottopopNone",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "SottopopNone",
			"lit": "sottopopnone"
		},
		"docs": "https://upcontent.com/robots",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-splunk",
		"name": "Splunk",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Splunk",
			"lit": "splunk"
		},
		"docs": "https://knownagents.com/agents/splunk",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-stepstonecrawlbot",
		"name": "stepstoneCrawlBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "stepstoneCrawlBot",
			"lit": "stepstonecrawlbot"
		},
		"docs": "https://thestepstonegroup.com/crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-thousandeyes",
		"name": "ThousandEyes",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "ThousandEyes",
			"lit": "thousandeyes"
		},
		"docs": "https://knownagents.com/agents/thousand-eyes-cloud-agent",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-uipbot",
		"name": "uipbot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "uipbot",
			"lit": "uipbot"
		},
		"docs": "https://knownagents.com/agents/uipbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-um-fc",
		"name": "um-FC",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "um-FC",
			"lit": "um-fc"
		},
		"docs": "https://ubermetrics-technologies.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-um-ic",
		"name": "um-IC",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "um-IC",
			"lit": "um-ic"
		},
		"docs": "https://ubermetrics-technologies.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-uptimestatistics",
		"name": "UptimeStatistics",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "UptimeStatistics",
			"lit": "uptimestatistics"
		},
		"docs": "https://knownagents.com/agents/uptimestatistics",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-visionheight-com-scan",
		"name": "visionheight.com/scan",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "visionheight\\.com\\/scan",
			"lit": "visionheight.com/scan"
		},
		"docs": "https://knownagents.com/agents/visionheight-comscan",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-watchbot-monitoring-robot",
		"name": "Watchbot monitoring robot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Watchbot monitoring robot",
			"lit": "watchbot monitoring robot"
		},
		"docs": "https://watchbot.fflow.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-watchful",
		"name": "Watchful",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Watchful",
			"lit": "watchful"
		},
		"docs": "https://knownagents.com/agents/watchful",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-weborama-fetcher",
		"name": "weborama-fetcher",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "weborama-fetcher",
			"lit": "weborama-fetcher"
		},
		"docs": "http://weborama.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wepchsearchengine",
		"name": "WepchSearchEngine",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "WepchSearchEngine",
			"lit": "wepchsearchengine"
		},
		"docs": "https://wepch.com/search-engine",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wknd-bot",
		"name": "wknd-bot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "wknd-bot",
			"lit": "wknd-bot"
		},
		"docs": "https://developer.wunderkind.co/docs/server-side-tracking-implementation",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wpmu-dev-hub",
		"name": "WPMU DEV Hub",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WPMU DEV Hub",
			"lit": "wpmu dev hub"
		},
		"docs": "https://wpmudev.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wtotem",
		"name": "WTotem",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "WTotem",
			"lit": "wtotem"
		},
		"docs": "https://knownagents.com/agents/wtotem",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-xovionpagecrawler",
		"name": "XoviOnpageCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "XoviOnpageCrawler",
			"lit": "xovionpagecrawler"
		},
		"docs": "http://xovi.de/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zoominfo",
		"name": "ZoomInfo-",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "ZoomInfo-",
			"lit": "zoominfo-"
		},
		"docs": "https://knownagents.com/agents/zoominfo",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-7siters",
		"name": "7Siters",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "7Siters",
			"lit": "7siters"
		},
		"docs": "https://7ooo.ru/siters/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-accessible-web-bot",
		"name": "Accessible Web Bot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Accessible Web Bot",
			"lit": "accessible web bot"
		},
		"docs": "https://accessibleweb.com/bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-atvowbot",
		"name": "AtVowBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "AtVowBot",
			"lit": "atvowbot"
		},
		"docs": "https://brandeem.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bibliotheque-nacional-de-france-crawler",
		"name": "Bibliotheque Nacional de France Crawler",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "Bibliotheque Nacional de France Crawler",
			"lit": "bibliotheque nacional de france crawler"
		},
		"docs": "https://www.bnf.fr/en/web-legal-deposit",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bling-erp",
		"name": "Bling ERP",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Bling ERP",
			"lit": "bling erp"
		},
		"docs": "https://www.bling.com.br/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cdscbot",
		"name": "CDSCbot",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "CDSCbot",
			"lit": "cdscbot"
		},
		"docs": "https://wiki.communitydata.science/CommunityData:Fediverse_research",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-critical-css-bot",
		"name": "Critical CSS Bot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Critical CSS Bot",
			"lit": "critical css bot"
		},
		"docs": "https://criticalcss.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cybaabot",
		"name": "CybaaBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "CybaaBot",
			"lit": "cybaabot"
		},
		"docs": "https://cybaa.io/bot-policy",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cyberfindcrawler",
		"name": "CyberFindCrawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "CyberFindCrawler",
			"lit": "cyberfindcrawler"
		},
		"docs": "https://cyberfind.net/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dark-visitor",
		"name": "Dark Visitor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Dark Visitor",
			"lit": "dark visitor"
		},
		"docs": "https://darkvisitors.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-determ",
		"name": "Determ",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Determ",
			"lit": "determ"
		},
		"docs": "https://www.determ.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dnsscanner",
		"name": "DNSScanner",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "DNSScanner",
			"lit": "dnsscanner"
		},
		"docs": "https://rapef.info/_contacts/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-drupalbot",
		"name": "Drupalbot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Drupalbot",
			"lit": "drupalbot"
		},
		"docs": "https://www.drupal.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-emoney-advisor",
		"name": "eMoney Advisor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "eMoney Advisor",
			"lit": "emoney advisor"
		},
		"docs": "https://emoneyadvisor.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-extecontextcrawl",
		"name": "ExteContextCrawl",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "ExteContextCrawl",
			"lit": "extecontextcrawl"
		},
		"docs": "http://crawl001.exte.ai/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fedidb",
		"name": "FediDB",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "FediDB",
			"lit": "fedidb"
		},
		"docs": "https://fedidb.org/crawler.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fediindex",
		"name": "FediIndex",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "FediIndex",
			"lit": "fediindex"
		},
		"docs": "https://fedi.wrm.sr/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fedilist-agent",
		"name": "FediList Agent",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "FediList Agent",
			"lit": "fedilist agent"
		},
		"docs": "https://fedilist.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fedineko",
		"name": "Fedineko",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Fedineko",
			"lit": "fedineko"
		},
		"docs": "https://fedineko.org/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fedreporter-bot-for-ffiec",
		"name": "FedReporter Bot for FFIEC",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "FedReporter Bot for FFIEC",
			"lit": "fedreporter bot for ffiec"
		},
		"docs": "https://www.fedreporter.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feedsearch-bot",
		"name": "Feedsearch Bot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Feedsearch Bot",
			"lit": "feedsearch bot"
		},
		"docs": "https://feedearch.dev/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feedsearch-crawler",
		"name": "Feedsearch-Crawler",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Feedsearch-Crawler",
			"lit": "feedsearch-crawler"
		},
		"docs": "https://pypi.org/project/feedsearch-crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fiperbot",
		"name": "fiperbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "fiperbot",
			"lit": "fiperbot"
		},
		"docs": "https://fiper.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fleebsbot",
		"name": "FleebsBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "FleebsBot",
			"lit": "fleebsbot"
		},
		"docs": "https://fleebs.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fluid",
		"name": "Fluid",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Fluid",
			"lit": "fluid"
		},
		"docs": "http://leak.info/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-flyriverbot",
		"name": "Flyriverbot",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "Flyriverbot",
			"lit": "flyriverbot"
		},
		"docs": "https://flyriver.com/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-freshbot",
		"name": "Freshbot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Freshbot",
			"lit": "freshbot"
		},
		"docs": "http://webagent.wise-guys.nl/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gaisbot",
		"name": "Gaisbot",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Gaisbot",
			"lit": "gaisbot"
		},
		"docs": "http://gais.cs.ccu.edu.tw/robot.php",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-genomecrawlerd",
		"name": "GenomeCrawlerd",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "GenomeCrawlerd",
			"lit": "genomecrawlerd"
		},
		"docs": "https://nokia.com/genomecrawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-halobot",
		"name": "HaloBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "HaloBot",
			"lit": "halobot"
		},
		"docs": "https://haloscan.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-irlbot",
		"name": "IRLbot",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "IRLbot",
			"lit": "irlbot"
		},
		"docs": "http://irl.cs.tamu.edu/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kaikki-org-digital-archive",
		"name": "kaikki.org-digital-archive",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "kaikki\\.org-digital-archive",
			"lit": "kaikki.org-digital-archive"
		},
		"docs": "https://kaikki.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kb-dk-bot",
		"name": "kb.dk_bot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "kb\\.dk_bot",
			"lit": "kb.dk_bot"
		},
		"docs": "https://www.kb.dk/en/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-library-of-congress-web-archiving",
		"name": "Library Of Congress Web Archiving",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "Library Of Congress Web Archiving",
			"lit": "library of congress web archiving"
		},
		"docs": "https://www.loc.gov/programs/web-archiving/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-magnetmebot",
		"name": "MagnetmeBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "MagnetmeBot",
			"lit": "magnetmebot"
		},
		"docs": "https://magnet.me/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-matchorysearch",
		"name": "MatchorySearch",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "MatchorySearch",
			"lit": "matchorysearch"
		},
		"docs": "https://matchory.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-minoru-s-fediverse-crawler",
		"name": "Minoru's Fediverse Crawler",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Minoru's Fediverse Crawler",
			"lit": "minoru's fediverse crawler"
		},
		"docs": "https://nodes.fediverse.party/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mirrorwebcrawler",
		"name": "MirrorWebCrawler",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "MirrorWebCrawler",
			"lit": "mirrorwebcrawler"
		},
		"docs": "https://www.mirrorweb.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mithril-crawler",
		"name": "mithril-crawler",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "mithril-crawler",
			"lit": "mithril-crawler"
		},
		"docs": "https://498-search-engine.github.io/website/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-modatscanner",
		"name": "ModatScanner",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "ModatScanner",
			"lit": "modatscanner"
		},
		"docs": "https://modat.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-napbot",
		"name": "NapBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "NapBot",
			"lit": "napbot"
		},
		"docs": "http://napbot.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-new-york-times-newsgathering",
		"name": "New York Times Newsgathering",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "New York Times Newsgathering",
			"lit": "new york times newsgathering"
		},
		"docs": "https://www.nytimes.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nlux-iaharvester",
		"name": "NLUX_IAHarvester",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "NLUX_IAHarvester",
			"lit": "nlux_iaharvester"
		},
		"docs": "http://crawl.bnl.lu/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-noahbot",
		"name": "NoahBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "NoahBot",
			"lit": "noahbot"
		},
		"docs": "https://noahwire.com/bot-info",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-plagawarebot",
		"name": "PlagAwareBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "PlagAwareBot",
			"lit": "plagawarebot"
		},
		"docs": "https://plagaware.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rakuten-image-extraction-bot",
		"name": "Rakuten Image extraction bot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Rakuten Image extraction bot",
			"lit": "rakuten image extraction bot"
		},
		"docs": "https://www.rakuten.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-researchbot",
		"name": "ResearchBot",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "ResearchBot",
			"lit": "researchbot"
		},
		"docs": "https://kaust.edu.sa/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rss-is-dead-lol-web-bot",
		"name": "rss-is-dead.lol web bot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "rss-is-dead\\.lol web bot",
			"lit": "rss-is-dead.lol web bot"
		},
		"docs": "https://rss-is-dead.lol/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seolyt",
		"name": "seoLyt",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "seoLyt",
			"lit": "seolyt"
		},
		"docs": "https://seolyt.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sirdatabot",
		"name": "SirdataBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "SirdataBot",
			"lit": "sirdatabot"
		},
		"docs": "https://semantic-api.docs.sirdata.net/contextual-api/contextual-api/introduction",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sitesoverpagesbot",
		"name": "SitesOverPagesBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SitesOverPagesBot",
			"lit": "sitesoverpagesbot"
		},
		"docs": "https://sitesoverpages.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sleepbot",
		"name": "SleepBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "SleepBot",
			"lit": "sleepbot"
		},
		"docs": "http://sleepbot.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-termly",
		"name": "Termly",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Termly",
			"lit": "termly"
		},
		"docs": "https://termly.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tls-tester",
		"name": "TLS tester",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "TLS tester",
			"lit": "tls tester"
		},
		"docs": "https://testssl.sh/dev/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-trafilatura",
		"name": "trafilatura",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "trafilatura",
			"lit": "trafilatura"
		},
		"docs": "https://github.com/adbar/trafilatura",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-urlbeebot",
		"name": "UrlBeeBot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "UrlBeeBot",
			"lit": "urlbeebot"
		},
		"docs": "https://urlbee.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-videootv-bot",
		"name": "videootv Bot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "videootv Bot",
			"lit": "videootv bot"
		},
		"docs": "https://www.digitalgreen.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vmcrawl",
		"name": "vmcrawl",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "vmcrawl",
			"lit": "vmcrawl"
		},
		"docs": "https://docs.vmst.io/vmcrawl",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wadoobot",
		"name": "WadooBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "WadooBot",
			"lit": "wadoobot"
		},
		"docs": "https://wadoo.net/wadoobot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-website-info-net-robot",
		"name": "Website-info.net-Robot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Website-info\\.net-Robot",
			"lit": "website-info.net-robot"
		},
		"docs": "https://website-info.net/robot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wikido",
		"name": "WikiDo",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "WikiDo",
			"lit": "wikido"
		},
		"docs": "http://wikido.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wovn-crawler",
		"name": "WOVN Crawler",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WOVN Crawler",
			"lit": "wovn crawler"
		},
		"docs": "https://wovn.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-youdaobot",
		"name": "YoudaoBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "YoudaoBot",
			"lit": "youdaobot"
		},
		"docs": "http://youdao.com/help/webmaster/spider/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zyborg",
		"name": "ZyBorg",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "ZyBorg",
			"lit": "zyborg"
		},
		"docs": "http://wisenutbot.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-abevalbot",
		"name": "ABEvalBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "ABEvalBot",
			"lit": "abevalbot"
		},
		"docs": "https://knownagents.com/agents/abevalbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blekkobot",
		"name": "blekkobot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "blekkobot",
			"lit": "blekkobot"
		},
		"docs": "https://knownagents.com/agents/blekkobot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-br-crawler",
		"name": "br-crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "br-crawler",
			"lit": "br-crawler"
		},
		"docs": "https://knownagents.com/agents/br-crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-capterrabot",
		"name": "CapterraBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "CapterraBot",
			"lit": "capterrabot"
		},
		"docs": "https://www.capterra.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-carbon-umbrella-bot",
		"name": "carbon-umbrella-bot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "carbon-umbrella-bot",
			"lit": "carbon-umbrella-bot"
		},
		"docs": "https://knownagents.com/agents/carbon-umbrella-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-caveman-hunter",
		"name": "caveman-hunter",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "caveman-hunter",
			"lit": "caveman-hunter"
		},
		"docs": "https://fedi.buzz/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-centro-ads-txt-crawler",
		"name": "Centro Ads.txt Crawler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Centro Ads\\.txt Crawler",
			"lit": "centro ads.txt crawler"
		},
		"docs": "https://knownagents.com/agents/centro-ads-txt-crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wisebot",
		"name": "WISEbot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WISEbot",
			"lit": "wisebot"
		},
		"docs": "http://www.cision.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-codabot",
		"name": "CodaBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "CodaBot",
			"lit": "codabot"
		},
		"docs": "https://coda.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-corporama-matcher",
		"name": "Corporama matcher",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Corporama matcher",
			"lit": "corporama matcher"
		},
		"docs": "https://corporama.fr/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cyotekwebcopy",
		"name": "CyotekWebCopy",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "CyotekWebCopy",
			"lit": "cyotekwebcopy"
		},
		"docs": "https://www.cyotek.com/cyotek-webcopy",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-datadog-agent",
		"name": "Datadog Agent",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Datadog Agent",
			"lit": "datadog agent"
		},
		"docs": "https://www.datadoghq.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dazzle-bluesky-bot",
		"name": "Dazzle BlueSky Bot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Dazzle BlueSky Bot",
			"lit": "dazzle bluesky bot"
		},
		"docs": "https://knownagents.com/agents/dazzle-bluesky-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dominicbot",
		"name": "DominicBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "DominicBot",
			"lit": "dominicbot"
		},
		"docs": "https://vanylla.org/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dow-jones-searchbot",
		"name": "Dow Jones Searchbot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Dow Jones Searchbot",
			"lit": "dow jones searchbot"
		},
		"docs": "https://www.dowjones.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-download-ninja",
		"name": "Download Ninja",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Download Ninja",
			"lit": "download ninja"
		},
		"docs": "https://knownagents.com/agents/download-ninja",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-emailwolf",
		"name": "EmailWolf",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "EmailWolf",
			"lit": "emailwolf"
		},
		"docs": "https://knownagents.com/agents/emailwolf",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fedistatscrawler",
		"name": "fedistatsCrawler",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "fedistatsCrawler",
			"lit": "fedistatscrawler"
		},
		"docs": "https://knownagents.com/agents/fedistatscrawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-goparserbot",
		"name": "GoParserBot",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "GoParserBot",
			"lit": "goparserbot"
		},
		"docs": "https://knownagents.com/agents/goparserbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gsa-crawler",
		"name": "gsa-crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "gsa-crawler",
			"lit": "gsa-crawler"
		},
		"docs": "https://knownagents.com/agents/gsa-crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hanaleibot",
		"name": "HanaleiBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "HanaleiBot",
			"lit": "hanaleibot"
		},
		"docs": "https://knownagents.com/agents/hanaleibot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nicheindex",
		"name": "NicheIndex",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "NicheIndex",
			"lit": "nicheindex"
		},
		"docs": "https://nicheindex.co",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-headonlyscraper",
		"name": "HeadOnlyScraper",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "HeadOnlyScraper",
			"lit": "headonlyscraper"
		},
		"docs": "https://knownagents.com/agents/headonlyscraper",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-impact-com-agent",
		"name": "Impact.com Agent",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Impact\\.com Agent",
			"lit": "impact.com agent"
		},
		"docs": "https://impact.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-keydrop-io",
		"name": "Keydrop.io",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Keydrop\\.io",
			"lit": "keydrop.io"
		},
		"docs": "https://onlyscans.com/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-larbin",
		"name": "larbin",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "larbin",
			"lit": "larbin"
		},
		"docs": "http://larbin.sourceforge.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sentinel-linkcheck",
		"name": "SENTINEL-LinkCheck",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "SENTINEL-LinkCheck",
			"lit": "sentinel-linkcheck"
		},
		"docs": "https://sentinel.oblivionzone.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linko",
		"name": "linko",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "linko",
			"lit": "linko"
		},
		"docs": "https://linko.app/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linkpadbot",
		"name": "LinkpadBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "LinkpadBot",
			"lit": "linkpadbot"
		},
		"docs": "https://linkpad.org/robot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lwp-trivial",
		"name": "lwp-trivial",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "lwp-trivial",
			"lit": "lwp-trivial"
		},
		"docs": "https://metacpan.org/pod/LWP",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-magus-bot",
		"name": "Magus Bot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Magus Bot",
			"lit": "magus bot"
		},
		"docs": "https://knownagents.com/agents/magus-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-loopimprovements-com",
		"name": "loopimprovements.com",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "loopimprovements\\.com",
			"lit": "loopimprovements.com"
		},
		"docs": "http://loopimprovements.com/robot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-opentheboxbot",
		"name": "OpenTheBoxBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "OpenTheBoxBot",
			"lit": "opentheboxbot"
		},
		"docs": "https://knownagents.com/agents/opentheboxbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-owler-w",
		"name": "OWLer-W",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "OWLer-W",
			"lit": "owler-w"
		},
		"docs": "https://openwebsearch.eu/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-peer39-crawler",
		"name": "peer39_crawler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "peer39_crawler",
			"lit": "peer39_crawler"
		},
		"docs": "https://www.peer39.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pixalate-com",
		"name": "Pixalate.com",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Pixalate\\.com",
			"lit": "pixalate.com"
		},
		"docs": "https://www.pixalate.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-poduptime",
		"name": "Poduptime",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Poduptime",
			"lit": "poduptime"
		},
		"docs": "https://fediverse.observer",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pomothy-bot",
		"name": "Pomothy-Bot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Pomothy-Bot",
			"lit": "pomothy-bot"
		},
		"docs": "https://knownagents.com/agents/pomothy-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pulsepoint-crawler",
		"name": "PulsePoint-Crawler",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "PulsePoint-Crawler",
			"lit": "pulsepoint-crawler"
		},
		"docs": "https://www.pulsepoint.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rawweb-bot",
		"name": "rawweb-bot",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "rawweb-bot",
			"lit": "rawweb-bot"
		},
		"docs": "https://knownagents.com/agents/rawweb-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-semantic-visions",
		"name": "semantic-visions",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "semantic-visions",
			"lit": "semantic-visions"
		},
		"docs": "https://semantic-visions.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sindup",
		"name": "Sindup",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Sindup",
			"lit": "sindup"
		},
		"docs": "https://www.sindup.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sitesucker",
		"name": "SiteSucker",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "SiteSucker",
			"lit": "sitesucker"
		},
		"docs": "https://ricks-apps.com/osx/sitesucker/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-springservebot",
		"name": "SpringserveBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "SpringserveBot",
			"lit": "springservebot"
		},
		"docs": "https://www.springserve.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sqwatcher",
		"name": "SQWatcher",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "SQWatcher",
			"lit": "sqwatcher"
		},
		"docs": "http://sqcompliance.com/sqwatcher.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-supabase-paired-crawler",
		"name": "Supabase Paired Crawler",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Supabase Paired Crawler",
			"lit": "supabase paired crawler"
		},
		"docs": "https://supabase.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sv-watchagent",
		"name": "sv-watchagent",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "sv-watchagent",
			"lit": "sv-watchagent"
		},
		"docs": "https://semantic-visions.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-swiftbot",
		"name": "Swiftbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Swiftbot",
			"lit": "swiftbot"
		},
		"docs": "http://swiftype.com/swiftbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-synthesibot",
		"name": "SynthesiBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "SynthesiBot",
			"lit": "synthesibot"
		},
		"docs": "https://knownagents.com/agents/synthesibot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-taragroup-intelligent-bot",
		"name": "TaraGroup Intelligent Bot",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "TaraGroup Intelligent Bot",
			"lit": "taragroup intelligent bot"
		},
		"docs": "https://knownagents.com/agents/taragroup-intelligent-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tsmbot",
		"name": "TSMbot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "TSMbot",
			"lit": "tsmbot"
		},
		"docs": "https://knownagents.com/agents/tsmbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tsm-turingos",
		"name": "TSM-turingos",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "TSM-turingos",
			"lit": "tsm-turingos"
		},
		"docs": "https://knownagents.com/agents/turingos",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ugaresearchagent",
		"name": "UGAResearchAgent",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "UGAResearchAgent",
			"lit": "ugaresearchagent"
		},
		"docs": "https://nislabuga-scan.uga.edu/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-urlsuma-de-crawler",
		"name": "UrlSuMa.de crawler",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "UrlSuMa\\.de crawler",
			"lit": "urlsuma.de crawler"
		},
		"docs": "https://urlsuma.de/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wanscannerbot",
		"name": "WanscannerBot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "WanscannerBot",
			"lit": "wanscannerbot"
		},
		"docs": "https://abuse.pend.re",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webcapture",
		"name": "WebCapture",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "WebCapture",
			"lit": "webcapture"
		},
		"docs": "https://knownagents.com/agents/webcapture-2-0",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webcopier",
		"name": "WebCopier",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "WebCopier",
			"lit": "webcopier"
		},
		"docs": "http://www.maximumsoft.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cognitiveseo-com",
		"name": "cognitiveseo.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "cognitiveseo\\.com",
			"lit": "cognitiveseo.com"
		},
		"docs": "http://cognitiveseo.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-xing-bot",
		"name": "Xing Bot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Xing Bot",
			"lit": "xing bot"
		},
		"docs": "https://www.xing.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-xml-sitemaps-generator",
		"name": "XML Sitemaps Generator",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "XML Sitemaps Generator",
			"lit": "xml sitemaps generator"
		},
		"docs": "http://www.xml-sitemaps.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yandorirssbot",
		"name": "YandoriRSSBot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "YandoriRSSBot",
			"lit": "yandorirssbot"
		},
		"docs": "https://knownagents.com/agents/yandorirssbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zealbot",
		"name": "Zealbot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Zealbot",
			"lit": "zealbot"
		},
		"docs": "https://knownagents.com/agents/zealbot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-008",
		"name": "008/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "008\\/",
			"lit": "008/"
		},
		"docs": "https://datadome.co/bots/008-2/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-monitoring360bot",
		"name": "monitoring360bot/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "monitoring360bot\\/",
			"lit": "monitoring360bot/"
		},
		"docs": "https://app.360monitoring.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adagiobot",
		"name": "AdagioBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "AdagioBot",
			"lit": "adagiobot"
		},
		"docs": "https://datadome.co/bots/adagio-digital/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adbeat-com",
		"name": "adbeat.com",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "adbeat\\.com",
			"lit": "adbeat.com"
		},
		"docs": "https://www.adbeat.com/operation_policy",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adminlabs",
		"name": "AdminLabs",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "AdminLabs",
			"lit": "adminlabs"
		},
		"docs": "https://datadome.co/bots/adminlabs/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-advanced-crawler",
		"name": "advanced_crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "advanced_crawler",
			"lit": "advanced_crawler"
		},
		"docs": "https://datadome.co/bots/advanced-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adventurer",
		"name": "Adventurer",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Adventurer",
			"lit": "adventurer"
		},
		"docs": "https://datadome.co/bots/adventurer/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-agakidsbot",
		"name": "AGAKIDSBOT",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "AGAKIDSBOT",
			"lit": "agakidsbot"
		},
		"docs": "https://agakids.ru/project/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-agencyanalyticsbot",
		"name": "AgencyAnalyticsBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "AgencyAnalyticsBot",
			"lit": "agencyanalyticsbot"
		},
		"docs": "https://agencyanalytics.com/features/seo-site-audit",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-akismetbot",
		"name": "AkismetBot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "AkismetBot",
			"lit": "akismetbot"
		},
		"docs": "https://akismet.com/development/api/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-alexa-site-audit",
		"name": "alexa site audit",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "alexa site audit",
			"lit": "alexa site audit"
		},
		"docs": "https://www.alexa.com/help/webmasters",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-algolia-crawler",
		"name": "Algolia Crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Algolia Crawler",
			"lit": "algolia crawler"
		},
		"docs": "https://www.algolia.com/doc/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-alienfarm",
		"name": "alienfarm",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "alienfarm",
			"lit": "alienfarm"
		},
		"docs": "https://datadome.co/bots/alienfarm/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-allorigins",
		"name": "allOrigins",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "allOrigins",
			"lit": "allorigins"
		},
		"docs": "https://allorigins.win/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-amazonadbot",
		"name": "AmazonAdBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "AmazonAdBot",
			"lit": "amazonadbot"
		},
		"docs": "https://advertising.amazon.com/resources/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kendrabot",
		"name": "KendraBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "KendraBot",
			"lit": "kendrabot"
		},
		"docs": "https://docs.aws.amazon.com/kendra/latest/dg/what-is-kendra.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-appsiteassociation",
		"name": "AppSiteAssociation",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "AppSiteAssociation",
			"lit": "appsiteassociation"
		},
		"docs": "https://developer.apple.com/documentation/applications/allowing-app-linking-to-your-website",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-aragog",
		"name": "Aragog/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Aragog\\/",
			"lit": "aragog/"
		},
		"docs": "https://wordads.co/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-aranea",
		"name": "Aranea",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Aranea",
			"lit": "aranea"
		},
		"docs": "http://unesco.uniba.sk/guest/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-archivebox",
		"name": "ArchiveBox",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "ArchiveBox",
			"lit": "archivebox"
		},
		"docs": "https://archivebox.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-arquivobot",
		"name": "ArquivoBot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "ArquivoBot",
			"lit": "arquivobot"
		},
		"docs": "https://arquivo.pt/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-arquivo-web-crawler",
		"name": "Arquivo-web-crawler",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "Arquivo-web-crawler",
			"lit": "arquivo-web-crawler"
		},
		"docs": "https://arquivo.pt/robot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-artemisbot",
		"name": "ArtemisBot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "ArtemisBot",
			"lit": "artemisbot"
		},
		"docs": "https://datadome.co/bots/artemis-web-reader/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-asana",
		"name": "Asana/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Asana\\/",
			"lit": "asana/"
		},
		"docs": "https://datadome.co/bots/asana-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-audistobot",
		"name": "AudistoBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "AudistoBot",
			"lit": "audistobot"
		},
		"docs": "https://audisto.com/webcrawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-autoconfig-test-from-ustc",
		"name": "Autoconfig Test from USTC",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Autoconfig Test from USTC",
			"lit": "autoconfig test from ustc"
		},
		"docs": "https://datadome.co/bots/autoconfig-test-from-ustc/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bad-neighborhood-header-detector",
		"name": "Bad Neighborhood Header Detector",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Bad Neighborhood Header Detector",
			"lit": "bad neighborhood header detector"
		},
		"docs": "https://datadome.co/bots/bad-neighborhood/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-baiduadsbot",
		"name": "BaiduAdsBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "BaiduAdsBot",
			"lit": "baiduadsbot"
		},
		"docs": "https://datadome.co/bots/baidu-ads-server-proxy/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bdbot",
		"name": "BDBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BDBot\\/",
			"lit": "bdbot/"
		},
		"docs": "https://datadome.co/bots/bdbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-beeperbot",
		"name": "BeeperBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BeeperBot",
			"lit": "beeperbot"
		},
		"docs": "https://www.beeper.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-betteruptimebot",
		"name": "BetterUptimeBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "BetterUptimeBot",
			"lit": "betteruptimebot"
		},
		"docs": "https://betteruptime.com/docs",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bnfbot",
		"name": "BnFBot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "BnFBot",
			"lit": "bnfbot"
		},
		"docs": "https://www.bnf.fr/en/web-services",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bigupdatabot",
		"name": "BigUpDataBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BigUpDataBot",
			"lit": "bigupdatabot"
		},
		"docs": "https://datadome.co/bots/bigupdata/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-binarycanary",
		"name": "BinaryCanary",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "BinaryCanary",
			"lit": "binarycanary"
		},
		"docs": "https://www.binarycanary.com/monitoring/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bitbucket-webhooks",
		"name": "Bitbucket-Webhooks",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Bitbucket-Webhooks",
			"lit": "bitbucket-webhooks"
		},
		"docs": "https://support.atlassian.com/bitbucket-cloud",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bl-uk-ldfc-bot",
		"name": "bl.uk_ldfc_bot",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "bl\\.uk_ldfc_bot",
			"lit": "bl.uk_ldfc_bot"
		},
		"docs": "https://www.bl.uk/legal-deposit/web-archiving",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blackduck-fd",
		"name": "BlackDuck-FD",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "BlackDuck-FD",
			"lit": "blackduck-fd"
		},
		"docs": "https://www.synopsys.com/software-integrity/security-testing/dynamic-analysis.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blogtrottr",
		"name": "Blogtrottr",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Blogtrottr",
			"lit": "blogtrottr"
		},
		"docs": "https://datadome.co/bots/blogtrottr/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blueskypreviewbot",
		"name": "BlueskyPreviewBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "BlueskyPreviewBot",
			"lit": "blueskypreviewbot"
		},
		"docs": "https://docs.bsky.app",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-boardgamepricesbot",
		"name": "BoardGamePricesBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BoardGamePricesBot",
			"lit": "boardgamepricesbot"
		},
		"docs": "https://datadome.co/bots/boardgameprices/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-botpoke",
		"name": "BotPoke",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BotPoke",
			"lit": "botpoke"
		},
		"docs": "https://datadome.co/bots/botpoke/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bdfetch",
		"name": "BDFetch",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BDFetch",
			"lit": "bdfetch"
		},
		"docs": "http://www.brandprotect.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-brandwatch",
		"name": "Brandwatch",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Brandwatch",
			"lit": "brandwatch"
		},
		"docs": "https://www.brandwatch.com/legal/crawlers/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-brokenlinkcheck-com",
		"name": "brokenlinkcheck.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "brokenlinkcheck\\.com",
			"lit": "brokenlinkcheck.com"
		},
		"docs": "https://datadome.co/bots/brokenlinkcheck-com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bw-2",
		"name": "BW/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "BW\\/",
			"lit": "bw/"
		},
		"docs": "https://builtwith.com/biup",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bushbaby",
		"name": "Bushbaby",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Bushbaby",
			"lit": "bushbaby"
		},
		"docs": "https://datadome.co/bots/bushbaby/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-butterfly",
		"name": "Butterfly",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Butterfly",
			"lit": "butterfly"
		},
		"docs": "http://labs.topsy.com/butterfly/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rss-parser",
		"name": "rss-parser",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "rss-parser",
			"lit": "rss-parser"
		},
		"docs": "https://buttondown.email/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-caliberbot",
		"name": "CaliberBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "CaliberBot",
			"lit": "caliberbot"
		},
		"docs": "https://www.calibermind.com/platform",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-capitaloneshopping",
		"name": "CapitalOneShopping",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "CapitalOneShopping",
			"lit": "capitaloneshopping"
		},
		"docs": "https://datadome.co/bots/capital-one-shopping-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-catchpoint",
		"name": "Catchpoint",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Catchpoint",
			"lit": "catchpoint"
		},
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-centuryb-o-t9",
		"name": "centuryb.o.t9",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "centuryb\\.o\\.t9",
			"lit": "centuryb.o.t9"
		},
		"docs": "https://datadome.co/bots/centurybot9/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cert-pl",
		"name": "CERT PL",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "CERT PL",
			"lit": "cert pl"
		},
		"docs": "https://cert.pl/skanowanie",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-certytags",
		"name": "certytags",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "certytags",
			"lit": "certytags"
		},
		"docs": "https://certybot.certytags.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-chargebeebot",
		"name": "ChargeBeeBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ChargeBeeBot",
			"lit": "chargebeebot"
		},
		"docs": "https://chargebee.com/resources",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-charlotte",
		"name": "Charlotte",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Charlotte",
			"lit": "charlotte"
		},
		"docs": "https://datadome.co/bots/charlotte-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-chatwork-linkpreview",
		"name": "Chatwork LinkPreview",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Chatwork LinkPreview",
			"lit": "chatwork linkpreview"
		},
		"docs": "https://www.chatwork.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-checkhost",
		"name": "CheckHost",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "CheckHost",
			"lit": "checkhost"
		},
		"docs": "https://datadome.co/bots/check-host/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-goodzer",
		"name": "Goodzer",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Goodzer",
			"lit": "goodzer"
		},
		"docs": "https://discord.com/discovery/applications/1065250549408223252",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-chrome-privacy-preserving-prefetch-proxy",
		"name": "Chrome Privacy Preserving Prefetch Proxy",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Chrome Privacy Preserving Prefetch Proxy",
			"lit": "chrome privacy preserving prefetch proxy"
		},
		"docs": "https://datadome.co/bots/chrome-privacypreserving-prefetch-proxy/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cirrusexplorer",
		"name": "CirrusExplorer",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "CirrusExplorer",
			"lit": "cirrusexplorer"
		},
		"docs": "https://cseu.ro/explorer.php",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-classla-web",
		"name": "CLASSLA-web",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "CLASSLA-web",
			"lit": "classla-web"
		},
		"docs": "https://www.clarin.si/info/classla-web-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-clearscopebot",
		"name": "Clearscopebot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Clearscopebot",
			"lit": "clearscopebot"
		},
		"docs": "https://datadome.co/bots/clearscope-clearscopebot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-worldbot",
		"name": "WorldBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WorldBot",
			"lit": "worldbot"
		},
		"docs": "https://datadome.co/bots/clickagy-intelligence-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-validator",
		"name": "Cloudflare-Validator",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Cloudflare-Validator",
			"lit": "cloudflare-validator"
		},
		"docs": "https://datadome.co/bots/cloudflare-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-csup",
		"name": "cloudflare-csup",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "cloudflare-csup",
			"lit": "cloudflare-csup"
		},
		"docs": "https://datadome.co/bots/cloudflare-csup/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-custom-error-page-crawler",
		"name": "Cloudflare-Custom-Error-Page-Crawler",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Cloudflare-Custom-Error-Page-Crawler",
			"lit": "cloudflare-custom-error-page-crawler"
		},
		"docs": "https://developers.cloudflare.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-radar-scanner",
		"name": "Cloudflare-Radar-Scanner",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Cloudflare-Radar-Scanner",
			"lit": "cloudflare-radar-scanner"
		},
		"docs": "https://radar.cloudflare.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-speedtest",
		"name": "Cloudflare-SpeedTest",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Cloudflare-SpeedTest",
			"lit": "cloudflare-speedtest"
		},
		"docs": "https://www.cloudflare.com/speedtest",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cloudflare-stream-hook",
		"name": "Cloudflare-Stream-Hook",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Cloudflare-Stream-Hook",
			"lit": "cloudflare-stream-hook"
		},
		"docs": "https://developers.cloudflare.com/stream/webhooks/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cognitiveseo-bot",
		"name": "cognitiveSEO Bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "cognitiveSEO Bot",
			"lit": "cognitiveseo bot"
		},
		"docs": "https://cognitiveseo.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-commafeed",
		"name": "CommaFeed",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "CommaFeed",
			"lit": "commafeed"
		},
		"docs": "https://datadome.co/bots/commafeed/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-researchscan-comsys-rwth-aachen-de",
		"name": "researchscan.comsys.rwth-aachen.de",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "researchscan\\.comsys\\.rwth-aachen\\.de",
			"lit": "researchscan.comsys.rwth-aachen.de"
		},
		"docs": "http://researchscan.comsys.rwth-aachen.de/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-contentkingapp",
		"name": "contentkingapp",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "contentkingapp",
			"lit": "contentkingapp"
		},
		"docs": "https://whatis.contentkingapp.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cookiehub-bot",
		"name": "CookieHub Bot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "CookieHub Bot",
			"lit": "cookiehub bot"
		},
		"docs": "https://www.cookiehub.com/docs",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-coveobot",
		"name": "Coveobot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Coveobot",
			"lit": "coveobot"
		},
		"docs": "https://platform.cloud.coveo.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-crawlson",
		"name": "Crawlson",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Crawlson",
			"lit": "crawlson"
		},
		"docs": "https://www.crawlson.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-repolookoutbot",
		"name": "RepoLookoutBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RepoLookoutBot",
			"lit": "repolookoutbot"
		},
		"docs": "https://www.repo-lookout.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-criticalcss-com",
		"name": "Criticalcss.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Criticalcss\\.com",
			"lit": "criticalcss.com"
		},
		"docs": "https://criticalcss.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cron-job-org",
		"name": "cron-job.org",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "cron-job\\.org",
			"lit": "cron-job.org"
		},
		"docs": "https://cron-job.org/en/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dnbcrawler",
		"name": "DnBCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "DnBCrawler",
			"lit": "dnbcrawler"
		},
		"docs": "https://datadome.co/bots/dnbcrawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dmbrowser",
		"name": "DMBrowser",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "DMBrowser",
			"lit": "dmbrowser"
		},
		"docs": "https://www.dotcom-monitor.com/wiki/knowledge-base-main/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-domcopbot",
		"name": "DomCopBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "DomCopBot",
			"lit": "domcopbot"
		},
		"docs": "https://www.domcop.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-downnotifier-com",
		"name": "downnotifier.com",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "downnotifier\\.com",
			"lit": "downnotifier.com"
		},
		"docs": "https://datadome.co/bots/downnotifier-com-monitoring/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-downtimedetector",
		"name": "DowntimeDetector/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "DowntimeDetector\\/",
			"lit": "downtimedetector/"
		},
		"docs": "https://datadome.co/bots/downtimedetector/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dlc",
		"name": "Dlc/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Dlc\\/",
			"lit": "dlc/"
		},
		"docs": "https://www.drlinkcheck.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dratabot",
		"name": "Dratabot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Dratabot",
			"lit": "dratabot"
		},
		"docs": "https://dratabot.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-easybib-autocite",
		"name": "EasyBib AutoCite",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "EasyBib AutoCite",
			"lit": "easybib autocite"
		},
		"docs": "http://www.easybib.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-easybill-importmanager",
		"name": "easybill-ImportManager",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "easybill-ImportManager",
			"lit": "easybill-importmanager"
		},
		"docs": "https://www.easybill.de/api/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-easycron",
		"name": "EasyCron/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "EasyCron\\/",
			"lit": "easycron/"
		},
		"docs": "https://www.easycron.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-easydns-monitoring",
		"name": "easyDNS Monitoring",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "easyDNS Monitoring",
			"lit": "easydns monitoring"
		},
		"docs": "http://easyurl.net/monitoring",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cronless",
		"name": "Cronless",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Cronless",
			"lit": "cronless"
		},
		"docs": "https://datadome.co/bots/cronless/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-crusty",
		"name": "crusty/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "crusty\\/",
			"lit": "crusty/"
		},
		"docs": "https://github.com/let4be/crusty",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-csirt-cz",
		"name": "csirt.cz",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "csirt\\.cz",
			"lit": "csirt.cz"
		},
		"docs": "https://csirt.cz/cs/dns-crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cxk-bot",
		"name": "CXK_Bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "CXK_Bot",
			"lit": "cxk_bot"
		},
		"docs": "https://datadome.co/bots/cxk_bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-daumoa",
		"name": "daumoa",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "daumoa",
			"lit": "daumoa"
		},
		"docs": "http://cs.daum.net/faq/15/4118.html?faqId=28966",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-daspeedbot",
		"name": "DaspeedBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "DaspeedBot",
			"lit": "daspeedbot"
		},
		"docs": "https://datadome.co/bots/dawap-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dead-link-checker",
		"name": "Dead Link Checker",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Dead Link Checker",
			"lit": "dead link checker"
		},
		"docs": "http://www.dead-link-checker.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-deskyobot",
		"name": "Deskyobot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Deskyobot",
			"lit": "deskyobot"
		},
		"docs": "https://www.deskyo.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-detectify",
		"name": "Detectify",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Detectify",
			"lit": "detectify"
		},
		"docs": "https://detectify.com/what-is-detectify",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-df-bot",
		"name": "DF Bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "DF Bot",
			"lit": "df bot"
		},
		"docs": "https://datadome.co/bots/df-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dingtalkbot-linkservice",
		"name": "DingTalkBot-LinkService",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "DingTalkBot-LinkService",
			"lit": "dingtalkbot-linkservice"
		},
		"docs": "https://www.dingtalk.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-discourse-forum-onebox",
		"name": "Discourse Forum Onebox",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Discourse Forum Onebox",
			"lit": "discourse forum onebox"
		},
		"docs": "https://discourse.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dmbot",
		"name": "Dmbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Dmbot",
			"lit": "dmbot"
		},
		"docs": "https://datadome.co/bots/dmbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sustainabilitycrawler",
		"name": "SustainabilityCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SustainabilityCrawler",
			"lit": "sustainabilitycrawler"
		},
		"docs": "https://datadome.co/bots/ecovadis-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-edansbot",
		"name": "edansbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "edansbot",
			"lit": "edansbot"
		},
		"docs": "https://datadome.co/bots/edansbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-edgewatch",
		"name": "EdgeWatch",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "EdgeWatch",
			"lit": "edgewatch"
		},
		"docs": "https://about.edgewatch.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-do-not-track-verifier",
		"name": "Do Not Track Verifier",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Do Not Track Verifier",
			"lit": "do not track verifier"
		},
		"docs": "https://datadome.co/bots/eff-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-elmahio-uptimebot",
		"name": "elmahio-uptimebot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "elmahio-uptimebot",
			"lit": "elmahio-uptimebot"
		},
		"docs": "https://elmah.io",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-emoneybot",
		"name": "eMoneyBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "eMoneyBot",
			"lit": "emoneybot"
		},
		"docs": "https://emoneyadvisor.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-epivozcrawler",
		"name": "EpivozCrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "EpivozCrawler",
			"lit": "epivozcrawler"
		},
		"docs": "https://www.techmeme.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-erepublik-tools",
		"name": "eRepublik.tools",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "eRepublik\\.tools",
			"lit": "erepublik.tools"
		},
		"docs": "https://erepublik.tools",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-evouptimebot",
		"name": "EvoUptimeBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "EvoUptimeBot",
			"lit": "evouptimebot"
		},
		"docs": "https://www.evo.agency",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-exodusmovement",
		"name": "ExodusMovement",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ExodusMovement",
			"lit": "exodusmovement"
		},
		"docs": "https://www.exodus.io",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ezgif",
		"name": "Ezgif",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Ezgif",
			"lit": "ezgif"
		},
		"docs": "https://ezgif.com/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fastmailua",
		"name": "FastmailUA",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "FastmailUA",
			"lit": "fastmailua"
		},
		"docs": "https://www.fastmail.com/policies/bots/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fdl-stats-bot",
		"name": "FDL Stats Bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "FDL Stats Bot",
			"lit": "fdl stats bot"
		},
		"docs": "https://ftwentertainment.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fedicabot",
		"name": "Fedicabot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Fedicabot",
			"lit": "fedicabot"
		},
		"docs": "https://fedica.com/info/fedicabot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fedreporterdatabot",
		"name": "FedReporterDataBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "FedReporterDataBot",
			"lit": "fedreporterdatabot"
		},
		"docs": "https://fedreporter.net/FedReporterBotDocumentation/Readme.txt",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feed-image-audit",
		"name": "Feed Image Audit",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Feed Image Audit",
			"lit": "feed image audit"
		},
		"docs": "https://image-validator.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feedburner",
		"name": "FeedBurner",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "FeedBurner",
			"lit": "feedburner"
		},
		"docs": "http://www.feedburner.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feeder-co",
		"name": "feeder.co",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "feeder\\.co",
			"lit": "feeder.co"
		},
		"docs": "https://feeder.co/crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feedpresso-content-index-bot",
		"name": "Feedpresso Content Index Bot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Feedpresso Content Index Bot",
			"lit": "feedpresso content index bot"
		},
		"docs": "https://datadome.co/bots/feedpresso-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-feedwind",
		"name": "Feedwind",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Feedwind",
			"lit": "feedwind"
		},
		"docs": "http://feed.mikle.com/support/description/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fidget-spinner-bot",
		"name": "fidget-spinner-bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "fidget-spinner-bot",
			"lit": "fidget-spinner-bot"
		},
		"docs": "https://datadome.co/bots/fidget-spinner-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-firmograph",
		"name": "FirmoGraph",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "FirmoGraph",
			"lit": "firmograph"
		},
		"docs": "https://datadome.co/bots/firmograph/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-flipboardrss",
		"name": "FlipboardRSS",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "FlipboardRSS",
			"lit": "flipboardrss"
		},
		"docs": "http://flipboard.com/browserproxy",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-foregenix",
		"name": "Foregenix",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Foregenix",
			"lit": "foregenix"
		},
		"docs": "http://www.foregenix.com/scan",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-freespoke",
		"name": "Freespoke/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Freespoke\\/",
			"lit": "freespoke/"
		},
		"docs": "https://docs.freespoke.com/search/bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-friendly-testing-bot",
		"name": "Friendly testing bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Friendly testing bot",
			"lit": "friendly testing bot"
		},
		"docs": "https://datadome.co/bots/friendly-testing-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-fullstorybot",
		"name": "FullStoryBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "FullStoryBot\\/",
			"lit": "fullstorybot/"
		},
		"docs": "https://help.fullstory.com/spp-ref/343521-what-is-the-fullstorybot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-funnelback",
		"name": "Funnelback",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Funnelback",
			"lit": "funnelback"
		},
		"docs": "https://docs.squiz.net/funnelback/docs/latest/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gabanzabot",
		"name": "Gabanzabot/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Gabanzabot\\/",
			"lit": "gabanzabot/"
		},
		"docs": "https://datadome.co/bots/gabanzabot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gdnplus-com",
		"name": "gdnplus.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "gdnplus\\.com",
			"lit": "gdnplus.com"
		},
		"docs": "https://datadome.co/bots/gdnp-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-getthit-com",
		"name": "getthit.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "getthit\\.com",
			"lit": "getthit.com"
		},
		"docs": "https://www.getthit.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gg-peekbot",
		"name": "GG PeekBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "GG PeekBot",
			"lit": "gg peekbot"
		},
		"docs": "https://www.gg.pl/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ghost-inspector",
		"name": "Ghost Inspector",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "Ghost Inspector",
			"lit": "ghost inspector"
		},
		"docs": "https://ghostinspector.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-github-camo",
		"name": "github-camo",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "github-camo",
			"lit": "github-camo"
		},
		"docs": "https://github.com/atmos/camo",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-globalwebsearch",
		"name": "GlobalWebSearch",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "GlobalWebSearch",
			"lit": "globalwebsearch"
		},
		"docs": "https://datadome.co/bots/globalwebsearch/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-golfe",
		"name": "Golfe/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Golfe\\/",
			"lit": "golfe/"
		},
		"docs": "https://datadome.co/bots/6hphjxgx/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-apps-script",
		"name": "Google-Apps-Script",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Google-Apps-Script",
			"lit": "google-apps-script"
		},
		"docs": "https://script.google.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-googlestackdrivermonitoring",
		"name": "GoogleStackdriverMonitoring",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "GoogleStackdriverMonitoring",
			"lit": "googlestackdrivermonitoring"
		},
		"docs": "https://cloud.google.com/monitoring",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-googleassociationservice",
		"name": "GoogleAssociationService/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GoogleAssociationService\\/",
			"lit": "googleassociationservice/"
		},
		"docs": "https://developers.google.com/identity/credential-sharing/digital-asset-links#:~:text=then%20act%20upon.-,Overview,as%20location%2C%20with%20website%20B.",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-googleimageproxy",
		"name": "GoogleImageProxy",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "GoogleImageProxy",
			"lit": "googleimageproxy"
		},
		"docs": "https://support.google.com/webmasters/answer/1061943?hl=en",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-googleproducer",
		"name": "GoogleProducer",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "GoogleProducer",
			"lit": "googleproducer"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers#googleproducer",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-trust-services-2",
		"name": "Google-Trust-Services/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Google-Trust-Services\\/",
			"lit": "google-trust-services/"
		},
		"docs": "https://pki.goog/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-area120",
		"name": "Google-Area120",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Google-Area120",
			"lit": "google-area120"
		},
		"docs": "https://area120.google.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-googleassociationservice-2",
		"name": "GoogleAssociationService",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GoogleAssociationService$",
			"lit": "googleassociationservice"
		},
		"docs": "https://developers.google.com/digital-asset-links",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-googledocs",
		"name": "GoogleDocs",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GoogleDocs",
			"lit": "googledocs"
		},
		"docs": "https://docs.google.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gopay",
		"name": "GoPay",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GoPay",
			"lit": "gopay"
		},
		"docs": "https://doc.gopay.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gotsitemonitor-com",
		"name": "GotSiteMonitor.com",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "GotSiteMonitor\\.com",
			"lit": "gotsitemonitor.com"
		},
		"docs": "https://datadome.co/bots/gotsitemonitor/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-synthetic-monitoring-agent",
		"name": "synthetic-monitoring-agent/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "synthetic-monitoring-agent\\/",
			"lit": "synthetic-monitoring-agent/"
		},
		"docs": "https://grafana.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-grammarly",
		"name": "Grammarly/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Grammarly\\/",
			"lit": "grammarly/"
		},
		"docs": "https://datadome.co/bots/grammarly/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gregcrawler",
		"name": "gregcrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "gregcrawler",
			"lit": "gregcrawler"
		},
		"docs": "https://datadome.co/bots/gregcrawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-groovinaadsbot",
		"name": "GroovinaAdsbot/",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "GroovinaAdsbot\\/",
			"lit": "groovinaadsbot/"
		},
		"docs": "https://www.groovinads.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-grover",
		"name": "Grover/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Grover\\/",
			"lit": "grover/"
		},
		"docs": "https://datadome.co/bots/grover-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gtmetrix",
		"name": "GTmetrix",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "GTmetrix",
			"lit": "gtmetrix"
		},
		"docs": "https://gtmetrix.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-guestpostsbot",
		"name": "GuestpostsBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GuestpostsBot\\/",
			"lit": "guestpostsbot/"
		},
		"docs": "https://guestposts.com.br/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-gulper-web-bot",
		"name": "Gulper Web Bot",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Gulper Web Bot",
			"lit": "gulper web bot"
		},
		"docs": "https://datadome.co/bots/gulperbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-verity",
		"name": "Verity/",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Verity\\/",
			"lit": "verity/"
		},
		"docs": "https://gumgum.com/verity",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-happywing",
		"name": "HappyWing",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "HappyWing",
			"lit": "happywing"
		},
		"docs": "https://datadome.co/bots/happywing/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-harsilbot",
		"name": "harsilbot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "harsilbot\\/",
			"lit": "harsilbot/"
		},
		"docs": "http://www.harsil.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hawaiibot",
		"name": "HawaiiBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "HawaiiBot",
			"lit": "hawaiibot"
		},
		"docs": "https://datadome.co/bots/hawaiibot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hcardvalidator",
		"name": "hCardValidator",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "hCardValidator",
			"lit": "hcardvalidator"
		},
		"docs": "http://hcard.geekhood.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hello-world",
		"name": "Hello World",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Hello World",
			"lit": "hello world"
		},
		"docs": "https://datadome.co/bots/hello-world/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-helloworkjobpostingbot",
		"name": "HelloworkJobPostingBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "HelloworkJobPostingBot\\/",
			"lit": "helloworkjobpostingbot/"
		},
		"docs": "https://www.hellowork-group.com/en/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hifibot",
		"name": "HIFIBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "HIFIBot\\/",
			"lit": "hifibot/"
		},
		"docs": "https://hi.fi/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hlidam-to-robot",
		"name": "Hlidam.to robot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Hlidam\\.to robot",
			"lit": "hlidam.to robot"
		},
		"docs": "https://hlidam.to/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-honeybadger-uptime-check",
		"name": "Honeybadger Uptime Check",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Honeybadger Uptime Check",
			"lit": "honeybadger uptime check"
		},
		"docs": "https://www.honeybadger.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hosttracker",
		"name": "HostTracker/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "HostTracker\\/",
			"lit": "hosttracker/"
		},
		"docs": "https://datadome.co/bots/hosttracker/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hotjar",
		"name": "Hotjar",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Hotjar",
			"lit": "hotjar"
		},
		"docs": "https://www.hotjar.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hstspreload-bot",
		"name": "hstspreload-bot",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "hstspreload-bot",
			"lit": "hstspreload-bot"
		},
		"docs": "https://hstspreload.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-huckabot",
		"name": "Huckabot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Huckabot\\/",
			"lit": "huckabot/"
		},
		"docs": "https://huckabuy.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hype-machine",
		"name": "Hype Machine/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Hype Machine\\/",
			"lit": "hype machine/"
		},
		"docs": "https://hypem.com/latest",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-web-screen-service-by-hyperhost",
		"name": "Web Screen Service By hyperhost",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Web Screen Service By hyperhost",
			"lit": "web screen service by hyperhost"
		},
		"docs": "https://datadome.co/bots/hyperhost-ua-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-adsbot-iab",
		"name": "AdsBot-IAB",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "AdsBot-IAB",
			"lit": "adsbot-iab"
		},
		"docs": "https://iabtechlab.com/ads-txt/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ibm-crawler",
		"name": "IBM Crawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "IBM Crawler",
			"lit": "ibm crawler"
		},
		"docs": "https://datadome.co/bots/ibm-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ifttt",
		"name": "IFTTT/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "IFTTT\\/",
			"lit": "ifttt/"
		},
		"docs": "https://ifttt.com/feed/details",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-imagefetcher",
		"name": "ImageFetcher/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ImageFetcher\\/",
			"lit": "imagefetcher/"
		},
		"docs": "http://wsrv.nl/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-imagemind",
		"name": "ImageMind",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "ImageMind",
			"lit": "imagemind"
		},
		"docs": "https://datadome.co/bots/imagemind/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-imgproxy",
		"name": "imgproxy/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "imgproxy\\/",
			"lit": "imgproxy/"
		},
		"docs": "https://imgproxy.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-impendoom-bot",
		"name": "impendoom-bot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "impendoom-bot\\/",
			"lit": "impendoom-bot/"
		},
		"docs": "https://impendoom.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-indeedjobbot",
		"name": "IndeedJobBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "IndeedJobBot",
			"lit": "indeedjobbot"
		},
		"docs": "https://www.indeed.com/about/indeed-crawlers",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-innguma",
		"name": "Innguma/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Innguma\\/",
			"lit": "innguma/"
		},
		"docs": "https://factory.innguma.com/fetcher/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-instapaper",
		"name": "Instapaper/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Instapaper\\/",
			"lit": "instapaper/"
		},
		"docs": "https://www.instapaper.com/publishers",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-integromat",
		"name": "Integromat/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Integromat\\/",
			"lit": "integromat/"
		},
		"docs": "https://developers.make.com/api-documentation",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-intelx-io-bot",
		"name": "intelx.io_bot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "intelx\\.io_bot",
			"lit": "intelx.io_bot"
		},
		"docs": "https://intelx.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-internetvista-monitor",
		"name": "internetVista monitor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "internetVista monitor",
			"lit": "internetvista monitor"
		},
		"docs": "https://datadome.co/bots/internetvista-monitor/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-irokez-cz-monitoring",
		"name": "Irokez.cz monitoring",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Irokez\\.cz monitoring",
			"lit": "irokez.cz monitoring"
		},
		"docs": "https://datadome.co/bots/irokez-cz-monitoring/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-iubenda-radar",
		"name": "iubenda-radar/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "iubenda-radar\\/",
			"lit": "iubenda-radar/"
		},
		"docs": "https://www.iubenda.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-uptimebot",
		"name": "UptimeBot/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "UptimeBot\\/",
			"lit": "uptimebot/"
		},
		"docs": "https://jaggedpixel.co/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jetmon",
		"name": "jetmon/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "jetmon\\/",
			"lit": "jetmon/"
		},
		"docs": "https://automattic.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jobswithgptcom-bot",
		"name": "jobswithgptcom-bot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "jobswithgptcom-bot",
			"lit": "jobswithgptcom-bot"
		},
		"docs": "https://jobswithgpt.com/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-jumio",
		"name": "Jumio",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Jumio",
			"lit": "jumio"
		},
		"docs": "https://github.com/Jumio/implementation-guides/blob/master/netverify/callback.md",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kagibot",
		"name": "Kagibot/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Kagibot\\/",
			"lit": "kagibot/"
		},
		"docs": "https://kagi.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kangaroobot",
		"name": "KangarooBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "KangarooBot\\/",
			"lit": "kangaroobot/"
		},
		"docs": "https://datadome.co/bots/kangaroo-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kargobot-artemis",
		"name": "KargoBot-Artemis",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "KargoBot-Artemis",
			"lit": "kargobot-artemis"
		},
		"docs": "https://www.kargo.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kazbtbot",
		"name": "kazbtbot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "kazbtbot\\/",
			"lit": "kazbtbot/"
		},
		"docs": "http://kazbt.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-keycdn-tools",
		"name": "keycdn-tools/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "keycdn-tools\\/",
			"lit": "keycdn-tools/"
		},
		"docs": "https://tools.keycdn.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-keys-so-bot",
		"name": "keys-so-bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "keys-so-bot",
			"lit": "keys-so-bot"
		},
		"docs": "https://datadome.co/bots/keys-so-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kinsta-bot",
		"name": "kinsta-bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "kinsta-bot",
			"lit": "kinsta-bot"
		},
		"docs": "https://kinsta.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-klaviyo",
		"name": "Klaviyo/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Klaviyo\\/",
			"lit": "klaviyo/"
		},
		"docs": "https://www.klaviyo.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-kukei-eu-bot",
		"name": "Kukei.eu-Bot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Kukei\\.eu-Bot\\/",
			"lit": "kukei.eu-bot/"
		},
		"docs": "https://kukei.eu/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lac-iaharvester",
		"name": "LAC_IAHarvester",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "LAC_IAHarvester",
			"lit": "lac_iaharvester"
		},
		"docs": "https://library-archives.canada.ca/eng/services/government-canada/web-social-media-preservation-program/Pages/web-archive.aspx",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-lastmodbot",
		"name": "LastModBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "LastModBot\\/",
			"lit": "lastmodbot/"
		},
		"docs": "https://last-modified.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-legalmonster",
		"name": "LegalMonster",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "LegalMonster",
			"lit": "legalmonster"
		},
		"docs": "https://www.legalmonster.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-let-s-encrypt",
		"name": "Let's Encrypt",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Let's Encrypt",
			"lit": "let's encrypt"
		},
		"docs": "https://letsencrypt.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-level9searchbot",
		"name": "Level9SearchBot/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Level9SearchBot\\/",
			"lit": "level9searchbot/"
		},
		"docs": "https://level9.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-loc-gov-programs-web-archiving",
		"name": "loc.gov/programs/web-archiving",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "loc\\.gov\\/programs\\/web-archiving",
			"lit": "loc.gov/programs/web-archiving"
		},
		"docs": "https://www.loc.gov/programs/web-archiving/for-site-owners",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linktiger",
		"name": "LinkTiger",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "LinkTiger",
			"lit": "linktiger"
		},
		"docs": "https://linktiger.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linkace",
		"name": "LinkAce/",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "LinkAce\\/",
			"lit": "linkace/"
		},
		"docs": "https://www.linkace.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linksindexerbot",
		"name": "LinksIndexerBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "LinksIndexerBot\\/",
			"lit": "linksindexerbot/"
		},
		"docs": "https://linksindexer.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linkwalker",
		"name": "LinkWalker/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "LinkWalker\\/",
			"lit": "linkwalker/"
		},
		"docs": "https://datadome.co/bots/linkwalker/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-logicmonitor",
		"name": "LogicMonitor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "LogicMonitor",
			"lit": "logicmonitor"
		},
		"docs": "https://www.logicmonitor.com/support/about-logicmonitor/overview/logicmonitor-public-ip-addresses-dns-names",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-loomlybot",
		"name": "LoomlyBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "LoomlyBot",
			"lit": "loomlybot"
		},
		"docs": "https://www.loomly.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-macrobondbot",
		"name": "Macrobondbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Macrobondbot",
			"lit": "macrobondbot"
		},
		"docs": "https://www.macrobond.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-madbbot",
		"name": "MADBbot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MADBbot\\/",
			"lit": "madbbot/"
		},
		"docs": "https://madb.zapto.org/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-magellan",
		"name": "Magellan",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Magellan",
			"lit": "magellan"
		},
		"docs": "https://datadome.co/bots/magellan/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-magicsearchdev",
		"name": "magicsearchdev/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "magicsearchdev\\/",
			"lit": "magicsearchdev/"
		},
		"docs": "https://datadome.co/bots/magicsearchdev/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-magnet-me-web",
		"name": "Magnet.me-web/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Magnet\\.me-web\\/",
			"lit": "magnet.me-web/"
		},
		"docs": "https://magnet.me/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mainwp",
		"name": "MainWP/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MainWP\\/",
			"lit": "mainwp/"
		},
		"docs": "https://www.dshost.com.au/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-make",
		"name": "Make/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Make\\/",
			"lit": "make/"
		},
		"docs": "https://www.make.com/en/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-managewp",
		"name": "ManageWP",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ManageWP",
			"lit": "managewp"
		},
		"docs": "https://managewp.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-marketgoo",
		"name": "MarketGoo/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MarketGoo\\/",
			"lit": "marketgoo/"
		},
		"docs": "https://www.marketgoo.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-marketingminer",
		"name": "MarketingMiner",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MarketingMiner",
			"lit": "marketingminer"
		},
		"docs": "https://datadome.co/bots/marketingminer-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-dbot",
		"name": "dbot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "dbot\\)",
			"lit": "dbot)"
		},
		"docs": "https://www.marsflag.com/ja/marsfinder/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mattermost-bot",
		"name": "Mattermost-Bot/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Mattermost-Bot\\/",
			"lit": "mattermost-bot/"
		},
		"docs": "https://datadome.co/bots/mattermost-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mavifinds",
		"name": "Mavifinds",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Mavifinds",
			"lit": "mavifinds"
		},
		"docs": "https://brandimi.com/mavifinds-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mb-linkchecker",
		"name": "MB-LinkChecker",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MB-LinkChecker",
			"lit": "mb-linkchecker"
		},
		"docs": "https://www.marcobeierer.com/tools",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-medialogiabot",
		"name": "MedialogiaBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MedialogiaBot",
			"lit": "medialogiabot"
		},
		"docs": "https://www.mlg.ru/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mediamonitoringbot",
		"name": "MediaMonitoringBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MediaMonitoringBot\\/",
			"lit": "mediamonitoringbot/"
		},
		"docs": "https://mediamonitoringbot.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mediavinemetadataparser",
		"name": "MediavineMetadataParser/",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "MediavineMetadataParser\\/",
			"lit": "mediavinemetadataparser/"
		},
		"docs": "https://radar.cloudflare.com/bots/directory/mediavine-metadata-parser/mediavine.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pywikibot",
		"name": "Pywikibot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Pywikibot\\/",
			"lit": "pywikibot/"
		},
		"docs": "https://www.mediawiki.org/wiki/Manual:Pywikibot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-centcombot",
		"name": "CentComBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "CentComBot\\/",
			"lit": "centcombot/"
		},
		"docs": "https://centcom.melonmesa.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mergadobot",
		"name": "MergadoBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MergadoBot",
			"lit": "mergadobot"
		},
		"docs": "https://datadome.co/bots/mergadobot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-meta-externalhit",
		"name": "Meta-ExternalHit/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Meta-ExternalHit\\/",
			"lit": "meta-externalhit/"
		},
		"docs": "https://datadome.co/bots/meta-externalagent/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-metorik",
		"name": "Metorik",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Metorik",
			"lit": "metorik"
		},
		"docs": "https://metorik.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mgidbot",
		"name": "MgidBot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "MgidBot",
			"lit": "mgidbot"
		},
		"docs": "https://www.mgid.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-miniature-io",
		"name": "Miniature.io/",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "Miniature\\.io\\/",
			"lit": "miniature.io/"
		},
		"docs": "https://miniature.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mirrorweb-com",
		"name": "mirrorweb.com",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "mirrorweb\\.com",
			"lit": "mirrorweb.com"
		},
		"docs": "https://www.mirrorweb.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-missinglettrbot",
		"name": "MissinglettrBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MissinglettrBot\\/",
			"lit": "missinglettrbot/"
		},
		"docs": "https://missinglettr.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-crawler-eb-germany",
		"name": "crawler_eb_germany",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "crawler_eb_germany",
			"lit": "crawler_eb_germany"
		},
		"docs": "https://datadome.co/bots/crawler_eb_germany/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-modularconnector",
		"name": "ModularConnector/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ModularConnector\\/",
			"lit": "modularconnector/"
		},
		"docs": "https://uniqoders.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mollie-http-client",
		"name": "Mollie HTTP client",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Mollie HTTP client",
			"lit": "mollie http client"
		},
		"docs": "https://www.mollie.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-monibot",
		"name": "Monibot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Monibot",
			"lit": "monibot"
		},
		"docs": "https://datadome.co/bots/monibot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-monitis",
		"name": "monitis -",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "monitis -",
			"lit": "monitis -"
		},
		"docs": "https://www.monitis.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-monitorss",
		"name": "MonitoRSS/",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "MonitoRSS\\/",
			"lit": "monitorss/"
		},
		"docs": "https://monitorss.xyz/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-monspark",
		"name": "MonSpark/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "MonSpark\\/",
			"lit": "monspark/"
		},
		"docs": "https://monspark.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-montastic-monitor",
		"name": "montastic-monitor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "montastic-monitor",
			"lit": "montastic-monitor"
		},
		"docs": "https://montastic.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-montools-com",
		"name": "MonTools.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MonTools\\.com",
			"lit": "montools.com"
		},
		"docs": "https://datadome.co/bots/montools/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-motominerbot",
		"name": "MotoMinerBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MotoMinerBot\\/",
			"lit": "motominerbot/"
		},
		"docs": "https://motominer.com/Bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mrgbot",
		"name": "MRGbot/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "MRGbot\\/",
			"lit": "mrgbot/"
		},
		"docs": "https://www.mrg.ro/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mxtoolbox",
		"name": "MxToolbox",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "MxToolbox",
			"lit": "mxtoolbox"
		},
		"docs": "https://datadome.co/bots/mxtoolbox-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-my-tiny-bot",
		"name": "my-tiny-bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "my-tiny-bot",
			"lit": "my-tiny-bot"
		},
		"docs": "https://datadome.co/bots/my-tiny-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-mybot",
		"name": "MyBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "MyBot\\/",
			"lit": "mybot/"
		},
		"docs": "https://datadome.co/bots/mybot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nbertaupete95",
		"name": "nbertaupete95",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "nbertaupete95",
			"lit": "nbertaupete95"
		},
		"docs": "https://datadome.co/bots/nbertaupete95/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netapi",
		"name": "NetAPI",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "NetAPI",
			"lit": "netapi"
		},
		"docs": "https://datadome.co/bots/netapi/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netpeakcheckerbot",
		"name": "NetpeakCheckerBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "NetpeakCheckerBot\\/",
			"lit": "netpeakcheckerbot/"
		},
		"docs": "https://netpeaksoftware.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netshelter-contentscan",
		"name": "NetShelter ContentScan",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "NetShelter ContentScan",
			"lit": "netshelter contentscan"
		},
		"docs": "https://datadome.co/bots/netshelter-contentscan/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-netvigie",
		"name": "NETVIGIE",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "NETVIGIE",
			"lit": "netvigie"
		},
		"docs": "https://netvigie.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-newrelicbot",
		"name": "NewRelicbot/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "NewRelicbot\\/",
			"lit": "newrelicbot/"
		},
		"docs": "https://newrelic.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nyt-scraping",
		"name": "nyt_scraping",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "nyt_scraping",
			"lit": "nyt_scraping"
		},
		"docs": "https://int.nyt.com/assets/scraping.json",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-newsnow",
		"name": "NewsNow/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "NewsNow\\/",
			"lit": "newsnow/"
		},
		"docs": "https://www.newsnow.co.uk/h/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nlnz-iaharvester",
		"name": "NLNZ_IAHarvester",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "NLNZ_IAHarvester",
			"lit": "nlnz_iaharvester"
		},
		"docs": "https://natlib.govt.nz/publishers-and-authors/web-harvesting",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nodeping",
		"name": "NodePing",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "NodePing",
			"lit": "nodeping"
		},
		"docs": "https://datadome.co/bots/nodeping/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nomore404-com-robot",
		"name": "nomore404.com robot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "nomore404\\.com robot",
			"lit": "nomore404.com robot"
		},
		"docs": "https://datadome.co/bots/nomore404-com-robot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-noorobot",
		"name": "noorobot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "noorobot",
			"lit": "noorobot"
		},
		"docs": "https://noordigital.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nooshub",
		"name": "Nooshub/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Nooshub\\/",
			"lit": "nooshub/"
		},
		"docs": "https://www.nooshub.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-notabot",
		"name": "Notabot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Notabot",
			"lit": "notabot"
		},
		"docs": "https://corp.helpfeel.com/ja/home",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-novellum",
		"name": "Novellum",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "Novellum",
			"lit": "novellum"
		},
		"docs": "https://crawl.corp.novellum.ai/docs",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nstoolsbot",
		"name": "NsToolsBot/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "NsToolsBot\\/",
			"lit": "nstoolsbot/"
		},
		"docs": "https://ns.tools/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-nvdorz",
		"name": "nvdorz",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "nvdorz",
			"lit": "nvdorz"
		},
		"docs": "https://datadome.co/bots/nvdorz/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-odin",
		"name": "Odin;",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Odin;",
			"lit": "odin;"
		},
		"docs": "https://docs.getodin.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-offline-explorer",
		"name": "Offline Explorer",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "Offline Explorer",
			"lit": "offline explorer"
		},
		"docs": "https://datadome.co/bots/offline-explorer/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ohdear",
		"name": "OhDear/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "OhDear\\/",
			"lit": "ohdear/"
		},
		"docs": "https://ohdear.app/docs/faq/what-is-the-oh-dear-checker",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-omnisend",
		"name": "Omnisend/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Omnisend\\/",
			"lit": "omnisend/"
		},
		"docs": "https://bots.omnisend.io/cf.txt",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-online-domain-tools",
		"name": "Online Domain Tools",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Online Domain Tools",
			"lit": "online domain tools"
		},
		"docs": "https://datadome.co/bots/online-domain-tools/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webceo-online",
		"name": "WebCEO Online/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WebCEO Online\\/",
			"lit": "webceo online/"
		},
		"docs": "https://datadome.co/bots/online-webceo-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-onlineornot-com-bot",
		"name": "OnlineOrNot.com_bot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "OnlineOrNot\\.com_bot",
			"lit": "onlineornot.com_bot"
		},
		"docs": "https://onlineornot.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-opengraph-io",
		"name": "OpenGraph.io/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "OpenGraph\\.io\\/",
			"lit": "opengraph.io/"
		},
		"docs": "https://www.opengraph.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-openrss",
		"name": "OpenRSS",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "OpenRSS",
			"lit": "openrss"
		},
		"docs": "https://openrss.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-openvas",
		"name": "OpenVAS",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "OpenVAS",
			"lit": "openvas"
		},
		"docs": "https://openvas.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-owler-ows-eu",
		"name": "Owler ows.eu",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Owler \\(ows\\.eu",
			"lit": "owler (ows.eu"
		},
		"docs": "https://ows.eu/owler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-orbbot",
		"name": "Orbbot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Orbbot\\/",
			"lit": "orbbot/"
		},
		"docs": "https://datadome.co/bots/orbbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zebra-v2-bot",
		"name": "zebra-v2-bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "zebra-v2-bot",
			"lit": "zebra-v2-bot"
		},
		"docs": "https://datadome.co/bots/zebra-v2-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-orlo-linkpreview",
		"name": "Orlo-LinkPreview/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Orlo-LinkPreview\\/",
			"lit": "orlo-linkpreview/"
		},
		"docs": "https://orlo.tech/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-cozi-icalendar-feedreader",
		"name": "Cozi-iCalendar-FeedReader",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Cozi-iCalendar-FeedReader",
			"lit": "cozi-icalendar-feedreader"
		},
		"docs": "https://ourfamilywizard.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-outsellurlvalidator",
		"name": "OutsellURLValidator",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "OutsellURLValidator",
			"lit": "outsellurlvalidator"
		},
		"docs": "https://www.outsell.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-overcast",
		"name": "Overcast/",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Overcast\\/",
			"lit": "overcast/"
		},
		"docs": "https://overcast.fm/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-prtgcloudbot",
		"name": "PRTGCloudBot/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "PRTGCloudBot\\/",
			"lit": "prtgcloudbot/"
		},
		"docs": "https://www.paessler.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pagespeed",
		"name": "Pagespeed/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Pagespeed\\/",
			"lit": "pagespeed/"
		},
		"docs": "http://www.pagespeed.de/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-panopta",
		"name": "Panopta",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Panopta",
			"lit": "panopta"
		},
		"docs": "https://www.panopta.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-paqlebot",
		"name": "Paqlebot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Paqlebot\\/",
			"lit": "paqlebot/"
		},
		"docs": "http://www.paqle.dk/about/paqlebot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-parse-ly-scraper",
		"name": "parse.ly scraper/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "parse\\.ly scraper\\/",
			"lit": "parse.ly scraper/"
		},
		"docs": "https://www.parse.ly/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-paypal",
		"name": "PayPal/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PayPal\\/",
			"lit": "paypal/"
		},
		"docs": "https://www.paypal.com/ipn",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pdf24-url-to-pdf",
		"name": "PDF24 URL To PDF",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PDF24 URL To PDF",
			"lit": "pdf24 url to pdf"
		},
		"docs": "https://tools.pdf24.org/webpage-to-pdf",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pingadmin-ru",
		"name": "PingAdmin.Ru/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "PingAdmin\\.Ru\\/",
			"lit": "pingadmin.ru/"
		},
		"docs": "http://ping-admin.ru/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pingping-io",
		"name": "pingping.io/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "pingping\\.io\\/",
			"lit": "pingping.io/"
		},
		"docs": "https://pingping.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-playstore-google",
		"name": "PlayStore-Google",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "PlayStore-Google",
			"lit": "playstore-google"
		},
		"docs": "https://support.google.com/webmasters/answer/1061943",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-plesk-screenshot-bot",
		"name": "Plesk screenshot bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Plesk screenshot bot",
			"lit": "plesk screenshot bot"
		},
		"docs": "https://www.plesk.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pocketcasts",
		"name": "PocketCasts/",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "PocketCasts\\/",
			"lit": "pocketcasts/"
		},
		"docs": "https://support.pocketcasts.com/knowledge-base/pocket-casts-feed-parser/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-potions",
		"name": "Potions/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Potions\\/",
			"lit": "potions/"
		},
		"docs": "https://get-potions.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pressenginebot",
		"name": "PressEngineBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PressEngineBot",
			"lit": "pressenginebot"
		},
		"docs": "https://www.pressengine.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pricedroneshoppingbot",
		"name": "PricedroneShoppingBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PricedroneShoppingBot\\/",
			"lit": "pricedroneshoppingbot/"
		},
		"docs": "http://pricedrone.com/robot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-priecobot",
		"name": "PriEcoBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PriEcoBot\\/",
			"lit": "priecobot/"
		},
		"docs": "https://datadome.co/bots/priecobot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-printfriendly-com",
		"name": "PrintFriendly.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PrintFriendly\\.com",
			"lit": "printfriendly.com"
		},
		"docs": "https://www.printfriendly.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pro-sitemaps",
		"name": "Pro-Sitemaps/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Pro-Sitemaps\\/",
			"lit": "pro-sitemaps/"
		},
		"docs": "https://pro-sitemaps.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-probelyspdr",
		"name": "ProbelySPDR/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "ProbelySPDR\\/",
			"lit": "probelyspdr/"
		},
		"docs": "https://probely.com/sos",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-projectshield-urlcheck",
		"name": "ProjectShield-UrlCheck",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "ProjectShield-UrlCheck",
			"lit": "projectshield-urlcheck"
		},
		"docs": "https://projectshield.withgoogle.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-blackbox-exporter",
		"name": "Blackbox Exporter/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Blackbox Exporter\\/",
			"lit": "blackbox exporter/"
		},
		"docs": "https://github.com/prometheus/blackbox_exporter",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-protopage",
		"name": "Protopage/",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Protopage\\/",
			"lit": "protopage/"
		},
		"docs": "https://datadome.co/bots/protopage/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ps-daily",
		"name": "PS_Daily/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PS_Daily\\/",
			"lit": "ps_daily/"
		},
		"docs": "https://datadome.co/bots/ps-daily/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pulsetic-com",
		"name": "pulsetic.com",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "pulsetic\\.com",
			"lit": "pulsetic.com"
		},
		"docs": "https://pulsetic.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-pwabuilderhttpagent",
		"name": "PWABuilderHttpAgent",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "PWABuilderHttpAgent",
			"lit": "pwabuilderhttpagent"
		},
		"docs": "https://www.pwabuilder.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-quantcastbot",
		"name": "Quantcastbot/",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Quantcastbot\\/",
			"lit": "quantcastbot/"
		},
		"docs": "http://www.quantcast.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rackspace-monitoring",
		"name": "Rackspace Monitoring/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Rackspace Monitoring\\/",
			"lit": "rackspace monitoring/"
		},
		"docs": "https://support.rackspace.com/how-to/about-the-rackspace-monitoring-agent/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rakutenusabot-image",
		"name": "rakutenusabot-image/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "rakutenusabot-image\\/",
			"lit": "rakutenusabot-image/"
		},
		"docs": "https://product-image.ebates.com/item-gsp/rakutenusabot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-top100-rambler-ru-crawler",
		"name": "top100.rambler.ru crawler",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "top100\\.rambler\\.ru crawler",
			"lit": "top100.rambler.ru crawler"
		},
		"docs": "https://datadome.co/bots/rambler-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rankurbot",
		"name": "RankurBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RankurBot\\/",
			"lit": "rankurbot/"
		},
		"docs": "http://rankur.com/technology.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ravencrawler",
		"name": "RavenCrawler/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RavenCrawler\\/",
			"lit": "ravencrawler/"
		},
		"docs": "https://datadome.co/bots/ravencrawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-readable",
		"name": "Readable/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Readable\\/",
			"lit": "readable/"
		},
		"docs": "https://readable.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-recurly-webhooks",
		"name": "Recurly Webhooks/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Recurly Webhooks\\/",
			"lit": "recurly webhooks/"
		},
		"docs": "https://docs.recurly.com/docs/webhooks",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-red",
		"name": "RED/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "RED\\/",
			"lit": "red/"
		},
		"docs": "https://redbot.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-reelevant",
		"name": "Reelevant/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Reelevant\\/",
			"lit": "reelevant/"
		},
		"docs": "https://reelevant.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-remove-bg",
		"name": "remove.bg/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "remove\\.bg\\/",
			"lit": "remove.bg/"
		},
		"docs": "https://www.remove.bg/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-retool",
		"name": "Retool/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Retool\\/",
			"lit": "retool/"
		},
		"docs": "https://docs.tryretool.com/docs/apis",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-retrolistecom",
		"name": "RetroListeCOM/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RetroListeCOM\\/",
			"lit": "retrolistecom/"
		},
		"docs": "https://retroliste.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-revvimgort",
		"name": "RevvimGort/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RevvimGort\\/",
			"lit": "revvimgort/"
		},
		"docs": "https://revvim.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-reward-gateway",
		"name": "reward-gateway",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "reward-gateway",
			"lit": "reward-gateway"
		},
		"docs": "https://www.rewardgateway.co",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-riddler-http-riddler-io",
		"name": "Riddler http://riddler.io",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Riddler \\(http:\\/\\/riddler\\.io",
			"lit": "riddler (http://riddler.io"
		},
		"docs": "http://riddler.io/about",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-robotschecker",
		"name": "RobotsChecker/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "RobotsChecker\\/",
			"lit": "robotschecker/"
		},
		"docs": "http://www.blocked.org.uk/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rssapi",
		"name": "RSSAPI/",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "RSSAPI\\/",
			"lit": "rssapi/"
		},
		"docs": "https://rssapi.net",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rss2tg",
		"name": "rss2tg",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "rss2tg",
			"lit": "rss2tg"
		},
		"docs": "https://rss2tg.duck.consulting",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rssreaderbot",
		"name": "RssReaderBot",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "RssReaderBot",
			"lit": "rssreaderbot"
		},
		"docs": "https://datadome.co/bots/rssreaderbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sfdc-callout",
		"name": "SFDC-Callout/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SFDC-Callout\\/",
			"lit": "sfdc-callout/"
		},
		"docs": "https://help.salesforce.com/articleView?id=000321501&type=1&mode=1",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-page-preview-tool",
		"name": "page-preview-tool",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "page-preview-tool",
			"lit": "page-preview-tool"
		},
		"docs": "https://www.salesviewer.com/en/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sandobacrawler",
		"name": "SandobaCrawler/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SandobaCrawler\\/",
			"lit": "sandobacrawler/"
		},
		"docs": "https://www.sandoba.com/en/crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sansec-security-monitor",
		"name": "Sansec Security Monitor/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Sansec Security Monitor\\/",
			"lit": "sansec security monitor/"
		},
		"docs": "https://sansec.io/monitor",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-giftedvisitor-scan",
		"name": "GIFTEDVISITOR SCAN",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "GIFTEDVISITOR SCAN",
			"lit": "giftedvisitor scan"
		},
		"docs": "https://datadome.co/bots/scan/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-schema-markup-validator",
		"name": "Schema-Markup-Validator",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Schema-Markup-Validator",
			"lit": "schema-markup-validator"
		},
		"docs": "https://validator.schema.org/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scoop-it",
		"name": "Scoop.it/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Scoop\\.it\\/",
			"lit": "scoop.it/"
		},
		"docs": "https://datadome.co/bots/scoop-it/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scourrssbot",
		"name": "ScourRSSBot/",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "ScourRSSBot\\/",
			"lit": "scourrssbot/"
		},
		"docs": "https://scour.ing/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scrapeherobot",
		"name": "ScrapeheroBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ScrapeheroBot\\/",
			"lit": "scrapeherobot/"
		},
		"docs": "https://scrapehero.de/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-screeenly-bot",
		"name": "screeenly-bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "screeenly-bot",
			"lit": "screeenly-bot"
		},
		"docs": "https://3.screeenly.com/ua",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sebot-wa",
		"name": "SEBot-WA",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SEBot-WA",
			"lit": "sebot-wa"
		},
		"docs": "https://help.seranking.com/en/project-tools/website-audit/overview",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-searcherweb",
		"name": "Searcherweb",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Searcherweb",
			"lit": "searcherweb"
		},
		"docs": "https://datadome.co/bots/searcherweb/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-searcherxweb",
		"name": "Searcherxweb",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Searcherxweb",
			"lit": "searcherxweb"
		},
		"docs": "https://datadome.co/bots/searcherxweb/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-searchexpress",
		"name": "SearchExpress",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "SearchExpress",
			"lit": "searchexpress"
		},
		"docs": "https://datadome.co/bots/searchexpress/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-securityheaders",
		"name": "SecurityHeaders",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "SecurityHeaders",
			"lit": "securityheaders"
		},
		"docs": "https://securityheaders.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-semaltbot",
		"name": "semaltbot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "semaltbot\\/",
			"lit": "semaltbot/"
		},
		"docs": "https://datadome.co/bots/semaltbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sendgrid-event-api",
		"name": "SendGrid Event API",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SendGrid Event API",
			"lit": "sendgrid event api"
		},
		"docs": "https://sendgrid.com/docs/for-developers/tracking-events/event/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sentryuptimebot",
		"name": "SentryUptimeBot/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "SentryUptimeBot\\/",
			"lit": "sentryuptimebot/"
		},
		"docs": "https://docs.sentry.io/product/alerts/uptime-monitoring/troubleshooting/#verify-firewall-configuration",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seo-audit-check-bot",
		"name": "seo-audit-check-bot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "seo-audit-check-bot\\/",
			"lit": "seo-audit-check-bot/"
		},
		"docs": "https://www.webceo.com/webceo-bots.htm",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-s4a",
		"name": "s4a/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "s4a\\/",
			"lit": "s4a/"
		},
		"docs": "https://www.seo4ajax.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-claritybot",
		"name": "ClarityBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "ClarityBot\\/",
			"lit": "claritybot/"
		},
		"docs": "https://www.seoclarity.net/bot.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seositecheckup",
		"name": "SeoSiteCheckup",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SeoSiteCheckup",
			"lit": "seositecheckup"
		},
		"docs": "https://datadome.co/bots/seositecheckup/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seoulbot",
		"name": "SeoulBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SeoulBot",
			"lit": "seoulbot"
		},
		"docs": "https://datadome.co/bots/seoulbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-serptimizerbot",
		"name": "SERPtimizerBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SERPtimizerBot",
			"lit": "serptimizerbot"
		},
		"docs": "http://serptimizer.com/serptimizer-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-server-density-service-monitoring",
		"name": "Server Density Service Monitoring",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Server Density Service Monitoring",
			"lit": "server density service monitoring"
		},
		"docs": "https://www.stackpath.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-seznamhomepagecrawler",
		"name": "SeznamHomepageCrawler/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "SeznamHomepageCrawler\\/",
			"lit": "seznamhomepagecrawler/"
		},
		"docs": "http://napoveda.seznam.cz/en/seznambot-intro/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-shopify-captain-hook",
		"name": "Shopify-Captain-Hook",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Shopify-Captain-Hook",
			"lit": "shopify-captain-hook"
		},
		"docs": "https://shopify.dev/docs/apps/build/webhooks",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-shortwave-image-fetcher",
		"name": "Shortwave Image Fetcher",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Shortwave Image Fetcher",
			"lit": "shortwave image fetcher"
		},
		"docs": "https://www.shortwave.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-linkreader",
		"name": "linkReader/",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "linkReader\\/",
			"lit": "linkreader/"
		},
		"docs": "https://sider.ai/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-silk",
		"name": "Silk/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "^Silk\\/",
			"lit": "silk/"
		},
		"docs": "https://www.useragentstring.com/pages/silk/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sincerasyntheticuser",
		"name": "SinceraSyntheticUser/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SinceraSyntheticUser\\/",
			"lit": "sincerasyntheticuser/"
		},
		"docs": "https://datadome.co/bots/sincera-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-optimizer",
		"name": "Optimizer",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Optimizer\\)",
			"lit": "optimizer)"
		},
		"docs": "https://www.sistrix.com/faq/uptime",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-siteauditbot",
		"name": "SiteAuditBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SiteAuditBot\\/",
			"lit": "siteauditbot/"
		},
		"docs": "https://datadome.co/bots/siteauditbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sitecheck-sitecrawl",
		"name": "SiteCheck-sitecrawl",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SiteCheck-sitecrawl",
			"lit": "sitecheck-sitecrawl"
		},
		"docs": "https://support.siteimprove.com/hc/en-gb/articles/206345523-What-IP-addresses-and-user-agents-are-used-by-Siteimprove-",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sitescorebot",
		"name": "SiteScoreBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SiteScoreBot",
			"lit": "sitescorebot"
		},
		"docs": "https://datadome.co/bots/sitescorebot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sitesearch360",
		"name": "SiteSearch360/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "SiteSearch360\\/",
			"lit": "sitesearch360/"
		},
		"docs": "https://www.sitesearch360.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-siteuptime-com",
		"name": "SiteUptime.com",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "SiteUptime\\.com",
			"lit": "siteuptime.com"
		},
		"docs": "https://datadome.co/bots/siteuptime-com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-konturbot",
		"name": "Konturbot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Konturbot\\/",
			"lit": "konturbot/"
		},
		"docs": "https://datadome.co/bots/skb-kontur-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-skroutzbot",
		"name": "SkroutzBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SkroutzBot",
			"lit": "skroutzbot"
		},
		"docs": "https://www.skroutz.gr/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-slickbot",
		"name": "SlickBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SlickBot\\/",
			"lit": "slickbot/"
		},
		"docs": "https://www.slickstream.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-smartologybot",
		"name": "SmartologyBot/",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "SmartologyBot\\/",
			"lit": "smartologybot/"
		},
		"docs": "https://smartology.net/smartologybot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-snapurlpreview",
		"name": "SnapURLPreview/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "SnapURLPreview\\/",
			"lit": "snapurlpreview/"
		},
		"docs": "https://business.snapchat.com/legal/snapchat-automated-crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-snapchatads",
		"name": "SnapchatAds/",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "SnapchatAds\\/",
			"lit": "snapchatads/"
		},
		"docs": "https://businesshelp.snapchat.com/s/article/adsbot-crawler",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-snipcart",
		"name": "Snipcart/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Snipcart\\/",
			"lit": "snipcart/"
		},
		"docs": "https://snipcart.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-solarwinds",
		"name": "solarwinds/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "solarwinds\\/",
			"lit": "solarwinds/"
		},
		"docs": "https://documentation.solarwinds.com/en/success_center/observability/content/get-started/dem_getting_started_guide.htm",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sora-pos",
		"name": "Sora POS/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Sora POS\\/",
			"lit": "sora pos/"
		},
		"docs": "https://www.sora-caisse.com/sora.pdf",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sparkshipping",
		"name": "SparkShipping",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SparkShipping",
			"lit": "sparkshipping"
		},
		"docs": "https://www.sparkshipping.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sparkpost",
		"name": "SparkPost",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SparkPost",
			"lit": "sparkpost"
		},
		"docs": "https://www.sparkpost.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-spawning-ai",
		"name": "Spawning-AI",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "Spawning-AI",
			"lit": "spawning-ai"
		},
		"docs": "https://datadome.co/bots/spawning-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-idg-eu",
		"name": "IDG/EU",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "IDG\\/EU",
			"lit": "idg/eu"
		},
		"docs": "https://datadome.co/bots/spaziodati-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-specificfeeds",
		"name": "Specificfeeds",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "Specificfeeds",
			"lit": "specificfeeds"
		},
		"docs": "https://follow.it/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-spectate",
		"name": "Spectate/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Spectate\\/",
			"lit": "spectate/"
		},
		"docs": "https://docs.spectate.net/faq/uptime-monitor-bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-splash-version",
		"name": "splash Version/",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "splash Version\\/",
			"lit": "splash version/"
		},
		"docs": "https://www.zyte.com/splash/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-rigor",
		"name": "Rigor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Rigor\\)",
			"lit": "rigor)"
		},
		"docs": "https://www.splunk.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-twinwavescanner",
		"name": "TwinWaveScanner",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "TwinWaveScanner",
			"lit": "twinwavescanner"
		},
		"docs": "https://www.splunk.com/en_us/products/attack-analyzer.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ssl-labs-https-www-ssllabs-com",
		"name": "SSL Labs https://www.ssllabs.com",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "SSL Labs \\(https:\\/\\/www\\.ssllabs\\.com",
			"lit": "ssl labs (https://www.ssllabs.com"
		},
		"docs": "https://www.ssllabs.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ssssbot",
		"name": "SSSSBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SSSSBot\\/",
			"lit": "ssssbot/"
		},
		"docs": "https://datadome.co/bots/ssssbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-stape",
		"name": "Stape/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Stape\\/",
			"lit": "stape/"
		},
		"docs": "https://stape.io/helpdesk/documentation/stape-scanner",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-startpageprivateimageproxy",
		"name": "StartpagePrivateImageProxy/",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "StartpagePrivateImageProxy\\/",
			"lit": "startpageprivateimageproxy/"
		},
		"docs": "https://datadome.co/bots/startpage-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-statabot",
		"name": "Statabot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Statabot\\/",
			"lit": "statabot/"
		},
		"docs": "https://www.stata.com/support/statabot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-statistikaustria",
		"name": "StatistikAustria/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "StatistikAustria\\/",
			"lit": "statistikaustria/"
		},
		"docs": "https://www.statistik.at/ueber-uns/innovationen-und-experimentelle-statistik/einsatz-von-kassenscannerdaten-und-webscraping-in-der-preisstatistik",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-statsdronebot",
		"name": "StatsDroneBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "StatsDroneBot",
			"lit": "statsdronebot"
		},
		"docs": "https://statsdrone.com/statsdrone-bot-documentation/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-stripe",
		"name": "Stripe/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Stripe\\/",
			"lit": "stripe/"
		},
		"docs": "https://stripe.com/docs/webhooks",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-sucuri",
		"name": "Sucuri",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Sucuri",
			"lit": "sucuri"
		},
		"docs": "https://blog.sucuri.net/2012/10/ask-sucuri-how-does-sitecheck-work.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-svix-webhooks",
		"name": "Svix-Webhooks/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Svix-Webhooks\\/",
			"lit": "svix-webhooks/"
		},
		"docs": "https://docs.svix.com/receiving/source-ips",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-swifteqlinkchecker",
		"name": "SwifteqLinkChecker",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "SwifteqLinkChecker",
			"lit": "swifteqlinkchecker"
		},
		"docs": "https://www.swifteq.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-swisscows",
		"name": "Swisscows",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "Swisscows",
			"lit": "swisscows"
		},
		"docs": "https://swisscows.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-datadog-synthetic",
		"name": "Datadog Synthetic",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Datadog Synthetic",
			"lit": "datadog synthetic"
		},
		"docs": "https://docs.datadoghq.com/synthetics/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tactiscout",
		"name": "TactiScout/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "TactiScout\\/",
			"lit": "tactiscout/"
		},
		"docs": "http://find-it.world/TempCrawl/Crawltheque.php",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tchelebi",
		"name": "tchelebi/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "tchelebi\\/",
			"lit": "tchelebi/"
		},
		"docs": "https://tchelebi.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-bitdiscovery",
		"name": "bitdiscovery",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "bitdiscovery",
			"lit": "bitdiscovery"
		},
		"docs": "https://www.tenable.com/products/tenable-asm",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-test-certificate-info",
		"name": "Test Certificate Info",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Test Certificate Info",
			"lit": "test certificate info"
		},
		"docs": "https://datadome.co/bots/test-certificate-info/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-testcrawler",
		"name": "Testcrawler",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Testcrawler",
			"lit": "testcrawler"
		},
		"docs": "https://datadome.co/bots/testcrawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-test-bot",
		"name": "test-bot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "test-bot",
			"lit": "test-bot"
		},
		"docs": "https://datadome.co/bots/test-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-testlocally",
		"name": "TestLocally/",
		"operator": "Unknown",
		"category": "headless_automation",
		"match": {
			"mode": "regex",
			"pattern": "TestLocally\\/",
			"lit": "testlocally/"
		},
		"docs": "https://testlocal.ly/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-testuri",
		"name": "TestURI",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "TestURI",
			"lit": "testuri"
		},
		"docs": "https://datadome.co/bots/testuri-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-textrazor",
		"name": "TextRazor",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "TextRazor",
			"lit": "textrazor"
		},
		"docs": "https://datadome.co/bots/textrazor-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-the-knowledge-ai",
		"name": "The Knowledge AI",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "The Knowledge AI",
			"lit": "the knowledge ai"
		},
		"docs": "https://datadome.co/bots/the-knowledge-ai/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-theinternetsearchx",
		"name": "TheInternetSearchx",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "TheInternetSearchx",
			"lit": "theinternetsearchx"
		},
		"docs": "https://datadome.co/bots/theinternetsearch/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-thesis-research-bot",
		"name": "thesis-research-bot",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "thesis-research-bot",
			"lit": "thesis-research-bot"
		},
		"docs": "https://datadome.co/bots/thesis-research-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-trellis-services",
		"name": "Trellis-Services",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Trellis-Services",
			"lit": "trellis-services"
		},
		"docs": "https://www.mediavine.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-trentwil-es",
		"name": "trentwil.es",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "trentwil\\.es",
			"lit": "trentwil.es"
		},
		"docs": "https://trentwil.es/domains.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-trustly",
		"name": "Trustly/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Trustly\\/",
			"lit": "trustly/"
		},
		"docs": "https://www.trustly.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ttd-content",
		"name": "TTD-Content",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "TTD-Content",
			"lit": "ttd-content"
		},
		"docs": "https://www.thetradedesk.com/us/ttd-content",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tweakers",
		"name": "Tweakers",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Tweakers",
			"lit": "tweakers"
		},
		"docs": "https://tweakers.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-twilioproxy",
		"name": "TwilioProxy/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "TwilioProxy\\/",
			"lit": "twilioproxy/"
		},
		"docs": "https://www.upday.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-uaslinkchecker",
		"name": "UASlinkChecker/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "UASlinkChecker\\/",
			"lit": "uaslinkchecker/"
		},
		"docs": "https://udger.com/support/UASlinkChecker",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-hgfalphaxcrawl",
		"name": "hgfAlphaXCrawl/",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "hgfAlphaXCrawl\\/",
			"lit": "hgfalphaxcrawl/"
		},
		"docs": "https://datadome.co/bots/uni-passau_bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-unshorten-it",
		"name": "Unshorten.It!",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "Unshorten\\.It\\!",
			"lit": "unshorten.it!"
		},
		"docs": "https://unshorten.it/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-updown-io",
		"name": "updown.io",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "updown\\.io",
			"lit": "updown.io"
		},
		"docs": "https://updown.io",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-uptime",
		"name": "Uptime/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Uptime\\/",
			"lit": "uptime/"
		},
		"docs": "https://uptime.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-uptimedoctor",
		"name": "uptimedoctor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "uptimedoctor",
			"lit": "uptimedoctor"
		},
		"docs": "http://uptimestatistics.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-uptimia",
		"name": "Uptimia",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "Uptimia",
			"lit": "uptimia"
		},
		"docs": "https://datadome.co/bots/uptimia/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-uptrends",
		"name": "uptrends",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "uptrends",
			"lit": "uptrends"
		},
		"docs": "https://www.uptrends.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-urlcheckr",
		"name": "Urlcheckr/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Urlcheckr\\/",
			"lit": "urlcheckr/"
		},
		"docs": "https://www.urlcheckr.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-urlsumabot",
		"name": "URLSuMaBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "URLSuMaBot",
			"lit": "urlsumabot"
		},
		"docs": "https://www.urlsuma.de/bot.aspx",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-useebookchecker",
		"name": "useeBookChecker/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "useeBookChecker\\/",
			"lit": "useebookchecker/"
		},
		"docs": "https://datadome.co/bots/useebookchecker/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vagabondo",
		"name": "Vagabondo/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Vagabondo\\/",
			"lit": "vagabondo/"
		},
		"docs": "https://datadome.co/bots/vagabondo-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vaultpress",
		"name": "VaultPress",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "VaultPress",
			"lit": "vaultpress"
		},
		"docs": "https://vaultpress.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-videootvbot",
		"name": "videootvBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "videootvBot",
			"lit": "videootvbot"
		},
		"docs": "https://videoo.tv/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-vu-server-health-scanner",
		"name": "vu-server-health-scanner/",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "vu-server-health-scanner\\/",
			"lit": "vu-server-health-scanner/"
		},
		"docs": "http://130.37.198.75/index.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-websiteops",
		"name": "WebsiteOps",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WebsiteOps",
			"lit": "websiteops"
		},
		"docs": "https://watchful.net/faqs/technical-support/how-do-i-whitelist-the-watchful-ip-address",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-watchmouse",
		"name": "WatchMouse",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WatchMouse",
			"lit": "watchmouse"
		},
		"docs": "https://asm.saas.broadcom.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-web-measure",
		"name": "Web Measure/",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Web Measure\\/",
			"lit": "web measure/"
		},
		"docs": "https://webresearch.eecs.umich.edu/overview-of-web-measurements/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webflow",
		"name": "Webflow",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Webflow",
			"lit": "webflow"
		},
		"docs": "https://datadome.co/bots/webflow-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webgains-bot",
		"name": "webgains-bot",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "webgains-bot",
			"lit": "webgains-bot"
		},
		"docs": "https://datadome.co/bots/webgains-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webprosbot",
		"name": "webprosbot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "webprosbot\\/",
			"lit": "webprosbot/"
		},
		"docs": "https://datadome.co/bots/webprosbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-websitepulse",
		"name": "websitepulse",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "websitepulse",
			"lit": "websitepulse"
		},
		"docs": "https://www.websitepulse.com/kb/websitepulse",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-websniffer",
		"name": "WebSniffer/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WebSniffer\\/",
			"lit": "websniffer/"
		},
		"docs": "http://websniffer.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-webwikibot",
		"name": "WebwikiBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WebwikiBot\\/",
			"lit": "webwikibot/"
		},
		"docs": "https://www.webwiki.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wedos-online",
		"name": "WEDOS OnLine",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WEDOS OnLine",
			"lit": "wedos online"
		},
		"docs": "https://www.wedos.online",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-whatweb",
		"name": "WhatWeb/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "WhatWeb\\/",
			"lit": "whatweb/"
		},
		"docs": "https://www.whatweb.net/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wheregoes-com",
		"name": "Wheregoes.com",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Wheregoes\\.com",
			"lit": "wheregoes.com"
		},
		"docs": "https://wheregoes.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wheresitup-com",
		"name": "wheresitup.com/",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "wheresitup\\.com\\/",
			"lit": "wheresitup.com/"
		},
		"docs": "https://wheresitup.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-citoid",
		"name": "Citoid",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "Citoid",
			"lit": "citoid"
		},
		"docs": "https://www.mediawiki.org/wiki/Citoid",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wirereaderbot",
		"name": "WireReaderBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WireReaderBot\\/",
			"lit": "wirereaderbot/"
		},
		"docs": "https://datadome.co/bots/wirereaderbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zoterotranslationserver-wmf",
		"name": "ZoteroTranslationServer/WMF",
		"operator": "Unknown",
		"category": "scraper_generic",
		"match": {
			"mode": "regex",
			"pattern": "ZoteroTranslationServer\\/WMF",
			"lit": "zoterotranslationserver/wmf"
		},
		"docs": "https://wikitech.wikimedia.org/wiki/Zotero",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wmtips-com",
		"name": "wmtips.com/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "wmtips\\.com\\/",
			"lit": "wmtips.com/"
		},
		"docs": "http://www.wmtips.com/tools/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wordcountbot",
		"name": "WordCountBot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WordCountBot\\/",
			"lit": "wordcountbot/"
		},
		"docs": "https://weglot.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wordup-1",
		"name": "Wordup-1",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Wordup-1",
			"lit": "wordup-1"
		},
		"docs": "https://datadome.co/bots/wordup-1/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-workona-favicon-service",
		"name": "workona-favicon-service/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "workona-favicon-service\\/",
			"lit": "workona-favicon-service/"
		},
		"docs": "https://datadome.co/bots/workona-bot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-indy-library",
		"name": "Indy Library",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Indy Library",
			"lit": "indy library"
		},
		"docs": "https://secure.ogone.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wjhro",
		"name": "WJHRO/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WJHRO\\/",
			"lit": "wjhro/"
		},
		"docs": "https://docs.worldpay.com/apis",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wormlybot",
		"name": "WormlyBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WormlyBot",
			"lit": "wormlybot"
		},
		"docs": "https://www.wormly.com/help/server-monitoring/website",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wovncrawler",
		"name": "WovnCrawler/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WovnCrawler\\/",
			"lit": "wovncrawler/"
		},
		"docs": "https://support.wovn.io/hc/ja/articles/360043165091",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wowlink-crawler",
		"name": "wowLink Crawler/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "wowLink Crawler\\/",
			"lit": "wowlink crawler/"
		},
		"docs": "https://datadome.co/bots/wowlink-crawler/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wp-time-capsule",
		"name": "WP Time Capsule",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "WP Time Capsule",
			"lit": "wp time capsule"
		},
		"docs": "https://docs.wptimecapsule.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wpumbrella",
		"name": "WPUmbrella",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WPUmbrella",
			"lit": "wpumbrella"
		},
		"docs": "https://wp-umbrella.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wpmudev-uptime-monitor",
		"name": "WPMUDEV Uptime Monitor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WPMUDEV Uptime Monitor",
			"lit": "wpmudev uptime monitor"
		},
		"docs": "https://wpmudev.com/monitor/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-wpsec",
		"name": "WPSec/",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "WPSec\\/",
			"lit": "wpsec/"
		},
		"docs": "https://wpsec.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-abuse-xmco-fr",
		"name": "abuse.xmco.fr",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "abuse\\.xmco\\.fr",
			"lit": "abuse.xmco.fr"
		},
		"docs": "https://abuse.xmco.fr/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-xy-archive-compliance",
		"name": "XY-Archive-Compliance",
		"operator": "Unknown",
		"category": "archiver",
		"match": {
			"mode": "regex",
			"pattern": "XY-Archive-Compliance",
			"lit": "xy-archive-compliance"
		},
		"docs": "https://xy-archive.helpscoutdocs.com/article/61-does-xy-archive-have-a-dedicated-ip-address",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yahoo-ad-monitoring",
		"name": "Yahoo Ad monitoring",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Yahoo Ad monitoring",
			"lit": "yahoo ad monitoring"
		},
		"docs": "https://developer.yahoo.com/api/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yahoomailproxy",
		"name": "YahooMailProxy",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "YahooMailProxy",
			"lit": "yahoomailproxy"
		},
		"docs": "https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yahoocachesystem",
		"name": "YahooCacheSystem",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "YahooCacheSystem",
			"lit": "yahoocachesystem"
		},
		"docs": "https://developer.yahoo.com/oauth2/guide/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ylt-chrome",
		"name": "YLT Chrome",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "YLT Chrome",
			"lit": "ylt chrome"
		},
		"docs": "http://yellowlab.tools/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yokoygroupag",
		"name": "YokoyGroupAG/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "YokoyGroupAG\\/",
			"lit": "yokoygroupag/"
		},
		"docs": "https://yokoy.io/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-yuuperbot",
		"name": "Yuuperbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Yuuperbot",
			"lit": "yuuperbot"
		},
		"docs": "https://datadome.co/bots/yuuperbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zapier",
		"name": "Zapier",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Zapier",
			"lit": "zapier"
		},
		"docs": "https://zapier.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zendesk-webhook",
		"name": "Zendesk Webhook",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Zendesk Webhook",
			"lit": "zendesk webhook"
		},
		"docs": "https://support.zendesk.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zombiebot",
		"name": "Zombiebot/",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Zombiebot\\/",
			"lit": "zombiebot/"
		},
		"docs": "http://www.zombiedomain.net/robot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-zzhbot",
		"name": "zzhbot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "zzhbot",
			"lit": "zzhbot"
		},
		"docs": "https://datadome.co/bots/zzhbot/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-penthouse-critical-path-css-generator",
		"name": "Penthouse Critical Path CSS Generator",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Penthouse Critical Path CSS Generator",
			"lit": "penthouse critical path css generator"
		},
		"docs": "https://criticalcss.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-google-adwords-express",
		"name": "Google-AdWords-Express",
		"operator": "Unknown",
		"category": "ads_verification",
		"match": {
			"mode": "regex",
			"pattern": "Google-AdWords-Express",
			"lit": "google-adwords-express"
		},
		"docs": "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers#googleproducer",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-notion",
		"name": "Notion/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Notion\\/",
			"lit": "notion/"
		},
		"docs": "https://www.iubenda.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-ssl-labs",
		"name": "SSL Labs",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "SSL Labs$",
			"lit": "ssl labs"
		},
		"docs": "https://www.qualys.com/apps/pci-compliance/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-skroutz-imagebot",
		"name": "Skroutz ImageBot",
		"operator": "Unknown",
		"category": "seo_tool",
		"match": {
			"mode": "regex",
			"pattern": "Skroutz ImageBot",
			"lit": "skroutz imagebot"
		},
		"docs": "https://www.skroutz.gr/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-tumblr",
		"name": "Tumblr/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "Tumblr\\/",
			"lit": "tumblr/"
		},
		"docs": "https://automattic.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-upday",
		"name": "upday/",
		"operator": "Unknown",
		"category": "feed_reader",
		"match": {
			"mode": "regex",
			"pattern": "upday\\/",
			"lit": "upday/"
		},
		"docs": "https://www.upday.com/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-watchtowr",
		"name": "watchTowr",
		"operator": "Unknown",
		"category": "security_scanner",
		"match": {
			"mode": "regex",
			"pattern": "watchTowr",
			"lit": "watchtowr"
		},
		"docs": "https://watchtowr.com",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-prtg-network-monitor",
		"name": "PRTG Network Monitor",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "PRTG Network Monitor",
			"lit": "prtg network monitor"
		},
		"docs": "https://www.paessler.com/manuals/prtg/http_transaction_sensor",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-geedoshopproductfinder",
		"name": "GeedoShopProductFinder",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "GeedoShopProductFinder",
			"lit": "geedoshopproductfinder"
		},
		"docs": "https://geedo.com/product-finder/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-watchforbot",
		"name": "WatchForBot",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "WatchForBot",
			"lit": "watchforbot"
		},
		"docs": "https://watchfor.io/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-listgembot",
		"name": "ListGemBot",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "ListGemBot",
			"lit": "listgembot"
		},
		"docs": "https://listgem.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-isonsearchbot",
		"name": "IsonSearchBot",
		"operator": "Unknown",
		"category": "search_engine",
		"match": {
			"mode": "regex",
			"pattern": "IsonSearchBot",
			"lit": "isonsearchbot"
		},
		"docs": "https://search.isonai.com/bot",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-9bot",
		"name": "9bot/",
		"operator": "Unknown",
		"category": "social_preview",
		"match": {
			"mode": "regex",
			"pattern": "9bot\\/",
			"lit": "9bot/"
		},
		"docs": "https://9bot.com.br/en/9bot-docs/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-isonai-user",
		"name": "IsonAI-User",
		"operator": "Unknown",
		"category": "ai_training",
		"match": {
			"mode": "regex",
			"pattern": "IsonAI-User",
			"lit": "isonai-user"
		},
		"docs": "https://docs.isonai.com/en/bots/",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-infosifter",
		"name": "InfoSifter",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "InfoSifter",
			"lit": "infosifter"
		},
		"docs": "https://logicus.se/about_InfoSifter.html",
		"source": "crawler-user-agents"
	},
	{
		"id": "cua-scooterza",
		"name": "ScooterZA",
		"operator": "Unknown",
		"category": "monitoring",
		"match": {
			"mode": "regex",
			"pattern": "ScooterZA",
			"lit": "scooterza"
		},
		"docs": "https://techwarrior.co.za/scooterza/",
		"source": "crawler-user-agents"
	}
];
// src/agents/rules.ts
const AGENT_CATEGORIES = [
	"search_engine",
	"ai_training",
	"ai_search",
	"ai_assistant",
	"seo_tool",
	"social_preview",
	"monitoring",
	"feed_reader",
	"security_scanner",
	"headless_automation",
	"scraper_generic",
	"archiver",
	"ads_verification",
	"unknown_bot"
];
const AGENTS = agents_default;
/** Built-in rules. Regexes compile on first candidate hit; `lit` is the substring pre-filter. */
function compileBuiltins(records = AGENTS) {
	return records.map((r) => {
		const base = {
			id: r.id,
			category: r.category,
			human: false
		};
		const m = r.match;
		if (m.mode === "contains") return {
			...base,
			test: (ua) => ua.includes(m.pattern)
		};
		let re;
		return {
			...base,
			test(ua) {
				if (m.lit && !ua.includes(m.lit)) return false;
				if (re === void 0) re = compileSafeRegex(m.pattern, "i");
				return re ? re.test(ua) : false;
			}
		};
	});
}
/**
* Split user rules into plain (run first) and regex (run after built-ins, at most 50), at most 500 in total.
* Plain rules are indexed (exact in a map, prefixes by length, contains in a loop that stops at the best hit so far),
* and the answer equals a loop over the rules in list order.
*/
function compileUserRules(rules = []) {
	const all = [];
	const exact = /* @__PURE__ */ new Map();
	const prefix = /* @__PURE__ */ new Map();
	const contains = [];
	const regex = [];
	let n = 0;
	rules.forEach((r, i) => {
		if (r.enabled === false || typeof r.pattern !== "string" || !r.pattern || n >= 500) return;
		const base = {
			id: r.id ?? `user-${i + 1}`,
			category: r.category ?? "unknown_bot",
			human: r.action === "human"
		};
		if (r.mode === "regex") {
			if (regex.length >= 50) return;
			n++;
			const re = compileSafeRegex(r.pattern, "i");
			if (re) regex.push({
				...base,
				test: (ua) => re.test(ua)
			});
			return;
		}
		n++;
		const p = r.pattern.toLowerCase();
		const k = all.length;
		const test = r.mode === "exact" ? (ua) => ua === p : r.mode === "prefix" ? (ua) => ua.startsWith(p) : (ua) => ua.includes(p);
		all.push({
			...base,
			test
		});
		if (r.mode === "exact") {
			if (!exact.has(p)) exact.set(p, k);
		} else if (r.mode === "prefix") {
			if (!prefix.has(p)) prefix.set(p, k);
		} else contains.push([p, k]);
	});
	const lengths = [...new Set([...prefix.keys()].map((p) => p.length))].sort((a, b) => a - b);
	return {
		regex,
		plain(ua) {
			let best = exact.get(ua) ?? all.length;
			for (const l of lengths) {
				if (l > ua.length) break;
				const k = prefix.get(ua.slice(0, l));
				if (k !== void 0 && k < best) best = k;
			}
			for (const [p, k] of contains) {
				if (k >= best) break;
				if (ua.includes(p)) {
					best = k;
					break;
				}
			}
			return all[best];
		}
	};
}
// src/agents/classify.ts
const MAX_UA = 512;
const LRU_SIZE = 2e3;
/** In-app WebViews: real people in social apps, never bots. */
const WEBVIEW_MARKERS = [
	"fban/",
	"fbav/",
	"instagram",
	"linkedinapp",
	" line/"
];
/** Bounded generic fallback: bot-like words not followed by a letter (`cubot` is a phone brand). */
const GENERIC_RE = /(?<!cu)bot(?![a-z])|crawl(?:er|ing)?(?![a-z])|spider|scraper|fetch(?:er)?(?![a-z])|monitor(?:ing)?(?![a-z])|check(?:er)?(?![a-z])|probe(?![a-z])/;
const HUMAN = Object.freeze({ audience: "human" });
const robot = (botId, category) => ({
	audience: "robot",
	botId,
	category
});
const fromRule = (r) => r.human ? HUMAN : robot(r.id, r.category);
let builtins;
/** A classifier with its own LRU; user rules overlay the built-in data. */
function createClassifier(userRules) {
	const user = compileUserRules(userRules);
	const cache = /* @__PURE__ */ new Map();
	function run(ua) {
		if (ua.trim().length < 10) return robot(ua.trim() ? "short-ua" : "empty-ua", "unknown_bot");
		const own = user.plain(ua);
		if (own) return fromRule(own);
		if (WEBVIEW_MARKERS.some((m) => ua.includes(m))) return HUMAN;
		builtins ??= compileBuiltins();
		for (const r of builtins) if (r.test(ua)) return fromRule(r);
		for (const r of user.regex) if (r.test(ua)) return fromRule(r);
		if (GENERIC_RE.test(ua)) return robot("generic", "unknown_bot");
		return HUMAN;
	}
	return { classify(raw) {
		const ua = (raw ?? "").slice(0, MAX_UA).toLowerCase();
		const hit = cache.get(ua);
		if (hit) {
			cache.delete(ua);
			cache.set(ua, hit);
			return hit;
		}
		const res = run(ua);
		if (cache.size >= LRU_SIZE) cache.delete(cache.keys().next().value);
		cache.set(ua, res);
		return res;
	} };
}
const defaultClassifier = createClassifier();
const userClassifiers = /* @__PURE__ */ new WeakMap();
/** Classify a user agent. Pass the same `userRules` array instance to reuse its cache. */
function classifyUa(ua, userRules) {
	if (!userRules || userRules.length === 0) return defaultClassifier.classify(ua);
	let c = userClassifiers.get(userRules);
	if (!c) {
		c = createClassifier(userRules);
		userClassifiers.set(userRules, c);
	}
	return c.classify(ua);
}
// src/core/site-settings.ts
function siteSetting(settings, client, key) {
	const own = client?.[key];
	return (key === "defaultCurrency" ? isCurrency(own) : key === "siteSearchParams" ? Array.isArray(own) : typeof own === "boolean") ? own : settings[key];
}
// src/core/ua.ts
const BROWSERS = [
	["Samsung Internet", /samsungbrowser\/(\d+)/],
	["Edge", /\b(?:edg|edge|edga|edgios)\/(\d+)/],
	["Opera", /\b(?:opr|opera|opt)\/(\d+)/],
	["Firefox", /\b(?:firefox|fxios)\/(\d+)/],
	["Chrome", /\b(?:crios|chrome|chromium)\/(\d+)/],
	["Safari", /\bversion\/(\d+)[^ ]* (?:mobile\/\S+ )?safari\//]
];
const PLATFORM_HINTS = {
	windows: "Windows",
	macos: "macOS",
	ios: "iOS",
	android: "Android",
	linux: "Linux",
	"chrome os": "ChromeOS",
	chromeos: "ChromeOS"
};
function osFromUa(ua) {
	if (/iphone|ipad|ipod/.test(ua)) return "iOS";
	if (ua.includes("android")) return "Android";
	if (ua.includes("windows")) return "Windows";
	if (ua.includes("cros")) return "ChromeOS";
	if (/mac os x|macintosh/.test(ua)) return "macOS";
	if (/linux|x11/.test(ua)) return "Linux";
	return "Other";
}
function parseUa(uaRaw, hints = {}) {
	const ua = (uaRaw ?? "").slice(0, 512).toLowerCase();
	let browser = "Other";
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
	const os = platform && PLATFORM_HINTS[platform] || osFromUa(ua);
	let device = "desktop";
	if (/ipad|tablet|kindle|silk\//.test(ua) || ua.includes("android") && !ua.includes("mobile")) device = "tablet";
	else if (/mobile|iphone|ipod|windows phone/.test(ua)) device = "mobile";
	if (hints.mobile === "?1") device = "mobile";
	else if (hints.mobile === "?0" && device === "mobile") device = "desktop";
	return {
		browser,
		browserMajor,
		os,
		device
	};
}
/** Normalized UA used in the visitor key: family and major, OS family, device class. */
function uaNorm(p) {
	return `${p.browser}/${p.browserMajor}|${p.os}|${p.device}`;
}
// src/core/recorder.ts
/** Write path, policy half: checks every event, then hands it to the ingest sink (`apply.ts`). */
const str = (v) => typeof v === "string" && v ? v : null;
/**
* Extract `RequestInfo` from a native `Request` (keeps `request.cf`). Pass the host's `requestMeta.ip`
* when there is one; otherwise `CF-Connecting-IP` is trusted only when `request.cf` exists, the same
* rule as the host (`plugins/request-meta.ts`). `X-Forwarded-For` is never trusted here.
*/
function requestInfo(request, ip) {
	const h = request.headers;
	const cf = request.cf;
	const lang = h.get("accept-language")?.split(",")[0]?.split(";")[0]?.trim().toLowerCase().slice(0, 16) || null;
	const country = str(cf?.country) ?? str(h.get("cf-ipcountry"));
	let host = null;
	try {
		host = new URL(request.url).hostname.slice(0, 253) || null;
	} catch {}
	return {
		ua: (h.get("user-agent") ?? "").slice(0, 512),
		ip: ip !== void 0 ? ip : cf ? h.get("cf-connecting-ip") : null,
		lang: lang && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(lang) ? lang : null,
		country: country && /^[A-Z]{2}$/i.test(country) && country.toUpperCase() !== "XX" ? country.toUpperCase() : null,
		region: str(cf?.region)?.slice(0, 64) ?? null,
		gpc: h.get("sec-gpc") === "1",
		dnt: h.get("dnt") === "1",
		chMobile: h.get("sec-ch-ua-mobile"),
		chPlatform: h.get("sec-ch-ua-platform"),
		host,
		referer: h.get("referer")
	};
}
/** The sink of `deps`: the given one, or the database behind the write guard of the `small` profile. */
const sinkOf = (deps) => deps.sink ?? new D1Sink(deps.db, {
	kv: deps.kv,
	profile: deps.settings.capacityProfile,
	tz: deps.settings.siteTimezone
});
const counters = /* @__PURE__ */ new Map();
/** Increment and return a per-minute counter. Per isolate, so caps are approximate across isolates. */
function bump(kind, id, now) {
	const k = `${kind}|${id}|${Math.floor(now / 60)}`;
	const n = (counters.get(k) ?? 0) + 1;
	counters.delete(k);
	if (counters.size >= 5e3) counters.delete(counters.keys().next().value);
	counters.set(k, n);
	return n;
}
/** Hit id of an order: `o.` plus 20 hex characters of SHA-256(site|name|oid), so one order is one row. */
async function orderHitId(site, name, oid) {
	return `o.${[...(await sha256(`${site}|${name}|${oid}`)).slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
const nowS = (deps) => deps.now ?? Math.floor(Date.now() / 1e3);
function signalDrop(s, info) {
	return s.signals !== "none" && info.gpc || s.signals === "dnt_and_gpc" && info.dnt;
}
function excludedIp(s, info) {
	return !!info.ip && s.excludeIpPrefixes.some((c) => ipInCidr(info.ip, c));
}
function excludedPath(s, path) {
	return !!path && s.excludePaths.some((p) => path.startsWith(p));
}
/**
* Search re-entry: a fresh client id (`n = 1`) arriving from a search engine host. Reloads and
* back or forward loads keep the original referrer, so only a new navigation (`nt` 0 or absent) counts.
*/
function isSearchReentry(body, info, hosts) {
	if (body.n !== 1 || body.nt !== void 0 && body.nt !== 0) return false;
	const ref = parseReferrer(body.r);
	return !!ref && cleanHost(ref.host) !== cleanHost(info.host ?? "") && hostInList(ref.host, hosts.search);
}
/**
* Record one validated client event: the policy checks (privacy signals, exclusions, rate caps,
* revenue rules), then one message to the sink. Bots never reach this function: the route answers them
* before parsing. Returns "ok" or the drop reason (also counted in `drops`, flushed by the caller).
*/
async function recordClientEvent(deps, input, info) {
	const { kv, settings: s } = deps;
	const site = deps.site ?? s.siteId;
	const now = nowS(deps);
	const day = dayInZone(now, s.siteTimezone);
	const sink = sinkOf(deps);
	const drop = (reason) => {
		drops.add(site, day, reason);
		return reason;
	};
	const done = (out) => out === "ok" ? out : drop(out);
	await deps.ready?.();
	let body = input;
	if (signalDrop(s, info)) return drop("privacy_signal");
	if (excludedIp(s, info)) return drop("excluded_ip");
	if (body.t !== "en" && excludedPath(s, body.u ? normalizeUrl(body.u, []).path : void 0)) return drop("excluded_path");
	if (body.sid && bump("sid", `${site}|${body.sid}`, now) > s.maxEventsPerSidPerMinute) return drop("sid_rate");
	if (body.t === "en") {
		if (!body.sid) return drop("invalid");
		return done(await sink.ingest({
			t: "en",
			site,
			now,
			sid: body.sid,
			key: body.h,
			tz: s.siteTimezone,
			cap: s.maxPageviewsPerSession,
			d: body.d,
			...body.e !== void 0 ? { e: body.e } : {},
			...body.s !== void 0 ? { s: body.s } : {},
			...body.i !== void 0 ? { i: body.i } : {},
			...body.x !== void 0 ? { x: body.x } : {}
		}));
	}
	const ua = parseUa(info.ua, {
		mobile: info.chMobile,
		platform: info.chPlatform
	});
	const ipTrunc = truncateIp(info.ip, s.ipTruncation);
	const norm = uaNorm(ua);
	const vkeyFor = async (d) => vkey(await getOrCreateSalt(kv, d), site, ipTrunc, norm);
	const today = saltDay(now, s.saltTimezone, s.saltRotationHour);
	const keys = { [today]: await vkeyFor(today) };
	if (bump("vkey", keys[today], now) > s.maxEventsPerVkeyPerMinute) return drop("vkey_rate");
	if (now < saltBoundary(now, s.saltTimezone, s.saltRotationHour) + s.sessionWindowMinutes * 60) keys[addDays(today, -1)] = await vkeyFor(addDays(today, -1));
	let orderId = null;
	const kept = [];
	if (body.t === "ev") {
		if (input.revenueInvalid) kept.push("revenue_invalid");
		if (body.val !== void 0 && info.hasOrigin && !siteSetting(s, deps.client, "acceptClientRevenue")) {
			const { val: _v, cur: _c, oid: _o, ...rest } = body;
			body = rest;
			kept.push("revenue_not_accepted");
		}
		if (body.val !== void 0 && body.oid) orderId = await orderHitId(site, body.name, body.oid);
	}
	const cfg = {
		...s,
		...deps.channelRules ? { channelRules: deps.channelRules } : {},
		...deps.hosts ? { hosts: deps.hosts } : {}
	};
	const url = body.u ? normalizeUrl(body.u, s.queryAllowlist, body.t === "pv" ? siteSetting(s, deps.client, "siteSearchParams") : []) : null;
	const msg = {
		t: body.t,
		site,
		now,
		sid: body.sid ?? null,
		fresh: body.n === 1,
		key: body.t === "pv" ? body.h : orderId ?? `e${body.h ?? randomId(12)}`,
		fields: body.t === "pv" ? {
			p: url?.path,
			qs: url?.query || void 0,
			nt: body.nt,
			hs: deps.linkedHost
		} : {
			n: body.name,
			p: url?.path,
			hs: deps.linkedHost
		},
		evt: {
			t: body.t,
			sid: body.sid ?? null,
			...body.u ? { u: body.u } : {},
			...body.t === "pv" ? {
				r: body.r,
				w: s.captureScreen ? body.w : void 0
			} : isPassiveEvent(body.name) ? { passive: true } : {}
		},
		meta: {
			site,
			siteHost: info.host,
			ua,
			lang: s.captureLanguage ? info.lang : null,
			country: info.country,
			region: s.captureRegion ? info.region : null
		},
		keys,
		cfg
	};
	if (body.t === "pv") msg.reentry = isSearchReentry(body, info, deps.hosts ?? DEFAULT_HOSTS);
	else {
		if (body.p) msg.props = body.p;
		if (body.val !== void 0) {
			const cur = body.cur ?? siteSetting(s, deps.client, "defaultCurrency");
			msg.rev = {
				val: cur ? roundMinor(body.val, cur) : null,
				cur: cur || null
			};
		}
	}
	const out = await sink.ingest(msg);
	if (out === "ok") for (const r of kept) drop(r);
	return done(out);
}
/** Decides whether a server-observed response is counted in `ca_srv`: a robot never writes. */
function shouldRecordServerHit(status, audience, s) {
	return audience === "human" && status >= 400 && s.logErrorPages;
}
/** Record a server-observed error page as a counter (S6). Returns true when it was counted. */
async function recordServerHit(deps, info) {
	const s = deps.settings;
	const now = nowS(deps);
	const c = info.classification ?? classifyUa(info.ua, deps.agentRules);
	if (!shouldRecordServerHit(info.status, c.audience, s)) return false;
	if (s.excludeEditors && (info.userRole ?? 0) >= 30) return false;
	const url = normalizeUrl(info.url, s.queryAllowlist);
	if (excludedPath(s, url.path)) return false;
	if (signalDrop(s, info) || excludedIp(s, info)) return false;
	const r = parseReferrer(info.referer);
	const ref = r && r.host !== (info.host ?? "").replace(/^www\./, "") ? `${r.host}${r.path}`.slice(0, 256) : "";
	await deps.ready?.();
	const out = await sinkOf(deps).ingest({
		t: "srv",
		site: s.siteId,
		now,
		tz: s.siteTimezone,
		status: info.status,
		path: url.path,
		ref
	});
	if (out === "ok") return true;
	drops.add(s.siteId, dayInZone(now, s.siteTimezone), out);
	await drops.settle(deps.db);
	return false;
}
// src/dashboards/limits.ts
const MAX_RECORD_BYTES = 16384;
const MAIL_MAX_HTML_BYTES = 1e5;
// src/agents/stored.ts
/** Options key holding every user agent rule of the install for the middleware, written by the config routes on each rules change. */
const AGENT_RULES_KEY = "agents:rules";
const TTL_MS = 6e4;
let snap;
const isRule = (r) => !!r && typeof r === "object" && typeof r.pattern === "string" && typeof r.mode === "string" && typeof r.action === "string";
/** `AGENT_RULES_KEY`, read at most every 60 s per isolate (the same cache as the route side loader). */
async function storedAgentRules(kv, nowMs = Date.now()) {
	if (snap && nowMs - snap.at < TTL_MS) return snap.rules;
	let rules = snap?.rules ?? [];
	try {
		const v = await kv.get(AGENT_RULES_KEY);
		rules = Array.isArray(v) ? v.filter(isRule).slice(0, 500) : [];
	} catch {}
	snap = {
		rules,
		at: nowMs
	};
	return rules;
}
/** Drop this isolate's copy so the next request reads the key again. */
function resetStoredAgentRules() {
	snap = void 0;
}
// src/client/generated.ts
const PAGE_SCRIPT = "(function(){let e=/bot|crawl|spider|slurp|headless|lighthouse|phantom|puppeteer|playwright|preview|fetch(er)?\\b|python|curl|wget|httpclient/i,t=[5,15,45];function n(n,r){let i=n.document,a=n.navigator,o=n.location,s=a.userAgent||``,c=``,l=r.c,u=``;try{let e=i.currentScript,t=new URL(e.src||`x:`,o.href),n=e.getAttribute(`${r.a}key`)||t.searchParams.get(`k`)||``;/^[a-z0-9]{20}$/.test(n)&&(c=n,l=new URL(r.c,t.origin).href,u=t.hostname)}catch(e){}if(a.webdriver===!0||e.test(s)||!a.languages||!a.languages.length||/Chrome\\//.test(s)&&!/Mobile|Android/.test(s)&&a.plugins&&a.plugins.length===0)return;let d=`${r.a}optout`,f=!1;try{f=!!n.localStorage.getItem(d)}catch(e){}let p=f||r.g!==`none`&&a.globalPrivacyControl===!0||r.g===`dnt_and_gpc`&&a.doNotTrack===`1`,m=e=>{let t=``;for(;t.length<e;)for(let r of n.crypto.getRandomValues(new Uint8Array(e*2)))r<252&&t.length<e&&(t+=`abcdefghijklmnopqrstuvwxyz0123456789`[r%36]);return t},h=m(20),g=0;try{let e=n.performance.getEntriesByType(`navigation`)[0].type;g=e===`reload`?1:e===`back_forward`?2:0}catch(e){}let _=r.a,v=r.x.length?RegExp(`\\\\.(${r.x.join(`|`)})$`,`i`):null,y=()=>Date.now(),b=()=>(o.pathname+o.search).slice(0,2048),x=``,S=!0,C=!1,w=``,T=0,E=0,D=!0,O=0,k=-0xe8d4a51000,A=0,j=0,M=``,N=(e,r)=>n.fetch(l,{method:`POST`,body:e,keepalive:!0}).then(e=>{let t=e.status===503&&e.headers.get(`retry-after`);return t?+t||0:-1},()=>0).then(n=>{n>=0&&r<3&&setTimeout(()=>p||N(e,r+1),Math.max(n,t[r])*(1+Math.random()/2)*1e3)}),P=(e,t)=>{if(p)return;e.v=1,e.sid=h,c&&(e.k=c);let r=JSON.stringify(e);t&&n.fetch?N(r,0):!(a.sendBeacon&&a.sendBeacon(l,r))&&n.fetch&&n.fetch(l,{method:`POST`,body:r,keepalive:!0}).catch(()=>{})},F=()=>{let e=y();D&&(E+=e-O,e-k<6e4&&(T+=Math.min(e-O,6e4))),O=e},I=()=>{let e=i.documentElement.scrollHeight-n.innerHeight,t=e>0?Math.round(Math.min(1,Math.max(0,n.scrollY/e))*100):100;t>A&&(A=t)},L=e=>{if(!x||S&&!e)return;S=!0,F(),I();let t={t:`en`,h:x,d:Math.min(Math.round(T),r.m),e:Math.max(1,Math.min(Math.round(E),r.m)),s:A,i:j};e!==void 0&&(t.x=e);let n=JSON.stringify(t);n!==M&&(M=n,P(t))},R=e=>{let t=typeof e==`string`&&e[0]===`/`?e.slice(0,2048):b();if(C&&t===w)return;L(),x=m(12),S=!1,T=0,E=0,O=y(),A=0,j=0;let a={t:`pv`,h:x,u:t,w:r.s&&n.screen?n.screen.width:0};C||(a.r=i.referrer||``,a.n=1,a.nt=g),P(a,1),C=!0,w=t},z=(e,t,n)=>{if(typeof e!=`string`||!C)return;let r={t:`ev`,h:m(12),name:e,u:b()};t&&typeof t==`object`&&(r.p=t),n&&typeof n==`object`&&(typeof n.currency==`string`&&(r.cur=n.currency.slice(0,3)),typeof n.id==`string`&&(r.oid=n.id.slice(0,64)),n=n.value),typeof n==`number`&&isFinite(n)&&(r.val=n),P(r,1)},B=e=>r.i.some(t=>e.indexOf(t)===0),V=()=>{H(),i.addEventListener(`DOMContentLoaded`,H);for(let e of[`pointerdown`,`keydown`,`scroll`,`touchstart`])n.addEventListener(e,t=>{F(),k=y(),j=1,e===`scroll`&&I()},{capture:!0,passive:!0});i.addEventListener(`visibilitychange`,()=>{F(),D=!i.hidden,i.hidden?L(0):S=!1}),n.addEventListener(`pagehide`,e=>L(e.persisted?2:1)),i.addEventListener(`astro:page-load`,()=>R()),i.addEventListener(`click`,e=>{let t=e.target;if(!t||!t.closest)return;if(t.closest(`[${d}]`)){f=!f,p=p||f;try{n.localStorage[f?`setItem`:`removeItem`](d,`1`)}catch(e){}H();return}let i=t.closest(`[${_}event]`);if(i){let e={};for(let t of i.attributes)t.name.indexOf(`${_}prop-`)===0&&(e[t.name.slice(_.length+5).replace(/-/g,`_`)]=t.value.slice(0,128));let t=e=>i.getAttribute(_+e);z(t(`event`),e,t(`value`)&&{value:+t(`value`),currency:t(`currency`),id:t(`id`)})}let a=t.closest(`a[href]`);if(!a||a.hasAttribute(`${_}ignore`))return;let s=/^https?:$/.test(a.protocol),c=a.host===o.host;if(!i&&!(s&&c&&B(a.pathname))){let e=(s?(c?``:a.host)+a.pathname:a.href.split(`?`)[0]).slice(0,512);for(let[t,n,i]of r.r){let r;try{if(t[0]===`~`){let n=new RegExp(t.slice(1),`i`).exec(e);n&&(r=n[1]||n[0])}else e.indexOf(t)||(r=e.slice(t.length))}catch(e){}if(r!==void 0){n!==`-`&&z(n,{slug:(i||r.replace(/\\/$/,``)||e).slice(0,128)});return}}}s&&(c?r.dl&&v&&v.test(a.pathname)&&!B(a.pathname)&&z(`_download`,{file:a.pathname.slice(0,128)}):r.o&&r.l.indexOf(a.hostname)<0&&!(a.hostname===u&&r.l.indexOf(o.hostname)>=0)&&z(`_outbound`,{url:(a.host+a.pathname).slice(0,128)}))},!0),i.addEventListener(`submit`,e=>{let t=e.target;if(!r.f||!t||t.hasAttribute(`${_}ignore`))return;let n=``;try{let r=new URL(e.submitter&&e.submitter.getAttribute(`formaction`)||t.getAttribute(`action`)||``,o.href);if(n=r.pathname,r.host===o.host&&B(n))return}catch(e){}z(`_form`,{form:String(t.id||t.getAttribute(`name`)||n).slice(0,128)})},!0),R();let e={v:1,sid:h,ready:!0,event:z,page:R,onReady:e=>t(e)},t=t=>{try{typeof t==`function`?t(e):e[t[0]](...t.slice(1))}catch(e){}},a=n[`${r.n}q`];n[r.n]=e,n[`${r.n}q`]={push:t},a&&a.forEach&&a.forEach(t),n.dispatchEvent(new n.CustomEvent(`${r.n}:ready`,{detail:e}))},H=()=>{for(let e of i.querySelectorAll(`[${d}]`)){let t=e.getAttribute(`${d}-${f?`on`:`off`}`);e.setAttribute(`aria-pressed`,f),e.setAttribute(`${d}-state`,f?`out`:`in`),t&&(e.textContent=t)}},U=()=>!i.prerendering&&!i.hidden;if(U())V();else{let e=()=>{U()&&(i.removeEventListener(`visibilitychange`,e),i.removeEventListener(`prerenderingchange`,e),V())};i.addEventListener(`visibilitychange`,e),i.addEventListener(`prerenderingchange`,e)}}n(window,__CFG__)})();";
// src/client/serve.ts
/** Direct plugin route, used when the middleware is not installed (degraded mode). */
const DIRECT_IN_PATH = `/_emdash/api/plugins/${PLUGIN_ID}/${ROUTES.in}`;
/** `linked`: hosts of the client sites linked to this site (`linkedHostsOf`). */
function clientConfig(s, viaAlias = true, linked = []) {
	return {
		c: viaAlias ? s.collectPath : DIRECT_IN_PATH,
		n: s.namespace,
		a: publicNames(s.namespace).attrPrefix,
		g: s.signals,
		o: s.autoOutbound ? 1 : 0,
		dl: s.autoDownloads ? 1 : 0,
		s: s.captureScreen ? 1 : 0,
		f: s.autoForms ? 1 : 0,
		x: s.downloadExtensions,
		m: s.maxEngagedMsPerPage,
		i: s.ignorePathPrefixes,
		l: [...linked],
		r: s.linkRules
	};
}
/** The page script with its configuration injected. `<` is escaped so the code is safe inline. */
function scriptBody(s, viaAlias = true, linked = []) {
	const cfg = JSON.stringify(clientConfig(s, viaAlias, linked)).replace(/</g, "\\u003c");
	return PAGE_SCRIPT.replace("__CFG__", () => cfg);
}
/** FNV-1a 32-bit, enough for an ETag. */
function fnv(text) {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	return (h >>> 0).toString(36);
}
let cache;
/** `GET|HEAD scriptPath` response: cacheable for one hour, ETag from the configured body, 304 on match. */
function scriptResponse(s, request, linked = []) {
	const key = JSON.stringify(clientConfig(s, true, linked));
	if (cache?.key !== key) {
		const body = scriptBody(s, true, linked);
		cache = {
			key,
			body,
			etag: `"${fnv(body)}"`
		};
	}
	const headers = {
		"content-type": "text/javascript; charset=utf-8",
		"cache-control": "public, max-age=3600",
		etag: cache.etag,
		"x-content-type-options": "nosniff"
	};
	if (request.headers.get("if-none-match") === cache.etag) return new Response(null, {
		status: 304,
		headers
	});
	return new Response(request.method === "HEAD" ? null : cache.body, {
		status: 200,
		headers
	});
}
// src/core/request-scope.ts
const KEY = Symbol.for("cookieless-analytics:audience");
const g = globalThis;
const store = g[KEY] ??= new AsyncLocalStorage();
/** Run `fn` with the request's UA audience visible to `page:fragments` (only for `scriptForBots = skip_known_bots`). */
const withAudience = (audience, fn) => store.run(audience, fn);
/** Audience of the current request, when the middleware set one. */
const currentAudience = () => store.getStore();
const LIVE_KEY = Symbol.for("cookieless-analytics:middleware-live");
const live = globalThis;
const markMiddlewareLive = (now) => {
	live[LIVE_KEY] = now;
};
/** Milliseconds timestamp of the last request this isolate's middleware handled, if any. */
const middlewareLiveAt = () => live[LIVE_KEY];
// src/middleware-core.ts
/**
* Astro-free middleware logic. Never reads, buffers, rewrites or re-headers page
* responses: the `Response` returned by `next()` is returned as the same object.
*/
const MW_SEEN_KEY = "mw:seen";
const SEEN_EVERY_MS = 6e5;
let lastSeen = Number.NEGATIVE_INFINITY;
const STATIC_RE = /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|wasm)$/i;
const EDIT_COOKIE_RE = /(?:^|;\s*)emdash-edit-mode=true(?:;|$)/;
/** `collectPath` answers carry `access-control-allow-origin: *`: bodiless 204s without credentials expose nothing. */
const noContent = () => new Response(null, {
	status: 204,
	headers: {
		"cache-control": "no-store",
		"access-control-allow-origin": "*"
	}
});
const preflight = () => new Response(null, {
	status: 204,
	headers: {
		"access-control-allow-origin": "*",
		"access-control-allow-methods": "POST",
		"access-control-allow-headers": "content-type",
		"access-control-max-age": "86400",
		"cache-control": "no-store"
	}
});
const role = (ctx) => typeof ctx.locals.user?.role === "number" ? ctx.locals.user.role : 0;
/** `GET|HEAD scriptPath` with external delivery. One cached options read at most (the linked hosts). */
async function handleScript(ctx, s, linkedHosts) {
	const m = ctx.request.method;
	if (m !== "GET" && m !== "HEAD" || ctx.url.pathname !== s.scriptPath || s.scriptDelivery !== "external") return null;
	return scriptResponse(s, ctx.request, await linkedHosts?.().catch(() => []) ?? []);
}
/** The `in` route refused to store the event (503): passed on with its `Retry-After`, readable cross-origin. */
const unavailable = (retryAfter) => new Response(null, {
	status: 503,
	headers: {
		"cache-control": "no-store",
		"access-control-allow-origin": "*",
		...retryAfter ? {
			"retry-after": retryAfter,
			"access-control-expose-headers": "retry-after"
		} : {}
	}
});
/** Status and `Retry-After` of a raw route answer (a `pluginResponse`), read defensively. */
function rawStatus(data) {
	const r = data;
	const h = Array.isArray(r?.headers) ? r.headers.find((e) => Array.isArray(e) && String(e[0]).toLowerCase() === "retry-after") : void 0;
	return {
		status: typeof r?.status === "number" ? r.status : 204,
		retryAfter: h ? String(h[1]) : null
	};
}
/**
* `POST collectPath`: forward the untouched `Request` in process to the `in` route; 204, or the route's 503 when the
* event could not be stored. The
* `in` route applies the origin rule because only it knows the client sites registry.
* `OPTIONS collectPath` answers the CORS preflight of `page()` callers that post JSON.
*/
async function handleCollect(ctx, s) {
	if (ctx.url.pathname !== s.collectPath) return null;
	if (ctx.request.method === "OPTIONS") return preflight();
	if (ctx.request.method !== "POST") return null;
	const origin = ctx.request.headers.get("origin");
	if (s.excludeEditors && role(ctx) >= 30 && (!origin || origin === ctx.url.origin)) return noContent();
	const dispatch = getPublicPluginApiRouteHandler(ctx.locals);
	if (!dispatch) return unavailable(null);
	try {
		const res = await dispatch(PLUGIN_ID, "POST", `/${ROUTES.in}`, ctx.request);
		const r = res.success ? rawStatus(res.data) : {
			status: res.status ?? 0,
			retryAfter: "5"
		};
		if (r.status === 503) return unavailable(r.retryAfter);
	} catch {
		return unavailable(null);
	}
	return noContent();
}
/** Headers of every shared page answer. */
const SHARE_HEADERS = {
	"x-robots-tag": "noindex, nofollow",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff",
	"content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
};
const SHARE_TEXT = {
	401: "A password is needed to open this page.",
	404: "Not found.",
	429: "Too many attempts. Try again later."
};
/**
* `GET|HEAD sharePath/<token>`: dispatch in process to `share/view` and build the response. The
* share path never reaches `next()` or the recorder. Other methods and the bare path fall through to the site.
*/
async function handleShare(ctx, s) {
	const m = ctx.request.method;
	const p = ctx.url.pathname;
	if (m !== "GET" && m !== "HEAD" || !p.startsWith(`${s.sharePath}/`) || p.length === s.sharePath.length + 1) return null;
	const dispatch = getPublicPluginApiRouteHandler(ctx.locals);
	let r = { status: 404 };
	if (dispatch) try {
		const res = await dispatch(PLUGIN_ID, "GET", `/${ROUTES.shareView}`, ctx.request);
		const d = res.data;
		if (res.success && d && [
			200,
			401,
			404,
			429
		].includes(d.status)) r = d;
	} catch {}
	const ok = r.status === 200 && typeof r.html === "string";
	const status = ok ? 200 : r.status === 200 ? 404 : r.status;
	const headers = {
		...SHARE_HEADERS,
		"content-type": ok ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
		"cache-control": ok ? r.cache === "open" ? `public, max-age=60` : "private, no-store" : "no-store"
	};
	if (status === 401) headers["www-authenticate"] = `Basic realm="${(r.realm ?? "View").replace(/["\\]/g, "")}", charset="UTF-8"`;
	if (status === 429) headers["retry-after"] = String(Math.max(1, Math.ceil(r.retryAfter ?? 1)));
	return new Response(m === "HEAD" ? null : ok ? r.html : SHARE_TEXT[status], {
		status,
		headers
	});
}
/** Requests the middleware never looks at beyond the path. */
function skipRequest(url, request) {
	const p = url.pathname;
	return p.startsWith("/_emdash") || p.startsWith("/_astro/") || p.startsWith("/_image") || url.searchParams.has("_preview") || url.searchParams.has("_edit") || EDIT_COOKIE_RE.test(request.headers.get("cookie") ?? "") || STATIC_RE.test(p);
}
/** Status and HTML-ness from headers only; the body is never touched. */
function observeResponse(res) {
	return {
		status: res.status,
		html: (res.headers.get("content-type") ?? "").includes("text/html")
	};
}
/**
* Fail-open guard: a plugin error (settings read, `after`, dispatch) never takes the page down. `next()` runs
* at most once; when it already answered, that response is returned, and a rejection of the site's own
* `next()` surfaces once, unchanged.
*/
async function handleRequest(ctx, next, deps) {
	let res;
	const once = () => res ??= next();
	try {
		return await handle(ctx, once, deps);
	} catch (err) {
		const r = res && await res;
		console.warn("[cookieless] request handling failed:", err);
		return r ?? next();
	}
}
async function handle(ctx, next, deps) {
	const s = await deps.settings();
	const now = deps.now?.() ?? Date.now();
	markMiddlewareLive(now);
	const early = await handleScript(ctx, s, deps.linkedHosts) ?? await handleCollect(ctx, s) ?? await handleShare(ctx, s);
	if (early) return early;
	if (skipRequest(ctx.url, ctx.request) || ctx.url.pathname === s.scriptPath || ctx.url.pathname === s.collectPath || ctx.url.pathname.startsWith(`${s.sharePath}/`)) return next();
	if (now - lastSeen >= SEEN_EVERY_MS) {
		lastSeen = now;
		deps.markSeen();
	}
	const c = classifyUa(ctx.request.headers.get("user-agent"), await deps.agentRules?.().catch(() => void 0));
	try {
		ctx.locals[s.namespace] = {
			audience: c.audience,
			botId: c.botId ?? null
		};
	} catch {}
	const res = await (s.scriptForBots === "skip_known_bots" ? withAudience(c.audience, next) : next());
	const o = observeResponse(res);
	if (shouldRecordServerHit(o.status, c.audience, s)) {
		const info = {
			...requestInfo(ctx.request),
			url: ctx.url.pathname + ctx.url.search,
			method: ctx.request.method,
			status: o.status,
			userRole: role(ctx),
			classification: c
		};
		deps.after(() => deps.recordServerHit(info));
	}
	return res;
}
export { AGENT_CATEGORIES as C, AGENTS as S, parseUa as _, scriptBody as a, classifyUa as b, storedAgentRules as c, bump as d, orderHitId as f, sinkOf as g, requestInfo as h, middlewareLiveAt as i, MAIL_MAX_HTML_BYTES as l, recordServerHit as m, handleRequest as n, AGENT_RULES_KEY as o, recordClientEvent as p, currentAudience as r, resetStoredAgentRules as s, MW_SEEN_KEY as t, MAX_RECORD_BYTES as u, uaNorm as v, compileUserRules as w, createClassifier as x, siteSetting as y };
