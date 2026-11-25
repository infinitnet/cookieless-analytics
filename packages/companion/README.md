# Cookieless Analytics Companion

Cookieless Analytics Companion is a sandboxed EmDash plugin that guides and confirms the install of Cookieless Analytics by Infinitnet, the full cookieless web analytics plugin for EmDash.

It does not count visits. Installing it from the registry does not install or trust the npm package.

The full plugin: [README](../../README.md), [npm package](https://www.npmjs.com/package/@infinitnet/cookieless-analytics), [wiki page for the companion](https://github.com/infinitnet/cookieless-analytics/wiki/Registry-Companion).

## What it does

Cookieless Analytics Companion is a setup assistant with a confirmed handoff. It adds one admin page, Analytics setup, in the Analytics folder of the EmDash admin sidebar.

- **Setup steps for your site.** Four questions (platform, package manager, where the analytics tables live, expected page views per month) give the exact install steps and the code to copy. Each step has a Done toggle, and your progress is kept.
- **Capacity estimate.** From your expected page views per month it shows the rows written per day, the capacity profile that fits and whether the analytics tables should get a database of their own. The numbers come from the full plugin's documented limits.
- **Confirmed handoff.** Once the full plugin runs, its admin confirms itself to the companion. The companion then shows the plugin as installed, links to the Analytics Overview and tells you that it can be removed.

## What it does not do

The companion shows no reports, charts or visit numbers. A plugin from the EmDash registry runs in a sandbox and cannot add a script to public pages, and counting visits needs one.

It requests no permissions, adds nothing to public pages, makes no network request, stores no secret and sends no telemetry.

## What only the full plugin does

Cookieless Analytics by Infinitnet is a native EmDash plugin, distributed on npm as `@infinitnet/cookieless-analytics`. It counts sessions without cookies, shows Search Console and Bing data next to your traffic, measures Search Satisfaction, marks annotations with their measured impact and offers an agent API with MCP tools. Its page script is about 2.5 KB gzipped.

The full plugin needs native plugin access, so the registry, which lists sandboxed plugins only, does not carry it. See [Why a native plugin](../../README.md#why-a-native-plugin).

## Who can install it

The companion installs on sites that run the EmDash plugin sandbox: Cloudflare Workers Paid with D1, or Node with workerd. It needs EmDash 1.5.0 or later.

A site without a plugin sandbox does not need the companion. It installs the full plugin from npm directly with the steps in [docs/install.md](../../docs/install.md).

## Install

1. In the EmDash admin, open Plugins and search the Registry for Cookieless Analytics Companion.
2. Install it. The consent dialog lists no permissions.
3. Open Analytics, Analytics setup, and answer the four questions.
4. Follow the steps and mark each one as done.
5. After the deploy, select I have deployed it.

## The steps it shows

The steps follow [docs/install.md](../../docs/install.md) and change with your answers.

1. Install the package with npm, pnpm or yarn.
2. Add `cookielessAnalytics()` to the `plugins` of `emdash()` in `astro.config.mjs` and `cookielessAnalyticsIntegration()` after `emdash()`. With a database of its own, the steps add the database option and the `wrangler d1 create` lines. With Postgres, they point to the Hyperdrive section.
3. Check that your layout renders `EmDashHead`.
4. On Cloudflare, add a Cron Trigger of `* * * * *`. Every 15 minutes also works.
5. Pick the capacity profile: Standard by default, Dedicated with a database of its own.
6. Set `EMDASH_ENCRYPTION_KEY` before you store Search secrets.
7. Deploy, then run the four checks: the Analytics folder in the sidebar, the script tag in the page source, the script path answering 200, one POST answered with 204.
8. Add a WAF rate limiting rule for the event path.
9. Publish a privacy notice and check the consent rule of your country ([docs/privacy.md](../../docs/privacy.md#consent-and-the-law)).

## How the handoff works

The full plugin finds the companion, not the other way round. When an editor opens the Analytics Overview, the full plugin's admin reads the plugin list of the site with the editor's session. If the companion is installed and enabled, it sends one small message to the companion's private route with its version and the contract version.

The companion then shows one of these states:

- **Not installed yet.** No confirmation has arrived. The steps are shown.
- **Waiting.** You selected I have deployed it and no confirmation has arrived. Open the Analytics Overview once. Full plugin versions before 1.1.0 cannot confirm themselves; select Mark as installed instead.
- **Installed.** The full plugin confirmed itself in the last 30 days, or you marked it as installed. Setup is complete.
- **Out of date.** The full plugin reports a contract version the companion does not know. Update or remove the companion; the full plugin works without it.
- **Last seen.** The last confirmation is older than 30 days. If the full plugin still runs, open its Overview once.

No API key is involved, and the companion never calls the full plugin.

## Remove it

Once setup is complete you can remove the companion. It holds only your setup answers, so nothing needs to be moved.

1. Open Plugins and expand Cookieless Analytics Companion.
2. Select Uninstall.
3. Tick Also delete plugin storage data and confirm.

While the companion stays installed, the Overview of the full plugin shows one notice that you can hide.

## What it stores

One record in the companion's own key value store: your answers, the steps marked as done and the last confirmation from the full plugin (its version, its contract version and the date). The full plugin starts with its own empty tables, so there is no data to migrate.

## Development

The companion is a private workspace package in the repository of the full plugin. It is published to the EmDash plugin registry only, never to npm.

```sh
pnpm --filter @infinitnet/cookieless-analytics-companion validate
pnpm --filter @infinitnet/cookieless-analytics-companion typecheck
pnpm --filter @infinitnet/cookieless-analytics-companion test
pnpm --filter @infinitnet/cookieless-analytics-companion bundle
```

The listing text lives in `listing/`.

## License

Apache-2.0. Copyright 2026 Constantin Oesterling (Infinitnet). See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
