import { LINK_EVENTS, PLUGIN_ID, PRODUCT_NAME, ROUTES, SID_RE, VERSION } from "./contract.mjs";
import { $ as sitesInTables, $n as nextUtcDay, $r as redact, $t as ORDER_SUMS, A as BUILTIN_CHANNEL_RULES, Ai as eachDay, An as GoalSchema, Ar as formatAmount, At as revenueOrders, B as KV_WRITE_BUDGET, Bn as SEARCH_DIMS, C as siteProblem, Ci as upsertChanged, Cn as goalPredicate, Cr as isEventName, Ct as WITH_REVENUE, D as readVisits, Di as addDays, Dn as FUNNEL_MODES, Dr as validateIngest, Dt as metaOf, E as MAX_DOC_BYTES, Ei as ident, En as DIM_NAMES, Er as isSid, Et as hasRevenue, F as UTM_KEYS, Fi as saltDay, Fn as PROP_KEY_RE, Fr as eachTarget, Ft as resolveGranularity, G as KV_CURSOR, Gi as vkey, Gn as copyRowsLeft, Gt as openDay, H as budgetTargetOf, Hi as sha256, Hn as COPY_DAY_ROWS, Hr as setPluginFacts, Ht as clearOpenDays, I as cleanHost, Ii as samePeriodLastYear, In as QuerySchema, Ir as ensureHostSchema, It as timeseries, J as clearEstimateDay, Jn as PROVIDER_DAYS, Jr as fromPg, Jt as readSummary, K as KV_DELETE_ROWS, Kn as nextUtcMidnight, Kr as queryCacheOn, Kt as planFilters, Li as zonedToEpoch, Ln as REVENUE_BREAKDOWN_DIMS, Lr as factsDb, Lt as weekStart, M as buildChannelRules, Mi as lastClosedDay, Mn as NEGATED, Mr as normalizeCurrency, Mt as revenueSeries, N as classifyChannel, Ni as previousPeriod, Nn as NUM_OPS, Nr as roundMinor, Nt as withRevenue, Oi as dayInZone, On as FilterSchema, Or as validateRevenue, Ot as revenue, P as CLICK_IDS, Pi as saltBoundary, Pn as OPS, Pr as eachDatabase, Pt as bucketSeries, Q as runRetention, Qn as backfillRange, Qr as pgStatementLimit, Qt as DURATION_MS, R as normalizeUrl, Ri as base64url, Rn as REVENUE_DIMS, Rr as factsTargets, Rt as CUBE_SEG, S as registry, Si as q, Sn as entryProp, Sr as cleanProps, St as REVENUE_REPORTS, Ti as chunk, Tn as validateFilters, Tr as isReservedEvent, Tt as currencyOf, U as dailyRowsApply, Ui as timingSafeEqual, Un as chargeCopyRows, Ur as stateKv, Ut as clearScanCache, V as budgetState, Vi as randomId, Vn as TRAFFIC_DIMS, Vr as pluginFactsOrNull, Vt as behindNotice, Wi as truncateIp, Wn as copiedToday, Wr as statePrefix, X as rawFromDay, Xn as SYNC_BUDGET, Xr as pgOwnScope, Xt as storedSessions, Y as effectiveRawDays, Yn as RowsPaused, Yr as isHyperdrive, Yt as splitRange, Z as runChunk, Zn as SyncRows, Zr as pgScope, Zt as storedThrough, _ as linkedHosts, _i as docPut, _n as and, _r as parseLinkRules, _t as journeyNext, ai as ensureSchemaOnce, ar as ThrottledError, at as SEGS, b as markHostSeen, bi as likeEscape, bn as entriesOf, br as validateSafeRegex, bt as journeysFromSummary, c as ClientSiteSchema, ci as fromKysely, cn as refundDim, cr as PROFILES, ct as dayStatements, d as SITE_ID_RE, di as isD1, dr as budgetWarning, dt as runRollup, en as annotationsIn, er as utcDay, et as CUBE_CAP, f as SITE_KEY_RE, fi as workerEnv, fn as sessionTotals, fr as cachedSettings, ft as sitesOfDay, g as invalidateRegistry, gi as docObject, gn as TRUE, gr as settingsSchema, gt as JOURNEY_SESSION_CAP, h as hostnameOf, hi as docJson, hn as QueryError, hr as parseSiteSearchParams, ht as linksPlan, i as ingestStatus, ii as ensureSchema, in as keysIn, ir as SourceError, it as OTHER, ji as hourInZone, jn as LINK_BY, jr as isCurrency, jt as revenuePlan, k as isActive$1, ki as daysBetween, kn as FunnelStepsSchema, kt as revenueBreakdown, l as HOST_SEEN_PREFIX, li as selfCheck, ln as round, lr as budgetMb, lt as rollupDay, m as bindSite, mi as dayInt, mn as visitDays, mr as normalizeSettings, mt as linksFromSummary, ni as SCHEMA_VERSION_KEY, nn as goalGroups, nr as MAPPING_FIELD, nt as KV_ROLLUP_CURSOR, o as routedSink, oi as isOwnDatabase, on as num$2, or as DEFAULT_SETTINGS, ot as SUMMARY_DIMS, p as SiteField, pi as LIKE_ESCAPE, pn as sessionWhere, pr as d1CapMb, pt as links, q as cleanSalts, qn as KV_SYNC_ROWS, qr as INGEST_STATEMENT_MS, ri as TABLES$1, rn as hitJoin, rr as SOURCE_IDS, rt as KV_WATERMARK, si as schemaVersion, sn as ratio, sr as HOST_FORM_POINTER, st as counted$1, ti as SCHEMA_VERSION, tn as bounceRate, tr as BudgetExhausted, tt as KV_REVENUE_CURSOR, u as LINKED_HOSTS_KEY, ui as fromD1, un as sessionBreakdown, ur as budgetRange, ut as runRevenue, v as linkedHostsOf, vi as docRead, vn as compileSearch, vr as publicNames, vt as journeyPaths, w as drops, wi as visitDayKey, wn as inList, wr as isPath, wt as currencyList, x as newSiteKey, xi as paramRows, xn as entryCols, xr as OID_RE, xt as journeysUnavailable, y as loadSites, yi as isoDay, yn as compileTraffic, yr as compileSafeRegex, yt as journeyPrev, zi as getOrCreateSalt, zn as REVENUE_VALUE_RE, zr as missingDb } from "./queue-sink-GZqbpCBQ.mjs";
import { C as AGENT_CATEGORIES, S as AGENTS, _ as parseUa, a as scriptBody, b as classifyUa, d as bump, f as orderHitId, g as sinkOf, h as requestInfo, i as middlewareLiveAt, o as AGENT_RULES_KEY, p as recordClientEvent, r as currentAudience, s as resetStoredAgentRules, t as MW_SEEN_KEY, u as MAX_RECORD_BYTES, v as uaNorm, w as compileUserRules, x as createClassifier, y as siteSetting } from "./middleware-core-DKmOwHfH.mjs";
import { _ as pages, a as runRollupReport, c as SATISFACTION_BY, d as SCORE_DEFINITION, f as conflictsWithScope, g as notFound$1, h as exitPages, l as SATISFACTION_CAVEAT, m as entryPages, n as ROLLUP_REPORTS, o as POGO_DEFINITION, p as organicScope, r as rawOnly, s as RETURNED_DEFINITION, t as RAW_ONLY, u as SATISFACTION_REPORTS, v as overview } from "./rollup-DycgS_ed.mjs";
import { i as parseOptions, n as allowedHostsFor, r as engineOf, t as BINDING_RE } from "./config-CbmOz1Xm.mjs";
import { PluginRouteError, after, definePlugin, getPluginSettings, pluginResponse } from "emdash";
import { getDb } from "emdash/runtime";
import { z } from "zod";
/** Accepted clock skew of a `ts` in the future. */
const FUTURE_SKEW_S = 60;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
/** Validate one item with the browser rules (name, props, revenue) plus `ts`, `sid` format and `u`. */
function check(raw, index, now, firstDay, tz) {
	if (!isObj(raw)) return "invalid_name";
	const name = raw.name;
	if (typeof name === "string" && isReservedEvent(name)) return "reserved_name";
	if (!isEventName(name)) return typeof name === "string" && name.startsWith("_") ? "reserved_name" : "invalid_name";
	if (raw.void !== void 0) {
		if (raw.void !== true || raw.val !== void 0) return "invalid_value";
		if (typeof raw.oid !== "string" || !OID_RE.test(raw.oid)) return "invalid_id";
		return {
			index,
			name,
			ts: now,
			sid: null,
			u: void 0,
			props: null,
			val: null,
			cur: null,
			oid: raw.oid,
			void: true
		};
	}
	const ts = raw.ts === void 0 ? now : raw.ts;
	const badTs = typeof ts !== "number" || !Number.isInteger(ts) || ts < now - 2592e3 || ts > now + FUTURE_SKEW_S || dayInZone(ts, tz) < firstDay;
	if (raw.refund !== void 0) {
		const amount = raw.refund;
		if (raw.val !== void 0 || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) return "invalid_value";
		if (typeof raw.oid !== "string" || !OID_RE.test(raw.oid) || typeof raw.rid !== "string" || !OID_RE.test(raw.rid)) return "invalid_id";
		const cur = raw.cur === void 0 ? null : normalizeCurrency(raw.cur);
		if (raw.cur !== void 0 && !cur) return "invalid_currency";
		if (badTs) return "invalid_ts";
		return {
			index,
			name,
			ts,
			sid: null,
			u: void 0,
			props: null,
			val: null,
			cur,
			oid: raw.oid,
			refund: {
				amount,
				rid: raw.rid
			}
		};
	}
	const rev = validateRevenue(raw);
	if (rev && "error" in rev) return rev.error;
	if (badTs) return "invalid_ts";
	if (raw.sid !== void 0 && (typeof raw.sid !== "string" || !SID_RE.test(raw.sid))) return "invalid_sid";
	if (raw.u !== void 0 && !isPath(raw.u)) return "invalid_path";
	const p = cleanProps(raw.p, name);
	return {
		index,
		name,
		ts,
		sid: raw.sid ?? null,
		u: raw.u,
		props: p ? JSON.stringify(p) : null,
		val: rev ? rev.val : null,
		cur: rev?.cur ?? null,
		oid: rev?.oid
	};
}
const marks = (n) => Array.from({ length: n }, () => "?").join(", ");
/** Row id of a refund: inside the key range of its order (`<order id>.` to `<order id>/`), one per refund id. */
async function refundRowId(orderId, rid) {
	return `${orderId}.r${[...(await sha256(`${orderId}|${rid}`)).slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
/** The key range of an order's refund rows. */
const refundRange = (orderId) => [`${orderId}.`, `${orderId}/`];
/**
* Resolve client sids to stored sessions of the site started in the last `AGENT_ATTACH_DAYS` days,
* directly or through the alias table joined to its canonical session. Two reads at most; none without sids.
*/
async function sessionsFor(db, site, sids, since) {
	const out = /* @__PURE__ */ new Map();
	if (!sids.length) return out;
	for (const r of await db.all(`SELECT sid, day, exit_path FROM ca_sessions WHERE site = ? AND day >= ? AND sid IN (${marks(sids.length)}) ORDER BY day`, [
		site,
		since,
		...sids
	])) out.set(r.sid, r);
	const missing = sids.filter((x) => !out.has(x));
	if (missing.length) for (const r of await db.all(`SELECT a.sid AS alias, s.sid, s.day, s.exit_path FROM ca_aliases a JOIN ca_sessions s ON s.site = a.site AND s.day >= ? AND s.sid = a.canon WHERE a.site = ? AND a.sid IN (${marks(missing.length)}) ORDER BY s.day`, [
		since,
		site,
		...missing
	])) out.set(r.alias, {
		sid: r.sid,
		day: r.day,
		exit_path: r.exit_path
	});
	return out;
}
const EVENT_COLS = [
	"site",
	"id",
	"day",
	"ts",
	"sday",
	"sid",
	"name",
	"path",
	"props",
	"val",
	"cur"
];
/** An existing order takes the new amount and currency and keeps everything else. */
const ORDER_UPSERT = "ON CONFLICT (site, id) DO UPDATE SET val = excluded.val, cur = excluded.cur, sday = COALESCE(ca_events.sday, excluded.sday), sid = COALESCE(ca_events.sid, excluded.sid)";
const ROWS_PER_STMT = 9;
function eventInserts(rows) {
	const out = [];
	for (let i = 0; i < rows.length; i += ROWS_PER_STMT) {
		const part = rows.slice(i, i + ROWS_PER_STMT);
		const one = `(?, ?, CAST(? AS INTEGER), CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?)`;
		out.push({
			sql: `INSERT INTO ca_events (${EVENT_COLS.join(", ")}) VALUES ${part.map(() => one).join(", ")} ${ORDER_UPSERT}`,
			params: part.flatMap((r) => EVENT_COLS.map((c) => r[c]))
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
async function recordAgentEvents(deps, site, events) {
	const { db, settings: s } = deps;
	const s_ = q(db.dialect);
	const now = deps.now ?? Math.floor(Date.now() / 1e3);
	await deps.ready?.();
	const rejected = [];
	const items = [];
	const firstDay = addDays(await rawFromDay(deps.kv, s, now), 1);
	events.slice(0, 20).forEach((raw, i) => {
		const r = check(raw, i, now, firstDay, s.siteTimezone);
		if (typeof r === "string") rejected.push({
			index: i,
			reason: r
		});
		else items.push(r);
	});
	const since = visitDayKey(addDays(dayInZone(now, s.siteTimezone), -7));
	const sessions = await sessionsFor(db, site, [...new Set(items.flatMap((x) => x.sid ? [x.sid] : []))], since);
	const attached = [];
	for (const x of items) {
		const session = x.sid ? sessions.get(x.sid) : null;
		if (x.sid && !session) rejected.push({
			index: x.index,
			reason: "invalid_sid"
		});
		else attached.push({
			...x,
			session: session ?? null
		});
	}
	const ids = await Promise.all(attached.map((x) => (x.val !== null || x.void || x.refund) && x.oid ? orderHitId(site, x.name, x.oid) : null));
	const orderIds = [...new Set(ids.filter((id) => !!id))];
	/** Stored orders: their visit sid (null: stored without a visit) and, for refunds, the attribution and amount. */
	const stored = new Map(orderIds.length ? (await db.all(`SELECT id, ts, sday, sid, path, val, cur FROM ca_events WHERE site = ? AND id IN (${marks(orderIds.length)})`, [site, ...orderIds])).map((r) => [r.id, r]) : []);
	const refundIds = await Promise.all(attached.map((x, i) => x.refund ? refundRowId(ids[i], x.refund.rid) : null));
	const refunded = /* @__PURE__ */ new Map();
	const refundOrders = [...new Set(ids.filter((id, i) => id && attached[i]?.refund && stored.has(id)))];
	if (refundOrders.length) for (const r of await db.all(`SELECT id, val FROM ca_events WHERE site = ? AND (${refundOrders.map(() => "(id > ? AND id < ?)").join(" OR ")})`, [site, ...refundOrders.flatMap(refundRange)])) {
		const o = r.id.slice(0, r.id.lastIndexOf("."));
		refunded.set(o, (refunded.get(o) ?? /* @__PURE__ */ new Map()).set(r.id, -Number(r.val ?? 0)));
	}
	let accepted = 0;
	let duplicates = 0;
	const rows = [];
	const byId = /* @__PURE__ */ new Map();
	/** New entries per visit `(day, sid)`. */
	const visits = /* @__PURE__ */ new Map();
	const closed = lastClosedDay(now, s.siteTimezone);
	const fallback = siteSetting(s, deps.client, "defaultCurrency");
	const voided = [];
	attached.forEach((x, i) => {
		const orderId = ids[i];
		if (x.refund) {
			const o = stored.get(orderId);
			if (!o) return void rejected.push({
				index: x.index,
				reason: "unknown_order"
			});
			const id = refundIds[i];
			const done = refunded.get(o.id) ?? /* @__PURE__ */ new Map();
			if (done.has(id)) return void duplicates++;
			if (o.val === null || !o.cur) return void rejected.push({
				index: x.index,
				reason: "refund_exceeds_order"
			});
			if (x.cur && x.cur !== o.cur) return void rejected.push({
				index: x.index,
				reason: "currency_mismatch"
			});
			if (x.ts < Number(o.ts)) return void rejected.push({
				index: x.index,
				reason: "invalid_ts"
			});
			const amount = roundMinor(x.refund.amount, o.cur);
			if (amount <= 0) return void rejected.push({
				index: x.index,
				reason: "invalid_value"
			});
			const total = [...done.values()].reduce((a, b) => a + b, 0) + amount;
			if (roundMinor(total, o.cur) > roundMinor(Number(o.val), o.cur)) return void rejected.push({
				index: x.index,
				reason: "refund_exceeds_order"
			});
			refunded.set(o.id, done.set(id, amount));
			rows.push({
				site,
				id,
				day: dayInt(dayInZone(x.ts, s.siteTimezone)),
				ts: x.ts,
				sday: o.sday,
				sid: o.sid,
				name: x.name,
				path: o.path,
				props: null,
				val: -amount,
				cur: o.cur
			});
			accepted++;
			return;
		}
		const cur = x.val === null ? null : x.cur ?? fallback;
		const url = x.u ? normalizeUrl(x.u, s.queryAllowlist) : null;
		const sid = x.session?.sid ?? null;
		const row = {
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
			cur
		};
		if (x.void && !stored.has(orderId)) return void rejected.push({
			index: x.index,
			reason: "unknown_order"
		});
		if (x.void) voided.push(orderId);
		const earlier = orderId ? byId.get(orderId) : void 0;
		if (earlier) {
			Object.assign(earlier, {
				val: row.val,
				cur: row.cur,
				sday: earlier.sday ?? row.sday,
				sid: earlier.sid ?? row.sid
			});
			duplicates++;
			return;
		}
		rows.push(row);
		if (orderId) byId.set(orderId, row);
		if (orderId && stored.has(orderId)) {
			duplicates++;
			if (stored.get(orderId)?.sid !== null || !x.session) return;
		} else accepted++;
		if (!x.session) return;
		if (isoDay(x.session.day) <= closed) return void drops.add(site, dayInZone(now, s.siteTimezone), "late_after_close");
		const k = `${x.session.day}|${x.session.sid}`;
		const v = visits.get(k) ?? {
			ref: x.session,
			entries: []
		};
		const pr = x.props ? docJson(db.dialect, JSON.parse(x.props)) : void 0;
		v.entries.push([row.id, docObject(db.dialect, {
			t: s_`${x.ts} - started`,
			n: x.name,
			p: row.path,
			pr
		})]);
		visits.set(k, v);
	});
	const stmts = [
		...eventInserts(rows),
		...voided.map((o) => ({
			sql: "UPDATE ca_events SET val = NULL, cur = NULL WHERE site = ? AND id > ? AND id < ?",
			params: [site, ...refundRange(o)]
		})),
		...[...visits.values()].map(({ ref, entries }) => s_`UPDATE ca_sessions SET hits = ${docPut(db.dialect, "hits", entries)}, events = events + ${entries.length} WHERE site = ${site} AND day = ${visitDayKey(isoDay(ref.day))} AND sid = ${ref.sid}`)
	];
	if (stmts.length) await db.batch(stmts);
	return {
		accepted,
		duplicates,
		rejected: rejected.sort((a, b) => a.index - b.index)
	};
}
// src/keys/token.ts
/** API key tokens: `<8 char prefix>.<secret>`, the secret is 32 random bytes in base64url. */
const TOKEN_RE = /^([a-z0-9]{8})\.([A-Za-z0-9_-]{43})$/;
function generateToken() {
	const prefix = randomId(8);
	const secret = base64url(crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)));
	return {
		prefix,
		secret,
		token: `${prefix}.${secret}`
	};
}
/** Prefix and secret of a well formed token, else null. */
function parseToken(raw) {
	const m = TOKEN_RE.exec(raw?.trim() ?? "");
	return m ? {
		prefix: m[1],
		secret: m[2]
	} : null;
}
/** Hex SHA-256 of the secret; 256 bits of entropy make a slow or salted hash unnecessary. */
async function hashSecret(secret) {
	return [...await sha256(secret)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const view = (id, k) => {
	const { hash: _h, ...rest } = k;
	return {
		id,
		...rest
	};
};
async function createKey(coll, input, now) {
	let t = generateToken();
	if ((await coll.query({
		where: { prefix: t.prefix },
		limit: 1
	})).items.length) t = generateToken();
	const key = {
		label: input.label,
		prefix: t.prefix,
		hash: await hashSecret(t.secret),
		scopes: [...new Set(input.scopes)],
		sites: [...new Set(input.sites ?? [])],
		created: now,
		expires: input.expires ?? null,
		last_used: null,
		revoked: false
	};
	const id = randomId(16);
	await coll.put(id, key);
	return {
		token: t.token,
		key: view(id, key)
	};
}
async function listKeys(coll) {
	const { items } = await coll.query({ limit: 100 });
	return items.map((i) => view(i.id, i.data)).sort((a, b) => b.created - a.created);
}
async function revokeKey(coll, id) {
	const r = await coll.updateIf(id, {
		where: {},
		set: { revoked: true }
	});
	if (!r.applied) return null;
	return view(id, {
		...r.data ?? await coll.get(id),
		revoked: true
	});
}
/** The key behind an `X-Api-Key` value, or null for missing, malformed, unknown, wrong, revoked and expired tokens alike. */
async function verifyKey(coll, header, now) {
	const parsed = parseToken(header);
	if (!parsed) return null;
	const { items } = await coll.query({
		where: { prefix: parsed.prefix },
		limit: 1
	});
	const hit = items[0];
	const hash = await hashSecret(parsed.secret);
	const key = hit?.data;
	if (!hit || !key || !timingSafeEqual(hash, key.hash) || key.revoked || key.expires !== null && key.expires <= now) return null;
	if (key.last_used === null || now - key.last_used >= 600) await coll.updateIf(hit.id, {
		where: {},
		set: { last_used: now }
	});
	return {
		id: hit.id,
		scopes: key.scopes,
		sites: key.sites
	};
}
// src/query/reports/audience.ts
const by = (col) => (rc, input) => sessionBreakdown(rc, input, `COALESCE(s.${col}, '(not set)')`);
const countries = by("country");
const regions = by("region");
const devices = by("device");
const browsers = by("browser");
const os = by("os");
const languages = by("lang");
// src/query/reports/behaviour.ts
/** Funnels read at most this many sessions per query. */
const FUNNEL_SESSION_CAP = 5e4;
const EV_KEYS_MAX = 10;
const EV_VALUES_MAX = 50;
const compileCtx = (rc, input) => ({
	db: rc.db,
	site: rc.site,
	from: input.from,
	to: input.to,
	goals: rc.goals
});
/** Custom events (reserved `_` names have their own reports): count, sessions, share of sessions. */
async function events(rc, input) {
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "ev", {
		sql: `${h.name} NOT LIKE '\\_%' ESCAPE '\\'`,
		params: []
	});
	const rows = await rc.db.all(`SELECT ${h.name} AS key, COUNT(*) AS events, COUNT(DISTINCT s.sid) AS sessions ${j.sql} GROUP BY ${h.name} ORDER BY events DESC, key LIMIT ? OFFSET ?`, [
		...j.params,
		input.limit + 1,
		input.offset
	]);
	const total = (await sessionTotals(rc, input)).sessions ?? 0;
	return {
		rows: rows.slice(0, input.limit).map((r) => ({
			key: String(r.key),
			events: num$2(r.events),
			sessions: num$2(r.sessions),
			rate: round(ratio(num$2(r.sessions), total))
		})),
		truncated: rows.length > input.limit,
		total_sessions: total
	};
}
/** Property breakdown of one event: up to 10 keys and 50 values per key. */
async function eventProps(rc, input) {
	const name = input.params.event;
	if (!name) throw new QueryError("invalid_params", "event_props needs params.event.");
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "ev", {
		sql: `${h.name} = ?`,
		params: [name]
	});
	const each = rc.db.dialect === "postgres" ? {
		from: ", jsonb_each_text(h.value -> 'pr') AS p",
		key: "p.key",
		value: "p.value"
	} : {
		from: ", json_each(h.value, '$.pr') AS p",
		key: "p.key",
		value: "CAST(p.value AS TEXT)"
	};
	const head = `FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)}`;
	const sql = j.sql.replace(head, `${head}${each.from}`);
	const rows = await rc.db.all(`SELECT ${each.key} AS prop, ${each.value} AS value, COUNT(*) AS n ${sql} GROUP BY ${each.key}, ${each.value} ORDER BY n DESC, prop, value LIMIT 5000`, j.params);
	const perKey = /* @__PURE__ */ new Map();
	for (const r of rows) {
		const k = String(r.prop);
		const e = perKey.get(k) ?? {
			total: 0,
			values: []
		};
		e.total += num$2(r.n);
		if (e.values.length < EV_VALUES_MAX) e.values.push({
			value: r.value == null ? "" : String(r.value),
			count: num$2(r.n)
		});
		perKey.set(k, e);
	}
	return {
		rows: [...perKey].sort((a, b) => b[1].total - a[1].total || (a[0] < b[0] ? -1 : 1)).slice(0, EV_KEYS_MAX).flatMap(([prop, e]) => e.values.map((v) => ({
			key: `${prop}=${v.value}`,
			prop,
			value: v.value,
			count: v.count
		}))),
		truncated: perKey.size > EV_KEYS_MAX
	};
}
/** Goals: completions, converting sessions, conversion rate over the filtered session count. */
async function goals(rc, input) {
	const total = (await sessionTotals(rc, input)).sessions ?? 0;
	const cc = compileCtx(rc, input);
	const active = rc.goals.filter((x) => x.active !== false);
	const parts = [];
	for (const [i, g] of active.entries()) {
		const where = and([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), await goalPredicate(cc, g, "h")]);
		parts.push({
			sql: `SELECT ${i} AS g, COUNT(*) AS completions, COUNT(DISTINCT s.sid) AS converting FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql}`,
			params: where.params
		});
	}
	const got = /* @__PURE__ */ new Map();
	for (const group of goalGroups(parts)) for (const r of await rc.db.all(group.map((p) => p.sql).join(" UNION ALL "), group.flatMap((p) => p.params))) got.set(num$2(r.g), r);
	const rows = active.map((g, i) => {
		const r = got.get(i);
		const converting = num$2(r?.converting);
		return {
			key: g.name,
			type: g.type,
			completions: num$2(r?.completions),
			converting,
			conversion_rate: round(ratio(converting, total))
		};
	});
	rows.sort((a, b) => num$2(b.converting) - num$2(a.converting) || (a.key < b.key ? -1 : 1));
	return {
		rows,
		total_sessions: total
	};
}
/** Strict funnels walk every countable hit in JS, so they read fewer sessions. */
const FUNNEL_STRICT_SESSION_CAP = 1e4;
/**
* Funnel within one session by hit time, 2 to 6 steps: sequential (default), strict or flexible.
* With `params.withRevenue` and orders in the range, each step adds the revenue of the sessions that reached it
* (`funnelRevenue`); without orders in the range the revenue keys are absent.
*/
async function funnels(rc, input) {
	const def = input.params.steps ? {
		name: "custom",
		steps: input.params.steps,
		mode: input.params.mode
	} : input.params.funnel ? rc.funnels[input.params.funnel] : void 0;
	if (!def) throw new QueryError(input.params.funnel ? "unknown_funnel" : "invalid_params", "funnels needs params.funnel or params.steps.");
	const mode = def.mode ?? "sequential";
	const total = (await sessionTotals(rc, input)).sessions ?? 0;
	if (mode === "strict" && total > 1e4) throw new QueryError("funnel_cap", `Strict funnels read at most ${FUNNEL_STRICT_SESSION_CAP} sessions; this range has ${total}. Narrow the range, add filters or use the sequential mode.`);
	if (total > 5e4) throw new QueryError("funnel_cap", `Funnels read at most ${FUNNEL_SESSION_CAP} sessions; this range has ${total}. Narrow the range or add filters.`);
	const cur = input.params.withRevenue ? currencyOf(rc, input) : null;
	const depth = cur !== null && await ordersInRange(rc, input) ? /* @__PURE__ */ new Map() : void 0;
	const cc = compileCtx(rc, input);
	const preds = [];
	for (const step of def.steps) preds.push(await goalPredicate(cc, step, "h"));
	const reached = mode === "flexible" ? await funnelFlexible(rc, input, preds, depth) : mode === "strict" ? await funnelStrict(rc, input, preds, depth) : await funnelSequential(rc, input, preds, depth);
	const first = reached[0] ?? 0;
	const data = {
		rows: def.steps.map((s, i) => ({
			key: String(i + 1),
			label: s.label ?? `${s.type} ${s.match} ${s.value}`,
			sessions: reached[i] ?? 0,
			drop_off: i === 0 ? null : round(ratio((reached[i - 1] ?? 0) - (reached[i] ?? 0), reached[i - 1] ?? 0)),
			conversion: round(ratio(reached[i] ?? 0, first))
		})),
		name: def.name,
		total_sessions: total,
		mode
	};
	return cur !== null && depth ? funnelRevenue(rc, input, cur, depth, data) : data;
}
/** Any order or refund row of the site in the range (through the partial index on `val`). */
async function ordersInRange(rc, input) {
	const [r] = await rc.db.all("SELECT 1 AS x FROM ca_events WHERE site = ? AND day BETWEEN ? AND ? AND val IS NOT NULL LIMIT 1", [
		rc.site,
		dayInt(input.from),
		dayInt(input.to)
	]);
	return !!r;
}
/** Visit keys per bound JSON parameter of the funnel revenue lookup. */
const FUNNEL_SIDS_PER_PARAM = 1e3;
/** Visit keys per revenue statement: the site and two days leave the rest of the D1 limit to the key lists (97,000, above the session cap, so one statement). */
const funnelSidStatements = (keys, perParam = FUNNEL_SIDS_PER_PARAM) => chunk(keys, perParam * 97);
/**
* Revenue per step: every order and refund in the range (each on its own day) of the sessions that reached the step,
* in one currency, whether the order came before or after the step. One statement over the visit keys that reached
* step 1, grouped by visit and currency, summed per step in JS. `est_lost_revenue` is an estimate: the sessions that
* left before the step, valued at the revenue per session of the sessions that reached the last step.
*/
async function funnelRevenue(rc, input, cur, depth, data) {
	const rows = data.rows ?? [];
	const n = rows.length;
	const steps = Array.from({ length: n }, () => /* @__PURE__ */ new Map());
	for (const part of funnelSidStatements([...depth.keys()])) {
		const keys = inList(rc.db.dialect, "(h.sday || '|' || h.sid)", part, false, FUNNEL_SIDS_PER_PARAM);
		const found = await rc.db.all(`SELECT h.sday || '|' || h.sid AS sid, h.cur AS cur, ${ORDER_SUMS} FROM ca_events h WHERE h.site = ? AND h.day BETWEEN ? AND ? AND h.val IS NOT NULL AND (${keys.sql}) GROUP BY h.sday, h.sid, h.cur`, [
			rc.site,
			dayInt(input.from),
			dayInt(input.to),
			...keys.params
		]);
		for (const r of found) {
			const code = String(r.cur);
			for (let i = 0; i < (depth.get(String(r.sid)) ?? 0); i++) {
				const s = steps[i]?.get(code) ?? {
					orders: 0,
					revenue: 0,
					refunds: 0,
					sessions: 0
				};
				s.orders += num$2(r.orders);
				s.revenue += num$2(r.revenue);
				s.refunds += num$2(r.refunds);
				s.sessions += num$2(r.sessions);
				steps[i]?.set(code, s);
			}
		}
	}
	const list = currencyList([...steps[0] ?? /* @__PURE__ */ new Map()].map(([c, s]) => ({
		cur: c,
		...s
	})), null, cur);
	const own = steps.map((m) => m.get(cur));
	const withRefunds = own.some((s) => (s?.refunds ?? 0) > 0);
	const lastSessions = num$2(rows[n - 1]?.sessions);
	const perCompleter = ratio(roundMinor(own[n - 1]?.revenue ?? 0, cur), lastSessions);
	return {
		...data,
		...metaOf(list, cur),
		rows: rows.map((row, i) => {
			const revenue = roundMinor(own[i]?.revenue ?? 0, cur);
			const refunds = roundMinor(own[i]?.refunds ?? 0, cur);
			const orders = own[i]?.orders ?? 0;
			const left = i === 0 ? 0 : num$2(rows[i - 1]?.sessions) - num$2(row.sessions);
			return {
				...row,
				revenue,
				...withRefunds ? {
					refunds,
					net_revenue: roundMinor(revenue - refunds, cur)
				} : {},
				orders,
				aov: orders > 0 ? roundMinor(revenue / orders, cur) : null,
				paying_sessions: own[i]?.sessions ?? 0,
				revenue_per_session: round(ratio(revenue, num$2(row.sessions))),
				est_lost_revenue: i === 0 || perCompleter === null ? null : roundMinor(left * perCompleter, cur),
				revenue_currency: cur
			};
		})
	};
}
/** Entries of the filtered sessions in range matching `extra`, with one `m<i>` flag per step, ordered by visit, time and key. */
async function stepHits(rc, input, preds, extra) {
	const h = entryCols(rc.db.dialect);
	const cases = preds.map((p, i) => ({
		sql: `CASE WHEN ${p.sql} THEN 1 ELSE 0 END AS m${i}`,
		params: p.params
	}));
	const where = and([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), extra]);
	return rc.db.all(`SELECT s.day || '|' || s.sid AS sid, ${h.ts} AS ts, ${cases.map((c) => c.sql).join(", ")} FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql} ORDER BY s.day, s.sid, ts, ${h.id}`, [...cases.flatMap((c) => c.params), ...where.params]);
}
const anyStep = (preds) => ({
	sql: preds.map((p) => `(${p.sql})`).join(" OR "),
	params: preds.flatMap((p) => p.params)
});
/** Groups of one session's hits sharing a second (hit times are whole seconds). */
function* secondGroups(rows) {
	let i = 0;
	while (i < rows.length) {
		const sid = rows[i]?.sid;
		const ts = rows[i]?.ts;
		const group = [];
		while (i < rows.length && rows[i]?.sid === sid && rows[i]?.ts === ts) group.push(rows[i++]);
		yield {
			sid,
			group,
			last: rows[i]?.sid !== sid
		};
	}
}
/** Consume hits of one same-second group for consecutive steps from `step`, in any order; returns the new step. */
function advance(group, step, n) {
	for (let progress = true; progress && step < n;) {
		progress = false;
		for (const [k, r] of group.entries()) if (r && step < n && num$2(r[`m${step}`]) === 1) {
			step++;
			group[k] = null;
			progress = true;
		}
	}
	return step;
}
/** Sequential: step n is any later matching hit of the session. */
async function funnelSequential(rc, input, preds, depth) {
	const rows = await stepHits(rc, input, preds, anyStep(preds));
	const reached = new Array(preds.length).fill(0);
	let step = 0;
	for (const { sid, group, last } of secondGroups(rows)) {
		const next = advance(group, step, preds.length);
		for (let k = step; k < next; k++) reached[k] = (reached[k] ?? 0) + 1;
		if (last && next > 0) depth?.set(String(sid), next);
		step = last ? 0 : next;
	}
	return reached;
}
/**
* Strict: step n must be the next countable hit after the step n-1 hit (pageviews, user events and any
* hit matching a step). A second without the next step breaks the chain, which may restart there; a
* session counts the furthest chain. Hits sharing a second are simultaneous and never break it.
*/
async function funnelStrict(rc, input, preds, depth) {
	const h = entryCols(rc.db.dialect);
	const rows = await stepHits(rc, input, preds, {
		sql: `${h.pv} OR (${h.ev} AND ${h.name} NOT LIKE '\\_%' ESCAPE '\\') OR ${anyStep(preds).sql}`,
		params: anyStep(preds).params
	});
	const n = preds.length;
	const reached = new Array(n).fill(0);
	let step = 0;
	let best = 0;
	for (const { sid, group, last } of secondGroups(rows)) {
		if (step < n) {
			const next = advance(group, step, n);
			step = next > step || step === 0 ? next : advance(group, 0, n);
			best = Math.max(best, step);
		}
		if (last) {
			for (let k = 0; k < best; k++) reached[k] = (reached[k] ?? 0) + 1;
			if (best > 0) depth?.set(String(sid), best);
			step = 0;
			best = 0;
		}
	}
	return reached;
}
/**
* Flexible: step n counts sessions that completed steps 1 to n in any order; one statement, no walk. With `depth`
* the same statement returns one row per visit instead of the sums, for the revenue lookup.
*/
async function funnelFlexible(rc, input, preds, depth) {
	const flags = preds.map((p, i) => ({
		sql: `MAX(CASE WHEN ${p.sql} THEN 1 ELSE 0 END) AS f${i}`,
		params: p.params
	}));
	const where = and([sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE), anyStep(preds)]);
	const params = [...flags.flatMap((f) => f.params), ...where.params];
	if (depth) {
		const rows = await rc.db.all(`SELECT s.day || '|' || s.sid AS sid, ${flags.map((f) => f.sql).join(", ")} FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql} GROUP BY s.day, s.sid`, params);
		const reached = new Array(preds.length).fill(0);
		for (const r of rows) {
			let k = 0;
			for (; k < preds.length && num$2(r[`f${k}`]) === 1; k++) reached[k] = (reached[k] ?? 0) + 1;
			if (k > 0) depth.set(String(r.sid), k);
		}
		return reached;
	}
	const sums = preds.map((_, i) => `SUM(CASE WHEN ${preds.slice(0, i + 1).map((_p, j) => `t.f${j} = 1`).join(" AND ")} THEN 1 ELSE 0 END) AS r${i}`);
	const [r] = await rc.db.all(`SELECT ${sums.join(", ")} FROM (SELECT ${flags.map((f) => f.sql).join(", ")} FROM ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)} WHERE ${where.sql} GROUP BY s.day, s.sid) t`, params);
	return preds.map((_, i) => num$2(r?.[`r${i}`]));
}
/** Reserved auto event by its fixed property: outbound `url`, download `file`, form `form`. */
function reserved(name, prop) {
	return async (rc, input) => {
		const v = entryProp(rc.db.dialect, "h", prop);
		const j = hitJoin(rc, input, "ev", {
			sql: `${entryCols(rc.db.dialect).name} = ?`,
			params: [name]
		});
		const rows = await rc.db.all(`SELECT COALESCE(${v}, '(not set)') AS key, COUNT(*) AS events, COUNT(DISTINCT s.sid) AS sessions ${j.sql} GROUP BY COALESCE(${v}, '(not set)') ORDER BY events DESC, key LIMIT ? OFFSET ?`, [
			...j.params,
			input.limit + 1,
			input.offset
		]);
		return {
			rows: rows.slice(0, input.limit).map((r) => ({
				key: String(r.key),
				events: num$2(r.events),
				sessions: num$2(r.sessions)
			})),
			truncated: rows.length > input.limit
		};
	};
}
const outbound = reserved("_outbound", "url");
const downloads = reserved("_download", "file");
const forms = reserved("_form", "form");
const SCROLL_BUCKETS = [
	0,
	25,
	50,
	75,
	100
];
/** Pageviews by maximum scroll depth bucket (0, 25, 50, 75, 100). */
async function scroll(rc, input) {
	const sc = entryCols(rc.db.dialect).scroll;
	const j = hitJoin(rc, input, "pv", {
		sql: `${sc} IS NOT NULL`,
		params: []
	});
	const bucket = `CASE WHEN ${sc} >= 100 THEN 100 WHEN ${sc} >= 75 THEN 75 WHEN ${sc} >= 50 THEN 50 WHEN ${sc} >= 25 THEN 25 ELSE 0 END`;
	const rows = await rc.db.all(`SELECT ${bucket} AS b, COUNT(*) AS n ${j.sql} GROUP BY ${bucket}`, j.params);
	const counts = new Map(rows.map((r) => [num$2(r.b), num$2(r.n)]));
	const total = [...counts.values()].reduce((a, b) => a + b, 0);
	return { rows: SCROLL_BUCKETS.map((b) => ({
		key: String(b),
		pageviews: counts.get(b) ?? 0,
		share: round(ratio(counts.get(b) ?? 0, total))
	})) };
}
// src/query/reports/satisfaction.ts
/**
* Satisfaction reports: long and short clicks, bad experience, estimated pogo-sticking, returns to
* search, search re-entry and the back/forward load share, over organic search sessions only (the dispatcher adds
* the scope channel is Organic Search to every run, see `organicScope`). Classified at query time from `ca_sessions` and the page view
* entries of its document
* with the thresholds of the moment, so a changed threshold reclassifies every stored session at once.
*/
/** Session column per `params.by`; `entry` is the landing page table. */
const BY_COL = {
	entry: "s.entry_path",
	source: "COALESCE(s.source, '(not set)')",
	device: "COALESCE(s.device, '(not set)')",
	country: "COALESCE(s.country, '(not set)')",
	browser: "COALESCE(s.browser, '(not set)')"
};
const COUNTS = [
	"sessions",
	"measured",
	"duration_ms",
	"long_clicks",
	"short_clicks",
	"bad_experiences",
	"search_sessions",
	"search_measured",
	"pogo_sticks",
	"reentered",
	"returned_from_search",
	"engaged_ms"
];
/** Thresholds in seconds: long click `L` and the effective bad experience threshold `B' = min(bad, L)`. */
function thresholds(rc) {
	const long = rc.settings.longClickSeconds ?? DEFAULT_SETTINGS.longClickSeconds;
	return {
		long,
		bad: Math.min(rc.settings.badExperienceSeconds ?? DEFAULT_SETTINGS.badExperienceSeconds, long)
	};
}
/**
* Per-session classification in an inner query, counted per key (and day) outside. The landing exit is read
* only for single-page sessions, from their one page view entry.
*/
function countsSql(rc, input, keyExpr, byDay) {
	const where = sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? TRUE);
	const d = rc.db.dialect;
	const x = entryCols(d, "x");
	const pvs = `FROM ${entriesOf(d, "x")} WHERE ${x.pv}`;
	const { long, bad } = thresholds(rc);
	const group = [keyExpr ? "t.key" : null, byDay ? "t.day" : null].filter(Boolean);
	const inner = `SELECT ${keyExpr ? `${keyExpr} AS key, ` : ""}s.day AS day, ${DURATION_MS} AS dur,
CASE WHEN s.visible_ms > 0 THEN 1 ELSE 0 END AS m,
CASE WHEN s.channel = 'Organic Search' THEN 1 ELSE 0 END AS se,
CASE WHEN s.pageviews = 1 AND s.events = 0 THEN 1 ELSE 0 END AS single,
s.interacted AS inter, s.reentries AS re, s.engaged_ms AS eng,
CASE WHEN s.pageviews = 1 THEN (SELECT MAX(${x.exit}) ${pvs}) END AS lexit,
CASE WHEN s.reentries > 0 THEN (SELECT ${x.exit} ${pvs} ORDER BY ${x.ts}, ${x.id} LIMIT 1) END AS fexit
FROM ca_sessions s WHERE ${where.sql}`;
	return {
		sql: `SELECT ${group.map((g) => `${g} AS ${g?.slice(2)}, `).join("")}COUNT(*) AS sessions, SUM(t.m) AS measured, SUM(t.dur) AS duration_ms,
SUM(CASE WHEN t.m = 1 AND t.dur > ? THEN 1 ELSE 0 END) AS long_clicks,
SUM(CASE WHEN t.m = 1 AND t.dur <= ? THEN 1 ELSE 0 END) AS short_clicks,
SUM(CASE WHEN t.m = 1 AND t.single = 1 AND t.inter = 0 AND t.dur < ? THEN 1 ELSE 0 END) AS bad_experiences,
SUM(t.se) AS search_sessions,
SUM(CASE WHEN t.se = 1 AND t.m = 1 THEN 1 ELSE 0 END) AS search_measured,
SUM(CASE WHEN t.se = 1 AND t.m = 1 AND t.single = 1 AND t.dur <= ? AND t.lexit = 2 THEN 1 ELSE 0 END) AS pogo_sticks,
SUM(CASE WHEN t.se = 1 AND t.re > 0 THEN 1 ELSE 0 END) AS reentered,
SUM(CASE WHEN t.se = 1 AND t.re > 0 AND t.fexit = 2 THEN 1 ELSE 0 END) AS returned_from_search,
SUM(t.eng) AS engaged_ms
FROM (${inner}) t${group.length ? ` GROUP BY ${group.join(", ")}` : ""}`,
		params: [
			long * 1e3,
			long * 1e3,
			bad * 1e3,
			long * 1e3,
			...where.params
		]
	};
}
const counts = (r) => Object.fromEntries(COUNTS.map((c) => [c, num$2(r?.[c])]));
/**
* Page score (docs/sessions.md "Best and worst pages"): long click rate minus bad experience rate minus pogo-sticking
* rate, from the raw counts; a page without measured search sessions counts its pogo-sticking rate as 0. Null when
* nothing is measured.
*/
function score(c) {
	if (!c.measured) return null;
	return round((c.long_clicks - c.bad_experiences) / c.measured - (c.search_measured ? c.pogo_sticks / c.search_measured : 0));
}
/** Satisfaction rates; every rate leaves unmeasured sessions out of its denominator. */
function rates(c) {
	return {
		sessions: c.sessions,
		measured: c.measured,
		search_sessions: c.search_sessions,
		search_measured: c.search_measured,
		avg_duration: round(ratio(c.duration_ms / 1e3, c.sessions), 1),
		avg_engaged: round(ratio(c.engaged_ms / 1e3, c.sessions), 1),
		measured_rate: round(ratio(c.measured, c.sessions)),
		long_clicks: c.long_clicks,
		short_clicks: c.short_clicks,
		bad_experiences: c.bad_experiences,
		pogo_sticks: c.pogo_sticks,
		reentered: c.reentered,
		returned_from_search: c.returned_from_search,
		pct_long: round(ratio(c.long_clicks, c.measured)),
		pct_short: round(ratio(c.short_clicks, c.measured)),
		pct_bad: round(ratio(c.bad_experiences, c.measured)),
		pogo_stick_rate: round(ratio(c.pogo_sticks, c.search_measured)),
		returned_from_search_rate: round(ratio(c.returned_from_search, c.search_sessions)),
		search_reentry_rate: round(ratio(c.reentered, c.search_sessions)),
		score: score(c)
	};
}
/** Back/forward loads per path: `nav = 2` over pageviews with a known navigation type (full loads only). */
async function backNav(rc, input, keys) {
	const h = entryCols(rc.db.dialect);
	const j = hitJoin(rc, input, "pv", keys ? keysIn(rc, h.path, keys) : TRUE);
	const cols = `SUM(CASE WHEN ${h.nav} = 2 THEN 1 ELSE 0 END) AS bf, COUNT(${h.nav}) AS loads`;
	return (await rc.db.all(keys ? `SELECT ${h.path} AS key, ${cols} ${j.sql} GROUP BY ${h.path}` : `SELECT ${cols} ${j.sql}`, j.params)).map((r) => ({
		key: r.key == null ? "" : String(r.key),
		rate: round(ratio(num$2(r.bf), num$2(r.loads)))
	}));
}
/** Score order of `params.rank` over the grouped counts `g`; `1.0 *` keeps the division real on every dialect. */
const SCORE_SQL = "(1.0 * (g.long_clicks - g.bad_experiences) / g.measured - CASE WHEN g.search_measured > 0 THEN 1.0 * g.pogo_sticks / g.search_measured ELSE 0 END)";
/**
* Landing page table plus totals; `params.by` groups by a session dimension instead of the landing page,
* and `params.rank` (`best` | `worst`) orders landing pages with at least `SATISFACTION_MIN_MEASURED` measured sessions
* by score. A ranked compare run reads the previous period's busiest landing pages unranked, so a ranked page finds
* its previous row by key (shortcut: up to 1000 pages; a page outside them shows no previous value).
*/
async function satisfaction(rc, input) {
	const byName = input.params.by ?? "entry";
	if (!SATISFACTION_BY.includes(byName)) throw new QueryError("invalid_params", `satisfaction params.by is one of ${SATISFACTION_BY.join(", ")}.`);
	const rank = input.params.rank;
	if (rank && byName !== "entry") throw new QueryError("invalid_params", "satisfaction params.rank ranks landing pages; leave params.by out or set it to entry.");
	const by = countsSql(rc, input, BY_COL[byName], false);
	const ranked = rank && !input.isCompare;
	const limit = rank && input.isCompare ? 1e3 : input.limit;
	const rows = ranked ? await rc.db.all(`SELECT g.* FROM (${by.sql}) g WHERE g.measured >= ? ORDER BY ${SCORE_SQL} ${rank === "best" ? "DESC" : "ASC"}, g.sessions DESC, g.key LIMIT ? OFFSET ?`, [
		...by.params,
		30,
		limit + 1,
		input.offset
	]) : await rc.db.all(`${by.sql} ORDER BY sessions DESC, key LIMIT ? OFFSET ?`, [
		...by.params,
		limit + 1,
		input.offset
	]);
	const page = rows.slice(0, limit);
	const keys = byName === "entry" ? page.map((r) => String(r.key)) : [];
	const bf = new Map(keys.length ? (await backNav(rc, input, keys)).map((r) => [r.key, r.rate]) : []);
	const tot = countsSql(rc, input, null, false);
	const [t] = await rc.db.all(tot.sql, tot.params);
	const [tb] = await backNav(rc, input, null);
	const { long, bad } = thresholds(rc);
	return {
		totals: {
			...rates(counts(t)),
			back_nav_rate: tb?.rate ?? null
		},
		rows: page.map((r) => ({
			key: String(r.key),
			...rates(counts(r)),
			back_nav_rate: bf.get(String(r.key)) ?? null
		})),
		truncated: rows.length > limit,
		thresholds: {
			long_click_seconds: long,
			bad_experience_seconds: bad
		},
		...rank ? { min_measured: 30 } : {}
	};
}
/** Daily (or weekly) rates, zero-filled; `hour` is answered per day with a notice. */
async function satisfactionSeries(rc, input) {
	const asked = resolveGranularity(input.granularity, input.from, input.to);
	const gran = asked === "hour" ? "day" : asked;
	const q = countsSql(rc, input, null, true);
	const buckets = /* @__PURE__ */ new Map();
	for (const day of eachDay(input.from, input.to)) buckets.set(gran === "week" ? weekStart(day) : day, counts(void 0));
	for (const r of await rc.db.all(q.sql, q.params)) {
		const day = isoDay(r.day);
		const b = buckets.get(gran === "week" ? weekStart(day) : day);
		if (!b) continue;
		const c = counts(r);
		for (const k of COUNTS) b[k] += c[k];
	}
	const series = [...buckets].map(([t, c]) => {
		const { pct_long, pct_short, pct_bad, pogo_stick_rate, returned_from_search_rate, avg_engaged, sessions, measured, long_clicks, short_clicks, bad_experiences, pogo_sticks } = rates(c);
		return {
			t,
			pct_long,
			pct_short,
			pct_bad,
			pogo_stick_rate,
			returned_from_search_rate,
			avg_engaged,
			sessions,
			measured,
			long_clicks,
			short_clicks,
			bad_experiences,
			pogo_sticks,
			search_measured: c.search_measured
		};
	});
	if (input.isCompare) return {
		series,
		granularity: gran
	};
	const { long, bad } = thresholds(rc);
	return {
		series,
		granularity: gran,
		thresholds: {
			long_click_seconds: long,
			bad_experience_seconds: bad
		},
		annotations: annotationsIn(rc, input.from, input.to),
		notices: asked === "hour" ? ["granularity_day"] : []
	};
}
// src/query/reports/search.ts
/** Search reports over `ca_search_daily`. Position is `SUM(pos_sum) / SUM(impressions)`. */
const GRAIN_DIMS = [
	"page",
	"query",
	"country",
	"device"
];
const COLUMN = {
	page: "d.page_key",
	query: "d.query",
	country: "d.country",
	device: "d.device"
};
/** Stored grains, smallest first: totals, page, query, country, device, page with query. */
const GRAINS = [
	[],
	["page"],
	["query"],
	["country"],
	["device"],
	["page", "query"]
];
/** Rows of the smallest stored grain that holds every needed dimension. */
function grainPredicate(needs) {
	const grain = GRAINS.find((g) => [...needs].every((n) => g.includes(n)));
	if (!grain) throw new QueryError("unsupported_filter", `Search data has no breakdown by ${[...needs].join(" and ")} together.`);
	return {
		sql: GRAIN_DIMS.map((d) => `${COLUMN[d]} ${grain.includes(d) ? "<> ''" : "= ''"}`).join(" AND "),
		params: []
	};
}
function searchWhere(rc, input, group, extra = TRUE) {
	const s = input.search;
	const needs = new Set(s?.needs ?? []);
	if (group) needs.add(group);
	const source = input.params.source && input.params.source !== "all" ? {
		sql: "d.source = ?",
		params: [input.params.source]
	} : TRUE;
	return and([
		{
			sql: "d.site = ? AND d.day BETWEEN ? AND ?",
			params: [
				rc.site,
				input.from,
				input.to
			]
		},
		grainPredicate(needs),
		source,
		s?.pred ?? TRUE,
		extra
	]);
}
const SUMS = "SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum";
function searchMetrics(r) {
	const clicks = num$2(r.clicks);
	const impressions = num$2(r.impressions);
	return {
		clicks,
		impressions,
		ctr: round(ratio(clicks, impressions)),
		position: round(ratio(num$2(r.pos_sum), impressions), 2)
	};
}
const notices = (input) => input.search?.ignored.length ? ["filters_not_applied"] : [];
/** Totals and a zero-filled daily series, with annotations (current run). */
async function searchOverview(rc, input) {
	const w = searchWhere(rc, input, null);
	const rows = await rc.db.all(`SELECT d.day AS day, ${SUMS} FROM ca_search_daily d WHERE ${w.sql} GROUP BY d.day`, w.params);
	const byDay = new Map(rows.map((r) => [String(r.day), r]));
	const total = {
		clicks: 0,
		impressions: 0,
		pos_sum: 0
	};
	for (const r of rows) {
		total.clicks += num$2(r.clicks);
		total.impressions += num$2(r.impressions);
		total.pos_sum += num$2(r.pos_sum);
	}
	const series = eachDay(input.from, input.to).map((t) => ({
		t,
		...searchMetrics(byDay.get(t) ?? {})
	}));
	const out = {
		totals: searchMetrics(total),
		series,
		notices: notices(input)
	};
	if (!input.isCompare) out.annotations = annotationsIn(rc, input.from, input.to);
	return out;
}
function breakdown(group, extra) {
	return async (rc, input) => {
		const col = COLUMN[group];
		const w = searchWhere(rc, input, group, extra?.(input));
		const rows = await rc.db.all(`SELECT ${col} AS key, ${SUMS} FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${col} ORDER BY clicks DESC, impressions DESC, key LIMIT ? OFFSET ?`, [
			...w.params,
			input.limit + 1,
			input.offset
		]);
		return {
			rows: rows.slice(0, input.limit).map((r) => ({
				key: String(r.key),
				...searchMetrics(r)
			})),
			truncated: rows.length > input.limit,
			notices: notices(input)
		};
	};
}
const searchQueries = breakdown("query");
const searchPages = breakdown("page");
const searchCountries = breakdown("country");
const searchDevices = breakdown("device");
/**
* Queries of one page key: Google from the stored page with query rows, Bing on demand through
* `rc.bingPageQueries` (one provider call, cached one hour). With `all` both are merged per query.
* Search filters do not apply to the Bing rows (`filters_not_applied`).
*/
async function searchPageQueries(rc, input) {
	if (!input.params.page) throw new QueryError("invalid_params", "search_page_queries needs params.page.");
	const page = input.params.page;
	const source = input.params.source ?? "all";
	const pageInput = {
		...input,
		search: {
			pred: input.search?.pred ?? TRUE,
			ignored: input.search?.ignored ?? [],
			needs: /* @__PURE__ */ new Set([...input.search?.needs ?? [], "page"])
		}
	};
	const stored = breakdown("query", () => ({
		sql: "d.page_key = ?",
		params: [page]
	}));
	if (source === "google" || !rc.bingPageQueries) return stored(rc, pageInput);
	const google = source === "all" ? await stored(rc, {
		...pageInput,
		limit: 1e3,
		offset: 0
	}) : { rows: [] };
	const sums = /* @__PURE__ */ new Map();
	const add = (q, r) => {
		const cur = sums.get(q) ?? {
			clicks: 0,
			impressions: 0,
			pos_sum: 0
		};
		sums.set(q, {
			clicks: cur.clicks + r.clicks,
			impressions: cur.impressions + r.impressions,
			pos_sum: cur.pos_sum + r.pos_sum
		});
	};
	for (const r of google.rows ?? []) add(r.key, {
		clicks: num$2(r.clicks),
		impressions: num$2(r.impressions),
		pos_sum: num$2(r.position) * num$2(r.impressions)
	});
	let live;
	try {
		live = await rc.bingPageQueries(page);
	} catch (e) {
		if (source === "bing") throw new QueryError("source_error", e instanceof Error ? e.message : "Bing Webmaster did not answer.");
		live = [];
	}
	for (const r of live) if (r.day >= input.from && r.day <= input.to) add(r.query, r);
	const rows = [...sums].map(([key, r]) => ({
		key,
		...searchMetrics(r)
	})).sort((a, b) => num$2(b.clicks) - num$2(a.clicks) || num$2(b.impressions) - num$2(a.impressions) || (a.key < b.key ? -1 : 1));
	const filtered = (input.search?.pred ?? TRUE).sql !== TRUE.sql || (input.search?.ignored.length ?? 0) > 0;
	return {
		rows: rows.slice(input.offset, input.offset + input.limit),
		truncated: rows.length > input.offset + input.limit,
		notices: filtered ? ["filters_not_applied"] : []
	};
}
// src/query/reports/seo-copy.ts
const POSITION_BANDS = [
	"1-3",
	"4-10",
	"11-20",
	"21-50",
	"51+"
];
/** Lower bounds of the half-open bands `[1,4)`, `[4,11)`, `[11,21)`, `[21,51)`, `[51,inf)`. */
const BAND_UPPER = [
	4,
	11,
	21,
	51
];
/** Metric key suffix per band: `queries_1_3`, `impressions_51_plus`. */
const bandSuffix = (b) => b.replace("-", "_").replace("+", "_plus");
const SEO_TEXT = {
	coverage: "Based on Google Search Console data of the stored page and query rows. Google omits rare queries and keeps top rows only, so shares are of visible queries.",
	rangeTooLong: "This view reads detailed rows and is limited to 93 days. Choose a shorter range.",
	bingNoPairs: "Bing exposes page and query pairs only per page or per query on request; the lists are Google data",
	bingOnRequest: "Loads from Bing on request, cached one hour.",
	top3Insufficient: "not enough top-3 data",
	estimate: "est.",
	notable: "Notable means the change is larger than twice the square root of the two counts added up. A rule of thumb for counts, not a statistical test.",
	striking: "Pairs at average position 4 to 20. The estimate uses this site's own CTR in positions 1 to 3 over the same range.",
	patterns: "Dominant: the best page holds at least 70 percent of the impressions and the best position. Split: no page holds 50 percent. Inverted: the page with the most impressions ranks worse than another page. Shared: anything else.",
	decay: "Pages whose clicks fell in each of three consecutive periods. Position: the position worsened by 2 or more. CTR: the CTR fell under 75 percent with a stable position. Demand: neither, so fewer searches.",
	compareNotSupported: "These views compare periods on their own; the compare option does not apply.",
	caution: "Before and after comparisons show correlation, not causation. Seasonality, other changes and search engine updates overlap; annotations in the same window are listed.",
	noAnnotation: "No annotation yet"
};
/**
* The period line of the two- and three-period views, for example
* "Comparing 2026-10-14 to 2026-11-10 with the 28 days before; the newest 3 days are excluded as provisional".
*/
function periodLine(p) {
	if (!p) return "";
	const n = p.days;
	const base = `Comparing ${p.current.from} to ${p.current.to} with the ${n} days before${p.oldest ? ` and the ${n} days before that` : ""}`;
	if (p.excluded <= 0) return base;
	return `${base}; the newest ${p.excluded} day${p.excluded === 1 ? " is" : "s are"} excluded as ${p.reason}`;
}
/** Impact windows offered by the panel and accepted by the report. */
const IMPACT_WINDOWS = [
	7,
	14,
	28,
	60,
	90
];
/** Target reports of `impact`: reports that return totals or rows. */
const IMPACT_REPORTS = [
	"overview",
	"channels",
	"sources",
	"campaigns",
	"pages",
	"entry_pages",
	"countries",
	"devices",
	"browsers",
	"goals",
	"events",
	"satisfaction",
	"search_overview",
	"search_pages",
	"search_queries",
	"search_countries",
	"search_devices",
	"search_position_bands",
	"revenue"
];
/** Count metrics get `notable`; everything else shows its denominators. */
const COUNT_METRICS = /* @__PURE__ */ new Set([
	"sessions",
	"visitors",
	"pageviews",
	"events",
	"conversions",
	"completions",
	"converting",
	"clicks",
	"impressions",
	"bounces",
	"long_clicks",
	"short_clicks",
	"bad_experiences",
	"pogo_sticks",
	"returned_from_search",
	"measured",
	"queries",
	"pages",
	"count",
	"orders"
]);
const SESSION = [
	"sessions",
	"visitors",
	"pageviews",
	"bounce_rate",
	"engaged_rate",
	"avg_duration",
	"views_per_session"
];
const SEARCH = [
	"clicks",
	"impressions",
	"ctr",
	"position"
];
/** Metric keys `impact` accepts per target report; the panel's pickers read the same list. */
const IMPACT_METRICS = {
	overview: SESSION,
	channels: SESSION,
	sources: SESSION,
	campaigns: SESSION,
	countries: SESSION,
	devices: SESSION,
	browsers: SESSION,
	entry_pages: [
		"entries",
		"visitors",
		"pageviews",
		"bounce_rate",
		"engaged_rate",
		"avg_duration",
		"views_per_session"
	],
	pages: [
		"pageviews",
		"visitors",
		"avg_time",
		"exit_rate"
	],
	goals: [
		"completions",
		"converting",
		"conversion_rate"
	],
	events: [
		"events",
		"sessions",
		"rate"
	],
	satisfaction: [
		"sessions",
		"measured",
		"avg_duration",
		"long_clicks",
		"short_clicks",
		"bad_experiences",
		"pogo_sticks",
		"returned_from_search",
		"pct_long",
		"pct_short",
		"pct_bad",
		"pogo_stick_rate",
		"returned_from_search_rate",
		"search_reentry_rate",
		"back_nav_rate"
	],
	search_overview: SEARCH,
	search_pages: SEARCH,
	search_queries: SEARCH,
	search_countries: SEARCH,
	search_devices: SEARCH,
	search_position_bands: [
		...POSITION_BANDS.flatMap((b) => [
			"queries",
			"impressions",
			"share",
			"ctr"
		].map((m) => `${m}_${bandSuffix(b)}`)),
		"queries",
		"pages",
		"impressions",
		"clicks",
		"ctr",
		"impressions_share"
	],
	revenue: [
		"revenue",
		"orders",
		"aov",
		"revenue_per_visitor",
		"revenue_per_session"
	]
};
/** The breakdown dimension of a row report's key: `impact` filters the target by it so the row is always present. */
const IMPACT_KEY_DIM = {
	channels: "channel",
	sources: "source",
	campaigns: "utm_campaign",
	countries: "country",
	devices: "device",
	browsers: "browser",
	entry_pages: "entry",
	pages: "page",
	events: "event",
	search_pages: "page",
	search_queries: "query",
	search_countries: "country",
	search_devices: "device"
};
/** Rows of the page drill-down and of the query drill-down. */
const DRILL_MAX = 1e3;
const sourceOf = (input) => input.params.source ?? "all";
/** Days of the range; more than 93 is the typed error `range_too_long`. */
function seoRange(input) {
	const n = daysBetween(input.from, input.to);
	if (n > 93) throw new QueryError("range_too_long", SEO_TEXT.rangeTooLong);
	return n;
}
/** Floors and brand terms: request params override the settings. */
function floors(rc, input) {
	return {
		minImpressions: input.params.minImpressions ?? rc.settings.searchMinImpressions ?? 50,
		minShare: input.params.minShare ?? rc.settings.searchOverlapMinShare ?? 10,
		brand: input.params.includeBrand ? [] : rc.settings.searchBrandTerms ?? []
	};
}
/** Newest day with `provisional = 0` for the source(s); with `all` the older of the per-source days. One statement on the primary key. */
async function lastFinal(rc, source) {
	const w = and([{
		sql: "d.site = ? AND d.provisional = 0",
		params: [rc.site]
	}, source === "all" ? TRUE : {
		sql: "d.source = ?",
		params: [source]
	}]);
	return (await rc.db.all(`SELECT d.source AS source, MAX(d.day) AS day FROM ca_search_daily d WHERE ${w.sql} GROUP BY d.source`, w.params)).map((r) => r.day == null ? "" : String(r.day)).filter(Boolean).sort()[0] ?? null;
}
/**
* The period rule: `n` days per period, the current period ends at the newest final day
* (search) or yesterday (traffic, whose newest day is incomplete), the previous and oldest periods
* follow back to back. `provisional_excluded` when the requested end was moved.
*/
async function periods(rc, input, target, count) {
	const n = seoRange(input);
	const cap = target === "traffic" ? await storedThrough(rc) : await lastFinal(rc, target);
	const end = cap && cap < input.to ? cap : input.to;
	const current = {
		from: addDays(end, 1 - n),
		to: end
	};
	const previous = {
		from: addDays(current.from, -n),
		to: addDays(current.from, -1)
	};
	const p = {
		current,
		previous,
		days: n,
		excluded: daysBetween(end, input.to) - 1,
		reason: target === "traffic" ? "incomplete" : "provisional"
	};
	if (count === 3) p.oldest = {
		from: addDays(previous.from, -n),
		to: addDays(previous.from, -1)
	};
	return {
		periods: p,
		notices: end < input.to ? ["provisional_excluded"] : []
	};
}
/** `lower(d.query) NOT LIKE ?` per brand term; patterns stay under D1's 50 byte limit (settings drop longer terms). */
function brandPredicate(terms) {
	if (!terms.length) return TRUE;
	return {
		sql: terms.map(() => `lower(d.query) NOT LIKE ? ${LIKE_ESCAPE}`).join(" AND "),
		params: terms.map((t) => `%${likeEscape(t.toLowerCase())}%`)
	};
}
/** Band index 0 to 4 of an average position expression (`[1,4)`, `[4,11)`, `[11,21)`, `[21,51)`, `[51,inf)`). */
const bandCase = (expr) => `CASE ${BAND_UPPER.map((u, i) => `WHEN ${expr} < ${u} THEN ${i}`).join(" ")} ELSE ${BAND_UPPER.length} END`;
/** Noise guard `abs(a - b) > 2 * sqrt(a + b)`, squared so no SQL `SQRT` is needed (both sides are not negative). */
const notableExpr = (a, b) => `CASE WHEN (${a} - ${b}) * (${a} - ${b}) > 4 * (${a} + ${b}) THEN 1 ELSE 0 END`;
const isNotable = (a, b) => Math.abs(a - b) > 2 * Math.sqrt(a + b);
const pos = (sum, imp) => round(ratio(num$2(sum), num$2(imp)), 2);
const bandOf = (i) => typeof i === "number" || typeof i === "bigint" || typeof i === "string" ? POSITION_BANDS[Number(i)] ?? null : null;
/** Pair grain (page with query) rows: Google only, since Bing stores no pairs. */
const PAIR_GRAIN = "d.page_key <> '' AND d.query <> '' AND d.country = '' AND d.device = ''";
/** Filters of the pair views: `country` and `device` cannot apply (`filters_not_applied`); Bing selections read Google rows (`bing_no_pairs`). */
async function pairWhere(rc, input, brand) {
	const kept = input.filters.filter((f) => f.dim !== "country" && f.dim !== "device");
	const c = await compileSearch({
		db: rc.db,
		site: rc.site,
		from: input.from,
		to: input.to,
		goals: rc.goals
	}, kept);
	const notices = [];
	if (kept.length < input.filters.length) notices.push("filters_not_applied");
	if (sourceOf(input) !== "google") notices.push("bing_no_pairs");
	return {
		where: and([
			{
				sql: `d.site = ? AND d.source = ? AND d.day BETWEEN ? AND ? AND ${PAIR_GRAIN}`,
				params: [
					rc.site,
					"google",
					input.from,
					input.to
				]
			},
			c.pred,
			brandPredicate(brand)
		]),
		notices
	};
}
/**
* Page of a stored pair with any `#fragment` cut off: ingest already keys pages without fragments
* (`pageKeyFor`), this is the safety net so a stored `/page#toc` still counts as `/page` (summed, and
* the position stays impression weighted because `pos_sum` is summed).
*/
function pageNoFragment(db) {
	return db.dialect === "postgres" ? "split_part(d.page_key, '#', 1)" : "CASE WHEN instr(d.page_key, '#') > 0 THEN substr(d.page_key, 1, instr(d.page_key, '#') - 1) ELSE d.page_key END";
}
/** CTEs `pq` (pairs), `qs0` (query totals), `pqf` (pairs over the share floor) and `qs` (cannibalized queries). */
function overlapCtes(db, where, minShare, minImpressions, cap) {
	const page = pageNoFragment(db);
	return {
		sql: `WITH pq AS (SELECT d.query AS query, ${page} AS page, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE ${where.sql} GROUP BY d.query, ${page}),
qs0 AS (SELECT pq.query AS query, SUM(pq.impressions) AS impressions FROM pq GROUP BY pq.query),
pqf AS (SELECT pq.query AS query, pq.page AS page, pq.clicks AS clicks, pq.impressions AS impressions, pq.pos_sum AS pos_sum, qs0.impressions AS q_total FROM pq JOIN qs0 ON qs0.query = pq.query WHERE pq.impressions > 0 AND pq.impressions * 100 >= ? * qs0.impressions),
qs AS (SELECT pqf.query AS query, COUNT(*) AS pages, SUM(pqf.impressions) AS impressions, SUM(pqf.clicks) AS clicks, MAX(pqf.q_total) AS q_total FROM pqf GROUP BY pqf.query HAVING COUNT(*) >= 2 AND SUM(pqf.impressions) >= ?${cap === null ? "" : " ORDER BY SUM(pqf.impressions) DESC, pqf.query LIMIT ?"})`,
		params: [
			...where.params,
			minShare,
			minImpressions,
			...cap === null ? [] : [cap]
		]
	};
}
/** Visible share: page with query impressions over totals grain impressions, Google rows of the range. */
async function coverage(rc, input) {
	const [r] = await rc.db.all(`SELECT SUM(CASE WHEN d.page_key <> '' AND d.query <> '' THEN d.impressions ELSE 0 END) AS visible, SUM(CASE WHEN d.page_key = '' AND d.query = '' THEN d.impressions ELSE 0 END) AS total FROM ca_search_daily d WHERE d.site = ? AND d.source = ? AND d.day BETWEEN ? AND ? AND d.country = '' AND d.device = ''`, [
		rc.site,
		"google",
		input.from,
		input.to
	]);
	return round(ratio(num$2(r?.visible), num$2(r?.total)));
}
/** Best page: most clicks, then better position, then more impressions. */
function bestPage(pages) {
	return [...pages].sort((a, b) => b.clicks - a.clicks || (a.position ?? 1e400) - (b.position ?? 1e400) || b.impressions - a.impressions || (a.page < b.page ? -1 : 1))[0];
}
/**
* Pattern label of a cannibalized query: `dominant`, `split`, `inverted`, else `shared`. Shares are of the
* query's impressions over all its pages (`total`), so pages under the share floor still count in the denominator;
* the listed `impressions_share` values are of the counted pages and sum to 100.
*/
function overlapPattern(pages, total) {
	const best = bestPage(pages);
	if (!best) return "shared";
	const top = Math.min(...pages.map((p) => p.position ?? 1e400));
	const share = (p) => (total ? p.impressions / total : p.impressions_share ?? 0) * 100;
	if (share(best) >= 70 && (best.position ?? 1e400) <= top) return "dominant";
	if (pages.every((p) => share(p) < 50)) return "split";
	const most = pages.reduce((a, b) => b.impressions > a.impressions ? b : a);
	if (pages.some((p) => p !== most && (p.position ?? 1e400) < (most.position ?? 1e400))) return "inverted";
	return "shared";
}
const noCompare = (input) => {
	if (input.isCompare) throw new QueryError("compare_not_supported", SEO_TEXT.compareNotSupported);
};
async function searchCannibalization(rc, input) {
	noCompare(input);
	seoRange(input);
	const f = floors(rc, input);
	const { where, notices } = await pairWhere(rc, input, f.brand);
	const c = overlapCtes(rc.db, where, f.minShare, f.minImpressions, 200);
	const rows = await rc.db.all(`${c.sql},
ranked AS (SELECT pqf.query AS query, pqf.page AS page, pqf.clicks AS clicks, pqf.impressions AS impressions, pqf.pos_sum AS pos_sum, ROW_NUMBER() OVER (PARTITION BY pqf.query ORDER BY pqf.impressions DESC, pqf.page) AS rn FROM pqf JOIN qs ON qs.query = pqf.query)
SELECT r.query AS query, r.page AS page, r.clicks AS clicks, r.impressions AS impressions, r.pos_sum AS pos_sum, qs.pages AS q_pages, qs.impressions AS q_impressions, qs.clicks AS q_clicks, qs.q_total AS q_total FROM ranked r JOIN qs ON qs.query = r.query WHERE r.rn <= ? ORDER BY qs.impressions DESC, r.query, r.rn`, [...c.params, 10]);
	const byQuery = /* @__PURE__ */ new Map();
	for (const r of rows) {
		const q = String(r.query);
		const e = byQuery.get(q) ?? {
			pages: num$2(r.q_pages),
			impressions: num$2(r.q_impressions),
			clicks: num$2(r.q_clicks),
			total: num$2(r.q_total),
			list: []
		};
		const imp = num$2(r.impressions);
		const clicks = num$2(r.clicks);
		e.list.push({
			page: String(r.page),
			impressions: imp,
			impressions_share: round(ratio(imp, e.impressions)),
			clicks,
			clicks_share: round(ratio(clicks, e.clicks)),
			position: pos(r.pos_sum, imp)
		});
		byQuery.set(q, e);
	}
	const out = [...byQuery].map(([query, e]) => ({
		key: query,
		query,
		pages: e.pages,
		impressions: e.impressions,
		clicks: e.clicks,
		pattern: overlapPattern(e.list, e.total),
		best_page: bestPage(e.list)?.page ?? null,
		page_list: e.list
	}));
	const all = overlapCtes(rc.db, where, f.minShare, f.minImpressions, null);
	const [t] = await rc.db.all(`${all.sql} SELECT COUNT(*) AS n, SUM(qs.impressions) AS impressions FROM qs`, all.params);
	return {
		rows: out.slice(input.offset, input.offset + input.limit),
		truncated: out.length > input.offset + input.limit,
		totals: {
			cannibalized_queries: num$2(t?.n),
			cannibalized_impressions: num$2(t?.impressions),
			visible_share: await coverage(rc, input)
		},
		floors: {
			minImpressions: f.minImpressions,
			minShare: f.minShare,
			brandTerms: (rc.settings.searchBrandTerms ?? []).length,
			includeBrand: !!input.params.includeBrand
		},
		notices: [
			...notices,
			"coverage",
			...out.length >= 200 ? ["capped"] : []
		]
	};
}
async function searchCannibalizationPages(rc, input) {
	noCompare(input);
	seoRange(input);
	const f = floors(rc, input);
	const { where, notices } = await pairWhere(rc, input, f.brand);
	const c = overlapCtes(rc.db, where, f.minShare, f.minImpressions, null);
	const hit = "CASE WHEN cp.page IS NULL THEN 0 ELSE";
	const rows = await rc.db.all(`${c.sql},
cp AS (SELECT pqf.query AS query, pqf.page AS page FROM pqf JOIN qs ON qs.query = pqf.query)
SELECT pq.page AS page, COUNT(*) AS queries, SUM(${hit} 1 END) AS overlapping_queries, SUM(pq.impressions) AS impressions, SUM(${hit} pq.impressions END) AS overlapping_impressions, SUM(pq.clicks) AS clicks, SUM(${hit} pq.clicks END) AS overlapping_clicks
FROM pq LEFT JOIN cp ON cp.query = pq.query AND cp.page = pq.page GROUP BY pq.page HAVING SUM(${hit} 1 END) > 0 ORDER BY overlapping_impressions DESC, page LIMIT ? OFFSET ?`, [
		...c.params,
		input.limit + 1,
		input.offset
	]);
	return {
		rows: rows.slice(0, input.limit).map((r) => ({
			key: String(r.page),
			queries: num$2(r.queries),
			overlapping_queries: num$2(r.overlapping_queries),
			overlapping_queries_pct: round(ratio(num$2(r.overlapping_queries), num$2(r.queries))),
			impressions: num$2(r.impressions),
			overlapping_impressions: num$2(r.overlapping_impressions),
			overlapping_impressions_pct: round(ratio(num$2(r.overlapping_impressions), num$2(r.impressions))),
			clicks: num$2(r.clicks),
			overlapping_clicks: num$2(r.overlapping_clicks)
		})),
		truncated: rows.length > input.limit,
		notices: [...notices, "coverage"]
	};
}
/** One page: the other pages it competes with and the shared queries (stored Google rows). */
async function searchCannibalizationPage(rc, input) {
	noCompare(input);
	seoRange(input);
	const page = input.params.page;
	if (!page) throw new QueryError("invalid_params", "search_cannibalization_page needs params.page.");
	const f = floors(rc, input);
	const { where, notices } = await pairWhere(rc, input, f.brand);
	const c = overlapCtes(rc.db, where, f.minShare, f.minImpressions, null);
	const rows = await rc.db.all(`${c.sql},
cp AS (SELECT pqf.query AS query, pqf.page AS page, pqf.impressions AS impressions, pqf.pos_sum AS pos_sum FROM pqf JOIN qs ON qs.query = pqf.query)
SELECT a.query AS query, a.impressions AS impressions_this, a.pos_sum AS pos_this, b.page AS other_page, b.impressions AS impressions_other, b.pos_sum AS pos_other FROM cp a JOIN cp b ON b.query = a.query AND b.page <> a.page WHERE a.page = ? ORDER BY a.impressions DESC, a.query, b.impressions DESC, b.page LIMIT ?`, [
		...c.params,
		page,
		DRILL_MAX
	]);
	const queries = rows.map((r) => ({
		query: String(r.query),
		impressions_this: num$2(r.impressions_this),
		position_this: pos(r.pos_this, r.impressions_this),
		impressions_other: num$2(r.impressions_other),
		position_other: pos(r.pos_other, r.impressions_other),
		other_page: String(r.other_page)
	}));
	const pairs = /* @__PURE__ */ new Map();
	for (const q of queries) {
		const p = pairs.get(q.other_page) ?? {
			other_page: q.other_page,
			shared_queries: 0,
			shared_impressions_this: 0,
			shared_impressions_other: 0
		};
		p.shared_queries += 1;
		p.shared_impressions_this += q.impressions_this;
		p.shared_impressions_other += q.impressions_other;
		pairs.set(q.other_page, p);
	}
	return {
		page,
		pairs: [...pairs.values()].sort((a, b) => b.shared_impressions_this - a.shared_impressions_this || (a.other_page < b.other_page ? -1 : 1)),
		queries,
		truncated: rows.length >= DRILL_MAX,
		notices: [...notices, "coverage"]
	};
}
/** One query: its pages from stored Google rows, and for Bing from `GetQueryPageStats` on request (cached one hour). */
async function searchCannibalizationQuery(rc, input) {
	noCompare(input);
	seoRange(input);
	const query = input.params.query;
	if (!query) throw new QueryError("invalid_params", "search_cannibalization_query needs params.query.");
	const source = sourceOf(input);
	const sums = /* @__PURE__ */ new Map();
	const add = (page, r) => {
		const e = sums.get(page) ?? {
			clicks: 0,
			impressions: 0,
			pos_sum: 0
		};
		sums.set(page, {
			clicks: e.clicks + num$2(r.clicks),
			impressions: e.impressions + num$2(r.impressions),
			pos_sum: e.pos_sum + num$2(r.pos_sum)
		});
	};
	const notices = [];
	if (source !== "bing") {
		const { where, notices: n } = await pairWhere(rc, {
			...input,
			params: {
				...input.params,
				source: "google"
			}
		}, []);
		notices.push(...n);
		const w = and([where, {
			sql: "d.query = ?",
			params: [query]
		}]);
		const rows = await rc.db.all(`SELECT ${pageNoFragment(rc.db)} AS page, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${pageNoFragment(rc.db)} ORDER BY impressions DESC, page LIMIT ?`, [...w.params, DRILL_MAX]);
		for (const r of rows) add(String(r.page), {
			clicks: r.clicks,
			impressions: r.impressions,
			pos_sum: r.pos_sum
		});
	}
	if (source !== "google" && rc.bingQueryPages) try {
		for (const r of await rc.bingQueryPages(query)) if (r.day >= input.from && r.day <= input.to) add(r.page, r);
		if (input.filters.length) notices.push("filters_not_applied");
	} catch (e) {
		if (source === "bing") throw new QueryError("source_error", e instanceof Error ? e.message : "Bing Webmaster did not answer.");
	}
	const total = [...sums.values()].reduce((a, r) => ({
		clicks: a.clicks + r.clicks,
		impressions: a.impressions + r.impressions
	}), {
		clicks: 0,
		impressions: 0
	});
	const pages = [...sums].map(([page, r]) => ({
		page,
		impressions: r.impressions,
		impressions_share: round(ratio(r.impressions, total.impressions)),
		clicks: r.clicks,
		clicks_share: round(ratio(r.clicks, total.clicks)),
		position: pos(r.pos_sum, r.impressions)
	})).sort((a, b) => b.impressions - a.impressions || (a.page < b.page ? -1 : 1));
	return {
		query,
		page_list: pages,
		best_page: bestPage(pages)?.page ?? null,
		pattern: pages.length > 1 ? overlapPattern(pages) : null,
		notices
	};
}
const dimOf = (input, fallback) => input.params.dim === "page" || input.params.dim === "query" ? input.params.dim : fallback;
const AVG = "SUM(d.pos_sum) / NULLIF(SUM(d.impressions), 0)";
async function searchPositionBands(rc, input) {
	seoRange(input);
	const dim = dimOf(input, "query");
	const col = COLUMN[dim];
	const w = searchWhere(rc, input, dim);
	const rows = await rc.db.all(`SELECT k.band AS band, COUNT(*) AS n, SUM(k.impressions) AS impressions, SUM(k.clicks) AS clicks FROM (SELECT ${col} AS key, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, ${bandCase(AVG)} AS band FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${col} HAVING SUM(d.impressions) > 0) k GROUP BY k.band`, w.params);
	const byBand = new Map(rows.map((r) => [bandOf(r.band), r]));
	const allImp = rows.reduce((a, r) => a + num$2(r.impressions), 0);
	const count = dim === "page" ? "pages" : "queries";
	const totals = {
		[count]: rows.reduce((a, r) => a + num$2(r.n), 0),
		impressions: allImp
	};
	return {
		rows: POSITION_BANDS.map((band) => {
			const r = byBand.get(band);
			const impressions = num$2(r?.impressions);
			const clicks = num$2(r?.clicks);
			const row = {
				key: band,
				[count]: num$2(r?.n),
				impressions,
				clicks,
				ctr: round(ratio(clicks, impressions)),
				impressions_share: round(ratio(impressions, allImp))
			};
			const s = bandSuffix(band);
			totals[`${count}_${s}`] = num$2(r?.n);
			totals[`impressions_${s}`] = impressions;
			totals[`share_${s}`] = row.impressions_share;
			totals[`ctr_${s}`] = row.ctr;
			return row;
		}),
		totals,
		notices: input.search?.ignored.length ? ["filters_not_applied"] : []
	};
}
/** Series point key of a band: `band_1_3`. */
const bandKey = (band) => `band_${bandSuffix(band)}`;
async function searchPositionBandsSeries(rc, input) {
	const days = seoRange(input);
	const dim = dimOf(input, "query");
	const col = COLUMN[dim];
	const byWeek = days > 31;
	const bucket = !byWeek ? "d.day" : rc.db.dialect === "postgres" ? "to_char(date_trunc('week', CAST(d.day AS date)), 'YYYY-MM-DD')" : "date(d.day, '-6 days', 'weekday 1')";
	const metric = input.params.metric === "impressions" ? "impressions" : "queries";
	const w = searchWhere(rc, input, dim);
	const rows = await rc.db.all(`SELECT k.bucket AS bucket, k.band AS band, COUNT(*) AS n, SUM(k.impressions) AS impressions FROM (SELECT ${bucket} AS bucket, ${col} AS key, SUM(d.impressions) AS impressions, ${bandCase(AVG)} AS band FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${bucket}, ${col} HAVING SUM(d.impressions) > 0) k GROUP BY k.bucket, k.band`, w.params);
	const buckets = /* @__PURE__ */ new Map();
	for (const day of eachDay(input.from, input.to)) {
		const t = byWeek ? weekStart(day) : day;
		if (!buckets.has(t)) buckets.set(t, Object.fromEntries(POSITION_BANDS.map((b) => [bandKey(b), 0])));
	}
	for (const r of rows) {
		const band = bandOf(r.band);
		const b = buckets.get(String(r.bucket));
		if (band && b) b[bandKey(band)] = metric === "impressions" ? num$2(r.impressions) : num$2(r.n);
	}
	return {
		keys: POSITION_BANDS.map(bandKey),
		labels: [...POSITION_BANDS],
		metric,
		granularity: byWeek ? "week" : "day",
		series: [...buckets].map(([t, v]) => ({
			t,
			...v
		})),
		notices: input.search?.ignored.length ? ["filters_not_applied"] : []
	};
}
/** Per key sums of two periods in one scan (`c` current, `p` previous): clicks, impressions, pos_sum. */
function twoPeriodSums(col, split) {
	const s = (when, v) => `SUM(CASE WHEN d.day ${when} ? THEN d.${v} ELSE 0 END)`;
	return {
		sql: `${col} AS key, ${s(">=", "clicks")} AS cc, ${s(">=", "impressions")} AS ic, ${s(">=", "pos_sum")} AS pc, ${s("<", "clicks")} AS cp, ${s("<", "impressions")} AS ip, ${s("<", "pos_sum")} AS pp`,
		params: [
			split,
			split,
			split,
			split,
			split,
			split
		]
	};
}
async function searchPositionMoves(rc, input) {
	const dim = dimOf(input, "query");
	const { periods: p, notices } = await periods(rc, input, sourceOf(input), 2);
	const { minImpressions } = floors(rc, input);
	const col = COLUMN[dim];
	const w = searchWhere(rc, {
		...input,
		from: p.previous.from,
		to: p.current.to
	}, dim);
	const sums = twoPeriodSums(col, p.current.from);
	const ctes = {
		sql: `WITH a AS (SELECT ${sums.sql} FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${col}),
m AS (SELECT a.key AS key, a.cc AS cc, a.ic AS ic, a.pc AS pc, a.cp AS cp, a.ip AS ip, a.pp AS pp, CASE WHEN a.ip >= ? THEN ${bandCase("a.pp / NULLIF(a.ip, 0)")} ELSE -1 END AS bf, CASE WHEN a.ic >= ? THEN ${bandCase("a.pc / NULLIF(a.ic, 0)")} ELSE -2 END AS bt FROM a WHERE a.ic >= ? OR a.ip >= ?)`,
		params: [
			...sums.params,
			...w.params,
			minImpressions,
			minImpressions,
			minImpressions,
			minImpressions
		]
	};
	const matrixRows = await rc.db.all(`${ctes.sql} SELECT m.bf AS bf, m.bt AS bt, COUNT(*) AS n, SUM(CASE WHEN m.bt = -2 THEN m.ip ELSE m.ic END) AS impressions FROM m GROUP BY m.bf, m.bt`, ctes.params);
	const listRows = await rc.db.all(`${ctes.sql},
v AS (SELECT m.key AS key, m.cc AS cc, m.ic AS ic, m.pc AS pc, m.cp AS cp, m.ip AS ip, m.pp AS pp, m.bf AS bf, m.bt AS bt, CASE WHEN m.bf = -1 THEN 'new' WHEN m.bt = -2 THEN 'lost' WHEN m.bt < m.bf THEN 'up' WHEN m.bt > m.bf THEN 'down' ELSE 'same' END AS mv FROM m),
r AS (SELECT v.key AS key, v.cc AS cc, v.ic AS ic, v.pc AS pc, v.cp AS cp, v.ip AS ip, v.pp AS pp, v.bf AS bf, v.bt AS bt, v.mv AS mv, ROW_NUMBER() OVER (PARTITION BY v.mv ORDER BY CASE WHEN v.mv = 'lost' THEN v.ip ELSE v.ic END DESC, v.key) AS rn FROM v WHERE v.mv <> 'same')
SELECT r.key AS key, r.cc AS cc, r.ic AS ic, r.pc AS pc, r.cp AS cp, r.ip AS ip, r.pp AS pp, r.bf AS bf, r.bt AS bt, r.mv AS mv FROM r WHERE r.rn <= ? ORDER BY r.mv, r.rn`, [...ctes.params, input.limit]);
	const label = (i) => Number(i) === -1 ? "new" : Number(i) === -2 ? "lost" : bandOf(i);
	const matrix = matrixRows.map((r) => ({
		from: label(r.bf),
		to: label(r.bt),
		queries: num$2(r.n),
		impressions: num$2(r.impressions)
	}));
	const totals = {
		moved_up: 0,
		moved_down: 0,
		unchanged: 0,
		new: 0,
		lost: 0
	};
	for (const r of matrixRows) {
		const f = Number(r.bf);
		const t = Number(r.bt);
		const k = f === -1 ? "new" : t === -2 ? "lost" : t < f ? "moved_up" : t > f ? "moved_down" : "unchanged";
		totals[k] += num$2(r.n);
	}
	const lists = {
		up: [],
		down: [],
		new: [],
		lost: []
	};
	for (const r of listRows) {
		const lost = r.mv === "lost";
		lists[String(r.mv)]?.push({
			query: String(r.key),
			impressions: num$2(lost ? r.ip : r.ic),
			clicks: num$2(lost ? r.cp : r.cc),
			position_previous: r.mv === "new" ? null : pos(r.pp, r.ip),
			position_current: lost ? null : pos(r.pc, r.ic),
			band_previous: r.mv === "new" ? null : bandOf(r.bf),
			band_current: lost ? null : bandOf(r.bt)
		});
	}
	const list = input.params.list && input.params.list !== "matrix" ? lists[input.params.list] : null;
	return {
		dim,
		matrix,
		rows: list ? list.map((x) => ({
			key: String(x.query),
			...x
		})) : matrix.map((m) => ({
			key: `${m.from} > ${m.to}`,
			...m
		})),
		...lists,
		totals,
		periods: p,
		notices
	};
}
async function searchStrikingDistance(rc, input) {
	seoRange(input);
	const f = floors(rc, input);
	const { where, notices } = await pairWhere(rc, input, f.brand);
	const rows = await rc.db.all(`SELECT d.query AS query, d.page_key AS page, SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE ${where.sql} GROUP BY d.query, d.page_key HAVING SUM(d.impressions) >= ? AND SUM(d.pos_sum) >= 4 * SUM(d.impressions) AND SUM(d.pos_sum) < 21 * SUM(d.impressions) ORDER BY impressions DESC, query, page LIMIT ? OFFSET ?`, [
		...where.params,
		Math.max(1, f.minImpressions),
		input.limit + 1,
		input.offset
	]);
	const [top] = await rc.db.all(`SELECT SUM(t.clicks) AS clicks, SUM(t.impressions) AS impressions FROM (SELECT SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE d.site = ? AND d.source = ? AND d.day BETWEEN ? AND ? AND ${PAIR_GRAIN} GROUP BY d.query, d.page_key) t WHERE t.impressions > 0 AND t.pos_sum < ${BAND_UPPER[0]} * t.impressions`, [
		rc.site,
		"google",
		input.from,
		input.to
	]);
	const topImp = num$2(top?.impressions);
	const ctr13 = topImp >= 1e3 ? num$2(top?.clicks) / topImp : null;
	return {
		rows: rows.slice(0, input.limit).map((r) => {
			const impressions = num$2(r.impressions);
			const clicks = num$2(r.clicks);
			const ctr = ratio(clicks, impressions) ?? 0;
			return {
				key: `${String(r.query)}\u0000${String(r.page)}`,
				query: String(r.query),
				page: String(r.page),
				impressions,
				clicks,
				ctr: round(ctr),
				position: pos(r.pos_sum, impressions),
				potential_clicks: ctr13 === null ? null : Math.round(impressions * Math.max(0, ctr13 - ctr))
			};
		}),
		truncated: rows.length > input.limit,
		totals: {
			ctr_1_3: round(ctr13),
			impressions_1_3: topImp
		},
		notices: [
			...notices,
			"coverage",
			...ctr13 === null ? ["top3_insufficient"] : []
		]
	};
}
function moverRow(key, cur, prev, extra = {}) {
	return {
		key,
		current: cur,
		previous: prev,
		delta: cur - prev,
		delta_pct: prev === 0 ? null : round((cur - prev) / prev),
		...extra,
		notable: isNotable(cur, prev)
	};
}
async function searchMovers(rc, input) {
	const dim = dimOf(input, "page");
	const metric = input.params.metric === "impressions" ? "impressions" : "clicks";
	const up = input.params.direction === "up";
	const { periods: p, notices } = await periods(rc, input, sourceOf(input), 2);
	const { minImpressions } = floors(rc, input);
	const col = COLUMN[dim];
	const w = searchWhere(rc, {
		...input,
		from: p.previous.from,
		to: p.current.to
	}, dim);
	const sums = twoPeriodSums(col, p.current.from);
	const [c, pv] = metric === "clicks" ? ["a.cc", "a.cp"] : ["a.ic", "a.ip"];
	const rows = await rc.db.all(`WITH a AS (SELECT ${sums.sql} FROM ca_search_daily d WHERE ${w.sql} GROUP BY ${col})
SELECT a.key AS key, a.cc AS cc, a.ic AS ic, a.pc AS pc, a.cp AS cp, a.ip AS ip, a.pp AS pp, ${notableExpr(c, pv)} AS notable FROM a WHERE (a.ic >= ? OR a.ip >= ?) AND ${c} - ${pv} ${up ? ">" : "<"} 0 ORDER BY ABS(${c} - ${pv}) DESC, a.key LIMIT ? OFFSET ?`, [
		...sums.params,
		...w.params,
		minImpressions,
		minImpressions,
		input.limit + 1,
		input.offset
	]);
	const out = rows.slice(0, input.limit).map((r) => {
		const pc = pos(r.pc, r.ic);
		const pp = pos(r.pp, r.ip);
		const both = num$2(r.ic) >= minImpressions && num$2(r.ip) >= minImpressions;
		return {
			...moverRow(String(r.key), num$2(metric === "clicks" ? r.cc : r.ic), num$2(metric === "clicks" ? r.cp : r.ip), {
				impressions_current: num$2(r.ic),
				impressions_previous: num$2(r.ip),
				position_current: pc,
				position_previous: pp,
				ctr_current: round(ratio(num$2(r.cc), num$2(r.ic))),
				ctr_previous: round(ratio(num$2(r.cp), num$2(r.ip))),
				position_moved: both && pc !== null && pp !== null && Math.abs(pc - pp) >= 1
			}),
			notable: Number(r.notable) === 1
		};
	});
	return {
		dim,
		metric,
		direction: up ? "up" : "down",
		rows: out,
		truncated: rows.length > input.limit,
		periods: p,
		notices: [...notices, ...input.search?.ignored.length ? ["filters_not_applied"] : []]
	};
}
/** Pageviews of `ca_rollup` dim `page`; session filters cannot apply (rollup rows are per dimension value). */
function rollupPages(rc, from, to) {
	return {
		sql: "r.site = ? AND r.dim = 'page' AND r.seg = '' AND r.key <> ? AND r.day BETWEEN ? AND ?",
		params: [
			rc.site,
			OTHER,
			from,
			to
		]
	};
}
async function trafficMovers(rc, input) {
	const up = input.params.direction === "up";
	const { periods: p, notices } = await periods(rc, input, "traffic", 2);
	const { minImpressions } = floors(rc, input);
	const w = rollupPages(rc, p.previous.from, p.current.to);
	const rows = await rc.db.all(`WITH a AS (SELECT r.key AS key, SUM(CASE WHEN r.day >= ? THEN r.pageviews ELSE 0 END) AS c, SUM(CASE WHEN r.day < ? THEN r.pageviews ELSE 0 END) AS p FROM ca_rollup r WHERE ${w.sql} GROUP BY r.key)
SELECT a.key AS key, a.c AS c, a.p AS p, ${notableExpr("a.c", "a.p")} AS notable FROM a WHERE (a.c >= ? OR a.p >= ?) AND a.c - a.p ${up ? ">" : "<"} 0 ORDER BY ABS(a.c - a.p) DESC, a.key LIMIT ? OFFSET ?`, [
		p.current.from,
		p.current.from,
		...w.params,
		minImpressions,
		minImpressions,
		input.limit + 1,
		input.offset
	]);
	const out = rows.slice(0, input.limit).map((r) => ({
		...moverRow(String(r.key), num$2(r.c), num$2(r.p)),
		notable: Number(r.notable) === 1
	}));
	return {
		metric: "pageviews",
		direction: up ? "up" : "down",
		rows: out,
		truncated: rows.length > input.limit,
		periods: p,
		notices: [...notices, ...input.filters.length ? ["filters_not_applied"] : []]
	};
}
/** Diagnosis of a decaying page: `position`, `ctr` or `demand`. */
function decayDiagnosis(posOld, posCur, ctrOld, ctrCur) {
	if (posOld !== null && posCur !== null && posCur - posOld >= 2) return "position";
	if (ctrOld !== null && ctrCur !== null && ctrCur < .75 * ctrOld) return "ctr";
	return "demand";
}
async function searchDecay(rc, input) {
	const { periods: p, notices } = await periods(rc, input, sourceOf(input), 3);
	const oldest = p.oldest;
	const { minImpressions } = floors(rc, input);
	const w = searchWhere(rc, {
		...input,
		from: oldest.from,
		to: p.current.to
	}, "page");
	const s = (cond, v) => `SUM(CASE WHEN ${cond} THEN d.${v} ELSE 0 END)`;
	const rows = await rc.db.all(`WITH a AS (SELECT d.page_key AS key, ${s("d.day < ?", "clicks")} AS c1, ${s("d.day >= ? AND d.day < ?", "clicks")} AS c2, ${s("d.day >= ?", "clicks")} AS c3, ${s("d.day < ?", "impressions")} AS i1, ${s("d.day >= ?", "impressions")} AS i3, ${s("d.day < ?", "pos_sum")} AS p1, ${s("d.day >= ?", "pos_sum")} AS p3 FROM ca_search_daily d WHERE ${w.sql} GROUP BY d.page_key)
SELECT a.key AS key, a.c1 AS c1, a.c2 AS c2, a.c3 AS c3, a.i1 AS i1, a.i3 AS i3, a.p1 AS p1, a.p3 AS p3, a.c1 - a.c3 AS loss FROM a WHERE a.c1 > a.c2 AND a.c2 > a.c3 AND a.i1 >= ? ORDER BY loss DESC, key LIMIT ? OFFSET ?`, [
		p.previous.from,
		p.previous.from,
		p.current.from,
		p.current.from,
		p.previous.from,
		p.current.from,
		p.previous.from,
		p.current.from,
		...w.params,
		minImpressions,
		input.limit + 1,
		input.offset
	]);
	return {
		rows: rows.slice(0, input.limit).map((r) => {
			const po = pos(r.p1, r.i1);
			const pc = pos(r.p3, r.i3);
			return {
				key: String(r.key),
				oldest: num$2(r.c1),
				middle: num$2(r.c2),
				current: num$2(r.c3),
				loss: num$2(r.loss),
				position_oldest: po,
				position_current: pc,
				diagnosis: decayDiagnosis(po, pc, ratio(num$2(r.c1), num$2(r.i1)), ratio(num$2(r.c3), num$2(r.i3)))
			};
		}),
		truncated: rows.length > input.limit,
		periods: p,
		notices: [...notices, ...input.search?.ignored.length ? ["filters_not_applied"] : []]
	};
}
async function trafficDecay(rc, input) {
	const { periods: p, notices } = await periods(rc, input, "traffic", 3);
	const oldest = p.oldest;
	const { minImpressions } = floors(rc, input);
	const w = rollupPages(rc, oldest.from, p.current.to);
	const rows = await rc.db.all(`WITH a AS (SELECT r.key AS key, SUM(CASE WHEN r.day < ? THEN r.pageviews ELSE 0 END) AS c1, SUM(CASE WHEN r.day >= ? AND r.day < ? THEN r.pageviews ELSE 0 END) AS c2, SUM(CASE WHEN r.day >= ? THEN r.pageviews ELSE 0 END) AS c3 FROM ca_rollup r WHERE ${w.sql} GROUP BY r.key)
SELECT a.key AS key, a.c1 AS c1, a.c2 AS c2, a.c3 AS c3, a.c1 - a.c3 AS loss FROM a WHERE a.c1 > a.c2 AND a.c2 > a.c3 AND a.c1 >= ? ORDER BY loss DESC, key LIMIT ? OFFSET ?`, [
		p.previous.from,
		p.previous.from,
		p.current.from,
		p.current.from,
		...w.params,
		minImpressions,
		input.limit + 1,
		input.offset
	]);
	return {
		metric: "pageviews",
		rows: rows.slice(0, input.limit).map((r) => ({
			key: String(r.key),
			oldest: num$2(r.c1),
			middle: num$2(r.c2),
			current: num$2(r.c3),
			loss: num$2(r.loss)
		})),
		truncated: rows.length > input.limit,
		periods: p,
		notices: [...notices, ...input.filters.length ? ["filters_not_applied"] : []]
	};
}
const COLORS = [
	"#2563eb",
	"#16a34a",
	"#f59e0b",
	"#db2777",
	"#7c3aed",
	"#0891b2",
	"#64748b"
];
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const nf = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1
});
/** Rates are fractions (0.25 = 25 %), durations seconds. */
function fmt(v, f = "number") {
	if (v === null || v === void 0 || v === "") return "-";
	if (f === "text" || typeof v !== "number") return String(v);
	if (f.startsWith("money:")) return formatAmount(v, f.slice(6));
	switch (f) {
		case "percent": return `${(v * 100).toFixed(1)}%`;
		case "duration": {
			const s = Math.round(v);
			return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
		}
		case "decimal": return v.toFixed(2);
		default: return Math.abs(v) >= 1e5 ? compact.format(v) : nf.format(v);
	}
}
/** x and y scales of a line chart of `n` points; the y axis starts at 0 and ends at the largest value (at least 1). */
/** `unit`: viewBox units per pixel (the admin scales paddings with the rendered width); 1 keeps the plain viewBox. */
/** `inset`: viewBox units kept free left and right of the points, the gutters of the y axis labels. */
function lineScale(n, values, height, unit = 1, inset = {}) {
	const top = 16 * unit;
	const bottom = height - 20 * unit;
	const max = Math.max(1, ...values.map((v) => v ?? 0));
	const l = inset.left ?? 0;
	const w = 600 - l - (inset.right ?? 0);
	return {
		top,
		bottom,
		max,
		step: n <= 1 ? w : w / (n - 1),
		x: (i) => r1(l + (n <= 1 ? w / 2 : i / (n - 1) * w)),
		y: (v) => r1(bottom - (v ?? 0) / max * (bottom - top))
	};
}
/** The smallest of 1, 2, 2.5 or 5 times a power of ten at or above `v` (1 for 0 or less), so an axis ends on a round value. */
function niceMax(v) {
	if (!(v > 0)) return 1;
	const e = 10 ** Math.floor(Math.log10(v));
	const f = v / e;
	return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}
/** Scale family of a format: series of one family can share an axis. */
const formatFamily = (f) => f === "number" || f === "text" ? "count" : f;
/**
* One y axis over `values`: 0 (or a nice minimum below a negative value, such as a net revenue after refunds) to a
* nice maximum; `invert` (Search position) runs 1 at the top to the nice maximum at the bottom, so better positions sit higher.
*/
function axisScale(values, top, bottom, invert = false) {
	const low = Math.min(0, ...values.map((v) => v ?? 0));
	const min = invert ? 1 : low < 0 ? -niceMax(-low) : 0;
	const top0 = niceMax(Math.max(0, ...values.map((v) => v ?? 0)));
	const max = invert ? Math.max(2, top0) : top0;
	const mid = min + (max - min) / 2;
	const frac = (v) => (v - min) / (max - min);
	return {
		min,
		max,
		invert,
		ticks: invert ? [
			max,
			mid,
			min
		] : [
			min,
			mid,
			max
		],
		y: (v) => r1(invert ? top + frac(v ?? min) * (bottom - top) : bottom - frac(v ?? 0) * (bottom - top))
	};
}
/** Short tick label: compact counts ("9.2k"), whole percents, durations as `fmt`, money without its code (the code is in the axis caption). */
function fmtTick(v, f) {
	if (f === "percent") return `${r1(v * 100)}%`;
	if (f === "duration") return fmt(v, f);
	if (f === "decimal") return String(r1(v));
	return new Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 1
	}).format(v);
}
const MON = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
];
const DOW = [
	"Sun",
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat"
];
const BUCKET_RE = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?$/;
/**
* A bucket key as text. `long`: "Mon 9 Mar 2026", "9 Mar 2026, 14:00", "Week of 9 Mar 2026"; short (axis
* ticks): "9 Mar" or "14:00". Keys that are not dates come back unchanged.
*/
function bucketText(t, gran = "day", long = true) {
	const m = BUCKET_RE.exec(t);
	if (!m) return t;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	const day = `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
	if (!long) return m[4] && gran === "hour" ? m[4] === "00:00" ? day : m[4] : day;
	if (m[4]) return `${day} ${m[1]}, ${m[4]}`;
	return gran === "week" ? `Week of ${day} ${m[1]}` : `${DOW[d.getUTCDay()]} ${day} ${m[1]}`;
}
/** A day range as "15 Feb to 28 Feb" (the year only when the two differ from each other). */
function rangeText(from, to) {
	const a = bucketText(from, "day", false);
	const b = bucketText(to, "day", false);
	return from.slice(0, 4) === to.slice(0, 4) ? `${a} to ${b}` : `${a} ${from.slice(0, 4)} to ${b} ${to.slice(0, 4)}`;
}
/** Marker shape per series slot, so a line is told apart by more than its colour: circle, square, triangle, diamond. */
function shapePath(slot, cx, cy, r) {
	const p = (x, y) => `${r1(cx + x)} ${r1(cy + y)}`;
	switch (slot % 4) {
		case 1: return `M${p(-r * .85, -r * .85)} H${r1(cx + r * .85)} V${r1(cy + r * .85)} H${r1(cx - r * .85)} Z`;
		case 2: return `M${p(0, -r)} L${p(r, r * .8)} L${p(-r, r * .8)} Z`;
		case 3: return `M${p(0, -r)} L${p(r, 0)} L${p(0, r)} L${p(-r, 0)} Z`;
		default: return `M${p(-r, 0)} A${r1(r)} ${r1(r)} 0 1 0 ${p(r, 0)} A${r1(r)} ${r1(r)} 0 1 0 ${p(-r, 0)} Z`;
	}
}
/** Path of a line; null values break the line instead of drawing a false zero. */
function linePath(vals, s) {
	return vals.map((v, i) => v === null ? "" : `${i && vals[i - 1] !== null ? "L" : "M"}${s.x(i)} ${s.y(v)}`).filter(Boolean).join(" ");
}
/** Closed area under a line path of `n` points (only drawn when no value is null). */
const areaPath = (line, n, s) => `${line} L${s.x(n - 1)} ${s.bottom} L${s.x(0)} ${s.bottom} Z`;
/** Bar length of `value` scaled to the largest value (at least 1) over `width`. */
const barWidth = (value, max, width = 600) => r1(value / Math.max(1, max) * width);
/** Vertical stacked bars: per entry, one rect per part from the bottom up. */
function stackedRects(data, height) {
	const max = Math.max(1, ...data.map((d) => d.parts.reduce((a, b) => a + b, 0)));
	const bw = data.length ? 600 / data.length : 600;
	const plot = height - 4;
	return data.map((d, i) => {
		let acc = 0;
		return d.parts.map((p) => {
			const hgt = p / max * plot;
			acc += hgt;
			return {
				x: r1(i * bw + bw * .1),
				y: r1(height - acc),
				width: r1(bw * .8),
				height: r1(hgt)
			};
		});
	});
}
/**
* Donut slices as circle stroke dashes (radius DONUT_R in a 100 by 100 box); empty when the total is 0.
* Each slice is one dash from its start to its end, and the gap is longer than the circle, so the pattern never
* repeats. Slice boundaries are rounded down to 0.01 and the next slice starts where the last one ended, so the
* last dash cannot run past the end of the circle and wrap into a sliver at 12 o'clock.
*/
function donutArcs(slices) {
	const total = slices.reduce((a, s) => a + s.value, 0);
	if (total <= 0) return [];
	const c = 2 * Math.PI * 40;
	const down = (v) => Math.floor(v * 100) / 100;
	const gap = Math.ceil(c) + 1;
	let sum = 0;
	let start = 0;
	return slices.map((s) => {
		sum += s.value;
		const end = down(sum / total * c);
		const len = Math.max(0, end - start);
		const arc = {
			label: s.label,
			share: s.value / total,
			dasharray: `${r2(len)} ${gap}`,
			dashoffset: r2(-start)
		};
		start = end;
		return arc;
	});
}
/** At most `max` slices: the rest is folded into one "other" slice. */
function foldSlices(rows, max = 8) {
	if (rows.length <= max) return [...rows];
	const rest = rows.slice(max - 1).reduce((a, r) => a + r.value, 0);
	return [...rows.slice(0, max - 1), {
		label: "other",
		value: rest
	}];
}
/**
* Markers grouped per bucket, then adjacent buckets closer than `gap` merged into one cluster drawn at
* their mean x. Markers whose bucket is not on the chart (`xOf` undefined) are dropped.
*/
function markerGroups(markers, xOf, gap = 10) {
	const buckets = /* @__PURE__ */ new Map();
	for (const m of markers) {
		const x = xOf(m.t);
		if (x === void 0) continue;
		const b = buckets.get(m.t);
		if (b) b.markers.push(m);
		else buckets.set(m.t, {
			x,
			markers: [m]
		});
	}
	const out = [];
	for (const [t, b] of [...buckets].sort((p, q) => p[1].x - q[1].x)) {
		const last = out[out.length - 1];
		if (last && b.x - last.xs[last.xs.length - 1] < gap) {
			last.xs.push(b.x);
			last.ts.push(t);
			last.markers.push(...b.markers);
		} else out.push({
			xs: [b.x],
			ts: [t],
			markers: [...b.markers]
		});
	}
	return out.map((g) => ({
		x: r1(g.xs.reduce((s, v) => s + v, 0) / g.xs.length),
		count: g.markers.length,
		markers: g.markers,
		ts: g.ts
	}));
}
/** "2026-03-10" or "2026-03-10 to 2026-03-12" for a cluster. */
const groupDate = (g) => g.ts.length > 1 ? `${g.ts[0]} to ${g.ts[g.ts.length - 1]}` : g.ts[0] ?? "";
const annotationCount = (n) => `${n} annotation${n === 1 ? "" : "s"}`;
// src/charts/change.ts
/**
* One change description for every figure with a comparison: admin KPI cards, table change cells, the chart
* tooltip, dashboard tiles, the share page and the email. Pure, no DOM: the server renderers import it too.
*
* Classes, from the metric and its format:
* - count (`number`): relative change, then the absolute difference and the previous value (`+12.0%`, `+231, from 1,925`).
* - rate (`percent`, rates and shares): the difference in percentage points (`+1.2 pp`, `from 41.0%`), no relative percent.
* - duration, decimal and money: relative change, then the difference in the metric's own unit; money stays in
*   the one currency of the format (a report answers in one currency, amounts are never converted or mixed).
* - position (Search): the difference in positions with its judgement (`0.4 better`, `from 8.2`), no percent.
*
* Judgement: the arrow shows the raw direction; better, worse or neutral comes from `LOWER_IS_BETTER` and
* `NO_JUDGEMENT` below. Every other metric is higher-is-better (traffic volume, engagement, revenue, orders).
*/
/** Metrics where a fall is good news. */
const LOWER_IS_BETTER = /* @__PURE__ */ new Set([
	"bounce_rate",
	"exit_rate",
	"position",
	"pct_short",
	"pct_bad",
	"pogo_stick_rate",
	"returned_from_search_rate",
	"search_reentry_rate",
	"back_nav_rate",
	"refunds",
	"drop_off",
	"est_lost_revenue"
]);
/**
* Metrics with no better or worse: a live count ("Active now" is not a period figure) and the measured share
* of Satisfaction (how much of the traffic the rates rest on, a coverage figure, not an outcome).
*/
const NO_JUDGEMENT = /* @__PURE__ */ new Set(["realtime", "measured_rate"]);
const SMALL_NOTE = `Small numbers: the comparison rests on under 30 for a count or under 100 sessions for a rate or average, so a large change can be chance.`;
const ARROW = {
	up: "↑",
	down: "↓",
	flat: "→"
};
const num$1 = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
const one = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1
});
const pct = (r) => `${r > 0 ? "+" : r < 0 ? "-" : ""}${one.format(Math.abs(r * 100))}%`;
function unitOf(metric, f) {
	if (metric === "position") return "positions";
	if (f === "percent") return "pp";
	if (f === "duration" || f === "decimal") return f;
	if (f.startsWith("money:")) return f;
	return "count";
}
/** A signed difference in the unit: `+231`, `-12s`, `+0.12`, `+120.00 EUR`, `+1.2 pp`. */
function signed(abs, unit, f) {
	const sign = abs > 0 ? "+" : abs < 0 ? "-" : "";
	if (unit === "pp") return `${sign}${Math.abs(abs * 100).toFixed(1)} pp`;
	return `${sign}${fmt(Math.abs(abs), unit === "count" ? "number" : f)}`;
}
/**
* Change of `metric` from `previous` to `current`. `previous` or `current` missing: `kind: "none"`.
*/
function describeChange(metric, current, previous, opts) {
	const f = opts.format;
	const unit = unitOf(metric, f);
	const cur = num$1(current);
	const prev = unit === "positions" && num$1(previous) === 0 ? null : num$1(previous);
	if (cur === null || prev === null || unit === "positions" && cur === 0) return {
		kind: "none",
		direction: null,
		judgement: null,
		rel: null,
		abs: null,
		unit,
		label: "No comparison",
		detail: "",
		muted: true,
		note: opts.reason ?? "One of the two periods has no figure for this metric (no data, days not loaded yet, or a source not connected).",
		words: "no comparison"
	};
	const abs = cur - prev;
	const shown = unit === "pp" ? abs * 100 : unit === "positions" ? abs : prev === 0 ? abs : abs / Math.abs(prev) * 100;
	const direction = Math.abs(shown) < .05 ? "flat" : abs > 0 ? "up" : "down";
	const lower = opts.lowerIsBetter ?? LOWER_IS_BETTER.has(metric);
	const judgement = direction === "flat" || NO_JUDGEMENT.has(metric) ? "neutral" : direction === "up" !== lower ? "better" : "worse";
	const small = unit === "count" ? Math.abs(prev) < 30 : opts.base != null && opts.base < 100;
	const from = `from ${fmt(prev, f)}`;
	const base = {
		direction,
		judgement,
		abs,
		unit,
		muted: small,
		note: small ? SMALL_NOTE : null
	};
	const judged = judgement === "neutral" ? "" : `, ${judgement}`;
	const quiet = small ? ", small numbers" : "";
	if (direction === "flat") return {
		...base,
		kind: "change",
		rel: unit === "pp" || unit === "positions" ? null : 0,
		muted: false,
		note: null,
		label: "No change",
		detail: from,
		words: "no change"
	};
	if (unit === "pp") {
		const label = signed(abs, unit, f);
		return {
			...base,
			kind: "change",
			rel: null,
			label,
			detail: from,
			words: `${direction} ${Math.abs(abs * 100).toFixed(1)} percentage points${judged}${quiet}`
		};
	}
	if (unit === "positions") {
		const n = Math.abs(abs).toFixed(1);
		return {
			...base,
			kind: "change",
			rel: null,
			label: `${n} ${judgement}`,
			detail: from,
			words: `${n} positions ${judgement}${quiet}`
		};
	}
	if (prev === 0) return {
		...base,
		kind: "new",
		rel: null,
		muted: true,
		note: null,
		label: "New",
		detail: `${signed(abs, unit, f)}, ${from}`,
		words: "new, previously 0"
	};
	const rel = abs / Math.abs(prev);
	if (small) return {
		...base,
		kind: "change",
		rel,
		label: signed(abs, unit, f),
		detail: from,
		words: `${direction} ${signed(abs, unit, f).slice(1)}${judged}${quiet}`
	};
	return {
		...base,
		kind: "change",
		rel,
		label: pct(rel),
		detail: `${signed(abs, unit, f)}, ${from}`,
		words: `${direction} ${one.format(Math.abs(rel * 100))} percent${judged}`
	};
}
/** The change as one plain line (email, share page, tooltip): `↑ +12.0% better, +231, from 1,925`; `short` leaves out the detail. */
function changeText(c, short = false) {
	if (c.kind === "none") return short ? c.label : `${c.label}: ${c.note ?? "One of the two periods has no figure for this metric (no data, days not loaded yet, or a source not connected)."}`;
	const word = c.kind === "change" && c.unit !== "positions" && c.judgement !== "neutral" ? ` ${c.judgement}` : "";
	return `${c.direction ? `${ARROW[c.direction]} ` : ""}${c.label}${word}${!short && c.detail ? `, ${c.detail}` : ""}${c.kind === "change" && c.muted ? " (small numbers)" : ""}`;
}
/** Sessions, else impressions, else orders of a previous totals record: what a rate or average rests on. */
function rateBase(prev) {
	for (const k of [
		"sessions",
		"impressions",
		"orders"
	]) {
		const v = num$1(prev?.[k]);
		if (v !== null) return v;
	}
}
// src/annotations/target.ts
/**
* The target KPI of an annotation and the verdict of its impact row (Annotations page, `annotation_impacts`).
* One target per annotation, in the vocabulary of the `impact` report: `{ report, metric, params? }`. Pure and
* free of host code: the config route, the agent API, the report and the admin bundle share it.
*/
const TARGET_MESSAGES = {
	metric: "This metric is not offered for that report.",
	key: "Pick the row to measure (a channel, a page, an event or a query).",
	goal: "Pick a goal."
};
/** Write and read schema of `target`. Refinements only (no transform), so the MCP tool input stays JSON Schema representable. */
const TargetSchema = z.object({
	report: z.enum(IMPACT_REPORTS),
	metric: z.string().regex(/^[a-z0-9_]{1,40}$/),
	params: z.object({
		key: z.string().min(1).max(512).optional(),
		goal: z.string().min(1).max(128).optional(),
		source: z.enum([
			"all",
			"google",
			"bing"
		]).optional(),
		prop: z.string().regex(PROP_KEY_RE).optional(),
		currency: z.string().min(3).max(8).optional()
	}).strict().optional()
}).strict().superRefine((t, ctx) => {
	if (!IMPACT_METRICS[t.report].includes(t.metric)) ctx.addIssue({
		code: "custom",
		path: ["metric"],
		message: TARGET_MESSAGES.metric
	});
	if (t.report === "goals" && !t.params?.goal) ctx.addIssue({
		code: "custom",
		path: ["params", "goal"],
		message: TARGET_MESSAGES.goal
	});
	else if (IMPACT_KEY_DIM[t.report] && !t.params?.key) ctx.addIssue({
		code: "custom",
		path: ["params", "key"],
		message: TARGET_MESSAGES.key
	});
});
const isSearchTarget = (t) => t.report.startsWith("search_");
/** No target set: visitors of the scope, or Search clicks for a query scoped annotation while Search is connected. */
function defaultTarget(scope, searchOn) {
	return searchOn && scope?.query?.length ? {
		report: "search_overview",
		metric: "clicks"
	} : {
		report: "overview",
		metric: "visitors"
	};
}
/** A rate or average that moved less than this share of its before value is flat. */
const FLAT_SHARE = .05;
/**
* Up, Down or Flat from equal complete windows; Too early while the after window is short; Not enough data
* when a value is missing or the base is small. Counts use the `notable` noise rule of the impact report,
* rates and averages a 5 percent band. The verdict is the raw direction: `good` says whether it is good news.
*/
function verdictOf(metric, f) {
	if (f.days_after < f.window) return {
		verdict: "too_early",
		good: null
	};
	const b = f.before ?? null;
	const a = f.after ?? null;
	if (b === null || a === null) return {
		verdict: "no_data",
		good: null
	};
	let flat;
	if (COUNT_METRICS.has(metric)) {
		if (a + b < 20) return {
			verdict: "no_data",
			good: null
		};
		flat = f.notable === false || a === b;
	} else {
		const base = f.measured ? Math.min(f.measured.before ?? 0, f.measured.after ?? 0) : null;
		if (base !== null && base < 50) return {
			verdict: "no_data",
			good: null
		};
		flat = b === 0 ? a === 0 : Math.abs(a - b) / Math.abs(b) < FLAT_SHARE;
	}
	if (flat) return {
		verdict: "flat",
		good: null
	};
	const verdict = a > b ? "up" : "down";
	return {
		verdict,
		good: verdict === "up" !== LOWER_IS_BETTER.has(metric)
	};
}
/**
* Two scopes can measure the same traffic: either is site-wide, or both name the same rule. Pattern rules of
* different values are treated as separate (a shared prefix is the common case, and it shares the rule).
*/
function scopesOverlap(a, b) {
	if (!a || !b) return true;
	const rules = (s) => [
		"host",
		"path",
		"query"
	].flatMap((k) => (s[k] ?? []).map((r) => `${k}\u0000${r.op}\u0000${r.value}`));
	const ra = rules(a);
	if (!ra.length) return true;
	const rb = new Set(rules(b));
	return !rb.size || ra.some((r) => rb.has(r));
}
const SCOPE_KINDS = [
	"host",
	"path",
	"query"
];
const KIND_OPS = {
	host: ["is", "regex"],
	path: [
		"is",
		"prefix",
		"regex"
	],
	query: ["is", "regex"]
};
/** The filter dimension each kind pairs with. */
const KIND_DIM = {
	host: "host",
	path: "page",
	query: "query"
};
/** Kind labels of the popover, the list and the shared page. */
const KIND_LABELS = {
	manual: "Manual",
	publish: "Published",
	update: "Updated",
	release: "Release"
};
const SCOPE_MESSAGES = {
	empty: "Add at least one rule or choose Site-wide.",
	host: "Host must be a lowercase hostname without scheme or port.",
	path: "Path must start with /.",
	count: "At most 10 rules per kind and 20 in total.",
	mixed: "Combine fewer rules of different kinds in one scope.",
	version: "Unknown scope version.",
	noSource: "Query rules apply to Search data only; this site has no Search source yet."
};
const HOST_RE = /^[a-z0-9.-]{1,253}$/;
const RuleSchema = z.object({
	op: z.enum([
		"is",
		"prefix",
		"regex"
	]),
	value: z.string().min(1).max(512)
}).strict();
/** Escape a literal for use inside a regex. */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
/** The one regex a kind with mixed ops compiles to. */
function mixedPattern(rules) {
	return rules.map((r) => r.op === "is" ? `^${escapeRegex(r.value)}$` : r.op === "prefix" ? `^${escapeRegex(r.value)}` : `(?:${r.value})`).join("|");
}
const isMixed = (rules) => new Set(rules.map((r) => r.op)).size > 1;
/**
* Write schema. Site-wide forms: absent, `{}`, `{ v: 1 }`. The output always carries `v: 1` and only
* non-empty rule lists.
*/
/** The plain shape, without the checks and the normalizing transform (the MCP tool input must be JSON Schema representable). */
const ScopeShape = z.object({
	v: z.number().optional(),
	host: z.array(RuleSchema).optional(),
	path: z.array(RuleSchema).optional(),
	query: z.array(RuleSchema).optional()
}).strict();
/** Typed by hand: the inferred refine and transform chain costs the type checker more than it is worth. */
const ScopeSchema = ScopeShape.superRefine((s, ctx) => {
	if (s.v !== void 0 && s.v !== 1) {
		ctx.addIssue({
			code: "custom",
			path: ["v"],
			message: SCOPE_MESSAGES.version,
			params: { code: "scope_unknown_version" }
		});
		return;
	}
	let total = 0;
	for (const kind of SCOPE_KINDS) {
		const rules = s[kind] ?? [];
		total += rules.length;
		if (rules.length > 10) ctx.addIssue({
			code: "custom",
			path: [kind],
			message: SCOPE_MESSAGES.count
		});
		rules.forEach((r, i) => {
			const at = [
				kind,
				i,
				"value"
			];
			if (!KIND_OPS[kind].includes(r.op)) ctx.addIssue({
				code: "custom",
				path: [
					kind,
					i,
					"op"
				],
				message: `The operator ${r.op} is not allowed for ${kind} rules.`
			});
			else if (r.op === "regex") {
				const v = validateSafeRegex(r.value, "i");
				if (!v.ok) ctx.addIssue({
					code: "custom",
					path: at,
					message: v.error
				});
			} else if (kind === "host" && !HOST_RE.test(r.value)) ctx.addIssue({
				code: "custom",
				path: at,
				message: SCOPE_MESSAGES.host
			});
			else if (kind === "path" && !r.value.startsWith("/")) ctx.addIssue({
				code: "custom",
				path: at,
				message: SCOPE_MESSAGES.path
			});
		});
		if (rules.length <= 10 && isMixed(rules) && rules.every((r) => KIND_OPS[kind].includes(r.op)) && !validateSafeRegex(mixedPattern(rules), "i").ok) ctx.addIssue({
			code: "custom",
			path: [kind],
			message: SCOPE_MESSAGES.mixed
		});
	}
	if (total > 20) ctx.addIssue({
		code: "custom",
		message: SCOPE_MESSAGES.count
	});
}).transform((s) => {
	const out = { v: 1 };
	for (const kind of SCOPE_KINDS) if (s[kind]?.length) out[kind] = s[kind];
	return out;
});
/** The `path` write shortcut: one page path. */
const PathShortcut = z.string().max(512).refine((p) => p === "" || p.startsWith("/"), { message: SCOPE_MESSAGES.path });
/**
* Write side: `path` stands for one path `is` rule; `path` with `scope` is a conflict (null).
* A site-wide scope is stored as no scope.
*/
function scopeInput(path, scope) {
	if (path && scope) return null;
	if (path) return {
		v: 1,
		path: [{
			op: "is",
			value: path
		}]
	};
	return scope && !isSiteWide(scope) ? scope : void 0;
}
const isSiteWide = (scope) => !scope || SCOPE_KINDS.every((k) => !scope[k]?.length);
const Stored = z.object({
	site: z.string().optional(),
	ts: z.number(),
	kind: z.string(),
	text: z.string(),
	scope: z.unknown().optional(),
	target: z.unknown().optional(),
	collection: z.string().optional(),
	ref: z.string().optional(),
	slug: z.string().optional()
}).passthrough();
/**
* Read side for every reader: an unreadable scope reads as site-wide with a notice. Null for a
* malformed record.
*/
function normalizeAnnotation(record, id) {
	const r = Stored.safeParse(record);
	if (!r.success) return null;
	const { site, ts, kind, text, scope, target, collection, ref, slug } = r.data;
	const out = {
		...id !== void 0 ? { id } : {},
		...site !== void 0 ? { site } : {},
		ts,
		kind,
		text
	};
	if (scope !== void 0 && scope !== null) {
		const s = ScopeSchema.safeParse(scope);
		if (s.success) {
			if (!isSiteWide(s.data)) out.scope = s.data;
		} else out.notice = "scope_unknown_version";
	}
	const t = target === void 0 ? null : TargetSchema.safeParse(target);
	if (t?.success) out.target = t.data;
	if (collection !== void 0) out.collection = collection;
	if (ref !== void 0) out.ref = ref;
	if (slug !== void 0) out.slug = slug;
	return out;
}
const test = (cache, p, v) => {
	const key = `${p}\u0000${v}`;
	const hit = cache.get(key);
	if (typeof hit === "boolean") return hit;
	if (!cache.has(p)) cache.set(p, compileSafeRegex(p, "i"));
	const out = cache.get(p)?.test(v) ?? false;
	cache.set(key, out);
	return out;
};
/** Does the concrete value `v` pass the positive form of filter op `op` with value `fv`? */
function valuePasses(kind, op, fv, v, cache) {
	const ci = kind !== "path";
	const a = ci ? v.toLowerCase() : v;
	const b = ci ? fv.toLowerCase() : fv;
	switch (op) {
		case "is":
		case "is_not": return a === b;
		case "prefix":
		case "not_prefix": return a.startsWith(b);
		case "contains":
		case "not_contains": return a.includes(b);
		default: return test(cache, fv, v);
	}
}
/** Does rule `r` intersect the value `fv` of a positive filter with op `op`? */
function intersects(kind, r, op, fv, cache) {
	if (r.op === "is") return valuePasses(kind, op, fv, r.value, cache);
	if (op === "is") {
		if (r.op === "prefix") return fv.startsWith(r.value);
		return test(cache, r.value, fv);
	}
	if (r.op === "prefix" && op === "prefix") return fv.startsWith(r.value) || r.value.startsWith(fv);
	return true;
}
function kindPasses(kind, rules, filters, cache) {
	const dim = KIND_DIM[kind];
	const on = filters.filter((f) => f.dim === dim);
	if (!on.length) return true;
	const neg = on.filter((f) => NEGATED.has(f.op));
	const alive = rules.filter((r) => r.op !== "is" || !neg.some((f) => f.values.some((fv) => valuePasses(kind, f.op, fv, r.value, cache))));
	if (!alive.length) return false;
	return on.filter((f) => !NEGATED.has(f.op)).every((f) => f.values.some((fv) => alive.some((r) => intersects(kind, r, f.op, fv, cache))));
}
/** The one matching function. Pass the same `cache` across a list. */
function annotationMatches(a, c, cache = /* @__PURE__ */ new Map()) {
	if (a.site !== void 0 && a.site !== c.site) return false;
	const day = dayInZone(a.ts, c.tz);
	if (day < c.from || day > c.to) return false;
	const s = a.scope;
	if (!s) return true;
	if (s.query?.length && c.target !== "search") return false;
	return SCOPE_KINDS.every((k) => !s[k]?.length || kindPasses(k, s[k], c.filters, cache));
}
const annotationView = (a, tz) => ({
	...a.id !== void 0 ? { id: a.id } : {},
	ts: a.ts,
	day: dayInZone(a.ts, tz),
	kind: a.kind,
	text: a.text,
	scope: a.scope ?? null,
	summary: scopeSummary(a.scope)
});
/** The matching annotations of a list, oldest first, with one regex cache for the whole list. */
function matchAnnotations(list, c) {
	const cache = /* @__PURE__ */ new Map();
	return list.filter((a) => annotationMatches(a, c, cache)).sort((x, y) => x.ts - y.ts);
}
/**
* Scope to filters for anything that runs SQL: one filter per op per kind, a kind with
* mixed ops as one regex filter. `normalizePage` maps path `is` values to page keys on search targets.
*/
function scopeToFilters(scope, target, normalizePage) {
	const filters = [];
	const notices = [];
	if (!scope) return {
		filters,
		notices
	};
	for (const kind of SCOPE_KINDS) {
		const rules = scope[kind];
		if (!rules?.length) continue;
		if (kind === "host" && target === "search") {
			notices.push("scope_host_not_applied");
			continue;
		}
		if (kind === "query" && target === "traffic") {
			notices.push("scope_query_not_applied");
			continue;
		}
		const dim = KIND_DIM[kind];
		const list = kind === "path" && target === "search" && normalizePage ? rules.map((r) => r.op === "is" ? {
			...r,
			value: normalizePage(r.value)
		} : r) : rules;
		if (isMixed(list)) filters.push({
			dim,
			op: "regex",
			values: [mixedPattern(list)]
		});
		else filters.push({
			dim,
			op: list[0].op,
			values: list.map((r) => r.value)
		});
	}
	return {
		filters,
		notices
	};
}
const NOUN = {
	host: ["Host", "Hosts"],
	path: ["Page", "Pages"],
	query: ["Query", "Queries"]
};
function ruleSummary(kind, r) {
	const [one, many] = NOUN[kind];
	if (r.op === "is") return `${one} ${r.value}`;
	if (r.op === "prefix") return `${many} starting with ${r.value}`;
	return `${many} matching ${r.value}`;
}
/** Short human form. */
function scopeSummary(scope) {
	if (!scope || isSiteWide(scope)) return "Site-wide";
	const parts = [];
	for (const kind of SCOPE_KINDS) {
		const rules = scope[kind];
		if (!rules?.length) continue;
		if (rules.length <= 2) parts.push(rules.map((r) => ruleSummary(kind, r)).join(" or "));
		else if (kind === "query" && rules.every((r) => r.op === "is")) parts.push(`Queries: ${rules.length} terms`);
		else parts.push(`${NOUN[kind][1]}: ${rules.length} rules`);
	}
	return parts.join(" and ");
}
/**
* The annotation list search: a case-insensitive substring of the title, the kind (and its label), the scope (its
* summary and every rule value) or the source item's slug and collection. A plain substring, so `%` and `_` are literal.
*/
function annotationSearchMatches(a, q) {
	const term = q.trim().toLowerCase();
	if (!term) return true;
	const rules = SCOPE_KINDS.flatMap((k) => a.scope?.[k]?.map((r) => r.value) ?? []);
	return [
		a.text,
		a.kind,
		KIND_LABELS[a.kind] ?? "",
		scopeSummary(a.scope ?? void 0),
		...rules,
		a.slug ?? "",
		a.collection ?? ""
	].some((s) => s.toLowerCase().includes(term));
}
const SEARCH_TARGET = (r) => r.startsWith("search_");
/** Target reports whose session metrics the `timeseries` report serves per day (with the key as a filter). */
const TRAFFIC_SERIES = /* @__PURE__ */ new Set([
	"overview",
	"channels",
	"sources",
	"campaigns",
	"countries",
	"devices",
	"browsers"
]);
const SESSION_SERIES = /* @__PURE__ */ new Set([
	"sessions",
	"visitors",
	"pageviews",
	"bounce_rate",
	"engaged_rate",
	"avg_duration",
	"views_per_session"
]);
const SEARCH_SERIES = /* @__PURE__ */ new Set([
	"clicks",
	"impressions",
	"ctr",
	"position"
]);
/** Denominator a rate metric is read with (`measured` in the response). */
function denominator(metric, report) {
	if (COUNT_METRICS.has(metric)) return null;
	if (report === "revenue") return metric === "revenue_per_visitor" ? "visitors" : metric === "revenue_per_session" ? "sessions" : "orders";
	if (metric === "ctr" || metric === "position" || metric === "impressions_share") return "impressions";
	const band = /^(?:share|ctr)_(.+)$/.exec(metric);
	if (band) return `impressions_${band[1]}`;
	if (report === "satisfaction") return metric === "search_reentry_rate" || metric === "returned_from_search_rate" ? "search_sessions" : metric === "pogo_stick_rate" ? "search_measured" : metric === "avg_duration" ? "sessions" : "measured";
	if (metric === "avg_time" || metric === "exit_rate") return "pageviews";
	if (report === "entry_pages") return "entries";
	if (metric === "bounce_rate" || metric === "engaged_rate" || metric === "avg_duration" || metric === "views_per_session") return "sessions";
	return null;
}
const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
/** The newest complete day: yesterday, and for search targets also the newest final day. */
async function lastCompleteDay(rc, search, source) {
	const yesterday = addDays(dayInZone(rc.now, rc.settings.siteTimezone), -1);
	const final = search ? await lastFinal(rc, source) : null;
	return {
		yesterday,
		last: final && final < yesterday ? final : yesterday
	};
}
/** Both windows of day `day` on one target; `filters` are the page's own. */
async function measure(rc, filters0, day, m, days) {
	const { report, metric, window, key } = m;
	const search = SEARCH_TARGET(report);
	const { yesterday, last: lastComplete } = days;
	const afterTo = addDays(day, window) < lastComplete ? addDays(day, window) : lastComplete;
	const n = afterTo > day ? daysBetween(addDays(day, 1), afterTo) : 0;
	if (n <= 0) return {
		not_yet: addDays(day, 2 + Math.max(0, daysBetween(lastComplete, yesterday) - 1)),
		complete: false,
		days_after: 0,
		notices: ["not_yet"]
	};
	const after = {
		from: addDays(day, 1),
		to: afterTo
	};
	const before = {
		from: addDays(day, -n),
		to: addDays(day, -1)
	};
	const target = search ? "search" : "traffic";
	const pageKey = (path) => search ? normalizeUrl(path, []).path : path;
	const notices = [];
	const filters = [...filters0];
	if (m.scope) {
		const s = scopeToFilters(m.scope, target, pageKey);
		filters.push(...s.filters);
		notices.push(...s.notices);
	}
	if (m.path) filters.push({
		dim: "page",
		op: "is",
		values: [pageKey(m.path)]
	});
	const keyDim = IMPACT_KEY_DIM[report];
	const runFilters = key && keyDim ? [...filters, {
		dim: keyDim,
		op: "is",
		values: [key]
	}] : filters;
	const query = (from, to, f, granularity = "auto") => ({
		from,
		to,
		filters: [...f],
		compare: "none",
		granularity
	});
	const run = (r) => rc.dispatch?.({
		report,
		query: query(r.from, r.to, runFilters),
		...Object.keys(m.params).length ? { params: m.params } : {},
		limit: 1e3,
		lean: true
	});
	const [b, a] = [await run(before), await run(after)];
	const pick = (d) => {
		if (!d) return void 0;
		if (!key) return d.totals;
		return d.rows?.find((r) => r.key === key);
	};
	const pb = pick(b?.data);
	const pa = pick(a?.data);
	for (const x of [...b?.notices ?? [], ...a?.notices ?? []]) if (!notices.includes(x)) notices.push(x);
	const vb = num(pb?.[metric]);
	const va = num(pa?.[metric]);
	const delta = vb === null || va === null ? null : Math.round((va - vb) * 1e4) / 1e4;
	const out = {
		...key ? { key } : {},
		complete: n >= window,
		days_after: n,
		periods: {
			before,
			after
		},
		before: vb,
		after: va,
		delta,
		delta_pct: vb === null || va === null || vb === 0 ? null : Math.round((va - vb) / vb * 1e4) / 1e4,
		notices: [
			...notices,
			...n < window ? ["incomplete"] : [],
			...vb === null && va === null ? ["metric_unavailable"] : []
		]
	};
	if (report === "revenue") out.currency = a?.data.currency ?? b?.data.currency ?? null;
	if (COUNT_METRICS.has(metric) && vb !== null && va !== null) out.notable = Math.abs(va - vb) > 2 * Math.sqrt(va + vb);
	const den = denominator(metric, report);
	if (den) out.measured = {
		before: num(pb?.[den]),
		after: num(pa?.[den])
	};
	const seriesReport = search && SEARCH_SERIES.has(metric) && report !== "search_position_bands" ? "search_overview" : !search && TRAFFIC_SERIES.has(report) && SESSION_SERIES.has(metric) ? "timeseries" : null;
	if (m.series && seriesReport) {
		out.series = ((await rc.dispatch?.({
			report: seriesReport,
			query: query(before.from, after.to, runFilters, "day"),
			...m.params.source && search ? { params: { source: m.params.source } } : {},
			lean: true
		}))?.data.series ?? []).map((pt) => ({
			t: pt.t,
			value: num(pt[metric])
		}));
		out.marker = day;
	}
	if (m.context) {
		const tf = [
			...filters0,
			...m.scope ? scopeToFilters(m.scope, "traffic").filters : [],
			...m.path ? [{
				dim: "page",
				op: "is",
				values: [m.path]
			}] : []
		];
		const kpi = async (r) => (await rc.dispatch?.({
			report: "overview",
			query: query(r.from, r.to, tf),
			lean: true
		}))?.data.totals ?? null;
		out.context = {
			before: await kpi(before),
			after: await kpi(after)
		};
	}
	return out;
}
async function impact(rc, input) {
	const p = input.params;
	const report = p.report;
	if (!report || !IMPACT_REPORTS.includes(report)) throw new QueryError("invalid_params", `impact needs params.report, one of ${IMPACT_REPORTS.join(", ")}.`);
	const metric = p.metric;
	if (!metric || !IMPACT_METRICS[report].includes(metric)) throw new QueryError("invalid_params", `Unknown metric ${metric ?? "(none)"} for ${report}; allowed: ${IMPACT_METRICS[report].join(", ")}.`);
	if (!rc.dispatch) throw new QueryError("invalid_params", "impact runs through the report dispatcher.");
	const tz = rc.settings.siteTimezone;
	const window = p.window ?? 28;
	const search = SEARCH_TARGET(report);
	const scopeMode = p.scope === "none" ? "none" : "annotation";
	let annotation = null;
	let day;
	if (p.annotation) {
		annotation = await rc.annotationStore?.resolve(p.annotation, p.kind) ?? null;
		if (!annotation) {
			if (p.annotation === "latest") return {
				no_annotation: true,
				report,
				metric,
				window,
				caution: SEO_TEXT.caution,
				notices: ["no_annotation"]
			};
			throw new QueryError("not_found", "Unknown annotation.");
		}
		day = dayInZone(annotation.ts, tz);
	} else if (p.at) day = p.at;
	else throw new QueryError("invalid_params", "impact needs params.annotation or params.at.");
	const annotationOut = annotation ? {
		id: annotation.id ?? null,
		ts: annotation.ts,
		kind: annotation.kind,
		text: annotation.text,
		scope: annotation.scope ?? null,
		summary: scopeSummary(annotation.scope)
	} : void 0;
	const base = {
		...annotationOut ? { annotation: annotationOut } : {},
		day,
		window,
		report,
		metric,
		scope: scopeMode,
		caution: SEO_TEXT.caution
	};
	const key = report === "goals" ? p.goal ?? p.key : p.key;
	if (!key && (report === "goals" || IMPACT_KEY_DIM[report])) throw new QueryError("invalid_params", `impact over ${report} needs params.key${report === "goals" ? " or params.goal" : ""}.`);
	const targetParams = {
		...p.source ? { source: p.source } : {},
		...p.prop ? { prop: p.prop } : {},
		...p.dim ? { dim: p.dim } : {},
		...p.currency ? { currency: p.currency } : {}
	};
	const m = {
		report,
		metric,
		window,
		key,
		path: p.path,
		scope: scopeMode === "annotation" ? annotation?.scope : void 0,
		params: targetParams,
		series: true,
		context: p.context === true
	};
	const out = {
		...base,
		...await measure(rc, input.filters, day, m, await lastCompleteDay(rc, search, p.source ?? "all"))
	};
	if (out.not_yet) return out;
	const periods = out.periods;
	out.overlapping = (await rc.annotationStore?.inRange(periods.before.from, periods.after.to) ?? []).filter((o) => !(annotation && (annotation.id !== void 0 ? o.id === annotation.id : o.ts === annotation.ts && o.text === annotation.text))).sort((x, y) => x.ts - y.ts).map((o) => ({
		id: o.id ?? null,
		ts: o.ts,
		kind: o.kind,
		text: o.text
	}));
	return out;
}
const SCOPE_KINDS_FILTER = [
	"site",
	"host",
	"path",
	"query"
];
const scopeKindOf = (a) => a.scope ? [
	"host",
	"path",
	"query"
].filter((k) => a.scope?.[k]?.length) : ["site"];
/**
* One page of the range's annotations, newest first, each measured on its target KPI (or the default) over equal
* windows, with the verdict and the overlapping annotations of the same scope. One annotation read for the page;
* the target runs go through the cached dispatcher, so two rows with the same target and day share them.
*/
async function annotationImpacts(rc, input) {
	if (!rc.dispatch || !rc.annotationStore) throw new QueryError("invalid_params", "annotation_impacts runs through the report dispatcher.");
	const p = input.params;
	const tz = rc.settings.siteTimezone;
	const window = p.window ?? 14;
	const cap = rc.settings.capacityProfile === "small" ? 5 : 6;
	const limit = Math.min(input.limit, cap);
	const searchOn = p.withSearch === true && await lastFinal(rc, "all") !== null;
	const all = await rc.annotationStore.inRange(addDays(input.from, -window), addDays(input.to, window));
	const dayOf = (a) => dayInZone(a.ts, tz);
	const list = all.filter((a) => dayOf(a) >= input.from && dayOf(a) <= input.to && (!p.kind || a.kind === p.kind) && (!p.scopeKind || scopeKindOf(a).includes(p.scopeKind)) && (!p.q || annotationSearchMatches(a, p.q))).sort((x, y) => y.ts - x.ts);
	const page = list.slice(input.offset, input.offset + limit);
	const days = {
		traffic: await lastCompleteDay(rc, false, "all"),
		search: /* @__PURE__ */ new Map()
	};
	const rows = [];
	for (const a of page) {
		const day = dayOf(a);
		const target = a.target ?? defaultTarget(a.scope, searchOn);
		const search = isSearchTarget(target);
		const source = target.params?.source ?? "all";
		let d = search ? days.search.get(source) : days.traffic;
		if (!d) days.search.set(source, d = await lastCompleteDay(rc, true, source));
		const goal = target.params?.goal;
		const key = target.report === "goals" ? goal ? rc.goalNames?.get(goal) ?? goal : void 0 : target.params?.key;
		const { key: _k, goal: _g, ...params } = target.params ?? {};
		const figures = search && !searchOn ? {
			complete: false,
			days_after: window,
			before: null,
			after: null,
			notices: ["search_no_data"]
		} : await measure(rc, input.filters, day, {
			report: target.report,
			metric: target.metric,
			window,
			key,
			scope: a.scope,
			params,
			series: false,
			context: false
		}, d);
		const periods = figures.periods;
		const from = periods?.before.from ?? addDays(day, -window);
		const to = periods?.after.to ?? addDays(day, window);
		const overlaps = all.filter((o) => o.id !== a.id && dayOf(o) >= from && dayOf(o) <= to && scopesOverlap(a.scope, o.scope)).sort((x, y) => x.ts - y.ts).map((o) => ({
			id: o.id ?? null,
			day: dayOf(o),
			text: o.text
		}));
		const v = verdictOf(target.metric, {
			window,
			days_after: Number(figures.days_after ?? 0),
			before: figures.before,
			after: figures.after,
			...typeof figures.notable === "boolean" ? { notable: figures.notable } : {},
			...figures.measured ? { measured: figures.measured } : {}
		});
		const { collection, ref, slug } = a;
		rows.push({
			key: a.id ?? `${a.ts}`,
			annotation: {
				...annotationView(a, tz),
				target: a.target ?? null,
				...collection ? { collection } : {},
				...ref ? { ref } : {},
				...slug ? { slug } : {}
			},
			target,
			target_default: !a.target,
			...figures,
			window,
			...v,
			overlaps
		});
	}
	const searchThrough = [...days.search.values()].find((x) => x.last < x.yesterday)?.last;
	return {
		rows,
		total: list.length,
		window,
		limit,
		caution: SEO_TEXT.caution,
		...searchThrough ? { search_through: searchThrough } : {},
		notices: searchThrough ? ["search_lags"] : []
	};
}
// src/query/reports/sources.ts
/** Channel name of AI assistant referrals (data/channels.json). */
const AI_CHANNEL = "AI Assistants";
const NOT_SET = "'(not set)'";
const channels = (rc, input) => sessionBreakdown(rc, input, `COALESCE(s.channel, ${NOT_SET})`);
const sources = (rc, input) => sessionBreakdown(rc, input, `COALESCE(s.source, ${NOT_SET})`);
/** Sessions per value of one UTM field (default `utm_campaign`); sessions without it are left out. */
function campaigns(rc, input) {
	const col = `s.${input.params.field ?? "utm_campaign"}`;
	return sessionBreakdown(rc, input, col, {
		sql: `${col} IS NOT NULL`,
		params: []
	});
}
/** Sessions from AI assistants by source, with their top landing pages (a lower bound). */
async function aiReferrals(rc, input) {
	const d = await sessionBreakdown(rc, input, `COALESCE(s.source, ${NOT_SET})`, {
		sql: "s.channel = ?",
		params: [AI_CHANNEL]
	});
	const keys = (d.rows ?? []).map((r) => r.key);
	if (!keys.length) return d;
	const w = and([
		sessionWhere(rc.site, input.from, input.to, input.traffic?.session ?? {
			sql: "1 = 1",
			params: []
		}),
		{
			sql: "s.channel = ?",
			params: [AI_CHANNEL]
		},
		keysIn(rc, `COALESCE(s.source, ${NOT_SET})`, keys)
	]);
	const landing = await rc.db.all(`SELECT COALESCE(s.source, ${NOT_SET}) AS key, s.entry_path AS path, COUNT(*) AS n FROM ca_sessions s WHERE ${w.sql} GROUP BY COALESCE(s.source, ${NOT_SET}), s.entry_path ORDER BY n DESC, path`, w.params);
	const top = /* @__PURE__ */ new Map();
	for (const r of landing) {
		const list = top.get(String(r.key)) ?? [];
		if (list.length < 5) list.push({
			path: String(r.path),
			sessions: num$2(r.n)
		});
		top.set(String(r.key), list);
	}
	d.rows = d.rows?.map((r) => ({
		...r,
		landing: top.get(r.key) ?? []
	}));
	return d;
}
// src/query/reports/values.ts
const VALUES_LIMIT = 50;
/** Distinct values of one dimension for autocompletion (limit 50, optional prefix). */
async function dimensionValues(rc, input) {
	const { dim, prop, prefix, scope = "traffic" } = input.params;
	const d = dim ? (scope === "search" ? SEARCH_DIMS : TRAFFIC_DIMS)[dim] : void 0;
	if (!dim || !d) throw new QueryError("invalid_params", "dimension_values needs a valid params.dim.");
	const limit = Math.min(input.limit, VALUES_LIMIT);
	if (dim === "goal") {
		const p = (prefix ?? "").toLowerCase();
		return { rows: rc.goals.filter((g) => g.active !== false && g.name.toLowerCase().startsWith(p)).map((g) => g.name).slice(0, limit).map((key) => ({
			key,
			count: null
		})) };
	}
	let table;
	let expr;
	let base;
	if (d.scope === "search") {
		table = "ca_search_daily d";
		expr = `d.${ident(d.column)}`;
		base = {
			sql: `d.site = ? AND d.day BETWEEN ? AND ? AND ${expr} <> ''`,
			params: [
				rc.site,
				input.from,
				input.to
			]
		};
	} else if (d.scope === "session") {
		table = "ca_sessions s";
		expr = `s.${ident(d.column)}`;
		base = sessionWhere(rc.site, input.from, input.to, TRUE);
	} else {
		const h = entryCols(rc.db.dialect);
		table = `ca_sessions s CROSS JOIN ${entriesOf(rc.db.dialect)}`;
		if (dim === "event_prop") {
			if (!prop || !PROP_KEY_RE.test(prop)) throw new QueryError("invalid_params", "event_prop needs a valid params.prop.");
			expr = entryProp(rc.db.dialect, "h", prop);
		} else expr = dim === "page" ? h.path : h.name;
		base = and([visitDays(rc.site, input.from, input.to), {
			sql: d.kind === "pv" ? h.pv : h.ev,
			params: []
		}]);
	}
	const where = and([
		base,
		{
			sql: `${expr} IS NOT NULL`,
			params: []
		},
		prefix ? {
			sql: `lower(${expr}) LIKE lower(?) ${LIKE_ESCAPE}`,
			params: [`${likeEscape(prefix)}%`]
		} : TRUE
	]);
	return { rows: (await rc.db.all(`SELECT ${expr} AS v, COUNT(*) AS n FROM ${table} WHERE ${where.sql} GROUP BY ${expr} ORDER BY n DESC, v LIMIT ?`, [...where.params, limit])).map((r) => ({
		key: String(r.v),
		count: num$2(r.n)
	})) };
}
// src/content/path.ts
/**
* Public paths of content items: the one derivation shared by the publish and
* update hooks and the editor panel, plus the pattern classifier of the per-collection report.
*/
/** Placeholder syntax of `urlPattern`. */
const PLACEHOLDER = /\{(\w+)\}/g;
/** A `content.data` value that may fill a custom placeholder. */
const FILL_RE = /^[A-Za-z0-9._-]{1,128}$/;
/**
* Public path of a published item. The host's `getPublicUrl` (`content:read`) applies the collection's
* `urlPattern`, the date tokens, the locale prefix and the trailing slash rule exactly as the site renders
* them (`emdash/src/plugins/content-access.ts`); it fills `{slug}` and `{id}` only, so any other
* placeholder left literal is filled here from `content.data[name]` (a string or number matching
* `FILL_RE`). Null when the host cannot resolve the item (draft, not routable, no site URL), a
* placeholder stays unfilled, or the read fails. Never throws.
*/
async function derivePath(ctx, collection, content) {
	const id = typeof content.id === "string" ? content.id : null;
	if (!id) return null;
	try {
		const url = await ctx.content?.getPublicUrl?.(collection, id);
		if (!url) return null;
		const data = content.data ?? {};
		const filled = url.replace(PLACEHOLDER, (m, name) => {
			const v = Object.hasOwn(data, name) ? data[name] : void 0;
			const s = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
			return typeof s === "string" && FILL_RE.test(s) ? s : m;
		});
		const path = new URL(filled).pathname;
		if (/[{}]|%7B|%7D/i.test(path) || path.length > 512) return null;
		return path;
	} catch {
		return null;
	}
}
/** An optional leading locale segment (`/fr`, `/pt-br`); two letters so `/new/...` is never read as a locale. */
const LOCALE = "(?:/[a-z]{2}(?:-[a-z0-9]{2,4})?)?";
/**
* Anchored regex of a `urlPattern` (`{name}` to `[^/]+`, an optional locale segment first). A null
* pattern is the host default `/{collection}/{slug}` (`interpolateUrlPattern`). Slashes are normalized
* like the stored paths: repeats collapsed, no trailing slash, a leading one.
*/
function compilePattern(collection, urlPattern) {
	let p = (urlPattern ?? `/${collection}/{slug}`).replace(/\/{2,}/g, "/");
	if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
	if (!p.startsWith("/")) p = `/${p}`;
	const literals = p.split(PLACEHOLDER).filter((_, i) => i % 2 === 0);
	const body = literals.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+");
	return {
		collection,
		re: new RegExp(`^${LOCALE}${body}$`, "i"),
		literal: literals.join("").length
	};
}
/** Collection of a stored path: the matching pattern with the most literal characters, `(other)` when none matches. */
function classifyPath(path, patterns) {
	let best;
	for (const c of patterns) if (c.re.test(path) && (!best || c.literal > best.literal)) best = c;
	return best?.collection ?? "(other)";
}
let cached;
/** Routable collections, cached 5 minutes per isolate; empty without `schema:read`. A failed read is not cached. */
function loadCollections(schema, nowMs = Date.now()) {
	if (!schema) return Promise.resolve([]);
	if (cached && nowMs - cached.at < 3e5) return cached.value;
	const value = schema.listCollections().then((list) => list.filter((c) => c.routable).map((c) => ({
		slug: c.slug,
		urlPattern: c.urlPattern ?? null
	})));
	const entry = {
		at: nowMs,
		value
	};
	cached = entry;
	value.catch(() => cached === entry && (cached = void 0));
	return value;
}
async function collections(rc, input) {
	if (rc.collections === null) return {
		rows: [],
		notices: ["not_available_for_site"]
	};
	const patterns = (rc.collections ?? []).map((c) => compilePattern(c.slug, c.urlPattern));
	const read = (dim) => readSummary(rc, input.from, input.to, {
		table: "ca_rollup",
		dim,
		seg: ""
	});
	const rows = [...(await read("all")).map((r) => ({
		...r,
		dim: "all"
	})), ...(await read("page")).map((r) => ({
		...r,
		dim: "page"
	}))];
	const sums = /* @__PURE__ */ new Map();
	let dayTotal = 0;
	for (const r of rows) {
		if (r.dim === "all") {
			dayTotal += num$2(r.pageviews);
			continue;
		}
		if (r.key === "(other)") continue;
		const c = classifyPath(String(r.key), patterns);
		const s = sums.get(c) ?? {
			pageviews: 0,
			visitors: 0,
			sessions: 0,
			engaged_ms: 0,
			hits: 0,
			pages: 0
		};
		s.pageviews += num$2(r.pageviews);
		s.visitors += num$2(r.visitors);
		s.sessions += num$2(r.sessions);
		s.engaged_ms += num$2(r.engaged_ms);
		s.hits += num$2(r.hits);
		s.pages += 1;
		sums.set(c, s);
	}
	const all = [...sums].map(([key, s]) => ({
		key,
		pageviews: s.pageviews,
		visitors: s.visitors,
		sessions: s.sessions,
		avg_time: round(ratio(s.engaged_ms / 1e3, s.hits), 1),
		pages: s.pages
	})).sort((a, b) => b.pageviews - a.pageviews || (a.key === "(other)" ? 1 : b.key === "(other)" ? -1 : a.key < b.key ? -1 : 1));
	const classified = all.reduce((a, r) => a + num$2(r.pageviews), 0);
	return {
		rows: all.slice(input.offset, input.offset + input.limit),
		truncated: all.length > input.offset + input.limit,
		totals: {
			pageviews: classified,
			day_pageviews: dayTotal,
			coverage: round(ratio(classified, dayTotal))
		},
		...input.filters.length ? { notices: ["filters_not_applied"] } : {}
	};
}
// src/query/reports/sitesearch.ts
/**
* Internal site search: the terms kept in the query (`qs`) of page view entries under the configured
* parameter names, raw window only. One statement: the distinct query strings carrying a name (a `LIKE`
* prefilter per name), at most 5,000, parsed in JS with an exact name match.
*/
const SITE_SEARCH_DISTINCT_CAP = 5e3;
async function siteSearch(rc, input) {
	const names = rc.siteSearchParams ?? [];
	if (!names.length) return {
		rows: [],
		notices: ["site_search_off"]
	};
	const hq = entryCols(rc.db.dialect).query;
	const like = {
		sql: names.map(() => `${hq} LIKE ? ${LIKE_ESCAPE}`).join(" OR "),
		params: names.map((n) => `%${likeEscape(n)}=%`)
	};
	const j = hitJoin(rc, input, "pv", like);
	const strings = await rc.db.all(`SELECT ${hq} AS q, COUNT(*) AS searches, COUNT(DISTINCT s.sid) AS sessions ${j.sql} GROUP BY ${hq} ORDER BY searches DESC, q LIMIT ?`, [...j.params, 5001]);
	const terms = /* @__PURE__ */ new Map();
	for (const r of strings.slice(0, SITE_SEARCH_DISTINCT_CAP)) {
		const params = new URLSearchParams(String(r.q ?? ""));
		const seen = /* @__PURE__ */ new Set();
		for (const [k, v] of params) if (names.includes(k) && v) seen.add(v);
		for (const term of seen) {
			const t = terms.get(term) ?? {
				searches: 0,
				sessions: 0,
				strings: 0
			};
			t.searches += num$2(r.searches);
			t.sessions += num$2(r.sessions);
			t.strings += 1;
			terms.set(term, t);
		}
	}
	let all = [...terms].map(([key, t]) => ({
		key,
		searches: t.searches,
		sessions: t.sessions,
		searches_per_session: round(ratio(t.searches, t.sessions), 2),
		sessions_upper_bound: t.strings > 1
	})).sort((a, b) => b.searches - a.searches || b.sessions - a.sessions || (a.key < b.key ? -1 : 1));
	let hidden_terms;
	if (rc.publicSurface) {
		const kept = all.filter((r) => num$2(r.sessions) >= 2);
		hidden_terms = all.length - kept.length;
		all = kept;
	}
	return {
		rows: all.slice(input.offset, input.offset + input.limit),
		truncated: all.length > input.offset + input.limit,
		totals: {
			searches: all.reduce((a, r) => a + num$2(r.searches), 0),
			terms: all.length
		},
		...hidden_terms !== void 0 ? { hidden_terms } : {},
		...strings.length > 5e3 ? { notices: ["site_search_capped"] } : {}
	};
}
// src/query/reports/sites-summary.ts
/** Revenue entries per currency, largest first, amounts rounded to the currency's minor unit. */
function revenueList(m) {
	return [...m ?? []].map(([currency, v]) => ({
		currency,
		revenue: roundMinor(v.revenue, currency),
		orders: v.orders
	})).sort((a, b) => b.revenue - a.revenue || (a.currency < b.currency ? -1 : 1));
}
/** Totals over summary rows: sessions and pageviews summed, revenue per currency, visitors never (cross-site uniques do not exist). */
function summaryTotals(list) {
	const rows = list;
	const m = /* @__PURE__ */ new Map();
	for (const r of rows) for (const e of r.revenue ?? []) {
		const t = m.get(e.currency) ?? {
			revenue: 0,
			orders: 0
		};
		m.set(e.currency, {
			revenue: t.revenue + e.revenue,
			orders: t.orders + e.orders
		});
	}
	return {
		sessions: rows.reduce((n, r) => n + num$2(r.sessions), 0),
		pageviews: rows.reduce((n, r) => n + num$2(r.pageviews), 0),
		visitors: null,
		revenue: revenueList(m)
	};
}
/** The summary runner: `rc.sites` lists the sites (the local site alone when absent); filters are refused. */
async function sitesSummary(rc, input) {
	if (input.filters.length) throw new QueryError("invalid_params", "sites_summary takes no filters.");
	const sites = [...new Set(rc.sites ?? [rc.site])];
	const groups = /* @__PURE__ */ new Map();
	for (const site of sites) {
		const t = rc.sitesDb ? await rc.sitesDb(site) : {
			key: "",
			db: rc.db,
			summaryThrough: rc.summaryThrough
		};
		let g = groups.get(t.key);
		if (!g) {
			const { summaryThrough: _, ...base } = rc;
			groups.set(t.key, g = {
				rc: {
					...base,
					db: t.db,
					...t.summaryThrough ? { summaryThrough: t.summaryThrough } : {}
				},
				sites: []
			});
		}
		g.sites.push(site);
	}
	const bySite = /* @__PURE__ */ new Map();
	const revenue = /* @__PURE__ */ new Map();
	const addTraffic = (site, r) => {
		const t = bySite.get(site) ?? {
			pageviews: 0,
			sessions: 0,
			visitors: 0,
			bounces: 0,
			engaged: 0
		};
		for (const k of Object.keys(t)) t[k] = (t[k] ?? 0) + num$2(r[k]);
		bySite.set(site, t);
	};
	const addMoney = (site, cur, r) => {
		const per = revenue.get(site) ?? /* @__PURE__ */ new Map();
		revenue.set(site, per);
		const v = per.get(cur) ?? {
			revenue: 0,
			orders: 0
		};
		per.set(cur, {
			revenue: v.revenue + num$2(r.revenue),
			orders: v.orders + num$2(r.orders)
		});
	};
	for (const { rc: g, sites: gSites } of groups.values()) {
		const { stored, open } = await splitRange(g, input.from, input.to);
		if (stored) {
			const inSites = inList(g.db.dialect, "site", gSites, false, 500);
			const where = `${inSites.sql} AND dim = 'all' AND seg = '' AND day BETWEEN ? AND ?`;
			const params = [
				...inSites.params,
				stored.from,
				stored.to
			];
			const traffic = await g.db.all(`SELECT site, SUM(pageviews) AS pageviews, SUM(sessions) AS sessions, SUM(visitors) AS visitors, SUM(bounces) AS bounces, SUM(engaged) AS engaged FROM ca_rollup WHERE ${where} GROUP BY site`, params);
			for (const r of traffic) addTraffic(String(r.site), r);
			for (const r of await g.db.all(`SELECT site, cur, SUM(revenue) AS revenue, SUM(orders) AS orders FROM ca_revenue_daily WHERE ${where} GROUP BY site, cur`, params)) addMoney(String(r.site), String(r.cur), r);
		}
		for (const site of gSites) for (const day of open) {
			const d = await openDay(g, site, site === rc.site ? rc.goals : [], day);
			for (const r of d.rows) if (r.dim === "all" && !r.seg) addTraffic(site, r);
			for (const r of d.revenue) if (r.dim === "all" && !r.seg) addMoney(site, r.cur, r);
		}
	}
	const all = sites.map((key) => {
		const r = bySite.get(key) ?? {};
		const sessions = num$2(r.sessions);
		const engaged_rate = round(ratio(num$2(r.engaged), sessions));
		return {
			key,
			sessions,
			pageviews: num$2(r.pageviews),
			visitors: num$2(r.visitors),
			bounce_rate: bounceRate(engaged_rate),
			engaged_rate,
			revenue: revenueList(revenue.get(key))
		};
	});
	all.sort((a, b) => num$2(b.pageviews) - num$2(a.pageviews) || (a.key < b.key ? -1 : 1));
	const { revenue: totalRevenue, ...totals } = summaryTotals(all);
	return {
		totals,
		revenue: totalRevenue,
		rows: all.slice(input.offset, input.offset + input.limit),
		truncated: all.length > input.offset + input.limit
	};
}
/**
* The `sitesDb` of a cross-site read under site routing (the `databases` option): each site's database, keyed by
* its binding, with the watermark of that database. Null without routing: one database holds every site.
*/
function routedSitesDb(db, kv) {
	const facts = pluginFactsOrNull();
	if (!facts || facts.targets().length < 2) return void 0;
	return async (site) => ({
		key: facts.binding(site) ?? "",
		db: await db(site),
		summaryThrough: await (kv ? stateKv(kv, site).get("rollup:watermark") : null) ?? void 0
	});
}
// src/query/reports/index.ts
/** Report dispatcher: validation, compare execution, deltas, the routing rule (detailed or summaries) and a 30 s isolate cache. */
const REPORTS = {
	overview: ["traffic", overview],
	timeseries: ["traffic", timeseries],
	pages: ["traffic", pages],
	entry_pages: ["traffic", entryPages],
	exit_pages: ["traffic", exitPages],
	not_found: ["traffic", notFound$1],
	satisfaction: ["traffic", satisfaction],
	satisfaction_series: ["traffic", satisfactionSeries],
	channels: ["traffic", channels],
	sources: ["traffic", sources],
	campaigns: ["traffic", campaigns],
	ai_referrals: ["traffic", aiReferrals],
	countries: ["traffic", countries],
	regions: ["traffic", regions],
	devices: ["traffic", devices],
	browsers: ["traffic", browsers],
	os: ["traffic", os],
	languages: ["traffic", languages],
	events: ["traffic", events],
	event_props: ["traffic", eventProps],
	goals: ["traffic", goals],
	funnels: ["traffic", funnels],
	outbound: ["traffic", outbound],
	downloads: ["traffic", downloads],
	forms: ["traffic", forms],
	scroll: ["traffic", scroll],
	dimension_values: ["traffic", dimensionValues],
	search_overview: ["search", searchOverview],
	search_queries: ["search", searchQueries],
	search_pages: ["search", searchPages],
	search_countries: ["search", searchCountries],
	search_devices: ["search", searchDevices],
	search_page_queries: ["search", searchPageQueries],
	search_cannibalization: ["search", searchCannibalization],
	search_cannibalization_pages: ["search", searchCannibalizationPages],
	search_cannibalization_page: ["search", searchCannibalizationPage],
	search_cannibalization_query: ["search", searchCannibalizationQuery],
	search_position_bands: ["search", searchPositionBands],
	search_position_bands_series: ["search", searchPositionBandsSeries],
	search_position_moves: ["search", searchPositionMoves],
	search_striking_distance: ["search", searchStrikingDistance],
	search_movers: ["search", searchMovers],
	search_decay: ["search", searchDecay],
	traffic_movers: ["traffic", trafficMovers],
	traffic_decay: ["traffic", trafficDecay],
	impact: ["traffic", impact],
	annotation_impacts: ["traffic", annotationImpacts],
	revenue: ["traffic", revenue],
	revenue_series: ["traffic", revenueSeries],
	revenue_breakdown: ["traffic", revenueBreakdown],
	revenue_orders: ["traffic", revenueOrders],
	journey_next: ["traffic", journeyNext],
	journey_prev: ["traffic", journeyPrev],
	journey_paths: ["traffic", journeyPaths],
	collections: ["traffic", collections],
	site_search: ["traffic", siteSearch],
	sites_summary: ["traffic", sitesSummary],
	links: ["traffic", links]
};
const REPORT_NAMES = Object.keys(REPORTS);
REPORT_NAMES.filter((n) => REPORTS[n][0] === "search");
/** Reports that refuse the compare option. */
const NO_COMPARE = /* @__PURE__ */ new Set([
	"search_cannibalization",
	"search_cannibalization_pages",
	"search_cannibalization_page",
	"search_cannibalization_query"
]);
/** Reports that compare periods on their own: the compare option is ignored. */
/** `revenue_orders` is a list of single orders: a comparison has nothing to pair, so it is ignored. */
const SELF_COMPARED = /* @__PURE__ */ new Set([
	"search_position_moves",
	"search_movers",
	"search_decay",
	"traffic_movers",
	"traffic_decay",
	"impact",
	"revenue_orders",
	"annotation_impacts"
]);
/** Reports over the summaries or the dispatcher itself: no filter compilation and no routing. */
const UNCOMPILED = /* @__PURE__ */ new Set([
	"traffic_movers",
	"traffic_decay",
	"impact",
	"annotation_impacts",
	"collections",
	"sites_summary"
]);
/** Reports with a summary reader of their own (the link and journey families), routed like the other summaries. */
const OWN_SUMMARY = {
	links: linksFromSummary,
	...journeysFromSummary
};
const ParamsSchema = z.object({
	withSearch: z.boolean().optional(),
	/** Revenue columns on breakdown reports and per funnel step. */
	withRevenue: z.boolean().optional(),
	/** ISO 4217 code of a revenue report; checked against the list with the typed `invalid_currency`. */
	currency: z.string().min(1).max(8).optional(),
	field: z.enum([
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content"
	]).optional(),
	event: z.string().min(1).max(64).optional(),
	funnel: z.string().min(1).max(128).optional(),
	steps: FunnelStepsSchema.optional(),
	mode: z.enum(FUNNEL_MODES).optional(),
	source: z.enum([
		"all",
		"google",
		"bing"
	]).optional(),
	page: z.string().min(1).max(2048).optional(),
	/** `campaign` is the `revenue_breakdown` name of `utm_campaign`. */
	dim: z.enum([...DIM_NAMES, "campaign"]).optional(),
	prop: z.string().regex(PROP_KEY_RE).optional(),
	prefix: z.string().max(128).optional(),
	/** `dimension_values`: `traffic | search`; `impact`: `annotation | none`. */
	scope: z.enum([
		"traffic",
		"search",
		"annotation",
		"none"
	]).optional(),
	direction: z.enum(["up", "down"]).optional(),
	metric: z.string().regex(/^[a-z0-9_]{1,32}$/).optional(),
	minImpressions: z.number().int().min(1).max(1e5).optional(),
	minShare: z.number().int().min(1).max(50).optional(),
	includeBrand: z.boolean().optional(),
	/** `search_position_moves`: rows are the matrix (default) or one list. */
	list: z.enum([
		"matrix",
		"up",
		"down",
		"new",
		"lost"
	]).optional(),
	query: z.string().min(1).max(512).optional(),
	annotation: z.string().min(1).max(128).optional(),
	kind: z.enum([
		"manual",
		"publish",
		"update",
		"release"
	]).optional(),
	at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	window: z.number().int().refine((w) => IMPACT_WINDOWS.includes(w), { message: `window must be one of ${IMPACT_WINDOWS.join(", ")}` }).optional(),
	report: z.enum(IMPACT_REPORTS).optional(),
	key: z.string().min(1).max(512).optional(),
	goal: z.string().min(1).max(128).optional(),
	path: z.string().min(1).max(512).regex(/^\//).optional(),
	/** `impact`: add the standard traffic KPIs of both windows as `context`. */
	context: z.boolean().optional(),
	/** `annotation_impacts`: only annotations of this scope kind (`site` is site-wide). */
	scopeKind: z.enum(SCOPE_KINDS_FILTER).optional(),
	/** `annotation_impacts`: only annotations whose title, kind, scope or source slug contains this text (case-insensitive). */
	q: z.string().trim().max(100).optional(),
	/** `journey_paths`: only sessions landing on this page. */
	entry: z.string().min(1).max(512).regex(/^\//).optional(),
	/** `links`: the breakdown and one link (Links convention); `satisfaction`: the grouping (`SATISFACTION_BY`, checked by the report). */
	by: z.enum([...LINK_BY, "browser"]).optional(),
	/** `satisfaction`: best or worst landing pages by score. */
	rank: z.enum(["best", "worst"]).optional(),
	slug: z.string().min(1).max(128).optional()
}).strict();
const MAX_LIMIT = 1e3;
const SEGMENT_COMPARE_NOT_SUPPORTED = "Segment comparison is not available for search reports, the SEO views and the impact view.";
/** Row cap of `data/export`. */
const EXPORT_LIMIT = 1e4;
const DELTA_SKIP = /* @__PURE__ */ new Set(["key"]);
/** Relative change, null when the previous value is 0 or missing. */
function delta(cur, prev) {
	if (typeof cur !== "number" || typeof prev !== "number" || prev === 0) return null;
	return Math.round((cur - prev) / prev * 1e4) / 1e4;
}
function deltas(cur, prev) {
	const out = {};
	for (const [k, v] of Object.entries(cur)) if (typeof v === "number" && !DELTA_SKIP.has(k)) out[k] = prev ? delta(v, prev[k]) : null;
	return out;
}
const rowId = (r) => r.ref === void 0 ? r.key : `${r.key}\u0000${String(r.ref)}`;
/** Attach compare values: totals get `compareTotals` and `delta`, rows get `previous` and `delta`, series get `compareSeries`. */
function mergeCompare(cur, prev) {
	const out = { ...cur };
	if (cur.totals) {
		out.compareTotals = prev.totals ?? null;
		out.delta = deltas(cur.totals, prev.totals);
	}
	if (cur.rows) {
		const byKey = new Map((prev.rows ?? []).map((r) => [rowId(r), r]));
		out.rows = cur.rows.map((r) => {
			const p = byKey.get(rowId(r));
			const { key: _k, ...prevMetrics } = p ?? { key: "" };
			return {
				...r,
				previous: p ? prevMetrics : null,
				delta: deltas(r, p)
			};
		});
	}
	if (cur.series) out.compareSeries = prev.series ?? [];
	return out;
}
const CACHE_TTL_MS = 3e4;
const CACHE_MAX$2 = 200;
const cache$2 = /* @__PURE__ */ new Map();
function clearReportCache() {
	cache$2.clear();
	clearOpenDays();
	clearScanCache();
}
/** Run one report with its compare range. Results are cached per request body for 30 s per isolate. */
function runReport(rc, req, nowMs = Date.now()) {
	const key = JSON.stringify([
		rc.site,
		rc.sites ?? null,
		rc.rawFrom ?? null,
		rc.summaryThrough ?? null,
		rc.defaultCurrency ?? null,
		req.report,
		req.query,
		req.params ?? {},
		req.limit ?? null,
		req.offset ?? null,
		req.compareFilters ?? null,
		req.compareSegment ?? null,
		rc.settings,
		rc.goals,
		rc.funnels,
		rc.annotations,
		rc.collections ?? null,
		rc.siteSearchParams ?? null,
		rc.publicSurface ?? false,
		req.lean ?? false
	]);
	const hit = cache$2.get(key);
	if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.value;
	const value = execute(rc, req);
	cache$2.delete(key);
	if (cache$2.size >= CACHE_MAX$2) cache$2.delete(cache$2.keys().next().value);
	cache$2.set(key, {
		at: nowMs,
		value
	});
	value.catch(() => cache$2.get(key)?.value === value && cache$2.delete(key));
	return value;
}
/** Visits one detailed report may scan per capacity profile (more: the summaries answer when they honour every filter). */
const SCAN_BUDGET = {
	small: 5e4,
	standard: 5e5,
	dedicated: 5e5
};
/** The summary plan of a report (its unavailable filters), or null when it has no summary form. */
function summaryPlan(report, filters, params) {
	if (report === "links") return linksPlan({
		filters,
		params
	});
	if (report in journeysFromSummary) return { unavailable: journeysUnavailable(filters) };
	if (REVENUE_REPORTS.includes(report)) return revenuePlan({ filters }, report === "revenue_breakdown" && params.dim ? params.dim : void 0);
	const entry = ROLLUP_REPORTS[report];
	if (!entry || RAW_ONLY[report] || report === "campaigns" && params.field && params.field !== "utm_campaign") return null;
	const plan = planFilters(filters, entry[0]);
	const dim = params.withRevenue ? WITH_REVENUE[report] : void 0;
	return dim ? {
		unavailable: plan.unavailable,
		refused: [...plan.unavailable, ...revenuePlan({ filters }, dim).unavailable]
	} : plan;
}
/**
* The routing rule (which engine answers a range). Before the detailed window: the summaries, or `raw_only` for a
* report without them. Inside it: the detailed rows, unless the stored days hold more visits than the profile's scan
* budget and the summaries honour every filter; a detailed report over `NARROW_FACTOR` times the budget is refused
* with `narrow_range` and the longest range that fits. Returns the notices of a summary answer, or null.
*/
async function route(rc, report, from, to, filters, params, lean = false) {
	if (!rc.rawFrom) return null;
	const plan = summaryPlan(report, filters, params);
	if (from < rc.rawFrom) {
		if (!plan) throw rawOnly(report, rc.rawFrom);
		return [
			"summary",
			...plan.unavailable.map((u) => `filter_unavailable:${u}`),
			`detail_from:${rc.rawFrom}`,
			...await behindNotice(rc, from, to)
		];
	}
	if (report === "revenue_orders") return null;
	if (lean) return null;
	const budget = SCAN_BUDGET[rc.settings.capacityProfile ?? "standard"] ?? SCAN_BUDGET.standard;
	const days = await storedSessions(rc, from, to);
	const total = days.reduce((n, d) => n + d.sessions, 0);
	if (total <= budget) return null;
	if (plan && !(plan.refused ?? plan.unavailable).length) return ["summary", ...await behindNotice(rc, from, to)];
	if (total <= 4 * budget) return null;
	let n = 0;
	const fits = [...days].sort((a, b) => a.day < b.day ? 1 : -1).find((d) => (n += d.sessions) > 4 * budget);
	const start = fits ? fits.day < to ? addDays(fits.day, 1) : to : from;
	throw new QueryError("narrow_range", `This range holds about ${total.toLocaleString("en-US")} visits, more than one detailed report may read with these filters. Choose ${start} to ${to}, or filters the daily summaries can answer.`);
}
async function runOnce(rc, req, kind, run, from, to, filters, isCompare) {
	const cc = {
		db: rc.db,
		site: rc.site,
		from,
		to,
		goals: rc.goals,
		...rc.defaultCurrency ? { currency: rc.defaultCurrency } : {}
	};
	const input = {
		from,
		to,
		filters,
		granularity: req.query.granularity,
		params: req.params ?? {},
		limit: Math.max(1, Math.min(req.limit ?? 100, EXPORT_LIMIT)),
		offset: Math.max(0, req.offset ?? 0),
		isCompare,
		...req.lean ? { lean: true } : {}
	};
	if (UNCOMPILED.has(req.report)) return {
		data: await run(rc, input),
		input,
		notices: []
	};
	const revenueCols = async (data) => input.params.withRevenue ? withRevenue(rc, input, req.report, data) : data;
	const summary = kind === "traffic" ? await route(rc, req.report, from, to, filters, input.params, req.lean) : null;
	if (summary) {
		input.summary = true;
		const folded = /* @__PURE__ */ new Set();
		rc = {
			...rc,
			folded
		};
		const other = () => [...folded].sort().map((d) => `summary_other:${d}`);
		const own = OWN_SUMMARY[req.report];
		if (own) {
			const { notices, ...data } = await own(rc, input);
			return {
				data: await revenueCols(data),
				input,
				notices: [.../* @__PURE__ */ new Set([
					...summary,
					...notices,
					...other()
				])]
			};
		}
		if (REVENUE_REPORTS.includes(req.report)) return {
			data: await run(rc, input),
			input,
			notices: [...summary, ...other()]
		};
		const r = await runRollupReport(req.report, rc, input);
		return {
			data: await revenueCols(r.data),
			input,
			notices: [.../* @__PURE__ */ new Set([
				...summary,
				...r.notices,
				...other()
			])]
		};
	}
	if (kind === "search") input.search = await compileSearch(cc, filters);
	else input.traffic = await compileTraffic(cc, filters);
	return {
		data: await revenueCols(await run(rc, input)),
		input,
		notices: []
	};
}
/** Every report statement stays inside the D1 limit of 100 bound parameters, on every dialect. */
function guardDb(db) {
	const check = (params = []) => {
		if (params.length > 100) throw new QueryError("too_many_values", "This query needs too many values. Use fewer filter values or a prefix or regex.");
	};
	return {
		dialect: db.dialect,
		run: (sql, params) => (check(params), db.run(sql, params)),
		all: (sql, params) => (check(params), db.all(sql, params)),
		batch: (stmts) => (stmts.forEach((s) => check(s.params)), db.batch(stmts))
	};
}
async function execute(ctx, req) {
	const rc = {
		...ctx,
		db: guardDb(ctx.db)
	};
	if (req.report === "impact" || req.report === "annotation_impacts") rc.dispatch ??= (r) => runReport(ctx, r);
	const [kind, run] = REPORTS[req.report];
	const { from, to, compare, filters } = req.query;
	if (compare === "segment" && (kind === "search" || SELF_COMPARED.has(req.report))) throw new QueryError("compare_not_supported", SEGMENT_COMPARE_NOT_SUPPORTED);
	if (compare !== "none" && NO_COMPARE.has(req.report)) throw new QueryError("compare_not_supported", SEO_TEXT.compareNotSupported);
	if (compare === "segment" && !req.compareFilters) throw new QueryError("invalid_params", "compare segment needs the compare segment's filters.");
	validateFilters(filters);
	if (req.compareFilters) validateFilters(req.compareFilters);
	if (req.params?.currency !== void 0) currencyOf(rc, { params: req.params });
	const scoped = SATISFACTION_REPORTS.has(req.report);
	const channelOff = scoped && [...filters, ...req.compareFilters ?? []].some(conflictsWithScope);
	const scope = (f) => scoped ? organicScope(f) : f;
	const cur = await runOnce(rc, req, kind, run, from, to, scope(filters), false);
	const notices = new Set(kind === "search" ? (cur.input.search?.ignored ?? []).map((d) => `ignored_dim:${d}`) : cur.notices);
	if (kind === "traffic") for (const d of cur.input.traffic?.ignoredTraffic ?? []) notices.add(`ignored_dim:${d}`);
	if (channelOff) notices.add("ignored_dim:channel");
	let data = cur.data;
	let compareRange = null;
	if (compare !== "none" && req.report !== "dimension_values" && !SELF_COMPARED.has(req.report)) {
		compareRange = compare === "segment" ? {
			from,
			to
		} : compare === "previous" ? previousPeriod({
			from,
			to
		}) : samePeriodLastYear({
			from,
			to
		});
		const prev = await runOnce(rc, req, kind, run, compareRange.from, compareRange.to, scope(compare === "segment" ? req.compareFilters ?? [] : filters), true);
		for (const n of prev.notices) if (!n.startsWith("detail_from:")) notices.add(n === "summary" ? "compare_summary" : n);
		data = mergeCompare(cur.data, prev.data);
	}
	return {
		report: req.report,
		range: {
			from,
			to
		},
		compare,
		compareRange,
		...compare === "segment" && req.compareSegment ? { compareSegment: req.compareSegment } : {},
		data,
		notices: [...notices]
	};
}
// src/query/export.ts
/**
* The exported rows of a report: its rows, else its series, else its totals as one row. Revenue results
* (`data.currency`) carry a `currency` column on every row, so no amount leaves without its code.
*/
function exportRows(data) {
	const rows = (data.rows ?? data.series ?? (data.totals ? [data.totals] : [])).slice(0, EXPORT_LIMIT);
	const cur = typeof data.currency === "string" ? data.currency : null;
	return cur ? rows.map((r) => ({
		...r,
		currency: typeof r.currency === "string" ? r.currency : cur
	})) : rows;
}
/** One level of nesting becomes `parent.child` columns; deeper values and arrays become JSON text. */
function flatten(r) {
	const out = {};
	for (const [k, v] of Object.entries(r)) if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
	else out[k] = v;
	return out;
}
/** A spreadsheet must not run a stored path or referrer as a formula. */
const FORMULA = /^[=+\-@\t\r]/;
function csvField(v) {
	if (v === null || v === void 0) return "";
	let s = typeof v === "object" ? JSON.stringify(v) : String(v);
	if (typeof v === "string" && FORMULA.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
}
/** RFC 4180: CRLF line ends, a header row, fields quoted when they hold a quote, comma or line break. */
function toCsv(rows) {
	const flat = rows.map(flatten);
	const cols = [];
	for (const r of flat) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
	return [cols.map(csvField).join(","), ...flat.map((r) => cols.map((c) => csvField(r[c])).join(","))].join("\r\n") + "\r\n";
}
function exportBody(result, format) {
	const rows = exportRows(result.data);
	const filename = `${result.report}-${result.range.from}-${result.range.to}.${format}`;
	return format === "csv" ? {
		body: toCsv(rows),
		contentType: "text/csv; charset=utf-8",
		filename
	} : {
		body: JSON.stringify(rows),
		contentType: "application/json; charset=utf-8",
		filename
	};
}
// src/sources/gsc-auth.ts
/**
* Google auth: one `getAccessToken` over two modes. `service_account`: RS256 JWT bearer grant
* signed with WebCrypto. `oauth`: refresh grant with the operator's own web client; the refresh token
* comes from the web flow (`startOAuth`, `exchangeOAuth`) with `state` and a PKCE verifier kept in
* `kv search:oauth` for 10 minutes. Access tokens are cached in memory until expiry minus 60 s, keyed
* by a hash of the credential so a changed credential never reuses a token. No token or secret is ever
* returned or logged; provider errors carry the status and Google's short error code only.
*/
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const OAUTH_KV = "search:oauth";
const OAUTH_TTL_MS = 6e5;
const EARLY_MS$1 = 6e4;
const tokens$1 = /* @__PURE__ */ new Map();
function serviceAccount(json) {
	try {
		const sa = JSON.parse(json);
		return typeof sa.client_email === "string" && typeof sa.private_key === "string" && sa.private_key.includes("PRIVATE KEY") ? sa : null;
	} catch {
		return null;
	}
}
/** Credentials for the selected mode are present. */
function gscConfigured(s) {
	if (s.gscAuth === "service_account") return !!serviceAccount(s.gscServiceAccount);
	if (s.gscAuth === "oauth") return !!(s.gscClientId && s.gscClientSecret && s.gscRefreshToken);
	return false;
}
/** The provider's short error code (Google `invalid_grant`, Bing `InvalidApiKey`), never a body echo. */
async function errorCode(res) {
	try {
		const j = await res.json();
		if (typeof j.ErrorCode === "number" && typeof j.Message === "string") {
			const word = /([A-Za-z]{3,40})\s*$/.exec(j.Message)?.[1];
			return word ? ` (${word})` : "";
		}
		const e = typeof j.error === "string" ? j.error : j.error?.status;
		return typeof e === "string" && /^[A-Za-z_]{1,40}$/.test(e) ? ` (${e})` : "";
	} catch {
		return "";
	}
}
/** Fetch JSON; a non-2xx answer becomes `SourceError` with the status. */
async function fetchJson(http, url, init, what) {
	const res = await http.fetch(url, init);
	if (!res.ok) throw new SourceError(res.status, `${what} answered ${res.status}${await errorCode(res)}.`);
	try {
		return await res.json();
	} catch {
		const type = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().slice(0, 40) || "no content type";
		throw new SourceError(502, `${what} answered ${res.status} without JSON (${type}).`);
	}
}
const form$1 = (fields) => ({
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams(fields).toString()
});
const enc$2 = new TextEncoder();
const b64json = (v) => base64url(enc$2.encode(JSON.stringify(v)));
/** RS256 JWT assertion for the bearer grant (RFC 7523), valid one hour. */
async function signJwt(sa, nowSec) {
	const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
	const key = await crypto.subtle.importKey("pkcs8", der, {
		name: "RSASSA-PKCS1-v1_5",
		hash: "SHA-256"
	}, false, ["sign"]);
	const input = `${b64json({
		alg: "RS256",
		typ: "JWT"
	})}.${b64json({
		iss: sa.client_email,
		scope: GSC_SCOPE,
		aud: TOKEN_URL,
		iat: nowSec,
		exp: nowSec + 3600
	})}`;
	const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc$2.encode(input)));
	return `${input}.${base64url(sig)}`;
}
const hex$2 = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
function cacheToken(key, body, nowMs) {
	const t = body;
	if (typeof t.access_token !== "string") throw new SourceError(502, "Google sent no access token.");
	tokens$1.set(key, {
		token: t.access_token,
		exp: nowMs + (typeof t.expires_in === "number" ? t.expires_in : 3600) * 1e3 - EARLY_MS$1
	});
	return t.access_token;
}
/** A valid access token for the configured mode. */
async function getAccessToken(ctx) {
	const s = ctx.settings;
	const nowMs = ctx.now?.() ?? Date.now();
	if (!gscConfigured(s)) throw new SourceError(401, "Google Search Console is not connected.");
	const cred = s.gscAuth === "service_account" ? s.gscServiceAccount : `${s.gscClientId}\n${s.gscRefreshToken}`;
	const key = `${s.gscAuth}:${hex$2(await sha256(cred))}`;
	const hit = tokens$1.get(key);
	if (hit && hit.exp > nowMs) return hit.token;
	if (s.gscAuth === "service_account") {
		const sa = serviceAccount(s.gscServiceAccount);
		let assertion;
		try {
			assertion = await signJwt(sa, Math.floor(nowMs / 1e3));
		} catch (e) {
			throw new SourceError(401, `The service account key could not be read (${e instanceof Error && e.name ? e.name : "Error"}).`);
		}
		return cacheToken(key, await fetchJson(ctx.http, TOKEN_URL, form$1({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion
		}), "Google sign-in"), nowMs);
	}
	return cacheToken(key, await fetchJson(ctx.http, TOKEN_URL, form$1({
		grant_type: "refresh_token",
		client_id: s.gscClientId,
		client_secret: s.gscClientSecret,
		refresh_token: s.gscRefreshToken
	}), "Google sign-in"), nowMs);
}
/** Start the web flow: store `state` and the PKCE verifier, return the Google consent URL. */
async function startOAuth(ctx, redirectUri) {
	const s = ctx.settings;
	if (!s.gscClientId || !s.gscClientSecret) throw new PluginRouteError("oauth_not_configured", "Save the OAuth client id and client secret in the plugin settings first.", 400);
	const state = randomId(32);
	const verifier = randomId(64);
	await ctx.kv.set(OAUTH_KV, {
		state,
		verifier,
		expires: (ctx.now?.() ?? Date.now()) + OAUTH_TTL_MS,
		redirectUri
	});
	const q = new URLSearchParams({
		client_id: s.gscClientId,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: GSC_SCOPE,
		access_type: "offline",
		prompt: "consent",
		state,
		code_challenge: base64url(await sha256(verifier)),
		code_challenge_method: "S256"
	});
	return { url: `${AUTH_URL}?${q}` };
}
/**
* Finish the web flow: check `state`, exchange the code, store the refresh token through
* `setSecret` (the host encrypts it) and clear the KV state. Answers `{ connected: true }` only.
*/
async function exchangeOAuth(ctx, code, state) {
	const nowMs = ctx.now?.() ?? Date.now();
	const rec = await ctx.kv.get(OAUTH_KV);
	if (!rec || typeof rec.state !== "string" || rec.expires < nowMs || !timingSafeEqual(rec.state, state)) throw new PluginRouteError("oauth_state", "The sign-in expired or did not start here. Connect Google again.", 400);
	const s = ctx.settings;
	const body = await fetchJson(ctx.http, TOKEN_URL, form$1({
		grant_type: "authorization_code",
		code,
		client_id: s.gscClientId,
		client_secret: s.gscClientSecret,
		redirect_uri: rec.redirectUri,
		code_verifier: rec.verifier
	}), "Google sign-in");
	if (typeof body.refresh_token !== "string" || !body.refresh_token) throw new PluginRouteError("no_refresh_token", "Google sent no refresh token. Remove the app's access in your Google account and connect again.", 502);
	await ctx.setSecret("gscRefreshToken", body.refresh_token);
	cacheToken(`oauth:${hex$2(await sha256(`${s.gscClientId}\n${body.refresh_token}`))}`, body, nowMs);
	await ctx.kv.delete(OAUTH_KV);
	return { connected: true };
}
/** Search Console properties of the connected identity; unverified entries hidden. */
async function listProperties(ctx) {
	const token = await getAccessToken(ctx);
	const body = await fetchJson(ctx.http, SITES_URL, { headers: { authorization: `Bearer ${token}` } }, "Search Console");
	return (Array.isArray(body.siteEntry) ? body.siteEntry : []).filter((e) => typeof e.siteUrl === "string" && typeof e.permissionLevel === "string" && e.permissionLevel !== "siteUnverifiedUser").map((e) => ({
		siteUrl: e.siteUrl,
		permissionLevel: e.permissionLevel
	}));
}
/**
* The property proposed for a hostname: a URL prefix property on exactly that hostname
* (https first), else the narrowest `sc-domain:` property equal to the hostname or a parent of it.
*/
function suggestProperty(siteUrls, hostname) {
	const host = hostname.toLowerCase();
	const prefixes = siteUrls.filter((u) => {
		try {
			return !u.startsWith("sc-domain:") && new URL(u).hostname.toLowerCase() === host;
		} catch {
			return false;
		}
	});
	const best = prefixes.find((u) => u.startsWith("https:")) ?? prefixes[0];
	if (best) return best;
	return siteUrls.filter((u) => {
		const d = u.startsWith("sc-domain:") ? u.slice(10).toLowerCase() : "";
		return !!d && (host === d || host.endsWith(`.${d}`));
	}).sort((a, b) => b.length - a.length)[0] ?? null;
}
// src/sources/bing-auth.ts
/**
* Bing Webmaster auth: the API key (`apikey` query parameter, default) or OAuth 2.0 with the site's own
* client from Bing Webmaster Tools (Settings, API access, OAuth client). OAuth follows Microsoft's
* description (learn.microsoft.com/bingwebmaster/oauth2): authorize at `AUTH_URL` with `response_type=code`,
* `client_id`, `redirect_uri`, `scope=webmaster.read` and `state`; exchange and refresh at `TOKEN_URL`
* (form fields `client_id`, `client_secret`, `code` or `refresh_token`, `grant_type`, `redirect_uri`);
* the API then takes `Authorization: Bearer`. Bing documents no PKCE, so none is sent; `state` is checked
* here. Access tokens are cached in memory until expiry minus 60 s, keyed by a hash of the credential.
* No token or secret is ever returned or logged.
*/
const BING_AUTH_URL = "https://www.bing.com/webmasters/oauth/authorize";
const BING_TOKEN_URL = "https://www.bing.com/webmasters/oauth/token";
const BING_SCOPE = "webmaster.read";
const BING_OAUTH_KV = "search:oauth:bing";
const TTL_MS = 6e5;
const EARLY_MS = 6e4;
/** The switch is on and the selected mode has its credentials. */
const bingConfigured = (s) => s.bingEnabled && (s.bingAuth === "oauth" ? !!(s.bingClientId && s.bingClientSecret && s.bingRefreshToken) : !!s.bingApiKey);
const tokens = /* @__PURE__ */ new Map();
const hex$1 = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const form = (fields) => ({
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams(fields).toString()
});
function cache$1(key, body, nowMs) {
	const t = body;
	if (typeof t.access_token !== "string") throw new SourceError(502, "Bing sent no access token.");
	tokens.set(key, {
		token: t.access_token,
		exp: nowMs + (typeof t.expires_in === "number" ? t.expires_in : 3600) * 1e3 - EARLY_MS
	});
	return t.access_token;
}
/** A valid access token from the refresh token. */
async function bingAccessToken(ctx) {
	const s = ctx.settings;
	const nowMs = ctx.now?.() ?? Date.now();
	if (!s.bingClientId || !s.bingClientSecret || !s.bingRefreshToken) throw new SourceError(401, "Bing is not connected.");
	const key = hex$1(await sha256(`${s.bingClientId}\n${s.bingRefreshToken}`));
	const hit = tokens.get(key);
	if (hit && hit.exp > nowMs) return hit.token;
	return cache$1(key, await fetchJson(ctx.http, BING_TOKEN_URL, form({
		client_id: s.bingClientId,
		client_secret: s.bingClientSecret,
		refresh_token: s.bingRefreshToken,
		grant_type: "refresh_token"
	}), "Bing sign-in"), nowMs);
}
/** Start the web flow: store `state` for 10 minutes, return Bing's consent URL. */
async function startBingOAuth(ctx, redirectUri) {
	const s = ctx.settings;
	if (!s.bingClientId || !s.bingClientSecret) throw new PluginRouteError("oauth_not_configured", "Save the Bing OAuth client id and client secret first.", 400);
	const state = randomId(32);
	await ctx.kv.set(BING_OAUTH_KV, {
		state,
		expires: (ctx.now?.() ?? Date.now()) + TTL_MS,
		redirectUri
	});
	const q = new URLSearchParams({
		response_type: "code",
		client_id: s.bingClientId,
		redirect_uri: redirectUri,
		scope: BING_SCOPE,
		state
	});
	return { url: `${BING_AUTH_URL}?${q}` };
}
/** The pending Bing sign-in matches this `state` (the return page posts `code` and `state` without naming the provider). */
async function isBingState(kv, state) {
	const rec = await kv.get(BING_OAUTH_KV);
	return !!rec && typeof rec.state === "string" && timingSafeEqual(rec.state, state);
}
/** Finish the web flow: check `state`, exchange the code, store the refresh token through `setSecret`, clear the KV state. */
async function exchangeBingOAuth(ctx, code, state) {
	const nowMs = ctx.now?.() ?? Date.now();
	const rec = await ctx.kv.get(BING_OAUTH_KV);
	if (!rec || typeof rec.state !== "string" || rec.expires < nowMs || !timingSafeEqual(rec.state, state)) throw new PluginRouteError("oauth_state", "The sign-in expired or did not start here. Connect Bing again.", 400);
	const s = ctx.settings;
	const body = await fetchJson(ctx.http, BING_TOKEN_URL, form({
		client_id: s.bingClientId,
		client_secret: s.bingClientSecret,
		code,
		grant_type: "authorization_code",
		redirect_uri: rec.redirectUri
	}), "Bing sign-in");
	if (typeof body.refresh_token !== "string" || !body.refresh_token) throw new PluginRouteError("no_refresh_token", "Bing sent no refresh token. Connect Bing again.", 502);
	await ctx.setSecret("bingRefreshToken", body.refresh_token);
	cache$1(hex$1(await sha256(`${s.bingClientId}\n${body.refresh_token}`)), body, nowMs);
	await ctx.kv.delete(BING_OAUTH_KV);
	return {
		connected: true,
		source: "bing"
	};
}
// src/sources/bing.ts
/**
* Bing Webmaster source. JSON API at `https://ssl.bing.com/webmaster/api.svc/json/<Method>`
* with `siteUrl` in the query and the API key in `apikey` (or an OAuth bearer token, `bing-auth.ts`). Bing takes no date range: every call returns its whole window
* of dated rows (`{ d: [...] }`, dates as WCF `/Date(ms)/` at UTC midnight), so one window pull of three
* calls stores every returned day, and a Bing backfill is that same pull. Shapes verified on the live API
* (docs/design-notes.md): `GetRankAndTrafficStats` gives daily totals; `GetQueryStats` and `GetPageStats`
* give weekly rows `{ Date, Query, Clicks, Impressions, AvgImpressionPosition }` with the page URL in
* `Query` for pages; `GetUserSites` gives `{ Url, IsVerified }`. Bing has no country or device.
*/
const BING_API = "https://ssl.bing.com/webmaster/api.svc/json/";
/** The in-tick retry after a throttle waits 2 to 5 seconds (jittered so parallel installs spread out). */
const THROTTLE_WAIT_MS = [2e3, 5e3];
/** The API URL; the key goes in `apikey` in API key mode, OAuth sends a bearer token instead. */
function bingUrl(method, apiKey, params = {}) {
	return `${BING_API}${method}?${new URLSearchParams({
		...apiKey ? { apikey: apiKey } : {},
		...params
	})}`;
}
async function once(ctx, method, params) {
	const s = ctx.settings;
	const oauth = s.bingAuth === "oauth";
	const headers = {
		accept: "application/json",
		...oauth ? { authorization: `Bearer ${await bingAccessToken(ctx)}` } : {}
	};
	return fetchJson(ctx.http, bingUrl(method, oauth ? "" : s.bingApiKey, params), { headers }, "Bing Webmaster").catch((e) => {
		const code = e instanceof SourceError ? /\((Throttle[A-Za-z]*)\)/.exec(e.message)?.[1] : void 0;
		throw code ? new ThrottledError(code, e instanceof Error ? e.message : code) : e;
	});
}
/**
* One API call. With a tick budget, a throttled answer is retried once after a short jittered wait when
* the budget still has room (some calls pass between throttles, and one pass of each method is enough).
*/
async function call(ctx, method, params = {}) {
	ctx.budget?.spend();
	let body;
	try {
		body = await once(ctx, method, params);
	} catch (e) {
		if (!(e instanceof ThrottledError) || !ctx.budget) throw e;
		const [lo, hi] = THROTTLE_WAIT_MS;
		await (ctx.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(lo + Math.floor(Math.random() * (hi - lo)));
		ctx.budget.spend();
		body = await once(ctx, method, params);
	}
	const d = body?.d;
	return Array.isArray(d) ? d : [];
}
/** `/Date(1752451200000)/` (optionally with an offset suffix) as `YYYY-MM-DD` in UTC, or null. */
function wcfDay(v) {
	const m = typeof v === "string" ? /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(v) : null;
	return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : null;
}
const n$2 = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
function stat(r) {
	const impressions = Math.round(n$2(r.Impressions));
	return {
		clicks: Math.round(n$2(r.Clicks)),
		impressions,
		pos_sum: n$2(r.AvgImpressionPosition) * impressions
	};
}
/** Rows of the three methods grouped by day, page keys normalized for the site, other hosts dropped. */
function windowRows(totals, queries, pages, target) {
	const out = /* @__PURE__ */ new Map();
	const add = (day, row) => {
		if (!day || !row) return;
		const list = out.get(day);
		if (list) list.push(row);
		else out.set(day, [row]);
	};
	const blank = {
		page_key: "",
		query: "",
		country: "",
		device: ""
	};
	for (const r of totals) add(wcfDay(r.Date), {
		...blank,
		...stat(r)
	});
	for (const r of queries) {
		const q = typeof r.Query === "string" ? r.Query.trim().slice(0, 512) : "";
		add(wcfDay(r.Date), q ? {
			...blank,
			query: q,
			...stat(r)
		} : null);
	}
	for (const r of pages) {
		const k = typeof r.Query === "string" ? target.pageKey(r.Query) : null;
		add(wcfDay(r.Date), k === null ? null : {
			...blank,
			page_key: k,
			...stat(r)
		});
	}
	return out;
}
/** The whole Bing window of a site: three calls, rows by day. */
async function fetchWindow(ctx, target) {
	const site = { siteUrl: target.property };
	return windowRows(await call(ctx, "GetRankAndTrafficStats", site), await call(ctx, "GetQueryStats", site), await call(ctx, "GetPageStats", site), target);
}
/** Sites of the key owner; unverified entries hidden. */
async function listBingSites(ctx) {
	return (await call({
		http: ctx.http,
		settings: ctx.settings,
		...ctx.now ? { now: ctx.now } : {}
	}, "GetUserSites")).filter((r) => typeof r.Url === "string" && r.IsVerified === true).map((r) => ({
		siteUrl: r.Url,
		verified: true
	}));
}
/**
* Queries of one page URL on demand (`GetPageQueryStats`), cached one hour in
* `kv search:pagequeries:<hash>` so reopening the drawer costs no provider call.
*/
async function pageQueries(ctx, siteUrl, pageUrl) {
	const now = ctx.now?.() ?? Date.now();
	const key = `search:pagequeries:${base64url(await sha256(`${siteUrl}\n${pageUrl}`)).slice(0, 32)}`;
	const hit = await ctx.kv.get(key);
	if (hit && now - hit.at < 36e5) return hit.rows;
	const rows = [];
	for (const r of await call(ctx, "GetPageQueryStats", {
		siteUrl,
		page: pageUrl
	})) {
		const day = wcfDay(r.Date);
		const query = typeof r.Query === "string" ? r.Query.trim().slice(0, 512) : "";
		if (day && query) rows.push({
			query,
			day,
			...stat(r)
		});
	}
	await ctx.kv.set(key, {
		at: now,
		rows
	});
	return rows;
}
/**
* Pages of one query on demand (`GetQueryPageStats`), cached one hour in
* `kv search:querypages:<hash>`. Bing returns per day rows with the page URL in `Query`, the same row
* type as `GetPageStats` (field names to confirm on the preview, docs/release.md).
*/
async function queryPages(ctx, siteUrl, query) {
	const now = ctx.now?.() ?? Date.now();
	const key = `search:querypages:${base64url(await sha256(`${siteUrl}\n${query}`)).slice(0, 32)}`;
	const hit = await ctx.kv.get(key);
	if (hit && now - hit.at < 36e5) return hit.rows;
	const rows = [];
	for (const r of await call(ctx, "GetQueryPageStats", {
		siteUrl,
		query
	})) {
		const day = wcfDay(r.Date);
		const url = typeof r.Query === "string" ? r.Query.trim() : "";
		if (day && url) rows.push({
			url,
			day,
			...stat(r)
		});
	}
	await ctx.kv.set(key, {
		at: now,
		rows
	});
	return rows;
}
const bing = {
	id: "bing",
	configured: bingConfigured,
	async test(ctx, target) {
		const sites = await listBingSites(ctx);
		return {
			property: target.property,
			found: sites.some((x) => x.siteUrl === target.property)
		};
	},
	async fetchDay(ctx, target, day) {
		return (await fetchWindow(ctx, target)).get(day) ?? [];
	},
	fetchWindow
};
// src/sources/page-key.ts
/**
* Page key: one key for provider URLs and own paths. The path is normalized exactly like
* hit paths (`normalizeUrl`: query and fragment stripped, trailing slash stripped except root), so the
* Pages join and the drawer match stored hits. Absolute URLs must be http or https on the site's
* canonical host (lowercase; `www.` is ignored like everywhere else in this plugin); other hosts give null.
*/
function pageKeyFor(origin) {
	let host = "";
	try {
		host = cleanHost(new URL(origin).hostname);
	} catch {}
	return (url) => {
		const u = url.trim();
		if (u.startsWith("/") && !u.startsWith("//")) return normalizeUrl(u, []).path;
		let parsed;
		try {
			parsed = new URL(u);
		} catch {
			return null;
		}
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:" || !host || cleanHost(parsed.hostname) !== host) return null;
		return normalizeUrl(parsed.pathname, []).path;
	};
}
/** Origin a property stands for: `sc-domain:example.com` gives `https://example.com`; a URL prefix gives its origin. */
function propertyOrigin(property) {
	if (property.startsWith("sc-domain:")) return `https://${property.slice(10).toLowerCase()}`;
	try {
		return new URL(property).origin;
	} catch {
		return "";
	}
}
/**
* Canonical origin of a site: the local site uses `siteOrigin`, else the request origin;
* a client site uses `https://` plus its first registered host. Cron runs have no request, so the
* mapped property's origin is the last fallback (docs/design-notes.md).
*/
function canonicalOrigin(o) {
	if (o.client) return o.client.hosts[0] ? `https://${o.client.hosts[0]}` : "";
	if (o.siteOrigin) return o.siteOrigin;
	if (o.requestUrl) try {
		return new URL(o.requestUrl).origin;
	} catch {}
	return o.property ? propertyOrigin(o.property) : "";
}
// src/keys/scopes.ts
/**
* API key scopes in 1.0. `write:events` is the one ingest scope: it writes events only, never sessions or visitor data.
* `data:export` and `data:import` are for backups and moves only: they read and insert the stored rows of the analytics
* tables, daily visitor keys included. There is no scope for settings, keys or deletion.
*/
const SCOPES = [
	"read:analytics",
	"read:search",
	"sync:search",
	"write:annotations",
	"write:dashboards",
	"write:events",
	"data:export",
	"data:import"
];
const SCOPE_LABELS = {
	"read:analytics": "Traffic reports, catalog, summary, status and annotations",
	"read:search": "Search reports and search columns on Pages",
	"sync:search": "Start a Search sync or backfill",
	"write:annotations": "Add annotations, for example from a deploy script",
	"write:dashboards": "Create, change and delete dashboards",
	"write:events": "Record events and order values from the site's own server",
	"data:export": "Export every stored row of the analytics tables (backups and moves)",
	"data:import": "Import exported rows into the analytics tables (rows already present are kept)"
};
// src/core/presets.ts
/** Date presets of the admin header and of dashboards, shared by the admin and the server. */
const PRESETS = [
	["today", "Today"],
	["yesterday", "Yesterday"],
	["7d", "Last 7 days"],
	["30d", "Last 30 days"],
	["90d", "Last 90 days"],
	["12m", "Last 12 months"],
	["mtd", "Month to date"],
	["ytd", "Year to date"]
];
/** The `from` and `to` days of a preset, in the site timezone, both inclusive and ending today. */
function presetRange(p, tz, nowSec = Date.now() / 1e3) {
	const today = dayInZone(Math.floor(nowSec), tz);
	switch (p) {
		case "today": return {
			from: today,
			to: today
		};
		case "yesterday": {
			const y = addDays(today, -1);
			return {
				from: y,
				to: y
			};
		}
		case "7d": return {
			from: addDays(today, -6),
			to: today
		};
		case "30d": return {
			from: addDays(today, -29),
			to: today
		};
		case "90d": return {
			from: addDays(today, -89),
			to: today
		};
		case "12m": return {
			from: addDays(samePeriodLastYear({
				from: today,
				to: today
			}).from, 1),
			to: today
		};
		case "mtd": return {
			from: `${today.slice(0, 8)}01`,
			to: today
		};
		case "ytd": return {
			from: `${today.slice(0, 5)}01-01`,
			to: today
		};
	}
}
// src/dashboards/schema.ts
/** Dashboard and template records and their limits. No report SQL is imported, so the admin bundle can use it. */
const TILE_KIND_NAMES = [
	"kpi",
	"line",
	"area",
	"bars",
	"donut",
	"table",
	"stacked"
];
const SESSION_METRICS = [
	"visitors",
	"sessions",
	"pageviews",
	"views_per_session",
	"bounce_rate",
	"engaged_rate",
	"avg_duration"
];
const SAT_RATES = [
	"pct_long",
	"pct_short",
	"pct_bad",
	"pogo_stick_rate",
	"returned_from_search_rate",
	"sessions",
	"measured"
];
const SEARCH_METRICS = [
	"clicks",
	"impressions",
	"ctr",
	"position"
];
const BREAKDOWN = [
	"bars",
	"donut",
	"table"
];
/** Which kinds each tile report accepts. Every report but `dimension_values` and `search_page_queries`. */
const TILE_KINDS = {
	overview: ["kpi"],
	timeseries: ["line", "area"],
	satisfaction: ["kpi", ...BREAKDOWN],
	satisfaction_series: ["line", "area"],
	search_overview: [
		"kpi",
		"line",
		"area"
	],
	goals: ["kpi", ...BREAKDOWN],
	pages: BREAKDOWN,
	entry_pages: BREAKDOWN,
	exit_pages: BREAKDOWN,
	not_found: BREAKDOWN,
	channels: BREAKDOWN,
	sources: BREAKDOWN,
	campaigns: BREAKDOWN,
	ai_referrals: BREAKDOWN,
	countries: BREAKDOWN,
	regions: BREAKDOWN,
	devices: BREAKDOWN,
	browsers: BREAKDOWN,
	os: BREAKDOWN,
	languages: BREAKDOWN,
	events: BREAKDOWN,
	event_props: BREAKDOWN,
	funnels: BREAKDOWN,
	outbound: BREAKDOWN,
	downloads: BREAKDOWN,
	forms: BREAKDOWN,
	scroll: BREAKDOWN,
	search_queries: BREAKDOWN,
	search_pages: BREAKDOWN,
	search_countries: BREAKDOWN,
	search_devices: BREAKDOWN,
	search_cannibalization: ["kpi", "table"],
	search_cannibalization_pages: ["table"],
	search_position_bands: ["kpi", ...BREAKDOWN],
	search_position_bands_series: [
		"stacked",
		"line",
		"area"
	],
	search_position_moves: ["kpi", "table"],
	search_striking_distance: ["table"],
	search_movers: ["table"],
	search_decay: ["table"],
	traffic_movers: ["table"],
	traffic_decay: ["table"],
	impact: ["kpi", "line"],
	revenue: ["kpi"],
	revenue_series: ["line", "area"],
	revenue_breakdown: BREAKDOWN,
	journey_paths: ["table"],
	collections: BREAKDOWN,
	site_search: ["table"],
	links: ["bars", "table"]
};
const TILE_REPORTS = Object.keys(TILE_KINDS);
const isSearchReport = (r) => r.startsWith("search_");
/** A tile reads Search data: a search report, or `impact` over a search report. */
const tileNeedsSearch = (t) => isSearchReport(t.report) || t.report === "impact" && isSearchReport(t.params?.report ?? "");
/** Metric keys a `kpi`, `line` or `area` tile may show, per report (keys of the report's totals, series or goal row). */
const TILE_METRICS = {
	overview: SESSION_METRICS,
	timeseries: SESSION_METRICS,
	satisfaction: [
		"sessions",
		"measured",
		"measured_rate",
		"avg_duration",
		"avg_engaged",
		"pct_long",
		"pct_short",
		"pct_bad",
		"pogo_stick_rate",
		"returned_from_search_rate",
		"search_reentry_rate",
		"back_nav_rate",
		"score"
	],
	satisfaction_series: SAT_RATES,
	search_overview: SEARCH_METRICS,
	goals: [
		"completions",
		"converting",
		"conversion_rate"
	],
	search_cannibalization: [
		"cannibalized_queries",
		"cannibalized_impressions",
		"visible_share"
	],
	search_position_bands: [
		...POSITION_BANDS.map((b) => `queries_${bandSuffix(b)}`),
		"impressions_1_3",
		"share_1_3",
		"ctr_1_3"
	],
	search_position_bands_series: POSITION_BANDS.map((b) => `band_${bandSuffix(b)}`),
	search_position_moves: [
		"moved_up",
		"moved_down",
		"unchanged",
		"new",
		"lost"
	],
	revenue: [
		"revenue",
		"refunds",
		"net_revenue",
		"orders",
		"aov",
		"revenue_per_visitor",
		"revenue_per_session",
		"paying_sessions"
	],
	revenue_series: [
		"revenue",
		"refunds",
		"net_revenue",
		"orders",
		"aov"
	]
};
/** Amount keys: shown with their currency code, never as a bare number. */
const MONEY_KEYS = /* @__PURE__ */ new Set([
	"revenue",
	"aov",
	"revenue_per_visitor",
	"revenue_per_session"
]);
/** Display format of a metric key. */
function metricFormat(key) {
	if (key === "avg_duration" || key === "avg_time" || key === "avg_visible" || key === "avg_engaged") return "duration";
	if (key === "position" || key === "views_per_session") return "decimal";
	if (key === "ctr" || key === "share" || key.endsWith("_rate") || key.startsWith("pct_") || key.endsWith("_share") || key.endsWith("_pct") || key.startsWith("share_") || key.startsWith("ctr_") || key.startsWith("ctr")) return "percent";
	if (key.startsWith("position")) return "decimal";
	return "number";
}
/** Scale family of a series metric: lines of one family share an axis; position has its own, 1 at the top. */
const metricFamily = (key) => key === "position" ? "rank" : MONEY_KEYS.has(key) ? "money" : formatFamily(metricFormat(key));
/** Why a metric list cannot be one line or area tile, else null. */
function tileMetricsProblem(list) {
	if (!list.length) return "Choose at least one metric.";
	if (list.length > 4) return `Up to 4 metrics at once.`;
	if (new Set(list.map(metricFamily)).size > 2) return "These metrics need more than two scales.";
	return null;
}
/** Optional `Tile.params` keys per report; `source`, `goal`, `funnel`, `event` and `prop` keep their own rules. */
const TILE_PARAMS = {
	search_cannibalization: [
		"minImpressions",
		"minShare",
		"includeBrand"
	],
	search_cannibalization_pages: [
		"minImpressions",
		"minShare",
		"includeBrand"
	],
	search_position_bands: ["dim"],
	search_position_bands_series: ["dim", "metric"],
	search_position_moves: [
		"dim",
		"minImpressions",
		"list"
	],
	search_striking_distance: ["minImpressions", "includeBrand"],
	search_movers: [
		"dim",
		"direction",
		"metric",
		"minImpressions"
	],
	search_decay: ["minImpressions"],
	traffic_movers: ["direction", "minImpressions"],
	traffic_decay: ["minImpressions"],
	impact: [
		"annotation",
		"kind",
		"at",
		"window",
		"report",
		"key",
		"scope",
		"path",
		"currency"
	],
	revenue: ["currency"],
	revenue_series: ["currency"],
	revenue_breakdown: ["currency", "dim"],
	journey_paths: ["entry"],
	links: ["by", "slug"],
	satisfaction: ["rank"]
};
const SEO_PARAM_KEYS = [
	"by",
	"rank",
	"slug",
	"entry",
	"currency",
	"list",
	"dim",
	"direction",
	"metric",
	"minImpressions",
	"minShare",
	"includeBrand",
	"annotation",
	"kind",
	"at",
	"window",
	"report",
	"key",
	"scope",
	"path"
];
const Preset = z.enum(PRESETS.map((p) => p[0]));
/** A segment, goal or funnel reference: a record id in a dashboard, a record name in a template. */
const Ref = z.string().min(1).max(128);
const ColumnKey = z.string().regex(/^[a-z0-9_]{1,32}$/);
const TileSchema = z.object({
	id: z.string().regex(/^[a-z0-9]{6}$/),
	report: z.enum(TILE_REPORTS),
	kind: z.enum(TILE_KIND_NAMES),
	title: z.string().min(1).max(60).optional(),
	/** `kpi`, and the measure of a bars, donut or stacked tile. */
	metric: ColumnKey.optional(),
	/** `line` and `area`: the charted metrics, 1 to 4 on at most two scales. */
	metrics: z.array(ColumnKey).min(1).max(4).optional(),
	filters: z.array(FilterSchema).max(5).optional(),
	params: z.object({
		source: z.enum([
			"all",
			"google",
			"bing"
		]).optional(),
		goal: Ref.optional(),
		funnel: Ref.optional(),
		event: z.string().min(1).max(64).optional(),
		prop: z.string().regex(/^[A-Za-z0-9_]{1,32}$/).optional(),
		dim: z.enum(["query", ...REVENUE_BREAKDOWN_DIMS]).optional(),
		/** Revenue tiles: absent means the site's default currency at run time. */
		currency: z.string().refine(isCurrency, { message: "currency must be an ISO 4217 code such as USD" }).optional(),
		direction: z.enum(["up", "down"]).optional(),
		metric: z.enum([
			"clicks",
			"impressions",
			"queries"
		]).optional(),
		minImpressions: z.number().int().min(1).max(1e5).optional(),
		minShare: z.number().int().min(1).max(50).optional(),
		includeBrand: z.boolean().optional(),
		annotation: z.string().min(1).max(128).optional(),
		kind: z.enum([
			"manual",
			"publish",
			"update",
			"release"
		]).optional(),
		at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		window: z.number().int().refine((w) => IMPACT_WINDOWS.includes(w), { message: `window must be one of ${IMPACT_WINDOWS.join(", ")}` }).optional(),
		report: z.enum(IMPACT_REPORTS).optional(),
		key: z.string().min(1).max(512).optional(),
		scope: z.enum(["annotation", "none"]).optional(),
		path: z.string().min(1).max(512).regex(/^\//).optional(),
		/** `journey_paths`: the landing page. */
		entry: z.string().min(1).max(512).regex(/^\//).optional(),
		/** `search_position_moves` tables: the matrix (default) or one of the four lists. */
		list: z.enum([
			"matrix",
			"up",
			"down",
			"new",
			"lost"
		]).optional(),
		/** `links`: the breakdown and one link (Links convention). */
		by: z.enum(LINK_BY).optional(),
		/** `satisfaction` tables: best or worst landing pages by score. */
		rank: z.enum(["best", "worst"]).optional(),
		slug: z.string().min(1).max(128).optional()
	}).strict().optional(),
	limit: z.number().int().min(5).max(25).optional(),
	w: z.union([
		z.literal(1),
		z.literal(2),
		z.literal(3)
	])
}).strict().superRefine((t, ctx) => {
	const issue = (message, path) => ctx.addIssue({
		code: "custom",
		message,
		path: [path]
	});
	const kinds = TILE_KINDS[t.report];
	if (!kinds.includes(t.kind)) issue(`${t.report} cannot be shown as ${t.kind}; allowed: ${kinds.join(", ")}`, "kind");
	const series = t.kind === "line" || t.kind === "area";
	const p = t.params ?? {};
	const metrics = t.report === "impact" ? p.report ? IMPACT_METRICS[p.report] : [] : TILE_METRICS[t.report];
	if (t.kind === "kpi" && !t.metric) issue("a kpi tile needs a metric", "metric");
	if (t.kind === "kpi" && t.metric && !metrics?.includes(t.metric)) issue(`unknown metric ${t.metric} for ${t.report}`, "metric");
	if (series && t.metric) issue(`a ${t.kind} tile names its metrics in metrics`, "metric");
	if (!series && t.metrics) issue("metrics is for line and area tiles", "metrics");
	if (series && !t.metrics) issue(`a ${t.kind} tile needs metrics`, "metrics");
	if (series && t.metrics) {
		for (const m of t.metrics) if (!metrics?.includes(m)) issue(`unknown metric ${m} for ${t.report}`, "metrics");
		if (new Set(t.metrics).size !== t.metrics.length) issue("a metric is listed twice", "metrics");
		const problem = tileMetricsProblem(t.metrics);
		if (problem) issue(problem, "metrics");
		if (t.report === "impact" && t.metrics.length > 1) issue("an impact line shows one metric", "metrics");
	}
	if (t.kind === "stacked" && t.metric && t.metric !== "queries" && t.metric !== "impressions") issue("a stacked tile shows queries or impressions", "metric");
	for (const k of SEO_PARAM_KEYS) if (p[k] !== void 0 && !TILE_PARAMS[t.report]?.includes(k)) issue(`params.${k} is not a parameter of ${t.report}`, "params");
	if (t.report === "search_position_bands_series" && p.metric === "clicks") issue("params.metric is queries or impressions here", "params");
	if (t.report === "search_movers" && p.metric === "queries") issue("params.metric is clicks or impressions here", "params");
	if (p.dim && t.report === "revenue_breakdown" && p.dim === "query") issue("params.dim of revenue_breakdown is one of " + REVENUE_BREAKDOWN_DIMS.join(", "), "params");
	if (p.dim && t.report !== "revenue_breakdown" && p.dim !== "query" && p.dim !== "page") issue("params.dim is query or page here", "params");
	if (t.report === "revenue_breakdown" && !p.dim) issue("a revenue_breakdown tile needs params.dim", "params");
	if (p.currency && t.report === "impact" && p.report !== "revenue") issue("params.currency is for revenue reports", "params");
	if (t.report === "impact" && !p.report) issue("an impact tile needs params.report", "params");
	if (t.report === "impact" && !p.annotation && !p.at) issue("an impact tile needs params.annotation or params.at", "params");
	if (t.report === "goals" && t.kind === "kpi" && !p.goal) issue("a goals kpi tile needs params.goal", "params");
	if (p.goal && t.report !== "goals" && !(t.report === "impact" && p.report === "goals")) issue("params.goal is for the goals report", "params");
	if (t.report === "funnels" && !p.funnel) issue("a funnels tile needs params.funnel", "params");
	if (p.funnel && t.report !== "funnels") issue("params.funnel is for the funnels report", "params");
	if (t.report === "event_props" && !p.event) issue("an event_props tile needs params.event", "params");
	if ((p.event || p.prop) && t.report !== "event_props") issue("params.event and params.prop are for the event_props report", "params");
	if (p.source && !tileNeedsSearch(t)) issue("params.source is for the search reports", "params");
});
const body = {
	name: z.string().trim().min(1).max(80),
	tiles: z.array(TileSchema).min(1),
	defaults: z.object({
		range: Preset,
		compare: z.enum([
			"none",
			"previous",
			"year",
			"segment"
		]),
		segment: Ref.optional(),
		/** Side B of `compare: "segment"` (additive on `v: 1`). */
		compareSegment: Ref.optional(),
		filters: z.array(FilterSchema).max(10)
	}).strict(),
	/** `annotations` (additive on v 1): show matching annotations on shared pages; absent means off. */
	viewer: z.object({
		ranges: z.array(Preset).min(1).max(PRESETS.length),
		compare: z.boolean(),
		annotations: z.boolean().optional()
	}).strict()
};
const refine = (d, ctx) => {
	if (!d.viewer.ranges.includes(d.defaults.range)) ctx.addIssue({
		code: "custom",
		message: "defaults.range must be one of viewer.ranges",
		path: ["defaults", "range"]
	});
	if (d.defaults.compare === "segment" !== (d.defaults.compareSegment !== void 0)) ctx.addIssue({
		code: "custom",
		message: "defaults.compareSegment is required for compare segment and only allowed there",
		path: ["defaults", "compareSegment"]
	});
	const seen = /* @__PURE__ */ new Set();
	d.tiles.forEach((t, i) => {
		if (seen.has(t.id)) ctx.addIssue({
			code: "custom",
			message: `duplicate tile id ${t.id}`,
			path: [
				"tiles",
				i,
				"id"
			]
		});
		seen.add(t.id);
	});
};
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/** A plain address: no display name, no list separators, at most 254 characters. */
const RECIPIENT_RE = /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[A-Za-z]{2,}$/;
const Recipient = z.string().max(254).refine((v) => RECIPIENT_RE.test(v) && !CONTROL.test(v), { message: "Use a plain email address such as reports@example.com." });
/** What `dashboards/email/save` accepts. */
const EmailSettings = z.object({
	enabled: z.boolean(),
	frequency: z.enum(["weekly", "monthly"]),
	/** ISO weekday, 1 is Monday. */
	weekday: z.number().int().min(1).max(7).default(1),
	/** 1 to 28, so every month has the day. */
	monthday: z.number().int().min(1).max(28).default(1),
	/** Hour in the site timezone. */
	hour: z.number().int().min(0).max(23).default(8),
	recipients: z.array(Recipient).min(1).max(5),
	range: Preset,
	compare: z.boolean(),
	subject: z.string().min(1).max(80).refine((v) => !CONTROL.test(v), { message: "The subject cannot contain control characters." }).optional()
}).strict();
/** The stored `Dashboard.email`: the settings plus the send state. `emailNext` is a top level field (an index reaches top level names only). */
const EmailRecord = EmailSettings.extend({
	lastSent: z.number().int().optional(),
	lastError: z.string().max(300).optional(),
	/** Recipients of a failed send; only they are retried. */
	pending: z.array(Recipient).max(5).optional(),
	/** Retries used for the pending recipients. */
	retries: z.number().int().min(0).max(9).optional()
}).strict();
/** What an editor or agent sends: a dashboard without site and times (`id` absent creates). */
const DashboardInput = z.object({
	id: z.string().regex(/^[a-z0-9]{12}$/).optional(),
	...body
}).strict().superRefine(refine);
const DashboardSchema = z.object({
	id: z.string().regex(/^[a-z0-9]{12}$/),
	site: z.string().min(1).max(32),
	v: z.literal(1),
	...body,
	created: z.number().int(),
	updated: z.number().int(),
	/** Written only by `dashboards/email/save` and the mail tick. */
	email: EmailRecord.optional(),
	/** Next due time, epoch seconds; indexed; absent when no schedule is enabled. */
	emailNext: z.number().int().optional()
}).strict().superRefine(refine);
/** Dependency definitions carried by a template (the config collection items, without `site`). */
const Dep = z.object({ name: z.string().min(1).max(64) }).passthrough();
const TemplateSchema = z.object({
	kind: z.literal("dashboard-template"),
	v: z.literal(1),
	...body,
	description: z.string().max(300).optional(),
	dependencies: z.object({
		segments: z.array(Dep).max(50).optional(),
		goals: z.array(Dep).max(50).optional(),
		funnels: z.array(Dep).max(50).optional()
	}).strict().optional()
}).strict().superRefine(refine);
var DashboardError = class extends Error {
	code;
	/** Ids of the tiles the error is about (structural errors). */
	tiles;
	constructor(code, message, tiles = []) {
		super(message);
		this.code = code;
		this.tiles = tiles;
	}
};
const bytes$1 = (v) => new TextEncoder().encode(JSON.stringify(v)).length;
/** Parse with typed errors: tile count first, then the zod structure (naming the offending tiles), then the record size. */
function parseStrict(schema, input, code) {
	const raw = input;
	if (raw && typeof raw === "object" && "v" in raw && raw.v !== 1) throw new DashboardError("unknown_version", `Unknown record version ${String(raw.v).slice(0, 16)}; this reader knows version 1.`);
	if (Array.isArray(raw?.tiles) && raw.tiles.length > 12) throw new DashboardError("too_many_tiles", `At most 12 tiles.`);
	const r = schema.safeParse(input);
	if (!r.success) {
		const tiles = Array.isArray(raw?.tiles) ? raw.tiles : [];
		const bad = /* @__PURE__ */ new Set();
		for (const i of r.error.issues) if (i.path[0] === "tiles" && typeof i.path[1] === "number") bad.add(String(tiles[i.path[1]]?.id ?? `#${i.path[1] + 1}`));
		const first = r.error.issues[0];
		throw new DashboardError(code, `${first ? `${first.path.join(".")}: ${first.message}` : "invalid"}${bad.size ? ` (tiles ${[...bad].join(", ")})` : ""}`, [...bad]);
	}
	if (code === "invalid_dashboard" && bytes$1(r.data) > 16384) throw new DashboardError("record_too_large", `The record is larger than ${MAX_RECORD_BYTES} bytes.`);
	return r.data;
}
/** A stored record: unknown `v` is a typed error. */
const readDashboard = (data) => parseStrict(DashboardSchema, data, "invalid_dashboard");
/** A dashboard without its schedule: what agent routes, export and MCP tools may return. */
function withoutEmail(d) {
	const { email: _e, emailNext: _n, ...rest } = d;
	return rest;
}
// src/agent/query.ts
/** Scopes a query needs: search reports need `read:search`, traffic reports `read:analytics`, `pages` with search columns both. */
function requiredScopes(body) {
	if (body.report === "impact") return body.params?.report?.startsWith("search_") ? ["read:analytics", "read:search"] : ["read:analytics"];
	if (REPORTS[body.report][0] === "search" || body.report === "dimension_values" && body.params?.scope === "search") return ["read:search"];
	if ((body.report === "pages" || body.report === "annotation_impacts") && body.params?.withSearch) return ["read:analytics", "read:search"];
	return ["read:analytics"];
}
/** Typed rejection of a query the agent API does not serve, or null. */
function agentBounds(body) {
	if (body && !((Date.parse(body.query.to) - Date.parse(body.query.from)) / 864e5 < 400)) return {
		error: "range_too_long",
		message: `The range is longer than 400 days.`
	};
	return null;
}
// src/agent/schemas.ts
/**
* Agent API request schemas and the endpoint table. Kept free of host imports so
* `scripts/build-openapi.mjs` can load it under plain Node.
*/
/** Optional site: the local site or a client site of this database; absent means the local site. */
const AgentSite = z.string().regex(/^[a-z0-9-]{1,32}$/).optional();
/** A real calendar day: `2026-02-30` or `0000-00-00` would turn range math into NaN or another day. */
const Day$5 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => addDays(d, 0) === d, { message: "not a calendar day" });
/** The admin `Query` and report names; `query.site` names the site (a remote satellite id answers `site_not_allowed`). */
const AgentQueryBody = z.object({
	report: z.enum(REPORT_NAMES),
	query: QuerySchema,
	params: ParamsSchema.optional(),
	limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
	offset: z.number().int().min(0).max(1e5).optional(),
	/** Matching annotations as `data.annotations`. */
	withAnnotations: z.boolean().optional()
}).strict();
/** Optional range in the query string; the default is the last 7 days (summary) or 30 days (annotations), today included. */
const RangeParams = z.object({
	from: Day$5.optional(),
	to: Day$5.optional(),
	site: AgentSite
}).strict();
const SiteParams = z.object({ site: AgentSite }).strict();
/** `GET summary`: the range plus the compare option (default the previous period); a master's All-sites row reads it. */
const SummaryParams = RangeParams.extend({ compare: z.enum([
	"previous",
	"year",
	"none"
]).optional() }).strict();
/** `GET annotations`: the range plus concrete values; only annotations whose scope matches them are returned. */
const AnnotationParams = RangeParams.extend({
	path: z.string().min(1).max(512).optional(),
	host: z.string().min(1).max(253).optional(),
	query: z.string().min(1).max(512).optional(),
	/** Text search: title, kind, scope or source slug contains it (case-insensitive). */
	q: z.string().trim().max(100).optional()
}).strict();
const AnnotationBody = z.object({
	text: z.string().trim().min(1).max(200),
	/** Epoch seconds; defaults to now. */
	ts: z.number().int().min(0).optional(),
	kind: z.enum(["release", "manual"]).default("release"),
	/** Shortcut for one page: `{ v: 1, path: [{ op: "is", value: path }] }`. Not together with `scope`. */
	path: PathShortcut.optional(),
	scope: ScopeSchema.optional(),
	/** The KPI its impact is measured on (`report`, `metric`, `params`); absent means visitors of the scope. */
	target: TargetSchema.optional(),
	site: AgentSite
}).strict();
const SearchSyncBody = z.object({
	source: z.enum(["google", "bing"]).optional(),
	site: AgentSite
}).strict();
const BackfillBody = z.object({
	action: z.enum([
		"start",
		"cancel",
		"status"
	]),
	source: z.enum(["google", "bing"]).optional(),
	days: z.number().int().min(0).max(1e3).optional(),
	from: Day$5.optional(),
	to: Day$5.optional(),
	site: AgentSite
}).strict();
const DashId = z.string().regex(/^[a-z0-9]{12}$/);
/** `compare: "segment"` uses the dashboard's `defaults.compareSegment`; without one the tiles run without comparison. */
const DashboardDataBody = z.object({
	id: DashId,
	site: AgentSite,
	range: Preset.optional(),
	compare: z.enum([
		"none",
		"previous",
		"year",
		"segment"
	]).optional()
}).strict();
/** Parsed loosely so the dashboard itself gets the typed errors of the record schema. */
const DashboardSaveBody = z.object({
	dashboard: z.record(z.string(), z.unknown()),
	site: AgentSite
}).strict();
const DashboardSaveDoc = z.object({
	dashboard: DashboardInput,
	site: AgentSite
}).strict();
const DashboardDeleteBody = z.object({
	id: DashId,
	site: AgentSite
}).strict();
/** `POST events`: parsed loosely so each item gets its own result; `EventsDoc` documents the item. */
const EventsBody = z.object({
	site: AgentSite,
	events: z.array(z.unknown()).min(1).max(20)
}).strict();
const AgentEvent = z.object({
	name: z.string().min(1).max(64).describe("Event name; a leading underscore is reserved."),
	val: z.number().min(0).max(1e9).optional().describe("Order value, rounded to the currency's minor unit. Not with refund."),
	cur: z.string().length(3).optional().describe("ISO 4217 code; absent means the site's default currency."),
	oid: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/).optional().describe("Order id: one order is stored once, by any path. Reposting it here replaces the amount and currency and counts in data.duplicates. Never stored."),
	void: z.literal(true).optional().describe("With name and oid only, no val: sets the stored order's value and currency to null, the event stays. An order id not stored is rejected with unknown_order. Works inside the raw window only."),
	refund: z.number().gt(0).max(1e9).optional().describe("With name, oid and rid: refund this amount of the stored order (same name and oid), booked on the refund's own day (ts) with the order's attribution, page and currency. Partial refunds add up; above the order's amount is refund_exceeds_order, an order id not stored is unknown_order, cur other than the order's is currency_mismatch. sid, u and p are not read."),
	rid: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/).optional().describe("Refund id, required with refund: a refund is stored once per order and refund id, so a retry counts in data.duplicates. Never stored."),
	sid: z.string().regex(/^[a-z0-9]{20}$/).optional().describe("The page's session id (window.<namespace>.sid) to attribute the event; absent stores it unattributed."),
	ts: z.number().int().optional().describe("Epoch seconds, from 30 days ago (and after the first day of the raw window) to 60 s ahead; absent means now."),
	u: z.string().max(2048).optional().describe("Path; absent means the session's last page."),
	p: z.record(z.string(), z.union([
		z.string(),
		z.number(),
		z.boolean()
	])).optional().describe("Properties, at most 10.")
});
const EventsDoc = z.object({
	site: AgentSite,
	events: z.array(AgentEvent).min(1).max(20)
}).strict();
/** Rows per `data/dump` and `data/load` call at most; a dump also stops before 1.2 MB (`MAX_CHUNK_BYTES`). */
const MAX_DATA_ROWS = 1e3;
const DataTable = z.enum(TABLES$1).describe("One of the nine analytics tables.");
const DataDumpBody = z.object({
	site: AgentSite.describe("Only this site's rows; absent means every site of the database (a key with a site restriction always gets its one site)."),
	table: DataTable,
	cursor: z.array(z.union([z.string(), z.number()])).min(1).max(8).nullable().optional().describe("The next-cursor header of the previous call; absent or null starts at the beginning."),
	limit: z.number().int().min(1).max(MAX_DATA_ROWS).optional().describe("Rows at most; default 50 on the small capacity profile, 500 otherwise. An answer also stops before 1.2 MB: ask for fewer rows after an answer that came back short with a next cursor.")
}).strict();
const DataLoadBody = z.object({
	site: AgentSite.describe("When set, every row must be of this site."),
	layout: z.number().int().describe("The table layout of the export; must equal the site's (x-layout of data/dump)."),
	table: DataTable,
	rows: z.array(z.record(z.string(), z.unknown())).max(MAX_DATA_ROWS).describe("Rows as data/dump wrote them, one object per row.")
}).strict();
/** Every agent route and method. Route names are mounted at `/_emdash/api/plugins/cookieless-analytics/<name>`. */
const ENDPOINTS = [
	{
		name: "agent/v1/query",
		method: "POST",
		scope: "read:analytics",
		summary: "Run one report. query.compare segment with query.compareSegment compares two segments on the same range (not on search reports, the SEO views or impact). Search reports, including the SEO views, need read:search instead; pages with withSearch and impact over a search report need both. Revenue reports (revenue, revenue_series, revenue_breakdown, revenue_orders) answer in params.currency, default the site's defaultCurrency, list every currency with orders in data.currencies and name the currency in meta.currency; money of two currencies is never added. Long ranges and ranges before the detailed window are answered from daily summaries (notices summary, filter_unavailable:<dim>:<reason>, detail_from:<day>; errors raw_only and narrow_range; the catalog's summaries entry has the rule).",
		body: AgentQueryBody
	},
	{
		name: "agent/v1/reports",
		method: "GET",
		scope: "read:analytics",
		summary: "Catalog: report names, dimensions, operators, metric definitions and scopes."
	},
	{
		name: "agent/v1/summary",
		method: "GET",
		scope: "read:analytics",
		summary: "The Overview numbers for a range, compared with the previous period (compare=year for the same period last year, none for no comparison), plus data.revenue: revenue, refunds, net revenue and orders per currency, never summed across currencies.",
		params: SummaryParams
	},
	{
		name: "agent/v1/status",
		method: "GET",
		scope: "read:analytics",
		summary: "Versions, data freshness, rollup watermark, drop counters and search sync state.",
		params: SiteParams
	},
	{
		name: "agent/v1/annotations",
		method: "GET",
		scope: "read:analytics",
		summary: "Annotations in a range, newest first, with scope and summary; path, host and query keep the ones whose scope matches that value; q keeps the ones whose title, kind, scope or source slug contains the text.",
		params: AnnotationParams
	},
	{
		name: "agent/v1/annotations",
		method: "POST",
		scope: "write:annotations",
		summary: "Add an annotation, for example a release from a deploy script; scope limits where it shows, path is a shortcut for one page.",
		body: AnnotationBody
	},
	{
		name: "agent/v1/search/sync",
		method: "POST",
		scope: "sync:search",
		summary: "Run one Search sync tick now.",
		body: SearchSyncBody
	},
	{
		name: "agent/v1/search/backfill",
		method: "POST",
		scope: "sync:search",
		summary: "Start, cancel or read the progress of a Search backfill.",
		body: BackfillBody
	},
	{
		name: "agent/v1/dashboards",
		method: "GET",
		scope: "read:analytics",
		summary: "Dashboard definitions of the key's sites, or of one site with ?site=.",
		params: SiteParams
	},
	{
		name: "agent/v1/dashboards/data",
		method: "POST",
		scope: "read:analytics",
		summary: "Run every tile of one dashboard. A dashboard with a search tile also needs read:search.",
		body: DashboardDataBody
	},
	{
		name: "agent/v1/dashboards/save",
		method: "POST",
		scope: "write:dashboards",
		summary: "Create (no id) or replace a dashboard; the catalog lists the tile kinds per report.",
		body: DashboardSaveDoc
	},
	{
		name: "agent/v1/dashboards/delete",
		method: "POST",
		scope: "write:dashboards",
		summary: "Delete a dashboard.",
		body: DashboardDeleteBody
	},
	{
		name: "agent/v1/events",
		method: "POST",
		scope: "write:events",
		summary: "Record 1 to 20 events, typically orders from a payment webhook; invalid items are listed in data.rejected by index; a repeated order id replaces the stored amount and currency, a void item nulls them, both count in data.duplicates.",
		body: EventsDoc
	},
	{
		name: "agent/v1/data/dump",
		method: "POST",
		scope: "data:export",
		summary: "One chunk of a table's stored rows as NDJSON (application/x-ndjson, one row per line, under 1.2 MB), read by primary key. Headers: x-next-cursor (URI encoded JSON array for the next call; absent when the table is done), x-layout (table layout), x-engine (sqlite or postgres), x-total (row count, on the first call of a table only). Used by the ca-data CLI for backups and moves.",
		body: DataDumpBody
	},
	{
		name: "agent/v1/data/load",
		method: "POST",
		scope: "data:import",
		summary: "Insert rows written by data/dump. Idempotent: a row whose key exists is kept as it is, so a repeated chunk inserts 0 rows; counters of ca_srv and ca_drops are not added. A layout other than the site's answers 400 layout_mismatch; a row whose site, columns or values the table cannot store answers 400 invalid_row; 409 delete_running or move_running while a delete of the Data page or a data move into that database runs. On the small capacity profile with D1 the rows count against the day's copy rows (shared with the data move): 429 daily_limit with Retry-After to 00:00 UTC. Answers data.inserted; an empty rows array writes nothing and answers data.layout and the table's row count in data.total.",
		body: DataLoadBody
	},
	{
		name: "agent/v1/openapi.json",
		method: "GET",
		scope: null,
		summary: "This OpenAPI document."
	}
];
/** Metric definitions served by the catalog; the admin InfoMark caveats say the same in more words. */
const METRICS = {
	visitors: "Distinct daily visitor keys summed per day; a visitor seen on two days counts twice. Cross-day uniques are not tracked.",
	sessions: "Sessions of humans; the window is the sessionWindowMinutes setting.",
	pageviews: "Page views of humans.",
	views_per_session: "pageviews / sessions.",
	bounce_rate: "Sessions that are not engaged, divided by sessions: 1 - engaged_rate (the GA4 meaning).",
	engaged_rate: "Sessions with active time at or above the engagement threshold, more than one page view or any event, divided by sessions.",
	avg_duration: "Mean session duration in seconds: the longer of the visit span (first to last activity) and the visible time. Not interaction time.",
	avg_time: "Mean active time per page view in seconds (pages report): time with interaction, within 60 s of the last one, so an open but untouched page counts 0 s.",
	avg_visible: "Mean visible time per page view in seconds (pages report, detailed data only; null in summaries).",
	realtime: "Sessions active within the realtime window (overview only).",
	conversions: "Sessions that reached a goal.",
	conversion_rate: "conversions / sessions of the filtered set.",
	clicks: "Search clicks reported by the provider.",
	impressions: "Search impressions reported by the provider.",
	ctr: "clicks / impressions.",
	position: "Impression weighted mean position: sum of position times impressions, divided by impressions.",
	measured: "Sessions with at least one engagement update (visible time above 0); the Search Satisfaction rates divide by these.",
	search_sessions: "Organic search sessions (Search Satisfaction reports, which cover organic search sessions only).",
	long_clicks: "Measured sessions longer than the longClickSeconds setting (default 60 s).",
	short_clicks: "Measured sessions at or below the longClickSeconds setting.",
	bad_experiences: "Measured single page sessions without events or interaction, shorter than min(badExperienceSeconds, longClickSeconds).",
	search_measured: "Measured search sessions: the denominator of pogo_stick_rate (Search Satisfaction reports).",
	pogo_sticks: "Measured search sessions with one page view, no events, a short click, and a page left for the back and forward cache.",
	reentered: "Search sessions that a later arrival from a search engine joined.",
	returned_from_search: "Search sessions that a later arrival from a search engine joined and whose landing page view (the first) was left for the back and forward cache.",
	avg_engaged: "Mean active time per session in seconds (Search Satisfaction reports): time with interaction, not the time the page was open.",
	measured_rate: "measured / sessions: the share of sessions with a measurable end.",
	score: "pct_long - pct_bad - pogo_stick_rate (pogo_stick_rate counts as 0 without measured search sessions); null without measured sessions. Ranks best and worst pages (satisfaction params.rank).",
	pct_long: "long_clicks / measured.",
	pct_short: "short_clicks / measured.",
	pct_bad: "bad_experiences / measured.",
	pogo_stick_rate: `pogo_sticks / search_measured. ${POGO_DEFINITION} An estimate.`,
	returned_from_search_rate: "returned_from_search / search_sessions. A stronger pogo-sticking signal: the visitor demonstrably came back from a search engine. An estimate.",
	search_reentry_rate: "reentered / search_sessions. An estimate.",
	back_nav_rate: "Page loads of type back_forward / page loads with a known navigation type; restores from the back and forward cache are not loads, so a lower bound. An estimate.",
	cannibalized_queries: "Queries with two or more pages each holding at least minShare percent of the query's impressions, and at least minImpressions impressions in the range (search_cannibalization).",
	cannibalized_impressions: "Impressions of the cannibalized queries.",
	visible_share: "Page with query impressions over total impressions of the range: the share of search traffic the pair views can see.",
	impressions_share: "A page's (or band's) impressions over the query's (or all) impressions.",
	moved_up: "Queries whose position band improved between the previous and the current period.",
	moved_down: "Queries whose position band worsened between the two periods.",
	potential_clicks: "impressions * max(0, ctr_1_3 - ctr), where ctr_1_3 is the site's own CTR in band 1-3 over the same range; null below 1,000 band 1-3 impressions. An estimate.",
	notable: "abs(current - previous) > 2 * sqrt(current + previous) for counts; a rule of thumb for count data, not a statistical test.",
	loss: "Clicks (or page views) of the oldest period minus the current period (decay views).",
	revenue: "Sum of the values of revenue events (events sent with a value) in one currency, before refunds (gross).",
	refunds: "Sum of the refunds booked in the range (agent/v1/events refund items), by the refund's own day and the order's attribution.",
	net_revenue: "revenue - refunds; negative on a day or key with more refunds than new orders.",
	orders: "Revenue events in the currency; an event with value 0 is an order of zero. A refund is not an order and never changes this count.",
	aov: "Average order value: revenue / orders, per currency.",
	revenue_per_visitor: "revenue / visitors, where visitors is the Overview figure for the same filters and range (all visitors, not only buyers).",
	revenue_per_session: "revenue / sessions of the filtered set.",
	paying_sessions: "Distinct sessions with at least one revenue event in the currency."
};
/** Catalog of the revenue reports. */
const REVENUE_CATALOG = {
	reports: {
		revenue: {
			params: ["currency"],
			metrics: [
				"revenue",
				"refunds",
				"net_revenue",
				"orders",
				"aov",
				"revenue_per_visitor",
				"revenue_per_session",
				"paying_sessions"
			]
		},
		revenue_series: {
			params: ["currency"],
			metrics: [
				"revenue",
				"refunds",
				"net_revenue",
				"orders",
				"aov"
			]
		},
		revenue_breakdown: {
			params: ["currency", "dim"],
			dims: REVENUE_BREAKDOWN_DIMS,
			metrics: [
				"revenue",
				"refunds",
				"net_revenue",
				"orders",
				"aov",
				"revenue_per_visitor"
			]
		},
		revenue_orders: {
			params: ["currency"],
			fields: [
				"key",
				"day",
				"amount",
				"refund",
				"channel",
				"entry",
				"country"
			],
			rule: `The newest orders and refunds of the range, at most 50, from detailed data only (raw_only before the detailed window). key is the stored order reference (a hash of the order id); amount is negative for a refund; channel, entry and country are the first touch of the order's visit. No session or visitor key.`
		}
	},
	withRevenue: [
		"channels",
		"sources",
		"campaigns",
		"pages",
		"entry_pages",
		"countries",
		"devices",
		"events",
		"goals"
	],
	filterDims: {
		currency: { ops: ["is", "is_not"] },
		revenue: {
			ops: NUM_OPS,
			value: REVENUE_VALUE_RE.source,
			prop: "an ISO 4217 code; absent means the site's default currency"
		}
	},
	currencyRule: "Money of two currencies is never added. Every revenue report answers in params.currency (default: the site's defaultCurrency) and lists every currency with orders in data.currencies; meta.currency names the currency of the figures.",
	errors: [
		"invalid_currency",
		"invalid_params",
		"invalid_filter"
	],
	ingest: {
		route: "agent/v1/events",
		scope: "write:events"
	}
};
/** Catalog of funnel modes, segment comparison and journeys. */
const BEHAVIOUR_CATALOG = {
	funnels: {
		params: [
			"funnel",
			"steps",
			"mode",
			"withRevenue",
			"currency"
		],
		modes: {
			sequential: "Step n is reached by a matching hit after the step n-1 hit in the same session; anything may happen between. The default, also for a stored funnel without mode.",
			strict: "Step n must be the next countable hit of the session after the step n-1 hit. Countable: pageviews, user events (not _ events) and any hit matching a step. Hits in the same second are simultaneous: never between, and may satisfy consecutive steps in either order.",
			flexible: "The steps may be completed in any order within one session; step n counts sessions that completed steps 1 to n."
		},
		revenueRule: "withRevenue adds per step the revenue of the sessions that reached it, in params.currency or the site's defaultCurrency: revenue, orders, aov, paying_sessions, revenue_per_session, revenue_currency, refunds and net_revenue when present. Every order of such a session in the range counts at every step it reached. est_lost_revenue is an estimate: the sessions that left before the step times the revenue per session of the sessions that reached the last step. Without orders in the range the keys are absent; data.other_currencies lists the other codes.",
		modeRule: "A stored funnel (params.funnel) uses its own mode; params.mode applies to ad hoc params.steps. data.mode names the mode used.",
		sessionCaps: {
			sequential: FUNNEL_SESSION_CAP,
			flexible: FUNNEL_SESSION_CAP,
			strict: FUNNEL_STRICT_SESSION_CAP
		},
		errors: [
			"funnel_cap",
			"unknown_funnel",
			"invalid_params"
		]
	},
	compareSegment: {
		query: {
			compare: "segment",
			compareSegment: "a segment id of the site"
		},
		rule: "Side B runs over the same range with the ad hoc filters and the compare segment in place of query.segment; compareTotals, previous per row and compareSeries hold side B, compareRange equals the range, and the result echoes segment and compareSegment as { id, name }. Visitors are never summed across the two sides.",
		notSupported: "Search reports, the SEO views and impact answer compare_not_supported; an unknown segment answers unknown_segment."
	},
	journeys: {
		reports: {
			journey_next: {
				params: ["path"],
				tile: false
			},
			journey_prev: {
				params: ["path"],
				tile: false
			},
			journey_paths: {
				params: ["entry"],
				tile: true
			}
		},
		maxRangeDays: 31,
		sessionCap: JOURNEY_SESSION_CAP,
		minSessions: 2,
		maxRows: 20,
		rule: "Pageviews of the filtered sessions. A range starting before the raw window reads the daily summaries: the top steps and paths of each day (notice top_paths_per_day), no filters (filter_unavailable:<dim>:not_kept). Consecutive views of one path are one step. Rows with fewer than minSessions sessions are omitted and counted in data.hidden_sessions. Pageviews in the same second are ordered by hit id, so such pairs may swap.",
		errors: [
			"journey_range",
			"journey_cap",
			"raw_only",
			"invalid_params"
		]
	}
};
/** Catalog of the per-collection and site search reports. */
const CONTENT_CATALOG = {
	collections: {
		tile: true,
		metrics: {
			pageviews: "Pageviews of the collection's pages.",
			visitors: "Page visitors: the sum of per-page daily visitors, so one person reading two pages counts twice.",
			sessions: "Sessions summed per page.",
			avg_time: "Average active time per page view in seconds: time with interaction, not the time the page was open.",
			pages: "Distinct paths of the collection."
		},
		rule: "Reads the daily page summaries (ca_rollup dim page), so it covers the whole summary retention. Paths are classified by each routable collection's URL pattern; the pattern with the most literal characters wins and unmatched paths are (other). totals.coverage is the classified share of all pageviews; the rest is folded into (other) by the top 500 pages per day.",
		cacheSeconds: 300,
		notices: ["filters_not_applied", "not_available_for_site"]
	},
	site_search: {
		tile: true,
		metrics: {
			searches: "Pageviews carrying the term.",
			sessions: "Sessions per term, summed over the distinct stored query strings that carry it; an upper bound when sessions_upper_bound is true.",
			searches_per_session: "searches over sessions."
		},
		setting: "siteSearchParams",
		maxParams: 5,
		termMax: 64,
		distinctCap: SITE_SEARCH_DISTINCT_CAP,
		minSessionsShared: 2,
		rule: "Raw window only. Terms are trimmed, lowercased, whitespace collapsed, at most 64 characters, and redacted when they hold an @ or nine or more consecutive digits. The agent API and the admin show every term; shared pages and emails omit terms of fewer than minSessionsShared sessions and count them in data.hidden_terms. Whether a search found results is unknown; send an event such as search_no_results.",
		notices: ["site_search_off", "site_search_capped"],
		errors: ["raw_only"]
	}
};
/** Catalog of the satisfaction reports (docs/sessions.md). */
/** Catalog of the routing rule and the summary engine (docs/AGENTS.md). */
const SUMMARY_CATALOG = {
	rule: `A report reads the detailed visits when its range lies inside the detailed window (status.rawFrom onward) and the stored days hold at most the scan budget of the capacity profile (${Object.entries(SCAN_BUDGET).map(([k, v]) => `${k} ${v.toLocaleString("en-US")}`).join(", ")} visits). Above it the daily summaries answer when they honour every filter; otherwise the detailed visits answer up to 4 times the budget, and beyond that the error narrow_range names the longest range that fits. A range before the detailed window reads the summaries; reports without summaries answer raw_only. Days not stored yet (today, and yesterday until it closes) are computed from the visits on read, so summary figures include today.`,
	filters: "Summaries apply filters on the report's own dimension. One of channel, country and device combines with page, entry, source, utm_campaign, event or goal (pair rows). Two or three of channel, country and device combine with each other (the daily cube) in overview, timeseries, channels, countries, devices, revenue and revenue_series, and revenue_breakdown by channel, country or device; next to another breakdown or another session filter only one applies. They do not apply: is_not, not_contains, not_prefix and not_regex on page, event, goal and utm_campaign, or on any dimension of a revenue read; browser, os, exit and lang on a revenue read; a filter on the own dimension of events, goals, exit_pages and of revenue_breakdown by page, event or goal. No filter is dropped silently.",
	notices: {
		summary: "The answer reads the daily summaries.",
		compare_summary: "The compare range reads the daily summaries.",
		"filter_unavailable:<dim>:<reason>": "This filter was not applied. reason not_kept: the summaries keep no such dimension (revenue summaries keep channel, source, utm_campaign, entry, page, country, device, event and goal); combination: it cannot be combined with the report's dimension or the other filters in summaries; negated: the summaries cannot answer this negated operator (page, event, goal and utm_campaign, and every dimension of a revenue read); own: a filter on the report's own dimension (events, goals, exit pages, and the revenue breakdown by page, event or goal).",
		"detail_from:<day>": "The first day of detailed data: a range from that day applies every filter and every report.",
		"summary_other:<dim>": "On some days of the range the summaries hold this filtered dimension's rarer values summed into (other), which a filter cannot match: the figures may be low.",
		"summary_behind:<from>:<to>": "These days have no stored daily summaries yet (the background runs are more than four days behind) and are missing from a summary answer until they catch up."
	},
	errors: ["raw_only", "narrow_range"]
};
const SATISFACTION_CATALOG = {
	params: {
		by: SATISFACTION_BY,
		rank: `best | worst: landing pages with at least 30 measured sessions ordered by score; only with by entry (the default)`
	},
	minMeasured: 30,
	pogoDefinition: POGO_DEFINITION
};
/** Catalog of the `links` report (Links convention, docs/integration.md). */
const LINKS_CATALOG = {
	tile: true,
	events: LINK_EVENTS,
	params: {
		by: LINK_BY,
		slug: "one link; with by: place, its placements",
		withRevenue: "adds revenue and revenue_currency in params.currency",
		currency: "ISO 4217 code of the revenue columns"
	},
	metrics: {
		impressions: "Link keys of view events (s0 to s9, each <slug> or <slug>@<place>).",
		clicks: "Click events of the key.",
		ctr: "clicks / impressions from the sums; 0 without impressions.",
		sessions: "Distinct sessions with a click.",
		conversions: "Sale events of the key, every currency.",
		revenue: "Sum of sale values in the selected currency only (withRevenue)."
	},
	rule: "A range starting before the raw window reads the daily link summaries (notices summary and detail_from:<day>), as does a range over the scan budget (see summaries): by link (all links, one link, or one filter on channel, country or device) and by place; other breakdowns answer raw_only before the window and other filters are named in filter_unavailable:<dim>:<reason>. Each day keeps its top 200 links and places, the rest is (other). A key without a placement counts under (none); a hit without a counted session is (not set) in the session dims. Money of two currencies is never added; data.currencies lists every currency of the sale events."
};
/** Catalog of the SEO views and the impact view: parameters, the period rule and the fixed texts. */
const SEO_CATALOG = {
	maxRangeDays: 93,
	coverage: SEO_TEXT.coverage,
	bingNoPairs: SEO_TEXT.bingNoPairs,
	periodRule: "n = min(to - from + 1, 93); the current period ends at the newest final (not provisional) day of the selected sources, or yesterday for traffic views; the previous and oldest periods are the n days before, back to back. The response carries periods and the notice provisional_excluded when the end moved.",
	bands: [
		"1-3",
		"4-10",
		"11-20",
		"21-50",
		"51+"
	],
	reports: {
		search_cannibalization: {
			params: [
				"source",
				"minImpressions",
				"minShare",
				"includeBrand"
			],
			compare: false
		},
		search_cannibalization_pages: {
			params: [
				"source",
				"minImpressions",
				"minShare",
				"includeBrand"
			],
			compare: false
		},
		search_cannibalization_page: {
			params: [
				"page",
				"source",
				"minImpressions",
				"minShare",
				"includeBrand"
			],
			compare: false
		},
		search_cannibalization_query: {
			params: ["query", "source"],
			compare: false
		},
		search_position_bands: { params: ["source", "dim"] },
		search_position_bands_series: { params: [
			"source",
			"dim",
			"metric"
		] },
		search_position_moves: {
			params: [
				"source",
				"dim",
				"minImpressions",
				"list"
			],
			periods: 2
		},
		search_striking_distance: {
			params: [
				"source",
				"minImpressions",
				"includeBrand"
			],
			estimates: ["potential_clicks"]
		},
		search_movers: {
			params: [
				"source",
				"dim",
				"direction",
				"metric",
				"minImpressions"
			],
			periods: 2
		},
		search_decay: {
			params: ["source", "minImpressions"],
			periods: 3
		},
		traffic_movers: {
			params: ["direction", "minImpressions"],
			periods: 2
		},
		traffic_decay: {
			params: ["minImpressions"],
			periods: 3
		}
	},
	estimates: { potential_clicks: {
		estimate: true,
		note: SEO_TEXT.striking
	} },
	impact: {
		params: [
			"annotation",
			"kind",
			"at",
			"window",
			"report",
			"metric",
			"key",
			"goal",
			"scope",
			"path",
			"source",
			"prop",
			"dim",
			"context"
		],
		windows: IMPACT_WINDOWS,
		metrics: IMPACT_METRICS,
		periodRule: "The annotation day D is in neither window. after = [D + 1, min(D + window, last complete day)], before = the same number of days ending at D - 1; the last complete day is yesterday, and for search targets also the newest final search day. complete is false while the after window is shorter than window.",
		caution: SEO_TEXT.caution
	},
	annotationImpacts: {
		params: [
			"window",
			"kind",
			"scopeKind",
			"q",
			"withSearch"
		],
		maxRows: 50,
		maxRowsSmallProfile: 10,
		rule: "One row per annotation of the range, newest first (limit, offset; total counts every match), each measured on its target (or visitors of its scope, Search clicks for a query scope with withSearch) over equal windows as in impact, with verdict up, down, flat, too_early or no_data, good (true when the change is good news; a fall is good for lower-is-better metrics) and overlaps (annotations of an overlapping scope inside the windows). kind and scopeKind filter; q keeps annotations whose title, kind, scope or source slug contains the text (case-insensitive, at most 100 characters). withSearch measures Search targets and needs read:search. Reads only."
	}
};
/** Metrics computed from passive browser signals; everything else is a count or a ratio of counts. */
const ESTIMATES = /* @__PURE__ */ new Set([
	"pogo_stick_rate",
	"returned_from_search_rate",
	"search_reentry_rate",
	"back_nav_rate",
	"potential_clicks"
]);
/** Catalog entries: definition, the estimate flag and, for estimates, the fixed caveat text. */
const catalogMetrics = () => Object.fromEntries(Object.entries(METRICS).map(([k, definition]) => [k, ESTIMATES.has(k) ? {
	definition,
	estimate: true,
	caveat: k === "potential_clicks" ? SEO_TEXT.striking : SATISFACTION_CAVEAT
} : {
	definition,
	estimate: false
}]));
/** The catalog document: `agent/v1/reports`, the admin route `data/catalog` and the MCP tool `analytics_catalog` serve it. */
function buildCatalog() {
	return {
		reports: REPORT_NAMES.map((name) => ({
			name,
			kind: REPORTS[name][0],
			scopes: requiredScopes({ report: name })
		})),
		dimensions: {
			traffic: [...Object.keys(TRAFFIC_DIMS), ...REVENUE_DIMS],
			search: Object.keys(SEARCH_DIMS)
		},
		ops: [...OPS, ...NUM_OPS],
		params: Object.keys(ParamsSchema.shape),
		metrics: catalogMetrics(),
		seo: SEO_CATALOG,
		revenue: REVENUE_CATALOG,
		behaviour: BEHAVIOUR_CATALOG,
		content: CONTENT_CATALOG,
		links: LINKS_CATALOG,
		satisfaction: SATISFACTION_CATALOG,
		summaries: SUMMARY_CATALOG,
		scopes: SCOPE_LABELS,
		limits: {
			maxRangeDays: 400,
			maxRows: MAX_LIMIT,
			maxFilters: 20
		},
		dashboards: {
			kinds: TILE_KIND_NAMES,
			tileKinds: TILE_KINDS,
			tileMetrics: TILE_METRICS,
			tileParams: TILE_PARAMS,
			ranges: PRESETS.map((p) => p[0]),
			limits: {
				dashboardsPerSite: 20,
				tiles: 12,
				recordBytes: MAX_RECORD_BYTES,
				tileFilters: 5,
				defaultFilters: 10,
				tileRows: [5, 25],
				widths: [
					1,
					2,
					3
				]
			}
		}
	};
}
// src/routes/data.ts
/** Private admin routes `data/query` and `data/export`: one report per call, `plugins:read`. */
/** `sitesDb` of a cross-site read when sites live in several databases. */
function sitesDbOf(env, kv) {
	const sitesDb = routedSitesDb((site) => env.db(site), kv);
	return sitesDb ? { sitesDb } : {};
}
/** The last stored summary day for the report context (absent before the first closed day). */
async function watermark(kv) {
	const w = await kv.get(KV_WATERMARK);
	return w ? { summaryThrough: w } : {};
}
const DataQueryBody = z.object({
	report: z.enum(REPORT_NAMES),
	query: QuerySchema,
	params: ParamsSchema.optional(),
	limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
	offset: z.number().int().min(0).max(1e5).optional(),
	withAnnotations: z.boolean().optional()
}).strict();
const DataExportBody = z.object({
	report: z.enum(REPORT_NAMES),
	query: QuerySchema,
	params: ParamsSchema.optional(),
	format: z.enum(["csv", "json"]),
	limit: z.number().int().min(1).max(EXPORT_LIMIT).optional()
}).strict();
const MAX_PAGES = 5;
/** Up to five pages of 100. `info.truncated` reports whether more items exist. */
async function loadAll(coll, where, opts = {}) {
	if (!coll) return [];
	const out = [];
	let cursor;
	for (let i = 0; i < MAX_PAGES; i++) {
		const page = await coll.query({
			where,
			limit: 100,
			...opts.orderBy ? { orderBy: opts.orderBy } : {},
			...cursor ? { cursor } : {}
		});
		out.push(...page.items);
		if (opts.info) opts.info.truncated = page.hasMore && i === 4;
		if (!page.hasMore || !page.cursor) break;
		cursor = page.cursor;
	}
	return out;
}
/** The site's annotations of a day range, newest 500 first, normalized. */
async function loadAnnotations(coll, site, from, to, tz) {
	const info = {};
	const ts = {
		gte: zonedToEpoch(from, 0, tz),
		lt: zonedToEpoch(addDays(to, 1), 0, tz)
	};
	const items = [];
	for (const it of await loadAll(coll, {
		site,
		ts
	}, {
		orderBy: { ts: "desc" },
		info
	})) {
		const a = normalizeAnnotation(it.data, it.id);
		if (a) items.push(a);
	}
	return {
		items,
		truncated: !!info.truncated
	};
}
const SiteItem = z.object({ site: z.string() }).passthrough();
const FunnelItem$1 = z.object({
	name: z.string().max(64),
	steps: FunnelStepsSchema,
	mode: z.enum(FUNNEL_MODES).optional()
});
const SegmentItem$1 = z.object({
	site: z.string(),
	name: z.string().optional(),
	filters: z.array(FilterSchema).max(20)
});
/** A segment of the site by id, or `unknown_segment`. */
async function loadSegment(ctx, id, site) {
	const seg = SegmentItem$1.safeParse(await ctx.storage.segments?.get(id));
	if (!seg.success || seg.data.site !== site) throw new PluginRouteError("unknown_segment", "Unknown segment.", 400);
	return {
		ref: {
			id,
			name: seg.data.name ?? id
		},
		filters: seg.data.filters
	};
}
/** Valid goals of the site from the `goals` collection. */
async function loadGoals(coll, site) {
	const goals = [];
	for (const it of await loadAll(coll, { site })) {
		const g = GoalSchema.safeParse(it.data);
		if (g.success && SiteItem.safeParse(it.data).data?.site === site) goals.push(g.data);
	}
	return goals;
}
/** Goal names by record id of the site (a goal target of an annotation names its goal by id). */
async function goalNames$1(coll, site) {
	const out = /* @__PURE__ */ new Map();
	for (const it of await loadAll(coll, { site })) {
		const g = GoalSchema.safeParse(it.data);
		if (g.success) out.set(it.id, g.data.name);
	}
	return out;
}
function routeError(err) {
	if (err instanceof QueryError) throw new PluginRouteError(err.code, err.message, 400);
	throw err;
}
/** Reports that embed their matching annotations. */
const SERIES_REPORTS = /* @__PURE__ */ new Set([
	"timeseries",
	"satisfaction_series",
	"search_overview",
	"revenue_series"
]);
/**
* Resolve segment, goals, funnels, annotations and the raw window, then run the report. Shared with the
* agent API. `preloaded` replaces the annotation read and keeps goals and the raw window state for a dashboard run.
*/
async function answer(env, ctx, body, preloaded) {
	const s = await env.settings();
	const bound = await bindSite(body.query.site, s.siteId, ctx.storage.sites);
	const site = bound.id;
	const once = (key, load) => {
		if (!preloaded) return load();
		let p = preloaded.memo.get(key);
		if (!p) preloaded.memo.set(key, p = load());
		return p;
	};
	let filters = body.query.filters;
	const segA = body.query.segment ? await loadSegment(ctx, body.query.segment, site) : void 0;
	if (segA) filters = [...segA.filters, ...filters];
	const segB = body.query.compare === "segment" && body.query.compareSegment ? await loadSegment(ctx, body.query.compareSegment, site) : void 0;
	const goals = await once(`goals:${site}`, () => loadGoals(ctx.storage.goals, site));
	const funnels = {};
	if (body.report === "funnels" && body.params?.funnel) {
		const raw = await ctx.storage.funnels?.get(body.params.funnel);
		const f = FunnelItem$1.safeParse(raw);
		if (f.success && SiteItem.safeParse(raw).data?.site === site) funnels[body.params.funnel] = f.data;
	}
	let annotations = [];
	let meta;
	if (body.withAnnotations || SERIES_REPORTS.has(body.report)) {
		const { from, to } = body.query;
		const tz = s.siteTimezone;
		const loaded = preloaded?.annotations ?? await loadAnnotations(ctx.storage.annotations, site, from, to, tz);
		const target = REPORTS[body.report][0];
		annotations = matchAnnotations(loaded.items, {
			site,
			from,
			to,
			tz,
			target,
			filters
		}).map((a) => annotationView(a, tz));
		meta = { annotations: {
			matched: annotations.length,
			loaded: loaded.items.length,
			truncated: loaded.truncated
		} };
	}
	const now = env.now?.() ?? Math.floor(Date.now() / 1e3);
	const kv = ctx.kv;
	const rc = {
		db: await env.db(site),
		site,
		settings: s,
		now,
		goals,
		funnels,
		annotations,
		defaultCurrency: siteSetting(s, bound.client, "defaultCurrency"),
		...kv ? await once(`state:${site}`, async () => ({
			rawFrom: await rawFromDay(stateKv(kv, site), s, now),
			...await watermark(stateKv(kv, site))
		})) : {},
		...body.report === "search_page_queries" ? bingDrawer(ctx, s, bound.client?.bingSiteUrl ?? s.bingSiteUrl) : {},
		...body.report === "search_cannibalization_query" ? bingQueryDrawer(ctx, s, bound.client?.bingSiteUrl ?? s.bingSiteUrl) : {},
		...body.report === "site_search" ? {
			siteSearchParams: siteSetting(s, bound.client, "siteSearchParams"),
			publicSurface: !!ctx.publicSurface
		} : {},
		...body.report === "collections" ? { collections: bound.client ? null : await loadCollections(ctx.schema) } : {},
		...body.report === "impact" || body.report === "annotation_impacts" ? { annotationStore: annotationStore(ctx.storage.annotations, site, s.siteTimezone, now) } : {},
		...body.report === "annotation_impacts" ? { goalNames: await goalNames$1(ctx.storage.goals, site) } : {},
		...body.report === "sites_summary" ? {
			sites: await summarySites(ctx, s.siteId, body.allowedSites),
			...sitesDbOf(env, ctx.kv)
		} : {}
	};
	let params = body.params;
	if (body.report === "impact" && params?.goal) {
		const raw = await ctx.storage.goals?.get(params.goal);
		const g = GoalSchema.safeParse(raw);
		if (g.success && SiteItem.safeParse(raw).data?.site === site) params = {
			...params,
			goal: g.data.name
		};
	}
	let result;
	try {
		result = await runReport(rc, {
			report: body.report,
			query: {
				...body.query,
				filters
			},
			...params ? { params } : {},
			...segB ? {
				compareFilters: [...segB.filters, ...body.query.filters],
				compareSegment: segB.ref
			} : {},
			...body.limit !== void 0 ? { limit: body.limit } : {},
			...body.offset !== void 0 ? { offset: body.offset } : {}
		});
	} catch (err) {
		routeError(err);
	}
	if (segB && segA) result = {
		...result,
		segment: segA.ref
	};
	if (!meta) return result;
	return {
		...result,
		...body.withAnnotations && !SERIES_REPORTS.has(body.report) ? { data: {
			...result.data,
			annotations
		} } : {},
		meta
	};
}
/** The sites of this database (local and client, never remote) a `sites_summary` lists. */
async function summarySites(ctx, siteId, allowed) {
	const all = [siteId, ...(await registry(ctx.storage.sites)).sites.map((c) => c.id)];
	return allowed?.length ? all.filter((id) => allowed.includes(id)) : all;
}
/** The Bing lookup of the per-page drawer: page URLs are the Bing site URL's origin plus the page key. */
function bingDrawer(ctx, s, siteUrl) {
	const { http, kv } = ctx;
	if (!http || !kv || !bingConfigured(s) || !siteUrl) return {};
	const origin = propertyOrigin(siteUrl);
	return { bingPageQueries: (page) => pageQueries({
		http,
		kv,
		settings: s
	}, siteUrl, origin + page) };
}
/** The Bing lookup of the query drill-down: page URLs map to page keys of the Bing site URL's host. */
function bingQueryDrawer(ctx, s, siteUrl) {
	const { http, kv } = ctx;
	if (!http || !kv || !bingConfigured(s) || !siteUrl) return {};
	const key = pageKeyFor(propertyOrigin(siteUrl));
	return { bingQueryPages: async (query) => (await queryPages({
		http,
		kv,
		settings: s
	}, siteUrl, query)).flatMap((r) => {
		const page = key(r.url);
		return page === null ? [] : [{
			page,
			day: r.day,
			clicks: r.clicks,
			impressions: r.impressions,
			pos_sum: r.pos_sum
		}];
	}) };
}
/** Annotation lookups of `impact`: one record by id, the newest (of one kind), or a day range. */
function annotationStore(coll, site, tz, now = Math.floor(Date.now() / 1e3)) {
	return {
		async resolve(ref, kind) {
			if (ref !== "latest") {
				const a = normalizeAnnotation(await coll?.get(ref), ref);
				return a && a.site === site ? a : null;
			}
			let best = null;
			for (const it of await loadAll(coll, { site }, { orderBy: { ts: "desc" } })) {
				const a = normalizeAnnotation(it.data, it.id);
				if (a && a.ts <= now && (!kind || a.kind === kind) && (!best || a.ts > best.ts)) best = a;
			}
			return best;
		},
		inRange: async (from, to) => (await loadAnnotations(coll, site, from, to, tz)).items
	};
}
/**
* The satellite a body names, or null: a configured remote id that is neither the local `siteId` nor a client
* site of the registry (this database wins on a collision).
*/
async function remoteOf(env, ctx, site) {
	if (!site || !env.remote?.find(site)) return null;
	if (site === (await env.settings()).siteId || (await registry(ctx.storage.sites)).byId.has(site)) return null;
	return site;
}
/** Forward the body to the satellite's `agent/v1/query`; failures are a typed `remote_error` without the remote body. */
async function proxied(remote, ctx, site, body) {
	const r = await remote.query(ctx.http, site, body.limit && body.limit > 1e3 ? {
		...body,
		limit: MAX_LIMIT
	} : body);
	if (r.ok) return r.data;
	const text = r.reason === "key_missing" ? "The key of this connected site is not set on this install (key_missing)." : `The connected site did not answer (${r.reason}${r.status ? ` ${r.status}` : ""}).`;
	throw new PluginRouteError("remote_error", text, 502, {
		status: r.status,
		reason: r.reason
	});
}
/** `answer`, or the satellite's answer when `query.site` names a remote satellite. */
async function answerAny(env, ctx, body) {
	const site = await remoteOf(env, ctx, body.query.site);
	return site && env.remote ? proxied(env.remote, ctx, site, body) : answer(env, ctx, body);
}
function dataQueryRoute(env) {
	return {
		permission: "plugins:read",
		input: DataQueryBody,
		handler: (ctx) => answerAny(env, ctx, DataQueryBody.parse(ctx.input))
	};
}
/** The same report as a file download: CSV or JSON rows, up to 10 000. */
function dataExportRoute(env) {
	return {
		permission: "plugins:read",
		response: "raw",
		input: DataExportBody,
		async handler(ctx) {
			const body = DataExportBody.parse(ctx.input);
			const { format: _f, ...req } = body;
			const out = exportBody(await answerAny(env, ctx, {
				...req,
				limit: body.limit ?? 1e4
			}), body.format);
			return pluginResponse({
				status: 200,
				headers: {
					"content-type": out.contentType,
					"content-disposition": `attachment; filename="${out.filename}"`
				},
				body: {
					kind: "text",
					value: out.body
				}
			});
		}
	};
}
const CatalogBody = z.object({}).strict();
/** `data/catalog`: the agent catalog (`agent/v1/reports`) for host users and the MCP tool `analytics_catalog`. */
function dataCatalogRoute() {
	return {
		permission: "plugins:read",
		input: CatalogBody,
		handler: async (ctx) => (CatalogBody.parse(ctx.input ?? {}), buildCatalog())
	};
}
// src/routes/env.ts
/** 204 with no body. The host adds `Cache-Control: private, no-store` to non-GET plugin responses. */
const noContent = () => pluginResponse({
	status: 204,
	headers: { "content-type": "text/plain" }
});
const json$1 = (data) => pluginResponse({
	status: 200,
	headers: { "content-type": "application/json; charset=utf-8" },
	body: {
		kind: "text",
		value: JSON.stringify(data)
	}
});
// src/routes/in.ts
/** Body parser, an object so tests can spy on it (bots must never reach it). */
const ingestParser = { parse(text) {
	if (typeof text !== "string") return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
} };
/**
* Origin rule. Without `k`: no `Origin` (server to server) or the request's own origin, local site.
* With `k`: the key's site, an `https` `Origin` on one of its hosts (never the master's own origin), not
* paused; `host` is the `Origin` hostname. A linked site's events belong to the local site, host kept.
*/
function resolveOrigin(request, body, byKey) {
	const origin = request.headers.get("origin");
	const own = new URL(request.url);
	if (!body.k) return origin && origin !== own.origin ? { drop: "origin_rejected" } : {
		site: null,
		host: own.hostname || null
	};
	const site = byKey.get(body.k);
	if (!site) return { drop: "unknown_key" };
	const host = origin?.startsWith("https://") ? hostnameOf(origin) : null;
	if (!host || origin === own.origin || !site.hosts.includes(host)) return { drop: "origin_rejected" };
	if (site.paused) return { drop: "site_paused" };
	return site.linked ? {
		site: null,
		host,
		linked: true
	} : {
		site,
		host
	};
}
/** A D1 overload error ("D1 DB is overloaded. ..."): worth one more try after a short pause. */
const isOverload = (err) => /\boverloaded\b/i.test(String(err?.message ?? err));
/** State key of the last background run stopped by a platform limit (`PlatformLimit`); the Data page reads it. */
const KV_PLATFORM_LIMIT = "platform_limit_hit";
const platformLimitKind = (err) => {
	const m = String(err?.message ?? err);
	return /too many (subrequests|api requests)/i.test(m) ? "requests" : isOverload(err) ? "overload" : null;
};
/** The drop reason of a failed write: D1's "exceeded D1's free tier daily row ... limit" is `daily_limit`. */
const failReason = (err) => isOverload(err) ? "overload" : /free tier daily row/i.test(String(err?.message ?? err)) ? "daily_limit" : "write_error";
/** One jittered retry of a write that failed with an overload error; replays are no-ops (keyed entries). */
function retryOnce(sink, pauseMs = () => 50 + Math.random() * 150) {
	return { async ingest(msg) {
		try {
			return await sink.ingest(msg);
		} catch (err) {
			if (!isOverload(err)) throw err;
			await new Promise((r) => setTimeout(r, pauseMs()));
			return sink.ingest(msg);
		}
	} };
}
/** 503 with `Retry-After`: the event was not stored and the client sends it again. */
const unavailable = () => pluginResponse({
	status: 503,
	headers: {
		"content-type": "text/plain",
		"retry-after": String(5)
	}
});
/** 503 without `Retry-After`: the day's write allowance is used up and the client stops sending this event. */
const blocked = () => pluginResponse({
	status: 503,
	headers: { "content-type": "text/plain" }
});
/**
* Public ingest route. 204 for bots (after the UA check alone), invalid bodies and dropped events.
* Page views and events are written before the response: 204 once stored, 503 with `Retry-After` when the
* write fails (counted as `overload` or `write_error`), so the page script retries; 503 without it while the
* `small` profile's daily writes are blocked (`budget_blocked`) or Hyperdrive query caching is on (a permanent
* condition, counted as `write_error`), so it does not. Engagement updates are
* written after the response (a beacon cannot retry; the next update carries the same totals). Every request
* that is not stored is counted in `drops` (bots as `bot`, nothing else of them), flushed in an `after()`.
*/
function inRoute(env) {
	return {
		public: true,
		methods: ["POST"],
		request: {
			body: "text",
			maxBytes: 8192
		},
		response: "raw",
		async handler(ctx) {
			try {
				return await pgStatementLimit(INGEST_STATEMENT_MS, () => handle(ctx));
			} catch {
				return unavailable();
			}
		}
	};
	async function handle(ctx) {
		const deps = await env.deps(ctx);
		try {
			return await decide(ctx, deps);
		} catch {
			drops.add(deps.settings.siteId, dayInZone(deps.now ?? Math.floor(Date.now() / 1e3), deps.settings.siteTimezone), "write_error");
			return unavailable();
		} finally {
			if (drops.size) env.after(() => drops.settle(deps.db));
		}
	}
	async function decide(ctx, deps) {
		const day = dayInZone(deps.now ?? Math.floor(Date.now() / 1e3), deps.settings.siteTimezone);
		const count = (reason, site = deps.settings.siteId) => {
			drops.add(site, day, reason);
			return noContent();
		};
		if (classifyUa(ctx.request.headers.get("user-agent"), deps.agentRules).audience === "robot") return count("bot");
		const body = validateIngest(ingestParser.parse(ctx.input), deps.settings.maxEngagedMsPerPage);
		if (!body) return count("invalid");
		const reg = await registry(ctx.storage?.sites);
		const res = resolveOrigin(ctx.request, body, reg.byKey);
		if ("drop" in res) return count(res.drop);
		const info = {
			...requestInfo(ctx.request, ctx.requestMeta ? ctx.requestMeta.ip : void 0),
			host: res.host,
			hasOrigin: ctx.request.headers.has("origin")
		};
		const linked = linkedHosts(reg.linked);
		let d = deps;
		if (res.site) {
			const channelRules = await env.channelRules?.(ctx, res.site.id);
			d = {
				...deps,
				site: res.site.id,
				client: res.site,
				...channelRules ? { channelRules } : {}
			};
		} else {
			const s = deps.settings;
			if (linked.length) {
				const own = [hostnameOf(ctx.request.url), hostnameOf(s.siteOrigin)].filter((h) => !!h);
				d = {
					...deps,
					settings: {
						...s,
						ignoreReferrerHosts: [.../* @__PURE__ */ new Set([
							...s.ignoreReferrerHosts,
							...linked,
							...own
						])]
					}
				};
			}
			if (res.linked && res.host) d = {
				...d,
				linkedHost: res.host
			};
		}
		if (body.t === "en") {
			env.after(async () => {
				try {
					await recordClientEvent(d, body, info);
				} catch (err) {
					count(failReason(err), d.site);
				}
				await drops.settle(d.db);
			});
			return noContent();
		}
		try {
			const out = await recordClientEvent({
				...d,
				sink: retryOnce(sinkOf(d))
			}, body, info);
			const known = res.host && (linked.includes(res.host) || res.host === hostnameOf(deps.settings.siteOrigin));
			const stamp = out === "ok" && !res.site && known && linked.length ? markHostSeen(ctx.kv, res.host) : null;
			if (stamp) env.after(stamp);
			return out === "budget_blocked" ? blocked() : noContent();
		} catch (err) {
			count(failReason(err), d.site);
			return String(err?.message).includes("Hyperdrive query caching is on; recreate the configuration with --caching-disabled") ? blocked() : unavailable();
		}
	}
}
// src/routes/privacy.ts
const STATEMENT = "No cookies, no device storage unless a visitor opts out, no raw IP, no raw user agent.";
/** Fixed receipt line for the satisfaction measures. */
const SATISFACTION_LINE = "Per page view we keep how long the page was visible and active, how far it was scrolled, how it was reached (new, reload, back or forward) and how it was left (hidden, closed, or kept for back and forward). Per session we count repeat arrivals from a search engine. The script never reads or changes your browser history.";
/** Fixed receipt line for shared dashboard links. */
const SHARING_LINE = "Shared views show aggregated numbers only, the same as the admin pages: no visitor identifiers, no raw rows. Opening a shared view is not counted as a visit to any site. Per shared link we store how many times it was opened and when it was last opened.";
/** Fixed receipt line for revenue on events. */
const REVENUE_LINE = "Order values and currency codes sent with events. We do not store order ids (they only decide whether an order was already counted), buyer names, emails or payment data.";
/** Fixed receipt line for session tokens kept by the site's own server. */
const ORDER_SESSION_LINE = "If your own server keeps the session token next to an order, that links the order to the pages of that session in your own records. This plugin stores no order id and no buyer data.";
/** Fixed receipt line for the internal site search report. */
const SITE_SEARCH_LINE = "If a site search parameter is configured, the words searched for are kept, with emails and long numbers removed.";
/** Fixed line of the copyable block: the legal basis of counting visits and the right to object. */
const LEGAL_BASIS_LINE = "Visits are counted on the basis of our legitimate interest in knowing how this site is used (Article 6(1)(f) GDPR). You can object at any time.";
/** Fixed receipt line for scheduled dashboard email. */
const EMAIL_LINE = "If you schedule an email, the recipients you enter are kept with the dashboard.";
/** Fixed receipt line under the drop counters. */
const DROPS_LINE = "Counted in memory per server instance and written every few seconds, so the figures are a lower bound. Nothing about these requests is kept: no address, no browser string, no row per request. Bots are counted under bot and never stored.";
/** Plain-language table list (`kind` avoids the forbidden public words). Keep in step with `src/db/schema.ts` and the storage collections. */
const TABLES = [
	{
		name: "ca_sessions",
		kind: "table",
		retention: "raw",
		description: "One row per visit: a run of page views by one visitor key with gaps under the session window.",
		columns: {
			"site, sid": "Site id and a random session id made in the browser tab; not linked to a person.",
			vkey: "Daily visitor key: a hash of a shortened IP address and the browser family with a salt that is deleted after two days.",
			"day, hour, started, last_seen, window_s": "Local day and hour, start and last activity time, session window.",
			"entry_path, exit_path, pageviews, events, engaged_ms, max_scroll, interacted": "First and last page, counts, active time and scroll depth.",
			visible_ms: "Total time the visit's pages were visible on screen, in milliseconds.",
			reentries: "How many times a later arrival from a search engine joined this visit.",
			"ref_host, ref_path, channel, source, utm_*": "Where the visit came from: referring site and campaign tags of the first page.",
			"country, region, device, browser, browser_major, os, lang, screen, host": "Country (and region when enabled) from the edge, device class, browser and OS family, language, screen size class (only with captureScreen), site host name.",
			hits: "The visit's page views and events: path with allowed campaign parameters, time since the visit started, how the page was reached and left, active and visible time, scroll depth, event names and properties."
		}
	},
	{
		name: "ca_events",
		kind: "table",
		retention: "raw",
		description: `Orders and events reported by the site's server, one row each, with the visit they belong to when known. ${REVENUE_LINE}`
	},
	{
		name: "ca_srv",
		kind: "table",
		retention: "raw",
		description: "Error pages seen by the server: a count per day, status, path and referring page, and the time of the last one."
	},
	{
		name: "ca_drops",
		kind: "table",
		retention: "raw",
		description: "Counts of requests not recorded, per day and reason."
	},
	{
		name: "ca_cube",
		kind: "table",
		retention: "rollup",
		description: "Daily totals per channel, country and device, kept after raw rows are deleted. No visitor keys."
	},
	{
		name: "ca_rollup",
		kind: "table",
		retention: "rollup",
		description: "Daily totals per report dimension (top values only), kept after raw rows are deleted. No visitor keys."
	},
	{
		name: "ca_revenue_daily",
		kind: "table",
		retention: "rollup",
		description: `Daily order counts and order values per currency and report dimension (top values only), kept after raw rows are deleted. ${REVENUE_LINE}`
	},
	{
		name: "ca_aliases",
		kind: "table",
		retention: "aliases",
		description: "Short-lived links from a second tab's session id to the visit it joined."
	},
	{
		name: "ca_search_daily",
		kind: "table",
		retention: "search",
		description: "Daily clicks, impressions and positions from connected search providers per page, query, country and device. No visitor data."
	},
	{
		name: "goals",
		kind: "storage",
		retention: "config",
		description: "Goal definitions."
	},
	{
		name: "funnels",
		kind: "storage",
		retention: "config",
		description: "Funnel definitions."
	},
	{
		name: "segments",
		kind: "storage",
		retention: "config",
		description: "Saved filter sets."
	},
	{
		name: "channel_rules",
		kind: "storage",
		retention: "config",
		description: "Custom channel rules."
	},
	{
		name: "agent_rules",
		kind: "storage",
		retention: "config",
		description: "Custom user agent rules for exclusion."
	},
	{
		name: "annotations",
		kind: "storage",
		retention: "config",
		description: "Chart notes, written by hand or on content publish and update."
	},
	{
		name: "api_keys",
		kind: "storage",
		retention: "config",
		description: "API keys for agents and connected sites: label, scopes and a hash of the secret; the secret itself is never stored."
	},
	{
		name: "sites",
		kind: "storage",
		retention: "config",
		description: "Other sites that send visits to this install: name, host names, a public site key and the search property mapping."
	},
	{
		name: "dashboards",
		kind: "storage",
		retention: "config",
		description: `Saved dashboard layouts: name, tiles with report, chart type and filters, default range. No visitor data. ${EMAIL_LINE}`
	},
	{
		name: "shares",
		kind: "storage",
		retention: "config",
		description: "Shared dashboard links: a hash of the link, an optional password verifier, an expiry and how often and when the link was last opened. Never the link or the password."
	},
	{
		name: "salt:<day>",
		kind: "kv",
		retention: "salts",
		description: "Random daily salt for visitor keys."
	},
	{
		name: "budget:writes",
		kind: "kv",
		retention: "budget",
		description: "With the small capacity profile only: the estimate of today's database writes, from today's page view count."
	},
	{
		name: "cron:owed",
		kind: "kv",
		retention: "budget",
		description: "Background tasks waiting for their turn when the Cron Trigger runs several in one invocation, with the time each started waiting."
	},
	{
		name: "platform_limit_hit",
		kind: "kv",
		retention: "budget",
		description: "Time, task and kind of the last background run stopped by a platform request limit or an overloaded database; no visitor data."
	}
];
const ReceiptBody = z.object({ site: SiteField }).strict().optional();
/** Shown with a client site's receipt. */
const PER_DATABASE_NOTE = "Retention settings apply to every site measured by this install; they cannot differ per site.";
/** Requests not recorded per reason over the `days` days up to `today` (site time zone), from `ca_drops`. */
async function dropCounts(db, site, today, days) {
	const f = q(db.dialect)`SELECT reason, SUM(n) AS n FROM ca_drops WHERE site = ${site} AND day > ${dayInt(addDays(today, -days))} GROUP BY reason ORDER BY reason`;
	const rows = await db.all(f.sql, f.params);
	return Object.fromEntries(rows.map((r) => [r.reason, Number(r.n)]));
}
async function buildReceipt(db, kv, s, now, bound = {
	id: s.siteId,
	kind: "local"
}) {
	const dkv = stateKv(kv, bound.id);
	const rawDays = await effectiveRawDays(dkv, s);
	const cursor = await dkv.get(KV_CURSOR);
	const retention = {
		raw: `${rawDays} days`,
		rollup: `${s.rollupRetentionMonths} months`,
		aliases: "one day after they are written",
		search: `${s.searchRetentionDays} days`,
		config: "until deleted in the admin",
		salts: `2 days`,
		budget: "until the next UTC day"
	};
	const rows = {};
	for (const t of TABLES.filter((x) => x.kind === "table")) {
		const [r] = await db.all(`SELECT COUNT(*) AS n FROM ${t.name} WHERE site = ?`, [bound.id]);
		rows[t.name] = Number(r?.n ?? 0);
	}
	const drops = await dropCounts(db, bound.id, dayInZone(now, s.siteTimezone), rawDays);
	const budget = s.capacityProfile === "small" ? await dkv.get(KV_WRITE_BUDGET) : null;
	const current = saltDay(now, s.saltTimezone, s.saltRotationHour);
	const salt = {
		day: current,
		ageSeconds: now - saltBoundary(now, s.saltTimezone, s.saltRotationHour),
		nextRotation: zonedToEpoch(addDays(current, 1), s.saltRotationHour, s.saltTimezone),
		stored: (await kv.list("salt:")).map((e) => e.key.slice(5)).sort()
	};
	const tables = TABLES.map((t) => ({
		...t,
		retention: retention[t.retention],
		...t.name in rows ? { rows: rows[t.name] } : {}
	}));
	return {
		site: {
			id: bound.id,
			kind: bound.kind
		},
		...bound.kind === "client" ? { note: PER_DATABASE_NOTE } : {},
		statement: STATEMENT,
		satisfaction: SATISFACTION_LINE,
		sharing: SHARING_LINE,
		revenue: REVENUE_LINE,
		orderSession: ORDER_SESSION_LINE,
		siteSearch: SITE_SEARCH_LINE,
		email: EMAIL_LINE,
		tables,
		retention: {
			rawDays,
			rawCapped: !!cursor?.capped,
			storage: cursor?.storage ?? null,
			rollupWatermark: await dkv.get(KV_WATERMARK),
			...retention
		},
		salt,
		drops: {
			days: rawDays,
			byReason: drops,
			note: DROPS_LINE
		},
		writes: budget && budget.day === dayInZone(now, "UTC") ? {
			blocked: budget.blocked,
			rows: budget.rows,
			limit: budget.limit
		} : null,
		markdown: receiptMarkdown(s, rawDays)
	};
}
/** Copyable block for the site's privacy page. Plain words only: it is pasted into public pages. */
function receiptMarkdown(s, rawDays) {
	return [
		"## Visitor measurement on this site",
		"",
		`${STATEMENT} This site counts visits with a cookieless, self-hosted tool that runs on its own server.`,
		"",
		"- Nothing is stored on your device unless you choose to stop being counted, and then only that choice. A visit is recognised by a random id that lives only in the open page.",
		"- Visits are counted per day with a key made from a shortened IP address and the browser family, mixed with a random salt that is deleted after two days. The key cannot be turned back into an IP address and cannot link visits across days.",
		`- Stored per visit: pages viewed, active and visible time per page, scroll depth, referring site, campaign tags, country, device class, browser and system family, language${s.captureScreen ? ", screen size class" : ""}.`,
		`- ${SATISFACTION_LINE}`,
		`- ${SHARING_LINE}`,
		`- ${REVENUE_LINE}`,
		`- ${ORDER_SESSION_LINE}`,
		`- ${SITE_SEARCH_LINE}`,
		`- Detailed visit records are deleted after ${rawDays} days; daily totals without visitor keys are kept for ${s.rollupRetentionMonths} months.`,
		`- ${LEGAL_BASIS_LINE}`,
		s.signals === "none" ? "- Browser privacy signals are not used." : `- Browsers that send ${s.signals === "gpc" ? "Global Privacy Control" : "Global Privacy Control or the DNT header"} are not counted.`,
		"- Known crawlers and automated clients are not counted.",
		""
	].join("\n");
}
/** The most a D1 database holds, in bytes: 10 GB, 500 MB on the Workers Free plan (`small`). */
const d1Cap = (s) => d1CapMb(s.capacityProfile) * 1e6;
/**
* The D1 binding of the EmDash database: EmDash does not tell plugins its binding name, so it is the one D1 binding
* of the Worker that no analytics database option names. Null when there is none or more than one.
*/
async function hostBinding(env) {
	const own = new Set(pluginFactsOrNull()?.targets().map((t) => t.binding) ?? []);
	const found = Object.entries(await env() ?? {}).filter(([name, b]) => !own.has(name) && isD1(b));
	return found.length === 1 ? found[0][1] : null;
}
/** Size of the EmDash database on D1: `size_after` of one statement on its raw binding (the Kysely path has no meta). */
async function hostSize(env) {
	const b = await hostBinding(env);
	return b ? fromD1(b).size?.() ?? null : null;
}
/**
* Live size of the database `db`: its own `size()` (own D1, Postgres), else for the EmDash database `hostSize`. Null
* where neither answers (another binding name, another host); the page then says "estimated". Never throws: a size
* is a display, not a check.
*/
async function liveSize(db, env = workerEnv) {
	try {
		return db.size ? await db.size() : isOwnDatabase(db) ? null : await hostSize(env);
	} catch {
		return null;
	}
}
/** MB of the EmDash database that are not analytics: the live size less the last estimate (null when either is unknown). */
function otherMb(size, analyticsBytes) {
	return size && analyticsBytes !== void 0 ? Math.max(0, Math.round((size.bytes - analyticsBytes) / 1e6)) : null;
}
/** `otherMb` of the EmDash database for the Settings page: its live size through its D1 binding and the default database's estimate. */
async function hostOtherMb(kv, env = workerEnv) {
	const size = await hostSize(env).catch(() => null);
	return size ? otherMb(size, (await kv.get(KV_CURSOR).catch(() => null))?.storage?.bytes) : null;
}
/** One timed `selfCheck`, then the query cache probe (once per isolate and binding). Never throws. */
async function healthOf(db, clock = Date.now) {
	const t0 = clock();
	const check = await selfCheck(db);
	const latencyMs = Math.max(0, Math.round(clock() - t0));
	if (!check.ok) return {
		engine: db.dialect,
		status: "unreachable",
		latencyMs,
		queryCache: null,
		error: redact(check.error)
	};
	if (latencyMs >= 1e3) return {
		engine: db.dialect,
		status: "slow",
		latencyMs,
		queryCache: null
	};
	const queryCache = await queryCacheOn(db).catch(() => null);
	return {
		engine: db.dialect,
		status: queryCache ? "caching_on" : "ok",
		latencyMs,
		queryCache
	};
}
/** The binding of `site`'s analytics tables (null: the CMS database). */
function bindingOf(site) {
	const facts = pluginFactsOrNull();
	return facts ? facts.binding(site) ?? facts.targets()[0]?.binding ?? null : null;
}
/** The one message of an unreachable database: engine, binding, the redacted error and the drops this instance counted meanwhile. */
function unreachableText(h, binding, pending) {
	return `The database self-check failed (${`${h.engine === "postgres" ? "Postgres" : "D1 or SQLite"}${binding ? `, binding ${binding}` : ""}`}, after ${h.latencyMs} ms): ${h.error ?? "no answer"}. Page views and events sent meanwhile are refused and counted as not recorded; the page script sends them again.${pending ? ` ${pending} such counts wait in this server instance until the database answers.` : ""}`;
}
/**
* The Data page's capacity panel: the profile, the database the site's analytics tables live in (null: the CMS
* database), its live size (`liveSize`) against the most a D1 database holds (`cap`, null on Postgres), the storage
* budget in MB with its warning level (`budgetWarning`), the drops of today and of the last 7 days, and the
* last background run stopped by a platform limit (`platformLimit`, null when none in the last 7 days).
* `analyticsBytes` is the last storage estimate, which turns the size into the rest of the EmDash database.
* `sizeWholeDatabase`: on Postgres the size is the whole database, other applications' tables included.
* `budget.contentCheck`: false when the EmDash database's size is unknown, so budget plus content is not checked.
*/
async function capacityOf(db, s, now, site, kv, opts = {}) {
	const health = opts.health ?? await healthOf(db);
	const today = dayInZone(now, s.siteTimezone);
	const dropsToday = await dropCounts(db, site, today, 1);
	const drops7 = await dropCounts(db, site, today, 7);
	const limit = await kv?.get("platform_limit_hit") ?? null;
	const size = await liveSize(db, opts.env);
	const target = budgetTargetOf(db);
	const other = target === "host" ? otherMb(size, opts.analyticsBytes) : null;
	return {
		profile: s.capacityProfile,
		rawRetentionDays: s.rawRetentionDays,
		database: bindingOf(site),
		health,
		size: size?.bytes ?? null,
		sizeWholeDatabase: db.dialect === "postgres",
		cap: db.dialect === "sqlite" ? d1Cap(s) : null,
		budget: {
			target,
			mb: budgetMb(s, target),
			level: budgetWarning(s, target, other ?? void 0),
			otherMb: other,
			contentCheck: target !== "host" || size !== null
		},
		dropsToday,
		drops7,
		platformLimit: limit && limit.at >= (now - 604800) * 1e3 ? limit : null,
		today
	};
}
function privacyRoute(env) {
	return {
		permission: "plugins:read",
		input: ReceiptBody,
		async handler(ctx) {
			const body = ReceiptBody.parse(ctx.input ?? void 0);
			const s = await env.settings();
			const bound = await bindSite(body?.site, s.siteId, ctx.storage?.sites);
			const db = await env.db(bound.id);
			const health = await healthOf(db, env.clock);
			if (health.status === "unreachable") {
				const pending = drops.rows().reduce((n, r) => n + (r.site === bound.id && (r.reason === "write_error" || r.reason === "overload") ? r.n : 0), 0);
				throw new PluginRouteError("db_unavailable", unreachableText(health, bindingOf(bound.id), pending), 503);
			}
			const now = env.now?.() ?? Math.floor(Date.now() / 1e3);
			const receipt = await buildReceipt(db, ctx.kv, s, now, bound);
			return {
				...receipt,
				db: { dialect: db.dialect },
				ingest: await ingestStatus(s, void 0, db.dialect),
				capacity: await capacityOf(db, s, now, bound.id, ctx.kv, {
					analyticsBytes: receipt.retention.storage?.bytes,
					health,
					...env.workerEnv ? { env: env.workerEnv } : {}
				})
			};
		}
	};
}
// src/agent/openapi.ts
/** OpenAPI 3.1 document of the agent API, generated from the zod schemas; committed as `docs/openapi.json`. */
const json = (schema) => {
	const { $schema: _s, ...rest } = z.toJSONSchema(schema, {
		io: "input",
		unrepresentable: "any"
	});
	return rest;
};
/** Query string parameters from a flat object schema. */
function parameters(schema) {
	const s = json(schema);
	return Object.entries(s.properties ?? {}).map(([name, p]) => ({
		name,
		in: "query",
		required: s.required?.includes(name) ?? false,
		schema: p
	}));
}
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const content = (schema) => ({ "application/json": { schema } });
function buildOpenApi(version) {
	const paths = {};
	for (const e of ENDPOINTS) {
		const op = {
			operationId: `${e.method.toLowerCase()}_${e.name.replace(/^agent\/v1\//, "").replace(/[^a-z0-9]+/gi, "_")}`,
			summary: e.summary,
			"x-scope": e.scope ?? "any",
			security: [{ apiKey: [] }],
			...e.params ? { parameters: parameters(e.params) } : {},
			...e.body ? { requestBody: {
				required: true,
				content: content(json(e.body))
			} } : {},
			responses: {
				"200": e.name.endsWith("data/dump") ? {
					description: "Rows, one JSON object per line.",
					content: { "application/x-ndjson": { schema: { type: "string" } } }
				} : {
					description: "Success.",
					content: content(e.name.endsWith("openapi.json") ? { type: "object" } : ref("Envelope"))
				},
				...e.body || e.params ? { "400": {
					description: "Invalid input.",
					content: content(ref("Error"))
				} } : {},
				"404": {
					description: "Missing, malformed, unknown, revoked or expired key, or a scope the key lacks. The body is an empty JSON object.",
					content: content({
						type: "object",
						maxProperties: 0
					})
				},
				"429": {
					description: "Rate limit of the key reached; see Retry-After.",
					content: content(ref("Error"))
				}
			}
		};
		paths[`/${e.name}`] = {
			...paths[`/${e.name}`],
			[e.method.toLowerCase()]: op
		};
	}
	return {
		openapi: "3.1.0",
		info: {
			title: "Cookieless Analytics agent API",
			version,
			description: `Aggregated analytics for agents and scripts. Send the key in the X-Api-Key header; Authorization: Bearer cannot be used because the host rejects unknown bearer tokens. Scopes: ${SCOPES.join(", ")}.`
		},
		servers: [{ url: `/_emdash/api/plugins/${PLUGIN_ID}` }],
		security: [{ apiKey: [] }],
		paths,
		components: {
			securitySchemes: { apiKey: {
				type: "apiKey",
				in: "header",
				name: "X-Api-Key"
			} },
			schemas: {
				Envelope: {
					type: "object",
					required: [
						"ok",
						"data",
						"meta"
					],
					properties: {
						ok: { const: true },
						data: {},
						meta: {
							type: "object",
							required: [
								"site",
								"from",
								"to",
								"generatedAt",
								"truncated"
							],
							properties: {
								site: { type: "string" },
								from: { type: ["string", "null"] },
								to: { type: ["string", "null"] },
								generatedAt: {
									type: "string",
									format: "date-time"
								},
								truncated: { type: "boolean" }
							}
						}
					}
				},
				Error: {
					type: "object",
					required: ["ok", "error"],
					properties: {
						ok: { const: false },
						error: { type: "string" },
						message: { type: "string" }
					}
				}
			}
		}
	};
}
const CONCURRENCY = 2;
/** Traffic tile reports that compare periods on their own: no segment comparison. */
const SEGMENT_COMPARE_SKIP = /* @__PURE__ */ new Set([
	"traffic_movers",
	"traffic_decay",
	"impact"
]);
/** Tile reports that refuse the compare option; their tiles always run without it. */
const NO_COMPARE_TILES = /* @__PURE__ */ new Set(["search_cannibalization", "search_cannibalization_pages"]);
/** The dispatcher request of one tile. `params.goal` is not a report param: the tile picks the goal's row. */
function tileRequest(tile, base) {
	const { goal, metric, ...rest } = tile.params ?? {};
	const params = { ...rest };
	if (tile.report === "impact") Object.assign(params, {
		metric: tile.metric ?? tile.metrics?.[0],
		...goal ? { goal } : {}
	});
	else if (tile.report === "search_position_bands_series") {
		const m = tile.kind === "stacked" ? tile.metric : metric;
		if (m) params.metric = m;
	} else if (metric) params.metric = metric;
	const breakdown = tile.kind === "bars" || tile.kind === "donut" || tile.kind === "table";
	const segCompare = base.compare === "segment" && !!base.compareSegment && !tileNeedsSearch(tile) && !SEGMENT_COMPARE_SKIP.has(tile.report);
	const compare = NO_COMPARE_TILES.has(tile.report) || base.compare === "segment" && !segCompare ? "none" : base.compare;
	return {
		report: tile.report,
		query: {
			from: base.from,
			to: base.to,
			filters: [...base.filters, ...tile.filters ?? []],
			compare,
			...segCompare ? { compareSegment: base.compareSegment } : {},
			granularity: "auto",
			site: base.site,
			...base.segment ? { segment: base.segment } : {}
		},
		...Object.keys(params).length ? { params } : {},
		...breakdown ? { limit: tile.limit ?? 10 } : {}
	};
}
/** Distinct report requests of a dashboard (each one doubles with compare); the range does not change the count. */
function distinctRequests(d) {
	const base = {
		from: "",
		to: "",
		compare: d.defaults.compare,
		site: "",
		filters: d.defaults.filters,
		segment: d.defaults.segment,
		compareSegment: d.defaults.compareSegment
	};
	return new Set(d.tiles.map((t) => JSON.stringify(tileRequest(t, base)))).size;
}
const NONE$1 = {
	items: [],
	truncated: false
};
/** `annotations`: attach the matching annotations to series tiles (shared pages pass `viewer.annotations`). */
async function runDashboard(rc, dashboard, opts = {}) {
	const range = presetRange(opts.range ?? dashboard.defaults.range, rc.tz, rc.now);
	const compare = opts.compare ?? dashboard.defaults.compare;
	const seg = dashboard.defaults.segment;
	const segment = seg && await rc.segmentExists(seg) ? seg : void 0;
	const notices = seg && !segment ? ["segment_missing"] : [];
	const cseg = compare === "segment" ? dashboard.defaults.compareSegment : void 0;
	const compareSegment = cseg && await rc.segmentExists(cseg) ? cseg : void 0;
	if (cseg && !compareSegment) notices.push("compare_segment_missing");
	const byKey = /* @__PURE__ */ new Map();
	const keyOf = dashboard.tiles.map((t) => {
		const body = tileRequest(t, {
			...range,
			compare,
			site: rc.site,
			segment,
			compareSegment,
			filters: dashboard.defaults.filters
		});
		const key = JSON.stringify([
			body.report,
			body.query,
			body.params ?? null,
			body.limit ?? null
		]);
		byKey.set(key, body);
		return key;
	});
	const shared = {
		annotations: opts.annotations && rc.loadAnnotations ? await rc.loadAnnotations(range) : NONE$1,
		memo: /* @__PURE__ */ new Map()
	};
	const results = /* @__PURE__ */ new Map();
	const queue = [...byKey];
	const worker = async () => {
		for (let next = queue.shift(); next; next = queue.shift()) {
			const p = rc.dispatch(next[1], shared);
			results.set(next[0], p);
			await p.catch(() => {});
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
	const tiles = [];
	for (const [i, t] of dashboard.tiles.entries()) try {
		tiles.push({
			id: t.id,
			result: await results.get(keyOf[i]),
			notices
		});
	} catch (err) {
		const e = err;
		tiles.push({
			id: t.id,
			error: {
				code: typeof e.code === "string" ? e.code : "error",
				message: String(e.message ?? err)
			},
			notices
		});
	}
	return {
		range,
		compare,
		tiles,
		requests: byKey.size
	};
}
// src/dashboards/share-view.ts
/** The state of one link; `stateRank` orders them from least to most permissive. */
const shareState = (s) => !s ? "none" : s.expired ? "expired" : s.password ? "password" : "open";
const STATE_RANK = [
	"none",
	"expired",
	"password",
	"open"
];
const mostPermissive = (states) => states.reduce((a, b) => STATE_RANK.indexOf(b) > STATE_RANK.indexOf(a) ? b : a, "none");
// src/dashboards/password.ts
/** Share passwords: PBKDF2 verifier peppered with the link secret, a per-isolate credential cache, and the KV lock. */
/**
* Workers rejects more than 100,000 and the Free plan has 10 ms CPU; the token pepper makes this count
* a reused-password guard only.
*/
const SHARE_PBKDF2_ITERATIONS = 1e4;
const enc$1 = new TextEncoder();
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
function fromBase64url(s) {
	const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
/** PBKDF2-SHA-256(password, salt16 || secretBytes, iter, 256 bits) as hex. */
async function derive(password, salt16, secretBytes, iter) {
	const key = await crypto.subtle.importKey("raw", enc$1.encode(password), "PBKDF2", false, ["deriveBits"]);
	const salt = new Uint8Array(salt16.length + secretBytes.length);
	salt.set(salt16);
	salt.set(secretBytes, salt16.length);
	return hex(new Uint8Array(await crypto.subtle.deriveBits({
		name: "PBKDF2",
		hash: "SHA-256",
		salt,
		iterations: iter
	}, key, 256)));
}
/** Password length in characters (code points), 8 to 128. */
const passwordOk = (p) => [...p].length >= 8 && [...p].length <= 128;
async function makeVerifier(password, secret) {
	const salt = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16));
	return {
		salt: base64url(salt),
		iter: SHARE_PBKDF2_ITERATIONS,
		verifier: await derive(password, salt, fromBase64url(secret), SHARE_PBKDF2_ITERATIONS)
	};
}
/** Constant-time check; the stored `iter` is used, so the constant can change without a migration. */
async function verify(pw, password, secret) {
	return timingSafeEqual(await derive(password, fromBase64url(pw.salt), fromBase64url(secret), pw.iter), pw.verifier);
}
const CACHE_MS = 6e5;
/** Share id to `SHA-256(secret || password)` of the last success; insertion order is age order. */
const cache = /* @__PURE__ */ new Map();
/** Verify through the credential cache: a repeated success within 10 minutes skips the derivation. A failure is never cached. */
async function checkPassword(shareId, pw, password, secret, nowMs = Date.now()) {
	const key = hex(await sha256(secret + password));
	const hit = cache.get(shareId);
	if (hit && nowMs - hit.at < CACHE_MS && timingSafeEqual(hit.key, key)) return true;
	if (!await verify(pw, password, secret)) return false;
	cache.delete(shareId);
	cache.set(shareId, {
		key,
		at: nowMs
	});
	while (cache.size > 200) cache.delete(cache.keys().next().value);
	return true;
}
const lockKey = (id) => `share:lock:${id}`;
const WINDOW = 900;
/** Seconds until the lock ends, or 0 when the share is not locked. */
async function lockedFor(kv, id, now) {
	const l = await kv.get(lockKey(id));
	return l?.until && l.until > now ? l.until - now : 0;
}
/**
* Count a failed attempt in the 15 minute window; the tenth locks for 15 minutes. Returns the lock seconds, or 0.
* shortcut: read-modify-write in KV (no atomic increment), so parallel guesses can exceed 10 per window; the
* Cloudflare rate limiting rule on `sharePath` is the real bound (docs/dashboards.md).
*/
async function recordFailure(kv, id, now) {
	const l = await kv.get(lockKey(id));
	const next = !l || now - l.since >= WINDOW || l.until !== void 0 && l.until <= now ? {
		fails: 1,
		since: now
	} : {
		fails: l.fails + 1,
		since: l.since
	};
	if (next.fails >= 10) next.until = now + WINDOW;
	await kv.set(lockKey(id), next);
	return next.until ? WINDOW : 0;
}
/** A success with earlier failures clears the record. */
async function resetFailures(kv, id) {
	const l = await kv.get(lockKey(id));
	if (l && l.fails > 0) await kv.delete(lockKey(id));
}
// src/dashboards/shares.ts
/** Share links over the `shares` collection, indexed by `prefix` and `site`. Times are epoch seconds. */
var ShareError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
	}
};
function shareView(id, s, now) {
	return {
		id,
		site: s.site,
		dashboard: s.dashboard,
		prefix: s.prefix,
		password: !!s.pw,
		expires: s.expires,
		expired: s.expires !== null && s.expires <= now,
		created: s.created,
		views: s.views,
		lastViewed: s.lastViewed,
		...s.label ? { label: s.label } : {}
	};
}
/** Every link of one dashboard, oldest first. */
async function sharesOf(coll, site, dashboard) {
	return (await loadAll(coll, { site })).filter((i) => i.data.dashboard === dashboard).map((i) => ({
		id: i.id,
		share: i.data
	})).sort((a, b) => a.share.created - b.share.created);
}
/** Up to 10 links per dashboard and 100 per site. Returns the token once; only its prefix and the hash of its secret are stored. */
async function createShare(coll, input, now) {
	const all = await loadAll(coll, { site: input.site });
	if (all.filter((i) => i.data.dashboard === input.dashboard).length >= 10) throw new ShareError("too_many_shares", `At most 10 links per dashboard. Revoke one first.`);
	if (all.length >= 100) throw new ShareError("too_many_shares", `At most 100 links per site. Revoke one first.`);
	const label = input.label?.trim();
	if (label !== void 0 && (label.length < 1 || label.length > 40 || /\p{Cc}/u.test(label))) throw new ShareError("invalid_share", `A label has 1 to 40 characters.`);
	if (input.expires != null && input.expires <= now) throw new ShareError("invalid_share", "The expiry must be in the future.");
	let t = generateToken();
	if ((await coll.query({
		where: { prefix: t.prefix },
		limit: 1
	})).items.length) t = generateToken();
	const share = {
		site: input.site,
		dashboard: input.dashboard,
		prefix: t.prefix,
		hash: await hashSecret(t.secret),
		...input.password ? { pw: await makeVerifier(input.password, t.secret) } : {},
		expires: input.expires ?? null,
		created: now,
		views: 0,
		lastViewed: null,
		...label ? { label } : {}
	};
	const id = randomId(16);
	await coll.put(id, share);
	return {
		token: t.token,
		share: shareView(id, share, now)
	};
}
/** The live share behind a token, with its secret; null for malformed, unknown, wrong and expired tokens alike. */
async function lookup(coll, token, now) {
	const parsed = parseToken(token);
	if (!parsed) return null;
	const hit = (await coll.query({
		where: { prefix: parsed.prefix },
		limit: 1
	})).items[0];
	const hash = await hashSecret(parsed.secret);
	const share = hit?.data;
	if (!hit || !share || !timingSafeEqual(hash, share.hash) || share.expires !== null && share.expires <= now) return null;
	return {
		id: hit.id,
		share,
		secret: parsed.secret
	};
}
/** Deletes one link of the site by its id; the other links of the dashboard keep working. */
async function deleteShare(coll, site, id) {
	const raw = await coll.get(id);
	if (!raw || raw.site !== site) return false;
	return coll.delete(id);
}
/** Deletes every link of the dashboard (the dashboard itself was deleted). */
async function deleteSharesOf(coll, site, dashboard) {
	let deleted = false;
	for (const it of await loadAll(coll, { site })) if (it.data.dashboard === dashboard) deleted = await coll.delete(it.id) || deleted;
	return deleted;
}
/** `views += 1`, `lastViewed = now` as one update-only statement: a revoked share is never written back. */
async function recordView(coll, id, now) {
	await coll.updateIf(id, {
		where: {},
		set: { lastViewed: now },
		delta: { views: { inc: 1 } }
	});
}
// src/dashboards/store.ts
/** Dashboards over the `dashboards` storage collection, indexed by `site`. */
/** The site's readable dashboards, newest first. A record of an unknown format version is left out. */
async function listDashboards(coll, site) {
	const out = [];
	for (const it of await loadAll(coll, { site })) try {
		const d = readDashboard(it.data);
		if (d.site === site && d.id === it.id) out.push(d);
	} catch {}
	return out.sort((a, b) => b.updated - a.updated);
}
/** One dashboard of the site, or null. Throws `unknown_version` for a record this reader cannot read. */
async function getDashboard(coll, site, id) {
	const raw = await coll.get(id);
	if (!raw || raw.site !== site) return null;
	return readDashboard(raw);
}
/** Fields only `dashboards/email/save` and the mail tick write; every other writer ignores them. */
const EMAIL_FIELDS = [
	"email",
	"emailNext",
	"recipientCount"
];
/**
* Validate and store; `input.id` absent creates (at most MAX_DASHBOARDS_PER_SITE per site). An incoming `email` is
* ignored and the stored schedule kept.
*/
async function saveDashboard(coll, site, input, now) {
	const clean = input && typeof input === "object" ? Object.fromEntries(Object.entries(input).filter(([k]) => !EMAIL_FIELDS.includes(k))) : input;
	const d = parseStrict(DashboardInput, clean, "invalid_dashboard");
	let created = now;
	let kept = {};
	if (d.id) {
		const cur = await getDashboard(coll, site, d.id);
		if (!cur) throw new DashboardError("invalid_dashboard", "Unknown dashboard.");
		created = cur.created;
		if (cur.email) kept = {
			email: cur.email,
			...cur.emailNext !== void 0 ? { emailNext: cur.emailNext } : {}
		};
	} else if ((await loadAll(coll, { site })).length >= 20) throw new DashboardError("too_many_dashboards", `At most 20 dashboards per site.`);
	const { id: _id, ...rest } = d;
	const id = d.id ?? randomId(12);
	const record = readDashboard({
		id,
		site,
		v: 1,
		...rest,
		created,
		updated: now,
		...kept
	});
	await coll.put(id, record);
	return record;
}
async function deleteDashboard(coll, site, id) {
	const raw = await coll.get(id);
	if (!raw || raw.site !== site) return false;
	return coll.delete(id);
}
// src/db/tables.ts
const KIND = {
	"": "text",
	i: "int",
	r: "real",
	d: "doc"
};
/** `"a b:i c:r"`: column names in table order, `:i` integer, `:r` real, `:d` document, none text. */
function spec$1(columns, key) {
	return {
		columns: columns.split(/\s+/).map((c) => {
			const [name = "", k = ""] = c.split(":");
			return {
				name,
				kind: KIND[k] ?? "text"
			};
		}),
		key: key.split(" ")
	};
}
/** Columns and primary keys of the analytics tables, in the order of `schema.ts`. A test holds them to the live schema of both engines. */
const TABLE_SPECS = {
	ca_sessions: spec$1(`site day sid vkey hour:i started:i last_seen:i window_s:i entry_path exit_path pageviews:i events:i engaged_ms:i
		visible_ms:i reentries:i max_scroll:i interacted:i ref_host ref_path channel source utm_source utm_medium utm_campaign
		utm_term utm_content country region device browser browser_major os lang screen host hits:d`, "site day sid"),
	ca_events: spec$1("site id day:i ts:i sday sid name path props val:r cur", "site id"),
	ca_srv: spec$1("site day:i status:i path ref n:i last_ts:i", "site day status path ref"),
	ca_drops: spec$1("site day:i reason n:i", "site day reason"),
	ca_cube: spec$1("site day:i channel country device sessions:i pageviews:i visitors:i bounces:i engaged:i duration_ms:i events:i", "site day channel country device"),
	ca_rollup: spec$1("site day dim key seg segkey pageviews:i sessions:i visitors:i bounces:i engaged:i engaged_ms:i events:i hits:i", "site dim seg day key segkey"),
	ca_aliases: spec$1("site sid canon expires:i", "site sid"),
	ca_search_daily: spec$1("site source day page_key query country device clicks:i impressions:i pos_sum:r provisional:i", "site source day page_key query country device"),
	ca_revenue_daily: spec$1("site day dim key cur seg segkey orders:i revenue:r sessions:i", "site dim seg day key segkey cur")
};
// src/move/chunks.ts
/** Read in descending key order, site first: within each site the newest day comes first, so reports fill in from recent to old while a move runs. */
const NEWEST_FIRST = /* @__PURE__ */ new Set(["ca_sessions"]);
/** Counters per day: a key already in the destination gets the source value added on the first load (or the larger value kept). */
const COUNTERS$1 = {
	ca_srv: ["n"],
	ca_drops: ["n"]
};
const enc = new TextEncoder();
function spec(table) {
	const s = TABLE_SPECS[table];
	if (!s) throw new Error(`not an analytics table: ${table}`);
	return s;
}
const intType = (d) => d === "postgres" ? "BIGINT" : "INTEGER";
/** `(key) > (after)` (or `<` for a descending table), with integer keys cast on both engines. */
function keyAfter(db, table, after, desc = false) {
	const { columns, key } = spec(table);
	if (after.length !== key.length) throw new Error(`cursor of ${table} needs ${key.length} values`);
	const kinds = new Map(columns.map((c) => [c.name, c.kind]));
	return {
		sql: `(${key.join(", ")}) ${desc ? "<" : ">"} (${key.map((k) => kinds.get(k) === "int" ? `CAST(? AS ${intType(db.dialect)})` : "?").join(", ")})`,
		params: [...after]
	};
}
/**
* Up to `limit` rows after the key `after` (null: from the start), optionally of one site, and at most `maxBytes`
* of row JSON (the chunk travels as one bound parameter); a first row larger than that still comes alone.
*/
async function readChunk(db, table, after, limit, site, maxBytes = Number.POSITIVE_INFINITY) {
	const { columns, key } = spec(table);
	const desc = NEWEST_FIRST.has(table);
	const where = [];
	const params = [];
	if (site !== void 0) {
		where.push("site = ?");
		params.push(site);
	}
	if (after) {
		const k = keyAfter(db, table, after, desc);
		where.push(k.sql);
		params.push(...k.params);
	}
	const select = columns.map((c) => c.kind === "doc" ? `${docRead(db.dialect, c.name).sql} AS ${c.name}` : c.name).join(", ");
	const order = key.map((k) => desc ? `${k} DESC` : k).join(", ");
	const rows = await db.all(`SELECT ${select} FROM ${table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ${Math.max(1, Math.floor(limit))}`, params);
	let bytes = 0;
	const keep = rows.findIndex((r, i) => (bytes += enc.encode(JSON.stringify(r)).length + 1) > maxBytes && i > 0);
	const cut = keep > 0 ? rows.slice(0, keep) : rows;
	const last = cut.at(-1);
	return {
		rows: cut,
		next: last && (keep > 0 || rows.length >= limit) ? key.map((k) => last[k]) : null
	};
}
/** The value of one column of a row of `paramRows` (alias `v`), typed for the destination. */
function value(d, c) {
	const e = `(v.value ->> '${c.name}')`;
	switch (c.kind) {
		case "int": return `CAST(${e} AS ${intType(d)})`;
		case "real": return `CAST(${e} AS ${d === "postgres" ? "DOUBLE PRECISION" : "REAL"})`;
		case "doc": return d === "postgres" ? `CAST(${e} AS JSONB)` : `jsonb(${e})`;
		default: return e;
	}
}
/**
* Insert one chunk, idempotent: a key already present keeps the destination row (written since the switch, so
* newer). Two exceptions:
* - `ca_sessions`: a source visit whose key holds a visit with another start (the visitor went on after the
*   switch and started a new visit under the same sid) is stored under sid plus `SPLIT_SUFFIX`, so both halves stay.
* - `ca_srv`, `ca_drops` with `counters`: "add" adds the source count to an existing key (not idempotent: the
*   caller passes it on the first load of a chunk only); "max" keeps the row with the larger count (idempotent; a
*   move back, where the destination's count is already part of the source's).
* Returns the rows inserted or changed.
*/
async function writeChunk(db, table, rows, counters = null) {
	if (!rows.length) return 0;
	const { columns, key } = spec(table);
	const d = db.dialect;
	const exprs = columns.map((c) => value(d, c));
	if (table === "ca_sessions") {
		const at = (name) => exprs[columns.findIndex((c) => c.name === name)] ?? "";
		const sid = columns.findIndex((c) => c.name === "sid");
		exprs[sid] = `CASE WHEN EXISTS (SELECT 1 FROM ca_sessions o WHERE o.site = ${at("site")} AND o.day = ${at("day")} AND o.sid = ${at("sid")} AND o.started <> ${at("started")}) THEN ${at("sid")} || '~m' ELSE ${at("sid")} END`;
	}
	const cols = counters ? COUNTERS$1[table] ?? [] : [];
	const conflict = counters === "max" && cols.length ? `ON CONFLICT (${key.join(", ")}) DO UPDATE SET ${columns.filter((c) => !key.includes(c.name)).map((c) => `${c.name} = excluded.${c.name}`).join(", ")} WHERE ${cols.map((c) => `excluded.${c} > ${table}.${c}`).join(" OR ")}` : upsertChanged(d, table, key, [], cols);
	const src = paramRows(d, rows, "v");
	return (await db.run(`INSERT INTO ${table} (${columns.map((c) => c.name).join(", ")}) SELECT ${exprs.join(", ")} FROM ${src.sql} WHERE 1 = 1 ${conflict}`, src.params)).changes;
}
/**
* Verification figures computed by SQL, comparable across engines. `ca_aliases` has no day and counts under day "".
* shortcut: sums are read as JavaScript numbers on SQLite, exact up to 2^53 per site and day; enough for epoch sums of 5 million visits a day.
*/
async function dayTotals(db, table, site) {
	const { columns, key } = spec(table);
	const hasDay = columns.some((c) => c.name === "day");
	const summed = columns.filter((c) => (c.kind === "int" || c.kind === "real") && c.name !== "day" && !key.includes(c.name));
	const real = new Set(summed.filter((c) => c.kind === "real").map((c) => c.name));
	const sums = summed.map((c) => `SUM(${c.name}) AS ${c.name}`);
	const rows = await db.all(`SELECT site, ${hasDay ? "day" : "''"} AS day, COUNT(*) AS n${sums.map((s) => `, ${s}`).join("")} FROM ${table}${site === void 0 ? "" : " WHERE site = ?"} GROUP BY site${hasDay ? ", day" : ""}`, site === void 0 ? [] : [site]);
	const out = {};
	const text = (k, v) => real.has(k) ? String(Math.round(Number(v ?? 0) * 100) / 100) : String(v ?? 0);
	for (const { site: s, day, ...rest } of rows) out[`${String(s)} ${String(day)}`] = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, text(k, v)]));
	return out;
}
/**
* One page of the key check of a site and day (`day` "" for a table without a day): up to `limit` source keys after
* `after`, and those of them the destination lacks (one anti-join on the destination). A visit split at the switch
* counts as present under sid plus `SPLIT_SUFFIX`. Two statements.
*/
async function missingKeys(src, dst, table, site, day, after, limit) {
	const { columns, key } = spec(table);
	const where = ["site = ?"];
	const params = [site];
	if (day !== "") {
		where.push(columns.find((c) => c.name === "day")?.kind === "int" ? `day = CAST(? AS ${intType(src.dialect)})` : "day = ?");
		params.push(day);
	}
	if (after) {
		const k = keyAfter(src, table, after);
		where.push(k.sql);
		params.push(...k.params);
	}
	const keys = await src.all(`SELECT ${key.join(", ")} FROM ${table} WHERE ${where.join(" AND ")} ORDER BY ${key.join(", ")} LIMIT ${Math.max(1, Math.floor(limit))}`, params);
	const last = keys.at(-1);
	const next = last && keys.length >= limit ? key.map((k) => last[k]) : null;
	if (!keys.length) return {
		missing: [],
		next
	};
	const d = dst.dialect;
	const kinds = new Map(columns.map((c) => [c.name, c]));
	const match = key.map((k) => {
		const e = value(d, kinds.get(k));
		return table === "ca_sessions" && k === "sid" ? `o.sid IN (${e}, ${e} || '~m')` : `o.${k} = ${e}`;
	});
	const v = paramRows(d, keys, "v");
	return {
		missing: await dst.all(`SELECT ${key.map((k) => `${value(d, kinds.get(k))} AS ${k}`).join(", ")} FROM ${v.sql} WHERE NOT EXISTS (SELECT 1 FROM ${table} o WHERE ${match.join(" AND ")})`, v.params),
		next
	};
}
// src/move/job.ts
const KV_MOVE_JOB = "move:job";
/** Pause or cancel of a job (`{ id, status }`): the job applies it; nothing else rewrites the job for it. */
const KV_MOVE_STOP = "move:stop";
/** Source, destination and site of every move whose counters were loaded (JSON text of the three). */
const KV_MOVE_LEDGER = "move:counters";
/** The cron task that continues a job; scheduled while a job is active, cancelled when none is. */
const MOVE_CRON = "move";
const MOVE_SCHEDULE = "* * * * *";
const MOVE_ORDER = [
	"ca_rollup",
	"ca_cube",
	"ca_revenue_daily",
	"ca_search_daily",
	"ca_events",
	"ca_srv",
	"ca_drops",
	"ca_sessions",
	"ca_aliases"
];
const COUNTERS = /* @__PURE__ */ new Set(["ca_srv", "ca_drops"]);
/** Cron state of a database: the watermark is copied from the source, the others are deleted at the destination. */
const STATE_KEYS = [
	KV_WATERMARK,
	KV_ROLLUP_CURSOR,
	KV_REVENUE_CURSOR,
	KV_CURSOR
];
/** Rows per chunk: on `small` (Workers Free, 10 ms CPU) a chunk must stay small. */
const MOVE_ROWS = {
	small: 50,
	standard: 200,
	dedicated: 200
};
/** JSON bytes per chunk (one bound parameter): half of the 2 MB D1 documents per string or row. */
const MOVE_CHUNK_BYTES = 1e6;
/** Rows written per row copied: a secondary index adds one on D1. */
const WRITE_ROWS = {
	ca_sessions: 2,
	ca_events: 2,
	ca_search_daily: 2
};
/** Source keys per page of the key check. */
const KEY_ROWS = 500;
/** Requests a call keeps for its end: the holder read, the stop read, the job write, the cron cancel. */
const END_REQUESTS$1 = 4;
/** Differing keys a verification keeps per table. */
const SAMPLE = 5;
const isMoving = (j) => !!j && (j.status === "running" || j.status === "paused");
function moveView(j) {
	if (!j) return null;
	const { lease: _l, holder: _h, state: _s, pending: _p, after: _a, vk: _k, fails: _f, chunkRows: _r, ...v } = j;
	const total = Object.values(j.total).reduce((a, b) => a + b, 0);
	const read = Object.values(j.read).reduce((a, b) => a + b, 0);
	const percent = j.t >= MOVE_ORDER.length ? 100 : total ? Math.min(99, Math.floor(read / total * 100)) : 0;
	return {
		...v,
		percent,
		rowsLeftToday: j.today ? Math.max(0, COPY_DAY_ROWS - j.today.rows) : null
	};
}
/** The `Db` of a D1 or Hyperdrive binding of this Worker, or null when there is no such binding. */
async function openBinding(name, env = workerEnv) {
	const b = (await env())?.[name];
	return isD1(b) ? fromD1(b) : isHyperdrive(b) ? fromPg(b, name) : null;
}
/**
* The source's cron state now. The EmDash database keeps the plain keys; a binding keeps the plain keys when it was
* the default database and its prefixed keys when a site was routed to it (taken when its prefixed watermark exists).
*/
async function sourceState(kv, source) {
	let prefix = source === null ? "" : statePrefix(source);
	if (prefix && await kv.get(prefix + "rollup:watermark") === null) prefix = "";
	const out = {};
	for (const k of STATE_KEYS) out[k] = await kv.get(prefix + k);
	return out;
}
/** Rows of every table of the source (of one site), for the progress. */
async function sourceTotals(db, site) {
	const out = {};
	for (const t of MOVE_ORDER) {
		const [r] = await db.all(`SELECT COUNT(*) AS n FROM ${t}${site === void 0 ? "" : " WHERE site = ?"}`, site === void 0 ? [] : [site]);
		out[t] = Number(r?.n ?? 0);
	}
	return out;
}
function newMoveJob(o) {
	const zero = Object.fromEntries(MOVE_ORDER.map((t) => [t, 0]));
	return {
		id: `${o.now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
		by: o.by,
		at: o.now,
		source: o.source,
		dest: o.dest,
		...o.site !== void 0 ? { site: o.site } : {},
		status: "running",
		t: 0,
		after: null,
		pending: null,
		total: o.total,
		read: { ...zero },
		inserted: { ...zero },
		state: o.state,
		stateCopied: false,
		v: 0,
		verify: {},
		error: null
	};
}
const splitKey = (key) => {
	const i = key.lastIndexOf(" ");
	return [key.slice(0, i), key.slice(i + 1)];
};
/** Whether a site and day key lies before `from` (a table without a day, day "", is always compared). */
const before = (key, from) => {
	const day = splitKey(key)[1];
	return from !== null && day !== "" && isoDay(day) < from;
};
/**
* Source against destination per site and day from `from` on: the destination may hold more (rows since the
* switch), never less. Days before `from` are counted as `skipped`.
*/
function compareTotals(source, dest, from = null) {
	const out = {
		keys: 0,
		short: 0,
		more: 0,
		from,
		skipped: 0,
		byKey: 0,
		sample: []
	};
	for (const [key, s] of Object.entries(source)) {
		if (before(key, from)) {
			out.skipped = (out.skipped ?? 0) + 1;
			continue;
		}
		out.keys++;
		const d = dest[key];
		if (!d || Object.entries(s).some(([c, v]) => Number(d[c] ?? 0) < Number(v))) {
			out.short++;
			if (out.sample.length < SAMPLE) out.sample.push({
				key,
				source: s,
				dest: d ?? null
			});
		} else if (Object.entries(s).some(([c, v]) => d[c] !== v)) out.more++;
	}
	return out;
}
/** Site and day keys the totals cannot settle: the destination holds more rows there, which could hide missing ones. */
function keyCheckDays(source, dest, from = null) {
	return Object.entries(source).filter(([key, s]) => !before(key, from) && Number(dest[key]?.n ?? 0) > Number(s.n) && !Object.entries(s).some(([c, v]) => Number(dest[key]?.[c] ?? 0) < Number(v))).map(([key]) => splitKey(key));
}
/** Source keys of one day found missing by `missingKeys`: on the day's first find it turns from more to short. */
function noteMissing(v, site, day, missing, first) {
	if (!missing.length) return;
	if (first) {
		v.short++;
		v.more--;
	}
	for (const m of missing) if (v.sample.length < SAMPLE) v.sample.push({
		key: `${site} ${day}`,
		source: Object.fromEntries(Object.entries(m).map(([k, x]) => [k, String(x)])),
		dest: null
	});
}
/** Verify one table at once (the route's check again): totals, then the key check of the days that need one. */
async function verifyTable(src, dst, table, site, from = null) {
	const s = await dayTotals(src, table, site);
	const d = await dayTotals(dst, table, site);
	const v = compareTotals(s, d, from);
	for (const [st, day] of keyCheckDays(s, d, from)) {
		v.byKey = (v.byKey ?? 0) + 1;
		let after = null;
		let hit = false;
		do {
			const p = await missingKeys(src, dst, table, st, day, after, KEY_ROWS);
			noteMissing(v, st, day, p.missing, !hit);
			hit ||= p.missing.length > 0;
			after = p.next;
		} while (after);
	}
	return v;
}
/** First day of the destination's detailed window, or null without settings (every day is compared). */
const verifyFrom = async (kv, s, now) => s ? rawFromDay(kv, s, now) : null;
const pairId = (source, dest, site) => JSON.stringify([
	source,
	dest,
	site ?? null
]);
/** How this job loads counters, from the ledger; the job's pair is recorded. Two requests. */
async function counterMode(kv, j) {
	const ledger = await kv.get("move:counters") ?? [];
	const id = pairId(j.source, j.dest, j.site);
	if (ledger.includes(id)) return "none";
	await kv.set(KV_MOVE_LEDGER, [...ledger, id]);
	return ledger.includes(pairId(j.dest, j.source, j.site)) ? "max" : "add";
}
/**
* The last job when it is a cancelled move of the same source, destination and site, set running again from its
* saved position (the stop key cleared, the job saved); null otherwise. The start route calls it before a new job.
*/
async function resumeCancelled(kv, o) {
	const job = await kv.get(KV_MOVE_JOB);
	if (job?.status !== "cancelled" || job.dropped || job.source !== o.source || job.dest !== o.dest || job.site !== o.site) return null;
	const { finished: _f, lease: _l, holder: _h, fails: _x, ...rest } = job;
	const j = {
		...rest,
		status: "running",
		error: null
	};
	await kv.delete(KV_MOVE_STOP);
	await kv.set(KV_MOVE_JOB, j);
	return j;
}
/**
* Whether a statement failed with an error the database reported (it did not apply): a SQLSTATE outside the
* connection classes, or a SQLite result code. A lost connection or a timeout leaves the outcome unknown.
*/
function definiteSqlError(err) {
	const code = String(err?.code ?? "");
	if (/^[0-9A-Z]{5}$/.test(code) && !/^E[A-Z]{4}$/.test(code)) return !code.startsWith("08") && !/^57P0[1-3]$/.test(code);
	return /\bSQLITE_[A-Z_]+/.test(`${code} ${String(err?.message ?? err)}`);
}
var Budget$1 = class extends Error {};
/** Another call holds the job now: this call stops without saving it. */
var Lost = class extends Error {};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function applyStop(j, stop, now) {
	if (stop?.id !== j.id || j.status !== "running") return;
	j.status = stop.status;
	if (stop.status === "cancelled") j.finished = now;
}
/**
* One bounded call of the current job: chunks until `requests` or the wall time is spent, then the state copy and
* the verification. Returns the job, or null. A failing statement is saved as `error` and rethrown; the next call
* repeats the chunk from the saved position with half the rows.
*/
async function runMoveJob(e, requests) {
	const job = await e.kv.get(KV_MOVE_JOB);
	if (!isMoving(job)) {
		await e.cron?.cancel(MOVE_CRON).catch(() => {});
		return job;
	}
	if (job.status !== "running" || (job.lease ?? 0) > e.now) return job;
	const stop = await e.kv.get(KV_MOVE_STOP);
	if (stop?.id === job.id) {
		applyStop(job, stop, e.now);
		await e.kv.set(KV_MOVE_JOB, job);
		if (!isMoving(job)) await e.cron?.cancel(MOVE_CRON).catch(() => {});
		return job;
	}
	if ((job.until ?? 0) > e.now || requests < 12) return job;
	const clock = e.clock ?? Date.now;
	const started = clock();
	const at = () => e.now + Math.floor((clock() - started) / 1e3);
	const { until: _u, ...rest } = job;
	const j = {
		...rest,
		lease: e.now + 60,
		holder: Math.random().toString(36).slice(2, 10)
	};
	await e.kv.set(KV_MOVE_JOB, j);
	if ((await e.kv.get("move:job"))?.holder !== j.holder) return job;
	let used = 4;
	let endRequests = END_REQUESTS$1;
	const left = () => requests - used - endRequests;
	const dkv = e.destKv(e.kv, j.site);
	/** Rows charged to the day by this call, not yet in the counter. */
	let copied = 0;
	const flush = async () => {
		if (!copied) return;
		const rows = await chargeCopyRows(dkv, e.now, copied);
		copied = 0;
		if (j.today) j.today.rows = rows;
	};
	/** The holder read back; another holder ends this call. */
	const mine = async () => (await e.kv.get(KV_MOVE_JOB))?.holder === j.holder;
	/** A pause or cancel sent while this call ran wins over the status it read. */
	const end = async () => {
		await flush();
		if (!await mine()) return;
		applyStop(j, await e.kv.get(KV_MOVE_STOP), e.now);
		delete j.lease;
		delete j.holder;
		await e.kv.set(KV_MOVE_JOB, j);
	};
	const save = async () => {
		used += 2;
		if (!await mine()) throw new Lost();
		j.lease = at() + 60;
		await e.kv.set(KV_MOVE_JOB, j);
	};
	let src;
	const source = async () => src ??= await e.source(j.source);
	let dst;
	let wrote = false;
	/** This call saved the counter marker of the write in flight, and that write started. */
	let marked = false;
	let writing = false;
	try {
		dst = await e.dest(j.site);
		const small = dailyRowsApply(e.profile, dst);
		/** Rows the day budget leaves (on `small` with D1). */
		let room = Number.POSITIVE_INFINITY;
		if (small) {
			used++;
			endRequests += 4;
			const rows = await copiedToday(dkv, e.now);
			j.today = {
				day: dayInZone(e.now, "UTC"),
				rows
			};
			room = COPY_DAY_ROWS - rows;
		}
		while (j.t < MOVE_ORDER.length) {
			const table = MOVE_ORDER[j.t];
			const counters = COUNTERS.has(table);
			const ledger = counters && !j.counters ? 2 : 0;
			if (left() < (counters ? 6 : 4) + ledger || clock() - started > 4e4) throw new Budget$1();
			if (ledger) {
				used += ledger;
				j.counters = await counterMode(e.kv, j);
			}
			const per = WRITE_ROWS[table] ?? 1;
			const marker = counters && j.pending && j.pending.t === j.t && same(j.pending.after, j.after) ? j.pending : null;
			let size = j.chunkRows ?? MOVE_ROWS[e.profile];
			if (marker) size = marker.n;
			else if (small) {
				const fit = Math.floor(room / per);
				if (fit < 1) {
					j.until = nextUtcMidnight(e.now);
					throw new Budget$1();
				}
				size = Math.min(size, fit);
			}
			used++;
			const c = await readChunk(await source(), table, j.after, size, j.site, MOVE_CHUNK_BYTES);
			const add = counters && j.counters === "add" && !marker;
			if (add && c.rows.length) {
				j.pending = {
					t: j.t,
					after: j.after,
					n: c.rows.length
				};
				marked = true;
				await save();
			}
			used++;
			writing = true;
			const n = await writeChunk(dst, table, c.rows, add ? "add" : counters && j.counters === "max" ? "max" : null);
			writing = marked = false;
			wrote ||= n > 0;
			copied += small ? n * per : 0;
			room -= n * per;
			j.read[table] = (j.read[table] ?? 0) + c.rows.length;
			j.inserted[table] = (j.inserted[table] ?? 0) + n;
			j.pending = null;
			j.error = null;
			delete j.fails;
			if (j.chunkRows && j.chunkRows * 2 < MOVE_ROWS[e.profile]) j.chunkRows *= 2;
			else delete j.chunkRows;
			if (c.next) j.after = c.next;
			else {
				j.t++;
				j.after = null;
				delete j.chunkRows;
			}
			await save();
		}
		if (!j.stateCopied) {
			if (left() < STATE_KEYS.length + 4) throw new Budget$1();
			used += 2;
			const [last] = await (await source()).all(`SELECT MAX(day) AS d FROM ca_rollup${j.site === void 0 ? "" : " WHERE site = ?"}`, j.site === void 0 ? [] : [j.site]);
			const marks = [
				j.state[KV_WATERMARK],
				await dkv.get(KV_WATERMARK),
				last?.d ?? null
			];
			const wm = marks.some((m) => typeof m !== "string") ? null : marks.sort()[0];
			for (const k of STATE_KEYS) {
				used++;
				if (k === "rollup:watermark" && wm) await dkv.set(k, wm);
				else await dkv.delete(k);
			}
			j.stateCopied = true;
			await save();
		}
		while (j.v < MOVE_ORDER.length) {
			const table = MOVE_ORDER[j.v];
			if (left() < (j.vk ? 4 : 5)) throw new Budget$1();
			if (!j.vk) {
				used += 3;
				const from = await verifyFrom(dkv, e.settings, e.now);
				const s = await dayTotals(await source(), table, j.site);
				const d = await dayTotals(dst, table, j.site);
				j.verify[table] = compareTotals(s, d, from);
				j.vk = {
					days: keyCheckDays(s, d, from),
					after: null,
					hit: false
				};
				j.verify[table].byKey = j.vk.days.length;
			} else {
				used += 2;
				const [site, day] = j.vk.days[0];
				const p = await missingKeys(await source(), dst, table, site, day, j.vk.after, KEY_ROWS);
				noteMissing(j.verify[table], site, day, p.missing, !j.vk.hit);
				j.vk.hit ||= p.missing.length > 0;
				if (p.next) j.vk.after = p.next;
				else j.vk = {
					days: j.vk.days.slice(1),
					after: null,
					hit: false
				};
			}
			if (!j.vk.days.length) {
				delete j.vk;
				j.v++;
			}
			await save();
		}
		j.status = "done";
		j.finished = e.now;
	} catch (err) {
		if (err instanceof Lost) {
			await flush();
			return e.kv.get(KV_MOVE_JOB);
		}
		if (!(err instanceof Budget$1)) {
			if (marked && (!writing || definiteSqlError(err))) j.pending = null;
			const pos = JSON.stringify([
				j.t,
				j.after,
				j.v,
				j.vk?.days[0] ?? null,
				j.vk?.after ?? null
			]);
			const n = j.fails?.pos === pos ? j.fails.n + 1 : 1;
			j.fails = {
				pos,
				n
			};
			if (j.t < MOVE_ORDER.length) j.chunkRows = Math.max(1, Math.floor((j.chunkRows ?? MOVE_ROWS[e.profile]) / 2));
			const msg = err.message;
			j.error = msg;
			if (n % 5 === 0) {
				j.status = "paused";
				j.error = `The move stopped after ${n} failed tries at the same place in ${MOVE_ORDER[j.t] ?? MOVE_ORDER[j.v]}: ${msg}. Resume it to try again.`;
			}
			await end();
			throw err;
		}
	} finally {
		if (wrote) clearReportCache();
	}
	await end();
	if (!isMoving(j)) await e.cron?.cancel(MOVE_CRON).catch(() => {});
	return j;
}
/** Drop the analytics tables and `ca_meta` from a database (the old one, after a move): one batch. */
async function dropTables(db) {
	await db.batch([...MOVE_ORDER, "ca_meta"].map((t) => ({
		sql: `DROP TABLE IF EXISTS ${t}`,
		params: []
	})));
}
// src/query/filtered-delete.ts
/**
* Filtered delete (Data page, Delete tab): removes the visits that match stored dimensions (spam or bots the
* classifier missed) with their page views, events, orders and refunds, then stores again the summary of every
* closed day it touched from the detailed rows that remain (`rollupDay`, the closed-day writer). Filters are the
* report filters (`compileTraffic`, same regex limits), restricted to visit columns, plus screen class, hour of day
* and a visit shape. Days before the detailed window hold only summaries and cannot be filtered: their summaries
* can only be deleted whole, as a separate choice.
*
* The preview reads only. A job runs in bounded calls: the request budget of one call, and on `small` a daily row
* cap and a pause while the write guard's estimate is high, so ingest keeps priority. Its cursor lives in KV, so a
* lost call repeats at most one idempotent chunk: every day that must be stored again is marked and saved before
* its rows are deleted (one more save per newly marked day). The counts come from the calls that saved after their
* delete, so a call lost between its delete and its save is not counted (`deleted` can be lower than what went).
* The admin page and the hourly `retention` cron task (with the requests retention left) continue it.
*/
/** Filter dims a delete takes: the columns of the visit row (page, event, goal and revenue dims are not). */
const DELETE_DIMS = Object.keys(TRAFFIC_DIMS).filter((k) => TRAFFIC_DIMS[k].scope === "session");
/** Screen width classes (`screenBucket`). */
const SCREENS = [
	"xs",
	"sm",
	"md",
	"lg",
	"xl"
];
/** Visit shapes: `single_view_idle` is one page view with no active time and no scroll. */
const SHAPES = ["single_view_idle"];
/** `small`: rows a delete job may write per UTC day, and the guard estimate at which it waits for the next UTC day. */
const DELETE_DAY_ROWS = 15e3;
const DELETE_PAUSE_AT = SYNC_BUDGET.small.pauseAt;
const KV_DELETE_JOB = "delete:job";
const KV_DELETE_LOG = "delete:log";
/** Id of a job an admin cancelled; the next call of that job starts the cancel (a call in flight may not see a status change). */
const KV_DELETE_CANCEL = "delete:cancel";
const Day$4 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Hour = z.number().int().min(0).max(23);
const DeleteSpecSchema = z.object({
	from: Day$4,
	to: Day$4,
	filters: z.array(FilterSchema).max(20).default([]),
	screen: z.array(z.enum(SCREENS)).min(1).max(SCREENS.length).optional(),
	hours: z.object({
		from: Hour,
		to: Hour
	}).strict().optional(),
	shape: z.enum(SHAPES).optional(),
	/** Also delete the whole summaries of the range's days before the detailed window. */
	oldDays: z.boolean().optional()
}).strict().refine((s) => s.filters.every((f) => DELETE_DIMS.includes(f.dim)), {
	message: "Only visit dimensions can select visits to delete.",
	path: ["filters"]
}).refine((s) => s.from <= s.to, {
	message: "from must not be after to",
	path: ["from"]
}).refine((s) => daysBetween(s.from, s.to) < 400, {
	message: `at most 400 days`,
	path: ["to"]
});
/** Readable conditions of a spec, for the audit line (dimension values only, never a visitor). */
function describeSpec(s) {
	const parts = s.filters.map((f) => `${f.dim} ${f.op.replace("_", " ")} ${f.values.join(", ")}`);
	if (s.screen) parts.push(`screen ${s.screen.join(", ")}`);
	if (s.hours) parts.push(`hour ${s.hours.from} to ${s.hours.to}`);
	if (s.shape) parts.push("one page view, no active time, no scroll");
	if (s.oldDays) parts.push("whole summaries of older days");
	return `${s.from} to ${s.to}${parts.length ? `: ${parts.join("; ")}` : ": every visit"}`;
}
/** Predicate over `ca_sessions s` (site and day excluded) for the visits of `from..to` the spec selects. */
async function compileDelete(db, site, spec, from, to) {
	const parts = [(await compileTraffic({
		db,
		site,
		from,
		to,
		goals: []
	}, spec.filters)).session];
	if (spec.screen) parts.push(inList(db.dialect, "s.screen", spec.screen));
	if (spec.hours) {
		const { from: a, to: b } = spec.hours;
		parts.push(a <= b ? {
			sql: "s.hour BETWEEN ? AND ?",
			params: [a, b]
		} : {
			sql: "(s.hour >= ? OR s.hour <= ?)",
			params: [a, b]
		});
	}
	if (spec.shape === "single_view_idle") parts.push({
		sql: "s.pageviews = 1 AND s.engaged_ms = 0 AND s.max_scroll = 0",
		params: []
	});
	return and(parts);
}
/** `FROM ca_sessions s WHERE` the visits of `from..to` of `site` matching `pred`. */
const matched = (site, from, to, pred) => ({
	sql: `FROM ca_sessions s WHERE s.site = ? AND s.day BETWEEN ? AND ? AND (${pred.sql})`,
	params: [
		site,
		visitDayKey(from),
		visitDayKey(to),
		...pred.params
	]
});
const SUMMARY_SEGS = [
	"",
	...SEGS,
	CUBE_SEG
];
const ROLLUP_DIM_LIST = SUMMARY_DIMS;
const REVENUE_DIM_LIST = [...SUMMARY_DIMS, ...SUMMARY_DIMS.map(refundDim)];
const list = (xs) => xs.map((x) => `'${x}'`).join(", ");
/** Summary rows of one table and site in `day` (or a day range), by key range of `(site, dim, seg, day)`. */
const summaryWhere = (dims) => `site = ? AND dim IN (${list(dims)}) AND seg IN (${list(SUMMARY_SEGS)})`;
const TOP_DIMS = [
	"country",
	"browser",
	"os",
	"device",
	"channel",
	"ref_host",
	"entry_path"
];
const n$1 = (v) => Number(v ?? 0) || 0;
/** The read-only preview of a spec: what matches, per day, the sanity check, the summary days and the cost. */
async function previewDelete(e, spec) {
	const { db, site, settings: s } = e;
	const skv = stateKv(e.kv, site);
	const rawFrom = await rawFromDay(skv, s, e.now);
	const wm = await skv.get(KV_WATERMARK);
	const lo = spec.from < rawFrom ? rawFrom : spec.from;
	const out = {
		site,
		summary: describeSpec(spec),
		from: spec.from,
		to: spec.to,
		rawFrom,
		days: [],
		totals: {
			visits: 0,
			pageviews: 0,
			events: 0,
			orders: 0,
			refunds: 0,
			eventRows: 0
		},
		revenue: [],
		top: Object.fromEntries(TOP_DIMS.map((d) => [d, []])),
		old: null,
		recloseDays: 0,
		estimate: {
			rows: 0,
			deleteRows: 0,
			summaryRows: 0,
			oldRows: 0,
			smallDays: 0,
			dayRows: DELETE_DAY_ROWS,
			profile: s.capacityProfile,
			today: null
		}
	};
	const counts = /* @__PURE__ */ new Map();
	const sumHi = spec.to < (wm ?? "") ? spec.to : wm;
	if (sumHi && spec.from <= sumHi) {
		const rows = await db.all(`SELECT day, SUM(n) AS n FROM (SELECT day, COUNT(*) AS n FROM ca_rollup WHERE ${summaryWhere(ROLLUP_DIM_LIST)} AND day BETWEEN ? AND ? GROUP BY day UNION ALL SELECT day, COUNT(*) AS n FROM ca_revenue_daily WHERE ${summaryWhere(REVENUE_DIM_LIST)} AND day BETWEEN ? AND ? GROUP BY day) t GROUP BY day`, [
			site,
			spec.from,
			sumHi,
			site,
			spec.from,
			sumHi
		]);
		for (const r of rows) counts.set(String(r.day), n$1(r.n) + CUBE_CAP[s.capacityProfile]);
	}
	if (lo <= spec.to) {
		const m = matched(site, lo, spec.to, await compileDelete(db, site, spec, lo, spec.to));
		const touched = /* @__PURE__ */ new Map();
		for (const r of await db.all(`SELECT s.day AS day, COUNT(*) AS visits, SUM(s.pageviews) AS pageviews, SUM(s.events) AS events ${m.sql} GROUP BY s.day ORDER BY s.day`, m.params)) {
			const day = isoDay(r.day);
			out.days.push({
				day,
				visits: n$1(r.visits),
				pageviews: n$1(r.pageviews),
				events: n$1(r.events),
				stored: !!wm && day <= wm
			});
			touched.set(day, n$1(r.visits));
		}
		for (const d of out.days) {
			out.totals.visits += d.visits;
			out.totals.pageviews += d.pageviews;
			out.totals.events += d.events;
		}
		const ev = await db.all(`SELECT e.day AS day, e.cur AS cur, CASE WHEN e.val IS NULL THEN 'e' WHEN e.val >= 0 THEN 'o' ELSE 'r' END AS k, COUNT(*) AS n, SUM(e.val) AS v FROM ca_events e WHERE e.site = ? AND e.day >= ? AND (e.sday, e.sid) IN (SELECT s.day, s.sid ${m.sql}) GROUP BY e.day, e.cur, k`, [
			site,
			dayInt(lo),
			...m.params
		]);
		const cur = /* @__PURE__ */ new Map();
		for (const r of ev) {
			const day = isoDay(r.day);
			out.totals.eventRows += n$1(r.n);
			if (r.k !== "e") touched.set(day, (touched.get(day) ?? 0) + n$1(r.n));
			if (r.k === "e") continue;
			const c = cur.get(String(r.cur)) ?? {
				cur: String(r.cur),
				orders: 0,
				revenue: 0,
				refunds: 0,
				refunded: 0
			};
			if (r.k === "o") c.orders += n$1(r.n), c.revenue += n$1(r.v), out.totals.orders += n$1(r.n);
			else c.refunds += n$1(r.n), c.refunded -= n$1(r.v), out.totals.refunds += n$1(r.n);
			cur.set(c.cur, c);
		}
		out.revenue = [...cur.values()].sort((a, b) => a.cur < b.cur ? -1 : 1);
		const tops = TOP_DIMS.map((d, i) => `SELECT * FROM (SELECT '${d}' AS d, ${d} AS v, COUNT(*) AS n FROM m GROUP BY ${d} ORDER BY n DESC, v LIMIT 5) t${i}`).join(" UNION ALL ");
		for (const r of await db.all(`WITH m AS (SELECT ${TOP_DIMS.map((d) => `s.${d} AS ${d}`).join(", ")} ${m.sql}) ${tops}`, m.params)) out.top[r.d].push({
			value: r.v == null ? null : String(r.v),
			visits: n$1(r.n)
		});
		for (const [day, k] of touched) {
			if (!wm || day > wm || day < rawFrom) continue;
			out.recloseDays++;
			out.estimate.summaryRows += Math.min(counts.get(day) ?? 0, k * 40);
		}
		out.estimate.deleteRows = out.totals.visits * 2 + out.totals.eventRows * 2;
	}
	if (spec.from < rawFrom) {
		const hi = spec.to < rawFrom ? spec.to : addDays(rawFrom, -1);
		const days = (await db.all("SELECT day, sessions FROM ca_rollup WHERE site = ? AND dim = 'all' AND seg = '' AND key = '' AND day BETWEEN ? AND ? ORDER BY day", [
			site,
			spec.from,
			hi
		])).map((r) => ({
			day: String(r.day),
			visits: n$1(r.sessions)
		}));
		out.old = {
			from: spec.from,
			to: hi,
			days,
			summaryRows: days.reduce((a, d) => a + (counts.get(d.day) ?? 0), 0)
		};
		if (spec.oldDays) out.estimate.oldRows = out.old.summaryRows;
	}
	const est = out.estimate;
	est.rows = est.deleteRows + est.summaryRows + est.oldRows;
	est.smallDays = Math.ceil(est.rows / DELETE_DAY_ROWS);
	const w = await budgetState(db, skv, e.now, s.capacityProfile, s.siteTimezone);
	if (w) est.today = {
		rows: w.rows,
		limit: w.limit
	};
	return out;
}
const jobView = (j) => {
	if (!j) return null;
	const { pred: _p, lease: _l, ...v } = j;
	return v;
};
const isActive = (j) => !!j && (j.status === "running" || j.status === "cancelling");
/** A new job from a spec: the matched visit days of the detailed window now, and the older days when chosen. */
async function createJob(e, spec, by, preview) {
	const lo = spec.from < preview.rawFrom ? preview.rawFrom : spec.from;
	const pred = lo <= spec.to ? await compileDelete(e.db, e.site, spec, lo, spec.to) : {
		sql: "0 = 1",
		params: []
	};
	return {
		id: `${e.now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
		site: e.site,
		by,
		at: e.now,
		spec,
		summary: describeSpec(spec),
		pred,
		days: preview.days.map((d) => d.day),
		i: 0,
		reclose: {},
		old: spec.oldDays && preview.old ? preview.old.days.map((d) => d.day) : [],
		oi: 0,
		expected: preview.totals.visits,
		deleted: {
			visits: 0,
			pageviews: 0,
			events: 0,
			orders: 0,
			refunds: 0,
			summaryDays: 0,
			oldDays: 0,
			summaryRows: 0
		},
		skipped: [],
		status: "running",
		utc: {
			day: dayInZone(e.now, "UTC"),
			rows: 0
		},
		paused: null
	};
}
var Budget = class extends Error {};
/** `db` with every statement counted (a batch counts each); past `limit` a call throws `Budget`. */
function counted(db, limit) {
	let used = 0;
	const spend = (k) => {
		if (used + k > limit()) throw new Budget();
		used += k;
	};
	return {
		db: {
			dialect: db.dialect,
			run: (q, p) => (spend(1), db.run(q, p)),
			all: (q, p) => (spend(1), db.all(q, p)),
			batch: (st) => (spend(st.length), db.batch(st))
		},
		used: () => used,
		spend
	};
}
/** KV calls a run keeps for its end: the job, the guard's rows and the log. */
const END_REQUESTS = 3;
const nextUtc = (now) => (Math.floor(now / 86400) + 1) * 86400;
/**
* One bounded call of the current job: delete the matched visits day by day in chunks (orders and server events of
* a visit first), store again each closed day once no later chunk can change it, then delete the whole summaries of
* the chosen older days. Stops before the request budget, at the `small` profile's daily rows or when the write
* guard's estimate reaches `DELETE_PAUSE_AT`, and saves the job after every chunk. Returns the job, or null.
*/
async function runDeleteJob(e, requests = PROFILES[e.settings.capacityProfile].requests) {
	let job = await e.kv.get(KV_DELETE_JOB);
	if (!isActive(job) || (job.lease ?? 0) > e.now || requests < 12) return job;
	if (job.status === "running" && await e.kv.get("delete:cancel") === job.id) job.status = "cancelling";
	if (job.paused && job.paused.until > e.now && job.status === "running") return job;
	job.lease = e.now + 60;
	job.paused = null;
	await e.kv.set(KV_DELETE_JOB, job);
	const j = job;
	const s = e.settings;
	const site = j.site;
	const skv = stateKv(e.kv, site);
	const raw = await e.db(site);
	let kvCalls = 3;
	const c = counted(raw, () => requests - kvCalls - END_REQUESTS);
	const save = async () => {
		kvCalls++;
		await e.kv.set(KV_DELETE_JOB, j);
	};
	const utc = dayInZone(e.now, "UTC");
	if (j.utc.day !== utc) j.utc = {
		day: utc,
		rows: 0
	};
	const small = dailyRowsApply(s.capacityProfile, c.db);
	let guard = 0;
	const charge = (rows) => {
		j.utc.rows += rows;
		guard += rows;
	};
	/** On `small`, whether `rows` more may be written now; sets the pause when not. */
	const room = (rows) => {
		if (!small) return true;
		const reason = j.utc.rows + rows > 15e3 ? "day_rows" : guard + rows >= DELETE_PAUSE_AT ? "guard" : null;
		if (reason) j.paused = {
			until: nextUtc(e.now),
			reason
		};
		return !reason;
	};
	const d = c.db.dialect;
	try {
		if (small) guard = (await budgetState(c.db, skv, e.now, "small", s.siteTimezone))?.rows ?? 0;
		let goals = null;
		const reclose = async (before) => {
			const wm = await skv.get(KV_WATERMARK);
			const rawNow = await rawFromDay(skv, s, e.now);
			kvCalls += 2;
			for (const day of Object.keys(j.reclose).sort()) {
				if (before !== null && day >= before) break;
				const k = j.reclose[day];
				if (!wm || day > wm || day < rawNow) {
					if (wm && day < rawNow) j.skipped.push(day);
					delete j.reclose[day];
					continue;
				}
				if (!goals) {
					kvCalls++;
					goals = await e.goals(site);
				}
				if (c.used() + dayStatements(goals) > requests - kvCalls - END_REQUESTS) throw new Budget();
				if (!room(k * 40)) return false;
				const rows = await rollupDay({
					db: c.db,
					site,
					settings: s,
					goals
				}, day);
				charge(Math.min(rows, k * 40));
				j.deleted.summaryDays++;
				delete j.reclose[day];
				await save();
			}
			return true;
		};
		while (j.status === "running" && j.i < j.days.length) {
			const day = j.days[j.i];
			if (!room(1e3)) break;
			const rows = await c.db.all(`SELECT s.sid AS sid, s.pageviews AS pageviews, s.events AS events FROM ca_sessions s WHERE s.site = ? AND s.day = ? AND (${j.pred.sql}) LIMIT 500`, [
				site,
				visitDayKey(day),
				...j.pred.params
			]);
			if (rows.length) {
				const sids = inList(d, "sid", rows.map((r) => r.sid));
				const evWhere = `site = ? AND day >= ? AND sday = ? AND (${sids.sql})`;
				const evParams = [
					site,
					dayInt(day),
					visitDayKey(day),
					...sids.params
				];
				const ev = await c.db.all(`SELECT day, SUM(CASE WHEN val >= 0 THEN 1 ELSE 0 END) AS o, SUM(CASE WHEN val < 0 THEN 1 ELSE 0 END) AS r, COUNT(*) AS n FROM ca_events WHERE ${evWhere} GROUP BY day`, evParams);
				let server = 0;
				let orders = 0;
				let refunds = 0;
				let marked = !(day in j.reclose);
				j.reclose[day] = (j.reclose[day] ?? 0) + rows.length;
				for (const r of ev) {
					const od = isoDay(r.day);
					if (n$1(r.o) + n$1(r.r)) {
						marked ||= !(od in j.reclose);
						j.reclose[od] = (j.reclose[od] ?? 0) + n$1(r.o) + n$1(r.r);
					}
					orders += n$1(r.o);
					refunds += n$1(r.r);
					server += n$1(r.n) - n$1(r.o) - n$1(r.r);
				}
				if (marked) await save();
				const evGone = ev.length ? (await c.db.run(`DELETE FROM ca_events WHERE ${evWhere}`, evParams)).changes : 0;
				j.deleted.orders += orders;
				j.deleted.refunds += refunds;
				const gone = (await c.db.run(`DELETE FROM ca_sessions WHERE site = ? AND day = ? AND (${sids.sql})`, [
					site,
					visitDayKey(day),
					...sids.params
				])).changes;
				j.deleted.visits += gone;
				j.deleted.pageviews += rows.reduce((a, r) => a + n$1(r.pageviews), 0);
				j.deleted.events += rows.reduce((a, r) => a + n$1(r.events), 0) + server;
				charge(gone * 2 + evGone * 2);
			}
			if (rows.length < 500) j.i++;
			await save();
			if (rows.length < 500 && !await reclose(j.days[j.i] ?? null)) break;
		}
		if ((j.status === "running" && j.i >= j.days.length || j.status === "cancelling") && !j.paused && await reclose(null)) {
			while (j.status === "running" && j.oi < j.old.length) {
				const day = j.old[j.oi];
				if (!room(0)) break;
				let gone = 0;
				gone += (await c.db.run(`DELETE FROM ca_rollup WHERE ${summaryWhere(ROLLUP_DIM_LIST)} AND day = ?`, [site, day])).changes;
				gone += (await c.db.run(`DELETE FROM ca_revenue_daily WHERE ${summaryWhere(REVENUE_DIM_LIST)} AND day = ?`, [site, day])).changes;
				gone += (await c.db.run("DELETE FROM ca_cube WHERE site = ? AND day = ?", [site, dayInt(day)])).changes;
				charge(gone);
				j.deleted.summaryRows += gone;
				j.deleted.oldDays++;
				j.oi++;
				await save();
			}
			if (!Object.keys(j.reclose).length && (j.status === "cancelling" || j.oi >= j.old.length)) j.status = j.status === "cancelling" ? "cancelled" : "done";
		}
	} catch (err) {
		if (!(err instanceof Budget)) {
			delete j.lease;
			await e.kv.set(KV_DELETE_JOB, j);
			throw err;
		}
	}
	delete j.lease;
	if (j.status === "done" || j.status === "cancelled") {
		j.finished = e.now;
		const log = await e.kv.get("delete:log") ?? [];
		const entry = {
			at: j.at,
			finished: e.now,
			by: j.by,
			site,
			summary: j.summary,
			status: j.status,
			deleted: j.deleted,
			skipped: j.skipped.length
		};
		await e.kv.set(KV_DELETE_LOG, [entry, ...log].slice(0, 10));
		await e.kv.delete(KV_DELETE_CANCEL);
	}
	await e.kv.set(KV_DELETE_JOB, j);
	if (j.utc.rows) await skv.set(KV_DELETE_ROWS, j.utc);
	clearReportCache();
	job = j;
	return job;
}
// src/routes/move-files.ts
/**
* Export and import of the analytics tables through the agent API, for the `ca-data` CLI (`scripts/ca-data.mjs`):
* `data/dump` (scope `data:export`) answers one chunk of a table as NDJSON, `data/load` (scope `data:import`) inserts
* one chunk with the idempotent insert of the data move. Both run on the chunk functions of `src/move/chunks.ts`.
* A chunk is 50 rows on the `small` profile and 500 otherwise, and an answer stays under 1.2 MB; the CLI asks for
* fewer rows after an answer cut by bytes and halves its chunk after a server error.
* On `small` with D1 a load counts its rows against the copy day of the data move (`src/move/day-budget.ts`) and
* answers 429 with `Retry-After` to 00:00 UTC when the day is used up.
*/
/** Upper bound of one dump answer and of one load body the CLI sends. */
const MAX_CHUNK_BYTES = 12e5;
/** Rows per dump when the call names no `limit`. */
const DATA_ROWS = {
	small: 50,
	standard: 500,
	dedicated: 500
};
function parse$1(schema, input) {
	const r = schema.safeParse(input ?? {});
	if (!r.success) throw new PluginRouteError("invalid_input", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ").slice(0, 500), 400);
	return r.data;
}
async function count(db, table, site) {
	const [r] = await db.all(`SELECT COUNT(*) AS n FROM ${table}${site === void 0 ? "" : " WHERE site = ?"}`, site === void 0 ? [] : [site]);
	return Number(r?.n ?? 0);
}
const INT = /^-?\d{1,19}$/;
const NUM = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
/** What a value of `kind` must be, or null when `v` is one (null is checked by the caller). */
function wrongKind(kind, v) {
	switch (kind) {
		case "int": return typeof v === "number" && Number.isSafeInteger(v) || typeof v === "string" && INT.test(v) ? null : "an integer";
		case "real": return typeof v === "number" && Number.isFinite(v) || typeof v === "string" && NUM.test(v) ? null : "a number";
		case "doc":
			if (typeof v !== "string" || v.length > 131072) return `JSON text of at most ${2 * MAX_DOC_BYTES} characters`;
			try {
				JSON.parse(v);
				return null;
			} catch {
				return `JSON text of at most ${2 * MAX_DOC_BYTES} characters`;
			}
		default: return typeof v === "string" && v.length <= 65536 ? null : `text of at most ${MAX_DOC_BYTES} characters`;
	}
}
/** A 400 naming the first column of `row` that `table` cannot store: unknown, a missing key, a wrong kind. */
function checkRow(table, row, i) {
	const { columns, key } = TABLE_SPECS[table];
	const bad = (m) => new PluginRouteError("invalid_row", `Row ${i}: ${m}`, 400);
	for (const k of Object.keys(row)) if (!columns.some((c) => c.name === k)) throw bad(`${table} has no column ${k.slice(0, 64)}.`);
	if (key.some((k) => row[k] === void 0 || row[k] === null)) throw bad(`lacks a key column of ${table}.`);
	if (!SITE_ID_RE.test(row.site)) throw bad("site must be 1 to 32 of a-z, 0-9 and -.");
	for (const c of columns) {
		const v = row[c.name];
		const want = v === void 0 || v === null ? null : wrongKind(c.kind, v);
		if (want) throw bad(`${c.name} must be ${want}.`);
	}
}
/** A 400 unless `cursor` is a key of `table`: its length and its integer columns. */
function checkCursor(table, cursor) {
	const { columns, key } = TABLE_SPECS[table];
	const kinds = new Map(columns.map((c) => [c.name, c.kind]));
	if (cursor.length !== key.length || key.some((k, i) => kinds.get(k) === "int" ? wrongKind("int", cursor[i]) : typeof cursor[i] !== "string")) throw new PluginRouteError("invalid_input", `cursor: ${table} needs a cursor of ${key.length} values (${key.join(", ")}), as x-next-cursor sent it.`, 400);
}
function dataFileHandlers(env) {
	const kvOf = (kv, site) => env.route?.kv(kv, site) ?? kv;
	const bindingOf = (site) => env.route?.binding(site) ?? null;
	return {
		"agent/v1/data/dump": { async POST({ ctx, keySites, site }) {
			const b = parse$1(DataDumpBody, ctx.input);
			if (b.cursor) checkCursor(b.table, b.cursor);
			const only = b.site !== void 0 || keySites.length ? site : void 0;
			const db = await env.db(site);
			const limit = b.limit ?? DATA_ROWS[(await env.settings()).capacityProfile];
			const chunk = await readChunk(db, b.table, b.cursor ?? null, limit, only, MAX_CHUNK_BYTES);
			const headers = {
				"content-type": "application/x-ndjson; charset=utf-8",
				"x-layout": String(SCHEMA_VERSION),
				"x-engine": db.dialect
			};
			if (chunk.next) headers["x-next-cursor"] = encodeURIComponent(JSON.stringify(chunk.next));
			if (!b.cursor) headers["x-total"] = String(await count(db, b.table, only));
			return {
				data: null,
				text: {
					value: chunk.rows.map((r) => `${JSON.stringify(r)}\n`).join(""),
					headers
				}
			};
		} },
		"agent/v1/data/load": { async POST({ ctx, keySites, site, now }) {
			const b = parse$1(DataLoadBody, ctx.input);
			if (b.layout !== SCHEMA_VERSION) throw new PluginRouteError("layout_mismatch", `The export has table layout ${b.layout}; this site uses layout ${SCHEMA_VERSION}. Import it into a plugin version with the same layout.`, 400);
			if (!b.rows.length) {
				const db = await env.db(site);
				await ensureSchemaOnce(db, ctx.kv);
				return { data: {
					layout: SCHEMA_VERSION,
					table: b.table,
					total: await count(db, b.table, b.site !== void 0 || keySites.length ? site : void 0)
				} };
			}
			const bySite = /* @__PURE__ */ new Map();
			for (const [i, row] of b.rows.entries()) {
				checkRow(b.table, row, i);
				const s = row.site;
				if (b.site !== void 0 && s !== b.site || keySites.length && !keySites.includes(s)) throw new PluginRouteError("site_not_allowed", `Row ${i} is of a site this call may not write.`, 400);
				const list = bySite.get(s) ?? [];
				list.push(row);
				bySite.set(s, list);
			}
			if (isActive(await ctx.kv.get("delete:job"))) throw new PluginRouteError("delete_running", "A delete is running on the Data page. Import when it has finished.", 409);
			const move = await ctx.kv.get(KV_MOVE_JOB);
			if (isMoving(move) && [...bySite.keys()].some((s) => bindingOf(s) === move.dest)) throw new PluginRouteError("move_running", "A data move into this database is running or paused. Import when it is done or cancelled.", 409);
			const profile = (await env.settings()).capacityProfile;
			const per = WRITE_ROWS[b.table] ?? 1;
			let inserted = 0;
			for (const [s, rows] of bySite) {
				const db = await env.db(s);
				const kv = dailyRowsApply(profile, db) ? kvOf(ctx.kv, s) : null;
				if (kv && rows.length * per > await copyRowsLeft(kv, now)) {
					const wait = nextUtcMidnight(now) - now;
					const body = {
						ok: false,
						error: "daily_limit",
						message: `The rows this database may take today on the Small profile are used up. Continue after 00:00 UTC (in ${wait} s).`
					};
					if (inserted) clearReportCache();
					return {
						data: null,
						text: {
							status: 429,
							value: JSON.stringify(body),
							headers: {
								"content-type": "application/json; charset=utf-8",
								"retry-after": String(wait)
							}
						}
					};
				}
				await ensureSchemaOnce(db, ctx.kv);
				const n = await writeChunk(db, b.table, rows);
				if (kv && n) await chargeCopyRows(kv, now, n * per);
				inserted += n;
			}
			if (inserted) clearReportCache();
			return { data: {
				table: b.table,
				inserted
			} };
		} }
	};
}
// src/agent/routes.ts
/**
* Agent API: public routes with their own auth from the `X-Api-Key` header. Every auth or
* scope failure is 404 with `{}` (no oracle). Responses are aggregates only, except the stored rows of `data/dump`
* (scope `data:export`, backups and moves); the routes declare no
* `cacheControl`, so the host sends `Cache-Control: private, no-store` (`plugins/http-route-dispatch.ts`).
*/
const send = (status, body, headers = {}) => pluginResponse({
	status,
	headers: {
		"content-type": "application/json; charset=utf-8",
		...headers
	},
	body: {
		kind: "text",
		value: JSON.stringify(body)
	}
});
const notFound = () => send(404, {});
const fail = (status, error, message) => send(status, {
	ok: false,
	error,
	message
});
var InputError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
	}
};
function parse(schema, input) {
	const r = schema.safeParse(input ?? {});
	if (!r.success) throw new InputError("invalid_input", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ").slice(0, 500));
	return r.data;
}
/** Range from query parameters, defaulting to the last `days` days with today; bounded like `query`. */
function range(input, today, days, schema = RangeParams) {
	const p = parse(schema, input);
	const to = p.to ?? today;
	const from = p.from ?? addDays(to, -(days - 1));
	if (from > to) throw new InputError("invalid_input", "from must not be after to");
	if (!((Date.parse(to) - Date.parse(from)) / 864e5 < 400)) throw new InputError("range_too_long", `The range is longer than 400 days.`);
	return {
		from,
		to
	};
}
/** Fields of `search:state:<source>` that agents may see; anything else the sync stores stays private. */
const SEARCH_STATE_FIELDS = [
	"lastRun",
	"status",
	"lastError"
];
const searchState = (v) => Object.fromEntries(SEARCH_STATE_FIELDS.flatMap((k) => {
	const x = v && typeof v === "object" ? v[k] : void 0;
	return x === void 0 || x !== null && typeof x === "object" ? [] : [[k, x]];
}));
/** Revenue results name their currency in the envelope `meta`. */
const reportOut = (r) => {
	const meta = {
		...r.meta,
		...typeof r.data.currency === "string" ? { currency: r.data.currency } : {}
	};
	return {
		data: r,
		from: r.range.from,
		to: r.range.to,
		truncated: !!r.data.truncated,
		...Object.keys(meta).length ? { meta } : {}
	};
};
function handlers(env) {
	return {
		...dataFileHandlers(env),
		"agent/v1/query": { async POST({ ctx, scopes, keySites, site }) {
			if (!scopes.includes("read:analytics") && !scopes.includes("read:search")) throw new ScopeError();
			const body = parse(AgentQueryBody, ctx.input);
			const bound = agentBounds(body);
			if (bound) throw new InputError(bound.error, bound.message);
			if (!requiredScopes(body).every((s) => scopes.includes(s))) throw new ScopeError();
			return reportOut(await answer(env, ctx, {
				...body,
				query: {
					...body.query,
					site
				},
				limit: body.limit ?? 100,
				allowedSites: keySites
			}));
		} },
		"agent/v1/reports": { GET: async () => ({ data: buildCatalog() }) },
		"agent/v1/summary": { async GET({ ctx, site, tz, now }) {
			const r = range(ctx.input, dayInZone(now, tz), 7, SummaryParams);
			const compare = parse(SummaryParams, ctx.input).compare ?? "previous";
			const ov = await answer(env, ctx, {
				report: "overview",
				query: {
					...r,
					site,
					filters: [],
					compare,
					granularity: "auto"
				}
			});
			const rev = await answer(env, ctx, {
				report: "revenue",
				query: {
					...r,
					site,
					filters: [],
					compare: "none",
					granularity: "auto"
				}
			});
			const list = Array.isArray(rev.data.currencies) ? rev.data.currencies : [];
			return reportOut({
				...ov,
				data: {
					...ov.data,
					revenue: list.map(({ currency, revenue, refunds, net_revenue, orders }) => ({
						currency,
						revenue,
						refunds,
						net_revenue,
						orders
					}))
				}
			});
		} },
		"agent/v1/status": { async GET({ ctx, site, now }) {
			parse(SiteParams, ctx.input);
			const s = await env.settings();
			const db = await env.db(site);
			const dkv = stateKv(ctx.kv, site);
			const [last] = await db.all("SELECT MAX(day) AS day FROM ca_sessions WHERE site = ?", [site]);
			return { data: {
				version: env.version,
				contract: 1,
				schema: await schemaVersion(db, ctx.kv),
				timezone: s.siteTimezone,
				lastHumanDay: last?.day == null ? null : isoDay(last.day),
				rawFrom: await rawFromDay(dkv, s, now),
				rollupWatermark: await dkv.get(KV_WATERMARK),
				drops: {
					days: 30,
					byReason: await dropCounts(db, site, dayInZone(now, s.siteTimezone), 30)
				},
				search: Object.fromEntries((await ctx.kv.list(`search:state:${site}:`)).map((e) => [e.key.slice(14 + site.length), searchState(e.value)]))
			} };
		} },
		"agent/v1/annotations": {
			async GET({ ctx, site, tz, now }) {
				const r = range(ctx.input, dayInZone(now, tz), 30, AnnotationParams);
				const p = parse(AnnotationParams, ctx.input);
				const loaded = await loadAnnotations(ctx.storage.annotations, site, r.from, r.to, tz);
				const filters = [];
				if (p.path) filters.push({
					dim: "page",
					op: "is",
					values: [p.path]
				});
				if (p.host) filters.push({
					dim: "host",
					op: "is",
					values: [p.host]
				});
				if (p.query) filters.push({
					dim: "query",
					op: "is",
					values: [p.query]
				});
				return {
					data: { items: (filters.length ? matchAnnotations(loaded.items, {
						site,
						...r,
						tz,
						target: p.query ? "search" : "traffic",
						filters
					}) : loaded.items).filter((a) => !p.q || annotationSearchMatches(a, p.q)).map((a) => ({
						...annotationView(a, tz),
						target: a.target ?? null
					})).sort((a, b) => b.ts - a.ts) },
					...r,
					truncated: loaded.truncated
				};
			},
			async POST({ ctx, site, now }) {
				const body = parse(AnnotationBody, ctx.input);
				if (!ctx.storage.annotations) throw new PluginRouteError("storage_unavailable", "The annotations collection is not available.", 500);
				const scope = scopeInput(body.path, body.scope);
				if (scope === null) throw new InputError("scope_conflict", "Send either path or scope, not both.");
				const item = {
					site,
					ts: body.ts ?? now,
					kind: body.kind,
					text: body.text,
					...scope ? { scope } : {},
					...body.target ? { target: body.target } : {}
				};
				const id = randomId(16);
				await ctx.storage.annotations.put(id, item);
				return { data: {
					id,
					...item,
					summary: scopeSummary(scope)
				} };
			}
		},
		"agent/v1/search/sync": { async POST({ ctx, site }) {
			const body = parse(SearchSyncBody, ctx.input);
			if (!env.search) throw new InputError("search_unavailable", "No Search source can sync on this site.");
			return { data: await env.search.sync(ctx, {
				...body,
				site
			}) };
		} },
		"agent/v1/search/backfill": { async POST({ ctx, site }) {
			const body = parse(BackfillBody, ctx.input);
			if (!env.search) throw new InputError("search_unavailable", "No Search source can sync on this site.");
			return { data: await env.search.backfill(ctx, {
				...body,
				site
			}) };
		} },
		"agent/v1/dashboards": { async GET({ ctx, keySites }) {
			const p = parse(SiteParams, ctx.input);
			const s = await env.settings();
			const all = [s.siteId, ...(await registry(ctx.storage.sites)).sites.map((c) => c.id)];
			const sites = p.site ? [(await bindSite(p.site, s.siteId, ctx.storage.sites)).id] : keySites.length ? all.filter((x) => keySites.includes(x)) : all;
			const items = [];
			for (const site of sites) items.push(...(await listDashboards(dashColl(ctx), site)).map(withoutEmail));
			return { data: { items } };
		} },
		"agent/v1/dashboards/data": { async POST({ ctx, scopes, site, tz, now }) {
			const body = parse(DashboardDataBody, ctx.input);
			const d = await dashboard(ctx, site, body.id);
			if (d.tiles.some(tileNeedsSearch) && !scopes.includes("read:search")) throw new ScopeError();
			const run = await runDashboard({
				site,
				tz,
				now,
				dispatch: (b, a) => answer(env, ctx, b, a),
				loadAnnotations: (r) => loadAnnotations(ctx.storage.annotations, site, r.from, r.to, tz),
				segmentExists: async (id) => (await ctx.storage.segments?.get(id))?.site === site
			}, d, {
				...body.range ? { range: body.range } : {},
				...body.compare ? { compare: body.compare } : {},
				annotations: true
			});
			return {
				data: {
					id: d.id,
					name: d.name,
					...run
				},
				...run.range
			};
		} },
		"agent/v1/dashboards/save": { async POST({ ctx, site, now }) {
			const body = parse(DashboardSaveBody, ctx.input);
			return { data: withoutEmail(await saveDashboard(dashColl(ctx), site, body.dashboard, now).catch(typedDash)) };
		} },
		"agent/v1/dashboards/delete": { async POST({ ctx, site }) {
			const body = parse(DashboardDeleteBody, ctx.input);
			if (!await deleteDashboard(dashColl(ctx), site, body.id)) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
			if (ctx.storage.shares) await deleteSharesOf(ctx.storage.shares, site, body.id);
			return { data: {
				id: body.id,
				deleted: true
			} };
		} },
		"agent/v1/events": { async POST({ ctx, site, now }) {
			const body = EventsBody.safeParse(ctx.input ?? {});
			if (!body.success) throw new InputError("invalid_body", "Send an object with an events array of 1 to 20 items.");
			const settings = await env.settings();
			const db = await env.db(site);
			const bound = await bindSite(site, settings.siteId, ctx.storage.sites);
			return { data: await recordAgentEvents({
				db,
				kv: stateKv(ctx.kv, site),
				settings,
				now,
				site,
				...bound.client ? { client: bound.client } : {},
				ready: () => ensureSchemaOnce(db, ctx.kv)
			}, site, body.data.events) };
		} },
		"agent/v1/openapi.json": { GET: async () => ({
			data: buildOpenApi(env.version),
			raw: true
		}) }
	};
}
var ScopeError = class extends Error {};
const typedDash = (err) => {
	if (err instanceof DashboardError) throw new InputError(err.code, err.message);
	throw err;
};
function dashColl(ctx) {
	if (!ctx.storage.dashboards) throw new PluginRouteError("storage_unavailable", "The dashboards collection is not available.", 500);
	return ctx.storage.dashboards;
}
async function dashboard(ctx, site, id) {
	const d = await getDashboard(dashColl(ctx), site, id).catch(typedDash);
	if (!d) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
	return d;
}
/** The `site` of a request: `query.site` of a query body, else a top-level `site` (body or query string). */
function requestedSite(input) {
	if (!input || typeof input !== "object") return void 0;
	const i = input;
	const v = i.query && typeof i.query === "object" && "site" in i.query ? i.query.site : i.site;
	return typeof v === "string" && v ? v : void 0;
}
/** Host route definitions keyed by route name. */
function agentRoutes(env) {
	const table = handlers(env);
	const routes = {};
	for (const [name, byMethod] of Object.entries(table)) {
		const declared = ENDPOINTS.filter((e) => e.name === name);
		routes[name] = {
			public: true,
			methods: declared.map((e) => e.method),
			response: "raw",
			async handler(ctx) {
				const method = ctx.request.method.toUpperCase();
				const e = declared.find((d) => d.method === method);
				const run = byMethod[method];
				const now = env.now?.() ?? Math.floor(Date.now() / 1e3);
				const key = e && run && ctx.storage.api_keys ? await verifyKey(ctx.storage.api_keys, ctx.request.headers.get("x-api-key"), now) : null;
				if (!e || !run || !key) return notFound();
				const s = await env.settings();
				const wait = env.limiter(key.id, s.agentRateLimitPerMinute, now * 1e3);
				if (wait) return send(429, {
					ok: false,
					error: "rate_limited",
					message: `More than ${s.agentRateLimitPerMinute} requests per minute.`
				}, { "retry-after": String(wait) });
				if (e.scope && name !== "agent/v1/query" && !key.scopes.includes(e.scope)) return notFound();
				if (name === "agent/v1/query" && !key.scopes.includes("read:analytics") && !key.scopes.includes("read:search")) return notFound();
				const requested = requestedSite(ctx.input) ?? s.siteId;
				if (!(name === "agent/v1/reports" || name === "agent/v1/openapi.json" || name === "agent/v1/dashboards" && !requestedSite(ctx.input)) && key.sites.length && !key.sites.includes(requested)) return notFound();
				try {
					if (env.remoteIds?.().includes(requested)) throw new InputError("site_not_allowed", "The agent API serves the sites of this database only; ask the connected site itself.");
					const site = (await bindSite(requested, s.siteId, ctx.storage.sites)).id;
					const out = await run({
						ctx,
						scopes: key.scopes,
						keySites: key.sites,
						site,
						tz: s.siteTimezone,
						now
					});
					if (out.raw) return send(200, out.data);
					if (out.text) return pluginResponse({
						status: out.text.status ?? 200,
						headers: out.text.headers,
						body: {
							kind: "text",
							value: out.text.value
						}
					});
					return send(200, {
						ok: true,
						data: out.data,
						meta: {
							site,
							from: out.from ?? null,
							to: out.to ?? null,
							generatedAt: (/* @__PURE__ */ new Date(now * 1e3)).toISOString(),
							truncated: out.truncated ?? false,
							...out.meta
						}
					});
				} catch (err) {
					if (err instanceof ScopeError) return notFound();
					if (err instanceof InputError) return fail(400, err.code, err.message);
					if (err instanceof PluginRouteError) return fail(err.status, err.code, err.message);
					throw err;
				}
			}
		};
	}
	return routes;
}
// src/keys/ratelimit.ts
/** Per key, per isolate sliding window: approximate across isolates, documented in AGENTS.md. */
function createRateLimiter(windowMs = 6e4) {
	const hits = /* @__PURE__ */ new Map();
	/** Records one request; returns 0 when allowed, else the seconds until a slot frees up. */
	return (id, limit, nowMs = Date.now()) => {
		const list = (hits.get(id) ?? []).filter((t) => t > nowMs - windowMs);
		if (list.length >= limit) {
			hits.set(id, list);
			return Math.max(1, Math.ceil((list[0] + windowMs - nowMs) / 1e3));
		}
		list.push(nowMs);
		hits.set(id, list);
		return 0;
	};
}
const SEEN_CACHE_MS = 6e4;
let seenCache;
async function middlewareSeen(kv, now) {
	const live = middlewareLiveAt();
	if (live !== void 0 && now - live < 864e5) return true;
	if (!seenCache || now - seenCache.at >= SEEN_CACHE_MS) {
		const v = await kv.get(MW_SEEN_KEY);
		seenCache = {
			value: typeof v === "number" ? v : null,
			at: now
		};
	}
	return seenCache.value !== null && now - seenCache.value < 864e5;
}
/**
* `page:fragments` output: one script element at `head`, identical for every request and
* user agent. Without a live middleware the page gets the same code inline, pointed at the direct
* plugin route (a plugin route cannot serve JavaScript). UA-dependent output only with the opt-in
* `scriptForBots = skip_known_bots`.
*/
async function pageFragments(s, kv, now = Date.now()) {
	if (!s.injectScript) return null;
	if (s.scriptForBots === "skip_known_bots" && currentAudience() === "robot") return null;
	const alias = await middlewareSeen(kv, now);
	if (s.scriptDelivery === "inline" || !alias) return [{
		kind: "inline-script",
		placement: "head",
		code: scriptBody(s, alias, await linkedHostsOf(kv, now)),
		key: PLUGIN_ID
	}];
	return [{
		kind: "external-script",
		placement: "head",
		src: s.scriptPath,
		defer: true,
		key: PLUGIN_ID
	}];
}
// src/agents/lines.ts
/**
* Text form of your user agent rules, one rule per line: `action mode pattern # comment`.
* Shared by the admin editor (local check) and the bulk route (server check), so both report the same lines.
*/
const RULE_MODES = [
	"contains",
	"prefix",
	"exact",
	"regex"
];
const MAX_NAME = 64;
/** Current browser user agents that no `bot` rule should match (the same list as `scripts/build-agent-data.mjs`). */
const BROWSER_UAS = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
	"Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
	"Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0]"
];
const RULE_TEXT = {
	example: [
		"# action mode pattern # optional comment",
		"bot contains examplemonitor # Uptime monitor",
		"bot prefix examplefetcher/",
		"human contains exampleapp # Our own app",
		"bot regex ^examplebot/\\d+$"
	].join("\n"),
	shape: "Write action, mode and pattern, for example: bot contains examplebot",
	action: (a) => `Unknown action "${a}": use bot or human.`,
	mode: (m) => `Unknown mode "${m}": use contains, prefix, exact or regex.`,
	long: `Pattern longer than 512 characters.`,
	name: `Comment longer than ${MAX_NAME} characters (it is kept as the rule name).`,
	regex: (e) => `Unsafe or invalid regex: ${e}`,
	duplicate: (n) => `Same mode and pattern as line ${n}.`,
	total: `At most 500 rules in total; this line is rule 501.`,
	regexCap: `At most 50 regex rules; this line is regex rule 51.`,
	browser: "This bot rule matches a current browser user agent, so real visitors would be excluded.",
	order: "This new rule is stored after the rules you keep, so a kept rule on a later line still wins when both match.",
	hash: "A pattern cannot hold a space, # and a space: the text view reads that as the start of a comment.",
	same: "A rule with the same mode and pattern exists."
};
/** Mode and pattern, as rules are matched (regex patterns keep their case). */
const ruleKey = (r) => `${r.mode} ${r.mode === "regex" ? r.pattern : r.pattern.toLowerCase()}`;
const toUser = (r) => ({
	pattern: r.pattern,
	mode: r.mode,
	action: r.action
});
/** Parse the text; every error and warning carries its 1-based line number. */
function parseRuleLines(text) {
	const out = {
		rules: [],
		errors: []
	};
	const seen = /* @__PURE__ */ new Map();
	let regex = 0;
	text.split(/\r?\n/).forEach((raw, i) => {
		const line = i + 1;
		let s = raw.trim();
		if (!s || s.startsWith("#")) return;
		let name;
		const c = s.indexOf(" # ");
		if (c >= 0) {
			name = s.slice(c + 3).trim() || void 0;
			s = s.slice(0, c).trim();
		}
		const m = /^(\S+)\s+(\S+)\s+(.+)$/.exec(s);
		const err = (message) => out.errors.push({
			line,
			message
		});
		if (!m) return void err(RULE_TEXT.shape);
		const [, action = "", mode = "", pattern = ""] = m;
		const before = out.errors.length;
		if (action !== "bot" && action !== "human") err(RULE_TEXT.action(action));
		if (!RULE_MODES.includes(mode)) err(RULE_TEXT.mode(mode));
		if (pattern.length > 512) err(RULE_TEXT.long);
		if (name && name.length > MAX_NAME) err(RULE_TEXT.name);
		if (mode === "regex") {
			const v = validateSafeRegex(pattern, "i");
			if (!v.ok) err(RULE_TEXT.regex(v.error));
		}
		const key = ruleKey({
			mode,
			pattern
		});
		const first = seen.get(key);
		if (first) err(RULE_TEXT.duplicate(first));
		else seen.set(key, line);
		if (out.errors.length > before) return;
		const rule = {
			action: action === "human" ? "human" : "robot",
			mode,
			pattern,
			...name ? { name } : {}
		};
		if (out.rules.length === 500) err(RULE_TEXT.total);
		if (mode === "regex" && ++regex === 51) err(RULE_TEXT.regexCap);
		out.rules.push({
			...rule,
			line
		});
	});
	return out;
}
/** Bot rules that match a current browser user agent, as the data generator refuses them (server side: keeps the list out of the admin). */
function browserWarnings(rules) {
	return rules.filter((rule) => {
		if (rule.action !== "robot") return false;
		const one = compileUserRules([toUser(rule)]);
		return BROWSER_UAS.some((raw) => {
			const ua = raw.toLowerCase();
			return rule.mode === "regex" ? one.regex.some((r) => r.test(ua)) : one.plain(ua) !== void 0;
		});
	}).map((r) => ({
		line: r.line,
		message: RULE_TEXT.browser
	}));
}
/**
* Added lines above a kept one: a save stores new rules after the rules it keeps, whatever their line,
* so the kept rule below still wins when both match.
*/
function orderWarnings(rules, stored) {
	const kept = new Set(stored.map(ruleKey));
	let last = -1;
	rules.forEach((r, i) => kept.has(ruleKey(r)) && (last = i));
	return rules.flatMap((r, i) => i < last && !kept.has(ruleKey(r)) ? [{
		line: r.line,
		message: RULE_TEXT.order
	}] : []);
}
/** One rule as a line of text. */
const formatRule = (r) => `${r.action === "human" ? "human" : "bot"} ${r.mode} ${r.pattern}${r.name ? ` # ${r.name}` : ""}`;
/** What a save of `next` changes on the stored rows, matched by mode and pattern; a second stored row with the same key is removed. */
function diffRules(current, next) {
	const byKey = /* @__PURE__ */ new Map();
	const removed = [];
	for (const row of current) {
		const k = ruleKey(row.data);
		if (byKey.has(k)) removed.push(row);
		else byKey.set(k, row);
	}
	const diff = {
		added: [],
		changed: [],
		removed,
		unchanged: 0
	};
	for (const r of next) {
		const k = ruleKey(r);
		const row = byKey.get(k);
		if (!row) diff.added.push(r);
		else if (row.data.action !== r.action || (row.data.name ?? "") !== (r.name ?? "") || row.data.pattern !== r.pattern) diff.changed.push({
			id: row.id,
			from: row.data,
			to: r
		});
		else diff.unchanged++;
		byKey.delete(k);
	}
	diff.removed.push(...byKey.values());
	return diff;
}
const META = /* @__PURE__ */ new Set([..."^$.*+?()[]{}|\\"]);
/**
* The plain rule that overrides a built-in entry: its `contains` pattern, or a regex that is a literal
* (escaped punctuation and `[xX]` case pairs allowed), as `contains` or, with a leading `^`, as `prefix`.
* Null for a real pattern, which only a rule written for the exact user agent can override.
*/
function builtinOverride(match) {
	if (match.mode === "contains") return {
		mode: "contains",
		pattern: match.pattern
	};
	let s = match.pattern.replace(/\[([a-zA-Z])([a-zA-Z])\]/g, (all, a, b) => a.toLowerCase() === b.toLowerCase() ? a : all);
	const anchored = s.startsWith("^");
	if (anchored) s = s.slice(1);
	let lit = "";
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === "\\") {
			const next = s[i + 1];
			if (next === void 0 || /[a-zA-Z0-9]/.test(next)) return null;
			lit += next;
			i++;
		} else if (META.has(ch)) return null;
		else lit += ch;
	}
	lit = lit.toLowerCase();
	return lit.trim() ? {
		mode: anchored ? "prefix" : "contains",
		pattern: lit
	} : null;
}
// src/routes/config.ts
/**
* Config routes: `config/<collection>/list|save|delete` over the plugin
* storage collections, all `plugins:manage`. Every regex is checked
* with the safe regex validator at save time.
*/
const safeRegex = (p) => validateSafeRegex(p, "i").ok;
const regexMsg = (p) => {
	const v = validateSafeRegex(p, "i");
	return v.ok ? "" : `Unsafe or invalid regex: ${v.error}`;
};
const SafeRegex = z.string().min(1).max(200).superRefine((p, ctx) => {
	if (!safeRegex(p)) ctx.addIssue({
		code: "custom",
		message: regexMsg(p)
	});
});
const GoalItem = GoalSchema.superRefine((g, ctx) => {
	if (g.match === "regex" && !safeRegex(g.value)) ctx.addIssue({
		code: "custom",
		path: ["value"],
		message: regexMsg(g.value)
	});
});
const FunnelItem = z.object({
	name: z.string().min(1).max(64),
	steps: FunnelStepsSchema,
	mode: z.enum(FUNNEL_MODES).default("sequential")
}).strict().superRefine((f, ctx) => {
	f.steps.forEach((s, i) => {
		if (s.match === "regex" && !safeRegex(s.value)) ctx.addIssue({
			code: "custom",
			path: [
				"steps",
				i,
				"value"
			],
			message: regexMsg(s.value)
		});
	});
});
const SegmentItem = z.object({
	name: z.string().min(1).max(64),
	filters: z.array(FilterSchema).min(1).max(20)
}).strict().superRefine((s, ctx) => {
	s.filters.forEach((f, i) => {
		if (f.op !== "regex" && f.op !== "not_regex") return;
		for (const v of f.values) if (!safeRegex(v)) ctx.addIssue({
			code: "custom",
			path: [
				"filters",
				i,
				"values"
			],
			message: regexMsg(v)
		});
	});
});
const HostList = z.enum([
	"search",
	"social",
	"video",
	"shopping",
	"ai",
	"webmail",
	"ignore"
]);
const ChannelCondition = z.object({
	list: HostList,
	refList: HostList,
	medium: SafeRegex,
	source: SafeRegex,
	campaign: SafeRegex,
	mediumIn: z.array(z.string().min(1).max(64)).max(50),
	sourceIn: z.array(z.string().min(1).max(64)).max(50),
	click: z.array(z.enum(CLICK_IDS)).min(1),
	adsSource: HostList,
	referrer: z.literal(true),
	utm: z.literal(true),
	direct: z.literal(true)
}).partial().strict().refine((c) => Object.keys(c).length > 0, { message: "A condition needs at least one test." });
const BUILTIN_IDS = BUILTIN_CHANNEL_RULES.map((r) => r.id);
/** A user rule at any priority, or the switch-off of one built-in rule (built-ins are disable-only). */
const ChannelRuleItem = z.union([z.object({
	channel: z.string().min(1).max(64),
	any: z.array(ChannelCondition).min(1).max(10),
	priority: z.number().int().min(-1e3).max(1e4),
	enabled: z.boolean().optional()
}).strict(), z.object({ disables: z.enum(BUILTIN_IDS) }).strict()]);
const AgentRuleItem = z.object({
	pattern: z.string().trim().min(1).max(512).refine((p) => !p.includes(" # "), RULE_TEXT.hash),
	mode: z.enum([
		"contains",
		"prefix",
		"exact",
		"regex"
	]),
	action: z.enum(["robot", "human"]),
	name: z.string().max(64).optional(),
	category: z.enum(AGENT_CATEGORIES).optional(),
	priority: z.number().int().min(0).max(1e4).optional(),
	enabled: z.boolean().optional()
}).strict().superRefine((r, ctx) => {
	if (r.mode === "regex" && !safeRegex(r.pattern)) ctx.addIssue({
		code: "custom",
		path: ["pattern"],
		message: regexMsg(r.pattern)
	});
});
const AnnotationItem = z.object({
	ts: z.number().int().min(0),
	kind: z.enum([
		"manual",
		"publish",
		"update",
		"release"
	]),
	text: z.string().min(1).max(200),
	/** Input shortcut for one path `is` rule; never stored. */
	path: PathShortcut.nullish(),
	scope: ScopeSchema.optional(),
	/** The KPI the Annotations page measures; absent means the default (visitors of the scope). */
	target: TargetSchema.optional(),
	slug: z.string().max(256).optional(),
	collection: z.string().max(64).optional(),
	ref: z.string().max(128).optional()
}).strict();
/** Stored form of an annotation: the `path` shortcut becomes the scope, `path` with `scope` is a conflict. */
function annotationRecord(data) {
	const { path, scope: input, ...rest } = data;
	const scope = scopeInput(path, input);
	if (scope === null) throw new PluginRouteError("scope_conflict", "Send either path or scope, not both.", 400);
	return {
		...rest,
		...scope ? { scope } : {}
	};
}
const CONFIG_SCHEMAS = {
	goals: GoalItem,
	funnels: FunnelItem,
	segments: SegmentItem,
	channel_rules: ChannelRuleItem,
	agent_rules: AgentRuleItem,
	annotations: AnnotationItem
};
const CONFIG_COLLECTIONS = Object.keys(CONFIG_SCHEMAS);
const Id$2 = z.string().regex(/^[A-Za-z0-9:._-]{1,128}$/);
const Day$3 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** `from` and `to` (annotations only): the newest 500 of that range, normalized, with `truncated`. */
const ListBody$1 = z.object({
	cursor: z.string().max(512).optional(),
	limit: z.number().int().min(1).max(100).optional(),
	site: SiteField,
	from: Day$3.optional(),
	to: Day$3.optional()
}).strict();
const DeleteBody$1 = z.object({
	id: Id$2,
	site: SiteField
}).strict();
const saveBody = (c) => z.object({
	id: Id$2.optional(),
	data: CONFIG_SCHEMAS[c],
	site: SiteField
}).strict();
/** The bound site of a config call: the body `site` when it is local or registered, else the local site. */
const siteFor = async (env, ctx, site) => (await bindSite(site, (await env.settings()).siteId, ctx.storage.sites)).id;
/** User agent rules are one set for every install (the classifier runs before any site is known): stored under the local site, read without a site filter. */
const siteOfColl = (c, env, ctx, site) => c === "agent_rules" ? env.settings().then((s) => s.siteId) : siteFor(env, ctx, site);
const siteOf = (v) => v && typeof v === "object" ? v.site : void 0;
/** A stored item belongs to the bound site; every user agent rule belongs to the install, whatever siteId it was saved under. */
const owns = (c, v, siteId) => c === "agent_rules" || siteOf(v) === siteId;
function coll$2(ctx, c) {
	const s = ctx.storage[c];
	if (!s) throw new PluginRouteError("storage_unavailable", `The ${c} collection is not available.`, 500);
	return s;
}
/** Every stored user agent rule of the install, in the order the classifier applies them (oldest first); no site filter, like the loader. */
async function agentRuleRows(store) {
	const rows = [];
	let cursor;
	for (let i = 0; i < 10; i++) {
		const page = await store.query({
			limit: 100,
			...cursor ? { cursor } : {}
		});
		rows.push(...page.items.map((it) => ({
			id: it.id,
			data: it.data
		})));
		if (!page.hasMore || !page.cursor) break;
		cursor = page.cursor;
	}
	return rows;
}
/** Refuse a single save that would pass the total or the regex cap, or repeat the mode and pattern of another rule. */
async function checkRuleCaps(store, rule, exceptId) {
	const { mode } = rule;
	const rows = (await agentRuleRows(store)).filter((r) => r.id !== exceptId);
	if (rows.some((r) => ruleKey(r.data) === ruleKey(rule))) throw new PluginRouteError("duplicate_rule", RULE_TEXT.same, 400);
	if (rows.length >= 500) throw new PluginRouteError("too_many_rules", `At most 500 user agent rules in total.`, 400);
	if (mode === "regex" && rows.filter((r) => r.data.mode === "regex").length >= 50) throw new PluginRouteError("too_many_rules", `At most 50 regex user agent rules.`, 400);
}
/** Copy the whole rule set (`rows`, as stored) to the options key the middleware reads, then drop the isolate caches. */
async function rulesChanged(env, ctx, rows) {
	await ctx.kv?.set(AGENT_RULES_KEY, rows.map((r) => {
		const { site: _s, ...rule } = r.data;
		return rule;
	}));
	env.changed?.("agent_rules");
}
/** Bulk body: the whole rule set as text; `check` validates and diffs without writing. */
const BulkRulesBody = z.object({
	text: z.string().max(35e4),
	check: z.boolean().optional()
}).strict();
const BuiltinBody = z.object({
	q: z.string().max(200).optional(),
	category: z.enum(AGENT_CATEGORIES).optional(),
	page: z.number().int().min(0).max(100).optional()
}).strict();
/** The rule routes beyond list, save and delete: the whole set as text, and the read-only built-in list. */
function agentRuleRoutes(env) {
	return {
		"config/agent_rules/bulk": {
			permission: "plugins:manage",
			input: BulkRulesBody,
			async handler(ctx) {
				const body = BulkRulesBody.parse(ctx.input);
				const site = (await env.settings()).siteId;
				const store = coll$2(ctx, "agent_rules");
				const parsed = parseRuleLines(body.text);
				const errors = [...parsed.errors];
				for (const r of parsed.rules) {
					const v = AgentRuleItem.safeParse({
						pattern: r.pattern,
						mode: r.mode,
						action: r.action,
						...r.name ? { name: r.name } : {}
					});
					if (!v.success) errors.push({
						line: r.line,
						message: v.error.issues[0]?.message ?? "Invalid rule."
					});
				}
				errors.sort((a, b) => a.line - b.line);
				const stored = await agentRuleRows(store);
				const diff = diffRules(stored, parsed.rules.map(({ line: _l, ...r }) => r));
				const summary = {
					errors,
					warnings: [...browserWarnings(parsed.rules), ...orderWarnings(parsed.rules, stored.map((r) => r.data))].sort((a, b) => a.line - b.line),
					total: parsed.rules.length,
					added: diff.added.map(formatRule),
					changed: diff.changed.map((c) => ({
						from: formatRule(c.from),
						to: formatRule(c.to)
					})),
					removed: diff.removed.map((r) => formatRule(r.data)),
					unchanged: diff.unchanged
				};
				if (body.check) return {
					...summary,
					written: 0
				};
				const first = errors[0];
				if (first) throw new PluginRouteError("invalid_rules", `Line ${first.line}: ${first.message} Nothing was saved.`, 400);
				const merged = (from, to) => {
					const { name: _n, category, ...rest } = from;
					return {
						...rest,
						...to,
						...to.action === "robot" && category ? { category } : {},
						site
					};
				};
				const stamp = Date.now().toString(36);
				const puts = [...diff.changed.map((c) => ({
					id: c.id,
					data: merged(c.from, c.to)
				})), ...diff.added.map((r, i) => ({
					id: `${stamp}-${String(i).padStart(3, "0")}-${randomId(8)}`,
					data: {
						...r,
						site
					}
				}))];
				const dels = diff.removed.map((r) => r.id);
				if (!store.putMany || !store.deleteMany) throw new PluginRouteError("storage_unavailable", "Bulk writes are not available.", 500);
				const putsNow = puts.slice(0, 30);
				const delsNow = dels.slice(0, 30 - putsNow.length);
				if (putsNow.length) await store.putMany(putsNow);
				if (delsNow.length) await store.deleteMany(delsNow);
				const written = putsNow.length + delsNow.length;
				const rows = new Map(stored.map((r) => [r.id, r.data]));
				for (const id of delsNow) rows.delete(id);
				for (const r of putsNow) rows.set(r.id, r.data);
				await rulesChanged(env, ctx, [...rows].map(([id, data]) => ({
					id,
					data
				})));
				return {
					...summary,
					written,
					remaining: puts.length + dels.length - written
				};
			}
		},
		"config/agent_rules/builtin": {
			permission: "plugins:manage",
			input: BuiltinBody,
			async handler(ctx) {
				const { q, category, page = 0 } = BuiltinBody.parse(ctx.input ?? {});
				const needle = q?.trim().toLowerCase();
				const hits = AGENTS.filter((a) => (!category || a.category === category) && (!needle || a.name.toLowerCase().includes(needle) || a.match.pattern.toLowerCase().includes(needle) || a.operator.toLowerCase().includes(needle)));
				return {
					total: hits.length,
					page,
					pageSize: 50,
					items: hits.slice(page * 50, (page + 1) * 50).map((a) => ({
						id: a.id,
						name: a.name,
						category: a.category,
						source: a.source,
						mode: a.match.mode,
						pattern: a.match.pattern,
						override: builtinOverride(a.match)
					}))
				};
			}
		}
	};
}
/** The three routes of one collection, keyed by route name. */
function configRoutes(env) {
	const routes = {};
	for (const c of CONFIG_COLLECTIONS) {
		const SaveBody = saveBody(c);
		routes[`config/${c}/list`] = {
			permission: "plugins:manage",
			input: ListBody$1,
			async handler(ctx) {
				const body = ListBody$1.parse(ctx.input ?? {});
				const siteId = await siteOfColl(c, env, ctx, body.site);
				if (c === "annotations" && body.from && body.to) {
					const tz = (await env.settings()).siteTimezone ?? "UTC";
					const r = await loadAnnotations(coll$2(ctx, c), siteId, body.from, body.to, tz);
					return {
						items: r.items.map(({ id, ...data }) => ({
							id,
							data
						})),
						cursor: null,
						truncated: r.truncated
					};
				}
				const page = await coll$2(ctx, c).query({
					...c === "agent_rules" ? {} : { where: { site: siteId } },
					limit: body.limit ?? 100,
					...body.cursor ? { cursor: body.cursor } : {}
				});
				return {
					items: c === "annotations" ? page.items.map((it) => ({
						id: it.id,
						data: normalizeAnnotation(it.data) ?? it.data
					})) : page.items,
					cursor: page.hasMore ? page.cursor ?? null : null
				};
			}
		};
		routes[`config/${c}/save`] = {
			permission: "plugins:manage",
			input: SaveBody,
			async handler(ctx) {
				const body = SaveBody.parse(ctx.input);
				const siteId = await siteOfColl(c, env, ctx, body.site);
				const store = coll$2(ctx, c);
				const id = body.id ?? randomId(16);
				if (body.id) {
					const cur = await store.get(body.id);
					if (cur && !owns(c, cur, siteId)) throw new PluginRouteError("not_found", "Unknown item.", 404);
				}
				const data = c === "annotations" ? annotationRecord(body.data) : body.data;
				if (c === "agent_rules") await checkRuleCaps(store, data, body.id);
				const item = {
					...data,
					site: siteId
				};
				await store.put(id, item);
				if (c === "agent_rules") await rulesChanged(env, ctx, await agentRuleRows(store));
				else env.changed?.(c);
				return {
					id,
					data: item
				};
			}
		};
		routes[`config/${c}/delete`] = {
			permission: "plugins:manage",
			input: DeleteBody$1,
			async handler(ctx) {
				const { id, site } = DeleteBody$1.parse(ctx.input);
				const siteId = await siteOfColl(c, env, ctx, site);
				const store = coll$2(ctx, c);
				const cur = await store.get(id);
				if (!cur || !owns(c, cur, siteId)) throw new PluginRouteError("not_found", "Unknown item.", 404);
				await store.delete(id);
				if (c === "agent_rules") await rulesChanged(env, ctx, await agentRuleRows(store));
				else env.changed?.(c);
				return {
					id,
					deleted: true
				};
			}
		};
	}
	Object.assign(routes, agentRuleRoutes(env));
	return routes;
}
// src/annotations/hook.ts
/**
* Automatic annotations from the content lifecycle hooks: one per item, kind and day,
* scoped to the item's public path when the host can resolve it, else site-wide with `slug` and
* `collection` so the editor can set the path by hand. The Annotations settings decide which hooks annotate, and a
* per-day cap kept in the plugin KV stops a bulk import from flooding the charts.
*/
/** Today's automatic annotation ids in the site timezone: one KV read and at most one write per hook. */
const KV_AUTO_ANNOTATIONS = "annotations:auto";
async function annotate(ctx, kind, content, collection, s, ts = Math.floor(Date.now() / 1e3)) {
	const id = typeof content.id === "string" ? content.id : null;
	if (!id || !s.autoAnnotations || !(kind === "publish" ? s.annotatePublish : s.annotateUpdate)) return;
	if (s.annotateCollections.length && !s.annotateCollections.includes(collection)) return;
	const day = dayInZone(ts, s.siteTimezone);
	const key = `${kind}:${collection}:${id}:${day}`;
	const prev = await ctx.kv.get(KV_AUTO_ANNOTATIONS);
	const ids = prev?.day === day ? prev.ids : [];
	const repeat = ids.includes(key);
	if (!repeat && ids.length >= s.autoAnnotationsPerDay) return;
	const path = await derivePath(ctx, collection, content);
	if (!path && ctx.site?.url) return;
	if (!repeat) await ctx.kv.set(KV_AUTO_ANNOTATIONS, {
		day,
		ids: [...ids, key]
	});
	const data = content.data ?? {};
	const slug = typeof content.slug === "string" ? content.slug : void 0;
	const title = typeof data.title === "string" ? data.title : slug ?? id;
	const scope = path ? {
		v: 1,
		path: [{
			op: "is",
			value: path
		}]
	} : void 0;
	await ctx.storage.annotations?.put(key, {
		site: s.siteId,
		ts,
		kind,
		text: title.slice(0, 200),
		...scope ? { scope } : {},
		...slug ? { slug: slug.slice(0, 256) } : {},
		collection,
		ref: id
	});
}
// src/sources/gsc.ts
/**
* Google Search Console source: `searchAnalytics/query` per window of days for the grains
* totals (`date`), `page`, `query`, `page` with `query` (capped at `searchMaxRowsPerDay` per day), `country`
* and `device`; a window of several days adds the `date` dimension, so one call returns every day of it
* (Google: "date" is a valid dimension; cost grows with the range, hence the adaptive window of the sync);
* `type: web`; `startRow` paging at 25000 rows. `dataState: all` includes the fresh days
* that the sync marks provisional and re-pulls. Positions are stored as `pos_sum = position * impressions`.
*/
const GSC_PAGE_ROWS = 25e3;
const GSC_GRAINS = [
	["date"],
	["page"],
	["query"],
	["page", "query"],
	["country"],
	["device"]
];
const queryUrl = (property) => `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
/** One stored row from an API row, or null when its page is on another host or a key is empty. */
function mapRow(dims, r, target) {
	const row = {
		page_key: "",
		query: "",
		country: "",
		device: "",
		clicks: Math.round(r.clicks ?? 0),
		impressions: Math.round(r.impressions ?? 0),
		pos_sum: (r.position ?? 0) * (r.impressions ?? 0)
	};
	for (const [i, d] of dims.entries()) {
		const v = typeof r.keys?.[i] === "string" ? r.keys[i].trim() : "";
		if (d === "date") continue;
		if (!v) return null;
		if (d === "page") {
			const k = target.pageKey(v);
			if (k === null) return null;
			row.page_key = k;
		} else if (d === "query") row.query = v.slice(0, 512);
		else row[d] = v.toUpperCase().slice(0, 16);
	}
	return row;
}
/**
* One grain over `from`..`to`. A single day sends the grain as is, `rowLimit` capped (page with query at
* `searchMaxRowsPerDay`, Google's order: clicks descending). Several days add the `date` dimension, which
* Google sorts by date with arbitrary order inside a day, so every row is paged out and each day is cut
* to the cap after a stable sort by clicks: the same rows a single-day request returns.
*/
async function pullGrain(ctx, target, from, to, dims, token) {
	const multi = from !== to;
	const req = multi && dims[0] !== "date" ? ["date", ...dims] : dims;
	const cap = dims.length === 2 ? ctx.settings.searchMaxRowsPerDay : Number.POSITIVE_INFINITY;
	const serverCap = multi ? Number.POSITIVE_INFINITY : cap;
	const byDay = /* @__PURE__ */ new Map();
	let total = 0;
	for (let startRow = 0; startRow < serverCap;) {
		const rowLimit = Math.min(GSC_PAGE_ROWS, serverCap - startRow);
		ctx.budget.spend();
		const body = await fetchJson(ctx.http, queryUrl(target.property), {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json"
			},
			body: JSON.stringify({
				startDate: from,
				endDate: to,
				dimensions: req,
				type: "web",
				dataState: "all",
				rowLimit,
				startRow
			})
		}, "Search Console");
		const rows = Array.isArray(body.rows) ? body.rows : [];
		total += rows.length;
		for (const r of rows) {
			const day = multi ? r.keys?.[0] : from;
			if (typeof day !== "string" || day < from || day > to) continue;
			const list = byDay.get(day);
			if (list) list.push(r);
			else byDay.set(day, [r]);
		}
		if (rows.length < rowLimit) break;
		startRow += rows.length;
	}
	if (multi && Number.isFinite(cap)) for (const [day, list] of byDay) byDay.set(day, list.sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0)).slice(0, cap));
	return {
		byDay,
		total,
		req
	};
}
/** Every grain over `from`..`to`: rows by day (each day present) and the row count of the biggest grain. */
async function fetchRange(ctx, target, from, to) {
	const days = /* @__PURE__ */ new Map();
	for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, []);
	let largest = 0;
	for (const dims of GSC_GRAINS) {
		const { byDay, total, req } = await pullGrain(ctx, target, from, to, dims, await getAccessToken(ctx));
		largest = Math.max(largest, total);
		for (const [day, rows] of byDay) {
			const out = days.get(day);
			if (!out) continue;
			for (const r of rows) {
				const m = mapRow(req, r, target);
				if (m) out.push(m);
			}
		}
	}
	return {
		days,
		largest
	};
}
const google = {
	id: "google",
	configured: gscConfigured,
	async test(ctx, target) {
		const p = (await listProperties(ctx)).find((x) => x.siteUrl === target.property);
		return {
			property: target.property,
			found: !!p,
			permissionLevel: p?.permissionLevel ?? null
		};
	},
	async fetchDay(ctx, target, day) {
		return (await fetchRange(ctx, target, day, day)).days.get(day) ?? [];
	},
	fetchRange
};
// src/sources/store.ts
const COLS = "site, source, day, page_key, query, country, device, clicks, impressions, pos_sum, provisional";
const KIND_SQL = {
	all: "",
	query: " AND query <> '' AND page_key = ''",
	page: " AND page_key <> '' AND query = ''",
	totals: " AND page_key = '' AND query = ''"
};
/** Rows summed by `(page_key, query, country, device)`. */
function mergeRows(rows) {
	const out = /* @__PURE__ */ new Map();
	for (const r of rows) {
		const k = JSON.stringify([
			r.page_key,
			r.query,
			r.country,
			r.device
		]);
		const cur = out.get(k);
		if (cur) {
			cur.clicks += r.clicks;
			cur.impressions += r.impressions;
			cur.pos_sum += r.pos_sum;
		} else out.set(k, { ...r });
	}
	return [...out.values()];
}
function insertSql(dialect) {
	const cols = [
		"",
		"",
		"",
		"",
		"",
		"BIGINT",
		"BIGINT",
		"DOUBLE PRECISION",
		"BIGINT"
	].map((t, i) => dialect === "postgres" ? t ? `CAST(value->>${i} AS ${t})` : `value->>${i}` : `json_extract(value, '$[${i}]')`);
	const from = dialect === "postgres" ? "jsonb_array_elements(CAST(? AS jsonb))" : "json_each(?)";
	return `INSERT INTO ca_search_daily (${COLS}) SELECT ?, ?, ${cols.join(", ")} FROM ${from}`;
}
const daysIn = (dialect) => dialect === "postgres" ? "day IN (SELECT jsonb_array_elements_text(CAST(? AS jsonb)))" : "day IN (SELECT value FROM json_each(?))";
/**
* The statements replacing the rows of every day in `days` (a day with an empty list is cleared): the
* DELETE, then the inserts. Built before running, so the sync can reserve their count in its budget.
*/
function replaceStatements(dialect, site, source, days, provisional, kind = "all") {
	if (!days.size) return {
		stmts: [],
		rows: 0
	};
	const stmts = [{
		sql: `DELETE FROM ca_search_daily WHERE site = ? AND source = ? AND ${daysIn(dialect)}${KIND_SQL[kind]}`,
		params: [
			site,
			source,
			JSON.stringify([...days.keys()])
		]
	}];
	let part = [];
	let size = 0;
	let rows = 0;
	const flush = () => {
		if (part.length) stmts.push({
			sql: insertSql(dialect),
			params: [
				site,
				source,
				`[${part.join(",")}]`
			]
		});
		part = [];
		size = 0;
	};
	for (const [day, list] of days) for (const r of mergeRows(list)) {
		rows++;
		const json = JSON.stringify([
			day,
			r.page_key,
			r.query,
			r.country,
			r.device,
			r.clicks,
			r.impressions,
			r.pos_sum,
			provisional(day) ? 1 : 0
		]);
		if (size + json.length + 1 > 4e5) flush();
		part.push(json);
		size += json.length + 1;
	}
	flush();
	return {
		stmts,
		rows
	};
}
/**
* Run the statements of `replaceStatements` (`inserted` rows) and return the rows written: D1's own
* `rows_written` when the Db reports it, else rows deleted plus `ROWS_PER_INSERT` per row inserted (the
* figures of the counting Db). The DELETE runs alone so its row count is known on every Db.
*/
async function writeReplace(db, stmts, inserted) {
	const [del, ...ins] = stmts;
	if (!del) return 0;
	const { changes } = await db.run(del.sql, del.params);
	const dw = db.meta?.rows_written;
	if (ins.length) await db.batch(ins);
	const iw = ins.length ? db.meta?.rows_written : 0;
	return typeof dw === "number" && typeof iw === "number" ? dw + iw : changes * 1 + inserted * 2;
}
// src/sources/sync.ts
const SOURCES = {
	google,
	bing
};
const MAX_MS = 4e4;
const CONTINUE_DELAY_MS = 6e4;
/** First wait after a throttled or overloaded provider; doubles per repeat up to `RETRY_MAX_MS` (and never beyond the sync interval). */
const RETRY_BASE_MS = 3e5;
const RETRY_MAX_MS = 72e5;
const KV_SEARCH_CURSOR = "search:cursor";
const KV_SEARCH_LOCK = "search:lock";
/** Longer than the cron hook timeout (55 s), so a crashed tick's lock expires before the next minute's tick is refused twice. */
const LOCK_MS = 6e4;
const THROTTLE_TEXT = {
	bing: "Bing limits shared server addresses. The sync retries on the next scheduled run.",
	google: "Google limits how often this server may call it. The sync retries on the next scheduled run."
};
/**
* One-shot continuation names. The host deletes a finished one-shot row by id and `schedule()` upserts
* the same `(plugin, name)` row (`plugins/cron.ts`), so a continuation that rescheduled its own name
* would be deleted on return; a continuation therefore schedules the other name.
*/
const CONTINUE_JOBS = ["search-continue", "search-continue-next"];
const stateKey = (site, source) => `search:state:${site}:${source}`;
const backfillKey = (site, source) => `search:backfill:${site}:${source}`;
/** The property a site maps to at a provider, or "". */
function mappingOf(s, client, source) {
	return (client ? client[MAPPING_FIELD[source]] : s[MAPPING_FIELD[source]]) ?? "";
}
/** The site's target at a provider: property and page key normalizer. */
function targetOf(s, site, client, source, requestUrl) {
	const property = mappingOf(s, client, source);
	return {
		site,
		property,
		pageKey: pageKeyFor(canonicalOrigin({
			siteOrigin: s.siteOrigin,
			client,
			requestUrl,
			property
		}))
	};
}
/** Every configured and mapped pair in walk order. Unmapped sites and unconfigured sources are skipped. */
function mappedPairs(s, clients, requestUrl) {
	const sites = [[s.siteId, void 0], ...[...clients].sort((a, b) => a.id < b.id ? -1 : 1).map((c) => [c.id, c])];
	const out = [];
	for (const [site, client] of sites) for (const source of SOURCE_IDS) {
		if (!SOURCES[source].configured(s) || !mappingOf(s, client, source)) continue;
		out.push({
			id: `${site}:${source}`,
			site,
			source,
			target: targetOf(s, site, client, source, requestUrl)
		});
	}
	return out;
}
/** A provider error keeps its own text. Anything else names the error class and a short, single-line excerpt so an operator can find the cause (no stack, no secrets: messages come from the database or the runtime). */
const message = (e) => {
	if (e instanceof SourceError) return e.message;
	const name = e instanceof Error && e.name ? e.name : "Error";
	const text = (e instanceof Error ? e.message : typeof e === "string" ? e : "").replace(/\s+/g, " ").trim().slice(0, 160);
	return text ? `The pull failed (${name}: ${text}).` : `The pull failed (${name}).`;
};
const noRetry = (e) => e instanceof SourceError && (e.status === 401 || e.status === 403);
/** Too many requests or a server side failure: the provider is under load, so the window shrinks and the next try waits. */
const loadError = (e) => e instanceof SourceError && (e.status === 429 || e.status >= 500);
/** `limit` requests (fetches, statements, KV calls) or `maxMs`, whichever comes first, minus `END_RESERVE`. */
function makeBudget(now, limit = 40, maxMs = MAX_MS) {
	const start = now();
	let calls = 0;
	let used = 0;
	const left = () => limit - 3 - used;
	const need = (n) => {
		if (n > left() || now() - start >= maxMs) throw new BudgetExhausted();
	};
	return {
		spend() {
			need(1);
			calls++;
		},
		need,
		count(n = 1) {
			used += n;
		},
		get calls() {
			return calls;
		},
		get used() {
			return used;
		},
		get left() {
			return left();
		},
		limit
	};
}
/** Today's Search sync rows, with today's estimated ingest rows (`small`: the write guard's estimate without the sync rows). */
function syncRows(ctx) {
	const s = ctx.settings;
	const profile = s.capacityProfile === "small" && !dailyRowsApply("small", ctx.db) ? "standard" : s.capacityProfile;
	return new SyncRows(ctx.kv, ctx.now, profile, async () => {
		const w = await budgetState(ctx.db, ctx.kv, Math.floor(ctx.now() / 1e3), s.capacityProfile, s.siteTimezone);
		return w ? w.rows - (w.sync ?? 0) : 0;
	});
}
/** The database of `site`'s search rows. */
const siteDb = (ctx, site) => ctx.dbOf ? ctx.dbOf(site) : Promise.resolve(ctx.db);
/** The tick's context with every fetch, statement and KV call metered against the budget. */
function metered(ctx, budget) {
	const c = (n = 1) => budget.count(n);
	const { http, db, dbOf, kv } = ctx;
	const count = (db) => ({
		dialect: db.dialect,
		run: (sql, p) => (c(), db.run(sql, p)),
		all: (sql, p) => (c(), db.all(sql, p)),
		batch: (stmts) => (c(stmts.length), db.batch(stmts)),
		get meta() {
			return db.meta;
		}
	});
	return {
		...ctx,
		http: { fetch: (url, init) => (c(), http.fetch(url, init)) },
		db: count(db),
		...dbOf ? { dbOf: async (site) => count(await dbOf(site)) } : {},
		kv: {
			get: (key) => (c(), kv.get(key)),
			set: (key, v) => (c(), kv.set(key, v)),
			delete: (key) => (c(), kv.delete(key)),
			list: (p) => (c(), kv.list(p)),
			compareAndSet: (key, e, v) => (c(), kv.compareAndSet(key, e, v))
		}
	};
}
/**
* The platform's own per-invocation request limit ("Too many subrequests by single Worker invocation") is
* not a failure of the pull: nothing of the window was stored and the cursor stays, so the work resumes on
* the next tick exactly like an exhausted tick budget.
*/
const isPlatformLimit = (e) => e instanceof Error && /too many subrequests/i.test(e.message);
async function yieldOnPlatformLimit(run) {
	try {
		return await run();
	} catch (e) {
		if (isPlatformLimit(e)) throw new BudgetExhausted();
		throw e;
	}
}
const sourceCtx = (ctx, budget) => ({
	http: ctx.http,
	kv: ctx.kv,
	settings: ctx.settings,
	budget,
	now: ctx.now,
	...ctx.sleep ? { sleep: ctx.sleep } : {}
});
const provisional = (today) => (day) => day >= addDays(today, -3);
const lesser = (d, e) => d < e ? d : e;
/**
* The days of `days` (oldest first, or newest first) whose rows written fit the rows left today, stopping at the
* first that does not. A day costs its stored rows deleted plus its rows inserted when `stored` counts them, else
* the bound `ROWS_PER_ROW_BOUND` per row. A day bigger than the whole share is taken alone on a UTC day without
* sync writes yet, while it stays under the pause line, so a large site still makes progress.
*/
function fitting(a, days, newestFirst = false, stored) {
	const out = /* @__PURE__ */ new Map();
	if (a.paused) return out;
	let left = a.left;
	const keys = [...days.keys()].sort();
	if (newestFirst) keys.reverse();
	for (const day of keys) {
		const list = days.get(day) ?? [];
		const cost = stored ? (stored.get(day) ?? 0) * 1 + list.length * 2 : list.length * 3;
		const alone = !out.size && a.used === 0 && cost <= (a.pauseAt === null ? a.budget : a.pauseAt - (a.ingest ?? 0));
		if (cost > left && !alone) break;
		left -= cost;
		out.set(day, list);
	}
	return out;
}
const backoff = (count, s) => Math.min(RETRY_BASE_MS * 2 ** Math.max(0, count - 1), RETRY_MAX_MS, s.searchSyncHours * 36e5);
/**
* Pull `pos.cursor`..`last` of a range source (Google) in windows of `pos.win` days, storing each window
* whole and moving `pos.cursor` (then calling `stored`, which persists it) only after it is stored, so a
* crash resumes cleanly. Up to `FETCH_PARALLEL` windows are fetched at once when the budget has room for
* all of them; writes stay in order. Rethrows `BudgetExhausted` and provider errors with `pos.win` set
* to the window size to use next.
*/
async function pullRange(ctx, p, src, budget, rows, today, pos, last, stored, pace = {}) {
	const fetchRange = src.fetchRange;
	if (!fetchRange) return;
	const perWindow = GSC_GRAINS.length + 5;
	while (pos.cursor <= last) {
		const a = await rows.allowance();
		if (a.paused) throw new RowsPaused(a.resumeAt ?? nextUtcDay(ctx.now()));
		let room = Math.floor(a.left / (2 * (pace.perDay ?? ctx.settings.searchMaxRowsPerDay)));
		if (room < 1 && (pace.perDay === void 0 || a.used === 0)) room = 1;
		if (room < 1) throw new RowsPaused(nextUtcDay(ctx.now()));
		const ranges = [];
		for (let from = pos.cursor; from <= last && room > 0 && ranges.length < 3 && (ranges.length + 1) * perWindow <= budget.left;) {
			const to = lesser(addDays(from, Math.min(pos.win, room) - 1), last);
			ranges.push([from, to]);
			room -= daysBetween(from, to);
			from = addDays(to, 1);
		}
		if (!ranges.length) throw new BudgetExhausted();
		const usedBefore = budget.used;
		let grown = false;
		const results = await Promise.allSettled(ranges.map(([from, to]) => yieldOnPlatformLimit(() => fetchRange(sourceCtx(ctx, budget), p.target, from, to))));
		for (const [i, r] of results.entries()) {
			if (r.status === "rejected") {
				const e = r.reason;
				if (e instanceof BudgetExhausted && usedBefore <= budget.limit / 2 || loadError(e)) pos.win = Math.max(1, Math.floor(pos.win / 2));
				throw e;
			}
			const { days, largest } = r.value;
			pace.perDay = Math.max(1, Math.ceil([...days.values()].reduce((n, l) => n + l.length, 0) / Math.max(1, days.size)));
			const db = await siteDb(ctx, p.site);
			const [wFrom, wTo] = ranges[i];
			budget.need(1);
			const had = new Map((await db.all("SELECT day, COUNT(*) AS n FROM ca_search_daily WHERE site = ? AND source = ? AND day >= ? AND day <= ? GROUP BY day", [
				p.site,
				p.source,
				wFrom,
				wTo
			])).map((x) => [String(x.day), Number(x.n)]));
			const fit = fitting(await rows.allowance(), days, false, had);
			if (fit.size) {
				const { stmts, rows: n } = replaceStatements(db.dialect, p.site, p.source, fit, provisional(today));
				try {
					budget.need(stmts.length + 2);
				} catch (e) {
					if (i === 0) pos.win = Math.max(1, Math.floor(pos.win / 2));
					throw e;
				}
				await rows.charge(await yieldOnPlatformLimit(() => writeReplace(db, stmts, n)));
				pos.cursor = addDays([...fit.keys()].sort().pop(), 1);
				if (largest >= 25e3) pos.win = Math.max(1, Math.floor(pos.win / 2));
				else if (largest < 6250 && !grown) {
					pos.win = Math.min(32, pos.win * 2);
					grown = true;
				}
				await stored(n);
			}
			if (fit.size < days.size) throw new RowsPaused(nextUtcDay(ctx.now()));
		}
	}
}
/** A Bing throttle: state "throttled", the last successful sync and its rows stay, the next attempt backs off. Returns that time (ms). */
async function throttled(ctx, p, key, st, e, nowIso) {
	const count = (st.throttleCount ?? 0) + 1;
	const next = ctx.now() + backoff(count, ctx.settings);
	const out = {
		...st,
		status: "throttled",
		throttleCode: e.code,
		throttledAt: nowIso,
		throttleCount: count,
		nextAttempt: new Date(next).toISOString(),
		cursorDay: null
	};
	await ctx.kv.set(key, out);
	ctx.log?.warn(`cookieless-analytics: ${p.source} throttled (${e.code}) for site ${p.site}, attempt ${count}; next attempt ${out.nextAttempt}`);
	return next;
}
const clearThrottle = {
	throttleCode: null,
	throttledAt: null,
	throttleCount: 0,
	nextAttempt: null,
	errorCount: 0
};
/** A failed pull: the error, and for a retryable one a next attempt backing off like a throttle, so a failing provider is not called every minute while continuations run. */
function failed(ctx, st, e, nowIso, cursorDay) {
	const count = (st.errorCount ?? 0) + 1;
	const retry = !noRetry(e);
	return Object.assign(st, {
		status: "error",
		lastError: message(e),
		lastErrorAt: nowIso,
		cursorDay: retry ? cursorDay : null,
		throttleCode: null,
		throttledAt: null,
		throttleCount: 0,
		errorCount: count,
		nextAttempt: retry ? new Date(ctx.now() + backoff(count, ctx.settings)).toISOString() : null
	}, retry ? {} : { lastRun: nowIso });
}
/** Not before `nextAttempt` (a throttle or a retryable error) unless forced. */
const waiting = (ctx, st) => st.nextAttempt && (st.status === "throttled" || st.status === "error") ? Date.parse(st.nextAttempt) : 0;
/**
* A provider without a date range (Bing): one pull returns every day, all stored (inside the retention,
* before today) with one DELETE and a few inserts. An open backfill makes the pair due and is done once
* that pull is stored. Returns when the pair wants the next tick (ms), or null.
*/
async function runWindowPair(ctx, p, src, budget, rows, today, force) {
	const key = stateKey(p.site, p.source);
	const bkey = backfillKey(p.site, p.source);
	const st = await ctx.kv.get(key) ?? {};
	const bf = await ctx.kv.get(bkey);
	const pending = bf && !bf.done ? bf : null;
	const wait = waiting(ctx, st);
	if (!(force || (wait ? ctx.now() >= wait : !!st.cursorDay || !!pending || !st.lastRun || ctx.now() - Date.parse(st.lastRun) >= ctx.settings.searchSyncHours * 36e5))) return wait || null;
	const nowIso = new Date(ctx.now()).toISOString();
	try {
		const a = await rows.allowance();
		if (a.paused) throw new RowsPaused(a.resumeAt ?? nextUtcDay(ctx.now()));
		const days = await yieldOnPlatformLimit(() => src.fetchWindow(sourceCtx(ctx, budget), p.target));
		const floor = addDays(today, -ctx.settings.searchRetentionDays);
		const want = pending ? pending.from : addDays(today, -7);
		const oldest = want > floor ? want : floor;
		const keep = /* @__PURE__ */ new Map();
		for (const [day, list] of days) if (day >= oldest && day < today) keep.set(day, list);
		const db = await siteDb(ctx, p.site);
		budget.need(1);
		for (const r of await db.all("SELECT DISTINCT day FROM ca_search_daily WHERE site = ? AND source = ? AND day < ?", [
			p.site,
			p.source,
			addDays(today, -7)
		])) keep.delete(String(r.day));
		const fit = fitting(a, keep, true);
		const { stmts, rows: n } = replaceStatements(db.dialect, p.site, p.source, fit, provisional(today));
		budget.need(stmts.length + 3);
		if (stmts.length) await rows.charge(await yieldOnPlatformLimit(() => writeReplace(db, stmts, n)));
		if (fit.size < keep.size) throw new RowsPaused(nextUtcDay(ctx.now()));
		Object.assign(st, {
			cursorDay: null,
			lastRun: nowIso,
			status: "ok",
			lastError: null,
			...clearThrottle
		});
		await ctx.kv.set(key, st);
		if (pending) await ctx.kv.set(bkey, {
			...pending,
			cursor: addDays(pending.to, 1),
			done: true,
			error: null,
			rows: n
		});
		return null;
	} catch (e) {
		if (e instanceof BudgetExhausted) {
			await ctx.kv.set(key, {
				...st,
				cursorDay: today
			});
			if (pending && e instanceof RowsPaused) await ctx.kv.set(bkey, {
				...pending,
				nextAt: e.resumeAt
			});
			throw e;
		}
		if (e instanceof ThrottledError) return throttled(ctx, p, key, st, e, nowIso);
		await ctx.kv.set(key, failed(ctx, st, e, nowIso, today));
		if (pending) await ctx.kv.set(bkey, {
			...pending,
			error: message(e)
		});
		return st.nextAttempt ? Date.parse(st.nextAttempt) : null;
	}
}
/** One pair: the sync window when due (or forced, or unfinished), then an active backfill. Rethrows only `BudgetExhausted`; returns when the pair wants the next tick (ms), or null. */
async function runPair(ctx, p, budget, rows, today, force) {
	budget.need(2);
	const src = SOURCES[p.source];
	if (src.fetchWindow) return runWindowPair(ctx, p, src, budget, rows, today, force);
	const key = stateKey(p.site, p.source);
	const st = await ctx.kv.get(key) ?? {};
	const nowIso = new Date(ctx.now()).toISOString();
	const wait = waiting(ctx, st);
	const due = force || (wait ? ctx.now() >= wait : !!st.cursorDay || !st.lastRun || ctx.now() - Date.parse(st.lastRun) >= ctx.settings.searchSyncHours * 36e5);
	const wake = wait && !due ? wait : null;
	if (due) {
		const pos = {
			cursor: st.cursorDay && st.cursorDay >= addDays(today, -7) ? st.cursorDay : addDays(today, -7),
			win: st.window ?? 8
		};
		const save = () => ctx.kv.set(key, Object.assign(st, {
			cursorDay: pos.cursor,
			window: pos.win
		}));
		try {
			await pullRange(ctx, p, src, budget, rows, today, pos, addDays(today, -1), save);
			Object.assign(st, {
				cursorDay: null,
				window: pos.win,
				lastRun: nowIso,
				status: "ok",
				lastError: null,
				errorCount: 0,
				nextAttempt: null
			});
			await ctx.kv.set(key, st);
		} catch (e) {
			if (e instanceof BudgetExhausted) {
				if (pos.win !== st.window) await save();
				throw e;
			}
			await ctx.kv.set(key, Object.assign(failed(ctx, st, e, nowIso, pos.cursor), { window: pos.win }));
			return st.nextAttempt ? Date.parse(st.nextAttempt) : null;
		}
	}
	const bkey = backfillKey(p.site, p.source);
	const bf = await ctx.kv.get(bkey);
	if (!bf || bf.done) return wake;
	if (bf.retryAt && ctx.now() < bf.retryAt && !force) return bf.retryAt;
	const pos = {
		cursor: bf.cursor,
		win: bf.window ?? 8
	};
	const done = daysBetween(bf.from, bf.cursor) - 1;
	try {
		await pullRange(ctx, p, src, budget, rows, today, pos, bf.to, (n) => ctx.kv.set(bkey, Object.assign(bf, {
			cursor: pos.cursor,
			window: pos.win,
			rows: (bf.rows ?? 0) + n,
			error: null,
			retryAt: 0,
			retries: 0
		})), done > 0 && bf.rows ? { perDay: Math.max(1, Math.ceil(bf.rows / done)) } : {});
		await ctx.kv.set(bkey, {
			...bf,
			done: true,
			error: null,
			retryAt: 0,
			retries: 0
		});
		return wake;
	} catch (e) {
		if (e instanceof BudgetExhausted) {
			await ctx.kv.set(bkey, {
				...bf,
				window: pos.win,
				nextAt: e instanceof RowsPaused ? e.resumeAt : ctx.now() + CONTINUE_DELAY_MS
			});
			throw e;
		}
		const retries = (bf.retries ?? 0) + 1;
		const retryAt = loadError(e) ? ctx.now() + backoff(retries, ctx.settings) : 0;
		await ctx.kv.set(bkey, {
			...bf,
			window: pos.win,
			error: message(e),
			retryAt,
			retries
		});
		return retryAt || wake;
	}
}
/** Take `kv search:lock`, or report it held by a running tick. A lock older than `LOCK_MS` belongs to a crashed tick and is taken over. */
async function lock(kv, now) {
	if ((await kv.compareAndSet("search:lock", null, { until: now + 6e4 })).applied) return true;
	const cur = await kv.get(KV_SEARCH_LOCK);
	if (cur && typeof cur.until === "number" && cur.until > now) return false;
	await kv.set(KV_SEARCH_LOCK, { until: now + LOCK_MS });
	return true;
}
/**
* One tick. `only` restricts the walk to one site (and source) and forces it due (the `search/sync`
* route); such a run leaves `search:cursor` alone.
*/
async function runSearchTick(outer, opts = {}) {
	const budget = makeBudget(outer.now, outer.settings.syncSubrequestBudget);
	const ctx = metered(outer, budget);
	if (!await lock(ctx.kv, ctx.now())) return {
		calls: 0,
		used: budget.used,
		rows: 0,
		pairs: [],
		done: false,
		continued: false,
		busy: true
	};
	const rows = syncRows(ctx);
	let paused = null;
	const today = dayInZone(Math.floor(ctx.now() / 1e3), ctx.settings.siteTimezone);
	let done = true;
	let wake = null;
	const walked = [];
	try {
		let pairs = mappedPairs(ctx.settings, ctx.clients, ctx.requestUrl);
		const only = opts.only;
		if (only) pairs = pairs.filter((p) => p.site === only.site && (!only.source || p.source === only.source));
		else {
			const cursor = await ctx.kv.get(KV_SEARCH_CURSOR);
			const at = pairs.findIndex((p) => p.id === cursor);
			if (at > 0) pairs = [...pairs.slice(at), ...pairs.slice(0, at)];
		}
		for (const p of pairs) {
			walked.push(p.id);
			try {
				const w = await runPair(ctx, p, budget, rows, today, !!only);
				if (w !== null) wake = Math.min(wake ?? w, w);
			} catch (e) {
				if (!(e instanceof BudgetExhausted)) throw e;
				if (e instanceof RowsPaused) paused = e.resumeAt;
				done = false;
				if (!only) await ctx.kv.set(KV_SEARCH_CURSOR, p.id);
				break;
			}
		}
		if (done && !only) await ctx.kv.delete(KV_SEARCH_CURSOR);
	} finally {
		await ctx.kv.delete(KV_SEARCH_LOCK);
	}
	const at = paused !== null ? Math.max(paused, ctx.now() + CONTINUE_DELAY_MS) : !done ? ctx.now() + CONTINUE_DELAY_MS : wake === null ? null : Math.max(wake, ctx.now() + CONTINUE_DELAY_MS);
	let continued = false;
	if (at !== null && ctx.cron) {
		await ctx.cron.schedule(opts.continueAs ?? CONTINUE_JOBS[0], { schedule: new Date(at).toISOString() });
		continued = true;
	}
	return {
		calls: budget.calls,
		used: budget.used,
		rows: rows.charged,
		pairs: walked,
		done,
		continued,
		...paused !== null ? { pausedUntil: paused } : {}
	};
}
const PreviewBody = z.object({
	site: SiteField,
	scope: ScopeSchema.optional(),
	days: z.number().int().min(1).max(90).optional()
}).strict();
/** Search data exists only with a connected source. */
const searchConfigured = (s) => SOURCES.google.configured(s) || SOURCES.bing.configured(s);
/** Rows `{ k, v, w }`: one `n` row with the counts, then the samples keyed by `k`. */
function parts(rows, keys) {
	const n = rows.find((r) => r.k === "n") ?? {};
	return keys.map((k, i) => ({
		count: Number((i === 0 ? n.v : n.w) ?? 0),
		sample: rows.filter((r) => r.k === k).map((r) => String(r.v))
	}));
}
function previewRoute(env) {
	return {
		permission: "plugins:read",
		input: PreviewBody,
		async handler(ctx) {
			const body = PreviewBody.parse(ctx.input);
			const s = await env.settings();
			const site = (await bindSite(body.site, s.siteId, ctx.storage.sites)).id;
			const to = dayInZone(env.now?.() ?? Math.floor(Date.now() / 1e3), s.siteTimezone);
			const from = addDays(to, -((body.days ?? 30) - 1));
			const db = await env.db(site);
			const cc = {
				db,
				site,
				from,
				to,
				goals: []
			};
			try {
				const traffic = scopeToFilters(body.scope, "traffic");
				const hits = hitJoin({
					site,
					db
				}, {
					from,
					to,
					traffic: await compileTraffic(cc, traffic.filters)
				}, "pv");
				const [hosts, pages] = parts(await db.all(`WITH m AS (SELECT DISTINCT s.host AS host, ${entryCols(db.dialect).path} AS path ${hits.sql})
SELECT 'n' AS k, CAST((SELECT COUNT(DISTINCT host) FROM m) AS TEXT) AS v, CAST((SELECT COUNT(DISTINCT path) FROM m) AS TEXT) AS w
UNION ALL SELECT 'h', host, NULL FROM (SELECT DISTINCT host FROM m WHERE host IS NOT NULL ORDER BY host LIMIT 5) a
UNION ALL SELECT 'p', path, NULL FROM (SELECT DISTINCT path FROM m ORDER BY path LIMIT 5) b`, hits.params), ["h", "p"]);
				const notices = traffic.notices.filter((n) => n !== "scope_query_not_applied");
				let queries = null;
				if (body.scope?.query?.length) {
					if (searchConfigured(s)) {
						const search = scopeToFilters(body.scope, "search");
						notices.push(...search.notices);
						const c = await compileSearch(cc, search.filters.filter((f) => f.dim === "query"));
						const where = and([{
							sql: "d.site = ? AND d.day BETWEEN ? AND ? AND d.query <> '' AND d.page_key = '' AND d.country = '' AND d.device = ''",
							params: [
								site,
								from,
								to
							]
						}, c.pred]);
						queries = parts(await db.all(`WITH m AS (SELECT DISTINCT d.query AS q FROM ca_search_daily d WHERE ${where.sql})
SELECT 'n' AS k, CAST((SELECT COUNT(*) FROM m) AS TEXT) AS v, NULL AS w UNION ALL SELECT 'q', q, NULL FROM (SELECT q FROM m ORDER BY q LIMIT 5) a`, where.params), ["q"])[0];
					} else notices.push("scope_no_search_source");
				}
				return {
					hosts,
					pages,
					queries,
					notices
				};
			} catch (err) {
				if (err instanceof QueryError) throw new PluginRouteError(err.code, err.message, 400);
				throw err;
			}
		}
	};
}
// src/routes/editor.ts
/**
* `editor/traffic` (`plugins:read`): the last 30 days of one content item's public page for the
* editor sidebar panel. The path comes from `derivePath`; at most five statements (series, sources, search,
* whether revenue exists, page revenue), annotations from storage through the one matching function.
*/
const TOP_SOURCES = 5;
const EditorTrafficBody = z.object({
	collection: z.string().min(1).max(64),
	id: z.string().min(1).max(128),
	slug: z.string().max(256).optional(),
	locale: z.string().max(16).optional()
}).strip();
function editorRoutes(env) {
	return { "editor/traffic": {
		permission: "plugins:read",
		input: EditorTrafficBody,
		async handler(ctx) {
			const body = EditorTrafficBody.parse(ctx.input);
			let data;
			try {
				data = (await ctx.content?.get?.(body.collection, body.id))?.data;
			} catch {}
			const path = await derivePath(ctx, body.collection, {
				id: body.id,
				data
			});
			if (!path) return { path: null };
			const s = await env.settings();
			const now = env.now?.() ?? Math.floor(Date.now() / 1e3);
			const to = dayInZone(now, s.siteTimezone);
			const from = addDays(to, -29);
			const site = s.siteId;
			const db = await env.db(site);
			const range = [
				site,
				from,
				to
			];
			const h = entryCols(db.dialect);
			const pvOf = `FROM ca_sessions s CROSS JOIN ${entriesOf(db.dialect)} WHERE s.site = ? AND s.day BETWEEN ? AND ? AND s.pageviews > 0 AND ${h.pv} AND ${h.path} = ?`;
			const visitRange = [
				site,
				visitDayKey(from),
				visitDayKey(to),
				path
			];
			const days = (await db.all(`SELECT s.day AS day, COUNT(*) AS pageviews, COUNT(DISTINCT s.vkey) AS visitors, SUM(${h.dur}) AS dur_sum, COUNT(${h.dur}) AS dur_n ${pvOf} GROUP BY s.day`, visitRange)).map((r) => ({
				...r,
				day: isoDay(r.day)
			}));
			const sources = await db.all(`SELECT COALESCE(s.source, '(not set)') AS key, COUNT(DISTINCT s.sid) AS sessions ${pvOf}
GROUP BY COALESCE(s.source, '(not set)') ORDER BY sessions DESC, key LIMIT ${TOP_SOURCES}`, visitRange);
			let search = null;
			if (SOURCES.google.configured(s) || SOURCES.bing.configured(s)) {
				const [r] = await db.all("SELECT SUM(d.clicks) AS clicks, SUM(d.impressions) AS impressions, SUM(d.pos_sum) AS pos_sum FROM ca_search_daily d WHERE d.site = ? AND d.day BETWEEN ? AND ? AND d.page_key = ? AND d.query = '' AND d.country = '' AND d.device = ''", [...range, path]);
				const impressions = num$2(r?.impressions);
				search = {
					clicks: num$2(r?.clicks),
					impressions,
					position: round(ratio(num$2(r?.pos_sum), impressions), 2)
				};
			}
			let revenue = null;
			if (await hasRevenue({
				db,
				site
			})) {
				const currency = s.defaultCurrency;
				const [r] = await db.all("SELECT SUM(h.val) AS revenue, COUNT(*) AS orders FROM ca_events h WHERE h.site = ? AND h.day BETWEEN ? AND ? AND h.val >= 0 AND h.cur = ? AND h.path = ?", [
					site,
					dayInt(from),
					dayInt(to),
					currency,
					path
				]);
				revenue = {
					currency,
					revenue: round(num$2(r?.revenue), 2) ?? 0,
					orders: num$2(r?.orders)
				};
			}
			const annotations = matchAnnotations((await loadAnnotations(ctx.storage.annotations, site, from, to, s.siteTimezone)).items, {
				site,
				from,
				to,
				tz: s.siteTimezone,
				target: "traffic",
				filters: [{
					dim: "page",
					op: "is",
					values: [path]
				}]
			}).slice(-5).reverse().map((a) => annotationView(a, s.siteTimezone));
			const pageviews = days.reduce((a, r) => a + num$2(r.pageviews), 0);
			const series = bucketSeries(from, to, "day", days).map((p) => ({
				t: p.t,
				pageviews: num$2(p.pageviews)
			}));
			return {
				path,
				range: {
					from,
					to
				},
				pageviews,
				visitors: days.reduce((a, r) => a + num$2(r.visitors), 0),
				avg_time: round(ratio(days.reduce((a, r) => a + num$2(r.dur_sum), 0) / 1e3, days.reduce((a, r) => a + num$2(r.dur_n), 0)), 1),
				series,
				sources: sources.map((r) => ({
					key: String(r.key),
					sessions: num$2(r.sessions)
				})),
				search,
				annotations,
				revenue
			};
		}
	} };
}
// src/routes/contract.ts
function contractBody(s) {
	return {
		v: 1,
		pluginId: PLUGIN_ID,
		collectPath: s.collectPath,
		scriptPath: s.scriptPath,
		namespace: s.namespace
	};
}
/** Public discovery route for sibling plugins. */
function contractRoute(env) {
	return {
		public: true,
		methods: ["GET"],
		response: "raw",
		cacheControl: "public, max-age=60",
		async handler(ctx) {
			return json$1(contractBody((await env.deps(ctx)).settings));
		}
	};
}
// src/charts/caveats.ts
/** Fixed caveat and notice texts, shared by the admin info markers and the shared page. No React. */
/** Notice texts of the SEO views and the impact view. */
const SEO_NOTICES = {
	top3_insufficient: "Potential clicks need at least 1,000 impressions in positions 1 to 3 over this range; not enough top-3 data.",
	scope_host_not_applied: "Host rules do not apply to Search data; this comparison is not limited by host.",
	capped: "The list shows the 200 queries with the most impressions; the totals count every query.",
	metric_unavailable: "This report has no value for this metric here; pick a row or another metric.",
	scope_query_not_applied: "Query rules apply to Search data only; this comparison is site-wide. Pick a Search metric to compare the query."
};
const CAVEATS = {
	visitors: "Distinct visitors per day, added up over the range, so a person who returns on another day counts again.",
	nat: "People who share one network address and the same browser family on the same day can count as one visitor.",
	searchLag: "Search data arrives 2 to 3 days late. The three newest days are provisional and are replaced on the next sync.",
	rollup: "This range is answered from daily summaries: it starts before the detailed data window, or it is too long to read in detail. Some filters do not apply to summaries.",
	satisfaction_estimate: "Pogo-sticking, returned from search, search re-entry and back/forward loads are estimates from browser navigation signals.",
	pogo: `${POGO_DEFINITION} ${SATISFACTION_CAVEAT}`,
	returned: `${RETURNED_DEFINITION} ${SATISFACTION_CAVEAT}`,
	satisfaction_score: SCORE_DEFINITION,
	active_time: "Active time counts only while the visitor interacts, so a page that is open but untouched shows 0 s. See Avg. duration for visible time.",
	duration: "Time the page was visible, whichever is longer of the visit span and the visible time. Not interaction time.",
	visible_time: "Time the page was visible per page view, whether or not the visitor interacted. Kept in detailed data only, so summary ranges leave it blank.",
	satisfaction_measured: "Share of sessions with a measurable end, where at least one engagement update arrived; the rates count only these sessions."
};
/** Notices of the collections and site search reports. */
const SITE_NOTICES = {
	not_available_for_site: "This report reads the content types of this site's CMS; a client site has none.",
	site_search_off: "Site search is off. Add the query parameter names of your site search (for example q or s) in the plugin settings, or for a client site on the Sites tab.",
	site_search_capped: "Only the 5,000 most frequent search strings of this range were read."
};
const dimName = (c, d) => c.label?.(d) ?? d.replace(/_/g, " ");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** A label inside a sentence: "Country" reads "country", "UTM source" keeps its capitals. */
const low = (s) => /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
/** The reason of a filter that summary data cannot apply (`filter_unavailable:<dim>:<reason>`), shown on its chip and in the notice. */
function filterReason(dim, reason, c = {}) {
	const name = cap(dimName(c, dim));
	if (reason === "negated") return `${name} cannot be excluded in summary data.`;
	if (reason === "own") return `${name} cannot filter this report in summary data.`;
	if (reason !== "combination") return `${name} is not kept in summary data.`;
	const others = [...new Set((c.filtered ?? []).filter((d) => d !== dim))].map((d) => low(dimName(c, d)));
	return `${name} cannot be combined with ${others.length ? others.join(" and ") : "the other filters"} in summary data.`;
}
/**
* Copy of every notice code a report can return (`code`, or `code:arg:arg`), one table for the admin, the shared page
* and email; `tests/copy.test.ts` fails when a reader returns a code missing here. `null`: the code's own view shows it
* with its figures (the Impact panel, the SEO coverage line).
*/
const NOTICE_COPY = {
	summary: () => CAVEATS.rollup,
	compare_summary: () => "The comparison range is answered from daily summaries.",
	detail_from: ([day]) => `Detailed data starts on ${day}. A range from that day applies every filter.`,
	summary_other: ([dim = ""], c) => `Some ${dimName(c, dim)} values were summed into (other) on some days of this range, so the filter cannot match them there and these figures may be low.`,
	summary_behind: ([from, to]) => `The daily summaries are not stored yet for ${from === to ? from : `${from} to ${to}`}, so ${from === to ? "that day is" : "those days are"} missing from these totals until the background runs catch up.`,
	filter_unavailable: ([dim = "", reason = ""], c) => filterReason(dim, reason, c),
	ignored_dim: ([dim = ""], c) => `${cap(dimName(c, dim))} does not apply to this report.`,
	revenue_not_available: () => "Revenue is left out: the daily summaries cannot apply these filters to orders.",
	top_paths_per_day: () => "Daily summaries keep the top paths per day, so rare steps and paths are not counted here.",
	granularity_day: () => "Hourly detail is not kept for this range; the chart shows days.",
	exit_rate_partial: () => "Exit rate is blank for pages whose exits or page views were folded into other pages on some days of this range.",
	filters_not_applied: () => "Some filters do not apply to this report.",
	segment_missing: () => "The default segment of this dashboard was deleted; this tile shows all visitors.",
	compare_segment_missing: () => "The compare segment of this dashboard was deleted; this tile shows no comparison.",
	not_available_for_site: () => SITE_NOTICES.not_available_for_site,
	site_search_off: () => SITE_NOTICES.site_search_off,
	site_search_capped: () => SITE_NOTICES.site_search_capped,
	provisional_excluded: () => "The newest Search days are provisional, so the period ends at the newest final day.",
	scope_no_search_source: () => "Query rules apply to Search data only; this site has no Search source yet.",
	...Object.fromEntries(Object.entries(SEO_NOTICES).map(([k, t]) => [k, () => t])),
	coverage: null,
	bing_no_pairs: null,
	no_annotation: null,
	not_yet: null,
	incomplete: null,
	search_lags: null,
	search_no_data: null
};
/** The text of one notice code, or null (unknown, or shown by its own view). */
function noticeCopy(code, c = {}) {
	const [head = "", ...args] = code.split(":");
	return NOTICE_COPY[head]?.(args, c) ?? null;
}
/** Readable texts of a report's notices, in order, without repeats; the compare side's engine only when the current side is detailed. */
function noticeText(notices, c = {}) {
	const out = [];
	for (const n of notices) {
		if (n === "compare_summary" && notices.includes("summary")) continue;
		const t = noticeCopy(n, c);
		if (t && !out.includes(t)) out.push(t);
	}
	return out;
}
// src/charts/markers.ts
/** Bucket key of an annotation on a series chart, shared by the admin chart kit and the shared page renderer. */
/** The series bucket (`YYYY-MM-DD`, `YYYY-MM-DD HH:00` or a week start) holding `ts` in the site timezone. */
function annotationBucket(ts, gran, tz) {
	const day = dayInZone(ts, tz);
	return gran === "hour" ? `${day} ${String(hourInZone(ts, tz)).padStart(2, "0")}:00` : gran === "week" ? weekStart(day) : day;
}
// src/dashboards/tiles.ts
const TRIMMED_COMPARE = "Comparison on: showing the first 2 metrics.";
/** A series more than this many times another of its family moves to the right axis (as on the report pages). */
const SCALE_RATIO = 20;
/**
* Axis of each line, in the tile's order: the first line's scale family on the left, the other on the
* right. With one family, the lines more than 20 times the smallest move right, so the small one is not flat.
*/
function lineAxes(lines) {
	const fams = lines.map((l) => metricFamily(l.key));
	const out = {};
	lines.forEach((l, i) => out[l.key] = fams[i] === fams[0] ? "left" : "right");
	if (lines.length > 1 && new Set(fams).size === 1) {
		const top = (l) => Math.max(0, ...l.values.map((v) => v ?? 0), ...(l.compare ?? []).map((v) => v ?? 0));
		const least = Math.min(...lines.map(top));
		if (least > 0) {
			for (const l of lines) if (top(l) > SCALE_RATIO * least) out[l.key] = "right";
		}
	}
	return out;
}
/** The footnote of the site search floor on shared pages and in emails. */
const hiddenTermsText = (n) => `${n} search term${n === 1 ? "" : "s"} used in fewer than 2 sessions ${n === 1 ? "is" : "are"} not shown.`;
const SKIP = /* @__PURE__ */ new Set([
	"key",
	"previous",
	"delta",
	"page_list",
	"periods",
	"currency",
	"revenue_currency"
]);
const REVENUE_EMPTY = "No revenue recorded yet";
/** Format of a value: amounts as `money:<code>` when the tile has a currency, else the metric's format. */
const valueFormat = (key, currency) => currency && MONEY_KEYS.has(key) ? `money:${currency}` : metricFormat(key);
const formatValue = (key, v, currency) => fmt(v, valueFormat(key ?? "", currency));
/** Header of a column or KPI: "Revenue (USD)" for amounts. */
const valueLabel = (key, currency) => currency && MONEY_KEYS.has(key) ? `${metricLabel(key)} (${currency})` : metricLabel(key);
/** "100.00 EUR (1 order), 80.00 GBP (2 orders)", at most 5 listed then "and n more"; empty without others. */
function otherCurrencies(others) {
	return `${others.slice(0, 5).map((c) => `${formatAmount(c.revenue, c.currency)} (${c.orders} order${c.orders === 1 ? "" : "s"})`).join(", ")}${others.length > 5 ? ` and ${others.length - 5} more` : ""}`;
}
/** The lines under a revenue tile: "Amounts in USD." and "Also recorded: 120.00 EUR (3 orders)." */
function currencyLines(d) {
	if (!d.currency) return [];
	const others = otherCurrencies(d.otherCurrencies ?? []);
	return [`Amounts in ${d.currency}.`, ...others ? [`Also recorded: ${others}.`] : []];
}
/** Labels that the key cannot spell (the satisfaction estimates carry "estimate"); the admin's `METRICS` labels agree. */
const LABELS = {
	key: "Name",
	ctr: "CTR",
	avg_duration: "Avg. session duration",
	avg_time: "Avg. active time",
	avg_visible: "Avg. visible time",
	avg_engaged: "Avg. active time",
	converting: "Conversions",
	scroll_median: "Median scroll (%)",
	aov: "Average order value",
	pogo_stick_rate: "Pogo-sticking (estimate)",
	pogo_sticks: "Pogo-sticking sessions (estimate)",
	returned_from_search_rate: "Returned from search (estimate)",
	returned_from_search: "Returned from search sessions (estimate)"
};
/** Readable label of a metric or column key: `bounce_rate` becomes "Bounce rate". */
const metricLabel = (key) => LABELS[key] ?? `${key[0]?.toUpperCase() ?? ""}${key.slice(1).replace(/_/g, " ")}`;
/** Default titles that differ from the report name: shared pages carry no `FORBIDDEN_PUBLIC_WORDS` term. */
const REPORT_TITLES = {
	collections: "Content types",
	site_search: "Site search",
	pages: "Top pages",
	entry_pages: "Top entry pages",
	exit_pages: "Top exit pages",
	not_found: "Pages not found",
	channels: "Top channels",
	sources: "Top sources",
	campaigns: "Top campaigns",
	ai_referrals: "AI referrals",
	countries: "Top countries",
	regions: "Top regions",
	os: "Operating systems",
	events: "Top events",
	event_props: "Event properties",
	outbound: "Outbound links",
	scroll: "Scroll depth",
	search_queries: "Top search queries",
	search_pages: "Top pages in search",
	links: "Top links"
};
/** The change of a KPI or impact tile against its comparison; null with no comparison. */
function tileChange(d) {
	if (d.compare === void 0 || !d.metric) return null;
	return describeChange(d.metric, d.value, d.compare?.[d.metric], {
		format: valueFormat(d.metric, d.currency),
		base: rateBase(d.compare)
	});
}
/** The tile's own title, else a display title (stored tiles are not changed): "Sessions over time", "Visitors", "Top pages". */
function tileTitle(tile, currency) {
	const keys = tile.metrics ?? (tile.metric && tile.kind !== "table" ? [tile.metric] : []);
	const m = keys.length ? joinLabels(keys.map(metricLabel)) : null;
	const auto = !m ? REPORT_TITLES[tile.report] ?? metricLabel(tile.report) : tile.report === "impact" ? `Impact on ${m.toLowerCase()}` : tile.kind === "line" || tile.kind === "area" || tile.kind === "stacked" ? `${m} over time` : m;
	return `${tile.title ?? auto}${currency ? ` (${currency})` : ""}`;
}
/** "Visitors", "Visitors and Sessions", "Visitors, Sessions and Pageviews". */
const joinLabels = (labels) => labels.length < 2 ? labels[0] ?? "" : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
const n = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
/** `goalName` is the name of `params.goal` (the goals report has one row per goal name). */
function tileData(tile, result, opts = {}) {
	const d = result.data;
	const notices = [...result.notices, ...d.notices ?? []];
	const rows = d.rows ?? [];
	const m = tile.metric ?? tile.metrics?.[0];
	const out = {
		kind: tile.kind,
		metric: m ?? null,
		value: null,
		buckets: [],
		lines: [],
		rows: [],
		columns: [],
		notices
	};
	const series = d.series ?? [];
	if (d.periods) out.period = periodLine(d.periods);
	if (typeof d.hidden_terms === "number" && d.hidden_terms > 0) out.footnote = hiddenTermsText(d.hidden_terms);
	if (typeof d.currency === "string") out.currency = d.currency;
	if (typeof d.currency === "string" && tile.report !== "impact") {
		const list = d.currencies ?? [];
		out.otherCurrencies = list.filter((c) => c.currency !== d.currency).map(({ currency, revenue, orders }) => ({
			currency,
			revenue,
			orders
		}));
		if (d.hasRevenue === false || tile.report !== "revenue" && !list.length) return {
			...out,
			empty: REVENUE_EMPTY
		};
	}
	if (tile.report === "impact") {
		if (d.no_annotation) return {
			...out,
			empty: SEO_TEXT.noAnnotation
		};
		if (d.not_yet) return {
			...out,
			empty: `The first comparison is possible on ${String(d.not_yet)}.`
		};
		const v = (k) => n(d[k]);
		out.impact = {
			before: v("before"),
			after: v("after"),
			complete: d.complete === true,
			daysAfter: v("days_after") ?? 0,
			day: String(d.day ?? ""),
			...typeof d.notable === "boolean" ? { notable: d.notable } : {}
		};
		out.value = v("after");
		if (m) out.compare = { [m]: v("before") };
		if (tile.kind === "line" && m) {
			out.buckets = series.map((p) => String(p.t));
			out.lines = [{
				key: m,
				values: series.map((p) => n(p.value)),
				compare: null
			}];
		}
		return out;
	}
	if (tile.kind === "stacked") {
		const keys = d.keys ?? [];
		out.stack = {
			keys,
			labels: d.labels ?? keys,
			series: (d.series ?? []).map((p) => ({
				t: p.t,
				values: Object.fromEntries(keys.map((k) => [k, n(p[k]) ?? 0]))
			}))
		};
		out.metric = typeof d.metric === "string" ? d.metric : null;
		return out;
	}
	if (tile.kind === "kpi" && m) {
		const row = tile.report === "goals" ? rows.find((r) => r.key === opts.goalName) : void 0;
		const src = tile.report === "goals" ? row : d.totals;
		const prev = tile.report === "goals" ? row && "previous" in row ? row.previous : void 0 : "compareTotals" in d ? d.compareTotals : void 0;
		out.value = n(src?.[m]);
		if (prev !== void 0) out.compare = prev ?? null;
		return out;
	}
	if (tile.kind === "line" || tile.kind === "area") {
		const cmp = d.compareSeries;
		out.buckets = series.map((p) => String(p.t));
		out.lines = (tile.metrics ?? []).map((k) => ({
			key: k,
			values: series.map((p) => n(p[k])),
			compare: cmp ? cmp.map((p) => n(p[k])) : null
		}));
		if (cmp && result.compare === "segment" && result.compareSegment) out.compareLabel = result.compareSegment.name;
		else if (cmp && result.compareRange) out.compareLabel = rangeText(result.compareRange.from, result.compareRange.to);
		if (Array.isArray(d.annotations) && d.annotations.length) out.annotations = d.annotations;
		if (d.granularity === "hour" || d.granularity === "week" || d.granularity === "day") out.granularity = d.granularity;
		return out;
	}
	const limited = rows.slice(0, tile.limit ?? 10);
	const first = limited[0] ?? {};
	const label = "query" in first ? "query" : "key";
	const columns = [label, ...Object.keys(first).filter((k) => !SKIP.has(k) && k !== label && (first[k] === null || typeof first[k] !== "object"))];
	out.columns = tile.kind === "table" ? columns.slice(0, 4) : columns;
	if (tile.kind === "table") {
		out.rows = limited.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "boolean" ? v ? "yes" : "no" : v])));
		return out;
	}
	const metric = m && m in first ? m : out.columns.find((k) => k !== "key" && typeof first[k] === "number") ?? null;
	out.metric = metric;
	const bars = limited.map((r) => ({
		label: String(r.key ?? ""),
		value: metric ? n(r[metric]) ?? 0 : 0
	}));
	out.rows = tile.kind === "donut" ? foldSlices(bars) : bars;
	return out;
}
const ESC = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
};
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const e = escapeHtml;
const MUTED = "#94a3b8";
const c = (i) => COLORS[i % COLORS.length];
/** Line colour of a series slot: the light values of the admin's slot tokens (blue, emerald, orange, purple), each at least 3:1 on white. */
const SLOT_HEX = [
	"#2563eb",
	"#059669",
	"#ea580c",
	"#9333ea"
];
const slotHex = (slot) => SLOT_HEX[slot % SLOT_HEX.length];
const presetLabel$1 = (p) => PRESETS.find((x) => x[0] === p)?.[1] ?? p;
const CSS = `*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;background:#f8fafc}
header,main,footer{max-width:1200px;margin:0 auto;padding:16px}h1{font-size:22px;margin:0 0 8px}h2{font-size:14px;margin:0 0 8px}
nav{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}nav a{padding:4px 10px;border:1px solid #cbd5e1;border-radius:999px;color:#0f172a;text-decoration:none}
nav a[aria-current]{background:#0f172a;color:#fff;border-color:#0f172a}.upd{color:#64748b;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.w2{grid-column:span 2}.w3{grid-column:span 3}
section{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;min-width:0;overflow-x:auto}
.kpi{font-size:28px;font-weight:600}.better{color:#15803d}.worse{color:#b91c1c}.same{color:#64748b}.note{color:#92400e;font-size:12px;margin:0 0 6px}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #f1f5f9}td.n,th.n{text-align:right}
svg{display:block;width:100%;height:auto}.lg{display:flex;flex-wrap:wrap;gap:4px 12px;margin:6px 0 0;font-size:12px;color:#334155}.caps{display:flex;justify-content:space-between;margin:0 0 4px;font-size:11px;color:#64748b}footer{color:#64748b;font-size:12px}footer p{margin:4px 0}
@media (max-width:720px){.grid{grid-template-columns:1fr}.w2,.w3{grid-column:auto}}`;
function kpi(d) {
	const f = valueFormat(d.metric ?? "", d.currency);
	if (d.impact) {
		const i = d.impact;
		const change = changeHtml(tileChange(d), i.notable === false ? " (not notable)" : "");
		const partial = i.complete ? "" : `<p class="note">${e(`The after window has ${i.daysAfter} days so far; numbers will change.`)}</p>`;
		return `<div class="kpi">${e(fmt(i.after, f))}</div><div>Before: ${e(fmt(i.before, f))}, after ${e(i.day)}</div>${change}${partial}`;
	}
	return `<div class="kpi">${e(formatValue(d.metric, d.value, d.currency))}</div>${changeHtml(tileChange(d))}`;
}
/** The change line (arrow, label and the better or worse word, never colour alone) and the detail line under it. */
function changeHtml(c, tail = "") {
	if (!c) return "";
	if (c.kind === "none") return `<div class="same" title="${e(c.note)}">${e(c.label)}</div>`;
	return `<div class="${c.muted || c.judgement === "neutral" ? "same" : c.judgement ?? "same"}">${e(changeText(c, true))}${e(tail)}</div>${c.detail ? `<div class="upd">${e(c.detail)}</div>` : ""}`;
}
/** Marker groups (dashed line, dot, count badge, native `<title>`) and the list under the chart. */
function annotationParts(d, sc, tz) {
	const list = d.annotations ?? [];
	if (!list.length) return {
		svg: "",
		list: "",
		count: 0
	};
	const index = new Map(d.buckets.map((t, i) => [t, i]));
	const gran = d.granularity ?? "day";
	const groups = markerGroups(list.map((a) => ({
		t: annotationBucket(a.ts, gran, tz),
		a
	})), (t) => {
		const i = index.get(t);
		return i === void 0 ? void 0 : sc.x(i);
	});
	const svg = groups.map((g) => {
		const tip = `${annotationCount(g.count)} on ${groupDate(g)}: ${g.markers.map((m) => m.a.text).join("; ")}`;
		const badge = g.count > 1 ? `<text x="${r1(g.x + 6)}" y="${sc.top - 4}" font-size="9" fill="${c(2)}">${g.count}</text>` : "";
		return `<g data-marker="${e(g.ts[0])}"><title>${e(tip)}</title><line x1="${g.x}" x2="${g.x}" y1="${sc.top}" y2="${sc.bottom}" stroke="${c(2)}" stroke-dasharray="2 2"/><circle cx="${g.x}" cy="${sc.top}" r="4" fill="${c(2)}"/>${badge}</g>`;
	}).join("");
	const shown = groups.flatMap((g) => g.markers.map((m) => m.a));
	const items = shown.slice(0, 12).map((a) => `<li><time datetime="${e(a.day)}">${e(a.day)}</time> ${e(a.text)} <span style="color:#64748b">(${e(KIND_LABELS[a.kind] ?? a.kind)}, ${e(a.summary)})</span></li>`);
	if (shown.length > 12) items.push(`<li>and ${shown.length - 12} more</li>`);
	return {
		svg,
		list: shown.length ? `<ul aria-label="Annotations" style="margin:6px 0 0;padding-left:18px;font-size:12px">${items.join("")}</ul>` : "",
		count: shown.length
	};
}
/** A small legend swatch: the slot shape, solid or as a dashed stroke for the comparison. */
const swatch = (slot, dashed = false) => `<svg viewBox="0 0 16 10" width="16" height="10" aria-hidden="true" style="display:inline;width:16px;vertical-align:middle">${dashed ? `<line x1="0" x2="16" y1="5" y2="5" stroke="${slotHex(slot)}" stroke-dasharray="4 3" stroke-width="1.5"/>` : `<path d="${shapePath(slot, 8, 5, 4)}" fill="${slotHex(slot)}"/>`}</svg>`;
/** Lines of one tile: up to 4 series on at most two axes, dashed comparisons in the series colour, a legend and direct labels. */
function line(d, title, area, tz) {
	const height = 180;
	const n = d.buckets.length;
	const compare = d.lines.some((l) => l.compare);
	const lines = compare ? d.lines.slice(0, 2) : d.lines;
	const axes = lineAxes(lines);
	const sc = lineScale(n, [], height);
	const [left, right] = ["left", "right"].map((side) => {
		const list = lines.filter((l) => axes[l.key] === side);
		return {
			list,
			scale: axisScale(list.flatMap((l) => [...l.values, ...l.compare ?? []]), sc.top, sc.bottom, list.some((l) => l.key === "position")),
			format: valueFormat(list[0]?.key ?? "", d.currency)
		};
	});
	const yOf = (l) => (axes[l.key] === "right" ? right : left).scale.y;
	const path = (vals, l) => linePath(vals.slice(0, Math.max(n, 1)), {
		x: sc.x,
		y: yOf(l)
	});
	const val = (l, v) => formatValue(l.key, v, d.currency);
	const parts = left.scale.ticks.map((v, k) => {
		const y = left.scale.y(v);
		const r = right.list.length ? `<text x="600" y="${r1(y - 3)}" font-size="10" fill="${MUTED}" text-anchor="end">${e(fmtTick(right.scale.ticks[k] ?? 0, right.format))}</text>` : "";
		return `<line x1="0" x2="600" y1="${y}" y2="${y}" stroke="${MUTED}" stroke-opacity="0.3"${k === (left.scale.invert ? 2 : 0) ? "" : " stroke-dasharray=\"2 3\""}/><text x="0" y="${r1(y - 3)}" font-size="10" fill="${MUTED}">${e(fmtTick(v, left.format))}</text>${r}`;
	});
	lines.forEach((l, slot) => {
		const cur = path(l.values, l);
		if (area && lines.length === 1 && n > 0 && cur && l.values.every((v) => v !== null) && l.key !== "position") parts.push(`<path d="${areaPath(cur, n, {
			x: sc.x,
			bottom: sc.bottom
		})}" fill="${slotHex(slot)}" fill-opacity="0.12"/>`);
		if (l.compare?.length) parts.push(`<path d="${path(l.compare, l)}" fill="none" stroke="${slotHex(slot)}" stroke-opacity="0.6" stroke-dasharray="4 3" stroke-width="1.5" data-compare="${e(l.key)}"/>`);
		if (cur) parts.push(`<path d="${cur}" fill="none" stroke="${slotHex(slot)}" stroke-width="2" data-series="${e(l.key)}"/>`);
		if (n === 1 && l.values[0] != null) parts.push(`<path d="${shapePath(slot, sc.x(0), yOf(l)(l.values[0]), 4)}" fill="${slotHex(slot)}"/>`);
	});
	const ends = lines.map((l, slot) => {
		let i = n - 1;
		while (i >= 0 && l.values[i] == null) i--;
		return i < 0 ? null : {
			l,
			slot,
			i,
			y: yOf(l)(l.values[i] ?? null)
		};
	});
	const ys = ends.flatMap((p) => p ? [p.y] : []).sort((a, b) => a - b);
	if (lines.length > 1 && !right.list.length && n > 1 && ys.every((y, i) => i === 0 || y - ys[i - 1] >= 14)) {
		for (const p of ends) if (p) parts.push(`<text x="${r1(sc.x(p.i) - 6)}" y="${r1(p.y - 6)}" font-size="10" text-anchor="end" fill="#334155" data-end="${e(p.l.key)}">${e(metricLabel(p.l.key))}</text>`);
	}
	d.buckets.forEach((t, i) => {
		const now = lines.map((l) => `${metricLabel(l.key)} ${val(l, l.values[i] ?? null)}`).join(", ");
		const was = compare ? `; ${d.compareLabel ?? "comparison"}: ${lines.map((l) => `${metricLabel(l.key)} ${val(l, l.compare?.[i] ?? null)}`).join(", ")}` : "";
		parts.push(`<rect x="${r1(sc.x(i) - sc.step / 2)}" y="0" width="${r1(sc.step)}" height="${height}" fill="transparent"><title>${e(`${t}: ${now}${was}`)}</title></rect>`);
	});
	if (n > 0) parts.push(`<text x="0" y="176" font-size="10" fill="${MUTED}">${e(d.buckets[0])}</text><text x="600" y="176" font-size="10" fill="${MUTED}" text-anchor="end">${e(d.buckets[n - 1])}</text>`);
	const ann = annotationParts(d, sc, tz);
	parts.push(ann.svg);
	const mi = d.impact ? d.buckets.indexOf(d.impact.day) : -1;
	if (mi >= 0) parts.push(`<g data-marker="${e(d.impact?.day)}"><title>${e(`Change on ${d.impact?.day}`)}</title><line x1="${sc.x(mi)}" x2="${sc.x(mi)}" y1="${sc.top}" y2="${sc.bottom}" stroke="${c(2)}" stroke-dasharray="2 2"/></g>`);
	const label = `${title}, ${n} points${ann.count ? `, ${annotationCount(ann.count)}` : ""}`;
	const caps = right.list.length ? `<p class="caps"><span>${e(left.list.map((l) => metricLabel(l.key)).join(", "))}</span><span>${e(right.list.map((l) => metricLabel(l.key)).join(", "))}</span></p>` : "";
	const legend = lines.length > 1 || compare ? `<p class="lg">${lines.map((l, slot) => `<span>${swatch(slot)} ${e(metricLabel(l.key))}</span>`).join("")}${compare ? `<span>${swatch(0, true)} Dashed: ${e(d.compareLabel ?? "comparison")}</span>` : ""}</p>` : "";
	const trimmed = compare && d.lines.length > lines.length ? `<p class="upd">${e(TRIMMED_COMPARE)}</p>` : "";
	return `${caps}<svg viewBox="0 0 600 ${height}" role="img" aria-label="${e(label)}">${parts.join("")}</svg>${legend}${trimmed}${ann.list}`;
}
function rowsTable(rows, metric, title, currency) {
	return `<table aria-label="${e(title)}"><thead><tr><th scope="col">Name</th><th scope="col" class="n">${e(valueLabel(metric ?? "value", currency))}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${e(r.label)}</td><td class="n">${e(formatValue(metric, r.value, currency))}</td></tr>`).join("")}</tbody></table>`;
}
function bars(d, title) {
	const rows = d.rows;
	const max = Math.max(1, ...rows.map((r) => r.value));
	const rowH = 22;
	const g = rows.map((r, i) => `<g transform="translate(0 ${i * rowH})"><rect x="0" y="2" width="${barWidth(r.value, max)}" height="18" fill="${c(0)}" fill-opacity="0.18"/><text x="6" y="15" font-size="12">${e(r.label)}</text><text x="596" y="15" font-size="12" text-anchor="end">${e(formatValue(d.metric, r.value, d.currency))}</text></g>`).join("");
	return `<svg viewBox="0 0 600 ${rows.length * rowH}" role="img" aria-label="${e(title)}">${g}</svg>${rowsTable(rows, d.metric, title, d.currency)}`;
}
function donut(d, title) {
	const rows = d.rows;
	const arcs = donutArcs(rows).map((a, i) => `<circle cx="50" cy="50" r="40" fill="none" stroke="${c(i)}" stroke-width="14" stroke-dasharray="${a.dasharray}" stroke-dashoffset="${a.dashoffset}" transform="rotate(-90 50 50)"><title>${e(`${a.label}: ${fmt(a.share, "percent")}`)}</title></circle>`).join("");
	return `<svg viewBox="0 0 100 100" style="max-width:160px" role="img" aria-label="${e(title)}"><circle cx="50" cy="50" r="40" fill="none" stroke="${MUTED}" stroke-opacity="0.2" stroke-width="14"/>${arcs}</svg>${rowsTable(rows, d.metric, title, d.currency)}`;
}
function table(d, title) {
	const head = d.columns.map((k) => `<th scope="col"${k === "key" ? "" : " class=\"n\""}>${e(valueLabel(k, d.currency))}</th>`).join("");
	const body = d.rows.map((r) => `<tr>${d.columns.map((k) => k === "key" ? `<td>${e(fmt(r[k], "text"))}</td>` : `<td class="n">${e(formatValue(k, r[k], d.currency))}</td>`).join("")}</tr>`).join("");
	return `<table aria-label="${e(title)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
/** Stacked bars: one `<rect>` per segment with a `<title>`, then the same values as a table. */
function stacked(d, title) {
	const st = d.stack;
	if (!st || !st.series.length) return "<p>No data for this range.</p>";
	const height = 160;
	const g = stackedRects(st.series.map((p) => ({ parts: st.keys.map((k) => p.values[k] ?? 0) })), height).map((col, i) => {
		const p = st.series[i];
		return col.map((r, j) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${c(j)}"><title>${e(`${p?.t}: ${st.labels[j] ?? st.keys[j]} ${fmt(p?.values[st.keys[j]] ?? 0)}`)}</title></rect>`).join("");
	}).join("");
	const head = `<th scope="col">Period</th>${st.labels.map((l) => `<th scope="col" class="n">${e(l)}</th>`).join("")}`;
	const body = st.series.map((p) => `<tr><td>${e(p.t)}</td>${st.keys.map((k) => `<td class="n">${e(fmt(p.values[k] ?? 0))}</td>`).join("")}</tr>`).join("");
	return `<svg viewBox="0 0 600 ${height}" role="img" aria-label="${e(`${title}, ${st.series.length} bars`)}">${g}</svg><table aria-label="${e(title)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
function tileBody(d, title, tz) {
	if (!d) return "<p>This tile could not be loaded.</p>";
	if (d.empty) return `<p>${e(d.empty)}</p>`;
	if (d.kind === "stacked") return stacked(d, title);
	if (d.kind === "kpi") return kpi(d);
	if (d.kind === "line" || d.kind === "area") return d.buckets.length && d.lines.length ? line(d, title, d.kind === "area", tz) : "<p>No data for this range.</p>";
	if (!d.rows.length) return "<p>No data for this range.</p>";
	if (d.kind === "bars") return bars(d, title);
	if (d.kind === "donut") return donut(d, title);
	return table(d, title);
}
const VISITOR_KEYS = /* @__PURE__ */ new Set(["visitors", "converting"]);
/** Caveats the tiles need: per-day visitors (11.3), satisfaction estimates (31.4), search data lag (25), summaries. */
function footnotes(input) {
	const out = /* @__PURE__ */ new Set();
	input.dashboard.tiles.forEach((t, i) => {
		const d = input.tiles[i];
		if (d?.metric && VISITOR_KEYS.has(d.metric) || d?.lines.some((l) => VISITOR_KEYS.has(l.key)) || d?.columns.includes("visitors")) out.add(CAVEATS.visitors);
		if (t.report === "satisfaction" || t.report === "satisfaction_series") out.add(CAVEATS.satisfaction_estimate);
		if (tileNeedsSearch(t)) out.add(CAVEATS.searchLag);
		if (d?.notices.includes("coverage")) out.add(SEO_TEXT.coverage);
		if (d?.period) out.add(d.period);
		if (d?.footnote) out.add(d.footnote);
		if (t.report === "impact") out.add(SEO_TEXT.caution);
	});
	return [...out];
}
function href(range, compare) {
	return `?r=${encodeURIComponent(range)}${compare ? "&c=1" : ""}`;
}
function renderShared(input) {
	const { dashboard: dash, range, compare } = input;
	const updated = (/* @__PURE__ */ new Date(input.generatedAt * 1e3)).toISOString();
	const nav = input.ranges.map((p) => `<a href="${e(href(p, compare))}"${p === range ? " aria-current=\"page\"" : ""}>${e(presetLabel$1(p))}</a>`);
	const cmpText = dash.defaults.compare === "segment" ? "Compare with another segment" : "Compare with previous period";
	if (input.allowCompare) nav.push(`<a href="${e(href(range, !compare))}"${compare ? " aria-current=\"true\"" : ""}>${cmpText}</a>`);
	const tiles = dash.tiles.map((t, i) => {
		const d = input.tiles[i] ?? null;
		const title = tileTitle(t, d?.currency);
		const hid = `t-${t.id}`;
		const notes = d ? noticeText(d.notices).map((n) => `<p class="note">${e(n)}</p>`).join("") : "";
		const money = d && !d.empty ? currencyLines(d).map((l) => `<p class="upd">${e(l)}</p>`).join("") : "";
		return `<section class="w${t.w}" aria-labelledby="${hid}"><h2 id="${hid}">${e(title)}</h2>${notes}${tileBody(d, title, input.tz ?? "UTC")}${money}</section>`;
	});
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>${e(dash.name)}</title><style>${CSS}</style></head><body><header><h1>${e(dash.name)}</h1><nav aria-label="Date range">${nav.join("")}</nav><p class="upd">Updated <time datetime="${e(updated)}">${e(updated.slice(0, 16).replace("T", " "))}</time> UTC</p></header><main class="grid">${tiles.join("")}</main><footer>${footnotes(input).map((f) => `<p>${e(f)}</p>`).join("")}<p>Shared view</p></footer></body></html>`;
}
// src/dashboards/email.ts
/**
* Scheduled dashboard email body: `renderEmail` returns `{ subject, text, html }`. The HTML is table
* based with inline styles, because mail clients strip SVG: KPI tiles as label, value and change; series tiles as one
* line with latest, previous and change; breakdowns and tables as a table. No image, script, remote resource or share
* link; the only URL is the one link to the dashboard in the admin. Every dynamic string is escaped (paths, sources,
* event names and search terms are visitor controlled).
*/
const BUDGET_LINE = "Not included in this email: query budget reached.";
const TOO_LARGE_LINE = "Not included in this email: too large for an email.";
const presetLabel = (p) => PRESETS.find((x) => x[0] === p)?.[1] ?? p;
const S = {
	body: "margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a",
	box: "max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0",
	cell: "padding:12px 16px",
	h1: "font-size:20px;margin:0 0 4px",
	h2: "font-size:14px;margin:0 0 6px",
	muted: "color:#64748b;font-size:12px;margin:4px 0",
	kpi: "font-size:24px;font-weight:bold",
	th: "text-align:left;padding:3px 6px;border-bottom:1px solid #e2e8f0;font-size:12px",
	td: "text-align:left;padding:3px 6px;border-bottom:1px solid #f1f5f9;font-size:12px",
	num: "text-align:right;padding:3px 6px;border-bottom:1px solid #f1f5f9;font-size:12px"
};
/** Change colours with at least 4.5:1 on white; the words carry the meaning too. */
const JUDGE_COLOR = {
	better: "#15803d",
	worse: "#b91c1c",
	neutral: "#64748b"
};
/** The change line of a KPI tile under its value: arrow, label and word in the judgement colour, then the detail. */
function changeLine(d) {
	const c = tileChange(d);
	if (!c) return "";
	return `<p style="margin:2px 0 0;font-size:13px;color:${c.kind === "none" || c.muted ? JUDGE_COLOR.neutral : JUDGE_COLOR[c.judgement ?? "neutral"]}">${escapeHtml(changeText(c, true))}</p>${c.detail ? `<p style="${S.muted}">${escapeHtml(c.detail)}</p>` : ""}`;
}
/** A revenue tile whose site has no revenue is left out of the email. */
const omitted = (report, d) => report.startsWith("revenue") && d?.empty === "No revenue recorded yet";
const lastTwo = (l) => {
	const i = l.values.length - 1;
	return {
		latest: l.values[i] ?? null,
		previous: l.compare ? l.compare[i] ?? null : l.values[i - 1] ?? null
	};
};
/** Table rows of a tile as label and cells; `null` when the tile has no table form. */
function tableOf(d, maxRows) {
	if (d.kind === "table") {
		const rows = d.rows.slice(0, maxRows).map((r) => d.columns.map((k) => k === "key" || k === "query" ? fmt(r[k], "text") : formatValue(k, r[k], d.currency)));
		return {
			head: d.columns.map((k) => valueLabel(k, d.currency)),
			rows,
			numeric: d.columns.map((k) => k !== "key" && k !== "query")
		};
	}
	if (d.kind === "bars" || d.kind === "donut") {
		const rows = d.rows.slice(0, maxRows).map((r) => [r.label, formatValue(d.metric, r.value, d.currency)]);
		return {
			head: ["Name", valueLabel(d.metric ?? "value", d.currency)],
			rows,
			numeric: [false, true]
		};
	}
	if (d.kind === "stacked" && d.stack) {
		const last = d.stack.series[d.stack.series.length - 1];
		if (!last) return null;
		return {
			head: [`Period ${last.t}`, "Value"],
			rows: d.stack.keys.map((k, i) => [d.stack?.labels[i] ?? k, fmt(last.values[k] ?? 0)]),
			numeric: [false, true]
		};
	}
	return null;
}
/** The figures of one tile as plain lines (shared by the text part and the HTML lines). */
function lines(d) {
	if (d.empty) return [d.empty];
	if (d.kind === "kpi" && d.impact) {
		const i = d.impact;
		const c = tileChange(d);
		return [`After ${i.day}: ${formatValue(d.metric, i.after, d.currency)}, before: ${formatValue(d.metric, i.before, d.currency)}${c ? ` (${changeText(c, true)})` : ""}`];
	}
	if (d.kind === "kpi") {
		const c = tileChange(d);
		return [formatValue(d.metric, d.value, d.currency), ...c ? [changeText(c)] : []];
	}
	if (d.kind === "line" || d.kind === "area") {
		if (!d.buckets.length || !d.lines.length) return ["No data for this range."];
		return d.lines.map((l) => {
			const { latest, previous } = lastTwo(l);
			const c = describeChange(l.key, latest, previous, { format: valueFormat(l.key, d.currency) });
			return `${d.lines.length > 1 ? `${valueLabel(l.key, d.currency)}, latest` : "Latest"}: ${formatValue(l.key, latest, d.currency)}, previous: ${formatValue(l.key, previous, d.currency)}${c.kind !== "none" ? `, change: ${changeText(c, true)}` : ""}`;
		});
	}
	return [];
}
function tileHtml(title, t, maxRows) {
	const head = `<h2 style="${S.h2}">${escapeHtml(title)}</h2>`;
	if (t.budget) return `${head}<p style="${S.muted}">${escapeHtml(BUDGET_LINE)} Open the dashboard in the admin to see it.</p>`;
	const d = t.data;
	if (!d) return `${head}<p style="${S.muted}">This tile could not be loaded.</p>`;
	const notes = noticeText(d.notices).map((n) => `<p style="${S.muted}">${escapeHtml(n)}</p>`).join("");
	let body;
	const tbl = d.empty ? null : tableOf(d, maxRows);
	if (tbl) {
		if (!tbl.rows.length) body = `<p style="margin:0">No data for this range.</p>`;
		else body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${tbl.head.map((h, i) => `<th style="${tbl.numeric[i] ? S.num : S.th}">${escapeHtml(h)}</th>`).join("")}</tr>${tbl.rows.map((r) => `<tr>${r.map((c, i) => `<td style="${tbl.numeric[i] ? S.num : S.td}">${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</table>`;
	} else {
		const ls = lines(d);
		body = d.kind === "kpi" && !d.empty ? `<div style="${S.kpi}">${escapeHtml(ls[0] ?? "")}</div>${d.impact ? "" : changeLine(d)}` : ls.map((l) => `<p style="margin:0">${escapeHtml(l)}</p>`).join("");
	}
	const money = d.empty ? "" : currencyLines(d).map((l) => `<p style="${S.muted}">${escapeHtml(l)}</p>`).join("");
	const hidden = t.hiddenTerms ? `<p style="${S.muted}">${escapeHtml(hiddenLine(t.hiddenTerms))}</p>` : "";
	return `${head}${notes}${body}${money}${hidden}`;
}
const hiddenLine = (n) => `${n} search term${n === 1 ? "" : "s"} used in only one session ${n === 1 ? "is" : "are"} not shown.`;
function tileText(title, t, maxRows) {
	const out = [title.toUpperCase()];
	if (t.budget) out.push(`${BUDGET_LINE} Open the dashboard in the admin to see it.`);
	else if (!t.data) out.push("This tile could not be loaded.");
	else {
		const d = t.data;
		out.push(...noticeText(d.notices));
		const tbl = d.empty ? null : tableOf(d, maxRows);
		if (tbl) out.push(...tbl.rows.length ? tbl.rows.map((r) => `- ${r[0]}: ${r.slice(1).map((c, i) => `${tbl.head[i + 1]} ${c}`).join(", ")}`) : ["No data for this range."]);
		else out.push(...lines(d));
		if (!d.empty) out.push(...currencyLines(d));
		if (t.hiddenTerms) out.push(hiddenLine(t.hiddenTerms));
	}
	return out.join("\n");
}
const bytes = (s) => new TextEncoder().encode(s).length;
function renderEmail(input) {
	const { dashboard: dash } = input;
	const range = presetLabel(input.range);
	const subject = input.subject ?? `${dash.name}: ${range}`;
	const updated = (/* @__PURE__ */ new Date(input.generatedAt * 1e3)).toISOString().slice(0, 16).replace("T", " ");
	const sub = `${range}${input.compare ? ", compared with the previous period" : ""}. Updated ${updated} UTC.`;
	const shown = dash.tiles.flatMap((tile, i) => {
		const t = input.tiles[i] ?? { data: null };
		return omitted(tile.report, t.data) ? [] : [{
			title: tileTitle(tile, t.data?.currency),
			t
		}];
	});
	const notes = footnotes({
		dashboard: {
			...dash,
			tiles: dash.tiles
		},
		tiles: input.tiles.map((t) => t.data)
	});
	const build = (maxRows, bodies) => {
		const cells = shown.map(({ title, t }) => `<tr><td style="${S.cell};border-top:1px solid #e2e8f0">${bodies ? tileHtml(title, t, maxRows) : `<h2 style="${S.h2}">${escapeHtml(title)}</h2><p style="${S.muted}">${escapeHtml(TOO_LARGE_LINE)}</p>`}</td></tr>`).join("");
		const foot = notes.map((n) => `<p style="${S.muted}">${escapeHtml(n)}</p>`).join("");
		return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="${S.body}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${S.box}"><tr><td style="${S.cell}"><h1 style="${S.h1}">${escapeHtml(dash.name)}</h1><p style="${S.muted}">${escapeHtml(sub)}</p></td></tr>${cells}<tr><td style="${S.cell};border-top:1px solid #e2e8f0">${foot}<p style="font-size:13px;margin:8px 0 0"><a href="${escapeHtml(input.adminUrl)}" style="color:#2563eb">Open this dashboard in the admin</a></p></td></tr></table></td></tr></table></body></html>`;
	};
	let html = build(Number.POSITIVE_INFINITY, true);
	if (bytes(html) > 1e5) html = build(5, true);
	if (bytes(html) > 1e5) html = build(0, false);
	return {
		subject,
		text: [
			dash.name,
			sub,
			"",
			...shown.map(({ title, t }) => `${tileText(title, t, Number.POSITIVE_INFINITY)}\n`),
			...notes,
			"",
			`Open this dashboard in the admin: ${input.adminUrl}`
		].join("\n"),
		html
	};
}
// src/dashboards/mail.ts
/**
* Scheduled dashboard email: the next due time in the site timezone, the save rules, and the cron tick
* `mail` that sends at most one dashboard per run, one message per recipient, at most once per period.
*/
/** ISO weekday of a `YYYY-MM-DD` day, 1 is Monday. */
const isoWeekday = (day) => (/* @__PURE__ */ new Date(`${day}T00:00:00Z`)).getUTCDay() || 7;
/** The first due time strictly after `now` (epoch seconds), in the site timezone. */
function nextDue(e, tz, now) {
	let day = dayInZone(now, tz);
	for (let i = 0; i < 40; i++, day = addDays(day, 1)) {
		if (!(e.frequency === "weekly" ? isoWeekday(day) === e.weekday : Number(day.slice(8)) === e.monthday)) continue;
		const t = zonedToEpoch(day, e.hour, tz);
		if (t > now) return t;
	}
	throw new Error("no due time");
}
/** Save rules: at most 12 distinct requests, at most 6 with compare, at most 5 enabled schedules per site. */
function checkSchedule(d, email, otherEnabled) {
	if (!email.enabled) return;
	const n = distinctRequests(d);
	if (n > 12) throw new DashboardError("too_many_requests", `This dashboard needs ${n} distinct requests; an email allows at most 12. Remove or merge tiles.`);
	if (email.compare && n > 6) throw new DashboardError("too_many_requests", `With comparison an email allows at most 6 distinct requests; this dashboard needs ${n}.`);
	if (otherEnabled >= 5) throw new DashboardError("too_many_scheduled", `At most 5 scheduled emails per site.`);
}
/** The stored record after a schedule save: the send state is kept, `emailNext` follows `enabled`. */
function applySchedule(d, settings, tz, now) {
	const { email: old, emailNext: _n, ...rest } = d;
	const keep = old ? {
		...old.lastSent !== void 0 ? { lastSent: old.lastSent } : {},
		...old.lastError ? { lastError: old.lastError } : {}
	} : {};
	const email = {
		...settings,
		...keep
	};
	return readDashboard({
		...rest,
		email,
		...settings.enabled ? { emailNext: nextDue(settings, tz, now) } : {}
	});
}
/** A database that counts statements and refuses any beyond `budget`; `take` charges other queries (host KV and storage) to it. */
function countingDb(db, budget) {
	let used = 0;
	const take = (n) => {
		if (used + n > budget) throw new BudgetError();
		used += n;
	};
	return {
		used: () => used,
		take,
		db: {
			dialect: db.dialect,
			run: (sql, params) => (take(1), db.run(sql, params)),
			all: (sql, params) => (take(1), db.all(sql, params)),
			batch: (stmts) => (take(stmts.length), db.batch(stmts))
		}
	};
}
var BudgetError = class extends Error {
	code = "mail_budget";
	constructor() {
		super("query budget reached");
	}
};
/**
* Run the dashboard under `MAIL_STATEMENT_BUDGET` and render it. A request is not started when the statements used
* plus 4 (8 with compare) would exceed the budget, and the counting database refuses any statement beyond it.
*/
async function composeEmail(c, d, email) {
	const counting = countingDb(await c.db(d.site), 36);
	const rc = await c.runner(d.site, counting.db, c.now, counting.take);
	const compare = email.compare ? d.defaults.compare === "none" ? "previous" : d.defaults.compare : "none";
	const per = compare === "none" ? 4 : 8;
	let reserved = 0;
	const run = await runDashboard({
		...rc,
		async dispatch(body, a) {
			if (counting.used() + reserved + per > 36) throw new BudgetError();
			reserved += per;
			try {
				return await rc.dispatch(body, a);
			} finally {
				reserved -= per;
			}
		}
	}, d, {
		range: email.range,
		compare
	});
	const tiles = [];
	for (const [i, t] of d.tiles.entries()) {
		const r = run.tiles[i];
		if (r?.error?.code === "mail_budget") tiles.push({
			data: null,
			budget: true
		});
		else if (!r?.result) tiles.push({ data: null });
		else {
			const goalName = t.params?.goal && c.goalName && counting.used() < 36 ? (counting.take(1), await c.goalName(d.site, t.params.goal)) : void 0;
			const data = tileData(t, r.result, { goalName });
			const hidden = r.result.data.hidden_terms;
			tiles.push({
				data: {
					...data,
					notices: [...data.notices, ...r.notices]
				},
				...typeof hidden === "number" && hidden > 0 ? { hiddenTerms: hidden } : {}
			});
		}
	}
	return {
		...renderEmail({
			dashboard: d,
			tiles,
			range: email.range,
			compare: compare !== "none",
			subject: email.subject,
			adminUrl: c.adminUrl(d),
			generatedAt: c.now
		}),
		statements: counting.used()
	};
}
const LOCK_SECONDS = 300;
/** Due again on the next tick (they run 10 to 20 minutes apart). */
const RETRY_DELAY = 60;
/** One run of the `mail` cron task. */
async function runMailTick(c) {
	if (!c.email) return {
		sent: 0,
		failed: [],
		skipped: "no_provider"
	};
	const hit = (await c.dashboards.query({
		where: { emailNext: { lte: c.now } },
		orderBy: { emailNext: "asc" },
		limit: 1
	})).items[0];
	if (!hit) return {
		sent: 0,
		failed: [],
		skipped: "nothing_due"
	};
	const lockKey = `mail:lock:${hit.id}`;
	const lock = await c.kv.get(lockKey);
	if (lock && (lock.until ?? 0) <= c.now) await c.kv.delete(lockKey);
	if (!(await c.kv.compareAndSet(lockKey, null, { until: c.now + LOCK_SECONDS })).applied) return {
		id: hit.id,
		sent: 0,
		failed: [],
		skipped: "locked"
	};
	try {
		let d;
		try {
			d = readDashboard(hit.data);
		} catch {
			const { emailNext: _x, ...raw } = hit.data;
			await c.dashboards.put(hit.id, raw);
			return {
				id: hit.id,
				sent: 0,
				failed: [],
				skipped: "disabled"
			};
		}
		const email = d.email;
		if (!email?.enabled) {
			await c.dashboards.put(d.id, withoutNext(d));
			return {
				id: d.id,
				sent: 0,
				failed: [],
				skipped: "disabled"
			};
		}
		const retry = !!email.pending?.length;
		const to = retry ? email.pending : email.recipients;
		const next = nextDue(email, c.tz, c.now);
		await c.dashboards.put(d.id, {
			...d,
			emailNext: next
		});
		const failed = [];
		let lastError = "";
		let statements = 0;
		try {
			const msg = await composeEmail(c, d, email);
			statements = msg.statements;
			for (const addr of to) try {
				await c.email.send({
					to: addr,
					subject: msg.subject,
					text: msg.text,
					html: msg.html
				});
			} catch (err) {
				failed.push(addr);
				lastError = errText(err);
			}
		} catch (err) {
			failed.push(...to);
			lastError = errText(err);
		}
		const used = retry ? email.retries ?? 0 : 0;
		const { pending: _p, retries: _r, lastError: _l, ...base } = email;
		let state;
		let emailNext = next;
		if (!failed.length) state = {
			...base,
			lastSent: c.now
		};
		else if (used < 2) {
			state = {
				...base,
				...failed.length < to.length ? { lastSent: c.now } : {},
				lastError,
				pending: failed,
				retries: used + 1
			};
			emailNext = c.now + RETRY_DELAY;
		} else {
			state = {
				...base,
				lastError
			};
			c.log?.warn(`mail: ${failed.length} recipient(s) of dashboard ${d.id} failed after 2 retries`);
		}
		const cur = await c.dashboards.get(d.id).then((r) => r ? readDashboard(r) : null, () => null);
		if (cur?.email?.enabled) {
			const { pending: _cp, retries: _cr, lastError: _cl, lastSent: _cs, ...settings } = cur.email;
			const sendState = {
				...state.lastSent !== void 0 ? { lastSent: state.lastSent } : {},
				...state.lastError ? { lastError: state.lastError } : {},
				...state.pending ? {
					pending: state.pending,
					retries: state.retries
				} : {}
			};
			await c.dashboards.put(d.id, {
				...cur,
				email: {
					...settings,
					...sendState
				},
				emailNext: cur.emailNext !== next ? cur.emailNext : emailNext
			});
		}
		return {
			id: d.id,
			sent: to.length - failed.length,
			failed,
			statements
		};
	} finally {
		await c.kv.delete(lockKey);
	}
}
const errText = (err) => String(err?.message ?? err).slice(0, 300);
function withoutNext(d) {
	const { emailNext: _n, ...rest } = d;
	return rest;
}
/** Admin link of a dashboard: the only URL of an email. */
function adminUrl(origin, d, localSite) {
	return `${origin.replace(/\/+$/, "")}/_emdash/admin/plugins/${PLUGIN_ID}/dashboards?d=${d.id}${d.site === localSite ? "" : `&site=${encodeURIComponent(d.site)}`}`;
}
/**
* The compose context of the host: reports through `answer` over the given (counting) database, no annotations
* (an email has no chart), goal names for goal KPI tiles. `origin` is `siteOrigin`, else the host site URL.
*/
function mailDeps(env, base, s, origin) {
	return {
		tz: s.siteTimezone,
		db: env.db,
		adminUrl: (d) => adminUrl(s.siteOrigin || origin, d, s.siteId),
		async runner(site, db, now, take) {
			const ctx = take ? countedCtx(base, take) : base;
			return {
				site,
				tz: s.siteTimezone,
				now,
				dispatch: (b, a) => answer({
					...env,
					db: async (other) => other === void 0 || other === site ? db : env.db(other),
					now: () => now
				}, ctx, b, a),
				segmentExists: async (id) => (await ctx.storage.segments?.get(id))?.site === site
			};
		},
		goalName: async (site, id) => {
			const g = await base.storage.goals?.get(id);
			return g?.site === site && typeof g.name === "string" ? g.name : void 0;
		}
	};
}
/** `ctx` whose KV and plugin storage calls each take one statement: on the host both are database queries. */
function countedCtx(ctx, take) {
	const wrap = (o) => new Proxy(o, { get(t, p) {
		const v = Reflect.get(t, p);
		return typeof v === "function" ? (...a) => (take(1), v.apply(t, a)) : v;
	} });
	const storage = new Proxy(ctx.storage, { get: (t, p) => ((c) => c && typeof c === "object" ? wrap(c) : c)(Reflect.get(t, p)) });
	return {
		...ctx,
		storage,
		...ctx.kv ? { kv: wrap(ctx.kv) } : {}
	};
}
// src/dashboards/templates.ts
/** Templates: a dashboard with every segment, goal and funnel reference written as the record's name. */
/** Built-in gallery, in display order. */
const BUILTIN_TEMPLATES = {
	overview: {
		kind: "dashboard-template",
		v: 1,
		name: "Overview",
		description: "Visitors, traffic sources, top pages and audience at a glance.",
		tiles: [
			{
				"id": "ov0001",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "visitors"
			},
			{
				"id": "ov0002",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "pageviews"
			},
			{
				"id": "ov0003",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "bounce_rate"
			},
			{
				"id": "ov0004",
				"report": "timeseries",
				"kind": "area",
				"w": 3,
				"metrics": ["visitors", "sessions"]
			},
			{
				"id": "ov0005",
				"report": "channels",
				"kind": "bars",
				"w": 1
			},
			{
				"id": "ov0006",
				"report": "pages",
				"kind": "table",
				"w": 2,
				"title": "Top pages"
			},
			{
				"id": "ov0007",
				"report": "sources",
				"kind": "bars",
				"w": 1
			},
			{
				"id": "ov0008",
				"report": "countries",
				"kind": "donut",
				"w": 1
			},
			{
				"id": "ov0009",
				"report": "devices",
				"kind": "donut",
				"w": 1
			}
		],
		defaults: {
			"range": "30d",
			"compare": "previous",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d",
				"12m"
			],
			"compare": true
		}
	},
	content: {
		kind: "dashboard-template",
		v: 1,
		name: "Content",
		description: "Which pages people read, where they land and where they leave.",
		tiles: [
			{
				"id": "ct0001",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "pageviews"
			},
			{
				"id": "ct0002",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "views_per_session"
			},
			{
				"id": "ct0003",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "avg_duration"
			},
			{
				"id": "ct0004",
				"report": "pages",
				"kind": "table",
				"w": 3,
				"limit": 25,
				"title": "Pages"
			},
			{
				"id": "ct0005",
				"report": "entry_pages",
				"kind": "table",
				"w": 2,
				"title": "Landing pages"
			},
			{
				"id": "ct0006",
				"report": "scroll",
				"kind": "bars",
				"w": 1,
				"title": "Scroll depth"
			},
			{
				"id": "ct0007",
				"report": "exit_pages",
				"kind": "table",
				"w": 2
			},
			{
				"id": "ct0008",
				"report": "not_found",
				"kind": "table",
				"w": 1,
				"title": "Not found"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "previous",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d",
				"12m"
			],
			"compare": true
		}
	},
	acquisition: {
		kind: "dashboard-template",
		v: 1,
		name: "Acquisition",
		description: "Channels, referring sites, campaigns and AI assistants.",
		tiles: [
			{
				"id": "aq0001",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "sessions"
			},
			{
				"id": "aq0002",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "bounce_rate"
			},
			{
				"id": "aq0003",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "visitors"
			},
			{
				"id": "aq0004",
				"report": "timeseries",
				"kind": "line",
				"w": 3,
				"metrics": ["sessions"],
				"title": "Sessions over time"
			},
			{
				"id": "aq0005",
				"report": "channels",
				"kind": "donut",
				"w": 1
			},
			{
				"id": "aq0006",
				"report": "sources",
				"kind": "table",
				"w": 2,
				"title": "Referring sites"
			},
			{
				"id": "aq0007",
				"report": "campaigns",
				"kind": "table",
				"w": 2
			},
			{
				"id": "aq0008",
				"report": "ai_referrals",
				"kind": "bars",
				"w": 1,
				"title": "AI assistants"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "previous",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d",
				"12m"
			],
			"compare": true
		}
	},
	behaviour: {
		kind: "dashboard-template",
		v: 1,
		name: "Behaviour",
		description: "Events, outbound links, downloads and forms.",
		tiles: [
			{
				"id": "bh0001",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "views_per_session"
			},
			{
				"id": "bh0002",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "avg_duration"
			},
			{
				"id": "bh0003",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "bounce_rate"
			},
			{
				"id": "bh0004",
				"report": "events",
				"kind": "table",
				"w": 3,
				"title": "Events"
			},
			{
				"id": "bh0005",
				"report": "outbound",
				"kind": "bars",
				"w": 2,
				"title": "Outbound links"
			},
			{
				"id": "bh0006",
				"report": "downloads",
				"kind": "bars",
				"w": 1
			},
			{
				"id": "bh0007",
				"report": "forms",
				"kind": "table",
				"w": 2
			},
			{
				"id": "bh0008",
				"report": "scroll",
				"kind": "bars",
				"w": 1,
				"title": "Scroll depth"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "previous",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d",
				"12m"
			],
			"compare": true
		}
	},
	satisfaction: {
		kind: "dashboard-template",
		v: 1,
		name: "Search Satisfaction",
		description: "Long and short clicks, bad experiences, estimated pogo-sticking and the best and worst landing pages of organic search sessions.",
		tiles: [
			{
				"id": "st0001",
				"report": "satisfaction",
				"kind": "kpi",
				"w": 1,
				"metric": "pct_long"
			},
			{
				"id": "st0002",
				"report": "satisfaction",
				"kind": "kpi",
				"w": 1,
				"metric": "pct_short"
			},
			{
				"id": "st0003",
				"report": "satisfaction",
				"kind": "kpi",
				"w": 1,
				"metric": "pct_bad"
			},
			{
				"id": "st0004",
				"report": "satisfaction_series",
				"kind": "line",
				"w": 3,
				"metrics": ["pct_long"],
				"title": "Long clicks over time (organic search)"
			},
			{
				"id": "st0005",
				"report": "satisfaction",
				"kind": "kpi",
				"w": 1,
				"metric": "pogo_stick_rate"
			},
			{
				"id": "st0007",
				"report": "satisfaction_series",
				"kind": "line",
				"w": 3,
				"metrics": ["pogo_stick_rate"],
				"title": "Pogo-sticking over time (organic search)"
			},
			{
				"id": "st0006",
				"report": "satisfaction",
				"kind": "table",
				"w": 2,
				"title": "Landing pages (organic search)"
			},
			{
				"id": "st0008",
				"report": "satisfaction",
				"kind": "table",
				"w": 3,
				"title": "Best pages (organic search)",
				"params": { "rank": "best" }
			},
			{
				"id": "st0009",
				"report": "satisfaction",
				"kind": "table",
				"w": 3,
				"title": "Worst pages (organic search)",
				"params": { "rank": "worst" }
			}
		],
		defaults: {
			"range": "30d",
			"compare": "previous",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d",
				"12m"
			],
			"compare": true
		}
	},
	revenue: {
		kind: "dashboard-template",
		v: 1,
		name: "Revenue",
		description: "Revenue, orders and average order value in the site's default currency, by channel, source, landing page and goal.",
		tiles: [
			{
				"id": "rv0001",
				"report": "revenue",
				"kind": "kpi",
				"w": 1,
				"metric": "revenue"
			},
			{
				"id": "rv0002",
				"report": "revenue",
				"kind": "kpi",
				"w": 1,
				"metric": "orders"
			},
			{
				"id": "rv0003",
				"report": "revenue",
				"kind": "kpi",
				"w": 1,
				"metric": "aov",
				"title": "Average order value"
			},
			{
				"id": "rv0004",
				"report": "revenue",
				"kind": "kpi",
				"w": 1,
				"metric": "revenue_per_visitor",
				"title": "Revenue per visitor"
			},
			{
				"id": "rv0005",
				"report": "revenue_series",
				"kind": "area",
				"w": 2,
				"metrics": ["revenue"],
				"title": "Revenue over time"
			},
			{
				"id": "rv0006",
				"report": "revenue_breakdown",
				"kind": "bars",
				"w": 1,
				"params": { "dim": "channel" },
				"title": "Revenue by channel"
			},
			{
				"id": "rv0007",
				"report": "revenue_breakdown",
				"kind": "table",
				"w": 2,
				"params": { "dim": "source" },
				"title": "Revenue by source"
			},
			{
				"id": "rv0008",
				"report": "revenue_breakdown",
				"kind": "table",
				"w": 2,
				"params": { "dim": "entry" },
				"title": "Revenue by landing page"
			},
			{
				"id": "rv0009",
				"report": "revenue_breakdown",
				"kind": "table",
				"w": 1,
				"params": { "dim": "goal" },
				"title": "Revenue by goal"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "previous",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d",
				"12m"
			],
			"compare": true
		}
	},
	"weekly-digest": {
		kind: "dashboard-template",
		v: 1,
		name: "Weekly digest",
		description: "Last week at a glance for a scheduled email: visitors, sessions, pageviews, bounce rate, channels, top pages, sources and countries, compared with the week before.",
		tiles: [
			{
				"id": "wd0001",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "visitors"
			},
			{
				"id": "wd0002",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "sessions"
			},
			{
				"id": "wd0003",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "pageviews"
			},
			{
				"id": "wd0004",
				"report": "overview",
				"kind": "kpi",
				"w": 1,
				"metric": "bounce_rate"
			},
			{
				"id": "wd0005",
				"report": "channels",
				"kind": "table",
				"w": 2,
				"limit": 10,
				"title": "Channels"
			},
			{
				"id": "wd0006",
				"report": "pages",
				"kind": "table",
				"w": 3,
				"limit": 10,
				"title": "Top pages"
			},
			{
				"id": "wd0007",
				"report": "sources",
				"kind": "table",
				"w": 2,
				"limit": 10,
				"title": "Top sources"
			},
			{
				"id": "wd0008",
				"report": "countries",
				"kind": "table",
				"w": 1,
				"limit": 10,
				"title": "Countries"
			}
		],
		defaults: {
			"range": "7d",
			"compare": "previous",
			"filters": []
		},
		viewer: {
			"ranges": ["7d", "30d"],
			"compare": true
		}
	},
	search: {
		kind: "dashboard-template",
		v: 1,
		name: "Search",
		description: "Clicks, impressions, queries and pages from the connected Search sources.",
		tiles: [
			{
				"id": "se0001",
				"report": "search_overview",
				"kind": "kpi",
				"w": 1,
				"metric": "clicks"
			},
			{
				"id": "se0002",
				"report": "search_overview",
				"kind": "kpi",
				"w": 1,
				"metric": "impressions"
			},
			{
				"id": "se0003",
				"report": "search_overview",
				"kind": "kpi",
				"w": 1,
				"metric": "position"
			},
			{
				"id": "se0004",
				"report": "search_overview",
				"kind": "line",
				"w": 3,
				"metrics": ["clicks", "impressions"],
				"title": "Search clicks and impressions over time"
			},
			{
				"id": "se0005",
				"report": "search_queries",
				"kind": "table",
				"w": 2,
				"title": "Queries"
			},
			{
				"id": "se0006",
				"report": "search_pages",
				"kind": "table",
				"w": 1,
				"title": "Pages"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "previous",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d",
				"12m"
			],
			"compare": true
		}
	},
	"impact-last-changes": {
		kind: "dashboard-template",
		v: 1,
		name: "Impact of last changes",
		description: "The 28 days after the newest annotation against the 28 days before it.",
		tiles: [
			{
				"id": "im0001",
				"report": "impact",
				"kind": "kpi",
				"w": 1,
				"metric": "sessions",
				"title": "Sessions",
				"params": {
					"annotation": "latest",
					"window": 28,
					"report": "overview"
				}
			},
			{
				"id": "im0002",
				"report": "impact",
				"kind": "kpi",
				"w": 1,
				"metric": "sessions",
				"title": "Organic Search sessions",
				"params": {
					"annotation": "latest",
					"window": 28,
					"report": "channels",
					"key": "Organic Search"
				}
			},
			{
				"id": "im0003",
				"report": "impact",
				"kind": "kpi",
				"w": 1,
				"metric": "clicks",
				"title": "Search clicks",
				"params": {
					"annotation": "latest",
					"window": 28,
					"report": "search_overview"
				}
			},
			{
				"id": "im0004",
				"report": "impact",
				"kind": "kpi",
				"w": 1,
				"metric": "position",
				"title": "Search position",
				"params": {
					"annotation": "latest",
					"window": 28,
					"report": "search_overview"
				}
			},
			{
				"id": "im0005",
				"report": "impact",
				"kind": "kpi",
				"w": 1,
				"metric": "pct_long",
				"title": "Long click rate",
				"params": {
					"annotation": "latest",
					"window": 28,
					"report": "satisfaction"
				}
			},
			{
				"id": "im0006",
				"report": "impact",
				"kind": "kpi",
				"w": 1,
				"metric": "pct_bad",
				"title": "Bad experience rate",
				"params": {
					"annotation": "latest",
					"window": 28,
					"report": "satisfaction"
				}
			},
			{
				"id": "im0007",
				"report": "impact",
				"kind": "line",
				"w": 3,
				"metrics": ["sessions"],
				"title": "Sessions before and after",
				"params": {
					"annotation": "latest",
					"window": 28,
					"report": "overview"
				}
			}
		],
		defaults: {
			"range": "30d",
			"compare": "none",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d"
			],
			"compare": false
		}
	},
	"seo-overview": {
		kind: "dashboard-template",
		v: 1,
		name: "SEO overview",
		description: "Search clicks and positions, position bands, movement between bands, declining pages and striking distance.",
		tiles: [
			{
				"id": "so0001",
				"report": "search_overview",
				"kind": "kpi",
				"w": 1,
				"metric": "clicks"
			},
			{
				"id": "so0002",
				"report": "search_overview",
				"kind": "kpi",
				"w": 1,
				"metric": "impressions"
			},
			{
				"id": "so0003",
				"report": "search_overview",
				"kind": "kpi",
				"w": 1,
				"metric": "position"
			},
			{
				"id": "so0004",
				"report": "search_overview",
				"kind": "line",
				"w": 3,
				"metrics": ["clicks", "impressions"],
				"title": "Search clicks and impressions over time"
			},
			{
				"id": "so0005",
				"report": "search_position_bands",
				"kind": "bars",
				"w": 1,
				"title": "Queries by position band"
			},
			{
				"id": "so0006",
				"report": "search_position_moves",
				"kind": "kpi",
				"w": 1,
				"metric": "moved_up",
				"title": "Queries moved up"
			},
			{
				"id": "so0007",
				"report": "search_position_moves",
				"kind": "kpi",
				"w": 1,
				"metric": "moved_down",
				"title": "Queries moved down"
			},
			{
				"id": "so0008",
				"report": "search_movers",
				"kind": "table",
				"w": 3,
				"title": "Declining pages",
				"params": { "direction": "down" }
			},
			{
				"id": "so0009",
				"report": "search_striking_distance",
				"kind": "table",
				"w": 3,
				"title": "Striking distance"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "none",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d"
			],
			"compare": false
		}
	},
	cannibalization: {
		kind: "dashboard-template",
		v: 1,
		name: "Cannibalization",
		description: "Queries where several pages of the site compete, and the pages involved.",
		tiles: [
			{
				"id": "ca0001",
				"report": "search_cannibalization",
				"kind": "kpi",
				"w": 1,
				"metric": "cannibalized_queries",
				"title": "Cannibalized queries"
			},
			{
				"id": "ca0002",
				"report": "search_cannibalization",
				"kind": "kpi",
				"w": 1,
				"metric": "cannibalized_impressions",
				"title": "Their impressions"
			},
			{
				"id": "ca0003",
				"report": "search_cannibalization",
				"kind": "kpi",
				"w": 1,
				"metric": "visible_share",
				"title": "Visible share"
			},
			{
				"id": "ca0004",
				"report": "search_cannibalization",
				"kind": "table",
				"w": 3,
				"title": "Queries with competing pages"
			},
			{
				"id": "ca0005",
				"report": "search_cannibalization_pages",
				"kind": "table",
				"w": 3,
				"title": "Competing pages"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "none",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d"
			],
			"compare": false
		}
	},
	"position-bands": {
		kind: "dashboard-template",
		v: 1,
		name: "Position bands",
		description: "Queries per position band, the trend, movement between bands and pairs in striking distance.",
		tiles: [
			{
				"id": "pb0001",
				"report": "search_position_bands",
				"kind": "bars",
				"w": 1,
				"title": "Queries by band"
			},
			{
				"id": "pb0002",
				"report": "search_position_bands",
				"kind": "table",
				"w": 2,
				"title": "Bands"
			},
			{
				"id": "pb0003",
				"report": "search_position_bands_series",
				"kind": "stacked",
				"w": 3,
				"metric": "queries",
				"title": "Queries per band over time"
			},
			{
				"id": "pb0004",
				"report": "search_position_moves",
				"kind": "table",
				"w": 3,
				"title": "Movement between bands"
			},
			{
				"id": "pb0005",
				"report": "search_striking_distance",
				"kind": "table",
				"w": 3,
				"title": "Striking distance"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "none",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d"
			],
			"compare": false
		}
	},
	"winners-losers": {
		kind: "dashboard-template",
		v: 1,
		name: "Winners and losers",
		description: "Rising and declining pages and queries, new and lost queries, and content decay.",
		tiles: [
			{
				"id": "wl0001",
				"report": "search_movers",
				"kind": "table",
				"w": 1,
				"title": "Rising pages",
				"params": {
					"dim": "page",
					"direction": "up"
				}
			},
			{
				"id": "wl0002",
				"report": "search_movers",
				"kind": "table",
				"w": 2,
				"title": "Declining pages",
				"params": {
					"dim": "page",
					"direction": "down"
				}
			},
			{
				"id": "wl0003",
				"report": "search_movers",
				"kind": "table",
				"w": 1,
				"title": "Rising queries",
				"params": {
					"dim": "query",
					"direction": "up"
				}
			},
			{
				"id": "wl0004",
				"report": "search_movers",
				"kind": "table",
				"w": 2,
				"title": "Declining queries",
				"params": {
					"dim": "query",
					"direction": "down"
				}
			},
			{
				"id": "wl0005",
				"report": "search_position_moves",
				"kind": "table",
				"w": 1,
				"title": "New queries",
				"params": { "list": "new" }
			},
			{
				"id": "wl0006",
				"report": "search_position_moves",
				"kind": "table",
				"w": 2,
				"title": "Lost queries",
				"params": { "list": "lost" }
			},
			{
				"id": "wl0007",
				"report": "search_decay",
				"kind": "table",
				"w": 3,
				"title": "Declining over three periods"
			},
			{
				"id": "wl0008",
				"report": "traffic_movers",
				"kind": "table",
				"w": 1,
				"title": "Pages with fewer views",
				"params": { "direction": "down" }
			},
			{
				"id": "wl0009",
				"report": "traffic_decay",
				"kind": "table",
				"w": 2,
				"title": "Page views declining over three periods"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "none",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d"
			],
			"compare": false
		}
	},
	links: {
		kind: "dashboard-template",
		v: 1,
		name: "Links",
		description: "Impressions, clicks and click-through rate of short links by link, placement, page and channel, with the Link clicks goal.",
		tiles: [
			{
				"id": "lk0001",
				"report": "goals",
				"kind": "kpi",
				"w": 1,
				"metric": "completions",
				"params": { "goal": "Link clicks" },
				"title": "Link clicks"
			},
			{
				"id": "lk0002",
				"report": "goals",
				"kind": "kpi",
				"w": 1,
				"metric": "conversion_rate",
				"params": { "goal": "Link clicks" },
				"title": "Sessions with a link click"
			},
			{
				"id": "lk0003",
				"report": "links",
				"kind": "bars",
				"w": 1,
				"metric": "clicks",
				"params": { "by": "channel" },
				"title": "Clicks by channel"
			},
			{
				"id": "lk0004",
				"report": "links",
				"kind": "table",
				"w": 3,
				"params": { "by": "link" },
				"title": "Links"
			},
			{
				"id": "lk0005",
				"report": "links",
				"kind": "table",
				"w": 2,
				"params": { "by": "place" },
				"title": "Placements"
			},
			{
				"id": "lk0006",
				"report": "links",
				"kind": "bars",
				"w": 1,
				"metric": "clicks",
				"params": { "by": "page" },
				"title": "Clicks by page"
			}
		],
		defaults: {
			"range": "30d",
			"compare": "previous",
			"filters": []
		},
		viewer: {
			"ranges": [
				"7d",
				"30d",
				"90d"
			],
			"compare": true
		},
		dependencies: { "goals": [{
			"name": "Link clicks",
			"type": "event",
			"match": "is",
			"value": "out"
		}] }
	}
};
const BUILTIN_NAMES = Object.keys(BUILTIN_TEMPLATES);
Object.fromEntries(BUILTIN_NAMES.map((n) => [n, [
	"seo-overview",
	"cannibalization",
	"position-bands",
	"winners-losers"
].includes(n) ? "SEO" : "Analytics"]));
const DEP_KINDS = [
	"goals",
	"segments",
	"funnels"
];
const nameOf = (items, id) => id ? items.find((i) => i.id === id)?.data.name : void 0;
const goalNames = (filters) => (filters ?? []).filter((f) => f.dim === "goal").flatMap((f) => f.values);
const strip = ({ site: _s, ...rest }) => rest;
/** Ids to names; with `withDependencies` the full definitions of the referenced records are embedded. References that no longer exist are dropped. */
function toTemplate(d, deps, opts) {
	const tiles = d.tiles.flatMap((t) => {
		if (!t.params) return [t];
		const { goal, funnel, ...p } = t.params;
		const g = nameOf(deps.goals, goal);
		const f = nameOf(deps.funnels, funnel);
		if (goal && !g && t.kind === "kpi" || funnel && !f) return [];
		const params = {
			...p,
			...g ? { goal: g } : {},
			...f ? { funnel: f } : {}
		};
		return [Object.keys(params).length ? {
			...t,
			params
		} : (({ params: _p, ...rest }) => rest)(t)];
	});
	const segment = nameOf(deps.segments, d.defaults.segment);
	const compareSegment = nameOf(deps.segments, d.defaults.compareSegment);
	const tpl = {
		kind: "dashboard-template",
		v: 1,
		name: d.name,
		tiles,
		defaults: {
			...d.defaults,
			segment,
			compareSegment
		},
		viewer: d.viewer
	};
	if (!segment) delete tpl.defaults.segment;
	if (!compareSegment) delete tpl.defaults.compareSegment;
	if (tpl.defaults.compare === "segment" && !compareSegment) tpl.defaults.compare = "none";
	if (!opts.withDependencies) return tpl;
	const want = (kind, names) => {
		const set = new Set([...names].filter((n) => !!n));
		return deps[kind].filter((i) => set.has(i.data.name)).map((i) => strip(i.data));
	};
	const segments = want("segments", [segment, compareSegment]);
	const goals = want("goals", [
		...goalNames(d.defaults.filters),
		...tiles.flatMap((t) => [t.params?.goal, ...goalNames(t.filters)]),
		...segments.flatMap((s) => goalNames(s.filters))
	]);
	const funnels = want("funnels", tiles.map((t) => t.params?.funnel));
	tpl.dependencies = {
		...segments.length ? { segments } : {},
		...goals.length ? { goals } : {},
		...funnels.length ? { funnels } : {}
	};
	return tpl;
}
/** Structural validation of a template or a built-in name (a structural error rejects the whole template, naming the tiles). */
function readTemplate(input) {
	const raw = input.builtin !== void 0 ? BUILTIN_TEMPLATES[input.builtin] : input.template;
	const clean = raw && typeof raw === "object" ? withoutEmail(raw) : raw;
	return parseStrict(TemplateSchema, clean, "invalid_template");
}
/**
* Names to the target site's ids. An existing record of that name is reused and never overwritten; a missing one is
* created through `create` only with `createDependencies` and a definition in the template; otherwise the reference is
* dropped (a tile that cannot run without it is dropped) and listed.
*/
async function fromTemplate(tpl, lookups, opts) {
	const dependencies = [];
	const unresolved = [];
	const ids = /* @__PURE__ */ new Map();
	const resolve = async (kind, name, tile) => {
		const key = `${kind}\u0000${name}`;
		if (!ids.has(key)) {
			let id = lookups[kind].find((i) => i.data.name === name)?.id ?? null;
			const def = tpl.dependencies?.[kind]?.find((x) => x.name === name);
			if (!id && def && opts.createDependencies && opts.create) {
				id = await opts.create(kind, def);
				dependencies.push({
					kind,
					id,
					name
				});
			}
			ids.set(key, id);
		}
		const id = ids.get(key) ?? null;
		if (!id) unresolved.push({
			kind,
			name,
			tile
		});
		return id;
	};
	const filters = async (list, tile) => {
		const out = [];
		for (const f of list ?? []) {
			if (f.dim !== "goal") {
				out.push(f);
				continue;
			}
			const values = [];
			for (const v of f.values) if (await resolve("goals", v, tile)) values.push(v);
			if (values.length) out.push({
				...f,
				values
			});
		}
		return out;
	};
	for (const g of tpl.dependencies?.goals ?? []) if (opts.createDependencies) await resolve("goals", g.name, "defaults");
	unresolved.length = 0;
	const defaults = {
		...tpl.defaults,
		filters: await filters(tpl.defaults.filters, "defaults")
	};
	delete defaults.segment;
	if (tpl.defaults.segment) {
		const id = await resolve("segments", tpl.defaults.segment, "defaults");
		if (id) defaults.segment = id;
	}
	delete defaults.compareSegment;
	if (tpl.defaults.compareSegment) {
		const id = await resolve("segments", tpl.defaults.compareSegment, "defaults");
		if (id) defaults.compareSegment = id;
	}
	if (defaults.compare === "segment" && !defaults.compareSegment) defaults.compare = "none";
	const tiles = [];
	for (const t of tpl.tiles) {
		const tile = {
			...t,
			...t.filters ? { filters: await filters(t.filters, t.id) } : {}
		};
		if (t.params) {
			const { goal, funnel, ...p } = t.params;
			const g = goal ? await resolve("goals", goal, t.id) : null;
			const f = funnel ? await resolve("funnels", funnel, t.id) : null;
			if (goal && !g && t.kind === "kpi" || funnel && !f) continue;
			tile.params = {
				...p,
				...g ? { goal: g } : {},
				...f ? { funnel: f } : {}
			};
		}
		tiles.push(tile);
	}
	return {
		dashboard: {
			name: tpl.name,
			tiles,
			defaults,
			viewer: tpl.viewer
		},
		dependencies,
		unresolved
	};
}
/** The host text when no email provider is configured. */
const NO_PROVIDER_TEXT = "No email provider is configured. Install and activate an email provider plugin, then select it in Settings > Email.";
const TEST_SEND_SECONDS = 60;
/** `email` without recipients for callers below Admin, plus `recipientCount`. */
function forCaller(d, role) {
	if (!d.email) return d;
	if ((role ?? 0) >= 50) return {
		...d,
		recipientCount: d.email.recipients.length
	};
	const { recipients: _r, pending: _p, ...email } = d.email;
	return {
		...d,
		email,
		recipientCount: d.email.recipients.length
	};
}
const Id$1 = z.string().regex(/^[a-z0-9]{12}$/);
const Sites = z.array(z.string().regex(/^[a-z0-9-]{1,32}$/)).min(1).max(20);
const DashBodies = {
	list: z.object({ site: SiteField }).strict(),
	get: z.object({
		id: Id$1,
		site: SiteField
	}).strict(),
	save: z.object({
		dashboard: z.record(z.string(), z.unknown()),
		site: SiteField
	}).strict(),
	delete: z.object({
		id: Id$1,
		site: SiteField
	}).strict(),
	export: z.object({
		id: Id$1,
		site: SiteField,
		withDependencies: z.boolean().optional()
	}).strict(),
	import: z.object({
		sites: Sites,
		template: z.record(z.string(), z.unknown()).optional(),
		builtin: z.enum(BUILTIN_NAMES).optional(),
		createDependencies: z.boolean().optional()
	}).strict().refine((b) => b.template === void 0 !== (b.builtin === void 0), { message: "give template or builtin" }),
	copy: z.object({
		id: Id$1,
		site: SiteField,
		sites: Sites,
		createDependencies: z.boolean().optional()
	}).strict(),
	emailSave: z.object({
		id: Id$1,
		site: SiteField,
		email: EmailSettings
	}).strict(),
	emailTest: z.object({
		id: Id$1,
		site: SiteField
	}),
	emailStatus: z.object({ site: SiteField }).strict()
};
const typed$1 = (err) => {
	if (err instanceof DashboardError) throw new PluginRouteError(err.code, err.message, 400);
	throw err;
};
function dashboardRoutes(env) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1e3);
	/** Local, client or remote site; anything else is a typed 400. */
	async function site(ctx, requested) {
		const s = await env.settings();
		if (requested && requested !== s.siteId && env.remoteIds?.().includes(requested)) return {
			id: requested,
			remote: true
		};
		return {
			id: (await bindSite(requested, s.siteId, ctx.storage.sites)).id,
			remote: false
		};
	}
	const coll = (ctx) => {
		if (!ctx.storage.dashboards) throw new PluginRouteError("storage_unavailable", "The dashboards collection is not available.", 500);
		return ctx.storage.dashboards;
	};
	async function lookups(ctx, s) {
		const out = {
			goals: [],
			segments: [],
			funnels: []
		};
		if (s.remote) return out;
		for (const k of DEP_KINDS) out[k] = await loadAll(ctx.storage[k], { site: s.id });
		return out;
	}
	async function found(ctx, s, id) {
		const d = await getDashboard(coll(ctx), s.id, id).catch(typed$1);
		if (!d) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
		return d;
	}
	async function importInto(ctx, tplInput, sites, createDependencies) {
		let tpl;
		try {
			tpl = readTemplate(tplInput);
		} catch (err) {
			return typed$1(err);
		}
		const report = {
			created: [],
			dependencies: [],
			unresolved: [],
			failed: []
		};
		for (const requested of sites) try {
			const s = await site(ctx, requested);
			const create = async (kind, data) => {
				const route = env.config[`config/${kind}/save`];
				if (!route) throw new Error(`no config route for ${kind}`);
				return (await route.handler({
					input: {
						data,
						site: s.id
					},
					storage: ctx.storage
				})).id;
			};
			const r = await fromTemplate(tpl, await lookups(ctx, s), {
				createDependencies: createDependencies && !s.remote,
				create
			});
			report.dependencies.push(...r.dependencies.map((d) => ({
				site: s.id,
				...d
			})));
			report.unresolved.push(...r.unresolved.map((u) => ({
				site: s.id,
				...u
			})));
			const d = await saveDashboard(coll(ctx), s.id, r.dashboard, now());
			report.created.push({
				site: s.id,
				id: d.id
			});
		} catch (err) {
			const e = err;
			report.failed.push({
				site: requested,
				code: typeof e.code === "string" ? e.code : "error",
				message: String(e.message ?? err)
			});
		}
		return report;
	}
	return {
		"dashboards/list": {
			permission: "plugins:read",
			input: DashBodies.list,
			async handler(ctx) {
				const s = await site(ctx, DashBodies.list.parse(ctx.input ?? {}).site);
				const items = (await listDashboards(coll(ctx), s.id)).map((d) => forCaller(d, ctx.user?.role));
				const shares = {};
				if (ctx.storage.shares && !s.remote) for (const it of await loadAll(ctx.storage.shares, { site: s.id })) {
					const sh = it.data;
					const view = shareView(it.id, sh, now());
					const st = shareState(view);
					const cur = shares[sh.dashboard] ?? {
						count: 0,
						state: "none",
						views: 0,
						expires: null
					};
					const lead = cur.count === 0 || mostPermissive([cur.state, st]) !== cur.state;
					const link = lead ? {
						expires: view.expires,
						...view.label ? { label: view.label } : {}
					} : {
						expires: cur.expires,
						...cur.label ? { label: cur.label } : {}
					};
					shares[sh.dashboard] = {
						count: cur.count + 1,
						state: lead ? st : cur.state,
						views: cur.views + (sh.views ?? 0),
						...link
					};
				}
				return {
					site: s.id,
					items,
					shares
				};
			}
		},
		"dashboards/get": {
			permission: "plugins:read",
			input: DashBodies.get,
			async handler(ctx) {
				const b = DashBodies.get.parse(ctx.input);
				return forCaller(await found(ctx, await site(ctx, b.site), b.id), ctx.user?.role);
			}
		},
		"dashboards/save": {
			permission: "plugins:manage",
			input: DashBodies.save,
			async handler(ctx) {
				const b = DashBodies.save.parse(ctx.input);
				const s = await site(ctx, b.site);
				return forCaller(await saveDashboard(coll(ctx), s.id, b.dashboard, now()).catch(typed$1), ctx.user?.role);
			}
		},
		"dashboards/delete": {
			permission: "plugins:manage",
			input: DashBodies.delete,
			async handler(ctx) {
				const b = DashBodies.delete.parse(ctx.input);
				const s = await site(ctx, b.site);
				if (!await deleteDashboard(coll(ctx), s.id, b.id)) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
				if (ctx.storage.shares) await deleteSharesOf(ctx.storage.shares, s.id, b.id);
				return {
					id: b.id,
					deleted: true
				};
			}
		},
		"dashboards/export": {
			permission: "plugins:manage",
			input: DashBodies.export,
			async handler(ctx) {
				const b = DashBodies.export.parse(ctx.input);
				const s = await site(ctx, b.site);
				return toTemplate(await found(ctx, s, b.id), await lookups(ctx, s), { withDependencies: !!b.withDependencies });
			}
		},
		"dashboards/import": {
			permission: "plugins:manage",
			input: DashBodies.import,
			async handler(ctx) {
				const b = DashBodies.import.parse(ctx.input);
				return importInto(ctx, b.builtin !== void 0 ? { builtin: b.builtin } : { template: b.template }, b.sites, !!b.createDependencies);
			}
		},
		"dashboards/copy": {
			permission: "plugins:manage",
			input: DashBodies.copy,
			async handler(ctx) {
				const b = DashBodies.copy.parse(ctx.input);
				const s = await site(ctx, b.site);
				return importInto(ctx, { template: toTemplate(await found(ctx, s, b.id), await lookups(ctx, s), { withDependencies: true }) }, b.sites, !!b.createDependencies);
			}
		},
		"dashboards/email/status": {
			permission: "plugins:read",
			input: DashBodies.emailStatus,
			async handler(ctx) {
				const s = await site(ctx, DashBodies.emailStatus.parse(ctx.input ?? {}).site);
				const scheduled = s.remote ? 0 : (await listDashboards(coll(ctx), s.id)).filter((d) => d.email?.enabled).length;
				return {
					provider: !!ctx.email,
					scheduled,
					...ctx.email ? {} : { message: NO_PROVIDER_TEXT }
				};
			}
		},
		"dashboards/email/save": {
			permission: "plugins:manage",
			input: DashBodies.emailSave,
			async handler(ctx) {
				const b = DashBodies.emailSave.parse(ctx.input);
				const s = await site(ctx, b.site);
				if (s.remote) throw new PluginRouteError("remote_site_not_schedulable", "Dashboards of a remote site cannot be sent by email.", 400);
				if (!env.mail) throw new PluginRouteError("mail_unavailable", "Scheduled email is not available.", 500);
				const d = await found(ctx, s, b.id);
				const others = (await listDashboards(coll(ctx), s.id)).filter((x) => x.id !== d.id && x.email?.enabled).length;
				try {
					checkSchedule(d, b.email, others);
				} catch (err) {
					typed$1(err);
				}
				const record = applySchedule(d, b.email, (await env.mail(ctx)).tz, now());
				await coll(ctx).put(d.id, record);
				return forCaller(record, ctx.user?.role);
			}
		},
		"dashboards/email/send-test": {
			permission: "plugins:manage",
			input: DashBodies.emailTest,
			async handler(ctx) {
				const b = DashBodies.emailTest.parse(ctx.input);
				const to = ctx.user?.email;
				if (!to) throw new PluginRouteError("no_user", "A test email goes to your own address; this token has no user.", 400);
				if (!ctx.email) throw new PluginRouteError("no_provider", NO_PROVIDER_TEXT, 400);
				if (!env.mail || !ctx.kv) throw new PluginRouteError("mail_unavailable", "Scheduled email is not available.", 500);
				const s = await site(ctx, b.site);
				if (s.remote) throw new PluginRouteError("remote_site_not_schedulable", "Dashboards of a remote site cannot be sent by email.", 400);
				const d = await found(ctx, s, b.id);
				const key = `mail:test:${d.id}`;
				const last = await ctx.kv.get(key);
				if (last?.at !== void 0 && now() - last.at < TEST_SEND_SECONDS) throw new PluginRouteError("too_many_requests", "One test email per minute. Try again shortly.", 429);
				await ctx.kv.set(key, { at: now() });
				const msg = await composeEmail({
					...await env.mail(ctx),
					now: now()
				}, d, d.email ?? {
					range: d.defaults.range,
					compare: false
				});
				await ctx.email.send({
					to,
					subject: msg.subject,
					text: msg.text,
					html: msg.html
				});
				return {
					sent: true,
					to
				};
			}
		}
	};
}
// src/query/purge.ts
/** Every fact row of a site, in delete order; `day` steps remove one day per chunk. */
const SITE_STEPS = [
	{
		name: "sessions",
		table: "ca_sessions",
		mode: "rows",
		pk: "sid",
		where: "1 = ?",
		cutoff: 1
	},
	{
		name: "aliases",
		table: "ca_aliases",
		mode: "rows",
		pk: "sid",
		where: "1 = ?",
		cutoff: 1
	},
	{
		name: "events",
		table: "ca_events",
		mode: "rows",
		pk: "id",
		where: "1 = ?",
		cutoff: 1
	},
	{
		name: "srv",
		table: "ca_srv",
		mode: "day",
		where: "1 = ?",
		cutoff: 1
	},
	{
		name: "drops",
		table: "ca_drops",
		mode: "day",
		where: "1 = ?",
		cutoff: 1
	},
	{
		name: "cube",
		table: "ca_cube",
		mode: "day",
		where: "1 = ?",
		cutoff: 1
	},
	{
		name: "rollup",
		table: "ca_rollup",
		mode: "day",
		where: "day < ?",
		cutoff: "9999-12-31"
	},
	{
		name: "search",
		table: "ca_search_daily",
		mode: "day",
		where: "day < ?",
		cutoff: "9999-12-31"
	},
	{
		name: "revenue",
		table: "ca_revenue_daily",
		mode: "day",
		where: "day < ?",
		cutoff: "9999-12-31"
	}
];
const purgeKey = (site) => `purge:${site}`;
/**
* One bounded call of a per-site delete: at most `maxChunks` chunks, resuming from `purge:<site>`.
* The cursor only moves after a chunk is deleted, so a crash repeats at most one (idempotent) chunk.
* The cursor is removed when the site has no rows left.
*/
async function purgeSite(db, kv, site, o = {}) {
	const chunkRows = o.chunkRows ?? 2e3;
	const maxChunks = o.maxChunks ?? 20;
	const key = purgeKey(site);
	const now = o.now ?? Math.floor(Date.now() / 1e3);
	const saved = await kv.get(key);
	const c = saved && now - (saved.at ?? 0) < 3600 ? saved : {
		step: 0,
		deleted: {},
		at: now
	};
	for (let n = 0; n < maxChunks && c.step < SITE_STEPS.length; n++) {
		const st = SITE_STEPS[c.step];
		const changes = await runChunk(db, site, st, chunkRows);
		c.deleted[st.name] = (c.deleted[st.name] ?? 0) + changes;
		if (st.mode === "rows" ? changes < chunkRows : changes === 0) c.step++;
		c.at = now;
		await kv.set(key, c);
	}
	const done = c.step >= SITE_STEPS.length;
	if (done) await kv.delete(key);
	return {
		...c,
		site,
		done
	};
}
/**
* One bounded call deleting the stored Search rows of one site and source, oldest days first: each chunk
* removes whole days up to about `chunkRows` rows (at least one day). Idempotent, so no cursor is needed.
*/
async function purgeSearch(db, site, source, o = {}) {
	const chunkRows = o.chunkRows ?? 2e3;
	const maxChunks = o.maxChunks ?? 20;
	let deleted = 0;
	for (let n = 0; n < maxChunks; n++) {
		const days = await db.all("SELECT day, COUNT(*) AS n FROM ca_search_daily WHERE site = ? AND source = ? GROUP BY day ORDER BY day LIMIT 1000", [site, source]);
		if (!days.length) return {
			deleted,
			done: true
		};
		let last = days[0]?.day;
		let sum = 0;
		for (const d of days) {
			if (sum > 0 && sum + Number(d.n) > chunkRows) break;
			sum += Number(d.n);
			last = d.day;
		}
		deleted += (await db.run("DELETE FROM ca_search_daily WHERE site = ? AND source = ? AND day <= ?", [
			site,
			source,
			last
		])).changes;
	}
	const [left] = await db.all("SELECT COUNT(*) AS n FROM ca_search_daily WHERE site = ? AND source = ?", [site, source]);
	return {
		deleted,
		done: Number(left?.n ?? 0) === 0
	};
}
// src/routes/sites.ts
/** Collections whose records belong to one site. User agent rules are one set per install and stay. */
const SITE_COLLECTIONS = [
	"dashboards",
	"shares",
	"goals",
	"funnels",
	"segments",
	"channel_rules",
	"annotations"
];
/**
* Every record of a deleted site: its dashboards (and with them their email schedule), share links, goals, funnels,
* segments, channel rules and annotations. Once the id no longer binds they could not be listed or removed.
*/
async function deleteSiteRecords(storage, site) {
	for (const name of SITE_COLLECTIONS) {
		const c = storage?.[name];
		if (!c) continue;
		for (let more = true; more;) {
			const page = await c.query({
				where: { site },
				limit: 100
			});
			const ids = page.items.map((i) => i.id);
			if (!ids.length) break;
			if (c.deleteMany) await c.deleteMany(ids);
			else for (const id of ids) await c.delete(id);
			more = page.hasMore;
		}
	}
}
const ListBody = z.object({ counts: z.boolean().optional() }).strict().optional();
const Host = z.string().trim().toLowerCase().max(253);
const SaveBody = z.object({
	/** True to create; false or absent edits an existing record. */
	create: z.boolean().optional(),
	id: z.string().regex(SITE_ID_RE),
	label: z.string().trim().min(1).max(64),
	hosts: z.array(Host).min(1).max(10),
	gscProperty: z.string().trim().max(512).optional(),
	bingSiteUrl: z.string().trim().max(512).optional(),
	paused: z.boolean().optional(),
	/** Per-site revenue settings: null removes the field, so the site inherits the master's setting. */
	defaultCurrency: z.string().refine(isCurrency, "Unknown currency code.").nullable().optional(),
	acceptClientRevenue: z.boolean().nullable().optional(),
	/** Site search parameter names, comma separated: null inherits, "" turns it off for this site. */
	siteSearchParams: z.string().max(200).nullable().optional(),
	/** Linked to this site: events stored under this site's id, the visit continues across the hosts. */
	linked: z.boolean().optional()
}).strict();
const Day$2 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** The plain object (the MCP tool input must be one); the route adds the order check. */
const SummaryFields = z.object({
	from: Day$2,
	to: Day$2,
	compare: z.enum([
		"none",
		"previous",
		"year"
	]).optional()
}).strict();
const SummaryBody = SummaryFields.refine((b) => b.from <= b.to, {
	message: "from must not be after to",
	path: ["from"]
});
const DeleteBody = z.object({
	id: z.string().regex(SITE_ID_RE),
	deleteData: z.boolean()
}).strict();
/** Regenerate the key, or set a given one (moving a site between installs keeps its snippet). */
const KeyBody = z.object({
	id: z.string().regex(SITE_ID_RE),
	key: z.string().optional()
}).strict();
const bad = (msg) => new PluginRouteError("invalid_site", msg, 400);
function coll$1(ctx) {
	const c = ctx.storage?.sites;
	if (!c) throw new PluginRouteError("storage_unavailable", "The sites collection is not available.", 500);
	return c;
}
/** Hostnames this install serves: the admin request's host and `siteOrigin`. */
function masterHosts(ctx, s) {
	return [hostnameOf(ctx.request?.url), hostnameOf(s.siteOrigin)].filter((h) => !!h);
}
/** The rollup watermark of the sites' databases: the oldest one, null when any database has none yet. */
async function oldestWatermark(db, kv) {
	const marks = await Promise.all(factsTargets(db).map((t) => t.kv(kv).get(KV_WATERMARK)));
	return marks.some((m) => !m) ? null : [...marks].sort()[0] ?? null;
}
function siteRoutes(env) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1e3);
	const remoteIds = () => env.remoteIds?.() ?? [];
	async function checked(ctx, site, except) {
		const s = await env.settings();
		const parsed = ClientSiteSchema.safeParse(site);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			throw bad(issue?.path[0] === "hosts" ? "Each host must be a lowercase host name such as www.example.com, without scheme, port or path." : `Invalid ${String(issue?.path[0] ?? "site")}.`);
		}
		const others = (await loadSites(coll$1(ctx))).filter((o) => o.id !== except);
		const problem = siteProblem(parsed.data, {
			siteId: s.siteId,
			remoteIds: remoteIds(),
			masterHosts: masterHosts(ctx, s),
			others
		});
		if (problem) throw bad(problem);
		return parsed.data;
	}
	/**
	* The page script's linked hosts (`LINKED_HOSTS_KEY`) for the registry as it will be, and the last event stamps
	* of hosts no longer linked removed. A save writes it before the record: if the record write then fails, a host
	* is at worst left without fragments, never given them.
	*/
	async function syncLinked(ctx, sites) {
		invalidateRegistry();
		if (!ctx.kv) return;
		const hosts = linkedHosts(sites);
		await ctx.kv.set(LINKED_HOSTS_KEY, hosts);
		const keep = /* @__PURE__ */ new Set([...hosts, hostnameOf((await env.settings()).siteOrigin)]);
		for (const e of await ctx.kv.list(HOST_SEEN_PREFIX)) if (!keep.has(e.key.slice(10))) await ctx.kv.delete(e.key);
	}
	async function write(ctx, site) {
		await syncLinked(ctx, [...(await loadSites(coll$1(ctx))).filter((o) => o.id !== site.id), site]);
		await coll$1(ctx).put(site.id, site);
		invalidateRegistry();
		return { site };
	}
	return {
		"sites/list": {
			permission: "plugins:read",
			input: ListBody,
			async handler(ctx = {}) {
				const body = ListBody.parse(ctx.input ?? void 0);
				const s = await env.settings();
				const all = await loadSites(ctx.storage?.sites);
				const clients = all.filter((c) => !c.linked);
				const linked = all.filter((c) => c.linked);
				const sites = [{
					id: s.siteId,
					label: "This site",
					local: true,
					kind: "local",
					timezone: s.siteTimezone,
					captureRegion: s.captureRegion
				}, ...clients.map((c) => ({
					id: c.id,
					label: c.label,
					local: false,
					kind: "client",
					timezone: s.siteTimezone,
					client: c,
					captureRegion: s.captureRegion
				}))];
				const taken = new Set(sites.map((e) => e.id));
				for (const r of env.remoteSites?.() ?? []) if (!taken.has(r.id)) sites.push({
					id: r.id,
					label: r.label,
					local: false,
					kind: "remote",
					timezone: s.siteTimezone,
					origin: r.origin,
					keyPresent: r.keyPresent
				});
				if (!body?.counts) return {
					sites,
					...linked.length ? { linked } : {}
				};
				if (env.db) {
					const today = dayInZone(now(), s.siteTimezone);
					const facts = pluginFactsOrNull();
					const groups = /* @__PURE__ */ new Map();
					for (const e of sites) if (e.client) groups.set(facts?.binding(e.id) ?? "", [...groups.get(facts?.binding(e.id) ?? "") ?? [], e]);
					for (const list of groups.values()) {
						const db = await env.db(list[0].id);
						const ids = inList(db.dialect, "site", list.map((e) => e.id));
						const rows = await db.all(`SELECT site, SUM(pageviews) AS n FROM ca_sessions WHERE day = ? AND (${ids.sql}) GROUP BY site`, [visitDayKey(today), ...ids.params]).catch(() => null);
						if (!rows) continue;
						const n = new Map(rows.map((r) => [String(r.site), Number(r.n ?? 0)]));
						for (const e of list) if (e.client) e.client = {
							...e.client,
							pageviewsToday: n.get(e.id) ?? 0
						};
					}
				}
				const seen = ctx.kv ? await ctx.kv.get(MW_SEEN_KEY) : null;
				const origin = s.siteOrigin || (ctx.request ? new URL(ctx.request.url).origin : "");
				const names = publicNames(s.namespace ?? "");
				return {
					sites,
					...linked.length ? { linked } : {},
					middlewareSeen: typeof seen === "number" && now() * 1e3 - seen < 864e5,
					snippet: {
						src: `${origin}${s.scriptPath ?? "/_/e.js"}`,
						keyAttr: `${names.attrPrefix}key`,
						namespace: names.namespace,
						external: (s.scriptDelivery ?? "external") === "external"
					}
				};
			}
		},
		"sites/summary": {
			permission: "plugins:read",
			input: SummaryBody,
			async handler(ctx) {
				const body = SummaryBody.parse(ctx.input);
				const s = await env.settings();
				if (!env.db) throw new PluginRouteError("storage_unavailable", "The database is not available.", 500);
				const db = await env.db(s.siteId);
				const clients = (await registry(ctx.storage?.sites)).sites;
				const entries = new Map([[s.siteId, {
					id: s.siteId,
					label: "This site",
					kind: "local"
				}], ...clients.map((c) => [c.id, {
					id: c.id,
					label: c.label,
					kind: "client"
				}])]);
				const sitesDb = routedSitesDb((site) => env.db(site), ctx.kv);
				const rc = {
					db,
					site: s.siteId,
					sites: [...entries.keys()],
					...sitesDb ? { sitesDb } : {},
					settings: {
						siteTimezone: s.siteTimezone,
						engagedThresholdSeconds: 0,
						realtimeWindowMinutes: 0
					},
					now: now(),
					goals: [],
					funnels: {},
					annotations: []
				};
				const run = (from, to, isCompare) => sitesSummary(rc, {
					from,
					to,
					filters: [],
					granularity: "auto",
					params: {},
					limit: 500,
					offset: 0,
					isCompare
				});
				const compare = body.compare ?? "none";
				const compareRange = compare === "previous" ? previousPeriod(body) : compare === "year" ? samePeriodLastYear(body) : null;
				let data = await run(body.from, body.to, false);
				let prevRows = null;
				if (compareRange) {
					const prev = await run(compareRange.from, compareRange.to, true);
					prevRows = prev.rows ?? [];
					data = mergeCompare(data, prev);
				}
				const rows = (data.rows ?? []).map(({ key, ...r }) => ({
					...entries.get(key),
					...r
				}));
				const remote = env.remoteRows ? await env.remoteRows(body, ctx, new Set(entries.keys())) : [];
				rows.push(...remote);
				rows.sort((a, b) => (b.pageviews ?? -1) - (a.pageviews ?? -1));
				const totals = summaryTotals(rows);
				const prevTotals = prevRows ? summaryTotals([...prevRows, ...remote.flatMap((r) => r.previous ? [r.previous] : [])]) : null;
				return {
					from: body.from,
					to: body.to,
					compare,
					compareRange,
					watermark: ctx.kv ? await oldestWatermark(env.db, ctx.kv) : null,
					rows,
					totals: {
						...totals,
						...prevTotals ? {
							previous: prevTotals,
							delta: {
								sessions: delta(totals.sessions, prevTotals.sessions),
								pageviews: delta(totals.pageviews, prevTotals.pageviews)
							}
						} : {}
					}
				};
			}
		},
		"sites/hosts": {
			permission: "plugins:read",
			input: z.object({}).strict().optional(),
			async handler(ctx = {}) {
				const s = await env.settings();
				const seen = /* @__PURE__ */ new Map();
				for (const e of await ctx.kv?.list("host:seen:") ?? []) if (typeof e.value === "number") seen.set(e.key.slice(HOST_SEEN_PREFIX.length), e.value);
				const hosts = /* @__PURE__ */ new Map();
				for (const c of await loadSites(ctx.storage?.sites)) if (c.linked) for (const h of c.hosts) hosts.set(h, {
					host: h,
					kind: "linked",
					site: c.label,
					paused: c.paused,
					lastEvent: seen.get(h) ?? null
				});
				for (const h of [hostnameOf(s.siteOrigin), hostnameOf(ctx.request?.url)]) if (h && !hosts.has(h)) hosts.set(h, {
					host: h,
					kind: "own",
					lastEvent: seen.get(h) ?? null
				});
				return { hosts: [...hosts.values()].sort((a, b) => a.kind === b.kind ? a.host.localeCompare(b.host) : a.kind === "own" ? -1 : 1) };
			}
		},
		"sites/save": {
			permission: "plugins:manage",
			input: SaveBody,
			async handler(ctx) {
				const body = SaveBody.parse(ctx.input);
				const cur = ClientSiteSchema.safeParse(await coll$1(ctx).get(body.id));
				if (body.create && cur.success) throw bad(`The id ${body.id} is already registered.`);
				if (!body.create && !cur.success) throw new PluginRouteError("not_found", "Unknown site.", 404);
				if (body.create && (await loadSites(coll$1(ctx))).length >= 500) throw bad(`At most 500 sites.`);
				const base = cur.success ? cur.data : {
					key: newSiteKey(),
					created: now(),
					gscProperty: "",
					bingSiteUrl: "",
					paused: false
				};
				const { create: _c, ...fields } = body;
				const next = {
					...base,
					...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== void 0))
				};
				for (const k of [
					"defaultCurrency",
					"acceptClientRevenue",
					"siteSearchParams"
				]) if (next[k] === null) delete next[k];
				if (typeof next.siteSearchParams === "string") {
					const { names, invalid } = parseSiteSearchParams(next.siteSearchParams);
					if (invalid.length) throw bad(`Site search parameters are at most 5 names of letters, digits and _ (up to 16 characters): ${invalid.join(", ")}.`);
					next.siteSearchParams = names;
				}
				return write(ctx, await checked(ctx, next, body.id));
			}
		},
		"sites/key": {
			permission: "plugins:manage",
			input: KeyBody,
			async handler(ctx) {
				const body = KeyBody.parse(ctx.input);
				if (body.key !== void 0 && !SITE_KEY_RE.test(body.key)) throw bad("A site key is 20 lowercase letters and digits.");
				const cur = ClientSiteSchema.safeParse(await coll$1(ctx).get(body.id));
				if (!cur.success) throw new PluginRouteError("not_found", "Unknown site.", 404);
				return write(ctx, await checked(ctx, {
					...cur.data,
					key: body.key ?? newSiteKey()
				}, body.id));
			}
		},
		"sites/delete": {
			permission: "plugins:manage",
			input: DeleteBody,
			async handler(ctx) {
				const body = DeleteBody.parse(ctx.input);
				const c = coll$1(ctx);
				if (!ClientSiteSchema.safeParse(await c.get(body.id)).success) throw new PluginRouteError("not_found", "Unknown site.", 404);
				await c.delete(body.id);
				await syncLinked(ctx, await loadSites(c));
				await deleteSiteRecords(ctx.storage, body.id);
				if (!body.deleteData || !env.db || !ctx.kv) return {
					id: body.id,
					deleted: true,
					data: null
				};
				const data = await purgeSite(await env.db(body.id), ctx.kv, body.id, {
					now: now(),
					maxChunks: 8
				});
				clearReportCache();
				return {
					id: body.id,
					deleted: true,
					data
				};
			}
		}
	};
}
// src/mcp.ts
/**
* MCP tools: the host serves them at `/_emdash/api/mcp` as `cookieless-analytics__<name>`. Each names a
* private JSON POST route of this plugin with a declared permission; the host checks the caller's role against
* it and, for tokens, the scope `mcp:tools:cookieless-analytics` or `mcp:tools`. Nothing that ingests, deletes,
* or touches keys, shares or settings is exposed.
*/
/**
* `config/annotations/save` input without the scope transform: the host serializes every tool input with
* `z.toJSONSchema` (consent string, `tools/list`), which throws on a transform. The route checks the full schema.
*/
const AnnotateInput = saveBody("annotations").extend({ data: AnnotationItem.extend({ scope: ScopeShape.optional() }) });
const MCP_TOOLS = {
	analytics_query: {
		description: "Run one analytics report (traffic, search, revenue, funnels, journeys and more) for a site and date range. Call analytics_catalog first for the report names, dimensions, filter operators, params and metric definitions. `query.site` picks a site; absent means this site.",
		route: "data/query",
		input: DataQueryBody
	},
	analytics_catalog: {
		description: "The catalog of reports, dimensions, filter operators, params, metric definitions and limits that analytics_query accepts. Takes no input.",
		route: "data/catalog",
		input: CatalogBody
	},
	analytics_sites_summary: {
		description: "One row per site with sessions, pageviews, visitors, bounce rate, engaged rate and revenue per currency for a date range, from the daily rollup, with an optional previous-period or year-over-year comparison. Visitors are not summed across sites.",
		route: "sites/summary",
		input: SummaryFields
	},
	analytics_annotate: {
		description: "Add (or, with `id`, replace) an annotation: a dated note shown on every chart, optionally scoped to paths, hosts or search queries. `site` picks a client site; absent means this site.",
		route: "config/annotations/save",
		input: AnnotateInput,
		destructive: false
	}
};
// src/routes/keys.ts
/** Admin routes `keys/list|create|revoke|delete`, `plugins:manage`. Create returns the token once; nothing returns it later. */
const KeyCreateBody = z.object({
	label: z.string().trim().min(1).max(64),
	scopes: z.array(z.enum(SCOPES)).min(1).max(SCOPES.length),
	/** Optional restriction to local-database sites (the local site and client sites); empty or absent means all. */
	sites: z.array(z.string().regex(SITE_ID_RE)).max(50).optional(),
	/** Epoch seconds; absent or null means no expiry. */
	expires: z.number().int().positive().nullable().optional()
}).strict();
const KeyRevokeBody = z.object({ id: z.string().regex(/^[a-z0-9]{1,64}$/) }).strict();
const EmptyBody$3 = z.object({}).strict().optional();
const coll = (ctx) => {
	if (!ctx.storage.api_keys) throw new PluginRouteError("storage_unavailable", "The api_keys collection is not available.", 500);
	return ctx.storage.api_keys;
};
function keyRoutes(env = {}) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1e3);
	return {
		"keys/list": {
			permission: "plugins:manage",
			input: EmptyBody$3,
			handler: async (ctx) => ({ items: await listKeys(coll(ctx)) })
		},
		"keys/create": {
			permission: "plugins:manage",
			input: KeyCreateBody,
			async handler(ctx) {
				const body = KeyCreateBody.parse(ctx.input);
				if (body.expires != null && body.expires <= now()) throw new PluginRouteError("invalid_expiry", "The expiry must be in the future.", 400);
				if (body.sites?.length) {
					const local = (await env.settings?.())?.siteId;
					const clients = (await registry(ctx.storage.sites)).byId;
					const unknown = body.sites.find((id) => id !== local && !clients.has(id));
					if (unknown) throw new PluginRouteError("unknown_site", `Unknown site ${unknown}: a key can be limited to this site and its client sites only.`, 400);
				}
				const c = coll(ctx);
				if ((await listKeys(c)).length >= 100) throw new PluginRouteError("too_many_keys", `At most 100 keys per install, revoked keys included; delete a revoked key to make room.`, 400);
				return createKey(c, body, now());
			}
		},
		"keys/revoke": {
			permission: "plugins:manage",
			input: KeyRevokeBody,
			async handler(ctx) {
				const key = await revokeKey(coll(ctx), KeyRevokeBody.parse(ctx.input).id);
				if (!key) throw new PluginRouteError("not_found", "Unknown key.", 404);
				return { key };
			}
		},
		"keys/delete": {
			permission: "plugins:manage",
			input: KeyRevokeBody,
			async handler(ctx) {
				const { id } = KeyRevokeBody.parse(ctx.input);
				const c = coll(ctx);
				const cur = await c.get(id);
				if (!cur) throw new PluginRouteError("not_found", "Unknown key.", 404);
				if (cur.revoked !== true) throw new PluginRouteError("not_revoked", "Revoke the key before deleting it.", 400);
				await c.delete(id);
				return {
					id,
					deleted: true
				};
			}
		}
	};
}
// src/routes/session.ts
/** Lookups per truncated IP per minute before the route answers `{ sid: null }`. */
const READS_PER_MINUTE = 60;
const NONE = {
	v: 1,
	sid: null
};
function shape(s) {
	return {
		v: 1,
		sid: s.sid,
		started: s.started,
		channel: s.channel,
		source: s.source,
		utm_source: s.utm_source,
		utm_medium: s.utm_medium,
		utm_campaign: s.utm_campaign,
		utm_term: s.utm_term,
		utm_content: s.utm_content,
		entry_path: s.entry_path,
		country: s.country,
		device: s.device
	};
}
/** Public session read API: first-touch facts of the caller's active session, never raw identifiers. */
function sessionRoute(env) {
	return {
		public: true,
		methods: ["GET"],
		response: "raw",
		async handler(ctx) {
			const deps = await env.deps(ctx);
			if (classifyUa(ctx.request.headers.get("user-agent"), deps.agentRules).audience === "robot") return noContent();
			const s = deps.settings;
			const info = requestInfo(ctx.request, ctx.requestMeta ? ctx.requestMeta.ip : void 0);
			const now = deps.now ?? Math.floor(Date.now() / 1e3);
			if (bump("read", truncateIp(info.ip, "strict"), now) > READS_PER_MINUTE) return json$1(NONE);
			const q = ctx.input ?? {};
			const active = (row) => row && isActive$1(row, now, Math.min(s.maxSessionMinutes, 1440)) ? row : null;
			let found = null;
			if (isSid(q.sid)) {
				const r = await readVisits(deps.db, s.siteId, now, s.siteTimezone, q.sid, []);
				found = active(r.rows.find((v) => v.sid === q.sid)) ?? (r.canon ? active(r.rows.find((v) => v.sid === r.canon)) : null);
			} else {
				const ua = uaNorm(parseUa(info.ua, {
					mobile: info.chMobile,
					platform: info.chPlatform
				}));
				const ip = truncateIp(info.ip, s.ipTruncation);
				const today = saltDay(now, s.saltTimezone, s.saltRotationHour);
				const days = [today];
				if (now < saltBoundary(now, s.saltTimezone, s.saltRotationHour) + s.sessionWindowMinutes * 60) days.push(addDays(today, -1));
				const keys = await Promise.all(days.map(async (d) => vkey(await getOrCreateSalt(deps.kv, d), s.siteId, ip, ua)));
				found = active((await readVisits(deps.db, s.siteId, now, s.siteTimezone, null, keys)).rows.sort((a, b) => b.last_seen - a.last_seen)[0]);
			}
			return json$1(found ? shape(found) : NONE);
		}
	};
}
// src/routes/share-view.ts
/** The password of `Authorization: Basic base64(user:pass)` as UTF-8; the user part is ignored. */
function basicPassword(header) {
	const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? "");
	if (!m) return null;
	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
		const i = text.indexOf(":");
		return i < 0 ? null : text.slice(i + 1);
	} catch {
		return null;
	}
}
function shareViewRoute(env) {
	return {
		public: true,
		methods: ["GET"],
		request: { body: "none" },
		async handler(ctx) {
			const s = await env.settings();
			const now = env.now?.() ?? Math.floor(Date.now() / 1e3);
			const url = new URL(ctx.request.url);
			const prefix = `${s.sharePath}/`;
			const token = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
			if (!token || token.includes("/") || !ctx.storage.shares || !ctx.storage.dashboards) return { status: 404 };
			const hit = await lookup(ctx.storage.shares, token, now);
			if (!hit) return { status: 404 };
			const dash = await getDashboard(ctx.storage.dashboards, hit.share.site, hit.share.dashboard).catch(() => null);
			if (!dash) return { status: 404 };
			if (hit.share.pw) {
				const wait = await lockedFor(ctx.kv, hit.id, now);
				if (wait > 0) return {
					status: 429,
					retryAfter: wait
				};
				const realm = `View ${hit.share.prefix}`;
				const password = basicPassword(ctx.request.headers.get("authorization"));
				if (password === null) return {
					status: 401,
					realm
				};
				if (!passwordOk(password) || !await checkPassword(hit.id, hit.share.pw, password, hit.secret, now * 1e3)) {
					await recordFailure(ctx.kv, hit.id, now);
					return {
						status: 401,
						realm
					};
				}
				await resetFailures(ctx.kv, hit.id);
			}
			const r = url.searchParams.get("r");
			const range = dash.viewer.ranges.includes(r) ? r : dash.defaults.range;
			const allowCompare = dash.viewer.compare && distinctRequests(dash) <= 6;
			const compare = allowCompare && url.searchParams.get("c") === "1";
			const site = hit.share.site;
			const dctx = {
				input: null,
				storage: ctx.storage,
				kv: ctx.kv,
				publicSurface: true,
				...ctx.schema ? { schema: ctx.schema } : {}
			};
			const run = await runDashboard({
				site,
				tz: s.siteTimezone,
				now,
				dispatch: (b, a) => answer(env, dctx, b, a),
				loadAnnotations: (r) => loadAnnotations(ctx.storage.annotations, site, r.from, r.to, s.siteTimezone),
				segmentExists: async (id) => (await ctx.storage.segments?.get(id))?.site === site
			}, dash, {
				range,
				compare: compare ? dash.defaults.compare === "segment" ? "segment" : "previous" : "none",
				annotations: dash.viewer.annotations === true
			});
			const goalNames = dash.tiles.some((t) => t.params?.goal) ? new Map((await loadAll(ctx.storage.goals, { site })).map((g) => [g.id, g.data.name])) : /* @__PURE__ */ new Map();
			const html = renderShared({
				dashboard: dash,
				tiles: dash.tiles.map((t, i) => {
					const res = run.tiles[i]?.result;
					if (!res) return null;
					const d = tileData(t, res, { goalName: t.params?.goal ? goalNames.get(t.params.goal) : void 0 });
					return {
						...d,
						notices: [...d.notices, ...run.tiles[i]?.notices ?? []]
					};
				}),
				range,
				compare,
				ranges: dash.viewer.ranges,
				allowCompare,
				generatedAt: now,
				tz: s.siteTimezone
			});
			const shares = ctx.storage.shares;
			if (ctx.request.method !== "HEAD") env.after(() => recordView(shares, hit.id, now));
			return {
				status: 200,
				html,
				cache: hit.share.pw ? "private" : "open"
			};
		}
	};
}
// src/routes/shares.ts
/**
* Share routes: `shares/list` under `plugins:read` (every link of a dashboard without hash or
* verifier), `shares/create` and `shares/delete` (by share id) under `plugins:manage`. A remote satellite's dashboards
* are not shareable.
*/
const Id = z.string().regex(/^[a-z0-9]{12}$/);
const ShareBodies = {
	list: z.object({
		dashboard: Id,
		site: SiteField
	}).strict(),
	create: z.object({
		dashboard: Id,
		site: SiteField,
		password: z.string().refine(passwordOk, `Use 8 to 128 characters.`).optional(),
		expires: z.number().int().positive().nullable().optional(),
		label: z.string().trim().min(1).max(40).optional()
	}).strict(),
	delete: z.object({
		id: z.string().regex(/^[a-z0-9]{16}$/),
		site: SiteField
	}).strict()
};
function shareRoutes(env) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1e3);
	const coll = (ctx) => {
		if (!ctx.storage.shares) throw new PluginRouteError("storage_unavailable", "The shares collection is not available.", 500);
		return ctx.storage.shares;
	};
	async function site(ctx, requested) {
		const s = await env.settings();
		if (requested && requested !== s.siteId && env.remoteIds?.().includes(requested)) throw new PluginRouteError("remote_site_not_shareable", "Dashboards of a remote site cannot be shared.", 400);
		return (await bindSite(requested, s.siteId, ctx.storage.sites)).id;
	}
	return {
		"shares/list": {
			permission: "plugins:read",
			input: ShareBodies.list,
			async handler(ctx) {
				const b = ShareBodies.list.parse(ctx.input);
				const s = await site(ctx, b.site);
				const t = now();
				return { items: (await sharesOf(coll(ctx), s, b.dashboard)).map((h) => shareView(h.id, h.share, t)) };
			}
		},
		"shares/create": {
			permission: "plugins:manage",
			input: ShareBodies.create,
			async handler(ctx) {
				const b = ShareBodies.create.parse(ctx.input);
				const s = await site(ctx, b.site);
				if (!ctx.storage.dashboards || !await getDashboard(ctx.storage.dashboards, s, b.dashboard).catch(() => null)) throw new PluginRouteError("not_found", "Unknown dashboard.", 404);
				try {
					const r = await createShare(coll(ctx), {
						site: s,
						dashboard: b.dashboard,
						password: b.password,
						expires: b.expires,
						label: b.label
					}, now());
					const cfg = await env.settings();
					return {
						link: `${cfg.siteOrigin || (ctx.request ? new URL(ctx.request.url).origin : "")}${cfg.sharePath}/${r.token}`,
						share: r.share
					};
				} catch (err) {
					if (err instanceof ShareError) throw new PluginRouteError(err.code, err.message, err.code === "too_many_shares" ? 409 : 400);
					throw err;
				}
			}
		},
		"shares/delete": {
			permission: "plugins:manage",
			input: ShareBodies.delete,
			async handler(ctx) {
				const b = ShareBodies.delete.parse(ctx.input);
				const s = await site(ctx, b.site);
				return {
					id: b.id,
					deleted: await deleteShare(coll(ctx), s, b.id)
				};
			}
		}
	};
}
// src/routes/settings.ts
/**
* Admin routes `settings/get` and `settings/save` (`plugins:manage`) behind the Settings page: the plugin settings in
* sections, checked by `normalizeSettings` with an error per field. Secrets never leave the server ("set" or not), and
* the Search sign-in keys are read only here: they are changed on the Search page only, so a stale page cannot undo a
* connection. A save writes only the keys it names.
*/
/** The sections of the Settings page; each schema key is in exactly one, in the schema's declaration order. */
const SETTINGS_SECTIONS = [
	{
		id: "general",
		label: "General",
		keys: [
			"siteTimezone",
			"siteOrigin",
			"defaultCurrency",
			"excludeEditors",
			"siteId"
		],
		advanced: ["siteId"]
	},
	{
		id: "script",
		label: "Page script",
		keys: [
			"injectScript",
			"scriptDelivery",
			"autoOutbound",
			"autoDownloads",
			"downloadExtensions",
			"autoForms",
			"ignorePathPrefixes",
			"linkRules",
			"siteSearchParams",
			"logErrorPages",
			"scriptPath",
			"collectPath",
			"sharePath",
			"namespace",
			"scriptForBots"
		],
		advanced: [
			"scriptPath",
			"collectPath",
			"sharePath",
			"namespace",
			"scriptForBots"
		]
	},
	{
		id: "privacy",
		label: "Privacy and exclusions",
		keys: [
			"signals",
			"ipTruncation",
			"captureLanguage",
			"captureRegion",
			"captureScreen",
			"excludePaths",
			"excludeIpPrefixes",
			"ignoreReferrerHosts",
			"queryAllowlist",
			"saltTimezone",
			"saltRotationHour"
		],
		advanced: ["saltTimezone", "saltRotationHour"]
	},
	{
		id: "sessions",
		label: "Sessions and engagement",
		keys: [
			"sessionWindowMinutes",
			"engagedThresholdSeconds",
			"longClickSeconds",
			"badExperienceSeconds",
			"realtimeWindowMinutes",
			"maxSessionMinutes",
			"reloadDedupeSeconds",
			"maxEngagedMsPerPage"
		],
		advanced: [
			"maxSessionMinutes",
			"reloadDedupeSeconds",
			"maxEngagedMsPerPage"
		]
	},
	{
		id: "revenue",
		label: "Revenue",
		keys: ["acceptClientRevenue"]
	},
	{
		id: "annotations",
		label: "Annotations",
		keys: [
			"autoAnnotations",
			"annotatePublish",
			"annotateUpdate",
			"annotateCollections",
			"autoAnnotationsPerDay"
		]
	},
	{
		id: "search",
		label: "Search",
		keys: [
			"searchBrandTerms",
			"searchMinImpressions",
			"searchOverlapMinShare",
			"backfillDays",
			"searchRetentionDays",
			"searchSyncHours",
			"syncSubrequestBudget",
			"searchMaxRowsPerDay"
		],
		advanced: [
			"searchSyncHours",
			"syncSubrequestBudget",
			"searchMaxRowsPerDay"
		]
	},
	{
		id: "connections",
		label: "Search connections",
		keys: [
			"gscAuth",
			"gscProperty",
			"gscClientId",
			"gscClientSecret",
			"gscRefreshToken",
			"gscServiceAccount",
			"bingEnabled",
			"bingAuth",
			"bingApiKey",
			"bingClientId",
			"bingClientSecret",
			"bingRefreshToken",
			"bingSiteUrl"
		],
		readOnly: true
	},
	{
		id: "data",
		label: "Data and capacity",
		keys: [
			"capacityProfile",
			"storageBudgetMb",
			"rawRetentionDays",
			"rollupRetentionMonths",
			"ingestTier"
		],
		advanced: ["ingestTier"]
	},
	{
		id: "limits",
		label: "Limits and API",
		keys: [
			"agentRateLimitPerMinute",
			"maxPageviewsPerSession",
			"maxEventsPerSession",
			"maxEventsPerSidPerMinute",
			"maxEventsPerVkeyPerMinute"
		],
		advanced: [
			"maxPageviewsPerSession",
			"maxEventsPerSession",
			"maxEventsPerSidPerMinute",
			"maxEventsPerVkeyPerMinute"
		]
	}
];
const READ_ONLY = new Set(SETTINGS_SECTIONS.flatMap((s) => s.readOnly ? s.keys : []));
const FIELDS = settingsSchema;
/** Stored in milliseconds, shown and edited in minutes. */
const SCALE = { maxEngagedMsPerPage: {
	unit: "minutes",
	by: 6e4
} };
/** Field shown only while this boolean is on. */
const WHEN = {
	scriptDelivery: "injectScript",
	downloadExtensions: "autoDownloads",
	annotatePublish: "autoAnnotations",
	annotateUpdate: "autoAnnotations",
	annotateCollections: "autoAnnotations",
	autoAnnotationsPerDay: "autoAnnotations"
};
/** What a refused string needs, where "not valid" alone would not help. */
const NEEDS = {
	siteId: "Use lowercase letters, digits and dashes, up to 32 characters.",
	siteTimezone: "Use an IANA timezone such as Europe/Berlin.",
	saltTimezone: "Use an IANA timezone such as Europe/Berlin.",
	siteOrigin: "Use an origin such as https://example.com, with no path.",
	scriptPath: "Use a neutral path such as /assets/app.js that differs from the event and share paths.",
	collectPath: "Use a neutral path that differs from the script and share paths.",
	sharePath: "Use a neutral path that differs from the script and event paths.",
	namespace: "Use a neutral name of letters and digits."
};
function fieldMeta(key, advanced = false) {
	const f = FIELDS[key];
	const unitOf = /^(.*) \((minutes|seconds|days|hours|months|percent|ms|MB)\)$/.exec(f.label);
	const scale = SCALE[key];
	const desc = (f.description ?? "").replace(`${HOST_FORM_POINTER} `, "");
	const cut = desc.search(/\.\s/);
	const by = scale?.by ?? 1;
	return {
		key,
		type: f.type,
		label: unitOf?.[1] ?? f.label,
		help: cut < 0 ? desc : desc.slice(0, cut + 1),
		...cut >= 0 ? { more: desc.slice(cut + 2) } : {},
		...scale || unitOf ? { unit: scale?.unit ?? unitOf?.[2] } : {},
		..."default" in f && f.default !== void 0 ? { default: typeof f.default === "number" ? f.default / by : f.default } : {},
		...f.type === "number" ? {
			min: (f.min ?? 0) / by,
			max: (f.max ?? 0) / by
		} : {},
		...f.type === "string" && f.multiline ? { multiline: true } : {},
		...f.type === "select" ? { options: f.options.map((o) => ({
			value: o.value,
			label: o.label
		})) } : {},
		...advanced ? { advanced: true } : {},
		...WHEN[key] ? { when: WHEN[key] } : {}
	};
}
/** How long `budgetTarget` waits for a database to open before it reads the engine from the binding instead. */
const BUDGET_TARGET_MS = 1e3;
/**
* Where the storage budget is checked, as the storage estimate picks it per database (`budgetTargetOf`), the strictest
* row winning: `postgres` when every database is Postgres (the EmDash database included), else `host` while any
* site's analytics tables are in the EmDash database (its 10 GB hold the content too), else `own`. A database that
* does not open within `ms` (an unreachable Postgres) counts by its configured binding: Hyperdrive is Postgres;
* the EmDash database and anything else count as D1.
*/
async function budgetTarget(facts, env = workerEnv, ms = BUDGET_TARGET_MS) {
	if (!facts) return "host";
	const targets = facts.targets();
	const configured = async (binding) => binding !== null && isHyperdrive((await env().catch(() => null))?.[binding]) ? "postgres" : null;
	if ((await Promise.all(targets.map(async (t) => {
		let timer;
		const late = new Promise((resolve) => timer = setTimeout(resolve, ms, null));
		return await Promise.race([Promise.resolve().then(() => t.db()).then((d) => d.dialect, () => null), late]).finally(() => clearTimeout(timer)) ?? configured(t.binding);
	}))).every((d) => d === "postgres")) return "postgres";
	return targets.some((t) => t.binding === null) ? "host" : "own";
}
/** Why a budget outside the row's range is refused. */
function budgetReason(s, target) {
	if (target === "postgres") return "Postgres has no fixed size; the budget keeps a hosted plan from filling up.";
	if (s.capacityProfile === "small") return target === "host" ? "a database on the Workers Free plan holds 500 MB including the site's content." : "a database on the Workers Free plan holds 500 MB.";
	return target === "host" ? "the EmDash database holds 10 GB including the site's content." : "a D1 database holds 10 GB, and Search data, aliases and space freed by deletes are not part of the estimate.";
}
/**
* Check the named values against the stored ones (`current`, raw) with `normalizeSettings`: a value it would clamp,
* drop or replace is refused with a sentence for its field. `clean` holds the values to store (numbers in the stored
* unit). A storage budget other than 0 must be in the range of the profile in `target` (`budgetRange`). Never throws.
*/
function validateSettings(values, current, target = "host") {
	const clean = {};
	const errors = {};
	for (const [key, v] of Object.entries(values)) {
		if (!Object.hasOwn(FIELDS, key)) {
			errors[key] = "Unknown setting.";
			continue;
		}
		const k = key;
		const f = FIELDS[k];
		if (READ_ONLY.has(k)) {
			errors[k] = "Search sign-in is changed on the Search page.";
			continue;
		}
		if (f.type === "number") {
			const by = SCALE[k]?.by ?? 1;
			const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
			const min = (f.min ?? 0) / by;
			const max = (f.max ?? 0) / by;
			if (!Number.isInteger(n) || n < min || n > max) errors[k] = `Use a whole number from ${min} to ${max}.`;
			else clean[k] = n * by;
		} else if (f.type === "boolean") {
			if (typeof v === "boolean") clean[k] = v;
			else errors[k] = "Choose on or off.";
		} else if (f.type === "select") {
			if (typeof v === "string" && f.options.some((o) => o.value === v)) clean[k] = v;
			else errors[k] = "Choose one of the listed options.";
		} else if (typeof v !== "string") errors[k] = "Enter text.";
		else if (k === "linkRules") {
			const r = parseLinkRules(v, normalizeSettings({
				...current,
				...values
			}).ignorePathPrefixes);
			if (r.error) errors[k] = r.error;
			else clean[k] = v.trim();
		} else {
			const s = v.trim();
			const out = normalizeSettings({
				...current,
				...clean,
				[k]: s
			})[k];
			if (Array.isArray(out)) {
				const kept = new Set(out.map((x) => String(x).toLowerCase()));
				const items = (k === "searchBrandTerms" ? s.split(/\r?\n/) : s.split(/[\s,]+/)).map((x) => x.trim()).filter(Boolean);
				const bad = [...new Set(items.filter((x) => !kept.has(x.toLowerCase())))];
				if (bad.length) errors[k] = `Not valid or over the limit: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? ` and ${bad.length - 5} more` : ""}.`;
				else clean[k] = s;
			} else if (out === s || f.type === "url" && s !== "" && out !== "") clean[k] = String(out);
			else errors[k] = NEEDS[k] ?? "This value is not valid.";
		}
	}
	const merged = normalizeSettings({
		...current,
		...clean
	});
	if ("badExperienceSeconds" in clean || "longClickSeconds" in clean) {
		if (merged.badExperienceSeconds > merged.longClickSeconds && !errors.badExperienceSeconds) errors.badExperienceSeconds = `Not above the long click time (${merged.longClickSeconds} seconds).`;
	}
	if (typeof clean.storageBudgetMb === "number" && clean.storageBudgetMb !== 0) {
		const r = budgetRange(merged.capacityProfile, target);
		if (clean.storageBudgetMb < r.min || clean.storageBudgetMb > r.max) errors.storageBudgetMb = `Use 0 for the default, or ${r.min} to ${r.max} here: ${budgetReason(merged, target)}`;
	}
	return {
		clean,
		errors
	};
}
const store = (ctx) => {
	if (!ctx.settings) throw new PluginRouteError("settings_unavailable", "Plugin settings are not available.", 500);
	return ctx.settings;
};
/** Stored raw values of the schema keys. A secret that cannot be decrypted counts as set: it is stored. */
async function readRaw(s) {
	try {
		return Object.fromEntries((await s.list()).filter((e) => Object.hasOwn(FIELDS, e.key)).map((e) => [e.key, e.value]));
	} catch {
		const out = {};
		for (const key of Object.keys(FIELDS)) out[key] = await s.get(key).catch(() => FIELDS[key].type === "secret" ? "unreadable" : null);
		return out;
	}
}
/** A value as the page edits it: the stored value, else the default; numbers in the shown unit. */
function shown(key, raw) {
	const f = FIELDS[key];
	const v = raw ?? ("default" in f ? f.default : void 0) ?? "";
	if (f.type === "number") return Number(v) / (SCALE[key]?.by ?? 1);
	if (Array.isArray(v)) return v.join("\n");
	return typeof v === "boolean" || typeof v === "number" ? v : String(v);
}
const SettingsSaveBody = z.object({ values: z.record(z.string().max(64), z.union([
	z.string().max(2e4),
	z.number(),
	z.boolean()
])).refine((v) => Object.keys(v).length <= 100, "Too many values.") }).strict();
const EmptyBody$2 = z.object({}).strict().optional();
function settingsRoutes(env) {
	const facts = () => (env.facts ?? pluginFactsOrNull)();
	return {
		"settings/get": {
			permission: "plugins:manage",
			input: EmptyBody$2,
			async handler(ctx) {
				const raw = await readRaw(store(ctx));
				const s = await env.settings();
				const target = await budgetTarget(facts(), env.workerEnv);
				const otherMb = target === "host" && ctx.kv ? await hostOtherMb(ctx.kv, env.workerEnv) : null;
				const values = {};
				const secrets = {};
				for (const key of Object.keys(FIELDS)) if (FIELDS[key].type === "secret") secrets[key] = typeof raw[key] === "string" ? raw[key] !== "" : raw[key] != null;
				else values[key] = shown(key, raw[key]);
				return {
					sections: SETTINGS_SECTIONS.map((sec) => ({
						id: sec.id,
						label: sec.label,
						...sec.readOnly ? { readOnly: true } : {},
						fields: sec.keys.map((k) => fieldMeta(k, !!sec.advanced?.includes(k)))
					})),
					values,
					secrets,
					/** Where the budget is checked, the rest of the EmDash database in MB when known, and the warning level of the stored value (`budgetWarning`; the page recomputes it as the value changes). */
					budget: {
						target,
						otherMb,
						level: budgetWarning(s, target, otherMb ?? void 0)
					},
					search: {
						google: SOURCES.google.configured(s) && !!s.gscProperty,
						bing: SOURCES.bing.configured(s) && !!s.bingSiteUrl
					}
				};
			}
		},
		"settings/save": {
			permission: "plugins:manage",
			input: SettingsSaveBody,
			async handler(ctx) {
				const body = SettingsSaveBody.parse(ctx.input);
				const st = store(ctx);
				const raw = await readRaw(st);
				const f = facts();
				const { clean, errors } = validateSettings(body.values, raw, await budgetTarget(f, env.workerEnv));
				if (Object.keys(errors).length) return {
					saved: false,
					errors
				};
				try {
					for (const [key, value] of Object.entries(clean)) await st.set(key, value);
				} finally {
					env.settingsChanged?.();
				}
				if (ctx.kv && ("storageBudgetMb" in clean || "capacityProfile" in clean)) {
					const kv = ctx.kv;
					const kvs = f ? f.targets().map((t) => t.kv(kv)) : [kv];
					await Promise.all(kvs.map((k) => clearEstimateDay(k).catch(() => {})));
				}
				return {
					saved: true,
					values: Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, shown(k, v)]))
				};
			}
		}
	};
}
// src/sources/backfill.ts
/**
* Search backfill: `kv search:backfill:<site>:<source>` holds `{ from, to, cursor, done, error }`.
* The sync tick advances it in adaptive windows of days inside the shared request budget; the cursor moves
* only after a window is stored, so a crash resumes from it. Cancel deletes the record.
*/
function progress(b, now = Date.now()) {
	if (!b) return null;
	const days = daysBetween(b.from, b.to);
	const completed = b.done ? days : Math.max(0, Math.min(days, daysBetween(b.from, b.cursor) - 1));
	const etaMinutes = b.done ? 0 : b.started && completed > 0 ? Math.ceil((now - b.started) / completed * (days - completed) / 6e4) : null;
	return {
		from: b.from,
		to: b.to,
		cursor: b.cursor,
		done: b.done,
		error: b.error ?? null,
		days,
		completed,
		rows: b.rows ?? 0,
		window: b.window ?? null,
		etaMinutes,
		nextAt: b.done ? null : b.nextAt ?? null
	};
}
async function startBackfill(kv, site, source, from, to, today, now = Date.now()) {
	if (from > to) throw new PluginRouteError("invalid_range", "from must not be after to.", 400);
	if (to >= today) throw new PluginRouteError("invalid_range", "A backfill ends yesterday at the latest.", 400);
	if (from < addDays(today, -PROVIDER_DAYS[source])) throw new PluginRouteError("invalid_range", `A ${source} backfill reaches back at most ${PROVIDER_DAYS[source]} days.`, 400);
	const b = {
		from,
		to,
		cursor: from,
		done: false,
		error: null,
		started: now
	};
	await kv.set(backfillKey(site, source), b);
	return progress(b, now);
}
async function cancelBackfill(kv, site, source) {
	return { cancelled: await kv.delete(backfillKey(site, source)) };
}
async function backfillStatus(kv, site, source, now = Date.now()) {
	return progress(await kv.get(backfillKey(site, source)), now);
}
// src/sources/bing-csv.ts
/**
* Bing Webmaster Tools file import: the CSV the Search Performance report exports (one table per file:
* keywords, that is queries, or pages). The exact export layout is not documented by Microsoft
* (see docs/search-sources.md), so the parser is lenient: comma, semicolon or tab separated,
* an optional byte order mark, quoted fields, header names matched loosely ("Keyword", "Query", "Page",
* "URL", "Avg. Position", ...), thousands separators and decimal commas, and dates as ISO, M/D/YYYY,
* D.M.YYYY or a WCF `/Date(ms)/`. A file without a date column is stored on one day the caller names.
*/
/** About 8,000 rows; parsing it takes about 7 ms of CPU (measured: about 14 ms per million characters), inside the Workers Free plan's 10 ms. */
const CSV_MAX_CHARS = 5e5;
const CSV_MAX_ROWS = 5e4;
var CsvError = class extends Error {};
const HEADERS = {
	query: [
		"keyword",
		"keywords",
		"query",
		"queries",
		"searchquery",
		"searchqueries",
		"searchterm",
		"topqueries",
		"topkeywords"
	],
	page: [
		"page",
		"pages",
		"url",
		"urls",
		"pageurl",
		"toppages",
		"landingpage"
	],
	day: [
		"date",
		"day",
		"reportdate"
	],
	clicks: ["clicks", "click"],
	impressions: [
		"impressions",
		"impression",
		"impr"
	],
	position: [
		"avgposition",
		"averageposition",
		"position",
		"avgimpressionposition",
		"averageimpressionposition",
		"avgpos",
		"rank",
		"avgrank"
	]
};
const norm = (h) => h.toLowerCase().replace(/[^a-z]/g, "");
/** Fields of each line; `"` quotes with `""` escapes, CRLF or LF line ends. Scans with `indexOf` (native) instead of per character. */
function splitCsv(text, sep) {
	const out = [];
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];
		if (!line.includes("\"")) {
			if (line.trim()) out.push(line.split(sep));
			continue;
		}
		const row = [];
		let j = 0;
		for (;;) if (line.charCodeAt(j) === 34) {
			let k = j + 1;
			let buf = "";
			for (;;) {
				const q = line.indexOf("\"", k);
				if (q < 0) {
					if (i + 1 >= lines.length) {
						buf += line.slice(k);
						k = line.length;
						break;
					}
					line += `\n${lines[++i]}`;
					continue;
				}
				if (line.charCodeAt(q + 1) === 34) {
					buf += line.slice(k, q + 1);
					k = q + 2;
					continue;
				}
				buf += line.slice(k, q);
				k = q + 1;
				break;
			}
			row.push(buf);
			const e = line.indexOf(sep, k);
			if (e < 0) break;
			j = e + 1;
		} else {
			const e = line.indexOf(sep, j);
			if (e < 0) {
				row.push(line.slice(j));
				break;
			}
			row.push(line.slice(j, e));
			j = e + 1;
		}
		if (row.some((f) => f.trim())) out.push(row);
	}
	return out;
}
/** A count: "1,234", "1.234" and "1 234" are 1234; anything else rounds. */
function parseCount(v) {
	if (/^\d+$/.test(v)) return Number(v);
	const t = v.replace(/[\s  ]/g, "");
	if (!t) return 0;
	if (/^\d{1,3}([.,']\d{3})+$/.test(t)) return Number(t.replace(/[.,']/g, ""));
	const n = Number(t.replace(",", "."));
	return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
/** A decimal: "4.5", "4,5" (decimal comma), "1,234.5" and "1.234,5". */
function parseDecimal(v) {
	if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
	let t = v.replace(/[\s  %]/g, "");
	if (!t) return 0;
	const dot = t.lastIndexOf(".");
	const comma = t.lastIndexOf(",");
	if (dot >= 0 && comma >= 0) t = dot > comma ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
	else if (comma >= 0) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
	const n = Number(t);
	return Number.isFinite(n) && n >= 0 ? n : null;
}
const iso = (y, m, d) => {
	const t = Date.UTC(y, m - 1, d);
	const s = new Date(t).toISOString().slice(0, 10);
	return y >= 2e3 && y < 2100 && s === `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` ? s : null;
};
/** `YYYY-MM-DD` from ISO (optionally with a time), `YYYY/MM/DD`, `M/D/YYYY` (US, the Bing default; D/M/YYYY for the whole file when any first part is above 12), `D.M.YYYY`, `D-M-YYYY` or `/Date(ms)/`. */
const days = /* @__PURE__ */ new Map();
/** `dayFirst`: slash dates are D/M/YYYY; the parser decides it once per file (any first part above 12). */
function parseDay(v, dayFirst = false) {
	const k = dayFirst ? `d${v}` : v;
	const hit = days.get(k);
	if (hit !== void 0) return hit;
	if (days.size > 5e3) days.clear();
	const d = readDay(v.trim(), dayFirst);
	days.set(k, d);
	return d;
}
function readDay(t, dayFirst) {
	let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/.exec(t);
	if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
	m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(t);
	if (m) return dayFirst || Number(m[1]) > 12 ? iso(Number(m[3]), Number(m[2]), Number(m[1])) : iso(Number(m[3]), Number(m[1]), Number(m[2]));
	m = /^(\d{1,2})[.-](\d{1,2})[.-](\d{4})(?:\s.*)?$/.exec(t);
	if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
	return wcfDay(t);
}
/** Parse one exported table. Throws `CsvError` with a plain sentence when the file is not usable. */
function parseBingCsv(input) {
	if (input.length > 5e5) throw new CsvError(`The file is larger than ${CSV_MAX_CHARS / 1e3} KB. Export a shorter date range.`);
	const text = input.replace(/^﻿/, "");
	const first = text.split(/\r?\n/, 1)[0] ?? "";
	const sep = [
		",",
		";",
		"	"
	].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
	const lines = splitCsv(text, sep);
	const header = (lines.shift() ?? []).map(norm);
	const col = (name) => header.findIndex((h) => HEADERS[name].includes(h));
	const at = {
		query: col("query"),
		page: col("page"),
		day: col("day"),
		clicks: col("clicks"),
		impressions: col("impressions"),
		position: col("position")
	};
	if (at.clicks < 0 || at.impressions < 0) throw new CsvError("The file has no Clicks and Impressions columns. Export the Search Performance table from Bing Webmaster Tools.");
	if (at.query >= 0 && at.page >= 0) throw new CsvError("The file has both a query and a page column. Bing stores no page with query pairs; import the Keywords and the Pages export separately.");
	const kind = at.query >= 0 ? "query" : at.page >= 0 ? "page" : "totals";
	if (kind === "totals" && at.day < 0) throw new CsvError("The file has no Keyword, Page or Date column.");
	if (lines.length > 5e4) throw new CsvError(`The file has more than ${CSV_MAX_ROWS} rows. Export a shorter date range.`);
	const keyAt = kind === "query" ? at.query : at.page;
	const rows = [];
	let skipped = 0;
	const dayFirst = at.day >= 0 && lines.some((f) => Number(/^\s*(\d{1,2})\/\d{1,2}\/\d{4}/.exec(f[at.day] ?? "")?.[1] ?? 0) > 12);
	const last = Math.max(at.clicks, at.impressions, at.position, at.day, keyAt);
	for (const f of lines) {
		if (f.length <= last) {
			skipped++;
			continue;
		}
		const key = keyAt >= 0 ? (f[keyAt] ?? "").trim() : "";
		const day = at.day >= 0 ? parseDay(f[at.day] ?? "", dayFirst) : null;
		const clicks = parseCount(f[at.clicks] ?? "");
		const impressions = parseCount(f[at.impressions] ?? "");
		const position = at.position >= 0 ? parseDecimal(f[at.position] ?? "") : 0;
		if (kind !== "totals" && !key || at.day >= 0 && !day || clicks === null || impressions === null || position === null) {
			skipped++;
			continue;
		}
		rows.push({
			key,
			day,
			clicks,
			impressions,
			position
		});
	}
	return {
		kind,
		hasDate: at.day >= 0,
		rows,
		skipped
	};
}
/**
* Store a parsed export as source `bing` rows of one site: per day, the rows of that table replace the
* stored rows of the same table (queries keep pages and totals, and the reverse), exactly the rows a pull
* of the API would write (no country or device, `pos_sum = position * impressions`, pages normalized to
* the site's page keys, other hosts dropped). Days must lie inside `searchRetentionDays` and before today;
* the newest three are provisional like a pull. A file without dates goes to `day`.
*/
async function importBingCsv(o, csv, day) {
	if (!csv.hasDate && !day) throw new CsvError("The file has no Date column. Choose the day to store it on (for example the last day of the exported range).");
	const oldest = addDays(o.today, -o.retentionDays);
	const days = /* @__PURE__ */ new Map();
	let skipped = csv.skipped;
	for (const r of csv.rows) {
		const d = r.day ?? day;
		const page = csv.kind === "page" ? o.target.pageKey(r.key) : "";
		if (d < oldest || d >= o.today || page === null) {
			skipped++;
			continue;
		}
		const row = {
			page_key: page,
			query: csv.kind === "query" ? r.key.slice(0, 512) : "",
			country: "",
			device: "",
			clicks: r.clicks,
			impressions: r.impressions,
			pos_sum: r.position * r.impressions
		};
		const list = days.get(d);
		if (list) list.push(row);
		else days.set(d, [row]);
	}
	const { stmts, rows } = replaceStatements(o.db.dialect, o.target.site, "bing", days, (d) => d >= addDays(o.today, -3), csv.kind);
	const a = await o.rows?.allowance();
	if (a && rows * 3 > a.left) throw new RowsPaused(nextUtcDay(Date.now()), `This file writes up to ${rows * 3} rows; Search may write ${a.left} more rows today (the budget resets at 00:00 UTC). Import it after the reset, or export fewer days.`);
	const written = await writeReplace(o.db, stmts, rows);
	await o.rows?.charge(written);
	const sorted = [...days.keys()].sort();
	return {
		kind: csv.kind,
		days: days.size,
		rows,
		skipped,
		from: sorted[0] ?? null,
		to: sorted[sorted.length - 1] ?? null
	};
}
// src/routes/search.ts
/**
* Search routes. `search/status` is `plugins:read`; the others are `plugins:manage`:
* `search/test`, `search/sync` (one forced tick for a site), `search/backfill` (start, cancel, status),
* `search/oauth/start`, `search/oauth/exchange` (Google, or Bing with `source: "bing"`; the exchange finds
* the provider by its pending `state`), `search/import` (a Bing Webmaster Tools CSV export for one site),
* `search/properties` (picker list with a suggestion for
* the site), `search/map` (stores the mapping: settings for the local site, the registry record for
* a client site) and `search/connect` (the master-level connection fields of the Search setup state).
* No route ever returns a token or a secret setting.
*/
const Source = z.enum(SOURCE_IDS);
const Day$1 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const StatusBody = z.object({ site: SiteField }).strict().optional();
const TestBody = z.object({
	site: SiteField,
	source: Source.default("google")
}).strict();
const SyncBody = z.object({
	site: SiteField,
	source: Source.optional()
}).strict();
/** Start takes `days` back from yesterday (0: everything the source offers; default the `backfillDays` setting) or `from`; both are clamped to what the provider keeps. */
const BackfillRouteBody = z.object({
	action: z.enum([
		"start",
		"cancel",
		"status"
	]),
	site: SiteField,
	source: Source.default("google"),
	days: z.number().int().min(0).max(1e3).optional(),
	from: Day$1.optional(),
	to: Day$1.optional()
}).strict();
const OAuthStartBody = z.object({ source: Source.optional() }).strict().optional();
const OAuthExchangeBody = z.object({
	code: z.string().min(1).max(2048),
	state: z.string().min(1).max(128),
	source: Source.optional()
}).strict();
/** A Bing Webmaster Tools CSV export as text; `day` stores a file without a date column. */
const ImportBody = z.object({
	site: SiteField,
	source: z.literal("bing").default("bing"),
	csv: z.string().min(1).max(CSV_MAX_CHARS),
	day: Day$1.optional()
}).strict();
const PropertiesBody = z.object({
	site: SiteField,
	source: Source.default("google")
}).strict();
const MapBody = z.object({
	site: SiteField,
	source: Source,
	property: z.string().trim().max(512)
}).strict();
/** Master-level connection fields; an empty secret clears it. The mapping goes through `search/map`. */
const ConnectBody = z.object({
	gscAuth: z.enum([
		"off",
		"oauth",
		"service_account"
	]).optional(),
	gscClientId: z.string().trim().max(256).optional(),
	gscClientSecret: z.string().trim().max(256).optional(),
	gscServiceAccount: z.string().trim().max(8192).optional(),
	bingEnabled: z.boolean().optional(),
	bingAuth: z.enum(["apikey", "oauth"]).optional(),
	bingApiKey: z.string().trim().max(128).optional(),
	bingClientId: z.string().trim().max(256).optional(),
	bingClientSecret: z.string().trim().max(256).optional()
}).strict();
/** `sc-domain:example.com` or an http(s) URL prefix ending in `/` for Google; an http(s) URL for Bing; empty unmaps. */
function validProperty(source, p) {
	if (!p) return true;
	if (source === "google" && /^sc-domain:[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(p)) return true;
	try {
		const u = new URL(p);
		return (u.protocol === "https:" || u.protocol === "http:") && !u.search && !u.hash && !u.username && (source === "bing" || p.endsWith("/"));
	} catch {
		return false;
	}
}
const redirectUri = (origin) => `${origin}/_emdash/admin/plugins/${PLUGIN_ID}/search`;
const manage$2 = "plugins:manage";
function http(ctx) {
	if (!ctx.http) throw new PluginRouteError("network_unavailable", "Outbound requests are not available to this plugin.", 500);
	return ctx.http;
}
/** A provider failure as a typed route error with the status and no body echo. */
function typed(e) {
	if (e instanceof SourceError) throw new PluginRouteError("source_error", e.message, e.status === 401 || e.status === 403 ? 400 : 502);
	throw e;
}
/** Search actions shared by the admin routes and the agent API (`sync:search`). */
function searchService(env) {
	const now = () => env.now?.() ?? Date.now();
	const bound = async (ctx, site) => bindSite(site, (await env.settings()).siteId, ctx.storage?.sites);
	const today = (s) => dayInZone(Math.floor(now() / 1e3), s.siteTimezone);
	async function syncCtx(ctx) {
		return {
			http: http(ctx),
			kv: ctx.kv,
			db: await env.db(),
			dbOf: (site) => env.db(site),
			settings: await env.settings(),
			clients: (await loadSites(ctx.storage?.sites)).filter((c) => !c.linked),
			now,
			...ctx.cron ? { cron: ctx.cron } : {},
			...ctx.request ? { requestUrl: ctx.request.url } : {}
		};
	}
	function usable(s, b, source) {
		if (!SOURCES[source].configured(s)) throw new PluginRouteError("not_configured", `The ${source} source is not connected.`, 400);
		if (!mappingOf(s, b.client, source)) throw new PluginRouteError("not_mapped", "No property mapped for this site.", 400);
	}
	/**
	* Start a backfill of `days` (default `backfillDays`) or from `from`, clamped to the provider's limit. A named `from`
	* runs as asked. Otherwise the range ends at the newest missing day before the sync window (a hole left by an outage
	* included), and when no day is missing nothing starts. The tick never writes a stored day before the sync window again.
	*/
	async function start(ctx, b, source, s, o) {
		const t = today(s);
		if (o.days !== void 0 && o.from !== void 0) throw new PluginRouteError("invalid_range", "Send days or from, not both.", 400);
		if (o.from && o.to && o.from > o.to) throw new PluginRouteError("invalid_range", "from must not be after to.", 400);
		if (o.to && o.to >= t) throw new PluginRouteError("invalid_range", "A backfill ends yesterday at the latest.", 400);
		const r = backfillRange({
			days: o.from ? void 0 : o.days ?? s.backfillDays,
			from: o.from
		}, source, addDays(t, -1), s.searchRetentionDays);
		let to = o.to ?? r.to;
		if (!o.from) {
			const rows = await (await env.db(b.id)).all("SELECT DISTINCT day FROM ca_search_daily WHERE site = ? AND source = ? AND day >= ? AND day <= ?", [
				b.id,
				source,
				r.from,
				to
			]);
			const stored = new Set(rows.map((x) => String(x.day)));
			if (stored.size) {
				const end = addDays(t, -8);
				if (to > end) to = end;
				while (to >= r.from && stored.has(to)) to = addDays(to, -1);
			}
		}
		if (r.from > to) return {
			site: b.id,
			source,
			from: r.from,
			clamped: r.clamped,
			stored: true,
			backfill: null
		};
		return {
			site: b.id,
			source,
			from: r.from,
			clamped: r.clamped,
			stored: false,
			backfill: await startBackfill(ctx.kv, b.id, source, r.from, to, t, now())
		};
	}
	return {
		syncCtx,
		start,
		/** One forced tick over the site's pairs (one source when given). */
		async sync(ctx, body) {
			const b = await bound(ctx, body.site);
			const s = await env.settings();
			if (body.source) usable(s, b, body.source);
			return runSearchTick(await syncCtx(ctx), { only: {
				site: b.id,
				...body.source ? { source: body.source } : {}
			} });
		},
		async backfill(ctx, body) {
			const b = await bound(ctx, body.site);
			const source = body.source ?? "google";
			if (body.action === "cancel") return cancelBackfill(ctx.kv, b.id, source);
			if (body.action === "status") return {
				site: b.id,
				source,
				backfill: await backfillStatus(ctx.kv, b.id, source, now())
			};
			const s = await env.settings();
			usable(s, b, source);
			return start(ctx, b, source, s, body);
		},
		async status(ctx, site) {
			const b = await bound(ctx, site);
			const s = await env.settings();
			const db = await env.db(b.id);
			const t = today(s);
			const rows = /* @__PURE__ */ new Map();
			const syncFrom = addDays(t, -7);
			for (const r of await db.all("SELECT source, day, COUNT(*) AS n FROM ca_search_daily WHERE site = ? GROUP BY source, day ORDER BY source, day", [b.id])) {
				const day = String(r.day);
				const x = rows.get(String(r.source));
				if (!x) {
					rows.set(String(r.source), {
						n: Number(r.n),
						first: day,
						last: day,
						holes: []
					});
					continue;
				}
				const end = addDays(day, -1) < syncFrom ? addDays(day, -1) : addDays(syncFrom, -1);
				if (addDays(x.last, 1) <= end) x.holes.push([addDays(x.last, 1), end]);
				x.n += Number(r.n);
				x.last = day;
			}
			const sources = [];
			for (const id of SOURCE_IDS) {
				const st = await ctx.kv.get(stateKey(b.id, id)) ?? {};
				const r = rows.get(id);
				sources.push({
					id,
					configured: SOURCES[id].configured(s),
					auth: id === "bing" ? s.bingAuth : s.gscAuth,
					property: mappingOf(s, b.client, id),
					lastRun: st.lastRun ?? null,
					status: st.status ?? null,
					message: st.status === "throttled" ? THROTTLE_TEXT[id] : null,
					throttleCode: st.status === "throttled" ? st.throttleCode ?? null : null,
					nextAttempt: st.status === "throttled" ? st.nextAttempt ?? null : null,
					lastError: st.lastError ?? null,
					lastErrorAt: st.lastErrorAt ?? null,
					syncing: !!st.cursorDay,
					rows: r?.n ?? 0,
					firstDay: r?.first ?? null,
					lastDay: r?.last ?? null,
					holes: r?.holes ?? [],
					perDay: r ? Math.ceil(r.n / daysBetween(r.first, r.last)) : 500,
					limitDays: PROVIDER_DAYS[id],
					backfill: await backfillStatus(ctx.kv, b.id, id, now())
				});
			}
			const used = await ctx.kv.get(KV_SYNC_ROWS);
			const budget = {
				profile: s.capacityProfile,
				daily: SYNC_BUDGET[s.capacityProfile].daily,
				usedToday: used?.day === utcDay(now()) ? used.rows : 0,
				defaultDays: s.backfillDays,
				retentionDays: s.searchRetentionDays
			};
			return {
				site: b.id,
				kind: b.kind,
				sources,
				budget,
				provisional: {
					from: addDays(t, -3),
					to: addDays(t, -1)
				}
			};
		},
		bound
	};
}
function searchRoutes(env) {
	const svc = searchService(env);
	const now = () => env.now?.() ?? Date.now();
	return {
		"search/status": {
			permission: "plugins:read",
			input: StatusBody,
			handler: async (ctx) => svc.status(ctx, StatusBody.parse(ctx.input ?? void 0)?.site)
		},
		"search/test": {
			permission: manage$2,
			input: TestBody,
			async handler(ctx) {
				const body = TestBody.parse(ctx.input ?? {});
				const b = await svc.bound(ctx, body.site);
				const s = await env.settings();
				const src = SOURCES[body.source];
				try {
					const target = targetOf(s, b.id, b.client, body.source, ctx.request?.url);
					return {
						ok: true,
						source: body.source,
						result: await src.test({
							http: http(ctx),
							kv: ctx.kv,
							settings: s,
							budget: makeBudget(now)
						}, target)
					};
				} catch (e) {
					if (e instanceof SourceError) return {
						ok: false,
						source: body.source,
						status: e.status,
						message: e.message
					};
					throw e;
				}
			}
		},
		"search/sync": {
			permission: manage$2,
			input: SyncBody,
			handler: async (ctx) => svc.sync(ctx, SyncBody.parse(ctx.input ?? {}))
		},
		"search/backfill": {
			permission: manage$2,
			input: BackfillRouteBody,
			handler: async (ctx) => svc.backfill(ctx, BackfillRouteBody.parse(ctx.input))
		},
		"search/oauth/start": {
			permission: manage$2,
			input: OAuthStartBody,
			async handler(ctx) {
				const s = await env.settings();
				const origin = s.siteOrigin || (ctx.request ? new URL(ctx.request.url).origin : "");
				if (!origin) throw new PluginRouteError("origin_unknown", "Set the site origin in the plugin settings.", 400);
				if (OAuthStartBody.parse(ctx.input ?? void 0)?.source === "bing") return startBingOAuth({
					kv: ctx.kv,
					settings: s,
					now
				}, redirectUri(origin));
				return startOAuth({
					kv: ctx.kv,
					settings: s,
					now
				}, redirectUri(origin));
			}
		},
		"search/oauth/exchange": {
			permission: manage$2,
			input: OAuthExchangeBody,
			async handler(ctx) {
				const body = OAuthExchangeBody.parse(ctx.input);
				const settings = ctx.settings;
				if (!settings) throw new PluginRouteError("settings_unavailable", "Plugin settings are not available.", 500);
				const setSecret = async (key, value) => {
					try {
						await settings.set(key, value);
					} catch (e) {
						if (e.name === "PluginSettingEncryptionError") throw new PluginRouteError("encryption_key_missing", "Saving the connection needs EMDASH_ENCRYPTION_KEY on the server.", 400);
						throw e;
					}
				};
				const base = {
					http: http(ctx),
					kv: ctx.kv,
					settings: await env.settings(),
					now,
					setSecret
				};
				const r = (body.source ? body.source === "bing" : await isBingState(ctx.kv, body.state)) ? await exchangeBingOAuth(base, body.code, body.state).catch(typed) : await exchangeOAuth(base, body.code, body.state).catch(typed);
				env.settingsChanged?.();
				return r;
			}
		},
		"search/import": {
			permission: manage$2,
			input: ImportBody,
			async handler(ctx) {
				const body = ImportBody.parse(ctx.input);
				const b = await svc.bound(ctx, body.site);
				const s = await env.settings();
				try {
					const csv = parseBingCsv(body.csv);
					const target = targetOf(s, b.id, b.client, "bing", ctx.request?.url);
					const rows = syncRows({
						db: await env.db(),
						kv: ctx.kv,
						now,
						settings: s
					});
					return {
						site: b.id,
						source: "bing",
						...await importBingCsv({
							db: await env.db(b.id),
							target,
							today: dayInZone(Math.floor(now() / 1e3), s.siteTimezone),
							retentionDays: Math.min(s.searchRetentionDays, s.backfillDays),
							rows
						}, csv, body.day)
					};
				} catch (e) {
					if (e instanceof CsvError) throw new PluginRouteError("invalid_file", e.message, 400);
					if (e instanceof RowsPaused) throw new PluginRouteError("write_budget", e.message, 429);
					throw e;
				}
			}
		},
		"search/properties": {
			permission: manage$2,
			input: PropertiesBody,
			async handler(ctx) {
				const body = PropertiesBody.parse(ctx.input ?? {});
				const b = await svc.bound(ctx, body.site);
				const s = await env.settings();
				if (!SOURCES[body.source].configured(s)) throw new PluginRouteError("not_configured", `The ${body.source} source is not connected.`, 400);
				const items = body.source === "google" ? await listProperties({
					http: http(ctx),
					settings: s,
					now
				}).catch(typed) : (await listBingSites({
					http: http(ctx),
					settings: s
				}).catch(typed)).map((x) => ({
					siteUrl: x.siteUrl,
					permissionLevel: "verified"
				}));
				const host = hostnameOf(canonicalOrigin({
					siteOrigin: s.siteOrigin,
					client: b.client,
					...ctx.request ? { requestUrl: ctx.request.url } : {}
				}));
				return {
					site: b.id,
					source: body.source,
					current: mappingOf(s, b.client, body.source),
					suggested: host ? suggestProperty(items.map((i) => i.siteUrl), host) : null,
					items
				};
			}
		},
		"search/map": {
			permission: manage$2,
			input: MapBody,
			async handler(ctx) {
				const body = MapBody.parse(ctx.input);
				if (!validProperty(body.source, body.property)) throw new PluginRouteError("invalid_property", body.source === "google" ? "Use sc-domain:example.com or a URL prefix such as https://example.com/." : "Use the site URL as registered, such as https://example.com/.", 400);
				const b = await svc.bound(ctx, body.site);
				const field = MAPPING_FIELD[body.source];
				const before = mappingOf(await env.settings(), b.client, body.source);
				if (b.client) {
					const sites = ctx.storage?.sites;
					if (!sites) throw new PluginRouteError("storage_unavailable", "The sites collection is not available.", 500);
					const cur = ClientSiteSchema.parse(await sites.get(b.id));
					await sites.put(b.id, {
						...cur,
						[field]: body.property
					});
					invalidateRegistry();
				} else {
					if (!ctx.settings) throw new PluginRouteError("settings_unavailable", "Plugin settings are not available.", 500);
					await ctx.settings.set(field, body.property);
					env.settingsChanged?.();
				}
				const s = await env.settings();
				const backfill = !before && !!body.property && s.capacityProfile !== "small" && SOURCES[body.source].configured(s) && !await backfillStatus(ctx.kv, b.id, body.source, now()) ? (await svc.start(ctx, b, body.source, s, {})).backfill : null;
				return {
					site: b.id,
					source: body.source,
					property: body.property,
					backfill
				};
			}
		},
		"search/connect": {
			permission: manage$2,
			input: ConnectBody,
			async handler(ctx) {
				const body = ConnectBody.parse(ctx.input ?? {});
				const settings = ctx.settings;
				if (!settings) throw new PluginRouteError("settings_unavailable", "Plugin settings are not available.", 500);
				if (body.gscServiceAccount && !gscConfigured({
					gscAuth: "service_account",
					gscServiceAccount: body.gscServiceAccount,
					gscClientId: "",
					gscClientSecret: "",
					gscRefreshToken: ""
				})) throw new PluginRouteError("invalid_service_account", "Paste the whole JSON key file of the service account.", 400);
				if (body.bingApiKey && !/^[A-Za-z0-9]{16,128}$/.test(body.bingApiKey)) throw new PluginRouteError("invalid_api_key", "The Bing API key has letters and digits only.", 400);
				if (body.bingClientId && !/^[A-Za-z0-9._-]{4,256}$/.test(body.bingClientId)) throw new PluginRouteError("invalid_client_id", "The Bing client id has letters, digits, dots, dashes and underscores only.", 400);
				try {
					for (const [key, value] of Object.entries(body)) if (value === "" && settings.delete) await settings.delete(key);
					else await settings.set(key, value);
				} catch (e) {
					if (e.name === "PluginSettingEncryptionError") throw new PluginRouteError("encryption_key_missing", "Saving keys needs EMDASH_ENCRYPTION_KEY on the server.", 400);
					throw e;
				} finally {
					env.settingsChanged?.();
				}
				const s = await env.settings();
				return {
					google: SOURCES.google.configured(s),
					bing: SOURCES.bing.configured(s)
				};
			}
		}
	};
}
// src/routes/tools.ts
/**
* Admin tool routes, all `plugins:manage`: agent tester, channel
* reclassification, rollup now, purge now, delete all data, filtered delete, void revenue. The agent API has no delete route.
*/
const TestAgentBody = z.object({ ua: z.string().max(2048) }).strict();
const ReclassifyBody = z.object({
	cursor: z.string().max(64).optional(),
	site: SiteField
}).strict();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const RollupNowBody = z.object({
	from: Day,
	to: Day,
	site: SiteField,
	after: z.string().regex(SITE_ID_RE).optional()
}).strict().refine((b) => b.from <= b.to && daysBetween(b.from, b.to) <= 31, { message: "from must not be after to, at most 31 days" }).or(z.object({}).strict()).optional();
/** Requests `tools/rollup-now` with a range leaves to the host and its own reads (settings, raw window, watermark, goals). */
const ROLLUP_NOW_RESERVE = 10;
const EmptyBody$1 = z.object({}).strict().optional();
const DeleteAllBody = z.object({
	confirm: z.literal("DELETE"),
	site: SiteField
}).strict();
const PurgeSiteBody = z.object({
	site: z.string().regex(SITE_ID_RE),
	confirm: z.literal("DELETE")
}).strict();
const PurgeSearchBody = z.object({
	site: SiteField,
	source: z.enum(["google", "bing"])
}).strict();
/** `tools/revenue-void`: one day, one event name, values at or above `minValue`; `confirm` writes. */
const RevenueVoidBody = z.object({
	site: SiteField,
	day: Day,
	name: z.string().min(1).max(64),
	minValue: z.number().min(0).max(1e9),
	confirm: z.literal(true).optional()
}).strict();
const DeletePreviewBody = z.object({
	site: SiteField,
	spec: DeleteSpecSchema
}).strict();
/** `confirm`: the number of matching visits the preview showed, or DELETE. */
const DeleteStartBody = z.object({
	site: SiteField,
	spec: DeleteSpecSchema,
	confirm: z.string().min(1).max(32)
}).strict();
const RECLASSIFY_BATCHES = 4;
const manage$1 = "plugins:manage";
function toolRoutes(env) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1e3);
	const rollupCtx = async (ctx, db) => ({
		db,
		settings: await env.settings(),
		goals: (site) => env.goals(ctx, site)
	});
	/**
	* One bounded call of a per-site delete. A site id that is neither local nor registered
	* is accepted here only when rows of it or a delete cursor are still stored (a deleted client site). Database-wide KV
	* state (watermark, retention cursor, drop counters) is cleared once no site has rows left.
	*/
	async function deleteSite(ctx, requested) {
		const s = await env.settings();
		let site;
		try {
			site = (await bindSite(requested, s.siteId, ctx.storage?.sites)).id;
		} catch (err) {
			if (!requested || !((await sitesInTables(await env.db(requested))).includes(requested) || await ctx.kv.get(purgeKey(requested)))) throw err;
			site = requested;
		}
		const db = await env.db(site);
		const r = await purgeSite(db, ctx.kv, site, { now: now() });
		if (r.done && !(await sitesInTables(db)).length) for (const k of [
			KV_WATERMARK,
			KV_ROLLUP_CURSOR,
			KV_CURSOR
		]) await stateKv(ctx.kv, site).delete(k);
		clearReportCache();
		return r;
	}
	/** The bound site and what the delete preview and job read from it. */
	const deleteEnv = async (ctx, requested) => {
		const settings = await env.settings();
		const site = (await bindSite(requested, settings.siteId, ctx.storage?.sites)).id;
		return {
			db: await env.db(site),
			kv: ctx.kv,
			settings,
			site,
			now: now()
		};
	};
	const jobEnv = async (ctx) => ({
		kv: ctx.kv,
		db: (site) => env.db(site),
		settings: await env.settings(),
		goals: (site) => env.goals(ctx, site),
		now: now()
	});
	/** One job call with the profile's requests less `keep`: the preview of delete-start and the host's own queries share the invocation. */
	const runJob = async (ctx, keep) => {
		const je = await jobEnv(ctx);
		return runDeleteJob(je, PROFILES[je.settings.capacityProfile].requests - keep);
	};
	/** The job, the recent deletions and the job's daily rows on `small` (null: no daily cap). */
	const deleteState = async (ctx, job) => ({
		job: jobView(job),
		log: await ctx.kv.get("delete:log") ?? [],
		dayRows: (await env.settings()).capacityProfile === "small" ? DELETE_DAY_ROWS : null
	});
	return {
		/** Read-only preview of a filtered delete: matches per day, top values, summary days, revenue and the rows it writes. */
		"tools/delete-preview": {
			permission: manage$1,
			input: DeletePreviewBody,
			async handler(ctx) {
				const body = DeletePreviewBody.parse(ctx.input);
				return previewDelete(await deleteEnv(ctx, body.site), body.spec);
			}
		},
		/** Start a filtered delete job (one at a time) after the confirmation, and run its first call. */
		"tools/delete-start": {
			permission: manage$1,
			input: DeleteStartBody,
			async handler(ctx) {
				const body = DeleteStartBody.parse(ctx.input);
				if (isActive(await ctx.kv.get("delete:job"))) throw new PluginRouteError("delete_running", "A delete is still running. Wait for it or cancel it first.", 409);
				const e = await deleteEnv(ctx, body.site);
				const p = await previewDelete(e, body.spec);
				const visits = String(p.totals.visits);
				if (body.confirm !== "DELETE" && body.confirm !== visits) throw new PluginRouteError("confirm_required", `Type the number of matching visits (${visits}) or DELETE to confirm.`, 400);
				if (!p.totals.visits && !(body.spec.oldDays && p.old?.days.length)) throw new PluginRouteError("nothing_to_delete", "Nothing matches these conditions.", 400);
				await ctx.kv.delete(KV_DELETE_CANCEL);
				await ctx.kv.set(KV_DELETE_JOB, await createJob(e, body.spec, ctx.user?.email ?? null, p));
				return deleteState(ctx, await runJob(ctx, 20));
			}
		},
		/** One more bounded call of the running delete job (the page calls it while open; the `retention` cron task otherwise). */
		"tools/delete-run": {
			permission: manage$1,
			input: EmptyBody$1,
			async handler(ctx) {
				return deleteState(ctx, await runJob(ctx, 8));
			}
		},
		/** Cancel the running job: no further visits are deleted; the days already touched get their summaries stored again. */
		"tools/delete-cancel": {
			permission: manage$1,
			input: EmptyBody$1,
			async handler(ctx) {
				const job = await ctx.kv.get(KV_DELETE_JOB);
				if (!isActive(job)) return deleteState(ctx, job);
				await ctx.kv.set(KV_DELETE_CANCEL, job.id);
				return deleteState(ctx, await runJob(ctx, 8));
			}
		},
		/** The current or last job and the recent deletions, read only. */
		"tools/delete-status": {
			permission: manage$1,
			input: EmptyBody$1,
			async handler(ctx) {
				return deleteState(ctx, await ctx.kv.get(KV_DELETE_JOB));
			}
		},
		/**
		* Void spoofed revenue of orders without an id (orders with an id are corrected or voided through
		* `agent/v1/events`): without `confirm` it counts the matching hits, with `confirm: true` it sets
		* `val` and `cur` to NULL on them. Raw window only; the `revenue` task's reconcile restates the day.
		*/
		"tools/revenue-void": {
			permission: manage$1,
			input: RevenueVoidBody,
			async handler(ctx) {
				const body = RevenueVoidBody.parse(ctx.input);
				const s = await env.settings();
				const site = (await bindSite(body.site, s.siteId, ctx.storage?.sites)).id;
				const rawFrom = await rawFromDay(stateKv(ctx.kv, site), s, now());
				if (body.day < rawFrom || body.day > dayInZone(now(), s.siteTimezone)) throw new PluginRouteError("outside_raw_window", `Revenue can be voided from ${rawFrom} to today only; older days keep their stored rollup.`, 400);
				const db = await env.db(site);
				const where = "site = ? AND day = ? AND name = ? AND val IS NOT NULL AND val >= ?";
				const params = [
					site,
					dayInt(body.day),
					body.name,
					body.minValue
				];
				if (!body.confirm) {
					const [r] = await db.all(`SELECT COUNT(*) AS n FROM ca_events WHERE ${where}`, params);
					return {
						site,
						day: body.day,
						matched: Number(r?.n ?? 0),
						voided: 0
					};
				}
				const r = await db.run(`UPDATE ca_events SET val = NULL, cur = NULL WHERE ${where}`, params);
				clearReportCache();
				return {
					site,
					day: body.day,
					matched: r.changes,
					voided: r.changes
				};
			}
		},
		"tools/test-agent": {
			permission: manage$1,
			input: TestAgentBody,
			async handler(ctx) {
				const { ua } = TestAgentBody.parse(ctx.input);
				const rules = await env.agentRules(ctx);
				const c = createClassifier(rules).classify(ua);
				const user = rules.find((r, i) => (r.id ?? `user-${i + 1}`) === c.botId);
				return {
					...c,
					matched: c.audience === "robot" ? user ? "user_rule" : "builtin" : "none",
					rule: user ?? null
				};
			}
		},
		"tools/reclassify-channels": {
			permission: manage$1,
			input: ReclassifyBody,
			async handler(ctx) {
				const body = ReclassifyBody.parse(ctx.input ?? {});
				const s = await env.settings();
				const site = (await bindSite(body.site, s.siteId, ctx.storage?.sites)).id;
				const db = await env.db(site);
				const rules = await env.channelRules(ctx, site);
				const from = await rawFromDay(stateKv(ctx.kv, site), s, now());
				const clickChannels = new Set(rules.filter((r) => r.any.some((c) => c.click)).map((r) => r.channel));
				let cursor = body.cursor ?? "";
				const x = entryCols(db.dialect, "x");
				let scanned = 0;
				let updated = 0;
				let done = false;
				const changed = /* @__PURE__ */ new Set();
				for (let b = 0; b < RECLASSIFY_BATCHES && !done; b++) {
					const rows = await db.all(`SELECT s.sid AS sid, s.day AS day, s.channel AS channel, s.source AS source, s.ref_host AS ref_host, ${UTM_KEYS.map((k) => `s.${k} AS ${k}`).join(", ")},
(SELECT ${x.query} FROM ${entriesOf(db.dialect, "x")} WHERE ${x.pv} ORDER BY ${x.ts}, ${x.id} LIMIT 1) AS q
FROM ca_sessions s WHERE s.site = ? AND s.day >= ? AND s.sid > ? ORDER BY s.sid LIMIT 500`, [
						site,
						visitDayKey(from),
						cursor
					]);
					scanned += rows.length;
					const groups = /* @__PURE__ */ new Map();
					for (const r of rows) {
						const utm = {};
						for (const k of UTM_KEYS) if (typeof r[k] === "string") utm[k] = r[k];
						const params = new URLSearchParams(typeof r.q === "string" ? r.q : "");
						const clickIds = CLICK_IDS.filter((k) => params.has(k));
						const res = classifyChannel({
							refHost: r.ref_host ?? null,
							utm,
							clickIds
						}, { rules });
						if (res.channel === r.channel && res.source === r.source) continue;
						if (!clickIds.length && !Object.keys(utm).length && clickChannels.has(String(r.channel))) continue;
						const k = JSON.stringify([res.channel, res.source]);
						groups.set(k, [...groups.get(k) ?? [], String(r.sid)]);
						changed.add(isoDay(r.day));
					}
					for (const [k, sids] of groups) {
						const [channel, source] = JSON.parse(k);
						const w = inList(db.dialect, "sid", sids);
						updated += (await db.run(`UPDATE ca_sessions SET channel = ?, source = ? WHERE site = ? AND (${w.sql})`, [
							channel,
							source,
							site,
							...w.params
						])).changes;
					}
					const moved = [...groups.values()].flat();
					if (moved.length) {
						const w = inList(db.dialect, "sid", moved);
						for (const r of await db.all(`SELECT DISTINCT day FROM ca_events WHERE site = ? AND day >= ? AND val IS NOT NULL AND (${w.sql})`, [
							site,
							dayInt(from),
							...w.params
						])) changed.add(isoDay(r.day));
					}
					if (rows.length) cursor = String(rows[rows.length - 1]?.sid);
					done = rows.length < 500;
				}
				if (updated) clearReportCache();
				const wm = await stateKv(ctx.kv, site).get(KV_WATERMARK);
				const stored = wm ? [...changed].filter((d) => d <= wm).sort() : [];
				return {
					site,
					scanned,
					updated,
					cursor: done ? null : cursor,
					done,
					stored
				};
			}
		},
		"tools/rollup-now": {
			permission: manage$1,
			input: RollupNowBody,
			async handler(ctx) {
				const body = RollupNowBody.parse(ctx.input ?? void 0);
				clearReportCache();
				const s = await env.settings();
				let spent = 0;
				const range = body && "from" in body ? body : null;
				const store = async (db, kv, r, only) => {
					const rc = await rollupCtx(ctx, db);
					const rawFrom = await rawFromDay(kv, s, now());
					if (r.from < rawFrom) throw new PluginRouteError("raw_gone", `Raw data starts on ${rawFrom}; earlier days keep their stored rollup.`, 400);
					let rows = 0;
					const all = eachDay(r.from, r.to).filter((d) => d <= lastClosedDay(now(), s.siteTimezone));
					const sites = /* @__PURE__ */ new Set();
					const cap = PROFILES[s.capacityProfile].requests - ROLLUP_NOW_RESERVE - spent;
					const c = counted$1(rc.db);
					let next = null;
					let after = null;
					let ran = false;
					walk: for (const d of all) {
						let last = d === r.from ? r.after ?? "" : "";
						for (const site of (await sitesOfDay(c.db, d, last)).filter((x) => !only || x === only)) {
							const goals = await rc.goals(site);
							if (ran && c.n() + dayStatements(goals) > cap) {
								[next, after] = [d, last || null];
								break walk;
							}
							ran = true;
							sites.add(site);
							rows += await rollupDay({
								db: c.db,
								site,
								settings: rc.settings,
								goals
							}, d);
							last = site;
						}
					}
					spent += c.n();
					return {
						days: next ? all.filter((d) => d < next) : all,
						rows,
						sites: [...sites].sort(),
						next,
						after,
						watermark: await kv.get(KV_WATERMARK)
					};
				};
				if (range?.site) {
					const site = (await bindSite(range.site, s.siteId, ctx.storage?.sites)).id;
					return store(await env.db(site), stateKv(ctx.kv, site), range, site);
				}
				return eachDatabase(env.db, ctx.kv, async (db, kv) => range ? store(db, kv, range, null) : runRollup(await rollupCtx(ctx, db), kv, now()));
			}
		},
		"tools/purge": {
			permission: manage$1,
			input: EmptyBody$1,
			async handler(ctx) {
				const s = await env.settings();
				clearReportCache();
				return eachDatabase(env.db, ctx.kv, async (db, kv) => {
					const prev = await kv.get(KV_CURSOR);
					await kv.set(KV_CURSOR, {
						...prev,
						day: ""
					});
					return runRetention(db, kv, s, now());
				});
			}
		},
		"tools/delete-all": {
			permission: manage$1,
			input: DeleteAllBody,
			async handler(ctx) {
				const body = DeleteAllBody.safeParse(ctx.input);
				if (!body.success) throw new PluginRouteError("confirm_required", "Send { \"confirm\": \"DELETE\" }.", 400);
				return deleteSite(ctx, body.data.site);
			}
		},
		"tools/purge-site": {
			permission: manage$1,
			input: PurgeSiteBody,
			async handler(ctx) {
				const body = PurgeSiteBody.safeParse(ctx.input);
				if (!body.success) throw new PluginRouteError("confirm_required", "Send { \"site\": \"<id>\", \"confirm\": \"DELETE\" }.", 400);
				return deleteSite(ctx, body.data.site);
			}
		},
		"tools/purge-search": {
			permission: manage$1,
			input: PurgeSearchBody,
			async handler(ctx) {
				const body = PurgeSearchBody.parse(ctx.input);
				const s = await env.settings();
				const site = (await bindSite(body.site, s.siteId, ctx.storage?.sites)).id;
				const r = await purgeSearch(await env.db(site), site, body.source);
				clearReportCache();
				return {
					site,
					source: body.source,
					...r
				};
			}
		}
	};
}
// src/routes/move.ts
/**
* Data move routes, all `plugins:manage` like the delete tools: status, start, run (the page polls it while open),
* pause, cancel, verify and drop-old-tables. The source is the EmDash database or a binding the admin types; the
* destination is always the database the site writes to now (the plugin option, set before by a deploy).
*/
const EmptyBody = z.object({}).strict().optional();
const MoveStartBody = z.object({
	source: z.string().regex(BINDING_RE).nullable().default(null),
	site: SiteField
}).strict();
const MovePauseBody = z.object({ resume: z.boolean().optional() }).strict().optional();
const MoveDropBody = z.object({ confirm: z.literal("DELETE") }).strict();
const manage = "plugins:manage";
const name = (b) => b ?? "the EmDash database";
const MOVING = "Data is being moved between databases. Wait for the move to finish or cancel it first.";
/**
* Whether `a` and `b` reach one database (two bindings of one D1 database, or the EmDash database by its binding
* name): a uniquely named marker table is created through `a`, looked up through `b`, and dropped.
*/
async function sameDatabase(a, b) {
	if (a.dialect !== b.dialect) return false;
	const t = `ca_same_${crypto.randomUUID().replace(/-/g, "")}`;
	await a.run(`CREATE TABLE ${t} (x INTEGER)`);
	try {
		const sql = a.dialect === "postgres" ? "SELECT 1 AS x FROM pg_catalog.pg_class WHERE relname = ?" : "SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?";
		return (await b.all(sql, [t])).length > 0;
	} finally {
		await a.run(`DROP TABLE IF EXISTS ${t}`);
	}
}
/** `route` refused while a move is active (the delete tools: no day may be closed or deleted from half copied rows). */
function refuseWhileMoving(route) {
	return {
		...route,
		async handler(ctx) {
			if (isMoving(await ctx.kv.get("move:job"))) throw new PluginRouteError("move_running", MOVING, 409);
			return route.handler(ctx);
		}
	};
}
function moveRoutes(env) {
	const now = () => env.now?.() ?? Math.floor(Date.now() / 1e3);
	const jobEnv = async (ctx) => ({
		kv: ctx.kv,
		source: async (b) => {
			const db = await env.source(b);
			if (!db) throw new PluginRouteError("source_missing", `The binding ${name(b)} is not a D1 or Hyperdrive binding of this Worker.`, 400);
			return db;
		},
		dest: env.dest,
		destKv: env.destKv,
		...await env.settings().then((s) => ({
			profile: s.capacityProfile,
			settings: s
		})),
		now: now(),
		cron: ctx.cron
	});
	const state = (job) => ({
		job: moveView(job),
		dest: env.destBinding(job?.site)
	});
	/** One call with the profile's requests less `keep` (the route's own reads and the host's). */
	const run = async (ctx, keep) => {
		const e = await jobEnv(ctx);
		return runMoveJob(e, PROFILES[e.profile].requests - keep);
	};
	const current = (ctx) => ctx.kv.get(KV_MOVE_JOB);
	/** Whether `src` is one of the databases of `targets` under another name (names alone do not tell). */
	const writtenTo = async (src, targets) => {
		for (const t of targets) {
			const d = await env.source(t);
			if (d && await sameDatabase(d, src)) return true;
		}
		return false;
	};
	/** Apply a stop key now when no call runs; a call in flight applies it at its end. Never rewrites the position. */
	const stop = async (ctx, job, status) => {
		await ctx.kv.set(KV_MOVE_STOP, {
			id: job.id,
			status
		});
		return runMoveJob(await jobEnv(ctx), 0);
	};
	return {
		/** The current or last move and the destination of the default site. */
		"move/status": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx) {
				return state(await current(ctx));
			}
		},
		/** Start a move from `source` into the database of `site` (or the default one), then its first call. */
		"move/start": {
			permission: manage,
			input: MoveStartBody,
			async handler(ctx) {
				const body = MoveStartBody.parse(ctx.input ?? {});
				if (isMoving(await current(ctx))) throw new PluginRouteError("move_running", "A move is already running. Wait for it or cancel it first.", 409);
				if (isActive(await ctx.kv.get("delete:job"))) throw new PluginRouteError("delete_running", "A delete is still running. Wait for it or cancel it first.", 409);
				const s = await env.settings();
				const site = body.site === void 0 ? void 0 : (await bindSite(body.site, s.siteId, ctx.storage?.sites)).id;
				const dest = env.destBinding(site);
				if (body.source === dest) throw new PluginRouteError("same_database", `The site already writes to ${name(dest)}. Change the plugin option to the new database and deploy first.`, 400);
				if (env.targets().includes(body.source) && site === void 0) throw new PluginRouteError("source_in_use", `Sites still write to ${name(body.source)}. Choose the site to move.`, 400);
				const src = await env.source(body.source);
				if (!src) throw new PluginRouteError("source_missing", `The binding ${name(body.source)} is not a D1 or Hyperdrive binding of this Worker.`, 400);
				if (await sameDatabase(await env.dest(site), src)) throw new PluginRouteError("same_database", `${name(body.source)} is the database the site already writes to, under another name. Change the plugin option to the new database and deploy first.`, 400);
				if (site === void 0 && await writtenTo(src, env.targets().filter((t) => t !== dest))) throw new PluginRouteError("source_in_use", `Sites still write to ${name(body.source)}. Choose the site to move.`, 400);
				if (!await resumeCancelled(ctx.kv, {
					source: body.source,
					dest,
					site
				})) await ctx.kv.set(KV_MOVE_JOB, newMoveJob({
					source: body.source,
					dest,
					site,
					by: ctx.user?.email ?? null,
					now: now(),
					total: await sourceTotals(src, site),
					state: await sourceState(ctx.kv, body.source)
				}));
				await ctx.cron?.schedule(MOVE_CRON, { schedule: MOVE_SCHEDULE });
				return state(await run(ctx, 30));
			}
		},
		/** One more bounded call (the page calls it while open; the `move` cron task otherwise). */
		"move/run": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx) {
				return state(await run(ctx, 8));
			}
		},
		/** Pause the running move (the tasks keep skipping its database), or resume it with `resume: true`. */
		"move/pause": {
			permission: manage,
			input: MovePauseBody,
			async handler(ctx) {
				const body = MovePauseBody.parse(ctx.input ?? void 0);
				const job = await current(ctx);
				if (!isMoving(job)) return state(job);
				if (body?.resume) {
					await ctx.kv.delete(KV_MOVE_STOP);
					if (job.status === "paused") await ctx.kv.set(KV_MOVE_JOB, {
						...job,
						status: "running",
						error: null
					});
					await ctx.cron?.schedule(MOVE_CRON, { schedule: MOVE_SCHEDULE });
					return state(await current(ctx));
				}
				const pending = await ctx.kv.get(KV_MOVE_STOP);
				if (job.status === "paused" || pending?.id === job.id && pending.status === "cancelled") return state(job);
				return state(await stop(ctx, job, "paused"));
			}
		},
		/**
		* Stop the move. Rows already copied stay. Starting again with the same source and site continues this job from
		* its position; the counters of a pair already loaded are not added again (the ledger of `job.ts`).
		*/
		"move/cancel": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx) {
				const job = await current(ctx);
				if (!isMoving(job)) return state(job);
				if (job.status === "running") return state(await stop(ctx, job, "cancelled"));
				await ctx.kv.set(KV_MOVE_STOP, {
					id: job.id,
					status: "cancelled"
				});
				const j = {
					...job,
					status: "cancelled",
					finished: now()
				};
				await ctx.kv.set(KV_MOVE_JOB, j);
				await ctx.cron?.cancel(MOVE_CRON).catch(() => {});
				return state(j);
			}
		},
		/** Compare both sides again per table, site and day (after the rollup restored the summaries, say). */
		"move/verify": {
			permission: manage,
			input: EmptyBody,
			async handler(ctx) {
				const job = await current(ctx);
				if (!job || job.status !== "done") throw new PluginRouteError("not_done", "Only a finished move can be checked.", 400);
				if (job.dropped) throw new PluginRouteError("source_dropped", "The old tables were deleted.", 400);
				const e = await jobEnv(ctx);
				const src = await e.source(job.source);
				const dst = await e.dest(job.site);
				const from = await verifyFrom(e.destKv(ctx.kv, job.site), e.settings, e.now);
				const verify = {};
				for (const t of MOVE_ORDER) verify[t] = await verifyTable(src, dst, t, job.site, from);
				const j = {
					...job,
					verify
				};
				await ctx.kv.set(KV_MOVE_JOB, j);
				return state(j);
			}
		},
		/**
		* The last step: drop the nine tables and `ca_meta` from the old database, once the check found nothing missing.
		* When that is the EmDash database its schema version (host KV) goes too, so `ensureSchema` creates the tables
		* again if a site writes there later.
		*/
		"move/drop-old-tables": {
			permission: manage,
			input: MoveDropBody,
			async handler(ctx) {
				if (!MoveDropBody.safeParse(ctx.input).success) throw new PluginRouteError("confirm_required", "Send { \"confirm\": \"DELETE\" }.", 400);
				const job = await current(ctx);
				if (!job || job.status !== "done") throw new PluginRouteError("not_done", "Only the source of a finished move can be deleted.", 400);
				if (job.dropped) return state(job);
				if (job.site !== void 0) throw new PluginRouteError("site_move", `Only the rows of ${job.site} were moved; the old tables keep the other sites' rows and stay.`, 400);
				if (env.targets().includes(job.source)) throw new PluginRouteError("source_in_use", `Sites still write to ${name(job.source)}; its tables stay.`, 400);
				const missing = Object.entries(job.verify).filter(([, v]) => v.short > 0).map(([t]) => t);
				if (missing.length || Object.keys(job.verify).length < MOVE_ORDER.length) throw new PluginRouteError("verify_failed", `The check found rows missing in ${missing.join(", ") || "tables not checked yet"}. Run the check again, or start the move again (it copies missing rows; counters already loaded are not added again), before deleting.`, 400);
				const src = await (await jobEnv(ctx)).source(job.source);
				if (await writtenTo(src, env.targets())) throw new PluginRouteError("source_in_use", `Sites still write to ${name(job.source)} under another name; its tables stay.`, 400);
				const host = job.source === null || await env.source(null).then((h) => !!h && sameDatabase(h, src));
				await dropTables(src);
				if (host) await ctx.kv.delete(SCHEMA_VERSION_KEY);
				const j = {
					...job,
					dropped: now()
				};
				await ctx.kv.set(KV_MOVE_JOB, j);
				return state(j);
			}
		}
	};
}
const CACHE_MAX = 200;
const AGENT_BASE = `/_emdash/api/plugins/${PLUGIN_ID}/agent/v1`;
const processEnv = () => typeof process !== "undefined" && process.env ? process.env : {};
function createRemote(sites, deps = {}) {
	const byId = new Map(sites.map((s) => [s.id, s]));
	const env = deps.env ?? processEnv;
	const nowMs = deps.nowMs ?? Date.now;
	const timeoutMs = deps.timeoutMs ?? 8e3;
	const cache = /* @__PURE__ */ new Map();
	const err = (status, reason) => ({
		ok: false,
		error: "remote_error",
		status,
		reason
	});
	async function call(http, id, path, init) {
		const site = byId.get(id);
		if (!site) return err(0, "not_configured");
		const key = env()[site.keyEnv];
		if (!key) return err(0, "key_missing");
		if (!http) return err(0, "no_http");
		const cacheKey = `${id}\n${init.method} ${path}\n${init.body ?? ""}`;
		const hit = cache.get(cacheKey);
		if (hit && nowMs() - hit.at < 6e4) return hit.value;
		const ac = new AbortController();
		let timer;
		const timeout = new Promise((resolve) => {
			timer = setTimeout(() => {
				ac.abort();
				resolve("timeout");
			}, timeoutMs);
		});
		let res;
		try {
			res = await Promise.race([http.fetch(`${site.origin}${AGENT_BASE}/${path}`, {
				method: init.method,
				redirect: "error",
				headers: {
					"x-api-key": key,
					"x-emdash-request": "1",
					accept: "application/json",
					...init.body ? { "content-type": "application/json" } : {}
				},
				...init.body ? { body: init.body } : {},
				signal: ac.signal
			}), timeout]);
		} catch {
			return ac.signal.aborted ? err(504, "timeout") : err(502, "network");
		} finally {
			clearTimeout(timer);
		}
		if (res === "timeout") return err(504, "timeout");
		if (res.status < 200 || res.status > 299) return err(res.status, "http");
		if (Number(res.headers.get("content-length") ?? 0) > 1048576) return err(res.status, "too_large");
		const buf = await res.arrayBuffer().catch(() => null);
		if (!buf) return err(502, "network");
		if (buf.byteLength > 1048576) return err(res.status, "too_large");
		let json;
		try {
			json = JSON.parse(new TextDecoder().decode(buf));
		} catch {
			return err(res.status, "invalid");
		}
		if (!json || json.ok !== true || json.data === null || typeof json.data !== "object") return err(res.status, "invalid");
		const value = {
			ok: true,
			data: json.data
		};
		if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
		cache.set(cacheKey, {
			at: nowMs(),
			value
		});
		return value;
	}
	return {
		sites,
		find: (id) => id ? byId.get(id) : void 0,
		ids: () => sites.map((s) => s.id),
		/** Whether the key env var of a satellite is set; never its value. */
		keyPresent: (id) => {
			const s = byId.get(id);
			return !!s && !!env()[s.keyEnv];
		},
		/** `agent/v1/query` with the body; `query.site` is left out so the satellite answers its own site. */
		query(http, id, body) {
			const { site: _s, ...query } = body.query;
			return call(http, id, "query", {
				method: "POST",
				body: JSON.stringify({
					...body,
					query
				})
			});
		},
		/** `agent/v1/summary` for a range and compare option. */
		summary(http, id, p) {
			return call(http, id, `summary?${new URLSearchParams({
				from: p.from,
				to: p.to,
				...p.compare ? { compare: p.compare } : {}
			})}`, { method: "GET" });
		},
		clearCache: () => cache.clear()
	};
}
const SUMMARY_CONCURRENCY = 3;
const ROW_METRICS = [
	"sessions",
	"pageviews",
	"visitors",
	"bounce_rate",
	"engaged_rate"
];
const pick = (o) => {
	const r = o && typeof o === "object" ? o : {};
	const m = Object.fromEntries(ROW_METRICS.map((k) => [k, typeof r[k] === "number" ? r[k] : null]));
	if (m.engaged_rate !== null) m.bounce_rate = bounceRate(m.engaged_rate);
	return m;
};
const revenueOf = (v) => (Array.isArray(v) ? v : []).flatMap((e) => e && typeof e.currency === "string" && typeof e.revenue === "number" && typeof e.orders === "number" ? [{
	currency: e.currency,
	revenue: e.revenue,
	orders: e.orders
}] : []);
/**
* One row per satellite from its `agent/v1/summary`: a failed fetch is a row with `error` and null figures,
* never a failed page. `skip` holds ids that resolve to a site of this database.
*/
async function remoteSummaryRows(remote, http, body, skip = /* @__PURE__ */ new Set()) {
	const list = remote.sites.filter((s) => !skip.has(s.id)).slice(0, 10);
	const out = [];
	let next = 0;
	const worker = async () => {
		while (next < list.length) {
			const i = next++;
			const s = list[i];
			const base = {
				id: s.id,
				label: s.label,
				kind: "remote"
			};
			const r = await remote.summary(http, s.id, {
				from: body.from,
				to: body.to,
				...body.compare ? { compare: body.compare } : {}
			});
			if (!r.ok) {
				out[i] = {
					...base,
					...pick(null),
					revenue: [],
					error: r.reason === "http" ? `http_${r.status}` : r.reason
				};
				continue;
			}
			const d = r.data.data ?? {};
			const compared = body.compare && body.compare !== "none" && d.compareTotals;
			const delta = d.delta && typeof d.delta === "object" ? d.delta : {};
			out[i] = {
				...base,
				...pick(d.totals),
				revenue: revenueOf(d.revenue),
				...compared ? {
					previous: pick(d.compareTotals),
					delta: Object.fromEntries(ROW_METRICS.map((k) => [k, typeof delta[k] === "number" ? delta[k] : null]))
				} : {}
			};
		}
	};
	await Promise.all(Array.from({ length: Math.min(SUMMARY_CONCURRENCY, list.length) }, worker));
	return out;
}
// src/index.ts
/** Plugin descriptor (for `emdash({ plugins: [...] })`) and the native runtime `createPlugin`. */
const PACKAGE = "@infinitnet/cookieless-analytics";
/** Capabilities: the head script via `page:fragments`, content reads for annotations, scheduled dashboard email through the host provider, schema reads for the collection report, outbound calls to the Search providers. */
const CAPABILITIES = [
	"hooks.page-fragments:register",
	"content:read",
	"email:send",
	"network:request",
	"schema:read"
];
/** Exact hosts `ctx.http` may reach for Search; never a wildcard. Remote satellites add their hostnames. */
const ALLOWED_HOSTS = [
	"oauth2.googleapis.com",
	"www.googleapis.com",
	"ssl.bing.com",
	"www.bing.com"
];
/** Config collections. Composite indexes are runtime-only; the descriptor carries flat ones. */
const STORAGE = {
	goals: { indexes: ["site", ["site", "active"]] },
	funnels: { indexes: ["site"] },
	segments: { indexes: ["site"] },
	channel_rules: { indexes: ["site", ["site", "priority"]] },
	agent_rules: { indexes: ["site", ["site", "priority"]] },
	annotations: { indexes: [
		"site",
		"ts",
		["site", "ts"]
	] },
	api_keys: { indexes: ["prefix"] },
	sites: { indexes: ["key"] },
	dashboards: { indexes: ["site", "emailNext"] },
	shares: { indexes: ["prefix", "site"] }
};
/**
* Admin pages; each path is a key of `pages` in `src/admin/index.tsx`. Icon names resolve in the host nav icon map.
* `group` puts the eleven pages in one sidebar folder "Analytics".
*/
const ADMIN_PAGES = [
	{
		path: "/",
		label: "Overview",
		icon: "chart-line",
		group: "Analytics"
	},
	{
		path: "/dashboards",
		label: "Dashboards",
		icon: "dashboard",
		group: "Analytics"
	},
	{
		path: "/pages",
		label: "Pages",
		icon: "file",
		group: "Analytics"
	},
	{
		path: "/satisfaction",
		label: "Search Satisfaction",
		icon: "star",
		group: "Analytics"
	},
	{
		path: "/sources",
		label: "Sources",
		icon: "link",
		group: "Analytics"
	},
	{
		path: "/audience",
		label: "Audience",
		icon: "users",
		group: "Analytics"
	},
	{
		path: "/behaviour",
		label: "Behaviour",
		icon: "list",
		group: "Analytics"
	},
	{
		path: "/revenue",
		label: "Revenue",
		icon: "coins",
		group: "Analytics"
	},
	{
		path: "/links",
		label: "Links",
		icon: "tag",
		group: "Analytics"
	},
	{
		path: "/annotations",
		label: "Annotations",
		icon: "calendar",
		group: "Analytics"
	},
	{
		path: "/search",
		label: "Search",
		icon: "search",
		group: "Analytics"
	},
	{
		path: "/config",
		label: "Definitions",
		icon: "book",
		group: "Analytics"
	},
	{
		path: "/data",
		label: "Data",
		icon: "database",
		group: "Analytics"
	},
	{
		path: "/settings",
		label: "Settings",
		icon: "settings",
		group: "Analytics"
	}
];
/** Dashboard widgets; ids match the `widgets` map of the admin entry. */
const ADMIN_WIDGETS = [{
	id: "today",
	title: "Cookieless Analytics",
	size: "third"
}];
/**
* Product labels where the host shows no plugin name. `displayName` and `description` are typed on
* the descriptor and on `definePlugin` from EmDash 1.5.0; 1.4.0 ignores them (docs/design-notes.md).
*/
const PLUGIN_LABELS = {
	displayName: PRODUCT_NAME,
	description: "Cookieless Analytics by Infinitnet is a self-hosted, cookieless web analytics plugin for EmDash CMS with real sessions, no cookies and a page script of about 2.7 KB gzipped."
};
/**
* `options.sites`: remote satellites; `options.database`: the D1 or Hyperdrive binding of an own analytics database;
* `options.databases`: site routing, each listed site's analytics tables in its own binding. `engine: "postgres"`
* in either loads the runtime entry `/postgres`, the one that carries the node-postgres driver.
* Validated here so a bad `astro.config` fails the build.
*/
function cookielessAnalytics(options = {}) {
	const { sites, database, databases } = parseOptions(options);
	return {
		id: PLUGIN_ID,
		...PLUGIN_LABELS,
		version: VERSION,
		format: "native",
		entrypoint: engineOf({
			database,
			databases
		}) === "postgres" ? `${PACKAGE}/postgres` : PACKAGE,
		adminEntry: `${PACKAGE}/admin`,
		adminPages: [...ADMIN_PAGES],
		adminWidgets: [...ADMIN_WIDGETS],
		capabilities: [...CAPABILITIES],
		allowedHosts: allowedHostsFor(ALLOWED_HOSTS, sites),
		...sites.length || database || databases ? { options: {
			...sites.length ? { sites } : {},
			...database ? { database } : {},
			...databases ? { databases } : {}
		} } : {},
		storage: Object.fromEntries(Object.entries(STORAGE).map(([name, c]) => [name, { indexes: c.indexes.flatMap((i) => typeof i === "string" ? [i] : []) }])),
		settingsSchema
	};
}
const settings = cachedSettings(() => getPluginSettings(PLUGIN_ID));
let agentRules;
async function loadAgentRules(ctx) {
	if (agentRules && Date.now() - agentRules.at < 6e4) return agentRules.rules;
	let rules = [];
	try {
		let cursor;
		do {
			const res = await ctx.storage.agent_rules?.query({
				limit: 100,
				...cursor ? { cursor } : {}
			});
			rules.push(...(res?.items ?? []).map((i) => i.data));
			cursor = res?.hasMore ? res.cursor : void 0;
		} while (cursor && rules.length < 500);
	} catch {
		rules = agentRules?.rules ?? [];
	}
	agentRules = {
		rules,
		at: Date.now()
	};
	return rules;
}
const channelRules = /* @__PURE__ */ new Map();
/** User channel rules of one site merged with the built-ins minus the disabled ones; local site when none is given. */
async function loadChannelRules(ctx, site) {
	const siteId = site ?? (await settings()).siteId;
	const cached = channelRules.get(siteId);
	if (cached && Date.now() - cached.at < 6e4) return cached.rules;
	let rules = cached?.rules ?? buildChannelRules();
	try {
		const items = ((await ctx.storage.channel_rules?.query({
			where: { site: siteId },
			limit: 100
		}))?.items ?? []).map((i) => i.data);
		const user = items.flatMap((r, n) => r.channel && r.any && r.enabled !== false ? [{
			id: `user-${n + 1}`,
			channel: r.channel,
			any: r.any,
			priority: r.priority ?? 0
		}] : []);
		rules = buildChannelRules(user, items.flatMap((r) => r.disables ? [r.disables] : []));
	} catch {}
	channelRules.set(siteId, {
		rules,
		at: Date.now()
	});
	return rules;
}
/** Cron jobs and their schedules. The host Cron Trigger cadence bounds how often they run. */
const CRON_JOBS = {
	rollup: "*/30 * * * *",
	retention: "17 * * * *",
	salts: "5 0 * * *",
	search: "7 */1 * * *",
	revenue: "25,55 * * * *",
	mail: "15,35,45 * * * *"
};
/** The `cron` hook timeout; the host default is 5000 ms (`plugins/define-plugin.ts`). */
const CRON_TIMEOUT_MS = 55e3;
/**
* Tasks that spend a request budget. The host runs every due task of a tick in one invocation, one after another,
* and the platform's queries per invocation (Workers Free: 50) are shared by all of them; so one invocation runs at
* most one of these. With a per-minute trigger the schedules never make two of them due together; with a coarser one
* (`*\/15`), a task that finds the invocation taken is owed a turn (`cron:owed`), and the next invocation's task
* hands its turn to the task owed longest, in order. `salts` (KV only) always runs.
*/
const HEAVY_JOBS = /* @__PURE__ */ new Set([
	"rollup",
	"retention",
	"revenue",
	"search",
	"mail",
	MOVE_CRON,
	...CONTINUE_JOBS
]);
const KV_CRON_OWED = "cron:owed";
/** A heavy task that starts this soon after the last one ended runs in the same invocation (tasks of a tick follow each other at once; ticks are a minute apart). */
const SAME_INVOCATION_MS = 5e3;
/** Turn state requests per heavy run: the owed read and, when it changed, its write. Taken from the run's budget. */
const TURN_REQUESTS = 2;
/** `cron` hook body: one handler per job name; unknown names are logged and ignored. */
function cronDispatcher(handlers) {
	return async (event, ctx) => {
		if (!(Object.hasOwn(handlers, event.name) ? handlers[event.name] : void 0)) {
			ctx.log.warn(`cookieless-analytics: unknown cron job ${event.name}`);
			return;
		}
		if (pendingLimit) await ctx.kv.set(KV_PLATFORM_LIMIT, pendingLimit).then(() => pendingLimit = void 0, () => {});
		let name = event.name;
		if (HEAVY_JOBS.has(name)) {
			const now = Date.now();
			if (now - heavyEnd < 5e3) {
				if (owed && !owed[name]) {
					owed[name] = now;
					await ctx.kv.set(KV_CRON_OWED, owed).catch(() => {});
				}
				return;
			}
			owed = await ctx.kv.get("cron:owed").catch(() => null) ?? {};
			const first = Object.entries(owed).filter(([k]) => Object.hasOwn(handlers, k)).sort((a, b) => a[1] - b[1])[0];
			if (first && first[0] !== name) {
				owed[name] ??= now;
				name = first[0];
			}
			const changed = name in owed;
			delete owed[name];
			if (changed) await ctx.kv.set(KV_CRON_OWED, owed).catch(() => {});
		}
		try {
			await handlers[name](ctx, name === event.name ? event : {
				...event,
				name
			});
		} catch (err) {
			const kind = platformLimitKind(err);
			if (kind) {
				pendingLimit = {
					at: Date.now(),
					task: name,
					kind
				};
				await ctx.kv.set(KV_PLATFORM_LIMIT, pendingLimit).then(() => pendingLimit = void 0, () => {});
			}
			throw err;
		} finally {
			if (HEAVY_JOBS.has(name)) heavyEnd = Date.now();
		}
	};
}
let pendingLimit;
let heavyEnd = 0;
let owed;
/** Forget the turn state of this isolate (tests). */
function resetCronTurns() {
	heavyEnd = 0;
	owed = void 0;
}
/** Tools refused while a data move is active: they delete rows or close days. */
const MOVE_REFUSES = /* @__PURE__ */ new Set([
	"tools/delete-start",
	"tools/delete-all",
	"tools/purge-site",
	"tools/purge-search",
	"tools/purge",
	"tools/rollup-now",
	"tools/revenue-void",
	"sites/delete"
]);
/** Create missing or changed schedule rows. `plugin:activate` runs only on first install, so admin routes also call this once per isolate. */
async function ensureCron(ctx) {
	if (!ctx.cron) return;
	const have = new Map((await ctx.cron.list()).map((t) => [t.name, t.schedule]));
	for (const [name, schedule] of Object.entries(CRON_JOBS)) if (have.get(name) !== schedule) await ctx.cron.schedule(name, { schedule });
}
let cronChecked;
const ensureCronOnce = (ctx) => cronChecked ??= ensureCron(ctx).catch(() => {
	cronChecked = void 0;
});
function createPlugin(options = {}) {
	const { sites: remoteSites, database, databases } = parseOptions(options);
	const dbFor = setPluginFacts(factsDb(databases ?? database, async () => fromKysely(await getDb())));
	drops.route = dbFor.targets().length > 1 ? dbFor : void 0;
	const remote = createRemote(remoteSites);
	const remoteIds = remote.ids;
	const env = {
		async deps(ctx) {
			const s = await settings();
			return {
				db: await dbFor(s.siteId),
				kv: ctx.kv,
				settings: s,
				sink: routedSink(dbFor, s, ctx.kv),
				agentRules: await loadAgentRules(ctx),
				channelRules: await loadChannelRules(ctx),
				ready: () => ensureHostSchema(dbFor, ctx.kv)
			};
		},
		channelRules: (ctx, site) => loadChannelRules(ctx, site),
		after: (fn) => after(async () => {
			await pgOwnScope(fn);
		})
	};
	const db = (site) => dbFor(site);
	const now = () => Math.floor(Date.now() / 1e3);
	const goalsOf = async (ctx, site) => loadGoals(ctx.storage.goals, site ?? (await settings()).siteId);
	const dataQuery = dataQueryRoute({
		db,
		settings,
		remote
	});
	const dataExport = dataExportRoute({
		db,
		settings,
		remote
	});
	const privacy = privacyRoute({
		db,
		settings
	});
	const preview = previewRoute({
		db,
		settings
	});
	const tools = toolRoutes({
		db,
		settings,
		agentRules: (ctx) => loadAgentRules(ctx),
		channelRules: (ctx, site) => loadChannelRules(ctx, site),
		goals: (ctx, site) => goalsOf(ctx, site)
	});
	const config = configRoutes({
		settings,
		changed: (c) => {
			if (c === "agent_rules") {
				agentRules = void 0;
				resetStoredAgentRules();
			}
			if (c === "channel_rules") channelRules.clear();
		}
	});
	/** Host route: ensures the cron rows once per isolate, then calls the handler with the host context. */
	const wrap = (r) => ({
		...r,
		handler: async (ctx) => {
			await ensureCronOnce(ctx);
			return r.handler(ctx);
		}
	});
	const mailOf = async (ctx) => mailDeps({
		db,
		settings
	}, {
		input: null,
		storage: ctx.storage,
		kv: ctx.kv
	}, await settings(), ctx.site?.url ?? "");
	const dashboards = dashboardRoutes({
		settings,
		config,
		remoteIds,
		mail: (ctx) => mailOf(ctx)
	});
	const shares = shareRoutes({
		settings,
		remoteIds
	});
	const shareView = shareViewRoute({
		db,
		settings,
		after: env.after
	});
	const keys = keyRoutes({ settings });
	const searchEnv = {
		db,
		settings,
		settingsChanged: () => settings.clear()
	};
	const search = searchService(searchEnv);
	const agent = agentRoutes({
		db,
		settings,
		version: VERSION,
		limiter: createRateLimiter(),
		remoteIds,
		route: dbFor,
		search: {
			sync: (ctx, body) => search.sync(ctx, body),
			backfill: (ctx, body) => search.backfill(ctx, body)
		}
	});
	/** The data move's job while it is active: the tasks skip its destination, the delete tools refuse. */
	const moving = async (kv) => {
		const j = await kv.get(KV_MOVE_JOB);
		return isMoving(j) ? j : null;
	};
	/** Where a data move reads and writes: the source is the EmDash database (null) or a binding of this Worker. */
	const moveDbs = {
		source: async (b) => b === null ? fromKysely(await getDb()) : openBinding(b),
		dest: (site) => dbFor(site),
		destKv: (kv, site) => dbFor.kv(kv, site)
	};
	/** Cron sync tick; without outbound HTTP (no `network:request`) there is nothing to pull. */
	const searchTick = (continueAs) => async (ctx) => {
		if (!ctx.http) return;
		if (await moving(ctx.kv)) return;
		await ensureHostSchema(dbFor, ctx.kv);
		await runSearchTick({
			...await search.syncCtx(ctx),
			log: ctx.log
		}, { continueAs });
	};
	/** A cron task once per database, each with its share of the profile's requests (one invocation's queries are capped together). */
	const perDatabase = async (ctx, s, task) => {
		const move = await moving(ctx.kv);
		return eachTarget(dbFor, ctx.kv, async (d, kv, share, binding) => {
			if (move && move.dest === binding) return;
			await ensureSchemaOnce(d, ctx.kv);
			await task(d, kv, share(PROFILES[s.capacityProfile].requests - 2 - 1));
		}, ctx.log);
	};
	const cron = cronDispatcher({
		async rollup(ctx) {
			const s = await settings();
			await perDatabase(ctx, s, (d, kv, requests) => runRollup({
				db: d,
				settings: s,
				goals: (site) => goalsOf(ctx, site)
			}, kv, now(), { requests }));
		},
		async retention(ctx) {
			const s = await settings();
			let used = 0;
			await perDatabase(ctx, s, async (d, kv, requests) => {
				used += (await runRetention(d, kv, s, now(), { requests })).requests;
			});
			await runDeleteJob({
				kv: ctx.kv,
				db,
				settings: s,
				goals: (site) => goalsOf(ctx, site),
				now: now()
			}, PROFILES[s.capacityProfile].requests - 2 - used);
		},
		async revenue(ctx) {
			const s = await settings();
			await perDatabase(ctx, s, async (d, kv, requests) => {
				const t = now();
				await runRevenue({
					db: d,
					settings: s,
					goals: (site) => goalsOf(ctx, site)
				}, kv, t, await rawFromDay(kv, s, t), { requests });
			});
		},
		salts: async (ctx) => cleanSalts(ctx.kv, await settings(), now()),
		async mail(ctx) {
			if (!ctx.email || !ctx.storage.dashboards) return;
			await ensureHostSchema(dbFor, ctx.kv);
			const res = await runMailTick({
				...await mailOf(ctx),
				kv: ctx.kv,
				dashboards: ctx.storage.dashboards,
				email: ctx.email,
				now: now(),
				log: ctx.log
			});
			if (res.failed.length) ctx.log.warn(`cookieless-analytics: mail ${res.id} failed for ${res.failed.length} recipient(s)`);
		},
		async move(ctx) {
			const s = await settings();
			await runMoveJob({
				kv: ctx.kv,
				...moveDbs,
				source: async (b) => await moveDbs.source(b) ?? missingDb(b ?? ""),
				profile: s.capacityProfile,
				settings: s,
				now: now(),
				cron: ctx.cron
			}, PROFILES[s.capacityProfile].requests - 2);
		},
		search: searchTick(CONTINUE_JOBS[0]),
		"search-continue": searchTick(CONTINUE_JOBS[1]),
		"search-continue-next": searchTick(CONTINUE_JOBS[0])
	});
	return scoped(definePlugin({
		id: PLUGIN_ID,
		...PLUGIN_LABELS,
		version: VERSION,
		capabilities: [...CAPABILITIES],
		allowedHosts: allowedHostsFor(ALLOWED_HOSTS, remoteSites),
		storage: STORAGE,
		admin: {
			entry: `${PACKAGE}/admin`,
			settingsSchema,
			pages: [...ADMIN_PAGES],
			widgets: [...ADMIN_WIDGETS]
		},
		routes: {
			in: inRoute(env),
			session: sessionRoute(env),
			contract: contractRoute(env),
			[ROUTES.shareView]: {
				...shareView,
				handler: (ctx) => shareView.handler(ctx)
			},
			"data/query": wrap(dataQuery),
			"data/export": wrap(dataExport),
			"data/catalog": wrap(dataCatalogRoute()),
			"privacy/receipt": wrap(privacy),
			"annotations/preview": wrap(preview),
			"editor/traffic": wrap(editorRoutes({
				db,
				settings
			})["editor/traffic"]),
			...Object.fromEntries(Object.entries(siteRoutes({
				settings,
				db,
				remoteIds,
				remoteSites: () => remoteSites.map((r) => ({
					id: r.id,
					label: r.label,
					origin: r.origin,
					keyPresent: remote.keyPresent(r.id)
				})),
				remoteRows: (body, ctx, skip) => remoteSummaryRows(remote, ctx.http, body, skip)
			})).map(([name, r]) => [name, wrap(MOVE_REFUSES.has(name) ? refuseWhileMoving(r) : r)])),
			...Object.fromEntries(Object.entries(config).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(tools).map(([name, r]) => [name, wrap(MOVE_REFUSES.has(name) ? refuseWhileMoving(r) : r)])),
			...Object.fromEntries(Object.entries(moveRoutes({
				settings,
				...moveDbs,
				destBinding: (site) => dbFor.binding(site) ?? dbFor.targets()[0]?.binding ?? null,
				targets: () => dbFor.targets().map((t) => t.binding)
			})).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(searchRoutes(searchEnv)).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(keys).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(settingsRoutes({
				settings,
				settingsChanged: () => settings.clear()
			})).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(dashboards).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(shares).map(([name, r]) => [name, wrap(r)])),
			...Object.fromEntries(Object.entries(agent).map(([name, r]) => [name, {
				...r,
				handler: (ctx) => r.handler(ctx)
			}]))
		},
		mcp: { tools: MCP_TOOLS },
		hooks: {
			"plugin:activate": async (_event, ctx) => {
				try {
					await eachTarget(dbFor, ctx.kv, (d) => ensureSchema(d, ctx.kv), ctx.log);
				} finally {
					await ensureCron(ctx);
				}
			},
			cron: {
				handler: async (event, ctx) => {
					try {
						await cron(event, ctx);
					} finally {
						if (drops.size) await db().then((d) => drops.flush(d)).catch(() => {});
					}
				},
				timeout: CRON_TIMEOUT_MS
			},
			"page:fragments": async (_event, ctx) => pageFragments(await settings(), ctx.kv),
			"content:afterPublish": async (event, ctx) => annotate(ctx, "publish", event.content, event.collection, await settings()),
			"content:afterSave": async (event, ctx) => {
				if (!event.isNew && event.content.status === "published") await annotate(ctx, "update", event.content, event.collection, await settings());
			}
		}
	}));
}
/**
* Every route and hook handler of `plugin` in one Postgres request scope: one client per binding, closed when the
* handler ends; a nested scope (a route called by the middleware) reuses it. Without Postgres it costs one `run`.
*/
function scoped(plugin) {
	const each = (o) => Object.fromEntries(Object.entries(o).map(([name, r]) => {
		const h = r?.handler;
		return [name, typeof h === "function" ? {
			...r,
			handler: (...a) => pgScope(() => h(...a))
		} : r];
	}));
	return {
		...plugin,
		routes: each(plugin.routes),
		hooks: each(plugin.hooks)
	};
}
export { resetCronTurns as _, CRON_JOBS as a, KV_CRON_OWED as c, STORAGE as d, TURN_REQUESTS as f, ensureCron as g, cronDispatcher as h, CAPABILITIES as i, PLUGIN_LABELS as l, createPlugin as m, ADMIN_WIDGETS as n, CRON_TIMEOUT_MS as o, cookielessAnalytics as p, ALLOWED_HOSTS as r, HEAVY_JOBS as s, ADMIN_PAGES as t, SAME_INVOCATION_MS as u };
