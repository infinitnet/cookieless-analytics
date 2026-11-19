/**
 * Report notices through the shared Notice: the "Summary data" badge with the reasons of the filters summary data
 * cannot apply (also struck through on their chips) and the one-click range fix, then every other notice; report
 * errors with a range the answer names (`raw_only`, `narrow_range`) get that range as their action.
 */
import { Button } from "@cloudflare/kumo";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useState } from "react";
import { ACTIONABLE_NOTICES, filterReason, type NoticeCtx, noticeText, SITE_NOTICES } from "../../charts/caveats.js";
import type { Dim } from "../../query/filters.js";
import { DIM_LABELS } from "./FilterBar.js";
import type { View } from "./Header.js";
import { Notice } from "./ui.js";
import { PLUGIN_ID } from "../../contract.js";
import { retryFailedReports } from "../api.js";

/** Link to an admin page of the plugin (`/pages`, `/sources?tab=sources`). */
export const adminHref = (path: string) => `/_emdash/admin/plugins/${PLUGIN_ID}${path}`;
/** The plugin's Settings page; `?tab=` opens a section (`SETTINGS_SECTIONS` in `src/routes/settings.ts`). */
export const SETTINGS_HREF = adminHref("/settings");
/** Notices about a setting that is off carry the way to its section. */
const SETTING_NOTICES: ReadonlyMap<string, string> = new Map([[SITE_NOTICES.site_search_off, "script"]]);

/** Codes shown inside the summary badge. */
const BADGE = /^(summary|compare_summary|detail_from:|filter_unavailable:)/;

export const noticeCtx = (view?: View): NoticeCtx => ({ label: (d) => DIM_LABELS[d as Dim] ?? d, filtered: view?.state.filters.map((f) => f.dim) ?? [] });

/** Chips the reports of the page could not apply: each panel reports its own, the shell strikes the union through. */
export const OffFilters = createContext<(id: string, off: Record<string, string> | null) => void>(() => {});

/** `dim -> reason` of the `filter_unavailable` notices. */
export function offFilters(notices: readonly string[], ctx: NoticeCtx): Record<string, string> {
	const out: Record<string, string> = {};
	for (const n of notices) {
		const [head, dim = "", reason = ""] = n.split(":");
		if (head === "filter_unavailable" && !out[dim]) out[dim] = filterReason(dim, reason, ctx);
	}
	return out;
}

/** The range a report error names: `narrow_range` ("Choose A to B") or `raw_only` ("Detailed data starts on D"). */
export function errorRange(message: string, to: string): { from: string; to: string; label: string } | null {
	const narrow = /Choose (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(message);
	if (narrow) return { from: narrow[1] as string, to: narrow[2] as string, label: `Show ${narrow[1]} to ${narrow[2]}` };
	const from = /Detailed data starts on (\d{4}-\d{2}-\d{2})\./.exec(message)?.[1];
	return from && from <= to ? { from, to, label: `Show ${from} to ${to} with all filters` } : null;
}

/** Plain words for a raw database or network error; null when the text is already a sentence of ours. */
export function plainError(error: string): string | null {
	if (/overload|busy|D1_ERROR|SQLITE_|timed? ?out/i.test(error)) return "The database is busy. Try again in a moment.";
	if (/Failed to fetch|NetworkError|Load failed/i.test(error)) return "The server could not be reached. Try again in a moment.";
	return null;
}

/** A report error: the range fix when the answer names one, else the plain sentence, the provider text in small type and "Try again" for every failed report on screen. */
export function ReportError({ error, view }: { error: string; view?: View | undefined }) {
	const fix = view ? errorRange(error, view.state.to) : null;
	const plain = plainError(error);
	if (!fix || !view)
		return (
			<Notice tone="error" action={<Button size="sm" onClick={() => retryFailedReports()}>Try again</Button>}>
				{plain ? (
					<>
						{plain} <span className="ca-small ca-err-detail">{error}</span>
					</>
				) : (
					error
				)}
			</Notice>
		);
	return (
		<Notice tone="info" label="Range" action={<Button size="sm" onClick={() => view.update({ from: fix.from, to: fix.to })}>{fix.label}</Button>}>
			{error}
		</Notice>
	);
}

export function ReportNotices({ notices, view }: { notices: readonly string[]; view?: View | undefined }) {
	const ctx = noticeCtx(view);
	const off = offFilters(notices, ctx);
	const report = useContext(OffFilters);
	const id = useId();
	const key = JSON.stringify(off);
	useEffect(() => {
		report(id, Object.keys(off).length ? off : null);
		return () => report(id, null);
	}, [key]);
	const badge = notices.filter((n) => BADGE.test(n));
	const summary = badge.some((n) => n === "summary" || n === "compare_summary");
	const from = badge.find((n) => n.startsWith("detail_from:"))?.slice(12);
	const to = view?.state.to ?? "";
	const fix = view && from && from <= to ? <Button size="sm" onClick={() => view.update({ from, to })}>{`Show ${from} to ${to} with all filters`}</Button> : undefined;
	return (
		<>
			{badge.length > 0 && (
				<Notice tone="info" label={summary ? "Summary data" : undefined} action={fix}>
					{noticeText(badge, ctx).join(" ")}
				</Notice>
			)}
			{noticeText(
				notices.filter((n) => !BADGE.test(n) && !ACTIONABLE_NOTICES.has(n.split(":")[0] ?? "")),
				ctx,
			).map((t) => (
				<Notice key={t} tone="info" label="Note">
					{t}
				</Notice>
			))}
			{noticeText(
				notices.filter((n) => !BADGE.test(n) && ACTIONABLE_NOTICES.has(n.split(":")[0] ?? "")),
				ctx,
			).map((t) => (
				<Notice key={t} tone="warning" action={SETTING_NOTICES.has(t) ? <a href={`${SETTINGS_HREF}?tab=${SETTING_NOTICES.get(t)}`}>Open plugin settings</a> : undefined}>
					{t}
				</Notice>
			))}
		</>
	);
}

/** Report errors of a page: panels and charts hand theirs to the scope, which shows each distinct text once on top. */
const PageErrors = createContext<((id: string, error: string | null) => void) | null>(null);

/** Hands `error` to the page's error scope; true inside a scope (the caller then shows only "Not loaded."). */
export function usePageError(error: string | null | undefined): boolean {
	const sink = useContext(PageErrors);
	const id = useId();
	useEffect(() => {
		if (!sink) return;
		sink(id, error ?? null);
		return () => sink(id, null);
	}, [sink, error]);
	return sink !== null;
}

/** The reports below share one error notice per distinct text, above them, instead of one per panel. */
export function ErrorScope({ view, children }: { view?: View | undefined; children: ReactNode }) {
	const [errors, setErrors] = useState<Record<string, string>>({});
	const sink = useCallback((id: string, e: string | null) => setErrors(({ [id]: _, ...rest }) => (e ? { ...rest, [id]: e } : rest)), []);
	return (
		<PageErrors.Provider value={sink}>
			{[...new Set(Object.values(errors))].map((e) => (
				<ReportError key={e} error={e} view={view} />
			))}
			{children}
		</PageErrors.Provider>
	);
}
