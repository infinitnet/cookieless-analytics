/** The data move codec: table specs against the live schema, keyset chunks, idempotent loads, the conflict rules, verification totals. */
import { createHash } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { beforeAll, describe, expect, it } from "vitest";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { zonedToEpoch } from "../src/core/time.js";
import { type Db, fromKysely } from "../src/db/adapter.js";
import { ensureSchema, TABLES } from "../src/db/schema.js";
import type { Param } from "../src/db/sql.js";
import { TABLE_SPECS, type TableName } from "../src/db/tables.js";
import { dayTotals, missingKeys, readChunk, SPLIT_SUFFIX, writeChunk } from "../src/move/chunks.js";
import { runRollup } from "../src/query/rollup.js";
import { normalizeSettings } from "../src/settings.js";
import { replaceDays } from "../src/sources/store.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { MemoryKv, memoryDb } from "./helpers.js";

const START = zonedToEpoch("2026-06-01", 0, "UTC");
const NOW = zonedToEpoch("2026-06-09", 3, "UTC");
const S = normalizeSettings({});

/** A source with rows in all nine tables, including quotes, umlauts, emoji and a non-integer amount. */
async function seeded(): Promise<ReturnType<typeof memoryDb>> {
	const m = memoryDb();
	await ensureSchema(m.db, new MemoryKv());
	const kv = new MemoryKv();
	await recordTraffic(m.db, generateTraffic({ pageviews: 400, seed: 5, rich: true, start: START, spanSeconds: 6 * 86_400 - 1 }));
	await recordAgentEvents({ db: m.db, kv, settings: S, now: START + 5 * 86_400 }, "default", [
		{ name: "purchase", val: 49.9, cur: "EUR", oid: "o-1", ts: START + 4 * 86_400 },
		{ name: "purchase", val: 0.1 + 0.2, cur: "USD", oid: "o-2", ts: START + 4 * 86_400 + 60, p: { plan: "pro", "ünï": "çödé \"q\" \\ \n 😀" } },
	]);
	const rc = { db: m.db, settings: S, goals: async () => [] };
	let t = await runRollup(rc, kv, NOW);
	for (let i = 0; i < 80 && !t.done; i++) t = await runRollup(rc, kv, NOW);
	const days = new Map([1, 2, 3].map((d) => [`2026-06-0${d}`, [{ page_key: "/blog/a", query: "gärten 'tips' \"x\"", country: "de", device: "MOBILE", clicks: 3 + d, impressions: 100, pos_sum: 420.123456789 }]]));
	await replaceDays(m.db, "default", "google", days, () => false);
	await m.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 3, 1)");
	await m.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 2), ('shop', 20260605, 'invalid', 7)");
	return m;
}

async function fresh(): Promise<Db> {
	const m = memoryDb();
	await ensureSchema(m.db, new MemoryKv());
	return m.db;
}

/** Copy every table in chunks of `size`, loading each chunk twice; returns rows inserted by the first and by the replayed load. */
async function copyAll(from: Db, to: Db, size: number, site?: string) {
	let inserted = 0;
	let replayed = 0;
	for (const t of TABLES) {
		let after: Param[] | null = null;
		do {
			const c = await readChunk(from, t, after, size, site);
			inserted += await writeChunk(to, t, c.rows, "add");
			replayed += await writeChunk(to, t, c.rows);
			after = c.next;
		} while (after);
	}
	return { inserted, replayed };
}

const stable = (v: unknown): unknown =>
	Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;

/** Canonical hash of a table: numbers as numbers, the document parsed and key-sorted, rows sorted in JavaScript. */
async function tableHash(db: Db, table: TableName) {
	const out: string[] = [];
	let after: Param[] | null = null;
	do {
		const c = await readChunk(db, table, after, 500);
		for (const r of c.rows) out.push(JSON.stringify(TABLE_SPECS[table].columns.map(({ name, kind }) => {
			const v = r[name];
			return v === null || v === undefined ? null : kind === "int" || kind === "real" ? Number(v) : kind === "doc" ? stable(JSON.parse(String(v))) : String(v);
		})));
		after = c.next;
	} while (after);
	return { n: out.length, sha: createHash("sha256").update(out.sort().join("\n")).digest("hex") };
}

