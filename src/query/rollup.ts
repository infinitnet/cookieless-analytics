/**
 * Daily rollups: one `ca_rollup` row per site, day, dim and key, human traffic only.
 * Every metric is computed with the same SQL building blocks the raw reports use, so a rolled-up day
 * answers exactly like the raw query for that day.
 *
 * Column meaning per dim (the frozen schema has one column set for all dims):
 * - session dims (`all`, `entry`, `exit`, `channel`, `source`, `utm_campaign`, `country`, `device`,
 *   `browser`, `os`, `lang`): sessions, pageviews, visitors, bounces, engaged; `engaged_ms` holds the
 *   summed session duration in ms (the value avg duration needs); `events` the summed session events;
 *   `hits` of the `all` row the passive entries (link impressions), which the storage estimate counts.
 * - `page`: pageviews, visitors, sessions; `engaged_ms` the summed active time, `hits` the number of
 *   pageviews with a measured time (the avg active time denominator).
 * - `event`: events (count), sessions, visitors. `goal`: events (completions), sessions (converting).
 * - `ca_cube`: one row per channel, country and device (`CUBE_METRICS`, `duration_ms` the summed session duration);
 *   orders per cell in `ca_revenue_daily` as dim `all`, seg `cube`, segkey the three values joined by `CELL_SEP`.
 * - `link`, `link_place`: `LINK_COLS` (impressions in `hits`, clicks in `events`, clicking sessions, conversions
 *   in `engaged`); conversion values in `ca_revenue_daily`. `next`, `path3`: sessions, keyed as `JOURNEY_DIMS` says.
 */
import type { KvLike } from "../core/crypto.js";
import { addDays, dayInZone, lastClosedDay } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { dayInt, int, isoDay, upsertChanged, visitDayKey } from "../db/dialect.js";
import { chunk, type Stmt } from "../db/sql.js";
import { type CapacityProfile, PROFILES, type Settings } from "../settings.js";
import { roundMinor } from "../core/currency.js";
import { andFrags, type CompileCtx, entriesOf, entryCols, type Frag, goalPredicate, inList, TRUE } from "./compile.js";
import { eventGoals, REVENUE_KEYS, type RevenueDim, ROLLUP_DIM } from "./reports/revenue.js";
import type { Goal } from "./filters.js";
import { GOALS_PER_STATEMENT, goalGroups, hitJoin, num, ORDER_SUMS, refundDim, type ReportCtx, type RunInput, sessionAggSql, sessionWhere } from "./reports/base.js";
import { JOURNEY_DIMS, journeyDay } from "./reports/journeys.js";
import { LINK_COLS, LINK_DIMS, linkDay } from "./reports/links.js";
import { CELL_SEP, CUBE_SEG, openDay, splitRange } from "./reports/summary.js";

export const ROLLUP_DIMS = ["all", "page", "entry", "exit", "channel", "source", "utm_campaign", "country", "device", "browser", "os", "lang", "event", "goal"] as const;
export type RollupDim = (typeof ROLLUP_DIMS)[number];

/** Key folded from the rows beyond the top N of a dim and day. */
export const OTHER = "(other)";
const NOT_SET = "'(not set)'";

/** Top-N per dim and day (pages 500, sources 200). */
export const TOP_N: Record<RollupDim, number> = {
	all: 1,
	page: 500,
	entry: 500,
	exit: 500,
	channel: 200,
	source: 200,
	utm_campaign: 200,
	country: 200,
	device: 200,
	browser: 200,
	os: 200,
	lang: 200,
	event: 200,
	goal: 200,
};

/** Session key expressions, identical to the raw breakdown reports. */
export const SESSION_KEYS: Partial<Record<RollupDim, string>> = {
	all: "''",
	entry: "s.entry_path",
	exit: "s.exit_path",
	channel: `COALESCE(s.channel, ${NOT_SET})`,
	source: `COALESCE(s.source, ${NOT_SET})`,
	utm_campaign: "s.utm_campaign",
	country: `COALESCE(s.country, ${NOT_SET})`,
	device: `COALESCE(s.device, ${NOT_SET})`,
	browser: `COALESCE(s.browser, ${NOT_SET})`,
	os: `COALESCE(s.os, ${NOT_SET})`,
	lang: `COALESCE(s.lang, ${NOT_SET})`,
};

/** Segment dimensions of the pair rows (`seg`, its value in `segkey`): the filters people combine most. */
export const SEGS = ["channel", "country", "device"] as const;
export type Seg = (typeof SEGS)[number];
/** Dims stored crossed with every segment, and their fixed weight in the pair budget. */
export const PAIR_WEIGHTS = { page: 4, entry: 2, source: 2, utm_campaign: 1, event: 2, goal: 1 } as const;
export type PairDim = keyof typeof PAIR_WEIGHTS;
export const PAIR_DIMS = Object.keys(PAIR_WEIGHTS) as PairDim[];
/** Weight of the link pairs (`link` x one segment, stored with the link rows) in the same pair budget. */
const LINK_PAIR_WEIGHT = 1;
/**
 * Pair rows per site and day across all pairs. `standard` and `dedicated`: what is left of the summary share
 * (a quarter of the profile's bytes, 130 bytes a row, 760 days) after the single dimension, link, journey and cube rows
 * at their caps, so 25 months of summaries fit even at every cap (tested). `small`: 340 of the about 760 rows a day the
 * share held at 130 bytes. The rows measured 74 to 81 bytes since (`SUMMARY_ROW_BYTES`), so the caps leave a margin.
 */
export const PAIR_ROWS: Record<CapacityProfile, number> = { small: 340, standard: 7_500, dedicated: 15_000 };
const WEIGHT_SUM = SEGS.length * (Object.values(PAIR_WEIGHTS).reduce((a, w) => a + w, 0) + LINK_PAIR_WEIGHT);
/** Rows of one pair family (`dim` x one segment) per day: its weighted share of the profile's pair rows. */
export const pairCap = (profile: CapacityProfile | undefined, dim: PairDim | "link") =>
	Math.floor((PAIR_ROWS[profile ?? "standard"] * (dim === "link" ? LINK_PAIR_WEIGHT : PAIR_WEIGHTS[dim])) / WEIGHT_SUM);
/** Link rows per family and day (`link`, `link_place`; their conversion values per currency likewise). */
export const LINK_TOP_N = 200;
/** Journey rows per day: `next` (steps, and the pages they name) and `path3`. */
export const JOURNEY_CAP: Record<CapacityProfile, { next: number; path3: number }> = { small: { next: 200, path3: 50 }, standard: { next: 2_000, path3: 500 }, dedicated: { next: 2_000, path3: 500 } };
/** Every dim of `ca_rollup` and `ca_revenue_daily` (the storage estimate counts them). */
export const SUMMARY_DIMS = [...ROLLUP_DIMS, ...LINK_DIMS, ...JOURNEY_DIMS];
/** Separates the two keys of a session pair inside one SQL key (no path, channel, country or device holds it). */
const SEP = CELL_SEP;
/**
 * Cube cells (channel x country x device) per site and day. A day has few channels and devices, so the cells are
 * mostly countries: the cap folds the smallest countries into `(other)` (see `foldCube`). Inside the summary share
 * beside the pairs (`tests/rollup-pairs.test.ts`).
 */
export const CUBE_CAP: Record<CapacityProfile, number> = { small: 150, standard: 1_000, dedicated: 1_000 };
export const CUBE_METRICS = ["sessions", "pageviews", "visitors", "bounces", "engaged", "duration_ms", "events"] as const;
type CubeMetric = (typeof CUBE_METRICS)[number];
/** A `ca_cube` row: the session metrics of one channel, country and device. */
export type CubeRow = { channel: string; country: string; device: string } & Record<CubeMetric, number>;

export const KV_WATERMARK = "rollup:watermark";

const METRICS = ["pageviews", "sessions", "visitors", "bounces", "engaged", "engaged_ms", "events", "hits"] as const;
type Metric = (typeof METRICS)[number];
export type RollupRow = { dim: RollupDim; key: string } & Record<Metric, number>;
/** A `ca_rollup` pair row: `dim` and `key` crossed with segment `seg` and its value `segkey`. */
export type PairRow = RollupRow & { seg: Seg; segkey: string };
/** A `ca_rollup` row of the link and journey families (`seg` '' or a segment, `segkey` per the dim). */
export type FamilyRow = Record<Metric, number> & { dim: string; key: string; seg: string; segkey: string };

