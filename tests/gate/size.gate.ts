/**
 * Storage. Realistic generator traffic (the engines gate's day traffic: article paths, referrers,
 * campaigns, orders, link events) at 1,000, 10,000 and 100,000 page views a day goes through the real recorder
 * into an SQLite file, then the closed-day writer stores the summaries. Measured with `dbstat`: bytes per page view
 * and per summary row, against the constants of `src/query/storage.ts` (tolerance 15 percent) and against the
 * estimator itself (`estimateStorage`). Writes `size-table.md` (the measured table for docs/limits.md) to GATE_OUT.
 *
 * Run: GATE_OUT=<dir> vitest run --config scripts/gate/vitest.config.mjs tests/gate/size.gate.ts
 * Days per tier: GATE_SIZE_DAYS (default 30), and GATE_SIZE_DAYS_100K for the largest tier (default the same).
 */
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateIngest } from "../../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../../src/core/recorder.js";
import { addDays, eachDay, zonedToEpoch } from "../../src/core/time.js";
import { ensureSchema } from "../../src/db/schema.js";
import type { Goal } from "../../src/query/filters.js";
import { runRollup } from "../../src/query/rollup.js";
import { dayBytes, ENTRY_BYTES, estimateStorage, STORAGE_SAFETY, SUMMARY_ROW_BYTES, VISIT_BYTES } from "../../src/query/storage.js";
import { normalizeSettings, PROFILES, SUMMARY_SHARE } from "../../src/settings.js";
import { tableBytes } from "../capacity.helpers.js";
import { eventRequest, MemoryKv } from "../helpers.js";
import { dayTraffic, fileDb, fmt, gateWrite, visitorHeaders } from "./gate.helpers.js";

const TZ = "UTC";
const FIRST = "2026-03-01";
const DAYS = Number(process.env.GATE_SIZE_DAYS ?? 30);
const DAYS_100K = Number(process.env.GATE_SIZE_DAYS_100K ?? DAYS);
const TIERS = (process.env.GATE_SIZE_TIERS ?? "1000,10000,100000").split(",").map(Number);
const GOALS: Goal[] = [
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Guides", type: "page", match: "prefix", value: "/guides/" },
	{ name: "Buy", type: "event", match: "is", value: "purchase" },
];
const DETAIL = ["ca_sessions", "ca_events", "ca_aliases", "ca_srv", "ca_drops"];
const SUMMARY = ["ca_rollup", "ca_revenue_daily", "ca_cube"];
const settings = normalizeSettings({ siteTimezone: TZ });
const ratio = (a: number, b: number) => Math.round((a / b) * 1000) / 1000;

interface TierResult {
	pvPerDay: number;
	days: number;
	pageviews: number;
	visits: number;
	entries: number;
	detailBytes: number;
	visitTableBytes: number;
	bytesPerPv: number;
	constantsEstimate: number;
	constantsRatio: number;
	summaryRows: number;
	summaryRowsPerDay: number;
	summaryBytes: number;
	bytesPerSummaryRow: number;
	summaryRatio: number;
	estimator: { detail: number; summary: number; detailRatio: number; summaryRatio: number };
	fileBytes: number;
	seconds: number;
}

