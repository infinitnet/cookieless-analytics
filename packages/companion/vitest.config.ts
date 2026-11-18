import { emdashPluginTest } from "@emdash-cms/plugin-test/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [emdashPluginTest()],
	test: {
		// The host builds the plugin and starts workerd before the first test.
		testTimeout: 60000,
		hookTimeout: 60000,
	},
});