export interface RollupCtx {
	db: Db;
	site: string;
	settings: Pick<Settings, "siteTimezone" | "engagedThresholdSeconds" | "realtimeWindowMinutes"> & Partial<Pick<Settings, "capacityProfile">>;
	goals: readonly Goal[];
}

const row = (dim: RollupDim, key: string, m: Partial<Record<Metric, unknown>>): RollupRow => ({
	dim,
	key,
	...(Object.fromEntries(METRICS.map((k) => [k, num(m[k])])) as Record<Metric, number>),
});

/** Keep the top N rows by `by`, fold the rest into one `(other)` row (visitors summed, so approximate there). */
export function foldTop(rows: RollupRow[], n: number, by: Metric): RollupRow[] {
	const sorted = [...rows].sort((a, b) => b[by] - a[by] || (a.key < b.key ? -1 : 1));
	if (sorted.length <= n) return sorted;
	// A key that is literally `(other)` folds too: one row per primary key.
	const keep = sorted.slice(0, n - 1).filter((r) => r.key !== OTHER);
	const rest = sorted.filter((r) => !keep.includes(r));
	const other = row(rest[0]?.dim as RollupDim, OTHER, {});
	for (const r of rest) for (const m of METRICS) other[m] += r[m];
	return [...keep, other];
}

/**
 * Keep the top rows of one pair family (one dim and segment) within `n` rows. Rows beyond the top fold into key
 * `(other)` of their own segment value, so the totals under a segment filter stay exact; segment values with no
 * kept row fold into `(other)` x `(other)`. The family's sum of every metric is unchanged.
 */
export function foldPairs<T extends { key: string; segkey: string }>(rows: T[], n: number, rank: (r: T) => number, add: (into: T, r: T) => void): T[] {
	if (rows.length <= n) return rows;
	const sorted = [...rows].sort((a, b) => rank(b) - rank(a) || (a.key < b.key ? -1 : a.key > b.key ? 1 : a.segkey < b.segkey ? -1 : 1));
	const keep = new Set<T>();
	const segs = new Set<string>();
	// Room for every kept row, one `(other)` per kept segment value, and the `(other)` x `(other)` row.
	for (const r of sorted) if (keep.size + 1 + segs.size + (segs.has(r.segkey) ? 0 : 1) + 1 <= n) keep.add(r), segs.add(r.segkey);
	const others = new Map<string, T>();
	for (const r of sorted) {
		// A kept key that is literally `(other)` merges into the fold row of its segment value: one row per primary key.
		if (keep.has(r) && r.key !== OTHER) continue;
		const segkey = segs.has(r.segkey) ? r.segkey : OTHER;
		let o = others.get(segkey);
		if (!o) {
			o = { ...r, key: OTHER, segkey };
			others.set(segkey, o);
		} else add(o, r);
	}
	return [...[...keep].filter((r) => r.key !== OTHER), ...others.values()];
}

/**
 * Fold cube cells (`segkey` = channel, country and device joined by `SEP`, `key` '') to `n` rows: countries beyond
 * the top fold into `(other)` of their channel and device, so totals under channel and device filters stay exact;
 * a channel and device with no kept cell folds into `(other)` x3. Every metric's total is unchanged.
 */
export function foldCube<T extends { key: string; segkey: string }>(rows: T[], n: number, rank: (r: T) => number, add: (into: T, r: T) => void): T[] {
	const byCountry = rows.map((r) => {
		const [channel, country, device] = r.segkey.split(SEP);
		return { ...r, key: country as string, segkey: `${channel}${SEP}${device}` };
	});
	return foldPairs(byCountry, n, rank, add).map((r) => {
		const [channel, device = OTHER] = r.segkey.split(SEP);
		return { ...r, key: "", segkey: [channel, r.key, device].join(SEP) };
	});
}

const addMetrics = (into: RollupRow, r: RollupRow) => {
	for (const m of METRICS) into[m] += r[m];
};

/**
 * The summary rows of one day: `ca_rollup` rows of a single dimension (`rows`) and pairs (`pairs`), and
 * `ca_revenue_daily` rows likewise. Pair rows are never mixed into `rows`, so a single dimension reader sums `rows` only.
 */
export interface DaySummary {
	rows: RollupRow[];
	pairs: PairRow[];
	revenue: RevenueRow[];
	revenuePairs: RevenuePairRow[];
	/** `link` and `link_place` rows and the link pairs (`seg` a segment), and their conversion values per currency. */
	links: FamilyRow[];
	linkRevenue: FamilyRevenueRow[];
	/** `next` and `path3` rows. */
	journeys: FamilyRow[];
	/** `ca_cube` rows, and their orders per currency (`ca_revenue_daily`, seg `cube`). */
	cube: CubeRow[];
	revenueCube: FamilyRevenueRow[];
}

/**
 * Every summary row of one site and day, computed from the visit documents (`json_each`) and `ca_events`. Reads
 * only, so the same function serves the closed-day writer and, in memory, days that are still open.
 */
export async function computeDay(rc: RollupCtx, day: string): Promise<DaySummary> {
	const { rows, pairs, cube } = await computeRollupRows(rc, day);
	const r = await computeRevenue(rc, [day]);
	return { rows, pairs, revenue: r.revenue, revenuePairs: r.pairs, ...(await computeLinks(rc, day)), journeys: await computeJourneys(rc, day), cube, revenueCube: r.cube };
}

const reportCtx = (rc: RollupCtx): ReportCtx => ({ ...rc, now: 0, funnels: {}, annotations: [] });
const familyRow = (dim: string, seg: string, key: string, segkey: string, m: Partial<Record<Metric, number>>): FamilyRow => ({
	dim,
	seg,
	key,
	segkey,
	...(Object.fromEntries(METRICS.map((k) => [k, m[k] ?? 0])) as Record<Metric, number>),
});
const addAll = (into: Record<Metric, number>, r: Record<Metric, number>) => {
	for (const m of METRICS) into[m] += r[m];
};
/** Group rows by `id`, fold each group with `fold`. */
function foldGroups<T>(rows: T[], id: (r: T) => string, fold: (group: T[]) => T[]): T[] {
	const groups = new Map<string, T[]>();
	for (const r of rows) {
		const g = groups.get(id(r));
		if (g) g.push(r);
		else groups.set(id(r), [r]);
	}
	return [...groups.values()].flatMap(fold);
}

/** The link families of one day (one statement), each folded to its cap: top links by clicks and impressions, the rest in `(other)`. */
export async function computeLinks(rc: RollupCtx, day: string): Promise<Pick<DaySummary, "links" | "linkRevenue">> {
	const rows = await linkDay(reportCtx(rc), day, SEGS);
	const cap = (seg: string) => (seg ? pairCap(rc.settings.capacityProfile, "link") : LINK_TOP_N);
	// The statement returns the counts and the impressions of a key as two rows: one row each.
	const byKey = new Map<string, FamilyRow>();
	for (const r of rows.filter((x) => x.cur === "")) {
		const id = `${r.dim}\u0000${r.seg}\u0000${r.key}\u0000${r.segkey}`;
		const into = byKey.get(id) ?? familyRow(r.dim, r.seg, r.key, r.segkey, {});
		for (const [m, col] of Object.entries(LINK_COLS) as Array<[keyof typeof LINK_COLS, Metric]>) into[col] += r[m];
		byKey.set(id, into);
	}
	const counts = [...byKey.values()];
	const values: FamilyRevenueRow[] = rows.filter((r) => r.cur !== "").map((r) => ({ day, dim: r.dim, seg: r.seg, key: r.key, segkey: r.segkey, cur: r.cur, orders: r.orders, revenue: r.revenue, sessions: 0 }));
	return {
		links: foldGroups(counts, (r) => `${r.dim}|${r.seg}`, (g) => foldPairs(g, cap(g[0]?.seg ?? ""), (r) => r.events + r.hits, addAll)),
		linkRevenue: foldGroups(values, (r) => `${r.dim}|${r.seg}|${r.cur}`, (g) =>
			foldPairs(g, cap(g[0]?.seg ?? ""), (r) => r.orders, (into, r) => {
				into.orders += r.orders;
				into.revenue += r.revenue;
			}),
		),
	};
}

/**
 * The journey families of one day (one statement), folded to the profile's caps. Steps fold per page (a page's
 * steps beyond the top become its `(other)` step) within a third of the `next` cap, so the page rows the kept steps
 * name fit in the rest; paths fold per entry page.
 */
