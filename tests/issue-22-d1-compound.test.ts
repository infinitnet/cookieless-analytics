/**
 * GitHub issue #22: Cloudflare D1 refuses a compound SELECT of more than 5 terms (`too many terms in compound SELECT`),
 * and the closed-day writer joined 21 parts in one statement, so every rollup run failed and the watermark never moved.
 * The test databases refuse such statements as D1 does (`tests/helpers.ts`, on by default); these tests run the closed
 * day writer and the detailed reports that build unions through that limit and compare them with the single unchunked
 * statement on a database without it, check that no source file builds a union outside `db/compound.ts`, and that a
 * run of failed rollups catches up on its own once the statements fit.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addDays, zonedToEpoch } from "../src/core/time.js";
import { compoundTerms, MAX_COMPOUND_TERMS } from "../src/db/compound.js";
import { DeleteSpecSchema, previewDelete } from "../src/query/filtered-delete.js";
import { type Goal, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { KV_ROLLUP_CURSOR, KV_WATERMARK, lastClosedDay, type RollupTickResult, runRollup } from "../src/query/rollup.js";
import { type CapacityProfile, normalizeSettings, PROFILES } from "../src/settings.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { seedLinks } from "./fixtures/links.js";
import { REV_GOALS, seedRevenue } from "./fixtures/revenue.js";
import { schemaDb, type TestDbOptions } from "./helpers.js";

const TZ = "UTC";
/** 01:00 on 03-13: 03-11 is the last closed day. */
const NOW = zonedToEpoch("2026-03-13", 1, TZ);
const SECTIONS = ["blog", "guides", "docs", "news"];
/** Twelve goals (two groups of goals before the limit, three statements of at most five now), seven of them event goals. */
const GOALS: Goal[] = [
	...REV_GOALS,
	...SECTIONS.map((s): Goal => ({ name: `Section ${s}`, type: "page", match: "prefix", value: `/${s}/` })),
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Signup pro", type: "event", match: "is", value: "signup", props: { plan: "pro" } },
	{ name: "Clicked", type: "event", match: "is", value: "out" },
	{ name: "Converted", type: "event", match: "is", value: "conv" },
];

type Env = Awaited<ReturnType<typeof schemaDb>>;

/** Generated visits with orders on 03-10 and 03-11, plus the Links and Revenue fixtures (link impressions, clicks, conversions, orders). */
async function seeded(o: TestDbOptions = {}, profile: CapacityProfile = "standard"): Promise<Env> {
	const env = await schemaDb(o);
	const settings = normalizeSettings({ siteTimezone: TZ, capacityProfile: profile });
	const traffic = generateTraffic({ pageviews: 400, seed: 22, rich: true, start: zonedToEpoch("2026-03-10", 0, TZ), spanSeconds: 2 * 86_400 - 1 });
	let n = 0;
	for (const a of traffic.actions.filter((x) => x.body.t === "pv" && !x.body.n)) {
		if (n++ % 15) continue;
		traffic.actions.push({ ...a, at: a.at + 4, body: { v: 1, t: "ev", sid: a.body.sid, name: "purchase", u: a.body.u, val: 10 + (n % 7), cur: n % 3 ? "USD" : "EUR" } });
	}
	traffic.actions.sort((a, b) => a.at - b.at);
	await recordTraffic(env.db, traffic, settings);
	seedLinks(env.raw);
	seedRevenue(env.raw);
	return env;
}

/** Run `fn` with every union as one statement, the form D1 refuses (the plain database has no limit). */
async function unchunked<T>(fn: () => Promise<T>): Promise<T> {
	compoundTerms.max = 1_000;
	try {
		return await fn();
	} finally {
		compoundTerms.max = MAX_COMPOUND_TERMS;
	}
}
afterEach(() => {
	compoundTerms.max = MAX_COMPOUND_TERMS;
	clearReportCache();
});

const settingsOf = (profile: CapacityProfile = "standard") => normalizeSettings({ siteTimezone: TZ, capacityProfile: profile });
const rollupCtx = (env: Env, profile: CapacityProfile = "standard") => ({ db: env.db, settings: settingsOf(profile), goals: async () => GOALS });

