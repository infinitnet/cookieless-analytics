/** The copy day budget of a data move and `data/load` on `small` with D1: the counter, the write budget state, the guard's recount. */
import { describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { ensureSchema } from "../src/db/schema.js";
import { chargeCopyRows, COPY_DAY_ROWS, copiedToday, copyRowsLeft, KV_COPY_ROWS, nextUtcMidnight } from "../src/move/day-budget.js";
import { budgetState, GUARD_SHARE, FREE_ROWS_PER_DAY, KV_WRITE_BUDGET, type WriteBudget, writeBudget } from "../src/query/storage.js";
import { MemoryKv, memoryDb } from "./helpers.js";

const NOW = zonedToEpoch("2026-06-09", 3, "UTC");

describe("copy day budget", () => {
	it("counts the rows of the UTC day and starts again at 0 the next day", async () => {
		const kv = new MemoryKv();
		expect(await copiedToday(kv, NOW)).toBe(0);
		expect(await chargeCopyRows(kv, NOW, 100)).toBe(100);
		expect(await chargeCopyRows(kv, NOW + 60, 50)).toBe(150);
		expect(await kv.get(KV_COPY_ROWS)).toEqual({ day: "2026-06-09", rows: 150 });
		expect(await copyRowsLeft(kv, NOW)).toBe(COPY_DAY_ROWS - 150);
		expect(await copiedToday(kv, NOW + 86_400)).toBe(0);
		expect(await copyRowsLeft(kv, NOW + 86_400)).toBe(COPY_DAY_ROWS);
		expect(nextUtcMidnight(NOW)).toBe(zonedToEpoch("2026-06-10", 0, "UTC"));
		expect(nextUtcMidnight(zonedToEpoch("2026-06-10", 0, "UTC"))).toBe(zonedToEpoch("2026-06-11", 0, "UTC"));
	});

	it("adds every charge to today's write budget state and blocks it at the limit; a state of another day stays", async () => {
		const kv = new MemoryKv();
		await chargeCopyRows(kv, NOW, 10);
		expect(await kv.get(KV_WRITE_BUDGET)).toBeNull();
		const limit = FREE_ROWS_PER_DAY * GUARD_SHARE;
		await kv.set(KV_WRITE_BUDGET, { ...writeBudget({ visits: 0, pageviews: 0, events: 0 }, "2026-06-09", NOW), rows: limit - 100 });
		await chargeCopyRows(kv, NOW, 99);
		expect((await kv.get<WriteBudget>(KV_WRITE_BUDGET))?.blocked).toBe(false);
		await chargeCopyRows(kv, NOW, 1);
		expect(await kv.get<WriteBudget>(KV_WRITE_BUDGET)).toMatchObject({ rows: limit, blocked: true });
		const old = writeBudget({ visits: 0, pageviews: 0, events: 0 }, "2026-06-08", NOW - 86_400);
		await kv.set(KV_WRITE_BUDGET, old);
		await chargeCopyRows(kv, NOW, 5);
		expect(await kv.get(KV_WRITE_BUDGET)).toEqual(old);
	});

	it("the write guard's recount includes today's copied rows", async () => {
		const m = memoryDb();
		await ensureSchema(m.db, new MemoryKv());
		const kv = new MemoryKv();
		const base = (await budgetState(m.db, kv, NOW, "small"))!.rows;
		await kv.delete(KV_WRITE_BUDGET);
		await kv.set(KV_COPY_ROWS, { day: "2026-06-09", rows: 7_000 });
		expect((await budgetState(m.db, kv, NOW, "small"))!.rows).toBe(base + 7_000);
	});
});
