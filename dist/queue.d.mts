import { a as Db, n as DatabasesOption, o as DbMeta, t as DatabaseOption } from "./config-C1DAdsvs.mjs";
/** Web Crypto helpers: ids, HMAC, IP truncation, visitor key, daily salts. */
/** Structural subset of the host `ctx.kv` (KVAccess) used by this plugin. */
interface KvLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<Array<{
    key: string;
    value: unknown;
  }>>;
  compareAndSet(key: string, expectedRevision: string | null, value: unknown): Promise<{
    applied: boolean;
  }>;
}
/** Name of the producer binding in the host's wrangler config. */
export declare const QUEUE_BINDING = "CA_QUEUE";
/** The part of a Cloudflare `Queue` binding this tier uses. */
interface QueueLike {
  send(body: unknown): Promise<unknown>;
}
/** The queue binding, looked up once per isolate. Null where `cloudflare:workers` does not exist or the binding is missing. */
export declare function queueBinding(): Promise<QueueLike | null>;
/** The parts of a Cloudflare queue `Message` the consumer uses. */
interface QueuedMessage {
  readonly body: unknown;
  readonly timestamp: Date;
  readonly attempts: number;
  ack(): void;
  retry(options?: {
    delaySeconds?: number;
  }): void;
}
/** An engagement update whose visit is not written yet (its page view is still queued) is retried this often. */
export declare const ORPHAN_ATTEMPTS = 3;
/**
 * Messages in send order (event time, then queue time), split into groups that cannot touch the same visit: a
 * group joins every message sharing a sid or a visitor key. Groups run in parallel, a group in order, so a
 * redelivered or reordered batch gives the tables the direct path gives.
 */
export declare function visitorGroups<M extends QueuedMessage>(messages: readonly M[]): M[][];
/**
 * Consumer: applies one queue batch through `D1Sink`. Every statement is keyed by the entry id, so a redelivered
 * message changes nothing. A failing message is retried with the rest of its group (order kept); drops are
 * counted as on the direct path.
 */
export declare function consumeBatch(batch: {
  readonly messages: readonly QueuedMessage[];
}, db: Db, kv?: KvLike): Promise<void>;
interface D1Result<T = unknown> {
  results?: T[];
  meta?: DbMeta;
}
interface D1Bound {
  run(): Promise<D1Result>;
  all<T>(): Promise<D1Result<T>>;
}
/** The part of a D1 binding this package uses. */
interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): D1Bound;
  };
  batch(statements: D1Bound[]): Promise<unknown>;
}
export declare function fromD1(d1: D1Like): Db;
/**
 * The consumer's `queue` handler. The analytics tables are in the D1 binding `DB`, or, with the same `database`
 * or `databases` option the site passes to the plugin, in those bindings: each message goes to its site's
 * database. A missing binding retries that site's messages; they are never written to another database.
 */
export declare function handleQueue(batch: {
  readonly messages: readonly QueuedMessage[];
}, env: object, options?: {
  database?: DatabaseOption;
  databases?: DatabasesOption;
}): Promise<void>;
export type { D1Like, QueuedMessage };