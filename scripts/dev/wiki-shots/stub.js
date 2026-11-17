// Synthetic plugin API for the wiki screenshots: answers the admin's route calls from the seeded demo data set
// (example.com, invented numbers). Query parameters of the harness page pick states (search, firstrun, engine).
import { browserWarnings, builtinOverride, diffRules, formatRule, orderWarnings, parseRuleLines } from "../../../src/agents/lines.ts";
import { scopeSummary } from "../../../src/annotations/scope.ts";
import { defaultTarget, scopesOverlap, verdictOf } from "../../../src/annotations/target.ts";
import { dayAdd, seedDemo } from "../seed-demo.mjs";

const P = new URLSearchParams(location.search);
const DEMO = seedDemo();
const SETTINGS_GET = window.__SETTINGS_GET__ ?? { sections: [], values: {}, secrets: {}, search: {} };
const SEARCH_STATE = P.get("search") ?? "connected";
const FIRST_RUN = !!P.get("firstrun");
// engine=postgres: the analytics data lives in Postgres through Hyperdrive (binding CA_PG), healthy, caching off.
const PG = P.get("engine") === "postgres";

const span = (from, to) => DEMO.days.filter((d) => d.t >= from && d.t <= to);
const sum = (rows, k) => rows.reduce((a, d) => a + (d[k] ?? 0), 0);
const avg = (rows, k) => (rows.length ? sum(rows, k) / rows.length : 0);
const previous = (from, to) => {
	const n = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
	return { from: dayAdd(from, -n), to: dayAdd(from, -1) };
};
function totals(rows) {
	const clicks = sum(rows, "clicks");
	const impressions = sum(rows, "impressions");
	const sessions = sum(rows, "sessions");
	const pageviews = sum(rows, "pageviews");
	const orders = sum(rows, "orders");
	const revenue = Math.round(sum(rows, "revenue") * 100) / 100;
	const refunds = Math.round(sum(rows, "refunds") * 100) / 100;
	return {
		visitors: Math.round(sum(rows, "visitors") * 0.86),
		sessions,
		pageviews,
		views_per_session: sessions ? Math.round((pageviews / sessions) * 100) / 100 : 0,
		bounce_rate: avg(rows, "bounce_rate"),
		engaged_rate: avg(rows, "engaged_rate"),
		avg_duration: Math.round(avg(rows, "avg_duration")),
		clicks,
		impressions,
		ctr: impressions ? clicks / impressions : 0,
		position: Math.round(avg(rows, "position") * 10) / 10,
		revenue,
		orders,
		refunds,
		net_revenue: Math.round((revenue - refunds) * 100) / 100,
		aov: orders ? Math.round((revenue / orders) * 100) / 100 : 0,
		revenue_per_visitor: sessions ? Math.round((revenue / sessions) * 100) / 100 : 0,
		revenue_per_session: sessions ? Math.round((revenue / sessions) * 100) / 100 : 0,
		paying_sessions: orders,
		pct_long: avg(rows, "pct_long"),
		pct_short: avg(rows, "pct_short"),
		pct_bad: avg(rows, "pct_bad"),
		pogo_stick_rate: 0.06,
		returned_from_search_rate: 0.08,
		avg_engaged: Math.round(avg(rows, "avg_engaged")),
	};
}
const delta = (a, b) => Object.fromEntries(Object.keys(a).filter((k) => b[k]).map((k) => [k, Math.round(((a[k] - b[k]) / b[k]) * 1000) / 1000]));

