/**
 * The figures of docs/performance.md: the page script's bytes (scripts/measure-script.mjs) and the statements and
 * rows one page view costs through the real event route, on SQLite metered with the D1 rules and on Postgres
 * (PGlite behind the fake Hyperdrive driver, every statement on the wire counted, BEGIN and COMMIT included).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PLUGIN_ID } from "../src/contract.js";
import { drops } from "../src/core/drops.js";
import { resetCounters } from "../src/core/recorder.js";
import { routedSink } from "../src/core/queue-sink.js";
import { factsDb } from "../src/db/facts.js";
import { optionsKv } from "../src/db/options-kv.js";
import { pgOwnScope, pgScope } from "../src/db/pg.js";
import { resetQueryCache } from "../src/db/query-cache.js";
import { ensureSchema } from "../src/db/schema.js";
import { inRoute } from "../src/routes/in.js";
import type { RouteEnv } from "../src/routes/env.js";
import { normalizeSettings } from "../src/settings.js";
import { eventRequest, meteredDb, memoryDb } from "./helpers.js";
import { dropPgDriver, hyperdrive, pglite, resetPg } from "./pg.helpers.js";
import { ctx } from "./routes.helpers.js";

const NOW = Date.parse("2026-06-10T12:00:00Z") / 1000;
const doc = readFileSync("docs/performance.md", "utf8");
const SID = "aaaaaaaaaaaaaaaaaaaa";
const FIREFOX_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
// A visit of two page views, each followed by the engagement update the script sends when the tab is hidden.
const VISIT = [
	{ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/", r: "", n: 1, w: 1440 },
	{ v: 1, t: "en", sid: SID, h: "hhhhhhhhhhh1", d: 4000, e: 5000, s: 40, i: 1, x: 0 },
	{ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh2", u: "/b", w: 1440 },
	{ v: 1, t: "en", sid: SID, h: "hhhhhhhhhhh2", d: 3000, e: 3000, s: 80, i: 1, x: 1 },
];

/** The host database with its options table, metered: KV reads and writes of the route count too. */
function host() {
	const m = meteredDb((() => {
		const h = memoryDb();
		h.raw.exec("CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT)");
		return h;
	})());
	return { ...m, kv: optionsKv(m.db, PLUGIN_ID) };
}

function route(deps: RouteEnv["deps"], kv: ReturnType<typeof host>["kv"]) {
	const tasks: Array<() => Promise<unknown>> = [];
	const env: RouteEnv = { deps, after: (fn) => void tasks.push(fn) };
	return async (body: object, at: number, other = false) => {
		// `other`: another visitor (another network and browser), so it never joins the measured visit.
		const req = eventRequest(body, other ? { "cf-connecting-ip": "198.51.100.9", "user-agent": FIREFOX_UA } : {});
		const text = await req.clone().text();
		const res = await pgScope(() => inRoute({ ...env, deps: async (c) => ({ ...(await deps(c)), now: at }) }).handler(ctx(req, text, kv as never)));
		expect(res.status).toBe(204);
		// Work after the response (as `after()`): in a scope of its own, counted with the request.
		for (const t of tasks.splice(0)) await pgOwnScope(t);
	};
}

beforeEach(() => {
	resetCounters();
	resetQueryCache();
	drops.clear();
});

describe("page script bytes (scripts/measure-script.mjs)", () => {
	const m = JSON.parse(execFileSync("node", ["scripts/measure-script.mjs", "--json"], { encoding: "utf8" })) as { minified: number; gzip: number; brotli: number };

	it("stays under the 3 KB gzip budget", () => {
		expect(m.gzip).toBeLessThan(3072);
		expect(m.brotli).toBeLessThan(m.gzip);
	});

	it("the 2.5 KB of the README tagline and the package description is the gzip size, rounded", () => {
		expect((m.gzip / 1000).toFixed(1)).toBe("2.5");
		const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { description: string };
		expect(pkg.description).toContain("about 2.5 KB gzipped");
		expect(readFileSync("README.md", "utf8").split("\n")[4]).toContain("A 2.5 KB script");
	});

	it("docs/performance.md states the measured sizes (minified exact, compressed within 2 percent)", () => {
		const n = (label: string) => Number(new RegExp(`\\| ${label} \\| ([\\d,]+) bytes`).exec(doc)?.[1]?.replace(/,/g, ""));
		expect(n("Minified")).toBe(m.minified);
		for (const [label, v] of [["gzip", m.gzip], ["Brotli", m.brotli]] as const) expect(Math.abs(n(label) - v) / v, label).toBeLessThan(0.02);
	});
});

