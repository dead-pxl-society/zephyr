import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useUserStore } from "@/lib/store/user";

export type NotificationOptions = {
	/** Showing another notification with the same id replaces this one. */
	id?: string;
	title: string;
	body?: string;
	actions?: { id: string; label: string; destructive?: boolean }[];
	persistent?: boolean;
	/** Shows a progress bar starting at this fraction, from 0 to 1. */
	progress?: number;
};

export function isPermissionGranted() {
	return invoke<boolean>("notification_permission");
}

export function requestPermission() {
	return invoke<boolean>("request_notification_permission");
}

async function checkPermission() {
	return (await isPermissionGranted()) || (await requestPermission());
}

export async function openNotificationSettings() {
	await invoke("open_notification_settings");
}

/** Returns whether a notification was actually shown. */
export async function sendNotification(
	options: NotificationOptions,
): Promise<boolean> {
	if (useUserStore.getState().user?.notifications === false) return false;

	try {
		const isFocused = await getCurrentWebviewWindow().isFocused();
		if (isFocused) return false;
		if (!(await checkPermission())) return false;

		return await invoke<boolean>("show_notification", {
			request: { id: crypto.randomUUID(), ...options },
		});
	} catch (e) {
		console.error("[notify] couldn't show notification", e);
		return false;
	}
}

export function closeNotification(id: string) {
	invoke("close_notification", { id }).catch((e) => {
		console.error("[notify] couldn't close notification", e);
	});
}

/** A notification's button was pressed. Only delivered to the main window. */
export function onNotificationAction(
	handler: (action: { id: string; actionId: string }) => void,
) {
	return listen<{ id: string; actionId: string }>(
		"notification:action",
		(event) => handler(event.payload),
	);
}
