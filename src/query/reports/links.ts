/**
 * `links` (Links convention, docs/integration.md): impressions, clicks, CTR, clicking sessions and conversions per
 * link, placement, page or session dim. Clicks are `out` events and conversions `conv` events keyed by their `slug` and
 * `place` props; impressions are `seen` events exploded over `s0` to `s9`, each `<slug>` or `<slug>@<place>`.
 * Events are entries of the visit documents of the range, plus the link events the site's server reported
 * without a visit (`ca_events`, by their own day); a visit with no page view and an event without one are
 * `(not set)` in the session dims. A conversion's amount is its `ca_events` row, keyed like the
 * entry. Three statements merged by key in JS. Revenue columns only with `params.withRevenue`, in one currency, the other
 * currencies listed. Before the detailed window `linksFromSummary` answers from the daily link rows
 * (`linkDay`, stored by the closed-day writer).
 */
import { roundMinor } from "../../core/currency.js";
import { LINK_EVENTS } from "../../contract.js";
import { unionAll, unionAllChunked } from "../../db/compound.js";
import { dayInt } from "../../db/dialect.js";
import { andFrags, entriesOf, entryCols, entryProp, type Frag, propText, QueryError, TRUE } from "../compile.js";
import { LINK_BY } from "../filters.js";
import { num, type ReportCtx, visitDays, type ReportData, type Row, type RunInput, ratio, round } from "./base.js";
import { currencyOf, REVENUE_KEYS } from "./revenue.js";

export { LINK_BY };
export type LinkBy = (typeof LINK_BY)[number];

const NONE = "'(none)'";
const NOT_SET = "'(not set)'";
const VIEW_KEYS = Array.from({ length: 10 }, (_, i) => `'s${i}'`).join(", ");

/** Where link events are read: the expressions of one source (event entries of the visit documents, or `ca_events` rows without a visit). */
interface Source {
	from(join: string, extra: Frag): Frag;
	name: string;
	path: string;
	sid: string;
	prop(key: string): string;
	/** Rows `p` of the event's properties. */
	each: string;
	/** Join that brings a conversion's amount as `val`, `cur` (entries: their order row). */
	amount(left: boolean): string;
	val: string;
	cur: string;
	/** Session dims of the source; a row without a visit is `(not set)`. */
	sessionKey(by: Exclude<LinkBy, "link" | "place" | "page">): string;
	/** 1 when a session filter can keep the row (a visit with a page view), else 0. */
	counted: string;
}

/** Event entries of the visits of the range; under a session filter only entries of a counted visit remain. */
function entrySource(rc: ReportCtx, input: RunInput): Source {
	const d = rc.db.dialect;
	const h = entryCols(d);
	const session = input.traffic?.session ?? TRUE;
	return {
		from(join, extra) {
			const where = andFrags([
				visitDays(rc.site, input.from, input.to),
				{ sql: h.ev, params: [] },
				session.sql === TRUE.sql ? TRUE : andFrags([{ sql: "s.pageviews > 0", params: [] }, session]),
				input.traffic?.ev ?? TRUE,
				extra,
			]);
			return { sql: `FROM ca_sessions s CROSS JOIN ${entriesOf(d)}${join} WHERE ${where.sql}`, params: where.params };
		},
		name: h.name,
		path: h.path,
		sid: "s.sid",
		prop: (k) => entryProp(d, "h", k),
		each: d === "postgres" ? ", jsonb_each_text(h.value -> 'pr') AS p" : ", json_each(h.value, '$.pr') AS p",
		// The amount of a conversion: its order row, keyed like the entry (one primary key probe per conversion).
		amount: (left) => ` ${left ? "LEFT " : ""}JOIN ca_events r ON r.site = s.site AND r.id = ${h.id}`,
		val: "r.val",
		cur: "r.cur",
		sessionKey: (by) => REVENUE_KEYS[by],
		counted: "CASE WHEN s.pageviews > 0 THEN 1 ELSE 0 END",
	};
}