const DIM_OF = { top_pages: "pages", pages: "pages", entry_pages: "pages", exit_pages: "pages", not_found: "pages", search_pages: "search_pages", regions: "regions", site_search: "site_search", collections: "collections" };
const BREAKDOWN = { channel: "channels", source: "sources", campaign: "campaigns", entry: "pages", page: "pages", country: "countries", device: "devices", goal: "goals", event: "events" };
/** The long tail of the Pages report: enough rows for more than one table page, so the table search shows. */
const PAGE_TAIL = Array.from({ length: 32 }, (_, i) => ({ key: `/blog/post-${i + 1}`, w: 0.004 - i * 0.0001, change: 0 }));
function rows(report, tot, params = {}, limit = 0) {
	const name = report === "revenue_breakdown" ? BREAKDOWN[params.dim] : (DIM_OF[report] ?? report);
	const base = DEMO.dims[name] ?? DEMO.dims.pages;
	// Only the full Pages report asks for more rows than the demo has; the Overview top pages stay as they are.
	const dim = report === "pages" && limit > base.length ? [...base, ...PAGE_TAIL] : base;
	return dim.map(({ key, w, change }, i) => {
		const v = Math.max(1, Math.round(tot.visitors * w));
		const s = Math.max(1, Math.round(tot.sessions * w));
		return {
			key,
			visitors: v,
			sessions: s,
			pageviews: Math.round(tot.pageviews * w),
			bounce_rate: 0.3 + i * 0.03,
			avg_duration: 120 - i * 7,
			avg_time: 64 - i * 4,
			scroll_median: 70 - i * 4,
			engaged_rate: 0.7 - i * 0.03,
			converting: Math.round(s * 0.04),
			conversion_rate: 0.04 + change / 20,
			completions: Math.round(s * 0.05),
			type: i % 2 ? "page" : "event",
			clicks: Math.round(tot.clicks * w),
			impressions: Math.round(tot.impressions * w),
			ctr: 0.025 + w / 10,
			position: Math.round((3 + i * 2.1) * 10) / 10,
			entries: Math.round(s * 0.7),
			exits: Math.round(s * 0.6),
			exit_rate: 0.2 + i * 0.04,
			events: Math.round(s * 1.4),
			count: Math.round(s * 0.3),
			rate: w,
			share: w,
			searches: Math.round(s * 0.2),
			revenue: Math.round(tot.revenue * w * 100) / 100,
			orders: Math.round(tot.orders * w),
			landing: [{ path: "/" }, { path: "/pricing" }],
			delta: { visitors: change, sessions: change / 2, pageviews: change, clicks: change },
		};
	});
}
const SERIES = ["timeseries", "search_overview", "revenue_series", "satisfaction_series"];

function report(body) {
	const r = body.report;
	const from = body.query?.from ?? P.get("from") ?? "2026-06-03";
	const to = body.query?.to ?? P.get("to") ?? DEMO.end;
	const cmp = previous(from, to);
	const cur = span(from, to);
	const prev = span(cmp.from, cmp.to);
	const tot = totals(cur);
	const ptot = totals(prev);
	const base = { report: r, range: { from, to }, compare: "previous", compareRange: cmp, notices: [] };
	if (FIRST_RUN) {
		const b = { ...base, compare: "none" };
		if (r === "overview") return { ...b, data: { totals: Object.fromEntries(Object.keys(tot).map((k) => [k, 0])), delta: {}, realtime: 0, stored: false } };
		if (SERIES.includes(r)) return { ...b, data: { granularity: "day", series: [], annotations: [], totals: {}, delta: {} } };
		if (r === "revenue") return { ...b, data: { hasRevenue: false, currency: "EUR", totals: {}, currencies: [] } };
		return { ...b, data: { rows: [] } };
	}
	if (r === "overview") return { ...base, data: { totals: tot, compareTotals: ptot, delta: delta(tot, ptot), realtime: 7, stored: true } };
	if (SERIES.includes(r)) {
		const pick = (d) => ({ ...d, visitors: Math.round(d.visitors * 0.86), currency: "EUR", net_revenue: d.revenue - d.refunds, aov: d.orders ? d.revenue / d.orders : 0 });
		return { ...base, data: { granularity: "day", series: cur.map(pick), compareSeries: prev.map(pick), annotations: ANN.filter((a) => a.day >= from && a.day <= to), totals: tot, compareTotals: ptot, delta: delta(tot, ptot) } };
	}
	if (r === "satisfaction") {
		const pages = DEMO.dims.pages.slice(0, 8);
		return { ...base, data: { thresholds: { long_click_seconds: 60, bad_experience_seconds: 10 }, totals: { ...tot, measured: Math.round(tot.sessions * 0.86), measured_rate: 0.86, score: 0.24 }, delta: delta(tot, ptot), rows: pages.map(({ key }, i) => ({ key, sessions: 300 - i * 30, measured: 260 - i * 26, pct_long: 0.5 - i * 0.03, pct_bad: 0.08 + i * 0.01, pct_pogo: 0.04 + i * 0.005, pogo_stick_rate: 0.04 + i * 0.005, pct_returned: 0.06, back_nav_rate: 0.03, score: Math.round((0.38 - i * 0.05) * 1000) / 1000 })).sort((a, b) => (body.params?.rank === "worst" ? a.score - b.score : 0)) } };
	}
	if (r === "revenue") return { ...base, data: { hasRevenue: true, currency: "EUR", totals: tot, compareTotals: ptot, delta: delta(tot, ptot), currencies: [{ currency: "EUR", revenue: tot.revenue, orders: tot.orders }] } };
	if (r === "revenue_orders") {
		// The newest orders of the range, three a day, with the first touch of their visit.
		const pick = (list, i) => list[i % list.length].key;
		// Shaped like the stored reference (`o.` and 20 hex digits of a hash of the order id): deterministic, hash-looking hex.
		const orderRef = (i) => {
			let hex = "";
			for (let k = 0; hex.length < 20; k++) {
				// murmur3 fmix32 over (order, word)
				let x = Math.imul(i + 1, 0x9e3779b1) ^ k;
				x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
				x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
				hex += ((x ^ (x >>> 16)) >>> 0).toString(16).padStart(8, "0");
			}
			return `o.${hex.slice(0, 20)}`;
		};
		const day = (i) => new Date(Date.parse(to) - Math.floor(i / 3) * 86400000).toISOString().slice(0, 10);
		const orders = Array.from({ length: 12 }, (_, i) => ({ key: orderRef(i), day: day(i), amount: [49.9, 129, 19.5, 79][i % 4], refund: false, channel: pick(DEMO.dims.channels, i), entry: pick(DEMO.dims.pages, i * 3), country: pick(DEMO.dims.countries, i) }));
		return { ...base, compare: "none", compareRange: null, data: { currency: "EUR", rows: orders, truncated: true } };
	}
	if (r === "funnels") {
		const steps = ["Visited /pricing", "Started signup", "Signup"];
		return { ...base, data: { rows: steps.map((label, i) => ({ label, sessions: Math.round(tot.sessions * [0.22, 0.08, 0.035][i]), drop_off: [0, 0.64, 0.56][i], conversion: [1, 0.36, 0.16][i] })) } };
	}
	return { ...base, data: { rows: rows(r, tot, body.params, body.limit), ...(r === "goals" ? { total_sessions: tot.sessions } : {}) } };
}

