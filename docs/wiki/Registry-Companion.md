# Registry Companion

Cookieless Analytics Companion is a sandboxed EmDash plugin that guides and confirms the install of Cookieless Analytics by Infinitnet, the full cookieless web analytics plugin for EmDash. It lives in the EmDash plugin registry.

The companion does not count visits and holds no analytics data. Installing it from the registry does not install or trust the npm package.

## Why there are two plugins

Cookieless Analytics by Infinitnet is a native EmDash plugin. It serves its page script through `page:fragments`, adds Astro middleware for its public paths, ships React admin pages and keeps its data in SQL tables. The EmDash plugin registry lists sandboxed plugins only, and a sandboxed plugin can do none of those things. The full plugin therefore installs from npm.

Cookieless Analytics Companion is the part that fits in the registry: a setup assistant that people can find and install from the admin, which then hands over to the full plugin.

## Who can install it

The companion installs on sites that run the EmDash plugin sandbox:

- Cloudflare Workers Paid with D1 and the Worker Loader binding,
- Node with workerd.

It needs EmDash 1.5.0 or later. A site on Workers Free, or a site without a sandbox runner, does not need the companion: follow [Quick install](Quick-Install) instead.

## Install the companion

1. In the EmDash admin, open Plugins and search the Registry for Cookieless Analytics Companion.
2. Install it. The consent dialog lists no permissions.
3. Open Analytics, Analytics setup.

## What the setup page does

### Four questions

Platform, package manager, where the analytics tables live, and expected page views per month.

### Steps for your site

The answers give the exact steps from [Quick install](Quick-Install), with the code to copy: the package install, the `astro.config.mjs` lines, the `EmDashHead` check, the Cron Trigger, the capacity profile, the `EMDASH_ENCRYPTION_KEY` note, the four checks after the deploy, the WAF rate rule and the privacy notice. Each step has a Done toggle, and your progress is kept.

### Capacity estimate

From the page views per month the page shows the rows written per day (about 3.3 per page view), the capacity profile that fits and whether a database of its own is advisable. See [Capacity profiles and Cloudflare plans](Capacity-Profiles-and-Cloudflare-Plans).

## The handoff

The full plugin finds the companion, not the other way round. When an editor opens the Analytics Overview of the full plugin (version 1.1.0 or later), its admin reads the plugin list of the site with the editor's session. If the companion is installed and enabled, it sends one small message to the companion's private route: the full plugin's version and its contract version. No API key is involved.

The companion page then shows one of these states.

| State | When | What to do |
|---|---|---|
| Not installed yet | No confirmation and nothing declared | Follow the steps, then select I have deployed it |
| Waiting | You declared the deploy, no confirmation yet | Open the Analytics Overview once, or select Mark as installed |
| Installed | A confirmation in the last 30 days, or marked by hand | Nothing; you can remove the companion |
| Out of date | The full plugin reports a contract version the companion does not know | Update or remove the companion |
| Last seen | The last confirmation is older than 30 days | Open the Analytics Overview once, or start over |

Full plugin versions before 1.1.0 cannot confirm themselves. Select Mark as installed.

While the companion is installed and enabled, the Overview of the full plugin shows one notice that setup is complete. Hide dismisses it.

## Remove the companion

The companion holds only your setup answers, so nothing needs to be moved.

1. Open Plugins and expand Cookieless Analytics Companion.
2. Select Uninstall.
3. Tick Also delete plugin storage data and confirm.

The full plugin works the same with or without the companion.

## What it asks for and stores

- No permissions: no capabilities, no allowed hosts, no storage collections.
- Nothing on public pages: no script, no tag, no metadata.
- No network request, no secret, no telemetry.
- One record in its own key value store: your answers, the steps marked as done and the last confirmation (version, contract version, date).
- The setup page needs the permission to manage plugins. The confirmation route is private and needs a signed-in user who may read plugins.

## Related

[Quick install](Quick-Install), [Capacity profiles and Cloudflare plans](Capacity-Profiles-and-Cloudflare-Plans), [Privacy model](Privacy-Model), [Troubleshooting](Troubleshooting).

Companion source and README: https://github.com/infinitnet/cookieless-analytics/tree/main/packages/companion
