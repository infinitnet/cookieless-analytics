/**
 * Config routes: `config/<collection>/list|save|delete` over the plugin
 * storage collections, all `plugins:manage`. Every regex is checked
 * with the safe regex validator at save time.
 */
import { PluginRouteError } from "emdash";
import { z } from "zod";
import { browserWarnings, builtinOverride, diffRules, formatRule, type LineIssue, type LineRule, orderWarnings, parseRuleLines, RULE_TEXT, ruleKey } from "../agents/lines.js";
import { AGENT_CATEGORIES, AGENTS, MAX_RULE_PATTERN, MAX_USER_REGEX_RULES, MAX_USER_RULES } from "../agents/rules.js";
import { BUILTIN_CHANNEL_RULES } from "../core/channels.js";
import { AGENT_RULES_KEY } from "../agents/stored.js";
import { type KvLike, randomId } from "../core/crypto.js";
import { CLICK_IDS } from "../core/url.js";
import { FilterSchema, FUNNEL_MODES, FunnelStepsSchema, GoalSchema, MAX_FILTERS } from "../query/filters.js";
import { validateSafeRegex } from "../query/safe-regex.js";
import { normalizeAnnotation, PathShortcut, ScopeSchema, scopeInput } from "../annotations/scope.js";
import { TargetSchema } from "../annotations/target.js";
import { loadAnnotations } from "./data.js";
import { bindSite, SiteField } from "../multisite/registry.js";
import type { Settings } from "../settings.js";

const safeRegex = (p: string) => validateSafeRegex(p, "i").ok;
const regexMsg = (p: string) => {
	const v = validateSafeRegex(p, "i");
	return v.ok ? "" : `Unsafe or invalid regex: ${v.error}`;
};
const SafeRegex = z
	.string()
	.min(1)
	.max(200)
	.superRefine((p, ctx) => {
		if (!safeRegex(p)) ctx.addIssue({ code: "custom", message: regexMsg(p) });
	});

const GoalItem = GoalSchema.superRefine((g, ctx) => {
	if (g.match === "regex" && !safeRegex(g.value)) ctx.addIssue({ code: "custom", path: ["value"], message: regexMsg(g.value) });
});

const FunnelItem = z
	.object({ name: z.string().min(1).max(64), steps: FunnelStepsSchema, mode: z.enum(FUNNEL_MODES).default("sequential") })
	.strict()
	.superRefine((f, ctx) => {
		f.steps.forEach((s, i) => {
			if (s.match === "regex" && !safeRegex(s.value)) ctx.addIssue({ code: "custom", path: ["steps", i, "value"], message: regexMsg(s.value) });
		});
	});

const SegmentItem = z
	.object({ name: z.string().min(1).max(64), filters: z.array(FilterSchema).min(1).max(MAX_FILTERS) })
	.strict()
	.superRefine((s, ctx) => {
		s.filters.forEach((f, i) => {
			if (f.op !== "regex" && f.op !== "not_regex") return;
			for (const v of f.values) if (!safeRegex(v)) ctx.addIssue({ code: "custom", path: ["filters", i, "values"], message: regexMsg(v) });
		});
	});

const HostList = z.enum(["search", "social", "video", "shopping", "ai", "webmail", "ignore"]);
const ChannelCondition = z
	.object({
		list: HostList,
		refList: HostList,
		medium: SafeRegex,
		source: SafeRegex,
		campaign: SafeRegex,
		mediumIn: z.array(z.string().min(1).max(64)).max(50),
		sourceIn: z.array(z.string().min(1).max(64)).max(50),
		click: z.array(z.enum(CLICK_IDS)).min(1),
		adsSource: HostList,
		referrer: z.literal(true),
		utm: z.literal(true),
		direct: z.literal(true),
	})
	.partial()
	.strict()
	.refine((c) => Object.keys(c).length > 0, { message: "A condition needs at least one test." });

const BUILTIN_IDS = BUILTIN_CHANNEL_RULES.map((r) => r.id) as [string, ...string[]];
/** A user rule at any priority, or the switch-off of one built-in rule (built-ins are disable-only). */
const ChannelRuleItem = z.union([
	z.object({ channel: z.string().min(1).max(64), any: z.array(ChannelCondition).min(1).max(10), priority: z.number().int().min(-1000).max(10_000), enabled: z.boolean().optional() }).strict(),
	z.object({ disables: z.enum(BUILTIN_IDS) }).strict(),
]);

