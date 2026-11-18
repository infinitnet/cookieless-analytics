import type { SettingField } from "emdash";
import { CURRENCIES } from "./core/currency.js";
import { DEFAULT_COLLECT_PATH, DEFAULT_NAMESPACE, DEFAULT_SCRIPT_PATH, DEFAULT_SHARE_PATH } from "./contract.js";
import { type LinkRule, parseLinkRules } from "./link-rules.js";
import { isNeutral, normalizeCollectPath, normalizeNamespace, normalizeScriptPath, normalizeSharePath } from "./names.js";

export const SCRIPT_FOR_BOTS_CAVEAT =
	"Page fragments land in the route cache, which is keyed without the user agent and sends no Vary: User-Agent header, so a page first cached for a bot would be served to humans without the script. Enable only with route caching off.";

type Opt = readonly [value: string, label: string];
const opts = (list: readonly Opt[]) => list.map(([value, label]) => ({ value, label }));

/** Leads the first description of the host settings form, which lists the keys in declaration order. */
export const HOST_FORM_POINTER = "Edit these on the plugin's own Settings page, which groups them and checks each value.";

/**
 * Descriptor `settingsSchema`: every setting key with label, description and default. The key order is
 * the order of the sections of the admin Settings page (`SETTINGS_SECTIONS` in `src/routes/settings.ts`).
 */
