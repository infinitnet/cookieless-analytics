# Troubleshooting

Common problems, what causes them and how to fix them. Most answers start on the Data page: its "Not recorded" table counts every request that was not stored, by reason.

## How to use it

1. Find the symptom below.
2. Check the cause in the place named (Data page, Settings, the browser's network panel, the Worker logs).
3. Apply the fix and test again in a private browser window.

## No data appears

| Cause | Fix |
|---|---|
| The layout does not render `EmDashHead`, so no script reaches the page. | Render `EmDashHead` in `<head>`. View the page source: it must hold `<script defer src="/_/e.js">`. |
| The integration is missing or comes before `emdash()`. | Add `cookielessAnalyticsIntegration()` to `integrations` after `emdash()`. Open `https://example.com/_/e.js`: it must answer 200. |
| `injectScript` is off and the theme adds no tag. | Turn `injectScript` on, or add the tag with the path from `scriptPath`. |
| You test while signed in, or your browser sends Global Privacy Control. | Test in a private window without those (`excludeEditors`, `signals`). |
| No Cron Trigger: older ranges show no summaries. | Add `"triggers": { "crons": ["* * * * *"] }` to the Wrangler config. |

Check: the network panel shows `POST /_/e` answered 204, and Overview replaces its "No visits yet" panel with the report.

## Editor visits missing

Signed-in editors and administrators are not recorded while `excludeEditors` is `true` (the default). This is intended. Test in a private window, or turn the setting off for a moment.

## Blocked by an ad blocker

Content blockers look for words in paths. The plugin serves its script and event path from your own origin under neutral paths (`scriptPath` `/_/e.js`, `collectPath` `/_/e`). If you change them, avoid such words: a path that contains one falls back to its default. Client sites load the script from your install, a third party host for them; proxy `/_/e.js` and `/_/e` on the client's own zone if that matters.

## Search not syncing or throttled

| Cause | Fix |
|---|---|
| Bing shows **Throttled** ("Bing limits shared server addresses. The sync retries on the next scheduled run."). | Nothing to do: Bing limits calls from shared addresses such as Cloudflare's. The stored rows stay; the sync retries. |
| Google stops with `invalid_grant` after 7 days. | The consent screen is in Testing mode. Publish it (In production), then connect again. |
| No property mapped for a client site. | Set the Google property and Bing site URL on Definitions, Sites. |
| A run stops early on Workers Free. | Keep `syncSubrequestBudget` at 40 on Free; on Paid raise it to about 900. |
| Backfills move slowly on Small. | Search writes are limited to 21,250 rows per UTC day on `small`; a long backfill takes several days. |
| Errors after 429 or 5xx answers. | Runs wait 5 minutes, doubling up to 2 hours. Check the status strip on the Search page. |

## Encryption key missing

Saving a Search secret fails without `EMDASH_ENCRYPTION_KEY`. Generate and store one:

```sh
npx emdash secrets generate
wrangler secret put EMDASH_ENCRYPTION_KEY
```

A lost or changed key makes the stored secrets unreadable: connect the Search sources again.

## Database busy or overloaded

The Data page lists `overload`, `write_error` or `daily_limit` under "Not recorded".

| Reason | Cause | Fix |
|---|---|---|
| `overload` | D1 refused the write as overloaded, or a Postgres database did not answer in time (after a timeout the server instance does not connect again for 20 s). The page script retries for about a minute. | Use the [Queue-Worker](Queue-Worker), or an own database for analytics. |
| `write_error` | Any other failed write, for example a binding named in `database` that does not exist. | Check the binding name in the wrangler config and the plugin options. |
| `daily_limit` | The account used the Workers Free plan's 100,000 rows written per day. | Set `capacityProfile` to `small`; it stops recording before the limit. |
| `budget_blocked` | The Small profile's write guard paused recording for the rest of the UTC day. | Wait for 00:00 UTC, or move to Workers Paid and `standard`. |

A refused write is answered 503. On Free, a background run that hits the request limit makes the Data page say "This install appears to run on the Workers Free plan": set the profile to Small.

## Numbers differ from other tools

- Visitors are counted per day and summed over days; there are no cross-day unique visitors.
- Bots, browsers with Global Privacy Control, signed-in editors, excluded paths and IP ranges are not counted.
- No cookies: a visitor whose network or browser changes mid-visit starts a new session; two people behind one address with the same browser can be joined.
- A page view counts on the day its visit started, also after midnight.
- A reload of the same path within `reloadDedupeSeconds` (default 2) is not counted again.
- Nothing is sampled.

## Days start at the wrong hour

Days and hours follow `siteTimezone` (default `UTC`). Set it to your IANA timezone, for example Europe/Berlin. The Small profile's write guard and the Search rows budget use the UTC day regardless. Visitor keys rotate at `saltRotationHour` in `saltTimezone`.

## Client site visits refused

The Data page counts them under these reasons:

| Reason | Cause | Fix |
|---|---|---|
| `origin_rejected` | The page's host is not listed for the site, or the page is not on https. | Add the exact host name (with and without www) on Definitions, Sites. |
| `unknown_key` | The key is wrong, or was replaced with **New key**. | Copy the current snippet from the Sites tab. |
| `site_paused` | The site is paused. | Resume it on the Sites tab. Changes reach every isolate within 60 seconds. |

Also check that the middleware is installed: the Sites tab warns when it has not been seen for a day.

## Queue not consuming

| Cause | Fix |
|---|---|
| The producer binding is not named `CA_QUEUE`. | Rename it. Without it the setting has no effect and the Data page shows "Direct to the database." |
| The consumer's `@infinitnet/cookieless-analytics` version differs from the site's. | Set the same version and deploy the consumer again. |
| The consumer lacks the `CA_DB` binding or the `database` option. | Add both; it retries every message until then. |
| Messages failed for about 2.5 hours. | They are in `ca-ingest-dlq`. Add it as a second consumer queue to apply them. |
| `late_after_close` counts after an outage. | Messages that waited past 00:15 of the day after their own day are not written. |

## Older detail is gone

Retention deleted it. Detailed rows are kept for `rawRetentionDays` (default 760), shorter when the storage budget of the capacity profile requires it; the Data page then shows a notice. Older days answer from daily summaries, with fewer filters; journeys show only their top steps and paths there, and Search Satisfaction shows a notice. Deleted detail cannot be restored by raising the setting. See [Retention](Retention).

## Limits

- The page script retries a refused page view up to 3 times over 65 to 97.5 s, only while the page stays open.
- Drop counts are a lower bound: an instance that stops loses up to 10 seconds of counts.

## Gotchas

- Bots are excluded and never leave a stored row; a high `bot` count is normal.
- Test with a private window, not a signed-in session.
- Without Cloudflare in front (a local dev server) the country stays empty.

## Related

[Quick-Install](Quick-Install), [Data-Page](Data-Page), [Queue-Worker](Queue-Worker), [Capacity-Profiles-and-Cloudflare-Plans](Capacity-Profiles-and-Cloudflare-Plans), [Search-Integrations](Search-Integrations), [Multi-Site-and-Sites-View](Multi-Site-and-Sites-View), [Retention](Retention), [Upgrade](Upgrade).
