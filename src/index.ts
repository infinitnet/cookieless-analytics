/** Plugin descriptor (for `emdash({ plugins: [...] })`) and the native runtime `createPlugin`. */
import { after, definePlugin, getPluginSettings, type PluginContext, type PluginDescriptor, type RouteContext } from "emdash";
import { getDb } from "emdash/runtime";
import type { z } from "zod";
import { type AgentCtx, agentRoutes } from "./agent/routes.js";
import { MAX_USER_RULES, type UserAgentRule } from "./agents/rules.js";
import { resetStoredAgentRules } from "./agents/stored.js";
import { drops } from "./core/drops.js";
import { PLUGIN_ID, PRODUCT_NAME, ROUTES, VERSION } from "./contract.js";
import { buildChannelRules, type ChannelRule } from "./core/channels.js";
import type { KvLike } from "./core/crypto.js";
import { routedSink } from "./core/queue-sink.js";

import { fromKysely } from "./db/adapter.js";
import type { Db } from "./db/adapter.js";
import { eachTarget, ensureHostSchema, factsDb, missingDb, setPluginFacts } from "./db/facts.js";
import { pgOwnScope, pgScope } from "./db/pg.js";
import { ensureSchema, ensureSchemaOnce } from "./db/schema.js";
import { createRateLimiter } from "./keys/ratelimit.js";
import { pageFragments } from "./fragments.js";
import { cleanSalts, rawFromDay, runRetention } from "./query/retention.js";
import { runRevenue, runRollup } from "./query/rollup.js";
import { type ConfigCtx, configRoutes } from "./routes/config.js";
import { annotate } from "./annotations/hook.js";
import { type PreviewCtx, previewRoute } from "./routes/annotations.js";
import { type EditorCtx, editorRoutes } from "./routes/editor.js";
import { contractRoute } from "./routes/contract.js";
import { type DashCtx, dashboardRoutes } from "./routes/dashboards.js";
import { mailDeps, runMailTick, type MailTickCtx } from "./dashboards/mail.js";
import { type Coll, type DataCtx, dataCatalogRoute, dataExportRoute, dataQueryRoute, loadGoals } from "./routes/data.js";
import { MCP_TOOLS } from "./mcp.js";
import type { RouteCtx, RouteEnv } from "./routes/env.js";
import { inRoute, KV_PLATFORM_LIMIT, type PlatformLimit, platformLimitKind } from "./routes/in.js";
import { type KeysCtx, keyRoutes } from "./routes/keys.js";
import { privacyRoute, type ReceiptCtx } from "./routes/privacy.js";
import { sessionRoute } from "./routes/session.js";
import { type ShareViewCtx, shareViewRoute } from "./routes/share-view.js";
import { type SharesCtx, shareRoutes } from "./routes/shares.js";
import { type SettingsCtx, settingsRoutes } from "./routes/settings.js";
import { type SitesCtx, siteRoutes } from "./routes/sites.js";
import { type SearchCtx, searchRoutes, searchService } from "./routes/search.js";
import { type ToolsCtx, toolRoutes } from "./routes/tools.js";
import { type MoveCtx, moveRoutes, refuseWhileMoving } from "./routes/move.js";
import { isMoving, KV_MOVE_JOB, MOVE_CRON, type MoveEnv, type MoveJob, openBinding, runMoveJob } from "./move/job.js";
import { runDeleteJob } from "./query/filtered-delete.js";
import { CONTINUE_JOBS, runSearchTick } from "./sources/sync.js";
import { cachedSettings, PROFILES, type Settings, settingsSchema } from "./settings.js";
import { allowedHostsFor, engineOf, type PluginOptions, parseOptions } from "./multisite/config.js";
import { createRemote, remoteSummaryRows } from "./multisite/proxy.js";

export { PLUGIN_ID, VERSION } from "./contract.js";
export type { PluginOptions, RemoteSite } from "./multisite/config.js";
const PACKAGE = "@infinitnet/cookieless-analytics";

