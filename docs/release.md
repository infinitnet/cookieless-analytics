# Release checks

Checks run by hand before a release, in addition to CI. They cover what tests cannot see: the real Workers runtime, Cloudflare in front of it, the live Search APIs and real browsers. Run the first part on a staging Worker with its own D1 database; the checks under "Production site" need real traffic and run on your production site. Write the measured numbers into the release notes, and update the docs when they differ from what the docs state.

## Before tagging

Run these in the working tree that will be tagged. Every one must pass.

```
pnpm typecheck
pnpm test
pnpm build
pnpm lint:package
node scripts/build-settings-doc.mjs --check
node scripts/build-openapi.mjs --check
```

- `pnpm lint:package` runs `publint` and `attw` on the packed tarball (`infinitnet-cookieless-analytics-1.0.0.tgz`, which holds only `dist`, `src`, the README, LICENSE, NOTICE and THIRD_PARTY_NOTICES).
- The two `--check` commands fail when `docs/settings.md` or `docs/openapi.json` do not match what the code generates; regenerate with `pnpm docs:settings` and `pnpm openapi`.
- Confirm that the version in `package.json` is the one to release, then tag `v1.0.0`. Pushing the tag starts `.github/workflows/release.yml`: it checks that the tag matches `package.json`, runs the typecheck and the tests, builds, checks that `dist` is current, packs the tarball, publishes that tarball as `@infinitnet/cookieless-analytics` to npm through trusted publishing, with provenance, and creates the GitHub release with generated notes and the tarball attached. It refuses a tag on a commit that is not on `main`. A re-run skips the publish when the version is already on npm and the GitHub release when it exists, so after a late failure it only creates what is missing.
- Screenshots: every screenshot is a dark mode capture. The wiki images (`docs/wiki/images`) are full pages at 1440 px (and 390 px for some pages), palette PNGs of at most 200 KB; the README screenshots (`docs/readme`) are crops of them. After a change to the admin, regenerate both from the repository root (Chromium needed; `CHROME_PATH` and `PLAYWRIGHT_CORE` as described in the header of `scripts/dev/capture-wiki-shots.mjs`): `node scripts/dev/capture-wiki-shots.mjs && node scripts/dev/readme-shots.mjs`. `readme-shots.mjs` crops the top 1440 x 800 of each into a palette PNG under 150 KB and stops with an error when a source is missing.
  - Commit both `docs/wiki/images` and `docs/readme`.
- README image links are relative (`docs/readme/<name>.png`) and `docs/readme` is not in the tarball. On npmjs.com they render because npm rewrites relative links against the `repository` field of `package.json` (`git+https://github.com/infinitnet/cookieless-analytics.git`), so they show the files on the default branch of GitHub.
- Protect `v*` tags in the repository settings (a tag ruleset limited to maintainers): anyone who can push a version tag starts a publish.

## Registry companion

The registry companion is released separately from `packages/companion`, through its own tag pattern `cookieless-analytics-companion@X.Y.Z`, with the version taken from `packages/companion/package.json`. The native package keeps its `v*` tags, and `release.yml` does not run for a companion tag. Before tagging, the companion's `validate`, `typecheck`, `test` and `bundle` scripts pass (see [CONTRIBUTING.md](../CONTRIBUTING.md#registry-companion)), and the bundled tarball lists only the files the registry expects.

## Repository settings (once, after the repository is public)

