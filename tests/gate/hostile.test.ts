/**
 * Hostile checks on the public page at run time. The served script (`scriptBody`, the bytes a
 * visitor gets) runs in jsdom with every storage surface, the cookie jar and the history API trapped; the page is
 * loaded, clicked, scrolled, hidden and left. Then: no cookie read or written, no storage touched, no history call
 * at all, and no change to any link or to the address, also for links to and pages of linked hosts.
 */
import { JSDOM, VirtualConsole } from "jsdom";
import { describe, expect, it } from "vitest";
import { scriptBody } from "../../src/client/serve.js";
import { normalizeSettings } from "../../src/settings.js";

const SID = "abcdefghij0123456789";
const LINKED = "shop.example.net";
const HTML = `<!doctype html><html><head></head><body style="height:4000px">
<a id="int" href="/next">internal</a>
<a id="intq" href="/next?x=1">internal with query</a>
<a id="abs" href="https://example.org/abs">internal absolute</a>
<a id="shop" href="https://${LINKED}/cart">linked host</a>
<a id="ext" href="https://other.example/x">external</a>
<a id="dl" href="/files/a.pdf">download</a>
<button id="cta" data-ec-event="cta">cta</button>
<form id="f" action="/subscribe"><button id="go" type="submit">go</button></form>
</body></html>`;

type Win = JSDOM["window"] & Record<string, unknown>;

/** A page with traps on every surface the script must not touch. */
function trapped(url: string) {
	const dom = new JSDOM(HTML, { url, referrer: "https://search.example/", runScripts: "outside-only", virtualConsole: new VirtualConsole() });
	const w = dom.window as unknown as Win;
	const touched: string[] = [];
	const history: string[] = [];
	const sent: unknown[] = [];
	for (const name of ["localStorage", "sessionStorage", "indexedDB", "caches", "cookieStore", "openDatabase"])
		Object.defineProperty(w, name, { configurable: true, get: () => (touched.push(name), undefined) });
	Object.defineProperty(w.Document.prototype, "cookie", { configurable: true, get: () => (touched.push("cookie read"), ""), set: () => void touched.push("cookie write") });
	const h = w.history;
	for (const m of ["pushState", "replaceState", "back", "forward", "go"] as const) Object.defineProperty(h, m, { configurable: true, value: () => void history.push(m) });
	Object.defineProperty(w.navigator, "sendBeacon", { value: (_u: string, b: string) => (sent.push(JSON.parse(b)), true) });
	Object.defineProperty(w, "fetch", { value: (_u: string, init: RequestInit) => (sent.push(JSON.parse(String(init.body))), Promise.resolve({ status: 204, headers: new Headers() })) });
	if (!w.crypto) Object.defineProperty(w, "crypto", { value: globalThis.crypto });
	// jsdom reports a hidden document unless told otherwise; a visitor's tab is visible.
	Object.defineProperty(w.document, "hidden", { configurable: true, get: () => false });
	w.addEventListener("click", (e) => e.preventDefault());
	w.addEventListener("submit", (e) => e.preventDefault());
	const hrefs = () => [...w.document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
	return { dom, w, touched, history, sent, hrefs };
}

/** Load the served script and act like a visitor: clicks on every link and control, a scroll, a hidden tab, leaving. */
function visit(url: string, linked: readonly string[] = [LINKED], over: Record<string, unknown> = {}) {
	const p = trapped(url);
	const before = p.hrefs();
	p.w.eval(scriptBody(normalizeSettings(over), true, linked));
	for (const a of p.w.document.querySelectorAll("a, button")) (a as HTMLElement).click();
	p.w.document.getElementById("f")?.dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
	p.w.dispatchEvent(new p.w.Event("scroll"));
	Object.defineProperty(p.w.document, "hidden", { configurable: true, get: () => true });
	p.w.document.dispatchEvent(new p.w.Event("visibilitychange"));
	p.w.dispatchEvent(new p.w.Event("pagehide"));
	return { ...p, before };
}

describe("gate: hostile checks on the public page", () => {
	it("the served script on the main host: no cookie, no storage, no history call, no link changed", () => {
		const p = visit("https://example.org/a?b=1");
		expect(p.sent.length).toBeGreaterThan(0); // it did run and send the page view
		expect(p.touched).toEqual([]);
		expect(p.history).toEqual([]);
		expect(p.hrefs()).toEqual(p.before);
		expect(p.hrefs().some((h) => h?.includes("#"))).toBe(false);
	});

	it("the served script on a linked host's page: the same, and the main host is not outbound", () => {
		const p = visit(`https://${LINKED}/product`, [LINKED]);
		expect(p.touched).toEqual([]);
		expect(p.history).toEqual([]);
		expect(p.hrefs()).toEqual(p.before);
	});

	it("a fragment of any kind, a sid-like one included, stays in the address, is not adopted as the sid, and no history call is made", () => {
		for (const hash of [`#${SID}`, "#top"]) {
			const p = visit(`https://example.org/a?b=1${hash}`);
			expect(p.history).toEqual([]);
			expect(p.w.location.href).toBe(`https://example.org/a?b=1${hash}`);
			expect(p.touched).toEqual([]);
			const pv = p.sent[0] as { t: string; sid: string; n: number };
			expect(pv).toMatchObject({ t: "pv", n: 1 });
			expect(pv.sid).not.toBe(SID);
		}
	});

	it("a real click on any link changes nothing: same host, linked host, external, on a linked host's page", () => {
		for (const url of ["https://example.org/a", `https://${LINKED}/product`]) {
			for (const id of ["int", "intq", "abs", "shop", "ext", "dl"]) {
				const p = visit(url, [LINKED]);
				expect(p.hrefs(), `${url} ${id}`).toEqual(p.before);
				expect(p.touched, `${url} ${id}`).toEqual([]);
				expect(p.history, `${url} ${id}`).toEqual([]);
			}
		}
	});
});
