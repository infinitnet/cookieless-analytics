#!/usr/bin/env node
// Writes docs/openapi.json from the zod schemas of the agent API (src/agent/openapi.ts).
// Needs Node type stripping (22.18 or later); `--check` exits 1 when the committed file is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The sources import siblings as `./x.js`; under plain Node those are `./x.ts`.
registerHooks({
	resolve(specifier, context, next) {
		try {
			return next(specifier, context);
		} catch (err) {
			if (specifier.startsWith(".") && specifier.endsWith(".js")) return next(specifier.slice(0, -3) + ".ts", context);
			throw err;
		}
	},
	// Data files are imported without attributes in the sources (the bundler resolves them).
	load(url, context, next) {
		return next(url, url.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context);
	},
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { buildOpenApi } = await import("../src/agent/openapi.ts");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const out = `${JSON.stringify(buildOpenApi(version), null, 2)}\n`;
const file = resolve(root, "docs/openapi.json");
if (process.argv.includes("--check")) {
	let cur = "";
	try {
		cur = readFileSync(file, "utf8");
	} catch {}
	if (cur !== out) {
		console.error("docs/openapi.json is stale; run pnpm openapi");
		process.exit(1);
	}
} else {
	writeFileSync(file, out);
	console.log(`wrote ${file}`);
}