export async function computeJourneys(rc: RollupCtx, day: string): Promise<FamilyRow[]> {
	const rows = (await journeyDay(reportCtx(rc), day)).map((r) => familyRow(r.dim, "", r.key, r.segkey, { sessions: r.sessions }));
	const cap = JOURNEY_CAP[rc.settings.capacityProfile ?? "standard"];
	// `foldPairs` keeps the totals of each segment value: with the axes swapped, of each page.
	const swap = (r: FamilyRow): FamilyRow => ({ ...r, key: r.segkey, segkey: r.key });
	const fold = (xs: FamilyRow[], n: number) => foldPairs(xs.map(swap), n, (r) => r.sessions, addAll).map(swap);
	const steps = fold(rows.filter((r) => r.dim === "next" && r.segkey !== ""), Math.floor(cap.next / 3));
	const named = new Set(steps.flatMap((r) => [r.key, r.segkey]));
	const pages = rows.filter((r) => r.dim === "next" && r.segkey === "" && named.has(r.key));
	return [...steps, ...pages, ...fold(rows.filter((r) => r.dim === "path3"), cap.path3)];
}

/** Fold every pair family of `pairs` (one dim and segment each) to its cap. */
function foldPairFamilies(rc: RollupCtx, pairs: PairRow[], by: Metric): PairRow[] {
	const out: PairRow[] = [];
	for (const dim of PAIR_DIMS)
		for (const seg of SEGS)
			out.push(
				...foldPairs(
					pairs.filter((p) => p.dim === dim && p.seg === seg),
					pairCap(rc.settings.capacityProfile, dim),
					(p) => p[by],
					addMetrics,
				),
			);
	return out;
}

async function computeRollupRows(rc: RollupCtx, day: string): Promise<{ rows: RollupRow[]; pairs: PairRow[]; cube: CubeRow[] }> {
	const ctx = reportCtx(rc);
	const input: RunInput = { from: day, to: day, filters: [], granularity: "day", params: {}, limit: 0, offset: 0, isCompare: false };
	const out: RollupRow[] = [];

	const pairs: PairRow[] = [];
	// All session dims, session pairs and the cube cells in one statement (D1 counts statements per invocation): 21 parts of 4 parameters.
	const sessionDims = Object.entries(SESSION_KEYS) as Array<[RollupDim, string]>;
	const pairParts = sessionDims.filter(([dim]) => dim in PAIR_WEIGHTS).flatMap(([dim, expr]) => SEGS.map((seg) => [dim, `${expr} || '${SEP}' || ${SESSION_KEYS[seg]}`, seg] as const));
	const cubePart = ["cube", SEGS.map((g) => SESSION_KEYS[g]).join(` || '${SEP}' || `), CUBE_SEG] as const;
	const parts = [...sessionDims.map(([dim, expr]) => [dim, expr, ""] as const), ...pairParts, cubePart].map(([dim, expr, seg]) => {
		const extra = dim === "utm_campaign" ? { sql: "s.utm_campaign IS NOT NULL", params: [] } : TRUE;
		// `all` has no key expression: Postgres rejects a constant in GROUP BY.
		// The `all` row also counts the passive entries (in `hits`), for the storage estimate.
		const q = sessionAggSql(ctx, input, dim === "all" ? null : expr, extra, dim === "all");
		const key = dim === "all" ? "''" : "x.key";
		return { sql: `SELECT '${dim}' AS dim, '${seg}' AS seg, ${key} AS key, x.sessions, x.events, x.pageviews, x.visitors, x.bounces, x.engaged, x.duration_ms, ${dim === "all" ? "x.passive" : "0"} AS passive FROM (${q.sql}) x`, params: q.params };
	});
	const sessionRows = (await rc.db.all(parts.map((p) => p.sql).join(" UNION ALL "), parts.flatMap((p) => p.params))).filter((r) => num(r.sessions) > 0);
	for (const [dim] of sessionDims) {
		const mapped = sessionRows.filter((r) => r.dim === dim && r.seg === "").map((r) => row(dim, String(r.key), { ...r, engaged_ms: r.duration_ms, hits: r.passive }));
		out.push(...foldTop(mapped, TOP_N[dim], "sessions"));
	}
	const cells = sessionRows.filter((x) => x.seg === CUBE_SEG).map((r) => ({ key: "", segkey: String(r.key), ...cubeMetrics(r) }));
	const cube = foldCube(cells, CUBE_CAP[rc.settings.capacityProfile ?? "standard"], (r) => r.sessions, (into, r) => {
		for (const m of CUBE_METRICS) into[m] += r[m];
	}).map(({ key: _, segkey, ...m }) => {
		const [channel, country, device] = segkey.split(SEP) as [string, string, string];
		return { channel, country, device, ...m };
	});
	for (const r of sessionRows.filter((x) => x.seg !== "" && x.seg !== CUBE_SEG)) {
		const k = String(r.key);
		const at = k.lastIndexOf(SEP);
		// A missing key (no entry path) makes the whole SQL key NULL: no pair.
		if (at < 0) continue;
		pairs.push({ ...row(r.dim as RollupDim, k.slice(0, at), { ...r, engaged_ms: r.duration_ms }), seg: r.seg as Seg, segkey: k.slice(at + 1) });
	}

	const h = entryCols(rc.db.dialect);
	const segCols = SEGS.map((g) => `${SESSION_KEYS[g]} AS ${g}`).join(", ");
	// The entries of the day once in CTE `e` (materialized: used four times), grouped by key alone and by key and each segment.
	const grouped = (from: Frag, keyExpr: string, cols: string, aggs: string) => ({
		sql: `WITH e AS (SELECT ${keyExpr} AS key, ${cols}s.sid AS sid, s.vkey AS vkey, ${segCols} ${from.sql}) ${["", ...SEGS]
			.map((g) => `SELECT '${g}' AS seg, ${g || "''"} AS segkey, key, ${aggs} FROM e GROUP BY key${g ? `, ${g}` : ""}`)
			.join(" UNION ALL ")}`,
		params: from.params,
	});
	const split = (rows: Array<Record<string, unknown>>, dim: RollupDim) => {
		for (const r of rows.filter((x) => x.seg !== "")) pairs.push({ ...row(dim, String(r.key), r), seg: r.seg as Seg, segkey: String(r.segkey) });
		return rows.filter((x) => x.seg === "").map((r) => row(dim, String(r.key), r));
	};
	const pq = grouped(hitJoin(ctx, input, "pv"), h.path, `${h.dur} AS dur, `, "COUNT(*) AS pageviews, COUNT(DISTINCT vkey) AS visitors, COUNT(DISTINCT sid) AS sessions, SUM(dur) AS engaged_ms, COUNT(dur) AS hits");
	out.push(...foldTop(split(await rc.db.all(pq.sql, pq.params), "page"), TOP_N.page, "pageviews"));

	// Internal `_` events have their own raw-only reports; keeping them out leaves the top N to user events.
	const ev = hitJoin(ctx, input, "ev", { sql: `${h.name} NOT LIKE '\\_%' ESCAPE '\\'`, params: [] });
	const eq = grouped(ev, h.name, "", "COUNT(*) AS events, COUNT(DISTINCT sid) AS sessions, COUNT(DISTINCT vkey) AS visitors");
	out.push(...foldTop(split(await rc.db.all(eq.sql, eq.params), "event"), TOP_N.event, "events"));

	const cc: CompileCtx = { db: rc.db, site: rc.site, from: day, to: day, goals: rc.goals };
	const goals: RollupRow[] = [];
	// One statement per group of goals (UNION ALL), so the cost of a day grows by one statement per ten goals.
	const goalParts: Frag[] = [];
	for (const g of rc.goals.filter((x) => x.active !== false)) {
		const where = andFrags([sessionWhere(rc.site, day, day, TRUE), await goalPredicate(cc, g, "h")]);
		goalParts.push({
			sql: `SELECT CAST(? AS TEXT) AS goal, ${segCols}, COUNT(*) AS events, COUNT(DISTINCT s.sid) AS sessions FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql} GROUP BY ${SEGS.map((x) => SESSION_KEYS[x]).join(", ")}`,
			params: [g.name, ...where.params],
		});
	}
	const byGoal = new Map<string, Array<Record<string, unknown>>>();
	for (const group of goalGroups(goalParts))
		for (const r of await rc.db.all(group.map((p) => p.sql).join(" UNION ALL "), group.flatMap((p) => p.params))) byGoal.set(String(r.goal), [...(byGoal.get(String(r.goal)) ?? []), r]);
	for (const [name, rs] of byGoal) {
		const total = row("goal", name, {});
		const bySeg = new Map<string, PairRow>();
		// A visit has one value per segment, so completions and converting visits add up across the groups.
		for (const r of rs) {
			addMetrics(total, row("goal", name, r));
			for (const seg of SEGS) {
				const p = bySeg.get(`${seg}\u0000${r[seg]}`) ?? { ...row("goal", name, {}), seg, segkey: String(r[seg]) };
				addMetrics(p, row("goal", name, r));
				bySeg.set(`${seg}\u0000${r[seg]}`, p);
			}
		}
		if (total.events > 0) goals.push(total);
		pairs.push(...bySeg.values());
	}
	out.push(...foldTop(goals, TOP_N.goal, "events"));
	return { rows: out, pairs: foldPairFamilies(rc, pairs, "sessions"), cube };
}

