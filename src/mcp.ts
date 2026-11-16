/**
 * MCP tools: the host serves them at `/_emdash/api/mcp` as `cookieless-analytics__<name>`. Each names a
 * private JSON POST route of this plugin with a declared permission; the host checks the caller's role against
 * it and, for tokens, the scope `mcp:tools:cookieless-analytics` or `mcp:tools`. Nothing that ingests, deletes,
 * or touches keys, shares or settings is exposed.
 */
import { CatalogBody, DataQueryBody } from "./routes/data.js";
import { ScopeShape } from "./annotations/scope.js";
import { AnnotationItem, saveBody } from "./routes/config.js";
import { SummaryFields } from "./routes/sites.js";

/**
 * `config/annotations/save` input without the scope transform: the host serializes every tool input with
 * `z.toJSONSchema` (consent string, `tools/list`), which throws on a transform. The route checks the full schema.
 */
const AnnotateInput = saveBody("annotations").extend({ data: AnnotationItem.extend({ scope: ScopeShape.optional() }) });

export const MCP_TOOLS = {
	analytics_query: {
		description:
			"Run one analytics report (traffic, search, revenue, funnels, journeys and more) for a site and date range. Call analytics_catalog first for the report names, dimensions, filter operators, params and metric definitions. `query.site` picks a site; absent means this site.",
		route: "data/query",
		input: DataQueryBody,
	},
	analytics_catalog: {
		description: "The catalog of reports, dimensions, filter operators, params, metric definitions and limits that analytics_query accepts. Takes no input.",
		route: "data/catalog",
		input: CatalogBody,
	},
	analytics_sites_summary: {
		description:
			"One row per site with sessions, pageviews, visitors, bounce rate, engaged rate and revenue per currency for a date range, from the daily rollup, with an optional previous-period or year-over-year comparison. Visitors are not summed across sites.",
		route: "sites/summary",
		input: SummaryFields,
	},
	analytics_annotate: {
		description: "Add (or, with `id`, replace) an annotation: a dated note shown on every chart, optionally scoped to paths, hosts or search queries. `site` picks a client site; absent means this site.",
		route: "config/annotations/save",
		input: AnnotateInput,
		destructive: false,
	},
} as const;
