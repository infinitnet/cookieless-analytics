import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boot, type ClientConfig } from "../src/client/boot.js";
import { clientConfig, scriptBody } from "../src/client/serve.js";
import { validateIngest } from "../src/core/ids.js";
import { linkTarget, matchLinkRule, parseLinkRules } from "../src/link-rules.js";
import { normalizeSettings } from "../src/settings.js";

const SID = "abcdefghij0123456789";
const HTML = `<!doctype html><html><head></head><body style="height:5000px">
<a id="same" href="/next">same</a>
<a id="frag" href="/next#top">frag</a>
<a id="dl" href="/files/report.pdf" download>dl</a>
<a id="pdf" href="/files/report.pdf">pdf</a>
<a id="ext" href="https://other.example/x?y=1">ext</a>
<a id="ign" href="/next2" data-ec-ignore>ign</a>
<a id="own" href="/_/e.js">own</a>
<a id="admin" href="/_emdash/admin">admin</a>
<button id="cta" data-ec-event="cta_click" data-ec-prop-plan="pro">cta</button>
<button id="buy" data-ec-event="purchase" data-ec-value="49.9" data-ec-currency="EUR" data-ec-id="A-1001">buy</button>
<form id="signup" action="/subscribe"><button id="sub" type="submit">go</button></form>
</body></html>`;

type Win = JSDOM["window"] & Record<string, unknown>;

interface PageOpts {
	url?: string;
	ua?: string;
	webdriver?: boolean;
	languages?: string[];
	hidden?: boolean;
	cfg?: Partial<ClientConfig>;
	before?: (w: Win) => void;
	/** Install a fake `fetch`: answers the n-th call (0-based) with a status and headers, or rejects on an Error. */
	fetch?: (n: number) => { status: number; headers?: Record<string, string> } | Error;
}

