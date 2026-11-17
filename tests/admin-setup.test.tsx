// @vitest-environment jsdom
/** Setup prompts: an empty view whose definition is missing links to the Definitions tab that creates it. */
import { readdirSync, readFileSync } from "node:fs";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Overview from "../src/admin/pages/Overview.js";
import Behaviour from "../src/admin/pages/Behaviour.js";
import Config from "../src/admin/pages/Config.js";
import { TileView, tileSetup } from "../src/admin/pages/Dashboards.js";
import { resetDefinitionCounts, resetSearchStatus } from "../src/admin/api.js";
import { decodeState } from "../src/admin/state.js";
import { SETUP_COPY } from "../src/admin/setup.js";
import { FORBIDDEN_PUBLIC_WORDS } from "../src/contract.js";
import type { View } from "../src/admin/components/Header.js";
import type { Tile } from "../src/dashboards/schema.js";

type Body = { report?: string; query?: Record<string, unknown>; [k: string]: unknown };
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const refused = () => new Response(JSON.stringify({ success: false, error: { code: "forbidden", message: "Not allowed." } }), { status: 403, headers: { "content-type": "application/json" } });

/** Config lists by kind; goals, funnels or segments missing here answer 403 (a user without `plugins:manage`). */
let lists: Record<string, unknown[]> = {};
let goalRows: unknown[] = [];
let funnelRows: unknown[] = [];
const totals = { visitors: 12, sessions: 15, pageviews: 40 };

beforeEach(() => {
	lists = { goals: [], funnels: [], segments: [] };
	goalRows = [];
	funnelRows = [];
	resetSearchStatus();
	resetDefinitionCounts();
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/?from=2026-03-01&to=2026-03-02");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/").slice(-2).join("/");
			const kind = url.split("/").slice(-2)[0] ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, timezone: "UTC" }] });
			if (route === "search/status") return ok({ sources: [] });
			if (route.endsWith("/list")) return lists[kind] || !["goals", "funnels", "segments"].includes(kind) ? ok({ items: lists[kind] ?? [] }) : refused();
			if (route === "data/query") {
				const base = { report: body.report, range: { from: "2026-03-01", to: "2026-03-02" }, compare: "none", compareRange: null, notices: [] };
				if (body.report === "overview") return ok({ ...base, data: { totals, compareTotals: null } });
				if (body.report === "timeseries") return ok({ ...base, data: { granularity: "day", series: [{ t: "2026-03-01", ...totals }] } });
				if (body.report === "revenue") return ok({ ...base, data: { hasRevenue: false } });
				if (body.report === "goals") return ok({ ...base, data: { rows: goalRows, total_sessions: 15 } });
				if (body.report === "funnels") return ok({ ...base, data: { rows: funnelRows } });
				return ok({ ...base, data: { rows: [{ key: "x", visitors: 1, sessions: 1 }] } });
			}
			return ok({ items: [] });
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const goalsPanel = async (c: HTMLElement) => {
	await waitFor(() => expect(c.querySelector('[data-report="goals"]')).not.toBeNull());
	return c.querySelector<HTMLElement>('[data-report="goals"]') as HTMLElement;
};

describe("setup copy", () => {
	it("every setup prompt has a title, one sentence, a button label and a link, without dashes", () => {
		const dashes = [0x2013, 0x2014].map((c) => String.fromCharCode(c));
		for (const [kind, c] of Object.entries(SETUP_COPY)) {
			for (const t of [c.title, c.text, c.label]) {
				expect(t.trim().length, kind).toBeGreaterThan(3);
				expect(dashes.some((d) => t.includes(d)), `${kind}: ${t}`).toBe(false);
				for (const w of FORBIDDEN_PUBLIC_WORDS) expect(t.toLowerCase().includes(w), `${kind}: ${w}`).toBe(false);
			}
			expect(c.text.endsWith("."), kind).toBe(true);
			expect(c.href, kind).toMatch(/^(\/_emdash\/admin\/plugins\/|https:\/\/github\.com\/)/);
		}
		for (const kind of ["goals", "funnels", "segments"] as const) expect(SETUP_COPY[kind].href).toMatch(new RegExp(`/config\\?tab=${kind}&new=1$`));
	});
});

