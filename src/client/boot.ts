/**
 * Page script logic. Built to a dependency-free IIFE by `page-script.ts`.
 * Nothing is stored on the device except the opt-out flag a visitor sets by clicking a control carrying
 * the optout attribute: the session id lives in a closure. The script is passive on links and the
 * address: it never changes a link or the URL.
 */

/** Served configuration, short keys. Built by `src/client/serve.ts`. */
export interface ClientConfig {
	/** Event endpoint URL. */
	c: string;
	/** Window namespace. */
	n: string;
	/** Data attribute prefix, for example `data-ec-`. */
	a: string;
	/** Privacy signals honored. */
	g: "none" | "gpc" | "dnt_and_gpc";
	/** Auto outbound, download and form events. */
	o: 0 | 1;
	dl: 0 | 1;
	/** Send the screen width (`captureScreen`). */
	s: 0 | 1;
	f: 0 | 1;
	/** Download extensions. */
	x: string[];
	/** Max engaged ms per page. */
	m: number;
	/** Path prefixes (`ignorePathPrefixes`): no `_download`, `_form` or link rule for targets under them. */
	i: string[];
	/** Hosts linked to the site: links to them are not outbound. */
	l: string[];
	/** Link rules (`src/link-rules.ts`): pattern, event name, fixed label. */
	r: [string, string, string?][];
}

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|phantom|puppeteer|playwright|preview|fetch(er)?\b|python|curl|wget|httpclient/i;
const ABC = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Seconds before each of the three retries of a refused page view or event (or Retry-After when longer), each lengthened at random by up to half. */
const RETRY_S = [5, 15, 45];

// biome-ignore lint: the page script talks to loosely typed browser globals.
type Any = any;

