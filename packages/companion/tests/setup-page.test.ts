import { afterEach, describe, expect, it } from "vitest";

import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

let host: PluginRuntimeTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

describe("setup page", () => {
	it("loads /setup through the sandbox host", async () => {
		host = await createPluginRuntimeTestHost();
		const page = await host.admin.loadPage("/setup");
		expect(page.blocks[0]).toMatchObject({ type: "header", text: "Analytics setup" });
	});
});
