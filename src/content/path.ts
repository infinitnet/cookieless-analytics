/**
 * Public paths of content items: the one derivation shared by the publish and
 * update hooks and the editor panel, plus the pattern classifier of the per-collection report.
 */
import { MAX_SCOPE_VALUE } from "../annotations/scope.js";

export interface PathCtx {
	content?: { getPublicUrl?(collection: string, id: string): Promise<string | null> };
}

/** The fields of a content item the derivation reads. */
export interface PathContent {
	id?: unknown;
	data?: unknown;
}

/** Placeholder syntax of `urlPattern`. */
const PLACEHOLDER = /\{(\w+)\}/g;
/** A `content.data` value that may fill a custom placeholder. */
const FILL_RE = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Public path of a published item. The host's `getPublicUrl` (`content:read`) applies the collection's
 * `urlPattern`, the date tokens, the locale prefix and the trailing slash rule exactly as the site renders
 * them (`emdash/src/plugins/content-access.ts`); it fills `{slug}` and `{id}` only, so any other
 * placeholder left literal is filled here from `content.data[name]` (a string or number matching
 * `FILL_RE`). Null when the host cannot resolve the item (draft, not routable, no site URL), a
 * placeholder stays unfilled, or the read fails. Never throws.
 */
export async function derivePath(ctx: PathCtx, collection: string, content: PathContent): Promise<string | null> {
	const id = typeof content.id === "string" ? content.id : null;
	if (!id) return null;
	try {
		const url = await ctx.content?.getPublicUrl?.(collection, id);
		if (!url) return null;
		const data = (content.data ?? {}) as Record<string, unknown>;
		const filled = url.replace(PLACEHOLDER, (m, name: string) => {
			const v = Object.hasOwn(data, name) ? data[name] : undefined;
			const s = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
			return typeof s === "string" && FILL_RE.test(s) ? s : m;
		});
		const path = new URL(filled).pathname;
		// A token neither the host nor `content.data` filled (`{year}` without a publish date).
		if (/[{}]|%7B|%7D/i.test(path) || path.length > MAX_SCOPE_VALUE) return null;
		return path;
	} catch {
		return null;
	}
}

/** An optional leading locale segment (`/fr`, `/pt-br`); two letters so `/new/...` is never read as a locale. */
const LOCALE = "(?:/[a-z]{2}(?:-[a-z0-9]{2,4})?)?";

export interface CompiledPattern {
	collection: string;
	re: RegExp;
	/** Literal characters of the pattern: the most specific pattern wins. */
	literal: number;
}

/**
 * Anchored regex of a `urlPattern` (`{name}` to `[^/]+`, an optional locale segment first). A null
 * pattern is the host default `/{collection}/{slug}` (`interpolateUrlPattern`). Slashes are normalized
 * like the stored paths: repeats collapsed, no trailing slash, a leading one.
 */
export function compilePattern(collection: string, urlPattern: string | null): CompiledPattern {
	let p = (urlPattern ?? `/${collection}/{slug}`).replace(/\/{2,}/g, "/");
	if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
	if (!p.startsWith("/")) p = `/${p}`;
	const parts = p.split(PLACEHOLDER);
	// `split` with one capture group alternates literal text and placeholder names.
	const literals = parts.filter((_, i) => i % 2 === 0);
	const body = literals.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+");
	return { collection, re: new RegExp(`^${LOCALE}${body}$`, "i"), literal: literals.join("").length };
}

export const OTHER_COLLECTION = "(other)";

/** Collection of a stored path: the matching pattern with the most literal characters, `(other)` when none matches. */
export function classifyPath(path: string, patterns: readonly CompiledPattern[]): string {
	let best: CompiledPattern | undefined;
	for (const c of patterns) if (c.re.test(path) && (!best || c.literal > best.literal)) best = c;
	return best?.collection ?? OTHER_COLLECTION;
}
