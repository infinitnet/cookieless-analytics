/**
 * Remote satellites: the integration option `sites`, validated when the plugin is created. Each
 * satellite is another EmDash install with this plugin; its reports are read through its agent API with a
 * key the master reads from an env var at call time. Nothing secret is stored here.
 */
import { SITE_ID_RE } from "./registry.js";

export interface RemoteSite {
	id: string;
	label: string;
	/** `https://host[:port]`, no path. */
	origin: string;
	/** Name of the env var that holds the satellite's API key. */
	keyEnv: string;
}

/** Own database for the analytics tables: the name of a D1 binding of the host Worker. */
export interface DatabaseOption {
	binding: string;
}

/** Site routing: each listed site's analytics tables in its own D1 binding; the others in `default` (absent: the host database). */
export interface DatabasesOption {
	default?: string;
	sites: Record<string, string>;
}

export interface PluginOptions {
	sites?: RemoteSite[];
	database?: DatabaseOption;
	databases?: DatabasesOption;
}

/** A Worker binding name: a JavaScript identifier, as wrangler requires. */
export const BINDING_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export const KEY_ENV_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
/** At most this many satellites; the All-sites summary fetches at most 10. */
export const MAX_REMOTE_SITES = 50;
/** At most this many entries in `databases.sites` (the registry's site limit). */
export const MAX_ROUTED_SITES = 500;
/** The `siteId` setting's default: settings are not readable when the plugin is created (docs/design-notes.md). */
const DEFAULT_SITE_ID = "default";

const fail = (msg: string): never => {
	throw new Error(`cookieless-analytics: sites option: ${msg}`);
};

/** The `origin` of an https URL without path, query, fragment or credentials, or null. */
function httpsOrigin(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return null;
	}
	if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.pathname !== "/") return null;
	// `new URL("https://a.b/").pathname` is "/" for both "https://a.b" and "https://a.b/": the trailing slash is fine.
	return u.origin;
}

/**
 * Validate the integration options: `id` matches `^[a-z0-9-]{1,32}$`, is not `all` nor the default
 * `siteId`, and is unique; `origin` is https with no path; `keyEnv` matches `^[A-Z][A-Z0-9_]{2,63}$`. Throws a
 * plain `Error` naming the problem, so a bad `astro.config` fails at startup.
 */
export function parseOptions(options: unknown, siteId = DEFAULT_SITE_ID): { sites: RemoteSite[]; database?: DatabaseOption; databases?: DatabasesOption } {
	if (options === undefined || options === null) return { sites: [] };
	if (typeof options !== "object" || Array.isArray(options)) return fail("options must be an object.");
	const o = options as { database?: unknown; databases?: unknown; sites?: unknown };
	const database = parseDatabase(o.database);
	const databases = parseDatabases(o.databases);
	if (database && databases) throw new Error("cookieless-analytics: database option: set database or databases, not both (databases.default takes the place of database).");
	return { sites: parseSites(o.sites, siteId), ...(database ? { database } : {}), ...(databases ? { databases } : {}) };
}

/** `databases: { default?, sites: { siteId: binding } }`: which D1 binding holds each site's analytics tables. */
function parseDatabases(raw: unknown): DatabasesOption | undefined {
	if (raw === undefined) return undefined;
	const bad = (msg: string): never => {
		throw new Error(`cookieless-analytics: databases option: ${msg}`);
	};
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("must be an object such as { default: \"CA_DB\", sites: { shop: \"CA_DB2\" } }.");
	const { default: def, sites } = raw as { default?: unknown; sites?: unknown };
	if (def !== undefined && (typeof def !== "string" || !BINDING_RE.test(def))) bad("default must name a D1 binding (letters, digits and _).");
	if (!sites || typeof sites !== "object" || Array.isArray(sites)) bad("sites must be an object of site id to D1 binding.");
	const out: Record<string, string> = {};
	const entries = Object.entries(sites as Record<string, unknown>);
	if (entries.length > MAX_ROUTED_SITES) bad(`at most ${MAX_ROUTED_SITES} sites.`);
	for (const [id, b] of entries) {
		if (!SITE_ID_RE.test(id) || id === "all") bad(`site id ${JSON.stringify(id)} must be lowercase letters, digits and dashes, up to 32 characters, and not all.`);
		if (typeof b !== "string" || !BINDING_RE.test(b)) bad(`site ${id} must name a D1 binding (letters, digits and _).`);
		out[id] = b as string;
	}
	return { ...(def ? { default: def as string } : {}), sites: out };
}

/** `database: { binding }`: the D1 binding that holds the analytics tables. Absent: the host database. */
function parseDatabase(raw: unknown): DatabaseOption | undefined {
	if (raw === undefined) return undefined;
	const binding = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as { binding?: unknown };
	if (typeof binding.binding !== "string" || !BINDING_RE.test(binding.binding))
		throw new Error("cookieless-analytics: database option: binding must name the D1 binding of the analytics database, such as { binding: \"CA_DB\" } (letters, digits and _).");
	return { binding: binding.binding };
}

function parseSites(raw: unknown, siteId: string): RemoteSite[] {
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) return fail("sites must be an array.");
	if (raw.length > MAX_REMOTE_SITES) fail(`at most ${MAX_REMOTE_SITES} sites.`);
	const sites: RemoteSite[] = [];
	for (const item of raw) {
		const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
		const id = o.id;
		if (typeof id !== "string" || !SITE_ID_RE.test(id)) fail(`id ${JSON.stringify(id)} must be lowercase letters, digits and dashes, up to 32 characters.`);
		const sid = id as string;
		if (sid === siteId) fail(`id ${sid} is the id of this site.`);
		if (sid === "all") fail("id all is reserved for the All sites view.");
		if (sites.some((s) => s.id === sid)) fail(`id ${sid} is listed twice.`);
		const label = typeof o.label === "string" ? o.label.trim() : "";
		if (!label || label.length > 64) fail(`site ${sid} needs a label of 1 to 64 characters.`);
		const origin = httpsOrigin(o.origin);
		if (!origin) fail(`site ${sid} needs an https origin without a path, such as https://blog.example.com.`);
		if (typeof o.keyEnv !== "string" || !KEY_ENV_RE.test(o.keyEnv)) fail(`site ${sid} needs keyEnv: an env var name of uppercase letters, digits and _ (3 to 64 characters).`);
		sites.push({ id: sid, label, origin: origin as string, keyEnv: o.keyEnv as string });
	}
	return sites;
}

/** `allowedHosts`: the base hosts plus each satellite's hostname, exactly, without duplicates. */
export function allowedHostsFor(base: readonly string[], sites: readonly RemoteSite[]): string[] {
	return [...new Set([...base, ...sites.map((s) => new URL(s.origin).hostname)])];
}
