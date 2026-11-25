# Collections, site search and the editor panel

Wiki: [Content and Site Search](https://github.com/infinitnet/cookieless-analytics/wiki/Content-and-Site-Search).

Three content facing views. None of them adds a table; site search adds one setting, `siteSearchParams`.

## 1. Per-collection report

Report `collections` (dashboard tile: bars, donut or table; agent API): pageviews, page visitors, sessions, average active time and the number of distinct pages per CMS collection.

- It reads the daily page summaries (`ca_rollup`, dimension `page`), so it covers the whole summary retention, not only the raw window.
- Each path is classified by the URL pattern of every routable collection (`ctx.schema.listCollections()`, capability `schema:read`). A pattern becomes an anchored expression: `{name}` matches one path segment, and an optional leading locale segment (`/fr`, `/pt-br`) is allowed. A collection without a pattern uses the host default `/{collection}/{slug}`. When two patterns match, the one with the most literal characters wins (`/blog/{slug}` beats `/{section}/{slug}`). Paths no pattern matches are `(other)`.
- The collection list is cached for 5 minutes per server instance, so a new collection shows up within 5 minutes.
- **Page visitors** are the sum of per-page daily visitors: one person reading two pages of a collection counts twice.
- **Coverage** (`totals.coverage`) is the classified share of all pageviews of the range. The summaries keep the top 500 pages per day and fold the rest into one row without a path; that row belongs to no collection, so coverage below 1 means some traffic went to pages outside each day's top 500.
- Filters do not apply (a summary row holds one dimension); the report says so with the notice `filters_not_applied`.
- A client site has no CMS collections: the report answers the notice `not_available_for_site`.

## 2. Internal site search

Set `siteSearchParams` in the plugin settings to the query parameter names of your site search, comma separated, at most 5 (for example `q` or `s`). Names are letters, digits and `_`, up to 16 characters, and are matched lowercase. Empty, the default, is off. A client site can inherit this setting or keep its own list on the Sites tab (an own empty list is off for that site).

When set, page views keep those parameters in the stored query string, next to the query parameter allowlist. Each value is trimmed, lowercased, whitespace collapsed and cut at 64 characters, and replaced by `redacted` when it contains an `@` or nine or more consecutive digits, a guard against emails and numbers typed into a search box. Events never keep them. No script change is needed. With the setting empty the stored query strings are exactly as before.

Report `site_search` (Behavior page, Site search tab; dashboard tile: table; agent API), raw window only:

| Column | Meaning |
|---|---|
| `term` | The search term as stored. |
| `searches` | Page views carrying the term. |
| `sessions` | Sessions per term, summed over the distinct stored query strings that carry the term. When the term also appears next to other kept parameters (a page number, a campaign tag), one session may count once per string, so the figure is an upper bound; the row then has `sessions_upper_bound: true` and the admin marks it with `*`. |
| `searches_per_session` | `searches` over `sessions`. |

At most the 5,000 most frequent distinct query strings of the range are read (notice `site_search_capped` beyond that). The parameter name must match exactly, so `s` never matches `utm_source`.

Limits: the plugin cannot know whether a search found results; a site that wants this sends an event such as `search_no_results`, which the Events report already shows. A refreshed results page counts once because of the reload dedupe.

Shared dashboard pages and emails omit terms searched in fewer than 2 sessions and print how many were left out ("1 search term used in fewer than 2 sessions is not shown."), because a rare search can be one person's words. The admin and the agent API show every term.

Privacy receipt line: "If a site search parameter is configured, the words searched for are kept, with emails and long numbers removed."

## 3. Editor sidebar panel

The content editor shows a **Traffic** panel for every collection (EmDash `contentEditorPanels`, saved entries only). It needs the Editor role, the role that holds `plugins:read`; Authors and Contributors do not see it. When it opens it calls the private route `editor/traffic` once and shows the last 30 days of the entry's public page:

- pageviews with a 30 day sparkline, visitors and the average active time;
- the top five sources;
- Search clicks, impressions and average position, when a Search source is connected;
- the newest five annotations whose scope matches the page;
- the page's revenue in the default currency, when the site has recorded revenue;
- a link to the Pages report filtered to the page.

The path is derived exactly as for the automatic publish annotations: the host's public URL of the entry, with a custom `{placeholder}` the host leaves open filled from the entry's data. A draft, an unpublished entry or an entry without a public URL shows "This entry has no public page yet." The route reads at most six statements and changes nothing.
