/**
 * Privacy receipt: what is stored, for how long, salt age, drop counters, row counts,
 * the fixed statement, and a Markdown block for the site's privacy page. `plugins:read`.
 */
import type { KvLike } from "../core/crypto.js";
import { ingestStatus } from "../core/queue-sink.js";
import { addDays, dayInZone, saltBoundary, saltDay, zonedToEpoch } from "../core/time.js";
import { PluginRouteError } from "emdash";
import { type Db, selfCheck } from "../db/adapter.js";
import { pluginFactsOrNull, stateKv } from "../db/facts.js";
import { dayInt, q } from "../db/dialect.js";
import { KV_WRITE_BUDGET, type WriteBudget } from "../query/storage.js";
import { effectiveRawDays, KV_CURSOR, type RetentionCursor, SALT_KEEP_DAYS } from "../query/retention.js";
import { KV_WATERMARK } from "../query/rollup.js";
import { KV_PLATFORM_LIMIT, type PlatformLimit } from "./in.js";
import { z } from "zod";
import { bindSite, type BoundSite, SiteField, type SitesColl } from "../multisite/registry.js";
import type { Settings } from "../settings.js";

export const STATEMENT = "No cookies, no device storage, no raw IP, no raw user agent.";
/** Fixed receipt line for the satisfaction measures. */
export const SATISFACTION_LINE =
	"Per page view we keep how long the page was visible and active, how far it was scrolled, how it was reached (new, reload, back or forward) and how it was left (hidden, closed, or kept for back and forward). Per session we count repeat arrivals from a search engine. The script never reads or changes your browser history.";
/** Fixed receipt line for shared dashboard links. */
export const SHARING_LINE =
	"Shared views show aggregated numbers only, the same as the admin pages: no visitor identifiers, no raw rows. Opening a shared view is not counted as a visit to any site. Per shared link we store how many times it was opened and when it was last opened.";
/** Fixed receipt line for revenue on events. */
export const REVENUE_LINE =
	"Order values and currency codes sent with events. We do not store order ids (they only decide whether an order was already counted), buyer names, emails or payment data.";
/** Fixed receipt line for session tokens kept by the site's own server. */
export const ORDER_SESSION_LINE =
	"If your own server keeps the session token next to an order, that links the order to the pages of that session in your own records. This plugin stores no order id and no buyer data.";
/** Fixed receipt line for the internal site search report. */
export const SITE_SEARCH_LINE = "If a site search parameter is configured, the words searched for are kept, with emails and long numbers removed.";

/** Fixed receipt line for scheduled dashboard email. */
export const EMAIL_LINE = "If you schedule an email, the recipients you enter are kept with the dashboard.";
/** Days summed by the agent status route; the receipt sums the detailed retention window. */
export const DROP_DAYS = 30;
/** Fixed receipt line under the drop counters. */
export const DROPS_LINE =
	"Counted in memory per server instance and written every few seconds, so the figures are a lower bound. Nothing about these requests is kept: no address, no browser string, no row per request. Bots are counted under bot and never stored.";

type Retention = "raw" | "rollup" | "aliases" | "search" | "config" | "salts" | "budget";

interface TableInfo {
	name: string;
	kind: "table" | "storage" | "kv";
	description: string;
	retention: Retention;
	columns?: Record<string, string>;
}

