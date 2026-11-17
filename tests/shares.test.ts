/** Share store and admin routes. */
import { beforeEach, describe, expect, it } from "vitest";
import { createShare, deleteShare, deleteSharesOf, lookup, MAX_SHARES_PER_DASHBOARD, MAX_SHARES_PER_SITE, mostPermissive, recordView, type Share, sharesOf } from "../src/dashboards/shares.js";
import { hashSecret, parseToken } from "../src/keys/token.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { type SharesCtx, shareRoutes } from "../src/routes/shares.js";
import { memColl } from "./agent.helpers.js";
import { storedDash, kpi } from "./fixtures/dashboards.js";
import { sitesColl } from "./helpers.js";

describe("share store", () => {
	it("uses the key token format and stores only the prefix and the secret hash", async () => {
		const coll = memColl();
		const { token, share } = await createShare(coll, { site: "default", dashboard: "d00000000001" }, 100);
		const p = parseToken(token);
		expect(p).not.toBeNull();
		const rec = coll.items.get(share.id) as Share;
		expect(rec.prefix).toBe(p?.prefix);
		expect(rec.hash).toBe(await hashSecret(p?.secret as string));
		expect(JSON.stringify(rec)).not.toContain(p?.secret);
		expect(rec).toMatchObject({ views: 0, lastViewed: null, expires: null, created: 100 });
	});

	it("allows ten links per dashboard and refuses the eleventh with a typed error", async () => {
		const coll = memColl();
		expect(MAX_SHARES_PER_DASHBOARD).toBe(10);
		for (let i = 0; i < 10; i++) await createShare(coll, { site: "default", dashboard: "d00000000001", label: `Link ${i}` }, 100 + i);
		await expect(createShare(coll, { site: "default", dashboard: "d00000000001" }, 200)).rejects.toMatchObject({ code: "too_many_shares" });
		await createShare(coll, { site: "default", dashboard: "d00000000002" }, 100);
		expect((await sharesOf(coll, "default", "d00000000001")).map((h) => h.share.label)).toEqual(Array.from({ length: 10 }, (_, i) => `Link ${i}`));
	});

	it("caps links per site at 100", async () => {
		expect(MAX_SHARES_PER_SITE).toBe(100);
		const seed = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`s${i}`, { site: "default", dashboard: `d${String(i).padStart(11, "0")}`, created: 1 }]));
		const coll = memColl(seed);
		await expect(createShare(coll, { site: "default", dashboard: "dzzzzzzzzzzz" }, 100)).rejects.toMatchObject({ code: "too_many_shares" });
		await createShare(coll, { site: "blog", dashboard: "dzzzzzzzzzzz" }, 100);
	});

	it("validates the label and keeps independent passwords and expiries per link", async () => {
		const coll = memColl();
		await expect(createShare(coll, { site: "default", dashboard: "d00000000001", label: "x".repeat(41) }, 100)).rejects.toMatchObject({ code: "invalid_share" });
		await expect(createShare(coll, { site: "default", dashboard: "d00000000001", label: "a\nb" }, 100)).rejects.toMatchObject({ code: "invalid_share" });
		const a = await createShare(coll, { site: "default", dashboard: "d00000000001", password: "first password", label: "Board" }, 100);
		const b = await createShare(coll, { site: "default", dashboard: "d00000000001", expires: 150 }, 100);
		const c = await createShare(coll, { site: "default", dashboard: "d00000000001" }, 100);
		expect(a.share).toMatchObject({ label: "Board", password: true, expires: null });
		expect(b.share).toMatchObject({ password: false, expires: 150 });
		expect(await lookup(coll, b.token, 160)).toBeNull();
		expect(await lookup(coll, a.token, 160)).not.toBeNull();
		// Revoking one of three leaves two working.
		expect(await deleteShare(coll, "default", b.share.id)).toBe(true);
		expect(await lookup(coll, a.token, 120)).not.toBeNull();
		expect(await lookup(coll, c.token, 120)).not.toBeNull();
		expect(await lookup(coll, b.token, 120)).toBeNull();
		// Another site's id is not deleted.
		expect(await deleteShare(coll, "blog", a.share.id)).toBe(false);
	});

	it("orders states from least to most permissive", () => {
		expect(mostPermissive(["expired", "password"])).toBe("password");
		expect(mostPermissive(["password", "open", "expired"])).toBe("open");
		expect(mostPermissive([])).toBe("none");
	});

	it("looks up live tokens only: unknown prefix, wrong secret, expired and revoked are null", async () => {
		const coll = memColl();
		const { token, share } = await createShare(coll, { site: "default", dashboard: "d00000000001", expires: 200 }, 100);
		expect(await lookup(coll, token, 150)).toMatchObject({ id: share.id });
		expect(await lookup(coll, token, 200)).toBeNull();
		const [prefix, secret] = token.split(".") as [string, string];
		expect(await lookup(coll, `zzzzzzzz.${secret}`, 150)).toBeNull();
		expect(await lookup(coll, `${prefix}.${"A".repeat(43)}`, 150)).toBeNull();
		expect(await lookup(coll, "garbage", 150)).toBeNull();
		await coll.delete(share.id);
		expect(await lookup(coll, token, 150)).toBeNull();
	});

	it("records views", async () => {
		const coll = memColl();
		const { share } = await createShare(coll, { site: "default", dashboard: "d00000000001" }, 100);
		await recordView(coll, share.id, 300);
		await recordView(coll, share.id, 400);
		expect(coll.items.get(share.id)).toMatchObject({ views: 2, lastViewed: 400 });
		await recordView(coll, "missing", 400);
		expect(coll.items.has("missing")).toBe(false);
	});

	it("a view recorded after a revoke never brings the share back", async () => {
		const coll = memColl();
		const { share } = await createShare(coll, { site: "default", dashboard: "d00000000001" }, 100);
		await deleteShare(coll, "default", share.id);
		await recordView(coll, share.id, 300);
		expect(coll.items.size).toBe(0);
	});

	it("deletes every share of a dashboard and of a site", async () => {
		const coll = memColl({
			a: { site: "default", dashboard: "d00000000001" },
			b: { site: "default", dashboard: "d00000000001" },
			c: { site: "default", dashboard: "d00000000002" },
			d: { site: "blog", dashboard: "d00000000003" },
		});
		expect(await deleteSharesOf(coll, "default", "d00000000001")).toBe(true);
		expect([...coll.items.keys()]).toEqual(["c", "d"]);
	});
});

