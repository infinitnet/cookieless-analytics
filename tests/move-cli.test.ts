/** The ca-data CLI (scripts/ca-data.mjs) against the data/dump and data/load agent routes through a fake fetch. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { dayInZone, zonedToEpoch } from "../src/core/time.js";
import { ensureSchema, ownDatabase, SCHEMA_VERSION, TABLES } from "../src/db/schema.js";
import type { Db } from "../src/db/adapter.js";
import { dayTotals } from "../src/move/chunks.js";
import { COPY_DAY_ROWS, KV_COPY_ROWS, nextUtcMidnight } from "../src/move/day-budget.js";
import { KV_MOVE_JOB } from "../src/move/job.js";
import { KV_DELETE_JOB } from "../src/query/filtered-delete.js";
import { KV_WRITE_BUDGET } from "../src/query/storage.js";
import { runRollup } from "../src/query/rollup.js";
import { DATA_ROWS, MAX_CHUNK_BYTES } from "../src/routes/move-files.js";
import type { Scope } from "../src/keys/scopes.js";
import { normalizeSettings } from "../src/settings.js";
import { replaceDays } from "../src/sources/store.js";
import { agentHarness } from "./agent.helpers.js";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { MemoryKv, memoryDb, type schemaDb } from "./helpers.js";

interface Manifest {
	layout: number;
	engine: string;
	site: string | null;
	createdAt: string;
	files: Record<string, { file: string; rows: number; sha256: string }>;
}
interface ImportResult {
	tables: Record<string, { rows: number; inserted: number; total: number }>;
	inserted: number;
	short: string[];
}
interface Cli {
	TABLES: string[];
	exportData(o: Record<string, unknown>): Promise<Manifest>;
	importData(o: Record<string, unknown>): Promise<ImportResult>;
	args(cmd: string, argv: string[]): Record<string, string>;
	keyOf(a: Record<string, string>, env: Record<string, string | undefined>): string | undefined;
}
const CLI_PATH = "../scripts/ca-data.mjs";
const cli: Cli = await import(CLI_PATH);

const START = zonedToEpoch("2026-06-01", 0, "UTC");
const NOW = zonedToEpoch("2026-06-09", 3, "UTC");
const S = normalizeSettings({ agentRateLimitPerMinute: 1200 });
const URL_ = "https://example.com";
type Env = Awaited<ReturnType<typeof schemaDb>>;

/** A source with rows in all nine tables, text with quotes and umlauts, two sites. */
async function seeded(): Promise<Env> {
	const m = memoryDb();
	const kv = new MemoryKv();
	await ensureSchema(m.db, kv);
	await recordTraffic(m.db, generateTraffic({ pageviews: 300, seed: 7, rich: true, start: START, spanSeconds: 6 * 86_400 - 1 }));
	await recordAgentEvents({ db: m.db, kv, settings: S, now: START + 5 * 86_400 }, "default", [{ name: "purchase", val: 0.1 + 0.2, cur: "EUR", oid: "o-1", ts: START + 4 * 86_400, p: { "ünï": "çödé \"q\" 😀" } }]);
	const rc = { db: m.db, settings: S, goals: async () => [] };
	let t = await runRollup(rc, kv, NOW);
	for (let i = 0; i < 80 && !t.done; i++) t = await runRollup(rc, kv, NOW);
	await replaceDays(m.db, "default", "google", new Map([["2026-06-02", [{ page_key: "/blog/a", query: "gärten 'tips' \"x\"", country: "de", device: "MOBILE", clicks: 3, impressions: 100, pos_sum: 420.5 }]]]), () => false);
	await m.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260605, 404, '/x', '', 3, 1)");
	await m.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', 20260605, 'invalid', 2), ('shop', 20260605, 'invalid', 7)");
	return { ...m, kv, count: (table: string) => (m.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n } as unknown as Env;
}

