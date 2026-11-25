#!/usr/bin/env node
// Builds src/data/agents.json from src/data/agents.curated.json plus two MIT data sources:
// ai.robots.txt robots.json and crawler-user-agents.json. Matomo device-detector (LGPL) is never used.
// Inputs are read from AGENT_DATA_CACHE (default .cache/agent-data) when present, otherwise fetched
// and cached. `--refresh` forces a fetch. AGENT_DATA_OUT redirects the output tree (tests). Same inputs always give byte-identical output.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSafeRegex } from "../src/query/safe-regex.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = resolve(root, process.env.AGENT_DATA_CACHE || ".cache/agent-data");
const outDir = resolve(root, process.env.AGENT_DATA_OUT || ".");
const refresh = process.argv.includes("--refresh");
// Copy rule of this repository: no em or en dashes, even in upstream text.
const noDash = (s) => String(s).replace(/[\u2013\u2014]/g, "-");

const SOURCES = {
	"ai.robots.txt": {
		file: "robots.json",
		url: "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json",
		license: "ai-robots-LICENSE",
		licenseUrl: "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/LICENSE",
		home: "https://github.com/ai-robots-txt/ai.robots.txt",
	},
	"crawler-user-agents": {
		file: "crawler-user-agents.json",
		url: "https://raw.githubusercontent.com/monperrus/crawler-user-agents/master/crawler-user-agents.json",
		license: "crawler-user-agents-LICENSE",
		licenseUrl: "https://raw.githubusercontent.com/monperrus/crawler-user-agents/master/LICENSE",
		home: "https://github.com/monperrus/crawler-user-agents",
	},
};

// Modern browser UAs that no generated rule may match.
const HUMAN_GUARD = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
	"Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0]",
].map((u) => u.toLowerCase());

const TAG_CATEGORY = {
	"search-engine": "search_engine",
	"ai-crawler": "ai_training",
	advertising: "ads_verification",
	"feed-reader": "feed_reader",
	"http-library": "headless_automation",
	"browser-automation": "headless_automation",
	"social-preview": "social_preview",
	archiver: "archiver",
	seo: "seo_tool",
	monitoring: "monitoring",
	scanner: "security_scanner",
	academic: "scraper_generic",
};

async function input(name, kind) {
	const src = SOURCES[name];
	const file = join(cacheDir, src[kind === "data" ? "file" : "license"]);
	if (!refresh && existsSync(file)) return readFileSync(file, "utf8");
	const url = kind === "data" ? src.url : src.licenseUrl;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	const text = await res.text();
	mkdirSync(cacheDir, { recursive: true });
	writeFileSync(file, text);
	return text;
}

const slug = (s) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48) || "agent";

/** Longest literal run that every match must contain (lowercase), or undefined. */
export function literalHint(pattern) {
	let depth = 0;
	let run = "";
	let best = "";
	const flush = () => {
		if (run.length > best.length) best = run;
		run = "";
	};
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];
		const next = pattern[i + 1];
		const optional = next === "?" || next === "*" || next === "{";
		if (c === "\\") {
			const e = pattern[i + 1];
			i++;
			const after = pattern[i + 1];
			const opt = after === "?" || after === "*" || after === "{";
			if (depth === 0 && e && /[^a-zA-Z0-9]/.test(e) && !opt) run += e;
			else flush();
			continue;
		}
		if (c === "(" || c === "[") {
			flush();
			depth++;
			continue;
		}
		if (c === ")" || c === "]") {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (c === "|" && depth === 0) return undefined;
		if (depth > 0) continue;
		if (/[.^$+*?{}]/.test(c)) {
			flush();
			continue;
		}
		if (optional) {
			flush();
			continue;
		}
		run += c;
	}
	flush();
	// A trailing `+` keeps its char mandatory, so the run is still a valid substring.
	const lit = best.toLowerCase();
	return lit.length >= 3 ? lit : undefined;
}

function matcher(rules) {
	const compiled = rules.map((r) =>
		r.match.mode === "contains" ? (ua) => ua.includes(r.match.pattern) : ((re) => (ua) => re.test(ua))(new RegExp(r.match.pattern, "i")),
	);
	return (ua) => compiled.some((f) => f(ua));
}