function page(opts: PageOpts = {}) {
	const dom = new JSDOM(HTML, { url: opts.url ?? "https://example.org/a?b=1", referrer: "https://search.example/", virtualConsole: new VirtualConsole() });
	const w = dom.window as unknown as Win;
	const nav = w.navigator;
	const sent: Record<string, unknown>[] = [];
	let hidden = !!opts.hidden;
	const beacons: Array<[string, unknown]> = [];
	Object.defineProperty(nav, "sendBeacon", { value: (u: string, b: string) => (beacons.push([u, b]), sent.push(JSON.parse(b)) > 0) });
	const fetches: Array<[string, RequestInit]> = [];
	const answer = opts.fetch;
	if (answer)
		Object.defineProperty(w, "fetch", {
			value: (u: string, init: RequestInit) => {
				const a = answer(fetches.push([u, init]) - 1);
				sent.push(JSON.parse(init.body as string));
				return a instanceof Error ? Promise.reject(a) : Promise.resolve({ status: a.status, headers: new Headers(a.headers) });
			},
		});
	if (opts.ua !== undefined) Object.defineProperty(nav, "userAgent", { value: opts.ua });
	if (opts.webdriver) Object.defineProperty(nav, "webdriver", { value: true });
	if (opts.languages) Object.defineProperty(nav, "languages", { value: opts.languages });
	if (!w.crypto) Object.defineProperty(w, "crypto", { value: globalThis.crypto });
	Object.defineProperty(w.document, "hidden", { configurable: true, get: () => hidden });
	// Navigation is not implemented in jsdom; keep clicks on the page.
	w.addEventListener("click", (e) => e.preventDefault());
	w.addEventListener("submit", (e) => e.preventDefault());
	opts.before?.(w);
	const cfg = { ...clientConfig(normalizeSettings({})), ...opts.cfg };
	boot(w, cfg);
	const $ = <T extends Element = HTMLAnchorElement>(id: string) => w.document.getElementById(id) as unknown as T;
	const hrefs = () => [...w.document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
	const press = (el: Element, init: MouseEventInit = {}) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
	const fire = (type: string) => w.dispatchEvent(new w.Event(type, { bubbles: true }));
	const setHidden = (v: boolean) => {
		hidden = v;
		w.document.dispatchEvent(new w.Event("visibilitychange"));
	};
	return { w, sent, beacons, fetches, $, hrefs, press, fire, setHidden, cfg };
}

afterEach(() => vi.useRealTimers());

describe("bail-outs", () => {
	it.each([
		["navigator.webdriver", { webdriver: true }],
		["HeadlessChrome", { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36" }],
		["empty languages", { languages: [] }],
		["hidden document", { hidden: true }],
	] as [string, PageOpts][])("%s: sends nothing and changes no href", (_n, opts) => {
		const p = page(opts);
		const before = p.hrefs();
		p.press(p.$("same"));
		p.$("same").click();
		expect(p.sent).toEqual([]);
		expect(p.hrefs()).toEqual(before);
	});

	it("a hidden page starts once it becomes visible", () => {
		const p = page({ hidden: true });
		expect(p.sent).toEqual([]);
		p.setHidden(false);
		expect(p.sent).toHaveLength(1);
	});

	it("honours Global Privacy Control", () => {
		const p = page({ before: (w) => Object.defineProperty(w.navigator, "globalPrivacyControl", { value: true }) });
		expect(p.sent).toEqual([]);
	});
});

describe("pageview and passive links", () => {
	it("first pageview matches the ingest contract and does not touch links", () => {
		const p = page();
		const before = p.hrefs();
		expect(p.sent).toHaveLength(1);
		const pv = p.sent[0] as Record<string, unknown>;
		expect(pv).toMatchObject({ v: 1, t: "pv", n: 1, u: "/a?b=1", r: "https://search.example/" });
		expect(pv.sid).toMatch(/^[a-z0-9]{20}$/);
		expect(pv.h).toMatch(/^[a-z0-9]{12}$/);
		expect(typeof pv.w).toBe("number");
		expect(validateIngest(pv)).not.toBeNull();
		expect(p.hrefs()).toEqual(before);
	});

	it("no click ever changes a link: real or synthetic, any button or modifier, any kind of link", () => {
		const p = page();
		const before = p.hrefs();
		for (const id of ["same", "frag", "dl", "pdf", "ext", "ign", "own", "admin"]) {
			p.$(id).click();
			p.press(p.$(id));
			p.press(p.$(id), { button: 1 });
			p.press(p.$(id), { ctrlKey: true });
			p.press(p.$(id), { metaKey: true, shiftKey: true });
		}
		expect(p.hrefs()).toEqual(before);
	});

	it("interaction before the click changes nothing either", () => {
		const p = page();
		const before = p.hrefs();
		for (const t of ["pointerdown", "keydown", "scroll", "touchstart"]) p.fire(t);
		p.press(p.$("same"));
		expect(p.hrefs()).toEqual(before);
		expect(p.$("same").href).toBe("https://example.org/next");
	});
});

describe("engagement", () => {
	const ens = (sent: Record<string, unknown>[]) => sent.filter((m) => m.t === "en");

	it("sends a cumulative update per hidden period with d capped and e at least 1", () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(1_000_000);
		const p = page({ cfg: { m: 60_000 } });
		p.fire("pointerdown");
		for (let i = 0; i < 10; i++) {
			vi.setSystemTime(1_000_000 + (i + 1) * 30_000);
			p.fire("keydown");
		}
		p.setHidden(true);
		p.setHidden(true); // no second update without a visible period
		const en = ens(p.sent);
		expect(en).toHaveLength(1);
		expect(en[0]).toMatchObject({ t: "en", h: (p.sent[0] as { h: string }).h, d: 60_000, e: 60_000, i: 1, x: 0 });
		expect(validateIngest(en[0])).not.toBeNull();
	});

	it("counts only time with recent interaction as active, all visible time as e", () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(2_000_000);
		const p = page();
		p.fire("pointerdown");
		vi.setSystemTime(2_005_000);
		p.fire("scroll");
		vi.setSystemTime(2_200_000); // idle for more than a minute
		p.setHidden(true);
		expect(ens(p.sent)[0]).toMatchObject({ d: 5_000, e: 200_000, x: 0 });
	});

	it("e is never 0, even for an instant exit", () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(3_000_000);
		const p = page();
		p.setHidden(true);
		expect(ens(p.sent)[0]).toMatchObject({ e: 1, d: 0, x: 0 });
		expect(validateIngest(ens(p.sent)[0])).not.toBeNull();
	});

	it("hidden, visible, then pagehide persisted sends two updates, the second larger with x 2", () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(4_000_000);
		const p = page();
		p.fire("pointerdown");
		vi.setSystemTime(4_010_000);
		p.setHidden(true);
		vi.setSystemTime(4_500_000); // hidden time is not counted
		p.setHidden(false);
		p.fire("keydown");
		vi.setSystemTime(4_520_000);
		p.w.dispatchEvent(Object.assign(new p.w.Event("pagehide"), { persisted: true }));
		const en = ens(p.sent);
		expect(en).toHaveLength(2);
		expect(en[0]).toMatchObject({ d: 10_000, e: 10_000, x: 0 });
		expect(en[1]).toMatchObject({ d: 30_000, e: 30_000, x: 2 });
		expect(en[1]?.h).toBe(en[0]?.h);
	});

	it("pagehide without persisted is x 1 and is sent even right after hidden", () => {
		const p = page();
		p.setHidden(true);
		p.w.dispatchEvent(Object.assign(new p.w.Event("pagehide"), { persisted: false }));
		expect(ens(p.sent).map((m) => m.x)).toEqual([0, 1]);
	});

	it("route changes flush engagement and send a new pageview without nt", () => {
		const p = page();
		p.w.history.pushState(null, "", "/spa/2");
		p.w.document.dispatchEvent(new p.w.Event("astro:page-load"));
		p.w.document.dispatchEvent(new p.w.Event("astro:page-load")); // same path: no new pageview
		(p.w.__ec as { page(path?: string): void }).page("/spa/3");
		expect(p.sent.map((m) => m.t)).toEqual(["pv", "en", "pv", "en", "pv"]);
		expect(p.sent[2]).toMatchObject({ u: "/spa/2" });
		expect(p.sent[4]).toMatchObject({ u: "/spa/3" });
		for (const i of [2, 4]) {
			expect(p.sent[i]).not.toHaveProperty("r");
			expect(p.sent[i]).not.toHaveProperty("nt");
		}
		expect(p.sent[1]).not.toHaveProperty("x");
		expect(p.sent[2]?.h).not.toBe(p.sent[0]?.h);
	});

	it("a pushState by the page alone produces no pageview", () => {
		const p = page();
		p.w.history.pushState(null, "", "/elsewhere");
		p.w.dispatchEvent(new p.w.PopStateEvent("popstate"));
		expect(p.sent.map((m) => m.t)).toEqual(["pv"]);
	});
});