/** Columns from the live catalog of either engine, in the vocabulary of `tables.ts`. */
async function liveSpec(db: Db, table: string) {
	if (db.dialect === "sqlite") {
		const rows = await db.all<{ name: string; type: string; pk: number }>(`SELECT name, type, pk FROM pragma_table_info('${table}')`);
		const kind = (t: string) => ({ INTEGER: "int", REAL: "real", BLOB: "doc" })[t] ?? "text";
		return { columns: rows.map((r) => ({ name: r.name, kind: kind(r.type) })), key: rows.filter((r) => r.pk > 0).sort((a, b) => a.pk - b.pk).map((r) => r.name) };
	}
	const rows = await db.all<{ name: string; type: string }>("SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position", [table]);
	const key = await db.all<{ name: string }>(
		"SELECT k.column_name AS name FROM information_schema.table_constraints c JOIN information_schema.key_column_usage k ON k.constraint_name = c.constraint_name AND k.table_schema = c.table_schema WHERE c.constraint_type = 'PRIMARY KEY' AND c.table_schema = current_schema() AND c.table_name = ? ORDER BY k.ordinal_position",
		[table],
	);
	const kind = (t: string) => ({ bigint: "int", "double precision": "real", jsonb: "doc" })[t] ?? "text";
	return { columns: rows.map((r) => ({ name: r.name, kind: kind(r.type) })), key: key.map((r) => r.name) };
}

const plain = (t: TableName) => ({ columns: TABLE_SPECS[t].columns.map((c) => ({ ...c })), key: [...TABLE_SPECS[t].key] });

