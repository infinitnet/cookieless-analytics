/**
 * Revenue reports: `revenue`, `revenue_series`, `revenue_breakdown`, the `withRevenue`
 * merge and `hasRevenue`. Every figure is within one currency: sums are grouped by `cur` or restricted to
 * `cur = ?`, never added across codes. Raw statements read `ca_events h LEFT JOIN ca_sessions s` with the
 * range on the order's own day (`revenueWhere`); ranges answered from the summaries read `ca_revenue_daily` (stored and open days). Visitor
 * counts per page, event and goal come from the visit documents (`hitJoin`).
 */
import { dayInZone, eachDay, hourInZone } from "../../core/time.js";
import { dayInt, isoDay } from "../../db/dialect.js";
import { isCurrency, normalizeCurrency, roundMinor } from "../../core/currency.js";
import { andFrags, type CompileCtx, entryCols, type Frag, goalPredicate, type HitSource, QueryError, TRUE } from "../compile.js";
import { type Goal, REVENUE_BREAKDOWN_DIMS } from "../filters.js";
import {
	annotationsIn,
	hitJoin,
	num,
	ORDER_SUMS,
	type Point,
	type ReportCtx,
	type ReportData,
	revenueWhere,
	type Row,
	type RunInput,
	ratio,
	round,
	sessionAggSql,
} from "./base.js";
import { type Plan, planFilters, planRevenue, planRows } from "./summary.js";
import type { RollupDim } from "../rollup.js";
import { hourKey, resolveGranularity, weekStart } from "./timeseries.js";

export type RevenueDim = (typeof REVENUE_BREAKDOWN_DIMS)[number];
export { REVENUE_BREAKDOWN_DIMS };
export const REVENUE_REPORTS = ["revenue", "revenue_series", "revenue_breakdown"] as const;
/** Most orders `revenue_orders` lists. */
export const RECENT_ORDERS_CAP = 50;

/** Rollup dim of `ca_revenue_daily` and `ca_rollup` per breakdown dim. */
export const ROLLUP_DIM: Record<RevenueDim, string> = {
	channel: "channel",
	source: "source",
	campaign: "utm_campaign",
	entry: "entry",
	page: "page",
	country: "country",
	device: "device",
	goal: "goal",
	event: "event",
};

const NOT_SET = "'(not set)'";
/** A hit whose session row is missing or has no pageview is `(not set)` in every session dim. */
const sess = (col: string) => `CASE WHEN s.pageviews > 0 THEN COALESCE(s.${col}, ${NOT_SET}) ELSE ${NOT_SET} END`;
/** Key expressions over `h` and `s` per non-goal dim (shared with the rollup). */
export const REVENUE_KEYS: Record<Exclude<RevenueDim, "goal">, string> = {
	channel: sess("channel"),
	source: sess("source"),
	campaign: sess("utm_campaign"),
	entry: sess("entry_path"),
	country: sess("country"),
	device: sess("device"),
	page: `COALESCE(h.path, ${NOT_SET})`,
	event: "h.name",
};
/** Session-side key expressions (pageviews > 0 there), equal to the keys above for the same session. */
const VISITOR_KEYS: Partial<Record<RevenueDim, string>> = {
	channel: `COALESCE(s.channel, ${NOT_SET})`,
	source: `COALESCE(s.source, ${NOT_SET})`,
	campaign: `COALESCE(s.utm_campaign, ${NOT_SET})`,
	entry: `COALESCE(s.entry_path, ${NOT_SET})`,
	country: `COALESCE(s.country, ${NOT_SET})`,
	device: `COALESCE(s.device, ${NOT_SET})`,
};
const OTHER = "(other)";
/** Parameters per goal statement; D1 allows 100. */
const GOAL_PARAM_BUDGET = 90;

