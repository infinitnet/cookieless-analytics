// @vitest-environment jsdom
/** Editor sidebar panel: states, one fetch, the Pages link and the module export. The type check against the host admin package is scripts/check-panel-types.mjs, part of `pnpm typecheck`. */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contentEditorPanels } from "../src/admin/index.js";
import { PANEL_TEXT, pagesHref, TrafficPanel } from "../src/admin/components/TrafficPanel.js";
import { EDITOR_ROLE } from "../src/admin/panels.js";

let calls: Array<{ url: string; body: unknown }> = [];
let reply: unknown;
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
	calls = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init: RequestInit) => {
			calls.push({ url, body: JSON.parse(String(init.body)) });
			return ok(reply);
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const entry = { id: "p1", slug: "hello" };
/** The host context (`ContentEditorPanelContext`), spread so the panel gets the field it never names. */
const ctx = (over: Record<string, unknown> = {}) => ({ collection: "posts", entry, ...over });
const range = { from: "2026-02-12", to: "2026-03-13" };

describe("TrafficPanel", () => {
	it("fetches editor/traffic once and renders the figures and the Pages link", async () => {
		reply = {
			path: "/blog/hello",
			range,
			pageviews: 1234,
			visitors: 800,
			avg_time: 42.5,
			series: [{ t: "2026-03-12", pageviews: 3 }],
			sources: [{ key: "google.com", sessions: 9 }],
			search: { clicks: 3, impressions: 40, position: 5 },
			annotations: [{ ts: 1, day: "2026-03-01", kind: "publish", text: "Hello published", scope: null, summary: "" }],
			revenue: { currency: "USD", revenue: 25.5, orders: 1 },
		};
		const { findByText, getByText, rerender } = render(<TrafficPanel {...ctx({ locale: "en" })} />);
		expect(getByText(PANEL_TEXT.loading)).toBeTruthy();
		expect(await findByText("google.com (9)")).toBeTruthy();
		expect(getByText("25.50 USD (1 orders)")).toBeTruthy();
		expect(getByText("2026-03-01: Hello published")).toBeTruthy();
		const link = getByText(PANEL_TEXT.open) as HTMLAnchorElement;
		expect(link.getAttribute("href")).toBe(pagesHref("/blog/hello", range));
		expect(link.getAttribute("href")).toContain("/pages?from=2026-02-12&to=2026-03-13&f=");
		rerender(<TrafficPanel {...ctx({ locale: "en" })} />);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toMatch(/editor\/traffic$/);
		expect(calls[0]?.body).toEqual({ collection: "posts", id: "p1", slug: "hello", locale: "en" });
	});

	it("shows the empty state for a draft and the no data state for a page without visits", async () => {
		reply = { path: null };
		const draft = render(<TrafficPanel {...ctx()} />);
		expect(await draft.findByText(PANEL_TEXT.noPage)).toBeTruthy();
		cleanup();
		reply = { path: "/blog/hello", range, pageviews: 0, series: [], sources: [], annotations: [], search: null, revenue: null };
		const quiet = render(<TrafficPanel {...ctx()} />);
		expect(await quiet.findByText(PANEL_TEXT.noData)).toBeTruthy();
		expect(PANEL_TEXT.noPage).toBe("This entry has no public page yet.");
	});
});

describe("contentEditorPanels", () => {
	// The host packages are dependencies of `emdash`, resolved from its real location (pnpm layout).
	const emdashDir = realpathSync(resolve("node_modules/emdash"));
	const hostRequire = createRequire(join(emdashDir, "package.json"));

	it("exports the traffic panel with minRole equal to the Editor role, which holds plugins:read", async () => {
		expect(contentEditorPanels).toEqual([{ id: "traffic", title: "Traffic", component: TrafficPanel, minRole: 40, order: 50 }]);
		const auth = (await import(hostRequire.resolve("@emdash-cms/auth"))) as { Role: Record<string, number>; Permissions: Record<string, number> };
		expect(EDITOR_ROLE).toBe(auth.Role.EDITOR);
		expect(auth.Permissions["plugins:read"]).toBe(auth.Role.EDITOR);
	});
});
