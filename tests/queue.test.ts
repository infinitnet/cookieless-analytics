/** Queue ingest tier: producer sink, fallback, binding detection, message contents and the consumer. */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sink, type IngestMsg, type IngestSink, resetWriteGuard, type VisitMsg } from "../src/core/apply.js";
import { KV_WRITE_BUDGET } from "../src/query/storage.js";
import type { KvLike } from "../src/core/crypto.js";
import { validateIngest } from "../src/core/ids.js";
import { ingestSink, ingestStatus, QueueSink, queueBinding, queueMessage, type QueueLike } from "../src/core/queue-sink.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { late, retryDelay } from "../src/core/queue-sink.js";
import { dropsOf } from "./drops.helpers.js";
import { consumeBatch, fromD1, handleQueue, ORPHAN_ATTEMPTS, type QueuedMessage } from "../src/queue.js";
import { parseUa } from "../src/core/ua.js";
import { zonedToEpoch } from "../src/core/time.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { generateTraffic, rng, type Traffic } from "./capacity.helpers.js";
import { CHROME_UA, eventRequest, MemoryKv, schemaDb } from "./helpers.js";

type Env = Awaited<ReturnType<typeof schemaDb>>;
const T0 = Date.parse("2026-06-10T12:00:00Z") / 1000;
const SID = "aaaaaaaaaaaaaaaaaaaa";

/** Fake queue binding: keeps what was sent, as the runtime would serialise it. */
class FakeQueue implements QueueLike {
	sent: Array<{ body: unknown; timestamp: Date }> = [];
	fail = false;
	async send(body: unknown) {
		if (this.fail) throw new Error("Queue send failed");
		this.sent.push({ body: JSON.parse(JSON.stringify(body)), timestamp: new Date(this.sent.length) });
	}
}

interface Delivery extends QueuedMessage {
	acked: boolean;
	retried: { delaySeconds?: number } | null;
}
const message = (m: { body: unknown; timestamp: Date }, attempts = 1): Delivery => ({
	body: structuredClone(m.body),
	timestamp: m.timestamp,
	attempts,
	acked: false,
	retried: null,
	ack() {
		this.acked = true;
	},
	retry(o) {
		this.retried = o ?? {};
	},
});

