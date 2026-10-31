import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

/**
 * Tracks whether the Tauri window holds focus. Canvas animations keep burning
 * GPU while the user is in another app, so anything expensive should idle on
 * `false` and pick back up on `true`.
 */
export const useWindowActive = (): boolean => {
	const [active, setActive] = useState(true);

	useEffect(() => {
		const unlisten = getCurrentWindow().onFocusChanged(
			({ payload: focused }) => {
				setActive(focused);
			},
		);

		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	return active;
};
