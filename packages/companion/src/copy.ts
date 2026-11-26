/**
 * Every user visible string of the companion. Other files hold ids, keys and numbers only
 * (tests/pure.test.ts fails on prose anywhere else).
 */
import { PACKAGE_NAME } from "./full.js";

export const PAGE_TITLE = "Analytics setup";

export const NOTICE = {
	not_installed: {
		title: "The full plugin is not installed yet",
		text: "This companion does not count visits. A plugin from the registry cannot add the page script that counting needs. The steps below install Cookieless Analytics by Infinitnet, the full plugin, from npm. It needs one change to your site config and one deploy.",
	},
	waiting: {
		title: "Waiting for the full plugin",
		text: "Open the Analytics Overview once. The full plugin, version 1.1.0 or later, then confirms itself here. If the Analytics folder is in your sidebar and this notice stays, select Mark as installed.",
	},
	connected: {
		title: "The full plugin is installed",
		textHello: (pluginVersion: string, date: string) =>
			`Cookieless Analytics ${pluginVersion} confirmed itself on ${date}. Setup is complete. You can remove this companion under Plugins. It holds only your setup answers, so nothing needs to be moved.`,
		textManual: (date: string) =>
			`You marked the full plugin as installed on ${date}. Setup is complete. You can remove this companion under Plugins. It holds only your setup answers, so nothing needs to be moved.`,
	},
	version_mismatch: {
		title: "This companion is out of date",
		text: (contractVersion: number) =>
			`The full plugin reports contract version ${contractVersion}. This companion knows version 1. Update the companion under Plugins, or remove it. The full plugin works without it.`,
	},
	stale: {
		title: (date: string) => `The full plugin was last seen on ${date}`,
		text: "If you removed it, the steps below install it again. If it still runs, open the Analytics Overview once and this notice updates.",
	},
} as const;

export const LABEL = {
	openOverview: "Open the Analytics Overview",
	deployed: "I have deployed it",
	markInstalled: "Mark as installed",
	backToSteps: "Back to the steps",
	startOver: "Start over",
	stepDone: "Done",
	saveAnswers: "Save answers",
} as const;

export const ERROR = {
	unknownAction: "That action was not recognized. Reload the page.",
	readFailed: "Your progress could not be read. The steps still work.",
	saveFailed: "Your progress could not be saved.",
} as const;

/** Log lines: no user data, one per failure. */
export const LOG = {
	helloStorage: "hello: storage failed",
	read: "admin: read failed",
	write: "admin: write failed",
} as const;

export const TOAST = {
	answersSaved: "Your answers are saved.",
} as const;

export const BENEFITS = {
	title: "What you get with the full plugin",
	lines: [
		"Visits and sessions counted without cookies.",
		"Google Search Console and Bing data next to your traffic.",
		"Search Satisfaction for visits that arrive from a search engine.",
		"Annotations with their measured impact on traffic.",
		"An agent API with scoped keys for scripts and AI agents.",
		"A page script of about 3 KB gzipped.",
	],
} as const;

export const QUESTIONS = {
	title: "Your site",
	platform: {
		label: "Where does the site run?",
		options: { cloudflare: "Cloudflare Workers", node: "Node" },
	},
	packageManager: {
		label: "Package manager",
		options: { npm: "npm", pnpm: "pnpm", yarn: "yarn" },
	},
	database: {
		label: "Where should the analytics tables live?",
		options: {
			emdash: "In the EmDash database",
			own: "In a D1 database of your own",
			postgres: "In Postgres through Hyperdrive",
		},
	},
	pageViews: { label: "Expected page views per month" },
} as const;

export const ESTIMATE = {
	title: "Capacity estimate",
	pageViewsPerDay: "Page views per day",
	rowsPerDay: "Rows written per day",
	profile: "Capacity profile",
	profiles: { standard: "Standard", dedicated: "Dedicated" },
	basis: "A month is counted as 30 days. About 3.3 rows are written per page view with a typical mix.",
	advice: {
		fits: "25 months of detailed visits fit the default storage budget of this profile.",
		own_database:
			"25 months of detailed visits at this traffic do not fit the EmDash database. The default storage budget there holds about 17,500 page views a day. Consider a D1 database of your own with the Dedicated profile.",
		shorter_detail:
			"25 months of detailed visits at this traffic do not fit the default storage budget. The detailed window then shortens and older days are kept as daily summaries.",
		raise_budget:
			"25 months of detailed visits at this traffic do not fit the default storage budget. On Postgres there is no 10 GB cap: raise the storage budget in Settings.",
	},
	empty: "Enter your expected page views per month to see the estimate.",
} as const;

