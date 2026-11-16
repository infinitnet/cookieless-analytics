/** Templates: a dashboard with every segment, goal and funnel reference written as the record's name. */
import acquisition from "../data/templates/acquisition.json";
import behaviour from "../data/templates/behaviour.json";
import content from "../data/templates/content.json";
import overview from "../data/templates/overview.json";
import satisfaction from "../data/templates/satisfaction.json";
import revenue from "../data/templates/revenue.json";
import search from "../data/templates/search.json";
import seoOverview from "../data/templates/seo-overview.json";
import cannibalization from "../data/templates/cannibalization.json";
import positionBands from "../data/templates/position-bands.json";
import winnersLosers from "../data/templates/winners-losers.json";
import impactLastChanges from "../data/templates/impact-last-changes.json";
import weeklyDigest from "../data/templates/weekly-digest.json";
import links from "../data/templates/links.json";
import type { Filter } from "../query/filters.js";
import { type Dashboard, type DashboardInputT, parseStrict, type Template, TemplateSchema, type Tile, withoutEmail } from "./schema.js";

/** Built-in gallery, in display order. */
export const BUILTIN_TEMPLATES: Readonly<Record<string, unknown>> = {
	overview,
	content,
	acquisition,
	behaviour,
	satisfaction,
	revenue,
	"weekly-digest": weeklyDigest,
	search,
	"impact-last-changes": impactLastChanges,
	"seo-overview": seoOverview,
	cannibalization,
	"position-bands": positionBands,
	"winners-losers": winnersLosers,
	links,
};
export const BUILTIN_NAMES = Object.keys(BUILTIN_TEMPLATES) as [string, ...string[]];
/** Gallery group of each built-in template: Analytics (ten, with Links) and SEO (four). */
export const TEMPLATE_GROUPS = ["Analytics", "SEO"] as const;
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number];
export const BUILTIN_GROUPS: Readonly<Record<string, TemplateGroup>> = Object.fromEntries(
	BUILTIN_NAMES.map((n) => [n, ["seo-overview", "cannibalization", "position-bands", "winners-losers"].includes(n) ? "SEO" : "Analytics"]),
);

export type DepKind = "segments" | "goals" | "funnels";
export const DEP_KINDS: readonly DepKind[] = ["goals", "segments", "funnels"];

/** A config item of the target site (`data` holds at least `name`). */
export interface Item {
	id: string;
	data: { name?: unknown; [k: string]: unknown };
}
export type Lookups = Record<DepKind, readonly Item[]>;

export interface Unresolved {
	kind: DepKind;
	name: string;
	/** Tile id, or `defaults`. */
	tile: string;
}

const nameOf = (items: readonly Item[], id: string | undefined) => (id ? (items.find((i) => i.id === id)?.data.name as string | undefined) : undefined);
const goalNames = (filters: readonly Filter[] | undefined) => (filters ?? []).filter((f) => f.dim === "goal").flatMap((f) => f.values);
const strip = ({ site: _s, ...rest }: Item["data"]) => rest as { name: string };

/** Ids to names; with `withDependencies` the full definitions of the referenced records are embedded. References that no longer exist are dropped. */
export function toTemplate(d: Dashboard, deps: Lookups, opts: { withDependencies: boolean }): Template {
	const tiles: Tile[] = d.tiles.flatMap((t) => {
		if (!t.params) return [t];
		const { goal, funnel, ...p } = t.params;
		const g = nameOf(deps.goals, goal);
		const f = nameOf(deps.funnels, funnel);
		// A tile that cannot run without its deleted goal or funnel is left out, so the template stays valid.
		if ((goal && !g && t.kind === "kpi") || (funnel && !f)) return [];
		const params = { ...p, ...(g ? { goal: g } : {}), ...(f ? { funnel: f } : {}) };
		return [Object.keys(params).length ? { ...t, params } : (({ params: _p, ...rest }) => rest)(t)];
	});
	const segment = nameOf(deps.segments, d.defaults.segment);
	const compareSegment = nameOf(deps.segments, d.defaults.compareSegment);
	const tpl: Template = { kind: "dashboard-template", v: 1, name: d.name, tiles, defaults: { ...d.defaults, segment, compareSegment }, viewer: d.viewer };
	if (!segment) delete tpl.defaults.segment;
	if (!compareSegment) delete tpl.defaults.compareSegment;
	// A deleted compare segment leaves no comparison, so the template stays valid.
	if (tpl.defaults.compare === "segment" && !compareSegment) tpl.defaults.compare = "none";
	if (!opts.withDependencies) return tpl;

	const want = (kind: DepKind, names: Iterable<string | undefined>) => {
		const set = new Set([...names].filter((n): n is string => !!n));
		return deps[kind].filter((i) => set.has(i.data.name as string)).map((i) => strip(i.data));
	};
	const segments = want("segments", [segment, compareSegment]);
	const goals = want("goals", [
		...goalNames(d.defaults.filters),
		...tiles.flatMap((t) => [t.params?.goal, ...goalNames(t.filters)]),
		...segments.flatMap((s) => goalNames((s as { filters?: Filter[] }).filters)),
	]);
	const funnels = want("funnels", tiles.map((t) => t.params?.funnel));
	tpl.dependencies = { ...(segments.length ? { segments } : {}), ...(goals.length ? { goals } : {}), ...(funnels.length ? { funnels } : {}) };
	return tpl;
}

