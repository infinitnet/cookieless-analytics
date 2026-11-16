/** Templates: export, import with dependency resolution, the built-in gallery. */
import { describe, expect, it } from "vitest";
import { DashboardError, TemplateSchema } from "../src/dashboards/schema.js";
import { getDashboard, saveDashboard } from "../src/dashboards/store.js";
import { BUILTIN_GROUPS, BUILTIN_NAMES, BUILTIN_TEMPLATES, type DepKind, fromTemplate, type Item, type Lookups, readTemplate, toTemplate } from "../src/dashboards/templates.js";
import { FORBIDDEN_PUBLIC_WORDS } from "../src/contract.js";
import { memColl } from "./agent.helpers.js";
import { kpi } from "./fixtures/dashboards.js";

const goal = (name: string, value: string) => ({ name, type: "page", match: "is", value });
const empty = (): Lookups => ({ segments: [], goals: [], funnels: [] });

function creator(target: Lookups) {
	let n = 0;
	return async (kind: DepKind, data: Record<string, unknown>) => {
		const id = `${kind}-${++n}`;
		(target[kind] as Item[]).push({ id, data });
		return id;
	};
}

describe("built-in gallery", () => {
	it("has fourteen templates in two groups that validate and import into an empty site", async () => {
		expect(BUILTIN_NAMES).toEqual(["overview", "content", "acquisition", "behaviour", "satisfaction", "revenue", "weekly-digest", "search", "impact-last-changes", "seo-overview", "cannibalization", "position-bands", "winners-losers", "links"]);
		expect(BUILTIN_NAMES.filter((n) => BUILTIN_GROUPS[n] === "Analytics")).toHaveLength(10);
		expect(BUILTIN_NAMES.filter((n) => BUILTIN_GROUPS[n] === "SEO")).toEqual(["seo-overview", "cannibalization", "position-bands", "winners-losers"]);
		const coll = memColl();
		for (const name of BUILTIN_NAMES) {
			expect(TemplateSchema.safeParse(BUILTIN_TEMPLATES[name]).success, name).toBe(true);
			const tpl = readTemplate({ builtin: name });
			// Only Links carries a dependency: its goal.
			if (name !== "links") expect(tpl.dependencies).toBeUndefined();
			const target = empty();
			const r = await fromTemplate(tpl, target, { createDependencies: true, create: creator(target) });
			expect(r.unresolved).toEqual([]);
			const d = await saveDashboard(coll, "fresh", r.dashboard, 1);
			expect(d.tiles).toHaveLength(tpl.tiles.length);
		}
		const text = JSON.stringify(BUILTIN_TEMPLATES).toLowerCase();
		for (const w of FORBIDDEN_PUBLIC_WORDS) expect(text, w).not.toContain(w);
		expect(text).not.toMatch(/[\u2013\u2014]/);
		// Revenue: no dependencies and no currency set, so it uses the target site's default.
		const rev = readTemplate({ builtin: "revenue" });
		expect(rev.tiles.map((t) => [t.report, t.kind, t.metric ?? t.metrics?.join(",") ?? t.params?.dim])).toEqual([
			["revenue", "kpi", "revenue"],
			["revenue", "kpi", "orders"],
			["revenue", "kpi", "aov"],
			["revenue", "kpi", "revenue_per_visitor"],
			["revenue_series", "area", "revenue"],
			["revenue_breakdown", "bars", "channel"],
			["revenue_breakdown", "table", "source"],
			["revenue_breakdown", "table", "entry"],
			["revenue_breakdown", "table", "goal"],
		]);
		expect(rev.tiles.some((t) => t.params?.currency)).toBe(false);
		// Weekly digest: KPIs visitors, sessions, pageviews, bounce rate; channels, top pages, top sources, countries.
		const digest = readTemplate({ builtin: "weekly-digest" });
		expect(BUILTIN_GROUPS["weekly-digest"]).toBe("Analytics");
		expect(digest.dependencies).toBeUndefined();
		expect(digest.defaults.compare).toBe("previous");
		expect(digest.tiles.map((t) => [t.report, t.kind, t.metric ?? null])).toEqual([
			["overview", "kpi", "visitors"],
			["overview", "kpi", "sessions"],
			["overview", "kpi", "pageviews"],
			["overview", "kpi", "bounce_rate"],
			["channels", "table", null],
			["pages", "table", null],
			["sources", "table", null],
			["countries", "table", null],
		]);
		expect((readTemplate({ builtin: "search" }).tiles.map((t) => t.report))).toEqual(expect.arrayContaining(["search_overview", "search_queries", "search_pages"]));
		// SEO templates stay inside the 93 day cap and never ask for compare.
		for (const n of BUILTIN_NAMES.filter((x) => BUILTIN_GROUPS[x] === "SEO")) {
			const t = readTemplate({ builtin: n });
			expect(t.viewer.ranges.filter((r) => r === "12m" || r === "ytd"), n).toEqual([]);
			expect(t.defaults.compare, n).toBe("none");
		}
		const impact = readTemplate({ builtin: "impact-last-changes" });
		expect(impact.tiles.every((t) => t.report === "impact" && t.params?.annotation === "latest" && t.params?.window === 28)).toBe(true);
		expect(impact.tiles.map((t) => [t.kind, t.metric ?? t.metrics?.join(",")])).toEqual([
			["kpi", "sessions"],
			["kpi", "sessions"],
			["kpi", "clicks"],
			["kpi", "position"],
			["kpi", "pct_long"],
			["kpi", "pct_bad"],
			["line", "sessions"],
		]);
		expect(impact.tiles[1]?.params?.key).toBe("Organic Search");
	});

	it("Links: link tables and bars, no revenue tile, and the Link clicks goal created once on import", async () => {
		const tpl = readTemplate({ builtin: "links" });
		expect(BUILTIN_GROUPS.links).toBe("Analytics");
		expect(tpl.tiles.map((t) => [t.report, t.kind, t.params?.by ?? t.params?.goal])).toEqual([
			["goals", "kpi", "Link clicks"],
			["goals", "kpi", "Link clicks"],
			["links", "bars", "channel"],
			["links", "table", "link"],
			["links", "table", "place"],
			["links", "bars", "page"],
		]);
		expect(tpl.dependencies).toEqual({ goals: [{ name: "Link clicks", type: "event", match: "is", value: "out" }] });
		const target = empty();
		const first = await fromTemplate(tpl, target, { createDependencies: true, create: creator(target) });
		expect(first.dependencies).toEqual([{ kind: "goals", id: "goals-1", name: "Link clicks" }]);
		expect(first.dashboard.tiles.filter((t) => t.params?.goal === "goals-1")).toHaveLength(2);
		// A second import reuses the goal by name.
		const again = await fromTemplate(tpl, target, { createDependencies: true, create: creator(target) });
		expect(again.dependencies).toEqual([]);
		expect(target.goals).toHaveLength(1);
		expect(again.dashboard.tiles).toHaveLength(6);
	});
});