/** Capabilities: the head script via `page:fragments`, content reads for annotations, scheduled dashboard email through the host provider, schema reads for the collection report, outbound calls to the Search providers. */
export const CAPABILITIES = ["hooks.page-fragments:register", "content:read", "email:send", "network:request", "schema:read"] as const;
/** Exact hosts `ctx.http` may reach for Search; never a wildcard. Remote satellites add their hostnames. */
export const ALLOWED_HOSTS = ["oauth2.googleapis.com", "www.googleapis.com", "ssl.bing.com", "www.bing.com"] as const;

/** Config collections. Composite indexes are runtime-only; the descriptor carries flat ones. */
export const STORAGE = {
	goals: { indexes: ["site", ["site", "active"]] },
	funnels: { indexes: ["site"] },
	segments: { indexes: ["site"] },
	channel_rules: { indexes: ["site", ["site", "priority"]] },
	agent_rules: { indexes: ["site", ["site", "priority"]] },
	annotations: { indexes: ["site", "ts", ["site", "ts"]] },
	api_keys: { indexes: ["prefix"] },
	sites: { indexes: ["key"] },
	// `emailNext`: the mail task picks the next due dashboard; a top level field, as indexes require.
	dashboards: { indexes: ["site", "emailNext"] },
	shares: { indexes: ["prefix", "site"] },
} satisfies Record<string, { indexes: Array<string | string[]> }>;

/**
 * Admin pages; each path is a key of `pages` in `src/admin/index.tsx`. Icon names resolve in the host nav icon map.
 * `group` puts the eleven pages in one sidebar folder "Analytics".
 */
export const ADMIN_PAGES = [
	{ path: "/", label: "Overview", icon: "chart-line", group: "Analytics" },
	{ path: "/dashboards", label: "Dashboards", icon: "dashboard", group: "Analytics" },
	{ path: "/pages", label: "Pages", icon: "file", group: "Analytics" },
	{ path: "/satisfaction", label: "Search Satisfaction", icon: "star", group: "Analytics" },
	{ path: "/sources", label: "Sources", icon: "link", group: "Analytics" },
	{ path: "/audience", label: "Audience", icon: "users", group: "Analytics" },
	{ path: "/behavior", label: "Behavior", icon: "list", group: "Analytics" },
	{ path: "/revenue", label: "Revenue", icon: "coins", group: "Analytics" },
	{ path: "/links", label: "Links", icon: "tag", group: "Analytics" },
	{ path: "/annotations", label: "Annotations", icon: "calendar", group: "Analytics" },
	{ path: "/search", label: "Search", icon: "search", group: "Analytics" },
	{ path: "/config", label: "Definitions", icon: "book", group: "Analytics" },
	{ path: "/data", label: "Data", icon: "database", group: "Analytics" },
	{ path: "/settings", label: "Settings", icon: "settings", group: "Analytics" },
] as const;
/** Dashboard widgets; ids match the `widgets` map of the admin entry. */
export const ADMIN_WIDGETS = [{ id: "today", title: "Cookieless Analytics", size: "third" }] as const;

/**
 * Product labels where the host shows no plugin name. `displayName` and `description` are typed on
 * the descriptor and on `definePlugin` from EmDash 1.5.0; 1.4.0 ignores them (docs/design-notes.md).
 */
export const PLUGIN_LABELS = {
	displayName: PRODUCT_NAME,
	description:
		"Cookieless Analytics by Infinitnet is a self-hosted, cookieless web analytics plugin for EmDash CMS with real sessions, no cookies and a page script of about 2.7 KB gzipped.",
} as const;

/**
 * `options.sites`: remote satellites; `options.database`: the D1 or Hyperdrive binding of an own analytics database;
 * `options.databases`: site routing, each listed site's analytics tables in its own binding. `engine: "postgres"`
 * in either loads the runtime entry `/postgres`, the one that carries the node-postgres driver.
 * Validated here so a bad `astro.config` fails the build.
 */