/** Structural validation of a template or a built-in name (a structural error rejects the whole template, naming the tiles). */
export function readTemplate(input: { template?: unknown; builtin?: string }): Template {
	const raw = input.builtin !== undefined ? BUILTIN_TEMPLATES[input.builtin] : input.template;
	// A schedule is never portable: an incoming `email` is dropped, not an error.
	const clean = raw && typeof raw === "object" ? withoutEmail(raw as { email?: unknown; emailNext?: unknown }) : raw;
	return parseStrict(TemplateSchema, clean, "invalid_template");
}

export interface Resolved {
	dashboard: Omit<DashboardInputT, "id">;
	dependencies: Array<{ kind: DepKind; id: string; name: string }>;
	unresolved: Unresolved[];
}

/**
 * Names to the target site's ids. An existing record of that name is reused and never overwritten; a missing one is
 * created through `create` only with `createDependencies` and a definition in the template; otherwise the reference is
 * dropped (a tile that cannot run without it is dropped) and listed.
 */
export async function fromTemplate(
	tpl: Template,
	lookups: Lookups,
	opts: { createDependencies: boolean; create?: (kind: DepKind, data: Record<string, unknown>) => Promise<string> },
): Promise<Resolved> {
	const dependencies: Resolved["dependencies"] = [];
	const unresolved: Unresolved[] = [];
	const ids = new Map<string, string | null>();
	const resolve = async (kind: DepKind, name: string, tile: string): Promise<string | null> => {
		const key = `${kind}\u0000${name}`;
		if (!ids.has(key)) {
			let id = lookups[kind].find((i) => i.data.name === name)?.id ?? null;
			const def = tpl.dependencies?.[kind]?.find((x) => x.name === name);
			if (!id && def && opts.createDependencies && opts.create) {
				id = await opts.create(kind, def as Record<string, unknown>);
				dependencies.push({ kind, id, name });
			}
			ids.set(key, id);
		}
		const id = ids.get(key) ?? null;
		if (!id) unresolved.push({ kind, name, tile });
		return id;
	};
	const filters = async (list: readonly Filter[] | undefined, tile: string): Promise<Filter[]> => {
		const out: Filter[] = [];
		for (const f of list ?? []) {
			if (f.dim !== "goal") {
				out.push(f);
				continue;
			}
			const values: string[] = [];
			for (const v of f.values) if (await resolve("goals", v, tile)) values.push(v);
			if (values.length) out.push({ ...f, values });
		}
		return out;
	};

	// Goals first: segments and tiles refer to them by name.
	for (const g of tpl.dependencies?.goals ?? []) if (opts.createDependencies) await resolve("goals", g.name, "defaults");
	unresolved.length = 0;

	const defaults: Resolved["dashboard"]["defaults"] = { ...tpl.defaults, filters: await filters(tpl.defaults.filters, "defaults") };
	delete defaults.segment;
	if (tpl.defaults.segment) {
		const id = await resolve("segments", tpl.defaults.segment, "defaults");
		if (id) defaults.segment = id;
	}
	delete defaults.compareSegment;
	if (tpl.defaults.compareSegment) {
		const id = await resolve("segments", tpl.defaults.compareSegment, "defaults");
		if (id) defaults.compareSegment = id;
	}
	if (defaults.compare === "segment" && !defaults.compareSegment) defaults.compare = "none";
	const tiles: Tile[] = [];
	for (const t of tpl.tiles) {
		const tile: Tile = { ...t, ...(t.filters ? { filters: await filters(t.filters, t.id) } : {}) };
		if (t.params) {
			const { goal, funnel, ...p } = t.params;
			const g = goal ? await resolve("goals", goal, t.id) : null;
			const f = funnel ? await resolve("funnels", funnel, t.id) : null;
			// Without its goal or funnel the tile cannot run: it is left out.
			if ((goal && !g && t.kind === "kpi") || (funnel && !f)) continue;
			tile.params = { ...p, ...(g ? { goal: g } : {}), ...(f ? { funnel: f } : {}) };
		}
		tiles.push(tile);
	}
	return { dashboard: { name: tpl.name, tiles, defaults, viewer: tpl.viewer }, dependencies, unresolved };
}