/** The report currency: `params.currency` or the site default, validated (typed `invalid_currency`). */
export function currencyOf(rc: ReportCtx, input: Pick<RunInput, "params">): string {
	const asked = input.params.currency;
	if (asked !== undefined) {
		const c = normalizeCurrency(asked);
		if (!c) throw new QueryError("invalid_currency", `Unknown currency: ${String(asked).slice(0, 8)}`);
		return c;
	}
	return isCurrency(rc.defaultCurrency) ? rc.defaultCurrency : "USD";
}

export function dimOf(input: Pick<RunInput, "params">): RevenueDim {
	const d = input.params.dim;
	if (!(REVENUE_BREAKDOWN_DIMS as readonly string[]).includes(d ?? "")) throw new QueryError("invalid_params", `revenue_breakdown needs params.dim, one of ${REVENUE_BREAKDOWN_DIMS.join(", ")}.`);
	return d as RevenueDim;
}

const money = (v: number | null, cur: string) => (v === null ? null : roundMinor(v, cur));

export interface CurrencyEntry {
	currency: string;
	revenue: number;
	/** Refunded amount booked in the range (docs/revenue.md, refunds); `net_revenue` is `revenue - refunds`. */
	refunds: number;
	net_revenue: number;
	orders: number;
	aov: number | null;
	revenue_per_visitor: number | null;
	paying_sessions: number;
}

/** Per-currency entries, the selected one first, the others by orders then code (money is never ranked across codes). */
export function currencyList(rows: ReadonlyArray<Record<string, unknown>>, visitors: number | null, selected: string): CurrencyEntry[] {
	return rows
		.filter((r) => (num(r.orders) > 0 || num(r.refunds) > 0) && typeof r.cur === "string")
		.map((r) => {
			const cur = String(r.cur);
			const revenue = roundMinor(num(r.revenue), cur);
			const refunds = roundMinor(num(r.refunds), cur);
			const orders = num(r.orders);
			return { currency: cur, revenue, refunds, net_revenue: roundMinor(revenue - refunds, cur), orders, aov: money(ratio(revenue, orders), cur), revenue_per_visitor: visitors === null ? null : round(ratio(revenue, visitors)), paying_sessions: num(r.sessions) };
		})
		.sort((a, b) => (a.currency === selected ? -1 : b.currency === selected ? 1 : b.orders - a.orders || (a.currency < b.currency ? -1 : 1)));
}

/**
 * The summary plan of a revenue read: filters on one segment apply (to the totals, and through a pair row to a
 * breakdown by a pair dimension). `dim` is the breakdown's dimension; its header uses the same plan.
 */
export const revenuePlan = (input: Pick<RunInput, "filters">, dim?: RevenueDim): Plan => planFilters(input.filters, dim ? (ROLLUP_DIM[dim] as RollupDim) : null, true);

/** The totals of a breakdown: its own plan only when a filter on its dimension applies (an order may match no goal, or several). */
function headerPlan(input: Pick<RunInput, "filters">, dim?: RevenueDim): Plan {
	const own = revenuePlan(input, dim);
	return dim && own.applied.some((f) => f.dim === ROLLUP_DIM[dim]) ? own : revenuePlan(input);
}

async function currencyRows(rc: ReportCtx, input: RunInput, dim?: RevenueDim): Promise<Array<Record<string, unknown>>> {
	if (input.summary) return planRevenue(rc, input, headerPlan(input, dim));
	const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE);
	return rc.db.all(`SELECT h.cur AS cur, ${ORDER_SUMS} ${w.sql} GROUP BY h.cur`, w.params);
}

/** Visitors and sessions of the filtered set: the Overview figures (raw) or the `all` rollup rows. */
async function audience(rc: ReportCtx, input: RunInput, dim?: RevenueDim): Promise<{ visitors: number; sessions: number }> {
	if (input.summary) {
		// With a filter on a page, event or goal breakdown's own dim, visitors and sessions are summed over its keys.
		const [r] = await planRows(rc, input, headerPlan(input, dim), null);
		return { visitors: num(r?.visitors), sessions: num(r?.sessions) };
	}
	const q = sessionAggSql(rc, input, null);
	const [r] = await rc.db.all(q.sql, q.params);
	return { visitors: num(r?.visitors), sessions: num(r?.sessions) };
}

