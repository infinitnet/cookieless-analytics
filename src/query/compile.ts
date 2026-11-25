/**
 * Filter compiler. Produces parameterized SQL fragments; identifiers come only
 * from the fixed maps in `filters.ts`. Session dims are predicates on `ca_sessions s`; hit dims are
 * `EXISTS` over the entries of the visit's own document (`json_each(s.hits)`); hit-level reports also
 * restrict their own entry rows.
 */
import type { Db, Dialect } from "../db/adapter.js";
import { dayInt, docEach, field, type Frag, jsonExtract, LIKE_ESCAPE, likeEscape, visitDayKey } from "../db/dialect.js";
import { chunk, IN_CHUNK, ident, type Param } from "../db/sql.js";
import { normalizeCurrency } from "../core/currency.js";
import { type DimDef, type Filter, type FunnelStep, type Goal, NEGATED, NUM_OPS, type Op, PROP_KEY_RE, REVENUE_VALUE_RE, SEARCH_DIMS, TRAFFIC_DIMS } from "./filters.js";
import { compileSafeRegex, validateSafeRegex } from "./safe-regex.js";

export type QueryErrorCode =
	| "narrow_filter"
	| "invalid_regex"
	| "unknown_goal"
	| "unknown_funnel"
	| "unknown_segment"
	| "funnel_cap"
	| "journey_range"
	| "journey_cap"
	| "too_many_values"
	| "unsupported_filter"
	| "source_error"
	| "invalid_params"
	| "invalid_filter"
	| "invalid_currency"
	| "raw_only"
	| "narrow_range"
	| "range_too_long"
	| "compare_not_supported"
	| "not_found";

/** Typed query error; the route maps it to a host `PluginRouteError` with the same code. */
export class QueryError extends Error {
	// A plain field, not a parameter property, so scripts can load this file with Node type stripping.
	code: QueryErrorCode;
	constructor(code: QueryErrorCode, message: string) {
		super(message);
		this.code = code;
		this.name = "QueryError";
	}
}

export type { Frag } from "../db/dialect.js";

export const TRUE: Frag = { sql: "1 = 1", params: [] };
const FALSE: Frag = { sql: "0 = 1", params: [] };

/** Distinct values fetched for regex expansion. */
export const REGEX_DISTINCT_LIMIT = 5000;
export const REGEX_MATCH_LIMIT = 2000;
/** Budget for filter parameters in one statement; D1 allows 100 and reports need the rest. */
export const FILTER_PARAM_BUDGET = 60;

export interface CompileCtx {
	db: Db;
	site: string;
	from: string;
	to: string;
	goals: readonly Goal[];
	/** The site's default currency: `revenue` filters without a `prop` compare in it. */
	currency?: string;
}

const and = (frags: readonly Frag[]): Frag => {
	const real = frags.filter((f) => f.sql !== TRUE.sql);
	if (!real.length) return TRUE;
	return { sql: real.map((f) => `(${f.sql})`).join(" AND "), params: real.flatMap((f) => f.params) };
};
const or = (frags: readonly Frag[]): Frag => {
	if (!frags.length) return FALSE;
	if (frags.length === 1) return frags[0] as Frag;
	return { sql: frags.map((f) => `(${f.sql})`).join(" OR "), params: frags.flatMap((f) => f.params) };
};
export { and as andFrags };

/**
 * `col IN` a list, chunked at 90 values. Each chunk binds one JSON array parameter, so a filter with
 * any number of values (or a regex expansion of 2000 matches) stays inside the D1 parameter limit.
 */
export function inList(dialect: Dialect, col: string, values: readonly (string | number)[], int = false, size = IN_CHUNK): Frag {
	if (!values.length) return FALSE;
	if (values.length === 1) return { sql: `${col} = ?`, params: [values[0] as Param] };
	const each =
		dialect === "postgres"
			? int
				? "SELECT CAST(jsonb_array_elements_text(CAST(? AS jsonb)) AS BIGINT)"
				: "SELECT jsonb_array_elements_text(CAST(? AS jsonb))"
			: "SELECT value FROM json_each(?)";
	return or(chunk(values, size).map((part) => ({ sql: `${col} IN (${each})`, params: [JSON.stringify(part)] })));
}

