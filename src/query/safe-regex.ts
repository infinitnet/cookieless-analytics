/**
 * Safe regex validator: an RE2-like subset checked by a small parser, so a pattern
 * that passes cannot backtrack catastrophically on the bounded inputs it runs on.
 * Rules: length <= 200, groups <= 20, flag `i` only; no backreferences, lookaround, Unicode property
 * escapes; repeats `{m,n}` with n <= 50; a quantified group may not contain a quantifier or an
 * alternation, and may not take an unbounded `{m,}`. Open-ended repeats (`*`, `+`, `{m,}`): one per
 * pattern, two when the pattern starts with `^` (two unanchored overlapping repeats such as `.*x.*`
 * take hundreds of milliseconds on a 512 character input). The bounded variable repeats (`?`, `{m,n}`)
 * may allow at most 1000 combinations together.
 */

export type SafeRegexResult = { ok: true } | { ok: false; error: string };

export const MAX_PATTERN_LENGTH = 200;
export const MAX_GROUPS = 20;
export const MAX_REPEAT = 50;
export const MAX_COMBINATIONS = 1000;

const fail = (error: string): SafeRegexResult => ({ ok: false, error });

interface Frame {
	hasQuantifier: boolean;
	hasAlternation: boolean;
}

/** Quantifier at `i`, or null. Returns its end index and whether it is unbounded. */
function quantifierAt(p: string, i: number): { end: number; unbounded: boolean; min: number; max: number } | { error: string } | null {
	const c = p[i];
	let end: number;
	let unbounded = false;
	let min = c === "+" ? 1 : 0;
	let max = 1;
	if (c === "*" || c === "+") {
		end = i + 1;
		unbounded = true;
		max = Number.POSITIVE_INFINITY;
	} else if (c === "?") {
		end = i + 1;
	} else if (c === "{") {
		const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i));
		if (!m) return null; // a literal brace
		const lo = Number(m[1]);
		min = lo;
		max = m[2] === undefined ? lo : m[3] === "" ? Number.POSITIVE_INFINITY : Number(m[3]);
		if (lo > MAX_REPEAT || (Number.isFinite(max) && max > MAX_REPEAT)) return { error: `Repeats above ${MAX_REPEAT} are not allowed.` };
		unbounded = !Number.isFinite(max);
		end = i + m[0].length;
	} else return null;
	if (p[end] === "?") end++; // lazy form, same cost class
	return { end, unbounded, min, max };
}

/** Length of the escape sequence at `i` (pointing at the backslash), or an error. */
function escapeAt(p: string, i: number): number | { error: string } {
	const n = p[i + 1];
	if (n === undefined) return { error: "Pattern does not compile." };
	if (/[1-9]/.test(n) || (n === "k" && p[i + 2] === "<")) return { error: "Backreferences are not allowed." };
	if (n === "p" || n === "P") return { error: "Unicode property escapes are not allowed." };
	if (n === "u") return /^[0-9a-fA-F]{4}$/.test(p.slice(i + 2, i + 6)) ? 6 : { error: "Pattern does not compile." };
	if (n === "x") return /^[0-9a-fA-F]{2}$/.test(p.slice(i + 2, i + 4)) ? 4 : { error: "Pattern does not compile." };
	if (n === "c") return /[A-Za-z]/.test(p[i + 2] ?? "") ? 3 : { error: "Pattern does not compile." };
	return 2;
}

