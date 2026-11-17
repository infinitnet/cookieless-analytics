# Move data

Wiki: [Move Data](https://github.com/infinitnet/cookieless-analytics/wiki/Move-Data).

This page covers two ways to move the analytics tables: export and import through files, with the `ca-data` command line tool that ships in the package, and the Move data tab of the Data page, which copies them from a database bound to this Worker (see [Move data on the Data page](#move-data-on-the-data-page) below).

## Export and import with the CLI

### When to use it

- **Backups.** One gzip file per table plus a manifest, written on your own machine.
- **A source the Worker cannot bind.** Another Cloudflare account, another site or another install: export there, import here.
- **Any size.** The Worker never holds more than one chunk (under 1.2 MB); the files are streamed to and from disk. A site on the Small profile writes at most 15,000 rows a day from imports and moves together, so a large import into it takes several days (see [Retries, the rate limit and the day's rows](#retries-the-rate-limit-and-the-days-rows)).

### What moves and what stays

The files hold the rows of the nine analytics tables: `ca_sessions` (visits), `ca_events`, `ca_srv` (not found and server hits per day), `ca_drops` (requests not recorded, per day), `ca_cube`, `ca_rollup`, `ca_aliases`, `ca_search_daily` and `ca_revenue_daily`. All sites of the database, or one site with `--site`.

Not in the files: settings, plugin state (the rollup watermark and the task cursors) and the storage collections (API keys, goals, funnels, segments, annotations, dashboards, shared links, client sites). They stay in the EmDash database. On a new install, add client sites before or after the import so their rows show under their name.

### Keys and scopes

Create a key under Definitions, API keys (see [AGENTS.md](AGENTS.md)):

| Scope | Route | Use |
|---|---|---|
| `data:export` | `agent/v1/data/dump` | On the site the data comes from |
| `data:import` | `agent/v1/data/load` | On the site the data goes to |

`data:export` reads every stored row, the visit details and the daily visitor keys included. Treat such a key like a database backup credential: give it an expiry date and revoke it after the run. A key with a site restriction exports its site only: export with `--site` and that site's id. An import takes the site from `manifest.json`, so such files import with a key restricted to the same site.

### Commands

Node 20 or later. Run the tool from a project that has the plugin installed, or with `node` on `node_modules/@infinitnet/cookieless-analytics/scripts/ca-data.mjs`. Pass the key in the `CA_DATA_KEY` environment variable. The tool reads it first and uses `--key` only when the variable is not set: a key on the command line shows in the process list and the shell history. The tool never prints the key. `ca-data --help` prints the usage.

```sh
# Export every site of the database into ./backup
CA_DATA_KEY="ab12cd34.EXAMPLESECRET" pnpm exec ca-data export --url https://example.com --out ./backup

# Export one site only
CA_DATA_KEY="ab12cd34.EXAMPLESECRET" pnpm exec ca-data export --url https://example.com --out ./shop --site shop

# Import into another site or install
CA_DATA_KEY="cd34ef56.EXAMPLESECRET" pnpm exec ca-data import --url https://new.example.com --in ./backup

# Import into a site on the Small profile (Workers Free): smaller chunks
CA_DATA_KEY="cd34ef56.EXAMPLESECRET" pnpm exec ca-data import --url https://new.example.com --in ./backup --rows 50
```

`--rows` sets the rows per call, 1 to 1000. Without it an export uses the site's own default (50 on the Small profile, 500 otherwise) and an import sends 500. Use `--rows 50` for an import into a site on the Small profile.

`--url` is the site's address and must use `https://` (`http://` only for localhost); the tool calls `/_emdash/api/plugins/cookieless-analytics/agent/v1/data/...` below it and does not follow redirects, so the key never goes to another address.

An export of a site that receives traffic is not a snapshot: rows written while it runs may or may not be in the files. For a consistent backup, export a database that no longer receives writes, for example the old database after a move.

### The files

- `<table>.ndjson.gz` per table: one JSON object per line, gzip compressed.
- `manifest.json`: `layout` (the table layout of the plugin that wrote the files), `engine` (`sqlite` for D1, `postgres`), `site` (the site filter or null), the creation time, and per table the file name, its row count and its sha256.

Neither file holds the URL or the key. The tool prints table names and row counts only.

### What an import does

1. Reads `manifest.json` and checks the sha256 of every file. A file that does not match is refused and nothing is imported.
2. Checks the layout: the site refuses files of another table layout (`400 layout_mismatch`). There is no conversion between layouts; import into a plugin version with the same layout.
3. Posts the rows in chunks of `--rows` (500 by default) and under 1.2 MB. The site checks every row before it writes any of the chunk: known columns, the key columns present, a valid site id, and values of the right kind and length; a row that fails answers `400 invalid_row` and nothing of that chunk is written. While a delete runs, or a move into the same database, the site answers `409` and the tool stops; run it again afterwards. After every chunk the tool writes `progress.json` next to the files, with the rows done per table. When a run breaks (network, a deploy, a full database), run the same command again: it resumes where it stopped. A run against another `--url` starts from the beginning.
4. Compares the row count of every file with the count in the site and exits with code 1 when the site holds fewer rows. Then it removes `progress.json`.

The insert is idempotent: a row whose primary key exists in the site is kept as it is. A second import of the same files inserts 0 rows.

Import into an empty database. In a database that already received traffic, a key present on both sides keeps the destination's values: a visit with the same key stays the destination's (a visit with the same session id but another start time is stored next to it under a suffixed id), and the per day counters of `ca_srv` and `ca_drops` keep the destination's count; the count of the file for that day is not added.

With per site databases (the `databases` option), an export without `--site` reads the default site's database: export each site with its own database with `--site`. An import writes each row into the database its site writes to. The count check of an import without a site filter counts the default site's database only, so when the destination routes some of those sites to their own databases it reports them as missing: export and import such sites one at a time with `--site`.

### Retries, the rate limit and the day's rows

Each chunk is one request to the agent API and counts against the key's rate limit (`agentRateLimitPerMinute`, default 60 per minute). For a large export, raise the setting for the time of the run, for example to 600.

- `429`: the tool waits for the time of `Retry-After` and sends the same chunk again.
- A `5xx`: the tool halves the chunk at once and sends it in two parts; an import keeps the smaller chunk for the rest of the run. After an export answer that was cut short by its size, the next call asks for no more rows than that answer held.
- A network error: retried four times with a growing pause.

On the Small profile with a D1 database, imports and moves together write at most 15,000 rows a day into that database (a visit, an event and a Search row count 2 each, for their index), so recording keeps priority within the Free plan's daily rows. A chunk that does not fit answers `429 daily_limit` with `Retry-After` until 00:00 UTC; the tool prints "waiting N min, until 00:00 UTC" and continues the next day by itself. Leave it running, or stop it and run the same command the next day.

### Size notes

Measured on synthetic test data with SQLite in the test suite, not on a real server: 5,000 page views over 14 days (2,320 visits, 44,028 summary rows, 500 aliases) were exported in 102 requests. In the gzip files a visit took about 129 bytes and a summary row about 9 bytes. The largest answer at 500 rows was 516 kB.

Every exported row is read once from the database, plus one count per table; on D1 these count as rows read. On the Small profile (Workers Free, 10 ms CPU per request) an export uses 50 rows per call by default; give an import `--rows 50` as well.

## Move data on the Data page

The Move data tab copies the analytics tables from the database the site wrote to before into the database it writes to now. It is written for D1 to Postgres, Postgres to D1 and D1 to D1, as long as both databases are bindings of this Worker; SQLite to Postgres and back ran against a real Neon database (see [Duration](#duration)). For a database in another account or install, use the CLI above.

### Before you start: switch first

The page cannot change where the site writes: bindings exist only after a deploy. One config change and one deploy come first:

1. Create the new database (a D1 database, or Postgres through a Hyperdrive configuration created with caching disabled, see [install.md](install.md#postgres-through-hyperdrive)) and add its binding to your wrangler config. Keep the binding of the old database in the config until the move is done.
2. Point the plugin option at the new database (`database`, or a site in `databases`) and deploy.

From that deploy on every new page view, event and order goes to the new database, and the old database keeps everything up to the deploy and receives nothing more. Reports show the new database only, so older days are missing until the move has copied them. Recording is never paused.

### The steps

1. **Where the data is now.** The EmDash database, or another database of this Worker by its binding name (a D1 or Hyperdrive binding in your wrangler config). With several sites, choose one site or every site. The rows per table are counted when the move starts and shown from then on.
2. **Where it goes.** The database the site writes to now, fixed by the plugin option: its binding, engine (D1 or Postgres through Hyperdrive), health and current row count. A Hyperdrive binding with query caching on is shown here; fix it before moving.
3. **Start.** Copies the tables in chunks: daily summaries first, then Search rows, events, server hits, the requests not recorded, visits newest day first, aliases last. A banner reads "Moving data: 43 percent. Older days appear as they arrive." The tab shows rows read, rows of the source and new rows written per table, and an estimate of the chunks left and the minutes they take (see Duration below). Pause, Resume and Cancel are next to it.
4. **Check.** When the copy has finished, the move compares both databases per table, site and day: the row count and the sums of the number columns (decimal columns such as revenue rounded to 2 places). On a day where the new database holds more rows, the old database's rows are also looked up one by one, so rows written since the switch cannot hide a missing one. Only days inside the new database's detailed window are compared, so days its retention already removed do not count as missing; the result names the first day checked. **Short** counts days where the new database lacks a row of the old one or holds lower sums: rows are missing. **More** counts days where it holds more: rows written since the switch, and visits split at the switch. Check again runs the comparison once more.
5. **Remove the old tables.** Deletes the nine analytics tables and `ca_meta` from the old database. Type `DELETE` to confirm. The button stays disabled until the check covered every table and found nothing short. Before it deletes anything, the move makes sure the old database is not one the site writes to under another binding name: it creates a marker table through each database the site writes to and looks for it through the old one. When the old database is the EmDash database, the plugin forgets its table version there, so the tables are created again if the site ever writes to it again. Until you use it the old database is untouched, and pointing the option back and deploying is a full way back.

Users without the permission to manage plugins see the steps and where the data goes, without any buttons; the move itself is shown to users who manage plugins.

### What each state means

| State | Meaning |
|---|---|
| No move yet, the site writes to the EmDash database | Nothing to move. Switch to a new database first (above). The tab can still copy from another binding into the EmDash database, for a way back. |
| Running | The move continues by itself: a background run each minute, and call after call while the tab is open. The daily summaries, revenue summaries, retention and Search tasks skip the new database meanwhile, and the delete tools on the Data page refuse to start, so no day is summarised or deleted from half copied rows. |
| Running, today's rows used | Small profile into a D1 database only: the move has written its 15,000 rows for the day (shared with imports). The tab says so, with the rows written today and at least how many more days the move takes, and checks every 5 minutes. The move continues after 00:00 UTC by itself, also without the tab open. |
| Paused | Nothing is copied; the tasks above still skip the new database. Resume continues at the saved position. A move also pauses by itself after 5 failed tries at the same place, with the error; Resume tries again. |
| Cancelled | Copying stopped. Rows copied so far stay. Start with the same source and site continues the cancelled move from where it stopped. |
| Done | Every table is copied. The cron state of the old database (the summaries watermark and the task positions) is written for the new one, so the tasks close the days since the switch from complete rows. Then the check runs. |
| Old tables removed | The move is finished and the old database no longer holds the analytics tables. The check cannot run again. |
| Error under Start | One chunk failed (for example a database that was not reachable). The move tries it again with the next call, with half the rows; each chunk that passes doubles them back. |

Start is refused while another move or a delete runs, when the source is the database the site already writes to (also under another binding name of the same database), when sites still write to the source and no single site was chosen, and when the binding is not a D1 or Hyperdrive binding of this Worker. Removing the old tables is refused before the move is done, after a move of one site (the other sites' rows stay in the old tables), while sites still write to the old database (also under another binding name), and while the check found rows short. The tab shows the reason the site answered.

### A visit that went on across the switch

A visitor who was on the site at the moment of the deploy starts a new visit in the new database with their next page view. When the move later meets the old part of that visit, it stores it next to the new part under a suffixed id, so both halves stay. Such a visitor counts as two visits on that day. Page views, events and revenue are complete. For all other tables, a row written in the new database since the switch wins over the old row with the same key.

### Counters per day

`ca_srv` (not found and server hits) and `ca_drops` (requests not recorded) hold one count per day and key, so the switch day can have a count in both databases. The plugin remembers, in the EmDash database, which moves (old database, new database, site) already loaded counters:

- The first move of a pair adds the old database's count to the new one's.
- Moving the same pair again (a second start after Done, or after the check found rows short) copies missing rows but adds no count again.
- Moving back (the two databases swapped) keeps the larger of the two counts, because the new database already holds the old one's counts plus its own.
- A cancelled move started again continues with the same rule.

When the connection is lost in the middle of a counter write, the plugin cannot know whether that write was applied, and does not add it again; if it was not applied, those days show as short in the check rather than counted twice.

### Duration

A chunk is 50 rows on the Small profile and 200 otherwise, and at most 1 MB. A call moves chunks until its requests or 40 seconds are used. Its requests are the profile's (40 on Small, 400 otherwise) less what the caller keeps for itself: 2 for the background run each minute, 8 for a call from the open tab. On Small, Start itself copies nothing; the next call does. The estimate on the tab divides the chunks left by the chunks one background run can take; it depends on the size of the rows and the speed of both databases.

On the Small profile into a D1 database the move also writes at most 15,000 rows a day (see [What each state means](#what-each-state-means)): about 7,500 visits a day, since a visit is 2 rows written. Plan a large move on Small in days, or move on Standard.

What was run: the move between SQLite and a Neon Postgres database through the real `pg` driver, in both directions, from a server, not from a Worker, on a test dataset of a few thousand rows. It opened exactly one Postgres connection per call (each new connection counts as one subrequest on the Workers Free plan), and gave equal totals per day on all nine tables and nothing short in the check. A large database takes proportionally more calls.

### Rollback

Point the option back at the old database and deploy, then run a move with the two databases swapped. It copies only what the old database lacks: the rows written to the new one since the first switch. The counters per day keep the larger count, so they are not added twice (see [Counters per day](#counters-per-day)). If the old tables were already removed from the EmDash database, the plugin creates them again on the first write.
