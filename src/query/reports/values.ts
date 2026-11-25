import { textMatch } from "../../db/dialect.js";
import { ident } from "../../db/sql.js";
import { andFrags, entriesOf, entryCols, entryProp, type Frag, QueryError, TRUE } from "../compile.js";
import { type DimDef, PROP_KEY_RE, SEARCH_DIMS, TRAFFIC_DIMS } from "../filters.js";
import { num, type ReportCtx, type ReportData, type RunInput, sessionWhere, visitDays } from "./base.js";

const VALUES_LIMIT = 50;

/** Distinct values of one dimension for autocompletion (limit 50, optional prefix). */
export async function dimensionValues(rc: ReportCtx, input: RunInput): Promise<ReportData> {
	const { dim, prop, prefix, scope = "traffic" } = input.params;
	const def = (scope === "search" ? SEARCH_DIMS : TRAFFIC_DIMS) as Record<string, DimDef>;
	const d = dim ? def[dim] : undefined;
	if (!dim || !d) throw new QueryError("invalid_params", "dimension_values needs a valid params.dim.");
	const limit = Math.min(input.limit, VALUES_LIMIT);
	if (dim === "goal") {
		const p = (prefix ?? "").toLowerCase();
		const names = rc.goals.filter((g) => g.active !== false && g.name.toLowerCase().startsWith(p)).map((g) => g.name);
		return { rows: names.slice(0, limit).map((key) => ({ key, count: null })) };
	}
	let table: string;
	let expr: string;
	let base: Frag;
	if (d.scope === "search") {
		table = "ca_search_daily d";
		expr = `d.${ident(d.column)}`;
		base = { sql: `d.site = ? AND d.day BETWEEN ? AND ? AND ${expr} <> ''`, params: [rc.site, input.from, input.to] };
	} else if (d.scope === "session") {
		table = "ca_sessions s";
		expr = `s.${ident(d.column)}`;
		base = sessionWhere(rc.site, input.from, input.to, TRUE);
	} else {
		const h = entryCols(rc.db.dialect);
		table = `ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)}`;
		if (dim === "event_prop") {
			if (!prop || !PROP_KEY_RE.test(prop)) throw new QueryError("invalid_params", "event_prop needs a valid params.prop.");
			expr = entryProp(rc.db.dialect, "h", prop);
		} else expr = dim === "page" ? h.path : h.name;
		base = andFrags([visitDays(rc.site, input.from, input.to), { sql: d.kind === "pv" ? h.pv : h.ev, params: [] }]);
	}
	const where = andFrags([
		base,
		{ sql: `${expr} IS NOT NULL`, params: [] },
		prefix ? textMatch(rc.db.dialect, `lower(${expr})`, "prefix", prefix) : TRUE,
	]);
	const rows = await rc.db.all(`SELECT ${expr} AS v, COUNT(*) AS n FROM ${table} WHERE ${where.sql} GROUP BY ${expr} ORDER BY n DESC, v LIMIT ?`, [...where.params, limit]);
	return { rows: rows.map((r) => ({ key: String(r.v), count: num(r.n) })) };
}
