/**
 * Annotation scopes: the versioned scope object, the read adapter, the one
 * matching function every surface shares, scope to filters for SQL, and the short summary.
 * Pure and free of host code, so the server routes, the dashboard runner, the share renderer and the
 * admin bundle import the same file.
 */
import { z } from "zod";
import { dayInZone } from "../core/time.js";
import { type Filter, NEGATED, type Op } from "../query/filters.js";
import { compileSafeRegex, validateSafeRegex } from "../query/safe-regex.js";
import { type Target, TargetSchema } from "./target.js";

export const SCOPE_VERSION = 1;
export const MAX_SCOPE_RULES_PER_KIND = 10;
export const MAX_SCOPE_RULES = 20;
export const MAX_SCOPE_VALUE = 512;

export const SCOPE_KINDS = ["host", "path", "query"] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];
export type RuleOp = "is" | "prefix" | "regex";
export const KIND_OPS: Record<ScopeKind, readonly RuleOp[]> = { host: ["is", "regex"], path: ["is", "prefix", "regex"], query: ["is", "regex"] };
/** The filter dimension each kind pairs with. */
export const KIND_DIM = { host: "host", path: "page", query: "query" } as const satisfies Record<ScopeKind, Filter["dim"]>;

export interface Rule {
	op: RuleOp;
	value: string;
}
export interface Scope {
	v: 1;
	host?: Rule[];
	path?: Rule[];
	query?: Rule[];
}

/** Kind labels of the popover, the list and the shared page. */
export const KIND_LABELS: Record<string, string> = { manual: "Manual", publish: "Published", update: "Updated", release: "Release" };

export const SCOPE_MESSAGES = {
	empty: "Add at least one rule or choose Site-wide.",
	host: "Host must be a lowercase hostname without scheme or port.",
	path: "Path must start with /.",
	count: "At most 10 rules per kind and 20 in total.",
	mixed: "Combine fewer rules of different kinds in one scope.",
	version: "Unknown scope version.",
	noSource: "Query rules apply to Search data only; this site has no Search source yet.",
} as const;

const HOST_RE = /^[a-z0-9.-]{1,253}$/;

const RuleSchema = z.object({ op: z.enum(["is", "prefix", "regex"]), value: z.string().min(1).max(MAX_SCOPE_VALUE) }).strict();

/** Escape a literal for use inside a regex. */
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** The one regex a kind with mixed ops compiles to. */
function mixedPattern(rules: readonly Rule[]): string {
	return rules.map((r) => (r.op === "is" ? `^${escapeRegex(r.value)}$` : r.op === "prefix" ? `^${escapeRegex(r.value)}` : `(?:${r.value})`)).join("|");
}
const isMixed = (rules: readonly Rule[]) => new Set(rules.map((r) => r.op)).size > 1;

/**
 * Write schema. Site-wide forms: absent, `{}`, `{ v: 1 }`. The output always carries `v: 1` and only
 * non-empty rule lists.
 */
/** The plain shape, without the checks and the normalizing transform (the MCP tool input must be JSON Schema representable). */
export const ScopeShape = z.object({ v: z.number().optional(), host: z.array(RuleSchema).optional(), path: z.array(RuleSchema).optional(), query: z.array(RuleSchema).optional() }).strict();
/** Typed by hand: the inferred refine and transform chain costs the type checker more than it is worth. */
export const ScopeSchema: z.ZodType<Scope, { v?: number; host?: Rule[]; path?: Rule[]; query?: Rule[] }> = ScopeShape
	.superRefine((s, ctx) => {
		if (s.v !== undefined && s.v !== SCOPE_VERSION) {
			ctx.addIssue({ code: "custom", path: ["v"], message: SCOPE_MESSAGES.version, params: { code: "scope_unknown_version" } });
			return;
		}
		let total = 0;
		for (const kind of SCOPE_KINDS) {
			const rules = s[kind] ?? [];
			total += rules.length;
			if (rules.length > MAX_SCOPE_RULES_PER_KIND) ctx.addIssue({ code: "custom", path: [kind], message: SCOPE_MESSAGES.count });
			rules.forEach((r, i) => {
				const at = [kind, i, "value"];
				if (!KIND_OPS[kind].includes(r.op)) ctx.addIssue({ code: "custom", path: [kind, i, "op"], message: `The operator ${r.op} is not allowed for ${kind} rules.` });
				else if (r.op === "regex") {
					const v = validateSafeRegex(r.value, "i");
					if (!v.ok) ctx.addIssue({ code: "custom", path: at, message: v.error });
				} else if (kind === "host" && !HOST_RE.test(r.value)) ctx.addIssue({ code: "custom", path: at, message: SCOPE_MESSAGES.host });
				else if (kind === "path" && !r.value.startsWith("/")) ctx.addIssue({ code: "custom", path: at, message: SCOPE_MESSAGES.path });
			});
			if (rules.length <= MAX_SCOPE_RULES_PER_KIND && isMixed(rules) && rules.every((r) => KIND_OPS[kind].includes(r.op)) && !validateSafeRegex(mixedPattern(rules), "i").ok)
				ctx.addIssue({ code: "custom", path: [kind], message: SCOPE_MESSAGES.mixed });
		}
		if (total > MAX_SCOPE_RULES) ctx.addIssue({ code: "custom", message: SCOPE_MESSAGES.count });
	})
	.transform((s): Scope => {
		const out: Scope = { v: 1 };
		for (const kind of SCOPE_KINDS) if (s[kind]?.length) out[kind] = s[kind] as Rule[];
		return out;
	});