/** Positive predicate of `op` over `col` for literal values (regex already expanded). */
function literalPred(dialect: Dialect, col: string, op: Op, values: readonly string[], int: boolean): Frag {
	const base = op.replace(/^not_/, "").replace(/^is_not$/, "is");
	if (base === "is" || base === "regex") {
		if (int) {
			const nums = values.map(Number).filter((n) => Number.isInteger(n));
			return inList(dialect, col, nums, true);
		}
		return inList(dialect, col, values);
	}
	const target = int ? `CAST(${col} AS TEXT)` : `lower(${col})`;
	return or(
		values.map((v) => ({
			sql: `${target} LIKE lower(?) ${LIKE_ESCAPE}`,
			params: [base === "contains" ? `%${likeEscape(v)}%` : `${likeEscape(v)}%`],
		})),
	);
}

/** The text expression of an event property, so numbers compare like the strings users type. */
export function propText(dialect: Dialect, alias: string, key: string): string {
	const expr = jsonExtract(dialect, `${alias}.props`, key);
	return dialect === "postgres" ? expr : `CAST(${expr} AS TEXT)`;
}

// ── entries of the visit document ─────────────────────────────────────────────

/**
 * Columns of a page view or event entry: alias `a` is a row of `docEach` over `s.hits` of the visit `s`.
 * A page view entry has `t` and no `n`; an event entry has `n`; an entry with neither is an engagement
 * update whose page view has not arrived and is no hit. Times are seconds since the visit started.
 */
export function entryCols(dialect: Dialect, a = "h") {
	const t = field(dialect, a, "t", "int");
	const name = field(dialect, a, "n");
	return {
		id: `${a}.key`,
		ts: `(s.started + ${t})`,
		path: field(dialect, a, "p"),
		query: field(dialect, a, "qs"),
		name,
		dur: field(dialect, a, "d", "int"),
		vis: field(dialect, a, "e", "int"),
		nav: field(dialect, a, "nt", "int"),
		exit: field(dialect, a, "x", "int"),
		scroll: field(dialect, a, "s", "int"),
		pv: `(${t} IS NOT NULL AND ${name} IS NULL)`,
		ev: `${name} IS NOT NULL`,
	};
}

/** Entry rows of the visit `s`: `json_each(s.hits) AS a` (Postgres `jsonb_each`). */
export const entriesOf = (dialect: Dialect, a = "h"): string => docEach(dialect, "s.hits", a);

/** The text of event property `key` of entry `a` (`pr`), so numbers compare like the strings users type. */
export function entryProp(dialect: Dialect, a: string, key: string): string {
	if (!PROP_KEY_RE.test(key)) throw new Error(`invalid property key: ${key}`);
	return dialect === "postgres" ? `(${ident(a)}.value -> 'pr' ->> '${key}')` : `CAST(json_extract(${ident(a)}.value, '$.pr.${key}') AS TEXT)`;
}

/**
 * How a goal predicate reads its rows: entries of the visit document, or `ca_events` rows (orders and
 * server-reported events, every one an event).
 */
export type HitSource = "entry" | "event";

function hitView(dialect: Dialect, a: string, from: HitSource) {
	if (from === "event") return { pv: FALSE.sql, ev: TRUE.sql, path: `${a}.path`, name: `${a}.name`, prop: (k: string) => propText(dialect, a, k) };
	const c = entryCols(dialect, a);
	return { pv: c.pv, ev: c.ev, path: c.path, name: c.name, prop: (k: string) => entryProp(dialect, a, k) };
}

/** The visits of the range, as a predicate on `s` (the visit day encoding of `ca_sessions.day`). */
const visitRange = (ctx: CompileCtx, alias = "s"): Frag => ({ sql: `${alias}.site = ? AND ${alias}.day BETWEEN ? AND ?`, params: [ctx.site, visitDayKey(ctx.from), visitDayKey(ctx.to)] });

/** `SELECT <expr> AS v` over the entries of the visits of the range matching `kind` (regex expansion source). */
function entrySource(ctx: CompileCtx, a: string, expr: string, kind: string): Frag {
	const r = visitRange(ctx);
	return { sql: `SELECT ${expr} AS v FROM ca_sessions s CROSS JOIN ${entriesOf(ctx.db.dialect, a)} WHERE ${r.sql} AND ${kind}`, params: r.params };
}

/** Source rows a regex is evaluated against: `SELECT <expr> AS v FROM ...`, one bounded distinct-value query per filter. */
type DistinctSource = Frag;

