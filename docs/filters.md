# Filters and segments

Wiki: [Filters and Segments](https://github.com/infinitnet/cookieless-analytics/wiki/Filters-and-Segments).

Every report in the admin, every dashboard tile and the agent API accept the same filters. A filter keeps a set of sessions and every number is computed over that set.

A filter has four parts:

```json
{ "dim": "channel", "op": "is", "values": ["Organic Search"] }
```

- `dim`: what to look at (a dimension).
- `op`: how to compare (an operator).
- `values`: one or more values (1 to 500, each up to 512 characters).
- `prop`: the property key, for the `event_prop` dimension only; for `revenue` an optional currency code.

## Dimensions

**Session dimensions** compare a field that was set when the session started.

| `dim` | Admin label | Field |
|---|---|---|
| `entry` | Entry page | first page path |
| `exit` | Exit page | last page path |
| `channel` | Channel | acquisition channel |
| `source` | Source | traffic source |
| `ref_host` | Referrer | referrer host |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | UTM source and so on | campaign tags |
| `host` | Host | host name of the entry page (a client with several host names splits by it) |
| `country` | Country | country code |
| `region` | Region | region (needs `captureRegion`) |
| `device` | Device | desktop, mobile or tablet |
| `browser` | Browser | browser family |
| `os` | OS | operating system family |
| `lang` | Language | primary language tag |

**Hit dimensions** compare something a session did. A session passes when at least one of its hits matches.

| `dim` | Admin label | What is compared |
|---|---|---|
| `page` | Page | path of a page view (error pages are included for the regex lookup) |
| `event` | Event | event name |
| `event_prop` | Event property | the value of one property of an event, with `prop` set to the key |
| `goal` | Goal | the name of a goal; the session completed it |

**Revenue dimensions** (see [revenue.md](revenue.md)):

| `dim` | Admin label | What is compared |
|---|---|---|
| `currency` | Currency | ISO 4217 code of an order in the session |
| `revenue` | Revenue at least | the sum of the session's order values in one currency |

Search reports use their own dimensions, `page` (the normalized page key), `query`, `country`, `device` and `source`, with the same operators. Traffic dimensions are ignored there and the report says so.

## Operators

| `op` | Meaning | Case |
|---|---|---|
| `is` | equals one of the values | exact |
| `is_not` | equals none of the values | exact |
| `contains` | contains one of the values | ignored |
| `not_contains` | contains none of them | ignored |
| `prefix` | starts with one of the values | ignored |
| `not_prefix` | starts with none of them | ignored |
| `regex` | matches one of the patterns | ignored |
| `not_regex` | matches none of them | ignored |
| `gt`, `gte`, `lt`, `lte` | greater, at least, less, at most (dimension `revenue` only) | none |

In the filter bar the operator menu offers is, contains, starts with and matches regex. The Include and Exclude button turns an operator into its negative (`is` into `is_not` and so on). Several values in one filter mean "any of these". Several filters mean "all of these".

`contains` and `prefix` treat `%` and `_` as plain characters.

### Include and exclude

A negative operator negates the whole predicate. For a hit dimension that means sessions with no matching hit: "Page is not /pricing" keeps the sessions that never viewed `/pricing`. For a session field it also keeps sessions where the field is empty.

### Event property filters

`event_prop` needs `prop`, the property key (`^[A-Za-z0-9_]{1,32}$`). The values are compared as text, so a number is compared as the string you type (`"3"`). The admin adds these filters from the event properties report on the Behavior page. Events carry at most 10 properties ([integration.md](integration.md)).

### Goal filters

`goal` takes goal names. It expands the goal's definition (a page, an event or an outbound link) and keeps the sessions that completed it. An unknown or inactive goal name is the error `unknown_goal`.

### Currency and revenue filters

- `currency` takes `is` or `is_not` with currency codes (`EUR`, `usd`; codes are case-insensitive and stored in upper case). `is` keeps sessions that have at least one order in one of those currencies. `is_not` keeps sessions with no order in them, including sessions without any order.
- `revenue` takes one of `gt`, `gte`, `lt`, `lte` and exactly one amount such as `50` or `49.90` (up to 10 digits and 3 decimals). It compares the session's summed order value in one currency: `prop` names the currency, and without it the site's default currency is used. The admin entry "Revenue at least" adds `revenue gte` in the default currency.
- `lt` and `lte` include sessions without any order ("less than 50, including none"). `lte 0` matches sessions whose orders were all free, and `lt 0` matches nothing.
- Money of different currencies is never added together.
- Both filters read raw rows, so they work inside the raw window only.

Other operators on `revenue`, numeric operators on any other dimension, and any operator but `is` or `is_not` on `currency` are rejected with `invalid_filter`.

## Limits

- At most 20 filters per query and 500 values per filter. Large lists are sent to the database in chunks of 90, and one query may bind at most 60 filter parameters in total (each `contains` or `prefix` value uses one; `is` values and regex matches are packed 90 to a parameter). Beyond that the error is `too_many_values` ("combine values with prefix or regex").
- A range is at most 1,000 days.
- Filters compile to parameterized SQL. Column names come from a fixed list, never from input.

## Safe regex limits

A regex is never run inside the database. On detailed data the plugin fetches the distinct values of the field in the range (at most 5,000), tests them in JavaScript and turns the matches into a list. If the range has more than 5,000 distinct values, or the pattern matches more than 2,000, the error is `narrow_filter`. On summary data the pattern is tested in JavaScript against each stored key, with no such limit and no `narrow_filter`. A pattern the validator rejects is `invalid_regex`.

The validator runs when you save a segment, goal, funnel step, channel rule or user agent rule, and again on every query. The filter bar shows its message while you type. It accepts a safe subset, so a pattern cannot take long on the inputs it meets:

- at most 200 characters, at most 20 groups, only the flag `i` (case-insensitive, always on);
- no backreferences, no lookahead or lookbehind, no Unicode property escapes (`\p{...}`);
- repeats `{m,n}` with at most 50;
- a quantified group may not contain another quantifier or an alternation, and may not take an unbounded `{m,}`;
- open-ended repeats (`*`, `+`, `{m,}`): one per pattern, or two when the pattern starts with `^`;
- optional and ranged repeats (`?`, `{m,n}`) may allow at most 1,000 combinations together.

Non-capturing `(?:...)` and named groups are allowed. A pattern that fails any rule is refused with a message that names the rule.

## Segments

A segment is a named list of filters (1 to 20 filters, name up to 64 characters), saved per site. Save the current filter bar as a segment with "Save as segment", or build one under Definitions, Segments. A selected segment applies in addition to the filters in the bar. Segments can be compared side by side ([behavior.md](behavior.md)), used as the default of a dashboard ([dashboards.md](dashboards.md)) and passed to the agent API by id ([AGENTS.md](AGENTS.md)). An unknown id is the error `unknown_segment`.

## URL state

Every admin view is a link. The state is in the query string:

| Parameter | Content |
|---|---|
| `from`, `to` | range, `YYYY-MM-DD` in the site's time zone |
| `f` | the filter list as JSON, base64url encoded |
| `cmp` | `previous`, `year`, or `seg` (with `cseg`, the id of the second segment) |
| `seg` | the id of the selected segment |
| `site` | site id |
| `cur` | currency of the revenue views |

Example: `?from=2026-10-01&to=2026-10-31&f=W3siZGltIjoiY2hhbm5lbCIsIm9wIjoiaXMiLCJ2YWx1ZXMiOlsiT3JnYW5pYyBTZWFyY2giXX0seyJkaW0iOiJwYWdlIiwib3AiOiJwcmVmaXgiLCJ2YWx1ZXMiOlsiL2Jsb2cvIl19XQ` holds the filters "channel is Organic Search" and "page starts with /blog/". An address with an invalid range, filter or id falls back to the default range and drops what it cannot read.

## Filters on summary data

Detailed data (one row per visit) is kept for `rawRetentionDays` (default 760). Older days, and very long ranges, are answered from daily summaries, which keep counts per day and key, not visits. A filter then applies only where the summaries hold the matching rows.

### When summaries answer

- A range that starts before the detailed window: summaries, or the error `raw_only` for a report without them; the message names the first detailed day.
- A range inside the window whose stored days hold more visits than the scan budget of the capacity profile (`small` 50,000 visits, `standard` and `dedicated` 500,000): summaries when they apply every filter. Otherwise the detailed report runs up to 4 times the budget; above that the error is `narrow_range`, and its message names the longest range ending on the same day that fits.
- Today and yesterday (until it closes) are not stored yet. A summary answer computes them on read from the visits, at most the newest 4 such days, so it is current. A day D is stored once, 15 minutes after the local midnight that starts day D + 2.

### What applies

| Filters | Applied in |
|---|---|
| The report's own dimension (for example `browser` on `browsers`) | that report |
| One of `entry`, `exit`, `source`, `utm_campaign`, `browser`, `os`, `lang` | `overview`, `timeseries`, the revenue totals and series |
| One of `channel`, `country`, `device` together with `page`, `entry`, `source`, `utm_campaign`, `event`, `goal` or `link` | breakdowns by that dimension, and `overview`, `timeseries`, the revenue totals and series for `entry`, `source` or `utm_campaign` |
| One, two or three of `channel`, `country`, `device` | `overview`, `timeseries`, `channels`, `countries`, `devices`, and the revenue totals, series and breakdowns by channel, country or device |

Everything else is not applied: dimensions the summaries do not keep (`ref_host`, `utm_source`, `utm_medium`, `utm_term`, `utm_content`, `host`, `region`, `event_prop`, `currency`, `revenue`) answer `filter_unavailable:<dim>:not_kept`, and kept dimensions in a combination the summaries do not store (for example `page` on `overview`, or `source` on `pages`) answer `filter_unavailable:<dim>:combination`. `links` by place and the journey reports apply no filter (`not_kept`). The figures are then computed without that filter. The admin strikes the chip through and names the reason, for example "Region is not kept in summary data." Revenue columns (`withRevenue`) are left out with `revenue_not_available` when a filter cannot apply to them.

### Caps and `(other)`

Each day keeps the top 500 pages, entry and exit pages and the top 200 keys of every other dimension; the rest is folded into one `(other)` row. Pairs of a dimension with channel, country or device share a daily budget (`small` 340 rows, `standard` 7,500, `dedicated` 15,000), and the channel by country by device table keeps `small` 150, `standard` and `dedicated` 1,000 cells a day, folding the smallest countries. Folding keeps totals exact, but for a filter it means:

- a positive filter (`is`, `contains`, `prefix`, `regex`) misses a value on the days it was folded, so small values are undercounted;
- a negative filter (`is_not` and so on) matches `(other)`, so it also keeps folded rows that may hold the excluded value.

Visitors are summed over days and over rows: a visitor seen on two channels in one day counts once per channel when channel is not filtered.

### The day rule

A page view or an event counts on the day its visit started, also after midnight. Orders, server events and error pages count on their own day. Hour charts of traffic use the hour the visit started, hour charts of orders the order's own time; over summaries an hourly chart shows days (`granularity_day`).

### Notices and their meaning

| Code | Admin text | Admin action |
|---|---|---|
| `summary` | Badge "Summary data": "This range is answered from daily summaries: it starts before the detailed data window, or it is too long to read in detail. Some filters do not apply to summaries." | |
| `compare_summary` | "The comparison range is answered from daily summaries." | |
| `detail_from:<day>` | "Detailed data starts on <day>. A range from that day applies every filter." | "Show <day> to <to> with all filters" |
| `filter_unavailable:<dim>:not_kept` | "<Dimension> is not kept in summary data." (on the chip, struck through) | |
| `filter_unavailable:<dim>:combination` | "<Dimension> cannot be combined with <other filters> in summary data." (on the chip, struck through) | |
| `top_paths_per_day` | "Daily summaries keep the top paths per day, so rare steps and paths are not counted here." | |
| `granularity_day` | "Hourly detail is not kept for this range; the chart shows days." | |
| `revenue_not_available` | "Revenue is left out: the daily summaries cannot apply these filters to orders." | |
| `exit_rate_partial` | "Exit rate is blank for pages whose exits or page views were folded into other pages on some days of this range." Over summaries, a page's exit rate sums its exits and page views over the same days; on a day where one of the two daily top lists folded the page into `(other)` and the other kept it, the page's share is unknown and its exit rate is null. | |
| `exit_rate_segment` | "Exit rate is blank here: the daily summaries keep exits without a channel, country or device, so they cannot apply that filter to it." Pages from the summaries under a channel, country or device filter answer a null exit rate. | |
| error `raw_only` | The report needs detailed data; the message ends "Detailed data starts on <day>." | "Show <day> to <to> with all filters" |
| error `narrow_range` | "This range holds about <n> visits, more than one detailed report may read with these filters. Choose <from> to <to>, or filters the daily summaries can answer." | "Show <from> to <to>" |

Which behavior reports answer from summaries: [behavior.md](behavior.md#summary-data). Revenue: [revenue.md](revenue.md).

## Related

[sessions.md](sessions.md), [behavior.md](behavior.md), [dashboards.md](dashboards.md), [revenue.md](revenue.md), [AGENTS.md](AGENTS.md).
