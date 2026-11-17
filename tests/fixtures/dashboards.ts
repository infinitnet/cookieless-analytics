/** Dashboard inputs for tests. */
import type { Tile } from "../../src/dashboards/schema.js";

let n = 0;
export const tileId = () => `t${String(++n).padStart(5, "0")}`;

export const kpi = (metric: string, over: Partial<Tile> = {}): Tile => ({ id: tileId(), report: "overview", kind: "kpi", metric, w: 1, ...over });

export function dashInput(over: Record<string, unknown> = {}) {
	return {
		name: "Weekly",
		tiles: [kpi("visitors"), { id: tileId(), report: "channels", kind: "bars", w: 2 }],
		defaults: { range: "30d", compare: "none", filters: [] },
		viewer: { ranges: ["7d", "30d"], compare: true },
		...over,
	};
}

/** A stored dashboard record of `site` with a fixed id (for agent and route tests). */
export function storedDash(id: string, site: string, tiles: Tile[], name = "Stored") {
	return { id, site, v: 1, name, tiles, defaults: { range: "7d", compare: "none", filters: [] }, viewer: { ranges: ["7d"], compare: false }, created: 1, updated: 1 };
}
