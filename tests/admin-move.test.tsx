// @vitest-environment jsdom
/** Data page, Move data tab: the five steps from the `move/*` route states, the start guard, the typed confirmation, polling. */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Data from "../src/admin/pages/Data.js";
import { checkClean, MOVE_TEXT, moveCapped, type MoveJobState, type MoveState, moveEstimate } from "../src/admin/pages/data/MoveData.js";
import { SETUP_COPY } from "../src/admin/setup.js";
import { MOVE_ORDER, moveView, newMoveJob, type VerifyTable } from "../src/move/job.js";
import { MoveDropBody, MovePauseBody, MoveStartBody } from "../src/routes/move.js";

type Body = Record<string, unknown>;
let calls: Array<{ route: string; body: Body }> = [];
let status: MoveState | null = null;
/** Answers of `move/run`, one per call; the last one repeats. */
let runs: MoveState[] = [];
let deleteJob: unknown = null;
let dropError: string | null = null;
let denied = false;

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
const fail = (s: number, message: string) => new Response(JSON.stringify({ error: { code: "ERR", message } }), { status: s, headers: { "content-type": "application/json" } });

const total = Object.fromEntries(MOVE_ORDER.map((t) => [t, 400]));
const clean: VerifyTable = { keys: 14, short: 0, more: 2, sample: [] };
function job(over: Partial<ReturnType<typeof newMoveJob>> = {}): MoveJobState {
	const j = { ...newMoveJob({ source: null, dest: "CA_PG", by: "admin@example.com", now: 1_772_000_000, total, state: {} }), ...over };
	return moveView(j) as MoveJobState;
}
const done = (verify: Record<string, VerifyTable> = Object.fromEntries(MOVE_ORDER.map((t) => [t, clean]))) =>
	job({ status: "done", t: MOVE_ORDER.length, v: MOVE_ORDER.length, read: total, inserted: total, verify, finished: 1_772_003_600 });

const receipt = {
	tables: [{ name: "ca_sessions", rows: 120 }, { name: "ca_events", rows: 30 }],
	capacity: { profile: "standard", database: "CA_PG", health: { engine: "postgres", status: "ok", latencyMs: 12, queryCache: false } },
};

async function handle(route: string, body: Body): Promise<Response> {
	if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, timezone: "UTC" }] });
	if (route === "config/segments/list") return ok({ items: [] });
	if (route === "privacy/receipt") return ok(receipt);
	if (route === "tools/delete-status") return ok({ job: deleteJob, log: [], dayRows: null });
	if (route.startsWith("move/") && denied) return fail(403, "Not allowed.");
	if (route === "move/status") return ok(status);
	if (route === "move/run") return ok(runs.length > 1 ? runs.shift() : runs[0]);
	if (route === "move/start") return MoveStartBody.safeParse(body).success ? ok({ job: job(), dest: "CA_PG" }) : fail(400, "Invalid request body");
	if (route === "move/pause") {
		if (!MovePauseBody.safeParse(body).success) return fail(400, "Invalid request body");
		return ok({ job: job({ status: body.resume ? "running" : "paused" }), dest: "CA_PG" });
	}
	if (route === "move/cancel") return ok({ job: job({ status: "cancelled" }), dest: "CA_PG" });
	if (route === "move/drop-old-tables") {
		if (!MoveDropBody.safeParse(body).success) return fail(400, "Invalid request body");
		return dropError ? fail(400, dropError) : ok({ job: { ...done(), dropped: 1_772_010_000 }, dest: "CA_PG" });
	}
	return fail(404, "No route");
}

const routeCalls = (r: string) => calls.filter((c) => c.route === r).map((c) => c.body);

