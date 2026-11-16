/** Astro middleware entry, registered by `./integration` with `order: "pre"` after `emdash()`. */
import type { MiddlewareHandler } from "astro";
import { after, getPluginSettings } from "emdash";
import { getDb } from "emdash/runtime";
import { PLUGIN_ID } from "./contract.js";
import { storedAgentRules } from "./agents/stored.js";
import { recordServerHit } from "./core/recorder.js";
import { fromKysely } from "./db/adapter.js";
import { routedSink } from "./core/queue-sink.js";
import { ensureHostSchema, pluginFacts } from "./db/facts.js";
import { optionsKv } from "./db/options-kv.js";
import { linkedHostsOf } from "./multisite/registry.js";
import { handleRequest, type MwContext, MW_SEEN_KEY } from "./middleware-core.js";
import { cachedSettings } from "./settings.js";

const settings = cachedSettings(() => getPluginSettings(PLUGIN_ID));

/** The site's analytics tables (`createPlugin`'s resolver) and the plugin's KV on the host database. */
async function store(site: string) {
	const facts = pluginFacts();
	return { facts, db: await facts(site), kv: optionsKv(fromKysely(await getDb()), PLUGIN_ID) };
}

export const onRequest: MiddlewareHandler = (context, next) =>
	handleRequest(context as unknown as MwContext, next, {
		settings,
		after: (fn) =>
			after(async () => {
				await fn();
			}),
		async recordServerHit(info) {
			const s = await settings();
			const { facts, db, kv } = await store(s.siteId);
			// The site's database behind its own write guard; only the host database needs the lazy migration.
			await recordServerHit({ db, kv, settings: s, sink: routedSink(facts, s, kv), ready: () => ensureHostSchema(facts, kv) }, info);
		},
		linkedHosts: async () => linkedHostsOf(optionsKv(fromKysely(await getDb()), PLUGIN_ID)),
		agentRules: async () => storedAgentRules(optionsKv(fromKysely(await getDb()), PLUGIN_ID)),
		markSeen: () =>
			after(async () => {
				await optionsKv(fromKysely(await getDb()), PLUGIN_ID).set(MW_SEEN_KEY, Date.now());
			}),
	});
