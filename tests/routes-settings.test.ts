/** Settings routes behind the admin Settings page: sections, field errors, secrets write only, read only Search sign-in. */
import { describe, expect, it } from "vitest";
import { budgetTarget, fieldMeta, SETTINGS_SECTIONS, type SettingsCtx, settingsRoutes, validateSettings } from "../src/routes/settings.js";
import { type DbFor, prefixedKv, statePrefix } from "../src/db/facts.js";
import type { Db } from "../src/db/adapter.js";
import { KV_CURSOR } from "../src/query/retention.js";
import { HOST_FORM_POINTER, normalizeSettings, settingsSchema } from "../src/settings.js";

function harness(initial: Record<string, unknown> = {}, o: { listFails?: boolean; facts?: Pick<DbFor, "targets">; kv?: SettingsCtx["kv"] } = {}) {
	const stored: Record<string, unknown> = { ...initial };
	const writes: string[] = [];
	let changed = 0;
	const routes = settingsRoutes({ settings: async () => normalizeSettings(stored), settingsChanged: () => void changed++, facts: () => o.facts ?? null });
	const ctx = (input: unknown): SettingsCtx => ({
		input,
		...(o.kv ? { kv: o.kv } : {}),
		settings: {
			get: async (k) => {
				if (k === "gscClientSecret" && o.listFails) throw new Error("PLUGIN_SETTING_DECRYPTION_FAILED");
				return stored[k] ?? null;
			},
			set: async (k, v) => {
				writes.push(k);
				stored[k] = v;
			},
			list: async () => {
				if (o.listFails) throw new Error("PLUGIN_SETTING_DECRYPTION_FAILED");
				return Object.entries(stored).map(([key, value]) => ({ key, value }));
			},
		},
	});
	return {
		stored,
		writes,
		changed: () => changed,
		get: () => routes["settings/get"].handler(ctx({})) as Promise<Record<string, any>>,
		save: (values: Record<string, unknown>) => routes["settings/save"].handler(ctx({ values })) as Promise<Record<string, any>>,
		routes,
	};
}

describe("settings sections", () => {
	it("puts every schema key in exactly one section, in the schema's order", () => {
		const keys = SETTINGS_SECTIONS.flatMap((s) => s.keys);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys).toEqual(Object.keys(settingsSchema));
		for (const s of SETTINGS_SECTIONS) for (const a of s.advanced ?? []) expect(s.keys, `${s.id}: ${a}`).toContain(a);
		expect(new Set(SETTINGS_SECTIONS.map((s) => s.id)).size).toBe(SETTINGS_SECTIONS.length);
	});

	it("keeps every secret in the read only Search connections section", () => {
		const secrets = Object.entries(settingsSchema).flatMap(([k, f]) => (f.type === "secret" ? [k] : []));
		const conn = SETTINGS_SECTIONS.find((s) => s.id === "connections");
		expect(conn?.readOnly).toBe(true);
		for (const k of secrets) expect(conn?.keys).toContain(k);
		for (const s of SETTINGS_SECTIONS.filter((x) => !x.readOnly)) expect(s.keys.filter((k) => settingsSchema[k].type === "secret")).toEqual([]);
	});

	it("draws a field with its unit out of the label, help and more, and the stored ms in minutes", () => {
		expect(fieldMeta("sessionWindowMinutes")).toMatchObject({ label: "Session window", unit: "minutes", min: 1, max: 240, default: 30 });
		expect(fieldMeta("maxEngagedMsPerPage", true)).toMatchObject({ label: "Maximum engaged time per page", unit: "minutes", min: 1, max: 120, default: 30, advanced: true });
		const tz = fieldMeta("siteTimezone");
		expect(tz.help).not.toContain(HOST_FORM_POINTER);
		expect(tz.help).toBe("IANA timezone used for days and hours in reports, for example Europe/Berlin.");
		const cap = fieldMeta("capacityProfile");
		expect(cap.help.endsWith(".")).toBe(true);
		expect(cap.more?.length).toBeGreaterThan(50);
		expect(fieldMeta("scriptDelivery").when).toBe("injectScript");
	});

	it("leads the host form with the pointer to the Settings page", () => {
		const first = Object.values(settingsSchema)[0];
		expect(first?.description.startsWith(HOST_FORM_POINTER)).toBe(true);
	});
});

