/**
 * Apply ingest events to the visit document (`ca_sessions.hits`) and the thin row tables. Every statement is
 * built with the helpers of `src/db/dialect.ts`: `jsonb_*` writers only, integers through `CAST(? AS INTEGER)`.
 *
 * Statements per event (rows written on D1, measured; see `tests/apply.test.ts`):
 * - S1 page view on a known visit: one `UPDATE ... RETURNING`, 1 row.
 * - S2 engagement update: one `UPDATE`, 1 row; 0 rows changed is the counted drop `orphan_update`.
 * - S3 event on a known visit: one `UPDATE ... RETURNING`, 1 row; with revenue first one
 *   `INSERT INTO ca_events ... ON CONFLICT DO NOTHING`, 2 rows, 0 for a duplicate order.
 * - S4 slow path (fresh, unknown or expired sid): one read of the visits the event may belong to, then
 *   `resolveSession` over that result, then one write: S1 or S3 on the chosen visit, or a new visit with its
 *   first entry inside (2 rows: the table and the vkey index). S5 when a second tab joins a visit.
 * - S5 alias upsert, 1 row, 0 when the stored alias still holds. S6 error page counter, 1 row.
 *
 * Replays. S1 and S3 only change a visit whose document has no entry under the key yet
 * (`(hits ->> '$."<key>".t') IS NULL`), so a replayed page view or event changes 0 rows and costs 0 rows
 * written (without the guard D1 bills 1). The fast statement then returns nothing, as for an unknown visit;
 * the slow path tells the two apart with the read it runs anyway: the read returns `seen` when a candidate
 * visit already holds the key, and the event ends there as applied, with no write. Page views are keyed by
 * the client hit id, events by `e` plus the client event id (a random one only when the client sent none), orders
 * by their order hash, so a replay of any of them meets the guard.
 */
import type { Db, Dialect } from "../db/adapter.js";
import { dayInt, docGet, docJson, docObject, docSet, type Frag, join, q, raw, upsertClause, visitDayKey } from "../db/dialect.js";
import type { Param } from "../db/sql.js";
import { budgetState, CHECK_FAST_S, CHECK_SLOW_S, dailyRowsApply, FAST_FROM } from "../query/storage.js";
import type { CapacityProfile } from "../settings.js";
import type { KvLike } from "./crypto.js";
import type { RecordOutcome } from "./recorder.js";
import { MAX_VISIT_MINUTES, RequestStore, type ResolveConfig, type ResolveEvent, type ResolveMeta, resolveSession, type SessionRow } from "./session.js";
import { addDays, dayInZone } from "./time.js";

/** An engagement update may open an entry (its page view not seen yet) only while the document is below this size. */
/** A visit this young may get an engagement update before its page view's entry (that page view still in flight). */
export const YOUNG_VISIT_S = 30;
export const MAX_DOC_BYTES = 65_536;

// ── messages: everything an event needs once the policy checks passed (no IP, no user agent string) ──

/** Fields of a document entry besides `t`; null and undefined are omitted. */
export type EntryFields = Record<string, Param | undefined>;

/** A page view or an event. */
export interface VisitMsg {
	t: "pv" | "ev";
	site: string;
	/** Epoch seconds. */
	now: number;
	/** Client sid, null when the page sent none. */
	sid: string | null;
	/** The sid was generated on this page (`n = 1`): no visit can hold it yet, so the fast statement is skipped. */
	fresh: boolean;
	/** Document entry key: the client hit id of a page view, `e` + id of an event, the order id of an order. */
	key: string;
	/** pv: `p`, `qs`, `nt`. ev: `n`, `p` (absent: the visit's exit path). Both: `hs`, the host of a linked site. */
	fields: EntryFields;
	/** Event properties (`pr`). */
	props?: Record<string, unknown>;
	/** A page view from a search engine with a fresh sid: counts a re-entry when it continues a visit. */
	reentry?: boolean;
	/** Revenue: the event is also one `ca_events` row keyed by `key`. */
	rev?: { val: number | null; cur: string | null };
	/** Inputs of `resolveSession` for the slow path; `keys` maps a salt day to the visitor key. */
	evt: ResolveEvent;
	meta: Omit<ResolveMeta, "vkeyFor">;
	keys: Record<string, string>;
	cfg: ResolveConfig;
}