const AgentRuleItem = z
	.object({
		// The text view carries every stored rule: no edge spaces and no " # ", which starts a comment there.
		pattern: z.string().trim().min(1).max(512).refine((p) => !p.includes(" # "), RULE_TEXT.hash),
		mode: z.enum(["contains", "prefix", "exact", "regex"]),
		action: z.enum(["robot", "human"]),
		name: z.string().max(64).optional(),
		category: z.enum(AGENT_CATEGORIES as [string, ...string[]]).optional(),
		priority: z.number().int().min(0).max(10_000).optional(),
		enabled: z.boolean().optional(),
	})
	.strict()
	.superRefine((r, ctx) => {
		if (r.mode === "regex" && !safeRegex(r.pattern)) ctx.addIssue({ code: "custom", path: ["pattern"], message: regexMsg(r.pattern) });
	});

export const AnnotationItem = z
	.object({
		ts: z.number().int().min(0),
		kind: z.enum(["manual", "publish", "update", "release"]),
		text: z.string().min(1).max(200),
		/** Input shortcut for one path `is` rule; never stored. */
		path: PathShortcut.nullish(),
		scope: ScopeSchema.optional(),
		/** The KPI the Annotations page measures; absent means the default (visitors of the scope). */
		target: TargetSchema.optional(),
		slug: z.string().max(256).optional(),
		collection: z.string().max(64).optional(),
		ref: z.string().max(128).optional(),
	})
	.strict();

/** Stored form of an annotation: the `path` shortcut becomes the scope, `path` with `scope` is a conflict. */
function annotationRecord(data: z.output<typeof AnnotationItem>): Record<string, unknown> {
	const { path, scope: input, ...rest } = data;
	const scope = scopeInput(path, input);
	if (scope === null) throw new PluginRouteError("scope_conflict", "Send either path or scope, not both.", 400);
	return { ...rest, ...(scope ? { scope } : {}) };
}

export const CONFIG_SCHEMAS = {
	goals: GoalItem,
	funnels: FunnelItem,
	segments: SegmentItem,
	channel_rules: ChannelRuleItem,
	agent_rules: AgentRuleItem,
	annotations: AnnotationItem,
} as const;
export type ConfigCollection = keyof typeof CONFIG_SCHEMAS;
export const CONFIG_COLLECTIONS = Object.keys(CONFIG_SCHEMAS) as ConfigCollection[];

const Id = z.string().regex(/^[A-Za-z0-9:._-]{1,128}$/);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** `from` and `to` (annotations only): the newest 500 of that range, normalized, with `truncated`. */
export const ListBody = z
	.object({ cursor: z.string().max(512).optional(), limit: z.number().int().min(1).max(100).optional(), site: SiteField, from: Day.optional(), to: Day.optional() })
	.strict();
export const DeleteBody = z.object({ id: Id, site: SiteField }).strict();
export const saveBody = (c: ConfigCollection) => z.object({ id: Id.optional(), data: CONFIG_SCHEMAS[c], site: SiteField }).strict();

interface Coll {
	query(o?: { where?: Record<string, unknown>; limit?: number; cursor?: string }): Promise<{ items: Array<{ id: string; data: unknown }>; cursor?: string; hasMore: boolean }>;
	get(id: string): Promise<unknown>;
	put(id: string, data: unknown): Promise<void>;
	delete(id: string): Promise<boolean>;
	putMany?(items: Array<{ id: string; data: unknown }>): Promise<void>;
	deleteMany?(ids: string[]): Promise<number>;
	count?(where?: Record<string, unknown>): Promise<number>;
}

export interface ConfigCtx {
	input: unknown;
	storage: Partial<Record<string, Coll>>;
	/** Plugin options; user agent rule writes copy the whole set to `AGENT_RULES_KEY` for the middleware. */
	kv?: Pick<KvLike, "set">;
}

