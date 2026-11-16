/** Write cost per page view on synthetic traffic with the production mix, through the recorder and D1 sink. */
import { beforeAll, describe, expect, it } from "vitest";
import { generateTraffic, recordTraffic } from "./capacity.helpers.js";
import { meteredDb, schemaDb } from "./helpers.js";

const PV = 1500;

describe("capacity: rows written per page view", () => {
	const traffic = generateTraffic({ pageviews: PV, seed: 7 });
	let meter: ReturnType<typeof meteredDb>;
	let outcomes: Record<string, number> = {};

	beforeAll(async () => {
		const env = await schemaDb();
		meter = meteredDb(env);
		meter.reset();
		outcomes = await recordTraffic(meter.db, traffic);
	}, 120_000);

	it("records every generated request", () => {
		expect(outcomes).toEqual({ ok: traffic.actions.length });
	});

	it("is below 4.0 rows written per page view", () => {
		const after = meter.stats.rowsWritten / PV;
		console.info(`[capacity] rows written per page view: ${after.toFixed(2)} (${(meter.stats.statements / PV).toFixed(2)} statements)`);
		expect(after).toBeLessThan(4.0);
	});
});
