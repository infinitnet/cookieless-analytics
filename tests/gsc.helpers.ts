/** Fake Google endpoints over the recorded fixtures in `tests/fixtures/gsc`; no network. */
import { readFileSync } from "node:fs";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { SITES_URL, TOKEN_URL } from "../src/sources/gsc-auth.js";

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/gsc/${name}.json`, import.meta.url), "utf8")) as unknown;
export const FIXTURE = {
	sites: fx("sites"),
	token: fx("token"),
	date: fx("query-date"),
	page: fx("query-page"),
	query: fx("query-query"),
	"page,query": fx("query-page-query"),
	country: fx("query-country"),
	device: fx("query-device"),
} as Record<string, unknown>;

export interface Call {
	url: string;
	property?: string;
	body: Record<string, unknown>;
	form?: Record<string, string>;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * `ctx.http` for Google: token endpoint, sites list and `searchAnalytics/query` answered from the
 * fixtures. `status(property)` forces an error status for one property; `tick()` runs before each answer.
 */
export function fakeGoogle(o: { status?: (property: string) => number | undefined; query?: (body: Record<string, unknown>, property: string) => unknown; tick?: () => void; failQuery?: (body: Record<string, unknown>) => number | undefined } = {}) {
	const calls: Call[] = [];
	const http = {
		async fetch(url: string, init?: RequestInit) {
			o.tick?.();
			if (url === TOKEN_URL) {
				const form = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
				calls.push({ url, body: {}, form });
				return json(200, { ...(FIXTURE.token as object), ...(form.grant_type === "authorization_code" ? { refresh_token: "1//fixture-refresh-token" } : {}) });
			}
			if (url === SITES_URL) {
				calls.push({ url, body: {} });
				return json(200, FIXTURE.sites);
			}
			const m = /\/sites\/([^/]+)\/searchAnalytics\/query$/.exec(url);
			if (!m) return json(404, { error: "not_found" });
			const property = decodeURIComponent(m[1] as string);
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			calls.push({ url, property, body });
			const status = o.status?.(property) ?? o.failQuery?.(body);
			if (status) return json(status, { error: { code: status, message: "denied for 1//never-echo", status: "PERMISSION_DENIED" } });
			const one = (b: Record<string, unknown>) => (o.query ? o.query(b, property) : (FIXTURE[(b.dimensions as string[]).join(",")] ?? { rows: [] })) as { rows?: Array<{ keys: unknown[] }> };
			const dims = body.dimensions as string[];
			if (body.startDate === body.endDate && !(dims[0] === "date" && dims.length > 1)) return json(200, one(body));
			// Several days or the date dimension: each day answered as a one-day request, the date as first key, days ascending, then paged.
			const rest = dims[0] === "date" && dims.length > 1 ? dims.slice(1) : dims;
			const rows = [];
			for (let d = String(body.startDate); d <= String(body.endDate); d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10))
				for (const r of one({ ...body, startDate: d, endDate: d, dimensions: rest, startRow: 0, rowLimit: 25_000 }).rows ?? []) rows.push({ ...r, keys: rest[0] === "date" ? [d] : [d, ...r.keys] });
			const start = Number(body.startRow ?? 0);
			return json(200, { rows: rows.slice(start, start + Number(body.rowLimit ?? 1000)) });
		},
	};
	return { http, calls, queries: () => calls.filter((c) => c.property !== undefined) };
}

/** A fresh RSA key as a service account JSON, plus the public key for verification. */
export async function testServiceAccount() {
	const pair = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
	const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
	const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----\n`;
	return { json: JSON.stringify({ type: "service_account", client_email: "reader@project.iam.gserviceaccount.com", private_key: pem }), publicKey: pair.publicKey };
}

/** Settings with Google connected over OAuth (fake credentials) and the local site mapped. */
export function googleSettings(over: Record<string, unknown> = {}): Settings {
	return normalizeSettings({ gscAuth: "oauth", gscClientId: "client-id.apps.example", gscClientSecret: "fixture-client-secret", gscRefreshToken: "1//fixture-refresh-token", gscProperty: "sc-domain:example.com", siteOrigin: "https://example.com", ...over });
}

const DAY_MS = 86_400_000;
const dayIdx = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const isoOf = (i: number) => new Date(i * DAY_MS).toISOString().slice(0, 10);
const COUNTRIES = ["DEU", "USA", "FRA", "GBR", "AUT", "CHE", "NLD", "ITA", "ESP", "POL", "SWE", "CAN"];
const DEVICES = ["DESKTOP", "MOBILE", "TABLET"];