/**
 * Any revenue for the site: one row of the raw window (through the partial index) or of
 * `ca_revenue_daily`. Two `SELECT 1 ... LIMIT 1` in one statement.
 */
export async function hasRevenue(rc: Pick<ReportCtx, "db" | "site" | "rawFrom">): Promise<boolean> {
	const [r] = await rc.db.all(
		`SELECT (SELECT 1 FROM ca_events WHERE site = ? AND day >= ? AND val IS NOT NULL LIMIT 1) AS raw, (SELECT 1 FROM ca_revenue_daily WHERE site = ? LIMIT 1) AS rolled`,
		[rc.site, rc.rawFrom ? dayInt(rc.rawFrom) : 0, rc.site],
	);
	return num(r?.raw) > 0 || num(r?.rolled) > 0;
}

export const metaOf = (list: CurrencyEntry[], cur: string) => ({ currency: cur, currencies: list, other_currencies: list.filter((c) => c.currency !== cur).map((c) => c.currency) });

/** `revenue`: totals in one currency, the per-currency list, `hasRevenue`; `rows` is the list for export. */
export async function revenue(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const cur = currencyOf(rc, input);
	const rows = await currencyRows(rc, input);
	const aud = await audience(rc, input);
	const list = currencyList(rows, aud.visitors, cur);
	const own = list.find((c) => c.currency === cur);
	const rev = own?.revenue ?? 0;
	const orders = own?.orders ?? 0;
	const totals = {
		revenue: rev,
		refunds: own?.refunds ?? 0,
		net_revenue: own?.net_revenue ?? 0,
		orders,
		aov: money(ratio(rev, orders), cur),
		revenue_per_visitor: round(ratio(rev, aud.visitors)),
		revenue_per_session: round(ratio(rev, aud.sessions)),
		paying_sessions: own?.paying_sessions ?? 0,
		visitors: aud.visitors,
		sessions: aud.sessions,
	};
	const data: ReportData = { ...metaOf(list, cur), totals, rows: list.map((c) => ({ key: c.currency, ...c })) };
	if (!input.isCompare && !input.lean) data.hasRevenue = list.length > 0 || (await hasRevenue(rc));
	return data;
}

/** `revenue_series`: revenue, refunds, net revenue, orders and average order value per bucket in one currency, zero filled. */
export async function revenueSeries(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const cur = currencyOf(rc, input);
	const asked = resolveGranularity(input.granularity, input.from, input.to);
	const rolled = input.summary;
	const gran = rolled && asked === "hour" ? "day" : asked;
	const byHour = gran === "hour";
	let rows: Array<Record<string, unknown>>;
	if (rolled) rows = (await planRevenue(rc, input, revenuePlan(input), { byDay: true, cur })).map((r) => ({ ...r, hour: 0 }));
	else {
		const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE, { sql: "h.cur = ?", params: [cur] });
		// Hours by the order's own time: quarter hours (every zone offset is a multiple of 15 minutes), placed in the site zone here.
		const tz = rc.settings.siteTimezone;
		rows = (await rc.db.all(`SELECT h.day AS day, ${byHour ? "h.ts / 900" : "0"} AS q, ${ORDER_SUMS} ${w.sql} GROUP BY h.day${byHour ? ", h.ts / 900" : ""}`, w.params)).map(
			(r) => (byHour ? { ...r, day: dayInZone(num(r.q) * 900, tz), hour: hourInZone(num(r.q) * 900, tz) } : { ...r, day: isoDay(r.day), hour: 0 }),
		);
	}
	const buckets = new Map<string, { orders: number; revenue: number; refunds: number }>();
	for (const day of eachDay(input.from, input.to)) {
		const ks = byHour ? Array.from({ length: 24 }, (_, h) => hourKey(day, h)) : [gran === "week" ? weekStart(day) : day];
		for (const k of ks) if (!buckets.has(k)) buckets.set(k, { orders: 0, revenue: 0, refunds: 0 });
	}
	for (const r of rows) {
		const day = String(r.day);
		const b = buckets.get(byHour ? hourKey(day, num(r.hour)) : gran === "week" ? weekStart(day) : day);
		if (!b) continue;
		b.orders += num(r.orders);
		b.revenue += num(r.revenue);
		b.refunds += num(r.refunds);
	}
	const series: Point[] = [...buckets].map(([t, b]) => {
		const rev = roundMinor(b.revenue, cur);
		const refunds = roundMinor(b.refunds, cur);
		return { t, revenue: rev, refunds, net_revenue: roundMinor(rev - refunds, cur), orders: b.orders, aov: money(ratio(rev, b.orders), cur) };
	});
	const list = currencyList(await currencyRows(rc, input), (await audience(rc, input)).visitors, cur);
	const data: ReportData = { ...metaOf(list, cur), series, granularity: gran };
	if (input.isCompare) return data;
	return { ...data, annotations: annotationsIn(rc, input.from, input.to), ...(rolled && asked === "hour" ? { notices: ["granularity_day"] } : {}) };
}

