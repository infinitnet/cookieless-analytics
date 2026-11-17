/**
 * Export and import of the analytics tables through the agent API, for the `ca-data` CLI (`scripts/ca-data.mjs`):
 * `data/dump` (scope `data:export`) answers one chunk of a table as NDJSON, `data/load` (scope `data:import`) inserts
 * one chunk with the idempotent insert of the data move. Both run on the chunk functions of `src/move/chunks.ts`.
 * A chunk is 50 rows on the `small` profile and 500 otherwise, and an answer stays under 1.2 MB; the CLI asks for
 * fewer rows after an answer cut by bytes and halves its chunk after a server error.
 * On `small` with D1 a load counts its rows against the copy day of the data move (`src/move/day-budget.ts`) and
 * answers 429 with `Retry-After` to 00:00 UTC when the day is used up.
 */
import { PluginRouteError } from "emdash";
import type { z } from "zod";
import type { AgentEnv, Handlers } from "../agent/routes.js";
import { DataDumpBody, DataLoadBody } from "../agent/schemas.js";
import { MAX_DOC_BYTES } from "../core/apply.js";
import type { KvLike } from "../core/crypto.js";
import { ensureSchemaOnce, SCHEMA_VERSION } from "../db/schema.js";
import type { Db } from "../db/adapter.js";
import type { DbFor } from "../db/facts.js";
import { type ColumnKind, TABLE_SPECS, type TableName } from "../db/tables.js";
import { readChunk, writeChunk, type MoveRow } from "../move/chunks.js";
import { chargeCopyRows, copyRowsLeft, nextUtcMidnight } from "../move/day-budget.js";
import { isMoving, KV_MOVE_JOB, type MoveJob, WRITE_ROWS } from "../move/job.js";
import { SITE_ID_RE } from "../multisite/registry.js";
import { isActive as deleteActive, KV_DELETE_JOB, type DeleteJob } from "../query/filtered-delete.js";
import { clearReportCache } from "../query/reports/index.js";
import { dailyRowsApply } from "../query/storage.js";
import type { CapacityProfile } from "../settings.js";

/** Upper bound of one dump answer and of one load body the CLI sends. */
export const MAX_CHUNK_BYTES = 1_200_000;
/** Rows per dump when the call names no `limit`. */
export const DATA_ROWS: Readonly<Record<CapacityProfile, number>> = { small: 50, standard: 500, dedicated: 500 };
/** Routing of sites to databases; absent: one database, the host KV unprefixed. */
export type DataFileEnv = Pick<AgentEnv, "db" | "settings"> & { route?: Pick<DbFor, "kv" | "binding"> };

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
	const r = schema.safeParse(input ?? {});
	if (!r.success) throw new PluginRouteError("invalid_input", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ").slice(0, 500), 400);
	return r.data;
}

async function count(db: Db, table: TableName, site: string | undefined): Promise<number> {
	const [r] = await db.all<{ n: unknown }>(`SELECT COUNT(*) AS n FROM ${table}${site === undefined ? "" : " WHERE site = ?"}`, site === undefined ? [] : [site]);
	return Number(r?.n ?? 0);
}

const INT = /^-?\d{1,19}$/;
const NUM = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
/** What a value of `kind` must be, or null when `v` is one (null is checked by the caller). */
function wrongKind(kind: ColumnKind, v: unknown): string | null {
	switch (kind) {
		case "int":
			return (typeof v === "number" && Number.isSafeInteger(v)) || (typeof v === "string" && INT.test(v)) ? null : "an integer";
		case "real":
			return (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && NUM.test(v)) ? null : "a number";
		case "doc":
			// JSON text, as data/dump writes it; its text form may be longer than the stored document.
			if (typeof v !== "string" || v.length > 2 * MAX_DOC_BYTES) return `JSON text of at most ${2 * MAX_DOC_BYTES} characters`;
			try {
				JSON.parse(v);
				return null;
			} catch {
				return `JSON text of at most ${2 * MAX_DOC_BYTES} characters`;
			}
		default:
			return typeof v === "string" && v.length <= MAX_DOC_BYTES ? null : `text of at most ${MAX_DOC_BYTES} characters`;
	}
}

/** A 400 naming the first column of `row` that `table` cannot store: unknown, a missing key, a wrong kind. */
function checkRow(table: TableName, row: MoveRow, i: number): void {
	const { columns, key } = TABLE_SPECS[table];
	const bad = (m: string) => new PluginRouteError("invalid_row", `Row ${i}: ${m}`, 400);
	for (const k of Object.keys(row)) if (!columns.some((c) => c.name === k)) throw bad(`${table} has no column ${k.slice(0, 64)}.`);
	if (key.some((k) => row[k] === undefined || row[k] === null)) throw bad(`lacks a key column of ${table}.`);
	if (!SITE_ID_RE.test(row.site as string)) throw bad("site must be 1 to 32 of a-z, 0-9 and -.");
	for (const c of columns) {
		const v = row[c.name];
		const want = v === undefined || v === null ? null : wrongKind(c.kind, v);
		if (want) throw bad(`${c.name} must be ${want}.`);
	}
}

