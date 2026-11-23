# Dashboards

Wiki: [Dashboards and Sharing](https://github.com/infinitnet/cookieless-analytics/wiki/Dashboards-and-Sharing).

A dashboard is a saved view of your reports: up to 12 tiles, each one report shown as a number, a chart or a table. Dashboards live in the plugin's own storage, one list per site; they hold no visitor data, only the layout.

## Tiles

Each tile shows one report from the Reports list with the dashboard's range. Choose the report, then the kind of tile, then the metric of a number or the metrics of a line or area (a checklist, up to 4 on at most two scales; the first two show while a comparison is on), a title, tile filters (up to 5), report options and the number of rows (5 to 25), and a width of 1, 2 or 3 columns. Tiles flow left to right in a 3 column grid in their order; a width of 3 is a full row.

To change the order in the editor, drag a tile by its handle (the "Drag to reorder" button at the start of each row; it works with a mouse, a pen and touch) or use the Up and Down buttons, which are the keyboard and screen reader path. After a move the focus returns to the moved tile. With reduced motion turned on in the system settings the drag has no animation. Only the order of the tiles is stored, so nothing about the layout needs migrating.

| Reports | Kinds |
|---|---|
| Overview | Number |
| Visitors over time, Search Satisfaction over time | Line, Area |
| Search overview | Number, Line, Area |
| Search Satisfaction, Goals | Number, Bars, Donut, Table |
| Cannibalization, Position movement | Number, Table |
| Position bands | Number, Bars, Donut, Table |
| Bands over time | Stacked bars, Line, Area |
| Competing pages, Striking distance, Search movers, Search decay, Traffic movers, Traffic decay | Table |
| Impact | Number, Line |
| Revenue | Number |
| Revenue over time | Line, Area |
| Every other report, Revenue breakdown | Bars, Donut, Table |

- A Goals number tile shows one goal; a Funnels tile shows one funnel; an Event properties tile needs the event name, which the field suggests from the events seen in the dashboard range.
- Search tiles take a source (all, Google, Bing) and show an empty state until a Search source is connected.
- **Revenue** tiles (`revenue`, `revenue_series`, `revenue_breakdown`) show one currency: `params.currency`, or when it is absent the site's default currency at the time the tile runs, so a template or a copied dashboard shows each site in its own currency. A Revenue breakdown tile needs `params.dim` (`channel`, `source`, `campaign`, `entry`, `page`, `country`, `device`, `goal`, `event`). Titles, values and column headers carry the code ("Revenue (USD)", `1,234.50 USD`); under the tile the line "Amounts in USD." and, when other currencies have orders in the range, "Also recorded: 120.00 EUR (3 orders)." (at most five). A site without revenue shows "No revenue recorded yet". See `docs/revenue.md`.
- A donut shows at most 7 slices, one colour each; the rest is folded into "other".
- **Line and area** tiles draw 1 to 4 metrics (`metrics`), each with its own colour and marker shape, on one axis or two when the metrics use two scales (for example clicks and position); position runs 1 at the top. With a comparison the first two show, each with a dashed line in its colour. In the dashboard view the legend above the chart turns lines off and on for that visit; the stored list changes only in the editor. Shared pages and emails show every stored line (the first two with a comparison), with a legend and no controls; an email lists the latest and previous value of each metric.
- A table tile shows the name and the first three figures of its report, or the columns the tile names: the editor lists the columns of the report, up to 6 can be checked, and they show in the report's order. A number tile names its metric once.
- **Stacked bars** (Bands over time only): one bar per day or week with one segment per position band; the shared page draws the same bars with a tooltip per segment and a table of the values.
- The SEO tiles take the options of their view: group by queries or pages, rising or declining, clicks or impressions, the impression and share floors, brand queries, and for Position movement which list to show (the matrix, moved up, moved down, new or lost). Shared pages add the coverage line under cannibalization and striking distance tiles and the period line under tiles that compare periods.
- **Impact** tiles compare one metric before and after an annotation: a Number tile shows after, before and the change; a Line tile the daily series with the annotation day marked. The annotation is an id or `latest` (the newest annotation of the site, optionally of one kind), resolved each time the dashboard runs, so a template works on any site; a site without annotations shows "No annotation yet". Shared pages add the caution line "Before and after comparisons show correlation, not causation. Seasonality, other changes and search engine updates overlap; annotations in the same window are listed."

## Defaults and the header

A dashboard has a default range, comparison, segment and filters. When you open it, the header starts from those defaults; changes you make in the header apply on top of them until you leave. They stay with the dashboard: the other pages keep the range, comparison, segment and filters you had before you opened it, and closing the dashboard returns the header to them. A link to a dashboard with a range, `?d=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD`, opens it on that range instead of its default range (the other defaults still apply). If the default segment was deleted, the tiles show all visitors and say so.

Viewer rules (allowed ranges and whether comparison is allowed) apply to shared links (see below); the default range must be one of the allowed ranges.

## Templates and the gallery

A template is a dashboard without its site, with every segment, goal and funnel written as its name instead of its id.

- **New dashboard** opens the picker: Blank, a template file from your computer, then the built-in templates by group. The Weekly digest template there also opens its email schedule.
- Export (in the **More** menu of a dashboard, with Copy to sites, Schedule email, the annotations switch and Delete) downloads the open dashboard as a template file, with or without the definitions of the segments, goals and funnels it uses.
- Import reads a template file into the selected site. Each name is looked up there: a record of that name is reused and never changed; a missing one is created from the definition in the file when the file carries it; otherwise the reference is dropped and listed after the import. A tile that cannot work without its goal or funnel is left out and listed.
- The gallery offers fourteen built-in templates in two groups. Analytics: Overview, Content, Acquisition, Behaviour, Search Satisfaction (organic search sessions only, like every Search Satisfaction number), Revenue (revenue, orders, average order value and revenue per visitor, revenue over time, revenue by channel, source, landing page and goal, in the site's default currency), Weekly digest (visitors, sessions, pageviews and bounce rate, channels, top pages, top sources and countries, compared with the week before; made for a scheduled email, see below), Search, Links (link clicks and the share of sessions with one from the goal `Link clicks`, which the import creates once, clicks by channel and by page, the links table and the placements table; no revenue tile, so a shared Links dashboard shows no amounts) and Impact of last changes (the 28 days after the newest annotation against the 28 days before: sessions, Organic Search sessions, Search clicks and position, long click rate, bad experience rate, and a sessions line). SEO: SEO overview (Search figures and trend, position bands, band movement, declining pages, striking distance), Cannibalization (figures, queries and competing pages), Position bands (bands, the stacked trend, the movement matrix, striking distance) and Winners and losers (rising and declining pages and queries, new and lost queries, Search decay, pages with fewer views, page view decay). The SEO templates offer ranges up to 90 days, because the SEO views read at most 93.
- A template whose structure is invalid (an unknown report, a kind a report does not support, a missing metric) is rejected as a whole, and the message names the tiles.

## Copy to sites

"Copy to sites" exports the dashboard with its definitions and imports it into each chosen site, creating the missing goals, funnels and segments when the box is ticked. The copies are independent: changing one does not change the others. A connected site's goals, funnels and segments live on that site, so a copy to it keeps only references that need none.

## Request count and budget

Tiles with the same report, filters and options share one request, so four number tiles of the Overview cost one. The editor shows the distinct request count. Each distinct request costs one to three database statements, up to twice that with a comparison, and a run adds a few reads of its own (goals and the detailed window state once per run, not per request); see `docs/limits.md` for the Free plan budget and the measured counts.

## Limits

20 dashboards per site, 12 tiles per dashboard, 16 KB per stored dashboard.

## Agent API

Agents read and run dashboards with `read:analytics` (and `read:search` for search tiles) and write them with `write:dashboards`; see `docs/AGENTS.md`, section 8.

## Sharing

Each dashboard can have up to 10 read-only links (100 per site), for example one per client or one for a board. Open the dashboard, choose Share, optionally give the link a label (1 to 40 characters, such as "Client A"), set a password (8 to 128 characters) and an expiry (7, 30 or 90 days, a date, or never), and create the link. The eleventh link of a dashboard is refused until you revoke one. The full link, `https://<your-host>/_/s/<token>` by default, is shown once with a copy button and never again: only its first eight characters and a hash of the rest are stored. Change the path with the `sharePath` setting (neutral words only, no trailing slash, different from the script and event paths).

### How links work

- The token is `<prefix>.<secret>` with a 256 bit secret, made by the same generator as API keys. Unknown, revoked and expired links all answer 404.
- Each link has its own token, label, password, expiry, view count and failed sign-in lock. Revoke deletes one link at once and never affects the others. Deleting a dashboard, or the connected site it belongs to, deletes all of its links.
- The password is bound to its link, so it cannot be changed; to change it, create a new link and revoke the old one.
- All links of a dashboard share its viewer rules (allowed ranges, comparison, annotations).
- Shares of a remote satellite are not offered.
- The dialog lists every link with its label, state (open, password, expired), link id, created, expires, views and last viewed time, a Revoke button per link, and the New link form. The dashboard list shows the most permissive state (open before password before expired) as a badge, with that link's label and expiry and the number of links; shared dashboards are listed again under Shared links with their views. A link itself is shown only once, when it is created, so the list has no copy button. Views are counted after each page is sent (a `HEAD` request is not a view); browsers that keep an open page for a minute do not ask again, so the dialog labels the counts approximate.

### What viewers can do

Viewers see the dashboard's tiles for its default range and can switch between the ranges the dashboard allows (`viewer.ranges`, as links, `?r=7d` and so on). When the dashboard allows comparison and has at most 6 distinct report requests, a link turns the comparison with the previous period on (`?c=1`). Viewers cannot change filters or segments, drill down, export or see raw rows. Tiles show aggregated numbers only, the same as the admin pages.

The page is plain HTML with inline CSS and inline SVG: no script, no stylesheet or image requests, no form, no cookie, no storage. It never names the product or the plugin, and it shows the site's name only if you wrote it into the dashboard name. Opening a shared page is not counted as a visit to any site; it only raises the link's view counter.

### Annotations on shared pages

`viewer.annotations` (optional, off when absent) decides whether a shared page shows the annotations matching each `line` and `area` tile: markers with a native tooltip and a list of at most 12 per tile, then "and n more". Turn it on in the Share dialog or the editor's viewer rules ("Show annotations to viewers"). Annotation texts are visible to anyone with the link when it is on. Viewers have no toggle; the admin views follow "Show annotations" in the More menu of the dashboard view instead. See [annotations.md](annotations.md).

### Passwords

Browsers ask for the password with their own sign-in prompt (HTTP Basic authentication over HTTPS); the user name is ignored. The password is never stored, logged or echoed. The link record keeps a verifier: PBKDF2-SHA-256 with 10,000 iterations over a random 16 byte salt plus the link secret. Because the secret is part of the input, the verifier is useless without the link: a leaked backup of the plugin's storage cannot be used to open links or to guess passwords, and the same password gives a different verifier under each link. After a successful sign-in the worker remembers the result in memory for 10 minutes, so repeated views skip the derivation.

After 10 wrong passwords within 15 minutes the link is locked for 15 minutes: every request answers 429 with `Retry-After`. A correct password resets the counter. The lock counts per link; no IP address or user agent is stored. The counter lives in the plugin's key-value store, which has no atomic increment, so many guesses sent at the same moment can exceed ten per window before the lock lands; the rate limiting rule below is the hard bound.

### Headers

| Header | Open link | Password link |
|---|---|---|
| `cache-control` | `public, max-age=60` | `private, no-store` |
| `x-robots-tag` | `noindex, nofollow` | `noindex, nofollow` |
| `referrer-policy` | `no-referrer` | `no-referrer` |
| `x-content-type-options` | `nosniff` | `nosniff` |
| `content-security-policy` | `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'` | same |

Every answer other than 200 carries `cache-control: no-store`; 401 adds `WWW-Authenticate: Basic realm="View <prefix>", charset="UTF-8"`. Browsers may keep an open page for a minute, so a revoked open link can still show in a browser that opened it during that minute. Cloudflare does not cache HTML unless you add a Cache Rule. The page also carries the same instruction as a `noindex, nofollow` meta tag. The share path is deliberately not blocked in the site's crawl rules file: a blocked URL can still be indexed from links, because search engines would never see `noindex`.

### Rate limiting

The plugin cannot declare a Workers rate limiting binding. Add a Cloudflare rate limiting rule for requests whose path starts with your `sharePath` (one rule is included on the Free plan), for example 30 requests per minute per IP address with a block action.

### Budget

A shared page runs every distinct report request of the dashboard in one Worker invocation, one to three D1 statements each and up to twice that with the comparison, plus about 6 reads and writes of its own (the link, the dashboard, goals, the detailed window state, the view counter). Measured with table tiles of the `pages` report, counting every database, KV and storage call of a shared page: 3 distinct requests 15 round trips, 6 requests 24, 6 with the comparison 31, 12 requests 42. The Free plan allows 50 D1 queries per invocation, which is why the comparison is offered only up to 6 distinct requests. A password verification costs a few milliseconds of CPU; the Free plan allows 10 ms per request, and repeated views within 10 minutes skip it. See `docs/limits.md`.

## Scheduled email

Any dashboard can be sent by email on a schedule: open it, choose Schedule email, pick weekly (a weekday) or monthly (a day from 1 to 28, so every month has it), the hour in the site timezone, up to 5 recipients, the range and whether to compare with the previous period, and an optional subject. "Use and schedule email" on the Weekly digest card of New dashboard creates a dashboard from the Weekly digest template for the selected site and opens this dialog with weekly, Monday, 08:00 and the comparison already set; add the recipients and save. There is no cross-site digest; the All-sites summary covers that view.

Email needs an email provider plugin on the site. How the email looks, what it contains, the budget and who can see the recipients: [email.md](email.md).
