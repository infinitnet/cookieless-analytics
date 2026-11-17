/**
 * `annotations/preview` (`plugins:read`): what a scope covers over the last 30 days, through
 * `scopeToFilters` and the existing compiler. One traffic statement (hosts and pages with samples) and,
 * when query rules exist and a Search source is configured, one search statement over the query grain;
 * the compiler adds one bounded statement per regex filter it expands (four in total with regex path and
 * query rules; a host regex adds a fifth).
 */
import { PluginRouteError } from "emdash";
import { z } from "zod";
import { ScopeSchema, scopeToFilters } from "../annotations/scope.js";
import { addDays, dayInZone } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { andFrags, compileSearch, compileTraffic, entryCols, QueryError } from "../query/compile.js";
import { hitJoin, type ReportCtx, type RunInput } from "../query/reports/base.js";
import { bindSite, SiteField, type SitesColl } from "../multisite/registry.js";
import type { Settings } from "../settings.js";
import { SOURCES } from "../sources/sync.js";

export const PREVIEW_DAYS = 30;
export const PREVIEW_SAMPLES = 5;

export const PreviewBody = z.object({ site: SiteField, scope: ScopeSchema.optional(), days: z.number().int().min(1).max(90).optional() }).strict();

export interface PreviewCtx {
	input: unknown;
	storage: { sites?: Pick<SitesColl, "query"> };
}
export interface PreviewEnv {
	/** The database of `site`'s analytics tables. */
	db(site?: string): Promise<Db>;
	settings(): Promise<Settings>;
	now?(): number;
}

interface Part {
	count: number;
	sample: string[];
}
export interface Preview {
	hosts: Part;
	pages: Part;
	queries: Part | null;
	notices: string[];
}

/** Search data exists only with a connected source. */
const searchConfigured = (s: Settings) => SOURCES.google.configured(s) || SOURCES.bing.configured(s);

/** Rows `{ k, v, w }`: one `n` row with the counts, then the samples keyed by `k`. */
function parts(rows: Array<Record<string, unknown>>, keys: string[]): Part[] {
	const n = rows.find((r) => r.k === "n") ?? {};
	return keys.map((k, i) => ({ count: Number((i === 0 ? n.v : n.w) ?? 0), sample: rows.filter((r) => r.k === k).map((r) => String(r.v)) }));
}

export function previewRoute(env: PreviewEnv) {
	return {
		permission: "plugins:read" as const,
		input: PreviewBody,
		async handler(ctx: PreviewCtx): Promise<Preview> {
			const body = PreviewBody.parse(ctx.input);
			const s = await env.settings();
			const site = (await bindSite(body.site, s.siteId, ctx.storage.sites)).id;
			const to = dayInZone(env.now?.() ?? Math.floor(Date.now() / 1000), s.siteTimezone);
			const from = addDays(to, -((body.days ?? PREVIEW_DAYS) - 1));
			const db = await env.db(site);
			const cc = { db, site, from, to, goals: [] };
			try {
				const traffic = scopeToFilters(body.scope, "traffic");
				const hits = hitJoin({ site, db } as ReportCtx, { from, to, traffic: await compileTraffic(cc, traffic.filters) } as RunInput, "pv");
				const rows = await db.all(
					`WITH m AS (SELECT DISTINCT s.host AS host, ${entryCols(db.dialect).path} AS path ${hits.sql})
SELECT 'n' AS k, CAST((SELECT COUNT(DISTINCT host) FROM m) AS TEXT) AS v, CAST((SELECT COUNT(DISTINCT path) FROM m) AS TEXT) AS w
UNION ALL SELECT 'h', host, NULL FROM (SELECT DISTINCT host FROM m WHERE host IS NOT NULL ORDER BY host LIMIT ${PREVIEW_SAMPLES}) a
UNION ALL SELECT 'p', path, NULL FROM (SELECT DISTINCT path FROM m ORDER BY path LIMIT ${PREVIEW_SAMPLES}) b`,
					hits.params,
				);
				const [hosts, pages] = parts(rows, ["h", "p"]) as [Part, Part];
				const notices = traffic.notices.filter((n) => n !== "scope_query_not_applied");
				let queries: Part | null = null;
				if (body.scope?.query?.length) {
					if (searchConfigured(s)) {
						// The query grain carries no page, so only the query rules apply here.
						const search = scopeToFilters(body.scope, "search");
						notices.push(...search.notices);
						const c = await compileSearch(cc, search.filters.filter((f) => f.dim === "query"));
						const where = andFrags([
							{ sql: "d.site = ? AND d.day BETWEEN ? AND ? AND d.query <> '' AND d.page_key = '' AND d.country = '' AND d.device = ''", params: [site, from, to] },
							c.pred,
						]);
						const q = await db.all(
							`WITH m AS (SELECT DISTINCT d.query AS q FROM ca_search_daily d WHERE ${where.sql})
SELECT 'n' AS k, CAST((SELECT COUNT(*) FROM m) AS TEXT) AS v, NULL AS w UNION ALL SELECT 'q', q, NULL FROM (SELECT q FROM m ORDER BY q LIMIT ${PREVIEW_SAMPLES}) a`,
							where.params,
						);
						queries = parts(q, ["q"])[0] as Part;
					} else notices.push("scope_no_search_source");
				}
				return { hosts, pages, queries, notices };
			} catch (err) {
				if (err instanceof QueryError) throw new PluginRouteError(err.code, err.message, 400);
				throw err;
			}
		},
	};
}
