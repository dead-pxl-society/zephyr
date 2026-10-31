import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";
import { useUser } from "@/lib/store/user";
import type { ShortcutConfig } from "@/type";

/**
 * Records global shortcuts and keeps the user store in sync. Shared by the
 * shortcuts settings page and the onboarding shortcut steps so both restore the
 * previous binding the same way when a recording fails.
 */
export function useShortcutConfig() {
	const user = useUser();
	const hasMounted = useRef(false);

	const updateShortcut = useCallback(
		async (action: keyof ShortcutConfig, shortcut: string) => {
			try {
				const result = await invoke<ShortcutConfig>("update_shortcut", {
					action,
					shortcut,
					user,
				});
				emit("ui:update_user", { shortcuts: result });
			} catch {
				invoke("resume_shortcuts", { shortcuts: user?.shortcuts });
			}
		},
		[user],
	);

	useEffect(() => {
		return () => {
			if (hasMounted.current) {
				invoke("resume_shortcuts", { shortcuts: user?.shortcuts });
			}
			hasMounted.current = true;
		};
	}, []);

	return { shortcuts: user?.shortcuts, updateShortcut };
}
