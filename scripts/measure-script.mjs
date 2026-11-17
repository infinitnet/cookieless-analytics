// Bytes of the page script as embedded in src/client/generated.ts (minified, before the settings are filled in):
// raw, gzip and Brotli at Node's default levels. `--json` prints one JSON object. Used by tests/performance.test.ts.
import { readFileSync } from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";

const src = readFileSync(new URL("../src/client/generated.ts", import.meta.url), "utf8");
const code = Buffer.from(JSON.parse(src.slice(src.indexOf("= ") + 2, src.lastIndexOf(";"))));
const out = { minified: code.length, gzip: gzipSync(code).length, brotli: brotliCompressSync(code).length };
console.log(process.argv.includes("--json") ? JSON.stringify(out) : `page script: ${out.minified} bytes minified, ${out.gzip} gzip, ${out.brotli} Brotli`);
