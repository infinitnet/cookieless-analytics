/**
 * Handoff to the registry companion (docs/integration.md, "The registry companion"). Each Overview mount reads the
 * plugin list; an installed and enabled companion gets the hello once per browser session, and a dismissible notice
 * says it can be removed. Every failure is silent: no permission, no companion, no network.
 */
import { Button } from "@cloudflare/kumo";
import { apiFetch } from "emdash/plugin-utils";
import { useEffect, useState } from "react";
import { COMPANION_NAME, COMPANION_PUBLISHER_DID, COMPANION_SLUG, CONTRACT_VERSION, type CompanionHello, PLUGIN_ID, VERSION } from "../contract.js";
import { Notice } from "./components/ui.js";
import { isBool, readPref, usePref, writePref } from "./prefs.js";

/** The fields of one `GET /_emdash/api/admin/plugins` item this file reads. */
export interface PluginListItem {
	id: string;
	enabled: boolean;
	source?: string;
	registryPublisherDid?: string;
	registrySlug?: string;
}

export const PLUGINS_HREF = "/_emdash/admin/plugins";
export const COMPANION_TEXT = `${COMPANION_NAME} is still installed. Setup is complete, so you can remove it under Plugins.`;
/** Session pref: true once the companion accepted the hello in this browser session. */
const SENT_KEY = "companion.hello.v1";
/** Local pref: the user hid the notice in this browser. */
const HIDE_KEY = "companion.hide.v1";

/** The enabled companion: a registry install of our publisher, or a config-managed install under its slug. */
export function findCompanion(items: readonly PluginListItem[]): PluginListItem | undefined {
	return items.find(
		(p) => p.enabled === true && ((p.registrySlug === COMPANION_SLUG && p.registryPublisherDid === COMPANION_PUBLISHER_DID) || (p.id === COMPANION_SLUG && p.source === "config")),
	);
}

async function check(): Promise<boolean> {
	try {
		const res = await apiFetch("/_emdash/api/admin/plugins");
		if (!res.ok) return false;
		const items = ((await res.json()) as { data?: { items?: unknown } }).data?.items;
		const item = Array.isArray(items) ? findCompanion(items as PluginListItem[]) : undefined;
		if (!item) return false;
		if (!readPref("session", SENT_KEY, isBool)) {
			const hello: CompanionHello = { v: 1, product: PLUGIN_ID, pluginVersion: VERSION, contractVersion: CONTRACT_VERSION };
			const sent = await apiFetch(`/_emdash/api/plugins/${encodeURIComponent(item.id)}/hello`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(hello),
			}).then(
				(r) => r.ok,
				() => false,
			);
			// A failed hello is tried again on the next Overview load.
			if (sent) writePref("session", SENT_KEY, true);
		}
		return true;
	} catch {
		return false;
	}
}

// Mounts at the same moment share one check; a later mount checks again, so the notice goes once the companion is removed.
let pending: Promise<boolean> | undefined;

/** Whether an enabled companion is installed; the first successful check of the session also sends the hello. */
export function companionPresent(): Promise<boolean> {
	pending ??= check().finally(() => {
		pending = undefined;
	});
	return pending;
}

const TARGET = { minHeight: 44, display: "inline-flex", alignItems: "center" } as const;

/** The notice on the Overview while the companion is installed and enabled; Hide keeps it hidden in this browser. */
export function CompanionNotice() {
	const [hidden, setHidden] = usePref("local", HIDE_KEY, isBool, false);
	const [present, setPresent] = useState(false);
	useEffect(() => {
		let live = true;
		void companionPresent().then((p) => live && setPresent(p));
		return () => {
			live = false;
		};
	}, []);
	if (!present || hidden) return null;
	return (
		<Notice
			tone="info"
			action={
				<>
					<a href={PLUGINS_HREF} style={TARGET}>
						Open Plugins
					</a>
					<Button variant="secondary" style={TARGET} onClick={() => setHidden(true)}>
						Hide
					</Button>
				</>
			}
		>
			{COMPANION_TEXT}
		</Notice>
	);
}
