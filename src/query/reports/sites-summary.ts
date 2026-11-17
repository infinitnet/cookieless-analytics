/**
 * `sites_summary`: one row per site of this database from the summaries, revenue as a per-currency
 * list. Two statements over the stored days, each naming the sites (`site IN (...)` as one JSON parameter), so the
 * primary keys, which lead with `site`, serve them; the open days (today, and yesterday until it closes) are
 * computed per site with `computeDay` (cached 60 seconds), so today's figures are current. With site routing
 * (`rc.sitesDb`) the sites are grouped by database and each group is read from its own database with its own
 * watermark; no statement spans two databases.
 */
import type { KvLike } from "../../core/crypto.js";
import { roundMinor } from "../../core/currency.js";
import type { Db } from "../../db/adapter.js";
import { pluginFactsOrNull, stateKv } from "../../db/facts.js";
import { MAX_SITES } from "../../multisite/registry.js";
import { inList, QueryError } from "../compile.js";
import { KV_WATERMARK } from "../rollup.js";
import { num, type ReportCtx, type ReportData, type Row, type RunInput, ratio, round, type SitesDb } from "./base.js";
import { openDay, splitRange } from "./summary.js";

export interface RevenueEntry {
	currency: string;
	revenue: number;
	orders: number;
}

/** Revenue entries per currency, largest first, amounts rounded to the currency's minor unit. */
function revenueList(m: Map<string, { revenue: number; orders: number }> | undefined): RevenueEntry[] {
	return [...(m ?? [])].map(([currency, v]) => ({ currency, revenue: roundMinor(v.revenue, currency), orders: v.orders })).sort((a, b) => b.revenue - a.revenue || (a.currency < b.currency ? -1 : 1));
}

/** Totals over summary rows: sessions and pageviews summed, revenue per currency, visitors never (cross-site uniques do not exist). */
export function summaryTotals(list: ReadonlyArray<object>): { sessions: number; pageviews: number; visitors: null; revenue: RevenueEntry[] } {
	const rows = list as ReadonlyArray<Record<string, unknown>>;
	const m = new Map<string, { revenue: number; orders: number }>();
	for (const r of rows)
		for (const e of (r.revenue as RevenueEntry[] | undefined) ?? []) {
			const t = m.get(e.currency) ?? { revenue: 0, orders: 0 };
			m.set(e.currency, { revenue: t.revenue + e.revenue, orders: t.orders + e.orders });
		}
	return { sessions: rows.reduce((n, r) => n + num(r.sessions), 0), pageviews: rows.reduce((n, r) => n + num(r.pageviews), 0), visitors: null, revenue: revenueList(m) };
}