describe("move codec on SQLite", () => {
	let src: ReturnType<typeof memoryDb>;
	beforeAll(async () => {
		src = await seeded();
	}, 60_000);

	it("the table specs match the live schema", async () => {
		expect(Object.keys(TABLE_SPECS).sort()).toEqual([...TABLES].sort());
		for (const t of TABLES) expect(await liveSpec(src.db, t), t).toEqual(plain(t));
	});

	it("copies every table into a fresh database: equal hashes and totals, a replayed chunk inserts nothing, the document stays binary", async () => {
		const dst = memoryDb();
		await ensureSchema(dst.db, new MemoryKv());
		const { inserted, replayed } = await copyAll(src.db, dst.db, 37);
		expect(replayed).toBe(0);
		let rows = 0;
		for (const t of TABLES) {
			const a = await tableHash(src.db, t);
			expect(a.n, t).toBeGreaterThan(0);
			expect(await tableHash(dst.db, t), t).toEqual(a);
			expect(await dayTotals(dst.db, t), t).toEqual(await dayTotals(src.db, t));
			rows += a.n;
		}
		expect(inserted).toBe(rows);
		expect(dst.raw.prepare("SELECT DISTINCT typeof(hits) AS t FROM ca_sessions").all()).toEqual([{ t: "blob" }]);
	}, 60_000);

	it("reads visits newest day first (one site here) and keeps to one site when asked", async () => {
		const first = await readChunk(src.db, "ca_sessions", null, 5);
		const days = (await src.db.all<{ day: string }>("SELECT MAX(day) AS day FROM ca_sessions"))[0]?.day;
		expect(first.rows[0]?.day).toBe(days);
		const shop = await readChunk(src.db, "ca_drops", null, 100, "shop");
		expect(shop).toEqual({ rows: [{ site: "shop", day: 20260605, reason: "invalid", n: 7 }], next: null });
		await expect(readChunk(src.db, "ca_drops", ["default"], 10)).rejects.toThrow("needs 3 values");
	});

	it("keeps the destination row on a conflict, adds counters on the first load only", async () => {
		const dst = await fresh();
		await dst.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 5, 9)");
		await dst.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 1)");
		await dst.run("INSERT INTO ca_aliases (site, sid, canon, expires) VALUES ('default', 'a1', 'new', 99)");
		const srv = await readChunk(src.db, "ca_srv", null, 100);
		const drops = await readChunk(src.db, "ca_drops", null, 100);
		expect(await writeChunk(dst, "ca_srv", srv.rows, "add")).toBe(1);
		expect(await writeChunk(dst, "ca_drops", drops.rows, "add")).toBe(2);
		await writeChunk(dst, "ca_srv", srv.rows);
		await writeChunk(dst, "ca_drops", drops.rows);
		expect(await dst.all("SELECT n, last_ts FROM ca_srv")).toEqual([{ n: 8, last_ts: 9 }]);
		expect(await dst.all("SELECT site, n FROM ca_drops ORDER BY site")).toEqual([{ site: "default", n: 3 }, { site: "shop", n: 7 }]);
		expect(await writeChunk(dst, "ca_aliases", [{ site: "default", sid: "a1", canon: "old", expires: 1 }], "add")).toBe(0);
		expect(await dst.all("SELECT canon, expires FROM ca_aliases")).toEqual([{ canon: "new", expires: 99 }]);
		await expect(writeChunk(dst, "ca_meta" as TableName, [{}])).rejects.toThrow("not an analytics table");
	});

	it("cuts a chunk by bytes: the next read starts after the last row kept; a first row over the limit still comes alone", async () => {
		const all = await readChunk(src.db, "ca_sessions", null, 30);
		const size = (rows: readonly object[]) => rows.reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r)) + 1, 0);
		const cap = size(all.rows.slice(0, 10)) + 1;
		const cut = await readChunk(src.db, "ca_sessions", null, 30, undefined, cap);
		expect(cut.rows).toEqual(all.rows.slice(0, 10));
		expect((await readChunk(src.db, "ca_sessions", cut.next, 20)).rows).toEqual(all.rows.slice(10, 30));
		expect((await readChunk(src.db, "ca_sessions", null, 30, undefined, 1)).rows).toHaveLength(1);
	});

	it("reads visits site first in descending order: the newest day first within each site", async () => {
		const db = await fresh();
		const visit = (site: string, day: string, sid: string) =>
			db.run(
				"INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, pageviews, events, engaged_ms, visible_ms, reentries, max_scroll, interacted, hits) VALUES (?, ?, ?, 'v', 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, jsonb('[]'))",
				[site, day, sid],
			);
		await visit("a", "2026-06-02", "x");
		await visit("b", "2026-06-01", "x");
		await visit("a", "2026-06-01", "x");
		const c = await readChunk(db, "ca_sessions", null, 10);
		expect(c.rows.map((r) => [r.site, r.day])).toEqual([["b", "2026-06-01"], ["a", "2026-06-02"], ["a", "2026-06-01"]]);
	});

	it("max keeps the row with the larger count and is idempotent", async () => {
		const dst = await fresh();
		await dst.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 2, 7)");
		await dst.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 9)");
		const srv = await readChunk(src.db, "ca_srv", null, 100);
		const drops = await readChunk(src.db, "ca_drops", null, 100);
		expect(await writeChunk(dst, "ca_srv", srv.rows, "max")).toBe(1);
		expect(await writeChunk(dst, "ca_srv", srv.rows, "max")).toBe(0);
		expect(await writeChunk(dst, "ca_drops", drops.rows, "max")).toBe(1);
		expect(await dst.all("SELECT n, last_ts FROM ca_srv")).toEqual([{ n: 3, last_ts: 1 }]);
		expect(await dst.all("SELECT site, n FROM ca_drops ORDER BY site")).toEqual([{ site: "default", n: 9 }, { site: "shop", n: 7 }]);
	});

	it("day totals sum real columns, rounded to two decimals", async () => {
		const t = await dayTotals(src.db, "ca_search_daily");
		expect(t["default 2026-06-02"]?.pos_sum).toBe("420.12");
		expect(Object.values(await dayTotals(src.db, "ca_revenue_daily")).some((r) => Object.keys(r).length > 1)).toBe(true);
	});

	it("missingKeys pages the source keys of one day and returns those the destination lacks; a split visit counts as present", async () => {
		const dst = await fresh();
		const day = (await src.db.all<{ day: string }>("SELECT MAX(day) AS day FROM ca_sessions"))[0]!.day;
		const keys = await src.db.all<{ sid: string; started: number }>("SELECT sid, started FROM ca_sessions WHERE site = 'default' AND day = ? ORDER BY sid", [day]);
		expect(keys.length).toBeGreaterThan(3);
		let after: Param[] | null = null;
		do {
			const c = await readChunk(src.db, "ca_sessions", after, 50);
			await writeChunk(dst, "ca_sessions", c.rows);
			after = c.next;
		} while (after);
		await dst.run("DELETE FROM ca_sessions WHERE site = 'default' AND day = ? AND sid = ?", [day, keys[1]!.sid]);
		await dst.run("UPDATE ca_sessions SET sid = sid || ? WHERE site = 'default' AND day = ? AND sid = ?", [SPLIT_SUFFIX, day, keys[2]!.sid]);
		const found: unknown[] = [];
		let pages = 0;
		after = null;
		do {
			const p = await missingKeys(src.db, dst, "ca_sessions", "default", String(day), after, 2);
			found.push(...p.missing);
			after = p.next;
			pages++;
		} while (after);
		expect(pages).toBe(Math.ceil(keys.length / 2) + (keys.length % 2 ? 0 : 1));
		expect(found).toEqual([{ site: "default", day, sid: keys[1]!.sid }]);
		expect((await missingKeys(src.db, dst, "ca_drops", "default", "20260605", null, 10)).missing).toEqual([{ site: "default", day: 20260605, reason: "invalid" }]);
	});

	it("a visit that went on after the switch keeps both halves: the source half under sid plus a suffix", async () => {
		const dst = await fresh();
		const old = (await readChunk(src.db, "ca_sessions", null, 1)).rows[0]!;
		await writeChunk(dst, "ca_sessions", [{ ...old, started: Number(old.started) + 3600, pageviews: 1, hits: "{}" }]);
		expect(await writeChunk(dst, "ca_sessions", [old])).toBe(1);
		expect(await writeChunk(dst, "ca_sessions", [old])).toBe(0);
		const rows = await dst.all<{ sid: string; started: number }>("SELECT sid, started FROM ca_sessions ORDER BY sid");
		expect(rows).toEqual([
			{ sid: old.sid, started: Number(old.started) + 3600 },
			{ sid: `${String(old.sid)}${SPLIT_SUFFIX}`, started: Number(old.started) },
		]);
		const same = await fresh();
		await writeChunk(same, "ca_sessions", [old]);
		expect(await writeChunk(same, "ca_sessions", [old])).toBe(0);
		expect(await same.all("SELECT COUNT(*) AS n FROM ca_sessions")).toEqual([{ n: 1 }]);
	});
});