const cubeMetrics = (r: Record<string, unknown>) => Object.fromEntries(CUBE_METRICS.map((m) => [m, num(r[m])])) as Record<CubeMetric, number>;

/** Rows per upsert statement: each binds one JSON array, so the size stays small for D1. */
const ROWS_PER_INSERT = 500;
const REVENUE_COLS = ["dim", "key", "seg", "segkey", "cur", "orders", "revenue", "sessions"] as const;
const ROLLUP_COLS = ["dim", "key", "seg", "segkey", ...METRICS] as const;

/**
 * `INSERT ... SELECT` over one JSON array parameter of rows (`cols` in order, the first `text` of them text),
 * as the changed-rows upsert: a row equal to the stored one costs 0 rows written.
 */
export function summaryUpsertSql(dialect: Db["dialect"], table: string, cols: readonly string[], text: number, conflict: readonly string[], day = "?"): string {
	const sel = cols.map((c, i) =>
		dialect === "postgres" ? (i < text ? `value->>${i}` : `CAST(value->>${i} AS ${c === "revenue" ? "DOUBLE PRECISION" : "BIGINT"})`) : `json_extract(value, '$[${i}]')`,
	);
	const from = dialect === "postgres" ? "jsonb_array_elements(CAST(? AS jsonb))" : "json_each(?)";
	// `WHERE true`: SQLite would read `ON CONFLICT` as a join constraint without it.
	return `INSERT INTO ${table} (site, day, ${cols.join(", ")}) SELECT ?, ${day}, ${sel.join(", ")} FROM ${from} WHERE true ${upsertChanged(dialect, table, conflict, cols.slice(text))}`;
}

/**
 * Delete the rows of one site and day whose key is not in the JSON array parameter (keys such as `dim|key`, or
 * `dim|cur|key`): the single dimension rows (`seg = ''`), or with `segs` the pair rows of those segments.
 * `dim IN (...)` and `seg` keep it key ranges of the primary key, so single and pair rows never touch each other.
 */
export function summaryVanishedSql(dialect: Db["dialect"], table: string, dims: readonly string[], key: string, segs?: readonly string[], range: { lo?: boolean; hi?: boolean } = {}): string {
	const list = dialect === "postgres" ? "SELECT jsonb_array_elements_text(CAST(? AS jsonb))" : "SELECT value FROM json_each(?)";
	const quoted = (xs: readonly string[]) => xs.map((d) => `'${d}'`).join(", ");
	// Key ranges compare bytes on both databases (SQLite's default; Postgres needs the C collation).
	const k = dialect === "postgres" ? `(${key}) COLLATE "C"` : `(${key})`;
	const bounds = `${range.lo ? ` AND ${k} >= ?` : ""}${range.hi ? ` AND ${k} < ?` : ""}`;
	return `DELETE FROM ${table} WHERE site = ? AND dim IN (${quoted(dims)}) AND ${segs ? `seg IN (${quoted(segs)})` : "seg = ''"} AND day = ? AND ${key} NOT IN (${list})${bounds}`;
}

/** Bytes of one vanished-keys list parameter; D1 refuses a value over 2 MB, so a longer list is split. */
export const VANISHED_LIST_BYTES = 256_000;
const utf8 = new TextEncoder();
const byteOrder = (a: Uint8Array, b: Uint8Array) => {
	for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
	return a.length - b.length;
};

/**
 * The vanished-keys delete of one family for a day's `keys`: one statement, or, when the list passes `max` bytes,
 * one per part of the keys in byte order, each deleting inside its own key range (from its first key to the next
 * part's first) the rows that are not in its part. The ranges cover every key, so the result is the single statement's.
 */
export function vanishedStmts(dialect: Db["dialect"], table: string, dims: readonly string[], key: string, segs: readonly string[] | undefined, site: string, day: string, keys: readonly string[], max = VANISHED_LIST_BYTES): Stmt[] {
	const list = JSON.stringify(keys);
	if (utf8.encode(list).length <= max) return [{ sql: summaryVanishedSql(dialect, table, dims, key, segs), params: [site, day, list] }];
	const sorted = keys.map((k) => [k, utf8.encode(k)] as const).sort((a, b) => byteOrder(a[1], b[1]));
	const parts: string[][] = [];
	let part: string[] = [];
	let size = 2;
	for (const [k] of sorted) {
		const b = utf8.encode(JSON.stringify(k)).length + 1;
		if (part.length && size + b > max) {
			parts.push(part);
			part = [];
			size = 2;
		}
		part.push(k);
		size += b;
	}
	parts.push(part);
	return parts.map((p, i) => {
		const range = { lo: i > 0, hi: i < parts.length - 1 };
		return { sql: summaryVanishedSql(dialect, table, dims, key, segs, range), params: [site, day, JSON.stringify(p), ...(range.lo ? [p[0] as string] : []), ...(range.hi ? [parts[i + 1]?.[0] as string] : [])] };
	});
}

/** `ca_cube` keeps its day as a yyyymmdd integer (bound through a cast, as every integer). */
const CUBE_COLS = ["channel", "country", "device", ...CUBE_METRICS] as const;
export const cubeUpsertSql = (d: Db["dialect"]) => summaryUpsertSql(d, "ca_cube", CUBE_COLS, 3, ["site", "day", "channel", "country", "device"], int(d, 0).sql);
/** Vanished cells of one site and day: the key range `(site, day)` of `ca_cube`, nothing else. */
export const cubeVanishedSql = (d: Db["dialect"]) =>
	`DELETE FROM ca_cube WHERE site = ? AND day = ${int(d, 0).sql} AND channel || '${SEP}' || country || '${SEP}' || device NOT IN (${d === "postgres" ? "SELECT jsonb_array_elements_text(CAST(? AS jsonb))" : "SELECT value FROM json_each(?)"})`;
const ROLLUP_UPSERT = (d: Db["dialect"]) => summaryUpsertSql(d, "ca_rollup", ROLLUP_COLS, 4, ["site", "dim", "seg", "day", "key", "segkey"]);
const REVENUE_UPSERT = (d: Db["dialect"]) => summaryUpsertSql(d, "ca_revenue_daily", REVENUE_COLS, 5, ["site", "dim", "seg", "day", "key", "segkey", "cur"]);
/** Vanished keys of the pair rows, bounded to the pair dims and segments. */
const PAIR_KEY = "dim || '|' || seg || '|' || key || '|' || segkey";
const REVENUE_BASE_DIMS = [...new Set(["all", ...Object.values(ROLLUP_DIM), "goal"])];
/** Every dim of the single `ca_revenue_daily` rows: the order rows and their refund rows. */
const REVENUE_DIMS = [...REVENUE_BASE_DIMS, ...REVENUE_BASE_DIMS.map(refundDim)];
const REVENUE_PAIR_DIMS = [...PAIR_DIMS, ...PAIR_DIMS.map(refundDim)];
const FAMILY_DIMS = [...LINK_DIMS, ...JOURNEY_DIMS];
const FAMILY_SEGS = ["", ...SEGS];

