// @vitest-environment jsdom
/** SuggestInput: suggestions for a free-text field, the note for an unseen value, outbound hosts, fixed lists, event properties. */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	outboundHosts,
	outboundSeen,
	propOptions,
	resetSuggestions,
	SUGGEST_LIMIT,
	SuggestInput,
	type SuggestInputProps,
	type SuggestSource,
	suggestRange,
	UNSEEN_TEXT,
	useEventProps,
} from "../src/admin/components/ValueInput.js";
import { addDays } from "../src/core/time.js";
import { SATISFACTION_RAW_ONLY } from "../src/query/reports/satisfaction-copy.js";

type Body = { report: string; query: { from: string; to: string }; params: { dim?: string; prefix?: string; prop?: string; event?: string }; limit: number };
let calls: Body[] = [];
let answer: (b: Body) => Response;
const ok = (rows: unknown[]) => new Response(JSON.stringify({ data: { report: "x", range: {}, compare: "none", compareRange: null, notices: [], data: { rows } } }), { status: 200 });
const fail = (code: string, message: string) => new Response(JSON.stringify({ error: { code, message } }), { status: 400 });

const SRC: SuggestSource = { site: "main", from: "2026-03-01", to: "2026-03-07" };
const EVENTS = [
	{ key: "signup", count: 40 },
	{ key: "_outbound", count: 30 },
	{ key: "Demo requested", count: 5 },
];
const LINKS = [
	{ key: "example.org/a", events: 5 },
	{ key: "Example.org/b", events: 3 },
	{ key: "other.net", events: 9 },
	{ key: "(not set)", events: 1 },
];
const settle = () => act(async () => new Promise((r) => setTimeout(r, 400)));

function Field(p: Partial<SuggestInputProps>) {
	const [v, setV] = useState(p.value ?? "");
	return (
		<>
			<SuggestInput dim="event" source={SRC} label="Event name" {...p} value={v} onChange={setV} />
			<button type="button">elsewhere</button>
		</>
	);
}
const input = () => screen.getByLabelText("Event name") as HTMLInputElement;
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const requests = (report = "dimension_values") => calls.filter((c) => c.report === report);

