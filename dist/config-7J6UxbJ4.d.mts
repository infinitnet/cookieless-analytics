import { z } from "zod";
//#region src/core/crypto.d.ts
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
//#endregion
//#region src/db/sql.d.ts
type Param = string | number | bigint | boolean | null | Uint8Array;
interface Stmt {
  sql: string;
  params?: Param[];
}
//#endregion
//#region src/db/adapter.d.ts
type Dialect = "sqlite" | "postgres";
/** The about 15 statement shapes this plugin needs, over any EmDash database. */
interface Db {
  readonly dialect: Dialect;
  run(sql: string, params?: Param[]): Promise<{
    changes: number;
  }>;
  all<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
  /** Runs statements in order. Not atomic through Kysely (a sequential loop); one atomic round trip over a raw D1 binding (`d1.ts`). */
  batch(stmts: readonly Stmt[]): Promise<void>;
  /** D1 meta of the last statement; only a `Db` over a raw D1 binding has it (`d1.ts`). */
  readonly meta?: DbMeta;
  /** Live size: D1 from `size_after`, Postgres from the catalog. Absent where the engine cannot tell (Kysely over SQLite). */
  size?(): Promise<SizeInfo | null>;
}
/** Bytes of the whole database, and on Postgres of each analytics table (indexes and TOAST included). */
interface SizeInfo {
  bytes: number;
  tables?: Readonly<Record<string, number>>;
}
/** The D1 result meta fields this package reads. */
interface DbMeta {
  changes?: number;
  rows_read?: number;
  rows_written?: number;
  /** Size of the whole database file in bytes after the statement. */
  size_after?: number;
}
//#endregion
//#region src/multisite/config.d.ts
interface RemoteSite {
  id: string;
  label: string;
  /** `https://host[:port]`, no path. */
  origin: string;
  /** Name of the env var that holds the satellite's API key. */
  keyEnv: string;
}
/**
 * `d1` (default) or `postgres`. `postgres` loads the runtime entry with the node-postgres driver, so the bindings
 * may be Hyperdrive bindings; the kind of each binding (D1 or Hyperdrive) is detected at runtime.
 */
type Engine = "d1" | "postgres";
/** Own database for the analytics tables: the name of a D1 or Hyperdrive binding of the host Worker. */
interface DatabaseOption {
  binding: string;
  engine?: Engine;
}
/** Site routing: each listed site's analytics tables in its own binding; the others in `default` (absent: the host database). */
interface DatabasesOption {
  default?: string;
  sites: Record<string, string>;
  engine?: Engine;
}
interface PluginOptions {
  sites?: RemoteSite[];
  database?: DatabaseOption;
  databases?: DatabasesOption;
}
//#endregion
export { Db as a, RemoteSite as i, DatabasesOption as n, DbMeta as o, PluginOptions as r, KvLike as s, DatabaseOption as t };