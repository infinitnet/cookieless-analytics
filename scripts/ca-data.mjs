#!/usr/bin/env node
// ca-data: export the analytics tables of a site to files and import them into a site, through the agent API
// routes data/dump (scope data:export) and data/load (scope data:import). Node 20 or later, no dependency.
//   CA_DATA_KEY=<key> ca-data export --url https://example.com --out <dir> [--site <id>] [--rows <n>]
//   CA_DATA_KEY=<key> ca-data import --url https://example.com --in <dir> [--rows <n>]
// The key is read from CA_DATA_KEY first, --key only when it is not set. It is never written to a file or printed.
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip, createGzip } from "node:zlib";

/** The nine analytics tables, summaries first (a test holds this list to the plugin's). */
export const TABLES = ["ca_rollup", "ca_cube", "ca_revenue_daily", "ca_search_daily", "ca_events", "ca_srv", "ca_drops", "ca_sessions", "ca_aliases"];
const ROUTE = "/_emdash/api/plugins/cookieless-analytics/agent/v1/data/";
/** A load body stays under the 1.2 MB of a dump answer, with room for the envelope. */
const MAX_BODY = 1_200_000 - 4096;
/** Rows per load when --rows is not given; a dump without --rows takes the site's default (50 on the small profile). */
const ROWS = 500;
const SCOPE = { dump: "data:export", load: "data:import" };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A 5xx the caller answers with a smaller chunk instead of the same one again. */
class Halve extends Error {}

/**
 * One POST with retries: 429 waits Retry-After (the rate limit, or the day's rows of a Small site until 00:00 UTC),
 * a network error or 5xx retries 4 times with backoff. With `halve` a 5xx throws `Halve` at once.
 */
async function call(o, name, body, halve = false) {
	for (let attempt = 0; ; attempt++) {
		let res;
		try {
			// No redirects: fetch would forward the X-Api-Key header to another origin.
			res = await o.fetch(`${o.url.replace(/\/+$/, "")}${ROUTE}${name}`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(120_000), headers: { "content-type": "application/json", "x-api-key": o.key }, body: JSON.stringify(body) });
		} catch (err) {
			if (attempt < 4) {
				await o.sleep(1000 * 2 ** attempt);
				continue;
			}
			throw new Error(`data/${name}: ${err instanceof Error ? err.message : String(err)}`);
		}
		if (res.ok) return res;
		const text = await res.text().catch(() => "");
		if (res.status === 429 && attempt < 30) {
			const s = Number(res.headers.get("retry-after")) || 5;
			if (s > 60) o.log(`data/${name}: the site takes no more rows today; waiting ${Math.ceil(s / 60)} min, until 00:00 UTC.`);
			await o.sleep(1000 * s);
			continue;
		}
		if (res.status >= 500 && halve) throw new Halve(`data/${name}: ${res.status}`);
		if (res.status >= 500 && attempt < 4) {
			await o.sleep(1000 * 2 ** attempt);
			continue;
		}
		if (res.status === 404) throw new Error(`data/${name}: 404. The key is wrong, revoked or expired, lacks the scope ${SCOPE[name]}, or may not use this site; or the URL is not the site's.`);
		let msg = text.slice(0, 500);
		try {
			const j = JSON.parse(text);
			msg = `${j.error}: ${j.message}`;
		} catch {}
		throw new Error(`data/${name}: ${res.status} ${msg}`);
	}
}

