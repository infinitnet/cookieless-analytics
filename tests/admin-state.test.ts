// @vitest-environment jsdom
/** Admin URL state codec and date presets, the session view carry-over and the admin preference helper. */
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { TabPage } from "../src/admin/pages/report.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call, resetSearchStatus, retryFailedReports, searchConfigured, summarizeSearch, type SearchStatus, useReport, useSearchStatus } from "../src/admin/api.js";
import { chartMetrics, readPref, setChartMetrics, stringList, writePref } from "../src/admin/prefs.js";
import { compareRange, decodeState, encodeState, matchPreset, presetRange, type QueryState, readStoredView, useQueryState, viewToStore } from "../src/admin/state.js";
import { previousPeriod, samePeriodLastYear, zonedToEpoch } from "../src/core/time.js";

// 02:00 UTC on 1 March 2026: still 28 February in Los Angeles, already 1 March in Berlin.
const NOW = zonedToEpoch("2026-03-01", 2, "UTC");
const LA = "America/Los_Angeles";

describe("URL codec", () => {
	const full: QueryState = {
		from: "2026-02-01",
		to: "2026-02-28",
		compare: "year",
		filters: [
			{ dim: "page", op: "is", values: ["/a", "/b?x=1&y=é"] },
			{ dim: "channel", op: "not_contains", values: ["Paid"] },
			{ dim: "event_prop", op: "regex", values: ["^(foo|bar)$"], prop: "plan" },
		],
		segment: "seg_1",
		site: "blog-2",
	};

	it("round-trips every field including site", () => {
		const qs = encodeState(full);
		expect(qs).toMatch(/^from=2026-02-01&to=2026-02-28&f=[A-Za-z0-9_-]+&cmp=year&seg=seg_1&site=blog-2$/);
		expect(decodeState(qs, "UTC", NOW)).toEqual(full);
	});

	it("round-trips a segment comparison as cmp=seg&cseg=<id> and drops cmp=seg without a segment", () => {
		const s: QueryState = { from: "2026-02-01", to: "2026-02-28", compare: "segment", cseg: "seg_2", filters: [], segment: "seg_1" };
		const qs = encodeState(s);
		expect(qs).toBe("from=2026-02-01&to=2026-02-28&cmp=seg&cseg=seg_2&seg=seg_1");
		expect(decodeState(qs, "UTC", NOW)).toEqual(s);
		expect(decodeState("from=2026-02-01&to=2026-02-28&cmp=seg", "UTC", NOW).compare).toBe("none");
		expect(decodeState("from=2026-02-01&to=2026-02-28&cmp=seg&cseg=bad%20id", "UTC", NOW)).not.toHaveProperty("cseg");
		expect(decodeState("from=2026-02-01&to=2026-02-28&cmp=year&cseg=seg_2", "UTC", NOW)).toMatchObject({ compare: "year" });
		expect(decodeState("from=2026-02-01&to=2026-02-28&cmp=year&cseg=seg_2", "UTC", NOW)).not.toHaveProperty("cseg");
		expect(compareRange(s)).toBeNull();
	});

	it("encodes the annotations toggle as ann=0 only when off; absent means on", () => {
		const off = { from: "2026-02-01", to: "2026-02-02", compare: "none" as const, filters: [], annotations: false };
		expect(encodeState(off)).toBe("from=2026-02-01&to=2026-02-02&ann=0");
		expect(decodeState(encodeState(off), "UTC", NOW)).toEqual(off);
		expect(encodeState({ ...off, annotations: true })).toBe("from=2026-02-01&to=2026-02-02");
		expect(decodeState("from=2026-02-01&to=2026-02-02", "UTC", NOW).annotations).toBeUndefined();
		expect(decodeState("from=2026-02-01&to=2026-02-02&ann=1", "UTC", NOW).annotations).toBeUndefined();
	});

	it("restores the state from a pasted URL", () => {
		const pasted = `https://example.test/_emdash/admin/plugins/x/?${encodeState(full)}`;
		expect(decodeState(new URL(pasted).search, "UTC", NOW)).toEqual(full);
	});

	it("leaves defaults out of the URL", () => {
		expect(encodeState({ from: "2026-02-01", to: "2026-02-02", compare: "none", filters: [] })).toBe("from=2026-02-01&to=2026-02-02");
	});

	it("falls back to the default range and drops invalid parts", () => {
		const bad = btoa(JSON.stringify([{ dim: "page; DROP TABLE", op: "is", values: ["x"] }, { dim: "page", op: "is", values: ["/ok"] }]));
		const s = decodeState(`?from=2026-13-01&to=2026-02-01&f=${bad}&cmp=sideways&seg=a%20b&site=UPPER`, LA, NOW);
		expect(s).toEqual({ from: "2026-01-30", to: "2026-02-28", compare: "none", filters: [{ dim: "page", op: "is", values: ["/ok"] }] });
		expect(decodeState("?f=not-base64!!", "UTC", NOW).filters).toEqual([]);
		expect(decodeState("?from=2026-02-10&to=2026-02-01", "UTC", NOW).from).toBe("2026-01-31");
		// The server refuses ranges over 1000 days, so a pasted one falls back too.
		expect(decodeState("?from=2023-01-01&to=2026-02-01", "UTC", NOW).from).toBe("2026-01-31");
		expect(decodeState("?from=2023-05-09&to=2026-02-01", "UTC", NOW).from).toBe("2023-05-09");
	});
});