/** An empty own database without tables (another account's, say): data/load creates them. */
function empty(): Env {
	const m = memoryDb();
	ownDatabase(m.db);
	return { ...m, kv: new MemoryKv(), count: (table: string) => (m.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n } as unknown as Env;
}

/** A site: the agent routes over `env`, a key with `scopes`, and a fetch that reaches them, counting the calls. */
async function site(env: Env, scopes: Scope[], sites?: string[], settings = S, over: Parameters<typeof agentHarness>[2] = {}) {
	const h = await agentHarness(env, settings, over);
	h.storage.sites.items.set("shop", { id: "shop", label: "Shop", key: "s".repeat(20), hosts: ["shop.example.com"], gscProperty: "", bingSiteUrl: "", paused: false, created: 0 });
	const key = await h.key(scopes, undefined, sites);
	const calls: Array<{ name: string; body: { table: string; rows?: unknown[] } }> = [];
	let failAt = -1;
	/** Answers 503 to a call whose rows (load) or limit (dump, absent: the default) exceed this. */
	let maxRows = Number.POSITIVE_INFINITY;
	const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
		const name = new URL(url).pathname.split("/plugins/cookieless-analytics/")[1] ?? "";
		const body = JSON.parse(init.body);
		calls.push({ name, body });
		if (body.rows?.length && --failAt === 0) return new Response(JSON.stringify({ ok: false, error: "boom", message: "failed once" }), { status: 400 });
		if ((body.rows?.length ?? (name.endsWith("dump") ? (body.limit ?? 500) : 0)) > maxRows) return new Response("worker exceeded its CPU limit", { status: 503 });
		const r = await h.call(name, { method: "POST", token: init.headers["x-api-key"] ?? null, input: body });
		return new Response(r.text, { status: r.status, headers: r.headers });
	};
	return { h, key, calls, fetch, failNthLoad: (n: number) => void (failAt = n), failAbove: (n: number) => void (maxRows = n) };
}

const totals = async (db: Db) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await dayTotals(db, t)])));
const dirs: string[] = [];
const tmp = () => {
	const d = mkdtempSync(join(tmpdir(), "ca-data-"));
	dirs.push(d);
	return d;
};
const quiet = { sleep: async () => {}, log: () => {} };

