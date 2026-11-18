import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.{ts,tsx}"],
		setupFiles: ["tests/setup.ts"],
		// Slow CI runners: the default 5 s per test timed out under load.
		testTimeout: 30000,
		hookTimeout: 30000,
	},
});
