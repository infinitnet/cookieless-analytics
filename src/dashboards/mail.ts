/**
 * Scheduled dashboard email: the next due time in the site timezone, the save rules, and the cron tick
 * `mail` that sends at most one dashboard per run, one message per recipient, at most once per period.
 */
import { PLUGIN_ID } from "../contract.js";
import type { KvLike } from "../core/crypto.js";
import { addDays, dayInZone, zonedToEpoch } from "../core/time.js";
import type { Db } from "../db/adapter.js";
import { answer, type DataCtx, type DataEnv } from "../routes/data.js";
import type { Settings } from "../settings.js";
import { type EmailTile, renderEmail } from "./email.js";
import { distinctRequests, runDashboard, type RunnerCtx } from "./run.js";
import {
	type Dashboard,
	DashboardError,
	type EmailRecordT,
	type EmailSettingsT,
	MAIL_MAX_DISTINCT_REQUESTS,
	MAIL_MAX_RETRIES,
	MAIL_STATEMENT_BUDGET,
	MAX_SCHEDULED_PER_SITE,
	readDashboard,
	SHARE_COMPARE_MAX_REQUESTS,
} from "./schema.js";
import type { DashColl } from "./store.js";
import { tileData } from "./tiles.js";

/** ISO weekday of a `YYYY-MM-DD` day, 1 is Monday. */
export const isoWeekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;

/** The first due time strictly after `now` (epoch seconds), in the site timezone. */
export function nextDue(e: Pick<EmailSettingsT, "frequency" | "weekday" | "monthday" | "hour">, tz: string, now: number): number {
	let day = dayInZone(now, tz);
	// Weekly matches within 8 days, monthly (day 1 to 28) within 32.
	for (let i = 0; i < 40; i++, day = addDays(day, 1)) {
		const match = e.frequency === "weekly" ? isoWeekday(day) === e.weekday : Number(day.slice(8)) === e.monthday;
		if (!match) continue;
		const t = zonedToEpoch(day, e.hour, tz);
		if (t > now) return t;
	}
	throw new Error("no due time");
}

/** Save rules: at most 12 distinct requests, at most 6 with compare, at most 5 enabled schedules per site. */
export function checkSchedule(d: Pick<Dashboard, "tiles" | "defaults">, email: Pick<EmailSettingsT, "enabled" | "compare">, otherEnabled: number): void {
	if (!email.enabled) return;
	const n = distinctRequests(d);
	if (n > MAIL_MAX_DISTINCT_REQUESTS) throw new DashboardError("too_many_requests", `This dashboard needs ${n} distinct requests; an email allows at most ${MAIL_MAX_DISTINCT_REQUESTS}. Remove or merge tiles.`);
	if (email.compare && n > SHARE_COMPARE_MAX_REQUESTS) throw new DashboardError("too_many_requests", `With comparison an email allows at most ${SHARE_COMPARE_MAX_REQUESTS} distinct requests; this dashboard needs ${n}.`);
	if (otherEnabled >= MAX_SCHEDULED_PER_SITE) throw new DashboardError("too_many_scheduled", `At most ${MAX_SCHEDULED_PER_SITE} scheduled emails per site.`);
}

/** The stored record after a schedule save: the send state is kept, `emailNext` follows `enabled`. */
export function applySchedule(d: Dashboard, settings: EmailSettingsT, tz: string, now: number): Dashboard {
	const { email: old, emailNext: _n, ...rest } = d;
	const keep = old ? { ...(old.lastSent !== undefined ? { lastSent: old.lastSent } : {}), ...(old.lastError ? { lastError: old.lastError } : {}) } : {};
	const email: EmailRecordT = { ...settings, ...keep };
	return readDashboard({ ...rest, email, ...(settings.enabled ? { emailNext: nextDue(settings, tz, now) } : {}) });
}

/** A database that counts statements and refuses any beyond `budget`; `take` charges other queries (host KV and storage) to it. */
export function countingDb(db: Db, budget: number): { db: Db; used(): number; take(n: number): void } {
	let used = 0;
	const take = (n: number) => {
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
			batch: (stmts) => (take(stmts.length), db.batch(stmts)),
		},
	};
}

export class BudgetError extends Error {
	readonly code = "mail_budget";
	constructor() {
		super("query budget reached");
	}
}

