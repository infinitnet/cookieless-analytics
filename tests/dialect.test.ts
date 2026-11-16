/**
 * Dialect helpers of the visit document layout. SQLite: generated SQL and execution on better-sqlite3.
 * Postgres: generated SQL only. UNVERIFIED: the Postgres strings have never run on a Postgres server.
 */
import { describe, expect, it } from "vitest";
import {
	bind,
	deleteDaySlice,
	docEach,
	docGet,
	docInsert,
	docJson,
	docMerge,
	docObject,
	docRead,
	docSet,
	field,
	int,
	paramRows,
	q,
	SID_SLICES,
	upsertChanged,
} from "../src/db/dialect.js";
import { ensureSchema } from "../src/db/schema.js";
import { rng } from "./capacity.helpers.js";
import { MemoryKv, meteredDb } from "./helpers.js";

describe("numeric binds", () => {
	it("casts integers, never binds them bare", () => {
		expect(int("sqlite", 30)).toEqual({ sql: "CAST(? AS INTEGER)", params: [30] });
		expect(int("postgres", 30n)).toEqual({ sql: "CAST(? AS BIGINT)", params: [30n] });
		expect(() => int("sqlite", 1.5)).toThrow(/not an integer/);
		expect(bind("sqlite", "x")).toEqual({ sql: "?", params: ["x"] });
		expect(bind("sqlite", 2.5)).toEqual({ sql: "?", params: [2.5] });
		expect(bind("postgres", "x")).toEqual({ sql: "CAST(? AS TEXT)", params: ["x"] });
		expect(bind("postgres", 2.5)).toEqual({ sql: "CAST(? AS DOUBLE PRECISION)", params: [2.5] });
		const f = q("sqlite")`UPDATE t SET n = ${7}, s = ${"a"} WHERE k = ${int("sqlite", 3)}`;
		expect(f).toEqual({ sql: "UPDATE t SET n = CAST(? AS INTEGER), s = ? WHERE k = CAST(? AS INTEGER)", params: [7, "a", 3] });
	});

	it("an integer bound through the cast stays an integer in JSON", async () => {
		const { db } = meteredDb();
		const f = q("sqlite")`SELECT json_object('t', ${30}) AS j, typeof(${30}) AS ty`;
		expect(await db.all(f.sql, f.params)).toEqual([{ j: '{"t":30}', ty: "integer" }]);
	});
});

