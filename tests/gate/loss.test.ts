/**
 * The loss test. Generator traffic (with client event ids and orders) goes through the real `in`
 * route over a fault-injecting database: overload errors, stalls, and a kill after any statement, with five
 * isolates interleaved (each isolate is its own module instance, so a killed one loses what it held in memory).
 * The page script's retry rule is simulated (page views and events: 3 retries on a network failure or a 503 with
 * `Retry-After`; engagement: one beacon, no retry). The same is done for the queue tier: the producer route with
 * failing sends, then hostile delivery (every batch twice, shuffled, retries late) to consumers over a faulty
 * database whose kills fail the whole invocation (the runtime then redelivers the batch).
 *
 * After recovery the stored entries, counters and orders are compared with a fault-free sequential run. Every
 * page view or event that is missing must be explained by its own fate (refused and counted, or lost with an
 * isolate that was killed), never by a 204 that stored nothing; nothing may be stored twice.
 */
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { Traffic, TrafficAction } from "../capacity.helpers.js";
import { rng } from "../capacity.helpers.js";
import { eventRequest, MemoryKv, schemaDb } from "../helpers.js";
import { ctx } from "../routes.helpers.js";
import { type Dump, dumpTables, type FaultStats, type Faults, faultDb, gateTraffic, gateWrite, type Life, NO_FAULTS } from "./gate.helpers.js";
import { normalizeSettings } from "../../src/settings.js";
import type { QueuedMessage } from "../../src/core/queue-sink.js";
import { orderHitId } from "../../src/core/recorder.js";

type Env = Awaited<ReturnType<typeof schemaDb>>;
const SETTINGS = normalizeSettings({});
/** The page script's retry delays (seconds, before jitter). */
const RETRY_S = [5, 15, 45];

/** One simulated isolate: its own module instances (drop counters, rate counters, caches) and its own life. */
async function isolate() {
	vi.resetModules();
	const [route, dropsM, apply, queue] = await Promise.all([import("../../src/routes/in.js"), import("../../src/core/drops.js"), import("../../src/core/apply.js"), import("../../src/core/queue-sink.js")]);
	dropsM.drops.windowMs = 0;
	return { route, drops: dropsM.drops, apply, queue, life: { dead: false } as Life };
}
type Isolate = Awaited<ReturnType<typeof isolate>>;

interface Item {
	a: TrafficAction;
	kind: "pv" | "ev" | "en";
	/** Entry key the action writes (`h`, `e<h>`) or, for engagement, updates. */
	key: string;
	attempts: number;
	fate: "pending" | "acked" | "refused" | "killed";
	statuses: number[];
	/** Drop reasons the isolate counted while handling this action (its own `drops.add` calls). */
	reasons: string[];
}

/** Entry key of an action: the page view's `h`, `e<h>` for an event, the order hit id for an order with an id. */
const keyOf = async (a: TrafficAction) =>
	a.body.t === "ev" ? (a.body.oid && a.body.val !== undefined ? await orderHitId("default", String(a.body.name), String(a.body.oid)) : `e${String(a.body.h)}`) : String(a.body.h);

interface Producer {
	isolates: number;
	faults: Faults;
	seed: number;
	/** Queue tier: the sink of each request, built from the isolate's modules over its faulty database. */
	sink?: (iso: Isolate, db: Env["db"]) => import("../../src/core/apply.js").IngestSink;
}

/**
 * The route under faults: a time-ordered queue of requests, `isolates` workers each taking the earliest one.
 * A killed isolate's response is lost (the client sees a network failure) and its `after()` work and memory go
 * with it; a fresh isolate takes its place.
 */
