/**
 * Per-site settings: the local site reads the plugin settings; a client site reads its
 * registry record when the field is present, else the master's value. The client record comes from
 * the registry's 60 s snapshot (`registry()` or `bindSite()`), so no extra read happens here.
 */
import type { ClientSite } from "../multisite/registry.js";
import { isCurrency } from "./currency.js";
import type { Settings } from "../settings.js";

export type SiteSettingKey = "defaultCurrency" | "acceptClientRevenue" | "siteSearchParams";

export function siteSetting<K extends SiteSettingKey>(settings: Pick<Settings, K>, client: Partial<Pick<ClientSite, K>> | null | undefined, key: K): Settings[K] {
	const own = client?.[key];
	// A code dropped from a later currency list falls back to the master's setting.
	const valid = key === "defaultCurrency" ? isCurrency(own) : key === "siteSearchParams" ? Array.isArray(own) : typeof own === "boolean";
	return (valid ? own : settings[key]) as Settings[K];
}
