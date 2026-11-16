/**
 * Share routes: `shares/list` under `plugins:read` (every link of a dashboard without hash or
 * verifier), `shares/create` and `shares/delete` (by share id) under `plugins:manage`. A remote satellite's dashboards
 * are not shareable.
 */
import { PluginRouteError } from "emdash";
import { z } from "zod";
import { MAX_PASSWORD, MIN_PASSWORD, passwordOk } from "../dashboards/password.js";
import { createShare, deleteShare, MAX_SHARE_LABEL, ShareError, type ShareColl, sharesOf, shareView } from "../dashboards/shares.js";
import { type DashColl, getDashboard } from "../dashboards/store.js";
import { bindSite, SiteField, type SitesColl } from "../multisite/registry.js";
import type { Settings } from "../settings.js";

export interface SharesCtx {
	input: unknown;
	request?: Request;
	storage: { shares?: ShareColl; dashboards?: DashColl; sites?: Pick<SitesColl, "query"> };
}

export interface SharesEnv {
	settings(): Promise<Pick<Settings, "siteId" | "sharePath" | "siteOrigin">>;
	/** Remote satellite ids. */
	remoteIds?(): readonly string[];
	now?(): number;
}

const Id = z.string().regex(/^[a-z0-9]{12}$/);
export const ShareBodies = {
	list: z.object({ dashboard: Id, site: SiteField }).strict(),
	create: z
		.object({
			dashboard: Id,
			site: SiteField,
			password: z.string().refine(passwordOk, `Use ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`).optional(),
			expires: z.number().int().positive().nullable().optional(),
			label: z.string().trim().min(1).max(MAX_SHARE_LABEL).optional(),
		})
		.strict(),
	delete: z.object({ id: z.string().regex(/^[a-z0-9]{16}$/), site: SiteField }).strict(),
};

export function shareRoutes(env: SharesEnv) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1000);
	const coll = (ctx: SharesCtx) => {
		if (!ctx.storage.shares) throw new PluginRouteError("storage_unavailable", "The shares collection is not available.", 500);
		return ctx.storage.shares;
	};
	async function site(ctx: SharesCtx, requested: string | undefined): Promise<string> {
		const s = await env.settings();
		if (requested && requested !== s.siteId && env.remoteIds?.().includes(requested)) throw new PluginRouteError("remote_site_not_shareable", "Dashboards of a remote site cannot be shared.", 400);
		return (await bindSite(requested, s.siteId, ctx.storage.sites)).id;
	}

	return {
		"shares/list": {
			permission: "plugins:read" as const,
			input: ShareBodies.list,
			async handler(ctx: SharesCtx) {
				const b = ShareBodies.list.parse(ctx.input);
				const s = await site(ctx, b.site);
				const t = now();
				return { items: (await sharesOf(coll(ctx), s, b.dashboard)).map((h) => shareView(h.id, h.share, t)) };
			},
		},
		"shares/create": {
			permission: "plugins:manage" as const,
			input: ShareBodies.create,
			async handler(ctx: SharesCtx) {
				const b = ShareBodies.create.parse(ctx.input);
				const s = await site(ctx, b.site);
				if (!ctx.storage.dashboards || !(await getDashboard(ctx.storage.dashboards, s, b.dashboard).catch(() => null))) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
				try {
					const r = await createShare(coll(ctx), { site: s, dashboard: b.dashboard, password: b.password, expires: b.expires, label: b.label }, now());
					const cfg = await env.settings();
					const origin = cfg.siteOrigin || (ctx.request ? new URL(ctx.request.url).origin : "");
					// The full link is returned here once and never again.
					return { link: `${origin}${cfg.sharePath}/${r.token}`, share: r.share };
				} catch (err) {
					if (err instanceof ShareError) throw new PluginRouteError(err.code, err.message, err.code === "too_many_shares" ? 409 : 400);
					throw err;
				}
			},
		},
		"shares/delete": {
			permission: "plugins:manage" as const,
			input: ShareBodies.delete,
			async handler(ctx: SharesCtx) {
				const b = ShareBodies.delete.parse(ctx.input);
				const s = await site(ctx, b.site);
				return { id: b.id, deleted: await deleteShare(coll(ctx), s, b.id) };
			},
		},
	};
}
