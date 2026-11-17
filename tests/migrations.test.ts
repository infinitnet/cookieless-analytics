import { describe, expect, it } from "vitest";
import { ensureSchema, MIGRATIONS, type Migration, SCHEMA_VERSION_KEY } from "../src/db/schema.js";
import { MemoryKv, memoryDb } from "./helpers.js";

/** Test-only V2 in the shape later migrations may take: a new table, plus a column on a scratch table. */
const V2: Migration = {
	version: 2,
	statements: [
		"CREATE TABLE IF NOT EXISTS ca_scratch (site TEXT NOT NULL, k TEXT NOT NULL, PRIMARY KEY (site, k))",
		"ALTER TABLE ca_scratch ADD COLUMN v {INT}",
		"CREATE TABLE IF NOT EXISTS ca_scratch_day (site TEXT NOT NULL, day TEXT NOT NULL, n {INT} NOT NULL DEFAULT 0, PRIMARY KEY (site, day))",
	],
};

describe("forward-only migrations", () => {
	it("applies V2 over a populated V1 database without losing data", async () => {
		const { db, raw, kysely } = memoryDb();
		const kv = new MemoryKv();
		expect(await ensureSchema(db, kv)).toBe(1);
		raw.prepare("INSERT INTO ca_sessions (site, sid, vkey, day, hour, started, last_seen, window_s, host, visible_ms, reentries) VALUES ('s', 'a', 'k', '2026-01-01', 0, 1, 2, 1800, 'example.org', 4200, 1)").run();
		raw.prepare("INSERT INTO ca_events (site, id, day, ts, sday, sid, name, path, val, cur) VALUES ('s', 'o.1', 20260101, 1, '2026-01-01', 'a', 'purchase', '/', 9.5, 'EUR')").run();
		raw.prepare("INSERT INTO ca_search_daily (site, source, day, page_key, query, country, device, clicks, impressions, pos_sum) VALUES ('s', 'google', '2026-01-01', '', '', '', '', 3, 10, 42)").run();
		raw.prepare("INSERT INTO ca_revenue_daily (site, day, dim, key, cur, orders, revenue, sessions) VALUES ('s', '2026-01-01', 'all', '', 'EUR', 2, 99.8, 1)").run();

		expect(await ensureSchema(db, kv, [...MIGRATIONS, V2])).toBe(2);
		expect(await kv.get(SCHEMA_VERSION_KEY)).toBe(2);
		expect(raw.prepare("SELECT host, visible_ms, reentries FROM ca_sessions").get()).toEqual({ host: "example.org", visible_ms: 4200, reentries: 1 });
		expect(raw.prepare("SELECT path, sid, val, cur FROM ca_events").get()).toEqual({ path: "/", sid: "a", val: 9.5, cur: "EUR" });
		expect(raw.prepare("SELECT clicks, impressions, pos_sum FROM ca_search_daily").get()).toEqual({ clicks: 3, impressions: 10, pos_sum: 42 });
		expect(raw.prepare("SELECT cur, orders, revenue, sessions FROM ca_revenue_daily").get()).toEqual({ cur: "EUR", orders: 2, revenue: 99.8, sessions: 1 });
		raw.prepare("INSERT INTO ca_scratch (site, k, v) VALUES ('s', 'x', 1)").run();
		raw.prepare("INSERT INTO ca_scratch_day (site, day) VALUES ('s', '2026-01-01')").run();

		// Already at V2: nothing re-runs (the ALTER would fail if it did).
		expect(await ensureSchema(db, kv, [...MIGRATIONS, V2])).toBe(2);
		await kysely.destroy();
	});

	it("never moves the version backwards", async () => {
		const { db, kysely } = memoryDb();
		const kv = new MemoryKv();
		await kv.set(SCHEMA_VERSION_KEY, 3);
		expect(await ensureSchema(db, kv)).toBe(3);
		expect(await kv.get(SCHEMA_VERSION_KEY)).toBe(3);
		await kysely.destroy();
	});
});
