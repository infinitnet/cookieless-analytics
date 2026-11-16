import { AsyncLocalStorage } from "node:async_hooks";

export type Audience = "human" | "robot";

// One store per isolate, shared by the middleware bundle and the plugin bundle (separate module copies).
const KEY = Symbol.for("cookieless-analytics:audience");
const g = globalThis as Record<symbol, AsyncLocalStorage<Audience> | undefined>;
const store: AsyncLocalStorage<Audience> = (g[KEY] ??= new AsyncLocalStorage<Audience>());

/** Run `fn` with the request's UA audience visible to `page:fragments` (only for `scriptForBots = skip_known_bots`). */
export const withAudience = <T>(audience: Audience, fn: () => T): T => store.run(audience, fn);

/** Audience of the current request, when the middleware set one. */
export const currentAudience = (): Audience | undefined => store.getStore();

// Per-isolate liveness of the middleware, read by `page:fragments` before the slower KV marker.
const LIVE_KEY = Symbol.for("cookieless-analytics:middleware-live");
const live = globalThis as Record<symbol, number | undefined>;

export const markMiddlewareLive = (now: number): void => {
	live[LIVE_KEY] = now;
};

/** Milliseconds timestamp of the last request this isolate's middleware handled, if any. */
export const middlewareLiveAt = (): number | undefined => live[LIVE_KEY];