export function cookielessAnalytics(options: PluginOptions = {}): PluginDescriptor<PluginOptions> {
	const { sites, database, databases } = parseOptions(options);
	return {
		id: PLUGIN_ID,
		...PLUGIN_LABELS,
		version: VERSION,
		format: "native",
		entrypoint: engineOf({ database, databases }) === "postgres" ? `${PACKAGE}/postgres` : PACKAGE,
		adminEntry: `${PACKAGE}/admin`,
		adminPages: [...ADMIN_PAGES],
		adminWidgets: [...ADMIN_WIDGETS],
		capabilities: [...CAPABILITIES],
		allowedHosts: allowedHostsFor(ALLOWED_HOSTS, sites),
		...(sites.length || database || databases ? { options: { ...(sites.length ? { sites } : {}), ...(database ? { database } : {}), ...(databases ? { databases } : {}) } } : {}),
		storage: Object.fromEntries(
			Object.entries(STORAGE).map(([name, c]) => [name, { indexes: c.indexes.flatMap((i) => (typeof i === "string" ? [i] : [])) }]),
		),
		settingsSchema,
	};
}

export default cookielessAnalytics;

const settings = cachedSettings(() => getPluginSettings(PLUGIN_ID));

let agentRules: { rules: UserAgentRule[]; at: number } | undefined;
async function loadAgentRules(ctx: RouteContext): Promise<UserAgentRule[]> {
	if (agentRules && Date.now() - agentRules.at < 60_000) return agentRules.rules;
	let rules: UserAgentRule[] = [];
	try {
		// Every rule up to the cap, page by page (a query returns at most 100), oldest first as the classifier applies them.
		let cursor: string | undefined;
		do {
			const res = await ctx.storage.agent_rules?.query({ limit: 100, ...(cursor ? { cursor } : {}) });
			rules.push(...(res?.items ?? []).map((i) => i.data as UserAgentRule));
			cursor = res?.hasMore ? res.cursor : undefined;
		} while (cursor && rules.length < MAX_USER_RULES);
	} catch {
		rules = agentRules?.rules ?? [];
	}
	agentRules = { rules, at: Date.now() };
	return rules;
}

const channelRules = new Map<string, { rules: ChannelRule[]; at: number }>();
/** User channel rules of one site merged with the built-ins minus the disabled ones; local site when none is given. */
async function loadChannelRules(ctx: { storage: PluginContext["storage"] }, site?: string): Promise<ChannelRule[]> {
	const siteId = site ?? (await settings()).siteId;
	const cached = channelRules.get(siteId);
	if (cached && Date.now() - cached.at < 60_000) return cached.rules;
	let rules = cached?.rules ?? buildChannelRules();
	try {
		const res = await ctx.storage.channel_rules?.query({ where: { site: siteId }, limit: 100 });
		const items = (res?.items ?? []).map((i) => i.data as Partial<ChannelRule> & { disables?: string; enabled?: boolean });
		const user = items.flatMap((r, n) => (r.channel && r.any && r.enabled !== false ? [{ id: `user-${n + 1}`, channel: r.channel, any: r.any, priority: r.priority ?? 0 }] : []));
		rules = buildChannelRules(user, items.flatMap((r) => (r.disables ? [r.disables] : [])));
	} catch {
		// Keep the last good rules.
	}
	channelRules.set(siteId, { rules, at: Date.now() });
	return rules;
}

/** Event of the host `cron` hook (`CronEvent` in `plugins/types.ts`, not exported from the package root). */
export interface CronEvent {
	name: string;
	data?: Record<string, unknown>;
	scheduledAt: string;
}

