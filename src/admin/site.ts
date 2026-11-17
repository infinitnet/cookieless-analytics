/** Sites the admin can switch between, from `sites/list`; a static local entry when the route cannot answer. */
import { useEffect, useState } from "react";
import type { SiteEntry } from "../routes/sites.js";
import { listSites } from "./api.js";

/** Local fallback: empty id means "local" (the route leaves `site` out), browser timezone for presets. */
export const LOCAL_FALLBACK: SiteEntry = { id: "", label: "This site", local: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };

export interface SitesState {
	/** Null while loading. */
	sites: SiteEntry[] | null;
	local: SiteEntry;
}

export async function loadSites(): Promise<SiteEntry[]> {
	try {
		const { sites } = await listSites();
		return sites.some((s) => s.local) ? sites : [LOCAL_FALLBACK, ...sites];
	} catch {
		return [LOCAL_FALLBACK];
	}
}

export function useSite(): SitesState {
	const [sites, setSites] = useState<SiteEntry[] | null>(null);
	useEffect(() => {
		let live = true;
		void loadSites().then((s) => live && setSites(s));
		return () => {
			live = false;
		};
	}, []);
	return { sites, local: sites?.find((s) => s.local) ?? LOCAL_FALLBACK };
}

/** The selected site: the URL `site` when it is listed, else the local site. */
export function selectedSite(sites: readonly SiteEntry[], id: string | undefined, local: SiteEntry): SiteEntry {
	return sites.find((s) => s.id === id) ?? local;
}

/** URL `site=all`: the All-sites table on the Overview; every other page shows the local site with a banner. */
export const ALL_SITES = "all";