- Settings, General, Pull Requests: enable Allow auto-merge. Only `.github/workflows/dependabot-automerge.yml` uses it, and only for Dependabot patch, minor and security updates.
- Settings, Rules, Rulesets, new branch ruleset on `main`: require status checks to pass, add the `CI` check (it becomes selectable after the first CI run), and add the repository admin role to the bypass list. Do not require pull requests, so maintainers can still push.
- Settings, Rules, Rulesets, new tag ruleset for `v*`: restrict creation to maintainers.
- No secret is needed for npm: the release publishes through trusted publishing ([below](#trusted-publishing)).
- On npm, the `infinitnet` organization scope must exist and the maintainer who bootstraps the package must be a member with publish rights.
- Settings, Advanced Security: enable secret scanning and push protection (free for public repositories) and private vulnerability reporting.
- Settings, Features: enable Wikis. The `wiki.yml` workflow publishes `docs/wiki/` on pushes to `main`.

## Trusted publishing

The release workflow publishes with npm trusted publishing: the job's GitHub OIDC token (`id-token: write`) is exchanged for a short lived publish credential, and npm adds a provenance attestation. There is no npm token in the repository, and none to rotate. npm can only attach a trusted publisher to a package that already exists, so the very first publish of the name is done by hand, once.

A) Bootstrap the name from a maintainer machine logged in to npm with two-factor authentication. Publish a placeholder `0.0.1` under the dist-tag `bootstrap`, as one line from an empty directory:

```
d=$(mktemp -d) && cd "$d" && printf '{"name":"@infinitnet/cookieless-analytics","version":"0.0.1","description":"Placeholder that reserves the name; install 1.0.0 or later.","license":"Apache-2.0","repository":{"type":"git","url":"git+https://github.com/infinitnet/cookieless-analytics.git"}}\n' > package.json && npm publish --access public --tag bootstrap
```

Use a placeholder rather than publishing the real 1.0.0 tarball by hand: `latest` stays empty, so nobody installs the placeholder by accident, and v1.0.0 itself ships from CI with provenance. A hand-published 1.0.0 would carry no provenance and would take the version number the workflow is meant to publish.

B) On npmjs.com open the package, Settings, Trusted publishing, and add GitHub Actions with organization `infinitnet`, repository `cookieless-analytics`, workflow filename `release.yml` and the environment left empty. Choose the allowed action `npm publish`. The configuration must complete its first successful publish within 2 days, so do D) right after.

C) In the same package settings, under Publishing access, choose "Require two-factor authentication and disallow tokens". Trusted publishing keeps working; tokens can no longer publish.

D) Push the tag `v1.0.0` (Before tagging, above). The workflow publishes 1.0.0 with provenance and moves `latest` to it.

E) Remove the bootstrap dist-tag (the maintainer runs this; the placeholder version itself stays, npm does not allow reusing it):

```
npm dist-tag rm @infinitnet/cookieless-analytics bootstrap
```

## Capture on the real runtime

- Cached HTML: serve a page through Cloudflare with a Cache Rule that caches HTML, load it twice and confirm the page script is present in both responses, the cached copy included, and that the page view is recorded each time.
- `request.cf`: in a request that reaches the middleware, confirm `cf` is present (country and the other fields the plugin reads) and that a recorded page view carries the country.
- Middleware order: the plugin middleware must run after the host's own middleware and before the page. Confirm the script path answers with its `etag` and `cache-control: public, max-age=3600`, that the share path and the collect path are answered by the middleware, and that an error page seen by a human is recorded as a server hit while the response is returned unchanged.
- 204 from the alias and the direct route: post a page view to the collect path (the alias, through the middleware) and to the direct plugin route; both answer 204 with no body, and a request from a bot user agent answers 204 and writes nothing.
- `OPTIONS` on the collect path: a preflight answers 204 with `access-control-allow-origin: *`, `access-control-allow-methods: POST`, `access-control-allow-headers: content-type` and `access-control-max-age: 86400`.
- Dialect detection: `getDb()` reports the dialect the staging database really has; open Overview and one filtered report and confirm no SQL error appears.

## D1 write rate and capacity