/** Rollup runs until nothing is left; every run stays inside the profile's requests. */
async function closeAll(env: Env, now = NOW, profile: CapacityProfile = "standard"): Promise<RollupTickResult[]> {
	const runs: RollupTickResult[] = [];
	for (let i = 0; i < 60; i++) {
		const t = await runRollup(rollupCtx(env, profile), env.kv, now);
		runs.push(t);
		expect(t.requests, `run ${i}`).toBeLessThanOrEqual(PROFILES[profile].requests);
		if (t.done) return runs;
	}
	throw new Error("the rollup did not finish");
}

const stored = (env: Env) => ({
	rollup: env.raw.prepare("SELECT * FROM ca_rollup ORDER BY site, dim, seg, day, key, segkey").all(),
	revenue: env.raw.prepare("SELECT * FROM ca_revenue_daily ORDER BY site, dim, seg, day, key, segkey, cur").all(),
	cube: env.raw.prepare("SELECT * FROM ca_cube ORDER BY site, day, channel, country, device").all(),
});

describe("issue #22: compound SELECTs within D1's 5 terms", () => {
	it("closes days with sessions, 12 goals, revenue and links through the D1 limit, and stores what the single unchunked statement stored", async () => {
		const d1 = await seeded();
		const plain = await seeded({ compoundLimit: false });
		// The statements as one union are what D1 refused (issue #22): the test database refuses them the same way, and nothing moves.
		await unchunked(async () => {
			await expect(runRollup(rollupCtx(d1), d1.kv, NOW)).rejects.toThrow(/too many terms in compound SELECT/);
		});
		expect(await d1.kv.get(KV_WATERMARK)).toBeNull();
		expect(d1.count("ca_rollup")).toBe(0);

		await unchunked(() => closeAll(plain));
		const runs = await closeAll(d1);
		expect(runs.at(-1)?.watermark).toBe("2026-03-11");
		expect(await d1.kv.get(KV_WATERMARK)).toBe("2026-03-11");
		expect(await d1.kv.get(KV_ROLLUP_CURSOR)).toBeNull();
		const got = stored(d1);
		expect(got).toEqual(stored(plain));
		// Every family is there: the twelve goals, link rows, journeys, revenue per goal and the cube.
		const keys = (dim: string) => new Set(got.rollup.filter((r) => (r as { dim: string; seg: string }).dim === dim && (r as { seg: string }).seg === "").map((r) => (r as { key: string }).key));
		expect(keys("goal").size).toBeGreaterThanOrEqual(10);
		expect(keys("link").size).toBeGreaterThan(0);
		expect(keys("link_place").size).toBeGreaterThan(0);
		expect(keys("next").size).toBeGreaterThan(0);
		expect(got.revenue.some((r) => (r as { dim: string }).dim === "goal")).toBe(true);
		expect(got.cube.length).toBeGreaterThan(0);
	});

	it("answers the detailed reports that build unions (goals, revenue, links, behavior, the delete preview) with the same data chunked", async () => {
		const d1 = await seeded();
		const plain = await seeded({ compoundLimit: false });
		const ctx = (env: Env, summary: boolean): ReportCtx => ({
			db: env.db,
			site: "default",
			settings: settingsOf(),
			now: NOW,
			goals: GOALS,
			funnels: {},
			annotations: [],
			defaultCurrency: "USD",
			...(summary ? { rawFrom: "2026-03-12" } : {}),
		});
		const cases: Array<[ReportName, Params]> = [
			["goals", {}],
			["revenue", {}],
			["revenue_series", {}],
			["revenue_breakdown", { dim: "goal" }],
			["revenue_breakdown", { dim: "channel" }],
			["revenue_breakdown", { dim: "page" }],
			["links", {}],
			["links", { by: "place" }],
			// Detailed data only (the summaries keep links by link, place and segment).
			["links", { by: "page" }],
			["events", {}],
			["channels", {}],
		];
		const answers = async (env: Env, summary: boolean) => {
			const out: unknown[] = [];
			for (const [report, params] of cases) {
				if (summary && params.by === "page") continue;
				clearReportCache();
				out.push((await runReport(ctx(env, summary), { report, query: QuerySchema.parse({ from: "2026-03-10", to: "2026-03-11" }), params, limit: 1000 })).data);
			}
			return out;
		};
		const preview = (env: Env) => previewDelete({ db: env.db, kv: env.kv, settings: settingsOf(), site: "default", now: NOW }, DeleteSpecSchema.parse({ from: "2026-03-10", to: "2026-03-11" }));

		// Detailed data.
		const want = await unchunked(() => answers(plain, false));
		expect(await answers(d1, false)).toEqual(want);
		const p = await unchunked(() => preview(plain));
		expect(await preview(d1)).toEqual(p);
		expect(Object.values(p.top).some((rows) => rows.length > 0)).toBe(true);
		// The goals report has rows for all twelve goals.
		expect((want[0] as { rows: unknown[] }).rows).toHaveLength(GOALS.length);

		// The same from the stored summaries.
		await unchunked(() => closeAll(plain));
		await closeAll(d1);
		const wantStored = await unchunked(() => answers(plain, true));
		expect(await answers(d1, true)).toEqual(wantStored);
	});

	it("no source file joins SELECTs with UNION, INTERSECT or EXCEPT at run time outside db/compound.ts", () => {
		const root = join(import.meta.dirname, "..", "src");
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const p = join(dir, name);
				if (statSync(p).isDirectory()) walk(p);
				else if (/\.(ts|tsx|mts)$/.test(name)) files.push(p);
			}
		};
		walk(root);
		expect(files.length).toBeGreaterThan(50);
		const JOIN = /\.join\(\s*["'`][^"'`]*\b(UNION|INTERSECT|EXCEPT)\b/i;
		const offenders = files.filter((f) => relative(root, f) !== join("db", "compound.ts") && JOIN.test(readFileSync(f, "utf8"))).map((f) => relative(root, f));
		expect(offenders).toEqual([]);
		// The helper itself is the one place, and the parts it joins are capped there.
		expect(JOIN.test(readFileSync(join(root, "db", "compound.ts"), "utf8"))).toBe(true);
	});

	it("catches up every missed closed day on its own after a run of failed rollups, within the profile's requests", async () => {
		for (const profile of ["small", "standard"] as const) {
			const env = await seeded({}, profile);
			// Days up to 03-09 stored before the failures began.
			const before = zonedToEpoch("2026-03-11", 1, TZ);
			await closeAll(env, before, profile);
			expect(await env.kv.get(KV_WATERMARK)).toBe("2026-03-09");
			// Every run of a week fails as on D1 with the single statements: the watermark stays, no cursor is left.
			for (let d = 0; d < 7; d++) {
				const at = zonedToEpoch(addDays("2026-03-13", d), 1, TZ);
				await unchunked(async () => {
					await expect(runRollup(rollupCtx(env, profile), env.kv, at)).rejects.toThrow(/too many terms in compound SELECT/);
				});
			}
			expect(await env.kv.get(KV_WATERMARK)).toBe("2026-03-09");
			expect(await env.kv.get(KV_ROLLUP_CURSOR)).toBeNull();
			// Installed: the next runs store every missed day, each run inside the profile's requests.
			const later = zonedToEpoch("2026-03-20", 1, TZ);
			const runs = await closeAll(env, later, profile);
			expect(await env.kv.get(KV_WATERMARK)).toBe(lastClosedDay(later, TZ));
			expect(await env.kv.get(KV_ROLLUP_CURSOR)).toBeNull();
			const days = runs.flatMap((t) => t.sites);
			expect(days).toEqual(expect.arrayContaining(["default@2026-03-10", "default@2026-03-11"]));
			// The same tables as a database that never failed.
			const clean = await seeded({}, profile);
			await closeAll(clean, later, profile);
			expect(stored(env)).toEqual(stored(clean));
			if (profile === "small") expect(runs.length).toBeGreaterThan(1);
		}
	});
});
