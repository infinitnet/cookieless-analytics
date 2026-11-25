/**
 * One KPI with its change against the comparison (`describeChange`). A selectable card is one toggle button
 * over the whole card: label, value and change inside, so the name reads "Visitors 820, up 12.0
 * percent, better, +88, from 732"; the info mark is a sibling in the corner. The sparkline never draws the
 * comparison (the chart owns comparison lines). A charted card carries its series slot: a top border in the slot
 * color and the slot shape.
 */
import type { CSSProperties, ReactNode } from "react";
import { slotColor } from "../../charts/geometry.js";
import { SlotShape, Sparkline } from "./Chart.js";
import { ChangeMark } from "./Change.js";
import { type Change, describeChange, fmt, type Format, rateBase } from "./format.js";
import { metricDefinition } from "../../charts/definitions.js";
import { InfoMark } from "./ui.js";

export interface KpiCardProps {
	metric: string;
	label: string;
	value: number | null | undefined;
	format: Format;
	/** The comparison's figures (`compareTotals`): absent with no comparison, null when the other side has none. */
	compare?: Record<string, unknown> | null | undefined;
	trend?: readonly number[] | undefined;
	active?: boolean;
	/** Series slot of an active card on a multi series chart: color and shape. */
	slot?: number | undefined;
	/** "Left axis" or "Right axis" of the charted series, as hidden text and a tooltip on the chip. */
	axis?: string | undefined;
	/** A fall is good news (defaults to the shared list). */
	lowerIsBetter?: boolean | undefined;
	/** Loading or no data: the toggle is off. */
	disabled?: boolean | undefined;
	onSelect?: (e: { shiftKey: boolean; altKey: boolean }) => void;
	/** The card's own definition when it means less than the metric key in general (Links: sessions with a click); default `metricDefinition(metric)`. */
	info?: string | undefined;
	/**
	 * The change when its owner computes it (a dashboard tile: `tileChange`, which gives no change against a low sample
	 * Score); default `describeChange` of `value` against `compare`.
	 */
	change?: Change | null | undefined;
}

export function KpiCard({ metric, label, value, format, compare, trend, active, slot, axis, lowerIsBetter, disabled, onSelect, info, change }: KpiCardProps) {
	const c = change !== undefined ? change : compare === undefined || value === undefined ? null : describeChange(metric, value, compare?.[metric], { format, base: rateBase(compare), lowerIsBetter });
	const chip = active && slot !== undefined;
	const def = info ?? metricDefinition(metric);
	const name = [`${label} ${fmt(value, format)}`, c?.words, c?.detail].filter(Boolean).join(", ");
	const body: ReactNode = (
		<>
			<span className="ca-kpi-label">
				{chip && (
					<span className="ca-kpi-chip" title={axis}>
						<SlotShape slot={slot} />
						{axis && <span className="ca-sr-only">{axis}</span>}
					</span>
				)}
				{label}
			</span>
			<span className="ca-kpi-value">{fmt(value, format)}</span>
			{c && <ChangeMark c={c} />}
			{trend && trend.length > 1 && <Sparkline values={trend} label={`${label} trend`} />}
		</>
	);
	return (
		<div
			className="ca-kpi"
			data-metric={metric}
			data-active={active ? "true" : undefined}
			data-selectable={onSelect ? "true" : undefined}
			style={chip ? ({ "--ca-slot": slotColor(slot) } as CSSProperties) : undefined}
			data-slot={chip ? slot : undefined}
		>
			{onSelect ? (
				<button type="button" className="ca-kpi-btn" aria-pressed={!!active} aria-label={name} disabled={disabled} onClick={(e) => onSelect(e)}>
					{body}
				</button>
			) : (
				<div className="ca-kpi-btn">
					{body}
				</div>
			)}
			{def && <InfoMark text={def} />}
		</div>
	);
}
