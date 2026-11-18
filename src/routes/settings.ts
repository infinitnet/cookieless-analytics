/**
 * Admin routes `settings/get` and `settings/save` (`plugins:manage`) behind the Settings page: the plugin settings in
 * sections, checked by `normalizeSettings` with an error per field. Secrets never leave the server ("set" or not), and
 * the Search sign-in keys are read only here: they are changed on the Search page only, so a stale page cannot undo a
 * connection. A save writes only the keys it names.
 */
import { PluginRouteError, type SettingField } from "emdash";
import { z } from "zod";
import type { KvLike } from "../core/crypto.js";
import { workerEnv } from "../core/worker-env.js";
import { type DbFor, pluginFactsOrNull } from "../db/facts.js";
import { isHyperdrive } from "../db/pg.js";
import { parseLinkRules } from "../link-rules.js";
import { hostOtherMb } from "./privacy.js";
import { clearEstimateDay } from "../query/retention.js";
import { type BudgetTarget, budgetRange, budgetWarning, HOST_FORM_POINTER, normalizeSettings, type Settings, type SettingKey, settingsSchema } from "../settings.js";
import { SOURCES } from "../sources/sync.js";

export interface SettingsSection {
	id: string;
	label: string;
	/** Every key of the section, in page order. */
	keys: readonly SettingKey[];
	/** Keys shown under the closed "Advanced" disclosure. */
	advanced?: readonly SettingKey[];
	/** Shown, never edited, here. */
	readOnly?: true;
}

/** The sections of the Settings page; each schema key is in exactly one, in the schema's declaration order. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
	{ id: "general", label: "General", keys: ["siteTimezone", "siteOrigin", "defaultCurrency", "excludeEditors", "siteId"], advanced: ["siteId"] },
	{
		id: "script",
		label: "Page script",
		keys: ["injectScript", "scriptDelivery", "autoOutbound", "autoDownloads", "downloadExtensions", "autoForms", "ignorePathPrefixes", "linkRules", "siteSearchParams", "logErrorPages", "scriptPath", "collectPath", "sharePath", "namespace", "scriptForBots"],
		advanced: ["scriptPath", "collectPath", "sharePath", "namespace", "scriptForBots"],
	},
	{
		id: "privacy",
		label: "Privacy and exclusions",
		keys: ["signals", "ipTruncation", "captureLanguage", "captureRegion", "captureScreen", "excludePaths", "excludeIpPrefixes", "ignoreReferrerHosts", "queryAllowlist", "saltTimezone", "saltRotationHour"],
		advanced: ["saltTimezone", "saltRotationHour"],
	},
	{
		id: "sessions",
		label: "Sessions and engagement",
		keys: ["sessionWindowMinutes", "engagedThresholdSeconds", "longClickSeconds", "badExperienceSeconds", "realtimeWindowMinutes", "maxSessionMinutes", "reloadDedupeSeconds", "maxEngagedMsPerPage"],
		advanced: ["maxSessionMinutes", "reloadDedupeSeconds", "maxEngagedMsPerPage"],
	},
	{ id: "revenue", label: "Revenue", keys: ["acceptClientRevenue"] },
	{ id: "annotations", label: "Annotations", keys: ["autoAnnotations", "annotatePublish", "annotateUpdate", "annotateCollections", "autoAnnotationsPerDay"] },
	{
		id: "search",
		label: "Search",
		keys: ["searchBrandTerms", "searchMinImpressions", "searchOverlapMinShare", "backfillDays", "searchRetentionDays", "searchSyncHours", "syncSubrequestBudget", "searchMaxRowsPerDay"],
		advanced: ["searchSyncHours", "syncSubrequestBudget", "searchMaxRowsPerDay"],
	},
	{
		id: "connections",
		label: "Search connections",
		keys: ["gscAuth", "gscProperty", "gscClientId", "gscClientSecret", "gscRefreshToken", "gscServiceAccount", "bingEnabled", "bingAuth", "bingApiKey", "bingClientId", "bingClientSecret", "bingRefreshToken", "bingSiteUrl"],
		readOnly: true,
	},
	{ id: "data", label: "Data and capacity", keys: ["capacityProfile", "storageBudgetMb", "rawRetentionDays", "rollupRetentionMonths", "ingestTier"], advanced: ["ingestTier"] },
	{
		id: "limits",
		label: "Limits and API",
		keys: ["agentRateLimitPerMinute", "maxPageviewsPerSession", "maxEventsPerSession", "maxEventsPerSidPerMinute", "maxEventsPerVkeyPerMinute"],
		advanced: ["maxPageviewsPerSession", "maxEventsPerSession", "maxEventsPerSidPerMinute", "maxEventsPerVkeyPerMinute"],
	},
];

const READ_ONLY: ReadonlySet<string> = new Set(SETTINGS_SECTIONS.flatMap((s) => (s.readOnly ? s.keys : [])));
const FIELDS = settingsSchema as Record<SettingKey, SettingField>;

/** Stored in milliseconds, shown and edited in minutes. */
const SCALE: Partial<Record<SettingKey, { unit: string; by: number }>> = { maxEngagedMsPerPage: { unit: "minutes", by: 60_000 } };
/** Field shown only while this boolean is on. */
const WHEN: Partial<Record<SettingKey, SettingKey>> = {
	scriptDelivery: "injectScript",
	downloadExtensions: "autoDownloads",
	annotatePublish: "autoAnnotations",
	annotateUpdate: "autoAnnotations",
	annotateCollections: "autoAnnotations",
	autoAnnotationsPerDay: "autoAnnotations",
};
/** What a refused string needs, where "not valid" alone would not help. */
const NEEDS: Partial<Record<SettingKey, string>> = {
	siteId: "Use lowercase letters, digits and dashes, up to 32 characters.",
	siteTimezone: "Use an IANA timezone such as Europe/Berlin.",
	saltTimezone: "Use an IANA timezone such as Europe/Berlin.",
	siteOrigin: "Use an origin such as https://example.com, with no path.",
	scriptPath: "Use a neutral path such as /assets/app.js that differs from the event and share paths.",
	collectPath: "Use a neutral path that differs from the script and share paths.",
	sharePath: "Use a neutral path that differs from the script and event paths.",
	namespace: "Use a neutral name of letters and digits.",
};

