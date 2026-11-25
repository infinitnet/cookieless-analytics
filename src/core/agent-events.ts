/**
 * Server side event ingestion for `POST agent/v1/events`: the site's own backend reports
 * events, typically orders, with an optional `sid` taken from the page. One row each in `ca_events`, the
 * table browser orders go to as well, so one order is one row whatever its origin. An event attached to a
 * visit is also an entry of that visit's document (keyed like its `ca_events` row: `t`, `n`, `p`, `pr`), so
 * the hit-level reports see it like a browser event. Set based: three reads (order ids, sessions, aliases),
 * one insert per 9 events and one document update per attached visit, so a call of 20 events costs at most
 * 26 statements (6 plus one per distinct visit), plus one read when it holds refunds and one update per void.
 *
 * A refund (`{ name, oid, rid, refund }`) is one more `ca_events` row: the order's attribution (`sday`, `sid`,
 * `name`, `path`, `cur`) with `val` the negative amount, on the refund's own day, keyed `<order row id>.r<hash of
 * rid>` so a retry is stored once and the refunds of an order are one key range. It never touches the visit.
 */
import { isPassiveEvent, SID_RE } from "../contract.js";
import { dayInt, docJson, docObject, docPut, type Frag, isoDay, q, visitDayKey } from "../db/dialect.js";
import type { Param, Stmt } from "../db/sql.js";
import { randomId, sha256 } from "./crypto.js";
import { normalizeCurrency, REVENUE_MAX_VALUE, roundMinor } from "./currency.js";
import { cleanProps, isEventName, isPath, isReservedEvent, OID_RE, type RevenueError, validateRevenue } from "./ids.js";
import { orderHitId, type RecorderDeps } from "./recorder.js";
import { siteSetting } from "./site-settings.js";
import { rawFromDay } from "../query/retention.js";
import { drops } from "./drops.js";
import { addDays, dayInZone, lastClosedDay } from "./time.js";
import { normalizeUrl } from "./url.js";

export const AGENT_EVENTS_MAX_PER_CALL = 20;
export const AGENT_EVENT_MAX_AGE_DAYS = 30;
/** Accepted clock skew of a `ts` in the future. */
const FUTURE_SKEW_S = 60;

export type AgentEventReason =
	| "invalid_name"
	| "invalid_value"
	| "invalid_currency"
	| "invalid_id"
	| "invalid_ts"
	| "invalid_sid"
	| "invalid_path"
	| "reserved_name"
	| "unknown_order"
	| "refund_exceeds_order"
	| "currency_mismatch";

export interface AgentEventsResult {
	accepted: number;
	duplicates: number;
	rejected: Array<{ index: number; reason: AgentEventReason }>;
}