describe("validateSettings", () => {
	it("refuses out of range, fractional and wrong typed values with a sentence per field", () => {
		const { clean, errors } = validateSettings({ sessionWindowMinutes: 0, engagedThresholdSeconds: 2.5, captureRegion: "yes", signals: "all", rawRetentionDays: 400 }, {});
		expect(errors.sessionWindowMinutes).toBe("Use a whole number from 1 to 240.");
		expect(errors.engagedThresholdSeconds).toBe("Use a whole number from 1 to 300.");
		expect(errors.captureRegion).toBe("Choose on or off.");
		expect(errors.signals).toBe("Choose one of the listed options.");
		expect(clean).toEqual({ rawRetentionDays: 400 });
	});

	it("names the list items normalizeSettings would drop instead of dropping them without a word", () => {
		const { errors, clean } = validateSettings({ excludeIpPrefixes: "10.0.0.0/8\n300.1.1.1/8, nope", excludePaths: "/admin/\n/preview/" }, {});
		expect(errors.excludeIpPrefixes).toBe("Not valid or over the limit: 300.1.1.1/8, nope.");
		expect(clean.excludePaths).toBe("/admin/\n/preview/");
		expect(validateSettings({ siteSearchParams: "q s a b c d" }, {}).errors.siteSearchParams).toBe("Not valid or over the limit: d.");
	});

	it("refuses strings the normalizer would replace, and stores a site origin in its normalized form", () => {
		expect(validateSettings({ siteId: "Main Site" }, {}).errors.siteId).toMatch(/lowercase letters/);
		expect(validateSettings({ siteTimezone: "Mars/Olympus" }, {}).errors.siteTimezone).toMatch(/IANA/);
		expect(validateSettings({ siteOrigin: "https://example.com/blog" }, {}).errors.siteOrigin).toMatch(/no path/);
		expect(validateSettings({ siteOrigin: "https://example.com/" }, {}).clean.siteOrigin).toBe("https://example.com");
		expect(validateSettings({ siteOrigin: "" }, {}).clean.siteOrigin).toBe("");
	});

	it("checks a value against the stored ones: equal script and event paths, a bad experience above the long click", () => {
		expect(validateSettings({ collectPath: "/assets/app.js" }, { scriptPath: "/assets/app.js" }).errors.collectPath).toMatch(/differs/);
		expect(validateSettings({ badExperienceSeconds: 50 }, { longClickSeconds: 30 }).errors.badExperienceSeconds).toBe("Not above the long click time (30 seconds).");
		expect(validateSettings({ badExperienceSeconds: 20, longClickSeconds: 30 }, {}).errors).toEqual({});
	});

	it("stores minutes of the engaged time cap as milliseconds", () => {
		expect(validateSettings({ maxEngagedMsPerPage: 45 }, {}).clean.maxEngagedMsPerPage).toBe(2_700_000);
		expect(validateSettings({ maxEngagedMsPerPage: 121 }, {}).errors.maxEngagedMsPerPage).toBe("Use a whole number from 1 to 120.");
	});

	it("checks the automatic annotation cap range and the collection list", () => {
		expect(validateSettings({ autoAnnotationsPerDay: 0 }, {}).errors.autoAnnotationsPerDay).toBe("Use a whole number from 1 to 200.");
		expect(validateSettings({ autoAnnotationsPerDay: 201 }, {}).errors.autoAnnotationsPerDay).toBe("Use a whole number from 1 to 200.");
		expect(validateSettings({ autoAnnotationsPerDay: 200, annotateUpdate: true }, {}).clean).toEqual({ autoAnnotationsPerDay: 200, annotateUpdate: true });
		expect(validateSettings({ annotateCollections: "posts\nnews_items" }, {}).clean.annotateCollections).toBe("posts\nnews_items");
		expect(validateSettings({ annotateCollections: "posts, 9lives, a-b" }, {}).errors.annotateCollections).toBe("Not valid or over the limit: 9lives, a-b.");
		expect(fieldMeta("autoAnnotationsPerDay")).toMatchObject({ min: 1, max: 200, default: 10, when: "autoAnnotations" });
	});

	it("refuses unknown keys and every Search sign-in key, secrets included", () => {
		const { errors, clean } = validateSettings({ nope: 1, gscAuth: "off", gscProperty: "", bingApiKey: "abc" }, {});
		expect(Object.keys(errors).sort()).toEqual(["bingApiKey", "gscAuth", "gscProperty", "nope"]);
		expect(errors.gscAuth).toBe("Search sign-in is changed on the Search page.");
		expect(clean).toEqual({});
	});
});

