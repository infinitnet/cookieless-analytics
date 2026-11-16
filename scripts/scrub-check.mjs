#!/usr/bin/env node
// Release scrub: fails when a denied term, a credential pattern or an author site hostname appears in the
// tracked tree, in a tracked file name or (with --history) in any commit of the history.
//
// Usage: SCRUB_DENYLIST_FILE=/tmp/denylist.txt node scripts/scrub-check.mjs [--require] [--history] [--root <dir>]
//   The denylist holds one term per line (case-insensitive substring; `#` starts a comment). It never lives in
//   the repository. Infinitnet is the author name and is allowed: an entry that would match it is refused.
//   The exact author credit and the exact product page URL in ALLOWED are removed from a line before it is
//   scanned, so a denylist term or the hostname pattern still fires on any other form (a path, an address).
//   --require: a missing denylist is an error (CI on main and tags). Without it the built-in patterns still run.
//   --history: also scans every commit message and every patch of `git log --all`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWED_OWNER = "infinitnet";
/** Published on purpose: the copyright holder (LICENSE, NOTICE, package.json) and the product page. */
export const ALLOWED = [/constantin oesterling/gi, /https:\/\/infinitnet\.io\/cookieless-analytics\//gi];

/** Built-in patterns that need no denylist. */
export const PATTERNS = [
	{ name: "api key next to a 32 hex string", re: /api_?key[^a-z0-9\n]{0,8}[0-9a-f]{32}(?![0-9a-f])/i },
	{ name: "32 hex string next to an api key", re: /(?<![0-9a-f])[0-9a-f]{32}[^a-z0-9\n]{0,8}api_?key/i },
	{ name: "Google OAuth client id", re: /\.apps\.googleusercontent\.com/i },
	{ name: "Google OAuth client secret", re: /GOCSPX[-]/ },
	// The author name is allowed, the author's own site hostnames are not (the GitHub account path has no dot after it).
	{ name: "author site hostname", re: /infinitnet\.[a-z]{2,}/i },
];

/** Parses a denylist file; throws on an entry that would match the allowed author name. */
export function parseDenylist(text) {
	const terms = [];
	for (const raw of text.split(/\r?\n/)) {
		const t = raw.replace(/#.*$/, "").trim().toLowerCase();
		if (!t) continue;
		if (ALLOWED_OWNER.includes(t) || t.includes(ALLOWED_OWNER)) {
			throw new Error(`denylist entry "${raw.trim()}" matches the allowed author name Infinitnet; remove it from the denylist`);
		}
		terms.push(t);
	}
	return terms;
}

/** Returns one finding per matching line: `{ where, line, rule }`. */
export function scanText(where, text, terms) {
	const out = [];
	text.split("\n").forEach((raw, i) => {
		const line = ALLOWED.reduce((l, re) => l.replace(re, " "), raw);
		const lower = line.toLowerCase();
		for (const t of terms) if (lower.includes(t)) out.push({ where, line: i + 1, rule: "denylist term" });
		for (const p of PATTERNS) if (p.re.test(line)) out.push({ where, line: i + 1, rule: p.name });
	});
	return out;
}

function git(root, args) {
	return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

export function run(argv, env = process.env) {
	const flag = (f) => argv.includes(f);
	const rootIdx = argv.indexOf("--root");
	const root = resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd());
	const listFile = env.SCRUB_DENYLIST_FILE;
	let terms = [];
	if (listFile && existsSync(listFile)) {
		terms = parseDenylist(readFileSync(listFile, "utf8"));
	} else if (flag("--require")) {
		throw new Error(
			listFile ? `denylist file ${listFile} not found (SCRUB_DENYLIST_FILE)` : "no denylist: set SCRUB_DENYLIST_FILE to a file with one term per line (--require)",
		);
	}
	const findings = [];
	const files = git(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
	for (const f of files) {
		findings.push(...scanText(`${f} (file name)`, f, terms).map((x) => ({ ...x, line: 0 })));
		let buf;
		try {
			buf = readFileSync(resolve(root, f));
		} catch {
			continue;
		}
		if (buf.includes(0)) continue; // binary
		findings.push(...scanText(f, buf.toString("utf8"), terms));
	}
	if (flag("--history")) {
		const hasHead = (() => {
			try {
				git(root, ["rev-parse", "--verify", "HEAD"]);
				return true;
			} catch {
				return false;
			}
		})();
		if (hasHead) {
			// One stream: each commit starts with a marker line carrying its hash, then the message and the patch.
			const log = git(root, ["log", "--all", "-p", "--no-color", "--format=@@scrub-commit %H%n%B"]);
			let commit = "";
			let n = 0;
			for (const line of log.split("\n")) {
				if (line.startsWith("@@scrub-commit ")) {
					commit = line.slice(15, 27);
					n = 0;
					continue;
				}
				n++;
				for (const x of scanText(`commit ${commit}`, line, terms)) findings.push({ ...x, line: n });
			}
		}
	}
	return { findings, terms: terms.length, files: files.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
	try {
		const { findings, terms, files } = run(process.argv.slice(2));
		for (const f of findings) console.error(`${f.where}:${f.line}: ${f.rule}`);
		if (findings.length) {
			console.error(`scrub: ${findings.length} finding(s)`);
			process.exit(1);
		}
		console.log(`scrub: clean (${files} files, ${terms} denylist terms${process.argv.includes("--history") ? ", history included" : ""})`);
	} catch (e) {
		console.error(`scrub: ${e instanceof Error ? e.message : String(e)}`);
		process.exit(2);
	}
}