const settings = async () => ({ siteId: "default", sharePath: "/_/s", siteOrigin: "" });
const routes = shareRoutes({ settings, remoteIds: () => ["shop"], now: () => 1000 });
type Name = keyof typeof routes;
let storage: SharesCtx["storage"];
const request = new Request("https://example.org/_emdash/api/plugins/x/shares/create", { method: "POST" });
const call = <T = Record<string, unknown>>(name: Name, input: unknown) => routes[name].handler({ input, storage, request } as SharesCtx) as Promise<T>;
const fails = (name: Name, input: unknown) => call(name, input).then(() => null, (e: { code?: string }) => e.code ?? String(e));

beforeEach(() => {
	invalidateRegistry();
	storage = {
		shares: memColl(),
		sites: sitesColl([{ id: "blog" }]),
		dashboards: memColl({ d00000000001: storedDash("d00000000001", "default", [kpi("visitors")]), d00000000002: storedDash("d00000000002", "blog", [kpi("visitors")]) }),
	};
});

describe("share routes", () => {
	it("reads under plugins:read and writes under plugins:manage", () => {
		expect(Object.fromEntries(Object.entries(routes).map(([n, r]) => [n, r.permission]))).toEqual({ "shares/list": "plugins:read", "shares/create": "plugins:manage", "shares/delete": "plugins:manage" });
	});

	it("creates several links, lists them without hash or verifier, and revokes one by id", async () => {
		expect(await call("shares/list", { dashboard: "d00000000001" })).toEqual({ items: [] });
		const r = await call<{ link: string; share: { id: string; prefix: string; password: boolean } }>("shares/create", { dashboard: "d00000000001", password: "open sesame", expires: 5000, label: "Client <A>" });
		expect(r.link).toMatch(/^https:\/\/example\.org\/_\/s\/[a-z0-9]{8}\.[A-Za-z0-9_-]{43}$/);
		expect(r.share).toMatchObject({ password: true, expires: 5000, expired: false, views: 0, label: "Client <A>" });
		const r2 = await call<{ share: { id: string } }>("shares/create", { dashboard: "d00000000001", label: "Board" });
		const got = await call<{ items: Array<Record<string, unknown>> }>("shares/list", { dashboard: "d00000000001" });
		expect(got.items.map((i) => i.label)).toEqual(["Client <A>", "Board"]);
		expect(JSON.stringify(got)).not.toMatch(/hash|verifier|salt/);
		expect(JSON.stringify(got)).not.toContain(r.link.split("/").pop());
		expect(await fails("shares/create", { dashboard: "d00000000001", label: "x".repeat(41) })).not.toBeNull();
		expect(await call("shares/delete", { id: r.share.id })).toEqual({ id: r.share.id, deleted: true });
		expect((await call<{ items: Array<{ id: string }> }>("shares/list", { dashboard: "d00000000001" })).items.map((i) => i.id)).toEqual([r2.share.id]);
	});

	it("refuses the eleventh link with a typed 409", async () => {
		for (let i = 0; i < 10; i++) await call("shares/create", { dashboard: "d00000000001" });
		const err = await call("shares/create", { dashboard: "d00000000001" }).then(() => null, (e: { code?: string; status?: number }) => e);
		expect(err).toMatchObject({ code: "too_many_shares", status: 409 });
	});

	it("binds the site, refuses remote sites, unknown dashboards, bad passwords and past expiry", async () => {
		expect(await fails("shares/create", { dashboard: "d00000000002" })).toBe("not_found");
		expect(await call("shares/create", { dashboard: "d00000000002", site: "blog" })).toMatchObject({ share: { site: "blog" } });
		expect(await fails("shares/create", { dashboard: "d00000000001", site: "shop" })).toBe("remote_site_not_shareable");
		expect(await fails("shares/create", { dashboard: "d00000000001", password: "short" })).not.toBeNull();
		expect(await fails("shares/create", { dashboard: "d00000000001", password: "x".repeat(129) })).not.toBeNull();
		expect(await fails("shares/create", { dashboard: "d00000000001", expires: 999 })).toBe("invalid_share");
	});
});
