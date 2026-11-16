import type Database from "better-sqlite3";
import { drops } from "../src/core/drops.js";
import type { Db } from "../src/db/adapter.js";

/** Flush this isolate's drop counters into `env`, then the totals per reason in `ca_drops` (one day, or all days). */
export async function dropsOf(env: { db: Db; raw: Database.Database }, day?: string): Promise<Record<string, number>> {
	await drops.flush(env.db);
	const rows = env.raw
		.prepare(`SELECT reason, SUM(n) AS n FROM ca_drops ${day ? "WHERE day = ?" : ""} GROUP BY reason`)
		.all(...(day ? [Number(day.replaceAll("-", ""))] : [])) as Array<{ reason: string; n: number }>;
	return Object.fromEntries(rows.map((r) => [r.reason, r.n]));
}