async function expandRegex(ctx: CompileCtx, src: DistinctSource, patterns: readonly string[]): Promise<string[]> {
	const res = patterns.map((p) => ({ p, v: validateSafeRegex(p, "i") }));
	const bad = res.find((r) => !r.v.ok);
	if (bad && !bad.v.ok) throw new QueryError("invalid_regex", `${bad.v.error} (${bad.p})`);
	const rows = await ctx.db.all<{ v: unknown }>(`SELECT DISTINCT t.v AS v FROM (${src.sql}) t WHERE t.v IS NOT NULL LIMIT ${REGEX_DISTINCT_LIMIT + 1}`, src.params);
	if (rows.length > REGEX_DISTINCT_LIMIT)
		throw new QueryError("narrow_filter", `More than ${REGEX_DISTINCT_LIMIT} distinct values in this range. Narrow the range or use contains or prefix.`);
	const res2 = patterns.map((p) => compileSafeRegex(p, "i") as RegExp);
	const matches = rows.map((r) => String(r.v)).filter((v) => res2.some((re) => re.test(v)));
	if (matches.length > REGEX_MATCH_LIMIT)
		throw new QueryError("narrow_filter", `The pattern matches more than ${REGEX_MATCH_LIMIT} values. Make it more specific.`);
	return matches;
}

/** Literal values of a filter: regex ops are expanded over `src` once, then compared with `is`. */
async function literal(ctx: CompileCtx, f: Filter, src: () => DistinctSource): Promise<{ op: Op; values: string[] }> {
	if (f.op === "regex" || f.op === "not_regex") return { op: "is", values: await expandRegex(ctx, src(), f.values) };
	return { op: f.op, values: f.values };
}

/** Positive predicate for a filter over `col`. */
async function positive(ctx: CompileCtx, col: string, f: Filter, int: boolean, src: () => DistinctSource): Promise<Frag> {
	const l = await literal(ctx, f, src);
	return literalPred(ctx.db.dialect, col, l.op, l.values, int);
}

/** `SELECT <col> AS v` over the rows of a table with ISO days in the range (session and search dims). */
const tableSource = (ctx: CompileCtx, table: string, alias: string, col: string, visit: boolean): DistinctSource => {
	const r = visit ? visitRange(ctx, alias) : { sql: `${alias}.site = ? AND ${alias}.day BETWEEN ? AND ?`, params: [ctx.site, ctx.from, ctx.to] };
	return { sql: `SELECT ${col} AS v FROM ${table} ${alias} WHERE ${r.sql}`, params: r.params };
};

// ── goals ─────────────────────────────────────────────────────────────────────

/** Hit predicate (alias `a`, an entry or a `ca_events` row) for a goal or funnel step. */
export async function goalPredicate(ctx: CompileCtx, goal: Goal | FunnelStep, a: string, from: HitSource = "entry"): Promise<Frag> {
	const d = ctx.db.dialect;
	const v = hitView(d, a, from);
	const match = goal.match as Op | "contains";
	const asFilter = (dim: Filter["dim"]): Filter => ({ dim, op: match === "contains" ? "contains" : (match as Op), values: [goal.value] });
	if (goal.type === "page") {
		if (from === "event") return FALSE;
		const src = (): DistinctSource => entrySource(ctx, "x", entryCols(d, "x").path, entryCols(d, "x").pv);
		return and([{ sql: v.pv, params: [] }, await positive(ctx, v.path, asFilter("page"), false, src)]);
	}
	if (goal.type === "event") {
		const props = "props" in goal && goal.props ? Object.entries(goal.props) : [];
		return and([{ sql: `${v.ev} AND ${v.name} = ?`, params: [goal.value] }, ...props.map(([k, val]) => ({ sql: `${v.prop(k)} = ?`, params: [val] }))]);
	}
	// Outbound: `p.url` is `host/path`; "is" means that host exactly, "contains" a part of the host or path.
	const url = v.prop("url");
	const val = goal.value.toLowerCase();
	const pred: Frag =
		match === "is"
			? { sql: `(lower(${url}) = ? OR lower(${url}) LIKE ? ${LIKE_ESCAPE})`, params: [val, `${likeEscape(val)}/%`] }
			: { sql: `lower(${url}) LIKE ? ${LIKE_ESCAPE}`, params: [match === "prefix" ? `${likeEscape(val)}%` : `%${likeEscape(val)}%`] };
	return and([{ sql: `${v.ev} AND ${v.name} = '_outbound'`, params: [] }, pred]);
}

export function findGoal(ctx: CompileCtx, name: string): Goal {
	const g = ctx.goals.find((x) => x.name === name && x.active !== false);
	if (!g) throw new QueryError("unknown_goal", `Unknown goal: ${name}`);
	return g;
}

// ── revenue filters ───────────────────────────────────────────────────────────

const NUMERIC: ReadonlySet<string> = new Set(NUM_OPS);