/** Active event goals: the only goals that carry revenue. */
export const eventGoals = (goals: readonly Goal[]) => goals.filter((g) => g.active !== false && g.type === "event");

/** Per goal parts of one `UNION ALL`, split so that no statement binds more than 90 parameters. */
async function goalUnion(rc: ReportCtx, input: RunInput, goals: readonly Goal[], from: HitSource, part: (key: string, pred: Frag) => Frag): Promise<Array<Record<string, unknown>>> {
	const cc: CompileCtx = { db: rc.db, site: rc.site, from: input.from, to: input.to, goals: rc.goals };
	const parts: Frag[] = [];
	for (const g of goals) parts.push(part(g.name, await goalPredicate(cc, g, "h", from)));
	const out: Array<Record<string, unknown>> = [];
	let batch: Frag[] = [];
	const flush = async () => {
		if (!batch.length) return;
		out.push(...(await rc.db.all(batch.map((p) => p.sql).join(" UNION ALL "), batch.flatMap((p) => p.params))));
		batch = [];
	};
	for (const p of parts) {
		if (batch.length && batch.reduce((n, b) => n + b.params.length, 0) + p.params.length > GOAL_PARAM_BUDGET) await flush();
		batch.push(p);
	}
	await flush();
	return out;
}

/** Revenue rows of the selected currency per key of `dim` (raw or rollup). */
export async function revenueByKey(rc: ReportCtx, input: RunInput, dim: RevenueDim, cur: string): Promise<Map<string, { revenue: number; refunds: number; orders: number; sessions: number }>> {
	let rows: Array<Record<string, unknown>>;
	if (input.summary) {
		rows = await planRevenue(rc, input, revenuePlan(input, dim), { byKey: true, cur });
	} else if (dim === "goal") {
		const goals = eventGoals(rc.goals);
		rows = goals.length
			? await goalUnion(rc, input, goals, "event", (key, pred) => {
					const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE, andFrags([{ sql: "h.cur = ?", params: [cur] }, pred]));
					return { sql: `SELECT CAST(? AS TEXT) AS key, ${ORDER_SUMS} ${w.sql}`, params: [key, ...w.params] };
				})
			: [];
	} else {
		const k = REVENUE_KEYS[dim];
		const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE, { sql: "h.cur = ?", params: [cur] });
		rows = await rc.db.all(`SELECT ${k} AS key, ${ORDER_SUMS} ${w.sql} GROUP BY ${k}`, w.params);
	}
	return new Map(
		rows
			.filter((r) => num(r.orders) > 0 || num(r.refunds) > 0)
			.map((r) => [String(r.key), { revenue: roundMinor(num(r.revenue), cur), refunds: roundMinor(num(r.refunds), cur), orders: num(r.orders), sessions: num(r.sessions) }]),
	);
}

