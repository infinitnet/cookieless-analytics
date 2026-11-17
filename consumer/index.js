// Queue consumer Worker for Cookieless Analytics: writes queued page views, events and engagement updates to
// the site's D1 database with the plugin's own statements. Install steps: README.md in this folder.
import { handleQueue } from "@infinitnet/cookieless-analytics/queue";

export default {
	async queue(batch, env) {
		// With the plugin option `database` or `databases`, pass the same option: handleQueue(batch, env, { database: { binding: "CA_DB" } }).
		await handleQueue(batch, env);
	},
};
