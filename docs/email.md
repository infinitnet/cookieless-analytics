# Scheduled email

Wiki: [Dashboards and Sharing](https://github.com/infinitnet/cookieless-analytics/wiki/Dashboards-and-Sharing).

Any dashboard can be sent by email on a schedule, and the Weekly digest is a template plus one click. The plugin sends email only through the site's own email provider and only when a schedule exists.

## Requirements

Email is sent through the host's email pipeline (`ctx.email`, capability `email:send`). It exists only when an email provider plugin is installed, active and selected. Without one, the Schedule email dialog shows the host's text: "No email provider is configured. Install and activate an email provider plugin, then select it in Settings > Email." Schedules can still be saved; nothing is sent until a provider is active, and the schedule stays as it is.

## Setting up a schedule

Open a dashboard, choose **Schedule email**, and set:

| Field | Values |
|---|---|
| Frequency | Weekly or monthly |
| Weekday or day of the month | Monday to Sunday; 1 to 28 (so every month has the day) |
| Hour | 00:00 to 23:00 in the site timezone |
| Recipients | 1 to 5 plain addresses such as `reports@example.com`, one per line |
| Range | One of the date presets (never a custom range) |
| Compare | With the previous period, or the dashboard's own comparison when it has one |
| Subject | Optional, up to 80 characters; the default is the dashboard name and the range |

A recipient must be a plain address (no display name, no comma, semicolon or line break, at most 254 characters); a subject with a control character is refused. **Send test** sends the dashboard to your own address only (the address of your account; it takes no address from the form), at most once a minute per dashboard; a token without a user cannot send a test.

**Use and schedule email** on the Weekly digest card of New dashboard creates a dashboard from the Weekly digest template for the selected site (visitors, sessions, pageviews, bounce rate, channels, top pages, top sources and countries) and opens this dialog with weekly, Monday, 08:00 and the comparison set; add the recipients and save. Each site has its own digest; there is no cross-site digest.

## Who sees the recipients

Recipients are stored in the dashboard record, next to the schedule. Only an Admin sees them: for other roles the dashboard list and the dashboard itself show the number of recipients only. Only the Schedule email dialog (`dashboards/email/save`, which needs the manage permission) writes the schedule. Saving the dashboard in the editor, importing a template, copying to sites and saving through the agent API never change it, and Export, Copy to sites, the agent API and the MCP tools never return it: recipients are not portable.

## What is sent

One message per recipient, with that recipient as the only `To` address (never `Cc`). The HTML is table based with inline styles, because mail clients remove SVG:

- Number tiles: the label, the value with its currency code for amounts, and the change against the comparison.
- Line and area tiles: one line per metric with the latest value, the previous one and the change; with several metrics each line starts with the metric's name.
- Bars, donut and table tiles: a table of at most the tile's row count.
- Revenue tiles show the currency code with every amount and the "Amounts in USD." line; a revenue tile of a site without revenue is left out.
- Site search tiles keep the floor of two sessions and say how many terms are hidden.
- The fixed caveat texts as footnotes (the per-day visitors note, and the definitions of bounce rate and session duration when a tile shows them), and one link to the dashboard in the admin.

No images, no remote resources, no tracking pixel and no share link. Every name, path, source, event name and search term is escaped. A plain text part carries the same figures. The HTML stays under 100,000 bytes.

## When it is sent

The `mail` cron task runs at minutes 15, 35 and 45 of every hour, takes the one dashboard that is due longest, moves its next due time to the next period before sending (so a crash can lose one email but never send one twice), runs the dashboard and sends. If a send fails, the error is shown in the dialog and only the failed addresses are retried, on each of the next two runs; after that the schedule waits for the next period. The cost of one run is described in [limits.md](limits.md#scheduled-email).

## Privacy

The privacy receipt says: "If you schedule an email, the recipients you enter are kept with the dashboard." No visitor data is in the dashboard record; the email shows the same aggregated numbers as the admin pages.