/** Visitors and sessions per key from the matching breakdown statement; null when the source has none. */
async function visitorsByKey(rc: ReportCtx, input: RunInput, dim: RevenueDim): Promise<Map<string, { visitors: number | null; sessions: number | null }>> {
	const out = new Map<string, { visitors: number | null; sessions: number | null }>();
	if (input.summary) {
		// `goal` and `event` keep no visitors in the rollup; `(other)` folds different keys on each table.
		if (dim === "goal" || dim === "event") return out;
		const rows = await planRows(rc, input, revenuePlan(input, dim), ROLLUP_DIM[dim] as RollupDim);
		for (const r of rows) if (String(r.key) !== OTHER) out.set(String(r.key), { visitors: num(r.visitors), sessions: num(r.sessions) });
		return out;
	}
	let rows: Array<Record<string, unknown>>;
	const h = entryCols(rc.db.dialect);
	const perDay = (key: string, j: Frag, group: string) => ({
		sql: `SELECT t.key AS key, SUM(t.visitors) AS visitors, SUM(t.sessions) AS sessions FROM (SELECT ${key} AS key, s.day AS day, COUNT(DISTINCT s.vkey) AS visitors, COUNT(DISTINCT s.sid) AS sessions ${j.sql} GROUP BY ${group}s.day) t GROUP BY t.key`,
		params: j.params,
	});
	if (dim === "page") {
		const q = perDay(h.path, hitJoin(rc, input, "pv"), `${h.path}, `);
		rows = await rc.db.all(q.sql, q.params);
	} else if (dim === "event") {
		const q = perDay(h.name, hitJoin(rc, input, "ev"), `${h.name}, `);
		rows = await rc.db.all(q.sql, q.params);
	} else if (dim === "goal") {
		const goals = eventGoals(rc.goals);
		rows = goals.length
			? await goalUnion(rc, input, goals, "entry", (key, pred) => {
					const j = hitJoin(rc, input, "ev", pred);
					const q = perDay("CAST(? AS TEXT)", j, "");
					return { sql: q.sql, params: [key, ...q.params] };
				})
			: [];
	} else {
		const q = sessionAggSql(rc, input, VISITOR_KEYS[dim] as string);
		rows = await rc.db.all(q.sql, q.params);
	}
	for (const r of rows) out.set(String(r.key), { visitors: num(r.visitors), sessions: num(r.sessions) });
	return out;
}

/** `revenue_breakdown`: rows of one dim in one currency ranked by revenue, then orders, then key. */
export async function revenueBreakdown(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const cur = currencyOf(rc, input);
	const dim = dimOf(input);
	const list = currencyList(await currencyRows(rc, input, dim), (await audience(rc, input, dim)).visitors, cur);
	const rev = await revenueByKey(rc, input, dim, cur);
	const vis = await visitorsByKey(rc, input, dim);
	const keys = new Set([...rev.keys(), ...vis.keys()]);
	const rows: Row[] = [...keys].map((key) => {
		const r = rev.get(key);
		const v = vis.get(key);
		const revenue = r?.revenue ?? 0;
		const refunds = r?.refunds ?? 0;
		const orders = r?.orders ?? 0;
		const visitors = v?.visitors ?? null;
		return { key, revenue, refunds, net_revenue: roundMinor(revenue - refunds, cur), orders, aov: money(ratio(revenue, orders), cur), revenue_per_visitor: visitors === null ? null : round(ratio(revenue, visitors)), visitors, sessions: v?.sessions ?? null, currency: cur };
	});
	// Refunds rank too, so a refund-only key is not cut by the limit behind keys without money.
	rows.sort((a, b) => num(b.revenue) - num(a.revenue) || num(b.orders) - num(a.orders) || num(b.refunds) - num(a.refunds) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	return { ...metaOf(list, cur), dim, rows: rows.slice(input.offset, input.offset + input.limit), truncated: rows.length > input.offset + input.limit };
}

/**
 * `revenue_orders`: the newest orders and refunds of the range in one currency, from the detailed rows only (no
 * summary form, so a range before the detailed window answers `raw_only`). Each row is the stored order reference
 * (a hash of the order id, or the hit id), its day, the amount (negative for a refund) and its visit's first touch;
 * never a session or visitor key. At most `RECENT_ORDERS_CAP` rows.
 */
export async function revenueOrders(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const cur = currencyOf(rc, input);
	const cap = Math.min(input.limit, RECENT_ORDERS_CAP);
	const w = revenueWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE, { sql: "h.cur = ?", params: [cur] });
	const rows = await rc.db.all(
		`SELECT h.id AS id, h.day AS day, h.val AS val, ${REVENUE_KEYS.channel} AS channel, ${REVENUE_KEYS.entry} AS entry, ${REVENUE_KEYS.country} AS country ${w.sql} ORDER BY h.ts DESC, h.id DESC LIMIT ?`,
		[...w.params, cap + 1],
	);
	return {
		currency: cur,
		rows: rows.slice(0, cap).map((r) => ({ key: String(r.id), day: isoDay(r.day), amount: roundMinor(num(r.val), cur), refund: num(r.val) < 0, channel: String(r.channel), entry: String(r.entry), country: String(r.country) })),
		truncated: rows.length > cap,
	};
}

