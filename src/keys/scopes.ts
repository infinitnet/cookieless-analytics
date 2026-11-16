/** API key scopes in 1.0. `write:events` is the one ingest scope: it writes events only, never sessions or visitor data. There is no scope for settings, keys, deletion or raw visitor ids. */
export const SCOPES = ["read:analytics", "read:search", "sync:search", "write:annotations", "write:dashboards", "write:events"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
	"read:analytics": "Traffic reports, catalog, summary, status and annotations",
	"read:search": "Search reports and search columns on Pages",
	"sync:search": "Start a Search sync or backfill",
	"write:annotations": "Add annotations, for example from a deploy script",
	"write:dashboards": "Create, change and delete dashboards",
	"write:events": "Record events and order values from the site's own server",
};
