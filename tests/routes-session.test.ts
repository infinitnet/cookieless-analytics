import { beforeEach, describe, expect, it } from "vitest";
import { validateIngest } from "../src/core/ids.js";
import { recordClientEvent, requestInfo, resetCounters } from "../src/core/recorder.js";
import type { IngestBody } from "../src/contract.js";
import { contractBody, contractRoute } from "../src/routes/contract.js";
import { sessionRoute } from "../src/routes/session.js";
import { normalizeSettings } from "../src/settings.js";
import { CHROME_UA, GOOGLEBOT_UA, schemaDb } from "./helpers.js";
import { ctx, fakeEnv } from "./routes.helpers.js";

const NOW = Math.floor(Date.now() / 1000);
const SID = "aaaaaaaaaaaaaaaaaaaa";
const OTHER = "cccccccccccccccccccc";

let db: Awaited<ReturnType<typeof schemaDb>>;
beforeEach(async () => {
	resetCounters();
	db = await schemaDb();
});

const get = (query: string, ua = CHROME_UA) =>
	new Request(`https://example.org/_emdash/api/plugins/cookieless-analytics/session${query}`, { headers: { "user-agent": ua, "cf-connecting-ip": "203.0.113.7" } });

async function read(query: Record<string, string>, ua = CHROME_UA) {
	const res = await sessionRoute(fakeEnv(db, {}, NOW).env).handler(ctx(get("", ua), query, db.kv));
	return { res, data: res.body ? JSON.parse((res.body as { value: string }).value) : null };
}

async function seed() {
	const req = new Request("https://example.org/_/e", { method: "POST", headers: { "user-agent": CHROME_UA, "cf-connecting-ip": "203.0.113.7" } });
	const body = validateIngest({ v: 1, t: "pv", sid: SID, h: "hhhhhhhhhhh1", u: "/landing?utm_source=news&utm_medium=email", r: "", w: 1440 }) as IngestBody;
	await recordClientEvent({ db: db.db, kv: db.kv, settings: normalizeSettings({}), now: NOW - 60 }, body, requestInfo(req));
}

describe("session route", () => {
	it("answers bots with 204 and no body", async () => {
		await seed();
		const { res } = await read({ sid: SID }, GOOGLEBOT_UA);
		expect(res).toMatchObject({ status: 204, body: null });
	});

	it("returns the contract shape for an active sid", async () => {
		await seed();
		const { res, data } = await read({ sid: SID });
		expect(res.status).toBe(200);
		expect(data).toEqual({
			v: 1,
			sid: SID,
			started: NOW - 60,
			channel: "Email",
			source: "news",
			utm_source: "news",
			utm_medium: "email",
			utm_campaign: null,
			utm_term: null,
			utm_content: null,
			entry_path: "/landing",
			country: null,
			device: "desktop",
		});
	});

	it("resolves the caller's session through the visitor key when no sid is given", async () => {
		await seed();
		expect((await read({})).data.sid).toBe(SID);
	});

	it("returns { sid: null } when there is no active session", async () => {
		expect((await read({ sid: OTHER })).data).toEqual({ v: 1, sid: null });
		expect((await read({})).data).toEqual({ v: 1, sid: null });
		expect((await read({ sid: "not-a-sid" })).data).toEqual({ v: 1, sid: null });
	});
});

describe("contract route", () => {
	it("returns the discovery body with the proxy capability and is cacheable for 60 s", async () => {
		const r = contractRoute(fakeEnv(db).env);
		expect(r).toMatchObject({ public: true, methods: ["GET"], cacheControl: "public, max-age=60" });
		const res = await r.handler(ctx(get(""), {}, db.kv));
		expect(JSON.parse((res.body as { value: string }).value)).toEqual({ v: 1, pluginId: "cookieless-analytics", collectPath: "/_/e", scriptPath: "/_/e.js", namespace: "__ec", proxy: true });
	});

	it("keeps the fields a client of an earlier install reads and adds only the capability", () => {
		const body = contractBody(normalizeSettings({ collectPath: "/_/x", scriptPath: "/_/x.js", namespace: "__zz" }));
		expect(body).toEqual({ v: 1, pluginId: "cookieless-analytics", collectPath: "/_/x", scriptPath: "/_/x.js", namespace: "__zz", proxy: true });
		expect(Object.keys(body)).toEqual(["v", "pluginId", "collectPath", "scriptPath", "namespace", "proxy"]);
	});
});
