# Performance

What the plugin costs a visitor's browser, your pages and your database, as measured from this repository. Re-run every figure with the two commands at the end.

## The page script

The script that `EmDashHead` adds to every page, as built by `pnpm build:client` (before the site's settings are filled in):

| Form | Size |
|---|---|
| Minified | 4,835 bytes |
| gzip | 2,466 bytes |
| Brotli | 2,208 bytes |

A test keeps it under 3,072 bytes gzipped. The settings add a short JSON object; with 20 link rules at the 2,048 character cap the served script stays under 4 KB gzipped (also a test). It is served from your own site with `Cache-Control: public, max-age=3600` and an ETag, so later pages within the hour take it from the browser cache. It has no dependencies, sets no cookie and reads nothing from the device.

## Requests per page view

Counted in `src/client/boot.ts`:

- 1 request for the script, cached for an hour as above.
- 1 `POST` for the page view.
- 1 engagement update when the tab is hidden or closed, sent only when a number changed since the last one.
- 1 `POST` per event (a goal click, an outbound link, a download, a form, your own events).

Every request goes to your own site (a short neutral path such as `/_/e`); none goes to a third party.

## Nothing waits for it

- The script tag is `defer`, so the browser does not wait for it while it builds the page. Without the plugin's middleware the same code is inlined into the head and loads nothing.
- The hook that adds the tag reads the plugin's settings and one cached marker from the EmDash database. It never reads the analytics tables.
- Server-side hits (error pages) are recorded after the response is sent (`after()` in `src/middleware.ts`).
- The page view and engagement requests are `keepalive` fetches and beacons sent in the background.
- The admin pages are a separate entry, `@infinitnet/cookieless-analytics/admin`, which only the EmDash admin loads. Public pages never load it. Sites on D1 do not load the Postgres driver either: only the `/postgres` entry imports it.

## Database work per page view

Counted with the real event route in `tests/performance.test.ts`: a visit of two page views, each followed by its engagement update.

| Engine | First page view of a visit | Engagement update | Next page view |
|---|---|---|---|
| D1 | 2 statements, 2 rows written | 1 statement, 1 row written | 1 statement, 1 row written |
| Postgres | 2 statements | 1 statement | 1 statement |

The D1 rows come from the test suite's meter. It counts rows written with the rules measured on production D1, so each index entry counts as a row. The Postgres statements are every statement sent to the database: Postgres 18 in PGlite behind a stand-in for the Hyperdrive driver. On Postgres the first request of an isolate adds 7 statements: the schema check and the query cache check. The EmDash database (settings, salt) is not written by these requests.

With a typical mix of new visits, engagement updates and events, a page view costs about 3.3 rows written and 3.9 statements. That figure was measured on production D1 ([limits.md](limits.md#write-cost-per-event)).

## Reports

Reports read the detailed visit rows for recent days. For older days and ranges too large to scan they read daily summaries, which a background task writes once a day for each closed day. The Data page says which source a report used. A report result is kept for 30 seconds in the isolate, so an admin who opens several pages does not read the same rows again.

## Setup

The minimum after install, from [template/README.md](../template/README.md) and [install.md](install.md):

1. Deploy: the Deploy to Cloudflare button, or `npm install` plus two lines in `astro.config` on an existing EmDash site.
2. Complete EmDash's setup wizard in `/_emdash/admin`. The plugin creates its tables on first use; there is no migration step.
3. On the Workers Free plan only: set the capacity profile to Small.

Other sites are measured with one script tag or a Google Tag Manager tag. The analytics tables can stay in the EmDash D1 database or move to an own D1 or Postgres database later ([install.md](install.md)).

## Re-run the measurements

```sh
node scripts/measure-script.mjs           # page script bytes
npx vitest run tests/performance.test.ts  # the bytes above and the database work, checked against this page
```

The test fails when a figure on this page no longer matches what it measures.
