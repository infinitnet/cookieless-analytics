import { describe, expect, it } from "vitest";
import { detectDialect, selfCheck, toPostgresPlaceholders } from "../src/db/adapter.js";
import { ddl, jsonExtract, LIKE_ESCAPE, likeEscape, upsertClause } from "../src/db/dialect.js";
import { ensureSchema, INDEXES, MIGRATIONS, migrationSql, SCHEMA_VERSION, SCHEMA_VERSION_KEY, TABLES } from "../src/db/schema.js";
import { assertParams, chunk, countParams, ident, inChunks } from "../src/db/sql.js";
import { MemoryKv, memoryDb } from "./helpers.js";

describe("ensureSchema", () => {
	it("creates all tables and indexes on in-memory SQLite and is idempotent", async () => {
		const { db, kysely, raw } = memoryDb();
		const kv = new MemoryKv();
		expect(detectDialect(kysely)).toBe("sqlite");
		expect(SCHEMA_VERSION).toBe(1);
		expect(await ensureSchema(db, kv)).toBe(SCHEMA_VERSION);
		expect(await kv.get(SCHEMA_VERSION_KEY)).toBe(SCHEMA_VERSION);
		const objects = () => raw.prepare("SELECT type, name FROM sqlite_master WHERE name LIKE 'ca_%' ORDER BY name").all() as { type: string; name: string }[];
		const first = objects();
		expect(first.filter((o) => o.type === "table").map((o) => o.name).sort()).toEqual([...TABLES].sort());
		expect(first.filter((o) => o.type === "index").map((o) => o.name).sort()).toEqual([...INDEXES].sort());
		// Second call: version already recorded, nothing runs.
		expect(await ensureSchema(db, kv)).toBe(SCHEMA_VERSION);
		// Lost KV state: statements re-run safely.
		await kv.delete(SCHEMA_VERSION_KEY);
		expect(await ensureSchema(db, kv)).toBe(SCHEMA_VERSION);
		expect(objects()).toEqual(first);
		await kysely.destroy();
	});

	it("has the rollup columns and the clustered layout", async () => {
		const { db, kysely, raw } = memoryDb();
		await ensureSchema(db, new MemoryKv());
		const cols = (t: string) => (raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
		expect(cols("ca_sessions")).toEqual([
			"site", "day", "sid", "vkey", "hour", "started", "last_seen", "window_s", "entry_path", "exit_path", "pageviews", "events",
			"engaged_ms", "visible_ms", "reentries", "max_scroll", "interacted", "ref_host", "ref_path", "channel", "source", "utm_source", "utm_medium",
			"utm_campaign", "utm_term", "utm_content", "country", "region", "device", "browser", "browser_major", "os", "lang", "screen", "host", "hits",
		]);
		expect(cols("ca_events")).toEqual(["site", "id", "day", "ts", "sday", "sid", "name", "path", "props", "val", "cur"]);
		expect(cols("ca_srv")).toEqual(["site", "day", "status", "path", "ref", "n", "last_ts"]);
		expect(cols("ca_drops")).toEqual(["site", "day", "reason", "n"]);
		expect(cols("ca_cube")).toEqual(["site", "day", "channel", "country", "device", "sessions", "pageviews", "visitors", "bounces", "engaged", "duration_ms", "events"]);
		// The row-per-hit table is gone: page views and events live in `ca_sessions.hits`.
		expect(cols("ca_hits")).toEqual([]);
		expect(cols("ca_rollup")).toEqual(["site", "day", "dim", "key", "seg", "segkey", "pageviews", "sessions", "visitors", "bounces", "engaged", "engaged_ms", "events", "hits"]);
		expect(cols("ca_aliases")).toEqual(["site", "sid", "canon", "expires"]);
		expect(cols("ca_search_daily")).toEqual([
			"site", "source", "day", "page_key", "query", "country", "device", "clicks", "impressions", "pos_sum", "provisional",
		]);
		expect(cols("ca_revenue_daily")).toEqual(["site", "day", "dim", "key", "cur", "seg", "segkey", "orders", "revenue", "sessions"]);
		const pk = (t: string) => (raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string; pk: number }[]).filter((c) => c.pk).sort((a, b) => a.pk - b.pk).map((c) => c.name);
		expect(pk("ca_sessions")).toEqual(["site", "day", "sid"]);
		expect(pk("ca_events")).toEqual(["site", "id"]);
		expect(pk("ca_srv")).toEqual(["site", "day", "status", "path", "ref"]);
		expect(pk("ca_drops")).toEqual(["site", "day", "reason"]);
		expect(pk("ca_cube")).toEqual(["site", "day", "channel", "country", "device"]);
		expect(pk("ca_aliases")).toEqual(["site", "sid"]);
		expect(pk("ca_rollup")).toEqual(["site", "dim", "seg", "day", "key", "segkey"]);
		expect(pk("ca_revenue_daily")).toEqual(["site", "dim", "seg", "day", "key", "segkey", "cur"]);
		expect(pk("ca_search_daily")).toEqual(["site", "source", "day", "page_key", "query", "country", "device"]);
		// Clustered (the primary key is the table) everywhere.
		const withoutRowid = (raw.prepare("SELECT name FROM pragma_table_list WHERE wr = 1 AND name LIKE 'ca_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
		expect(withoutRowid).toEqual([...TABLES].sort());
		const idxCols = (i: string) => (raw.prepare(`PRAGMA index_info(${i})`).all() as { name: string }[]).map((c) => c.name);
		// One secondary index on the visit table, written once per visit (vkey never changes).
		expect(idxCols("ca_sessions_vkey")).toEqual(["site", "vkey"]);
		expect(INDEXES.filter((i) => i.startsWith("ca_sessions_"))).toEqual(["ca_sessions_vkey"]);
		expect(idxCols("ca_events_day")).toEqual(["site", "day"]);
		expect(INDEXES).toEqual(["ca_sessions_vkey", "ca_events_day", "ca_search_daily_site_page_day"]);
		expect(idxCols("ca_search_daily_site_page_day")).toEqual(["site", "page_key", "day"]);
		// No secondary index on the summary tables.
		expect(INDEXES.some((i) => /^ca_(rollup|cube|revenue_daily)_/.test(i))).toBe(false);
		await kysely.destroy();
	});

	it("two runs at once on a fresh database both end on version 1 with the full layout and keep other state", async () => {
		const { db, kysely, raw } = memoryDb();
		const kv = new MemoryKv();
		await kv.set("settings:capacityProfile", "small");
		expect(await Promise.all([ensureSchema(db, kv), ensureSchema(db, kv)])).toEqual([1, 1]);
		const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ca_%'").all() as { name: string }[]).map((r) => r.name);
		expect(tables.sort()).toEqual([...TABLES].sort());
		expect(await kv.get("settings:capacityProfile")).toBe("small");
		await kysely.destroy();
	});

	it("stores the visit document as a JSONB blob on SQLite", async () => {
		const { db, kysely, raw } = memoryDb();
		await ensureSchema(db, new MemoryKv());
		raw.prepare("INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s) VALUES ('s', '2026-06-10', 'a', 'k', 0, 1, 1, 1800)").run();
		expect(raw.prepare("SELECT typeof(hits) AS t, json(hits) AS j FROM ca_sessions").get()).toEqual({ t: "blob", j: "{}" });
		await kysely.destroy();
	});

	it("produces Postgres DDL with BIGINT and DOUBLE PRECISION", () => {
		const sql = migrationSql(MIGRATIONS[0]!, "postgres").join("\n");
		expect(sql).toContain("started BIGINT NOT NULL");
		expect(sql).toContain("val DOUBLE PRECISION");
		expect(sql).toContain("hits JSONB NOT NULL DEFAULT '{}'::jsonb");
		expect(sql).not.toContain("WITHOUT ROWID");
		expect(sql).not.toMatch(/\{[A-Z]+\}/);
		expect(ddl("sqlite", "x {INT}, y {REAL}, d {DOC}){NOROWID}")).toBe("x INTEGER, y REAL, d BLOB NOT NULL DEFAULT (jsonb('{}'))) WITHOUT ROWID");
	});
});

describe("Db adapter on SQLite", () => {
	it("runs parameterized statements, batches and upserts", async () => {
		const { db, kysely } = memoryDb();
		await ensureSchema(db, new MemoryKv());
		expect(await selfCheck(db)).toEqual({ ok: true, dialect: "sqlite" });
		const insert = `INSERT INTO ca_rollup (site, day, dim, key, pageviews) VALUES (?, ?, ?, ?, ?) ${upsertClause("ca_rollup", ["site", "dim", "seg", "day", "key", "segkey"], [], ["pageviews"])}`;
		assertParams(insert, ["s", "d", "page", "/", 1]);
		await db.batch([
			{ sql: insert, params: ["s", "2026-01-01", "page", "/", 2] },
			{ sql: insert, params: ["s", "2026-01-01", "page", "/", 3] },
		]);
		expect(await db.all("SELECT pageviews FROM ca_rollup")).toEqual([{ pageviews: 5 }]);
		const res = await db.run("UPDATE ca_rollup SET hits = ? WHERE site = ?", [7, "s"]);
		expect(res.changes).toBe(1);
		await db.run("INSERT INTO ca_events (site, id, day, ts, name, props, path) VALUES (?, ?, ?, ?, ?, ?, ?)", ["s", "h1", 20260101, 1, "ev", JSON.stringify({ plan: "pro" }), "/50%_off"]);
		expect(await db.all(`SELECT ${jsonExtract("sqlite", "props", "plan")} AS v FROM ca_events`)).toEqual([{ v: "pro" }]);
		expect(await db.all(`SELECT id FROM ca_events WHERE path LIKE ? ${LIKE_ESCAPE}`, [`%${likeEscape("50%_")}%`])).toEqual([{ id: "h1" }]);
		expect(await db.all(`SELECT id FROM ca_events WHERE path LIKE ? ${LIKE_ESCAPE}`, [`%${likeEscape("50%x")}%`])).toEqual([]);
		await kysely.destroy();
	});

	it("reports a failing self-check instead of throwing", async () => {
		const failing = { dialect: "sqlite" as const, run: async () => ({ changes: 0 }), all: async () => Promise.reject(new Error("no db")), batch: async () => {} };
		expect(await selfCheck(failing)).toEqual({ ok: false, error: "no db" });
	});
});

describe("sql helpers", () => {
	it("counts placeholders outside quotes and enforces the D1 limit", () => {
		expect(countParams("SELECT ? , '?' , ?")).toBe(2);
		expect(() => assertParams("SELECT ?", [])).toThrow(/1 placeholders/);
		const many = Array.from({ length: 101 }, () => "?").join(",");
		expect(() => assertParams(many, Array(101).fill(1))).toThrow(/limit 100/);
	});

	it("chunks IN lists at 90 parameters", () => {
		const values = Array.from({ length: 250 }, (_, i) => `v${i}`);
		const parts = inChunks("path", values);
		expect(parts).toHaveLength(3);
		expect(parts.map((p) => p.params?.length)).toEqual([90, 90, 70]);
		expect(parts[0]?.sql.startsWith("path IN (?, ?")).toBe(true);
		expect(inChunks("path", values, 20).map((p) => p.params?.length)).toEqual([80, 80, 80, 10]);
		expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
	});

	it("rejects unsafe identifiers and JSON keys", () => {
		expect(ident("ca_hits.path")).toBe("ca_hits.path");
		expect(() => ident("path; DROP TABLE x")).toThrow();
		expect(() => jsonExtract("sqlite", "props", "a'b")).toThrow();
		expect(jsonExtract("postgres", "props", "plan")).toBe("(props::jsonb ->> 'plan')");
	});

	it("rewrites placeholders for Postgres outside string literals", () => {
		expect(toPostgresPlaceholders("SELECT * FROM t WHERE a = ? AND b = '?' AND c IN (?, ?)")).toBe("SELECT * FROM t WHERE a = $1 AND b = '?' AND c IN ($2, $3)");
	});
});
