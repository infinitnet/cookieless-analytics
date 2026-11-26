# Cookieless Analytics

Self-hosted, cookieless web analytics for EmDash CMS sites and any other site, with the reports inside the EmDash admin.

- **Privacy first, with metrics others lack.** No cookie and nothing stored on the device unless a visitor opts out, yet real sessions, Search Satisfaction, Search Console and Bing data, funnels and revenue by source.
- **Light and fast.** A page script of about 3 KB gzipped, loaded with `defer` and cached for an hour; one request per page view plus one engagement update. Pages never wait for the analytics database, and there is no extra service to run. Measured figures: [performance.md](https://github.com/infinitnet/cookieless-analytics/blob/main/docs/performance.md).
- **Flexible setup.** Deploy a new site with one click or add the npm package to an existing EmDash site. Measure other sites with one script tag or Google Tag Manager. Keep the data in D1 (the default) or in Postgres through Hyperdrive, with a capacity profile for your Cloudflare plan.

![Overview page with synthetic data](images/overview.png)

## Start here

1. [Quick install](Quick-Install): add the plugin, deploy, check that the first page view arrives.
2. [How visits are counted](How-Visits-Are-Counted): sessions and visitors without cookies.
3. [Reports](Reports): what each admin page shows and how the header, charts and tables work.
4. [Settings reference](Settings-Reference): every key with its default.

## Features

| Page | What it covers |
|---|---|
| [Reports](Reports) | Overview, Pages, Sources, Audience, Behavior, the charts and the header controls |
| [Filters and segments](Filters-and-Segments) | Filter dimensions and operators, saved segments, segment comparison |
| [Search Satisfaction](Search-Satisfaction) | Long clicks, short clicks, bad experiences, pogo sticking, returns from search |
| [Goals and funnels](Goals-and-Funnels) | Goal types, funnel modes, conversion reports |
| [Events](Events) | Every event, how to send it from the page, a server, another plugin or another CMS |
| [Revenue and refunds](Revenue-and-Refunds) | Orders, currencies, refunds, net revenue, revenue by source |
| [Links report](Links-Report) | Short link clicks, views and sales |
| [Search integrations](Search-Integrations) | Google Search Console and Bing Webmaster data, SEO views |
| [Content and site search](Content-and-Site-Search) | Per collection report, internal site search, the editor panel |
| [Dashboards and sharing](Dashboards-and-Sharing) | Custom dashboards, templates, share links, scheduled email |
| [Annotations and impact](Annotations-and-Impact) | Chart markers, scopes, automatic annotations, before and after impact |
| [Agent API and MCP](Agent-API-and-MCP) | API keys, the agent routes, MCP tools |
| [Multi site and Sites view](Multi-Site-and-Sites-View) | Client sites, linked hosts, the All sites table |
| [Definitions](Definitions) | Goals, funnels, segments, rules, annotations, UTM builder, API keys, sites |
| [Data page](Data-Page) | Storage, export, privacy receipt, deleting matching visits |

## Running it

| Page | What it covers |
|---|---|
| [Queue worker](Queue-Worker) | The optional queue ingest tier |
| [Capacity profiles and Cloudflare plans](Capacity-Profiles-and-Cloudflare-Plans) | Small, Standard and Dedicated profiles, plan limits, own database |
| [Postgres through Hyperdrive](Postgres-Hyperdrive) | The analytics tables in Postgres: setup, caching off, measured latency, Free plan limits, providers |
| [Retention](Retention) | How long detailed rows, summaries and Search rows are kept |
| [Move data](Move-Data) | Export and import the analytics tables with the ca-data tool: backups and moves between accounts |
| [Bot handling](Bot-Handling) | How bots are kept out of the numbers |
| [Privacy model](Privacy-Model) | What is stored, what is not, privacy signals, consent by country |
| [Troubleshooting](Troubleshooting) | Symptoms, causes and fixes |
| [Upgrade](Upgrade) | Updating the package |
| [Registry companion](Registry-Companion) | Cookieless Analytics Companion: the setup assistant in the EmDash plugin registry |

## Screenshots

All screenshots in this wiki show synthetic data for example.com with invented numbers.

## Full reference

The `docs` folder of the [repository](https://github.com/infinitnet/cookieless-analytics/tree/main/docs) holds the full reference these pages condense. Where a number differs, the repository docs are right.