export function validateSafeRegex(pattern: string, flags = ""): SafeRegexResult {
	if (typeof pattern !== "string" || pattern.length === 0) return fail("Pattern is empty.");
	if (pattern.length > MAX_PATTERN_LENGTH) return fail(`Pattern is longer than ${MAX_PATTERN_LENGTH} characters.`);
	if (!/^i?$/.test(flags)) return fail("Only the i flag is allowed.");

	const p = pattern;
	const stack: Frame[] = [{ hasQuantifier: false, hasAlternation: false }];
	let groups = 0;
	let openEnded = 0;
	let combinations = 1;
	// What the last atom was, so a following quantifier can be checked against it.
	let last: { kind: "none" } | { kind: "atom" } | { kind: "group"; frame: Frame } = { kind: "none" };
	let i = 0;
	while (i < p.length) {
		const c = p[i] as string;
		const top = stack[stack.length - 1] as Frame;
		if (c === "\\") {
			const len = escapeAt(p, i);
			if (typeof len !== "number") return fail(len.error);
			i += len;
			last = { kind: "atom" };
			continue;
		}
		if (c === "[") {
			let j = i + 1;
			if (p[j] === "^") j++;
			if (p[j] === "]") j++;
			while (j < p.length && p[j] !== "]") {
				if (p[j] === "\\") {
					const len = escapeAt(p, j);
					if (typeof len !== "number") return fail(len.error);
					j += len;
				} else j++;
			}
			if (j >= p.length) return fail("Pattern does not compile.");
			i = j + 1;
			last = { kind: "atom" };
			continue;
		}
		if (c === "(") {
			if (p[i + 1] === "?") {
				const rest = p.slice(i + 2);
				if (/^<?[=!]/.test(rest)) return fail("Lookaround is not allowed.");
				const named = /^<[A-Za-z_][A-Za-z0-9_]*>/.exec(rest);
				if (rest.startsWith(":")) i += 3;
				else if (named) i += 2 + named[0].length;
				else return fail("Pattern does not compile.");
			} else i += 1;
			if (++groups > MAX_GROUPS) return fail(`More than ${MAX_GROUPS} groups are not allowed.`);
			stack.push({ hasQuantifier: false, hasAlternation: false });
			last = { kind: "none" };
			continue;
		}
		if (c === ")") {
			if (stack.length < 2) return fail("Pattern does not compile.");
			const frame = stack.pop() as Frame;
			const parent = stack[stack.length - 1] as Frame;
			// Inner quantifiers make the enclosing group "contain a quantifier" too.
			if (frame.hasQuantifier) parent.hasQuantifier = true;
			i += 1;
			last = { kind: "group", frame };
			continue;
		}
		if (c === "|") {
			top.hasAlternation = true;
			i += 1;
			last = { kind: "none" };
			continue;
		}
		const q = quantifierAt(p, i);
		if (q && "error" in q) return fail(q.error);
		if (q) {
			if (last.kind === "none") return fail("Pattern does not compile.");
			if (last.kind === "group" && q.max > 1) {
				if (last.frame.hasQuantifier) return fail("Nested quantifiers are not allowed.");
				if (last.frame.hasAlternation) return fail("Quantified groups with alternation are not allowed.");
				if (q.unbounded && p[i] === "{") return fail("Unbounded repeats on groups are not allowed.");
			}
			top.hasQuantifier = true;
			if (q.unbounded) openEnded++;
			else combinations *= q.max - q.min + 1;
			if (combinations > MAX_COMBINATIONS) return fail("Optional and ranged repeats allow too many combinations.");
			i = q.end;
			// A quantifier directly after a quantifier is invalid in JavaScript anyway.
			last = { kind: "none" };
			continue;
		}
		i += 1;
		last = { kind: "atom" };
	}
	if (stack.length !== 1) return fail("Pattern does not compile.");
	const anchored = p.startsWith("^") && !(stack[0] as Frame).hasAlternation;
	if (openEnded > (anchored ? 2 : 1))
		return fail(anchored ? "At most two open-ended repeats (*, +) are allowed." : "At most one open-ended repeat (*, +) is allowed unless the pattern starts with ^.");
	try {
		new RegExp(p, flags);
	} catch {
		return fail("Pattern does not compile.");
	}
	return { ok: true };
}

/** Compile a validated pattern, or return null. */
export function compileSafeRegex(pattern: string, flags = "i"): RegExp | null {
	return validateSafeRegex(pattern, flags).ok ? new RegExp(pattern, flags) : null;
}
