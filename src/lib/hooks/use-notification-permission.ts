import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import {
	getPermission,
	type NotificationPermission,
	requestPermission,
} from "@/lib/notify";

/**
 * The OS notification permission, checked again whenever the window regains focus, so
 * a change made in system settings shows up as soon as the user comes back.
 */
export const useNotificationPermission = ({
	requestOnMount = false,
}: {
	requestOnMount?: boolean;
} = {}) => {
	const [permission, setPermission] = useState<NotificationPermission | null>(
		null,
	);

	const refresh = useCallback(async () => {
		try {
			setPermission(await getPermission());
		} catch (e) {
			console.error("[notify] couldn't read permission", e);
		}
	}, []);

	const request = useCallback(async () => {
		try {
			setPermission(await requestPermission());
		} catch (e) {
			console.error("[notify] couldn't request permission", e);
		}
	}, []);

	useEffect(() => {
		if (requestOnMount) request();
		else refresh();

		const unlisten = getCurrentWindow().onFocusChanged(({ payload }) => {
			if (payload) refresh();
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, [requestOnMount, request, refresh]);

	return { permission, granted: permission === "granted", request };
};
