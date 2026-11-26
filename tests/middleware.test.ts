import { pluginResponse } from "emdash";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_RULES_KEY, resetStoredAgentRules, storedAgentRules } from "../src/agents/stored.js";
import { currentAudience } from "../src/core/request-scope.js";
import { handleRequest, type MwContext, type MwDeps, resetSeen, skipRequest } from "../src/middleware-core.js";
import { normalizeSettings, type Settings } from "../src/settings.js";
import { CHROME_UA, GOOGLEBOT_UA } from "./helpers.js";

function setup(opts: { method?: string; path?: string; ua?: string; headers?: Record<string, string>; settings?: Partial<Settings>; role?: number; response?: Response } = {}) {
	const request = new Request(`https://example.org${opts.path ?? "/blog/post"}`, {
		method: opts.method ?? "GET",
		headers: { "user-agent": opts.ua ?? CHROME_UA, ...opts.headers },
		...(opts.method === "POST" ? { body: '{"v":1}' } : {}),
	});
	const dispatch = vi.fn(async (..._args: unknown[]) => ({ success: true, data: null }));
	const cacheSet = vi.fn();
	const ctx: MwContext = {
		request,
		url: new URL(request.url),
		locals: { emdash: { handlePublicPluginApiRoute: dispatch }, ...(opts.role !== undefined ? { user: { role: opts.role } } : {}) },
		cache: { set: cacheSet },
	};
	const response = opts.response ?? new Response("<html></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
	let audienceInNext: string | undefined;
	const next = vi.fn(async () => {
		audienceInNext = currentAudience();
		return response;
	});
	const after = vi.fn();
	const recordServerHit = vi.fn(async () => true);
	const deps: MwDeps = {
		settings: async () => normalizeSettings(opts.settings as Record<string, unknown>),
		after,
		recordServerHit,
		markSeen: vi.fn(),
	};
	return { ctx, next, deps, dispatch, cacheSet, after, recordServerHit, response, request, audience: () => audienceInNext };
}

beforeEach(() => resetSeen());

describe("script path", () => {
	it("names the linked hosts in the served script, read only for the script path", async () => {
		const linkedHosts = vi.fn(async () => ["shop.example.net"]);
		const t = setup({ path: "/_/e.js" });
		const res = await handleRequest(t.ctx, t.next, { ...t.deps, linkedHosts });
		expect(await res.text()).toContain('"l":["shop.example.net"]');
		const page = setup({ path: "/about" });
		await handleRequest(page.ctx, page.next, { ...page.deps, linkedHosts });
		expect(linkedHosts).toHaveBeenCalledTimes(1);
	});

	it("serves the script with ETag, one hour cache and nosniff, without calling next", async () => {
		const t = setup({ path: "/_/e.js" });
		const res = await handleRequest(t.ctx, t.next, t.deps);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
		expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("etag")).toMatch(/^"[a-z0-9]+"$/);
		expect((await res.text()).length).toBeGreaterThan(1000);
		expect(t.next).not.toHaveBeenCalled();
	});

	it("answers HEAD without a body and If-None-Match with 304", async () => {
		const head = setup({ path: "/_/e.js", method: "HEAD" });
		const res = await handleRequest(head.ctx, head.next, head.deps);
		expect(res.status).toBe(200);
		expect(res.body).toBeNull();
		const etag = res.headers.get("etag") as string;
		const cond = setup({ path: "/_/e.js", headers: { "if-none-match": etag } });
		expect((await handleRequest(cond.ctx, cond.next, cond.deps)).status).toBe(304);
	});

	it("leaves the path to the site when delivery is inline", async () => {
		const t = setup({ path: "/_/e.js", settings: { scriptDelivery: "inline" } });
		expect(await handleRequest(t.ctx, t.next, t.deps)).toBe(t.response);
	});
});

