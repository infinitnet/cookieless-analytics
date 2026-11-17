/** Popover of one marker group: text, date, kind and scope per annotation, an actions slot; Escape and outside click close. */
import { Button } from "@cloudflare/kumo";
import { type ReactNode, useEffect, useRef } from "react";
import { KIND_LABELS } from "../../annotations/scope.js";
import type { Marker } from "./Chart.js";
import { adminHref } from "./ReportNotices.js";

/** The marker action of every chart: the annotation's row on the Annotations page (`?a=<id>`, opened there). */
export const annotationAction = (m: { id?: string | undefined }): ReactNode =>
	m.id ? (
		<a className="ca-small" href={adminHref(`/annotations?a=${encodeURIComponent(m.id)}`)}>
			Open in Annotations
		</a>
	) : null;

export interface AnnotationPopoverProps {
	markers: readonly Marker[];
	/** Day or day range of the group. */
	date: string;
	onClose(): void;
	/** Per-annotation actions (`annotationAction`). */
	actions?: ((m: Marker) => ReactNode) | undefined;
}

export function AnnotationPopover({ markers, date, onClose, actions }: AnnotationPopoverProps) {
	const ref = useRef<HTMLDivElement>(null);
	const close = useRef(onClose);
	close.current = onClose;
	useEffect(() => {
		ref.current?.focus();
		const down = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) close.current();
		};
		document.addEventListener("mousedown", down);
		return () => document.removeEventListener("mousedown", down);
	}, []);
	return (
		<div
			ref={ref}
			role="dialog"
			aria-label={`Annotations on ${date}`}
			tabIndex={-1}
			className="ca-popover"
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					e.stopPropagation();
					onClose();
				}
			}}
		>
			<ul>
				{markers.map((m, i) => (
					<li key={m.id ?? `${m.t}-${i}`}>
						<strong>{m.label}</strong>
						<div className="ca-small">
							{m.day ?? m.t}, {KIND_LABELS[m.kind ?? ""] ?? m.kind ?? "Manual"}, {m.summary ?? "Site-wide"}
						</div>
						{actions?.(m)}
					</li>
				))}
			</ul>
			<Button size="sm" onClick={onClose}>
				Close
			</Button>
		</div>
	);
}
