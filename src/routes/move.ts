/**
 * Data move routes, all `plugins:manage` like the delete tools: status, start, run (the page polls it while open),
 * pause, cancel, verify and drop-old-tables. The source is the EmDash database or a binding the admin types; the
 * destination is always the database the site writes to now (the plugin option, set before by a deploy).
 */
import { PluginRouteError } from "emdash";
import { z } from "zod";
import type { KvLike } from "../core/crypto.js";
import type { Db } from "../db/adapter.js";
import { SCHEMA_VERSION_KEY } from "../db/schema.js";
import { BINDING_RE } from "../multisite/config.js";
import { bindSite, SiteField, type SitesColl } from "../multisite/registry.js";
import { isActive as deleteActive, KV_DELETE_JOB, type DeleteJob } from "../query/filtered-delete.js";
import { PROFILES, type Settings } from "../settings.js";
import { dropTables, isMoving, KV_MOVE_JOB, KV_MOVE_STOP, MOVE_CRON, MOVE_ORDER, MOVE_SCHEDULE, type MoveEnv, type MoveJob, moveView, newMoveJob, resumeCancelled, runMoveJob, sourceState, sourceTotals, verifyFrom, verifyTable } from "../move/job.js";

export interface MoveCtx {
	input: unknown;
	kv: KvLike;
	storage?: { sites?: Pick<SitesColl, "query"> };
	user?: { email?: string } | undefined;
	cron?: MoveEnv["cron"];
}

export interface MoveRoutesEnv {
	settings(): Promise<Settings>;
	/** The source: null is the EmDash database; a binding that is not D1 or Hyperdrive gives null. */
	source(binding: string | null): Promise<Db | null>;
	dest(site?: string): Promise<Db>;
	destKv(kv: KvLike, site?: string): KvLike;
	/** Binding of the database `site` writes to (null: the EmDash database). */
	destBinding(site?: string): string | null;
	/** Bindings every site writes to now (null: the EmDash database). */
	targets(): Array<string | null>;
	now?(): number;
}

export const EmptyBody = z.object({}).strict().optional();
export const MoveStartBody = z.object({ source: z.string().regex(BINDING_RE).nullable().default(null), site: SiteField }).strict();
export const MovePauseBody = z.object({ resume: z.boolean().optional() }).strict().optional();
export const MoveDropBody = z.object({ confirm: z.literal("DELETE") }).strict();

const manage = "plugins:manage" as const;
const name = (b: string | null) => b ?? "the EmDash database";
const MOVING = "Data is being moved between databases. Wait for the move to finish or cancel it first.";

/**
 * Whether `a` and `b` reach one database (two bindings of one D1 database, or the EmDash database by its binding
 * name): a uniquely named marker table is created through `a`, looked up through `b`, and dropped.
 */
export async function sameDatabase(a: Db, b: Db): Promise<boolean> {
	if (a.dialect !== b.dialect) return false;
	const t = `ca_same_${crypto.randomUUID().replace(/-/g, "")}`;
	await a.run(`CREATE TABLE ${t} (x INTEGER)`);
	try {
		const sql = a.dialect === "postgres" ? "SELECT 1 AS x FROM pg_catalog.pg_class WHERE relname = ?" : "SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?";
		return (await b.all(sql, [t])).length > 0;
	} finally {
		await a.run(`DROP TABLE IF EXISTS ${t}`);
	}
}

/** `route` refused while a move is active (the delete tools: no day may be closed or deleted from half copied rows). */
export function refuseWhileMoving<C extends { kv: KvLike }, R extends { handler(ctx: C): Promise<unknown> }>(route: R): R {
	return {
		...route,
		async handler(ctx: C) {
			if (isMoving(await ctx.kv.get<MoveJob>(KV_MOVE_JOB))) throw new PluginRouteError("move_running", MOVING, 409);
			return route.handler(ctx);
		},
	};
}

