import { beforeEach, describe, expect, it } from "vitest";
import type { IngestBody } from "../src/contract.js";
import { validateIngest } from "../src/core/ids.js";
import { type RecorderDeps, recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import { normalizeSettings } from "../src/settings.js";
import { eventRequest, schemaDb } from "./helpers.js";

// A full page load carries a fresh client sid and no way to name the old one: the server joins it by the
// daily visitor key alone. These pin what that join keeps and what it cannot.
const T0 = Date.parse("2026-06-10T12:00:00Z") / 1000;
const S1 = "aaaaaaaaaaaaaaaaaaaa";
const S2 = "bbbbbbbbbbbbbbbbbbbb";
const S3 = "cccccccccccccccccccc";
const H = (n: number) => `hhhhhhhhhh${String(n).padStart(2, "0")}`;
const FIRST_TOUCH = { ref_host: "bing.com", channel: "Paid Search", entry_path: "/a", utm_campaign: "spring" };

let env: Awaited<ReturnType<typeof schemaDb>>;
beforeEach(async () => {
	resetCounters();
	env = await schemaDb();
});

const deps = (now: number): RecorderDeps => ({ db: env.db, kv: env.kv, settings: normalizeSettings({}), now });
const body = (b: Record<string, unknown>) => validateIngest({ v: 1, ...b }) as IngestBody;
const info = (headers: Record<string, string> = {}) => ({ ...requestInfo(eventRequest("{}", { origin: "https://example.org", ...headers })), hasOrigin: true });
const sessions = () => env.raw.prepare("SELECT * FROM ca_sessions ORDER BY started, sid").all() as Record<string, unknown>[];
const other = { "cf-connecting-ip": "198.51.100.44" };

/** Visitor A on /a from a search engine with a campaign, then a full page load of /b with a new sid and the own page as referrer. */
async function externalThenInternal(headers: Record<string, string> = {}) {
	const a = body({ t: "pv", sid: S1, h: H(1), u: "/a?utm_source=bing&utm_medium=cpc&utm_campaign=spring", w: 1440, n: 1, nt: 0, r: "https://www.bing.com/search?q=x" });
	expect(await recordClientEvent(deps(T0), a, info(headers))).toBe("ok");
	const b = body({ t: "pv", sid: S2, h: H(2), u: "/b", w: 1440, n: 1, nt: 0, r: "https://example.org/a" });
	expect(await recordClientEvent(deps(T0 + 40), b, info(headers))).toBe("ok");
}

describe("full page loads join by the visitor key", () => {
	it("one session: the external first touch stays, the own-host referrer never becomes a source, events count", async () => {
		await externalThenInternal();
		expect(await recordClientEvent(deps(T0 + 50), body({ t: "ev", sid: S2, h: H(2), name: "newsletter_signup", u: "/b" }), info())).toBe("ok");
		expect(await recordClientEvent(deps(T0 + 55), body({ t: "ev", sid: S2, name: "cta_click", u: "/b", p: { plan: "pro" } }), info())).toBe("ok");
		const rows = sessions();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ sid: S1, ...FIRST_TOUCH, pageviews: 2, events: 2, exit_path: "/b" });
		expect(rows[0]?.source).not.toBe("example.org");
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_sessions WHERE ref_host = 'example.org'").get()).toEqual({ n: 0 });
	});

	it("an order from the later page belongs to the first visit, so its channel is the external one", async () => {
		await externalThenInternal();
		const order = body({ t: "ev", sid: S2, name: "purchase", u: "/thanks", val: 49.9, cur: "EUR", oid: "A-1001" });
		expect(await recordClientEvent(deps(T0 + 60), order, info())).toBe("ok");
		const row = env.raw.prepare("SELECT sid, sday FROM ca_events WHERE name = 'purchase'").get() as { sid: string; sday: string };
		expect(row.sid).toBe(S1);
		const s = env.raw.prepare("SELECT channel, ref_host, utm_campaign FROM ca_sessions WHERE sid = ?").get(row.sid);
		expect(s).toMatchObject({ channel: FIRST_TOUCH.channel, ref_host: FIRST_TOUCH.ref_host, utm_campaign: "spring" });
		expect(sessions()).toHaveLength(1);
	});

	it("two different visitors stay separate sessions", async () => {
		await externalThenInternal();
		const b = body({ t: "pv", sid: S3, h: H(3), u: "/b", w: 1440, n: 1, nt: 0, r: "https://example.org/a" });
		expect(await recordClientEvent(deps(T0 + 45), b, info(other))).toBe("ok");
		const rows = sessions();
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ sid: S1, ...FIRST_TOUCH, pageviews: 2 });
		expect(rows[1]).toMatchObject({ sid: S3, entry_path: "/b", pageviews: 1 });
		expect(rows[0]?.vkey).not.toBe(rows[1]?.vkey);
	});

	it("a visitor whose key changes mid visit starts a new session whose channel is Direct", async () => {
		const a = body({ t: "pv", sid: S1, h: H(1), u: "/a?utm_source=bing&utm_medium=cpc&utm_campaign=spring", w: 1440, n: 1, nt: 0, r: "https://www.bing.com/search?q=x" });
		await recordClientEvent(deps(T0), a, info());
		const b = body({ t: "pv", sid: S2, h: H(2), u: "/b", w: 1440, n: 1, nt: 0, r: "https://example.org/a" });
		expect(await recordClientEvent(deps(T0 + 40), b, info(other))).toBe("ok");
		const rows = sessions();
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ sid: S1, ...FIRST_TOUCH });
		expect(rows[1]).toMatchObject({ sid: S2, channel: "Direct", entry_path: "/b", ref_host: null });
		expect(rows[1]?.source).not.toBe("example.org");
	});
});