function options(opts) {
	const o = { fetch: globalThis.fetch, sleep: wait, log: console.log, ...opts };
	if (o.rows !== undefined && !(Number.isInteger(o.rows) && o.rows >= 1 && o.rows <= 1000)) throw new Error("--rows must be a whole number from 1 to 1000");
	// The key travels in a header: plain http only to this machine.
	if (o.url && !/^https:\/\//.test(o.url) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(o.url)) throw new Error("--url must start with https:// (http:// only for localhost)");
	return o;
}

export async function sha256File(file) {
	const h = createHash("sha256");
	for await (const b of createReadStream(file)) h.update(b);
	return h.digest("hex");
}

function writeJson(file, value) {
	writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
	renameSync(`${file}.tmp`, file);
}

/** Writes `<table>.ndjson.gz` per table and `manifest.json` into `out`. */
export async function exportData(opts) {
	const o = options(opts);
	if (!o.url || !o.key || !o.out) throw new Error("export needs --url, --out and a key (CA_DATA_KEY or --key)");
	mkdirSync(o.out, { recursive: true });
	// A broken export must not leave an older manifest next to new files.
	for (const f of ["manifest.json", "progress.json"]) rmSync(join(o.out, f), { force: true });
	const files = {};
	let layout = null;
	let engine = null;
	for (const table of TABLES) {
		const file = `${table}.ndjson.gz`;
		const gz = createGzip();
		const done = pipeline(gz, createWriteStream(join(o.out, file)));
		let cursor = null;
		let rows = 0;
		/** Rows asked per call: --rows, else the site's default; fewer after an answer cut by bytes, half after a 5xx. */
		let limit = o.rows;
		for (;;) {
			let res;
			try {
				res = await call(o, "dump", { table, cursor, ...(limit ? { limit } : {}), ...(o.site ? { site: o.site } : {}) }, limit !== 1);
			} catch (err) {
				if (!(err instanceof Halve)) throw err;
				// Before the first answer the site's default is unknown: half of the smallest (50).
				limit = Math.ceil((limit ?? 50) / 2);
				continue;
			}
			const l = Number(res.headers.get("x-layout"));
			if (layout !== null && l !== layout) throw new Error(`the site changed its table layout during the export (${layout} to ${l})`);
			layout = l;
			engine ??= res.headers.get("x-engine");
			const text = await res.text();
			let lines = 0;
			for (const ch of text) if (ch === "\n") lines++;
			rows += lines;
			if (text && !gz.write(text)) await once(gz, "drain");
			const next = res.headers.get("x-next-cursor");
			cursor = next ? JSON.parse(decodeURIComponent(next)) : null;
			// An answer with a next cursor holds the most rows that fit: ask for no more than that next time.
			if (!cursor) break;
			if (lines) limit = Math.min(limit ?? lines, lines);
		}
		gz.end();
		await done;
		files[table] = { file, rows, sha256: await sha256File(join(o.out, file)) };
		o.log(`${table}: ${rows} rows`);
	}
	const manifest = { layout, engine, site: o.site ?? null, createdAt: new Date().toISOString(), files };
	writeJson(join(o.out, "manifest.json"), manifest);
	return manifest;
}

/** The manifest of `dir`, refused unless every table has a file entry of the expected shape. */
function readManifest(dir) {
	const text = readFileSync(join(dir, "manifest.json"), "utf8");
	const m = JSON.parse(text);
	if (!m || !Number.isInteger(m.layout) || m.layout < 1) throw new Error("manifest.json has no valid layout");
	for (const t of TABLES) {
		const f = m.files?.[t];
		if (!f || f.file !== `${t}.ndjson.gz` || !Number.isInteger(f.rows) || f.rows < 0 || !/^[0-9a-f]{64}$/.test(f.sha256 ?? "")) throw new Error(`manifest.json has no valid entry for ${t}`);
	}
	return { m, fingerprint: createHash("sha256").update(text).digest("hex") };
}

/**
 * Checks the manifest and every file's sha256, posts the rows in chunks (progress.json lets a broken run resume at
 * the failed chunk), then compares row counts. Returns per table the file rows, the rows inserted and the
 * destination's count; `short` lists tables where the destination has fewer rows than the file.
 */
export async function importData(opts) {
	const o = options(opts);
	const dir = o.in;
	if (!o.url || !o.key || !dir) throw new Error("import needs --url, --in and a key (CA_DATA_KEY or --key)");
	const { m, fingerprint } = readManifest(dir);
	for (const t of TABLES) {
		const f = m.files[t];
		if ((await sha256File(join(dir, f.file))) !== f.sha256) throw new Error(`${f.file} does not match the sha256 of manifest.json: the file is corrupted or was changed. Nothing was imported.`);
	}
	const site = m.site ? { site: m.site } : {};
	// The site refuses another layout before any row is written.
	await call(o, "load", { ...site, layout: m.layout, table: TABLES[0], rows: [] });
	const progressFile = join(dir, "progress.json");
	let progress = existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, "utf8")) : null;
	// Progress of another export or another destination starts over.
	if (progress?.manifest !== fingerprint || progress?.url !== o.url) progress = { manifest: fingerprint, url: o.url, done: {}, inserted: {} };
	const result = {};
	/** Rows per load: --rows or 500, halved for the rest of the run after a 5xx. */
	let size = o.rows ?? ROWS;
	/** Posts `rows`; after a 5xx in pieces of half the size. progress.json counts the rows done per table. */
	const send = async (t, rows) => {
		let res;
		try {
			res = await call(o, "load", { ...site, layout: m.layout, table: t, rows }, rows.length > 1);
		} catch (err) {
			if (!(err instanceof Halve)) throw err;
			size = Math.min(size, Math.ceil(rows.length / 2));
			// Pieces of the current size: a later failure inside shrinks the pieces after it too.
			for (let i = 0; i < rows.length; ) {
				const part = rows.slice(i, i + size);
				await send(t, part);
				i += part.length;
			}
			return;
		}
		const { data } = await res.json();
		progress.done[t] = (progress.done[t] ?? 0) + rows.length;
		progress.inserted[t] = (progress.inserted[t] ?? 0) + (data?.inserted ?? 0);
		writeJson(progressFile, progress);
	};
	for (const t of TABLES) {
		const f = m.files[t];
		const skip = progress.done[t] ?? 0;
		let batch = [];
		let bytes = 0;
		let lines = 0;
		const flush = async () => {
			await send(t, batch);
			batch = [];
			bytes = 0;
		};
		const rl = createInterface({ input: createReadStream(join(dir, f.file)).pipe(createGunzip()), crlfDelay: Infinity });
		for await (const line of rl) {
			if (!line) continue;
			// Rows a broken run already loaded.
			if (lines++ < skip) continue;
			const n = Buffer.byteLength(line) + 1;
			if (batch.length && (batch.length >= size || bytes + n > MAX_BODY)) await flush();
			batch.push(JSON.parse(line));
			bytes += n;
		}
		if (batch.length) await flush();
		if (lines !== f.rows) throw new Error(`${f.file} holds ${lines} rows, manifest.json says ${f.rows}`);
		result[t] = { rows: f.rows, inserted: progress.inserted[t] ?? 0 };
	}
	const short = [];
	for (const t of TABLES) {
		const { data } = await (await call(o, "load", { ...site, layout: m.layout, table: t, rows: [] })).json();
		result[t].total = Number(data?.total);
		if (!(result[t].total >= result[t].rows)) short.push(t);
		o.log(`${t}: ${result[t].rows} rows in the file, ${result[t].inserted} inserted, ${result[t].total} in the site`);
	}
	rmSync(progressFile, { force: true });
	return { tables: result, inserted: Object.values(result).reduce((s, r) => s + r.inserted, 0), short };
}

