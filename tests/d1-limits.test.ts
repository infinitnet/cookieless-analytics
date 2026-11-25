/**
 * D1 refuses a LIKE or GLOB pattern over 50 bytes (`LIKE or GLOB pattern too complex`). Goal and filter values of
 * any length go into the closed-day writer and the reports, so a long prefix or contains value is matched without
 * LIKE (`textMatch`), with the same answer as LIKE. The test databases refuse long patterns as D1 does.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { MAX_LIKE_BYTES, textMatch } from "../src/db/dialect.js";
import { type Goal, QuerySchema } from "../src/query/filters.js";
import { clearReportCache, runReport } from "../src/query/reports/index.js";
import { KV_WATERMARK, runRollup } from "../src/query/rollup.js";
import { normalizeSettings } from "../src/settings.js";
import { assertColumns, assertD1Limits, assertLikePatterns, LIKE_ERROR, MAX_COLUMNS, MAX_SQL_BYTES } from "./d1-limits.js";
import { memoryDb, putHits, schemaDb } from "./helpers.js";
import { kyselyPg } from "./pg.helpers.js";

const LONG = "/guides/how-to-set-up-a-privacy-friendly-analytics-dashboard/";

describe("the LIKE pattern limit of the test databases", () => {
	it("refuses bound and literal patterns over 50 bytes with D1's error", async () => {
		expect(MAX_LIKE_BYTES).toBe(50);
		const ok = "x".repeat(50);
		const long = "x".repeat(51);
		expect(() => assertLikePatterns("SELECT 1 WHERE 'a' LIKE ?", [ok])).not.toThrow();
		expect(() => assertLikePatterns("SELECT 1 WHERE 'a' LIKE ?", [long])).toThrow(LIKE_ERROR);
		expect(() => assertLikePatterns("SELECT 1 WHERE lower('a') LIKE lower(?) ESCAPE '\\'", [long])).toThrow(LIKE_ERROR);
		expect(() => assertLikePatterns("SELECT 1 WHERE 'a' GLOB ?", [long])).toThrow(LIKE_ERROR);
		// The pattern is the parameter after LIKE, not any long value of the statement.
		expect(() => assertLikePatterns("SELECT 1 WHERE ? = 'a' AND 'b' LIKE ?", [long, ok])).not.toThrow();
		expect(() => assertLikePatterns(`SELECT 1 WHERE 'a' LIKE '${long}'`)).toThrow(LIKE_ERROR);
		// Multibyte: 26 two-byte characters are 52 bytes.
		expect(() => assertLikePatterns("SELECT 1 WHERE 'a' LIKE ?", ["\u00e4".repeat(26)])).toThrow(LIKE_ERROR);
		await expect(memoryDb().db.all("SELECT 1 AS n WHERE 'a' LIKE ?", [long])).rejects.toThrow(/LIKE or GLOB pattern too complex/);
	});

	it("refuses a statement over 100 KB and a result over 100 columns", async () => {
		expect(MAX_SQL_BYTES).toBe(100_000);
		expect(MAX_COLUMNS).toBe(100);
		expect(() => assertD1Limits(`SELECT '${"x".repeat(MAX_SQL_BYTES)}'`)).toThrow(/statement too long/);
		expect(() => assertD1Limits(`SELECT '${"x".repeat(1_000)}'`)).not.toThrow();
		const cols = (n: number) => `SELECT ${Array.from({ length: n }, (_, i) => `${i} AS c${i}`).join(", ")}`;
		expect(assertColumns([{ a: 1 }])).toEqual([{ a: 1 }]);
		await expect(memoryDb().db.all(cols(100))).resolves.toHaveLength(1);
		await expect(memoryDb().db.all(cols(101))).rejects.toThrow(/too many columns/);
	});
});

describe("textMatch", () => {
	const values = ["/Guides/A_b%c/", "/guides/a_b%c/x", "/guides/aXb%c/", "", "/g\u00e4", LONG, `${LONG}step-2/`, LONG.toUpperCase(), `/x${LONG}`, `/x${LONG.slice(0, 40)}`];
	const needles = ["/guides/a_b%c/", LONG, LONG.slice(0, 40), "b%c", "DASHBOARD/", "\u00e4"];

	it("uses LIKE while the pattern fits 50 bytes and substr or instr past it", () => {
		expect(textMatch("sqlite", "lower(p)", "prefix", "/a").sql).toBe("lower(p) LIKE lower(?) ESCAPE '\\'");
		expect(textMatch("sqlite", "lower(p)", "prefix", LONG)).toEqual({ sql: "substr(lower(p), 1, length(lower(?))) = lower(?)", params: [LONG, LONG] });
		expect(textMatch("sqlite", "lower(p)", "contains", LONG).sql).toBe("instr(lower(p), lower(?)) > 0");
		expect(textMatch("postgres", "lower(p)", "contains", LONG).sql).toBe("strpos(lower(p), lower(?)) > 0");
		expect(textMatch("sqlite", "lower(p)", "contains", LONG, false).sql).toBe("instr(lower(p), ?) > 0");
	});

	it("answers like LIKE on SQLite and Postgres, also for values past the pattern limit", async () => {
		const pg = kyselyPg();
		const sqlite = memoryDb({ compoundLimit: false }).raw;
		await pg.db.run("CREATE TABLE t (p TEXT)");
		for (const v of values) await pg.db.run("INSERT INTO t (p) VALUES (?)", [v]);
		sqlite.exec("CREATE TABLE t (p TEXT)");
		for (const v of values) sqlite.prepare("INSERT INTO t (p) VALUES (?)").run(v);
		const esc = (n: string) => n.replace(/[\\%_]/g, (c) => `\\${c}`);
		for (const kind of ["prefix", "contains"] as const)
			for (const n of needles) {
				// The reference: LIKE itself (better-sqlite3 and Postgres have no pattern limit), with the escaped pattern.
				const pattern = kind === "prefix" ? `${esc(n)}%` : `%${esc(n)}%`;
				const want = (sqlite.prepare("SELECT p FROM t WHERE lower(p) LIKE lower(?) ESCAPE '\\' ORDER BY p").all(pattern) as Array<{ p: string }>).map((r) => r.p);
				// What `textMatch` builds, and its form without LIKE for every value (short ones included).
				const alt = kind === "prefix" ? { sql: "substr(lower(p), 1, length(lower(?))) = lower(?)", params: [n, n] } : { sql: "instr(lower(p), lower(?)) > 0", params: [n] };
				for (const m of [textMatch("sqlite", "lower(p)", kind, n), alt]) {
					const got = (sqlite.prepare(`SELECT p FROM t WHERE ${m.sql} ORDER BY p`).all(...m.params) as Array<{ p: string }>).map((r) => r.p);
					expect(got, `${kind} ${n} sqlite ${m.sql}`).toEqual(want);
				}
				const pgWant = (await pg.db.all<{ p: string }>(`SELECT p FROM t WHERE lower(p) LIKE lower(?) ESCAPE '\\' ORDER BY p COLLATE "C"`, [pattern])).map((r) => r.p);
				const pgAlt = kind === "prefix" ? alt : { sql: "strpos(lower(p), lower(?)) > 0", params: [n] };
				for (const m of [textMatch("postgres", "lower(p)", kind, n), pgAlt]) {
					const got = (await pg.db.all<{ p: string }>(`SELECT p FROM t WHERE ${m.sql} ORDER BY p COLLATE "C"`, m.params)).map((r) => r.p);
					expect(got, `${kind} ${n} postgres ${m.sql}`).toEqual(pgWant);
				}
			}
		await pg.pg.close();
	}, 60_000);
});

describe("a page goal and filters longer than D1's LIKE pattern", () => {
	afterAll(() => clearReportCache());
	it("close a day through the D1 limits and answer the reports with the pages they match", async () => {
		const env = await schemaDb();
		const TZ = "UTC";
		const ins = env.raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, entry_path, exit_path, pageviews, events, channel, host) VALUES ('default', ?, ?, '2026-03-10', 10, ?, ?, 1800, ?, ?, 1, 0, 'Direct', 'example.com')");
		const t0 = zonedToEpoch("2026-03-10", 10, TZ);
		const paths = [`${LONG}step-1/`, `${LONG}step-2/`, "/guides/how-to-set-up-a-printer/", "/blog/"];
		paths.forEach((p, i) => ins.run(`s${i}${"a".repeat(18)}`, `v${i}`, t0 + i, t0 + i + 5, p, p));
		putHits(env.raw, paths.map((path, i) => ({ id: `pv${i}`, sid: `s${i}${"a".repeat(18)}`, ts: t0 + i, kind: "pv" as const, path })), TZ);
		const goals: Goal[] = [
			{ name: "Long", type: "page", match: "prefix", value: LONG },
			{ name: "Long contains", type: "page", match: "contains", value: LONG.slice(1) },
			{ name: "Short", type: "page", match: "prefix", value: "/guides/how-to-set-up-a-pri" },
		];
		const settings = normalizeSettings({ siteTimezone: TZ });
		const t = await runRollup({ db: env.db, settings, goals: async () => goals }, env.kv, zonedToEpoch("2026-03-13", 1, TZ));
		expect(t.done).toBe(true);
		expect(await env.kv.get(KV_WATERMARK)).toBe("2026-03-11");
		const stored = env.raw.prepare("SELECT key, events, sessions FROM ca_rollup WHERE dim = 'goal' AND seg = '' ORDER BY key").all();
		expect(stored).toEqual([
			{ key: "Long", events: 2, sessions: 2 },
			{ key: "Long contains", events: 2, sessions: 2 },
			// The short prefix also matches the printer page.
			{ key: "Short", events: 3, sessions: 3 },
		]);
		const ctx = { db: env.db, site: "default", settings, now: zonedToEpoch("2026-03-13", 1, TZ), goals, funnels: {}, annotations: [] };
		const filtered = async (op: "prefix" | "contains", value: string) => {
			clearReportCache();
			const r = await runReport(ctx, { report: "pages", query: QuerySchema.parse({ from: "2026-03-10", to: "2026-03-10", filters: [{ dim: "page", op, values: [value] }] }), limit: 100 });
			return (r.data.rows ?? []).map((x) => x.key).sort();
		};
		expect(await filtered("prefix", LONG)).toEqual([`${LONG}step-1/`, `${LONG}step-2/`]);
		expect(await filtered("contains", `${LONG.slice(1)}step-2`)).toEqual([`${LONG}step-2/`]);
	});
});

describe("KV prefix lists", () => {
	it("list fixed short prefixes only: the host's KV list is a LIKE on `plugin:<id>:<prefix>%`, which D1 refuses past 50 bytes", () => {
		const root = join(import.meta.dirname, "..", "src");
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const p = join(dir, name);
				if (statSync(p).isDirectory()) walk(p);
				else if (/\.(ts|tsx)$/.test(name)) files.push(p);
			}
		};
		walk(root);
		// A prefix built from a site id or another value at run time can pass the limit (`search:state:<site>:` did).
		const dynamic = files.filter((f) => /\bkv\??\.list\(\s*`/.test(readFileSync(f, "utf8"))).map((f) => relative(root, f));
		expect(dynamic).toEqual([]);
		for (const prefix of ["salt:", "host:seen:"]) expect(Buffer.byteLength(`plugin:cookieless-analytics:${prefix}%`)).toBeLessThanOrEqual(MAX_LIKE_BYTES);
	});
});