/** Statements that store one day's summary rows of one site: changed rows only, then the keys that vanished. */
function writeDayStmts(dialect: Db["dialect"], site: string, day: string, s: Partial<DaySummary>): Stmt[] {
	const stmts: Stmt[] = [];
	const keys = (rows: ReadonlyArray<{ dim: string; key: string; seg?: string; segkey?: string; cur?: string }>, cur: boolean) =>
		rows.map((r) => (r.seg ? `${r.dim}|${r.seg}|${r.key}|${r.segkey}` : `${r.dim}|${cur ? `${r.cur}|` : ""}${r.key}`));
	const vanished = (table: string, dims: readonly string[], key: string, segs: readonly string[] | undefined, list: readonly string[]) => stmts.push(...vanishedStmts(dialect, table, dims, key, segs, site, day, list));
	if (s.rows) {
		const all = [...s.rows, ...(s.pairs ?? [])];
		for (const part of chunk(all, ROWS_PER_INSERT))
			stmts.push({ sql: ROLLUP_UPSERT(dialect), params: [site, day, JSON.stringify(part.map((r) => [r.dim, r.key, "seg" in r ? r.seg : "", "segkey" in r ? r.segkey : "", ...METRICS.map((m) => r[m])]))] });
		vanished("ca_rollup", ROLLUP_DIMS, "dim || '|' || key", undefined, keys(s.rows, false));
		if (s.pairs) vanished("ca_rollup", PAIR_DIMS, PAIR_KEY, SEGS, keys(s.pairs, false));
	}
	// The link and journey families: their own dims, single and pair rows in one bounded delete per table.
	if (s.links && s.journeys) {
		const fam = [...s.links, ...s.journeys];
		for (const part of chunk(fam, ROWS_PER_INSERT)) stmts.push({ sql: ROLLUP_UPSERT(dialect), params: [site, day, JSON.stringify(part.map((r) => [r.dim, r.key, r.seg, r.segkey, ...METRICS.map((m) => r[m])]))] });
		vanished("ca_rollup", FAMILY_DIMS, PAIR_KEY, FAMILY_SEGS, fam.map((r) => `${r.dim}|${r.seg}|${r.key}|${r.segkey}`));
	}
	if (s.cube) {
		for (const part of chunk(s.cube, ROWS_PER_INSERT)) stmts.push({ sql: cubeUpsertSql(dialect), params: [site, dayInt(day), JSON.stringify(part.map((r) => CUBE_COLS.map((c) => r[c])))] });
		stmts.push({ sql: cubeVanishedSql(dialect), params: [site, dayInt(day), JSON.stringify(s.cube.map((r) => [r.channel, r.country, r.device].join(SEP)))] });
	}
	if (s.linkRevenue) {
		for (const part of chunk(s.linkRevenue, ROWS_PER_INSERT))
			stmts.push({ sql: REVENUE_UPSERT(dialect), params: [site, day, JSON.stringify(part.map((r) => [r.dim, r.key, r.seg, r.segkey, r.cur, r.orders, r.revenue, r.sessions]))] });
		vanished("ca_revenue_daily", LINK_DIMS, `${PAIR_KEY} || '|' || cur`, FAMILY_SEGS, s.linkRevenue.map((r) => `${r.dim}|${r.seg}|${r.key}|${r.segkey}|${r.cur}`));
	}
	if (s.revenue) {
		const own = s.revenue.filter((r) => r.day === day);
		const ownPairs = (s.revenuePairs ?? []).filter((r) => r.day === day);
		const ownCube = (s.revenueCube ?? []).filter((r) => r.day === day);
		for (const part of chunk([...own, ...ownPairs, ...ownCube], ROWS_PER_INSERT))
			stmts.push({ sql: REVENUE_UPSERT(dialect), params: [site, day, JSON.stringify(part.map((r) => [r.dim, r.key, "seg" in r ? r.seg : "", "segkey" in r ? r.segkey : "", r.cur, r.orders, r.revenue, r.sessions]))] });
		vanished("ca_revenue_daily", REVENUE_DIMS, "dim || '|' || cur || '|' || key", undefined, keys(own, true));
		if (s.revenuePairs) vanished("ca_revenue_daily", REVENUE_PAIR_DIMS, `${PAIR_KEY} || '|' || cur`, SEGS, ownPairs.map((r) => `${r.dim}|${r.seg}|${r.key}|${r.segkey}|${r.cur}`));
		if (s.revenueCube) vanished("ca_revenue_daily", ["all", refundDim("all")], "dim || '|' || segkey || '|' || cur", [CUBE_SEG], ownCube.map((r) => `${r.dim}|${r.segkey}|${r.cur}`));
	}
	return stmts;
}

/**
 * Store the summary of one closed day (`ca_rollup`, `ca_cube` and `ca_revenue_daily`). Only rows that differ from the stored
 * ones are written, so a day costs its row count once and a repeat costs 0 rows. Returns the summary row count.
 */
export async function rollupDay(rc: RollupCtx, day: string): Promise<number> {
	const s = await computeDay(rc, day);
	await rc.db.batch(writeDayStmts(rc.db.dialect, rc.site, day, s));
	return summaryRows(s);
}

/** Rows of a day's summary, pairs, links and journeys included. */
export const summaryRows = (s: DaySummary) =>
	s.rows.length + s.pairs.length + s.revenue.length + s.revenuePairs.length + s.links.length + s.linkRevenue.length + s.journeys.length + s.cube.length + s.revenueCube.length;

/**
 * Statements `rollupDay` costs for a site with these goals, at least: the reads (sessions, pages, events, goals ten per statement,
 * revenue, links, journeys), one upsert per table (a day under 500 rows per table) and two deletes per table, plus
 * the link and journey upsert and delete of each table, and the cube's upsert, delete and revenue delete.
 */
export const dayStatements = (goals: readonly Goal[]) =>
	3 + Math.ceil(goals.filter((g) => g.active !== false).length / GOALS_PER_STATEMENT) + 1 + Math.ceil(eventGoals(goals).length / GOALS_PER_STATEMENT) + 2 + 6 + 4 + 3;

// ── reading one family ────────────────────────────────────────────────────────

/** One summary family: table, dim and segment ('' for single dimension rows), optionally one key or one segment value. */
export interface FamilyRead {
	table: "ca_rollup" | "ca_revenue_daily";
	dim: string;
	seg: string;
	key?: string;
	segkey?: string;
}

/**
 * Rows of one link or journey family over a range, summed per key, segment value (and currency): the closed days
 * from the stored rows in one key-range statement `(site, dim, seg, day)`, the open days (after the watermark, see
 * `splitRange`) from the `links`, `linkRevenue` and `journeys` parts of `computeDay` (the shared open-day cache).
 */
export async function readFamily(rc: ReportCtx, from: string, to: string, f: FamilyRead): Promise<Array<Record<string, unknown>>> {
	const rev = f.table === "ca_revenue_daily";
	const metrics: readonly string[] = rev ? ["orders", "revenue"] : METRICS;
	const group = ["r.key", "r.segkey", ...(rev ? ["r.cur"] : [])];
	const { stored, open } = await splitRange(rc, from, to);
	const out = new Map<string, Record<string, unknown>>();
	const add = (r: Record<string, unknown>) => {
		const id = `${String(r.key)}\u0000${String(r.segkey)}\u0000${rev ? String(r.cur) : ""}`;
		const o = out.get(id) ?? { key: String(r.key), segkey: String(r.segkey), ...(rev ? { cur: String(r.cur) } : {}), ...Object.fromEntries(metrics.map((m) => [m, 0])) };
		for (const m of metrics) o[m] = num(o[m]) + num(r[m]);
		out.set(id, o);
	};
	if (stored) {
		const extra = [...(f.key !== undefined ? ["r.key = ?"] : []), ...(f.segkey !== undefined ? ["r.segkey = ?"] : [])];
		const rows = await rc.db.all(
			`SELECT ${group.map((g) => `${g} AS ${g.slice(2)}`).join(", ")}, ${metrics.map((m) => `SUM(r.${m}) AS ${m}`).join(", ")} FROM ${f.table} r WHERE r.site = ? AND r.dim = ? AND r.seg = ? AND r.day BETWEEN ? AND ?${extra.map((x) => ` AND ${x}`).join("")} GROUP BY ${group.join(", ")}`,
			[rc.site, f.dim, f.seg, stored.from, stored.to, ...(f.key !== undefined ? [f.key] : []), ...(f.segkey !== undefined ? [f.segkey] : [])],
		);
		rows.forEach(add);
	}
	const isLink = (LINK_DIMS as readonly string[]).includes(f.dim);
	for (const day of open) {
		const d = await openDay(rc, rc.site, rc.goals, day);
		const rows: ReadonlyArray<FamilyRow | FamilyRevenueRow> = isLink ? (rev ? d.linkRevenue : d.links) : d.journeys;
		rows.filter((r) => r.dim === f.dim && r.seg === f.seg && (f.key === undefined || r.key === f.key) && (f.segkey === undefined || r.segkey === f.segkey)).forEach((r) => add({ ...r }));
	}
	return [...out.values()];
}

