import { PLUGIN_ID, PRODUCT_NAME, ROUTES, VERSION } from "./contract.mjs";
import { Bt as missingDb, E as drops, It as eachTarget, Lt as ensureHostSchema, P as buildChannelRules, Q as cleanSalts, Qt as pgScope, Rt as factsDb, Ut as setPluginFacts, Zt as pgOwnScope, an as ensureSchema, ln as fromKysely, o as routedSink, on as ensureSchemaOnce, rt as runRetention, tt as rawFromDay } from "./queue-sink-BOtlgr5B.mjs";
import { Zt as PROFILES, f as runRevenue, p as runRollup, rn as cachedSettings, sn as settingsSchema } from "./rollup-DahnNaAs.mjs";
import { R as MAX_USER_RULES, s as resetStoredAgentRules } from "./middleware-core-DwvXAIlw.mjs";
import { A as MOVE_CRON, B as dataQueryRoute, C as annotate, D as agentRoutes, E as createRateLimiter, F as KV_PLATFORM_LIMIT, I as inRoute, L as platformLimitKind, M as openBinding, N as runMoveJob, O as runDeleteJob, P as privacyRoute, R as dataCatalogRoute, S as runSearchTick, T as pageFragments, V as loadGoals, _ as runMailTick, a as toolRoutes, b as previewRoute, c as settingsRoutes, d as sessionRoute, f as keyRoutes, g as mailDeps, h as dashboardRoutes, i as refuseWhileMoving, j as isMoving, k as KV_MOVE_JOB, l as shareRoutes, m as siteRoutes, n as remoteSummaryRows, o as searchRoutes, p as MCP_TOOLS, r as moveRoutes, s as searchService, t as createRemote, u as shareViewRoute, v as contractRoute, w as configRoutes, x as CONTINUE_JOBS, y as editorRoutes, z as dataExportRoute } from "./proxy-Dc0H5RXI.mjs";
import "./rollup-CrqIFQsa.mjs";
import { i as parseOptions, n as allowedHostsFor, r as engineOf } from "./config-D7Pvk1K6.mjs";
import { after, definePlugin, getPluginSettings } from "emdash";
import { getDb } from "emdash/runtime";

