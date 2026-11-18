## Does the companion count visits?

No. Cookieless Analytics Companion holds no analytics data. A plugin from the registry cannot add a script to public pages, and counting needs one. Cookieless Analytics by Infinitnet, the full plugin, does the counting.

## Why is the full plugin not in the registry?

The full plugin needs native plugin access: it serves its page script through `page:fragments`, adds Astro middleware for its public paths, ships React admin pages and keeps its data in SQL tables. The registry lists sandboxed plugins only, so the full plugin installs from npm.

## Do I need the companion?

No. It is a setup assistant. You can install the full plugin from npm without it, and the full plugin works the same either way.

## Does installing the companion install the npm package?

No. Installing the companion from the registry does not install or trust the npm package. You add the npm package to your site yourself and deploy.

## How does the companion know the full plugin is installed?

When you open the Analytics Overview, the full plugin (version 1.1.0 or later) sends its version number to the companion through your signed-in browser. No API key is involved. With an older version, select Mark as installed.

## Can I remove the companion after setup?

Yes. Once setup is complete the companion says so. It holds only your setup answers, so nothing needs to be moved. To remove it, open Plugins, expand Cookieless Analytics Companion, select Uninstall, tick Also delete plugin storage data and confirm.

## Which sites can install it?

Sites that run the EmDash plugin sandbox: Cloudflare Workers Paid with D1, or Node with workerd. Other sites install the full plugin from npm directly.
