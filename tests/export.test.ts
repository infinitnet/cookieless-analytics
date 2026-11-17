/** Export: RFC 4180 CSV, JSON equal to the report rows, 10 000 row cap, `data/export` route. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import { csvField, exportRows, toCsv } from "../src/query/export.js";
import { clearReportCache, EXPORT_LIMIT } from "../src/query/reports/index.js";
import { KV_CURSOR } from "../src/query/retention.js";
import { rollupDay } from "../src/query/rollup.js";
import { type DataCtx, DataExportBody, type DataExportInput, DataQueryBody, type DataQueryInput, dataExportRoute, dataQueryRoute } from "../src/routes/data.js";
import type { Settings } from "../src/settings.js";
import { DAYS, RANGE, seed } from "./fixtures/seed.js";
import { schemaDb } from "./helpers.js";

describe("csv", () => {
	it("quotes quotes, commas and line breaks per RFC 4180", () => {
		expect(csvField('say "hi"')).toBe('"say ""hi"""');
		expect(csvField("a,b")).toBe('"a,b"');
		expect(csvField("a\nb")).toBe('"a\nb"');
		expect(csvField("a\r\nb")).toBe('"a\r\nb"');
		expect(csvField("plain")).toBe("plain");
		expect(csvField(null)).toBe("");
		expect(csvField(12.5)).toBe("12.5");
		expect(csvField(-3)).toBe("-3");
	});

	it("never lets a stored value start a spreadsheet formula", () => {
		expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
		expect(csvField("@x,y")).toBe('"\'@x,y"');
	});

	it("writes a header row, CRLF line ends and flattened compare columns", () => {
		const csv = toCsv([
			{ key: "/a", pageviews: 2, previous: { pageviews: 1 }, landing: [{ path: "/" }] },
			{ key: '/b,"c"', pageviews: 3, extra: "x" },
		]);
		expect(csv).toBe('key,pageviews,previous.pageviews,landing,extra\r\n/a,2,1,"[{""path"":""/""}]",\r\n"/b,""c""",3,,,x\r\n');
	});

	it("exports rows, else series, else totals, capped at 10 000", () => {
		expect(exportRows({ rows: Array.from({ length: 12_000 }, (_, i) => ({ key: String(i) })) })).toHaveLength(EXPORT_LIMIT);
		expect(exportRows({ series: [{ t: "2026-01-01" }] })).toEqual([{ t: "2026-01-01" }]);
		expect(exportRows({ totals: { sessions: 3 } })).toEqual([{ sessions: 3 }]);
	});
});

describe("data/export route", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	const storage = {};
	const now = () => zonedToEpoch("2026-03-13", 12, "UTC");
	const exp = (input: DataExportInput, kv?: DataCtx["kv"]) =>
		dataExportRoute({ db: async () => env.db, settings: async () => settings, now }).handler({ input: DataExportBody.parse(input), storage, ...(kv ? { kv } : {}) } as DataCtx);
	const query = (input: DataQueryInput, kv?: DataCtx["kv"]) =>
		dataQueryRoute({ db: async () => env.db, settings: async () => settings, now }).handler({ input: DataQueryBody.parse(input), storage, ...(kv ? { kv } : {}) } as DataCtx);

	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
	});
	beforeEach(() => clearReportCache());

	it("returns a raw CSV download with a content-disposition header", async () => {
		const r = await exp({ report: "channels", query: { ...RANGE }, format: "csv" });
		expect(r.status).toBe(200);
		expect(Object.fromEntries(r.headers)).toMatchObject({ "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="channels-2026-03-10-2026-03-12.csv"' });
		const lines = (r.body as { value: string }).value.split("\r\n");
		expect(lines[0]).toBe("key,visitors,sessions,pageviews,views_per_session,bounce_rate,engaged_rate,avg_duration");
		expect(lines[1]?.startsWith("Direct,")).toBe(true);
	});

	it("JSON equals the report rows of data/query", async () => {
		for (const report of ["pages", "channels", "timeseries", "overview"] as const) {
			const r = await exp({ report, query: { ...RANGE, compare: "previous" }, format: "json" });
			const q = await query({ report, query: { ...RANGE, compare: "previous" } });
			expect(JSON.parse((r.body as { value: string }).value), report).toEqual(exportRows(q.data));
		}
		const pages = await exp({ report: "pages", query: { ...RANGE }, format: "json" });
		expect(JSON.parse((pages.body as { value: string }).value)).toEqual((await query({ report: "pages", query: { ...RANGE } })).data.rows);
	});

	it("binds the keys of a 10 000 row page as one parameter", async () => {
		const { keysIn } = await import("../src/query/reports/base.js");
		const keys = Array.from({ length: 10_000 }, (_, i) => `/p${i}`);
		expect(keysIn({ db: env.db } as never, "h.path", keys).params).toHaveLength(1);
	});

	it("rejects an unknown format and a limit above 10 000", () => {
		expect(DataExportBody.safeParse({ report: "pages", query: RANGE, format: "xml" }).success).toBe(false);
		expect(DataExportBody.safeParse({ report: "pages", query: RANGE, format: "csv", limit: 10_001 }).success).toBe(false);
	});

	it("reads the rollup through the route when the range starts before the raw window", async () => {
		for (const d of DAYS) await rollupDay({ db: env.db, site: "default", settings, goals: [] }, d);
		// A capped cursor puts the raw window start at 2026-03-12.
		await env.kv.set(KV_CURSOR, { day: "2026-03-13", step: 6, rawDays: 1, capped: true, deleted: {} });
		const r = await query({ report: "overview", query: { ...RANGE } }, env.kv);
		expect(r.notices).toContain("summary");
		expect(r.data.totals?.sessions).toBe(37);
		const recent = await query({ report: "overview", query: { from: "2026-03-12", to: "2026-03-12" } }, env.kv);
		expect(recent.notices).not.toContain("summary");
	});
});

describe("revenue export", () => {
	it("every row of a revenue result has a currency column, series and totals included", async () => {
		const { exportRows, toCsv } = await import("../src/query/export.js");
		const list = { currency: "USD", rows: [{ key: "USD", currency: "USD", revenue: 1 }, { key: "EUR", currency: "EUR", revenue: 2 }] };
		expect(exportRows(list).map((r) => r.currency)).toEqual(["USD", "EUR"]);
		expect(exportRows({ currency: "EUR", series: [{ t: "2026-03-10", revenue: 5 }] })).toEqual([{ t: "2026-03-10", revenue: 5, currency: "EUR" }]);
		expect(exportRows({ currency: "JPY", totals: { revenue: 100 } })).toEqual([{ revenue: 100, currency: "JPY" }]);
		// A withRevenue table: revenue_currency per row and the currency column.
		const csv = toCsv(exportRows({ currency: "USD", rows: [{ key: "Search", sessions: 2, revenue: 59.9, revenue_currency: "USD" }] }));
		expect(csv.split("\r\n")[0]).toBe("key,sessions,revenue,revenue_currency,currency");
		expect(exportRows({ rows: [{ key: "a" }] })).toEqual([{ key: "a" }]);
	});
});