/**
 * Op and value rules the schema cannot express: numeric ops only on `revenue`, which takes
 * exactly one decimal value and an optional currency in `prop`; `currency` takes `is` or `is_not` and codes.
 */
export function validateFilters(filters: readonly Filter[]): void {
	for (const f of filters) {
		const bad = (msg: string): never => {
			throw new QueryError("invalid_filter", msg);
		};
		if (f.dim === "revenue") {
			if (!NUMERIC.has(f.op)) bad("The revenue filter takes gt, gte, lt or lte.");
			if (f.values.length !== 1 || !REVENUE_VALUE_RE.test(f.values[0] as string)) bad("The revenue filter takes one amount such as 50 or 49.90.");
			if (f.prop !== undefined && !normalizeCurrency(f.prop)) bad(`Unknown currency: ${f.prop}`);
		} else if (NUMERIC.has(f.op)) bad(`The operator ${f.op} is valid for the revenue filter only.`);
		else if (f.dim === "currency") {
			if (f.op !== "is" && f.op !== "is_not") bad("The currency filter takes is or is_not.");
			for (const v of f.values) if (!normalizeCurrency(v)) bad(`Unknown currency: ${v}`);
		}
	}
}

/**
 * Session predicate of a `currency` or `revenue` filter: a semi-join on the visit key `(sday, sid)` over the
 * orders of the range in `ca_events` (by the order's own day, through the `(site, day)` index). Refund rows
 * (negative `val`) are not orders and never match.
 */
function revenueFilter(ctx: CompileCtx, f: Filter): Frag {
	const base = "SELECT x.sday, x.sid FROM ca_events x WHERE x.site = ? AND x.day BETWEEN ? AND ? AND x.val >= 0 AND x.sid IS NOT NULL AND x.sday IS NOT NULL";
	const params: Param[] = [ctx.site, dayInt(ctx.from), dayInt(ctx.to)];
	const key = "(s.day, s.sid)";
	if (f.dim === "currency") {
		const codes = f.values.map((v) => normalizeCurrency(v) as string);
		const list = inList(ctx.db.dialect, "x.cur", codes);
		return { sql: `${key} ${f.op === "is_not" ? "NOT IN" : "IN"} (${base} AND ${list.sql})`, params: [...params, ...list.params] };
	}
	const cur = normalizeCurrency(f.prop ?? ctx.currency ?? "USD") ?? "USD";
	const v = Number(f.values[0]);
	// `lt` and `lte` include sessions without revenue: the complement of the `gte` or `gt` set ("less than 50, including none").
	const having = (cmp: string) => ({ sql: `${base} AND x.cur = ? GROUP BY x.sday, x.sid HAVING SUM(x.val) ${cmp} ?`, params: [...params, cur, v] });
	if (f.op === "gt" || f.op === "gte") {
		const h = having(f.op === "gt" ? ">" : ">=");
		return { sql: `${key} IN (${h.sql})`, params: h.params };
	}
	// Nothing is below zero; `lte 0` is the sessions whose orders were all free.
	if (v <= 0) {
		if (f.op === "lt") return FALSE;
		const h = having("<=");
		return { sql: `${key} IN (${h.sql})`, params: h.params };
	}
	const h = having(f.op === "lt" ? ">=" : ">");
	return { sql: `${key} NOT IN (${h.sql})`, params: h.params };
}

// ── traffic filters ───────────────────────────────────────────────────────────

export interface CompiledTraffic {
	/** Predicate over `ca_sessions s`. */
	session: Frag;
	/** Extra predicate over a page view entry with alias `h` (hit-level reports). */
	pv: Frag;
	/** Extra predicate over an event entry with alias `h`. */
	ev: Frag;
	/** The `page` filters over `ca_srv h` (Not found), whose path is a column. */
	srv: Frag;
	/** Search-only dims ignored in traffic reports. */
	ignoredTraffic: string[];
}

function negate(col: string | null, f: Frag): Frag {
	return { sql: col ? `${col} IS NULL OR NOT (${f.sql})` : `NOT (${f.sql})`, params: f.params };
}

