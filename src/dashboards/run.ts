/** Dashboard runner: one report request per distinct tile query, concurrency 2, through the report dispatcher. */
import { type Preset, presetRange } from "../core/presets.js";
import type { Body, LoadedAnnotations, Preloaded } from "../routes/data.js";
import type { ReportResult } from "../query/reports/index.js";
import { type Dashboard, type Tile, tileNeedsSearch } from "./schema.js";

export interface RunnerCtx {
	site: string;
	tz: string;
	/** Epoch seconds. */
	now: number;
	/**
	 * The report dispatcher with segment, goal, funnel and raw window resolution (`answer` of `data/query`).
	 * `shared` replaces its own annotation read and keeps goals and the raw window state for the run; series reports embed the annotations matching the tile.
	 */
	dispatch(body: Body, shared: Preloaded): Promise<ReportResult>;
	/** The site's annotations of the range, read once per run. */
	loadAnnotations?(range: { from: string; to: string }): Promise<LoadedAnnotations>;
	/** True when the segment id exists for the site. */
	segmentExists(id: string): Promise<boolean>;
}

export interface TileRun {
	id: string;
	result?: ReportResult;
	error?: { code: string; message: string };
	/** Per-tile notices of the runner, for example `segment_missing`. */
	notices: string[];
}

export interface DashboardRun {
	range: { from: string; to: string };
	compare: Body["query"]["compare"];
	tiles: TileRun[];
	/** Distinct report requests (each one doubles with compare). */
	requests: number;
}

export const DEFAULT_TILE_LIMIT = 10;
const CONCURRENCY = 2;

/** Traffic tile reports that compare periods on their own: no segment comparison. */
const SEGMENT_COMPARE_SKIP: ReadonlySet<string> = new Set(["traffic_movers", "traffic_decay", "impact"]);

/** Tile reports that refuse the compare option; their tiles always run without it. */
const NO_COMPARE_TILES: ReadonlySet<string> = new Set(["search_cannibalization", "search_cannibalization_pages"]);

/** The dispatcher request of one tile. `params.goal` is not a report param: the tile picks the goal's row. */
export function tileRequest(
	tile: Tile,
	base: { from: string; to: string; compare: Body["query"]["compare"]; site: string; segment?: string | undefined; compareSegment?: string | undefined; filters: Body["query"]["filters"] },
): Body {
	const p = tile.params ?? {};
	const { goal, metric, ...rest } = p;
	const params: NonNullable<Body["params"]> = { ...rest };
	if (tile.report === "impact") Object.assign(params, { metric: tile.metric ?? tile.metrics?.[0], ...(goal ? { goal } : {}) });
	else if (tile.report === "search_position_bands_series") {
		// A stacked tile names queries or impressions in `metric`; a line or area tile names a band there and the measure in `params.metric`.
		const m = tile.kind === "stacked" ? tile.metric : metric;
		if (m) params.metric = m;
	} else if (metric) params.metric = metric;
	const breakdown = tile.kind === "bars" || tile.kind === "donut" || tile.kind === "table";
	// Search tiles, SEO views and impact cannot compare segments: they run without comparison.
	const segCompare = base.compare === "segment" && !!base.compareSegment && !tileNeedsSearch(tile) && !SEGMENT_COMPARE_SKIP.has(tile.report);
	const compare = NO_COMPARE_TILES.has(tile.report) || (base.compare === "segment" && !segCompare) ? "none" : base.compare;
	return {
		report: tile.report,
		query: {
			from: base.from,
			to: base.to,
			filters: [...base.filters, ...(tile.filters ?? [])],
			compare,
			...(segCompare ? { compareSegment: base.compareSegment } : {}),
			granularity: "auto",
			site: base.site,
			...(base.segment ? { segment: base.segment } : {}),
		},
		...(Object.keys(params).length ? { params } : {}),
		...(breakdown ? { limit: tile.limit ?? DEFAULT_TILE_LIMIT } : {}),
	};
}

/** Distinct report requests of a dashboard (each one doubles with compare); the range does not change the count. */
export function distinctRequests(d: Pick<Dashboard, "tiles" | "defaults">): number {
	const base = { from: "", to: "", compare: d.defaults.compare, site: "", filters: d.defaults.filters, segment: d.defaults.segment, compareSegment: d.defaults.compareSegment };
	return new Set(d.tiles.map((t) => JSON.stringify(tileRequest(t, base)))).size;
}

const NONE: LoadedAnnotations = { items: [], truncated: false };

/** `annotations`: attach the matching annotations to series tiles (shared pages pass `viewer.annotations`). */
export async function runDashboard(rc: RunnerCtx, dashboard: Dashboard, opts: { range?: Preset; compare?: Body["query"]["compare"]; annotations?: boolean } = {}): Promise<DashboardRun> {
	const range = presetRange(opts.range ?? dashboard.defaults.range, rc.tz, rc.now);
	const compare = opts.compare ?? dashboard.defaults.compare;
	const seg = dashboard.defaults.segment;
	// A deleted segment never changes the result set silently: tiles run without it and say so.
	const segment = seg && (await rc.segmentExists(seg)) ? seg : undefined;
	const notices = seg && !segment ? ["segment_missing"] : [];
	// A deleted compare segment: tiles run without comparison and say so.
	const cseg = compare === "segment" ? dashboard.defaults.compareSegment : undefined;
	const compareSegment = cseg && (await rc.segmentExists(cseg)) ? cseg : undefined;
	if (cseg && !compareSegment) notices.push("compare_segment_missing");

	const byKey = new Map<string, Body>();
	const keyOf = dashboard.tiles.map((t) => {
		const body = tileRequest(t, { ...range, compare, site: rc.site, segment, compareSegment, filters: dashboard.defaults.filters });
		const key = JSON.stringify([body.report, body.query, body.params ?? null, body.limit ?? null]);
		byKey.set(key, body);
		return key;
	});

	// One read of annotations per run; goals and the raw window state are read by the first request and shared.
	const shared: Preloaded = { annotations: opts.annotations && rc.loadAnnotations ? await rc.loadAnnotations(range) : NONE, memo: new Map() };
	const results = new Map<string, Promise<ReportResult>>();
	const queue = [...byKey];
	const worker = async () => {
		for (let next = queue.shift(); next; next = queue.shift()) {
			const p = rc.dispatch(next[1], shared);
			results.set(next[0], p);
			await p.catch(() => {});
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

	const tiles: TileRun[] = [];
	for (const [i, t] of dashboard.tiles.entries()) {
		try {
			tiles.push({ id: t.id, result: await (results.get(keyOf[i] as string) as Promise<ReportResult>), notices });
		} catch (err) {
			const e = err as { code?: unknown; message?: unknown };
			tiles.push({ id: t.id, error: { code: typeof e.code === "string" ? e.code : "error", message: String(e.message ?? err) }, notices });
		}
	}
	return { range, compare, tiles, requests: byKey.size };
}