/** Cron jobs and their schedules. The host Cron Trigger cadence bounds how often they run. */
export const CRON_JOBS = {
	rollup: "*/30 * * * *",
	retention: "17 * * * *",
	salts: "5 0 * * *",
	search: "7 */1 * * *",
	// Minutes 25 and 55, so under a per-minute trigger it is never due with rollup, retention, salts or search.
	revenue: "25,55 * * * *",
	// Minutes 15, 35 and 45, so under a per-minute trigger it is never due with the other tasks.
	mail: "15,35,45 * * * *",
} as const;
/** Job names the `cron` hook handles: the schedules plus the one-shot Search continuation. */
export type CronJob = keyof typeof CRON_JOBS | (typeof CONTINUE_JOBS)[number] | typeof MOVE_CRON;
/** The `cron` hook timeout; the host default is 5000 ms (`plugins/define-plugin.ts`). */
export const CRON_TIMEOUT_MS = 55_000;

type CronCtx = Pick<PluginContext, "kv" | "storage" | "log" | "cron" | "http"> & Partial<Pick<PluginContext, "email" | "site">>;

/**
 * Tasks that spend a request budget. The host runs every due task of a tick in one invocation, one after another,
 * and the platform's queries per invocation (Workers Free: 50) are shared by all of them; so one invocation runs at
 * most one of these. With a per-minute trigger the schedules never make two of them due together; with a coarser one
 * (`*\/15`), a task that finds the invocation taken is owed a turn (`cron:owed`), and the next invocation's task
 * hands its turn to the task owed longest, in order. `salts` (KV only) always runs.
 */
export const HEAVY_JOBS: ReadonlySet<string> = new Set<CronJob>(["rollup", "retention", "revenue", "search", "mail", MOVE_CRON, ...CONTINUE_JOBS]);
export const KV_CRON_OWED = "cron:owed";
/** A heavy task that starts this soon after the last one ended runs in the same invocation (tasks of a tick follow each other at once; ticks are a minute apart). */
export const SAME_INVOCATION_MS = 5_000;
/** Turn state requests per heavy run: the owed read and, when it changed, its write. Taken from the run's budget. */
export const TURN_REQUESTS = 2;

/** `cron` hook body: one handler per job name; unknown names are logged and ignored. */
export function cronDispatcher(handlers: Record<CronJob, (ctx: CronCtx, event: CronEvent) => Promise<unknown>>) {
	return async (event: CronEvent, ctx: CronCtx): Promise<void> => {
		const h = Object.hasOwn(handlers, event.name) ? handlers[event.name as CronJob] : undefined;
		if (!h) {
			ctx.log.warn(`cookieless-analytics: unknown cron job ${event.name}`);
			return;
		}
		// The limit stops every further request of the invocation, the flag's own write included: it is kept in the isolate and written by the next run.
		if (pendingLimit) await ctx.kv.set(KV_PLATFORM_LIMIT, pendingLimit).then(() => (pendingLimit = undefined), () => {});
		let name = event.name as CronJob;
		if (HEAVY_JOBS.has(name)) {
			const now = Date.now();
			if (now - heavyEnd < SAME_INVOCATION_MS) {
				// The invocation already ran a heavy task: owe this one a turn (the state read by that task, written once).
				if (owed && !owed[name]) {
					owed[name] = now;
					await ctx.kv.set(KV_CRON_OWED, owed).catch(() => {});
				}
				return;
			}
			owed = (await ctx.kv.get<Record<string, number>>(KV_CRON_OWED).catch(() => null)) ?? {};
			const first = Object.entries(owed).filter(([k]) => Object.hasOwn(handlers, k)).sort((a, b) => a[1] - b[1])[0];
			if (first && first[0] !== name) {
				owed[name] ??= now;
				name = first[0] as CronJob;
			}
			const changed = name in owed;
			delete owed[name];
			if (changed) await ctx.kv.set(KV_CRON_OWED, owed).catch(() => {});
		}
		try {
			await (handlers[name] as typeof h)(ctx, name === event.name ? event : { ...event, name });
		} catch (err) {
			const kind = platformLimitKind(err);
			if (kind) {
				pendingLimit = { at: Date.now(), task: name, kind };
				await ctx.kv.set(KV_PLATFORM_LIMIT, pendingLimit).then(() => (pendingLimit = undefined), () => {});
			}
			throw err;
		} finally {
			if (HEAVY_JOBS.has(name)) heavyEnd = Date.now();
		}
	};
}
let pendingLimit: PlatformLimit | undefined;
let heavyEnd = 0;
let owed: Record<string, number> | undefined;
/** Forget the turn state of this isolate (tests). */
export function resetCronTurns(): void {
	heavyEnd = 0;
	owed = undefined;
}

