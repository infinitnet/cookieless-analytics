# Funnels, segment comparison and journeys

Wiki: [Goals and Funnels](https://github.com/infinitnet/cookieless-analytics/wiki/Goals-and-Funnels), [Events](https://github.com/infinitnet/cookieless-analytics/wiki/Events).

Three views on the rows the plugin already stores. None of them adds a table, a setting or a cookie.

## 1. Funnel modes

A funnel has 2 to 6 steps (a page or an event) and one of three modes. Pick the mode in Definitions, Funnels; the Behaviour page, Funnels tab names the mode of the selected funnel. A funnel saved without a mode runs as sequential.

- **Sequential** (default): step n is reached by a matching hit after the step n-1 hit in the same session; anything may happen between.
- **Strict**: step n must be the next countable hit of the session after the step n-1 hit. Countable hits are page views, your own events (not the automatic `_` events such as scroll or engagement) and any hit that matches one of the funnel's steps, so a step on `_outbound` or `_download` works. Hit times have second resolution: hits in the same second are simultaneous, they never count as a hit between two steps and may satisfy consecutive steps in either order. When the next second does not continue the chain, the chain may start again later in the session; the session counts the furthest it got.
- **Flexible**: the steps may happen in any order within one session; step n counts sessions that completed steps 1 to n in any order.

Example, steps `/` then `/pricing`, and a session that views `/`, then `/about`, then `/pricing`:

| Mode | Step 1 | Step 2 |
|---|---|---|
| Sequential | counted | counted (anything may happen between) |
| Strict | counted | not counted (`/about` came between) |
| Flexible | counted | counted |

A session that views `/pricing` and then `/` reaches step 2 only in the flexible mode.

The columns are the same in every mode: `sessions`, `drop_off` and `conversion` (of the first step); the result names the `mode`. Sequential and flexible funnels read at most 50,000 sessions per query. Strict funnels walk every countable hit of every session, so they read at most 10,000 sessions; above that the report answers `funnel_cap` and names the cap. Narrow the range or add filters.

Agents: a stored funnel (`params.funnel`) uses its own mode; ad hoc steps take `params.mode` (`sequential`, `strict`, `flexible`).

## 2. Segment comparison

The compare menu of the header offers "Another segment" next to the period comparisons when segments exist. Side A is the selected segment (or all visitors), side B the segment you pick; both run over the same range with the same filter chips. The URL keeps it as `cmp=seg&cseg=<segment id>`, so the view is a link.

Charts draw side B dashed with both segment names in the legend; tables show the side A value, the side B value under it and the difference. Visitors are never summed across the two sides.

Segment comparison is not available on the Search reports, the SEO views and the impact view: those pages run without it.

Dashboards: `defaults.compare: "segment"` with `defaults.compareSegment` (a segment id; a template carries the segment's name and its definition). When the compare segment was deleted, every tile runs without comparison and says so. A shared page offers the comparison through its usual compare link (`?c=1`), within the same limit of six distinct requests.

Agents: `query.compare: "segment"` with `query.compareSegment`. The answer holds side B in `compareTotals`, `previous` per row and `compareSeries`, `compareRange` equals the range, and `segment` and `compareSegment` name the two sides as `{ id, name }`. Search reports, the SEO views and `impact` answer `compare_not_supported`; an unknown segment answers `unknown_segment`.

## 3. Journeys

Page flows within one visit; there are no paths across visits or people. The Behaviour page, Journeys tab has a page picker, the bar lists "Came from" and "Went to" for that page, and the table of top paths.

- `journey_next` (`params.path`): the pages that followed the page, with `(exit)` for sessions that ended there; `sessions` and `share` of the sessions that viewed the page.
- `journey_prev` (`params.path`): the pages that came before it, with `(entry)` for sessions that started there.
- `journey_paths` (optional `params.entry`): the most common three page sequences from the landing page (`path1`, `path2`, `path3`, `sessions`), 20 rows. A dashboard can show it as a table tile.

Rules:

- Page views of the filtered sessions. A range starting before the raw window (or one whose stored days hold more visits than the scan budget, with no filter set) reads the daily summaries: the top steps and paths of each day (notice `top_paths_per_day`), no filters (`filter_unavailable:<dim>:not_kept`), notices `summary` and `detail_from:<day>`.
- At most 31 days (`journey_range`) and 50,000 sessions (`journey_cap`) per query.
- Consecutive views of one page (a reload, a route re-entry) are one step.
- Rows taken by fewer than 2 sessions are left out and counted in `hidden_sessions`, shown as a footnote: a path of one session would be one person's route.
- Hit times have second resolution. Page views in the same second are ordered by their random hit id, so such pairs may appear in either order.

Each journey report costs one statement plus one count statement for the session cap.

## 4. Internal site search

The `site_search` report (Behaviour page, Site search tab) lists the words visitors searched for on your own site, from the query parameters named in the `siteSearchParams` setting. It is off until that setting is filled, keeps emails and long numbers out, and shared pages and emails omit terms used in fewer than 2 sessions. The setting, the columns and the limits are in [content.md](content.md), section 2.

## Summary data

Days before the detailed window are kept as daily summaries only ([filters.md](filters.md#filters-on-summary-data)).

- Journeys (`journey_next`, `journey_prev`, `journey_paths`): answered from summaries, which keep the top steps and three-page paths of each day (2,000 step rows and 500 paths a day; `small` 200 and 50). Rare steps and paths are not counted (notice `top_paths_per_day`), and no filter applies (`filter_unavailable:<dim>:not_kept`). A range inside the window over the scan budget reads the summaries only when no filter is set.
- Events and goals: answered from summaries, with the filters listed in [filters.md](filters.md#what-applies).
- Funnels, event properties, scroll and site search: detailed data only. A range that starts before the window answers `raw_only`, and the message names the first detailed day.

The notices and their admin texts are listed in [filters.md](filters.md#notices-and-their-meaning).
