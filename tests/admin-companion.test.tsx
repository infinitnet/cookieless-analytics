// @vitest-environment jsdom
/** The handoff to the registry companion: the hello once per session, only to the right companion, and the notice. */
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANION_PUBLISHER_DID, COMPANION_SLUG, CONTRACT_VERSION, isCompanionHello, PLUGIN_ID, VERSION } from "../src/contract.js";

type Item = { id: string; enabled: boolean; source?: string; registryPublisherDid?: string; registrySlug?: string };
const REGISTRY: Item = { id: "r_abcdefghijklmnop", enabled: true, source: "registry", registryPublisherDid: COMPANION_PUBLISHER_DID, registrySlug: COMPANION_SLUG };
const OTHER: Item = { id: "seo-kit", enabled: true, source: "config" };

let list: () => Promise<Response>;
let calls: Array<{ url: string; init: RequestInit | undefined }> = [];
const ok = (items: Item[]) => async () => new Response(JSON.stringify({ data: { items } }), { status: 200, headers: { "content-type": "application/json" } });
const hellos = () => calls.filter((c) => c.url.endsWith("/hello"));

/** A fresh module, as on a new page load in the same browser session. */
const load = async () => {
	vi.resetModules();
	return import("../src/admin/companion.js");
};

// Node's own storage globals hide jsdom's under vitest; plain in-memory stores stand in.
const store = (name: "localStorage" | "sessionStorage") => {
	const m = new Map<string, string>();
	vi.stubGlobal(name, { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
};

beforeEach(() => {
	store("localStorage");
	store("sessionStorage");
	calls = [];
	list = ok([OTHER, REGISTRY]);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			if (url === "/_emdash/api/admin/plugins") return list();
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("hello to the companion", () => {
	it("posts the hello once per session to an enabled registry companion of the right publisher", async () => {
		const { CompanionNotice } = await load();
		render(
			<>
				<CompanionNotice />
				<CompanionNotice />
			</>,
		);
		await waitFor(() => expect(screen.getAllByText(/is still installed/)).toHaveLength(2));
		expect(hellos()).toHaveLength(1);
		const [hello] = hellos();
		expect(hello?.url).toBe(`/_emdash/api/plugins/${REGISTRY.id}/hello`);
		expect(hello?.init?.method).toBe("POST");
		expect(new Headers(hello?.init?.headers).get("X-EmDash-Request")).toBe("1");
		const body = JSON.parse(String(hello?.init?.body));
		expect(body).toEqual({ v: 1, product: PLUGIN_ID, pluginVersion: VERSION, contractVersion: CONTRACT_VERSION });
		expect(isCompanionHello(body)).toBe(true);

		// A later Overview in the same session: the list is read again, no second hello, the notice still shows.
		cleanup();
		const again = await load();
		render(<again.CompanionNotice />);
		await screen.findByText(/is still installed/);
		expect(calls.filter((c) => c.url === "/_emdash/api/admin/plugins")).toHaveLength(2);
		expect(hellos()).toHaveLength(1);

		// Removed in the same session: the next Overview shows no notice.
		cleanup();
		list = ok([OTHER]);
		render(<again.CompanionNotice />);
		expect(await again.companionPresent()).toBe(false);
		expect(screen.queryByText(/is still installed/)).toBeNull();
	});

	it("posts to a config-managed install under its slug", async () => {
		list = ok([{ id: COMPANION_SLUG, enabled: true, source: "config" }]);
		const { companionPresent } = await load();
		expect(await companionPresent()).toBe(true);
		expect(hellos().map((c) => c.url)).toEqual([`/_emdash/api/plugins/${COMPANION_SLUG}/hello`]);
	});

	it.each([
		["a disabled companion", ok([{ ...REGISTRY, enabled: false }])],
		["another publisher", ok([{ ...REGISTRY, registryPublisherDid: "did:plc:someoneelse" }])],
		["another slug", ok([{ ...REGISTRY, registrySlug: "cookieless-analytics-helper" }])],
		["the slug as id from the registry", ok([{ id: COMPANION_SLUG, enabled: true, source: "registry" }])],
		["no companion", ok([OTHER])],
		["a missing permission (403)", async () => new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status: 403 })],
		["a failed list call (500)", async () => new Response("{}", { status: 500 })],
		["a network failure", async () => Promise.reject(new TypeError("offline"))],
		["an unexpected body", async () => new Response(JSON.stringify({ data: { items: "x" } }), { status: 200 })],
	])("sends nothing and shows no notice for %s", async (_name, answer) => {
		list = answer as () => Promise<Response>;
		const { CompanionNotice, companionPresent } = await load();
		render(<CompanionNotice />);
		expect(await companionPresent()).toBe(false);
		expect(hellos()).toEqual([]);
		expect(screen.queryByText(/is still installed/)).toBeNull();
	});

	it.each([
		["a network failure", async () => Promise.reject(new TypeError("offline"))],
		["a 500", async () => new Response("{}", { status: 500 })],
	])("a hello lost to %s is silent, the notice still shows, and the next Overview sends it again", async (_name, fail) => {
		let helloAnswer: () => Promise<Response> = fail;
		const posted: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				if (!url.endsWith("/hello")) return ok([REGISTRY])();
				posted.push(url);
				return helloAnswer();
			}),
		);
		const { CompanionNotice, companionPresent } = await load();
		render(<CompanionNotice />);
		expect(await screen.findByText(/is still installed/)).toBeTruthy();
		helloAnswer = async () => new Response("{}", { status: 200 });
		await companionPresent();
		await companionPresent();
		expect(posted).toHaveLength(2);
	});
});

