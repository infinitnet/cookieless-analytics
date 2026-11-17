/**
 * The visit document write path (`src/core/apply.ts`): statements and rows written per event, replays, merge
 * order, racing first events, caps, storage form and size. Costs come from the rows meter (`tests/helpers.ts`),
 * whose rule table reproduces every measured production D1 value (docs/limits.md). Synthetic data only.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dropsOf } from "./drops.helpers.js";
import type { IngestBody } from "../src/contract.js";
import { aliasUpsert, engageUpdate, entryUpdate, orderInsert, srvUpsert, type VisitMsg, visitInsert, visitReadSql } from "../src/core/apply.js";
import { validateIngest } from "../src/core/ids.js";
import { type RecorderDeps, recordClientEvent, recordServerHit, requestInfo, resetCounters } from "../src/core/recorder.js";
import type { ResolveConfig, SessionRow } from "../src/core/session.js";
import { parseUa } from "../src/core/ua.js";
import type { Db } from "../src/db/adapter.js";
import { docMerge, docSet, q, raw } from "../src/db/dialect.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { generateTraffic, recordTraffic, rng, tableBytes } from "./capacity.helpers.js";
import { CHROME_UA, eventRequest, meteredDb, schemaDb } from "./helpers.js";

const T0 = Date.parse("2026-06-10T12:00:00Z") / 1000;
const SID = "aaaaaaaaaaaaaaaaaaaa";
const SID2 = "bbbbbbbbbbbbbbbbbbbb";
const H1 = "hhhhhhhhhhh1";
const H2 = "hhhhhhhhhhh2";

let env: Awaited<ReturnType<typeof schemaDb>>;
let meter: ReturnType<typeof meteredDb>;
beforeEach(async () => {
	resetCounters();
	env = await schemaDb();
	meter = meteredDb(env);
	meter.reset();
});

const deps = (over: Partial<Settings> = {}, now = T0, db: Db = meter.db): RecorderDeps => ({ db, kv: env.kv, settings: normalizeSettings(over as Record<string, unknown>), now });
const info = (headers: Record<string, string> = {}) => requestInfo(eventRequest("{}", headers));
const body = (b: Record<string, unknown>) => validateIngest({ v: 1, ...b }) as IngestBody;
const pv = (sid: string, h: string, u = "/", extra: Record<string, unknown> = {}) => body({ t: "pv", sid, h, u, w: 1440, ...extra });
const visits = () => env.raw.prepare("SELECT sid, pageviews, events, engaged_ms, json(hits) AS doc FROM ca_sessions").all() as Array<{ sid: string; pageviews: number; events: number; engaged_ms: number; doc: string }>;
const doc = (i = 0) => JSON.parse(visits()[i]?.doc ?? "{}") as Record<string, Record<string, unknown>>;

/** Statements and rows written of one call. */
async function cost(f: () => Promise<unknown>) {
	const s0 = { ...meter.stats };
	const out = await f();
	return { out, statements: meter.stats.statements - s0.statements, written: meter.stats.rowsWritten - s0.rowsWritten };
}

