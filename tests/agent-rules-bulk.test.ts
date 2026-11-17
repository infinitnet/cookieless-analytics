/** User agent rules as text: line parser, diff, the bulk and built-in routes, the 500-rule cap, the indexed classifier. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createClassifier } from "../src/agents/classify.js";
import { BROWSER_UAS, browserWarnings, builtinOverride, diffRules, formatRules, type LineRule, parseRuleLines, RULE_TEXT } from "../src/agents/lines.js";
import { AGENTS, type CompiledRule, compileBuiltins, compileUserRules, MAX_USER_RULES, type UserAgentRule } from "../src/agents/rules.js";
import { createPlugin } from "../src/index.js";
import { AGENT_RULES_KEY } from "../src/agents/stored.js";
import { type ConfigCtx, configRoutes } from "../src/routes/config.js";
import fixtures from "./fixtures/uas.json";

/** Host-like collection: `where` equality, creation order then id, cursor paging of at most 100, putMany and deleteMany. */
function pagedColl() {
	let seq = 0;
	const items = new Map<string, { data: unknown; at: number }>();
	let writes = 0;
	// D1 statements of the current invocation, against a per-invocation budget (`invocation(n)` starts one).
	let statements = 0;
	let budget = Number.POSITIVE_INFINITY;
	const stmt = () => {
		if (++statements > budget) throw new Error("D1_ERROR: Too many API requests by single worker invocation.");
	};
	return {
		items,
		writes: () => writes,
		statements: () => statements,
		/** One more statement of the invocation (the options KV write goes to the same database). */
		stmt,
		invocation(n: number) {
			statements = 0;
			budget = n;
		},
		async query(o: { where?: Record<string, unknown>; limit?: number; cursor?: string } = {}) {
			const all = [...items]
				.filter(([, v]) => Object.entries(o.where ?? {}).every(([k, x]) => (v.data as Record<string, unknown>)[k] === x))
				.sort(([a, x], [b, y]) => x.at - y.at || (a < b ? -1 : 1));
			stmt();
			const from = Number(o.cursor ?? 0);
			const limit = Math.min(o.limit ?? 50, 100);
			return { items: all.slice(from, from + limit).map(([id, v]) => ({ id, data: v.data })), hasMore: all.length > from + limit, cursor: String(from + limit) };
		},
		async get(id: string) {
			return items.get(id)?.data ?? null;
		},
		async put(id: string, data: unknown) {
			writes++;
			items.set(id, { data, at: items.get(id)?.at ?? seq++ });
		},
		async delete(id: string) {
			writes++;
			return items.delete(id);
		},
		async putMany(rows: Array<{ id: string; data: unknown }>) {
			const at = seq++;
			for (const r of rows) {
				stmt();
				writes++;
				items.set(r.id, { data: r.data, at: items.get(r.id)?.at ?? at });
			}
		},
		async deleteMany(ids: string[]) {
			for (let i = 0; i < ids.length; i += 100) stmt();
			let n = 0;
			for (const id of ids) if (items.delete(id)) n++;
			writes += ids.length;
			return n;
		},
	};
}

const CHROME = BROWSER_UAS[0] as string;

