# Events

This page lists every kind of event the plugin records, the ways to send each one, and the report where it shows up. Use it as the reference when you add events to a site, a theme, another plugin or a backend.

## How to use it

1. Find the event you need in "What gets recorded" below.
2. Pick a way of sending it: HTML data attributes, the window API, another EmDash plugin (`recordEvent`), your server (the agent events route), or a site on another CMS.
3. Copy the example, change the name, properties and amounts.
4. Check the result on the Behavior page (Events tab) or in the report named in the table at the end.

## What gets recorded

| Event | Name as stored | Sent by | Turned on by |
|---|---|---|---|
| Page view | (page view, no name) | page script on load, on `astro:page-load`, on `page()` | the script tag (`injectScript`) |
| Engagement update | (update of a page view) | page script when the tab is hidden or the page is left | always with the script |
| Outbound link click | `_outbound`, property `url` (host and path) | page script, click on a link to another host | `autoOutbound` |
| Download click | `_download`, property `file` (path) | page script, link ending in one of the `downloadExtensions` | `autoDownloads` |
| Form submit | `_form`, property `form` (form id, name or target path) | page script | `autoForms` |
| Custom event | your name, for example `signup` | data attributes, window API, `recordEvent`, agent route | always |
| Link rule click | the rule's event name, property `slug` | page script, click on a link a rule matches | `linkRules` |
| Revenue event (order) | your name, for example `purchase`, with `val`, `cur`, `oid` | the same four ways | `acceptClientRevenue` for browsers |
| Refund | booked against a stored order | agent route only | always |
| Link click, impression, sale | `out`, `seen`, `conv` (the Links convention) | link redirect, impression script, server job | see [Links report](Links-Report) |
| Error page | (counter per day, status, path, referrer) | the middleware, server side | `logErrorPages` |
| Site search | (query parameter kept on the page view) | page view, nothing extra to send | `siteSearchParams` |

The three automatic events keep only their one property; extra properties are dropped and they never carry revenue. Any other name that starts with `_` is dropped. Add `data-ec-ignore` to a link to switch off its `_outbound` and `_download` event, or to a form to switch off its `_form` event. Links and form targets under a prefix in `ignorePathPrefixes` get no `_download`, `_form` or link rule event. A click that a link rule matches gets the rule's event instead of `_outbound` or `_download` (see Link rules below).
### What counts as a form submit

Cookieless Analytics by Infinitnet sends `_form` when the browser fires its native `submit` event on a form. The event means the visitor submitted the form, not that the submission succeeded.

The label is the form's `id`, else its `name`, else its target path, up to 128 characters. The submit button's `formaction` wins over the form's `action`.

Some submits never fire the event, so they send no `_form`:

- forms sent with `fetch` or XHR from a click handler, which many form builders and single page apps use,
- a script that calls `form.submit()`,
- a submit that the browser blocks because validation failed.

To record a real success for those forms, call `window.__ec.event("signup")` after your own success check. A goal on the event `_form` can match the form label, and `data-ec-ignore` on a form switches its `_form` event off.


Error pages are human requests that end with status 400 or above, recorded by the server that serves the page. They appear on the Pages page, Not found tab. A client site sends page views only, so it has no error pages.

Site search terms are the values of the query parameters named in `siteSearchParams`, kept on page views. See [Content and site search](Content-and-Site-Search).

## 1. Data attributes in HTML

The attribute prefix comes from the `namespace` setting: the default `__ec` gives `data-ec-`. A click on the element (or a child) sends the event.

```html
<button data-ec-event="signup" data-ec-prop-plan="pro" data-ec-prop-plan-type="yearly">Start</button>
<button data-ec-event="purchase" data-ec-value="49.90" data-ec-currency="EUR" data-ec-id="A-1001">Buy</button>
<a href="https://partner.example.com/offer" data-ec-ignore>Partner</a>
<form id="newsletter" action="/subscribe" data-ec-ignore>...</form>
```

- `data-ec-event="name"`: the event name.
- `data-ec-prop-<key>="value"`: one property. Hyphens in the key become underscores (`plan-type` becomes `plan_type`), the value is cut to 128 characters.
- `data-ec-value`, `data-ec-currency`, `data-ec-id`: order value, currency and order id. Read on click only, so a confirmation page uses the window API.
- `data-ec-ignore`: no automatic event for this link or form.