/** One field as the Settings page draws it: the label without its unit, the first sentence as help, the rest behind the info mark. */
export interface FieldMeta {
	key: SettingKey;
	type: SettingField["type"];
	label: string;
	help: string;
	more?: string;
	unit?: string;
	default?: string | number | boolean;
	min?: number;
	max?: number;
	multiline?: boolean;
	options?: Array<{ value: string; label: string }>;
	advanced?: true;
	when?: SettingKey;
}

export function fieldMeta(key: SettingKey, advanced = false): FieldMeta {
	const f = FIELDS[key];
	const unitOf = /^(.*) \((minutes|seconds|days|hours|months|percent|ms|MB)\)$/.exec(f.label);
	const scale = SCALE[key];
	const desc = (f.description ?? "").replace(`${HOST_FORM_POINTER} `, "");
	const cut = desc.search(/\.\s/);
	const by = scale?.by ?? 1;
	return {
		key,
		type: f.type,
		label: unitOf?.[1] ?? f.label,
		help: cut < 0 ? desc : desc.slice(0, cut + 1),
		...(cut >= 0 ? { more: desc.slice(cut + 2) } : {}),
		...(scale || unitOf ? { unit: scale?.unit ?? unitOf?.[2] } : {}),
		...("default" in f && f.default !== undefined ? { default: typeof f.default === "number" ? f.default / by : f.default } : {}),
		...(f.type === "number" ? { min: (f.min ?? 0) / by, max: (f.max ?? 0) / by } : {}),
		...(f.type === "string" && f.multiline ? { multiline: true } : {}),
		...(f.type === "select" ? { options: f.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
		...(advanced ? { advanced: true as const } : {}),
		...(WHEN[key] ? { when: WHEN[key] } : {}),
	};
}

type Value = string | number | boolean;

/** How long `budgetTarget` waits for a database to open before it reads the engine from the binding instead. */
export const BUDGET_TARGET_MS = 1000;

/**
 * Where the storage budget is checked, as the storage estimate picks it per database (`budgetTargetOf`), the strictest
 * row winning: `postgres` when every database is Postgres (the EmDash database included), else `host` while any
 * site's analytics tables are in the EmDash database (its 10 GB hold the content too), else `own`. A database that
 * does not open within `ms` (an unreachable Postgres) counts by its configured binding: Hyperdrive is Postgres;
 * the EmDash database and anything else count as D1.
 */
export async function budgetTarget(facts: Pick<DbFor, "targets"> | null, env: () => Promise<Record<string, unknown> | null> = workerEnv, ms = BUDGET_TARGET_MS): Promise<BudgetTarget> {
	if (!facts) return "host";
	const targets = facts.targets();
	const configured = async (binding: string | null) => (binding !== null && isHyperdrive((await env().catch(() => null))?.[binding]) ? "postgres" : null);
	const dialects = await Promise.all(
		targets.map(async (t) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const late = new Promise<null>((resolve) => (timer = setTimeout(resolve, ms, null)));
			const opened = await Promise.race([Promise.resolve().then(() => t.db()).then((d) => d.dialect, () => null), late]).finally(() => clearTimeout(timer));
			return opened ?? configured(t.binding);
		}),
	);
	if (dialects.every((d) => d === "postgres")) return "postgres";
	return targets.some((t) => t.binding === null) ? "host" : "own";
}

/** Why a budget outside the row's range is refused. */
function budgetReason(s: Pick<Settings, "capacityProfile">, target: BudgetTarget): string {
	if (target === "postgres") return "Postgres has no fixed size; the budget keeps a hosted plan from filling up.";
	if (s.capacityProfile === "small") return target === "host" ? "a database on the Workers Free plan holds 500 MB including the site's content." : "a database on the Workers Free plan holds 500 MB.";
	return target === "host" ? "the EmDash database holds 10 GB including the site's content." : "a D1 database holds 10 GB, and Search data, aliases and space freed by deletes are not part of the estimate.";
}

/**
 * Check the named values against the stored ones (`current`, raw) with `normalizeSettings`: a value it would clamp,
 * drop or replace is refused with a sentence for its field. `clean` holds the values to store (numbers in the stored
 * unit). A storage budget other than 0 must be in the range of the profile in `target` (`budgetRange`). Never throws.
 */
export function validateSettings(values: Record<string, unknown>, current: Record<string, unknown>, target: BudgetTarget = "host"): { clean: Partial<Record<SettingKey, Value>>; errors: Record<string, string> } {
	const clean: Partial<Record<SettingKey, Value>> = {};
	const errors: Record<string, string> = {};
	for (const [key, v] of Object.entries(values)) {
		if (!Object.hasOwn(FIELDS, key)) {
			errors[key] = "Unknown setting.";
			continue;
		}
		const k = key as SettingKey;
		const f = FIELDS[k];
		if (READ_ONLY.has(k)) {
			errors[k] = "Search sign-in is changed on the Search page.";
			continue;
		}
		if (f.type === "number") {
			const by = SCALE[k]?.by ?? 1;
			const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
			const min = (f.min ?? 0) / by;
			const max = (f.max ?? 0) / by;
			if (!Number.isInteger(n) || n < min || n > max) errors[k] = `Use a whole number from ${min} to ${max}.`;
			else clean[k] = n * by;
		} else if (f.type === "boolean") {
			if (typeof v === "boolean") clean[k] = v;
			else errors[k] = "Choose on or off.";
		} else if (f.type === "select") {
			if (typeof v === "string" && f.options.some((o) => o.value === v)) clean[k] = v;
			else errors[k] = "Choose one of the listed options.";
		} else if (typeof v !== "string") {
			errors[k] = "Enter text.";
		} else if (k === "linkRules") {
			// One message naming the first bad line; checked against the short link prefixes this save leaves in place.
			const r = parseLinkRules(v, normalizeSettings({ ...current, ...values }).ignorePathPrefixes);
			if (r.error) errors[k] = r.error;
			else clean[k] = v.trim();
		} else {
			const s = v.trim();
			const out = normalizeSettings({ ...current, ...clean, [k]: s })[k as keyof Settings];
			if (Array.isArray(out)) {
				const kept = new Set(out.map((x) => String(x).toLowerCase()));
				const items = (k === "searchBrandTerms" ? s.split(/\r?\n/) : s.split(/[\s,]+/)).map((x) => x.trim()).filter(Boolean);
				const bad = [...new Set(items.filter((x) => !kept.has(x.toLowerCase())))];
				// Invalid items, duplicates aside, and items over the list's cap are named instead of dropped without a word.
				if (bad.length) errors[k] = `Not valid or over the limit: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? ` and ${bad.length - 5} more` : ""}.`;
				else clean[k] = s;
			} else if (out === s || (f.type === "url" && s !== "" && out !== "")) {
				// A url is stored in its normalized form (`https://example.com/` keeps no trailing slash as an origin).
				clean[k] = String(out);
			} else {
				errors[k] = NEEDS[k] ?? "This value is not valid.";
			}
		}
	}
	const merged = normalizeSettings({ ...current, ...clean });
	if ("badExperienceSeconds" in clean || "longClickSeconds" in clean) {
		if (merged.badExperienceSeconds > merged.longClickSeconds && !errors.badExperienceSeconds)
			errors.badExperienceSeconds = `Not above the long click time (${merged.longClickSeconds} seconds).`;
	}
	if (typeof clean.storageBudgetMb === "number" && clean.storageBudgetMb !== 0) {
		const r = budgetRange(merged.capacityProfile, target);
		if (clean.storageBudgetMb < r.min || clean.storageBudgetMb > r.max) errors.storageBudgetMb = `Use 0 for the default, or ${r.min} to ${r.max} here: ${budgetReason(merged, target)}`;
	}
	return { clean, errors };
}

/** The part of the host `SettingsAccess` these routes use. */
export interface SettingsStore {
	get(key: string): Promise<unknown>;
	set(key: string, value: unknown): Promise<void>;
	list(): Promise<Array<{ key: string; value: unknown }>>;
}

export interface SettingsCtx {
	input: unknown;
	settings?: SettingsStore;
	kv?: Pick<KvLike, "get" | "set">;
}

const store = (ctx: SettingsCtx) => {
	if (!ctx.settings) throw new PluginRouteError("settings_unavailable", "Plugin settings are not available.", 500);
	return ctx.settings;
};

/** Stored raw values of the schema keys. A secret that cannot be decrypted counts as set: it is stored. */
async function readRaw(s: SettingsStore): Promise<Record<string, unknown>> {
	try {
		return Object.fromEntries((await s.list()).filter((e) => Object.hasOwn(FIELDS, e.key)).map((e) => [e.key, e.value]));
	} catch {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(FIELDS)) out[key] = await s.get(key).catch(() => (FIELDS[key as SettingKey].type === "secret" ? "unreadable" : null));
		return out;
	}
}