describe("navigation type", () => {
	const withType = (type: string) => (w: Win) =>
		Object.defineProperty(w, "performance", { configurable: true, value: { getEntriesByType: (k: string) => (k === "navigation" ? [{ type }] : []) } });

	it.each([
		["navigate", 0],
		["reload", 1],
		["back_forward", 2],
		["prerender", 0],
	])("%s gives nt %i on the first pageview", (type, nt) => {
		const p = page({ before: withType(type) });
		expect(p.sent[0]).toMatchObject({ t: "pv", nt });
		expect(validateIngest(p.sent[0])).not.toBeNull();
	});

	it("defaults to 0 without the navigation timing API", () => {
		const p = page({ before: (w) => Object.defineProperty(w, "performance", { configurable: true, value: {} }) });
		expect(p.sent[0]).toMatchObject({ nt: 0 });
	});
});

describe("no history call, no address change", () => {
	it("a fragment of any kind stays in the address, also across route changes, and no history method is called", () => {
		for (const hash of ["", "#faq", `#${SID}`, "#a=1&b=2"]) {
			const p = page({ url: `https://example.org/a?b=1${hash}` });
			const spies = (["replaceState", "pushState", "back", "forward", "go"] as const).map((m) => vi.spyOn(p.w.history, m));
			const len = p.w.history.length;
			p.w.document.dispatchEvent(new p.w.Event("astro:page-load"));
			(p.w.__ec as { page(path?: string): void }).page("/spa/2");
			p.press(p.$("same"));
			expect(p.w.location.hash, hash).toBe(hash);
			expect(p.w.location.href).toBe(`https://example.org/a?b=1${hash}`);
			expect(p.w.history.length).toBe(len);
			for (const s of spies) expect(s).not.toHaveBeenCalled();
		}
	});

	it("a route change to a URL with a fragment keeps it and sends the plain path", () => {
		const p = page();
		p.w.history.pushState({ router: 1 }, "", "/next#faq");
		const spy = vi.spyOn(p.w.history, "replaceState");
		p.w.document.dispatchEvent(new p.w.Event("astro:page-load"));
		expect(spy).not.toHaveBeenCalled();
		expect(p.w.location.hash).toBe("#faq");
		expect(p.w.history.state).toEqual({ router: 1 });
		expect(p.sent.at(-1)).toMatchObject({ t: "pv", u: "/next" });
		expect(p.sent.at(-1)).not.toHaveProperty("n");
	});

	it("boot adds no history entry", () => {
		const p = page({ before: (w) => ((w as unknown as { len: number }).len = w.history.length) });
		expect(p.w.history.length).toBe((p.w as unknown as { len: number }).len);
		p.press(p.$("same"));
		expect(p.w.history.length).toBe((p.w as unknown as { len: number }).len);
	});
});

describe("events", () => {
	const evs = (sent: Record<string, unknown>[]) => sent.filter((m) => m.t === "ev");

	it("outbound, download and form submit produce reserved events", () => {
		const p = page();
		p.$("ext").click();
		p.$("pdf").click();
		p.$<HTMLFormElement>("signup").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
		expect(evs(p.sent).map((e) => [e.name, e.p])).toEqual([
			["_outbound", { url: "other.example/x" }],
			["_download", { file: "/files/report.pdf" }],
			["_form", { form: "signup" }],
		]);
		for (const e of evs(p.sent)) expect(validateIngest(e)).not.toBeNull();
	});

	it("auto events follow their settings", () => {
		const p = page({ cfg: { o: 0, dl: 0, f: 0 } });
		p.$("ext").click();
		p.$("pdf").click();
		p.$<HTMLFormElement>("signup").dispatchEvent(new p.w.Event("submit", { bubbles: true }));
		expect(evs(p.sent)).toEqual([]);
	});

	it("data attributes send declarative events", () => {
		const p = page();
		p.$("cta").click();
		expect(evs(p.sent)[0]).toMatchObject({ name: "cta_click", p: { plan: "pro" } });
	});

	it("replays window.__ecq entries and window.__ec.event sends an ev", () => {
		const ready = vi.fn();
		const p = page({
			before: (w) => {
				w.__ecq = [["event", "queued", { a: 1 }], (api: { v: number }) => ready(api.v)];
				w.addEventListener("__ec:ready", () => ready("event"));
			},
		});
		const api = p.w.__ec as { v: number; ready: boolean; event(n: string, p?: object, v?: number): void };
		expect(api).toMatchObject({ v: 1, ready: true });
		api.event("signup", { plan: "pro" }, 9);
		(p.w.__ecq as { push(x: unknown): void }).push(["event", "late"]);
		expect(evs(p.sent).map((e) => e.name)).toEqual(["queued", "signup", "late"]);
		expect(evs(p.sent)[1]).toMatchObject({ p: { plan: "pro" }, val: 9 });
		expect(ready.mock.calls).toEqual([[1], ["event"]]);
	});
});

