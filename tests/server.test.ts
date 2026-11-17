/** `recordEvent` from `./server`, with a stub dispatcher. Hosts are invented. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLUGIN_ID } from "../src/contract.js";
import { recordEvent } from "../src/server.js";

function visitor(): Request {
	const req = new Request("https://example.com/checkout/done", {
		headers: {
			"user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36",
			"accept-language": "de-DE,de;q=0.9",
			cookie: "session=abc",
			origin: "https://example.com",
			referer: "https://example.com/cart",
			"cf-connecting-ip": "203.0.113.7",
			"x-forwarded-for": "203.0.113.7",
			"sec-gpc": "1",
			dnt: "1",
			"sec-ch-ua-mobile": "?0",
			"sec-ch-ua-platform": '"Linux"',
		},
	});
	(req as unknown as { cf: object }).cf = { country: "DE", region: "Berlin" };
	return req;
}

function stub(result: unknown) {
	const calls: Array<{ id: string; method: string; path: string; request: Request; body: string }> = [];
	const locals = {
		emdash: {
			handlePublicPluginApiRoute: async (id: string, method: string, path: string, request: Request) => {
				calls.push({ id, method, path, request, body: await request.text() });
				if (result instanceof Error) throw result;
				return result;
			},
		},
	};
	return { locals, calls };
}

describe("recordEvent", () => {
	it("posts the event body to the in route with the copied visitor values and nothing else", async () => {
		const { locals, calls } = stub({ success: true, data: new Response(null, { status: 204 }) });
		const r = await recordEvent(locals, { name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001", p: { plan: "pro" } }, visitor());
		expect(r).toEqual({ ok: true });
		expect(calls).toHaveLength(1);
		const c = calls[0]!;
		expect([c.id, c.method, c.path, c.request.method]).toEqual([PLUGIN_ID, "POST", "/in", "POST"]);
		expect(JSON.parse(c.body)).toEqual({ v: 1, t: "ev", name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001", p: { plan: "pro" } });
		expect(c.request.headers.get("user-agent")).toContain("Chrome/130.0");
		expect(c.request.headers.get("accept-language")).toBe("de-DE,de;q=0.9");
		expect((c.request as unknown as { cf: unknown }).cf).toEqual({ country: "DE", region: "Berlin" });
		// The address and the privacy signals let the event join the visitor's session and honour the signals.
		expect(Object.fromEntries(["cf-connecting-ip", "sec-gpc", "dnt", "sec-ch-ua-mobile", "sec-ch-ua-platform"].map((h) => [h, c.request.headers.get(h)]))).toEqual({
			"cf-connecting-ip": "203.0.113.7",
			"sec-gpc": "1",
			dnt: "1",
			"sec-ch-ua-mobile": "?0",
			"sec-ch-ua-platform": '"Linux"',
		});
		for (const h of ["origin", "cookie", "referer", "x-forwarded-for"]) expect(c.request.headers.has(h), h).toBe(false);
	});

	it("copies no header the visitor request lacks", async () => {
		const { locals, calls } = stub({ success: true, data: new Response(null, { status: 204 }) });
		await recordEvent(locals, { name: "out", p: { slug: "alpha-offer" } }, new Request("https://example.com/go/alpha-offer", { headers: { "user-agent": "Mozilla/5.0 Chrome/130.0" } }));
		expect([...calls[0]!.request.headers.keys()].sort()).toEqual(["content-type", "user-agent"]);
	});

	it("returns null without a dispatcher or without the route, and never throws", async () => {
		expect(await recordEvent({}, { name: "signup" }, visitor())).toBeNull();
		expect(await recordEvent(undefined, { name: "signup" }, visitor())).toBeNull();
		expect(await recordEvent({ emdash: {} }, { name: "signup" }, visitor())).toBeNull();
		expect(await recordEvent(stub({ success: false, error: { code: "NOT_FOUND", message: "Plugin route not found" } }).locals, { name: "signup" }, visitor())).toBeNull();
		expect(await recordEvent(stub(new Error("boom")).locals, { name: "signup" }, visitor())).toEqual({ ok: false });
		expect(await recordEvent(stub({ success: false, error: { code: "X", message: "x" } }).locals, { name: "signup" }, visitor())).toEqual({ ok: false });
	});

	it("is not ok when the route answers 503 (not stored; send it again with the same h)", async () => {
		expect(await recordEvent(stub({ success: true, data: { status: 503, headers: [["retry-after", "5"]], body: null } }).locals, { name: "signup", h: "eeeeeeeeeee1" }, visitor())).toEqual({ ok: false });
		expect(await recordEvent(stub({ success: true, data: { status: 204, headers: [], body: null } }).locals, { name: "signup" }, visitor())).toEqual({ ok: true });
	});

	it("is the ./server package export, built next to ./contract", async () => {
		const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
		expect(pkg.exports["./server"]).toEqual({ types: "./dist/server.d.mts", default: "./dist/server.mjs" });
		expect(readFileSync(new URL("../tsdown.config.ts", import.meta.url), "utf8")).toContain('"src/server.ts"');
		const mod = await import("@infinitnet/cookieless-analytics/server");
		expect(typeof mod.recordEvent).toBe("function");
	});
});
