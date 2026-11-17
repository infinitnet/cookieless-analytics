#!/usr/bin/env node
// Writes the README screenshots into docs/readme: the top 1440 x 800 of each wiki screenshot (dark mode, written by
// scripts/dev/capture-wiki-shots.mjs), as a palette PNG under 150 KB, so a full-page shot does not fill the README
// with one tall image. Re-run this after every recapture.
//
// Usage: [SRC=/dir/with/the/captures] node scripts/dev/readme-shots.mjs [dir]
//   SRC or dir  the capture directory; default docs/wiki/images (the capture script's default OUT)
// Needs sharp, which comes with astro (resolved the same way capture-wiki-shots.mjs does).
import { existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sharp = createRequire(createRequire(join(root, "package.json")).resolve("astro/package.json"))("sharp");
const src = resolve(process.argv[2] ?? process.env.SRC ?? join(root, "docs/wiki/images"));
const out = join(root, "docs/readme");
const W = 1440;
const H = 800;
const MAX_BYTES = 150 * 1024;
// The README names these files; each crop keeps the source's name.
const SHOTS = ["overview", "revenue", "search-satisfaction", "annotations", "search", "dashboard-open", "behaviour-funnels", "settings", "sites-all"];

mkdirSync(out, { recursive: true });
for (const name of SHOTS) {
	if (!existsSync(join(src, `${name}.png`))) throw new Error(`${join(src, `${name}.png`)} is missing; run node scripts/dev/capture-wiki-shots.mjs first (or pass the capture directory as SRC)`);
	const file = join(out, `${name}.png`);
	const { width = 0, height = 0 } = await sharp(join(src, `${name}.png`)).metadata();
	if (width !== W || height < H) throw new Error(`${name}.png is ${width} x ${height}; expected ${W} wide and at least ${H} tall`);
	await sharp(join(src, `${name}.png`))
		.extract({ left: 0, top: 0, width: W, height: H })
		.png({ palette: true, compressionLevel: 9, effort: 10 })
		.toFile(file);
	const size = statSync(file).size;
	if (size > MAX_BYTES) throw new Error(`${file} is ${size} bytes, over ${MAX_BYTES}`);
	console.log(`${name}.png ${Math.round(size / 1024)} KB`);
}