export const settingsSchema = {
	siteTimezone: { type: "string", label: "Site timezone", description: `${HOST_FORM_POINTER} IANA timezone used for days and hours in reports, for example Europe/Berlin.`, default: "UTC" },
	siteOrigin: { type: "url", label: "Site origin", description: "Canonical origin such as https://example.com, used to match Search pages and as the Google sign-in return address. Empty uses the request origin.", default: "" },
	defaultCurrency: { type: "select", label: "Default currency", description: "Currency stored with event values that name none, and shown on the Revenue page and in revenue reports when none is chosen. Changing it never relabels recorded values and converts nothing.", options: CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} ${c.name}` })), default: "USD" },
	excludeEditors: { type: "boolean", label: "Exclude editors", description: "Do not record visits of logged-in editors and administrators.", default: true },
	siteId: { type: "string", label: "Site id", description: "Identifier stored with every row. Lowercase letters, digits and dashes, up to 32 characters.", default: "default" },
	injectScript: { type: "boolean", label: "Inject script tag", description: "Turn off when the theme adds the script tag itself.", default: true },
	scriptDelivery: { type: "select", label: "Script delivery", description: "External file (cacheable) or one inline script tag.", options: opts([["external", "External file"], ["inline", "Inline"]]), default: "external" },
	autoOutbound: { type: "boolean", label: "Outbound link events", description: "Record clicks to other hosts.", default: true },
	autoDownloads: { type: "boolean", label: "Download events", description: "Record clicks on download links.", default: true },
	downloadExtensions: { type: "string", label: "Download extensions", description: "Comma separated file extensions treated as downloads.", default: "pdf,zip,docx,xlsx,pptx,csv,mp3,mp4,dmg,exe" },
	autoForms: { type: "boolean", label: "Form events", description: "Record form submissions.", default: true },
	ignorePathPrefixes: { type: "string", label: "Short link path prefixes", description: "Path prefixes of short link redirects on this site, one per line or comma separated, for example /go/. Links and form buttons pointing under them get no download, form or link rule event; the redirect reports its own outbound link event.", default: "", multiline: true },
	linkRules: { type: "string", label: "Link rules", description: "Link clicks to record, one rule per line: a pattern, an event name and an optional label, for example /go/ out. A pattern is the start of a path, of a host and path, mailto: or tel:, or ~ followed by a regular expression. The label is sent as the slug property; without one, the rest of the link after the prefix (or the first group of the regular expression) is. The first rule that matches sends its one event and stops: that click gets no automatic outbound or download event. The event name - records nothing. Links under a short link path prefix and elements with a markup event are left to those. At most 20 rules.", default: "", multiline: true },
	siteSearchParams: { type: "string", label: "Site search parameters", description: "Query parameter names of your site search, comma separated, at most 5 (for example q or s). Empty is off. The words searched for are kept on page views, lowercased, with emails and long numbers removed.", default: "" },
	logErrorPages: { type: "boolean", label: "Log error pages", description: "Record human requests that end with status 400 or above.", default: true },
	scriptPath: { type: "string", label: "Script path", description: "Neutral public path that serves the page script.", default: DEFAULT_SCRIPT_PATH },
	collectPath: { type: "string", label: "Event path", description: "Neutral public path that receives page events.", default: DEFAULT_COLLECT_PATH },
	sharePath: { type: "string", label: "Share path", description: "Neutral public path under which shared dashboard links are served.", default: DEFAULT_SHARE_PATH },
	namespace: { type: "string", label: "Window namespace", description: "Global name of the page script API. Also derives the data attribute prefix.", default: DEFAULT_NAMESPACE },
	scriptForBots: { type: "select", label: "Script for known bots", description: `Always emit the same tag for every visitor (default), or skip it for known bot user agents. ${SCRIPT_FOR_BOTS_CAVEAT}`, options: opts([["always", "Always (identical HTML)"], ["skip_known_bots", "Skip for known bots"]]), default: "always" },
	signals: { type: "select", label: "Privacy signals", description: "Browser privacy signals that drop a visit.", options: opts([["none", "None"], ["gpc", "Global Privacy Control"], ["dnt_and_gpc", "Do Not Track and Global Privacy Control"]]), default: "gpc" },
	ipTruncation: { type: "select", label: "IP truncation", description: "Prefix kept for the daily visitor key. The address itself is never stored.", options: opts([["standard", "Standard (/24 and /48)"], ["strict", "Strict (/16 and /32)"]]), default: "standard" },
	captureLanguage: { type: "boolean", label: "Capture language", description: "Store the primary browser language tag.", default: true },
	captureRegion: { type: "boolean", label: "Capture region", description: "Store the edge region in addition to the country.", default: false },
	captureScreen: { type: "boolean", label: "Capture screen size", description: "The page script sends the screen width and the server stores it as a size class (xs to xl), which Delete matching visits can use. Off by default: the script then sends no screen value.", default: false },
	excludePaths: { type: "string", label: "Excluded path prefixes", description: "One prefix per line or comma separated.", default: "/_emdash/", multiline: true },
	excludeIpPrefixes: { type: "string", label: "Excluded IP ranges", description: "CIDR list, comma or newline separated.", default: "", multiline: true },
	ignoreReferrerHosts: { type: "string", label: "Ignored referrer hosts", description: "Extra payment or login hosts that never start a source.", default: "" },
	queryAllowlist: { type: "string", label: "Query parameter allowlist", description: "Query parameters kept on stored paths. A trailing * matches a prefix.", default: "utm_*,gclid,msclkid,fbclid" },
	saltTimezone: { type: "string", label: "Salt timezone", description: "IANA timezone of the daily salt rotation.", default: "UTC" },
	saltRotationHour: { type: "number", label: "Salt rotation hour", description: "Local hour at which the daily salt rotates.", default: 0, min: 0, max: 23 },
	sessionWindowMinutes: { type: "number", label: "Session window (minutes)", description: "Inactivity gap that ends a session. Applies to new sessions; existing sessions keep their own window.", default: 30, min: 1, max: 240 },
	engagedThresholdSeconds: { type: "number", label: "Engaged threshold (seconds)", description: "Active time that makes a session engaged.", default: 10, min: 1, max: 300 },
	longClickSeconds: { type: "number", label: "Long click (seconds)", description: "A session lasting longer than this is a long click, at or below it a short click. Applied when reports run, so every stored session is reclassified at once.", default: 60, min: 10, max: 600 },
	badExperienceSeconds: { type: "number", label: "Bad experience (seconds)", description: "A single page session without interaction that lasts less than this is a bad experience. Never above the long click threshold.", default: 10, min: 1, max: 60 },
	realtimeWindowMinutes: { type: "number", label: "Realtime window (minutes)", description: "Sessions seen within this time count as active now.", default: 5, min: 1, max: 60 },
	maxSessionMinutes: { type: "number", label: "Maximum session length (minutes)", description: "A session older than this is closed and a new one starts. At most one day: a visit is looked up among visits started today or yesterday.", default: 1440, min: 10, max: 1440 },
	reloadDedupeSeconds: { type: "number", label: "Reload dedupe (seconds)", description: "A reload of the same path within this time is not counted again.", default: 2, min: 0, max: 60 },
	maxEngagedMsPerPage: { type: "number", label: "Maximum active time per page (ms)", description: "Cap for the active time and the visible time reported for one page.", default: 1800000, min: 60000, max: 7200000 },
	acceptClientRevenue: { type: "boolean", label: "Accept revenue from browsers", description: "When off, values, currencies and order ids are dropped from every browser request. Server calls and the agent events route still record them. A guard against casual spoofing, not authentication.", default: true },
	autoAnnotations: { type: "boolean", label: "Automatic annotations", description: "Add an annotation when content is published or updated. Off, the content hooks write nothing; annotations added by hand are unaffected.", default: true },
	annotatePublish: { type: "boolean", label: "Annotate publishing", description: "Add an annotation when an item is published.", default: true },
	annotateUpdate: { type: "boolean", label: "Annotate updates", description: "Add an annotation when a published item is saved again. Off by default: every save of a published item would mark the charts.", default: false },
	annotateCollections: { type: "string", label: "Annotated collections", description: "Collection slugs that add automatic annotations, one per line or comma separated, for example posts. Empty is every collection.", default: "", multiline: true },
	autoAnnotationsPerDay: { type: "number", label: "Automatic annotations per day", description: "At most this many automatic annotations per site and day in the site timezone; further publishes and updates that day add none, so a bulk import cannot fill the charts with markers. Saving the same item again the same day replaces its annotation and does not count again.", default: 10, min: 1, max: 200 },
	searchBrandTerms: { type: "string", label: "Brand terms", description: "One term per line, at most 20 terms of 2 to 40 characters. Queries containing a term are left out of cannibalization and striking distance unless brand queries are included.", default: "", multiline: true },
	searchMinImpressions: { type: "number", label: "SEO views impression floor", description: "A query or page counts in cannibalization, position movement, rising and declining and decay only with at least this many impressions in a period (page views for the traffic views).", default: 50, min: 1, max: 100000 },
	searchOverlapMinShare: { type: "number", label: "Cannibalization share floor (percent)", description: "Percent of a query's impressions a page needs to count as competing for it.", default: 10, min: 1, max: 50 },
	backfillDays: { type: "number", label: "Older Search days to load (days)", description: "Days that Load older days on the Search page reaches back by default: the first connect of a source uses it (not on the small profile, where older days load only from Start loading), and so do the agent API and the file import, which skips older days. Google keeps about 16 months, Bing about 6 months; a longer range stops there.", default: 90, min: 1, max: 490 },
	searchRetentionDays: { type: "number", label: "Search retention (days)", description: "Days of search rows kept.", default: 800, min: 90, max: 1000 },
	searchSyncHours: { type: "number", label: "Search sync interval (hours)", description: "Minimum hours between provider pulls per source.", default: 6, min: 1, max: 24 },
	syncSubrequestBudget: { type: "number", label: "Sync request budget", description: "Requests (provider calls, database statements, storage calls) one Search sync run may make. The Workers Free plan allows 50 per invocation, so keep 40 there; on a Paid plan (1,000) raise it, for example to 900.", default: 40, min: 20, max: 950 },
	searchMaxRowsPerDay: { type: "number", label: "Search rows per day", description: "Row cap per day for the page with query breakdown. Also bounds what the SEO views can see.", default: 5000, min: 1000, max: 25000 },
	gscAuth: { type: "select", label: "Google Search Console", description: "How the plugin signs in to Google Search Console.", options: opts([["off", "Off"], ["oauth", "OAuth client"], ["service_account", "Service account"]]), default: "off" },
	gscProperty: { type: "string", label: "Search Console property", description: "Property such as sc-domain:example.com or https://example.com/. Filled by the property picker after sign-in.", default: "" },
	gscClientId: { type: "string", label: "Google OAuth client id", description: "Client id of your own Google Cloud OAuth web client.", default: "" },
	gscClientSecret: { type: "secret", label: "Google OAuth client secret", description: "Client secret of the OAuth web client. Encrypted by the host; needs EMDASH_ENCRYPTION_KEY." },
	gscRefreshToken: { type: "secret", label: "Google refresh token", description: "Written by the Google sign-in on the Search page; may also be pasted. Encrypted by the host." },
	gscServiceAccount: { type: "secret", label: "Google service account key", description: "Service account JSON key. Add the service account email to the property as a user. Encrypted by the host." },
	bingEnabled: { type: "boolean", label: "Bing Webmaster", description: "Pull search data from Bing Webmaster Tools.", default: false },
	bingAuth: { type: "select", label: "Bing sign-in", description: "API key (default) or OAuth client. OAuth needs a client created in Bing Webmaster Tools under Settings, API access, OAuth client.", options: opts([["apikey", "API key"], ["oauth", "OAuth client"]]), default: "apikey" },
	bingApiKey: { type: "secret", label: "Bing Webmaster API key", description: "API key from Bing Webmaster Tools. Encrypted by the host." },
	bingClientId: { type: "string", label: "Bing OAuth client id", description: "Client id of the OAuth client created in Bing Webmaster Tools.", default: "" },
	bingClientSecret: { type: "secret", label: "Bing OAuth client secret", description: "Client secret of the Bing OAuth client. Encrypted by the host; needs EMDASH_ENCRYPTION_KEY." },
	bingRefreshToken: { type: "secret", label: "Bing refresh token", description: "Written by Connect Bing on the Search page. Encrypted by the host." },
	bingSiteUrl: { type: "url", label: "Bing site url", description: "The site url exactly as registered in Bing Webmaster Tools.", default: "" },
	capacityProfile: { type: "select", label: "Capacity profile", description: "How much analytics data is kept and how much background work one run may do. Standard: for Workers Paid, up to 6 GB of analytics data. Small: for the Workers Free plan, up to 300 MB and lighter background work (40 requests per run instead of 400); it also pauses recording for the rest of the UTC day when the day's writes near the Free plan's limit, so the CMS can still save content. Dedicated: when analytics has its own database, up to 9 GB. The storage budget below can change these sizes. When the budget is reached, the oldest detailed days are replaced by daily summaries; nothing is sampled. A quarter of the budget is reserved for summaries.", options: opts([["small", "Small (Workers Free)"], ["standard", "Standard"], ["dedicated", "Dedicated database"]]), default: "standard" },
	storageBudgetMb: { type: "number", label: "Storage budget (MB)", description: "Space the analytics tables may use, in megabytes. 0 uses the capacity profile's default (Small 300, Standard 6000, Dedicated 9000). When the detailed data would not fit, the detailed window shortens and older days are kept as daily summaries. A D1 database holds 10 GB in total and refuses writes when full; in the EmDash database that space is shared with the site's content. Allowed: 50 to 450 with Small, 100 to 9000 in the EmDash database, 100 to 9500 in an own D1 database, 100 to 2000000 on Postgres. The Settings and Data pages warn above 300 with Small (strongly above 400), above 6000 in the EmDash database (strongly above 8000, or when budget and content together pass 9500) and above 9000 in an own D1 database.", default: 0, min: 0, max: 2000000 },
	rawRetentionDays: { type: "number", label: "Detailed data (days)", description: "Days of detailed rows kept. All filters and views work on detailed data. Older days are kept as daily summaries for the summary retention. The window shortens by itself when the detailed data would not fit the storage budget.", default: 760, min: 7, max: 760 },
	rollupRetentionMonths: { type: "number", label: "Summary retention (months)", description: "Months of daily summaries kept.", default: 25, min: 1, max: 120 },
	ingestTier: { type: "select", label: "Ingest tier", description: "Where page views, events and engagement updates are written. Direct writes them to the database. Queue sends them to a Cloudflare Queue for the consumer Worker to write; it is used only while the CA_QUEUE binding exists, and a failed send is written directly. See Limits.", options: opts([["direct", "Direct to the database"], ["queue", "Queue (needs the CA_QUEUE binding and the consumer Worker)"]]), default: "direct" },
	agentRateLimitPerMinute: { type: "number", label: "Agent API requests per minute", description: "Rate limit per API key and isolate, so approximate across isolates.", default: 60, min: 5, max: 1200 },
	maxPageviewsPerSession: { type: "number", label: "Maximum pageviews per session", description: "Further pageviews in the same session are dropped.", default: 500, min: 10, max: 10000 },
	maxEventsPerSession: { type: "number", label: "Maximum events per session", description: "Further events in the same session are dropped.", default: 200, min: 10, max: 10000 },
	maxEventsPerSidPerMinute: { type: "number", label: "Events per session per minute", description: "Rate cap per session id.", default: 60, min: 10, max: 600 },
	maxEventsPerVkeyPerMinute: { type: "number", label: "Events per visitor per minute", description: "Rate cap per daily visitor key.", default: 300, min: 10, max: 3000 },
} as const satisfies Record<string, SettingField>;

export type SettingKey = keyof typeof settingsSchema;

export interface Settings {
	siteId: string;
	siteTimezone: string;
	scriptPath: string;
	collectPath: string;
	sharePath: string;
	namespace: string;
	scriptDelivery: "external" | "inline";
	injectScript: boolean;
	scriptForBots: "always" | "skip_known_bots";
	signals: "none" | "gpc" | "dnt_and_gpc";
	sessionWindowMinutes: number;
	maxSessionMinutes: number;
	maxPageviewsPerSession: number;
	maxEventsPerSession: number;
	maxEventsPerSidPerMinute: number;
	maxEventsPerVkeyPerMinute: number;
	engagedThresholdSeconds: number;
	maxEngagedMsPerPage: number;
	longClickSeconds: number;
	badExperienceSeconds: number;
	reloadDedupeSeconds: number;
	realtimeWindowMinutes: number;
	saltTimezone: string;
	saltRotationHour: number;
	ipTruncation: "standard" | "strict";
	excludeEditors: boolean;
	excludePaths: string[];
	excludeIpPrefixes: string[];
	ignoreReferrerHosts: string[];
	queryAllowlist: string[];
	captureLanguage: boolean;
	captureRegion: boolean;
	captureScreen: boolean;
	autoOutbound: boolean;
	autoDownloads: boolean;
	autoForms: boolean;
	/** Path prefixes the page script sends no `_download` or `_form` for. */
	ignorePathPrefixes: string[];
	/** Valid link rules, in order (`src/link-rules.ts`). */
	linkRules: LinkRule[];
	downloadExtensions: string[];
	logErrorPages: boolean;
	/** `queue` only takes effect while the queue binding exists. */
	ingestTier: "direct" | "queue";
	rawRetentionDays: number;
	rollupRetentionMonths: number;
	capacityProfile: CapacityProfile;
	/** Whole megabytes; 0 is the profile default. Read through `storageBudget`, never directly. */
	storageBudgetMb: number;
	agentRateLimitPerMinute: number;
	/** Canonical origin (`https://host`) or empty. */
	siteOrigin: string;
	gscAuth: "off" | "oauth" | "service_account";
	gscProperty: string;
	gscClientId: string;
	gscClientSecret: string;
	gscRefreshToken: string;
	gscServiceAccount: string;
	bingEnabled: boolean;
	bingAuth: "apikey" | "oauth";
	bingApiKey: string;
	bingClientId: string;
	bingClientSecret: string;
	bingRefreshToken: string;
	/** An http or https url, or empty. */
	bingSiteUrl: string;
	searchSyncHours: number;
	syncSubrequestBudget: number;
	searchRetentionDays: number;
	backfillDays: number;
	searchMaxRowsPerDay: number;
	searchMinImpressions: number;
	searchOverlapMinShare: number;
	/** Lowercase terms, one per line in the stored value. */
	searchBrandTerms: string[];
	/** ISO 4217 code on the embedded list. */
	defaultCurrency: string;
	acceptClientRevenue: boolean;
	/** Master switch of the content hook annotations (`src/annotations/hook.ts`). */
	autoAnnotations: boolean;
	annotatePublish: boolean;
	annotateUpdate: boolean;
	/** Collection slugs that annotate; empty is every collection. */
	annotateCollections: string[];
	autoAnnotationsPerDay: number;
	/** Lowercase query parameter names of the site search, at most 5; empty is off. */
	siteSearchParams: string[];
}