describe("ca-data export and import", () => {
	let src: Env;
	let out: string;
	let manifest: Manifest;
	const logs: string[] = [];
	let exportKey = "";

	beforeAll(async () => {
		src = await seeded();
		const s = await site(src, ["data:export"]);
		exportKey = s.key;
		out = tmp();
		manifest = await cli.exportData({ url: URL_, key: s.key, out, fetch: s.fetch, rows: 37, sleep: async () => {}, log: (l: string) => logs.push(l) });
	});
	afterAll(() => {
		for (const d of dirs) rmSync(d, { recursive: true, force: true });
	});

	it("names the plugin's nine tables", () => {
		expect([...cli.TABLES].sort()).toEqual([...TABLES].sort());
	});

	it("writes one gzip file per table and a manifest with layout, engine, counts and sha256, no key", () => {
		expect(manifest).toMatchObject({ layout: SCHEMA_VERSION, engine: "sqlite", site: null });
		expect(Date.parse(manifest.createdAt)).toBeGreaterThan(0);
		for (const t of TABLES) {
			expect(manifest.files[t]?.rows, t).toBe(src.count(t));
			expect(manifest.files[t]?.sha256).toMatch(/^[0-9a-f]{64}$/);
		}
		expect(Object.values(manifest.files).every((f) => f.rows > 0)).toBe(true);
		const text = readFileSync(join(out, "manifest.json"), "utf8") + logs.join("\n");
		expect(text).not.toContain(exportKey);
		expect(text).not.toContain(exportKey.split(".")[1]);
	});

	it("imports into an empty database, then a second import inserts 0 rows", async () => {
		const dst = empty();
		const s = await site(dst, ["data:import"]);
		const first = await cli.importData({ url: URL_, key: s.key, in: out, fetch: s.fetch, ...quiet });
		expect(first.short).toEqual([]);
		expect(first.inserted).toBe(Object.values(manifest.files).reduce((n, f) => n + f.rows, 0));
		for (const t of TABLES) expect(first.tables[t]).toEqual({ rows: manifest.files[t]?.rows, inserted: manifest.files[t]?.rows, total: manifest.files[t]?.rows });
		expect(await totals(dst.db)).toEqual(await totals(src.db));
		expect(existsSync(join(out, "progress.json"))).toBe(false);
		const second = await cli.importData({ url: URL_, key: s.key, in: out, fetch: s.fetch, ...quiet });
		expect(second.inserted).toBe(0);
		expect(second.short).toEqual([]);
		expect(await totals(dst.db)).toEqual(await totals(src.db));
	});

	it("keeps the destination's counter values on an import into a database that already has them", async () => {
		const dst = empty();
		const s = await site(dst, ["data:import"]);
		await ensureSchema(dst.db, dst.kv);
		await dst.db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES ('shop', 20260605, 'invalid', 1)");
		await cli.importData({ url: URL_, key: s.key, in: out, fetch: s.fetch, ...quiet });
		expect(await dst.db.all("SELECT n FROM ca_drops WHERE site = 'shop'")).toEqual([{ n: 1 }]);
	});

	it("refuses a corrupted file before posting anything", async () => {
		const copy = tmp();
		for (const f of ["manifest.json", ...Object.values(manifest.files).map((x) => x.file)]) writeFileSync(join(copy, f), readFileSync(join(out, f)));
		const gz = join(copy, "ca_sessions.ndjson.gz");
		const bytes = readFileSync(gz);
		bytes.writeUInt8((bytes[bytes.length >> 1] ?? 0) ^ 0xff, bytes.length >> 1);
		writeFileSync(gz, bytes);
		const dst = empty();
		const s = await site(dst, ["data:import"]);
		await expect(cli.importData({ url: URL_, key: s.key, in: copy, fetch: s.fetch, ...quiet })).rejects.toThrow(/ca_sessions\.ndjson\.gz does not match the sha256.*Nothing was imported/);
		expect(s.calls).toEqual([]);
	});

	it("refuses another layout before writing a row", async () => {
		const copy = tmp();
		for (const f of Object.values(manifest.files)) writeFileSync(join(copy, f.file), readFileSync(join(out, f.file)));
		writeFileSync(join(copy, "manifest.json"), JSON.stringify({ ...manifest, layout: SCHEMA_VERSION + 1 }));
		const dst = empty();
		const s = await site(dst, ["data:import"]);
		await expect(cli.importData({ url: URL_, key: s.key, in: copy, fetch: s.fetch, ...quiet })).rejects.toThrow(/400 layout_mismatch/);
		expect(s.calls.filter((c) => c.body.rows?.length)).toEqual([]);
	});

	it("resumes a broken run at the failed chunk", async () => {
		const copy = tmp();
		for (const f of ["manifest.json", ...Object.values(manifest.files).map((x) => x.file)]) writeFileSync(join(copy, f), readFileSync(join(out, f)));
		const dst = empty();
		const s = await site(dst, ["data:import"]);
		s.failNthLoad(5);
		await expect(cli.importData({ url: URL_, key: s.key, in: copy, fetch: s.fetch, rows: 40, ...quiet })).rejects.toThrow(/400 boom/);
		const progress = JSON.parse(readFileSync(join(copy, "progress.json"), "utf8")) as { done: Record<string, number> };
		const posted = s.calls.filter((c) => c.body.rows?.length);
		expect(posted).toHaveLength(5);
		const failed = posted[4] as { body: { table: string; rows: unknown[] } };
		// progress.json counts rows: those of the four chunks that passed.
		const before = Object.values(progress.done).reduce((n, d) => n + d, 0);
		expect(before).toBe(posted.slice(0, 4).reduce((n, c) => n + (c.body.rows?.length ?? 0), 0));
		s.calls.length = 0;
		const r = await cli.importData({ url: URL_, key: s.key, in: copy, fetch: s.fetch, rows: 40, ...quiet });
		const again = s.calls.filter((c) => c.body.rows?.length);
		// The first chunk of the second run is the one that failed.
		expect(again[0]?.body).toEqual(failed.body);
		expect(r.inserted).toBe(Object.values(manifest.files).reduce((n, f) => n + f.rows, 0));
		expect(r.short).toEqual([]);
		expect(await totals(dst.db)).toEqual(await totals(src.db));
	});

	it("needs data:export to export and data:import to import", async () => {
		const wrong = await site(src, ["data:import", "read:analytics"]);
		await expect(cli.exportData({ url: URL_, key: wrong.key, out: tmp(), fetch: wrong.fetch, ...quiet })).rejects.toThrow(/404.*data:export/);
		const dst = empty();
		const s = await site(dst, ["data:export", "write:events"]);
		await expect(cli.importData({ url: URL_, key: s.key, in: out, fetch: s.fetch, ...quiet })).rejects.toThrow(/404.*data:import/);
		expect(dst.count.bind(null, "ca_sessions")).toThrow();
	});
});

