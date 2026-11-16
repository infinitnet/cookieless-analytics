/**
 * Admin UI preferences in browser storage. The only admin file that may name browser storage
 * (`tests/no-storage.test.ts`); the public page script never stores anything.
 *
 * Keys are namespaced `ca.<name>` and carry a version in the name (`view.v1`). Every read is validated by
 * the caller's parser, and every access is wrapped: with storage blocked (private mode, a sandboxed frame)
 * reads give the fallback and writes do nothing.
 */
import { useCallback, useState } from "react";

/** `session`: this browser tab until it closes. `local`: this browser, across restarts. */
export type PrefScope = "session" | "local";
/** Turns stored JSON into a value, or undefined when it does not fit (then the caller's fallback applies). */
export type PrefParser<T> = (raw: unknown) => T | undefined;

const store = (scope: PrefScope): Storage | null => {
	try {
		return scope === "local" ? window.localStorage : window.sessionStorage;
	} catch {
		return null;
	}
};

/** The stored value of `ca.<name>`, parsed; undefined when absent, unreadable or rejected by `parse`. */
export function readPref<T>(scope: PrefScope, name: string, parse: PrefParser<T>): T | undefined {
	try {
		const raw = store(scope)?.getItem(`ca.${name}`);
		return raw == null ? undefined : parse(JSON.parse(raw));
	} catch {
		return undefined;
	}
}

/** Store `value` as JSON under `ca.<name>`; undefined removes the key. Never throws (quota, blocked storage). */
export function writePref(scope: PrefScope, name: string, value: unknown): void {
	try {
		const s = store(scope);
		if (value === undefined) s?.removeItem(`ca.${name}`);
		else s?.setItem(`ca.${name}`, JSON.stringify(value));
	} catch {
		// Storage full or blocked: the preference lives for this render only.
	}
}

/** A preference as React state: starts from storage (else `fallback`), and every set writes it back. */
export function usePref<T>(scope: PrefScope, name: string, parse: PrefParser<T>, fallback: T): [T, (next: T) => void] {
	const [value, setValue] = useState<T>(() => readPref(scope, name, parse) ?? fallback);
	const set = useCallback(
		(next: T) => {
			setValue(next);
			writePref(scope, name, next);
		},
		[scope, name],
	);
	return [value, set];
}

// ── Parsers for the common shapes ───────────────────────────────────────────

export const isBool: PrefParser<boolean> = (v) => (typeof v === "boolean" ? v : undefined);
/** A string array of at most `max` items, each matching `re`. */
export const stringList =
	(re: RegExp, max = 50): PrefParser<string[]> =>
	(v) =>
		Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && re.test(x)) ? (v as string[]) : undefined;
/** A record of `parse`-able values by key; entries that fail are dropped. */
export const recordOf =
	<T>(parse: PrefParser<T>): PrefParser<Record<string, T>> =>
	(v) => {
		if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
		const out: Record<string, T> = {};
		for (const [k, x] of Object.entries(v)) {
			const p = parse(x);
			if (p !== undefined) out[k] = p;
		}
		return out;
	};

// ── Chart metrics per page (`m` in the URL, the personal default in `ca.metrics.v1`) ──

/** Most metrics a chart shows at once; the page's own rules may allow fewer. */
export const MAX_METRICS = 4;
const METRICS_KEY = "metrics.v1";
const METRIC_RE = /^[a-z][a-z0-9_]{0,39}$/;
const metricsMap = recordOf(stringList(METRIC_RE, MAX_METRICS));

const keep = (list: readonly string[] | undefined, allowed: readonly string[]) => [...new Set(list ?? [])].filter((k) => allowed.includes(k)).slice(0, MAX_METRICS);
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The selected chart metrics of page `page`: the URL `m` (from `QueryState.m`), else this browser's
 * personal default, else `defaults`; each list is cut to the page's `allowed` metrics, an empty result
 * falls through to the next.
 */
export function chartMetrics(page: string, m: readonly string[] | undefined, allowed: readonly string[], defaults: readonly string[]): string[] {
	for (const list of [m, readPref("local", METRICS_KEY, metricsMap)?.[page], defaults]) {
		const k = keep(list, allowed);
		if (k.length) return k;
	}
	return allowed.slice(0, 1);
}

/**
 * Remember `selected` as the personal default of `page` and return the URL value: undefined when it
 * equals `defaults`, so default links stay short. Use as `update({ m: setChartMetrics(...) })`.
 */
export function setChartMetrics(page: string, selected: readonly string[], defaults: readonly string[]): string[] | undefined {
	const all = readPref("local", METRICS_KEY, metricsMap) ?? {};
	const isDefault = same(selected, defaults);
	if (isDefault) delete all[page];
	else all[page] = selected.slice(0, MAX_METRICS);
	writePref("local", METRICS_KEY, all);
	return isDefault ? undefined : selected.slice(0, MAX_METRICS);
}
