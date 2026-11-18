Cookieless Analytics Companion is a sandboxed EmDash plugin that guides and confirms the install of Cookieless Analytics by Infinitnet, the full cookieless web analytics plugin for EmDash.

The companion does not count visits and holds no analytics data. A plugin from the registry cannot add the page script that counting needs, so the counting happens in the full plugin, which installs from npm.

## What the companion does

- **Setup steps for your site.** Four questions (platform, package manager, where the analytics tables live, expected page views per month) give the exact install steps and the code to copy. Each step has a Done toggle, and your progress is kept.
- **Capacity estimate.** From your expected page views it shows the rows written per day, the capacity profile that fits and whether the analytics tables should get a database of their own.
- **Confirmed handoff.** Once the full plugin runs, its admin confirms itself to the companion. The companion then shows the plugin as installed, links to the Analytics Overview and tells you that it can be removed.

## What only the full plugin does

Cookieless Analytics by Infinitnet is a native EmDash plugin. It counts sessions without cookies, shows Search Console and Bing data next to your traffic, measures Search Satisfaction, marks annotations with their measured impact and offers an agent API. Its page script is about 2.5 KB gzipped.

## What it asks for

The companion requests no permissions. It adds nothing to your public pages, calls no outside service and stores no secret. It keeps one record with your setup answers and progress.