const ANN = DEMO.annotations.map(({ before: _b, change: _c, ...a }) => ({ ...a, summary: scopeSummary(a.scope ?? undefined) }));

// Annotations page: the impact of each annotation on its target over equal windows, as `annotation_impacts` answers.
const LAST_COMPLETE = dayAdd(DEMO.end, -1);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function impacts(body) {
	const { from = "2026-06-03", to = DEMO.end } = body.query ?? {};
	const p = body.params ?? {};
	const w = p.window ?? 14;
	const kindOf = (a) => (a.scope ? Object.keys(a.scope).filter((k) => k !== "v") : ["site"]);
	const list = DEMO.annotations.filter((a) => a.day >= from && a.day <= to && (!p.kind || a.kind === p.kind) && (!p.scopeKind || kindOf(a).includes(p.scopeKind))).sort((x, y) => y.ts - x.ts);
	const limit = Math.min(body.limit ?? 6, 6);
	const rows = list.slice(body.offset ?? 0, (body.offset ?? 0) + limit).map((a) => {
		const target = a.target ?? defaultTarget(a.scope ?? undefined, true);
		const days_after = Math.max(0, Math.min(w, daysBetween(a.day, LAST_COMPLETE)));
		const done = days_after >= w && a.before !== null;
		const after = done ? Math.round(a.before * (1 + a.change) * 1000) / 1000 : null;
		const figures = done
			? { complete: true, periods: { before: { from: dayAdd(a.day, -w), to: dayAdd(a.day, -1) }, after: { from: dayAdd(a.day, 1), to: dayAdd(a.day, w) } }, before: a.before, after, delta_pct: a.change }
			: { complete: false };
		const overlaps = DEMO.annotations
			.filter((o) => o.id !== a.id && o.day >= dayAdd(a.day, -w) && o.day <= dayAdd(a.day, w) && scopesOverlap(a.scope, o.scope))
			.map((o) => ({ id: o.id, day: o.day, text: o.text }));
		const v = verdictOf(target.metric, { window: w, days_after, before: done ? a.before : null, after, notable: Math.abs(a.change ?? 0) >= 0.05 });
		const ann = ANN.find((x) => x.id === a.id);
		return { key: a.id, annotation: ann, target, target_default: !a.target, window: w, days_after, ...figures, currency: target.report === "revenue" ? "EUR" : null, ...v, overlaps };
	});
	return { report: "annotation_impacts", range: { from, to }, compare: "none", compareRange: null, notices: [], data: { rows, total: list.length, window: w, limit, notices: [] } };
}