/** Base report to revenue dim of `withRevenue: true`. */
export const WITH_REVENUE: Readonly<Record<string, RevenueDim>> = {
	channels: "channel",
	sources: "source",
	campaigns: "campaign",
	pages: "page",
	entry_pages: "entry",
	countries: "country",
	devices: "device",
	events: "event",
	goals: "goal",
};

/**
 * Merge `revenue`, `refunds`, `net_revenue`, `orders` and `revenue_currency` into the base rows by key (one extra statement pair,
 * no SQL join). Page and outbound goals carry null. A key with revenue but no base row is appended with
 * null base metrics when the base rows are complete (first page, not truncated).
 */
export async function withRevenue(rc: ReportCtx, input: RunInput, report: string, data: ReportData): Promise<ReportData> {
	const dim = WITH_REVENUE[report];
	if (!dim || !data.rows) return data;
	if (report === "campaigns" && input.params.field && input.params.field !== "utm_campaign") return { ...data, notices: [...(data.notices ?? []), "revenue_not_available"] };
	// Summary revenue that cannot apply the report's filters is left out rather than shown unfiltered.
	if (input.summary && revenuePlan(input, dim).unavailable.length) return { ...data, notices: [...(data.notices ?? []), "revenue_not_available"] };
	const cur = currencyOf(rc, input);
	const list = currencyList(await currencyRows(rc, input, dim), null, cur);
	const rev = await revenueByKey(rc, input, dim, cur);
	const types = new Map(rc.goals.map((g) => [g.name, g.type]));
	const seen = new Set<string>();
	const rows: Row[] = data.rows.map((row) => {
		seen.add(row.key);
		if (dim === "goal" && types.get(row.key) !== "event") return { ...row, revenue: null, refunds: null, net_revenue: null, orders: null, revenue_currency: cur };
		const r = rev.get(row.key);
		return { ...row, revenue: r?.revenue ?? 0, refunds: r?.refunds ?? 0, net_revenue: roundMinor((r?.revenue ?? 0) - (r?.refunds ?? 0), cur), orders: r?.orders ?? 0, revenue_currency: cur };
	});
	if (!data.truncated && input.offset === 0 && dim !== "goal")
		for (const [key, r] of rev)
			if (!seen.has(key)) rows.push({ key, visitors: null, sessions: null, revenue_per_visitor: null, revenue: r.revenue, refunds: r.refunds, net_revenue: roundMinor(r.revenue - r.refunds, cur), orders: r.orders, revenue_currency: cur });
	return { ...data, rows, currency: cur, currencies: list.map(({ revenue_per_visitor: _r, ...c }) => c) };
}
