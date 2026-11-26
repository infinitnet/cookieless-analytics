import { describe, expect, it, vi } from "vitest";
import { DEFAULT_COLLECT_PATH, DEFAULT_NAMESPACE, DEFAULT_SCRIPT_PATH } from "../src/contract.js";
import { isNeutral, normalizeCollectPath, normalizeNamespace, normalizeScriptPath, publicNames } from "../src/names.js";
import { budgetRange, budgetWarning, cachedSettings, DEFAULT_SETTINGS, normalizeSettings, SCRIPT_FOR_BOTS_CAVEAT, settingsSchema, storageBudget } from "../src/settings.js";

// Every setting key.
const SETTING_KEYS = [
	"siteId", "siteTimezone", "scriptPath", "collectPath", "sharePath", "namespace", "scriptDelivery", "injectScript", "scriptForBots",
	"signals", "sessionWindowMinutes", "maxSessionMinutes",
	"maxPageviewsPerSession", "maxEventsPerSession", "maxEventsPerSidPerMinute", "maxEventsPerVkeyPerMinute", "engagedThresholdSeconds",
	"maxEngagedMsPerPage", "longClickSeconds", "badExperienceSeconds", "satisfactionMinMeasured", "reloadDedupeSeconds", "realtimeWindowMinutes", "saltTimezone", "saltRotationHour",
	"ipTruncation", "excludeEditors", "excludePaths", "excludeIpPrefixes", "ignoreReferrerHosts", "queryAllowlist",
	"captureLanguage", "captureRegion", "captureScreen", "autoOutbound", "autoDownloads", "autoForms", "ignorePathPrefixes", "linkRules", "downloadExtensions",
	"logErrorPages", "ingestTier",
	"rawRetentionDays", "rollupRetentionMonths", "capacityProfile", "storageBudgetMb",
	"agentRateLimitPerMinute", "proxyRateLimitPerMinute", "siteOrigin", "gscAuth", "gscProperty", "gscClientId", "gscClientSecret", "gscRefreshToken",
	"gscServiceAccount", "bingEnabled", "bingAuth", "bingApiKey", "bingClientId", "bingClientSecret", "bingRefreshToken", "bingSiteUrl", "searchSyncHours", "syncSubrequestBudget", "searchRetentionDays", "backfillDays", "searchMaxRowsPerDay",
	"searchMinImpressions", "searchOverlapMinShare", "searchBrandTerms", "defaultCurrency", "acceptClientRevenue", "siteSearchParams",
	"autoAnnotations", "annotatePublish", "annotateUpdate", "annotateCollections", "autoAnnotationsPerDay",
];
const SECRET_KEYS = ["gscClientSecret", "gscRefreshToken", "gscServiceAccount", "bingApiKey", "bingClientSecret", "bingRefreshToken"];

