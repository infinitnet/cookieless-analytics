/**
 * `fromPg`: statements, the atomic batch, request scoped clients, the bounded connect retry, error mapping and
 * redaction, the catalog size and the `C` collation, over a fake Hyperdrive binding on PGlite.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ddl } from "../src/db/dialect.js";
import { fromD1 } from "../src/db/d1.js";
import { fromPg, isHyperdrive, mapPgError, pgScope, redact, resetPgFailFast } from "../src/db/pg.js";
import { ensureSchema, ownDatabase, TABLES } from "../src/db/schema.js";
import { isOverload } from "../src/routes/in.js";
import { fakeD1 } from "./d1.helpers.js";
import { MemoryKv } from "./helpers.js";
import { dropPgDriver, hyperdrive, PG_SECRETS, PG_URL, pglite, resetPg } from "./pg.helpers.js";

const PG = pglite();
beforeAll(() => PG.waitReady, 60_000);
beforeEach(() => resetPg(PG));
afterEach(dropPgDriver);

const err = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});
const leaks = (text: string) => PG_SECRETS.filter((s) => text.includes(s));

async function table() {
	const h = hyperdrive(PG);
	await h.pg.exec("CREATE TABLE t (k TEXT PRIMARY KEY, n BIGINT NOT NULL)");
	return { ...h, db: fromPg(h.binding, "CA_PG") };
}

describe("fromPg statements", () => {
	it("runs, reads and counts changes with ? placeholders; int8 comes back as a string", async () => {
		const { db } = await table();
		expect(db.dialect).toBe("postgres");
		expect(await db.run("INSERT INTO t (k, n) VALUES (?, ?), (?, ?)", ["a", 1, "b", 2])).toEqual({ changes: 2 });
		expect(await db.run("UPDATE t SET n = n + 1 WHERE k = ? RETURNING k", ["a"])).toEqual({ changes: 1 });
		expect(await db.all("SELECT k, n FROM t ORDER BY k")).toEqual([
			{ k: "a", n: "2" },
			{ k: "b", n: "2" },
		]);
		expect(await db.all("SELECT ? AS q, '?' AS lit", ["x"])).toEqual([{ q: "x", lit: "?" }]);
	});

	it("a batch is one transaction: a failing third statement leaves no row", async () => {
		const { db, stats } = await table();
		await expect(
			db.batch([
				{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 1] },
				{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["b", 2] },
				{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 3] },
			]),
		).rejects.toThrow(/Postgres error \(23505\)/);
		expect(await db.all("SELECT k FROM t")).toEqual([]);
		expect(stats.statements.filter((s) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(s))).toEqual(["BEGIN", "ROLLBACK"]);
		await db.batch([{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 1] }]);
		expect(await db.all("SELECT k FROM t")).toEqual([{ k: "a" }]);
		await db.batch([]);
	});

	it("a batch of one statement runs it directly, without BEGIN and COMMIT", async () => {
		const { db, stats } = await table();
		await db.batch([{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 1] }]);
		expect(stats.statements).toEqual(["INSERT INTO t (k, n) VALUES ($1, $2)"]);
		await expect(db.batch([{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 2] }])).rejects.toThrow(/23505/);
		expect(await db.all("SELECT k, n FROM t")).toEqual([{ k: "a", n: "1" }]);
	});

	it("a parallel statement of the same scope stays out of a running transaction", async () => {
		const { db } = await table();
		await pgScope(async () => {
			const batch = db.batch([
				{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 1] },
				{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 2] },
			]);
			const single = db.run("INSERT INTO t (k, n) VALUES (?, ?)", ["b", 1]);
			await expect(batch).rejects.toThrow(/23505/);
			await single;
		});
		expect(await db.all("SELECT k FROM t")).toEqual([{ k: "b" }]);
	});
});

describe("request scope", () => {
	it("a scope that opened no client sets no timer", async () => {
		const spy = vi.spyOn(globalThis, "setTimeout");
		try {
			expect(await pgScope(() => "done")).toBe("done");
			expect(spy).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});

	it("one client per scope and binding, ended when the scope ends; nested scopes share it", async () => {
		const { db, stats } = await table();
		const out = await pgScope(async () => {
			await db.run("INSERT INTO t (k, n) VALUES (?, ?)", ["a", 1]);
			await Promise.all([db.all("SELECT k FROM t"), db.all("SELECT n FROM t")]);
			await pgScope(() => db.all("SELECT 1 AS one"));
			expect(stats).toMatchObject({ opened: 1, ended: 0 });
			return "done";
		});
		expect(out).toBe("done");
		expect(stats).toMatchObject({ opened: 1, ended: 1 });
	});

	it("outside a scope, and after it ended, each statement opens and ends its own client", async () => {
		const { db, stats } = await table();
		await db.all("SELECT 1 AS one");
		await db.batch([{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 1] }, { sql: "DELETE FROM t" }]);
		expect(stats).toMatchObject({ opened: 2, ended: 2 });
		let late: Promise<unknown> = Promise.resolve();
		await pgScope(async () => {
			await db.all("SELECT 1 AS one");
			late = new Promise((r) => setTimeout(r, 5)).then(() => db.all("SELECT 2 AS two"));
		});
		expect(await late).toEqual([{ two: 2 }]);
		expect(stats).toMatchObject({ opened: 4, ended: 4 });
	});

	it("a scope ends its client when the work throws, and a broken client is replaced", async () => {
		let broken = true;
		const h = hyperdrive(PG, { query: (sql) => {
			if (sql === "SELECT 1 AS one" && broken) {
				broken = false;
				throw err("Connection terminated unexpectedly");
			}
		} });
		const db = fromPg(h.binding, "CA_PG");
		await expect(
			pgScope(async () => {
				await expect(db.all("SELECT 1 AS one")).rejects.toThrow(/overloaded/);
				expect(await db.all("SELECT 1 AS one")).toEqual([{ one: 1 }]);
				throw new Error("work failed");
			}),
		).rejects.toThrow("work failed");
		expect(h.stats).toMatchObject({ opened: 2, ended: 2 });
	});

	it("without the driver every statement names the binding and the option", async () => {
		const { binding } = hyperdrive(PG);
		dropPgDriver();
		await expect(fromPg(binding, "CA_PG").all("SELECT 1")).rejects.toThrow('binding CA_PG is a Hyperdrive binding; set engine: "postgres" in the plugin options');
		expect(isHyperdrive(binding)).toBe(true);
		expect(isHyperdrive(fakeD1())).toBe(false);
		expect(isHyperdrive(null)).toBe(false);
	});
});

describe("errors", () => {
	it("a refused connect is tried once more; a second refusal is an overload with a clean message", async () => {
		let n = 0;
		const h = hyperdrive(PG, { connect: () => {
			n++;
			throw err(`connect ECONNREFUSED ${PG_URL} password=s3cret-pass user=ca_user`, "ECONNREFUSED");
		} });
		const e = (await fromPg(h.binding, "CA_PG").all("SELECT 1").then(
			() => new Error("no error"),
			(x: unknown) => x,
		)) as Error;
		expect(n).toBe(2);
		expect(isOverload(e)).toBe(true);
		expect(e.message).toMatch(/^Postgres is overloaded or unreachable \(ECONNREFUSED\): /);
		expect(leaks(`${e.message} ${e.stack} ${JSON.stringify(e)}`)).toEqual([]);
		expect(e.cause).toBeUndefined();
		expect(h.stats.ended).toBe(2);
	});

	it("a connect timeout is not retried; a refusal that heals costs one more connect", async () => {
		let n = 0;
		const timeout = hyperdrive(PG, { connect: () => {
			n++;
			throw err("timeout expired");
		} });
		await expect(fromPg(timeout.binding, "CA_PG").all("SELECT 1")).rejects.toThrow(/overloaded/);
		expect(n).toBe(1);
		let m = 0;
		const heals = hyperdrive(PG, { connect: () => {
			if (m++ === 0) throw err("read ECONNRESET", "ECONNRESET");
		} });
		// Another binding: the timeout above opened CA_PG's fail-fast window.
		expect(await fromPg(heals.binding, "CA_PG_2").all("SELECT 1 AS one")).toEqual([{ one: 1 }]);
		expect(m).toBe(2);
	});

	it("maps SQLSTATE classes: transient ones are overloads, others keep their code", () => {
		for (const code of ["08006", "08001", "53300", "57P03", "40001", "40P01"]) expect(isOverload(mapPgError(err("x", code)))).toBe(true);
		for (const code of ["23505", "42P01", "28P01"]) {
			const e = mapPgError(err("relation missing", code));
			expect(isOverload(e)).toBe(false);
			expect(e.message).toBe(`Postgres error (${code}): relation missing`);
			expect((e as Error & { code: string }).code).toBe(code);
		}
		expect(mapPgError(err("Query read timeout")).message).toMatch(/overloaded/);
		expect(mapPgError("plain").message).toBe("Postgres error: plain");
		expect(mapPgError(err("x", "not a code; DROP")).message).toBe("Postgres error: x");
	});

	it("redacts URLs and credentials, flattens and caps the text", () => {
		const out = redact(`could not connect to ${PG_URL}\nhost=db.example.com password=s3cret-pass\tsecret: abc token=xyz`);
		expect(out).toBe("could not connect to [redacted url] host=[redacted] password=[redacted] secret=[redacted] token=[redacted]");
		expect(redact("x".repeat(900))).toHaveLength(500);
	});
});

describe("size and collation", () => {
	it("Postgres answers the database size and each analytics table from the catalog", async () => {
		const h = hyperdrive(PG);
		const db = fromPg(h.binding, "CA_PG");
		await ensureSchema(ownDatabase(db), new MemoryKv());
		await db.run("INSERT INTO ca_drops (site, day, reason, n) VALUES (?, ?, ?, ?)", ["default", 20_000, "invalid", 1]);
		const s = await db.size?.();
		expect(s?.bytes).toBeGreaterThan(1_000_000);
		expect(Object.keys(s?.tables ?? {}).sort()).toEqual([...TABLES, "ca_meta"].sort());
		for (const n of Object.values(s?.tables ?? {})) expect(n).toBeGreaterThan(0);
	});

	it("D1 answers size_after; the Kysely path over SQLite has no size", async () => {
		const d1 = fakeD1();
		d1.raw.exec("CREATE TABLE x (a TEXT)");
		const size = Number(d1.raw.pragma("page_count", { simple: true })) * Number(d1.raw.pragma("page_size", { simple: true }));
		expect(await fromD1(d1).size?.()).toEqual({ bytes: size });
	});

	it("text columns of the Postgres layout compare bytewise (COLLATE \"C\")", async () => {
		expect(ddl("postgres", "a TEXT NOT NULL, b {INT}")).toBe('a TEXT COLLATE "C" NOT NULL, b BIGINT');
		expect(ddl("sqlite", "a TEXT NOT NULL")).toBe("a TEXT NOT NULL");
		const h = hyperdrive(PG);
		const db = fromPg(h.binding, "CA_PG");
		await ensureSchema(ownDatabase(db), new MemoryKv());
		const cols = await db.all<{ c: string | null }>(
			"SELECT DISTINCT collation_name AS c FROM information_schema.columns WHERE table_name LIKE 'ca\\_%' AND data_type = 'text'",
		);
		expect(cols).toEqual([{ c: "C" }]);
		await db.run("INSERT INTO ca_aliases (site, sid, canon, expires) VALUES (?, ?, ?, ?), (?, ?, ?, ?)", ["s", "Z", "x", 1, "s", "a", "x", 1]);
		expect(await db.all("SELECT sid FROM ca_aliases ORDER BY sid")).toEqual([{ sid: "Z" }, { sid: "a" }]);
	});
});

describe("teardown, rollback and real driver texts", () => {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	it("a statement still running when the scope's work settles finishes before the client is closed", async () => {
		const h = hyperdrive(PG, { query: (sql) => (sql.startsWith("INSERT") ? sleep(30) : undefined) });
		await h.pg.exec("CREATE TABLE t (k TEXT PRIMARY KEY, n BIGINT NOT NULL)");
		const db = fromPg(h.binding, "CA_PG");
		let left: Promise<unknown> = Promise.resolve();
		await pgScope(async () => {
			await db.all("SELECT 1 AS one");
			left = db.run("INSERT INTO t (k, n) VALUES (?, ?)", ["a", 1]);
		});
		await expect(left).resolves.toEqual({ changes: 1 });
		expect(await db.all("SELECT k FROM t")).toEqual([{ k: "a" }]);
		expect(h.stats).toMatchObject({ opened: 2, ended: 2 });
	});

	it("a batch cut by a timeout sends no ROLLBACK and its client is replaced", async () => {
		let cut = true;
		const h = hyperdrive(PG, { query: (sql) => {
			if (sql.startsWith("INSERT") && cut) {
				cut = false;
				throw err("Query read timeout");
			}
		} });
		await h.pg.exec("CREATE TABLE t (k TEXT PRIMARY KEY, n BIGINT NOT NULL)");
		const db = fromPg(h.binding, "CA_PG");
		await pgScope(async () => {
			await expect(db.batch([{ sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 1] }])).rejects.toThrow(/overloaded/);
			await h.pg.exec("ROLLBACK"); // the server's side of a dropped connection (PGlite has one session)
			resetPgFailFast(); // the timeout opened the fail-fast window; this test is about the client
			expect(await db.all("SELECT 1 AS one")).toEqual([{ one: 1 }]);
		});
		expect(h.stats.statements).not.toContain("ROLLBACK");
		expect(h.stats).toMatchObject({ opened: 2, ended: 2 });
	});

	it("a failed ROLLBACK retires the client instead of reusing an aborted transaction", async () => {
		const h = hyperdrive(PG, { query: (sql) => {
			if (sql === "ROLLBACK") throw err("rollback failed", "XX000");
		} });
		await h.pg.exec("CREATE TABLE t (k TEXT PRIMARY KEY, n BIGINT NOT NULL)");
		const db = fromPg(h.binding, "CA_PG");
		await pgScope(async () => {
			const dup = { sql: "INSERT INTO t (k, n) VALUES (?, ?)", params: ["a", 1] };
			await expect(db.batch([dup, dup])).rejects.toThrow(/23505/);
			await h.pg.exec("ROLLBACK");
			expect(await db.all("SELECT COUNT(*) AS n FROM t")).toEqual([{ n: "0" }]);
		});
		expect(h.stats).toMatchObject({ opened: 2, ended: 2 });
	});

	it("a server error quoting the word timeout is not an overload", () => {
		const e = mapPgError(err('invalid input syntax for type integer: "timeout"', "22P02"));
		expect(isOverload(e)).toBe(false);
		expect(mapPgError(err("connect ETIMEDOUT 10.0.0.5:5432", "ETIMEDOUT")).message).toBe("Postgres is overloaded or unreachable (ETIMEDOUT): connect ETIMEDOUT [redacted]");
	});

	it("an ETIMEDOUT connect is not retried", async () => {
		let n = 0;
		const h = hyperdrive(PG, { connect: () => {
			n++;
			throw err("connect ETIMEDOUT 10.0.0.5:5432", "ETIMEDOUT");
		} });
		await expect(fromPg(h.binding, "CA_PG").all("SELECT 1")).rejects.toThrow(/overloaded/);
		expect(n).toBe(1);
	});

	it("redacts what node-postgres and the socket layer really say", () => {
		expect(redact("connect ECONNREFUSED 10.0.0.5:5432")).toBe("connect ECONNREFUSED [redacted]");
		expect(redact("getaddrinfo ENOTFOUND db.example.com")).toBe("getaddrinfo ENOTFOUND [redacted]");
		expect(redact('password authentication failed for user "ca_user"')).toBe('password authentication failed for user "[redacted]"');
		expect(redact('no pg_hba.conf entry for host "192.0.2.4", user "ca_user", database "analytics", no encryption')).toBe(
			'no pg_hba.conf entry for host "[redacted]", user "[redacted]", database "[redacted]", no encryption',
		);
		expect(redact("server at 192.0.2.4 refused")).toBe("server at [redacted] refused");
		expect(redact("EXPLAIN SELECT 1")).toBe("EXPLAIN SELECT 1");
	});

	it("redacts IPv6 addresses in any text, and keeps times and casts", () => {
		expect(redact("server at 2001:db8::5 refused")).toBe("server at [redacted] refused");
		expect(redact("could not reach [2001:db8::5]:5432 now")).toBe("could not reach [redacted] now");
		expect(redact("via fe80::1%eth0, then ::1")).toBe("via [redacted], then [redacted]");
		expect(redact("host 2001:0db8:0000:0000:0000:ff00:0042:8329 down")).toBe("host [redacted] down");
		expect(redact("at 12:30:45 the cast value::bigint failed")).toBe("at 12:30:45 the cast value::bigint failed");
	});

	it("removes connection string parts of one or two characters as whole words", () => {
		const cs = "postgres://ab:pw@db.example.com:5432/db";
		expect(redact("role ab with pw rejected on db; table abc", cs)).toBe("role [redacted] with [redacted] rejected on [redacted]; table abc");
	});

	it("every part of the binding's connection string is removed from errors, in any wording", async () => {
		const h = hyperdrive(PG, { connect: () => {
			throw err("role ca_user at db.example.com:5432 with s3cret-pass rejected", "28P01");
		} });
		const e = (await fromPg(h.binding, "CA_PG").all("SELECT 1").then(
			() => new Error("no error"),
			(x: unknown) => x,
		)) as Error;
		expect(e.message).toMatch(/^Postgres error \(28P01\): /);
		expect(leaks(`${e.message} ${e.stack}`)).toEqual([]);
	});
});