//#region src/index.ts
/** Plugin descriptor (for `emdash({ plugins: [...] })`) and the native runtime `createPlugin`. */
const PACKAGE = "@infinitnet/cookieless-analytics";
/** Capabilities: the head script via `page:fragments`, content reads for annotations, scheduled dashboard email through the host provider, schema reads for the collection report, outbound calls to the Search providers. */
const CAPABILITIES = [
	"hooks.page-fragments:register",
	"content:read",
	"email:send",
	"network:request",
	"schema:read"
];
/** Exact hosts `ctx.http` may reach for Search; never a wildcard. Remote satellites add their hostnames. */
const ALLOWED_HOSTS = [
	"oauth2.googleapis.com",
	"www.googleapis.com",
	"ssl.bing.com",
	"www.bing.com"
];
/** Config collections. Composite indexes are runtime-only; the descriptor carries flat ones. */
const STORAGE = {
	goals: { indexes: ["site", ["site", "active"]] },
	funnels: { indexes: ["site"] },
	segments: { indexes: ["site"] },
	channel_rules: { indexes: ["site", ["site", "priority"]] },
	agent_rules: { indexes: ["site", ["site", "priority"]] },
	annotations: { indexes: [
		"site",
		"ts",
		["site", "ts"]
	] },
	api_keys: { indexes: ["prefix"] },
	sites: { indexes: ["key"] },
	dashboards: { indexes: ["site", "emailNext"] },
	shares: { indexes: ["prefix", "site"] }
};
/**
* Admin pages; each path is a key of `pages` in `src/admin/index.tsx`. Icon names resolve in the host nav icon map.
* `group` puts the eleven pages in one sidebar folder "Analytics".
*/
const ADMIN_PAGES = [
	{
		path: "/",
		label: "Overview",
		icon: "chart-line",
		group: "Analytics"
	},
	{
		path: "/dashboards",
		label: "Dashboards",
		icon: "dashboard",
		group: "Analytics"
	},
	{
		path: "/pages",
		label: "Pages",
		icon: "file",
		group: "Analytics"
	},
	{
		path: "/satisfaction",
		label: "Search Satisfaction",
		icon: "star",
		group: "Analytics"
	},
	{
		path: "/sources",
		label: "Sources",
		icon: "link",
		group: "Analytics"
	},
	{
		path: "/audience",
		label: "Audience",
		icon: "users",
		group: "Analytics"
	},
	{
		path: "/behaviour",
		label: "Behaviour",
		icon: "list",
		group: "Analytics"
	},
	{
		path: "/revenue",
		label: "Revenue",
		icon: "coins",
		group: "Analytics"
	},
	{
		path: "/links",
		label: "Links",
		icon: "tag",
		group: "Analytics"
	},
	{
		path: "/annotations",
		label: "Annotations",
		icon: "calendar",
		group: "Analytics"
	},
	{
		path: "/search",
		label: "Search",
		icon: "search",
		group: "Analytics"
	},
	{
		path: "/config",
		label: "Definitions",
		icon: "book",
		group: "Analytics"
	},
	{
		path: "/data",
		label: "Data",
		icon: "database",
		group: "Analytics"
	},
	{
		path: "/settings",
		label: "Settings",
		icon: "settings",
		group: "Analytics"
	}
];
/** Dashboard widgets; ids match the `widgets` map of the admin entry. */
const ADMIN_WIDGETS = [{
	id: "today",
	title: "Cookieless Analytics",
	size: "third"
}];
/**
* Product labels where the host shows no plugin name. `displayName` and `description` are typed on
* the descriptor and on `definePlugin` from EmDash 1.5.0; 1.4.0 ignores them (docs/design-notes.md).
*/
const PLUGIN_LABELS = {
	displayName: PRODUCT_NAME,
	description: "Cookieless Analytics by Infinitnet is a self-hosted, cookieless web analytics plugin for EmDash CMS that stores real sessions in your own database with a page script of about 2.5 KB gzipped."
};
/**
* `options.sites`: remote satellites; `options.database`: the D1 or Hyperdrive binding of an own analytics database;
* `options.databases`: site routing, each listed site's analytics tables in its own binding. `engine: "postgres"`
* in either loads the runtime entry `/postgres`, the one that carries the node-postgres driver.
* Validated here so a bad `astro.config` fails the build.
*/
function cookielessAnalytics(options = {}) {
	const { sites, database, databases } = parseOptions(options);
	return {
		id: PLUGIN_ID,
		...PLUGIN_LABELS,
		version: VERSION,
		format: "native",
		entrypoint: engineOf({
			database,
			databases
		}) === "postgres" ? `${PACKAGE}/postgres` : PACKAGE,
		adminEntry: `${PACKAGE}/admin`,
		adminPages: [...ADMIN_PAGES],
		adminWidgets: [...ADMIN_WIDGETS],
		capabilities: [...CAPABILITIES],
		allowedHosts: allowedHostsFor(ALLOWED_HOSTS, sites),
		...sites.length || database || databases ? { options: {
			...sites.length ? { sites } : {},
			...database ? { database } : {},
			...databases ? { databases } : {}
		} } : {},
		storage: Object.fromEntries(Object.entries(STORAGE).map(([name, c]) => [name, { indexes: c.indexes.flatMap((i) => typeof i === "string" ? [i] : []) }])),
		settingsSchema
	};
}
const settings = cachedSettings(() => getPluginSettings(PLUGIN_ID));
let agentRules;
async function loadAgentRules(ctx) {
	if (agentRules && Date.now() - agentRules.at < 6e4) return agentRules.rules;
	let rules = [];
	try {
		let cursor;
		do {
			const res = await ctx.storage.agent_rules?.query({
				limit: 100,
				...cursor ? { cursor } : {}
			});
			rules.push(...(res?.items ?? []).map((i) => i.data));
			cursor = res?.hasMore ? res.cursor : void 0;
		} while (cursor && rules.length < MAX_USER_RULES);
	} catch {
		rules = agentRules?.rules ?? [];
	}
	agentRules = {
		rules,
		at: Date.now()
	};
	return rules;
}
const channelRules = /* @__PURE__ */ new Map();
/** User channel rules of one site merged with the built-ins minus the disabled ones; local site when none is given. */
async function loadChannelRules(ctx, site) {
	const siteId = site ?? (await settings()).siteId;
	const cached = channelRules.get(siteId);
	if (cached && Date.now() - cached.at < 6e4) return cached.rules;
	let rules = cached?.rules ?? buildChannelRules();
	try {
		const items = ((await ctx.storage.channel_rules?.query({
			where: { site: siteId },
			limit: 100
		}))?.items ?? []).map((i) => i.data);
		rules = buildChannelRules(items.flatMap((r, n) => r.channel && r.any && r.enabled !== false ? [{
			id: `user-${n + 1}`,
			channel: r.channel,
			any: r.any,
			priority: r.priority ?? 0
		}] : []), items.flatMap((r) => r.disables ? [r.disables] : []));
	} catch {}
	channelRules.set(siteId, {
		rules,
		at: Date.now()
	});
	return rules;
}
/** Cron jobs and their schedules. The host Cron Trigger cadence bounds how often they run. */
const CRON_JOBS = {
	rollup: "*/30 * * * *",
	retention: "17 * * * *",
	salts: "5 0 * * *",
	search: "7 */1 * * *",
	revenue: "25,55 * * * *",
	mail: "15,35,45 * * * *"
};
/** The `cron` hook timeout; the host default is 5000 ms (`plugins/define-plugin.ts`). */
const CRON_TIMEOUT_MS = 55e3;
/**
* Tasks that spend a request budget. The host runs every due task of a tick in one invocation, one after another,
* and the platform's queries per invocation (Workers Free: 50) are shared by all of them; so one invocation runs at
* most one of these. With a per-minute trigger the schedules never make two of them due together; with a coarser one
* (`*\/15`), a task that finds the invocation taken is owed a turn (`cron:owed`), and the next invocation's task
* hands its turn to the task owed longest, in order. `salts` (KV only) always runs.
*/
const HEAVY_JOBS = new Set([
	"rollup",
	"retention",
	"revenue",
	"search",
	"mail",
	MOVE_CRON,
	...CONTINUE_JOBS
]);
const KV_CRON_OWED = "cron:owed";
/** A heavy task that starts this soon after the last one ended runs in the same invocation (tasks of a tick follow each other at once; ticks are a minute apart). */
const SAME_INVOCATION_MS = 5e3;
/** Turn state requests per heavy run: the owed read and, when it changed, its write. Taken from the run's budget. */
const TURN_REQUESTS = 2;
/** `cron` hook body: one handler per job name; unknown names are logged and ignored. */
function cronDispatcher(handlers) {
	return async (event, ctx) => {
		if (!(Object.hasOwn(handlers, event.name) ? handlers[event.name] : void 0)) {
			ctx.log.warn(`cookieless-analytics: unknown cron job ${event.name}`);
			return;
		}
		if (pendingLimit) await ctx.kv.set(KV_PLATFORM_LIMIT, pendingLimit).then(() => pendingLimit = void 0, () => {});
		let name = event.name;
		if (HEAVY_JOBS.has(name)) {
			const now = Date.now();
			if (now - heavyEnd < SAME_INVOCATION_MS) {
				if (owed && !owed[name]) {
					owed[name] = now;
					await ctx.kv.set(KV_CRON_OWED, owed).catch(() => {});
				}
				return;
			}
			owed = await ctx.kv.get(KV_CRON_OWED).catch(() => null) ?? {};
			const first = Object.entries(owed).filter(([k]) => Object.hasOwn(handlers, k)).sort((a, b) => a[1] - b[1])[0];
			if (first && first[0] !== name) {
				owed[name] ??= now;
				name = first[0];
			}
			const changed = name in owed;
			delete owed[name];
			if (changed) await ctx.kv.set(KV_CRON_OWED, owed).catch(() => {});
		}
		try {
			await handlers[name](ctx, name === event.name ? event : {
				...event,
				name
			});
		} catch (err) {
			const kind = platformLimitKind(err);
			if (kind) {
				pendingLimit = {
					at: Date.now(),
					task: name,
					kind
				};
				await ctx.kv.set(KV_PLATFORM_LIMIT, pendingLimit).then(() => pendingLimit = void 0, () => {});
			}
			throw err;
		} finally {
			if (HEAVY_JOBS.has(name)) heavyEnd = Date.now();
		}
	};
}
let pendingLimit;
let heavyEnd = 0;
let owed;
/** Forget the turn state of this isolate (tests). */
function resetCronTurns() {
	heavyEnd = 0;
	owed = void 0;
}
/** Tools refused while a data move is active: they delete rows or close days. */
const MOVE_REFUSES = new Set([
	"tools/delete-start",
	"tools/delete-all",
	"tools/purge-site",
	"tools/purge-search",
	"tools/purge",
	"tools/rollup-now",
	"tools/revenue-void",
	"sites/delete"
]);
/** Create missing or changed schedule rows. `plugin:activate` runs only on first install, so admin routes also call this once per isolate. */
async function ensureCron(ctx) {
	if (!ctx.cron) return;
	const have = new Map((await ctx.cron.list()).map((t) => [t.name, t.schedule]));
	for (const [name, schedule] of Object.entries(CRON_JOBS)) if (have.get(name) !== schedule) await ctx.cron.schedule(name, { schedule });
}
let cronChecked;
const ensureCronOnce = (ctx) => cronChecked ??= ensureCron(ctx).catch(() => {
	cronChecked = void 0;
});
function createPlugin(options = {}) {
	const { sites: remoteSites, database, databases } = parseOptions(options);
	const dbFor = setPluginFacts(factsDb(databases ?? database, async () => fromKysely(await getDb())));
	drops.route = dbFor.targets().length > 1 ? dbFor : void 0;
	const remote = createRemote(remoteSites);
	const remoteIds = remote.ids;
	const env = {
		async deps(ctx) {
			const s = await settings();
			return {
				db: await dbFor(s.siteId),
				kv: ctx.kv,
				settings: s,
				sink: routedSink(dbFor, s, ctx.kv),
				agentRules: await loadAgentRules(ctx),
				channelRules: await loadChannelRules(ctx),
				ready: () => ensureHostSchema(dbFor, ctx.kv)
			};
		},
		channelRules: (ctx, site) => loadChannelRules(ctx, site),
		after: (fn) => after(async () => {
			await pgOwnScope(fn);
		})
	};
	const db = (site) => dbFor(site);
	const now = () => Math.floor(Date.now() / 1e3);
	const goalsOf = async (ctx, site) => loadGoals(ctx.storage.goals, site ?? (await settings()).siteId);
	const dataQuery = dataQueryRoute({
		db,
		settings,
		remote
	});
	const dataExport = dataExportRoute({
		db,
		settings,
		remote
	});
	const privacy = privacyRoute({
		db,
		settings
	});
	const preview = previewRoute({
		db,
		settings
	});
	const tools = toolRoutes({
		db,
		settings,
		agentRules: (ctx) => loadAgentRules(ctx),
		channelRules: (ctx, site) => loadChannelRules(ctx, site),
		goals: (ctx, site) => goalsOf(ctx, site)
	});
	const config = configRoutes({
		settings,
		changed: (c) => {
			if (c === "agent_rules") {
				agentRules = void 0;
				resetStoredAgentRules();
			}
			if (c === "channel_rules") channelRules.clear();
		}
	});
	/** Host route: ensures the cron rows once per isolate, then calls the handler with the host context. */
	const wrap = (r) => ({
		...r,
		handler: async (ctx) => {
			await ensureCronOnce(ctx);
			return r.handler(ctx);
		}
	});
	const mailOf = async (ctx) => mailDeps({
		db,
		settings
	}, {
		input: null,
		storage: ctx.storage,
		kv: ctx.kv
	}, await settings(), ctx.site?.url ?? "");
	const dashboards = dashboardRoutes({
		settings,
		config,
		remoteIds,
		mail: (ctx) => mailOf(ctx)
	});
	const shares = shareRoutes({
		settings,
		remoteIds
	});
	const shareView = shareViewRoute({
		db,
		settings,
		after: env.after
	});
	const keys = keyRoutes({ settings });
	const searchEnv = {
		db,
		settings,
		settingsChanged: () => settings.clear()
	};
	const search = searchService(searchEnv);
	const agent = agentRoutes({
		db,
		settings,
		version: VERSION,
		limiter: createRateLimiter(),
		remoteIds,
		route: dbFor,
		search: {
			sync: (ctx, body) => search.sync(ctx, body),
			backfill: (ctx, body) => search.backfill(ctx, body)
		}
	});
	/** The data move's job while it is active: the tasks skip its destination, the delete tools refuse. */
	const moving = async (kv) => {
		const j = await kv.get(KV_MOVE_JOB);
		return isMoving(j) ? j : null;
	};
	/** Where a data move reads and writes: the source is the EmDash database (null) or a binding of this Worker. */
	const moveDbs = {
		source: async (b) => b === null ? fromKysely(await getDb()) : openBinding(b),
		dest: (site) => dbFor(site),
		destKv: (kv, site) => dbFor.kv(kv, site)
	};
	/** Cron sync tick; without outbound HTTP (no `network:request`) there is nothing to pull. */
	const searchTick = (continueAs) => async (ctx) => {
		if (!ctx.http) return;
		if (await moving(ctx.kv)) return;
		await ensureHostSchema(dbFor, ctx.kv);
		await runSearchTick({
			...await search.syncCtx(ctx),
			log: ctx.log
		}, { continueAs });
	};
	/** A cron task once per database, each with its share of the profile's requests (one invocation's queries are capped together). */
	const perDatabase = async (ctx, s, task) => {
		const move = await moving(ctx.kv);
		return eachTarget(dbFor, ctx.kv, async (d, kv, share, binding) => {
			if (move && move.dest === binding) return;
			await ensureSchemaOnce(d, ctx.kv);
			await task(d, kv, share(PROFILES[s.capacityProfile].requests - TURN_REQUESTS - 1));
		}, ctx.log);
	};
	const cron = cronDispatcher({
		async rollup(ctx) {
			const s = await settings();
			await perDatabase(ctx, s, (d, kv, requests) => runRollup({
				db: d,
				settings: s,
				goals: (site) => goalsOf(ctx, site)
			}, kv, now(), { requests }));
		},
		async retention(ctx) {
			const s = await settings();
			let used = 0;
			await perDatabase(ctx, s, async (d, kv, requests) => {
				used += (await runRetention(d, kv, s, now(), { requests })).requests;
			});
			await runDeleteJob({
				kv: ctx.kv,
				db,
				settings: s,
				goals: (site) => goalsOf(ctx, site),
				now: now()
			}, PROFILES[s.capacityProfile].requests - TURN_REQUESTS - used);
		},
		async revenue(ctx) {
			const s = await settings();
			await perDatabase(ctx, s, async (d, kv, requests) => {
				const t = now();
				await runRevenue({
					db: d,
					settings: s,
					goals: (site) => goalsOf(ctx, site)
				}, kv, t, await rawFromDay(kv, s, t), { requests });
			});
		},
		salts: async (ctx) => cleanSalts(ctx.kv, await settings(), now()),
		async mail(ctx) {
			if (!ctx.email || !ctx.storage.dashboards) return;
			await ensureHostSchema(dbFor, ctx.kv);
			const res = await runMailTick({
				...await mailOf(ctx),
				kv: ctx.kv,
				dashboards: ctx.storage.dashboards,
				email: ctx.email,
				now: now(),
				log: ctx.log
			});
			if (res.failed.length) ctx.log.warn(`cookieless-analytics: mail ${res.id} failed for ${res.failed.length} recipient(s)`);
		},
		async move(ctx) {
			const s = await settings();
			await runMoveJob({
				kv: ctx.kv,
				...moveDbs,
				source: async (b) => await moveDbs.source(b) ?? missingDb(b ?? ""),
				profile: s.capacityProfile,
				settings: s,
				now: now(),
				cron: ctx.cron
			}, PROFILES[s.capacityProfile].requests - TURN_REQUESTS);
		},
		search: searchTick(CONTINUE_JOBS[0]),
		"search-continue": searchTick(CONTINUE_JOBS[1]),
		"search-continue-next": searchTick(CONTINUE_JOBS[0])
	});
	return scoped(definePlugin({
		id: PLUGIN_ID,
		...PLUGIN_LABELS,
		version: VERSION,
		capabilities: [...CAPABILITIES],
		allowedHosts: allowedHostsFor(ALLOWED_HOSTS, remoteSites),
		storage: STORAGE,
		admin: {
			entry: `${PACKAGE}/admin`,
			settingsSchema,
			pages: [...ADMIN_PAGES],
			widgets: [...ADMIN_WIDGETS]
		},
		routes: {
			in: inRoute(env),
			session: sessionRoute(env),
			contract: contractRoute(env),
			[ROUTES.shareView]: {
				...shareView,
				handler: (ctx) => shareView.handler(ctx)
			},
			"data/query": wrap(dataQuery),
			"data/export": wrap(dataExport),
			"data/catalog": wrap(dataCatalogRoute()),
			"privacy/receipt": wrap(privacy),
			"annotations/preview": wrap(preview),
			"editor/traffic": wrap(editorRoutes({
				db,
				settings
			})["editor/traffic"]),
			...Object.fromEntries(Object.entries(siteRoutes({
				settings,
				db,
				remoteIds,
				remoteSites: () => remoteSites.map((r) => ({
					id: r.id,
					label: r.label,
					origin: r.origin,
					keyPresent: remote.keyPresent(r.id)
				})),
				remoteRows: (body, ctx, skip) => remoteSummaryRows(remote, ctx.http, body, skip)
			})).map(([name, r]) => [name, wrap(MOVE_REFUSES.has(name) ? refuseWhileMoving(r) : r)])),
			...Object.fromEntries(Object.entries(config).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(tools).map(([name, r]) => [name, wrap(MOVE_REFUSES.has(name) ? refuseWhileMoving(r) : r)])),
			...Object.fromEntries(Object.entries(moveRoutes({
				settings,
				...moveDbs,
				destBinding: (site) => dbFor.binding(site) ?? dbFor.targets()[0]?.binding ?? null,
				targets: () => dbFor.targets().map((t) => t.binding)
			})).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(searchRoutes(searchEnv)).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(keys).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(settingsRoutes({
				settings,
				settingsChanged: () => settings.clear()
			})).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(dashboards).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(shares).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(agent).map(([name, r]) => [name, {
				...r,
				handler: (ctx) => r.handler(ctx)
			}]))
		},
		mcp: { tools: MCP_TOOLS },
		hooks: {
			"plugin:activate": async (_event, ctx) => {
				try {
					await eachTarget(dbFor, ctx.kv, (d) => ensureSchema(d, ctx.kv), ctx.log);
				} finally {
					await ensureCron(ctx);
				}
			},
			cron: {
				handler: async (event, ctx) => {
					try {
						await cron(event, ctx);
					} finally {
						if (drops.size) await db().then((d) => drops.flush(d)).catch(() => {});
					}
				},
				timeout: CRON_TIMEOUT_MS
			},
			"page:fragments": async (_event, ctx) => pageFragments(await settings(), ctx.kv),
			"content:afterPublish": async (event, ctx) => annotate(ctx, "publish", event.content, event.collection, await settings()),
			"content:afterSave": async (event, ctx) => {
				if (!event.isNew && event.content.status === "published") await annotate(ctx, "update", event.content, event.collection, await settings());
			}
		}
	}));
}
/**
* Every route and hook handler of `plugin` in one Postgres request scope: one client per binding, closed when the
* handler ends; a nested scope (a route called by the middleware) reuses it. Without Postgres it costs one `run`.
*/
function scoped(plugin) {
	const each = (o) => Object.fromEntries(Object.entries(o).map(([name, r]) => {
		const h = r?.handler;
		return [name, typeof h === "function" ? {
			...r,
			handler: (...a) => pgScope(() => h(...a))
		} : r];
	}));
	return {
		...plugin,
		routes: each(plugin.routes),
		hooks: each(plugin.hooks)
	};
}

//#endregion
export { ADMIN_PAGES, ADMIN_WIDGETS, ALLOWED_HOSTS, CAPABILITIES, CRON_JOBS, CRON_TIMEOUT_MS, HEAVY_JOBS, KV_CRON_OWED, PLUGIN_ID, PLUGIN_LABELS, SAME_INVOCATION_MS, STORAGE, TURN_REQUESTS, VERSION, cookielessAnalytics, cookielessAnalytics as default, createPlugin, cronDispatcher, ensureCron, resetCronTurns };