describe("settingsSchema", () => {
	it("declares every setting key with label, description and default", () => {
		expect(Object.keys(settingsSchema).sort()).toEqual([...SETTING_KEYS].sort());
		for (const [key, field] of Object.entries(settingsSchema)) {
			expect(field.label, key).toBeTruthy();
			expect(field.description, key).toBeTruthy();
			if (field.type !== "secret") expect("default" in field, key).toBe(true);
		}
	});

	it("types secrets and urls", () => {
		const fields = settingsSchema as Record<string, { type: string; default?: unknown; min?: number; max?: number }>;
		expect(Object.keys(fields).filter((k) => fields[k]?.type === "secret").sort()).toEqual([...SECRET_KEYS].sort());
		for (const k of SECRET_KEYS) expect("default" in (fields[k] ?? {}), k).toBe(false);
		expect(fields.siteOrigin?.type).toBe("url");
		expect(fields.bingSiteUrl?.type).toBe("url");
		expect([fields.agentRateLimitPerMinute?.min, fields.agentRateLimitPerMinute?.max]).toEqual([5, 1200]);
		// The proxy ceiling: default 3000 a minute for one site, never below one request a second.
		expect([fields.proxyRateLimitPerMinute?.min, fields.proxyRateLimitPerMinute?.max, fields.proxyRateLimitPerMinute?.default]).toEqual([60, 60000, 3000]);
		expect([fields.searchSyncHours?.min, fields.searchSyncHours?.max]).toEqual([1, 24]);
		expect([fields.searchRetentionDays?.min, fields.searchRetentionDays?.max]).toEqual([90, 1000]);
		expect([fields.searchMaxRowsPerDay?.min, fields.searchMaxRowsPerDay?.max]).toEqual([1000, 25000]);
	});

	it("treats missing secrets as empty strings and validates url settings", () => {
		const s = normalizeSettings({ siteOrigin: "https://Example.com/", bingSiteUrl: "https://example.com/blog/", gscRefreshToken: "tok" });
		expect(s).toMatchObject({ siteOrigin: "https://example.com", bingSiteUrl: "https://example.com/blog/", gscRefreshToken: "tok", gscClientSecret: "", gscServiceAccount: "", bingApiKey: "" });
		expect(normalizeSettings({ siteOrigin: "https://example.com/path" }).siteOrigin).toBe("");
		expect(normalizeSettings({ siteOrigin: "javascript:alert(1)" }).siteOrigin).toBe("");
		expect(normalizeSettings({ bingSiteUrl: "ftp://example.com/" }).bingSiteUrl).toBe("");
		expect(normalizeSettings({ gscAuth: "magic" }).gscAuth).toBe("off");
		expect(normalizeSettings({ agentRateLimitPerMinute: 1 }).agentRateLimitPerMinute).toBe(5);
		expect(normalizeSettings({ proxyRateLimitPerMinute: 1 }).proxyRateLimitPerMinute).toBe(60);
		expect(normalizeSettings({ proxyRateLimitPerMinute: 1e9 }).proxyRateLimitPerMinute).toBe(60000);
		expect(normalizeSettings({}).proxyRateLimitPerMinute).toBe(3000);
	});

	it("offers every listed currency as the default currency, USD by default, and falls back to USD", () => {
		expect(settingsSchema.defaultCurrency.default).toBe("USD");
		expect(settingsSchema.defaultCurrency.options.length).toBeGreaterThan(140);
		expect(DEFAULT_SETTINGS).toMatchObject({ defaultCurrency: "USD", acceptClientRevenue: true });
		expect(normalizeSettings({ defaultCurrency: "EUR", acceptClientRevenue: false })).toMatchObject({ defaultCurrency: "EUR", acceptClientRevenue: false });
		for (const bad of ["eur", "XXX", "ZZZ", 978, ""]) expect(normalizeSettings({ defaultCurrency: bad }).defaultCurrency, String(bad)).toBe("USD");
	});

	it("prints the route cache caveat next to scriptForBots", () => {
		expect(settingsSchema.scriptForBots.description).toContain(SCRIPT_FOR_BOTS_CAVEAT);
		expect(SCRIPT_FOR_BOTS_CAVEAT).toMatch(/route cache/);
		expect(SCRIPT_FOR_BOTS_CAVEAT).toMatch(/Vary: User-Agent/);
	});

	it("matches documented defaults", () => {
		expect(DEFAULT_SETTINGS).toMatchObject({
			siteId: "default",
			siteTimezone: "UTC",
			scriptPath: "/_/e.js",
			collectPath: "/_/e",
			sharePath: "/_/s",
			namespace: "__ec",
			scriptDelivery: "external",
			scriptForBots: "always",
			signals: "gpc",
			sessionWindowMinutes: 30,
			maxSessionMinutes: 1440,
			saltRotationHour: 0,
			excludePaths: ["/_emdash/"],
			excludeIpPrefixes: [],
			queryAllowlist: ["utm_*", "gclid", "msclkid", "fbclid"],
			downloadExtensions: ["pdf", "zip", "docx", "xlsx", "pptx", "csv", "mp3", "mp4", "dmg", "exe"],
			rawRetentionDays: 760,
			capacityProfile: "standard",
			agentRateLimitPerMinute: 60,
			proxyRateLimitPerMinute: 3000,
			siteOrigin: "",
			gscAuth: "off",
			gscProperty: "",
			bingEnabled: false,
			bingSiteUrl: "",
			searchSyncHours: 6,
			searchRetentionDays: 800,
			backfillDays: 90,
			searchMaxRowsPerDay: 5000,
			searchMinImpressions: 50,
			searchOverlapMinShare: 10,
			searchBrandTerms: [],
			gscRefreshToken: "",
		});
	});
});