// Definitions, User agent rules: the stored rules, the bulk check (real parser and diff) and a few built-in rows.
function rulesBulk(body) {
	const parsed = parseRuleLines(body.text ?? "");
	const diff = diffRules(DEMO.agentRules, parsed.rules.map(({ line: _l, ...r }) => r));
	const r = {
		errors: parsed.errors,
		warnings: [...browserWarnings(parsed.rules), ...orderWarnings(parsed.rules, DEMO.agentRules.map((x) => x.data))],
		total: parsed.rules.length,
		added: diff.added.map(formatRule),
		changed: diff.changed.map((c) => ({ from: formatRule(c.from), to: formatRule(c.to) })),
		removed: diff.removed.map((x) => formatRule(x.data)),
		unchanged: diff.unchanged,
	};
	return body.check ? { ...r, written: 0 } : { ...r, written: r.added.length + r.changed.length + r.removed.length, remaining: 0 };
}
function builtinRules(body) {
	const q = body.q?.toLowerCase();
	const hits = DEMO.builtin.filter((b) => (!body.category || b.category === body.category) && (!q || `${b.name} ${b.pattern}`.toLowerCase().includes(q)));
	return { total: hits.length, page: 0, pageSize: 50, items: hits.map((b) => ({ ...b, override: builtinOverride(b) })) };
}

const src = (id, o = {}) => ({ id, configured: true, property: id === "google" ? "sc-domain:example.com" : "https://example.com/", lastRun: "2026-06-30T07:00:00.000Z", status: "ok", lastError: null, lastErrorAt: null, syncing: false, rows: 14200, firstDay: "2026-04-02", lastDay: "2026-06-28", backfill: null, ...o });
const off = { configured: false, property: "", lastRun: null, status: null, rows: 0, firstDay: null, lastDay: null };
function searchStatus() {
	const sources = SEARCH_STATE === "notconnected" ? [src("google", off), src("bing", off)] : [src("google"), src("bing")];
	return { site: "main", kind: "local", sources, provisional: { from: "2026-06-28", to: "2026-06-30" } };
}
const SITES = [
	{ id: "main", label: "This site", local: true, kind: "local", timezone: "Europe/Berlin" },
	{ id: "blog", label: "Blog", local: false, kind: "client", timezone: "Europe/Berlin", hosts: ["blog.example.com"] },
	{ id: "shop", label: "Shop", local: false, kind: "client", timezone: "Europe/Berlin", hosts: ["shop.example.com"] },
];
const DASH = {
	id: "abcdefabcdef",
	site: "main",
	v: 1,
	name: "Weekly overview",
	tiles: [
		{ id: "kpi001", report: "overview", kind: "kpi", metric: "visitors", w: 1 },
		{ id: "kpi002", report: "overview", kind: "kpi", metric: "bounce_rate", w: 1 },
		{ id: "kpi003", report: "overview", kind: "kpi", metric: "sessions", w: 1 },
		{ id: "line01", report: "timeseries", kind: "line", metric: "visitors", metrics: ["visitors", "sessions"], w: 3 },
		{ id: "tab001", report: "channels", kind: "table", w: 3, limit: 5 },
	],
	defaults: { range: "28d", compare: "previous", filters: [] },
	viewer: { ranges: ["7d", "28d"], compare: true },
	created: 1,
	updated: 1782800000,
};
const item = (id, data) => ({ id, data });