/** An engagement update of page view `key`. */
export interface EngageMsg {
	t: "en";
	site: string;
	now: number;
	sid: string;
	key: string;
	tz: string;
	/** `maxPageviewsPerSession`: an update may only open a new entry on a visit below it. */
	cap: number;
	d: number;
	e?: number;
	s?: number;
	i?: number;
	x?: number;
}

/** An error page seen by the server. */
export interface ServerMsg {
	t: "srv";
	site: string;
	now: number;
	tz: string;
	status: number;
	path: string;
	/** Referrer host and path, '' when none. */
	ref: string;
}

export type IngestMsg = VisitMsg | EngageMsg | ServerMsg;

/** Where validated events go. `D1Sink` writes them to the database; a queue sink can forward them later. */
export interface IngestSink {
	ingest(msg: IngestMsg): Promise<RecordOutcome>;
}

// ── visit columns and the S4 read ─────────────────────────────────────────────

export const SESSION_COLS = [
	"site", "sid", "vkey", "day", "hour", "started", "last_seen", "window_s", "entry_path", "exit_path", "pageviews", "events",
	"engaged_ms", "max_scroll", "interacted", "ref_host", "ref_path", "channel", "source", "utm_source", "utm_medium",
	"utm_campaign", "utm_term", "utm_content", "country", "region", "device", "browser", "browser_major", "os", "lang", "screen", "host",
] as const satisfies readonly (keyof SessionRow)[];
const SESSION_INTS = ["hour", "started", "last_seen", "window_s", "pageviews", "events", "engaged_ms", "max_scroll", "interacted"] as const;

/** Postgres returns BIGINT as strings; normalize numeric columns. The day goes back to its ISO form. */
function toSession(r: Record<string, unknown>): SessionRow {
	const row = { ...r } as Record<string, unknown>;
	for (const c of SESSION_INTS) row[c] = Number(row[c]);
	const d = String(row.day);
	row.day = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
	return row as unknown as SessionRow;
}

const fn = (d: Dialect, name: "max" | "object") => raw(d === "postgres" ? (name === "max" ? "GREATEST" : "jsonb_build_object") : name === "max" ? "MAX" : "jsonb_object");

/** Today and yesterday in the site time zone: the days a live visit can have started on. */
function liveDays(now: number, tz: string): [string | number, string | number] {
	const today = dayInZone(now, tz);
	return [visitDayKey(today), visitDayKey(addDays(today, -1))];
}

export interface VisitRead {
	/** Canonical sid of the client sid's alias, when one is live. */
	canon: string | null;
	rows: SessionRow[];
	/** A candidate visit already holds entry `key`: the event was applied before. */
	seen: boolean;
}

/**
 * S4: in one statement, the client sid's alias, its own visit, the alias's visit and the live visits of the
 * visitor keys, all among visits started today or yesterday. One row (all NULL) when nothing matches.
 */
export function visitReadSql(d: Dialect, site: string, now: number, tz: string, sid: string | null, vkeys: readonly string[], key?: string): Frag {
	const s = q(d);
	const [today, yday] = liveDays(now, tz);
	const cols = raw(SESSION_COLS.map((c) => `v.${c}`).join(", "));
	const seen = key ? s`, ${docGet(d, "v.hits", key, "t")} IS NOT NULL AS seen` : raw("");
	const byKey = vkeys.length ? s` OR (v.vkey IN (${join(vkeys.map((k) => s`${k}`))}) AND v.last_seen + v.window_s >= ${now})` : raw("");
	return s`SELECT a.canon AS canon, ${cols}${seen} FROM (SELECT (SELECT canon FROM ca_aliases WHERE site = ${site} AND sid = ${sid} AND expires >= ${now}) AS canon) a LEFT JOIN ca_sessions v ON v.site = ${site} AND v.day IN (${today}, ${yday}) AND (v.sid = ${sid} OR v.sid = a.canon${byKey})`;
}

export async function readVisits(db: Db, site: string, now: number, tz: string, sid: string | null, vkeys: readonly string[], key?: string): Promise<VisitRead> {
	const f = visitReadSql(db.dialect, site, now, tz, sid, vkeys, key);
	const rows = await db.all<Record<string, unknown>>(f.sql, f.params);
	const canon = (rows[0]?.canon as string | null | undefined) ?? null;
	const visits = rows.filter((r) => r.sid !== null && r.sid !== undefined);
	return { canon, rows: visits.map(toSession), seen: visits.some((r) => r.seen === true || Number(r.seen) === 1) };
}

