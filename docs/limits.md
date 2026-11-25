# Limits

Wiki: [Capacity Profiles and Cloudflare Plans](https://github.com/infinitnet/cookieless-analytics/wiki/Capacity-Profiles-and-Cloudflare-Plans).

The numbers on this page are the budgets the code enforces, the cost it is tested against, or a value measured on production D1 (the table below). Where a figure comes from published Cloudflare limits or is an estimate, it says so.

A D1 database executes queries one at a time and holds at most 10 GB, which cannot be raised. The Workers Free plan allows 100,000 rows written and 5 million rows read per day per account, and 500 MB per database.

## Capacity profiles

The `capacityProfile` setting sizes the default storage budget of the analytics tables (the `storageBudgetMb` setting changes it, see [Storage budget](#storage-budget)), the requests a background run (summaries, retention) may spend, and the caps of the daily summaries.

| | `small` | `standard` (default) | `dedicated` |
|---|---|---|---|
| Default storage budget | 300 MB | 6 GB | 9 GB |
| Requests per background run | 40 | 400 | 400 |
| Scan budget (visits a detailed report may read) | 50,000 | 500,000 | 500,000 |
| Pair rows per site and day | 340 | 7,500 | 15,000 |
| Cube cells per site and day | 150 | 1,000 | 1,000 |
| Journey step rows and three step paths per day | 200 and 50 | 2,000 and 500 | 2,000 and 500 |
| Write guard | yes | no | no |
| When to choose | Workers Free (a database there holds 500 MB) | Workers Paid, analytics in the EmDash database | Analytics in a database of its own (`database` or `databases` option) |

A report over a range that holds more visits than the scan budget is answered from the daily summaries when every filter applies there; otherwise it reads detailed rows up to 4 times the budget, and beyond that it answers `narrow_range` with the longest range that fits.

## Measured on production D1

One Worker in a European data center writing to a database whose primary is in Western Europe, on a Workers Paid and a Workers Free account. Other regions were not measured.

| Figure | Value | Source |
|---|---|---|
| Small write, end to end from the Worker | about 25 to 29 ms p50 (SQL time 0.2 ms) | production D1 |
| Page view write plus engagement update | 51 to 58 ms p50 | production D1 |
| Sustained load | 100 requests per second with two statements each (200 statements per second) ran without an error; no overload seen | production D1 |
| CPU of a stub ingest request (user agent check, one SHA-256, one statement) | 1.15 ms p50, 3 ms max | production D1, Free account |
| Bytes per page view as inserted | 383 (5,000 page views, 2,124 visits); 389 on the Free account with 1,000 page views | production D1 |
| JSONB against text storage | JSONB 17 percent smaller on the same rows | production D1 |
| Storage estimate against the measured size | ratio 0.76 for text (measured); about 0.92 for JSONB is derived from the 17 percent JSONB saving, not measured | production D1 |
| Rows written per page view | 3.3 with the typical mix (3.9 with the later retention delete), computed from the measured statement costs | production D1 |
| Queue `send()` | 30 to 67 ms (median 42.5 over 10 warm sends, 174 ms for the first); 33 of 33 messages delivered | Cloudflare Queues, same Worker |

Not measured: the Free plan's page views per day (an estimate from rows written is about 25,000 page views a day across all sites of an account; this is an estimate, not a measurement), rates above 200 statements per second and the overload error itself, the CPU and latency of the plugin's real request path and of hosts far from the database region, the queue consumer's throughput on Cloudflare, several D1 bindings in one Worker and the write rate a second database adds, the Postgres paths beyond the Neon run in [Postgres through Hyperdrive](#postgres-through-hyperdrive), and the D1 and Durable Object Free row pools.

## Write cost per event

Each visit is one row that holds its page views and events (`ca_sessions`).

| Event | Statements | Rows written |
|---|---|---|
| Page view or event on a known visit | 1 | 1 |
| First page view of a visit | 2 (1 read, 1 insert) | 2 (the row and its one index) |
| Page view from a second tab | adds 1 | adds 1 (alias row) |
| Engagement update | 1 | 1 |
| Order | 2 | 3 |
| Duplicate order | 2 (the insert, and the guarded repair of a missing entry) | 0 |
| Replayed page view or event (client retry, queue redelivery) | 2 | 0 |
| Replayed engagement update | 1 | 1 |

With the typical mix (0.464 visits, 1.5 engagement updates, 0.231 events and 0.1 aliases per page view) that is about 3.3 rows written and about 3.9 statements per page view (3.86 on the SQLite meter of the tests); the later retention delete adds about 0.6 rows.

## Storage budget

The budget of the analytics tables is the capacity profile's default, or the `storageBudgetMb` setting in whole megabytes (0 is the default). Each database has a range of its own:

| Database of the analytics tables | Default (setting 0) | Allowed | Warning above | Strong warning above |
|---|---|---|---|---|
| Any D1 database with the `small` profile | 300 MB | 50 to 450 MB | 300 MB | 400 MB; in the EmDash database also budget plus the rest of the database above 475 MB |
| The EmDash database (D1), `standard` or `dedicated` | 6,000 MB, or 9,000 MB with `dedicated` | 100 to 9,000 MB | 6,000 MB | 8,000 MB, or budget plus the rest of the database above 9,500 MB |
| An own D1 database (`database` or `databases`), `standard` or `dedicated` | 6,000 MB, or 9,000 MB with `dedicated` | 100 to 9,500 MB | 9,000 MB | none |
| Postgres (`engine: "postgres"`), any profile | the profile's default | 100 to 2,000,000 MB | none | none |

A D1 database holds at most 10 GB and refuses writes when it is full; on the Workers Free plan a database holds 500 MB (published Cloudflare limits). The EmDash database shares that space with the site's content, media records and revisions, so the budget there stops at 9,000 MB. An own database leaves 500 MB for what the estimate does not count: Search rows, aliases and space freed by deletes.

The save refuses a value outside the row, for example "Use 0 for the default, or 100 to 9000 here: the EmDash database holds 10 GB including the site's content." While any site's analytics tables are in the EmDash database, its row applies to the whole setting. A value saved before the database option changed is clamped to the new database's range when it is read. A changed budget or profile takes effect with the next retention run, which starts over with a fresh estimate.

The warnings are worked out from the budget in effect (the default included). The Settings page shows the warning of the typed value under the field as it changes, and the Data page lists the stored value's warning under Needs attention:

- `small`, above 300 MB: "A database on the Workers Free plan holds 500 MB including the site's content."
- `small`, above 400 MB: "A database on the Workers Free plan refuses every write at 500 MB. When it is full, recording stops, and in the EmDash database the CMS cannot save content, until data is deleted."
- EmDash database, above 6,000 MB: "Above 6 GB the stored visits and summaries leave less than 4 GB for the site's content, media records and revisions in the same database."
- EmDash database, above 8,000 MB, or when the budget plus the rest of the database is above 9,500 MB at any budget: "D1 refuses every write at 10 GB. When the database is full, recording stops and the CMS cannot save content until data is deleted. Give these tables their own database before raising this further." The rest is about the database's live size less the last analytics estimate (a day old at most; it does not count Search rows and aliases, so the rest errs high).
- Own D1 database, above 9,000 MB: "Search data, aliases and space freed by deletes are not part of the estimate. Above 9 GB there is less than 1 GB of headroom for them."

`dedicated` in the EmDash database defaults to 9,000 MB and so shows the strong warning: that profile is meant for an own database.

### Live database size

The Data page shows the size of the database now, content included. An own D1 database reports it with every statement (`size_after`). For the EmDash database the page runs one statement on the Worker's one D1 binding that no database option names (`DB` in EmDash's Cloudflare template), whatever its name, and reads its `size_after`. With no such binding, or more than one, no size is shown, the Database line says so, and the storage line keeps the estimate. From 80 percent of the most a D1 database holds (10 GB, 500 MB on `small`) the Data page shows a warning, for example "The database holds 8.1 GB of the 10 GB a D1 database can hold.", and from 90 percent a critical notice with the strong text above (for an own database: "D1 refuses every write at 10 GB. When this database is full, recording stops until data is deleted. Lower the storage budget or delete old data."). Not measured: `size_after` on the EmDash database's binding of a real site (the own database figure is the one the storage estimate already reads).

### Estimate

Storage is estimated without a table scan, once a day:

bytes = (visits x 290 + (page views + events + link impressions) x 115 + summary rows x 75) x 1.1

A quarter of the budget is reserved for summaries (with the default budgets: `small` 75 MB, `standard` 1.5 GB, `dedicated` 2.25 GB); the detailed visits use the rest (225 MB, 4.5 GB, 6.75 GB). The quarter is a reservation, not a cap: the size of the summaries is bounded by the profile's row caps (see [Many client sites](#many-client-sites)), which do not grow with the budget. When the detailed data exceeds its share (75 percent of the budget), the detailed window shortens to the newest whole days that stay below 95 percent of the share, and older days are answered from daily summaries. The three constants are the sizes measured with `dbstat` on SQLite in the verification runs (1,000, 10,000 and 100,000 page views a day, real-site paths, documents grown in place): 657 to 670 bytes per visit of 3.25 entries, and 74 to 81 bytes per summary row. The factor 1.1 (`STORAGE_SAFETY`) is a margin for D1 page overhead, which was not measured with JSONB documents on D1; it puts the estimate 9 to 12 percent above the measured sizes. Against the production D1 measurement (text documents inserted whole, 383 bytes per page view) the estimate is 0.76 of the measured size; about 0.92 after the 17 percent JSONB saves, a derived figure, not a measurement. On synthetic traffic with tiny pages the estimate errs high (ratio 1.37), and on a small summary table (about 11,000 rows) a row takes about 94 bytes. With an own D1 database the estimate also reads the size D1 reports (`size_after`) and follows it up to 1.5 times the estimate, never lower.

Estimates for 25 months (760 days) of detail with the typical mix: the formula gives about 340 bytes per page view (measured on SQLite: 318 to 323 for every detailed table together).

| Default budget of the profile (detail share) | 25 months of detail at about 340 bytes per page view |
|---|---|
| `standard` (4.5 GB) | about 17,500 page views a day |
| `dedicated` (6.75 GB) | about 26,200 page views a day |
| `small` (225 MB) | about 660,000 page views in total (about 22 months at 1,000 a day) |

These are estimates; a budget set with `storageBudgetMb` scales them in proportion. The storage line of the Data page reports the estimate for your own traffic.

## Write guard (small profile)

With `small`, ingest stops for the rest of the UTC day once the estimated rows written of the day reach 85,000 (85 percent of the Free plan's 100,000), so the CMS can still save content. The estimate counts the visits started since 00:00 UTC and their page views, events and link impressions, and adds the rows counted elsewhere: 1 x visits + 2.6 x page views + events + link impressions + 2,500 fixed, plus the rows Search syncs wrote today and the rows retention deleted today (a deleted row is a written row). The weights are the rows an event costs at ingest: a visit 1 beyond its first page view (table and vkey index), a page view 2.6 (its entry, 1.5 engagement updates and 0.1 second-tab aliases), an event 1, a link impression 1 (stored in the visit like an event, but not counted in its events, so the guard counts the impressions in the visit documents); on generated traffic they match the rows meter of the tests exactly, also for an event-heavy site and for a site whose visits hold mostly link impressions. With the production mix (0.464 visits and 0.231 events per page view, about 3.3 rows per page view) 25,037 page views give 84,997 rows (open) and 25,038 give 85,001 (blocked) on a day without deletes; with the steady retention deletes of an earlier day of the same traffic (about 0.56 rows per page view) 21,378 page views stay open and 21,379 block. A site that sends 10 events per page view stops near 6,300 page views. Retention deletes at most 2,000 rows per run and 15,000 per UTC day on `small` (one statement may pass either), so a backlog cannot spend the day's allowance. It is checked hourly while below a quarter of the limit (21,250 rows), then every 10 minutes, so a burst would need about 24,000 page views in one hour to pass the Free plan's 100,000 before the next check; each server instance keeps the answer until the next check, so the guard costs no statement per event. A failed check lets writes through for 60 seconds.

While blocked, page views and events get `503` without `Retry-After` (the page script does not send them again) and are counted as `budget_blocked`; the Data page shows "The daily write allowance of the small profile is nearly used. Recording resumes at the next UTC day." Events from `agent/v1/events` are not guarded.

The guard is per database, while the Free plan's daily rows are per account. With several databases on the Free plan, keep one database.

## Overload and refused events

Page views and events are written before the event route answers: 204 when stored (or dropped by a rule), `503` with `Retry-After: 5` when the write fails. On the collect path the middleware answers `503` without `Retry-After` when the host's route dispatcher is missing or throws: the event did not reach the route, and the page script does not send it again. A write that fails with an overload error is tried once more on the server after 50 to 200 ms first. Engagement updates are written after the answer, which is always 204.

The page script sends a page view or event refused with `Retry-After`, or lost to a network failure, again up to 3 times: after 5 to 7.5 s, 15 to 22.5 s and 45 to 67.5 s (65 to 97.5 s in total), only while the page stays open. Bursts of about a minute are absorbed that way; longer ones lose events. A `503` without `Retry-After` is not sent again.

Every refusal is counted per site, day and reason:

- `overload`: D1 refused the write as overloaded.
- `daily_limit`: D1 refused the write with the Free plan's daily row limit.
- `write_error`: any other failed write (for example a missing database binding).

The Data page lists them in its "Not recorded" table for today and the last 7 days. It shows a notice when events could not be stored because of overload, suggests the queue tier when overload drops occur on the direct tier, and suggests the `small` profile when the last 7 days hold `daily_limit` drops and the profile is not `small`. The counts are a lower bound: each server instance flushes them every 10 seconds, so an instance that stops loses up to 10 seconds of counts.

## Ingest tiers

Where page views, events and engagement updates are written (setting `ingestTier`). The queue tier is used only when the `CA_QUEUE` binding exists. Error pages are always written directly. Measured figures come from the setup described under [Measured on production D1](#measured-on-production-d1); not measured means a published Cloudflare limit or an estimate.

| Tier | Request path | Measured | Not measured |
|---|---|---|---|
| Direct to the database (default, every plan) | One write statement per page view or event before the answer; engagement after it. | About 25 to 29 ms p50 per small write end to end. 100 requests per second with two statements each ran without an error. About 3.3 rows written per page view. | Sustained rate above 200 statements per second; behaviour at overload (the answer is 503 with `Retry-After` and the page script retries, see [Overload and refused events](#overload-and-refused-events)). |
| Queue (optional, needs the `CA_QUEUE` binding and the consumer Worker, see `consumer/README.md`; in practice Workers Paid, see the last column) | One queue send per page view, event or engagement update; a failed send writes directly. | `send()` takes 30 to 67 ms (median 42.5 ms over 10 warm sends, 174 ms for the first send of an isolate), so a request is not faster than with direct writes. 33 of 33 sent messages were delivered. Rows written per page view are those of the direct path (the consumer runs the same statements; a redelivered page view or event costs 0 rows, a redelivered engagement update 1). | Consumer throughput. Intake up to 5,000 messages per second per queue and a backlog of up to 25 GB (published limits). Cost: 3 queue operations per message, about 8 per page view with the usual mix. On the Free plan, 10,000 operations per day allow about 1,200 page views a day. |
| Own database (option `database` or `databases`, any tier) | As the tier it is combined with; the analytics tables are in a second D1 database, or in one database per routed site. | Per statement as for direct writes. The summary writer: one round trip per closed day instead of one per statement (6 days of synthetic traffic on a test binding: 66 round trips with a statement loop, 42 with `batch()`, same 67 statements). | Each database has its own limits (10 GB, single writer). Write rate and latency against a second database. |

What the queue tier is for: it keeps answering requests while the database is overloaded and holds bursts in the queue instead of refusing them, at the price of reports lagging by the backlog. A queued message holds no IP address, no user agent string and no query parameter that would not be stored; a message whose writes keep failing for about 2.5 hours moves to a dead letter queue (see `consumer/README.md`); queued messages cannot be reached by the delete tools until the consumer has written them.

## Own database and site routing

- `database: { binding: "CA_DB" }` ([install.md](install.md#own-database-for-analytics)) puts the analytics tables in a second D1 database with its own 10 GB and its own writer; KV, settings and storage collections stay in the EmDash database. A missing binding makes writes fail (503, `write_error`); there is no fallback to the EmDash database. The storage estimate reads that database's `size_after`, and the summary writer sends a day's statements in one round trip (`batch()`).
- `databases: { default?: "CA_DB", sites: { "<siteId>": "CA_DB2" } }` ([install.md](install.md#one-database-per-site)) gives chosen sites a database each, with at most 500 entries and not together with `database`. Each database has its own 10 GB, writer, storage budget and write guard. Background tasks run once per database and split the profile's requests between them (two databases on `small`: 20 each), so each database catches up more slowly.

The Free plan's daily rows written and rows read are per account, so a second database does not raise them; its 500 MB limit applies to each database. Retention settings apply per database, to every site in it. Not measured: whether a second database adds write rate, and several bindings on real D1.

## Postgres through Hyperdrive

Setup and the provider table: [install.md](install.md#postgres-through-hyperdrive). Measured on a real Worker with Hyperdrive and a Neon database (Workers Free, `pg` 8.23.1):

- Per statement: 14 to 19 ms with the Worker in Paris and the database in Frankfurt, 3 to 6 ms with `placement.region` set to the database's region. A transaction of 5 upserts took 98 to 99 ms without placement and 41 to 51 ms with it (one later run read 93 ms). An ingest request of the plugin took about 100 to 185 ms of wall time with placement (several statements in a row; waiting is not CPU time).
- Reports over one day of a database that held the 60 page views of that run: overview 38 ms, pages 63 ms, sources 26 ms, countries 16 ms.
- A Neon database that scaled to zero answered its first statement in about 700 ms. It is the first statement that is slow, and the statement timeout covers it: 5 s per statement on the event route, 15 s elsewhere.
- 20 concurrent clients with 5 upserts each on 4 shared keys gave the exact sums and no errors.
- Query caching on: 2 of 4 page views lost and failed requests; with caching disabled, 4 of 4 and every engagement update.

Workers Free: Hyperdrive allows 100,000 statements a day (published; reset at 00:00 UTC). On Postgres a page view costs the same statements as on D1, counted on Postgres 18 in PGlite by `tests/performance.test.ts`: 2 for a new visit, 1 for a page view on a known visit, 1 per engagement update; a single statement is sent without begin and commit. Each new isolate adds 7 (the schema check and the query cache check). At the typical mix of about 3.9 statements per page view ([Write cost per event](#write-cost-per-event)) that is about 25,000 page views a day, less what background tasks, admin pages and new isolates use. Over the allowance Hyperdrive refuses statements until 00:00 UTC; the plugin then answers page views and events `503` and counts them as not recorded. Statements on an open connection do not count as subrequests; each new connection counts as one, and 51 connections in one invocation failed where 50 passed. Hyperdrive keeps at most about 20 connections to the database per configuration on Free and about 100 on Paid (published); the plugin opens one connection per request. The 10 ms CPU limit was not hit in the Neon run (60 ingest requests, and loops of up to 400 statements in one request). The Small profile's daily write guard and the row caps apply to D1 only, so on Postgres nothing stops writes before the statement allowance runs out; on Workers Free D1 stays the better default. Workers Paid has no daily statement limit.

What stays as on D1: plugin state, settings and the configuration collections are in the EmDash database; the per run request budget of the profile is unchanged. The queue tier is not used with Postgres: writes always go direct. There is no 10 GB cap: the storage budget (up to 2,000,000 MB) is what keeps a small hosted plan from filling up. The storage estimate uses the byte sizes measured on SQLite; the same rows took up to 2.84 times that space on Postgres 18 in PGlite (Postgres in WASM, `pg_total_relation_size` against SQLite `dbstat`), so set the budget with room. The Data page shows the database's live size from the Postgres catalog.

Other providers and pooled endpoints (PgBouncer, Supavisor) behind Hyperdrive should work the same way; the runs above used Neon. The tables use `COLLATE "C"`, so key ranges should not depend on the database's default collation (the Neon database used `C.UTF-8`).

## Scale-out ladder

From the smallest step:

1. `small` profile on Workers Free, with the write guard.
2. `standard` profile on Workers Paid.
3. The queue tier, for bursts and overload.
4. An own database (`database`) with the `dedicated` profile.
5. Site routing (`databases`): one database per busy site.
6. A second install.

## Detailed reports on the visit layout

A visit is one row that holds its page views and events; orders and events reported by the site's server are rows of `ca_events`, error pages counters in `ca_srv`. Every report over detailed data reads one key range per table, `(site, day, ...)`, and never rows of other sites or days. Most reports cost 1 to 4 statements; `goals` costs one more per ten active goals.

What changes compared with storing one row per page view:

- A page view or event counts on the day its visit started, also when the visit runs past midnight. Totals over a range are the same, except at the ends of the range: page views after midnight of a visit that started on the last day are inside the range, those of a visit that started the evening before the first day are outside it. Per day charts move such page views to the visit's day.
- Visitors are counted once per day and summed over days, as before; a visitor whose visit crosses midnight now counts on one day only, so a per page or per event visitor count can be lower by those visitors.
- Orders and events reported by the server count on their own day, not on the visit's day. An order placed after midnight in a visit that started the day before counts on the next day in the revenue reports, while the visit's page views count on the day before. The revenue hour chart uses the order's own time.
- Filters on a page, an event, an event property or a goal match a visit when any of its page views or events matches, wherever in the visit it happened; before, only the page views and events inside the range counted.
- Events the site's server reports for a visit on a closed day (more than about two days old) keep the visit on their row, so revenue and links attribute them, but are not added to that visit's page views and events: see the next section.
- Events the site's server reports without a session id appear in the revenue reports and in `links`, in the session dimensions as `(not set)`, and in no other report. An event whose session id has no visit of the last seven days is not stored: it is rejected as `invalid_sid` (see [revenue.md](revenue.md)); send it again without `sid` to store it unattributed.
- The Not found report counts error pages per day, path and referring page; the time of each request is not kept, only the time of the last one.
- The number of client sites' page views today on the Sites page counts the page views of the visits that started today.

## Many client sites

Each rollup tick stores the closed days after the watermark, site by site, within the request budget of the capacity profile, and keeps its position between ticks. A closed day is written once; today and yesterday are not stored. Hundreds of active sites on one install make the catch-up take several ticks, and the watermark moves only when every site holds the day. Keep the number of active sites per install in the tens, or split them across installs.

A closed day stores one row per dimension value, at most 500 pages (also entry and exit pages, `TOP_N`) and 200 values of every other dimension (the rest summed into `(other)`). Besides those it stores pair rows (page, entry page, source, campaign, event and goal, each by channel, country and device), so old ranges can answer one of those filters together with a breakdown. Some filters the summaries cannot answer at all: an excluding operator (is not, does not contain, does not start with, does not match) on page, event, goal or campaign, or on anything in a revenue report; browser, operating system, exit page or language in a revenue report; and a filter on the report's own dimension in Events, Goals, Exit pages and the revenue breakdown by page, event or goal. Inside the detailed window such a report reads the detailed rows; before it the filter is not applied and the answer names it (`filter_unavailable`). The revenue breakdown by campaign from the summaries shows no visitors for its "(not set)" row. Per site and day they are capped at 340 rows on `small`, 7,500 on `standard` and 15,000 on `dedicated` (link pairs included); the rows beyond the top of a pair are summed into `(other)`, so totals stay exact. A cube of channel x country x device (and its orders per currency) lets old ranges combine those three filters for totals, the series and their own breakdowns: at most 150 cells a day on `small` and 1,000 otherwise, the smallest countries summed into `(other)`. Links and journeys add their own rows: per day the top 200 links and 200 placements (and their conversion values per currency), at most 2,000 journey step rows and 500 three step paths (`small` 200 and 50). On synthetic traffic of about 400 page views a day with nearly unique pages, a closed day writes about 4,000 summary rows, once (74 to 81 bytes a row on SQLite in the verification runs, 75 x 1.1 in the estimate). With every cap reached, 25 months of summaries fit the quarter of the budget on `standard` and `dedicated`; on `small` the share holds about 1,200 summary rows a day, so a site with many distinct pages outgrows it.

## Late writes and closed days

A day's summary is stored once the day is closed: 15 minutes after the local midnight that starts the day after next, past the reach of the event path (a page view, event or engagement update reaches visits started on its own day or the day before). Nothing written later is folded into a stored day, so a write that could change a closed day is not made, and is counted as `late_after_close` on the Data page:

- Queue tier: a queued page view, event or engagement update that is applied after 00:15 (site time) of the day after its own day is not written: by then the day before its own, the earliest day its visit can have started on, may be stored. Messages are applied within seconds while the database answers, so this happens only to messages that waited in the queue across that time (an outage or a backlog of up to the consumer's 2.5 hours of retries). Some of them belonged to a visit that was still open; they are refused all the same, which keeps the detailed and summary answers equal.
- `agent/v1/events`: an event whose visit started on a closed day is stored with its visit (orders keep their attribution in the revenue reports), but the visit's document and its event count are not changed. Revenue itself is reconciled by the `revenue` task.

Days summarised before 1.3.0 keep the figures they were stored with (the Links sessions, the paying sessions rule, and no link impressions for the storage estimate); run the roll-up tool (`tools/rollup-now` with a `from` and `to` range) over the detailed window to recompute them.

## Filtered delete

Delete matching visits on the Data page ([privacy.md](privacy.md#deleting-data)) is read-only until confirmed. The preview reads the matching visits of the range once per question (a range is at most 400 days), plus the summary row counts of its closed days.

The job then runs in bounded calls. Each call deletes at most 500 visits per statement, the orders and events of those visits first, and saves its position in plugin state after every chunk, so an interrupted call repeats at most one chunk and deleting twice does nothing. A day is marked for storing again, and the mark saved, before its first rows are deleted (one more save per newly marked visit or order day), so a call lost after its delete still gets the day stored again. The counts in the progress and in "Recent deletions" come from the calls that saved after their delete: a call lost between its delete and its save is not counted, so they can be lower than what was deleted. A closed day is stored again once no later chunk can change it (orders come on or after their visit's day). Every call stays inside the request budget of the capacity profile (40 on `small`, 400 otherwise), less 20 for the first call (it shares the invocation with the preview) and less 8 for the page's later calls and the cancel, which leaves room for the host's own queries. The page continues the job while it is open; otherwise the hourly `retention` task continues it with the requests retention left. One job runs at a time.

Rows written: 2 per deleted visit and per deleted `ca_events` row (the row and its index entry), plus the summary rows that change on each closed day stored again (estimated as at most 40 per deleted visit or order, never more than the rows the day holds). Deleting the whole summaries of an older day writes one row per summary row.

On `small` the job writes at most 15,000 rows per UTC day and waits for the next UTC day while the write guard's estimate for today is at 51,000 rows (60 percent of the guard) or more, so recording keeps priority. Its rows count toward the guard's estimate like the rows retention deletes. The preview shows how many UTC days the job takes on `small`. Other profiles have no daily cap.

## Definition field suggestions

The goal, funnel step and channel rule fields of Definitions, and the key fields of an annotation target, read the last 90 days only after the field has focus: one `dimension_values` request per dimension, answered from memory while the list holds fewer than 50 values, a prefix request otherwise. Outbound link hosts come from one `outbound` request of at most 500 links, event properties from one `event_props` request per event. Each request reads the visits of its range like any detailed report, so on the Workers Free plan a form that is opened and left alone costs nothing.

## Search sync

The Worker's per-invocation request limit ("Too many subrequests by single Worker invocation"; 50 on the Free plan, measured on a Free account; on a paid plan Workers allow 10,000 subrequests and D1 1,000 queries per invocation, published limits) counts every outbound fetch, every D1 statement and every plugin storage call (storage lives in D1). The host's cron executor runs every due plugin task in one invocation and spends some of it on its own bookkeeping, settings and storage reads. A Search run therefore meters all three kinds against **Sync request budget** (`syncSubrequestBudget`, default 40, 20 to 950) and stops before it: before each window it checks room for the window's calls and writes, before each write it reserves the exact statement count, and 3 requests stay reserved for the end of the run (cursor, lock, pair state). Keep 40 on the Free plan; on a Paid plan set it to about 900.

Cost of one Google window (any length up to 32 days): 6 provider calls (one per grain; more only when a grain pages past 25,000 rows), 1 DELETE plus 1 insert per 400,000 characters of rows (about 3,000 rows; each insert binds one JSON array, so the 100 parameter limit never applies), and 1 storage write for the position. One read counts the stored rows per day, and days that have stored rows are compared with the pulled rows (one more read per 400,000 characters of rows); only the days that differ are deleted and inserted, and a window equal to what is stored writes no row. A day over about 3,000 rows is always replaced.

Measured on the synthetic Google of the tests (`tests/sources-batch.test.ts`: about 186 rows a day: totals, 24 to 36 pages, 54 to 66 queries, 74 to 86 page with query pairs, 12 countries, 3 devices) with the Free plan's limit of 50 simulated per run and the default budget of 40:

| | Before (one day per pull) | After (adaptive windows) |
|---|---|---|
| 100 days: runs | 100 | 3 |
| 100 days: provider calls | 1,194 (half of them repeated after a run hit the limit mid-day) | 42 |
| 100 days: D1 statements | 3,390 | 14 |
| 100 days: storage calls | 402 | 26 |
| 476 days: runs | 483 | 7 |

The stored rows are identical (the test compares them with the one-day pull, including days cut at `searchMaxRowsPerDay`). Larger properties need more runs: a window halves as soon as one grain fills a page of 25,000 rows, down to one day.

How fast runs follow each other is set by the site's Cron Trigger, not by the plugin: a run that stops at the budget schedules the next one a minute later, which runs at the next trigger. With `* * * * *` the 476 days above take about 7 minutes. With `*/15 * * * *` one invocation runs one background task and the others take turns ([install.md](install.md#cron-trigger)), so a continuation waits for its turn: at least 105 minutes, about a day's worth of turns in the worst case (before: 483 runs, five days).

A Bing pull is 3 calls (6 with the in-run retry after a throttle) and one read of the stored rows per day plus one comparison read per 400,000 characters of rows of days that have stored rows, then 1 DELETE plus a few inserts for the days that differ from the stored rows (the sync window, or the backfill range). A Bing file import is one request: one parse of at most 500 KB (about 7 ms of CPU, measured at about 14 ms per million characters) and the same writes.

### Rows written by Search

Besides requests, every Search write counts against a daily budget of rows written (UTC day, the unit of the Free plan's 100,000 rows per day). Google pulls, Bing pulls and file imports share it, and it is counted, not guessed: each write adds D1's own `rows_written` when the database reports it, else the figure below.

`ca_search_daily` is `WITHOUT ROWID` (the key is the table) with one page index, so, measured on the counting database of the tests:

- a new row writes 2 rows, a deleted row 1;
- a backfill writes `days x rows per day x 2` rows (a range of a Load older days run never includes stored days, so nothing is deleted);
- the sync window writes 3 per row of a day that differs from its stored rows, since it deletes that day's stored rows and inserts the pulled ones, and nothing for a day that equals them. A day also differs when its provisional flag changes, which happens once as it leaves the three newest days. Google revises the newest days, so the window rewrites about those days on each pull and the older days stay untouched.

Example: 476 days of a site with 186 rows a day write 476 x 186 x 2 = 177,072 rows, 9 daily budgets of the small profile.

| Profile | Search rows per UTC day | Syncs pause when today's rows reach |
|---|---|---|
| `small` | 21,250 (25 percent of the 85,000 write guard) | 51,000 (60 percent of the guard), counting the ingest estimate of the write guard plus the Search rows |
| `standard` | 500,000 | no pause |
| `dedicated` | 1,000,000 | no pause |

How a run uses it:

- Before a window it asks for as many days as the rows left today allow, at the rows per day seen so far.
- After the pull it counts the rows already stored for those days, leaves the days that equal their stored rows as they are, and stores only the changed days that fit, oldest first. The cursor moves past the unchanged days and the stored ones, and the rest waits for 00:00 UTC.
- A day larger than the whole share is taken alone on a UTC day without Search writes yet, if it stays under the pause line, so a large site still makes progress.
- A run with nothing due writes 0 rows.
- On `small`, ingest keeps priority. The write guard adds the Search rows to its estimate (`sync` in `budget:writes`), and the syncs stop for the day once ingest plus Search reach 51,000, which leaves 34,000 rows below the guard for page views.
- A file import is stored whole or refused (`write_budget`, 429) when its bound of 3 rows per row does not fit what is left today.

On the synthetic Google of the tests (`tests/sources-rows-budget.test.ts`, small profile, about 186 rows a day), 476 days took 10 UTC days. The backfill wrote 177,144 rows and the sync window about 32,000 more. No UTC day went above 21,250 (the highest was 21,246), and the rows each run reported equal the rows the counting database saw.

## Dashboards

Each distinct report request of a dashboard costs one to three database statements, up to twice that with a comparison (a revenue report is the exception, see Revenue). Goals and the detailed window state (two KV reads) are read once per dashboard run, not per request. Tiles with the same report, filters and parameters share one request (the editor shows the distinct request count). The Free plan allows 50 D1 queries per Worker invocation, which is why a shared page offers the comparison only up to 6 distinct requests. At most 20 dashboards per site, 12 tiles per dashboard and 16 KB per stored dashboard.

## Shared pages

One shared page view is one Worker invocation. It reads the link, the dashboard and, for a password link, the lock record, then runs every distinct report request of the dashboard (one to three D1 statements each, up to twice that with the comparison), reads goals and the detailed window state once for the run, and writes the view counter after the response. Measured with table tiles of the `pages` report, counting every database, KV and storage call of a shared page: 3 distinct requests 15 round trips, 6 requests 24, 6 with the comparison 31, 12 requests 42 (`tests/dashboards-round-trips.test.ts` fails above 20, 30, 35 and 45), under the Free plan's 50 queries per invocation; the comparison is therefore offered only up to 6 distinct requests. A password verification (PBKDF2, 10,000 iterations) costs a few milliseconds of CPU against the Free plan's 10 ms per request; a successful sign-in is remembered per isolate for 10 minutes. The rendered page stays under 150 KB for 12 tiles.

## Revenue

A `revenue` request costs 2 statements (3 for a range without orders, which also checks whether the site has any), `revenue_series` 3, `revenue_breakdown` 4 (one more per 90 bound values of goal predicates), `revenue_orders` 1, and `withRevenue` 2 on top of its table. The Revenue template runs 6 distinct requests and 21 statements without the comparison. The Revenue page of the admin runs 12 requests (`revenue`, `revenue_series`, one `revenue_breakdown` per dimension, `revenue_orders`), about 43 statements without the comparison; a comparison repeats the first eleven for the other period. Raw revenue statements read the orders of the range from `ca_events` through its `(site, day)` index and join each order to its visit by the visit's key, so they never read page views.

The `revenue` cron task (minutes 25 and 55) handles at most 3 sites per run, in turn through a cursor, and at most 39 statements per site (`REVENUE_STATEMENTS_PER_SITE`): one comparison of the raw and the summary totals of the closed days of the detailed window (up to the summary watermark), then up to two differing days stored again. A day costs at least 19 statements for a site without goals, plus one per ten active goals and one per ten event goals (`dayStatements`: goals are read in groups of up to ten per statement, so 40 goals cost 4 statements; the reads of visits, pages, events, revenue, links and journeys, one upsert per table and day under 500 rows and two deletes per table, the link, journey and cube upserts and deletes). A day whose real statement count would not fit waits for the next run. The closed-day writer (`rollup`) keeps every site-day inside the run's requests; only the first site-day of a run may use the profile's whole requests when the run's share is smaller (several databases share one invocation). A site-day that alone needs more than the profile's requests stops the run with an error naming the site, the day and the count, instead of passing the Free plan's 50 requests per invocation. Only closed days are stored; open days (today, and yesterday until it closes) are computed on read. The run starts with one statement that lists the sites with revenue, so an install without revenue pays one statement per run.

## SEO views

Each SEO view reads detailed Search rows, so its cost grows with the range: about `searchMaxRowsPerDay * days` rows read per statement. With the default 5,000 that is 150,000 rows at 30 days and 465,000 at the 93 day maximum. The Cloudflare Free plan allows 5 million rows read per day, so one 30 day view fits about 33 times a day and a 93 day view about 10 times; Paid plans include far more. This is why every SEO view is limited to 93 days ("This view reads detailed rows and is limited to 93 days. Choose a shorter range."), and why the presets Last 12 months and Year to date show that text instead. Lower `searchMaxRowsPerDay` to make each view cheaper at the price of coverage. A view costs one or two statements (the cannibalization views add one coverage statement over the daily totals; the period views add one statement for the newest final day).

## Impact

One impact request runs its target report twice (two to six statements), plus one annotation lookup, one statement for the newest final Search day for Search metrics, and one series request for the chart. The "Impact of last changes" template stays well inside the Free plan budget of a dashboard view.

A measurement run is lean: it skips the routing estimate (it reads the detailed rows inside the detailed window), the realtime count and the first-run lookup. One page of the Annotations page (`annotation_impacts`) costs one statement for the newest final Search day plus, per row, two runs of its target: 2 statements per row for the default target (visitors), up to 6 for a page target (pages reads its rows, exits and scroll depth). A page holds at most 6 rows (5 on the small capacity profile), so a full page costs at most 37 statements (31 on small), inside the Free plan's 50 queries per invocation together with the route's own reads; the rest of the range is paged. Two rows with the same target and day share their runs through the 30 s report cache.

## Funnels, journeys, events and the editor panel

Strict funnels (the same second rule) add one statement to a funnel request; flexible funnels cost what they did before. `withRevenue` on a funnel adds two statements (a probe for orders in the range and one lookup over the visit keys that reached step 1, at most 97,000 keys per statement, so always one under the session cap), one when the range has no orders. A journeys request is one statement per report (paths, or the entry and exit drill-downs). One call to `agent/v1/events` with the maximum of 20 events costs at most 6 SQL statements plus one per visit the events attach to (26 when all 20 attach to different visits): three reads, one insert per 9 events, and one update per visit that adds the events to its document; and a `ts` before the start of the raw window is refused with `invalid_ts`. The editor panel on a content entry reads at most six statements and writes nothing. The Cloudflare Free plan allows 50 queries per Worker invocation; none of these comes close, and the per-report figures above are the ones that add up on a dashboard.

## Scheduled email

The `mail` cron task runs at minutes 15, 35 and 45 of every hour, so it never shares an invocation with another request-spending task (under a coarser trigger the one-task-per-invocation turn rule of [install.md](install.md#cron-trigger) applies), and sends at most one dashboard per run (`MAIL_MAX_PER_TICK = 1`). It runs that dashboard through a counting database with a budget of 36 statements (`MAIL_STATEMENT_BUDGET`): a report request is not started when the statements already used plus 4 (8 with the comparison) would exceed 36, and any statement beyond 36 is refused; the tiles that were left out show "Not included in this email: query budget reached." The KV and storage reads of the run (goals, the detailed window state, segment checks, goal names) count against the same 36. A 12-request table dashboard measured 31 counted statements and 37 round trips for the whole tick, the rest being the tick's own lock, dashboard reads and writes; its last 3 tiles are left out by the budget and say so. Saving a schedule is refused above 12 distinct requests (`MAIL_MAX_DISTINCT_REQUESTS`), and above 6 with the comparison (the shared page rule). One run sends at most 5 messages (`MAIL_MAX_RECIPIENTS`, one per recipient); the HTML of one email stays under 100,000 bytes (`MAIL_MAX_HTML_BYTES`, long tables are cut to 5 rows first). At most 5 scheduled dashboards per site (`MAX_SCHEDULED_PER_SITE`). Shares: at most 10 links per dashboard and 100 per site.
