/** Funnel modes. The sequential snapshot pins the default mode: its rows and SQL must never change. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type Params, runReport } from "../src/query/reports/index.js";
import { RANGE, seed } from "./fixtures/seed.js";
import { putHits, schemaDb } from "./helpers.js";

const FUNNEL = {
	name: "Signup flow",
	steps: [
		{ type: "page" as const, match: "is" as const, value: "/" },
		{ type: "page" as const, match: "is" as const, value: "/pricing" },
		{ type: "event" as const, match: "is" as const, value: "signup" },
	],
};

/** Records every statement, so a snapshot proves the SQL is unchanged too. */
export function spyDb(db: Db, log: string[]): Db {
	return { ...db, all: (sql, params) => (log.push(sql), db.all(sql, params)), run: (sql, params) => (log.push(sql), db.run(sql, params)) };
}

describe("sequential funnels", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let rc: ReportCtx;
	const log: string[] = [];
	beforeAll(async () => {
		env = await schemaDb();
		const settings = await seed(env, "Europe/Berlin");
		rc = { db: spyDb(env.db, log), site: "default", settings, now: zonedToEpoch("2026-03-13", 0, "Europe/Berlin") + 360, goals: [], funnels: { f1: FUNNEL }, annotations: [] };
	});
	beforeEach(() => {
		clearReportCache();
		log.length = 0;
	});
	const run = (params: Params) => runReport(rc, { report: "funnels", query: QuerySchema.parse(RANGE), params });

	it("keeps its rows and SQL byte identical to the stored snapshot", async () => {
		const rec = await run({ funnel: "f1" });
		const adhoc = await run({ steps: [{ type: "page", match: "regex", value: "^/$" }, { type: "page", match: "prefix", value: "/pri" }] });
		expect(JSON.stringify({ rows: rec.data.rows, name: rec.data.name, total: rec.data.total_sessions, adhoc: adhoc.data.rows, sql: log })).toMatchSnapshot();
	});
});

type Hit = [ts: number, kind: "pv" | "ev", value: string];

/** One database of hand-built sessions on 2026-03-10; `pv` hits carry a path, `ev` hits a name. */
async function handBuilt(sessions: Record<string, Hit[]>) {
	const env = await schemaDb();
	const ses = env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews, events) VALUES ('default', ?, ?, '2026-03-10', 0, ?, ?, 1800, ?, ?)");
	for (const [sid, hits] of Object.entries(sessions)) {
		ses.run(sid, `v-${sid}`, hits[0]?.[0] ?? 0, hits.at(-1)?.[0] ?? 0, hits.filter((h) => h[1] === "pv").length, hits.filter((h) => h[1] === "ev").length);
		putHits(env.raw, hits.map(([ts, kind, v], i) => ({ id: `${sid}-${String(i).padStart(2, "0")}`, sid, ts, kind, path: kind === "pv" ? v : "/", name: kind === "ev" ? v : null })));
	}
	const rc: ReportCtx = { db: env.db, site: "default", settings: { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 }, now: 0, goals: [], funnels: {}, annotations: [] };
	return (params: Params) => {
		clearReportCache();
		return runReport(rc, { report: "funnels", query: QuerySchema.parse({ from: "2026-03-10", to: "2026-03-10" }), params });
	};
}

const page = (value: string) => ({ type: "page" as const, match: "is" as const, value });
const event = (value: string) => ({ type: "event" as const, match: "is" as const, value });
const sessions = (r: { data: { rows?: Array<Record<string, unknown>> } }) => r.data.rows?.map((x) => x.sessions);

