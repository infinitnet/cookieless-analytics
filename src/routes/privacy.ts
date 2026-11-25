/**
 * Privacy receipt: what is stored, for how long, salt age, drop counters, row counts,
 * the fixed statement, and a Markdown block for the site's privacy page (with the legal basis line). `plugins:read`.
 */
import type { KvLike } from "../core/crypto.js";
import { ingestStatus } from "../core/queue-sink.js";
import { addDays, dayInZone, saltBoundary, saltDay, zonedToEpoch } from "../core/time.js";
import { PluginRouteError } from "emdash";
import { workerEnv } from "../core/worker-env.js";
import { type Db, type Dialect, selfCheck, type SizeInfo } from "../db/adapter.js";
import { drops } from "../core/drops.js";
import { redact } from "../db/pg.js";
import { queryCacheOn } from "../db/query-cache.js";
import { type D1Like, fromD1, isD1 } from "../db/d1.js";
import { pluginFactsOrNull, stateKv } from "../db/facts.js";
import { isOwnDatabase } from "../db/schema.js";
import { dayInt, q } from "../db/dialect.js";
import { budgetTargetOf, KV_WRITE_BUDGET, type WriteBudget } from "../query/storage.js";
import { effectiveRawDays, KV_CURSOR, type RetentionCursor, SALT_KEEP_DAYS } from "../query/retention.js";
import { KV_WATERMARK } from "../query/rollup.js";
import { KV_PLATFORM_LIMIT, type PlatformLimit } from "./in.js";
import { z } from "zod";
import { bindSite, type BoundSite, SiteField, type SitesColl } from "../multisite/registry.js";
import { budgetMb, budgetWarning, d1CapMb, type Settings } from "../settings.js";

export const STATEMENT = "No cookies, no device storage unless a visitor opts out, no raw IP, no raw user agent.";
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

/** Fixed line of the copyable block: the legal basis of counting visits and the right to object. */
export const LEGAL_BASIS_LINE = "Visits are counted on the basis of our legitimate interest in knowing how this site is used (Article 6(1)(f) GDPR). You can object at any time.";

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
			"country, region, device, browser, browser_major, os, lang, screen, host": "Country (and region when enabled) from the edge, device class, browser and OS family, language, screen size class (only with captureScreen), site host name.",
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
	/** The Worker's bindings, for the EmDash database's live size (`hostBinding`); default `workerEnv`. */
	workerEnv?(): Promise<Record<string, unknown> | null>;
	/** Milliseconds, for the self-check's latency; default `Date.now`. */
	clock?(): number;
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
		"- Nothing is stored on your device unless you choose to stop being counted, and then only that choice. A visit is recognized by a random id that lives only in the open page.",
		"- Visits are counted per day with a key made from a shortened IP address and the browser family, mixed with a random salt that is deleted after two days. The key cannot be turned back into an IP address and cannot link visits across days.",
		`- Stored per visit: pages viewed, active and visible time per page, scroll depth, referring site, campaign tags, country, device class, browser and system family, language${s.captureScreen ? ", screen size class" : ""}.`,
		`- ${SATISFACTION_LINE}`,
		`- ${SHARING_LINE}`,
		`- ${REVENUE_LINE}`,
		`- ${ORDER_SESSION_LINE}`,
		`- ${SITE_SEARCH_LINE}`,
		`- Detailed visit records are deleted after ${rawDays} days; daily totals without visitor keys are kept for ${s.rollupRetentionMonths} months.`,
		`- ${LEGAL_BASIS_LINE}`,
		s.signals === "none" ? "- Browser privacy signals are not used." : `- Browsers that send ${s.signals === "gpc" ? "Global Privacy Control" : "Global Privacy Control or the DNT header"} are not counted.`,
		"- Known crawlers and automated clients are not counted.",
		"",
	].join("\n");
}