describe("revenue", () => {
	const evs = (sent: Record<string, unknown>[]) => sent.filter((m) => m.t === "ev");
	type Api = { event(n: string, p?: object, v?: unknown): void };

	it("sends val from a number and val, cur, oid from an object, truncated and typeof checked", () => {
		const p = page();
		const api = p.w.__ec as Api;
		api.event("purchase", {}, 12.5);
		api.event("purchase", { plan: "pro" }, { value: 49.9, currency: "EUR", id: "A-1001" });
		api.event("purchase", {}, { value: 5, currency: "EURO", id: "x".repeat(70) });
		api.event("purchase", {}, "12");
		api.event("purchase", {}, { value: "12", currency: 978, id: 1001 });
		api.event("purchase", {}, Number.NaN);
		api.event("purchase", {}, { value: Number.POSITIVE_INFINITY });
		const e = evs(p.sent);
		expect(e[0]).toMatchObject({ val: 12.5 });
		expect(e[0]).not.toHaveProperty("cur");
		expect(e[1]).toMatchObject({ name: "purchase", p: { plan: "pro" }, val: 49.9, cur: "EUR", oid: "A-1001" });
		expect(e[2]).toMatchObject({ val: 5, cur: "EUR", oid: "x".repeat(64) });
		for (const x of [e[3], e[4], e[5], e[6]]) for (const k of ["val", "cur", "oid"]) expect(x).not.toHaveProperty(k);
		expect(validateIngest(e[1])).toMatchObject({ val: 49.9, cur: "EUR", oid: "A-1001" });
	});

	it("reads value, currency and id attributes on click", () => {
		const p = page();
		p.$("buy").click();
		p.$("cta").click();
		const [buy, cta] = evs(p.sent);
		expect(buy).toMatchObject({ name: "purchase", val: 49.9, cur: "EUR", oid: "A-1001" });
		for (const k of ["val", "cur", "oid"]) expect(cta).not.toHaveProperty(k);
	});

	it("replays queued revenue calls", () => {
		const p = page({ before: (w) => (w.__ecq = [["event", "purchase", {}, { value: 3, currency: "JPY", id: "A-2" }]]) });
		expect(evs(p.sent)[0]).toMatchObject({ val: 3, cur: "JPY", oid: "A-2" });
	});
});

describe("client site snippet", () => {
	const KEY = "kkkkkkkkkkkkkkkkkkkk";
	const withScript = (attrs: Record<string, string>) => (w: Win) => {
		const el = w.document.createElement("script");
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
		Object.defineProperty(w.document, "currentScript", { configurable: true, get: () => el });
	};
	const CLIENT = "https://blog.example.net/post";

	it("reads the key from data-ec-key and posts to the script origin with k in a string body", () => {
		const p = page({ url: CLIENT, before: withScript({ src: "https://master.example.org/_/e.js", "data-ec-key": KEY }) });
		expect(p.beacons.length).toBe(1);
		const [url, body] = p.beacons[0] as [string, unknown];
		expect(url).toBe("https://master.example.org/_/e");
		expect(typeof body).toBe("string");
		expect(p.sent[0]).toMatchObject({ t: "pv", k: KEY, u: "/post" });
		expect(validateIngest(p.sent[0])).toMatchObject({ k: KEY });
	});

	it("reads the key from ?k= on its own src", () => {
		const p = page({ url: CLIENT, before: withScript({ src: `https://master.example.org/_/e.js?k=${KEY}` }) });
		expect(p.beacons[0]?.[0]).toBe("https://master.example.org/_/e");
		expect(p.sent[0]?.k).toBe(KEY);
	});

	it("without a key the URL stays relative and k is absent", () => {
		for (const before of [withScript({ src: "https://master.example.org/_/e.js" }), withScript({ src: "/_/e.js", "data-ec-key": "BAD" }), undefined]) {
			const p = page(before ? { before } : {});
			expect(p.beacons[0]?.[0]).toBe("/_/e");
			expect("k" in (p.sent[0] ?? {})).toBe(false);
		}
	});

	it("an inline script (no src) never takes a key from the page's own address", () => {
		const p = page({ url: `https://example.org/a?k=${KEY}`, before: withScript({}) });
		expect(p.beacons[0]?.[0]).toBe("/_/e");
		expect("k" in (p.sent[0] ?? {})).toBe(false);
	});

	it("changes no link of the client page, none to the master either; the master link is outbound", () => {
		const p = page({
			url: CLIENT,
			before: (w) => {
				withScript({ src: "https://master.example.org/_/e.js", "data-ec-key": KEY })(w);
				const a = w.document.createElement("a");
				a.id = "master";
				a.href = "https://master.example.org/page";
				w.document.body.appendChild(a);
			},
		});
		p.press(p.$("same"));
		expect(p.$("same").getAttribute("href")).toBe("/next");
		p.press(p.$("master"));
		expect(p.$("master").getAttribute("href")).toBe("https://master.example.org/page");
		expect(p.sent.at(-1)).toMatchObject({ t: "ev", name: "_outbound", k: KEY });
	});
});

