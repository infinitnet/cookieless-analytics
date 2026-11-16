/** API keys over the `api_keys` storage collection: SHA-256 of the secret, lookup by the `prefix` index. */
import { randomId, timingSafeEqual } from "../core/crypto.js";
import type { Scope } from "./scopes.js";
import { generateToken, hashSecret, parseToken } from "./token.js";

/** Stored item. Times are epoch seconds. */
export interface ApiKey {
	label: string;
	prefix: string;
	hash: string;
	scopes: Scope[];
	/** Restriction to local-database site ids; empty means every site. */
	sites: string[];
	created: number;
	expires: number | null;
	last_used: number | null;
	revoked: boolean;
}
/** What the admin sees: never the hash, never the token. */
export type ApiKeyView = Omit<ApiKey, "hash"> & { id: string };

export interface KeyColl {
	query(o?: { where?: Record<string, unknown>; limit?: number; cursor?: string }): Promise<{ items: Array<{ id: string; data: unknown }>; cursor?: string; hasMore: boolean }>;
	get(id: string): Promise<unknown>;
	put(id: string, data: unknown): Promise<void>;
	delete(id: string): Promise<boolean>;
	/** Host atomic merge of the named fields (`StorageCollection.updateIf`, `plugins/types.ts`). */
	updateIf(id: string, args: { where: Record<string, unknown>; set: Partial<ApiKey> }): Promise<{ applied: boolean; data?: unknown }>;
}

/** `last_used` is written at most once per this many seconds per key. */
export const TOUCH_SECONDS = 600;
export const MAX_KEYS = 100;

const view = (id: string, k: ApiKey): ApiKeyView => {
	const { hash: _h, ...rest } = k;
	return { id, ...rest };
};

export async function createKey(coll: KeyColl, input: { label: string; scopes: Scope[]; sites?: string[] | undefined; expires?: number | null | undefined }, now: number): Promise<{ token: string; key: ApiKeyView }> {
	let t = generateToken();
	// A prefix clash is about 1 in 2.8e12; retry once anyway so lookups stay unique.
	if ((await coll.query({ where: { prefix: t.prefix }, limit: 1 })).items.length) t = generateToken();
	const key: ApiKey = {
		label: input.label,
		prefix: t.prefix,
		hash: await hashSecret(t.secret),
		scopes: [...new Set(input.scopes)],
		sites: [...new Set(input.sites ?? [])],
		created: now,
		expires: input.expires ?? null,
		last_used: null,
		revoked: false,
	};
	const id = randomId(16);
	await coll.put(id, key);
	return { token: t.token, key: view(id, key) };
}

export async function listKeys(coll: KeyColl): Promise<ApiKeyView[]> {
	const { items } = await coll.query({ limit: MAX_KEYS });
	return items.map((i) => view(i.id, i.data as ApiKey)).sort((a, b) => b.created - a.created);
}

export async function revokeKey(coll: KeyColl, id: string): Promise<ApiKeyView | null> {
	// A field merge, so a concurrent `last_used` write cannot bring `revoked: false` back.
	const r = await coll.updateIf(id, { where: {}, set: { revoked: true } });
	if (!r.applied) return null;
	return view(id, { ...((r.data ?? (await coll.get(id))) as ApiKey), revoked: true });
}

/** The key behind an `X-Api-Key` value, or null for missing, malformed, unknown, wrong, revoked and expired tokens alike. */
export async function verifyKey(coll: KeyColl, header: string | null, now: number): Promise<{ id: string; scopes: Scope[]; sites: string[] } | null> {
	const parsed = parseToken(header);
	if (!parsed) return null;
	const { items } = await coll.query({ where: { prefix: parsed.prefix }, limit: 1 });
	const hit = items[0];
	const hash = await hashSecret(parsed.secret);
	const key = hit?.data as ApiKey | undefined;
	if (!hit || !key || !timingSafeEqual(hash, key.hash) || key.revoked || (key.expires !== null && key.expires <= now)) return null;
	// Merge only `last_used`: writing the whole item back could undo a revoke that landed in between.
	if (key.last_used === null || now - key.last_used >= TOUCH_SECONDS) await coll.updateIf(hit.id, { where: {}, set: { last_used: now } });
	return { id: hit.id, scopes: key.scopes, sites: key.sites };
}