describe("rule lines", () => {
	it("parses every mode and action, comments, blank lines and spaces inside a pattern", () => {
		const p = parseRuleLines(["# header", "", "bot contains examplebot", "human prefix Example App/ # Our app", "bot exact   exact ua with spaces  ", "bot regex ^examplefetcher/\\d+ # Fetcher", "  # indented comment"].join("\n"));
		expect(p.errors).toEqual([]);
		expect(p.rules).toEqual([
			{ action: "robot", mode: "contains", pattern: "examplebot", line: 3 },
			{ action: "human", mode: "prefix", pattern: "Example App/", name: "Our app", line: 4 },
			{ action: "robot", mode: "exact", pattern: "exact ua with spaces", line: 5 },
			{ action: "robot", mode: "regex", pattern: "^examplefetcher/\\d+", name: "Fetcher", line: 6 },
		]);
	});

	it("reports errors with line numbers", () => {
		const long = "x".repeat(513);
		const p = parseRuleLines(["bot contains ok", "robot contains a", "bot glob b", "bot contains", `bot contains ${long}`, "bot regex (a+)+", "bot contains OK", `bot contains c # ${"n".repeat(65)}`].join("\n"));
		expect(p.errors).toEqual([
			{ line: 2, message: RULE_TEXT.action("robot") },
			{ line: 3, message: RULE_TEXT.mode("glob") },
			{ line: 4, message: RULE_TEXT.shape },
			{ line: 5, message: RULE_TEXT.long },
			{ line: 6, message: expect.stringMatching(/^Unsafe or invalid regex/) as unknown as string },
			{ line: 7, message: RULE_TEXT.duplicate(1) },
			{ line: 8, message: RULE_TEXT.name },
		]);
		expect(p.rules.map((r) => r.line)).toEqual([1]);
	});

	it("treats a different mode or a different regex case as a different rule", () => {
		expect(parseRuleLines("bot contains a1\nbot prefix a1\nbot regex Ab\nbot regex ab").errors).toEqual([]);
	});

	it("refuses rule 501 and regex rule 51", () => {
		const lines = Array.from({ length: MAX_USER_RULES + 1 }, (_, i) => `bot contains examplebot${i}`);
		expect(parseRuleLines(lines.join("\n")).errors).toEqual([{ line: 501, message: RULE_TEXT.total }]);
		const re = Array.from({ length: 51 }, (_, i) => `bot regex ^examplebot${i}/`);
		expect(parseRuleLines(re.join("\n")).errors).toEqual([{ line: 51, message: RULE_TEXT.regexCap }]);
	});

	it("warns when a bot rule matches a current browser, like the data generator", () => {
		const p = parseRuleLines("bot contains mozilla\nhuman contains mozilla/5.0 (x11\nbot regex Safari/\\d+\nbot contains examplebot");
		expect(browserWarnings(p.rules).map((w) => w.line)).toEqual([1, 3]);
		expect(p.errors).toEqual([]);
		const script = readFileSync("scripts/build-agent-data.mjs", "utf8");
		for (const ua of BROWSER_UAS) expect(script).toContain(ua);
	});

	it("export then import gives the same text and the same rules", () => {
		const rules: LineRule[] = [
			{ action: "robot", mode: "contains", pattern: "examplebot" },
			{ action: "human", mode: "prefix", pattern: "Example App/ 2", name: "Our app" },
			{ action: "robot", mode: "regex", pattern: "^x[0-9]{2}$" },
			{ action: "robot", mode: "exact", pattern: "a#b" },
		];
		const text = formatRules(rules);
		const back = parseRuleLines(text).rules.map(({ line: _l, ...r }) => r);
		expect(back).toEqual(rules);
		expect(formatRules(back)).toBe(text);
	});
});

describe("rule diff", () => {
	const row = (id: string, data: LineRule) => ({ id, data });
	it("counts added, changed, removed and unchanged, keyed by mode and pattern", () => {
		const cur = [
			row("a", { action: "robot", mode: "contains", pattern: "keep" }),
			row("b", { action: "robot", mode: "contains", pattern: "flip" }),
			row("c", { action: "robot", mode: "prefix", pattern: "gone" }),
			row("d", { action: "robot", mode: "contains", pattern: "Keep" }),
		];
		const d = diffRules(cur, [
			{ action: "robot", mode: "contains", pattern: "keep" },
			{ action: "human", mode: "contains", pattern: "flip" },
			{ action: "robot", mode: "contains", pattern: "new" },
		]);
		expect(d.unchanged).toBe(1);
		expect(d.added.map((r) => r.pattern)).toEqual(["new"]);
		expect(d.changed.map((c) => c.id)).toEqual(["b"]);
		// The second stored row with the key of "keep" goes, and so does the dropped rule.
		expect(d.removed.map((r) => r.id).sort()).toEqual(["c", "d"]);
	});

	it("a name change is a change", () => {
		expect(diffRules([row("a", { action: "robot", mode: "contains", pattern: "x1" })], [{ action: "robot", mode: "contains", pattern: "x1", name: "X" }]).changed).toHaveLength(1);
	});
});