describe("settings routes", () => {
	it("are both plugins:manage", () => {
		const { routes } = harness();
		expect(Object.fromEntries(Object.entries(routes).map(([n, r]) => [n, r.permission]))).toEqual({ "settings/get": "plugins:manage", "settings/save": "plugins:manage" });
	});

	it("get answers sections, stored or default values, and only whether a secret is set", async () => {
		const h = harness({ gscAuth: "oauth", gscClientId: "client.example.com", gscClientSecret: "never-echo-secret", gscProperty: "sc-domain:example.com", gscRefreshToken: "never-echo-token", sessionWindowMinutes: 45, maxEngagedMsPerPage: 600_000 });
		const r = await h.get();
		expect(JSON.stringify(r)).not.toContain("never-echo");
		expect(r.secrets).toMatchObject({ gscClientSecret: true, gscRefreshToken: true, bingApiKey: false });
		for (const k of Object.keys(r.secrets)) expect(k in r.values).toBe(false);
		expect(r.values).toMatchObject({ sessionWindowMinutes: 45, maxEngagedMsPerPage: 10, siteTimezone: "UTC", injectScript: true });
		expect(r.sections.map((s: { id: string }) => s.id)).toEqual(SETTINGS_SECTIONS.map((s) => s.id));
		expect(r.search).toEqual({ google: true, bing: false });
	});

	it("get still answers when a stored secret cannot be decrypted", async () => {
		const r = await harness({ gscClientSecret: "x", siteTimezone: "Europe/Berlin" }, { listFails: true }).get();
		expect(r.values.siteTimezone).toBe("Europe/Berlin");
		expect(r.secrets.gscClientSecret).toBe(true);
	});

	it("save writes only the named keys and drops the cached settings", async () => {
		const h = harness({ gscAuth: "oauth", gscProperty: "sc-domain:example.com" });
		const r = await h.save({ sessionWindowMinutes: 20, captureRegion: true });
		expect(r).toEqual({ saved: true, values: { sessionWindowMinutes: 20, captureRegion: true } });
		expect(h.writes).toEqual(["sessionWindowMinutes", "captureRegion"]);
		expect(h.stored.gscAuth).toBe("oauth");
		expect(h.changed()).toBe(1);
	});

	it("save writes nothing while any value is refused, and never a secret", async () => {
		const h = harness();
		const r = await h.save({ sessionWindowMinutes: 20, longClickSeconds: 5000, gscClientSecret: "x" });
		expect(r.saved).toBe(false);
		expect(Object.keys(r.errors).sort()).toEqual(["gscClientSecret", "longClickSeconds"]);
		expect(h.writes).toEqual([]);
		expect(h.changed()).toBe(0);
	});

	it("save refuses a bad link rule line with its message and writes nothing", async () => {
		const h = harness();
		const r = await h.save({ linkRules: "/go/ out\n~^(a+)+$ x", captureRegion: true });
		expect(r).toEqual({ saved: false, errors: { linkRules: "Line 2: Nested quantifiers are not allowed." } });
		expect(h.writes).toEqual([]);
	});

	it("save checks link rules against the short link prefixes of the same save, and stores the text as typed", async () => {
		const h = harness();
		expect((await h.save({ ignorePathPrefixes: "/go/", linkRules: "/go/x out" })).errors).toEqual({
			linkRules: "Line 1: /go/ is a short link path prefix, whose redirect already reports the click. Remove it there or here.",
		});
		const ok = await h.save({ linkRules: "/go/ out\n\nmailto: contact email\n" });
		expect(ok).toEqual({ saved: true, values: { linkRules: "/go/ out\n\nmailto: contact email" } });
		expect(normalizeSettings(h.stored).linkRules).toEqual([
			["/go/", "out"],
			["mailto:", "contact", "email"],
		]);
		expect((await h.get()).values.linkRules).toBe("/go/ out\n\nmailto: contact email");
	});

	it("save refuses a malformed body", async () => {
		await expect(harness().routes["settings/save"].handler({ input: { values: { a: { b: 1 } } }, settings: undefined })).rejects.toThrow();
		await expect(harness().routes["settings/save"].handler({ input: { values: {}, extra: 1 }, settings: undefined })).rejects.toThrow();
	});
});