describe("date presets in the site timezone", () => {
	it("computes from and to for every preset", () => {
		const r = (p: Parameters<typeof presetRange>[0]) => presetRange(p, LA, NOW);
		expect(r("today")).toEqual({ from: "2026-02-28", to: "2026-02-28" });
		expect(r("yesterday")).toEqual({ from: "2026-02-27", to: "2026-02-27" });
		expect(r("7d")).toEqual({ from: "2026-02-22", to: "2026-02-28" });
		expect(r("30d")).toEqual({ from: "2026-01-30", to: "2026-02-28" });
		expect(r("90d")).toEqual({ from: "2025-12-01", to: "2026-02-28" });
		expect(r("12m")).toEqual({ from: "2025-03-01", to: "2026-02-28" });
		expect(r("mtd")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
		expect(r("ytd")).toEqual({ from: "2026-01-01", to: "2026-02-28" });
		expect(presetRange("today", "Europe/Berlin", NOW)).toEqual({ from: "2026-03-01", to: "2026-03-01" });
		expect(presetRange("mtd", "Europe/Berlin", NOW)).toEqual({ from: "2026-03-01", to: "2026-03-01" });
	});

	it("recognizes a preset range and treats others as custom", () => {
		expect(matchPreset({ from: "2026-02-22", to: "2026-02-28" }, LA, NOW)).toBe("7d");
		expect(matchPreset({ from: "2026-02-21", to: "2026-02-28" }, LA, NOW)).toBeNull();
	});

	it("compare asks for the shifted range the server uses", () => {
		const r = { from: "2026-02-22", to: "2026-02-28" };
		expect(compareRange({ ...r, compare: "previous" })).toEqual({ from: "2026-02-15", to: "2026-02-21" });
		expect(compareRange({ ...r, compare: "previous" })).toEqual(previousPeriod(r));
		expect(compareRange({ ...r, compare: "year" })).toEqual({ from: "2025-02-22", to: "2025-02-28" });
		expect(compareRange({ ...r, compare: "year" })).toEqual(samePeriodLastYear(r));
		expect(compareRange({ ...r, compare: "none" })).toBeNull();
	});
});

describe("cur", () => {
	it("round-trips the revenue currency, uppercases it and drops an unknown code; absent means the default", () => {
		const s: QueryState = { from: "2026-02-01", to: "2026-02-28", compare: "none", filters: [], cur: "EUR" };
		expect(encodeState(s)).toContain("cur=EUR");
		expect(decodeState(encodeState(s), "UTC", NOW)).toEqual(s);
		expect(decodeState("from=2026-02-01&to=2026-02-28&cur=jpy", "UTC", NOW).cur).toBe("JPY");
		expect(decodeState("from=2026-02-01&to=2026-02-28&cur=ZZZ", "UTC", NOW).cur).toBeUndefined();
		expect(encodeState({ ...s, cur: undefined } as QueryState)).not.toContain("cur");
		// Revenue filters survive the f parameter.
		const f: QueryState = { ...s, filters: [{ dim: "revenue", op: "gte", values: ["50"], prop: "EUR" }, { dim: "currency", op: "is_not", values: ["USD"] }] };
		expect(decodeState(encodeState(f), "UTC", NOW).filters).toEqual(f.filters);
	});
});

describe("tab, src and m", () => {
	const base: QueryState = { from: "2026-02-01", to: "2026-02-28", compare: "none", filters: [] };

	it("round-trips the tab, the Search source and the chart metrics", () => {
		const s: QueryState = { ...base, tab: "queries", src: "google", m: ["clicks", "impressions"] };
		const qs = encodeState(s);
		expect(qs).toBe("from=2026-02-01&to=2026-02-28&tab=queries&src=google&m=clicks%2Cimpressions");
		expect(decodeState(qs, "UTC", NOW)).toEqual(s);
		expect(decodeState(`?${qs}`.replace("%2C", ","), "UTC", NOW).m).toEqual(["clicks", "impressions"]);
		// Absent means the first tab, all sources and the page default: nothing in the URL.
		expect(encodeState({ ...base, m: [] })).toBe("from=2026-02-01&to=2026-02-28");
	});

	it("drops bad tab, source and metric values", () => {
		const s = decodeState("from=2026-02-01&to=2026-02-28&tab=Queries%3Cx%3E&src=yahoo&m=visitors,Bad,a;b,,visitors,1x", "UTC", NOW);
		expect(s).not.toHaveProperty("tab");
		expect(s).not.toHaveProperty("src");
		expect(s.m).toEqual(["visitors"]);
		expect(decodeState("from=2026-02-01&to=2026-02-28&m=a,b,c,d,e", "UTC", NOW).m).toEqual(["a", "b", "c", "d"]);
		expect(decodeState("from=2026-02-01&to=2026-02-28&m=,,", "UTC", NOW)).not.toHaveProperty("m");
		expect(decodeState(`from=2026-02-01&to=2026-02-28&tab=${"x".repeat(41)}`, "UTC", NOW)).not.toHaveProperty("tab");
	});
});

describe("session view carry-over", () => {
	beforeEach(() => sessionStorage.clear());
	const view: QueryState = { from: "2026-02-22", to: "2026-02-28", compare: "previous", filters: [{ dim: "channel", op: "is", values: ["Direct"] }], segment: "seg_1", site: "blog-2" };

	it("stores range, comparison, filters, segment and site, never the page-only fields", () => {
		const v = viewToStore({ ...view, tab: "queries", src: "bing", m: ["clicks"], dash: "abcdefabcdef", cur: "EUR", annotations: false, a: "a1", win: 28 }, LA, NOW);
		expect(v.preset).toBe("7d");
		expect(decodeState(v.q, LA, NOW)).toEqual(view);
		expect(v.q).not.toMatch(/(^|&)(tab|src|m|d|cur|ann|a|win)=/);
	});

	it("a URL without a range takes the stored view; its own parameters still apply", () => {
		const stored = viewToStore(view, LA, NOW);
		expect(decodeState("", LA, NOW, stored)).toEqual(view);
		expect(decodeState("?tab=queries&site=main", LA, NOW, stored)).toEqual({ ...view, site: "main", tab: "queries" });
		// An invalid range in the URL counts as no range.
		expect(decodeState("?from=2026-13-01&to=x", LA, NOW, stored).from).toBe("2026-02-22");
	});

	it("a URL with a valid range wins over the stored view", () => {
		const stored = viewToStore(view, LA, NOW);
		expect(decodeState("?from=2026-01-01&to=2026-01-31", LA, NOW, stored)).toEqual({ from: "2026-01-01", to: "2026-01-31", compare: "none", filters: [] });
	});

	it("a relative preset stays relative: Last 7 days stored today still ends today three days later", () => {
		const stored = viewToStore(view, LA, NOW);
		const later = NOW + 3 * 86_400;
		expect(decodeState("", LA, later, stored)).toMatchObject({ from: "2026-02-25", to: "2026-03-03" });
		// A custom range is stored as dates and does not move.
		const custom = viewToStore({ ...view, from: "2026-02-10", to: "2026-02-12" }, LA, NOW);
		expect(custom.preset).toBeUndefined();
		expect(decodeState("", LA, later, custom)).toMatchObject({ from: "2026-02-10", to: "2026-02-12" });
	});

	it("reads back what the hook wrote, and ignores a malformed or foreign value", () => {
		writePref("session", "view.v1", viewToStore(view, LA, NOW));
		expect(readStoredView()).toEqual(viewToStore(view, LA, NOW));
		sessionStorage.setItem("ca.view.v1", "{not json");
		expect(readStoredView()).toBeUndefined();
		sessionStorage.setItem("ca.view.v1", JSON.stringify({ q: "from=2026-02-01", preset: "forever" }));
		expect(readStoredView()).toBeUndefined();
		sessionStorage.setItem("ca.view.v1", JSON.stringify({ q: "from=2026-02-30&to=2026-02-01&site=UPPER" }));
		// The codec still validates a stored value: a bad range falls back to the default.
		expect(decodeState("", "UTC", NOW, readStoredView())).toEqual(decodeState("", "UTC", NOW));
	});
});

describe("useQueryState: history and carry-over", () => {
	beforeEach(() => {
		sessionStorage.clear();
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-02-01&to=2026-02-28");
	});

	it("a tab change adds a history entry, every other change replaces it, and Back returns to the previous tab", () => {
		const { result } = renderHook(() => useQueryState("UTC"));
		const len = window.history.length;
		act(() => result.current[1]({ compare: "previous" }));
		expect(window.history.length).toBe(len);
		act(() => result.current[1]({ tab: "entry" }));
		expect(window.history.length).toBe(len + 1);
		expect(window.location.search).toBe("?from=2026-02-01&to=2026-02-28&cmp=previous&tab=entry");
		act(() => result.current[1]({ filters: [{ dim: "page", op: "is", values: ["/a"] }] }));
		expect(window.history.length).toBe(len + 1);
		// Back: the browser restores the earlier address and fires popstate.
		act(() => {
			window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-02-01&to=2026-02-28&cmp=previous");
			window.dispatchEvent(new PopStateEvent("popstate"));
		});
		expect(result.current[0].tab).toBeUndefined();
		// Clearing values drops them from the URL.
		act(() => result.current[1]({ m: [], src: undefined, tab: "" }));
		expect(result.current[0]).not.toHaveProperty("m");
	});

	it("a tab chosen before the first-view write has run stays in the URL", async () => {
		// A click can land before the mount effect that writes the first view (under load the effect runs late).
		// A layout effect runs before every passive effect, so it puts the tab change deterministically in front of it.
		const { createRoot } = await import("react-dom/client");
		const { useLayoutEffect } = await import("react");
		const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
		const before = env.IS_REACT_ACT_ENVIRONMENT;
		env.IS_REACT_ACT_ENVIRONMENT = false;
		function Probe() {
			const [, update] = useQueryState("UTC");
			useLayoutEffect(() => update({ tab: "entry" }), []);
			return null;
		}
		const root = createRoot(document.createElement("div"));
		try {
			root.render(createElement(Probe));
			await waitFor(() => expect(window.location.search).toContain("tab=entry"));
			// Let the passive effects run, then check they did not take the tab back out.
			await new Promise((r) => setTimeout(r, 50));
			expect(window.location.search).toBe("?from=2026-02-01&to=2026-02-28&tab=entry");
		} finally {
			root.unmount();
			env.IS_REACT_ACT_ENVIRONMENT = before;
		}
	});

	it("the next admin page (a sidebar link without a query) opens with the same range, filters and site", () => {
		const { result, unmount } = renderHook(() => useQueryState("UTC"));
		act(() => result.current[1]({ from: "2026-02-10", to: "2026-02-12", site: "blog-2", tab: "entry", m: ["visitors"] }));
		unmount();
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/audience");
		const next = renderHook(() => useQueryState("UTC"));
		expect(next.result.current[0]).toEqual({ from: "2026-02-10", to: "2026-02-12", compare: "none", filters: [], site: "blog-2" });
		expect(window.location.search).toBe("?from=2026-02-10&to=2026-02-12&site=blog-2");
	});
});

// Node's own `localStorage` global hides jsdom's under vitest; a plain in-memory Storage stands in.
const memoryStorage = (): Storage => {
	const m = new Map<string, string>();
	return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};

describe("prefs.ts", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", memoryStorage());
		sessionStorage.clear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("namespaces keys, validates on read and removes on undefined", () => {
		writePref("local", "cols.v1", ["a", "b"]);
		expect(window.localStorage.getItem("ca.cols.v1")).toBe('["a","b"]');
		expect(readPref("local", "cols.v1", stringList(/^[a-z]+$/))).toEqual(["a", "b"]);
		expect(readPref("local", "cols.v1", stringList(/^[0-9]+$/))).toBeUndefined();
		writePref("local", "cols.v1", undefined);
		expect(window.localStorage.getItem("ca.cols.v1")).toBeNull();
	});

	it("is safe when storage is blocked: reads give undefined, writes do nothing", () => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			get() {
				throw new DOMException("blocked", "SecurityError");
			},
		});
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		expect(readPref("session", "x.v1", (v) => v)).toBeUndefined();
		expect(() => writePref("session", "x.v1", 1)).not.toThrow();
		expect(readStoredView()).toBeUndefined();
		expect(chartMetrics("overview", undefined, ["visitors", "sessions"], ["visitors"])).toEqual(["visitors"]);
		expect(setChartMetrics("overview", ["sessions"], ["visitors"])).toEqual(["sessions"]);
	});

	it("chart metrics: the URL, else the personal default, else the page default, each cut to the page's metrics", () => {
		const allowed = ["visitors", "sessions", "pageviews", "bounce_rate", "avg_duration"];
		expect(chartMetrics("overview", undefined, allowed, ["visitors"])).toEqual(["visitors"]);
		expect(setChartMetrics("overview", ["sessions", "pageviews"], ["visitors"])).toEqual(["sessions", "pageviews"]);
		expect(chartMetrics("overview", undefined, allowed, ["visitors"])).toEqual(["sessions", "pageviews"]);
		expect(chartMetrics("search", undefined, ["clicks"], ["clicks"])).toEqual(["clicks"]);
		expect(chartMetrics("overview", ["bounce_rate", "nope", "bounce_rate"], allowed, ["visitors"])).toEqual(["bounce_rate"]);
		expect(chartMetrics("overview", ["nope"], allowed, ["visitors"])).toEqual(["sessions", "pageviews"]);
		// Back to the default: the URL value is cleared and so is the personal default.
		expect(setChartMetrics("overview", ["visitors"], ["visitors"])).toBeUndefined();
		expect(chartMetrics("overview", undefined, allowed, ["visitors"])).toEqual(["visitors"]);
		window.localStorage.setItem("ca.metrics.v1", JSON.stringify({ overview: ["Bad key"] }));
		expect(chartMetrics("overview", undefined, allowed, ["visitors"])).toEqual(["visitors"]);
	});
});