describe("one page view through the event route", () => {
	it("D1 (SQLite with the D1 rules): statements and rows written per request, analytics and host database", async () => {
		const facts = meteredDb();
		await ensureSchema(facts.db, host().kv);
		const h = host();
		const s = normalizeSettings({});
		const send = route(async () => ({ db: facts.db, kv: h.kv, settings: s }), h.kv);
		// The first request of the day creates the daily salt in the host KV; measure a steady state after it.
		await send({ ...VISIT[0], sid: "zzzzzzzzzzzzzzzzzzzz", h: "zzzzzzzzzzz1" }, NOW - 60, true);
		const per: Array<{ statements: number; written: number; host: number }> = [];
		for (const [i, body] of VISIT.entries()) {
			facts.reset();
			h.reset();
			await send(body, NOW + i * 10);
			per.push({ statements: facts.stats.statements, written: facts.stats.rowsWritten, host: h.stats.rowsWritten });
		}
		// New visit: read and insert (the row and its index); then one statement and one row each.
		expect(per).toEqual([
			{ statements: 2, written: 2, host: 0 },
			{ statements: 1, written: 1, host: 0 },
			{ statements: 1, written: 1, host: 0 },
			{ statements: 1, written: 1, host: 0 },
		]);
		expect(doc).toContain("| D1 | 2 statements, 2 rows written | 1 statement, 1 row written | 1 statement, 1 row written |");
	});

	describe("Postgres through Hyperdrive", () => {
		const pg = pglite();
		afterAll(() => pg.close());
		beforeEach(() => resetPg(pg));
		afterEach(() => dropPgDriver());

		it("statements on the wire per request, and what the first request of an isolate adds", async () => {
			const { binding, stats } = hyperdrive(pg);
			const h = host();
			const s = normalizeSettings({});
			// One isolate: its own `factsDb` (schema check) and its own cache probe result.
			const isolate = () => {
				resetQueryCache();
				const dbFor = factsDb({ binding: "CA_PG", engine: "postgres" }, async () => h.db, async () => ({ CA_PG: binding }));
				return route(async () => ({ db: await dbFor(s.siteId), kv: h.kv, settings: s, sink: routedSink(dbFor, s, h.kv) }), h.kv);
			};
			const counted = async (send: ReturnType<typeof route>, body: object, at: number, other?: boolean) => {
				const before = stats.statements.length;
				await send(body, at, other);
				return stats.statements.length - before;
			};
			// The first isolate ever creates the tables; the next one finds them.
			await isolate()({ ...VISIT[0], sid: "yyyyyyyyyyyyyyyyyyyy", h: "yyyyyyyyyyy1" }, NOW - 120, true);
			const send = isolate();
			// Another visitor's first page view (a new visit, 2 statements) on a fresh isolate.
			const first = (await counted(send, { ...VISIT[0], sid: "zzzzzzzzzzzzzzzzzzzz", h: "zzzzzzzzzzz1" }, NOW - 60, true)) - 2;
			const per = [];
			for (const [i, body] of VISIT.entries()) per.push(await counted(send, body, NOW + i * 10));
			expect({ first, per }).toEqual({ first: FIRST_PG, per: PER_PG });
			expect(doc).toContain(`| Postgres | ${PER_PG[0]} statements | ${PER_PG[1]} statement | ${PER_PG[2]} statement |`);
			expect(doc).toContain(`first request of an isolate adds ${FIRST_PG} statements`);
		});
	});
});

const FIRST_PG = 7;
const PER_PG = [2, 1, 1, 1];