describe("export and import", () => {
	const source: Lookups = {
		goals: [{ id: "g-a", data: { site: "a", ...goal("Signup", "/thanks") } }],
		segments: [{ id: "s-a", data: { site: "a", name: "Germany", filters: [{ dim: "country", op: "is", values: ["DE"] }] } }],
		funnels: [{ id: "f-a", data: { site: "a", name: "Checkout", steps: [{ type: "page", match: "is", value: "/" }, { type: "page", match: "is", value: "/buy" }], mode: "sequential" } }],
	};

	async function exported() {
		const coll = memColl();
		const d = await saveDashboard(
			coll,
			"a",
			{
				name: "Sales",
				tiles: [kpi("visitors", { filters: [{ dim: "goal", op: "is", values: ["Signup"] }] }), { id: "fun001", report: "funnels", kind: "table", w: 3, params: { funnel: "f-a" } }],
				defaults: { range: "30d", compare: "none", segment: "s-a", filters: [{ dim: "goal", op: "is", values: ["Signup"] }] },
				viewer: { ranges: ["30d"], compare: false },
			},
			1,
		);
		return toTemplate(d, source, { withDependencies: true });
	}

	it("writes names instead of ids and embeds the definitions without site", async () => {
		const tpl = await exported();
		expect(tpl.defaults.segment).toBe("Germany");
		expect(tpl.tiles[1]?.params).toEqual({ funnel: "Checkout" });
		expect(tpl.dependencies?.goals).toEqual([goal("Signup", "/thanks")]);
		expect(tpl.dependencies?.funnels?.[0]).toMatchObject({ name: "Checkout" });
		expect(JSON.stringify(tpl)).not.toMatch(/"site"|g-a|s-a|f-a/);
		const bare = toTemplate((await saveDashboard(memColl(), "a", { name: "x", tiles: [kpi("visitors")], defaults: { range: "30d", compare: "none", filters: [] }, viewer: { ranges: ["30d"], compare: false } }, 1)), source, { withDependencies: false });
		expect(bare.dependencies).toBeUndefined();
	});

	it("reuses an existing goal unchanged and creates the missing funnel and segment", async () => {
		const tpl = readTemplate({ template: JSON.parse(JSON.stringify(await exported())) });
		const target: Lookups = { goals: [{ id: "g-b", data: { site: "b", ...goal("Signup", "/other") } }], segments: [], funnels: [] };
		const r = await fromTemplate(tpl, target, { createDependencies: true, create: creator(target) });
		expect(r.unresolved).toEqual([]);
		expect(r.dependencies.map((d) => [d.kind, d.name])).toEqual([["segments", "Germany"], ["funnels", "Checkout"]]);
		expect(target.goals).toEqual([{ id: "g-b", data: { site: "b", ...goal("Signup", "/other") } }]);
		expect(r.dashboard.defaults.segment).toBe("segments-1");
		expect(r.dashboard.tiles[1]?.params).toEqual({ funnel: "funnels-2" });
		expect(r.dashboard.defaults.filters).toEqual([{ dim: "goal", op: "is", values: ["Signup"] }]);
		const d = await saveDashboard(memColl(), "b", r.dashboard, 2);
		expect(d.site).toBe("b");
	});

	it("lists missing references as unresolved without createDependencies", async () => {
		const tpl = await exported();
		const target: Lookups = { goals: [{ id: "g-b", data: { name: "Signup" } }], segments: [], funnels: [] };
		const r = await fromTemplate(tpl, target, { createDependencies: false, create: creator(target) });
		expect(r.unresolved).toEqual([
			{ kind: "segments", name: "Germany", tile: "defaults" },
			{ kind: "funnels", name: "Checkout", tile: "fun001" },
		]);
		expect(r.dependencies).toEqual([]);
		expect(r.dashboard.defaults.segment).toBeUndefined();
		expect(r.dashboard.tiles.map((t) => t.report)).toEqual(["overview"]);
		// A goal filter whose goal is missing loses that value.
		const none = await fromTemplate(tpl, empty(), { createDependencies: false });
		expect(none.dashboard.defaults.filters).toEqual([]);
		expect(none.unresolved).toContainEqual({ kind: "goals", name: "Signup", tile: "defaults" });
	});

	it("leaves out a tile whose funnel was deleted, so the exported template still imports", async () => {
		const gone: Lookups = { ...source, funnels: [] };
		const d = await saveDashboard(memColl(), "a", { name: "x", tiles: [kpi("visitors"), { id: "fun001", report: "funnels", kind: "table", w: 3, params: { funnel: "f-a" } }], defaults: { range: "30d", compare: "none", filters: [] }, viewer: { ranges: ["30d"], compare: false } }, 1);
		const tpl = readTemplate({ template: JSON.parse(JSON.stringify(toTemplate(d, gone, { withDependencies: true }))) });
		expect(tpl.tiles.map((t) => t.id)).toEqual([d.tiles[0]?.id]);
	});

	it("applies the 16 KB limit to records, not to templates with dependencies", () => {
		const big = Array.from({ length: 40 }, (_, i) => ({ name: `Goal ${i}`, type: "page", match: "is", value: `/${"x".repeat(500)}` }));
		expect(() => readTemplate({ template: { ...(BUILTIN_TEMPLATES.overview as object), dependencies: { goals: big } } })).not.toThrow();
	});

	it("rejects the whole template on an unknown report and names the tile", () => {
		const bad = { ...(BUILTIN_TEMPLATES.overview as object), tiles: [{ id: "bad001", report: "users", kind: "table", w: 1 }, kpi("visitors")] };
		let err: unknown;
		try {
			readTemplate({ template: bad });
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(DashboardError);
		expect(err).toMatchObject({ code: "invalid_template", tiles: ["bad001"] });
		expect(() => readTemplate({ template: { ...(BUILTIN_TEMPLATES.overview as object), v: 2 } })).toThrow(expect.objectContaining({ code: "unknown_version" }));
	});
});
