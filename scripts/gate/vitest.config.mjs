// The verification gate's heavy runs (engines diff, sizes): not part of `vitest run`, started on purpose with
// `GATE_OUT=<dir> vitest run --config scripts/gate/vitest.config.mjs [file]`.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		root: new URL("../..", import.meta.url).pathname,
		environment: "node",
		include: ["tests/gate/*.gate.ts"],
		testTimeout: 3_600_000,
		hookTimeout: 3_600_000,
		fileParallelism: false,
	},
});