/** Link events the site's server reported without a visit (`ca_events`, by their own day): `(not set)` in the session dims. Refund rows (negative `val`) are not events. */
function visitlessSource(rc: ReportCtx, input: RunInput): Source {
	const d = rc.db.dialect;
	return {
		from(join, extra) {
			const where = andFrags([{ sql: "h.site = ? AND h.day BETWEEN ? AND ? AND h.sid IS NULL AND (h.val IS NULL OR h.val >= 0)", params: [rc.site, dayInt(input.from), dayInt(input.to)] }, extra]);
			return { sql: `FROM ca_events h${join} WHERE ${where.sql}`, params: where.params };
		},
		name: "h.name",
		path: "h.path",
		sid: "NULL",
		prop: (k) => propText(d, "h", k),
		each: d === "postgres" ? ", jsonb_each_text(CAST(h.props AS jsonb)) AS p" : ", json_each(h.props) AS p",
		amount: () => "",
		val: "h.val",
		cur: "h.cur",
		sessionKey: () => NOT_SET,
		counted: "0",
	};
}

/** One statement over every source: each grouped by `key`, then summed by `key` (sessions never overlap: visitless rows have none). */
async function overSources(rc: ReportCtx, sources: readonly Source[], part: (src: Source) => Frag, sums: string): Promise<Array<Record<string, unknown>>> {
	const u = unionAll(sources.map(part));
	return rc.db.all(`SELECT t.key AS key, ${sums} FROM (${u.sql}) t GROUP BY t.key`, u.params);
}

/** `seen` keys (`<slug>` or `<slug>@<place>`) of property row `p`: the value, its slug and its placement. */
function seenKeys(d: ReportCtx["db"]["dialect"]) {
	const pos = (v: string) => (d === "postgres" ? `strpos(${v}, '@')` : `instr(${v}, '@')`);
	const v = d === "postgres" ? "p.value" : "CAST(p.value AS TEXT)";
	return { v, slug: `CASE WHEN ${pos(v)} > 0 THEN substr(${v}, 1, ${pos(v)} - 1) ELSE ${v} END`, place: `CASE WHEN ${pos(v)} > 0 THEN substr(${v}, ${pos(v)} + 1) ELSE ${NONE} END` };
}
const hitSlug = (src: Source) => `COALESCE(${src.prop(LINK_EVENTS.key)}, ${NOT_SET})`;
const hitPlace = (src: Source) => `COALESCE(NULLIF(${src.prop(LINK_EVENTS.place)}, ''), ${NONE})`;

function linkBy(input: Pick<RunInput, "params">): LinkBy {
	const by = (input.params.by ?? "link") as LinkBy;
	if (!(LINK_BY as readonly string[]).includes(by)) throw new QueryError("invalid_params", `links params.by is one of ${LINK_BY.join(", ")}.`);
	return by;
}

export async function links(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const by = linkBy(input);
	const { v, slug: seenSlug, place: seenPlace } = seenKeys(rc.db.dialect);
	const keyOf = (src: Source, slug: string, place: string) => (by === "link" ? slug : by === "place" ? place : by === "page" ? `COALESCE(${src.path}, ${NOT_SET})` : src.sessionKey(by));
	const slug = input.params.slug;
	const onSlug = (expr: string): Frag => (slug ? { sql: `${expr} = ?`, params: [slug] } : TRUE);
	// Rows without a visit fail every session filter, as before.
	const sources = (input.traffic?.session ?? TRUE).sql === TRUE.sql ? [entrySource(rc, input), visitlessSource(rc, input)] : [entrySource(rc, input)];

	const cur = input.params.withRevenue ? currencyOf(rc, input) : null;
	const clickRows = await overSources(
		rc,
		sources,
		(src) => {
			const hk = keyOf(src, hitSlug(src), hitPlace(src));
			const f = src.from(cur ? src.amount(true) : "", andFrags([{ sql: `${src.name} IN (?, ?)`, params: [LINK_EVENTS.click, LINK_EVENTS.sale] }, onSlug(hitSlug(src))]));
			return {
				sql: `SELECT ${hk} AS key, SUM(CASE WHEN ${src.name} = ? THEN 1 ELSE 0 END) AS clicks, COUNT(DISTINCT CASE WHEN ${src.name} = ? AND ${src.counted} = 1 THEN ${src.sid} END) AS sessions, SUM(CASE WHEN ${src.name} = ? THEN 1 ELSE 0 END) AS conversions${cur ? `, SUM(CASE WHEN ${src.name} = ? AND ${src.cur} = ? THEN ${src.val} ELSE 0 END) AS revenue` : ", 0 AS revenue"} ${f.sql} GROUP BY ${hk}`,
				params: [LINK_EVENTS.click, LINK_EVENTS.click, LINK_EVENTS.sale, ...(cur ? [LINK_EVENTS.sale, cur] : []), ...f.params],
			};
		},
		"SUM(t.clicks) AS clicks, SUM(t.sessions) AS sessions, SUM(t.conversions) AS conversions, SUM(t.revenue) AS revenue",
	);
	const seenRows = await overSources(
		rc,
		sources,
		(src) => {
			const sk = keyOf(src, seenSlug, seenPlace);
			const f = src.from(src.each, andFrags([{ sql: `${src.name} = ? AND p.key IN (${VIEW_KEYS}) AND ${v} <> ''`, params: [LINK_EVENTS.view] }, onSlug(seenSlug)]));
			return { sql: `SELECT ${sk} AS key, COUNT(*) AS impressions ${f.sql} GROUP BY ${sk}`, params: f.params };
		},
		"SUM(t.impressions) AS impressions",
	);

	const byKey = new Map<string, LinkSums>();
	for (const r of seenRows) sumsOf(byKey, r.key).impressions += num(r.impressions);
	for (const r of clickRows) Object.assign(sumsOf(byKey, r.key), { clicks: num(r.clicks), sessions: num(r.sessions), conversions: num(r.conversions), revenue: num(r.revenue) });
	if (!cur) return linkData(by, byKey, input, null);
	// Conversion values per currency: the selected one first, then by orders and code; never summed across codes.
	const parts = sources.map((src) => {
		const f = src.from(src.amount(false), andFrags([{ sql: `${src.name} = ? AND ${src.val} IS NOT NULL AND ${src.cur} IS NOT NULL`, params: [LINK_EVENTS.sale] }, onSlug(hitSlug(src))]));
		return { sql: `SELECT ${src.cur} AS cur, COUNT(*) AS orders, SUM(${src.val}) AS revenue ${f.sql} GROUP BY ${src.cur}`, params: f.params };
	});
	const u = unionAll(parts);
	const all = await rc.db.all(`SELECT t.cur AS cur, SUM(t.orders) AS orders, SUM(t.revenue) AS revenue FROM (${u.sql}) t GROUP BY t.cur`, u.params);
	return linkData(by, byKey, input, cur, all);
}

