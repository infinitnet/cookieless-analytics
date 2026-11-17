/**
 * Golden reports: seeded synthetic traffic goes through the real write path (recorder and agent events), then
 * every hit-level report must return the numbers a naive reference computes in plain JavaScript from the stored
 * rows flattened to one row per page view and event. Day semantics as documented in `reports/base.ts`: an entry
 * counts on its visit's day, an order on its own day. The same run checks the query plans (key ranges only) and
 * counts the statements per report.
 */
import type Database from "better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";
import { recordAgentEvents } from "../src/core/agent-events.js";
import { validateIngest } from "../src/core/ids.js";
import type { IngestBody } from "../src/contract.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { addDays, eachDay, zonedToEpoch } from "../src/core/time.js";
import type { Db } from "../src/db/adapter.js";
import { type Filter, type Goal, QuerySchema } from "../src/query/filters.js";
import type { ReportCtx, Row } from "../src/query/reports/base.js";
import { clearReportCache, type Params, type ReportName, runReport } from "../src/query/reports/index.js";
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "../src/settings.js";
import { rng } from "./capacity.helpers.js";
import { CHROME_UA, eventRequest, schemaDb } from "./helpers.js";

const TZ = "Europe/Berlin";
const DAYS = ["2026-05-04", "2026-05-05", "2026-05-06"];
const RANGE = { from: DAYS[0] as string, to: DAYS[2] as string };
const PATHS = ["/", "/pricing", "/blog/a", "/blog/b", "/docs", "/search"];
const REFS = [null, null, "https://www.google.com/", "https://www.bing.com/", "https://news.example.com/post"];
const GOALS: Goal[] = [
	{ name: "Pricing", type: "page", match: "is", value: "/pricing" },
	{ name: "Signup", type: "event", match: "is", value: "signup" },
	{ name: "Pro", type: "event", match: "is", value: "signup", props: { plan: "pro" } },
	{ name: "Leave", type: "outbound", match: "is", value: "example.net" },
];
const FUNNEL = [
	{ type: "page" as const, match: "is" as const, value: "/" },
	{ type: "page" as const, match: "is" as const, value: "/pricing" },
	{ type: "event" as const, match: "is" as const, value: "signup" },
];

// ── traffic ──────────────────────────────────────────────────────────────────

const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";
const body = (b: Record<string, unknown>) => {
	const v = validateIngest({ v: 1, ...b }, 7_200_000);
	if (!v) throw new Error(`invalid body ${JSON.stringify(b)}`);
	return v as IngestBody;
};