describe("normalizeSettings", () => {
	it("SEO view floors and brand terms", () => {
		const fields = settingsSchema as Record<string, { type: string; min?: number; max?: number; multiline?: boolean }>;
		expect([fields.searchMinImpressions?.min, fields.searchMinImpressions?.max]).toEqual([1, 100000]);
		expect([fields.searchOverlapMinShare?.min, fields.searchOverlapMinShare?.max]).toEqual([1, 50]);
		expect(fields.searchBrandTerms?.multiline).toBe(true);
		expect(normalizeSettings({ searchMinImpressions: 0, searchOverlapMinShare: 90 })).toMatchObject({ searchMinImpressions: 1, searchOverlapMinShare: 50 });
		const terms = normalizeSettings({ searchBrandTerms: " Acme \nacme\nx\n\nwidget co\r\n" + "y".repeat(41) + "\n" + "%".repeat(30) }).searchBrandTerms;
		// Duplicates, one-character and too long terms are dropped; 30 percent signs escape to a pattern over 50 bytes.
		expect(terms).toEqual(["acme", "widget co"]);
		expect(normalizeSettings({ searchBrandTerms: Array.from({ length: 30 }, (_, i) => `term${i}`).join("\n") }).searchBrandTerms).toHaveLength(20);
		expect(normalizeSettings({ searchBrandTerms: "ü".repeat(24) }).searchBrandTerms).toEqual([]);
	});


	it("clamps numbers to their ranges", () => {
		expect(normalizeSettings({ sessionWindowMinutes: 999 }).sessionWindowMinutes).toBe(240);
		expect(normalizeSettings({ sessionWindowMinutes: 0 }).sessionWindowMinutes).toBe(1);
		expect(normalizeSettings({ sessionWindowMinutes: -5 }).sessionWindowMinutes).toBe(1);
		expect(normalizeSettings({ sessionWindowMinutes: "45" }).sessionWindowMinutes).toBe(45);
		expect(normalizeSettings({ sessionWindowMinutes: 12.6 }).sessionWindowMinutes).toBe(13);
		expect(normalizeSettings({ sessionWindowMinutes: "abc" }).sessionWindowMinutes).toBe(30);
		expect(normalizeSettings({ saltRotationHour: 24 }).saltRotationHour).toBe(23);
		expect(normalizeSettings({ reloadDedupeSeconds: 0 }).reloadDedupeSeconds).toBe(0);
		expect(normalizeSettings({}).longClickSeconds).toBe(60);
		expect(normalizeSettings({}).badExperienceSeconds).toBe(10);
		expect(normalizeSettings({ longClickSeconds: 5, badExperienceSeconds: 0 })).toMatchObject({ longClickSeconds: 10, badExperienceSeconds: 1 });
		expect(normalizeSettings({ longClickSeconds: 9999, badExperienceSeconds: 90 })).toMatchObject({ longClickSeconds: 600, badExperienceSeconds: 60 });
	});

	it("satisfactionMinMeasured: default 30, whole numbers from 10 to 500, after badExperienceSeconds", () => {
		expect(normalizeSettings({}).satisfactionMinMeasured).toBe(30);
		expect(DEFAULT_SETTINGS.satisfactionMinMeasured).toBe(30);
		expect(normalizeSettings({ satisfactionMinMeasured: 5 }).satisfactionMinMeasured).toBe(10);
		expect(normalizeSettings({ satisfactionMinMeasured: 9999 }).satisfactionMinMeasured).toBe(500);
		expect(normalizeSettings({ satisfactionMinMeasured: "abc" }).satisfactionMinMeasured).toBe(30);
		expect(normalizeSettings({ satisfactionMinMeasured: "75" }).satisfactionMinMeasured).toBe(75);
		expect(normalizeSettings({ satisfactionMinMeasured: 12.4 }).satisfactionMinMeasured).toBe(12);
		expect(settingsSchema.satisfactionMinMeasured).toMatchObject({
			type: "number",
			label: "Search Satisfaction sample minimum",
			description: "Fewest measured sessions a landing page needs to be ranked as a best or worst page. A score under it is marked low sample.",
			default: 30,
			min: 10,
			max: 500,
		});
		const keys = Object.keys(settingsSchema);
		expect(keys[keys.indexOf("badExperienceSeconds") + 1]).toBe("satisfactionMinMeasured");
	});

	it("falls back to neutral defaults for public names", () => {
		expect(normalizeSettings({ scriptPath: "/_/analytics.js" }).scriptPath).toBe("/_/e.js");
		expect(normalizeSettings({ scriptPath: "/js/Tracker.js" }).scriptPath).toBe("/_/e.js");
		expect(normalizeSettings({ collectPath: "/collect" }).collectPath).toBe("/_/e");
		expect(normalizeSettings({ collectPath: "/_emdash/x" }).collectPath).toBe("/_/e");
		expect(normalizeSettings({ namespace: "__track" }).namespace).toBe("__ec");
		expect(normalizeSettings({ scriptPath: "/a/b.js", collectPath: "/a/b" })).toMatchObject({ scriptPath: "/a/b.js", collectPath: "/a/b" });
		expect(normalizeSettings({ scriptPath: "/same", collectPath: "/same" })).toMatchObject({ scriptPath: "/_/e.js", collectPath: "/_/e" });
	});

	it("normalizes sharePath like scriptPath and keeps it apart from the other paths", () => {
		expect(normalizeSettings({ sharePath: "/view/" }).sharePath).toBe("/view");
		expect(normalizeSettings({ sharePath: "/x//" }).sharePath).toBe("/x");
		expect(normalizeSettings({ sharePath: "/stats" }).sharePath).toBe("/_/s");
		expect(normalizeSettings({ sharePath: "/_emdash/s" }).sharePath).toBe("/_/s");
		expect(normalizeSettings({ sharePath: "no-slash" }).sharePath).toBe("/_/s");
		expect(normalizeSettings({ sharePath: "/_/e" }).sharePath).toBe("/_/s");
		expect(normalizeSettings({ sharePath: "/_/e.js" }).sharePath).toBe("/_/s");
		expect(normalizeSettings({ collectPath: "/v", sharePath: "/v" })).toMatchObject({ collectPath: "/v", sharePath: "/_/s" });
		expect(normalizeSettings({ scriptPath: "/_/s" })).toMatchObject({ scriptPath: "/_/e.js", collectPath: "/_/e", sharePath: "/_/s" });
	});

	it("validates timezones, ids and selects", () => {
		expect(normalizeSettings({ siteTimezone: "Mars/Olympus" }).siteTimezone).toBe("UTC");
		expect(normalizeSettings({ saltTimezone: "" }).saltTimezone).toBe("UTC");
		expect(normalizeSettings({ siteTimezone: "Europe/Berlin" }).siteTimezone).toBe("Europe/Berlin");
		expect(normalizeSettings({ siteId: "Bad Id" }).siteId).toBe("default");
		expect(normalizeSettings({ siteId: "blog-2" }).siteId).toBe("blog-2");
		expect(normalizeSettings({ signals: "everything" }).signals).toBe("gpc");
		expect(normalizeSettings({ ipTruncation: "strict" }).ipTruncation).toBe("strict");
		expect(normalizeSettings({ logErrorPages: "false", injectScript: 0 })).toMatchObject({ logErrorPages: false, injectScript: false });
	});

	it("parses and validates list settings", () => {
		const s = normalizeSettings({
			excludePaths: "/admin/\n/preview, nope",
			excludeIpPrefixes: "10.0.0.0/8, 999.1.1.1/8, 2001:db8::/32, garbage",
			ignoreReferrerHosts: "Pay.Example.org bad_host!",
			queryAllowlist: "utm_*, ref, ref",
			downloadExtensions: "PDF,zip,exe.bat",
		});
		expect(s.excludePaths).toEqual(["/admin/", "/preview"]);
		expect(s.excludeIpPrefixes).toEqual(["10.0.0.0/8", "2001:db8::/32"]);
		expect(s.ignoreReferrerHosts).toEqual(["pay.example.org"]);
		expect(s.queryAllowlist).toEqual(["utm_*", "ref"]);
		expect(s.downloadExtensions).toEqual(["pdf", "zip"]);
	});

	it("never throws on junk", () => {
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({ scriptPath: 42, namespace: {}, rawRetentionDays: Number.NaN, capacityProfile: "huge" })).toMatchObject({ scriptPath: "/_/e.js", namespace: "__ec", rawRetentionDays: 760, capacityProfile: "standard" });
	});
});

