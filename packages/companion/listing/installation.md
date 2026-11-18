A site without a plugin sandbox does not need the companion. Install Cookieless Analytics by Infinitnet, the full plugin, from npm directly with the steps below.

## Install the companion

The companion installs on sites that run the EmDash plugin sandbox: Cloudflare Workers Paid with D1, or Node with workerd.

1. In the EmDash admin, open Plugins and search the Registry for Cookieless Analytics Companion.
2. Install it. The consent dialog lists no permissions.
3. Open Analytics, Analytics setup, and answer the four questions.

## Install the full plugin

These are the steps the companion shows, in short form.

1. Install the package: `npm install @infinitnet/cookieless-analytics`.
2. In `astro.config.mjs`, add `cookielessAnalytics()` to the `plugins` of `emdash()` and add `cookielessAnalyticsIntegration()` after `emdash()` in `integrations`.
3. Make sure your layout renders `EmDashHead`. The page script is added there.
4. On Cloudflare, add a Cron Trigger of `* * * * *` to your Wrangler config.
5. Keep the Standard capacity profile, or choose Dedicated when the analytics tables have a database of their own.
6. Set `EMDASH_ENCRYPTION_KEY` before you connect Search Console or Bing.
7. Deploy. Then check that the Analytics folder is in the admin sidebar, that the page source has one script tag for `/_/e.js`, that `/_/e.js` answers 200, and that a page view sends one POST answered with 204.
8. Add a WAF rate limiting rule for `POST /_/e`.
9. Publish a privacy notice. The privacy doc in the repository has the text and the consent rules by country.

Full guide: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/install.md

## After the deploy

Select I have deployed it in the companion. Then open the Analytics Overview once: the full plugin, version 1.1.0 or later, confirms itself to the companion. With an older version, select Mark as installed.