describe("useReport: abort and retry", () => {
	const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
	afterEach(() => vi.unstubAllGlobals());

	it("aborts the running request when the request changes", async () => {
		const signals: AbortSignal[] = [];
		vi.stubGlobal("fetch", (_u: string, init: RequestInit) => {
			signals.push(init.signal as AbortSignal);
			return new Promise(() => {});
		});
		const { rerender } = renderHook(({ from }) => useReport("", { report: "overview", query: { from, to: "2026-02-28" } }), { initialProps: { from: "2026-02-01" } });
		rerender({ from: "2026-02-02" });
		expect(signals).toHaveLength(2);
		expect(signals[0]?.aborted).toBe(true);
		expect(signals[1]?.aborted).toBe(false);
	});

	it("a failed report runs again through retryFailedReports and through its own reload", async () => {
		let fail = true;
		let n = 0;
		vi.stubGlobal("fetch", async () => {
			n++;
			return fail ? new Response(JSON.stringify({ error: { message: "The database is busy." } }), { status: 503 }) : ok({ data: { rows: [] } });
		});
		const { result } = renderHook(() => useReport("", { report: "overview", query: { from: "2026-02-01", to: "2026-02-28" } }));
		await vi.waitFor(() => expect(result.current.error).toBeTruthy());
		fail = false;
		await act(async () => expect(retryFailedReports()).toBe(1));
		await vi.waitFor(() => expect(result.current.data).toBeTruthy());
		expect(result.current.error).toBeNull();
		expect(retryFailedReports()).toBe(0);
		await act(async () => result.current.reload?.());
		await vi.waitFor(() => expect(n).toBe(3));
	});
});

