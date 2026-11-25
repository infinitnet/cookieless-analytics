/**
 * Summary answers under a channel, country or device filter: the Pages exit rate is blank with the notice
 * `exit_rate_segment` (exits have no pair rows), and Active now applies the filters to the live visits, which are
 * always detailed, so it equals the detailed answer. Synthetic data only.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { type IngestBody } from "../src/contract.js";
import { noticeCopy, noticeText } from "../src/charts/caveats.js";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { type Filter, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx } from "../src/query/reports/base.js";
import { clearReportCache, type ReportName, runReport } from "../src/query/reports/index.js";
import { normalizeSettings } from "../src/settings.js";
import { CHROME_UA, eventRequest, schemaDb } from "./helpers.js";

const DAY = "2026-06-10";
const T0 = Date.parse(`${DAY}T12:00:00Z`) / 1000;
const SETTINGS = normalizeSettings({ siteTimezone: "UTC" });
const body = (b: Record<string, unknown>) => validateIngest({ v: 1, ...b }) as IngestBody;

let env: Awaited<ReturnType<typeof schemaDb>>;
beforeEach(async () => {
	resetCounters();
	clearReportCache();
	env = await schemaDb();
	// Five visits two minutes apart: three from Google (Organic Search), two direct; each two pages.
	for (let n = 1; n <= 5; n++) {
		const info = requestInfo(eventRequest("{}", { "user-agent": CHROME_UA, "cf-connecting-ip": `2001:db8:${n.toString(16)}::7` }));
		const sid = `${"v".repeat(19)}${n}`;
		const t = T0 + n * 120;
		const ref = n <= 3 ? { r: "https://www.google.com/" } : {};
		expect(await recordClientEvent({ db: env.db, kv: env.kv, settings: SETTINGS, now: t }, body({ t: "pv", sid, h: `aaaaaaaaaaa${n}`, u: "/", w: 1440, ...ref }), info)).toBe("ok");
		expect(await recordClientEvent({ db: env.db, kv: env.kv, settings: SETTINGS, now: t + 30 }, body({ t: "pv", sid, h: `bbbbbbbbbbb${n}`, u: "/pricing", w: 1440 }), info)).toBe("ok");
	}
});

/** `now` one minute after the last page view: the newest visits are inside the 5 minute realtime window. */
const NOW = T0 + 5 * 120 + 60;
const detailed = (): ReportCtx => ({ db: env.db, site: "default", settings: SETTINGS, now: NOW, goals: [], funnels: {}, annotations: [] });
/** Every range starts before this detailed window, so the summaries answer (today is computed on read). */
const summary = (): ReportCtx => ({ ...detailed(), rawFrom: "2030-01-01" });
const run = (rc: ReportCtx, report: ReportName, filters: Filter[] = []) => runReport(rc, { report, query: QuerySchema.parse({ from: DAY, to: DAY, filters }), limit: 100 });
const organic: Filter = { dim: "channel", op: "is", values: ["Organic Search"] };

describe("cf5: the summary exit rate under a segment filter says why it is blank", () => {
	it("cf5: Pages from the summaries under a channel filter: exit rate null and the notice exit_rate_segment", async () => {
		const r = await run(summary(), "pages", [organic]);
		expect(r.notices).toEqual(expect.arrayContaining(["summary", "exit_rate_segment"]));
		expect(r.data.rows?.map((x) => [x.key, x.pageviews, x.exit_rate])).toEqual([
			["/", 3, null],
			["/pricing", 3, null],
		]);
		expect(noticeCopy("exit_rate_segment")).toBe("Exit rate is blank here: the daily summaries keep exits without a channel, country or device, so they cannot apply that filter to it.");
		expect(noticeText(r.notices ?? [])).toContain(noticeCopy("exit_rate_segment"));
	});

	it("cf5: without the filter the summary has exit rates and no such notice", async () => {
		const r = await run(summary(), "pages");
		expect(r.notices).toContain("summary");
		expect(r.notices).not.toContain("exit_rate_segment");
		expect(r.data.rows?.find((x) => x.key === "/pricing")?.exit_rate).toBe(1);
	});
});

describe("cf12: Active now follows the filters on summary ranges", () => {
	it("cf12: the summary answer under a channel filter counts the live visits of that channel, equal to the detailed answer", async () => {
		const all = await run(summary(), "overview");
		const rolled = await run(summary(), "overview", [organic]);
		const raw = await run(detailed(), "overview", [organic]);
		expect(rolled.notices).toContain("summary");
		expect(raw.notices).not.toContain("summary");
		// Visits 3, 4 and 5 were seen within the last 5 minutes; of them only visit 3 came from Google.
		expect(all.data.realtime).toBe(3);
		expect(rolled.data.realtime).toBe(1);
		expect(raw.data.realtime).toBe(1);
		const direct = await run(summary(), "overview", [{ dim: "channel", op: "is", values: ["Direct"] }]);
		expect(direct.data.realtime).toBe(2);
	});

	it("cf12: a filter the live visits cannot compile (too many values) leaves Active now empty and the summary Overview answers", async () => {
		const many: Filter = { dim: "channel", op: "contains", values: ["Organic", ...Array.from({ length: 80 }, (_, i) => `zz${i}`)] };
		// The detailed answer refuses the filter; the summary totals do not compile it over detailed rows.
		await expect(run(detailed(), "overview", [many])).rejects.toMatchObject({ code: "too_many_values" });
		const rolled = await run(summary(), "overview", [many]);
		expect(rolled.notices).toContain("summary");
		expect(rolled.data.realtime).toBeNull();
		expect((rolled.data.totals as Record<string, unknown>).sessions).toBe(3);
	});
});
