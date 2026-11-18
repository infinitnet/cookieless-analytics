/** Hand written guards for the Block Kit interactions the setup page receives. Null means not recognised. */
import { type StateRecord, backToSteps, declareDeployed, markInstalled, setAnswers, setDone, startOver } from "./state.js";
import { type Answers, STEP_IDS, type StepId, parseAnswers } from "./steps.js";

export const ACTION = {
	answers: "answers",
	deployed: "deployed",
	markInstalled: "mark_installed",
	startOver: "start_over",
	backToSteps: "back_to_steps",
	/** Prefix of a step's "Done" toggle: `done:<step id>`. */
	done: "done:",
} as const;

export type Interaction =
	| { kind: "load" }
	| { kind: "answers"; answers: Answers }
	| { kind: "deployed" | "mark_installed" | "start_over" | "back_to_steps" }
	| { kind: "done"; step: StepId; done: boolean };

const SIMPLE = [ACTION.deployed, ACTION.markInstalled, ACTION.startOver, ACTION.backToSteps] as const;

export function parseInteraction(input: unknown): Interaction | null {
	if (typeof input !== "object" || input === null) return null;
	const i = input as Record<string, unknown>;
	if (i.type === "page_load") return typeof i.page === "string" ? { kind: "load" } : null;
	if (typeof i.action_id !== "string") return null;
	const id = i.action_id;

	if (i.type === "form_submit") {
		if (id !== ACTION.answers || typeof i.values !== "object" || i.values === null) return null;
		const answers = parseAnswers(i.values);
		return answers ? { kind: "answers", answers } : null;
	}
	if (i.type !== "block_action") return null;
	const simple = SIMPLE.find((a) => a === id);
	if (simple) return { kind: simple };
	if (id.startsWith(ACTION.done) && typeof i.value === "boolean") {
		const step = STEP_IDS.find((s) => ACTION.done + s === id);
		if (step) return { kind: "done", step, done: i.value };
	}
	return null;
}

/** The record after an interaction; a page load returns the record unchanged (no write needed). */
export function applyInteraction(r: StateRecord, i: Interaction, now: number): StateRecord {
	switch (i.kind) {
		case "load":
			return r;
		case "answers":
			return setAnswers(r, i.answers);
		case "deployed":
			return declareDeployed(r, now);
		case "mark_installed":
			return markInstalled(r, now);
		case "start_over":
			return startOver(r);
		case "back_to_steps":
			return backToSteps(r);
		case "done":
			return setDone(r, i.step, i.done);
	}
}
