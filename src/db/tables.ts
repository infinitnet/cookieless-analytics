import type { TABLES } from "./schema.js";

export type TableName = (typeof TABLES)[number];
/** How a column travels between engines: `doc` is JSONB on both (a blob on SQLite), moved as JSON text. */
export type ColumnKind = "text" | "int" | "real" | "doc";
export interface Column {
	name: string;
	kind: ColumnKind;
}
export interface TableSpec {
	columns: readonly Column[];
	/** Primary key columns in key order. */
	key: readonly string[];
}

const KIND: Record<string, ColumnKind> = { "": "text", i: "int", r: "real", d: "doc" };

/** `"a b:i c:r"`: column names in table order, `:i` integer, `:r` real, `:d` document, none text. */
function spec(columns: string, key: string): TableSpec {
	return {
		columns: columns.split(/\s+/).map((c) => {
			const [name = "", k = ""] = c.split(":");
			return { name, kind: KIND[k] ?? "text" };
		}),
		key: key.split(" "),
	};
}

/** Columns and primary keys of the analytics tables, in the order of `schema.ts`. A test holds them to the live schema of both engines. */
export const TABLE_SPECS: Readonly<Record<TableName, TableSpec>> = {
	ca_sessions: spec(
		`site day sid vkey hour:i started:i last_seen:i window_s:i entry_path exit_path pageviews:i events:i engaged_ms:i
		visible_ms:i reentries:i max_scroll:i interacted:i ref_host ref_path channel source utm_source utm_medium utm_campaign
		utm_term utm_content country region device browser browser_major os lang screen host hits:d`,
		"site day sid",
	),
	ca_events: spec("site id day:i ts:i sday sid name path props val:r cur", "site id"),
	ca_srv: spec("site day:i status:i path ref n:i last_ts:i", "site day status path ref"),
	ca_drops: spec("site day:i reason n:i", "site day reason"),
	ca_cube: spec("site day:i channel country device sessions:i pageviews:i visitors:i bounces:i engaged:i duration_ms:i events:i", "site day channel country device"),
	ca_rollup: spec("site day dim key seg segkey pageviews:i sessions:i visitors:i bounces:i engaged:i engaged_ms:i events:i hits:i", "site dim seg day key segkey"),
	ca_aliases: spec("site sid canon expires:i", "site sid"),
	ca_search_daily: spec("site source day page_key query country device clicks:i impressions:i pos_sum:r provisional:i", "site source day page_key query country device"),
	ca_revenue_daily: spec("site day dim key cur seg segkey orders:i revenue:r sessions:i", "site dim seg day key segkey cur"),
};
