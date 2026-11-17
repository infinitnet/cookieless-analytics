/**
 * Queue ingest tier: page views, events and engagement updates go to a Cloudflare Queue, and a small consumer
 * Worker (`consumer/` in the repository) applies them with the same statements as `D1Sink`. Direct database
 * writes stay the baseline: the tier is used only when the setting selects it and the binding exists, and a
 * failed send writes that event directly, so the tier never loses more than the direct path.
 *
 * Measured on a production Worker: one `send()` takes 30 to 67 ms (median 42 ms), more than one direct write
 * (about 25 ms). The tier does not make a request faster; it absorbs bursts and keeps requests answered while
 * the database is overloaded.
 */
import type { Db, Dialect } from "../db/adapter.js";
import type { DbFor } from "../db/facts.js";
import { INGEST_STATEMENT_MS, pgStatementLimit } from "../db/pg.js";
import { CACHE_ON_MESSAGE, queryCacheOn } from "../db/query-cache.js";
import type { Settings } from "../settings.js";
import { drops } from "./drops.js";
import type { RecordOutcome } from "./recorder.js";
import { D1Sink, type IngestMsg, type IngestSink, type VisitMsg, type WriteGuard, writesBlocked } from "./apply.js";
import type { KvLike } from "./crypto.js";
import type { ResolveConfig } from "./session.js";
import { addDays, dayInZone, lastClosedDay } from "./time.js";
import { allowed, CLICK_IDS, UTM_KEYS } from "./url.js";
import { workerEnv } from "./worker-env.js";

/** Name of the producer binding in the host's wrangler config. */
export const QUEUE_BINDING = "CA_QUEUE";

/** The part of a Cloudflare `Queue` binding this tier uses. */
export interface QueueLike {
	send(body: unknown): Promise<unknown>;
}

let found: Promise<QueueLike | null> | undefined;

/** The queue binding, looked up once per isolate. Null where `cloudflare:workers` does not exist or the binding is missing. */
export function queueBinding(): Promise<QueueLike | null> {
	return (found ??= workerEnv().then((env) => {
		const q = env?.[QUEUE_BINDING] as QueueLike | undefined;
		return typeof q?.send === "function" ? q : null;
	}));
}

export type IngestTier = "direct" | "queue";

/** Active tier, and whether a queue binding exists (the Data page hints at it when unused). Never the queue on Postgres (`ingestSink`). */
export async function ingestStatus(s: Pick<Settings, "ingestTier">, binding = queueBinding, dialect: Dialect = "sqlite"): Promise<{ tier: IngestTier; queueBound: boolean }> {
	const queueBound = dialect === "sqlite" && (await binding()) !== null;
	return { tier: s.ingestTier === "queue" && queueBound ? "queue" : "direct", queueBound };
}

/**
 * The sink of the selected tier: the queue only when selected and bound and `db` is SQLite (the consumer writes to
 * D1), else the database (behind `guard` when given). A Hyperdrive binding with query caching on refuses every
 * write with `CACHE_ON_MESSAGE` (counted as a drop by the caller).
 */
export async function ingestSink(db: Db, s: Pick<Settings, "ingestTier">, binding = queueBinding, guard?: WriteGuard): Promise<IngestSink> {
	if (await queryCacheOn(db)) return { ingest: async () => Promise.reject(new Error(`cookieless-analytics: ${CACHE_ON_MESSAGE}`)) };
	const direct = new D1Sink(db, guard);
	const q = s.ingestTier === "queue" && db.dialect === "sqlite" ? await binding() : null;
	return q ? new QueueSink(q, direct, guard ? (now) => writesBlocked(db, guard, now) : undefined) : direct;
}

/**
 * The sink of one request with site routing: each event goes to its site's database (one sink per database),
 * behind that database's write guard (state under its KV prefix). A missing binding rejects the event; it is
 * never written to another database. Postgres statements of an event (schema check and probe included) are limited
 * to `INGEST_STATEMENT_MS`.
 */