beforeEach(() => {
	calls = [];
	resetSuggestions();
	answer = (b) => {
		if (b.report === "outbound") return ok(LINKS);
		if (b.report === "event_props")
			return ok([
				{ key: "plan=pro", prop: "plan", value: "pro", count: 4 },
				{ key: "plan=free", prop: "plan", value: "free", count: 2 },
				{ key: "seats=3", prop: "seats", value: "3", count: 1 },
			]);
		return ok(EVENTS);
	};
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_u: string, init: RequestInit) => {
			const body = JSON.parse(String(init.body)) as Body;
			calls.push(body);
			return answer(body);
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("suggestRange", () => {
	it("is the 90 days up to and including the end day", () => {
		expect(suggestRange("2026-03-31", addDays)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
	});
});

describe("SuggestInput", () => {
	it("lists the values on focus without the reserved names, and picking one fills the field", async () => {
		render(<Field />);
		fireEvent.focus(input());
		const list = await screen.findByRole("listbox", { name: "Values seen recently" });
		await waitFor(() => expect(list.querySelectorAll("[role=option]")).toHaveLength(2));
		fireEvent.click(screen.getByRole("option", { name: /Demo requested/ }));
		expect(input().value).toBe("Demo requested");
	});

	it("is a plain field without a source and a list", () => {
		render(<Field source={undefined} />);
		expect(screen.queryByRole("combobox")).toBeNull();
		fireEvent.focus(input());
		expect(calls).toHaveLength(0);
	});

	it("shows the note once the field is left with an unseen value, tied to the field and announced", async () => {
		render(<Field check />);
		fireEvent.focus(input());
		type("sing up");
		await settle();
		expect(screen.queryByText(UNSEEN_TEXT)).toBeNull();
		fireEvent.blur(input());
		const note = await screen.findByRole("status");
		expect(note.textContent).toBe(UNSEEN_TEXT);
		expect(input().getAttribute("aria-describedby")).toBe(note.id);
	});

	it("shows no note for a seen value, for empty text, without check, or before the field was used", async () => {
		render(<Field check value="signup" />);
		await settle();
		expect(calls).toHaveLength(0);
		expect(screen.queryByRole("status")).toBeNull();
		fireEvent.focus(input());
		await settle();
		fireEvent.blur(input());
		expect(screen.queryByRole("status")).toBeNull();
		type("");
		await settle();
		expect(screen.queryByRole("status")).toBeNull();
		cleanup();
		render(<Field value="nope" />);
		fireEvent.focus(input());
		fireEvent.blur(input());
		await settle();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("answers from the complete list in memory: one request however much is typed", async () => {
		render(<Field check />);
		fireEvent.focus(input());
		await settle();
		for (const t of ["s", "si", "sig", "signup x"]) {
			type(t);
			await settle();
		}
		fireEvent.blur(input());
		await screen.findByRole("status");
		expect(requests()).toHaveLength(1);
	});

	it("gives no note when the answer is cut at the cap and does not hold the value", async () => {
		answer = () => ok(Array.from({ length: SUGGEST_LIMIT }, (_, i) => ({ key: `/blog/${i}`, count: 100 - i })));
		render(<Field dim="page" check label="Event name" value="/blog" />);
		fireEvent.focus(input());
		await settle();
		fireEvent.blur(input());
		await settle();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("gives no note when the lookup fails", async () => {
		answer = () => fail("source_error", "Down.");
		render(<Field check value="x" />);
		fireEvent.focus(input());
		fireEvent.blur(input());
		await settle();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("asks again once with the range the server fits, and remembers it for the next lookup", async () => {
		answer = (b) => (b.query.from < "2026-03-05" ? fail("raw_only", `${SATISFACTION_RAW_ONLY} Detailed data starts on 2026-03-05.`) : ok(EVENTS));
		render(<Field />);
		fireEvent.focus(input());
		await screen.findByRole("listbox", { name: "Values seen recently" });
		expect(requests().map((c) => c.query.from)).toEqual(["2026-03-01", "2026-03-05"]);
		cleanup();
		render(<Field dim="channel" />);
		fireEvent.focus(input());
		await settle();
		expect(requests().map((c) => c.query.from)).toEqual(["2026-03-01", "2026-03-05", "2026-03-05"]);
	});
});

describe("fixed lists", () => {
	const OPTIONS = [
		{ key: "plan", count: 6 },
		{ key: "seats", count: 1 },
	];
	it("picks with the arrow keys and Enter", () => {
		render(<Field source={undefined} options={OPTIONS} />);
		fireEvent.focus(input());
		fireEvent.keyDown(input(), { key: "ArrowDown" });
		expect(input().getAttribute("aria-activedescendant")).not.toBeNull();
		fireEvent.keyDown(input(), { key: "ArrowDown" });
		fireEvent.keyDown(input(), { key: "Enter" });
		expect(input().value).toBe("seats");
		expect(calls).toHaveLength(0);
	});

	it("narrows while typing and keeps what is typed", () => {
		render(<Field source={undefined} options={OPTIONS} />);
		fireEvent.focus(input());
		type("pl");
		expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["plan6"]);
		type("planet");
		expect(input().value).toBe("planet");
	});
});

describe("outbound hosts", () => {
	it("folds the links to hosts by event count and ignores the placeholder row", () => {
		const links = LINKS.map((l) => ({ key: l.key, count: l.events }));
		expect(outboundHosts(links.filter((l) => l.key !== "(not set)"))).toEqual([
			{ key: "other.net", count: 9 },
			{ key: "example.org", count: 5 },
			{ key: "Example.org", count: 3 },
		]);
	});

	it("matches the host or host and path exactly, in lower case, as a goal does", () => {
		const links = [{ key: "Example.org/a", count: 1 }];
		expect(outboundSeen(links, "example.org")).toBe(true);
		expect(outboundSeen(links, "EXAMPLE.org/a")).toBe(true);
		expect(outboundSeen(links, "example.org/b")).toBe(false);
		expect(outboundSeen(links, "example")).toBe(false);
	});

	it("reads the outbound report once and lists hosts; a host seen gets no note, another does", async () => {
		render(<Field dim="event_prop" kind="outbound" check label="Event name" />);
		fireEvent.focus(input());
		await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
		expect(requests("outbound")).toHaveLength(1);
		expect(requests()).toHaveLength(0);
		type("EXAMPLE.org");
		fireEvent.blur(input());
		await settle();
		expect(screen.queryByRole("status")).toBeNull();
		fireEvent.focus(input());
		type("unknown.com");
		fireEvent.blur(input());
		expect((await screen.findByRole("status")).textContent).toBe(UNSEEN_TEXT);
	});
});

describe("event properties", () => {
	it("sums the keys and lists the values of one key", () => {
		const rows = [
			{ prop: "plan", value: "pro", count: 4 },
			{ prop: "plan", value: "free", count: 2 },
			{ prop: "seats", value: "3", count: 1 },
			{ prop: "plan", value: "", count: 9 },
		];
		const { keys, values } = propOptions(rows, "plan");
		expect(keys).toEqual([
			{ key: "plan", count: 15 },
			{ key: "seats", count: 1 },
		]);
		expect(values).toEqual([
			{ key: "pro", count: 4 },
			{ key: "free", count: 2 },
		]);
		expect(propOptions(rows, "none").values).toEqual([]);
	});

	it("reads one event_props report per event once enabled, and nothing for an empty or too long name", async () => {
		const { result, rerender } = renderHook(({ ev, on }) => useEventProps(SRC, ev, on), { initialProps: { ev: "signup", on: false } });
		await settle();
		expect(calls).toHaveLength(0);
		rerender({ ev: "signup", on: true });
		await waitFor(() => expect(result.current).toHaveLength(3));
		rerender({ ev: "signup", on: true });
		expect(requests("event_props")).toHaveLength(1);
		rerender({ ev: "", on: true });
		rerender({ ev: "x".repeat(65), on: true });
		await settle();
		expect(requests("event_props")).toHaveLength(1);
		expect(result.current).toEqual([]);
	});
});
