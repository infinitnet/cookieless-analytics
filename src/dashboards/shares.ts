/** Share links over the `shares` collection, indexed by `prefix` and `site`. Times are epoch seconds. */
import { randomId, timingSafeEqual } from "../core/crypto.js";
import { generateToken, hashSecret, parseToken } from "../keys/token.js";
import { loadAll } from "../routes/data.js";
import { MAX_SHARES_PER_DASHBOARD, MAX_SHARES_PER_SITE } from "./limits.js";
import { MAX_SHARE_LABEL, mostPermissive, shareState, type ShareView } from "./share-view.js";
export { mostPermissive, shareState };
import { makeVerifier, type PasswordRecord } from "./password.js";

/** Several labeled links per dashboard, bounded per dashboard and per site. */
export { MAX_SHARES_PER_DASHBOARD, MAX_SHARES_PER_SITE };
export { MAX_SHARE_LABEL };

export interface Share {
	site: string;
	dashboard: string;
	prefix: string;
	/** Hex SHA-256 of the token secret. */
	hash: string;
	pw?: PasswordRecord;
	expires: number | null;
	created: number;
	views: number;
	lastViewed: number | null;
	/** A name for the link, 1 to 40 characters. */
	label?: string;
}


export interface ShareColl {
	query(o?: { where?: Record<string, unknown>; limit?: number; cursor?: string }): Promise<{ items: Array<{ id: string; data: unknown }>; cursor?: string; hasMore: boolean }>;
	get(id: string): Promise<unknown>;
	put(id: string, data: unknown): Promise<void>;
	delete(id: string): Promise<boolean>;
	/** Host atomic update (`StorageCollection.updateIf`, `plugins/types.ts`): update-only, deltas applied in SQL. */
	updateIf(id: string, args: { where: Record<string, unknown>; set?: Record<string, unknown>; delta?: Record<string, { inc: number }> }): Promise<{ applied: boolean }>;
}

export class ShareError extends Error {
	constructor(
		readonly code: "too_many_shares" | "invalid_share",
		message: string,
	) {
		super(message);
	}
}

export function shareView(id: string, s: Share, now: number): ShareView {
	return { id, site: s.site, dashboard: s.dashboard, prefix: s.prefix, password: !!s.pw, expires: s.expires, expired: s.expires !== null && s.expires <= now, created: s.created, views: s.views, lastViewed: s.lastViewed, ...(s.label ? { label: s.label } : {}) };
}

/** Every link of one dashboard, oldest first. */
export async function sharesOf(coll: ShareColl, site: string, dashboard: string): Promise<Array<{ id: string; share: Share }>> {
	return (await loadAll(coll, { site }))
		.filter((i) => (i.data as Share).dashboard === dashboard)
		.map((i) => ({ id: i.id, share: i.data as Share }))
		.sort((a, b) => a.share.created - b.share.created);
}

/** Up to 10 links per dashboard and 100 per site. Returns the token once; only its prefix and the hash of its secret are stored. */
export async function createShare(
	coll: ShareColl,
	input: { site: string; dashboard: string; password?: string | undefined; expires?: number | null | undefined; label?: string | undefined },
	now: number,
): Promise<{ token: string; share: ShareView }> {
	const all = await loadAll(coll, { site: input.site });
	if (all.filter((i) => (i.data as Share).dashboard === input.dashboard).length >= MAX_SHARES_PER_DASHBOARD) throw new ShareError("too_many_shares", `At most ${MAX_SHARES_PER_DASHBOARD} links per dashboard. Revoke one first.`);
	if (all.length >= MAX_SHARES_PER_SITE) throw new ShareError("too_many_shares", `At most ${MAX_SHARES_PER_SITE} links per site. Revoke one first.`);
	const label = input.label?.trim();
	if (label !== undefined && (label.length < 1 || label.length > MAX_SHARE_LABEL || /\p{Cc}/u.test(label))) throw new ShareError("invalid_share", `A label has 1 to ${MAX_SHARE_LABEL} characters.`);
	if (input.expires != null && input.expires <= now) throw new ShareError("invalid_share", "The expiry must be in the future.");
	let t = generateToken();
	// A prefix clash is about 1 in 2.8e12; retry once anyway so lookups stay unique.
	if ((await coll.query({ where: { prefix: t.prefix }, limit: 1 })).items.length) t = generateToken();
	const share: Share = {
		site: input.site,
		dashboard: input.dashboard,
		prefix: t.prefix,
		hash: await hashSecret(t.secret),
		...(input.password ? { pw: await makeVerifier(input.password, t.secret) } : {}),
		expires: input.expires ?? null,
		created: now,
		views: 0,
		lastViewed: null,
		...(label ? { label } : {}),
	};
	const id = randomId(16);
	await coll.put(id, share);
	return { token: t.token, share: shareView(id, share, now) };
}

/** The live share behind a token, with its secret; null for malformed, unknown, wrong and expired tokens alike. */
export async function lookup(coll: ShareColl, token: string, now: number): Promise<{ id: string; share: Share; secret: string } | null> {
	const parsed = parseToken(token);
	if (!parsed) return null;
	const hit = (await coll.query({ where: { prefix: parsed.prefix }, limit: 1 })).items[0];
	const hash = await hashSecret(parsed.secret);
	const share = hit?.data as Share | undefined;
	if (!hit || !share || !timingSafeEqual(hash, share.hash) || (share.expires !== null && share.expires <= now)) return null;
	return { id: hit.id, share, secret: parsed.secret };
}

/** Deletes one link of the site by its id; the other links of the dashboard keep working. */
export async function deleteShare(coll: ShareColl, site: string, id: string): Promise<boolean> {
	const raw = (await coll.get(id)) as Share | null;
	if (!raw || raw.site !== site) return false;
	return coll.delete(id);
}

/** Deletes every link of the dashboard (the dashboard itself was deleted). */
export async function deleteSharesOf(coll: ShareColl, site: string, dashboard: string): Promise<boolean> {
	let deleted = false;
	for (const it of await loadAll(coll, { site })) if ((it.data as Share).dashboard === dashboard) deleted = (await coll.delete(it.id)) || deleted;
	return deleted;
}

/** `views += 1`, `lastViewed = now` as one update-only statement: a revoked share is never written back. */
export async function recordView(coll: ShareColl, id: string, now: number): Promise<void> {
	await coll.updateIf(id, { where: {}, set: { lastViewed: now }, delta: { views: { inc: 1 } } });
}
