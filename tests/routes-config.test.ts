/** Config routes: validation, safe regex, funnel step bounds, site scoping, permissions. */
import { beforeEach, describe, expect, it } from "vitest";
import { createPlugin } from "../src/index.js";
import { CONFIG_COLLECTIONS, type ConfigCtx, configRoutes, saveBody } from "../src/routes/config.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { sitesColl } from "./helpers.js";

/** In-memory storage collection with `where` equality, like the host's indexed query. */
export function memColl() {
	const items = new Map<string, unknown>();
	return {
		items,
		async query(o?: { where?: Record<string, unknown>; limit?: number }) {
			const all = [...items].filter(([, d]) => Object.entries(o?.where ?? {}).every(([k, v]) => (d as Record<string, unknown>)[k] === v));
			return { items: all.slice(0, o?.limit ?? 100).map(([id, data]) => ({ id, data })), hasMore: all.length > (o?.limit ?? 100), cursor: "next" };
		},
		async get(id: string) {
			return items.get(id) ?? null;
		},
		async put(id: string, data: unknown) {
			items.set(id, data);
		},
		async delete(id: string) {
			return items.delete(id);
		},
	};
}

describe("config routes", () => {
	let storage: Record<string, ReturnType<typeof memColl>>;
	const changed: string[] = [];
	const routes = configRoutes({ settings: async () => ({ siteId: "default" }), changed: (c) => changed.push(c) });
	const call = (name: string, input: unknown) => (routes[name] as (typeof routes)[string]).handler({ input, storage } as ConfigCtx);
	const valid = (c: string, data: unknown) => saveBody(c as (typeof CONFIG_COLLECTIONS)[number]).safeParse({ data }).success;

	beforeEach(() => {
		storage = Object.fromEntries(CONFIG_COLLECTIONS.map((c) => [c, memColl()]));
		changed.length = 0;
	});

	it("has list, save and delete per collection, all plugins:manage", () => {
		expect(CONFIG_COLLECTIONS).toEqual(["goals", "funnels", "segments", "channel_rules", "agent_rules", "annotations"]);
		for (const c of CONFIG_COLLECTIONS) {
			expect(routes[`config/${c}/list`]?.permission).toBe("plugins:manage");
			expect(routes[`config/${c}/save`]?.permission).toBe("plugins:manage");
			expect(routes[`config/${c}/delete`]?.permission).toBe("plugins:manage");
		}
		const plugin = createPlugin() as unknown as { routes: Record<string, { permission?: string }> };
		expect(plugin.routes["config/goals/save"]?.permission).toBe("plugins:manage");
		expect(plugin.routes["config/goals/delete"]?.permission).toBe("plugins:manage");
		expect(plugin.routes["config/goals/list"]?.permission).toBe("plugins:manage");
	});

	it("saves with the site stamped, lists only this site and deletes", async () => {
		const saved = (await call("config/goals/save", { data: { name: "Pricing", type: "page", match: "is", value: "/pricing" } })) as { id: string; data: Record<string, unknown> };
		expect(saved.data.site).toBe("default");
		storage.goals?.items.set("foreign", { site: "other", name: "X", type: "page", match: "is", value: "/" });
		const list = (await call("config/goals/list", {})) as { items: Array<{ id: string }>; cursor: string | null };
		expect(list.items.map((i) => i.id)).toEqual([saved.id]);
		expect(list.cursor).toBeNull();
		await call("config/goals/save", { id: saved.id, data: { name: "Pricing 2", type: "page", match: "prefix", value: "/pricing" } });
		expect((storage.goals?.items.get(saved.id) as { name: string }).name).toBe("Pricing 2");
		expect(await call("config/goals/delete", { id: saved.id })).toEqual({ id: saved.id, deleted: true });
		expect(storage.goals?.items.has(saved.id)).toBe(false);
		expect(changed).toEqual(["goals", "goals", "goals"]);
	});

	it("binds a registered client site from the body and refuses unknown sites", async () => {
		invalidateRegistry();
		const store = { ...storage, sites: sitesColl([{ id: "blog" }]) } as unknown as ConfigCtx["storage"];
		const c = (name: string, input: unknown) => (routes[name] as (typeof routes)[string]).handler({ input, storage: store } as ConfigCtx);
		const saved = (await c("config/goals/save", { site: "blog", data: { name: "Blog goal", type: "page", match: "is", value: "/" } })) as { id: string; data: { site: string } };
		expect(saved.data.site).toBe("blog");
		expect(((await c("config/goals/list", { site: "blog" })) as { items: unknown[] }).items).toHaveLength(1);
		expect(((await c("config/goals/list", {})) as { items: unknown[] }).items).toHaveLength(0);
		await expect(c("config/goals/delete", { id: saved.id })).rejects.toMatchObject({ code: "not_found" });
		await expect(c("config/goals/list", { site: "shop" })).rejects.toMatchObject({ code: "unknown_site" });
		expect(await c("config/goals/delete", { id: saved.id, site: "blog" })).toEqual({ id: saved.id, deleted: true });
	});

	it("refuses to overwrite or delete another site's item", async () => {
		storage.goals?.items.set("foreign", { site: "other", name: "X", type: "page", match: "is", value: "/" });
		await expect(call("config/goals/delete", { id: "foreign" })).rejects.toMatchObject({ code: "not_found", status: 404 });
		await expect(call("config/goals/save", { id: "foreign", data: { name: "Y", type: "page", match: "is", value: "/" } })).rejects.toMatchObject({ code: "not_found" });
		await expect(call("config/goals/delete", { id: "missing" })).rejects.toMatchObject({ code: "not_found" });
	});

	it("rejects unsafe or invalid regex in every regex field", async () => {
		expect(valid("goals", { name: "G", type: "page", match: "regex", value: "(a+)+" })).toBe(false);
		expect(valid("goals", { name: "G", type: "page", match: "regex", value: "^/blog/" })).toBe(true);
		const step = (value: string, match = "regex") => ({ type: "page", match, value });
		expect(valid("funnels", { name: "F", steps: [step("/"), step("(?=x)")] })).toBe(false);
		expect(valid("segments", { name: "S", filters: [{ dim: "page", op: "not_regex", values: ["\\1"] }] })).toBe(false);
		expect(valid("segments", { name: "S", filters: [{ dim: "page", op: "regex", values: ["^/docs/"] }] })).toBe(true);
		expect(valid("channel_rules", { channel: "Partners", any: [{ medium: ".{1,500}" }], priority: 5 })).toBe(false);
		expect(valid("channel_rules", { channel: "Partners", any: [{ medium: "^partner$" }], priority: 5 })).toBe(true);
		expect(valid("agent_rules", { pattern: "(a|b)+c", mode: "regex", action: "robot" })).toBe(false);
		expect(valid("agent_rules", { pattern: "mybot", mode: "contains", action: "robot" })).toBe(true);
		await expect(call("config/goals/save", { data: { name: "G", type: "page", match: "regex", value: "(a+)+" } })).rejects.toThrow(/regex/i);
	});

	it("accepts funnels with 2 to 6 steps only", () => {
		const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ type: "page", match: "is", value: `/${i}` }));
		for (const n of [0, 1, 7]) expect(valid("funnels", { name: "F", steps: steps(n) }), String(n)).toBe(false);
		for (const n of [2, 6]) expect(valid("funnels", { name: "F", steps: steps(n) }), String(n)).toBe(true);
	});

	it("accepts the three funnel modes, keeps a record without mode valid and rejects others", () => {
		const steps = [{ type: "page", match: "is", value: "/" }, { type: "page", match: "is", value: "/b" }];
		for (const mode of ["sequential", "strict", "flexible"]) expect(valid("funnels", { name: "F", steps, mode }), mode).toBe(true);
		expect(valid("funnels", { name: "F", steps })).toBe(true);
		expect(valid("funnels", { name: "F", steps, mode: "loose" })).toBe(false);
	});

	it("validates channel rules, built-in switch-offs, user agent rules and annotations", async () => {
		expect(valid("channel_rules", { disables: "nope" })).toBe(false);
		expect(valid("channel_rules", { channel: "X", any: [{}], priority: 1 })).toBe(false);
		expect(valid("channel_rules", { channel: "X", any: [{ click: ["gclid"] }], priority: 1, extra: 1 })).toBe(false);
		expect(valid("agent_rules", { pattern: "x", mode: "glob", action: "robot" })).toBe(false);
		expect(valid("annotations", { ts: 1, kind: "manual", text: "Deploy" })).toBe(true);
		expect(valid("annotations", { ts: 1, kind: "other", text: "Deploy" })).toBe(false);
		expect(valid("annotations", { ts: 1, kind: "manual", text: "" })).toBe(false);
		expect(valid("goals", { name: "G", type: "page", match: "is", value: "/", site: "other" })).toBe(true);
		// A site field in the body is overwritten by the server.
		const r = (await call("config/goals/save", { data: { name: "G", type: "page", match: "is", value: "/" } })) as { data: { site: string } };
		expect(r.data.site).toBe("default");
	});

	it("stores annotation scopes, converts the path shortcut and rejects both", async () => {
		const scope = { v: 1, path: [{ op: "prefix", value: "/blog/" }] };
		expect(valid("annotations", { ts: 1, kind: "manual", text: "D", scope: { v: 1, path: [{ op: "is", value: "blog" }] } })).toBe(false);
		expect(valid("annotations", { ts: 1, kind: "manual", text: "D", scope: { v: 2 } })).toBe(false);
		expect(valid("annotations", { ts: 1, kind: "manual", text: "D", path: "blog" })).toBe(false);
		const a = (await call("config/annotations/save", { data: { ts: 1, kind: "manual", text: "A", scope } })) as { id: string; data: Record<string, unknown> };
		expect(a.data).toEqual({ ts: 1, kind: "manual", text: "A", scope, site: "default" });
		const b = (await call("config/annotations/save", { data: { ts: 2, kind: "manual", text: "B", path: "/x" } })) as { data: Record<string, unknown> };
		expect(b.data).toEqual({ ts: 2, kind: "manual", text: "B", scope: { v: 1, path: [{ op: "is", value: "/x" }] }, site: "default" });
		const c = (await call("config/annotations/save", { data: { ts: 3, kind: "manual", text: "C", path: "", scope: { v: 1 } } })) as { data: Record<string, unknown> };
		expect(c.data).toEqual({ ts: 3, kind: "manual", text: "C", site: "default" });
		await expect(call("config/annotations/save", { data: { ts: 1, kind: "manual", text: "X", path: "/x", scope } })).rejects.toMatchObject({ code: "scope_conflict", status: 400 });
	});

	it("lists the annotations of a range newest first, normalized, with truncated", async () => {
		const day = (d: number) => Date.UTC(2026, 2, d, 12) / 1000;
		storage.annotations?.items.set("a", { site: "default", ts: day(2), kind: "manual", text: "A", scope: { v: 1, path: [{ op: "is", value: "/a" }] } });
		storage.annotations?.items.set("b", { site: "default", ts: day(3), kind: "manual", text: "B" });
		storage.annotations?.items.set("out", { site: "default", ts: day(20), kind: "manual", text: "Out" });
		storage.annotations!.query = async (o?: { where?: Record<string, unknown> }) => {
			const ts = o?.where?.ts as { gte: number; lt: number };
			const all = [...storage.annotations!.items].filter(([, d]) => (d as { ts: number }).ts >= ts.gte && (d as { ts: number }).ts < ts.lt).sort((x, y) => (y[1] as { ts: number }).ts - (x[1] as { ts: number }).ts);
			return { items: all.map(([id, data]) => ({ id, data })), hasMore: false, cursor: "" };
		};
		const r = (await call("config/annotations/list", { from: "2026-03-01", to: "2026-03-07" })) as { items: Array<{ id: string; data: Record<string, unknown> }>; truncated: boolean };
		expect(r.items.map((i) => i.id)).toEqual(["b", "a"]);
		expect(r.items[1]?.data).toEqual({ site: "default", ts: day(2), kind: "manual", text: "A", scope: { v: 1, path: [{ op: "is", value: "/a" }] } });
		expect(r.truncated).toBe(false);
	});

	it("caps regex user agent rules at 50", async () => {
		for (let i = 0; i < 50; i++) storage.agent_rules?.items.set(`r${i}`, { site: "default", pattern: `bot${i}`, mode: "regex", action: "robot" });
		await expect(call("config/agent_rules/save", { data: { pattern: "^x", mode: "regex", action: "robot" } })).rejects.toMatchObject({ code: "too_many_rules" });
		// Replacing an existing regex rule and adding a plain rule still work.
		await call("config/agent_rules/save", { id: "r1", data: { pattern: "^y", mode: "regex", action: "robot" } });
		await call("config/agent_rules/save", { data: { pattern: "plainbot", mode: "contains", action: "robot" } });
	});
});
