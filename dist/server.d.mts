import { IngestEvent } from "./contract.mjs";

//#region src/server.d.ts
/** The event fields a caller sets; `v` and `t` are filled in. */
type ServerEvent = Pick<IngestEvent, "name" | "u" | "p" | "val" | "cur" | "oid" | "sid" | "h">;
/**
 * Record one event for the visitor of `request`. No `Origin` is sent, so the event belongs to the local
 * site and keeps its revenue fields even when `acceptClientRevenue` is off. Returns `{ ok }`, or null when
 * the plugin or its route is absent; never throws.
 */
declare function recordEvent(locals: unknown, event: ServerEvent, request: Request): Promise<{
  ok: boolean;
} | null>;
//#endregion
export { ServerEvent, recordEvent };