/** Visits on the day before the range up to the last day; some start just before midnight and run past it. */
async function seedTraffic(env: Awaited<ReturnType<typeof schemaDb>>, settings: Settings): Promise<string[]> {
	resetCounters();
	const r = rng(20261104);
	const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] as T;
	const id = (n: number) => Array.from({ length: n }, () => pick([...ALPHA])).join("");
	const deps = (now: number) => ({ db: env.db, kv: env.kv, settings, now });
	const sids: string[] = [];
	// The reference reads what was stored, so a skipped event (a reload, a cap) is fine; anything else is a broken fixture.
	const ok = (out: string, what: string) => {
		if (!["ok", "reload", "orphan_update"].includes(out)) throw new Error(`${what} dropped: ${out}`);
	};
	// Start times first, then the visits in time order: the recorder sees time move forward, as in production.
	const starts = [addDays(RANGE.from, -1), ...DAYS].flatMap((day) =>
		Array.from({ length: 40 }, (_, v) => (v < 3 ? zonedToEpoch(day, 23, TZ) + (50 + v) * 60 : zonedToEpoch(day, 7 + Math.floor(r() * 15), TZ) + Math.floor(r() * 50) * 60)),
	);
	for (const t0 of starts.sort((a, b) => a - b)) {
		{
			// 60 visitors (the visitor key reads a shortened address, so one /24 each); some come back.
			const ip = `2001:db8:${(1 + Math.floor(r() * 60)).toString(16)}::7`;
			const info = requestInfo(eventRequest("{}", { "user-agent": CHROME_UA, "cf-connecting-ip": ip, "cf-ipcountry": pick(["DE", "US", "FR"]) }));
			const sid = id(20);
			sids.push(sid);
			const ref = pick(REFS);
			let t = t0;
			const pages = 1 + Math.floor(r() * 4);
			for (let p = 0; p < pages; p++) {
				const h = id(12);
				const path = p === 0 && r() < 0.3 ? "/" : pick(PATHS);
				const u = path === "/search" ? `/search?q=${pick(["shoes", "lamp"])}` : p === 0 && ref?.includes("google") && r() < 0.3 ? `${path}?utm_source=google&utm_medium=cpc` : path;
				const nt = r() < 0.7 ? Math.floor(r() * 3) : undefined;
				ok(await recordClientEvent(deps(t), body({ t: "pv", sid, h, u, w: 1440, ...(p === 0 && ref ? { r: ref } : {}), ...(nt !== undefined ? { nt } : {}) }), info), "pv");
				if (r() < 0.8) {
					const d = Math.floor(r() * 90_000);
					ok(await recordClientEvent(deps(t + 5), body({ t: "en", sid, h, d, e: d + 1000, s: Math.floor(r() * 101), i: r() < 0.5 ? 1 : 0, x: Math.floor(r() * 3) }), info), "en");
				}
				// Events at distinct seconds after the page view.
				for (let k = 0; k < 2; k++) {
					if (r() > 0.35) continue;
					const at = t + 7 + k * 3;
					const kind = pick(["signup", "_outbound", "out", "seen", "conv", "purchase"]);
					const p2 =
						kind === "signup"
							? { p: { plan: pick(["pro", "free"]) } }
							: kind === "_outbound"
								? { p: { url: pick(["example.net/a", "example.org/b"]) } }
								: kind === "out" || kind === "conv"
									? { p: { slug: pick(["alpha", "beta"]), ...(r() < 0.6 ? { place: pick(["table", "side"]) } : {}) } }
									: kind === "seen"
										? { p: { s0: pick(["alpha", "alpha@table", "beta@side"]), ...(r() < 0.5 ? { s1: "beta" } : {}) } }
										: {};
					const money = kind === "purchase" || (kind === "conv" && r() < 0.5) ? { val: Math.round(r() * 9000) / 100, cur: pick(["USD", "EUR"]), ...(r() < 0.5 ? { oid: `A-${id(6)}` } : {}) } : {};
					ok(await recordClientEvent(deps(at), body({ t: "ev", sid, name: kind, u: path, ...p2, ...money }), info), "ev");
				}
				t += 60 + Math.floor(r() * 400);
			}
		}
	}
	// Server-reported events: one attached to a visit (a document entry), two without a visit (rows only).
	const last = zonedToEpoch(RANGE.to, 20, TZ);
	const res = await recordAgentEvents(deps(last), "default", [
		{ name: "purchase", val: 20, cur: "EUR", sid: sids[150], ts: last - 60 },
		{ name: "conv", val: 3, cur: "USD", p: { slug: "alpha", place: "table" } },
		{ name: "seen", p: { s0: "beta@side" } },
	]);
	expect(res.rejected).toEqual([]);
	return sids;
}

// ── the reference: the stored rows, one per page view and event ─────────────

interface Visit {
	sid: string;
	day: string;
	vkey: string;
	started: number;
	last_seen: number;
	pageviews: number;
	events: number;
	engaged_ms: number;
	visible_ms: number;
	interacted: number;
	reentries: number;
	entry_path: string | null;
	exit_path: string | null;
	channel: string | null;
}
interface Hit {
	v: Visit;
	key: string;
	ts: number;
	kind: "pv" | "ev";
	path: string | null;
	query: string | null;
	name: string | null;
	props: Record<string, unknown> | null;
	dur: number | null;
	vis: number | null;
	nav: number | null;
	exit: number | null;
	scroll: number | null;
}
interface Order {
	id: string;
	day: string;
	sid: string | null;
	sday: string | null;
	name: string;
	props: Record<string, unknown> | null;
	val: number;
	cur: string;
}