## 2. The window API

When the script runs it defines `window.__ec` and dispatches `__ec:ready` on `window`. If the script did nothing (a bot, a blocked script), `window.__ec` does not exist, so check for it. With the visitor's opt-out flag or an honored privacy signal it exists, `window.__ec.off` is `true` and its calls do nothing.

```js
// event(name, props?, value?)
window.__ec && window.__ec.event("signup", { plan: "pro" });

// Order in the site's default currency (number form)
window.__ec && window.__ec.event("purchase", {}, 49.9);

// Order with currency and order id (object form)
window.__ec && window.__ec.event("purchase", { plan: "pro" }, { value: 49.9, currency: "EUR", id: "A-1001" });

// Page view after a client side route change (single page apps; Astro's ClientRouter needs nothing)
window.__ec && window.__ec.page("/checkout/step-2");

// Session id of this page, to tie a server side order to the visit
const sid = window.__ec && window.__ec.sid;

// True while this page sends nothing (opt-out flag or an honored privacy signal); read only, browser only
const off = window.__ec && window.__ec.off;
```

`off` and the opt-out flag exist in the browser only. A server that reports orders learns the state only from what its own page code sends along, for example in a form field next to the `sid`.

Calls made before the script loads go into the queue `window.__ecq` and are replayed in order:

```html
<script>
  window.__ecq = window.__ecq || [];
  window.__ecq.push(["event", "newsletter_signup", { form: "footer" }]);
  window.__ecq.push(["event", "purchase", {}, { value: 49.9, currency: "EUR", id: "A-1001" }]);
  window.__ecq.push((ec) => console.debug("session", ec.sid));
</script>
```

The script checks types only (the currency is cut to 3 characters, the id to 64). The server validates everything.

## 3. From your server: the agent events route

`POST /_emdash/api/plugins/cookieless-analytics/agent/v1/events`, with an API key that has the scope `write:events` (Definitions, API keys). Send 1 to 20 events per call. Use it for amounts you must trust, payment webhooks and refunds.

```sh
curl -X POST "https://example.com/_emdash/api/plugins/cookieless-analytics/agent/v1/events" \
  -H "X-Api-Key: $KEY" -H "content-type: application/json" \
  -d '{"events":[{"name":"purchase","val":49.9,"cur":"EUR","oid":"A-1001","sid":"k3j9x0a1b2c3d4e5f6g7","p":{"plan":"pro"}}]}'
```