export function routedSink(dbFor: DbFor, s: Pick<Settings, "ingestTier" | "capacityProfile" | "siteTimezone">, kv: KvLike, binding = queueBinding): IngestSink {
	const sinks = new Map<string, Promise<IngestSink>>();
	return {
		ingest(m) {
			return pgStatementLimit(INGEST_STATEMENT_MS, async () => {
				const key = dbFor.binding(m.site) ?? "";
				let p = sinks.get(key);
				if (!p) sinks.set(key, (p = dbFor(m.site).then((d) => ingestSink(d, s, binding, { kv: dbFor.kv(kv, m.site), profile: s.capacityProfile, tz: s.siteTimezone, key }))));
				return (await p).ingest(m);
			});
		},
	};
}

// The session rules read only these settings. Everything else (secrets included) never enters a message.
const RESOLVE_KEYS = [
	"sessionWindowMinutes", "maxSessionMinutes", "saltTimezone", "saltRotationHour", "siteTimezone", "ignoreReferrerHosts", "queryAllowlist",
	"reloadDedupeSeconds", "maxPageviewsPerSession", "maxEventsPerSession", "channelRules", "hosts",
] as const satisfies readonly (keyof ResolveConfig)[];

const KEPT_PARAMS: readonly string[] = [...UTM_KEYS, ...CLICK_IDS];

/** Page URL as the session rules read it: the path plus the allowlisted, campaign and click id parameters. */
function pageUrl(u: string, allowlist: readonly string[]): string {
	try {
		const url = new URL(u, "https://x.invalid");
		for (const k of [...url.searchParams.keys()]) if (!KEPT_PARAMS.includes(k.toLowerCase()) && !allowed(k.toLowerCase(), allowlist)) url.searchParams.delete(k);
		return url.pathname + url.search;
	} catch {
		return "/";
	}
}

/** Referrer as the session rules read it: scheme, host and path. */
function referrer(r: string): string | undefined {
	try {
		const url = new URL(r);
		return `${url.protocol}//${url.host}${url.pathname}`;
	} catch {
		return undefined;
	}
}

/**
 * The message as queued, holding only what the session rules read: the settings they use (never a secret), the
 * page URL without parameters that are not stored, and the referrer without its query.
 */
export function queueMessage(m: IngestMsg): IngestMsg {
	if (m.t !== "pv" && m.t !== "ev") return m;
	const cfg = Object.fromEntries(RESOLVE_KEYS.filter((k) => m.cfg[k] !== undefined).map((k) => [k, m.cfg[k]])) as ResolveConfig;
	const evt = { ...m.evt };
	if (evt.u !== undefined) evt.u = pageUrl(evt.u, cfg.queryAllowlist);
	if (evt.r) evt.r = referrer(evt.r);
	if (evt.r === undefined) delete evt.r;
	return { ...m, cfg, evt } satisfies VisitMsg;
}

/** Sends to the queue; a failed send writes the event through `direct` instead. The write guard is checked before the send (the consumer has none). */
export class QueueSink implements IngestSink {
	constructor(
		private queue: QueueLike,
		private direct: IngestSink,
		private blocked?: (now: number) => Promise<boolean>,
	) {}

	async ingest(m: IngestMsg): Promise<RecordOutcome> {
		// Error page counters add 1 per message, so a redelivered message would count twice: they stay direct.
		if (m.t === "srv") return this.direct.ingest(m);
		if (this.blocked && (await this.blocked(m.now))) return "budget_blocked";
		try {
			await this.queue.send(queueMessage(m));
			return "ok";
		} catch {
			return this.direct.ingest(m);
		}
	}
}

// ── consumer ──────────────────────────────────────────────────────────────────

/** The parts of a Cloudflare queue `Message` the consumer uses. */
export interface QueuedMessage {
	readonly body: unknown;
	readonly timestamp: Date;
	readonly attempts: number;
	ack(): void;
	retry(options?: { delaySeconds?: number }): void;
}

