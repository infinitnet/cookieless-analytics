// @vitest-environment jsdom
/** Data page: storage and retention with banners, export, delete with typed confirmation, crawler log, connected site notice. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pages } from "../src/admin/index.js";
import { CAVEATS } from "../src/admin/components/ui.js";
import Data, { CAPACITY_TEXT, DROP_LABELS, WRITES_NOTICE } from "../src/admin/pages/Data.js";
import { deleteCostText } from "../src/admin/pages/DataDelete.js";
import { factsDb, setPluginFacts } from "../src/db/facts.js";
import { KV_WATERMARK } from "../src/query/rollup.js";
import { KV_CURSOR } from "../src/query/retention.js";
import { KV_WRITE_BUDGET } from "../src/query/storage.js";
import { privacyRoute } from "../src/routes/privacy.js";
import { KV_PLATFORM_LIMIT } from "../src/routes/in.js";
import { DeleteAllBody, EmptyBody, RevenueVoidBody, RollupNowBody, type ToolsCtx, toolRoutes } from "../src/routes/tools.js";
import { normalizeSettings } from "../src/settings.js";
import { MemoryKv, schemaDb } from "./helpers.js";

type Body = Record<string, unknown>;
let calls: Array<{ route: string; body: Body }> = [];
let sites: unknown[] = [];
/** `tools/delete-run` answers 503 this many times. */
let failRuns = 0;
let settings = normalizeSettings({});
let kv = new MemoryKv();
let env: Awaited<ReturnType<typeof schemaDb>>;
let deleteAnswers: Array<{ deleted: Record<string, number>; done: boolean }> = [];
let dbBroken = false;
let purgeDone = true;
let hasRevenue = false;
let ingest: unknown;

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { code: "ERR", message } }), { status, headers: { "content-type": "application/json" } });

async function handle(route: string, body: Body): Promise<Response> {
	if (route === "sites/list") return ok({ sites });
	if (route === "config/segments/list") return ok({ items: [] });
	if (route === "privacy/receipt") {
		const db = dbBroken ? { ...env.db, all: () => Promise.reject(new Error("D1 binding missing")) } : env.db;
		try {
			const receipt = await privacyRoute({ db: async () => db, settings: async () => settings, now: () => 1_772_000_000 }).handler({ kv });
			return ok(ingest ? { ...receipt, ingest } : receipt);
		} catch (e) {
			return fail(503, (e as Error).message);
		}
	}
	// Bodies are checked with the real route schemas, as the host does before calling the handler.
	const valid = (schema: { safeParse(v: unknown): { success: boolean } }) => schema.safeParse(body).success;
	if (route === "tools/purge") return valid(EmptyBody) ? ok({ done: purgeDone }) : fail(400, "Invalid request body");
	if (route === "tools/rollup-now") return valid(RollupNowBody) ? ok({ watermark: "2026-03-06" }) : fail(400, "Invalid request body");
	if (route === "tools/delete-all") return valid(DeleteAllBody) ? ok(deleteAnswers.shift()) : fail(400, "Invalid request body");
	if (route === "tools/delete-run" && failRuns > 0) {
		failRuns--;
		return fail(503, "Service unavailable");
	}
	if (route.startsWith("tools/delete-") && route !== "tools/delete-all") {
		// The real filtered delete routes over the test database; the host checks the body schema first.
		const r = toolRoutes({ db: async () => env.db, settings: async () => settings, agentRules: async () => [], channelRules: async () => [], goals: async () => [], now: () => 1_772_000_000 });
		const def = r[route as keyof typeof r];
		if (!def || !def.input.safeParse(body).success) return fail(400, "Invalid request body");
		try {
			return ok(await def.handler({ input: body, kv, user: { email: "owner@example.com" } } as ToolsCtx));
		} catch (e) {
			return fail(400, (e as Error).message);
		}
	}
	if (route === "tools/revenue-void") return valid(RevenueVoidBody) ? ok({ site: "main", day: body.day, matched: 1, voided: body.confirm ? 1 : 0 }) : fail(400, "Invalid request body");
	if (route === "data/query" && body.report === "revenue") return ok({ report: "revenue", notices: [], data: { currency: "USD", hasRevenue, currencies: [], totals: {} } });
	if (route === "data/export") return new Response("key,visitors\n/a,1\n", { status: 200, headers: { "content-disposition": 'attachment; filename="pages.csv"' } });
	if (route === "data/query")
		return ok({
			report: body.report,
			notices: [],
			data: { rows: [{ key: "gptbot", category: "ai_training", hits: 40, errors_4xx: 3, errors_5xx: 1, last_seen: 1_772_000_000 }], paths: [{ path: "/robots-only", hits: 12 }], notices: [] },
		});
	return fail(404, "No route");
}

