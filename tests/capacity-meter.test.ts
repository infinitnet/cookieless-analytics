/**
 * The rows meter against rows written as measured on production D1: each statement shape of the layout must
 * cost what production billed. With `miniflare` importable, the same statements also
 * run on a local D1 and must agree with the meter.
 */
import { describe, expect, it } from "vitest";
import { docInsert, docJson, docMerge, docObject, docSet, docGet, int, paramRows, field, q, upsertChanged, deleteDaySlice, SID_SLICES } from "../src/db/dialect.js";
import { MIGRATIONS, migrationSql } from "../src/db/schema.js";
import type { Stmt } from "../src/db/sql.js";
import { runStatements } from "./capacity.helpers.js";
import { d1Meter, type Meter, meteredDb } from "./helpers.js";

interface Step extends Stmt {
	label: string;
	/** rows_written measured on production D1. */
	written: number;
}

const st = (label: string, written: number, sql: string, params: Stmt["params"] = []): Step => ({ label, written, sql, params });
const many = (n: number, select: string) => `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${n}) ${select}`;

const s = q("sqlite");
const DAYS = ["2026-06-10", "2026-06-09"];
const visitWhere = (sid: string) => s`WHERE site = ${"s"} AND day IN (${DAYS[0] as string}, ${DAYS[1] as string}) AND sid = ${sid}`;
const s1 = (sid: string, h: string, ts: number, path: string): Stmt => {
	const merge = docMerge("sqlite", "hits", h, { t: ts - 100, p: path });
	const absent = docGet("sqlite", "hits", h, "t");
	const w = visitWhere(sid);
	return s`UPDATE ca_sessions SET hits = ${merge}, pageviews = pageviews + (${absent} IS NULL), last_seen = MAX(last_seen, ${ts}), exit_path = ${path} ${w} RETURNING sid`;
};
const s2 = (sid: string, h: string, d: number): Stmt => s`UPDATE ca_sessions SET engaged_ms = engaged_ms + ${d}, hits = ${docSet("sqlite", "hits", h, { d })} ${visitWhere(sid)}`;
const s3 = (sid: string, e: string): Stmt =>
	s`UPDATE ca_sessions SET hits = ${docInsert("sqlite", "hits", e, docObject("sqlite", { t: 70, n: "signup", pr: docJson("sqlite", { plan: "pro" }) }))}, events = events + 1 ${visitWhere(sid)}`;
const drops = (rows: Array<{ reason: string; n: number }>): Stmt => {
	const p = paramRows("sqlite", rows, "x");
	return { sql: `INSERT INTO ca_drops (site, day, reason, n) SELECT 's', 20260610, ${field("sqlite", "x", "reason")}, ${field("sqlite", "x", "n")} FROM ${p.sql} WHERE 1 ${upsertChanged("sqlite", "ca_drops", ["site", "day", "reason"], [], ["n"])}`, params: p.params };
};
const srv = (n: number, ts: number): Stmt =>
	s`INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES (${"s"}, ${20260610}, ${404}, ${"/missing"}, ${""}, ${n}, ${ts}) ${{ sql: upsertChanged("sqlite", "ca_srv", ["site", "day", "status", "path", "ref"], ["last_ts"], ["n"]), params: [] }}`;
const visitInsert = (sid: string): Stmt =>
	s`INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, hits) VALUES (${"s"}, ${DAYS[0] as string}, ${sid}, ${"k"}, ${9}, ${100}, ${100}, ${1800}, ${docJson("sqlite", { h0: { t: 0, p: "/" } })}) ON CONFLICT DO NOTHING`;