describe("short link path prefixes (ignorePathPrefixes)", () => {
	const withLinks = (w: Win) => {
		w.document.body.insertAdjacentHTML(
			"beforeend",
			`<a id="go" href="/go/alpha-offer">go</a><a id="other" href="/other">other</a><a id="gopdf" href="/go/sheet.pdf">gopdf</a>
<form id="btnform" method="post" action="/"><button id="gobtn" type="submit" formaction="/go/alpha-offer">go</button></form>
<form id="goform" action="/go/beta-offer"><button type="submit">go</button></form>`,
		);
	};
	const opts = (): PageOpts => ({ url: "https://example.com/a", before: withLinks, cfg: { i: clientConfig(normalizeSettings({ ignorePathPrefixes: "/go/" })).i } });
	const submit = (p: ReturnType<typeof page>, form: string, submitter?: string) =>
		p.$<HTMLFormElement>(form).dispatchEvent(new p.w.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submitter ? p.$<HTMLElement>(submitter) : null }));
	const names = (p: ReturnType<typeof page>) => p.sent.filter((m) => m.t === "ev").map((m) => [m.name, m.p]);

	it("a submit through a formaction under the prefix sends no _form; a form action under it neither; a normal form still does", () => {
		const p = page(opts());
		submit(p, "btnform", "gobtn");
		submit(p, "goform");
		expect(names(p)).toEqual([]);
		expect(p.$("gobtn").getAttribute("formaction")).toBe("/go/alpha-offer");
		submit(p, "signup", "sub");
		expect(names(p)).toEqual([["_form", { form: "signup" }]]);
	});

	it("a download under the prefix sends no _download", () => {
		const p = page(opts());
		p.$("gopdf").click();
		p.$("pdf").click();
		expect(names(p)).toEqual([["_download", { file: "/files/report.pdf" }]]);
	});

	it("without the setting the prefix is an ordinary path", () => {
		const p = page({ url: "https://example.com/a", before: withLinks });
		submit(p, "btnform", "gobtn");
		expect(names(p)).toEqual([["_form", { form: "btnform" }]]);
	});

	it("the setting keeps valid prefixes and drops relative ones and ones with a banned word", () => {
		expect(normalizeSettings({}).ignorePathPrefixes).toEqual([]);
		expect(normalizeSettings({ ignorePathPrefixes: "/go/\ngo/, /out/ /stats/ /x-analytics/\n/go/" }).ignorePathPrefixes).toEqual(["/go/", "/out/"]);
		expect(clientConfig(normalizeSettings({ ignorePathPrefixes: "/go/" })).i).toEqual(["/go/"]);
	});
});

