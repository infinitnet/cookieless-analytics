#!/usr/bin/env node
// Regenerates the screenshots in one run: bundles the real admin pages with a synthetic API fed by the seeded
// demo data (scripts/dev/seed-demo.mjs, example.com, invented numbers) and opens them in headless Chromium.
// Every shot is dark mode (GitHub is mostly read in a dark theme), 1440 px and 390 px where the page list says so,
// written to docs/wiki/images as a palette PNG of at most 200 KB. scripts/dev/readme-shots.mjs crops the README
// screenshots from these files, so run it after this.
//
// Usage: CHROME_PATH=/path/to/chrome node scripts/dev/capture-wiki-shots.mjs [name-prefix,...]
//   CHROME_PATH      Chromium or Chrome executable (needed unless playwright-core has its own browser installed)
//   PLAYWRIGHT_CORE  path to playwright-core's index.mjs when it is not installed in this repo
//   HOST_CSS         host admin stylesheet; default: dist/styles.css of the @emdash-cms/admin next to emdash
//   OUT              output directory; default docs/wiki/images
// Needs vite, which is installed with vitest, and sharp, which comes with astro.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const harness = join(root, "scripts/dev/wiki-shots");
const out = resolve(process.env.OUT ?? join(root, "docs/wiki/images"));
const filter = process.argv[2]?.split(",");
const MAX_BYTES = 200 * 1024;

// The admin URL state of every shot: the last 4 weeks of the demo data, compared with the 4 weeks before.
const Q = "from=2026-06-03&to=2026-06-30&cmp=previous";
// [file name, admin page, extra query, harness params, widths, tab to click, button to click (the info marker opens its note)]
const SHOTS = [
	["overview", "/", "", {}, [1440, 390]],
	["overview-info", "/", "", {}, [1440], undefined, "About this number"],
	["first-run", "/", "", { firstrun: "1" }, [1440]],
	["sites-all", "/", "&site=all", {}, [1440]],
	["pages", "/pages", "", {}, [1440]],
	["sources", "/sources", "", {}, [1440]],
	["audience", "/audience", "", {}, [1440]],
	["behaviour-goals", "/behaviour", "", {}, [1440], "Goals"],
	["behaviour-funnels", "/behaviour", "", {}, [1440], "Funnels"],
	["revenue", "/revenue", "", {}, [1440]],
	["search-satisfaction", "/satisfaction", "", {}, [1440]],
	["links", "/links", "", {}, [1440]],
	["annotations", "/annotations", "", {}, [1440, 390]],
	["search", "/search", "", {}, [1440, 390]],
	["search-connect", "/search", "", { search: "notconnected" }, [1440]],
	["dashboards", "/dashboards", "", {}, [1440]],
	["dashboard-open", "/dashboards", "&d=abcdefabcdef", {}, [1440, 390]],
	// shortcut: the Definitions page is still registered under /config; change this path when it moves.
	["definitions-goals", "/config", "", {}, [1440], "Goals"],
	["definitions-funnels", "/config", "", {}, [1440], "Funnels"],
	["definitions-sites", "/config", "", {}, [1440], "Sites"],
	["definitions-user-agent-rules", "/config", "", {}, [1440], "User agent rules", "Built-in list"],
	["definitions-user-agent-rules-text", "/config", "", {}, [1440], "User agent rules", /edit as text/i],
	["definitions-api-keys", "/config", "", {}, [1440], "API keys"],
	["settings", "/settings", "", {}, [1440, 390]],
	["data-storage", "/data", "", {}, [1440]],
	["data-storage-postgres", "/data", "", { engine: "postgres" }, [1440]],
	["data-export", "/data", "", {}, [1440], "Export"],
	["data-privacy", "/data", "", {}, [1440], "Privacy receipt"],
	["data-delete", "/data", "", {}, [1440], "Delete", /preview/i],
	["data-move", "/data", "", { engine: "postgres" }, [1440], "Move data"],
];

// Production JSX runtime in the bundle (vite picks the dev runtime otherwise).
process.env.NODE_ENV = "production";
// vite comes with vitest; resolve it from there so this script needs no dependency of its own.
const req = createRequire(createRequire(join(root, "package.json")).resolve("vitest/package.json"));
const vitePkg = req.resolve("vite/package.json");
const vite = await import(pathToFileURL(join(dirname(vitePkg), JSON.parse(readFileSync(vitePkg, "utf8")).exports["."].import ?? "dist/node/index.js")).href);