describe("storage budget setting", () => {
	/** Facts of the EmDash database for unrouted sites plus an own binding, or own databases only. */
	const facts = (bindings: Array<string | null>, dialect?: "sqlite" | "postgres"): Pick<DbFor, "targets"> => ({
		targets: () =>
			bindings.map((b, i) => ({
				binding: b,
				db: async () => {
					if (!dialect) throw new Error("unopened");
					return { dialect } as Db;
				},
				kv: (kv) => (i === 0 ? kv : prefixedKv(kv, statePrefix(b ?? ""))),
			})),
	});
	const own = facts(["CA_DB"]);

	it("is in Data and capacity after the profile, with the unit MB", () => {
		expect(SETTINGS_SECTIONS.find((s) => s.id === "data")?.keys.slice(0, 2)).toEqual(["capacityProfile", "storageBudgetMb"]);
		expect(fieldMeta("storageBudgetMb")).toMatchObject({ label: "Storage budget", unit: "MB", default: 0, min: 0, max: 2000000 });
	});

	it("checks against the EmDash database while any site writes there", async () => {
		expect(await budgetTarget(null)).toBe("host");
		expect(await budgetTarget(facts([null, "CA_SHOP"]))).toBe("host");
		expect(await budgetTarget(facts([null, "CA_SHOP"], "sqlite"))).toBe("host");
		// The EmDash database on Postgres too: the estimate uses the Postgres row there, so the form does.
		expect(await budgetTarget(facts([null, "CA_PG"], "postgres"))).toBe("postgres");
		expect(await budgetTarget(own)).toBe("own");
		expect(await budgetTarget(facts(["CA_DB", "CA_SHOP"], "sqlite"))).toBe("own");
		// Postgres only when every database is: an own database that cannot be opened counts as D1.
		expect(await budgetTarget(facts(["CA_PG", "CA_PG2"], "postgres"))).toBe("postgres");
	});

	it("does not wait for a database that does not open: the binding's engine decides after a short wait", async () => {
		const hanging = (bindings: Array<string | null>): Pick<DbFor, "targets"> => ({
			targets: () => bindings.map((b) => ({ binding: b, db: () => new Promise<Db>(() => {}), kv: (kv) => kv })),
		});
		const env = async () => ({ CA_PG: { connectionString: "postgres://example.com/db" }, CA_DB: { prepare: () => null, batch: async () => [] } });
		const t0 = Date.now();
		expect(await budgetTarget(hanging(["CA_PG"]), env, 20)).toBe("postgres");
		expect(await budgetTarget(hanging(["CA_DB"]), env, 20)).toBe("own");
		// The EmDash database and a binding the Worker lacks count as D1: the stricter row.
		expect(await budgetTarget(hanging([null, "CA_PG"]), env, 20)).toBe("host");
		expect(await budgetTarget(hanging(["CA_PG"]), async () => null, 20)).toBe("own");
		expect(Date.now() - t0).toBeLessThan(1000);
	});

	it("allows up to 2000000 MB when every database is Postgres, with its own reason below 100", async () => {
		const pg = facts(["CA_PG"], "postgres");
		expect(await harness({}, { facts: pg }).save({ storageBudgetMb: 50_000 })).toEqual({ saved: true, values: { storageBudgetMb: 50_000 } });
		expect((await harness({ capacityProfile: "small" }, { facts: pg }).save({ storageBudgetMb: 50 })).errors.storageBudgetMb).toBe(
			"Use 0 for the default, or 100 to 2000000 here: Postgres has no fixed size; the budget keeps a hosted plan from filling up.",
		);
		expect((await harness({}, { facts: pg }).get()).budget).toEqual({ target: "postgres", otherMb: null, level: "none" });
	});

	it("save refuses 9500 on the EmDash database and accepts it on an own database; refuses 30 and 9600 everywhere", async () => {
		const host = await harness().save({ storageBudgetMb: 9500 });
		expect(host).toEqual({ saved: false, errors: { storageBudgetMb: "Use 0 for the default, or 100 to 9000 here: the EmDash database holds 10 GB including the site's content." } });
		expect(await harness({}, { facts: own }).save({ storageBudgetMb: 9500 })).toEqual({ saved: true, values: { storageBudgetMb: 9500 } });
		expect((await harness({}, { facts: own }).save({ storageBudgetMb: 30 })).errors.storageBudgetMb).toBe("Use 0 for the default, or 100 to 9500 here: a D1 database holds 10 GB, and Search data, aliases and space freed by deletes are not part of the estimate.");
		expect((await harness({}, { facts: own }).save({ storageBudgetMb: 9600 })).errors.storageBudgetMb).toBe("Use 0 for the default, or 100 to 9500 here: a D1 database holds 10 GB, and Search data, aliases and space freed by deletes are not part of the estimate.");
		expect((await harness().save({ storageBudgetMb: 0 })).saved).toBe(true);
	});

	it("checks the budget against the profile of the same save", async () => {
		expect((await harness({ capacityProfile: "standard" }).save({ capacityProfile: "small", storageBudgetMb: 1000 })).errors.storageBudgetMb).toBe(
			"Use 0 for the default, or 50 to 450 here: a database on the Workers Free plan holds 500 MB including the site's content.",
		);
		expect((await harness({ capacityProfile: "small" }).save({ storageBudgetMb: 400 })).saved).toBe(true);
		// An own database on the Workers Free plan holds no site content.
		expect((await harness({ capacityProfile: "small" }, { facts: own }).save({ storageBudgetMb: 1000 })).errors.storageBudgetMb).toBe("Use 0 for the default, or 50 to 450 here: a database on the Workers Free plan holds 500 MB.");
		expect((await harness({ capacityProfile: "small" }).save({ capacityProfile: "standard", storageBudgetMb: 50 })).saved).toBe(false);
	});

	it("get answers the target and the warning level of the stored value", async () => {
		expect((await harness().get()).budget).toEqual({ target: "host", otherMb: null, level: "none" });
		expect((await harness({ storageBudgetMb: 7000 }).get()).budget).toEqual({ target: "host", otherMb: null, level: "caution" });
		expect((await harness({ storageBudgetMb: 8500 }).get()).budget).toEqual({ target: "host", otherMb: null, level: "strong" });
		expect((await harness({ storageBudgetMb: 9500 }, { facts: own }).get()).budget).toEqual({ target: "own", otherMb: null, level: "caution" });
	});

	it("a saved budget or profile clears the estimate day of every database, so the next retention tick recomputes", async () => {
		const state = new Map<string, unknown>([
			[KV_CURSOR, { day: "2026-06-15", rawDays: 30, capped: true, step: 9, deleted: {} }],
			[statePrefix("CA_SHOP") + KV_CURSOR, { day: "2026-06-15", rawDays: 60, capped: true, step: 9, deleted: {} }],
		]);
		const kv = { get: async <T>(k: string) => (state.get(k) ?? null) as T | null, set: async (k: string, v: unknown) => void state.set(k, v) };
		const h = harness({}, { facts: facts([null, "CA_SHOP"]), kv });
		await h.save({ sessionWindowMinutes: 20 });
		expect((state.get(KV_CURSOR) as { day: string }).day).toBe("2026-06-15");
		await h.save({ storageBudgetMb: 3000 });
		expect(state.get(KV_CURSOR)).toMatchObject({ day: "", rawDays: 30, capped: true });
		expect(state.get(statePrefix("CA_SHOP") + KV_CURSOR)).toMatchObject({ day: "", rawDays: 60 });
		// No cursor yet: nothing is written.
		state.clear();
		await h.save({ capacityProfile: "dedicated" });
		expect(state.size).toBe(0);
	});
});