describe("cachedSettings", () => {
	it("loads once per ttl, shares in-flight loads and keeps the last good value on error", async () => {
		let t = 0;
		const loader = vi.fn().mockResolvedValueOnce({ sessionWindowMinutes: 10 }).mockRejectedValueOnce(new Error("db down")).mockResolvedValue({ sessionWindowMinutes: 20 });
		const get = cachedSettings(loader, 1000, () => t);
		const [a, b] = await Promise.all([get(), get()]);
		expect(loader).toHaveBeenCalledTimes(1);
		expect(a.sessionWindowMinutes).toBe(10);
		expect(b).toBe(a);
		t = 500;
		expect((await get()).sessionWindowMinutes).toBe(10);
		t = 1500;
		expect((await get()).sessionWindowMinutes).toBe(10);
		t = 3000;
		expect((await get()).sessionWindowMinutes).toBe(20);
		expect(loader).toHaveBeenCalledTimes(3);
	});
	it("never caches defaults for a full ttl: retries after 5 s and keeps the last good value", async () => {
		let t = 0;
		const loader = vi
			.fn()
			.mockRejectedValueOnce(new Error("db down"))
			.mockResolvedValueOnce({ ignorePathPrefixes: "/go/" })
			.mockRejectedValueOnce(new Error("db down"))
			.mockResolvedValue({ ignorePathPrefixes: "/go/", sessionWindowMinutes: 20 });
		const get = cachedSettings(loader, 60_000, () => t);
		expect((await get()).ignorePathPrefixes).toEqual(DEFAULT_SETTINGS.ignorePathPrefixes);
		t = 4_000;
		await get();
		expect(loader).toHaveBeenCalledTimes(1);
		t = 5_000;
		const good = await get();
		expect(loader).toHaveBeenCalledTimes(2);
		expect(good.ignorePathPrefixes).not.toEqual(DEFAULT_SETTINGS.ignorePathPrefixes);
		t = 70_000;
		expect(await get()).toBe(good);
		expect(loader).toHaveBeenCalledTimes(3);
		t = 74_000;
		expect(await get()).toBe(good);
		t = 75_000;
		expect((await get()).sessionWindowMinutes).toBe(20);
		expect(loader).toHaveBeenCalledTimes(4);
	});
});