/** The `path` write shortcut: one page path. */
export const PathShortcut = z.string().max(MAX_SCOPE_VALUE).refine((p) => p === "" || p.startsWith("/"), { message: SCOPE_MESSAGES.path });

/**
 * Write side: `path` stands for one path `is` rule; `path` with `scope` is a conflict (null).
 * A site-wide scope is stored as no scope.
 */
export function scopeInput(path: string | null | undefined, scope: Scope | undefined): Scope | undefined | null {
	if (path && scope) return null;
	if (path) return { v: 1, path: [{ op: "is", value: path }] };
	return scope && !isSiteWide(scope) ? scope : undefined;
}

export const isSiteWide = (scope: Scope | undefined) => !scope || SCOPE_KINDS.every((k) => !scope[k]?.length);

/** A stored annotation after the read adapter. */
export interface Annotation {
	id?: string;
	site?: string;
	ts: number;
	kind: string;
	text: string;
	/** Absent means site-wide. */
	scope?: Scope;
	/** The KPI its impact is measured on; absent means the default (`defaultTarget`). */
	target?: Target;
	collection?: string;
	ref?: string;
	slug?: string;
	/** `scope_unknown_version` when a stored scope could not be read. */
	notice?: string;
}

const Stored = z
	.object({
		site: z.string().optional(),
		ts: z.number(),
		kind: z.string(),
		text: z.string(),
		scope: z.unknown().optional(),
		target: z.unknown().optional(),
		collection: z.string().optional(),
		ref: z.string().optional(),
		slug: z.string().optional(),
	})
	.passthrough();

/**
 * Read side for every reader: an unreadable scope reads as site-wide with a notice. Null for a
 * malformed record.
 */
export function normalizeAnnotation(record: unknown, id?: string): Annotation | null {
	const r = Stored.safeParse(record);
	if (!r.success) return null;
	const { site, ts, kind, text, scope, target, collection, ref, slug } = r.data;
	const out: Annotation = { ...(id !== undefined ? { id } : {}), ...(site !== undefined ? { site } : {}), ts, kind, text };
	if (scope !== undefined && scope !== null) {
		const s = ScopeSchema.safeParse(scope);
		if (s.success) {
			if (!isSiteWide(s.data)) out.scope = s.data;
		} else out.notice = "scope_unknown_version";
	}
	// An invalid stored target reads as the default target.
	const t = target === undefined ? null : TargetSchema.safeParse(target);
	if (t?.success) out.target = t.data;
	if (collection !== undefined) out.collection = collection;
	if (ref !== undefined) out.ref = ref;
	if (slug !== undefined) out.slug = slug;
	return out;
}

export interface MatchContext {
	site: string;
	/** Days `YYYY-MM-DD` in `tz`, inclusive. */
	from: string;
	to: string;
	tz: string;
	target: "traffic" | "search";
	/** Exactly the filters the report runs with (segment plus page plus tile filters). */
	filters: readonly Filter[];
}

/** Per-call cache: each pattern compiles once and each (pattern, value) test runs once across a list. */
export type RegexCache = Map<string, RegExp | boolean | null>;
const test = (cache: RegexCache, p: string, v: string): boolean => {
	const key = `${p}\u0000${v}`;
	const hit = cache.get(key);
	if (typeof hit === "boolean") return hit;
	if (!cache.has(p)) cache.set(p, compileSafeRegex(p, "i"));
	const out = (cache.get(p) as RegExp | null)?.test(v) ?? false;
	cache.set(key, out);
	return out;
};

/** Does the concrete value `v` pass the positive form of filter op `op` with value `fv`? */
function valuePasses(kind: ScopeKind, op: Op, fv: string, v: string, cache: RegexCache): boolean {
	const ci = kind !== "path";
	const a = ci ? v.toLowerCase() : v;
	const b = ci ? fv.toLowerCase() : fv;
	switch (op) {
		case "is":
		case "is_not":
			return a === b;
		case "prefix":
		case "not_prefix":
			return a.startsWith(b);
		case "contains":
		case "not_contains":
			return a.includes(b);
		default:
			return test(cache, fv, v);
	}
}

/** Does rule `r` intersect the value `fv` of a positive filter with op `op`? */
function intersects(kind: ScopeKind, r: Rule, op: Op, fv: string, cache: RegexCache): boolean {
	if (r.op === "is") return valuePasses(kind, op, fv, r.value, cache);
	if (op === "is") {
		if (r.op === "prefix") return fv.startsWith(r.value);
		return test(cache, r.value, fv);
	}
	// Prefix against prefix is decidable; every other pattern pair is assumed to intersect ("shown when unsure").
	if (r.op === "prefix" && op === "prefix") return fv.startsWith(r.value) || r.value.startsWith(fv);
	return true;
}

