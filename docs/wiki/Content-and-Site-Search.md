# Content and site search

Three views for editors and content owners: traffic per CMS collection, the words visitors search for on your own site, and a Traffic panel in the content editor.

## How to use it

### Traffic per collection

1. Open Dashboards and add a tile of the report `collections` (bars, donut or table; default title "Content types"), or ask the agent API for it.
2. Read page views, page visitors, sessions, average active time and the number of distinct pages per collection.

Each path is classified by the URL pattern of every routable collection. `{name}` in a pattern matches one path segment, and an optional leading locale segment (`/fr`, `/pt-br`) is allowed. A collection without a pattern uses the host default `/{collection}/{slug}`. When two patterns match, the one with more literal characters wins (`/blog/{slug}` beats `/{section}/{slug}`). Paths no pattern matches are `(other)`.

### Internal site search

1. Open Settings, Page script, and set `siteSearchParams` to the query parameter names of your search, comma separated, for example `q` or `s`.
2. Save. No script change is needed: page views keep those parameters from now on.
3. Open Behaviour, Site search. Each row is a term with Searches, Sessions and Searches per session.

A client site can inherit this setting or keep its own list on Definitions, Sites (an own empty list turns site search off for that site).

Each kept value is trimmed, lowercased, whitespace collapsed and cut at 64 characters. A value with an `@` or nine or more consecutive digits is stored as `redacted`, a guard against emails and numbers typed into a search box. Events never keep these parameters.

| Column | Meaning |
|---|---|
| Term | The search term as stored. |
| Searches | Page views carrying the term. |
| Sessions | Sessions per term. Marked `*` when it is an upper bound: the term also appeared next to other kept parameters (a page number, a campaign tag), so one session may count more than once. |
| Searches per session | Searches over sessions. |

To know which searches found nothing, send your own event from the results page:

```js
window.__ec && window.__ec.event("search_no_results", { term_length: 12 });
```

It shows on Behaviour, Events.

### Traffic panel in the editor

1. Open any saved entry in the content editor.
2. The Traffic panel calls the plugin once and shows the last 30 days of the entry's public page:
   - page views with a 30 day sparkline, visitors and the average active time;
   - the top five sources;
   - Search clicks, impressions and average position, when a Search source is connected;
   - the newest five annotations whose scope matches the page;
   - the page's revenue in the default currency, when the site has revenue;
   - a link to the Pages report filtered to the page.

The path is the host's public URL of the entry. A draft, an unpublished entry or an entry without a public URL shows "This entry has no public page yet."

## Settings

| Key | Default | What it does |
|---|---|---|
| `siteSearchParams` | empty (off) | Query parameter names of your site search, at most 5. |
| `queryAllowlist` | `utm_*,gclid,msclkid,fbclid` | Other query parameters kept on stored paths. |
| `reloadDedupeSeconds` | `2` | A refreshed results page within this time counts once. |

## Limits

- `siteSearchParams`: at most 5 names; letters, digits and `_`, up to 16 characters, matched lowercase. The name must match exactly, so `s` never matches `utm_source`.
- Terms are cut at 64 characters.
- Site search reads at most the 5,000 most frequent distinct query strings of the range (notice `site_search_capped` beyond that) and works on detailed data only.
- `collections` reads the daily page summaries, so it covers the whole summary retention. The summaries keep the top 500 pages per day; coverage below 1 means some traffic went to pages outside each day's top 500.
- The collection list is cached for 5 minutes per server instance.
- The editor panel reads at most six statements and writes nothing.

## Gotchas

- Shared dashboard pages and emails omit terms searched in fewer than 2 sessions and print how many were left out, because a rare search can be one person's words. The admin and the agent API show every term.
- The plugin cannot know whether a search found results; send an event for that.
- Page visitors in `collections` are summed per page and day: one person reading two pages of a collection counts twice.
- Filters do not apply to `collections` (notice `filters_not_applied`). A client site has no CMS collections (notice `not_available_for_site`).
- The Traffic panel needs the Editor role (the role that holds `plugins:read`); Authors and Contributors do not see it.
- With site search on, the privacy receipt on the Data page says that the words searched for are kept, with emails and long numbers removed.

## Related

[Events](Events), [Reports](Reports), [Dashboards and sharing](Dashboards-and-Sharing), [Annotations and impact](Annotations-and-Impact), [Privacy model](Privacy-Model), [Settings reference](Settings-Reference), [Agent API and MCP](Agent-API-and-MCP). Full reference: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/content.md