/** Plain-language table list (`kind` avoids the forbidden public words). Keep in step with `src/db/schema.ts` and the storage collections. */
export const TABLES: readonly TableInfo[] = [
	{
		name: "ca_sessions",
		kind: "table",
		retention: "raw",
		description: "One row per visit: a run of page views by one visitor key with gaps under the session window.",
		columns: {
			"site, sid": "Site id and a random session id made in the browser tab; not linked to a person.",
			vkey: "Daily visitor key: a hash of a shortened IP address and the browser family with a salt that is deleted after two days.",
			"day, hour, started, last_seen, window_s": "Local day and hour, start and last activity time, session window.",
			"entry_path, exit_path, pageviews, events, engaged_ms, max_scroll, interacted": "First and last page, counts, active time and scroll depth.",
			visible_ms: "Total time the visit's pages were visible on screen, in milliseconds.",
			reentries: "How many times a later arrival from a search engine joined this visit.",
			"ref_host, ref_path, channel, source, utm_*": "Where the visit came from: referring site and campaign tags of the first page.",
			"country, region, device, browser, browser_major, os, lang, screen, host": "Country (and region when enabled) from the edge, device class, browser and OS family, language, screen size class, site host name.",
			hits: "The visit's page views and events: path with allowed campaign parameters, time since the visit started, how the page was reached and left, active and visible time, scroll depth, event names and properties.",
		},
	},
	{
		name: "ca_events",
		kind: "table",
		retention: "raw",
		description: `Orders and events reported by the site's server, one row each, with the visit they belong to when known. ${REVENUE_LINE}`,
	},
	{ name: "ca_srv", kind: "table", retention: "raw", description: "Error pages seen by the server: a count per day, status, path and referring page, and the time of the last one." },
	{ name: "ca_drops", kind: "table", retention: "raw", description: "Counts of requests not recorded, per day and reason." },
	{ name: "ca_cube", kind: "table", retention: "rollup", description: "Daily totals per channel, country and device, kept after raw rows are deleted. No visitor keys." },
	{ name: "ca_rollup", kind: "table", retention: "rollup", description: "Daily totals per report dimension (top values only), kept after raw rows are deleted. No visitor keys." },
	{ name: "ca_revenue_daily", kind: "table", retention: "rollup", description: `Daily order counts and order values per currency and report dimension (top values only), kept after raw rows are deleted. ${REVENUE_LINE}` },
	{ name: "ca_aliases", kind: "table", retention: "aliases", description: "Short-lived links from a second tab's session id to the visit it joined." },
	{ name: "ca_search_daily", kind: "table", retention: "search", description: "Daily clicks, impressions and positions from connected search providers per page, query, country and device. No visitor data." },
	{ name: "goals", kind: "storage", retention: "config", description: "Goal definitions." },
	{ name: "funnels", kind: "storage", retention: "config", description: "Funnel definitions." },
	{ name: "segments", kind: "storage", retention: "config", description: "Saved filter sets." },
	{ name: "channel_rules", kind: "storage", retention: "config", description: "Custom channel rules." },
	{ name: "agent_rules", kind: "storage", retention: "config", description: "Custom user agent rules for exclusion." },
	{ name: "annotations", kind: "storage", retention: "config", description: "Chart notes, written by hand or on content publish and update." },
	{ name: "api_keys", kind: "storage", retention: "config", description: "API keys for agents and connected sites: label, scopes and a hash of the secret; the secret itself is never stored." },
	{ name: "sites", kind: "storage", retention: "config", description: "Other sites that send visits to this install: name, host names, a public site key and the search property mapping." },
	{ name: "dashboards", kind: "storage", retention: "config", description: `Saved dashboard layouts: name, tiles with report, chart type and filters, default range. No visitor data. ${EMAIL_LINE}` },
	{ name: "shares", kind: "storage", retention: "config", description: "Shared dashboard links: a hash of the link, an optional password verifier, an expiry and how often and when the link was last opened. Never the link or the password." },
	{ name: "salt:<day>", kind: "kv", retention: "salts", description: "Random daily salt for visitor keys." },
	{ name: "budget:writes", kind: "kv", retention: "budget", description: "With the small capacity profile only: the estimate of today's database writes, from today's page view count." },
	{ name: "cron:owed", kind: "kv", retention: "budget", description: "Background tasks waiting for their turn when the Cron Trigger runs several in one invocation, with the time each started waiting." },
	{ name: "platform_limit_hit", kind: "kv", retention: "budget", description: "Time, task and kind of the last background run stopped by a platform request limit or an overloaded database; no visitor data." },
];

