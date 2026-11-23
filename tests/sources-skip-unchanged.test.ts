/** Search rows: a pulled day equal to its stored rows is not written again (`changedDays`), on SQLite and on Postgres. */
import { afterAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db/adapter.js";
import { ensureSchema, ownDatabase } from "../src/db/schema.js";
import { ROWS_PER_DELETE, ROWS_PER_INSERT } from "../src/sources/budget.js";
import { changedDays, INSERT_JSON_CHARS, replaceDays } from "../src/sources/store.js";
import type { SearchRow } from "../src/sources/types.js";
import { MemoryKv, meteredDb, schemaDb } from "./helpers.js";
import { dropPgDriver, kyselyPg, pglite, resetPg } from "./pg.helpers.js";

const OPTIONS_TABLE = "CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT)";
const mk = (page_key: string, query: string, clicks: number, impressions: number, pos_sum: number, country = "", device = ""): SearchRow => ({ page_key, query, country, device, clicks, impressions, pos_sum });
const DAY = "2026-03-10";
const BASE = (): SearchRow[] => [mk("/a", "", 3, 30, 90), mk("/b", "", 1, 10, 20.5), mk("", "alpha", 2, 20, 41.25), mk("", "", 4, 40, 110), mk("", "", 1, 9, 18, "DEU"), mk("", "", 2, 9, 12, "", "MOBILE")];

async function store(db: Db, day: string, rows: SearchRow[], provisional = false) {
	await replaceDays(db, "default", "google", new Map([[day, rows]]), () => provisional);
}
const changed = async (db: Db, days: Array<[string, SearchRow[]]>, provisional = false) => (await changedDays(db, "default", "google", new Map(days), () => provisional)).changed;

/** The same checks on any engine. */
function suite(open: () => Promise<Db>) {
	it("an equal pull changes nothing and reports the stored rows per day", async () => {
		const db = await open();
		await store(db, DAY, BASE());
		const r = await changedDays(db, "default", "google", new Map([[DAY, BASE()]]), () => false);
		expect([...r.changed.keys()]).toEqual([]);
		expect(r.had.get(DAY)).toBe(6);
	});

	it("a changed metric, a moved key with equal totals, a vanished row, an extra row and an emptied day each change the day", async () => {
		const db = await open();
		await store(db, DAY, BASE());
		const edit = (f: (rows: SearchRow[]) => SearchRow[]) => f(BASE());
		const cases: Record<string, SearchRow[]> = {
			metric: edit((r) => (r.splice(0, 1, mk("/a", "", 4, 30, 90)), r)),
			moved: edit((r) => (r.splice(0, 1, mk("/c", "", 3, 30, 90)), r)),
			vanished: edit((r) => r.slice(1)),
			extra: edit((r) => [...r, mk("/d", "", 0, 1, 7)]),
			emptied: [],
			position: edit((r) => (r.splice(1, 1, mk("/b", "", 1, 10, 21)), r)),
		};
		for (const [name, rows] of Object.entries(cases)) expect([...(await changed(db, [[DAY, rows]])).keys(), name], name).toEqual([DAY, name]);
	});

	it("a day pulled empty with nothing stored is unchanged, and a new day is changed", async () => {
		const db = await open();
		expect([...(await changed(db, [[DAY, []]])).keys()]).toEqual([]);
		expect([...(await changed(db, [[DAY, BASE()]])).keys()]).toEqual([DAY]);
	});

	it("a whole number of positions equals the stored decimal, and the provisional flag counts", async () => {
		const db = await open();
		await store(db, DAY, [mk("/a", "", 3, 30, 90), mk("/b", "", 1, 10, 20.5)], true);
		const same = [mk("/a", "", 3, 30, 90.0), mk("/b", "", 1, 10, 20.5)];
		expect([...(await changed(db, [[DAY, same]], true)).keys()]).toEqual([]);
		expect([...(await changed(db, [[DAY, same]], false)).keys()]).toEqual([DAY]);
	});

	it("only the differing days of a window change, and rows of the same key from two pulled rows are summed first", async () => {
		const db = await open();
		for (const d of ["2026-03-08", "2026-03-09", DAY]) await store(db, d, BASE());
		const split = [mk("/a", "", 1, 10, 30), mk("/a", "", 2, 20, 60), ...BASE().slice(1)];
		const r = await changed(db, [
			["2026-03-08", BASE()],
			["2026-03-09", BASE().map((x, i) => (i === 3 ? { ...x, clicks: 5 } : x))],
			[DAY, split],
		]);
		expect([...r.keys()]).toEqual(["2026-03-09"]);
	});
}

describe("changedDays on SQLite", () => {
	suite(async () => (await schemaDb()).db);

	it("compares a window in groups under the JSON limit, one read each, and counts a single oversized day as changed", async () => {
		const db = (await schemaDb()).db;
		const big = (n: number) => Array.from({ length: n }, (_, i) => mk(`/page-${i}-${"x".repeat(40)}`, "", i % 5, 10 + i, 3 * (10 + i)));
		const days = new Map<string, SearchRow[]>([
			["2026-03-01", big(2600)],
			["2026-03-02", big(2600)],
			["2026-03-03", big(8000)],
			["2026-03-04", big(5)],
		]);
		await replaceDays(db, "default", "google", days, () => false);
		let reads = 0;
		const r = await changedDays(db, "default", "google", days, () => false, () => void reads++);
		expect(JSON.stringify(big(2600)).length * 2).toBeGreaterThan(INSERT_JSON_CHARS);
		expect(reads).toBeGreaterThanOrEqual(3);
		expect([...r.changed.keys()]).toEqual(["2026-03-03"]);
		expect(r.had.get("2026-03-03")).toBe(8000);
		expect(r.had.get("2026-03-01")).toBe(2600);
	}, 60_000);
});

describe("changedDays on Postgres", () => {
	const PG = pglite();
	afterAll(dropPgDriver);
	suite(async () => {
		await PG.waitReady;
		await resetPg(PG);
		await PG.exec(OPTIONS_TABLE);
		const { db } = kyselyPg(PG);
		await ensureSchema(ownDatabase(db), new MemoryKv());
		return db;
	});
});

describe("reads of a comparison", () => {
	it("a window with nothing stored costs one read, however many days and rows", async () => {
		const m = meteredDb(await schemaDb());
		const days = new Map(Array.from({ length: 32 }, (_, i) => [`2026-02-${String(i + 1).padStart(2, "0")}`, BASE()] as [string, SearchRow[]]));
		m.reset();
		const r = await changedDays(m.db, "default", "google", days, () => false);
		expect(m.stats.statements).toBe(1);
		expect(r.changed.size).toBe(32);
		expect([...r.changed.keys()]).toEqual([...days.keys()].sort());
	});

	it("days with stored rows add one read per 400,000 characters, and an empty pulled day with nothing stored is not changed", async () => {
		const m = meteredDb(await schemaDb());
		await replaceDays(m.db, "default", "google", new Map([[DAY, BASE()]]), () => false);
		m.reset();
		const r = await changedDays(m.db, "default", "google", new Map<string, SearchRow[]>([[DAY, BASE()], ["2026-03-11", []]]), () => false);
		expect(m.stats.statements).toBe(2);
		expect(r.changed.size).toBe(0);
	});
});

describe("the rows a re-pull writes", () => {
	it("a re-pull of unchanged days writes nothing; a changed day costs its rows deleted plus inserted", async () => {
		const m = meteredDb(await schemaDb());
		const rows = BASE();
		await replaceDays(m.db, "default", "google", new Map([[DAY, rows]]), () => false);
		m.reset();
		const days = new Map([[DAY, rows]]);
		const { changed: c } = await changedDays(m.db, "default", "google", days, () => false);
		expect(c.size).toBe(0);
		expect(m.stats.rowsWritten).toBe(0);
		const edited = new Map([[DAY, rows.map((r, i) => (i === 0 ? { ...r, clicks: 9 } : r))]]);
		const { changed: c2 } = await changedDays(m.db, "default", "google", edited, () => false);
		m.reset();
		await replaceDays(m.db, "default", "google", c2, () => false);
		expect(m.stats.rowsWritten).toBe(rows.length * (ROWS_PER_DELETE + ROWS_PER_INSERT));
	});
});
