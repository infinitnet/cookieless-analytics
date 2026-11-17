# Multi-site

Wiki: [Multi Site and Sites View](https://github.com/infinitnet/cookieless-analytics/wiki/Multi-Site-and-Sites-View).

## How sites relate

- **One database (default).** Every site this install measures (the local site and its client sites) is stored in the EmDash database, next to the CMS tables.
- **Own database: the `database` option.** All analytics tables move to a D1 database of their own; settings and plugin state stay in the EmDash database ([install.md](install.md#own-database-for-analytics)).
- **Site routing: the `databases` option.** Chosen sites get a D1 database each, the rest go to a default database or stay in the EmDash database ([install.md](install.md#one-database-per-site)). It cannot be combined with `database`.
- **Linked hosts.** A client site marked as linked to this site (a shop or checkout on another host) is part of this site: its page views and events are stored under the local site, and each entry keeps its host name (`hs`) ([client-sites.md](client-sites.md#3a-linked-hosts-a-shop-or-checkout-of-this-site), [sessions.md](sessions.md#visits-across-linked-hosts)).
- **Client sites.** Any other site that loads this install's snippet is measured as a site of its own in this install's database ([client-sites.md](client-sites.md)).
- **Connected sites.** Another EmDash install that runs this plugin keeps its own data; this install reads its reports on demand through its agent API (below).

## Kinds of site in the switcher

One admin can show three kinds of site. The site switcher in the header lists them in this order, each with its kind.

| Kind | Where its data lives | How events arrive | Set up in |
|---|---|---|---|
| This install (local) | this install's analytics database | the page script of this EmDash site, and the snippet on its linked hosts | nothing to do |
| Client site | this install's analytics database (its own D1 database when routed with `databases`) | the snippet on any other site, cross-origin to this install | Definitions, Sites tab ([client-sites.md](client-sites.md)) |
| Connected site (remote) | the other EmDash install's own database | that install's own page script | `astro.config` of this install, plus a key on the other install |

A connected site is another EmDash install that runs this plugin. Nothing is copied between the two: every report of a connected site is read on demand through its agent API ([AGENTS.md](AGENTS.md)) with a key that this install reads from an env var. The connected site needs no configuration beyond that key.

## Connect a site

1. On the connected site, open the plugin's Definitions page, tab API keys, and create a key with the scopes `read:analytics` and `read:search`. Copy the token; it is shown once.
2. On this install, store the token as a secret env var, for example on Cloudflare Workers:

   ```sh
   wrangler secret put CA_SITE_BLOG_KEY
   ```

   On Node, set the variable in the environment of the server process. The plugin reads `process.env[keyEnv]` at the moment of each call, the same source EmDash reads `EMDASH_ENCRYPTION_KEY` from. The key is never stored in settings, storage or the bundle, and never returned by a route or written to a log.
3. Add the site to the plugin options in `astro.config` of this install and redeploy:

   ```js
   import cookielessAnalytics from "@infinitnet/cookieless-analytics";

   emdash({
     plugins: [
       cookielessAnalytics({
         sites: [{ id: "blog", label: "Blog", origin: "https://blog.example.com", keyEnv: "CA_SITE_BLOG_KEY" }],
       }),
     ],
   });
   ```

Rules, checked when the plugin is created (a bad entry stops the build with a message naming it):

- `id`: lowercase letters, digits and dashes, up to 32 characters; not `all`, not `default` and not listed twice. It must also differ from this install's `siteId` setting and from every client site id. The Sites tab refuses a client site whose id is a connected site's id. If a `siteId` you set later equals a connected site's id, this database wins: the connected site is left out of the switcher and its id is answered locally.
- `origin`: `https://` with a host name and an optional port, nothing else (no path, query or credentials).
- `keyEnv`: an env var name of 3 to 64 uppercase letters, digits and `_`, starting with a letter.
- `label`: 1 to 64 characters.

The plugin then declares exactly the host names of these origins in its `allowedHosts`, next to the Search hosts. There is no wildcard, so the host refuses any other target. Redirects are refused, so the key is never sent to another host: use the satellite's canonical origin (the one that does not redirect).

## What you get

- Every report page works for the selected connected site with the same filters, segments of that site, comparisons and report names, Search included. The admin sends the same request body to `data/query`; this install forwards it to `<origin>/_emdash/api/plugins/cookieless-analytics/agent/v1/query` without the `site` field, so the connected site answers for its own local site.
- Dashboards saved for a connected site render through the same route, one request per tile. They cannot be shared by link or scheduled by email.
- Definitions and Data show a notice with a link to the connected site's own admin instead of forms.
- The All sites table on the Overview lists each connected site as a row from its `agent/v1/summary`: sessions, pageviews, visitors, bounce rate, engaged rate and revenue per currency, with the change against the header's comparison. At most 10 connected sites are read per page, three at a time. A site that does not answer shows an error row and the rest of the table still loads.
- MCP: `analytics_query` serves a connected site the same way ([mcp.md](mcp.md)).

Cross-site uniques are never summed: one person who visits two sites is a visitor of each, so the All sites total reads "not summed" for visitors.

## Limits and failures

- Each call has an 8 second timeout and a 1 MB response cap. Answers are cached in memory for 60 seconds per request body.
- Every report of a connected site is one agent API call with its key (the Overview makes about 9, Revenue about 12), and the connected site allows 60 per minute per key by default; a few page changes within a minute then answer "The connected site did not answer (http 429)". Raise **Agent API requests per minute** (`agentRateLimitPerMinute`, up to 1200) on the connected site.
- Failures are the typed error `remote_error` with the HTTP status and a reason; the connected site's response body is never shown. A missing env var is `remote_error` with the reason `key_missing`, before any request is sent, and the switcher shows "key missing" next to the site.
- The agent API of this install never serves a connected site (`site_not_allowed`), so no chain of installs can be built through it.
- The agent API caps a range at its maximum length and a page at 1000 rows; an export of a connected site is capped at 1000 rows.
- Both installs should run the same plugin version. The All sites row reads the `compare` parameter and `data.revenue` of `agent/v1/summary`.

## Search data

Search data lives in the database that holds the traffic it joins. This install's Google and Bing connections serve this install and its client sites only; it never syncs Search data for a connected site. Connect Search on the connected site itself: the simplest way is to paste the same service account JSON into its settings and add the service account's email to that property in Search Console ([search-sources.md](search-sources.md)).