/** A 400 unless `cursor` is a key of `table`: its length and its integer columns. */
function checkCursor(table: TableName, cursor: readonly (string | number)[]): void {
	const { columns, key } = TABLE_SPECS[table];
	const kinds = new Map(columns.map((c) => [c.name, c.kind]));
	if (cursor.length !== key.length || key.some((k, i) => (kinds.get(k) === "int" ? wrongKind("int", cursor[i]) : typeof cursor[i] !== "string")))
		throw new PluginRouteError("invalid_input", `cursor: ${table} needs a cursor of ${key.length} values (${key.join(", ")}), as x-next-cursor sent it.`, 400);
}

export function dataFileHandlers(env: DataFileEnv): Handlers {
	const kvOf = (kv: KvLike, site: string) => env.route?.kv(kv, site) ?? kv;
	const bindingOf = (site: string) => env.route?.binding(site) ?? null;
	return {
		"agent/v1/data/dump": {
			async POST({ ctx, keySites, site }) {
				const b = parse(DataDumpBody, ctx.input);
				if (b.cursor) checkCursor(b.table, b.cursor);
				// A key restricted to sites never reads past the one site it asked for.
				const only = b.site !== undefined || keySites.length ? site : undefined;
				const db = await env.db(site);
				const limit = b.limit ?? DATA_ROWS[(await env.settings()).capacityProfile];
				const chunk = await readChunk(db, b.table, b.cursor ?? null, limit, only, MAX_CHUNK_BYTES);
				const headers: Record<string, string> = { "content-type": "application/x-ndjson; charset=utf-8", "x-layout": String(SCHEMA_VERSION), "x-engine": db.dialect };
				// Key values can be any text (Search queries): the header carries them URI encoded.
				if (chunk.next) headers["x-next-cursor"] = encodeURIComponent(JSON.stringify(chunk.next));
				if (!b.cursor) headers["x-total"] = String(await count(db, b.table, only));
				return { data: null, text: { value: chunk.rows.map((r) => `${JSON.stringify(r)}\n`).join(""), headers } };
			},
		},
		"agent/v1/data/load": {
			async POST({ ctx, keySites, site, now }) {
				const b = parse(DataLoadBody, ctx.input);
				if (b.layout !== SCHEMA_VERSION)
					throw new PluginRouteError("layout_mismatch", `The export has table layout ${b.layout}; this site uses layout ${SCHEMA_VERSION}. Import it into a plugin version with the same layout.`, 400);
				// An empty call is the CLI's check: the layout and the one table's row count, nothing more.
				if (!b.rows.length) {
					const db = await env.db(site);
					await ensureSchemaOnce(db, ctx.kv);
					return { data: { layout: SCHEMA_VERSION, table: b.table, total: await count(db, b.table, b.site !== undefined || keySites.length ? site : undefined) } };
				}
				const bySite = new Map<string, MoveRow[]>();
				for (const [i, row] of b.rows.entries()) {
					checkRow(b.table, row, i);
					const s = row.site as string;
					if ((b.site !== undefined && s !== b.site) || (keySites.length && !keySites.includes(s))) throw new PluginRouteError("site_not_allowed", `Row ${i} is of a site this call may not write.`, 400);
					const list = bySite.get(s) ?? [];
					list.push(row);
					bySite.set(s, list);
				}
				if (deleteActive(await ctx.kv.get<DeleteJob>(KV_DELETE_JOB))) throw new PluginRouteError("delete_running", "A delete is running on the Data page. Import when it has finished.", 409);
				const move = await ctx.kv.get<MoveJob>(KV_MOVE_JOB);
				if (isMoving(move) && [...bySite.keys()].some((s) => bindingOf(s) === move.dest))
					throw new PluginRouteError("move_running", "A data move into this database is running or paused. Import when it is done or cancelled.", 409);
				const profile = (await env.settings()).capacityProfile;
				const per = WRITE_ROWS[b.table] ?? 1;
				let inserted = 0;
				// Each site's rows go to the database that site writes to. Counters are not added: plain DO NOTHING.
				for (const [s, rows] of bySite) {
					const db = await env.db(s);
					const kv = dailyRowsApply(profile, db) ? kvOf(ctx.kv, s) : null;
					if (kv && rows.length * per > (await copyRowsLeft(kv, now))) {
						const wait = nextUtcMidnight(now) - now;
						const body = { ok: false, error: "daily_limit", message: `The rows this database may take today on the Small profile are used up. Continue after 00:00 UTC (in ${wait} s).` };
						if (inserted) clearReportCache();
						return { data: null, text: { status: 429, value: JSON.stringify(body), headers: { "content-type": "application/json; charset=utf-8", "retry-after": String(wait) } } };
					}
					await ensureSchemaOnce(db, ctx.kv);
					const n = await writeChunk(db, b.table, rows);
					if (kv && n) await chargeCopyRows(kv, now, n * per);
					inserted += n;
				}
				if (inserted) clearReportCache();
				return { data: { table: b.table, inserted } };
			},
		},
	};
}
