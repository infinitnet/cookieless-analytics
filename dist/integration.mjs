import { PLUGIN_ID } from "./contract.mjs";

//#region src/integration.ts
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

//#endregion
export { cookielessAnalyticsIntegration as default };