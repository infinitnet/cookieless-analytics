/** Public `share/view` route: token, expiry, password, lock, range and compare rules, view counting. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCredentialCache } from "../src/dashboards/password.js";
import { createShare, deleteShare, deleteSharesOf } from "../src/dashboards/shares.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { basicPassword, type ShareViewCtx, shareViewRoute } from "../src/routes/share-view.js";
import type { Settings } from "../src/settings.js";
import { memColl, T0 } from "./agent.helpers.js";
import { kpi, storedDash } from "./fixtures/dashboards.js";
import { seed } from "./fixtures/seed.js";
import { MemoryKv, schemaDb } from "./helpers.js";

const basic = (user: string, pass: string) => `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${pass}`)))}`;

describe("share/view route", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
	});

	let now = T0;
	let afters: Array<() => Promise<unknown>>;
	let storage: ShareViewCtx["storage"] & { shares: ReturnType<typeof memColl>; dashboards: ReturnType<typeof memColl> };
	let kv: MemoryKv;
	const dispatch = vi.fn();
	const route = () =>
		shareViewRoute({
			db: async () => {
				dispatch();
				return env.db;
			},
			settings: async () => settings,
			now: () => now,
			after: (fn) => void afters.push(fn),
		});

	beforeEach(() => {
		clearReportCache();
		clearCredentialCache();
		invalidateRegistry();
		dispatch.mockClear();
		now = T0;
		afters = [];
		kv = new MemoryKv();
		const many = Array.from({ length: 7 }, (_, i) => ({ id: `m0000${i}`, report: "pages" as const, kind: "table" as const, w: 1 as const, limit: 5 + i }));
		storage = {
			shares: memColl(),
			dashboards: memColl({
				dash00000001: { ...storedDash("dash00000001", "default", [kpi("visitors"), kpi("sessions"), { id: "tab001", report: "channels", kind: "table", w: 3 }], "Weekly"), viewer: { ranges: ["7d", "30d"], compare: true } },
				dash00000002: { ...storedDash("dash00000002", "default", many, "Many"), viewer: { ranges: ["7d"], compare: true } },
			}),
			segments: memColl(),
			goals: memColl(),
		};
	});
	afterEach(() => vi.restoreAllMocks());

	const view = async (path: string, headers: Record<string, string> = {}) => route().handler({ request: new Request(`https://example.org${path}`, { headers }), kv, storage } as ShareViewCtx);
	const share = async (dashboard = "dash00000001", o: { password?: string; expires?: number } = {}) => (await createShare(storage.shares, { site: "default", dashboard, ...o }, now)).token;
	const runAfters = async () => {
		for (const f of afters.splice(0)) await f();
	};
	const views = () => [...storage.shares.items.values()].map((s) => (s as { views: number }).views);

	it("renders an open link and counts the view after the response", async () => {
		const token = await share();
		const r = await view(`/_/s/${token}`);
		expect(r).toMatchObject({ status: 200, cache: "open" });
		expect(r.html).toContain("<title>Weekly</title>");
		expect(r.html).toContain('aria-current="page">Last 7 days');
		expect(views()).toEqual([0]);
		await runAfters();
		expect(storage.shares.items.values().next().value).toMatchObject({ views: 1, lastViewed: now });
	});

	it("a HEAD request renders the same page but is not counted as a view", async () => {
		const token = await share();
		const r = await route().handler({ request: new Request(`https://example.org/_/s/${token}`, { method: "HEAD" }), kv, storage } as ShareViewCtx);
		expect(r).toMatchObject({ status: 200, cache: "open" });
		expect(afters).toHaveLength(0);
	});

	it("answers 404 for unknown, wrong, expired, revoked tokens and the direct route path, without counting", async () => {
		const token = await share("dash00000001", { expires: T0 + 100 });
		const [prefix] = token.split(".");
		for (const path of [
			`/_/s/zzzzzzzz.${"A".repeat(43)}`,
			`/_/s/${prefix}.${"A".repeat(43)}`,
			"/_/s/garbage",
			"/_/s/",
			`/_/s/${token}/x`,
			`/_emdash/api/plugins/cookieless-analytics/share/view`,
			`/_emdash/api/plugins/cookieless-analytics/share/view/${token}`,
			`/other/${token}`,
		])
			expect(await view(path)).toEqual({ status: 404 });
		now = T0 + 100;
		expect(await view(`/_/s/${token}`)).toEqual({ status: 404 });
		now = T0;
		storage.shares.items.clear();
		expect(await view(`/_/s/${token}`)).toEqual({ status: 404 });
		expect(afters).toHaveLength(0);
	});

	it("several links of one dashboard: revoking one of three leaves two working", async () => {
		const a = await share("dash00000001", { password: "first-password" });
		const b = await share();
		const c = await share("dash00000001", { expires: T0 + 1000 });
		const ids = [...storage.shares.items.keys()];
		await deleteShare(storage.shares, "default", ids[1] as string);
		expect(await view(`/_/s/${b}`)).toEqual({ status: 404 });
		expect((await view(`/_/s/${a}`, { authorization: basic("u", "first-password") })).status).toBe(200);
		expect((await view(`/_/s/${c}`)).status).toBe(200);
	});

	it("a deleted dashboard leaves no share record and its tokens answer 404", async () => {
		const a = await share();
		const b = await share("dash00000001", { password: "second-password" });
		await share("dash00000002");
		storage.dashboards.items.delete("dash00000001");
		await deleteSharesOf(storage.shares, "default", "dash00000001");
		expect([...storage.shares.items.values()].map((x) => (x as { dashboard: string }).dashboard)).toEqual(["dash00000002"]);
		expect(await view(`/_/s/${a}`)).toEqual({ status: 404 });
		expect(await view(`/_/s/${b}`)).toEqual({ status: 404 });
	});

	it("answers 404 when the dashboard is gone", async () => {
		const token = await share();
		storage.dashboards.items.delete("dash00000001");
		expect(await view(`/_/s/${token}`)).toEqual({ status: 404 });
	});

	it("asks for a password, ignores the user, accepts UTF-8 and caches private", async () => {
		const token = await share("dash00000001", { password: "pässwörd-ñ" });
		const [prefix] = token.split(".");
		expect(await view(`/_/s/${token}`)).toEqual({ status: 401, realm: `View ${prefix}` });
		expect(await view(`/_/s/${token}`, { authorization: basic("x", "wrong-password") })).toEqual({ status: 401, realm: `View ${prefix}` });
		const ok = await view(`/_/s/${token}`, { authorization: basic("anyone", "pässwörd-ñ") });
		expect(ok).toMatchObject({ status: 200, cache: "private" });
		expect(await view(`/_/s/${token}`, { authorization: basic("", "pässwörd-ñ") })).toMatchObject({ status: 200 });
		expect(afters).toHaveLength(2);
	});

	it("locks after the tenth failure with 429 and Retry-After, per share; success resets; the lock expires", async () => {
		const token = await share("dash00000001", { password: "right-password" });
		const other = await share("dash00000002", { password: "right-password" });
		await view(`/_/s/${token}`, { authorization: basic("u", "wrong-1") });
		await view(`/_/s/${token}`, { authorization: basic("u", "right-password") });
		expect(await kv.get(`share:lock:${[...storage.shares.items.keys()][0]}`)).toBeNull();
		for (let i = 0; i < 10; i++) expect((await view(`/_/s/${token}`, { authorization: basic("u", `wrong-${i}xx`) })).status).toBe(401);
		const locked = await view(`/_/s/${token}`, { authorization: basic("u", "right-password") });
		expect(locked).toEqual({ status: 429, retryAfter: 900 });
		expect((await view(`/_/s/${other}`, { authorization: basic("u", "right-password") })).status).toBe(200);
		now = T0 + 900;
		expect((await view(`/_/s/${token}`, { authorization: basic("u", "right-password") })).status).toBe(200);
	});

	it("resolves ?r= within viewer.ranges and ?c=1 only when allowed and at most 6 distinct requests", async () => {
		const token = await share();
		expect((await view(`/_/s/${token}?r=30d`)).html).toContain('aria-current="page">Last 30 days');
		expect((await view(`/_/s/${token}?r=12m`)).html).toContain('aria-current="page">Last 7 days');
		const cmp = (await view(`/_/s/${token}?c=1`)).html ?? "";
		expect(cmp).toContain('href="?r=7d" aria-current="true">Compare with previous period');
		expect(cmp).toContain('href="?r=30d&amp;c=1"');
		const many = await share("dash00000002");
		const m = (await view(`/_/s/${many}?c=1`)).html ?? "";
		expect(m).not.toContain("Compare with previous period");
		expect(m).not.toContain("&amp;c=1");
		storage.dashboards.items.set("dash00000001", { ...(storage.dashboards.items.get("dash00000001") as object), viewer: { ranges: ["7d"], compare: false } });
		const off = (await view(`/_/s/${token}?c=1`)).html ?? "";
		expect(off).not.toContain("Compare with previous period");
		expect(off).not.toContain("&amp;c=1");
	});

	it("shows matching annotations only when viewer.annotations is on", async () => {
		const line = { id: "line01", report: "timeseries" as const, kind: "line" as const, metrics: ["sessions"], w: 3 as const };
		const base = storedDash("dash00000003", "default", [line], "Notes");
		storage.dashboards.items.set("dash00000003", { ...base, viewer: { ranges: ["7d"], compare: false } });
		const annotations = memColl({ n1: { site: "default", ts: T0 - 86_400, kind: "release", text: "Shipped <v2>" } });
		(storage as Record<string, unknown>).annotations = annotations;
		const query = vi.spyOn(annotations, "query");
		const token = await share("dash00000003");
		const off = await view(`/_/s/${token}`);
		expect(off.status).toBe(200);
		expect(off.html).not.toContain("data-marker");
		expect(off.html).not.toContain("Shipped");
		expect(query).not.toHaveBeenCalled();
		storage.dashboards.items.set("dash00000003", { ...base, viewer: { ranges: ["7d"], compare: false, annotations: true } });
		clearReportCache();
		const { html } = await view(`/_/s/${token}`);
		expect(html).toContain('data-marker="2026-03-12"');
		expect(html).toContain("Shipped &lt;v2&gt;");
		expect(query).toHaveBeenCalledTimes(1);
	});

	it("reads the Basic password", () => {
		expect(basicPassword(basic("user", "a:b:c"))).toBe("a:b:c");
		expect(basicPassword("Bearer x")).toBeNull();
		expect(basicPassword("Basic !!!")).toBeNull();
		expect(basicPassword(`Basic ${btoa("nocolon")}`)).toBeNull();
		expect(basicPassword(null)).toBeNull();
	});
});