export interface ReceiptEnv {
	db(site?: string): Promise<Db>;
	settings(): Promise<Settings>;
	now?(): number;
}

export interface ReceiptCtx {
	kv: KvLike;
	input?: unknown;
	storage?: { sites?: Pick<SitesColl, "query"> };
}

export const ReceiptBody = z.object({ site: SiteField }).strict().optional();
/** Shown with a client site's receipt. */
export const PER_DATABASE_NOTE = "Retention settings apply to every site measured by this install; they cannot differ per site.";

/** Requests not recorded per reason over the `days` days up to `today` (site time zone), from `ca_drops`. */
export async function dropCounts(db: Db, site: string, today: string, days: number): Promise<Record<string, number>> {
	const f = q(db.dialect)`SELECT reason, SUM(n) AS n FROM ca_drops WHERE site = ${site} AND day > ${dayInt(addDays(today, -days))} GROUP BY reason ORDER BY reason`;
	const rows = await db.all<{ reason: string; n: number | string }>(f.sql, f.params);
	return Object.fromEntries(rows.map((r) => [r.reason, Number(r.n)]));
}

export async function buildReceipt(db: Db, kv: KvLike, s: Settings, now: number, bound: BoundSite = { id: s.siteId, kind: "local" }) {
	// Retention, watermark and budget are state of the site's database; salts belong to the install.
	const dkv = stateKv(kv, bound.id);
	const rawDays = await effectiveRawDays(dkv, s);
	const cursor = await dkv.get<RetentionCursor>(KV_CURSOR);
	const retention: Record<Retention, string> = {
		raw: `${rawDays} days`,
		rollup: `${s.rollupRetentionMonths} months`,
		aliases: "one day after they are written",
		search: `${s.searchRetentionDays} days`,
		config: "until deleted in the admin",
		salts: `${SALT_KEEP_DAYS} days`,
		budget: "until the next UTC day",
	};

	const rows: Record<string, number> = {};
	for (const t of TABLES.filter((x) => x.kind === "table")) {
		const [r] = await db.all(`SELECT COUNT(*) AS n FROM ${t.name} WHERE site = ?`, [bound.id]);
		rows[t.name] = Number(r?.n ?? 0);
	}

	const drops = await dropCounts(db, bound.id, dayInZone(now, s.siteTimezone), rawDays);
	// The write guard of the small profile, while it holds today (shown on the Data page).
	const budget = s.capacityProfile === "small" ? await dkv.get<WriteBudget>(KV_WRITE_BUDGET) : null;

	const current = saltDay(now, s.saltTimezone, s.saltRotationHour);
	const salt = {
		day: current,
		ageSeconds: now - saltBoundary(now, s.saltTimezone, s.saltRotationHour),
		nextRotation: zonedToEpoch(addDays(current, 1), s.saltRotationHour, s.saltTimezone),
		stored: (await kv.list("salt:")).map((e) => e.key.slice(5)).sort(),
	};

	const tables = TABLES.map((t) => ({ ...t, retention: retention[t.retention], ...(t.name in rows ? { rows: rows[t.name] } : {}) }));
	return {
		site: { id: bound.id, kind: bound.kind },
		...(bound.kind === "client" ? { note: PER_DATABASE_NOTE } : {}),
		statement: STATEMENT,
		satisfaction: SATISFACTION_LINE,
		sharing: SHARING_LINE,
		revenue: REVENUE_LINE,
		orderSession: ORDER_SESSION_LINE,
		siteSearch: SITE_SEARCH_LINE,
		email: EMAIL_LINE,
		tables,
		retention: { rawDays, rawCapped: !!cursor?.capped, storage: cursor?.storage ?? null, rollupWatermark: await dkv.get<string>(KV_WATERMARK), ...retention },
		salt,
		drops: { days: rawDays, byReason: drops, note: DROPS_LINE },
		writes: budget && budget.day === dayInZone(now, "UTC") ? { blocked: budget.blocked, rows: budget.rows, limit: budget.limit } : null,
		markdown: receiptMarkdown(s, rawDays),
	};
}

