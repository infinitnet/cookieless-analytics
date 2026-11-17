/**
 * Ordered tile list of the dashboard editor: a drag handle per tile (pointer events, so mouse,
 * pen and touch) beside the move buttons, which stay the keyboard and screen reader path. Focus returns to the moved
 * tile. The drop slot comes from the pure `dropIndex`, the new order from `reorder`.
 */
import { Button } from "@cloudflare/kumo";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { dropIndex, reorder, slotTarget, type Tile } from "../../dashboards/schema.js";

export interface TileListProps {
	tiles: readonly Tile[];
	/** One line describing the tile. */
	describe: (t: Tile) => string;
	onChange: (tiles: Tile[]) => void;
	onEdit: (id: string) => void;
}

const CSS = `.ca-tilelist li{transition:background-color .15s,transform .15s}.ca-tilelist li[data-dragging]{opacity:.6}
.ca-tilelist li[data-drop-before]{box-shadow:inset 0 2px 0 #2563eb}.ca-tilelist li[data-drop-after]{box-shadow:inset 0 -2px 0 #2563eb}
@media (prefers-reduced-motion: reduce){.ca-tilelist li{transition:none}}`;

export function TileList({ tiles, describe, onChange, onEdit }: TileListProps) {
	const items = useRef(new Map<string, HTMLLIElement>());
	const [focus, setFocus] = useState<string | null>(null);
	const [drag, setDrag] = useState<{ from: number; slot: number } | null>(null);

	useEffect(() => {
		if (focus) items.current.get(focus)?.focus();
		setFocus(null);
	}, [focus]);

	const moveTo = (from: number, to: number) => {
		const id = tiles[from]?.id;
		if (!id || to === from) return;
		onChange(reorder(tiles, from, to));
		setFocus(id);
	};
	const slotAt = (y: number) => dropIndex(tiles.map((t) => items.current.get(t.id)?.getBoundingClientRect() ?? { top: 0, height: 0 }), y);

	const handlers = (i: number) => ({
		onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
			if (e.button !== 0) return;
			e.preventDefault();
			e.currentTarget.setPointerCapture?.(e.pointerId);
			setDrag({ from: i, slot: i });
		},
		onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
			if (drag) setDrag({ from: drag.from, slot: slotAt(e.clientY) });
		},
		onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
			if (!drag) return;
			e.currentTarget.releasePointerCapture?.(e.pointerId);
			const slot = slotAt(e.clientY);
			setDrag(null);
			moveTo(drag.from, slotTarget(drag.from, slot));
		},
		onPointerCancel() {
			setDrag(null);
		},
	});

	return (
		<>
			<style>{CSS}</style>
			<ol aria-label="Tiles" className="ca-tilelist">
				{tiles.map((t, i) => {
					const before = drag && drag.slot === i && drag.slot !== drag.from && drag.slot !== drag.from + 1;
					const after = drag && i === tiles.length - 1 && drag.slot === tiles.length && drag.from !== i;
					return (
						<li
							key={t.id}
							data-tile={t.id}
							tabIndex={-1}
							ref={(el) => {
								if (el) items.current.set(t.id, el);
								else items.current.delete(t.id);
							}}
							{...(drag?.from === i ? { "data-dragging": "" } : {})}
							{...(before ? { "data-drop-before": "" } : {})}
							{...(after ? { "data-drop-after": "" } : {})}
						>
							<button type="button" aria-label="Drag to reorder" title="Drag to reorder" tabIndex={-1} style={{ touchAction: "none", cursor: drag ? "grabbing" : "grab" }} {...handlers(i)}>
								⠿
							</button>{" "}
							{describe(t)}{" "}
							<Button size="sm" aria-label={`Move ${t.id} up`} disabled={i === 0} onClick={() => moveTo(i, i - 1)}>
								Up
							</Button>
							<Button size="sm" aria-label={`Move ${t.id} down`} disabled={i === tiles.length - 1} onClick={() => moveTo(i, i + 1)}>
								Down
							</Button>
							<select aria-label={`Width of ${t.id}`} value={t.w} onChange={(e) => onChange(tiles.map((x, k) => (k === i ? { ...x, w: Number(e.target.value) as Tile["w"] } : x)))}>
								<option value={1}>1</option>
								<option value={2}>2</option>
								<option value={3}>3</option>
							</select>
							<Button size="sm" aria-label={`Edit ${t.id}`} onClick={() => onEdit(t.id)}>
								Edit
							</Button>
							<Button variant="secondary-destructive" size="sm" aria-label={`Remove ${t.id}`} onClick={() => onChange(tiles.filter((_, k) => k !== i))}>
								Remove
							</Button>
						</li>
					);
				})}
			</ol>
		</>
	);
}