beforeEach(() => {
	calls = [];
	status = { job: null, dest: "CA_PG" };
	runs = [];
	deleteJob = null;
	dropError = null;
	denied = false;
	window.history.replaceState(null, "", "/_emdash/admin/plugins/x/data?tab=move&from=2026-03-01&to=2026-03-07");
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

const step = (title: string) => screen.getByRole("region", { name: title });

describe("Move data tab", () => {
	it("idle: the five steps, the before box with its guides and the CLI, a Start button and the Learn more link", async () => {
		render(<Data />);
		const start = await screen.findByRole("button", { name: "Start the move" });
		for (const t of ["Where the data is now", "Where it goes", "Start", "Check", "Remove the old tables"]) expect(step(t)).toBeTruthy();
		expect(screen.getByText(/One config change and one deploy come first/)).toBeTruthy();
		expect(screen.getByRole("link", { name: "Move data" }).getAttribute("href")).toMatch(/wiki\/Move-Data$/);
		expect(screen.getByRole("link", { name: "Postgres through Hyperdrive" }).getAttribute("href")).toMatch(/wiki\/Postgres-Hyperdrive$/);
		expect(screen.getByText("ca-data export")).toBeTruthy();
		expect(screen.getByRole("link", { name: /Learn more/ }).getAttribute("href")).toMatch(/wiki\/Move-Data$/);
		// Where it goes: the database the site writes to now, its engine and health.
		await within(step("Where it goes")).findByText("Postgres through Hyperdrive");
		expect(within(step("Where it goes")).getByText("Binding CA_PG")).toBeTruthy();
		expect(within(step("Where it goes")).getByText(/self-check took 12 ms/)).toBeTruthy();
		expect(within(step("Where it goes")).getByText("150")).toBeTruthy();
		expect(screen.getByText(MOVE_TEXT.notCounted)).toBeTruthy();
		expect(screen.getByText(MOVE_TEXT.checkWait)).toBeTruthy();
		expect((screen.getByRole("button", { name: "Delete the old tables" }) as HTMLButtonElement).disabled).toBe(true);
		// Each step has its info mark from the definitions.
		expect(within(step("Check")).getByRole("button", { name: "About this number" })).toBeTruthy();
		// Keyboard: the source is a radio group; a typed binding starts from that binding.
		fireEvent.click(screen.getByRole("radio", { name: "Another database of this Worker" }));
		expect((start as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(screen.getByRole("textbox", { name: "Binding name in your wrangler config" }), { target: { value: "CA_OLD" } });
		fireEvent.click(start);
		await waitFor(() => expect(routeCalls("move/start")).toEqual([{ source: "CA_OLD" }]));
	});

	it("nothing to move and no job: the setup prompt with the first step", async () => {
		status = { job: null, dest: null };
		render(<Data />);
		const link = await screen.findByRole("link", { name: SETUP_COPY.move.label });
		expect(link.getAttribute("href")).toMatch(/wiki\/Move-Data$/);
		expect(screen.getByText(SETUP_COPY.move.text)).toBeTruthy();
	});

	it("start is disabled while a delete job runs, with the reason", async () => {
		deleteJob = { status: "running" };
		render(<Data />);
		await screen.findByText(MOVE_TEXT.deleting);
		expect((screen.getByRole("button", { name: "Start the move" }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("running: banner, estimate, progress per table, pause and cancel; polling stops when the move is done", async () => {
		const half = job({ read: { ...Object.fromEntries(MOVE_ORDER.map((t) => [t, 0])), ca_rollup: 400, ca_cube: 200 }, t: 1 });
		status = { job: half, dest: "CA_PG" };
		runs = [{ job: job({ read: total, t: 5 }), dest: "CA_PG" }, { job: done(), dest: "CA_PG" }];
		render(<Data />);
		await screen.findByText(MOVE_TEXT.banner(half.percent));
		const e = moveEstimate(half, "standard");
		expect(screen.getByText(MOVE_TEXT.estimate(e.chunks, e.rows, e.perRun, e.minutes))).toBeTruthy();
		expect(within(screen.getByRole("table", { name: "Progress per table" })).getAllByRole("row")).toHaveLength(MOVE_ORDER.length + 1);
		expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Cancel the move" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /^Start/ })).toBeNull();
		await screen.findByRole("table", { name: "Check per table" }, { timeout: 3000 });
		expect(screen.queryByText(/Moving data:/)).toBeNull();
		const n = routeCalls("move/run").length;
		expect(n).toBe(2);
		await new Promise((r) => setTimeout(r, 700));
		expect(routeCalls("move/run")).toHaveLength(n);
	});

	it("the day's rows used up: continues tomorrow with today's rows, and the page polls slowly", async () => {
		const capped = job({ until: 1_772_064_000, today: { day: "2026-02-25", rows: 15_000 }, read: { ...Object.fromEntries(MOVE_ORDER.map((t) => [t, 0])), ca_rollup: 400 } });
		status = { job: capped, dest: "CA_PG" };
		runs = [{ job: capped, dest: "CA_PG" }];
		render(<Data />);
		// 3,200 rows left at 15,000 a day: at least one more day.
		expect(moveCapped(capped)).toEqual({ rows: 15_000, cap: 15_000, days: 1 });
		await screen.findByText(MOVE_TEXT.capped(15_000, 15_000, 1));
		expect(screen.getByText(/continues tomorrow after 00:00 UTC/)).toBeTruthy();
		expect(screen.queryByText(/chunks of up to/)).toBeNull();
		await new Promise((r) => setTimeout(r, 700));
		expect(routeCalls("move/run")).toHaveLength(0);
		expect(moveCapped(job())).toBeNull();
	});

	it("paused after repeated failures: the job's own message and Resume", async () => {
		const error = "The move stopped after 5 failed tries at the same place in ca_events: timeout. Resume it to try again.";
		status = { job: job({ status: "paused", error }), dest: "CA_PG" };
		render(<Data />);
		await screen.findByText(error);
		expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
	});

	it("paused: no polling, a Resume button and the paused notice", async () => {
		status = { job: job({ status: "paused" }), dest: "CA_PG" };
		render(<Data />);
		await screen.findByText(MOVE_TEXT.paused(0));
		fireEvent.click(screen.getByRole("button", { name: "Resume" }));
		await waitFor(() => expect(routeCalls("move/pause")).toEqual([{ resume: true }]));
	});

	it("estimate: chunks left by profile rows, minutes by the per minute run", () => {
		const j = { total: { a: 1000, b: 101 }, read: { a: 500 } };
		expect(moveEstimate(j, "small")).toEqual({ chunks: 10 + 3, rows: 50, perRun: 10, minutes: 2 });
		expect(moveEstimate(j, "standard")).toEqual({ chunks: 3 + 1, rows: 200, perRun: 100, minutes: 1 });
	});

	it("done with a clean check: the verification table, then DELETE typed removes the old tables", async () => {
		status = { job: done(), dest: "CA_PG" };
		render(<Data />);
		const table = await screen.findByRole("table", { name: "Check per table" });
		expect(within(table).getAllByRole("row")).toHaveLength(MOVE_ORDER.length + 1);
		expect(screen.getByText(MOVE_TEXT.split)).toBeTruthy();
		const del = screen.getByRole("button", { name: "Delete the old tables" }) as HTMLButtonElement;
		const input = screen.getByRole("textbox", { name: "Type DELETE to confirm" });
		fireEvent.change(input, { target: { value: "delete" } });
		expect(del.disabled).toBe(true);
		fireEvent.change(input, { target: { value: "DELETE" } });
		expect(del.disabled).toBe(false);
		fireEvent.click(del);
		await screen.findByText(MOVE_TEXT.dropped);
		expect(routeCalls("move/drop-old-tables")).toEqual([{ confirm: "DELETE" }]);
	});

	it("verify with short rows: the warning, the remove step stays disabled", async () => {
		status = { job: done({ ...Object.fromEntries(MOVE_ORDER.map((t) => [t, clean])), ca_sessions: { keys: 14, short: 3, more: 0, sample: [] } }), dest: "CA_PG" };
		render(<Data />);
		const table = await screen.findByRole("table", { name: "Check per table" });
		expect(within(table).getByText("3")).toBeTruthy();
		expect(screen.getByText(/Rows are missing in the new database/)).toBeTruthy();
		expect(screen.getByText(MOVE_TEXT.removeWait)).toBeTruthy();
		expect((screen.getByRole("textbox", { name: "Type DELETE to confirm" }) as HTMLInputElement).disabled).toBe(true);
		expect((screen.getByRole("button", { name: "Delete the old tables" }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
	});

	it("a refused drop shows the route's reason", async () => {
		status = { job: done(), dest: "CA_PG" };
		dropError = "Sites still write to the EmDash database; its tables stay.";
		render(<Data />);
		fireEvent.change(await screen.findByRole("textbox", { name: "Type DELETE to confirm" }), { target: { value: "DELETE" } });
		fireEvent.click(screen.getByRole("button", { name: "Delete the old tables" }));
		await screen.findByText(dropError);
		expect(screen.queryByText(MOVE_TEXT.dropped)).toBeNull();
	});

	it("a read-only user sees the steps and where the data goes, without buttons", async () => {
		denied = true;
		render(<Data />);
		await screen.findByText(MOVE_TEXT.denied);
		await within(step("Where it goes")).findByText("Postgres through Hyperdrive");
		const panel = screen.getByRole("tabpanel");
		expect(within(panel).queryAllByRole("button", { name: /Start|Pause|Resume|Cancel|Check again|Delete the old tables/ })).toEqual([]);
		expect(within(panel).queryByRole("textbox")).toBeNull();
	});

	it("after a cancelled move a new one starts from the same source and site", async () => {
		status = { job: job({ status: "cancelled", source: "CA_OLD", site: "main" }), dest: "CA_PG" };
		render(<Data />);
		const start = await screen.findByRole("button", { name: "Start a new move" });
		expect(screen.getByText(MOVE_TEXT.cancelled)).toBeTruthy();
		expect((screen.getByRole("textbox", { name: "Binding name in your wrangler config" }) as HTMLInputElement).value).toBe("CA_OLD");
		fireEvent.click(start);
		await waitFor(() => expect(routeCalls("move/start")).toEqual([{ source: "CA_OLD", site: "main" }]));
	});

	it("a finished move of one site says up front why the old tables stay", async () => {
		status = { job: { ...done(), site: "main" }, dest: "CA_PG" };
		render(<Data />);
		await screen.findByText(/Only the rows of site main were moved/);
		expect((screen.getByRole("button", { name: "Delete the old tables" }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("checkClean needs every table checked and nothing short", () => {
		expect(checkClean(done())).toBe(true);
		expect(checkClean(done({ ca_rollup: clean }))).toBe(false);
		expect(checkClean(job())).toBe(false);
		expect(checkClean({ ...done(), dropped: 1 })).toBe(false);
	});
});