describe("document helpers: generated SQL", () => {
	it("SQLite writes only through jsonb_* and binds the entry key", () => {
		const set = docSet("sqlite", "hits", "h1", { d: 300, x: undefined, s: 40 });
		expect(set).toEqual({ sql: `jsonb_set(hits, ('$."' || ? || '".d'), CAST(? AS INTEGER), ('$."' || ? || '".s'), CAST(? AS INTEGER))`, params: ["h1", 300, "h1", 40] });
		const merge = docMerge("sqlite", "hits", "h1", { t: 30, p: "/a", qs: null });
		expect(merge).toEqual({ sql: "jsonb_patch(jsonb_object(?, jsonb_object('t', CAST(? AS INTEGER), 'p', ?)), hits)", params: ["h1", 30, "/a"] });
		const ins = docInsert("sqlite", "hits", "e1", docObject("sqlite", { t: 5, n: "signup", pr: docJson("sqlite", { plan: "pro" }) }));
		expect(ins).toEqual({
			sql: `jsonb_insert(hits, ('$."' || ? || '"'), jsonb_object('t', CAST(? AS INTEGER), 'n', ?, 'pr', jsonb(?)))`,
			params: ["e1", 5, "signup", '{"plan":"pro"}'],
		});
		expect(docGet("sqlite", "hits", "h1", "d")).toEqual({ sql: `(hits ->> ('$."' || ? || '".d'))`, params: ["h1"] });
		expect(docRead("sqlite", "hits").sql).toBe("json(hits)");
		expect(docEach("sqlite", "hits", "j")).toBe("json_each(hits) AS j");
		expect(field("sqlite", "j", "p")).toBe("(j.value ->> 'p')");
		expect(paramRows("sqlite", [{ r: "bot" }], "x")).toEqual({ sql: "json_each(?) AS x", params: ['[{"r":"bot"}]'] });
		for (const f of [set, merge, ins]) expect(f.sql).not.toMatch(/\bjson_(set|patch|insert|replace|remove|object)\(/);
	});

	it("Postgres uses jsonb operators with typed parameters (UNVERIFIED: not executed)", () => {
		expect(docSet("postgres", "hits", "h1", { d: 300 })).toEqual({
			sql: "(hits || jsonb_build_object(CAST(? AS TEXT), COALESCE(hits -> CAST(? AS TEXT), '{}'::jsonb) || jsonb_build_object('d', CAST(? AS BIGINT))))",
			params: ["h1", "h1", 300],
		});
		expect(docMerge("postgres", "hits", "h1", { t: 30, p: "/a" })).toEqual({
			sql: "(hits || jsonb_build_object(CAST(? AS TEXT), jsonb_build_object('t', CAST(? AS BIGINT), 'p', CAST(? AS TEXT)) || COALESCE(hits -> CAST(? AS TEXT), '{}'::jsonb)))",
			params: ["h1", 30, "/a", "h1"],
		});
		expect(docInsert("postgres", "hits", "e1", docJson("postgres", { t: 5 }))).toEqual({
			sql: "(jsonb_build_object(CAST(? AS TEXT), CAST(? AS JSONB)) || hits)",
			params: ["e1", '{"t":5}'],
		});
		expect(docGet("postgres", "hits", "h1", "d", "int")).toEqual({ sql: "CAST((hits -> CAST(? AS TEXT) ->> 'd') AS BIGINT)", params: ["h1"] });
		expect(docRead("postgres", "hits").sql).toBe("CAST(hits AS TEXT)");
		expect(docEach("postgres", "hits", "j")).toBe("jsonb_each(hits) AS j(key, value)");
		expect(field("postgres", "j", "t", "int")).toBe("CAST((j.value ->> 't') AS BIGINT)");
		expect(paramRows("postgres", [], "x").sql).toBe("jsonb_array_elements(CAST(? AS JSONB)) AS x(value)");
	});

	it("rejects keys and fields that could leave the JSON path", () => {
		expect(() => docSet("sqlite", "hits", 'a"b', { d: 1 })).toThrow(/document key/);
		expect(() => docGet("sqlite", "hits", "h1", "d') OR 1 --")).toThrow(/document field/);
		expect(() => docSet("sqlite", "hits; DROP", "h1", { d: 1 })).toThrow(/identifier/);
	});
});

describe("document helpers on SQLite", () => {
	async function visit() {
		const m = meteredDb();
		await ensureSchema(m.db, new MemoryKv());
		m.raw
			.prepare("INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, hits) VALUES ('s', '2026-06-10', 'aaaa', 'k', 9, 1000, 1000, 1800, jsonb('{}'))")
			.run();
		const doc = () => m.raw.prepare("SELECT typeof(hits) AS ty, json(hits) AS j FROM ca_sessions").get() as { ty: string; j: string };
		const update = async (set: { sql: string; params: unknown[] }) => (await m.db.run(`UPDATE ca_sessions SET hits = ${set.sql} WHERE site = 's' AND day = '2026-06-10' AND sid = 'aaaa'`, set.params as never)).changes;
		return { m, doc, update };
	}

	it("keeps the column a JSONB blob through page view merge (S1), engagement set (S2) and event insert (S3)", async () => {
		const { doc, update } = await visit();
		// S2 before its page view: the entry is created.
		await update(docSet("sqlite", "hits", "h1", { d: 300, e: 400 }));
		expect(doc()).toEqual({ ty: "blob", j: '{"h1":{"d":300,"e":400}}' });
		// S1: the stored fields win, the missing ones are added.
		await update(docMerge("sqlite", "hits", "h1", { t: 30, p: "/a", d: 1 }));
		expect(doc()).toEqual({ ty: "blob", j: '{"h1":{"t":30,"p":"/a","d":300,"e":400}}' });
		// A replay of S1 changes nothing in the data.
		await update(docMerge("sqlite", "hits", "h1", { t: 99, p: "/z" }));
		expect(JSON.parse(doc().j).h1).toEqual({ t: 30, p: "/a", d: 300, e: 400 });
		// S3: an event entry, never overwritten by a replay.
		await update(docInsert("sqlite", "hits", "e1", docObject("sqlite", { t: 40, n: "signup", pr: docJson("sqlite", { plan: "pro" }) })));
		await update(docInsert("sqlite", "hits", "e1", docObject("sqlite", { t: 41, n: "other" })));
		expect(doc().ty).toBe("blob");
		expect(JSON.parse(doc().j).e1).toEqual({ t: 40, n: "signup", pr: { plan: "pro" } });
	});

	it("reads entries with docGet and docEach", async () => {
		const { m, update } = await visit();
		await update(docMerge("sqlite", "hits", "h1", { t: 30, p: "/a" }));
		await update(docMerge("sqlite", "hits", "h2", { t: 90, p: "/b" }));
		const g = docGet("sqlite", "hits", "h2", "t");
		expect(await m.db.all(`SELECT ${g.sql} AS t FROM ca_sessions`, g.params)).toEqual([{ t: 90 }]);
		const rows = await m.db.all(`SELECT j.key AS k, ${field("sqlite", "j", "p")} AS p FROM ca_sessions s, ${docEach("sqlite", "s.hits", "j")} ORDER BY k`);
		expect(rows).toEqual([{ k: "h1", p: "/a" }, { k: "h2", p: "/b" }]);
	});

	it("each document write costs 1 row written, a replay too", async () => {
		const { m, update } = await visit();
		m.reset();
		await update(docMerge("sqlite", "hits", "h1", { t: 30, p: "/a" }));
		await update(docMerge("sqlite", "hits", "h1", { t: 30, p: "/a" }));
		expect(m.log.map((e) => e.written)).toEqual([1, 1]);
	});
});

describe("upsertChanged", () => {
	it("builds the WHERE from the column list for both dialects", () => {
		expect(upsertChanged("sqlite", "ca_cube", ["site", "day"], ["sessions", "pageviews"])).toBe(
			"ON CONFLICT (site, day) DO UPDATE SET sessions = excluded.sessions, pageviews = excluded.pageviews WHERE ca_cube.sessions IS NOT excluded.sessions OR ca_cube.pageviews IS NOT excluded.pageviews",
		);
		expect(upsertChanged("postgres", "ca_drops", ["site", "day", "reason"], [], ["n"])).toBe(
			"ON CONFLICT (site, day, reason) DO UPDATE SET n = ca_drops.n + excluded.n WHERE excluded.n <> 0",
		);
		expect(upsertChanged("postgres", "ca_cube", ["site"], ["sessions"])).toContain("ca_cube.sessions IS DISTINCT FROM excluded.sessions");
		expect(upsertChanged("sqlite", "ca_cube", ["site"])).toBe("ON CONFLICT (site) DO NOTHING");
	});

	it("a no-op rewrite changes 0 rows and costs 0 rows written; a changed row costs 1", async () => {
		const m = meteredDb();
		await ensureSchema(m.db, new MemoryKv());
		const cols = ["site", "day", "channel", "country", "device", "sessions", "pageviews"];
		const write = (rows: Array<[string, number, string, number, number]>) => {
			const s = q("sqlite");
			const values = rows.map(([ch, day, co, se, pv]) => s`(${"s"}, ${day}, ${ch}, ${co}, ${"desktop"}, ${se}, ${pv})`);
			const v = values.reduce((a, b) => ({ sql: `${a.sql}, ${b.sql}`, params: [...a.params, ...b.params] }));
			return m.db.run(`INSERT INTO ca_cube (${cols.join(", ")}) VALUES ${v.sql} ${upsertChanged("sqlite", "ca_cube", cols.slice(0, 5), ["sessions", "pageviews"])}`, v.params);
		};
		const rows: Array<[string, number, string, number, number]> = [
			["direct", 20260610, "DE", 3, 9],
			["search", 20260610, "DE", 2, 4],
			["social", 20260610, "FR", 1, 1],
		];
		expect((await write(rows)).changes).toBe(3);
		m.reset();
		expect((await write(rows)).changes).toBe(0);
		expect(m.stats.rowsWritten).toBe(0);
		expect((await write([["direct", 20260610, "DE", 3, 10], ...rows.slice(1)])).changes).toBe(1);
		expect(m.stats.rowsWritten).toBe(1);
		// Without the WHERE the same no-op rewrite costs every row.
		m.reset();
		const plain = `INSERT INTO ca_cube (${cols.join(", ")}) SELECT ${cols.join(", ")} FROM ca_cube WHERE 1 ON CONFLICT (site, day, channel, country, device) DO UPDATE SET sessions = excluded.sessions`;
		expect((await m.db.run(plain)).changes).toBe(3);
		expect(m.stats.rowsWritten).toBe(3);
	});
});

describe("retention by key range", () => {
	it("builds the slice delete with bound and cast keys", () => {
		expect(deleteDaySlice("sqlite", "ca_sessions", "s", 20260610, ["a", "b"])).toEqual({
			sql: "DELETE FROM ca_sessions WHERE site = ? AND day = CAST(? AS INTEGER) AND sid >= ? AND sid < ?",
			params: ["s", 20260610, "a", "b"],
		});
		expect(deleteDaySlice("postgres", "ca_sessions", "s", "2026-06-10", [null, "1"])).toEqual({
			sql: "DELETE FROM ca_sessions WHERE site = CAST(? AS TEXT) AND day = CAST(? AS TEXT) AND sid < CAST(? AS TEXT)",
			params: ["s", "2026-06-10", "1"],
		});
		expect(SID_SLICES).toHaveLength(36);
		expect(SID_SLICES[0]).toEqual([null, "1"]);
		expect(SID_SLICES[35]).toEqual(["z", null]);
	});

	it("deletes exactly one day, slice by slice, at 1 row written and about 1 read per visit", async () => {
		const m = meteredDb();
		await ensureSchema(m.db, new MemoryKv());
		const r = rng(3);
		const ins = m.raw.prepare("INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s) VALUES ('s', ?, ?, 'k', 0, 1, 1, 1800)");
		const sid = () => Array.from({ length: 20 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(r() * 36)]).join("");
		for (let i = 0; i < 400; i++) ins.run(i % 2 ? "2026-06-10" : "2026-06-11", sid());
		m.reset();
		let deleted = 0;
		for (const slice of SID_SLICES) {
			const d = deleteDaySlice("sqlite", "ca_sessions", "s", "2026-06-10", slice);
			deleted += (await m.db.run(d.sql, d.params)).changes;
		}
		expect(deleted).toBe(200);
		expect(m.raw.prepare("SELECT day, COUNT(*) AS n FROM ca_sessions GROUP BY day").all()).toEqual([{ day: "2026-06-11", n: 200 }]);
		expect(m.stats.rowsWritten).toBe(200);
		// The meter's read count is a lower bound: rows deleted plus one probe per empty slice.
		expect(m.stats.rowsRead).toBeLessThanOrEqual(200 + 36);
	});
});