describe("collect path", () => {
	it("forwards the very same Request to the in route and returns 204 without a body", async () => {
		const t = setup({ path: "/_/e", method: "POST" });
		const res = await handleRequest(t.ctx, t.next, t.deps);
		expect(t.dispatch).toHaveBeenCalledOnce();
		const [id, method, path, req] = t.dispatch.mock.calls[0] as unknown[];
		expect([id, method, path]).toEqual(["cookieless-analytics", "POST", "/in"]);
		expect(req).toBe(t.request);
		expect(res.status).toBe(204);
		expect(res.body).toBeNull();
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(t.next).not.toHaveBeenCalled();
	});

	it("drops editors (role 30) with 204 and no dispatch", async () => {
		const t = setup({ path: "/_/e", method: "POST", role: 30 });
		expect((await handleRequest(t.ctx, t.next, t.deps)).status).toBe(204);
		expect(t.dispatch).not.toHaveBeenCalled();
	});

	it("forwards foreign-origin posts (the in route applies the origin rule) and answers 204 with allow-origin *", async () => {
		const cross = setup({ path: "/_/e", method: "POST", headers: { origin: "https://blog.example.net" } });
		const res = await handleRequest(cross.ctx, cross.next, cross.deps);
		expect(res.status).toBe(204);
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(cross.dispatch).toHaveBeenCalledOnce();
		expect((cross.dispatch.mock.calls[0] as unknown[])[3]).toBe(cross.request);
		const same = setup({ path: "/_/e", method: "POST", headers: { origin: "https://example.org" } });
		expect((await handleRequest(same.ctx, same.next, same.deps)).headers.get("access-control-allow-origin")).toBe("*");
		expect(same.dispatch).toHaveBeenCalledOnce();
	});

	it("answers OPTIONS on collectPath with the four CORS headers and no-store, without dispatch", async () => {
		const t = setup({ path: "/_/e", method: "OPTIONS", headers: { origin: "https://blog.example.net", "access-control-request-method": "POST" } });
		const res = await handleRequest(t.ctx, t.next, t.deps);
		expect(res.status).toBe(204);
		expect(res.body).toBeNull();
		expect(Object.fromEntries(res.headers)).toEqual({
			"access-control-allow-origin": "*",
			"access-control-allow-methods": "POST",
			"access-control-allow-headers": "content-type",
			"access-control-max-age": "86400",
			"cache-control": "no-store",
		});
		expect(t.dispatch).not.toHaveBeenCalled();
		expect(t.next).not.toHaveBeenCalled();
	});

	it("adds no CORS header on any other path or method", async () => {
		for (const [method, path] of [["GET", "/_/e"], ["OPTIONS", "/blog/post"], ["POST", "/_/e.js"], ["GET", "/blog/post"], ["GET", "/_/e.js"]]) {
			const t = setup({ method, path, headers: { origin: "https://blog.example.net" }, response: new Response(null, { status: 200 }) });
			const res = await handleRequest(t.ctx, t.next, t.deps);
			expect(res.headers.get("access-control-allow-origin"), `${method} ${path}`).toBeNull();
		}
	});

	it("drops editors only on same-origin requests", async () => {
		const same = setup({ path: "/_/e", method: "POST", role: 40, headers: { origin: "https://example.org" } });
		expect((await handleRequest(same.ctx, same.next, same.deps)).status).toBe(204);
		expect(same.dispatch).not.toHaveBeenCalled();
		const cross = setup({ path: "/_/e", method: "POST", role: 40, headers: { origin: "https://blog.example.net" } });
		await handleRequest(cross.ctx, cross.next, cross.deps);
		expect(cross.dispatch).toHaveBeenCalledOnce();
	});

	it("a preflight that asks for the proxy headers is still allowed content-type only, so no browser can send the proxy secret", async () => {
		const asked = "content-type, x-ec-proxy-key, x-ec-client-ip, x-ec-country";
		const t = setup({ path: "/_/e", method: "OPTIONS", headers: { origin: "https://blog.example.net", "access-control-request-method": "POST", "access-control-request-headers": asked } });
		const res = await handleRequest(t.ctx, t.next, t.deps);
		// Exactly this value: a browser refuses to send a cross-origin post with any header that is not in it.
		expect(res.headers.get("access-control-allow-headers")).toBe("content-type");
		expect([...res.headers.keys()].sort()).toEqual(["access-control-allow-headers", "access-control-allow-methods", "access-control-allow-origin", "access-control-max-age", "cache-control"]);
		expect(res.headers.has("access-control-allow-credentials")).toBe(false);
		expect(t.dispatch).not.toHaveBeenCalled();
	});

	it("hands a server proxy's post to the in route untouched, with its three headers", async () => {
		const sent = { origin: "https://blog.example.net", "x-ec-proxy-key": "A".repeat(43), "x-ec-client-ip": "203.0.113.7", "x-ec-country": "FR" };
		const t = setup({ path: "/_/e", method: "POST", headers: sent });
		await handleRequest(t.ctx, t.next, t.deps);
		const req = (t.dispatch.mock.calls[0] as unknown[])[3] as Request;
		expect(req).toBe(t.request);
		for (const [name, value] of Object.entries(sent)) expect(req.headers.get(name), name).toBe(value);
	});

	it("passes on the proxy ceiling's 503 with its own Retry-After, the seconds to the next minute", async () => {
		const t = setup({ path: "/_/e", method: "POST", headers: { origin: "https://blog.example.net" } });
		t.dispatch.mockResolvedValueOnce({ success: true, data: pluginResponse({ status: 503, headers: { "retry-after": "30" } }) } as never);
		const res = await handleRequest(t.ctx, t.next, t.deps);
		expect([res.status, res.headers.get("retry-after"), res.headers.get("access-control-expose-headers")]).toEqual([503, "30", "retry-after"]);
	});

	it("other methods on the plugin paths go to the site and are never logged", async () => {
		for (const [method, path] of [["GET", "/_/e"], ["POST", "/_/e.js"]]) {
			const t = setup({ method, path, response: new Response(null, { status: 404 }) });
			expect(await handleRequest(t.ctx, t.next, t.deps)).toBe(t.response);
			expect(t.after).not.toHaveBeenCalled();
		}
	});

	it("passes on the route's 503 with Retry-After, readable cross-origin; any other answer is 204", async () => {
		const t = setup({ path: "/_/e", method: "POST", headers: { origin: "https://blog.example.net" } });
		t.dispatch.mockResolvedValueOnce({ success: true, data: pluginResponse({ status: 503, headers: { "retry-after": "5" } }) } as never);
		const res = await handleRequest(t.ctx, t.next, t.deps);
		expect(res.status).toBe(503);
		expect(Object.fromEntries(res.headers)).toEqual({ "access-control-allow-origin": "*", "access-control-expose-headers": "retry-after", "cache-control": "no-store", "retry-after": "5" });
		expect(await res.text()).toBe("");
		// Without Retry-After (do not send again) the 503 carries no retry header.
		t.dispatch.mockResolvedValueOnce({ success: true, data: pluginResponse({ status: 503 }) } as never);
		expect(Object.fromEntries((await handleRequest(t.ctx, t.next, t.deps)).headers)).toEqual({ "access-control-allow-origin": "*", "cache-control": "no-store" });
		t.dispatch.mockResolvedValueOnce({ success: true, data: pluginResponse({ status: 204 }) } as never);
		expect((await handleRequest(t.ctx, t.next, t.deps)).status).toBe(204);
		t.dispatch.mockResolvedValueOnce({ success: false, error: { code: "X", message: "x" } } as never);
		expect((await handleRequest(t.ctx, t.next, t.deps)).status).toBe(204);
		// The host's own 503 (not ready) is passed on with Retry-After too.
		t.dispatch.mockResolvedValueOnce({ success: false, status: 503, error: { code: "STORAGE_INDEXES_NOT_READY", message: "x" } } as never);
		const host = await handleRequest(t.ctx, t.next, t.deps);
		expect([host.status, host.headers.get("retry-after")]).toEqual([503, "5"]);
		expect(t.next).not.toHaveBeenCalled();
	});

	it("answers 503 without Retry-After when the dispatcher throws: not stored, and not sent again", async () => {
		const t = setup({ path: "/_/e", method: "POST" });
		t.dispatch.mockRejectedValueOnce(new Error("boom"));
		const res = await handleRequest(t.ctx, t.next, t.deps);
		expect(res.status).toBe(503);
		expect(res.headers.get("retry-after")).toBeNull();
		// No dispatcher at all: the same answer.
		const n = setup({ path: "/_/e", method: "POST" });
		(n.ctx.locals as { emdash?: unknown }).emdash = undefined;
		expect((await handleRequest(n.ctx, n.next, n.deps)).status).toBe(503);
	});
});

