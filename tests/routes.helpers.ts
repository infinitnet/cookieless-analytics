import type { RecorderDeps } from "../src/core/recorder.js";
import type { RouteCtx, RouteEnv } from "../src/routes/env.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import type { schemaDb } from "./helpers.js";

/** Fake host wiring: deps over a test database, `after` tasks collected so tests can run them. */
export function fakeEnv(env: Awaited<ReturnType<typeof schemaDb>>, over: Partial<Settings> = {}, now?: number) {
	const tasks: Array<() => Promise<unknown>> = [];
	const routeEnv: RouteEnv = {
		async deps(): Promise<RecorderDeps> {
			return { db: env.db, kv: env.kv, settings: normalizeSettings(over as Record<string, unknown>), ...(now ? { now } : {}) };
		},
		after: (fn) => void tasks.push(fn),
	};
	return {
		env: routeEnv,
		tasks,
		async runAfter() {
			for (const t of tasks.splice(0)) await t();
		},
	};
}

export const ctx = (request: Request, input: unknown, kv: RouteCtx["kv"]): RouteCtx => ({ request, input, requestMeta: { ip: null }, kv });