// sharp comes with astro: a palette PNG keeps a long dark page whole and small.
const sharp = createRequire(createRequire(join(root, "package.json")).resolve("astro/package.json"))("sharp");

const hostCss =
	process.env.HOST_CSS ?? join(realpathSync(join(root, "node_modules/emdash")), "../@emdash-cms/admin/dist/styles.css");
if (!existsSync(hostCss)) throw new Error(`Host stylesheet not found at ${hostCss}; set HOST_CSS`);

// The Settings page reads `settings/get`: answer it with the real route over invented stored values.
const ssr = await vite.createServer({ root, configFile: false, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
let settingsGet;
try {
	const { settingsRoutes } = await ssr.ssrLoadModule("/src/routes/settings.ts");
	const { normalizeSettings } = await ssr.ssrLoadModule("/src/settings.ts");
	const stored = { siteOrigin: "https://example.com", siteTimezone: "Europe/Berlin", defaultCurrency: "EUR", gscAuth: "oauth", gscClientId: "1234.example.com", gscClientSecret: "x", gscRefreshToken: "x", gscProperty: "sc-domain:example.com" };
	const st = { get: async (k) => stored[k] ?? null, set: async () => {}, list: async () => Object.entries(stored).map(([key, value]) => ({ key, value })) };
	settingsGet = await settingsRoutes({ settings: async () => normalizeSettings(stored) })["settings/get"].handler({ input: {}, settings: st });
} finally {
	await ssr.close();
}

const dist = mkdtempSync(join(tmpdir(), "wiki-shots-"));
await vite.build({ root: harness, configFile: false, mode: "production", logLevel: "error", build: { outDir: dist, emptyOutDir: true, minify: false, chunkSizeWarningLimit: 99999 }, define: { "process.env.NODE_ENV": '"production"' } });

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const srv = createServer((rq, res) => {
	const p = new URL(rq.url, "http://x").pathname;
	const f = p === "/host-styles.css" ? hostCss : p.startsWith("/assets/") ? join(dist, p) : join(dist, "index.html");
	res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
	res.end(readFileSync(existsSync(f) ? f : join(dist, "index.html")));
}).listen(0);
const port = srv.address().port;

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(process.env.PLAYWRIGHT_CORE).href : "playwright-core");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const problems = [];
mkdirSync(out, { recursive: true });
try {
	for (const [name, page, q, params, widths, tab, button] of SHOTS) {
		if (filter && !filter.some((f) => name.startsWith(f))) continue;
		for (const w of widths) {
			const file = join(out, `${name}${w === 1440 ? "" : `-${w}`}.png`);
			const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
			const pg = await ctx.newPage();
			pg.on("pageerror", (e) => problems.push(`${name} ${w}: ${e.message}`));
			pg.on("console", (m) => m.type() === "error" && problems.push(`${name} ${w}: console: ${m.text()}`));
			await pg.addInitScript((s) => {
				window.__SETTINGS_GET__ = s;
			}, settingsGet);
			const qs = new URLSearchParams({ page, mode: "dark", q: Q + q, ...params });
			await pg.goto(`http://127.0.0.1:${port}/?${qs}`);
			await pg.waitForTimeout(900);
			const click = async (role, label) => {
				await pg.getByRole(role, { name: label, exact: typeof label === "string" }).first().click({ timeout: 5000 });
				await pg.waitForTimeout(600);
			};
			try {
				if (tab) await click("tab", tab);
				if (button) await click("button", button);
			} catch (e) {
				problems.push(`${name} ${w}: ${e.message.split("\n")[0]}`);
			}
			await pg.mouse.move(0, 0);
			const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
			if (overflow > 0) problems.push(`${name} ${w}: horizontal overflow ${overflow}px`);
			// Full page as a palette PNG, cut at a height that keeps the file small enough for the wiki when it is still too big.
			let height = await pg.evaluate(() => document.documentElement.scrollHeight);
			for (;;) {
				const png = await pg.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: w, height } });
				writeFileSync(file, await sharp(png).png({ palette: true, compressionLevel: 9, effort: 10 }).toBuffer());
				if (statSync(file).size <= MAX_BYTES || height <= 900) break;
				height = Math.round(height * 0.8);
			}
			console.log(`${file} ${w}x${height} ${Math.round(statSync(file).size / 1024)} KB`);
			await ctx.close();
		}
	}
} finally {
	await browser.close();
	srv.close();
	rmSync(dist, { recursive: true, force: true });
}
console.log(problems.length ? problems.join("\n") : "no page errors, no overflow");
process.exitCode = problems.length ? 1 : 0;
