/**
 * API key scopes in 1.0. `write:events` is the one ingest scope: it writes events only, never sessions or visitor data.
 * `data:export` and `data:import` are for backups and moves only: they read and insert the stored rows of the analytics
 * tables, daily visitor keys included. There is no scope for settings, keys or deletion.
 */
export const SCOPES = ["read:analytics", "read:search", "sync:search", "write:annotations", "write:dashboards", "write:events", "data:export", "data:import"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
	"read:analytics": "Traffic reports, catalog, summary, status and annotations",
	"read:search": "Search reports and search columns on Pages",
	"sync:search": "Start a Search sync or backfill",
	"write:annotations": "Add annotations, for example from a deploy script",
	"write:dashboards": "Create, change and delete dashboards",
	"write:events": "Record events and order values from the site's own server",
	"data:export": "Export every stored row of the analytics tables (backups and moves)",
	"data:import": "Import exported rows into the analytics tables (rows already present are kept)",
};