export interface ConfigEnv {
	settings(): Promise<Pick<Settings, "siteId"> & Partial<Pick<Settings, "siteTimezone">>>;
	/** Called after a write so isolate caches (agent and channel rules) reload. */
	changed?(c: ConfigCollection): void;
}

/** The bound site of a config call: the body `site` when it is local or registered, else the local site. */
const siteFor = async (env: ConfigEnv, ctx: ConfigCtx, site: string | undefined) => (await bindSite(site, (await env.settings()).siteId, ctx.storage.sites)).id;
/** User agent rules are one set for every install (the classifier runs before any site is known): stored under the local site, read without a site filter. */
const siteOfColl = (c: ConfigCollection, env: ConfigEnv, ctx: ConfigCtx, site: string | undefined) => (c === "agent_rules" ? env.settings().then((s) => s.siteId) : siteFor(env, ctx, site));

const siteOf = (v: unknown) => (v && typeof v === "object" ? (v as { site?: unknown }).site : undefined);
/** A stored item belongs to the bound site; every user agent rule belongs to the install, whatever siteId it was saved under. */
const owns = (c: ConfigCollection, v: unknown, siteId: string) => c === "agent_rules" || siteOf(v) === siteId;

function coll(ctx: ConfigCtx, c: ConfigCollection): Coll {
	const s = ctx.storage[c];
	if (!s) throw new PluginRouteError("storage_unavailable", `The ${c} collection is not available.`, 500);
	return s;
}

/** Every stored user agent rule of the install, in the order the classifier applies them (oldest first); no site filter, like the loader. */
async function agentRuleRows(store: Coll): Promise<Array<{ id: string; data: LineRule }>> {
	const rows: Array<{ id: string; data: LineRule }> = [];
	let cursor: string | undefined;
	// Ten pages of 100 cover the 500-rule cap with room for rows written before a cap check.
	for (let i = 0; i < 10; i++) {
		const page = await store.query({ limit: 100, ...(cursor ? { cursor } : {}) });
		rows.push(...page.items.map((it) => ({ id: it.id, data: it.data as LineRule })));
		if (!page.hasMore || !page.cursor) break;
		cursor = page.cursor;
	}
	return rows;
}

/** Refuse a single save that would pass the total or the regex cap, or repeat the mode and pattern of another rule. */
async function checkRuleCaps(store: Coll, rule: { mode: string; pattern: string }, exceptId?: string) {
	const { mode } = rule;
	const rows = (await agentRuleRows(store)).filter((r) => r.id !== exceptId);
	if (rows.some((r) => ruleKey(r.data) === ruleKey(rule))) throw new PluginRouteError("duplicate_rule", RULE_TEXT.same, 400);
	if (rows.length >= MAX_USER_RULES) throw new PluginRouteError("too_many_rules", `At most ${MAX_USER_RULES} user agent rules in total.`, 400);
	if (mode === "regex" && rows.filter((r) => r.data.mode === "regex").length >= MAX_USER_REGEX_RULES)
		throw new PluginRouteError("too_many_rules", `At most ${MAX_USER_REGEX_RULES} regex user agent rules.`, 400);
}

/** Copy the whole rule set (`rows`, as stored) to the options key the middleware reads, then drop the isolate caches. */
async function rulesChanged(env: ConfigEnv, ctx: ConfigCtx, rows: Array<{ id: string; data: LineRule }>) {
	await ctx.kv?.set(
		AGENT_RULES_KEY,
		rows.map((r) => {
			const { site: _s, ...rule } = r.data as LineRule & { site?: unknown };
			return rule;
		}),
	);
	env.changed?.("agent_rules");
}

/** Bulk body: the whole rule set as text; `check` validates and diffs without writing. */
export const BulkRulesBody = z.object({ text: z.string().max(MAX_USER_RULES * 700), check: z.boolean().optional() }).strict();
export const BUILTIN_PAGE = 50;
/** Rows one bulk save writes: the host writes one statement per put, D1 allows 50 queries per invocation. */
export const BULK_WRITES_PER_CALL = 30;
export const BuiltinBody = z
	.object({ q: z.string().max(200).optional(), category: z.enum(AGENT_CATEGORIES as [string, ...string[]]).optional(), page: z.number().int().min(0).max(100).optional() })
	.strict();