export type CapacityProfile = "small" | "standard" | "dedicated";

/**
 * Limits per capacity profile: `bytes` is the storage budget of the analytics tables (summaries may use up to
 * `SUMMARY_SHARE` of it, detailed visits the rest), `requests` the database and storage calls one background
 * run may make (the Workers Free plan allows 50 per invocation, a paid plan 1,000).
 */
export const PROFILES: Readonly<Record<CapacityProfile, { bytes: number; requests: number }>> = {
	small: { bytes: 300e6, requests: 40 },
	standard: { bytes: 6e9, requests: 400 },
	dedicated: { bytes: 9e9, requests: 400 },
};
export const SUMMARY_SHARE = 0.25;

/** Where a site's analytics tables live: the EmDash database on D1 (`host`), an own D1 database (`own`) or Postgres (`postgres`). */
export type BudgetTarget = "host" | "own" | "postgres";

/** One row of the budget table, in MB: the default for setting 0, the allowed range and the warning thresholds ("above"). */
export interface BudgetRange {
	def: number;
	min: number;
	max: number;
	caution: number | null;
	strong: number | null;
}

/** A D1 database holds 10 GB; the EmDash database shares it with the site's content, so its budget stops at 9 GB. */
export const HOST_MAX_MB = 9000;
/** An own D1 database leaves 500 MB for what the estimate does not count (Search rows, aliases, space freed by deletes). */
export const OWN_MAX_MB = 9500;
/** The most a D1 database holds, in MB: 500 on the Workers Free plan (`small`), else 10 GB. */
export const d1CapMb = (profile: CapacityProfile): number => (profile === "small" ? 500 : 10_000);
/** Content plus analytics in the EmDash database above this share of `d1CapMb` is the strong warning at any budget. */
export const HOST_FULL_SHARE = 0.95;
/** Postgres has no hard cap to protect; the budget only keeps a small hosted plan from filling up. */
export const PG_MAX_MB = 2_000_000;

