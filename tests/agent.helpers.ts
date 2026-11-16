import { type AgentCtx, type AgentEnv, agentRoutes } from "../src/agent/routes.js";
import { createRateLimiter } from "../src/keys/ratelimit.js";
import type { Scope } from "../src/keys/scopes.js";
import { createKey } from "../src/keys/store.js";
import type { Settings } from "../src/settings.js";
import type { schemaDb } from "./helpers.js";

type Where = Record<string, unknown>;
const matches = (data: Record<string, unknown>, where: Where = {}) =>
	Object.entries(where).every(([k, v]) => {
		if (v && typeof v === "object") {
			const r = v as { gte?: number; lt?: number; lte?: number; gt?: number };
			const x = data[k] as number;
			if (typeof x !== "number") return false;
			return (r.gte === undefined || x >= r.gte) && (r.lt === undefined || x < r.lt) && (r.lte === undefined || x <= r.lte) && (r.gt === undefined || x > r.gt);
		}
		return data[k] === v;
	});

/** In-memory storage collection: equality and range where clauses, `orderBy`, put counter. */
export function memColl(seed: Record<string, unknown> = {}) {
	const items = new Map<string, unknown>(Object.entries(seed));
	const c = {
		items,
		puts: 0,
		async query(o?: { where?: Where; limit?: number; orderBy?: Record<string, "asc" | "desc"> }) {
			const all = [...items].filter(([, d]) => matches(d as Record<string, unknown>, o?.where)).map(([id, data]) => ({ id, data }));
			for (const [k, dir] of Object.entries(o?.orderBy ?? {})) all.sort((a, b) => (((a.data as Record<string, number>)[k] ?? 0) - ((b.data as Record<string, number>)[k] ?? 0)) * (dir === "asc" ? 1 : -1));
			return { items: all.slice(0, o?.limit ?? 50), hasMore: all.length > (o?.limit ?? 50) };
		},
		async get(id: string) {
			return items.get(id) ?? null;
		},
		async put(id: string, data: unknown) {
			c.puts++;
			items.set(id, structuredClone(data));
		},
		/** Field merge like the host `updateIf` with `set` and an empty guard. */
		async updateIf(id: string, args: { where: Record<string, unknown>; set?: Record<string, unknown>; delta?: Record<string, { inc: number }> }) {
			const cur = items.get(id);
			if (!cur || !matches(cur as Record<string, unknown>, args.where)) return { applied: false as const };
			c.puts++;
			const data: Record<string, unknown> = { ...(cur as object), ...structuredClone(args.set ?? {}) };
			for (const [k, d] of Object.entries(args.delta ?? {})) data[k] = ((data[k] as number | null) ?? 0) + d.inc;
			items.set(id, data);
			return { applied: true as const, data };
		},
		async delete(id: string) {
			return items.delete(id);
		},
	};
	return c;
}

export const T0 = 1_773_360_000; // 2026-03-13T00:00:00Z, the day after the seeded range

/** Agent routes over a seeded database with an in-memory key store. */
export async function agentHarness(env: Awaited<ReturnType<typeof schemaDb>>, settings: Settings, over: Partial<AgentEnv> = {}) {
	let now = T0;
	const storage = { api_keys: memColl(), annotations: memColl(), goals: memColl(), funnels: memColl(), segments: memColl(), sites: memColl(), dashboards: memColl() };
	const routes = agentRoutes({ db: async () => env.db, settings: async () => settings, now: () => now, version: "9.9.9", limiter: createRateLimiter(), ...over });
	return {
		routes,
		storage,
		setNow: (n: number) => void (now = n),
		key: async (scopes: Scope[], expires?: number, sites?: string[]) => (await createKey(storage.api_keys, { label: "test", scopes, sites, expires: expires ?? null }, now)).token,
		/** Call a route as the host would: method, headers and the parsed input. */
		async call(name: string, opts: { method?: "GET" | "POST"; token?: string | null; input?: unknown; headers?: Record<string, string> } = {}) {
			const route = routes[name];
			if (!route) throw new Error(`no route ${name}`);
			const headers = new Headers(opts.headers);
			if (opts.token) headers.set("x-api-key", opts.token);
			const request = new Request(`https://example.org/_emdash/api/plugins/cookieless-analytics/${name}`, { method: opts.method ?? route.methods[0], headers });
			const res = (await route.handler({ request, input: opts.input, kv: env.kv, storage } as unknown as AgentCtx)) as { status: number; headers: Array<[string, string]>; body?: { kind: string; value: string } };
			const text = res.body?.value ?? "";
			return { status: res.status, headers: Object.fromEntries(res.headers), text, json: text ? JSON.parse(text) : null };
		},
	};
}
