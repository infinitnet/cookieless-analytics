// @vitest-environment jsdom
/** Admin look: the Notice primitive, the Search connection cards, and the token rule for inline styles. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { count } from "../src/admin/components/format.js";
import { Notice } from "../src/admin/components/ui.js";
import { resetSearchStatus } from "../src/admin/api.js";
import Search, { connectionState, explainError, providerCode } from "../src/admin/pages/Search.js";
import { ADMIN_CSS, injectStyles, STYLE_ID } from "../src/admin/styles.js";

/** Source files of an admin folder, its subfolders included (`pages/data/`). */
const sources = (dir: string) => (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("Notice", () => {
	it("announces errors as alerts with the tone class and keeps the message text", () => {
		render(<Notice tone="error">The query failed.</Notice>);
		const box = screen.getByRole("alert");
		expect(box.className).toContain("ca-notice--error");
		expect(box.getAttribute("data-tone")).toBe("error");
		expect(box.textContent).toBe("The query failed.");
		// The tone word is shown through generated content, so meaning never rests on color alone.
		expect(box.querySelector(".ca-notice-text")?.getAttribute("data-label")).toBe("Error");
		expect(box.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
	});

	it("uses a polite status for the other tones and accepts a custom label", () => {
		for (const tone of ["warning", "info", "success"] as const) {
			const { container, unmount } = render(<Notice tone={tone}>Text of {tone}</Notice>);
			const box = container.querySelector(".ca-notice") as HTMLElement;
			expect(box.getAttribute("role")).toBe("status");
			expect(box.className).toContain(`ca-notice--${tone}`);
			expect(box.textContent).toBe(`Text of ${tone}`);
			unmount();
		}
		render(
			<Notice tone="warning" label="Throttled">
				Retrying later.
			</Notice>,
		);
		expect(screen.getByRole("status").querySelector("[data-label]")?.getAttribute("data-label")).toBe("Throttled");
	});
});

describe("stylesheet", () => {
	it("is injected once and colors only through theme variables", () => {
		injectStyles(document);
		injectStyles(document);
		expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
		expect(ADMIN_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
	});

	it("screen reader text cannot widen the page, a text box spans its row, the annotations table keeps its title readable", () => {
		const sr = /\.ca-sr-only, \.ca-sr \{([^}]*)\}/.exec(ADMIN_CSS)?.[1] ?? "";
		expect(sr).toContain("position: absolute; top: 0; left: 0;");
		expect(ADMIN_CSS).toContain(".ca-field-wrap:has(> .ca-field > textarea) { margin-right: 0; }");
		expect(ADMIN_CSS).toMatch(/\.ca-annotations :where\(th, td\):first-child \{ min-width: 0;/);
	});

	it("an overflowing tab bar or table fades at its right edge until scrolled to the end, with one shared rule", () => {
		expect(ADMIN_CSS).toContain("@property --ca-scroll-fade { syntax: \"<length>\"; inherits: false; initial-value: 0px; }");
		expect(ADMIN_CSS).toMatch(/@supports \(animation-timeline: scroll\(\)\) \{ \.ca-tabs, \.ca-table-scroll \{ mask-image: linear-gradient\(to left, transparent, black var\(--ca-scroll-fade\)\);[^}]*animation-timeline: scroll\(self inline\);/);
	});

	it("the annotations toolbar is a toolbar like the rest: stacked field labels, the window switch stacked too, small buttons", () => {
		const bar = /className="ca-row-end">([\s\S]*?)\n\t\t\t<\/div>/.exec(readFileSync("src/admin/pages/Annotations.tsx", "utf8"))?.[1] ?? "";
		expect(bar).toContain('<Field label="Kind">');
		expect(bar).toContain('<Field label="Scope">');
		expect([...bar.matchAll(/<Button\b[^>]*>/g)].every((m) => m[0].includes('size="sm"'))).toBe(true);
		expect(ADMIN_CSS).toContain(".ca-row-end > .ca-seg-wrap { display: grid; gap: var(--ca-1); }");
		expect(ADMIN_CSS).toContain(".ca-row-end > .ca-seg-wrap > .ca-field-label { font-size: 12px; }");
		expect(ADMIN_CSS).toContain(".ca-row-end > button { margin-bottom: var(--ca-1); }");
		expect(ADMIN_CSS).toContain(".ca-row-end > .ca-check { min-height: 36px; }");
		// Every toolbar row of fields stacks its labels: no inline label text before a control.
		for (const f of sources("src/admin/pages")) expect(readFileSync(join("src/admin/pages", f), "utf8"), f).not.toMatch(/className="ca-row-end">\s*<label>\s*\w/);
	});

	it("a table row with action buttons centers every cell, so its text sits level with the buttons", () => {
		expect(ADMIN_CSS).toContain(".ca-root :where(table) tr:has(> td > .ca-row-actions, > td:last-child > button) > :where(td, th) { vertical-align: middle; }");
	});

	it("raw counts print through one formatter with thousands separators; no page keeps its own copy", () => {
		expect(count(61204)).toBe("61,204");
		expect(count(5)).toBe("5");
		const own: string[] = [];
		for (const dir of ["src/admin/pages", "src/admin/components"]) for (const f of sources(dir)) if (/toLocaleString\("en-US"\)/.test(readFileSync(join(dir, f), "utf8")) && f !== "format.ts") own.push(f);
		expect(own).toEqual([]);
	});

	it("buttons are small, form footers included; only a button beside a 36px field takes the default size", () => {
		const unsized: Record<string, number> = {};
		for (const dir of ["src/admin/pages", "src/admin/components"])
			for (const f of sources(dir)) {
				const n = [...readFileSync(join(dir, f), "utf8").matchAll(/<Button\b[\s\S]*?>\n/g)].filter((m) => !/\bsize=/.test(m[0])).length;
				if (n) unsized[f] = n;
			}
		// The filter bar only: its controls are 36 px fields of one row.
		expect(unsized).toEqual({ "FilterBar.tsx": 3 });
	});

	it("an idle chart hint takes no row between the KPI cards and the chart", () => {
		expect(ADMIN_CSS).toContain(".ca-chart-hint:has(> span:empty):not(:has(> button)) { position: absolute; }");
	});

	it("every disclosure toggle has one text size: no section disclosure (Connections) is larger", () => {
		expect(ADMIN_CSS).toMatch(/\.ca-disclosure-toggle \{[^}]*font-size: 13px;/);
		expect(ADMIN_CSS).not.toMatch(/\.ca-disclosure[^{]*> \.ca-disclosure-toggle \{[^}]*font-size/);
	});

	it("a bare field in a form spans the form width, like a wrapped one (the Delete confirmation)", () => {
		expect(ADMIN_CSS).toContain(".ca-root .ca-form > .ca-field { justify-self: stretch; }");
		// Outside a form a field keeps its own width, also one with help text (a span, not a label).
		expect(ADMIN_CSS).toMatch(/> :where\(button, a, label, select, input, small, \.ca-field, [^)]*\) \{ justify-self: start; \}/);
	});

	it("fields in grid stacks and flex rows reach the panel edge: only gap spaces them", () => {
		const rule = /\.ca-root :where\(([^)]*)\) > \.ca-field-wrap \{ margin: 0; \}/.exec(ADMIN_CSS)?.[1] ?? "";
		for (const c of ["form", "section", "[role=tabpanel]", ".ca-form", ".ca-row", ".ca-row-end"]) expect(rule).toContain(c);
	});

	it("native selects draw their chevron 12px from the border and keep text clear of it, chips included", () => {
		const rule = /\.ca-root :where\(select\):where\(:not\(\[class\*="kumo"\], \[multiple\]\)\) \{([^}]*)\}/.exec(ADMIN_CSS)?.[1] ?? "";
		expect(rule).toContain("appearance: none");
		expect(rule).toContain("padding-right: 36px");
		expect(rule).toContain("background-position: right 12px center");
		expect(rule).toContain("background-size: 14px 14px");
		const chip = /\.ca-chip :where\(select\)[^{]*\{([^}]*)\}/.exec(ADMIN_CSS)?.[1] ?? "";
		expect(chip).toContain("padding: 0 32px 0");
		// No later rule may shrink the right padding of every select again.
		expect(ADMIN_CSS).not.toMatch(/:where\(select\)[^{]*\{[^}]*padding-right: var\(--ca-2\)/);
	});

	it("src/admin has no browser details or summary element", () => {
		const root = join(__dirname, "../src/admin");
		const bad: string[] = [];
		const walk = (d: string) => {
			for (const f of readdirSync(d)) {
				const p = join(d, f);
				if (statSync(p).isDirectory()) walk(p);
				else if (/\.tsx?$/.test(f) && /<(details|summary)\b/.test(readFileSync(p, "utf8"))) bad.push(f);
			}
		};
		walk(root);
		expect(bad).toEqual([]);
	});
});

describe("connection state and provider errors", () => {
	it("reads Bing throttling as Throttled and names the provider code", () => {
		const throttled = { configured: true, status: "error" as const, lastError: "Bing Webmaster answered 400 (ThrottleIP)." };
		expect(connectionState(throttled)).toBe("throttled");
		expect(providerCode(throttled.lastError)).toBe("ThrottleIP");
		expect(explainError("bing", throttled.lastError)).toMatch(/shared server addresses.*next scheduled run/);
		expect(connectionState({ configured: true, status: "error", lastError: "Google answered 400 (invalid_grant)." })).toBe("error");
		expect(providerCode("Bing Webmaster answered 401.")).toBe("HTTP 401");
		expect(connectionState({ configured: false, status: null, lastError: null })).toBe("not_connected");
		expect(connectionState({ configured: true, status: "ok", lastError: null })).toBe("connected");
	});
});

describe("Search connection cards", () => {
	let sources: Array<Record<string, unknown>> = [];
	const src = (id: "google" | "bing", o: Record<string, unknown> = {}) => ({ id, configured: true, property: id === "google" ? "sc-domain:example.com" : "https://example.com/", lastRun: "2026-03-12T07:00:00.000Z", status: "ok", lastError: null, lastErrorAt: null, syncing: false, rows: 10, firstDay: "2026-03-01", lastDay: "2026-03-11", backfill: null, ...o });
	const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
	beforeEach(() => {
		resetSearchStatus();
		window.history.replaceState(null, "", "/_emdash/admin/plugins/cookieless-analytics/search?from=2026-03-01&to=2026-03-07");
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				const route = url.split("/plugins/")[1]?.split("/").slice(1).join("/") ?? "";
				if (route === "sites/list") return ok({ sites: [{ id: "main", label: "This site", local: true, kind: "local", timezone: "UTC" }] });
				if (route === "search/status") return ok({ site: "main", kind: "local", sources, provisional: { from: "2026-03-10", to: "2026-03-12" } });
				if (route === "data/query") return ok({ report: "x", range: {}, compare: "none", compareRange: null, notices: [], data: { rows: [], series: [], totals: {} } });
				return ok({ items: [] });
			}),
		);
	});
	const card = (name: RegExp) => screen.getByRole("group", { name });

	it("not connected: both cards with the badge, labeled fields and the redirect URI to copy", async () => {
		sources = [src("google", { configured: false, property: "" }), src("bing", { configured: false, property: "" })];
		render(<Search />);
		await screen.findByRole("heading", { name: "Connect a Search source" });
		const google = card(/Google Search Console/);
		expect(google.getAttribute("data-state")).toBe("not_connected");
		fireEvent.click(within(google).getByRole("button", { name: "Connect Google Search Console" }));
		expect(within(google).getByText("Not connected")).toBeTruthy();
		expect(within(google).getByText(/\/_emdash\/admin\/plugins\/cookieless-analytics\/search$/).tagName).toBe("CODE");
		expect(within(google).getByRole("button", { name: "Copy redirect URI" })).toBeTruthy();
		expect(within(google).getByLabelText("Client ID")).toBeTruthy();
		expect(within(card(/Bing Webmaster Tools/)).getByText("Not connected")).toBeTruthy();
	});

	it("connected, error and throttled: badge and code per card; the plain explanation once, on top", async () => {
		sources = [src("google", { status: "error", lastError: "Google answered 400 (invalid_grant)." }), src("bing", { status: "error", lastError: "Bing Webmaster answered 400 (ThrottleIP)." })];
		render(<Search />);
		await screen.findByRole("tablist");
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("invalid_grant");
		expect(alert.textContent).toContain("Connect Google again");
		const note = screen.getAllByRole("status").find((n) => n.textContent?.includes("ThrottleIP")) as HTMLElement;
		expect(note.textContent).toMatch(/limits shared server addresses.*next scheduled run/);
		// A failed sync opens Connections by itself.
		const google = card(/Google Search Console/);
		const bing = card(/Bing Webmaster Tools/);
		expect(google.getAttribute("data-state")).toBe("error");
		expect(within(google).getByText("Error")).toBeTruthy();
		expect(within(google).getByText("invalid_grant").tagName).toBe("CODE");
		expect(within(google).queryByRole("alert")).toBeNull();
		expect(bing.getAttribute("data-state")).toBe("throttled");
		expect(within(bing).getByText("Throttled")).toBeTruthy();
		expect(within(bing).getByText("ThrottleIP").tagName).toBe("CODE");
	});

	it("connected: Connected badges and the last sync on the card", async () => {
		sources = [src("google"), src("bing")];
		render(<Search />);
		await screen.findByRole("tablist");
		// Nothing is wrong, so Connections starts closed.
		const toggle = screen.getByRole("button", { name: "Connections" });
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(toggle);
		for (const name of [/Google Search Console/, /Bing Webmaster Tools/]) {
			const c = card(name);
			expect(c.getAttribute("data-state")).toBe("connected");
			expect(within(c).getByText("Connected")).toBeTruthy();
			expect(c.textContent).toContain("2026-03-12 07:00");
		}
	});
});

describe("token rule", () => {
	it("no inline style in src/admin holds a hex color or an rgb() literal", () => {
		const root = join(__dirname, "../src/admin");
		const files: string[] = [];
		const walk = (d: string) => {
			for (const f of readdirSync(d)) {
				const p = join(d, f);
				if (statSync(p).isDirectory()) walk(p);
				else if (/\.tsx?$/.test(f)) files.push(p);
			}
		};
		walk(root);
		const bad: string[] = [];
		for (const f of files) {
			const text = readFileSync(f, "utf8");
			for (const m of text.matchAll(/style=\{\{([^}]*)\}\}/g)) if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(m[1] ?? "")) bad.push(`${f}: ${m[0]}`);
		}
		expect(files.length).toBeGreaterThan(20);
		expect(bad).toEqual([]);
	});
});