export const STEPS = {
	title: "Steps",
	install: {
		title: "Install the package",
		text: "Add the full plugin from npm to your site.",
	},
	config: {
		title: "Add the plugin and the integration",
		text: "In astro.config.mjs the plugin goes into the plugins option of emdash(), and the integration goes after emdash(). Both are needed.",
		own: "Create a D1 database for the analytics tables, add it to your wrangler config next to the EmDash database with the database_id the command printed, and name the binding in the plugin options.",
		postgres:
			"Follow the Hyperdrive section of the install guide first: it creates the Hyperdrive configuration with caching disabled and installs the pg driver. Then name the binding and the engine in the plugin options.",
		postgresLink: "Open the Hyperdrive section",
	},
	layout: {
		title: "Render EmDashHead in your layout",
		text: "The page script reaches your pages only through EmDashHead. Open your layout and check that its head renders it. Without it nothing is counted.",
	},
	cron: {
		title: "Add a Cron Trigger",
		text: "The full plugin builds daily summaries and deletes expired rows and old salts on a schedule, through the scheduled() handler EmDash already uses for scheduled publishing. Add the trigger to wrangler.jsonc. Every minute is recommended; every 15 minutes also works.",
	},
	profile: {
		title: "Choose the capacity profile",
		standard:
			"In Settings, section Data and capacity, keep Capacity profile on Standard, the default. It fits Workers Paid with the analytics tables in the EmDash database.",
		standardNode: "In Settings, section Data and capacity, keep Capacity profile on Standard, the default.",
		dedicated:
			"In Settings, section Data and capacity, set Capacity profile to Dedicated. It is meant for analytics tables in a database of your own.",
		smallNote:
			"Small is for a site on the Workers Free plan only. A site that runs this companion on Cloudflare is on Workers Paid.",
	},
	encryption: {
		title: "Set EMDASH_ENCRYPTION_KEY",
		cloudflare:
			"Search Console and Bing credentials are stored as encrypted settings. Without this key, saving them fails. Generate a key, store it as a Worker secret and keep a backup. It can wait until you connect Search.",
		node: "Search Console and Bing credentials are stored as encrypted settings. Without this key, saving them fails. Generate a key, set it as the environment variable EMDASH_ENCRYPTION_KEY of the server and keep a backup. It can wait until you connect Search.",
	},
	deploy: {
		title: "Deploy and check",
		text: [
			"Redeploy the site, then check four things:",
			"1. The admin sidebar has a folder Analytics.",
			"2. The source of a public page holds one script tag for /_/e.js in its head.",
			"3. /_/e.js on your domain answers 200 with JavaScript.",
			"4. In a private window, the network panel shows one POST to /_/e answered with 204.",
		].join("\n"),
	},
	waf: {
		title: "Add a rate rule for the event path",
		text: "Add a rate limiting rule in front of the site (on Cloudflare a WAF rate limiting rule) for the path /_/e with method POST. Set the threshold well over what a visitor sends: a page view sends two or three small requests. If you change collectPath, change the rule.",
	},
	privacy: {
		title: "Update your privacy page",
		text: "The privacy guide of the full plugin has the text to publish.",
		link: "Open the privacy guide",
	},
} as const;

const configSnippet = (options: string) =>
	[
		"// astro.config.mjs",
		'import { defineConfig } from "astro/config";',
		'import emdash from "emdash/astro";',
		`import cookielessAnalytics from "${PACKAGE_NAME}";`,
		`import cookielessAnalyticsIntegration from "${PACKAGE_NAME}/integration";`,
		"",
		"export default defineConfig({",
		"  integrations: [",
		"    emdash({",
		"      // database, storage and the rest of your EmDash config",
		`      plugins: [cookielessAnalytics(${options})],`,
		"    }),",
		"    cookielessAnalyticsIntegration(),",
		"  ],",
		"});",
	].join("\n");

export const CODE = {
	install: {
		npm: `npm install ${PACKAGE_NAME}`,
		pnpm: `pnpm add ${PACKAGE_NAME}`,
		yarn: `yarn add ${PACKAGE_NAME}`,
	},
	config: {
		emdash: configSnippet(""),
		own: configSnippet('{ database: { binding: "CA_DB" } }'),
		postgres: configSnippet('{ database: { binding: "CA_PG", engine: "postgres" } }'),
	},
	d1Create: "npx wrangler d1 create site-analytics",
	d1Binding: [
		'"d1_databases": [',
		'  { "binding": "DB", "database_name": "site", "database_id": "..." },',
		'  { "binding": "CA_DB", "database_name": "site-analytics", "database_id": "..." }',
		"]",
	].join("\n"),
	layout: [
		"---",
		'import { EmDashHead } from "emdash/ui";',
		'import { createPublicPageContext } from "emdash/page";',
		"",
		'const page = createPublicPageContext({ Astro, kind: "custom", title: Astro.props.title });',
		"---",
		"<html>",
		"  <head>",
		"    <EmDashHead page={page} />",
		"  </head>",
		"  <body><slot /></body>",
		"</html>",
	].join("\n"),
	cron: ["// wrangler.jsonc", "{", '  "triggers": { "crons": ["* * * * *"] }', "}"].join("\n"),
	encryption: {
		cloudflare: "npx emdash secrets generate\nwrangler secret put EMDASH_ENCRYPTION_KEY",
		node: "npx emdash secrets generate",
	},
} as const;

/** `2026-11-18` from epoch milliseconds, in UTC. */
export function formatDate(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function formatNumber(n: number): string {
	return n.toLocaleString("en-US");
}