// ── statements ────────────────────────────────────────────────────────────────

/** The visit of a client sid (through its live alias) among visits started today or yesterday. */
function bySid(d: Dialect, site: string, sid: string, now: number, tz: string, alias = ""): Frag {
	const [today, yday] = liveDays(now, tz);
	const v = raw(alias ? `${alias}.` : "");
	return q(d)`${v}site = ${site} AND ${v}day IN (${today}, ${yday}) AND ${v}sid = COALESCE((SELECT canon FROM ca_aliases WHERE site = ${site} AND sid = ${sid} AND expires >= ${now}), ${sid})`;
}

/** One visit by its key. */
function byKey(d: Dialect, site: string, day: string, sid: string): Frag {
	return q(d)`site = ${site} AND day = ${visitDayKey(day)} AND sid = ${sid}`;
}

/** Stored size of the visit document. */
const docSize = (d: Dialect) => raw(d === "postgres" ? "pg_column_size(hits)" : "length(hits)");
const maxSeconds = (cfg: ResolveConfig) => Math.min(cfg.maxSessionMinutes, MAX_VISIT_MINUTES) * 60;

/**
 * Live and below the cap, and no entry under the key yet (the replay guard). An event carrying the sid of a stored
 * visit belongs to the page that visit shows, so it skips the inactivity window (a long read, then a click); a page
 * view after the window starts a new visit.
 */
function liveGuard(d: Dialect, m: VisitMsg): Frag {
	const s = q(d);
	// An order is never refused by the event cap: its row is already stored, so the visit must take its entry.
	const cap = m.t === "pv" ? s`pageviews < ${m.cfg.maxPageviewsPerSession ?? 500}` : m.rev ? raw("1 = 1") : s`events < ${m.cfg.maxEventsPerSession ?? 200}`;
	const win = m.t === "pv" ? s` AND ${m.now} - last_seen <= window_s` : raw("");
	// A passive event adds nothing to `events`, so the event cap cannot bound it: the document size does.
	const full = m.evt.passive ? s` AND ${docSize(d)} < ${MAX_DOC_BYTES}` : raw("");
	return s`${docGet(d, "hits", m.key, "t")} IS NULL${win} AND ${m.now} - started <= ${maxSeconds(m.cfg)} AND ${cap}${full}`;
}

/**
 * S1 and S3: add the entry to a known visit. The entry is written with explicit-field `jsonb_set`, not
 * `jsonb_patch`: with the replay guard the entry has no `t` yet, so setting fields keeps an engagement
 * update that arrived first exactly as a merge would, and on a 50 KB document it costs a fraction of the SQL
 * time of a patch, which rewrites the whole object (measured in `tests/apply.test.ts`; on D1: 4.4 ms
 * against 0.9 ms).
 */
export function entryUpdate(d: Dialect, m: VisitMsg, target: Frag, reentry = false): Frag {
	const s = q(d);
	const f = m.fields;
	if (m.t === "pv") {
		const hits = docSet(d, "hits", m.key, { t: s`${m.now} - started`, p: f.p, qs: f.qs, nt: f.nt, re: reentry ? 1 : undefined, hs: f.hs });
		return s`UPDATE ca_sessions SET hits = ${hits}, pageviews = pageviews + 1, last_seen = ${fn(d, "max")}(last_seen, ${m.now}), exit_path = ${f.p ?? null}${raw(reentry ? ", reentries = reentries + 1" : "")} WHERE ${target} AND ${liveGuard(d, m)} RETURNING sid`;
	}
	const hits = docSet(d, "hits", m.key, { t: s`${m.now} - started`, n: f.n, p: f.p ?? raw("exit_path"), pr: m.props ? docJson(d, m.props) : undefined, hs: f.hs });
	// A late event keeps last_seen, so the idle time does not become visit duration.
	const seen = s`CASE WHEN ${m.now} - last_seen <= window_s THEN ${fn(d, "max")}(last_seen, ${m.now}) ELSE last_seen END`;
	// A passive event (the link impression) is stored but not counted: `events` decides engagement and bounce.
	return s`UPDATE ca_sessions SET hits = ${hits}${raw(m.evt.passive ? "" : ", events = events + 1")}, last_seen = ${seen} WHERE ${target} AND ${liveGuard(d, m)} RETURNING sid`;
}

