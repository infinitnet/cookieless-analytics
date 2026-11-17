# How Visits Are Counted

The plugin counts visitors and sessions without cookies and without storing anything on the device. This page explains how a page view becomes part of a session, how visitors are counted, and where the method can be wrong.

## How to use it

1. Open Settings, section Sessions and engagement.
2. Adjust the session window, the engaged threshold or the realtime window if the defaults do not fit your site.
3. Save. New sessions use the new values from then on; earlier sessions are not recounted.
4. For the privacy related keys (`saltTimezone`, `saltRotationHour`, `ipTruncation`) open Settings, section Privacy and exclusions.

## How it works

### The visitor key

- Each day the plugin creates one random salt (32 random bytes). The salt day follows `saltTimezone` and `saltRotationHour` (default UTC, hour 0). Salts older than two days are deleted, so an old key can never be recomputed.
- The visitor key is a keyed hash of the salt of the day, the site, the shortened IP address, the browser family and major version, the operating system family and the device class.
- The IP address is shortened to `/24` (IPv4) or `/48` (IPv6) before hashing. With `ipTruncation` set to `strict` it is shortened to `/16` or `/32`. The address itself is never stored.
- Because the salt changes every day, visitors are counted per day. The same person on two days is two visitors. A visitor figure over several days is the sum of the daily visitors and is labelled so. There are no cross-day returning visitor figures, by design.

### The session id

