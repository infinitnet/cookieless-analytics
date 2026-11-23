/**
 * Public, versioned integration contract. Other plugins may duplicate these
 * constants instead of importing the package; changing any value is a breaking change.
 */

export const PLUGIN_ID = "cookieless-analytics";
export const CONTRACT_VERSION = 1;
/** Package version, equal to `package.json` (tests/package.test.ts). */
export const VERSION = "1.2.2";
/** Product name for the admin footer and the plugin list; never served to visitors. */
export const PRODUCT_NAME = "Cookieless Analytics by Infinitnet";
/** Website, linked from the admin footer; equal to `package.json` `homepage` (tests/package.test.ts). */
export const PRODUCT_URL = "https://infinitnet.io/cookieless-analytics/";

/**
 * Cookieless Analytics Companion, the sandboxed setup helper in the EmDash plugin registry (docs/integration.md).
 * A registry install runs under an id derived from publisher and slug, so the admin finds it by both.
 */
export const COMPANION_SLUG = "cookieless-analytics-companion";
export const COMPANION_NAME = "Cookieless Analytics Companion";
/** DID of the registry publisher; equal to `publisher` in `packages/companion/emdash-plugin.jsonc`. */
export const COMPANION_PUBLISHER_DID = "did:plc:htzvomqz4z63po3if3uejz43";

/** Body of `POST /_emdash/api/plugins/<companion id>/hello`, sent by the admin once per browser session. */
export interface CompanionHello {
	v: 1;
	product: typeof PLUGIN_ID;
	/** Package version of this plugin, `x.y.z`. */
	pluginVersion: string;
	contractVersion: number;
}

const SEMVER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?$/;

/** True when `body` is exactly a `CompanionHello`: no other key, a semver `pluginVersion`, an integer `contractVersion` from 1 to 999. */
export function isCompanionHello(body: unknown): body is CompanionHello {
	if (!body || typeof body !== "object" || Array.isArray(body)) return false;
	const b = body as Record<string, unknown>;
	return (
		Object.keys(b).length === 4 &&
		b.v === 1 &&
		b.product === PLUGIN_ID &&
		typeof b.pluginVersion === "string" &&
		SEMVER_RE.test(b.pluginVersion) &&
		Number.isInteger(b.contractVersion) &&
		(b.contractVersion as number) >= 1 &&
		(b.contractVersion as number) <= 999
	);
}

/** Route names under `/_emdash/api/plugins/<PLUGIN_ID>/`. */
export const ROUTES = {
	in: "in",
	session: "session",
	contract: "contract",
	rollup: "rollup",
	shareView: "share/view",
} as const;

export const DEFAULT_SCRIPT_PATH = "/_/e.js";
export const DEFAULT_COLLECT_PATH = "/_/e";
export const DEFAULT_SHARE_PATH = "/_/s";
export const DEFAULT_NAMESPACE = "__ec";

export const SID_RE = /^[a-z0-9]{20}$/;
export const HIT_RE = /^[a-z0-9]{12}$/;

/** Reserved auto events and the single property key each one keeps. */
export const RESERVED_EVENTS = {
	_outbound: "url",
	_download: "file",
	_form: "form",
} as const;
export type ReservedEventName = keyof typeof RESERVED_EVENTS;

/**
 * Links convention (docs/integration.md): event names and property keys any link plugin sends for its short
 * links. `click` carries `key` and optional `place`; `view` carries `s0` to `s9`, each `<key>` or `<key>@<place>`;
 * `sale` carries `key` and `place` with `val`, `cur` and `oid`. The `links` report reads these names.
 */
export const LINK_EVENTS = { click: "out", view: "seen", sale: "conv", key: "slug", place: "place" } as const;

/** Words that never appear in anything served to a visitor's browser by default. */
export const FORBIDDEN_PUBLIC_WORDS = [
	"analytics",
	"track",
	"tracker",
	"tracking",
	"pixel",
	"telemetry",
	"collect",
	"stats",
	"beacon",
] as const;

export type PropValue = string | number | boolean;
export type Props = Record<string, PropValue>;

interface IngestBase {
	v: 1;
	sid?: string;
	/** Client site key; absent for the master's own pages. */
	k?: string;
	/** 1 when the sid was freshly generated on this page. */
	n?: 0 | 1;
}

export interface IngestPageview extends IngestBase {
	t: "pv";
	h: string;
	u: string;
	r?: string;
	w?: number;
	/** Navigation type of the document: 0 navigate, 1 reload, 2 back_forward. First pageview of a document only. */
	nt?: 0 | 1 | 2;
}

export interface IngestEngagement extends IngestBase {
	t: "en";
	h: string;
	d: number;
	/** Visible ms, 1 to the per-page cap. */
	e?: number;
	s?: number;
	i?: 0 | 1;
	/** Exit kind of this update: 0 hidden, 1 pagehide, 2 pagehide with persisted true. */
	x?: 0 | 1 | 2;
}

export interface IngestEvent extends IngestBase {
	t: "ev";
	/**
	 * Client event id, 12 characters `[a-z0-9]`, new for every event and kept on every retry of it: the event is
	 * stored once however often it is sent. Without it each post is a new event.
	 */
	h?: string;
	u?: string;
	name: string;
	p?: Props;
	/** Order value, 0 to 1,000,000,000. */
	val?: number;
	/** ISO 4217 code of `val`; absent means the site's default currency. */
	cur?: string;
	/** Order or transaction id: decides the hit id so one order is stored once; never stored. */
	oid?: string;
}

export type IngestBody = IngestPageview | IngestEngagement | IngestEvent;

/** Response of `GET .../session`. */
export type SessionReadResponse =
	| {
			v: 1;
			sid: string;
			started: number;
			channel: string;
			source: string;
			utm_source: string | null;
			utm_medium: string | null;
			utm_campaign: string | null;
			utm_term: string | null;
			utm_content: string | null;
			entry_path: string;
			country: string | null;
			device: string;
	  }
	| { v: 1; sid: null };

/** Response of `GET .../contract`. */
export interface ContractResponse {
	v: 1;
	pluginId: string;
	collectPath: string;
	scriptPath: string;
	namespace: string;
}
