/** Privacy receipt, and the database health of the Data page (D1 and Postgres through a fake Hyperdrive binding). */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { drops } from "../src/core/drops.js";
import { factsDb, setPluginFacts } from "../src/db/facts.js";
import { type PgClient, usePgDriver } from "../src/db/pg.js";
import { resetQueryCache } from "../src/db/query-cache.js";
import { SLOW_MS } from "../src/routes/privacy.js";
import { dropPgDriver, fakeDriver, hyperdrive, PG_SECRETS, PG_URL, type PgStats, pglite } from "./pg.helpers.js";
import { MemoryKv, memoryDb } from "./helpers.js";
import { isNeutral } from "../src/names.js";
import { zonedToEpoch } from "../src/core/time.js";
import { ownDatabase, TABLES as SCHEMA_TABLES } from "../src/db/schema.js";
import { ingestStatus } from "../src/core/queue-sink.js";
import { KV_CURSOR } from "../src/query/retention.js";
import { capacityOf, DROPS_LINE, EMAIL_LINE, ORDER_SESSION_LINE, privacyRoute, SITE_SEARCH_LINE, type ReceiptCtx, REVENUE_LINE, SATISFACTION_LINE, SHARING_LINE, STATEMENT, TABLES } from "../src/routes/privacy.js";
import { normalizeSettings } from "../src/settings.js";
import { STORAGE } from "../src/index.js";
import { seed } from "./fixtures/seed.js";
import { cloneSite, schemaDb, sitesColl } from "./helpers.js";
import { invalidateRegistry } from "../src/multisite/registry.js";