async function tier(pvPerDay: number, days: number): Promise<TierResult> {
	const path = join(tmpdir(), `ca-gate-size-${pvPerDay}-${process.pid}.db`);
	rmSync(path, { force: true });
	const { db, raw } = await fileDb(path);
	const kv = new MemoryKv();
	await ensureSchema(db, kv);
	const t0 = Date.now();
	resetCounters();
	const list = eachDay(FIRST, addDays(FIRST, days - 1));
	let pageviews = 0;
	for (const [i, day] of list.entries()) {
		const t = dayTraffic({ site: "default", day, pageviews: pvPerDay, seed: 7000 + i, tz: TZ }, zonedToEpoch);
		pageviews += t.counts.pageviews;
		for (const a of t.actions) {
			const body = validateIngest(a.body);
			if (!body) throw new Error("invalid generated body");
			await recordClientEvent({ db, kv, settings, now: a.at }, body, requestInfo(eventRequest(a.body, visitorHeaders(a.ip), a.url)));
		}
	}
	// Every recorded day closed, then stored by the closed-day writer.
	const now = zonedToEpoch(addDays(list.at(-1) as string, 3), 6, TZ);
	for (let i = 0; i < 500; i++) if (!(await runRollup({ db, settings, goals: async () => GOALS }, kv, now)).days.length) break;
	const n = (sql: string) => (raw.prepare(sql).get() as { n: number }).n;
	const visits = n("SELECT COUNT(*) AS n FROM ca_sessions");
	const entries = n("SELECT SUM(pageviews + events) AS n FROM ca_sessions");
	const detailBytes = DETAIL.reduce((s, t) => s + tableBytes(raw, t), 0);
	const visitTableBytes = tableBytes(raw, "ca_sessions");
	const summaryRows = SUMMARY.reduce((s, t) => s + n(`SELECT COUNT(*) AS n FROM ${t}`), 0);
	const summaryBytes = SUMMARY.reduce((s, t) => s + tableBytes(raw, t), 0);
	const constantsEstimate = Math.round(dayBytes(visits, entries));
	const est = await estimateStorage(db, { ...settings, rawRetentionDays: 760 }, addDays(list.at(-1) as string, 3));
	const fileBytes = (raw.prepare("PRAGMA page_count").get() as { page_count: number }).page_count * (raw.prepare("PRAGMA page_size").get() as { page_size: number }).page_size;
	raw.close();
	const r: TierResult = {
		pvPerDay,
		days,
		pageviews,
		visits,
		entries,
		detailBytes,
		visitTableBytes,
		bytesPerPv: Math.round(detailBytes / pageviews),
		constantsEstimate,
		constantsRatio: ratio(constantsEstimate, visitTableBytes),
		summaryRows,
		summaryRowsPerDay: Math.round(summaryRows / days),
		summaryBytes,
		bytesPerSummaryRow: Math.round(summaryBytes / summaryRows),
		summaryRatio: ratio(SUMMARY_ROW_BYTES * STORAGE_SAFETY, summaryBytes / summaryRows),
		estimator: { detail: est.detail, summary: est.summary, detailRatio: ratio(est.detail, visitTableBytes), summaryRatio: ratio(est.summary, summaryBytes) },
		fileBytes: Math.max(fileBytes, statSync(path).size),
		seconds: Math.round((Date.now() - t0) / 1000),
	};
	rmSync(path, { force: true });
	process.stdout.write(`[gate size] ${JSON.stringify(r)}\n`);
	return r;
}

const GB = 1e9;
/** The estimate may not be below the measured size, nor more than 15 percent above it. */
const within = (x: number) => x >= 1 && x <= 1.15;