/** Visit document layout, statements built with the dialect helpers. */
const DOCUMENT: Step[] = [
	st("visit insert with its first page view", 2, visitInsert("a1").sql, visitInsert("a1").params),
	st("visit insert conflict", 0, visitInsert("a1").sql, visitInsert("a1").params),
	{ label: "S1 page view on a known visit", written: 1, ...s1("a1", "h1", 160, "/b") },
	{ label: "S1 replay", written: 1, ...s1("a1", "h1", 160, "/b") },
	{ label: "S1 unknown sid", written: 0, ...s1("zz", "h1", 160, "/b") },
	{ label: "S2 engagement", written: 1, ...s2("a1", "h1", 3000) },
	{ label: "S2 replay", written: 1, ...s2("a1", "h1", 3000) },
	{ label: "S2 orphan", written: 0, ...s2("zz", "h1", 3000) },
	{ label: "S3 event", written: 1, ...s3("a1", "e1") },
	st("ca_events revenue insert", 2, "INSERT INTO ca_events (site, id, day, ts, name, val, cur) VALUES ('s', 'o.1', 20260610, 170, 'purchase', 30, 'EUR') ON CONFLICT DO NOTHING"),
	st("ca_events duplicate order", 0, "INSERT INTO ca_events (site, id, day, ts, name, val, cur) VALUES ('s', 'o.1', 20260610, 170, 'purchase', 30, 'EUR') ON CONFLICT DO NOTHING"),
	st("S5 alias upsert, new", 1, "INSERT INTO ca_aliases (site, sid, canon, expires) VALUES ('s', 'b1', 'a1', 2000) ON CONFLICT (site, sid) DO UPDATE SET canon = excluded.canon, expires = excluded.expires"),
	st("S5 alias upsert, update", 1, "INSERT INTO ca_aliases (site, sid, canon, expires) VALUES ('s', 'b1', 'a1', 2100) ON CONFLICT (site, sid) DO UPDATE SET canon = excluded.canon, expires = excluded.expires"),
	{ label: "S6 error page, new", written: 1, ...srv(1, 180) },
	{ label: "S6 error page, increment", written: 1, ...srv(1, 190) },
	{ label: "ca_srv no-op upsert", written: 0, ...srv(0, 190) },
	{ label: "drops flush, 3 reasons, new", written: 3, ...drops([{ reason: "bot", n: 4 }, { reason: "invalid", n: 1 }, { reason: "sid_rate", n: 2 }]) },
	{ label: "drops flush, 3 reasons, increment", written: 3, ...drops([{ reason: "bot", n: 1 }, { reason: "invalid", n: 1 }, { reason: "sid_rate", n: 1 }]) },
	{ label: "second visit", written: 2, ...visitInsert("b2") },
	...SID_SLICES.map((slice) => ({ label: `day delete by key range ${slice[0] ?? ""}`, written: slice[0] === "a" || slice[0] === "b" ? 1 : 0, ...deleteDaySlice("sqlite", "ca_sessions", "s", DAYS[0] as string, slice) })),
	st("create a 500 row table", 2, "CREATE TABLE t500 (k TEXT PRIMARY KEY, v INTEGER) WITHOUT ROWID"),
	st("fill it", 500, many(500, "INSERT INTO t500 (k, v) SELECT 'k' || i, i FROM n")),
	st("DROP TABLE holding 500 rows", 0, "DROP TABLE t500"),
];

/** The document layout of the schema. */
const documentLayout = () => migrationSql(MIGRATIONS[0]!, "sqlite");

async function measure(meter: Meter, layout: readonly string[], steps: readonly Step[]) {
	for (const sql of layout) await meter.db.run(sql);
	meter.reset();
	const log = await runStatements(meter, steps);
	return steps.map((x, i) => ({ label: x.label, measured: x.written, metered: log[i]?.written }));
}

describe("rows meter on better-sqlite3 against production D1", () => {
	it("visit document layout: every statement costs what production billed", async () => {
		const rows = await measure(meteredDb(), documentLayout(), DOCUMENT);
		for (const r of rows) expect(r.metered, r.label).toBe(r.measured);
	});

	it("a new visit costs 2 rows: the table and its one index (vkey)", async () => {
		const m = meteredDb();
		for (const sql of documentLayout()) await m.db.run(sql);
		m.reset();
		const [entry] = await runStatements(m, [visitInsert("a1")]);
		expect(entry?.written).toBe(2);
	});

	it("counts statements and a lower bound of rows read", async () => {
		const m = meteredDb();
		for (const sql of documentLayout()) await m.db.run(sql);
		m.reset();
		await runStatements(m, [visitInsert("a1"), s1("a1", "h1", 160, "/b"), s1("zz", "h1", 160, "/b")]);
		await m.db.all("SELECT sid FROM ca_sessions WHERE site = 's'");
		expect(m.stats).toEqual({ statements: 4, rowsWritten: 3, rowsRead: 3 });
		expect(int("sqlite", 1).sql).toBe("CAST(? AS INTEGER)");
	});
});

const d1 = await d1Meter();
if (!d1) console.info("[capacity] the miniflare package is not importable: the real D1 meter tests are skipped");

describe.skipIf(!d1)("rows meter on a local D1 (Miniflare)", () => {
	it("agrees with production on the layout", async () => {
		const meter = d1 as NonNullable<typeof d1>;
		const rows = await measure(meter, documentLayout(), DOCUMENT);
		for (const r of rows) expect(r.metered, r.label).toBe(r.measured);
		await meter.dispose();
	});
});
