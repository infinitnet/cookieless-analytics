//#region src/move/job.d.ts
/** The cron task that continues a job; scheduled while a job is active, cancelled when none is. */
declare const MOVE_CRON = "move";
//#endregion
//#region src/sources/sync.d.ts
/**
 * One-shot continuation names. The host deletes a finished one-shot row by id and `schedule()` upserts
 * the same `(plugin, name)` row (`plugins/cron.ts`), so a continuation that rescheduled its own name
 * would be deleted on return; a continuation therefore schedules the other name.
 */
declare const CONTINUE_JOBS: readonly ["search-continue", "search-continue-next"];
//#endregion
export { MOVE_CRON as n, CONTINUE_JOBS as t };