Repeat the measured items of [limits.md](limits.md#measured-on-production-d1) on the deployment and record the numbers with the release:

- Write latency per statement: the end to end time of a small write from the Worker (p50), and the page view write plus engagement update, next to the SQL time the D1 metrics report.
- Load: a sustained load against the staging site (for example 100 requests per second for ten minutes with a load tool) and the number of `503` answers during it, read from the logs and from the `overload` and `write_error` counts on the Data page.
- Rows written per page view: rows written from the D1 metrics divided by the page views recorded in the same period, against the 3.3 (3.9 with retention) in limits.md.

Figures limits.md marks as not measured should be confirmed when the deployment allows it, and limits.md updated when they are: the Free plan's page views per day (stated there as an estimate only) and the queue consumer's throughput.

## Cron

- Cron Trigger cadence: the Worker needs a Cron Trigger of `* * * * *` (recommended; every 15 minutes works, with one background task per invocation taking turns and slower catch-up), as in [install.md](install.md). With the one minute trigger, read the logs for a day and confirm the tasks run at their minutes: rollup at 0 and 30, retention at 17, Search at 7, revenue at 25 and 55, mail at 15, 35 and 45, salts at 00:05, and that no two tasks share an invocation.
- One-shot continuation: start a Search backfill over a long range and confirm that each run stops at its call budget, schedules a one-shot continuation and that the next invocation resumes from the stored cursor until the backfill is done, with no day stored twice.

## Search sources, live

- Google OAuth: connect through the web flow, return to the admin page and confirm no token appears in the page, the network responses or the logs.
- Service account: connect with a service account key and confirm the same.
- Property picker: for the local site and for one client site, open the picker, choose a property and confirm that a property the connection cannot see is not offered. Grant the master's identity access to a second property in Search Console and confirm it appears (`docs/search-sources.md`, one connection and several properties).
- First sync and backfill: confirm the first sync stores the newest days (the latest two to three days marked provisional) and that a backfill of 30 days finishes and survives a Worker restart in the middle.
- Bing: pull with an API key and confirm the `GetUserSites` response field names the connection check relies on (the site URL field and its verification state), and that the weekly rows arrive. Record any difference in `docs/design-notes.md`.
- Bing `GetQueryPageStats`: open a Bing query drill-down (Cannibalization, query row, Pages, source Bing) and confirm the field names of the response: rows of type `QueryStats` with the page URL in `Query`, and the parameter name `query`.

## Master and satellites

- Master to satellite query: with a connected site added in Definitions, switch to it with the site switcher and open Overview, Pages and one dashboard; the numbers are the satellite's and the master's key never appears in a response.
- Client page on another https host: register a site with one hostname you control, load the snippet directly on a page of that host and confirm the page view appears under that site in the switcher. Repeat through a Tag Manager container (Custom HTML tag, trigger "Initialization - All Pages") and, for a single page app, with the History Change trigger calling `page()`.
- Pause the site and confirm new events stop at once; regenerate its key and confirm the old key is refused.
- All-sites summary: open it on the master and confirm every site shows its numbers, including the connected one.

## Shared dashboards

- Open an open share link in a private window: the page renders, the range links work, the network panel shows no request other than the page itself (and the browser's own favicon lookup).
- Open a password link in a private window: the browser shows its own sign-in prompt; a wrong password prompts again; the right one shows the page; the user name does not matter.
- Measure the CPU time of one password verification from the Workers log (first view of a password link in a fresh isolate) and record it with the release. It must stay well under 10 ms.
- Check the response headers as served through Cloudflare for an open link, a password link, a 401, a 404 and, after ten wrong passwords, a 429: `x-robots-tag`, `cache-control`, `referrer-policy`, `x-content-type-options`, `content-security-policy`, `www-authenticate` on 401 only and `retry-after` on 429 only (see `docs/dashboards.md`, Headers).
- `HEAD` on a share link returns the same headers without a body.
- Revoke the link and confirm it answers 404 within a minute.
- Create a dashboard with a line tile, add a manual annotation inside its range, turn on "Show annotations to viewers" and open the link in a private window with JavaScript disabled: the marker shows its tooltip and the annotation list sits under the chart.

## Annotations and publishing

- Publish a real post on the staging site: an annotation of kind publish appears, and its scope carries the item's public path (open it on the Annotations page and read the scope).
- Open the impact panel from that annotation (Annotations page, Details): the scope shows the derived page, the windows exclude the publish day, and the completeness warning shows while the after window is short.

## SEO views and impact

- On the staging D1 database with real Search rows, open the Cannibalization, Positions and Changes tabs at 30 and at 93 days and record the D1 duration and rows read per statement from the D1 metrics (expected near `searchMaxRowsPerDay * days` rows read; see `docs/limits.md`).
- On EmDash 1.4 and 1.5 hosts, check the sidebar: the nine pages sit in one folder labelled "Analytics" in the Plugins section, the folder remembers its open state, and the dashboard widget is titled "Cookieless Analytics". On 1.5 the plugin list shows "Cookieless Analytics by Infinitnet" with the description.

## Production site

These need real traffic and a real mail provider, so they run on your production site.

- Order event once through each path: send one order with `event()` from the page and one through `agent/v1/events` with the same order id. The order must appear once, under the right channel and currency, and the agent post must replace the amount and currency without adding a second order.
- Script size: measure the page script as served (the bytes on the wire and the decoded size) and record both in the release notes.
- Editor panel on EmDash 1.4 and 1.5: open a published entry in the editor on each version and confirm the panel shows its figures, with the same path derivation as the publish annotation.
- Scheduled email: schedule one dashboard to your own address and confirm it is delivered through the site's mail provider, with every amount carrying its currency code and no recipient address visible to an API key.
- MCP: make one tool call from a host token (for example the dashboards list or a report) and confirm the result and that a token without the needed scope is refused.
