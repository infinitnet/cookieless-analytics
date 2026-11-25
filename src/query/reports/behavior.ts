import { roundMinor } from "../../core/currency.js";
import { dayInt } from "../../db/dialect.js";
import { chunk, MAX_PARAMS } from "../../db/sql.js";
import { andFrags, type CompileCtx, type Frag, goalPredicate, entryProp, inList, QueryError, TRUE } from "../compile.js";
import type { FunnelMode, FunnelStep } from "../filters.js";
import { entriesOf, entryCols, goalGroups, hitJoin, num, ORDER_SUMS, type ReportCtx, type ReportData, type Row, type RunInput, ratio, round, sessionTotals, sessionWhere } from "./base.js";
import { currencyList, currencyOf, metaOf } from "./revenue.js";

/** Funnels read at most this many sessions per query. */
export const FUNNEL_SESSION_CAP = 50_000;
const EV_KEYS_MAX = 10;
const EV_VALUES_MAX = 50;

const compileCtx = (rc: ReportCtx, input: RunInput): CompileCtx => ({ db: rc.db, site: rc.site, from: input.from, to: input.to, goals: rc.goals });

/** Custom events (reserved `_` names have their own reports): count, sessions, share of sessions. */
export async function events(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "ev", { sql: `${h.name} NOT LIKE '\\_%' ESCAPE '\\'`, params: [] });
	const rows = await rc.db.all(
		`SELECT ${h.name} AS key, COUNT(*) AS events, COUNT(DISTINCT s.sid) AS sessions ${j.sql} GROUP BY ${h.name} ORDER BY events DESC, key LIMIT ? OFFSET ?`,
		[...j.params, input.limit + 1, input.offset],
	);
	const total = (await sessionTotals(rc, input)).sessions ?? 0;
	return {
		rows: rows.slice(0, input.limit).map((r) => ({ key: String(r.key), events: num(r.events), sessions: num(r.sessions), rate: round(ratio(num(r.sessions), total)) })),
		truncated: rows.length > input.limit,
		total_sessions: total,
	};
}

/** Property breakdown of one event: up to 10 keys and 50 values per key. */
export async function eventProps(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const name = input.params.event;
	if (!name) throw new QueryError("invalid_params", "event_props needs params.event.");
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "ev", { sql: `${h.name} = ?`, params: [name] });
	const each =
		rc.db.dialect === "postgres"
			? { from: ", jsonb_each_text(h.value -> 'pr') AS p", key: "p.key", value: "p.value" }
			: { from: ", json_each(h.value, '$.pr') AS p", key: "p.key", value: "CAST(p.value AS TEXT)" };
	const head = `FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)}`;
	const sql = j.sql.replace(head, `${head}${each.from}`);
	const rows = await rc.db.all(`SELECT ${each.key} AS prop, ${each.value} AS value, COUNT(*) AS n ${sql} GROUP BY ${each.key}, ${each.value} ORDER BY n DESC, prop, value LIMIT 5000`, j.params);
	const perKey = new Map<string, { total: number; values: Array<{ value: string; count: number }> }>();
	for (const r of rows) {
		const k = String(r.prop);
		const e = perKey.get(k) ?? { total: 0, values: [] };
		e.total += num(r.n);
		if (e.values.length < EV_VALUES_MAX) e.values.push({ value: r.value == null ? "" : String(r.value), count: num(r.n) });
		perKey.set(k, e);
	}
	const keys = [...perKey].sort((a, b) => b[1].total - a[1].total || (a[0] < b[0] ? -1 : 1)).slice(0, EV_KEYS_MAX);
	const out: Row[] = keys.flatMap(([prop, e]) => e.values.map((v) => ({ key: `${prop}=${v.value}`, prop, value: v.value, count: v.count })));
	return { rows: out, truncated: perKey.size > EV_KEYS_MAX };
}