describe("privacy/receipt", () => {
	it("lists every table and collection, retention, salt age, drops, row counts and the statement", async () => {
		const env = await schemaDb();
		const settings = await seed(env, "UTC");
		const now = zonedToEpoch("2026-03-13", 6, "UTC");
		const drop = env.raw.prepare("INSERT INTO ca_drops (site, day, reason, n) VALUES (?, ?, ?, ?)");
		for (const [site, day, reason, n] of [
			["default", 20260312, "reload", 2],
			["default", 20260312, "privacy_signal", 1],
			["default", 20260312, "bot", 40],
			["default", 20260311, "reload", 1],
			["default", 20260311, "revenue_invalid", 1],
			["default", 20260311, "revenue_not_accepted", 2],
			["default", 20260311, "duplicate_order", 3],
			["default", 20260311, "budget_blocked", 5],
			// Outside the 30 day window, and another site's counts.
			["default", 20260211, "reload", 100],
			["blog", 20260312, "reload", 7],
		] as const)
			drop.run(site, day, reason, n);
		await env.kv.set(KV_CURSOR, { day: "2026-03-13", step: 6, rawDays: 30, capped: true, storage: { profile: "small", budget: 300e6, bytes: 290e6, detail: 220e6, summary: 70e6, rawDays: 30, capped: true }, deleted: {} });
		const route = privacyRoute({ db: async () => env.db, settings: async () => settings, now: () => now });
		expect(route.permission).toBe("plugins:read");
		const r = await route.handler({ kv: env.kv } as ReceiptCtx);

		expect(r.statement).toBe(STATEMENT);
		expect(STATEMENT).toBe("No cookies, no device storage, no raw IP, no raw user agent.");
		const names = r.tables.map((t) => t.name);
		for (const t of SCHEMA_TABLES) expect(names).toContain(t);
		for (const c of [...Object.keys(STORAGE), "api_keys"]) expect(names).toContain(c);
		expect(r.tables.find((t) => t.name === "dashboards")).toMatchObject({ kind: "storage", retention: "until deleted in the admin" });
		for (const t of r.tables) {
			expect(t.description.length, t.name).toBeGreaterThan(10);
			expect(typeof t.retention, t.name).toBe("string");
		}
		const sessions = r.tables.find((t) => t.name === "ca_sessions");
		expect(sessions).toMatchObject({ rows: env.count("ca_sessions"), retention: "30 days" });
		expect(r.tables.find((t) => t.name === "ca_search_daily")?.retention).toBe("800 days");
		expect(r.retention).toMatchObject({ rawDays: 30, rawCapped: true, storage: { profile: "small", budget: 300e6, bytes: 290e6 } });
		expect(r.db.dialect).toBe(env.db.dialect);

		expect(r.salt.day).toBe("2026-03-13");
		expect(r.salt.ageSeconds).toBe(6 * 3600);
		expect(r.salt.nextRotation).toBe(zonedToEpoch("2026-03-14", 0, "UTC"));
		expect(r.salt.stored.length).toBeGreaterThan(0);

		expect(r.drops).toEqual({
			days: 30,
			byReason: { bot: 40, budget_blocked: 5, duplicate_order: 3, privacy_signal: 1, reload: 3, revenue_invalid: 1, revenue_not_accepted: 2 },
			note: DROPS_LINE,
		});
		expect(r.writes).toBeNull();
		expect(names).not.toContain("drops:<day>");
		expect(r.revenue).toBe(REVENUE_LINE);
		expect(REVENUE_LINE).toBe(
			"Order values and currency codes sent with events. We do not store order ids (they only decide whether an order was already counted), buyer names, emails or payment data.",
		);
		expect(r.markdown).toContain(REVENUE_LINE);
		expect(r.orderSession).toBe(ORDER_SESSION_LINE);
		expect(ORDER_SESSION_LINE).toBe(
			"If your own server keeps the session token next to an order, that links the order to the pages of that session in your own records. This plugin stores no order id and no buyer data.",
		);
		expect(r.markdown).toContain(ORDER_SESSION_LINE);
		expect(r.siteSearch).toBe(SITE_SEARCH_LINE);
		expect(SITE_SEARCH_LINE).toBe("If a site search parameter is configured, the words searched for are kept, with emails and long numbers removed.");
		expect(r.markdown).toContain(SITE_SEARCH_LINE);
		expect(r.tables.find((t) => t.name === "ca_events")?.description).toContain(REVENUE_LINE);
		expect(r.tables.map((t) => t.name)).not.toContain("ca_hits");
		expect(r.tables.find((t) => t.name === "ca_revenue_daily")).toMatchObject({ kind: "table", retention: "25 months" });
		expect(r.markdown).toContain(STATEMENT);
		expect(r.markdown).toContain("30 days");
		expect(r.markdown).toContain("not legal advice");

		expect(r.satisfaction).toBe(SATISFACTION_LINE);
		expect(SATISFACTION_LINE).toBe(
			"Per page view we keep how long the page was visible and active, how far it was scrolled, how it was reached (new, reload, back or forward) and how it was left (hidden, closed, or kept for back and forward). Per session we count repeat arrivals from a search engine. The script never reads or changes your browser history.",
		);
		expect(r.markdown).toContain(SATISFACTION_LINE);
		expect(r.sharing).toBe(SHARING_LINE);
		expect(SHARING_LINE).toBe(
			"Shared views show aggregated numbers only, the same as the admin pages: no visitor identifiers, no raw rows. Opening a shared view is not counted as a visit to any site. Per shared link we store how many times it was opened and when it was last opened.",
		);
		expect(r.markdown).toContain(SHARING_LINE);
		// The recipients of a scheduled email are kept with the dashboard.
		expect(r.email).toBe("If you schedule an email, the recipients you enter are kept with the dashboard.");
		expect(r.email).toBe(EMAIL_LINE);
		expect(r.tables.find((t) => t.name === "dashboards")?.description).toContain(EMAIL_LINE);
		const shares = r.tables.find((t) => t.name === "shares");
		expect(shares?.description).toMatch(/hash of the link/);
		expect(shares?.description).toMatch(/Never the link or the password/);
		expect(Object.keys(sessions?.columns ?? {})).toEqual(expect.arrayContaining(["visible_ms", "reentries"]));
		// How a page was reached and left, and its visible time, are fields of the visit document.
		expect(sessions?.columns?.hits).toMatch(/how the page was reached and left, active and visible time/);
	});

	it("a failed database self-check is a typed error the Data page shows", async () => {
		const env = await schemaDb();
		const broken = { ...env.db, all: async () => Promise.reject(new Error("no such database")) };
		await expect(privacyRoute({ db: async () => broken, settings: async () => normalizeSettings({}) }).handler({ kv: env.kv })).rejects.toMatchObject({
			code: "db_unavailable",
			message: expect.stringContaining("no such database"),
		});
	});

	it("the copyable block has no forbidden public word and no em or en dash", async () => {
		for (const signals of ["none", "gpc", "dnt_and_gpc"]) {
			const env = await schemaDb();
			const s = normalizeSettings({ signals });
			const r = await privacyRoute({ db: async () => env.db, settings: async () => s, now: () => 0 }).handler({ kv: env.kv });
			expect(isNeutral(r.markdown), r.markdown).toBe(true);
			expect(JSON.stringify(r)).not.toMatch(/[\u2013\u2014]/);
		}
		expect(TABLES.length).toBeGreaterThan(10);
	});
	it("reports a client site's row counts and says retention is per database; the other site's receipt is unchanged", async () => {
		invalidateRegistry();
		const env = await schemaDb();
		const settings = await seed(env, "UTC");
		const route = privacyRoute({ db: async () => env.db, settings: async () => settings, now: () => zonedToEpoch("2026-03-13", 6, "UTC") });
		const storage = { sites: sitesColl([{ id: "blog" }]) };
		const before = await route.handler({ kv: env.kv, storage } as ReceiptCtx);
		cloneSite(env.raw, "blog", "day = '2026-03-10'");
		const local = await route.handler({ kv: env.kv, storage } as ReceiptCtx);
		const blog = await route.handler({ kv: env.kv, storage, input: { site: "blog" } } as ReceiptCtx);
		const rows = (r: typeof local, t: string) => (r.tables.find((x) => x.name === t) as { rows?: number }).rows;
		expect(local.site).toEqual({ id: "default", kind: "local" });
		expect(blog.site).toEqual({ id: "blog", kind: "client" });
		expect(rows(local, "ca_sessions")).toBe(rows(before, "ca_sessions"));
		expect(rows(blog, "ca_sessions")).toBe((env.raw.prepare("SELECT COUNT(*) AS n FROM ca_sessions WHERE site = 'blog'").get() as { n: number }).n);
		expect(rows(blog, "ca_sessions")).toBeLessThan(rows(local, "ca_sessions") as number);
		expect(blog.note).toMatch(/every site/);
		expect("note" in local).toBe(false);
		await expect(route.handler({ kv: env.kv, storage, input: { site: "shop" } } as ReceiptCtx)).rejects.toMatchObject({ code: "unknown_site" });
	});
});