/** Slow path, new visit: the row with its first entry inside; nothing on a conflict (a racing first event). */
export function visitInsert(d: Dialect, row: SessionRow, m: VisitMsg): Frag {
	const s = q(d);
	const vals = SESSION_COLS.map((c) => (c === "day" ? s`${visitDayKey(row.day)}` : s`${row[c]}`));
	const f = m.fields;
	const entry =
		m.t === "pv"
			? docObject(d, { t: 0, p: f.p, qs: f.qs, nt: f.nt, hs: f.hs })
			: docObject(d, { t: 0, n: f.n, p: f.p ?? row.exit_path, pr: m.props ? docJson(d, m.props) : undefined, hs: f.hs });
	return s`INSERT INTO ca_sessions (${raw(SESSION_COLS.join(", "))}, hits) VALUES (${join(vals)}, ${fn(d, "object")}(${m.key}, ${entry})) ON CONFLICT DO NOTHING RETURNING sid`;
}

/** S2: totals move by the difference to the stored value, so repeated and reordered updates converge. */
export function engageUpdate(d: Dialect, m: EngageMsg): Frag {
	const s = q(d);
	const max = fn(d, "max");
	const old = (f: string) => s`COALESCE(${docGet(d, "hits", m.key, f, "int")}, 0)`;
	const grown = (f: string, v: number | undefined) => (v === undefined ? undefined : s`${max}(${v}, ${old(f)})`);
	const set: Frag[] = [s`engaged_ms = engaged_ms + ${max}(0, ${m.d} - ${old("d")})`];
	if (m.e !== undefined) set.push(s`visible_ms = visible_ms + ${max}(0, ${m.e} - ${old("e")})`);
	if (m.s !== undefined) set.push(s`max_scroll = ${max}(max_scroll, ${m.s})`);
	if (m.i !== undefined) set.push(s`interacted = ${max}(interacted, ${m.i})`);
	set.push(s`hits = ${docSet(d, "hits", m.key, { d: grown("d", m.d), e: grown("e", m.e), s: grown("s", m.s), x: grown("x", m.x) })}`);
	// An entry that does not exist yet (the update beat its page view) is opened only in a young visit and below the
	// caps, so an update for a page view that was dropped (excluded path, reload, cap) or for an invented hit id neither
	// counts time nor grows the document: it changes nothing and counts `orphan_update`.
	const known = s`(${docGet(d, "hits", m.key, "t")} IS NOT NULL OR ${docGet(d, "hits", m.key, "d")} IS NOT NULL OR (started >= ${m.now - YOUNG_VISIT_S} AND pageviews < ${m.cap} AND ${docSize(d)} < ${MAX_DOC_BYTES}))`;
	return s`UPDATE ca_sessions SET ${join(set)} WHERE ${bySid(d, m.site, m.sid, m.now, m.tz)} AND ${known}`;
}

/**
 * Revenue: one `ca_events` row per order, attached to the client sid's visit (the caller moves it when the event
 * lands on another visit). A conflict is a
 * duplicate order and costs 0 rows. (SQLite needs the `WHERE` of an `INSERT ... SELECT` before `ON CONFLICT`.)
 */
export function orderInsert(d: Dialect, m: VisitMsg): Frag {
	const s = q(d);
	const tz = m.cfg.siteTimezone;
	const on = m.sid ? bySid(d, m.site, m.sid, m.now, tz, "v") : raw("1 = 0");
	const props = m.props ? JSON.stringify(m.props) : null;
	// A NULL amount still needs its type on Postgres, where a bare parameter is typed TEXT.
	const val: Frag = { sql: d === "postgres" ? "CAST(? AS DOUBLE PRECISION)" : "?", params: [m.rev?.val ?? null] };
	return s`INSERT INTO ca_events (site, id, day, ts, sday, sid, name, path, props, val, cur) SELECT ${m.site}, ${m.key}, ${dayInt(dayInZone(m.now, tz))}, ${m.now}, v.day, v.sid, ${m.fields.n ?? ""}, COALESCE(${m.fields.p ?? null}, v.exit_path), ${props}, ${val}, ${m.rev?.cur ?? null} FROM (SELECT 1 AS one) o LEFT JOIN ca_sessions v ON ${on} WHERE 1 = 1 ON CONFLICT (site, id) DO NOTHING RETURNING sid`;
}

