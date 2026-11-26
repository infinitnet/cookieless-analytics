# Install

Wiki: [Quick Install](https://github.com/infinitnet/cookieless-analytics/wiki/Quick-Install).

Cookieless Analytics is a native EmDash plugin, published on npm as `@infinitnet/cookieless-analytics`. A new site takes one click (Deploy to Cloudflare) and the EmDash setup wizard. On an existing EmDash site you install the package, add it to your EmDash config and to your Astro integrations, make sure your layout renders `EmDashHead`, and redeploy (steps 1 to 4). The plugin creates its tables on first use; there is no migration to run. Other sites are measured with one script tag ([client-sites.md](client-sites.md)), and the data can live in the EmDash D1 database, an own D1 database or Postgres through Hyperdrive. The EmDash plugin registry lists sandboxed plugins only, so the plugin is not listed there.

The target setup is Cloudflare Workers with D1. Peer ranges: `emdash` `>=1.4.0 <2`, `astro` `^7.0.0`, `react` 18 or 19 (for the admin). Node 20 or newer builds it.

## New site: Deploy to Cloudflare

For a new site, the fast path is the Deploy to Cloudflare button:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/infinitnet/cookieless-analytics/tree/main/template)

It copies [template/](../template/README.md) of this repository into a new repository on your GitHub or GitLab account and deploys it to your Cloudflare account. The template is the EmDash Cloudflare starter with steps 1 to 3 and the Cron Trigger already done: the dependency `@infinitnet/cookieless-analytics` from npm, the plugin and the integration in `astro.config.mjs`, `EmDashHead` in the layout, the D1 database `DB`, the R2 bucket `MEDIA` and the trigger `* * * * *` in `wrangler.jsonc`. Cloudflare creates the database and the bucket and asks for `EMDASH_ENCRYPTION_KEY` ([Secrets](#secrets-emdash_encryption_key); it can stay empty until you connect Search). Then:

1. Open `/_emdash/admin` on the new site and complete the setup wizard.
2. On Workers Free, set `capacityProfile` to Small ([Cloudflare notes](#cloudflare-notes)).
3. Run the checks of step 4 below and add the WAF rate rule.

## 1. Install the package

```sh
npm install @infinitnet/cookieless-analytics
# or
pnpm add @infinitnet/cookieless-analytics
yarn add @infinitnet/cookieless-analytics
```

## 2. Add the plugin and the integration

The package has two parts, and both are needed.

- The plugin (default export of `@infinitnet/cookieless-analytics`) goes into the `plugins` option of `emdash()`. It owns the settings, the admin pages, the database tables, the routes and the cron tasks.
- The Astro integration (default export of `@infinitnet/cookieless-analytics/integration`) goes into `integrations` **after** `emdash()`. It registers one middleware with `order: "pre"` that serves the page script, forwards the event path, serves shared dashboards and logs human error pages. EmDash's own middleware must run first, because it fills `locals.emdash`, which the middleware uses.

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import cookielessAnalytics from "@infinitnet/cookieless-analytics";
import cookielessAnalyticsIntegration from "@infinitnet/cookieless-analytics/integration";

export default defineConfig({
  integrations: [
    emdash({
      // database, storage and the rest of your EmDash config
      plugins: [cookielessAnalytics()],
    }),
    cookielessAnalyticsIntegration(),
  ],
});
```

Options:

- `cookielessAnalytics(options)` takes three options, all optional. `sites` is a list of connected EmDash installs ([multi-site.md](multi-site.md)). `database` puts the analytics tables in a D1 database of their own ([Own database for analytics](#own-database-for-analytics)). `databases` gives chosen sites a D1 database each ([One database per site](#one-database-per-site)); it replaces `database`, the two cannot be combined. A bad entry stops the build with a message that names it.
- `cookielessAnalyticsIntegration()` takes no options.
- Everything else (paths, session window, retention, privacy signals) is a setting in the admin ([settings.md](settings.md)).

The package also exports `@infinitnet/cookieless-analytics/contract` (constants and types for other plugins) and `@infinitnet/cookieless-analytics/server` (`recordEvent`). See [integration.md](integration.md).

## 3. Render `EmDashHead` in your layout

The page script is added to your pages by the plugin's `page:fragments` hook. EmDash runs that hook only inside its `EmDashHead` component, because plugin hooks cannot see or change responses by themselves. If your layout does not render `EmDashHead`, no script reaches the page and nothing is counted.

```astro
---
import { EmDashHead } from "emdash/ui";
import { createPublicPageContext } from "emdash/page";

const page = createPublicPageContext({ Astro, kind: "custom", title: Astro.props.title });
---
<html>
  <head>
    <EmDashHead page={page} />
  </head>
  <body><slot /></body>
</html>
```

The hook adds exactly one tag to `<head>`, the same for every request and every user agent:

```html
<script defer src="/_/e.js"></script>
```

If your theme must add the tag itself, turn off the setting `injectScript` and add the tag by hand with the path from `scriptPath`. With `scriptDelivery` set to `inline` the plugin emits one inline script with the same code instead of the tag.

Without the integration (step 2) the plugin falls back to an inline script that posts to `/_emdash/api/plugins/cookieless-analytics/in`. Counting still works in that degraded mode, but the neutral paths, error page logging and shared dashboards need the integration.

## 4. Deploy and check

Redeploy the site. The plugin creates its tables when it activates and runs forward-only migrations on first use. Then check:

1. Open the EmDash admin. The sidebar has a folder "Analytics" with nine pages.
2. View the source of a public page. It holds one `<script defer src="/_/e.js">` in `<head>`.
3. Open `https://example.com/_/e.js`. It answers 200 with JavaScript.
4. Load a page in a normal browser window. The network panel shows one `POST /_/e` answered with 204. A few seconds later the Overview shows a visit.

Visits of signed-in editors are not counted (`excludeEditors`), and neither are browsers that send Global Privacy Control (`signals`). Test in a private window without those.

## Cloudflare notes

**Workers and D1.** The plugin writes through the database EmDash already uses. Pages never wait for them: the page script sends its events after the page has loaded. A page view or event is written before the event route answers (about 25 ms per write from a Worker to its database), so a refused write is answered 503 and sent again by the script; engagement updates are written after the answer. The Free plan limits (50 D1 queries per invocation, 100,000 written rows per day) and a capacity guideline are in [limits.md](limits.md). **On Workers Free, set `capacityProfile` to Small** (the default, Standard, is sized for Workers Paid); the Data page shows a notice when a background run hits the Free plan's request limit or a write is refused by its daily limit.

**`request.cf`.** Country, and region when `captureRegion` is on, come from `request.cf` (the `CF-IPCountry` header is the fallback for the country). The client address is read from the host's request metadata, or from `CF-Connecting-IP` only when `request.cf` exists. `X-Forwarded-For` is never trusted. Without Cloudflare in front (a local dev server) the country stays empty. A client site's server proxy states the visitor's address and country in headers of its own, accepted only with the site's proxy secret ([client-sites.md](client-sites.md), section 4a).

**Cached HTML.** Cloudflare may serve a page from its cache without starting the Worker. That is why the page script reports the visit with a `POST`, which is never cached, and why the plugin does not count server-side page requests. Only human error pages (status 400 or above) that reach the Worker are logged on the server.

**WAF rate rule.** Add a rate limiting rule for the event path. Match the path `/_/e` (your `collectPath`) with method `POST` and block or challenge a client address above a threshold well over what a visitor produces: a page view sends two or three small requests. The plugin has its own caps (60 events per session per minute, 300 per visitor per minute, 8 KB per body), but they are counted per Worker isolate and are approximate across isolates. The rule is the real limit. If you change `collectPath`, change the rule.

## Own database for analytics

On Cloudflare the analytics tables can live in a second D1 database instead of the one EmDash uses. Each D1 database holds at most 10 GB and runs one query at a time, so a second database doubles the storage ceiling and keeps analytics writes from queueing behind the CMS.

1. Create the database:

   ```sh
   npx wrangler d1 create site-analytics
   ```

2. Add it to the site's wrangler config next to the EmDash database, with the `database_id` the command printed:

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

What moves: every analytics table (visits, events, error pages, drop counters, aliases, summaries, revenue and Search data). The plugin creates them in the new database on first use; EmDash migrates only its own database. The table definitions run once per database (14 statements, including a `ca_meta` table there that holds the schema version, after three reads that find no version and no 1.0.0 tables); after that each server instance reads one version row.

What stays in the EmDash database: settings, cursors, locks, salts and other plugin state, Search credentials, goals, funnels, dashboards, API keys and the other configuration collections.

When the binding named in the option does not exist at runtime, nothing is written to the EmDash database instead: page views and events are answered `503`, counted as `write_error` (the counter is held in memory until the database is back), and admin reports show an error that names the binding.

Rollback: remove the `database` option and deploy. New data is written to the EmDash database again (the plugin creates its tables there if they are missing). The data in the second database stays there; it is not copied back, and reports show only what the EmDash database holds. Adding the option again later continues in the second database. Switching either way does not move data, and a visit open at the moment of the switch counts again as a new visit. To copy the older rows into the new database after the deploy, use Data, Move data ([move-data.md](move-data.md)).

The binding is read from the Workers runtime (`cloudflare:workers`). A dev server that does not run in the Workers runtime has no bindings, so with the option set it records nothing; leave the option out there.

With the queue tier ([Queue tier](#queue-tier)), the consumer Worker needs the `CA_DB` binding and the same option too ([consumer/README.md](../consumer/README.md)).

### One database per site

With client sites ([client-sites.md](client-sites.md)) one install can measure many sites. The `databases` option puts the analytics tables of chosen sites in D1 databases of their own, so a large site gets its own 10 GB and its own writer:

```js
cookielessAnalytics({
  databases: {
    default: "CA_DB",              // every site not listed below; leave it out to keep them in the EmDash database
    sites: { shop: "CA_DB2" },     // site id: D1 binding
  },
})
```

Create each database and add its binding to the wrangler config as in steps 1 and 2 above. Site ids are those of the Sites page (the local site's is the `siteId` setting). `{ default: "CA_DB", sites: {} }` is the same as `database: { binding: "CA_DB" }`.

How it works:

- Every page view, event, engagement update, error page and drop counter is written to its site's database. The queue consumer routes each message the same way (pass the same option to it).
- The background tasks (summaries, retention, revenue reconcile) run once per database. Each database has its own summary watermark, retention cursor, storage estimate and, with the `small` profile, its own daily write guard; these are kept in the EmDash database under a prefix per routed database. The storage budget of `capacityProfile` applies to each database.
- Reports of one site read that site's database. Views over several sites (the Sites page, the all-sites summary) read each database separately and combine the results; no query spans two databases.
- A binding that does not exist at runtime is never replaced by another database: that site's page views and events are answered `503` and counted as `write_error`, its reports show an error that names the binding, the queue consumer retries its messages, and the background tasks still run on the other databases (the failure is logged).
- Moving a site to another database does not move its data: reports show what the new database holds, the old rows stay where they were until deleted (Data page, delete site data, before the switch).
- The Free plan's daily row limits are per account, so more databases do not raise them, and each database's write guard counts only its own writes: on the Free plan keep one database. The background tasks split their per-run request budget between the databases.

## Postgres through Hyperdrive

The analytics tables can also live in a Postgres database, reached through a Cloudflare Hyperdrive binding and the `pg` driver (node-postgres), the same pair EmDash uses for its own Postgres support on Cloudflare. Settings, plugin state and the configuration collections stay in the EmDash database, as with an own D1 database. On the Workers Free plan D1 stays the better default (see the limits below).

1. Create a Hyperdrive configuration **with caching disabled**:

   ```sh
   npx wrangler hyperdrive create site-analytics-pg --connection-string="postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" --caching-disabled
   ```

   Hyperdrive caches reads by default for 60 seconds and does not clear the cache on writes. The plugin reads right after it writes (the daily salt, the open visit, engagement updates), so a cached configuration loses page views: on a real Worker, 2 of 4 page views were lost and requests failed. Caching is set per configuration; to turn it off for an existing binding, create a new configuration with `--caching-disabled` and put its id in the binding. The plugin checks each binding once per isolate (it writes a marker, reads it back and compares) and the Data page shows "Query caching is on for the Hyperdrive binding ..." when the binding caches; until it is fixed every page view and event is refused and counted as not recorded, never counted wrong.

2. Add the binding to the site's wrangler config, with the id the command printed. `nodejs_compat` must be on (the template sets it; for compatibility dates from 2026-08-04 on it is on by default). Put the Worker next to the database with `placement.region`:

   ```jsonc
   "compatibility_flags": ["nodejs_compat"],
   "hyperdrive": [{ "binding": "CA_PG", "id": "..." }],
   "placement": { "region": "aws:eu-central-1" }
   ```

   Use the cloud region of your database. Measured from a Worker in Paris to a database in Frankfurt: one statement took 14 to 19 ms without placement and 3 to 6 ms with it. A page view or event is a few statements in a row before the event route answers, so this decides how long each request waits.

3. Install the driver in the site. `pg` is an optional peer dependency, version 8.16.3 or newer (Hyperdrive's floor; 8.11.4 does not work with it):

   ```sh
   pnpm add pg
   ```

4. Name the binding and the engine in the plugin options and deploy:

   ```js
   emdash({ plugins: [cookielessAnalytics({ database: { binding: "CA_PG", engine: "postgres" } })] })
   ```

   With `engine: "postgres"` EmDash loads the plugin from `@infinitnet/cookieless-analytics/postgres`, the entry that imports `pg`; the default entry never does, so sites on D1 do not carry the driver. Per site databases take the same key: `databases: { engine: "postgres", default: "CA_DB", sites: { shop: "CA_PG" } }`, where each binding may be a D1 or a Hyperdrive binding. A Hyperdrive binding without `engine: "postgres"` fails every write with a message that says so.

The plugin creates its tables on first use, with `COLLATE "C"` on every text column, so key ranges should not depend on the database's default collation. The user in the connection string needs `CREATE` on the schema of its `search_path`.

**TLS and private databases.** A database that is not reachable from the internet is connected through Cloudflare Tunnel or Workers VPC, and Hyperdrive's documentation on private databases requires TLS at the origin. The Worker itself sees an internal address with `sslmode=disable`, and Hyperdrive uses the `sslmode` of the original connection string towards the database. `pg` 8.23.1 (measured) treats `sslmode=require` in a connection string as `verify-full` and prints a warning when it sees it; behind Hyperdrive the Worker's string carries `sslmode=disable`, and the `sslmode` you gave Hyperdrive applies to the leg to the database.

**What happens when the database is slow or down.** Page rendering never waits for it: the page script is deferred and sends its events after the page has loaded, and server-side hits are written after the response. The event route opens one connection per request (5 s connect timeout, 5 s per statement, one retry of a refused connect), answers `503` when the database does not answer, and counts the request as `overload` or `write_error`; the page script sends it again. After a connect or statement timeout the Worker isolate does not connect to that database again for 20 s: requests in that window are answered `503` at once and counted as `overload`, so a down database costs one timeout, not one per page view. Other paths (background runs, admin pages) allow 15 s per statement. The counters wait in memory until the database is back. Background runs retry on their next tick. A Neon database that scaled to zero answered its first statement in about 700 ms, well inside the 5 s statement timeout, so a resume should cost one slow request, not a drop. The Data page shows the engine, the binding, a health line with the time of its self-check, and one message when the database is unreachable, slow or caching.

**Workers Free plan.** Hyperdrive is included in Workers Free with 100,000 statements a day (published limit; reset at 00:00 UTC; over the limit statements fail). A page view costs the same statements on Postgres as on D1 (2 for a new visit, then 1 per page view or engagement update; counted on Postgres 18 in PGlite), and each new Worker isolate adds 7 for its schema and cache checks. At the typical mix of about 3.9 statements per page view the allowance covers about 25,000 page views a day, less what background tasks, admin pages and new isolates use ([limits.md](limits.md#postgres-through-hyperdrive)). Hyperdrive keeps at most about 20 connections to the database per configuration on Free and about 100 on Paid (published). Run on Workers Free: statements on one open connection do not count as subrequests, each new connection does, and 50 connections per invocation is the most (51 failed); the 10 ms CPU limit was not hit by 60 ingest requests through the plugin's own adapter or by 400 sequential statements in one request. The Small profile's daily write guard counts D1 rows and does not apply to Postgres: when the statement allowance is used up, Hyperdrive refuses statements, so page views and events are answered `503` and counted as not recorded until 00:00 UTC. D1 needs no driver and its guard keeps within the Free plan's rows, so on Workers Free D1 stays the better default. On Workers Paid Hyperdrive has no daily statement limit.

**Providers.**

| Provider | Status |
|---|---|
| Neon | Run on a real Worker on Workers Free: 60 ingest requests and four reports through Hyperdrive with the plugin's own adapter, all answered without an error. The full write and report scenario (600 page views, summaries, retention, deletes) ran with `pg` against Neon from a server, with 0 differences to SQLite. A short contended run of 20 clients gave exact sums and no errors |
| Supabase, Amazon RDS and Aurora, Railway, Render, DigitalOcean, Fly, Timescale, self-hosted Postgres | Should work: any Postgres with TLS that Hyperdrive supports |
| A provider's pooled endpoint (PgBouncer, Supavisor) behind Hyperdrive | Should work; Hyperdrive pools connections itself, in transaction mode, so the direct endpoint is the simpler choice |

**Local development.** A dev server outside the Workers runtime has no bindings, as for an own D1 database. Wrangler's local mode reads a connection string for the binding from `localConnectionString` in the Hyperdrive entry or from `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_CA_PG`.

What moves, what stays and the rollback are the same as for an own D1 database above. Switching does not copy data; Data, Move data copies the older rows afterwards ([move-data.md](move-data.md)).

## Queue tier

By default every page view, event and engagement update is written straight to the database (`ingestTier` `direct`). With the queue tier the site sends them to a Cloudflare Queue, and a small consumer Worker writes them in batches with the same statements. It absorbs bursts and keeps requests answered while the database is overloaded; a single request is not faster. Details, behavior and the Free plan queue limits: [consumer/README.md](../consumer/README.md).

1. Create the queue and its dead letter queue:

   ```sh
   npx wrangler queues create ca-ingest
   npx wrangler queues create ca-ingest-dlq
   ```

2. Add the producer binding to the site's wrangler config and deploy the site. The binding must be named `CA_QUEUE`:

   ```jsonc
   "queues": { "producers": [{ "binding": "CA_QUEUE", "queue": "ca-ingest" }] }
   ```

3. Deploy the consumer Worker from `consumer/` of the plugin's repository (it is not in the npm package), as its README describes: set the site's D1 database in its `wrangler.jsonc`, keep its `@infinitnet/cookieless-analytics` version equal to the site's, then `npm install` and `npx wrangler deploy`. With the `database` option, add the `CA_DB` binding there too and pass the same option to `handleQueue`; with `databases`, add every binding it names.
4. In the admin settings, set **Ingest tier** (`ingestTier`) to **Queue**. The queue is used only while the `CA_QUEUE` binding exists; a failed send is written directly, and error pages are always written directly.

## Cron Trigger

The plugin runs six scheduled tasks. On Cloudflare the schedule is driven by a Cron Trigger on the Worker, which calls the same `scheduled()` handler that EmDash uses for scheduled publishing. If your Worker already has that handler, add a trigger in your Wrangler config:

```jsonc
// wrangler.jsonc
{
  "triggers": { "crons": ["* * * * *"] }
}
```

`* * * * *` (every minute) is recommended. Every 15 minutes (`*/15 * * * *`) also works: the host runs overdue tasks at the next trigger, so several tasks are then due in one invocation (rollup, retention and revenue at :30, Search and mail at :15). The plugin runs at most one of its request-spending tasks per invocation (all but `salts`); a task that finds the invocation taken is owed a turn (state key `cron:owed`) and the task owed longest runs in the next invocation, in place of the one that is due there. Simulated over a day of 15 minute ticks: rollup 21 runs, retention 17, revenue 20, Search 18, mail 20 (`tests/cron.test.ts`). Backfills and catch-up work (Search continuation runs, summaries of closed days not stored yet, retention) advance accordingly, about once an hour each. The plugin creates its schedule rows itself, at activation and when an admin page first loads in an isolate.

| Task | Schedule | What it does |
|---|---|---|
| `rollup` | `*/30 * * * *` (minutes 0 and 30) | Stores the daily summaries of closed days that are not stored yet, within the request budget of the capacity profile; a run that stops early continues on the next. Today and yesterday are computed from the visits when a report runs. |
| `retention` | `17 * * * *` | Deletes days older than the retention settings, oldest first, within the request budget of the capacity profile; a run that stops early continues on the next. With the requests left, it continues a running filtered delete of the Data page. |
| `salts` | `5 0 * * *` | Deletes daily salts older than two days. |
| `search` | `7 */1 * * *` | Pulls Google Search Console and Bing data when connected; does nothing otherwise. A long pull continues through one-time tasks a minute later. |
| `revenue` | `25,55 * * * *` | Reconciles the revenue summaries of closed days (at most 3 sites per run). |
| `mail` | `15,35,45 * * * *` | Sends one due scheduled dashboard email. |

The host runs every task that is due in the same tick one after another inside one invocation, and the platform's queries per invocation (Free plan: 50) are shared by them. The minutes above are chosen so that no two tasks are due together under a one-minute trigger; under a coarser trigger the turn rule above keeps it to one request-spending task per invocation.

Without any Cron Trigger the reports of the raw window still work, because they read raw rows. But the summaries for older ranges are not built, expired rows are not deleted, and old salts stay in storage, which weakens the guarantee that yesterday's visitor key cannot be rebuilt ([privacy.md](privacy.md)). Treat the trigger as required.

## Secrets: `EMDASH_ENCRYPTION_KEY`

The Search settings (Google client secret, refresh token and service account key, and the Bing API key) are `secret` settings. EmDash encrypts them with the key in the environment variable `EMDASH_ENCRYPTION_KEY`. Without it, saving a secret fails. Generate a key with `npx emdash secrets generate`, store it as a Worker secret, and keep a backup:

```sh
wrangler secret put EMDASH_ENCRYPTION_KEY
```

A lost key makes the stored secrets unreadable. Setup of the Search connections: [search-sources.md](search-sources.md). The keys of connected sites are different: they are read from env vars you name in the `sites` option and are never stored.

## Trust model

A native plugin runs inside your site's process with the same access as the site itself. There is no sandbox and no per-plugin resource limit. What this plugin does with that access:

- It reads and writes the database tables whose names start with `ca_`, its plugin storage and its key-value state. It reads content metadata for annotations and the collection report (`content:read`, `schema:read`).
- It makes outbound requests only through EmDash's `ctx.http`, only to exact allowed hosts: `oauth2.googleapis.com`, `www.googleapis.com` and `ssl.bing.com` for Search, plus the host names of the connected sites you list. There is no wildcard and no other call. It sends no telemetry and phones nowhere else.
- It sends email only through your site's own mail provider, and only when you schedule a dashboard.
- The code is plain TypeScript in `src/`, shipped in the package so you can read it. The release is published from CI with npm provenance.
- The event path writes one statement for a page view or event before it answers (204 when stored, 503 with `Retry-After` when the database refused it); engagement updates are written after the answer. Pages never wait for the event path.

## Upgrade

1. Read the release notes of the version on GitHub. The semver surface is route names, the ingest JSON, the window API, settings keys, table and column names, the agent API and the exports of `./contract` and `./server`.
2. Back up each analytics database (`npx wrangler d1 export <database> --remote --output=before-upgrade.sql`) and note the Time Travel bookmark of that moment (`npx wrangler d1 time-travel info <database>`). On the Free plan take the export early in the UTC day: a later restore writes rows against the daily limit.
3. Update the package (`npm install @infinitnet/cookieless-analytics@latest`), commit the lockfile and redeploy.
4. Migrations are forward only: the stored schema version never moves back. They run when the plugin activates and again, lazily, before the first write. A release that changes the tables says so in its release notes.
5. Open the admin. The footer shows the installed version.
6. Check: load one page of the site, then open the Data page. The page view is listed, and no `write_error` count appears. Or run the storage canary, which posts one synthetic page view and reads it back through the agent API: `CA_API_KEY=<read:analytics key> node scripts/smoke-storage.mjs --base https://<host>`. It costs about 3 rows written and leaves one visit to a `/ca-smoke-<random>` path in the reports.

Stay on the same EmDash range: the peer range is `>=1.4.0 <2`, and CI checks 1.4.0 and the latest 1.x release.

## Related

[privacy.md](privacy.md), [sessions.md](sessions.md), [bots.md](bots.md), [filters.md](filters.md), [integration.md](integration.md), [client-sites.md](client-sites.md), [multi-site.md](multi-site.md), [limits.md](limits.md), [settings.md](settings.md), [move-data.md](move-data.md).
