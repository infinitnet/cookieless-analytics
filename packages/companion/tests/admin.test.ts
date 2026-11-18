import { type BlockResponse, validateBlockResponse } from "@emdash-cms/blocks/server";
import type { PluginContext } from "emdash/plugin";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type PluginRuntimeTestHost, createPluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import { ERROR, LABEL, NOTICE, TOAST } from "../src/copy.js";
import { ACTION } from "../src/interactions.js";
import { handleAdmin, setupPage } from "../src/pages/setup.js";
import { DAY_MS, STATE_KEY, type StateRecord, defaultRecord } from "../src/state.js";
import type { Answers } from "../src/steps.js";

const PAGE = "/setup";
const valid = (page: BlockResponse) => expect(validateBlockResponse(page, { pluginPagePaths: [PAGE] })).toEqual({ valid: true, errors: [] });
const titles = (page: BlockResponse) => page.blocks.flatMap((b) => (b.type === "banner" && b.title ? [b.title] : []));
const has = (page: BlockResponse, type: string) => page.blocks.some((b) => b.type === type);
const hasButton = (page: BlockResponse, actionId: string) => JSON.stringify(page.blocks).includes(`"action_id":"${actionId}"`);

const ANSWERS: Answers = { platform: "cloudflare", packageManager: "pnpm", database: "own", pageViews: 300_000 };
const hello = (at: number, contractVersion = 1) => ({ pluginVersion: "1.1.0", contractVersion, at });

describe("setup page through the sandbox host", () => {
	let host: PluginRuntimeTestHost;
	const stored = () => host.inspect.kv.get<StateRecord>(STATE_KEY);
	const seed = (r: Partial<StateRecord>) => host.fixtures.plugin.kv(STATE_KEY, { ...defaultRecord(), ...r });

	beforeAll(async () => {
		host = await createPluginRuntimeTestHost({ site: { url: "https://example.com" } });
	});
	afterAll(async () => {
		await host?.dispose();
	});
	beforeEach(async () => {
		await host.transport.invokeHook("plugin:uninstall", { deleteData: true });
	});

	it("renders each of the five states as valid Block Kit", async () => {
		const now = Date.now();
		const cases: Array<[Partial<StateRecord>, string, boolean]> = [
			[{}, NOTICE.not_installed.title, true],
			[{ declaredAt: now }, NOTICE.waiting.title, false],
			[{ hello: hello(now) }, NOTICE.connected.title, false],
			[{ manualAt: now }, NOTICE.connected.title, false],
			[{ hello: hello(now, 2) }, NOTICE.version_mismatch.title, false],
			[{ hello: hello(now - 40 * DAY_MS) }, NOTICE.stale.title(new Date(now - 40 * DAY_MS).toISOString().slice(0, 10)), true],
		];
		for (const [record, title, steps] of cases) {
			await seed(record);
			const page = await host.admin.loadPage(PAGE);
			valid(page);
			expect(page.blocks[0]).toEqual({ type: "header", text: "Analytics setup" });
			expect(titles(page), title).toEqual([title]);
			expect(has(page, "form"), title).toBe(steps);
		}
	});

	it("links the Overview of the full plugin by absolute URL", async () => {
		await seed({ declaredAt: Date.now() });
		const page = await host.admin.loadPage(PAGE);
		expect(JSON.stringify(page.blocks)).toContain('"url":"https://example.com/_emdash/admin/plugins/cookieless-analytics/"');
	});

	it("shows the questions, the estimate, the steps and I have deployed it while not installed", async () => {
		const page = await host.admin.loadPage(PAGE);
		expect(has(page, "form") && has(page, "code")).toBe(true);
		expect(hasButton(page, ACTION.deployed)).toBe(true);
		expect(await stored()).toBeNull();
	});

	it("saves the submitted answers with a toast", async () => {
		const page = await host.admin.submit(PAGE, ACTION.answers, { ...ANSWERS });
		valid(page);
		expect(page.toast).toEqual({ message: TOAST.answersSaved, type: "success" });
		expect((await stored())?.answers).toEqual(ANSWERS);
		expect(has(page, "stats")).toBe(true);
	});

	it("rejects bad answers with the error toast and writes nothing", async () => {
		const page = await host.admin.submit(PAGE, ACTION.answers, { ...ANSWERS, platform: "mars" });
		valid(page);
		expect(page.toast).toEqual({ message: ERROR.unknownAction, type: "error" });
		expect(await stored()).toBeNull();
	});

	it("ticks and clears a step", async () => {
		await host.admin.act(PAGE, `${ACTION.done}layout`, { value: true });
		await host.admin.act(PAGE, `${ACTION.done}install`, { value: true });
		expect((await stored())?.done).toEqual(["install", "layout"]);
		const page = await host.admin.act(PAGE, `${ACTION.done}install`, { value: false });
		valid(page);
		expect((await stored())?.done).toEqual(["layout"]);
	});

	it("walks the funnel: deployed, back to the steps, deployed, mark installed, start over", async () => {
		await seed({ answers: ANSWERS, done: ["install"] });
		const before = Date.now();

		let page = await host.admin.act(PAGE, ACTION.deployed);
		valid(page);
		expect(titles(page)).toEqual([NOTICE.waiting.title]);
		expect((await stored())?.declaredAt).toBeGreaterThanOrEqual(before);

		page = await host.admin.act(PAGE, ACTION.backToSteps);
		expect(titles(page)).toEqual([NOTICE.not_installed.title]);
		expect((await stored())?.declaredAt).toBeUndefined();

		await host.admin.act(PAGE, ACTION.deployed);
		page = await host.admin.act(PAGE, ACTION.markInstalled);
		valid(page);
		expect(titles(page)).toEqual([NOTICE.connected.title]);
		expect((await stored())?.manualAt).toBeGreaterThanOrEqual(before);

		page = await host.admin.act(PAGE, ACTION.startOver);
		valid(page);
		expect(titles(page)).toEqual([NOTICE.not_installed.title]);
		const r = await stored();
		expect(r).toEqual({ answers: ANSWERS, done: ["install"] });
	});

	it("start over clears a hello and keeps the answers", async () => {
		await seed({ answers: ANSWERS, hello: hello(Date.now() - 40 * DAY_MS) });
		await host.admin.act(PAGE, ACTION.startOver);
		expect(await stored()).toEqual({ answers: ANSWERS, done: [] });
	});

	it("answers an unknown action with the current page and an error toast", async () => {
		await seed({ answers: ANSWERS });
		const page = await host.admin.act(PAGE, "nope");
		valid(page);
		expect(page.toast).toEqual({ message: ERROR.unknownAction, type: "error" });
		expect(await stored()).toEqual({ answers: ANSWERS, done: [] });
	});

	it("uninstall deletes the record only when data deletion is ticked", async () => {
		await seed({ answers: ANSWERS });
		await host.transport.invokeHook("plugin:uninstall", { deleteData: false });
		expect(await stored()).not.toBeNull();
		await host.transport.invokeHook("plugin:uninstall", { deleteData: true });
		expect(await stored()).toBeNull();
	});
});

