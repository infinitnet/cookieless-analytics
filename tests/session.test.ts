import { beforeEach, describe, expect, it } from "vitest";
import { SID_RE } from "../src/contract.js";
import { MemorySessionStore, type ResolveConfig, type ResolveEvent, type ResolveMeta, resolveSession, screenBucket } from "../src/core/session.js";
import { parseUa } from "../src/core/ua.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";

const t = (iso: string) => Date.parse(iso) / 1000;
const MIN = 60;
const SID_A = "aaaaaaaaaaaaaaaaaaaa";
const SID_B = "bbbbbbbbbbbbbbbbbbbb";
const SID_C = "cccccccccccccccccccc";
const T0 = t("2026-06-10T12:00:00Z");

const baseCfg: ResolveConfig = {
	sessionWindowMinutes: 30,
	maxSessionMinutes: 1440,
	saltTimezone: "UTC",
	saltRotationHour: 0,
	siteTimezone: "UTC",
	ignoreReferrerHosts: [],
	queryAllowlist: DEFAULT_SETTINGS.queryAllowlist,
};

let store: MemorySessionStore;
let visitor: string;
let vkeyCalls: string[];

function meta(over: Partial<ResolveMeta> = {}): ResolveMeta {
	return {
		site: "default",
		siteHost: "example.org",
		ua: parseUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"),
		lang: "en",
		country: "DE",
		region: null,
		// Deterministic stand-in for HMAC(salt_day, ...): one key per visitor per salt day.
		vkeyFor: async (day) => {
			vkeyCalls.push(day);
			return `vk-${visitor}-${day}`;
		},
		...over,
	};
}

const pv = (sid: string | null, u = "/", r?: string): ResolveEvent => ({ t: "pv", sid, u, ...(r ? { r } : {}), w: 1440 });
const resolve = (evt: ResolveEvent, now: number, cfg: Partial<ResolveConfig> = {}, m: Partial<ResolveMeta> = {}) =>
	resolveSession(evt, meta(m), now, { ...baseCfg, ...cfg }, store);

beforeEach(() => {
	store = new MemorySessionStore();
	visitor = "v1";
	vkeyCalls = [];
});

describe("resolveSession: create and first touch", () => {
	it("creates a session with first-touch fields when nothing matches", async () => {
		const r = await resolve(pv(null, "/landing/?utm_source=google&utm_medium=cpc&x=1", "https://www.google.com/search?q=x"), T0);
		expect(r.created).toBe(true);
		expect(r.session.sid).toMatch(SID_RE);
		expect(r.session).toMatchObject({
			site: "default",
			vkey: "vk-v1-2026-06-10",
			day: "2026-06-10",
			hour: 12,
			started: T0,
			last_seen: T0,
			window_s: 1800,
			entry_path: "/landing",
			exit_path: "/landing",
			pageviews: 1,
			events: 0,
			ref_host: "google.com",
			ref_path: "/search",
			channel: "Paid Search",
			source: "google.com",
			utm_source: "google",
			utm_medium: "cpc",
			utm_campaign: null,
			country: "DE",
			device: "desktop",
			browser: "Chrome",
			browser_major: "142",
			os: "Windows",
			lang: "en",
			screen: "xl",
			host: "example.org",
		});
		expect(store.sessions.size).toBe(1);
	});

	it("uses the client sid for a new session when it is unknown", async () => {
		const r = await resolve(pv(SID_A), T0);
		expect(r).toMatchObject({ created: true, session: { sid: SID_A } });
	});

	it("treats an invalid sid as absent", async () => {
		const r = await resolve({ ...pv(null), sid: "NOT-VALID" }, T0);
		expect(r.created).toBe(true);
		expect(r.session.sid).not.toBe("NOT-VALID");
		expect(r.session.sid).toMatch(SID_RE);
	});

	it("ignores self and ignored referrers for first touch", async () => {
		const self = await resolve(pv(null, "/", "https://www.example.org/prev"), T0);
		expect(self.session).toMatchObject({ ref_host: null, ref_path: null, channel: "Direct", source: "(direct)" });
		visitor = "v2";
		const pay = await resolve(pv(null, "/thanks", "https://www.paypal.com/checkout"), T0, { ignoreReferrerHosts: [] });
		expect(pay.session).toMatchObject({ ref_host: null, channel: "Direct" });
		visitor = "v3";
		const extra = await resolve(pv(null, "/", "https://sso.example.net/"), T0, { ignoreReferrerHosts: ["example.net"] });
		expect(extra.session.ref_host).toBeNull();
	});

	it("starts a session from an event with events = 1 and pageviews = 0", async () => {
		const r = await resolve({ t: "ev", sid: null, u: "/x" }, T0);
		expect(r.session).toMatchObject({ pageviews: 0, events: 1, entry_path: "/x" });
	});

	it("stores day and hour in the site timezone", async () => {
		const r = await resolve(pv(null), t("2026-06-10T23:30:00Z"), { siteTimezone: "Europe/Berlin" });
		expect(r.session).toMatchObject({ day: "2026-06-11", hour: 1 });
	});

	it("buckets screen widths", () => {
		expect([undefined, 0, 375, 600, 800, 1100, 1920].map(screenBucket)).toEqual([null, null, "xs", "sm", "md", "lg", "xl"]);
	});
});