describe("agent_rules/bulk and builtin routes", () => {
	let store: ReturnType<typeof pagedColl>;
	const changed: string[] = [];
	const routes = configRoutes({ settings: async () => ({ siteId: "main" }), changed: (c) => changed.push(c) });
	let kvFails = false;
	const kv = new Map<string, unknown>();
	const call = <T>(name: string, input: unknown) =>
		(routes[name] as (typeof routes)[string]).handler({
			input,
			storage: { agent_rules: store },
			kv: {
				set: async (k: string, v: unknown) => {
					store.stmt();
					if (kvFails) throw new Error("KV write failed");
					kv.set(k, v);
				},
			},
		} as unknown as ConfigCtx) as Promise<T>;
	type Bulk = { errors: Array<{ line: number }>; warnings: unknown[]; added: string[]; changed: Array<{ from: string; to: string }>; removed: string[]; unchanged: number; written: number; total: number };

	beforeEach(() => {
		store = pagedColl();
		changed.length = 0;
		kvFails = false;
		kv.clear();
	});

	it("needs plugins:manage", () => {
		expect(routes["config/agent_rules/bulk"]?.permission).toBe("plugins:manage");
		expect(routes["config/agent_rules/builtin"]?.permission).toBe("plugins:manage");
		const plugin = createPlugin() as unknown as { routes: Record<string, { permission?: string }> };
		expect(plugin.routes["config/agent_rules/bulk"]?.permission).toBe("plugins:manage");
		expect(plugin.routes["config/agent_rules/builtin"]?.permission).toBe("plugins:manage");
	});

	it("a large save writes at most 30 rows a call inside a 45 statement budget, and repeats until none remain", async () => {
		const text = Array.from({ length: 60 }, (_, i) => `bot contains examplemonitor${i}`).join("\n");
		const counts: Array<[number, number]> = [];
		let r: Bulk & { remaining: number };
		do {
			store.invocation(45);
			r = await call<Bulk & { remaining: number }>("config/agent_rules/bulk", { text });
			counts.push([r.written, r.remaining]);
		} while (r.remaining);
		expect(counts).toEqual([
			[30, 30],
			[30, 0],
		]);
		expect(store.items.size).toBe(60);
		// Removing them all: 60 deletes in two calls, then nothing.
		store.invocation(45);
		expect(await call<Bulk & { remaining: number }>("config/agent_rules/bulk", { text: "" })).toMatchObject({ written: 30, remaining: 30 });
		store.invocation(45);
		expect(await call<Bulk & { remaining: number }>("config/agent_rules/bulk", { text: "" })).toMatchObject({ written: 30, remaining: 0 });
		expect(store.items.size).toBe(0);
		// At 500 stored rules a save of 30 changes: 5 paged reads, 30 puts and the KV copy, which reuses the rows read.
		for (let i = 0; i < 500; i++) await store.put(`k${i}`, { site: "main", action: "robot", mode: "contains", pattern: `kept${i}` });
		const kept = Array.from({ length: 500 }, (_, i) => `${i < 30 ? "human" : "bot"} contains kept${i}`).join("\n");
		store.invocation(45);
		expect(await call<Bulk & { remaining: number }>("config/agent_rules/bulk", { text: kept })).toMatchObject({ written: 30, remaining: 0 });
		expect(store.statements()).toBe(36);
		expect((kv.get(AGENT_RULES_KEY) as LineRule[]).map((r) => r.action).slice(28, 32)).toEqual(["human", "human", "robot", "robot"]);
	});

	it("a save that stopped after its writes refreshes the middleware copy on the repeat, which writes nothing", async () => {
		kvFails = true;
		await expect(call("config/agent_rules/bulk", { text: "bot contains examplebot" })).rejects.toThrow("KV write failed");
		expect(store.items.size).toBe(1);
		kvFails = false;
		expect(await call<Bulk & { remaining: number }>("config/agent_rules/bulk", { text: "bot contains examplebot" })).toMatchObject({ written: 0, remaining: 0 });
		expect(kv.get(AGENT_RULES_KEY)).toEqual([{ pattern: "examplebot", mode: "contains", action: "robot" }]);
	});

	it("warns on a new line above a kept rule: the save stores it after the kept rules", async () => {
		await store.put("old", { site: "main", action: "robot", mode: "contains", pattern: "examplebot" });
		const r = await call<Bulk>("config/agent_rules/bulk", { text: "human contains examplebot-internal\nbot contains examplebot\nbot contains newbot", check: true });
		expect(r.warnings).toEqual([{ line: 1, message: RULE_TEXT.order }]);
	});

	it("a single rule is trimmed and refuses ' # ' and a repeated mode and pattern, so the text view carries every rule", async () => {
		const save = (data: Record<string, unknown>, id?: string) => call<{ id: string }>("config/agent_rules/save", { data, ...(id ? { id } : {}) });
		const saved = await save({ pattern: " examplebot ", mode: "contains", action: "robot" });
		expect([...store.items.values()][0]?.data).toMatchObject({ pattern: "examplebot" });
		await expect(save({ pattern: "foo # bar", mode: "contains", action: "robot" })).rejects.toBeTruthy();
		await expect(save({ pattern: "ExampleBot", mode: "contains", action: "human" })).rejects.toMatchObject({ code: "duplicate_rule" });
		// Saving the rule itself again is no duplicate.
		await save({ pattern: "examplebot", mode: "contains", action: "human" }, saved.id);
		await save({ pattern: "examplebot", mode: "exact", action: "robot" });
		// An untouched text check of what the list stored changes nothing.
		const text = formatRules([...store.items.values()].map((v) => v.data as LineRule));
		expect(await call<Bulk>("config/agent_rules/bulk", { text, check: true })).toMatchObject({ errors: [], added: [], changed: [], removed: [], unchanged: 2 });
	});

	it("check reports the diff and writes nothing", async () => {
		await store.put("old", { site: "main", action: "robot", mode: "contains", pattern: "oldbot" });
		const r = await call<Bulk>("config/agent_rules/bulk", { text: "bot contains newbot\nhuman exact examplebrowser", check: true });
		expect(r).toMatchObject({ errors: [], added: ["bot contains newbot", "human exact examplebrowser"], removed: ["bot contains oldbot"], written: 0, total: 2 });
		expect(store.items.size).toBe(1);
		expect(changed).toEqual([]);
	});

	it("an invalid set changes nothing", async () => {
		await store.put("old", { site: "main", action: "robot", mode: "contains", pattern: "oldbot" });
		const before = store.writes();
		const check = await call<Bulk>("config/agent_rules/bulk", { text: "bot contains newbot\nbot regex (a+)+", check: true });
		expect(check.errors.map((e) => e.line)).toEqual([2]);
		await expect(call("config/agent_rules/bulk", { text: "bot contains newbot\nbot regex (a+)+" })).rejects.toMatchObject({ code: "invalid_rules", message: expect.stringContaining("Line 2:") });
		expect(store.writes()).toBe(before);
		expect([...store.items.keys()]).toEqual(["old"]);
		expect(changed).toEqual([]);
	});

	it("save writes only changed, added and removed rows, keeps the category of a kept bot rule and reloads the classifier", async () => {
		await store.put("a", { site: "main", action: "robot", mode: "contains", pattern: "keepbot", category: "monitoring" });
		await store.put("b", { site: "main", action: "robot", mode: "contains", pattern: "namebot", category: "seo_tool" });
		await store.put("c", { site: "main", action: "robot", mode: "contains", pattern: "dropbot" });
		const before = store.writes();
		const r = await call<Bulk>("config/agent_rules/bulk", { text: "bot contains keepbot\nbot contains namebot # Named\nbot contains addbot1\nbot contains addbot2" });
		expect(r).toMatchObject({ written: 4, unchanged: 1, added: ["bot contains addbot1", "bot contains addbot2"], changed: [{ from: "bot contains namebot", to: "bot contains namebot # Named" }], removed: ["bot contains dropbot"] });
		expect(store.writes() - before).toBe(4);
		expect(store.items.get("b")?.data).toEqual({ site: "main", action: "robot", mode: "contains", pattern: "namebot", name: "Named", category: "seo_tool" });
		expect(changed).toEqual(["agent_rules"]);
		// New rows list in text order, after the kept ones.
		const page = await store.query({ where: { site: "main" }, limit: 100 });
		expect(page.items.map((i) => (i.data as LineRule).pattern)).toEqual(["keepbot", "namebot", "addbot1", "addbot2"]);
		// Saving the same text again writes nothing.
		changed.length = 0;
		const again = await call<Bulk>("config/agent_rules/bulk", { text: "bot contains keepbot\nbot contains namebot # Named\nbot contains addbot1\nbot contains addbot2" });
		expect(again.written).toBe(0);
		// A save always refreshes the middleware copy, so a repeat after a stopped call heals it.
		expect(changed).toEqual(["agent_rules"]);
	});

	it("a human rule drops the stored category", async () => {
		await store.put("a", { site: "main", action: "robot", mode: "contains", pattern: "examplebot", category: "monitoring" });
		await call("config/agent_rules/bulk", { text: "human contains examplebot" });
		expect(store.items.get("a")?.data).toEqual({ site: "main", action: "human", mode: "contains", pattern: "examplebot" });
	});

	it("refuses more than 500 rules on bulk and on single save", async () => {
		const many = Array.from({ length: 501 }, (_, i) => `bot contains examplebot${i}`).join("\n");
		await expect(call("config/agent_rules/bulk", { text: many })).rejects.toMatchObject({ code: "invalid_rules" });
		expect(store.items.size).toBe(0);
		// 30 rows a call: the page repeats the save until none remain.
		while ((await call<{ remaining: number }>("config/agent_rules/bulk", { text: many.split("\n").slice(0, 500).join("\n") })).remaining);
		expect(store.items.size).toBe(500);
		await expect(call("config/agent_rules/save", { data: { pattern: "onemore", mode: "contains", action: "robot" } })).rejects.toMatchObject({ code: "too_many_rules" });
		// Replacing a rule at the cap is fine.
		const [first] = [...store.items.keys()];
		await call("config/agent_rules/save", { id: first, data: { pattern: "replaced", mode: "contains", action: "robot" } });
	});

	it("rules are one set: a client site in the body still writes and lists the local site", async () => {
		await call("config/agent_rules/save", { data: { pattern: "examplebot", mode: "contains", action: "robot" }, site: "client" });
		expect([...store.items.values()][0]?.data).toMatchObject({ site: "main" });
	});

	it("every rules write copies the whole set, without site, to the key the middleware reads", async () => {
		const kv = new Map<string, unknown>();
		const withKv = (name: string, input: unknown) =>
			(routes[name] as (typeof routes)[string]).handler({ input, storage: { agent_rules: store }, kv: { set: async (k: string, v: unknown) => void kv.set(k, v) } } as unknown as ConfigCtx);
		await withKv("config/agent_rules/bulk", { text: "bot contains examplebot\nhuman prefix Example App/" });
		expect(kv.get(AGENT_RULES_KEY)).toEqual([
			{ pattern: "examplebot", mode: "contains", action: "robot" },
			{ pattern: "Example App/", mode: "prefix", action: "human" },
		]);
		const saved = (await withKv("config/agent_rules/save", { data: { pattern: "otherbot", mode: "contains", action: "robot" } })) as { id: string };
		expect(kv.get(AGENT_RULES_KEY)).toHaveLength(3);
		await withKv("config/agent_rules/delete", { id: saved.id });
		expect(kv.get(AGENT_RULES_KEY)).toHaveLength(2);
		expect(changed).toEqual(["agent_rules", "agent_rules", "agent_rules"]);
	});

	it("after a siteId change the list, the bulk diff and delete still see the rules saved under the old id", async () => {
		await store.put("old", { site: "before", action: "robot", mode: "contains", pattern: "oldbot" });
		const list = (await call<{ items: Array<{ id: string }> }>("config/agent_rules/list", {})).items;
		expect(list.map((i) => i.id)).toEqual(["old"]);
		const r = await call<Bulk>("config/agent_rules/bulk", { text: "bot contains oldbot", check: true });
		expect(r).toMatchObject({ added: [], removed: [], unchanged: 1 });
		await call("config/agent_rules/save", { id: "old", data: { pattern: "oldbot", mode: "contains", action: "human" } });
		expect(store.items.get("old")?.data).toMatchObject({ action: "human", site: "main" });
		await call("config/agent_rules/delete", { id: "old" });
		expect(store.items.size).toBe(0);
	});

	it("pages the built-in list, 50 at a time, with search and category", async () => {
		type Page = { total: number; items: Array<{ id: string; name: string; category: string; source: string; mode: string; pattern: string; override: { mode: string; pattern: string } | null }> };
		const p0 = await call<Page>("config/agent_rules/builtin", {});
		expect(p0.total).toBe(AGENTS.length);
		expect(p0.items).toHaveLength(50);
		const last = await call<Page>("config/agent_rules/builtin", { page: Math.floor(AGENTS.length / 50) });
		expect(last.items).toHaveLength(AGENTS.length % 50);
		const g = await call<Page>("config/agent_rules/builtin", { q: "GOOGLEBOT-IMAGE" });
		expect(g.items[0]).toMatchObject({ id: "googlebot-image", source: "curated", override: { mode: "contains", pattern: "googlebot-image" } });
		const cat = await call<Page>("config/agent_rules/builtin", { category: "feed_reader" });
		expect(cat.total).toBe(AGENTS.filter((a) => a.category === "feed_reader").length);
		expect(cat.items.every((i) => i.category === "feed_reader")).toBe(true);
		await expect(call("config/agent_rules/builtin", { page: 101 })).rejects.toBeTruthy();
	});
});