async function produce(env: Env, kv: MemoryKv, traffic: Traffic, p: Producer) {
	const r = rng(p.seed);
	const stats: FaultStats = { statements: 0, overloads: 0, kills: 0, stalls: 0 };
	const items: Item[] = await Promise.all(traffic.actions.map(async (a) => ({ a, kind: a.body.t as Item["kind"], key: await keyOf(a), attempts: 0, fate: "pending" as const, statuses: [], reasons: [] })));
	const queue: Array<{ at: number; item: Item }> = items.map((item) => ({ at: item.a.at, item })).sort((x, y) => x.at - y.at);
	/** Keep the queue in time order: a retry goes after every request due before it. */
	const later = (at: number, item: Item) => {
		const i = queue.findIndex((x) => x.at > at);
		queue.splice(i < 0 ? queue.length : i, 0, { at, item });
	};
	const live: Isolate[] = [];
	let replaced = 0;
	/** Requests in flight. A request starts only when none older than one second is still running: requests close in time overlap, requests seconds apart do not (one takes tens of milliseconds). */
	const inflight = new Set<{ at: number }>();
	const current = new Map<Isolate, Item>();
	const fresh = async () => {
		const iso = await isolate();
		const add = iso.drops.add.bind(iso.drops);
		iso.drops.add = (site, day, reason) => (current.get(iso)?.reasons.push(reason), add(site, day, reason));
		return iso;
	};
	const worker = async (w: number) => {
		for (;;) {
			const head = queue[0];
			if (!head) return;
			if ([...inflight].some((j) => j.at < head.at - 1)) {
				await new Promise((res) => setTimeout(res, 0));
				continue;
			}
			const job = queue.shift() as (typeof queue)[number];
			inflight.add(job);
			try {
				await handle(w, job);
			} finally {
				inflight.delete(job);
			}
		}
	};
	const handle = async (w: number, job: (typeof queue)[number]) => {
		{
			let iso = live[w] ?? (live[w] = await fresh());
			current.set(iso, job.item);
			const db = faultDb(env.db, p.faults, r, iso.life, stats);
			const tasks: Array<() => Promise<unknown>> = [];
			const routeEnv = { deps: async () => ({ db, kv, settings: SETTINGS, now: job.at, ...(p.sink ? { sink: p.sink(iso, db) } : {}) }), after: (fn: () => Promise<unknown>) => void tasks.push(fn) };
			const { item } = job;
			item.attempts++;
			const req = eventRequest(item.a.body, { "cf-connecting-ip": item.a.ip }, item.a.url);
			const res = (await iso.route.inRoute(routeEnv).handler({ ...ctx(req, await req.clone().text(), kv), requestMeta: { ip: item.a.ip } })) as { status: number; headers?: Record<string, string> };
			if (!iso.life.dead) for (const t of tasks.splice(0)) await t().catch(() => {});
			if (iso.life.dead) {
				// Killed before the response or inside `after()`: the client saw no answer; the isolate is gone.
				item.statuses.push(0);
				item.fate = "killed";
				live[w] = await fresh();
				replaced++;
				iso = live[w] as Isolate;
				if (item.kind !== "en" && item.attempts <= RETRY_S.length) later(job.at + (RETRY_S[item.attempts - 1] as number), item);
				return;
			}
			item.statuses.push(res.status);
			const retryAfter = res.status === 503 && !!res.headers?.["retry-after"];
			if (retryAfter && item.kind !== "en" && item.attempts <= RETRY_S.length) {
				item.fate = "refused";
				later(job.at + Math.max(Number(res.headers?.["retry-after"]), RETRY_S[item.attempts - 1] as number), item);
			} else item.fate = res.status === 503 ? "refused" : "acked";
		}
	};
	await Promise.all(Array.from({ length: p.isolates }, (_, w) => worker(w)));
	// The cron hook flushes what the live isolates still count; the killed ones' counts are gone (lower bound).
	for (const iso of live) await iso.drops.flush(env.db);
	return { items, stats, replaced };
}

