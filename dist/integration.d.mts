import { AstroIntegration } from "astro";

//#region src/integration.d.ts
/**
 * Astro integration: registers the middleware that serves the page script and the neutral event
 * path. Add it after `emdash()` in `integrations`.
 */
declare function cookielessAnalyticsIntegration(): AstroIntegration;
//#endregion
export { cookielessAnalyticsIntegration as default };