describe("ca-data options", () => {
	it("reads --name value and --name=value, refuses unknown options, never echoes a value", () => {
		expect(cli.args("export", ["--url", URL_, "--key=ab12cd34.SECRET", "--out", "x"])).toEqual({ url: URL_, key: "ab12cd34.SECRET", out: "x" });
		for (const argv of [["--key=ab12cd34.SECRET", "--sit", "shop"], ["--url", URL_, "ab12cd34.SECRET"], ["--key"], ["--in", "x"]]) {
			let msg = "";
			try {
				cli.args("export", argv);
			} catch (err) {
				msg = (err as Error).message;
			}
			expect(msg, argv.join(" ")).not.toBe("");
			expect(msg).not.toContain("SECRET");
		}
	});

	it("refuses plain http except to localhost", async () => {
		await expect(cli.exportData({ url: "http://example.com", key: "k", out: tmp(), fetch: async () => new Response("") })).rejects.toThrow(/https/);
		expect(() => cli.args("import", ["--url", "http://localhost:4321", "--key", "k", "--in", "x"])).not.toThrow();
	});
});

describe("data/dump and data/load routes", () => {
	it("a key restricted to a site exports that site only, and loads rows of that site only", async () => {
		const src = await seeded();
		const s = await site(src, ["data:export"], ["shop"]);
		const r = await s.h.call("agent/v1/data/dump", { token: s.key, input: { site: "shop", table: "ca_drops" } });
		expect(r.status).toBe(200);
		expect(r.text.trim().split("\n").map((l) => JSON.parse(l).site)).toEqual(["shop"]);
		expect(r.headers["x-total"]).toBe("1");
		expect((await s.h.call("agent/v1/data/dump", { token: s.key, input: { table: "ca_drops" } })).status).toBe(404);
		const dst = empty();
		const d = await site(dst, ["data:import"], ["shop"]);
		const row = { site: "default", day: 20260605, reason: "invalid", n: 1 };
		const bad = await d.h.call("agent/v1/data/load", { token: d.key, input: { site: "shop", layout: SCHEMA_VERSION, table: "ca_drops", rows: [row] } });
		expect(bad.json).toMatchObject({ error: "site_not_allowed" });
		const ok = await d.h.call("agent/v1/data/load", { token: d.key, input: { site: "shop", layout: SCHEMA_VERSION, table: "ca_drops", rows: [{ ...row, site: "shop" }] } });
		expect(ok.json.data).toEqual({ table: "ca_drops", inserted: 1 });
	});

	it("keeps a dump under 1.2 MB and continues at the next cursor", async () => {
		const src = await seeded();
		const big = "x".repeat(20_000);
		for (let i = 0; i < 100; i++) await src.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260601, 200, ?, ?, 1, 1)", [`/p${String(i).padStart(3, "0")}`, big]);
		const s = await site(src, ["data:export"]);
		const first = await s.h.call("agent/v1/data/dump", { token: s.key, input: { table: "ca_srv", limit: 1000 } });
		expect(new TextEncoder().encode(first.text).length).toBeLessThanOrEqual(MAX_CHUNK_BYTES);
		const n1 = first.text.trim().split("\n").length;
		expect(n1).toBeLessThan(101);
		const cursor = JSON.parse(decodeURIComponent(first.headers["x-next-cursor"] ?? ""));
		const rest = await s.h.call("agent/v1/data/dump", { token: s.key, input: { table: "ca_srv", limit: 1000, cursor } });
		expect(n1 + rest.text.trim().split("\n").length).toBe(src.count("ca_srv"));
	});

	it("refuses a row without its key columns", async () => {
		const d = await site(empty(), ["data:import"]);
		const r = await d.h.call("agent/v1/data/load", { token: d.key, input: { layout: SCHEMA_VERSION, table: "ca_drops", rows: [{ site: "default", day: 20260605 }] } });
		expect(r.json).toMatchObject({ error: "invalid_row" });
	});
});

const SMALL = normalizeSettings({ agentRateLimitPerMinute: 1200, capacityProfile: "small" });
const load = (s: Awaited<ReturnType<typeof site>>, input: Record<string, unknown>) => s.h.call("agent/v1/data/load", { token: s.key, input: { layout: SCHEMA_VERSION, ...input } });
const drop = (i: number, site = "default") => ({ site, day: 20260605, reason: `r${i}`, n: 1 });

