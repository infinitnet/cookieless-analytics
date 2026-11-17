/** The vanished-keys delete of a closed day split into key ranges when its list would pass the parameter size. */
import { describe, expect, it } from "vitest";
import { VANISHED_LIST_BYTES, vanishedStmts } from "../src/query/rollup.js";
import { rng } from "./capacity.helpers.js";
import { schemaDb } from "./helpers.js";

const DAY = "2026-06-10";
const WORDS = ["a", "z", "é", "ß", "日本", "😀", "Z", "_", "-", "0"];

describe("vanished keys", () => {
	it("split into byte-ordered key ranges, deletes exactly what one statement deletes", async () => {
		const env = await schemaDb();
		const r = rng(3);
		const keys = Array.from({ length: 600 }, (_, i) => `/${WORDS[Math.floor(r() * WORDS.length)]}/${"p".repeat(Math.floor(r() * 40))}${i}`);
		const ins = env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, pageviews) VALUES ('default', ?, 'page', ?, 1)");
		for (const k of keys) ins.run(DAY, k);
		// Another day and another dim stay untouched.
		ins.run("2026-06-09", keys[0]);
		env.raw.prepare("INSERT INTO ca_rollup (site, day, dim, key, pageviews) VALUES ('default', ?, 'channel', 'Direct', 1)").run(DAY);
		const kept = keys.filter(() => r() < 0.5);
		const stmts = vanishedStmts(env.db.dialect, "ca_rollup", ["page"], "dim || '|' || key", undefined, "default", DAY, kept.map((k) => `page|${k}`), 2_000);
		expect(stmts.length).toBeGreaterThan(5);
		for (const s of stmts) expect(new TextEncoder().encode(String(s.params?.[2])).length).toBeLessThanOrEqual(2_000);
		await env.db.batch(stmts);
		const left = (env.raw.prepare("SELECT key FROM ca_rollup WHERE day = ? AND dim = 'page'").all(DAY) as { key: string }[]).map((x) => x.key).sort();
		expect(left).toEqual([...kept].sort());
		expect(env.raw.prepare("SELECT COUNT(*) AS n FROM ca_rollup WHERE day = '2026-06-09' OR dim = 'channel'").get()).toEqual({ n: 2 });
		// Under the limit: one statement, as before.
		expect(vanishedStmts(env.db.dialect, "ca_rollup", ["page"], "dim || '|' || key", undefined, "default", DAY, ["page|/a"])).toHaveLength(1);
		expect(VANISHED_LIST_BYTES).toBeLessThan(2_000_000);
	});

	it("Postgres compares the key ranges in byte order", () => {
		const [, second] = vanishedStmts("postgres", "ca_rollup", ["page"], "dim || '|' || key", undefined, "s", DAY, ["page|a", "page|b"], 12);
		expect(second?.sql).toContain(`(dim || '|' || key) COLLATE "C" >= ?`);
	});
});
