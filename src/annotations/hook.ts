/**
 * Automatic annotations from the content lifecycle hooks: one per item, kind and day,
 * scoped to the item's public path when the host can resolve it, else site-wide with `slug` and
 * `collection` so the editor can set the path by hand.
 */
import { derivePath } from "../content/path.js";
import { dayInZone } from "../core/time.js";
import type { Scope } from "./scope.js";

export interface AnnotateCtx {
	content?: { getPublicUrl?(collection: string, id: string): Promise<string | null> };
	storage: { annotations?: { put(id: string, data: unknown): Promise<void> } };
}

export async function annotate(
	ctx: AnnotateCtx,
	kind: "publish" | "update",
	content: Record<string, unknown>,
	collection: string,
	s: { siteId: string; siteTimezone: string },
	ts: number = Math.floor(Date.now() / 1000),
): Promise<void> {
	const id = typeof content.id === "string" ? content.id : null;
	if (!id) return;
	const data = (content.data ?? {}) as Record<string, unknown>;
	const slug = typeof content.slug === "string" ? content.slug : undefined;
	const title = typeof data.title === "string" ? data.title : (slug ?? id);
	const path = await derivePath(ctx, collection, content);
	const scope: Scope | undefined = path ? { v: 1, path: [{ op: "is", value: path }] } : undefined;
	await ctx.storage.annotations?.put(`${kind}:${collection}:${id}:${dayInZone(ts, s.siteTimezone)}`, {
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
