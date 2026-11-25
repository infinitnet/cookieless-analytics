/**
 * Search backfill: `kv search:backfill:<site>:<source>` holds `{ from, to, cursor, done, error }`.
 * The sync tick advances it in adaptive windows of days inside the shared request budget; the cursor moves
 * only after a window is stored, so a crash resumes from it. Cancel deletes the record.
 */
import { PluginRouteError } from "emdash";
import type { KvLike } from "../core/crypto.js";
import { addDays, daysBetween } from "../core/time.js";
import { PROVIDER_DAYS } from "./budget.js";
import { type BackfillState, backfillKey } from "./sync.js";
import type { SourceId } from "./types.js";

export interface BackfillProgress {
	from: string;
	to: string;
	cursor: string;
	done: boolean;
	error: string | null;
	days: number;
	completed: number;
	/** Rows stored so far. */
	rows: number;
	/** Days per pull of the next window. */
	window: number | null;
	/** Minutes left at the pace so far (elapsed time per completed day), or null before the first window. */
	etaMinutes: number | null;
	/** The next batch runs at about this time (ms), or null. */
	nextAt: number | null;
}

export function progress(b: BackfillState | null, now = Date.now()): BackfillProgress | null {
	if (!b) return null;
	const days = daysBetween(b.from, b.to);
	const completed = b.done ? days : Math.max(0, Math.min(days, daysBetween(b.from, b.cursor) - 1));
	const etaMinutes = b.done ? 0 : b.started && completed > 0 ? Math.ceil(((now - b.started) / completed) * (days - completed) / 60_000) : null;
	return { from: b.from, to: b.to, cursor: b.cursor, done: b.done, error: b.error ?? null, days, completed, rows: b.rows ?? 0, window: b.window ?? null, etaMinutes, nextAt: b.done ? null : (b.nextAt ?? null) };
}

export async function startBackfill(kv: KvLike, site: string, source: SourceId, from: string, to: string, today: string, now = Date.now()): Promise<BackfillProgress> {
	if (from > to) throw new PluginRouteError("invalid_range", "from must not be after to.", 400);
	if (to >= today) throw new PluginRouteError("invalid_range", "A backfill ends yesterday at the latest.", 400);
	if (from < addDays(today, -PROVIDER_DAYS[source])) throw new PluginRouteError("invalid_range", `A ${source} backfill reaches back at most ${PROVIDER_DAYS[source]} days.`, 400);
	const b: BackfillState = { from, to, cursor: from, done: false, error: null, started: now };
	await kv.set(backfillKey(site, source), b);
	return progress(b, now) as BackfillProgress;
}

export async function cancelBackfill(kv: KvLike, site: string, source: SourceId): Promise<{ canceled: boolean }> {
	return { canceled: await kv.delete(backfillKey(site, source)) };
}

export async function backfillStatus(kv: KvLike, site: string, source: SourceId, now = Date.now()): Promise<BackfillProgress | null> {
	return progress(await kv.get<BackfillState>(backfillKey(site, source)), now);
}