describe("delivery: keepalive fetch, retries with jitter, event ids", () => {
	afterEach(() => vi.restoreAllMocks());
	const ok = () => ({ status: 204 });
	const busy = () => ({ status: 503, headers: { "retry-after": "5" } });
	/** Wall-clock seconds at which each fetch happened, with fake timers. */
	function timed(answer: (n: number) => { status: number; headers?: Record<string, string> } | Error) {
		const at: number[] = [];
		const start = Date.now();
		const p = page({ fetch: (n) => (at.push((Date.now() - start) / 1000), answer(n)) });
		return { p, at };
	}

	it("page views and events go by keepalive fetch, engagement by beacon; events carry a fresh 12 character id", async () => {
		const p = page({ fetch: ok });
		p.$<HTMLButtonElement>("cta").click();
		p.$<HTMLButtonElement>("cta").click();
		p.setHidden(true);
		expect(p.fetches.map(([u, i]) => [u, i.method, i.keepalive, typeof i.body])).toEqual(Array(3).fill(["/_/e", "POST", true, "string"]));
		expect(p.beacons.map(([, b]) => JSON.parse(b as string).t)).toEqual(["en"]);
		const [a, b] = p.sent.filter((m) => m.t === "ev");
		expect(a?.h).toMatch(/^[a-z0-9]{12}$/);
		expect(b?.h).toMatch(/^[a-z0-9]{12}$/);
		expect(a?.h).not.toBe(b?.h);
		expect(validateIngest(a)).toMatchObject({ t: "ev", h: a?.h });
	});

	it("a 503 with Retry-After is sent again three times on the 5, 15, 45 second schedule, the same body each time", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0); // no jitter: exactly the base delays
		const { p, at } = timed(busy);
		await vi.advanceTimersByTimeAsync(200_000);
		expect(at).toEqual([0, 5, 20, 65]);
		expect(new Set(p.fetches.map(([, i]) => i.body)).size).toBe(1);
	});

	it("a network failure is retried too, and the first success ends the retries", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const { at } = timed((n) => (n === 0 ? new TypeError("Failed to fetch") : n === 1 ? busy() : ok()));
		await vi.advanceTimersByTimeAsync(200_000);
		expect(at).toEqual([0, 5, 20]);
	});

	it("never retries a 204, a 503 without Retry-After (stop) or another status", async () => {
		vi.useFakeTimers();
		for (const answer of [ok, () => ({ status: 503 }), () => ({ status: 500 }), () => ({ status: 403 })]) {
			const { at } = timed(answer);
			await vi.advanceTimersByTimeAsync(200_000);
			expect(at).toEqual([0]);
		}
	});

	it("lengthens each delay at random by up to half and never retries before Retry-After", async () => {
		vi.useFakeTimers();
		const run = async (r: number, retryAfter: string) => {
			vi.spyOn(Math, "random").mockReturnValue(r);
			const { at } = timed(() => ({ status: 503, headers: { "retry-after": retryAfter } }));
			await vi.advanceTimersByTimeAsync(300_000);
			vi.restoreAllMocks();
			return at.slice(1).map((t, i) => t - (at[i] as number));
		};
		expect(await run(0, "1")).toEqual([5, 15, 45]);
		expect(await run(0.5, "1")).toEqual([6.25, 18.75, 56.25]);
		expect(await run(0, "30")).toEqual([30, 30, 45]);
	});

	it("no 503 storm: retries of many pages refused at the same moment spread over the jitter window", async () => {
		vi.useFakeTimers();
		const first: number[] = [];
		for (let i = 0; i < 40; i++) {
			const { at } = timed(busy);
			await vi.advanceTimersByTimeAsync(8_000);
			first.push(at[1] as number);
		}
		expect(Math.min(...first)).toBeGreaterThanOrEqual(5); // Retry-After 5 is the floor
		expect(Math.max(...first)).toBeLessThanOrEqual(7.5);
		expect(new Set(first.map((t) => Math.round(t * 10))).size).toBeGreaterThan(10);
		// The jitter is not swallowed by the floor: few retries land on it exactly.
		expect(first.filter((t) => t === 5).length).toBeLessThan(4);
	});

	it("without fetch, page views fall back to the beacon", () => {
		const p = page();
		expect(p.beacons.map(([, b]) => JSON.parse(b as string).t)).toEqual(["pv"]);
	});

	it("an engagement update repeats only when a number changed", () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(5_000_000);
		const p = page();
		vi.setSystemTime(5_010_000);
		p.setHidden(true);
		p.setHidden(false); // visible again, no time passes
		p.setHidden(true);
		const en = p.sent.filter((m) => m.t === "en");
		expect(en).toHaveLength(1);
		p.setHidden(false);
		vi.setSystemTime(5_012_000);
		p.setHidden(true);
		expect(p.sent.filter((m) => m.t === "en").map((m) => m.e)).toEqual([10_000, 12_000]);
	});
});

