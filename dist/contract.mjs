//#region src/contract.ts
/**
* Public, versioned integration contract. Other plugins may duplicate these
* constants instead of importing the package; changing any value is a breaking change.
*/
const PLUGIN_ID = "cookieless-analytics";
const CONTRACT_VERSION = 1;
/** Package version, equal to `package.json` (tests/package.test.ts). */
const VERSION = "1.1.0";
/** Product name for the admin footer and the plugin list; never served to visitors. */
const PRODUCT_NAME = "Cookieless Analytics by Infinitnet";
/** Website, linked from the admin footer; equal to `package.json` `homepage` (tests/package.test.ts). */
const PRODUCT_URL = "https://infinitnet.io/cookieless-analytics/";
/**
* Cookieless Analytics Companion, the sandboxed setup helper in the EmDash plugin registry (docs/integration.md).
* A registry install runs under an id derived from publisher and slug, so the admin finds it by both.
*/
const COMPANION_SLUG = "cookieless-analytics-companion";
const COMPANION_NAME = "Cookieless Analytics Companion";
/** DID of the registry publisher; equal to `publisher` in `packages/companion/emdash-plugin.jsonc`. */
const COMPANION_PUBLISHER_DID = "did:plc:htzvomqz4z63po3if3uejz43";
const SEMVER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?$/;
/** True when `body` is exactly a `CompanionHello`: no other key, a semver `pluginVersion`, an integer `contractVersion` from 1 to 999. */
function isCompanionHello(body) {
	if (!body || typeof body !== "object" || Array.isArray(body)) return false;
	const b = body;
	return Object.keys(b).length === 4 && b.v === 1 && b.product === PLUGIN_ID && typeof b.pluginVersion === "string" && SEMVER_RE.test(b.pluginVersion) && Number.isInteger(b.contractVersion) && b.contractVersion >= 1 && b.contractVersion <= 999;
}
/** Route names under `/_emdash/api/plugins/<PLUGIN_ID>/`. */
const ROUTES = {
	in: "in",
	session: "session",
	contract: "contract",
	rollup: "rollup",
	shareView: "share/view"
};
const DEFAULT_SCRIPT_PATH = "/_/e.js";
const DEFAULT_COLLECT_PATH = "/_/e";
const DEFAULT_SHARE_PATH = "/_/s";
const DEFAULT_NAMESPACE = "__ec";
const SID_RE = /^[a-z0-9]{20}$/;
const HIT_RE = /^[a-z0-9]{12}$/;
/** Reserved auto events and the single property key each one keeps. */
const RESERVED_EVENTS = {
	_outbound: "url",
	_download: "file",
	_form: "form"
};
/**
* Links convention (docs/integration.md): event names and property keys any link plugin sends for its short
* links. `click` carries `key` and optional `place`; `view` carries `s0` to `s9`, each `<key>` or `<key>@<place>`;
* `sale` carries `key` and `place` with `val`, `cur` and `oid`. The `links` report reads these names.
*/
const LINK_EVENTS = {
	click: "out",
	view: "seen",
	sale: "conv",
	key: "slug",
	place: "place"
};
/** Words that never appear in anything served to a visitor's browser by default. */
const FORBIDDEN_PUBLIC_WORDS = [
	"analytics",
	"track",
	"tracker",
	"tracking",
	"pixel",
	"telemetry",
	"collect",
	"stats",
	"beacon"
];

//#endregion
export { COMPANION_NAME, COMPANION_PUBLISHER_DID, COMPANION_SLUG, CONTRACT_VERSION, DEFAULT_COLLECT_PATH, DEFAULT_NAMESPACE, DEFAULT_SCRIPT_PATH, DEFAULT_SHARE_PATH, FORBIDDEN_PUBLIC_WORDS, HIT_RE, LINK_EVENTS, PLUGIN_ID, PRODUCT_NAME, PRODUCT_URL, RESERVED_EVENTS, ROUTES, SID_RE, VERSION, isCompanionHello };