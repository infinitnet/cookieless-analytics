/**
 * The figures of docs/performance.md: the page script's bytes (scripts/measure-script.mjs) and the statements and
 * rows one page view costs through the real event route, on SQLite metered with the D1 rules and on Postgres
 * (PGlite behind the fake Hyperdrive driver, every statement on the wire counted, BEGIN and COMMIT included).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PLUGIN_ID } from "../src/contract.js";
import { drops } from "../src/core/drops.js";
import { resetCounters } from "../src/core/recorder.js";
import { routedSink } from "../src/core/queue-sink.js";
import { factsDb } from "../src/db/facts.js";
import { optionsKv } from "../src/db/options-kv.js";
import { pgOwnScope, pgScope } from "../src/db/pg.js";
import { resetQueryCache } from "../src/db/query-cache.js";
import { ensureSchema } from "../src/db/schema.js";
import { newProxySecret } from "../src/keys/proxy-secret.js";
import { invalidateRegistry } from "../src/multisite/registry.js";
import { inRoute } from "../src/routes/in.js";
import type { RouteEnv } from "../src/routes/env.js";
import { normalizeSettings } from "../src/settings.js";
import { eventRequest, meteredDb, memoryDb, sitesColl } from "./helpers.js";
import { dropPgDriver, hyperdrive, pglite, resetPg } from "./pg.helpers.js";
import { ctx } from "./routes.helpers.js";

const NOW = Date.parse("2026-06-10T12:00:00Z") / 1000;
const doc = readFileSync("docs/performance.md", "utf8");
const SID = "aaaaaaaaaaaaaaaaaaaa";
const FIREFOX_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
// A visit of two page views, each followed by the engagement update the script sends when the tab is hidden.
const VISIT = [
	{ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/", r: "", n: 1, w: 1440 },
	{ v: 1, t: "en", sid: SID, h: "hhhhhhhhhhh1", d: 4000, e: 5000, s: 40, i: 1, x: 0 },
	{ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh2", u: "/b", w: 1440 },
	{ v: 1, t: "en", sid: SID, h: "hhhhhhhhhhh2", d: 3000, e: 3000, s: 80, i: 1, x: 1 },
];

/** The host database with its options table, metered: KV reads and writes of the route count too. */
function host() {
	const m = meteredDb((() => {
		const h = memoryDb();
		h.raw.exec("CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT)");
		return h;
	})());
	return { ...m, kv: optionsKv(m.db, PLUGIN_ID) };
}

function route(deps: RouteEnv["deps"], kv: ReturnType<typeof host>["kv"]) {
	const tasks: Array<() => Promise<unknown>> = [];
	const env: RouteEnv = { deps, after: (fn) => void tasks.push(fn) };
	return async (body: object, at: number, other = false) => {
		// `other`: another visitor (another network and browser), so it never joins the measured visit.
		const req = eventRequest(body, other ? { "cf-connecting-ip": "198.51.100.9", "user-agent": FIREFOX_UA } : {});
		const text = await req.clone().text();
		const res = await pgScope(() => inRoute({ ...env, deps: async (c) => ({ ...(await deps(c)), now: at }) }).handler(ctx(req, text, kv as never)));
		expect(res.status).toBe(204);
		// Work after the response (as `after()`): in a scope of its own, counted with the request.
		for (const t of tasks.splice(0)) await pgOwnScope(t);
	};
}

beforeEach(() => {
	resetCounters();
	resetQueryCache();
	drops.clear();
});