/** Tools refused while a data move is active: they delete rows or close days. */
const MOVE_REFUSES: ReadonlySet<string> = new Set(["tools/delete-start", "tools/delete-all", "tools/purge-site", "tools/purge-search", "tools/purge", "tools/rollup-now", "tools/revenue-void", "sites/delete"]);

/** Create missing or changed schedule rows. `plugin:activate` runs only on first install, so admin routes also call this once per isolate. */
export async function ensureCron(ctx: Pick<PluginContext, "cron">): Promise<void> {
	if (!ctx.cron) return;
	const have = new Map((await ctx.cron.list()).map((t) => [t.name, t.schedule]));
	for (const [name, schedule] of Object.entries(CRON_JOBS)) if (have.get(name) !== schedule) await ctx.cron.schedule(name, { schedule });
}
let cronChecked: Promise<void> | undefined;
const ensureCronOnce = (ctx: Pick<PluginContext, "cron">) =>
	(cronChecked ??= ensureCron(ctx).catch(() => {
		cronChecked = undefined;
	}));

export function createPlugin(options: PluginOptions = {}) {
	const { sites: remoteSites, database, databases } = parseOptions(options);
	// The analytics tables: the host database, the own D1 database of `database`, or each site's of `databases`.
	const dbFor = setPluginFacts(factsDb(databases ?? database, async () => fromKysely(await getDb())));
	// The drop counters of this isolate go to each site's database when sites are routed.
	drops.route = dbFor.targets().length > 1 ? dbFor : undefined;
	const remote = createRemote(remoteSites);
	const remoteIds = remote.ids;
	const env: RouteEnv = {
		async deps(ctx: RouteCtx) {
			const s = await settings();
			const db = await dbFor(s.siteId);
			return {
				db,
				kv: ctx.kv,
				settings: s,
				// Each event goes to its site's database, behind that database's write guard.
				sink: routedSink(dbFor, s, ctx.kv as KvLike),
				agentRules: await loadAgentRules(ctx as RouteContext),
				channelRules: await loadChannelRules(ctx as RouteContext),
				ready: () => ensureHostSchema(dbFor, ctx.kv),
			};
		},
		channelRules: (ctx, site) => loadChannelRules(ctx as unknown as RouteContext, site),
		after: (fn) =>
			after(async () => {
				await pgOwnScope(fn);
			}),
	};

	const db = (site?: string) => dbFor(site);
	const now = () => Math.floor(Date.now() / 1000);
	const goalsOf = async (ctx: { storage: PluginContext["storage"] }, site?: string) => loadGoals(ctx.storage.goals as Coll | undefined, site ?? (await settings()).siteId);
	const dataQuery = dataQueryRoute({ db, settings, remote });
	const dataExport = dataExportRoute({ db, settings, remote });
	const privacy = privacyRoute({ db, settings });
	const preview = previewRoute({ db, settings });
	const tools = toolRoutes({
		db,
		settings,
		agentRules: (ctx) => loadAgentRules(ctx as unknown as RouteContext),
		channelRules: (ctx, site) => loadChannelRules(ctx as unknown as RouteContext, site),
		goals: (ctx, site) => goalsOf(ctx as unknown as RouteContext, site),
	});
	const config = configRoutes({
		settings,
		changed: (c) => {
			if (c === "agent_rules") {
				agentRules = undefined;
				resetStoredAgentRules();
			}
			if (c === "channel_rules") channelRules.clear();
		},
	});
	/** Host route: ensures the cron rows once per isolate, then calls the handler with the host context. */
	const wrap = <C>(r: { permission: "plugins:read" | "plugins:manage"; input?: z.ZodType; handler(ctx: C): Promise<unknown> }) => ({
		...r,
		handler: async (ctx: RouteContext) => {
			await ensureCronOnce(ctx);
			return r.handler(ctx as unknown as C);
		},
	});
	const mailOf = async (ctx: { storage: PluginContext["storage"]; kv: PluginContext["kv"]; site?: PluginContext["site"] }) =>
		mailDeps({ db, settings }, { input: null, storage: ctx.storage as DataCtx["storage"], kv: ctx.kv as KvLike }, await settings(), ctx.site?.url ?? "");
	const dashboards = dashboardRoutes({ settings, config, remoteIds, mail: (ctx) => mailOf(ctx as unknown as RouteContext) });
	const shares = shareRoutes({ settings, remoteIds });
	const shareView = shareViewRoute({ db, settings, after: env.after });
	const keys = keyRoutes({ settings });
	const searchEnv = { db, settings, settingsChanged: () => settings.clear() };
	const search = searchService(searchEnv);
	const agent = agentRoutes({
		db,
		settings,
		version: VERSION,
		limiter: createRateLimiter(),
		remoteIds,
		route: dbFor,
		search: { sync: (ctx, body) => search.sync(ctx as unknown as SearchCtx, body), backfill: (ctx, body) => search.backfill(ctx as unknown as SearchCtx, body) },
	});
	/** The data move's job while it is active: the tasks skip its destination, the delete tools refuse. */
	const moving = async (kv: unknown) => {
		const j = await (kv as KvLike).get<MoveJob>(KV_MOVE_JOB);
		return isMoving(j) ? j : null;
	};
	/** Where a data move reads and writes: the source is the EmDash database (null) or a binding of this Worker. */
	const moveDbs = {
		source: async (b: string | null) => (b === null ? fromKysely(await getDb()) : openBinding(b)),
		dest: (site?: string) => dbFor(site),
		destKv: (kv: KvLike, site?: string) => dbFor.kv(kv, site),
	};
	/** Cron sync tick; without outbound HTTP (no `network:request`) there is nothing to pull. */
	const searchTick = (continueAs: string) => async (ctx: CronCtx) => {
		if (!ctx.http) return;
		// shortcut: the whole tick waits while a move runs, not only the sites of its database; per site once moves of routed sites are common.
		if (await moving(ctx.kv)) return;
		await ensureHostSchema(dbFor, ctx.kv as KvLike);
		await runSearchTick({ ...(await search.syncCtx(ctx as unknown as SearchCtx)), log: ctx.log }, { continueAs });
	};
	/** A cron task once per database, each with its share of the profile's requests (one invocation's queries are capped together). */
	const perDatabase = async (ctx: CronCtx, s: Settings, task: (d: Db, kv: KvLike, requests: number) => Promise<unknown>) => {
		// A database a move is filling is skipped: no day is closed or deleted from half copied rows.
		const move = await moving(ctx.kv);
		return eachTarget(dbFor, ctx.kv as KvLike, async (d, kv, share, binding) => {
			if (move && move.dest === binding) return;
			await ensureSchemaOnce(d, ctx.kv as KvLike);
			await task(d, kv, share(PROFILES[s.capacityProfile].requests - TURN_REQUESTS - 1));
		}, ctx.log);
	};
	const cron = cronDispatcher({
		async rollup(ctx) {
			const s = await settings();
			await perDatabase(ctx, s, (d, kv, requests) => runRollup({ db: d, settings: s, goals: (site) => goalsOf(ctx, site) }, kv, now(), { requests }));
		},
		async retention(ctx) {
			const s = await settings();
			let used = 0;
			await perDatabase(ctx, s, async (d, kv, requests) => {
				used += (await runRetention(d, kv, s, now(), { requests })).requests;
			});
			// A filtered delete job of the Data page continues with the requests retention left.
			await runDeleteJob({ kv: ctx.kv as KvLike, db, settings: s, goals: (site) => goalsOf(ctx, site), now: now() }, PROFILES[s.capacityProfile].requests - TURN_REQUESTS - used);
		},
		async revenue(ctx) {
			const s = await settings();
			await perDatabase(ctx, s, async (d, kv, requests) => {
				const t = now();
				await runRevenue({ db: d, settings: s, goals: (site) => goalsOf(ctx, site) }, kv, t, await rawFromDay(kv, s, t), { requests });
			});
		},
		salts: async (ctx) => cleanSalts(ctx.kv as KvLike, await settings(), now()),
		async mail(ctx) {
			// No provider: nothing is sent and the schedules stay.
			if (!ctx.email || !ctx.storage.dashboards) return;
			await ensureHostSchema(dbFor, ctx.kv as KvLike);
			const res = await runMailTick({ ...(await mailOf(ctx)), kv: ctx.kv as KvLike, dashboards: ctx.storage.dashboards as MailTickCtx["dashboards"], email: ctx.email, now: now(), log: ctx.log });
			if (res.failed.length) ctx.log.warn(`cookieless-analytics: mail ${res.id} failed for ${res.failed.length} recipient(s)`);
		},
		async move(ctx) {
			const s = await settings();
			const e: MoveEnv = { kv: ctx.kv as KvLike, ...moveDbs, source: async (b) => (await moveDbs.source(b)) ?? missingDb(b ?? ""), profile: s.capacityProfile, settings: s, now: now(), cron: ctx.cron };
			await runMoveJob(e, PROFILES[s.capacityProfile].requests - TURN_REQUESTS);
		},
		search: searchTick(CONTINUE_JOBS[0]),
		"search-continue": searchTick(CONTINUE_JOBS[1]),
		"search-continue-next": searchTick(CONTINUE_JOBS[0]),
	});

	return scoped(definePlugin({
		id: PLUGIN_ID,
		// A spread, so the type check of EmDash 1.4.0 (no such fields) passes and 1.5.0 receives them.
		...PLUGIN_LABELS,
		version: VERSION,
		capabilities: [...CAPABILITIES],
		allowedHosts: allowedHostsFor(ALLOWED_HOSTS, remoteSites),
		storage: STORAGE,
		admin: { entry: `${PACKAGE}/admin`, settingsSchema, pages: [...ADMIN_PAGES], widgets: [...ADMIN_WIDGETS] },
		routes: {
			in: inRoute(env),
			session: sessionRoute(env),
			contract: contractRoute(env),
			[ROUTES.shareView]: { ...shareView, handler: (ctx: RouteContext) => shareView.handler(ctx as unknown as ShareViewCtx) },
			"data/query": wrap<DataCtx>(dataQuery),
			"data/export": wrap<DataCtx>(dataExport),
			"data/catalog": wrap<DataCtx>(dataCatalogRoute()),
			"privacy/receipt": wrap<ReceiptCtx>(privacy),
			"annotations/preview": wrap<PreviewCtx>(preview),
			"editor/traffic": wrap<EditorCtx>(editorRoutes({ db, settings })["editor/traffic"]),
			...Object.fromEntries(Object.entries(
				siteRoutes({
					settings,
					db,
					remoteIds,
					remoteSites: () => remoteSites.map((r) => ({ id: r.id, label: r.label, origin: r.origin, keyPresent: remote.keyPresent(r.id) })),
					remoteRows: (body, ctx, skip) => remoteSummaryRows(remote, ctx.http, body, skip),
				}),
			).map(([name, r]) => [name, wrap<SitesCtx>(MOVE_REFUSES.has(name) ? refuseWhileMoving(r) : r)])),
			...Object.fromEntries(Object.entries(config).map(([name, r]) => [name, wrap<ConfigCtx>(r)])),
			...Object.fromEntries(Object.entries(tools).map(([name, r]) => [name, wrap<ToolsCtx>(MOVE_REFUSES.has(name) ? refuseWhileMoving(r) : r)])),
			...Object.fromEntries(
				Object.entries(
					moveRoutes({ settings, ...moveDbs, destBinding: (site) => dbFor.binding(site) ?? dbFor.targets()[0]?.binding ?? null, targets: () => dbFor.targets().map((t) => t.binding) }),
				).map(([name, r]) => [name, wrap<MoveCtx>(r)]),
			),
			...Object.fromEntries(Object.entries(searchRoutes(searchEnv)).map(([name, r]) => [name, wrap<SearchCtx>(r)])),
			...Object.fromEntries(Object.entries(keys).map(([name, r]) => [name, wrap<KeysCtx>(r)])),
			...Object.fromEntries(Object.entries(settingsRoutes({ settings, settingsChanged: () => settings.clear() })).map(([name, r]) => [name, wrap<SettingsCtx>(r)])),
			...Object.fromEntries(Object.entries(dashboards).map(([name, r]) => [name, wrap<DashCtx>(r)])),
			...Object.fromEntries(Object.entries(shares).map(([name, r]) => [name, wrap<SharesCtx>(r)])),
			...Object.fromEntries(Object.entries(agent).map(([name, r]) => [name, { ...r, handler: (ctx: RouteContext) => r.handler(ctx as unknown as AgentCtx) }])),
		},
		// Off until an admin enables them for this plugin in the host's plugin settings.
		mcp: { tools: MCP_TOOLS },
		hooks: {
			"plugin:activate": async (_event, ctx) => {
				// Every database's tables; a missing binding is logged and does not keep the cron jobs from being scheduled.
				try {
					await eachTarget(dbFor, ctx.kv as KvLike, (d) => ensureSchema(d, ctx.kv as KvLike), ctx.log);
				} finally {
					await ensureCron(ctx);
				}
			},
			cron: {
				// Every tick also writes the drop counters this isolate holds.
				handler: async (event: CronEvent, ctx: CronCtx) => {
					try {
						await cron(event, ctx);
					} finally {
						if (drops.size) await db().then((d) => drops.flush(d)).catch(() => {});
					}
				},
				timeout: CRON_TIMEOUT_MS,
			},
			"page:fragments": async (_event, ctx) => pageFragments(await settings(), ctx.kv),
			"content:afterPublish": async (event, ctx) => annotate(ctx, "publish", event.content, event.collection, await settings()),
			"content:afterSave": async (event, ctx) => {
				if (!event.isNew && event.content.status === "published") await annotate(ctx, "update", event.content, event.collection, await settings());
			},
		},
	}));
}

/**
 * Every route and hook handler of `plugin` in one Postgres request scope: one client per binding, closed when the
 * handler ends; a nested scope (a route called by the middleware) reuses it. Without Postgres it costs one `run`.
 */
function scoped<P extends { routes: object; hooks: object }>(plugin: P): P {
	type Handled = { handler?: unknown };
	const each = (o: object) =>
		Object.fromEntries(
			Object.entries(o as Record<string, Handled>).map(([name, r]) => {
				const h = r?.handler;
				return [name, typeof h === "function" ? { ...r, handler: (...a: unknown[]) => pgScope(() => h(...a)) } : r];
			}),
		);
	return { ...plugin, routes: each(plugin.routes), hooks: each(plugin.hooks) };
}
