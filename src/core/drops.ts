/**
 * Counters of events that were not recorded (`ca_drops`, one row per site, day and reason). Every refusal and
 * every dropped event is counted here, bots included, without any request detail: no user agent, no IP, no
 * row per request. Counts are kept per isolate and written by one statement per flush, never on the hot path:
 * the request that finds counters older than `FLUSH_MS` flushes them in its own `after()`; a request that
 * leaves younger counters behind waits out the rest of the window in its own `after()`, unless another
 * request already does; the cron tick flushes whatever its isolate holds.
 *
 * Never above the truth: a flush first takes the counters out of the isolate (a synchronous swap), so two
 * flushes never write the same count; the statement adds (`n = n + excluded.n`); a failed flush puts its
 * counts back for the next one. Below the truth: counts of an isolate that dies before its flush are lost
 * (at most `FLUSH_MS` of drops of that isolate), so the receipt shows a lower bound.
 */
import type { Db } from "../db/adapter.js";
import type { DbFor } from "../db/facts.js";
import { dayInt, type Frag, field, paramRows, upsertChanged } from "../db/dialect.js";
import type { DropReason } from "./recorder.js";

/** Age of the oldest count at which a request flushes. */
export const FLUSH_MS = 10_000;

/** Why an event was not recorded: the recorder's reasons plus the ones decided before it. */
export type DropKind =
	| DropReason
	/** A known robot posted to the collect path (answered before parsing; nothing of it is kept). */
	| "bot"
	/** The daily write allowance of the `small` profile is used up; answered 503 without `Retry-After`. */
	| "budget_blocked"
	/** A post with `X-EC-Proxy-Key` whose secret is not the one of the event's site (missing `k`, no secret set, malformed or wrong). */
	| "proxy_auth"
	/** A proxy post above `proxyRateLimitPerMinute` for its site; answered 503 with `Retry-After` (the page script sends page views and events again while the page is open, never engagement updates). */
	| "proxy_rate"
	/**
	 * Arrived after the summary of a day it could change was stored: a queued event applied after the day before its
	 * own day closed (not written), or an agent event whose visit is on a closed day (its row is kept, the visit is not edited).
	 */
	| "late_after_close";

export type DropRow = {
	site: string;
	/** yyyymmdd in the site time zone. */
	day: number;
	reason: DropKind;
	n: number;
};

/** The flush statement: all counters in one JSON parameter, one row written per site, day and reason. */
export function dropsFlushSql(d: Db["dialect"], rows: readonly DropRow[]): Frag {
	const x = paramRows(d, rows, "x");
	const f = (name: string, as?: "int") => field(d, "x", name, as);
	// `WHERE 1 = 1` keeps SQLite from reading `ON CONFLICT` as a join constraint of `INSERT ... SELECT`.
	return {
		sql: `INSERT INTO ca_drops (site, day, reason, n) SELECT ${f("site")}, ${f("day", "int")}, ${f("reason")}, ${f("n", "int")} FROM ${x.sql} WHERE 1 = 1 ${upsertChanged(d, "ca_drops", ["site", "day", "reason"], [], ["n"])}`,
		params: x.params,
	};
}

const SEP = "\u0000";

/** The counters of one isolate. */
export class DropCounters {
	private pending = new Map<string, number>();
	/** Epoch ms of the oldest pending count. */
	private oldest = 0;
	/** A request's `after()` is already waiting out the window. */
	private armed = false;
	/** With site routing (`databases` option): each site's counts go to its own database, not to the `db` of the flush. */
	route: DbFor | undefined;

	constructor(
		public windowMs = FLUSH_MS,
		private clock = () => Date.now(),
		private sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
	) {}

	/** Count one drop (or `n`); `day` is the ISO day in the site time zone. Synchronous: no I/O. */
	add(site: string, day: string, reason: DropKind, n = 1): void {
		if (!this.pending.size) this.oldest = this.clock();
		const k = [site, day, reason].join(SEP);
		this.pending.set(k, (this.pending.get(k) ?? 0) + n);
	}

	/** Counts not written yet. */
	get size(): number {
		return this.pending.size;
	}

	rows(): DropRow[] {
		return [...this.pending].map(([k, n]) => {
			const [site, day, reason] = k.split(SEP) as [string, string, DropKind];
			return { site, day: dayInt(day), reason, n };
		});
	}

	/**
	 * Write the counters in one statement (one per database with site routing). On failure the counts of the failed
	 * database are kept for the next flush and the error is thrown.
	 */
	async flush(db: Db): Promise<number> {
		if (!this.pending.size) return 0;
		const batch = this.pending;
		this.pending = new Map();
		const groups = new Map<string, Array<[string, number]>>();
		for (const e of batch) {
			const g = (this.route?.binding(e[0].split(SEP)[0]) ?? "");
			groups.get(g)?.push(e) ?? groups.set(g, [e]);
		}
		let written = 0;
		let failed: unknown;
		for (const entries of groups.values()) {
			try {
				const rows = entries.map(([k, n]) => {
					const [s, day, reason] = k.split(SEP) as [string, string, DropKind];
					return { site: s, day: dayInt(day), reason, n };
				});
				const target = this.route ? await this.route(rows[0]?.site) : db;
				const f = dropsFlushSql(target.dialect, rows);
				await target.run(f.sql, f.params);
				written += rows.length;
			} catch (err) {
				failed ??= err;
				for (const [k, n] of entries) this.pending.set(k, (this.pending.get(k) ?? 0) + n);
			}
		}
		if (failed) {
			// The window starts again, so a failing database does not get one more flush per request.
			this.oldest = this.clock();
			throw failed;
		}
		return written;
	}

	/**
	 * Run inside the calling request's own `after()`: flush when the oldest count is due, otherwise wait out the
	 * window unless another request already does. Never throws (a failed flush keeps its counts).
	 */
	async settle(db: Db): Promise<void> {
		if (!this.pending.size) return;
		const wait = this.oldest + this.windowMs - this.clock();
		if (wait > 0) {
			if (this.armed) return;
			this.armed = true;
			try {
				await this.sleep(wait);
			} finally {
				this.armed = false;
			}
		}
		await this.flush(db).catch(() => {});
	}

	/** Test helper: forget every count. */
	clear(): void {
		this.pending.clear();
		this.armed = false;
	}
}

/** The counters of this isolate. */
export const drops = new DropCounters();
