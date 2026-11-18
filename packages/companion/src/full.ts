/**
 * Constants of the full plugin, duplicated from its `src/contract.ts` so this package never imports it.
 * No EmDash import here. A root test compares both sides; change them together.
 */

export const PLUGIN_ID = "cookieless-analytics";
export const CONTRACT_VERSION = 1;
export const PACKAGE_NAME = "@infinitnet/cookieless-analytics";
/** Registry slug of this companion. */
export const COMPANION_SLUG = "cookieless-analytics-companion";

/** Admin path of the full plugin's Overview, passed to `ctx.url()`. */
export const OVERVIEW_PATH = `/_emdash/admin/plugins/${PLUGIN_ID}/`;

const DOCS = "https://github.com/infinitnet/cookieless-analytics/blob/main/docs";
export const DOC_URLS = {
	install: `${DOCS}/install.md`,
	hyperdrive: `${DOCS}/install.md#postgres-through-hyperdrive`,
	limits: `${DOCS}/limits.md`,
	privacy: `${DOCS}/privacy.md`,
} as const;

/** Body the full plugin's admin posts to the companion's `hello` route. */
export interface CompanionHello {
	v: 1;
	product: typeof PLUGIN_ID;
	pluginVersion: string;
	contractVersion: number;
}

const HELLO_KEYS = ["contractVersion", "pluginVersion", "product", "v"];
const SEMVER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?$/;

/** Exact check of a hello body: these four keys only, a semver shaped version, a whole contract version. */
export function parseHello(body: unknown): CompanionHello | null {
	if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
	const b = body as Record<string, unknown>;
	if (Object.keys(b).sort().join() !== HELLO_KEYS.join()) return null;
	if (b.v !== 1 || b.product !== PLUGIN_ID) return null;
	if (typeof b.pluginVersion !== "string" || !SEMVER_RE.test(b.pluginVersion)) return null;
	const cv = b.contractVersion;
	if (typeof cv !== "number" || !Number.isInteger(cv) || cv < 1 || cv > 999) return null;
	return { v: 1, product: PLUGIN_ID, pluginVersion: b.pluginVersion, contractVersion: cv };
}
