/** Dashboard routes: permissions, site binding, import, export and copy. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { CONFIG_COLLECTIONS, configRoutes } from "../src/routes/config.js";
import { type DashCtx, dashboardRoutes } from "../src/routes/dashboards.js";
import { memColl } from "./agent.helpers.js";
import { dashInput, kpi } from "./fixtures/dashboards.js";
import { MemoryKv, schemaDb, sitesColl } from "./helpers.js";
import { mailDeps } from "../src/dashboards/mail.js";
import { seed } from "./fixtures/seed.js";
import type { Settings } from "../src/settings.js";
import { T0 } from "./agent.helpers.js";

const settings = async () => ({ siteId: "default" });
const routes = dashboardRoutes({ settings, config: configRoutes({ settings }), remoteIds: () => ["shop"], now: () => 1000 });
type Name = keyof typeof routes;

let storage: DashCtx["storage"];
const call = <T = Record<string, unknown>>(name: Name, input: unknown) => routes[name].handler({ input, storage } as DashCtx) as Promise<T>;
const fails = (name: Name, input: unknown) => call(name, input).then(() => null, (e: { code?: string; status?: number }) => e.code ?? String(e));

beforeEach(() => {
	invalidateRegistry();
	storage = { dashboards: memColl(), sites: sitesColl([{ id: "blog" }]), ...Object.fromEntries(CONFIG_COLLECTIONS.map((c) => [c, memColl()])) };
});

describe("dashboard routes", () => {
	it("reads under plugins:read and writes under plugins:manage", () => {
		const perms = Object.fromEntries(Object.entries(routes).map(([n, r]) => [n, r.permission]));
		expect(perms).toEqual({
			"dashboards/list": "plugins:read",
			"dashboards/get": "plugins:read",
			"dashboards/save": "plugins:manage",
			"dashboards/delete": "plugins:manage",
			"dashboards/export": "plugins:manage",
			"dashboards/import": "plugins:manage",
			"dashboards/copy": "plugins:manage",
			"dashboards/email/status": "plugins:read",
			"dashboards/email/save": "plugins:manage",
			"dashboards/email/send-test": "plugins:manage",
		});
	});

	it("binds every call to the site: local, client and remote ids; unknown ids fail", async () => {
		const local = await call<{ id: string; site: string }>("dashboards/save", { dashboard: dashInput() });
		const client = await call<{ id: string; site: string }>("dashboards/save", { dashboard: dashInput({ name: "Blog" }), site: "blog" });
		const remote = await call<{ id: string; site: string }>("dashboards/save", { dashboard: dashInput({ name: "Shop" }), site: "shop" });
		expect([local.site, client.site, remote.site]).toEqual(["default", "blog", "shop"]);
		expect((await call<{ items: Array<{ name: string }> }>("dashboards/list", { site: "shop" })).items.map((d) => d.name)).toEqual(["Shop"]);
		expect((await call<{ items: unknown[] }>("dashboards/list", {})).items).toHaveLength(1);
		expect(await fails("dashboards/list", { site: "nope" })).toBe("unknown_site");
		expect(await fails("dashboards/get", { id: client.id })).toBe("not_found");
		expect(await call("dashboards/get", { id: client.id, site: "blog" })).toMatchObject({ name: "Blog" });
		expect(await fails("dashboards/delete", { id: client.id })).toBe("not_found");
		expect(await call("dashboards/delete", { id: client.id, site: "blog" })).toEqual({ id: client.id, deleted: true });
	});

	it("deleting a dashboard revokes its share link", async () => {
		const d = await call<{ id: string }>("dashboards/save", { dashboard: dashInput() });
		const shares = memColl({
			s1: { site: "default", dashboard: d.id, prefix: "abcdefgh", hash: "x", pw: {}, expires: null, created: 1, views: 2, lastViewed: null },
			s2: { site: "default", dashboard: d.id, prefix: "bcdefghi", hash: "x", expires: 4_102_444_800, created: 1, views: 1, lastViewed: null, label: "Team" },
		});
		storage.shares = shares;
		// Link count, the most permissive state and that link's label and expiry.
		expect((await call<{ shares: Record<string, unknown> }>("dashboards/list", {})).shares).toEqual({ [d.id]: { count: 2, state: "open", views: 3, label: "Team", expires: 4_102_444_800 } });
		await call("dashboards/delete", { id: d.id });
		expect(shares.items.size).toBe(0);
	});

	it("answers typed errors from the schema", async () => {
		expect(await fails("dashboards/save", { dashboard: dashInput({ tiles: Array.from({ length: 13 }, () => kpi("visitors")) }) })).toBe("too_many_tiles");
		expect(await fails("dashboards/save", { dashboard: dashInput({ tiles: [{ id: "abc123", report: "dimension_values", kind: "table", w: 1 }] }) })).toBe("invalid_dashboard");
		expect(await fails("dashboards/import", { sites: ["default"], template: { kind: "dashboard-template", v: 1, name: "x", tiles: [{ id: "bad001", report: "users", kind: "kpi", w: 1 }], defaults: { range: "7d", compare: "none", filters: [] }, viewer: { ranges: ["7d"], compare: false } } })).toBe("invalid_template");
	});

	it("imports a built-in template into a local and a client site", async () => {
		const r = await call<{ created: Array<{ site: string; id: string }>; failed: unknown[] }>("dashboards/import", { sites: ["default", "blog"], builtin: "overview" });
		expect(r.failed).toEqual([]);
		expect(r.created.map((c) => c.site)).toEqual(["default", "blog"]);
		expect((await call<{ items: Array<{ name: string }> }>("dashboards/list", { site: "blog" })).items.map((d) => d.name)).toEqual(["Overview"]);
	});

	it("exports with dependencies and copies to three sites through the config save routes", async () => {
		const seg = (await routesConfig("segments", { name: "Germany", filters: [{ dim: "country", op: "is", values: ["DE"] }] })).id;
		const src = await call<{ id: string }>("dashboards/save", { dashboard: dashInput({ defaults: { range: "30d", compare: "none", segment: seg, filters: [] } }) });
		const tpl = await call<{ defaults: { segment: string }; dependencies: { segments: unknown[] } }>("dashboards/export", { id: src.id, withDependencies: true });
		expect(tpl.defaults.segment).toBe("Germany");
		expect(tpl.dependencies.segments).toEqual([{ name: "Germany", filters: [{ dim: "country", op: "is", values: ["DE"] }] }]);

		const r = await call<{ created: Array<{ site: string; id: string }>; dependencies: Array<{ site: string }>; unresolved: Array<{ site: string }>; failed: unknown[] }>("dashboards/copy", {
			id: src.id,
			sites: ["default", "blog", "shop"],
			createDependencies: true,
		});
		expect(r.failed).toEqual([]);
		expect(r.created.map((c) => c.site)).toEqual(["default", "blog", "shop"]);
		expect(new Set([src.id, ...r.created.map((c) => c.id)]).size).toBe(4);
		// The local site reuses its segment; the client site gets one through the config route; a remote site's config is not here.
		expect(r.dependencies.map((d) => d.site)).toEqual(["blog"]);
		expect(r.unresolved).toEqual([{ site: "shop", kind: "segments", name: "Germany", tile: "defaults" }]);
		const segs = [...(storage.segments as ReturnType<typeof memColl>).items.values()] as Array<{ site: string }>;
		expect(segs.map((s) => s.site).sort()).toEqual(["blog", "default"]);
		const copy = await call<Record<string, unknown>>("dashboards/get", { id: r.created[1]?.id, site: "blog" });
		expect(JSON.stringify(copy)).not.toContain(src.id);
	});

	it("dependency creation applies the config validation", async () => {
		const template = {
			kind: "dashboard-template",
			v: 1,
			name: "Bad dep",
			tiles: [{ id: "fun001", report: "funnels", kind: "table", w: 1, params: { funnel: "Loop" } }, kpi("visitors")],
			defaults: { range: "7d", compare: "none", filters: [] },
			viewer: { ranges: ["7d"], compare: false },
			dependencies: { funnels: [{ name: "Loop", steps: [{ type: "page", match: "regex", value: "(a+)+" }, { type: "page", match: "is", value: "/" }] }] },
		};
		const r = await call<{ created: unknown[]; failed: Array<{ site: string }> }>("dashboards/import", { sites: ["default"], template, createDependencies: true });
		expect(r.created).toEqual([]);
		expect(r.failed).toMatchObject([{ site: "default" }]);
	});
});

async function routesConfig(c: string, data: unknown) {
	const r = configRoutes({ settings })[`config/${c}/save`];
	return (await r?.handler({ input: { data }, storage: storage as never })) as { id: string };
}

describe("scheduled email routes", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let full: Settings;
	let sent: Array<Record<string, unknown>>;
	let kv: MemoryKv;
	let clock = T0;
	const mailRoutes = () =>
		dashboardRoutes({
			settings,
			config: configRoutes({ settings }),
			remoteIds: () => ["shop"],
			now: () => clock,
			mail: async () => mailDeps({ db: async () => env.db, settings: async () => full }, { input: null, storage: { segments: memColl(), goals: memColl() }, kv }, full, "https://example.org"),
		});
	const ADMIN = { email: "owner@example.com", role: 50 };
	const EDITOR = { email: "editor@example.com", role: 40 };
	const provider = { send: async (m: Record<string, unknown>) => void sent.push(m) };
	type MName = keyof ReturnType<typeof mailRoutes>;
	const as = <T = Record<string, unknown>>(name: MName, input: unknown, user: { email: string; role: number } | undefined = ADMIN, email: typeof provider | undefined = provider) =>
		mailRoutes()[name].handler({ input, storage, user, kv, email } as DashCtx) as Promise<T>;
	const err = (name: MName, input: unknown, user?: { email: string; role: number }, email?: typeof provider) =>
		as(name, input, user, email).then(() => null, (e: { code?: string; status?: number }) => e.code ?? String(e));
	const schedule = (over: Record<string, unknown> = {}) => ({ enabled: true, frequency: "weekly", recipients: ["reports@example.com", "board@example.com"], range: "7d", compare: false, ...over });

	beforeAll(async () => {
		env = await schemaDb();
		full = await seed(env, "UTC");
	});
	beforeEach(() => {
		sent = [];
		kv = new MemoryKv();
		clock = T0;
	});

	it("saves a schedule with emailNext at the top level and none inside email", async () => {
		const d = await call<{ id: string }>("dashboards/save", { dashboard: dashInput() });
		const r = await as<Record<string, unknown> & { email: Record<string, unknown> }>("dashboards/email/save", { id: d.id, email: schedule() });
		expect(r.email).toMatchObject({ enabled: true, weekday: 1, hour: 8, recipients: ["reports@example.com", "board@example.com"] });
		const stored = (storage.dashboards as ReturnType<typeof memColl>).items.get(d.id) as Record<string, unknown> & { email: Record<string, unknown> };
		expect(stored.emailNext).toBe(Date.UTC(2026, 2, 16, 8) / 1000);
		expect(stored.email).not.toHaveProperty("emailNext");
		// Disabling removes emailNext.
		await as("dashboards/email/save", { id: d.id, email: schedule({ enabled: false }) });
		expect((storage.dashboards as ReturnType<typeof memColl>).items.get(d.id)).not.toHaveProperty("emailNext");
	});

	it("refuses 13 distinct requests, 7 with compare, bad recipients and a remote site", async () => {
		const pages = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `pg${String(i).padStart(4, "0")}`, report: "pages", kind: "table", w: 1, limit: 5 + i }));
		const seven = await call<{ id: string }>("dashboards/save", { dashboard: dashInput({ tiles: pages(7) }) });
		expect(await err("dashboards/email/save", { id: seven.id, email: schedule({ compare: true }) })).toBe("too_many_requests");
		expect(await err("dashboards/email/save", { id: seven.id, email: schedule({ recipients: ["a@example.com\nBcc: b@example.com"] }) })).not.toBeNull();
		expect(await err("dashboards/email/save", { id: seven.id, email: schedule({ recipients: ["a@example.com,b@example.com"] }) })).not.toBeNull();
		expect(await err("dashboards/email/save", { id: seven.id, email: schedule({ subject: "Hi\u0000" }) })).not.toBeNull();
		const shop = await call<{ id: string }>("dashboards/save", { dashboard: dashInput(), site: "shop" });
		expect(await err("dashboards/email/save", { id: shop.id, site: "shop", email: schedule() })).toBe("remote_site_not_schedulable");
	});

	it("a dashboard with 12 distinct requests can be scheduled; 13 cannot (only reachable past the tile limit)", async () => {
		const tiles = Array.from({ length: 12 }, (_, i) => ({ id: `pg${String(i).padStart(4, "0")}`, report: "pages", kind: "table", w: 1, limit: 5 + i }));
		const d = await call<{ id: string; tiles: never[]; defaults: never }>("dashboards/save", { dashboard: dashInput({ tiles }) });
		expect(await err("dashboards/email/save", { id: d.id, email: schedule() })).toBeNull();
		const { checkSchedule } = await import("../src/dashboards/mail.js");
		const thirteen = { tiles: [...d.tiles, { id: "zz0001", report: "devices", kind: "table", w: 1 } as never], defaults: d.defaults };
		expect(() => checkSchedule(thirteen, { enabled: true, compare: false }, 0)).toThrow(expect.objectContaining({ code: "too_many_requests" }));
	});

	it("an Editor sees recipientCount and no recipients; an Admin sees both", async () => {
		const d = await call<{ id: string }>("dashboards/save", { dashboard: dashInput() });
		await as("dashboards/email/save", { id: d.id, email: schedule() });
		const ed = await as<{ items: Array<Record<string, unknown>> }>("dashboards/list", {}, EDITOR);
		expect(ed.items[0]).toMatchObject({ recipientCount: 2 });
		expect(JSON.stringify(ed)).not.toContain("@");
		const edGet = await as<Record<string, unknown>>("dashboards/get", { id: d.id }, EDITOR);
		expect(edGet.recipientCount).toBe(2);
		expect(JSON.stringify(edGet)).not.toContain("@");
		const noUser = await mailRoutes()["dashboards/get"].handler({ input: { id: d.id }, storage, kv } as DashCtx);
		expect(JSON.stringify(noUser)).not.toContain("@");
		const ad = await as<{ email: { recipients: string[] }; recipientCount: number }>("dashboards/get", { id: d.id }, ADMIN);
		expect(ad.email.recipients).toEqual(["reports@example.com", "board@example.com"]);
		expect(ad.recipientCount).toBe(2);
	});

	it("dashboards/save and import with an email in the body keep the stored one; export and copy drop it", async () => {
		const d = await call<{ id: string }>("dashboards/save", { dashboard: dashInput() });
		await as("dashboards/email/save", { id: d.id, email: schedule() });
		const coll = storage.dashboards as ReturnType<typeof memColl>;
		const before = (coll.items.get(d.id) as { email: unknown; emailNext: number });
		await call("dashboards/save", { dashboard: { ...dashInput({ name: "Renamed" }), id: d.id, email: schedule({ recipients: ["attacker@example.com"] }), emailNext: 1 } });
		const after = coll.items.get(d.id) as { name: string; email: unknown; emailNext: number };
		expect(after.name).toBe("Renamed");
		expect(after.email).toEqual(before.email);
		expect(after.emailNext).toBe(before.emailNext);
		const created = await call<{ id: string; email?: unknown }>("dashboards/save", { dashboard: { ...dashInput(), email: schedule() } });
		expect(created.email).toBeUndefined();

		const tpl = await call<Record<string, unknown>>("dashboards/export", { id: d.id });
		expect(tpl).not.toHaveProperty("email");
		expect(JSON.stringify(tpl)).not.toContain("@");
		const imp = await call<{ created: Array<{ id: string }>; failed: unknown[] }>("dashboards/import", { sites: ["blog"], template: { ...tpl, email: schedule() } });
		expect(imp.failed).toEqual([]);
		expect(coll.items.get(imp.created[0]?.id as string)).not.toHaveProperty("email");
		const copy = await call<{ created: Array<{ site: string; id: string }> }>("dashboards/copy", { id: d.id, sites: ["blog"] });
		const copied = coll.items.get(copy.created[0]?.id as string) as Record<string, unknown>;
		expect(copied).not.toHaveProperty("email");
		expect(copied).not.toHaveProperty("emailNext");
	});

	it("send-test goes to the caller only, ignores an address in the body, needs a user and a provider, once a minute", async () => {
		const d = await call<{ id: string }>("dashboards/save", { dashboard: dashInput() });
		expect(await as("dashboards/email/send-test", { id: d.id, to: "someone@example.com", recipients: ["x@example.com"] })).toEqual({ sent: true, to: "owner@example.com" });
		expect(sent.map((m) => m.to)).toEqual(["owner@example.com"]);
		expect(sent[0]?.cc).toBeUndefined();
		expect(await err("dashboards/email/send-test", { id: d.id })).toBe("too_many_requests");
		clock += 61;
		expect(await as("dashboards/email/send-test", { id: d.id })).toMatchObject({ sent: true });
		clock += 61;
		const noUser = await mailRoutes()["dashboards/email/send-test"].handler({ input: { id: d.id }, storage, kv, email: provider } as DashCtx).then(() => null, (e: { code?: string }) => e.code);
		expect(noUser).toBe("no_user");
		const noProvider = await mailRoutes()["dashboards/email/send-test"].handler({ input: { id: d.id }, storage, kv, user: ADMIN } as DashCtx).then(() => null, (e: { code?: string }) => e.code);
		expect(noProvider).toBe("no_provider");
		expect(sent).toHaveLength(2);
	});

	it("status reports provider presence with the host text", async () => {
		expect(await as("dashboards/email/status", {})).toMatchObject({ provider: true, scheduled: 0 });
		const off = await mailRoutes()["dashboards/email/status"].handler({ input: {}, storage, kv } as DashCtx);
		expect(off).toMatchObject({ provider: false, message: "No email provider is configured. Install and activate an email provider plugin, then select it in Settings > Email." });
	});
});