/** The budget table row of a profile in a target. `small` on D1 is the Workers Free plan's 500 MB database, wherever it is. */
export function budgetRange(profile: CapacityProfile, target: BudgetTarget): BudgetRange {
	const def = PROFILES[profile].bytes / 1e6;
	if (target === "postgres") return { def, min: 100, max: PG_MAX_MB, caution: null, strong: null };
	if (profile === "small") return { def, min: 50, max: 450, caution: 300, strong: 400 };
	if (target === "own") return { def, min: 100, max: OWN_MAX_MB, caution: 9000, strong: null };
	return { def: Math.min(def, HOST_MAX_MB), min: 100, max: HOST_MAX_MB, caution: 6000, strong: 8000 };
}

/** Budget in MB the setting gives in `target`: the profile default for 0, else the value clamped to the row's range (a value saved for another target never exceeds this one's maximum). */
export function budgetMb(s: Pick<Settings, "capacityProfile" | "storageBudgetMb">, target: BudgetTarget): number {
	const r = budgetRange(s.capacityProfile, target);
	return s.storageBudgetMb ? Math.min(r.max, Math.max(r.min, Math.round(s.storageBudgetMb))) : r.def;
}

/** The storage budget of the analytics tables in `target`: bytes, and the row's maximum in MB. The only reader of a profile's bytes. */
export function storageBudget(s: Pick<Settings, "capacityProfile" | "storageBudgetMb">, target: BudgetTarget): { bytes: number; max: number } {
	return { bytes: budgetMb(s, target) * 1e6, max: budgetRange(s.capacityProfile, target).max };
}