/** The most a D1 database holds, in bytes: 10 GB, 500 MB on the Workers Free plan (`small`). */
export const d1Cap = (s: Pick<Settings, "capacityProfile">) => d1CapMb(s.capacityProfile) * 1e6;

/**
 * The D1 binding of the EmDash database: EmDash does not tell plugins its binding name, so it is the one D1 binding
 * of the Worker that no analytics database option names. Null when there is none or more than one.
 */
async function hostBinding(env: () => Promise<Record<string, unknown> | null>): Promise<D1Like | null> {
	const own = new Set(pluginFactsOrNull()?.targets().map((t) => t.binding) ?? []);
	const found = Object.entries((await env()) ?? {}).filter(([name, b]) => !own.has(name) && isD1(b));
	return found.length === 1 ? (found[0]![1] as D1Like) : null;
}

/** Size of the EmDash database on D1: `size_after` of one statement on its raw binding (the Kysely path has no meta). */
async function hostSize(env: () => Promise<Record<string, unknown> | null>): Promise<SizeInfo | null> {
	const b = await hostBinding(env);
	return b ? (fromD1(b).size?.() ?? null) : null;
}

/**
 * Live size of the database `db`: its own `size()` (own D1, Postgres), else for the EmDash database `hostSize`. Null
 * where neither answers (another binding name, another host); the page then says "estimated". Never throws: a size
 * is a display, not a check.
 */
export async function liveSize(db: Db, env: () => Promise<Record<string, unknown> | null> = workerEnv): Promise<SizeInfo | null> {
	try {
		return db.size ? await db.size() : isOwnDatabase(db) ? null : await hostSize(env);
	} catch {
		return null;
	}
}

/** MB of the EmDash database that are not analytics: the live size less the last estimate (null when either is unknown). */
export function otherMb(size: SizeInfo | null, analyticsBytes: number | undefined): number | null {
	return size && analyticsBytes !== undefined ? Math.max(0, Math.round((size.bytes - analyticsBytes) / 1e6)) : null;
}

/** `otherMb` of the EmDash database for the Settings page: its live size through its D1 binding and the default database's estimate. */
export async function hostOtherMb(kv: Pick<KvLike, "get">, env: () => Promise<Record<string, unknown> | null> = workerEnv): Promise<number | null> {
	const size = await hostSize(env).catch(() => null);
	return size ? otherMb(size, (await kv.get<RetentionCursor>(KV_CURSOR).catch(() => null))?.storage?.bytes) : null;
}

/** A self-check slower than this marks the database slow. Measured through Hyperdrive: 3 to 19 ms warm, about 700 ms for the first statement of a Neon database that scaled to zero. */
export const SLOW_MS = 1000;

export interface Health {
	engine: Dialect;
	/** `caching_on`: the Hyperdrive binding caches reads, so ingest refuses every write until it is recreated. */
	status: "ok" | "slow" | "unreachable" | "caching_on";
	/** Milliseconds of the self-check statement. */
	latencyMs: number;
	/** The query cache probe: false for D1, null when it could not run. */
	queryCache: boolean | null;
	/** The self-check's error, redacted here: `fromPg` redacts its own errors, a host database on Postgres through Kysely does not. */
	error?: string;
}

/** One timed `selfCheck`, then the query cache probe (once per isolate and binding). Never throws. */
export async function healthOf(db: Db, clock: () => number = Date.now): Promise<Health> {
	const t0 = clock();
	const check = await selfCheck(db);
	const latencyMs = Math.max(0, Math.round(clock() - t0));
	if (!check.ok) return { engine: db.dialect, status: "unreachable", latencyMs, queryCache: null, error: redact(check.error) };
	// A slow database skips the probe (5 statements, up to `PROBE_MS`): the admin page answers within the self-check's time.
	if (latencyMs >= SLOW_MS) return { engine: db.dialect, status: "slow", latencyMs, queryCache: null };
	const queryCache = await queryCacheOn(db).catch(() => null);
	return { engine: db.dialect, status: queryCache ? "caching_on" : "ok", latencyMs, queryCache };
}

