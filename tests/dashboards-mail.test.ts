/** Scheduled dashboard email: next due time, save rules, the mail tick, the statement budget. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { BUDGET_LINE } from "../src/dashboards/email.js";
import { checkSchedule, isoWeekday, mailDeps, type MailTickCtx, nextDue, runMailTick } from "../src/dashboards/mail.js";
import { type Dashboard, DashboardSchema, EmailSettings, MAIL_STATEMENT_BUDGET, type Tile } from "../src/dashboards/schema.js";
import { clearReportCache } from "../src/query/reports/index.js";
import type { Settings } from "../src/settings.js";
import { memColl, T0 } from "./agent.helpers.js";
import { kpi } from "./fixtures/dashboards.js";
import { seed } from "./fixtures/seed.js";
import { MemoryKv, schemaDb } from "./helpers.js";

const at = (day: string, hour: number, tz = "UTC", min = 0) => zonedToEpoch(day, hour, tz) + min * 60;

describe("nextDue", () => {
	const weekly = { frequency: "weekly" as const, weekday: 1, monthday: 1, hour: 8 };
	it("weekly Monday 08:00 in the site timezone", () => {
		expect(isoWeekday("2026-03-16")).toBe(1);
		expect(isoWeekday("2026-03-15")).toBe(7);
		// Friday 2026-03-13 noon UTC: the next Monday 08:00.
		expect(nextDue(weekly, "UTC", at("2026-03-13", 12))).toBe(at("2026-03-16", 8));
		expect(nextDue(weekly, "America/New_York", at("2026-03-13", 12))).toBe(at("2026-03-16", 8, "America/New_York"));
		expect(nextDue(weekly, "America/New_York", at("2026-03-13", 12))).toBe(Date.UTC(2026, 2, 16, 12) / 1000);
		expect(nextDue(weekly, "Asia/Tokyo", at("2026-03-13", 12))).toBe(Date.UTC(2026, 2, 15, 23) / 1000);
	});

	it("is strictly after now: at the due time the next one is a week later", () => {
		const due = at("2026-03-16", 8);
		expect(nextDue(weekly, "UTC", due)).toBe(at("2026-03-23", 8));
		expect(nextDue(weekly, "UTC", due - 1)).toBe(due);
	});

	it("monthly on day 28 every month, February included", () => {
		const m = { frequency: "monthly" as const, weekday: 1, monthday: 28, hour: 23 };
		expect(nextDue(m, "UTC", at("2026-01-28", 23))).toBe(at("2026-02-28", 23));
		expect(nextDue(m, "Europe/Berlin", at("2026-12-29", 0))).toBe(at("2027-01-28", 23, "Europe/Berlin"));
	});

	it("validation caps the month day at 28 and the hour at 23", () => {
		const base = { enabled: true, frequency: "monthly", recipients: ["reports@example.com"], range: "7d", compare: false };
		expect(EmailSettings.safeParse({ ...base, monthday: 29 }).success).toBe(false);
		expect(EmailSettings.safeParse({ ...base, hour: 24 }).success).toBe(false);
		expect(EmailSettings.parse(base)).toMatchObject({ weekday: 1, monthday: 1, hour: 8 });
	});
});

describe("recipient and subject validation", () => {
	const base = { enabled: true, frequency: "weekly", range: "7d", compare: false };
	const ok = (recipients: unknown[], subject?: string) => EmailSettings.safeParse({ ...base, recipients, ...(subject !== undefined ? { subject } : {}) }).success;
	it("accepts plain addresses, at most five", () => {
		expect(ok(["reports@example.com", "a.b+c@sub.example.org"])).toBe(true);
		expect(ok(Array.from({ length: 5 }, (_, i) => `r${i}@example.com`))).toBe(true);
		expect(ok(Array.from({ length: 6 }, (_, i) => `r${i}@example.com`))).toBe(false);
		expect(ok([])).toBe(false);
	});
	it("rejects a line break, a comma, a display name, 255 characters and a control character in the subject", () => {
		expect(ok(["reports@example.com\nBcc: x@example.com"])).toBe(false);
		expect(ok(["a@example.com,b@example.com"])).toBe(false);
		expect(ok(["Reports <reports@example.com>"])).toBe(false);
		expect(ok([`${"a".repeat(243)}@example.com`])).toBe(false);
		expect(`${"a".repeat(243)}@example.com`).toHaveLength(255);
		expect(ok([`${"a".repeat(242)}@example.com`])).toBe(true);
		expect(ok(["reports@example.com"], "Weekly\u0007")).toBe(false);
		expect(ok(["reports@example.com"], "Weekly\r\nBcc: x")).toBe(false);
		expect(ok(["reports@example.com"], "Weekly numbers")).toBe(true);
	});
});

const page = (i: number): Tile => ({ id: `p0000${i.toString(36)}`.slice(0, 6), report: "pages", kind: "table", w: 1, limit: 5 + i });
function dash(id: string, tiles: Tile[], over: Partial<Dashboard> = {}): Dashboard {
	return DashboardSchema.parse({ id, site: "default", v: 1, name: `Dash ${id}`, tiles, defaults: { range: "7d", compare: "none", filters: [] }, viewer: { ranges: ["7d"], compare: false }, created: 1, updated: 1, ...over });
}

describe("checkSchedule", () => {
	const email = { enabled: true, compare: false };
	it("refuses 13 distinct requests and 7 with compare; allows 12 and 6", () => {
		const twelve = dash("aaaaaaaaaaaa", Array.from({ length: 12 }, (_, i) => page(i)));
		expect(() => checkSchedule(twelve, email, 0)).not.toThrow();
		const thirteen = { ...twelve, tiles: [...twelve.tiles, { id: "zzzzzz", report: "channels", kind: "table", w: 1 } as Tile] };
		expect(() => checkSchedule(thirteen, email, 0)).toThrow(expect.objectContaining({ code: "too_many_requests" }));
		const seven = { ...twelve, tiles: twelve.tiles.slice(0, 7) };
		expect(() => checkSchedule(seven, { enabled: true, compare: true }, 0)).toThrow(expect.objectContaining({ code: "too_many_requests" }));
		expect(() => checkSchedule({ ...seven, tiles: seven.tiles.slice(0, 6) }, { enabled: true, compare: true }, 0)).not.toThrow();
		// A disabled schedule is never refused.
		expect(() => checkSchedule(thirteen, { enabled: false, compare: false }, 9)).not.toThrow();
	});
	it("allows five enabled schedules per site", () => {
		const d = dash("aaaaaaaaaaaa", [kpi("visitors")]);
		expect(() => checkSchedule(d, email, 4)).not.toThrow();
		expect(() => checkSchedule(d, email, 5)).toThrow(expect.objectContaining({ code: "too_many_scheduled" }));
	});
});

describe("mail tick", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	beforeAll(async () => {
		env = await schemaDb();
		settings = await seed(env, "UTC");
	});

	const R5 = ["r1@example.com", "r2@example.com", "r3@example.com", "r4@example.com", "r5@example.com"];
	const schedule = (over: Record<string, unknown> = {}) => ({ enabled: true, frequency: "weekly", weekday: 1, monthday: 1, hour: 8, recipients: R5, range: "7d", compare: false, ...over });
	let dashboards: ReturnType<typeof memColl>;
	let kv: MemoryKv;
	let sent: Array<Record<string, unknown>>;
	let fail: (to: string) => boolean;
	let statements: number;
	let now: number;

	const counted = (db: Db): Db => ({
		dialect: db.dialect,
		run: (s, p) => (statements++, db.run(s, p)),
		all: (s, p) => (statements++, db.all(s, p)),
		batch: (st) => ((statements += st.length), db.batch(st)),
	});
	const ctx = (over: Partial<MailTickCtx> = {}): MailTickCtx => ({
		...mailDeps({ db: async () => counted(env.db), settings: async () => settings }, { input: null, storage: { segments: memColl(), goals: memColl() }, kv }, settings, "https://example.org"),
		kv,
		dashboards,
		now,
		email: {
			send: vi.fn(async (m: Record<string, unknown>) => {
				if (fail(m.to as string)) throw new Error(`refused ${m.to as string}`);
				sent.push(m);
			}),
		},
		...over,
	});
	const record = (id: string) => dashboards.items.get(id) as Dashboard;

	beforeEach(() => {
		clearReportCache();
		kv = new MemoryKv();
		sent = [];
		fail = () => false;
		statements = 0;
		now = T0 + 9 * 3600;
		dashboards = memColl({
			aaaaaaaaaaaa: { ...dash("aaaaaaaaaaaa", [kpi("visitors"), kpi("sessions"), { id: "tab001", report: "channels", kind: "table", w: 3 }]), email: schedule(), emailNext: T0 },
			bbbbbbbbbbbb: { ...dash("bbbbbbbbbbbb", [kpi("visitors")]), email: schedule({ recipients: ["other@example.com"] }), emailNext: T0 + 60 },
			cccccccccccc: { ...dash("cccccccccccc", [kpi("visitors")]), email: schedule({ enabled: false }) },
		});
	});

	it("sends one dashboard per run, one message per recipient with one to and no cc", async () => {
		const r = await runMailTick(ctx());
		expect(r).toMatchObject({ id: "aaaaaaaaaaaa", sent: 5, failed: [] });
		expect(sent.map((m) => m.to)).toEqual(R5);
		for (const m of sent) {
			expect(Object.keys(m).sort()).toEqual(["html", "subject", "text", "to"]);
			expect(m.cc).toBeUndefined();
			expect(m.subject).toBe("Dash aaaaaaaaaaaa: Last 7 days");
		}
		// The stored record: emailNext at the top level, the next Monday 08:00, none inside email.
		const rec = record("aaaaaaaaaaaa");
		expect(rec.emailNext).toBe(at("2026-03-16", 8));
		expect(rec.email).not.toHaveProperty("emailNext");
		expect(rec.email).toMatchObject({ lastSent: now });
		expect(rec.email?.pending).toBeUndefined();
	});

	it("never sends twice for one period: the second tick takes the next due dashboard, the third nothing", async () => {
		await runMailTick(ctx());
		const second = await runMailTick(ctx());
		expect(second).toMatchObject({ id: "bbbbbbbbbbbb", sent: 1 });
		expect(await runMailTick(ctx())).toMatchObject({ skipped: "nothing_due", sent: 0 });
		expect(sent).toHaveLength(6);
	});

	it("never sends a disabled schedule, even with a stale emailNext", async () => {
		dashboards.items.set("cccccccccccc", { ...record("cccccccccccc"), emailNext: T0 - 100 });
		const r = await runMailTick(ctx());
		expect(r).toMatchObject({ id: "cccccccccccc", skipped: "disabled", sent: 0 });
		expect(record("cccccccccccc").emailNext).toBeUndefined();
		expect(sent).toHaveLength(0);
	});

	it("sends nothing and keeps the schedule without a provider", async () => {
		const before = structuredClone([...dashboards.items]);
		expect(await runMailTick(ctx({ email: undefined }))).toMatchObject({ skipped: "no_provider", sent: 0 });
		expect([...dashboards.items]).toEqual(before);
	});

	it("a failed send is retried on the next two ticks only", async () => {
		dashboards.items.delete("bbbbbbbbbbbb");
		fail = () => true;
		const tries: number[] = [];
		for (let i = 0; i < 4; i++) {
			const r = await runMailTick(ctx());
			tries.push(r.failed.length);
			now += 20 * 60;
		}
		expect(tries).toEqual([5, 5, 5, 0]);
		const rec = record("aaaaaaaaaaaa");
		expect(rec.email?.lastError).toContain("refused");
		expect(rec.email?.pending).toBeUndefined();
		expect(rec.emailNext).toBe(at("2026-03-16", 8));
	});

	it("when the third send fails only that address is pending and only it is retried", async () => {
		dashboards.items.delete("bbbbbbbbbbbb");
		fail = (to) => to === "r3@example.com";
		const first = await runMailTick(ctx());
		expect(first).toMatchObject({ sent: 4, failed: ["r3@example.com"] });
		expect(record("aaaaaaaaaaaa").email?.pending).toEqual(["r3@example.com"]);
		fail = () => false;
		sent = [];
		now += 20 * 60;
		expect(await runMailTick(ctx())).toMatchObject({ sent: 1, failed: [] });
		expect(sent.map((m) => m.to)).toEqual(["r3@example.com"]);
		expect(record("aaaaaaaaaaaa").email?.pending).toBeUndefined();
		expect(record("aaaaaaaaaaaa").emailNext).toBe(at("2026-03-16", 8));
	});

	it("a lock held by another isolate skips the run", async () => {
		await kv.set("mail:lock:aaaaaaaaaaaa", { until: now + 100 });
		expect(await runMailTick(ctx())).toMatchObject({ skipped: "locked", sent: 0 });
		// A stale lock is cleared.
		await kv.set("mail:lock:aaaaaaaaaaaa", { until: now - 1 });
		expect(await runMailTick(ctx())).toMatchObject({ sent: 5 });
		expect(await kv.get("mail:lock:aaaaaaaaaaaa")).toBeNull();
	});

	it("a dashboard over the statement budget sends with the notice and issues at most 36 statements", async () => {
		// Overview KPIs with distinct filters: each one a separate request of about a dozen statements.
		const countries = ["DE", "US", "FR", "GB", "NL", "SE", "IT", "ES", "PL", "AT", "CH", "BE"];
		const tiles = countries.map((c, i) => kpi("visitors", { id: `ovr0${i.toString(36).padStart(2, "0")}`, filters: [{ dim: "country", op: "is", values: [c] }] }));
		dashboards = memColl({ dddddddddddd: { ...dash("dddddddddddd", tiles), email: schedule({ compare: true }), emailNext: T0 } });
		const r = await runMailTick(ctx());
		expect(r.sent).toBe(5);
		expect(statements).toBeLessThanOrEqual(MAIL_STATEMENT_BUDGET);
		expect(r.statements).toBeLessThanOrEqual(MAIL_STATEMENT_BUDGET);
		const html = sent[0]?.html as string;
		expect(html).toContain(BUDGET_LINE);
		expect(sent[0]?.text).toContain(BUDGET_LINE);
		// Some tiles ran, the rest carry the notice.
		expect(statements).toBeGreaterThan(MAIL_STATEMENT_BUDGET / 2);
		expect(html.split(BUDGET_LINE).length - 1).toBeLessThan(12);
	});
});