interface Item {
	index: number;
	name: string;
	ts: number;
	sid: string | null;
	u: string | undefined;
	props: string | null;
	val: number | null;
	cur: string | null;
	oid: string | undefined;
	/** `{ name, oid, void: true }`: the order's value and currency become NULL, the event row stays. */
	void?: true;
	/** `{ name, oid, rid, refund, cur?, ts? }`: a refund of `amount` of the stored order, idempotent per `rid`. */
	refund?: { amount: number; rid: string };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Validate one item with the browser rules (name, props, revenue) plus `ts`, `sid` format and `u`. */
function check(raw: unknown, index: number, now: number, firstDay: string, tz: string): Item | AgentEventReason {
	if (!isObj(raw)) return "invalid_name";
	const name = raw.name;
	if (typeof name === "string" && isReservedEvent(name)) return "reserved_name";
	if (!isEventName(name)) return typeof name === "string" && name.startsWith("_") ? "reserved_name" : "invalid_name";
	if (raw.void !== undefined) {
		if (raw.void !== true || raw.val !== undefined) return "invalid_value";
		if (typeof raw.oid !== "string" || !OID_RE.test(raw.oid)) return "invalid_id";
		return { index, name, ts: now, sid: null, u: undefined, props: null, val: null, cur: null, oid: raw.oid, void: true };
	}
	const ts = raw.ts === undefined ? now : raw.ts;
	// A row dated on or before the raw window start would be deleted before any rollup saw it.
	const badTs = typeof ts !== "number" || !Number.isInteger(ts) || ts < now - AGENT_EVENT_MAX_AGE_DAYS * 86_400 || ts > now + FUTURE_SKEW_S || dayInZone(ts, tz) < firstDay;
	if (raw.refund !== undefined) {
		// The attribution, path and properties are the order's: `sid`, `u` and `p` are not read.
		const amount = raw.refund;
		if (raw.val !== undefined || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > REVENUE_MAX_VALUE) return "invalid_value";
		if (typeof raw.oid !== "string" || !OID_RE.test(raw.oid) || typeof raw.rid !== "string" || !OID_RE.test(raw.rid)) return "invalid_id";
		const cur = raw.cur === undefined ? null : normalizeCurrency(raw.cur);
		if (raw.cur !== undefined && !cur) return "invalid_currency";
		if (badTs) return "invalid_ts";
		return { index, name, ts: ts as number, sid: null, u: undefined, props: null, val: null, cur, oid: raw.oid, refund: { amount, rid: raw.rid } };
	}
	const rev = validateRevenue(raw);
	if (rev && "error" in rev) return rev.error satisfies RevenueError;
	if (badTs) return "invalid_ts";
	if (raw.sid !== undefined && (typeof raw.sid !== "string" || !SID_RE.test(raw.sid))) return "invalid_sid";
	if (raw.u !== undefined && !isPath(raw.u)) return "invalid_path";
	const p = cleanProps(raw.p, name);
	return {
		index,
		name,
		ts: ts as number,
		sid: (raw.sid as string | undefined) ?? null,
		u: raw.u as string | undefined,
		props: p ? JSON.stringify(p) : null,
		val: rev ? rev.val : null,
		cur: rev?.cur ?? null,
		oid: rev?.oid,
	};
}

const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** Row id of a refund: inside the key range of its order (`<order id>.` to `<order id>/`), one per refund id. */
export async function refundRowId(orderId: string, rid: string): Promise<string> {
	const h = await sha256(`${orderId}|${rid}`);
	return `${orderId}.r${[...h.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
/** The key range of an order's refund rows. */
const refundRange = (orderId: string) => [`${orderId}.`, `${orderId}/`] as const;

type SessionRef = { sid: string; day: string | number; exit_path: string | null };
type StoredOrder = { id: string; ts: number; sday: string | number | null; sid: string | null; path: string | null; val: number | null; cur: string | null };

/** Visits a server event can attach to: started in the last 7 days, a key range of `(site, day, sid)`. */
export const AGENT_ATTACH_DAYS = 7;

/**
 * Resolve client sids to stored sessions of the site started in the last `AGENT_ATTACH_DAYS` days,
 * directly or through the alias table joined to its canonical session. Two reads at most; none without sids.
 */
async function sessionsFor(db: RecorderDeps["db"], site: string, sids: string[], since: string | number): Promise<Map<string, SessionRef>> {
	const out = new Map<string, SessionRef>();
	if (!sids.length) return out;
	for (const r of await db.all<SessionRef>(`SELECT sid, day, exit_path FROM ca_sessions WHERE site = ? AND day >= ? AND sid IN (${marks(sids.length)}) ORDER BY day`, [site, since, ...sids]))
		out.set(r.sid, r);
	const missing = sids.filter((x) => !out.has(x));
	if (missing.length)
		for (const r of await db.all<SessionRef & { alias: string }>(
			`SELECT a.sid AS alias, s.sid, s.day, s.exit_path FROM ca_aliases a JOIN ca_sessions s ON s.site = a.site AND s.day >= ? AND s.sid = a.canon WHERE a.site = ? AND a.sid IN (${marks(missing.length)}) ORDER BY s.day`,
			[since, site, ...missing],
		))
			out.set(r.alias, { sid: r.sid, day: r.day, exit_path: r.exit_path });
	return out;
}

const EVENT_COLS = ["site", "id", "day", "ts", "sday", "sid", "name", "path", "props", "val", "cur"] as const;
type EventRow = Record<(typeof EVENT_COLS)[number], Param>;
/** An existing order takes the new amount and currency and keeps everything else. */
const ORDER_UPSERT = "ON CONFLICT (site, id) DO UPDATE SET val = excluded.val, cur = excluded.cur, sday = COALESCE(ca_events.sday, excluded.sday), sid = COALESCE(ca_events.sid, excluded.sid)";
const ROWS_PER_STMT = 9;

function eventInserts(rows: readonly EventRow[]): Stmt[] {
	const out: Stmt[] = [];
	for (let i = 0; i < rows.length; i += ROWS_PER_STMT) {
		const part = rows.slice(i, i + ROWS_PER_STMT);
		const one = `(?, ?, CAST(? AS INTEGER), CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?)`;
		out.push({
			sql: `INSERT INTO ca_events (${EVENT_COLS.join(", ")}) VALUES ${part.map(() => one).join(", ")} ${ORDER_UPSERT}`,
			params: part.flatMap((r) => EVENT_COLS.map((c) => r[c])),
		});
	}
	return out;
}

/**
 * Store up to 20 events for one site of this database. Invalid items are reported by index and the
 * rest are stored; an order id already stored (by the browser or an earlier call) takes the new amount
 * and currency and counts as a duplicate.
 * Session attachment raises `events` only: `last_seen`, `exit_path` and every other field stay as they were.
 */
export async function recordAgentEvents(deps: RecorderDeps, site: string, events: readonly unknown[]): Promise<AgentEventsResult> {
	const { db, settings: s } = deps;
	const s_ = q(db.dialect);
	const now = deps.now ?? Math.floor(Date.now() / 1000);
	await deps.ready?.();
	const rejected: AgentEventsResult["rejected"] = [];
	const items: Item[] = [];
	// One read of the raw window per call (settings and KV, no SQL): a valid day is after its first day.
	const firstDay = addDays(await rawFromDay(deps.kv, s, now), 1);
	events.slice(0, AGENT_EVENTS_MAX_PER_CALL).forEach((raw, i) => {
		const r = check(raw, i, now, firstDay, s.siteTimezone);
		if (typeof r === "string") rejected.push({ index: i, reason: r });
		else items.push(r);
	});

	const since = visitDayKey(addDays(dayInZone(now, s.siteTimezone), -AGENT_ATTACH_DAYS));
	const sessions = await sessionsFor(db, site, [...new Set(items.flatMap((x) => (x.sid ? [x.sid] : [])))], since);
	const attached: Array<Item & { session: SessionRef | null }> = [];
	for (const x of items) {
		const session = x.sid ? sessions.get(x.sid) : null;
		if (x.sid && !session) rejected.push({ index: x.index, reason: "invalid_sid" });
		else attached.push({ ...x, session: session ?? null });
	}

	// Order ids: one lookup for the whole call; a repeat inside the call is a duplicate too.
	const ids = await Promise.all(attached.map((x) => ((x.val !== null || x.void || x.refund) && x.oid ? orderHitId(site, x.name, x.oid) : null)));
	const orderIds = [...new Set(ids.filter((id): id is string => !!id))];
	/** Stored orders: their visit sid (null: stored without a visit) and, for refunds, the attribution and amount. */
	const stored = new Map(
		orderIds.length
			? (await db.all<StoredOrder>(`SELECT id, ts, sday, sid, path, val, cur FROM ca_events WHERE site = ? AND id IN (${marks(orderIds.length)})`, [site, ...orderIds])).map((r) => [r.id, r])
			: [],
	);
	const refundIds = await Promise.all(attached.map((x, i) => (x.refund ? refundRowId(ids[i] as string, x.refund.rid) : null)));
	// The stored refunds of the orders refunded in this call: one key range each, one statement.
	const refunded = new Map<string, Map<string, number>>();
	const refundOrders = [...new Set(ids.filter((id, i) => id && attached[i]?.refund && stored.has(id)))] as string[];
	if (refundOrders.length)
		for (const r of await db.all<{ id: string; val: number | null }>(
			`SELECT id, val FROM ca_events WHERE site = ? AND (${refundOrders.map(() => "(id > ? AND id < ?)").join(" OR ")})`,
			[site, ...refundOrders.flatMap(refundRange)],
		)) {
			const o = r.id.slice(0, r.id.lastIndexOf("."));
			refunded.set(o, (refunded.get(o) ?? new Map()).set(r.id, -Number(r.val ?? 0)));
		}
	let accepted = 0;
	let duplicates = 0;
	const rows: EventRow[] = [];
	const byId = new Map<string, EventRow>();
	/** New entries per visit `(day, sid)`. */
	const visits = new Map<string, { ref: SessionRef; entries: Array<readonly [string, Frag]>; counted: number }>();
	const closed = lastClosedDay(now, s.siteTimezone);
	const fallback = siteSetting(s, deps.client, "defaultCurrency");
	const voided: string[] = [];
	attached.forEach((x, i) => {
		const orderId = ids[i];
		if (x.refund) {
			const o = stored.get(orderId as string);
			if (!o) return void rejected.push({ index: x.index, reason: "unknown_order" });
			const id = refundIds[i] as string;
			const done = refunded.get(o.id) ?? new Map<string, number>();
			// A retry of a stored refund, or a repeat inside the call, writes nothing.
			if (done.has(id)) return void duplicates++;
			if (o.val === null || !o.cur) return void rejected.push({ index: x.index, reason: "refund_exceeds_order" });
			if (x.cur && x.cur !== o.cur) return void rejected.push({ index: x.index, reason: "currency_mismatch" });
			if (x.ts < Number(o.ts)) return void rejected.push({ index: x.index, reason: "invalid_ts" });
			const amount = roundMinor(x.refund.amount, o.cur);
			if (amount <= 0) return void rejected.push({ index: x.index, reason: "invalid_value" });
			const total = [...done.values()].reduce((a, b) => a + b, 0) + amount;
			if (roundMinor(total, o.cur) > roundMinor(Number(o.val), o.cur)) return void rejected.push({ index: x.index, reason: "refund_exceeds_order" });
			refunded.set(o.id, done.set(id, amount));
			rows.push({ site, id, day: dayInt(dayInZone(x.ts, s.siteTimezone)), ts: x.ts, sday: o.sday, sid: o.sid, name: x.name, path: o.path, props: null, val: -amount, cur: o.cur });
			return void accepted++;
		}
		const cur = x.val === null ? null : (x.cur ?? fallback);
		const url = x.u ? normalizeUrl(x.u, s.queryAllowlist) : null;
		const sid = x.session?.sid ?? null;
		const row: EventRow = {
			site,
			id: orderId ?? `a.${randomId(20)}`,
			day: dayInt(dayInZone(x.ts, s.siteTimezone)),
			ts: x.ts,
			sday: x.session ? x.session.day : null,
			sid,
			name: x.name,
			path: url?.path ?? x.session?.exit_path ?? null,
			props: x.props,
			val: x.val === null || !cur ? null : roundMinor(x.val, cur),
			cur,
		};
		// A void needs a stored order; its row carries val and cur NULL, so the upsert nulls both.
		if (x.void && !stored.has(orderId as string)) return void rejected.push({ index: x.index, reason: "unknown_order" });
		// A void also voids the order's refunds, so its net stays zero.
		if (x.void) voided.push(orderId as string);
		// The authenticated caller has the last word on an order: a repeat replaces amount and currency.
		const earlier = orderId ? byId.get(orderId) : undefined;
		if (earlier) {
			// One statement must not upsert a row twice (Postgres refuses), so a repeat inside the call edits the pending row.
			Object.assign(earlier, { val: row.val, cur: row.cur, sday: earlier.sday ?? row.sday, sid: earlier.sid ?? row.sid });
			return void duplicates++;
		}
		rows.push(row);
		if (orderId) byId.set(orderId, row);
		// A repeat that brings the visit of an order stored without one attaches it (the upsert sets its sid): the entry follows.
		if (orderId && stored.has(orderId)) {
			duplicates++;
			if (stored.get(orderId)?.sid !== null || !x.session) return;
		} else accepted++;
		if (!x.session) return;
		// The summary of a closed day is stored: its visit keeps the attribution of the row, but its document and counters stay as stored.
		if (isoDay(x.session.day) <= closed) return void drops.add(site, dayInZone(now, s.siteTimezone), "late_after_close");
		const k = `${x.session.day}|${x.session.sid}`;
		const v = visits.get(k) ?? { ref: x.session, entries: [], counted: 0 };
		if (!isPassiveEvent(x.name)) v.counted++;
		const pr = x.props ? docJson(db.dialect, JSON.parse(x.props)) : undefined;
		v.entries.push([row.id as string, docObject(db.dialect, { t: s_`${x.ts} - started`, n: x.name, p: row.path, pr })]);
		visits.set(k, v);
	});

	// One update per attached visit, by its key: the new entries and `events` (passive events not counted); `last_seen`, `exit_path` and every other field stay.
	const stmts: Stmt[] = [
		...eventInserts(rows),
		...voided.map((o) => ({ sql: "UPDATE ca_events SET val = NULL, cur = NULL WHERE site = ? AND id > ? AND id < ?", params: [site, ...refundRange(o)] })),
		...[...visits.values()].map(({ ref, entries, counted }) => s_`UPDATE ca_sessions SET hits = ${docPut(db.dialect, "hits", entries)}, events = events + ${counted} WHERE site = ${site} AND day = ${visitDayKey(isoDay(ref.day))} AND sid = ${ref.sid}`),
	];
	if (stmts.length) await db.batch(stmts);
	return { accepted, duplicates, rejected: rejected.sort((a, b) => a.index - b.index) };
}
