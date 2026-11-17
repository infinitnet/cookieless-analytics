/**
 * Entry of the queue consumer Worker (`consumer/` in the repository): applies queued page views, events and
 * engagement updates to the D1 database with the plugin's own statements, so the tables equal the direct path.
 */
import { drops } from "./core/drops.js";
import { consumeBatch, type QueuedMessage } from "./core/queue-sink.js";
import { fromD1 } from "./db/d1.js";
import { type DbFor, factsDb } from "./db/facts.js";
import { type DatabaseOption, type DatabasesOption, parseOptions } from "./multisite/config.js";

export { consumeBatch, ORPHAN_ATTEMPTS, QUEUE_BINDING, type QueuedMessage, queueBinding, visitorGroups } from "./core/queue-sink.js";
export { type D1Like, fromD1 } from "./db/d1.js";

/**
 * The consumer's `queue` handler. The analytics tables are in the D1 binding `DB`, or, with the same `database`
 * or `databases` option the site passes to the plugin, in those bindings: each message goes to its site's
 * database. A missing binding retries that site's messages; they are never written to another database.
 */
export async function handleQueue(batch: { readonly messages: readonly QueuedMessage[] }, env: object, options: { database?: DatabaseOption; databases?: DatabasesOption } = {}): Promise<void> {
	const { database, databases } = parseOptions(options);
	const bindings = env as Record<string, unknown>;
	// One resolver per env and isolate, so each own database's schema is checked once, not per batch.
	let dbFor = resolvers.get(env);
	if (!dbFor) resolvers.set(env, (dbFor = factsDb(databases ?? database, async () => fromD1(bindings.DB as Parameters<typeof fromD1>[0]), async () => bindings)));
	drops.route = dbFor.targets().length > 1 ? dbFor : undefined;
	const byDb = new Map<string, QueuedMessage[]>();
	for (const m of batch.messages) {
		const key = dbFor.binding((m.body as { site?: string } | null)?.site) ?? "";
		byDb.get(key)?.push(m) ?? byDb.set(key, [m]);
	}
	for (const messages of byDb.values()) await consumeBatch({ messages }, await dbFor((messages[0]?.body as { site?: string } | null)?.site));
}

/** shortcut: keyed by env alone, so one consumer Worker passes one option, as the README says. */
const resolvers = new WeakMap<object, DbFor>();