/** The rule routes beyond list, save and delete: the whole set as text, and the read-only built-in list. */
function agentRuleRoutes(env: ConfigEnv) {
	return {
		"config/agent_rules/bulk": {
			permission: "plugins:manage" as const,
			input: BulkRulesBody,
			async handler(ctx: ConfigCtx) {
				const body = BulkRulesBody.parse(ctx.input);
				const site = (await env.settings()).siteId;
				const store = coll(ctx, "agent_rules");
				const parsed = parseRuleLines(body.text);
				const errors: LineIssue[] = [...parsed.errors];
				// The single-rule validator, line by line.
				for (const r of parsed.rules) {
					const v = AgentRuleItem.safeParse({ pattern: r.pattern, mode: r.mode, action: r.action, ...(r.name ? { name: r.name } : {}) });
					if (!v.success) errors.push({ line: r.line, message: v.error.issues[0]?.message ?? "Invalid rule." });
				}
				errors.sort((a, b) => a.line - b.line);
				const stored = await agentRuleRows(store);
				const diff = diffRules(stored, parsed.rules.map(({ line: _l, ...r }) => r));
				const summary = {
					errors,
					warnings: [...browserWarnings(parsed.rules), ...orderWarnings(parsed.rules, stored.map((r) => r.data))].sort((a, b) => a.line - b.line),
					total: parsed.rules.length,
					added: diff.added.map(formatRule),
					changed: diff.changed.map((c) => ({ from: formatRule(c.from), to: formatRule(c.to) })),
					removed: diff.removed.map((r) => formatRule(r.data)),
					unchanged: diff.unchanged,
				};
				if (body.check) return { ...summary, written: 0 };
				const first = errors[0];
				if (first) throw new PluginRouteError("invalid_rules", `Line ${first.line}: ${first.message} Nothing was saved.`, 400);
				// The text carries no category: a kept bot rule keeps its stored category.
				const merged = (from: Record<string, unknown>, to: LineRule) => {
					const { name: _n, category, ...rest } = from;
					return { ...rest, ...to, ...(to.action === "robot" && category ? { category } : {}), site };
				};
				// Ids sort in line order, so new rules apply in the order of the text (the host lists by creation time, then id).
				const stamp = Date.now().toString(36);
				const puts = [
					...diff.changed.map((c) => ({ id: c.id, data: merged(c.from as unknown as Record<string, unknown>, c.to) })),
					...diff.added.map((r, i) => ({ id: `${stamp}-${String(i).padStart(3, "0")}-${randomId(8)}`, data: { ...r, site } })),
				];
				const dels = diff.removed.map((r) => r.id);
				if (!store.putMany || !store.deleteMany) throw new PluginRouteError("storage_unavailable", "Bulk writes are not available.", 500);
				// Only changed, added and removed rows, at most BULK_WRITES_PER_CALL a call: the host runs one statement per put
				// (one per 100 deletes), so a call stays inside the D1 query budget. Not atomic across calls: the page repeats the
				// save until `remaining` is 0, and each call diffs against what is stored, so a repeat continues where one stopped.
				const putsNow = puts.slice(0, BULK_WRITES_PER_CALL);
				const delsNow = dels.slice(0, BULK_WRITES_PER_CALL - putsNow.length);
				if (putsNow.length) await store.putMany(putsNow);
				if (delsNow.length) await store.deleteMany(delsNow);
				const written = putsNow.length + delsNow.length;
				// Always on a save, so a repeat after a call that stopped past its writes still refreshes the copy.
				// The rows read above with this call's writes applied: no second read.
				const rows = new Map(stored.map((r) => [r.id, r.data]));
				for (const id of delsNow) rows.delete(id);
				// A changed row keeps its place, an added one goes last, as the host lists them.
				for (const r of putsNow) rows.set(r.id, r.data as unknown as LineRule);
				await rulesChanged(env, ctx, [...rows].map(([id, data]) => ({ id, data })));
				return { ...summary, written, remaining: puts.length + dels.length - written };
			},
		},
		"config/agent_rules/builtin": {
			permission: "plugins:manage" as const,
			input: BuiltinBody,
			async handler(ctx: ConfigCtx) {
				const { q, category, page = 0 } = BuiltinBody.parse(ctx.input ?? {});
				const needle = q?.trim().toLowerCase();
				const hits = AGENTS.filter(
					(a) =>
						(!category || a.category === category) &&
						(!needle || a.name.toLowerCase().includes(needle) || a.match.pattern.toLowerCase().includes(needle) || a.operator.toLowerCase().includes(needle)),
				);
				return {
					total: hits.length,
					page,
					pageSize: BUILTIN_PAGE,
					items: hits.slice(page * BUILTIN_PAGE, (page + 1) * BUILTIN_PAGE).map((a) => ({
						id: a.id,
						name: a.name,
						category: a.category,
						source: a.source,
						mode: a.match.mode,
						pattern: a.match.pattern,
						override: builtinOverride(a.match),
					})),
				};
			},
		},
	};
}

