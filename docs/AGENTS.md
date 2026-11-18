# Agent API

Wiki: [Agent API and MCP](https://github.com/infinitnet/cookieless-analytics/wiki/Agent-API-and-MCP).

Read aggregated analytics from scripts, AI agents and a multi-site master with a scoped API key. The machine-readable description is [`openapi.json`](openapi.json) (OpenAPI 3.1), also served at `agent/v1/openapi.json`.

Base URL: `https://<your-site>/_emdash/api/plugins/cookieless-analytics/`

## 1. Create a key

In the admin, open Cookieless Analytics, Definitions, API keys. Pick a label, the scopes, an optional site restriction and an optional expiry date, then copy the key. It is shown once; the site stores only its prefix and a SHA-256 hash. Revoke a key on the same tab, then delete it there to remove it from the list: at most 100 keys per install (all sites together), revoked keys included until they are deleted. Only a revoked key can be deleted (admin route `keys/delete`).

| Scope | Grants |
|---|---|
| `read:analytics` | Traffic reports through `query`, the report catalog, summary, status, and reading annotations |
| `read:search` | The `search_*` reports through `query`; together with `read:analytics`, the search columns on `pages` (`params.withSearch`) |
| `sync:search` | `search/sync` and `search/backfill` |
| `write:annotations` | Adding annotations, for example from a deploy script |
| `write:dashboards` | Creating, changing and deleting dashboards |
| `write:events` | Recording events and order values from the site's own server (`events`, section 11) |
| `data:export` | Every stored row of the analytics tables through `data/dump`, for backups and moves (section 16) |
| `data:import` | Inserting exported rows through `data/load` (section 16) |

No scope exists for settings, keys or deletion. `write:events` is the only ingestion and writes events only. `data:export` and `data:import` move stored rows, visit details and daily visitor keys included, and are meant for one backup or move key each. A key with any scope can read `openapi.json`.

## 2. Send the key in `X-Api-Key`

```sh
curl -s https://example.com/_emdash/api/plugins/cookieless-analytics/agent/v1/summary \
  -H "X-Api-Key: abcd1234.your-secret"
```

Why not `Authorization: Bearer`: the EmDash host checks every Bearer token on `/_emdash/api/plugins/*` before the plugin runs and answers `401 INVALID_TOKEN` for anything that is not a host API or OAuth token. A plugin key sent as a Bearer token never reaches the plugin. The key is never read from the query string either.

Clients without a browser (curl, servers, agents) send POSTs as is. Browser-based clients must add `X-EmDash-Request: 1` to POSTs, or the host rejects them as cross-origin.

## 3. Call sequence

1. `GET agent/v1/reports`: report names, dimensions, operators, parameters, metric definitions, scopes and limits.
2. `GET agent/v1/summary?from=2026-03-01&to=2026-03-07`: the Overview numbers compared with the previous period (default: the last 7 days with today); `compare=year` compares with the same period last year and `compare=none` turns the comparison off. `data.revenue` lists revenue (gross), refunds, net revenue and orders per currency (`[{ "currency", "revenue", "refunds", "net_revenue", "orders" }]`), never summed across currencies. A multi-site master reads this endpoint for its All sites table ([multi-site.md](multi-site.md)).
3. `POST agent/v1/query` with `{ "report", "query", "params"?, "limit"?, "offset"? }`, for example:

```json
{
  "report": "pages",
  "query": {
    "from": "2026-03-01",
    "to": "2026-03-31",
    "compare": "previous",
    "filters": [{ "dim": "channel", "op": "is", "values": ["Organic Search"] }]
  },
  "limit": 50
}
```

4. `GET agent/v1/status` for versions, the latest day with human traffic, the raw window start, the rollup watermark, drop counters and the Search sync state.
5. `GET` or `POST agent/v1/annotations` (`{ "text": "Release 2.1", "path": "/pricing" }`; `kind` is `release` by default, `ts` defaults to now). See "Annotations" below.
6. `POST agent/v1/search/sync` and `POST agent/v1/search/backfill` (`{ "action": "start" | "cancel" | "status", "source", "from", "to" }`) with `sync:search`.

## 3a. Sites

One install can hold several sites in its database: the local site and the client sites registered on Definitions, Sites (see [client-sites.md](client-sites.md)). `query` takes the same `Query` as the admin, including `query.site`; `summary`, `status` and `GET annotations` take `?site=`; `POST annotations`, `search/sync` and `search/backfill` take a `site` body field. Absent means the local site. `meta.site` names the site that answered.

- A connected remote site (multi-site master) answers `400 site_not_allowed`: ask that site's own agent API with a key it issued.
- An id that is neither the local site nor a registered client site answers `400 unknown_site`.
- A key created with a site restriction answers `404 {}` for any other site, the local site included, like every other auth failure.

## 3b. Annotations

An annotation carries an optional scope `{ v: 1, host?, path?, query? }`: rule lists of `{ op, value }` with `is` or `regex` (and `prefix` for paths), at most 10 rules per kind and 20 in total; absent means site-wide. Rules of one kind are ORed and kinds are ANDed; a chart, `query` or `GET annotations` shows an annotation when its scope matches the filters on `host`, `page` and `query`, where a kind without a filter always matches and two patterns are assumed to overlap. Query rules apply to search reports only. `query` with `withAnnotations: true` adds the matching annotations (`id, ts, day, kind, text, scope, summary`) as `data.annotations` and `meta.annotations: { matched, loaded, truncated }`. `GET agent/v1/annotations?path=/pricing` keeps the ones matching that page (also `host`, `query`); `?q=launch` keeps the ones whose title, kind, scope or source slug contains the text, in any case (at most 100 characters). From a deploy script, scoped to one host:

```sh
curl -s -X POST "$BASE/agent/v1/annotations" -H "X-Api-Key: $KEY" -H "content-type: application/json" \
  -d '{"text":"Release 2.1","scope":{"v":1,"host":[{"op":"is","value":"shop.example.com"}]}}'
```

`path` is a shortcut for one page; sending `path` and `scope` together answers `400 scope_conflict`. An annotation can also carry one `target`, the KPI its impact is measured on, in the vocabulary of `impact` (section 10): `{ "report": "overview", "metric": "bounce_rate" }`, `{ "report": "goals", "metric": "completions", "params": { "goal": "<goal id>" } }`, `{ "report": "channels", "metric": "sessions", "params": { "key": "Organic Search" } }`; a row report needs `params.key`, `goals` needs `params.goal`, and an unknown metric answers `400`. Without a target the default is visitors of the scope (Search clicks for a query scope while Search data exists). `GET annotations` returns `target` (null for the default). Details: [annotations.md](annotations.md).

## 4. Responses

Success: `{ "ok": true, "data": ..., "meta": { "site", "from", "to", "generatedAt", "truncated" } }`. `truncated` is true when more rows exist beyond `limit`; page with `offset`.

| Status | Body | When |
|---|---|---|
| 200 | envelope | success |
| 400 | `{ "ok": false, "error", "message" }` | invalid input: `invalid_input`, `site_not_allowed`, `unknown_site`, `range_too_long`, `invalid_regex`, `narrow_filter`, `too_many_values`, `unknown_segment`, `search_unavailable`, `invalid_filter`, `invalid_currency`, `invalid_params` |
| 404 | `{}` | missing, malformed, unknown, wrong, revoked or expired key, a scope the key lacks, or a site outside the key's site restriction. All look the same on purpose. |
| 429 | `{ "ok": false, "error": "rate_limited" }` | the key's rate limit; wait for `Retry-After` seconds |

Every response carries `Cache-Control: private, no-store`. There is no CORS.

Responses hold aggregates only: never IP addresses, visitor keys, session ids, user agents or rows per visitor. The one exception is `data/dump` (scope `data:export`, section 16), which returns the stored rows themselves; no route returns an IP address or a full user agent, because none is stored.

## 5. Limits

- Range: at most 400 days per query. Rows: at most 1000 per call (`limit`), offset up to 100 000. Filters: at most 20.
- Revenue filters: `{ "dim": "currency", "op": "is", "values": ["EUR"] }` keeps sessions with an order in EUR; `{ "dim": "revenue", "op": "gte", "values": ["50"], "prop": "EUR" }` keeps sessions whose orders sum to at least 50 EUR (`gt`, `gte`, `lt`, `lte`; one amount with at most three decimals; `prop` absent means the site's default currency; `lt` and `lte` above zero include sessions without orders). The four numeric operators on any other dim answer `400 invalid_filter`.
- Regex filters use a safe subset (no backreferences, lookarounds or nested quantifiers) and must match at most a bounded number of distinct values; narrow the range or use `prefix` or `contains` otherwise.
- Rate limit: `agentRateLimitPerMinute` requests per minute per key (default 60). It is counted per Worker isolate, so the real limit across isolates is approximate. Put a WAF rate rule in front for a hard limit.
- `last_used` on the key list is updated at most once per 10 minutes.
- No agent route deletes analytics data. Deleting all data and deleting matching visits are admin only (Data page, permission manage).
- No agent route reads or writes user agent rules. They are edited in the admin only (Definitions, User agent rules, permission manage); see [bots.md](bots.md#your-own-rules).

## 6. Caveats when reading the numbers

- Sessions: a session ends after `sessionWindowMinutes` without a hit (setting), so session counts depend on that setting.
- Visitors are distinct per day and summed over days. The visitor key rotates daily by design, so a person seen on two days counts twice; there are no cross-day uniques.
- Bots and crawlers are excluded from every report and never leave a stored row.
- Detailed versus summaries: a range that starts before the detailed window, or that holds more visits than the capacity profile's scan budget, is answered from the daily summaries (the catalog's `summaries` entry has the rule). The result's `notices` then contain `summary` (`compare_summary` for the compare range), `filter_unavailable:<dim>:<reason>` for each filter the summaries cannot apply (`not_kept` or `combination`; it was not applied), and `detail_from:<day>`, the first detailed day, when the range starts before it. One of channel, country and device combines with page, entry, source, utm_campaign, event or goal; two or three of them combine with each other in overview, timeseries, channels, countries, devices and the revenue totals, series and breakdowns by channel, country or device. Today and yesterday are computed on read, so summary answers are current; when the background runs are more than four days behind, the days they have not stored yet are left out and named in `summary_behind:<from>:<to>`. A key filter on a dimension whose summary rows hold `(other)` on some day of the range (rarer values summed there) adds `summary_other:<dim>`: values folded on those days cannot match the filter, so the figures may be low. A detailed report far over the budget is refused with `400 narrow_range`, and the message names the longest range that fits; a report that needs detailed rows answers `400 raw_only` before the window. `status.rawFrom` shows where detailed data starts.
- Search data arrives with a lag of 2 to 3 days, the newest days are provisional and replaced on the next sync, and the providers anonymize rare queries, so query rows do not add up to page totals.

## 7. Search Satisfaction

`satisfaction` (landing page rows plus a totals row; `params.by` groups by `source`, `device`, `country` or `browser` instead, `params.rank: "best" | "worst"` orders landing pages with at least 30 measured sessions by `score`) and `satisfaction_series` (daily or weekly rates) run through `query` with `read:analytics`. They are computed from session rows at query time, so they answer `raw_only` for ranges that start before the raw window.

Search Satisfaction covers organic search sessions only: both reports always restrict their sessions to the channel `Organic Search`, whatever filters the request carries. Other filters narrow inside that scope (`source` prefix `google.` or `bing.` for one engine, `browser`, `entry`, `page`, `device`, `country`). A `channel` filter does not apply: the answer covers the same organic search sessions and carries the notice `ignored_dim:channel`. `params.by: "channel"` is answered with `invalid_params`.

Definitions, per human organic search session with at least one page view, with `L = longClickSeconds` (default 60) and `B = min(badExperienceSeconds, longClickSeconds)` (default 10):

- Duration: the longer of the time between first and last page view and the visible time.
- Measured: at least one engagement update arrived (visible time above 0). Unmeasured sessions are left out of every rate denominator; `measured` and `sessions` are both returned.
- Long click: measured and duration above `L` seconds. Short click: measured and duration at or below `L`.
- Bad experience: measured, one page view, no events, no interaction and duration below `B` seconds.
- Search session: channel Organic Search, so every session of these reports is one (`search_sessions` equals `sessions`).
- Pogo-sticking (estimate, `pogo_stick_rate`): a measured search session with one page view, no events, a short click, and a page left with `pagehide` kept for the back and forward cache. Rate: `pogo_sticks` divided by measured search sessions.
- Returned from search (estimate, `returned_from_search_rate`): a search session whose first page view was left for the back and forward cache and that a later arrival from a search engine joined. Rate: `returned_from_search` divided by search sessions. A stronger pogo-sticking signal: the visitor demonstrably came back from the results page.
- Score: long click rate minus bad experience rate minus pogo-sticking rate (0 when no search session is measured).
- Search re-entry (estimate): search sessions that a later arrival from a search engine joined, divided by search sessions.
- Back/forward loads (estimate, per page): page loads of type back_forward divided by page loads with a known navigation type.

Changing a threshold reclassifies every stored session at once; there is no job to wait for. The catalog marks `pogo_stick_rate`, `returned_from_search_rate`, `search_reentry_rate` and `back_nav_rate` with `estimate: true`. Do not quote them as measurements:

- Pogo-sticking, returned from search, search re-entry and back/forward loads are estimates from browser navigation signals.
- The referrer is the search engine's origin only, so the query is never known and a second search cannot be told from the same search again. Surfaces without a referrer count as Direct and are outside Search Satisfaction.
- `pagehide` with `persisted` true fires on back and on forward navigation alike: it means the visitor left without closing the tab and without clicking one of the site's links, not that they pressed Back. A tab close or a page the browser does not cache is not counted. Browsers differ, so compare within one browser.
- A tab or app switch is not an exit. On mobile a page left through the app switcher and later killed never fires `pagehide`.
- A restore from the back and forward cache is not a page load, so the back/forward load share is a lower bound.
- Search re-entry counts any second arrival from a search engine within the session window for the same daily visitor key, including two results opened in tabs at once and two people behind the same network address.
- Active time accrues only within 60 s of an interaction, so a long passive read can be a long click by visible time with low active time.

## 8. Dashboards

A dashboard is a saved set of up to 12 tiles over the reports above (no SQL, no raw rows). Four routes:

- `GET agent/v1/dashboards` (`read:analytics`): the definitions of every site the key may read, or of one site with `?site=`.
- `POST agent/v1/dashboards/data` (`read:analytics`, plus `read:search` when any tile is a search report): `{ id, site?, range?, compare? }` runs every tile and answers `{ id, name, range, compare, tiles: [{ id, result | error, notices }], requests }`. `range` is a preset (`today`, `yesterday`, `7d`, `30d`, `90d`, `12m`, `mtd`, `ytd`) in the site timezone; the default is the dashboard's. Tiles with the same report, filters and parameters share one request (four number tiles of `overview` cost one), and `requests` is the number of distinct requests. A tile whose default segment was deleted carries the notice `segment_missing` and runs without it.
- `POST agent/v1/dashboards/save` (`write:dashboards`): `{ dashboard, site? }`; without `dashboard.id` a dashboard is created (at most 20 per site), with it the dashboard is replaced. Errors are typed: `invalid_dashboard` (the message names the tiles), `too_many_tiles`, `too_many_dashboards`, `record_too_large` (16 KB), `unknown_version`.
- `POST agent/v1/dashboards/delete` (`write:dashboards`): `{ id, site? }`.
- A dashboard's email schedule and its recipients are neither accepted nor returned by any agent route: an `email` in a saved dashboard is ignored and the stored schedule kept. Deleting a dashboard deletes every share link of it.

`write:dashboards` alone cannot read any report. A dashboard is `{ name (1 to 80), tiles, defaults: { range, compare, segment?, filters (0 to 10) }, viewer: { ranges (presets, must include defaults.range), compare } }`. A tile is `{ id (6 lowercase letters or digits), report, kind, title?, metric?, filters? (0 to 5), params?, limit? (5 to 25), w (1, 2 or 3 columns) }`. The catalog (`GET agent/v1/reports`, key `dashboards`) carries the kinds, the `TILE_KINDS` map and the metric keys per report:

| Reports | Kinds |
|---|---|
| `overview` | `kpi` |
| `timeseries`, `satisfaction_series` | `line`, `area` |
| `search_overview` | `kpi`, `line`, `area` |
| `satisfaction`, `goals` | `kpi`, `bars`, `donut`, `table` |
| `search_cannibalization`, `search_position_moves` | `kpi`, `table` |
| `search_position_bands` | `kpi`, `bars`, `donut`, `table` |
| `search_position_bands_series` | `stacked`, `line`, `area` |
| `search_cannibalization_pages`, `search_striking_distance`, `search_movers`, `search_decay`, `traffic_movers`, `traffic_decay` | `table` |
| `impact` | `kpi`, `line` |
| every other report except `dimension_values`, `search_page_queries`, `search_cannibalization_page` and `search_cannibalization_query` | `bars`, `donut`, `table` |

A `kpi` tile needs `metric` (one of `tileMetrics[report]`). `line` and `area` tiles need `metrics` instead: 1 to 4 keys of `tileMetrics[report]`, on at most two scales (counts, percents, durations, decimals, position, amounts), drawn in that order; an `impact` line takes one. `metric` on a line or area tile is an error. A `goals` `kpi` tile needs `params.goal` (the goal's id), a `funnels` tile `params.funnel` (the funnel's id), an `event_props` tile `params.event`; search reports take `params.source` (`all`, `google`, `bing`). A donut shows at most 8 slices; the rest is folded into "other". The SEO and impact tiles take the optional `params` of `tileParams[report]` in the catalog (`dim`, `direction`, `metric`, `minImpressions`, `minShare`, `includeBrand`, `list`, and for `impact` `annotation`, `kind`, `at`, `window`, `report`, `key`, `scope`, `path`); `annotation: "latest"` resolves when the dashboard runs, so templates stay portable. `dashboards/data` also needs `read:search` for an `impact` tile over a search report.

## 9. SEO views

Ten search reports read the stored Search rows (`read:search`) and two traffic reports read the daily page summaries (`read:analytics`), all through `query`:

- `search_cannibalization` (queries where two or more pages each hold at least `minShare` percent of the impressions, with at least `minImpressions` impressions; rows carry `pages`, `pattern` (`dominant`, `split`, `inverted`, `shared`), `best_page` and `page_list`; totals `cannibalized_queries`, `cannibalized_impressions`, `visible_share`), `search_cannibalization_pages`, `search_cannibalization_page` (`params.page`), `search_cannibalization_query` (`params.query`; Bing on request, cached one hour). Compare answers `400 compare_not_supported`; `country` and `device` filters give `filters_not_applied`; Bing selections read Google rows with `bing_no_pairs`.
- `search_position_bands` (`params.dim`: `query` or `page`; bands `1-3`, `4-10`, `11-20`, `21-50`, `51+` of the average position), `search_position_bands_series` (`params.metric`: `queries` or `impressions`; days up to 31 days, ISO weeks beyond), `search_position_moves` (the band matrix, the lists `up`, `down`, `new`, `lost`, and `totals`), `search_striking_distance` (pairs at positions 4 to 20 with `potential_clicks`, an estimate from the site's own top-3 CTR, null below 1,000 top-3 impressions).
- `search_movers` (`dim`, `direction`: `up` or `down`, `metric`: `clicks` or `impressions`), `search_decay` (pages falling in three consecutive periods, `diagnosis` `position`, `ctr` or `demand`), `traffic_movers` and `traffic_decay` (page views of the daily summaries; session filters do not apply).

Every view accepts at most 93 days (`400 range_too_long`). The period views compare `n` days with the `n` days before, ending at the newest final Search day (yesterday for traffic), and return `periods` plus the notice `provisional_excluded` when the end moved. `notable` is `abs(current - previous) > 2 * sqrt(current + previous)`, a rule of thumb for counts. Floors default to the `searchMinImpressions` and `searchOverlapMinShare` settings; `includeBrand: true` keeps queries with a `searchBrandTerms` term. The catalog key `seo` holds the parameters per report, the period rule and the coverage text: "Based on the stored page and query rows. Google omits rare queries and keeps top rows only, so shares are of visible queries."

## 10. Impact

`report: "impact"` compares one metric of one report over equal windows before and after an annotation (`params.annotation`: an id or `"latest"`, optionally with `params.kind`) or a date (`params.at`). `params.window` is 7, 14, 28 (default), 60 or 90 days; `params.report` names the target (`overview`, `channels`, `sources`, `campaigns`, `pages`, `entry_pages`, `countries`, `devices`, `browsers`, `goals`, `events`, `satisfaction`, `search_overview`, `search_pages`, `search_queries`, `search_countries`, `search_devices`, `search_position_bands`) and `params.metric` one of its metrics (catalog `seo.impact.metrics`); `params.key` picks a row (a channel, a page, a query; `params.goal` for goals). The annotation day is in neither window; the after window ends at the last complete day, and while it is shorter than `window` the answer has `complete: false` and `days_after`. By default the annotation's scope becomes filters (`params.scope: "none"` compares site-wide; `params.path` adds one page); a scope kind that cannot apply is reported as `scope_host_not_applied` or `scope_query_not_applied`. The answer carries `before`, `after`, `delta`, `delta_pct`, `notable` for counts or `measured` (the denominators) for rates, a daily `series` with `marker`, the `overlapping` annotations and the fixed `caution`: "Before and after comparisons show correlation, not causation. Seasonality, other changes and search engine updates overlap; annotations in the same window are listed." An impact over a search report needs `read:analytics` and `read:search`. `params.context: true` adds `context: { before, after }`, the overview totals of the same scope and windows.

`report: "annotation_impacts"` lists the range's annotations in one call, newest first, each measured on its `target` over equal windows of `params.window` (7, 14 or 28 days; default 14): rows carry `annotation`, `target`, `target_default`, the impact fields (`days_after`, `periods`, `before`, `after`, `delta_pct`, `notable`, `measured`), `verdict` (`up`, `down`, `flat`, `too_early` while the after window is short, `no_data` on missing or small numbers), `good` (true when the change is good news, so a fall in bounce rate or position is good) and `overlaps`, the annotations of an overlapping scope inside the windows (their effects cannot be separated). `params.kind` and `params.scopeKind` (`site`, `host`, `path`, `query`) filter, and `params.q` (at most 100 characters, trimmed) keeps the annotations whose title, kind, scope or source slug contains the text, in any case; `limit` (at most 6, 5 on the small capacity profile) and `offset` page, `total` counts every match. Search targets are measured with `params.withSearch: true`, which needs `read:search` too; `search_through` names the newest final Search day when it trails yesterday. It reads only.

## 11. Revenue and events

`POST agent/v1/events` (scope `write:events`) records 1 to 20 events per call from the site's own server, typically paid orders from a payment webhook. Fields per event: `name`, `val` (0 to 1,000,000,000, rounded to the currency's minor unit), `cur` (ISO 4217; absent means the site's `defaultCurrency`), `oid` (order id, 1 to 64 of `A-Z a-z 0-9 _ . : -`, never stored), `sid` (the page's `window.<namespace>.sid`), `ts` (epoch seconds, 30 days back to 60 s ahead, and after the first day of the raw window), `u` (path), `p` (properties). The answer is `data: { accepted, duplicates, rejected: [{ index, reason }] }`; reasons are `invalid_name`, `reserved_name`, `invalid_value`, `invalid_currency`, `invalid_id`, `invalid_ts`, `invalid_sid`, `invalid_path`, `unknown_order`, `refund_exceeds_order`, `currency_mismatch`. A body without an `events` array of 1 to 20 items is `400 invalid_body`.

Orders: an event with `oid` is stored once per site, event name and order id. This route has the last word: posting an `oid` that is already stored (by the page script, an in-process call or an earlier call) replaces its `val` and `cur` and keeps its time, day, path and name. The item `{ "name": "purchase", "oid": "A-1001", "void": true }` (no `val`) sets the value and currency of that order to null; the event stays, the order and its revenue are gone. A void of an order id that is not stored is rejected with `unknown_order`; a void also voids the order's refunds. Both count in `duplicates` and work inside the raw window only. A refund is the item `{ "name": "purchase", "oid": "A-1001", "rid": "RF-7", "refund": 20 }` (optional `cur`, which must be the order's, and `ts`): it is booked on its own day with the order's visit, page and currency, stored once per order and `rid` (a retry counts in `duplicates`), and reported as `refunds` and `net_revenue` next to `revenue`, which stays gross; orders and paying sessions do not change. Partial refunds add up; above the order's amount is `refund_exceeds_order`, an order id not stored is `unknown_order`, another currency is `currency_mismatch`. Details: [revenue.md](revenue.md#refunds). The page script and in-process posts of an existing `oid` are dropped and never change the row. Negative values are `invalid_value`. A `sid` attaches the event to that visit (its channel, source and campaign) when the visit started at most 7 days ago, also after the session window closed, raising only its event count and never extending or changing the session; your backend should keep the `sid` only until this call is sent, because stored next to an order it links the purchase to that session's pages in your own records; an unknown `sid` is rejected. A key with `write:events` alone cannot read reports, and `read:analytics` alone cannot send events.

```sh
curl -X POST "https://example.com/_emdash/api/plugins/cookieless-analytics/agent/v1/events" \
  -H "X-Api-Key: $KEY" -H "content-type: application/json" \
  -d '{"events":[{"name":"purchase","val":49.9,"cur":"EUR","oid":"A-1001"}]}'
```

Webhook example: the checkout page sends `window.__ec.sid` with the order metadata, and the webhook passes it back:

```js
const visit = order.metadata.visit; // set at checkout from window.__ec.sid
await fetch(`${origin}/_emdash/api/plugins/cookieless-analytics/agent/v1/events`, {
	method: "POST",
	headers: { "X-Api-Key": key, "content-type": "application/json" },
	body: JSON.stringify({ events: [{ name: "purchase", val: order.total, cur: order.currency, oid: order.id, ...(visit ? { sid: visit } : {}) }] }),
});
```

Money of two currencies is never added together. Details, the browser API and the `acceptClientRevenue` setting: [revenue.md](revenue.md).

Reading revenue (`read:analytics`): the reports `revenue` (totals per currency, `data.hasRevenue`), `revenue_series` and `revenue_breakdown` (`params.dim`: `channel`, `source`, `campaign`, `entry`, `page`, `country`, `device`, `goal`, `event`) answer in one currency, `params.currency` or the site's `defaultCurrency`, and list every currency with orders in `data.currencies`; `meta.currency` names the currency of the figures. Money of two currencies is never added. `withRevenue: true` on `channels`, `sources`, `campaigns`, `pages`, `entry_pages`, `countries`, `devices`, `events` and `goals` adds `revenue`, `orders` and `revenue_currency` per row, and on `funnels` the revenue of the sessions that reached each step (section 12). The metrics `revenue`, `refunds`, `net_revenue`, `orders`, `aov`, `revenue_per_visitor`, `revenue_per_session` and `paying_sessions` are counts and ratios, not estimates; their definitions are in the catalog (`metrics`, and `revenue` for the report parameters and filter dims). An unknown code answers `400 invalid_currency`, an unknown `dim` `400 invalid_params`.

```sh
curl -X POST "https://example.com/_emdash/api/plugins/cookieless-analytics/agent/v1/query" \
  -H "X-Api-Key: $KEY" -H "content-type: application/json" \
  -d '{"report":"revenue_breakdown","query":{"from":"2026-10-01","to":"2026-10-31"},"params":{"dim":"channel","currency":"EUR"}}'
```

## 12. Funnel modes, segment comparison and journeys

Funnels: `params.mode` (`sequential`, the default, `strict` or `flexible`) applies to ad hoc `params.steps`; a stored funnel uses its own mode, and `data.mode` names the mode used. Strict funnels read at most 10,000 sessions, the others 50,000 (`400 funnel_cap`). `params.withRevenue: true` adds per step the revenue of the sessions that reached it, in `params.currency` or the site's `defaultCurrency`: `revenue`, `orders`, `aov`, `paying_sessions`, `revenue_per_session`, `revenue_currency`, `refunds` and `net_revenue` when present, and `est_lost_revenue`, an estimate (the sessions that left before the step valued at the revenue per session of those that reached the last step). Every order of such a session in the range counts at every step it reached, also an order placed before the step. Without orders in the range the keys are absent; definitions in [revenue.md](revenue.md#5-reports).

Segment comparison: `query.compare: "segment"` with `query.compareSegment` (a segment id of the site) runs side B over the same range; `compareTotals`, `previous` and `compareSeries` hold side B, and `segment` and `compareSegment` echo `{ id, name }`. Not on search reports, the SEO views or `impact` (`400 compare_not_supported`).

Journeys: `journey_next` and `journey_prev` (`params.path`) and `journey_paths` (optional `params.entry`), at most 31 days (`400 journey_range`) and 50,000 sessions (`400 journey_cap`); rows of fewer than 2 sessions are counted in `data.hidden_sessions`. A range that starts before the raw window reads the daily summaries, which keep the top steps and paths of each day (notice `top_paths_per_day`) and apply no filter (`filter_unavailable:<dim>:not_kept`); notices `summary` and `detail_from:<day>` as for every summary answer, which also answers a range over the scan budget when no filter is set. The catalog key `behaviour` holds the mode definitions, the caps and the rules. Details: [behaviour.md](behaviour.md).

## 13. Collections and site search

`collections` (tile report) sums the daily page summaries per CMS collection, classified by each routable collection's URL pattern; `totals.coverage` is the classified share of all pageviews. Filters do not apply (`filters_not_applied`); a client site answers `not_available_for_site`. `site_search` (tile report, raw window only) lists the terms of the `siteSearchParams` setting with `searches`, `sessions` (an upper bound where `sessions_upper_bound` is true) and `searches_per_session`; with the setting empty it answers the notice `site_search_off`. The agent API shows every term; shared pages and emails omit terms of fewer than 2 sessions and count them in `data.hidden_terms`. The catalog key `content` holds the definitions and limits. Details: [content.md](content.md).

## 14. All sites summary and MCP

`sites_summary` through `query` (`read:analytics`) lists one row per site of this database with sessions, pageviews, visitors, bounce rate, engaged rate and `revenue` as a per-currency list, keyed by site id, from the daily rollup (`ca_rollup` and `ca_revenue_daily`, complete up to `rollupWatermark` of `status`). The `totals` sum sessions and pageviews; `visitors` is `null` there because a visitor of two sites counts once per site; `data.revenue` holds the totals per currency. A key with a site restriction sees only its own sites and must name one of them in `query.site`; remote satellites are never listed. The report takes no filters (`400 invalid_params`) and is not a tile report.

EmDash users and EmDash API tokens can reach four tools of this plugin through the host's MCP endpoint instead of a plugin key: see [mcp.md](mcp.md).

## 15. Links

`links` through `query` (`read:analytics`) reports short links per key: `impressions`, `clicks`, `ctr`, `sessions` with a click and `conversions`, with `params.by` (`link`, `place`, `page`, `channel`, `source`, `campaign`, `entry`, `country`, `device`) and `params.slug` for one link; `params.withRevenue` adds `revenue` in one currency. A range before the raw window, or over the scan budget when every filter applies, reads the daily link summaries (by link and by place; see [integration.md](integration.md)). The event names and rules are the Links convention in [integration.md](integration.md); the catalog lists them under `links`.

## 16. Data export and import

`POST agent/v1/data/dump` (scope `data:export`) with `{ "table", "cursor"?, "limit"?, "site"? }` answers one chunk of a table's stored rows as NDJSON (`application/x-ndjson`, one JSON object per line, under 1.2 MB, at most `limit` rows, default 50 on the Small capacity profile and 500 otherwise, at most 1,000), read in primary key order. An answer cut by its size comes back with fewer rows than asked and a next cursor: ask for no more rows than it held next time. Headers: `x-next-cursor` (URI encoded JSON array; send it decoded as `cursor` for the next chunk; absent when the table is done; another cursor is `400 invalid_input`), `x-layout` (the table layout), `x-engine` (`sqlite` or `postgres`) and, on the first call of a table, `x-total` (its row count). `site` limits the rows to one site; a key with a site restriction always gets its site only.

`POST agent/v1/data/load` (scope `data:import`) with `{ "layout", "table", "rows", "site"? }` inserts up to 1,000 rows as `data/dump` wrote them into the database their site writes to and answers `data.inserted`. A row whose primary key exists is kept, so a repeated chunk inserts 0; the counters of `ca_srv` and `ca_drops` are not added. A `layout` other than the site's is `400 layout_mismatch`. A row the table cannot store is `400 invalid_row`: a column the table does not have, a missing key column, a site id that is not 1 to 32 of `a-z`, `0-9` and `-`, a value of the wrong kind (text in an integer column, say), or text over 65,536 characters. A row of a site outside `site` or the key's restriction is `400 site_not_allowed`. While a delete of the Data page runs the answer is `409 delete_running`, while a data move into the same database runs or is paused `409 move_running`. On the Small profile with D1 the rows written count against the day's copy rows, which the data move shares (15,000 a day, two per row of `ca_sessions`, `ca_events` and `ca_search_daily`, which carry an index): a chunk over what is left is `429 daily_limit` with `Retry-After` up to 00:00 UTC, and nothing of it is written. An empty `rows` writes nothing and answers `data.layout` and the one table's row count in `data.total`.

The `ca-data` command line tool of the package drives both routes, with checksums and resume: [move-data.md](move-data.md). It reads the key from the `CA_DATA_KEY` environment variable (`--key` only when that is not set: a key on the command line shows in the process list and the shell history). `--rows` sets the rows per call (use `--rows 50` to import into a Small site); after a server error it halves the chunk, and on a 429 it waits for `Retry-After`, until 00:00 UTC for the day's rows.
