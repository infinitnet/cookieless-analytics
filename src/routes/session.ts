import { classifyUa } from "../agents/classify.js";
import { CONTRACT_VERSION, type SessionReadResponse } from "../contract.js";
import { getOrCreateSalt, truncateIp, vkey } from "../core/crypto.js";
import { isSid } from "../core/ids.js";
import { readVisits } from "../core/apply.js";
import { bump, requestInfo } from "../core/recorder.js";
import { isActive, MAX_VISIT_MINUTES, type SessionRow } from "../core/session.js";
import { addDays, saltBoundary, saltDay } from "../core/time.js";
import { parseUa, uaNorm } from "../core/ua.js";
import { json, noContent, type RouteCtx, type RouteEnv } from "./env.js";

/** Lookups per truncated IP per minute before the route answers `{ sid: null }`. */
const READS_PER_MINUTE = 60;

const NONE: SessionReadResponse = { v: CONTRACT_VERSION, sid: null };

function shape(s: SessionRow): SessionReadResponse {
	return {
		v: CONTRACT_VERSION,
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
		device: s.device,
	};
}

/** Public session read API: first-touch facts of the caller's active session, never raw identifiers. */
export function sessionRoute(env: RouteEnv) {
	return {
		public: true,
		methods: ["GET" as const],
		response: "raw" as const,
		async handler(ctx: RouteCtx) {
			const deps = await env.deps(ctx);
			if (classifyUa(ctx.request.headers.get("user-agent"), deps.agentRules).audience === "robot") return noContent();
			const s = deps.settings;
			const info = requestInfo(ctx.request, ctx.requestMeta ? ctx.requestMeta.ip : undefined);
			const now = deps.now ?? Math.floor(Date.now() / 1000);
			if (bump("read", truncateIp(info.ip, "strict"), now) > READS_PER_MINUTE) return json(NONE);

			const q = (ctx.input ?? {}) as Record<string, unknown>;
			const active = (row: SessionRow | undefined) => (row && isActive(row, now, Math.min(s.maxSessionMinutes, MAX_VISIT_MINUTES)) ? row : null);
			let found: SessionRow | null = null;
			// One read: the visit of the sid (or of its alias), else the visitor's live visits.
			if (isSid(q.sid)) {
				const r = await readVisits(deps.db, s.siteId, now, s.siteTimezone, q.sid, []);
				found = active(r.rows.find((v) => v.sid === q.sid)) ?? (r.canon ? active(r.rows.find((v) => v.sid === r.canon)) : null);
			} else {
				const ua = uaNorm(parseUa(info.ua, { mobile: info.chMobile, platform: info.chPlatform }));
				const ip = truncateIp(info.ip, s.ipTruncation);
				const today = saltDay(now, s.saltTimezone, s.saltRotationHour);
				const days = [today];
				if (now < saltBoundary(now, s.saltTimezone, s.saltRotationHour) + s.sessionWindowMinutes * 60) days.push(addDays(today, -1));
				const keys = await Promise.all(days.map(async (d) => vkey(await getOrCreateSalt(deps.kv, d), s.siteId, ip, ua)));
				const r = await readVisits(deps.db, s.siteId, now, s.siteTimezone, null, keys);
				found = active(r.rows.sort((a, b) => b.last_seen - a.last_seen)[0]);
			}
			return json(found ? shape(found) : NONE);
		},
	};
}