describe("chunk size", () => {
	it("a dump without limit reads 50 rows on the small profile and 500 otherwise", async () => {
		const src = await seeded();
		for (let i = 0; i < 120; i++) await src.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260601, 200, ?, '', 1, 1)", [`/p${i}`]);
		const lines = (r: { text: string }) => r.text.trim().split("\n").length;
		const small = await site(src, ["data:export"], undefined, SMALL);
		const a = await small.h.call("agent/v1/data/dump", { token: small.key, input: { table: "ca_srv" } });
		expect(lines(a)).toBe(DATA_ROWS.small);
		expect(DATA_ROWS.small).toBe(50);
		expect(a.headers["x-next-cursor"]).toBeTruthy();
		const std = await site(src, ["data:export"]);
		const b = await std.h.call("agent/v1/data/dump", { token: std.key, input: { table: "ca_srv" } });
		expect(lines(b)).toBe(src.count("ca_srv"));
		expect(b.headers["x-next-cursor"]).toBeUndefined();
	});

	it("the CLI asks for fewer rows after an answer cut by bytes", async () => {
		const src = await seeded();
		const big = "x".repeat(20_000);
		for (let i = 0; i < 100; i++) await src.db.run("INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES ('default', 20260601, 200, ?, ?, 1, 1)", [`/p${String(i).padStart(3, "0")}`, big]);
		const s = await site(src, ["data:export"]);
		const m = await cli.exportData({ url: URL_, key: s.key, out: tmp(), fetch: s.fetch, rows: 1000, ...quiet });
		expect(m.files.ca_srv?.rows).toBe(src.count("ca_srv"));
		const srv = s.calls.filter((c) => c.body.table === "ca_srv") as Array<{ body: { limit?: number } }>;
		expect(srv[0]?.body.limit).toBe(1000);
		// 1.2 MB holds about 59 rows of 20 kB: the next call asks for no more than the first answer held.
		expect(srv[1]?.body.limit).toBeLessThanOrEqual(60);
		expect(srv[1]?.body.limit).toBeGreaterThan(40);
	});

	it("the CLI halves its chunk after a 5xx, on export and on import, and finishes", async () => {
		const src = await seeded();
		const e = await site(src, ["data:export"]);
		e.failAbove(20);
		const dir = tmp();
		const m = await cli.exportData({ url: URL_, key: e.key, out: dir, fetch: e.fetch, ...quiet });
		for (const t of TABLES) expect(m.files[t]?.rows, t).toBe(src.count(t));
		const dumps = e.calls.filter((c) => c.name.endsWith("dump")) as Array<{ body: { limit?: number } }>;
		// The first call (the site's default) fails, then 25, then 13 passes; 13 stays.
		expect(dumps.slice(0, 3).map((c) => c.body.limit)).toEqual([undefined, 25, 13]);
		const dst = empty();
		const s = await site(dst, ["data:import"]);
		s.failAbove(10);
		const r = await cli.importData({ url: URL_, key: s.key, in: dir, fetch: s.fetch, ...quiet });
		expect(r.short).toEqual([]);
		expect(await totals(dst.db)).toEqual(await totals(src.db));
		const loads = s.calls.filter((c) => c.body.rows?.length);
		// 500 halves to 250, 125, 63, 32, 16, 8: six refused posts, then never above 10 again.
		expect(loads.filter((c) => (c.body.rows?.length ?? 0) > 10)).toHaveLength(6);
	});

	it("--rows sets the rows per call and is checked", async () => {
		expect(cli.args("import", ["--url", URL_, "--in", "x", "--rows", "50"])).toEqual({ url: URL_, in: "x", rows: "50" });
		await expect(cli.exportData({ url: URL_, key: "k", out: tmp(), rows: 0, fetch: async () => new Response("") })).rejects.toThrow(/--rows/);
	});
});

