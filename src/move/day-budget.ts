/**
 * Rows a data move or a `data/load` writes per UTC day into a D1 database on the `small` profile (`dailyRowsApply`).
 * The D1 Free plan allows 100,000 rows written a day per account; like the filtered delete (`DELETE_DAY_ROWS`) these
 * copies stop the day at `COPY_DAY_ROWS` and continue after 00:00 UTC. The counter lives in the KV of the
 * destination's database (the state prefix the write guard reads), and every charge is also added to that day's
 * write budget state, so the ingest guard (`budgetState`, 85,000 rows) counts the copied rows at once.
 */
import type { KvLike } from "../core/crypto.js";
import { dayInZone } from "../core/time.js";
import { KV_WRITE_BUDGET, type WriteBudget } from "../query/storage.js";

/** Rows a move and `data/load` together may write in one UTC day on `small` with D1. */
export const COPY_DAY_ROWS = 15_000;
/** Counter of today's copied rows: `{ day, rows }`, `day` the UTC day. */
export const KV_COPY_ROWS = "copy:rows";

/** Epoch seconds of the next 00:00 UTC after `now`. */
export const nextUtcMidnight = (now: number): number => (Math.floor(now / 86_400) + 1) * 86_400;

/** Rows copied in the UTC day of `now`. */
export async function copiedToday(kv: Pick<KvLike, "get">, now: number): Promise<number> {
	const c = await kv.get<{ day: string; rows: number }>(KV_COPY_ROWS);
	return c?.day === dayInZone(now, "UTC") ? c.rows : 0;
}

/** Rows that may still be copied today. */
export const copyRowsLeft = async (kv: Pick<KvLike, "get">, now: number): Promise<number> => Math.max(0, COPY_DAY_ROWS - (await copiedToday(kv, now)));

/** Charge `rows` copied rows to today: the counter and today's write budget state (when one is stored). Returns today's total. */
export async function chargeCopyRows(kv: KvLike, now: number, rows: number): Promise<number> {
	const day = dayInZone(now, "UTC");
	const total = (await copiedToday(kv, now)) + rows;
	await kv.set(KV_COPY_ROWS, { day, rows: total });
	const b = await kv.get<WriteBudget>(KV_WRITE_BUDGET);
	if (b?.day === day) await kv.set(KV_WRITE_BUDGET, { ...b, rows: b.rows + rows, blocked: b.blocked || b.rows + rows >= b.limit });
	return total;
}
