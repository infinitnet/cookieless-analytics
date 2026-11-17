# Sessions and visitors

Wiki: [How Visits Are Counted](https://github.com/infinitnet/cookieless-analytics/wiki/How-Visits-Are-Counted).

A session is a run of page views by one visitor with gaps shorter than the session window. The plugin builds sessions without cookies. This page explains how, and where the method can be wrong.

## Salt and visitor key

- **Salt.** One random salt per day (32 random bytes), created the first time it is needed and stored in the plugin's key-value state. The salt day follows `saltTimezone` and `saltRotationHour` (default UTC, hour 0). The `salts` cron task deletes salts older than two days, so a deleted salt cannot be recomputed.
- **Visitor key (`vkey`).** `base64url(HMAC-SHA256(salt of the day, site | truncated IP | browser family and major, OS family, device class))`, cut to 22 characters. The IP is cut to `/24` (IPv4) or `/48` (IPv6); with `ipTruncation` set to `strict`, to `/16` or `/32`.
- **Visitors are counted per day.** The key changes every day, so the same person on two days is two visitors. A figure over several days is the sum of daily visitors and is labelled so. Cross-day returning-visitor figures do not exist, by design.

Details on what is stored: [privacy.md](privacy.md).

## How a page view finds its session (resolution)

The browser makes a random session id (`sid`, 20 characters `[a-z0-9]`) every time a document loads and keeps it in a script variable. Route changes without a document load (Astro's ClientRouter, `window.__ec.page()`) keep that id; a full page load makes a new one, and nothing in the URL or on the device ties it to the earlier one. The script sends the id with every event. The server then decides, in this order:

1. If the event carries a `sid` and a stored session with that id is still active, the event joins it.
2. Otherwise, if an unexpired alias maps that `sid` to another session that is active, it joins that one.
3. Otherwise the server looks for an active session of the same visitor key (the fallback). This is how a full page load joins the running visit. Around the salt rotation it also tries yesterday's key for as long as one session window after the boundary, so a visit that spans midnight (or your rotation hour) is not cut in two. If it finds one, the event joins it, and when the event's `sid` differs, an alias from that `sid` to the session is stored for one day (the longest visit). When the session an alias points to has ended, the next event of that `sid` starts a new session and the alias moves to it.
4. Otherwise a new session starts. It uses the event's `sid`, or a fresh one when that id belongs to a closed session.

A session is active while the time since its last event is within its own window and the time since its start is within `maxSessionMinutes`. An event (not a page view) that carries the `sid` of a stored visit joins that visit even after the window, as long as the visit is within `maxSessionMinutes` and its event cap: a click after a long read belongs to the page the visit was showing. Such a late event does not move the visit's last activity, so the idle time does not become visit duration.

| Setting | Default | Range | Meaning |
|---|---|---|---|
| `sessionWindowMinutes` | 30 | 1 to 240 | Inactivity gap that ends a session. A new value applies to new sessions only; existing sessions keep the window they started with. |
| `maxSessionMinutes` | 1440 | 10 to 1440 | A session older than this is closed and a new one starts. At most one day: a visit is looked up among visits started today or yesterday. |
| `maxPageviewsPerSession` | 500 | 10 to 10000 | Further page views of that session are dropped (`session_cap`). |
| `maxEventsPerSession` | 200 | 10 to 10000 | Further events of that session are dropped (`session_cap`); an order is never dropped by this cap. Together with the page view cap it bounds the size of a visit row. |
| `reloadDedupeSeconds` | 2 | 0 to 60 | A reload of the same path within this time is not counted again. |

Rules that follow from this:

- A session never changes its first-touch fields (entry page, referrer, campaign tags, channel, device) after it starts. An external referrer in the middle of a session does not split it.
- A new session sets first touch from the first page: the referrer host only when it is not your own host, not a host of a linked site ([client-sites.md](client-sites.md)) and not in `ignoreReferrerHosts`, the UTM fields, the channel, the entry path, device, browser, OS, language, screen size class, country and region, and the day and hour in `siteTimezone`.
- A page view or event counts on the day its visit started, also when it arrives after midnight. Orders, server events and error pages count on their own day.
- A page view or event that arrives twice (a client retry, a queue redelivery) is stored once; the second copy writes nothing.
- An engagement update that arrives before its page view is kept and joined by the page view when it comes, while the visit is younger than 30 seconds (`YOUNG_VISIT_S`). In an older visit an update for a page view the visit does not hold (one dropped as an excluded path or a reload, or one still being sent again) changes nothing and is counted as `orphan_update`, so its time is never added to the visit without its page view.
- Server callers without a `sid` (other plugins, see [integration.md](integration.md)) use the visitor key only.

## Page loads

The page script is passive on links and the address: it never adds a fragment or a parameter to a link, never reads or changes the URL and makes no history call. A session therefore continues in two ways only:

- **Soft navigations** keep the in-memory `sid`.
- **Full page loads** (a normal link, a reload, a new tab, another host of a linked site) arrive with a new `sid` and are joined to the running visit through the visitor key, as described under resolution. The new `sid` is stored as an alias of the visit for one day (`MAX_VISIT_MINUTES`, the longest visit), so the engagement update of a later page sent after a long read still reaches the visit.

A fragment in the address, of any kind, is left as it is and is never read as an id.

**What the server does with the id.** It treats the id as an opaque continuity token and nothing else. It checks the format, looks up only sessions of the same site whose window has not expired, and never derives permissions, identity or visitor counts from it (visitor counts use the visitor key). Events per session per minute and page views per session are capped.

**Stated limit.** A visitor whose visitor key changes in the middle of a visit (a new IP address, another network, another browser) starts a new session on the next full page load. Its channel is Direct, because the referrer is your own host and an own host is never a source.

## Visits across linked hosts

A shop or checkout on another host can be linked to this site (Definitions, Sites; [client-sites.md](client-sites.md)). Its events are stored as this site's events, so the visitor key, which is built from the site id, the shortened IP address, the browser and the daily salt, is the same on both hosts. A page on the other host starts with a fresh session id and joins the running visit through that key, as a reload does.

- Every page load there joins the visit by the visitor key alone, as every full page load does. No link is changed on any host.
- The hosts of this site and of its linked sites count as one site: moving between them is never a referral, never changes the channel, the source or the entry page, and a new visit that starts after such a move counts as Direct.
- Each page view and event keeps the host it came from (`hs` on the entry; the visit's `host` column is the host of its first page). The `host` filter matches the host of the first page only: a visit that started on the main host and went on to the shop is filtered as a visit of the main host.
- Orders and events from the shop, sent by the page or by its server with the page's session id (`window.__ec.sid`), attach to the same visit and its entry channel.

Limits, stated plainly:

- A change of network or browser in the middle of a visit (Wi-Fi to mobile data, another browser) changes the visitor key: the next page on the other host starts a new visit.
- A payment finished in another app or on another network (a banking app on mobile data) returns with another address and starts a new visit. Add the payment hosts to `ignoreReferrerHosts` so that visit is not counted as a referral from the payment page.
- The salt changes once a day at `saltRotationHour`. For one session window after the change a move to the other host still finds the visit; a later move starts a new visit, and the person counts as a new visitor.
- A move to the same path on the other host within `reloadDedupeSeconds` counts as a reload, not as a page view.
- Two people behind one shared address with the same browser can be joined, as described under the merge policy below.

## The history rule

The page script must not touch the browser's back button, and it makes no history call at all. It never calls `history.pushState`, `history.replaceState`, `history.back`, `history.forward` or `history.go`, never wraps a history method, never adds a history entry and has no `popstate` handler. It never writes the address. Route changes of single page apps are found through Astro's `astro:page-load` event and the explicit `window.__ec.page()` call.

A test scans the script source and the generated script and fails on any reference to the history or to a plugin fragment, and a browser-level test pins that no history method is called and that the address keeps any fragment it arrived with.

## Merge policy and its error classes

The method has one known way to put two people into one session. It is rare, accepted and stated here.

- **Shared network address (NAT merge).** Two people behind the same shortened IP, with the same browser family and major, operating system and device class, get the same visitor key. When one of them loads a page and the other has an active session, they are joined, because every full page load joins by the visitor key. The effect is fewer sessions and visitors than there were, and longer sessions. Offices, schools and mobile carrier networks are the usual case. `ipTruncation: strict` makes it more likely, not less.

This error opens no report: the id is only a continuity token, and the session read route returns first-touch facts, never identifiers ([integration.md](integration.md)).

## Session metrics

- **Sessions**: session rows with at least one page view.
- **Active time**: time with interaction. The script counts a page view's time only while the page is visible and the visitor interacted (pointer down, key press, scroll or touch) within the last 60 seconds. It is stored per page view (`d`) and per session (`engaged_ms`), capped per page by `maxEngagedMsPerPage`. The Pages report shows it as **Avg. active time** per page view, Search Satisfaction as **Avg. active time** per session.
- **Visible time**: time the page was visible in the browser, interaction or not. It is stored per page view (`e`) and per session (`visible_ms`). The Pages report shows it as **Avg. visible time** per page view, from detailed data only (the daily summaries do not keep it, so a summary range leaves the column blank).
- **Duration** (session duration, **Avg. duration**): the longer of the visit span (from the start of the visit to its last recorded update) and the visible time. For a one page session that is usually the visible time. It is not interaction time.
- **Engaged session**: active time of at least `engagedThresholdSeconds` (default 10), or more than one page view, or at least one event (the GA4 meaning).
- **Bounce**: a session that is not engaged, so bounce rate is 1 minus engaged rate (the GA4 meaning). A one page visit read for five minutes is engaged, not a bounce.
- **Views per session**: page views divided by sessions.
- **Visitors**: distinct visitor keys per day, summed over the range.

Active time can be 0 s while duration is several seconds. A page that is open and visible but never touched collects visible time and no active time. Link scanners, link previews and visitors who glance at a page and leave look exactly like that, so a report can show an Avg. duration of 6 s next to an Avg. active time of 0 s for the same visits. Neither number is wrong: duration says how long the page was in view, active time how long someone worked with it.

### How other tools measure it

Cookieless Analytics by Infinitnet reports active time and duration as two separate figures and never calls active time the time a page was open. Other tools use one figure, and most of them mean time in view:

- **Plausible**: its page time and its visit duration count engagement time while the tab is visible and in focus (plausible.io/docs/metrics-definitions, plausible.io/blog/time-on-page-ga-vs-plausible).
- **Google Analytics 4**: average engagement time is the time the page is in focus in the foreground (support.google.com/analytics/answer/11109416).
- **Matomo**: its average page time is the gap to the next page view, so the last page of a visit is left out unless a heartbeat timer is set (matomo.org/faq/how-to/faq_21824/).
- **Fathom**: measures time on site and per page with departure pings; it used to take the gap between page views (usefathom.com/changelog/mar2026-analytics-rebuild).

So the common meaning of a page time is time in view. Our closest figures to it are Avg. visible time per page and Avg. duration per session. Active time is stricter: it is the time with interaction, which is why it carries its own name.

## Search Satisfaction metrics

Search Satisfaction approximates how a click-based system such as Google's Navboost could rate a landing page, using only the visits to your own site. It is not Navboost and does not reproduce Google's definitions or weights. The idea and the primary sources from the United States v. Google trial record are in the wiki: [Search Satisfaction](https://github.com/infinitnet/cookieless-analytics/wiki/Search-Satisfaction#where-the-idea-comes-from).

The Search Satisfaction page turns click quality into seven numbers: long clicks, short clicks, the bad experience share, estimated pogo-sticking, the stronger "Returned from search" signal, the search re-entry rate and the share of back or forward loads per page. Everything is computed when a report runs, from session rows and their page views in the raw window, with the two thresholds read from the settings at that moment. A changed threshold therefore reclassifies every stored session at once, old and new, with no job to run.

### Thresholds

| Setting | Default | Range | Meaning |
|---|---|---|---|
| `longClickSeconds` | 60 | 10 to 600 | A duration above this is a long click; at or below it is a short click. |
| `badExperienceSeconds` | 10 | 1 to 60 | A single page session without interaction and with a duration below this is a bad experience. |

The effective bad experience threshold is `min(badExperienceSeconds, longClickSeconds)`, so a bad experience is always also a short click.

### Definitions

For each human session with at least one page view, with `L = longClickSeconds * 1000` and `B = min(badExperienceSeconds, longClickSeconds) * 1000`:

- `duration_ms = max((last_seen - started) * 1000, visible_ms)`.
- `measured = visible_ms > 0`: at least one engagement update arrived. Sessions whose end was never observed (an app killed on mobile, a lost beacon, a blocked script) are counted as unmeasured and left out of every rate denominator below.
- `long_click = measured AND duration_ms > L`; `short_click = measured AND duration_ms <= L`.
- `bad_experience = measured AND pageviews = 1 AND events = 0 AND interacted = 0 AND duration_ms < B`.
- `search_entry`: the stored channel is `Organic Search` or `Paid Search`.
- `pogo_stick (estimate) = search_entry AND pageviews = 1 AND events = 0 AND short_click AND landing_exit = 2`, where `landing_exit` is the exit kind of the session's only page view (2 means the page was left with `pagehide` and kept by the browser for back and forward). Pogo-sticking is the industry name for this pattern: a visitor from a search engine lands on a page, leaves it quickly with the browser's back action and returns to the results.
- `reentered = reentries > 0`: a later arrival with a search referrer and a fresh client id that merged into this session.
- `returned_from_search (estimate) = search_entry AND reentered AND first_exit = 2`, where `first_exit` is the exit kind of the session's first page view by time. In words: the landing page was left with the back or forward action and the visitor then came back from a search engine within the same session window. It is a stronger pogo signal than `pogo_stick` because the second arrival from the results page is observed, not inferred; it does not require a short click or a single page view, so the two numbers overlap but neither contains the other. The `pogo_stick` rule is unchanged by it.

Per path, over page views of that path: `back_nav_rate = COUNT(nav = 2) / COUNT(nav IS NOT NULL)`. Page changes inside the site's own page code have no navigation type and are in neither count.

Rates, per landing page and for the totals row: `pct_long = long / measured`, `pct_short = short / measured`, `pct_bad = bad / measured`, `pogo_stick_rate = pogo_stick / measured search-entry sessions`, `returned_from_search_rate = returned_from_search / search-entry sessions`, `search_reentry_rate = reentered / search-entry sessions`, `measured_rate = measured / sessions`, `avg_duration = SUM(duration_ms) / sessions / 1000`, `avg_engaged = SUM(engaged_ms) / sessions / 1000`, `score` (below), plus the raw counts `sessions`, `measured`, `search_sessions`, `search_measured`, `long_clicks`, `short_clicks`, `bad_experiences`, `pogo_sticks`, `reentered` and `returned_from_search`. Compare periods carry the same fields, and deltas are computed on rates.

### Best and worst pages

`score = pct_long - pct_bad - pogo_stick_rate`, shown in points (0.25 is 25); a page without measured search sessions counts its pogo-sticking rate as 0. Long clicks are the clearest sign a landing page answered the visit, a bad experience is the clearest sign it did not, and pogo-sticking is the search-specific version of the same failure, so the score adds the one good share and subtracts the two bad ones with equal weight. Equal weights keep it explainable without a calibration nobody can check, and the lists always show the three parts next to the score, so a reader can see why a page ranks where it does. Short clicks are left out because they include every bad experience and many quick, successful answers. Only landing pages with at least 30 measured sessions in the range are ranked (`SATISFACTION_MIN_MEASURED`, a constant, not a setting), so three lucky visits cannot top the list. The `satisfaction` report takes `params.rank: "best" | "worst"` for these lists; ties go to the busier page.

### What the estimates can and cannot claim

"Pogo-sticking, returned from search, search re-entry and back/forward loads are estimates from browser navigation signals."

- The referrer is the search engine's origin only; the default referrer policy `strict-origin-when-cross-origin` strips path and query on cross-origin navigations, so the query is never known and a "second search" cannot be told from "the same search again". Some surfaces (apps, Discover-like feeds, privacy browsers) send no referrer at all, so those sessions are `Direct` and outside every search-based rate.
- `pagehide` with `persisted === true` means the browser intends to keep the page for a back or forward restore; it fires on back navigation and on forward navigation to another document alike, so the signal means "left the document without closing it and without clicking one of our links", not "pressed back". A tab close or a browser that does not cache the page gives `persisted === false` and is not counted. Browsers differ in cache eligibility, so compare within one browser (the Chrome preset exists for that).
- `visibilitychange` to hidden (tab switch, app switch, lock screen) is not an exit and is stored as exit kind 0; on mobile a page that is left through the app switcher and later killed never fires `pagehide`, so such sessions end as hidden, not as returns.
- A back or forward restore from the back/forward cache re-shows the page without reloading it, so it produces no pageview; the back/forward load share counts full loads only and is a lower bound. Chrome reports that about one navigation in ten on desktop and one in five on mobile is a back or forward navigation, most of them served from that cache.
- Search re-entry counts any second arrival from a search engine within the session window for the same daily visitor key, including a user who opened two of the site's results in tabs at once and two people behind the same NAT (the documented merge error class, see above).
- Active time only accrues within 60 s of an interaction, so a long passive read (video, slideshow) can be a long click by visible time while showing low engagement; this is intended and documented.

### The raw window limit

Search Satisfaction needs session rows, which are kept for `rawRetentionDays` (default 760, up to 760, shorter when the storage budget requires it). For a range that starts before that window, the report answers the typed error `raw_only` with this text:

"Search Satisfaction is computed from session rows, which are kept for the raw retention window only. Choose a more recent range or raise the raw retention."

There is no rollup of these numbers. A table of daily summaries would either fix the thresholds in advance or need many counters per row, and old summaries could never follow a threshold change.

### Where to see it

Search Satisfaction has its own sidebar entry, right after Pages. The page reads the header's range, comparison, segment and filters and shows:

- Seven cards with the comparison to the previous period: long clicks, short clicks, bad experience, pogo-sticking (estimate), returned from search (estimate), average active time and the measured share. The estimates and the measured share carry an info marker with their definition. A line under the cards says how many sessions have no measured end, once.
- A trend chart of the rates with a switch between them (a card click picks the rate too) and annotation markers.
- "Best pages" and "Worst pages": the five landing pages with the highest and lowest score, each with sessions, long click, bad experience and pogo-sticking rates and the score change in points against the previous period.
- Breakdown tabs: landing pages (searchable, sortable and paged), channels, sources, devices, countries and browsers, each with every rate and the score (`params.by` of the `satisfaction` report).
- A drawer per landing page (a ranked row, or Details in the table) with its trend, pogo-sticking by search engine (organic sessions grouped by source, so Google and Bing sit side by side) and the same breakdowns.
- Three presets that add filters: "Google organic" (channel `Organic Search`, source starts with `google.`), "Bing organic" (source starts with `bing.`) and "Chrome" (browser `Chrome`).
- For a range before the raw window, the notice above with one button that moves the range inside the window.

The Search Satisfaction dashboard template carries the same numbers as tiles, including the best and worst pages tables and the pogo-sticking trend. Agents read them through the `satisfaction` and `satisfaction_series` reports ([AGENTS.md](AGENTS.md)).

## Related

[privacy.md](privacy.md), [integration.md](integration.md), [filters.md](filters.md), [settings.md](settings.md), [dashboards.md](dashboards.md).
