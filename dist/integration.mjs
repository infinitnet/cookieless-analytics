import { PLUGIN_ID } from "./contract.mjs";
// src/integration.ts
/**
* Astro integration: registers the middleware that serves the page script and the neutral event
* path. Add it after `emdash()` in `integrations`.
*/
function cookielessAnalyticsIntegration() {
	return {
		name: PLUGIN_ID,
		hooks: { "astro:config:setup": ({ addMiddleware }) => {
			addMiddleware({
				entrypoint: new URL("./middleware.mjs", import.meta.url),
				order: "pre"
			});
		} }
	};
}
export { cookielessAnalyticsIntegration as default };