describe("privacy/receipt: database health", () => {
	const pg = pglite();
	afterAll(() => pg.close());
	afterEach(() => {
		resetQueryCache();
		drops.clear();
		setPluginFacts(undefined as never);
		dropPgDriver();
	});
	const OPTION = { binding: "CA_PG", engine: "postgres" as const };
	const stats = (): PgStats => ({ opened: 0, ended: 0, connects: 0, statements: [] });
	/** The receipt of the default site on the Postgres binding CA_PG; `clock` gives the self-check's milliseconds. */
	async function receipt(binding: unknown, clock?: () => number) {
		const dbFor = setPluginFacts(factsDb(OPTION, async () => memoryDb().db, async () => ({ CA_PG: binding })));
		const route = privacyRoute({ db: (site) => dbFor(site), settings: async () => normalizeSettings({ ingestTier: "queue" }), now: () => 1_772_000_000, ...(clock ? { clock } : {}) });
		return route.handler({ kv: new MemoryKv() });
	}
	const noSecret = (text: string) => {
		for (const secret of [PG_URL, ...PG_SECRETS]) expect(text).not.toContain(secret);
	};

	it("D1: engine, status, latency, no query cache", async () => {
		const env = await schemaDb();
		const r = await privacyRoute({ db: async () => env.db, settings: async () => normalizeSettings({}) }).handler({ kv: env.kv });
		expect(r.capacity.health).toMatchObject({ engine: "sqlite", status: "ok", queryCache: false });
		expect(r.capacity.health.latencyMs).toBeGreaterThanOrEqual(0);
	});

	it("Postgres: engine, status, latency, size and the cache probe in the payload, the queue never offered, no connection string anywhere", async () => {
		const { binding } = hyperdrive(pg);
		const r = await receipt(binding);
		expect(r.db.dialect).toBe("postgres");
		expect(r.capacity).toMatchObject({ database: "CA_PG", cap: null, health: { engine: "postgres", status: "ok", queryCache: false } });
		expect(r.capacity.size).toBeGreaterThan(0);
		// The Postgres budget row, not the own D1 one; the size is the whole database.
		expect(r.capacity).toMatchObject({ sizeWholeDatabase: true, budget: { target: "postgres", mb: 6000, level: "none", otherMb: null, contentCheck: true } });
		expect(r.ingest).toEqual({ tier: "direct", queueBound: false });
		noSecret(JSON.stringify(r));
	});

	it("capacityOf on a Postgres database reads the Postgres budget row: 50000 MB stays 50000", async () => {
		const s = normalizeSettings({ storageBudgetMb: 50_000 });
		const db = ownDatabase({ dialect: "postgres", run: async () => ({ changes: 0 }), all: async () => [], batch: async () => {}, size: async () => ({ bytes: 1 }) });
		const c = await capacityOf(db, s, 1_772_000_000, "default", undefined, { health: { engine: "postgres", status: "ok", latencyMs: 1, queryCache: false } });
		expect(c.budget).toEqual({ target: "postgres", mb: 50_000, level: "none", otherMb: null, contentCheck: true });
	});

	it("ingestStatus decides the tier alone: never the queue on Postgres, even when selected and bound", async () => {
		const bound = async () => ({ send: async () => undefined });
		const s = normalizeSettings({ ingestTier: "queue" });
		expect(await ingestStatus(s, bound, "postgres")).toEqual({ tier: "direct", queueBound: false });
		expect(await ingestStatus(s, bound, "sqlite")).toEqual({ tier: "queue", queueBound: true });
		expect(await ingestStatus(s, bound)).toEqual({ tier: "queue", queueBound: true });
	});

	it("Postgres with query caching on: status caching_on from a binding that serves stale reads", async () => {
		const inner = fakeDriver(pg, stats());
		const cache = new Map<string, Promise<{ rows: unknown[]; rowCount: number | null }>>();
		// Every SELECT is cached by text and values and never invalidated, as Hyperdrive's query cache does.
		usePgDriver((cs): PgClient => {
			const c = inner(cs);
			return {
				...c,
				query: (text, values) => {
					if (!/^\s*SELECT/i.test(text)) return c.query(text, values);
					const key = `${text}\u0000${JSON.stringify(values ?? [])}`;
					let hit = cache.get(key);
					if (!hit) cache.set(key, (hit = c.query(text, values)));
					return hit;
				},
			};
		});
		const r = await receipt({ connectionString: PG_URL });
		expect(r.capacity.health).toMatchObject({ engine: "postgres", status: "caching_on", queryCache: true });
		noSecret(JSON.stringify(r));
	});

	it("a slow self-check is status slow with its latency", async () => {
		const { binding } = hyperdrive(pg);
		let t = 0;
		const r = await receipt(binding, () => (t += SLOW_MS));
		// A slow database skips the probe.
		expect(r.capacity.health).toMatchObject({ status: "slow", latencyMs: SLOW_MS, queryCache: null });
	});

	it("an unreachable Postgres is one 503 message with engine, binding and the counted drops, never the connection string", async () => {
		hyperdrive(pg, {
			connect: () => {
				throw Object.assign(new Error(`connect ECONNREFUSED 203.0.113.7:5432 while opening ${PG_URL} for user "ca_user"`), { code: "ECONNREFUSED" });
			},
		});
		drops.add("default", "2026-02-25", "write_error", 3);
		drops.add("blog", "2026-02-25", "write_error", 9);
		drops.add("default", "2026-02-25", "bot", 40);
		const err = await receipt({ connectionString: PG_URL }).then(
			() => null,
			(e: unknown) => e as { code: string; message: string; status: number },
		);
		expect(err).toMatchObject({ code: "db_unavailable", status: 503 });
		expect(err?.message).toMatch(/^The database self-check failed \(Postgres, binding CA_PG, after \d+ ms\): Postgres is overloaded or unreachable/);
		expect(err?.message).toContain("3 such counts wait in this server instance");
		noSecret(JSON.stringify({ message: err?.message, err }));
		expect(err?.message).not.toContain("203.0.113.7");
	});
});