describe("goals", () => {
	it("with no goals the Overview Goals card offers Create a goal, a real link to the Goals tab", async () => {
		const { container } = render(<Overview />);
		const panel = await goalsPanel(container);
		const link = await within(panel).findByRole("link", { name: "Create a goal" });
		expect(link.tagName).toBe("A");
		expect(link.getAttribute("href")).toBe("/_emdash/admin/plugins/cookieless-analytics/config?tab=goals&new=1");
		expect(within(panel).getByText(SETUP_COPY.goals.text)).toBeTruthy();
		// Keyboard: a link is in the tab order and Enter follows it natively.
		expect(link.getAttribute("tabindex")).not.toBe("-1");
		link.focus();
		expect(document.activeElement).toBe(link);
	});

	it("with goals but no data the card keeps the plain empty message", async () => {
		lists.goals = [{ id: "g1", data: { name: "Signup", type: "page", match: "is", value: "/thanks", active: false } }];
		const { container } = render(<Overview />);
		const panel = await goalsPanel(container);
		await within(panel).findByText("No data for this range and these filters.");
		expect(within(panel).queryByRole("link", { name: "Create a goal" })).toBeNull();
	});

	it("a user who cannot list definitions sees no button", async () => {
		delete lists.goals;
		const { container } = render(<Overview />);
		const panel = await goalsPanel(container);
		await within(panel).findByText("No data for this range and these filters.");
		expect(within(panel).queryByRole("link", { name: "Create a goal" })).toBeNull();
	});

	it("the Behaviour Goals tab shows the same prompt", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/behaviour?from=2026-03-01&to=2026-03-02&tab=goals");
		const { findByRole } = render(<Behaviour />);
		expect((await findByRole("link", { name: "Create a goal" })).getAttribute("href")).toMatch(/tab=goals&new=1$/);
	});

	it("the link opens Definitions on the Goals tab with the New goal form, once", async () => {
		window.history.replaceState(null, "", `${SETUP_COPY.goals.href}&from=2026-03-01&to=2026-03-02`);
		const { findByRole } = render(<Config />);
		expect((await findByRole("tab", { name: "Goals" })).getAttribute("aria-selected")).toBe("true");
		expect(await findByRole("form", { name: "New goal" })).toBeTruthy();
		await waitFor(() => expect(new URLSearchParams(window.location.search).has("new")).toBe(false));
		expect(decodeState(window.location.search, "UTC").tab).toBe("goals");
	});
});

describe("funnels", () => {
	it("with no funnels the tab offers Create a funnel", async () => {
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/behaviour?from=2026-03-01&to=2026-03-02&tab=funnels");
		const { findByRole } = render(<Behaviour />);
		expect((await findByRole("link", { name: "Create a funnel" })).getAttribute("href")).toMatch(/tab=funnels&new=1$/);
	});

	it("with a funnel but no data the tab keeps the plain empty message", async () => {
		lists.funnels = [{ id: "f1", data: { name: "Checkout", mode: "sequential" } }];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/behaviour?from=2026-03-01&to=2026-03-02&tab=funnels");
		const { findByText, queryByRole } = render(<Behaviour />);
		await findByText("No data for this range and these filters.");
		expect(queryByRole("link", { name: "Create a funnel" })).toBeNull();
	});

	it("the link opens the New funnel form", async () => {
		window.history.replaceState(null, "", `${SETUP_COPY.funnels.href}&from=2026-03-01&to=2026-03-02`);
		const { findByRole } = render(<Config />);
		expect((await findByRole("tab", { name: "Funnels" })).getAttribute("aria-selected")).toBe("true");
		expect(await findByRole("form", { name: "New funnel" })).toBeTruthy();
	});
});

describe("segments", () => {
	it("with no segments the header offers Create a segment", async () => {
		const { findByRole, queryByRole } = render(<Overview />);
		expect((await findByRole("link", { name: "Create a segment" })).getAttribute("href")).toMatch(/tab=segments&new=1$/);
		expect(queryByRole("combobox", { name: "Segment" })).toBeNull();
	});

	it("with segments the picker shows and the prompt does not", async () => {
		lists.segments = [{ id: "s1", data: { name: "Mobile", filters: [] } }];
		const { findByRole, queryByRole } = render(<Overview />);
		expect(await findByRole("combobox", { name: "Segment" })).toBeTruthy();
		expect(queryByRole("link", { name: "Create a segment" })).toBeNull();
	});

	it("without permission to list segments there is no prompt", async () => {
		delete lists.segments;
		const { container, queryByRole } = render(<Overview />);
		await goalsPanel(container);
		expect(queryByRole("link", { name: "Create a segment" })).toBeNull();
	});

	it("the link opens the New segment form", async () => {
		window.history.replaceState(null, "", `${SETUP_COPY.segments.href}&from=2026-03-01&to=2026-03-02`);
		const { findByRole } = render(<Config />);
		expect(await findByRole("form", { name: "New segment" })).toBeTruthy();
	});

	it("switching tabs after the link does not open another form", async () => {
		window.history.replaceState(null, "", `${SETUP_COPY.goals.href}&from=2026-03-01&to=2026-03-02`);
		const { findByRole, queryByRole } = render(<Config />);
		await findByRole("form", { name: "New goal" });
		fireEvent.click(await findByRole("tab", { name: "Funnels" }));
		await findByRole("button", { name: "New funnel" });
		expect(queryByRole("form", { name: "New funnel" })).toBeNull();
	});
});