/** Goals: completions, converting sessions, conversion rate over the filtered session count. */
export async function goals(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const total = (await sessionTotals(rc, input)).sessions ?? 0;
	const cc = compileCtx(rc, input);
	const active = rc.goals.filter((x) => x.active !== false);
	// One statement per ten goals (UNION ALL), like the closed-day writer.
	const parts: Frag[] = [];
	for (const [i, g] of active.entries()) {
		// Same sessions as the denominator: started in range, with a pageview, matching the filters.
		const where = andFrags([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), await goalPredicate(cc, g, "h")]);
		parts.push({ sql: `SELECT ${i} AS g, COUNT(*) AS completions, COUNT(DISTINCT s.sid) AS converting FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql}`, params: where.params });
	}
	const got = new Map<number, Record<string, unknown>>();
	for (const group of goalGroups(parts)) for (const r of await rc.db.all(group.map((p) => p.sql).join(" UNION ALL "), group.flatMap((p) => p.params))) got.set(num(r.g), r);
	const rows: Row[] = active.map((g, i) => {
		const r = got.get(i);
		const converting = num(r?.converting);
		return { key: g.name, type: g.type, completions: num(r?.completions), converting, conversion_rate: round(ratio(converting, total)) };
	});
	rows.sort((a, b) => num(b.converting) - num(a.converting) || (a.key < b.key ? -1 : 1));
	return { rows, total_sessions: total };
}

/** Strict funnels walk every countable hit in JS, so they read fewer sessions. */
export const FUNNEL_STRICT_SESSION_CAP = 10_000;

type HitRow = Record<string, unknown>;

/**
 * Funnel within one session by hit time, 2 to 6 steps: sequential (default), strict or flexible.
 * With `params.withRevenue` and orders in the range, each step adds the revenue of the sessions that reached it
 * (`funnelRevenue`); without orders in the range the revenue keys are absent.
 */
export async function funnels(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const def = input.params.steps ? { name: "custom", steps: input.params.steps, mode: input.params.mode } : input.params.funnel ? rc.funnels[input.params.funnel] : undefined;
	if (!def) throw new QueryError(input.params.funnel ? "unknown_funnel" : "invalid_params", "funnels needs params.funnel or params.steps.");
	const mode: FunnelMode = def.mode ?? "sequential";
	const total = (await sessionTotals(rc, input)).sessions ?? 0;
	if (mode === "strict" && total > FUNNEL_STRICT_SESSION_CAP)
		throw new QueryError("funnel_cap", `Strict funnels read at most ${FUNNEL_STRICT_SESSION_CAP} sessions; this range has ${total}. Narrow the range, add filters or use the sequential mode.`);
	if (total > FUNNEL_SESSION_CAP)
		throw new QueryError("funnel_cap", `Funnels read at most ${FUNNEL_SESSION_CAP} sessions; this range has ${total}. Narrow the range or add filters.`);
	const cur = input.params.withRevenue ? currencyOf(rc, input) : null;
	// Furthest step per visit key, only when the range holds orders (one `LIMIT 1` probe).
	const depth = cur !== null && (await ordersInRange(rc, input)) ? new Map<string, number>() : undefined;
	const cc = compileCtx(rc, input);
	const preds: Frag[] = [];
	for (const step of def.steps as FunnelStep[]) preds.push(await goalPredicate(cc, step, "h"));
	const reached = mode === "flexible" ? await funnelFlexible(rc, input, preds, depth) : mode === "strict" ? await funnelStrict(rc, input, preds, depth) : await funnelSequential(rc, input, preds, depth);
	const first = reached[0] ?? 0;
	const out: Row[] = def.steps.map((s, i) => ({
		key: String(i + 1),
		label: s.label ?? `${s.type} ${s.match} ${s.value}`,
		sessions: reached[i] ?? 0,
		drop_off: i === 0 ? null : round(ratio((reached[i - 1] ?? 0) - (reached[i] ?? 0), reached[i - 1] ?? 0)),
		conversion: round(ratio(reached[i] ?? 0, first)),
	}));
	const data: ReportData = { rows: out, name: def.name, total_sessions: total, mode };
	return cur !== null && depth ? funnelRevenue(rc, input, cur, depth, data) : data;
}