type LinkSums = { impressions: number; clicks: number; sessions: number; conversions: number; revenue: number };
const sumsOf = (byKey: Map<string, LinkSums>, k: unknown): LinkSums => {
	const key = String(k);
	const e = byKey.get(key) ?? { impressions: 0, clicks: 0, sessions: 0, conversions: 0, revenue: 0 };
	byKey.set(key, e);
	return e;
};

/** The report's answer from the sums per key, and (with a currency) the conversion values per currency. */
function linkData(by: LinkBy, byKey: Map<string, LinkSums>, input: RunInput, cur: string | null, perCur: ReadonlyArray<Record<string, unknown>> = []): ReportData {
	const ctr = (clicks: number, impressions: number) => round(ratio(clicks, impressions)) ?? 0;
	const money = cur ? (n: number) => roundMinor(n, cur) : null;
	const rows: Row[] = [...byKey].map(([key, e]) => ({
		key,
		impressions: e.impressions,
		clicks: e.clicks,
		ctr: ctr(e.clicks, e.impressions),
		sessions: e.sessions,
		conversions: e.conversions,
		...(money ? { revenue: money(e.revenue), revenue_currency: cur } : {}),
	}));
	rows.sort((a, b) => num(b.clicks) - num(a.clicks) || num(b.impressions) - num(a.impressions) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	const sum = (k: "impressions" | "clicks" | "conversions" | "revenue") => [...byKey.values()].reduce((a, e) => a + e[k], 0);
	const totals = { impressions: sum("impressions"), clicks: sum("clicks"), ctr: ctr(sum("clicks"), sum("impressions")), conversions: sum("conversions"), ...(money ? { revenue: money(sum("revenue")) } : {}) };
	const data: ReportData = { by, totals, rows: rows.slice(input.offset, input.offset + input.limit), truncated: rows.length > input.offset + input.limit };
	if (!cur) return data;
	const currencies = perCur
		.map((r) => ({ currency: String(r.cur), revenue: roundMinor(num(r.revenue), String(r.cur)), orders: num(r.orders) }))
		.sort((a, b) => (a.currency === cur ? -1 : b.currency === cur ? 1 : b.orders - a.orders || (a.currency < b.currency ? -1 : 1)));
	return { ...data, currency: cur, currencies, other_currencies: currencies.filter((c) => c.currency !== cur).map((c) => c.currency) };
}

// ── daily summaries ──────────────────────────────────────────────────────────

/** Summary dims of the links report: `link` (by slug, also crossed with a segment) and `link_place` (by placement). */
export const LINK_DIMS = ["link", "link_place"] as const;
/** `ca_rollup` column of each link metric (the table has one column set for every dim). */
export const LINK_COLS = { impressions: "hits", clicks: "events", sessions: "sessions", conversions: "engaged" } as const;

/** One row of `linkDay`: the counts (`cur` '') or the conversion values of one currency (`orders`, `revenue`). */
export interface LinkDayRow {
	dim: (typeof LINK_DIMS)[number];
	seg: string;
	key: string;
	segkey: string;
	cur: string;
	impressions: number;
	clicks: number;
	sessions: number;
	conversions: number;
	orders: number;
	revenue: number;
}

/** Parts of `linkDay` with `segs` segments: three per family (`link`, `link_place`, and `link` by each segment). */
export const linkDayParts = (segs: number) => 3 * (2 + segs);

/**
 * The link rows of one site and day for the summaries, over the report's sources: per family
 * (`link`, `link_place`, and `link` crossed with each of `segs`) the clicks, clicking sessions and conversions,
 * the conversion values per currency, and the impressions. Pair rows hold what a filter on that segment keeps:
 * events of a visit with a page view (the report's session filter rule), so a pair row equals the detailed report
 * under that filter.
 */
export async function linkDay(rc: ReportCtx, day: string, segs: ReadonlyArray<Exclude<LinkBy, "link" | "place" | "page">>): Promise<LinkDayRow[]> {
	const input: RunInput = { from: day, to: day, filters: [], granularity: "day", params: {}, limit: 0, offset: 0, isCompare: false };
	const sources = [entrySource(rc, input), visitlessSource(rc, input)];
	const seen = seenKeys(rc.db.dialect);
	const cols = (src: Source) => `${src.counted} AS counted${segs.map((g) => `, ${src.sessionKey(g)} AS ${g}`).join("")}`;
	const events = sources.map((src) => {
		const f = src.from(src.amount(true), { sql: `${src.name} IN (?, ?)`, params: [LINK_EVENTS.click, LINK_EVENTS.sale] });
		return {
			sql: `SELECT ${hitSlug(src)} AS slug, ${hitPlace(src)} AS place, CASE WHEN ${src.name} = ? THEN 1 ELSE 0 END AS click, ${src.sid} AS sid, ${src.val} AS val, ${src.cur} AS cur, ${cols(src)} ${f.sql}`,
			params: [LINK_EVENTS.click, ...f.params],
		};
	});
	const views = sources.map((src) => {
		const f = src.from(src.each, { sql: `${src.name} = ? AND p.key IN (${VIEW_KEYS}) AND ${seen.v} <> ''`, params: [LINK_EVENTS.view] });
		return { sql: `SELECT ${seen.slug} AS slug, ${seen.place} AS place, ${cols(src)} ${f.sql}`, params: f.params };
	});
	const families = [["link", "", "slug"], ["link_place", "", "place"], ...segs.map((g) => ["link", g, "slug"])] as const;
	const parts = families.flatMap(([dim, seg, k]) => {
		const head = `SELECT '${dim}' AS dim, '${seg}' AS seg, ${k} AS key, ${seg || "''"} AS segkey`;
		const counted = seg ? " AND counted = 1" : "";
		const group = `GROUP BY ${k}${seg ? `, ${seg}` : ""}`;
		return [
			`${head}, '' AS cur, 0 AS impressions, SUM(click) AS clicks, COUNT(DISTINCT CASE WHEN click = 1 AND counted = 1 THEN sid END) AS sessions, SUM(1 - click) AS conversions, 0 AS orders, 0 AS revenue FROM e WHERE 1 = 1${counted} ${group}`,
			`${head}, cur, 0 AS impressions, 0 AS clicks, 0 AS sessions, 0 AS conversions, COUNT(*) AS orders, SUM(val) AS revenue FROM e WHERE click = 0 AND val IS NOT NULL AND cur IS NOT NULL${counted} ${group}, cur`,
			`${head}, '' AS cur, COUNT(*) AS impressions, 0 AS clicks, 0 AS sessions, 0 AS conversions, 0 AS orders, 0 AS revenue FROM i WHERE 1 = 1${counted} ${group}`,
		];
	});
	// The families' parts (`linkDayParts`) in statements of at most 5 terms (D1's compound limit), each with the same `e` and `i`;
	// every part names its columns, since any part can open a statement.
	const e = unionAll(events);
	const i = unionAll(views);
	const rows = await unionAllChunked(
		rc.db,
		parts.map((sql) => ({ sql, params: [] })),
		{ head: { sql: `WITH e AS (${e.sql}), i AS (${i.sql})`, params: [...e.params, ...i.params] } },
	);
	return rows.map((r) => ({
		dim: r.dim as LinkDayRow["dim"],
		seg: String(r.seg),
		key: String(r.key),
		segkey: String(r.segkey),
		cur: String(r.cur ?? ""),
		impressions: num(r.impressions),
		clicks: num(r.clicks),
		sessions: num(r.sessions),
		conversions: num(r.conversions),
		orders: num(r.orders),
		revenue: num(r.revenue),
	}));
}

/**
 * What a links summary answer honors, or null when the breakdown has no summary rows (by page or a session dim,
 * placements of one link). By link: one of channel, country and device through the pair rows; by placement: none.
 * `unavailable` holds `dim:reason` like `planFilters`.
 */
export function linksPlan(input: Pick<RunInput, "filters" | "params">): { by: LinkBy; seg: string; unavailable: string[] } | null {
	const by = linkBy(input);
	if (by !== "link" && (by !== "place" || input.params.slug)) return null;
	const seg = by === "link" ? (input.filters.find((f) => (SEGMENTS as readonly string[]).includes(f.dim))?.dim ?? "") : "";
	const off = new Map(input.filters.filter((f) => f.dim !== seg).map((f) => [f.dim, (SEGMENTS as readonly string[]).includes(f.dim) && seg ? "combination" : "not_kept"]));
	return { by, seg, unavailable: [...off].map(([d, r]) => `${d}:${r}`) };
}

/**
 * The links report from the daily summary rows, in the detailed report's shape (see `linksPlan`). Filters it cannot
 * honor are named in `filter_unavailable:<dim>:<reason>`. Each day keeps its top links (`(other)` holds the rest).
 */
export async function linksFromSummary(rc: ReportCtx, input: RunInput): Promise<ReportData & { notices: string[] }> {
	const plan = linksPlan(input);
	const slug = input.params.slug;
	if (!plan) throw new QueryError("raw_only", `Links ${slug ? "of one link " : ""}by ${linkBy(input)} need detailed data, which is kept for the raw retention window only. Choose a more recent range.`);
	const { by, seg } = plan;
	const applied = input.filters.filter((f) => f.dim === seg);
	const notices = plan.unavailable.map((u) => `filter_unavailable:${u}`);
	const dim = by === "link" ? "link" : "link_place";
	// Loaded on demand: the summary writer imports this module.
	const [{ readFamily }, { matchKey }] = await Promise.all([import("../rollup.js"), import("./rollup.js")]);
	const pass = (r: Record<string, unknown>) => applied.every((f) => matchKey(f, String(r.segkey)));
	const read = (table: "ca_rollup" | "ca_revenue_daily") => readFamily(rc, input.from, input.to, { table, dim, seg, ...(slug ? { key: slug } : {}) }).then((rows) => rows.filter(pass));
	const byKey = new Map<string, LinkSums>();
	for (const r of await read("ca_rollup")) {
		const e = sumsOf(byKey, r.key);
		for (const [m, col] of Object.entries(LINK_COLS) as Array<[keyof typeof LINK_COLS, string]>) e[m] += num(r[col]);
	}
	if (!input.params.withRevenue) return { ...linkData(by, byKey, input, null), notices };
	// Revenue that cannot apply every filter is left out rather than shown unfiltered (as `withRevenue` does).
	if (notices.length) return { ...linkData(by, byKey, input, null), notices: [...notices, "revenue_not_available"] };
	const cur = currencyOf(rc, input);
	const perCur = new Map<string, { cur: string; orders: number; revenue: number }>();
	for (const r of await read("ca_revenue_daily")) {
		if (r.cur === cur) sumsOf(byKey, r.key).revenue += num(r.revenue);
		const c = perCur.get(String(r.cur)) ?? { cur: String(r.cur), orders: 0, revenue: 0 };
		perCur.set(c.cur, { cur: c.cur, orders: c.orders + num(r.orders), revenue: c.revenue + num(r.revenue) });
	}
	return { ...linkData(by, byKey, input, cur, [...perCur.values()]), notices };
}

/** Segment dims of the link pair rows (the summary segments). */
const SEGMENTS = ["channel", "country", "device"] as const;
