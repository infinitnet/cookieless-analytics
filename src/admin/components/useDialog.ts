import { type KeyboardEvent, useEffect, useRef } from "react";

/**
 * Focus handling for the inline dialogs: focus moves into the panel when it opens, Escape closes it,
 * and focus goes back to the control that opened it.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
	const ref = useRef<T>(null);
	useEffect(() => {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		ref.current?.focus();
		return () => {
			if (opener?.isConnected) opener.focus();
		};
	}, []);
	return {
		ref,
		tabIndex: -1,
		onKeyDown: (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		},
	};
}