export interface MailEmail {
	send(message: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}

/** What composing a dashboard email needs (the tick and the test send). */
export interface ComposeCtx {
	now: number;
	/** The admin link of a dashboard. */
	adminUrl(d: Dashboard): string;
	/** The runner context of a site over the given (counting) database; `take` charges each KV and storage call of the run. */
	runner(site: string, db: Db, now: number, take?: (n: number) => void): Promise<RunnerCtx>;
	/** The database of a site's analytics tables; composing wraps the dashboard site's with the statement budget. */
	db(site?: string): Promise<Db>;
	goalName?(site: string, id: string): Promise<string | undefined>;
}

export interface MailTickCtx extends ComposeCtx {
	kv: KvLike;
	dashboards: DashColl & { query(o?: { where?: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc">; limit?: number }): ReturnType<DashColl["query"]> };
	/** Present only with a configured provider (`ctx.email`). */
	email?: MailEmail | undefined;
	/** Site timezone (every site uses the plugin's `siteTimezone`). */
	tz: string;
	log?: { warn(msg: string): void };
}

/**
 * Run the dashboard under `MAIL_STATEMENT_BUDGET` and render it. A request is not started when the statements used
 * plus 4 (8 with compare) would exceed the budget, and the counting database refuses any statement beyond it.
 */
export async function composeEmail(c: ComposeCtx, d: Dashboard, email: Pick<EmailSettingsT, "range" | "compare" | "subject">): Promise<{ subject: string; text: string; html: string; statements: number }> {
	const counting = countingDb(await c.db(d.site), MAIL_STATEMENT_BUDGET);
	const rc = await c.runner(d.site, counting.db, c.now, counting.take);
	const compare = email.compare ? (d.defaults.compare === "none" ? "previous" : d.defaults.compare) : "none";
	const per = compare === "none" ? 4 : 8;
	let reserved = 0;
	const budgeted: RunnerCtx = {
		...rc,
		async dispatch(body, a) {
			if (counting.used() + reserved + per > MAIL_STATEMENT_BUDGET) throw new BudgetError();
			reserved += per;
			try {
				return await rc.dispatch(body, a);
			} finally {
				reserved -= per;
			}
		},
	};
	const run = await runDashboard(budgeted, d, { range: email.range, compare });
	const tiles: EmailTile[] = [];
	for (const [i, t] of d.tiles.entries()) {
		const r = run.tiles[i];
		if (r?.error?.code === "mail_budget") tiles.push({ data: null, budget: true });
		else if (!r?.result) tiles.push({ data: null });
		else {
			// A goal name is one storage read: over the budget the tile shows the goal id.
			const goalName = t.params?.goal && c.goalName && counting.used() < MAIL_STATEMENT_BUDGET ? (counting.take(1), await c.goalName(d.site, t.params.goal)) : undefined;
			const data = tileData(t, r.result, { goalName });
			const hidden = (r.result.data as { hidden_terms?: unknown }).hidden_terms;
			tiles.push({ data: { ...data, notices: [...data.notices, ...r.notices] }, ...(typeof hidden === "number" && hidden > 0 ? { hiddenTerms: hidden } : {}) });
		}
	}
	const msg = renderEmail({ dashboard: d, tiles, range: email.range, compare: compare !== "none", subject: email.subject, adminUrl: c.adminUrl(d), generatedAt: c.now });
	return { ...msg, statements: counting.used() };
}

export interface MailTickResult {
	/** Dashboard id handled, if any. */
	id?: string;
	sent: number;
	failed: string[];
	skipped?: "no_provider" | "nothing_due" | "locked" | "disabled";
	statements?: number;
}

const LOCK_SECONDS = 300;
/** Due again on the next tick (they run 10 to 20 minutes apart). */
const RETRY_DELAY = 60;

/** One run of the `mail` cron task. */
export async function runMailTick(c: MailTickCtx): Promise<MailTickResult> {
	// Without a provider nothing is sent and the schedule stays as it is.
	if (!c.email) return { sent: 0, failed: [], skipped: "no_provider" };
	const hit = (await c.dashboards.query({ where: { emailNext: { lte: c.now } }, orderBy: { emailNext: "asc" }, limit: 1 })).items[0];
	if (!hit) return { sent: 0, failed: [], skipped: "nothing_due" };
	const lockKey = `mail:lock:${hit.id}`;
	// Two isolates: only the one that creates the lock sends. A stale lock (a crashed run) is cleared first.
	const lock = await c.kv.get<{ until?: number }>(lockKey);
	if (lock && (lock.until ?? 0) <= c.now) await c.kv.delete(lockKey);
	if (!(await c.kv.compareAndSet(lockKey, null, { until: c.now + LOCK_SECONDS })).applied) return { id: hit.id, sent: 0, failed: [], skipped: "locked" };
	try {
		let d: Dashboard;
		try {
			d = readDashboard(hit.data);
		} catch {
			// An unreadable record leaves the due list instead of blocking it.
			const { emailNext: _x, ...raw } = hit.data as Record<string, unknown>;
			await c.dashboards.put(hit.id, raw);
			return { id: hit.id, sent: 0, failed: [], skipped: "disabled" };
		}
		const email = d.email;
		if (!email?.enabled) {
			await c.dashboards.put(d.id, withoutNext(d));
			return { id: d.id, sent: 0, failed: [], skipped: "disabled" };
		}
		const retry = !!email.pending?.length;
		const to = retry ? (email.pending as string[]) : email.recipients;
		// Advance first: a crash after this point can lose one email but never send one twice.
		const next = nextDue(email, c.tz, c.now);
		await c.dashboards.put(d.id, { ...d, emailNext: next });
		const failed: string[] = [];
		let lastError = "";
		let statements = 0;
		try {
			const msg = await composeEmail(c, d, email);
			statements = msg.statements;
			// One message per recipient, `to` only, never `cc`.
			for (const addr of to) {
				try {
					await c.email.send({ to: addr, subject: msg.subject, text: msg.text, html: msg.html });
				} catch (err) {
					failed.push(addr);
					lastError = errText(err);
				}
			}
		} catch (err) {
			// The dashboard could not be built: every recipient counts as failed.
			failed.push(...to);
			lastError = errText(err);
		}
		const used = retry ? (email.retries ?? 0) : 0;
		const { pending: _p, retries: _r, lastError: _l, ...base } = email;
		let state: EmailRecordT;
		let emailNext = next;
		if (!failed.length) state = { ...base, lastSent: c.now };
		else if (used < MAIL_MAX_RETRIES) {
			state = { ...base, ...(failed.length < to.length ? { lastSent: c.now } : {}), lastError, pending: failed, retries: used + 1 };
			emailNext = c.now + RETRY_DELAY;
		} else {
			// Retried twice: skip until the next period.
			state = { ...base, lastError };
			c.log?.warn(`mail: ${failed.length} recipient(s) of dashboard ${d.id} failed after ${MAIL_MAX_RETRIES} retries`);
		}
		// Re-read: an edit saved meanwhile keeps its tiles and schedule settings; only the send state is written.
		const cur = await c.dashboards.get(d.id).then((r) => (r ? readDashboard(r) : null), () => null);
		if (cur?.email?.enabled) {
			const { pending: _cp, retries: _cr, lastError: _cl, lastSent: _cs, ...settings } = cur.email;
			const sendState = { ...(state.lastSent !== undefined ? { lastSent: state.lastSent } : {}), ...(state.lastError ? { lastError: state.lastError } : {}), ...(state.pending ? { pending: state.pending, retries: state.retries } : {}) };
			await c.dashboards.put(d.id, { ...cur, email: { ...settings, ...sendState }, emailNext: cur.emailNext !== next ? cur.emailNext : emailNext });
		}
		return { id: d.id, sent: to.length - failed.length, failed, statements };
	} finally {
		await c.kv.delete(lockKey);
	}
}

const errText = (err: unknown) => String((err as { message?: unknown } | null)?.message ?? err).slice(0, 300);

function withoutNext(d: Dashboard): Dashboard {
	const { emailNext: _n, ...rest } = d;
	return rest;
}

/** Admin link of a dashboard: the only URL of an email. */
export function adminUrl(origin: string, d: Pick<Dashboard, "id" | "site">, localSite: string): string {
	return `${origin.replace(/\/+$/, "")}/_emdash/admin/plugins/${PLUGIN_ID}/dashboards?d=${d.id}${d.site === localSite ? "" : `&site=${encodeURIComponent(d.site)}`}`;
}

/**
 * The compose context of the host: reports through `answer` over the given (counting) database, no annotations
 * (an email has no chart), goal names for goal KPI tiles. `origin` is `siteOrigin`, else the host site URL.
 */
export function mailDeps(env: DataEnv, base: DataCtx, s: Pick<Settings, "siteId" | "siteTimezone" | "siteOrigin">, origin: string): { tz: string } & Omit<ComposeCtx, "now"> {
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
				// shortcut: another site's database (a sites summary tile with site routing) is read outside the statement budget; count it too if such tiles hit the Free plan's 50 per request.
				dispatch: (b, a) => answer({ ...env, db: async (other?: string) => (other === undefined || other === site ? db : env.db(other)), now: () => now }, ctx, b, a),
				segmentExists: async (id) => ((await ctx.storage.segments?.get(id)) as { site?: unknown } | null)?.site === site,
			};
		},
		goalName: async (site, id) => {
			const g = (await base.storage.goals?.get(id)) as { site?: unknown; name?: unknown } | null;
			return g?.site === site && typeof g.name === "string" ? g.name : undefined;
		},
	};
}

/** `ctx` whose KV and plugin storage calls each take one statement: on the host both are database queries. */
function countedCtx(ctx: DataCtx, take: (n: number) => void): DataCtx {
	const wrap = <T extends object>(o: T): T =>
		new Proxy(o, {
			get(t, p) {
				const v = Reflect.get(t, p);
				return typeof v === "function" ? (...a: unknown[]) => (take(1), v.apply(t, a)) : v;
			},
		});
	const storage = new Proxy(ctx.storage, { get: (t, p) => ((c) => (c && typeof c === "object" ? wrap(c) : c))(Reflect.get(t, p)) });
	return { ...ctx, storage, ...(ctx.kv ? { kv: wrap(ctx.kv) } : {}) };
}
