# Annotations

Wiki: [Annotations and Impact](https://github.com/infinitnet/cookieless-analytics/wiki/Annotations-and-Impact).

An annotation is a dated note on the charts: a release, a published post, a campaign start. It is written by hand on the Annotations page, posted by a deploy script through the agent API, or created by the plugin when content is published or updated.

## Scopes

Every annotation carries a scope that says where it applies. Without a scope it is site-wide.

```json
{ "v": 1, "host": [{ "op": "is", "value": "shop.example.com" }], "path": [{ "op": "prefix", "value": "/blog/" }] }
```

| Kind | Operators | Values |
|---|---|---|
| `host` | `is`, `regex` | `is`: a lowercase hostname without scheme or port |
| `path` | `is`, `prefix`, `regex` | `is` and `prefix`: start with `/`, compared exactly |
| `query` | `is`, `regex` | `is`: compared case-insensitively |

- Rules of one kind are ORed, kinds are ANDed: `host` a or b, and `path` p.
- At most 10 rules per kind and 20 in total, values up to 512 characters. A `regex` follows the safe regex rules of the filters (200 characters, flag `i` only).
- `{}` and `{ "v": 1 }` mean site-wide. An unknown `v` is rejected at write and read as site-wide.
- The editor's `contains` operator is stored as a regex of the escaped text.
- Query rules apply to Search data only (no query joins a visit), so a query-scoped annotation never shows on traffic charts; the list labels it "Search charts only". Host rules do not apply to Search data, because Search rows are per property.

## The Annotations page

The Annotations page (Analytics, Annotations) is where annotations are written and listed, and where their impact is read. The editor has a date, the text, the scope and the target KPI.

- Simple mode (the default) offers three choices: "Site-wide", "This page" (one path, stored as a path `is` rule) and "This section" (one path prefix, stored as a path `prefix` rule).
- Advanced mode has three rule lists, Host, Path and Query, each with an operator (`is`, `prefix` where allowed, `contains`, `regex`) and a value per row. "Back to simple" returns to the simple form when the scope still fits one rule.
- A summary line under the form shows the scope in words, and a preview counts what the scope matches in the last 30 days ("n hosts, n pages, n queries in the last 30 days", with up to five samples), through the same filter compiler as the reports. A pattern that matches too many values is refused with "The pattern matches more than 2,000 values. Make it more specific."
- Messages on save: "Add at least one rule or choose Site-wide."; "Host must be a lowercase hostname without scheme or port."; "Path must start with /."; "At most 10 rules per kind and 20 in total."; "Combine fewer rules of different kinds in one scope." (a kind that mixes operators is stored as one combined pattern, which has to fit the 200 character limit). A warning, not an error: "Query rules apply to Search data only; this site has no Search source yet."
- Scope summaries read "Site-wide", "Page /blog/x", "Pages starting with /blog/", "Pages matching ^/blog/\d+", "Host shop.example.com", "Hosts matching ^shop\.", "Query how to x", "Queries: 3 terms" (query rules of `is` only) and "Queries matching ^how to". Kinds are joined with " and ", two rules of one kind with " or ", and more than two rules of one kind show the count ("Pages: 4 rules").
- The list shows the annotations of the header's date range as rows, newest first, 50 per page: Date, Kind, Title, Scope, Target and Impact, with Details, Edit and Delete. Kind and Scope (Site-wide, Pages, Hosts, Search queries) filter the rows. Search (at most 100 characters, kept in the URL as `q`) keeps the rows whose title, kind, scope or source slug and collection contains the text, in any case; the list reloads 250 ms after typing stops. Kinds read Manual, Published, Updated and Release. There are no bulk actions.
- One sentence on the page says that impact compares equal windows before and after each annotation and shows what changed, not that the annotation caused it.
- The Impact column measures the row's target over equal windows before and after the annotation day (the day itself is in neither): an arrow, the percent change and a plain word, Up, Down, Flat, Too early or Not enough data. Up and Down are coloured by whether the change is good news, so a fall in bounce rate, exit rate or Search position reads as good. Counts are Flat when the change is within the usual noise (the `notable` rule of the impact view), rates and averages when they moved less than 5 percent. Not enough data: a value is missing, a count pair is under 20, or a rate rests on fewer than 50 sessions, impressions or orders. The tooltip has both values and both windows.
- While the after window is not complete the row shows "Day 5 of 14" and no verdict. Windows end at the last complete day, and for Search targets at the newest final Search day; when Search lags behind, a notice names that day.
- The Window selector above the list offers 7, 14 and 28 days (default 14). The choice is kept in the address as `win` and in this browser as a preference.
- A row whose windows contain another annotation of an overlapping scope (either is site-wide, or both name the same rule) says "Overlaps with ..." because the two effects cannot be separated.
- Details opens the full impact panel of the row (kept in the address as `a=<id>`): the chart, before and after, the measured base, another metric or row to compare, the annotation scope or site-wide, and a fixed strip of the standard KPIs (visitors, sessions, pageviews, bounce rate, engaged rate, average duration) for the same scope and windows. "Impact of a date" opens the same panel for any date (`a=date`).
- A marker on any chart opens its group; "Open in Annotations" goes to the annotation's row.
- With no annotation in the range the page explains annotations in two lines and offers "Add annotation".

### Target KPI

Each annotation can name one target KPI, the metric its impact is measured on. One per annotation keeps the list readable and the noise low; the strip of standard KPIs under an expanded row gives the context. The picker groups the metrics by report and says what each group measures: Traffic (visitors, sessions, page views, bounce rate, engaged rate, average duration, views per session), Pages (average active time and exit rate of one page), Channels (sessions of one channel), Goals (completions or conversion rate of one goal, listed by name), Events (count of one event), Revenue (orders and revenue in the site currency), Search (clicks, impressions, CTR, position; offered only while Google or Bing is connected) and Search Satisfaction. Without a target the page measures visitors of the scope, or Search clicks for a query-scoped annotation while Search data exists.

The scope filters the measured metric: a page-scoped annotation measures that page, a query-scoped one that query in Search. The target is stored on the record as `target: { report, metric, params? }` in the vocabulary of the impact view (`params.key` for a row: a channel, a page or an event; `params.goal` for a goal id).

- Annotations of a client site work the same with that site selected; host rules are the way to annotate one hostname of a client site that has several.

## When an annotation shows on a chart

A chart shows an annotation when its day lies in the chart's range and its scope matches the chart's filters (page filters, segment and tile filters together):

- a kind with no filter on its dimension matches (an unfiltered chart shows every value);
- an exact value is tested directly: a `page is /blog/a` filter matches a path `prefix /blog/` rule, a path `is /blog/a` rule matches a `page prefix /blog` filter;
- two prefixes match when one starts with the other;
- a pattern against a pattern (a regex rule against a `contains` or `regex` filter) is shown when unsure: deciding whether two patterns overlap is not worth it for a marker;
- a negative filter (`is_not`, `not_prefix`, ...) hides the annotation only when it excludes every `is` rule of the kind.

## Charts

Overview and the Search Satisfaction trend each have an "Annotations" button; the dashboard view has "Show annotations" in its More menu. It is kept in the address as `ann=0` when off (absent means on), so the choice belongs to the view and travels with links; nothing is stored in the browser and there is no setting. Annotations on one bucket share a marker with a count; markers closer than 10 units of the chart width merge into one. Click, Enter or Space opens the list of the group with text, date, kind and scope; Escape closes it.

## Dashboards and shared pages

Series tiles (`line`, `area`) of a dashboard show the annotations matching the tile's filters. Shared pages show them only when "Show annotations to viewers" is on (`viewer.annotations`, off by default): markers with a native tooltip and a list of at most 12 per tile. Annotation texts are visible to anyone with the link when this is on.

## Automatic annotations

When a content item is published, and when a published item is saved again if that is turned on, the plugin adds one annotation per item, kind and day (kinds "Published" and "Updated"; the editor shows them read-only). The text is the item's title (its slug when it has none); `slug` and `collection` are kept on the record.

The scope is a path `is` rule with the item's public path, derived the way the site builds its own URL:

1. The host resolves the public URL of the entry from the collection's URL pattern, for example `/blog/{slug}`: `{slug}` and `{id}` are filled with the entry's slug and id, and the date tokens, the locale prefix and the trailing slash rule are applied as the site renders them.
2. Any other placeholder the host leaves open, such as `{category}`, is filled from the entry's own data, but only with a string or number made of letters, digits, `.`, `_` and `-` (at most 128 characters).
3. The path of the resulting URL is stored (at most 512 characters).

When the path cannot be resolved (the collection is not routable, the entry is a draft, no site URL is configured, a placeholder stays empty or the read fails) the annotation is site-wide and keeps `slug` and `collection`, so the path can be set by hand on the Annotations page. The derivation never fails a publish. Client sites get no automatic annotations.

### Settings

The Annotations section of the Settings page decides what adds one ([settings](settings.md)):

| Setting | Default | Effect |
|---|---|---|
| `autoAnnotations` | on | Master switch. Off, the content hooks write nothing. |
| `annotatePublish` | on | An item is published. |
| `annotateUpdate` | off | A published item is saved again. Every save counts, so this is the noisy one. |
| `annotateCollections` | empty | Only these collection slugs annotate; empty is every collection. |
| `autoAnnotationsPerDay` | 10 (1 to 200) | At most this many automatic annotations per site and day in the site timezone. Further hooks that day add none, so a bulk import or content push cannot fill the charts with markers. Saving the same item again the same day replaces its annotation and does not count again. |

The count of the day is one entry in the plugin's key value store, read and written once per hook; a skipped hook resolves no path and writes nothing. Hooks running at the same moment can each pass the cap, so a parallel burst may overshoot it slightly. Manual and release annotations are never counted or capped. No default scope exists for manual annotations.

## Agent API

- `POST agent/v1/annotations` with `scope`, or with `path` as a shortcut for one page (not both: `scope_conflict`).
- `POST agent/v1/annotations` and the MCP tool `analytics_annotate` accept `target`.
- `GET agent/v1/annotations` returns `scope`, `summary` and `target` (null for the default) per item; `?path=`, `?host=` and `?query=` keep the annotations whose scope matches that value.
- `query` with `report: "annotation_impacts"` returns the rows of the Annotations page with their verdicts in one call (see [AGENTS.md](AGENTS.md), section 10).
- `withAnnotations: true` on `query` adds the matching annotations as `data.annotations` and `meta.annotations: { matched, loaded, truncated }`.

## Limits

At most 500 annotations per range are read (newest first). The Annotations page measures at most 6 rows per call (5 on the small capacity profile) in one `annotation_impacts` request, which only reads; the rest is paged (see [limits.md](limits.md#impact)). The preview in the editor counts hosts, pages and queries of the last 30 days through the same filter compiler as the reports.
