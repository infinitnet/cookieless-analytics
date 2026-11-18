/** The one KV record, the funnel state machine and its transitions. Only `readRecord`, `writeRecord` and `handleHello` touch KV. */
import type { PluginContext, SandboxedRouteContext } from "emdash/plugin";

import { LOG } from "./copy.js";
import { CONTRACT_VERSION, type CompanionHello, PLUGIN_ID, parseHello } from "./full.js";
import { type Answers, DEFAULT_ANSWERS, STEP_IDS, type StepId, parseAnswers } from "./steps.js";

export const STATE_KEY = "state:v1";
export const DAY_MS = 86_400_000;
/** A hello older than this no longer proves the full plugin runs. */
export const FRESH_MS = 30 * DAY_MS;

export interface HelloRecord {
	pluginVersion: string;
	contractVersion: number;
	/** Epoch milliseconds. */
	at: number;
}

export interface StateRecord {
	answers: Answers;
	done: StepId[];
	declaredAt?: number;
	hello?: HelloRecord;
	manualAt?: number;
}

export type FunnelState = "not_installed" | "waiting" | "connected" | "version_mismatch" | "stale";

export const defaultRecord = (): StateRecord => ({ answers: { ...DEFAULT_ANSWERS }, done: [] });

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** A stored value back to a record. Fields that fail their check fall back to the default, so a damaged record still renders. */
export function parseRecord(v: unknown): StateRecord {
	const r = defaultRecord();
	if (typeof v !== "object" || v === null) return r;
	const o = v as Record<string, unknown>;
	r.answers = parseAnswers(o.answers) ?? r.answers;
	if (Array.isArray(o.done)) r.done = STEP_IDS.filter((id) => (o.done as unknown[]).includes(id));
	if (isTime(o.declaredAt)) r.declaredAt = o.declaredAt;
	if (isTime(o.manualAt)) r.manualAt = o.manualAt;
	const h = o.hello as Record<string, unknown> | null | undefined;
	if (h && typeof h === "object" && isTime(h.at)) {
		const ok = parseHello({ v: 1, product: PLUGIN_ID, pluginVersion: h.pluginVersion, contractVersion: h.contractVersion });
		if (ok) r.hello = { pluginVersion: ok.pluginVersion, contractVersion: ok.contractVersion, at: h.at };
	}
	return r;
}

/**
 * A fresh hello decides first, so a contract mismatch shows even after a manual mark.
 * Otherwise a manual mark is connected, an old hello is stale, a declared deploy is waiting.
 */
export function funnelState(r: StateRecord, now: number): FunnelState {
	if (r.hello && now - r.hello.at <= FRESH_MS) {
		return r.hello.contractVersion === CONTRACT_VERSION ? "connected" : "version_mismatch";
	}
	if (r.manualAt !== undefined) return "connected";
	if (r.hello) return "stale";
	if (r.declaredAt !== undefined) return "waiting";
	return "not_installed";
}

// Transitions: each returns a new record and never mutates its input.

export const declareDeployed = (r: StateRecord, now: number): StateRecord => ({ ...r, declaredAt: now });

export const markInstalled = (r: StateRecord, now: number): StateRecord => ({ ...r, manualAt: now });

/** Clears the install evidence and keeps the answers and the ticked steps. */
export function startOver(r: StateRecord): StateRecord {
	const { declaredAt: _d, hello: _h, manualAt: _m, ...rest } = r;
	return rest;
}

/** "Back to the steps" from the waiting notice. */
export function backToSteps(r: StateRecord): StateRecord {
	const { declaredAt: _d, ...rest } = r;
	return rest;
}

export function setDone(r: StateRecord, id: StepId, done: boolean): StateRecord {
	const set = new Set(r.done);
	if (done) set.add(id);
	else set.delete(id);
	return { ...r, done: STEP_IDS.filter((s) => set.has(s)) };
}

export const setAnswers = (r: StateRecord, answers: Answers): StateRecord => ({ ...r, answers });

/** The record with this hello, or null when the stored one is the same and less than a day old (no write needed). */
export function applyHello(r: StateRecord, hello: CompanionHello, now: number): StateRecord | null {
	const old = r.hello;
	if (old && old.pluginVersion === hello.pluginVersion && old.contractVersion === hello.contractVersion && now - old.at < DAY_MS) {
		return null;
	}
	return { ...r, hello: { pluginVersion: hello.pluginVersion, contractVersion: hello.contractVersion, at: now } };
}

type Kv = Pick<PluginContext["kv"], "get" | "set">;

/** The stored record, the default when none exists. Throws when KV fails; the caller shows the read banner. */
export async function readRecord(kv: Kv): Promise<StateRecord> {
	return parseRecord(await kv.get<unknown>(STATE_KEY));
}

export async function writeRecord(kv: Kv, r: StateRecord): Promise<void> {
	await kv.set(STATE_KEY, r);
}

export type HelloResult = { ok: true } | { ok: false; error: "INVALID" | "UNAVAILABLE" };

/** Route `hello`: one KV read, at most one write. */
export async function handleHello(routeCtx: Pick<SandboxedRouteContext, "input">, ctx: PluginContext, now = Date.now()): Promise<HelloResult> {
	const hello = parseHello(routeCtx.input);
	if (!hello) return { ok: false, error: "INVALID" };
	try {
		const next = applyHello(await readRecord(ctx.kv), hello, now);
		if (next) await writeRecord(ctx.kv, next);
		return { ok: true };
	} catch {
		ctx.log.warn(LOG.helloStorage);
		return { ok: false, error: "UNAVAILABLE" };
	}
}