export type BudgetWarning = "none" | "caution" | "strong";

/**
 * Warning level of the budget the setting gives in `target`. `otherMb`, when known, is the rest of the EmDash database
 * (content and everything else besides the analytics estimate): with it, budget plus that rest above `HOST_FULL_SHARE`
 * of the profile's database (`d1CapMb`) is strong at any value.
 */
export function budgetWarning(s: Pick<Settings, "capacityProfile" | "storageBudgetMb">, target: BudgetTarget, otherMb?: number): BudgetWarning {
	const mb = budgetMb(s, target);
	const r = budgetRange(s.capacityProfile, target);
	if ((r.strong !== null && mb > r.strong) || (target === "host" && otherMb !== undefined && mb + otherMb > HOST_FULL_SHARE * d1CapMb(s.capacityProfile))) return "strong";
	return r.caution !== null && mb > r.caution ? "caution" : "none";
}

/** `https://host[:port]` from a url with no path, query or credentials; anything else is empty. */
export function normalizeOrigin(v: string): string {
	try {
		const u = new URL(v);
		if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return "";
		return u.origin;
	} catch {
		return "";
	}
}

function normalizeHttpUrl(v: string): string {
	try {
		const u = new URL(v);
		return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password && v.length <= 2048 ? u.href : "";
	} catch {
		return "";
	}
}

