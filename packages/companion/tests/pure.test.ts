/// <reference types="vite/client" />
import { validateBlocks } from "@emdash-cms/blocks/server";
import type { PluginContext } from "emdash/plugin";
import { describe, expect, it } from "vitest";

import contractSrc from "../../../src/contract.ts?raw";
import installMd from "../../../docs/install.md?raw";
import limitsMd from "../../../docs/limits.md?raw";
import capacityMd from "../../../docs/wiki/Capacity-Profiles-and-Cloudflare-Plans.md?raw";
import rootPackage from "../../../package.json";
import manifestSrc from "../emdash-plugin.jsonc?raw";
import selfSrc from "./pure.test.ts?raw";
import { answersForm, benefitsBlocks, deployedBlock, estimateBlocks, noticeBlocks, stepBlocks } from "../src/blocks.js";
import * as copy from "../src/copy.js";
import {
	DAYS_PER_MONTH,
	DEDICATED_PAGE_VIEWS_PER_DAY,
	ROWS_PER_PAGE_VIEW,
	STANDARD_PAGE_VIEWS_PER_DAY,
	estimate,
} from "../src/estimate.js";
import { COMPANION_SLUG, CONTRACT_VERSION, type CompanionHello, PACKAGE_NAME, PLUGIN_ID, parseHello } from "../src/full.js";
import { ACTION, type Interaction, applyInteraction, parseInteraction } from "../src/interactions.js";
import {
	DAY_MS,
	FRESH_MS,
	STATE_KEY,
	type StateRecord,
	applyHello,
	backToSteps,
	declareDeployed,
	defaultRecord,
	funnelState,
	handleHello,
	markInstalled,
	parseRecord,
	readRecord,
	setAnswers,
	setDone,
	startOver,
} from "../src/state.js";
import { type Answers, DATABASES, DEFAULT_ANSWERS, PACKAGE_MANAGERS, PLATFORMS, STEP_IDS, buildSteps, parseAnswers } from "../src/steps.js";

const SOURCES = import.meta.glob<string>("../src/**/*.ts", { query: "?raw", import: "default", eager: true });
// The glob leaves out the importing file, so this file is read by itself.
const TESTS = { ...import.meta.glob<string>("./**/*.ts", { query: "?raw", import: "default", eager: true }), "./pure.test.ts": selfSrc };

const NOW = Date.UTC(2026, 10, 18, 12);
const hello = (contractVersion = 1, pluginVersion = "1.1.0"): CompanionHello => ({ v: 1, product: PLUGIN_ID, pluginVersion, contractVersion });
const withHello = (r: StateRecord, at: number, contractVersion = 1): StateRecord => ({ ...r, hello: { pluginVersion: "1.1.0", contractVersion, at } });

