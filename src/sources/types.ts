/** Search data sources: the provider contract shared by Google and Bing. */
import type { KvLike } from "../core/crypto.js";
import type { Settings } from "../settings.js";

export const SOURCE_IDS = ["google", "bing"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** One `ca_search_daily` row without `site`, `source`, `day` and `provisional` (the store adds them). */
export interface SearchRow {
	page_key: string;
	query: string;
	country: string;
	device: string;
	clicks: number;
	impressions: number;
	pos_sum: number;
}

/** Outbound HTTP through the host (`ctx.http`): the declared `allowedHosts` is the contract. */
export interface Http {
	fetch(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * One tick's request budget. The Worker's per-invocation request limit counts every outbound
 * fetch, database statement and KV call, so the tick meters all three (`count()`, done by the wrappers
 * of `runSearchTick`) against one limit (`syncSubrequestBudget`) plus a 40 s clock. `spend()` checks
 * room for one provider call and counts it as a call; `need(n)` checks room for `n` more requests
 * (a window's writes before they start). Both throw `BudgetExhausted` instead of passing the limit.
 */
export interface Budget {
	spend(): void;
	need(n: number): void;
	count(n?: number): void;
	/** Provider API calls made. */
	readonly calls: number;
	/** Requests metered (fetches, statements, KV calls). */
	readonly used: number;
	/** Requests still allowed before the end-of-tick reserve. */
	readonly left: number;
	readonly limit: number;
}
export class BudgetExhausted extends Error {}

/** Provider error with the HTTP status; 401 and 403 are never retried, 429 and 503 back off to the next tick. */
export class SourceError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/** A provider that refuses this caller for now (Bing `ThrottleIP`, `ThrottleUser`, `ThrottleHost`): not a failure of the connection. */
export class ThrottledError extends SourceError {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(429, message);
	}
}

export interface SourceCtx {
	http: Http;
	kv: KvLike;
	settings: Settings;
	budget: Budget;
	/** Waits before an in-tick retry; tests pass a no-op. Defaults to a timer. */
	sleep?(ms: number): Promise<void>;
	/** Milliseconds; defaults to the clock. */
	now?(): number;
}

/** What one site maps to at one provider, plus the page key normalizer of that site. */
export interface SiteTarget {
	site: string;
	/** `gscProperty` or `bingSiteUrl` of the site. */
	property: string;
	pageKey(url: string): string | null;
}

export interface SearchSource {
	id: SourceId;
	/** Credentials are present (the site mapping is checked separately). */
	configured(settings: Settings): boolean;
	/** One cheap authenticated call; resolves or throws `SourceError`. */
	test(ctx: SourceCtx, target: SiteTarget): Promise<unknown>;
	/** Every grain of one provider day, page keys normalized, rows of other hosts dropped. */
	fetchDay(ctx: SourceCtx, target: SiteTarget, day: string): Promise<SearchRow[]>;
	/**
	 * Providers with a date range (Google): every day from `from` to `to` in one pull per grain, keyed by
	 * day (each day of the range present, empty when the provider had nothing). `largest` is the row count
	 * of the biggest grain, which sizes the next window.
	 */
	fetchRange?(ctx: SourceCtx, target: SiteTarget, from: string, to: string): Promise<{ days: Map<string, SearchRow[]>; largest: number }>;
	/** Providers without a date range (Bing): every returned day in one pull; the sync stores each of them. */
	fetchWindow?(ctx: SourceCtx, target: SiteTarget): Promise<Map<string, SearchRow[]>>;
}

/** Mapping field of each provider in settings and in a client site record. */
export const MAPPING_FIELD = { google: "gscProperty", bing: "bingSiteUrl" } as const satisfies Record<SourceId, keyof Settings>;