describe("statements and rows written per event (plan 3.3)", () => {
	it("matches the table: pv of a new visitor 2 / 2, pv on a known visit 1 / 1, pv with a fresh sid of a known visitor 3 / 2, engagement 1 / 1, event 1 / 1", async () => {
		expect(await cost(() => recordClientEvent(deps(), pv(SID, H1, "/a", { n: 1 }), info()))).toEqual({ out: "ok", statements: 2, written: 2 });
		expect(await cost(() => recordClientEvent(deps({}, T0 + 30), pv(SID, H2, "/b"), info()))).toEqual({ out: "ok", statements: 1, written: 1 });
		// Second tab: read, alias (S5), page view (S1).
		expect(await cost(() => recordClientEvent(deps({}, T0 + 60), pv(SID2, "hhhhhhhhhhh3", "/c", { n: 1 }), info()))).toEqual({ out: "ok", statements: 3, written: 2 });
		expect(await cost(() => recordClientEvent(deps({}, T0 + 70), body({ t: "en", sid: SID2, h: "hhhhhhhhhhh3", d: 4000, e: 5000, s: 40, i: 1 }), info()))).toEqual({ out: "ok", statements: 1, written: 1 });
		expect(await cost(() => recordClientEvent(deps({}, T0 + 80), body({ t: "ev", sid: SID, name: "signup", p: { plan: "pro" } }), info()))).toEqual({ out: "ok", statements: 1, written: 1 });
		expect(visits()).toMatchObject([{ sid: SID, pageviews: 3, events: 1, engaged_ms: 4000 }]);
	});

	it("an order costs 2 statements and 3 rows (ca_events and its day index, then S3); a duplicate order 2 statements (the insert, the guarded repair) and 0 rows", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/thanks", { n: 1 }), info());
		const order = validateIngest({ v: 1, t: "ev", sid: SID, name: "purchase", val: 49.9, cur: "EUR", oid: "A-1" })!;
		expect(await cost(() => recordClientEvent(deps({}, T0 + 5), order, info()))).toEqual({ out: "ok", statements: 2, written: 3 });
		expect(await cost(() => recordClientEvent(deps({}, T0 + 6), order, info()))).toEqual({ out: "duplicate_order", statements: 2, written: 0 });
		expect(env.raw.prepare("SELECT sday, sid, val, cur, path FROM ca_events").all()).toEqual([{ sday: "2026-06-10", sid: SID, val: 49.9, cur: "EUR", path: "/thanks" }]);
	});

	it("an order sent with the sid of a closed visit belongs to the visit that takes the event", async () => {
		await recordClientEvent(deps({ maxSessionMinutes: 30 }), pv(SID, H1, "/a", { n: 1 }), info());
		// 40 minutes later the visit is past its maximum length: the order starts a new visit.
		const order = validateIngest({ v: 1, t: "ev", sid: SID, name: "purchase", val: 5, cur: "EUR", oid: "A-9" })!;
		expect(await recordClientEvent(deps({ maxSessionMinutes: 30 }, T0 + 2400), order, info())).toBe("ok");
		const fresh = env.raw.prepare("SELECT sid FROM ca_sessions WHERE events = 1").get() as { sid: string };
		expect(fresh.sid).not.toBe(SID);
		expect(env.raw.prepare("SELECT sid FROM ca_events").get()).toEqual({ sid: fresh.sid });
	});

	it("a page view with a sid the database does not know: S1 misses, then read and insert (3 statements, 2 rows)", async () => {
		expect(await cost(() => recordClientEvent(deps(), pv(SID, H1, "/a"), info()))).toEqual({ out: "ok", statements: 3, written: 2 });
	});

	it("an error page is one counter row (S6): 1 statement, 1 row, also when it increments", async () => {
		const srv = { ...info(), url: "/missing", method: "GET", status: 404 };
		expect(await cost(() => recordServerHit(deps(), srv))).toEqual({ out: true, statements: 1, written: 1 });
		expect(await cost(() => recordServerHit(deps({}, T0 + 1), srv))).toEqual({ out: true, statements: 1, written: 1 });
	});

	it("the generator mix costs 3.1 to 3.5 rows written per page view (plan 3.3: 3.3)", async () => {
		const traffic = generateTraffic({ pageviews: 1000, seed: 3 });
		expect(await recordTraffic(meter.db, traffic)).toEqual({ ok: traffic.actions.length });
		const perPv = meter.stats.rowsWritten / 1000;
		console.info(`[capacity] document path: ${perPv.toFixed(2)} rows written, ${(meter.stats.statements / 1000).toFixed(2)} statements per page view`);
		expect(perPv).toBeGreaterThanOrEqual(3.1);
		expect(perPv).toBeLessThanOrEqual(3.5);
	}, 60_000);
});

