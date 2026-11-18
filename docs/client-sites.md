# Client sites

Wiki: [Multi Site and Sites View](https://github.com/infinitnet/cookieless-analytics/wiki/Multi-Site-and-Sites-View).

Hosted on your EmDash install, measuring any site you register. A client site is any website (plain Astro, a static site, another CMS) whose pages load the script from your install and send their visits to it. Its data lives in the same database as your own site, under its own site id, and every report, filter, segment, goal, funnel, annotation and the agent API work for it the same way.

## 1. Register the site

In the admin, open Cookieless Analytics, Definitions, Sites (shown with this install selected in the site switcher) and add a site:

- **Label**: the name in the site switcher.
- **Id**: lowercase letters, digits and dashes, up to 32 characters. It must differ from this install's `siteId` and from every other site. It cannot be changed later.
- **Host names**: 1 to 10 exact host names without `https://`, port or path, for example `example.com` and `www.example.com`. A host name this install serves itself, or one already registered for another site, is refused.
- **Google property** and **Bing site URL** (optional): the Search mapping of this site (see section 7).
- **Default currency** and **Accept revenue from browsers** (optional): the revenue settings of this site. Inherit, the default, uses this install's `defaultCurrency` and `acceptClientRevenue` settings, read at write time; a site with its own default stores that currency on events that name none. See [revenue.md](revenue.md).
- **Site search parameters** (optional): Inherit uses this install's `siteSearchParams` setting; an own list keeps the search terms of those query parameters for this site, and an own empty list turns site search off for it. See [content.md](content.md).

The site gets a key of 20 letters and digits. The key is public: it appears in the page source of the client site. It only allows "accept visits for this site from these host names".

## 2. Add the snippet

The Sites tab shows three copyable forms for each site.

**Script tag**, in the `<head>` of every page:

```html
<script defer src="https://your-install.example/_/e.js" data-ec-key="abcdefghij0123456789"></script>
```

The script path and the attribute prefix follow the `scriptPath` and `namespace` settings. The key can also be given as `?k=<key>` on the `src` instead of the attribute.

**Google Tag Manager**: create a Custom HTML tag with the same script tag and the trigger "Initialization - All Pages". Tag Manager may change quotes while minifying, which does not affect the attribute values.

**Single page apps**: after each client-side route change, call

```js
window.__ec && window.__ec.page();
```

In Tag Manager, put this line inside `<script>` tags in a second Custom HTML tag with the History Change trigger. Astro's ClientRouter needs nothing: the script listens to `astro:page-load`.

The script reads its own `<script>` element once while it first runs, takes the key and your install's origin from it, and sends every event to `https://your-install.example/_/e` with the key. Without a key it behaves exactly as on your own pages.

## 3. How visits are accepted

An event with a key is recorded only when all of these hold:

- the request carries an `Origin` header with `https` and one of the site's registered host names (browsers set `Origin` themselves; a page cannot forge it);
- the key belongs to a registered site that is not paused.

Everything else is answered with the same empty 204 and counted as `origin_rejected`, `unknown_key` or `site_paused` in the drop counters of the privacy receipt. The event endpoint answers with `access-control-allow-origin: *`: the answer has no body and uses no credentials, so it exposes nothing. `OPTIONS` on the event path is answered for callers that post JSON.

Sessions and visitor keys are per site: the same person on two sites gets two unrelated visitor keys, and a session id of one site is never continued on another. Pages of one site continue a visit through the visitor key on full page loads and through the in-memory session id on soft navigations; no link is changed.

## 3a. Linked hosts: a shop or checkout of this site

When a second host belongs to this site, for example `shop.example.net` next to `example.com`, register it as a client site with **Linked to this site** checked and add the same script tag with its key to the shop's pages. There is no second install.

- Its events are stored under this site's id, not under the client site's id, with the host name recorded on each page view and event. A linked site is therefore not listed in the site switcher or the All sites table; its traffic is in this site's reports. Its id is not a site of its own anywhere else either: the agent API and API key restrictions answer `400 unknown_site` for it, so a shop backend posts its orders without `site` (this site), and its Search property is not synced.
- Data a site recorded under its own id before it was linked stays there and is no longer shown. Deleting a linked site with "also delete its data" removes only those rows; what it sent while linked is this site's data.
- The visitor key is the same on both hosts, so a visit continues from `example.com` to the shop and back as one visit of one visitor. No link is changed on any host (see [sessions.md](sessions.md), "Visits across linked hosts").
- The hosts count as one site: a move between them is never a referral and never changes the channel or the entry page.
- Shop orders, sent by the page or by the shop's server through the agent events route with the page's `window.__ec.sid`, attach to the visit and its entry channel ([revenue.md](revenue.md)).
- A click from one host to the other is not an outbound click (`_outbound`).
- This site's settings apply to the linked host's events: currency, `acceptClientRevenue`, site search parameters, channel rules. The per-site revenue and site search fields of the linked record are not used.
- The `host` filter matches the host of a visit's first page only; pages viewed on the shop inside a visit that began on the main host are not filtered out by `host is example.com`. Page reports have no host column: `/` on the shop and `/` on the main host are one row in Pages, entry and exit pages, goals and funnels. Give the shop's paths a prefix of their own when they must stay apart.
- A link, an unlink or a pause reaches every Worker isolate within 60 seconds; the page script, which names the linked hosts, is cached by browsers for up to an hour.
- The host names of linked sites are part of the served page script, so it can leave their links alone. Do not link a host you do not want named there.
- Set `siteOrigin` when the event path is proxied on the shop's own zone (section 4): the main host is then known from it.

The Sites tab lists the hosts of this site with the time of the last page view or event from each (updated about every 10 minutes, only while a linked site exists, and for this site's own host only when `siteOrigin` is set), and the limits of a visit across hosts: a change of network or browser in the middle of a visit, a payment finished on another network, and the daily salt change start a new visit.

## 4. What a client site does not get

- **Not found** shows "not available for this site": error pages are seen by the server that serves the page, and a client site sends page views only.
- No `excludeEditors`: visitors of a client site are never editors of this install.
- No automatic annotations from publishing; add annotations by hand or through the agent API.
- No first-party script path. Content blockers block a third-party script and endpoint more easily than first-party ones. As an operator setup (not a plugin feature), you can proxy `/_/e.js` and `/_/e` on the client's own Cloudflare zone to your install with a Worker route or a Transform Rule; the snippet then points at the client's own host. The `Origin` rule still applies.

The middleware must be installed: the direct plugin route only accepts same-origin requests, so central ingest needs the event path the middleware serves. The Sites tab warns when the middleware has not been seen for a day.

## 5. Pause, new key, delete

- **Pause** stops a site at once (within the 60 second registry cache of each Worker isolate). Its data stays.
- **New key** invalidates the old key at once. Every page still using the old snippet stops sending until the snippet is updated.
- **Delete** removes the site after a typed confirmation. With "also delete its data", every row of the site is deleted in chunks of 2000 rows per table; the deletion resumes where it stopped if interrupted. Without it, the rows stay until retention removes them; there is no automatic purge of unregistered sites.

## 6. Retention and privacy

Retention settings (`rawRetentionDays`, `rollupRetentionMonths` and the others) apply to every site of the database; they cannot differ per site. The privacy receipt on the Data page shows the selected site's row counts and its own Markdown block for that site's privacy page.

## 7. Search data for a client site

This install's one Google connection and one Bing key serve every site in this database. To sync a client's Search data, give your install's identity access to the client's property:

- Google Search Console: add the service account email, or the Google user who connected through OAuth, as a restricted user of the client's property.
- Bing Webmaster Tools: add the account that owns your Bing API key as a user of the client's site, or verify the site under that account.

Then set the Google property and the Bing site URL on the client site (see [search-sources.md](search-sources.md) for the property picker and the sync). A site without a mapping is skipped and shows "No property mapped for this site".

## 8. Capacity

Every site of a database shares the storage budget of `capacityProfile`: when the detailed visits of all sites would not fit it, the detailed window shortens for all of them, so choose a larger profile or shorten `rawRetentionDays` when many sites share one database. On the `small` profile the write guard counts the page views of every site of the database, and the Free plan's daily rows written are per account. A busy site can get a database of its own with the `databases` option. Write costs, the measured latencies, the storage estimate and the scale-out steps are in [limits.md](limits.md#capacity-profiles).

## 9. Agent API

`query`, `summary`, `status`, `annotations` and the Search routes take `site` for a client site; see [AGENTS.md](AGENTS.md). API keys can be limited to some sites of this database when they are created.

## 10. All sites view

With two or more sites the site switcher starts with "All sites". On the Overview page it shows one table: a row per site of this database (the local site and every client site) with sessions, pageviews, visitors, bounce rate and revenue per currency, each with the change against the header's comparison, sorted by pageviews; engaged rate (1 minus bounce rate) is in the API. Click a row to open that site. The totals row sums sessions, pageviews and revenue per currency; visitors read "not summed", because one person visiting two sites is a visitor of each. The figures come from the daily rollup and are complete up to the date the page shows. Every other page shows the local site while "All sites" is selected and offers the way back to the table. The same table is the route `sites/summary` and, for agents, the report `sites_summary` ([AGENTS.md](AGENTS.md) section 14). Connected remote sites join the table as their own rows ([multi-site.md](multi-site.md)). The site id `all` is reserved for this view.
