/** SQL statement helpers: parameter counting and chunked `IN` lists (D1 allows 100 bound parameters). */

export const MAX_PARAMS = 100;
export const IN_CHUNK = 90;

export type Param = string | number | bigint | boolean | null | Uint8Array;

export interface Stmt {
	sql: string;
	params?: Param[];
}

export function chunk<T>(items: readonly T[], size = IN_CHUNK): T[][] {
	if (size < 1) throw new Error("chunk size must be positive");
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/** Number of `?` placeholders outside single-quoted strings. */
export function countParams(sql: string): number {
	let n = 0;
	let quoted = false;
	for (const c of sql) {
		if (c === "'") quoted = !quoted;
		else if (c === "?" && !quoted) n++;
	}
	return n;
}

/** Throws when placeholders and params disagree or the statement exceeds the D1 parameter limit. */
export function assertParams(sql: string, params: readonly unknown[] = []): void {
	const n = countParams(sql);
	if (n !== params.length) throw new Error(`statement has ${n} placeholders but ${params.length} params`);
	if (n > MAX_PARAMS) throw new Error(`statement has ${n} params, limit ${MAX_PARAMS}`);
}

const IDENT_RE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

/** Accept only plain lowercase identifiers (optionally `table.column`) from fixed maps. */
export function ident(name: string): string {
	if (!IDENT_RE.test(name)) throw new Error(`invalid identifier: ${name}`);
	return name;
}

/**
 * `col IN (?, ...)` fragments, one per chunk, leaving `reserved` parameters free in each statement.
 * Callers OR the fragments together or run one statement per fragment.
 */
export function inChunks(column: string, values: readonly Param[], reserved = 0): Stmt[] {
	const size = Math.min(IN_CHUNK, MAX_PARAMS - reserved);
	if (size < 1) throw new Error("no parameters left for IN list");
	const col = ident(column);
	return chunk(values, size).map((part) => ({ sql: `${col} IN (${part.map(() => "?").join(", ")})`, params: [...part] }));
}