/** The summary runner: `rc.sites` lists the sites (the local site alone when absent); filters are refused. */
export async function sitesSummary(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	if (input.filters.length) throw new QueryError("invalid_params", "sites_summary takes no filters.");
	const sites = [...new Set(rc.sites ?? [rc.site])];
	const groups = new Map<string, { rc: ReportCtx; sites: string[] }>();
	for (const site of sites) {
		const t = rc.sitesDb ? await rc.sitesDb(site) : { key: "", db: rc.db, summaryThrough: rc.summaryThrough };
		let g = groups.get(t.key);
		if (!g) {
			const { summaryThrough: _, ...base } = rc;
			groups.set(t.key, (g = { rc: { ...base, db: t.db, ...(t.summaryThrough ? { summaryThrough: t.summaryThrough } : {}) }, sites: [] }));
		}
		g.sites.push(site);
	}
	const bySite = new Map<string, Record<string, number>>();
	const revenue = new Map<string, Map<string, { revenue: number; orders: number }>>();
	const addTraffic = (site: string, r: Record<string, unknown>) => {
		const t = bySite.get(site) ?? { pageviews: 0, sessions: 0, visitors: 0, bounces: 0, engaged: 0 };
		for (const k of Object.keys(t)) t[k] = (t[k] ?? 0) + num(r[k]);
		bySite.set(site, t);
	};
	const addMoney = (site: string, cur: string, r: { revenue?: unknown; orders?: unknown }) => {
		const per = revenue.get(site) ?? new Map<string, { revenue: number; orders: number }>();
		revenue.set(site, per);
		const v = per.get(cur) ?? { revenue: 0, orders: 0 };
		per.set(cur, { revenue: v.revenue + num(r.revenue), orders: v.orders + num(r.orders) });
	};
	for (const { rc: g, sites: gSites } of groups.values()) {
		const { stored, open } = await splitRange(g, input.from, input.to);
		if (stored) {
			// One JSON parameter for up to MAX_SITES ids (the registry's cap), so the statement stays one.
			const inSites = inList(g.db.dialect, "site", gSites, false, MAX_SITES);
			const where = `${inSites.sql} AND dim = 'all' AND seg = '' AND day BETWEEN ? AND ?`;
			const params = [...inSites.params, stored.from, stored.to];
			const traffic = await g.db.all(
				`SELECT site, SUM(pageviews) AS pageviews, SUM(sessions) AS sessions, SUM(visitors) AS visitors, SUM(bounces) AS bounces, SUM(engaged) AS engaged FROM ca_rollup WHERE ${where} GROUP BY site`,
				params,
			);
			for (const r of traffic) addTraffic(String(r.site), r);
			for (const r of await g.db.all(`SELECT site, cur, SUM(revenue) AS revenue, SUM(orders) AS orders FROM ca_revenue_daily WHERE ${where} GROUP BY site, cur`, params))
				addMoney(String(r.site), String(r.cur), r);
		}
		// Open days (today, yesterday until it closes) through `computeDay`; another site's goals do not change its `all` rows.
		// shortcut: costs sites x open days x computeDay statements (4 or more each), past the Free plan's 50 per request at about 6 sites; upgrade to one grouped `all` read per open day if many sites share a database.
		for (const site of gSites)
			for (const day of open) {
				const d = await openDay(g, site, site === rc.site ? rc.goals : [], day);
				for (const r of d.rows) if (r.dim === "all" && !(r as { seg?: string }).seg) addTraffic(site, r);
				for (const r of d.revenue) if (r.dim === "all" && !(r as { seg?: string }).seg) addMoney(site, r.cur, r);
			}
	}
	const all: Row[] = sites.map((key) => {
		const r = bySite.get(key) ?? {};
		const sessions = num(r.sessions);
		return {
			key,
			sessions,
			pageviews: num(r.pageviews),
			visitors: num(r.visitors),
			bounce_rate: round(ratio(num(r.bounces), sessions)),
			engaged_rate: round(ratio(num(r.engaged), sessions)),
			revenue: revenueList(revenue.get(key)),
		};
	});
	all.sort((a, b) => num(b.pageviews) - num(a.pageviews) || (a.key < b.key ? -1 : 1));
	const { revenue: totalRevenue, ...totals } = summaryTotals(all);
	return {
		totals,
		revenue: totalRevenue,
		rows: all.slice(input.offset, input.offset + input.limit),
		truncated: all.length > input.offset + input.limit,
	};
}

/**
 * The `sitesDb` of a cross-site read under site routing (the `databases` option): each site's database, keyed by
 * its binding, with the watermark of that database. Null without routing: one database holds every site.
 */
export function routedSitesDb(db: (site?: string) => Promise<Db>, kv: Pick<KvLike, "get"> | undefined): SitesDb | undefined {
	const facts = pluginFactsOrNull();
	if (!facts || facts.targets().length < 2) return undefined;
	return async (site) => ({
		key: facts.binding(site) ?? "",
		db: await db(site),
		summaryThrough: (await (kv ? stateKv(kv, site).get<string>(KV_WATERMARK) : null)) ?? undefined,
	});
}