export function boot(w: Any, cfg: ClientConfig): void {
	const d: Document & Any = w.document;
	const nav: Any = w.navigator;
	const loc: Location = w.location;
	const ua: string = nav.userAgent || "";

	// Client site: read once while the script first runs; a key sends to the script's own origin.
	let key = "";
	let url = cfg.c;
	// Host of the install that served the script: on a linked host's page, the main host.
	let sh = "";
	try {
		// An inline script has no src: never read the page's own address.
		const cs: Any = d.currentScript;
		const su = new URL(cs.src || "x:", loc.href);
		const k = cs.getAttribute(`${cfg.a}key`) || su.searchParams.get("k") || "";
		if (/^[a-z0-9]{20}$/.test(k)) {
			key = k;
			url = new URL(cfg.c, su.origin).href;
			sh = su.hostname;
		}
	} catch {}

	// 1. Bail-outs: any hit means the script does nothing at all.
	if (nav.webdriver === true || BOT_RE.test(ua) || !nav.languages || !nav.languages.length) return;
	if (/Chrome\//.test(ua) && !/Mobile|Android/.test(ua) && nav.plugins && nav.plugins.length === 0) return;

	// The one place that decides "send nothing": a privacy signal, or the visitor's opt-out flag (read once here, set only by a click on the control below).
	const OA = `${cfg.a}optout`;
	let off = false;
	try {
		off = !!w.localStorage.getItem(OA);
	} catch {}
	let stop = off || (cfg.g !== "none" && nav.globalPrivacyControl === true) || (cfg.g === "dnt_and_gpc" && nav.doNotTrack === "1");

	const rid = (n: number) => {
		let s = "";
		while (s.length < n) for (const b of w.crypto.getRandomValues(new Uint8Array(n * 2))) if (b < 252 && s.length < n) s += ABC[b % 36];
		return s;
	};

	// 2. Session id: always fresh per document; the server joins full page loads by the visitor key.
	const sid = rid(20);
	// Navigation type of this document: 0 navigate, 1 reload, 2 back_forward.
	let nt = 0;
	try {
		const ty = w.performance.getEntriesByType("navigation")[0].type;
		nt = ty === "reload" ? 1 : ty === "back_forward" ? 2 : 0;
	} catch {}

	const A = cfg.a;
	const dlRe = cfg.x.length ? new RegExp(`\\.(${cfg.x.join("|")})$`, "i") : null;
	const now = () => Date.now();
	const here = () => (loc.pathname + loc.search).slice(0, 2048);
	let hit = "";
	let enDone = true;
	let sent = false;
	let last = "";
	let acc = 0;
	let vis = 0;
	let shown = true;
	let mark = 0;
	let act = -1e12;
	let scroll = 0;
	let inter: 0 | 1 = 0;
	let lastEn = "";

	// Page views and events go by keepalive fetch so a failure is seen: a network error, or 503 with Retry-After,
	// is sent again, the same body (same ids, stored once). 503 without Retry-After means: do not send again.
	const post = (b: string, n: number): void =>
		w
			.fetch(url, { method: "POST", body: b, keepalive: true })
			.then(
				(r: Any) => {
					const ra = r.status === 503 && r.headers.get("retry-after");
					return ra ? +ra || 0 : -1;
				},
				() => 0,
			)
			.then((ra: number) => {
				if (ra >= 0 && n < 3) setTimeout(() => stop || post(b, n + 1), Math.max(ra, RETRY_S[n] as number) * (1 + Math.random() / 2) * 1000);
			});
	// Engagement updates (and everything where fetch is missing) go as a beacon: written after the response, never retried.
	const send = (o: Any, retry?: 1) => {
		if (stop) return;
		o.v = 1;
		o.sid = sid;
		if (key) o.k = key;
		const b = JSON.stringify(o);
		if (retry && w.fetch) post(b, 0);
		else if (!(nav.sendBeacon && nav.sendBeacon(url, b)) && w.fetch) w.fetch(url, { method: "POST", body: b, keepalive: true }).catch(() => {});
	};
	const tick = () => {
		const t = now();
		if (shown) {
			vis += t - mark;
			if (t - act < 60000) acc += Math.min(t - mark, 60000);
		}
		mark = t;
	};
	const measure = () => {
		const el = d.documentElement;
		const max = el.scrollHeight - w.innerHeight;
		const p = max > 0 ? Math.round(Math.min(1, Math.max(0, w.scrollY / max)) * 100) : 100;
		if (p > scroll) scroll = p;
	};
	// 4. Engagement: cumulative updates, one per hidden period, always on pagehide; x is the exit kind.
	const flush = (x?: number) => {
		if (!hit || (enDone && !x)) return;
		enDone = true;
		tick();
		measure();
		const o: Any = { t: "en", h: hit, d: Math.min(Math.round(acc), cfg.m), e: Math.max(1, Math.min(Math.round(vis), cfg.m)), s: scroll, i: inter };
		if (x !== undefined) o.x = x;
		// Only when a number changed since the last update of this page view (tab switches repeat them).
		const k = JSON.stringify(o);
		if (k === lastEn) return;
		lastEn = k;
		send(o);
	};
	// 3. Pageview.
	const pv = (path?: string) => {
		const u = typeof path === "string" && path[0] === "/" ? path.slice(0, 2048) : here();
		if (sent && u === last) return;
		flush();
		hit = rid(12);
		enDone = false;
		acc = 0;
		vis = 0;
		mark = now();
		scroll = 0;
		inter = 0;
		const o: Any = { t: "pv", h: hit, u, w: cfg.s && w.screen ? w.screen.width : 0 };
		if (!sent) {
			o.r = d.referrer || "";
			o.n = 1;
			o.nt = nt;
		}
		send(o, 1);
		sent = true;
		last = u;
	};
	// `v`: a number, or `{ value, currency?, id? }`; only typeof checks, the server validates.
	const ev = (name: unknown, p?: unknown, v?: Any) => {
		if (typeof name !== "string" || !sent) return;
		const o: Any = { t: "ev", h: rid(12), name, u: here() };
		if (p && typeof p === "object") o.p = p;
		if (v && typeof v === "object") {
			if (typeof v.currency === "string") o.cur = v.currency.slice(0, 3);
			if (typeof v.id === "string") o.oid = v.id.slice(0, 64);
			v = v.value;
		}
		if (typeof v === "number" && isFinite(v)) o.val = v;
		send(o, 1);
	};
	const skip = (path: string) => cfg.i.some((x) => path.indexOf(x) === 0);

	const start = () => {
		paint();
		d.addEventListener("DOMContentLoaded", paint);
		for (const t of ["pointerdown", "keydown", "scroll", "touchstart"])
			w.addEventListener(
				t,
				(e: Event) => {
					tick();
					act = now();
					inter = 1;
					if (t === "scroll") measure();
				},
				{ capture: true, passive: true },
			);
		d.addEventListener("visibilitychange", () => {
			tick();
			shown = !d.hidden;
			if (d.hidden) flush(0);
			else enDone = false;
		});
		w.addEventListener("pagehide", (e: Any) => flush(e.persisted ? 2 : 1));
		// Route changes: Astro's ClientRouter event and the explicit page() call only.
		d.addEventListener("astro:page-load", () => pv());

		// 5 to 7. Declarative and auto events in one capture-phase listener.
		d.addEventListener(
			"click",
			(e: MouseEvent) => {
				const t: Any = e.target;
				if (!t || !t.closest) return;
				if (t.closest(`[${OA}]`)) {
					off = !off;
					stop = stop || off;
					try {
						w.localStorage[off ? "setItem" : "removeItem"](OA, "1");
					} catch {}
					paint();
					return;
				}
				const de = t.closest(`[${A}event]`);
				if (de) {
					const props: Any = {};
					for (const at of de.attributes) if (at.name.indexOf(`${A}prop-`) === 0) props[at.name.slice(A.length + 5).replace(/-/g, "_")] = at.value.slice(0, 128);
					const g = (n: string) => de.getAttribute(A + n);
					ev(g("event"), props, g("value") && { value: +g("value"), currency: g("currency"), id: g("id") });
				}
				const a: HTMLAnchorElement | null = t.closest("a[href]");
				if (!a || a.hasAttribute(`${A}ignore`)) return;
				const web = /^https?:$/.test(a.protocol);
				const same = a.host === loc.host;
				// Link rules: first match wins and replaces the auto events; never under a short link prefix (its redirect reports).
				if (!de && !(web && same && skip(a.pathname))) {
					const T = (web ? (same ? "" : a.host) + a.pathname : (a.href.split("?")[0] as string)).slice(0, 512);
					for (const [p, n, l] of cfg.r) {
						let s: Any;
						try {
							if (p[0] === "~") {
								const m = new RegExp(p.slice(1), "i").exec(T);
								if (m) s = m[1] || m[0];
							} else if (!T.indexOf(p)) s = T.slice(p.length);
						} catch {}
						if (s !== undefined) {
							if (n !== "-") ev(n, { slug: (l || s.replace(/\/$/, "") || T).slice(0, 128) });
							return;
						}
					}
				}
				if (!web) return;
				if (!same) {
					// Linked hosts and, from a linked host's page, the main host are this site: not outbound.
					if (cfg.o && cfg.l.indexOf(a.hostname) < 0 && !(a.hostname === sh && cfg.l.indexOf(loc.hostname) >= 0)) ev("_outbound", { url: (a.host + a.pathname).slice(0, 128) });
					return;
				}
				if (cfg.dl && dlRe && dlRe.test(a.pathname) && !skip(a.pathname)) ev("_download", { file: a.pathname.slice(0, 128) });
			},
			true,
		);
		d.addEventListener(
			"submit",
			(e: Any) => {
				const f: Any = e.target;
				if (!cfg.f || !f || f.hasAttribute(`${A}ignore`)) return;
				let path = "";
				try {
					// The submitter's formaction wins over the form action, as in the browser.
					const u = new URL((e.submitter && e.submitter.getAttribute("formaction")) || f.getAttribute("action") || "", loc.href);
					path = u.pathname;
					if (u.host === loc.host && skip(path)) return;
				} catch {}
				ev("_form", { form: String(f.id || f.getAttribute("name") || path).slice(0, 128) });
			},
			true,
		);

		pv();

		// 8. Window API, queue replay, ready event.
		const api: Any = { v: 1, sid, ready: true, event: ev, page: pv, onReady: (cb: Any) => run(cb) };
		const run = (x: Any) => {
			try {
				if (typeof x === "function") x(api);
				else api[x[0]](...x.slice(1));
			} catch {}
		};
		const q = w[`${cfg.n}q`];
		w[cfg.n] = api;
		w[`${cfg.n}q`] = { push: run };
		if (q && q.forEach) q.forEach(run);
		w.dispatchEvent(new w.CustomEvent(`${cfg.n}:ready`, { detail: api }));
	};

	// Opt-out control: any element with the optout attribute toggles the flag; its state is shown on the element.
	const paint = () => {
		for (const el of d.querySelectorAll(`[${OA}]`) as Any) {
			const l = el.getAttribute(`${OA}-${off ? "on" : "off"}`);
			el.setAttribute("aria-pressed", off);
			el.setAttribute(`${OA}-state`, off ? "out" : "in");
			if (l) el.textContent = l;
		}
	};

	// Prerendered or background pages start when they become visible.
	const ok = () => !d.prerendering && !d.hidden;
	if (ok()) start();
	else {
		const wait = () => {
			if (!ok()) return;
			d.removeEventListener("visibilitychange", wait);
			d.removeEventListener("prerenderingchange", wait);
			start();
		};
		d.addEventListener("visibilitychange", wait);
		d.addEventListener("prerenderingchange", wait);
	}
}