/** Any order or refund row of the site in the range (through the partial index on `val`). */
async function ordersInRange(rc: ReportCtx, input: RunInput): Promise<boolean> {
	const [r] = await rc.db.all("SELECT 1 AS x FROM ca_events WHERE site = ? AND day BETWEEN ? AND ? AND val IS NOT NULL LIMIT 1", [rc.site, dayInt(input.from), dayInt(input.to)]);
	return !!r;
}

/** Visit keys per bound JSON parameter of the funnel revenue lookup. */
export const FUNNEL_SIDS_PER_PARAM = 1000;
/** Visit keys per revenue statement: the site and two days leave the rest of the D1 limit to the key lists (97,000, above the session cap, so one statement). */
export const funnelSidStatements = (keys: readonly string[], perParam = FUNNEL_SIDS_PER_PARAM): string[][] => chunk(keys, perParam * (MAX_PARAMS - 3));

type Sums = { orders: number; revenue: number; refunds: number; sessions: number };

/**
 * Revenue per step: every order and refund in the range (each on its own day) of the sessions that reached the step,
 * in one currency, whether the order came before or after the step. One statement over the visit keys that reached
 * step 1, grouped by visit and currency, summed per step in JS. `est_lost_revenue` is an estimate: the sessions that
 * left before the step, valued at the revenue per session of the sessions that reached the last step.
 */
async function funnelRevenue(rc: ReportCtx, input: RunInput, cur: string, depth: Map<string, number>, data: ReportData): Promise<ReportData> {
	const rows = data.rows ?? [];
	const n = rows.length;
	const steps = Array.from({ length: n }, () => new Map<string, Sums>());
	for (const part of funnelSidStatements([...depth.keys()])) {
		const keys = inList(rc.db.dialect, "(h.sday || '|' || h.sid)", part, false, FUNNEL_SIDS_PER_PARAM);
		const found = await rc.db.all(
			`SELECT h.sday || '|' || h.sid AS sid, h.cur AS cur, ${ORDER_SUMS} FROM ca_events h WHERE h.site = ? AND h.day BETWEEN ? AND ? AND h.val IS NOT NULL AND (${keys.sql}) GROUP BY h.sday, h.sid, h.cur`,
			[rc.site, dayInt(input.from), dayInt(input.to), ...keys.params],
		);
		for (const r of found) {
			const code = String(r.cur);
			for (let i = 0; i < (depth.get(String(r.sid)) ?? 0); i++) {
				const s = steps[i]?.get(code) ?? { orders: 0, revenue: 0, refunds: 0, sessions: 0 };
				s.orders += num(r.orders);
				s.revenue += num(r.revenue);
				s.refunds += num(r.refunds);
				s.sessions += num(r.sessions);
				steps[i]?.set(code, s);
			}
		}
	}
	const list = currencyList([...(steps[0] ?? new Map<string, Sums>())].map(([c, s]) => ({ cur: c, ...s })), null, cur);
	const own = steps.map((m) => m.get(cur));
	const withRefunds = own.some((s) => (s?.refunds ?? 0) > 0);
	const lastSessions = num(rows[n - 1]?.sessions);
	const perCompleter = ratio(roundMinor(own[n - 1]?.revenue ?? 0, cur), lastSessions);
	return {
		...data,
		...metaOf(list, cur),
		rows: rows.map((row, i) => {
			const revenue = roundMinor(own[i]?.revenue ?? 0, cur);
			const refunds = roundMinor(own[i]?.refunds ?? 0, cur);
			const orders = own[i]?.orders ?? 0;
			const left = i === 0 ? 0 : num(rows[i - 1]?.sessions) - num(row.sessions);
			return {
				...row,
				revenue,
				...(withRefunds ? { refunds, net_revenue: roundMinor(revenue - refunds, cur) } : {}),
				orders,
				aov: orders > 0 ? roundMinor(revenue / orders, cur) : null,
				paying_sessions: own[i]?.sessions ?? 0,
				revenue_per_session: round(ratio(revenue, num(row.sessions))),
				est_lost_revenue: i === 0 || perCompleter === null ? null : roundMinor(left * perCompleter, cur),
				revenue_currency: cur,
			};
		}),
	};
}

