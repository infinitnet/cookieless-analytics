# Integration with other plugins

Other plugins and site code on the same EmDash install can use the plugin without depending on its internals. Types and constants come from `@infinitnet/cookieless-analytics/contract`; the in-process helper comes from `@infinitnet/cookieless-analytics/server`. Absence of the plugin never breaks the caller.

## Recording an event from the server: `recordEvent`

```ts
import { recordEvent } from "@infinitnet/cookieless-analytics/server";

// Inside an Astro page, endpoint or another plugin's SSR code.
const result = await recordEvent(Astro.locals, { name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001", p: { plan: "pro" } }, Astro.request);
// { ok: true } when the event was handed to the plugin, null when the plugin is not installed.
```

`recordEvent(locals, event, request)` posts one event to the plugin's `in` route through the host's public route dispatcher (`getPublicPluginApiRouteHandler(locals)`), in process, without a network call.

- `event` is the event body of the page script without `v` and `t`: `name` (required), `u` (path), `p` (properties), `val`, `cur`, `oid` (revenue, see [revenue.md](revenue.md)) and `sid` (the visit's session id, when you have it). Refunds are not taken here; they go through `agent/v1/events` ([revenue.md](revenue.md#refunds)).
- From the visitor's `request` only `user-agent`, `accept-language`, `cf-connecting-ip`, `sec-gpc`, `dnt`, `sec-ch-ua-mobile`, `sec-ch-ua-platform` (each when present) and the Cloudflare `cf` object (country and region) are copied. No cookie, `origin`, `referer` or forwarding header is sent.
- Because the post has no `Origin`, the event belongs to the local site and keeps its revenue fields even when `acceptClientRevenue` is off.
- It returns `{ ok }`, or `null` when the plugin or its route is absent. It never throws.

The client address and the privacy signals travel with the event, so an event without `sid` joins the visitor's active session through the daily visitor key, exactly as a full page load does ([sessions.md](sessions.md)), and a visitor with a privacy signal the `signals` setting honours is not recorded. The host trusts `cf-connecting-ip` only on a request that carries the `cf` object, so off Cloudflare the address is not known and events without `sid` share one daily visitor key per browser family. Pass `sid` (read from `window.__ec.sid` on the page) whenever the event must belong to one exact visit. A visitor whose page script never ran gets a session with zero page views; such sessions are stored but never count as sessions, visitors or bounces. `{ ok: true }` means the post was handed to the plugin, not that it was stored (bots and capped posts are dropped silently). A paid order reported later by a payment webhook goes through `agent/v1/events` with an API key instead ([revenue.md](revenue.md), section 3).

## The ingest contract

Everything the page script sends, and everything another sender may send, is one JSON body in contract version 1. The types are `IngestPageview`, `IngestEngagement` and `IngestEvent` in `@infinitnet/cookieless-analytics/contract`.

- Route: `POST /_emdash/api/plugins/cookieless-analytics/in`. It is public and takes a body of at most 8,192 bytes, as `text/plain` or `application/json` (so `navigator.sendBeacon` needs no preflight). Normally you reach it through the event path (`collectPath`, default `/_/e`), which the middleware forwards in process.
- Response: `204 No Content` with no body and `cache-control: no-store`, for humans, bots, dropped events and invalid bodies, so a client cannot probe the rules. The event path adds `access-control-allow-origin: *`; `OPTIONS` on it answers 204 with the usual preflight headers. A body over the size limit is refused by the host before the plugin sees it.
- A page view or an event is written before the answer: 204 means it is stored (or dropped by a rule). When the database refuses the write, the route answers `503` with `Retry-After: 5` (the event path also sends `access-control-expose-headers: retry-after`) and counts the refusal as `overload` (a database overload error, after one retry in the server) or `write_error`. Send the same body again after `Retry-After`; a `503` without `Retry-After` means do not send it again. Engagement updates are written after the answer and always get 204.
- Retries are safe: a page view is stored once per `h`, an event once per `h` (its client event id), an order once per `oid` (when the order was stored but the write to its visit failed, the retry is counted as `duplicate_order`: the revenue is kept, the visit misses that event). The page script sends page views and events with `fetch` and `keepalive` and retries a network failure or a `503` with `Retry-After` three times, after 5, 15 and 45 seconds (or `Retry-After` when it is longer), each delay lengthened at random by up to half, so pages refused at the same moment do not come back at the same moment. A retry still waiting when the visitor leaves the page is not sent. Other statuses are not retried. When the host itself answers 503 (not ready), the event path passes it on with `Retry-After: 5`. Engagement updates go by `navigator.sendBeacon` and are not retried; each one carries the page's running totals, and one is sent only when a number changed. Without `fetch` the script uses the beacon for everything.
- Bots (user agent classifier, [bots.md](bots.md)) get the 204 before the body is read, and nothing is stored.
- The server derives these itself and never trusts them from the body: the client address (used once, not stored), the user agent, the primary `Accept-Language` tag, `request.cf` country, asn and region, the `Sec-GPC` and `DNT` headers, the time and the `Origin` header.

| Field | Used by | Rule |
|---|---|---|
| `v` | all | required, the number `1` |
| `t` | all | required: `pv` (page view), `en` (engagement update), `ev` (event) |
| `sid` | all | optional, 20 characters `[a-z0-9]`; required for `en` |
| `k` | all | optional client site key, 20 characters `[a-z0-9]` ([client-sites.md](client-sites.md)); absent for the site's own pages |
| `n` | all | `1` when the `sid` was created on this page, else `0` |
| `h` | `pv`, `en`, `ev` | hit id, 12 characters `[a-z0-9]`; required for `pv` and `en`. On `ev` the client event id, new for every event and the same on every retry of it; without it every post is a new event |
| `u` | `pv`, `ev` | path and query, starts with `/`, at most 2,048 characters; required for `pv` |
| `r` | `pv` | referrer: empty or an absolute `http(s)` URL, at most 2,048 characters |
| `w` | `pv` | screen width in pixels |
| `nt` | `pv` | navigation type of the document: 0 navigate, 1 reload, 2 back or forward; first page view of a document only |
| `d` | `en` | active milliseconds, 0 up to `maxEngagedMsPerPage`; required |
| `e` | `en` | visible milliseconds, 1 up to `maxEngagedMsPerPage` |
| `s` | `en` | maximum scroll percent, 0 to 100 |
| `i` | `en` | `1` when the visitor interacted |
| `x` | `en` | exit kind of this update: 0 hidden, 1 page hide, 2 page hide with the page kept for back and forward |
| `name` | `ev` | 1 to 64 characters of `[A-Za-z0-9_.:\- ]`; required; a leading `_` is reserved |
| `p` | `ev` | at most 10 properties; key `^[A-Za-z0-9_]{1,32}$`; value a string up to 128 characters, a finite number or a boolean. Invalid entries are dropped |
| `val` | `ev` | order value, 0 to 1,000,000,000, rounded to the currency's minor unit |
| `cur` | `ev` | ISO 4217 code; without it the site's default currency is stored |
| `oid` | `ev` | order id, 1 to 64 characters of `[A-Za-z0-9_.:\-]`; a duplicate guard, never stored |

Engagement updates are cumulative: the server keeps the maximum of every field per page view, so repeated or reordered updates give the same result. An out-of-range `nt`, `e` or `x` drops that field and keeps the hit; an invalid revenue field drops `val`, `cur` and `oid` and keeps the event ([revenue.md](revenue.md)); any other invalid field drops the event.

The reserved event names are `_outbound` (property `url`), `_download` (`file`) and `_form` (`form`). Extra properties on them are dropped, and they never carry revenue fields. Any other name that starts with `_` is dropped.

**Origin rule.** Without `k`, the request must carry no `Origin` (a server sender) or an `Origin` equal to the request's own origin, and the event belongs to this install's site. With `k`, the request must carry an `https` `Origin` whose host name is registered for the site that owns the key, and that site must not be paused. Anything else is dropped and counted (`origin_rejected`, `unknown_key`, `site_paused`), still with a 204.

## Reading the current session

`GET /_emdash/api/plugins/cookieless-analytics/session` returns the first-touch facts of the visitor's active session, for example to put the campaign on a form submission. The route is public and can be called from the same origin or in process.

- With `?sid=<20 characters>` it looks up that session (also through an alias). Without it, it finds the session of the caller's daily visitor key, as an event without `sid` would.
- A bot gets `204` with no body.
- A found session answers `200`:

```json
{
  "v": 1,
  "sid": "abcdefghij0123456789",
  "started": 1790000000,
  "channel": "Organic Search",
  "source": "google",
  "utm_source": null,
  "utm_medium": null,
  "utm_campaign": null,
  "utm_term": null,
  "utm_content": null,
  "entry_path": "/blog/example",
  "country": "DE",
  "device": "desktop"
}
```

- No active session, or a caller over the rate cap, answers `{ "v": 1, "sid": null }`. The cap is 60 lookups per minute per shortened network address, per isolate.
- Only sessions of this install's own site are returned. The answer holds no raw identifier: no IP address, no user agent, no visitor key.

The type is `SessionReadResponse`.

## Detecting the plugin

Another plugin should treat this plugin as optional. Any of these works; absence must never break your plugin.

1. Your own setting that holds the plugin id (default `cookieless-analytics`).
2. `locals.emdash.getPublicPluginRouteMeta("cookieless-analytics", "/in") != null` in server code.
3. `GET /_emdash/api/plugins/cookieless-analytics/contract`, public and cached for 60 seconds:

```json
{ "v": 1, "pluginId": "cookieless-analytics", "collectPath": "/_/e", "scriptPath": "/_/e.js", "namespace": "__ec" }
```

   The type is `ContractResponse`. Use `collectPath` to post events and `namespace` to find the window API.
4. `getPluginSetting("cookieless-analytics", "collectPath")` from `emdash`.

## The window API and the DOM contract

When the page script runs, it defines `window.__ec` (the name follows the `namespace` setting; `__ec` is the default) and fires an event. If the script did nothing (a bot, a privacy signal, a blocked script), `window.__ec` does not exist: check for it.

```js
window.__ec = {
  v: 1,
  sid: "abcdefghij0123456789", // the session id of this page
  ready: true,
  event(name, props, value),   // custom event
  page(path),                  // page view for a route change
  onReady(callback),           // calls callback(api)
};
```

- `event(name, props?, value?)` sends a custom event for the current path. `props` is an object; `value` is a number (the order value in the site's default currency) or `{ value, currency?, id? }` for the order value, the ISO currency code and the order id. A name that is not a string is ignored.
- `page(path?)` sends a page view for a route change of a single page app. `path` must start with `/`; without it the current location is used. The same path as the last page view is ignored. Astro's ClientRouter needs no call: the script listens to `astro:page-load`.
- `onReady(cb)` calls `cb(api)`.
- Event `__ec:ready` (`<namespace>:ready`) is dispatched once on `window` with the API as `detail`. Code that may run after it fired should check `window.__ec` first.
- Queue: before the script has loaded, push to `window.__ecq` (`<namespace>q`). Items are functions, which get the API, or arrays of the method name and its arguments. When the script loads it replays the queue in order and replaces it with an object whose `push` runs an item at once. Errors in an item are swallowed.

```html
<script>
  window.__ecq = window.__ecq || [];
  window.__ecq.push(["event", "newsletter_signup", { form: "footer" }]);
  window.__ecq.push((ec) => console.debug("session", ec.sid));
</script>
```

```js
window.addEventListener("__ec:ready", (e) => {
  const { sid } = e.detail;
});
```

**Declarative events.** The attribute prefix derives from the namespace: `__ec` gives `data-ec-`. On any element, `data-ec-event="name"` sends that event when the element or a child is clicked.

- `data-ec-prop-<key>="value"` adds a property. Hyphens in the key become underscores, and the value is cut to 128 characters, so `data-ec-prop-plan-type="pro"` sets `plan_type`.
- `data-ec-value`, `data-ec-currency` and `data-ec-id` set `val`, `cur` and `oid`. They are read on click only; a confirmation page uses `event()`.
- `data-ec-ignore` on a link switches off its outbound and download events. On a form it switches off the form event.

```html
<button data-ec-event="signup" data-ec-prop-plan="pro">Start</button>
<button data-ec-event="purchase" data-ec-value="49.90" data-ec-currency="EUR" data-ec-id="A-1001">Buy</button>
<a href="https://example.org/partner" data-ec-ignore>Partner</a>
```

The script also sends three built-in events: `_outbound` for a click on a link to another host, `_download` for links ending in one of the `downloadExtensions`, and `_form` for a form submit. Each can be switched off in the settings.

**Short link paths.** A site that serves redirects under its own path, for example `/go/<slug>`, lists that prefix in `ignorePathPrefixes`. Links under a listed prefix get no `_download` event, and a form submit whose target is under it (the submitter's `formaction` first, then the form `action`) sends no `_form` event. The redirect itself reports the click once, server side, as an outbound link event through `recordEvent` or the `in` route. A prefix must start with `/` and must not contain a word of the neutral public footprint; anything else is dropped.

## Tying something to a visit

The page script never changes a link or the address, and no session id travels in a URL. A full page load joins the running visit through the daily visitor key; soft navigations keep the in-memory id ([sessions.md](sessions.md)).

To tie something on your server to a visit, read `window.__ec.sid` in the browser and send it with your own request, then pass it to `recordEvent` or `agent/v1/events`.

## Request-scope locals

For page requests, the middleware sets `locals.__ec` (the `namespace` setting names the key) before the page renders:

```ts
const scope = Astro.locals.__ec; // { audience: "human" | "robot", botId: string | null } | undefined
if (scope?.audience === "robot") {
  // known bot: skip your own tracking or personalisation
}
```

It comes from the synchronous user agent classification and is best effort: it is missing for requests the middleware skips (the admin, assets, previews, the plugin's own paths), so treat `undefined` as unknown. It is never a security decision.

## Links convention

A link plugin (short links under a path prefix, a redirect, an optional impression script) reports to this plugin with three event names, so its numbers appear in the Links report, the Links page, dashboards and the agent API. The names are `LINK_EVENTS` in `@infinitnet/cookieless-analytics/contract`; a plugin may copy them instead of importing the package.

| Event | Sent by | Transport | Props | Revenue |
|---|---|---|---|---|
| `out` (click) | the link plugin's server, once per answered redirect | `recordEvent` or an in-process `POST /in` without `Origin` | `slug` (required), `place` (optional) | none |
| `seen` (impression) | the link plugin's page script | `window.__ec.event("seen", { s0: "alpha-offer", s1: "beta-offer@offers-table" })` | `s0` to `s9`: up to ten link keys per event; a key is `<slug>` or `<slug>@<place>` | none |
| `conv` (sale) | a server job with an API key | `POST agent/v1/events` (`write:events`) | `slug`, `place` | `val`, `cur`, `oid` |

Rules:

- One click record per click. A short link is a same-host anchor, so the page script records no `_outbound` for it. Send `out` only for `GET` and `POST`, never for `HEAD` or a prefetch, and never await it before the redirect.
- `u` of an `out` event is the path of the page that held the link (a same-origin `Referer`); without one, leave it out.
- Session attribution (channel, source, campaign, landing page, country, device) comes from the visitor's session, which the click joins by visitor key; a click without a counted session shows as `(not set)` there. Bots and privacy signals follow the same rules as page views.
- Goal convention: one goal `Link clicks` of type `event`, match `is`, value `out`; a per-link goal adds `props: { slug: "<slug>" }`. The built-in "Links" dashboard template creates the `Link clicks` goal on import. Never define a goal on `_form` or `_outbound` for short links.
- Set `ignorePathPrefixes` to the short link prefix (for example `/go/`), so the page script records no `_download` or `_form` for them ([settings.md](settings.md)).

The `links` report (scope `read:analytics`, tile kinds `bars` and `table`) answers per key: `impressions` (link keys of `seen` events), `clicks` (`out` events), `ctr` (clicks / impressions from the sums, 0 without impressions), `sessions` (distinct sessions with a click) and `conversions` (`conv` events). `params.by` is `link` (default), `place`, `page`, `channel`, `source`, `campaign`, `entry`, `country` or `device`; `params.slug` narrows to one link. A key without a placement counts under `(none)`. With `params.withRevenue` the rows add `revenue` and `revenue_currency` in one currency (`params.currency`, default the site's), and `data.currencies` lists every currency of the `conv` events; amounts of two currencies are never added. A range that starts before the raw window (`rawRetentionDays`) reads the daily link summaries (notices `summary` and `detail_from:<day>`), as does a range inside it whose stored days hold more visits than the scan budget when every filter applies ([filters.md](filters.md#filters-on-summary-data)): by link (all links, one link, or one filter on channel, country or device: the daily cube of channel, country and device does not hold links, so a second of them is `filter_unavailable:<dim>:combination`, and link revenue then answers `revenue_not_available`) and by place; other breakdowns answer `raw_only` before the window, other filters are named in `filter_unavailable:<dim>:<reason>`, and each day keeps its top 200 links and places (the rest is `(other)`).

## What the contract module exports

`@infinitnet/cookieless-analytics/contract` holds only constants and types, so another plugin may also copy them. Changing a value is a breaking change.

- Constants: `PLUGIN_ID`, `CONTRACT_VERSION` (1), `VERSION`, `PRODUCT_NAME`, `PRODUCT_URL`, `ROUTES`, `DEFAULT_SCRIPT_PATH`, `DEFAULT_COLLECT_PATH`, `DEFAULT_SHARE_PATH`, `DEFAULT_NAMESPACE`, `SID_RE`, `HIT_RE`, `RESERVED_EVENTS`, `LINK_EVENTS`, `FORBIDDEN_PUBLIC_WORDS`.
- Types: `IngestBody`, `IngestPageview`, `IngestEngagement`, `IngestEvent`, `PropValue`, `Props`, `ReservedEventName`, `SessionReadResponse`, `ContractResponse`.

`@infinitnet/cookieless-analytics/server` exports `recordEvent` and the type `ServerEvent`.

## Related

[sessions.md](sessions.md), [bots.md](bots.md), [privacy.md](privacy.md), [revenue.md](revenue.md), [client-sites.md](client-sites.md), [AGENTS.md](AGENTS.md), [openapi.json](openapi.json).
