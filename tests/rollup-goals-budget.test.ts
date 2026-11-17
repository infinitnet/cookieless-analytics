/**
 * Goals in the closed-day writer: they are read ten per statement, so many goals stay inside the request budget
 * of the capacity profile (Workers Free: 50 per invocation; `small` plans 40), the first site-day of a run included.
 */
import { describe, expect, it } from "vitest";
import { addDays, zonedToEpoch } from "../src/core/time.js";
import type { Goal } from "../src/query/filters.js";
import { dayStatements, runRollup } from "../src/query/rollup.js";
import { type CapacityProfile, normalizeSettings, PROFILES } from "../src/settings.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { schemaDb } from "./helpers.js";

const TZ = "UTC";
const DAY = "2026-06-10";
const NOW = zonedToEpoch(addDays(DAY, 3), 1, TZ);
const SECTIONS = ["blog", "guides", "docs", "news"];

/** `n` goals that all complete on the generated traffic: page goals by section prefix and the signup event. */
const goals = (n: number): Goal[] =>
	Array.from({ length: n }, (_, i) =>
		i % 2 ? { name: `G${i}`, type: "event", match: "is", value: "signup" } : { name: `G${i}`, type: "page", match: "prefix", value: `/${SECTIONS[(i / 2) % 4]}/` },
	);

describe("goals within the request budget of a rollup run", () => {
	it.each([
		["small", 40],
		["standard", 60],
	] as Array<[CapacityProfile, number]>)("%s with %i goals: every closed day is stored within the profile's requests", async (profile, n) => {
		const env = await schemaDb();
		const settings = normalizeSettings({ siteTimezone: TZ, capacityProfile: profile });
		const traffic = generateTraffic({ pageviews: 300, seed: 5, rich: true, start: zonedToEpoch(DAY, 0, TZ), spanSeconds: 2 * 86_400 - 1 });
		await recordTraffic(env.db, traffic, settings);
		const g = goals(n);
		// Ten goals per statement: 40 goals cost 4 reads (and 2 for the 20 event goals' revenue), not 40.
		expect(dayStatements(g)).toBeLessThan(PROFILES[profile].requests - 4);
		let done = false;
		for (let i = 0; i < 5 && !done; i++) {
			const t = await runRollup({ db: env.db, settings, goals: async () => g }, env.kv, NOW);
			// Statements plus the 4 KV calls and the one goals load stay within the profile.
			expect(t.statements + 4 + 1).toBeLessThanOrEqual(PROFILES[profile].requests);
			done = t.done;
		}
		expect(done).toBe(true);
		const stored = env.raw.prepare("SELECT DISTINCT key FROM ca_rollup WHERE dim = 'goal' AND seg = '' AND key <> '(other)'").all() as { key: string }[];
		expect(stored.length).toBe(n);
	});

	it("a site-day that cannot fit the profile's requests is refused with a clear error instead of passing the platform's limit", async () => {
		const env = await schemaDb();
		const settings = normalizeSettings({ siteTimezone: TZ, capacityProfile: "small" });
		await recordTraffic(env.db, generateTraffic({ pageviews: 50, seed: 5, start: zonedToEpoch(DAY, 0, TZ), spanSeconds: 3600 }), settings);
		// 200 goals: 20 goal reads and 10 for their revenue, past the 36 statements of `small`.
		await expect(runRollup({ db: env.db, settings, goals: async () => goals(200) }, env.kv, NOW)).rejects.toThrow(/needs \d+ requests, more than the 36/);
		// A smaller share than one site-day (two databases on `small`): the first site-day may use the profile's whole requests.
		const t = await runRollup({ db: env.db, settings, goals: async () => goals(40) }, env.kv, NOW, { requests: 20 });
		expect(t.sites.length).toBe(1);
		expect(t.statements + 4).toBeLessThanOrEqual(40);
	});
});
