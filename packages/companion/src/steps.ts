/** The four setup answers and the install steps they produce. Pure. */
import { CODE, STEPS } from "./copy.js";
import { DOC_URLS } from "./full.js";

export const PLATFORMS = ["cloudflare", "node"] as const;
export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn"] as const;
export const DATABASES = ["emdash", "own", "postgres"] as const;
export const MAX_PAGE_VIEWS = 1_000_000_000;

export type Platform = (typeof PLATFORMS)[number];
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];
export type Database = (typeof DATABASES)[number];

export interface Answers {
	platform: Platform;
	packageManager: PackageManager;
	database: Database;
	/** Expected page views per month; null until answered. */
	pageViews: number | null;
}

export const DEFAULT_ANSWERS: Answers = { platform: "cloudflare", packageManager: "npm", database: "emdash", pageViews: null };

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Answers from untrusted input (a stored record or form values); null when any field is wrong. */
export function parseAnswers(v: unknown): Answers | null {
	if (typeof v !== "object" || v === null) return null;
	const a = v as Record<string, unknown>;
	if (!oneOf(PLATFORMS, a.platform) || !oneOf(PACKAGE_MANAGERS, a.packageManager) || !oneOf(DATABASES, a.database)) return null;
	const pv = a.pageViews ?? null;
	if (pv !== null && (typeof pv !== "number" || !Number.isInteger(pv) || pv < 0 || pv > MAX_PAGE_VIEWS)) return null;
	return { platform: a.platform, packageManager: a.packageManager, database: a.database, pageViews: pv };
}

/** An own D1 database and Hyperdrive are Cloudflare bindings, so on Node the tables stay in the EmDash database. */
export function effectiveDatabase(a: Answers): Database {
	return a.platform === "node" ? "emdash" : a.database;
}

export type StepId = "install" | "config" | "layout" | "cron" | "profile" | "encryption" | "deploy" | "waf" | "privacy";
export const STEP_IDS: readonly StepId[] = ["install", "config", "layout", "cron", "profile", "encryption", "deploy", "waf", "privacy"];

export interface Snippet {
	code: string;
	language: "bash" | "ts" | "tsx" | "jsonc";
}

export interface Step {
	id: StepId;
	title: string;
	text: string;
	note?: string;
	code: Snippet[];
	link?: { label: string; url: string };
}

export function buildSteps(a: Answers): Step[] {
	const cf = a.platform === "cloudflare";
	const db = effectiveDatabase(a);
	const steps: Step[] = [
		{ id: "install", title: STEPS.install.title, text: STEPS.install.text, code: [{ code: CODE.install[a.packageManager], language: "bash" }] },
	];

	const config: Step = { id: "config", title: STEPS.config.title, text: STEPS.config.text, code: [] };
	if (db === "own") {
		config.note = STEPS.config.own;
		config.code.push({ code: CODE.d1Create, language: "bash" }, { code: CODE.d1Binding, language: "jsonc" });
	} else if (db === "postgres") {
		config.note = STEPS.config.postgres;
		config.link = { label: STEPS.config.postgresLink, url: DOC_URLS.hyperdrive };
	}
	config.code.push({ code: CODE.config[db], language: "ts" });
	steps.push(config);

	steps.push({ id: "layout", title: STEPS.layout.title, text: STEPS.layout.text, code: [{ code: CODE.layout, language: "tsx" }] });
	if (cf) steps.push({ id: "cron", title: STEPS.cron.title, text: STEPS.cron.text, code: [{ code: CODE.cron, language: "jsonc" }] });

	const profile: Step = { id: "profile", title: STEPS.profile.title, text: STEPS.profile.standardNode, code: [] };
	if (db !== "emdash") profile.text = STEPS.profile.dedicated;
	else if (cf) Object.assign(profile, { text: STEPS.profile.standard, note: STEPS.profile.smallNote });
	steps.push(profile);

	steps.push(
		{
			id: "encryption",
			title: STEPS.encryption.title,
			text: STEPS.encryption[a.platform],
			code: [{ code: CODE.encryption[a.platform], language: "bash" }],
		},
		{ id: "deploy", title: STEPS.deploy.title, text: STEPS.deploy.text, code: [] },
		{ id: "waf", title: STEPS.waf.title, text: STEPS.waf.text, code: [] },
		{
			id: "privacy",
			title: STEPS.privacy.title,
			text: STEPS.privacy.text,
			code: [],
			link: { label: STEPS.privacy.link, url: DOC_URLS.privacy },
		},
	);
	return steps;
}
