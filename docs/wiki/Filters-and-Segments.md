# Filters and Segments

Filters narrow every number on a page to a set of sessions, for example "visits from Organic Search that viewed a page under /blog/". A segment is a saved list of filters with a name. The same filters work in every report, every dashboard tile and the agent API.

## How to use it

1. Click a value in any table (a channel, a page, a country). It is added to the filter bar as "is" that value.
2. Or open the filter bar, choose a dimension, an operator (is, contains, starts with, matches regex) and one or more values.
3. Use the Include and Exclude button to turn a filter into its negative ("is not", "does not contain" and so on).
4. To keep the set, choose **Save as segment** and give it a name. It then shows in the segment picker of the header.
5. To build or edit segments without the report pages, open Definitions, Segments.
6. Remove a filter with the cross on its chip.

With no segment saved yet, the header shows **Create a segment** in place of the picker; it opens the form in Definitions.

Several values in one filter mean "any of these". Several filters mean "all of these". A selected segment applies in addition to the filters in the bar.

## Dimensions

**Session dimensions** compare a field set when the session started:

| Dimension | What it compares |
|---|---|
| Entry page, Exit page | first and last page path |
| Channel, Source, Referrer | acquisition channel, traffic source, referrer host |
| UTM source, medium, campaign, term, content | campaign tags |
| Host | host of the entry page (sites with several hosts) |
| Country, Region | country code; region needs `captureRegion` |
| Device, Browser, OS, Language | device class, browser family, operating system, primary language |

**Hit dimensions** compare something a session did. A session passes when at least one of its hits matches:

| Dimension | What it compares |
|---|---|
| Page | path of a page view |
| Event | event name |
| Event property | the value of one property of an event (needs the property key) |
| Goal | the session completed the goal |

**Revenue dimensions**: Currency (an order in that currency) and Revenue at least (the session's summed order value in one currency). See [Revenue and Refunds](Revenue-and-Refunds).

Search reports use their own dimensions: page, query, country, device and source. Traffic filters do not apply there, and the report says so.

## Operators

| Operator | Meaning | Case |
|---|---|---|
| is, is not | equals one of the values, or none | exact |
| contains, does not contain | contains one of the values, or none | ignored |
| starts with, does not start with | starts with one of the values, or none | ignored |
| matches regex, does not match | matches one of the patterns, or none | ignored |
| greater, at least, less, at most | Revenue only | none |

- A negative filter on a hit dimension keeps sessions with no matching hit: "Page is not /pricing" keeps sessions that never viewed `/pricing`.
- A negative filter on a session field also keeps sessions where the field is empty.
- In contains and starts with, `%` and `_` are plain characters.
- Event property values are compared as text: type `3`, not a number.

## Regex filters

A regex is never run inside the database. The plugin tests the pattern in the admin and on the server and accepts a safe subset only:

- at most 200 characters and at most 20 groups; case is always ignored;
- no backreferences, no lookahead or lookbehind, no Unicode property escapes;
- repeats `{m,n}` up to 50;
- a quantified group may not contain another quantifier or an alternation;
- one open-ended repeat (`*`, `+`, `{m,}`) per pattern, or two when the pattern starts with `^`;
- optional and ranged repeats together allow at most 1,000 combinations.

The filter bar shows the reason while you type. The same rules apply when you save a segment, goal, funnel step, channel rule or user agent rule.

## Segments

- A segment has a name (up to 64 characters) and 1 to 20 filters. Segments are saved per site.
- Use a segment in the header, as a side of a segment comparison (Comparison: another segment), as the default of a dashboard, or in the agent API by its id.
- Saving a segment from the header stores the selected segment's filters plus the chips in the bar, selects the new segment and clears the chips.
- Users without the manage permission do not see the segment picker, except for a segment that came with a shared link ("Segment from the link").

## URL state

Every admin view is a link. The query string holds:

| Parameter | Content |
|---|---|
| `from`, `to` | range, `YYYY-MM-DD` in the site time zone |
| `f` | the filters as JSON, base64url encoded |
| `cmp` | `previous`, `year` or `seg` (with `cseg`, the second segment) |
| `seg` | the selected segment id |
| `site` | the site id |
| `cur` | currency of the revenue views |

A pasted address with an invalid range, filter or id falls back to the default range and drops what it cannot read.

## Filters on summary data

Detailed data (one row per visit) is kept for `rawRetentionDays` (default 760). Older days and very long ranges are answered from daily summaries, which keep counts per day and key, not visits. Then:

- The badge **Summary data** shows on the page.
- Filters the summaries cannot apply are struck through on their chip with the reason, for example "Region is not kept in summary data." or "Page cannot be combined with Channel in summary data." The figures are computed without that filter.
- When the range starts before the detailed data, a notice names the first detailed day and offers "Show <day> to <to> with all filters".
- A detailed range that would read too many visits is refused with a suggested shorter range.
- Summaries keep the top 500 pages a day and the top 200 values of other dimensions; the rest is folded into "(other)". Small values can therefore be undercounted by a positive filter, and a negative filter also keeps "(other)".

Full reference: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/filters.md

## Settings

| Key | Default | What it does |
|---|---|---|
| `rawRetentionDays` | 760 | Days of detailed data. Every filter applies inside this window. |
| `captureRegion` | false | Stores the region, needed for Region filters. |
| `capacityProfile` | standard | Sets the scan budget that decides when a long range is answered from summaries. |

## Limits

- At most 20 filters per query and 500 values per filter, each value up to 512 characters.
- One query binds at most 60 filter parameters in total. Beyond that, combine values with starts with or regex.
- A range is at most 1,000 days.
- A regex on detailed data checks at most 5,000 distinct values in the range and may match at most 2,000. Otherwise narrow the range or the pattern.
- A segment has 1 to 20 filters and a name of up to 64 characters.

## Gotchas

- "Page is X" keeps whole sessions that viewed X, not only the page views of X. Session totals then include the other pages of those sessions.
- The Host filter matches the host of the first page of a visit only.
- Revenue and Currency filters work inside the detailed data window only.
- A goal filter with an unknown or inactive goal is refused.
- A "(not set)" value cannot be clicked as a filter, because it stands for an empty field.

## Related

- [Reports](Reports)
- [Goals and Funnels](Goals-and-Funnels)
- [Definitions](Definitions)
- [Dashboards and Sharing](Dashboards-and-Sharing)
- [Retention](Retention)
- [Agent API and MCP](Agent-API-and-MCP)
