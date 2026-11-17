# Privacy

Wiki: [Privacy Model](https://github.com/infinitnet/cookieless-analytics/wiki/Privacy-Model).

This page says what the plugin stores, what it never stores, and for how long. The same facts are shown inside the admin as the privacy receipt, with live numbers for your install.

## Design rules

- **Nothing is written to the visitor's device.** No cookies, no `localStorage`, no `sessionStorage`, no IndexedDB, no Cache API entries, no ETag tricks. The only client state is a JavaScript variable that dies with the page. A full page load continues the visit through the daily visitor key, not through anything in the URL ([sessions.md](sessions.md)).
- **No fingerprinting.** The server-side visitor key is a hash of a shortened IP address and a normalised browser family, mixed with a random salt that changes every day. It cannot link visits across days.
- **No raw IP address and no full user agent is stored or logged.** The address is used inside one background task to build the key and is then gone.
- **Exact counts, no sampling** for human traffic.
- **Bots are excluded.** A known bot gets an empty 204 answer and no row of any kind is written ([bots.md](bots.md)).
- **No third party calls from the browser.** The page script talks only to your own install. The server calls out only to the Search providers you connect and to connected sites you list ([install.md](install.md#trust-model)).
- **Every limit is shown where the number is shown.** Visitors are counted per day, one network address can merge two people into one session, and Search Satisfaction numbers are estimates ([sessions.md](sessions.md)).

## Visitor key and salt

`vkey = base64url(HMAC-SHA256(salt of the day, site | truncated IP | browser family and major, OS family, device class))`, cut to 22 characters.

- The IP is cut before hashing: IPv4 to `/24` and IPv6 to `/48` (setting `ipTruncation` `standard`), or IPv4 `/16` and IPv6 `/32` (`strict`).
- The salt is 32 random bytes, created on first use each day and stored in the plugin's key-value state. The `salts` cron task deletes salts older than two days. A deleted salt cannot be recomputed, so older keys can no longer be matched to anyone.
- The salt day follows `saltTimezone` and `saltRotationHour` (default UTC, hour 0).
- Because the key changes every day, the plugin counts visitors per day. A figure over several days is the sum of daily visitors and is labelled so.

## Privacy signals: GPC and DNT

The setting `signals` decides what a visit may carry:

| Value | Effect |
|---|---|
| `none` | Browser privacy signals are ignored. |
| `gpc` (default) | A browser that sends Global Privacy Control is not counted. |
| `dnt_and_gpc` | A browser that sends Global Privacy Control or `DNT: 1` is not counted. |

The check runs twice. The page script reads `navigator.globalPrivacyControl` (and `navigator.doNotTrack` with `dnt_and_gpc`) and, when the signal is on, does nothing at all: it sends nothing and adds nothing to links. The server also checks the `Sec-GPC` and `DNT` request headers and drops the event. Dropped events are counted by reason (`privacy_signal`) without any identity.

Other ways to leave out traffic: signed-in editors (`excludeEditors`), path prefixes (`excludePaths`), IP ranges (`excludeIpPrefixes`) and known bots.

## What is stored, per table

Rows are written only for human visits. Every table has a `site` column.

**`ca_sessions`**: one row per visit, keyed by site, day and session id, with one index on site and visitor key. `day` is the day the visit started, in the site time zone.

- `site`, `sid`: the site id and a random session id created in the browser tab. It is not linked to a person.
- `vkey`: the daily visitor key described above.
- `day`, `hour`, `started`, `last_seen`, `window_s`: local day and hour, start and last activity time, the session window.
- `entry_path`, `exit_path`, `pageviews`, `events`, `engaged_ms`, `visible_ms`, `reentries`, `max_scroll`, `interacted`: first and last page, counts, active and visible time, scroll depth, whether the visitor interacted.
- `ref_host`, `ref_path`, `channel`, `source`, `utm_*`: where the visit came from, taken from the first page.
- `country`, `region` (only with `captureRegion`), `device`, `browser`, `browser_major`, `os`, `lang`, `screen`, `host`: country from the edge, device class, browser and system family, the primary language tag (turn off with `captureLanguage`), a screen size class (`xs` to `xl`) and the host name of the visit's first page.
- `hits`: the visit's page views and events as one document (JSONB), one entry per page view (keyed by the page's hit id) or event (keyed by `e` and the event id). A page view entry holds `t` (seconds since the visit started), `p` (path), `qs` (only the query parameters on the allowlist, `queryAllowlist`, default `utm_*`, `gclid`, `msclkid`, `fbclid`, and the words of a configured site search parameter, with emails and long numbers removed), `nt` (how the page was reached), `re` (a later arrival from a search engine), `d` (active time), `e` (visible time), `s` (scroll depth), `x` (how the page was left) and, for a page of a linked host ([client-sites.md](client-sites.md)), `hs` (that host name). An event entry holds `t`, `n` (name), `p` (path), `pr` (properties: at most 10 keys, values up to 128 characters) and, from a linked host, `hs`.

**`ca_events`**: orders (from the page or the site's server) and events reported by the site's server, one row each, with the order value (`val`) and currency code (`cur`), the day it happened, and the visit it belongs to (`sday`, `sid`) when known. An order counts on its own day. Order ids themselves are not stored, only a one-way hash.

**`ca_srv`**: error pages seen by the server, as a count per day, status, path and referring page, with the time of the last one. No single request time, no session id and no visitor key.

**`ca_aliases`**: short-lived links from a second tab's session id to the visit it joined, kept one day and deleted when they expire.

**`ca_drops`**: counts of requests not recorded, one row per site, day and reason (`site, day, reason, n`). Nothing about the request itself is kept: no address, no user agent, no path, no row per request. Bots are counted here under `bot` and nowhere else.

**`ca_rollup`**: daily summaries per report dimension (top values only), pairs of a dimension with channel, country or device, and the daily top links and journey steps. No visitor keys. Kept after the detailed rows are deleted.

**`ca_revenue_daily`**: daily order counts and order values per currency and dimension (top values only). Kept after the detailed rows are deleted.

**`ca_cube`**: daily totals per channel, country and device, with no visitor keys. Kept after the detailed rows are deleted.

**`ca_search_daily`**: clicks, impressions and positions that Google Search Console and Bing report per page, query, country and device. No visitor data.

**`ca_meta`**: only in an own analytics database ([install.md](install.md#own-database-for-analytics)): the schema version. No visitor data.

**Plugin storage** (configuration, never visitor data): goals, funnels, segments, channel rules, user agent rules, annotations, API keys (a label, scopes and a hash; never the secret), client sites (name, host names, public site key, search mapping, whether the site is linked to this site), dashboards (layout and filters; recipients of a scheduled email are kept here) and shares (a hash of the link, an optional password verifier, an expiry and two counters; never the link or the password).

**Key-value state**: the daily salts (`salt:<day>`), the host names of linked sites for the page script (`sites:linked`, empty without them), with linked sites the time of the last event per host of this site (`host:seen:<host>`, no visitor data), with the `small` capacity profile only, the estimate of today's database writes (`budget:writes`: the UTC day, today's page view count and whether recording is paused), and the progress of the background tasks (`rollup:watermark`, `rollup:cursor`, `revenue:cursor`, `retention:cursor`, and the Search sync state per site and source). None of these hold visitor data. With the `databases` option each routed database keeps its own copy of the database state (`budget:writes`, summary and retention cursors) under the prefix `db:<binding>:`.

**Queued messages** (only with the optional queue tier, `ingestTier` set to `queue`): each page view, event or engagement update waits in a Cloudflare Queue until the consumer Worker writes it, normally seconds, at most the queue's retention. A message holds the facts the visit row is built from (site, visit and page ids, the path with only the stored query parameters, the referrer's host and path, country, region, language, device, browser, operating system, the daily visitor keys and the session settings). It holds no IP address, no user agent string and no referrer query. The delete tools cannot reach a message until it is written.

## What is never stored

- A raw IP address, a full user agent string, a cookie, or anything on the device.
- A person's identity, an email address, a name, a user id, or a profile.
- Order ids. They only decide whether an order was already counted.
- Buyer names, emails or payment data.
- Page content, form field values, titles or the text of search boxes (except the words of a configured site search parameter, cleaned as above).
- Anything about a known bot.

## Retention

| Data | Kept | Setting |
|---|---|---|
| Visits with their page views and events (`ca_sessions`) and orders and server events (`ca_events`) | 760 days (25 months) by default, 7 to 760, shorter when the storage budget requires it; a day is deleted only once the daily summaries hold it | `rawRetentionDays` ("Detailed data (days)") |
| Error page and drop counters (`ca_srv`, `ca_drops`) | the detailed window | `rawRetentionDays` |
| Daily summaries (`ca_rollup`, `ca_cube`, `ca_revenue_daily`) | 25 months by default, 1 to 120 | `rollupRetentionMonths` |
| Search rows (`ca_search_daily`) | 800 days by default, 90 to 1000 | `searchRetentionDays` |
| Aliases (`ca_aliases`) | until they expire, one day after they were written (the longest visit) | none |
| Salts | 2 days | fixed |
| Configuration | until you delete it in the admin | none |
| Queued messages (only with the optional queue tier) | until the consumer Worker writes them, normally seconds, at most the queue's retention | `ingestTier` |

If the detailed data would not fit the storage budget of the `capacityProfile` setting, the detailed window shortens by itself and the Data page says so. The `retention` cron task deletes expired days oldest first, by key range, within the request budget of the profile (40 database calls per run on `small`, 400 otherwise), and continues on the next run. Retention applies per database, to every site in it, client sites included.

## Deleting data

The Delete tab of the Data page (permission: manage, admin only) offers two actions.

**Delete all data** removes every visit, page view, event, order, daily summary and Search row of the selected site after you type `DELETE`. Goals, funnels, rules and annotations stay.

**Delete matching visits** removes the visits that spam or a bot the classifier missed left in the numbers, with their page views, events, orders and refunds. A visit is matched on what is stored about it, because the IP address and the full user agent are never kept: country, region, device class, browser, OS, language, screen size class, channel, source, referrer host, campaign fields, entry and exit page, host, hour of day (site time), and the shape of the visit (one page view with no engaged time and no scroll is the preset for typical bot visits). Conditions are the report filters (is, starts with, contains, regex, each also as exclude, with the same regex safety limits); they combine with AND, values inside one condition with OR. A date range is required.

1. **Preview** (reads only): the matching visits, page views, events, orders and refunds, per day; the top values of country, browser, OS, device, channel, referrer and entry page among the matches, so you can check it is the traffic you mean; the closed days whose summaries are stored again; the rows the delete writes and its share of today's write allowance on the Small profile. When the matches carry orders or refunds, a warning names them per currency: revenue figures go down.
2. **Confirm** by typing the number of matching visits or `DELETE`.
3. **What is removed**: the matching rows of `ca_sessions` (with the page views and events inside each visit) and their rows in `ca_events`. Every closed day that lost visits or orders has its daily summaries (`ca_rollup`, `ca_revenue_daily`, `ca_cube`) computed again from the visits that remain, the same way the day was first stored, so summary and detailed reports agree. Days not closed yet need nothing: they are computed when read.
4. **Days older than the detailed window** keep only daily summaries, which cannot be filtered. The preview says so and does not count them. As a separate choice you can delete the whole summaries of those days (all their traffic, not only the matches).

The delete runs as a job in bounded steps (see [limits.md](limits.md#filtered-delete)); the page shows its progress and can cancel it. A cancelled job stops deleting and still stores the touched days again. Each finished or cancelled job is recorded in plugin state with who started it, when, the conditions and the counts (no visitor data); the Data page lists the last 10 as "Recent deletions". The agent API and the MCP tools have no delete route.

To keep the same traffic out from then on, add a user agent rule (Definitions) or an excluded path or IP range (Settings, Privacy and exclusions). The delete never adds a rule by itself.

## The privacy receipt

Open the Data page in the admin. The privacy receipt lists every table and column with a plain description, its retention, the age of the current salt and the next rotation, the counts of dropped requests by reason, row counts per table, and a block of Markdown you can paste into your own privacy page. When you select a client site, the receipt shows that site's row counts and says that retention is shared by the database.

The receipt states, fixed:

> No cookies, no device storage, no raw IP, no raw user agent.

Fixed lines for the features that add data:

> Per page view we keep how long the page was visible and active, how far it was scrolled, how it was reached (new, reload, back or forward) and how it was left (hidden, closed, or kept for back and forward). Per session we count repeat arrivals from a search engine. The script never reads or changes your browser history.

> Shared views show aggregated numbers only, the same as the admin pages: no visitor identifiers, no raw rows. Opening a shared view is not counted as a visit to any site. Per shared link we store how many times it was opened and when it was last opened.

> Order values and currency codes sent with events. We do not store order ids (they only decide whether an order was already counted), buyer names, emails or payment data.

> If your own server keeps the session token next to an order, that links the order to the pages of that session in your own records. This plugin stores no order id and no buyer data.

> If a site search parameter is configured, the words searched for are kept, with emails and long numbers removed.

> If you schedule an email, the recipients you enter are kept with the dashboard.

The dropped-request reasons are `bot`, `privacy_signal`, `excluded_path`, `excluded_ip`, `session_cap`, `sid_rate`, `vkey_rate`, `reload`, `invalid`, `origin_rejected`, `unknown_key`, `site_paused`, `revenue_invalid`, `revenue_not_accepted`, `duplicate_order`, `orphan_update`, `overload`, `write_error`, `daily_limit`, `budget_blocked` and `late_after_close`.

- `bot`: a known robot posted to the event path. It is answered before the body is read, so it is counted under this install's own site, also when it was aimed at a client site.
- `overload`, `write_error` and `daily_limit`: page views and events answered 503 because the database refused the write (`daily_limit`: the account used the daily rows of the Workers Free plan). The page script sends them again, so they count refused attempts, not lost events.
- `budget_blocked`: with the `small` capacity profile, events refused because the day's database writes reached the guard ([limits.md](limits.md)). These are answered 503 without `Retry-After`, so the page script does not send them again.
- `late_after_close`: arrived after the daily summary of a day it could change was stored ([limits.md](limits.md#late-writes-and-closed-days)).

Counts are kept in memory by each server instance and written in one statement once the oldest count is 10 seconds old (and after every cron run). Two writes never carry the same count, and a failed write keeps its counts for the next one, so a figure is never above the truth. An instance that stops before it writes loses up to 10 seconds of counts, so the figures are a lower bound. The receipt sums the days of the detailed retention window.

## Consent and the law

The design aims to need no consent banner: nothing is stored on the device and no personal data is kept. Whether that holds for your site depends on your country, your other tools and how you use the data. **This page describes the technical setup. It is not legal advice.** Ask a qualified person about your own case, and publish a privacy page that matches what you run. The Markdown block of the receipt is a good start.

## Related

[sessions.md](sessions.md), [bots.md](bots.md), [install.md](install.md), [limits.md](limits.md), [revenue.md](revenue.md), [client-sites.md](client-sites.md).