beforeEach(async () => {
	calls = [];
	settings = normalizeSettings({});
	kv = new MemoryKv();
	env = await schemaDb();
	deleteAnswers = [];
	dbBroken = false;
	purgeDone = true;
	hasRevenue = false;
	ingest = undefined;
	sites = [{ id: "main", label: "This site", local: true, timezone: "UTC" }];
	failRuns = 0;
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/data?from=2026-03-01&to=2026-03-07");
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
			const body = JSON.parse(String(init.body ?? "{}")) as Body;
			calls.push({ route, body });
			return handle(route, body);
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const routeCalls = (route: string) => calls.filter((c) => c.route === route).map((c) => c.body);
/** The value of one line of the capacity panel. */
const fact = async (term: string) => (await screen.findByText(term, { selector: "dt" })).nextElementSibling?.textContent;
const drop = (day: number, reason: string, n: number) => env.raw.prepare("INSERT INTO ca_drops (site, day, reason, n) VALUES ('default', ?, ?, ?)").run(day, reason, n);
const tabNames = () => screen.getAllByRole("tab").map((t) => t.textContent);

async function openTab(name: string) {
	// The tab lives in the URL: start each render on the first tab.
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/data");
	render(<Data />);
	await screen.findByText(/self-check passed|self-check failed/);
	fireEvent.click(screen.getByRole("tab", { name }));
	return screen.getByRole("tabpanel", { name });
}

describe("Data page", () => {
	it("is registered as /data", () => {
		expect(pages["/data"]).toBe(Data);
	});

	it("storage: database line, table rows and retention; the crawler tab only when the log is on", async () => {
		render(<Data />);
		await screen.findByText(`Database self-check passed (${env.db.dialect}).`);
		expect(await fact("Database")).toBe(`The CMS database, ${env.db.dialect}. Set with the plugin options in astro.config (read only here).`);
		expect(await fact("Capacity profile")).toBe("Standard");
		expect(await fact("Write guard")).toBe("Off: only the Small profile has a daily write guard.");
		expect(await fact("Detailed data")).toBe("760 days; older days are answered from daily summaries.");
		expect(screen.getByText("Nothing in the last 7 days.")).toBeTruthy();
		expect(tabNames()).toEqual(["Storage and retention", "Export", "Privacy receipt", "Delete"]);
		const table = screen.getByRole("table", { name: "Storage" });
		// What a table holds leads; its name is the small note under it, counts are right aligned with separators.
		const row = within(table).getByText("ca_srv").closest("tr") as HTMLElement;
		expect(within(row).getAllByRole("cell").map((c) => c.textContent).slice(1)).toEqual(["0", "760 days"]);
		expect(within(row).getAllByRole("cell")[1]?.className).toBe("ca-num");
		expect(screen.getByText(/^Retention removes detailed visits older than 760 days now/)).toBeTruthy();
		expect(screen.queryByText(/would not fit/)).toBeNull();
	});

	it("storage: the ingest tier line, and a hint when a queue binding is unused", async () => {
		render(<Data />);
		// No `cloudflare:workers` module under Node: direct, no hint.
		expect(await fact("Ingest")).toBe("Direct to the database.");
		cleanup();
		ingest = { tier: "direct", queueBound: true };
		render(<Data />);
		expect(await fact("Ingest")).toBe("Direct to the database. A queue binding (CA_QUEUE) is available: choose the queue tier in the settings to use it.");
		cleanup();
		ingest = { tier: "queue", queueBound: true };
		render(<Data />);
		expect(await fact("Ingest")).toBe("Queue tier, written by the consumer Worker.");
	});

	it("storage: bytes used against the profile budget, a notice at 85 percent and when the window was shortened", async () => {
		settings = normalizeSettings({ capacityProfile: "small" });
		const storage = { profile: "small", budget: 300e6, bytes: 262e6, detail: 222e6, summary: 40e6, rawDays: 12, capped: true };
		await kv.set(KV_CURSOR, { day: "2026-03-07", step: 6, rawDays: 12, capped: true, storage, deleted: {} });
		render(<Data />);
		expect(await fact("Storage")).toBe("About 262 MB of 300 MB (detailed visits 222 MB, summaries 40 MB), estimated once a day.");
		expect(await fact("Capacity profile")).toBe("Small (Workers Free), storage budget 300 MB");
		expect(await fact("Detailed data")).toBe("12 days of the 760 set; older days are answered from daily summaries.");
		expect(screen.getByText("Storage is at 87 percent of the budget of the capacity profile.")).toBeTruthy();
		expect(screen.getByText(CAPACITY_TEXT.shortened(12))).toBeTruthy();
		expect(CAPACITY_TEXT.shortened(12)).toBe(
			"Detailed data is kept for 12 days because the storage limit of this profile is reached. Older days are available as summaries. To keep more: give these tables their own database, or raise the profile.",
		);
	});

	it("storage: a neutral notice while the small profile's daily writes are blocked, none before or on another day", async () => {
		settings = normalizeSettings({ capacityProfile: "small" });
		const state = { day: "2026-02-25", at: 1_771_999_000, pageviews: 21_200, rows: 85_180, limit: 85_000, blocked: true };
		await kv.set(KV_WRITE_BUDGET, state);
		render(<Data />);
		const notice = await screen.findByText(WRITES_NOTICE);
		expect(WRITES_NOTICE).toBe("The daily write allowance of the small profile is nearly used. Recording resumes at the next UTC day.");
		expect(notice.closest("[data-tone]")?.getAttribute("data-tone")).toBe("info");
		expect(await fact("Write guard")).toBe("Recording paused until 00:00 UTC; about 85,180 of 85,000 rows written today (estimate).");
		cleanup();
		for (const s of [{ ...state, blocked: false }, { ...state, day: "2026-02-24" }]) {
			await kv.set(KV_WRITE_BUDGET, s);
			render(<Data />);
			await screen.findByText(/self-check passed/);
			expect(screen.queryByText(WRITES_NOTICE)).toBeNull();
			cleanup();
		}
	});

	it("storage: no notice below 85 percent", async () => {
		const storage = { profile: "standard", budget: 6e9, bytes: 4.8e9, detail: 4e9, summary: 0.8e9, rawDays: 760, capped: false };
		await kv.set(KV_CURSOR, { day: "2026-03-07", step: 0, rawDays: 760, capped: false, storage, deleted: {} });
		render(<Data />);
		expect(await fact("Storage")).toBe("About 4.8 GB of 6.0 GB (detailed visits 4.0 GB, summaries 800 MB), estimated once a day.");
		expect(screen.queryByText(/percent of the budget/)).toBeNull();
		expect(screen.queryByText(/would not fit/)).toBeNull();
	});

	it("capacity: drops by reason from ca_drops, the overload banner and the queue hint, today against 7 days", async () => {
		drop(20260225, "overload", 1200);
		drop(20260222, "overload", 30);
		drop(20260225, "bot", 40);
		drop(20260210, "invalid", 9);
		render(<Data />);
		const table = await screen.findByRole("table", { name: "Not recorded" });
		// The same bordered, rounded box as every other table.
		expect(table.parentElement?.className).toBe("ca-table-scroll");
		expect(within(table).getAllByRole("row").map((r) => [...r.querySelectorAll("td, th")].map((c) => c.textContent))).toEqual([
			["Reason", "Today", "Last 7 days"],
			[DROP_LABELS.bot, "40", "40"],
			[DROP_LABELS.overload, "1,200", "1,230"],
		]);
		expect(screen.getByText(CAPACITY_TEXT.overload(1200)).closest("[data-tone]")?.getAttribute("data-tone")).toBe("warning");
		expect(screen.getByText(CAPACITY_TEXT.queueHint)).toBeTruthy();
		// One "Needs attention" panel, one line per item, the most severe first; the full text behind each line.
		const items = [...screen.getByRole("region", { name: "Needs attention" }).querySelectorAll("li")];
		expect(items.map((li) => li.getAttribute("data-tone"))).toEqual(["warning", "info"]);
		expect(within(items[0] as HTMLElement).getByRole("button", { name: "1,200 events were not stored today." }).getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText(CAPACITY_TEXT.free)).toBeNull();
		cleanup();
		// On the queue tier the hint is gone; yesterday's overload alone is no banner.
		ingest = { tier: "queue", queueBound: true };
		env.raw.prepare("DELETE FROM ca_drops WHERE day = 20260225").run();
		render(<Data />);
		await screen.findByRole("table", { name: "Not recorded" });
		expect(screen.queryByText(CAPACITY_TEXT.queueHint)).toBeNull();
		expect(screen.queryByText(/could not be stored today/)).toBeNull();
	});

	it("capacity: the Free plan hint after a daily limit error, unless the profile is Small", async () => {
		drop(20260224, "daily_limit", 3);
		render(<Data />);
		const hint = await screen.findByText(CAPACITY_TEXT.free);
		expect(CAPACITY_TEXT.free).toBe("This install appears to run on the Workers Free plan. Choose the Small capacity profile.");
		expect(within(hint.closest("[data-tone]") as HTMLElement).getByRole("link", { name: "Open plugin settings" })).toBeTruthy();
		cleanup();
		settings = normalizeSettings({ capacityProfile: "small" });
		render(<Data />);
		await screen.findByRole("table", { name: "Not recorded" });
		expect(screen.queryByText(CAPACITY_TEXT.free)).toBeNull();
	});

	it("capacity: the Free plan hint after a background run hit the request limit; an overload alone is no Free sign", async () => {
		drop(20260224, "bot", 1);
		await kv.set(KV_PLATFORM_LIMIT, { at: 1_772_000_000_000 - 3_600_000, task: "rollup", kind: "overload" });
		render(<Data />);
		await screen.findByRole("table", { name: "Not recorded" });
		expect(screen.queryByText(CAPACITY_TEXT.free)).toBeNull();
		cleanup();
		await kv.set(KV_PLATFORM_LIMIT, { at: 1_772_000_000_000 - 3_600_000, task: "rollup", kind: "requests" });
		render(<Data />);
		expect(await screen.findByText(CAPACITY_TEXT.free)).toBeTruthy();
		cleanup();
		// Older than 7 days: gone.
		await kv.set(KV_PLATFORM_LIMIT, { at: 1_772_000_000_000 - 8 * 86_400_000, task: "rollup", kind: "requests" });
		render(<Data />);
		await screen.findByRole("table", { name: "Not recorded" });
		expect(screen.queryByText(CAPACITY_TEXT.free)).toBeNull();
	});

	it("capacity: catching up while the summaries are more than a day behind", async () => {
		await kv.set(KV_WATERMARK, "2026-02-20");
		render(<Data />);
		expect(await screen.findByText(CAPACITY_TEXT.catchingUp("2026-02-20"))).toBeTruthy();
		expect(await fact("Daily summaries")).toBe("Stored through 2026-02-20; today and open days are computed when read.");
		cleanup();
		await kv.set(KV_WATERMARK, "2026-02-23");
		render(<Data />);
		await screen.findByText(/self-check passed/);
		expect(screen.queryByText(/^Daily summaries are stored through/)).toBeNull();
	});

	it("capacity: an own D1 database shows its binding and the size D1 reports", async () => {
		const db = Object.assign(Object.create(env.db) as typeof env.db, { meta: { size_after: 1.25e9 } });
		setPluginFacts(factsDb({ binding: "CA_DB" }, async () => env.db, async () => ({ CA_DB: {} })));
		const receipt = await privacyRoute({ db: async () => db, settings: async () => settings, now: () => 1_772_000_000 }).handler({ kv });
		expect(receipt.capacity).toMatchObject({ profile: "standard", database: "CA_DB", sizeAfter: 1.25e9, today: "2026-02-25" });
		setPluginFacts(undefined as never);
	});

	it("storage: a failed self-check shows the route error instead of the tables", async () => {
		dbBroken = true;
		render(<Data />);
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe("The database self-check failed: D1 binding missing");
		expect(screen.getByText("Storage details are not available.")).toBeTruthy();
	});

	it("storage: retention and rollup buttons call the tools and reload the receipt", async () => {
		const panel = await openTab("Storage and retention");
		fireEvent.click(within(panel).getByRole("button", { name: "Run retention now" }));
		await within(panel).findByText("Retention ran; old rows were deleted.");
		fireEvent.click(within(panel).getByRole("button", { name: "Store daily summaries now" }));
		await within(panel).findByText("Closed days that were not stored yet are now stored as daily summaries.");
		expect(routeCalls("tools/purge")).toHaveLength(1);
		expect(routeCalls("tools/rollup-now")).toHaveLength(1);
		await waitFor(() => expect(routeCalls("privacy/receipt").length).toBeGreaterThanOrEqual(3));
		purgeDone = false;
		fireEvent.click(within(panel).getByRole("button", { name: "Run retention now" }));
		await within(panel).findByText("Retention deleted a batch of old rows; run it again to continue.");
	});

	it("header: site select only on the page; the Export tab, which reads range and filters, brings the full header", async () => {
		await openTab("Storage and retention");
		expect(document.querySelector(".ca-header")).toBeNull();
		fireEvent.click(screen.getByRole("tab", { name: "Export" }));
		await waitFor(() => expect(document.querySelector(".ca-header .ca-daterange")).not.toBeNull());
		fireEvent.click(screen.getByRole("tab", { name: "Delete" }));
		await waitFor(() => expect(document.querySelector(".ca-header")).toBeNull());
	});

	it("export: the selected report with the header range in the chosen format", async () => {
		const createObjectURL = vi.fn(() => "blob:x");
		vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
		const clicks = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		const panel = await openTab("Export");
		// A panel like the Storage tab, with small buttons like the rest of the admin.
		expect(within(panel).getByRole("region", { name: "Export" }).className).toBe("ca-panel");
		fireEvent.change(within(panel).getByLabelText("Report"), { target: { value: "channels" } });
		fireEvent.click(within(panel).getByRole("button", { name: "Download CSV" }));
		await waitFor(() => expect(clicks).toHaveBeenCalled());
		expect(routeCalls("data/export")).toEqual([{ report: "channels", query: { from: "2026-03-01", to: "2026-03-07", filters: [], compare: "none", site: "main" }, format: "csv" }]);
		clicks.mockRestore();
	});

	it("delete: needs the typed confirmation, then repeats until done", async () => {
		deleteAnswers = [
			{ deleted: { hits: 40000, sessions: 0 }, done: false },
			{ deleted: { hits: 12, sessions: 300, rollup: 5 }, done: true },
		];
		const panel = await openTab("Delete");
		const button = within(panel).getByRole("button", { name: "Delete all data" });
		expect(button).toHaveProperty("disabled", true);
		const input = within(panel).getByLabelText("Type DELETE to confirm");
		// A form like the others on the tab, so its label has the same form size (one label size per tab).
		expect([...panel.querySelectorAll("form, [role=group]")].filter((f) => f.querySelector(".ca-field-label")).map((f) => f.classList.contains("ca-form"))).not.toContain(false);
		fireEvent.change(input, { target: { value: "delete" } });
		expect(button).toHaveProperty("disabled", true);
		fireEvent.submit(button.closest("form") as HTMLFormElement);
		await act(async () => new Promise((r) => setTimeout(r, 10)));
		expect(routeCalls("tools/delete-all")).toEqual([]);
		fireEvent.change(input, { target: { value: "DELETE" } });
		expect(button).toHaveProperty("disabled", false);
		fireEvent.click(button);
		await within(panel).findByText("Deleted: hits 40,012, sessions 300, rollup 5.");
		expect(routeCalls("tools/delete-all")).toEqual([{ confirm: "DELETE" }, { confirm: "DELETE" }]);
	});

	it("delete: matching visits are previewed, confirmed by their count, deleted and logged", async () => {
		const ins = env.raw.prepare("INSERT INTO ca_sessions (site, day, sid, vkey, hour, started, last_seen, window_s, pageviews, country, browser, device, channel) VALUES ('default', ?, ?, 'v', 3, 0, 0, 1800, 1, ?, 'Chrome', 'desktop', 'Direct')");
		for (let k = 0; k < 5; k++) ins.run(`2026-03-0${2 + (k % 2)}`, `de${k}`, "DE");
		ins.run("2026-03-02", "fr0", "FR");
		const panel = await openTab("Delete");
		const form = within(panel).getByRole("group", { name: "Conditions" });
		fireEvent.change(within(form).getByLabelText("Dimension"), { target: { value: "country" } });
		expect(within(form).queryByRole("option", { name: "Page" })).toBeNull();
		fireEvent.change(within(form).getByLabelText("Value"), { target: { value: "DE" } });
		fireEvent.click(within(form).getByRole("button", { name: "Add filter" }));
		// One hour of day alone would send no hour condition: Preview waits for both.
		const preview = within(form).getByRole("button", { name: "Preview matching visits" });
		fireEvent.change(within(form).getByLabelText("Hour of day from (site time)"), { target: { value: "3" } });
		expect(preview).toHaveProperty("disabled", true);
		expect(within(form).getByText("Choose both hours of day, or neither.")).toBeTruthy();
		fireEvent.change(within(form).getByLabelText("Hour of day from (site time)"), { target: { value: "" } });
		expect(preview).toHaveProperty("disabled", false);
		fireEvent.click(preview);
		await within(panel).findByText("5 visits match");
		expect(within(panel).getByText("Conditions: 2026-03-01 to 2026-03-07: country is DE")).toBeTruthy();
		expect(within(panel).getByRole("table", { name: "Matching visits per day" }).querySelectorAll("tbody tr")).toHaveLength(2);
		expect(within(panel).getByText("Country", { selector: "dt" }).nextElementSibling?.textContent).toBe("DE 100%");
		expect(within(panel).queryByText("Revenue changes")).toBeNull();
		expect(within(panel).getByRole("link", { name: "user agent rule" }).getAttribute("href")).toContain("/config?tab=user-agents");
		const del = within(panel).getByRole("button", { name: "Delete 5 visits" });
		fireEvent.change(within(panel).getByLabelText("Type 5 or DELETE to confirm"), { target: { value: "6" } });
		expect(del).toHaveProperty("disabled", true);
		fireEvent.change(within(panel).getByLabelText("Type 5 or DELETE to confirm"), { target: { value: "5" } });
		fireEvent.click(del);
		// The job is install-wide: the notice and the log name its site.
		await within(panel).findByText(/^default: Deleted 5 visits/);
		expect(routeCalls("tools/delete-start")[0]).toMatchObject({ confirm: "5", spec: { from: "2026-03-01", to: "2026-03-07", filters: [{ dim: "country", op: "is", values: ["DE"] }] } });
		const log = within(panel).getByRole("table", { name: "Recent deletions" });
		expect(within(log).getByText("owner@example.com")).toBeTruthy();
		expect(within(log).getByRole("cell", { name: "default" })).toBeTruthy();
		expect(within(log).getByText("2026-03-01 to 2026-03-07: country is DE")).toBeTruthy();
		expect(env.count("ca_sessions")).toBe(1);
	});

	it("delete: a running job shows its progress and can be cancelled", async () => {
		await kv.set("delete:job", {
			id: "j1", site: "default", by: null, at: 1, spec: { from: "2026-03-01", to: "2026-03-07", filters: [] }, summary: "2026-03-01 to 2026-03-07: every visit",
			pred: { sql: "0 = 1", params: [] }, days: ["2026-03-02", "2026-03-03", "2026-03-04"], i: 1, reclose: {}, old: [], oi: 0, expected: 40,
			deleted: { visits: 12, pageviews: 12, events: 0, orders: 0, refunds: 0, summaryDays: 0, oldDays: 0, summaryRows: 0 }, skipped: [], status: "running",
			utc: { day: "2026-02-25", rows: 15_000 }, paused: { until: 1_772_064_000, reason: "day_rows" },
		});
		settings = normalizeSettings({ capacityProfile: "small" });
		const panel = await openTab("Delete");
		const status = await within(panel).findByRole("status", { name: "Delete in progress" });
		expect(status.textContent).toContain("Deleting: 1 of 3 days, 12 of 40 visits so far. Rows written today 15,000 of 15,000.");
		expect(status.textContent).toContain("It continues by itself after 00:00 UTC.");
		expect(status.textContent).toContain("Site: default. Conditions: 2026-03-01 to 2026-03-07: every visit");
		fireEvent.click(within(status).getByRole("button", { name: "Cancel delete" }));
		await within(panel).findByText(/^default: Cancelled after deleting 12 visits/);
		expect(routeCalls("tools/delete-cancel")).toEqual([{}]);
	});

	it("delete: a failed run call does not stop the page's continuation", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			await kv.set("delete:job", {
				id: "j2", site: "default", by: null, at: 1, spec: { from: "2026-03-01", to: "2026-03-07", filters: [] }, summary: "2026-03-01 to 2026-03-07: every visit",
				pred: { sql: "0 = 1", params: [] }, days: ["2026-03-02"], i: 0, reclose: {}, old: [], oi: 0, expected: 0,
				deleted: { visits: 0, pageviews: 0, events: 0, orders: 0, refunds: 0, summaryDays: 0, oldDays: 0, summaryRows: 0 }, skipped: [], status: "running",
				utc: { day: "2026-02-25", rows: 0 }, paused: null,
			});
			failRuns = 1;
			const panel = await openTab("Delete");
			await within(panel).findByText("Service unavailable");
			expect(routeCalls("tools/delete-run")).toHaveLength(1);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(31_000);
			});
			await within(panel).findByText(/^default: Deleted 0 visits/);
			expect(routeCalls("tools/delete-run").length).toBeGreaterThanOrEqual(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("delete: the Void revenue form shows only with revenue, previews the count and voids after confirmation", async () => {
		let panel = await openTab("Delete");
		await act(async () => new Promise((r) => setTimeout(r, 20)));
		expect(within(panel).queryByRole("form", { name: "Void revenue" })).toBeNull();
		cleanup();
		hasRevenue = true;
		panel = await openTab("Delete");
		const form = await within(panel).findByRole("form", { name: "Void revenue" });
		const count = within(form).getByRole("button", { name: "Count matching orders" });
		expect(count).toHaveProperty("disabled", true);
		fireEvent.change(within(form).getByLabelText("Day"), { target: { value: "2026-03-05" } });
		fireEvent.change(within(form).getByLabelText("Minimum value"), { target: { value: "1000000" } });
		fireEvent.click(count);
		await within(form).findByText(/1 order match/);
		expect(routeCalls("tools/revenue-void")).toEqual([{ day: "2026-03-05", name: "purchase", minValue: 1_000_000 }]);
		fireEvent.click(within(form).getByRole("button", { name: "Void 1 order" }));
		await within(form).findByText(/1 order voided/);
		expect(routeCalls("tools/revenue-void")[1]).toEqual({ day: "2026-03-05", name: "purchase", minValue: 1_000_000, confirm: true });
	});

	it("has no crawler log tab", async () => {
		render(<Data />);
		const tabs = await screen.findAllByRole("tab");
		expect(tabs.map((t) => t.textContent)).toEqual(["Storage and retention", "Export", "Privacy receipt", "Delete"]);
	});

	it("a connected site shows the notice with a link and no forms", async () => {
		sites = [
			{ id: "main", label: "This site", local: true, timezone: "UTC" },
			{ id: "shop", label: "Shop", local: false, origin: "https://shop.example" },
		];
		window.history.replaceState(null, "", "/_emdash/admin/plugins/x/data?from=2026-03-01&to=2026-03-07&site=shop");
		render(<Data />);
		await screen.findByText(/Configuration is managed on the selected site/);
		expect(screen.getByRole("link", { name: "Open the admin of Shop" }).getAttribute("href")).toBe("https://shop.example/_emdash/admin/plugins/cookieless-analytics/data");
		expect(screen.queryByRole("tablist")).toBeNull();
		await act(async () => new Promise((r) => setTimeout(r, 20)));
		expect(routeCalls("privacy/receipt")).toEqual([]);
	});
});

describe("delete preview cost sentence", () => {
	const est = { rows: 9800, deleteRows: 5000, summaryRows: 4800, oldRows: 0, smallDays: 1, dayRows: 15000, today: null };
	it("names the real profile: no daily cap outside small", () => {
		expect(deleteCostText({ ...est, profile: "standard" }, 9800)).toBe("About 9,800 rows written. On the Standard profile there is no daily row cap: the delete runs in steps until it is done.");
		expect(deleteCostText({ ...est, profile: "dedicated" }, 1)).toBe("About 1 row written. On the Dedicated database profile there is no daily row cap: the delete runs in steps until it is done.");
	});
	it("on small: the UTC days at the daily cap and today's share of the write allowance", () => {
		expect(deleteCostText({ ...est, profile: "small", today: { rows: 6100, limit: 85000 } }, 31000)).toBe(
			"About 31,000 rows written. On the Small profile this takes 3 UTC days: at most 15,000 rows a day, paused while the daily write guard is high. Today's writes so far: about 6,100 of 85,000; this delete is 36 percent of that allowance.",
		);
		expect(deleteCostText({ ...est, profile: "small" }, 0)).toBe("About 0 rows written. On the Small profile this takes 1 UTC day: at most 15,000 rows a day, paused while the daily write guard is high.");
	});
});
