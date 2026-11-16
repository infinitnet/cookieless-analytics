/**
 * `editor/traffic` (`plugins:read`): the last 30 days of one content item's public page for the
 * editor sidebar panel. The path comes from `derivePath`; at most five statements (series, sources, search,
 * whether revenue exists, page revenue), annotations from storage through the one matching function.
 */
import { z } from "zod";
import { annotationView, matchAnnotations } from "../annotations/scope.js";
import { derivePath, type PathCtx } from "../content/path.js";
import { addDays, dayInZone } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { dayInt, isoDay, visitDayKey } from "../db/dialect.js";
import { entriesOf, entryCols } from "../query/compile.js";
import { num, ratio, round } from "../query/reports/base.js";
import { hasRevenue } from "../query/reports/revenue.js";
import { bucketSeries } from "../query/reports/timeseries.js";
import type { Settings } from "../settings.js";
import { SOURCES } from "../sources/sync.js";
import { type Coll, loadAnnotations } from "./data.js";

export const EDITOR_DAYS = 30;
const TOP_SOURCES = 5;
const NEWEST_ANNOTATIONS = 5;

export const EditorTrafficBody = z
	.object({
		collection: z.string().min(1).max(64),
		id: z.string().min(1).max(128),
		slug: z.string().max(256).optional(),
		locale: z.string().max(16).optional(),
	})
	// Other fields of the host panel context are dropped, so a later host field never breaks the panel.
	.strip();

export interface EditorCtx {
	input: unknown;
	content?: PathCtx["content"] & { get?(collection: string, id: string): Promise<{ data?: unknown } | null> };
	storage: { annotations?: Coll };
	kv?: unknown;
}

export interface EditorEnv {
	/** The database of `site`'s analytics tables. */
	db(site?: string): Promise<Db>;
	settings(): Promise<Settings>;
	/** Epoch seconds. */
	now?(): number;
}

export interface EditorTraffic {
	/** Null: the entry has no public page (a draft, unpublished, or not routable). */
	path: string | null;
	range?: { from: string; to: string };
	pageviews?: number;
	visitors?: number;
	avg_time?: number | null;
	series?: Array<{ t: string; pageviews: number }>;
	sources?: Array<{ key: string; sessions: number }>;
	search?: { clicks: number; impressions: number; position: number | null } | null;
	annotations?: ReturnType<typeof annotationView>[];
	revenue?: { currency: string; revenue: number; orders: number } | null;
}

export function editorRoutes(env: EditorEnv) {
	return {
		"editor/traffic": {
			permission: "plugins:read" as const,
			input: EditorTrafficBody,
			async handler(ctx: EditorCtx): Promise<EditorTraffic> {
				const body = EditorTrafficBody.parse(ctx.input);
				let data: unknown;
				try {
					data = (await ctx.content?.get?.(body.collection, body.id))?.data;
				} catch {
					// The host fills `{slug}` and `{id}` without the item's data.
				}
				const path = await derivePath(ctx, body.collection, { id: body.id, data });
				if (!path) return { path: null };
				const s = await env.settings();
				const now = env.now?.() ?? Math.floor(Date.now() / 1000);
				const to = dayInZone(now, s.siteTimezone);
				const from = addDays(to, -(EDITOR_DAYS - 1));
				const site = s.siteId;
				const db = await env.db(site);
				const range = [site, from, to] as const;

				// Page views of the path among the visits of the range (a page view counts on its visit's day).
				const h = entryCols(db.dialect);
				const pvOf = `FROM ca_sessions s CROSS JOIN ${entriesOf(db.dialect)} WHERE s.site = ? AND s.day BETWEEN ? AND ? AND s.pageviews > 0 AND ${h.pv} AND ${h.path} = ?`;
				const visitRange = [site, visitDayKey(from), visitDayKey(to), path];
				const days = (
					await db.all<Record<string, unknown>>(`SELECT s.day AS day, COUNT(*) AS pageviews, COUNT(DISTINCT s.vkey) AS visitors, SUM(${h.dur}) AS dur_sum, COUNT(${h.dur}) AS dur_n ${pvOf} GROUP BY s.day`, visitRange)
				).map((r): Record<string, unknown> & { day: string } => ({ ...r, day: isoDay(r.day) }));
				const sources = await db.all(
					`SELECT COALESCE(s.source, '(not set)') AS key, COUNT(DISTINCT s.sid) AS sessions ${pvOf}
GROUP BY COALESCE(s.source, '(not set)') ORDER BY sessions DESC, key LIMIT ${TOP_SOURCES}`,
					visitRange,
				);
				let search: EditorTraffic["search"] = null;
				if (SOURCES.google.configured(s) || SOURCES.bing.configured(s)) {
					const [r] = await db.all(
						"SELECT SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE d.site = ? AND d.day BETWEEN ? AND ? AND d.page_key = ? AND d.query = '' AND d.country = '' AND d.device = ''",
						[...range, path],
					);
					const impressions = num(r?.impressions);
					search = { clicks: num(r?.clicks), impressions, position: round(ratio(num(r?.pos_sum), impressions), 2) };
				}
				let revenue: EditorTraffic["revenue"] = null;
				if (await hasRevenue({ db, site })) {
					const currency = s.defaultCurrency;
					const [r] = await db.all(
						"SELECT SUM(h.val) AS revenue, COUNT(*) AS orders FROM ca_events h WHERE h.site = ? AND h.day BETWEEN ? AND ? AND h.val >= 0 AND h.cur = ? AND h.path = ?",
						[site, dayInt(from), dayInt(to), currency, path],
					);
					revenue = { currency, revenue: round(num(r?.revenue), 2) ?? 0, orders: num(r?.orders) };
				}
				const loaded = await loadAnnotations(ctx.storage.annotations, site, from, to, s.siteTimezone);
				const annotations = matchAnnotations(loaded.items, { site, from, to, tz: s.siteTimezone, target: "traffic", filters: [{ dim: "page", op: "is", values: [path] }] })
					.slice(-NEWEST_ANNOTATIONS)
					.reverse()
					.map((a) => annotationView(a, s.siteTimezone));

				const pageviews = days.reduce((a, r) => a + num(r.pageviews), 0);
				const series = bucketSeries(from, to, "day", days).map((p) => ({ t: p.t, pageviews: num(p.pageviews) }));
				return {
					path,
					range: { from, to },
					pageviews,
					// Visitors summed per day, as every report.
					visitors: days.reduce((a, r) => a + num(r.visitors), 0),
					avg_time: round(ratio(days.reduce((a, r) => a + num(r.dur_sum), 0) / 1000, days.reduce((a, r) => a + num(r.dur_n), 0)), 1),
					series,
					sources: sources.map((r) => ({ key: String(r.key), sessions: num(r.sessions) })),
					search,
					annotations,
					revenue,
				};
			},
		},
	};
}