describe("linked hosts", () => {
	const KEY = "llllllllllllllllllll";
	const SHOP = "shop.example.net";
	const keyed = (w: Win) => {
		const el = w.document.createElement("script");
		el.setAttribute("src", "https://example.org/_/e.js");
		el.setAttribute("data-ec-key", KEY);
		Object.defineProperty(w.document, "currentScript", { configurable: true, get: () => el });
		const a = w.document.createElement("a");
		a.id = "main";
		a.href = "https://example.org/pricing";
		w.document.body.appendChild(a);
	};
	const evs = (sent: Record<string, unknown>[]) => sent.filter((m) => m.t === "ev");
	const noStorage = (p: ReturnType<typeof page>) => {
		expect(p.w.document.cookie).toBe("");
		expect((p.w as unknown as { localStorage: Storage }).localStorage.length).toBe(0);
		expect((p.w as unknown as { sessionStorage: Storage }).sessionStorage.length).toBe(0);
	};

	it("a page on a linked host changes no link, its own or the main host's, and stores nothing", () => {
		const p = page({ url: `https://${SHOP}/cart`, cfg: { l: [SHOP] }, before: keyed });
		const before = p.hrefs();
		for (const id of ["same", "frag", "pdf", "main"]) p.press(p.$(id));
		expect(p.hrefs()).toEqual(before);
		expect(p.sent[0]).toMatchObject({ t: "pv", k: KEY, n: 1 });
		noStorage(p);
	});

	it("a page of the main host changes no link, to a linked host or its own", () => {
		const p = page({
			cfg: { l: [SHOP] },
			before: (w) => w.document.body.insertAdjacentHTML("beforeend", `<a id="shop" href="https://${SHOP}/cart">shop</a>`),
		});
		p.press(p.$("shop"));
		expect(p.$("shop").getAttribute("href")).toBe(`https://${SHOP}/cart`);
		p.press(p.$("same"));
		expect(p.$("same").getAttribute("href")).toBe("/next");
		noStorage(p);
	});

	it("an unlinked client host changes no link either", () => {
		const p = page({ url: "https://blog.example.net/post", cfg: { l: [SHOP] }, before: keyed });
		p.press(p.$("same"));
		expect(p.$("same").getAttribute("href")).toBe("/next");
	});

	it("a click between the main host and a linked host is not an outbound click; other hosts still are", () => {
		const shop = page({
			url: `https://${SHOP}/cart`,
			cfg: { l: [SHOP] },
			before: (w) => {
				keyed(w);
				w.document.body.insertAdjacentHTML("beforeend", '<a id="out" href="https://other.example.net/x">out</a>');
			},
		});
		shop.press(shop.$("main"));
		shop.press(shop.$("out"));
		expect(evs(shop.sent).map((e) => e.p)).toEqual([{ url: "other.example.net/x" }]);
		const main = page({ cfg: { l: [SHOP] }, before: (w) => w.document.body.insertAdjacentHTML("beforeend", `<a id="shop" href="https://${SHOP}/cart">shop</a>`) });
		main.press(main.$("shop"));
		expect(evs(main.sent)).toEqual([]);
		// An unlinked client site's link to the install's host stays outbound (see the client site snippet tests).
	});

	it("the served configuration carries the linked hosts, empty by default", () => {
		expect(clientConfig(normalizeSettings({})).l).toEqual([]);
		expect(clientConfig(normalizeSettings({}), true, [SHOP]).l).toEqual([SHOP]);
	});
});

