/** Typed Block Kit JSON for the setup page. Pure; strings come from copy.ts. */
import type { ActionElement, Block, ButtonElement, FormField, LinkElement } from "@emdash-cms/blocks/server";

import { BENEFITS, ESTIMATE, LABEL, NOTICE, QUESTIONS, formatDate, formatNumber } from "./copy.js";
import type { Estimate } from "./estimate.js";
import { ACTION } from "./interactions.js";
import { FRESH_MS, type FunnelState, type StateRecord } from "./state.js";
import { type Answers, DATABASES, MAX_PAGE_VIEWS, PACKAGE_MANAGERS, PLATFORMS, type Step } from "./steps.js";

export const button = (action_id: string, label: string, style?: ButtonElement["style"]): ButtonElement => ({
	type: "button",
	action_id,
	label,
	...(style ? { style } : {}),
});

/** Links to other admin pages are absolute URLs (`ctx.url()`); Block Kit opens them as external targets. */
export const link = (label: string, url: string): LinkElement => ({ type: "link", label, target: { kind: "external", url } });

export const actions = (...elements: ActionElement[]): Block => ({ type: "actions", elements });

const banner = (title: string, description: string, variant: "default" | "alert"): Block => ({ type: "banner", title, description, variant });

/** The notice of a state and its one call to action, then any secondary buttons. */
export function noticeBlocks(state: FunnelState, r: StateRecord, overviewUrl: string, now: number): Block[] {
	const overview = link(LABEL.openOverview, overviewUrl);
	switch (state) {
		case "not_installed":
			return [banner(NOTICE.not_installed.title, NOTICE.not_installed.text, "default")];
		case "waiting":
			return [
				banner(NOTICE.waiting.title, NOTICE.waiting.text, "default"),
				actions(overview, button(ACTION.markInstalled, LABEL.markInstalled), button(ACTION.backToSteps, LABEL.backToSteps, "secondary")),
			];
		case "connected": {
			// Connected means a fresh matching hello or a manual mark; a fresh hello wins the text.
			const text = r.hello && now - r.hello.at <= FRESH_MS
				? NOTICE.connected.textHello(r.hello.pluginVersion, formatDate(r.hello.at))
				: NOTICE.connected.textManual(formatDate(r.manualAt ?? 0));
			return [banner(NOTICE.connected.title, text, "default"), actions(overview, button(ACTION.startOver, LABEL.startOver, "secondary"))];
		}
		case "version_mismatch":
			return [banner(NOTICE.version_mismatch.title, NOTICE.version_mismatch.text(r.hello?.contractVersion ?? 0), "alert"), actions(overview)];
		case "stale":
			return [
				banner(NOTICE.stale.title(formatDate(r.hello?.at ?? 0)), NOTICE.stale.text, "alert"),
				actions(overview, button(ACTION.startOver, LABEL.startOver, "secondary")),
			];
	}
}

/** The button at the end of the steps in state `not_installed`. */
export const deployedBlock = (): Block => actions(button(ACTION.deployed, LABEL.deployed, "primary"));

export function benefitsBlocks(): Block[] {
	return [{ type: "header", text: BENEFITS.title }, ...BENEFITS.lines.map((text): Block => ({ type: "section", text }))];
}

export function stepBlocks(step: Step, done: boolean): Block[] {
	const out: Block[] = [
		{
			type: "section",
			text: step.title,
			accessory: { type: "toggle", action_id: ACTION.done + step.id, label: LABEL.stepDone, initial_value: done },
		},
		...step.text.split("\n").map((text): Block => ({ type: "context", text })),
	];
	if (step.note) out.push({ type: "context", text: step.note });
	for (const c of step.code) out.push({ type: "code", code: c.code, language: c.language });
	if (step.link) out.push(actions(link(step.link.label, step.link.url)));
	return out;
}

const options = <K extends string>(keys: readonly K[], labels: Record<K, string>) => keys.map((value) => ({ value, label: labels[value] }));

export function answersForm(a: Answers): Block {
	const fields: FormField[] = [
		{
			type: "select",
			action_id: "platform",
			label: QUESTIONS.platform.label,
			options: options(PLATFORMS, QUESTIONS.platform.options),
			initial_value: a.platform,
		},
		{
			type: "select",
			action_id: "packageManager",
			label: QUESTIONS.packageManager.label,
			options: options(PACKAGE_MANAGERS, QUESTIONS.packageManager.options),
			initial_value: a.packageManager,
		},
		{
			type: "select",
			action_id: "database",
			label: QUESTIONS.database.label,
			options: options(DATABASES, QUESTIONS.database.options),
			initial_value: a.database,
			condition: { field: "platform", eq: "cloudflare" },
		},
		{
			type: "number_input",
			action_id: "pageViews",
			label: QUESTIONS.pageViews.label,
			min: 0,
			max: MAX_PAGE_VIEWS,
			...(a.pageViews === null ? {} : { initial_value: a.pageViews }),
		},
	];
	return { type: "form", block_id: "answers", fields, submit: { label: LABEL.saveAnswers, action_id: ACTION.answers } };
}

export function estimateBlocks(e: Estimate | null): Block[] {
	const head: Block = { type: "header", text: ESTIMATE.title };
	if (!e) return [head, { type: "context", text: ESTIMATE.empty }];
	return [
		head,
		{
			type: "stats",
			items: [
				{ label: ESTIMATE.pageViewsPerDay, value: formatNumber(e.pageViewsPerDay) },
				{ label: ESTIMATE.rowsPerDay, value: formatNumber(e.rowsPerDay) },
				{ label: ESTIMATE.profile, value: ESTIMATE.profiles[e.profile] },
			],
		},
		{ type: "section", text: ESTIMATE.advice[e.advice] },
		{ type: "context", text: ESTIMATE.basis },
	];
}
