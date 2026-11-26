import { CONTRACT_VERSION, type ContractResponse, PLUGIN_ID } from "../contract.js";
import type { Settings } from "../settings.js";
import { json, type RouteCtx, type RouteEnv } from "./env.js";

export function contractBody(s: Settings): ContractResponse {
	return { v: CONTRACT_VERSION, pluginId: PLUGIN_ID, collectPath: s.collectPath, scriptPath: s.scriptPath, namespace: s.namespace, proxy: true };
}

/** Public discovery route for sibling plugins and for servers that send to this install; `proxy` tells them the event route has the proxy mode. */
export function contractRoute(env: RouteEnv) {
	return {
		public: true,
		methods: ["GET" as const],
		response: "raw" as const,
		cacheControl: "public, max-age=60",
		async handler(ctx: RouteCtx) {
			return json(contractBody((await env.deps(ctx)).settings));
		},
	};
}