function load(raw: Database.Database) {
	const visits = raw.prepare("SELECT *, json(hits) AS doc FROM ca_sessions").all() as Array<Visit & { doc: string }>;
	const hits: Hit[] = [];
	for (const v of visits)
		for (const [key, e] of Object.entries(JSON.parse(v.doc) as Record<string, Record<string, unknown>>)) {
			if (e.t === undefined) continue;
			const n = (f: string) => (e[f] === undefined ? null : Number(e[f]));
			hits.push({ v, key, ts: v.started + Number(e.t), kind: e.n === undefined ? "pv" : "ev", path: (e.p as string) ?? null, query: (e.qs as string) ?? null, name: (e.n as string) ?? null, props: (e.pr as Record<string, unknown>) ?? null, dur: n("d"), vis: n("e"), nav: n("nt"), exit: n("x"), scroll: n("s") });
		}
	const iso = (d: unknown) => (d == null ? null : String(d).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"));
	const orders = (raw.prepare("SELECT * FROM ca_events WHERE val IS NOT NULL").all() as Array<Record<string, unknown>>).map(
		(o): Order => ({ id: String(o.id), day: iso(o.day) as string, sid: (o.sid as string) ?? null, sday: iso(o.sday), name: String(o.name), props: o.props ? JSON.parse(String(o.props)) : null, val: Number(o.val), cur: String(o.cur) }),
	);
	const visitless = (raw.prepare("SELECT * FROM ca_events WHERE sid IS NULL").all() as Array<Record<string, unknown>>).map((o) => ({ day: iso(o.day) as string, name: String(o.name), props: o.props ? (JSON.parse(String(o.props)) as Record<string, string>) : {} }));
	return { visits, hits, orders, visitless };
}

const rnd = (v: number | null, d = 4) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const rate = (a: number, b: number) => (b > 0 ? a / b : null);
const inRange = (day: string) => day >= RANGE.from && day <= RANGE.to;
const by = <T>(xs: readonly T[], k: (x: T) => string) => {
	const m = new Map<string, T[]>();
	for (const x of xs) m.set(k(x), [...(m.get(k(x)) ?? []), x]);
	return m;
};
/** Visitors: distinct visitor keys per visit day, summed over days. */
const visitorsOf = (vs: readonly Visit[]) => [...by(vs, (v) => v.day).values()].reduce((a, g) => a + new Set(g.map((v) => v.vkey)).size, 0);
const visitorsOfHits = (hs: readonly Hit[]) => [...by(hs, (h) => h.v.day).values()].reduce((a, g) => a + new Set(g.map((h) => h.v.vkey)).size, 0);
const order = (a: Row, b: Row, ...keys: string[]) => {
	for (const k of keys) if (a[k] !== b[k]) return Number(b[k]) - Number(a[k]);
	return a.key < b.key ? -1 : 1;
};
const sessionsOf = (hs: readonly Hit[]) => new Set(hs.map((h) => h.v.sid)).size;

describe("reports against a row-per-hit reference on traffic written by the real path", () => {
	let env: Awaited<ReturnType<typeof schemaDb>>;
	let settings: Settings;
	let rc: ReportCtx;
	let ref: ReturnType<typeof load>;
	const seen: Array<{ sql: string; params: unknown[] }> = [];
	const run = (report: ReportName, params: Params = {}, filters: Filter[] = [], limit = 500) => {
		clearReportCache();
		return runReport(rc, { report, query: QuerySchema.parse({ ...RANGE, filters }), params, limit });
	};
	/** Visits of the range with a page view, the denominator of every report. */
	const counted = () => ref.visits.filter((v) => inRange(v.day) && v.pageviews > 0);
	const hitsOf = (kind: "pv" | "ev", vs = counted()) => {
		const ids = new Set(vs.map((v) => `${v.day}|${v.sid}`));
		return ref.hits.filter((h) => h.kind === kind && ids.has(`${h.v.day}|${h.v.sid}`));
	};

	beforeAll(async () => {
		env = await schemaDb();
		settings = normalizeSettings({ siteTimezone: TZ });
		await seedTraffic(env, settings);
		ref = load(env.raw);
		const spy: Db = { ...env.db, all: (sql, p) => (seen.push({ sql, params: [...(p ?? [])] }), env.db.all(sql, p)) };
		rc = { db: spy, site: "default", settings, now: zonedToEpoch(RANGE.to, 21, TZ), goals: GOALS, funnels: {}, annotations: [], defaultCurrency: "USD", siteSearchParams: ["q"] };
	}, 60_000);

	it("the traffic covers what the reports read", () => {
		expect(ref.visits.filter((v) => !inRange(v.day)).length).toBeGreaterThan(0);
		// Visits that started before midnight and continued after it.
		expect(ref.hits.some((h) => h.kind === "pv" && h.ts >= zonedToEpoch(addDays(h.v.day, 1), 0, TZ))).toBe(true);
		for (const n of ["signup", "_outbound", "out", "seen", "conv", "purchase"]) expect(ref.hits.some((h) => h.name === n), n).toBe(true);
		expect(new Set(ref.orders.map((o) => o.cur))).toEqual(new Set(["USD", "EUR"]));
		expect(ref.visitless.length).toBe(2);
		expect(counted().length).toBeGreaterThan(100);
	});

	it("pages: pageviews, visitors, active and visible time, exit rate and scroll median", async () => {
		const check = async (filters: Filter[], keep: (h: Hit) => boolean, sessionOk: (v: Visit) => boolean) => {
			const vs = counted().filter(sessionOk);
			const pvs = hitsOf("pv", vs).filter(keep);
			const exits = by(vs, (v) => String(v.exit_path));
			const rows = [...by(pvs, (h) => String(h.path))].map(([key, hs]): Row => {
				const durs = hs.flatMap((h) => (h.dur === null ? [] : [h.dur]));
				const viss = hs.flatMap((h) => (h.vis === null ? [] : [h.vis]));
				const sc = hs.flatMap((h) => (h.scroll === null ? [] : [h.scroll])).sort((a, b) => a - b);
				return {
					key,
					pageviews: hs.length,
					visitors: visitorsOfHits(hs),
					avg_time: durs.length ? rnd(durs.reduce((a, b) => a + b, 0) / 1000 / durs.length, 1) : null,
					avg_visible: viss.length ? rnd(viss.reduce((a, b) => a + b, 0) / 1000 / viss.length, 1) : null,
					exit_rate: rnd(rate(exits.get(key)?.length ?? 0, hs.length)),
					scroll_median: sc.length ? (sc[Math.ceil(sc.length / 2) - 1] as number) : null,
				};
			});
			expect((await run("pages", {}, filters)).data.rows).toEqual(rows.sort((a, b) => order(a, b, "pageviews")));
		};
		await check([], () => true, () => true);
		// A page filter keeps visits with a matching page view and, in the table, only the matching page views.
		const blog = (h: Hit) => !!h.path?.startsWith("/blog");
		await check([{ dim: "page", op: "prefix", values: ["/blog"] }], blog, (v) => ref.hits.some((h) => h.v === v && h.kind === "pv" && blog(h)));
		const de = env.raw.prepare("SELECT sid, day FROM ca_sessions WHERE country = 'DE'").all() as Array<{ sid: string; day: string }>;
		const isDe = new Set(de.map((v) => `${v.day}|${v.sid}`));
		await check([{ dim: "country", op: "is", values: ["DE"] }], () => true, (v) => isDe.has(`${v.day}|${v.sid}`));
	});

	const sessionRow = (key: string, vs: readonly Visit[]) => {
		const sessions = vs.length;
		const pageviews = vs.reduce((a, v) => a + v.pageviews, 0);
		const thr = settings.engagedThresholdSeconds * 1000;
		return {
			key,
			visitors: visitorsOf(vs),
			sessions,
			pageviews,
			views_per_session: rnd(rate(pageviews, sessions)),
			// A bounce is a session that is not engaged (the GA4 meaning).
			bounce_rate: rnd(rate(vs.filter((v) => !(v.engaged_ms >= thr || v.pageviews > 1 || v.events > 0)).length, sessions)),
			engaged_rate: rnd(rate(vs.filter((v) => v.engaged_ms >= thr || v.pageviews > 1 || v.events > 0).length, sessions)),
			avg_duration: rnd(rate(vs.reduce((a, v) => a + Math.max((v.last_seen - v.started) * 1000, v.visible_ms), 0) / 1000, sessions), 1),
		};
	};

	it("entry and exit pages, channels (also under an event filter)", async () => {
		const groups = (vs: readonly Visit[], k: (v: Visit) => string) => [...by(vs, k)].map(([key, g]) => sessionRow(key, g)).sort((a, b) => order(a, b, "sessions"));
		expect((await run("entry_pages")).data.rows).toEqual(groups(counted(), (v) => String(v.entry_path)).map(({ sessions, ...r }) => ({ ...r, entries: sessions })));
		const pvByPath = by(hitsOf("pv"), (h) => String(h.path));
		expect((await run("exit_pages")).data.rows).toEqual(
			groups(counted(), (v) => String(v.exit_path)).map((r) => ({ key: r.key, exits: r.sessions, visitors: r.visitors, exit_rate: rnd(rate(r.sessions, pvByPath.get(r.key)?.length ?? 0)) })),
		);
		expect((await run("channels")).data.rows).toEqual(groups(counted(), (v) => v.channel ?? "(not set)"));
		const signedUp = counted().filter((v) => ref.hits.some((h) => h.v === v && h.name === "signup"));
		expect((await run("channels", {}, [{ dim: "event", op: "is", values: ["signup"] }])).data.rows).toEqual(groups(signedUp, (v) => v.channel ?? "(not set)"));
	});

	it("behaviour: events, event properties, goals, sequential funnel, scroll", async () => {
		const total = counted().length;
		const evs = hitsOf("ev");
		const own = [...by(evs.filter((h) => !h.name?.startsWith("_")), (h) => String(h.name))].map(([key, hs]) => ({ key, events: hs.length, sessions: sessionsOf(hs), rate: rnd(rate(sessionsOf(hs), total)) }));
		expect((await run("events")).data.rows).toEqual(own.sort((a, b) => order(a, b, "events")));

		const props = [...by(evs.filter((h) => h.name === "signup"), (h) => `plan=${String(h.props?.plan)}`)].map(([key, hs]) => ({ key, prop: "plan", value: key.slice(5), count: hs.length }));
		expect((await run("event_props", { event: "signup" })).data.rows).toEqual(props.sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1)));

		const pvs = hitsOf("pv");
		const matches: Record<string, (h: Hit) => boolean> = {
			Pricing: (h) => h.kind === "pv" && h.path === "/pricing",
			Signup: (h) => h.name === "signup",
			Pro: (h) => h.name === "signup" && h.props?.plan === "pro",
			Leave: (h) => h.name === "_outbound" && (String(h.props?.url).toLowerCase() === "example.net" || String(h.props?.url).toLowerCase().startsWith("example.net/")),
		};
		const goals = GOALS.map((g) => {
			const hs = [...pvs, ...evs].filter(matches[g.name] as (h: Hit) => boolean);
			return { key: g.name, type: g.type, completions: hs.length, converting: sessionsOf(hs), conversion_rate: rnd(rate(sessionsOf(hs), total)) };
		}).sort((a, b) => b.converting - a.converting || (a.key < b.key ? -1 : 1));
		expect((await run("goals")).data.rows).toEqual(goals);

		const reached = [0, 0, 0];
		for (const v of counted()) {
			let step = 0;
			for (const h of ref.hits.filter((x) => x.v === v).sort((a, b) => a.ts - b.ts || (a.key < b.key ? -1 : 1))) {
				const s = FUNNEL[step];
				if (s && (s.type === "page" ? h.kind === "pv" && h.path === s.value : h.name === s.value)) reached[step++]! += 1;
			}
		}
		const f = await run("funnels", { steps: FUNNEL });
		expect(f.data.rows?.map((x) => x.sessions)).toEqual(reached);
		expect(reached[2]).toBeGreaterThan(0);

		const bucket = (s: number) => (s >= 100 ? 100 : s >= 75 ? 75 : s >= 50 ? 50 : s >= 25 ? 25 : 0);
		const scrolled = pvs.filter((h) => h.scroll !== null);
		expect((await run("scroll")).data.rows).toEqual(
			[0, 25, 50, 75, 100].map((b) => {
				const n = scrolled.filter((h) => bucket(h.scroll as number) === b).length;
				return { key: String(b), pageviews: n, share: rnd(rate(n, scrolled.length)) };
			}),
		);
	});

	it("satisfaction totals and the back/forward share", async () => {
		const long = DEFAULT_SETTINGS.longClickSeconds * 1000;
		const bad = Math.min(DEFAULT_SETTINGS.badExperienceSeconds * 1000, long);
		const c = { sessions: 0, measured: 0, long_clicks: 0, short_clicks: 0, bad_experiences: 0, search_sessions: 0, search_measured: 0, pogo_sticks: 0 };
		for (const v of counted()) {
			const dur = Math.max((v.last_seen - v.started) * 1000, v.visible_ms);
			const m = v.visible_ms > 0;
			const se = v.channel === "Organic Search" || v.channel === "Paid Search";
			const single = v.pageviews === 1 && v.events === 0;
			const lexit = v.pageviews === 1 ? Math.max(...ref.hits.filter((h) => h.v === v && h.kind === "pv").map((h) => h.exit ?? -1)) : null;
			c.sessions++;
			if (m) c.measured++;
			if (m && dur > long) c.long_clicks++;
			if (m && dur <= long) c.short_clicks++;
			if (m && single && v.interacted === 0 && dur < bad) c.bad_experiences++;
			if (se) c.search_sessions++;
			if (se && m) c.search_measured++;
			if (se && m && single && dur <= long && lexit === 2) c.pogo_sticks++;
		}
		const pvs = hitsOf("pv").filter((h) => h.nav !== null);
		const r = await run("satisfaction");
		expect(r.data.totals).toMatchObject({ ...c, back_nav_rate: rnd(rate(pvs.filter((h) => h.nav === 2).length, pvs.length)) });
		expect(c.long_clicks + c.short_clicks).toBe(c.measured);
	});

	it("links by link, with the conversions the server reported without a visit", async () => {
		const vs = ref.visits.filter((v) => inRange(v.day));
		const ids = new Set(vs.map((v) => `${v.day}|${v.sid}`));
		const evs = ref.hits.filter((h) => h.kind === "ev" && ids.has(`${h.v.day}|${h.v.sid}`));
		const rows = new Map<string, { impressions: number; clicks: number; sessions: Set<string>; conversions: number }>();
		const at = (k: string) => rows.get(k) ?? (rows.set(k, { impressions: 0, clicks: 0, sessions: new Set(), conversions: 0 }), rows.get(k))!;
		const slug = (p: Record<string, unknown> | null) => (p?.slug === undefined ? "(not set)" : String(p.slug));
		for (const h of evs) {
			if (h.name === "out") (at(slug(h.props)).clicks++, at(slug(h.props)).sessions.add(h.v.sid));
			if (h.name === "conv") at(slug(h.props)).conversions++;
			if (h.name === "seen") for (const [k, val] of Object.entries(h.props ?? {})) if (/^s\d$/.test(k) && val) at(String(val).split("@")[0] as string).impressions++;
		}
		for (const e of ref.visitless.filter((x) => inRange(x.day))) {
			if (e.name === "conv") at(slug(e.props)).conversions++;
			if (e.name === "seen") for (const [k, val] of Object.entries(e.props)) if (/^s\d$/.test(k) && val) at(val.split("@")[0] as string).impressions++;
		}
		const want = [...rows].map(([key, e]) => ({ key, impressions: e.impressions, clicks: e.clicks, ctr: rnd(rate(e.clicks, e.impressions)) ?? 0, sessions: e.sessions.size, conversions: e.conversions }));
		want.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || (a.key < b.key ? -1 : 1));
		expect((await run("links")).data.rows).toEqual(want);
	});

	it("journeys: what follows and precedes a page", async () => {
		const seqs = counted().map((v) => {
			const paths = ref.hits.filter((h) => h.v === v && h.kind === "pv").sort((a, b) => a.ts - b.ts || (a.key < b.key ? -1 : 1)).map((h) => h.path as string);
			return { sid: v.sid, steps: paths.filter((p, i) => i === 0 || paths[i - 1] !== p) };
		});
		for (const [report, dir, none] of [["journey_next", 1, "(exit)"], ["journey_prev", -1, "(entry)"]] as const) {
			const groups = new Map<string, Set<string>>();
			const page = new Set<string>();
			for (const s of seqs)
				s.steps.forEach((p, i) => {
					if (p !== "/") return;
					page.add(s.sid);
					const k = s.steps[i + dir] ?? none;
					groups.set(k, (groups.get(k) ?? new Set()).add(s.sid));
				});
			const all = [...groups].map(([key, g]) => ({ key, sessions: g.size, share: rnd(rate(g.size, page.size)) })).sort((a, b) => b.sessions - a.sessions || (a.key < b.key ? -1 : 1));
			const r = await run(report, { path: "/" });
			expect(r.data, report).toEqual({ rows: all.filter((x) => x.sessions >= 2).slice(0, 20), hidden_sessions: all.filter((x) => x.sessions < 2).reduce((a, x) => a + x.sessions, 0), page_sessions: page.size });
		}
	});

	it("revenue: totals per currency by the order's own day, and the channel breakdown", async () => {
		const orders = ref.orders.filter((o) => inRange(o.day));
		const visitOf = (o: Order) => ref.visits.find((v) => v.sid === o.sid && v.day === o.sday);
		const usd = orders.filter((o) => o.cur === "USD");
		const money = (n: number) => Math.round(n * 100) / 100;
		const sum = (os: readonly Order[]) => money(os.reduce((a, o) => a + o.val, 0));
		const r = await run("revenue", { currency: "USD" });
		expect(r.data.totals).toMatchObject({ revenue: sum(usd), orders: usd.length, paying_sessions: new Set(usd.flatMap((o) => (o.sid ? [o.sid] : []))).size, sessions: counted().length, visitors: visitorsOf(counted()) });
		expect((r.data.currencies as Array<{ currency: string; orders: number }>).map((c) => [c.currency, c.orders]).sort()).toEqual(
			[...by(orders, (o) => o.cur)].map(([c, os]) => [c, os.length]).sort(),
		);
		const key = (o: Order) => {
			const v = visitOf(o);
			return v && v.pageviews > 0 ? (v.channel ?? "(not set)") : "(not set)";
		};
		const rev = [...by(usd, key)].map(([k, os]) => ({ key: k, revenue: sum(os), orders: os.length }));
		const vis = new Map([...by(counted(), (v) => v.channel ?? "(not set)")].map(([k, g]) => [k, visitorsOf(g)]));
		const b = await run("revenue_breakdown", { dim: "channel", currency: "USD" });
		const want = [...new Set([...rev.map((x) => x.key), ...vis.keys()])].map((k) => {
			const x = rev.find((y) => y.key === k);
			return { key: k, revenue: x?.revenue ?? 0, orders: x?.orders ?? 0, visitors: vis.get(k) ?? null };
		});
		want.sort((a, b2) => b2.revenue - a.revenue || b2.orders - a.orders || (a.key < b2.key ? -1 : 1));
		expect(b.data.rows?.map((x) => ({ key: x.key, revenue: x.revenue, orders: x.orders, visitors: x.visitors }))).toEqual(want);
		// An order from a visit that started on the last day and placed after midnight is outside the range; its visit's page views are inside.
		expect(eachDay(RANGE.from, RANGE.to)).toHaveLength(3);
	});

	it("every statement reads key ranges of its tables, never a scan, and the statement count per report is small", async () => {
		const reports: Array<[ReportName, Params, Filter[]]> = [
			["pages", {}, []],
			["pages", {}, [{ dim: "page", op: "prefix", values: ["/blog"] }]],
			["entry_pages", {}, []],
			["exit_pages", {}, []],
			["channels", {}, [{ dim: "event", op: "is", values: ["signup"] }]],
			["events", {}, []],
			["event_props", { event: "signup" }, []],
			["goals", {}, []],
			["funnels", { steps: FUNNEL }, []],
			["scroll", {}, []],
			["satisfaction", {}, []],
			["links", { withRevenue: true }, []],
			["journey_next", { path: "/" }, []],
			["journey_paths", {}, []],
			["site_search", {}, []],
			["not_found", {}, []],
			["revenue", {}, []],
			["revenue_breakdown", { dim: "page" }, []],
			["revenue_breakdown", { dim: "goal" }, []],
			["overview", {}, [{ dim: "revenue", op: "gte", values: ["10"] }]],
			["dimension_values", { dim: "page" }, []],
		];
		const counts: Record<string, number> = {};
		const PLANS = new Map<string, string>();
		for (const [report, params, filters] of reports) {
			seen.length = 0;
			await run(report, params, filters);
			counts[`${report}${filters.length ? " filtered" : ""}${params.dim ? ` ${params.dim}` : ""}`] = seen.length;
			for (const s of seen) {
				const plan = (env.raw.prepare(`EXPLAIN QUERY PLAN ${s.sql}`).all(...(s.params as never[])) as Array<{ detail: string }>).map((p) => p.detail);
				for (const l of plan) if (!PLANS.has(l)) PLANS.set(l, s.sql);
			}
		}
		const lines = [...PLANS.keys()];
		// Every base table is read by a key range or point lookup that starts with the site; plain SCANs are of
		// the document (`json_each`, a virtual table) or of subqueries and CTEs of the same statement.
		const tables = lines.filter((l) => /\bca_[a-z_]+\b|USING (PRIMARY KEY|INDEX|COVERING INDEX)/.test(l));
		for (const l of tables) expect(l, PLANS.get(l)).toMatch(/^SEARCH \w+ USING (PRIMARY KEY|INDEX \w+|COVERING INDEX \w+) \(site=\?/);
		const scans = lines.filter((l) => l.startsWith("SCAN "));
		// `x` is also the CTE `seq x` of the journeys (a full scan of a table would read `SCAN <alias>` too, so it is told apart by the statement).
		for (const l of scans.filter((x) => !(x === "SCAN x" && PLANS.get(x)?.includes("FROM seq x")))) expect(l, PLANS.get(l)).toMatch(/^SCAN (\w+ (EXISTS )?VIRTUAL TABLE INDEX|t$|seq$|v$|p$|a$|b$|m$|CONSTANT ROW$|\(subquery-\d+\)$)/);
		// The visits are always a range of days of one site (or the two live days, or one visit by its key).
		const visits = tables.filter((l) => /^SEARCH s USING PRIMARY KEY/.test(l));
		expect(visits.length).toBeGreaterThan(0);
		for (const l of visits) expect(l).toMatch(/\(site=\? AND day(>\?|=\?)/);
		// One to four statements per report on the raw layer (goals: one more per ten goals).
		for (const [k, n] of Object.entries(counts)) expect(n, k).toBeLessThanOrEqual(k === "goals" ? 1 + Math.ceil(GOALS.length / 10) : k.startsWith("revenue_breakdown") ? 5 : 4);
		expect(counts).toMatchSnapshot();
	});
});