/** Copyable block for the site's privacy page. Plain words only: it is pasted into public pages. */
export function receiptMarkdown(s: Settings, rawDays: number): string {
	return [
		"## Visitor measurement on this site",
		"",
		`${STATEMENT} This site counts visits with a cookieless, self-hosted tool that runs on its own server.`,
		"",
		"- Nothing is stored on your device. A visit is recognised by a random id that lives only in the open page.",
		"- Visits are counted per day with a key made from a shortened IP address and the browser family, mixed with a random salt that is deleted after two days. The key cannot be turned back into an IP address and cannot link visits across days.",
		"- Stored per visit: pages viewed, time on page, scroll depth, referring site, campaign tags, country, device class, browser and system family, language.",
		`- ${SATISFACTION_LINE}`,
		`- ${SHARING_LINE}`,
		`- ${REVENUE_LINE}`,
		`- ${ORDER_SESSION_LINE}`,
		`- ${SITE_SEARCH_LINE}`,
		`- Detailed visit records are deleted after ${rawDays} days; daily totals without visitor keys are kept for ${s.rollupRetentionMonths} months.`,
		s.signals === "none" ? "- Browser privacy signals are not used." : `- Browsers that send ${s.signals === "gpc" ? "Global Privacy Control" : "Global Privacy Control or the DNT header"} are not counted.`,
		"- Known crawlers and automated clients are not counted.",
		"",
		"This text describes the technical setup. It is not legal advice.",
		"",
	].join("\n");
}

/**
 * The Data page's capacity panel: the profile, the database the site's analytics tables live in (null: the CMS
 * database), its size as D1 reported it (own D1 database only), the drops of today and of the last 7 days, and
 * the last background run stopped by a platform limit (`platformLimit`, null when none in the last 7 days).
 */
export async function capacityOf(db: Db, s: Settings, now: number, site: string, kv?: Pick<KvLike, "get">) {
	const facts = pluginFactsOrNull();
	const today = dayInZone(now, s.siteTimezone);
	const dropsToday = await dropCounts(db, site, today, 1);
	const drops7 = await dropCounts(db, site, today, 7);
	const limit = (await kv?.get<PlatformLimit>(KV_PLATFORM_LIMIT)) ?? null;
	return {
		profile: s.capacityProfile,
		rawRetentionDays: s.rawRetentionDays,
		database: facts ? (facts.binding(site) ?? facts.targets()[0]?.binding ?? null) : null,
		// `meta` is the last statement's: one of the reads above, on this database.
		sizeAfter: db.meta?.size_after ?? null,
		dropsToday,
		drops7,
		platformLimit: limit && limit.at >= (now - 7 * 86_400) * 1000 ? limit : null,
		today,
	};
}

export function privacyRoute(env: ReceiptEnv) {
	return {
		permission: "plugins:read" as const,
		input: ReceiptBody,
		async handler(ctx: ReceiptCtx) {
			const body = ReceiptBody.parse(ctx.input ?? undefined);
			const s = await env.settings();
			const bound = await bindSite(body?.site, s.siteId, ctx.storage?.sites);
			const db = await env.db(bound.id);
			// The Data page shows this message as its database banner.
			const check = await selfCheck(db);
			if (!check.ok) throw new PluginRouteError("db_unavailable", `The database self-check failed: ${check.error}`, 503);
			const now = env.now?.() ?? Math.floor(Date.now() / 1000);
			const receipt = await buildReceipt(db, ctx.kv, s, now, bound);
			return { ...receipt, db: { dialect: check.dialect }, ingest: await ingestStatus(s), capacity: await capacityOf(db, s, now, bound.id, ctx.kv) };
		},
	};
}
