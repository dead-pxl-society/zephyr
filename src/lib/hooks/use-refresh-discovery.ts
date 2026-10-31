import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { toastError } from "@/lib/errors";
import { hydrateFamilyStore } from "@/lib/store/family";
import { hydratePeerStore } from "@/lib/store/peers";

/** Long enough that the spinner reads as "something happened", even when the
 * backend answers instantly; the real rediscovery continues through events. */
const MIN_SPIN_MS = 1500;

/**
 * Rebuilds device discovery on demand: a fresh mDNS socket and a fresh gossip
 * membership on the backend, then a reload of the peer and family stores.
 */
export const useRefreshDiscovery = () => {
	const [refreshing, setRefreshing] = useState(false);
	const busyRef = useRef(false);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const refresh = useCallback(async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		setRefreshing(true);

		const started = Date.now();

		try {
			await invoke("refresh_discovery_cmd");
			await Promise.all([hydratePeerStore(), hydrateFamilyStore()]);
		} catch (e) {
			toastError(e, "errors:refresh_failed");
		}

		const remaining = MIN_SPIN_MS - (Date.now() - started);
		if (remaining > 0) {
			await new Promise((resolve) => setTimeout(resolve, remaining));
		}

		busyRef.current = false;
		if (mountedRef.current) setRefreshing(false);
	}, []);

	return { refresh, refreshing };
};