function kindPasses(kind: ScopeKind, rules: readonly Rule[], filters: readonly Filter[], cache: RegexCache): boolean {
	const dim = KIND_DIM[kind];
	const on = filters.filter((f) => f.dim === dim);
	if (!on.length) return true;
	const neg = on.filter((f) => NEGATED.has(f.op));
	// Negative filters exclude `is` rules whose value they cover; pattern rules are assumed to survive.
	const alive = rules.filter((r) => r.op !== "is" || !neg.some((f) => f.values.some((fv) => valuePasses(kind, f.op, fv, r.value, cache))));
	if (!alive.length) return false;
	// Filters are ANDed, the values of one filter ORed.
	return on.filter((f) => !NEGATED.has(f.op)).every((f) => f.values.some((fv) => alive.some((r) => intersects(kind, r, f.op, fv, cache))));
}

/** The one matching function. Pass the same `cache` across a list. */
export function annotationMatches(a: Annotation, c: MatchContext, cache: RegexCache = new Map()): boolean {
	if (a.site !== undefined && a.site !== c.site) return false;
	const day = dayInZone(a.ts, c.tz);
	if (day < c.from || day > c.to) return false;
	const s = a.scope;
	if (!s) return true;
	if (s.query?.length && c.target !== "search") return false;
	return SCOPE_KINDS.every((k) => !s[k]?.length || kindPasses(k, s[k] as Rule[], c.filters, cache));
}

/** The annotation as the routes return it: `id, ts, day, kind, text, scope, summary`. */
export interface AnnotationView {
	id?: string;
	ts: number;
	day: string;
	kind: string;
	text: string;
	/** Null means site-wide. */
	scope: Scope | null;
	summary: string;
}
export const annotationView = (a: Annotation, tz: string): AnnotationView => ({
	...(a.id !== undefined ? { id: a.id } : {}),
	ts: a.ts,
	day: dayInZone(a.ts, tz),
	kind: a.kind,
	text: a.text,
	scope: a.scope ?? null,
	summary: scopeSummary(a.scope),
});

/** The matching annotations of a list, oldest first, with one regex cache for the whole list. */
export function matchAnnotations(list: readonly Annotation[], c: MatchContext): Annotation[] {
	const cache: RegexCache = new Map();
	return list.filter((a) => annotationMatches(a, c, cache)).sort((x, y) => x.ts - y.ts);
}

/**
 * Scope to filters for anything that runs SQL: one filter per op per kind, a kind with
 * mixed ops as one regex filter. `normalizePage` maps path `is` values to page keys on search targets.
 */
export function scopeToFilters(scope: Scope | undefined, target: "traffic" | "search", normalizePage?: (path: string) => string): { filters: Filter[]; notices: string[] } {
	const filters: Filter[] = [];
	const notices: string[] = [];
	if (!scope) return { filters, notices };
	for (const kind of SCOPE_KINDS) {
		const rules = scope[kind];
		if (!rules?.length) continue;
		if (kind === "host" && target === "search") {
			notices.push("scope_host_not_applied");
			continue;
		}
		if (kind === "query" && target === "traffic") {
			notices.push("scope_query_not_applied");
			continue;
		}
		const dim = KIND_DIM[kind];
		const list = kind === "path" && target === "search" && normalizePage ? rules.map((r) => (r.op === "is" ? { ...r, value: normalizePage(r.value) } : r)) : rules;
		if (isMixed(list)) filters.push({ dim, op: "regex", values: [mixedPattern(list)] });
		else filters.push({ dim, op: (list[0] as Rule).op, values: list.map((r) => r.value) });
	}
	return { filters, notices };
}

const NOUN: Record<ScopeKind, [string, string]> = { host: ["Host", "Hosts"], path: ["Page", "Pages"], query: ["Query", "Queries"] };

function ruleSummary(kind: ScopeKind, r: Rule): string {
	const [one, many] = NOUN[kind];
	if (r.op === "is") return `${one} ${r.value}`;
	if (r.op === "prefix") return `${many} starting with ${r.value}`;
	return `${many} matching ${r.value}`;
}

/** Short human form. */
export function scopeSummary(scope: Scope | undefined): string {
	if (!scope || isSiteWide(scope)) return "Site-wide";
	const parts: string[] = [];
	for (const kind of SCOPE_KINDS) {
		const rules = scope[kind];
		if (!rules?.length) continue;
		if (rules.length <= 2) parts.push(rules.map((r) => ruleSummary(kind, r)).join(" or "));
		else if (kind === "query" && rules.every((r) => r.op === "is")) parts.push(`Queries: ${rules.length} terms`);
		else parts.push(`${NOUN[kind][1]}: ${rules.length} rules`);
	}
	return parts.join(" and ");
}