describe("skip rules", () => {
	it.each(["/_emdash/x", "/_astro/a.js", "/_image?x=1", "/a?_preview=1", "/a?_edit=1", "/style.css", "/logo.png"])("skips %s", async (path) => {
		const t = setup({ path, response: new Response(null, { status: 404 }) });
		expect(await handleRequest(t.ctx, t.next, t.deps)).toBe(t.response);
		expect(t.after).not.toHaveBeenCalled();
		expect(t.deps.markSeen).not.toHaveBeenCalled();
	});

	it("skips the edit-mode cookie but not robots.txt", () => {
		expect(skipRequest(new URL("https://e.org/a"), new Request("https://e.org/a", { headers: { cookie: "x=1; emdash-edit-mode=true" } }))).toBe(true);
		expect(skipRequest(new URL("https://e.org/robots.txt"), new Request("https://e.org/robots.txt"))).toBe(false);
	});
});

describe("server hits", () => {
	it("a 404 schedules exactly one after callback and returns the same Response object", async () => {
		const t = setup({ response: new Response("nope", { status: 404, headers: { "content-type": "text/html" } }) });
		const res = await handleRequest(t.ctx, t.next, t.deps);
		expect(res).toBe(t.response);
		expect(t.after).toHaveBeenCalledOnce();
		expect(t.recordServerHit).not.toHaveBeenCalled();
		await (t.after.mock.calls[0]?.[0] as () => Promise<unknown>)();
		expect(t.recordServerHit).toHaveBeenCalledWith(expect.objectContaining({ status: 404, url: "/blog/post", method: "GET", classification: { audience: "human" } }));
		expect(res.bodyUsed).toBe(false);
	});

	it("a 200 HTML page schedules nothing", async () => {
		const t = setup({ ua: GOOGLEBOT_UA });
		expect(await handleRequest(t.ctx, t.next, t.deps)).toBe(t.response);
		expect(t.after).not.toHaveBeenCalled();
	});

	it("a bot 404 schedules nothing", async () => {
		const t = setup({ ua: GOOGLEBOT_UA, response: new Response("nope", { status: 404, headers: { "content-type": "text/html" } }) });
		await handleRequest(t.ctx, t.next, t.deps);
		expect(t.after).not.toHaveBeenCalled();
	});

	it("applies the site's user agent rules from the options key, in both directions", async () => {
		const kv = new Map<string, unknown>([[AGENT_RULES_KEY, [{ pattern: "acmesitewatch", mode: "contains", action: "robot" }, { pattern: "Googlebot", mode: "contains", action: "human" }]]]);
		const get = vi.fn(async (k: string) => kv.get(k) ?? null);
		resetStoredAgentRules();
		const agentRules = () => storedAgentRules({ get } as never);
		const notFound = () => new Response("nope", { status: 404, headers: { "content-type": "text/html" } });
		const bot = setup({ ua: "AcmeSiteWatch/2.0 internal tool", response: notFound() });
		await handleRequest(bot.ctx, bot.next, { ...bot.deps, agentRules });
		expect(bot.after).not.toHaveBeenCalled();
		expect(bot.ctx.locals.__ec).toMatchObject({ audience: "robot" });
		const human = setup({ ua: GOOGLEBOT_UA, response: notFound() });
		await handleRequest(human.ctx, human.next, { ...human.deps, agentRules });
		expect(human.after).toHaveBeenCalledOnce();
		await (human.after.mock.calls[0]?.[0] as () => Promise<unknown>)();
		expect(human.recordServerHit).toHaveBeenCalledWith(expect.objectContaining({ classification: expect.objectContaining({ audience: "human" }) }));
		// One read per 60 s per isolate; a rules write in this isolate drops the copy.
		expect(get).toHaveBeenCalledOnce();
		kv.set(AGENT_RULES_KEY, []);
		resetStoredAgentRules();
		const after = setup({ ua: "AcmeSiteWatch/2.0 internal tool", response: notFound() });
		await handleRequest(after.ctx, after.next, { ...after.deps, agentRules });
		expect(after.after).toHaveBeenCalledOnce();
		resetStoredAgentRules();
	});

	it("marks the middleware as seen at most every 10 minutes", async () => {
		const a = setup();
		await handleRequest(a.ctx, a.next, a.deps);
		const b = setup();
		await handleRequest(b.ctx, b.next, b.deps);
		expect(a.deps.markSeen).toHaveBeenCalledOnce();
		expect(b.deps.markSeen).not.toHaveBeenCalled();
	});
});