/** Entries of the filtered sessions in range matching `extra`, with one `m<i>` flag per step, ordered by visit, time and key. */
async function stepHits(rc: ReportCtx, input: RunInput, preds: Frag[], extra: Frag): Promise<HitRow[]> {
	const h = entryCols(rc.db.dialect);
	const cases = preds.map((p, i) => ({ sql: `CASE WHEN ${p.sql} THEN 1 ELSE 0 END AS m${i}`, params: p.params }));
	const where = andFrags([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), extra]);
	// `sid` is the visit key: one sid may start visits on two days.
	return rc.db.all(
		`SELECT s.day || '|' || s.sid AS sid, ${h.ts} AS ts, ${cases.map((c) => c.sql).join(", ")} FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql} ORDER BY s.day, s.sid, ts, ${h.id}`,
		[...cases.flatMap((c) => c.params), ...where.params],
	);
}

const anyStep = (preds: Frag[]): Frag => ({ sql: preds.map((p) => `(${p.sql})`).join(" OR "), params: preds.flatMap((p) => p.params) });

/** Groups of one session's hits sharing a second (hit times are whole seconds). */
function* secondGroups(rows: HitRow[]): Generator<{ sid: unknown; group: Array<HitRow | null>; last: boolean }> {
	let i = 0;
	while (i < rows.length) {
		const sid = rows[i]?.sid;
		const ts = rows[i]?.ts;
		const group: Array<HitRow | null> = [];
		while (i < rows.length && rows[i]?.sid === sid && rows[i]?.ts === ts) group.push(rows[i++] as HitRow);
		yield { sid, group, last: rows[i]?.sid !== sid };
	}
}

/** Consume hits of one same-second group for consecutive steps from `step`, in any order; returns the new step. */
function advance(group: Array<HitRow | null>, step: number, n: number): number {
	for (let progress = true; progress && step < n; ) {
		progress = false;
		for (const [k, r] of group.entries())
			if (r && step < n && num(r[`m${step}`]) === 1) {
				step++;
				group[k] = null;
				progress = true;
			}
	}
	return step;
}

/** Sequential: step n is any later matching hit of the session. */
async function funnelSequential(rc: ReportCtx, input: RunInput, preds: Frag[], depth?: Map<string, number>): Promise<number[]> {
	const rows = await stepHits(rc, input, preds, anyStep(preds));
	// Hit times are whole seconds: hits sharing a second may satisfy steps in either order.
	const reached = new Array<number>(preds.length).fill(0);
	let step = 0;
	for (const { sid, group, last } of secondGroups(rows)) {
		const next = advance(group, step, preds.length);
		for (let k = step; k < next; k++) reached[k] = (reached[k] ?? 0) + 1;
		if (last && next > 0) depth?.set(String(sid), next);
		step = last ? 0 : next;
	}
	return reached;
}

/**
 * Strict: step n must be the next countable hit after the step n-1 hit (pageviews, user events and any
 * hit matching a step). A second without the next step breaks the chain, which may restart there; a
 * session counts the furthest chain. Hits sharing a second are simultaneous and never break it.
 */
async function funnelStrict(rc: ReportCtx, input: RunInput, preds: Frag[], depth?: Map<string, number>): Promise<number[]> {
	const h = entryCols(rc.db.dialect);
	const countable = { sql: `${h.pv} OR (${h.ev} AND ${h.name} NOT LIKE '\\_%' ESCAPE '\\') OR ${anyStep(preds).sql}`, params: anyStep(preds).params };
	const rows = await stepHits(rc, input, preds, countable);
	const n = preds.length;
	const reached = new Array<number>(n).fill(0);
	let step = 0;
	let best = 0;
	for (const { sid, group, last } of secondGroups(rows)) {
		if (step < n) {
			const next = advance(group, step, n);
			step = next > step || step === 0 ? next : advance(group, 0, n);
			best = Math.max(best, step);
		}
		if (last) {
			for (let k = 0; k < best; k++) reached[k] = (reached[k] ?? 0) + 1;
			if (best > 0) depth?.set(String(sid), best);
			step = 0;
			best = 0;
		}
	}
	return reached;
}

