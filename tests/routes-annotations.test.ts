/** `annotations/preview`: counts and samples through the compiler, statement budget, typed errors. */
import { beforeAll, describe, expect, it } from "vitest";
import { createPlugin } from "../src/index.js";
import type { Db } from "../src/db/adapter.js";
import { type PreviewCtx, PreviewBody, previewRoute } from "../src/routes/annotations.js";
import type { Settings } from "../src/settings.js";
import { seed, seedSearch } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";

const NOW = 1_773_360_000; // 2026-03-13, the day after the seeded range

describe("annotations/preview", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	let statements: string[];
	const spyDb = (): Db => ({ ...env.db, all: (sql, params) => (statements.push(sql), env.db.all(sql, params)) });
	const call = (input: unknown, s: Partial<Settings> = {}) => {
		statements = [];
		return previewRoute({ db: async () => spyDb(), settings: async () => ({ ...settings, ...s }), now: () => NOW }).handler({ input: PreviewBody.parse(input), storage: {} } as PreviewCtx);
	};
	const distinct = (sql: string) => (env.raw.prepare(sql).all() as Array<{ v: string }>).map((r) => r.v);

	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
		await seedSearch(env);
	});

	it("is registered with plugins:read", () => {
		const plugin = createPlugin() as unknown as { routes: Record<string, { permission?: string }> };
		expect(plugin.routes["annotations/preview"]?.permission).toBe("plugins:read");
	});

	it("counts distinct hosts and pages with five samples", async () => {
		const allPaths = distinct("SELECT DISTINCT h.value ->> 'p' AS v FROM ca_sessions s CROSS JOIN json_each(s.hits) h WHERE h.value ->> 't' IS NOT NULL AND h.value ->> 'n' IS NULL ORDER BY v");
		const wide = await call({ scope: { v: 1 } });
		expect(wide.pages).toEqual({ count: allPaths.length, sample: allPaths.slice(0, 5) });
		expect(wide.hosts.count).toBe(distinct("SELECT DISTINCT host AS v FROM ca_sessions WHERE host IS NOT NULL").length);
		expect(wide.queries).toBeNull();
		expect(statements).toHaveLength(1);

		const prefix = await call({ scope: { v: 1, path: [{ op: "prefix", value: "/pr" }] } });
		const expected = allPaths.filter((p) => p.startsWith("/pr"));
		expect(expected.length).toBeGreaterThan(0);
		expect(prefix.pages).toEqual({ count: expected.length, sample: expected.slice(0, 5) });
	});

	it("counts queries over the query grain only with a Search source, within four statements", async () => {
		const scope = { v: 1, path: [{ op: "regex", value: "^/p" }], query: [{ op: "regex", value: "cook" }] };
		const none = await call({ scope });
		expect(none.queries).toBeNull();
		expect(none.notices).toEqual(["scope_no_search_source"]);
		const r = await call({ scope }, { gscAuth: "oauth", gscClientId: "id", gscClientSecret: "secret", gscRefreshToken: "token" });
		expect(r.queries).toEqual({ count: 1, sample: ["cookieless"] });
		expect(r.notices).toEqual([]);
		expect(statements.length).toBeLessThanOrEqual(4);
		const hostOnly = await call({ scope: { v: 1, host: [{ op: "is", value: "nowhere.example" }], query: [{ op: "is", value: "cookieless" }] } }, { gscAuth: "oauth", gscClientId: "id", gscClientSecret: "secret", gscRefreshToken: "token" });
		expect(hostOnly.pages.count).toBe(0);
		expect(hostOnly.notices).toEqual(["scope_host_not_applied"]);
	});

	it("passes the compiler's typed errors through", async () => {
		const realAll = env.db.all;
		env.db.all = (async (sql: string, params: unknown[]) =>
			/SELECT DISTINCT/.test(sql) && !/WITH m/.test(sql) ? Array.from({ length: 2001 }, (_, i) => ({ v: `/x${i}` })) : realAll(sql, params as never)) as Db["all"];
		try {
			await expect(call({ scope: { v: 1, path: [{ op: "regex", value: "^/x" }] } })).rejects.toMatchObject({ code: "narrow_filter", message: "The pattern matches more than 2000 values. Make it more specific." });
		} finally {
			env.db.all = realAll;
		}
	});
});