/** The binding of `site`'s analytics tables (null: the CMS database). */
function bindingOf(site: string): string | null {
	const facts = pluginFactsOrNull();
	return facts ? (facts.binding(site) ?? facts.targets()[0]?.binding ?? null) : null;
}

/** The one message of an unreachable database: engine, binding, the redacted error and the drops this instance counted meanwhile. */
export function unreachableText(h: Health, binding: string | null, pending: number): string {
	const where = `${h.engine === "postgres" ? "Postgres" : "D1 or SQLite"}${binding ? `, binding ${binding}` : ""}`;
	return `The database self-check failed (${where}, after ${h.latencyMs} ms): ${h.error ?? "no answer"}. Page views and events sent meanwhile are refused and counted as not recorded; the page script sends them again.${pending ? ` ${pending} such counts wait in this server instance until the database answers.` : ""}`;
}

/**
 * The Data page's capacity panel: the profile, the database the site's analytics tables live in (null: the CMS
 * database), its live size (`liveSize`) against the most a D1 database holds (`cap`, null on Postgres), the storage
 * budget in MB with its warning level (`budgetWarning`), the drops of today and of the last 7 days, and the
 * last background run stopped by a platform limit (`platformLimit`, null when none in the last 7 days).
 * `analyticsBytes` is the last storage estimate, which turns the size into the rest of the EmDash database.
 * `sizeWholeDatabase`: on Postgres the size is the whole database, other applications' tables included.
 * `budget.contentCheck`: false when the EmDash database's size is unknown, so budget plus content is not checked.
 */
export async function capacityOf(db: Db, s: Settings, now: number, site: string, kv?: Pick<KvLike, "get">, opts: { analyticsBytes?: number; env?: () => Promise<Record<string, unknown> | null>; health?: Health } = {}) {
	const health = opts.health ?? (await healthOf(db));
	const today = dayInZone(now, s.siteTimezone);
	const dropsToday = await dropCounts(db, site, today, 1);
	const drops7 = await dropCounts(db, site, today, 7);
	const limit = (await kv?.get<PlatformLimit>(KV_PLATFORM_LIMIT)) ?? null;
	const size = await liveSize(db, opts.env);
	const target = budgetTargetOf(db);
	const other = target === "host" ? otherMb(size, opts.analyticsBytes) : null;
	return {
		profile: s.capacityProfile,
		rawRetentionDays: s.rawRetentionDays,
		database: bindingOf(site),
		health,
		size: size?.bytes ?? null,
		sizeWholeDatabase: db.dialect === "postgres",
		cap: db.dialect === "sqlite" ? d1Cap(s) : null,
		budget: { target, mb: budgetMb(s, target), level: budgetWarning(s, target, other ?? undefined), otherMb: other, contentCheck: target !== "host" || size !== null },
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
			const health = await healthOf(db, env.clock);
			if (health.status === "unreachable") {
				// Refused writes only: bots and privacy signals are counted whether or not the database answers.
				const pending = drops.rows().reduce((n, r) => n + (r.site === bound.id && (r.reason === "write_error" || r.reason === "overload") ? r.n : 0), 0);
				throw new PluginRouteError("db_unavailable", unreachableText(health, bindingOf(bound.id), pending), 503);
			}
			const now = env.now?.() ?? Math.floor(Date.now() / 1000);
			const receipt = await buildReceipt(db, ctx.kv, s, now, bound);
			return {
				...receipt,
				db: { dialect: db.dialect },
				ingest: await ingestStatus(s, undefined, db.dialect),
				capacity: await capacityOf(db, s, now, bound.id, ctx.kv, { analyticsBytes: receipt.retention.storage?.bytes, health, ...(env.workerEnv ? { env: env.workerEnv } : {}) }),
			};
		},
	};
}
