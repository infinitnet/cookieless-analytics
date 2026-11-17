/** Date presets of the admin header and of dashboards, shared by the admin and the server. */
import { addDays, dayInZone, samePeriodLastYear } from "./time.js";

export const PRESETS = [
	["today", "Today"],
	["yesterday", "Yesterday"],
	["7d", "Last 7 days"],
	["30d", "Last 30 days"],
	["90d", "Last 90 days"],
	["12m", "Last 12 months"],
	["mtd", "Month to date"],
	["ytd", "Year to date"],
] as const;
export type Preset = (typeof PRESETS)[number][0];
export const DEFAULT_PRESET: Preset = "30d";

/** The `from` and `to` days of a preset, in the site timezone, both inclusive and ending today. */
export function presetRange(p: Preset, tz: string, nowSec: number = Date.now() / 1000): { from: string; to: string } {
	const today = dayInZone(Math.floor(nowSec), tz);
	switch (p) {
		case "today":
			return { from: today, to: today };
		case "yesterday": {
			const y = addDays(today, -1);
			return { from: y, to: y };
		}
		case "7d":
			return { from: addDays(today, -6), to: today };
		case "30d":
			return { from: addDays(today, -29), to: today };
		case "90d":
			return { from: addDays(today, -89), to: today };
		case "12m":
			return { from: addDays(samePeriodLastYear({ from: today, to: today }).from, 1), to: today };
		case "mtd":
			return { from: `${today.slice(0, 8)}01`, to: today };
		case "ytd":
			return { from: `${today.slice(0, 5)}01-01`, to: today };
	}
}