describe("link rules", () => {
	const LINKS = `<a id="go" href="/go/alpha-offer/">go</a>
<a id="gopdf" href="/go/guide.pdf">go pdf</a>
<a id="rec" href="/recommends/beta-tool?x=1#f">rec</a>
<a id="shop" href="https://shop.example.net/p/42?utm=1">shop</a>
<a id="deny" href="https://ads.example.com/x">deny</a>
<a id="mail" href="mailto:hello@example.org?subject=Hi">mail</a>
<a id="tel" href="tel:+4930123456">tel</a>
<a id="soc" href="https://www.instagram.com/acme/">soc</a>
<a id="goign" href="/go/zeta" data-ec-ignore>ign</a>
<a id="marked" href="/go/eta" data-ec-event="out" data-ec-prop-slug="eta-manual">marked</a>
<a id="srv" href="/out/served">served</a>
<a id="nested" href="/go/theta"><span><b id="inner">x</b></span></a>`;
	// A pattern the browser refuses comes first: it is skipped, never fatal. `/out/` sits under the short link prefix.
	const RULES: ClientConfig["r"] = [
		["~[", "broken"],
		["/go/", "out"],
		["~^/recommends/([^/]+)", "out"],
		["ads.example.com/", "-"],
		["shop.example.net/", "shop_click"],
		["mailto:", "contact", "email"],
		["tel:", "contact", "phone"],
		["~^(?:www\\.)?(instagram|facebook|linkedin)\\.com/", "social"],
		["/out/", "out"],
	];
	const withLinks = (w: Win) => w.document.body.insertAdjacentHTML("beforeend", LINKS);
	const rulesPage = (r: ClientConfig["r"] = RULES) => page({ before: withLinks, cfg: { r, i: ["/out/"] } });
	const clicks = (p: ReturnType<typeof page>, id: string) => {
		const n = p.sent.length;
		p.$<HTMLElement>(id).click();
		return p.sent.slice(n).filter((m) => m.t === "ev");
	};

	it.each([
		["go", [["out", { slug: "alpha-offer" }]]],
		["gopdf", [["out", { slug: "guide.pdf" }]]],
		["rec", [["out", { slug: "beta-tool" }]]],
		["shop", [["shop_click", { slug: "p/42" }]]],
		["ext", [["_outbound", { url: "other.example/x" }]]],
		["deny", []],
		["mail", [["contact", { slug: "email" }]]],
		["tel", [["contact", { slug: "phone" }]]],
		["soc", [["social", { slug: "instagram" }]]],
		["goign", []],
		["marked", [["out", { slug: "eta-manual" }]]],
		["srv", []],
		["pdf", [["_download", { file: "/files/report.pdf" }]]],
		["inner", [["out", { slug: "theta" }]]],
		["same", []],
	] as [string, [string, unknown][]][])("%s sends %j, valid for ingest, with no href changed", (id, want) => {
		const p = rulesPage();
		const before = p.hrefs();
		const evs = clicks(p, id);
		expect(evs.map((e) => [e.name, e.p])).toEqual(want);
		for (const e of evs) expect(validateIngest(e)).not.toBeNull();
		expect(p.hrefs()).toEqual(before);
	});

	it("a broken pattern first keeps the script working: the next rules still match", () => {
		const p = rulesPage();
		expect(clicks(p, "go").map((e) => e.name)).toEqual(["out"]);
		expect(clicks(p, "rec").map((e) => e.name)).toEqual(["out"]);
		expect(clicks(p, "ext").map((e) => e.name)).toEqual(["_outbound"]);
	});

	it("a rule on a linked host records it; the rule beats autoOutbound off", () => {
		const p = page({ before: withLinks, cfg: { r: [["shop.example.net/", "shop_click"]], l: ["shop.example.net"], o: 0 } });
		expect(clicks(p, "shop").map((e) => [e.name, e.p])).toEqual([["shop_click", { slug: "p/42" }]]);
	});

	it("the built page script, served from saved settings, gives the same events", () => {
		const s = normalizeSettings({ linkRules: "/go/ out\n~^/recommends/([^/]+) out\nads.example.com/ -\nmailto: contact email", ignorePathPrefixes: "/out/" });
		const dom = new JSDOM(`<!doctype html><body>${LINKS}<a id="ext" href="https://other.example/x">ext</a></body>`, { url: "https://example.org/a", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
		const w = dom.window as unknown as Win;
		const sent: Record<string, unknown>[] = [];
		Object.defineProperty(w.navigator, "sendBeacon", { value: (_u: string, b: string) => sent.push(JSON.parse(b)) > 0 });
		if (!w.crypto) Object.defineProperty(w, "crypto", { value: globalThis.crypto });
		w.addEventListener("click", (e) => e.preventDefault());
		(w as unknown as { eval(c: string): void }).eval(scriptBody(s));
		for (const id of ["go", "rec", "deny", "mail", "ext", "srv"]) (w.document.getElementById(id) as HTMLElement).click();
		expect(sent.filter((m) => m.t === "ev").map((e) => [e.name, e.p])).toEqual([
			["out", { slug: "alpha-offer" }],
			["out", { slug: "beta-tool" }],
			["contact", { slug: "email" }],
			["_outbound", { url: "other.example/x" }],
		]);
	});

	it("without rules the config holds r: [] and the auto events are unchanged", () => {
		expect(clientConfig(normalizeSettings({})).r).toEqual([]);
		const p = page({ before: withLinks });
		expect([...clicks(p, "ext"), ...clicks(p, "pdf"), ...clicks(p, "gopdf"), ...clicks(p, "shop"), ...clicks(p, "mail")].map((e) => [e.name, e.p])).toEqual([
			["_outbound", { url: "other.example/x" }],
			["_download", { file: "/files/report.pdf" }],
			["_download", { file: "/go/guide.pdf" }],
			["_outbound", { url: "shop.example.net/p/42" }],
		]);
	});

	it("parity: matchLinkRule on linkTarget gives the event and slug the script sends", () => {
		const { rules } = parseLinkRules("/go/ out\n~^/recommends/([^/]+) out\nshop.example.net/ shop_click\nads.example.com/ -\nmailto: contact email\ntel: contact\n~^(?:www\\.)?(instagram|facebook)\\.com/ social\n~^/w/[a-z]+ whole\n/fixed/ f pinned");
		const hrefs = ["/go/alpha-offer/", "/go/", "/go/a/b/", "/recommends/beta-tool?x=1#f", "https://shop.example.net/p/42?u=1", "https://ads.example.com/x", "mailto:hello@example.org?subject=Hi", "tel:+4930123456", "https://www.instagram.com/acme/", "https://facebook.com/", "/w/abc/9", "/fixed/x", "/next", "https://other.example/x", `/go/${"s".repeat(700)}`];
		const p = page({ cfg: { r: rules, o: 0, dl: 0 } });
		for (const href of hrefs) {
			const a = p.w.document.createElement("a");
			a.href = href;
			p.w.document.body.appendChild(a);
			const n = p.sent.length;
			a.click();
			const got = p.sent.slice(n).filter((m) => m.t === "ev");
			const m = matchLinkRule(rules, linkTarget(new URL(href, p.w.location.href), p.w.location.host));
			const want = !m || m.event === "-" ? [] : [[m.event, { slug: m.slug }]];
			expect(got.map((e) => [e.name, e.p]), href).toEqual(want);
		}
	});
});
