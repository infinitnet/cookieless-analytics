/**
 * Admin tool routes, all `plugins:manage`: agent tester, channel
 * reclassification, rollup now, purge now, delete all data, filtered delete, void revenue. The agent API has no delete route.
 */
import { PluginRouteError } from "emdash";
import { z } from "zod";
import { createClassifier } from "../agents/classify.js";
import type { UserAgentRule } from "../agents/rules.js";
import { type ChannelRule, classifyChannel } from "../core/channels.js";
import type { KvLike } from "../core/crypto.js";
import { dayInZone, daysBetween, eachDay } from "../core/time.js";
import { CLICK_IDS, UTM_KEYS, type Utm } from "../core/url.js";
import type { Db } from "../db/adapter.js";
import { eachDatabase, stateKv } from "../db/facts.js";
import { dayInt, isoDay, visitDayKey } from "../db/dialect.js";
import { entriesOf, entryCols, inList } from "../query/compile.js";
import type { Goal } from "../query/filters.js";
import { clearReportCache } from "../query/reports/index.js";
import { counted, dayStatements, KV_ROLLUP_CURSOR, KV_WATERMARK, lastClosedDay, rollupDay, type RollupRunCtx, runRollup, sitesOfDay } from "../query/rollup.js";
import { KV_CURSOR, rawFromDay, type RetentionCursor, runRetention, sitesInTables } from "../query/retention.js";
import { bindSite, SITE_ID_RE, SiteField, type SitesColl } from "../multisite/registry.js";
import { purgeKey, purgeSearch, purgeSite } from "../query/purge.js";
import { PROFILES, type Settings } from "../settings.js";
import { createJob, DELETE_DAY_ROWS, type DeleteLogEntry, DeleteSpecSchema, isActive, jobView, KV_DELETE_CANCEL, KV_DELETE_JOB, KV_DELETE_LOG, type DeleteJob, previewDelete, runDeleteJob } from "../query/filtered-delete.js";

export interface ToolsCtx {
	input: unknown;
	kv: KvLike;
	storage?: { sites?: Pick<SitesColl, "query"> };
	/** The signed-in admin (host `RouteContext.user`), named in the delete log. */
	user?: { email?: string } | undefined;
}

export interface ToolsEnv {
	/** The database of `site`'s analytics tables. */
	db(site?: string): Promise<Db>;
	settings(): Promise<Settings>;
	agentRules(ctx: ToolsCtx): Promise<readonly UserAgentRule[]>;
	/** Channel rules and goals of one site. */
	channelRules(ctx: ToolsCtx, site: string): Promise<readonly ChannelRule[]>;
	goals(ctx: ToolsCtx, site: string): Promise<readonly Goal[]>;
	/** Epoch seconds; defaults to the clock. */
	now?(): number;
}

export const TestAgentBody = z.object({ ua: z.string().max(2048) }).strict();
export const ReclassifyBody = z.object({ cursor: z.string().max(64).optional(), site: SiteField }).strict();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const RollupNowBody = z
	// `site`: that site only (in its own database); `after`: continue the first day after this site (`next` and `after` of the last answer).
	.object({ from: Day, to: Day, site: SiteField, after: z.string().regex(SITE_ID_RE).optional() })
	.strict()
	.refine((b) => b.from <= b.to && daysBetween(b.from, b.to) <= 31, { message: "from must not be after to, at most 31 days" })
	// The admin sends `{}` for a plain tick; the host validates the parsed JSON body, so `{}` must pass.
	.or(z.object({}).strict())
	.optional();
/** Requests `tools/rollup-now` with a range leaves to the host and its own reads (settings, raw window, watermark, goals). */
const ROLLUP_NOW_RESERVE = 10;
export const EmptyBody = z.object({}).strict().optional();
export const DeleteAllBody = z.object({ confirm: z.literal("DELETE"), site: SiteField }).strict();
export const PurgeSiteBody = z.object({ site: z.string().regex(SITE_ID_RE), confirm: z.literal("DELETE") }).strict();
export const PurgeSearchBody = z.object({ site: SiteField, source: z.enum(["google", "bing"]) }).strict();
/** `tools/revenue-void`: one day, one event name, values at or above `minValue`; `confirm` writes. */
export const RevenueVoidBody = z
	.object({ site: SiteField, day: Day, name: z.string().min(1).max(64), minValue: z.number().min(0).max(1_000_000_000), confirm: z.literal(true).optional() })
	.strict();