describe("resolveSession: continue", () => {
	it("continues by sid and never changes first-touch fields", async () => {
		await resolve(pv(SID_A, "/a", "https://news.example.com/"), T0);
		const r = await resolve(pv(SID_A, "/b", "https://www.google.com/"), T0 + 10 * MIN);
		expect(r.created).toBe(false);
		expect(r.session).toMatchObject({ sid: SID_A, pageviews: 2, exit_path: "/b", entry_path: "/a", ref_host: "news.example.com", channel: "Referral", last_seen: T0 + 10 * MIN });
		expect(store.sessions.size).toBe(1);
		const ev = await resolve({ t: "ev", sid: SID_A, u: "/b" }, T0 + 11 * MIN);
		expect(ev.session).toMatchObject({ pageviews: 2, events: 1, exit_path: "/b" });
	});

	it("continues by vkey when the sid is absent (server-side callers)", async () => {
		const first = await resolve(pv(null, "/a"), T0);
		const r = await resolve(pv(null, "/b"), T0 + 20 * MIN);
		expect(r).toMatchObject({ created: false, session: { sid: first.session.sid, pageviews: 2 } });
	});

	it("merges a fresh client sid into the active same-visitor session and aliases it", async () => {
		await resolve(pv(SID_A), T0);
		const r = await resolve(pv(SID_B), T0 + 5 * MIN);
		expect(r).toMatchObject({ created: false, session: { sid: SID_A, pageviews: 2 } });
		expect(store.aliases.get(`default|${SID_B}`)).toEqual({ canon: SID_A, expires: T0 + 5 * MIN + 86_400 });
		// Next hit carries SID_B and resolves through the alias even from another network.
		visitor = "other-network";
		const next = await resolve(pv(SID_B, "/c"), T0 + 6 * MIN);
		expect(next).toMatchObject({ created: false, session: { sid: SID_A, pageviews: 3, exit_path: "/c" } });
	});

	it("does not use an expired alias", async () => {
		await resolve(pv(SID_A), T0);
		await store.putAlias("default", SID_B, SID_A, T0 + MIN);
		visitor = "v2";
		const r = await resolve(pv(SID_B), T0 + 2 * MIN);
		expect(r).toMatchObject({ created: true, session: { sid: SID_B } });
	});

	it("does not join a session of another site", async () => {
		await resolve(pv(SID_A), T0);
		const r = await resolve(pv(SID_A), T0 + MIN, {}, { site: "blog" });
		expect(r).toMatchObject({ created: true, session: { site: "blog", sid: SID_A } });
	});
});

describe("resolveSession: window per row", () => {
	it("keeps the row window after the setting changes", async () => {
		// Created while the setting was 10 minutes, so window_s = 600.
		await resolve(pv(SID_A), T0, { sessionWindowMinutes: 10 });
		expect(store.sessions.get(`default|${SID_A}`)?.window_s).toBe(600);
		// Setting raised to 30: the row still continues at minute 9.
		const at9 = await resolve(pv(SID_A, "/p2"), T0 + 9 * MIN, { sessionWindowMinutes: 30 });
		expect(at9).toMatchObject({ created: false, session: { sid: SID_A, pageviews: 2 } });
		// A 15 minute gap exceeds the row's own 600 s window even though the setting now says 30.
		const after = await resolve(pv(null, "/p3"), T0 + 24 * MIN, { sessionWindowMinutes: 30 });
		expect(after.created).toBe(true);
		expect(after.session.window_s).toBe(1800);
	});

	it("a row created with 30 minutes survives the setting dropping to 10", async () => {
		await resolve(pv(SID_A), T0, { sessionWindowMinutes: 30 });
		const r = await resolve(pv(SID_A), T0 + 20 * MIN, { sessionWindowMinutes: 10 });
		expect(r).toMatchObject({ created: false, session: { sid: SID_A } });
	});

	it("starts a new session after the window expires and aliases the old sid", async () => {
		await resolve(pv(SID_A), T0);
		const r = await resolve(pv(SID_A), T0 + 31 * MIN);
		expect(r.created).toBe(true);
		expect(r.session.sid).not.toBe(SID_A);
		expect(store.aliases.get(`default|${SID_A}`)?.canon).toBe(r.session.sid);
		const next = await resolve(pv(SID_A), T0 + 32 * MIN);
		expect(next).toMatchObject({ created: false, session: { sid: r.session.sid, pageviews: 2 } });
	});
});

