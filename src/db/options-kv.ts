import type { KvLike } from "../core/crypto.js";
import { likeEscape } from "./dialect.js";
import type { Db } from "./adapter.js";

/**
 * `ctx.kv` replacement for code without a plugin context (the middleware). Reads and writes the
 * host `options` table with the same `plugin:<id>:<key>` names and JSON values the host KV uses
 * (`plugins/context.ts`, `database/repositories/options.ts`), so both views see the same keys.
 */
export function optionsKv(db: Db, pluginId: string): KvLike {
	const prefix = `plugin:${pluginId}:`;
	const decode = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : null);
	return {
		async get<T>(key: string) {
			const rows = await db.all<{ value: string }>("SELECT value FROM options WHERE name = ?", [prefix + key]);
			return rows[0] ? (decode(rows[0].value) as T) : null;
		},
		async set(key, value) {
			await db.run("INSERT INTO options (name, value, revision) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value, revision = excluded.revision", [
				prefix + key,
				JSON.stringify(value),
				crypto.randomUUID(),
			]);
		},
		async delete(key) {
			return (await db.run("DELETE FROM options WHERE name = ?", [prefix + key])).changes > 0;
		},
		async list(p = "") {
			const rows = await db.all<{ name: string; value: string }>("SELECT name, value FROM options WHERE name LIKE ? ESCAPE '\\'", [`${likeEscape(prefix + p)}%`]);
			return rows.map((r) => ({ key: r.name.slice(prefix.length), value: decode(r.value) }));
		},
		async compareAndSet(key, expected, value) {
			const v = JSON.stringify(value);
			const rev = crypto.randomUUID();
			const r =
				expected === null
					? await db.run("INSERT INTO options (name, value, revision) VALUES (?, ?, ?) ON CONFLICT (name) DO NOTHING", [prefix + key, v, rev])
					: await db.run("UPDATE options SET value = ?, revision = ? WHERE name = ? AND revision = ?", [v, rev, prefix + key, expected]);
			return { applied: r.changes > 0 };
		},
	};
}