/** Rows per grain of a synthetic day: the `size` profile scaled by a deterministic per-day wobble. */
export interface SyntheticSize {
	page: number;
	query: number;
	pageQuery: number;
	/** Days (ISO) whose page with query grain gets this many rows instead (to cross the per-day cap). */
	heavy?: Record<string, number>;
}
export const SMALL_SITE: SyntheticSize = { page: 30, query: 60, pageQuery: 80 };

/** Deterministic synthetic rows of one day and grain, in Google's order without the date dimension (clicks descending, ties by keys). */
export function syntheticDay(day: string, dims: readonly string[], size: SyntheticSize = SMALL_SITE): Array<{ keys: string[]; clicks: number; impressions: number; position: number }> {
	const d = dayIdx(day);
	const wobble = (n: number) => Math.max(1, n + ((d * 7) % 13) - 6);
	const key = dims.filter((x) => x !== "date").join(",");
	const n = key === "" ? 1 : key === "page" ? wobble(size.page) : key === "query" ? wobble(size.query) : key === "page,query" ? (size.heavy?.[day] ?? wobble(size.pageQuery)) : key === "country" ? COUNTRIES.length : DEVICES.length;
	const rows = [];
	for (let i = 0; i < n; i++) {
		const clicks = (d * 31 + i * 17) % 23;
		const impressions = clicks * 9 + ((d + i * 5) % 40) + 1;
		const keys =
			key === "page" ? [`https://example.com/p${i}/`] : key === "query" ? [`query ${i}`] : key === "page,query" ? [`https://example.com/p${i % 40}/`, `query ${i}`] : key === "country" ? [COUNTRIES[i] as string] : key === "device" ? [DEVICES[i] as string] : [day];
		rows.push({ keys, clicks, impressions, position: 1 + ((d + i) % 30) + 0.25 });
	}
	return rows.sort((a, b) => b.clicks - a.clicks || (a.keys.join("\n") < b.keys.join("\n") ? -1 : 1));
}

/** `fakeGoogle` over synthetic days (`syntheticDay`), `rowLimit` up to 25,000; `fail(body)` returns a status to answer instead. */
export function syntheticGoogle(size: SyntheticSize = SMALL_SITE, o: { fail?: (body: Record<string, unknown>) => number | undefined } = {}) {
	return fakeGoogle({
		query: (body) => {
			if (Number(body.rowLimit) > 25_000) throw new Error("rowLimit above 25000");
			const start = Number(body.startRow ?? 0);
			return { rows: syntheticDay(body.startDate as string, body.dimensions as string[], size).slice(start, start + Number(body.rowLimit ?? 1000)) };
		},
		...(o.fail ? { failQuery: o.fail } : {}),
	});
}

/**
 * The Worker's per-invocation request limit: every outbound fetch, database statement and KV operation
 * counts; above `limit` the runtime throws "Too many subrequests". `reset()` starts a new invocation.
 */
export function platformLimit(limit: number) {
	let used = 0;
	const totals = { fetches: 0, statements: 0, kv: 0 };
	const hit = (k: keyof typeof totals) => {
		if (++used > limit) throw new Error("Too many subrequests by single Worker invocation.");
		totals[k]++;
	};
	return {
		totals,
		reset: () => void (used = 0),
		get used() {
			return used;
		},
		http: <H extends { fetch(url: string, init?: RequestInit): Promise<Response> }>(h: H) => ({ fetch: async (url: string, init?: RequestInit) => (hit("fetches"), h.fetch(url, init)) }),
		db: <D extends import("../src/db/adapter.js").Db>(d: D): import("../src/db/adapter.js").Db => ({
			dialect: d.dialect,
			run: async (sql, p) => (hit("statements"), d.run(sql, p)),
			all: async (sql, p) => (hit("statements"), d.all(sql, p)),
			batch: async (stmts) => {
				for (const s of stmts) {
					hit("statements");
					await d.run(s.sql, s.params);
				}
			},
		}),
		kv: <K extends import("../src/core/crypto.js").KvLike>(k: K): import("../src/core/crypto.js").KvLike => ({
			get: async (key) => (hit("kv"), k.get(key)),
			set: async (key, v) => (hit("kv"), k.set(key, v)),
			delete: async (key) => (hit("kv"), k.delete(key)),
			list: async (p) => (hit("kv"), k.list(p)),
			compareAndSet: async (key, e, v) => (hit("kv"), k.compareAndSet(key, e, v)),
		}),
	};
}