describe("replays", () => {
	it("a replayed page view changes nothing and costs 0 rows: S1 misses on its guard, the read sees the entry", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a", { n: 1 }), info());
		await recordClientEvent(deps({}, T0 + 10), pv(SID, H2, "/b"), info());
		const before = visits();
		expect(await cost(() => recordClientEvent(deps({}, T0 + 20), pv(SID, H2, "/b"), info()))).toEqual({ out: "ok", statements: 2, written: 0 });
		expect(visits()).toEqual(before);
	});

	it("a replayed S1 or S3 statement changes 0 rows and costs 0 (without the guard production bills 1)", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a", { n: 1 }), info());
		const m = msg({ key: H2 });
		const target = q("sqlite")`site = ${"default"} AND day = ${"2026-06-10"} AND sid = ${SID}`;
		const s1 = entryUpdate("sqlite", m, target);
		const s3 = entryUpdate("sqlite", msg({ t: "ev", key: "e000000000001", fields: { n: "x" } }), target);
		for (const s of [s1, s3]) {
			expect(await cost(() => meter.db.all(s.sql, s.params))).toMatchObject({ written: 1 });
			expect(await cost(() => meter.db.all(s.sql, s.params))).toMatchObject({ out: [], written: 0 });
		}
	});

	it("engagement before its page view is merged, and the later page view keeps the engagement fields", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a", { n: 1 }), info());
		expect(await recordClientEvent(deps({}, T0 + 5), body({ t: "en", sid: SID, h: H2, d: 3000, e: 4000, s: 30, x: 1 }), info())).toBe("ok");
		expect(doc()[H2]).toEqual({ d: 3000, e: 4000, s: 30, x: 1 });
		expect(await cost(() => recordClientEvent(deps({}, T0 + 6), pv(SID, H2, "/b"), info()))).toEqual({ out: "ok", statements: 1, written: 1 });
		expect(doc()[H2]).toEqual({ t: 6, p: "/b", d: 3000, e: 4000, s: 30, x: 1 });
		expect(visits()[0]).toMatchObject({ pageviews: 2, engaged_ms: 3000 });
		// Later updates move the totals by the difference only.
		await recordClientEvent(deps({}, T0 + 9), body({ t: "en", sid: SID, h: H2, d: 5000 }), info());
		await recordClientEvent(deps({}, T0 + 9), body({ t: "en", sid: SID, h: H2, d: 5000 }), info());
		expect(visits()[0]).toMatchObject({ engaged_ms: 5000 });
	});
});

describe("racing first events", () => {
	/** A Db that holds the first statement matching `re` until released. */
	function gated(db: Db, re: RegExp) {
		let release = () => {};
		const gate = new Promise<void>((r) => (release = r));
		const state = { held: false };
		const hold = async () => {
			if (!state.held) {
				state.held = true;
				await gate;
			}
		};
		const g: Db = {
			dialect: db.dialect,
			run: async (sql, p) => (re.test(sql) && (await hold()), db.run(sql, p)),
			all: async (sql, p) => (re.test(sql) && (await hold()), db.all(sql, p)),
			batch: (s) => db.batch(s),
		};
		return { db: g, state, release };
	}

	it("two first page views of one sid, interleaved between read and insert, give one visit with both entries", async () => {
		const a = gated(env.db, /^INSERT INTO ca_sessions/);
		const first = recordClientEvent(deps({}, T0, a.db), pv(SID, H1, "/a", { n: 1 }), info());
		while (!a.state.held) await new Promise((r) => setImmediate(r));
		// The second one reads, finds nothing, and inserts while the first waits after its own read.
		expect(await recordClientEvent(deps({}, T0, env.db), pv(SID, H2, "/b", { n: 1 }), info())).toBe("ok");
		a.release();
		expect(await first).toBe("ok");
		expect(visits()).toHaveLength(1);
		expect(visits()[0]).toMatchObject({ sid: SID, pageviews: 2 });
		expect(Object.keys(doc()).sort()).toEqual([H1, H2]);
	});

	it("a slow-path write that changes nothing because the visit changed after the read throws (counted, sent again), unless the entry is stored", async () => {
		await recordClientEvent(deps({}, T0, env.db), pv(SID, H1, "/a", { n: 1 }), info());
		// A page view from a second tab (fresh sid, same visitor) takes the slow path; another request fills the cap in between.
		const a = gated(env.db, /^UPDATE ca_sessions/);
		const d = deps({}, T0 + 30, a.db);
		const second = recordClientEvent(d, pv(SID2, H2, "/b", { n: 1 }), info());
		while (!a.state.held) await new Promise((r) => setImmediate(r));
		env.raw.prepare("UPDATE ca_sessions SET pageviews = ?").run(normalizeSettings({}).maxPageviewsPerSession);
		a.release();
		await expect(second).rejects.toThrow(/changed between the read and the write/);
		expect(Object.keys(doc())).toEqual([H1]);
	});
});

