import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type PluginRuntimeTestHost, createPluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// The full plugin's own constants: the body below is the one its admin (src/admin/companion.tsx) posts.
import { CONTRACT_VERSION, PLUGIN_ID, VERSION } from "../../../src/contract.js";
import { DAY_MS, STATE_KEY, type StateRecord } from "../src/state.js";

let host: PluginRuntimeTestHost;
type User = NonNullable<Parameters<PluginRuntimeTestHost["actions"]["routes"]["request"]>[1]>["user"];
const users: Record<string, User> = {};

const nativeHello = { v: 1, product: PLUGIN_ID, pluginVersion: VERSION, contractVersion: CONTRACT_VERSION };
// What apiFetch from emdash/plugin-utils sends with every call of the native admin.
const HEADERS = { "content-type": "application/json", "X-EmDash-Request": "1" };

beforeAll(async () => {
	host = await createPluginRuntimeTestHost();
	for (const role of ["subscriber", "contributor", "author", "editor", "admin"] as const) {
		const { id } = await host.fixtures.user({ email: `${role}@example.com`, role });
		const roleLevel = { subscriber: 10, contributor: 20, author: 30, editor: 40, admin: 50 }[role];
		users[role] = { id, email: `${role}@example.com`, name: null, role: roleLevel, createdAt: new Date().toISOString() };
	}
});

afterAll(async () => {
	await host?.dispose();
});

// `user: null` sends no session; a default parameter would turn `undefined` into the editor.
const post = (body: unknown, user: User | null = users.editor ?? null, headers: Record<string, string> = HEADERS) =>
	host.actions.routes.request("hello", { method: "POST", headers, body, ...(user ? { user } : {}) });
const stored = () => host.inspect.kv.get<StateRecord>(STATE_KEY);

describe("hello route", () => {
	it("answers 401 without a session", async () => {
		expect((await post(nativeHello, null)).status).toBe(401);
		expect(await stored()).toBeNull();
	});

	it("answers 403 below the plugins:read permission", async () => {
		for (const role of ["subscriber", "contributor", "author"]) {
			expect((await post(nativeHello, users[role] ?? null)).status, role).toBe(403);
		}
		expect(await stored()).toBeNull();
	});

	it("answers 403 without the X-EmDash-Request header", async () => {
		expect((await post(nativeHello, users.editor ?? null, { "content-type": "application/json" })).status).toBe(403);
	});

	it("answers 405 on GET", async () => {
		const res = await host.actions.routes.request("hello", { method: "GET", headers: HEADERS, user: users.editor });
		expect(res.status).toBe(405);
	});

	it("rejects a bad body without writing", async () => {
		const bad: unknown[] = [
			{},
			{ ...nativeHello, extra: 1 },
			{ ...nativeHello, product: "other" },
			{ ...nativeHello, pluginVersion: "latest" },
			{ ...nativeHello, contractVersion: "1" },
			{ ...nativeHello, v: 2 },
		];
		for (const body of bad) {
			const res = await post(body);
			expect(await res.json(), JSON.stringify(body)).toEqual({ success: true, data: { ok: false, error: "INVALID" } });
		}
		expect(await stored()).toBeNull();
	});

	it("accepts the body the full plugin sends and writes at most once a day", async () => {
		const before = Date.now();
		const res = await post(nativeHello);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true, data: { ok: true } });
		const first = await stored();
		expect(first?.hello).toMatchObject({ pluginVersion: VERSION, contractVersion: CONTRACT_VERSION });
		expect(first?.hello?.at).toBeGreaterThanOrEqual(before);

		// The same hello again within a day leaves the record as it is.
		expect((await post(nativeHello, users.admin ?? null)).status).toBe(200);
		expect((await stored())?.hello?.at).toBe(first?.hello?.at);
	});

	it("writes again once the stored hello is a day old, and keeps the answers", async () => {
		const old = Date.now() - DAY_MS - 60_000;
		const record = {
			answers: { platform: "node", packageManager: "pnpm", database: "emdash", pageViews: 1000 },
			done: ["install"],
			hello: { pluginVersion: VERSION, contractVersion: CONTRACT_VERSION, at: old },
		};
		await host.fixtures.plugin.kv(STATE_KEY, record);
		expect((await post(nativeHello)).status).toBe(200);
		const next = await stored();
		expect(next?.hello?.at).toBeGreaterThan(old);
		expect([next?.answers, next?.done]).toEqual([record.answers, record.done]);
	});

	it("writes at once when the version changes", async () => {
		const at = (await stored())?.hello?.at;
		expect((await post({ ...nativeHello, pluginVersion: "9.9.9" })).status).toBe(200);
		const next = await stored();
		expect(next?.hello?.pluginVersion).toBe("9.9.9");
		expect(next?.hello?.at).toBeGreaterThanOrEqual(at ?? 0);
	});
});
