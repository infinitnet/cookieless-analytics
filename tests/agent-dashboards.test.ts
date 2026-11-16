/** Agent dashboard routes: listing by the key's sites, the runner's result, save limits, delete. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { clearReportCache } from "../src/query/reports/index.js";
import type { Settings } from "../src/settings.js";
import { agentHarness } from "./agent.helpers.js";
import { dashInput, kpi, storedDash } from "./fixtures/dashboards.js";
import { seed } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";

describe("agent dashboards", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
	});
	beforeEach(() => {
		clearReportCache();
		invalidateRegistry();
	});

	async function harness() {
		const h = await agentHarness(env, settings, { remoteIds: () => ["shop"] });
		h.storage.sites.items.set("blog", { id: "blog", label: "Blog", key: "blogkkkkkkkkkkkkkkkk", hosts: ["blog.example.net"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 });
		h.storage.dashboards.items.set("local0000000", storedDash("local0000000", "default", [kpi("visitors"), kpi("sessions"), { id: "tab001", report: "channels", kind: "table", w: 3 }], "Local"));
		h.storage.dashboards.items.set("blog00000000", storedDash("blog00000000", "blog", [kpi("visitors")], "Blog"));
		return h;
	}

	it("lists the dashboards of the key's sites, or of one site", async () => {
		const h = await harness();
		const all = await h.key(["read:analytics"]);
		expect((await h.call("agent/v1/dashboards", { token: all })).json.data.items.map((d: { name: string }) => d.name).sort()).toEqual(["Blog", "Local"]);
		expect((await h.call("agent/v1/dashboards", { token: all, input: { site: "blog" } })).json.data.items.map((d: { name: string }) => d.name)).toEqual(["Blog"]);
		const blogOnly = await h.key(["read:analytics"], undefined, ["blog"]);
		expect((await h.call("agent/v1/dashboards", { token: blogOnly })).json.data.items.map((d: { name: string }) => d.name)).toEqual(["Blog"]);
		expect((await h.call("agent/v1/dashboards", { token: blogOnly, input: { site: "default" } })).status).toBe(404);
		expect((await h.call("agent/v1/dashboards", { token: all, input: { site: "shop" } })).json).toMatchObject({ ok: false, error: "site_not_allowed" });
	});

	it("runs a dashboard: KPI tiles of one report share a request", async () => {
		const h = await harness();
		const token = await h.key(["read:analytics"]);
		const r = await h.call("agent/v1/dashboards/data", { token, input: { id: "local0000000", range: "30d", compare: "previous" } });
		expect(r.status).toBe(200);
		expect(r.json.data).toMatchObject({ id: "local0000000", name: "Local", requests: 2, compare: "previous" });
		expect(r.json.data.tiles.map((t: { id: string }) => t.id)).toHaveLength(3);
		expect(r.json.data.tiles[0].result.data.totals.visitors).toBeGreaterThan(0);
		expect(r.json.meta).toMatchObject({ site: "default", from: r.json.data.range.from });
		expect((await h.call("agent/v1/dashboards/data", { token, input: { id: "blog00000000" } })).status).toBe(404);
		expect((await h.call("agent/v1/dashboards/data", { token, input: { id: "blog00000000", site: "blog" } })).status).toBe(200);
		expect((await h.call("agent/v1/dashboards/data", { token, input: { id: "local0000000", range: "forever" } })).json.error).toBe("invalid_input");
	});

	it("returns the matching annotations per series tile", async () => {
		const h = await harness();
		const ts = 1_773_230_400; // 2026-03-11, inside the seeded range
		h.storage.annotations.items.set("w", { site: "default", ts, kind: "release", text: "Wide" });
		h.storage.annotations.items.set("p", { site: "default", ts, kind: "release", text: "Other page", scope: { v: 1, path: [{ op: "is", value: "/nowhere" }] } });
		const line = { id: "line01", report: "timeseries", kind: "line", metrics: ["sessions"], w: 3, filters: [{ dim: "page", op: "is", values: ["/"] }] };
		h.storage.dashboards.items.set("series000000", storedDash("series000000", "default", [line as never, kpi("visitors")], "Series"));
		const r = await h.call("agent/v1/dashboards/data", { token: await h.key(["read:analytics"]), input: { id: "series000000", range: "30d" } });
		expect(r.status).toBe(200);
		expect(r.json.data.tiles[0].result.data.annotations.map((a: { text: string }) => a.text)).toEqual(["Wide"]);
		expect(r.json.data.tiles[1].result.data.annotations).toBeUndefined();
	});

	it("never accepts or returns the schedule: a save carrying email keeps the stored one, no response has an address", async () => {
		const h = await harness();
		const email = { enabled: true, frequency: "weekly", weekday: 1, monthday: 1, hour: 8, recipients: ["reports@example.com"], range: "7d", compare: false };
		const rec = h.storage.dashboards.items.get("local0000000") as Record<string, unknown>;
		h.storage.dashboards.items.set("local0000000", { ...rec, email, emailNext: 1_800_000_000 });
		const token = await h.key(["read:analytics", "write:dashboards"]);
		const list = await h.call("agent/v1/dashboards", { token });
		expect(list.text).not.toContain("@");
		const data = await h.call("agent/v1/dashboards/data", { token, input: { id: "local0000000" } });
		expect(data.status).toBe(200);
		expect(data.text).not.toContain("@");
		const { id: _i, site: _s, v: _v, created: _c, updated: _u, ...body } = rec;
		const saved = await h.call("agent/v1/dashboards/save", { token, input: { dashboard: { ...body, id: "local0000000", name: "Renamed", email: { ...email, recipients: ["attacker@example.com"] }, emailNext: 1 } } });
		expect(saved.status).toBe(200);
		expect(saved.text).not.toContain("@");
		expect(saved.json.data).not.toHaveProperty("email");
		const after = h.storage.dashboards.items.get("local0000000") as Record<string, unknown>;
		expect(after).toMatchObject({ name: "Renamed", email, emailNext: 1_800_000_000 });
	});

	it("save enforces the record schema and limits; delete removes", async () => {
		const h = await harness();
		const token = await h.key(["write:dashboards"]);
		const save = (dashboard: unknown, site?: string) => h.call("agent/v1/dashboards/save", { token, input: { dashboard, ...(site ? { site } : {}) } });
		const ok = await save(dashInput());
		expect(ok.status).toBe(200);
		expect(ok.json.data).toMatchObject({ site: "default", v: 1, name: "Weekly" });
		expect((await save(dashInput({ tiles: Array.from({ length: 13 }, () => kpi("visitors")) }))).json).toMatchObject({ ok: false, error: "too_many_tiles" });
		expect((await save(dashInput({ tiles: [{ id: "abc123", report: "dimension_values", kind: "table", w: 1 }] }))).json).toMatchObject({ ok: false, error: "invalid_dashboard" });
		expect((await save(dashInput({ tiles: [{ id: "abc123", report: "overview", kind: "kpi", w: 1 }] }))).json.error).toBe("invalid_dashboard");
		// Blog holds one stored dashboard already.
		for (let i = 0; i < 18; i++) await save(dashInput(), "blog");
		expect((await save(dashInput(), "blog")).status).toBe(200);
		expect((await save(dashInput(), "blog")).json.error).toBe("too_many_dashboards");
		const del = await h.call("agent/v1/dashboards/delete", { token, input: { id: ok.json.data.id } });
		expect(del.json.data).toEqual({ id: ok.json.data.id, deleted: true });
		expect((await h.call("agent/v1/dashboards/delete", { token, input: { id: ok.json.data.id } })).status).toBe(404);
		// write:dashboards alone cannot read.
		expect((await h.call("agent/v1/query", { token, input: { report: "overview", query: { from: "2026-03-10", to: "2026-03-12" } } })).text).toBe("{}");
	});
});
