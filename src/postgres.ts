/**
 * Runtime entry for the analytics tables on Postgres (plugin option `engine: "postgres"`): the default entry plus
 * the node-postgres driver. Requires `pg` in the site (`pnpm add pg`) and a Hyperdrive binding.
 */
// @ts-expect-error `pg` ships no type declarations; only `Client` is used, through the `PgDriver` shape below.
import { Client } from "pg";
import { type PgClient, usePgDriver } from "./db/pg.js";

// Short timeouts: a cold or down database fails a statement in seconds instead of holding the request. The ingest
// path limits its statements further (`INGEST_STATEMENT_MS`); after a timeout the adapter refuses for a while without connecting.
usePgDriver((connectionString): PgClient => new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 15000 }));

export * from "./index.js";
export { default } from "./index.js";
