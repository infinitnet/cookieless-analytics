# Upgrade

Upgrading means installing the new package version and redeploying. Table changes run by themselves. Settings, Search connections, salts and stored collections (sites, keys, goals, dashboards, shares, annotations, rules) carry over.

## How to use it

1. Read the release notes of the version on GitHub. The semver surface is route names, the ingest JSON, the window API, settings keys, table and column names, the agent API and the exports of `./contract` and `./server`.
2. Back up each analytics database and note the Time Travel bookmark:

   ```sh
   npx wrangler d1 export site --remote --output=before-upgrade.sql
   npx wrangler d1 time-travel info site
   ```

   On the Free plan, take the export early in the UTC day.
3. Update the package, commit the lockfile and redeploy:

   ```sh
   npm install @infinitnet/cookieless-analytics@latest
   ```

4. If you run the [Queue-Worker](Queue-Worker), set the consumer's `@infinitnet/cookieless-analytics` version to the same version and deploy it too:

   ```sh
   npx wrangler deploy
   ```

5. Open the admin. The footer shows the installed version.
6. Check: load one page of the site in a private window, then open the Data page. No `write_error` count appears under "Not recorded", and Overview shows the visit.

### Migrations

Migrations are forward only: the stored schema version never moves back. They run when the plugin activates and again, lazily, before the first write, in every server instance and in every own analytics database. Nothing has to be run by hand. A release that changes the tables says so in its release notes.

### Optional storage check

The repository has a storage check that posts one synthetic page view and reads it back through the agent API. It needs a key with the `read:analytics` scope:

```sh
CA_API_KEY=abcd1234.your-secret node scripts/smoke-storage.mjs --base https://example.com
```

It costs about 3 rows written and leaves one visit to a `/ca-smoke-<random>` path in the reports.

## Settings

No setting needs to change for an upgrade. On Workers Free, check that `capacityProfile` is `small`.

## Limits

- Peer range: `emdash` `>=1.4.0 <2`. CI checks 1.4.0 and the latest 1.x release. Stay on that range.

## Gotchas

- The queue consumer must run the same plugin version as the site. Messages carry the plugin's own format.
- A Time Travel restore resets the whole database, CMS content included.
- A restore or import writes rows; on the Free plan run it early in the UTC day.
- Upgrading the package does not change your settings. New settings start at their defaults; see [Settings-Reference](Settings-Reference).

## Related

[Quick-Install](Quick-Install), [Queue-Worker](Queue-Worker), [Capacity-Profiles-and-Cloudflare-Plans](Capacity-Profiles-and-Cloudflare-Plans), [Data-Page](Data-Page), [Troubleshooting](Troubleshooting).

Full reference: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/install.md