describe("data/load checks", () => {
	it("a bad site id, text in an integer column, an unknown column, bad JSON in a document: 400 invalid_row, nothing written", async () => {
		const dst = empty();
		const s = await site(dst, ["data:import"]);
		await load(s, { table: "ca_drops", rows: [] });
		for (const [table, row] of [
			["ca_drops", { ...drop(1), site: "Not A Site!" }],
			["ca_drops", { ...drop(1), n: "lots" }],
			["ca_drops", { ...drop(1), day: 2.5 }],
			["ca_drops", { ...drop(1), extra: 1 }],
			["ca_drops", { ...drop(1), reason: 7 }],
			["ca_sessions", { site: "default", day: "2026-06-05", sid: "a", vkey: "k", hits: "{not json" }],
		] as const) {
			const r = await load(s, { table, rows: [row] });
			expect(r.status, JSON.stringify(row)).toBe(400);
			expect(r.json).toMatchObject({ error: "invalid_row" });
		}
		expect(dst.count("ca_drops") + dst.count("ca_sessions")).toBe(0);
	});

	it("a cursor of the wrong length or kind is a 400", async () => {
		const s = await site(await seeded(), ["data:export"]);
		for (const cursor of [["default"], ["default", "x", "invalid"], ["default", 20260605, "invalid", "extra"]]) {
			const r = await s.h.call("agent/v1/data/dump", { token: s.key, input: { table: "ca_drops", cursor } });
			expect(r.status, JSON.stringify(cursor)).toBe(400);
			expect(r.json).toMatchObject({ error: "invalid_input" });
		}
	});

	it("an empty call answers the layout and that one table's count only", async () => {
		const s = await site(empty(), ["data:import"]);
		await load(s, { table: "ca_drops", rows: [drop(1), drop(2)] });
		expect((await load(s, { table: "ca_drops", rows: [] })).json.data).toEqual({ layout: SCHEMA_VERSION, table: "ca_drops", total: 2 });
	});

	it("refuses while a delete job runs or a move into the same database runs", async () => {
		const dst = empty();
		// Site shop writes to the binding CA_SHOP, every other site to the default database.
		const s = await site(dst, ["data:import"], undefined, S, { route: { kv: (kv) => kv, binding: (x?: string) => (x === "shop" ? "CA_SHOP" : null) } });
		await dst.kv.set(KV_DELETE_JOB, { status: "running" });
		expect((await load(s, { table: "ca_drops", rows: [drop(1)] })).json).toMatchObject({ error: "delete_running" });
		await dst.kv.set(KV_DELETE_JOB, { status: "done" });
		await dst.kv.set(KV_MOVE_JOB, { status: "paused", dest: "CA_SHOP" });
		const shop = await load(s, { table: "ca_drops", rows: [drop(1, "shop")] });
		expect(shop.status).toBe(409);
		expect(shop.json).toMatchObject({ error: "move_running" });
		expect((await load(s, { table: "ca_drops", rows: [drop(1)] })).json.data).toEqual({ table: "ca_drops", inserted: 1 });
		await dst.kv.set(KV_MOVE_JOB, { status: "cancelled", dest: "CA_SHOP" });
		expect((await load(s, { table: "ca_drops", rows: [drop(1, "shop")] })).json.data).toEqual({ table: "ca_drops", inserted: 1 });
	});

	it("clears the report cache after a load", async () => {
		const src = await seeded();
		const e = await site(src, ["data:export"]);
		const dump = await e.h.call("agent/v1/data/dump", { token: e.key, input: { table: "ca_sessions", limit: 1000 } });
		const rows = dump.text.trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.site === "default");
		const dst = empty();
		const s = await site(dst, ["data:import", "read:analytics"]);
		s.h.setNow(NOW);
		await load(s, { table: "ca_sessions", rows: [] });
		const q = () => s.h.call("agent/v1/query", { token: s.key, input: { report: "overview", query: { from: "2026-06-01", to: "2026-06-06" } } });
		const before = await q();
		expect(before.status, before.text).toBe(200);
		for (let i = 0; i < rows.length; i += 500) await load(s, { table: "ca_sessions", rows: rows.slice(i, i + 500) });
		const after = await q();
		expect(after.json.data).not.toEqual(before.json.data);
	});
});