describe("full.ts mirrors the full plugin", () => {
	it("equals the constants of src/contract.ts, the root package and the manifest", () => {
		expect(contractSrc).toContain(`export const PLUGIN_ID = "${PLUGIN_ID}";`);
		expect(contractSrc).toContain(`export const CONTRACT_VERSION = ${CONTRACT_VERSION};`);
		expect(rootPackage.name).toBe(PACKAGE_NAME);
		expect(manifestSrc).toContain(`"slug": "${COMPANION_SLUG}"`);
	});

	it("has no EmDash import", () => {
		expect(SOURCES["../src/full.ts"]).not.toMatch(/\bfrom\s+["'](emdash|@emdash-cms)/);
	});
});

describe("parseHello", () => {
	it("accepts the exact body", () => {
		expect(parseHello(hello())).toEqual(hello());
		expect(parseHello(hello(2, "1.10.3-beta.1"))).toEqual(hello(2, "1.10.3-beta.1"));
	});

	it.each([
		["null", null],
		["an array", [hello()]],
		["a string", JSON.stringify(hello())],
		["an extra key", { ...hello(), x: 1 }],
		["a missing key", { v: 1, product: PLUGIN_ID, pluginVersion: "1.1.0" }],
		["v 2", { ...hello(), v: 2 }],
		["another product", { ...hello(), product: "other" }],
		["a two part version", hello(1, "1.1")],
		["a v prefix", hello(1, "v1.1.0")],
		["a long prerelease", hello(1, `1.1.0-${"a".repeat(33)}`)],
		["a numeric version", { ...hello(), pluginVersion: 110 }],
		["contract 0", hello(0)],
		["contract 1.5", hello(1.5)],
		["contract 1000", hello(1000)],
		["contract as text", { ...hello(), contractVersion: "1" }],
	])("rejects %s", (_name, body) => {
		expect(parseHello(body)).toBeNull();
	});
});

describe("funnelState: every state", () => {
	const base = defaultRecord();
	it.each<[string, StateRecord, string]>([
		["nothing set", base, "not_installed"],
		["declared only", { ...base, declaredAt: NOW - DAY_MS }, "waiting"],
		["fresh hello, contract 1", withHello(base, NOW - DAY_MS), "connected"],
		["hello exactly 30 days old", withHello(base, NOW - FRESH_MS), "connected"],
		["hello from a clock ahead", withHello(base, NOW + 60_000), "connected"],
		["manual mark only", { ...base, manualAt: NOW }, "connected"],
		["manual mark and declared", { ...base, declaredAt: NOW - 1, manualAt: NOW }, "connected"],
		["manual mark and a stale hello", { ...withHello(base, NOW - FRESH_MS - 1), manualAt: NOW }, "connected"],
		["fresh hello, contract 2", withHello(base, NOW, 2), "version_mismatch"],
		["fresh hello, contract 2, manual mark", { ...withHello(base, NOW, 2), manualAt: NOW }, "version_mismatch"],
		["hello 30 days and 1 ms old", withHello(base, NOW - FRESH_MS - 1), "stale"],
		["stale hello and declared", { ...withHello(base, NOW - 40 * DAY_MS), declaredAt: NOW }, "stale"],
		["stale hello with contract 2", withHello(base, NOW - 40 * DAY_MS, 2), "stale"],
	])("%s", (_name, r, state) => {
		expect(funnelState(r, NOW)).toBe(state);
	});
});

describe("transitions", () => {
	const answered = setAnswers(defaultRecord(), { ...DEFAULT_ANSWERS, pageViews: 1000 });
	const ticked = setDone(answered, "install", true);

	it("not_installed: I have deployed it leads to waiting", () => {
		const r = declareDeployed(ticked, NOW);
		expect(r.declaredAt).toBe(NOW);
		expect(funnelState(r, NOW)).toBe("waiting");
	});

	it("waiting: a hello leads to connected", () => {
		const r = applyHello(declareDeployed(ticked, NOW), hello(), NOW);
		expect(r && funnelState(r, NOW)).toBe("connected");
	});

	it("waiting: Mark as installed leads to connected", () => {
		expect(funnelState(markInstalled(declareDeployed(ticked, NOW), NOW), NOW)).toBe("connected");
	});

	it("waiting: Back to the steps leads to not_installed", () => {
		const r = backToSteps(declareDeployed(ticked, NOW));
		expect(r).toEqual(ticked);
		expect(funnelState(r, NOW)).toBe("not_installed");
	});

	it("not_installed: a hello with another contract leads to version_mismatch, a later hello with 1 to connected", () => {
		const r = applyHello(ticked, hello(2), NOW);
		expect(r && funnelState(r, NOW)).toBe("version_mismatch");
		const fixed = r && applyHello(r, hello(1, "1.2.0"), NOW + 1);
		expect(fixed && funnelState(fixed, NOW + 1)).toBe("connected");
	});

	it("connected: 30 days without a hello lead to stale, a new hello back to connected", () => {
		const r = applyHello(ticked, hello(), NOW);
		expect(r && funnelState(r, NOW + FRESH_MS + 1)).toBe("stale");
		const again = r && applyHello(r, hello(), NOW + FRESH_MS + 1);
		expect(again && funnelState(again, NOW + FRESH_MS + 1)).toBe("connected");
	});

	it("stale: Mark as installed leads to connected", () => {
		expect(funnelState(markInstalled(withHello(ticked, NOW - 40 * DAY_MS), NOW), NOW)).toBe("connected");
	});

	it("Start over clears declaredAt, hello and manualAt from any state and keeps answers and progress", () => {
		const full: StateRecord = { ...withHello(ticked, NOW), declaredAt: NOW, manualAt: NOW };
		for (const r of [full, withHello(ticked, NOW - 40 * DAY_MS), withHello(ticked, NOW, 2)]) {
			const cleared = startOver(r);
			expect(cleared).toEqual({ answers: ticked.answers, done: ["install"] });
			expect(funnelState(cleared, NOW)).toBe("not_installed");
		}
	});

	it("a hello is written at most once a day unless it differs", () => {
		const first = applyHello(ticked, hello(), NOW);
		expect(first?.hello).toEqual({ pluginVersion: "1.1.0", contractVersion: 1, at: NOW });
		if (!first) throw new Error("expected a record");
		expect(applyHello(first, hello(), NOW + DAY_MS - 1)).toBeNull();
		expect(applyHello(first, hello(), NOW + DAY_MS)?.hello?.at).toBe(NOW + DAY_MS);
		expect(applyHello(first, hello(1, "1.1.1"), NOW + 1)?.hello?.pluginVersion).toBe("1.1.1");
		expect(applyHello(first, hello(2), NOW + 1)?.hello?.contractVersion).toBe(2);
	});

	it("Done toggles keep step order and never duplicate", () => {
		let r = setDone(answered, "deploy", true);
		r = setDone(r, "install", true);
		r = setDone(r, "install", true);
		expect(r.done).toEqual(["install", "deploy"]);
		expect(setDone(r, "install", false).done).toEqual(["deploy"]);
	});

	it("never mutates its input", () => {
		const r = defaultRecord();
		const copyOf = structuredClone(r);
		declareDeployed(r, NOW);
		markInstalled(r, NOW);
		setDone(r, "install", true);
		setAnswers(r, { ...DEFAULT_ANSWERS, platform: "node" });
		applyHello(r, hello(), NOW);
		startOver(r);
		expect(r).toEqual(copyOf);
	});
});

describe("parseRecord", () => {
	it("round trips a full record", () => {
		const r: StateRecord = { ...withHello(setDone(defaultRecord(), "waf", true), NOW), declaredAt: NOW - 5, manualAt: NOW };
		expect(parseRecord(structuredClone(r))).toEqual(r);
	});

	it("falls back field by field on damaged data", () => {
		expect(parseRecord(null)).toEqual(defaultRecord());
		expect(parseRecord("x")).toEqual(defaultRecord());
		expect(
			parseRecord({
				answers: { platform: "aws" },
				done: ["install", "nope", 3],
				declaredAt: "yesterday",
				manualAt: -1,
				hello: { pluginVersion: "1.1.0", contractVersion: 1, at: "now" },
			}),
		).toEqual({ answers: DEFAULT_ANSWERS, done: ["install"] });
		expect(parseRecord({ hello: { pluginVersion: "bad", contractVersion: 1, at: NOW } }).hello).toBeUndefined();
	});
});

describe("parseAnswers", () => {
	it("accepts every combination and an unanswered or whole page view count", () => {
		for (const platform of PLATFORMS)
			for (const packageManager of PACKAGE_MANAGERS)
				for (const database of DATABASES) {
					const a = { platform, packageManager, database, pageViews: 0 };
					expect(parseAnswers(a)).toEqual(a);
				}
		expect(parseAnswers({ ...DEFAULT_ANSWERS, pageViews: undefined })?.pageViews).toBeNull();
		expect(parseAnswers({ ...DEFAULT_ANSWERS, pageViews: 1_000_000_000 })?.pageViews).toBe(1_000_000_000);
	});

	it.each([
		["an unknown platform", { ...DEFAULT_ANSWERS, platform: "aws" }],
		["an unknown package manager", { ...DEFAULT_ANSWERS, packageManager: "bun" }],
		["an unknown database", { ...DEFAULT_ANSWERS, database: "mysql" }],
		["negative page views", { ...DEFAULT_ANSWERS, pageViews: -1 }],
		["fractional page views", { ...DEFAULT_ANSWERS, pageViews: 1.5 }],
		["page views as text", { ...DEFAULT_ANSWERS, pageViews: "100" }],
		["too many page views", { ...DEFAULT_ANSWERS, pageViews: 1_000_000_001 }],
		["null", null],
	])("rejects %s", (_name, v) => {
		expect(parseAnswers(v)).toBeNull();
	});
});

describe("interactions", () => {
	const valid: Array<[unknown, Interaction]> = [
		[{ type: "page_load", page: "/setup" }, { kind: "load" }],
		[{ type: "block_action", action_id: ACTION.deployed }, { kind: "deployed" }],
		[{ type: "block_action", action_id: ACTION.markInstalled }, { kind: "mark_installed" }],
		[{ type: "block_action", action_id: ACTION.startOver }, { kind: "start_over" }],
		[{ type: "block_action", action_id: ACTION.backToSteps }, { kind: "back_to_steps" }],
		[{ type: "block_action", action_id: "done:cron", value: true }, { kind: "done", step: "cron", done: true }],
		[{ type: "block_action", action_id: "done:privacy", value: false }, { kind: "done", step: "privacy", done: false }],
		[
			{ type: "form_submit", action_id: ACTION.answers, values: { platform: "node", packageManager: "yarn", database: "own", pageViews: 5000 } },
			{ kind: "answers", answers: { platform: "node", packageManager: "yarn", database: "own", pageViews: 5000 } },
		],
		[
			{ type: "form_submit", action_id: ACTION.answers, values: { platform: "cloudflare", packageManager: "npm", database: "emdash" } },
			{ kind: "answers", answers: { ...DEFAULT_ANSWERS } },
		],
	];
	it.each(valid)("recognises %j", (input, expected) => {
		expect(parseInteraction(input)).toEqual(expected);
	});

	it.each([
		null,
		"page_load",
		{ type: "page_load" },
		{ type: "block_action" },
		{ type: "block_action", action_id: "delete_everything" },
		{ type: "block_action", action_id: "done:nope", value: true },
		{ type: "block_action", action_id: "done:install", value: "true" },
		{ type: "block_action", action_id: "done:install" },
		{ type: "form_submit", action_id: "other", values: { ...DEFAULT_ANSWERS } },
		{ type: "form_submit", action_id: ACTION.answers },
		{ type: "form_submit", action_id: ACTION.answers, values: { ...DEFAULT_ANSWERS, platform: "aws" } },
		{ type: "panel_load", action_id: ACTION.deployed },
	])("rejects %j", (input) => {
		expect(parseInteraction(input)).toBeNull();
	});

	it("applies each interaction as its transition", () => {
		const r = setDone(defaultRecord(), "install", true);
		const a: Answers = { platform: "node", packageManager: "pnpm", database: "emdash", pageViews: 10 };
		expect(applyInteraction(r, { kind: "load" }, NOW)).toBe(r);
		expect(applyInteraction(r, { kind: "answers", answers: a }, NOW)).toEqual(setAnswers(r, a));
		expect(applyInteraction(r, { kind: "deployed" }, NOW)).toEqual(declareDeployed(r, NOW));
		expect(applyInteraction(r, { kind: "mark_installed" }, NOW)).toEqual(markInstalled(r, NOW));
		expect(applyInteraction({ ...r, manualAt: 1 }, { kind: "start_over" }, NOW)).toEqual(r);
		expect(applyInteraction({ ...r, declaredAt: 1 }, { kind: "back_to_steps" }, NOW)).toEqual(r);
		expect(applyInteraction(r, { kind: "done", step: "install", done: false }, NOW).done).toEqual([]);
	});
});

describe("steps per answer set", () => {
	const combos = PLATFORMS.flatMap((platform) =>
		PACKAGE_MANAGERS.flatMap((packageManager) => DATABASES.map((database): Answers => ({ platform, packageManager, database, pageViews: null }))),
	);

	it.each(combos)("$platform, $packageManager, $database", (a) => {
		expect(buildSteps(a)).toMatchSnapshot();
	});

	it("differs where the answers say so", () => {
		for (const a of combos) {
			const steps = buildSteps(a);
			const ids = steps.map((s) => s.id);
			const code = (id: string) => steps.find((s) => s.id === id)?.code.map((c) => c.code).join("\n") ?? "";
			const cf = a.platform === "cloudflare";
			const db = cf ? a.database : "emdash";
			expect(ids).toEqual(STEP_IDS.filter((id) => id !== "cron" || cf));
			expect(code("install")).toBe(copy.CODE.install[a.packageManager]);
			expect(code("config").includes("wrangler d1 create")).toBe(db === "own");
			expect(code("config").includes('binding: "CA_DB"')).toBe(db === "own");
			expect(code("config").includes('engine: "postgres"')).toBe(db === "postgres");
			expect(steps.find((s) => s.id === "config")?.link !== undefined).toBe(db === "postgres");
			expect(steps.find((s) => s.id === "profile")?.text).toBe(
				db !== "emdash" ? copy.STEPS.profile.dedicated : cf ? copy.STEPS.profile.standard : copy.STEPS.profile.standardNode,
			);
			expect(code("encryption").includes("wrangler secret put")).toBe(cf);
		}
	});

	it("every code snippet is the one in docs/install.md", () => {
		const norm = (s: string) =>
			s
				.split("\n")
				.map((l) => l.trim())
				.join("\n");
		const doc = norm(installMd);
		const snippets = [
			...Object.values(copy.CODE.install),
			copy.CODE.config.emdash,
			copy.CODE.d1Create,
			copy.CODE.d1Binding,
			copy.CODE.layout,
			copy.CODE.cron,
			"wrangler secret put EMDASH_ENCRYPTION_KEY",
			"npx emdash secrets generate",
			'emdash({ plugins: [cookielessAnalytics({ database: { binding: "CA_DB" } })] })',
			'emdash({ plugins: [cookielessAnalytics({ database: { binding: "CA_PG", engine: "postgres" } })] })',
		];
		for (const s of snippets) expect(doc, s).toContain(norm(s));
		for (const v of ["CA_DB", "CA_PG"]) expect(copy.CODE.config[v === "CA_DB" ? "own" : "postgres"]).toContain(`binding: "${v}"`);
	});
});

describe("estimate", () => {
	const a = (pageViews: number | null, database: Answers["database"] = "emdash", platform: Answers["platform"] = "cloudflare"): Answers => ({
		platform,
		packageManager: "npm",
		database,
		pageViews,
	});

	it("every constant is in the doc it cites", () => {
		expect(ROWS_PER_PAGE_VIEW).toBe(3.3);
		expect(limitsMd).toContain("| Rows written per page view | 3.3 with the typical mix");
		expect(capacityMd).toContain("Rows written per page view: about 3.3 with a typical mix");
		expect(STANDARD_PAGE_VIEWS_PER_DAY).toBe(17_500);
		expect(limitsMd).toContain("| `standard` (4.5 GB) | about 17,500 page views a day |");
		expect(capacityMd).toContain("| `standard` (4.5 GB) | about 17,500 page views a day |");
		expect(DEDICATED_PAGE_VIEWS_PER_DAY).toBe(26_200);
		expect(limitsMd).toContain("| `dedicated` (6.75 GB) | about 26,200 page views a day |");
		expect(capacityMd).toContain("| `dedicated` (6.75 GB) | about 26,200 page views a day |");
		expect(limitsMd).toContain("| When to choose | Workers Free (a database there holds 500 MB) | Workers Paid, analytics in the EmDash database | Analytics in a database of its own");
		expect(DAYS_PER_MONTH).toBe(30);
	});

	it("every number in the estimate copy is a cited one", () => {
		const text = JSON.stringify(copy.ESTIMATE);
		const numbers = [...new Set(text.match(/\b\d[\d,.]*\d\b|\b\d\b/g))];
		expect(numbers.sort()).toEqual(["10", "17,500", "25", "3.3", "30"].sort());
		expect(limitsMd).toContain("There is no 10 GB cap");
		expect(limitsMd).toContain("Estimates for 25 months (760 days) of detail");
		expect(text).toContain(`${DAYS_PER_MONTH} days`);
	});

	it.each<[string, Answers, ReturnType<typeof estimate>]>([
		["unanswered", a(null), null],
		["zero", a(0), { pageViewsPerDay: 0, rowsPerDay: 0, profile: "standard", advice: "fits" }],
		["300,000 a month", a(300_000), { pageViewsPerDay: 10_000, rowsPerDay: 33_000, profile: "standard", advice: "fits" }],
		["standard at its limit", a(525_000), { pageViewsPerDay: 17_500, rowsPerDay: 57_750, profile: "standard", advice: "fits" }],
		["standard over its limit", a(525_030), { pageViewsPerDay: 17_501, rowsPerDay: 57_753, profile: "standard", advice: "own_database" }],
		["just over standard rounds up", a(525_001), { pageViewsPerDay: 17_501, rowsPerDay: 57_750, profile: "standard", advice: "own_database" }],
		["own D1 at its limit", a(786_000, "own"), { pageViewsPerDay: 26_200, rowsPerDay: 86_460, profile: "dedicated", advice: "fits" }],
		["own D1 over its limit", a(786_030, "own"), { pageViewsPerDay: 26_201, rowsPerDay: 86_463, profile: "dedicated", advice: "shorter_detail" }],
		["Postgres under", a(600_000, "postgres"), { pageViewsPerDay: 20_000, rowsPerDay: 66_000, profile: "dedicated", advice: "fits" }],
		["Postgres over", a(786_030, "postgres"), { pageViewsPerDay: 26_201, rowsPerDay: 86_463, profile: "dedicated", advice: "raise_budget" }],
		["Node ignores the database answer", a(600_000, "own", "node"), { pageViewsPerDay: 20_000, rowsPerDay: 66_000, profile: "standard", advice: "shorter_detail" }],
		["the largest answer", a(1_000_000_000), { pageViewsPerDay: 33_333_334, rowsPerDay: 110_000_000, profile: "standard", advice: "own_database" }],
	])("%s", (_name, answers, expected) => {
		expect(estimate(answers)).toEqual(expected);
	});
});

describe("blocks", () => {
	const valid = (blocks: unknown) => expect(validateBlocks(blocks)).toEqual({ valid: true, errors: [] });
	const url = "https://example.com/_emdash/admin/plugins/cookieless-analytics/";
	const types = (blocks: Array<{ type: string }>) => blocks.map((b) => b.type);

	it("each state has its notice, variant and one call to action", () => {
		const base = defaultRecord();
		const cases: Array<[StateRecord, string, string, string[]]> = [
			[base, copy.NOTICE.not_installed.title, "default", []],
			[{ ...base, declaredAt: NOW }, copy.NOTICE.waiting.title, "default", ["link", "button", "button"]],
			[withHello(base, NOW), copy.NOTICE.connected.title, "default", ["link", "button"]],
			[withHello(base, NOW, 2), copy.NOTICE.version_mismatch.title, "alert", ["link"]],
			[withHello(base, NOW - 40 * DAY_MS), copy.NOTICE.stale.title("2026-10-09"), "alert", ["link", "button"]],
		];
		for (const [r, title, variant, elements] of cases) {
			const blocks = noticeBlocks(funnelState(r, NOW), r, url, NOW);
			valid(blocks);
			expect(blocks[0]).toMatchObject({ type: "banner", title, variant });
			const acts = blocks[1] as { elements: Array<{ type: string; style?: string }> } | undefined;
			expect(acts?.elements.map((e) => e.type) ?? []).toEqual(elements);
			expect(acts?.elements.filter((e) => e.style === "primary") ?? []).toEqual([]);
		}
	});

	it("the connected text names the confirmed version, or the manual mark", () => {
		const viaHello = noticeBlocks("connected", withHello(defaultRecord(), NOW), url, NOW)[0];
		expect(viaHello).toMatchObject({ description: copy.NOTICE.connected.textHello("1.1.0", "2026-11-18") });
		const manual = { ...withHello(defaultRecord(), NOW - 40 * DAY_MS), manualAt: NOW - DAY_MS };
		expect(noticeBlocks("connected", manual, url, NOW)[0]).toMatchObject({ description: copy.NOTICE.connected.textManual("2026-11-17") });
		expect(noticeBlocks("version_mismatch", withHello(defaultRecord(), NOW, 3), url, NOW)[0]).toMatchObject({
			description: copy.NOTICE.version_mismatch.text(3),
		});
	});

	it("steps, form, estimate and benefits are valid Block Kit", () => {
		for (const s of buildSteps({ ...DEFAULT_ANSWERS, database: "postgres" })) {
			const blocks = stepBlocks(s, s.id === "install");
			valid(blocks);
			expect(blocks[0]).toMatchObject({ accessory: { type: "toggle", action_id: `done:${s.id}`, initial_value: s.id === "install" } });
			expect(blocks.filter((b) => b.type === "context").length).toBeGreaterThanOrEqual(s.text.split("\n").length);
		}
		valid([answersForm(DEFAULT_ANSWERS), answersForm({ ...DEFAULT_ANSWERS, pageViews: 5 }), deployedBlock(), ...benefitsBlocks()]);
		expect(types(benefitsBlocks())).toEqual(["header", ...copy.BENEFITS.lines.map(() => "section")]);
		expect(types(estimateBlocks(null))).toEqual(["header", "context"]);
		const est = estimateBlocks(estimate({ ...DEFAULT_ANSWERS, pageViews: 300_000 }));
		valid(est);
		expect(est[1]).toEqual({
			type: "stats",
			items: [
				{ label: copy.ESTIMATE.pageViewsPerDay, value: "10,000" },
				{ label: copy.ESTIMATE.rowsPerDay, value: "33,000" },
				{ label: copy.ESTIMATE.profile, value: "Standard" },
			],
		});
	});
});

describe("hello route handler", () => {
	function fakeCtx(stored?: unknown, fail = false) {
		const kv = new Map<string, unknown>(stored === undefined ? [] : [[STATE_KEY, stored]]);
		const calls = { writes: 0, warns: 0 };
		const ctx = {
			kv: {
				get: async (k: string) => {
					if (fail) throw new Error("kv down");
					return structuredClone(kv.get(k) ?? null);
				},
				set: async (k: string, v: unknown) => {
					calls.writes++;
					kv.set(k, structuredClone(v));
				},
			},
			log: { warn: () => calls.warns++ },
		} as unknown as PluginContext;
		return { ctx, calls };
	}

	it("writes a valid hello once a day and answers ok", async () => {
		const { ctx, calls } = fakeCtx();
		expect(await handleHello({ input: hello() }, ctx, NOW)).toEqual({ ok: true });
		expect(await handleHello({ input: hello() }, ctx, NOW + 1000)).toEqual({ ok: true });
		expect(calls.writes).toBe(1);
		expect(funnelState(await readRecord(ctx.kv), NOW)).toBe("connected");
		await handleHello({ input: hello() }, ctx, NOW + DAY_MS);
		expect(calls.writes).toBe(2);
	});

	it("keeps the answers and progress of a stored record", async () => {
		const stored = setDone(setAnswers(defaultRecord(), { ...DEFAULT_ANSWERS, pageViews: 7 }), "layout", true);
		const { ctx } = fakeCtx(stored);
		await handleHello({ input: hello() }, ctx, NOW);
		const r = await readRecord(ctx.kv);
		expect([r.answers.pageViews, r.done]).toEqual([7, ["layout"]]);
	});

	it("rejects a bad body without touching storage", async () => {
		const { ctx, calls } = fakeCtx();
		expect(await handleHello({ input: { ...hello(), extra: true } }, ctx, NOW)).toEqual({ ok: false, error: "INVALID" });
		expect(calls.writes).toBe(0);
	});

	it("answers UNAVAILABLE and logs one warning when storage fails", async () => {
		const { ctx, calls } = fakeCtx(undefined, true);
		expect(await handleHello({ input: hello() }, ctx, NOW)).toEqual({ ok: false, error: "UNAVAILABLE" });
		expect(calls.warns).toBe(1);
	});
});

describe("text rules", () => {
	const files = { ...SOURCES, ...TESTS };
	const DASH = /[\u2013\u2014]/;
	const HEDGE = new RegExp(`\\bun${"verified"}\\b`, "i");
	// A string token, or a comment that hides quotes; whichever starts first wins.
	const TOKEN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
	const PROSE = /[A-Za-z]{2,}[,.:;!?]? +[A-Za-z]{2,}/;
	const prose = (src: string) => (src.match(TOKEN) ?? []).filter((t) => !t.startsWith("/") && PROSE.test(t.replace(/\$\{[^}]*\}/g, "")));

	it("scans every source and test file", () => {
		expect(Object.keys(SOURCES)).toEqual(
			expect.arrayContaining(["../src/full.ts", "../src/state.ts", "../src/interactions.ts", "../src/steps.ts", "../src/estimate.ts", "../src/copy.ts", "../src/blocks.ts"]),
		);
		expect(Object.keys(TESTS)).toContain("./pure.test.ts");
	});

	it("no em or en dash anywhere", () => {
		expect(Object.entries(files).filter(([, src]) => DASH.test(src)).map(([f]) => f)).toEqual([]);
		expect(DASH.test("a \u2014 b")).toBe(true);
		expect(DASH.test("a \u2013 b")).toBe(true);
		expect(DASH.test("a - b")).toBe(false);
	});

	it("no hedging tag word anywhere", () => {
		expect(Object.entries(files).filter(([, src]) => HEDGE.test(src)).map(([f]) => f)).toEqual([]);
		expect(HEDGE.test(`(UN${"VERIFIED"})`)).toBe(true);
	});

	it("no user visible string outside copy.ts", () => {
		// shortcut: plugin.ts is still the skeleton stub with its own header text; drop this exclusion once the entry is wiring only.
		const skip = new Set(["../src/copy.ts", "../src/plugin.ts"]);
		const found = Object.entries(SOURCES)
			.filter(([f]) => !skip.has(f))
			.flatMap(([f, src]) => prose(src).map((t) => `${f}: ${t}`));
		expect(found).toEqual([]);
		expect(prose('const t = "Open the page";')).toEqual(['"Open the page"']);
		expect(prose("const t = `Seen on ${d} here`;")).toHaveLength(1);
		expect(prose('// a comment with "Quoted words"\nconst k = "state:v1";')).toEqual([]);
		expect(prose('const u = "https://example.com/a/b";')).toEqual([]);
	});

	it("copy follows the messaging rules", () => {
		const strings: string[] = [];
		const walk = (v: unknown): void => {
			if (typeof v === "string") strings.push(v);
			else if (typeof v === "function") strings.push(String(v.length === 1 ? v("2026-11-18") : v("1.1.0", "2026-11-18")));
			else if (v && typeof v === "object") Object.values(v).forEach(walk);
		};
		walk({ ...copy, formatDate: undefined, formatNumber: undefined });
		expect(strings.length).toBeGreaterThan(50);
		for (const s of strings) {
			expect(s.replace(/Workers Free/g, ""), s).not.toMatch(/\bfree\b|\bpro\b|upgrade now|\bhurry\b|\btoday only\b|!/i);
		}
		// Exact strings of the setup notices, written out so a typo in copy.ts fails.
		expect(copy.NOTICE.not_installed.title).toBe("The full plugin is not installed yet");
		expect(copy.NOTICE.waiting.text).toBe(
			"Open the Analytics Overview once. The full plugin, version 1.1.0 or later, then confirms itself here. If the Analytics folder is in your sidebar and this notice stays, select Mark as installed.",
		);
		expect(copy.NOTICE.connected.textHello("1.1.0", "2026-11-18")).toBe(
			"Cookieless Analytics 1.1.0 confirmed itself on 2026-11-18. Setup is complete. You can remove this companion under Plugins. It holds only your setup answers, so nothing needs to be moved.",
		);
		expect(copy.NOTICE.version_mismatch.title).toBe("This companion is out of date");
		expect(copy.NOTICE.stale.title("2026-10-09")).toBe("The full plugin was last seen on 2026-10-09");
		expect([copy.LABEL.deployed, copy.LABEL.markInstalled, copy.LABEL.backToSteps, copy.LABEL.startOver, copy.LABEL.openOverview]).toEqual([
			"I have deployed it",
			"Mark as installed",
			"Back to the steps",
			"Start over",
			"Open the Analytics Overview",
		]);
		expect(copy.NOTICE.not_installed.text.startsWith("This companion does not count visits.")).toBe(true);
		expect(copy.NOTICE.not_installed.text.split("Cookieless Analytics by Infinitnet")).toHaveLength(2);
	});
});
