# Privacy Model

The plugin counts visits without writing anything to the visitor's device and without storing an IP address or a full user agent. This page explains how sessions work without cookies, what is stored, what never is, and which settings change it.

## How to use it

1. Open Settings, section Privacy and exclusions, and check `signals`, `ipTruncation` and the exclusions.
2. Open Data, tab Privacy receipt. It lists every table and column for your install, with live row counts.
3. Copy the Markdown block of the receipt into your own privacy page and adjust it.

![Privacy receipt](images/data-privacy.png)

## Design rules

- **Nothing on the visitor's device.** No cookies, no localStorage, no sessionStorage, no IndexedDB, no Cache API entries, no ETag tricks. The only client state is a JavaScript variable that dies with the page.
- **No fingerprinting.** The visitor key is a hash of a shortened IP address and a normalised browser family, mixed with a random salt that changes every day. It cannot link visits across days.
- **No raw IP address and no full user agent** is stored or logged.
- **Exact counts, no sampling** for human traffic.
- **Bots are excluded.** A known bot gets an empty 204 and no row of any kind is written. See [Bot-Handling](Bot-Handling).
- **No third party calls from the browser.** The page script talks only to your own install.
- **The script never touches browser history.** It adds nothing to links or the address and makes no history call.

## The daily visitor key

```text
vkey = base64url(HMAC-SHA256(salt of the day, site | truncated IP | browser family and major, OS family, device class)), cut to 22 characters
```

- The IP is cut before hashing: IPv4 to /24 and IPv6 to /48 (`ipTruncation` `standard`), or /16 and /32 (`strict`). The address is then gone.
- The salt is 32 random bytes, created on first use each day. The `salts` task deletes salts older than two days. A deleted salt cannot be recomputed, so older keys can no longer be matched to anyone.
- The salt day follows `saltTimezone` and `saltRotationHour`.
- Because the key changes every day, visitors are counted per day. A figure over several days is the sum of daily visitors and is labelled so.

### Sessions without cookies

The browser makes a random session id each time a document loads and keeps it in a script variable. Soft navigations keep it. A full page load makes a new one, and the server joins it to the running visit through the visitor key. A visit ends after `sessionWindowMinutes` without activity. Details: [How-Visits-Are-Counted](How-Visits-Are-Counted).

Known error class: two people behind the same shortened IP with the same browser, OS and device class get the same key and can be joined into one session (offices, schools, mobile carriers). `strict` makes this more likely, not less.

## Privacy signals

| `signals` | Effect |
|---|---|
| `none` | Browser privacy signals are ignored. |
| `gpc` (default) | A browser that sends Global Privacy Control is not counted. |
| `dnt_and_gpc` | A browser that sends Global Privacy Control or `DNT: 1` is not counted. |

The check runs twice: the page script does nothing at all when the signal is on, and the server checks the `Sec-GPC` and `DNT` headers and drops the event. Dropped events are counted as `privacy_signal`, without any identity.

## What is stored

- **Visits** (one row per visit): a random session id, the daily visitor key, local day and hour, entry and exit page, counts, active and visible time, scroll depth, referrer host and path, channel, source, campaign fields, country, region (only with `captureRegion`), device class, browser and OS family, primary language (turn off with `captureLanguage`), a screen size class, and the host. Inside it, each page view (path with only allowlisted query parameters, timings, how it was reached and left) and each event (name, path, up to 10 properties).
- **Orders and server events**: value, currency, day and visit. Order ids only as a one-way hash.
- **Error pages**: a count per day, status, path and referring page.
- **Drop counters**: counts of requests not recorded, per site, day and reason. Nothing about the request.
- **Daily summaries**: top values per dimension, no visitor keys.
- **Search rows**: clicks, impressions and positions the providers report. No visitor data.
- **Configuration**: goals, funnels, rules, dashboards, API key hashes, shares (a hash of the link, never the link or password).

## What is never stored

- A raw IP address, a full user agent string, a cookie, or anything on the device.
- A person's identity, email address, name, user id or profile.
- Order ids themselves (only a one-way hash that decides whether an order was already counted), buyer names, emails or payment data.
- Page content, form field values, titles or the text of search boxes (except the words of a configured site search parameter, with emails and long numbers removed).
- Anything about a known bot.

## The admin and your browser

The admin itself may keep UI preferences in the editor's browser: session storage for this tab (such as the range, filters and site that carry over between admin pages) and local storage for this browser (the table columns you picked). Keys start with `ca.`. This applies only to signed-in editors using the admin. It never touches visitors, and the public page script stores nothing.

## Settings

| Key | Default | What it does |
|---|---|---|
| `signals` | `gpc` | Browser privacy signals that drop a visit. |
| `ipTruncation` | `standard` | Prefix kept for the daily visitor key (/24 and /48, or /16 and /32 with `strict`). |
| `saltTimezone` | `UTC` | Timezone of the daily salt rotation. |
| `saltRotationHour` | `0` | Local hour at which the salt rotates. |
| `captureLanguage` | `true` | Store the primary browser language tag. |
| `captureRegion` | `false` | Store the edge region in addition to the country. |
| `queryAllowlist` | `utm_*,gclid,msclkid,fbclid` | Query parameters kept on stored paths. |
| `excludeEditors` | `true` | Do not record signed-in editors and administrators. |
| `excludePaths` | `/_emdash/` | Path prefixes that are not recorded. |
| `excludeIpPrefixes` | empty | IP ranges (CIDR) that are not recorded. |

## Limits

- Salts: kept 2 days.
- Event properties: at most 10 keys, values up to 128 characters.
- Detailed data: 760 days by default; summaries 25 months; Search rows 800 days. See [Retention](Retention).

## Gotchas

- Cross-day returning visitor figures do not exist, by design.
- A visitor whose network or browser changes mid-visit starts a new session on the next full page load.
- Exclusions apply from the moment they are saved. To remove what was already counted, use Delete matching visits on the [Data-Page](Data-Page).
- With the queue tier, a queued message holds no IP address and no user agent string; it waits only until the consumer writes it.
- The design aims to need no consent banner. Whether that holds depends on your country, your other tools and how you use the data. This is not legal advice.

## Related

[How-Visits-Are-Counted](How-Visits-Are-Counted), [Bot-Handling](Bot-Handling), [Data-Page](Data-Page), [Retention](Retention), [Settings-Reference](Settings-Reference).

Full reference: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/privacy.md
