/**
 * Automatic annotations from the content lifecycle hooks: one per item, kind and day,
 * scoped to the item's public path when the host can resolve it, else site-wide with `slug` and
 * `collection` so the editor can set the path by hand. The Annotations settings decide which hooks annotate, and a
 * per-day cap kept in the plugin KV stops a bulk import from flooding the charts.
 */
import { derivePath } from "../content/path.js";
import { dayInZone } from "../core/time.js";
import type { KvLike } from "../core/crypto.js";
import type { Settings } from "../settings.js";
import type { Scope } from "./scope.js";

/** Today's automatic annotation ids in the site timezone: one KV read and at most one write per hook. */
export const KV_AUTO_ANNOTATIONS = "annotations:auto";
type Today = { day: string; ids: string[] };

export type AnnotateSettings = Pick<Settings, "siteId" | "siteTimezone" | "autoAnnotations" | "annotatePublish" | "annotateUpdate" | "annotateCollections" | "autoAnnotationsPerDay">;

export interface AnnotateCtx {
	content?: { getPublicUrl?(collection: string, id: string): Promise<string | null> };
	/** The host's site info: `url` is empty until the site URL is set. */
	site?: { url?: string };
	storage: { annotations?: { put(id: string, data: unknown): Promise<void> } };
	kv: Pick<KvLike, "get" | "set">;
}

export async function annotate(
	ctx: AnnotateCtx,
	kind: "publish" | "update",
	content: Record<string, unknown>,
	collection: string,
	s: AnnotateSettings,
	ts: number = Math.floor(Date.now() / 1000),
): Promise<void> {
	const id = typeof content.id === "string" ? content.id : null;
	if (!id || !s.autoAnnotations || !(kind === "publish" ? s.annotatePublish : s.annotateUpdate)) return;
	if (s.annotateCollections.length && !s.annotateCollections.includes(collection)) return;
	const day = dayInZone(ts, s.siteTimezone);
	const key = `${kind}:${collection}:${id}:${day}`;
	const prev = await ctx.kv.get<Today>(KV_AUTO_ANNOTATIONS);
	const ids = prev?.day === day ? prev.ids : [];
	const repeat = ids.includes(key);
	if (!repeat && ids.length >= s.autoAnnotationsPerDay) return;
	const path = await derivePath(ctx, collection, content);
	// With the site URL known the host resolves a public path for every published page. No path then means the item
	// has no page (a data record of a collection that is not routable): nothing to scope an annotation to, and a
	// site-wide one would be read as a change to the whole site. It is skipped before it counts against the daily cap,
	// so a bulk import of records cannot use up the cap the real pages need. Without a site URL no item can resolve,
	// so those keep the site-wide record and the editor sets the path by hand.
	if (!path && ctx.site?.url) return;
	// Counted before the slower write. shortcut: hooks running at the same moment can read the same list and
	// each pass the cap, so a parallel burst may overshoot it; a strict cap needs compareAndSet.
	if (!repeat) await ctx.kv.set(KV_AUTO_ANNOTATIONS, { day, ids: [...ids, key] } satisfies Today);
	const data = (content.data ?? {}) as Record<string, unknown>;
	const slug = typeof content.slug === "string" ? content.slug : undefined;
	const title = typeof data.title === "string" ? data.title : (slug ?? id);
	const scope: Scope | undefined = path ? { v: 1, path: [{ op: "is", value: path }] } : undefined;
	await ctx.storage.annotations?.put(key, {
		site: s.siteId,
		ts,
		kind,
		text: title.slice(0, 200),
		...(scope ? { scope } : {}),
		...(slug ? { slug: slug.slice(0, 256) } : {}),
		collection,
		ref: id,
	});
}