export const DeletePreviewBody = z.object({ site: SiteField, spec: DeleteSpecSchema }).strict();
/** `confirm`: the number of matching visits the preview showed, or DELETE. */
export const DeleteStartBody = z.object({ site: SiteField, spec: DeleteSpecSchema, confirm: z.string().min(1).max(32) }).strict();

/** Sessions read per reclassify batch; a call runs at most four batches. */
export const RECLASSIFY_BATCH = 500;
const RECLASSIFY_BATCHES = 4;

const manage = "plugins:manage" as const;


export function toolRoutes(env: ToolsEnv) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1000);
	const rollupCtx = async (ctx: ToolsCtx, db: Db): Promise<RollupRunCtx> => ({ db, settings: await env.settings(), goals: (site) => env.goals(ctx, site) });

	/**
	 * One bounded call of a per-site delete. A site id that is neither local nor registered
	 * is accepted here only when rows of it or a delete cursor are still stored (a deleted client site). Database-wide KV
	 * state (watermark, retention cursor, drop counters) is cleared once no site has rows left.
	 */
	async function deleteSite(ctx: ToolsCtx, requested: string | undefined) {
		const s = await env.settings();
		let site: string;
		try {
			site = (await bindSite(requested, s.siteId, ctx.storage?.sites)).id;
		} catch (err) {
			// A deleted client site: its rows, or an unfinished delete of them, may still be there.
			if (!requested || !((await sitesInTables(await env.db(requested))).includes(requested) || (await ctx.kv.get(purgeKey(requested))))) throw err;
			site = requested;
		}
		const db = await env.db(site);
		const r = await purgeSite(db, ctx.kv, site, { now: now() });
		if (r.done && !(await sitesInTables(db)).length) {
			for (const k of [KV_WATERMARK, KV_ROLLUP_CURSOR, KV_CURSOR]) await stateKv(ctx.kv, site).delete(k);
		}
		clearReportCache();
		return r;
	}

	/** The bound site and what the delete preview and job read from it. */
	const deleteEnv = async (ctx: ToolsCtx, requested: string | undefined) => {
		const settings = await env.settings();
		const site = (await bindSite(requested, settings.siteId, ctx.storage?.sites)).id;
		return { db: await env.db(site), kv: ctx.kv, settings, site, now: now() };
	};
	const jobEnv = async (ctx: ToolsCtx) => ({ kv: ctx.kv, db: (site: string) => env.db(site), settings: await env.settings(), goals: (site: string) => env.goals(ctx, site), now: now() });
	/** One job call with the profile's requests less `keep`: the preview of delete-start and the host's own queries share the invocation. */
	const runJob = async (ctx: ToolsCtx, keep: number) => {
		const je = await jobEnv(ctx);
		return runDeleteJob(je, PROFILES[je.settings.capacityProfile].requests - keep);
	};
	/** The job, the recent deletions and the job's daily rows on `small` (null: no daily cap). */
	const deleteState = async (ctx: ToolsCtx, job: DeleteJob | null) => ({
		job: jobView(job),
		log: (await ctx.kv.get<DeleteLogEntry[]>(KV_DELETE_LOG)) ?? [],
		dayRows: (await env.settings()).capacityProfile === "small" ? DELETE_DAY_ROWS : null,
	});

	return {
		/** Read-only preview of a filtered delete: matches per day, top values, summary days, revenue and the rows it writes. */
		"tools/delete-preview": {
			permission: manage,
			input: DeletePreviewBody,
			async handler(ctx: ToolsCtx) {
				const body = DeletePreviewBody.parse(ctx.input);
				return previewDelete(await deleteEnv(ctx, body.site), body.spec);
			},
		},
		/** Start a filtered delete job (one at a time) after the confirmation, and run its first call. */
		"tools/delete-start": {
			permission: manage,
			input: DeleteStartBody,
			async handler(ctx: ToolsCtx) {
				const body = DeleteStartBody.parse(ctx.input);
				if (isActive(await ctx.kv.get<DeleteJob>(KV_DELETE_JOB))) throw new PluginRouteError("delete_running", "A delete is still running. Wait for it or cancel it first.", 409);
				const e = await deleteEnv(ctx, body.site);
				const p = await previewDelete(e, body.spec);
				const visits = String(p.totals.visits);
				if (body.confirm !== "DELETE" && body.confirm !== visits)
					throw new PluginRouteError("confirm_required", `Type the number of matching visits (${visits}) or DELETE to confirm.`, 400);
				if (!p.totals.visits && !(body.spec.oldDays && p.old?.days.length)) throw new PluginRouteError("nothing_to_delete", "Nothing matches these conditions.", 400);
				await ctx.kv.delete(KV_DELETE_CANCEL);
				await ctx.kv.set(KV_DELETE_JOB, await createJob(e, body.spec, ctx.user?.email ?? null, p));
				return deleteState(ctx, await runJob(ctx, 20));
			},
		},
		/** One more bounded call of the running delete job (the page calls it while open; the `retention` cron task otherwise). */
		"tools/delete-run": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx: ToolsCtx) {
				return deleteState(ctx, await runJob(ctx, 8));
			},
		},
		/** Cancel the running job: no further visits are deleted; the days already touched get their summaries stored again. */
		"tools/delete-cancel": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx: ToolsCtx) {
				const job = await ctx.kv.get<DeleteJob>(KV_DELETE_JOB);
				if (!isActive(job)) return deleteState(ctx, job);
				await ctx.kv.set(KV_DELETE_CANCEL, job.id);
				return deleteState(ctx, await runJob(ctx, 8));
			},
		},
		/** The current or last job and the recent deletions, read only. */
		"tools/delete-status": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx: ToolsCtx) {
				return deleteState(ctx, await ctx.kv.get<DeleteJob>(KV_DELETE_JOB));
			},
		},
		/**
		 * Void spoofed revenue of orders without an id (orders with an id are corrected or voided through
		 * `agent/v1/events`): without `confirm` it counts the matching hits, with `confirm: true` it sets
		 * `val` and `cur` to NULL on them. Raw window only; the `revenue` task's reconcile restates the day.
		 */
		"tools/revenue-void": {
			permission: manage,
			input: RevenueVoidBody,
			async handler(ctx: ToolsCtx) {
				const body = RevenueVoidBody.parse(ctx.input);
				const s = await env.settings();
				const site = (await bindSite(body.site, s.siteId, ctx.storage?.sites)).id;
				const rawFrom = await rawFromDay(stateKv(ctx.kv, site), s, now());
				if (body.day < rawFrom || body.day > dayInZone(now(), s.siteTimezone))
					throw new PluginRouteError("outside_raw_window", `Revenue can be voided from ${rawFrom} to today only; older days keep their stored rollup.`, 400);
				const db = await env.db(site);
				const where = "site = ? AND day = ? AND name = ? AND val IS NOT NULL AND val >= ?";
				const params = [site, dayInt(body.day), body.name, body.minValue];
				if (!body.confirm) {
					const [r] = await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ca_events WHERE ${where}`, params);
					return { site, day: body.day, matched: Number(r?.n ?? 0), voided: 0 };
				}
				const r = await db.run(`UPDATE ca_events SET val = NULL, cur = NULL WHERE ${where}`, params);
				clearReportCache();
				return { site, day: body.day, matched: r.changes, voided: r.changes };
			},
		},
		"tools/test-agent": {
			permission: manage,
			input: TestAgentBody,
			async handler(ctx: ToolsCtx) {
				const { ua } = TestAgentBody.parse(ctx.input);
				const rules = await env.agentRules(ctx);
				const c = createClassifier(rules).classify(ua);
				const user = rules.find((r, i) => (r.id ?? `user-${i + 1}`) === c.botId);
				return { ...c, matched: c.audience === "robot" ? (user ? "user_rule" : "builtin") : "none", rule: user ?? null };
			},
		},

		"tools/reclassify-channels": {
			permission: manage,
			input: ReclassifyBody,
			async handler(ctx: ToolsCtx) {
				const body = ReclassifyBody.parse(ctx.input ?? {});
				const s = await env.settings();
				const site = (await bindSite(body.site, s.siteId, ctx.storage?.sites)).id;
				const db = await env.db(site);
				const rules = await env.channelRules(ctx, site);
				const from = await rawFromDay(stateKv(ctx.kv, site), s, now());
				// A click-id channel is kept when neither a click id nor a UTM tag was stored (not every click id is allowlisted).
				const clickChannels = new Set(rules.filter((r) => r.any.some((c) => c.click)).map((r) => r.channel));
				let cursor = body.cursor ?? "";
				const x = entryCols(db.dialect, "x");
				let scanned = 0;
				let updated = 0;
				let done = false;
				const changed = new Set<string>();
				for (let b = 0; b < RECLASSIFY_BATCHES && !done; b++) {
					const rows = await db.all(
						`SELECT s.sid AS sid, s.day AS day, s.channel AS channel, s.source AS source, s.ref_host AS ref_host, ${UTM_KEYS.map((k) => `s.${k} AS ${k}`).join(", ")},
(SELECT ${x.query} FROM ${entriesOf(db.dialect, "x")} WHERE ${x.pv} ORDER BY ${x.ts}, ${x.id} LIMIT 1) AS q
FROM ca_sessions s WHERE s.site = ? AND s.day >= ? AND s.sid > ? ORDER BY s.sid LIMIT ${RECLASSIFY_BATCH}`,
						[site, visitDayKey(from), cursor],
					);
					scanned += rows.length;
					// One UPDATE per distinct (channel, source) result keeps the statement count small.
					const groups = new Map<string, string[]>();
					for (const r of rows) {
						const utm: Utm = {};
						for (const k of UTM_KEYS) if (typeof r[k] === "string") utm[k] = r[k] as string;
						const params = new URLSearchParams(typeof r.q === "string" ? r.q : "");
						const clickIds = CLICK_IDS.filter((k) => params.has(k));
						const res = classifyChannel({ refHost: (r.ref_host as string | null) ?? null, utm, clickIds }, { rules });
						if (res.channel === r.channel && res.source === r.source) continue;
						if (!clickIds.length && !Object.keys(utm).length && clickChannels.has(String(r.channel))) continue;
						const k = JSON.stringify([res.channel, res.source]);
						groups.set(k, [...(groups.get(k) ?? []), String(r.sid)]);
						changed.add(isoDay(r.day));
					}
					for (const [k, sids] of groups) {
						const [channel, source] = JSON.parse(k) as [string, string];
						const w = inList(db.dialect, "sid", sids);
						updated += (await db.run(`UPDATE ca_sessions SET channel = ?, source = ? WHERE site = ? AND (${w.sql})`, [channel, source, site, ...w.params])).changes;
					}
					// Orders and refunds carry their visit's channel on their own day (after midnight, agent orders, refunds).
					const moved = [...groups.values()].flat();
					if (moved.length) {
						const w = inList(db.dialect, "sid", moved);
						for (const r of await db.all(`SELECT DISTINCT day FROM ca_events WHERE site = ? AND day >= ? AND val IS NOT NULL AND (${w.sql})`, [site, dayInt(from), ...w.params])) changed.add(isoDay(r.day));
					}
					if (rows.length) cursor = String(rows[rows.length - 1]?.sid);
					done = rows.length < RECLASSIFY_BATCH;
				}
				if (updated) clearReportCache();
				// Stored days whose visits changed keep the old channels in their summaries until stored again (`tools/rollup-now`).
				const wm = await stateKv(ctx.kv, site).get<string>(KV_WATERMARK);
				const stored = wm ? [...changed].filter((d) => d <= wm).sort() : [];
				return { site, scanned, updated, cursor: done ? null : cursor, done, stored };
			},
		},

		"tools/rollup-now": {
			permission: manage,
			input: RollupNowBody,
			async handler(ctx: ToolsCtx) {
				const body = RollupNowBody.parse(ctx.input ?? undefined);
				clearReportCache();
				const s = await env.settings();
				let spent = 0;
				const range = body && "from" in body ? body : null;
				// Days of the range, site by site, inside the profile's requests (less the host's share and this route's reads).
				// The first site-day always runs; a stop answers `next` (the day) and `after` (the last site done on it).
				const store = async (db: Db, kv: KvLike, r: NonNullable<typeof range>, only: string | null) => {
					const rc = await rollupCtx(ctx, db);
					// Raw rows before the raw window are gone; recomputing those days would wipe their rollup.
					const rawFrom = await rawFromDay(kv, s, now());
					if (r.from < rawFrom) throw new PluginRouteError("raw_gone", `Raw data starts on ${rawFrom}; earlier days keep their stored rollup.`, 400);
					let rows = 0;
					// Open days are never stored: they are computed when read.
					const all = eachDay(r.from, r.to).filter((d) => d <= lastClosedDay(now(), s.siteTimezone));
					const sites = new Set<string>();
					const cap = PROFILES[s.capacityProfile].requests - ROLLUP_NOW_RESERVE - spent;
					const c = counted(rc.db);
					let next: string | null = null;
					let after: string | null = null;
					let ran = false;
					walk: for (const d of all) {
						let last = d === r.from ? (r.after ?? "") : "";
						for (const site of (await sitesOfDay(c.db, d, last)).filter((x) => !only || x === only)) {
							const goals = await rc.goals(site);
							// The first site-day of the call runs even past the cap; a later database's only when it fits what is left.
							if ((ran || spent > 0) && c.n() + dayStatements(goals) > cap) {
								[next, after] = [d, last || null];
								break walk;
							}
							ran = true;
							sites.add(site);
							rows += await rollupDay({ db: c.db, site, settings: rc.settings, goals }, d);
							last = site;
						}
					}
					spent += c.n();
					const days = next ? all.filter((d) => d < (next as string)) : all;
					return { days, rows, sites: [...sites].sort(), next, after, watermark: await kv.get<string>(KV_WATERMARK) };
				};
				if (range?.site) {
					const site = (await bindSite(range.site, s.siteId, ctx.storage?.sites)).id;
					return store(await env.db(site), stateKv(ctx.kv, site), range, site);
				}
				// Every database of the analytics tables, each with its own watermark and cursors.
				return eachDatabase(env.db, ctx.kv, async (db, kv) => {
					if (range) return store(db, kv, range, null);
					// Each database may take what the earlier ones left of the profile's requests, never more.
					const t = await runRollup(await rollupCtx(ctx, db), kv, now(), { available: PROFILES[s.capacityProfile].requests - spent });
					spent += t.requests;
					return t;
				});
			},
		},

		"tools/purge": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx: ToolsCtx) {
				const s = await env.settings();
				clearReportCache();
				return eachDatabase(env.db, ctx.kv, async (db, kv) => {
					// Start a fresh cycle so changed settings apply now, not tomorrow.
					const prev = await kv.get<RetentionCursor>(KV_CURSOR);
					await kv.set(KV_CURSOR, { ...prev, day: "" });
					return runRetention(db, kv, s, now());
				});
			},
		},

		"tools/delete-all": {
			permission: manage,
			input: DeleteAllBody,
			async handler(ctx: ToolsCtx) {
				const body = DeleteAllBody.safeParse(ctx.input);
				if (!body.success) throw new PluginRouteError("confirm_required", 'Send { "confirm": "DELETE" }.', 400);
				return deleteSite(ctx, body.data.site);
			},
		},

		"tools/purge-site": {
			permission: manage,
			input: PurgeSiteBody,
			async handler(ctx: ToolsCtx) {
				const body = PurgeSiteBody.safeParse(ctx.input);
				if (!body.success) throw new PluginRouteError("confirm_required", 'Send { "site": "<id>", "confirm": "DELETE" }.', 400);
				return deleteSite(ctx, body.data.site);
			},
		},

		"tools/purge-search": {
			permission: manage,
			input: PurgeSearchBody,
			async handler(ctx: ToolsCtx) {
				const body = PurgeSearchBody.parse(ctx.input);
				const s = await env.settings();
				const site = (await bindSite(body.site, s.siteId, ctx.storage?.sites)).id;
				const r = await purgeSearch(await env.db(site), site, body.source);
				clearReportCache();
				return { site, source: body.source, ...r };
			},
		},
	};
}
