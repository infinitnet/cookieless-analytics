/** Route `admin`: the setup page. `setupPage` is pure; `handleAdmin` adds one KV read and at most one write. */
import type { Block, BlockResponse } from "@emdash-cms/blocks/server";
import type { PluginContext, SandboxedRouteContext } from "emdash/plugin";

import { answersForm, benefitsBlocks, deployedBlock, estimateBlocks, noticeBlocks, stepBlocks } from "../blocks.js";
import { ERROR, LOG, PAGE_TITLE, QUESTIONS, STEPS, TOAST } from "../copy.js";
import { estimate } from "../estimate.js";
import { OVERVIEW_PATH } from "../full.js";
import { applyInteraction, parseInteraction } from "../interactions.js";
import { type StateRecord, defaultRecord, funnelState, readRecord, writeRecord } from "../state.js";
import { buildSteps } from "../steps.js";

export interface PageOptions {
	now: number;
	overviewUrl: string;
	readFailed?: boolean;
	saveFailed?: boolean;
}

const alert = (description: string): Block => ({ type: "banner", description, variant: "alert" });

export function setupPage(r: StateRecord, o: PageOptions): Block[] {
	const state = funnelState(r, o.now);
	const out: Block[] = [{ type: "header", text: PAGE_TITLE }];
	if (o.readFailed) out.push(alert(ERROR.readFailed));
	if (o.saveFailed) out.push(alert(ERROR.saveFailed));
	out.push(...noticeBlocks(state, r, o.overviewUrl, o.now));
	// Waiting, connected and out of date are a status only; the steps show while the full plugin is absent.
	if (state !== "not_installed" && state !== "stale") return out;
	if (state === "not_installed") out.push(...benefitsBlocks());
	out.push({ type: "header", text: QUESTIONS.title }, answersForm(r.answers), ...estimateBlocks(estimate(r.answers)));
	out.push({ type: "header", text: STEPS.title }, ...buildSteps(r.answers).flatMap((s) => stepBlocks(s, r.done.includes(s.id))));
	if (state === "not_installed") out.push(deployedBlock());
	return out;
}

export async function handleAdmin(routeCtx: Pick<SandboxedRouteContext, "input">, ctx: PluginContext, now = Date.now()): Promise<BlockResponse> {
	const o: PageOptions = { now, overviewUrl: ctx.url(OVERVIEW_PATH) };
	let r: StateRecord;
	try {
		r = await readRecord(ctx.kv);
	} catch {
		ctx.log.warn(LOG.read);
		r = defaultRecord();
		o.readFailed = true;
	}

	const i = parseInteraction(routeCtx.input);
	if (!i) return { blocks: setupPage(r, o), toast: { message: ERROR.unknownAction, type: "error" } };
	if (i.kind === "load") return { blocks: setupPage(r, o) };

	// Never write over a record that could not be read: that would drop the stored progress.
	if (o.readFailed) return { blocks: setupPage(r, { ...o, saveFailed: true }) };
	const next = applyInteraction(r, i, now);
	try {
		await writeRecord(ctx.kv, next);
	} catch {
		ctx.log.warn(LOG.write);
		return { blocks: setupPage(r, { ...o, saveFailed: true }) };
	}
	const page: BlockResponse = { blocks: setupPage(next, o) };
	if (i.kind === "answers") page.toast = { message: TOAST.answersSaved, type: "success" };
	return page;
}