// ── the closed-day writer ─────────────────────────────────────────────────────

export { CLOSE_GRACE_S, lastClosedDay } from "../core/time.js";
/** State key of a day being closed: `{ day, site }`, the last site whose summary of `day` is stored. */
export const KV_ROLLUP_CURSOR = "rollup:cursor";
/** KV calls of a tick (watermark and cursor, read and write), kept out of the statement budget. */
const KV_CALLS = 4;


/** Skip scan of the sites of `table` as CTE `name` (the form of `siteScan` in storage.ts, which imports this module). */
const scan = (table: string, name: string) => `${name}(site) AS (SELECT MIN(site) FROM ${table} UNION ALL SELECT (SELECT MIN(site) FROM ${table} WHERE site > ${name}.site) FROM ${name} WHERE ${name}.site IS NOT NULL)`;
/** `WITH RECURSIVE` sources `s` (sites of `ca_sessions`) and `e` (sites of `ca_events`), 1 row read per site. */
const SITES_CTE = `WITH RECURSIVE ${scan("ca_sessions", "s")}, ${scan("ca_events", "e")}`;

/** First day with a visit or an event of any site, or null (two key-range probes per site). */
async function firstDay(db: Db): Promise<string | null> {
	const [r] = await db.all<{ a: unknown; b: unknown }>(
		`${SITES_CTE} SELECT (SELECT MIN((SELECT MIN(day) FROM ca_sessions v WHERE v.site = s.site)) FROM s WHERE s.site IS NOT NULL) AS a, (SELECT MIN((SELECT MIN(day) FROM ca_events o WHERE o.site = e.site)) FROM e WHERE e.site IS NOT NULL) AS b`,
		[],
	);
	const days = [r?.a, r?.b].filter((d) => d != null).map(isoDay);
	return days.length ? (days.sort()[0] as string) : null;
}

/** Sites after `after` with a visit or an order on `day`: the sites of this database, by skip scan and key probes. */
export async function sitesOfDay(db: Db, day: string, after = ""): Promise<string[]> {
	const rows = await db.all<{ site: string }>(
		`${SITES_CTE} SELECT site FROM (SELECT site FROM s UNION SELECT site FROM e) x WHERE site IS NOT NULL AND site > ? AND (EXISTS (SELECT 1 FROM ca_sessions v WHERE v.site = x.site AND v.day = ?) OR EXISTS (SELECT 1 FROM ca_events o WHERE o.site = x.site AND o.day = ? AND o.val IS NOT NULL)) ORDER BY site`,
		[after, visitDayKey(day), dayInt(day)],
	);
	return rows.map((r) => r.site);
}

/** What a cron tick needs: the goals are per site. */
export interface RollupRunCtx {
	db: Db;
	settings: RollupCtx["settings"] & Partial<Pick<Settings, "capacityProfile">>;
	goals(site: string): Promise<readonly Goal[]>;
}

export interface RollupTickResult {
	/** Days touched by this tick, and the site-days stored. */
	days: string[];
	sites: string[];
	rows: number;
	statements: number;
	/** Every summary day up to and including the watermark is stored, for every site. */
	watermark: string | null;
	/** Nothing left to close. */
	done: boolean;
}

/**
 * Cron tick, the closed-day writer: stores the summary of every closed day after the watermark, oldest first,
 * site by site, until the statement budget of the capacity profile is spent. Open days (today, and yesterday until
 * it closes) are never stored. Resumable (`KV_ROLLUP_CURSOR`, saved even when a statement fails) and idempotent
 * (changed-rows upserts), so a repeated or failed run costs no extra rows. An idle tick runs no statement and
 * writes nothing. The watermark (one per database, days in `siteTimezone`) moves only when every site holds the day:
 * retention deletes detailed days up to it.
 */
/** Statements a run spends before its first site-day: the first-day probe and the sites of the day. */
const FIRST_DAY_FIXED = 2;
const tooBig = (site: string, day: string, need: number, limit: number) =>
	new Error(`rollup: storing ${site} on ${day} needs ${need} requests, more than the ${limit} one run of this capacity profile may make; fewer active goals or a larger profile lets it close`);

export async function runRollup(rc: RollupRunCtx, kv: KvLike, now: number, o: { requests?: number } = {}): Promise<RollupTickResult> {
	const last = lastClosedDay(now, rc.settings.siteTimezone);
	const c = counted(rc.db);
	const whole = (PROFILES[rc.settings.capacityProfile ?? "standard"] ?? PROFILES.standard).requests - KV_CALLS;
	const limit = (o.requests ?? whole + KV_CALLS) - KV_CALLS;
	const wm = await kv.get<string>(KV_WATERMARK);
	const cursor = await kv.get<{ day: string; site: string }>(KV_ROLLUP_CURSOR);
	const out: RollupTickResult = { days: [], sites: [], rows: 0, statements: 0, watermark: wm, done: false };
	let day: string | null = wm ? addDays(wm, 1) : null;
	let after = "";
	const goals = new Map<string, readonly Goal[]>();
	try {
		if (!wm) day = await firstDay(c.db);
		if (day && cursor?.day === day) after = cursor.site;
		// Statements plus the storage reads of the goals, which the profile's requests count too.
		let loads = 0;
		const used = () => c.n() + loads;
		days: while (day && day <= last) {
			const sites = await sitesOfDay(c.db, day, after);
			out.days.push(day);
			for (const site of sites) {
				let g = goals.get(site);
				if (!g) {
					loads++;
					g = await rc.goals(site);
					goals.set(site, g);
				}
				// The first site-day of a fresh run may use the profile's whole requests (a database's share can be smaller
				// than one day), never more: past them the platform would stop the run (Workers Free: 50 per invocation).
				const fresh = !out.sites.length && c.n() <= FIRST_DAY_FIXED;
				const cap = fresh ? Math.max(limit, whole) : limit;
				if (used() + dayStatements(g) > cap) {
					if (fresh) throw tooBig(site, day, used() + dayStatements(g), cap);
					break days;
				}
				const sum = await computeDay({ db: c.db, site, settings: rc.settings, goals: g }, day);
				const stmts = writeDayStmts(rc.db.dialect, site, day, sum);
				// A large day needs more upserts than estimated: leave it to the next tick (its reads are repeated, its writes not).
				if (used() + stmts.length > cap) {
					if (fresh) throw tooBig(site, day, used() + stmts.length, cap);
					break days;
				}
				await c.db.batch(stmts);
				out.rows += summaryRows(sum);
				out.sites.push(`${site}@${day}`);
				after = site;
			}
			out.watermark = day;
			day = addDays(day, 1);
			after = "";
			if (used() + 1 > limit) break;
		}
		if (!day || day > last) {
			out.done = true;
			if (!out.watermark || out.watermark < last) out.watermark = last;
		}
	} finally {
		out.statements = c.n();
		if (out.watermark && out.watermark !== wm) await kv.set(KV_WATERMARK, out.watermark);
		// A tick that failed before it reached a day leaves the cursor as it was.
		const next = after ? { day: day as string, site: after } : out.days.length || out.done ? null : cursor;
		if (next && (next.day !== cursor?.day || next.site !== cursor?.site)) await kv.set(KV_ROLLUP_CURSOR, next);
		else if (!next && cursor) await kv.delete(KV_ROLLUP_CURSOR);
	}
	return out;
}

// ── revenue rollup ────────────────────────────────────────────────

