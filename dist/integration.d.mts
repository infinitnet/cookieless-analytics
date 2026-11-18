import { AstroIntegration } from "astro";
/**
 * Astro integration: registers the middleware that serves the page script and the neutral event
 * path. Add it after `emdash()` in `integrations`.
 */
export default function cookielessAnalyticsIntegration(): AstroIntegration;