describe("page script bytes (scripts/measure-script.mjs)", () => {
	const m = JSON.parse(execFileSync("node", ["scripts/measure-script.mjs", "--json"], { encoding: "utf8" })) as { minified: number; gzip: number; brotli: number };

	it("stays under the 3 KB gzip budget", () => {
		expect(m.gzip).toBeLessThan(3072);
		expect(m.brotli).toBeLessThan(m.gzip);
	});

	it("the ~3 KB of the README tagline and the package description is the gzip size rounded to the nearest KB, inside the 3,072 byte budget", () => {
		// Rounded to whole kilobytes the size is 3, whether a kilobyte is read as 1,000 or as 1,024 bytes
		// (true from 2,560 bytes up), and it stays under the budget of 3,072 bytes.
		expect(Math.round(m.gzip / 1000)).toBe(3);
		expect(Math.round(m.gzip / 1024)).toBe(3);
		expect(m.gzip).toBeLessThan(3072);
		const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { description: string };
		expect(pkg.description).toContain("about 3 KB gzipped");
		expect(readFileSync("README.md", "utf8").split("\n")[4]).toContain("A ~3 KB script");
		// Every public size claim is this rounded figure; the exact bytes are in docs/performance.md only.
		const claims: Array<[string, string]> = [
			["README.md", "about 3 KB gzipped"],
			["src/index.ts", "about 3 KB gzipped"],
			["docs/wiki/Home.md", "about 3 KB gzipped"],
			["packages/companion/README.md", "about 3 KB gzipped"],
			["packages/companion/listing/description.md", "about 3 KB gzipped"],
			["packages/companion/src/copy.ts", "about 3 KB gzipped"],
		];
		for (const [file, text] of claims) {
			const body = readFileSync(file, "utf8");
			expect(body, file).toContain(text);
			expect(body, file).not.toMatch(/\b2[.,]\d ?KB\b/i);
		}
	});

	it("no tracked file but docs/performance.md states an exact byte size of the page script", () => {
		// "2,684 bytes gzipped", "5,282 bytes minified", "gzip: 2,684 bytes" and the like: a byte figure next to a
		// compression or minification word. The budget of 3,072 bytes is a limit, not a measurement, so it may appear.
		const figure = /\b(\d[,.]?\d{3}) bytes,? (?:gzip|gzipped|minified|brotli)\b|\b(?:gzip|gzipped|brotli|minified)(?: size)?:? (\d[,.]?\d{3}) bytes\b/gi;
		const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
			.split("\0")
			.filter((f) => /\.(md|ts|tsx|mjs|js|json|astro|html)$/.test(f) && !f.startsWith("dist/") && f !== "docs/performance.md" && f !== "tests/performance.test.ts");
		expect(files).toContain("README.md");
		const found: string[] = [];
		for (const f of files) {
			for (const hit of readFileSync(f, "utf8").matchAll(figure)) {
				const n = (hit[1] ?? hit[2] ?? "").replace(/[,.]/g, "");
				if (n !== "3072") found.push(`${f}: ${hit[0]}`);
			}
		}
		expect(found).toEqual([]);
		// The pattern sees the forms the docs use.
		for (const text of ["2,684 bytes gzipped", "5,282 bytes minified", "gzip: 2,684 bytes", "4,835 bytes, gzipped"]) expect(text.match(figure), text).not.toBeNull();
		for (const text of ["at most 8,192 bytes", "under 3,072 bytes gzipped", "100,000 bytes", "under 3 KB gzipped"]) {
			expect([...text.matchAll(figure)].filter((h) => (h[1] ?? h[2] ?? "").replace(/[,.]/g, "") !== "3072"), text).toEqual([]);
		}
	});

	it("docs/performance.md states the measured sizes (minified exact, compressed within 2 percent)", () => {
		const n = (label: string) => Number(new RegExp(`\\| ${label} \\| ([\\d,]+) bytes`).exec(doc)?.[1]?.replace(/,/g, ""));
		expect(n("Minified")).toBe(m.minified);
		for (const [label, v] of [["gzip", m.gzip], ["Brotli", m.brotli]] as const) expect(Math.abs(n(label) - v) / v, label).toBeLessThan(0.02);
	});
});