// Data page, Delete tab: a preview of matching visits (invented spam traffic from one country).
const FD_DAYS = ["2026-06-20", "2026-06-21", "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"];
const FD_LOG = [{ at: 1782000000, finished: 1782003600, by: "owner@example.com", site: "main", summary: "2026-06-01 to 2026-06-07: ref_host regex ^spam-.*\\.example\\.net$", status: "done", deleted: { visits: 312, pageviews: 330, events: 0, orders: 0, refunds: 0, summaryDays: 3, oldDays: 0, summaryRows: 0 }, skipped: 0 }];
function filteredDelete(r) {
	if (r.startsWith("tools/delete-") && r !== "tools/delete-preview") return { job: null, log: FD_LOG, dayRows: null };
	const v = [120, 410, 395, 402, 388, 430, 421];
	return {
		site: "main",
		from: "2026-06-20",
		to: "2026-06-26",
		rawFrom: "2026-03-02",
		summary: "country is SG; one page view, no engaged time and no scroll",
		days: FD_DAYS.map((day, i) => ({ day, visits: v[i], pageviews: v[i], events: 0, stored: true })),
		totals: { visits: 2566, pageviews: 2566, events: 0, orders: 0, refunds: 0, eventRows: 0 },
		revenue: [],
		top: { country: [{ value: "SG", visits: 2566 }], browser: [{ value: "Chrome", visits: 2410 }, { value: "Edge", visits: 156 }], os: [{ value: "Windows", visits: 2566 }], device: [{ value: "desktop", visits: 2566 }], channel: [{ value: "Direct", visits: 2566 }], ref_host: [{ value: null, visits: 2566 }], entry_path: [{ value: "/", visits: 2300 }, { value: "/pricing", visits: 266 }] },
		old: null,
		recloseDays: 7,
		estimate: { rows: 9800, deleteRows: 5132, summaryRows: 4668, oldRows: 0, smallDays: 0, dayRows: 15000, profile: "standard", today: null },
	};
}

function route(r, body) {
	if (r === "data/query") return body.report === "annotation_impacts" ? impacts(body) : report(body);
	if (r === "config/agent_rules/list") return { items: DEMO.agentRules, cursor: null };
	if (r === "config/agent_rules/bulk") return rulesBulk(body);
	if (r === "config/agent_rules/builtin") return builtinRules(body);
	if (r === "settings/get") return SETTINGS_GET;
	if (r === "sites/hosts") return { hosts: [{ host: "example.com", kind: "own", lastEvent: null }] };
	if (r.startsWith("tools/delete-") && r !== "tools/delete-all") return filteredDelete(r);
	if (r === "sites/list") {
		const client = (s, i) => ({ id: s.id, label: s.label, key: `${s.id}key0123456789abcde`.slice(0, 20), hosts: s.hosts, gscProperty: i ? "" : "sc-domain:blog.example.com", bingSiteUrl: "", paused: false, created: 1781000000, pageviewsToday: [412, 233][i] });
		return { sites: SITES.map((s, i) => ({ ...s, hosts: s.hosts ?? ["example.com"], counts: { sessions: 1200 }, paused: false, keyPresent: true, ...(s.kind === "client" ? { client: client(s, i - 1) } : {}) })) };
	}
	if (r === "search/status") return searchStatus();
	if (r === "search/properties") return { current: "", suggested: "sc-domain:example.com", items: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }] };
	if (r === "dashboards/list") return { items: [DASH, { ...DASH, id: "bbbbbbbbbbbb", name: "Campaign launch" }], shares: {} };
	if (r === "dashboards/get") return DASH;
	if (r === "dashboards/email/status") return { schedule: null, provider: true };
	if (r === "shares/list") return { items: [{ id: "sh1", dashboard: "abcdefabcdef", label: "Team view", created: 1782000000, expires: 1790000000, password: false }] };
	if (r === "keys/list") return { items: [{ id: "k1", label: "Reporting script", prefix: "ab12cd34", scopes: ["read:analytics", "read:search"], sites: [], created: 1782000000, expires: null, last_used: 1782800000, revoked: false }, { id: "k2", label: "Order webhook", prefix: "ef56gh78", scopes: ["write:events"], sites: [], created: 1781000000, expires: 1814000000, last_used: 1782790000, revoked: false }] };
	if (r === "privacy/receipt") return RECEIPT;
	if (r === "move/status") return { job: null, dest: RECEIPT.capacity.database };
	if (r === "sites/summary") {
		const t = totals(span(body.from ?? "2026-06-03", body.to ?? DEMO.end));
		const row = (id, label, kind, f, d) => ({ id, label, kind, sessions: Math.round(t.sessions * f), pageviews: Math.round(t.pageviews * f), visitors: Math.round(t.visitors * f), bounce_rate: 0.42 + f / 20, engaged_rate: 0.58 - f / 20, revenue: f === 1 ? [{ currency: "EUR", revenue: t.revenue, orders: t.orders }] : [], delta: { pageviews: d, sessions: d, visitors: d } });
		const rws = [row("main", "This site", "local", 1, 0.12), row("blog", "Blog", "client", 0.41, -0.06), row("shop", "Shop", "client", 0.27, 0.09)];
		return { from: "2026-06-03", to: DEMO.end, compare: "previous", compareRange: previous("2026-06-03", DEMO.end), watermark: "2026-06-29", rows: rws, totals: { sessions: sum(rws, "sessions"), pageviews: sum(rws, "pageviews"), visitors: null, revenue: rws[0].revenue } };
	}
	if (r === "editor/traffic") return { path: "/blog/getting-started", range: { from: "2026-06-03", to: DEMO.end }, pageviews: 1234, visitors: 800, avg_time: 42.5, sources: [{ key: "google", sessions: 300 }, { key: "(direct)", sessions: 120 }], search: { clicks: 88, impressions: 2100, position: 7.2 }, annotations: [] };
	if (r.startsWith("config/goals/list")) return { items: [item("g1", { name: "Signup", type: "event", match: "is", value: "signup" }), item("g2", { name: "Pricing view", type: "page", match: "is", value: "/pricing" }), item("g3", { name: "Contact form", type: "event", match: "is", value: "_form" })] };
	if (r.startsWith("config/funnels/list")) return { items: [item("f1", { name: "Pricing to signup", mode: "sequential", steps: [{ type: "page", match: "is", value: "/pricing", label: "Visited /pricing" }, { type: "event", match: "is", value: "signup_start", label: "Started signup" }, { type: "event", match: "is", value: "signup", label: "Signup" }] })] };
	if (r.startsWith("config/segments/list")) return { items: [item("s1", { name: "Germany, mobile", filters: [{ dim: "country", op: "is", values: ["DE"] }, { dim: "device", op: "is", values: ["mobile"] }] })] };
	if (r.startsWith("config/annotations/list") || r.startsWith("annotations/list")) return { items: ANN.map((a) => item(a.id, a)) };
	if (r.endsWith("/list")) return { items: [] };
	return {};
}

