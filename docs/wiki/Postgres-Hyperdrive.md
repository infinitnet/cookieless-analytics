# Postgres through Hyperdrive

The analytics tables can live in a Postgres database instead of D1, reached through a Cloudflare Hyperdrive binding and the `pg` driver. Settings, plugin state and the configuration collections stay in the EmDash database. On the Workers Free plan D1 stays the better default.

## How to set it up

1. Create a Hyperdrive configuration with caching disabled:

   ```sh
   npx wrangler hyperdrive create site-analytics-pg --connection-string="postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" --caching-disabled
   ```

2. Add the binding, `nodejs_compat` and the placement to the wrangler config:

   ```jsonc
   "compatibility_flags": ["nodejs_compat"],
   "hyperdrive": [{ "binding": "CA_PG", "id": "..." }],
   "placement": { "region": "aws:eu-central-1" }
   ```

3. Install the driver in the site, version 8.16.3 or newer: `pnpm add pg`.

4. Name the binding and the engine in the plugin options and deploy:

   ```js
   emdash({ plugins: [cookielessAnalytics({ database: { binding: "CA_PG", engine: "postgres" } })] })
   ```

   Per site: `databases: { engine: "postgres", default: "CA_DB", sites: { shop: "CA_PG" } }`. Each binding may be D1 or Hyperdrive.

## Why caching must be off

Hyperdrive caches reads for 60 seconds by default and does not clear the cache on writes. The plugin reads right after it writes (the daily salt, the open visit, engagement updates). Measured on a real Worker with a cached configuration: 2 of 4 page views lost and failed requests; with caching disabled, 4 of 4. Caching is set per configuration: create a new one with `--caching-disabled` and put its id in the binding.

The plugin checks each Hyperdrive binding once per server instance. With caching on, every page view and event is refused and counted as not recorded, and the [Data page](Data-Page) shows "Query caching is on for the Hyperdrive binding CA_PG." as a critical notice. With caching off, the health line of the Data page ends in "Query caching is off."

![Storage and retention tab with the analytics data in Postgres through Hyperdrive](images/data-storage-postgres.png)

## Measured

On a real Worker, Hyperdrive and a Neon database (Workers Free):

| What | Result |
|---|---|
| One statement, Worker in Paris, database in Frankfurt | 14 to 19 ms; 3 to 6 ms with `placement.region` set to the database's region |
| One ingest request of the plugin, with placement | about 100 to 185 ms wall time (several statements in a row) |
| First statement of a database that scaled to zero | about 700 ms, inside the 5 s statement timeout of the event route |
| 20 concurrent clients, 5 upserts each, 4 shared keys | exact sums, no errors |
| 10 ms CPU limit of Workers Free | not hit by 60 ingest requests or by 400 statements in one request |
| Reports over one day, 60 page views stored | overview 38 ms, pages 63 ms, sources 26 ms, countries 16 ms |
| Connections per invocation on Workers Free | 50 passed, 51 failed; statements on an open connection are not subrequests |

## Workers Free limits

Hyperdrive allows 100,000 statements a day on Workers Free (published limit, reset at 00:00 UTC). A page view costs the same statements as on D1: 2 for a new visit, then 1 per page view or engagement update, and each new server instance adds 7 for its checks. At about 3.9 statements per page view that is about 25,000 page views a day, shared with background tasks and admin pages. Over the allowance Hyperdrive refuses statements, and page views are answered 503 and counted as not recorded until 00:00 UTC. Hyperdrive keeps at most about 20 connections to the database per configuration on Free, about 100 on Paid (published). The Small profile's daily write guard counts D1 rows only and does not stop writes on Postgres. Workers Paid has no daily statement limit.

## Providers

| Provider | Status |
|---|---|
| Neon | Run on a real Worker: 60 ingest requests and four reports through Hyperdrive, without an error; the full write and report scenario with 0 differences to SQLite |
| Supabase, Amazon RDS and Aurora, Railway, Render, DigitalOcean, Fly, Timescale, self-hosted | Should work: any Postgres with TLS that Hyperdrive supports |
| Pooled endpoints (PgBouncer, Supavisor) behind Hyperdrive | Should work; Hyperdrive pools connections itself, so the direct endpoint is the simpler choice |

A database that is not reachable from the internet connects through Cloudflare Tunnel or Workers VPC, with TLS at the database.

## Gotchas

- Page rendering never waits for the database: the page script is deferred and server hits are written after the response. A slow or down database costs refused events (503, counted, sent again by the page script). After a timeout the server instance does not connect again for 20 s and answers 503 at once, so a down database costs one timeout, not one per page view.
- `pg` 8.23.1 (measured) treats `sslmode=require` as `verify-full` and prints a warning. Behind Hyperdrive the Worker connects with `sslmode=disable` to an internal address; your `sslmode` applies between Hyperdrive and the database.
- The queue tier is not used with Postgres; writes go direct.
- The storage estimate uses sizes measured on SQLite; Postgres in PGlite needed up to 2.84 times the space for the same rows. The Data page shows the live size from the catalog.
- The tables use `COLLATE "C"`, so key ranges should not depend on the database's default collation.

## Related

[Capacity-Profiles-and-Cloudflare-Plans](Capacity-Profiles-and-Cloudflare-Plans), [Data-Page](Data-Page), [Quick-Install](Quick-Install), [Troubleshooting](Troubleshooting).

Full reference: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/install.md#postgres-through-hyperdrive