describe("built-in override rule", () => {
	it("turns literal patterns into plain rules and refuses real patterns", () => {
		expect(builtinOverride({ mode: "contains", pattern: "examplebot" })).toEqual({ mode: "contains", pattern: "examplebot" });
		expect(builtinOverride({ mode: "regex", pattern: "Nutch" })).toEqual({ mode: "contains", pattern: "nutch" });
		expect(builtinOverride({ mode: "regex", pattern: "[wW]get" })).toEqual({ mode: "contains", pattern: "wget" });
		expect(builtinOverride({ mode: "regex", pattern: "^curl" })).toEqual({ mode: "prefix", pattern: "curl" });
		expect(builtinOverride({ mode: "regex", pattern: "Mediapartners \\(Googlebot\\)" })).toEqual({ mode: "contains", pattern: "mediapartners (googlebot)" });
		expect(builtinOverride({ mode: "regex", pattern: "BlogTraffic\\/\\d\\.\\d+ Feed" })).toBeNull();
		expect(builtinOverride({ mode: "regex", pattern: "(^| )sentry\\/" })).toBeNull();
	});

	it("every override rule turns the built-in match human", () => {
		// For each built-in entry with an override, a UA built from the literal is a robot before and human after.
		let checked = 0;
		for (const a of AGENTS) {
			const o = builtinOverride(a.match);
			if (!o) continue;
			const ua = `${o.mode === "prefix" ? "" : "mozilla/5.0 "}${o.pattern} (example.com)`;
			const plain = createClassifier();
			if (plain.classify(ua).botId !== a.id) continue;
			expect(createClassifier([{ ...o, action: "human" }]).classify(ua).audience).toBe("human");
			checked++;
		}
		expect(checked).toBeGreaterThan(1000);
	});
});