describe("caps", () => {
	it("maxEventsPerSession bounds the document: the event over the cap is the drop session_cap", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a", { n: 1 }), info());
		const d = deps({ maxEventsPerSession: 10 });
		for (let i = 0; i < 10; i++) expect(await recordClientEvent({ ...d, now: T0 + i }, body({ t: "ev", sid: SID, name: "x" }), info())).toBe("ok");
		expect(await recordClientEvent({ ...d, now: T0 + 20 }, body({ t: "ev", sid: SID, name: "x" }), info())).toBe("session_cap");
		expect(visits()[0]).toMatchObject({ events: 10 });
		expect(Object.keys(doc())).toHaveLength(11);
		expect(await dropsOf(env, "2026-06-10")).toEqual({ session_cap: 1 });
	});

	it("an order over maxEventsPerSession is kept on its visit, with its entry and no drop", async () => {
		await recordClientEvent(deps(), pv(SID, H1, "/a", { n: 1 }), info());
		const d = deps({ maxEventsPerSession: 10, acceptClientRevenue: true });
		for (let i = 0; i < 10; i++) expect(await recordClientEvent({ ...d, now: T0 + i }, body({ t: "ev", sid: SID, name: "x" }), info())).toBe("ok");
		const order = body({ t: "ev", sid: SID, name: "purchase", val: 9, cur: "EUR", oid: "cap-1" });
		expect(await recordClientEvent({ ...d, now: T0 + 20 }, order, info())).toBe("ok");
		expect(visits()).toMatchObject([{ sid: SID, events: 11 }]);
		expect(Object.values(doc()).some((e) => e.n === "purchase")).toBe(true);
		expect(env.raw.prepare("SELECT sid, val FROM ca_events").all()).toEqual([{ sid: SID, val: 9 }]);
		expect(await dropsOf(env, "2026-06-10")).toEqual({});
	});

	it("an engagement update for a page view dropped by the cap neither counts time nor adds an entry", async () => {
		const d = deps({ maxPageviewsPerSession: 10 });
		for (let i = 0; i < 10; i++) await recordClientEvent({ ...d, now: T0 + i * 10 }, pv(SID, `hhhhhhhhhh${String(i).padStart(2, "0")}`, `/p${i}`), info());
		expect(await recordClientEvent({ ...d, now: T0 + 200 }, pv(SID, "hhhhhhhhhh99", "/p99"), info())).toBe("session_cap");
		expect(await recordClientEvent({ ...d, now: T0 + 201 }, body({ t: "en", sid: SID, h: "hhhhhhhhhh99", d: 30000 }), info())).toBe("orphan_update");
		// An update of a counted page view still applies.
		expect(await recordClientEvent({ ...d, now: T0 + 202 }, body({ t: "en", sid: SID, h: "hhhhhhhhhh09", d: 2000 }), info())).toBe("ok");
		expect(visits()[0]).toMatchObject({ pageviews: 10, engaged_ms: 2000 });
		expect(Object.keys(doc())).toHaveLength(10);
	});

	it("the default event cap is 200", () => {
		expect(normalizeSettings({}).maxEventsPerSession).toBe(200);
	});

	it("maxPageviewsPerSession stops the fast statement and the slow path alike", async () => {
		const d = deps({ maxPageviewsPerSession: 10 });
		for (let i = 0; i < 10; i++) await recordClientEvent({ ...d, now: T0 + i * 10 }, pv(SID, `hhhhhhhhhh${String(i).padStart(2, "0")}`, `/p${i}`), info());
		expect(await recordClientEvent({ ...d, now: T0 + 200 }, pv(SID, "hhhhhhhhhh99", "/p99"), info())).toBe("session_cap");
		expect(await recordClientEvent({ ...d, now: T0 + 210 }, pv(SID2, "hhhhhhhhhh98", "/p98", { n: 1 }), info())).toBe("session_cap");
		expect(visits()[0]).toMatchObject({ pageviews: 10 });
	});

	it("a visit started more than a day ago is out of reach: maxSessionMinutes is capped at 1440", async () => {
		const d = deps({ maxSessionMinutes: 10080, sessionWindowMinutes: 1440 } as Partial<Settings>);
		await recordClientEvent(d, pv(SID, H1, "/a", { n: 1 }), info());
		for (let k = 1; k <= 3; k++) await recordClientEvent({ ...d, now: T0 + k * 23 * 3600 }, pv(SID, `hhhhhhhhhhh${k + 2}`, "/b"), info());
		expect(visits().length).toBeGreaterThan(1);
	});
});

