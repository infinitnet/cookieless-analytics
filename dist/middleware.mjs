import { PLUGIN_ID } from "./contract.mjs";
import { c as storedAgentRules, m as recordServerHit, n as handleRequest, t as MW_SEEN_KEY } from "./middleware-core-q85kV3_A.mjs";
import { Br as pluginFacts, Ir as ensureHostSchema, Xr as pgOwnScope, bi as likeEscape, ci as fromKysely, fr as cachedSettings, o as routedSink, v as linkedHostsOf } from "./queue-sink-CsXeLpUE.mjs";
import { after, getPluginSettings } from "emdash";
import { getDb } from "emdash/runtime";
// src/db/options-kv.ts
/**
* `ctx.kv` replacement for code without a plugin context (the middleware). Reads and writes the
* host `options` table with the same `plugin:<id>:<key>` names and JSON values the host KV uses
* (`plugins/context.ts`, `database/repositories/options.ts`), so both views see the same keys.
*/
function optionsKv(db, pluginId) {
	const prefix = `plugin:${pluginId}:`;
	const decode = (v) => typeof v === "string" ? JSON.parse(v) : null;
	return {
		async get(key) {
			const rows = await db.all("SELECT value FROM options WHERE name = ?", [prefix + key]);
			return rows[0] ? decode(rows[0].value) : null;
		},
		async set(key, value) {
			await db.run("INSERT INTO options (name, value, revision) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value, revision = excluded.revision", [
				prefix + key,
				JSON.stringify(value),
				crypto.randomUUID()
			]);
		},
		async delete(key) {
			return (await db.run("DELETE FROM options WHERE name = ?", [prefix + key])).changes > 0;
		},
		async list(p = "") {
			return (await db.all("SELECT name, value FROM options WHERE name LIKE ? ESCAPE '\\'", [`${likeEscape(prefix + p)}%`])).map((r) => ({
				key: r.name.slice(prefix.length),
				value: decode(r.value)
			}));
		},
		async compareAndSet(key, expected, value) {
			const v = JSON.stringify(value);
			const rev = crypto.randomUUID();
			return { applied: (expected === null ? await db.run("INSERT INTO options (name, value, revision) VALUES (?, ?, ?) ON CONFLICT (name) DO NOTHING", [
				prefix + key,
				v,
				rev
			]) : await db.run("UPDATE options SET value = ?, revision = ? WHERE name = ? AND revision = ?", [
				v,
				rev,
				prefix + key,
				expected
			])).changes > 0 };
		}
	};
}
// src/middleware.ts
const settings = cachedSettings(() => getPluginSettings(PLUGIN_ID));
/** The site's analytics tables (`createPlugin`'s resolver) and the plugin's KV on the host database. */
async function store(site) {
	const facts = pluginFacts();
	return {
		facts,
		db: await facts(site),
		kv: optionsKv(fromKysely(await getDb()), PLUGIN_ID)
	};
}
const onRequest = (context, next) => handleRequest(context, next, {
	settings,
	after: (fn) => after(async () => {
		await pgOwnScope(fn);
	}),
	async recordServerHit(info) {
		const s = await settings();
		const { facts, db, kv } = await store(s.siteId);
		await recordServerHit({
			db,
			kv,
			settings: s,
			sink: routedSink(facts, s, kv),
			ready: () => ensureHostSchema(facts, kv)
		}, info);
	},
	linkedHosts: async () => linkedHostsOf(optionsKv(fromKysely(await getDb()), PLUGIN_ID)),
	agentRules: async () => storedAgentRules(optionsKv(fromKysely(await getDb()), PLUGIN_ID)),
	markSeen: () => after(async () => {
		await optionsKv(fromKysely(await getDb()), PLUGIN_ID).set(MW_SEEN_KEY, Date.now());
	})
});
export { onRequest };
