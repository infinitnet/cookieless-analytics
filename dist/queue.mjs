import { Lr as factsDb, a as queueBinding, n as QUEUE_BINDING, r as consumeBatch, s as visitorGroups, t as ORPHAN_ATTEMPTS, ui as fromD1, w as drops } from "./queue-sink-CsXeLpUE.mjs";
import { i as parseOptions } from "./config-C42AfJsx.mjs";
// src/queue.ts
/**
* Entry of the queue consumer Worker (`consumer/` in the repository): applies queued page views, events and
* engagement updates to the D1 database with the plugin's own statements, so the tables equal the direct path.
*/
/**
* The consumer's `queue` handler. The analytics tables are in the D1 binding `DB`, or, with the same `database`
* or `databases` option the site passes to the plugin, in those bindings: each message goes to its site's
* database. A missing binding retries that site's messages; they are never written to another database.
*/
async function handleQueue(batch, env, options = {}) {
	const { database, databases } = parseOptions(options);
	const bindings = env;
	let dbFor = resolvers.get(env);
	if (!dbFor) resolvers.set(env, dbFor = factsDb(databases ?? database, async () => fromD1(bindings.DB), async () => bindings));
	drops.route = dbFor.targets().length > 1 ? dbFor : void 0;
	const byDb = /* @__PURE__ */ new Map();
	for (const m of batch.messages) {
		const key = dbFor.binding(m.body?.site) ?? "";
		byDb.get(key)?.push(m) ?? byDb.set(key, [m]);
	}
	for (const messages of byDb.values()) await consumeBatch({ messages }, await dbFor((messages[0]?.body)?.site));
}
/** shortcut: keyed by env alone, so one consumer Worker passes one option, as the README says. */
const resolvers = /* @__PURE__ */ new WeakMap();
export { ORPHAN_ATTEMPTS, QUEUE_BINDING, consumeBatch, fromD1, handleQueue, queueBinding, visitorGroups };