describe("route cache and request locals", () => {
	it("never touches the route cache", async () => {
		const t = setup();
		await handleRequest(t.ctx, t.next, t.deps);
		expect(t.cacheSet).not.toHaveBeenCalled();
	});

	it("sets locals.<namespace> from the UA classification", async () => {
		const t = setup({ ua: GOOGLEBOT_UA });
		await handleRequest(t.ctx, t.next, t.deps);
		expect(t.ctx.locals.__ec).toMatchObject({ audience: "robot", botId: expect.any(String) });
	});

	it("exposes the audience to page rendering only with skip_known_bots", async () => {
		const on = setup({ ua: GOOGLEBOT_UA, settings: { scriptForBots: "skip_known_bots" } });
		await handleRequest(on.ctx, on.next, on.deps);
		expect(on.audience()).toBe("robot");
		const off = setup({ ua: GOOGLEBOT_UA });
		await handleRequest(off.ctx, off.next, off.deps);
		expect(off.audience()).toBeUndefined();
	});
});

describe("share path", () => {
	const share = (path: string, data: unknown, opts: Parameters<typeof setup>[0] = {}) => {
		const t = setup({ path, ...opts });
		t.dispatch.mockResolvedValue({ success: true, data } as never);
		return t;
	};
	const CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
	const common = { "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "content-security-policy": CSP };

	it("answers GET before next() with the 200 headers of an open link and dispatches the very same Request", async () => {
		const t = share("/_/s/abcdefgh.token", { status: 200, html: "<!doctype html><p>ok</p>", cache: "open" });
		const res = await handleRequest(t.ctx, t.next, t.deps);
		expect(Object.fromEntries(res.headers)).toEqual({ ...common, "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" });
		expect(await res.text()).toBe("<!doctype html><p>ok</p>");
		const [id, method, path, req] = t.dispatch.mock.calls[0] as unknown[];
		expect([id, method, path]).toEqual(["cookieless-analytics", "GET", "/share/view"]);
		expect(req).toBe(t.request);
		expect(t.next).not.toHaveBeenCalled();
		expect(t.after).not.toHaveBeenCalled();
		expect(t.recordServerHit).not.toHaveBeenCalled();
	});

	it("password links are private, no-store; HEAD has the same headers and no body", async () => {
		const g = share("/_/s/t", { status: 200, html: "<p>x</p>", cache: "private" });
		const get = await handleRequest(g.ctx, g.next, g.deps);
		const t = share("/_/s/t", { status: 200, html: "<p>x</p>", cache: "private" }, { method: "HEAD" });
		const head = await handleRequest(t.ctx, t.next, t.deps);
		expect(get.headers.get("cache-control")).toBe("private, no-store");
		expect(Object.fromEntries(head.headers)).toEqual(Object.fromEntries(get.headers));
		expect(head.body).toBeNull();
		expect(head.status).toBe(200);
		expect((t.dispatch.mock.calls[0] as unknown[])[1]).toBe("GET");
	});

	it("401 carries WWW-Authenticate, 429 Retry-After without it, 404 no-store; all with a plain body", async () => {
		const a = share("/_/s/t", { status: 401, realm: "View abcdefgh" });
		const r401 = await handleRequest(a.ctx, a.next, a.deps);
		expect(r401.status).toBe(401);
		expect(Object.fromEntries(r401.headers)).toEqual({ ...common, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "www-authenticate": 'Basic realm="View abcdefgh", charset="UTF-8"' });
		const b = share("/_/s/t", { status: 429, retryAfter: 600 });
		const r429 = await handleRequest(b.ctx, b.next, b.deps);
		expect([r429.status, r429.headers.get("retry-after"), r429.headers.get("www-authenticate"), r429.headers.get("cache-control")]).toEqual([429, "600", null, "no-store"]);
		expect(await r429.text()).toMatch(/Try again later/);
		const c = share("/_/s/t", { status: 404 });
		const r404 = await handleRequest(c.ctx, c.next, c.deps);
		expect([r404.status, r404.headers.get("cache-control")]).toEqual([404, "no-store"]);
		const failed = setup({ path: "/_/s/t" });
		failed.dispatch.mockResolvedValue({ success: false, error: { code: "NOT_FOUND", message: "x" } } as never);
		expect((await handleRequest(failed.ctx, failed.next, failed.deps)).status).toBe(404);
	});

	it("answers 404 no-store without a dispatcher", async () => {
		const t = setup({ path: "/_/s/t" });
		t.ctx.locals = {};
		const res = await handleRequest(t.ctx, t.next, t.deps);
		expect([res.status, res.headers.get("cache-control")]).toEqual([404, "no-store"]);
		expect(t.next).not.toHaveBeenCalled();
	});

	it("lets other methods, the bare path and other paths fall through unchanged", async () => {
		for (const o of [{ path: "/_/s/t", method: "POST" }, { path: "/_/s" }, { path: "/_/s/" }, { path: "/_/sx/t" }]) {
			const t = setup(o);
			const res = await handleRequest(t.ctx, t.next, t.deps);
			expect(res).toBe(t.response);
			expect(t.dispatch).not.toHaveBeenCalled();
		}
	});

	it("never logs a token URL that falls through, even as an error page", async () => {
		const t = setup({ path: "/_/s/abcdefgh.secret", method: "POST", response: new Response("no", { status: 405 }) });
		expect((await handleRequest(t.ctx, t.next, t.deps)).status).toBe(405);
		expect(t.after).not.toHaveBeenCalled();
		expect(t.recordServerHit).not.toHaveBeenCalled();
	});

	it("follows a configured sharePath", async () => {
		const t = share("/view/t", { status: 404 }, { settings: { sharePath: "/view" } });
		expect((await handleRequest(t.ctx, t.next, t.deps)).status).toBe(404);
		expect(t.dispatch).toHaveBeenCalledOnce();
	});
});

describe("fail-open guard", () => {
	it("a throwing settings loader returns the next() response", async () => {
		const t = setup();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		t.deps.settings = async () => {
			throw new Error("settings down");
		};
		expect(await handleRequest(t.ctx, t.next, t.deps)).toBe(t.response);
		expect(t.next).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it("a throwing after returns the next() response without calling next() twice", async () => {
		const t = setup({ path: "/missing", response: new Response("nope", { status: 404, headers: { "content-type": "text/html" } }) });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		t.deps.after = () => {
			throw new Error("after down");
		};
		expect(await handleRequest(t.ctx, t.next, t.deps)).toBe(t.response);
		expect(t.next).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it("a throwing markSeen before next() still returns the next() response", async () => {
		const t = setup();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		t.deps.markSeen = () => {
			throw new Error("kv down");
		};
		expect(await handleRequest(t.ctx, t.next, t.deps)).toBe(t.response);
		expect(t.next).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it("a rejecting next() rejects once with the site's own error and is not called again", async () => {
		const t = setup();
		const err = new Error("site error");
		const next = vi.fn(() => Promise.reject(err));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await expect(handleRequest(t.ctx, next, t.deps)).rejects.toBe(err);
		expect(next).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