describe("KV failure paths", () => {
	const NOW = Date.UTC(2026, 10, 18, 12);
	function fakeCtx(fail: { read?: boolean; write?: boolean }, stored?: StateRecord) {
		const calls = { writes: 0, warns: [] as string[] };
		const ctx = {
			url: (p: string) => `https://example.com${p}`,
			kv: {
				get: async () => {
					if (fail.read) throw new Error("kv down");
					return stored ?? null;
				},
				set: async () => {
					calls.writes++;
					if (fail.write) throw new Error("kv down");
				},
			},
			log: { warn: (m: string) => calls.warns.push(m) },
		} as unknown as PluginContext;
		return { ctx, calls };
	}

	it("a failed read renders the default steps with the read banner", async () => {
		const { ctx, calls } = fakeCtx({ read: true });
		const page = await handleAdmin({ input: { type: "page_load", page: PAGE } }, ctx, NOW);
		valid(page);
		expect(page.blocks[1]).toEqual({ type: "banner", description: ERROR.readFailed, variant: "alert" });
		expect(has(page, "form")).toBe(true);
		expect(calls.warns).toHaveLength(1);
	});

	it("a failed read never writes over the stored record and says so", async () => {
		const { ctx, calls } = fakeCtx({ read: true });
		const page = await handleAdmin({ input: { type: "block_action", action_id: ACTION.deployed } }, ctx, NOW);
		valid(page);
		expect(calls.writes).toBe(0);
		expect(page.blocks.slice(1, 3)).toEqual([
			{ type: "banner", description: ERROR.readFailed, variant: "alert" },
			{ type: "banner", description: ERROR.saveFailed, variant: "alert" },
		]);
	});

	it("a failed write renders the stored state with the save banner and no success toast", async () => {
		const { ctx, calls } = fakeCtx({ write: true }, { answers: ANSWERS, done: [] });
		const values = { ...ANSWERS, pageViews: 5 };
		const page = await handleAdmin({ input: { type: "form_submit", action_id: ACTION.answers, values } }, ctx, NOW);
		valid(page);
		expect(calls.writes).toBe(1);
		expect(page.blocks[1]).toEqual({ type: "banner", description: ERROR.saveFailed, variant: "alert" });
		expect(page.toast).toBeUndefined();
		expect(calls.warns).toHaveLength(1);
		// The form still shows the stored answers, not the ones that failed to save.
		expect(JSON.stringify(page.blocks)).toContain('"initial_value":300000');
	});

	it("a page load writes nothing", async () => {
		const { ctx, calls } = fakeCtx({});
		await handleAdmin({ input: { type: "page_load", page: PAGE } }, ctx, NOW);
		expect(calls.writes).toBe(0);
	});

	it("the connected page is one status with the Overview link and Start over", () => {
		const blocks = setupPage({ ...defaultRecord(), manualAt: NOW }, { now: NOW, overviewUrl: "https://example.com/x" });
		expect(blocks.map((b) => b.type)).toEqual(["header", "banner", "actions"]);
		expect(JSON.stringify(blocks)).toContain(LABEL.startOver);
	});
});