describe("Search status summary", () => {
	const src = (id: "google" | "bing", o: Record<string, unknown>) => ({ id, configured: true, property: "sc-domain:example.com", status: null, lastError: null, rows: 0, ...o });
	const sum = (sources: unknown[]) => summarizeSearch({ sources } as unknown as SearchStatus);

	it("maps each source to off, unmapped, connected, error or throttled", () => {
		const s = sum([src("google", { rows: 12 }), src("bing", { configured: false, property: "" })]);
		expect(s).toMatchObject({ google: "connected", bing: "off", hasRows: true, usable: ["google"] });
		expect(sum([src("google", { property: "" }), src("bing", { status: "throttled" })])).toMatchObject({ google: "unmapped", bing: "throttled", hasRows: false, usable: ["bing"] });
		expect(sum([src("google", { status: "error", lastError: "Google answered 400 (invalid_grant)." }), src("bing", { status: "error", lastError: "Bing answered 429 (ThrottleIP)." })])).toMatchObject({ google: "error", bing: "throttled", usable: ["google", "bing"] });
		expect(sum([])).toMatchObject({ google: "off", bing: "off", usable: [] });
	});

	it("one search/status call per site is shared by the page; a Search change (connect, map, sync) fetches again", async () => {
		resetSearchStatus();
		const routes: string[] = [];
		let property = "";
		vi.stubGlobal("fetch", async (u: string) => {
			const route = u.split("/plugins/cookieless-analytics/")[1] ?? u;
			routes.push(route);
			return new Response(JSON.stringify({ success: true, data: route === "search/status" ? { sources: [src("google", { property })] } : {} }), { status: 200, headers: { "content-type": "application/json" } });
		});
		const site = { id: "main", label: "This site", local: true, kind: "local" as const };
		const a = renderHook(() => useSearchStatus(site));
		const b = renderHook(() => useSearchStatus(site));
		await vi.waitFor(() => expect(b.result.current.status?.google).toBe("unmapped"));
		expect(await searchConfigured()).toBe(false);
		expect(routes.filter((r) => r === "search/status")).toHaveLength(1);
		property = "sc-domain:example.com";
		await call("search/map", { source: "google", property });
		expect(await searchConfigured()).toBe(true);
		await act(async () => a.result.current.reload());
		await vi.waitFor(() => expect(a.result.current.status?.google).toBe("connected"));
		// A remote site is not asked.
		const r = renderHook(() => useSearchStatus({ id: "far", label: "Far", local: false, kind: "remote" as const }));
		expect(r.result.current.status).toBeNull();
		expect(routes.filter((x) => x === "search/status")).toHaveLength(3);
		vi.unstubAllGlobals();
	});
});

