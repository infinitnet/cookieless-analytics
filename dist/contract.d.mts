//#region src/contract.d.ts
/**
 * Public, versioned integration contract. Other plugins may duplicate these
 * constants instead of importing the package; changing any value is a breaking change.
 */
declare const PLUGIN_ID = "cookieless-analytics";
declare const CONTRACT_VERSION = 1;
/** Package version, equal to `package.json` (tests/package.test.ts). */
declare const VERSION = "1.0.0";
/** Product name for the admin footer and the plugin list; never served to visitors. */
declare const PRODUCT_NAME = "Cookieless Analytics by Infinitnet";
/** Website, linked from the admin footer; equal to `package.json` `homepage` (tests/package.test.ts). */
declare const PRODUCT_URL = "https://infinitnet.io/cookieless-analytics/";
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
//#endregion
export { CONTRACT_VERSION, ContractResponse, DEFAULT_COLLECT_PATH, DEFAULT_NAMESPACE, DEFAULT_SCRIPT_PATH, DEFAULT_SHARE_PATH, FORBIDDEN_PUBLIC_WORDS, HIT_RE, IngestBody, IngestEngagement, IngestEvent, IngestPageview, LINK_EVENTS, PLUGIN_ID, PRODUCT_NAME, PRODUCT_URL, PropValue, Props, RESERVED_EVENTS, ROUTES, ReservedEventName, SID_RE, SessionReadResponse, VERSION };