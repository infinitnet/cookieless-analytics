// @vitest-environment jsdom
/** Value suggestions of the filter bar: `dimension_values` per site, dim and range, narrowing, keyboard, free text, errors. */
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "../src/admin/components/FilterBar.js";
import { resetSuggestions, type SuggestSource, SUGGEST_LIMIT, narrow } from "../src/admin/components/ValueInput.js";
import { SATISFACTION_RAW_ONLY } from "../src/query/reports/satisfaction-copy.js";
import type { Filter } from "../src/query/filters.js";

type Body = { report: string; query: { from: string; to: string; filters: unknown[]; site?: string }; params: { dim: string; prefix?: string; scope?: string }; limit: number };
let calls: Body[] = [];
/** Answer of the stub per call; default: three channels, or 50 pages (a capped list) for `page`. */
let answer: (b: Body) => Response;
const ok = (rows: unknown[]) => new Response(JSON.stringify({ data: { report: "dimension_values", range: {}, compare: "none", compareRange: null, notices: [], data: { rows } } }), { status: 200 });
const fail = (code: string, message: string) => new Response(JSON.stringify({ error: { code, message } }), { status: 400 });
const CHANNELS = [
	{ key: "Organic Search", count: 120 },
	{ key: "Direct", count: 80 },
	{ key: "Organic Social", count: 9 },
];
const PAGES = Array.from({ length: SUGGEST_LIMIT }, (_, i) => ({ key: `/p${i}`, count: 100 - i }));
const defaultAnswer = (b: Body) => {
	if (b.params.dim === "page") return ok(b.params.prefix ? [{ key: `${b.params.prefix}-match`, count: 3 }] : PAGES);
	return ok(b.params.prefix ? CHANNELS.filter((c) => c.key.toLowerCase().startsWith(String(b.params.prefix).toLowerCase())) : CHANNELS);
};

const SRC: SuggestSource = { site: "main", from: "2026-03-01", to: "2026-03-07" };
const settle = () => act(async () => new Promise((r) => setTimeout(r, 30)));

function harness(source: SuggestSource | null = SRC, initial: Filter[] = []) {
	const seen: { filters: Filter[] } = { filters: initial };
	let setSource: (s: SuggestSource) => void = () => {};
	function H() {
		const [f, setF] = useState<Filter[]>(initial);
		const [src, setSrc] = useState<SuggestSource | null>(source);
		setSource = setSrc;
		seen.filters = f;
		return <FilterBar filters={f} onChange={setF} suggest={src ?? undefined} />;
	}
	const r = render(<H />);
	return { seen, setSource: (s: SuggestSource) => act(() => setSource(s)), ...r };
}