/** The classifier before indexing: user plain rules in a loop, in list order. */
function naiveClassify(rules: readonly UserAgentRule[], raw: string) {
	const ua = raw.slice(0, 512).toLowerCase();
	if (ua.trim().length < 10) return "short";
	const plain = rules.filter((r) => r.mode !== "regex" && r.pattern);
	for (const r of plain) {
		const p = r.pattern.toLowerCase();
		const hit = r.mode === "exact" ? ua === p : r.mode === "prefix" ? ua.startsWith(p) : ua.includes(p);
		if (hit) return r.action === "human" ? "human" : `robot:${r.id}`;
	}
	return "next";
}

describe("indexed user rules", () => {
	// Deterministic pseudo random generator, so a failure reproduces.
	let seed = 7;
	const rnd = (n: number) => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed % n;
	};
	const ALPHA = "abcxyz/ .";
	const word = (len: number) => Array.from({ length: len }, () => ALPHA[rnd(ALPHA.length)]).join("");

	it("equals the naive loop on random rules and user agents", () => {
		for (let round = 0; round < 200; round++) {
			const rules: UserAgentRule[] = Array.from({ length: 1 + rnd(40) }, (_, i) => ({
				id: `r${i}`,
				mode: (["contains", "prefix", "exact"] as const)[rnd(3)] as UserAgentRule["mode"],
				action: rnd(2) ? "robot" : "human",
				pattern: word(1 + rnd(4)).toUpperCase(),
			}));
			const user = compileUserRules(rules);
			for (let j = 0; j < 50; j++) {
				const ua = j % 5 === 0 ? (rules[rnd(rules.length)]?.pattern.toLowerCase() ?? "") : word(10 + rnd(20));
				const hit = user.plain(ua);
				const naive = naiveClassify(rules, ua);
				const got = hit ? (hit.human ? "human" : `robot:${hit.id}`) : "next";
				if (naive !== "short") expect(got).toBe(naive);
			}
		}
	});

	it("leaves the classification of the fixture corpus unchanged with and without rules", () => {
		const rules: UserAgentRule[] = [
			{ id: "u1", pattern: "googlebot", mode: "contains", action: "human" },
			{ id: "u2", pattern: "mozilla/5.0 (x11", mode: "prefix", action: "robot", category: "monitoring" },
			{ id: "u3", pattern: "curl/8.5.0", mode: "exact", action: "human" },
			{ id: "u4", pattern: "chrome", mode: "contains", action: "robot" },
			{ id: "u5", pattern: "safari/\\d", mode: "regex", action: "robot" },
		];
		const builtins = compileBuiltins();
		/** The classifier order of docs/bots.md with a plain loop over the user rules. */
		const reference = (ua: string) => {
			const pre = naiveClassify(rules, ua);
			if (pre !== "next") return pre === "short" ? "robot" : pre.split(":")[0];
			if (["fban/", "fbav/", "instagram", "linkedinapp", " line/"].some((m) => ua.toLowerCase().includes(m))) return "human";
			const b: CompiledRule | undefined = builtins.find((r) => r.test(ua.toLowerCase().slice(0, 512)));
			if (b) return "robot";
			if (/safari\/\d/i.test(ua)) return "robot";
			return undefined;
		};
		const c = createClassifier(rules);
		for (const f of fixtures as Array<{ ua: string; audience: string }>) {
			const want = reference(f.ua);
			if (want) expect(c.classify(f.ua).audience, f.ua).toBe(want);
			// Without rules the fixture answer holds.
			expect(createClassifier().classify(f.ua).audience, f.ua).toBe(f.audience);
		}
	});

	it("101 rules all apply (the loader reads every page, not the first 100)", async () => {
		const store = pagedColl();
		for (let i = 0; i < 101; i++) await store.put(`r${String(i).padStart(3, "0")}`, { site: "main", pattern: `examplebot${String(i).padStart(3, "0")}`, mode: "contains", action: "robot" });
		const plugin = createPlugin() as unknown as { routes: Record<string, { handler(ctx: unknown): Promise<{ matched: string }> }> };
		const test = (ua: string) => plugin.routes["tools/test-agent"]?.handler({ input: { ua }, storage: { agent_rules: store }, cron: { list: async () => [], schedule: async () => undefined } });
		expect(await test("Mozilla/5.0 (compatible; ExampleBot100/1.0)")).toMatchObject({ matched: "user_rule" });
		expect(await test("Mozilla/5.0 (compatible; ExampleBot000/1.0)")).toMatchObject({ matched: "user_rule" });
	});

	it("stays inside the CPU budget with 500 rules (450 plain, 50 regex)", () => {
		const rules: UserAgentRule[] = Array.from({ length: 500 }, (_, i) => ({
			pattern: i < 450 ? `examplerule${i}${["", "/", " x"][i % 3]}` : `^examplerx${i}/\\d+`,
			mode: i < 450 ? ((["contains", "prefix", "exact"] as const)[i % 3] ?? "contains") : "regex",
			action: i % 7 ? "robot" : "human",
		}));
		const uas = (fixtures as Array<{ ua: string }>).map((f) => f.ua);
		const time = (r: UserAgentRule[]) => {
			createClassifier(r).classify("warm up the built-in list once");
			const t0 = performance.now();
			let n = 0;
			// A fresh classifier per round, so the LRU never answers: every call classifies.
			for (let round = 0; round < 20; round++) {
				const c = createClassifier(r);
				for (const ua of uas) {
					c.classify(`${ua} ${round}`);
					n++;
				}
			}
			return ((performance.now() - t0) * 1000) / n;
		};
		const none = time([]);
		const full = time(rules);
		// Measured locally: see docs/bots.md. The Workers Free plan allows 10 ms CPU per request; one classification must stay far below.
		process.stderr.write(`classification: ${none.toFixed(1)} us without rules, ${full.toFixed(1)} us with 500 rules\n`);
		expect(full).toBeLessThan(1000);
	});
});
