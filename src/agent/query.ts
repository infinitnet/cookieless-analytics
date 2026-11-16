/** `agent/v1/query`: the admin report dispatcher with agent bounds. */
import type { z } from "zod";
import type { Scope } from "../keys/scopes.js";
import { REPORTS } from "../query/reports/index.js";
import { AGENT_MAX_RANGE_DAYS, type AgentQueryBody } from "./schemas.js";

type AgentQuery = z.output<typeof AgentQueryBody>;

/** Scopes a query needs: search reports need `read:search`, traffic reports `read:analytics`, `pages` with search columns both. */
export function requiredScopes(body: Pick<AgentQuery, "report" | "params">): Scope[] {
	// `impact` reads its target report: a search target needs read:search too.
	if (body.report === "impact") return body.params?.report?.startsWith("search_") ? ["read:analytics", "read:search"] : ["read:analytics"];
	if (REPORTS[body.report][0] === "search" || (body.report === "dimension_values" && body.params?.scope === "search")) return ["read:search"];
	if ((body.report === "pages" || body.report === "annotation_impacts") && body.params?.withSearch) return ["read:analytics", "read:search"];
	return ["read:analytics"];
}

/** Typed rejection of a query the agent API does not serve, or null. */
export function agentBounds(body: AgentQuery): { error: string; message: string } | null {
	if (body && !((Date.parse(body.query.to) - Date.parse(body.query.from)) / 86_400_000 < AGENT_MAX_RANGE_DAYS))
		return { error: "range_too_long", message: `The range is longer than ${AGENT_MAX_RANGE_DAYS} days.` };
	return null;
}
