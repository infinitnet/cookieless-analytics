/** Dashboard and share limits (constants, not settings). No dependencies, so the middleware can import them. */
export const MAX_DASHBOARDS_PER_SITE = 20;
export const MAX_TILES = 12;
export const MAX_RECORD_BYTES = 16384;
export const SHARE_LOCK_FAILURES = 10;
export const SHARE_LOCK_MINUTES = 15;
export const SHARE_COMPARE_MAX_REQUESTS = 6;
export const SHARE_OPEN_MAX_AGE = 60;
/** Scheduled dashboard email. */
export const MAX_SHARES_PER_DASHBOARD = 10;
export const MAX_SHARES_PER_SITE = 100;
export const MAIL_MAX_RECIPIENTS = 5;
export const MAIL_MAX_DISTINCT_REQUESTS = 12;
export const MAIL_MAX_HTML_BYTES = 100_000;
export const MAX_SCHEDULED_PER_SITE = 5;
export const MAIL_STATEMENT_BUDGET = 36;
/** Retries of a failed send, one per tick, before the schedule skips to the next period. */
export const MAIL_MAX_RETRIES = 2;