describe("data/load day budget on small with D1", () => {
	const today = dayInZone(NOW, "UTC");

	it("counts rows written per UTC day (two per event row) and adds them to the write budget", async () => {
		const src = await seeded();
		const e = await site(src, ["data:export"]);
		const events = (await e.h.call("agent/v1/data/dump", { token: e.key, input: { table: "ca_events", limit: 2 } })).text.trim().split("\n").map((l) => JSON.parse(l));
		const dst = empty();
		const s = await site(dst, ["data:import"], undefined, SMALL);
		s.h.setNow(NOW);
		await dst.kv.set(KV_WRITE_BUDGET, { day: today, at: NOW, visits: 0, pageviews: 0, events: 0, rows: 100, searchRows: 0, limit: 85_000, blocked: false });
		await load(s, { table: "ca_drops", rows: [drop(1), drop(2), drop(3)] });
		expect(await dst.kv.get(KV_COPY_ROWS)).toEqual({ day: today, rows: 3 });
		// A repeated chunk writes nothing and charges nothing.
		await load(s, { table: "ca_drops", rows: [drop(1), drop(2), drop(3)] });
		await load(s, { table: "ca_events", rows: events });
		expect(await dst.kv.get(KV_COPY_ROWS)).toEqual({ day: today, rows: 3 + 2 * events.length });
		expect(await dst.kv.get(KV_WRITE_BUDGET)).toMatchObject({ rows: 100 + 3 + 2 * events.length });
		const std = empty();
		const t = await site(std, ["data:import"]);
		t.h.setNow(NOW);
		await load(t, { table: "ca_drops", rows: [drop(1)] });
		expect(await std.kv.get(KV_COPY_ROWS)).toBeNull();
	});

	it("answers 429 with Retry-After to 00:00 UTC when the day's rows are used up, writing nothing", async () => {
		const dst = empty();
		const s = await site(dst, ["data:import"], undefined, SMALL);
		s.h.setNow(NOW);
		await load(s, { table: "ca_drops", rows: [] });
		await dst.kv.set(KV_COPY_ROWS, { day: today, rows: COPY_DAY_ROWS - 3 });
		const r = await load(s, { table: "ca_drops", rows: [drop(1), drop(2), drop(3), drop(4)] });
		expect(r.status).toBe(429);
		expect(r.json).toMatchObject({ error: "daily_limit" });
		expect(r.headers["retry-after"]).toBe(String(nextUtcMidnight(NOW) - NOW));
		expect(dst.count("ca_drops")).toBe(0);
		expect((await load(s, { table: "ca_drops", rows: [drop(1), drop(2), drop(3)] })).json.data).toEqual({ table: "ca_drops", inserted: 3 });
	});

	it("the CLI waits until 00:00 UTC on a 429 and finishes the import the next day", async () => {
		const src = await seeded();
		const e = await site(src, ["data:export"]);
		const dir = tmp();
		await cli.exportData({ url: URL_, key: e.key, out: dir, fetch: e.fetch, ...quiet });
		const dst = empty();
		const s = await site(dst, ["data:import"], undefined, SMALL);
		let now = NOW;
		s.h.setNow(now);
		await dst.kv.set(KV_COPY_ROWS, { day: today, rows: COPY_DAY_ROWS - 100 });
		const slept: number[] = [];
		const logs: string[] = [];
		const sleep = async (ms: number) => {
			slept.push(ms);
			s.h.setNow((now += ms / 1000));
		};
		const r = await cli.importData({ url: URL_, key: s.key, in: dir, fetch: s.fetch, rows: 50, sleep, log: (l: string) => logs.push(l) });
		expect(r.short).toEqual([]);
		expect(await totals(dst.db)).toEqual(await totals(src.db));
		expect(slept).toEqual([(nextUtcMidnight(NOW) - NOW) * 1000]);
		expect(logs.some((l) => l.includes("until 00:00 UTC"))).toBe(true);
	});
});

describe("ca-data key", () => {
	const script = join(import.meta.dirname, "../scripts/ca-data.mjs");
	it("takes CA_DATA_KEY first and --key only as the fallback", () => {
		expect(cli.keyOf({ key: "from-argv" }, { CA_DATA_KEY: "from-env" })).toBe("from-env");
		expect(cli.keyOf({ key: "from-argv" }, {})).toBe("from-argv");
		expect(cli.keyOf({}, {})).toBeUndefined();
	});

	it("--help names CA_DATA_KEY first, and a failing run never prints the key", () => {
		const help = execFileSync(process.execPath, [script, "--help"], { encoding: "utf8" });
		expect(help).toMatch(/CA_DATA_KEY=<key> ca-data export/);
		expect(help).toMatch(/--key <key> is used only when CA_DATA_KEY is not set/);
		let out = "";
		try {
			execFileSync(process.execPath, [script, "export", "--url", "http://example.com", "--out", tmp()], { encoding: "utf8", env: { ...process.env, CA_DATA_KEY: "ab12cd34.SECRETVALUE" }, stdio: "pipe" });
		} catch (err) {
			const e = err as { stdout: string; stderr: string; status: number };
			out = e.stdout + e.stderr;
			expect(e.status).toBe(1);
		}
		expect(out).toMatch(/https/);
		expect(out).not.toContain("SECRETVALUE");
	});
});