export function isValidTimezone(tz: unknown): tz is string {
	if (typeof tz !== "string" || tz === "") return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

function splitList(v: string): string[] {
	return v
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

const IPV4_CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
const IPV6_CIDR = /^[0-9a-f:]{2,39}\/(\d{1,3})$/;
function isCidr(s: string): boolean {
	const m4 = IPV4_CIDR.exec(s);
	if (m4) return m4.slice(1, 5).every((o) => Number(o) <= 255) && Number(m4[5]) <= 32;
	const m6 = IPV6_CIDR.exec(s);
	return !!m6 && s.includes(":") && Number(m6[1]) <= 128;
}

export const MAX_BRAND_TERMS = 20;
/** D1 refuses LIKE patterns of 50 bytes or more; a term is used as `%term%` with backslash, `%` and `_` escaped. */
const likeBytes = (t: string) => new TextEncoder().encode(`%${t.replace(/[\\%_]/g, "\\$&")}%`).length;

/** Brand terms: one per line, trimmed and lowercased, 2 to 40 characters, LIKE pattern under 50 bytes, unique, at most 20. */
export function parseBrandTerms(v: string): string[] {
	const terms = v
		.split(/\r?\n/)
		.map((t) => t.trim().toLowerCase())
		.filter((t) => t.length >= 2 && t.length <= 40 && likeBytes(t) < 50);
	return [...new Set(terms)].slice(0, MAX_BRAND_TERMS);
}

const listNormalizers: Record<string, (s: string) => boolean> = {
	excludePaths: (s) => s.startsWith("/") && s.length <= 256,
	// Served in the page script config, so a banned word drops the prefix.
	ignorePathPrefixes: (s) => s.startsWith("/") && s.length <= 256 && isNeutral(s),
	excludeIpPrefixes: isCidr,
	ignoreReferrerHosts: (s) => /^[a-z0-9.-]{1,253}$/.test(s),
	queryAllowlist: (s) => /^[a-z0-9_.-]{1,64}\*?$/.test(s),
	downloadExtensions: (s) => /^[a-z0-9]{1,8}$/.test(s),
	siteSearchParams: (s) => SITE_SEARCH_PARAM_RE.test(s),
	// The host's collection slug rule.
	annotateCollections: (s) => /^[a-z][a-z0-9_]{0,63}$/.test(s),
};
const LOWERCASE_LISTS = new Set(["excludeIpPrefixes", "ignoreReferrerHosts", "queryAllowlist", "downloadExtensions", "siteSearchParams", "annotateCollections"]);

export const SITE_SEARCH_MAX_PARAMS = 5;
/** A site search parameter name; lowercase because stored query keys are lowercased (`normalizeUrl`). */
const SITE_SEARCH_PARAM_RE = /^[a-z0-9_]{1,16}$/;

/** Site search parameter names of a comma or space separated string: lowercased, unique, at most 5, and the invalid ones. */
export function parseSiteSearchParams(v: string): { names: string[]; invalid: string[] } {
	const items = [...new Set(splitList(v.toLowerCase()))];
	const invalid = items.filter((n) => !SITE_SEARCH_PARAM_RE.test(n));
	if (items.length - invalid.length > SITE_SEARCH_MAX_PARAMS) invalid.push(...items.filter((n) => SITE_SEARCH_PARAM_RE.test(n)).slice(SITE_SEARCH_MAX_PARAMS));
	return { names: items.filter((n) => !invalid.includes(n)), invalid };
}

function toNumber(v: unknown): number | undefined {
	const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
	return Number.isFinite(n) ? n : undefined;
}

function toBoolean(v: unknown): boolean | undefined {
	if (typeof v === "boolean") return v;
	if (v === "true" || v === 1) return true;
	if (v === "false" || v === 0) return false;
	return undefined;
}

/** Apply defaults, range clamps and neutral fallbacks to raw stored settings. Never throws. */
export function normalizeSettings(raw: Record<string, unknown> | null | undefined): Settings {
	const src = raw ?? {};
	const out: Record<string, unknown> = {};
	for (const [key, field] of Object.entries(settingsSchema) as [string, SettingField][]) {
		const v = src[key];
		switch (field.type) {
			case "number": {
				const n = toNumber(v);
				const def = field.default ?? 0;
				out[key] = n === undefined ? def : Math.min(field.max ?? n, Math.max(field.min ?? n, Math.round(n)));
				break;
			}
			case "boolean":
				out[key] = toBoolean(v) ?? field.default ?? false;
				break;
			case "select":
				out[key] = typeof v === "string" && field.options.some((o) => o.value === v) ? v : field.default;
				break;
			case "secret":
				out[key] = typeof v === "string" ? v : "";
				break;
			default: {
				const def = "default" in field ? (field.default ?? "") : "";
				const s = typeof v === "string" ? v : def;
				const check = listNormalizers[key];
				if (check) {
					const items = splitList(LOWERCASE_LISTS.has(key) ? s.toLowerCase() : s).filter(check);
					out[key] = [...new Set(items)];
				} else {
					out[key] = s.trim();
				}
			}
		}
	}
	const s = out as unknown as Settings;
	if (!/^[a-z0-9-]{1,32}$/.test(s.siteId)) s.siteId = "default";
	if (!isValidTimezone(s.siteTimezone)) s.siteTimezone = "UTC";
	if (!isValidTimezone(s.saltTimezone)) s.saltTimezone = "UTC";
	s.scriptPath = normalizeScriptPath(s.scriptPath);
	s.collectPath = normalizeCollectPath(s.collectPath);
	s.namespace = normalizeNamespace(s.namespace);
	s.siteOrigin = s.siteOrigin ? normalizeOrigin(s.siteOrigin) : "";
	s.bingSiteUrl = s.bingSiteUrl ? normalizeHttpUrl(s.bingSiteUrl) : "";
	if (s.scriptPath === s.collectPath) {
		s.scriptPath = DEFAULT_SCRIPT_PATH;
		s.collectPath = DEFAULT_COLLECT_PATH;
	}
	s.searchBrandTerms = parseBrandTerms(String(out.searchBrandTerms ?? ""));
	s.siteSearchParams = s.siteSearchParams.slice(0, SITE_SEARCH_MAX_PARAMS);
	s.linkRules = parseLinkRules(String(out.linkRules ?? ""), s.ignorePathPrefixes).rules;
	s.sharePath = normalizeSharePath(s.sharePath);
	if (s.sharePath === s.scriptPath || s.sharePath === s.collectPath) s.sharePath = DEFAULT_SHARE_PATH;
	// A script or event path set to the share default: all three fall back to their defaults.
	if (s.sharePath === s.scriptPath || s.sharePath === s.collectPath) {
		s.scriptPath = DEFAULT_SCRIPT_PATH;
		s.collectPath = DEFAULT_COLLECT_PATH;
	}
	return s;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze(normalizeSettings({}));

/** How long a failed settings read is cached before the next request retries. */
export const SETTINGS_FAILURE_TTL_MS = 5_000;

/**
 * Isolate cache around a raw settings loader. Concurrent calls share one load.
 * A failing loader serves the last good snapshot, or defaults when none was ever
 * loaded, and is retried after at most SETTINGS_FAILURE_TTL_MS (never a full ttl of defaults).
 */
export function cachedSettings(
	loader: () => Promise<Record<string, unknown> | null | undefined>,
	ttlMs = 60_000,
	now: () => number = Date.now,
): (() => Promise<Settings>) & { clear(): void } {
	let good: Settings | undefined;
	let value: Settings | undefined;
	let at = Number.NEGATIVE_INFINITY;
	let ttl = ttlMs;
	let inflight: Promise<Settings> | undefined;
	const get = () => {
		if (value && now() - at < ttl) return Promise.resolve(value);
		inflight ??= loader()
			.then((raw) => {
				good = normalizeSettings(raw);
				ttl = ttlMs;
				return good;
			})
			.catch(() => {
				ttl = Math.min(ttlMs, SETTINGS_FAILURE_TTL_MS);
				return good ?? normalizeSettings({});
			})
			.then((s) => {
				value = s;
				at = now();
				inflight = undefined;
				return s;
			});
		return inflight;
	};
	/** The next read reloads (after the plugin itself wrote a setting). */
	const clear = () => {
		at = Number.NEGATIVE_INFINITY;
	};
	return Object.assign(get, { clear });
}