export const REVENUE_ROLLUP_MAX_SITES_PER_TICK = 3;
export const REVENUE_RECONCILE_DAYS_PER_TICK = 2;
/** Statements one site may cost in one `revenue` run: the reconcile and two recomputed days of a site without goals, by `dayStatements` (spy-tested). */
export const REVENUE_STATEMENTS_PER_SITE = 39;
export const KV_REVENUE_CURSOR = "revenue:cursor";
/** Requests of a `revenue` run besides the sites: the probe, the watermark and cursor reads, the cursor write. */
const REVENUE_FIXED_REQUESTS = 4;
/** Sites with an order in the raw window or a revenue summary row there: skip scans of both tables, then one key range per site. */
const REVENUE_PROBE = `WITH RECURSIVE e(site) AS (SELECT MIN(site) FROM ca_events UNION ALL SELECT (SELECT MIN(site) FROM ca_events WHERE site > e.site) FROM e WHERE e.site IS NOT NULL),
r(site) AS (SELECT MIN(site) FROM ca_revenue_daily UNION ALL SELECT (SELECT MIN(site) FROM ca_revenue_daily WHERE site > r.site) FROM r WHERE r.site IS NOT NULL)
SELECT site FROM e WHERE site IS NOT NULL AND EXISTS (SELECT 1 FROM ca_events x WHERE x.site = e.site AND x.day >= ? AND x.val IS NOT NULL)
UNION SELECT site FROM r WHERE site IS NOT NULL AND EXISTS (SELECT 1 FROM ca_revenue_daily x WHERE x.site = r.site AND x.dim = 'all' AND x.seg = '' AND x.day >= ?)
ORDER BY site`;
/** Non-goal dims of `ca_revenue_daily` with their key expressions over `h` and `s` (`all` has none). */
const REVENUE_ROLLUP_KEYS: Array<[string, string | null]> = [
	["all", null],
	...(Object.entries(REVENUE_KEYS) as Array<[RevenueDim, string]>).map(([d, k]) => [ROLLUP_DIM[d], k] as [string, string]),
];
const REVENUE_TOP_N = (dim: string) => (dim === "page" || dim === "entry" ? 500 : 200);

export interface RevenueRow {
	day: string;
	dim: string;
	key: string;
	cur: string;
	orders: number;
	revenue: number;
	sessions: number;
	/** Refunded amount booked on this day (computed rows only; stored as a `refund.<dim>` row, see `refundRows`). */
	refunds?: number;
}

/** Keep the top N keys per day, dim and currency by orders; fold the rest into `(other)`. */
export function foldRevenue(rows: RevenueRow[]): RevenueRow[] {
	const groups = new Map<string, RevenueRow[]>();
	for (const r of rows) {
		const g = `${r.day}\u0000${r.dim}\u0000${r.cur}`;
		const list = groups.get(g);
		if (list) list.push(r);
		else groups.set(g, [r]);
	}
	const out: RevenueRow[] = [];
	for (const list of groups.values()) {
		const n = REVENUE_TOP_N(list[0]?.dim ?? "");
		const sorted = list.sort((a, b) => b.orders - a.orders || (a.key < b.key ? -1 : 1));
		if (sorted.length <= n) {
			out.push(...sorted);
			continue;
		}
		const keep = sorted.slice(0, n - 1).filter((r) => r.key !== OTHER);
		const rest = sorted.filter((r) => !keep.includes(r));
		const other = { ...(rest[0] as RevenueRow), key: OTHER, orders: 0, revenue: 0, sessions: 0, refunds: 0 };
		for (const r of rest) addRevenue(other, r);
		out.push(...keep, other);
	}
	return out;
}

/** A `ca_revenue_daily` pair row: `dim` and `key` crossed with segment `seg` and its value `segkey`. */
export type RevenuePairRow = RevenueRow & { seg: Seg; segkey: string };
/** A `ca_revenue_daily` row of the link families (`seg` '' or a segment). */
export type FamilyRevenueRow = RevenueRow & { seg: string; segkey: string };

/** Revenue rows of the given days (single dimension only). */
export const computeRevenueDays = async (rc: RollupCtx, days: readonly string[]): Promise<RevenueRow[]> => (await computeRevenue(rc, days)).revenue;

/**
 * Revenue rows and revenue pairs of the given days: one `UNION ALL` for the nine non-goal dims, one statement per
 * ten event goals. Each statement groups by the three segments too; an order and its visit have one value per
 * segment, so orders, revenue and distinct visits add up across those groups into the single and the pair rows.
 */
async function computeRevenue(rc: RollupCtx, days: readonly string[]): Promise<{ revenue: RevenueRow[]; pairs: RevenuePairRow[]; cube: FamilyRevenueRow[] }> {
	const daysIn = inList(rc.db.dialect, "h.day", days.map(dayInt), true);
	const base = (extra: Frag = TRUE) => {
		const w = andFrags([{ sql: "h.site = ? AND h.val IS NOT NULL", params: [rc.site] }, daysIn, extra]);
		return { sql: `FROM ca_events h LEFT JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid WHERE ${w.sql}`, params: w.params };
	};
	const segKeys = SEGS.map((g) => REVENUE_KEYS[g]);
	const agg = `${segKeys.map((k, i) => `${k} AS ${SEGS[i]}`).join(", ")}, ${ORDER_SUMS}`;
	const by = `h.day, h.cur, ${segKeys.join(", ")}`;
	const parts = REVENUE_ROLLUP_KEYS.map(([dim, k]) => {
		const b = base();
		// `all` has no key expression: Postgres rejects a constant in GROUP BY.
		return { sql: `SELECT '${dim}' AS dim, ${k ?? "''"} AS key, h.day AS day, h.cur AS cur, ${agg} ${b.sql} GROUP BY ${k ? `${k}, ` : ""}${by}`, params: b.params };
	});
	const rows = await rc.db.all(parts.map((p) => p.sql).join(" UNION ALL "), parts.flatMap((p) => p.params));
	const cc: CompileCtx = { db: rc.db, site: rc.site, from: days[0] as string, to: days.at(-1) as string, goals: rc.goals };
	for (const group of chunk(eventGoals(rc.goals), GOALS_PER_STATEMENT)) {
		const gp: Frag[] = [];
		for (const g of group) {
			const b = base(await goalPredicate(cc, g, "h", "event"));
			gp.push({ sql: `SELECT 'goal' AS dim, CAST(? AS TEXT) AS key, h.day AS day, h.cur AS cur, ${agg} ${b.sql} GROUP BY ${by}`, params: [g.name, ...b.params] });
		}
		rows.push(...(await rc.db.all(gp.map((p) => p.sql).join(" UNION ALL "), gp.flatMap((p) => p.params))));
	}
	const single = new Map<string, RevenueRow>();
	const pairs = new Map<string, RevenuePairRow>();
	const cube = new Map<string, FamilyRevenueRow>();
	const add = <T extends RevenueRow>(m: Map<string, T>, id: string, r: T) => {
		const e = m.get(id);
		if (!e) m.set(id, r);
		else addRevenue(e, r);
	};
	for (const r of rows.filter((x) => (num(x.orders) > 0 || num(x.refunds) > 0) && typeof x.cur === "string")) {
		const v: RevenueRow = { day: isoDay(r.day), dim: String(r.dim), key: String(r.key), cur: String(r.cur), orders: num(r.orders), revenue: num(r.revenue), sessions: num(r.sessions), refunds: num(r.refunds) };
		add(single, [v.day, v.dim, v.cur, v.key].join("\u0000"), { ...v });
		if (v.dim in PAIR_WEIGHTS) for (const seg of SEGS) add(pairs, [v.day, v.dim, seg, v.cur, v.key, r[seg]].join("\u0000"), { ...v, seg, segkey: String(r[seg]) });
		if (v.dim === "all") {
			const segkey = SEGS.map((g) => String(r[g])).join(SEP);
			add(cube, [v.day, v.cur, segkey].join("\u0000"), { ...v, seg: CUBE_SEG, segkey });
		}
	}
	const cubeCap = CUBE_CAP[rc.settings.capacityProfile ?? "standard"];
	const cells = foldGroups([...cube.values()], (r) => `${r.day}\u0000${r.cur}`, (g) => foldCube(g, cubeCap, (r) => r.orders, addRevenue));
	return { revenue: refundRows(foldRevenue([...single.values()])), pairs: refundRows(foldRevenuePairs(rc, [...pairs.values()])), cube: refundRows(cells) };
}

/**
 * The stored form of folded rows: each row with orders, plus one `refund.<dim>` row (same seg, key, segkey and
 * currency; `revenue` the refunded amount, `orders` and `sessions` 0) for each row with refunds. A refund counts on
 * its own day with the original order's attribution, so a day can hold refunds of a key without orders.
 */
function refundRows<T extends RevenueRow>(rows: T[]): T[] {
	const out = rows.filter((r) => r.orders > 0);
	for (const r of rows) if ((r.refunds ?? 0) > 0) out.push({ ...r, dim: refundDim(r.dim), orders: 0, revenue: r.refunds as number, sessions: 0, refunds: 0 });
	return out;
}

