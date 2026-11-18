/** Astro middleware entry, registered by `./integration` with `order: "pre"` after `emdash()`. */
import { MiddlewareHandler } from "astro";
export declare const onRequest: MiddlewareHandler;