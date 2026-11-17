import { PLUGIN_ID, VERSION } from "./contract.mjs";
import { tn as usePgDriver } from "./queue-sink-CENHpQGt.mjs";
import "./rollup-BfzZghBT.mjs";
import "./middleware-core-DxaGZCZq.mjs";
import "./proxy-BhRF9H5N.mjs";
import "./rollup-DyHG9hKu.mjs";
import "./config-CH-S7WdJ.mjs";
import { ADMIN_PAGES, ADMIN_WIDGETS, ALLOWED_HOSTS, CAPABILITIES, CRON_JOBS, CRON_TIMEOUT_MS, HEAVY_JOBS, KV_CRON_OWED, PLUGIN_LABELS, SAME_INVOCATION_MS, STORAGE, TURN_REQUESTS, cookielessAnalytics, createPlugin, cronDispatcher, ensureCron, resetCronTurns } from "./index.mjs";
import { Client } from "pg";

//#region src/postgres.ts
/**
* Runtime entry for the analytics tables on Postgres (plugin option `engine: "postgres"`): the default entry plus
* the node-postgres driver. Requires `pg` in the site (`pnpm add pg`) and a Hyperdrive binding.
*/
usePgDriver((connectionString) => new Client({
	connectionString,
	connectionTimeoutMillis: 5e3,
	query_timeout: 15e3
}));

//#endregion
export { ADMIN_PAGES, ADMIN_WIDGETS, ALLOWED_HOSTS, CAPABILITIES, CRON_JOBS, CRON_TIMEOUT_MS, HEAVY_JOBS, KV_CRON_OWED, PLUGIN_ID, PLUGIN_LABELS, SAME_INVOCATION_MS, STORAGE, TURN_REQUESTS, VERSION, cookielessAnalytics, cookielessAnalytics as default, createPlugin, cronDispatcher, ensureCron, resetCronTurns };