/** Fold every revenue pair family (day, dim, segment and currency) to the cap of its dim, ranked by orders. */
function foldRevenuePairs(rc: RollupCtx, rows: RevenuePairRow[]): RevenuePairRow[] {
	const groups = new Map<string, RevenuePairRow[]>();
	for (const r of rows) {
		const g = `${r.day}\u0000${r.dim}\u0000${r.seg}\u0000${r.cur}`;
		const list = groups.get(g);
		if (list) list.push(r);
		else groups.set(g, [r]);
	}
	return [...groups.values()].flatMap((list) =>
		foldPairs(list, pairCap(rc.settings.capacityProfile, list[0]?.dim as PairDim), (r) => r.orders, addRevenue),
	);
}

const addRevenue = (into: RevenueRow, r: RevenueRow) => {
	into.orders += r.orders;
	into.revenue += r.revenue;
	into.sessions += r.sessions;
	into.refunds = (into.refunds ?? 0) + (r.refunds ?? 0);
};

/** Store the `ca_revenue_daily` rows of the given days (changed rows only, vanished keys deleted). */
export async function rollupRevenueDays(rc: RollupCtx, days: readonly string[]): Promise<number> {
	const r = await computeRevenue(rc, days);
	await rc.db.batch(days.flatMap((d) => writeDayStmts(rc.db.dialect, rc.site, d, { revenue: r.revenue, revenuePairs: r.pairs, revenueCube: r.cube })));
	return r.revenue.length + r.pairs.length + r.cube.length;
}

export const rollupRevenue = (rc: RollupCtx, day: string) => rollupRevenueDays(rc, [day]);

/** Wraps a database to count statements (batches count each statement). */
/** `db` with every statement counted (a batch counts each). */
export function counted(db: Db): { db: Db; n: () => number } {
	let n = 0;
	return {
		n: () => n,
		db: { dialect: db.dialect, run: (s, p) => (n++, db.run(s, p)), all: (s, p) => (n++, db.all(s, p)), batch: (st) => ((n += st.length), db.batch(st)) },
	};
}

/**
 * Days of the reconcile window whose raw totals per currency differ from the `all` rows of
 * `ca_revenue_daily` (late agent events, corrections, voids and refunds), or whose orders without a counted visit
 * differ from the stored channel `(not set)` row (an agent call that attaches a visit to an order stored without one
 * changes the attribution, not the totals). An order whose visit is gone (retention) is counted apart: the stored row
 * may match with or without it, as the day was stored before or after the visit went. One statement.
 */
export async function revenueDrift(db: Db, site: string, from: string, to: string): Promise<string[]> {
	if (from > to) return [];
	const rows = await db.all(
		`SELECT 'r' AS src, CAST(h.day AS TEXT) AS day, h.cur AS cur, ${ORDER_SUMS}, SUM(CASE WHEN h.val >= 0 AND (h.sid IS NULL OR s.sid IS NOT NULL) AND ${REVENUE_KEYS.channel} = ${NOT_SET} THEN 1 ELSE 0 END) AS unset, SUM(CASE WHEN h.val >= 0 AND h.sid IS NOT NULL AND s.sid IS NULL THEN 1 ELSE 0 END) AS orphans FROM ca_events h LEFT JOIN ca_sessions s ON s.site = h.site AND s.day = h.sday AND s.sid = h.sid WHERE h.site = ? AND h.day BETWEEN ? AND ? AND h.val IS NOT NULL GROUP BY h.day, h.cur
UNION ALL SELECT CASE WHEN dim = 'all' THEN 'd' WHEN dim = 'channel' THEN 'u' ELSE 'f' END AS src, day, cur, orders, revenue, 0 AS refunds, 0 AS sessions, 0 AS unset, 0 AS orphans FROM ca_revenue_daily WHERE site = ? AND (dim IN ('all', '${refundDim("all")}') OR (dim = 'channel' AND key = ${NOT_SET})) AND seg = '' AND day BETWEEN ? AND ?`,
		[site, dayInt(from), dayInt(to), site, from, to],
	);
	// Orders, gross revenue, refunds and orders without a counted visit per day and currency, raw (`r`) and stored
	// (`d` order rows, `f` refund rows, `u` the channel `(not set)` row).
	const seen = new Map<string, { r: number[]; d: number[]; orphans: number }>();
	for (const r of rows) {
		const k = `${isoDay(r.day)}\u0000${String(r.cur)}`;
		const e = seen.get(k) ?? { r: [0, 0, 0, 0], d: [0, 0, 0, 0], orphans: 0 };
		const m = (v: unknown) => roundMinor(num(v), String(r.cur));
		if (r.src === "r") (e.r = [num(r.orders), m(r.revenue), m(r.refunds), num(r.unset)]), (e.orphans = num(r.orphans));
		else if (r.src === "d") (e.d[0] = num(r.orders)), (e.d[1] = m(r.revenue));
		else if (r.src === "u") e.d[3] = num(r.orders);
		else e.d[2] = m(r.revenue);
		seen.set(k, e);
	}
	const days = new Set<string>();
	// The (not set) row may hold the orphans too: a day stored again after their visits went keeps them there.
	for (const [k, e] of seen) if (e.r.some((v, i) => v !== e.d[i] && !(i === 3 && v + e.orphans === e.d[3]))) days.add(k.split("\u0000")[0] as string);
	return [...days].sort();
}

export interface RevenueTickResult {
	sites: Array<{ site: string; statements: number; recomputed: string[]; pending: number }>;
	cursor: string | null;
}

/**
 * The `revenue` cron task: for at most 3 sites with revenue (KV cursor), reconcile the closed days of
 * the raw window (from the day after `rawFrom`, the caller's `rawFromDay`, up to the rollup watermark) and store
 * again at most two differing days with `rollupDay` (changed rows only), within the statements per site. Open days
 * are never stored; late orders of a closed day (agent events, corrections, voids) are what this catches.
 */
export async function runRevenue(rc: RollupRunCtx, kv: KvLike, now: number, rawFrom: string, o: { requests?: number } = {}): Promise<RevenueTickResult> {
	const yesterday = addDays(dayInZone(now, rc.settings.siteTimezone), -1);
	const wm = await kv.get<string>(KV_WATERMARK);
	const to = wm && wm < addDays(yesterday, -1) ? wm : addDays(yesterday, -1);
	// The probe: sites with a revenue row in the raw window, plus sites whose rollup rows there may be stale. The
	// sites come from skip scans (one row read per site) and each is checked by a key range, so no table is scanned.
	const all = (await rc.db.all<{ site: string }>(REVENUE_PROBE, [dayInt(rawFrom), rawFrom])).map((r) => r.site);
	// One invocation stays inside the profile's requests (or this database's share of them): the probe, the cursor and watermark, then sites in turn.
	const budget = (o.requests ?? PROFILES[rc.settings.capacityProfile ?? "standard"].requests) - REVENUE_FIXED_REQUESTS;
	let used = 0;
	const cursor = await kv.get<string>(KV_REVENUE_CURSOR);
	const after = all.filter((s) => !cursor || s > cursor);
	const pick = (after.length ? after : all).slice(0, REVENUE_ROLLUP_MAX_SITES_PER_TICK);
	const out: RevenueTickResult = { sites: [], cursor: null };
	for (const site of pick) {
		// Each site's share: its own cap, or what is left of the invocation (the goal load counts as one request).
		const cap = Math.min(REVENUE_STATEMENTS_PER_SITE, budget - used - 1);
		if (cap < 1) break;
		const c = counted(rc.db);
		const goals = await rc.goals(site);
		const sc: RollupCtx = { db: c.db, site, settings: rc.settings, goals };
		const drift = wm ? (await revenueDrift(c.db, site, addDays(rawFrom, 1), to)).slice(0, REVENUE_RECONCILE_DAYS_PER_TICK) : [];
		const recomputed: string[] = [];
		for (const d of drift) {
			if (c.n() + dayStatements(goals) > cap) break;
			const stmts = writeDayStmts(rc.db.dialect, site, d, await computeDay(sc, d));
			// The real write count (a day with many rows needs several upserts): a day that does not fit waits as `pending`.
			if (c.n() + stmts.length > cap) break;
			await c.db.batch(stmts);
			recomputed.push(d);
		}
		used += c.n() + 1;
		out.sites.push({ site, statements: c.n(), recomputed, pending: drift.length - recomputed.length });
	}
	// The next run starts after the last site this one reached.
	const last = out.sites.at(-1)?.site;
	out.cursor = last && last !== all.at(-1) ? last : null;
	if (out.cursor) await kv.set(KV_REVENUE_CURSOR, out.cursor);
	else await kv.delete(KV_REVENUE_CURSOR);
	return out;
}