Fields per event: `name` (required), `val`, `cur`, `oid`, `sid` (the page's `window.__ec.sid`), `ts` (epoch seconds, 30 days back to 60 seconds ahead, and not before the first day of the detailed data window), `u` (path), `p` (properties). Add `"site": "<id>"` at the top level for a client site. A refund is `{ "name": "purchase", "oid": "A-1001", "rid": "RF-7", "refund": 20 }`; see [Revenue and refunds](Revenue-and-Refunds).

The answer is `{ "ok": true, "data": { "accepted", "duplicates", "rejected": [{ "index", "reason" }] }, "meta": ... }`. Invalid items are listed by index; the others are stored. More on keys: [Agent API and MCP](Agent-API-and-MCP).

## 4. From another EmDash plugin: `recordEvent`

```ts
import { recordEvent } from "@infinitnet/cookieless-analytics/server";

// In an Astro page, an endpoint or another plugin's SSR code.
const result = await recordEvent(Astro.locals, { name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001", p: { plan: "pro" } }, Astro.request);
// { ok: true } when handed to the plugin, null when the plugin is not installed. It never throws.
```

The event body is `name`, `u`, `p`, `val`, `cur`, `oid` and `sid`. It runs in process, without `Origin`, so it keeps its revenue fields even with `acceptClientRevenue` off. Pass `sid` when the event must belong to one exact visit. Refunds are not taken here.

## 5. From WordPress or another CMS

Register the site on Definitions, Sites ([Multi-site and Sites view](Multi-Site-and-Sites-View)), then add the script tag with its key to the `<head>` of every page. In a WordPress theme, print it from the `wp_head` action.

```html
<script defer src="https://example.com/_/e.js" data-ec-key="abcdefghij0123456789"></script>
```

Data attributes and the window API then work exactly as above:

```html
<a href="/pricing" data-ec-event="pricing_click" data-ec-prop-place="header">Pricing</a>
<script>
  window.__ecq = window.__ecq || [];
  window.__ecq.push(["event", "purchase", {}, { value: 49.9, currency: "EUR", id: "A-1001" }]);
</script>
```

From the CMS server, post to the agent route with the client site's id (leave `site` out for a linked host):

```php
$response = wp_remote_post('https://example.com/_emdash/api/plugins/cookieless-analytics/agent/v1/events', [
  'headers' => ['X-Api-Key' => getenv('EVENTS_KEY'), 'Content-Type' => 'application/json'],
  'body'    => wp_json_encode(['site' => 'blog', 'events' => [
    ['name' => 'purchase', 'val' => 49.9, 'cur' => 'EUR', 'oid' => 'A-1001'],
  ]]),
  'timeout' => 10,
]);
```

```sh
curl -X POST "https://example.com/_emdash/api/plugins/cookieless-analytics/agent/v1/events" \
  -H "X-Api-Key: $KEY" -H "content-type: application/json" \
  -d '{"site":"blog","events":[{"name":"signup","p":{"plan":"pro"}}]}'
```

## Link rules

The `linkRules` setting (Settings, Page script) records clicks on chosen links without touching the HTML: your own `/go/` redirects, sponsor links, `mailto:` and `tel:` links, social profiles. One rule per line: a pattern, an event name and an optional label.

```
/go/ out
~^/recommends/([^/]+) out
shop.example.net/ shop_click
ads.example.com/ -
mailto: contact email
tel: contact phone
~^(?:www\.)?(instagram|facebook|linkedin)\.com/ social
```

- Pattern: the start of what the link points to, or `~` followed by a regular expression (case insensitive). A link to your own host is matched by its path (`/go/alpha-offer`), a link to another host by host and path (`shop.example.net/p/42`), anything else by the link without its query (`mailto:hello@example.org`). The query and the fragment are never read.
- Event: any event name, or `-` to send nothing. A rule with `out` feeds the [Links report](Links-Report).
- Label: sent as the `slug` property. Without a label the slug is the rest of the link after the prefix (one trailing slash removed), or the first group of the regular expression, or its whole match. Give `mailto:` and `tel:` rules a label, so the address itself is not stored.

Which click does what, in this order:

1. `data-ec-ignore` on the link: nothing is sent.
2. The click hit an element with `data-ec-event`: that event is sent and no rule applies; the automatic events work as before.
3. A link to your own host under a prefix of `ignorePathPrefixes`: no rule applies (the redirect reports its own click).
4. The rules, in order. **The first rule that matches sends its one event and stops: that click gets no `_outbound` and no `_download`.** A rule on another host therefore stops its `_outbound` clicks, and an `outbound` goal on that host stops counting them.
5. No rule matched: `_outbound` and `_download` as without rules.

A rule with `-` is a deny list for outbound clicks. A rule on a linked host records clicks to it, which are otherwise not outbound. At most 20 rules and 2,048 characters together; a pattern is at most 200 characters, a label 1 to 64 characters without spaces, and a regular expression must be a safe pattern (no backreferences, lookarounds or nested quantifiers). The event names `seen` and `conv` and names that start with `_` are refused. The rules are served to every page, so a rule containing a word of the neutral public footprint is refused, as is a pattern under a prefix of `ignorePathPrefixes`. Settings, Page script has a "Test a link" field under the rules that shows which rule a link matches.

## Properties and names

- Name: 1 to 64 characters of letters, digits, `_`, `.`, `:`, `-` and space. A leading `_` is reserved.
- Properties: at most 10 per event. Key: 1 to 32 characters of letters, digits and `_`. Value: a string up to 128 characters, a finite number or a boolean. Invalid entries are dropped, the event stays.
- `val`: 0 to 1,000,000,000, rounded to the currency's minor unit. `cur`: an ISO 4217 code, absent means `defaultCurrency`. `oid`: 1 to 64 characters of letters, digits, `_`, `.`, `:`, `-`, never stored.
- An invalid `val`, `cur` or `oid` drops all three and keeps the event.
- The ingest body is at most 8,192 bytes. `u` (path) is at most 2,048 characters.

## Deduplication

- Client event id `h`: the page script gives every event a new 12 character id and keeps it on retries, so an event is stored once however often it is sent. A sender without `h` stores every post as a new event.
- Order id `oid`: one order is stored once per site, event name and order id. A reloaded thank-you page stores one row. A browser or `recordEvent` post of a stored order is dropped; the agent route replaces the amount (your server has the last word).
- Page views: a reload of the same path within `reloadDedupeSeconds` is not counted again. A page view is stored once per hit id.

## Settings

| Key | Default | What it does |
|---|---|---|
| `autoOutbound` | `true` | Sends `_outbound` for clicks to other hosts. |
| `autoDownloads` | `true` | Sends `_download` for download links. |
| `downloadExtensions` | `pdf,zip,docx,xlsx,pptx,csv,mp3,mp4,dmg,exe` | Extensions treated as downloads. |
| `autoForms` | `true` | Sends `_form` for form submits. |
| `ignorePathPrefixes` | empty | Short link prefixes: no `_download`, `_form` or link rule under them. |
| `linkRules` | empty | Link clicks to record as named events. A matched rule sends its one event and stops: no `_outbound` or `_download` for that click. |
| `logErrorPages` | `true` | Records human requests with status 400 or above. |
| `siteSearchParams` | empty | Query parameters kept as site search terms. |
| `namespace` | `__ec` | Window API name; also derives the `data-ec-` prefix. |
| `collectPath` | `/_/e` | Public path that receives events. |
| `acceptClientRevenue` | `true` | When off, browser posts lose `val`, `cur` and `oid`. |
| `defaultCurrency` | `USD` | Currency stored when an event names none. |
| `reloadDedupeSeconds` | `2` | Reload window for page views. |
| `maxEventsPerSession` | `200` | Further events of the session are dropped. |
| `maxEventsPerSidPerMinute` | `60` | Rate cap per session id. |
| `maxEventsPerVkeyPerMinute` | `300` | Rate cap per daily visitor key. |
| `maxPageviewsPerSession` | `500` | Further page views of the session are dropped. |

## Limits

- Agent route: 1 to 20 events per call, `agentRateLimitPerMinute` requests per minute per key (default 60). The browser caps above do not apply to it.
- Browser and `recordEvent` posts: the three rate caps above. An order is stored, and counted as an event of its visit, even when the visit has reached `maxEventsPerSession`.
- Agent `sid`: attaches only to a visit that started at most 7 days ago.
- A server proxy of a client site: `proxyRateLimitPerMinute` posts per minute and site (default 3000); above it the proxy gets 503 with `Retry-After` ([Multi-Site-and-Sites-View](Multi-Site-and-Sites-View)).

## What shows up in which report

| Event | Behavior tabs | Other places | Agent API report |
|---|---|---|---|
| Custom event, link rule click | Events (with Properties), Goals for event goals | Dashboards, segments and filters on event | `events`, `event_props`, `goals` |
| `_outbound` | Outbound, Goals for outbound goals | Dashboards | `outbound` |
| `_download` | Downloads | Dashboards | `downloads` |
| `_form` | Forms | Dashboards | `forms` |
| Revenue event and refund | Revenue, Goals (revenue column) | Overview revenue strip, Revenue columns on Sources, Pages, Audience | `revenue`, `revenue_series`, `revenue_breakdown` |
| `out`, `seen`, `conv` | Events | Links page, Links dashboard template | `links` |
| Error page | none (Pages, Not found tab) | Dashboards | `not_found` |
| Site search | Site search | Dashboards | `site_search` |

## Gotchas

- An event sent by your server without `sid` appears in the revenue reports and in `links` only, with `(not set)` for channel, source and the other session fields. On the agent route a `sid` that is unknown or belongs to a visit older than 7 days is rejected as `invalid_sid`.
- `{ ok: true }` from `recordEvent` and a 204 from the event path mean "handed over", not "stored": bots, privacy signals and capped posts are dropped silently.
- Use one event name per order across the browser and your server: the name is part of the order's identity.
- A confirmation page has nothing to click, so data attributes cannot send its order. Use `event()` or your server.
- A different `namespace` changes the window name, the queue and the attribute prefix together.

## Related

[Revenue and refunds](Revenue-and-Refunds), [Goals and funnels](Goals-and-Funnels), [Links report](Links-Report), [Agent API and MCP](Agent-API-and-MCP), [Content and site search](Content-and-Site-Search), [How visits are counted](How-Visits-Are-Counted), [Bot handling](Bot-Handling), [Settings reference](Settings-Reference). Full reference: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/integration.md
