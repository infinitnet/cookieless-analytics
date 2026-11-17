#!/usr/bin/env node
// Writes docs/settings.md from the descriptor `settingsSchema` (src/settings.ts).
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
	load(url, context, next) {
		return next(url, url.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context);
	},
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { HOST_FORM_POINTER, settingsSchema } = await import("../src/settings.ts");

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const code = (v) => (v === "" ? "empty" : `\`${cell(String(v).replace(/\n/g, "\\n"))}\``);

function range(f) {
	if (f.type === "number") return `${f.min} to ${f.max}`;
	if (f.type === "select") {
		// Long lists (currencies) are summarized.
		return f.options.length > 8 ? `${f.options.length} codes (ISO 4217)` : f.options.map((o) => `\`${o.value}\` (${cell(o.label)})`).join(", ");
	}
	if (f.type === "secret") return "secret, encrypted by the host";
	return "";
}

const rows = Object.entries(settingsSchema).map(
	([key, f]) => `| \`${key}\` | ${f.type} | ${"default" in f ? code(f.default) : "none"} | ${range(f)} | ${cell(f.label)}: ${cell((f.description ?? "").replace(`${HOST_FORM_POINTER} `, ""))} |`,
);

const out = `# Settings

Wiki: [Settings Reference](https://github.com/infinitnet/cookieless-analytics/wiki/Settings-Reference).

Generated from \`settingsSchema\` in \`src/settings.ts\` by \`node scripts/build-settings-doc.mjs\`. Do not edit by hand.

Every setting is edited on the plugin's Settings page in the admin (Analytics, Settings), one section at a time, where each value is checked on save and a refused value is named with its field. The keys below follow the order of its sections: General, Page script, Privacy and exclusions, Sessions and engagement, Revenue, Search, Search connections, Data and capacity, Limits and API. The Search sign-in keys are shown there read only and changed on the Search page. The host's settings form of the plugin lists the same keys in the same order. The host's own settings form saves the whole form: one opened before a Search source was connected, or before another setting changed, writes the old values back when saved (a Google connection turns off and its property empties). Use the plugin's Settings page. Numbers are clamped to their range and an invalid value falls back to the default, so a bad value never stops the plugin. Public paths and the window namespace fall back to their defaults when a value contains a word that blockers look for or collides with another path. Per site overrides of client sites (currency, site search parameters) are set on the Sites tab of Definitions, not here. Annotations have no setting. The exclusions (\`excludePaths\`, \`excludeIpPrefixes\`) and the user agent rules of Definitions keep traffic out from the moment they are saved; to remove what was already counted, use Delete matching visits on the Data page ([privacy.md](privacy.md#deleting-data)).

| Key | Type | Default | Range or options | Meaning |
|---|---|---|---|---|
${rows.join("\n")}
`;

const file = resolve(root, "docs/settings.md");
if (process.argv.includes("--check")) {
	let cur = "";
	try {
		cur = readFileSync(file, "utf8");
	} catch {}
	if (cur !== out) {
		console.error("docs/settings.md is stale; run node scripts/build-settings-doc.mjs");
		process.exit(1);
	}
} else {
	writeFileSync(file, out);
	console.log(`wrote ${file}`);
}