describe("dashboard tiles", () => {
	const kpi: Tile = { id: "abc123", report: "goals", kind: "kpi", metric: "converting", w: 1, params: { goal: "g1" } } as Tile;
	const funnel: Tile = { id: "abc124", report: "funnels", kind: "table", w: 2, params: { funnel: "f1" } } as Tile;
	const goalsTable: Tile = { id: "abc125", report: "goals", kind: "table", w: 2 } as Tile;

	it("tileSetup names a removed goal or funnel and a goals breakdown without goals; unknown lists never prompt", () => {
		const none = new Map<string, string>();
		const some = new Map([["g1", "Signup"], ["f1", "Checkout"]]);
		expect(tileSetup(kpi, { goals: none, funnels: none })).toBe("goal-removed");
		expect(tileSetup(kpi, { goals: some, funnels: none })).toBeNull();
		expect(tileSetup(funnel, { goals: none, funnels: none })).toBe("funnel-removed");
		expect(tileSetup(funnel, { goals: none, funnels: some })).toBeNull();
		expect(tileSetup(goalsTable, { goals: none, funnels: none })).toBe("goals");
		expect(tileSetup(goalsTable, { goals: some, funnels: none })).toBeNull();
		expect(tileSetup(kpi, { goals: null, funnels: null })).toBeNull();
		expect(tileSetup(funnel, { goals: null, funnels: null })).toBeNull();
	});

	it("a tile of a removed goal shows Definition removed with a link to the Goals tab, not an error", async () => {
		const view = { state: decodeState("?from=2026-03-01&to=2026-03-02", "UTC"), update: () => {}, site: { id: "main", label: "This site", local: true, timezone: "UTC" }, sites: [], tz: "UTC" } as unknown as View;
		const { findByText, getByRole, queryByRole } = render(<TileView tile={kpi} view={view} filters={[]} refs={{ goals: new Map(), funnels: new Map() }} searchOff={false} />);
		await findByText("Definition removed.");
		expect(getByRole("link", { name: "Open Goals" }).getAttribute("href")).toMatch(/\/config\?tab=goals$/);
		expect(queryByRole("alert")).toBeNull();
	});
});

describe("source scan", () => {
	/**
	 * Every view that reads a definition, with the marker of its setup prompt. A new goals panel (`report="goals"`)
	 * without `setup=` fails below until it opts in and is listed here.
	 */
	const OPTED_IN: Record<string, readonly string[]> = {
		"src/admin/pages/Overview.tsx": ['setup="goals"'],
		"src/admin/pages/Behaviour.tsx": ['setup="goals"', '<SetupEmpty kind="funnels" />'],
		"src/admin/pages/Revenue.tsx": ['setup: "goals"'],
		"src/admin/pages/Links.tsx": ['setup="links"'],
		"src/admin/pages/Dashboards.tsx": ["<SetupEmpty kind={setup} />", 'SETUP_COPY["segment-removed"]'],
		"src/admin/components/Header.tsx": ["SETUP_COPY.segments"],
	};
	const read = (f: string) => readFileSync(f, "utf8");
	const files = ["src/admin/pages", "src/admin/components"].flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".tsx")).map((f) => `${d}/${f}`));

	it("each listed view carries its setup prompt", () => {
		for (const [f, markers] of Object.entries(OPTED_IN)) for (const m of markers) expect(read(f).includes(m), `${f}: ${m}`).toBe(true);
	});

	it("every goals panel opts in and every view that lists goals, funnels or segments is listed", () => {
		for (const f of files) {
			const src = read(f);
			for (const m of src.matchAll(/<ReportPanel\b[\s\S]*?\/>/g)) if (/report="goals"/.test(m[0])) expect(m[0].includes("setup="), `${f}: goals panel without setup`).toBe(true);
			const readsDefinitions = /listFunnels\(|listSegments\(|listConfig<[^>]*>\("goals"\)|dim === "goal"/.test(src);
			if (readsDefinitions && !/Config\.tsx$|Annotations\.tsx$/.test(f)) expect(Object.keys(OPTED_IN), `${f} reads definitions`).toContain(f);
		}
	});

	it("the shared dashboard page (plain HTML) has no setup button", () => {
		for (const f of ["src/routes/share-view.ts", "src/dashboards/render.ts"]) {
			let src = "";
			try {
				src = read(f);
			} catch {
				continue;
			}
			expect(src.includes("setup"), f).toBe(false);
			for (const c of Object.values(SETUP_COPY)) expect(src.includes(c.label), `${f}: ${c.label}`).toBe(false);
		}
	});
});