/** Hostile delivery of what the producers sent, to consumer isolates over a faulty database (unlimited redelivery up to the 20 retries of the consumer config). */
async function consume(env: Env, sent: Array<{ body: unknown; timestamp: Date }>, faults: Faults, seed: number) {
	const r = rng(seed);
	const stats: FaultStats = { statements: 0, overloads: 0, kills: 0, stalls: 0 };
	const shuffle = <T>(xs: T[]) => {
		for (let i = xs.length - 1; i > 0; i--) {
			const j = Math.floor(r() * (i + 1));
			[xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
		}
		return xs;
	};
	let pending = sent.map((m) => ({ ...m, attempts: 1 }));
	let batches = 0;
	let invocationsKilled = 0;
	const dead: unknown[] = [];
	while (pending.length) {
		const chunks: (typeof pending)[] = [];
		for (let i = 0; i < pending.length; i += 100) chunks.push(pending.slice(i, i + 100));
		// Batch i, then batch i - 1 again (a duplicate delivery); the last batch's duplicate at the end.
		const plan: Array<[number, boolean]> = chunks.flatMap((_, i): Array<[number, boolean]> => (i ? [[i, false], [i - 1, true]] : [[i, false]]));
		plan.push([chunks.length - 1, true]);
		const next: typeof pending = [];
		for (const [ci, dup] of plan) {
			const iso = await isolate();
			const db = faultDb(env.db, faults, r, iso.life, stats);
			const msgs = shuffle((chunks[ci] ?? []).map((m) => {
				const q: QueuedMessage & { acked: boolean; retried: boolean } = { body: structuredClone(m.body), timestamp: m.timestamp, attempts: m.attempts, acked: false, retried: false, ack() { this.acked = true; }, retry() { this.retried = true; } };
				return { m, q };
			}));
			await iso.queue.consumeBatch({ messages: msgs.map((x) => x.q) }, db).catch(() => {});
			batches++;
			if (dup) continue;
			// A killed invocation acknowledges nothing: the runtime delivers the whole batch again.
			if (iso.life.dead) invocationsKilled++;
			for (const { m, q } of msgs)
				if (iso.life.dead || q.retried || !q.acked) {
					if (m.attempts > 20) dead.push(m.body);
					else next.push({ ...m, attempts: m.attempts + 1 });
				}
		}
		pending = next;
	}
	return { stats, batches, invocationsKilled, deadLetter: dead.length };
}

interface Verdict {
	missing: Array<{ key: string; kind: string; fate: string; statuses: number[] }>;
	unexplained: string[];
	extra: string[];
	duplicates: string[];
	counterMismatch: string[];
	engagementDiff: number;
	engagementUnexplained: string[];
	visitShapeDiff: number;
	ordersMissing: string[];
	ordersChanged: string[];
	ordersWithoutEntry: string[];
}

/**
 * Compare a run with the fault-free reference. A missing page view or event is explained when its own requests
 * were refused (503) or lost with a killed isolate on every attempt; an engagement difference when one of the
 * updates of that page view was lost or refused. Everything else is unexplained.
 */
function compare(ref: Dump, got: Dump, items: readonly Item[] | null): Verdict {
	const byKey = new Map<string, Item[]>();
	for (const it of items ?? []) byKey.set(`default|${it.key}`, [...(byKey.get(`default|${it.key}`) ?? []), it]);
	const v: Verdict = { missing: [], unexplained: [], extra: [], duplicates: got.dup, counterMismatch: [], engagementDiff: 0, engagementUnexplained: [], visitShapeDiff: 0, ordersMissing: [], ordersChanged: [], ordersWithoutEntry: [] };
	const gotEvents = new Map(got.events.map((e) => [String(e.id), e]));
	for (const [k, e] of ref.entries) {
		const g = got.entries.get(k);
		const own = (byKey.get(k) ?? []).filter((x) => x.kind !== "en");
		if (!g) {
			const fate = own.map((x) => x.fate).join(",") || "none";
			v.missing.push({ key: k, kind: e.kind, fate, statuses: own.flatMap((x) => x.statuses) });
			// An order whose row was stored while its document write was lost: the retry is a `duplicate_order`.
			if (e.name === "purchase" && own.some((x) => x.statuses.includes(204) || x.fate === "acked")) v.ordersWithoutEntry.push(k);
			else if (items && !own.every((x) => x.fate === "refused" || x.fate === "killed")) v.unexplained.push(k);
			else if (!items) v.unexplained.push(k);
			continue;
		}
		if (g.path !== e.path || g.name !== e.name || g.props !== e.props) v.unexplained.push(`${k} changed`);
		if (g.d !== e.d || g.e !== e.e || g.s !== e.s || g.x !== e.x) {
			v.engagementDiff++;
			const ens = (byKey.get(k) ?? []).filter((x) => x.kind === "en");
			if (!items || !ens.some((x) => x.fate !== "acked" || x.statuses.includes(503) || x.reasons.length)) v.engagementUnexplained.push(k);
		}
	}
	for (const k of got.entries.keys()) if (!ref.entries.has(k)) v.extra.push(k);
	// Each visit's counters match its own entries (one statement per event keeps them atomic).
	for (const vis of got.visits) {
		const es = Object.values(vis.hits).filter((e) => e.t !== undefined);
		const pv = es.filter((e) => e.n === undefined).length;
		if (pv !== Number(vis.pageviews) || es.length - pv > Number(vis.events)) v.counterMismatch.push(`${String(vis.sid)} pv ${pv}/${String(vis.pageviews)} ev ${es.length - pv}/${String(vis.events)}`);
	}
	// Visits as sets of entries: a different start, entry or exit page comes from delivery order.
	const shape = (d: Dump) => new Map([...d.visits].map((x) => [Object.keys(x.hits).sort().join(","), `${String(x.entry_path)}>${String(x.exit_path)}|${String(Number(x.last_seen) - Number(x.started))}`]));
	const a = shape(ref);
	const b = shape(got);
	for (const [k, s] of a) if (b.get(k) !== s) v.visitShapeDiff++;
	for (const o of ref.events) {
		const g = gotEvents.get(String(o.id));
		if (!g) v.ordersMissing.push(String(o.id));
		else if (g.val !== o.val || g.cur !== o.cur || g.day !== o.day) v.ordersChanged.push(String(o.id));
	}
	return v;
}

const summary = (label: string, v: Verdict, extra: Record<string, unknown>) => ({
	label,
	...extra,
	missingEntries: v.missing.length,
	missingByFate: v.missing.reduce<Record<string, number>>((m, x) => ((m[`${x.kind}:${x.fate}`] = (m[`${x.kind}:${x.fate}`] ?? 0) + 1), m), {}),
	unexplained: v.unexplained.length,
	extra: v.extra.length,
	duplicates: v.duplicates.length,
	counterMismatch: v.counterMismatch.length,
	engagementDiff: v.engagementDiff,
	engagementUnexplained: v.engagementUnexplained.length,
	visitShapeDiff: v.visitShapeDiff,
	ordersMissing: v.ordersMissing.length,
	ordersChanged: v.ordersChanged.length,
	ordersWithoutEntry: v.ordersWithoutEntry.length,
});

const FAULTS: Faults = { overload: 0.04, kill: 0.01, stall: 0.2 };
const results: Array<Record<string, unknown>> = [];

describe("gate: loss under faults", () => {
	const traffic = gateTraffic({ pageviews: 1200, seed: 31, orderEvery: 8, spanSeconds: 4 * 3600 });
	let ref: Dump;
	let kv: MemoryKv;

	it("fault-free sequential run: the reference", async () => {
		kv = new MemoryKv(); // shared by every run: the same daily salts, so the same visitor keys
		const env = await schemaDb();
		const run = await produce(env, kv, traffic, { isolates: 1, faults: NO_FAULTS, seed: 1 });
		ref = dumpTables(env.raw);
		expect(run.items.every((x) => x.fate === "acked")).toBe(true);
		expect(ref.entries.size).toBeGreaterThan(1400);
		expect(ref.events.length).toBeGreaterThan(20);
		results.push({ label: "reference", entries: ref.entries.size, visits: ref.visits.length, orders: ref.events.length, drops: ref.drops });
	}, 120_000);

	it("five interleaved isolates without faults store the same entries, counters and orders", async () => {
		const env = await schemaDb();
		await produce(env, kv, traffic, { isolates: 5, faults: { ...NO_FAULTS, stall: 0.2 }, seed: 2 });
		const v = compare(ref, dumpTables(env.raw), null);
		results.push(summary("direct, 5 isolates, stalls only", v, {}));
		expect(v.missing).toEqual([]);
		expect(v.extra).toEqual([]);
		expect(v.duplicates).toEqual([]);
		expect(v.counterMismatch).toEqual([]);
		expect(v.ordersMissing.concat(v.ordersChanged)).toEqual([]);
	}, 120_000);

	it("direct path with overload errors, stalls and kills: every missing event is refused or killed, nothing is stored twice", async () => {
		const env = await schemaDb();
		const run = await produce(env, kv, traffic, { isolates: 5, faults: FAULTS, seed: 3 });
		const got = dumpTables(env.raw);
		const v = compare(ref, got, run.items);
		const refused = run.items.filter((x) => x.kind !== "en" && x.fate === "refused").length;
		const counted = (got.drops.overload ?? 0) + (got.drops.write_error ?? 0);
		results.push(summary("direct, 5 isolates, faults", v, { faults: FAULTS, stats: run.stats, isolatesReplaced: run.replaced, refusedFinal: refused, killedFinal: run.items.filter((x) => x.fate === "killed").length, dropsStored: got.drops }));
		expect(run.stats.kills).toBeGreaterThan(5);
		expect(run.stats.overloads).toBeGreaterThan(20);
		expect(v.unexplained).toEqual([]);
		expect(v.extra).toEqual([]);
		expect(v.duplicates).toEqual([]);
		expect(v.counterMismatch).toEqual([]);
		expect(v.engagementUnexplained).toEqual([]);
		// Every refusal the route answered was counted (live isolates; a killed isolate's counts are a known lower bound).
		expect(counted).toBeGreaterThanOrEqual(v.missing.filter((m) => m.fate.split(",").every((f) => f === "refused")).length);
		expect(v.ordersChanged).toEqual([]);
		// Orders are never lost unless every attempt was refused or killed.
		for (const id of v.ordersMissing) expect(run.items.find((x) => keyOf(x.a) === `e${id.replace(/^.*\|/, "")}`)?.fate ?? "refused").not.toBe("acked");
	}, 300_000);

	it("queue tier: failing sends fall back, hostile delivery to faulty consumers equals the reference", async () => {
		// The consumer refuses messages applied after the close of their reach: deliver on the day of the traffic.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.parse("2026-06-10T12:00:00Z"));
		onTestFinished(() => vi.useRealTimers());
		const env = await schemaDb();
		const sent: Array<{ body: unknown; timestamp: Date }> = [];
		const r = rng(77);
		let failedSends = 0;
		const q = {
			async send(body: unknown) {
				if (r() < 0.05) {
					failedSends++;
					throw new Error("Queue send failed");
				}
				sent.push({ body: JSON.parse(JSON.stringify(body)), timestamp: new Date(sent.length) });
			},
		};
		const prod = await produce(env, kv, traffic, { isolates: 5, faults: { overload: 0.04, kill: 0.01, stall: 0.2 }, seed: 4, sink: (iso, db) => new iso.queue.QueueSink(q, new iso.apply.D1Sink(db)) });
		// A kill fails the whole invocation (about 600 statements for 100 messages), so 0.1 percent per statement already kills about half the batches.
		const cons = await consume(env, sent, { overload: 0.03, kill: 0.001, stall: 0.2 }, 5);
		const got = dumpTables(env.raw);
		const v = compare(ref, got, prod.items);
		results.push(summary("queue tier, faults on both sides", v, { sent: sent.length, failedSends, producerStats: prod.stats, consumerStats: cons.stats, batches: cons.batches, invocationsKilled: cons.invocationsKilled, deadLetter: cons.deadLetter, dropsStored: got.drops }));
		expect(cons.deadLetter).toBe(0);
		expect(cons.invocationsKilled).toBeGreaterThan(0);
		expect(v.extra).toEqual([]);
		expect(v.duplicates).toEqual([]);
		expect(v.counterMismatch).toEqual([]);
		expect(v.ordersChanged).toEqual([]);
		// Missing entries must be explained by the producer side (refused or killed on every attempt), or be
		// the known order case; anything else would be a message the consumer lost.
		expect(v.unexplained).toEqual([]);
		gateWrite("loss.json", `${JSON.stringify(results, null, 1)}\n`);
		gateWrite("loss-detail.json", `${JSON.stringify({ missing: v.missing, ordersWithoutEntry: v.ordersWithoutEntry, engagementUnexplained: v.engagementUnexplained }, null, 1)}\n`);
		process.stdout.write(`[gate loss] ${JSON.stringify(results.map((x) => ({ ...x, stats: undefined })))}\n`);
	}, 300_000);
});