/** Compile traffic filters (search dims are compiled by `compileSearch`). */
export async function compileTraffic(ctx: CompileCtx, filters: readonly Filter[]): Promise<CompiledTraffic> {
	const session: Frag[] = [];
	const pv: Frag[] = [];
	const ev: Frag[] = [];
	const srv: Frag[] = [];
	const ignoredTraffic: string[] = [];
	const d = ctx.db.dialect;

	validateFilters(filters);
	for (const f of filters) {
		if (f.dim === "currency" || f.dim === "revenue") {
			session.push(revenueFilter(ctx, f));
			continue;
		}
		const def = (TRAFFIC_DIMS as Record<string, DimDef>)[f.dim];
		if (!def) {
			// A search-only dim (query) in a traffic report.
			ignoredTraffic.push(f.dim);
			continue;
		}
		const neg = NEGATED.has(f.op);
		if (def.scope === "session") {
			const col = `s.${ident(def.column)}`;
			const src = (): DistinctSource => tableSource(ctx, "ca_sessions", "s", col, true);
			const p = await positive(ctx, col, f, false, src);
			session.push(neg ? negate(col, p) : p);
			continue;
		}
		// Hit dims: `EXISTS` over the visit's own entries, and the same predicate on matching entry rows.
		let inner: Frag;
		let own: { kind: "pv" | "ev"; frag: Frag } | null = null;
		if (f.dim === "goal") {
			const preds: Frag[] = [];
			for (const name of f.values) preds.push(await goalPredicate(ctx, findGoal(ctx, name), "x"));
			inner = or(preds);
		} else {
			const kind = def.kind as "pv" | "ev";
			const col = (a: string) => (f.dim === "event_prop" ? entryProp(d, a, f.prop as string) : f.dim === "page" ? entryCols(d, a).path : entryCols(d, a).name);
			const x = entryCols(d, "x");
			// `page` also restricts server rows (Not found), so its regex sees their paths too.
			const src = (): DistinctSource => {
				const e = entrySource(ctx, "x", col("x"), x[kind]);
				if (f.dim !== "page") return e;
				const r = { sql: "SELECT path AS v FROM ca_srv WHERE site = ? AND day BETWEEN ? AND ?", params: [ctx.site, dayInt(ctx.from), dayInt(ctx.to)] };
				return { sql: `${e.sql} UNION ${r.sql}`, params: [...e.params, ...r.params] };
			};
			const l = await literal(ctx, f, src);
			const pred = (c: string) => literalPred(d, c, l.op, l.values, false);
			inner = and([{ sql: x[kind], params: [] }, pred(col("x"))]);
			own = { kind, frag: neg ? negate(col("h"), pred(col("h"))) : pred(col("h")) };
			if (f.dim === "page") srv.push(neg ? negate("h.path", pred("h.path")) : pred("h.path"));
		}
		session.push({ sql: `${neg ? "NOT " : ""}EXISTS (SELECT 1 FROM ${entriesOf(d, "x")} WHERE ${inner.sql})`, params: inner.params });
		if (own) (own.kind === "pv" ? pv : ev).push(own.frag);
	}

	const out = { session: and(session), pv: and(pv), ev: and(ev), srv: and(srv), ignoredTraffic };
	// Hit reports bind the session predicate and their own row predicate in one statement.
	const hitParams = out.session.params.length + Math.max(out.pv.params.length, out.ev.params.length);
	if (hitParams > FILTER_PARAM_BUDGET)
		throw new QueryError("too_many_values", "Too many filter values in one query. Combine values with prefix or regex.");
	return out;
}

// ── search filters ────────────────────────────────────────────────────────────

export type SearchGrainDim = "page" | "query" | "country" | "device";

export interface CompiledSearch {
	/** Predicate over `ca_search_daily d`. */
	pred: Frag;
	/** Grain dimensions the filters need to be non-empty. */
	needs: Set<SearchGrainDim>;
	/** Traffic dims ignored here (typed notice). */
	ignored: string[];
}

export async function compileSearch(ctx: CompileCtx, filters: readonly Filter[]): Promise<CompiledSearch> {
	const preds: Frag[] = [];
	const needs = new Set<SearchGrainDim>();
	const ignored: string[] = [];
	for (const f of filters) {
		const def = (SEARCH_DIMS as Record<string, DimDef>)[f.dim];
		if (!def) {
			ignored.push(f.dim);
			continue;
		}
		if (f.dim !== "source") needs.add(f.dim as SearchGrainDim);
		const col = `d.${ident(def.column)}`;
		const src = (): DistinctSource => tableSource(ctx, "ca_search_daily", "d", col, false);
		const p = await positive(ctx, col, f, false, src);
		preds.push(NEGATED.has(f.op) ? negate(null, p) : p);
	}
	const pred = and(preds);
	if (pred.params.length > FILTER_PARAM_BUDGET) throw new QueryError("too_many_values", "Too many filter values in one query.");
	return { pred, needs, ignored };
}
