import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";
import { useStateRef } from "./use-state-ref";

type DragDropProps = {
	onDrop: (paths: string[]) => void;
};

export const useWindowDragDrop = ({ onDrop }: DragDropProps) => {
	const [dragging, setDragging, draggingRef] = useStateRef(false);

	const didSetListeners = useRef(false);
	const unlistenForDragDrop = useRef<UnlistenFn>(null);

	const listenForDragDrop = useCallback(async () => {
		unlistenForDragDrop.current = await getCurrentWindow().onDragDropEvent(
			(event) => {
				if (event.payload.type === "over") {
					if (!draggingRef.current) setDragging(true);
				} else if (event.payload.type === "drop") {
					const paths = event.payload.paths;
					setDragging(false);
					setTimeout(() => {
						onDrop(paths);
					}, 160);
				} else {
					setDragging(false);
				}
			},
		);
	}, []);

	useEffect(() => {
		if (!didSetListeners.current) {
			didSetListeners.current = true;
			listenForDragDrop();
		}

		return () => {
			if (unlistenForDragDrop.current) {
				unlistenForDragDrop.current();
				unlistenForDragDrop.current = null;
			}
		};
	}, []);

	return dragging;
};