/** Backoff after a failed write: 30 s, doubling, at most 10 minutes, so with the 20 retries of the consumer config a database outage of about 2.5 hours is ridden out. */
export const retryDelay = (attempts: number) => Math.min(600, 30 * 2 ** Math.max(0, attempts - 1));

/** An engagement update whose visit is not written yet (its page view is still queued) is retried this often. */
export const ORPHAN_ATTEMPTS = 3;
const ORPHAN_DELAY_S = 30;

const tokens = (m: IngestMsg): string[] => (m.t === "srv" ? [] : m.t === "en" ? [m.sid] : [...(m.sid ? [m.sid] : []), ...Object.values(m.keys)]);

/**
 * Messages in send order (event time, then queue time), split into groups that cannot touch the same visit: a
 * group joins every message sharing a sid or a visitor key. Groups run in parallel, a group in order, so a
 * redelivered or reordered batch gives the tables the direct path gives.
 */
export function visitorGroups<M extends QueuedMessage>(messages: readonly M[]): M[][] {
	const sorted = [...messages].sort((a, b) => (a.body as IngestMsg).now - (b.body as IngestMsg).now || a.timestamp.getTime() - b.timestamp.getTime());
	const parent = sorted.map((_, i) => i);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i] as number)));
	const owner = new Map<string, number>();
	sorted.forEach((m, i) => {
		for (const t of tokens(m.body as IngestMsg)) {
			const j = owner.get(t);
			if (j === undefined) owner.set(t, i);
			else parent[find(i)] = find(j);
		}
	});
	const groups = new Map<number, M[]>();
	sorted.forEach((m, i) => {
		const g = groups.get(find(i)) ?? [];
		g.push(m);
		groups.set(find(i), g);
	});
	return [...groups.values()];
}

/**
 * A page view, event or engagement update reaches visits started on its own day or the day before. Once that day
 * before is closed (its summary stored, `lastClosedDay`), applying the message could change a stored day, so a
 * message delayed that long (past 00:15 of the day after its own, by a backlog or an outage) is not written.
 */
export function late(m: IngestMsg, now: number): boolean {
	if (m.t === "srv") return false;
	const tz = "cfg" in m ? m.cfg.siteTimezone : m.tz;
	return addDays(dayInZone(m.now, tz), -1) <= lastClosedDay(now, tz);
}

/**
 * Consumer: applies one queue batch through `D1Sink`. Every statement is keyed by the entry id, so a redelivered
 * message changes nothing. A failing message is retried with the rest of its group (order kept); drops are
 * counted as on the direct path.
 */
export async function consumeBatch(batch: { readonly messages: readonly QueuedMessage[] }, db: Db, kv?: KvLike): Promise<void> {
	const sink = new D1Sink(db);
	const dropped: Array<[string, string, Exclude<RecordOutcome, "ok"> | "late_after_close"]> = [];
	await Promise.all(
		visitorGroups(batch.messages).map(async (group) => {
			for (const [i, msg] of group.entries()) {
				const m = msg.body as IngestMsg;
				let out: RecordOutcome | "late_after_close";
				try {
					out = late(m, Date.now() / 1000) ? "late_after_close" : await sink.ingest(m);
				} catch {
					for (const rest of group.slice(i)) rest.retry({ delaySeconds: retryDelay(rest.attempts) });
					return;
				}
				if (out === "orphan_update" && msg.attempts < ORPHAN_ATTEMPTS) {
					msg.retry({ delaySeconds: ORPHAN_DELAY_S });
					continue;
				}
				msg.ack();
				// Count once: a redelivered message would count its drop again (an orphan only counts on its last attempt).
				if (out !== "ok" && (msg.attempts === 1 || out === "orphan_update")) dropped.push([m.site, dayInZone(m.now, "cfg" in m ? m.cfg.siteTimezone : m.tz), out]);
			}
		}),
	);
	// Drops go to the isolate counters and are flushed once per batch (one statement); a failed flush keeps them.
	for (const [site, day, reason] of dropped) drops.add(site, day, reason);
	if (dropped.length) await drops.flush(db).catch(() => {});
}