function cleanOperator(op) {
	const text = noDash(op || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
	const url = /\]\((https?:\/\/[^)\s]+)\)/.exec(String(op || ""))?.[1];
	return { operator: text.slice(0, 80) || "Unknown", docs: url };
}

function aiCategory(fn) {
	const f = String(fn || "").toLowerCase();
	if (f.includes("search")) return "ai_search";
	if (/assistant|agent|user-initiated|user prompts|user queries/.test(f)) return "ai_assistant";
	return "ai_training";
}

async function main() {
	const curated = JSON.parse(readFileSync(join(root, "src/data/agents.curated.json"), "utf8")).map((r) => ({ ...r, source: "curated" }));
	const agents = [...curated];
	const ids = new Set(agents.map((a) => a.id));
	const uniqueId = (base) => {
		let id = base;
		for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
		ids.add(id);
		return id;
	};
	let covered = matcher(agents);

	const robots = JSON.parse(await input("ai.robots.txt", "data"));
	for (const name of Object.keys(robots).sort()) {
		if (name.startsWith("__")) continue;
		const pattern = name.toLowerCase().trim();
		if (pattern.length < 4 || covered(pattern)) continue;
		if (HUMAN_GUARD.some((u) => u.includes(pattern))) continue;
		const meta = robots[name] || {};
		const { operator, docs } = cleanOperator(meta.operator);
		const rec = { id: uniqueId(slug(name)), name: noDash(name), operator, category: aiCategory(meta.function), match: { mode: "contains", pattern } };
		if (docs) rec.docs = docs;
		rec.source = "ai.robots.txt";
		agents.push(rec);
	}
	covered = matcher(agents);

	const cua = JSON.parse(await input("crawler-user-agents", "data"));
	let skippedUnsafe = 0;
	for (const entry of cua) {
		const pattern = String(entry.pattern || "");
		if (!validateSafeRegex(pattern, "i").ok) {
			skippedUnsafe++;
			continue;
		}
		const re = new RegExp(pattern, "i");
		if (HUMAN_GUARD.some((u) => re.test(u))) continue;
		const instances = (entry.instances || []).map((u) => String(u).toLowerCase());
		if (instances.length > 0 && instances.every((u) => covered(u))) continue;
		const name = pattern.replace(/\\(.)/g, "$1").replace(/[\^$()|?*+[\]{}]/g, " ").replace(/\s+/g, " ").trim() || pattern;
		const category = TAG_CATEGORY[(entry.tags || [])[0]] || "unknown_bot";
		const match = { mode: "regex", pattern };
		const lit = literalHint(pattern);
		if (lit) match.lit = lit;
		const rec = { id: uniqueId(`cua-${slug(name)}`), name: name.slice(0, 80), operator: "Unknown", category, match };
		if (typeof entry.url === "string" && /^https?:\/\//.test(entry.url)) rec.docs = entry.url;
		rec.source = "crawler-user-agents";
		agents.push(rec);
	}

	const dataOut = join(outDir, "src/data");
	mkdirSync(dataOut, { recursive: true });
	writeFileSync(join(dataOut, "agents.json"), `${JSON.stringify(agents, null, "\t")}\n`);

	const notices = [
		"# Third party notices",
		"",
		"Cookieless Analytics by Infinitnet is Copyright 2026 Constantin Oesterling (Infinitnet) and licensed under Apache-2.0 (see LICENSE and NOTICE). The data sources below keep their own licenses, reproduced here.",
		"",
		"`src/data/agents.json` is generated by `scripts/build-agent-data.mjs` from the curated list in this repository and the following data sources.",
		"",
	];
	for (const [name, src] of Object.entries(SOURCES)) {
		const license = noDash(await input(name, "license")).trim();
		notices.push(`## ${name}`, "", `Source: ${src.home}`, "", "```", license, "```", "");
	}
	writeFileSync(join(outDir, "THIRD_PARTY_NOTICES.md"), notices.join("\n"));
	const count = (s) => agents.filter((a) => a.source === s).length;
	console.log(
		`agents.json: ${agents.length} rules (curated ${count("curated")}, ai.robots.txt ${count("ai.robots.txt")}, crawler-user-agents ${count("crawler-user-agents")}, unsafe skipped ${skippedUnsafe})`,
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