describe("one page view through the event route", () => {
	it("D1 (SQLite with the D1 rules): statements and rows written per request, analytics and host database", async () => {
		const facts = meteredDb();
		await ensureSchema(facts.db, host().kv);
		const h = host();
		const s = normalizeSettings({});
		const send = route(async () => ({ db: facts.db, kv: h.kv, settings: s }), h.kv);
		// The first request of the day creates the daily salt in the host KV; measure a steady state after it.
		await send({ ...VISIT[0], sid: "zzzzzzzzzzzzzzzzzzzz", h: "zzzzzzzzzzz1" }, NOW - 60, true);
		const per: Array<{ statements: number; written: number; host: number }> = [];
		for (const [i, body] of VISIT.entries()) {
			facts.reset();
			h.reset();
			await send(body, NOW + i * 10);
			per.push({ statements: facts.stats.statements, written: facts.stats.rowsWritten, host: h.stats.rowsWritten });
		}
		// New visit: read and insert (the row and its index); then one statement and one row each.
		expect(per).toEqual([
			{ statements: 2, written: 2, host: 0 },
			{ statements: 1, written: 1, host: 0 },
			{ statements: 1, written: 1, host: 0 },
			{ statements: 1, written: 1, host: 0 },
		]);
		expect(doc).toContain("| D1 | 2 statements, 2 rows written | 1 statement, 1 row written | 1 statement, 1 row written |");
	});

	it("a post forwarded by a server proxy costs the same statements, and checking its secret reads no database", async () => {
		invalidateRegistry();
		const KEY = "kkkkkkkkkkkkkkkkkkkk";
		const sites = sitesColl([{ id: "blog", key: KEY, hosts: ["blog.example.net"] }]);
		const { secret, hash } = await newProxySecret();
		Object.assign(sites.items.get("blog") as object, { proxyHash: hash, proxyCreated: NOW });
		let registryLoads = 0;
		const query = sites.query.bind(sites);
		sites.query = (o) => (registryLoads++, query(o));
		const facts = meteredDb();
		await ensureSchema(facts.db, host().kv);
		const h = host();
		const s = normalizeSettings({});
		const tasks: Array<() => Promise<unknown>> = [];
		const env: RouteEnv = { deps: async () => ({ db: facts.db, kv: h.kv, settings: s }), after: (fn) => void tasks.push(fn) };
		// The same visit of the blog twice: straight from the browser, then through its proxy (another visitor's address).
		const send = async (body: object, at: number, proxied: boolean, ip: string) => {
			const req = eventRequest({ ...body, k: KEY }, { origin: "https://blog.example.net", ...(proxied ? { "cf-connecting-ip": "192.0.2.10", "x-ec-proxy-key": secret, "x-ec-client-ip": ip } : { "cf-connecting-ip": ip }) });
			const res = await inRoute({ ...env, deps: async (c) => ({ ...(await env.deps(c)), now: at }) }).handler({ ...ctx(req, await req.clone().text(), h.kv as never), requestMeta: { ip: proxied ? "192.0.2.10" : ip }, storage: { sites } });
			expect(res.status).toBe(204);
			for (const t of tasks.splice(0)) await t();
		};
		await send({ ...VISIT[0], sid: "zzzzzzzzzzzzzzzzzzzz", h: "zzzzzzzzzzz1" }, NOW - 60, false, "198.51.100.9");
		const measure = async (proxied: boolean, ip: string, sid: string) => {
			const per: Array<{ statements: number; written: number; host: number; hostWritten: number }> = [];
			for (const [i, body] of VISIT.entries()) {
				facts.reset();
				h.reset();
				await send({ ...body, sid, h: `${sid.slice(0, 11)}${i < 2 ? 1 : 2}` }, NOW + i * 10, proxied, ip);
				per.push({ statements: facts.stats.statements, written: facts.stats.rowsWritten, host: h.stats.statements, hostWritten: h.stats.rowsWritten });
			}
			return per;
		};
		const direct = await measure(false, "203.0.113.7", "a".repeat(20));
		const proxied = await measure(true, "203.0.114.7", "b".repeat(20));
		// The public path: the figures of the table above, and no statement on the host database.
		expect(direct).toEqual([
			{ statements: 2, written: 2, host: 0, hostWritten: 0 },
			{ statements: 1, written: 1, host: 0, hostWritten: 0 },
			{ statements: 1, written: 1, host: 0, hostWritten: 0 },
			{ statements: 1, written: 1, host: 0, hostWritten: 0 },
		]);
		// Through the proxy: 0 statements more on either database.
		expect(proxied).toEqual(direct);
		// Nine requests, one load of the sites registry, which the public path of a client site needs as well.
		expect(registryLoads).toBe(1);
		expect(facts.raw.prepare("SELECT COUNT(*) AS n FROM ca_sessions WHERE site = 'blog'").get()).toEqual({ n: 3 });
		expect(doc).toContain("A post forwarded by a server proxy ([client-sites.md](client-sites.md), section 4a) costs the same statements: its proxy secret is checked against the site record the route already holds, with one hash and no read of any database.");
	});

	describe("Postgres through Hyperdrive", () => {
		const pg = pglite();
		afterAll(() => pg.close());
		beforeEach(() => resetPg(pg));
		afterEach(() => dropPgDriver());

		it("statements on the wire per request, and what the first request of an isolate adds", async () => {
			const { binding, stats } = hyperdrive(pg);
			const h = host();
			const s = normalizeSettings({});
			// One isolate: its own `factsDb` (schema check) and its own cache probe result.
			const isolate = () => {
				resetQueryCache();
				const dbFor = factsDb({ binding: "CA_PG", engine: "postgres" }, async () => h.db, async () => ({ CA_PG: binding }));
				return route(async () => ({ db: await dbFor(s.siteId), kv: h.kv, settings: s, sink: routedSink(dbFor, s, h.kv) }), h.kv);
			};
			const counted = async (send: ReturnType<typeof route>, body: object, at: number, other?: boolean) => {
				const before = stats.statements.length;
				await send(body, at, other);
				return stats.statements.length - before;
			};
			// The first isolate ever creates the tables; the next one finds them.
			await isolate()({ ...VISIT[0], sid: "yyyyyyyyyyyyyyyyyyyy", h: "yyyyyyyyyyy1" }, NOW - 120, true);
			const send = isolate();
			// Another visitor's first page view (a new visit, 2 statements) on a fresh isolate.
			const first = (await counted(send, { ...VISIT[0], sid: "zzzzzzzzzzzzzzzzzzzz", h: "zzzzzzzzzzz1" }, NOW - 60, true)) - 2;
			const per = [];
			for (const [i, body] of VISIT.entries()) per.push(await counted(send, body, NOW + i * 10));
			expect({ first, per }).toEqual({ first: FIRST_PG, per: PER_PG });
			expect(doc).toContain(`| Postgres | ${PER_PG[0]} statements | ${PER_PG[1]} statement | ${PER_PG[2]} statement |`);
			expect(doc).toContain(`first request of an isolate adds ${FIRST_PG} statements`);
		});
	});
});

const FIRST_PG = 7;
const PER_PG = [2, 1, 1, 1];