/**
 * S5: an alias lives as long as the longest visit, so it is written again when the canonical visit changes, or when
 * less than half its life is left (an alias written with a shorter life); 0 rows otherwise.
 */
export function aliasUpsert(d: Dialect, site: string, a: { sid: string; canon: string; expires: number }): Frag {
	return q(d)`INSERT INTO ca_aliases (site, sid, canon, expires) VALUES (${site}, ${a.sid}, ${a.canon}, ${a.expires}) ON CONFLICT (site, sid) DO UPDATE SET canon = excluded.canon, expires = excluded.expires WHERE ca_aliases.canon <> excluded.canon OR ca_aliases.expires < excluded.expires - ${MAX_VISIT_MINUTES * 30}`;
}

/** S6: error pages as counters per day, status, path and referrer. */
export function srvUpsert(d: Dialect, m: ServerMsg): Frag {
	const s = q(d);
	return s`INSERT INTO ca_srv (site, day, status, path, ref, n, last_ts) VALUES (${m.site}, ${dayInt(dayInZone(m.now, m.tz))}, ${m.status}, ${m.path}, ${m.ref}, ${1}, ${m.now}) ${raw(upsertClause("ca_srv", ["site", "day", "status", "path", "ref"], ["last_ts"], ["n"]))}`;
}

// ── the write guard of the `small` profile ────────────────────────────────────

/** What the write guard reads: the state key store, the capacity profile and the site time zone. */
export interface WriteGuard {
	kv: KvLike;
	profile: CapacityProfile;
	tz: string;
	/** The database the guard counts (its routed binding; absent: the default database). */
	key?: string;
}

/** The guard state of this isolate per database, kept as long as `budgetState` would answer from its key. */
const guardCache = new Map<string, { profile: CapacityProfile; until: number; blocked: boolean }>();

/** Test helper: forget the isolate's guard state. */
export function resetWriteGuard(): void {
	guardCache.clear();
}

/**
 * Whether the daily write allowance stops ingest (`small` profile only). The state is kept in the isolate until
 * `budgetState` would check again (hourly, every 10 minutes above a quarter of the limit, a blocked state until the
 * next UTC day), so between checks a write costs no extra statement and a blocked event costs none at all; the
 * first event after a check is due pays one state read (and, when the stored state is stale, the page view sum).
 * A failed check lets writes through for a minute: the guard is an estimate and must not stop ingest by itself.
 */
export async function writesBlocked(db: Db, g: WriteGuard, now: number): Promise<boolean> {
	if (!dailyRowsApply(g.profile, db)) return false;
	const key = g.key ?? "";
	const hit = guardCache.get(key);
	if (hit?.profile === g.profile && now < hit.until) return hit.blocked;
	let st: Awaited<ReturnType<typeof budgetState>>;
	try {
		st = await budgetState(db, g.kv, now, g.profile, g.tz);
	} catch {
		guardCache.set(key, { profile: g.profile, until: now + 60, blocked: false });
		return false;
	}
	if (!st) return false;
	const nextDay = Date.parse(`${st.day}T00:00:00Z`) / 1000 + 86_400;
	const until = st.blocked ? nextDay : Math.min(nextDay, st.at + (st.rows >= st.limit * FAST_FROM ? CHECK_FAST_S : CHECK_SLOW_S));
	guardCache.set(key, { profile: g.profile, until, blocked: st.blocked });
	return st.blocked;
}

// ── the D1 sink ───────────────────────────────────────────────────────────────

/** Applies events with the statements above, directly on the database; with a guard, not while the day's writes are blocked. */
export class D1Sink implements IngestSink {
	constructor(
		private db: Db,
		private guard?: WriteGuard,
	) {}

	async ingest(m: IngestMsg): Promise<RecordOutcome> {
		if (this.guard && (await writesBlocked(this.db, this.guard, m.now))) return "budget_blocked";
		const d = this.db.dialect;
		if (m.t === "srv") {
			const f = srvUpsert(d, m);
			await this.db.run(f.sql, f.params);
			return "ok";
		}
		if (m.t === "en") {
			const f = engageUpdate(d, m);
			return (await this.db.run(f.sql, f.params)).changes > 0 ? "ok" : "orphan_update";
		}
		return this.visit(m);
	}

