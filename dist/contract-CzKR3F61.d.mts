/**
 * Public, versioned integration contract. Other plugins may duplicate these
 * constants instead of importing the package; changing any value is a breaking change.
 */
declare const PLUGIN_ID = "cookieless-analytics";
declare const CONTRACT_VERSION = 1;
/** Package version, equal to `package.json` (tests/package.test.ts). */
declare const VERSION = "1.3.1";
/** Product name for the admin footer and the plugin list; never served to visitors. */
declare const PRODUCT_NAME = "Cookieless Analytics by Infinitnet";
/** Website, linked from the admin footer; equal to `package.json` `homepage` (tests/package.test.ts). */
declare const PRODUCT_URL = "https://infinitnet.io/cookieless-analytics/";
/**
 * Cookieless Analytics Companion, the sandboxed setup helper in the EmDash plugin registry (docs/integration.md).
 * A registry install runs under an id derived from publisher and slug, so the admin finds it by both.
 */
declare const COMPANION_SLUG = "cookieless-analytics-companion";
declare const COMPANION_NAME = "Cookieless Analytics Companion";
/** DID of the registry publisher; equal to `publisher` in `packages/companion/emdash-plugin.jsonc`. */
declare const COMPANION_PUBLISHER_DID = "did:plc:htzvomqz4z63po3if3uejz43";
/** Body of `POST /_emdash/api/plugins/<companion id>/hello`, sent by the admin once per browser session. */
interface CompanionHello {
  v: 1;
  product: typeof PLUGIN_ID;
  /** Package version of this plugin, `x.y.z`. */
  pluginVersion: string;
  contractVersion: number;
}
/** True when `body` is exactly a `CompanionHello`: no other key, a semver `pluginVersion`, an integer `contractVersion` from 1 to 999. */
declare function isCompanionHello(body: unknown): body is CompanionHello;
/** Route names under `/_emdash/api/plugins/<PLUGIN_ID>/`. */
declare const ROUTES: {
  readonly in: "in";
  readonly session: "session";
  readonly contract: "contract";
  readonly rollup: "rollup";
  readonly shareView: "share/view";
};
declare const DEFAULT_SCRIPT_PATH = "/_/e.js";
declare const DEFAULT_COLLECT_PATH = "/_/e";
declare const DEFAULT_SHARE_PATH = "/_/s";
declare const DEFAULT_NAMESPACE = "__ec";
declare const SID_RE: RegExp;
declare const HIT_RE: RegExp;
/** Reserved auto events and the single property key each one keeps. */
declare const RESERVED_EVENTS: {
  readonly _outbound: "url";
  readonly _download: "file";
  readonly _form: "form";
};
type ReservedEventName = keyof typeof RESERVED_EVENTS;
/**
 * Links convention (docs/integration.md): event names and property keys any link plugin sends for its short
 * links. `click` carries `key` and optional `place`; `view` carries `s0` to `s9`, each `<key>` or `<key>@<place>`;
 * `sale` carries `key` and `place` with `val`, `cur` and `oid`. The `links` report reads these names.
 */
declare const LINK_EVENTS: {
  readonly click: "out";
  readonly view: "seen";
  readonly sale: "conv";
  readonly key: "slug";
  readonly place: "place";
};
/**
 * An event the page sends without a visitor action (the link impression `seen`): stored as an entry of its visit, but
 * not counted in the visit's `events`, so it neither makes a session engaged nor keeps it from being a bounce.
 */
declare const isPassiveEvent: (name: string | undefined) => boolean;
/** Words that never appear in anything served to a visitor's browser by default. */
declare const FORBIDDEN_PUBLIC_WORDS: readonly ["analytics", "track", "tracker", "tracking", "pixel", "telemetry", "collect", "stats", "beacon"];
type PropValue = string | number | boolean;
type Props = Record<string, PropValue>;
interface IngestBase {
  v: 1;
  sid?: string;
  /** Client site key; absent for the master's own pages. */
  k?: string;
  /** 1 when the sid was freshly generated on this page. */
  n?: 0 | 1;
}
interface IngestPageview extends IngestBase {
  t: "pv";
  h: string;
  u: string;
  r?: string;
  w?: number;
  /** Navigation type of the document: 0 navigate, 1 reload, 2 back_forward. First pageview of a document only. */
  nt?: 0 | 1 | 2;
}
interface IngestEngagement extends IngestBase {
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
interface IngestEvent extends IngestBase {
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
type IngestBody = IngestPageview | IngestEngagement | IngestEvent;
/** Response of `GET .../session`. */
type SessionReadResponse = {
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
} | {
  v: 1;
  sid: null;
};
/** Response of `GET .../contract`. */
interface ContractResponse {
  v: 1;
  pluginId: string;
  collectPath: string;
  scriptPath: string;
  namespace: string;
}
export { isPassiveEvent as A, RESERVED_EVENTS as C, SessionReadResponse as D, SID_RE as E, VERSION as O, Props as S, ReservedEventName as T, LINK_EVENTS as _, CompanionHello as a, PRODUCT_URL as b, DEFAULT_NAMESPACE as c, FORBIDDEN_PUBLIC_WORDS as d, HIT_RE as f, IngestPageview as g, IngestEvent as h, CONTRACT_VERSION as i, isCompanionHello as k, DEFAULT_SCRIPT_PATH as l, IngestEngagement as m, COMPANION_PUBLISHER_DID as n, ContractResponse as o, IngestBody as p, COMPANION_SLUG as r, DEFAULT_COLLECT_PATH as s, COMPANION_NAME as t, DEFAULT_SHARE_PATH as u, PLUGIN_ID as v, ROUTES as w, PropValue as x, PRODUCT_NAME as y };