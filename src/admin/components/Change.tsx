/** The change of a figure against the comparison (`describeChange`): arrow, label, judgment word, detail line. */
import type { ReportResult } from "../../query/reports/index.js";
import { ARROW } from "../../charts/change.js";
import { rangeText } from "../../charts/geometry.js";
import { type Change, changeText, describeChange, type Format, rateBase } from "./format.js";

/**
 * `compact` (table cells, tooltip): arrow and label only, the judgment word for screen readers, nothing for
 * no change or a missing side. Otherwise (cards) the word is visible and the detail sits on a second line.
 */
export function ChangeMark({ c, compact = false }: { c: Change; compact?: boolean }) {
	if (compact && (c.kind === "none" || c.direction === "flat")) return null;
	const word = c.kind === "change" && c.unit !== "positions" && c.judgment !== "neutral" && c.judgment !== null ? c.judgment : null;
	return (
		<span className="ca-delta" data-judge={c.muted ? undefined : (c.judgment ?? undefined)} data-muted={c.muted ? "true" : undefined} title={changeText(c)}>
			<span className="ca-delta-main">
				{c.direction && (
					<span className="ca-delta-arrow" aria-hidden="true">
						{ARROW[c.direction]}
					</span>
				)}
				{c.label}
				{word && <span className={compact ? "ca-sr-only" : "ca-delta-word"}> {word}</span>}
				{c.muted && c.kind === "change" && !compact && <span className="ca-delta-word">, small numbers</span>}
			</span>
			{!compact && c.detail && <span className="ca-delta-detail">{c.detail}</span>}
		</span>
	);
}

/** The change cell of a table row: `prev` is the row's `previous` record (absent with no comparison). */
export function ChangeCell({ metric, value, prev, format }: { metric: string; value: unknown; prev: Record<string, unknown> | null | undefined; format: Format }) {
	if (prev === undefined || typeof value !== "number") return null;
	return <ChangeMark c={describeChange(metric, value, prev?.[metric], { format, base: rateBase(prev) })} compact />;
}

/** What a group of cards is compared with, once per group: `vs previous period (1 Oct to 28 Oct)`. */
export function compareText(r: Pick<ReportResult, "compare" | "compareRange" | "compareSegment"> | null | undefined): string | null {
	if (!r || r.compare === "none" || !r.compare) return null;
	if (r.compare === "segment") return r.compareSegment ? `vs ${r.compareSegment.name}` : null;
	const range = r.compareRange ? ` (${rangeText(r.compareRange.from, r.compareRange.to)})` : "";
	return `${r.compare === "year" ? "vs same period last year" : "vs previous period"}${range}`;
}

export function CompareNote({ result }: { result: Parameters<typeof compareText>[0] }) {
	const t = compareText(result);
	return t ? <p className="ca-kpi-cmp">{t}</p> : null;
}