describe("storage form", () => {
	it("keeps the document a JSONB blob after an insert, S1, S2 and S3", async () => {
		const type = () => (env.raw.prepare("SELECT typeof(hits) AS t FROM ca_sessions").get() as { t: string }).t;
		await recordClientEvent(deps(), pv(SID, H1, "/a", { n: 1 }), info());
		expect(type()).toBe("blob");
		await recordClientEvent(deps({}, T0 + 5), pv(SID, H2, "/b"), info());
		expect(type()).toBe("blob");
		await recordClientEvent(deps({}, T0 + 6), body({ t: "en", sid: SID, h: H2, d: 1000 }), info());
		expect(type()).toBe("blob");
		await recordClientEvent(deps({}, T0 + 7), body({ t: "ev", sid: SID, name: "x", p: { a: 1 } }), info());
		expect(type()).toBe("blob");
		expect(doc()).toMatchObject({ [H1]: { t: 0, p: "/a" }, [H2]: { t: 5, p: "/b", d: 1000 } });
		expect(Object.values(doc()).find((e) => e.n === "x")).toEqual({ t: 7, n: "x", p: "/b", pr: { a: 1 } });
	});
});

describe("bytes per page view and in-place growth", () => {
	const PV = 1500;
	let grown = 0;
	let direct = 0;
	beforeAll(async () => {
		const g = await schemaDb();
		const traffic = generateTraffic({ pageviews: PV, seed: 11, spanSeconds: 4 * 86_400 });
		expect(await recordTraffic(g.db, traffic)).toEqual({ ok: traffic.actions.length });
		grown = tableBytes(g.raw, "ca_sessions");
		// The same final rows inserted whole, in random key order (measured on D1 as 383 bytes per pv).
		const d = await schemaDb();
		const rows = g.raw.prepare("SELECT * FROM ca_sessions").all() as Record<string, unknown>[];
		const r = rng(5);
		for (let i = rows.length - 1; i > 0; i--) {
			const j = Math.floor(r() * (i + 1));
			[rows[i], rows[j]] = [rows[j] as Record<string, unknown>, rows[i] as Record<string, unknown>];
		}
		const cols = Object.keys(rows[0] ?? {});
		const ins = d.raw.prepare(`INSERT INTO ca_sessions (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`);
		d.raw.transaction(() => {
			for (const row of rows) ins.run(...cols.map((c) => row[c]));
		})();
		direct = tableBytes(d.raw, "ca_sessions");
	}, 120_000);

	it("stores a sane number of bytes per page view (D1, inserted whole: 383)", () => {
		console.info(`[capacity] visit table and index: ${grown} bytes grown in place, ${direct} inserted whole, ${PV} page views: ${(grown / PV).toFixed(0)} and ${(direct / PV).toFixed(0)} bytes per page view, growth factor ${(grown / direct).toFixed(3)}`);
		// Lower than D1's 383: the generator's entries are small (paths like /p/12, no query, no referrer).
		expect(grown / PV).toBeGreaterThan(150);
		expect(grown / PV).toBeLessThan(700);
	});

	it("in-place growth through S1 and S3 costs at most 1.6 times a whole insert", () => {
		// About 1 (measured 0.987 to 1.013): random salts change the order of the vkey index between runs.
		expect(grown / direct).toBeGreaterThan(0.9);
		expect(grown / direct).toBeLessThan(1.6);
	});
});

describe("S1 on a 50 KB document: explicit-field jsonb_set against jsonb_patch", () => {
	it("jsonb_set takes less SQL time (the reason S1 uses it)", async () => {
		const big = Object.fromEntries(Array.from({ length: 700 }, (_, i) => [`k${String(i).padStart(11, "0")}`, { t: i, p: `/page/${i}/with/a/longer/path`, d: 4000 + i, s: 50 }]));
		env.raw
			.prepare("INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, hits) VALUES ('s', '2026-06-10', ?, 'k', 12, ?, ?, 1800, jsonb(?))")
			.run(SID, T0, T0, JSON.stringify(big));
		expect((env.raw.prepare("SELECT length(json(hits)) AS n FROM ca_sessions").get() as { n: number }).n).toBeGreaterThan(50_000);
		const where = q("sqlite")` WHERE site = ${"s"} AND day = ${"2026-06-10"} AND sid = ${SID}`;
		const stmt = (f: typeof docSet, key: string) => {
			const set = f("sqlite", "hits", key, { t: 9, p: "/new" });
			return { sql: `UPDATE ca_sessions SET hits = ${set.sql}${where.sql}`, params: [...set.params, ...where.params] };
		};
		const time = (f: typeof docSet, n: number) => {
			const out: number[] = [];
			for (let i = 0; i < 40; i++) {
				const s = stmt(f, `n${n}${String(i).padStart(10, "0")}`);
				const p = env.raw.prepare(s.sql);
				const t = performance.now();
				p.run(...s.params);
				out.push(performance.now() - t);
			}
			return out.sort((a, b) => a - b)[20] as number;
		};
		time(docSet, 0);
		const set = time(docSet, 1);
		const patch = time(docMerge, 2);
		console.info(`[capacity] S1 on a 50 KB document, median SQL time: jsonb_set ${set.toFixed(3)} ms, jsonb_patch ${patch.toFixed(3)} ms`);
		expect(set).toBeLessThan(patch);
	});
});