describe("names", () => {
	it("detects forbidden words case-insensitively", () => {
		expect(isNeutral("/_/e.js")).toBe(true);
		for (const bad of ["Analytics", "TRACK", "pixel", "telemetry", "collector", "stats", "beacon"]) expect(isNeutral(bad)).toBe(false);
	});

	it("normalizes paths and namespaces", () => {
		expect(normalizeScriptPath("/_/e.js")).toBe(DEFAULT_SCRIPT_PATH);
		expect(normalizeScriptPath("/static/x.js")).toBe("/static/x.js");
		expect(normalizeScriptPath("relative.js")).toBe(DEFAULT_SCRIPT_PATH);
		expect(normalizeScriptPath("/a/../b.js")).toBe(DEFAULT_SCRIPT_PATH);
		expect(normalizeScriptPath("/_astro/x.js")).toBe(DEFAULT_SCRIPT_PATH);
		expect(normalizeCollectPath("/_image/x")).toBe(DEFAULT_COLLECT_PATH);
		expect(normalizeCollectPath("//evil.example/x")).toBe(DEFAULT_COLLECT_PATH);
		expect(normalizeNamespace("myNs")).toBe("myNs");
		expect(normalizeNamespace("1abc")).toBe(DEFAULT_NAMESPACE);
		expect(normalizeNamespace("a")).toBe(DEFAULT_NAMESPACE);
	});

	it("derives window and data attribute names", () => {
		expect(publicNames("__ec")).toEqual({
			namespace: "__ec",
			queue: "__ecq",
			readyEvent: "__ec:ready",
			attrPrefix: "data-ec-",
			attrEvent: "data-ec-event",
			attrPropPrefix: "data-ec-prop-",
			attrIgnore: "data-ec-ignore",
		});
		expect(publicNames("My_Ns").attrEvent).toBe("data-my-ns-event");
		expect(publicNames("__").attrPrefix).toBe("data-ec-");
	});
});

