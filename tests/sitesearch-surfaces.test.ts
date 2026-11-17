/**
 * Site search across surfaces: a term of one session is left out of a shared
 * dashboard page and counted there, and present in the admin `data/query` and in `agent/v1/query`.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createShare } from "../src/dashboards/shares.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { clearReportCache } from "../src/query/reports/index.js";
import { type DataCtx, DataQueryBody, dataQueryRoute } from "../src/routes/data.js";
import { type ShareViewCtx, shareViewRoute } from "../src/routes/share-view.js";
import { hiddenTermsText } from "../src/dashboards/tiles.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { agentHarness, memColl, T0 } from "./agent.helpers.js";
import { storedDash } from "./fixtures/dashboards.js";
import { MemoryKv, putHits, schemaDb } from "./helpers.js";

const RANGE = { from: "2026-03-10", to: "2026-03-12" };

describe("site_search surfaces", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	beforeAll(async () => {
		env = await schemaDb();
		settings = normalizeSettings({ siteTimezone: "UTC", siteSearchParams: "find" });
		const ses = env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, channel) VALUES ('default', ?, ?, '2026-03-12', 0, ?, ?, 1800, 1, 'Direct')");
		const ts = T0 - 3600;
		[
			["s1", "find=desk+lamp"],
			["s2", "find=desk+lamp"],
			["s3", "find=solo+term"],
		].forEach(([sid, q], i) => {
			ses.run(sid, `v${sid}`, ts, ts);
			putHits(env.raw, [{ id: `h${i}`, sid: sid as string, ts, kind: "pv", path: "/search", query: q }]);
		});
	});
	beforeEach(() => {
		clearReportCache();
		invalidateRegistry();
	});

	it("the shared page hides the one session term and prints the hidden count", async () => {
		const tile = { id: "ss0001", report: "site_search" as const, kind: "table" as const, w: 3 as const };
		const storage = { shares: memColl(), dashboards: memColl({ dash00000009: storedDash("dash00000009", "default", [tile], "Search") }), segments: memColl(), goals: memColl() };
		const { token } = await createShare(storage.shares, { site: "default", dashboard: "dash00000009" }, T0);
		const route = shareViewRoute({ db: async () => env.db, settings: async () => settings, now: () => T0, after: () => {} });
		const r = await route.handler({ request: new Request(`https://example.org/_/s/${token}`), kv: new MemoryKv(), storage } as unknown as ShareViewCtx);
		expect(r.status).toBe(200);
		expect(r.html).toContain("desk lamp");
		expect(r.html).not.toContain("solo term");
		expect(r.html).toContain(hiddenTermsText(1));
	});

	it("the admin and the agent API show every term", async () => {
		const body = { report: "site_search" as const, query: { ...RANGE } };
		const admin = await dataQueryRoute({ db: async () => env.db, settings: async () => settings }).handler({ input: DataQueryBody.parse(body), storage: {} } as DataCtx);
		expect(admin.data.rows?.map((x) => x.key)).toEqual(["desk lamp", "solo term"]);
		expect(admin.data).not.toHaveProperty("hidden_terms");
		const h = await agentHarness(env, settings, { limiter: () => 0 });
		const r = await h.call("agent/v1/query", { token: await h.key(["read:analytics"]), input: body });
		expect(r.status).toBe(200);
		expect(r.json.data.data.rows.map((x: { key: string }) => x.key)).toEqual(["desk lamp", "solo term"]);
	});
});