beforeEach(() => {
	calls = [];
	answer = defaultAnswer;
	resetSuggestions();
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init: RequestInit) => {
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

const values = () => calls.filter((c) => c.report === "dimension_values");

describe("filter bar value suggestions", () => {
	it("lists the channels of the site and range with their counts once the value input has focus, and not before", async () => {
		const { getByLabelText, findByRole } = harness();
		fireEvent.change(getByLabelText("Dimension"), { target: { value: "channel" } });
		await settle();
		expect(values()).toHaveLength(0);
		const input = getByLabelText("Value");
		fireEvent.focus(input);
		const list = await findByRole("listbox", { name: "Values in this range" });
		const options = await within(list).findAllByRole("option");
		expect(options.map((o) => o.textContent)).toEqual(["Organic Search120", "Direct80", "Organic Social9"]);
		expect(input.getAttribute("aria-expanded")).toBe("true");
		expect(input.getAttribute("role")).toBe("combobox");
		expect(values()).toEqual([{ report: "dimension_values", query: { from: "2026-03-01", to: "2026-03-07", filters: [], compare: "none", site: "main" }, params: { dim: "channel" }, limit: 50 }]);
	});

	it("narrows a complete list in memory while typing, with no further request", async () => {
		const { getByLabelText, findByRole } = harness();
		fireEvent.change(getByLabelText("Dimension"), { target: { value: "channel" } });
		const input = getByLabelText("Value");
		fireEvent.focus(input);
		await within(await findByRole("listbox")).findByRole("option", { name: /^Direct/ });
		fireEvent.change(input, { target: { value: "social" } });
		await waitFor(() => expect(within(getByLabelTextList()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Organic Social9"]));
		expect(values()).toHaveLength(1);
		function getByLabelTextList() {
			return document.getElementById(input.getAttribute("aria-controls") as string) as HTMLElement;
		}
	});

	it("asks the server with the typed prefix when the list was capped at 50", async () => {
		const { getByLabelText, findByRole } = harness();
		const input = getByLabelText("Value");
		fireEvent.focus(input);
		expect(await within(await findByRole("listbox")).findByRole("option", { name: /^\/p0/ })).toBeTruthy();
		fireEvent.change(input, { target: { value: "/blog" } });
		expect(await within(await findByRole("listbox")).findByRole("option", { name: /^\/blog-match/ })).toBeTruthy();
		expect(values().map((c) => c.params)).toEqual([{ dim: "page" }, { dim: "page", prefix: "/blog" }]);
	});

	it("picks a value with the arrow keys and Enter, and adds it as a chip", async () => {
		const { seen, getByLabelText, findByRole, queryByRole } = harness();
		fireEvent.change(getByLabelText("Dimension"), { target: { value: "channel" } });
		const input = getByLabelText("Value");
		fireEvent.focus(input);
		await within(await findByRole("listbox")).findAllByRole("option");
		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "ArrowDown" });
		const active = document.getElementById(input.getAttribute("aria-activedescendant") as string);
		expect(active?.textContent).toBe("Direct80");
		expect(active?.getAttribute("aria-selected")).toBe("true");
		fireEvent.keyDown(input, { key: "Enter" });
		await waitFor(() => expect(seen.filters).toEqual([{ dim: "channel", op: "is", values: ["Direct"] }]));
		expect((input as HTMLInputElement).value).toBe("");
		expect(queryByRole("listbox")).toBeNull();
	});

	it("picks a value with a click", async () => {
		const { seen, getByLabelText, findByRole } = harness();
		fireEvent.change(getByLabelText("Dimension"), { target: { value: "channel" } });
		fireEvent.focus(getByLabelText("Value"));
		fireEvent.click(await within(await findByRole("listbox")).findByRole("option", { name: /^Organic Social/ }));
		await waitFor(() => expect(seen.filters).toEqual([{ dim: "channel", op: "is", values: ["Organic Social"] }]));
	});

	it("Escape closes the list; typed free text is still added as it is", async () => {
		const { seen, getByLabelText, getByRole, findByRole, queryByRole } = harness();
		fireEvent.change(getByLabelText("Dimension"), { target: { value: "channel" } });
		const input = getByLabelText("Value");
		fireEvent.focus(input);
		await within(await findByRole("listbox")).findAllByRole("option");
		fireEvent.keyDown(input, { key: "Escape" });
		expect(queryByRole("listbox")).toBeNull();
		fireEvent.change(input, { target: { value: "Newsletter" } });
		fireEvent.click(getByRole("button", { name: "Add filter" }));
		await waitFor(() => expect(seen.filters).toEqual([{ dim: "channel", op: "is", values: ["Newsletter"] }]));
	});

	it("requests nothing for revenue or currency", async () => {
		const { getByLabelText, queryByRole } = harness();
		for (const dim of ["revenue", "currency"]) {
			fireEvent.change(getByLabelText("Dimension"), { target: { value: dim } });
			fireEvent.focus(getByLabelText("Value"));
			fireEvent.change(getByLabelText("Value"), { target: { value: "5" } });
			await act(async () => new Promise((r) => setTimeout(r, 400)));
			fireEvent.blur(getByLabelText("Value"));
		}
		expect(values()).toHaveLength(0);
		expect(queryByRole("listbox")).toBeNull();
	});

	it("without a source the input is plain free text and nothing is requested", async () => {
		const { getByLabelText } = harness(null);
		fireEvent.focus(getByLabelText("Value"));
		await settle();
		expect(values()).toHaveLength(0);
	});

	it("keeps quiet on an error, and retries once inside the detailed window a raw_only answer names", async () => {
		answer = () => fail("invalid_params", "The values could not be listed.");
		const { getByLabelText, queryByRole, unmount } = harness();
		fireEvent.focus(getByLabelText("Value"));
		await waitFor(() => expect(values()).toHaveLength(1));
		await settle();
		expect(queryByRole("listbox")).toBeNull();
		expect(queryByRole("alert")).toBeNull();
		unmount();
		resetSuggestions();
		calls = [];
		answer = (b) => (b.query.from < "2026-03-05" ? fail("raw_only", `${SATISFACTION_RAW_ONLY} Detailed data starts on 2026-03-05.`) : defaultAnswer(b));
		const second = harness();
		fireEvent.focus(second.getByLabelText("Value"));
		expect(await within(await second.findByRole("listbox")).findByRole("option", { name: /^\/p0/ })).toBeTruthy();
		expect(values().map((c) => c.query.from)).toEqual(["2026-03-01", "2026-03-05"]);
	});

	it("caches per site, dim and range: a new site or range asks again, the same one does not", async () => {
		const { getByLabelText, findByRole, setSource } = harness();
		const input = getByLabelText("Value");
		fireEvent.focus(input);
		await within(await findByRole("listbox")).findAllByRole("option");
		fireEvent.blur(input);
		fireEvent.focus(input);
		await within(await findByRole("listbox")).findAllByRole("option");
		expect(values()).toHaveLength(1);
		await setSource({ ...SRC, site: "shop" });
		await waitFor(() => expect(values().map((c) => c.query.site)).toEqual(["main", "shop"]));
		await setSource({ ...SRC, site: "shop", from: "2026-02-01" });
		await waitFor(() => expect(values().map((c) => c.query.from)).toEqual(["2026-03-01", "2026-03-01", "2026-02-01"]));
	});

	it("reads the search table's values for the search dims of a search page", async () => {
		const { getByLabelText } = harness({ ...SRC, scope: "search" });
		fireEvent.change(getByLabelText("Dimension"), { target: { value: "country" } });
		fireEvent.focus(getByLabelText("Value"));
		await waitFor(() => expect(values().at(-1)?.params).toEqual({ dim: "country", scope: "search" }));
		fireEvent.blur(getByLabelText("Value"));
		// Channel exists only in the visit data.
		fireEvent.change(getByLabelText("Dimension"), { target: { value: "channel" } });
		fireEvent.focus(getByLabelText("Value"));
		await waitFor(() => expect(values().at(-1)?.params).toEqual({ dim: "channel" }));
	});
});

describe("narrow", () => {
	it("puts values that start with the text before values that contain it", () => {
		const rows = [{ key: "/news/blog", count: 9 }, { key: "/blog/a", count: 3 }, { key: "/docs", count: 1 }];
		expect(narrow(rows, "/BLOG").map((r) => r.key)).toEqual(["/blog/a", "/news/blog"]);
		expect(narrow(CHANNELS, "SEARCH").map((r) => r.key)).toEqual(["Organic Search"]);
	});
});

describe("fixed chips", () => {
	it("show first without controls and leave the add menu", () => {
		const { container, getByLabelText } = render(<FilterBar filters={[]} onChange={() => {}} fixed={[{ dim: "channel", op: "is", values: ["Organic Search"] }]} />);
		const chip = container.querySelector(".ca-chip-fixed") as HTMLElement;
		expect(chip.textContent).toBe("Channel is Organic Search, fixed");
		expect(chip.querySelector("button, select")).toBeNull();
		expect([...(getByLabelText("Dimension") as HTMLSelectElement).options].map((o) => o.value)).not.toContain("channel");
		expect([...(getByLabelText("Regex dimension") as HTMLSelectElement).options].map((o) => o.value)).not.toContain("channel");
	});
});
