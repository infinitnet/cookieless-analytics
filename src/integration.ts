import type { AstroIntegration } from "astro";
import { PLUGIN_ID } from "./contract.js";

/**
 * Astro integration: registers the middleware that serves the page script and the neutral event
 * path. Add it after `emdash()` in `integrations`.
 */
export default function cookielessAnalyticsIntegration(): AstroIntegration {
	return {
		name: PLUGIN_ID,
		hooks: {
			"astro:config:setup": ({ addMiddleware }) => {
				// The URL form resolves from the installed package path under pnpm and Cloudflare builds.
				addMiddleware({ entrypoint: new URL("./middleware.mjs", import.meta.url), order: "pre" });
			},
		},
	};
}
