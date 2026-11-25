/**
 * Compound SELECTs within the Cloudflare D1 limit. D1 refuses a compound SELECT of more than 5 terms (SELECTs joined
 * by UNION, UNION ALL, INTERSECT or EXCEPT at one level; each subquery and CTE body is a compound of its own) with
 * `too many terms in compound SELECT`. Every union the plugin builds from parts goes through this module: a fixed
 * union of at most 5 parts through `unionAll`, a union of any number of parts through `unionAllChunked`, which runs
 * the fewest statements of at most 5 terms (and at most `MAX_PARAMS` bound parameters) in order and concatenates their rows.
 */
import type { Db } from "./adapter.js";
import { MAX_PARAMS, type Param } from "./sql.js";

/** Terms D1 allows in one compound SELECT (SQLite's `SQLITE_LIMIT_COMPOUND_SELECT` on D1). */
export const MAX_COMPOUND_TERMS = 5;

/** One SELECT term and its bound parameters. */
export interface SelectPart {
	sql: string;
	params: readonly Param[];
}

/**
 * Terms per statement of `unionAllChunked`. Always `MAX_COMPOUND_TERMS` in the plugin; tests raise it to compare the
 * chunked statements with the single unchunked statement on a database without the limit.
 */
export const compoundTerms = { max: MAX_COMPOUND_TERMS };

/** A union of at most `MAX_COMPOUND_TERMS` parts as one SELECT (`op` UNION ALL by default); more parts throw. */
export function unionAll(parts: readonly SelectPart[], op: "UNION ALL" | "UNION" = "UNION ALL"): { sql: string; params: Param[] } {
	if (!parts.length) throw new Error("a union needs at least one part");
	if (parts.length > MAX_COMPOUND_TERMS) throw new Error(`a union of ${parts.length} parts passes the ${MAX_COMPOUND_TERMS} terms D1 allows in one compound SELECT; use unionAllChunked`);
	return { sql: parts.map((p) => p.sql).join(` ${op} `), params: parts.flatMap((p) => p.params) };
}

export interface ChunkOptions {
	/** Prefix of every statement (a `WITH` clause) and its parameters, bound before the parts' parameters. */
	head?: SelectPart;
	/** Bound parameters per statement (default `MAX_PARAMS`). */
	maxParams?: number;
}

/**
 * `parts` in groups, in order: the fewest groups such that each has at most `compoundTerms.max` parts and binds at most
 * `maxParams` parameters with the head. A single part over the parameter budget gets a group of its own.
 */
export function unionGroups<T extends SelectPart>(parts: readonly T[], o: ChunkOptions = {}): T[][] {
	const budget = (o.maxParams ?? MAX_PARAMS) - (o.head?.params.length ?? 0);
	const groups: T[][] = [];
	let n = 0;
	for (const p of parts) {
		const g = groups[groups.length - 1];
		if (g && g.length < compoundTerms.max && n + p.params.length <= budget) {
			g.push(p);
			n += p.params.length;
		} else {
			groups.push([p]);
			n = p.params.length;
		}
	}
	return groups;
}

/** The statements `unionAllChunked` runs for these parts. */
export function unionAllStatements(parts: readonly SelectPart[], o: ChunkOptions = {}): Array<{ sql: string; params: Param[] }> {
	const head = o.head ? `${o.head.sql} ` : "";
	return unionGroups(parts, o).map((g) => ({ sql: `${head}${g.map((p) => p.sql).join(" UNION ALL ")}`, params: [...(o.head?.params ?? []), ...g.flatMap((p) => p.params)] }));
}

/** Statements of a union of `parts` parts: `Math.ceil(parts / MAX_COMPOUND_TERMS)` (parts within the parameter budget). */
export const unionStatements = (parts: number) => Math.ceil(parts / MAX_COMPOUND_TERMS);

/**
 * The rows of `part1 UNION ALL part2 UNION ALL ...`, run as the fewest statements of at most `MAX_COMPOUND_TERMS` terms
 * each (and at most `maxParams` parameters), in order, concatenated. No parts: no statement, no rows. Every part names
 * its columns (`AS`): any part can be the first term of a statement, and the first term names the result columns.
 * Callers that aggregate across parts (a `GROUP BY` over the union) do it over the returned rows.
 */
export async function unionAllChunked<T = Record<string, unknown>>(db: Db, parts: readonly SelectPart[], o: ChunkOptions = {}): Promise<T[]> {
	const out: T[] = [];
	for (const s of unionAllStatements(parts, o)) out.push(...(await db.all<T>(s.sql, s.params)));
	return out;
}

const WORD = /[A-Za-z0-9_$]/;
const OPS = new Set(["UNION", "INTERSECT", "EXCEPT"]);

/**
 * The largest number of terms of any compound SELECT in `sql`, counted the way SQLite counts them: compound operators
 * (UNION, UNION ALL, INTERSECT, EXCEPT) at one parenthesis level of one statement, plus one. Each parenthesized
 * subquery or CTE body counts on its own. String literals, quoted identifiers and comments are skipped. A multi-row
 * VALUES list is not a compound for this limit, as in SQLite.
 */
export function maxCompoundTerms(sql: string): number {
	let max = 1;
	// Compound operators of each open parenthesis level; the bottom entry is the statement itself.
	const stack: number[] = [0];
	const close = () => {
		const ops = stack.pop() ?? 0;
		max = Math.max(max, ops + 1);
	};
	let i = 0;
	const n = sql.length;
	while (i < n) {
		const c = sql[i] as string;
		if (c === "'" || c === '"' || c === "`") {
			// A doubled quote inside is the quote character itself.
			i++;
			while (i < n) {
				if (sql[i] === c) {
					if (sql[i + 1] === c) i += 2;
					else break;
				} else i++;
			}
			i++;
		} else if (c === "[") {
			const end = sql.indexOf("]", i + 1);
			i = end < 0 ? n : end + 1;
		} else if (c === "-" && sql[i + 1] === "-") {
			const end = sql.indexOf("\n", i + 2);
			i = end < 0 ? n : end + 1;
		} else if (c === "/" && sql[i + 1] === "*") {
			const end = sql.indexOf("*/", i + 2);
			i = end < 0 ? n : end + 2;
		} else if (c === "(") {
			stack.push(0);
			i++;
		} else if (c === ")") {
			if (stack.length > 1) close();
			i++;
		} else if (c === ";") {
			// Next statement of a script: close everything still open, start again.
			while (stack.length > 1) close();
			close();
			stack.push(0);
			i++;
		} else if (WORD.test(c)) {
			let j = i + 1;
			while (j < n && WORD.test(sql[j] as string)) j++;
			if (OPS.has(sql.slice(i, j).toUpperCase())) stack[stack.length - 1] = (stack[stack.length - 1] as number) + 1;
			i = j;
		} else i++;
	}
	while (stack.length) close();
	return max;
}

/** The error D1 answers for a compound SELECT over the limit. */
export const COMPOUND_ERROR = "D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR";

/** Throws D1's error when a compound SELECT in `sql` has more than `MAX_COMPOUND_TERMS` terms. */
export function assertCompound(sql: string): void {
	if (maxCompoundTerms(sql) > MAX_COMPOUND_TERMS) throw new Error(COMPOUND_ERROR);
}
