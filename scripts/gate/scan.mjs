// The static scan: skipped or focused tests (the one known opt-in allowed), placeholder branches and
// console.log in src, em and en dashes, the page script and dist sizes, a few docs figures against the code, and
// whether the working tree is clean. Prints a markdown table; writes it to $GATE_OUT/scan.md when set.
// Exit code 1 when a check fails. Run from the repository root: `node scripts/gate/scan.mjs`.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const grep = (files, re) => files.flatMap((f) => readFileSync(f, "utf8").split("\n").flatMap((l, i) => (re.test(l) ? [`${f}:${i + 1}: ${l.trim().slice(0, 140)}`] : [])));
const rows = [];
const check = (name, ok, detail) => rows.push({ name, ok, detail });

const tests = walk("tests").filter((f) => /\.(ts|tsx)$/.test(f));
const src = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));

// The only allowed skip: the local D1 meter, which runs when the optional `miniflare` package is importable.
const OPT_IN = /tests\/capacity-meter\.test\.ts:\d+: describe\.skipIf\(!d1\)/;
const skips = grep(tests, /\.(skip|todo|only)\(|skipIf|runIf|\bxit\(|\bxdescribe\(|\bit\.fails\(/);
const unknown = skips.filter((l) => !OPT_IN.test(l));
check("No skipped, todo or focused tests except the known opt-in", unknown.length === 0, `${skips.length} found: ${skips.join("; ") || "none"}`);

const placeholders = grep(src, /\b(TODO|FIXME|XXX)\b|not implemented/i);
check("No placeholder branches in src (TODO, FIXME, XXX, not implemented)", placeholders.length === 0, placeholders.join("; ") || "none");
const logs = grep(src, /console\.log\(/);
check("No console.log in src", logs.length === 0, logs.join("; ") || "none");

const dashFiles = [...src, ...tests, ...walk("scripts"), ...walk("docs")].filter((f) => /\.(ts|tsx|mjs|md|json)$/.test(f));
const dashes = grep(dashFiles, new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
check("No em or en dashes in src, tests, scripts, docs", dashes.length === 0, dashes.slice(0, 5).join("; ") || "none");

const gen = readFileSync("src/client/generated.ts", "utf8");
const page = JSON.parse(/export const PAGE_SCRIPT: string = (".*");/.exec(gen)[1]);
const gz = gzipSync(page).length;
check("Page script under 3 KB gzipped", gz < 3072, `${page.length} bytes, ${gz} gzipped (budget 3,072)`);
const dist = readdirSync("dist").filter((f) => f.endsWith(".mjs"));
const distBytes = dist.reduce((a, f) => a + statSync(join("dist", f)).size, 0);
const distGz = dist.reduce((a, f) => a + gzipSync(readFileSync(join("dist", f))).length, 0);
const biggest = dist.map((f) => [f, statSync(join("dist", f)).size]).sort((a, b) => b[1] - a[1]).slice(0, 3);
check("dist bundle sizes (recorded)", true, `${dist.length} modules, ${distBytes} bytes, ${distGz} gzipped; largest ${biggest.map(([f, n]) => `${f} ${n}`).join(", ")}`);

// Docs figures the code fixes. A mismatch is reported; the code is the reference.
const limits = readFileSync("docs/limits.md", "utf8");
const rollup = readFileSync("src/query/rollup.ts", "utf8");
const num = (re, text) => Number((re.exec(text)?.[1] ?? "NaN").replaceAll(",", "").replaceAll("_", ""));
const docPerSite = num(/at most (\d+) statements per site/, limits);
const codePerSite = num(/REVENUE_STATEMENTS_PER_SITE = (\d+)/, rollup);
const pairs = /PAIR_ROWS: Record<CapacityProfile, number> = \{ small: ([\d_]+), standard: ([\d_]+), dedicated: ([\d_]+) \}/.exec(rollup)?.slice(1).map((x) => Number(x.replaceAll("_", "")));
const docPairs = /capped at ([\d,]+) rows on `small`, ([\d,]+) on `standard` and ([\d,]+) on `dedicated`/.exec(limits)?.slice(1).map((x) => Number(x.replaceAll(",", "")));
const docs = [
	[`revenue run statements per site: docs ${docPerSite}, code ${codePerSite}`, docPerSite === codePerSite],
	[`pair rows per site and day: docs ${docPairs?.join("/")}, code ${pairs?.join("/")}`, JSON.stringify(docPairs) === JSON.stringify(pairs)],
	[`write latency: docs say "${/Writes take [^.]+\./.exec(limits)?.[0] ?? "(no sentence)"}", production D1 measured about 25 ms per statement end to end`, !/Writes take several milliseconds/.test(limits)],
	[`Free plan figure: docs say "${/The Free plan supports roughly [\d,]+ page views per day/.exec(limits)?.[0] ?? "(none)"}", the plan's measured-pending figure is about 25,000`, !/roughly 15,000/.test(limits)],
];
check("docs/limits.md figures match the code", docs.every(([, ok]) => ok), docs.map(([t, ok]) => `${ok ? "ok" : "MISMATCH"}: ${t}`).join("; "));

const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
	.split("\n")
	.filter((l) => l && !/^\?\? node_modules$/.test(l));
check("git status clean (node_modules symlink aside)", status.length === 0, status.join("; ") || "clean");

const md = ["| Check | Result | Detail |", "|---|---|---|", ...rows.map((r) => `| ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${r.detail.replaceAll("|", "/")} |`), ""].join("\n");
process.stdout.write(md);
if (process.env.GATE_OUT) writeFileSync(join(process.env.GATE_OUT, "scan.md"), md);
process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
