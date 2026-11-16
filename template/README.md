# EmDash site with Cookieless Analytics (Cloudflare)

An EmDash site on Cloudflare Workers with the [Cookieless Analytics](https://github.com/infinitnet/cookieless-analytics) plugin already installed. It is the EmDash Cloudflare starter (posts, pages, categories, tags, minimal styling) plus the plugin, wired in the way the plugin's [install guide](https://github.com/infinitnet/cookieless-analytics/blob/main/docs/install.md) describes.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/infinitnet/cookieless-analytics/tree/main/template)

## What is wired in

- `package.json`: the dependency `@infinitnet/cookieless-analytics` from npm.
- `astro.config.mjs`: the plugin in the `plugins` option of `emdash()`, and its Astro integration after `emdash()`.
- `src/layouts/Base.astro`: renders `EmDashHead`, which adds the plugin's one script tag to every page.
- `wrangler.jsonc`: the D1 database `DB`, the R2 bucket `MEDIA` and a Cron Trigger every minute, which runs EmDash's scheduled publishing and the plugin's background tasks.
- `.dev.vars.example`: the secret `EMDASH_ENCRYPTION_KEY`.

## After the first deploy

1. Open `https://<your-worker>/_emdash/admin` and complete the setup wizard. EmDash creates its tables and applies the starter seed; the plugin creates its tables on first use.
2. Pick the capacity profile in Analytics, Settings, Data and capacity: **Small on the Workers Free plan**. The default, Standard, is sized for Workers Paid.
3. Before you connect Google Search Console or Bing, set `EMDASH_ENCRYPTION_KEY` if you left it empty: `npx emdash secrets generate`, then `npx wrangler secret put EMDASH_ENCRYPTION_KEY`. Keep a backup of the key.
4. Load a page in a private window, then open Analytics, Overview: the visit appears a few seconds later. Signed-in editors are not counted.

Add a WAF rate limiting rule for `POST /_/e`, as the install guide describes.

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

Open http://localhost:4321/_emdash/admin and complete the setup wizard.

## Deploy from the command line

```sh
pnpm wrangler login
pnpm run deploy
```

The first deploy creates the D1 database and the R2 bucket named in `wrangler.jsonc`.

## Licence

The site code is the EmDash Cloudflare starter under the MIT License (see [LICENSE](LICENSE) and [NOTICE](NOTICE)). The plugin is installed from npm under the Apache License 2.0.
