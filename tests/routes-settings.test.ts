/** Settings routes behind the admin Settings page: sections, field errors, secrets write only, read only Search sign-in. */
import { describe, expect, it } from "vitest";
import { fieldMeta, SETTINGS_SECTIONS, type SettingsCtx, settingsRoutes, validateSettings } from "../src/routes/settings.js";
import { HOST_FORM_POINTER, normalizeSettings, settingsSchema } from "../src/settings.js";

function harness(initial: Record<string, unknown> = {}, o: { listFails?: boolean } = {}) {
	const stored: Record<string, unknown> = { ...initial };
	const writes: string[] = [];
	let changed = 0;
	const routes = settingsRoutes({ settings: async () => normalizeSettings(stored), settingsChanged: () => void changed++ });
	const ctx = (input: unknown): SettingsCtx => ({
		input,
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

	it("save refuses a malformed body", async () => {
		await expect(harness().routes["settings/save"].handler({ input: { values: { a: { b: 1 } } }, settings: undefined })).rejects.toThrow();
		await expect(harness().routes["settings/save"].handler({ input: { values: {}, extra: 1 }, settings: undefined })).rejects.toThrow();
	});
});