/**
 * Flexible: step n counts sessions that completed steps 1 to n in any order; one statement, no walk. With `depth`
 * the same statement returns one row per visit instead of the sums, for the revenue lookup.
 */
async function funnelFlexible(rc: ReportCtx, input: RunInput, preds: Frag[], depth?: Map<string, number>): Promise<number[]> {
	const flags = preds.map((p, i) => ({ sql: `MAX(CASE WHEN ${p.sql} THEN 1 ELSE 0 END) AS f${i}`, params: p.params }));
	const where = andFrags([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), anyStep(preds)]);
	const params = [...flags.flatMap((f) => f.params), ...where.params];
	if (depth) {
		const rows = await rc.db.all(`SELECT s.day || '|' || s.sid AS sid, ${flags.map((f) => f.sql).join(", ")} FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql} GROUP BY s.day, s.sid`, params);
		const reached = new Array<number>(preds.length).fill(0);
		for (const r of rows) {
			let k = 0;
			for (; k < preds.length && num(r[`f${k}`]) === 1; k++) reached[k] = (reached[k] ?? 0) + 1;
			if (k > 0) depth.set(String(r.sid), k);
		}
		return reached;
	}
	const sums = preds.map((_, i) => `SUM(CASE WHEN ${preds.slice(0, i + 1).map((_p, j) => `t.f${j} = 1`).join(" AND ")} THEN 1 ELSE 0 END) AS r${i}`);
	const [r] = await rc.db.all(`SELECT ${sums.join(", ")} FROM (SELECT ${flags.map((f) => f.sql).join(", ")} FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql} GROUP BY s.day, s.sid) t`, params);
	return preds.map((_, i) => num(r?.[`r${i}`]));
}

/** Reserved auto event by its fixed property: outbound `url`, download `file`, form `form`. */
function reserved(name: string, prop: string) {
	return async (rc: ReportCtx, input: RunInput): Promise<ReportData> => {
		const v = entryProp(rc.db.dialect, "h", prop);
		const j = hitJoin(rc, input, "ev", { sql: `${entryCols(rc.db.dialect).name} = ?`, params: [name] });
		const rows = await rc.db.all(
			`SELECT COALESCE(${v}, '(not set)') AS key, COUNT(*) AS events, COUNT(DISTINCT s.sid) AS sessions ${j.sql} GROUP BY COALESCE(${v}, '(not set)') ORDER BY events DESC, key LIMIT ? OFFSET ?`,
			[...j.params, input.limit + 1, input.offset],
		);
		return { rows: rows.slice(0, input.limit).map((r) => ({ key: String(r.key), events: num(r.events), sessions: num(r.sessions) })), truncated: rows.length > input.limit };
	};
}
export const outbound = reserved("_outbound", "url");
export const downloads = reserved("_download", "file");
export const forms = reserved("_form", "form");

export const SCROLL_BUCKETS = [0, 25, 50, 75, 100] as const;

/** Pageviews by maximum scroll depth bucket (0, 25, 50, 75, 100). */
export async function scroll(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const sc = entryCols(rc.db.dialect).scroll;
	const j = hitJoin(rc, input, "pv", { sql: `${sc} IS NOT NULL`, params: [] });
	const bucket = `CASE WHEN ${sc} >= 100 THEN 100 WHEN ${sc} >= 75 THEN 75 WHEN ${sc} >= 50 THEN 50 WHEN ${sc} >= 25 THEN 25 ELSE 0 END`;
	const rows = await rc.db.all(`SELECT ${bucket} AS b, COUNT(*) AS n ${j.sql} GROUP BY ${bucket}`, j.params);
	const counts = new Map(rows.map((r) => [num(r.b), num(r.n)]));
	const total = [...counts.values()].reduce((a, b) => a + b, 0);
	return { rows: SCROLL_BUCKETS.map((b) => ({ key: String(b), pageviews: counts.get(b) ?? 0, share: round(ratio(counts.get(b) ?? 0, total)) })) };
}