import * as pglite from "@electric-sql/pglite";

describe("move codec across engines (PGlite)", () => {
	it("the specs match Postgres; SQLite to Postgres to SQLite keeps every table equal", async () => {
		// int8 and numeric as strings, as node-postgres returns them.
		const pgl = new pglite.PGlite({ parsers: { 20: (v: string) => v, 1700: (v: string) => v } });
		const pg = fromKysely(new Kysely<any>({ dialect: new PGliteDialect({ pglite: pgl as never }) }));
		expect(pg.dialect).toBe("postgres");
		await ensureSchema(pg, new MemoryKv());
		for (const t of TABLES) expect(await liveSpec(pg, t), t).toEqual(plain(t));
		const src = await seeded();
		expect((await copyAll(src.db, pg, 53)).replayed).toBe(0);
		const back = memoryDb();
		await ensureSchema(back.db, new MemoryKv());
		expect((await copyAll(pg, back.db, 71)).replayed).toBe(0);
		for (const t of TABLES) {
			const a = await tableHash(src.db, t);
			expect(await tableHash(pg, t), t).toEqual(a);
			expect(await tableHash(back.db, t), t).toEqual(a);
			const totals = await dayTotals(src.db, t);
			expect(await dayTotals(pg, t), t).toEqual(totals);
			expect(await dayTotals(back.db, t), t).toEqual(totals);
		}
		expect(back.raw.prepare("SELECT DISTINCT typeof(hits) AS t FROM ca_sessions").all()).toEqual([{ t: "blob" }]);
		// The key check against Postgres: integer days, text keys, a cursor.
		await pg.run("DELETE FROM ca_drops WHERE site = 'default'");
		expect((await missingKeys(src.db, pg, "ca_drops", "default", "20260605", null, 10)).missing).toEqual([{ site: "default", day: "20260605", reason: "invalid" }]);
		const vday = String((await src.db.all<{ day: string }>("SELECT MAX(day) AS day FROM ca_sessions"))[0]!.day);
		let after: Param[] | null = null;
		do {
			const p = await missingKeys(src.db, pg, "ca_sessions", "default", vday, after, 3);
			expect(p.missing).toEqual([]);
			after = p.next;
		} while (after);
		// The conflict rules on Postgres: the split visit and the counter add.
		const old = (await readChunk(pg, "ca_sessions", null, 1)).rows[0]!;
		await pg.run("UPDATE ca_sessions SET started = started + 3600 WHERE site = ? AND day = ? AND sid = ?", [old.site as string, old.day as string, old.sid as string]);
		expect(await writeChunk(pg, "ca_sessions", [old])).toBe(1);
		expect(await writeChunk(pg, "ca_sessions", [old])).toBe(0);
		expect(await pg.all("SELECT sid FROM ca_sessions WHERE site = ? AND day = ? AND sid LIKE ? ORDER BY sid", [old.site as string, old.day as string, `${String(old.sid)}%`])).toEqual([{ sid: old.sid }, { sid: `${String(old.sid)}${SPLIT_SUFFIX}` }]);
		expect(await writeChunk(pg, "ca_srv", (await readChunk(src.db, "ca_srv", null, 10)).rows, "add")).toBe(1);
		expect(await pg.all("SELECT n FROM ca_srv")).toEqual([{ n: "6" }]);
		await pgl.close();
	}, 120_000);
});
