# Capacity Profiles and Cloudflare Plans

The `capacityProfile` setting sizes the plugin to your Cloudflare plan and database: how much analytics data it keeps, how much work one background run may do, and how large the daily summaries get. Pick the profile that matches your plan, then grow along the scale-out ladder below.

## How to use it

1. Find your plan: Workers Free or Workers Paid.
2. Open Settings, section Data and capacity, and set **Capacity profile**:
   - Workers Free: **Small** (`small`).
   - Workers Paid, analytics in the EmDash database: **Standard** (`standard`, the default).
   - Analytics in a database of its own (`database` or `databases` option): **Dedicated** (`dedicated`).
3. Optional: set **Storage budget (MB)** in the same section to give the analytics tables more or less room than the profile's default (0 keeps the default). See [Storage budget](#storage-budget).
4. Save. Open the Data page, tab Storage and retention, to see the storage estimate against the budget and the database's size now.

## Limits of each profile

| | `small` | `standard` (default) | `dedicated` |
|---|---|---|---|
| Default storage budget | 300 MB | 6 GB | 9 GB |
| Requests per background run | 40 | 400 | 400 |
| Scan budget (visits a detailed report may read) | 50,000 | 500,000 | 500,000 |
| Pair rows per site and day | 340 | 7,500 | 15,000 |
| Cube cells per site and day | 150 | 1,000 | 1,000 |
| Journey step rows and three step paths per day | 200 and 50 | 2,000 and 500 | 2,000 and 500 |
| Daily write guard | yes | no | no |
| Search rows written per UTC day | 21,250 | 500,000 | 1,000,000 |

A quarter of the budget is reserved for summaries (with the default budgets: `small` 75 MB, `standard` 1.5 GB, `dedicated` 2.25 GB); detailed visits use the rest. When detailed data passes its share, the detailed window shortens to the newest days that fit, and older days are answered from daily summaries. Nothing is sampled.

A report over a range that holds more visits than the scan budget is answered from the daily summaries when every filter applies there. Otherwise it reads detailed rows up to 4 times the budget, and beyond that it asks for a shorter range.

## Storage budget

`storageBudgetMb` sets the space the analytics tables may use, in whole megabytes; 0 uses the profile's default. The range depends on the database of the analytics tables:

| Database | Default (0) | Allowed | Warning above | Strong warning above |
|---|---|---|---|---|
| Any D1 database, `small` | 300 MB | 50 to 450 MB | 300 MB | 400 MB; in the EmDash database also budget plus the rest of the database above 475 MB |
| EmDash database (D1), `standard` or `dedicated` | 6,000 MB (9,000 with `dedicated`) | 100 to 9,000 MB | 6,000 MB | 8,000 MB, or budget plus the rest of the database above 9,500 MB |
| Own D1 database, `standard` or `dedicated` | 6,000 MB (9,000 with `dedicated`) | 100 to 9,500 MB | 9,000 MB | none |

Why these maxima: a D1 database holds at most 10 GB, cannot be raised and refuses writes when full (500 MB on Workers Free). In the EmDash database that space also holds the site's content, so a full database stops the CMS from saving content too.

- The Settings page shows the allowed range under the field and the warning of the typed value as it changes. Saving a value outside the range is refused with the reason.
- The Data page lists the warning under Needs attention, with a link to the setting.
- The Data page shows the database's size now (the whole file, content included): an own D1 database reports it itself, the EmDash database through the Worker's one D1 binding that no database option names (`DB` in the template); with none or several such bindings the page says the size is unknown. From 80 percent of 10 GB (500 MB on `small`) it shows a warning, from 90 percent a critical notice.
- A new budget applies with the next retention run. When the detailed data does not fit, the detailed window shortens and older days are kept as daily summaries.