describe("companion notice", () => {
	it("shows, hides on Hide and stays hidden in this browser", async () => {
		const { CompanionNotice, COMPANION_TEXT, PLUGINS_HREF } = await load();
		render(<CompanionNotice />);
		expect(await screen.findByText(COMPANION_TEXT)).toBeTruthy();
		expect(COMPANION_TEXT).toBe("Cookieless Analytics Companion is still installed. Setup is complete, so you can remove it under Plugins.");
		const open = screen.getByRole("link", { name: "Open Plugins" });
		expect(open.getAttribute("href")).toBe(PLUGINS_HREF);
		const hide = screen.getByRole("button", { name: "Hide" });
		for (const el of [open, hide]) expect(el.style.minHeight).toBe("44px");
		fireEvent.click(hide);
		expect(screen.queryByText(COMPANION_TEXT)).toBeNull();

		// A new session in the same browser: the hello is sent again, the notice stays hidden.
		cleanup();
		store("sessionStorage");
		const again = await load();
		render(<again.CompanionNotice />);
		await waitFor(() => expect(hellos()).toHaveLength(2));
		// Let the check resolve and the component settle before asserting the notice stays away.
		await act(async () => {
			await again.companionPresent();
		});
		expect(screen.queryByText(COMPANION_TEXT)).toBeNull();
		// The same render without the hide pref does show it, so the line above tests the pref.
		cleanup();
		store("localStorage");
		render(<again.CompanionNotice />);
		expect(await screen.findByText(COMPANION_TEXT)).toBeTruthy();
	});

	it("is mounted on the Overview page", () => {
		expect(readFileSync("src/admin/pages/Overview.tsx", "utf8")).toContain("<CompanionNotice />");
	});
});

describe("isCompanionHello", () => {
	const good = { v: 1, product: PLUGIN_ID, pluginVersion: "1.1.0", contractVersion: 1 };
	it("accepts the exact payload, also with a prerelease or a later contract", () => {
		expect(isCompanionHello(good)).toBe(true);
		expect(isCompanionHello({ ...good, pluginVersion: "2.0.0-rc.1", contractVersion: 2 })).toBe(true);
	});
	it.each([
		["null", null],
		["an array", [good]],
		["an extra key", { ...good, x: 1 }],
		["a missing key", { v: 1, product: PLUGIN_ID, pluginVersion: "1.1.0" }],
		["another version", { ...good, v: 2 }],
		["another product", { ...good, product: "other" }],
		["a bad version", { ...good, pluginVersion: "1.1" }],
		["a long version", { ...good, pluginVersion: `1.1.0-${"a".repeat(40)}` }],
		["contract 0", { ...good, contractVersion: 0 }],
		["a fractional contract", { ...good, contractVersion: 1.5 }],
		["a string contract", { ...good, contractVersion: "1" }],
	])("rejects %s", (_name, body) => {
		expect(isCompanionHello(body)).toBe(false);
	});
});
