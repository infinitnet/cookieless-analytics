// @vitest-environment jsdom
/** Annotations page: rows with impact verdicts from one batched call, the window selector, the deep link, the editor with the target picker and the scope editor. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSearchStatus } from "../src/admin/api.js";
import { pages } from "../src/admin/index.js";
import { annotationAction } from "../src/admin/components/AnnotationPopover.js";
import Annotations, { ANNOTATIONS_TEXT, draftTarget, type ImpactRow, windowOf } from "../src/admin/pages/Annotations.js";
import { SEARCH_DEBOUNCE_MS } from "../src/admin/components/SearchBox.js";
import { decodeState, encodeState } from "../src/admin/state.js";
import { ADMIN_PAGES } from "../src/index.js";
import { saveBody } from "../src/routes/config.js";

type Body = Record<string, any>;
let calls: Array<{ route: string; body: Body }> = [];
let rows: ImpactRow[] = [];
let usable = true;
let saved: Body[] = [];

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { code: "ERR", message } }), { status, headers: { "content-type": "application/json" } });
const src = (id: "google" | "bing", configured: boolean) => ({ id, configured, property: configured ? "sc-domain:example.com" : "", lastRun: null, status: "ok", lastError: null, lastErrorAt: null, syncing: false, rows: 10, firstDay: "2026-03-01", lastDay: "2026-03-11", backfill: null });
const ann = (id: string, day: string, text: string, extra: Record<string, unknown> = {}) => ({ id, ts: Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 12) / 1000, day, kind: "manual", text, scope: null, summary: "Site-wide", target: null, ...extra });
const PERIODS = { before: { from: "2026-02-24", to: "2026-03-09" }, after: { from: "2026-03-11", to: "2026-03-24" } };
const row = (r: Partial<ImpactRow> & Pick<ImpactRow, "key" | "annotation">): ImpactRow => ({ target: { report: "overview", metric: "visitors" }, target_default: true, window: 14, days_after: 14, complete: true, periods: PERIODS, before: 100, after: 160, delta_pct: 0.6, verdict: "up", good: true, overlaps: [], ...r }) as ImpactRow;

function fixture(): ImpactRow[] {
	return [
		row({ key: "r5", annotation: ann("r5", "2026-03-20", "Release 5") as never, days_after: 5, complete: false, verdict: "too_early", good: null }),
		row({ key: "b1", annotation: ann("b1", "2026-03-10", "New hero", { scope: { v: 1, path: [{ op: "is", value: "/pricing/" }] }, summary: "Page /pricing/", target: { report: "overview", metric: "bounce_rate" } }) as never, target: { report: "overview", metric: "bounce_rate" }, target_default: false, before: 0.5, after: 0.4, delta_pct: -0.2, verdict: "down", good: true, overlaps: [{ id: "f1", day: "2026-03-12", text: "Price change" }] }),
		row({ key: "f1", annotation: ann("f1", "2026-03-12", "Price change", { kind: "publish", slug: "price", collection: "posts" }) as never, before: 100, after: 104, delta_pct: 0.04, verdict: "flat", good: null }),
		row({ key: "n1", annotation: ann("n1", "2026-03-05", "Tiny test") as never, before: 3, after: 4, delta_pct: 0.3333, verdict: "no_data", good: null }),
		row({ key: "u1", annotation: ann("u1", "2026-03-02", "Newsletter") as never }),
	];
}

beforeEach(() => {
	resetSearchStatus();
	// Node's own storage globals hide jsdom's under vitest; plain in-memory stores stand in.
	for (const name of ["localStorage", "sessionStorage"]) {
		const m = new Map<string, string>();
		vi.stubGlobal(name, { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
	}
	calls = [];
	saved = [];
	usable = true;
	rows = fixture();
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/annotations?from=2026-03-01&to=2026-03-31");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			switch (route) {
				case "sites/list":
					return ok({ sites: [{ id: "main", label: "This site", local: true, kind: "local", timezone: "UTC" }] });
				case "search/status":
					return ok({ site: "main", kind: "local", sources: [src("google", usable), src("bing", false)], provisional: null });
				case "config/goals/list":
					return ok({ items: [{ id: "g1", data: { name: "Signup", type: "event", match: "is", value: "signup" } }], cursor: null });
				case "config/segments/list":
					return ok({ items: [], cursor: null });
				case "annotations/preview":
					return ok({ hosts: { count: 1, sample: ["example.org"] }, pages: { count: 3, sample: ["/blog/a", "/blog/b", "/blog/c"] }, queries: null, notices: [] });
				case "config/annotations/save": {
					const p = saveBody("annotations").safeParse(body);
					if (!p.success) return fail(400, p.error.issues.map((i) => i.message).join("; "));
					saved.push(body);
					return ok({ id: body.id ?? "new1" });
				}
				case "config/annotations/delete":
					return ok({ id: body.id, deleted: true });
				case "data/query": {
					const q = String(body.params?.q ?? "").toLowerCase();
					const list = q ? rows.filter((r) => r.annotation.text.toLowerCase().includes(q)) : rows;
					const data =
						body.report === "annotation_impacts"
							? { rows: list.slice(body.offset ?? 0, (body.offset ?? 0) + (body.limit ?? 50)), total: list.length, window: body.params.window, limit: body.limit, notices: [] }
							: body.report === "impact"
								? { annotation: { id: body.params.annotation, ts: 0, kind: "manual", text: "New hero", scope: null, summary: "Site-wide" }, day: "2026-03-10", window: body.params.window, complete: true, days_after: 14, periods: PERIODS, before: 0.5, after: 0.4, measured: { base: "sessions", before: 900, after: 950 }, context: { before: { visitors: 100 }, after: { visitors: 130 } }, overlapping: [], notices: [] }
								: { rows: [] };
					return ok({ report: body.report, range: { from: body.query.from, to: body.query.to }, compare: "none", compareRange: null, notices: [], data });
				}
				default:
					return ok({ items: [] });
			}
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const queries = (report: string) => calls.filter((c) => c.route === "data/query" && c.body.report === report).map((c) => c.body);
const rowOf = (text: string) => screen.getByRole("cell", { name: new RegExp(`^${text}`) }).closest("tr") as HTMLElement;
const impactCell = (text: string) => within(rowOf(text)).getAllByRole("cell")[5] as HTMLElement;

describe("descriptor", () => {
	it("Annotations is a sidebar page after Links, and the Definitions page has no Annotations tab", () => {
		const paths = ADMIN_PAGES.map((p) => p.path);
		expect(paths[paths.indexOf("/links") + 1]).toBe("/annotations");
		expect(ADMIN_PAGES.find((p) => p.path === "/annotations")?.label).toBe("Annotations");
		expect(pages["/annotations"]).toBe(Annotations);
	});
});

describe("rows", () => {
	it("lists newest first with date, kind, title, scope, target and the impact word, from one call", async () => {
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		const body = screen.getByRole("table", { name: "Annotations" });
		const cells = within(body).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0]?.textContent);
		expect(cells).toEqual(["2026-03-20", "2026-03-10", "2026-03-12", "2026-03-05", "2026-03-02"]);
		expect(within(rowOf("New hero")).getByRole("cell", { name: "Page /pricing/" })).toBeTruthy();
		expect(within(rowOf("New hero")).getByRole("cell", { name: "Bounce rate" })).toBeTruthy();
		expect(within(rowOf("Newsletter")).getByRole("cell", { name: "Visitors (default)" })).toBeTruthy();
		expect(queries("annotation_impacts")).toHaveLength(1);
		expect(queries("annotation_impacts")[0]).toMatchObject({ params: { window: 14, withSearch: true }, limit: 6 });
		expect(queries("impact")).toHaveLength(0);
	});

	it("verdicts: up, down with lower is better as good news, flat, too early as a day count, not enough data", async () => {
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		expect(impactCell("Newsletter").textContent).toBe("↑+60.0% Up, better");
		expect(impactCell("Newsletter").querySelector("[data-judge]")?.getAttribute("data-judge")).toBe("better");
		expect(impactCell("New hero").textContent).toBe("↓-20.0% Down, better");
		expect(impactCell("New hero").querySelector("[data-judge]")?.getAttribute("data-judge")).toBe("better");
		expect(impactCell("Price change").textContent).toBe("→+4.0% Flat");
		expect(impactCell("Release 5").textContent).toBe("Day 5 of 14");
		expect(impactCell("Tiny test").textContent).toBe("Not enough data");
		expect((impactCell("Newsletter").firstElementChild as HTMLElement).title).toBe("Before 100 (2026-02-24 to 2026-03-09), after 160 (2026-03-11 to 2026-03-24), 14 days each.");
	});

	it("flags an overlap with the other annotation's title and states the caution once", async () => {
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		expect(within(rowOf("New hero")).getByText("Overlaps with Price change")).toBeTruthy();
		expect(screen.getAllByText(ANNOTATIONS_TEXT.caution)).toHaveLength(1);
	});

	it("empty: two lines and an Add annotation button; filters say nothing matches", async () => {
		rows = [];
		render(<Annotations />);
		expect(await screen.findByText(ANNOTATIONS_TEXT.emptyTitle)).toBeTruthy();
		expect(screen.getByText(ANNOTATIONS_TEXT.emptyHint)).toBeTruthy();
		fireEvent.click(screen.getAllByRole("button", { name: "Add annotation" })[1] as HTMLElement);
		expect(screen.getByRole("form", { name: "New annotation" })).toBeTruthy();
		fireEvent.change(screen.getByRole("combobox", { name: "Kind" }), { target: { value: "release" } });
		expect(await screen.findByText(ANNOTATIONS_TEXT.noMatch)).toBeTruthy();
		await waitFor(() => expect(queries("annotation_impacts").at(-1)?.params).toMatchObject({ kind: "release" }));
		fireEvent.change(screen.getByRole("combobox", { name: "Scope" }), { target: { value: "query" } });
		await waitFor(() => expect(queries("annotation_impacts").at(-1)?.params).toMatchObject({ kind: "release", scopeKind: "query" }));
	});
});

describe("search", () => {
	const box = () => screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement;
	const searched = () => queries("annotation_impacts").filter((b) => b.params.q !== undefined);

	it("filters once typing pauses, sends q trimmed, keeps it in the URL and starts at the first row", async () => {
		rows = [...fixture(), ...Array.from({ length: 8 }, (_, i) => row({ key: `o${i}`, annotation: ann(`o${i}`, "2026-03-01", `Old ${i}`) as never }))];
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		fireEvent.click(screen.getByRole("button", { name: "Next" }));
		await waitFor(() => expect(queries("annotation_impacts").at(-1)?.offset).toBe(6));
		for (const v of ["n", "ne", "new", "new "]) fireEvent.change(box(), { target: { value: v } });
		// No request per keystroke: nothing is sent before the pause.
		expect(searched()).toHaveLength(0);
		await waitFor(() => expect(searched()).toHaveLength(1), { timeout: SEARCH_DEBOUNCE_MS * 8 });
		expect(searched()[0]).toMatchObject({ params: { q: "new" } });
		expect(searched()[0]?.offset ?? 0).toBe(0);
		expect(await screen.findByRole("cell", { name: /^New hero/ })).toBeTruthy();
		expect(screen.queryByRole("cell", { name: "Release 5" })).toBeNull();
		expect(new URLSearchParams(window.location.search).get("q")).toBe("new");
		// The trailing space the user typed stays in the field.
		expect(box().value).toBe("new ");
	});

	it("reads q from a shared link and the codec trims it and caps it at 100 characters", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/annotations?from=2026-03-01&to=2026-03-31&q=price");
		render(<Annotations />);
		expect(await screen.findByRole("cell", { name: "Price change" })).toBeTruthy();
		expect(box().value).toBe("price");
		expect(queries("annotation_impacts")[0]?.params.q).toBe("price");
		expect(decodeState(`?from=2026-03-01&to=2026-03-31&q=${encodeURIComponent("  a b  ")}`, "UTC").q).toBe("a b");
		expect(decodeState(`?from=2026-03-01&to=2026-03-31&q=${"x".repeat(150)}`, "UTC").q).toHaveLength(100);
		expect(decodeState("?from=2026-03-01&to=2026-03-31&q=%20", "UTC").q).toBeUndefined();
		expect(encodeState({ ...decodeState("?from=2026-03-01&to=2026-03-31", "UTC"), q: "50% off" })).toContain("q=50%25+off");
	});

	it("the x clears the search at once and drops q from the URL", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/annotations?from=2026-03-01&to=2026-03-31&q=price");
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Price change" });
		fireEvent.click(screen.getByRole("button", { name: ANNOTATIONS_TEXT.clearSearch }));
		expect(box().value).toBe("");
		expect(window.location.search).not.toContain("q=");
		expect(await screen.findByRole("cell", { name: "Release 5" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: ANNOTATIONS_TEXT.clearSearch })).toBeNull();
	});

	it("no match says so and offers to clear the search", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/annotations?from=2026-03-01&to=2026-03-31&q=zzz");
		render(<Annotations />);
		expect(await screen.findByText(ANNOTATIONS_TEXT.noSearchMatch("zzz"))).toBeTruthy();
		expect(screen.queryByText(ANNOTATIONS_TEXT.emptyTitle)).toBeNull();
		const clears = screen.getAllByRole("button", { name: ANNOTATIONS_TEXT.clearSearch });
		fireEvent.click(clears.at(-1) as HTMLElement);
		expect(await screen.findByRole("cell", { name: "Release 5" })).toBeTruthy();
		expect(window.location.search).not.toContain("q=");
	});

	it("Back to a URL with another term shows it in the field", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/annotations?from=2026-03-01&to=2026-03-31&q=price");
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Price change" });
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/annotations?from=2026-03-01&to=2026-03-31&q=hero");
		fireEvent(window, new PopStateEvent("popstate"));
		expect(await screen.findByRole("cell", { name: /^New hero/ })).toBeTruthy();
		expect(box().value).toBe("hero");
	});
});

describe("window selector", () => {
	it("sends the window, keeps it in the URL as win and as this browser's preference", async () => {
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		fireEvent.click(screen.getByRole("radio", { name: "28 days" }));
		await waitFor(() => expect(queries("annotation_impacts").at(-1)?.params.window).toBe(28));
		expect(window.location.search).toContain("win=28");
		expect(windowOf(undefined)).toBe(28);
		fireEvent.click(screen.getByRole("radio", { name: "14 days" }));
		await waitFor(() => expect(queries("annotation_impacts").at(-1)?.params.window).toBe(14));
		expect(window.location.search).not.toContain("win=");
		expect(windowOf(undefined)).toBe(14);
		expect(windowOf(7)).toBe(7);
	});

	it("the URL codec keeps a and win and drops a window that is not offered", () => {
		const s = decodeState("?from=2026-03-01&to=2026-03-31&a=b1&win=7", "UTC");
		expect(s).toMatchObject({ a: "b1", win: 7 });
		expect(encodeState(s)).toContain("a=b1");
		expect(decodeState("?from=2026-03-01&to=2026-03-31&win=60", "UTC").win).toBeUndefined();
	});
});

describe("expanded row", () => {
	it("a deep link opens the row with the full impact panel on its target, window and the KPI strip", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/annotations?from=2026-03-01&to=2026-03-31&a=b1");
		render(<Annotations />);
		const panel = await screen.findByRole("region", { name: "Impact" });
		await waitFor(() => expect(queries("impact").at(-1)?.params).toMatchObject({ annotation: "b1", context: true, window: 14, report: "overview", metric: "bounce_rate" }));
		const strip = await within(panel).findByLabelText("Same scope and windows");
		expect(within(strip).getByText("Visitors")).toBeTruthy();
		expect(within(strip).getByText("Bounce rate")).toBeTruthy();
		expect(within(strip).queryByText("Engaged rate")).toBeNull();
		// cf10: the base of the rate is named, not called "measured".
		expect(within(panel).getByText("900 sessions before, 950 after")).toBeTruthy();
		expect(within(panel).queryByText(/measured before/)).toBeNull();
		expect(within(panel).queryByRole("group", { name: "Window" })).toBeNull();
		expect(screen.getByText(ANNOTATIONS_TEXT.overlapHint, { selector: "div *" })).toBeTruthy();
		fireEvent.click(within(rowOf("New hero")).getByRole("button", { name: "Hide" }));
		await waitFor(() => expect(screen.queryByRole("region", { name: "Impact" })).toBeNull());
		expect(window.location.search).not.toContain("a=");
	});

	it("a deep link to an annotation beyond the first page opens its panel above the table", async () => {
		rows = [...fixture(), ...Array.from({ length: 8 }, (_, i) => row({ key: `o${i}`, annotation: ann(`o${i}`, "2026-03-01", `Old ${i}`) as never }))];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/annotations?from=2026-03-01&to=2026-03-31&a=o7");
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		expect(screen.queryByRole("cell", { name: "Old 7" })).toBeNull();
		await screen.findByRole("region", { name: "Impact" });
		await waitFor(() => expect(queries("impact").at(-1)?.params).toMatchObject({ annotation: "o7" }));
	});

	it("a new range starts the list at its first row", async () => {
		rows = [...fixture(), ...Array.from({ length: 8 }, (_, i) => row({ key: `o${i}`, annotation: ann(`o${i}`, "2026-03-01", `Old ${i}`) as never }))];
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		fireEvent.click(screen.getByRole("button", { name: "Next" }));
		await waitFor(() => expect(queries("annotation_impacts").at(-1)?.offset).toBe(6));
		fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-20" } });
		await waitFor(() => expect(queries("annotation_impacts").at(-1)?.query.to).toBe("2026-03-20"));
		expect(queries("annotation_impacts").at(-1)?.offset).toBe(0);
	});

	it("the marker action of every chart links to the row", () => {
		render(<>{annotationAction({ id: "b1" })}</>);
		expect(screen.getByRole("link", { name: "Open in Annotations" }).getAttribute("href")).toBe("/_emdash/admin/plugins/cookieless-analytics/annotations?a=b1");
		expect(annotationAction({})).toBeNull();
	});
});

describe("editor and target", () => {
	const optgroups = () => [...(screen.getByRole("combobox", { name: "Target KPI" }) as HTMLSelectElement).querySelectorAll("optgroup")].map((g) => g.label);

	it("offers Search targets only while Search is connected", async () => {
		usable = false;
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		fireEvent.click(screen.getByRole("button", { name: "Add annotation" }));
		expect(optgroups()).not.toContain("Search");
		expect(optgroups()).toEqual(expect.arrayContaining(["Traffic", "Goals", "Events", "Revenue", "Channels", "Pages"]));
		// Engaged rate left the default views but stays a target, so saved annotations keep theirs.
		const traffic = (screen.getByRole("combobox", { name: "Target KPI" }) as HTMLSelectElement).querySelector('optgroup[label="Traffic"]');
		expect([...(traffic?.querySelectorAll("option") ?? [])].map((o) => o.textContent)).toEqual(expect.arrayContaining(["Bounce rate", "Engaged rate"]));
	});

	it("shows Search targets with a connected source", async () => {
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		await waitFor(() => expect(calls.some((c) => c.route === "search/status")).toBe(true));
		fireEvent.click(screen.getByRole("button", { name: "Add annotation" }));
		await waitFor(() => expect(optgroups()).toContain("Search"));
	});

	it("saves a goal target by id after a goal is chosen by name; no goal blocks Save with the reason", async () => {
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		fireEvent.click(screen.getByRole("button", { name: "Add annotation" }));
		const form = screen.getByRole("form", { name: "New annotation" });
		fireEvent.change(within(form).getByLabelText("Text"), { target: { value: "Launch" } });
		fireEvent.change(within(form).getByRole("combobox", { name: "Target KPI" }), { target: { value: "goals:completions" } });
		expect(within(form).getByRole("alert").textContent).toBe("Pick a goal.");
		expect(within(form).getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
		await within(form).findByRole("option", { name: "Signup" });
		fireEvent.change(within(form).getByLabelText(/^Goal/), { target: { value: "g1" } });
		fireEvent.click(within(form).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(saved).toHaveLength(1));
		expect(saved[0]?.data).toMatchObject({ kind: "manual", text: "Launch", target: { report: "goals", metric: "completions", params: { goal: "g1" } } });
	});

	it("edit keeps the hook fields and the scope, and the default target saves no target", async () => {
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		fireEvent.click(within(rowOf("Price change")).getByRole("button", { name: "Edit" }));
		const form = screen.getByRole("form", { name: "Edit annotation" });
		fireEvent.change(within(form).getByLabelText("Text"), { target: { value: "Price change 2" } });
		fireEvent.click(within(form).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(saved).toHaveLength(1));
		expect(saved[0]).toMatchObject({ id: "f1", data: { kind: "publish", text: "Price change 2", slug: "price", collection: "posts" } });
		expect(saved[0]?.data.target).toBeUndefined();
	});

	it("an unchanged target keeps its extra params", () => {
		expect(draftTarget({ choice: "search_overview:clicks", key: "", source: { source: "google" } })).toEqual({ report: "search_overview", metric: "clicks", params: { source: "google" } });
		expect(draftTarget({ choice: "", key: "" })).toBeUndefined();
	});

	it("the scope editor writes a page scope and shows the preview", async () => {
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		fireEvent.click(screen.getByRole("button", { name: "Add annotation" }));
		const form = screen.getByRole("form", { name: "New annotation" });
		fireEvent.change(within(form).getByLabelText("Text"), { target: { value: "Page note" } });
		fireEvent.click(within(form).getByLabelText("This page"));
		fireEvent.change(within(form).getByLabelText("Page path"), { target: { value: "/blog/a" } });
		expect(within(form).getByTestId("scope-summary").textContent).toBe("Page /blog/a");
		expect(await within(form).findByRole("status", { name: "Scope preview" }, { timeout: 2000 })).toBeTruthy();
		fireEvent.click(within(form).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(saved).toHaveLength(1));
		expect(saved[0]?.data.scope).toEqual({ v: 1, path: [{ op: "is", value: "/blog/a" }] });
	});

	it("an empty This page scope keeps Save closed instead of saving site-wide", async () => {
		render(<Annotations />);
		await screen.findByRole("cell", { name: "Release 5" });
		fireEvent.click(screen.getByRole("button", { name: "Add annotation" }));
		const form = screen.getByRole("form", { name: "New annotation" });
		fireEvent.change(within(form).getByLabelText("Text"), { target: { value: "Page note" } });
		const save = within(form).getByRole("button", { name: "Save" });
		expect(save).toHaveProperty("disabled", false);
		fireEvent.click(within(form).getByLabelText("This page"));
		expect(save).toHaveProperty("disabled", true);
		fireEvent.change(within(form).getByLabelText("Page path"), { target: { value: "/blog/a" } });
		expect(save).toHaveProperty("disabled", false);
	});
});