describe("resolveSession: salt boundary continuity", () => {
	const berlin: Partial<ResolveConfig> = { saltTimezone: "Europe/Berlin", saltRotationHour: 4 };
	// Salt day 2026-01-16 starts at 04:00 Berlin = 03:00Z (CET).
	const BOUNDARY = t("2026-01-16T03:00:00Z");

	it("continues a session across the rotation via the previous day's key", async () => {
		const before = await resolve(pv(null, "/a"), BOUNDARY - 10 * MIN, berlin);
		expect(before.session.vkey).toBe("vk-v1-2026-01-15");
		vkeyCalls = [];
		const after = await resolve(pv(null, "/b"), BOUNDARY + 5 * MIN, berlin);
		expect(vkeyCalls).toEqual(["2026-01-16", "2026-01-15"]);
		expect(after).toMatchObject({ created: false, session: { sid: before.session.sid, vkey: "vk-v1-2026-01-15", pageviews: 2 } });
	});

	it("looks up only the current key once the boundary is older than the window", async () => {
		const s = await resolve(pv(null, "/a"), BOUNDARY - 5 * MIN, berlin);
		await resolve(pv(null, "/b"), BOUNDARY + 20 * MIN, berlin);
		vkeyCalls = [];
		const late = await resolve(pv(null, "/c"), BOUNDARY + 40 * MIN, berlin);
		expect(vkeyCalls).toEqual(["2026-01-16"]);
		expect(late.created).toBe(true);
		expect(late.session.sid).not.toBe(s.session.sid);
		expect(late.session.vkey).toBe("vk-v1-2026-01-16");
	});

	it("a sid carried by the page keeps the session after the boundary window", async () => {
		await resolve(pv(SID_C, "/a"), BOUNDARY - 5 * MIN, berlin);
		await resolve(pv(SID_C, "/b"), BOUNDARY + 20 * MIN, berlin);
		const r = await resolve(pv(SID_C, "/c"), BOUNDARY + 40 * MIN, berlin);
		expect(r).toMatchObject({ created: false, session: { sid: SID_C, pageviews: 3 } });
	});

	it("does not look up the previous key away from the boundary", async () => {
		await resolve(pv(null), t("2026-01-16T12:00:00Z"), berlin);
		expect(vkeyCalls).toEqual(["2026-01-16"]);
	});
});

describe("resolveSession: maximum session length", () => {
	it("closes a session older than maxSessionMinutes and starts a new one", async () => {
		const cfg = { maxSessionMinutes: 60 };
		await resolve(pv(SID_A), T0, cfg);
		for (const m of [20, 40, 60]) {
			const r = await resolve(pv(SID_A), T0 + m * MIN, cfg);
			expect(r).toMatchObject({ created: false, session: { sid: SID_A } });
		}
		const closed = await resolve(pv(SID_A), T0 + 61 * MIN, cfg);
		expect(closed.created).toBe(true);
		expect(closed.session.sid).not.toBe(SID_A);
		expect(closed.session.started).toBe(T0 + 61 * MIN);
		// Without a sid the vkey lookup also refuses the closed session.
		expect((await resolve(pv(null), T0 + 62 * MIN, cfg)).session.sid).toBe(closed.session.sid);
	});
});

describe("resolveSession: caps per visit", () => {
	it("skips an event of a visit at maxEventsPerSession with session_cap and writes nothing", async () => {
		const cfg = { maxEventsPerSession: 2 };
		const ev: ResolveEvent = { t: "ev", sid: SID_A, u: "/" };
		await resolve(ev, T0, cfg);
		expect(await resolve(ev, T0 + 1, cfg)).toMatchObject({ created: false });
		expect(await resolve(ev, T0 + 2, cfg)).toMatchObject({ skipped: "session_cap" });
		expect((await store.getSession("default", SID_A))?.events).toBe(2);
		// Page views are capped on their own.
		expect(await resolve(pv(SID_A, "/next"), T0 + 3, cfg)).toMatchObject({ created: false });
	});
});
