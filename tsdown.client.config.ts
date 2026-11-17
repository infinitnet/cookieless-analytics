import { defineConfig } from "tsdown";

// Page script: one dependency-free IIFE, embedded into src/client/generated.ts by scripts/embed-client.mjs.
export default defineConfig({
	entry: { "page-script": "src/client/page-script.ts" },
	format: "iife",
	platform: "browser",
	target: "es2017",
	outDir: ".cache/client",
	minify: true,
	dts: false,
	clean: true,
});
