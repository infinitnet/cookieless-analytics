/** Admin routes `keys/list|create|revoke|delete`, `plugins:manage`. Create returns the token once; nothing returns it later. */
import { PluginRouteError } from "emdash";
import { z } from "zod";
import { createKey, type KeyColl, listKeys, MAX_KEYS, revokeKey } from "../keys/store.js";
import { SCOPES } from "../keys/scopes.js";
import { registry, SITE_ID_RE, type SitesColl } from "../multisite/registry.js";

export const KeyCreateBody = z
	.object({
		label: z.string().trim().min(1).max(64),
		scopes: z.array(z.enum(SCOPES)).min(1).max(SCOPES.length),
		/** Optional restriction to local-database sites (the local site and client sites); empty or absent means all. */
		sites: z.array(z.string().regex(SITE_ID_RE)).max(50).optional(),
		/** Epoch seconds; absent or null means no expiry. */
		expires: z.number().int().positive().nullable().optional(),
	})
	.strict();
export const KeyRevokeBody = z.object({ id: z.string().regex(/^[a-z0-9]{1,64}$/) }).strict();
const EmptyBody = z.object({}).strict().optional();

export interface KeysCtx {
	input: unknown;
	storage: { api_keys?: KeyColl; sites?: Pick<SitesColl, "query"> };
}

const coll = (ctx: KeysCtx): KeyColl => {
	if (!ctx.storage.api_keys) throw new PluginRouteError("storage_unavailable", "The api_keys collection is not available.", 500);
	return ctx.storage.api_keys;
};

export function keyRoutes(env: { now?(): number; settings?(): Promise<{ siteId: string }> } = {}) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1000);
	return {
		"keys/list": {
			permission: "plugins:manage" as const,
			input: EmptyBody,
			handler: async (ctx: KeysCtx) => ({ items: await listKeys(coll(ctx)) }),
		},
		"keys/create": {
			permission: "plugins:manage" as const,
			input: KeyCreateBody,
			async handler(ctx: KeysCtx) {
				const body = KeyCreateBody.parse(ctx.input);
				if (body.expires != null && body.expires <= now()) throw new PluginRouteError("invalid_expiry", "The expiry must be in the future.", 400);
				if (body.sites?.length) {
					const local = (await env.settings?.())?.siteId;
					const clients = (await registry(ctx.storage.sites)).byId;
					const unknown = body.sites.find((id) => id !== local && !clients.has(id));
					if (unknown) throw new PluginRouteError("unknown_site", `Unknown site ${unknown}: a key can be limited to this site and its client sites only.`, 400);
				}
				const c = coll(ctx);
				// Revoked keys stay listed until deleted (keys/delete), so they count.
				if ((await listKeys(c)).length >= MAX_KEYS) throw new PluginRouteError("too_many_keys", `At most ${MAX_KEYS} keys per install, revoked keys included; delete a revoked key to make room.`, 400);
				return createKey(c, body, now());
			},
		},
		"keys/revoke": {
			permission: "plugins:manage" as const,
			input: KeyRevokeBody,
			async handler(ctx: KeysCtx) {
				const key = await revokeKey(coll(ctx), KeyRevokeBody.parse(ctx.input).id);
				if (!key) throw new PluginRouteError("not_found", "Unknown key.", 404);
				return { key };
			},
		},
		"keys/delete": {
			permission: "plugins:manage" as const,
			input: KeyRevokeBody,
			async handler(ctx: KeysCtx) {
				const { id } = KeyRevokeBody.parse(ctx.input);
				const c = coll(ctx);
				const cur = (await c.get(id)) as { revoked?: unknown } | null;
				if (!cur) throw new PluginRouteError("not_found", "Unknown key.", 404);
				// Only a revoked key can go: an active one is revoked first, so deleting never cuts off a client by surprise.
				if (cur.revoked !== true) throw new PluginRouteError("not_revoked", "Revoke the key before deleting it.", 400);
				await c.delete(id);
				return { id, deleted: true };
			},
		},
	};
}