/** A value as the page edits it: the stored value, else the default; numbers in the shown unit. */
function shown(key: SettingKey, raw: unknown): Value {
	const f = FIELDS[key];
	const v = raw ?? ("default" in f ? f.default : undefined) ?? "";
	if (f.type === "number") return Number(v) / (SCALE[key]?.by ?? 1);
	if (Array.isArray(v)) return v.join("\n");
	return typeof v === "boolean" || typeof v === "number" ? v : String(v);
}

export const SettingsSaveBody = z
	.object({ values: z.record(z.string().max(64), z.union([z.string().max(20_000), z.number(), z.boolean()])).refine((v) => Object.keys(v).length <= 100, "Too many values.") })
	.strict();
const EmptyBody = z.object({}).strict().optional();

export function settingsRoutes(env: { settings(): Promise<Settings>; settingsChanged?(): void; facts?(): Pick<DbFor, "targets"> | null; workerEnv?(): Promise<Record<string, unknown> | null> }) {
	const facts = () => (env.facts ?? pluginFactsOrNull)();
	return {
		"settings/get": {
			permission: "plugins:manage" as const,
			input: EmptyBody,
			async handler(ctx: SettingsCtx) {
				const raw = await readRaw(store(ctx));
				const s = await env.settings();
				const target = await budgetTarget(facts(), env.workerEnv);
				// The rest of the EmDash database, so the page can warn when budget plus content passes 9.5 GB.
				const otherMb = target === "host" && ctx.kv ? await hostOtherMb(ctx.kv, env.workerEnv) : null;
				const values: Record<string, Value> = {};
				const secrets: Record<string, boolean> = {};
				for (const key of Object.keys(FIELDS) as SettingKey[]) {
					if (FIELDS[key].type === "secret") secrets[key] = typeof raw[key] === "string" ? raw[key] !== "" : raw[key] != null;
					else values[key] = shown(key, raw[key]);
				}
				return {
					sections: SETTINGS_SECTIONS.map((sec) => ({ id: sec.id, label: sec.label, ...(sec.readOnly ? { readOnly: true } : {}), fields: sec.keys.map((k) => fieldMeta(k, !!sec.advanced?.includes(k))) })),
					values,
					secrets,
					/** Where the budget is checked, the rest of the EmDash database in MB when known, and the warning level of the stored value (`budgetWarning`; the page recomputes it as the value changes). */
					budget: { target, otherMb, level: budgetWarning(s, target, otherMb ?? undefined) },
					search: { google: SOURCES.google.configured(s) && !!s.gscProperty, bing: SOURCES.bing.configured(s) && !!s.bingSiteUrl },
				};
			},
		},
		"settings/save": {
			permission: "plugins:manage" as const,
			input: SettingsSaveBody,
			async handler(ctx: SettingsCtx) {
				const body = SettingsSaveBody.parse(ctx.input);
				const st = store(ctx);
				const raw = await readRaw(st);
				const f = facts();
				const { clean, errors } = validateSettings(body.values, raw, await budgetTarget(f, env.workerEnv));
				// Nothing is written while any named value is refused, so a section saves whole or not at all.
				if (Object.keys(errors).length) return { saved: false, errors };
				try {
					for (const [key, value] of Object.entries(clean)) await st.set(key, value);
				} finally {
					env.settingsChanged?.();
				}
				// A changed budget applies at the next retention tick: every database's cycle starts over with a fresh
				// estimate. A failed clear only delays that to the next day.
				if (ctx.kv && ("storageBudgetMb" in clean || "capacityProfile" in clean)) {
					const kv = ctx.kv;
					const kvs = f ? f.targets().map((t) => t.kv(kv)) : [kv];
					await Promise.all(kvs.map((k) => clearEstimateDay(k).catch(() => {})));
				}
				return { saved: true, values: Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, shown(k as SettingKey, v)])) };
			},
		},
	};
}
