# MCP tools

EmDash serves a Model Context Protocol endpoint at `https://<your-site>/_emdash/api/mcp`. This plugin adds four tools to it, so an AI client that already talks to your EmDash site can read your analytics and add annotations with the same login or token it uses for content.

## 1. Enable the tools

The tools are off until an admin turns them on: open the plugin list in the EmDash admin, open Cookieless Analytics and enable its MCP tools. EmDash binds this consent to the exact tool list (names, descriptions, routes, permissions and input schemas). When an update of the plugin changes any tool, the tools are off again until an admin confirms the new list.

EmDash writes an audit row for every tool call and for every refused call.

## 2. Who may call them

The host enforces the rules; the plugin only declares the route and its permission.

- Every caller needs the route permission for their role: `plugins:read` for the three read tools, `plugins:manage` for `analytics_annotate`.
- A caller with an API token also needs the token scope `mcp:tools:cookieless-analytics` or the blanket `mcp:tools`. The `admin` token scope does not include them. Give the EmDash API token that scope when you create it.
- A caller signed in with a session (the admin in a browser) has no scope check; the role permission still applies.

## 3. The tools

The host lists them as `cookieless-analytics__<name>`.

| Tool | Route | Permission | What it does |
|---|---|---|---|
| `analytics_query` | `data/query` | `plugins:read` | One report for a site and range: the admin's report body (`report`, `query`, `params`, `limit`, `offset`, `withAnnotations`). |
| `analytics_catalog` | `data/catalog` | `plugins:read` | The catalog of reports, dimensions, operators, params, metric definitions and limits; the same document as `agent/v1/reports`. Takes `{}`. |
| `analytics_sites_summary` | `sites/summary` | `plugins:read` | One row per site of the database with sessions, pageviews, visitors, bounce and engaged rate and revenue per currency, from the daily summaries plus the days not stored yet (today included), computed on read, with an optional `previous` or `year` comparison. Body `{ from, to, compare? }`. |
| `analytics_annotate` | `config/annotations/save` | `plugins:manage` | Adds an annotation, or replaces one when `id` is given (`{ id?, site?, data: { ts, kind, text, path?, scope? } }`). Not destructive. |

Start with `analytics_catalog`, then call `analytics_query` with a report name from it. Example input of `analytics_query`:

```json
{ "report": "channels", "query": { "from": "2026-03-01", "to": "2026-03-07", "compare": "previous" }, "limit": 10 }
```

Not exposed, by design: event ingestion, deleting data, API keys, share links, settings, dashboards and their email schedules. No tool accepts or returns the `email` field of a dashboard.

## 4. Differences from the agent API

| | MCP tools | Agent API ([AGENTS.md](AGENTS.md)) |
|---|---|---|
| Caller | EmDash users and EmDash API tokens | Plugin API keys in `X-Api-Key` |
| Access rule | Role permission, plus the token scope for tokens | Key scopes (`read:analytics`, `read:search`, ...) |
| Sites | Every site the admin can open; a key's `sites` restriction does not exist here | Limited to the key's sites |
| Answers | The admin route's JSON | The agent envelope `{ ok, data, meta }` |
| Remote satellites | `analytics_query` with a remote site id is proxied through the master's key, as in the admin (multi-site master) | Never proxied: `400 site_not_allowed` |

## 5. Limits

The tools run the same routes as the admin, so the same limits apply: the range and row limits of each report, and the cost of the All sites summary, which computes each site's days not stored yet on read (four or more statements per site and day).