	private async returns(f: Frag): Promise<Array<{ sid: string | null }>> {
		return this.db.all<{ sid: string | null }>(f.sql, f.params);
	}

	private async visit(m: VisitMsg): Promise<RecordOutcome> {
		const d = this.db.dialect;
		const tz = m.cfg.siteTimezone;
		let attached: string | null = null;
		if (m.rev) {
			const r = await this.returns(orderInsert(d, m));
			if (!r.length) {
				// The row exists. If an earlier attempt stored it and then failed before its document write (an overload
				// retried by the route, a lost isolate), the row's visit lacks the entry: add it there, guarded like S3,
				// only when that visit is the client sid's live visit. 0 rows written for a true duplicate.
				const own = q(d)`${bySid(d, m.site, m.sid ?? "", m.now, tz)} AND (day, sid) IN (SELECT sday, sid FROM ca_events WHERE site = ${m.site} AND id = ${m.key})`;
				if (m.sid && (await this.returns(entryUpdate(d, m, own))).length) return "ok";
				return "duplicate_order";
			}
			attached = r[0]?.sid ?? null;
		}
		if (m.sid && !m.fresh && (await this.returns(entryUpdate(d, m, bySid(d, m.site, m.sid, m.now, tz)))).length) return "ok";

		// Slow path: one read, the session rules in memory, one write.
		const read = await readVisits(this.db, m.site, m.now, tz, m.sid, Object.values(m.keys), m.key);
		if (read.seen) return "ok";
		const store = new RequestStore(m.site, read.rows, m.sid && read.canon ? { sid: m.sid, canon: read.canon } : null);
		const cfg = { ...m.cfg, maxSessionMinutes: Math.min(m.cfg.maxSessionMinutes, MAX_VISIT_MINUTES), ...(m.rev && { maxEventsPerSession: undefined }) };
		const vkeyFor = async (day: string) => {
			const k = m.keys[day];
			if (!k) throw new Error(`no visitor key for salt day ${day}`);
			return k;
		};
		const res = await resolveSession(m.evt, { ...m.meta, vkeyFor }, m.now, cfg, store);
		// The alias holds even when the event itself is skipped (a deduped reload), as the session rules decided.
		if (store.alias) {
			const f = aliasUpsert(d, m.site, store.alias);
			await this.db.run(f.sql, f.params);
		}
		if (res.skipped) return res.skipped;
		const visit = res.session;
		const target = byKey(d, m.site, visit.day, visit.sid);
		let wrote: boolean;
		if (store.created) {
			// A conflict means two first events of one sid raced: the other one created the visit, continue it.
			wrote = (await this.returns(visitInsert(d, store.created, m))).length > 0 || (await this.returns(entryUpdate(d, m, target))).length > 0;
		} else wrote = (await this.returns(entryUpdate(d, m, target, m.t === "pv" && !!m.reentry))).length > 0;
		// The visit changed between the read and the write (a racing request took its last page view under the cap, or it
		// expired): unless the entry is there (a racing replay), the caller counts the failure and the client sends it again.
		if (!wrote) {
			const has = q(d)`SELECT 1 AS ok FROM ca_sessions WHERE ${target} AND ${docGet(d, "hits", m.key, "t")} IS NOT NULL`;
			if (!(await this.db.all(has.sql, has.params)).length) {
				// A passive event on a visit whose document is full is dropped like any event over the cap.
				const full = q(d)`SELECT 1 AS ok FROM ca_sessions WHERE ${target} AND ${docSize(d)} >= ${MAX_DOC_BYTES}`;
				if (m.evt.passive && (await this.db.all(full.sql, full.params)).length) return "session_cap";
				throw new Error("ingest: the visit changed between the read and the write");
			}
		}
		// The order row joined the client sid's visit, which may be closed; it belongs to the visit that took the event.
		if (m.rev && attached !== visit.sid) {
			const f = q(d)`UPDATE ca_events SET sday = ${visitDayKey(visit.day)}, sid = ${visit.sid} WHERE site = ${m.site} AND id = ${m.key}`;
			await this.db.run(f.sql, f.params);
		}
		return "ok";
	}
}
