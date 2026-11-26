import { di as usePgDriver } from "./queue-sink-CaP3WkIr.mjs";
import { PLUGIN_ID, VERSION } from "./contract.mjs";
import { _ as resetCronTurns, a as CRON_JOBS, c as KV_CRON_OWED, d as STORAGE, f as TURN_REQUESTS, g as ensureCron, h as cronDispatcher, i as CAPABILITIES, l as PLUGIN_LABELS, m as createPlugin, n as ADMIN_WIDGETS, o as CRON_TIMEOUT_MS, p as cookielessAnalytics, r as ALLOWED_HOSTS, s as HEAVY_JOBS, t as ADMIN_PAGES, u as SAME_INVOCATION_MS } from "./src-B5eCjns-.mjs";
import { Client } from "pg";
// src/postgres.ts
/**
* Runtime entry for the analytics tables on Postgres (plugin option `engine: "postgres"`): the default entry plus
* the node-postgres driver. Requires `pg` in the site (`pnpm add pg`) and a Hyperdrive binding.
*/
usePgDriver((connectionString) => new Client({
	connectionString,
	connectionTimeoutMillis: 5e3,
	query_timeout: 15e3
}));
export { ADMIN_PAGES, ADMIN_WIDGETS, ALLOWED_HOSTS, CAPABILITIES, CRON_JOBS, CRON_TIMEOUT_MS, HEAVY_JOBS, KV_CRON_OWED, PLUGIN_ID, PLUGIN_LABELS, SAME_INVOCATION_MS, STORAGE, TURN_REQUESTS, VERSION, cookielessAnalytics, cookielessAnalytics as default, createPlugin, cronDispatcher, ensureCron, resetCronTurns };