describe("TabPage: the tab is in the URL", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});
	const tabs = [["top", "Top", () => "top body"], ["entry", "Entry", () => "entry body"]] as const;

	it("opens the tab of the URL, writes tab= on a click with a new history entry, and follows Back", async () => {
		vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
		sessionStorage.clear();
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-02-01&to=2026-02-28&tab=entry");
		const { findByText, getByRole } = render(createElement(TabPage, { tabs, title: "Pages" }));
		await findByText("entry body");
		const len = window.history.length;
		await act(async () => fireEvent.click(getByRole("tab", { name: "Top" })));
		await findByText("top body");
		// The URL is written by an effect after the new tab renders: wait for it instead of reading it at once.
		await waitFor(() => expect(window.location.search).toBe("?from=2026-02-01&to=2026-02-28"));
		expect(window.history.length).toBe(len + 1);
		await act(async () => {
			window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-02-01&to=2026-02-28&tab=entry");
			window.dispatchEvent(new PopStateEvent("popstate"));
		});
		await findByText("entry body");
	});

	it("an unknown tab id shows the first tab", async () => {
		vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/pages?from=2026-02-01&to=2026-02-28&tab=gone");
		const { findByText } = render(createElement(TabPage, { tabs, title: "Pages" }));
		await findByText("top body");
	});
});
