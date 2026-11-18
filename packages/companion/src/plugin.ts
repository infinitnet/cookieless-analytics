import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./pages/setup.js";
import { STATE_KEY, handleHello } from "./state.js";

const plugin: SandboxedPlugin = {
	routes: {
		admin: { permission: "plugins:manage", handler: (routeCtx, ctx) => handleAdmin(routeCtx, ctx) },
		hello: { permission: "plugins:read", methods: ["POST"], handler: (routeCtx, ctx) => handleHello(routeCtx, ctx) },
	},
	hooks: {
		"plugin:uninstall": async (event, ctx) => {
			if (event.deleteData) await ctx.kv.delete(STATE_KEY);
		},
	},
};

export default plugin;