describe("strict funnels", () => {
	it("break on a countable hit between two steps, not on same-second hits, auto events or a later restart", async () => {
		const run = await handBuilt({
			between: [[100, "pv", "/"], [110, "pv", "/other"], [120, "pv", "/pricing"]],
			auto: [[100, "pv", "/"], [105, "ev", "_scroll"], [110, "pv", "/pricing"]],
			sameSecond: [[100, "pv", "/"], [100, "pv", "/other"], [110, "pv", "/pricing"]],
			swapped: [[100, "pv", "/pricing"], [100, "pv", "/"]],
			restart: [[100, "pv", "/"], [110, "pv", "/other"], [120, "pv", "/"], [130, "pv", "/pricing"]],
			userEvent: [[100, "pv", "/"], [105, "ev", "click"], [110, "pv", "/pricing"]],
		});
		const steps = [page("/"), page("/pricing")];
		const strict = await run({ steps, mode: "strict" });
		expect(strict.data.mode).toBe("strict");
		// Step 1: all six. Step 2: auto, sameSecond, swapped, restart (between and userEvent broke the chain).
		expect(sessions(strict)).toEqual([6, 4]);
		expect(sessions(await run({ steps }))).toEqual([6, 6]);
		expect((await run({ steps })).data.mode).toBe("sequential");
	});

	it("counts an outbound step, which is countable only because it matches", async () => {
		const run = await handBuilt({
			out: [[100, "pv", "/"], [110, "ev", "_outbound"]],
			scrolled: [[100, "pv", "/"], [105, "ev", "_scroll"], [110, "ev", "_outbound"]],
			viewed: [[100, "pv", "/"], [105, "pv", "/b"], [110, "ev", "_outbound"]],
		});
		expect(sessions(await run({ steps: [page("/"), event("_outbound")], mode: "strict" }))).toEqual([3, 2]);
	});

	it("errors above 10,000 sessions with the cap in the text and runs at 10,000", async () => {
		const env = await schemaDb();
		const insert = (n: number) =>
			env.raw
				.prepare(
					`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${n})
INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews) SELECT 'default', 's' || i, 'v' || i, '2026-03-10', 0, 0, 0, 1800, 1 FROM n`,
				)
				.run();
		insert(10_000);
		const rc: ReportCtx = { db: env.db, site: "default", settings: { siteTimezone: "UTC", engagedThresholdSeconds: 10, realtimeWindowMinutes: 5 }, now: 0, goals: [], funnels: {}, annotations: [] };
		const go = () => {
			clearReportCache();
			return runReport(rc, { report: "funnels", query: QuerySchema.parse({ from: "2026-03-10", to: "2026-03-10" }), params: { steps: [page("/"), page("/b")], mode: "strict" } });
		};
		expect(sessions(await go())).toEqual([0, 0]);
		env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, pageviews) VALUES ('default', 'extra', 'v', '2026-03-10', 0, 0, 0, 1800, 1)").run();
		const err = await go().catch((e) => e);
		expect(err.code).toBe("funnel_cap");
		expect(err.message).toContain("10000");
	});
});

describe("flexible funnels", () => {
	it("count steps in any order with prefix semantics, equal to hand counts", async () => {
		const run = await handBuilt({
			inOrder: [[100, "pv", "/"], [110, "pv", "/pricing"], [120, "ev", "signup"]],
			reversed: [[100, "ev", "signup"], [110, "pv", "/pricing"], [120, "pv", "/"]],
			skipsMiddle: [[100, "pv", "/"], [110, "ev", "signup"]],
			noFirst: [[100, "pv", "/pricing"], [110, "ev", "signup"]],
			firstOnly: [[100, "pv", "/"]],
		});
		const steps = [page("/"), page("/pricing"), event("signup")];
		const flex = await run({ steps, mode: "flexible" });
		expect(flex.data.mode).toBe("flexible");
		// Step 1 (/): inOrder, reversed, skipsMiddle, firstOnly. Steps 1-2: inOrder, reversed. Steps 1-3: the same two.
		expect(sessions(flex)).toEqual([4, 2, 2]);
		expect(flex.data.rows?.map((r) => r.conversion)).toEqual([1, 0.5, 0.5]);
		// Sequential sees only the ordered one past step 1.
		expect(sessions(await run({ steps }))).toEqual([4, 1, 1]);
	});
});
