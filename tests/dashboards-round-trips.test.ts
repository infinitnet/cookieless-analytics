/** Round trips of one dashboard run (shared page and scheduled email): every db, KV and plugin storage call is a database query on the host. */
import { describe, expect, it } from "vitest";
import type { Tile } from "../src/dashboards/schema.js";
import { BUDGET_LINE } from "../src/dashboards/email.js";
import { mailDeps, runMailTick } from "../src/dashboards/mail.js";
import { createShare } from "../src/dashboards/shares.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { shareViewRoute } from "../src/routes/share-view.js";
import { memColl, T0 } from "./agent.helpers.js";
import { storedDash } from "./fixtures/dashboards.js";
import { seed } from "./fixtures/seed.js";
import { MemoryKv, schemaDb } from "./helpers.js";

/** Free plan: 50 queries per invocation. The ceilings leave room for the host's own reads around the route. */
const CEILING = (n: number, compare: boolean) => (compare ? 35 : ({ 3: 20, 6: 30, 12: 45 } as Record<number, number>)[n] as number);

function counter() {
	const c = { n: 0 };
	const wrap = <T extends object>(o: T): T =>
		new Proxy(o, {
			get(t, p) {
				const v = Reflect.get(t, p);
				if (typeof v !== "function") return v;
				return ["query", "get", "put", "updateIf", "set", "list", "delete", "all", "run", "batch"].includes(String(p))
					? (...a: unknown[]) => {
							c.n += p === "batch" ? (a[0] as unknown[]).length : 1;
							return v.apply(t, a);
						}
					: v.bind(t);
			},
		});
	return { c, wrap };
}

const pagesTiles = (n: number): Tile[] => Array.from({ length: n }, (_, i) => ({ id: `m000${String(i).padStart(2, "0")}`, report: "pages", kind: "table", w: 1, limit: 5 + i }) as Tile);

describe("dashboard round trips", () => {
	for (const [n, compare] of [
		[3, false],
		[6, false],
		[6, true],
		[12, false],
	] as const)
		it(`a shared page of ${n} distinct tiles${compare ? " with comparison" : ""} stays under ${CEILING(n, compare)} round trips`, async () => {
			const env = await schemaDb();
			const settings = await seed(env, "UTC");
			clearReportCache();
			const { c, wrap } = counter();
			const raw = { shares: memColl(), dashboards: memColl({ dash00000002: { ...storedDash("dash00000002", "default", pagesTiles(n), "Many"), viewer: { ranges: ["7d"], compare: true } } }), segments: memColl(), goals: memColl(), annotations: memColl() };
			const token = (await createShare(raw.shares, { site: "default", dashboard: "dash00000002" }, T0)).token;
			const storage = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, wrap(v)]));
			const db = wrap(env.db);
			const route = shareViewRoute({ db: async () => db, settings: async () => settings, now: () => T0, after: () => {} });
			const r = await route.handler({ request: new Request(`https://example.org/_/s/${token}${compare ? "?c=1" : ""}`), kv: wrap(new MemoryKv()), storage } as never);
			expect(r.status).toBe(200);
			expect(c.n).toBeLessThanOrEqual(CEILING(n, compare));
		});

	it("a scheduled email of 12 distinct tiles counts its KV and storage reads in the budget and stays under 50 for the whole tick", async () => {
		const env = await schemaDb();
		const settings = await seed(env, "UTC");
		clearReportCache();
		const { c, wrap } = counter();
		const kv = wrap(new MemoryKv());
		let text = "";
		const email = { enabled: true, frequency: "weekly", weekday: 1, monthday: 1, hour: 8, recipients: ["r1@example.com"], range: "7d", compare: false };
		const dashboards = wrap(memColl({ aaaaaaaaaaaa: { ...storedDash("aaaaaaaaaaaa", "default", pagesTiles(12)), email, emailNext: T0 } }));
		const r = await runMailTick({
			...mailDeps({ db: async () => wrap(env.db), settings: async () => settings }, { input: null, storage: { segments: wrap(memColl()), goals: wrap(memColl()) }, kv }, settings, "https://example.org"),
			kv,
			dashboards,
			now: T0 + 9 * 3600,
			tz: "UTC",
			email: { send: async (m: { text: string }) => void (text = m.text) },
		} as never);
		expect(r).toMatchObject({ id: "aaaaaaaaaaaa", sent: 1 });
		expect(r.statements).toBeLessThanOrEqual(36);
		expect(c.n).toBeLessThan(50);
		// Three table statements per request: the last three tiles do not fit and say so.
		expect(text.split(BUDGET_LINE).length - 1).toBe(3);
	});
});