export function moveRoutes(env: MoveRoutesEnv) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1000);
	const jobEnv = async (ctx: MoveCtx): Promise<MoveEnv> => ({
		kv: ctx.kv,
		source: async (b) => {
			const db = await env.source(b);
			if (!db) throw new PluginRouteError("source_missing", `The binding ${name(b)} is not a D1 or Hyperdrive binding of this Worker.`, 400);
			return db;
		},
		dest: env.dest,
		destKv: env.destKv,
		...(await env.settings().then((s) => ({ profile: s.capacityProfile, settings: s }))),
		now: now(),
		cron: ctx.cron,
	});
	const state = (job: MoveJob | null) => ({ job: moveView(job), dest: env.destBinding(job?.site) });
	/** One call with the profile's requests less `keep` (the route's own reads and the host's). */
	const run = async (ctx: MoveCtx, keep: number) => {
		const e = await jobEnv(ctx);
		return runMoveJob(e, PROFILES[e.profile].requests - keep);
	};
	const current = (ctx: MoveCtx) => ctx.kv.get<MoveJob>(KV_MOVE_JOB);
	/** Whether `src` is one of the databases of `targets` under another name (names alone do not tell). */
	const writtenTo = async (src: Db, targets: Array<string | null>) => {
		for (const t of targets) {
			const d = await env.source(t);
			if (d && (await sameDatabase(d, src))) return true;
		}
		return false;
	};
	/** Apply a stop key now when no call runs; a call in flight applies it at its end. Never rewrites the position. */
	const stop = async (ctx: MoveCtx, job: MoveJob, status: "paused" | "cancelled") => {
		await ctx.kv.set(KV_MOVE_STOP, { id: job.id, status });
		return runMoveJob(await jobEnv(ctx), 0);
	};
	return {
		/** The current or last move and the destination of the default site. */
		"move/status": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx: MoveCtx) {
				return state(await current(ctx));
			},
		},
		/** Start a move from `source` into the database of `site` (or the default one), then its first call. */
		"move/start": {
			permission: manage,
			input: MoveStartBody,
			async handler(ctx: MoveCtx) {
				const body = MoveStartBody.parse(ctx.input ?? {});
				if (isMoving(await current(ctx))) throw new PluginRouteError("move_running", "A move is already running. Wait for it or cancel it first.", 409);
				if (deleteActive(await ctx.kv.get<DeleteJob>(KV_DELETE_JOB))) throw new PluginRouteError("delete_running", "A delete is still running. Wait for it or cancel it first.", 409);
				const s = await env.settings();
				const site = body.site === undefined ? undefined : (await bindSite(body.site, s.siteId, ctx.storage?.sites)).id;
				const dest = env.destBinding(site);
				if (body.source === dest) throw new PluginRouteError("same_database", `The site already writes to ${name(dest)}. Change the plugin option to the new database and deploy first.`, 400);
				// A source some site still writes to is not frozen: only the moved site's rows may be read from it.
				if (env.targets().includes(body.source) && site === undefined)
					throw new PluginRouteError("source_in_use", `Sites still write to ${name(body.source)}. Choose the site to move.`, 400);
				const src = await env.source(body.source);
				if (!src) throw new PluginRouteError("source_missing", `The binding ${name(body.source)} is not a D1 or Hyperdrive binding of this Worker.`, 400);
				if (await sameDatabase(await env.dest(site), src))
					throw new PluginRouteError("same_database", `${name(body.source)} is the database the site already writes to, under another name. Change the plugin option to the new database and deploy first.`, 400);
				if (site === undefined && (await writtenTo(src, env.targets().filter((t) => t !== dest))))
					throw new PluginRouteError("source_in_use", `Sites still write to ${name(body.source)}. Choose the site to move.`, 400);
				// A cancelled move of the same source, destination and site continues from its position.
				const resumed = await resumeCancelled(ctx.kv, { source: body.source, dest, site });
				if (!resumed)
					await ctx.kv.set(KV_MOVE_JOB, newMoveJob({ source: body.source, dest, site, by: ctx.user?.email ?? null, now: now(), total: await sourceTotals(src, site), state: await sourceState(ctx.kv, body.source) }));
				await ctx.cron?.schedule(MOVE_CRON, { schedule: MOVE_SCHEDULE });
				// The route's own reads, the identity checks and the resume take about 30 of `small`'s 40: there the first move/run copies.
				return state(await run(ctx, 30));
			},
		},
		/** One more bounded call (the page calls it while open; the `move` cron task otherwise). */
		"move/run": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx: MoveCtx) {
				return state(await run(ctx, 8));
			},
		},
		/** Pause the running move (the tasks keep skipping its database), or resume it with `resume: true`. */
		"move/pause": {
			permission: manage,
			input: MovePauseBody,
			async handler(ctx: MoveCtx) {
				const body = MovePauseBody.parse(ctx.input ?? undefined);
				const job = await current(ctx);
				if (!isMoving(job)) return state(job);
				if (body?.resume) {
					// Also withdraws a pause no call has applied yet. A paused job has no call in flight, so it is written.
					await ctx.kv.delete(KV_MOVE_STOP);
					if (job.status === "paused") await ctx.kv.set(KV_MOVE_JOB, { ...job, status: "running", error: null });
					await ctx.cron?.schedule(MOVE_CRON, { schedule: MOVE_SCHEDULE });
					return state(await current(ctx));
				}
				const pending = await ctx.kv.get<{ id: string; status: string }>(KV_MOVE_STOP);
				// A cancel not applied yet stays a cancel.
				if (job.status === "paused" || (pending?.id === job.id && pending.status === "cancelled")) return state(job);
				return state(await stop(ctx, job, "paused"));
			},
		},
		/**
		 * Stop the move. Rows already copied stay. Starting again with the same source and site continues this job from
		 * its position; the counters of a pair already loaded are not added again (the ledger of `job.ts`).
		 */
		"move/cancel": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx: MoveCtx) {
				const job = await current(ctx);
				if (!isMoving(job)) return state(job);
				if (job.status === "running") return state(await stop(ctx, job, "cancelled"));
				// Paused: no call runs it, so the status is written from a fresh read.
				await ctx.kv.set(KV_MOVE_STOP, { id: job.id, status: "cancelled" });
				const j: MoveJob = { ...job, status: "cancelled", finished: now() };
				await ctx.kv.set(KV_MOVE_JOB, j);
				await ctx.cron?.cancel(MOVE_CRON).catch(() => {});
				return state(j);
			},
		},
		/** Compare both sides again per table, site and day (after the rollup restored the summaries, say). */
		"move/verify": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx: MoveCtx) {
				const job = await current(ctx);
				if (!job || job.status !== "done") throw new PluginRouteError("not_done", "Only a finished move can be checked.", 400);
				if (job.dropped) throw new PluginRouteError("source_dropped", "The old tables were deleted.", 400);
				const e = await jobEnv(ctx);
				const src = await e.source(job.source);
				const dst = await e.dest(job.site);
				const from = await verifyFrom(e.destKv(ctx.kv, job.site), e.settings, e.now);
				const verify: MoveJob["verify"] = {};
				for (const t of MOVE_ORDER) verify[t] = await verifyTable(src, dst, t, job.site, from);
				const j = { ...job, verify };
				await ctx.kv.set(KV_MOVE_JOB, j);
				return state(j);
			},
		},
		/**
		 * The last step: drop the nine tables and `ca_meta` from the old database, once the check found nothing missing.
		 * When that is the EmDash database its schema version (host KV) goes too, so `ensureSchema` creates the tables
		 * again if a site writes there later.
		 */
		"move/drop-old-tables": {
			permission: manage,
			input: MoveDropBody,
			async handler(ctx: MoveCtx) {
				if (!MoveDropBody.safeParse(ctx.input).success) throw new PluginRouteError("confirm_required", 'Send { "confirm": "DELETE" }.', 400);
				const job = await current(ctx);
				if (!job || job.status !== "done") throw new PluginRouteError("not_done", "Only the source of a finished move can be deleted.", 400);
				if (job.dropped) return state(job);
				// A move of one site leaves the other sites' rows in the old database.
				if (job.site !== undefined) throw new PluginRouteError("site_move", `Only the rows of ${job.site} were moved; the old tables keep the other sites' rows and stay.`, 400);
				if (env.targets().includes(job.source)) throw new PluginRouteError("source_in_use", `Sites still write to ${name(job.source)}; its tables stay.`, 400);
				const missing = Object.entries(job.verify).filter(([, v]) => v.short > 0).map(([t]) => t);
				if (missing.length || Object.keys(job.verify).length < MOVE_ORDER.length)
					throw new PluginRouteError("verify_failed", `The check found rows missing in ${missing.join(", ") || "tables not checked yet"}. Run the check again, or start the move again (it copies missing rows; counters already loaded are not added again), before deleting.`, 400);
				const src = await (await jobEnv(ctx)).source(job.source);
				if (await writtenTo(src, env.targets())) throw new PluginRouteError("source_in_use", `Sites still write to ${name(job.source)} under another name; its tables stay.`, 400);
				const host = job.source === null || (await env.source(null).then((h) => !!h && sameDatabase(h, src)));
				await dropTables(src);
				if (host) await ctx.kv.delete(SCHEMA_VERSION_KEY);
				const j = { ...job, dropped: now() };
				await ctx.kv.set(KV_MOVE_JOB, j);
				return state(j);
			},
		},
	};
}
