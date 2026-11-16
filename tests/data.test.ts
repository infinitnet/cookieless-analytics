import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_CATEGORIES, AGENTS } from "../src/agents/rules.js";
import { BUILTIN_CHANNEL_RULES, DEFAULT_HOSTS } from "../src/core/channels.js";
import { validateSafeRegex } from "../src/query/safe-regex.js";
import curated from "../src/data/agents.curated.json";

const ALLOWED_SOURCES = ["curated", "ai.robots.txt", "crawler-user-agents"];

describe("agents.json", () => {
	it("has well-formed records with unique ids", () => {
		expect(AGENTS.length).toBeGreaterThan(300);
		const ids = new Set<string>();
		for (const a of AGENTS) {
			expect(a.id, JSON.stringify(a)).toMatch(/^[a-z0-9-]{1,64}$/);
			expect(ids.has(a.id), a.id).toBe(false);
			ids.add(a.id);
			expect(typeof a.name).toBe("string");
			expect(typeof a.operator).toBe("string");
			expect(AGENT_CATEGORIES).toContain(a.category);
			expect(ALLOWED_SOURCES).toContain(a.source);
			if (a.docs) expect(a.docs).toMatch(/^https?:\/\//);
			if (a.match.mode === "contains") expect(a.match.pattern).toBe(a.match.pattern.toLowerCase());
			else expect(a.match.mode).toBe("regex");
		}
	});

	it("never carries LGPL data", () => {
		const text = readFileSync("src/data/agents.json", "utf8").toLowerCase();
		expect(text).not.toContain("matomo");
		expect(text).not.toContain("device-detector");
		expect(AGENTS.every((a) => ALLOWED_SOURCES.includes(a.source))).toBe(true);
	});

	it("only ships regexes that pass the safe-regex validator", () => {
		for (const a of AGENTS) if (a.match.mode === "regex") expect(validateSafeRegex(a.match.pattern, "i"), a.match.pattern).toEqual({ ok: true });
	});

	it("keeps the curated list first and intact", () => {
		expect(AGENTS.slice(0, curated.length).map((a) => a.id)).toEqual(curated.map((c) => c.id));
	});

	it("regenerates deterministically from the same inputs", () => {
		const out1 = mkdtempSync(join(tmpdir(), "agents-"));
		const out2 = mkdtempSync(join(tmpdir(), "agents-"));
		try {
			for (const out of [out1, out2])
				execFileSync(process.execPath, ["scripts/build-agent-data.mjs"], { env: { ...process.env, AGENT_DATA_CACHE: "tests/fixtures/agent-data", AGENT_DATA_OUT: out }, stdio: "pipe" });
			const a = readFileSync(join(out1, "src/data/agents.json"), "utf8");
			expect(readFileSync(join(out2, "src/data/agents.json"), "utf8")).toBe(a);
			expect(readFileSync(join(out2, "THIRD_PARTY_NOTICES.md"), "utf8")).toBe(readFileSync(join(out1, "THIRD_PARTY_NOTICES.md"), "utf8"));
			const parsed = JSON.parse(a) as { source: string; id: string }[];
			expect(parsed.some((r) => r.source === "ai.robots.txt")).toBe(true);
			expect(parsed.some((r) => r.source === "crawler-user-agents")).toBe(true);
			expect(parsed.some((r) => r.id.startsWith("__"))).toBe(false);
			expect(readFileSync(join(out1, "THIRD_PARTY_NOTICES.md"), "utf8")).toContain("MIT License");
			// The committed file is this generator's output (the header names our own licence, the sources keep theirs).
			expect(readFileSync(join(out1, "THIRD_PARTY_NOTICES.md"), "utf8").split("## ")[0]).toBe(readFileSync("THIRD_PARTY_NOTICES.md", "utf8").split("## ")[0]);
			expect(readFileSync("THIRD_PARTY_NOTICES.md", "utf8")).toContain("licensed under Apache-2.0");
		} finally {
			rmSync(out1, { recursive: true, force: true });
			rmSync(out2, { recursive: true, force: true });
		}
	});
});

describe("hosts.json and channels.json", () => {
	it("host lists are lowercase hostnames without duplicates", () => {
		for (const [name, list] of Object.entries(DEFAULT_HOSTS)) {
			expect(new Set(list).size, name).toBe(list.length);
			for (const h of list) {
				expect(h, name).toBe(h.toLowerCase());
				expect(h, name).toMatch(/^[a-z0-9.-]+(\.\*)?$/);
			}
		}
		expect(Object.keys(DEFAULT_HOSTS).sort()).toEqual(["ai", "ignore", "search", "shopping", "social", "video", "webmail"]);
	});

	it("covers the known AI assistant hosts", () => {
		for (const h of ["chatgpt.com", "chat.openai.com", "perplexity.ai", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "you.com", "phind.com", "meta.ai", "grok.com", "deepseek.com", "chat.mistral.ai", "poe.com", "duck.ai"])
			expect(DEFAULT_HOSTS.ai).toContain(h);
	});

	it("channel rules have unique ids, valid lists and compilable regexes", () => {
		const ids = BUILTIN_CHANNEL_RULES.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
		const lists = Object.keys(DEFAULT_HOSTS);
		for (const r of BUILTIN_CHANNEL_RULES) {
			for (const c of r.any) {
				for (const l of [c.list, c.refList, c.adsSource]) if (l) expect(lists).toContain(l);
				for (const p of [c.medium, c.source, c.campaign]) if (p) expect(() => new RegExp(p, "i")).not.toThrow();
			}
		}
		expect(ids.at(-2)).toBe("direct");
	});
});