// ── Postgres: SQL asserted as strings only (never run on a Postgres server) ──

const CFG = { ...normalizeSettings({}) } as ResolveConfig;
function msg(over: Partial<VisitMsg> = {}): VisitMsg {
	return {
		t: "pv",
		site: "default",
		now: T0,
		sid: SID,
		fresh: false,
		key: H1,
		fields: { p: "/a", qs: "x=1", nt: 0 },
		evt: { t: "pv", sid: SID, u: "/a" },
		meta: { site: "default", ua: parseUa(CHROME_UA) },
		keys: {},
		cfg: CFG,
		...over,
	};
}
const ROW = { site: "default", sid: SID, vkey: "k", day: "2026-06-10", hour: 12, started: T0, last_seen: T0, window_s: 1800, entry_path: "/a", exit_path: "/a", pageviews: 1, events: 0, engaged_ms: 0, max_scroll: 0, interacted: 0, ref_host: null, ref_path: null, channel: "Direct", source: "", utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null, country: null, region: null, device: "desktop", browser: "Chrome", browser_major: "126", os: "Windows", lang: null, screen: null, host: "example.org" } satisfies SessionRow;

describe("Postgres statements (strings only)", () => {
	const pg = {
		s1: entryUpdate("postgres", msg(), q("postgres")`site = ${"default"} AND day = ${"2026-06-10"} AND sid = ${SID}`, true),
		s3: entryUpdate("postgres", msg({ t: "ev", key: "e000000000001", fields: { n: "signup" }, props: { plan: "pro" } }), raw("sid = 'x'")),
		s2: engageUpdate("postgres", { t: "en", site: "default", now: T0, sid: SID, key: H1, tz: "UTC", cap: 500, d: 4000, e: 5000, s: 40, i: 1, x: 2 }),
		insert: visitInsert("postgres", ROW, msg()),
		order: orderInsert("postgres", msg({ t: "ev", key: "o.0123456789abcdef0123", fields: { n: "purchase" }, rev: { val: 49.9, cur: "EUR" } })),
		alias: aliasUpsert("postgres", "default", { sid: SID2, canon: SID, expires: T0 + 86_400 }),
		srv: srvUpsert("postgres", { t: "srv", site: "default", now: T0, tz: "UTC", status: 404, path: "/x", ref: "" }),
		read: visitReadSql("postgres", "default", T0, "UTC", SID, ["k1", "k2"], H1),
	};

	it("types every bound value (variadic jsonb builders cannot infer a bare parameter)", () => {
		for (const [name, f] of Object.entries(pg)) {
			const bare = (f.sql.match(/\?/g) ?? []).length;
			const cast = (f.sql.match(/CAST\(\? AS [A-Z ]+\)/g) ?? []).length;
			expect(cast, name).toBe(bare);
		}
	});

	it("types a NULL order amount as DOUBLE PRECISION", () => {
		const f = orderInsert("postgres", msg({ t: "ev", key: "o.0123456789abcdef0123", fields: { n: "purchase" }, rev: { val: null, cur: null } }));
		expect(f.sql).toContain("CAST(? AS DOUBLE PRECISION), CAST(? AS TEXT) FROM");
	});

	it("uses GREATEST and the jsonb operators, never a SQLite function", () => {
		const all = Object.values(pg).map((f) => f.sql).join("\n");
		expect(all).not.toMatch(/\bMAX\(|jsonb_set|jsonb_patch|jsonb_object\(|json_each|json\(/);
		expect(pg.s1.sql).toMatch(/GREATEST\(last_seen, CAST\(\? AS BIGINT\)\)/);
		expect(pg.s2.sql).toMatch(/jsonb_build_object/);
	});

	it("keeps its statement text", () => {
		expect(Object.fromEntries(Object.entries(pg).map(([k, f]) => [k, f.sql]))).toMatchSnapshot();
	});
});
