# Revenue on events

Wiki: [Revenue and Refunds](https://github.com/infinitnet/cookieless-analytics/wiki/Revenue-and-Refunds).

Recording (sections 1 to 4), then the reports and every surface that shows revenue (sections 5 to 11).

An event can carry an order value, an ISO 4217 currency code and an order id. Values are stored with the currency they were recorded in, and money of two currencies is never added, averaged or ranked together anywhere: every revenue figure is in one currency (one currency per report, no silent sums), and the other currencies are listed next to it. There are no exchange rates.

## 1. Fields and validation

| Field | Rule |
|---|---|
| `val` | A finite number from 0 to 1,000,000,000, rounded half away from zero to the currency's minor unit (2 digits for most codes, 0 for JPY, KRW, CLP and a few others, 3 for BHD, KWD, OMR and a few others). Negative values are not accepted; a refund is its own item on the server route (section 4). `0` is an order of zero, for example a free item. |
| `cur` | Three letters, case-insensitive, on the embedded ISO 4217 list. Absent means the site's default currency (setting `defaultCurrency`, default `USD`), stored on the row at write time. |
| `oid` | 1 to 64 characters of `A-Z a-z 0-9 _ . : -`: your order or transaction id. It is never stored. It only decides the row id, so one order is stored once. |

An invalid `val`, `cur` or `oid` drops all three fields and keeps the event; the drop is counted as `revenue_invalid` in the privacy receipt. An invalid currency never falls back to the default, because that would label money with the wrong unit. `cur` and `oid` without `val` are ignored. Built-in events whose names start with `_` never carry revenue.

Changing `defaultCurrency` later only affects new events and the currency a report shows when none is chosen. Recorded rows keep their code.

## 2. From the page

```js
// Number form: the site's default currency.
window.__ec.event("purchase", {}, 49.9);
// Object form: value, currency and order id.
window.__ec.event("purchase", { plan: "pro" }, { value: 49.9, currency: "EUR", id: "A-1001" });
```

`__ec` is the default `namespace` setting. Calls made before the script loads go into `window.__ecq` (`window.__ecq.push(["event", "purchase", {}, { value: 49.9 }])`) and are replayed with the same arguments. The script checks types only (a value that is not a number sends no value; the currency is cut to 3 characters and the id to 64); the server validates.

Declarative form, read on click only:

```html
<button data-ec-event="purchase" data-ec-value="49.90" data-ec-currency="EUR" data-ec-id="A-1001">Buy</button>
```

A purchase confirmation page uses the JavaScript form, because nothing is clicked there.

Browser revenue is unauthenticated: anyone who can run script on a page can post any value. Two controls exist:

- `acceptClientRevenue` (default on). When off, `val`, `cur` and `oid` are dropped from every request that carries an `Origin` header, which is every browser post, and the drop is counted as `revenue_not_accepted`. Requests without `Origin` (server to server) still record them. This stops casual console spoofing; it is not authentication, because a script outside a browser can leave `Origin` out.
- The agent events route below, which needs an API key. Use it for amounts you must trust.

## 3. From your server: `POST agent/v1/events`

Create an API key with the scope `write:events` (Definitions, API keys). The route takes 1 to 20 events per call:

```sh
curl -X POST "https://example.com/_emdash/api/plugins/cookieless-analytics/agent/v1/events" \
  -H "X-Api-Key: $KEY" -H "content-type: application/json" \
  -d '{"events":[{"name":"purchase","val":49.9,"cur":"EUR","oid":"A-1001","sid":"k3j9x0a1b2c3d4e5f6g7","p":{"plan":"pro"}}]}'
```

Per event: `name` (required), `val`, `cur`, `oid` as above, `sid` (optional, see below), `ts` (epoch seconds from 30 days ago to 60 seconds ahead, and after the first day of the raw window, because older rows are deleted before any rollup sees them; absent means now), `u` (a path; absent means the session's last page), `p` (properties, at most 10). Add `"site": "<id>"` for a client site. The answer is `{ ok: true, data: { accepted, duplicates, rejected }, meta }`; `rejected` lists `{ index, reason }` with the reasons `invalid_name`, `reserved_name`, `invalid_value`, `invalid_currency`, `invalid_id`, `invalid_ts`, `invalid_sid`, `invalid_path`, `unknown_order`, `refund_exceeds_order` and `currency_mismatch`, and the other events are stored. A body that is not an object with an `events` array of 1 to 20 items answers `400 invalid_body`.

### Attributing an order to the visit

Revenue belongs to the session of its event. To attribute a server-side order to the visit that placed it, read `window.__ec.sid` at checkout, send it with the order metadata to your payment provider, and pass it back from your webhook:

```js
// Checkout page: keep the session id with the order.
const sid = window.__ec && window.__ec.sid;
await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ cart, metadata: { visit: sid } }) });
```

```js
// Webhook handler on your server, after verifying the payment provider's signature.
export async function onOrderPaid(order) {
	await fetch("https://example.com/_emdash/api/plugins/cookieless-analytics/agent/v1/events", {
		method: "POST",
		headers: { "X-Api-Key": process.env.EVENTS_KEY, "content-type": "application/json" },
		body: JSON.stringify({
			events: [{ name: "purchase", val: order.total, cur: order.currency, oid: order.id, ...(order.metadata.visit ? { sid: order.metadata.visit } : {}) }],
		}),
	});
}
```

The `sid` is a random id that lives only in the open page. It is not an identifier of a person and it is not stored in the browser. Keep it on your server only until the callback is sent, then drop it from the order: stored next to an order, it links that purchase to the pages of the session in your own records. This plugin stores no order id and no buyer data; the privacy receipt says the same. With a `sid`, the event attaches to that session of the site when the session started at most 7 days ago, even after the session window ended (the one exception to the window rule, for this authenticated route only; the page script never reopens a closed session): the session's `events` count rises, and its last activity, last page and duration stay as they were, so a late webhook does not change engagement. An unknown `sid`, one of another site, or one of a session older than 7 days is rejected as `invalid_sid`, so a typo never produces unattributed revenue silently. Such an event is not stored: a webhook that sends a late order (a paid invoice, a renewal) with the stored `sid` must read `data.rejected` and send each `invalid_sid` event again without `sid`, or that order is lost. Without `sid` the event is stored unattributed and shows as `(not set)` in breakdowns.

The key's site restriction and rate limit apply. The browser caps (events per session per minute, bot rules, privacy signals) do not, because the caller is your own backend. You are responsible for what you send: send amounts and order ids only, never names, emails or payment data.

### From another plugin, in process

A plugin or site code on the same EmDash install calls `recordEvent(locals, { name, val, cur, oid, p }, request)` from `@infinitnet/cookieless-analytics/server` ([integration.md](integration.md)). It posts the page script's body to the event route without an `Origin` header, so the event belongs to the local site and keeps its revenue fields even when `acceptClientRevenue` is off. It returns `{ ok }`, or `null` when the plugin is absent.

## 4. One order, one row

With an `oid`, the row id is derived from a one-way hash of the site, the event name and the order id. A reloaded thank-you page or a retried browser post therefore stores one row and raises the session's event count once; the repeats are counted as `duplicate_order` and write nothing. An order is stored, and counted as an event of its visit, even when the visit has reached `maxEventsPerSession`. The same order id under another event name or for another site is another order. Order ids are not stored anywhere; because they are often guessable, the hash is not treated as a secret either. Use one event name per order across the browser and your server: the name is part of the id.

Your server has the last word. A post through `agent/v1/events` with an order id that is already stored, whoever wrote it first, replaces the amount and the currency of that row; its time, day, page and name stay, and an unattributed row takes the `sid` of the post. The repeat counts in `duplicates`. A browser or in-process post of an existing order id is dropped and never changes the row, so a guessed order id posted from a console cannot block or overwrite the real order.

### Refunds

A refund is its own item, sent by your server through `agent/v1/events`:

```json
{ "name": "purchase", "oid": "A-1001", "rid": "RF-7", "refund": 20, "ts": 1773403200 }
```

| Field | Rule |
|---|---|
| `name`, `oid` | The event name and order id of the stored order (the same pair that identifies it). |
| `rid` | Your refund id, 1 to 64 characters of `A-Z a-z 0-9 _ . : -`, required. One refund is stored once per order and refund id: a retry writes nothing and counts in `duplicates`. Never stored. |
| `refund` | The refunded amount, above 0, rounded to the order's currency. |
| `cur` | Optional; when present it must be the order's currency, else `currency_mismatch`. |
| `ts` | Optional, as for any item; the refund's own time. A refund dated before its order is `invalid_ts`. |

`sid`, `u` and `p` are not read: a refund takes everything else from its order. It is stored as one row with the order's visit, page, event name and currency and the negative amount, on the refund's own day, so it carries the original channel, source, campaign, entry page, page, country and device. It writes 2 rows (the row and its day index) and never touches the visit: page views, events, orders, paying sessions and conversions stay as they were.

- Partial refunds add up. A refund that would take the refunded total of an order above its amount is rejected as `refund_exceeds_order`, so is any refund of a voided order. A full refund is a refund of the whole amount.
- A refund for an order id that is not stored is rejected as `unknown_order`. There is no fallback to an unattributed refund: an unknown order id is far more often a typo, another event name or an order of another site than a real refund, and a refund stored against Direct would lower the wrong channel's figures. The order must be stored first (in an earlier call), and inside the raw window.
- Only this authenticated route takes refunds. The page script and in-process posts cannot refund, for the same reason they cannot change a stored order: a guessed order id posted from a console must not lower real revenue.
- Refunds on a closed day (a `ts` in the past) are caught by the `revenue` task like any late order (section 10).

Corrections and voids stay as before. A correction reposts the order id with a new amount and replaces the order's amount (its gross value); refunds already booked stay, and later refunds are limited by the new amount. A void is the item `{ "name": "purchase", "oid": "A-1001", "void": true }` without `val`: the order's value and currency become empty, the event stays, the order and its revenue are gone, and its refunds are voided with it. A void of an order id that is not stored is rejected as `unknown_order`. Corrections and voids restate the order's own day, not the day they are sent, and work only while the order is inside the raw window. An order older than the raw window cannot be corrected, voided or refunded: its raw row is already gone, and a repost without `ts` would record a new order today, so do not repost it. The summary figures of past days stay as they were.

## 5. Reports

Every revenue report works in one currency: `params.currency` (an ISO 4217 code, any case), default the site's `defaultCurrency`. Every result also carries `data.currencies`, one entry per currency with orders in the range (`currency`, `revenue`, `orders`, `aov`, `revenue_per_visitor`, `paying_sessions`), the selected currency first, so a currency you did not select never disappears silently. An unknown code answers `invalid_currency`.

- `revenue`: `data.totals { revenue, orders, aov, revenue_per_visitor, revenue_per_session, paying_sessions, visitors, sessions }` in the selected currency, `data.currencies`, `data.hasRevenue` (any revenue row of the site in the raw window or in the daily summary) and `data.rows`, the currency list, so an export lists every currency with its code.
- `revenue_series`: `data.series [{ t, revenue, orders, aov }]`, zero filled, at the granularity of the `timeseries` report (hourly only inside the raw window), with annotations.
- `revenue_breakdown` with `params.dim` one of `channel`, `source`, `campaign` (the `utm_campaign` field), `entry`, `page`, `country`, `device`, `goal`, `event`: rows `{ key, revenue, orders, aov, revenue_per_visitor, visitors, sessions, currency }` ranked by revenue, then orders, then key, plus `data.other_currencies` (codes with orders that the rows do not show). Keys with visitors and no revenue show 0. An unknown `dim` answers `invalid_params`.
- `withRevenue: true` on `channels`, `sources`, `campaigns` (UTM field `campaign` only; other fields carry the notice `revenue_not_available`), `pages`, `entry_pages`, `countries`, `devices`, `events` and `goals` adds `revenue`, `orders` and `revenue_currency` to every row. A key that only has revenue (for example `(not set)`) is added with `visitors` and `sessions` null when the table is complete.
- `withRevenue: true` on `funnels` adds, per step, the revenue of the sessions that reached the step: every order and refund in the range of those sessions (each on its own day), whether the order came before or after the step. A session that reached step 2 adds its whole revenue in the range to steps 1 and 2 and nothing to step 3. Per step: `revenue`, `orders`, `aov`, `paying_sessions`, `revenue_per_session` (revenue / the sessions that reached the step) and `revenue_currency`, plus `refunds` and `net_revenue` when one of those sessions has a refund. `est_lost_revenue` is an estimate, not a measured amount: from step 2 on, the sessions that left before the step times the revenue per session of the sessions that reached the last step (null at step 1 and when no session reached the last step). `data.currency`, `data.currencies` and `data.other_currencies` cover the sessions that reached step 1. Without an order or refund in the range the revenue keys are absent. Funnels read detailed rows only, so their revenue covers the detailed window (`raw_only` before it).
- Goals: an event goal's revenue is the sum of the values of its matching events; a purchase that matches two goals counts in both rows. Page and outbound goals have no revenue (null).
- `impact` accepts `params.report: "revenue"` with the metrics `revenue`, `orders`, `aov`, `revenue_per_visitor`, `revenue_per_session` and `params.currency`; `notable` applies to `orders` only, the money metrics carry their denominators in `measured`.
- `revenue_orders`: the newest orders and refunds of the range in the selected currency, at most 50, newest first: rows `{ key, day, amount, refund, channel, entry, country }`. `key` is the stored order reference (derived from the order id, which is never stored, or the event's own id), `amount` is negative for a refund, and `channel`, `entry` and `country` are the first touch of the order's visit (`(not set)` without one). No session or visitor key is returned. It reads detailed rows only: a range that starts before the detailed window answers `raw_only` with the first detailed day, it is not held to the scan budget (it reads at most 51 order rows), a comparison is ignored (a segment comparison answers `compare_not_supported`), and it is not a dashboard tile, so single orders never reach a shared page or an email.
- Compare previous and year work on `revenue`, `revenue_series` and `revenue_breakdown`.

Every revenue report also carries `refunds` (the refunds booked in the range, by the refund's own day) and `net_revenue` (`revenue - refunds`): in `totals`, in each `data.currencies` entry, in each `revenue_series` point, in each `revenue_breakdown` row and in the `withRevenue` columns. `revenue` is gross, the order values before refunds, so a refund never changes `revenue`, `orders`, `aov` or `paying_sessions`. A refund counts where its order counts (the order's session, page and event), on its own day; a day or key with refunds and no orders shows a negative net. The `revenue` filter compares orders only.

Definitions: an order is one event with a value (a value of 0 is an order of zero). `aov` is revenue / orders. `revenue_per_visitor` is revenue / visitors, where visitors is the Overview figure for the same filters and range: all visitors, not only buyers, and the same divisor for every currency. `revenue_per_session` is revenue / sessions; `paying_sessions` counts sessions with at least one order in the currency. Sums are rounded to the currency's minor unit, so 1,000 orders of 0.10 are exactly 100.00.

Attribution: revenue belongs to the session of its event: per channel, source, campaign, country and device it follows the session's first touch, per entry page the session's entry, per page the page the event fired on. An event without a session (sent by your server without `sid`, or whose session was purged) and an event of a session without page views count in the totals under `(not set)` and are left out as soon as a session filter is active.

## 6. One currency at a time, a worked example

A shop records in one week 3 orders of 40.00 USD, 1 order of 120.00 EUR and 1 order of 9,800 JPY, from 50 visitors. With `defaultCurrency` USD the Revenue page shows revenue `120.00 USD`, 3 orders, average order value `40.00 USD`, revenue per visitor `2.40 USD`, and under it "Other currencies: 120.00 EUR (1 order), 9,800 JPY (1 order)." Clicking EUR shows revenue `120.00 EUR`, 1 order and revenue per visitor `2.40 EUR` (the same 50 visitors). No figure anywhere is 120 + 120 + 9,800. Every amount is printed with its code after it, digits grouped, the currency's minor unit digits and no symbol (`1,234.50 USD`, `9,800 JPY`), so a screenshot, a CSV and a shared page read the same.

## 7. Filters and segments

- `currency` with `is` or `is_not`: sessions with at least one order in that currency.
- `revenue` with `gt`, `gte`, `lt` or `lte` and one amount (`50`, `49.90`, at most three decimals), `prop` the currency (absent: the site's default currency when the report runs, so a segment works on sites with different defaults). It compares the session's summed revenue in that currency. `lt` and `lte` include sessions without orders when the amount is above zero: "sessions that spent less than 50 USD, including none". These four operators are valid on `revenue` only; anywhere else they answer `invalid_filter`.
- Both read detailed rows, so they work inside the raw window only. On summary data they are not applied and the answer carries `filter_unavailable:currency:not_kept` or `filter_unavailable:revenue:not_kept` ([filters.md](filters.md#filters-on-summary-data)).
- Segments store them unchanged, so "buyers" (`revenue gte 0`), "buyers in EUR" (`currency is EUR`) and "sessions with 100 or more" are segments. The filter bar offers them as "Revenue at least" and "Currency".

## 8. Dashboards and shared pages

Tile reports: `revenue` (kind `kpi`, metrics `revenue`, `orders`, `aov`, `revenue_per_visitor`, `revenue_per_session`, `paying_sessions`), `revenue_series` (`line`, `area`; `revenue`, `orders`, `aov`), `revenue_breakdown` (`bars`, `donut`, `table`; `params.dim` required). `params.currency` is optional: absent means the site's default currency when the tile runs, so a dashboard copied to another site shows that site's currency. The template "Revenue" (Analytics group) has the KPIs revenue, orders, average order value and revenue per visitor, a revenue area chart, revenue by channel (bars), by source, by entry page and by goal (tables), and no currency. A site without revenue shows "No revenue recorded yet" in its revenue tiles.

Every amount on a tile and on a shared page carries the code, titles and column headers read "Revenue (USD)", and under every revenue tile the shared page prints "Amounts in USD." and, when other currencies have orders, "Also recorded: 120.00 EUR (3 orders)." (at most five, then "and n more").

## 9. Export

The export menu works on every revenue report. Every exported row of a revenue result has a `currency` column, series and totals rows included; `revenue` exports one row per currency; a table with `withRevenue` adds `revenue`, `orders`, `revenue_currency` and `currency`.

## 10. Daily summary, late orders and voids

Beyond the raw window (and for a range over the scan budget whose filters all apply), revenue reports read `ca_revenue_daily`: per day, dimension, key and currency the orders, revenue and paying sessions, top 200 keys per dimension (500 for pages and entry pages), the rest in `(other)`. Refunds are stored in the same table as rows of their own kind (`dim` `refund.<dim>`, `revenue` the refunded amount, `orders` and `sessions` 0) next to the order rows of the same key, segment and currency, and only where a day holds refunds; a summary read takes both in one statement. These rows are stored with the traffic summary once a day is closed. The cron task `revenue` runs at minutes 25 and 55, for at most three sites per run, and reconciles the closed raw days: when the raw orders, revenue or refunds per day and currency differ from the summary (a late order posted with a past `ts`, a correction, a void or a refund), it recomputes at most two such days per run, together with that day's event and goal summary. Beyond the raw window revenue per visitor divides by the visitors of the traffic summary for the same key; goal and event rows have none (null), and a key folded into `(other)` on either table gets null rather than zero.

Segment filters on revenue in summary data:

- One of `channel`, `country`, `device` applies to a breakdown by `page`, `entry`, `source`, `campaign`, `event` or `goal` (pair rows of that dimension and segment).
- One, two or three of them apply to the totals, the series and a breakdown by `channel`, `country` or `device` (the daily channel by country by device table).
- Any other filter or combination is not applied (`filter_unavailable:<dim>:<reason>`), and `withRevenue` columns are left out with `revenue_not_available` rather than shown unfiltered.

Days: an order counts on its own day, while page views count on the day their visit started, so an order placed after midnight in a visit that began the day before sits one day later than that visit's page views. An order is stored even when its visit has reached `maxEventsPerSession`. The `revenue` task reconciles closed days only (totals per currency, and the orders without a visit, so an order that gains its visit later moves out of "(not set)"); today and yesterday (until it closes) are computed on read from the raw rows, so they are always current.

Spoofed amounts without an order id (a value posted from a browser console) are removed on the Data page, Delete tab, "Void revenue": a day inside the raw window, an event name and a minimum value; the form counts the matching events first and voids them after a confirmation (`tools/revenue-void`, `plugins:manage`). Orders with an id are corrected or voided by your server through `agent/v1/events` (section 4).

## 11. Agent API and admin

`agent/v1/query` serves the four reports under `read:analytics`; the envelope `meta.currency` names the currency of the figures. The catalog (`GET agent/v1/reports`) lists the reports, the metrics (none is an estimate; `refunds` and `net_revenue` among them), `params.currency`, the dims, the filter dims `currency` and `revenue` with their operators, and the `write:events` scope. In the admin, the Revenue page (Analytics, Revenue) is the home of revenue:

- One sentence states the attribution model: each order is credited to the first touch of its visit (referrer, channel, campaign, entry page), because the plugin keeps no cookie and no identity across visits.
- Currency chips (when more than one currency has orders), then the key figures as cards; revenue, refunds, net revenue, orders and average order value toggle lines of one chart, as on the other pages. Money of two currencies never shares a chart or a card.
- "Where the revenue came from": one panel per breakdown dimension, all visible at once (channels, sources, campaigns, entry pages, pages, countries, devices, goals to revenue, events), each with revenue, share of revenue, orders, average order value and revenue per visitor, refunds and net revenue when the range holds refunds, the change against the comparison period, the top 10 keys with an order, and the full table through Export. A click on a value filters the page.
- Recent orders: reference, day, amount, channel, entry page and country of the newest 50 orders of the range (`revenue_orders`). A range that starts before the detailed window lists the orders from the first detailed day and says so; the figures above still cover the whole range.
- Before the first order the page shows what to send, one example and a link to this guide instead of an empty report.

Funnels to revenue: Behaviour, Funnels adds per step Revenue, Refunds and Net revenue (when present), Orders, Average order value, Revenue per session and Est. lost revenue when the site has revenue, in the page currency, with the other currencies listed under the table (`withRevenue` on `funnels` above). The Revenue page links there, because a funnel table does not fit a breakdown panel. Goals to revenue is the goal panel.

The tables of Sources, Pages, Audience and Goals get Revenue and Orders columns, and the Overview shows a revenue strip in the default currency with a link to the Revenue page. These appear only when the site has revenue. When the range holds refunds, Refunds and Net revenue appear next to Revenue (cards and columns) with a note that revenue is before refunds and a refund counts on its own day. The URL keeps the chosen currency as `cur=EUR`.