function table(rs: TierResult[]): string {
	const detailShare = (p: keyof typeof PROFILES) => PROFILES[p].bytes * (1 - SUMMARY_SHARE);
	const lines = [
		"# Measured storage",
		"",
		"Synthetic traffic with real-site content (article paths over about 2,000 pages, referrers on most entries, campaign links, orders in two currencies, link impressions and clicks) through the real recorder into an SQLite file (better-sqlite3, JSONB documents grown in place), then the closed-day writer. Sizes from `dbstat` (table plus its indexes). Not measured on D1: production D1 reports `size_after` only, and 383 bytes per page view were measured there for text documents inserted whole.",
		"",
		`| Page views a day | Days | Page views | Visits | Detailed bytes per page view | Visit table estimate / measured (\`(${VISIT_BYTES} x visits + ${ENTRY_BYTES} x entries) x ${STORAGE_SAFETY}\`) | Summary rows a day | Bytes per summary row (estimate ${SUMMARY_ROW_BYTES} x ${STORAGE_SAFETY}) | Estimator detail / measured | Estimator summary / measured | File size |`,
		"|---|---|---|---|---|---|---|---|---|---|---|",
		...rs.map(
			(r) =>
				`| ${fmt(r.pvPerDay)} | ${r.days} | ${fmt(r.pageviews)} | ${fmt(r.visits)} | ${r.bytesPerPv} | ${r.constantsRatio} ${within(r.constantsRatio) ? "" : "(outside 15 percent)"} | ${fmt(r.summaryRowsPerDay)} | ${r.bytesPerSummaryRow} (estimate / measured = ${r.summaryRatio}${within(r.summaryRatio) ? "" : ", outside 15 percent"}) | ${r.estimator.detailRatio} | ${r.estimator.summaryRatio} | ${(r.fileBytes / 1e6).toFixed(1)} MB |`,
		),
		"",
		"25 months (760 days) at the measured rates (detailed bytes per page view x page views x 760, plus summary rows a day x measured bytes per row x 760):",
		"",
		"| Page views a day | Detailed data | Summaries | Total | 25 months of detail fit `small` / `standard` / `dedicated` (detailed share 225 MB / 4.5 GB / 6.75 GB) |",
		"|---|---|---|---|---|",
		...rs.map((r) => {
			const detail = r.bytesPerPv * r.pvPerDay * 760;
			const summary = r.summaryRowsPerDay * r.bytesPerSummaryRow * 760;
			const fit = (p: keyof typeof PROFILES) => (detail <= detailShare(p) ? "yes" : `${Math.floor(detailShare(p) / (r.bytesPerPv * r.pvPerDay))} days`);
			return `| ${fmt(r.pvPerDay)} | ${(detail / GB).toFixed(2)} GB | ${(summary / GB).toFixed(2)} GB | ${((detail + summary) / GB).toFixed(2)} GB | ${fit("small")} / ${fit("standard")} / ${fit("dedicated")} |`;
		}),
		"",
		`Largest page views a day with 25 months of detail at the mean measured rate (${Math.round(rs.reduce((a, r) => a + r.bytesPerPv, 0) / rs.length)} bytes per page view): small ${fmt(Math.floor(detailShare("small") / 760 / (rs.reduce((a, r) => a + r.bytesPerPv, 0) / rs.length)))}, standard ${fmt(Math.floor(detailShare("standard") / 760 / (rs.reduce((a, r) => a + r.bytesPerPv, 0) / rs.length)))}, dedicated ${fmt(Math.floor(detailShare("dedicated") / 760 / (rs.reduce((a, r) => a + r.bytesPerPv, 0) / rs.length)))}.`,
		"",
	];
	return lines.join("\n");
}

describe("gate: bytes per page view and per summary row", () => {
	it("measures each tier and compares with the storage constants", async () => {
		const mine: TierResult[] = [];
		for (const pv of TIERS) {
			const r = await tier(pv, pv >= 100_000 ? DAYS_100K : DAYS);
			mine.push(r);
			gateWrite(`size-${pv}.json`, `${JSON.stringify(r, null, 1)}\n`);
		}
		// The table covers every tier measured into GATE_OUT so far (tiers may run separately).
		const dir = process.env.GATE_OUT;
		const rs = dir ? readdirSync(dir).filter((f) => /^size-\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as TierResult).sort((a, b) => a.pvPerDay - b.pvPerDay) : mine;
		gateWrite("size-table.md", table(rs));
		for (const r of mine) {
			expect(within(r.constantsRatio), `visit constants at ${r.pvPerDay} a day: ${r.constantsRatio}`).toBe(true);
			expect(within(r.estimator.detailRatio), `estimator detail at ${r.pvPerDay} a day: ${r.estimator.detailRatio}`).toBe(true);
		}
		for (const r of mine) {
			expect(within(r.summaryRatio), `summary row at ${r.pvPerDay} a day: ${r.summaryRatio}`).toBe(true);
			expect(within(r.estimator.summaryRatio), `estimator summary at ${r.pvPerDay} a day: ${r.estimator.summaryRatio}`).toBe(true);
		}
	});
});