/** The three routes of one collection, keyed by route name. */
export function configRoutes(env: ConfigEnv) {
	const routes: Record<string, { permission: "plugins:manage"; input: z.ZodType; handler(ctx: ConfigCtx): Promise<unknown> }> = {};
	for (const c of CONFIG_COLLECTIONS) {
		const SaveBody = saveBody(c);
		routes[`config/${c}/list`] = {
			permission: "plugins:manage",
			input: ListBody,
			async handler(ctx) {
				const body = ListBody.parse(ctx.input ?? {});
				const siteId = await siteOfColl(c, env, ctx, body.site);
				if (c === "annotations" && body.from && body.to) {
					const tz = (await env.settings()).siteTimezone ?? "UTC";
					const r = await loadAnnotations(coll(ctx, c), siteId, body.from, body.to, tz);
					return { items: r.items.map(({ id, ...data }) => ({ id, data })), cursor: null, truncated: r.truncated };
				}
				const page = await coll(ctx, c).query({ ...(c === "agent_rules" ? {} : { where: { site: siteId } }), limit: body.limit ?? 100, ...(body.cursor ? { cursor: body.cursor } : {}) });
				// Annotations go through the read side: an unreadable scope reads as site-wide.
				const items = c === "annotations" ? page.items.map((it) => ({ id: it.id, data: normalizeAnnotation(it.data) ?? it.data })) : page.items;
				return { items, cursor: page.hasMore ? (page.cursor ?? null) : null };
			},
		};
		routes[`config/${c}/save`] = {
			permission: "plugins:manage",
			input: SaveBody,
			async handler(ctx) {
				const body = SaveBody.parse(ctx.input);
				const siteId = await siteOfColl(c, env, ctx, body.site);
				const store = coll(ctx, c);
				const id = body.id ?? randomId(16);
				if (body.id) {
					const cur = await store.get(body.id);
					if (cur && !owns(c, cur, siteId)) throw new PluginRouteError("not_found", "Unknown item.", 404);
				}
				const data = c === "annotations" ? annotationRecord(body.data as z.output<typeof AnnotationItem>) : (body.data as Record<string, unknown>);
				if (c === "agent_rules") await checkRuleCaps(store, data as { mode: string; pattern: string }, body.id);
				const item = { ...data, site: siteId };
				await store.put(id, item);
				if (c === "agent_rules") await rulesChanged(env, ctx, await agentRuleRows(store));
				else env.changed?.(c);
				return { id, data: item };
			},
		};
		routes[`config/${c}/delete`] = {
			permission: "plugins:manage",
			input: DeleteBody,
			async handler(ctx) {
				const { id, site } = DeleteBody.parse(ctx.input);
				const siteId = await siteOfColl(c, env, ctx, site);
				const store = coll(ctx, c);
				const cur = await store.get(id);
				if (!cur || !owns(c, cur, siteId)) throw new PluginRouteError("not_found", "Unknown item.", 404);
				await store.delete(id);
				if (c === "agent_rules") await rulesChanged(env, ctx, await agentRuleRows(store));
				else env.changed?.(c);
				return { id, deleted: true };
			},
		};
	}
	Object.assign(routes, agentRuleRoutes(env));
	return routes;
}