The warning texts and the estimate: [Limits, Storage budget](https://github.com/infinitnet/cookieless-analytics/blob/main/docs/limits.md#storage-budget).

### The write guard (Small only)

With `small`, recording stops for the rest of the UTC day once the estimated rows written of the day reach 85,000 (85 percent of the Free plan's 100,000), so the CMS can still save content. While blocked, page views and events get 503 without `Retry-After` and are counted as `budget_blocked`. The Data page says: "The daily write allowance of the small profile is nearly used. Recording resumes at the next UTC day." With the typical mix that is about 25,000 page views a day.

## Cloudflare plans and D1

| Limit | Value |
|---|---|
| D1 database size | at most 10 GB, cannot be raised; writes are refused when full |
| D1 queries | one at a time per database |
| Workers Free: database size | 500 MB per database |
| Workers Free: rows written | 100,000 per day per account |
| Workers Free: rows read | 5 million per day per account |
| Workers Free: queries per invocation | 50 |
| Workers Free: subrequests per invocation | 50 (measured on a Free account) |
| Workers Free: CPU time per request | 10 ms; waiting on the database does not count |
| Workers Paid: D1 queries per invocation | 1,000 |
| Workers Paid: subrequests per invocation | 10,000 |

Rows written per page view: about 3.3 with a typical mix (3.9 with the later retention delete).

Estimates for 25 months of detail at about 340 bytes per page view, with the default budgets:

| Profile (detail share) | Fits |
|---|---|
| `standard` (4.5 GB) | about 17,500 page views a day |
| `dedicated` (6.75 GB) | about 26,200 page views a day |
| `small` (225 MB) | about 660,000 page views in total (about 22 months at 1,000 a day) |

These are estimates. The Data page reports the estimate for your own traffic.

## Own database for analytics

The analytics tables can live in a second D1 database. That doubles the storage ceiling and keeps analytics writes from queueing behind the CMS.

1. Create the database:

   ```sh
   npx wrangler d1 create site-analytics
   ```

2. Add it to the site's wrangler config next to the EmDash database:

   ```jsonc
   "d1_databases": [
     { "binding": "DB", "database_name": "site", "database_id": "..." },
     { "binding": "CA_DB", "database_name": "site-analytics", "database_id": "..." }
   ]
   ```

3. Name the binding in the plugin options and deploy:

   ```js
   emdash({ plugins: [cookielessAnalytics({ database: { binding: "CA_DB" } })] })
   ```

4. Set `capacityProfile` to `dedicated`.

What moves: every analytics table (visits, events, error pages, drop counters, summaries, revenue and Search data). What stays in the EmDash database: settings, cursors, salts, Search credentials, goals, funnels, dashboards, API keys and other configuration.

For a Postgres database instead of D1, see [Postgres through Hyperdrive](Postgres-Hyperdrive).

### One database per site

With client sites, the `databases` option gives chosen sites a D1 database each:

```js
cookielessAnalytics({
  databases: {
    default: "CA_DB",            // every site not listed below; leave it out to keep them in the EmDash database
    sites: { shop: "CA_DB2" },   // site id: D1 binding
  },
})
```

Each database has its own 10 GB, writer, storage budget and write guard. Background tasks run once per database and split the profile's requests between them (two databases on `small`: 20 each). `databases` cannot be combined with `database`, and holds at most 500 entries.

## Scale-out ladder

1. `small` profile on Workers Free, with the write guard.
2. `standard` profile on Workers Paid.
3. The queue tier, for bursts and overload ([Queue-Worker](Queue-Worker)).
4. An own database (`database`) with the `dedicated` profile.
5. Site routing (`databases`): one database per busy site.
6. A second install.

## Settings

| Key | Default | What it does |
|---|---|---|
| `capacityProfile` | `standard` | Storage budget, requests per background run, summary caps, write guard. |
| `storageBudgetMb` | `0` | Space for the analytics tables in MB; 0 is the profile's default. See [Storage budget](#storage-budget). |
| `rawRetentionDays` | `760` | Days of detailed rows kept; shortens by itself when the budget is reached. See [Retention](Retention). |
| `syncSubrequestBudget` | `40` | Requests one Search sync run may make. Keep 40 on Free; about 900 on Paid. |

## Gotchas

- The default is Standard, which Workers Free cannot carry. On Free, set Small. The Data page warns ("This install appears to run on the Workers Free plan") after a background run hits the request limit.
- The Free plan's daily row limits are per account. More databases do not raise them, and each write guard counts only its own database. On the Free plan keep one database.
- `dedicated` in the EmDash database defaults to 9,000 MB and shows the strong warning: that profile is meant for an own database.
- The storage budget is one setting for the install. While any site's analytics tables are in the EmDash database, its range (up to 9,000 MB) applies when saving; each own database clamps the budget to its own range.
- Every site of a database shares its storage budget. Many client sites in one database shorten the detailed window for all of them.
- A binding named in the options that does not exist at runtime is never replaced by another database: writes are answered 503 and counted as `write_error`.
- Moving a site to another database does not move its data.
- A dev server outside the Workers runtime has no bindings, so with `database` set it records nothing. Leave the option out there.
- With the queue tier, pass the same `database` or `databases` option to the consumer.

## Related

[Quick-Install](Quick-Install), [Postgres-Hyperdrive](Postgres-Hyperdrive), [Queue-Worker](Queue-Worker), [Retention](Retention), [Data-Page](Data-Page), [Multi-Site-and-Sites-View](Multi-Site-and-Sites-View), [Settings-Reference](Settings-Reference), [Troubleshooting](Troubleshooting).

Full reference: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/limits.md