describe("storage budget", () => {
	const at = (capacityProfile: "small" | "standard" | "dedicated", storageBudgetMb: number) => ({ capacityProfile, storageBudgetMb });

	it("defaults to 0 and clamps to the schema range", () => {
		expect(DEFAULT_SETTINGS.storageBudgetMb).toBe(0);
		expect(normalizeSettings({ storageBudgetMb: 3_000_000 }).storageBudgetMb).toBe(2_000_000);
		expect(normalizeSettings({ storageBudgetMb: -5 }).storageBudgetMb).toBe(0);
		expect(normalizeSettings({ storageBudgetMb: "1234.4" }).storageBudgetMb).toBe(1234);
	});

	it("default settings give the profile budgets of before, in both targets", () => {
		for (const target of ["host", "own"] as const) {
			expect(storageBudget(at("small", 0), target).bytes).toBe(300e6);
			expect(storageBudget(at("standard", 0), target).bytes).toBe(6e9);
			expect(storageBudget(at("dedicated", 0), target).bytes).toBe(9e9);
		}
	});

	it("has the rows of the budget table", () => {
		expect(budgetRange("small", "host")).toEqual({ def: 300, min: 50, max: 450, caution: 300, strong: 400 });
		expect(budgetRange("small", "own")).toEqual({ def: 300, min: 50, max: 450, caution: 300, strong: 400 });
		expect(budgetRange("standard", "host")).toEqual({ def: 6000, min: 100, max: 9000, caution: 6000, strong: 8000 });
		expect(budgetRange("dedicated", "host")).toEqual({ def: 9000, min: 100, max: 9000, caution: 6000, strong: 8000 });
		expect(budgetRange("standard", "own")).toEqual({ def: 6000, min: 100, max: 9500, caution: 9000, strong: null });
		expect(budgetRange("dedicated", "own")).toEqual({ def: 9000, min: 100, max: 9500, caution: 9000, strong: null });
		// Postgres: the profile's default, no D1 cap and no warning; `small` there is not the 500 MB Free plan database.
		expect(budgetRange("small", "postgres")).toEqual({ def: 300, min: 100, max: 2_000_000, caution: null, strong: null });
		expect(budgetRange("dedicated", "postgres")).toEqual({ def: 9000, min: 100, max: 2_000_000, caution: null, strong: null });
		expect(storageBudget(at("standard", 50_000), "postgres")).toEqual({ bytes: 50e9, max: 2_000_000 });
		expect(storageBudget(at("standard", 50_000), "own").bytes).toBe(9.5e9);
		expect(budgetWarning(at("small", 450_000), "postgres")).toBe("none");
	});

	it("uses the setting in MB within the row, and clamps a value saved for another target", () => {
		expect(storageBudget(at("standard", 3000), "host")).toEqual({ bytes: 3e9, max: 9000 });
		expect(storageBudget(at("standard", 9500), "own")).toEqual({ bytes: 9.5e9, max: 9500 });
		// Saved on an own database, read after the option moved the tables to the EmDash database.
		expect(storageBudget(at("standard", 9500), "host")).toEqual({ bytes: 9e9, max: 9000 });
		// Saved on small, read after the profile changed; and the reverse.
		expect(storageBudget(at("standard", 50), "host").bytes).toBe(100e6);
		expect(storageBudget(at("small", 6000), "own")).toEqual({ bytes: 450e6, max: 450 });
	});

	it("warns above the caution and strong thresholds, not at them", () => {
		const level = (p: "small" | "standard" | "dedicated", mb: number, t: "host" | "own", other?: number) => budgetWarning(at(p, mb), t, other);
		expect([level("small", 300, "host"), level("small", 301, "host"), level("small", 400, "own"), level("small", 401, "own")]).toEqual(["none", "caution", "caution", "strong"]);
		expect([level("standard", 6000, "host"), level("standard", 6001, "host"), level("standard", 8000, "host"), level("standard", 8001, "host")]).toEqual(["none", "caution", "caution", "strong"]);
		expect([level("standard", 9000, "own"), level("standard", 9001, "own"), level("dedicated", 9500, "own")]).toEqual(["none", "caution", "caution"]);
		// 0 is the profile default: standard is quiet, dedicated in the EmDash database is 9000 there.
		expect([level("standard", 0, "host"), level("dedicated", 0, "host"), level("dedicated", 0, "own")]).toEqual(["none", "strong", "none"]);
		// The rest of the EmDash database counts when known: strong at any value above 9500 together.
		expect([level("standard", 3000, "host", 6500), level("standard", 3000, "host", 6501), level("standard", 3000, "own", 9000)]).toEqual(["none", "strong", "none"]);
		// 95 percent of the profile's own database: 500 MB on small (475), 10 GB otherwise (9500).
		expect([level("small", 300, "host", 175), level("small", 300, "host", 176), level("small", 300, "host", 400), level("small", 300, "own", 400)]).toEqual(["none", "strong", "strong", "none"]);
		expect([level("dedicated", 0, "host", 500), level("dedicated", 0, "host", 501)]).toEqual(["strong", "strong"]);
		expect([level("standard", 6000, "host", 3500), level("standard", 6000, "host", 3501)]).toEqual(["none", "strong"]);
	});
});