const KNOWN = { export: ["url", "key", "out", "site", "rows"], import: ["url", "key", "in", "rows"] };

/** `--name value` or `--name=value` pairs. Errors name the option only, never a value (it may be the key). */
export function args(cmd, argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith("--")) throw new Error(`unexpected argument at position ${i + 1}; options are --${KNOWN[cmd].join(", --")}`);
		const eq = a.indexOf("=");
		const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
		if (!KNOWN[cmd].includes(name)) throw new Error(`unknown option for ${cmd}; options are --${KNOWN[cmd].join(", --")}`);
		const v = eq < 0 ? argv[++i] : a.slice(eq + 1);
		if (!v || (eq < 0 && v.startsWith("--"))) throw new Error(`--${name} needs a value`);
		out[name] = v;
	}
	return out;
}

const USAGE = `Usage:
  CA_DATA_KEY=<key> ca-data export --url <site url> --out <dir> [--site <id>] [--rows <n>]
  CA_DATA_KEY=<key> ca-data import --url <site url> --in <dir> [--rows <n>]
The key is read from the CA_DATA_KEY environment variable. --key <key> is used only when CA_DATA_KEY is not set:
a key on the command line shows in the process list and the shell history. The key is never printed.
The key needs the scope data:export (export) or data:import (import).
--rows: rows per call, 1 to 1000. Default: the site's own for an export (50 on the small profile, else 500), 500 for
an import; use --rows 50 to import into a site on the small profile. After a server error the CLI halves it.`;

/** The key: CA_DATA_KEY first, --key only as the fallback. */
export const keyOf = (a, env) => env.CA_DATA_KEY || a.key;

async function main() {
	const [cmd, ...rest] = process.argv.slice(2);
	if (cmd === "--help" || cmd === "-h" || cmd === "help" || rest.includes("--help")) {
		console.log(USAGE);
		return;
	}
	if (cmd !== "export" && cmd !== "import") {
		console.error(USAGE);
		process.exitCode = 2;
		return;
	}
	const a = args(cmd, rest);
	const key = keyOf(a, process.env);
	const rows = a.rows === undefined ? undefined : Number(a.rows);
	if (cmd === "export") {
		const m = await exportData({ url: a.url, key, out: a.out, site: a.site, rows });
		console.log(`Wrote ${Object.keys(m.files).length} files and manifest.json to ${a.out}.`);
		return;
	}
	const r = await importData({ url: a.url, key, in: a.in, rows });
	console.log(`Inserted ${r.inserted} rows.`);
	if (r.short.length) {
		console.error(`The site holds fewer rows than the files in: ${r.short.join(", ")}.`);
		process.exitCode = 1;
	}
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : String(err));
		process.exitCode = 1;
	});
}
