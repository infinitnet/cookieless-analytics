import { describe, expect, it } from "vitest";
import { optionsKv } from "../src/db/options-kv.js";
import { memoryDb } from "./helpers.js";

describe("optionsKv", () => {
	it("reads and writes the host options table under the plugin prefix", async () => {
		const { db, raw } = memoryDb();
		// Shape of the host `options` table (name primary key, JSON text value, revision).
		raw.exec("CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT)");
		const kv = optionsKv(db, "cookieless-analytics");
		expect(await kv.get("mw:seen")).toBeNull();
		await kv.set("mw:seen", 123);
		await kv.set("mw:seen", 456);
		expect(await kv.get("mw:seen")).toBe(456);
		expect(raw.prepare("SELECT name, value FROM options").all()).toEqual([{ name: "plugin:cookieless-analytics:mw:seen", value: "456" }]);

		expect(await kv.compareAndSet("salt:2026-06-10", null, "a")).toEqual({ applied: true });
		expect(await kv.compareAndSet("salt:2026-06-10", null, "b")).toEqual({ applied: false });
		const rev = (raw.prepare("SELECT revision FROM options WHERE name LIKE '%salt%'").get() as { revision: string }).revision;
		expect(await kv.compareAndSet("salt:2026-06-10", "wrong", "c")).toEqual({ applied: false });
		expect(await kv.compareAndSet("salt:2026-06-10", rev, "d")).toEqual({ applied: true });
		expect(await kv.get("salt:2026-06-10")).toBe("d");

		await kv.set("salt_x", 1); // `_` must not act as a LIKE wildcard
		expect((await kv.list("salt:")).map((e) => e.key)).toEqual(["salt:2026-06-10"]);
		expect(await kv.delete("salt:2026-06-10")).toBe(true);
		expect(await kv.delete("salt:2026-06-10")).toBe(false);
	});
});