function shuffle<T>(xs: T[], r: () => number): T[] {
	for (let i = xs.length - 1; i > 0; i--) {
		const j = Math.floor(r() * (i + 1));
		[xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
	}
	return xs;
}

/**
 * Delivers everything sent, at least once and out of order: batches of 100, each shuffled, every batch delivered
 * a second time after the next batch, retried messages again later with a higher attempt count.
 */
async function deliverHostile(q: FakeQueue, db: Env["db"], kv?: KvLike): Promise<{ batches: number; retries: number }> {
	const r = rng(9);
	let pending: Array<{ body: unknown; timestamp: Date; attempts: number }> = q.sent.map((m) => ({ ...m, attempts: 1 }));
	let batches = 0;
	let retries = 0;
	while (pending.length) {
		const chunks: (typeof pending)[] = [];
		for (let i = 0; i < pending.length; i += 100) chunks.push(pending.slice(i, i + 100));
		// Batch i, then the duplicate of batch i - 1; the last batch's duplicate at the end.
		const plan: Array<[number, boolean]> = chunks.flatMap((_, i): Array<[number, boolean]> => (i ? [[i, false], [i - 1, true]] : [[i, false]]));
		plan.push([chunks.length - 1, true]);
		const next: typeof pending = [];
		for (const [ci, dup] of plan) {
			const batch = shuffle((chunks[ci] ?? []).map((m) => message(m, m.attempts)), r);
			await consumeBatch({ messages: batch }, db, kv);
			batches++;
			retries += batch.filter((m) => m.retried).length;
			// Retries of the first delivery come back later; the duplicate already is a redelivery.
			if (!dup) for (const m of batch) if (m.retried) next.push({ body: m.body, timestamp: m.timestamp, attempts: m.attempts + 1 });
		}
		pending = next;
	}
	return { batches, retries };
}

/** Generator events get client event ids, as the page script sends them, so both runs key them alike. */
function withEventIds(t: Traffic): Traffic {
	let n = 0;
	for (const a of t.actions) if (a.body.t === "ev") a.body.h = `ev${String(n++).padStart(10, "0")}`;
	return t;
}

async function drive(db: Env["db"], kv: KvLike, traffic: Traffic, sink: IngestSink, settings: Settings = normalizeSettings({})) {
	resetCounters();
	for (const a of traffic.actions) {
		const body = validateIngest(a.body);
		if (!body) throw new Error("invalid generated body");
		const info = requestInfo(eventRequest(a.body, { "cf-connecting-ip": a.ip }, a.url));
		await recordClientEvent({ db, kv, settings, now: a.at, sink }, body, info);
	}
}

/** Every analytics table, row by row in key order, documents parsed. */
function tables(env: Env) {
	const all = (sql: string) => env.raw.prepare(sql).all() as Record<string, unknown>[];
	return {
		ca_sessions: all("SELECT *, json(hits) AS hits FROM ca_sessions ORDER BY site, day, sid").map((r) => ({ ...r, hits: JSON.parse(String(r.hits)) })),
		ca_aliases: all("SELECT * FROM ca_aliases ORDER BY site, sid"),
		ca_events: all("SELECT * FROM ca_events ORDER BY site, id"),
		ca_srv: all("SELECT * FROM ca_srv ORDER BY site, day, status, path, ref"),
	};
}

beforeEach(() => {
	resetCounters();
	// The consumer compares a message's day with the closed days at the time it applies it: apply on the day of the traffic.
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime((T0 + 6 * 3600) * 1000);
});
afterEach(() => vi.useRealTimers());

describe("queue tier: tables equal the direct path", () => {
	it("generator traffic delivered twice, shuffled and late gives the same rows as direct writes", async () => {
		const traffic = withEventIds(generateTraffic({ pageviews: 600, seed: 4 }));
		// Campaign, click id and private parameters and referrers, so trimming them from messages is covered.
		let k = 0;
		for (const a of traffic.actions)
			if (a.body.t === "pv" && k++ % 3 === 0) {
				if (k % 2) a.body.u = `${a.body.u}?utm_source=news&utm_medium=email&gclid=g${k}&token=t${k}&utm_campaign=C${k % 4}`;
				else {
					a.body.u = `${a.body.u}?token=t${k}`;
					a.body.r = k % 4 ? `https://www.bing.com/search?q=private${k}` : `https://blog.example.net/post/${k}?ref=x`;
				}
			}
		const kv = new MemoryKv(); // shared, so both runs use the same daily salts and visitor keys
		const direct = await schemaDb();
		await drive(direct.db, kv, traffic, new D1Sink(direct.db));

		const queued = await schemaDb();
		const q = new FakeQueue();
		await drive(queued.db, kv, traffic, new QueueSink(q, new D1Sink(queued.db)));
		expect(q.sent).toHaveLength(traffic.actions.length);
		expect(queued.count("ca_sessions")).toBe(0); // nothing written on the request path

		const run = await deliverHostile(q, queued.db);
		const want = tables(direct);
		expect(want.ca_sessions.length).toBeGreaterThan(200);
		expect(want.ca_aliases.length).toBeGreaterThan(0);
		expect(want.ca_events.length + want.ca_srv.length).toBe(0);
		expect(new Set(want.ca_sessions.map((r) => (r as Record<string, unknown>).channel)).size).toBeGreaterThan(2);
		const got = tables(queued);
		expect(got.ca_sessions).toHaveLength(want.ca_sessions.length);
		for (const [i, row] of want.ca_sessions.entries()) expect(got.ca_sessions[i], `visit ${i}`).toEqual(row);
		expect(got).toEqual(want);
		expect(run.batches).toBeGreaterThan(2 * Math.ceil(traffic.actions.length / 100) - 1);
	}, 60_000);

	it("orders and their duplicates: one row each, as on the direct path", async () => {
		const kv = new MemoryKv();
		const traffic: Traffic = {
			counts: { pageviews: 1, sessions: 1, engagement: 0, events: 2, aliases: 0 },
			actions: [
				{ at: T0, ip: "2001:db8:1::1", url: "https://example.com/_/e", body: { v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/cart", n: 1 } },
				...[1, 2].map((k) => ({ at: T0 + k, ip: "2001:db8:1::1", url: "https://example.com/_/e", body: { v: 1, t: "ev", sid: SID, h: `orderpost00${k}`, name: "purchase", u: "/thanks", val: 19.9, cur: "EUR", oid: "A-1" } })),
			],
		};
		const direct = await schemaDb();
		await drive(direct.db, kv, traffic, new D1Sink(direct.db));
		const queued = await schemaDb();
		const q = new FakeQueue();
		await drive(queued.db, kv, traffic, new QueueSink(q, new D1Sink(queued.db)));
		await deliverHostile(q, queued.db);
		expect(tables(direct).ca_events).toHaveLength(1);
		expect(tables(queued)).toEqual(tables(direct));
	});

	it("a message applied after the day before its own day closed is not written and counts late_after_close", async () => {
		const env = await schemaDb();
		const kv = new MemoryKv();
		const q = new FakeQueue();
		const traffic: Traffic = {
			counts: { pageviews: 2, sessions: 1, engagement: 0, events: 0, aliases: 0 },
			actions: [
				{ at: T0, ip: "2001:db8:1::1", url: "https://example.com/_/e", body: { v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/a", n: 1 } },
				{ at: T0 + 60, ip: "2001:db8:1::1", url: "https://example.com/_/e", body: { v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh2", u: "/b" } },
			],
		};
		await drive(env.db, kv, traffic, new QueueSink(q, new D1Sink(env.db)));
		const [first, second] = q.sent as [{ body: unknown; timestamp: Date }, { body: unknown; timestamp: Date }];
		await consumeBatch({ messages: [message(first)] }, env.db, kv);
		// A page view of 2026-06-10 may belong to a visit started on the 9th, whose summary is stored from 00:15 on the 11th
		// (site time): applied 10 minutes after that, it is refused.
		const tz = (second.body as VisitMsg).cfg.siteTimezone;
		const midnight = zonedToEpoch("2026-06-11", 0, tz);
		expect(late(second.body as IngestMsg, midnight + 14 * 60)).toBe(false);
		vi.setSystemTime((midnight + 25 * 60) * 1000);
		const m = message(second);
		await consumeBatch({ messages: [m] }, env.db, kv);
		expect(m.acked).toBe(true);
		expect(env.raw.prepare("SELECT pageviews FROM ca_sessions").get()).toEqual({ pageviews: 1 });
		expect(await dropsOf(env, "2026-06-10")).toEqual({ late_after_close: 1 });
	});

	it("an engagement update delivered before its page view is retried, then merged", async () => {
		const env = await schemaDb();
		const kv = new MemoryKv();
		const q = new FakeQueue();
		const sink = new QueueSink(q, new D1Sink(env.db));
		const traffic: Traffic = {
			counts: { pageviews: 1, sessions: 1, engagement: 1, events: 0, aliases: 0 },
			actions: [
				{ at: T0, ip: "2001:db8:1::1", url: "https://example.com/_/e", body: { v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/a", n: 1 } },
				{ at: T0 + 5, ip: "2001:db8:1::1", url: "https://example.com/_/e", body: { v: 1, t: "en", sid: SID, h: "hhhhhhhhhhh1", d: 4000, e: 5000, s: 40, i: 1 } },
			],
		};
		await drive(env.db, kv, traffic, sink);
		const [pv, en] = q.sent as [{ body: unknown; timestamp: Date }, { body: unknown; timestamp: Date }];
		const first = message(en);
		await consumeBatch({ messages: [first] }, env.db, kv);
		expect(first.retried).toEqual({ delaySeconds: 30 });
		expect(first.acked).toBe(false);
		await consumeBatch({ messages: [message(pv)] }, env.db, kv);
		const again = message(en, 2);
		await consumeBatch({ messages: [again] }, env.db, kv);
		expect(again.acked).toBe(true);
		const row = env.raw.prepare("SELECT engaged_ms, max_scroll, json(hits) AS hits FROM ca_sessions").get() as { engaged_ms: number; max_scroll: number; hits: string };
		expect(row.engaged_ms).toBe(4000);
		expect(row.max_scroll).toBe(40);
		expect(JSON.parse(row.hits).hhhhhhhhhhh1).toMatchObject({ t: 0, p: "/a", d: 4000 });
		// After the last attempt the update is acknowledged and counted, as the direct path counts it.
		const late = message({ body: { ...(en.body as object), sid: "cccccccccccccccccccc" }, timestamp: new Date(9) }, ORPHAN_ATTEMPTS);
		await consumeBatch({ messages: [late] }, env.db, kv);
		expect(late.acked).toBe(true);
		const rows = env.raw.prepare("SELECT reason, n FROM ca_drops").all() as Array<{ reason: string; n: number }>;
		expect(rows).toEqual([{ reason: "orphan_update", n: 1 }]);
	});

	it("a failing write retries the message and the rest of its visitor's messages, nothing else", async () => {
		const env = await schemaDb();
		const mk = (sid: string, h: string, at: number, vk: string): VisitMsg =>
			queueMessage({
				t: "pv", site: "default", now: at, sid, fresh: false, key: h, fields: { p: "/a" },
				evt: { t: "pv", sid, u: "/a" }, meta: { site: "default", ua: parseUa(CHROME_UA) },
				keys: { "2026-06-10": vk }, cfg: normalizeSettings({}),
			}) as VisitMsg;
		const msgs = [mk(SID, "hhhhhhhhhhh1", T0, "k1"), mk(SID, "hhhhhhhhhhh2", T0 + 9, "k1"), mk("bbbbbbbbbbbbbbbbbbbb", "hhhhhhhhhhh3", T0 + 5, "k2")].map((body, i) => message({ body, timestamp: new Date(i) }));
		let calls = 0;
		const flaky = { ...env.db, all: async <T>(sql: string, p?: unknown[]) => (++calls === 1 ? Promise.reject(new Error("D1 DB is overloaded. Too many requests queued.")) : env.db.all<T>(sql, p as never)) };
		await consumeBatch({ messages: msgs }, flaky);
		expect(msgs.map((m) => [m.acked, m.retried])).toEqual([[false, { delaySeconds: 30 }], [false, { delaySeconds: 30 }], [true, null]]);
		expect([1, 2, 3, 5, 6, 20].map(retryDelay)).toEqual([30, 60, 120, 480, 600, 600]);
	});
});

describe("queue tier: producer", () => {
	const visitBody = { v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/a?utm_source=x&gclid=g1&token=reset-token-value", n: 1, r: "https://www.example.net/x?q=private-search-term" };
	async function capture(settings: Settings, headers: Record<string, string>): Promise<IngestMsg> {
		const sent: IngestMsg[] = [];
		const env = await schemaDb();
		const body = validateIngest(visitBody);
		if (!body) throw new Error("invalid body");
		const q = { send: async (m: unknown) => void sent.push(m as IngestMsg) };
		await recordClientEvent({ db: env.db, kv: env.kv, settings, now: T0, sink: new QueueSink(q, new D1Sink(env.db)) }, body, requestInfo(eventRequest(visitBody, headers)));
		expect(sent).toHaveLength(1);
		return sent[0] as IngestMsg;
	}

	it("a message holds no IP address, no user agent string and no secret setting, and is plain JSON", async () => {
		const settings = normalizeSettings({ gscAuth: "oauth", gscClientSecret: "client-secret-value", gscRefreshToken: "refresh-token-value", bingApiKey: "bing-key-value", gscServiceAccount: '{"private_key":"pk-value"}' });
		for (const ip of ["203.0.113.77", "2001:db8:abcd:12::99"]) {
			const msg = await capture(settings, { "cf-connecting-ip": ip, "user-agent": CHROME_UA });
			const text = JSON.stringify(msg);
			expect(JSON.parse(text)).toEqual(msg);
			for (const banned of [ip, "203.0.113", "2001:db8:abcd", CHROME_UA, "Mozilla", "AppleWebKit", "client-secret-value", "refresh-token-value", "bing-key-value", "pk-value", "reset-token-value", "private-search-term"]) expect(text).not.toContain(banned);
			expect((msg as VisitMsg).evt).toMatchObject({ u: "/a?utm_source=x&gclid=g1", r: "https://www.example.net/x" });
			expect(text.length).toBeLessThan(16_384);
			expect(Object.keys((msg as VisitMsg).cfg).sort()).not.toContain("gscClientSecret");
		}
	});

	it("a failing send writes the event directly", async () => {
		const env = await schemaDb();
		const q = new FakeQueue();
		q.fail = true;
		const body = validateIngest(visitBody);
		if (!body) throw new Error("invalid body");
		const out = await recordClientEvent({ db: env.db, kv: env.kv, settings: normalizeSettings({}), now: T0, sink: new QueueSink(q, new D1Sink(env.db)) }, body, requestInfo(eventRequest(visitBody)));
		expect(out).toBe("ok");
		expect(env.count("ca_sessions")).toBe(1);
		// When the direct write fails too, the error reaches the route (503, the client sends it again).
		const broken = { ...env.db, all: () => Promise.reject(new Error("D1 DB is overloaded. Too many requests queued.")), run: () => Promise.reject(new Error("D1 DB is overloaded.")) };
		await expect(new QueueSink(q, new D1Sink(broken)).ingest(queueMessage((await capture(normalizeSettings({}), {})) as IngestMsg))).rejects.toThrow(/overloaded/);
	});

	it("error page counters stay on the direct path", async () => {
		const env = await schemaDb();
		const q = new FakeQueue();
		await new QueueSink(q, new D1Sink(env.db)).ingest({ t: "srv", site: "default", now: T0, tz: "UTC", status: 404, path: "/x", ref: "" });
		expect(q.sent).toHaveLength(0);
		expect(env.count("ca_srv")).toBe(1);
	});

	it("with the small profile's write guard blocked, nothing is sent to the queue (the consumer has no guard)", async () => {
		const env = await schemaDb();
		const q = new FakeQueue();
		const day = new Date(T0 * 1000).toISOString().slice(0, 10);
		await env.kv.set(KV_WRITE_BUDGET, { day, at: T0, visits: 0, pageviews: 0, events: 0, rows: 90_000, limit: 85_000, blocked: true });
		resetWriteGuard();
		const sink = await ingestSink(env.db, normalizeSettings({ ingestTier: "queue", capacityProfile: "small" }), async () => q, { kv: env.kv, profile: "small", tz: "UTC" });
		expect(sink).toBeInstanceOf(QueueSink);
		const settings = normalizeSettings({ ingestTier: "queue", capacityProfile: "small" });
		const body = validateIngest({ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/a", n: 1 });
		if (!body) throw new Error("invalid body");
		expect(await recordClientEvent({ db: env.db, kv: env.kv, settings, now: T0, sink }, body, requestInfo(eventRequest(body)))).toBe("budget_blocked");
		expect(q.sent).toHaveLength(0);
	});

	it("binding detection: a clean null without the Workers module; the tier follows the setting and the binding", async () => {
		await expect(queueBinding()).resolves.toBeNull();
		const env = await schemaDb();
		const q = new FakeQueue();
		const bound = async () => q;
		const none = async () => null;
		expect(await ingestSink(env.db, normalizeSettings({}))).toBeInstanceOf(D1Sink);
		expect(await ingestSink(env.db, normalizeSettings({ ingestTier: "queue" }))).toBeInstanceOf(D1Sink);
		expect(await ingestSink(env.db, normalizeSettings({ ingestTier: "queue" }), bound)).toBeInstanceOf(QueueSink);
		expect(await ingestSink(env.db, normalizeSettings({ ingestTier: "direct" }), bound)).toBeInstanceOf(D1Sink);
		// Postgres: the consumer writes to D1 only, so the queue is never chosen there.
		expect(await ingestSink({ ...env.db, dialect: "postgres" }, normalizeSettings({ ingestTier: "queue" }), bound)).toBeInstanceOf(D1Sink);
		expect(await ingestStatus(normalizeSettings({}), none)).toEqual({ tier: "direct", queueBound: false });
		expect(await ingestStatus(normalizeSettings({}), bound)).toEqual({ tier: "direct", queueBound: true });
		expect(await ingestStatus(normalizeSettings({ ingestTier: "queue" }), none)).toEqual({ tier: "direct", queueBound: false });
		expect(await ingestStatus(normalizeSettings({ ingestTier: "queue" }), bound)).toEqual({ tier: "queue", queueBound: true });
	});

	it("the built package imports under plain Node without the Workers module and finds no binding", () => {
		const script = "const m = await import('./dist/queue.mjs'); const i = await import('./dist/index.mjs'); console.log(JSON.stringify([await m.queueBinding(), typeof m.handleQueue, typeof i.default]));";
		const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
		expect(JSON.parse(out.trim())).toEqual([null, "function", "function"]);
		// The build keeps the dynamic import of the Workers module, unresolved, for the Workers runtime to provide.
		const chunks = readdirSync("dist").filter((f) => f.endsWith(".mjs") && readFileSync(`dist/${f}`, "utf8").includes('import("cloudflare:workers")'));
		expect(chunks).toHaveLength(1);
	});
});

describe("queue tier: consumer over a D1 binding", () => {
	it("handleQueue applies a batch through a D1-shaped binding and acknowledges it", async () => {
		const env = await schemaDb();
		// A D1 binding over the test database: prepare, bind, run with meta.changes, all with results.
		const d1 = {
			prepare: (sql: string) => ({
				bind: (...v: unknown[]) => ({
					run: async () => ({ meta: { changes: (await env.db.run(sql, v as never)).changes } }),
					all: async <T>() => ({ results: await env.db.all<T>(sql, v as never) }),
				}),
			}),
			batch: async () => [],
		};
		const q = new FakeQueue();
		const kv = new MemoryKv();
		const traffic = withEventIds(generateTraffic({ pageviews: 40, seed: 2 }));
		await drive(env.db, kv, traffic, new QueueSink(q, new D1Sink(fromD1(d1))));
		const batch = q.sent.map((m) => message(m));
		await handleQueue({ messages: batch }, { DB: d1 });
		expect(batch.every((m) => m.acked)).toBe(true);
		expect(env.count("ca_sessions")).toBe(traffic.counts.sessions);
		expect((env.raw.prepare("SELECT SUM(pageviews) AS n FROM ca_sessions").get() as { n: number }).n).toBe(traffic.counts.pageviews);
	});
});
