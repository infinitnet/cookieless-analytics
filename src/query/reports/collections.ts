/**
 * Per-collection report: the summary rows of dim `page` (the whole summary retention, open days from
 * `computeDay`) classified in JS by the collections' URL patterns. Summary rows hold one dimension, so filters are not applied.
 */
import { classifyPath, compilePattern, OTHER_COLLECTION } from "../../content/path.js";
import { OTHER } from "../rollup.js";
import { num, type ReportCtx, type ReportData, type Row, type RunInput, ratio, round } from "./base.js";
import { readSummary } from "./summary.js";

export const COLLECTIONS_CACHE_SECONDS = 300;

/** A routable collection of the CMS (`ctx.schema.listCollections()`, `schema:read`). */
export interface CollectionInfo {
	slug: string;
	urlPattern: string | null;
}

export interface SchemaLike {
	listCollections(): Promise<Array<{ slug: string; urlPattern: string | null; routable: boolean }>>;
}

let cached: { at: number; value: Promise<CollectionInfo[]> } | undefined;

/** Routable collections, cached 5 minutes per isolate; empty without `schema:read`. A failed read is not cached. */
export function loadCollections(schema: SchemaLike | undefined, nowMs = Date.now()): Promise<CollectionInfo[]> {
	if (!schema) return Promise.resolve([]);
	if (cached && nowMs - cached.at < COLLECTIONS_CACHE_SECONDS * 1000) return cached.value;
	const value = schema.listCollections().then((list) => list.filter((c) => c.routable).map((c) => ({ slug: c.slug, urlPattern: c.urlPattern ?? null })));
	const entry = { at: nowMs, value };
	cached = entry;
	value.catch(() => cached === entry && (cached = undefined));
	return value;
}

export function clearCollectionsCache(): void {
	cached = undefined;
}

export async function collections(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	// A client site has no CMS collections.
	if (rc.collections === null) return { rows: [], notices: ["not_available_for_site"] };
	const patterns = (rc.collections ?? []).map((c) => compilePattern(c.slug, c.urlPattern));
	const read = (dim: string) => readSummary(rc, input.from, input.to, { table: "ca_rollup", dim, seg: "" });
	const rows: Array<Record<string, unknown>> = [...(await read("all")).map((r) => ({ ...r, dim: "all" })), ...(await read("page")).map((r) => ({ ...r, dim: "page" }))];
	const sums = new Map<string, { pageviews: number; visitors: number; sessions: number; engaged_ms: number; hits: number; pages: number }>();
	let dayTotal = 0;
	for (const r of rows) {
		if (r.dim === "all") {
			dayTotal += num(r.pageviews);
			continue;
		}
		// The folded `(other)` row of the top 500 pages per day is no path: it is what `coverage` leaves out.
		if (r.key === OTHER) continue;
		const c = classifyPath(String(r.key), patterns);
		const s = sums.get(c) ?? { pageviews: 0, visitors: 0, sessions: 0, engaged_ms: 0, hits: 0, pages: 0 };
		s.pageviews += num(r.pageviews);
		s.visitors += num(r.visitors);
		s.sessions += num(r.sessions);
		s.engaged_ms += num(r.engaged_ms);
		s.hits += num(r.hits);
		s.pages += 1;
		sums.set(c, s);
	}
	const all: Row[] = [...sums]
		.map(([key, s]) => ({
			key,
			pageviews: s.pageviews,
			// Page visitors: the sum of per-page daily visitors, so one person reading two pages counts twice.
			visitors: s.visitors,
			sessions: s.sessions,
			avg_time: round(ratio(s.engaged_ms / 1000, s.hits), 1),
			pages: s.pages,
		}))
		.sort((a, b) => b.pageviews - a.pageviews || (a.key === OTHER_COLLECTION ? 1 : b.key === OTHER_COLLECTION ? -1 : a.key < b.key ? -1 : 1));
	const classified = all.reduce((a, r) => a + num(r.pageviews), 0);
	return {
		rows: all.slice(input.offset, input.offset + input.limit),
		truncated: all.length > input.offset + input.limit,
		totals: { pageviews: classified, day_pageviews: dayTotal, coverage: round(ratio(classified, dayTotal)) },
		...(input.filters.length ? { notices: ["filters_not_applied"] } : {}),
	};
}
