# Search sources

Wiki: [Search Integrations](https://github.com/infinitnet/cookieless-analytics/wiki/Search-Integrations).

The plugin pulls clicks, impressions and positions from Google Search Console and Bing Webmaster Tools into the table `ca_search_daily` of the same database that holds your traffic, so Search numbers and page views can be shown side by side per page. The SEO views (positions, cannibalization, changes) are described in a later chapter.

Everything is set up on the **Search** page of the plugin admin. Until a source is connected the page shows the setup state; afterwards it shows the reports, and the connection fields stay under **Connections** at the bottom of the page.

Do not save the host's own settings form of the plugin after connecting: it saves the whole form, so a form opened before the connection writes the connection off again (`gscAuth` off, an empty `gscProperty`) and reverts other settings changed meanwhile. The plugin's own Settings page shows the connection keys read only and is safe.

## Before you start

- Set `EMDASH_ENCRYPTION_KEY` on the server. The OAuth client secrets, the refresh tokens, the service account key and the Bing API key are `secret` settings that the host encrypts with this key. Without it, saving a secret fails, and the Google sign-in answers `encryption_key_missing`.
- Set **Site origin** (`siteOrigin`) in the plugin settings to the canonical address of the site, for example `https://example.com`. It is used to match Search pages with your own pages and as the return address of the Google sign-in. When it is empty the request origin is used, and scheduled syncs fall back to the origin of the mapped property.

## Option 1: OAuth (sign in with your Google account)

1. [Create a Google Cloud project](https://console.cloud.google.com/projectcreate), or pick an existing one. Keep it selected for the next steps.
2. [Enable the Google Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com) in that project (APIs and Services, Library, Google Search Console API, Enable). Sign-in works without it, but every sync then fails with an access error.
3. Open the [Audience page](https://console.cloud.google.com/auth/audience) of Google Auth Platform and set up the app (Branding asks for an app name and your support email): user type **External**, your own address as contact. Add your Google address as a test user.
4. On the same Audience page choose **Publish app** and confirm, so the publishing status reads **In production**. Do not leave it in Testing: Google ends every authorization of a Testing app 7 days after consent, including the refresh token, and the plugin cannot renew it. The sync then stops with `invalid_grant` and you must connect again.
5. Open the [Clients page](https://console.cloud.google.com/auth/clients), choose Create client, type **Web application**, and add exactly one authorized redirect URI: `https://example.com/_emdash/admin/plugins/cookieless-analytics/search` (your site origin in place of example.com; the Search page shows the exact value with a copy button).
6. Copy the client ID and client secret from the dialog.
7. On the Search page, under Google Search Console, choose **OAuth client**, paste both and choose **Connect Google**.
8. Google shows "Google hasn't verified this app". That is expected for your own client: choose **Advanced**, then **Go to (app name)**, and approve read access to Search Console.
9. You return to the Search page. Pick the property in the property picker.

Two things to know:

- **Testing mode expires the connection after 7 days.** While the consent screen is in Testing, Google expires refresh tokens after 7 days and the sync stops with an `invalid_grant` error. Choose Publish app on the Audience page (Publishing status: In production), or use an Internal app in a Google Workspace organization, then connect again.
- **"Google hasn't verified this app"** is expected for your own private client. Continue through Advanced. Verification is not needed for a client only you use.

## Option 2: Service account

1. [Enable the Google Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com) in your Google Cloud project.
2. Open [Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts), create a service account, open it, then Keys, Add key, Create new key, **JSON**. The file downloads once.
3. In [Search Console users and permissions](https://search.google.com/search-console/users) open the property and add the service account email (`...@...iam.gserviceaccount.com`) as a user. Restricted is enough. A service account has no consent screen, so nothing expires.
4. On the Search page choose **Service account**, paste the whole JSON key and save.
5. Pick the property in the property picker.

The plugin signs a short-lived assertion with the key (RS256 through WebCrypto) and exchanges it for an access token. Access tokens are kept in memory until one minute before they expire; they are never stored.

## Bing Webmaster Tools

In [Bing Webmaster Tools](https://www.bing.com/webmasters), add and verify the site (or import it from Search Console). Then connect with an API key (the default) or with your own OAuth client; both read every site the Microsoft account can see. Pick the site in the Bing property picker afterwards: it lists the verified sites of the account (`GetUserSites`) and proposes the one whose host name equals the site's host name.

### API key

1. Open Settings, API access, and generate an API key.
2. On the Search page, under Bing Webmaster Tools, keep **API key**, paste the key and save it.

### OAuth client (optional)

Microsoft recommends OAuth 2.0 for the Webmaster API. The plugin follows Microsoft's description (authorize at `https://www.bing.com/webmasters/oauth/authorize` with scope `webmaster.read`, tokens at `https://www.bing.com/webmasters/oauth/token`, a refresh token valid until revoked, `Authorization: Bearer` on every API call).

1. In Bing Webmaster Tools open Settings, API access, OAuth client, and create a client. Any name works, for example `Cookieless Analytics`. Add exactly one redirect URI: `<site origin>/_emdash/admin/plugins/cookieless-analytics/search`, for example `https://example.com/_emdash/admin/plugins/cookieless-analytics/search` (the Search page shows it with a Copy button).
2. On the Search page, under Bing Webmaster Tools, choose **OAuth client**, paste the client id and the client secret, and choose **Connect Bing**.
3. Approve read access at Bing. You return to the Search page, which finishes the connection; the refresh token is stored encrypted (`bingRefreshToken`) and never shown again.

Not verified yet, because it needs real credentials and a live run: whether Bing accepts the bearer token on `ssl.bing.com` (Microsoft's OAuth example calls `www.bing.com/webmaster/api.svc`), whether Bing returns `state` (the plugin requires it), and whether OAuth calls escape the `ThrottleIP` limit at all: they leave from the same Cloudflare addresses as key calls. One community report (October 2026) mentions OAuth tokens rejected as invalid. Bing documents no PKCE, so none is sent.

### Throttling

Bing answers some calls from shared server addresses, such as Cloudflare's, with `400 ThrottleIP` while the same key works from other addresses. That is not a broken connection, and the plugin treats it as a state:

- The status shows **Throttled** with "Bing limits shared server addresses. The sync retries on the next scheduled run.", the code, and the time of the next attempt. The last successful sync and the stored rows stay as they were; no error replaces them. The code is written to the log.
- Inside one run a throttled call is retried once after a jittered wait of 2 to 5 seconds. Calls often pass between throttles, and one pass of the three calls is enough: Bing returns its whole window in each.
- Later runs try again after 5 minutes, then 10, 20 and so on, at most 2 hours and never later than the sync interval. A one-time cron task is scheduled for that time. After a success the normal interval applies again.

### Import from a file

When the API keeps refusing, import Bing's own export; this always works. On the Search page, **Import Bing data from a file** takes one CSV file at a time:

1. In Bing Webmaster Tools open Search Performance, choose the date range, and download the Keywords table and the Pages table (the download or export button of the report).
2. Import each file. A file with a Date column is stored on its dates. A file without one is stored on the day you choose, for example the last day of the exported range, the same way Bing's own weekly rows are dated on one day.
3. An import replaces, per day, only the rows of its table: importing keywords keeps the page rows and the daily totals of those days, and the reverse. A later API pull of the same days replaces them all with the API's rows.

The rows are the ones a pull writes: source `bing`, no country or device, position as `pos_sum = position * impressions`, pages as the site's page keys (other hosts are skipped), the newest three days provisional, days older than the backfill range (`backfillDays`, default 90) or not before today skipped. An import counts against the day's Search rows budget and is refused whole (`write_budget`) when it does not fit; import it after 00:00 UTC or export fewer days. The response names the table, the days, the rows stored and the rows skipped.

Microsoft does not document the export layout (the exact headers, whether the export has a Date column, its date format and delimiter), so the parser accepts these forms:

- comma, semicolon or tab separated, with or without a byte order mark, quoted fields;
- header names matched loosely: `Keyword`, `Keywords`, `Query` or `Search query` for queries; `Page`, `URL` or `Page URL` for pages; `Clicks`; `Impressions`; `Avg. Position`, `Average Position` or `Position`; `Date` or `Day`; other columns such as `CTR` are ignored. A file with both a query and a page column is refused (Bing stores no page with query pairs);
- numbers with thousands separators (`1,234`, `1.234`) and decimal commas (`4,5`);
- dates as `2026-03-06`, `3/6/2026` (month first, as Bing's US format; day first when the first part is above 12), `06.03.2026` or `/Date(ms)/`.

Limits: 500 KB per file (about 8,000 rows) and 50,000 rows; parsing a full file takes about 7 ms of CPU, inside the Workers Free plan's 10 ms. Split a longer export by date range.

How Bing data differs from Google data:

- Bing has no date parameter. Every pull returns Bing's whole window (about 6 months). A sync stores the days of the sync window; a Bing backfill stores the days from the start of its range that are not stored yet, newest first, as far as the day's rows budget allows.
- Bing's totals are daily. Its query and page rows come as weekly sums, each dated on one day of the week, so query and page tables are right for ranges of whole weeks and uneven day by day.
- Bing has no country or device breakdown and no stored page with query pairs. The Queries list of a page (the drawer on the Pages report) asks Bing on request (`GetPageQueryStats`) and keeps the answer for one hour.
- Position is Bing's average impression position, weighted by impressions like Google's.
- One pull costs three API calls and one comparison with the stored rows, then one database write (one delete and a few inserts) of the returned days that differ. Bing updates its data about once a week.
- Turn Bing off under Connections with **Turn Bing off**; stored rows stay until `searchRetentionDays`.

## Several sites, one connection

One Google connection and one Bing key serve every site whose traffic lives in this database: the local site and the client sites. Each site maps to one property per provider:

- the local site uses the settings `gscProperty` and `bingSiteUrl`;
- a client site keeps both in its registry record.

Select a client site in the site switcher and open the Search page to map it: the connection fields are hidden there (they belong to the main site), and the page shows that site's pickers, its status and its own backfill.

The property picker lists the properties the connected identity can see (unverified entries are hidden) and proposes one: a domain property `sc-domain:example.com` matches `example.com` and every subdomain; a URL prefix property matches its exact host name. Nothing is mapped until you confirm. A site without a property is skipped and shows "No property mapped for this site". To reach a property of another Google account, add the service account email or your OAuth user to that property as a user; for Bing, add the key owner as a user of the site or verify the site under that account.

A connected site (a remote satellite, see [multi-site.md](multi-site.md)) keeps its own Search connection and database; the master never syncs it. Paste the same service account JSON into the satellite and add its email to the property. If a property is unmapped or removed, the pair stops syncing and its stored rows stay until `searchRetentionDays`; deleting a client site offers to delete its Search rows.

Search pages are keyed by path on the site's canonical host (for a client site: its first registered host). Query strings, fragments and trailing slashes are removed, `http` and `https` are the same page, and pages on other hosts are ignored.

## Sync and backfill

- The `search` cron job runs hourly and pulls a site only every **Search sync interval** hours (`searchSyncHours`, default 6) per site and provider.
- Each Google pull fetches the last 7 days (today minus 7 to yesterday) and replaces the stored rows of the days whose rows differ; a day equal to its stored rows is not written again. The three newest days are marked provisional because Google keeps updating them for 2 to 3 days.
- The plugin asks for totals, pages, queries, pages with queries (at most `searchMaxRowsPerDay` rows per day, default 5000), countries and devices. It asks for a window of several days at once with the `date` dimension, so one call per grain returns every day of the window; each day is then cut to `searchMaxRowsPerDay` page with query rows by clicks, exactly the rows a one-day request returns. A window of one day sends the one-day request unchanged.
- The window adapts: it starts at 8 days, doubles (up to 32) while the biggest grain of a window stays under a quarter of Google's page of 25,000 rows, and halves when a grain fills a page, when Google answers 429 or 5xx, or when a window did not fit a run. Google recommends one day per query to keep its load low and notes that page with query requests get more expensive with the range; the adaptive window uses long ranges only for days with few rows.
- One run fetches up to three windows at once (18 calls; Google allows 1,200 queries per minute per site) and writes them one after the other.
- Every request of a run counts against **Sync request budget** (`syncSubrequestBudget`, default 40): provider calls, database statements and storage calls, because the Worker's per-invocation limit counts all of them. A run stops before the budget or after 40 seconds, then continues a minute later through a one-time cron task. See [limits.md](limits.md#search-sync) for the numbers. Errors are recorded per site and provider and shown in the status; other sites keep syncing. An expired or revoked connection (401 or 403) waits for the next sync interval; other failures (rate limits, server errors) are retried after 5 minutes, then 10, 20 and so on up to 2 hours (never later than the sync interval), so a failing provider is not called on every run.
- Two runs never overlap: a run takes the storage lock `search:lock` (60 seconds, taken over after a crash) and a second run that finds it ends at once.
- A backfill pulls an older date range in the same windows inside the same budgets. It survives restarts: the position only moves after a window is stored.
- The range is a number of days back from yesterday (`days`, 0 for everything the source offers) or a start date (`from`), and defaults to **Older Search days to load** (`backfillDays`, default 90). Google keeps about 16 months (490 days), Bing about 6 months (180 days); a longer range starts at that limit (`clamped: true` in the answer). A range in `days` ends at the newest missing day before the last 7 days (the regular sync pulls those), so a larger range extends the stored data and a stretch the sync missed (a source that was down for more than a week) is filled again; when no day is missing the answer is `stored: true` and nothing starts. A range with `from` runs as asked. Either way a stored day older than 7 days is never written again, so pulling it costs requests, not rows.
- The first connect of a source (mapping a property through the Search page or `search/map`) starts a backfill of the default range on `standard` and `dedicated`. On `small` nothing starts by itself: the owner presses Start and sees the estimate first.
- Every write counts against the day's Search rows budget ([limits.md](limits.md#rows-written-by-search)): on `small` 21,250 rows a day, and a pause while today's rows reach 60 percent of the write guard. A backfill therefore paces across runs and days; the status shows `nextAt`, the time of the next batch. While it runs, every run that stopped at the budget schedules the next one a minute later; after a 429 or 5xx it waits 5 minutes, doubling per failure in a row up to 2 hours. It can be canceled at any time. The status shows the days completed, the rows stored, the current window and an estimate of the time left.
- How often runs happen depends on the Worker's Cron Trigger: with `* * * * *` (recommended in [install.md](install.md)) a backfill continues every minute; with `*/15 * * * *` only every 15 minutes, whatever the plugin schedules.
- Rows are deleted after `searchRetentionDays` (default 800).

## Admin routes

All under `/_emdash/api/plugins/cookieless-analytics/`, admin only (`plugins:manage`) unless noted:

| Route | Body | Purpose |
|---|---|---|
| `search/status` (`plugins:read`) | `{ site? }` | Configured sources, sign-in mode, mapped property, last run, last error, a throttle (`status: "throttled"`, `message`, `throttleCode`, `nextAttempt`), row counts, rows per stored day (`perDay`), the missing days between the oldest stored day and the sync window as inclusive `[from, to]` runs (`holes`) and the provider's limit in days (`limitDays`), backfill progress (`completed`, `days`, `rows`, `window`, `etaMinutes`, `nextAt`), today's Search rows (`budget: { profile, daily, usedToday, defaultDays, retentionDays }`), provisional window |
| `search/test` | `{ site?, source? }` | Checks the connection and whether the mapped property is visible |
| `search/sync` | `{ site?, source? }` | Runs one pull for the site now |
| `search/backfill` | `{ action: "start" \| "cancel" \| "status", site?, source?, days?, from?, to? }` | Backfill control; start takes `days` or `from` (not both), default `backfillDays`, clamped to the provider's limit |
| `search/oauth/start` | `{ source? }` | Returns `{ url }` of the Google consent page, or Bing's with `source: "bing"` |
| `search/oauth/exchange` | `{ code, state, source? }` | Finishes the sign-in; the provider is found by the pending `state` when `source` is missing; answers `{ connected: true }` (Bing adds `source: "bing"`) |
| `search/import` | `{ site?, source: "bing", csv, day? }` | Stores a Bing Webmaster Tools CSV export for the site (at most 500 KB); answers `{ kind, days, rows, skipped, from, to }` |
| `search/properties` | `{ site?, source? }` | Property list with a suggestion for the site |
| `search/map` | `{ site?, source, property }` | Maps a property to the site (empty string removes it) |
| `search/connect` | `{ gscAuth?, gscClientId?, gscClientSecret?, gscServiceAccount?, bingEnabled?, bingAuth?, bingApiKey?, bingClientId?, bingClientSecret? }` | Saves the connection fields of the main site (an empty secret removes it); answers `{ google, bing }` with whether each is connected |

No route returns a token or a secret setting. Agents with the `sync:search` scope can run `agent/v1/search/sync` and `agent/v1/search/backfill` with an optional `site`; `read:search` grants the `search_*` reports.

## The Search page

- **Status strip**: per connected source the last sync, an error if the last pull failed (or Throttled with the next attempt), and backfill progress; the provisional window; **Sync now** and **Backfill**.
- **Import Bing data from a file**: shown while Bing is connected; see Import from a file above.
- **Status strip**, while a backfill runs: "Paced: N of M days done, next batch <time> UTC, estimated rows today X of budget Y".
- **Backfill dialog**: source and range: Last 30 days, Last 90 days (the default, or the `backfillDays` setting), Last 180 days, Last 12 months, Everything the source offers (with the provider's limit), or from a date. Each option shows its estimate before Start: the days not stored yet, the rows they write and the daily budgets they need. On `small` a warning repeats the estimate and the number of days the backfill takes.
- **Source switch**: All, Google or Bing for every tab.
- **Overview**: clicks, impressions, CTR and average position (total `pos_sum` divided by total impressions) with compare deltas, and a chart with compare and annotation markers. Only annotations that match the Search filters show (a note scoped to a query shows when that query is filtered or nothing is); the **Annotations** button hides them.
- **Queries, Pages, Countries, Devices**: tables with click to filter and export.
- **Positions, Cannibalization, Changes**: the SEO views below.
- The Pages report of the traffic pages adds impressions, clicks, CTR and position per page, and a Queries drawer per page, once the selected site has a connected and mapped source.

## Limits of the data

- Google reports with a lag of 2 to 3 days; the newest days change until they are final.
- Google anonymizes rare queries: they count in the totals but never appear as query rows, so query rows add up to less than the totals.
- A Search day is Google's reporting day (Pacific time), not your site's time zone.
- Countries are ISO 3166-1 alpha-3 codes as Google sends them (`DEU`, `USA`).
- Bing exposes fewer rows than Google, no country or device, and query and page rows as weekly sums.
- A search query is never joined to a visit. Search and traffic meet per page and period only.

## SEO views

Every number in these views is computed when you open them from rows the plugin already stores: the Search rows (page with query, query and page) and the daily page summaries of your traffic. No table, job or provider call is added, except the one Bing drill-down below.

### Coverage

"Based on Google Search Console data of the stored page and query rows. Google omits rare queries and keeps top rows only, so shares are of visible queries." Google returns top rows only and never guarantees all rows; anonymized queries (fewer than a few dozen users in two to three months) have no row at all; the API returns at most 50,000 rows per day per site and type, and the plugin stores at most `searchMaxRowsPerDay` page with query rows per day (sorted by clicks, Google's order). The newest two to three days are incomplete and marked provisional; days are Pacific time. Bing has no country or device, no stored page with query rows, and updates weekly, so the cannibalization lists and striking distance are Google data: "Bing exposes page and query pairs only per page or per query on request; the lists are Google data". The Cannibalization tab shows the visible share: page with query impressions over all impressions of the range.

### Range

Every view reads at most 93 days: "This view reads detailed rows and is limited to 93 days. Choose a shorter range." The presets Last 12 months and Year to date show that text instead of data. The reason is cost: a view reads about `searchMaxRowsPerDay * days` rows per statement, 150,000 at 30 days and 465,000 at 93 days with the default of 5,000, and the Cloudflare Free plan allows 5 million rows read per day. See [limits.md](limits.md) for the arithmetic.

### Cannibalization

A query is cannibalized in the range when two or more pages of the site have impressions for it and each counted page holds at least `minShare` percent of the query's impressions in the range (setting `searchOverlapMinShare`, default 10), and the query has at least `minImpressions` impressions in the range (setting `searchMinImpressions`, default 50). Queries containing a term of `searchBrandTerms` (case-insensitive substring, one term per line) are excluded unless brand queries are included. Best page per query: most clicks, then better (lower) position, then more impressions.

Pattern labels describe the numbers; they are not advice:

- **Dominant**: the best page holds at least 70 percent of the query's impressions and has the best position.
- **Split**: no page holds 50 percent.
- **Inverted**: the page with the most impressions has a worse position than another counted page.
- **Shared**: anything else.

The queries view lists at most 200 queries with up to 10 pages each, sorted by impressions; the pages view lists every competing page with its overlapping queries, impressions and clicks. A page drill-down shows the other pages it competes with and the shared queries; a query drill-down shows its pages, for Bing loaded on request and cached for one hour (`GetQueryPageStats`). Compare is not offered here, and country and device filters do not apply (the stored pairs have neither).

### Position bands

Bands are `1-3`, `4-10`, `11-20`, `21-50` and `51+`, assigned from the average position (`SUM(pos_sum) / SUM(impressions)`) of the query or page in the period, rounded down: half-open intervals `[1,4)`, `[4,11)`, `[11,21)`, `[21,51)` and `[51,inf)`. A position of 3.99 is in `1-3`, 4.0 in `4-10`, 20.99 in `11-20`, 21.0 in `21-50`. The bands are fixed so templates and shared pages compare across sites.

- **Bands**: queries (or pages), impressions, clicks, CTR and impression share per band.
- **Bands over time**: per day up to 31 days, per ISO week beyond.
- **Movement**: a query is present in a period only with at least `minImpressions` impressions there. The matrix counts queries per previous and current band, plus `new` (current only) and `lost` (previous only); the lists show the queries that moved up, down, appeared or disappeared.
- **Striking distance**: page and query pairs with an average position from 4 to under 21 and at least `minImpressions` impressions, brand terms excluded unless included. `potential clicks` (an estimate, labeled est.) is `impressions * max(0, ctr_1_3 - ctr)`, where `ctr_1_3` is the site's own CTR of band `1-3` over the same range and source; it is shown only when that band has at least 1,000 impressions, otherwise "not enough top band data". No generic CTR curve is used.

### Rising, declining and decay

Period rule for every view that compares periods: `n = to - from + 1`, at most 93 (`range_too_long` above); the newest final day is the newest day with `provisional = 0` for the selected source (with All, the older of the two sources); the current period ends at the earlier of the range end and that day, the previous period is the `n` days before, and decay adds the `n` days before that. The views show the period line, for example "Comparing 2026-10-14 to 2026-11-10 with the 28 days before; the newest 3 days are excluded as provisional". Without the shift, a current period with incomplete days would show a fake decline in every row. The traffic views end at the newest day stored in the daily summaries, because a day is stored only once it is closed (usually two days before today).

- **Movers** (Search, Changes tab): pages or queries, rising or declining, by clicks or impressions; only keys with at least `minImpressions` impressions in one of the two periods; sorted by the absolute change. `delta_pct` is empty when the previous value is 0.
- **Movers** (Pages, Changes tab): the same over page views of the daily summaries; the floor applies to page views, and session filters do not apply (summaries are per page).
- **Notable**: `abs(current - previous) > 2 * sqrt(current + previous)`. The difference of two counts varies by about the square root of their sum, so smaller changes are likely noise. It is a heuristic for count data, not a statistical test. A position change is flagged when it moves by 1 or more and both periods meet the floor.
- **Decay**: pages whose clicks (page views on the Pages tab) fell in each of three consecutive periods of length `n` (`oldest > middle > current`) with at least `minImpressions` impressions in the oldest. Diagnosis: **Position** when the current position is worse than the oldest by 2 or more, **CTR** when the current CTR is under 75 percent of the oldest with a stable position, otherwise **Demand** (fewer searches). The diagnosis names what changed in the stored numbers, not why.

## Annotation impact

The impact view compares one metric before and after an annotation (or any date), over equal windows, with the page's filters carried over. Open it with Details on a row of the Annotations page (`?a=<id>` in the URL), or with "Impact of a date" there; a chart marker's "Open in Annotations" goes to the row.

- **Windows**: the page's window, 7, 14 (default) or 28 days (agents and dashboard tiles also take 60 or 90; their default is 28). The annotation day belongs to neither window, because the change happened during it. The after window runs from the day after to the annotation day plus the window, cut at yesterday and, for Search metrics, at the newest final Search day; the before window has the same number of days and ends the day before the annotation. While the after window is shorter than the chosen window the panel says so: "The after window has n of 28 days; numbers will change."
- **Scope**: by default the annotation's scope becomes filters: a page rule a page filter, a host rule a host filter on traffic, a query rule a query filter on Search. Host rules do not apply to Search data and query rules do not apply to traffic data; the panel says so and suggests a Search metric for a query scoped annotation. Choose Site-wide to ignore the scope, or pick a page; publish and update annotations carry the page path the hook derived.
- **Result**: before, after and the change; Notable for counts (the rule above), the base of a rate with its name (`measured.base`: sessions, page views, entries, orders, visitors, measured sessions, page loads for the back/forward rate, or impressions); the daily series with the annotation day marked; the other annotations inside both windows.
- **Caution**: "Before and after comparisons show correlation, not causation. Seasonality, other changes and search engine updates overlap; annotations in the same window are listed." The view never claims a cause and shows no confidence percentage: count data with seasonality does not support one honestly.