const RECEIPT = {
	site: { id: "main", kind: "local" },
	db: { dialect: PG ? "postgres" : "sqlite" },
	statement: "No cookies, no device storage, no personal data.",
	sharing: "Nothing is shared with third parties.",
	tables: [
		{ name: "ca_sessions", kind: "table", description: "One row per visit with its page views and events.", retention: "120 days", rows: 61204 },
		{ name: "ca_rollup", kind: "table", description: "Daily summaries.", retention: "25 months", rows: 18320 },
		{ name: "ca_drops", kind: "table", description: "Requests not recorded, per day and reason.", retention: "120 days", rows: 260 },
	],
	retention: { rawDays: 120, rawCapped: false, storage: { profile: "standard", budget: 6e9, bytes: 0.9e9, detail: 0.7e9, summary: 0.2e9, rawDays: 120, capped: false, measured: true }, rollupWatermark: "2026-06-29", raw: "120 days" },
	salt: { day: "2026-06-30", ageSeconds: 25200, nextRotation: 1782864000, stored: ["2026-06-29", "2026-06-30"] },
	drops: { days: 120, byReason: { bot: 9204, overload: 0, invalid: 12 }, note: "Counts are a lower bound; bots are counted, never stored." },
	writes: null,
	ingest: { tier: "direct", queueBound: false },
	capacity: { profile: "standard", rawRetentionDays: 760, database: PG ? "CA_PG" : "DB", health: PG ? { engine: "postgres", status: "ok", latencyMs: 38, queryCache: false } : { engine: "sqlite", status: "ok", latencyMs: 4, queryCache: false }, size: 1.0e9, cap: 10e9, budget: { target: "own", mb: 6000, level: "none", otherMb: null }, today: "2026-06-30", dropsToday: { bot: 140, overload: 0 }, drops7: { bot: 1100, overload: 0, invalid: 3, daily_limit: 0 } },
	markdown: "## Statistics\n\nThis site counts visits without cookies. Example text for example.com.",
};

export function installStub() {
	const real = window.fetch;
	window.fetch = async (url, init = {}) => {
		const u = String(url);
		if (!u.includes("/plugins/")) return real(url, init);
		const r = u.split("/plugins/")[1]?.split("/").slice(1).join("/").split("?")[0] ?? "";
		const body = JSON.parse(String(init.body ?? "{}"));
		await new Promise((res) => setTimeout(res, 5));
		return new Response(JSON.stringify({ success: true, data: route(r, body) }), { status: 200, headers: { "content-type": "application/json" } });
	};
}
