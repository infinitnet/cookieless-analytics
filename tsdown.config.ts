import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/integration.ts", "src/middleware.ts", "src/contract.ts", "src/server.ts", "src/queue.ts", "src/postgres.ts"],
	format: "esm",
	platform: "neutral",
	target: "es2022",
	dts: true,
	clean: true,
	fixedExtension: true,
	external: [/^node:/, "astro", "astro:middleware", "emdash", /^emdash\//, "react", "react/jsx-runtime", "@cloudflare/kumo", "@emdash-cms/blocks", "kysely", "zod", "pg"],
});
