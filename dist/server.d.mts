import { h as IngestEvent } from "./contract-Btug8WEN.mjs";
/** The event fields a caller sets; `v` and `t` are filled in. */
export type ServerEvent = Pick<IngestEvent, "name" | "u" | "p" | "val" | "cur" | "oid" | "sid" | "h">;
/**
 * Record one event for the visitor of `request`. No `Origin` is sent, so the event belongs to the local
 * site and keeps its revenue fields even when `acceptClientRevenue` is off. Returns `{ ok }`, or null when
 * the plugin or its route is absent; never throws.
 */
export declare function recordEvent(locals: unknown, event: ServerEvent, request: Request): Promise<{
  ok: boolean;
} | null>;