The page script makes a random session id every time a document loads and keeps it in a script variable only. Route changes without a document load (Astro's ClientRouter, or a call to `window.__ec.page()`) keep that id. A full page load makes a new one.

The server decides which session an event belongs to, in this order:

1. The event's session id matches an active stored session: the event joins it.
2. An alias maps that id to another active session: the event joins that one.
3. An active session with the same visitor key exists: the event joins it. This is how a full page load continues the running visit. For one session window after the daily salt change, yesterday's key is tried too, so a visit across midnight is not cut in two.
4. Otherwise a new session starts.

The script never adds anything to links or to the address, never reads the URL for an id and makes no history call. The Back button is never touched.

### Session window and limits

A session stays active while the time since its last event is within the session window, and the time since its start is within `maxSessionMinutes`. An event (not a page view) that carries the session id of a stored visit joins that visit even after the window, as long as the visit is within `maxSessionMinutes` and its event cap: a click after a long read belongs to the page the visit was showing. Such a late event does not move the visit's last activity, so the idle time does not become visit duration. A new `sessionWindowMinutes` value applies to new sessions only; running sessions keep the window they started with.

A session never changes its first touch fields (entry page, referrer, campaign tags, channel, device) after it starts. An external referrer in the middle of a session does not split it.

### Session metrics

| Metric | Meaning |
|---|---|
| Sessions | sessions with at least one page view |
| Active time | time with interaction: the page is visible and the visitor interacted within the last 60 seconds; shown as Avg. active time per page view (Pages) and per session (Search Satisfaction) |
| Visible time | time the page was visible, interaction or not; shown as Avg. visible time per page view (Pages, detailed data only) |
| Duration | the longer of the visit span and the visible time; shown as Avg. duration; not interaction time |
| Engaged session | active time of at least `engagedThresholdSeconds`, or more than one page view, or at least one event |
| Bounce | a session that is not engaged; bounce rate is 1 minus engaged rate |
| Views per session | page views divided by sessions |
| Visitors | distinct visitor keys per day, summed over the range |

Active time accrues only while the visitor interacts with the page (pointer down, key press, scroll or touch, then up to 60 seconds). It is capped per page by `maxEngagedMsPerPage`. A page that is open but untouched shows 0 s of active time while its duration is several seconds: link scanners, link previews and quick glances look like that.

### How other tools measure it

Cookieless Analytics by Infinitnet reports active time and duration as two figures and never calls active time the time a page was open. Other tools use one figure, and most of them mean time in view:

- **Plausible**: its page time and its visit duration count engagement time while the tab is visible and in focus ([metrics definitions](https://plausible.io/docs/metrics-definitions), [GA compared with Plausible](https://plausible.io/blog/time-on-page-ga-vs-plausible)).
- **Google Analytics 4**: average engagement time is the time the page is in focus in the foreground ([GA4 help](https://support.google.com/analytics/answer/11109416)).
- **Matomo**: its average page time is the gap to the next page view, so the last page of a visit is left out unless a heartbeat timer is set ([Matomo FAQ](https://matomo.org/faq/how-to/faq_21824/)).
- **Fathom**: measures time on site and per page with departure pings; it used to take the gap between page views ([Fathom changelog](https://usefathom.com/changelog/mar2026-analytics-rebuild)).

The common meaning of a page time is time in view. Our closest figures are Avg. visible time per page and Avg. duration per session; active time is stricter and keeps its own name.

### Channels

The channel is set once, from the first page of the session, using the referrer host, the UTM tags and click ids on the landing URL. The built-in channels are:

Organic Search, Paid Search, Organic Social, Paid Social, Organic Video, Paid Video, Organic Shopping, Paid Shopping, AI Assistants, Email, SMS, Mobile Push, Affiliates, Display, Audio, Cross-network, Paid Other, Referral, Direct and Unknown.

- Click ids `gclid`, `msclkid`, `gbraid`, `wbraid` and `yclid` mean Paid Search; `ttclid` and `twclid` mean Paid Social; `fbclid` alone means Organic Social.
- The stored source is the referrer host, else `utm_source`, else "(not set)" when other UTM tags exist, else "(direct)".
- Your own host, the hosts of linked sites and the hosts in `ignoreReferrerHosts` never count as a referrer.
- You can turn built-in rules off and add your own under Definitions, Channel rules. See [Definitions](Definitions).

### Active now

The "active now" badge in the page head counts sessions seen within the last `realtimeWindowMinutes` minutes. It follows the filters in the header.

### Day rule

A page view or event counts on the day its visit started, also when it arrives after midnight. Orders, server events and error pages count on their own day. Days and hours follow `siteTimezone`.

## Settings

| Key | Default | What it does |
|---|---|---|
| `sessionWindowMinutes` | 30 | Inactivity gap (1 to 240 minutes) that ends a session. Applies to new sessions. |
| `maxSessionMinutes` | 1440 | A session older than this (10 to 1440 minutes) is closed and a new one starts. |
| `engagedThresholdSeconds` | 10 | Active time (1 to 300 seconds) that makes a session engaged. |
| `realtimeWindowMinutes` | 5 | Sessions seen within this time (1 to 60 minutes) count as active now. |
| `reloadDedupeSeconds` | 2 | A reload of the same path within this time (0 to 60 seconds) is not counted again. |
| `maxEngagedMsPerPage` | 1800000 | Cap for the active time of one page (60000 to 7200000 ms). |
| `maxPageviewsPerSession` | 500 | Further page views of a session are dropped. |
| `maxEventsPerSession` | 200 | Further events of a session are dropped. |
| `saltTimezone` | UTC | Time zone of the daily salt rotation. |
| `saltRotationHour` | 0 | Local hour (0 to 23) at which the salt rotates. |
| `ipTruncation` | standard | `standard` keeps `/24` and `/48`, `strict` keeps `/16` and `/32` for the visitor key. |
| `ignoreReferrerHosts` | empty | Payment or login hosts that never start a source. |
| `siteTimezone` | UTC | Time zone for days and hours in reports. |

## Limits

- Session window: 1 to 240 minutes. Maximum session length: one day (1440 minutes).
- Page views per session: 500 by default (10 to 10000). Events per session: 200 by default (10 to 10000).
- Events per session id per minute: `maxEventsPerSidPerMinute` (default 60). Events per visitor key per minute: `maxEventsPerVkeyPerMinute` (default 300).
- Salts are kept for two days, then deleted.

## Gotchas

- **Shared network address.** Two people behind the same shortened IP address with the same browser, operating system and device class get the same visitor key and can be joined into one session. Offices, schools and mobile networks are the usual case. `strict` truncation makes this more likely, not less.
- **Network change mid visit.** A visitor whose IP address or browser changes (Wi-Fi to mobile data) starts a new session on the next full page load, and that session counts as Direct.
- **Visitors over several days are summed.** One person visiting on Monday and Tuesday counts as two visitors in a weekly figure.
- **Changing the session window** does not recount past sessions. Session counts depend on this setting, so compare periods with the same value.
- **Payment pages.** A payment finished in another app or network returns with another address and starts a new visit. Add payment hosts to `ignoreReferrerHosts` so the return is not counted as a referral.
- **Linked hosts** (a shop on another host) share the visit through the visitor key. See [Multi-Site and Sites View](Multi-Site-and-Sites-View).

Full reference: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/sessions.md

## Related

- [Reports](Reports)
- [Search Satisfaction](Search-Satisfaction)
- [Privacy Model](Privacy-Model)
- [Bot Handling](Bot-Handling)
- [Settings Reference](Settings-Reference)
- [Multi-Site and Sites View](Multi-Site-and-Sites-View)
