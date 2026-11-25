import {
	HIT_RE,
	type IngestBody,
	type Props,
	RESERVED_EVENTS,
	type ReservedEventName,
	SID_RE,
} from "../contract.js";
import { normalizeCurrency, REVENUE_MAX_OID, REVENUE_MAX_VALUE } from "./currency.js";

export const MAX_URL = 2048;
const EVENT_NAME_RE = /^[A-Za-z0-9_.:\- ]{1,64}$/;
const PROP_KEY_RE = /^[A-Za-z0-9_]{1,32}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

export const isSid = (v: unknown): v is string => typeof v === "string" && SID_RE.test(v);
export const isHitId = (v: unknown): v is string => typeof v === "string" && HIT_RE.test(v);

export function isReservedEvent(name: string): name is ReservedEventName {
	return Object.hasOwn(RESERVED_EVENTS, name);
}

/** Custom event names: 1..64 of `[A-Za-z0-9_.:\- ]`; a leading `_` is reserved for built-in events. */
export function isEventName(v: unknown, allowReserved = false): v is string {
	if (typeof v !== "string" || !EVENT_NAME_RE.test(v)) return false;
	return v.startsWith("_") ? allowReserved && isReservedEvent(v) : true;
}

/** Same-origin path plus query as sent by the page script. */
export function isPath(v: unknown): v is string {
	return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && v.length <= MAX_URL && !CONTROL_RE.test(v);
}

/** Empty string or an absolute http(s) URL. */
export function isReferrer(v: unknown): v is string {
	if (v === "") return true;
	if (typeof v !== "string" || v.length > MAX_URL || CONTROL_RE.test(v)) return false;
	return /^https?:\/\//i.test(v) && URL.canParse(v);
}

/**
 * Clean an event property map: at most 10 keys, keys `^[A-Za-z0-9_]{1,32}$`, values string <= 128,
 * finite number or boolean. Invalid entries are dropped. Reserved events keep only their fixed key.
 */
export function cleanProps(p: unknown, eventName?: string): Props | undefined {
	if (p === undefined || p === null) return undefined;
	if (typeof p !== "object" || Array.isArray(p)) return undefined;
	const only = eventName && isReservedEvent(eventName) ? RESERVED_EVENTS[eventName] : undefined;
	const out: Props = {};
	let n = 0;
	for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
		if (n >= 10) break;
		if (only ? k !== only : !PROP_KEY_RE.test(k)) continue;
		if ((typeof v === "string" && v.length <= 128 && !CONTROL_RE.test(v)) || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) {
			out[k] = v;
			n++;
		}
	}
	return n ? out : undefined;
}

export const OID_RE = new RegExp(`^[A-Za-z0-9_.:\\-]{1,${REVENUE_MAX_OID}}$`);

export type RevenueError = "invalid_value" | "invalid_currency" | "invalid_id";
export interface Revenue {
	val: number;
	cur?: string;
	oid?: string;
}

/**
 * Revenue fields of an event: null when there is no `val` (a lone `cur` or `oid` is ignored),
 * an error when any of the three is invalid (the caller then drops all three and keeps the event).
 * `cur` is normalized but never defaulted here; rounding needs the effective currency and happens on write.
 */
export function validateRevenue(b: { val?: unknown; cur?: unknown; oid?: unknown }): Revenue | { error: RevenueError } | null {
	if (b.val === undefined) return null;
	if (typeof b.val !== "number" || !Number.isFinite(b.val) || b.val < 0 || b.val > REVENUE_MAX_VALUE) return { error: "invalid_value" };
	const cur = b.cur === undefined ? undefined : normalizeCurrency(b.cur);
	if (cur === null) return { error: "invalid_currency" };
	if (b.oid !== undefined && (typeof b.oid !== "string" || !OID_RE.test(b.oid))) return { error: "invalid_id" };
	return { val: b.val, ...(cur ? { cur } : {}), ...(b.oid !== undefined ? { oid: b.oid as string } : {}) };
}

/** A validated body; `revenueInvalid` marks an event whose revenue fields were dropped (counter `revenue_invalid`). */
export type ValidIngest = IngestBody & { revenueInvalid?: true };

const isInt = (v: unknown, min: number, max: number): v is number =>
	typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Validate a parsed ingest body. Returns a clean typed body or null (dropped silently with 204). */
export function validateIngest(raw: unknown, maxEngagedMs = 7_200_000): ValidIngest | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const b = raw as Record<string, unknown>;
	if (b.v !== 1) return null;
	if (b.sid !== undefined && !isSid(b.sid)) return null;
	if (b.k !== undefined && !isSid(b.k)) return null;
	const base: { v: 1; sid?: string; k?: string; n?: 0 | 1 } = { v: 1 };
	if (b.sid) base.sid = b.sid as string;
	if (b.k) base.k = b.k as string;
	if (b.n === 0 || b.n === 1) base.n = b.n;
	switch (b.t) {
		case "pv":
			if (!isHitId(b.h) || !isPath(b.u)) return null;
			if (b.r !== undefined && !isReferrer(b.r)) return null;
			if (b.w !== undefined && !isInt(b.w, 0, 100_000)) return null;
			// nt, e and x: an out-of-range value drops the field, never the hit.
			return {
				...base,
				t: "pv",
				h: b.h,
				u: b.u,
				...(b.r ? { r: b.r as string } : {}),
				...(b.w !== undefined ? { w: b.w as number } : {}),
				...(isInt(b.nt, 0, 2) ? { nt: b.nt as 0 | 1 | 2 } : {}),
			};
		case "en":
			if (!isHitId(b.h) || typeof b.d !== "number" || !Number.isFinite(b.d) || b.d < 0) return null;
			if (b.s !== undefined && !isInt(b.s, 0, 100)) return null;
			return {
				...base,
				t: "en",
				h: b.h,
				d: Math.min(Math.round(b.d), maxEngagedMs),
				...(isInt(b.e, 1, maxEngagedMs) ? { e: b.e } : {}),
				...(b.s !== undefined ? { s: b.s as number } : {}),
				...(b.i === 1 || b.i === 0 ? { i: b.i } : {}),
				...(isInt(b.x, 0, 2) ? { x: b.x as 0 | 1 | 2 } : {}),
			};
		case "ev": {
			if (!isEventName(b.name, true)) return null;
			if (b.h !== undefined && !isHitId(b.h)) return null;
			if (b.u !== undefined && !isPath(b.u)) return null;
			// Reserved events never carry revenue; a bad revenue field drops the three fields, never the event.
			const rev = isReservedEvent(b.name) ? null : validateRevenue(b);
			const p = cleanProps(b.p, b.name);
			return {
				...base,
				t: "ev",
				name: b.name,
				...(b.h ? { h: b.h as string } : {}),
				...(b.u ? { u: b.u as string } : {}),
				...(p ? { p } : {}),
				...(rev && !("error" in rev) ? rev : {}),
				...(rev && "error" in rev ? { revenueInvalid: true as const } : {}),
			};
		}
		default:
			return null;
	}
}
